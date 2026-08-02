import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import * as Adapt from "../../../common/model/objectMutationLog.js";
import { equals } from "../../../../../../base/common/objects.js";
suite("ChatSessionOperationLog", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createTestSchema() {
    const itemSchema = Adapt.object({
      id: Adapt.t((i) => i.id, Adapt.key()),
      value: Adapt.t((i) => i.value, Adapt.value())
    });
    return Adapt.object({
      name: Adapt.t((o) => o.name, Adapt.value()),
      count: Adapt.t((o) => o.count, Adapt.value()),
      items: Adapt.t((o) => o.items, Adapt.array(itemSchema)),
      metadata: Adapt.v((o) => o.metadata, equals)
    });
  }
  function simulateFileRoundtrip(adapter, initial, updates) {
    let fileContent = adapter.createInitial(initial);
    for (const update of updates) {
      const result = adapter.write(update);
      if (result.op === "replace") {
        fileContent = result.data;
      } else {
        fileContent = VSBuffer.concat([fileContent, result.data]);
      }
      adapter.confirmWrite();
    }
    const reader = new Adapt.ObjectMutationLog(createTestSchema());
    return reader.read(fileContent);
  }
  suite("Transform factories", () => {
    test("key uses strict equality by default", () => {
      const transform = Adapt.key();
      assert.strictEqual(transform.equals("a", "a"), true);
      assert.strictEqual(transform.equals("a", "b"), false);
    });
    test("key uses custom comparator", () => {
      const transform = Adapt.key((a, b) => a.id === b.id);
      assert.strictEqual(transform.equals({ id: 1 }, { id: 1 }), true);
      assert.strictEqual(transform.equals({ id: 1 }, { id: 2 }), false);
    });
    test("primitive uses strict equality", () => {
      const transform = Adapt.value();
      assert.strictEqual(transform.equals(1, 1), true);
      assert.strictEqual(transform.equals(1, 2), false);
    });
    test("primitive with custom comparator", () => {
      const transform = Adapt.value((a, b) => a.toLowerCase() === b.toLowerCase());
      assert.strictEqual(transform.equals("ABC", "abc"), true);
      assert.strictEqual(transform.equals("ABC", "def"), false);
    });
    test("object extracts and compares properties", () => {
      const schema = Adapt.object({
        x: Adapt.t((o) => o.x, Adapt.value()),
        y: Adapt.t((o) => o.y, Adapt.value())
      });
      const extracted = schema.extract({ x: 1, y: "test" });
      assert.strictEqual(extracted.x, 1);
      assert.strictEqual(extracted.y, "test");
    });
    test("t composes getter with transform", () => {
      const transform = Adapt.t(
        (obj) => obj.nested.value,
        Adapt.value()
      );
      assert.strictEqual(transform.extract({ nested: { value: 42 } }), 42);
    });
    test("differentiated uses separate extract and equals functions", () => {
      const transform = Adapt.v(
        (obj) => `${obj.type}:${obj.data}`,
        (a, b) => a.split(":")[0] === b.split(":")[0]
        // compare only the type prefix
      );
      const extracted = transform.extract({ type: "test", data: 123 });
      assert.strictEqual(extracted, "test:123");
      assert.strictEqual(transform.equals("test:123", "test:456"), true);
      assert.strictEqual(transform.equals("test:123", "other:123"), false);
    });
  });
  suite("LogAdapter", () => {
    test("createInitial creates valid log entry", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const initial = { name: "test", count: 0, items: [] };
      const buffer = adapter.createInitial(initial);
      const content = buffer.toString();
      const entry = JSON.parse(content.trim());
      assert.strictEqual(entry.kind, 0);
      assert.deepStrictEqual(entry.v, initial);
    });
    test("read reconstructs initial state", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const initial = { name: "test", count: 5, items: [{ id: "a", value: 1 }] };
      const buffer = adapter.createInitial(initial);
      const reader = new Adapt.ObjectMutationLog(schema);
      const result = reader.read(buffer);
      assert.deepStrictEqual(result, initial);
    });
    test("write returns empty data when no changes", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 0, items: [] };
      adapter.createInitial(obj);
      const result = adapter.write(obj);
      assert.strictEqual(result.op, "append");
      assert.strictEqual(result.data.toString(), "");
    });
    test("write detects primitive changes", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 0, items: [] };
      adapter.createInitial(obj);
      const updated = { ...obj, count: 10 };
      const result = adapter.write(updated);
      assert.strictEqual(result.op, "append");
      const entry = JSON.parse(result.data.toString().trim());
      assert.strictEqual(entry.kind, 1);
      assert.deepStrictEqual(entry.k, ["count"]);
      assert.strictEqual(entry.v, 10);
    });
    test("write detects array append", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 0, items: [{ id: "a", value: 1 }] };
      adapter.createInitial(obj);
      const updated = { ...obj, items: [...obj.items, { id: "b", value: 2 }] };
      const result = adapter.write(updated);
      const entry = JSON.parse(result.data.toString().trim());
      assert.strictEqual(entry.kind, 2);
      assert.deepStrictEqual(entry.k, ["items"]);
      assert.deepStrictEqual(entry.v, [{ id: "b", value: 2 }]);
      assert.strictEqual(entry.i, void 0);
    });
    test("write detects array append nested", () => {
      const itemSchema = Adapt.object({
        id: Adapt.t((i) => i.id, Adapt.key()),
        value: Adapt.t((i) => i.value, Adapt.array(Adapt.value()))
      });
      const schema = Adapt.object({
        items: Adapt.t((o) => o.items, Adapt.array(itemSchema))
      });
      const adapter = new Adapt.ObjectMutationLog(schema);
      adapter.createInitial({ items: [{ id: "a", value: [1, 2] }] });
      const result1 = adapter.write({ items: [{ id: "a", value: [1, 2, 3] }] });
      adapter.confirmWrite();
      assert.deepStrictEqual(
        JSON.parse(result1.data.toString().trim()),
        { kind: 2, k: ["items", 0, "value"], v: [3] }
      );
      const result2 = adapter.write({ items: [{ id: "b", value: [1, 2, 3] }] });
      assert.deepStrictEqual(
        JSON.parse(result2.data.toString().trim()),
        { kind: 2, k: ["items"], i: 0, v: [{ id: "b", value: [1, 2, 3] }] }
      );
    });
    test("write detects array truncation", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 0, items: [{ id: "a", value: 1 }, { id: "b", value: 2 }] };
      adapter.createInitial(obj);
      const updated = { ...obj, items: [obj.items[0]] };
      const result = adapter.write(updated);
      const entry = JSON.parse(result.data.toString().trim());
      assert.strictEqual(entry.kind, 2);
      assert.deepStrictEqual(entry.k, ["items"]);
      assert.strictEqual(entry.i, 1);
      assert.strictEqual(entry.v, void 0);
    });
    test("write detects array item modification and recurses into object", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = {
        name: "test",
        count: 0,
        items: [{ id: "a", value: 1 }, { id: "b", value: 2 }, { id: "c", value: 3 }]
      };
      adapter.createInitial(obj);
      const updated = {
        ...obj,
        items: [{ id: "a", value: 1 }, { id: "b", value: 999 }, { id: "c", value: 3 }]
      };
      const result = adapter.write(updated);
      const entry = JSON.parse(result.data.toString().trim());
      assert.strictEqual(entry.kind, 1);
      assert.deepStrictEqual(entry.k, ["items", 1, "value"]);
      assert.strictEqual(entry.v, 999);
    });
    test("read applies multiple entries correctly", () => {
      const schema = createTestSchema();
      const initial = { name: "test", count: 0, items: [] };
      const entries = [
        { kind: 0, v: initial },
        { kind: 1, k: ["count"], v: 5 },
        { kind: 2, k: ["items"], v: [{ id: "a", value: 1 }] },
        { kind: 2, k: ["items"], v: [{ id: "b", value: 2 }] }
      ];
      const logContent = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
      const adapter = new Adapt.ObjectMutationLog(schema);
      const result = adapter.read(VSBuffer.fromString(logContent));
      assert.strictEqual(result.count, 5);
      assert.strictEqual(result.items.length, 2);
      assert.deepStrictEqual(result.items[0], { id: "a", value: 1 });
      assert.deepStrictEqual(result.items[1], { id: "b", value: 2 });
    });
    test("roundtrip preserves data through multiple updates", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const initial = { name: "test", count: 0, items: [] };
      const updates = [
        { name: "test", count: 1, items: [] },
        { name: "test", count: 1, items: [{ id: "a", value: 10 }] },
        { name: "test", count: 2, items: [{ id: "a", value: 10 }, { id: "b", value: 20 }] },
        { name: "test", count: 2, items: [{ id: "a", value: 10 }] }
        // Remove item
      ];
      const result = simulateFileRoundtrip(adapter, initial, updates);
      assert.deepStrictEqual(result, updates[updates.length - 1]);
    });
    test("compacts log when entry count exceeds threshold", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema, 3);
      const obj = { name: "test", count: 0, items: [] };
      adapter.createInitial(obj);
      adapter.write({ ...obj, count: 1 });
      adapter.confirmWrite();
      adapter.write({ ...obj, count: 2 });
      adapter.confirmWrite();
      const before = adapter.write({ ...obj, count: 3 });
      adapter.confirmWrite();
      assert.strictEqual(before.op, "append");
      const result = adapter.write({ ...obj, count: 4 });
      assert.strictEqual(result.op, "replace");
      const lines = result.data.toString().split("\n").filter((l) => l.trim());
      assert.strictEqual(lines.length, 1);
      const entry = JSON.parse(lines[0]);
      assert.strictEqual(entry.kind, 0);
    });
    test("handles deepCompare property changes", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 0, items: [], metadata: { tags: ["a"] } };
      adapter.createInitial(obj);
      const updated = { ...obj, metadata: { tags: ["a", "b"] } };
      const result = adapter.write(updated);
      const entry = JSON.parse(result.data.toString().trim());
      assert.strictEqual(entry.kind, 1);
      assert.deepStrictEqual(entry.k, ["metadata"]);
      assert.deepStrictEqual(entry.v, { tags: ["a", "b"] });
    });
    test("handles differentiated property changes", () => {
      const schema = Adapt.object({
        data: Adapt.t(
          (o) => o.data,
          Adapt.v(
            (obj) => `${obj.type}:${obj.version}`,
            (a, b) => a.split(":")[0] === b.split(":")[0]
            // compare only the type prefix
          )
        )
      });
      const adapter = new Adapt.ObjectMutationLog(schema);
      adapter.createInitial({ data: { type: "foo", version: 1 } });
      const result1 = adapter.write({ data: { type: "bar", version: 2 } });
      adapter.confirmWrite();
      assert.notStrictEqual(result1.data.toString(), "", "different type should trigger change");
      const entry1 = JSON.parse(result1.data.toString().trim());
      assert.strictEqual(entry1.kind, 1);
      assert.deepStrictEqual(entry1.k, ["data"]);
      assert.strictEqual(entry1.v, "bar:2");
      const result2 = adapter.write({ data: { type: "bar", version: 3 } });
      assert.strictEqual(result2.data.toString(), "", "same type prefix should not trigger change");
    });
    test("read throws on empty log file", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      assert.throws(() => adapter.read(VSBuffer.fromString("")), /Empty log file/);
    });
    test("write without prior read creates initial entry", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 5, items: [] };
      const result = adapter.write(obj);
      assert.strictEqual(result.op, "replace");
      const entry = JSON.parse(result.data.toString().trim());
      assert.strictEqual(entry.kind, 0);
    });
    test("sealed objects skip non-key field comparison when both are sealed", () => {
      const itemSchema = Adapt.object({
        id: Adapt.t((i) => i.id, Adapt.key()),
        value: Adapt.t((i) => i.value, Adapt.value()),
        isSealed: Adapt.t((i) => i.isSealed, Adapt.value())
      }, {
        sealed: (obj) => obj.isSealed
      });
      const schema = Adapt.object({
        items: Adapt.t((o) => o.items, Adapt.array(itemSchema))
      });
      const adapter = new Adapt.ObjectMutationLog(schema);
      adapter.createInitial({ items: [{ id: "a", value: 1, isSealed: true }] });
      const result1 = adapter.write({ items: [{ id: "a", value: 999, isSealed: true }] });
      assert.strictEqual(result1.data.toString(), "", "sealed item value change should be ignored");
    });
    test("sealed objects still detect key changes", () => {
      const itemSchema = Adapt.object({
        id: Adapt.t((i) => i.id, Adapt.key()),
        value: Adapt.t((i) => i.value, Adapt.value()),
        isSealed: Adapt.t((i) => i.isSealed, Adapt.value())
      }, {
        sealed: (obj) => obj.isSealed
      });
      const schema = Adapt.object({
        items: Adapt.t((o) => o.items, Adapt.array(itemSchema))
      });
      const adapter = new Adapt.ObjectMutationLog(schema);
      adapter.createInitial({ items: [{ id: "a", value: 1, isSealed: true }] });
      const result = adapter.write({ items: [{ id: "b", value: 1, isSealed: true }] });
      assert.notStrictEqual(result.data.toString(), "", "key change should be detected even when sealed");
      const entry = JSON.parse(result.data.toString().trim());
      assert.strictEqual(entry.kind, 2);
    });
    test("sealed objects diff normally when one is not sealed", () => {
      const itemSchema = Adapt.object({
        id: Adapt.t((i) => i.id, Adapt.key()),
        value: Adapt.t((i) => i.value, Adapt.value()),
        isSealed: Adapt.t((i) => i.isSealed, Adapt.value())
      }, {
        sealed: (obj) => obj.isSealed
      });
      const schema = Adapt.object({
        items: Adapt.t((o) => o.items, Adapt.array(itemSchema))
      });
      const adapter = new Adapt.ObjectMutationLog(schema);
      adapter.createInitial({ items: [{ id: "a", value: 1, isSealed: false }] });
      const result1 = adapter.write({ items: [{ id: "a", value: 999, isSealed: false }] });
      assert.notStrictEqual(result1.data.toString(), "", "non-sealed item should detect value change");
      const entry = JSON.parse(result1.data.toString().trim());
      assert.strictEqual(entry.kind, 1);
      assert.deepStrictEqual(entry.k, ["items", 0, "value"]);
      assert.strictEqual(entry.v, 999);
    });
    test("sealed transition from unsealed to sealed detects final changes", () => {
      const itemSchema = Adapt.object({
        id: Adapt.t((i) => i.id, Adapt.key()),
        value: Adapt.t((i) => i.value, Adapt.value()),
        isSealed: Adapt.t((i) => i.isSealed, Adapt.value())
      }, {
        sealed: (obj) => obj.isSealed
      });
      const schema = Adapt.object({
        items: Adapt.t((o) => o.items, Adapt.array(itemSchema))
      });
      const adapter = new Adapt.ObjectMutationLog(schema);
      adapter.createInitial({ items: [{ id: "a", value: 1, isSealed: false }] });
      const result = adapter.write({ items: [{ id: "a", value: 999, isSealed: true }] });
      assert.notStrictEqual(result.data.toString(), "", "transition to sealed should detect value change");
      const lines = result.data.toString().trim().split("\n");
      assert.strictEqual(lines.length, 2, "should have two change entries");
    });
    test("write detects property set to undefined", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const initial = { name: "test", count: 5, items: [], metadata: { tags: ["foo"] } };
      const result = simulateFileRoundtrip(adapter, initial, [
        { name: "test", count: 10, items: [], metadata: { tags: ["foo"] } },
        { name: "test", count: void 0, items: [], metadata: void 0 }
      ]);
      assert.deepStrictEqual(result, { name: "test", count: void 0, items: [], metadata: void 0 });
      const result2 = simulateFileRoundtrip(adapter, initial, [
        { name: "test", count: 10, items: [], metadata: { tags: ["foo"] } },
        { name: "test", count: void 0, items: [], metadata: void 0 },
        { name: "test", count: 12, items: [], metadata: { tags: ["bar"] } }
      ]);
      assert.deepStrictEqual(result2, { name: "test", count: 12, items: [], metadata: { tags: ["bar"] } });
    });
    test("delete followed by set restores property", () => {
      const schema = createTestSchema();
      const initial = { name: "test", count: 0, items: [], metadata: { tags: ["a"] } };
      const entries = [
        { kind: 0, v: initial },
        { kind: 3, k: ["metadata"] },
        // Delete
        { kind: 1, k: ["metadata"], v: { tags: ["b", "c"] } }
        // Set to new value
      ];
      const logContent = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
      const adapter = new Adapt.ObjectMutationLog(schema);
      const result = adapter.read(VSBuffer.fromString(logContent));
      assert.deepStrictEqual(result.metadata, { tags: ["b", "c"] });
    });
    test("write without confirmWrite resets to initial on next write", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 0, items: [] };
      const result1 = adapter.write(obj);
      assert.strictEqual(result1.op, "replace");
      const result2 = adapter.write({ ...obj, count: 2 });
      assert.deepStrictEqual(
        { op: result2.op, entry: JSON.parse(result2.data.toString().trim()) },
        { op: "replace", entry: { kind: 0, v: { name: "test", count: 2, items: [] } } }
      );
    });
    test("confirmWrite commits state so next write is incremental", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 0, items: [] };
      adapter.createInitial(obj);
      adapter.write({ ...obj, count: 1 });
      adapter.confirmWrite();
      const result = adapter.write({ ...obj, count: 2 });
      assert.deepStrictEqual(
        { op: result.op, entry: JSON.parse(result.data.toString().trim()) },
        { op: "append", entry: { kind: 1, k: ["count"], v: 2 } }
      );
    });
    test("read throws on log file missing initial entry", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const logContent = JSON.stringify({ kind: 1, k: ["count"], v: 5 }) + "\n";
      assert.throws(() => adapter.read(VSBuffer.fromString(logContent)), /missing an initial entry/);
    });
    test("failed first write followed by successful write produces valid roundtrip", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const initial = { name: "test", count: 0, items: [] };
      const r1 = adapter.write(initial);
      assert.strictEqual(r1.op, "replace");
      const r2 = adapter.write({ ...initial, count: 3 });
      assert.strictEqual(r2.op, "replace");
      adapter.confirmWrite();
      const fileContent = r2.data;
      const reader = new Adapt.ObjectMutationLog(createTestSchema());
      const result = reader.read(fileContent);
      assert.strictEqual(result.count, 3);
    });
    test("unconfirmed append after createInitial still diffs against initial", () => {
      const schema = createTestSchema();
      const adapter = new Adapt.ObjectMutationLog(schema);
      const obj = { name: "test", count: 0, items: [] };
      let fileContent = adapter.createInitial(obj);
      const r1 = adapter.write({ ...obj, count: 1 });
      assert.strictEqual(r1.op, "append");
      const r2 = adapter.write({ ...obj, count: 2 });
      assert.strictEqual(r2.op, "append");
      adapter.confirmWrite();
      fileContent = VSBuffer.concat([fileContent, r2.data]);
      const reader = new Adapt.ObjectMutationLog(createTestSchema());
      const result = reader.read(fileContent);
      assert.strictEqual(result.count, 2);
    });
  });
  suite("persistence size safety net", () => {
    test("makeTruncatingReplacer truncates an oversized string", () => {
      const big = "x".repeat(2 * 1024 * 1024);
      const obj = { content: big, label: "ok" };
      const json = JSON.stringify(obj, Adapt.makeTruncatingReplacer(1024 * 1024, 10 * 1024 * 1024));
      const parsed = JSON.parse(json);
      assert.notStrictEqual(parsed.content, big);
      assert.ok(parsed.content.startsWith("[VS Code:"));
      assert.strictEqual(parsed.label, "ok");
    });
    test("makeTruncatingReplacer respects total budget without overshooting", () => {
      const STRING_CAP = 1024 * 1024;
      const TOTAL_CAP = 1024 * 1024;
      const medium = "y".repeat(200 * 1024);
      const obj = {};
      for (let i = 0; i < 20; i++) {
        obj[`k${i}`] = medium;
      }
      const json = JSON.stringify(obj, Adapt.makeTruncatingReplacer(STRING_CAP, TOTAL_CAP));
      const parsed = JSON.parse(json);
      const preservedChars = Object.values(parsed).filter((v) => typeof v === "string" && v === medium).reduce((sum, v) => sum + v.length, 0);
      assert.ok(preservedChars <= TOTAL_CAP, `preserved ${preservedChars} chars exceeded budget ${TOTAL_CAP}`);
      assert.strictEqual(parsed.k0, medium);
      assert.ok(Object.values(parsed).some((v) => typeof v === "string" && v.includes("entry exceeded size budget")));
    });
    test("stringifyEntryWithFallback succeeds with no overhead on small entries", () => {
      const entry = { kind: 0, v: { foo: "bar", n: 42 } };
      const out = Adapt.stringifyEntryWithFallback(entry);
      assert.strictEqual(out, JSON.stringify(entry));
    });
    test("stringifyEntryWithFallback rethrows non-RangeError", () => {
      const circular = {};
      circular.self = circular;
      assert.throws(() => Adapt.stringifyEntryWithFallback(circular), TypeError);
    });
    test("stringifyEntryWithFallback recovers when JSON.stringify throws RangeError", () => {
      let calls = 0;
      const entry = {
        toJSON() {
          calls++;
          if (calls === 1) {
            throw new RangeError("Invalid string length");
          }
          return { content: "recovered" };
        }
      };
      const out = Adapt.stringifyEntryWithFallback(entry);
      assert.strictEqual(calls, 2, "should have been called twice (initial + retry)");
      assert.deepStrictEqual(JSON.parse(out), { content: "recovered" });
    });
    test("stringifyEntryWithFallback applies truncating replacer on RangeError retry", () => {
      const big = "x".repeat(2 * 1024 * 1024);
      let calls = 0;
      const entry = {
        toJSON() {
          calls++;
          if (calls === 1) {
            throw new RangeError("Invalid string length");
          }
          return { content: big, label: "ok" };
        }
      };
      const out = Adapt.stringifyEntryWithFallback(entry);
      const parsed = JSON.parse(out);
      assert.notStrictEqual(parsed.content, big);
      assert.ok(parsed.content.startsWith("[VS Code:"), `unexpected: ${parsed.content.slice(0, 80)}`);
      assert.strictEqual(parsed.label, "ok");
    });
    test("deepCloneWithFallback returns a structural clone on the common path", () => {
      const original = { a: 1, nested: { b: "two", list: [1, 2, 3] } };
      const clone = Adapt.deepCloneWithFallback(original);
      assert.deepStrictEqual(clone, original);
      assert.notStrictEqual(clone, original);
      assert.notStrictEqual(clone.nested, original.nested);
    });
    test("deepCloneWithFallback recovers from RangeError during the clone", () => {
      const big = "x".repeat(2 * 1024 * 1024);
      let calls = 0;
      const value = {
        huge: big,
        label: "ok",
        toJSON() {
          calls++;
          if (calls === 1) {
            throw new RangeError("Invalid string length");
          }
          return { huge: big, label: "ok" };
        }
      };
      const clone = Adapt.deepCloneWithFallback(value);
      assert.strictEqual(calls, 2, "should have been called twice (initial + retry)");
      assert.strictEqual(clone.label, "ok");
      assert.notStrictEqual(clone.huge, big);
      assert.ok(clone.huge.startsWith("[VS Code:"), `unexpected: ${clone.huge.slice(0, 80)}`);
    });
    test("value().extract recovers when the deep-clone throws RangeError", () => {
      const big = "x".repeat(2 * 1024 * 1024);
      let calls = 0;
      const huge = {
        kept: "meta",
        toJSON() {
          calls++;
          if (calls === 1) {
            throw new RangeError("Invalid string length");
          }
          return { dump: big, kept: "meta" };
        }
      };
      const transform = Adapt.value((a, b) => a.dump === b.dump && a.kept === b.kept);
      const extracted = transform.extract(huge);
      assert.strictEqual(calls, 2);
      assert.strictEqual(extracted.kept, "meta");
      assert.ok(extracted.dump.startsWith("[VS Code:"));
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vbW9kZWwvY2hhdFNlc3Npb25PcGVyYXRpb25Mb2cudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0ICogYXMgQWRhcHQgZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL29iamVjdE11dGF0aW9uTG9nLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuXG5zdWl0ZSgnQ2hhdFNlc3Npb25PcGVyYXRpb25Mb2cnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIFRlc3QgZGF0YSB0eXBlc1xuXHRpbnRlcmZhY2UgVGVzdEl0ZW0ge1xuXHRcdGlkOiBzdHJpbmc7XG5cdFx0dmFsdWU6IG51bWJlcjtcblx0fVxuXG5cdGludGVyZmFjZSBUZXN0T2JqZWN0IHtcblx0XHRuYW1lOiBzdHJpbmc7XG5cdFx0Y291bnQ/OiBudW1iZXI7XG5cdFx0aXRlbXM6IFRlc3RJdGVtW107XG5cdFx0bWV0YWRhdGE/OiB7IHRhZ3M6IHN0cmluZ1tdIH07XG5cdH1cblxuXHQvLyBIZWxwZXIgdG8gY3JlYXRlIGEgc2ltcGxlIHNjaGVtYSBmb3IgdGVzdGluZ1xuXHRmdW5jdGlvbiBjcmVhdGVUZXN0U2NoZW1hKCkge1xuXHRcdGNvbnN0IGl0ZW1TY2hlbWEgPSBBZGFwdC5vYmplY3Q8VGVzdEl0ZW0sIFRlc3RJdGVtPih7XG5cdFx0XHRpZDogQWRhcHQudChpID0+IGkuaWQsIEFkYXB0LmtleSgpKSxcblx0XHRcdHZhbHVlOiBBZGFwdC50KGkgPT4gaS52YWx1ZSwgQWRhcHQudmFsdWUoKSksXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gQWRhcHQub2JqZWN0PFRlc3RPYmplY3QsIFRlc3RPYmplY3Q+KHtcblx0XHRcdG5hbWU6IEFkYXB0LnQobyA9PiBvLm5hbWUsIEFkYXB0LnZhbHVlKCkpLFxuXHRcdFx0Y291bnQ6IEFkYXB0LnQobyA9PiBvLmNvdW50LCBBZGFwdC52YWx1ZSgpKSxcblx0XHRcdGl0ZW1zOiBBZGFwdC50KG8gPT4gby5pdGVtcywgQWRhcHQuYXJyYXkoaXRlbVNjaGVtYSkpLFxuXHRcdFx0bWV0YWRhdGE6IEFkYXB0LnYobyA9PiBvLm1ldGFkYXRhLCBlcXVhbHMpLFxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gSGVscGVyIHRvIHNpbXVsYXRlIGZpbGUgb3BlcmF0aW9uc1xuXHRmdW5jdGlvbiBzaW11bGF0ZUZpbGVSb3VuZHRyaXAoYWRhcHRlcjogQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2c8VGVzdE9iamVjdCwgVGVzdE9iamVjdD4sIGluaXRpYWw6IFRlc3RPYmplY3QsIHVwZGF0ZXM6IFRlc3RPYmplY3RbXSk6IFRlc3RPYmplY3Qge1xuXHRcdGxldCBmaWxlQ29udGVudCA9IGFkYXB0ZXIuY3JlYXRlSW5pdGlhbChpbml0aWFsKTtcblxuXHRcdGZvciAoY29uc3QgdXBkYXRlIG9mIHVwZGF0ZXMpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkYXB0ZXIud3JpdGUodXBkYXRlKTtcblx0XHRcdGlmIChyZXN1bHQub3AgPT09ICdyZXBsYWNlJykge1xuXHRcdFx0XHRmaWxlQ29udGVudCA9IHJlc3VsdC5kYXRhO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZmlsZUNvbnRlbnQgPSBWU0J1ZmZlci5jb25jYXQoW2ZpbGVDb250ZW50LCByZXN1bHQuZGF0YV0pO1xuXHRcdFx0fVxuXHRcdFx0YWRhcHRlci5jb25maXJtV3JpdGUoKTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgbmV3IGFkYXB0ZXIgYW5kIHJlYWQgYmFja1xuXHRcdGNvbnN0IHJlYWRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhjcmVhdGVUZXN0U2NoZW1hKCkpO1xuXHRcdHJldHVybiByZWFkZXIucmVhZChmaWxlQ29udGVudCk7XG5cdH1cblxuXHRzdWl0ZSgnVHJhbnNmb3JtIGZhY3RvcmllcycsICgpID0+IHtcblx0XHR0ZXN0KCdrZXkgdXNlcyBzdHJpY3QgZXF1YWxpdHkgYnkgZGVmYXVsdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRyYW5zZm9ybSA9IEFkYXB0LmtleTxzdHJpbmc+KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhbnNmb3JtLmVxdWFscygnYScsICdhJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYW5zZm9ybS5lcXVhbHMoJ2EnLCAnYicpLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdrZXkgdXNlcyBjdXN0b20gY29tcGFyYXRvcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHRyYW5zZm9ybSA9IEFkYXB0LmtleTx7IGlkOiBudW1iZXIgfT4oKGEsIGIpID0+IGEuaWQgPT09IGIuaWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYW5zZm9ybS5lcXVhbHMoeyBpZDogMSB9LCB7IGlkOiAxIH0pLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc2Zvcm0uZXF1YWxzKHsgaWQ6IDEgfSwgeyBpZDogMiB9KSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJpbWl0aXZlIHVzZXMgc3RyaWN0IGVxdWFsaXR5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHJhbnNmb3JtID0gQWRhcHQudmFsdWU8bnVtYmVyLCBudW1iZXI+KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhbnNmb3JtLmVxdWFscygxLCAxKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhbnNmb3JtLmVxdWFscygxLCAyKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJpbWl0aXZlIHdpdGggY3VzdG9tIGNvbXBhcmF0b3InLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0cmFuc2Zvcm0gPSBBZGFwdC52YWx1ZTxzdHJpbmcsIHN0cmluZz4oKGEsIGIpID0+IGEudG9Mb3dlckNhc2UoKSA9PT0gYi50b0xvd2VyQ2FzZSgpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc2Zvcm0uZXF1YWxzKCdBQkMnLCAnYWJjJyksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYW5zZm9ybS5lcXVhbHMoJ0FCQycsICdkZWYnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb2JqZWN0IGV4dHJhY3RzIGFuZCBjb21wYXJlcyBwcm9wZXJ0aWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gQWRhcHQub2JqZWN0PHsgeDogbnVtYmVyOyB5OiBzdHJpbmcgfSwgeyB4OiBudW1iZXI7IHk6IHN0cmluZyB9Pih7XG5cdFx0XHRcdHg6IEFkYXB0LnQobyA9PiBvLngsIEFkYXB0LnZhbHVlKCkpLFxuXHRcdFx0XHR5OiBBZGFwdC50KG8gPT4gby55LCBBZGFwdC52YWx1ZSgpKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBleHRyYWN0ZWQgPSBzY2hlbWEuZXh0cmFjdCh7IHg6IDEsIHk6ICd0ZXN0JyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRyYWN0ZWQueCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFjdGVkLnksICd0ZXN0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0IGNvbXBvc2VzIGdldHRlciB3aXRoIHRyYW5zZm9ybScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRyYW5zZm9ybSA9IEFkYXB0LnQoXG5cdFx0XHRcdChvYmo6IHsgbmVzdGVkOiB7IHZhbHVlOiBudW1iZXIgfSB9KSA9PiBvYmoubmVzdGVkLnZhbHVlLFxuXHRcdFx0XHRBZGFwdC52YWx1ZTxudW1iZXIsIG51bWJlcj4oKVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYW5zZm9ybS5leHRyYWN0KHsgbmVzdGVkOiB7IHZhbHVlOiA0MiB9IH0pLCA0Mik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaWZmZXJlbnRpYXRlZCB1c2VzIHNlcGFyYXRlIGV4dHJhY3QgYW5kIGVxdWFscyBmdW5jdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0cmFuc2Zvcm0gPSBBZGFwdC52PHsgdHlwZTogc3RyaW5nOyBkYXRhOiBudW1iZXIgfSwgc3RyaW5nPihcblx0XHRcdFx0b2JqID0+IGAke29iai50eXBlfToke29iai5kYXRhfWAsXG5cdFx0XHRcdChhLCBiKSA9PiBhLnNwbGl0KCc6JylbMF0gPT09IGIuc3BsaXQoJzonKVswXSwgLy8gY29tcGFyZSBvbmx5IHRoZSB0eXBlIHByZWZpeFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgZXh0cmFjdGVkID0gdHJhbnNmb3JtLmV4dHJhY3QoeyB0eXBlOiAndGVzdCcsIGRhdGE6IDEyMyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRyYWN0ZWQsICd0ZXN0OjEyMycpO1xuXG5cdFx0XHQvLyBTYW1lIHR5cGUgcHJlZml4IHNob3VsZCBiZSBlcXVhbFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYW5zZm9ybS5lcXVhbHMoJ3Rlc3Q6MTIzJywgJ3Rlc3Q6NDU2JyksIHRydWUpO1xuXHRcdFx0Ly8gRGlmZmVyZW50IHR5cGUgcHJlZml4IHNob3VsZCBub3QgYmUgZXF1YWxcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFuc2Zvcm0uZXF1YWxzKCd0ZXN0OjEyMycsICdvdGhlcjoxMjMnKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTG9nQWRhcHRlcicsICgpID0+IHtcblx0XHR0ZXN0KCdjcmVhdGVJbml0aWFsIGNyZWF0ZXMgdmFsaWQgbG9nIGVudHJ5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gY3JlYXRlVGVzdFNjaGVtYSgpO1xuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXG5cdFx0XHRjb25zdCBpbml0aWFsOiBUZXN0T2JqZWN0ID0geyBuYW1lOiAndGVzdCcsIGNvdW50OiAwLCBpdGVtczogW10gfTtcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IGFkYXB0ZXIuY3JlYXRlSW5pdGlhbChpbml0aWFsKTtcblxuXHRcdFx0Y29uc3QgY29udGVudCA9IGJ1ZmZlci50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZW50cnkgPSBKU09OLnBhcnNlKGNvbnRlbnQudHJpbSgpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5raW5kLCAwKTsgLy8gRW50cnlLaW5kLkluaXRpYWxcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50cnkudiwgaW5pdGlhbCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkIHJlY29uc3RydWN0cyBpbml0aWFsIHN0YXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gY3JlYXRlVGVzdFNjaGVtYSgpO1xuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXG5cdFx0XHRjb25zdCBpbml0aWFsOiBUZXN0T2JqZWN0ID0geyBuYW1lOiAndGVzdCcsIGNvdW50OiA1LCBpdGVtczogW3sgaWQ6ICdhJywgdmFsdWU6IDEgfV0gfTtcblx0XHRcdGNvbnN0IGJ1ZmZlciA9IGFkYXB0ZXIuY3JlYXRlSW5pdGlhbChpbml0aWFsKTtcblxuXHRcdFx0Y29uc3QgcmVhZGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSByZWFkZXIucmVhZChidWZmZXIpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgaW5pdGlhbCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3cml0ZSByZXR1cm5zIGVtcHR5IGRhdGEgd2hlbiBubyBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gY3JlYXRlVGVzdFNjaGVtYSgpO1xuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXG5cdFx0XHRjb25zdCBvYmo6IFRlc3RPYmplY3QgPSB7IG5hbWU6ICd0ZXN0JywgY291bnQ6IDAsIGl0ZW1zOiBbXSB9O1xuXHRcdFx0YWRhcHRlci5jcmVhdGVJbml0aWFsKG9iaik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkYXB0ZXIud3JpdGUob2JqKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQub3AsICdhcHBlbmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGF0YS50b1N0cmluZygpLCAnJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3cml0ZSBkZXRlY3RzIHByaW1pdGl2ZSBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gY3JlYXRlVGVzdFNjaGVtYSgpO1xuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXG5cdFx0XHRjb25zdCBvYmo6IFRlc3RPYmplY3QgPSB7IG5hbWU6ICd0ZXN0JywgY291bnQ6IDAsIGl0ZW1zOiBbXSB9O1xuXHRcdFx0YWRhcHRlci5jcmVhdGVJbml0aWFsKG9iaik7XG5cblx0XHRcdGNvbnN0IHVwZGF0ZWQgPSB7IC4uLm9iaiwgY291bnQ6IDEwIH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGFwdGVyLndyaXRlKHVwZGF0ZWQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lm9wLCAnYXBwZW5kJyk7XG5cdFx0XHRjb25zdCBlbnRyeSA9IEpTT04ucGFyc2UocmVzdWx0LmRhdGEudG9TdHJpbmcoKS50cmltKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LmtpbmQsIDEpOyAvLyBFbnRyeUtpbmQuU2V0XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudHJ5LmssIFsnY291bnQnXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkudiwgMTApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd3JpdGUgZGV0ZWN0cyBhcnJheSBhcHBlbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBjcmVhdGVUZXN0U2NoZW1hKCk7XG5cdFx0XHRjb25zdCBhZGFwdGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSk7XG5cblx0XHRcdGNvbnN0IG9iajogVGVzdE9iamVjdCA9IHsgbmFtZTogJ3Rlc3QnLCBjb3VudDogMCwgaXRlbXM6IFt7IGlkOiAnYScsIHZhbHVlOiAxIH1dIH07XG5cdFx0XHRhZGFwdGVyLmNyZWF0ZUluaXRpYWwob2JqKTtcblxuXHRcdFx0Y29uc3QgdXBkYXRlZDogVGVzdE9iamVjdCA9IHsgLi4ub2JqLCBpdGVtczogWy4uLm9iai5pdGVtcywgeyBpZDogJ2InLCB2YWx1ZTogMiB9XSB9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRhcHRlci53cml0ZSh1cGRhdGVkKTtcblxuXHRcdFx0Y29uc3QgZW50cnkgPSBKU09OLnBhcnNlKHJlc3VsdC5kYXRhLnRvU3RyaW5nKCkudHJpbSgpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5raW5kLCAyKTsgLy8gRW50cnlLaW5kLlB1c2hcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50cnkuaywgWydpdGVtcyddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50cnkudiwgW3sgaWQ6ICdiJywgdmFsdWU6IDIgfV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LmksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3cml0ZSBkZXRlY3RzIGFycmF5IGFwcGVuZCBuZXN0ZWQnLCAoKSA9PiB7XG5cdFx0XHR0eXBlIEl0ZW0gPSB7IGlkOiBzdHJpbmc7IHZhbHVlOiBudW1iZXJbXSB9O1xuXHRcdFx0Y29uc3QgaXRlbVNjaGVtYSA9IEFkYXB0Lm9iamVjdDxJdGVtLCBJdGVtPih7XG5cdFx0XHRcdGlkOiBBZGFwdC50KGkgPT4gaS5pZCwgQWRhcHQua2V5KCkpLFxuXHRcdFx0XHR2YWx1ZTogQWRhcHQudChpID0+IGkudmFsdWUsIEFkYXB0LmFycmF5KEFkYXB0LnZhbHVlKCkpKSxcblx0XHRcdH0pO1xuXG5cdFx0XHR0eXBlIFRlc3RPYmplY3QgPSB7IGl0ZW1zOiBJdGVtW10gfTtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IEFkYXB0Lm9iamVjdDxUZXN0T2JqZWN0LCBUZXN0T2JqZWN0Pih7XG5cdFx0XHRcdGl0ZW1zOiBBZGFwdC50KG8gPT4gby5pdGVtcywgQWRhcHQuYXJyYXkoaXRlbVNjaGVtYSkpLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKTtcblxuXHRcdFx0YWRhcHRlci5jcmVhdGVJbml0aWFsKHsgaXRlbXM6IFt7IGlkOiAnYScsIHZhbHVlOiBbMSwgMl0gfV0gfSk7XG5cblxuXHRcdFx0Y29uc3QgcmVzdWx0MSA9IGFkYXB0ZXIud3JpdGUoeyBpdGVtczogW3sgaWQ6ICdhJywgdmFsdWU6IFsxLCAyLCAzXSB9XSB9KTtcblx0XHRcdGFkYXB0ZXIuY29uZmlybVdyaXRlKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRKU09OLnBhcnNlKHJlc3VsdDEuZGF0YS50b1N0cmluZygpLnRyaW0oKSksXG5cdFx0XHRcdHsga2luZDogMiwgazogWydpdGVtcycsIDAsICd2YWx1ZSddLCB2OiBbM10gfSxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDIgPSBhZGFwdGVyLndyaXRlKHsgaXRlbXM6IFt7IGlkOiAnYicsIHZhbHVlOiBbMSwgMiwgM10gfV0gfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRKU09OLnBhcnNlKHJlc3VsdDIuZGF0YS50b1N0cmluZygpLnRyaW0oKSksXG5cdFx0XHRcdHsga2luZDogMiwgazogWydpdGVtcyddLCBpOiAwLCB2OiBbeyBpZDogJ2InLCB2YWx1ZTogWzEsIDIsIDNdIH1dIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd3JpdGUgZGV0ZWN0cyBhcnJheSB0cnVuY2F0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gY3JlYXRlVGVzdFNjaGVtYSgpO1xuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXG5cdFx0XHRjb25zdCBvYmo6IFRlc3RPYmplY3QgPSB7IG5hbWU6ICd0ZXN0JywgY291bnQ6IDAsIGl0ZW1zOiBbeyBpZDogJ2EnLCB2YWx1ZTogMSB9LCB7IGlkOiAnYicsIHZhbHVlOiAyIH1dIH07XG5cdFx0XHRhZGFwdGVyLmNyZWF0ZUluaXRpYWwob2JqKTtcblxuXHRcdFx0Y29uc3QgdXBkYXRlZDogVGVzdE9iamVjdCA9IHsgLi4ub2JqLCBpdGVtczogW29iai5pdGVtc1swXV0gfTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkYXB0ZXIud3JpdGUodXBkYXRlZCk7XG5cblx0XHRcdGNvbnN0IGVudHJ5ID0gSlNPTi5wYXJzZShyZXN1bHQuZGF0YS50b1N0cmluZygpLnRyaW0oKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkua2luZCwgMik7IC8vIEVudHJ5S2luZC5QdXNoXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudHJ5LmssIFsnaXRlbXMnXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkudiwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3dyaXRlIGRldGVjdHMgYXJyYXkgaXRlbSBtb2RpZmljYXRpb24gYW5kIHJlY3Vyc2VzIGludG8gb2JqZWN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gY3JlYXRlVGVzdFNjaGVtYSgpO1xuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXG5cdFx0XHRjb25zdCBvYmo6IFRlc3RPYmplY3QgPSB7XG5cdFx0XHRcdG5hbWU6ICd0ZXN0Jyxcblx0XHRcdFx0Y291bnQ6IDAsXG5cdFx0XHRcdGl0ZW1zOiBbeyBpZDogJ2EnLCB2YWx1ZTogMSB9LCB7IGlkOiAnYicsIHZhbHVlOiAyIH0sIHsgaWQ6ICdjJywgdmFsdWU6IDMgfV1cblx0XHRcdH07XG5cdFx0XHRhZGFwdGVyLmNyZWF0ZUluaXRpYWwob2JqKTtcblxuXHRcdFx0Ly8gTW9kaWZ5IG1pZGRsZSBpdGVtIC0ga2V5ICdpZCcgbWF0Y2hlcywgc28gd2UgcmVjdXJzZSB0byBzZXQgdGhlICd2YWx1ZScgcHJvcGVydHlcblx0XHRcdGNvbnN0IHVwZGF0ZWQ6IFRlc3RPYmplY3QgPSB7XG5cdFx0XHRcdC4uLm9iaixcblx0XHRcdFx0aXRlbXM6IFt7IGlkOiAnYScsIHZhbHVlOiAxIH0sIHsgaWQ6ICdiJywgdmFsdWU6IDk5OSB9LCB7IGlkOiAnYycsIHZhbHVlOiAzIH1dXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRhcHRlci53cml0ZSh1cGRhdGVkKTtcblxuXHRcdFx0Y29uc3QgZW50cnkgPSBKU09OLnBhcnNlKHJlc3VsdC5kYXRhLnRvU3RyaW5nKCkudHJpbSgpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5raW5kLCAxKTsgLy8gRW50cnlLaW5kLlNldCAtIHNldHRpbmcgaW5kaXZpZHVhbCBwcm9wZXJ0eVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnRyeS5rLCBbJ2l0ZW1zJywgMSwgJ3ZhbHVlJ10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LnYsIDk5OSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkIGFwcGxpZXMgbXVsdGlwbGUgZW50cmllcyBjb3JyZWN0bHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBjcmVhdGVUZXN0U2NoZW1hKCk7XG5cdFx0XHRjb25zdCBpbml0aWFsOiBUZXN0T2JqZWN0ID0geyBuYW1lOiAndGVzdCcsIGNvdW50OiAwLCBpdGVtczogW10gfTtcblxuXHRcdFx0Ly8gQnVpbGQgbG9nIG1hbnVhbGx5XG5cdFx0XHRjb25zdCBlbnRyaWVzID0gW1xuXHRcdFx0XHR7IGtpbmQ6IDAsIHY6IGluaXRpYWwgfSxcblx0XHRcdFx0eyBraW5kOiAxLCBrOiBbJ2NvdW50J10sIHY6IDUgfSxcblx0XHRcdFx0eyBraW5kOiAyLCBrOiBbJ2l0ZW1zJ10sIHY6IFt7IGlkOiAnYScsIHZhbHVlOiAxIH1dIH0sXG5cdFx0XHRcdHsga2luZDogMiwgazogWydpdGVtcyddLCB2OiBbeyBpZDogJ2InLCB2YWx1ZTogMiB9XSB9LFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGxvZ0NvbnRlbnQgPSBlbnRyaWVzLm1hcChlID0+IEpTT04uc3RyaW5naWZ5KGUpKS5qb2luKCdcXG4nKSArICdcXG4nO1xuXG5cdFx0XHRjb25zdCBhZGFwdGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGFwdGVyLnJlYWQoVlNCdWZmZXIuZnJvbVN0cmluZyhsb2dDb250ZW50KSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY291bnQsIDUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pdGVtcy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuaXRlbXNbMF0sIHsgaWQ6ICdhJywgdmFsdWU6IDEgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5pdGVtc1sxXSwgeyBpZDogJ2InLCB2YWx1ZTogMiB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JvdW5kdHJpcCBwcmVzZXJ2ZXMgZGF0YSB0aHJvdWdoIG11bHRpcGxlIHVwZGF0ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBjcmVhdGVUZXN0U2NoZW1hKCk7XG5cdFx0XHRjb25zdCBhZGFwdGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSk7XG5cblx0XHRcdGNvbnN0IGluaXRpYWw6IFRlc3RPYmplY3QgPSB7IG5hbWU6ICd0ZXN0JywgY291bnQ6IDAsIGl0ZW1zOiBbXSB9O1xuXHRcdFx0Y29uc3QgdXBkYXRlczogVGVzdE9iamVjdFtdID0gW1xuXHRcdFx0XHR7IG5hbWU6ICd0ZXN0JywgY291bnQ6IDEsIGl0ZW1zOiBbXSB9LFxuXHRcdFx0XHR7IG5hbWU6ICd0ZXN0JywgY291bnQ6IDEsIGl0ZW1zOiBbeyBpZDogJ2EnLCB2YWx1ZTogMTAgfV0gfSxcblx0XHRcdFx0eyBuYW1lOiAndGVzdCcsIGNvdW50OiAyLCBpdGVtczogW3sgaWQ6ICdhJywgdmFsdWU6IDEwIH0sIHsgaWQ6ICdiJywgdmFsdWU6IDIwIH1dIH0sXG5cdFx0XHRcdHsgbmFtZTogJ3Rlc3QnLCBjb3VudDogMiwgaXRlbXM6IFt7IGlkOiAnYScsIHZhbHVlOiAxMCB9XSB9LCAvLyBSZW1vdmUgaXRlbVxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2ltdWxhdGVGaWxlUm91bmR0cmlwKGFkYXB0ZXIsIGluaXRpYWwsIHVwZGF0ZXMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHVwZGF0ZXNbdXBkYXRlcy5sZW5ndGggLSAxXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wYWN0cyBsb2cgd2hlbiBlbnRyeSBjb3VudCBleGNlZWRzIHRocmVzaG9sZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZVRlc3RTY2hlbWEoKTtcblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hLCAzKTsgLy8gQ29tcGFjdCBhZnRlciAzIGVudHJpZXNcblxuXHRcdFx0Y29uc3Qgb2JqOiBUZXN0T2JqZWN0ID0geyBuYW1lOiAndGVzdCcsIGNvdW50OiAwLCBpdGVtczogW10gfTtcblx0XHRcdGFkYXB0ZXIuY3JlYXRlSW5pdGlhbChvYmopOyAvLyBFbnRyeSAxXG5cblx0XHRcdGFkYXB0ZXIud3JpdGUoeyAuLi5vYmosIGNvdW50OiAxIH0pOyAvLyBFbnRyeSAyXG5cdFx0XHRhZGFwdGVyLmNvbmZpcm1Xcml0ZSgpO1xuXHRcdFx0YWRhcHRlci53cml0ZSh7IC4uLm9iaiwgY291bnQ6IDIgfSk7IC8vIEVudHJ5IDNcblx0XHRcdGFkYXB0ZXIuY29uZmlybVdyaXRlKCk7XG5cblx0XHRcdGNvbnN0IGJlZm9yZSA9IGFkYXB0ZXIud3JpdGUoeyAuLi5vYmosIGNvdW50OiAzIH0pO1xuXHRcdFx0YWRhcHRlci5jb25maXJtV3JpdGUoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiZWZvcmUub3AsICdhcHBlbmQnKTtcblxuXHRcdFx0Ly8gVGhpcyBzaG91bGQgdHJpZ2dlciBjb21wYWN0aW9uXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhZGFwdGVyLndyaXRlKHsgLi4ub2JqLCBjb3VudDogNCB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQub3AsICdyZXBsYWNlJyk7XG5cblx0XHRcdC8vIFZlcmlmeSB0aGUgY29tcGFjdGVkIGxvZyBvbmx5IGhhcyBpbml0aWFsIGVudHJ5XG5cdFx0XHRjb25zdCBsaW5lcyA9IHJlc3VsdC5kYXRhLnRvU3RyaW5nKCkuc3BsaXQoJ1xcbicpLmZpbHRlcihsID0+IGwudHJpbSgpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lcy5sZW5ndGgsIDEpO1xuXHRcdFx0Y29uc3QgZW50cnkgPSBKU09OLnBhcnNlKGxpbmVzWzBdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5raW5kLCAwKTsgLy8gRW50cnlLaW5kLkluaXRpYWxcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgZGVlcENvbXBhcmUgcHJvcGVydHkgY2hhbmdlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZVRlc3RTY2hlbWEoKTtcblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKTtcblxuXHRcdFx0Y29uc3Qgb2JqOiBUZXN0T2JqZWN0ID0geyBuYW1lOiAndGVzdCcsIGNvdW50OiAwLCBpdGVtczogW10sIG1ldGFkYXRhOiB7IHRhZ3M6IFsnYSddIH0gfTtcblx0XHRcdGFkYXB0ZXIuY3JlYXRlSW5pdGlhbChvYmopO1xuXG5cdFx0XHRjb25zdCB1cGRhdGVkOiBUZXN0T2JqZWN0ID0geyAuLi5vYmosIG1ldGFkYXRhOiB7IHRhZ3M6IFsnYScsICdiJ10gfSB9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRhcHRlci53cml0ZSh1cGRhdGVkKTtcblxuXHRcdFx0Y29uc3QgZW50cnkgPSBKU09OLnBhcnNlKHJlc3VsdC5kYXRhLnRvU3RyaW5nKCkudHJpbSgpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5raW5kLCAxKTsgLy8gRW50cnlLaW5kLlNldFxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnRyeS5rLCBbJ21ldGFkYXRhJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnRyeS52LCB7IHRhZ3M6IFsnYScsICdiJ10gfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGRpZmZlcmVudGlhdGVkIHByb3BlcnR5IGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0XHQvLyBTY2hlbWEgd2l0aCBhIGRpZmZlcmVudGlhdGVkIHRyYW5zZm9ybSB0aGF0IGV4dHJhY3RzIGEgc3RyaW5nXG5cdFx0XHQvLyBidXQgdXNlcyBhIGN1c3RvbSBlcXVhbHMgdGhhdCBvbmx5IGNoZWNrcyB0aGUgcHJlZml4XG5cdFx0XHRpbnRlcmZhY2UgRGlmZk9iaiB7XG5cdFx0XHRcdGRhdGE6IHsgdHlwZTogc3RyaW5nOyB2ZXJzaW9uOiBudW1iZXIgfTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNjaGVtYSA9IEFkYXB0Lm9iamVjdDxEaWZmT2JqLCB7IGRhdGE6IHN0cmluZyB9Pih7XG5cdFx0XHRcdGRhdGE6IEFkYXB0LnQoXG5cdFx0XHRcdFx0byA9PiBvLmRhdGEsXG5cdFx0XHRcdFx0QWRhcHQudjx7IHR5cGU6IHN0cmluZzsgdmVyc2lvbjogbnVtYmVyIH0sIHN0cmluZz4oXG5cdFx0XHRcdFx0XHRvYmogPT4gYCR7b2JqLnR5cGV9OiR7b2JqLnZlcnNpb259YCxcblx0XHRcdFx0XHRcdChhLCBiKSA9PiBhLnNwbGl0KCc6JylbMF0gPT09IGIuc3BsaXQoJzonKVswXSwgLy8gY29tcGFyZSBvbmx5IHRoZSB0eXBlIHByZWZpeFxuXHRcdFx0XHRcdClcblx0XHRcdFx0KSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBhZGFwdGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSk7XG5cblx0XHRcdC8vIEluaXRpYWwgc3RhdGU6ICdmb286MSdcblx0XHRcdGFkYXB0ZXIuY3JlYXRlSW5pdGlhbCh7IGRhdGE6IHsgdHlwZTogJ2ZvbycsIHZlcnNpb246IDEgfSB9KTtcblxuXHRcdFx0Ly8gQ2hhbmdlIHR5cGUgZnJvbSAnZm9vJyB0byAnYmFyJyAtIHNob3VsZCBkZXRlY3QgY2hhbmdlIChkaWZmZXJlbnQgcHJlZml4KVxuXHRcdFx0Y29uc3QgcmVzdWx0MSA9IGFkYXB0ZXIud3JpdGUoeyBkYXRhOiB7IHR5cGU6ICdiYXInLCB2ZXJzaW9uOiAyIH0gfSk7XG5cdFx0XHRhZGFwdGVyLmNvbmZpcm1Xcml0ZSgpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlc3VsdDEuZGF0YS50b1N0cmluZygpLCAnJywgJ2RpZmZlcmVudCB0eXBlIHNob3VsZCB0cmlnZ2VyIGNoYW5nZScpO1xuXHRcdFx0Y29uc3QgZW50cnkxID0gSlNPTi5wYXJzZShyZXN1bHQxLmRhdGEudG9TdHJpbmcoKS50cmltKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5MS5raW5kLCAxKTsgLy8gRW50cnlLaW5kLlNldFxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnRyeTEuaywgWydkYXRhJ10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5MS52LCAnYmFyOjInKTtcblxuXHRcdFx0Ly8gQ2hhbmdlIHZlcnNpb24gYnV0IGtlZXAgdHlwZSAnYmFyJyAtIHNob3VsZCBOT1QgZGV0ZWN0IGNoYW5nZSAoc2FtZSBwcmVmaXgpXG5cdFx0XHRjb25zdCByZXN1bHQyID0gYWRhcHRlci53cml0ZSh7IGRhdGE6IHsgdHlwZTogJ2JhcicsIHZlcnNpb246IDMgfSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQyLmRhdGEudG9TdHJpbmcoKSwgJycsICdzYW1lIHR5cGUgcHJlZml4IHNob3VsZCBub3QgdHJpZ2dlciBjaGFuZ2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWQgdGhyb3dzIG9uIGVtcHR5IGxvZyBmaWxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gY3JlYXRlVGVzdFNjaGVtYSgpO1xuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGFkYXB0ZXIucmVhZChWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSksIC9FbXB0eSBsb2cgZmlsZS8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd3JpdGUgd2l0aG91dCBwcmlvciByZWFkIGNyZWF0ZXMgaW5pdGlhbCBlbnRyeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZVRlc3RTY2hlbWEoKTtcblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKTtcblxuXHRcdFx0Y29uc3Qgb2JqOiBUZXN0T2JqZWN0ID0geyBuYW1lOiAndGVzdCcsIGNvdW50OiA1LCBpdGVtczogW10gfTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkYXB0ZXIud3JpdGUob2JqKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5vcCwgJ3JlcGxhY2UnKTtcblx0XHRcdGNvbnN0IGVudHJ5ID0gSlNPTi5wYXJzZShyZXN1bHQuZGF0YS50b1N0cmluZygpLnRyaW0oKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkua2luZCwgMCk7IC8vIEVudHJ5S2luZC5Jbml0aWFsXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZWFsZWQgb2JqZWN0cyBza2lwIG5vbi1rZXkgZmllbGQgY29tcGFyaXNvbiB3aGVuIGJvdGggYXJlIHNlYWxlZCcsICgpID0+IHtcblx0XHRcdGludGVyZmFjZSBTZWFsZWRJdGVtIHtcblx0XHRcdFx0aWQ6IHN0cmluZztcblx0XHRcdFx0dmFsdWU6IG51bWJlcjtcblx0XHRcdFx0aXNTZWFsZWQ6IGJvb2xlYW47XG5cdFx0XHR9XG5cblx0XHRcdGludGVyZmFjZSBTZWFsZWRUZXN0T2JqZWN0IHtcblx0XHRcdFx0aXRlbXM6IFNlYWxlZEl0ZW1bXTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXRlbVNjaGVtYSA9IEFkYXB0Lm9iamVjdDxTZWFsZWRJdGVtLCBTZWFsZWRJdGVtPih7XG5cdFx0XHRcdGlkOiBBZGFwdC50KGkgPT4gaS5pZCwgQWRhcHQua2V5KCkpLFxuXHRcdFx0XHR2YWx1ZTogQWRhcHQudChpID0+IGkudmFsdWUsIEFkYXB0LnZhbHVlKCkpLFxuXHRcdFx0XHRpc1NlYWxlZDogQWRhcHQudChpID0+IGkuaXNTZWFsZWQsIEFkYXB0LnZhbHVlKCkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZWFsZWQ6IChvYmopID0+IG9iai5pc1NlYWxlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzY2hlbWEgPSBBZGFwdC5vYmplY3Q8U2VhbGVkVGVzdE9iamVjdCwgU2VhbGVkVGVzdE9iamVjdD4oe1xuXHRcdFx0XHRpdGVtczogQWRhcHQudChvID0+IG8uaXRlbXMsIEFkYXB0LmFycmF5KGl0ZW1TY2hlbWEpKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBhZGFwdGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSk7XG5cblx0XHRcdC8vIEluaXRpYWwgc3RhdGUgd2l0aCBhIHNlYWxlZCBpdGVtXG5cdFx0XHRhZGFwdGVyLmNyZWF0ZUluaXRpYWwoeyBpdGVtczogW3sgaWQ6ICdhJywgdmFsdWU6IDEsIGlzU2VhbGVkOiB0cnVlIH1dIH0pO1xuXG5cdFx0XHQvLyBDaGFuZ2UgdmFsdWUgb24gc2VhbGVkIGl0ZW0gLSBzaG91bGQgTk9UIGJlIGRldGVjdGVkIGJlY2F1c2UgYm90aCBhcmUgc2VhbGVkXG5cdFx0XHRjb25zdCByZXN1bHQxID0gYWRhcHRlci53cml0ZSh7IGl0ZW1zOiBbeyBpZDogJ2EnLCB2YWx1ZTogOTk5LCBpc1NlYWxlZDogdHJ1ZSB9XSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQxLmRhdGEudG9TdHJpbmcoKSwgJycsICdzZWFsZWQgaXRlbSB2YWx1ZSBjaGFuZ2Ugc2hvdWxkIGJlIGlnbm9yZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlYWxlZCBvYmplY3RzIHN0aWxsIGRldGVjdCBrZXkgY2hhbmdlcycsICgpID0+IHtcblx0XHRcdGludGVyZmFjZSBTZWFsZWRJdGVtIHtcblx0XHRcdFx0aWQ6IHN0cmluZztcblx0XHRcdFx0dmFsdWU6IG51bWJlcjtcblx0XHRcdFx0aXNTZWFsZWQ6IGJvb2xlYW47XG5cdFx0XHR9XG5cblx0XHRcdGludGVyZmFjZSBTZWFsZWRUZXN0T2JqZWN0IHtcblx0XHRcdFx0aXRlbXM6IFNlYWxlZEl0ZW1bXTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXRlbVNjaGVtYSA9IEFkYXB0Lm9iamVjdDxTZWFsZWRJdGVtLCBTZWFsZWRJdGVtPih7XG5cdFx0XHRcdGlkOiBBZGFwdC50KGkgPT4gaS5pZCwgQWRhcHQua2V5KCkpLFxuXHRcdFx0XHR2YWx1ZTogQWRhcHQudChpID0+IGkudmFsdWUsIEFkYXB0LnZhbHVlKCkpLFxuXHRcdFx0XHRpc1NlYWxlZDogQWRhcHQudChpID0+IGkuaXNTZWFsZWQsIEFkYXB0LnZhbHVlKCkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZWFsZWQ6IChvYmopID0+IG9iai5pc1NlYWxlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzY2hlbWEgPSBBZGFwdC5vYmplY3Q8U2VhbGVkVGVzdE9iamVjdCwgU2VhbGVkVGVzdE9iamVjdD4oe1xuXHRcdFx0XHRpdGVtczogQWRhcHQudChvID0+IG8uaXRlbXMsIEFkYXB0LmFycmF5KGl0ZW1TY2hlbWEpKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBhZGFwdGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSk7XG5cblx0XHRcdC8vIEluaXRpYWwgc3RhdGUgd2l0aCBhIHNlYWxlZCBpdGVtXG5cdFx0XHRhZGFwdGVyLmNyZWF0ZUluaXRpYWwoeyBpdGVtczogW3sgaWQ6ICdhJywgdmFsdWU6IDEsIGlzU2VhbGVkOiB0cnVlIH1dIH0pO1xuXG5cdFx0XHQvLyBDaGFuZ2Uga2V5IG9uIHNlYWxlZCBpdGVtIC0gU0hPVUxEIGJlIGRldGVjdGVkIChyZXBsYWNlbWVudClcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkYXB0ZXIud3JpdGUoeyBpdGVtczogW3sgaWQ6ICdiJywgdmFsdWU6IDEsIGlzU2VhbGVkOiB0cnVlIH1dIH0pO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlc3VsdC5kYXRhLnRvU3RyaW5nKCksICcnLCAna2V5IGNoYW5nZSBzaG91bGQgYmUgZGV0ZWN0ZWQgZXZlbiB3aGVuIHNlYWxlZCcpO1xuXG5cdFx0XHRjb25zdCBlbnRyeSA9IEpTT04ucGFyc2UocmVzdWx0LmRhdGEudG9TdHJpbmcoKS50cmltKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LmtpbmQsIDIpOyAvLyBFbnRyeUtpbmQuUHVzaCAoYXJyYXkgcmVwbGFjZW1lbnQpXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZWFsZWQgb2JqZWN0cyBkaWZmIG5vcm1hbGx5IHdoZW4gb25lIGlzIG5vdCBzZWFsZWQnLCAoKSA9PiB7XG5cdFx0XHRpbnRlcmZhY2UgU2VhbGVkSXRlbSB7XG5cdFx0XHRcdGlkOiBzdHJpbmc7XG5cdFx0XHRcdHZhbHVlOiBudW1iZXI7XG5cdFx0XHRcdGlzU2VhbGVkOiBib29sZWFuO1xuXHRcdFx0fVxuXG5cdFx0XHRpbnRlcmZhY2UgU2VhbGVkVGVzdE9iamVjdCB7XG5cdFx0XHRcdGl0ZW1zOiBTZWFsZWRJdGVtW107XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGl0ZW1TY2hlbWEgPSBBZGFwdC5vYmplY3Q8U2VhbGVkSXRlbSwgU2VhbGVkSXRlbT4oe1xuXHRcdFx0XHRpZDogQWRhcHQudChpID0+IGkuaWQsIEFkYXB0LmtleSgpKSxcblx0XHRcdFx0dmFsdWU6IEFkYXB0LnQoaSA9PiBpLnZhbHVlLCBBZGFwdC52YWx1ZSgpKSxcblx0XHRcdFx0aXNTZWFsZWQ6IEFkYXB0LnQoaSA9PiBpLmlzU2VhbGVkLCBBZGFwdC52YWx1ZSgpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2VhbGVkOiAob2JqKSA9PiBvYmouaXNTZWFsZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3Qgc2NoZW1hID0gQWRhcHQub2JqZWN0PFNlYWxlZFRlc3RPYmplY3QsIFNlYWxlZFRlc3RPYmplY3Q+KHtcblx0XHRcdFx0aXRlbXM6IEFkYXB0LnQobyA9PiBvLml0ZW1zLCBBZGFwdC5hcnJheShpdGVtU2NoZW1hKSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXG5cdFx0XHQvLyBJbml0aWFsIHN0YXRlIHdpdGggYSBub24tc2VhbGVkIGl0ZW1cblx0XHRcdGFkYXB0ZXIuY3JlYXRlSW5pdGlhbCh7IGl0ZW1zOiBbeyBpZDogJ2EnLCB2YWx1ZTogMSwgaXNTZWFsZWQ6IGZhbHNlIH1dIH0pO1xuXG5cdFx0XHQvLyBDaGFuZ2UgdmFsdWUgLSBzaG91bGQgYmUgZGV0ZWN0ZWQgc2luY2UgcHJldiBpcyBub3Qgc2VhbGVkXG5cdFx0XHRjb25zdCByZXN1bHQxID0gYWRhcHRlci53cml0ZSh7IGl0ZW1zOiBbeyBpZDogJ2EnLCB2YWx1ZTogOTk5LCBpc1NlYWxlZDogZmFsc2UgfV0gfSk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocmVzdWx0MS5kYXRhLnRvU3RyaW5nKCksICcnLCAnbm9uLXNlYWxlZCBpdGVtIHNob3VsZCBkZXRlY3QgdmFsdWUgY2hhbmdlJyk7XG5cblx0XHRcdGNvbnN0IGVudHJ5ID0gSlNPTi5wYXJzZShyZXN1bHQxLmRhdGEudG9TdHJpbmcoKS50cmltKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LmtpbmQsIDEpOyAvLyBFbnRyeUtpbmQuU2V0XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudHJ5LmssIFsnaXRlbXMnLCAwLCAndmFsdWUnXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkudiwgOTk5KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlYWxlZCB0cmFuc2l0aW9uIGZyb20gdW5zZWFsZWQgdG8gc2VhbGVkIGRldGVjdHMgZmluYWwgY2hhbmdlcycsICgpID0+IHtcblx0XHRcdGludGVyZmFjZSBTZWFsZWRJdGVtIHtcblx0XHRcdFx0aWQ6IHN0cmluZztcblx0XHRcdFx0dmFsdWU6IG51bWJlcjtcblx0XHRcdFx0aXNTZWFsZWQ6IGJvb2xlYW47XG5cdFx0XHR9XG5cblx0XHRcdGludGVyZmFjZSBTZWFsZWRUZXN0T2JqZWN0IHtcblx0XHRcdFx0aXRlbXM6IFNlYWxlZEl0ZW1bXTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXRlbVNjaGVtYSA9IEFkYXB0Lm9iamVjdDxTZWFsZWRJdGVtLCBTZWFsZWRJdGVtPih7XG5cdFx0XHRcdGlkOiBBZGFwdC50KGkgPT4gaS5pZCwgQWRhcHQua2V5KCkpLFxuXHRcdFx0XHR2YWx1ZTogQWRhcHQudChpID0+IGkudmFsdWUsIEFkYXB0LnZhbHVlKCkpLFxuXHRcdFx0XHRpc1NlYWxlZDogQWRhcHQudChpID0+IGkuaXNTZWFsZWQsIEFkYXB0LnZhbHVlKCkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZWFsZWQ6IChvYmopID0+IG9iai5pc1NlYWxlZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzY2hlbWEgPSBBZGFwdC5vYmplY3Q8U2VhbGVkVGVzdE9iamVjdCwgU2VhbGVkVGVzdE9iamVjdD4oe1xuXHRcdFx0XHRpdGVtczogQWRhcHQudChvID0+IG8uaXRlbXMsIEFkYXB0LmFycmF5KGl0ZW1TY2hlbWEpKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBhZGFwdGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSk7XG5cblx0XHRcdC8vIEluaXRpYWwgc3RhdGUgd2l0aCBhIG5vbi1zZWFsZWQgaXRlbVxuXHRcdFx0YWRhcHRlci5jcmVhdGVJbml0aWFsKHsgaXRlbXM6IFt7IGlkOiAnYScsIHZhbHVlOiAxLCBpc1NlYWxlZDogZmFsc2UgfV0gfSk7XG5cblx0XHRcdC8vIFRyYW5zaXRpb24gdG8gc2VhbGVkIHdpdGggdmFsdWUgY2hhbmdlIC0gc2hvdWxkIGRldGVjdCBjaGFuZ2VzIHNpbmNlIHByZXYgd2FzIG5vdCBzZWFsZWRcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFkYXB0ZXIud3JpdGUoeyBpdGVtczogW3sgaWQ6ICdhJywgdmFsdWU6IDk5OSwgaXNTZWFsZWQ6IHRydWUgfV0gfSk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocmVzdWx0LmRhdGEudG9TdHJpbmcoKSwgJycsICd0cmFuc2l0aW9uIHRvIHNlYWxlZCBzaG91bGQgZGV0ZWN0IHZhbHVlIGNoYW5nZScpO1xuXG5cdFx0XHQvLyBTaG91bGQgaGF2ZSB0d28gZW50cmllcyAtIG9uZSBmb3IgdmFsdWUsIG9uZSBmb3IgaXNTZWFsZWRcblx0XHRcdGNvbnN0IGxpbmVzID0gcmVzdWx0LmRhdGEudG9TdHJpbmcoKS50cmltKCkuc3BsaXQoJ1xcbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzLmxlbmd0aCwgMiwgJ3Nob3VsZCBoYXZlIHR3byBjaGFuZ2UgZW50cmllcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd3JpdGUgZGV0ZWN0cyBwcm9wZXJ0eSBzZXQgdG8gdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gY3JlYXRlVGVzdFNjaGVtYSgpO1xuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXG5cdFx0XHRjb25zdCBpbml0aWFsOiBUZXN0T2JqZWN0ID0geyBuYW1lOiAndGVzdCcsIGNvdW50OiA1LCBpdGVtczogW10sIG1ldGFkYXRhOiB7IHRhZ3M6IFsnZm9vJ10gfSB9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBzaW11bGF0ZUZpbGVSb3VuZHRyaXAoYWRhcHRlciwgaW5pdGlhbCwgW1xuXHRcdFx0XHR7IG5hbWU6ICd0ZXN0JywgY291bnQ6IDEwLCBpdGVtczogW10sIG1ldGFkYXRhOiB7IHRhZ3M6IFsnZm9vJ10gfSB9LFxuXHRcdFx0XHR7IG5hbWU6ICd0ZXN0JywgY291bnQ6IHVuZGVmaW5lZCwgaXRlbXM6IFtdLCBtZXRhZGF0YTogdW5kZWZpbmVkIH0sXG5cdFx0XHRdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IG5hbWU6ICd0ZXN0JywgY291bnQ6IHVuZGVmaW5lZCwgaXRlbXM6IFtdLCBtZXRhZGF0YTogdW5kZWZpbmVkIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQyID0gc2ltdWxhdGVGaWxlUm91bmR0cmlwKGFkYXB0ZXIsIGluaXRpYWwsIFtcblx0XHRcdFx0eyBuYW1lOiAndGVzdCcsIGNvdW50OiAxMCwgaXRlbXM6IFtdLCBtZXRhZGF0YTogeyB0YWdzOiBbJ2ZvbyddIH0gfSxcblx0XHRcdFx0eyBuYW1lOiAndGVzdCcsIGNvdW50OiB1bmRlZmluZWQsIGl0ZW1zOiBbXSwgbWV0YWRhdGE6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IG5hbWU6ICd0ZXN0JywgY291bnQ6IDEyLCBpdGVtczogW10sIG1ldGFkYXRhOiB7IHRhZ3M6IFsnYmFyJ10gfSB9LFxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdDIsIHsgbmFtZTogJ3Rlc3QnLCBjb3VudDogMTIsIGl0ZW1zOiBbXSwgbWV0YWRhdGE6IHsgdGFnczogWydiYXInXSB9IH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVsZXRlIGZvbGxvd2VkIGJ5IHNldCByZXN0b3JlcyBwcm9wZXJ0eScsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZVRlc3RTY2hlbWEoKTtcblx0XHRcdGNvbnN0IGluaXRpYWw6IFRlc3RPYmplY3QgPSB7IG5hbWU6ICd0ZXN0JywgY291bnQ6IDAsIGl0ZW1zOiBbXSwgbWV0YWRhdGE6IHsgdGFnczogWydhJ10gfSB9O1xuXG5cdFx0XHQvLyBCdWlsZCBsb2cgd2l0aCBkZWxldGUgdGhlbiBzZXRcblx0XHRcdGNvbnN0IGVudHJpZXMgPSBbXG5cdFx0XHRcdHsga2luZDogMCwgdjogaW5pdGlhbCB9LFxuXHRcdFx0XHR7IGtpbmQ6IDMsIGs6IFsnbWV0YWRhdGEnXSB9LCAvLyBEZWxldGVcblx0XHRcdFx0eyBraW5kOiAxLCBrOiBbJ21ldGFkYXRhJ10sIHY6IHsgdGFnczogWydiJywgJ2MnXSB9IH0sIC8vIFNldCB0byBuZXcgdmFsdWVcblx0XHRcdF07XG5cdFx0XHRjb25zdCBsb2dDb250ZW50ID0gZW50cmllcy5tYXAoZSA9PiBKU09OLnN0cmluZ2lmeShlKSkuam9pbignXFxuJykgKyAnXFxuJztcblxuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRhcHRlci5yZWFkKFZTQnVmZmVyLmZyb21TdHJpbmcobG9nQ29udGVudCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tZXRhZGF0YSwgeyB0YWdzOiBbJ2InLCAnYyddIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd3JpdGUgd2l0aG91dCBjb25maXJtV3JpdGUgcmVzZXRzIHRvIGluaXRpYWwgb24gbmV4dCB3cml0ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZVRlc3RTY2hlbWEoKTtcblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKTtcblxuXHRcdFx0Y29uc3Qgb2JqOiBUZXN0T2JqZWN0ID0geyBuYW1lOiAndGVzdCcsIGNvdW50OiAwLCBpdGVtczogW10gfTtcblxuXHRcdFx0Ly8gRmlyc3Qgd3JpdGUgKG5vIGNyZWF0ZUluaXRpYWwpIFx1MjAxNCBwcm9kdWNlcyBJbml0aWFsIHJlcGxhY2Vcblx0XHRcdGNvbnN0IHJlc3VsdDEgPSBhZGFwdGVyLndyaXRlKG9iaik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0MS5vcCwgJ3JlcGxhY2UnKTtcblx0XHRcdC8vIERvIE5PVCBjb25maXJtIFx1MjAxNCBzaW11bGF0ZXMgYSBmYWlsZWQgcGVyc2lzdFxuXG5cdFx0XHQvLyBOZXh0IHdyaXRlIHNob3VsZCBwcm9kdWNlIGEgZnVsbCByZXBsYWNlIGFnYWluIHNpbmNlIHN0YXRlIHdhcyBub3QgY29tbWl0dGVkXG5cdFx0XHRjb25zdCByZXN1bHQyID0gYWRhcHRlci53cml0ZSh7IC4uLm9iaiwgY291bnQ6IDIgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IG9wOiByZXN1bHQyLm9wLCBlbnRyeTogSlNPTi5wYXJzZShyZXN1bHQyLmRhdGEudG9TdHJpbmcoKS50cmltKCkpIH0sXG5cdFx0XHRcdHsgb3A6ICdyZXBsYWNlJywgZW50cnk6IHsga2luZDogMCwgdjogeyBuYW1lOiAndGVzdCcsIGNvdW50OiAyLCBpdGVtczogW10gfSB9IH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29uZmlybVdyaXRlIGNvbW1pdHMgc3RhdGUgc28gbmV4dCB3cml0ZSBpcyBpbmNyZW1lbnRhbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZVRlc3RTY2hlbWEoKTtcblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKTtcblxuXHRcdFx0Y29uc3Qgb2JqOiBUZXN0T2JqZWN0ID0geyBuYW1lOiAndGVzdCcsIGNvdW50OiAwLCBpdGVtczogW10gfTtcblx0XHRcdGFkYXB0ZXIuY3JlYXRlSW5pdGlhbChvYmopO1xuXG5cdFx0XHRhZGFwdGVyLndyaXRlKHsgLi4ub2JqLCBjb3VudDogMSB9KTtcblx0XHRcdGFkYXB0ZXIuY29uZmlybVdyaXRlKCk7XG5cblx0XHRcdC8vIE5leHQgd3JpdGUgc2hvdWxkIGJlIGFuIGluY3JlbWVudGFsIGFwcGVuZFxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWRhcHRlci53cml0ZSh7IC4uLm9iaiwgY291bnQ6IDIgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IG9wOiByZXN1bHQub3AsIGVudHJ5OiBKU09OLnBhcnNlKHJlc3VsdC5kYXRhLnRvU3RyaW5nKCkudHJpbSgpKSB9LFxuXHRcdFx0XHR7IG9wOiAnYXBwZW5kJywgZW50cnk6IHsga2luZDogMSwgazogWydjb3VudCddLCB2OiAyIH0gfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWFkIHRocm93cyBvbiBsb2cgZmlsZSBtaXNzaW5nIGluaXRpYWwgZW50cnknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY2hlbWEgPSBjcmVhdGVUZXN0U2NoZW1hKCk7XG5cdFx0XHRjb25zdCBhZGFwdGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSk7XG5cblx0XHRcdGNvbnN0IGxvZ0NvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7IGtpbmQ6IDEsIGs6IFsnY291bnQnXSwgdjogNSB9KSArICdcXG4nO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBhZGFwdGVyLnJlYWQoVlNCdWZmZXIuZnJvbVN0cmluZyhsb2dDb250ZW50KSksIC9taXNzaW5nIGFuIGluaXRpYWwgZW50cnkvKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhaWxlZCBmaXJzdCB3cml0ZSBmb2xsb3dlZCBieSBzdWNjZXNzZnVsIHdyaXRlIHByb2R1Y2VzIHZhbGlkIHJvdW5kdHJpcCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHNjaGVtYSA9IGNyZWF0ZVRlc3RTY2hlbWEoKTtcblx0XHRcdGNvbnN0IGFkYXB0ZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKTtcblxuXHRcdFx0Y29uc3QgaW5pdGlhbDogVGVzdE9iamVjdCA9IHsgbmFtZTogJ3Rlc3QnLCBjb3VudDogMCwgaXRlbXM6IFtdIH07XG5cblx0XHRcdC8vIEZpcnN0IHdyaXRlIFwiZmFpbHNcIiBcdTIwMTQgZGF0YSBub3QgcGVyc2lzdGVkLCBubyBjb25maXJtV3JpdGVcblx0XHRcdGNvbnN0IHIxID0gYWRhcHRlci53cml0ZShpbml0aWFsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyMS5vcCwgJ3JlcGxhY2UnKTtcblx0XHRcdC8vIHNraXAgY29uZmlybVdyaXRlIFx1MjAxNCBzaW11bGF0ZXMgZmFpbGVkIHBlcnNpc3RcblxuXHRcdFx0Ly8gU2Vjb25kIHdyaXRlIHJlY292ZXJzIFx1MjAxNCBwcm9kdWNlcyBhIGZ1bGwgcmVwbGFjZSBhZ2FpblxuXHRcdFx0Y29uc3QgcjIgPSBhZGFwdGVyLndyaXRlKHsgLi4uaW5pdGlhbCwgY291bnQ6IDMgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocjIub3AsICdyZXBsYWNlJyk7XG5cdFx0XHRhZGFwdGVyLmNvbmZpcm1Xcml0ZSgpO1xuXHRcdFx0Y29uc3QgZmlsZUNvbnRlbnQgPSByMi5kYXRhO1xuXG5cdFx0XHQvLyBSZWFkIGJhY2sgc2hvdWxkIGdpdmUgdGhlIGxhc3QgY29tbWl0dGVkIHN0YXRlXG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coY3JlYXRlVGVzdFNjaGVtYSgpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlYWRlci5yZWFkKGZpbGVDb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY291bnQsIDMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5jb25maXJtZWQgYXBwZW5kIGFmdGVyIGNyZWF0ZUluaXRpYWwgc3RpbGwgZGlmZnMgYWdhaW5zdCBpbml0aWFsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1hID0gY3JlYXRlVGVzdFNjaGVtYSgpO1xuXHRcdFx0Y29uc3QgYWRhcHRlciA9IG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpO1xuXG5cdFx0XHRjb25zdCBvYmo6IFRlc3RPYmplY3QgPSB7IG5hbWU6ICd0ZXN0JywgY291bnQ6IDAsIGl0ZW1zOiBbXSB9O1xuXHRcdFx0bGV0IGZpbGVDb250ZW50ID0gYWRhcHRlci5jcmVhdGVJbml0aWFsKG9iaik7XG5cblx0XHRcdC8vIFdyaXRlIGJ1dCBkbyBOT1QgY29uZmlybVxuXHRcdFx0Y29uc3QgcjEgPSBhZGFwdGVyLndyaXRlKHsgLi4ub2JqLCBjb3VudDogMSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyMS5vcCwgJ2FwcGVuZCcpO1xuXHRcdFx0Ly8gc2tpcCBjb25maXJtV3JpdGUgXHUyMDE0IHNpbXVsYXRlcyBmYWlsZWQgcGVyc2lzdCwgZGF0YSBub3QgYXBwZW5kZWQgdG8gZmlsZVxuXG5cdFx0XHQvLyBOZXh0IHdyaXRlIGRpZmZzIGFnYWluc3QgdGhlIGNyZWF0ZUluaXRpYWwgc3RhdGUgKGNvdW50OiAwKVxuXHRcdFx0Y29uc3QgcjIgPSBhZGFwdGVyLndyaXRlKHsgLi4ub2JqLCBjb3VudDogMiB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyMi5vcCwgJ2FwcGVuZCcpO1xuXHRcdFx0YWRhcHRlci5jb25maXJtV3JpdGUoKTtcblx0XHRcdGZpbGVDb250ZW50ID0gVlNCdWZmZXIuY29uY2F0KFtmaWxlQ29udGVudCwgcjIuZGF0YV0pO1xuXG5cdFx0XHRjb25zdCByZWFkZXIgPSBuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coY3JlYXRlVGVzdFNjaGVtYSgpKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlYWRlci5yZWFkKGZpbGVDb250ZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY291bnQsIDIpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncGVyc2lzdGVuY2Ugc2l6ZSBzYWZldHkgbmV0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ21ha2VUcnVuY2F0aW5nUmVwbGFjZXIgdHJ1bmNhdGVzIGFuIG92ZXJzaXplZCBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBiaWcgPSAneCcucmVwZWF0KDIgKiAxMDI0ICogMTAyNCk7XG5cdFx0XHRjb25zdCBvYmogPSB7IGNvbnRlbnQ6IGJpZywgbGFiZWw6ICdvaycgfTtcblx0XHRcdGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeShvYmosIEFkYXB0Lm1ha2VUcnVuY2F0aW5nUmVwbGFjZXIoMTAyNCAqIDEwMjQsIDEwICogMTAyNCAqIDEwMjQpKTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoanNvbik7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocGFyc2VkLmNvbnRlbnQsIGJpZyk7XG5cdFx0XHRhc3NlcnQub2socGFyc2VkLmNvbnRlbnQuc3RhcnRzV2l0aCgnW1ZTIENvZGU6JykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5sYWJlbCwgJ29rJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYWtlVHJ1bmNhdGluZ1JlcGxhY2VyIHJlc3BlY3RzIHRvdGFsIGJ1ZGdldCB3aXRob3V0IG92ZXJzaG9vdGluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IFNUUklOR19DQVAgPSAxMDI0ICogMTAyNDtcblx0XHRcdGNvbnN0IFRPVEFMX0NBUCA9IDEwMjQgKiAxMDI0O1xuXHRcdFx0Y29uc3QgbWVkaXVtID0gJ3knLnJlcGVhdCgyMDAgKiAxMDI0KTsgLy8gdW5kZXIgcGVyLXN0cmluZyBjYXBcblx0XHRcdGNvbnN0IG9iajogYW55ID0ge307XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDIwOyBpKyspIHtcblx0XHRcdFx0b2JqW2BrJHtpfWBdID0gbWVkaXVtO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QganNvbiA9IEpTT04uc3RyaW5naWZ5KG9iaiwgQWRhcHQubWFrZVRydW5jYXRpbmdSZXBsYWNlcihTVFJJTkdfQ0FQLCBUT1RBTF9DQVApKTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoanNvbik7XG5cdFx0XHQvLyBTdW0gb2YgcHJlc2VydmVkIHN0cmluZ3MgbXVzdCBub3QgZXhjZWVkIHRoZSB0b3RhbCBidWRnZXQuXG5cdFx0XHRjb25zdCBwcmVzZXJ2ZWRDaGFycyA9IE9iamVjdC52YWx1ZXMocGFyc2VkKVxuXHRcdFx0XHQuZmlsdGVyKCh2KTogdiBpcyBzdHJpbmcgPT4gdHlwZW9mIHYgPT09ICdzdHJpbmcnICYmIHYgPT09IG1lZGl1bSlcblx0XHRcdFx0LnJlZHVjZSgoc3VtLCB2KSA9PiBzdW0gKyB2Lmxlbmd0aCwgMCk7XG5cdFx0XHRhc3NlcnQub2socHJlc2VydmVkQ2hhcnMgPD0gVE9UQUxfQ0FQLCBgcHJlc2VydmVkICR7cHJlc2VydmVkQ2hhcnN9IGNoYXJzIGV4Y2VlZGVkIGJ1ZGdldCAke1RPVEFMX0NBUH1gKTtcblx0XHRcdC8vIExlYWRpbmcga2V5cyBpbnRhY3QsIGxhdGVyIHJlcGxhY2VkIHdpdGggdG90YWwtYnVkZ2V0IG1hcmtlclxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZC5rMCwgbWVkaXVtKTtcblx0XHRcdGFzc2VydC5vayhPYmplY3QudmFsdWVzKHBhcnNlZCkuc29tZSh2ID0+IHR5cGVvZiB2ID09PSAnc3RyaW5nJyAmJiAodiBhcyBzdHJpbmcpLmluY2x1ZGVzKCdlbnRyeSBleGNlZWRlZCBzaXplIGJ1ZGdldCcpKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdHJpbmdpZnlFbnRyeVdpdGhGYWxsYmFjayBzdWNjZWVkcyB3aXRoIG5vIG92ZXJoZWFkIG9uIHNtYWxsIGVudHJpZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHsga2luZDogMCwgdjogeyBmb286ICdiYXInLCBuOiA0MiB9IH07XG5cdFx0XHRjb25zdCBvdXQgPSBBZGFwdC5zdHJpbmdpZnlFbnRyeVdpdGhGYWxsYmFjayhlbnRyeSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3V0LCBKU09OLnN0cmluZ2lmeShlbnRyeSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaW5naWZ5RW50cnlXaXRoRmFsbGJhY2sgcmV0aHJvd3Mgbm9uLVJhbmdlRXJyb3InLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjaXJjdWxhcjogYW55ID0ge307XG5cdFx0XHRjaXJjdWxhci5zZWxmID0gY2lyY3VsYXI7IC8vIEpTT04uc3RyaW5naWZ5IHRocm93cyBUeXBlRXJyb3Igb24gY2lyY3VsYXJzXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IEFkYXB0LnN0cmluZ2lmeUVudHJ5V2l0aEZhbGxiYWNrKGNpcmN1bGFyKSwgVHlwZUVycm9yKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0cmluZ2lmeUVudHJ5V2l0aEZhbGxiYWNrIHJlY292ZXJzIHdoZW4gSlNPTi5zdHJpbmdpZnkgdGhyb3dzIFJhbmdlRXJyb3InLCAoKSA9PiB7XG5cdFx0XHQvLyBVc2UgdG9KU09OIHRvIGZvcmNlIGEgUmFuZ2VFcnJvciBvbiB0aGUgZmlyc3Qgc3RyaW5naWZ5IHBhc3MsXG5cdFx0XHQvLyB0aGVuIHN1Y2NlZWQgb24gdGhlIHJldHJ5LiBBdm9pZHMgbmVlZGluZyA1MDArIE1pQiBvZiBhbGxvY2F0aW9ucy5cblx0XHRcdGxldCBjYWxscyA9IDA7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHtcblx0XHRcdFx0dG9KU09OKCkge1xuXHRcdFx0XHRcdGNhbGxzKys7XG5cdFx0XHRcdFx0aWYgKGNhbGxzID09PSAxKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgUmFuZ2VFcnJvcignSW52YWxpZCBzdHJpbmcgbGVuZ3RoJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB7IGNvbnRlbnQ6ICdyZWNvdmVyZWQnIH07XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgb3V0ID0gQWRhcHQuc3RyaW5naWZ5RW50cnlXaXRoRmFsbGJhY2soZW50cnkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzLCAyLCAnc2hvdWxkIGhhdmUgYmVlbiBjYWxsZWQgdHdpY2UgKGluaXRpYWwgKyByZXRyeSknKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5wYXJzZShvdXQpLCB7IGNvbnRlbnQ6ICdyZWNvdmVyZWQnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3RyaW5naWZ5RW50cnlXaXRoRmFsbGJhY2sgYXBwbGllcyB0cnVuY2F0aW5nIHJlcGxhY2VyIG9uIFJhbmdlRXJyb3IgcmV0cnknLCAoKSA9PiB7XG5cdFx0XHQvLyBTYW1lIHRyaWNrLCBidXQgdGhlIHJlY292ZXJlZCBwYXlsb2FkIGNvbnRhaW5zIGFuIG92ZXJzaXplZFxuXHRcdFx0Ly8gc3RyaW5nIHRoYXQgbXVzdCBiZSB0cnVuY2F0ZWQgYnkgdGhlIHJlcGxhY2VyIG9uIHRoZSByZXRyeS5cblx0XHRcdGNvbnN0IGJpZyA9ICd4Jy5yZXBlYXQoMiAqIDEwMjQgKiAxMDI0KTsgLy8gMiBNaUIsIG92ZXIgdGhlIDEgTWlCIHBlci1zdHJpbmcgY2FwXG5cdFx0XHRsZXQgY2FsbHMgPSAwO1xuXHRcdFx0Y29uc3QgZW50cnkgPSB7XG5cdFx0XHRcdHRvSlNPTigpIHtcblx0XHRcdFx0XHRjYWxscysrO1xuXHRcdFx0XHRcdGlmIChjYWxscyA9PT0gMSkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0ludmFsaWQgc3RyaW5nIGxlbmd0aCcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4geyBjb250ZW50OiBiaWcsIGxhYmVsOiAnb2snIH07XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgb3V0ID0gQWRhcHQuc3RyaW5naWZ5RW50cnlXaXRoRmFsbGJhY2soZW50cnkpO1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShvdXQpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHBhcnNlZC5jb250ZW50LCBiaWcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBhcnNlZC5jb250ZW50LnN0YXJ0c1dpdGgoJ1tWUyBDb2RlOicpLCBgdW5leHBlY3RlZDogJHtwYXJzZWQuY29udGVudC5zbGljZSgwLCA4MCl9YCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkLmxhYmVsLCAnb2snKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlZXBDbG9uZVdpdGhGYWxsYmFjayByZXR1cm5zIGEgc3RydWN0dXJhbCBjbG9uZSBvbiB0aGUgY29tbW9uIHBhdGgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvcmlnaW5hbCA9IHsgYTogMSwgbmVzdGVkOiB7IGI6ICd0d28nLCBsaXN0OiBbMSwgMiwgM10gfSB9O1xuXHRcdFx0Y29uc3QgY2xvbmUgPSBBZGFwdC5kZWVwQ2xvbmVXaXRoRmFsbGJhY2sob3JpZ2luYWwpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbG9uZSwgb3JpZ2luYWwpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGNsb25lLCBvcmlnaW5hbCk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoY2xvbmUubmVzdGVkLCBvcmlnaW5hbC5uZXN0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVlcENsb25lV2l0aEZhbGxiYWNrIHJlY292ZXJzIGZyb20gUmFuZ2VFcnJvciBkdXJpbmcgdGhlIGNsb25lJywgKCkgPT4ge1xuXHRcdFx0Ly8gVGhlIHZhbHVlKCkgdHJhbnNmb3JtIGRlZXAtY2xvbmVzIGV4dHJhY3RlZCBvYmplY3RzIG9uIGV2ZXJ5IHdyaXRlLFxuXHRcdFx0Ly8gKmJlZm9yZSogYW55IGVudHJ5IGlzIHNlcmlhbGl6ZWQuIEEgc2luZ2xlIG92ZXJzaXplZCBmaWVsZCB1c2VkIHRvXG5cdFx0XHQvLyB0aHJvdyBSYW5nZUVycm9yIGhlcmUgYW5kIGxvc2UgdGhlIHdob2xlIHNlc3Npb24gKCMzMjIzNjQpLiBUaGUgY2xvbmVcblx0XHRcdC8vIG11c3QgaW5zdGVhZCB0cnVuY2F0ZSBhbmQgc3VjY2VlZC5cblx0XHRcdGNvbnN0IGJpZyA9ICd4Jy5yZXBlYXQoMiAqIDEwMjQgKiAxMDI0KTsgLy8gMiBNaUIsIG92ZXIgdGhlIDEgTWlCIHBlci1zdHJpbmcgY2FwXG5cdFx0XHRsZXQgY2FsbHMgPSAwO1xuXHRcdFx0Y29uc3QgdmFsdWU6IHsgaHVnZTogc3RyaW5nOyBsYWJlbDogc3RyaW5nOyB0b0pTT04oKTogeyBodWdlOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmcgfSB9ID0ge1xuXHRcdFx0XHRodWdlOiBiaWcsXG5cdFx0XHRcdGxhYmVsOiAnb2snLFxuXHRcdFx0XHR0b0pTT04oKSB7XG5cdFx0XHRcdFx0Y2FsbHMrKztcblx0XHRcdFx0XHRpZiAoY2FsbHMgPT09IDEpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBSYW5nZUVycm9yKCdJbnZhbGlkIHN0cmluZyBsZW5ndGgnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHsgaHVnZTogYmlnLCBsYWJlbDogJ29rJyB9O1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGNsb25lID0gQWRhcHQuZGVlcENsb25lV2l0aEZhbGxiYWNrKHZhbHVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscywgMiwgJ3Nob3VsZCBoYXZlIGJlZW4gY2FsbGVkIHR3aWNlIChpbml0aWFsICsgcmV0cnkpJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xvbmUubGFiZWwsICdvaycpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGNsb25lLmh1Z2UsIGJpZyk7XG5cdFx0XHRhc3NlcnQub2soY2xvbmUuaHVnZS5zdGFydHNXaXRoKCdbVlMgQ29kZTonKSwgYHVuZXhwZWN0ZWQ6ICR7Y2xvbmUuaHVnZS5zbGljZSgwLCA4MCl9YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2YWx1ZSgpLmV4dHJhY3QgcmVjb3ZlcnMgd2hlbiB0aGUgZGVlcC1jbG9uZSB0aHJvd3MgUmFuZ2VFcnJvcicsICgpID0+IHtcblx0XHRcdC8vIEVuZC10by1lbmQ6IGFuIG92ZXJzaXplZCBvYmplY3QgZmxvd2luZyB0aHJvdWdoIGEgdmFsdWUoKSB0cmFuc2Zvcm1cblx0XHRcdC8vIChhcyBJQ2hhdEFnZW50UmVzdWx0Lm1ldGFkYXRhLnRvb2xDYWxsUmVzdWx0cyBkb2VzKSBtdXN0IG5vdCB0aHJvdy5cblx0XHRcdGNvbnN0IGJpZyA9ICd4Jy5yZXBlYXQoMiAqIDEwMjQgKiAxMDI0KTtcblx0XHRcdGxldCBjYWxscyA9IDA7XG5cdFx0XHRjb25zdCBodWdlID0ge1xuXHRcdFx0XHRrZXB0OiAnbWV0YScsXG5cdFx0XHRcdHRvSlNPTigpIHtcblx0XHRcdFx0XHRjYWxscysrO1xuXHRcdFx0XHRcdGlmIChjYWxscyA9PT0gMSkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IFJhbmdlRXJyb3IoJ0ludmFsaWQgc3RyaW5nIGxlbmd0aCcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4geyBkdW1wOiBiaWcsIGtlcHQ6ICdtZXRhJyB9O1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHRyYW5zZm9ybSA9IEFkYXB0LnZhbHVlPHR5cGVvZiBodWdlLCB7IGR1bXA6IHN0cmluZzsga2VwdDogc3RyaW5nIH0+KChhLCBiKSA9PiBhLmR1bXAgPT09IGIuZHVtcCAmJiBhLmtlcHQgPT09IGIua2VwdCk7XG5cdFx0XHRjb25zdCBleHRyYWN0ZWQgPSB0cmFuc2Zvcm0uZXh0cmFjdChodWdlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscywgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXh0cmFjdGVkLmtlcHQsICdtZXRhJyk7XG5cdFx0XHRhc3NlcnQub2soZXh0cmFjdGVkLmR1bXAuc3RhcnRzV2l0aCgnW1ZTIENvZGU6JykpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsK0NBQStDO0FBQ3hELFlBQVksV0FBVztBQUN2QixTQUFTLGNBQWM7QUFFdkIsTUFBTSwyQkFBMkIsTUFBTTtBQUN0QywwQ0FBd0M7QUFnQnhDLFdBQVMsbUJBQW1CO0FBQzNCLFVBQU0sYUFBYSxNQUFNLE9BQTJCO0FBQUEsTUFDbkQsSUFBSSxNQUFNLEVBQUUsT0FBSyxFQUFFLElBQUksTUFBTSxJQUFJLENBQUM7QUFBQSxNQUNsQyxPQUFPLE1BQU0sRUFBRSxPQUFLLEVBQUUsT0FBTyxNQUFNLE1BQU0sQ0FBQztBQUFBLElBQzNDLENBQUM7QUFFRCxXQUFPLE1BQU0sT0FBK0I7QUFBQSxNQUMzQyxNQUFNLE1BQU0sRUFBRSxPQUFLLEVBQUUsTUFBTSxNQUFNLE1BQU0sQ0FBQztBQUFBLE1BQ3hDLE9BQU8sTUFBTSxFQUFFLE9BQUssRUFBRSxPQUFPLE1BQU0sTUFBTSxDQUFDO0FBQUEsTUFDMUMsT0FBTyxNQUFNLEVBQUUsT0FBSyxFQUFFLE9BQU8sTUFBTSxNQUFNLFVBQVUsQ0FBQztBQUFBLE1BQ3BELFVBQVUsTUFBTSxFQUFFLE9BQUssRUFBRSxVQUFVLE1BQU07QUFBQSxJQUMxQyxDQUFDO0FBQUEsRUFDRjtBQUdBLFdBQVMsc0JBQXNCLFNBQTBELFNBQXFCLFNBQW1DO0FBQ2hKLFFBQUksY0FBYyxRQUFRLGNBQWMsT0FBTztBQUUvQyxlQUFXLFVBQVUsU0FBUztBQUM3QixZQUFNLFNBQVMsUUFBUSxNQUFNLE1BQU07QUFDbkMsVUFBSSxPQUFPLE9BQU8sV0FBVztBQUM1QixzQkFBYyxPQUFPO0FBQUEsTUFDdEIsT0FBTztBQUNOLHNCQUFjLFNBQVMsT0FBTyxDQUFDLGFBQWEsT0FBTyxJQUFJLENBQUM7QUFBQSxNQUN6RDtBQUNBLGNBQVEsYUFBYTtBQUFBLElBQ3RCO0FBR0EsVUFBTSxTQUFTLElBQUksTUFBTSxrQkFBa0IsaUJBQWlCLENBQUM7QUFDN0QsV0FBTyxPQUFPLEtBQUssV0FBVztBQUFBLEVBQy9CO0FBRUEsUUFBTSx1QkFBdUIsTUFBTTtBQUNsQyxTQUFLLHVDQUF1QyxNQUFNO0FBQ2pELFlBQU0sWUFBWSxNQUFNLElBQVk7QUFDcEMsYUFBTyxZQUFZLFVBQVUsT0FBTyxLQUFLLEdBQUcsR0FBRyxJQUFJO0FBQ25ELGFBQU8sWUFBWSxVQUFVLE9BQU8sS0FBSyxHQUFHLEdBQUcsS0FBSztBQUFBLElBQ3JELENBQUM7QUFFRCxTQUFLLDhCQUE4QixNQUFNO0FBQ3hDLFlBQU0sWUFBWSxNQUFNLElBQW9CLENBQUMsR0FBRyxNQUFNLEVBQUUsT0FBTyxFQUFFLEVBQUU7QUFDbkUsYUFBTyxZQUFZLFVBQVUsT0FBTyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLENBQUMsR0FBRyxJQUFJO0FBQy9ELGFBQU8sWUFBWSxVQUFVLE9BQU8sRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxDQUFDLEdBQUcsS0FBSztBQUFBLElBQ2pFLENBQUM7QUFFRCxTQUFLLGtDQUFrQyxNQUFNO0FBQzVDLFlBQU0sWUFBWSxNQUFNLE1BQXNCO0FBQzlDLGFBQU8sWUFBWSxVQUFVLE9BQU8sR0FBRyxDQUFDLEdBQUcsSUFBSTtBQUMvQyxhQUFPLFlBQVksVUFBVSxPQUFPLEdBQUcsQ0FBQyxHQUFHLEtBQUs7QUFBQSxJQUNqRCxDQUFDO0FBRUQsU0FBSyxvQ0FBb0MsTUFBTTtBQUM5QyxZQUFNLFlBQVksTUFBTSxNQUFzQixDQUFDLEdBQUcsTUFBTSxFQUFFLFlBQVksTUFBTSxFQUFFLFlBQVksQ0FBQztBQUMzRixhQUFPLFlBQVksVUFBVSxPQUFPLE9BQU8sS0FBSyxHQUFHLElBQUk7QUFDdkQsYUFBTyxZQUFZLFVBQVUsT0FBTyxPQUFPLEtBQUssR0FBRyxLQUFLO0FBQUEsSUFDekQsQ0FBQztBQUVELFNBQUssMkNBQTJDLE1BQU07QUFDckQsWUFBTSxTQUFTLE1BQU0sT0FBMkQ7QUFBQSxRQUMvRSxHQUFHLE1BQU0sRUFBRSxPQUFLLEVBQUUsR0FBRyxNQUFNLE1BQU0sQ0FBQztBQUFBLFFBQ2xDLEdBQUcsTUFBTSxFQUFFLE9BQUssRUFBRSxHQUFHLE1BQU0sTUFBTSxDQUFDO0FBQUEsTUFDbkMsQ0FBQztBQUVELFlBQU0sWUFBWSxPQUFPLFFBQVEsRUFBRSxHQUFHLEdBQUcsR0FBRyxPQUFPLENBQUM7QUFDcEQsYUFBTyxZQUFZLFVBQVUsR0FBRyxDQUFDO0FBQ2pDLGFBQU8sWUFBWSxVQUFVLEdBQUcsTUFBTTtBQUFBLElBQ3ZDLENBQUM7QUFFRCxTQUFLLG9DQUFvQyxNQUFNO0FBQzlDLFlBQU0sWUFBWSxNQUFNO0FBQUEsUUFDdkIsQ0FBQyxRQUF1QyxJQUFJLE9BQU87QUFBQSxRQUNuRCxNQUFNLE1BQXNCO0FBQUEsTUFDN0I7QUFFQSxhQUFPLFlBQVksVUFBVSxRQUFRLEVBQUUsUUFBUSxFQUFFLE9BQU8sR0FBRyxFQUFFLENBQUMsR0FBRyxFQUFFO0FBQUEsSUFDcEUsQ0FBQztBQUVELFNBQUssNkRBQTZELE1BQU07QUFDdkUsWUFBTSxZQUFZLE1BQU07QUFBQSxRQUN2QixTQUFPLEdBQUcsSUFBSSxJQUFJLElBQUksSUFBSSxJQUFJO0FBQUEsUUFDOUIsQ0FBQyxHQUFHLE1BQU0sRUFBRSxNQUFNLEdBQUcsRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEdBQUcsRUFBRSxDQUFDO0FBQUE7QUFBQSxNQUM3QztBQUVBLFlBQU0sWUFBWSxVQUFVLFFBQVEsRUFBRSxNQUFNLFFBQVEsTUFBTSxJQUFJLENBQUM7QUFDL0QsYUFBTyxZQUFZLFdBQVcsVUFBVTtBQUd4QyxhQUFPLFlBQVksVUFBVSxPQUFPLFlBQVksVUFBVSxHQUFHLElBQUk7QUFFakUsYUFBTyxZQUFZLFVBQVUsT0FBTyxZQUFZLFdBQVcsR0FBRyxLQUFLO0FBQUEsSUFDcEUsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sY0FBYyxNQUFNO0FBQ3pCLFNBQUsseUNBQXlDLE1BQU07QUFDbkQsWUFBTSxTQUFTLGlCQUFpQjtBQUNoQyxZQUFNLFVBQVUsSUFBSSxNQUFNLGtCQUFrQixNQUFNO0FBRWxELFlBQU0sVUFBc0IsRUFBRSxNQUFNLFFBQVEsT0FBTyxHQUFHLE9BQU8sQ0FBQyxFQUFFO0FBQ2hFLFlBQU0sU0FBUyxRQUFRLGNBQWMsT0FBTztBQUU1QyxZQUFNLFVBQVUsT0FBTyxTQUFTO0FBQ2hDLFlBQU0sUUFBUSxLQUFLLE1BQU0sUUFBUSxLQUFLLENBQUM7QUFDdkMsYUFBTyxZQUFZLE1BQU0sTUFBTSxDQUFDO0FBQ2hDLGFBQU8sZ0JBQWdCLE1BQU0sR0FBRyxPQUFPO0FBQUEsSUFDeEMsQ0FBQztBQUVELFNBQUssbUNBQW1DLE1BQU07QUFDN0MsWUFBTSxTQUFTLGlCQUFpQjtBQUNoQyxZQUFNLFVBQVUsSUFBSSxNQUFNLGtCQUFrQixNQUFNO0FBRWxELFlBQU0sVUFBc0IsRUFBRSxNQUFNLFFBQVEsT0FBTyxHQUFHLE9BQU8sQ0FBQyxFQUFFLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQyxFQUFFO0FBQ3JGLFlBQU0sU0FBUyxRQUFRLGNBQWMsT0FBTztBQUU1QyxZQUFNLFNBQVMsSUFBSSxNQUFNLGtCQUFrQixNQUFNO0FBQ2pELFlBQU0sU0FBUyxPQUFPLEtBQUssTUFBTTtBQUVqQyxhQUFPLGdCQUFnQixRQUFRLE9BQU87QUFBQSxJQUN2QyxDQUFDO0FBRUQsU0FBSyw0Q0FBNEMsTUFBTTtBQUN0RCxZQUFNLFNBQVMsaUJBQWlCO0FBQ2hDLFlBQU0sVUFBVSxJQUFJLE1BQU0sa0JBQWtCLE1BQU07QUFFbEQsWUFBTSxNQUFrQixFQUFFLE1BQU0sUUFBUSxPQUFPLEdBQUcsT0FBTyxDQUFDLEVBQUU7QUFDNUQsY0FBUSxjQUFjLEdBQUc7QUFFekIsWUFBTSxTQUFTLFFBQVEsTUFBTSxHQUFHO0FBQ2hDLGFBQU8sWUFBWSxPQUFPLElBQUksUUFBUTtBQUN0QyxhQUFPLFlBQVksT0FBTyxLQUFLLFNBQVMsR0FBRyxFQUFFO0FBQUEsSUFDOUMsQ0FBQztBQUVELFNBQUssbUNBQW1DLE1BQU07QUFDN0MsWUFBTSxTQUFTLGlCQUFpQjtBQUNoQyxZQUFNLFVBQVUsSUFBSSxNQUFNLGtCQUFrQixNQUFNO0FBRWxELFlBQU0sTUFBa0IsRUFBRSxNQUFNLFFBQVEsT0FBTyxHQUFHLE9BQU8sQ0FBQyxFQUFFO0FBQzVELGNBQVEsY0FBYyxHQUFHO0FBRXpCLFlBQU0sVUFBVSxFQUFFLEdBQUcsS0FBSyxPQUFPLEdBQUc7QUFDcEMsWUFBTSxTQUFTLFFBQVEsTUFBTSxPQUFPO0FBRXBDLGFBQU8sWUFBWSxPQUFPLElBQUksUUFBUTtBQUN0QyxZQUFNLFFBQVEsS0FBSyxNQUFNLE9BQU8sS0FBSyxTQUFTLEVBQUUsS0FBSyxDQUFDO0FBQ3RELGFBQU8sWUFBWSxNQUFNLE1BQU0sQ0FBQztBQUNoQyxhQUFPLGdCQUFnQixNQUFNLEdBQUcsQ0FBQyxPQUFPLENBQUM7QUFDekMsYUFBTyxZQUFZLE1BQU0sR0FBRyxFQUFFO0FBQUEsSUFDL0IsQ0FBQztBQUVELFNBQUssOEJBQThCLE1BQU07QUFDeEMsWUFBTSxTQUFTLGlCQUFpQjtBQUNoQyxZQUFNLFVBQVUsSUFBSSxNQUFNLGtCQUFrQixNQUFNO0FBRWxELFlBQU0sTUFBa0IsRUFBRSxNQUFNLFFBQVEsT0FBTyxHQUFHLE9BQU8sQ0FBQyxFQUFFLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQyxFQUFFO0FBQ2pGLGNBQVEsY0FBYyxHQUFHO0FBRXpCLFlBQU0sVUFBc0IsRUFBRSxHQUFHLEtBQUssT0FBTyxDQUFDLEdBQUcsSUFBSSxPQUFPLEVBQUUsSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDLEVBQUU7QUFDbkYsWUFBTSxTQUFTLFFBQVEsTUFBTSxPQUFPO0FBRXBDLFlBQU0sUUFBUSxLQUFLLE1BQU0sT0FBTyxLQUFLLFNBQVMsRUFBRSxLQUFLLENBQUM7QUFDdEQsYUFBTyxZQUFZLE1BQU0sTUFBTSxDQUFDO0FBQ2hDLGFBQU8sZ0JBQWdCLE1BQU0sR0FBRyxDQUFDLE9BQU8sQ0FBQztBQUN6QyxhQUFPLGdCQUFnQixNQUFNLEdBQUcsQ0FBQyxFQUFFLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQyxDQUFDO0FBQ3ZELGFBQU8sWUFBWSxNQUFNLEdBQUcsTUFBUztBQUFBLElBQ3RDLENBQUM7QUFFRCxTQUFLLHFDQUFxQyxNQUFNO0FBRS9DLFlBQU0sYUFBYSxNQUFNLE9BQW1CO0FBQUEsUUFDM0MsSUFBSSxNQUFNLEVBQUUsT0FBSyxFQUFFLElBQUksTUFBTSxJQUFJLENBQUM7QUFBQSxRQUNsQyxPQUFPLE1BQU0sRUFBRSxPQUFLLEVBQUUsT0FBTyxNQUFNLE1BQU0sTUFBTSxNQUFNLENBQUMsQ0FBQztBQUFBLE1BQ3hELENBQUM7QUFHRCxZQUFNLFNBQVMsTUFBTSxPQUErQjtBQUFBLFFBQ25ELE9BQU8sTUFBTSxFQUFFLE9BQUssRUFBRSxPQUFPLE1BQU0sTUFBTSxVQUFVLENBQUM7QUFBQSxNQUNyRCxDQUFDO0FBRUQsWUFBTSxVQUFVLElBQUksTUFBTSxrQkFBa0IsTUFBTTtBQUVsRCxjQUFRLGNBQWMsRUFBRSxPQUFPLENBQUMsRUFBRSxJQUFJLEtBQUssT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO0FBRzdELFlBQU0sVUFBVSxRQUFRLE1BQU0sRUFBRSxPQUFPLENBQUMsRUFBRSxJQUFJLEtBQUssT0FBTyxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFDeEUsY0FBUSxhQUFhO0FBQ3JCLGFBQU87QUFBQSxRQUNOLEtBQUssTUFBTSxRQUFRLEtBQUssU0FBUyxFQUFFLEtBQUssQ0FBQztBQUFBLFFBQ3pDLEVBQUUsTUFBTSxHQUFHLEdBQUcsQ0FBQyxTQUFTLEdBQUcsT0FBTyxHQUFHLEdBQUcsQ0FBQyxDQUFDLEVBQUU7QUFBQSxNQUM3QztBQUVBLFlBQU0sVUFBVSxRQUFRLE1BQU0sRUFBRSxPQUFPLENBQUMsRUFBRSxJQUFJLEtBQUssT0FBTyxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFDeEUsYUFBTztBQUFBLFFBQ04sS0FBSyxNQUFNLFFBQVEsS0FBSyxTQUFTLEVBQUUsS0FBSyxDQUFDO0FBQUEsUUFDekMsRUFBRSxNQUFNLEdBQUcsR0FBRyxDQUFDLE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxDQUFDLEVBQUUsSUFBSSxLQUFLLE9BQU8sQ0FBQyxHQUFHLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRTtBQUFBLE1BQ25FO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxrQ0FBa0MsTUFBTTtBQUM1QyxZQUFNLFNBQVMsaUJBQWlCO0FBQ2hDLFlBQU0sVUFBVSxJQUFJLE1BQU0sa0JBQWtCLE1BQU07QUFFbEQsWUFBTSxNQUFrQixFQUFFLE1BQU0sUUFBUSxPQUFPLEdBQUcsT0FBTyxDQUFDLEVBQUUsSUFBSSxLQUFLLE9BQU8sRUFBRSxHQUFHLEVBQUUsSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDLEVBQUU7QUFDeEcsY0FBUSxjQUFjLEdBQUc7QUFFekIsWUFBTSxVQUFzQixFQUFFLEdBQUcsS0FBSyxPQUFPLENBQUMsSUFBSSxNQUFNLENBQUMsQ0FBQyxFQUFFO0FBQzVELFlBQU0sU0FBUyxRQUFRLE1BQU0sT0FBTztBQUVwQyxZQUFNLFFBQVEsS0FBSyxNQUFNLE9BQU8sS0FBSyxTQUFTLEVBQUUsS0FBSyxDQUFDO0FBQ3RELGFBQU8sWUFBWSxNQUFNLE1BQU0sQ0FBQztBQUNoQyxhQUFPLGdCQUFnQixNQUFNLEdBQUcsQ0FBQyxPQUFPLENBQUM7QUFDekMsYUFBTyxZQUFZLE1BQU0sR0FBRyxDQUFDO0FBQzdCLGFBQU8sWUFBWSxNQUFNLEdBQUcsTUFBUztBQUFBLElBQ3RDLENBQUM7QUFFRCxTQUFLLGtFQUFrRSxNQUFNO0FBQzVFLFlBQU0sU0FBUyxpQkFBaUI7QUFDaEMsWUFBTSxVQUFVLElBQUksTUFBTSxrQkFBa0IsTUFBTTtBQUVsRCxZQUFNLE1BQWtCO0FBQUEsUUFDdkIsTUFBTTtBQUFBLFFBQ04sT0FBTztBQUFBLFFBQ1AsT0FBTyxDQUFDLEVBQUUsSUFBSSxLQUFLLE9BQU8sRUFBRSxHQUFHLEVBQUUsSUFBSSxLQUFLLE9BQU8sRUFBRSxHQUFHLEVBQUUsSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO0FBQUEsTUFDNUU7QUFDQSxjQUFRLGNBQWMsR0FBRztBQUd6QixZQUFNLFVBQXNCO0FBQUEsUUFDM0IsR0FBRztBQUFBLFFBQ0gsT0FBTyxDQUFDLEVBQUUsSUFBSSxLQUFLLE9BQU8sRUFBRSxHQUFHLEVBQUUsSUFBSSxLQUFLLE9BQU8sSUFBSSxHQUFHLEVBQUUsSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO0FBQUEsTUFDOUU7QUFDQSxZQUFNLFNBQVMsUUFBUSxNQUFNLE9BQU87QUFFcEMsWUFBTSxRQUFRLEtBQUssTUFBTSxPQUFPLEtBQUssU0FBUyxFQUFFLEtBQUssQ0FBQztBQUN0RCxhQUFPLFlBQVksTUFBTSxNQUFNLENBQUM7QUFDaEMsYUFBTyxnQkFBZ0IsTUFBTSxHQUFHLENBQUMsU0FBUyxHQUFHLE9BQU8sQ0FBQztBQUNyRCxhQUFPLFlBQVksTUFBTSxHQUFHLEdBQUc7QUFBQSxJQUNoQyxDQUFDO0FBRUQsU0FBSywyQ0FBMkMsTUFBTTtBQUNyRCxZQUFNLFNBQVMsaUJBQWlCO0FBQ2hDLFlBQU0sVUFBc0IsRUFBRSxNQUFNLFFBQVEsT0FBTyxHQUFHLE9BQU8sQ0FBQyxFQUFFO0FBR2hFLFlBQU0sVUFBVTtBQUFBLFFBQ2YsRUFBRSxNQUFNLEdBQUcsR0FBRyxRQUFRO0FBQUEsUUFDdEIsRUFBRSxNQUFNLEdBQUcsR0FBRyxDQUFDLE9BQU8sR0FBRyxHQUFHLEVBQUU7QUFBQSxRQUM5QixFQUFFLE1BQU0sR0FBRyxHQUFHLENBQUMsT0FBTyxHQUFHLEdBQUcsQ0FBQyxFQUFFLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQyxFQUFFO0FBQUEsUUFDcEQsRUFBRSxNQUFNLEdBQUcsR0FBRyxDQUFDLE9BQU8sR0FBRyxHQUFHLENBQUMsRUFBRSxJQUFJLEtBQUssT0FBTyxFQUFFLENBQUMsRUFBRTtBQUFBLE1BQ3JEO0FBQ0EsWUFBTSxhQUFhLFFBQVEsSUFBSSxPQUFLLEtBQUssVUFBVSxDQUFDLENBQUMsRUFBRSxLQUFLLElBQUksSUFBSTtBQUVwRSxZQUFNLFVBQVUsSUFBSSxNQUFNLGtCQUFrQixNQUFNO0FBQ2xELFlBQU0sU0FBUyxRQUFRLEtBQUssU0FBUyxXQUFXLFVBQVUsQ0FBQztBQUUzRCxhQUFPLFlBQVksT0FBTyxPQUFPLENBQUM7QUFDbEMsYUFBTyxZQUFZLE9BQU8sTUFBTSxRQUFRLENBQUM7QUFDekMsYUFBTyxnQkFBZ0IsT0FBTyxNQUFNLENBQUMsR0FBRyxFQUFFLElBQUksS0FBSyxPQUFPLEVBQUUsQ0FBQztBQUM3RCxhQUFPLGdCQUFnQixPQUFPLE1BQU0sQ0FBQyxHQUFHLEVBQUUsSUFBSSxLQUFLLE9BQU8sRUFBRSxDQUFDO0FBQUEsSUFDOUQsQ0FBQztBQUVELFNBQUsscURBQXFELE1BQU07QUFDL0QsWUFBTSxTQUFTLGlCQUFpQjtBQUNoQyxZQUFNLFVBQVUsSUFBSSxNQUFNLGtCQUFrQixNQUFNO0FBRWxELFlBQU0sVUFBc0IsRUFBRSxNQUFNLFFBQVEsT0FBTyxHQUFHLE9BQU8sQ0FBQyxFQUFFO0FBQ2hFLFlBQU0sVUFBd0I7QUFBQSxRQUM3QixFQUFFLE1BQU0sUUFBUSxPQUFPLEdBQUcsT0FBTyxDQUFDLEVBQUU7QUFBQSxRQUNwQyxFQUFFLE1BQU0sUUFBUSxPQUFPLEdBQUcsT0FBTyxDQUFDLEVBQUUsSUFBSSxLQUFLLE9BQU8sR0FBRyxDQUFDLEVBQUU7QUFBQSxRQUMxRCxFQUFFLE1BQU0sUUFBUSxPQUFPLEdBQUcsT0FBTyxDQUFDLEVBQUUsSUFBSSxLQUFLLE9BQU8sR0FBRyxHQUFHLEVBQUUsSUFBSSxLQUFLLE9BQU8sR0FBRyxDQUFDLEVBQUU7QUFBQSxRQUNsRixFQUFFLE1BQU0sUUFBUSxPQUFPLEdBQUcsT0FBTyxDQUFDLEVBQUUsSUFBSSxLQUFLLE9BQU8sR0FBRyxDQUFDLEVBQUU7QUFBQTtBQUFBLE1BQzNEO0FBRUEsWUFBTSxTQUFTLHNCQUFzQixTQUFTLFNBQVMsT0FBTztBQUM5RCxhQUFPLGdCQUFnQixRQUFRLFFBQVEsUUFBUSxTQUFTLENBQUMsQ0FBQztBQUFBLElBQzNELENBQUM7QUFFRCxTQUFLLG1EQUFtRCxNQUFNO0FBQzdELFlBQU0sU0FBUyxpQkFBaUI7QUFDaEMsWUFBTSxVQUFVLElBQUksTUFBTSxrQkFBa0IsUUFBUSxDQUFDO0FBRXJELFlBQU0sTUFBa0IsRUFBRSxNQUFNLFFBQVEsT0FBTyxHQUFHLE9BQU8sQ0FBQyxFQUFFO0FBQzVELGNBQVEsY0FBYyxHQUFHO0FBRXpCLGNBQVEsTUFBTSxFQUFFLEdBQUcsS0FBSyxPQUFPLEVBQUUsQ0FBQztBQUNsQyxjQUFRLGFBQWE7QUFDckIsY0FBUSxNQUFNLEVBQUUsR0FBRyxLQUFLLE9BQU8sRUFBRSxDQUFDO0FBQ2xDLGNBQVEsYUFBYTtBQUVyQixZQUFNLFNBQVMsUUFBUSxNQUFNLEVBQUUsR0FBRyxLQUFLLE9BQU8sRUFBRSxDQUFDO0FBQ2pELGNBQVEsYUFBYTtBQUNyQixhQUFPLFlBQVksT0FBTyxJQUFJLFFBQVE7QUFHdEMsWUFBTSxTQUFTLFFBQVEsTUFBTSxFQUFFLEdBQUcsS0FBSyxPQUFPLEVBQUUsQ0FBQztBQUNqRCxhQUFPLFlBQVksT0FBTyxJQUFJLFNBQVM7QUFHdkMsWUFBTSxRQUFRLE9BQU8sS0FBSyxTQUFTLEVBQUUsTUFBTSxJQUFJLEVBQUUsT0FBTyxPQUFLLEVBQUUsS0FBSyxDQUFDO0FBQ3JFLGFBQU8sWUFBWSxNQUFNLFFBQVEsQ0FBQztBQUNsQyxZQUFNLFFBQVEsS0FBSyxNQUFNLE1BQU0sQ0FBQyxDQUFDO0FBQ2pDLGFBQU8sWUFBWSxNQUFNLE1BQU0sQ0FBQztBQUFBLElBQ2pDLENBQUM7QUFFRCxTQUFLLHdDQUF3QyxNQUFNO0FBQ2xELFlBQU0sU0FBUyxpQkFBaUI7QUFDaEMsWUFBTSxVQUFVLElBQUksTUFBTSxrQkFBa0IsTUFBTTtBQUVsRCxZQUFNLE1BQWtCLEVBQUUsTUFBTSxRQUFRLE9BQU8sR0FBRyxPQUFPLENBQUMsR0FBRyxVQUFVLEVBQUUsTUFBTSxDQUFDLEdBQUcsRUFBRSxFQUFFO0FBQ3ZGLGNBQVEsY0FBYyxHQUFHO0FBRXpCLFlBQU0sVUFBc0IsRUFBRSxHQUFHLEtBQUssVUFBVSxFQUFFLE1BQU0sQ0FBQyxLQUFLLEdBQUcsRUFBRSxFQUFFO0FBQ3JFLFlBQU0sU0FBUyxRQUFRLE1BQU0sT0FBTztBQUVwQyxZQUFNLFFBQVEsS0FBSyxNQUFNLE9BQU8sS0FBSyxTQUFTLEVBQUUsS0FBSyxDQUFDO0FBQ3RELGFBQU8sWUFBWSxNQUFNLE1BQU0sQ0FBQztBQUNoQyxhQUFPLGdCQUFnQixNQUFNLEdBQUcsQ0FBQyxVQUFVLENBQUM7QUFDNUMsYUFBTyxnQkFBZ0IsTUFBTSxHQUFHLEVBQUUsTUFBTSxDQUFDLEtBQUssR0FBRyxFQUFFLENBQUM7QUFBQSxJQUNyRCxDQUFDO0FBRUQsU0FBSywyQ0FBMkMsTUFBTTtBQU1yRCxZQUFNLFNBQVMsTUFBTSxPQUFrQztBQUFBLFFBQ3RELE1BQU0sTUFBTTtBQUFBLFVBQ1gsT0FBSyxFQUFFO0FBQUEsVUFDUCxNQUFNO0FBQUEsWUFDTCxTQUFPLEdBQUcsSUFBSSxJQUFJLElBQUksSUFBSSxPQUFPO0FBQUEsWUFDakMsQ0FBQyxHQUFHLE1BQU0sRUFBRSxNQUFNLEdBQUcsRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEdBQUcsRUFBRSxDQUFDO0FBQUE7QUFBQSxVQUM3QztBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUM7QUFFRCxZQUFNLFVBQVUsSUFBSSxNQUFNLGtCQUFrQixNQUFNO0FBR2xELGNBQVEsY0FBYyxFQUFFLE1BQU0sRUFBRSxNQUFNLE9BQU8sU0FBUyxFQUFFLEVBQUUsQ0FBQztBQUczRCxZQUFNLFVBQVUsUUFBUSxNQUFNLEVBQUUsTUFBTSxFQUFFLE1BQU0sT0FBTyxTQUFTLEVBQUUsRUFBRSxDQUFDO0FBQ25FLGNBQVEsYUFBYTtBQUNyQixhQUFPLGVBQWUsUUFBUSxLQUFLLFNBQVMsR0FBRyxJQUFJLHNDQUFzQztBQUN6RixZQUFNLFNBQVMsS0FBSyxNQUFNLFFBQVEsS0FBSyxTQUFTLEVBQUUsS0FBSyxDQUFDO0FBQ3hELGFBQU8sWUFBWSxPQUFPLE1BQU0sQ0FBQztBQUNqQyxhQUFPLGdCQUFnQixPQUFPLEdBQUcsQ0FBQyxNQUFNLENBQUM7QUFDekMsYUFBTyxZQUFZLE9BQU8sR0FBRyxPQUFPO0FBR3BDLFlBQU0sVUFBVSxRQUFRLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxPQUFPLFNBQVMsRUFBRSxFQUFFLENBQUM7QUFDbkUsYUFBTyxZQUFZLFFBQVEsS0FBSyxTQUFTLEdBQUcsSUFBSSw0Q0FBNEM7QUFBQSxJQUM3RixDQUFDO0FBRUQsU0FBSyxpQ0FBaUMsTUFBTTtBQUMzQyxZQUFNLFNBQVMsaUJBQWlCO0FBQ2hDLFlBQU0sVUFBVSxJQUFJLE1BQU0sa0JBQWtCLE1BQU07QUFFbEQsYUFBTyxPQUFPLE1BQU0sUUFBUSxLQUFLLFNBQVMsV0FBVyxFQUFFLENBQUMsR0FBRyxnQkFBZ0I7QUFBQSxJQUM1RSxDQUFDO0FBRUQsU0FBSyxrREFBa0QsTUFBTTtBQUM1RCxZQUFNLFNBQVMsaUJBQWlCO0FBQ2hDLFlBQU0sVUFBVSxJQUFJLE1BQU0sa0JBQWtCLE1BQU07QUFFbEQsWUFBTSxNQUFrQixFQUFFLE1BQU0sUUFBUSxPQUFPLEdBQUcsT0FBTyxDQUFDLEVBQUU7QUFDNUQsWUFBTSxTQUFTLFFBQVEsTUFBTSxHQUFHO0FBRWhDLGFBQU8sWUFBWSxPQUFPLElBQUksU0FBUztBQUN2QyxZQUFNLFFBQVEsS0FBSyxNQUFNLE9BQU8sS0FBSyxTQUFTLEVBQUUsS0FBSyxDQUFDO0FBQ3RELGFBQU8sWUFBWSxNQUFNLE1BQU0sQ0FBQztBQUFBLElBQ2pDLENBQUM7QUFFRCxTQUFLLHFFQUFxRSxNQUFNO0FBVy9FLFlBQU0sYUFBYSxNQUFNLE9BQStCO0FBQUEsUUFDdkQsSUFBSSxNQUFNLEVBQUUsT0FBSyxFQUFFLElBQUksTUFBTSxJQUFJLENBQUM7QUFBQSxRQUNsQyxPQUFPLE1BQU0sRUFBRSxPQUFLLEVBQUUsT0FBTyxNQUFNLE1BQU0sQ0FBQztBQUFBLFFBQzFDLFVBQVUsTUFBTSxFQUFFLE9BQUssRUFBRSxVQUFVLE1BQU0sTUFBTSxDQUFDO0FBQUEsTUFDakQsR0FBRztBQUFBLFFBQ0YsUUFBUSxDQUFDLFFBQVEsSUFBSTtBQUFBLE1BQ3RCLENBQUM7QUFFRCxZQUFNLFNBQVMsTUFBTSxPQUEyQztBQUFBLFFBQy9ELE9BQU8sTUFBTSxFQUFFLE9BQUssRUFBRSxPQUFPLE1BQU0sTUFBTSxVQUFVLENBQUM7QUFBQSxNQUNyRCxDQUFDO0FBRUQsWUFBTSxVQUFVLElBQUksTUFBTSxrQkFBa0IsTUFBTTtBQUdsRCxjQUFRLGNBQWMsRUFBRSxPQUFPLENBQUMsRUFBRSxJQUFJLEtBQUssT0FBTyxHQUFHLFVBQVUsS0FBSyxDQUFDLEVBQUUsQ0FBQztBQUd4RSxZQUFNLFVBQVUsUUFBUSxNQUFNLEVBQUUsT0FBTyxDQUFDLEVBQUUsSUFBSSxLQUFLLE9BQU8sS0FBSyxVQUFVLEtBQUssQ0FBQyxFQUFFLENBQUM7QUFDbEYsYUFBTyxZQUFZLFFBQVEsS0FBSyxTQUFTLEdBQUcsSUFBSSw0Q0FBNEM7QUFBQSxJQUM3RixDQUFDO0FBRUQsU0FBSywyQ0FBMkMsTUFBTTtBQVdyRCxZQUFNLGFBQWEsTUFBTSxPQUErQjtBQUFBLFFBQ3ZELElBQUksTUFBTSxFQUFFLE9BQUssRUFBRSxJQUFJLE1BQU0sSUFBSSxDQUFDO0FBQUEsUUFDbEMsT0FBTyxNQUFNLEVBQUUsT0FBSyxFQUFFLE9BQU8sTUFBTSxNQUFNLENBQUM7QUFBQSxRQUMxQyxVQUFVLE1BQU0sRUFBRSxPQUFLLEVBQUUsVUFBVSxNQUFNLE1BQU0sQ0FBQztBQUFBLE1BQ2pELEdBQUc7QUFBQSxRQUNGLFFBQVEsQ0FBQyxRQUFRLElBQUk7QUFBQSxNQUN0QixDQUFDO0FBRUQsWUFBTSxTQUFTLE1BQU0sT0FBMkM7QUFBQSxRQUMvRCxPQUFPLE1BQU0sRUFBRSxPQUFLLEVBQUUsT0FBTyxNQUFNLE1BQU0sVUFBVSxDQUFDO0FBQUEsTUFDckQsQ0FBQztBQUVELFlBQU0sVUFBVSxJQUFJLE1BQU0sa0JBQWtCLE1BQU07QUFHbEQsY0FBUSxjQUFjLEVBQUUsT0FBTyxDQUFDLEVBQUUsSUFBSSxLQUFLLE9BQU8sR0FBRyxVQUFVLEtBQUssQ0FBQyxFQUFFLENBQUM7QUFHeEUsWUFBTSxTQUFTLFFBQVEsTUFBTSxFQUFFLE9BQU8sQ0FBQyxFQUFFLElBQUksS0FBSyxPQUFPLEdBQUcsVUFBVSxLQUFLLENBQUMsRUFBRSxDQUFDO0FBQy9FLGFBQU8sZUFBZSxPQUFPLEtBQUssU0FBUyxHQUFHLElBQUksZ0RBQWdEO0FBRWxHLFlBQU0sUUFBUSxLQUFLLE1BQU0sT0FBTyxLQUFLLFNBQVMsRUFBRSxLQUFLLENBQUM7QUFDdEQsYUFBTyxZQUFZLE1BQU0sTUFBTSxDQUFDO0FBQUEsSUFDakMsQ0FBQztBQUVELFNBQUssdURBQXVELE1BQU07QUFXakUsWUFBTSxhQUFhLE1BQU0sT0FBK0I7QUFBQSxRQUN2RCxJQUFJLE1BQU0sRUFBRSxPQUFLLEVBQUUsSUFBSSxNQUFNLElBQUksQ0FBQztBQUFBLFFBQ2xDLE9BQU8sTUFBTSxFQUFFLE9BQUssRUFBRSxPQUFPLE1BQU0sTUFBTSxDQUFDO0FBQUEsUUFDMUMsVUFBVSxNQUFNLEVBQUUsT0FBSyxFQUFFLFVBQVUsTUFBTSxNQUFNLENBQUM7QUFBQSxNQUNqRCxHQUFHO0FBQUEsUUFDRixRQUFRLENBQUMsUUFBUSxJQUFJO0FBQUEsTUFDdEIsQ0FBQztBQUVELFlBQU0sU0FBUyxNQUFNLE9BQTJDO0FBQUEsUUFDL0QsT0FBTyxNQUFNLEVBQUUsT0FBSyxFQUFFLE9BQU8sTUFBTSxNQUFNLFVBQVUsQ0FBQztBQUFBLE1BQ3JELENBQUM7QUFFRCxZQUFNLFVBQVUsSUFBSSxNQUFNLGtCQUFrQixNQUFNO0FBR2xELGNBQVEsY0FBYyxFQUFFLE9BQU8sQ0FBQyxFQUFFLElBQUksS0FBSyxPQUFPLEdBQUcsVUFBVSxNQUFNLENBQUMsRUFBRSxDQUFDO0FBR3pFLFlBQU0sVUFBVSxRQUFRLE1BQU0sRUFBRSxPQUFPLENBQUMsRUFBRSxJQUFJLEtBQUssT0FBTyxLQUFLLFVBQVUsTUFBTSxDQUFDLEVBQUUsQ0FBQztBQUNuRixhQUFPLGVBQWUsUUFBUSxLQUFLLFNBQVMsR0FBRyxJQUFJLDRDQUE0QztBQUUvRixZQUFNLFFBQVEsS0FBSyxNQUFNLFFBQVEsS0FBSyxTQUFTLEVBQUUsS0FBSyxDQUFDO0FBQ3ZELGFBQU8sWUFBWSxNQUFNLE1BQU0sQ0FBQztBQUNoQyxhQUFPLGdCQUFnQixNQUFNLEdBQUcsQ0FBQyxTQUFTLEdBQUcsT0FBTyxDQUFDO0FBQ3JELGFBQU8sWUFBWSxNQUFNLEdBQUcsR0FBRztBQUFBLElBQ2hDLENBQUM7QUFFRCxTQUFLLG1FQUFtRSxNQUFNO0FBVzdFLFlBQU0sYUFBYSxNQUFNLE9BQStCO0FBQUEsUUFDdkQsSUFBSSxNQUFNLEVBQUUsT0FBSyxFQUFFLElBQUksTUFBTSxJQUFJLENBQUM7QUFBQSxRQUNsQyxPQUFPLE1BQU0sRUFBRSxPQUFLLEVBQUUsT0FBTyxNQUFNLE1BQU0sQ0FBQztBQUFBLFFBQzFDLFVBQVUsTUFBTSxFQUFFLE9BQUssRUFBRSxVQUFVLE1BQU0sTUFBTSxDQUFDO0FBQUEsTUFDakQsR0FBRztBQUFBLFFBQ0YsUUFBUSxDQUFDLFFBQVEsSUFBSTtBQUFBLE1BQ3RCLENBQUM7QUFFRCxZQUFNLFNBQVMsTUFBTSxPQUEyQztBQUFBLFFBQy9ELE9BQU8sTUFBTSxFQUFFLE9BQUssRUFBRSxPQUFPLE1BQU0sTUFBTSxVQUFVLENBQUM7QUFBQSxNQUNyRCxDQUFDO0FBRUQsWUFBTSxVQUFVLElBQUksTUFBTSxrQkFBa0IsTUFBTTtBQUdsRCxjQUFRLGNBQWMsRUFBRSxPQUFPLENBQUMsRUFBRSxJQUFJLEtBQUssT0FBTyxHQUFHLFVBQVUsTUFBTSxDQUFDLEVBQUUsQ0FBQztBQUd6RSxZQUFNLFNBQVMsUUFBUSxNQUFNLEVBQUUsT0FBTyxDQUFDLEVBQUUsSUFBSSxLQUFLLE9BQU8sS0FBSyxVQUFVLEtBQUssQ0FBQyxFQUFFLENBQUM7QUFDakYsYUFBTyxlQUFlLE9BQU8sS0FBSyxTQUFTLEdBQUcsSUFBSSxpREFBaUQ7QUFHbkcsWUFBTSxRQUFRLE9BQU8sS0FBSyxTQUFTLEVBQUUsS0FBSyxFQUFFLE1BQU0sSUFBSTtBQUN0RCxhQUFPLFlBQVksTUFBTSxRQUFRLEdBQUcsZ0NBQWdDO0FBQUEsSUFDckUsQ0FBQztBQUVELFNBQUssMkNBQTJDLE1BQU07QUFDckQsWUFBTSxTQUFTLGlCQUFpQjtBQUNoQyxZQUFNLFVBQVUsSUFBSSxNQUFNLGtCQUFrQixNQUFNO0FBRWxELFlBQU0sVUFBc0IsRUFBRSxNQUFNLFFBQVEsT0FBTyxHQUFHLE9BQU8sQ0FBQyxHQUFHLFVBQVUsRUFBRSxNQUFNLENBQUMsS0FBSyxFQUFFLEVBQUU7QUFFN0YsWUFBTSxTQUFTLHNCQUFzQixTQUFTLFNBQVM7QUFBQSxRQUN0RCxFQUFFLE1BQU0sUUFBUSxPQUFPLElBQUksT0FBTyxDQUFDLEdBQUcsVUFBVSxFQUFFLE1BQU0sQ0FBQyxLQUFLLEVBQUUsRUFBRTtBQUFBLFFBQ2xFLEVBQUUsTUFBTSxRQUFRLE9BQU8sUUFBVyxPQUFPLENBQUMsR0FBRyxVQUFVLE9BQVU7QUFBQSxNQUNsRSxDQUFDO0FBQ0QsYUFBTyxnQkFBZ0IsUUFBUSxFQUFFLE1BQU0sUUFBUSxPQUFPLFFBQVcsT0FBTyxDQUFDLEdBQUcsVUFBVSxPQUFVLENBQUM7QUFFakcsWUFBTSxVQUFVLHNCQUFzQixTQUFTLFNBQVM7QUFBQSxRQUN2RCxFQUFFLE1BQU0sUUFBUSxPQUFPLElBQUksT0FBTyxDQUFDLEdBQUcsVUFBVSxFQUFFLE1BQU0sQ0FBQyxLQUFLLEVBQUUsRUFBRTtBQUFBLFFBQ2xFLEVBQUUsTUFBTSxRQUFRLE9BQU8sUUFBVyxPQUFPLENBQUMsR0FBRyxVQUFVLE9BQVU7QUFBQSxRQUNqRSxFQUFFLE1BQU0sUUFBUSxPQUFPLElBQUksT0FBTyxDQUFDLEdBQUcsVUFBVSxFQUFFLE1BQU0sQ0FBQyxLQUFLLEVBQUUsRUFBRTtBQUFBLE1BQ25FLENBQUM7QUFDRCxhQUFPLGdCQUFnQixTQUFTLEVBQUUsTUFBTSxRQUFRLE9BQU8sSUFBSSxPQUFPLENBQUMsR0FBRyxVQUFVLEVBQUUsTUFBTSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUM7QUFBQSxJQUNwRyxDQUFDO0FBRUQsU0FBSyw0Q0FBNEMsTUFBTTtBQUN0RCxZQUFNLFNBQVMsaUJBQWlCO0FBQ2hDLFlBQU0sVUFBc0IsRUFBRSxNQUFNLFFBQVEsT0FBTyxHQUFHLE9BQU8sQ0FBQyxHQUFHLFVBQVUsRUFBRSxNQUFNLENBQUMsR0FBRyxFQUFFLEVBQUU7QUFHM0YsWUFBTSxVQUFVO0FBQUEsUUFDZixFQUFFLE1BQU0sR0FBRyxHQUFHLFFBQVE7QUFBQSxRQUN0QixFQUFFLE1BQU0sR0FBRyxHQUFHLENBQUMsVUFBVSxFQUFFO0FBQUE7QUFBQSxRQUMzQixFQUFFLE1BQU0sR0FBRyxHQUFHLENBQUMsVUFBVSxHQUFHLEdBQUcsRUFBRSxNQUFNLENBQUMsS0FBSyxHQUFHLEVBQUUsRUFBRTtBQUFBO0FBQUEsTUFDckQ7QUFDQSxZQUFNLGFBQWEsUUFBUSxJQUFJLE9BQUssS0FBSyxVQUFVLENBQUMsQ0FBQyxFQUFFLEtBQUssSUFBSSxJQUFJO0FBRXBFLFlBQU0sVUFBVSxJQUFJLE1BQU0sa0JBQWtCLE1BQU07QUFDbEQsWUFBTSxTQUFTLFFBQVEsS0FBSyxTQUFTLFdBQVcsVUFBVSxDQUFDO0FBRTNELGFBQU8sZ0JBQWdCLE9BQU8sVUFBVSxFQUFFLE1BQU0sQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDO0FBQUEsSUFDN0QsQ0FBQztBQUVELFNBQUssOERBQThELE1BQU07QUFDeEUsWUFBTSxTQUFTLGlCQUFpQjtBQUNoQyxZQUFNLFVBQVUsSUFBSSxNQUFNLGtCQUFrQixNQUFNO0FBRWxELFlBQU0sTUFBa0IsRUFBRSxNQUFNLFFBQVEsT0FBTyxHQUFHLE9BQU8sQ0FBQyxFQUFFO0FBRzVELFlBQU0sVUFBVSxRQUFRLE1BQU0sR0FBRztBQUNqQyxhQUFPLFlBQVksUUFBUSxJQUFJLFNBQVM7QUFJeEMsWUFBTSxVQUFVLFFBQVEsTUFBTSxFQUFFLEdBQUcsS0FBSyxPQUFPLEVBQUUsQ0FBQztBQUNsRCxhQUFPO0FBQUEsUUFDTixFQUFFLElBQUksUUFBUSxJQUFJLE9BQU8sS0FBSyxNQUFNLFFBQVEsS0FBSyxTQUFTLEVBQUUsS0FBSyxDQUFDLEVBQUU7QUFBQSxRQUNwRSxFQUFFLElBQUksV0FBVyxPQUFPLEVBQUUsTUFBTSxHQUFHLEdBQUcsRUFBRSxNQUFNLFFBQVEsT0FBTyxHQUFHLE9BQU8sQ0FBQyxFQUFFLEVBQUUsRUFBRTtBQUFBLE1BQy9FO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSywyREFBMkQsTUFBTTtBQUNyRSxZQUFNLFNBQVMsaUJBQWlCO0FBQ2hDLFlBQU0sVUFBVSxJQUFJLE1BQU0sa0JBQWtCLE1BQU07QUFFbEQsWUFBTSxNQUFrQixFQUFFLE1BQU0sUUFBUSxPQUFPLEdBQUcsT0FBTyxDQUFDLEVBQUU7QUFDNUQsY0FBUSxjQUFjLEdBQUc7QUFFekIsY0FBUSxNQUFNLEVBQUUsR0FBRyxLQUFLLE9BQU8sRUFBRSxDQUFDO0FBQ2xDLGNBQVEsYUFBYTtBQUdyQixZQUFNLFNBQVMsUUFBUSxNQUFNLEVBQUUsR0FBRyxLQUFLLE9BQU8sRUFBRSxDQUFDO0FBQ2pELGFBQU87QUFBQSxRQUNOLEVBQUUsSUFBSSxPQUFPLElBQUksT0FBTyxLQUFLLE1BQU0sT0FBTyxLQUFLLFNBQVMsRUFBRSxLQUFLLENBQUMsRUFBRTtBQUFBLFFBQ2xFLEVBQUUsSUFBSSxVQUFVLE9BQU8sRUFBRSxNQUFNLEdBQUcsR0FBRyxDQUFDLE9BQU8sR0FBRyxHQUFHLEVBQUUsRUFBRTtBQUFBLE1BQ3hEO0FBQUEsSUFDRCxDQUFDO0FBRUQsU0FBSyxpREFBaUQsTUFBTTtBQUMzRCxZQUFNLFNBQVMsaUJBQWlCO0FBQ2hDLFlBQU0sVUFBVSxJQUFJLE1BQU0sa0JBQWtCLE1BQU07QUFFbEQsWUFBTSxhQUFhLEtBQUssVUFBVSxFQUFFLE1BQU0sR0FBRyxHQUFHLENBQUMsT0FBTyxHQUFHLEdBQUcsRUFBRSxDQUFDLElBQUk7QUFDckUsYUFBTyxPQUFPLE1BQU0sUUFBUSxLQUFLLFNBQVMsV0FBVyxVQUFVLENBQUMsR0FBRywwQkFBMEI7QUFBQSxJQUM5RixDQUFDO0FBRUQsU0FBSyw0RUFBNEUsTUFBTTtBQUN0RixZQUFNLFNBQVMsaUJBQWlCO0FBQ2hDLFlBQU0sVUFBVSxJQUFJLE1BQU0sa0JBQWtCLE1BQU07QUFFbEQsWUFBTSxVQUFzQixFQUFFLE1BQU0sUUFBUSxPQUFPLEdBQUcsT0FBTyxDQUFDLEVBQUU7QUFHaEUsWUFBTSxLQUFLLFFBQVEsTUFBTSxPQUFPO0FBQ2hDLGFBQU8sWUFBWSxHQUFHLElBQUksU0FBUztBQUluQyxZQUFNLEtBQUssUUFBUSxNQUFNLEVBQUUsR0FBRyxTQUFTLE9BQU8sRUFBRSxDQUFDO0FBQ2pELGFBQU8sWUFBWSxHQUFHLElBQUksU0FBUztBQUNuQyxjQUFRLGFBQWE7QUFDckIsWUFBTSxjQUFjLEdBQUc7QUFHdkIsWUFBTSxTQUFTLElBQUksTUFBTSxrQkFBa0IsaUJBQWlCLENBQUM7QUFDN0QsWUFBTSxTQUFTLE9BQU8sS0FBSyxXQUFXO0FBQ3RDLGFBQU8sWUFBWSxPQUFPLE9BQU8sQ0FBQztBQUFBLElBQ25DLENBQUM7QUFFRCxTQUFLLHNFQUFzRSxNQUFNO0FBQ2hGLFlBQU0sU0FBUyxpQkFBaUI7QUFDaEMsWUFBTSxVQUFVLElBQUksTUFBTSxrQkFBa0IsTUFBTTtBQUVsRCxZQUFNLE1BQWtCLEVBQUUsTUFBTSxRQUFRLE9BQU8sR0FBRyxPQUFPLENBQUMsRUFBRTtBQUM1RCxVQUFJLGNBQWMsUUFBUSxjQUFjLEdBQUc7QUFHM0MsWUFBTSxLQUFLLFFBQVEsTUFBTSxFQUFFLEdBQUcsS0FBSyxPQUFPLEVBQUUsQ0FBQztBQUM3QyxhQUFPLFlBQVksR0FBRyxJQUFJLFFBQVE7QUFJbEMsWUFBTSxLQUFLLFFBQVEsTUFBTSxFQUFFLEdBQUcsS0FBSyxPQUFPLEVBQUUsQ0FBQztBQUM3QyxhQUFPLFlBQVksR0FBRyxJQUFJLFFBQVE7QUFDbEMsY0FBUSxhQUFhO0FBQ3JCLG9CQUFjLFNBQVMsT0FBTyxDQUFDLGFBQWEsR0FBRyxJQUFJLENBQUM7QUFFcEQsWUFBTSxTQUFTLElBQUksTUFBTSxrQkFBa0IsaUJBQWlCLENBQUM7QUFDN0QsWUFBTSxTQUFTLE9BQU8sS0FBSyxXQUFXO0FBQ3RDLGFBQU8sWUFBWSxPQUFPLE9BQU8sQ0FBQztBQUFBLElBQ25DLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLCtCQUErQixNQUFNO0FBQzFDLFNBQUssd0RBQXdELE1BQU07QUFDbEUsWUFBTSxNQUFNLElBQUksT0FBTyxJQUFJLE9BQU8sSUFBSTtBQUN0QyxZQUFNLE1BQU0sRUFBRSxTQUFTLEtBQUssT0FBTyxLQUFLO0FBQ3hDLFlBQU0sT0FBTyxLQUFLLFVBQVUsS0FBSyxNQUFNLHVCQUF1QixPQUFPLE1BQU0sS0FBSyxPQUFPLElBQUksQ0FBQztBQUM1RixZQUFNLFNBQVMsS0FBSyxNQUFNLElBQUk7QUFDOUIsYUFBTyxlQUFlLE9BQU8sU0FBUyxHQUFHO0FBQ3pDLGFBQU8sR0FBRyxPQUFPLFFBQVEsV0FBVyxXQUFXLENBQUM7QUFDaEQsYUFBTyxZQUFZLE9BQU8sT0FBTyxJQUFJO0FBQUEsSUFDdEMsQ0FBQztBQUVELFNBQUsscUVBQXFFLE1BQU07QUFDL0UsWUFBTSxhQUFhLE9BQU87QUFDMUIsWUFBTSxZQUFZLE9BQU87QUFDekIsWUFBTSxTQUFTLElBQUksT0FBTyxNQUFNLElBQUk7QUFDcEMsWUFBTSxNQUFXLENBQUM7QUFDbEIsZUFBUyxJQUFJLEdBQUcsSUFBSSxJQUFJLEtBQUs7QUFDNUIsWUFBSSxJQUFJLENBQUMsRUFBRSxJQUFJO0FBQUEsTUFDaEI7QUFDQSxZQUFNLE9BQU8sS0FBSyxVQUFVLEtBQUssTUFBTSx1QkFBdUIsWUFBWSxTQUFTLENBQUM7QUFDcEYsWUFBTSxTQUFTLEtBQUssTUFBTSxJQUFJO0FBRTlCLFlBQU0saUJBQWlCLE9BQU8sT0FBTyxNQUFNLEVBQ3pDLE9BQU8sQ0FBQyxNQUFtQixPQUFPLE1BQU0sWUFBWSxNQUFNLE1BQU0sRUFDaEUsT0FBTyxDQUFDLEtBQUssTUFBTSxNQUFNLEVBQUUsUUFBUSxDQUFDO0FBQ3RDLGFBQU8sR0FBRyxrQkFBa0IsV0FBVyxhQUFhLGNBQWMsMEJBQTBCLFNBQVMsRUFBRTtBQUV2RyxhQUFPLFlBQVksT0FBTyxJQUFJLE1BQU07QUFDcEMsYUFBTyxHQUFHLE9BQU8sT0FBTyxNQUFNLEVBQUUsS0FBSyxPQUFLLE9BQU8sTUFBTSxZQUFhLEVBQWEsU0FBUyw0QkFBNEIsQ0FBQyxDQUFDO0FBQUEsSUFDekgsQ0FBQztBQUVELFNBQUsseUVBQXlFLE1BQU07QUFDbkYsWUFBTSxRQUFRLEVBQUUsTUFBTSxHQUFHLEdBQUcsRUFBRSxLQUFLLE9BQU8sR0FBRyxHQUFHLEVBQUU7QUFDbEQsWUFBTSxNQUFNLE1BQU0sMkJBQTJCLEtBQUs7QUFDbEQsYUFBTyxZQUFZLEtBQUssS0FBSyxVQUFVLEtBQUssQ0FBQztBQUFBLElBQzlDLENBQUM7QUFFRCxTQUFLLHNEQUFzRCxNQUFNO0FBQ2hFLFlBQU0sV0FBZ0IsQ0FBQztBQUN2QixlQUFTLE9BQU87QUFDaEIsYUFBTyxPQUFPLE1BQU0sTUFBTSwyQkFBMkIsUUFBUSxHQUFHLFNBQVM7QUFBQSxJQUMxRSxDQUFDO0FBRUQsU0FBSyw2RUFBNkUsTUFBTTtBQUd2RixVQUFJLFFBQVE7QUFDWixZQUFNLFFBQVE7QUFBQSxRQUNiLFNBQVM7QUFDUjtBQUNBLGNBQUksVUFBVSxHQUFHO0FBQ2hCLGtCQUFNLElBQUksV0FBVyx1QkFBdUI7QUFBQSxVQUM3QztBQUNBLGlCQUFPLEVBQUUsU0FBUyxZQUFZO0FBQUEsUUFDL0I7QUFBQSxNQUNEO0FBQ0EsWUFBTSxNQUFNLE1BQU0sMkJBQTJCLEtBQUs7QUFDbEQsYUFBTyxZQUFZLE9BQU8sR0FBRyxpREFBaUQ7QUFDOUUsYUFBTyxnQkFBZ0IsS0FBSyxNQUFNLEdBQUcsR0FBRyxFQUFFLFNBQVMsWUFBWSxDQUFDO0FBQUEsSUFDakUsQ0FBQztBQUVELFNBQUssOEVBQThFLE1BQU07QUFHeEYsWUFBTSxNQUFNLElBQUksT0FBTyxJQUFJLE9BQU8sSUFBSTtBQUN0QyxVQUFJLFFBQVE7QUFDWixZQUFNLFFBQVE7QUFBQSxRQUNiLFNBQVM7QUFDUjtBQUNBLGNBQUksVUFBVSxHQUFHO0FBQ2hCLGtCQUFNLElBQUksV0FBVyx1QkFBdUI7QUFBQSxVQUM3QztBQUNBLGlCQUFPLEVBQUUsU0FBUyxLQUFLLE9BQU8sS0FBSztBQUFBLFFBQ3BDO0FBQUEsTUFDRDtBQUNBLFlBQU0sTUFBTSxNQUFNLDJCQUEyQixLQUFLO0FBQ2xELFlBQU0sU0FBUyxLQUFLLE1BQU0sR0FBRztBQUM3QixhQUFPLGVBQWUsT0FBTyxTQUFTLEdBQUc7QUFDekMsYUFBTyxHQUFHLE9BQU8sUUFBUSxXQUFXLFdBQVcsR0FBRyxlQUFlLE9BQU8sUUFBUSxNQUFNLEdBQUcsRUFBRSxDQUFDLEVBQUU7QUFDOUYsYUFBTyxZQUFZLE9BQU8sT0FBTyxJQUFJO0FBQUEsSUFDdEMsQ0FBQztBQUVELFNBQUssdUVBQXVFLE1BQU07QUFDakYsWUFBTSxXQUFXLEVBQUUsR0FBRyxHQUFHLFFBQVEsRUFBRSxHQUFHLE9BQU8sTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDLEVBQUUsRUFBRTtBQUMvRCxZQUFNLFFBQVEsTUFBTSxzQkFBc0IsUUFBUTtBQUNsRCxhQUFPLGdCQUFnQixPQUFPLFFBQVE7QUFDdEMsYUFBTyxlQUFlLE9BQU8sUUFBUTtBQUNyQyxhQUFPLGVBQWUsTUFBTSxRQUFRLFNBQVMsTUFBTTtBQUFBLElBQ3BELENBQUM7QUFFRCxTQUFLLG1FQUFtRSxNQUFNO0FBSzdFLFlBQU0sTUFBTSxJQUFJLE9BQU8sSUFBSSxPQUFPLElBQUk7QUFDdEMsVUFBSSxRQUFRO0FBQ1osWUFBTSxRQUFvRjtBQUFBLFFBQ3pGLE1BQU07QUFBQSxRQUNOLE9BQU87QUFBQSxRQUNQLFNBQVM7QUFDUjtBQUNBLGNBQUksVUFBVSxHQUFHO0FBQ2hCLGtCQUFNLElBQUksV0FBVyx1QkFBdUI7QUFBQSxVQUM3QztBQUNBLGlCQUFPLEVBQUUsTUFBTSxLQUFLLE9BQU8sS0FBSztBQUFBLFFBQ2pDO0FBQUEsTUFDRDtBQUNBLFlBQU0sUUFBUSxNQUFNLHNCQUFzQixLQUFLO0FBQy9DLGFBQU8sWUFBWSxPQUFPLEdBQUcsaURBQWlEO0FBQzlFLGFBQU8sWUFBWSxNQUFNLE9BQU8sSUFBSTtBQUNwQyxhQUFPLGVBQWUsTUFBTSxNQUFNLEdBQUc7QUFDckMsYUFBTyxHQUFHLE1BQU0sS0FBSyxXQUFXLFdBQVcsR0FBRyxlQUFlLE1BQU0sS0FBSyxNQUFNLEdBQUcsRUFBRSxDQUFDLEVBQUU7QUFBQSxJQUN2RixDQUFDO0FBRUQsU0FBSyxrRUFBa0UsTUFBTTtBQUc1RSxZQUFNLE1BQU0sSUFBSSxPQUFPLElBQUksT0FBTyxJQUFJO0FBQ3RDLFVBQUksUUFBUTtBQUNaLFlBQU0sT0FBTztBQUFBLFFBQ1osTUFBTTtBQUFBLFFBQ04sU0FBUztBQUNSO0FBQ0EsY0FBSSxVQUFVLEdBQUc7QUFDaEIsa0JBQU0sSUFBSSxXQUFXLHVCQUF1QjtBQUFBLFVBQzdDO0FBQ0EsaUJBQU8sRUFBRSxNQUFNLEtBQUssTUFBTSxPQUFPO0FBQUEsUUFDbEM7QUFBQSxNQUNEO0FBQ0EsWUFBTSxZQUFZLE1BQU0sTUFBbUQsQ0FBQyxHQUFHLE1BQU0sRUFBRSxTQUFTLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxJQUFJO0FBQzNILFlBQU0sWUFBWSxVQUFVLFFBQVEsSUFBSTtBQUN4QyxhQUFPLFlBQVksT0FBTyxDQUFDO0FBQzNCLGFBQU8sWUFBWSxVQUFVLE1BQU0sTUFBTTtBQUN6QyxhQUFPLEdBQUcsVUFBVSxLQUFLLFdBQVcsV0FBVyxDQUFDO0FBQUEsSUFDakQsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
