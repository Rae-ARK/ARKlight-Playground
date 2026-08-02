import { arrayInsert } from "../../../base/common/arrays.js";
import { toUint32 } from "../../../base/common/uint.js";
class PrefixSumComputer {
  constructor(values) {
    this.values = values;
    this.prefixSum = new Uint32Array(values.length);
    this.prefixSumValidIndex = new Int32Array(1);
    this.prefixSumValidIndex[0] = -1;
  }
  getCount() {
    return this.values.length;
  }
  insertValues(insertIndex, insertValues) {
    insertIndex = toUint32(insertIndex);
    const oldValues = this.values;
    const oldPrefixSum = this.prefixSum;
    const insertValuesLen = insertValues.length;
    if (insertValuesLen === 0) {
      return false;
    }
    this.values = new Uint32Array(oldValues.length + insertValuesLen);
    this.values.set(oldValues.subarray(0, insertIndex), 0);
    this.values.set(oldValues.subarray(insertIndex), insertIndex + insertValuesLen);
    this.values.set(insertValues, insertIndex);
    if (insertIndex - 1 < this.prefixSumValidIndex[0]) {
      this.prefixSumValidIndex[0] = insertIndex - 1;
    }
    this.prefixSum = new Uint32Array(this.values.length);
    if (this.prefixSumValidIndex[0] >= 0) {
      this.prefixSum.set(oldPrefixSum.subarray(0, this.prefixSumValidIndex[0] + 1));
    }
    return true;
  }
  setValue(index, value) {
    index = toUint32(index);
    value = toUint32(value);
    if (this.values[index] === value) {
      return false;
    }
    this.values[index] = value;
    if (index - 1 < this.prefixSumValidIndex[0]) {
      this.prefixSumValidIndex[0] = index - 1;
    }
    return true;
  }
  removeValues(startIndex, count) {
    startIndex = toUint32(startIndex);
    count = toUint32(count);
    const oldValues = this.values;
    const oldPrefixSum = this.prefixSum;
    if (startIndex >= oldValues.length) {
      return false;
    }
    const maxCount = oldValues.length - startIndex;
    if (count >= maxCount) {
      count = maxCount;
    }
    if (count === 0) {
      return false;
    }
    this.values = new Uint32Array(oldValues.length - count);
    this.values.set(oldValues.subarray(0, startIndex), 0);
    this.values.set(oldValues.subarray(startIndex + count), startIndex);
    this.prefixSum = new Uint32Array(this.values.length);
    if (startIndex - 1 < this.prefixSumValidIndex[0]) {
      this.prefixSumValidIndex[0] = startIndex - 1;
    }
    if (this.prefixSumValidIndex[0] >= 0) {
      this.prefixSum.set(oldPrefixSum.subarray(0, this.prefixSumValidIndex[0] + 1));
    }
    return true;
  }
  getTotalSum() {
    if (this.values.length === 0) {
      return 0;
    }
    return this._getPrefixSum(this.values.length - 1);
  }
  /**
   * Returns the sum of the first `index + 1` many items.
   * @returns `SUM(0 <= j <= index, values[j])`.
   */
  getPrefixSum(index) {
    if (index < 0) {
      return 0;
    }
    index = toUint32(index);
    return this._getPrefixSum(index);
  }
  _getPrefixSum(index) {
    if (index <= this.prefixSumValidIndex[0]) {
      return this.prefixSum[index];
    }
    let startIndex = this.prefixSumValidIndex[0] + 1;
    if (startIndex === 0) {
      this.prefixSum[0] = this.values[0];
      startIndex++;
    }
    if (index >= this.values.length) {
      index = this.values.length - 1;
    }
    for (let i = startIndex; i <= index; i++) {
      this.prefixSum[i] = this.prefixSum[i - 1] + this.values[i];
    }
    this.prefixSumValidIndex[0] = Math.max(this.prefixSumValidIndex[0], index);
    return this.prefixSum[index];
  }
  getIndexOf(sum) {
    sum = Math.floor(sum);
    this.getTotalSum();
    let low = 0;
    let high = this.values.length - 1;
    let mid = 0;
    let midStop = 0;
    let midStart = 0;
    while (low <= high) {
      mid = low + (high - low) / 2 | 0;
      midStop = this.prefixSum[mid];
      midStart = midStop - this.values[mid];
      if (sum < midStart) {
        high = mid - 1;
      } else if (sum >= midStop) {
        low = mid + 1;
      } else {
        break;
      }
    }
    return new PrefixSumIndexOfResult(mid, sum - midStart);
  }
}
class ConstantTimePrefixSumComputer {
  constructor(values) {
    this._values = values;
    this._isValid = false;
    this._validEndIndex = -1;
    this._prefixSum = [];
    this._indexBySum = [];
  }
  /**
   * @returns SUM(0 <= j < values.length, values[j])
   */
  getTotalSum() {
    this._ensureValid();
    return this._indexBySum.length;
  }
  /**
   * Returns the sum of the first `count` many items.
   * @returns `SUM(0 <= j < count, values[j])`.
   */
  getPrefixSum(count) {
    this._ensureValid();
    if (count === 0) {
      return 0;
    }
    return this._prefixSum[count - 1];
  }
  /**
   * @returns `result`, such that `getPrefixSum(result.index) + result.remainder = sum`
   */
  getIndexOf(sum) {
    this._ensureValid();
    const idx = this._indexBySum[sum];
    if (idx === void 0) {
      const lastIdx = Math.max(0, this._values.length - 1);
      const lastPrefixSum = lastIdx > 0 ? this._prefixSum[lastIdx - 1] : 0;
      return new PrefixSumIndexOfResult(lastIdx, sum - lastPrefixSum);
    }
    const viewLinesAbove = idx > 0 ? this._prefixSum[idx - 1] : 0;
    return new PrefixSumIndexOfResult(idx, sum - viewLinesAbove);
  }
  removeValues(start, deleteCount) {
    this._values.splice(start, deleteCount);
    this._invalidate(start);
  }
  insertValues(insertIndex, insertArr) {
    this._values = arrayInsert(this._values, insertIndex, insertArr);
    this._invalidate(insertIndex);
  }
  _invalidate(index) {
    this._isValid = false;
    this._validEndIndex = Math.min(this._validEndIndex, index - 1);
  }
  _ensureValid() {
    if (this._isValid) {
      return;
    }
    for (let i = this._validEndIndex + 1, len = this._values.length; i < len; i++) {
      const value = this._values[i];
      const sumAbove = i > 0 ? this._prefixSum[i - 1] : 0;
      this._prefixSum[i] = sumAbove + value;
      for (let j = 0; j < value; j++) {
        this._indexBySum[sumAbove + j] = i;
      }
    }
    this._prefixSum.length = this._values.length;
    this._indexBySum.length = this._values.length > 0 ? this._prefixSum[this._values.length - 1] : 0;
    this._isValid = true;
    this._validEndIndex = this._values.length - 1;
  }
  setValue(index, value) {
    if (this._values[index] === value) {
      return;
    }
    this._values[index] = value;
    this._invalidate(index);
  }
}
class PrefixSumIndexOfResult {
  constructor(index, remainder) {
    this.index = index;
    this.remainder = remainder;
    this._prefixSumIndexOfResultBrand = void 0;
    this.index = index;
    this.remainder = remainder;
  }
}
export {
  ConstantTimePrefixSumComputer,
  PrefixSumComputer,
  PrefixSumIndexOfResult
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vbW9kZWwvcHJlZml4U3VtQ29tcHV0ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBhcnJheUluc2VydCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyB0b1VpbnQzMiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VpbnQuanMnO1xuXG5leHBvcnQgY2xhc3MgUHJlZml4U3VtQ29tcHV0ZXIge1xuXG5cdC8qKlxuXHQgKiB2YWx1ZXNbaV0gaXMgdGhlIHZhbHVlIGF0IGluZGV4IGlcblx0ICovXG5cdHByaXZhdGUgdmFsdWVzOiBVaW50MzJBcnJheTtcblxuXHQvKipcblx0ICogcHJlZml4U3VtW2ldID0gU1VNKGhlaWdodHNbal0pLCAwIDw9IGogPD0gaVxuXHQgKi9cblx0cHJpdmF0ZSBwcmVmaXhTdW06IFVpbnQzMkFycmF5O1xuXG5cdC8qKlxuXHQgKiBwcmVmaXhTdW1baV0sIDAgPD0gaSA8PSBwcmVmaXhTdW1WYWxpZEluZGV4IGNhbiBiZSB0cnVzdGVkXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IHByZWZpeFN1bVZhbGlkSW5kZXg6IEludDMyQXJyYXk7XG5cblx0Y29uc3RydWN0b3IodmFsdWVzOiBVaW50MzJBcnJheSkge1xuXHRcdHRoaXMudmFsdWVzID0gdmFsdWVzO1xuXHRcdHRoaXMucHJlZml4U3VtID0gbmV3IFVpbnQzMkFycmF5KHZhbHVlcy5sZW5ndGgpO1xuXHRcdHRoaXMucHJlZml4U3VtVmFsaWRJbmRleCA9IG5ldyBJbnQzMkFycmF5KDEpO1xuXHRcdHRoaXMucHJlZml4U3VtVmFsaWRJbmRleFswXSA9IC0xO1xuXHR9XG5cblx0cHVibGljIGdldENvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudmFsdWVzLmxlbmd0aDtcblx0fVxuXG5cdHB1YmxpYyBpbnNlcnRWYWx1ZXMoaW5zZXJ0SW5kZXg6IG51bWJlciwgaW5zZXJ0VmFsdWVzOiBVaW50MzJBcnJheSk6IGJvb2xlYW4ge1xuXHRcdGluc2VydEluZGV4ID0gdG9VaW50MzIoaW5zZXJ0SW5kZXgpO1xuXHRcdGNvbnN0IG9sZFZhbHVlcyA9IHRoaXMudmFsdWVzO1xuXHRcdGNvbnN0IG9sZFByZWZpeFN1bSA9IHRoaXMucHJlZml4U3VtO1xuXHRcdGNvbnN0IGluc2VydFZhbHVlc0xlbiA9IGluc2VydFZhbHVlcy5sZW5ndGg7XG5cblx0XHRpZiAoaW5zZXJ0VmFsdWVzTGVuID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy52YWx1ZXMgPSBuZXcgVWludDMyQXJyYXkob2xkVmFsdWVzLmxlbmd0aCArIGluc2VydFZhbHVlc0xlbik7XG5cdFx0dGhpcy52YWx1ZXMuc2V0KG9sZFZhbHVlcy5zdWJhcnJheSgwLCBpbnNlcnRJbmRleCksIDApO1xuXHRcdHRoaXMudmFsdWVzLnNldChvbGRWYWx1ZXMuc3ViYXJyYXkoaW5zZXJ0SW5kZXgpLCBpbnNlcnRJbmRleCArIGluc2VydFZhbHVlc0xlbik7XG5cdFx0dGhpcy52YWx1ZXMuc2V0KGluc2VydFZhbHVlcywgaW5zZXJ0SW5kZXgpO1xuXG5cdFx0aWYgKGluc2VydEluZGV4IC0gMSA8IHRoaXMucHJlZml4U3VtVmFsaWRJbmRleFswXSkge1xuXHRcdFx0dGhpcy5wcmVmaXhTdW1WYWxpZEluZGV4WzBdID0gaW5zZXJ0SW5kZXggLSAxO1xuXHRcdH1cblxuXHRcdHRoaXMucHJlZml4U3VtID0gbmV3IFVpbnQzMkFycmF5KHRoaXMudmFsdWVzLmxlbmd0aCk7XG5cdFx0aWYgKHRoaXMucHJlZml4U3VtVmFsaWRJbmRleFswXSA+PSAwKSB7XG5cdFx0XHR0aGlzLnByZWZpeFN1bS5zZXQob2xkUHJlZml4U3VtLnN1YmFycmF5KDAsIHRoaXMucHJlZml4U3VtVmFsaWRJbmRleFswXSArIDEpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgc2V0VmFsdWUoaW5kZXg6IG51bWJlciwgdmFsdWU6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGluZGV4ID0gdG9VaW50MzIoaW5kZXgpO1xuXHRcdHZhbHVlID0gdG9VaW50MzIodmFsdWUpO1xuXG5cdFx0aWYgKHRoaXMudmFsdWVzW2luZGV4XSA9PT0gdmFsdWUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dGhpcy52YWx1ZXNbaW5kZXhdID0gdmFsdWU7XG5cdFx0aWYgKGluZGV4IC0gMSA8IHRoaXMucHJlZml4U3VtVmFsaWRJbmRleFswXSkge1xuXHRcdFx0dGhpcy5wcmVmaXhTdW1WYWxpZEluZGV4WzBdID0gaW5kZXggLSAxO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVWYWx1ZXMoc3RhcnRJbmRleDogbnVtYmVyLCBjb3VudDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0c3RhcnRJbmRleCA9IHRvVWludDMyKHN0YXJ0SW5kZXgpO1xuXHRcdGNvdW50ID0gdG9VaW50MzIoY291bnQpO1xuXG5cdFx0Y29uc3Qgb2xkVmFsdWVzID0gdGhpcy52YWx1ZXM7XG5cdFx0Y29uc3Qgb2xkUHJlZml4U3VtID0gdGhpcy5wcmVmaXhTdW07XG5cblx0XHRpZiAoc3RhcnRJbmRleCA+PSBvbGRWYWx1ZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWF4Q291bnQgPSBvbGRWYWx1ZXMubGVuZ3RoIC0gc3RhcnRJbmRleDtcblx0XHRpZiAoY291bnQgPj0gbWF4Q291bnQpIHtcblx0XHRcdGNvdW50ID0gbWF4Q291bnQ7XG5cdFx0fVxuXG5cdFx0aWYgKGNvdW50ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy52YWx1ZXMgPSBuZXcgVWludDMyQXJyYXkob2xkVmFsdWVzLmxlbmd0aCAtIGNvdW50KTtcblx0XHR0aGlzLnZhbHVlcy5zZXQob2xkVmFsdWVzLnN1YmFycmF5KDAsIHN0YXJ0SW5kZXgpLCAwKTtcblx0XHR0aGlzLnZhbHVlcy5zZXQob2xkVmFsdWVzLnN1YmFycmF5KHN0YXJ0SW5kZXggKyBjb3VudCksIHN0YXJ0SW5kZXgpO1xuXG5cdFx0dGhpcy5wcmVmaXhTdW0gPSBuZXcgVWludDMyQXJyYXkodGhpcy52YWx1ZXMubGVuZ3RoKTtcblx0XHRpZiAoc3RhcnRJbmRleCAtIDEgPCB0aGlzLnByZWZpeFN1bVZhbGlkSW5kZXhbMF0pIHtcblx0XHRcdHRoaXMucHJlZml4U3VtVmFsaWRJbmRleFswXSA9IHN0YXJ0SW5kZXggLSAxO1xuXHRcdH1cblx0XHRpZiAodGhpcy5wcmVmaXhTdW1WYWxpZEluZGV4WzBdID49IDApIHtcblx0XHRcdHRoaXMucHJlZml4U3VtLnNldChvbGRQcmVmaXhTdW0uc3ViYXJyYXkoMCwgdGhpcy5wcmVmaXhTdW1WYWxpZEluZGV4WzBdICsgMSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRUb3RhbFN1bSgpOiBudW1iZXIge1xuXHRcdGlmICh0aGlzLnZhbHVlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZ2V0UHJlZml4U3VtKHRoaXMudmFsdWVzLmxlbmd0aCAtIDEpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHN1bSBvZiB0aGUgZmlyc3QgYGluZGV4ICsgMWAgbWFueSBpdGVtcy5cblx0ICogQHJldHVybnMgYFNVTSgwIDw9IGogPD0gaW5kZXgsIHZhbHVlc1tqXSlgLlxuXHQgKi9cblx0cHVibGljIGdldFByZWZpeFN1bShpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAoaW5kZXggPCAwKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRpbmRleCA9IHRvVWludDMyKGluZGV4KTtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0UHJlZml4U3VtKGluZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFByZWZpeFN1bShpbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAoaW5kZXggPD0gdGhpcy5wcmVmaXhTdW1WYWxpZEluZGV4WzBdKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wcmVmaXhTdW1baW5kZXhdO1xuXHRcdH1cblxuXHRcdGxldCBzdGFydEluZGV4ID0gdGhpcy5wcmVmaXhTdW1WYWxpZEluZGV4WzBdICsgMTtcblx0XHRpZiAoc3RhcnRJbmRleCA9PT0gMCkge1xuXHRcdFx0dGhpcy5wcmVmaXhTdW1bMF0gPSB0aGlzLnZhbHVlc1swXTtcblx0XHRcdHN0YXJ0SW5kZXgrKztcblx0XHR9XG5cblx0XHRpZiAoaW5kZXggPj0gdGhpcy52YWx1ZXMubGVuZ3RoKSB7XG5cdFx0XHRpbmRleCA9IHRoaXMudmFsdWVzLmxlbmd0aCAtIDE7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IHN0YXJ0SW5kZXg7IGkgPD0gaW5kZXg7IGkrKykge1xuXHRcdFx0dGhpcy5wcmVmaXhTdW1baV0gPSB0aGlzLnByZWZpeFN1bVtpIC0gMV0gKyB0aGlzLnZhbHVlc1tpXTtcblx0XHR9XG5cdFx0dGhpcy5wcmVmaXhTdW1WYWxpZEluZGV4WzBdID0gTWF0aC5tYXgodGhpcy5wcmVmaXhTdW1WYWxpZEluZGV4WzBdLCBpbmRleCk7XG5cdFx0cmV0dXJuIHRoaXMucHJlZml4U3VtW2luZGV4XTtcblx0fVxuXG5cdHB1YmxpYyBnZXRJbmRleE9mKHN1bTogbnVtYmVyKTogUHJlZml4U3VtSW5kZXhPZlJlc3VsdCB7XG5cdFx0c3VtID0gTWF0aC5mbG9vcihzdW0pO1xuXG5cdFx0Ly8gQ29tcHV0ZSBhbGwgc3VtcyAodG8gZ2V0IGEgZnVsbHkgdmFsaWQgcHJlZml4U3VtKVxuXHRcdHRoaXMuZ2V0VG90YWxTdW0oKTtcblxuXHRcdGxldCBsb3cgPSAwO1xuXHRcdGxldCBoaWdoID0gdGhpcy52YWx1ZXMubGVuZ3RoIC0gMTtcblx0XHRsZXQgbWlkID0gMDtcblx0XHRsZXQgbWlkU3RvcCA9IDA7XG5cdFx0bGV0IG1pZFN0YXJ0ID0gMDtcblxuXHRcdHdoaWxlIChsb3cgPD0gaGlnaCkge1xuXHRcdFx0bWlkID0gbG93ICsgKChoaWdoIC0gbG93KSAvIDIpIHwgMDtcblxuXHRcdFx0bWlkU3RvcCA9IHRoaXMucHJlZml4U3VtW21pZF07XG5cdFx0XHRtaWRTdGFydCA9IG1pZFN0b3AgLSB0aGlzLnZhbHVlc1ttaWRdO1xuXG5cdFx0XHRpZiAoc3VtIDwgbWlkU3RhcnQpIHtcblx0XHRcdFx0aGlnaCA9IG1pZCAtIDE7XG5cdFx0XHR9IGVsc2UgaWYgKHN1bSA+PSBtaWRTdG9wKSB7XG5cdFx0XHRcdGxvdyA9IG1pZCArIDE7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFByZWZpeFN1bUluZGV4T2ZSZXN1bHQobWlkLCBzdW0gLSBtaWRTdGFydCk7XG5cdH1cbn1cblxuLyoqXG4gKiB7QGxpbmsgZ2V0SW5kZXhPZn0gaGFzIGFuIGFtb3J0aXplZCBydW50aW1lIGNvbXBsZXhpdHkgb2YgTygxKS5cbiAqXG4gKiAoe0BsaW5rIFByZWZpeFN1bUNvbXB1dGVyLmdldEluZGV4T2Z9IGlzIGp1c3QgIE8obG9nIG4pKVxuKi9cbmV4cG9ydCBjbGFzcyBDb25zdGFudFRpbWVQcmVmaXhTdW1Db21wdXRlciB7XG5cdHByaXZhdGUgX3ZhbHVlczogbnVtYmVyW107XG5cdHByaXZhdGUgX2lzVmFsaWQ6IGJvb2xlYW47XG5cdHByaXZhdGUgX3ZhbGlkRW5kSW5kZXg6IG51bWJlcjtcblxuXHQvKipcblx0ICogX3ByZWZpeFN1bVtpXSA9IFNVTSh2YWx1ZXNbal0pLCAwIDw9IGogPD0gaVxuXHQgKi9cblx0cHJpdmF0ZSBfcHJlZml4U3VtOiBudW1iZXJbXTtcblxuXHQvKipcblx0ICogX2luZGV4QnlTdW1bc3VtXSA9IGlkeCA9PiBfcHJlZml4U3VtW2lkeCAtIDFdIDw9IHN1bSA8IF9wcmVmaXhTdW1baWR4XVxuXHQqL1xuXHRwcml2YXRlIF9pbmRleEJ5U3VtOiBudW1iZXJbXTtcblxuXHRjb25zdHJ1Y3Rvcih2YWx1ZXM6IG51bWJlcltdKSB7XG5cdFx0dGhpcy5fdmFsdWVzID0gdmFsdWVzO1xuXHRcdHRoaXMuX2lzVmFsaWQgPSBmYWxzZTtcblx0XHR0aGlzLl92YWxpZEVuZEluZGV4ID0gLTE7XG5cdFx0dGhpcy5fcHJlZml4U3VtID0gW107XG5cdFx0dGhpcy5faW5kZXhCeVN1bSA9IFtdO1xuXHR9XG5cblx0LyoqXG5cdCAqIEByZXR1cm5zIFNVTSgwIDw9IGogPCB2YWx1ZXMubGVuZ3RoLCB2YWx1ZXNbal0pXG5cdCAqL1xuXHRwdWJsaWMgZ2V0VG90YWxTdW0oKTogbnVtYmVyIHtcblx0XHR0aGlzLl9lbnN1cmVWYWxpZCgpO1xuXHRcdHJldHVybiB0aGlzLl9pbmRleEJ5U3VtLmxlbmd0aDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBzdW0gb2YgdGhlIGZpcnN0IGBjb3VudGAgbWFueSBpdGVtcy5cblx0ICogQHJldHVybnMgYFNVTSgwIDw9IGogPCBjb3VudCwgdmFsdWVzW2pdKWAuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0UHJlZml4U3VtKGNvdW50OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHRoaXMuX2Vuc3VyZVZhbGlkKCk7XG5cdFx0aWYgKGNvdW50ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3ByZWZpeFN1bVtjb3VudCAtIDFdO1xuXHR9XG5cblx0LyoqXG5cdCAqIEByZXR1cm5zIGByZXN1bHRgLCBzdWNoIHRoYXQgYGdldFByZWZpeFN1bShyZXN1bHQuaW5kZXgpICsgcmVzdWx0LnJlbWFpbmRlciA9IHN1bWBcblx0ICovXG5cdHB1YmxpYyBnZXRJbmRleE9mKHN1bTogbnVtYmVyKTogUHJlZml4U3VtSW5kZXhPZlJlc3VsdCB7XG5cdFx0dGhpcy5fZW5zdXJlVmFsaWQoKTtcblx0XHRjb25zdCBpZHggPSB0aGlzLl9pbmRleEJ5U3VtW3N1bV07XG5cdFx0aWYgKGlkeCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHQvLyBzdW0gZG9lcyBub3QgaGF2ZSBhIGRpcmVjdCBlbnRyeSBpbiBfaW5kZXhCeVN1bSAoZS5nLiBzdW0gPj0gZ2V0VG90YWxTdW0oKSBvciB0aGUgYXJyYXkgaXMgZW1wdHkgLyBhbGwgdmFsdWVzIGFyZSB6ZXJvKVxuXHRcdFx0Y29uc3QgbGFzdElkeCA9IE1hdGgubWF4KDAsIHRoaXMuX3ZhbHVlcy5sZW5ndGggLSAxKTtcblx0XHRcdGNvbnN0IGxhc3RQcmVmaXhTdW0gPSBsYXN0SWR4ID4gMCA/IHRoaXMuX3ByZWZpeFN1bVtsYXN0SWR4IC0gMV0gOiAwO1xuXHRcdFx0cmV0dXJuIG5ldyBQcmVmaXhTdW1JbmRleE9mUmVzdWx0KGxhc3RJZHgsIHN1bSAtIGxhc3RQcmVmaXhTdW0pO1xuXHRcdH1cblx0XHRjb25zdCB2aWV3TGluZXNBYm92ZSA9IGlkeCA+IDAgPyB0aGlzLl9wcmVmaXhTdW1baWR4IC0gMV0gOiAwO1xuXHRcdHJldHVybiBuZXcgUHJlZml4U3VtSW5kZXhPZlJlc3VsdChpZHgsIHN1bSAtIHZpZXdMaW5lc0Fib3ZlKTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVWYWx1ZXMoc3RhcnQ6IG51bWJlciwgZGVsZXRlQ291bnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3ZhbHVlcy5zcGxpY2Uoc3RhcnQsIGRlbGV0ZUNvdW50KTtcblx0XHR0aGlzLl9pbnZhbGlkYXRlKHN0YXJ0KTtcblx0fVxuXG5cdHB1YmxpYyBpbnNlcnRWYWx1ZXMoaW5zZXJ0SW5kZXg6IG51bWJlciwgaW5zZXJ0QXJyOiBudW1iZXJbXSk6IHZvaWQge1xuXHRcdHRoaXMuX3ZhbHVlcyA9IGFycmF5SW5zZXJ0KHRoaXMuX3ZhbHVlcywgaW5zZXJ0SW5kZXgsIGluc2VydEFycik7XG5cdFx0dGhpcy5faW52YWxpZGF0ZShpbnNlcnRJbmRleCk7XG5cdH1cblxuXHRwcml2YXRlIF9pbnZhbGlkYXRlKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9pc1ZhbGlkID0gZmFsc2U7XG5cdFx0dGhpcy5fdmFsaWRFbmRJbmRleCA9IE1hdGgubWluKHRoaXMuX3ZhbGlkRW5kSW5kZXgsIGluZGV4IC0gMSk7XG5cdH1cblxuXHRwcml2YXRlIF9lbnN1cmVWYWxpZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNWYWxpZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSB0aGlzLl92YWxpZEVuZEluZGV4ICsgMSwgbGVuID0gdGhpcy5fdmFsdWVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX3ZhbHVlc1tpXTtcblx0XHRcdGNvbnN0IHN1bUFib3ZlID0gaSA+IDAgPyB0aGlzLl9wcmVmaXhTdW1baSAtIDFdIDogMDtcblxuXHRcdFx0dGhpcy5fcHJlZml4U3VtW2ldID0gc3VtQWJvdmUgKyB2YWx1ZTtcblx0XHRcdGZvciAobGV0IGogPSAwOyBqIDwgdmFsdWU7IGorKykge1xuXHRcdFx0XHR0aGlzLl9pbmRleEJ5U3VtW3N1bUFib3ZlICsgal0gPSBpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHRyaW0gdGhpbmdzXG5cdFx0dGhpcy5fcHJlZml4U3VtLmxlbmd0aCA9IHRoaXMuX3ZhbHVlcy5sZW5ndGg7XG5cdFx0dGhpcy5faW5kZXhCeVN1bS5sZW5ndGggPSB0aGlzLl92YWx1ZXMubGVuZ3RoID4gMCA/IHRoaXMuX3ByZWZpeFN1bVt0aGlzLl92YWx1ZXMubGVuZ3RoIC0gMV0gOiAwO1xuXG5cdFx0Ly8gbWFyayBhcyB2YWxpZFxuXHRcdHRoaXMuX2lzVmFsaWQgPSB0cnVlO1xuXHRcdHRoaXMuX3ZhbGlkRW5kSW5kZXggPSB0aGlzLl92YWx1ZXMubGVuZ3RoIC0gMTtcblx0fVxuXG5cdHB1YmxpYyBzZXRWYWx1ZShpbmRleDogbnVtYmVyLCB2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3ZhbHVlc1tpbmRleF0gPT09IHZhbHVlKSB7XG5cdFx0XHQvLyBubyBjaGFuZ2Vcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdmFsdWVzW2luZGV4XSA9IHZhbHVlO1xuXHRcdHRoaXMuX2ludmFsaWRhdGUoaW5kZXgpO1xuXHR9XG59XG5cblxuZXhwb3J0IGNsYXNzIFByZWZpeFN1bUluZGV4T2ZSZXN1bHQge1xuXHRfcHJlZml4U3VtSW5kZXhPZlJlc3VsdEJyYW5kOiB2b2lkID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBpbmRleDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSByZW1haW5kZXI6IG51bWJlclxuXHQpIHtcblx0XHR0aGlzLmluZGV4ID0gaW5kZXg7XG5cdFx0dGhpcy5yZW1haW5kZXIgPSByZW1haW5kZXI7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JB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LFdBQU8sSUFBSSx1QkFBdUIsS0FBSyxNQUFNLGNBQWM7QUFBQSxFQUM1RDtBQUFBLEVBRU8sYUFBYSxPQUFlLGFBQTJCO0FBQzdELFNBQUssUUFBUSxPQUFPLE9BQU8sV0FBVztBQUN0QyxTQUFLLFlBQVksS0FBSztBQUFBLEVBQ3ZCO0FBQUEsRUFFTyxhQUFhLGFBQXFCLFdBQTJCO0FBQ25FLFNBQUssVUFBVSxZQUFZLEtBQUssU0FBUyxhQUFhLFNBQVM7QUFDL0QsU0FBSyxZQUFZLFdBQVc7QUFBQSxFQUM3QjtBQUFBLEVBRVEsWUFBWSxPQUFxQjtBQUN4QyxTQUFLLFdBQVc7QUFDaEIsU0FBSyxpQkFBaUIsS0FBSyxJQUFJLEtBQUssZ0JBQWdCLFFBQVEsQ0FBQztBQUFBLEVBQzlEO0FBQUEsRUFFUSxlQUFxQjtBQUM1QixRQUFJLEtBQUssVUFBVTtBQUNsQjtBQUFBLElBQ0Q7QUFFQSxhQUFTLElBQUksS0FBSyxpQkFBaUIsR0FBRyxNQUFNLEtBQUssUUFBUSxRQUFRLElBQUksS0FBSyxLQUFLO0FBQzlFLFlBQU0sUUFBUSxLQUFLLFFBQVEsQ0FBQztBQUM1QixZQUFNLFdBQVcsSUFBSSxJQUFJLEtBQUssV0FBVyxJQUFJLENBQUMsSUFBSTtBQUVsRCxXQUFLLFdBQVcsQ0FBQyxJQUFJLFdBQVc7QUFDaEMsZUFBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLEtBQUs7QUFDL0IsYUFBSyxZQUFZLFdBQVcsQ0FBQyxJQUFJO0FBQUEsTUFDbEM7QUFBQSxJQUNEO0FBR0EsU0FBSyxXQUFXLFNBQVMsS0FBSyxRQUFRO0FBQ3RDLFNBQUssWUFBWSxTQUFTLEtBQUssUUFBUSxTQUFTLElBQUksS0FBSyxXQUFXLEtBQUssUUFBUSxTQUFTLENBQUMsSUFBSTtBQUcvRixTQUFLLFdBQVc7QUFDaEIsU0FBSyxpQkFBaUIsS0FBSyxRQUFRLFNBQVM7QUFBQSxFQUM3QztBQUFBLEVBRU8sU0FBUyxPQUFlLE9BQXFCO0FBQ25ELFFBQUksS0FBSyxRQUFRLEtBQUssTUFBTSxPQUFPO0FBRWxDO0FBQUEsSUFDRDtBQUNBLFNBQUssUUFBUSxLQUFLLElBQUk7QUFDdEIsU0FBSyxZQUFZLEtBQUs7QUFBQSxFQUN2QjtBQUNEO0FBR08sTUFBTSx1QkFBdUI7QUFBQSxFQUduQyxZQUNpQixPQUNBLFdBQ2Y7QUFGZTtBQUNBO0FBSmpCLHdDQUFxQztBQU1wQyxTQUFLLFFBQVE7QUFDYixTQUFLLFlBQVk7QUFBQSxFQUNsQjtBQUNEOyIsCiAgIm5hbWVzIjogW10KfQo=
