import { sumBy } from "../../../../base/common/arrays.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { OffsetRange } from "../ranges/offsetRange.js";
class BaseEdit {
  constructor(replacements) {
    this.replacements = replacements;
    let lastEndEx = -1;
    for (const replacement of replacements) {
      if (!(replacement.replaceRange.start >= lastEndEx)) {
        throw new BugIndicatingError(`Edits must be disjoint and sorted. Found ${replacement} after ${lastEndEx}`);
      }
      lastEndEx = replacement.replaceRange.endExclusive;
    }
  }
  /**
   * Returns true if and only if this edit and the given edit are structurally equal.
   * Note that this does not mean that the edits have the same effect on a given input!
   * See `.normalize()` or `.normalizeOnBase(base)` for that.
  */
  equals(other) {
    if (this.replacements.length !== other.replacements.length) {
      return false;
    }
    for (let i = 0; i < this.replacements.length; i++) {
      if (!this.replacements[i].equals(other.replacements[i])) {
        return false;
      }
    }
    return true;
  }
  toString() {
    const edits = this.replacements.map((e) => e.toString()).join(", ");
    return `[${edits}]`;
  }
  /**
   * Normalizes the edit by removing empty replacements and joining touching replacements (if the replacements allow joining).
   * Two edits have an equal normalized edit if and only if they have the same effect on any input.
   *
   * ![](https://raw.githubusercontent.com/microsoft/vscode/refs/heads/main/src/vs/editor/common/core/edits/docs/BaseEdit_normalize.drawio.png)
   *
   * Invariant:
   * ```
   * (forall base: TEdit.apply(base).equals(other.apply(base))) <-> this.normalize().equals(other.normalize())
   * ```
   * and
   * ```
   * forall base: TEdit.apply(base).equals(this.normalize().apply(base))
   * ```
   *
   */
  normalize() {
    const newReplacements = [];
    let lastReplacement;
    for (const r of this.replacements) {
      if (r.getNewLength() === 0 && r.replaceRange.length === 0) {
        continue;
      }
      if (lastReplacement && lastReplacement.replaceRange.endExclusive === r.replaceRange.start) {
        const joined = lastReplacement.tryJoinTouching(r);
        if (joined) {
          lastReplacement = joined;
          continue;
        }
      }
      if (lastReplacement) {
        newReplacements.push(lastReplacement);
      }
      lastReplacement = r;
    }
    if (lastReplacement) {
      newReplacements.push(lastReplacement);
    }
    return this._createNew(newReplacements);
  }
  /**
   * Combines two edits into one with the same effect.
   *
   * ![](https://raw.githubusercontent.com/microsoft/vscode/refs/heads/main/src/vs/editor/common/core/edits/docs/BaseEdit_compose.drawio.png)
   *
   * Invariant:
   * ```
   * other.apply(this.apply(s0)) = this.compose(other).apply(s0)
   * ```
   */
  compose(other) {
    const edits1 = this.normalize();
    const edits2 = other.normalize();
    if (edits1.isEmpty()) {
      return edits2;
    }
    if (edits2.isEmpty()) {
      return edits1;
    }
    const edit1Queue = [...edits1.replacements];
    const result = [];
    let edit1ToEdit2 = 0;
    for (const r2 of edits2.replacements) {
      while (true) {
        const r1 = edit1Queue[0];
        if (!r1 || r1.replaceRange.start + edit1ToEdit2 + r1.getNewLength() >= r2.replaceRange.start) {
          break;
        }
        edit1Queue.shift();
        result.push(r1);
        edit1ToEdit2 += r1.getNewLength() - r1.replaceRange.length;
      }
      const firstEdit1ToEdit2 = edit1ToEdit2;
      let firstIntersecting;
      let lastIntersecting;
      while (true) {
        const r1 = edit1Queue[0];
        if (!r1 || r1.replaceRange.start + edit1ToEdit2 > r2.replaceRange.endExclusive) {
          break;
        }
        if (!firstIntersecting) {
          firstIntersecting = r1;
        }
        lastIntersecting = r1;
        edit1Queue.shift();
        edit1ToEdit2 += r1.getNewLength() - r1.replaceRange.length;
      }
      if (!firstIntersecting) {
        result.push(r2.delta(-edit1ToEdit2));
      } else {
        const newReplaceRangeStart = Math.min(firstIntersecting.replaceRange.start, r2.replaceRange.start - firstEdit1ToEdit2);
        const prefixLength = r2.replaceRange.start - (firstIntersecting.replaceRange.start + firstEdit1ToEdit2);
        if (prefixLength > 0) {
          const prefix = firstIntersecting.slice(OffsetRange.emptyAt(newReplaceRangeStart), new OffsetRange(0, prefixLength));
          result.push(prefix);
        }
        if (!lastIntersecting) {
          throw new BugIndicatingError(`Invariant violation: lastIntersecting is undefined`);
        }
        const suffixLength = lastIntersecting.replaceRange.endExclusive + edit1ToEdit2 - r2.replaceRange.endExclusive;
        if (suffixLength > 0) {
          const e = lastIntersecting.slice(
            OffsetRange.ofStartAndLength(lastIntersecting.replaceRange.endExclusive, 0),
            new OffsetRange(lastIntersecting.getNewLength() - suffixLength, lastIntersecting.getNewLength())
          );
          edit1Queue.unshift(e);
          edit1ToEdit2 -= e.getNewLength() - e.replaceRange.length;
        }
        const newReplaceRange = new OffsetRange(
          newReplaceRangeStart,
          r2.replaceRange.endExclusive - edit1ToEdit2
        );
        const middle = r2.slice(newReplaceRange, new OffsetRange(0, r2.getNewLength()));
        result.push(middle);
      }
    }
    while (true) {
      const item = edit1Queue.shift();
      if (!item) {
        break;
      }
      result.push(item);
    }
    return this._createNew(result).normalize();
  }
  decomposeSplit(shouldBeInE1) {
    const e1 = [];
    const e2 = [];
    let e2delta = 0;
    for (const edit of this.replacements) {
      if (shouldBeInE1(edit)) {
        e1.push(edit);
        e2delta += edit.getNewLength() - edit.replaceRange.length;
      } else {
        e2.push(edit.slice(edit.replaceRange.delta(e2delta), new OffsetRange(0, edit.getNewLength())));
      }
    }
    return { e1: this._createNew(e1), e2: this._createNew(e2) };
  }
  /**
   * Returns the range of each replacement in the applied value.
  */
  getNewRanges() {
    const ranges = [];
    let offset = 0;
    for (const e of this.replacements) {
      ranges.push(OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.getNewLength()));
      offset += e.getLengthDelta();
    }
    return ranges;
  }
  getJoinedReplaceRange() {
    if (this.replacements.length === 0) {
      return void 0;
    }
    return this.replacements[0].replaceRange.join(this.replacements.at(-1).replaceRange);
  }
  isEmpty() {
    return this.replacements.length === 0;
  }
  getLengthDelta() {
    return sumBy(this.replacements, (replacement) => replacement.getLengthDelta());
  }
  getNewDataLength(dataLength) {
    return dataLength + this.getLengthDelta();
  }
  applyToOffset(originalOffset) {
    let accumulatedDelta = 0;
    for (const r of this.replacements) {
      if (r.replaceRange.start <= originalOffset) {
        if (originalOffset < r.replaceRange.endExclusive) {
          return r.replaceRange.start + accumulatedDelta;
        }
        accumulatedDelta += r.getNewLength() - r.replaceRange.length;
      } else {
        break;
      }
    }
    return originalOffset + accumulatedDelta;
  }
  applyToOffsetRange(originalRange) {
    return new OffsetRange(
      this.applyToOffset(originalRange.start),
      this.applyToOffset(originalRange.endExclusive)
    );
  }
  applyInverseToOffset(postEditsOffset) {
    let accumulatedDelta = 0;
    for (const edit of this.replacements) {
      const editLength = edit.getNewLength();
      if (edit.replaceRange.start <= postEditsOffset - accumulatedDelta) {
        if (postEditsOffset - accumulatedDelta < edit.replaceRange.start + editLength) {
          return edit.replaceRange.start;
        }
        accumulatedDelta += editLength - edit.replaceRange.length;
      } else {
        break;
      }
    }
    return postEditsOffset - accumulatedDelta;
  }
  /**
   * Return undefined if the originalOffset is within an edit
   */
  applyToOffsetOrUndefined(originalOffset) {
    let accumulatedDelta = 0;
    for (const edit of this.replacements) {
      if (edit.replaceRange.start <= originalOffset) {
        if (originalOffset < edit.replaceRange.endExclusive) {
          return void 0;
        }
        accumulatedDelta += edit.getNewLength() - edit.replaceRange.length;
      } else {
        break;
      }
    }
    return originalOffset + accumulatedDelta;
  }
  /**
   * Return undefined if the originalRange is within an edit
   */
  applyToOffsetRangeOrUndefined(originalRange) {
    const start = this.applyToOffsetOrUndefined(originalRange.start);
    if (start === void 0) {
      return void 0;
    }
    const end = this.applyToOffsetOrUndefined(originalRange.endExclusive);
    if (end === void 0) {
      return void 0;
    }
    return new OffsetRange(start, end);
  }
}
class BaseReplacement {
  constructor(replaceRange) {
    this.replaceRange = replaceRange;
  }
  delta(offset) {
    return this.slice(this.replaceRange.delta(offset), new OffsetRange(0, this.getNewLength()));
  }
  getLengthDelta() {
    return this.getNewLength() - this.replaceRange.length;
  }
  toString() {
    return `{ ${this.replaceRange.toString()} -> ${this.getNewLength()} }`;
  }
  get isEmpty() {
    return this.getNewLength() === 0 && this.replaceRange.length === 0;
  }
  getRangeAfterReplace() {
    return new OffsetRange(this.replaceRange.start, this.replaceRange.start + this.getNewLength());
  }
}
const _Edit = class _Edit extends BaseEdit {
  static create(replacements) {
    return new _Edit(replacements);
  }
  static single(replacement) {
    return new _Edit([replacement]);
  }
  _createNew(replacements) {
    return new _Edit(replacements);
  }
};
/**
 * Represents a set of edits to a string.
 * All these edits are applied at once.
*/
_Edit.empty = new _Edit([]);
let Edit = _Edit;
class AnnotationReplacement extends BaseReplacement {
  constructor(range, newLength, annotation) {
    super(range);
    this.newLength = newLength;
    this.annotation = annotation;
  }
  equals(other) {
    return this.replaceRange.equals(other.replaceRange) && this.newLength === other.newLength && this.annotation === other.annotation;
  }
  getNewLength() {
    return this.newLength;
  }
  tryJoinTouching(other) {
    if (this.annotation !== other.annotation) {
      return void 0;
    }
    return new AnnotationReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newLength + other.newLength, this.annotation);
  }
  slice(range, rangeInReplacement) {
    return new AnnotationReplacement(range, rangeInReplacement ? rangeInReplacement.length : this.newLength, this.annotation);
  }
}
export {
  AnnotationReplacement,
  BaseEdit,
  BaseReplacement,
  Edit
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vY29yZS9lZGl0cy9lZGl0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgc3VtQnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcblxuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBCYXNlRWRpdDxUIGV4dGVuZHMgQmFzZVJlcGxhY2VtZW50PFQ+ID0gQmFzZVJlcGxhY2VtZW50PGFueT4sIFRFZGl0IGV4dGVuZHMgQmFzZUVkaXQ8VCwgVEVkaXQ+ID0gQmFzZUVkaXQ8VCwgYW55Pj4ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcmVwbGFjZW1lbnRzOiByZWFkb25seSBUW10sXG5cdCkge1xuXHRcdGxldCBsYXN0RW5kRXggPSAtMTtcblx0XHRmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIHJlcGxhY2VtZW50cykge1xuXHRcdFx0aWYgKCEocmVwbGFjZW1lbnQucmVwbGFjZVJhbmdlLnN0YXJ0ID49IGxhc3RFbmRFeCkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcihgRWRpdHMgbXVzdCBiZSBkaXNqb2ludCBhbmQgc29ydGVkLiBGb3VuZCAke3JlcGxhY2VtZW50fSBhZnRlciAke2xhc3RFbmRFeH1gKTtcblx0XHRcdH1cblx0XHRcdGxhc3RFbmRFeCA9IHJlcGxhY2VtZW50LnJlcGxhY2VSYW5nZS5lbmRFeGNsdXNpdmU7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9jcmVhdGVOZXcocmVwbGFjZW1lbnRzOiByZWFkb25seSBUW10pOiBURWRpdDtcblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIGFuZCBvbmx5IGlmIHRoaXMgZWRpdCBhbmQgdGhlIGdpdmVuIGVkaXQgYXJlIHN0cnVjdHVyYWxseSBlcXVhbC5cblx0ICogTm90ZSB0aGF0IHRoaXMgZG9lcyBub3QgbWVhbiB0aGF0IHRoZSBlZGl0cyBoYXZlIHRoZSBzYW1lIGVmZmVjdCBvbiBhIGdpdmVuIGlucHV0IVxuXHQgKiBTZWUgYC5ub3JtYWxpemUoKWAgb3IgYC5ub3JtYWxpemVPbkJhc2UoYmFzZSlgIGZvciB0aGF0LlxuXHQqL1xuXHRwdWJsaWMgZXF1YWxzKG90aGVyOiBURWRpdCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLnJlcGxhY2VtZW50cy5sZW5ndGggIT09IG90aGVyLnJlcGxhY2VtZW50cy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLnJlcGxhY2VtZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0aWYgKCF0aGlzLnJlcGxhY2VtZW50c1tpXS5lcXVhbHMob3RoZXIucmVwbGFjZW1lbnRzW2ldKSkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIHRvU3RyaW5nKCkge1xuXHRcdGNvbnN0IGVkaXRzID0gdGhpcy5yZXBsYWNlbWVudHMubWFwKGUgPT4gZS50b1N0cmluZygpKS5qb2luKCcsICcpO1xuXHRcdHJldHVybiBgWyR7ZWRpdHN9XWA7XG5cdH1cblxuXHQvKipcblx0ICogTm9ybWFsaXplcyB0aGUgZWRpdCBieSByZW1vdmluZyBlbXB0eSByZXBsYWNlbWVudHMgYW5kIGpvaW5pbmcgdG91Y2hpbmcgcmVwbGFjZW1lbnRzIChpZiB0aGUgcmVwbGFjZW1lbnRzIGFsbG93IGpvaW5pbmcpLlxuXHQgKiBUd28gZWRpdHMgaGF2ZSBhbiBlcXVhbCBub3JtYWxpemVkIGVkaXQgaWYgYW5kIG9ubHkgaWYgdGhleSBoYXZlIHRoZSBzYW1lIGVmZmVjdCBvbiBhbnkgaW5wdXQuXG5cdCAqXG5cdCAqICFbXShodHRwczovL3Jhdy5naXRodWJ1c2VyY29udGVudC5jb20vbWljcm9zb2Z0L3ZzY29kZS9yZWZzL2hlYWRzL21haW4vc3JjL3ZzL2VkaXRvci9jb21tb24vY29yZS9lZGl0cy9kb2NzL0Jhc2VFZGl0X25vcm1hbGl6ZS5kcmF3aW8ucG5nKVxuXHQgKlxuXHQgKiBJbnZhcmlhbnQ6XG5cdCAqIGBgYFxuXHQgKiAoZm9yYWxsIGJhc2U6IFRFZGl0LmFwcGx5KGJhc2UpLmVxdWFscyhvdGhlci5hcHBseShiYXNlKSkpIDwtPiB0aGlzLm5vcm1hbGl6ZSgpLmVxdWFscyhvdGhlci5ub3JtYWxpemUoKSlcblx0ICogYGBgXG5cdCAqIGFuZFxuXHQgKiBgYGBcblx0ICogZm9yYWxsIGJhc2U6IFRFZGl0LmFwcGx5KGJhc2UpLmVxdWFscyh0aGlzLm5vcm1hbGl6ZSgpLmFwcGx5KGJhc2UpKVxuXHQgKiBgYGBcblx0ICpcblx0ICovXG5cdHB1YmxpYyBub3JtYWxpemUoKTogVEVkaXQge1xuXHRcdGNvbnN0IG5ld1JlcGxhY2VtZW50czogVFtdID0gW107XG5cdFx0bGV0IGxhc3RSZXBsYWNlbWVudDogVCB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IHIgb2YgdGhpcy5yZXBsYWNlbWVudHMpIHtcblx0XHRcdGlmIChyLmdldE5ld0xlbmd0aCgpID09PSAwICYmIHIucmVwbGFjZVJhbmdlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChsYXN0UmVwbGFjZW1lbnQgJiYgbGFzdFJlcGxhY2VtZW50LnJlcGxhY2VSYW5nZS5lbmRFeGNsdXNpdmUgPT09IHIucmVwbGFjZVJhbmdlLnN0YXJ0KSB7XG5cdFx0XHRcdGNvbnN0IGpvaW5lZCA9IGxhc3RSZXBsYWNlbWVudC50cnlKb2luVG91Y2hpbmcocik7XG5cdFx0XHRcdGlmIChqb2luZWQpIHtcblx0XHRcdFx0XHRsYXN0UmVwbGFjZW1lbnQgPSBqb2luZWQ7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGxhc3RSZXBsYWNlbWVudCkge1xuXHRcdFx0XHRuZXdSZXBsYWNlbWVudHMucHVzaChsYXN0UmVwbGFjZW1lbnQpO1xuXHRcdFx0fVxuXHRcdFx0bGFzdFJlcGxhY2VtZW50ID0gcjtcblx0XHR9XG5cblx0XHRpZiAobGFzdFJlcGxhY2VtZW50KSB7XG5cdFx0XHRuZXdSZXBsYWNlbWVudHMucHVzaChsYXN0UmVwbGFjZW1lbnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlTmV3KG5ld1JlcGxhY2VtZW50cyk7XG5cdH1cblxuXHQvKipcblx0ICogQ29tYmluZXMgdHdvIGVkaXRzIGludG8gb25lIHdpdGggdGhlIHNhbWUgZWZmZWN0LlxuXHQgKlxuXHQgKiAhW10oaHR0cHM6Ly9yYXcuZ2l0aHVidXNlcmNvbnRlbnQuY29tL21pY3Jvc29mdC92c2NvZGUvcmVmcy9oZWFkcy9tYWluL3NyYy92cy9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdHMvZG9jcy9CYXNlRWRpdF9jb21wb3NlLmRyYXdpby5wbmcpXG5cdCAqXG5cdCAqIEludmFyaWFudDpcblx0ICogYGBgXG5cdCAqIG90aGVyLmFwcGx5KHRoaXMuYXBwbHkoczApKSA9IHRoaXMuY29tcG9zZShvdGhlcikuYXBwbHkoczApXG5cdCAqIGBgYFxuXHQgKi9cblx0cHVibGljIGNvbXBvc2Uob3RoZXI6IFRFZGl0KTogVEVkaXQge1xuXHRcdGNvbnN0IGVkaXRzMSA9IHRoaXMubm9ybWFsaXplKCk7XG5cdFx0Y29uc3QgZWRpdHMyID0gb3RoZXIubm9ybWFsaXplKCk7XG5cblx0XHRpZiAoZWRpdHMxLmlzRW1wdHkoKSkgeyByZXR1cm4gZWRpdHMyOyB9XG5cdFx0aWYgKGVkaXRzMi5pc0VtcHR5KCkpIHsgcmV0dXJuIGVkaXRzMTsgfVxuXG5cdFx0Y29uc3QgZWRpdDFRdWV1ZSA9IFsuLi5lZGl0czEucmVwbGFjZW1lbnRzXTtcblx0XHRjb25zdCByZXN1bHQ6IFRbXSA9IFtdO1xuXG5cdFx0bGV0IGVkaXQxVG9FZGl0MiA9IDA7XG5cblx0XHRmb3IgKGNvbnN0IHIyIG9mIGVkaXRzMi5yZXBsYWNlbWVudHMpIHtcblx0XHRcdC8vIENvcHkgb3ZlciBlZGl0MSB1bm1vZGlmaWVkIHVudGlsIGl0IHRvdWNoZXMgZWRpdDIuXG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjb25zdCByMSA9IGVkaXQxUXVldWVbMF07XG5cdFx0XHRcdGlmICghcjEgfHwgcjEucmVwbGFjZVJhbmdlLnN0YXJ0ICsgZWRpdDFUb0VkaXQyICsgcjEuZ2V0TmV3TGVuZ3RoKCkgPj0gcjIucmVwbGFjZVJhbmdlLnN0YXJ0KSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWRpdDFRdWV1ZS5zaGlmdCgpO1xuXG5cdFx0XHRcdHJlc3VsdC5wdXNoKHIxKTtcblx0XHRcdFx0ZWRpdDFUb0VkaXQyICs9IHIxLmdldE5ld0xlbmd0aCgpIC0gcjEucmVwbGFjZVJhbmdlLmxlbmd0aDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZmlyc3RFZGl0MVRvRWRpdDIgPSBlZGl0MVRvRWRpdDI7XG5cdFx0XHRsZXQgZmlyc3RJbnRlcnNlY3Rpbmc6IFQgfCB1bmRlZmluZWQ7IC8vIG9yIHRvdWNoaW5nXG5cdFx0XHRsZXQgbGFzdEludGVyc2VjdGluZzogVCB8IHVuZGVmaW5lZDsgLy8gb3IgdG91Y2hpbmdcblxuXHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0Y29uc3QgcjEgPSBlZGl0MVF1ZXVlWzBdO1xuXHRcdFx0XHRpZiAoIXIxIHx8IHIxLnJlcGxhY2VSYW5nZS5zdGFydCArIGVkaXQxVG9FZGl0MiA+IHIyLnJlcGxhY2VSYW5nZS5lbmRFeGNsdXNpdmUpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBlbHNlIHdlIGludGVyc2VjdCwgYmVjYXVzZSB0aGUgbmV3IGVuZCBvZiBlZGl0MSBpcyBhZnRlciBvciBlcXVhbCB0byBvdXIgc3RhcnRcblxuXHRcdFx0XHRpZiAoIWZpcnN0SW50ZXJzZWN0aW5nKSB7XG5cdFx0XHRcdFx0Zmlyc3RJbnRlcnNlY3RpbmcgPSByMTtcblx0XHRcdFx0fVxuXHRcdFx0XHRsYXN0SW50ZXJzZWN0aW5nID0gcjE7XG5cdFx0XHRcdGVkaXQxUXVldWUuc2hpZnQoKTtcblxuXHRcdFx0XHRlZGl0MVRvRWRpdDIgKz0gcjEuZ2V0TmV3TGVuZ3RoKCkgLSByMS5yZXBsYWNlUmFuZ2UubGVuZ3RoO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWZpcnN0SW50ZXJzZWN0aW5nKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKHIyLmRlbHRhKC1lZGl0MVRvRWRpdDIpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG5ld1JlcGxhY2VSYW5nZVN0YXJ0ID0gTWF0aC5taW4oZmlyc3RJbnRlcnNlY3RpbmcucmVwbGFjZVJhbmdlLnN0YXJ0LCByMi5yZXBsYWNlUmFuZ2Uuc3RhcnQgLSBmaXJzdEVkaXQxVG9FZGl0Mik7XG5cblx0XHRcdFx0Y29uc3QgcHJlZml4TGVuZ3RoID0gcjIucmVwbGFjZVJhbmdlLnN0YXJ0IC0gKGZpcnN0SW50ZXJzZWN0aW5nLnJlcGxhY2VSYW5nZS5zdGFydCArIGZpcnN0RWRpdDFUb0VkaXQyKTtcblx0XHRcdFx0aWYgKHByZWZpeExlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBwcmVmaXggPSBmaXJzdEludGVyc2VjdGluZy5zbGljZShPZmZzZXRSYW5nZS5lbXB0eUF0KG5ld1JlcGxhY2VSYW5nZVN0YXJ0KSwgbmV3IE9mZnNldFJhbmdlKDAsIHByZWZpeExlbmd0aCkpO1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKHByZWZpeCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFsYXN0SW50ZXJzZWN0aW5nKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcihgSW52YXJpYW50IHZpb2xhdGlvbjogbGFzdEludGVyc2VjdGluZyBpcyB1bmRlZmluZWRgKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBzdWZmaXhMZW5ndGggPSAobGFzdEludGVyc2VjdGluZy5yZXBsYWNlUmFuZ2UuZW5kRXhjbHVzaXZlICsgZWRpdDFUb0VkaXQyKSAtIHIyLnJlcGxhY2VSYW5nZS5lbmRFeGNsdXNpdmU7XG5cdFx0XHRcdGlmIChzdWZmaXhMZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgZSA9IGxhc3RJbnRlcnNlY3Rpbmcuc2xpY2UoXG5cdFx0XHRcdFx0XHRPZmZzZXRSYW5nZS5vZlN0YXJ0QW5kTGVuZ3RoKGxhc3RJbnRlcnNlY3RpbmcucmVwbGFjZVJhbmdlLmVuZEV4Y2x1c2l2ZSwgMCksXG5cdFx0XHRcdFx0XHRuZXcgT2Zmc2V0UmFuZ2UobGFzdEludGVyc2VjdGluZy5nZXROZXdMZW5ndGgoKSAtIHN1ZmZpeExlbmd0aCwgbGFzdEludGVyc2VjdGluZy5nZXROZXdMZW5ndGgoKSlcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdGVkaXQxUXVldWUudW5zaGlmdChlKTtcblx0XHRcdFx0XHRlZGl0MVRvRWRpdDIgLT0gZS5nZXROZXdMZW5ndGgoKSAtIGUucmVwbGFjZVJhbmdlLmxlbmd0aDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG5ld1JlcGxhY2VSYW5nZSA9IG5ldyBPZmZzZXRSYW5nZShcblx0XHRcdFx0XHRuZXdSZXBsYWNlUmFuZ2VTdGFydCxcblx0XHRcdFx0XHRyMi5yZXBsYWNlUmFuZ2UuZW5kRXhjbHVzaXZlIC0gZWRpdDFUb0VkaXQyXG5cdFx0XHRcdCk7XG5cdFx0XHRcdGNvbnN0IG1pZGRsZSA9IHIyLnNsaWNlKG5ld1JlcGxhY2VSYW5nZSwgbmV3IE9mZnNldFJhbmdlKDAsIHIyLmdldE5ld0xlbmd0aCgpKSk7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKG1pZGRsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSBlZGl0MVF1ZXVlLnNoaWZ0KCk7XG5cdFx0XHRpZiAoIWl0ZW0pIHsgYnJlYWs7IH1cblx0XHRcdHJlc3VsdC5wdXNoKGl0ZW0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVOZXcocmVzdWx0KS5ub3JtYWxpemUoKTtcblx0fVxuXG5cdHB1YmxpYyBkZWNvbXBvc2VTcGxpdChzaG91bGRCZUluRTE6IChyZXBsOiBUKSA9PiBib29sZWFuKTogeyBlMTogVEVkaXQ7IGUyOiBURWRpdCB9IHtcblx0XHRjb25zdCBlMTogVFtdID0gW107XG5cdFx0Y29uc3QgZTI6IFRbXSA9IFtdO1xuXG5cdFx0bGV0IGUyZGVsdGEgPSAwO1xuXHRcdGZvciAoY29uc3QgZWRpdCBvZiB0aGlzLnJlcGxhY2VtZW50cykge1xuXHRcdFx0aWYgKHNob3VsZEJlSW5FMShlZGl0KSkge1xuXHRcdFx0XHRlMS5wdXNoKGVkaXQpO1xuXHRcdFx0XHRlMmRlbHRhICs9IGVkaXQuZ2V0TmV3TGVuZ3RoKCkgLSBlZGl0LnJlcGxhY2VSYW5nZS5sZW5ndGg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRlMi5wdXNoKGVkaXQuc2xpY2UoZWRpdC5yZXBsYWNlUmFuZ2UuZGVsdGEoZTJkZWx0YSksIG5ldyBPZmZzZXRSYW5nZSgwLCBlZGl0LmdldE5ld0xlbmd0aCgpKSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4geyBlMTogdGhpcy5fY3JlYXRlTmV3KGUxKSwgZTI6IHRoaXMuX2NyZWF0ZU5ldyhlMikgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSByYW5nZSBvZiBlYWNoIHJlcGxhY2VtZW50IGluIHRoZSBhcHBsaWVkIHZhbHVlLlxuXHQqL1xuXHRwdWJsaWMgZ2V0TmV3UmFuZ2VzKCk6IE9mZnNldFJhbmdlW10ge1xuXHRcdGNvbnN0IHJhbmdlczogT2Zmc2V0UmFuZ2VbXSA9IFtdO1xuXHRcdGxldCBvZmZzZXQgPSAwO1xuXHRcdGZvciAoY29uc3QgZSBvZiB0aGlzLnJlcGxhY2VtZW50cykge1xuXHRcdFx0cmFuZ2VzLnB1c2goT2Zmc2V0UmFuZ2Uub2ZTdGFydEFuZExlbmd0aChlLnJlcGxhY2VSYW5nZS5zdGFydCArIG9mZnNldCwgZS5nZXROZXdMZW5ndGgoKSkpO1xuXHRcdFx0b2Zmc2V0ICs9IGUuZ2V0TGVuZ3RoRGVsdGEoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJhbmdlcztcblx0fVxuXG5cdHB1YmxpYyBnZXRKb2luZWRSZXBsYWNlUmFuZ2UoKTogT2Zmc2V0UmFuZ2UgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLnJlcGxhY2VtZW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnJlcGxhY2VtZW50c1swXS5yZXBsYWNlUmFuZ2Uuam9pbih0aGlzLnJlcGxhY2VtZW50cy5hdCgtMSkhLnJlcGxhY2VSYW5nZSk7XG5cdH1cblxuXHRwdWJsaWMgaXNFbXB0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5yZXBsYWNlbWVudHMubGVuZ3RoID09PSAwO1xuXHR9XG5cblx0cHVibGljIGdldExlbmd0aERlbHRhKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHN1bUJ5KHRoaXMucmVwbGFjZW1lbnRzLCAocmVwbGFjZW1lbnQpID0+IHJlcGxhY2VtZW50LmdldExlbmd0aERlbHRhKCkpO1xuXHR9XG5cblx0cHVibGljIGdldE5ld0RhdGFMZW5ndGgoZGF0YUxlbmd0aDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gZGF0YUxlbmd0aCArIHRoaXMuZ2V0TGVuZ3RoRGVsdGEoKTtcblx0fVxuXG5cdHB1YmxpYyBhcHBseVRvT2Zmc2V0KG9yaWdpbmFsT2Zmc2V0OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGxldCBhY2N1bXVsYXRlZERlbHRhID0gMDtcblx0XHRmb3IgKGNvbnN0IHIgb2YgdGhpcy5yZXBsYWNlbWVudHMpIHtcblx0XHRcdGlmIChyLnJlcGxhY2VSYW5nZS5zdGFydCA8PSBvcmlnaW5hbE9mZnNldCkge1xuXHRcdFx0XHRpZiAob3JpZ2luYWxPZmZzZXQgPCByLnJlcGxhY2VSYW5nZS5lbmRFeGNsdXNpdmUpIHtcblx0XHRcdFx0XHQvLyB0aGUgb2Zmc2V0IGlzIGluIHRoZSByZXBsYWNlZCByYW5nZVxuXHRcdFx0XHRcdHJldHVybiByLnJlcGxhY2VSYW5nZS5zdGFydCArIGFjY3VtdWxhdGVkRGVsdGE7XG5cdFx0XHRcdH1cblx0XHRcdFx0YWNjdW11bGF0ZWREZWx0YSArPSByLmdldE5ld0xlbmd0aCgpIC0gci5yZXBsYWNlUmFuZ2UubGVuZ3RoO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBvcmlnaW5hbE9mZnNldCArIGFjY3VtdWxhdGVkRGVsdGE7XG5cdH1cblxuXHRwdWJsaWMgYXBwbHlUb09mZnNldFJhbmdlKG9yaWdpbmFsUmFuZ2U6IE9mZnNldFJhbmdlKTogT2Zmc2V0UmFuZ2Uge1xuXHRcdHJldHVybiBuZXcgT2Zmc2V0UmFuZ2UoXG5cdFx0XHR0aGlzLmFwcGx5VG9PZmZzZXQob3JpZ2luYWxSYW5nZS5zdGFydCksXG5cdFx0XHR0aGlzLmFwcGx5VG9PZmZzZXQob3JpZ2luYWxSYW5nZS5lbmRFeGNsdXNpdmUpXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyBhcHBseUludmVyc2VUb09mZnNldChwb3N0RWRpdHNPZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0bGV0IGFjY3VtdWxhdGVkRGVsdGEgPSAwO1xuXHRcdGZvciAoY29uc3QgZWRpdCBvZiB0aGlzLnJlcGxhY2VtZW50cykge1xuXHRcdFx0Y29uc3QgZWRpdExlbmd0aCA9IGVkaXQuZ2V0TmV3TGVuZ3RoKCk7XG5cdFx0XHRpZiAoZWRpdC5yZXBsYWNlUmFuZ2Uuc3RhcnQgPD0gcG9zdEVkaXRzT2Zmc2V0IC0gYWNjdW11bGF0ZWREZWx0YSkge1xuXHRcdFx0XHRpZiAocG9zdEVkaXRzT2Zmc2V0IC0gYWNjdW11bGF0ZWREZWx0YSA8IGVkaXQucmVwbGFjZVJhbmdlLnN0YXJ0ICsgZWRpdExlbmd0aCkge1xuXHRcdFx0XHRcdC8vIHRoZSBvZmZzZXQgaXMgaW4gdGhlIHJlcGxhY2VkIHJhbmdlXG5cdFx0XHRcdFx0cmV0dXJuIGVkaXQucmVwbGFjZVJhbmdlLnN0YXJ0O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFjY3VtdWxhdGVkRGVsdGEgKz0gZWRpdExlbmd0aCAtIGVkaXQucmVwbGFjZVJhbmdlLmxlbmd0aDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcG9zdEVkaXRzT2Zmc2V0IC0gYWNjdW11bGF0ZWREZWx0YTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm4gdW5kZWZpbmVkIGlmIHRoZSBvcmlnaW5hbE9mZnNldCBpcyB3aXRoaW4gYW4gZWRpdFxuXHQgKi9cblx0cHVibGljIGFwcGx5VG9PZmZzZXRPclVuZGVmaW5lZChvcmlnaW5hbE9mZnNldDogbnVtYmVyKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgYWNjdW11bGF0ZWREZWx0YSA9IDA7XG5cdFx0Zm9yIChjb25zdCBlZGl0IG9mIHRoaXMucmVwbGFjZW1lbnRzKSB7XG5cdFx0XHRpZiAoZWRpdC5yZXBsYWNlUmFuZ2Uuc3RhcnQgPD0gb3JpZ2luYWxPZmZzZXQpIHtcblx0XHRcdFx0aWYgKG9yaWdpbmFsT2Zmc2V0IDwgZWRpdC5yZXBsYWNlUmFuZ2UuZW5kRXhjbHVzaXZlKSB7XG5cdFx0XHRcdFx0Ly8gdGhlIG9mZnNldCBpcyBpbiB0aGUgcmVwbGFjZWQgcmFuZ2Vcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFjY3VtdWxhdGVkRGVsdGEgKz0gZWRpdC5nZXROZXdMZW5ndGgoKSAtIGVkaXQucmVwbGFjZVJhbmdlLmxlbmd0aDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gb3JpZ2luYWxPZmZzZXQgKyBhY2N1bXVsYXRlZERlbHRhO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybiB1bmRlZmluZWQgaWYgdGhlIG9yaWdpbmFsUmFuZ2UgaXMgd2l0aGluIGFuIGVkaXRcblx0ICovXG5cdHB1YmxpYyBhcHBseVRvT2Zmc2V0UmFuZ2VPclVuZGVmaW5lZChvcmlnaW5hbFJhbmdlOiBPZmZzZXRSYW5nZSk6IE9mZnNldFJhbmdlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzdGFydCA9IHRoaXMuYXBwbHlUb09mZnNldE9yVW5kZWZpbmVkKG9yaWdpbmFsUmFuZ2Uuc3RhcnQpO1xuXHRcdGlmIChzdGFydCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBlbmQgPSB0aGlzLmFwcGx5VG9PZmZzZXRPclVuZGVmaW5lZChvcmlnaW5hbFJhbmdlLmVuZEV4Y2x1c2l2ZSk7XG5cdFx0aWYgKGVuZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IE9mZnNldFJhbmdlKHN0YXJ0LCBlbmQpO1xuXHR9XG59XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBCYXNlUmVwbGFjZW1lbnQ8VFNlbGYgZXh0ZW5kcyBCYXNlUmVwbGFjZW1lbnQ8VFNlbGY+PiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdC8qKlxuXHRcdCAqIFRoZSByYW5nZSB0byBiZSByZXBsYWNlZC5cblx0XHQqL1xuXHRcdHB1YmxpYyByZWFkb25seSByZXBsYWNlUmFuZ2U6IE9mZnNldFJhbmdlLFxuXHQpIHsgfVxuXG5cdHB1YmxpYyBhYnN0cmFjdCBnZXROZXdMZW5ndGgoKTogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBQcmVjb25kaXRpb246IFRFZGl0LnJhbmdlLmVuZEV4Y2x1c2l2ZSA9PT0gb3RoZXIucmFuZ2Uuc3RhcnRcblx0Ki9cblx0cHVibGljIGFic3RyYWN0IHRyeUpvaW5Ub3VjaGluZyhvdGhlcjogVFNlbGYpOiBUU2VsZiB8IHVuZGVmaW5lZDtcblxuXHRwdWJsaWMgYWJzdHJhY3Qgc2xpY2UobmV3UmVwbGFjZVJhbmdlOiBPZmZzZXRSYW5nZSwgcmFuZ2VJblJlcGxhY2VtZW50PzogT2Zmc2V0UmFuZ2UpOiBUU2VsZjtcblxuXHRwdWJsaWMgZGVsdGEob2Zmc2V0OiBudW1iZXIpOiBUU2VsZiB7XG5cdFx0cmV0dXJuIHRoaXMuc2xpY2UodGhpcy5yZXBsYWNlUmFuZ2UuZGVsdGEob2Zmc2V0KSwgbmV3IE9mZnNldFJhbmdlKDAsIHRoaXMuZ2V0TmV3TGVuZ3RoKCkpKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRMZW5ndGhEZWx0YSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLmdldE5ld0xlbmd0aCgpIC0gdGhpcy5yZXBsYWNlUmFuZ2UubGVuZ3RoO1xuXHR9XG5cblx0YWJzdHJhY3QgZXF1YWxzKG90aGVyOiBUU2VsZik6IGJvb2xlYW47XG5cblx0dG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYHsgJHt0aGlzLnJlcGxhY2VSYW5nZS50b1N0cmluZygpfSAtPiAke3RoaXMuZ2V0TmV3TGVuZ3RoKCl9IH1gO1xuXHR9XG5cblx0Z2V0IGlzRW1wdHkoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0TmV3TGVuZ3RoKCkgPT09IDAgJiYgdGhpcy5yZXBsYWNlUmFuZ2UubGVuZ3RoID09PSAwO1xuXHR9XG5cblx0Z2V0UmFuZ2VBZnRlclJlcGxhY2UoKTogT2Zmc2V0UmFuZ2Uge1xuXHRcdHJldHVybiBuZXcgT2Zmc2V0UmFuZ2UodGhpcy5yZXBsYWNlUmFuZ2Uuc3RhcnQsIHRoaXMucmVwbGFjZVJhbmdlLnN0YXJ0ICsgdGhpcy5nZXROZXdMZW5ndGgoKSk7XG5cdH1cbn1cblxuZXhwb3J0IHR5cGUgQW55RWRpdCA9IEJhc2VFZGl0PEFueVJlcGxhY2VtZW50LCBBbnlFZGl0PjtcbmV4cG9ydCB0eXBlIEFueVJlcGxhY2VtZW50ID0gQmFzZVJlcGxhY2VtZW50PEFueVJlcGxhY2VtZW50PjtcblxuZXhwb3J0IGNsYXNzIEVkaXQ8VCBleHRlbmRzIEJhc2VSZXBsYWNlbWVudDxUPj4gZXh0ZW5kcyBCYXNlRWRpdDxULCBFZGl0PFQ+PiB7XG5cdC8qKlxuXHQgKiBSZXByZXNlbnRzIGEgc2V0IG9mIGVkaXRzIHRvIGEgc3RyaW5nLlxuXHQgKiBBbGwgdGhlc2UgZWRpdHMgYXJlIGFwcGxpZWQgYXQgb25jZS5cblx0Ki9cblx0cHVibGljIHN0YXRpYyByZWFkb25seSBlbXB0eSA9IG5ldyBFZGl0PG5ldmVyPihbXSk7XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGU8VCBleHRlbmRzIEJhc2VSZXBsYWNlbWVudDxUPj4ocmVwbGFjZW1lbnRzOiByZWFkb25seSBUW10pOiBFZGl0PFQ+IHtcblx0XHRyZXR1cm4gbmV3IEVkaXQocmVwbGFjZW1lbnRzKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgc2luZ2xlPFQgZXh0ZW5kcyBCYXNlUmVwbGFjZW1lbnQ8VD4+KHJlcGxhY2VtZW50OiBUKTogRWRpdDxUPiB7XG5cdFx0cmV0dXJuIG5ldyBFZGl0KFtyZXBsYWNlbWVudF0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9jcmVhdGVOZXcocmVwbGFjZW1lbnRzOiByZWFkb25seSBUW10pOiBFZGl0PFQ+IHtcblx0XHRyZXR1cm4gbmV3IEVkaXQocmVwbGFjZW1lbnRzKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQW5ub3RhdGlvblJlcGxhY2VtZW50PFRBbm5vdGF0aW9uPiBleHRlbmRzIEJhc2VSZXBsYWNlbWVudDxBbm5vdGF0aW9uUmVwbGFjZW1lbnQ8VEFubm90YXRpb24+PiB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJhbmdlOiBPZmZzZXRSYW5nZSxcblx0XHRwdWJsaWMgcmVhZG9ubHkgbmV3TGVuZ3RoOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IGFubm90YXRpb246IFRBbm5vdGF0aW9uLFxuXHQpIHtcblx0XHRzdXBlcihyYW5nZSk7XG5cdH1cblxuXHRvdmVycmlkZSBlcXVhbHMob3RoZXI6IEFubm90YXRpb25SZXBsYWNlbWVudDxUQW5ub3RhdGlvbj4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5yZXBsYWNlUmFuZ2UuZXF1YWxzKG90aGVyLnJlcGxhY2VSYW5nZSkgJiYgdGhpcy5uZXdMZW5ndGggPT09IG90aGVyLm5ld0xlbmd0aCAmJiB0aGlzLmFubm90YXRpb24gPT09IG90aGVyLmFubm90YXRpb247XG5cdH1cblxuXHRnZXROZXdMZW5ndGgoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubmV3TGVuZ3RoOyB9XG5cblx0dHJ5Sm9pblRvdWNoaW5nKG90aGVyOiBBbm5vdGF0aW9uUmVwbGFjZW1lbnQ8VEFubm90YXRpb24+KTogQW5ub3RhdGlvblJlcGxhY2VtZW50PFRBbm5vdGF0aW9uPiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuYW5ub3RhdGlvbiAhPT0gb3RoZXIuYW5ub3RhdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBBbm5vdGF0aW9uUmVwbGFjZW1lbnQ8VEFubm90YXRpb24+KHRoaXMucmVwbGFjZVJhbmdlLmpvaW5SaWdodFRvdWNoaW5nKG90aGVyLnJlcGxhY2VSYW5nZSksIHRoaXMubmV3TGVuZ3RoICsgb3RoZXIubmV3TGVuZ3RoLCB0aGlzLmFubm90YXRpb24pO1xuXHR9XG5cblx0c2xpY2UocmFuZ2U6IE9mZnNldFJhbmdlLCByYW5nZUluUmVwbGFjZW1lbnQ/OiBPZmZzZXRSYW5nZSk6IEFubm90YXRpb25SZXBsYWNlbWVudDxUQW5ub3RhdGlvbj4ge1xuXHRcdHJldHVybiBuZXcgQW5ub3RhdGlvblJlcGxhY2VtZW50PFRBbm5vdGF0aW9uPihyYW5nZSwgcmFuZ2VJblJlcGxhY2VtZW50ID8gcmFuZ2VJblJlcGxhY2VtZW50Lmxlbmd0aCA6IHRoaXMubmV3TGVuZ3RoLCB0aGlzLmFubm90YXRpb24pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGFBQWE7QUFDdEIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxtQkFBbUI7QUFHckIsTUFBZSxTQUFtSDtBQUFBLEVBQ3hJLFlBQ2lCLGNBQ2Y7QUFEZTtBQUVoQixRQUFJLFlBQVk7QUFDaEIsZUFBVyxlQUFlLGNBQWM7QUFDdkMsVUFBSSxFQUFFLFlBQVksYUFBYSxTQUFTLFlBQVk7QUFDbkQsY0FBTSxJQUFJLG1CQUFtQiw0Q0FBNEMsV0FBVyxVQUFVLFNBQVMsRUFBRTtBQUFBLE1BQzFHO0FBQ0Esa0JBQVksWUFBWSxhQUFhO0FBQUEsSUFDdEM7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU08sT0FBTyxPQUF1QjtBQUNwQyxRQUFJLEtBQUssYUFBYSxXQUFXLE1BQU0sYUFBYSxRQUFRO0FBQzNE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
