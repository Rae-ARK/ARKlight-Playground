import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { TokenQuality, TokenStore } from "../../../common/model/tokens/treeSitter/tokenStore.js";
suite("TokenStore", () => {
  let textModel;
  ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    textModel = {
      getValueLength: () => 11
    };
  });
  test("constructs with empty model", () => {
    const store = new TokenStore(textModel);
    assert.ok(store.root);
    assert.strictEqual(store.root.length, textModel.getValueLength());
  });
  test("builds store with single token", () => {
    const store = new TokenStore(textModel);
    store.buildStore([{
      startOffsetInclusive: 0,
      length: 5,
      token: 1
    }], TokenQuality.Accurate);
    assert.strictEqual(store.root.length, 5);
  });
  test("builds store with multiple tokens", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 4, token: 3 }
    ], TokenQuality.Accurate);
    assert.ok(store.root);
    assert.strictEqual(store.root.length, 10);
  });
  test("creates balanced tree structure", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 2, token: 1 },
      { startOffsetInclusive: 2, length: 2, token: 2 },
      { startOffsetInclusive: 4, length: 2, token: 3 },
      { startOffsetInclusive: 6, length: 2, token: 4 }
    ], TokenQuality.Accurate);
    const root = store.root;
    assert.ok(root.children);
    assert.strictEqual(root.children.length, 2);
    assert.strictEqual(root.children[0].length, 4);
    assert.strictEqual(root.children[1].length, 4);
  });
  test("creates deep tree structure", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 1, token: 1 },
      { startOffsetInclusive: 1, length: 1, token: 2 },
      { startOffsetInclusive: 2, length: 1, token: 3 },
      { startOffsetInclusive: 3, length: 1, token: 4 },
      { startOffsetInclusive: 4, length: 1, token: 5 },
      { startOffsetInclusive: 5, length: 1, token: 6 },
      { startOffsetInclusive: 6, length: 1, token: 7 },
      { startOffsetInclusive: 7, length: 1, token: 8 }
    ], TokenQuality.Accurate);
    const root = store.root;
    assert.ok(root.children);
    assert.strictEqual(root.children.length, 2);
    assert.ok(root.children[0].children);
    assert.strictEqual(root.children[0].children.length, 2);
    assert.ok(root.children[0].children[0].children);
    assert.strictEqual(root.children[0].children[0].children.length, 2);
  });
  test("updates single token in middle", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    store.update(3, [
      { startOffsetInclusive: 3, length: 3, token: 4 }
    ], TokenQuality.Accurate);
    const tokens = store.root;
    assert.strictEqual(tokens.children[0].token, 1);
    assert.strictEqual(tokens.children[1].token, 4);
    assert.strictEqual(tokens.children[2].token, 3);
  });
  test("updates multiple consecutive tokens", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    store.update(6, [
      { startOffsetInclusive: 3, length: 3, token: 4 },
      { startOffsetInclusive: 6, length: 3, token: 5 }
    ], TokenQuality.Accurate);
    const tokens = store.root;
    assert.strictEqual(tokens.children[0].token, 1);
    assert.strictEqual(tokens.children[1].token, 4);
    assert.strictEqual(tokens.children[2].token, 5);
  });
  test("updates tokens at start of document", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    store.update(3, [
      { startOffsetInclusive: 0, length: 3, token: 4 }
    ], TokenQuality.Accurate);
    const tokens = store.root;
    assert.strictEqual(tokens.children[0].token, 4);
    assert.strictEqual(tokens.children[1].token, 2);
    assert.strictEqual(tokens.children[2].token, 3);
  });
  test("updates tokens at end of document", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    store.update(3, [
      { startOffsetInclusive: 6, length: 3, token: 4 }
    ], TokenQuality.Accurate);
    const tokens = store.root;
    assert.strictEqual(tokens.children[0].token, 1);
    assert.strictEqual(tokens.children[1].token, 2);
    assert.strictEqual(tokens.children[2].token, 4);
  });
  test("updates length of tokens", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    store.update(6, [
      { startOffsetInclusive: 3, length: 5, token: 4 }
    ], TokenQuality.Accurate);
    const tokens = store.root;
    assert.strictEqual(tokens.children[0].token, 1);
    assert.strictEqual(tokens.children[0].length, 3);
    assert.strictEqual(tokens.children[1].token, 4);
    assert.strictEqual(tokens.children[1].length, 5);
  });
  test("update deeply nested tree with new token length in the middle", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 1, token: 1 },
      { startOffsetInclusive: 1, length: 1, token: 2 },
      { startOffsetInclusive: 2, length: 1, token: 3 },
      { startOffsetInclusive: 3, length: 1, token: 4 },
      { startOffsetInclusive: 4, length: 1, token: 5 },
      { startOffsetInclusive: 5, length: 1, token: 6 },
      { startOffsetInclusive: 6, length: 1, token: 7 },
      { startOffsetInclusive: 7, length: 1, token: 8 }
    ], TokenQuality.Accurate);
    store.update(3, [
      { startOffsetInclusive: 3, length: 3, token: 9 }
    ], TokenQuality.Accurate);
    const root = store.root;
    assert.strictEqual(root.children.length, 3);
    assert.strictEqual(root.children[0].children.length, 2);
    assert.strictEqual(root.children[0].length, 2);
    assert.strictEqual(root.children[1].length, 4);
    assert.strictEqual(root.children[2].length, 2);
  });
  test("update deeply nested tree with a range of tokens that causes tokens to split", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 4, token: 3 },
      { startOffsetInclusive: 10, length: 5, token: 4 },
      { startOffsetInclusive: 15, length: 4, token: 5 },
      { startOffsetInclusive: 19, length: 3, token: 6 },
      { startOffsetInclusive: 22, length: 5, token: 7 },
      { startOffsetInclusive: 27, length: 3, token: 8 }
    ], TokenQuality.Accurate);
    store.update(8, [
      { startOffsetInclusive: 12, length: 4, token: 9 },
      { startOffsetInclusive: 16, length: 4, token: 10 }
    ], TokenQuality.Accurate);
    const root = store.root;
    assert.strictEqual(root.children.length, 2);
    assert.strictEqual(root.children[0].children.length, 2);
    assert.strictEqual(root.children[0].length, 12);
    assert.strictEqual(root.children[1].length, 18);
  });
  test("getTokensInRange returns tokens in middle of document", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    const tokens = store.getTokensInRange(3, 6);
    assert.deepStrictEqual(tokens, [{ startOffsetInclusive: 3, length: 3, token: 2 }]);
  });
  test("getTokensInRange returns tokens at start of document", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    const tokens = store.getTokensInRange(0, 3);
    assert.deepStrictEqual(tokens, [{ startOffsetInclusive: 0, length: 3, token: 1 }]);
  });
  test("getTokensInRange returns tokens at end of document", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    const tokens = store.getTokensInRange(6, 9);
    assert.deepStrictEqual(tokens, [{ startOffsetInclusive: 6, length: 3, token: 3 }]);
  });
  test("getTokensInRange returns multiple tokens across nodes", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 1, token: 1 },
      { startOffsetInclusive: 1, length: 1, token: 2 },
      { startOffsetInclusive: 2, length: 1, token: 3 },
      { startOffsetInclusive: 3, length: 1, token: 4 },
      { startOffsetInclusive: 4, length: 1, token: 5 },
      { startOffsetInclusive: 5, length: 1, token: 6 }
    ], TokenQuality.Accurate);
    const tokens = store.getTokensInRange(2, 5);
    assert.deepStrictEqual(tokens, [
      { startOffsetInclusive: 2, length: 1, token: 3 },
      { startOffsetInclusive: 3, length: 1, token: 4 },
      { startOffsetInclusive: 4, length: 1, token: 5 }
    ]);
  });
  test("Realistic scenario one", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 164164 },
      { startOffsetInclusive: 3, length: 1, token: 32836 },
      { startOffsetInclusive: 4, length: 3, token: 164164 },
      { startOffsetInclusive: 7, length: 2, token: 32836 },
      { startOffsetInclusive: 9, length: 5, token: 196676 },
      { startOffsetInclusive: 14, length: 1, token: 32836 },
      { startOffsetInclusive: 15, length: 2, token: 557124 },
      { startOffsetInclusive: 17, length: 4, token: 32836 },
      { startOffsetInclusive: 21, length: 1, token: 32836 },
      { startOffsetInclusive: 22, length: 11, token: 196676 },
      { startOffsetInclusive: 33, length: 7, token: 32836 },
      { startOffsetInclusive: 40, length: 3, token: 32836 }
    ], TokenQuality.Accurate);
    store.update(33, [
      { startOffsetInclusive: 9, length: 5, token: 196676 },
      { startOffsetInclusive: 14, length: 1, token: 32836 },
      { startOffsetInclusive: 15, length: 2, token: 557124 },
      { startOffsetInclusive: 17, length: 4, token: 32836 },
      { startOffsetInclusive: 21, length: 1, token: 32836 },
      { startOffsetInclusive: 22, length: 11, token: 196676 },
      { startOffsetInclusive: 33, length: 8, token: 32836 },
      { startOffsetInclusive: 41, length: 3, token: 32836 }
    ], TokenQuality.Accurate);
  });
  test("Realistic scenario two", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 5, token: 196676 },
      { startOffsetInclusive: 5, length: 1, token: 32836 },
      { startOffsetInclusive: 6, length: 1, token: 557124 },
      { startOffsetInclusive: 7, length: 4, token: 32836 },
      { startOffsetInclusive: 11, length: 3, token: 32836 },
      { startOffsetInclusive: 14, length: 3, token: 32836 },
      { startOffsetInclusive: 17, length: 5, token: 196676 },
      { startOffsetInclusive: 22, length: 1, token: 32836 },
      { startOffsetInclusive: 23, length: 1, token: 557124 },
      { startOffsetInclusive: 24, length: 4, token: 32836 },
      { startOffsetInclusive: 28, length: 2, token: 32836 },
      { startOffsetInclusive: 30, length: 1, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens0 = store.getTokensInRange(0, 16);
    assert.deepStrictEqual(tokens0, [
      { token: 196676, startOffsetInclusive: 0, length: 5 },
      { token: 32836, startOffsetInclusive: 5, length: 1 },
      { token: 557124, startOffsetInclusive: 6, length: 1 },
      { token: 32836, startOffsetInclusive: 7, length: 4 },
      { token: 32836, startOffsetInclusive: 11, length: 3 },
      { token: 32836, startOffsetInclusive: 14, length: 2 }
    ]);
    store.update(14, [
      { startOffsetInclusive: 0, length: 5, token: 196676 },
      { startOffsetInclusive: 5, length: 1, token: 32836 },
      { startOffsetInclusive: 6, length: 1, token: 557124 },
      { startOffsetInclusive: 7, length: 4, token: 32836 },
      { startOffsetInclusive: 11, length: 2, token: 32836 },
      { startOffsetInclusive: 13, length: 3, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens = store.getTokensInRange(0, 16);
    assert.deepStrictEqual(tokens, [
      { token: 196676, startOffsetInclusive: 0, length: 5 },
      { token: 32836, startOffsetInclusive: 5, length: 1 },
      { token: 557124, startOffsetInclusive: 6, length: 1 },
      { token: 32836, startOffsetInclusive: 7, length: 4 },
      { token: 32836, startOffsetInclusive: 11, length: 2 },
      { token: 32836, startOffsetInclusive: 13, length: 3 }
    ]);
  });
  test("Realistic scenario three", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 5, token: 164164 },
      { startOffsetInclusive: 5, length: 1, token: 32836 },
      { startOffsetInclusive: 6, length: 5, token: 164164 },
      { startOffsetInclusive: 11, length: 2, token: 32836 },
      { startOffsetInclusive: 13, length: 5, token: 196676 },
      { startOffsetInclusive: 18, length: 1, token: 32836 },
      { startOffsetInclusive: 19, length: 12, token: 557124 },
      { startOffsetInclusive: 31, length: 4, token: 32836 },
      { startOffsetInclusive: 35, length: 1, token: 32836 },
      { startOffsetInclusive: 36, length: 11, token: 196676 },
      { startOffsetInclusive: 47, length: 3, token: 32836 },
      { startOffsetInclusive: 50, length: 2, token: 32836 },
      { startOffsetInclusive: 52, length: 7, token: 327748 },
      { startOffsetInclusive: 59, length: 1, token: 98372 },
      { startOffsetInclusive: 60, length: 1, token: 32836 },
      { startOffsetInclusive: 61, length: 19, token: 557124 },
      { startOffsetInclusive: 80, length: 1, token: 32836 },
      { startOffsetInclusive: 81, length: 2, token: 32836 },
      { startOffsetInclusive: 83, length: 6, token: 32836 },
      { startOffsetInclusive: 89, length: 4, token: 32836 },
      { startOffsetInclusive: 93, length: 3, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens0 = store.getTokensInRange(36, 59);
    assert.deepStrictEqual(tokens0, [
      { token: 196676, startOffsetInclusive: 36, length: 11 },
      { token: 32836, startOffsetInclusive: 47, length: 3 },
      { token: 32836, startOffsetInclusive: 50, length: 2 },
      { token: 327748, startOffsetInclusive: 52, length: 7 }
    ]);
    store.update(82, [
      { startOffsetInclusive: 13, length: 5, token: 196676 },
      { startOffsetInclusive: 18, length: 1, token: 32836 },
      { startOffsetInclusive: 19, length: 12, token: 557124 },
      { startOffsetInclusive: 31, length: 4, token: 32836 },
      { startOffsetInclusive: 35, length: 1, token: 32836 },
      { startOffsetInclusive: 36, length: 11, token: 196676 },
      { startOffsetInclusive: 47, length: 3, token: 32836 },
      { startOffsetInclusive: 50, length: 2, token: 32836 },
      { startOffsetInclusive: 52, length: 7, token: 327748 },
      { startOffsetInclusive: 59, length: 1, token: 98372 },
      { startOffsetInclusive: 60, length: 1, token: 32836 },
      { startOffsetInclusive: 61, length: 19, token: 557124 },
      { startOffsetInclusive: 80, length: 1, token: 32836 },
      { startOffsetInclusive: 81, length: 2, token: 32836 },
      { startOffsetInclusive: 83, length: 7, token: 32836 },
      { startOffsetInclusive: 90, length: 4, token: 32836 },
      { startOffsetInclusive: 94, length: 3, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens = store.getTokensInRange(36, 59);
    assert.deepStrictEqual(tokens, [
      { token: 196676, startOffsetInclusive: 36, length: 11 },
      { token: 32836, startOffsetInclusive: 47, length: 3 },
      { token: 32836, startOffsetInclusive: 50, length: 2 },
      { token: 327748, startOffsetInclusive: 52, length: 7 }
    ]);
  });
  test("Realistic scenario four", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 8, token: 196676 },
      { startOffsetInclusive: 8, length: 1, token: 32836 },
      { startOffsetInclusive: 9, length: 1, token: 524356 },
      { startOffsetInclusive: 10, length: 6, token: 32836 },
      { startOffsetInclusive: 16, length: 1, token: 32836 },
      { startOffsetInclusive: 17, length: 6, token: 589892 },
      { startOffsetInclusive: 23, length: 1, token: 32836 },
      { startOffsetInclusive: 24, length: 4, token: 196676 },
      { startOffsetInclusive: 28, length: 1, token: 32836 },
      { startOffsetInclusive: 29, length: 2, token: 32836 },
      { startOffsetInclusive: 31, length: 3, token: 32836 },
      // This is the closing curly brace + newline chars
      { startOffsetInclusive: 34, length: 2, token: 32836 },
      { startOffsetInclusive: 36, length: 5, token: 196676 },
      { startOffsetInclusive: 41, length: 1, token: 32836 },
      { startOffsetInclusive: 42, length: 1, token: 557124 },
      { startOffsetInclusive: 43, length: 4, token: 32836 },
      { startOffsetInclusive: 47, length: 1, token: 32836 },
      { startOffsetInclusive: 48, length: 7, token: 196676 },
      { startOffsetInclusive: 55, length: 1, token: 32836 },
      { startOffsetInclusive: 56, length: 1, token: 327748 },
      { startOffsetInclusive: 57, length: 1, token: 32836 },
      { startOffsetInclusive: 58, length: 1, token: 98372 },
      { startOffsetInclusive: 59, length: 1, token: 32836 },
      { startOffsetInclusive: 60, length: 5, token: 196676 },
      { startOffsetInclusive: 65, length: 1, token: 32836 },
      { startOffsetInclusive: 66, length: 2, token: 32836 },
      { startOffsetInclusive: 68, length: 1, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens0 = store.getTokensInRange(36, 59);
    assert.deepStrictEqual(tokens0, [
      { startOffsetInclusive: 36, length: 5, token: 196676 },
      { startOffsetInclusive: 41, length: 1, token: 32836 },
      { startOffsetInclusive: 42, length: 1, token: 557124 },
      { startOffsetInclusive: 43, length: 4, token: 32836 },
      { startOffsetInclusive: 47, length: 1, token: 32836 },
      { startOffsetInclusive: 48, length: 7, token: 196676 },
      { startOffsetInclusive: 55, length: 1, token: 32836 },
      { startOffsetInclusive: 56, length: 1, token: 327748 },
      { startOffsetInclusive: 57, length: 1, token: 32836 },
      { startOffsetInclusive: 58, length: 1, token: 98372 }
    ]);
    store.update(32, [
      { startOffsetInclusive: 0, length: 8, token: 196676 },
      { startOffsetInclusive: 8, length: 1, token: 32836 },
      { startOffsetInclusive: 9, length: 1, token: 524356 },
      { startOffsetInclusive: 10, length: 6, token: 32836 },
      { startOffsetInclusive: 16, length: 1, token: 32836 },
      { startOffsetInclusive: 17, length: 6, token: 589892 },
      { startOffsetInclusive: 23, length: 1, token: 32836 },
      { startOffsetInclusive: 24, length: 4, token: 196676 },
      { startOffsetInclusive: 28, length: 1, token: 32836 },
      { startOffsetInclusive: 29, length: 2, token: 32836 },
      { startOffsetInclusive: 31, length: 3, token: 32836 },
      // This is the new line, which consists of 3 characters: \t\r\n
      { startOffsetInclusive: 34, length: 2, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens1 = store.getTokensInRange(36, 59);
    assert.deepStrictEqual(tokens1, [
      { startOffsetInclusive: 36, length: 2, token: 32836 },
      { startOffsetInclusive: 38, length: 2, token: 32836 },
      { startOffsetInclusive: 40, length: 5, token: 196676 },
      { startOffsetInclusive: 45, length: 1, token: 32836 },
      { startOffsetInclusive: 46, length: 1, token: 557124 },
      { startOffsetInclusive: 47, length: 4, token: 32836 },
      { startOffsetInclusive: 51, length: 1, token: 32836 },
      { startOffsetInclusive: 52, length: 7, token: 196676 }
    ]);
    store.update(37, [
      { startOffsetInclusive: 0, length: 8, token: 196676 },
      { startOffsetInclusive: 8, length: 1, token: 32836 },
      { startOffsetInclusive: 9, length: 1, token: 524356 },
      { startOffsetInclusive: 10, length: 6, token: 32836 },
      { startOffsetInclusive: 16, length: 1, token: 32836 },
      { startOffsetInclusive: 17, length: 6, token: 589892 },
      { startOffsetInclusive: 23, length: 1, token: 32836 },
      { startOffsetInclusive: 24, length: 4, token: 196676 },
      { startOffsetInclusive: 28, length: 1, token: 32836 },
      { startOffsetInclusive: 29, length: 2, token: 32836 },
      { startOffsetInclusive: 31, length: 2, token: 32836 },
      // This is the changed line: \t\r\n to \r\n
      { startOffsetInclusive: 33, length: 3, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens2 = store.getTokensInRange(36, 59);
    assert.deepStrictEqual(tokens2, [
      { startOffsetInclusive: 36, length: 1, token: 32836 },
      { startOffsetInclusive: 37, length: 2, token: 32836 },
      { startOffsetInclusive: 39, length: 5, token: 196676 },
      { startOffsetInclusive: 44, length: 1, token: 32836 },
      { startOffsetInclusive: 45, length: 1, token: 557124 },
      { startOffsetInclusive: 46, length: 4, token: 32836 },
      { startOffsetInclusive: 50, length: 1, token: 32836 },
      { startOffsetInclusive: 51, length: 7, token: 196676 },
      { startOffsetInclusive: 58, length: 1, token: 32836 }
    ]);
  });
  test("Insert new line and remove tabs (split tokens)", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 5, token: 196676 },
      { startOffsetInclusive: 5, length: 1, token: 32836 },
      { startOffsetInclusive: 6, length: 1, token: 557124 },
      { startOffsetInclusive: 7, length: 3, token: 32836 },
      { startOffsetInclusive: 10, length: 1, token: 32836 },
      { startOffsetInclusive: 11, length: 1, token: 524356 },
      { startOffsetInclusive: 12, length: 5, token: 32836 },
      { startOffsetInclusive: 17, length: 3, token: 32836 },
      // This is the closing curly brace line of a()
      { startOffsetInclusive: 20, length: 2, token: 32836 },
      { startOffsetInclusive: 22, length: 1, token: 32836 },
      { startOffsetInclusive: 23, length: 9, token: 196676 },
      { startOffsetInclusive: 32, length: 1, token: 32836 },
      { startOffsetInclusive: 33, length: 1, token: 557124 },
      { startOffsetInclusive: 34, length: 3, token: 32836 },
      { startOffsetInclusive: 37, length: 1, token: 32836 },
      { startOffsetInclusive: 38, length: 1, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens0 = store.getTokensInRange(23, 39);
    assert.deepStrictEqual(tokens0, [
      { startOffsetInclusive: 23, length: 9, token: 196676 },
      { startOffsetInclusive: 32, length: 1, token: 32836 },
      { startOffsetInclusive: 33, length: 1, token: 557124 },
      { startOffsetInclusive: 34, length: 3, token: 32836 },
      { startOffsetInclusive: 37, length: 1, token: 32836 },
      { startOffsetInclusive: 38, length: 1, token: 32836 }
    ]);
    store.update(21, [
      { startOffsetInclusive: 0, length: 5, token: 196676 },
      { startOffsetInclusive: 5, length: 1, token: 32836 },
      { startOffsetInclusive: 6, length: 1, token: 557124 },
      { startOffsetInclusive: 7, length: 3, token: 32836 },
      { startOffsetInclusive: 10, length: 1, token: 32836 },
      { startOffsetInclusive: 11, length: 1, token: 524356 },
      { startOffsetInclusive: 12, length: 5, token: 32836 },
      { startOffsetInclusive: 17, length: 3, token: 32836 },
      { startOffsetInclusive: 20, length: 3, token: 32836 },
      { startOffsetInclusive: 23, length: 1, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens1 = store.getTokensInRange(26, 42);
    assert.deepStrictEqual(tokens1, [
      { startOffsetInclusive: 26, length: 9, token: 196676 },
      { startOffsetInclusive: 35, length: 1, token: 32836 },
      { startOffsetInclusive: 36, length: 1, token: 557124 },
      { startOffsetInclusive: 37, length: 3, token: 32836 },
      { startOffsetInclusive: 40, length: 1, token: 32836 },
      { startOffsetInclusive: 41, length: 1, token: 32836 }
    ]);
    store.update(24, [
      { startOffsetInclusive: 0, length: 5, token: 196676 },
      { startOffsetInclusive: 5, length: 1, token: 32836 },
      { startOffsetInclusive: 6, length: 1, token: 557124 },
      { startOffsetInclusive: 7, length: 3, token: 32836 },
      { startOffsetInclusive: 10, length: 1, token: 32836 },
      { startOffsetInclusive: 11, length: 1, token: 524356 },
      { startOffsetInclusive: 12, length: 5, token: 32836 },
      { startOffsetInclusive: 17, length: 3, token: 32836 },
      { startOffsetInclusive: 20, length: 1, token: 32836 },
      { startOffsetInclusive: 21, length: 2, token: 32836 },
      { startOffsetInclusive: 23, length: 1, token: 32836 }
    ], TokenQuality.Accurate);
    const tokens2 = store.getTokensInRange(26, 42);
    assert.deepStrictEqual(tokens2, [
      { startOffsetInclusive: 26, length: 9, token: 196676 },
      { startOffsetInclusive: 35, length: 1, token: 32836 },
      { startOffsetInclusive: 36, length: 1, token: 557124 },
      { startOffsetInclusive: 37, length: 3, token: 32836 },
      { startOffsetInclusive: 40, length: 1, token: 32836 },
      { startOffsetInclusive: 41, length: 1, token: 32836 }
    ]);
  });
  test("delete removes tokens in the middle", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 3, token: 3 }
    ], TokenQuality.Accurate);
    store.delete(3, 3);
    const tokens = store.getTokensInRange(0, 9);
    assert.deepStrictEqual(tokens, [
      { startOffsetInclusive: 0, length: 3, token: 1 },
      { startOffsetInclusive: 3, length: 3, token: 3 }
    ]);
  });
  test("delete merges partially affected token", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 5, token: 1 },
      { startOffsetInclusive: 5, length: 5, token: 2 }
    ], TokenQuality.Accurate);
    store.delete(3, 4);
    const tokens = store.getTokensInRange(0, 10);
    assert.deepStrictEqual(tokens, [
      { startOffsetInclusive: 0, length: 4, token: 1 },
      // token 2 is now shifted left by 4
      { startOffsetInclusive: 4, length: 3, token: 2 }
    ]);
  });
  test("replace a token with a slightly larger token", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 5, token: 1 },
      { startOffsetInclusive: 5, length: 1, token: 2 },
      { startOffsetInclusive: 6, length: 1, token: 2 },
      { startOffsetInclusive: 7, length: 17, token: 2 },
      { startOffsetInclusive: 24, length: 1, token: 2 },
      { startOffsetInclusive: 25, length: 5, token: 2 },
      { startOffsetInclusive: 30, length: 1, token: 2 },
      { startOffsetInclusive: 31, length: 1, token: 2 },
      { startOffsetInclusive: 32, length: 5, token: 2 }
    ], TokenQuality.Accurate);
    store.update(17, [{ startOffsetInclusive: 7, length: 19, token: 0 }], TokenQuality.Accurate);
    const tokens = store.getTokensInRange(0, 39);
    assert.deepStrictEqual(tokens, [
      { startOffsetInclusive: 0, length: 5, token: 1 },
      { startOffsetInclusive: 5, length: 1, token: 2 },
      { startOffsetInclusive: 6, length: 1, token: 2 },
      { startOffsetInclusive: 7, length: 19, token: 0 },
      { startOffsetInclusive: 26, length: 1, token: 2 },
      { startOffsetInclusive: 27, length: 5, token: 2 },
      { startOffsetInclusive: 32, length: 1, token: 2 },
      { startOffsetInclusive: 33, length: 1, token: 2 },
      { startOffsetInclusive: 34, length: 5, token: 2 }
    ]);
  });
  test("replace a character from a large token", () => {
    const store = new TokenStore(textModel);
    store.buildStore([
      { startOffsetInclusive: 0, length: 2, token: 1 },
      { startOffsetInclusive: 2, length: 5, token: 2 },
      { startOffsetInclusive: 7, length: 1, token: 3 }
    ], TokenQuality.Accurate);
    store.delete(1, 3);
    const tokens = store.getTokensInRange(0, 7);
    assert.deepStrictEqual(tokens, [
      { startOffsetInclusive: 0, length: 2, token: 1 },
      { startOffsetInclusive: 2, length: 1, token: 2 },
      { startOffsetInclusive: 3, length: 3, token: 2 },
      { startOffsetInclusive: 6, length: 1, token: 3 }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci90ZXN0L2NvbW1vbi9tb2RlbC90b2tlblN0b3JlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgTGVhZk5vZGUsIExpc3ROb2RlLCBUb2tlblF1YWxpdHksIFRva2VuU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvdG9rZW5zL3RyZWVTaXR0ZXIvdG9rZW5TdG9yZS5qcyc7XG5cbnN1aXRlKCdUb2tlblN0b3JlJywgKCkgPT4ge1xuXHRsZXQgdGV4dE1vZGVsOiBUZXh0TW9kZWw7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHR0ZXh0TW9kZWwgPSB7XG5cdFx0XHRnZXRWYWx1ZUxlbmd0aDogKCkgPT4gMTFcblx0XHR9IGFzIFRleHRNb2RlbDtcblx0fSk7XG5cblx0dGVzdCgnY29uc3RydWN0cyB3aXRoIGVtcHR5IG1vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRva2VuU3RvcmUodGV4dE1vZGVsKTtcblx0XHRhc3NlcnQub2soc3RvcmUucm9vdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlLnJvb3QubGVuZ3RoLCB0ZXh0TW9kZWwuZ2V0VmFsdWVMZW5ndGgoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1aWxkcyBzdG9yZSB3aXRoIHNpbmdsZSB0b2tlbicsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbe1xuXHRcdFx0c3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsXG5cdFx0XHRsZW5ndGg6IDUsXG5cdFx0XHR0b2tlbjogMVxuXHRcdH1dLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdG9yZS5yb290Lmxlbmd0aCwgNSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1aWxkcyBzdG9yZSB3aXRoIG11bHRpcGxlIHRva2VucycsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDMsIHRva2VuOiAxIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzLCBsZW5ndGg6IDMsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDQsIHRva2VuOiAzIH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXHRcdGFzc2VydC5vayhzdG9yZS5yb290KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcmUucm9vdC5sZW5ndGgsIDEwKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlcyBiYWxhbmNlZCB0cmVlIHN0cnVjdHVyZScsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDIsIHRva2VuOiAxIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyLCBsZW5ndGg6IDIsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0LCBsZW5ndGg6IDIsIHRva2VuOiAzIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDIsIHRva2VuOiA0IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Y29uc3Qgcm9vdCA9IHN0b3JlLnJvb3QgYXMgTGlzdE5vZGU7XG5cdFx0YXNzZXJ0Lm9rKHJvb3QuY2hpbGRyZW4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290LmNoaWxkcmVuLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3QuY2hpbGRyZW5bMF0ubGVuZ3RoLCA0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdC5jaGlsZHJlblsxXS5sZW5ndGgsIDQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVzIGRlZXAgdHJlZSBzdHJ1Y3R1cmUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVG9rZW5TdG9yZSh0ZXh0TW9kZWwpO1xuXHRcdHN0b3JlLmJ1aWxkU3RvcmUoW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiAxLCB0b2tlbjogMSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMSwgbGVuZ3RoOiAxLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMiwgbGVuZ3RoOiAxLCB0b2tlbjogMyB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMywgbGVuZ3RoOiAxLCB0b2tlbjogNCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNCwgbGVuZ3RoOiAxLCB0b2tlbjogNSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNSwgbGVuZ3RoOiAxLCB0b2tlbjogNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAxLCB0b2tlbjogNyB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNywgbGVuZ3RoOiAxLCB0b2tlbjogOCB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblxuXHRcdGNvbnN0IHJvb3QgPSBzdG9yZS5yb290IGFzIExpc3ROb2RlO1xuXHRcdGFzc2VydC5vayhyb290LmNoaWxkcmVuKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdC5jaGlsZHJlbi5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5vaygocm9vdC5jaGlsZHJlblswXSBhcyBMaXN0Tm9kZSkuY2hpbGRyZW4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocm9vdC5jaGlsZHJlblswXSBhcyBMaXN0Tm9kZSkuY2hpbGRyZW4ubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQub2soKChyb290LmNoaWxkcmVuWzBdIGFzIExpc3ROb2RlKS5jaGlsZHJlblswXSBhcyBMaXN0Tm9kZSkuY2hpbGRyZW4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoKHJvb3QuY2hpbGRyZW5bMF0gYXMgTGlzdE5vZGUpLmNoaWxkcmVuWzBdIGFzIExpc3ROb2RlKS5jaGlsZHJlbi5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVzIHNpbmdsZSB0b2tlbiBpbiBtaWRkbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVG9rZW5TdG9yZSh0ZXh0TW9kZWwpO1xuXHRcdHN0b3JlLmJ1aWxkU3RvcmUoW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiAzLCB0b2tlbjogMSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMywgbGVuZ3RoOiAzLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAzLCB0b2tlbjogMyB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblxuXHRcdHN0b3JlLnVwZGF0ZSgzLCBbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzLCBsZW5ndGg6IDMsIHRva2VuOiA0IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Y29uc3QgdG9rZW5zID0gc3RvcmUucm9vdCBhcyBMaXN0Tm9kZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHRva2Vucy5jaGlsZHJlblswXSBhcyBMZWFmTm9kZSkudG9rZW4sIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgodG9rZW5zLmNoaWxkcmVuWzFdIGFzIExlYWZOb2RlKS50b2tlbiwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh0b2tlbnMuY2hpbGRyZW5bMl0gYXMgTGVhZk5vZGUpLnRva2VuLCAzKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyBtdWx0aXBsZSBjb25zZWN1dGl2ZSB0b2tlbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVG9rZW5TdG9yZSh0ZXh0TW9kZWwpO1xuXHRcdHN0b3JlLmJ1aWxkU3RvcmUoW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiAzLCB0b2tlbjogMSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMywgbGVuZ3RoOiAzLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAzLCB0b2tlbjogMyB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblxuXHRcdHN0b3JlLnVwZGF0ZSg2LCBbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzLCBsZW5ndGg6IDMsIHRva2VuOiA0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDMsIHRva2VuOiA1IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Y29uc3QgdG9rZW5zID0gc3RvcmUucm9vdCBhcyBMaXN0Tm9kZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHRva2Vucy5jaGlsZHJlblswXSBhcyBMZWFmTm9kZSkudG9rZW4sIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgodG9rZW5zLmNoaWxkcmVuWzFdIGFzIExlYWZOb2RlKS50b2tlbiwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh0b2tlbnMuY2hpbGRyZW5bMl0gYXMgTGVhZk5vZGUpLnRva2VuLCA1KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyB0b2tlbnMgYXQgc3RhcnQgb2YgZG9jdW1lbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVG9rZW5TdG9yZSh0ZXh0TW9kZWwpO1xuXHRcdHN0b3JlLmJ1aWxkU3RvcmUoW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiAzLCB0b2tlbjogMSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMywgbGVuZ3RoOiAzLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAzLCB0b2tlbjogMyB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblxuXHRcdHN0b3JlLnVwZGF0ZSgzLCBbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDMsIHRva2VuOiA0IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Y29uc3QgdG9rZW5zID0gc3RvcmUucm9vdCBhcyBMaXN0Tm9kZTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHRva2Vucy5jaGlsZHJlblswXSBhcyBMZWFmTm9kZSkudG9rZW4sIDQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgodG9rZW5zLmNoaWxkcmVuWzFdIGFzIExlYWZOb2RlKS50b2tlbiwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh0b2tlbnMuY2hpbGRyZW5bMl0gYXMgTGVhZk5vZGUpLnRva2VuLCAzKTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlcyB0b2tlbnMgYXQgZW5kIG9mIGRvY3VtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRva2VuU3RvcmUodGV4dE1vZGVsKTtcblx0XHRzdG9yZS5idWlsZFN0b3JlKFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogMywgdG9rZW46IDEgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMsIGxlbmd0aDogMywgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogMywgdG9rZW46IDMgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRzdG9yZS51cGRhdGUoMywgW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAzLCB0b2tlbjogNCB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblxuXHRcdGNvbnN0IHRva2VucyA9IHN0b3JlLnJvb3QgYXMgTGlzdE5vZGU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh0b2tlbnMuY2hpbGRyZW5bMF0gYXMgTGVhZk5vZGUpLnRva2VuLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHRva2Vucy5jaGlsZHJlblsxXSBhcyBMZWFmTm9kZSkudG9rZW4sIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgodG9rZW5zLmNoaWxkcmVuWzJdIGFzIExlYWZOb2RlKS50b2tlbiwgNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZXMgbGVuZ3RoIG9mIHRva2VucycsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDMsIHRva2VuOiAxIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzLCBsZW5ndGg6IDMsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDMsIHRva2VuOiAzIH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0c3RvcmUudXBkYXRlKDYsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMsIGxlbmd0aDogNSwgdG9rZW46IDQgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRjb25zdCB0b2tlbnMgPSBzdG9yZS5yb290IGFzIExpc3ROb2RlO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgodG9rZW5zLmNoaWxkcmVuWzBdIGFzIExlYWZOb2RlKS50b2tlbiwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRva2Vucy5jaGlsZHJlblswXS5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgodG9rZW5zLmNoaWxkcmVuWzFdIGFzIExlYWZOb2RlKS50b2tlbiwgNCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRva2Vucy5jaGlsZHJlblsxXS5sZW5ndGgsIDUpO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGUgZGVlcGx5IG5lc3RlZCB0cmVlIHdpdGggbmV3IHRva2VuIGxlbmd0aCBpbiB0aGUgbWlkZGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRva2VuU3RvcmUodGV4dE1vZGVsKTtcblx0XHRzdG9yZS5idWlsZFN0b3JlKFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogMSwgdG9rZW46IDEgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDEsIGxlbmd0aDogMSwgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIsIGxlbmd0aDogMSwgdG9rZW46IDMgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMsIGxlbmd0aDogMSwgdG9rZW46IDQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQsIGxlbmd0aDogMSwgdG9rZW46IDUgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUsIGxlbmd0aDogMSwgdG9rZW46IDYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogMSwgdG9rZW46IDcgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDcsIGxlbmd0aDogMSwgdG9rZW46IDggfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHQvLyBVcGRhdGUgdG9rZW4gaW4gdGhlIG1pZGRsZSAocG9zaXRpb24gMy00KSB0byBzcGFuIDMtNlxuXHRcdHN0b3JlLnVwZGF0ZSgzLCBbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzLCBsZW5ndGg6IDMsIHRva2VuOiA5IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Y29uc3Qgcm9vdCA9IHN0b3JlLnJvb3QgYXMgTGlzdE5vZGU7XG5cdFx0Ly8gVmVyaWZ5IHRoZSBzdHJ1Y3R1cmUgcmVtYWlucyBiYWxhbmNlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290LmNoaWxkcmVuLmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyb290LmNoaWxkcmVuWzBdIGFzIExpc3ROb2RlKS5jaGlsZHJlbi5sZW5ndGgsIDIpO1xuXG5cdFx0Ly8gVmVyaWZ5IHRoZSBsZW5ndGhzIGFyZSB1cGRhdGVkIGNvcnJlY3RseVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290LmNoaWxkcmVuWzBdLmxlbmd0aCwgMik7IC8vIEZpcnN0IDIgdG9rZW5zXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3QuY2hpbGRyZW5bMV0ubGVuZ3RoLCA0KTsgLy8gVG9rZW4gMyArIG91ciBuZXcgbG9uZ2VyIHRva2VuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJvb3QuY2hpbGRyZW5bMl0ubGVuZ3RoLCAyKTsgLy8gTGFzdCAyIHRva2Vuc1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGUgZGVlcGx5IG5lc3RlZCB0cmVlIHdpdGggYSByYW5nZSBvZiB0b2tlbnMgdGhhdCBjYXVzZXMgdG9rZW5zIHRvIHNwbGl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRva2VuU3RvcmUodGV4dE1vZGVsKTtcblx0XHRzdG9yZS5idWlsZFN0b3JlKFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogMywgdG9rZW46IDEgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMsIGxlbmd0aDogMywgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogNCwgdG9rZW46IDMgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDEwLCBsZW5ndGg6IDUsIHRva2VuOiA0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxNSwgbGVuZ3RoOiA0LCB0b2tlbjogNSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTksIGxlbmd0aDogMywgdG9rZW46IDYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIyLCBsZW5ndGg6IDUsIHRva2VuOiA3IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyNywgbGVuZ3RoOiAzLCB0b2tlbjogOCB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblxuXHRcdC8vIFVwZGF0ZSB0b2tlbiBpbiB0aGUgbWlkZGxlIHdoaWNoIGNhdXNlcyB0b2tlbnMgdG8gc3BsaXRcblx0XHRzdG9yZS51cGRhdGUoOCwgW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTIsIGxlbmd0aDogNCwgdG9rZW46IDkgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDE2LCBsZW5ndGg6IDQsIHRva2VuOiAxMCB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblxuXHRcdGNvbnN0IHJvb3QgPSBzdG9yZS5yb290IGFzIExpc3ROb2RlO1xuXHRcdC8vIFZlcmlmeSB0aGUgc3RydWN0dXJlIHJlbWFpbnMgYmFsYW5jZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdC5jaGlsZHJlbi5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocm9vdC5jaGlsZHJlblswXSBhcyBMaXN0Tm9kZSkuY2hpbGRyZW4ubGVuZ3RoLCAyKTtcblxuXHRcdC8vIFZlcmlmeSB0aGUgbGVuZ3RocyBhcmUgdXBkYXRlZCBjb3JyZWN0bHlcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdC5jaGlsZHJlblswXS5sZW5ndGgsIDEyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdC5jaGlsZHJlblsxXS5sZW5ndGgsIDE4KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0VG9rZW5zSW5SYW5nZSByZXR1cm5zIHRva2VucyBpbiBtaWRkbGUgb2YgZG9jdW1lbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVG9rZW5TdG9yZSh0ZXh0TW9kZWwpO1xuXHRcdHN0b3JlLmJ1aWxkU3RvcmUoW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiAzLCB0b2tlbjogMSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMywgbGVuZ3RoOiAzLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAzLCB0b2tlbjogMyB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblxuXHRcdGNvbnN0IHRva2VucyA9IHN0b3JlLmdldFRva2Vuc0luUmFuZ2UoMywgNik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnMsIFt7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzLCBsZW5ndGg6IDMsIHRva2VuOiAyIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0VG9rZW5zSW5SYW5nZSByZXR1cm5zIHRva2VucyBhdCBzdGFydCBvZiBkb2N1bWVudCcsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDMsIHRva2VuOiAxIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzLCBsZW5ndGg6IDMsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDMsIHRva2VuOiAzIH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Y29uc3QgdG9rZW5zID0gc3RvcmUuZ2V0VG9rZW5zSW5SYW5nZSgwLCAzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2VucywgW3sgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogMywgdG9rZW46IDEgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRUb2tlbnNJblJhbmdlIHJldHVybnMgdG9rZW5zIGF0IGVuZCBvZiBkb2N1bWVudCcsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDMsIHRva2VuOiAxIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzLCBsZW5ndGg6IDMsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDMsIHRva2VuOiAzIH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Y29uc3QgdG9rZW5zID0gc3RvcmUuZ2V0VG9rZW5zSW5SYW5nZSg2LCA5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2VucywgW3sgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogMywgdG9rZW46IDMgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRUb2tlbnNJblJhbmdlIHJldHVybnMgbXVsdGlwbGUgdG9rZW5zIGFjcm9zcyBub2RlcycsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDEsIHRva2VuOiAxIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxLCBsZW5ndGg6IDEsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyLCBsZW5ndGg6IDEsIHRva2VuOiAzIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzLCBsZW5ndGg6IDEsIHRva2VuOiA0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0LCBsZW5ndGg6IDEsIHRva2VuOiA1IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1LCBsZW5ndGg6IDEsIHRva2VuOiA2IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Y29uc3QgdG9rZW5zID0gc3RvcmUuZ2V0VG9rZW5zSW5SYW5nZSgyLCA1KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2VucywgW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMiwgbGVuZ3RoOiAxLCB0b2tlbjogMyB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMywgbGVuZ3RoOiAxLCB0b2tlbjogNCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNCwgbGVuZ3RoOiAxLCB0b2tlbjogNSB9XG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1JlYWxpc3RpYyBzY2VuYXJpbyBvbmUnLCAoKSA9PiB7XG5cdFx0Ly8gaW5zcGlyZWQgYnkgdGhpcyBzbmlwcGV0LCB3aXRoIHRoZSB1cGRhdGUgYWRkaW5nIGEgc3BhY2UgaW4gdGhlIGNvbnN0cnVjdG9yJ3MgY3VybHkgYnJhY2VzOlxuXHRcdC8vIC8qXG5cdFx0Ly8gKi9cblx0XHQvLyBjbGFzcyBYWSB7XG5cdFx0Ly8gXHRjb25zdHJ1Y3RvcigpIHt9XG5cdFx0Ly8gfVxuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVG9rZW5TdG9yZSh0ZXh0TW9kZWwpO1xuXHRcdHN0b3JlLmJ1aWxkU3RvcmUoW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiAzLCB0b2tlbjogMTY0MTY0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNCwgbGVuZ3RoOiAzLCB0b2tlbjogMTY0MTY0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA3LCBsZW5ndGg6IDIsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogOSwgbGVuZ3RoOiA1LCB0b2tlbjogMTk2Njc2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxNCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDE1LCBsZW5ndGg6IDIsIHRva2VuOiA1NTcxMjQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDE3LCBsZW5ndGg6IDQsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjEsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyMiwgbGVuZ3RoOiAxMSwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzMsIGxlbmd0aDogNywgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0MCwgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRzdG9yZS51cGRhdGUoMzMsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDksIGxlbmd0aDogNSwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTQsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxNSwgbGVuZ3RoOiAyLCB0b2tlbjogNTU3MTI0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxNywgbGVuZ3RoOiA0LCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIxLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjIsIGxlbmd0aDogMTEsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMzLCBsZW5ndGg6IDgsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNDEsIGxlbmd0aDogMywgdG9rZW46IDMyODM2IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdH0pO1xuXHR0ZXN0KCdSZWFsaXN0aWMgc2NlbmFyaW8gdHdvJywgKCkgPT4ge1xuXHRcdC8vIGluc3BpcmVkIGJ5IHRoaXMgc25pcHBldCwgd2l0aCB0aGUgdXBkYXRlIGRlbGV0ZWluZyB0aGUgc3BhY2UgaW4gdGhlIGJvZHkgb2YgY2xhc3MgeFxuXHRcdC8vIGNsYXNzIHgge1xuXHRcdC8vXG5cdFx0Ly8gfVxuXHRcdC8vIGNsYXNzIHkge1xuXG5cdFx0Ly8gfVxuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVG9rZW5TdG9yZSh0ZXh0TW9kZWwpO1xuXHRcdHN0b3JlLmJ1aWxkU3RvcmUoW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiA1LCB0b2tlbjogMTk2Njc2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAxLCB0b2tlbjogNTU3MTI0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA3LCBsZW5ndGg6IDQsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTEsIGxlbmd0aDogMywgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxNCwgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDE3LCBsZW5ndGg6IDUsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIyLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjMsIGxlbmd0aDogMSwgdG9rZW46IDU1NzEyNCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjQsIGxlbmd0aDogNCwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyOCwgbGVuZ3RoOiAyLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMwLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblx0XHRjb25zdCB0b2tlbnMwID0gc3RvcmUuZ2V0VG9rZW5zSW5SYW5nZSgwLCAxNik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnMwLCBbXG5cdFx0XHR7IHRva2VuOiAxOTY2NzYsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDUgfSxcblx0XHRcdHsgdG9rZW46IDMyODM2LCBzdGFydE9mZnNldEluY2x1c2l2ZTogNSwgbGVuZ3RoOiAxIH0sXG5cdFx0XHR7IHRva2VuOiA1NTcxMjQsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDEgfSxcblx0XHRcdHsgdG9rZW46IDMyODM2LCBzdGFydE9mZnNldEluY2x1c2l2ZTogNywgbGVuZ3RoOiA0IH0sXG5cdFx0XHR7IHRva2VuOiAzMjgzNiwgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDExLCBsZW5ndGg6IDMgfSxcblx0XHRcdHsgdG9rZW46IDMyODM2LCBzdGFydE9mZnNldEluY2x1c2l2ZTogMTQsIGxlbmd0aDogMiB9XG5cdFx0XSk7XG5cblx0XHRzdG9yZS51cGRhdGUoMTQsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogNSwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNSwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogMSwgdG9rZW46IDU1NzEyNCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNywgbGVuZ3RoOiA0LCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDExLCBsZW5ndGg6IDIsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTMsIGxlbmd0aDogMywgdG9rZW46IDMyODM2IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Y29uc3QgdG9rZW5zID0gc3RvcmUuZ2V0VG9rZW5zSW5SYW5nZSgwLCAxNik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnMsIFtcblx0XHRcdHsgdG9rZW46IDE5NjY3Niwgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogNSB9LFxuXHRcdFx0eyB0b2tlbjogMzI4MzYsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1LCBsZW5ndGg6IDEgfSxcblx0XHRcdHsgdG9rZW46IDU1NzEyNCwgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogMSB9LFxuXHRcdFx0eyB0b2tlbjogMzI4MzYsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA3LCBsZW5ndGg6IDQgfSxcblx0XHRcdHsgdG9rZW46IDMyODM2LCBzdGFydE9mZnNldEluY2x1c2l2ZTogMTEsIGxlbmd0aDogMiB9LFxuXHRcdFx0eyB0b2tlbjogMzI4MzYsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxMywgbGVuZ3RoOiAzIH1cblx0XHRdKTtcblx0fSk7XG5cdHRlc3QoJ1JlYWxpc3RpYyBzY2VuYXJpbyB0aHJlZScsICgpID0+IHtcblx0XHQvLyBpbnNwaXJlZCBieSB0aGlzIHNuaXBwZXQsIHdpdGggdGhlIHVwZGF0ZSBhZGRpbmcgYSBzcGFjZSBhZnRlciB0aGUgeyBpbiB0aGUgY29uc3RydWN0b3Jcblx0XHQvLyAvKi0tXG5cdFx0Ly8gIC0tKi9cblx0XHQvLyAgY2xhc3MgVHJlZVZpZXdQYW5lIHtcblx0XHQvLyBcdGNvbnN0cnVjdG9yKFxuXHRcdC8vIFx0XHRvcHRpb25zOiBJVmlld2xldFZpZXdPcHRpb25zLFxuXHRcdC8vIFx0KSB7XG5cdFx0Ly8gXHR9XG5cdFx0Ly8gfVxuXG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDUsIHRva2VuOiAxNjQxNjQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDUsIHRva2VuOiAxNjQxNjQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDExLCBsZW5ndGg6IDIsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTMsIGxlbmd0aDogNSwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTgsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxOSwgbGVuZ3RoOiAxMiwgdG9rZW46IDU1NzEyNCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzEsIGxlbmd0aDogNCwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNSwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDM2LCBsZW5ndGg6IDExLCB0b2tlbjogMTk2Njc2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0NywgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUwLCBsZW5ndGg6IDIsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNTIsIGxlbmd0aDogNywgdG9rZW46IDMyNzc0OCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNTksIGxlbmd0aDogMSwgdG9rZW46IDk4MzcyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2MCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYxLCBsZW5ndGg6IDE5LCB0b2tlbjogNTU3MTI0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA4MCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDgxLCBsZW5ndGg6IDIsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogODMsIGxlbmd0aDogNiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA4OSwgbGVuZ3RoOiA0LCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDkzLCBsZW5ndGg6IDMsIHRva2VuOiAzMjgzNiB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblx0XHRjb25zdCB0b2tlbnMwID0gc3RvcmUuZ2V0VG9rZW5zSW5SYW5nZSgzNiwgNTkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zMCwgW1xuXHRcdFx0eyB0b2tlbjogMTk2Njc2LCBzdGFydE9mZnNldEluY2x1c2l2ZTogMzYsIGxlbmd0aDogMTEgfSxcblx0XHRcdHsgdG9rZW46IDMyODM2LCBzdGFydE9mZnNldEluY2x1c2l2ZTogNDcsIGxlbmd0aDogMyB9LFxuXHRcdFx0eyB0b2tlbjogMzI4MzYsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1MCwgbGVuZ3RoOiAyIH0sXG5cdFx0XHR7IHRva2VuOiAzMjc3NDgsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1MiwgbGVuZ3RoOiA3IH1cblx0XHRdKTtcblxuXHRcdHN0b3JlLnVwZGF0ZSg4MiwgW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTMsIGxlbmd0aDogNSwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTgsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxOSwgbGVuZ3RoOiAxMiwgdG9rZW46IDU1NzEyNCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzEsIGxlbmd0aDogNCwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNSwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDM2LCBsZW5ndGg6IDExLCB0b2tlbjogMTk2Njc2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0NywgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUwLCBsZW5ndGg6IDIsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNTIsIGxlbmd0aDogNywgdG9rZW46IDMyNzc0OCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNTksIGxlbmd0aDogMSwgdG9rZW46IDk4MzcyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2MCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYxLCBsZW5ndGg6IDE5LCB0b2tlbjogNTU3MTI0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA4MCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDgxLCBsZW5ndGg6IDIsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogODMsIGxlbmd0aDogNywgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA5MCwgbGVuZ3RoOiA0LCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDk0LCBsZW5ndGg6IDMsIHRva2VuOiAzMjgzNiB9XG5cdFx0XSwgVG9rZW5RdWFsaXR5LkFjY3VyYXRlKTtcblxuXHRcdGNvbnN0IHRva2VucyA9IHN0b3JlLmdldFRva2Vuc0luUmFuZ2UoMzYsIDU5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2VucywgW1xuXHRcdFx0eyB0b2tlbjogMTk2Njc2LCBzdGFydE9mZnNldEluY2x1c2l2ZTogMzYsIGxlbmd0aDogMTEgfSxcblx0XHRcdHsgdG9rZW46IDMyODM2LCBzdGFydE9mZnNldEluY2x1c2l2ZTogNDcsIGxlbmd0aDogMyB9LFxuXHRcdFx0eyB0b2tlbjogMzI4MzYsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1MCwgbGVuZ3RoOiAyIH0sXG5cdFx0XHR7IHRva2VuOiAzMjc3NDgsIHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1MiwgbGVuZ3RoOiA3IH1cblx0XHRdKTtcblx0fSk7XG5cdHRlc3QoJ1JlYWxpc3RpYyBzY2VuYXJpbyBmb3VyJywgKCkgPT4ge1xuXHRcdC8vIGluc3BpcmVkIGJ5IHRoaXMgc25pcHBldCwgd2l0aCB0aGUgdXBkYXRlIGFkZGluZyBhIG5ldyBsaW5lIGFmdGVyIHRoZSByZXR1cm4gdHJ1ZTtcblx0XHQvLyBmdW5jdGlvbiB4KCkge1xuXHRcdC8vIFx0cmV0dXJuIHRydWU7XG5cdFx0Ly8gfVxuXG5cdFx0Ly8gY2xhc3MgWSB7XG5cdFx0Ly8gXHRwcml2YXRlIHogPSBmYWxzZTtcblx0XHQvLyB9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDgsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDgsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA5LCBsZW5ndGg6IDEsIHRva2VuOiA1MjQzNTYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDEwLCBsZW5ndGg6IDYsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTYsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxNywgbGVuZ3RoOiA2LCB0b2tlbjogNTg5ODkyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyMywgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDI0LCBsZW5ndGg6IDQsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDI4LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjksIGxlbmd0aDogMiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzMSwgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfSwgLy8gVGhpcyBpcyB0aGUgY2xvc2luZyBjdXJseSBicmFjZSArIG5ld2xpbmUgY2hhcnNcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDM0LCBsZW5ndGg6IDIsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzYsIGxlbmd0aDogNSwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNDEsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0MiwgbGVuZ3RoOiAxLCB0b2tlbjogNTU3MTI0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0MywgbGVuZ3RoOiA0LCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQ3LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNDgsIGxlbmd0aDogNywgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNTUsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1NiwgbGVuZ3RoOiAxLCB0b2tlbjogMzI3NzQ4IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1NywgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDU4LCBsZW5ndGg6IDEsIHRva2VuOiA5ODM3MiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNTksIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2MCwgbGVuZ3RoOiA1LCB0b2tlbjogMTk2Njc2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2NSwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDY2LCBsZW5ndGg6IDIsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNjgsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXHRcdGNvbnN0IHRva2VuczAgPSBzdG9yZS5nZXRUb2tlbnNJblJhbmdlKDM2LCA1OSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnMwLCBbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNiwgbGVuZ3RoOiA1LCB0b2tlbjogMTk2Njc2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0MSwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQyLCBsZW5ndGg6IDEsIHRva2VuOiA1NTcxMjQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQzLCBsZW5ndGg6IDQsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNDcsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0OCwgbGVuZ3RoOiA3LCB0b2tlbjogMTk2Njc2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1NSwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDU2LCBsZW5ndGg6IDEsIHRva2VuOiAzMjc3NDggfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDU3LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNTgsIGxlbmd0aDogMSwgdG9rZW46IDk4MzcyIH1cblx0XHRdKTtcblxuXHRcdC8vIGluc2VydCBhIHRhYiArIG5ldyBsaW5lIGFmdGVyIGByZXR1cm4gdHJ1ZTtgIChsaWtlIGhpdHRpbmcgZW50ZXIgYWZ0ZXIgdGhlIDspXG5cdFx0c3RvcmUudXBkYXRlKDMyLCBbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDgsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDgsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA5LCBsZW5ndGg6IDEsIHRva2VuOiA1MjQzNTYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDEwLCBsZW5ndGg6IDYsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTYsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxNywgbGVuZ3RoOiA2LCB0b2tlbjogNTg5ODkyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyMywgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDI0LCBsZW5ndGg6IDQsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDI4LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjksIGxlbmd0aDogMiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzMSwgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfSwgLy8gVGhpcyBpcyB0aGUgbmV3IGxpbmUsIHdoaWNoIGNvbnNpc3RzIG9mIDMgY2hhcmFjdGVyczogXFx0XFxyXFxuXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNCwgbGVuZ3RoOiAyLCB0b2tlbjogMzI4MzYgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRjb25zdCB0b2tlbnMxID0gc3RvcmUuZ2V0VG9rZW5zSW5SYW5nZSgzNiwgNTkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zMSwgW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzYsIGxlbmd0aDogMiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzOCwgbGVuZ3RoOiAyLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQwLCBsZW5ndGg6IDUsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQ1LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNDYsIGxlbmd0aDogMSwgdG9rZW46IDU1NzEyNCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNDcsIGxlbmd0aDogNCwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1MSwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUyLCBsZW5ndGg6IDcsIHRva2VuOiAxOTY2NzYgfVxuXHRcdF0pO1xuXG5cdFx0Ly8gRGVsZXRlIHRoZSB0YWIgY2hhcmFjdGVyXG5cdFx0c3RvcmUudXBkYXRlKDM3LCBbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDgsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDgsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA5LCBsZW5ndGg6IDEsIHRva2VuOiA1MjQzNTYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDEwLCBsZW5ndGg6IDYsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTYsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxNywgbGVuZ3RoOiA2LCB0b2tlbjogNTg5ODkyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyMywgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDI0LCBsZW5ndGg6IDQsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDI4LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjksIGxlbmd0aDogMiwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzMSwgbGVuZ3RoOiAyLCB0b2tlbjogMzI4MzYgfSwgLy8gVGhpcyBpcyB0aGUgY2hhbmdlZCBsaW5lOiBcXHRcXHJcXG4gdG8gXFxyXFxuXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzMywgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cblx0XHRjb25zdCB0b2tlbnMyID0gc3RvcmUuZ2V0VG9rZW5zSW5SYW5nZSgzNiwgNTkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zMiwgW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzYsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNywgbGVuZ3RoOiAyLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDM5LCBsZW5ndGg6IDUsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQ0LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNDUsIGxlbmd0aDogMSwgdG9rZW46IDU1NzEyNCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNDYsIGxlbmd0aDogNCwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1MCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUxLCBsZW5ndGg6IDcsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDU4LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9XG5cdFx0XSk7XG5cblx0fSk7XG5cblx0dGVzdCgnSW5zZXJ0IG5ldyBsaW5lIGFuZCByZW1vdmUgdGFicyAoc3BsaXQgdG9rZW5zKScsICgpID0+IHtcblx0XHQvLyBjbGFzcyBBIHtcblx0XHQvLyBcdGEoKSB7XG5cdFx0Ly8gXHR9XG5cdFx0Ly8gfVxuXHRcdC8vXG5cdFx0Ly8gaW50ZXJmYWNlIEkge1xuXHRcdC8vXG5cdFx0Ly8gfVxuXG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgVG9rZW5TdG9yZSh0ZXh0TW9kZWwpO1xuXHRcdHN0b3JlLmJ1aWxkU3RvcmUoW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiA1LCB0b2tlbjogMTk2Njc2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAxLCB0b2tlbjogNTU3MTI0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA3LCBsZW5ndGg6IDMsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTAsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxMSwgbGVuZ3RoOiAxLCB0b2tlbjogNTI0MzU2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxMiwgbGVuZ3RoOiA1LCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDE3LCBsZW5ndGg6IDMsIHRva2VuOiAzMjgzNiB9LCAvLyBUaGlzIGlzIHRoZSBjbG9zaW5nIGN1cmx5IGJyYWNlIGxpbmUgb2YgYSgpXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyMCwgbGVuZ3RoOiAyLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIyLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjMsIGxlbmd0aDogOSwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzIsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzMywgbGVuZ3RoOiAxLCB0b2tlbjogNTU3MTI0IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNCwgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDM3LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzgsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Y29uc3QgdG9rZW5zMCA9IHN0b3JlLmdldFRva2Vuc0luUmFuZ2UoMjMsIDM5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2VuczAsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIzLCBsZW5ndGg6IDksIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMyLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzMsIGxlbmd0aDogMSwgdG9rZW46IDU1NzEyNCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzQsIGxlbmd0aDogMywgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNywgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDM4LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9XG5cdFx0XSk7XG5cblx0XHQvLyBJbnNlcnQgYSBuZXcgbGluZSBhZnRlciBhKCkgeyB9LCB3aGljaCB3aWxsIGFkZCAyIHRhYnNcblx0XHRzdG9yZS51cGRhdGUoMjEsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogNSwgdG9rZW46IDE5NjY3NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNSwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogMSwgdG9rZW46IDU1NzEyNCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNywgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDEwLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTEsIGxlbmd0aDogMSwgdG9rZW46IDUyNDM1NiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTIsIGxlbmd0aDogNSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxNywgbGVuZ3RoOiAzLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIwLCBsZW5ndGg6IDMsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjMsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Y29uc3QgdG9rZW5zMSA9IHN0b3JlLmdldFRva2Vuc0luUmFuZ2UoMjYsIDQyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2VuczEsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDI2LCBsZW5ndGg6IDksIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDM1LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzYsIGxlbmd0aDogMSwgdG9rZW46IDU1NzEyNCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzcsIGxlbmd0aDogMywgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0MCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQxLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9XG5cdFx0XSk7XG5cblx0XHQvLyBJbnNlcnQgYW5vdGhlciBuZXcgbGluZSBhdCB0aGUgY3Vyc29yLCB3aGljaCB3aWxsIGFsc28gY2F1c2UgdGhlIDIgdGFicyB0byBiZSBkZWxldGVkXG5cdFx0c3RvcmUudXBkYXRlKDI0LCBbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDUsIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA2LCBsZW5ndGg6IDEsIHRva2VuOiA1NTcxMjQgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDcsIGxlbmd0aDogMywgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAxMCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDExLCBsZW5ndGg6IDEsIHRva2VuOiA1MjQzNTYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDEyLCBsZW5ndGg6IDUsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMTcsIGxlbmd0aDogMywgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyMCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIxLCBsZW5ndGg6IDIsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjMsIGxlbmd0aDogMSwgdG9rZW46IDMyODM2IH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXG5cdFx0Y29uc3QgdG9rZW5zMiA9IHN0b3JlLmdldFRva2Vuc0luUmFuZ2UoMjYsIDQyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2VuczIsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDI2LCBsZW5ndGg6IDksIHRva2VuOiAxOTY2NzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDM1LCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzYsIGxlbmd0aDogMSwgdG9rZW46IDU1NzEyNCB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzcsIGxlbmd0aDogMywgdG9rZW46IDMyODM2IH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA0MCwgbGVuZ3RoOiAxLCB0b2tlbjogMzI4MzYgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDQxLCBsZW5ndGg6IDEsIHRva2VuOiAzMjgzNiB9XG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZSByZW1vdmVzIHRva2VucyBpbiB0aGUgbWlkZGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRva2VuU3RvcmUodGV4dE1vZGVsKTtcblx0XHRzdG9yZS5idWlsZFN0b3JlKFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogMywgdG9rZW46IDEgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMsIGxlbmd0aDogMywgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogMywgdG9rZW46IDMgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cdFx0c3RvcmUuZGVsZXRlKDMsIDMpOyAvLyBkZWxldGUgMyBjaGFycyBzdGFydGluZyBhdCBvZmZzZXQgM1xuXHRcdGNvbnN0IHRva2VucyA9IHN0b3JlLmdldFRva2Vuc0luUmFuZ2UoMCwgOSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnMsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogMywgdG9rZW46IDEgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMsIGxlbmd0aDogMywgdG9rZW46IDMgfVxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGUgbWVyZ2VzIHBhcnRpYWxseSBhZmZlY3RlZCB0b2tlbicsICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBUb2tlblN0b3JlKHRleHRNb2RlbCk7XG5cdFx0c3RvcmUuYnVpbGRTdG9yZShbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDUsIHRva2VuOiAxIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiA1LCBsZW5ndGg6IDUsIHRva2VuOiAyIH1cblx0XHRdLCBUb2tlblF1YWxpdHkuQWNjdXJhdGUpO1xuXHRcdHN0b3JlLmRlbGV0ZSgzLCA0KTsgLy8gcmVtb3ZlcyA0IGNoYXJzIHdpdGhpbiB0b2tlbiAxIGFuZCBwYXJ0aWFsbHkgdG9rZW4gMlxuXHRcdGNvbnN0IHRva2VucyA9IHN0b3JlLmdldFRva2Vuc0luUmFuZ2UoMCwgMTApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9rZW5zLCBbXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAwLCBsZW5ndGg6IDQsIHRva2VuOiAxIH0sXG5cdFx0XHQvLyB0b2tlbiAyIGlzIG5vdyBzaGlmdGVkIGxlZnQgYnkgNFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNCwgbGVuZ3RoOiAzLCB0b2tlbjogMiB9XG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2UgYSB0b2tlbiB3aXRoIGEgc2xpZ2h0bHkgbGFyZ2VyIHRva2VuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRva2VuU3RvcmUodGV4dE1vZGVsKTtcblx0XHRzdG9yZS5idWlsZFN0b3JlKFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogNSwgdG9rZW46IDEgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDUsIGxlbmd0aDogMSwgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogMSwgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDcsIGxlbmd0aDogMTcsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyNCwgbGVuZ3RoOiAxLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMjUsIGxlbmd0aDogNSwgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMwLCBsZW5ndGg6IDEsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzMSwgbGVuZ3RoOiAxLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzIsIGxlbmd0aDogNSwgdG9rZW46IDIgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cdFx0c3RvcmUudXBkYXRlKDE3LCBbeyBzdGFydE9mZnNldEluY2x1c2l2ZTogNywgbGVuZ3RoOiAxOSwgdG9rZW46IDAgfV0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7IC8vIHJlbW92ZXMgNCBjaGFycyB3aXRoaW4gdG9rZW4gMSBhbmQgcGFydGlhbGx5IHRva2VuIDJcblx0XHRjb25zdCB0b2tlbnMgPSBzdG9yZS5nZXRUb2tlbnNJblJhbmdlKDAsIDM5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRva2VucywgW1xuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMCwgbGVuZ3RoOiA1LCB0b2tlbjogMSB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNSwgbGVuZ3RoOiAxLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNiwgbGVuZ3RoOiAxLCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogNywgbGVuZ3RoOiAxOSwgdG9rZW46IDAgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDI2LCBsZW5ndGg6IDEsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAyNywgbGVuZ3RoOiA1LCB0b2tlbjogMiB9LFxuXHRcdFx0eyBzdGFydE9mZnNldEluY2x1c2l2ZTogMzIsIGxlbmd0aDogMSwgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMzLCBsZW5ndGg6IDEsIHRva2VuOiAyIH0sXG5cdFx0XHR7IHN0YXJ0T2Zmc2V0SW5jbHVzaXZlOiAzNCwgbGVuZ3RoOiA1LCB0b2tlbjogMiB9XG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2UgYSBjaGFyYWN0ZXIgZnJvbSBhIGxhcmdlIHRva2VuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gbmV3IFRva2VuU3RvcmUodGV4dE1vZGVsKTtcblx0XHRzdG9yZS5idWlsZFN0b3JlKFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogMiwgdG9rZW46IDEgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIsIGxlbmd0aDogNSwgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDcsIGxlbmd0aDogMSwgdG9rZW46IDMgfVxuXHRcdF0sIFRva2VuUXVhbGl0eS5BY2N1cmF0ZSk7XG5cdFx0c3RvcmUuZGVsZXRlKDEsIDMpO1xuXHRcdGNvbnN0IHRva2VucyA9IHN0b3JlLmdldFRva2Vuc0luUmFuZ2UoMCwgNyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b2tlbnMsIFtcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDAsIGxlbmd0aDogMiwgdG9rZW46IDEgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDIsIGxlbmd0aDogMSwgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDMsIGxlbmd0aDogMywgdG9rZW46IDIgfSxcblx0XHRcdHsgc3RhcnRPZmZzZXRJbmNsdXNpdmU6IDYsIGxlbmd0aDogMSwgdG9rZW46IDMgfVxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuXG4i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ckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLElBQUksT0FBTyxPQUFPO0FBQUEsTUFDdEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsSUFDckQsR0FBRyxhQUFhLFFBQVE7QUFBQSxFQUV6QixDQUFDO0FBQ0QsT0FBSywwQkFBMEIsTUFBTTtBQVNwQyxVQUFNLFFBQVEsSUFBSSxXQUFXLFNBQVM7QUFDdEMsVUFBTSxXQUFXO0FBQUEsTUFDaEIsRUFBRSxzQkFBc0IsR0FBRyxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsR0FBRyxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDbkQsRUFBRSxzQkFBc0IsR0FBRyxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsR0FBRyxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDbkQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxR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LFFBQVEsRUFBRTtBQUFBLElBQ3RELENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRCxPQUFLLDJCQUEyQixNQUFNO0FBVXJDLFVBQU0sUUFBUSxJQUFJLFdBQVcsU0FBUztBQUN0QyxVQUFNLFdBQVc7QUFBQSxNQUNoQixFQUFFLHNCQUFzQixHQUFHLFFBQVEsR0FBRyxPQUFPLE9BQU87QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixHQUFHLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNuRCxFQUFFLHNCQUFzQixHQUFHLFFBQVEsR0FBRyxPQUFPLE9BQU87QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE9BQU87QUFBQSxNQUNyRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE9BQU87QUFBQSxNQUNyRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQSxNQUNwRCxFQUFFLHNCQUFzQixJQUFJLFFBQVEsR0FBRyxPQUFPLE1BQU07QUFBQTtBQUFBLE1BQ3BELEVBQUUsc0JBQXNCLElBQUksUUFBUSxHQUFHLE9BQU8sTUFBTTtBQUFBLE1BQ3BELEVBQUUsc0JBQXNCLElBQUksUUFBUSxHQUFHLE9BQU8sT0FBTztBQUFBLE1BQ3JELEVBQUUsc0JBQXNCLElBQUksUUFBUSxHQUFHLE9BQU8sTUFBTTtBQUFBLE1BQ3BELEVBQUUsc0JBQXNCLElBQUksUUFBUSxHQUFHLE9BQU8sT0FBTztBQUFBLE1BQ3JELEVBQUUsc0JBQXNCLElBQUksUUFBUSxHQUFHLE9BQU8sTUFBTTtBQUFBLE1BQ3BELEVBQUUs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QkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsSUFDdEQsQ0FBQztBQUdELFVBQU0sT0FBTyxJQUFJO0FBQUEsTUFDaEIsRUFBRSxzQkFBc0IsR0FBRyxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsR0FBRyxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDbkQsRUFBRSxzQkFBc0IsR0FBRyxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxPQUFPO0FBQUEsTUFDckQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxzQkFBc0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxNQUFNO0FBQUEsTUFDcEQsRUFBRSxz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
