import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { StopWatch } from "../../../../../../base/common/stopwatch.js";
import { isUndefinedOrNull } from "../../../../../../base/common/types.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import * as Adapt from "../../../common/model/objectMutationLog.js";
const enablePerf = process.env.VSCODE_PERF_CHAT_OBJECT_MUTATION_LOG === "true";
function perfSuite(name, callback) {
  if (enablePerf) {
    suite(name, callback);
  }
}
var EntryKind = /* @__PURE__ */ ((EntryKind2) => {
  EntryKind2[EntryKind2["Initial"] = 0] = "Initial";
  EntryKind2[EntryKind2["Set"] = 1] = "Set";
  EntryKind2[EntryKind2["Push"] = 2] = "Push";
  EntryKind2[EntryKind2["Delete"] = 3] = "Delete";
  return EntryKind2;
})(EntryKind || {});
function isTransformValue(transform) {
  return "equals" in transform;
}
function isTransformArray(transform) {
  return "itemSchema" in transform;
}
function isTransformObject(transform) {
  return "children" in transform;
}
function isKeyTransform(transform) {
  return isTransformValue(transform) && transform.kind === 0;
}
function isVoidFunction(value) {
  return typeof value === "function";
}
const benchmarkConfig = {
  iterations: 120,
  sealedItems: 1500,
  activeItems: 4,
  payloadSize: 128,
  rounds: 5
};
class ReferenceReusingObjectMutationLog {
  constructor(_transform, _compactAfterEntries = 512) {
    this._transform = _transform;
    this._compactAfterEntries = _compactAfterEntries;
    this._entryCount = 0;
    this.reusedReferences = 0;
  }
  createInitial(current) {
    const value = this._transform.extract(current);
    this._previous = value;
    this._entryCount = 1;
    const entry = { kind: 0 /* Initial */, v: value };
    return VSBuffer.fromString(JSON.stringify(entry) + "\n");
  }
  write(current) {
    const currentValue = this._transform.extract(current);
    if (!this._previous || this._entryCount > this._compactAfterEntries) {
      this._previous = currentValue;
      this._entryCount = 1;
      const entry = { kind: 0 /* Initial */, v: currentValue };
      return { op: "replace", data: VSBuffer.fromString(JSON.stringify(entry) + "\n") };
    }
    const entries = [];
    this._diff(this._transform, [], this._previous, currentValue, entries);
    if (entries.length === 0) {
      return { op: "append", data: VSBuffer.fromString("") };
    }
    this._entryCount += entries.length;
    this._previous = currentValue;
    let data = "";
    for (const entry of entries) {
      data += JSON.stringify(entry) + "\n";
    }
    return { op: "append", data: VSBuffer.fromString(data) };
  }
  confirmWrite() {
  }
  _diff(transform, path, prev, curr, entries) {
    if (isTransformValue(transform)) {
      if (!transform.equals(prev, curr)) {
        entries.push({ kind: 1 /* Set */, k: path.slice(), v: curr });
      }
    } else if (isUndefinedOrNull(prev) || isUndefinedOrNull(curr)) {
      if (prev !== curr) {
        if (curr === void 0) {
          entries.push({ kind: 3 /* Delete */, k: path.slice() });
        } else if (curr === null) {
          entries.push({ kind: 1 /* Set */, k: path.slice(), v: null });
        } else {
          entries.push({ kind: 1 /* Set */, k: path.slice(), v: curr });
        }
      }
    } else if (isTransformArray(transform)) {
      this._diffArray(transform, path, prev, curr, entries);
    } else if (isTransformObject(transform)) {
      this._diffObject(transform.children, path, prev, curr, entries, transform.sealed);
    } else {
      throw new Error(`Unknown transform kind ${JSON.stringify(transform)}`);
    }
  }
  _diffObject(children, path, prev, curr, entries, sealed) {
    const prevObj = prev;
    const currObj = curr;
    let i = 0;
    for (; i < children.length; i++) {
      const [key, transform] = children[i];
      if (!isKeyTransform(transform)) {
        break;
      }
      if (!transform.equals(prevObj?.[key], currObj[key])) {
        entries.push({ kind: 1 /* Set */, k: path.slice(), v: curr });
        return false;
      }
    }
    if (sealed && sealed(prev, true) && sealed(curr, false)) {
      return true;
    }
    for (; i < children.length; i++) {
      const [key, transform] = children[i];
      path.push(key);
      this._diff(transform, path, prevObj?.[key], currObj[key], entries);
      path.pop();
    }
    return false;
  }
  _diffArray(transform, path, prev, curr, entries) {
    const prevArr = prev || [];
    const currArr = curr || [];
    const itemSchema = transform.itemSchema;
    const minLen = Math.min(prevArr.length, currArr.length);
    if (isTransformObject(itemSchema)) {
      const childEntries = itemSchema.children;
      for (let i = 0; i < minLen; i++) {
        const prevItem = prevArr[i];
        const currItem = currArr[i];
        if (this._hasKeyMismatch(childEntries, prevItem, currItem)) {
          const newItems = currArr.slice(i);
          entries.push({ kind: 2 /* Push */, k: path.slice(), v: newItems.length > 0 ? newItems : void 0, i });
          return;
        }
        path.push(i);
        const wasSealed = this._diffObject(childEntries, path, prevItem, currItem, entries, itemSchema.sealed);
        path.pop();
        if (wasSealed) {
          currArr[i] = prevItem;
          this.reusedReferences++;
        }
      }
      if (currArr.length > prevArr.length) {
        entries.push({ kind: 2 /* Push */, k: path.slice(), v: currArr.slice(prevArr.length) });
      } else if (currArr.length < prevArr.length) {
        entries.push({ kind: 2 /* Push */, k: path.slice(), i: currArr.length });
      }
    } else {
      let firstMismatch = -1;
      for (let i = 0; i < minLen; i++) {
        if (!itemSchema.equals(prevArr[i], currArr[i])) {
          firstMismatch = i;
          break;
        }
      }
      if (firstMismatch === -1) {
        if (currArr.length > prevArr.length) {
          entries.push({ kind: 2 /* Push */, k: path.slice(), v: currArr.slice(prevArr.length) });
        } else if (currArr.length < prevArr.length) {
          entries.push({ kind: 2 /* Push */, k: path.slice(), i: currArr.length });
        }
      } else {
        const newItems = currArr.slice(firstMismatch);
        entries.push({ kind: 2 /* Push */, k: path.slice(), v: newItems.length > 0 ? newItems : void 0, i: firstMismatch });
      }
    }
  }
  _hasKeyMismatch(children, prev, curr) {
    const prevObj = prev;
    const currObj = curr;
    for (const [key, transform] of children) {
      if (!isKeyTransform(transform)) {
        break;
      }
      if (!transform.equals(prevObj?.[key], currObj[key])) {
        return true;
      }
    }
    return false;
  }
}
function createBenchmarkSchema() {
  const itemSchema = Adapt.object({
    id: Adapt.t((item) => item.id, Adapt.key()),
    content: Adapt.t((item) => item.content, Adapt.value()),
    references: Adapt.t((item) => item.references, Adapt.array(Adapt.value())),
    isSealed: Adapt.t((item) => item.isSealed, Adapt.value())
  }, {
    sealed: (item) => item.isSealed
  });
  return Adapt.object({
    items: Adapt.t((state) => state.items, Adapt.array(itemSchema))
  });
}
function createPayload(label, size) {
  return `${label}:${"x".repeat(size)}`;
}
function createBenchmarkState(iteration) {
  const items = [];
  for (let i = 0; i < benchmarkConfig.sealedItems; i++) {
    items.push({
      id: `sealed-${i}`,
      content: createPayload(`sealed-${i}`, benchmarkConfig.payloadSize),
      references: [
        createPayload(`ref-${i}-a`, benchmarkConfig.payloadSize / 2),
        createPayload(`ref-${i}-b`, benchmarkConfig.payloadSize / 2)
      ],
      isSealed: true
    });
  }
  for (let i = 0; i < benchmarkConfig.activeItems; i++) {
    const revision = i === benchmarkConfig.activeItems - 1 ? iteration : 0;
    items.push({
      id: `active-${i}`,
      content: createPayload(`active-${i}-${revision}`, benchmarkConfig.payloadSize),
      references: [
        createPayload(`active-ref-${i}-${revision}`, benchmarkConfig.payloadSize / 2),
        createPayload(`active-ref-${i}-stable`, benchmarkConfig.payloadSize / 2)
      ],
      isSealed: false
    });
  }
  return { items };
}
function createBenchmarkStates() {
  const states = [];
  for (let i = 0; i < benchmarkConfig.iterations; i++) {
    states.push(createBenchmarkState(i));
  }
  return states;
}
function appendToLog(current, result) {
  if (result.op === "replace") {
    return result.data;
  }
  return VSBuffer.concat([current, result.data]);
}
function collectGarbage() {
  const gc = Reflect.get(globalThis, "gc");
  if (isVoidFunction(gc)) {
    gc();
  }
}
function runBenchmarkRound(writer, states, schema) {
  collectGarbage();
  const initialHeap = process.memoryUsage().heapUsed;
  let serialized = writer.createInitial(states[0]);
  const sw = StopWatch.create();
  for (let i = 1; i < states.length; i++) {
    serialized = appendToLog(serialized, writer.write(states[i]));
    writer.confirmWrite();
  }
  const elapsedMs = sw.elapsed();
  collectGarbage();
  const finalHeap = process.memoryUsage().heapUsed;
  const reader = new Adapt.ObjectMutationLog(schema);
  assert.deepStrictEqual(reader.read(serialized), states[states.length - 1]);
  return {
    elapsedMs,
    heapDeltaBytes: finalHeap - initialHeap,
    serialized,
    reusedReferences: writer.reusedReferences ?? 0
  };
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}
function formatBytes(bytes) {
  const sign = bytes < 0 ? "-" : "";
  const absolute = Math.abs(bytes);
  if (absolute < 1024) {
    return `${bytes} B`;
  }
  if (absolute < 1024 * 1024) {
    return `${sign}${(absolute / 1024).toFixed(1)} KB`;
  }
  return `${sign}${(absolute / (1024 * 1024)).toFixed(2)} MB`;
}
perfSuite("Chat ObjectMutationLog - perf", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  const schema = createBenchmarkSchema();
  const states = createBenchmarkStates();
  test("compares baseline writes against sealed-reference reuse", function() {
    this.timeout(12e4);
    runBenchmarkRound(new Adapt.ObjectMutationLog(schema), states, schema);
    runBenchmarkRound(new ReferenceReusingObjectMutationLog(schema), states, schema);
    const baselineResults = [];
    const optimizedResults = [];
    for (let i = 0; i < benchmarkConfig.rounds; i++) {
      baselineResults.push(runBenchmarkRound(new Adapt.ObjectMutationLog(schema), states, schema));
      optimizedResults.push(runBenchmarkRound(new ReferenceReusingObjectMutationLog(schema), states, schema));
    }
    assert.strictEqual(baselineResults[0].serialized.toString(), optimizedResults[0].serialized.toString());
    const baselineElapsed = median(baselineResults.map((result) => result.elapsedMs));
    const optimizedElapsed = median(optimizedResults.map((result) => result.elapsedMs));
    const baselineHeap = median(baselineResults.map((result) => result.heapDeltaBytes));
    const optimizedHeap = median(optimizedResults.map((result) => result.heapDeltaBytes));
    const optimizedReusedReferences = median(optimizedResults.map((result) => result.reusedReferences));
    console.log("[chat objectMutationLog perf] config", benchmarkConfig);
    console.log("[chat objectMutationLog perf] baseline", {
      medianElapsedMs: baselineElapsed,
      medianHeapDelta: formatBytes(baselineHeap),
      serializedBytes: baselineResults[0].serialized.byteLength
    });
    console.log("[chat objectMutationLog perf] optimized", {
      medianElapsedMs: optimizedElapsed,
      medianHeapDelta: formatBytes(optimizedHeap),
      serializedBytes: optimizedResults[0].serialized.byteLength,
      reusedReferences: optimizedReusedReferences
    });
    console.log("[chat objectMutationLog perf] delta", {
      elapsedMs: optimizedElapsed - baselineElapsed,
      heapDelta: formatBytes(optimizedHeap - baselineHeap),
      elapsedRatio: Number((optimizedElapsed / baselineElapsed).toFixed(3))
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vbW9kZWwvb2JqZWN0TXV0YXRpb25Mb2cucGVyZi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IGlzVW5kZWZpbmVkT3JOdWxsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgKiBhcyBBZGFwdCBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvb2JqZWN0TXV0YXRpb25Mb2cuanMnO1xuXG5jb25zdCBlbmFibGVQZXJmID0gcHJvY2Vzcy5lbnYuVlNDT0RFX1BFUkZfQ0hBVF9PQkpFQ1RfTVVUQVRJT05fTE9HID09PSAndHJ1ZSc7XG5cbmZ1bmN0aW9uIHBlcmZTdWl0ZShuYW1lOiBzdHJpbmcsIGNhbGxiYWNrOiAodGhpczogTW9jaGEuU3VpdGUpID0+IHZvaWQpOiB2b2lkIHtcblx0aWYgKGVuYWJsZVBlcmYpIHtcblx0XHRzdWl0ZShuYW1lLCBjYWxsYmFjayk7XG5cdH1cbn1cblxuY29uc3QgZW51bSBFbnRyeUtpbmQge1xuXHRJbml0aWFsID0gMCxcblx0U2V0ID0gMSxcblx0UHVzaCA9IDIsXG5cdERlbGV0ZSA9IDMsXG59XG5cbnR5cGUgT2JqZWN0UGF0aCA9IChzdHJpbmcgfCBudW1iZXIpW107XG5cbnR5cGUgRW50cnkgPVxuXHR8IHsga2luZDogRW50cnlLaW5kLkluaXRpYWw7IHY6IHVua25vd24gfVxuXHR8IHsga2luZDogRW50cnlLaW5kLlNldDsgazogT2JqZWN0UGF0aDsgdjogdW5rbm93biB9XG5cdHwgeyBraW5kOiBFbnRyeUtpbmQuRGVsZXRlOyBrOiBPYmplY3RQYXRoIH1cblx0fCB7IGtpbmQ6IEVudHJ5S2luZC5QdXNoOyBrOiBPYmplY3RQYXRoOyB2PzogdW5rbm93bltdOyBpPzogbnVtYmVyIH07XG5cbmludGVyZmFjZSBCZW5jaG1hcmtJdGVtIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgY29udGVudDogc3RyaW5nO1xuXHRyZWFkb25seSByZWZlcmVuY2VzOiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgaXNTZWFsZWQ6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBCZW5jaG1hcmtTdGF0ZSB7XG5cdHJlYWRvbmx5IGl0ZW1zOiByZWFkb25seSBCZW5jaG1hcmtJdGVtW107XG59XG5cbmludGVyZmFjZSBCZW5jaG1hcmtSZXN1bHQge1xuXHRyZWFkb25seSBlbGFwc2VkTXM6IG51bWJlcjtcblx0cmVhZG9ubHkgaGVhcERlbHRhQnl0ZXM6IG51bWJlcjtcblx0cmVhZG9ubHkgc2VyaWFsaXplZDogVlNCdWZmZXI7XG5cdHJlYWRvbmx5IHJldXNlZFJlZmVyZW5jZXM6IG51bWJlcjtcbn1cblxuaW50ZXJmYWNlIEJlbmNobWFya1dyaXRlcjxUPiB7XG5cdGNyZWF0ZUluaXRpYWwoY3VycmVudDogVCk6IFZTQnVmZmVyO1xuXHR3cml0ZShjdXJyZW50OiBUKTogeyBvcDogJ2FwcGVuZCcgfCAncmVwbGFjZSc7IGRhdGE6IFZTQnVmZmVyIH07XG5cdGNvbmZpcm1Xcml0ZSgpOiB2b2lkO1xuXHRyZWFkb25seSByZXVzZWRSZWZlcmVuY2VzPzogbnVtYmVyO1xufVxuXG5mdW5jdGlvbiBpc1RyYW5zZm9ybVZhbHVlPFRGcm9tLCBUVG8+KHRyYW5zZm9ybTogQWRhcHQuVHJhbnNmb3JtPFRGcm9tLCBUVG8+KTogdHJhbnNmb3JtIGlzIEFkYXB0LlRyYW5zZm9ybVZhbHVlPFRGcm9tLCBUVG8+IHtcblx0cmV0dXJuICdlcXVhbHMnIGluIHRyYW5zZm9ybTtcbn1cblxuZnVuY3Rpb24gaXNUcmFuc2Zvcm1BcnJheTxURnJvbSwgVFRvPih0cmFuc2Zvcm06IEFkYXB0LlRyYW5zZm9ybTxURnJvbSwgVFRvPik6IHRyYW5zZm9ybSBpcyBBZGFwdC5UcmFuc2Zvcm1BcnJheTxURnJvbSwgVFRvPiB7XG5cdHJldHVybiAnaXRlbVNjaGVtYScgaW4gdHJhbnNmb3JtO1xufVxuXG5mdW5jdGlvbiBpc1RyYW5zZm9ybU9iamVjdDxURnJvbSwgVFRvPih0cmFuc2Zvcm06IEFkYXB0LlRyYW5zZm9ybTxURnJvbSwgVFRvPik6IHRyYW5zZm9ybSBpcyBBZGFwdC5UcmFuc2Zvcm1PYmplY3Q8VEZyb20sIFRUbz4ge1xuXHRyZXR1cm4gJ2NoaWxkcmVuJyBpbiB0cmFuc2Zvcm07XG59XG5cbmZ1bmN0aW9uIGlzS2V5VHJhbnNmb3JtKHRyYW5zZm9ybTogQWRhcHQuVHJhbnNmb3JtPHVua25vd24sIHVua25vd24+KTogdHJhbnNmb3JtIGlzIEFkYXB0LlRyYW5zZm9ybVZhbHVlPHVua25vd24sIHVua25vd24+IHtcblx0cmV0dXJuIGlzVHJhbnNmb3JtVmFsdWUodHJhbnNmb3JtKSAmJiB0cmFuc2Zvcm0ua2luZCA9PT0gMDtcbn1cblxuZnVuY3Rpb24gaXNWb2lkRnVuY3Rpb24odmFsdWU6IHVua25vd24pOiB2YWx1ZSBpcyAoKSA9PiB2b2lkIHtcblx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuY29uc3QgYmVuY2htYXJrQ29uZmlnID0ge1xuXHRpdGVyYXRpb25zOiAxMjAsXG5cdHNlYWxlZEl0ZW1zOiAxNTAwLFxuXHRhY3RpdmVJdGVtczogNCxcblx0cGF5bG9hZFNpemU6IDEyOCxcblx0cm91bmRzOiA1LFxufSBhcyBjb25zdDtcblxuY2xhc3MgUmVmZXJlbmNlUmV1c2luZ09iamVjdE11dGF0aW9uTG9nPFRGcm9tLCBUVG8+IGltcGxlbWVudHMgQmVuY2htYXJrV3JpdGVyPFRGcm9tPiB7XG5cdHByaXZhdGUgX3ByZXZpb3VzOiBUVG8gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2VudHJ5Q291bnQgPSAwO1xuXHRwdWJsaWMgcmV1c2VkUmVmZXJlbmNlcyA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdHJhbnNmb3JtOiBBZGFwdC5UcmFuc2Zvcm08VEZyb20sIFRUbz4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29tcGFjdEFmdGVyRW50cmllcyA9IDUxMixcblx0KSB7IH1cblxuXHRjcmVhdGVJbml0aWFsKGN1cnJlbnQ6IFRGcm9tKTogVlNCdWZmZXIge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fdHJhbnNmb3JtLmV4dHJhY3QoY3VycmVudCk7XG5cdFx0dGhpcy5fcHJldmlvdXMgPSB2YWx1ZTtcblx0XHR0aGlzLl9lbnRyeUNvdW50ID0gMTtcblx0XHRjb25zdCBlbnRyeTogRW50cnkgPSB7IGtpbmQ6IEVudHJ5S2luZC5Jbml0aWFsLCB2OiB2YWx1ZSB9O1xuXHRcdHJldHVybiBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KGVudHJ5KSArICdcXG4nKTtcblx0fVxuXG5cdHdyaXRlKGN1cnJlbnQ6IFRGcm9tKTogeyBvcDogJ2FwcGVuZCcgfCAncmVwbGFjZSc7IGRhdGE6IFZTQnVmZmVyIH0ge1xuXHRcdGNvbnN0IGN1cnJlbnRWYWx1ZSA9IHRoaXMuX3RyYW5zZm9ybS5leHRyYWN0KGN1cnJlbnQpO1xuXG5cdFx0aWYgKCF0aGlzLl9wcmV2aW91cyB8fCB0aGlzLl9lbnRyeUNvdW50ID4gdGhpcy5fY29tcGFjdEFmdGVyRW50cmllcykge1xuXHRcdFx0dGhpcy5fcHJldmlvdXMgPSBjdXJyZW50VmFsdWU7XG5cdFx0XHR0aGlzLl9lbnRyeUNvdW50ID0gMTtcblx0XHRcdGNvbnN0IGVudHJ5OiBFbnRyeSA9IHsga2luZDogRW50cnlLaW5kLkluaXRpYWwsIHY6IGN1cnJlbnRWYWx1ZSB9O1xuXHRcdFx0cmV0dXJuIHsgb3A6ICdyZXBsYWNlJywgZGF0YTogVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShlbnRyeSkgKyAnXFxuJykgfTtcblx0XHR9XG5cblx0XHRjb25zdCBlbnRyaWVzOiBFbnRyeVtdID0gW107XG5cdFx0dGhpcy5fZGlmZih0aGlzLl90cmFuc2Zvcm0sIFtdLCB0aGlzLl9wcmV2aW91cywgY3VycmVudFZhbHVlLCBlbnRyaWVzKTtcblxuXHRcdGlmIChlbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHsgb3A6ICdhcHBlbmQnLCBkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCcnKSB9O1xuXHRcdH1cblxuXHRcdHRoaXMuX2VudHJ5Q291bnQgKz0gZW50cmllcy5sZW5ndGg7XG5cdFx0dGhpcy5fcHJldmlvdXMgPSBjdXJyZW50VmFsdWU7XG5cblx0XHRsZXQgZGF0YSA9ICcnO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0ZGF0YSArPSBKU09OLnN0cmluZ2lmeShlbnRyeSkgKyAnXFxuJztcblx0XHR9XG5cblx0XHRyZXR1cm4geyBvcDogJ2FwcGVuZCcsIGRhdGE6IFZTQnVmZmVyLmZyb21TdHJpbmcoZGF0YSkgfTtcblx0fVxuXG5cdGNvbmZpcm1Xcml0ZSgpOiB2b2lkIHtcblx0XHQvLyBQZXJmIGJlbmNobWFyayBhbHdheXMgc3VjY2VlZHMsIHN0YXRlIGlzIGVhZ2VybHkgdXBkYXRlZCBpbiB3cml0ZSgpXG5cdH1cblxuXHRwcml2YXRlIF9kaWZmPFQsIFI+KFxuXHRcdHRyYW5zZm9ybTogQWRhcHQuVHJhbnNmb3JtPFQsIFI+LFxuXHRcdHBhdGg6IE9iamVjdFBhdGgsXG5cdFx0cHJldjogUixcblx0XHRjdXJyOiBSLFxuXHRcdGVudHJpZXM6IEVudHJ5W11cblx0KTogdm9pZCB7XG5cdFx0aWYgKGlzVHJhbnNmb3JtVmFsdWUodHJhbnNmb3JtKSkge1xuXHRcdFx0aWYgKCF0cmFuc2Zvcm0uZXF1YWxzKHByZXYsIGN1cnIpKSB7XG5cdFx0XHRcdGVudHJpZXMucHVzaCh7IGtpbmQ6IEVudHJ5S2luZC5TZXQsIGs6IHBhdGguc2xpY2UoKSwgdjogY3VyciB9KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzVW5kZWZpbmVkT3JOdWxsKHByZXYpIHx8IGlzVW5kZWZpbmVkT3JOdWxsKGN1cnIpKSB7XG5cdFx0XHRpZiAocHJldiAhPT0gY3Vycikge1xuXHRcdFx0XHRpZiAoY3VyciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKHsga2luZDogRW50cnlLaW5kLkRlbGV0ZSwgazogcGF0aC5zbGljZSgpIH0pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGN1cnIgPT09IG51bGwpIHtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goeyBraW5kOiBFbnRyeUtpbmQuU2V0LCBrOiBwYXRoLnNsaWNlKCksIHY6IG51bGwgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKHsga2luZDogRW50cnlLaW5kLlNldCwgazogcGF0aC5zbGljZSgpLCB2OiBjdXJyIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChpc1RyYW5zZm9ybUFycmF5KHRyYW5zZm9ybSkpIHtcblx0XHRcdHRoaXMuX2RpZmZBcnJheSh0cmFuc2Zvcm0sIHBhdGgsIHByZXYgYXMgdW5rbm93bltdLCBjdXJyIGFzIHVua25vd25bXSwgZW50cmllcyk7XG5cdFx0fSBlbHNlIGlmIChpc1RyYW5zZm9ybU9iamVjdCh0cmFuc2Zvcm0pKSB7XG5cdFx0XHR0aGlzLl9kaWZmT2JqZWN0KHRyYW5zZm9ybS5jaGlsZHJlbiwgcGF0aCwgcHJldiwgY3VyciwgZW50cmllcywgdHJhbnNmb3JtLnNlYWxlZCBhcyAoKG9iajogdW5rbm93biwgd2FzU2VyaWFsaXplZDogYm9vbGVhbikgPT4gYm9vbGVhbikgfCB1bmRlZmluZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gdHJhbnNmb3JtIGtpbmQgJHtKU09OLnN0cmluZ2lmeSh0cmFuc2Zvcm0pfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2RpZmZPYmplY3QoXG5cdFx0Y2hpbGRyZW46IEFkYXB0LlNjaGVtYUVudHJpZXMsXG5cdFx0cGF0aDogT2JqZWN0UGF0aCxcblx0XHRwcmV2OiB1bmtub3duLFxuXHRcdGN1cnI6IHVua25vd24sXG5cdFx0ZW50cmllczogRW50cnlbXSxcblx0XHRzZWFsZWQ/OiAob2JqOiB1bmtub3duLCB3YXNTZXJpYWxpemVkOiBib29sZWFuKSA9PiBib29sZWFuLFxuXHQpOiBib29sZWFuIHtcblx0XHRjb25zdCBwcmV2T2JqID0gcHJldiBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjdXJyT2JqID0gY3VyciBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblxuXHRcdGxldCBpID0gMDtcblx0XHRmb3IgKDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBba2V5LCB0cmFuc2Zvcm1dID0gY2hpbGRyZW5baV07XG5cdFx0XHRpZiAoIWlzS2V5VHJhbnNmb3JtKHRyYW5zZm9ybSkpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdHJhbnNmb3JtLmVxdWFscyhwcmV2T2JqPy5ba2V5XSwgY3Vyck9ialtrZXldKSkge1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goeyBraW5kOiBFbnRyeUtpbmQuU2V0LCBrOiBwYXRoLnNsaWNlKCksIHY6IGN1cnIgfSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoc2VhbGVkICYmIHNlYWxlZChwcmV2LCB0cnVlKSAmJiBzZWFsZWQoY3VyciwgZmFsc2UpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRmb3IgKDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBba2V5LCB0cmFuc2Zvcm1dID0gY2hpbGRyZW5baV07XG5cdFx0XHRwYXRoLnB1c2goa2V5KTtcblx0XHRcdHRoaXMuX2RpZmYodHJhbnNmb3JtLCBwYXRoLCBwcmV2T2JqPy5ba2V5XSwgY3Vyck9ialtrZXldLCBlbnRyaWVzKTtcblx0XHRcdHBhdGgucG9wKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlmZkFycmF5PFQsIFI+KFxuXHRcdHRyYW5zZm9ybTogQWRhcHQuVHJhbnNmb3JtQXJyYXk8VCwgUj4sXG5cdFx0cGF0aDogT2JqZWN0UGF0aCxcblx0XHRwcmV2OiB1bmtub3duW10gfCB1bmRlZmluZWQsXG5cdFx0Y3VycjogdW5rbm93bltdIHwgdW5kZWZpbmVkLFxuXHRcdGVudHJpZXM6IEVudHJ5W11cblx0KTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldkFyciA9IHByZXYgfHwgW107XG5cdFx0Y29uc3QgY3VyckFyciA9IGN1cnIgfHwgW107XG5cdFx0Y29uc3QgaXRlbVNjaGVtYSA9IHRyYW5zZm9ybS5pdGVtU2NoZW1hO1xuXHRcdGNvbnN0IG1pbkxlbiA9IE1hdGgubWluKHByZXZBcnIubGVuZ3RoLCBjdXJyQXJyLmxlbmd0aCk7XG5cblx0XHRpZiAoaXNUcmFuc2Zvcm1PYmplY3QoaXRlbVNjaGVtYSkpIHtcblx0XHRcdGNvbnN0IGNoaWxkRW50cmllcyA9IGl0ZW1TY2hlbWEuY2hpbGRyZW47XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbWluTGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgcHJldkl0ZW0gPSBwcmV2QXJyW2ldO1xuXHRcdFx0XHRjb25zdCBjdXJySXRlbSA9IGN1cnJBcnJbaV07XG5cblx0XHRcdFx0aWYgKHRoaXMuX2hhc0tleU1pc21hdGNoKGNoaWxkRW50cmllcywgcHJldkl0ZW0sIGN1cnJJdGVtKSkge1xuXHRcdFx0XHRcdGNvbnN0IG5ld0l0ZW1zID0gY3VyckFyci5zbGljZShpKTtcblx0XHRcdFx0XHRlbnRyaWVzLnB1c2goeyBraW5kOiBFbnRyeUtpbmQuUHVzaCwgazogcGF0aC5zbGljZSgpLCB2OiBuZXdJdGVtcy5sZW5ndGggPiAwID8gbmV3SXRlbXMgOiB1bmRlZmluZWQsIGkgfSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cGF0aC5wdXNoKGkpO1xuXHRcdFx0XHRjb25zdCB3YXNTZWFsZWQgPSB0aGlzLl9kaWZmT2JqZWN0KGNoaWxkRW50cmllcywgcGF0aCwgcHJldkl0ZW0sIGN1cnJJdGVtLCBlbnRyaWVzLCBpdGVtU2NoZW1hLnNlYWxlZCk7XG5cdFx0XHRcdHBhdGgucG9wKCk7XG5cblx0XHRcdFx0aWYgKHdhc1NlYWxlZCkge1xuXHRcdFx0XHRcdGN1cnJBcnJbaV0gPSBwcmV2SXRlbTtcblx0XHRcdFx0XHR0aGlzLnJldXNlZFJlZmVyZW5jZXMrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY3VyckFyci5sZW5ndGggPiBwcmV2QXJyLmxlbmd0aCkge1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goeyBraW5kOiBFbnRyeUtpbmQuUHVzaCwgazogcGF0aC5zbGljZSgpLCB2OiBjdXJyQXJyLnNsaWNlKHByZXZBcnIubGVuZ3RoKSB9KTtcblx0XHRcdH0gZWxzZSBpZiAoY3VyckFyci5sZW5ndGggPCBwcmV2QXJyLmxlbmd0aCkge1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goeyBraW5kOiBFbnRyeUtpbmQuUHVzaCwgazogcGF0aC5zbGljZSgpLCBpOiBjdXJyQXJyLmxlbmd0aCB9KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IGZpcnN0TWlzbWF0Y2ggPSAtMTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBtaW5MZW47IGkrKykge1xuXHRcdFx0XHRpZiAoIWl0ZW1TY2hlbWEuZXF1YWxzKHByZXZBcnJbaV0sIGN1cnJBcnJbaV0pKSB7XG5cdFx0XHRcdFx0Zmlyc3RNaXNtYXRjaCA9IGk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGZpcnN0TWlzbWF0Y2ggPT09IC0xKSB7XG5cdFx0XHRcdGlmIChjdXJyQXJyLmxlbmd0aCA+IHByZXZBcnIubGVuZ3RoKSB7XG5cdFx0XHRcdFx0ZW50cmllcy5wdXNoKHsga2luZDogRW50cnlLaW5kLlB1c2gsIGs6IHBhdGguc2xpY2UoKSwgdjogY3VyckFyci5zbGljZShwcmV2QXJyLmxlbmd0aCkgfSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY3VyckFyci5sZW5ndGggPCBwcmV2QXJyLmxlbmd0aCkge1xuXHRcdFx0XHRcdGVudHJpZXMucHVzaCh7IGtpbmQ6IEVudHJ5S2luZC5QdXNoLCBrOiBwYXRoLnNsaWNlKCksIGk6IGN1cnJBcnIubGVuZ3RoIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBuZXdJdGVtcyA9IGN1cnJBcnIuc2xpY2UoZmlyc3RNaXNtYXRjaCk7XG5cdFx0XHRcdGVudHJpZXMucHVzaCh7IGtpbmQ6IEVudHJ5S2luZC5QdXNoLCBrOiBwYXRoLnNsaWNlKCksIHY6IG5ld0l0ZW1zLmxlbmd0aCA+IDAgPyBuZXdJdGVtcyA6IHVuZGVmaW5lZCwgaTogZmlyc3RNaXNtYXRjaCB9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9oYXNLZXlNaXNtYXRjaChjaGlsZHJlbjogQWRhcHQuU2NoZW1hRW50cmllcywgcHJldjogdW5rbm93biwgY3VycjogdW5rbm93bik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHByZXZPYmogPSBwcmV2IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGN1cnJPYmogPSBjdXJyIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXG5cdFx0Zm9yIChjb25zdCBba2V5LCB0cmFuc2Zvcm1dIG9mIGNoaWxkcmVuKSB7XG5cdFx0XHRpZiAoIWlzS2V5VHJhbnNmb3JtKHRyYW5zZm9ybSkpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdHJhbnNmb3JtLmVxdWFscyhwcmV2T2JqPy5ba2V5XSwgY3Vyck9ialtrZXldKSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlQmVuY2htYXJrU2NoZW1hKCk6IEFkYXB0LlRyYW5zZm9ybU9iamVjdDxCZW5jaG1hcmtTdGF0ZSwgQmVuY2htYXJrU3RhdGU+IHtcblx0Y29uc3QgaXRlbVNjaGVtYSA9IEFkYXB0Lm9iamVjdDxCZW5jaG1hcmtJdGVtLCBCZW5jaG1hcmtJdGVtPih7XG5cdFx0aWQ6IEFkYXB0LnQoaXRlbSA9PiBpdGVtLmlkLCBBZGFwdC5rZXkoKSksXG5cdFx0Y29udGVudDogQWRhcHQudChpdGVtID0+IGl0ZW0uY29udGVudCwgQWRhcHQudmFsdWUoKSksXG5cdFx0cmVmZXJlbmNlczogQWRhcHQudChpdGVtID0+IGl0ZW0ucmVmZXJlbmNlcywgQWRhcHQuYXJyYXkoQWRhcHQudmFsdWUoKSkpLFxuXHRcdGlzU2VhbGVkOiBBZGFwdC50KGl0ZW0gPT4gaXRlbS5pc1NlYWxlZCwgQWRhcHQudmFsdWUoKSksXG5cdH0sIHtcblx0XHRzZWFsZWQ6IGl0ZW0gPT4gaXRlbS5pc1NlYWxlZCxcblx0fSk7XG5cblx0cmV0dXJuIEFkYXB0Lm9iamVjdDxCZW5jaG1hcmtTdGF0ZSwgQmVuY2htYXJrU3RhdGU+KHtcblx0XHRpdGVtczogQWRhcHQudChzdGF0ZSA9PiBzdGF0ZS5pdGVtcywgQWRhcHQuYXJyYXkoaXRlbVNjaGVtYSkpLFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUGF5bG9hZChsYWJlbDogc3RyaW5nLCBzaXplOiBudW1iZXIpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7bGFiZWx9OiR7J3gnLnJlcGVhdChzaXplKX1gO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVCZW5jaG1hcmtTdGF0ZShpdGVyYXRpb246IG51bWJlcik6IEJlbmNobWFya1N0YXRlIHtcblx0Y29uc3QgaXRlbXM6IEJlbmNobWFya0l0ZW1bXSA9IFtdO1xuXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgYmVuY2htYXJrQ29uZmlnLnNlYWxlZEl0ZW1zOyBpKyspIHtcblx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdGlkOiBgc2VhbGVkLSR7aX1gLFxuXHRcdFx0Y29udGVudDogY3JlYXRlUGF5bG9hZChgc2VhbGVkLSR7aX1gLCBiZW5jaG1hcmtDb25maWcucGF5bG9hZFNpemUpLFxuXHRcdFx0cmVmZXJlbmNlczogW1xuXHRcdFx0XHRjcmVhdGVQYXlsb2FkKGByZWYtJHtpfS1hYCwgYmVuY2htYXJrQ29uZmlnLnBheWxvYWRTaXplIC8gMiksXG5cdFx0XHRcdGNyZWF0ZVBheWxvYWQoYHJlZi0ke2l9LWJgLCBiZW5jaG1hcmtDb25maWcucGF5bG9hZFNpemUgLyAyKSxcblx0XHRcdF0sXG5cdFx0XHRpc1NlYWxlZDogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdGZvciAobGV0IGkgPSAwOyBpIDwgYmVuY2htYXJrQ29uZmlnLmFjdGl2ZUl0ZW1zOyBpKyspIHtcblx0XHRjb25zdCByZXZpc2lvbiA9IGkgPT09IGJlbmNobWFya0NvbmZpZy5hY3RpdmVJdGVtcyAtIDEgPyBpdGVyYXRpb24gOiAwO1xuXHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0aWQ6IGBhY3RpdmUtJHtpfWAsXG5cdFx0XHRjb250ZW50OiBjcmVhdGVQYXlsb2FkKGBhY3RpdmUtJHtpfS0ke3JldmlzaW9ufWAsIGJlbmNobWFya0NvbmZpZy5wYXlsb2FkU2l6ZSksXG5cdFx0XHRyZWZlcmVuY2VzOiBbXG5cdFx0XHRcdGNyZWF0ZVBheWxvYWQoYGFjdGl2ZS1yZWYtJHtpfS0ke3JldmlzaW9ufWAsIGJlbmNobWFya0NvbmZpZy5wYXlsb2FkU2l6ZSAvIDIpLFxuXHRcdFx0XHRjcmVhdGVQYXlsb2FkKGBhY3RpdmUtcmVmLSR7aX0tc3RhYmxlYCwgYmVuY2htYXJrQ29uZmlnLnBheWxvYWRTaXplIC8gMiksXG5cdFx0XHRdLFxuXHRcdFx0aXNTZWFsZWQ6IGZhbHNlLFxuXHRcdH0pO1xuXHR9XG5cblx0cmV0dXJuIHsgaXRlbXMgfTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQmVuY2htYXJrU3RhdGVzKCk6IEJlbmNobWFya1N0YXRlW10ge1xuXHRjb25zdCBzdGF0ZXM6IEJlbmNobWFya1N0YXRlW10gPSBbXTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBiZW5jaG1hcmtDb25maWcuaXRlcmF0aW9uczsgaSsrKSB7XG5cdFx0c3RhdGVzLnB1c2goY3JlYXRlQmVuY2htYXJrU3RhdGUoaSkpO1xuXHR9XG5cdHJldHVybiBzdGF0ZXM7XG59XG5cbmZ1bmN0aW9uIGFwcGVuZFRvTG9nKGN1cnJlbnQ6IFZTQnVmZmVyLCByZXN1bHQ6IHsgb3A6ICdhcHBlbmQnIHwgJ3JlcGxhY2UnOyBkYXRhOiBWU0J1ZmZlciB9KTogVlNCdWZmZXIge1xuXHRpZiAocmVzdWx0Lm9wID09PSAncmVwbGFjZScpIHtcblx0XHRyZXR1cm4gcmVzdWx0LmRhdGE7XG5cdH1cblxuXHRyZXR1cm4gVlNCdWZmZXIuY29uY2F0KFtjdXJyZW50LCByZXN1bHQuZGF0YV0pO1xufVxuXG5mdW5jdGlvbiBjb2xsZWN0R2FyYmFnZSgpOiB2b2lkIHtcblx0Y29uc3QgZ2MgPSBSZWZsZWN0LmdldChnbG9iYWxUaGlzLCAnZ2MnKTtcblx0aWYgKGlzVm9pZEZ1bmN0aW9uKGdjKSkge1xuXHRcdGdjKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gcnVuQmVuY2htYXJrUm91bmQod3JpdGVyOiBCZW5jaG1hcmtXcml0ZXI8QmVuY2htYXJrU3RhdGU+LCBzdGF0ZXM6IHJlYWRvbmx5IEJlbmNobWFya1N0YXRlW10sIHNjaGVtYTogQWRhcHQuVHJhbnNmb3JtT2JqZWN0PEJlbmNobWFya1N0YXRlLCBCZW5jaG1hcmtTdGF0ZT4pOiBCZW5jaG1hcmtSZXN1bHQge1xuXHRjb2xsZWN0R2FyYmFnZSgpO1xuXHRjb25zdCBpbml0aWFsSGVhcCA9IHByb2Nlc3MubWVtb3J5VXNhZ2UoKS5oZWFwVXNlZDtcblxuXHRsZXQgc2VyaWFsaXplZCA9IHdyaXRlci5jcmVhdGVJbml0aWFsKHN0YXRlc1swXSk7XG5cdGNvbnN0IHN3ID0gU3RvcFdhdGNoLmNyZWF0ZSgpO1xuXHRmb3IgKGxldCBpID0gMTsgaSA8IHN0YXRlcy5sZW5ndGg7IGkrKykge1xuXHRcdHNlcmlhbGl6ZWQgPSBhcHBlbmRUb0xvZyhzZXJpYWxpemVkLCB3cml0ZXIud3JpdGUoc3RhdGVzW2ldKSk7XG5cdFx0d3JpdGVyLmNvbmZpcm1Xcml0ZSgpO1xuXHR9XG5cdGNvbnN0IGVsYXBzZWRNcyA9IHN3LmVsYXBzZWQoKTtcblxuXHRjb2xsZWN0R2FyYmFnZSgpO1xuXHRjb25zdCBmaW5hbEhlYXAgPSBwcm9jZXNzLm1lbW9yeVVzYWdlKCkuaGVhcFVzZWQ7XG5cblx0Y29uc3QgcmVhZGVyID0gbmV3IEFkYXB0Lk9iamVjdE11dGF0aW9uTG9nKHNjaGVtYSk7XG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVhZGVyLnJlYWQoc2VyaWFsaXplZCksIHN0YXRlc1tzdGF0ZXMubGVuZ3RoIC0gMV0pO1xuXG5cdHJldHVybiB7XG5cdFx0ZWxhcHNlZE1zLFxuXHRcdGhlYXBEZWx0YUJ5dGVzOiBmaW5hbEhlYXAgLSBpbml0aWFsSGVhcCxcblx0XHRzZXJpYWxpemVkLFxuXHRcdHJldXNlZFJlZmVyZW5jZXM6IHdyaXRlci5yZXVzZWRSZWZlcmVuY2VzID8/IDAsXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1lZGlhbih2YWx1ZXM6IHJlYWRvbmx5IG51bWJlcltdKTogbnVtYmVyIHtcblx0Y29uc3Qgc29ydGVkID0gWy4uLnZhbHVlc10uc29ydCgoYSwgYikgPT4gYSAtIGIpO1xuXHRjb25zdCBtaWRkbGUgPSBNYXRoLmZsb29yKHNvcnRlZC5sZW5ndGggLyAyKTtcblx0aWYgKHNvcnRlZC5sZW5ndGggJSAyID09PSAwKSB7XG5cdFx0cmV0dXJuIChzb3J0ZWRbbWlkZGxlIC0gMV0gKyBzb3J0ZWRbbWlkZGxlXSkgLyAyO1xuXHR9XG5cblx0cmV0dXJuIHNvcnRlZFttaWRkbGVdO1xufVxuXG5mdW5jdGlvbiBmb3JtYXRCeXRlcyhieXRlczogbnVtYmVyKTogc3RyaW5nIHtcblx0Y29uc3Qgc2lnbiA9IGJ5dGVzIDwgMCA/ICctJyA6ICcnO1xuXHRjb25zdCBhYnNvbHV0ZSA9IE1hdGguYWJzKGJ5dGVzKTtcblx0aWYgKGFic29sdXRlIDwgMTAyNCkge1xuXHRcdHJldHVybiBgJHtieXRlc30gQmA7XG5cdH1cblx0aWYgKGFic29sdXRlIDwgMTAyNCAqIDEwMjQpIHtcblx0XHRyZXR1cm4gYCR7c2lnbn0keyhhYnNvbHV0ZSAvIDEwMjQpLnRvRml4ZWQoMSl9IEtCYDtcblx0fVxuXG5cdHJldHVybiBgJHtzaWdufSR7KGFic29sdXRlIC8gKDEwMjQgKiAxMDI0KSkudG9GaXhlZCgyKX0gTUJgO1xufVxuXG5wZXJmU3VpdGUoJ0NoYXQgT2JqZWN0TXV0YXRpb25Mb2cgLSBwZXJmJywgZnVuY3Rpb24gKCkge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBzY2hlbWEgPSBjcmVhdGVCZW5jaG1hcmtTY2hlbWEoKTtcblx0Y29uc3Qgc3RhdGVzID0gY3JlYXRlQmVuY2htYXJrU3RhdGVzKCk7XG5cblx0dGVzdCgnY29tcGFyZXMgYmFzZWxpbmUgd3JpdGVzIGFnYWluc3Qgc2VhbGVkLXJlZmVyZW5jZSByZXVzZScsIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTIwXzAwMCk7XG5cblx0XHQvLyBXYXJtIHVwIGJvdGggdmFyaWFudHMgb25jZSBzbyB0aGUgbWVhc3VyZWQgcm91bmRzIGFyZSBsZXNzIG5vaXN5LlxuXHRcdHJ1bkJlbmNobWFya1JvdW5kKG5ldyBBZGFwdC5PYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpLCBzdGF0ZXMsIHNjaGVtYSk7XG5cdFx0cnVuQmVuY2htYXJrUm91bmQobmV3IFJlZmVyZW5jZVJldXNpbmdPYmplY3RNdXRhdGlvbkxvZyhzY2hlbWEpLCBzdGF0ZXMsIHNjaGVtYSk7XG5cblx0XHRjb25zdCBiYXNlbGluZVJlc3VsdHM6IEJlbmNobWFya1Jlc3VsdFtdID0gW107XG5cdFx0Y29uc3Qgb3B0aW1pemVkUmVzdWx0czogQmVuY2htYXJrUmVzdWx0W10gPSBbXTtcblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYmVuY2htYXJrQ29uZmlnLnJvdW5kczsgaSsrKSB7XG5cdFx0XHRiYXNlbGluZVJlc3VsdHMucHVzaChydW5CZW5jaG1hcmtSb3VuZChuZXcgQWRhcHQuT2JqZWN0TXV0YXRpb25Mb2coc2NoZW1hKSwgc3RhdGVzLCBzY2hlbWEpKTtcblx0XHRcdG9wdGltaXplZFJlc3VsdHMucHVzaChydW5CZW5jaG1hcmtSb3VuZChuZXcgUmVmZXJlbmNlUmV1c2luZ09iamVjdE11dGF0aW9uTG9nKHNjaGVtYSksIHN0YXRlcywgc2NoZW1hKSk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGJhc2VsaW5lUmVzdWx0c1swXS5zZXJpYWxpemVkLnRvU3RyaW5nKCksIG9wdGltaXplZFJlc3VsdHNbMF0uc2VyaWFsaXplZC50b1N0cmluZygpKTtcblxuXHRcdGNvbnN0IGJhc2VsaW5lRWxhcHNlZCA9IG1lZGlhbihiYXNlbGluZVJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQuZWxhcHNlZE1zKSk7XG5cdFx0Y29uc3Qgb3B0aW1pemVkRWxhcHNlZCA9IG1lZGlhbihvcHRpbWl6ZWRSZXN1bHRzLm1hcChyZXN1bHQgPT4gcmVzdWx0LmVsYXBzZWRNcykpO1xuXHRcdGNvbnN0IGJhc2VsaW5lSGVhcCA9IG1lZGlhbihiYXNlbGluZVJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQuaGVhcERlbHRhQnl0ZXMpKTtcblx0XHRjb25zdCBvcHRpbWl6ZWRIZWFwID0gbWVkaWFuKG9wdGltaXplZFJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQuaGVhcERlbHRhQnl0ZXMpKTtcblx0XHRjb25zdCBvcHRpbWl6ZWRSZXVzZWRSZWZlcmVuY2VzID0gbWVkaWFuKG9wdGltaXplZFJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQucmV1c2VkUmVmZXJlbmNlcykpO1xuXG5cdFx0Y29uc29sZS5sb2coJ1tjaGF0IG9iamVjdE11dGF0aW9uTG9nIHBlcmZdIGNvbmZpZycsIGJlbmNobWFya0NvbmZpZyk7XG5cdFx0Y29uc29sZS5sb2coJ1tjaGF0IG9iamVjdE11dGF0aW9uTG9nIHBlcmZdIGJhc2VsaW5lJywge1xuXHRcdFx0bWVkaWFuRWxhcHNlZE1zOiBiYXNlbGluZUVsYXBzZWQsXG5cdFx0XHRtZWRpYW5IZWFwRGVsdGE6IGZvcm1hdEJ5dGVzKGJhc2VsaW5lSGVhcCksXG5cdFx0XHRzZXJpYWxpemVkQnl0ZXM6IGJhc2VsaW5lUmVzdWx0c1swXS5zZXJpYWxpemVkLmJ5dGVMZW5ndGgsXG5cdFx0fSk7XG5cdFx0Y29uc29sZS5sb2coJ1tjaGF0IG9iamVjdE11dGF0aW9uTG9nIHBlcmZdIG9wdGltaXplZCcsIHtcblx0XHRcdG1lZGlhbkVsYXBzZWRNczogb3B0aW1pemVkRWxhcHNlZCxcblx0XHRcdG1lZGlhbkhlYXBEZWx0YTogZm9ybWF0Qnl0ZXMob3B0aW1pemVkSGVhcCksXG5cdFx0XHRzZXJpYWxpemVkQnl0ZXM6IG9wdGltaXplZFJlc3VsdHNbMF0uc2VyaWFsaXplZC5ieXRlTGVuZ3RoLFxuXHRcdFx0cmV1c2VkUmVmZXJlbmNlczogb3B0aW1pemVkUmV1c2VkUmVmZXJlbmNlcyxcblx0XHR9KTtcblx0XHRjb25zb2xlLmxvZygnW2NoYXQgb2JqZWN0TXV0YXRpb25Mb2cgcGVyZl0gZGVsdGEnLCB7XG5cdFx0XHRlbGFwc2VkTXM6IG9wdGltaXplZEVsYXBzZWQgLSBiYXNlbGluZUVsYXBzZWQsXG5cdFx0XHRoZWFwRGVsdGE6IGZvcm1hdEJ5dGVzKG9wdGltaXplZEhlYXAgLSBiYXNlbGluZUhlYXApLFxuXHRcdFx0ZWxhcHNlZFJhdGlvOiBOdW1iZXIoKG9wdGltaXplZEVsYXBzZWQgLyBiYXNlbGluZUVsYXBzZWQpLnRvRml4ZWQoMykpLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsK0NBQStDO0FBQ3hELFlBQVksV0FBVztBQUV2QixNQUFNLGFBQWEsUUFBUSxJQUFJLHlDQUF5QztBQUV4RSxTQUFTLFVBQVUsTUFBYyxVQUE2QztBQUM3RSxNQUFJLFlBQVk7QUFDZixVQUFNLE1BQU0sUUFBUTtBQUFBLEVBQ3JCO0FBQ0Q7QUFFQSxJQUFXLFlBQVgsa0JBQVdBLGVBQVg7QUFDQyxFQUFBQSxzQkFBQSxhQUFV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
