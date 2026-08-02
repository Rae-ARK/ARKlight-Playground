import { commonPrefixLength, commonSuffixLength } from "../../../../base/common/strings.js";
import { OffsetRange } from "../ranges/offsetRange.js";
import { StringText } from "../text/abstractText.js";
import { BaseEdit, BaseReplacement } from "./edit.js";
class BaseStringEdit extends BaseEdit {
  get TReplacement() {
    throw new Error("TReplacement is not defined for BaseStringEdit");
  }
  static composeOrUndefined(edits) {
    if (edits.length === 0) {
      return void 0;
    }
    let result = edits[0];
    for (let i = 1; i < edits.length; i++) {
      result = result.compose(edits[i]);
    }
    return result;
  }
  /**
   * r := trySwap(e1, e2);
   * e1.compose(e2) === r.e1.compose(r.e2)
  */
  static trySwap(e1, e2) {
    const e1Inv = e1.inverseOnSlice((start, endEx) => " ".repeat(endEx - start));
    const e1_ = e2.tryRebase(e1Inv);
    if (!e1_) {
      return void 0;
    }
    const e2_ = e1.tryRebase(e1_);
    if (!e2_) {
      return void 0;
    }
    return { e1: e1_, e2: e2_ };
  }
  apply(base) {
    const resultText = [];
    let pos = 0;
    for (const edit of this.replacements) {
      resultText.push(base.substring(pos, edit.replaceRange.start));
      resultText.push(edit.newText);
      pos = edit.replaceRange.endExclusive;
    }
    resultText.push(base.substring(pos));
    return resultText.join("");
  }
  /**
   * Creates an edit that reverts this edit.
   */
  inverseOnSlice(getOriginalSlice) {
    const edits = [];
    let offset = 0;
    for (const e of this.replacements) {
      edits.push(StringReplacement.replace(
        OffsetRange.ofStartAndLength(e.replaceRange.start + offset, e.newText.length),
        getOriginalSlice(e.replaceRange.start, e.replaceRange.endExclusive)
      ));
      offset += e.newText.length - e.replaceRange.length;
    }
    return new StringEdit(edits);
  }
  /**
   * Creates an edit that reverts this edit.
   */
  inverse(original) {
    return this.inverseOnSlice((start, endEx) => original.substring(start, endEx));
  }
  rebaseSkipConflicting(base) {
    return this._tryRebase(base, false);
  }
  tryRebase(base) {
    return this._tryRebase(base, true);
  }
  _tryRebase(base, noOverlap) {
    const newEdits = [];
    let baseIdx = 0;
    let ourIdx = 0;
    let offset = 0;
    while (ourIdx < this.replacements.length || baseIdx < base.replacements.length) {
      const baseEdit = base.replacements.at(baseIdx);
      const ourEdit = this.replacements.at(ourIdx);
      if (!ourEdit) {
        break;
      } else if (!baseEdit) {
        const transformedRange = ourEdit.replaceRange.delta(offset);
        newEdits.push(new StringReplacement(transformedRange, ourEdit.newText));
        ourIdx++;
      } else if (ourEdit.replaceRange.intersects(baseEdit.replaceRange) || areConcurrentInserts(ourEdit.replaceRange, baseEdit.replaceRange) || isInsertStrictlyInsideRange(ourEdit.replaceRange, baseEdit.replaceRange) || isInsertStrictlyInsideRange(baseEdit.replaceRange, ourEdit.replaceRange)) {
        ourIdx++;
        if (noOverlap) {
          return void 0;
        }
      } else if (ourEdit.replaceRange.start < baseEdit.replaceRange.start || ourEdit.replaceRange.isEmpty && ourEdit.replaceRange.start === baseEdit.replaceRange.start) {
        const transformedRange = ourEdit.replaceRange.delta(offset);
        newEdits.push(new StringReplacement(transformedRange, ourEdit.newText));
        ourIdx++;
      } else {
        baseIdx++;
        offset += baseEdit.newText.length - baseEdit.replaceRange.length;
      }
    }
    return new StringEdit(newEdits);
  }
  toJson() {
    return this.replacements.map((e) => e.toJson());
  }
  isNeutralOn(text) {
    return this.replacements.every((e) => e.isNeutralOn(text));
  }
  removeCommonSuffixPrefix(originalText) {
    const edits = [];
    for (const e of this.replacements) {
      const edit = e.removeCommonSuffixPrefix(originalText);
      if (!edit.isEmpty) {
        edits.push(edit);
      }
    }
    return new StringEdit(edits);
  }
  normalizeEOL(eol) {
    return new StringEdit(this.replacements.map((edit) => edit.normalizeEOL(eol)));
  }
  /**
   * If `e1.apply(source) === e2.apply(source)`, then `e1.normalizeOnSource(source).equals(e2.normalizeOnSource(source))`.
  */
  normalizeOnSource(source) {
    const result = this.apply(source);
    const edit = StringReplacement.replace(OffsetRange.ofLength(source.length), result);
    const e = edit.removeCommonSuffixAndPrefix(source);
    if (e.isEmpty) {
      return StringEdit.empty;
    }
    return e.toEdit();
  }
  removeCommonSuffixAndPrefix(source) {
    return this._createNew(this.replacements.map((e) => e.removeCommonSuffixAndPrefix(source))).normalize();
  }
  applyOnText(docContents) {
    return new StringText(this.apply(docContents.value));
  }
  mapData(f) {
    return new AnnotatedStringEdit(
      this.replacements.map((e) => new AnnotatedStringReplacement(
        e.replaceRange,
        e.newText,
        f(e)
      ))
    );
  }
}
class BaseStringReplacement extends BaseReplacement {
  constructor(range, newText) {
    super(range);
    this.newText = newText;
  }
  getNewLength() {
    return this.newText.length;
  }
  toString() {
    return `${this.replaceRange} -> ${JSON.stringify(this.newText)}`;
  }
  replace(str) {
    return str.substring(0, this.replaceRange.start) + this.newText + str.substring(this.replaceRange.endExclusive);
  }
  /**
   * Checks if the edit would produce no changes when applied to the given text.
   */
  isNeutralOn(text) {
    return this.newText === text.substring(this.replaceRange.start, this.replaceRange.endExclusive);
  }
  removeCommonSuffixPrefix(originalText) {
    const oldText = originalText.substring(this.replaceRange.start, this.replaceRange.endExclusive);
    const prefixLen = commonPrefixLength(oldText, this.newText);
    const suffixLen = Math.min(
      oldText.length - prefixLen,
      this.newText.length - prefixLen,
      commonSuffixLength(oldText, this.newText)
    );
    const replaceRange = new OffsetRange(
      this.replaceRange.start + prefixLen,
      this.replaceRange.endExclusive - suffixLen
    );
    const newText = this.newText.substring(prefixLen, this.newText.length - suffixLen);
    return new StringReplacement(replaceRange, newText);
  }
  normalizeEOL(eol) {
    const newText = this.newText.replace(/\r\n|\n/g, eol);
    return new StringReplacement(this.replaceRange, newText);
  }
  removeCommonSuffixAndPrefix(source) {
    return this.removeCommonSuffix(source).removeCommonPrefix(source);
  }
  removeCommonPrefix(source) {
    const oldText = this.replaceRange.substring(source);
    const prefixLen = commonPrefixLength(oldText, this.newText);
    if (prefixLen === 0) {
      return this;
    }
    return this.slice(this.replaceRange.deltaStart(prefixLen), new OffsetRange(prefixLen, this.newText.length));
  }
  removeCommonSuffix(source) {
    const oldText = this.replaceRange.substring(source);
    const suffixLen = commonSuffixLength(oldText, this.newText);
    if (suffixLen === 0) {
      return this;
    }
    return this.slice(this.replaceRange.deltaEnd(-suffixLen), new OffsetRange(0, this.newText.length - suffixLen));
  }
  toEdit() {
    return new StringEdit([this]);
  }
  toJson() {
    return {
      txt: this.newText,
      pos: this.replaceRange.start,
      len: this.replaceRange.length
    };
  }
}
const _StringEdit = class _StringEdit extends BaseStringEdit {
  /**
   * Parses an edit from its string representation.
   * E.g. [[2, 12) -> "fgh", [14, 20) -> "qrst", [22, 22) -> "de\n"]
  */
  static parse(toStringValue) {
    const replacements = [];
    const regex = /\[(\d+),\s*(\d+)\)\s*->\s*"([^"]*)"/g;
    let match;
    while ((match = regex.exec(toStringValue)) !== null) {
      const start = parseInt(match[1], 10);
      const endEx = parseInt(match[2], 10);
      const text = match[3].replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\\\/g, "\\");
      replacements.push(new StringReplacement(new OffsetRange(start, endEx), text));
    }
    return new _StringEdit(replacements);
  }
  static create(replacements) {
    return new _StringEdit(replacements);
  }
  static single(replacement) {
    return new _StringEdit([replacement]);
  }
  static replace(range, replacement) {
    return new _StringEdit([new StringReplacement(range, replacement)]);
  }
  static insert(offset, replacement) {
    return new _StringEdit([new StringReplacement(OffsetRange.emptyAt(offset), replacement)]);
  }
  static delete(range) {
    return new _StringEdit([new StringReplacement(range, "")]);
  }
  static fromJson(data) {
    return new _StringEdit(data.map(StringReplacement.fromJson));
  }
  static compose(edits) {
    if (edits.length === 0) {
      return _StringEdit.empty;
    }
    let result = edits[0];
    for (let i = 1; i < edits.length; i++) {
      result = result.compose(edits[i]);
    }
    return result;
  }
  /**
   * The replacements are applied in order!
   * Equals `StringEdit.compose(replacements.map(r => r.toEdit()))`, but is much more performant.
  */
  static composeSequentialReplacements(replacements) {
    let edit = _StringEdit.empty;
    let curEditReplacements = [];
    for (const r of replacements) {
      const last = curEditReplacements.at(-1);
      if (!last || r.replaceRange.isBefore(last.replaceRange)) {
        curEditReplacements.push(r);
      } else {
        edit = edit.compose(_StringEdit.create(curEditReplacements.reverse()));
        curEditReplacements = [r];
      }
    }
    edit = edit.compose(_StringEdit.create(curEditReplacements.reverse()));
    return edit;
  }
  constructor(replacements) {
    super(replacements);
  }
  _createNew(replacements) {
    return new _StringEdit(replacements);
  }
};
_StringEdit.empty = new _StringEdit([]);
let StringEdit = _StringEdit;
class StringReplacement extends BaseStringReplacement {
  static insert(offset, text) {
    return new StringReplacement(OffsetRange.emptyAt(offset), text);
  }
  static replace(range, text) {
    return new StringReplacement(range, text);
  }
  static delete(range) {
    return new StringReplacement(range, "");
  }
  static fromJson(data) {
    return new StringReplacement(OffsetRange.ofStartAndLength(data.pos, data.len), data.txt);
  }
  equals(other) {
    return this.replaceRange.equals(other.replaceRange) && this.newText === other.newText;
  }
  tryJoinTouching(other) {
    return new StringReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newText + other.newText);
  }
  slice(range, rangeInReplacement) {
    return new StringReplacement(range, rangeInReplacement ? rangeInReplacement.substring(this.newText) : this.newText);
  }
}
function applyEditsToRanges(sortedRanges, edit) {
  sortedRanges = sortedRanges.slice();
  const result = [];
  let offset = 0;
  for (const e of edit.replacements) {
    while (true) {
      const r = sortedRanges[0];
      if (!r || r.endExclusive >= e.replaceRange.start) {
        break;
      }
      sortedRanges.shift();
      result.push(r.delta(offset));
    }
    const intersecting = [];
    while (true) {
      const r = sortedRanges[0];
      if (!r || !r.intersectsOrTouches(e.replaceRange)) {
        break;
      }
      sortedRanges.shift();
      intersecting.push(r);
    }
    for (let i = intersecting.length - 1; i >= 0; i--) {
      let r = intersecting[i];
      const overlap = r.intersect(e.replaceRange).length;
      r = r.deltaEnd(-overlap + (i === 0 ? e.newText.length : 0));
      const rangeAheadOfReplaceRange = r.start - e.replaceRange.start;
      if (rangeAheadOfReplaceRange > 0) {
        r = r.delta(-rangeAheadOfReplaceRange);
      }
      if (i !== 0) {
        r = r.delta(e.newText.length);
      }
      r = r.delta(-(e.newText.length - e.replaceRange.length));
      sortedRanges.unshift(r);
    }
    offset += e.newText.length - e.replaceRange.length;
  }
  while (true) {
    const r = sortedRanges[0];
    if (!r) {
      break;
    }
    sortedRanges.shift();
    result.push(r.delta(offset));
  }
  return result;
}
class VoidEditData {
  join(other) {
    return this;
  }
}
const _AnnotatedStringEdit = class _AnnotatedStringEdit extends BaseStringEdit {
  static create(replacements) {
    return new _AnnotatedStringEdit(replacements);
  }
  static single(replacement) {
    return new _AnnotatedStringEdit([replacement]);
  }
  static replace(range, replacement, data) {
    return new _AnnotatedStringEdit([new AnnotatedStringReplacement(range, replacement, data)]);
  }
  static insert(offset, replacement, data) {
    return new _AnnotatedStringEdit([new AnnotatedStringReplacement(OffsetRange.emptyAt(offset), replacement, data)]);
  }
  static delete(range, data) {
    return new _AnnotatedStringEdit([new AnnotatedStringReplacement(range, "", data)]);
  }
  static compose(edits) {
    if (edits.length === 0) {
      return _AnnotatedStringEdit.empty;
    }
    let result = edits[0];
    for (let i = 1; i < edits.length; i++) {
      result = result.compose(edits[i]);
    }
    return result;
  }
  constructor(replacements) {
    super(replacements);
  }
  _createNew(replacements) {
    return new _AnnotatedStringEdit(replacements);
  }
  toStringEdit(filter) {
    const newReplacements = [];
    for (const r of this.replacements) {
      if (!filter || filter(r)) {
        newReplacements.push(new StringReplacement(r.replaceRange, r.newText));
      }
    }
    return new StringEdit(newReplacements);
  }
};
_AnnotatedStringEdit.empty = new _AnnotatedStringEdit([]);
let AnnotatedStringEdit = _AnnotatedStringEdit;
class AnnotatedStringReplacement extends BaseStringReplacement {
  constructor(range, newText, data) {
    super(range, newText);
    this.data = data;
  }
  static insert(offset, text, data) {
    return new AnnotatedStringReplacement(OffsetRange.emptyAt(offset), text, data);
  }
  static replace(range, text, data) {
    return new AnnotatedStringReplacement(range, text, data);
  }
  static delete(range, data) {
    return new AnnotatedStringReplacement(range, "", data);
  }
  equals(other) {
    return this.replaceRange.equals(other.replaceRange) && this.newText === other.newText && this.data === other.data;
  }
  tryJoinTouching(other) {
    const joined = this.data.join(other.data);
    if (joined === void 0) {
      return void 0;
    }
    return new AnnotatedStringReplacement(this.replaceRange.joinRightTouching(other.replaceRange), this.newText + other.newText, joined);
  }
  slice(range, rangeInReplacement) {
    return new AnnotatedStringReplacement(range, rangeInReplacement ? rangeInReplacement.substring(this.newText) : this.newText, this.data);
  }
}
function areConcurrentInserts(r1, r2) {
  return r1.isEmpty && r2.isEmpty && r1.start === r2.start;
}
function isInsertStrictlyInsideRange(insert, range) {
  return insert.isEmpty && range.start < insert.start && insert.start < range.endExclusive;
}
export {
  AnnotatedStringEdit,
  AnnotatedStringReplacement,
  BaseStringEdit,
  BaseStringReplacement,
  StringEdit,
  StringReplacement,
  VoidEditData,
  applyEditsToRanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vY29yZS9lZGl0cy9zdHJpbmdFZGl0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgY29tbW9uUHJlZml4TGVuZ3RoLCBjb21tb25TdWZmaXhMZW5ndGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IFN0cmluZ1RleHQgfSBmcm9tICcuLi90ZXh0L2Fic3RyYWN0VGV4dC5qcyc7XG5pbXBvcnQgeyBCYXNlRWRpdCwgQmFzZVJlcGxhY2VtZW50IH0gZnJvbSAnLi9lZGl0LmpzJztcblxuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEJhc2VTdHJpbmdFZGl0PFQgZXh0ZW5kcyBCYXNlU3RyaW5nUmVwbGFjZW1lbnQ8VD4gPSBCYXNlU3RyaW5nUmVwbGFjZW1lbnQ8YW55PiwgVEVkaXQgZXh0ZW5kcyBCYXNlU3RyaW5nRWRpdDxULCBURWRpdD4gPSBCYXNlU3RyaW5nRWRpdDxhbnksIGFueT4+IGV4dGVuZHMgQmFzZUVkaXQ8VCwgVEVkaXQ+IHtcblx0Z2V0IFRSZXBsYWNlbWVudCgpOiBUIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1RSZXBsYWNlbWVudCBpcyBub3QgZGVmaW5lZCBmb3IgQmFzZVN0cmluZ0VkaXQnKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY29tcG9zZU9yVW5kZWZpbmVkPFQgZXh0ZW5kcyBCYXNlU3RyaW5nRWRpdD4oZWRpdHM6IHJlYWRvbmx5IFRbXSk6IFQgfCB1bmRlZmluZWQge1xuXHRcdGlmIChlZGl0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCByZXN1bHQgPSBlZGl0c1swXTtcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGVkaXRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdHJlc3VsdCA9IHJlc3VsdC5jb21wb3NlKGVkaXRzW2ldKSBhcyBhbnk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogciA6PSB0cnlTd2FwKGUxLCBlMik7XG5cdCAqIGUxLmNvbXBvc2UoZTIpID09PSByLmUxLmNvbXBvc2Uoci5lMilcblx0Ki9cblx0cHVibGljIHN0YXRpYyB0cnlTd2FwKGUxOiBCYXNlU3RyaW5nRWRpdCwgZTI6IEJhc2VTdHJpbmdFZGl0KTogeyBlMTogU3RyaW5nRWRpdDsgZTI6IFN0cmluZ0VkaXQgfSB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gVE9ETyBtYWtlIHRoaXMgbW9yZSBlZmZpY2llbnRcblx0XHRjb25zdCBlMUludiA9IGUxLmludmVyc2VPblNsaWNlKChzdGFydCwgZW5kRXgpID0+ICcgJy5yZXBlYXQoZW5kRXggLSBzdGFydCkpO1xuXG5cdFx0Y29uc3QgZTFfID0gZTIudHJ5UmViYXNlKGUxSW52KTtcblx0XHRpZiAoIWUxXykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZTJfID0gZTEudHJ5UmViYXNlKGUxXyk7XG5cdFx0aWYgKCFlMl8pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgZTE6IGUxXywgZTI6IGUyXyB9O1xuXHR9XG5cblx0cHVibGljIGFwcGx5KGJhc2U6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcmVzdWx0VGV4dDogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgcG9zID0gMDtcblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgdGhpcy5yZXBsYWNlbWVudHMpIHtcblx0XHRcdHJlc3VsdFRleHQucHVzaChiYXNlLnN1YnN0cmluZyhwb3MsIGVkaXQucmVwbGFjZVJhbmdlLnN0YXJ0KSk7XG5cdFx0XHRyZXN1bHRUZXh0LnB1c2goZWRpdC5uZXdUZXh0KTtcblx0XHRcdHBvcyA9IGVkaXQucmVwbGFjZVJhbmdlLmVuZEV4Y2x1c2l2ZTtcblx0XHR9XG5cdFx0cmVzdWx0VGV4dC5wdXNoKGJhc2Uuc3Vic3RyaW5nKHBvcykpO1xuXHRcdHJldHVybiByZXN1bHRUZXh0LmpvaW4oJycpO1xuXHR9XG5cblxuXHQvKipcblx0ICogQ3JlYXRlcyBhbiBlZGl0IHRoYXQgcmV2ZXJ0cyB0aGlzIGVkaXQuXG5cdCAqL1xuXHRwdWJsaWMgaW52ZXJzZU9uU2xpY2UoZ2V0T3JpZ2luYWxTbGljZTogKHN0YXJ0OiBudW1iZXIsIGVuZEV4OiBudW1iZXIpID0+IHN0cmluZyk6IFN0cmluZ0VkaXQge1xuXHRcdGNvbnN0IGVkaXRzOiBTdHJpbmdSZXBsYWNlbWVudFtdID0gW107XG5cdFx0bGV0IG9mZnNldCA9IDA7XG5cdFx0Zm9yIChjb25zdCBlIG9mIHRoaXMucmVwbGFjZW1lbnRzKSB7XG5cdFx0XHRlZGl0cy5wdXNoKFN0cmluZ1JlcGxhY2VtZW50LnJlcGxhY2UoXG5cdFx0XHRcdE9mZnNldFJhbmdlLm9mU3RhcnRBbmRMZW5ndGgoZS5yZXBsYWNlUmFuZ2Uuc3RhcnQgKyBvZmZzZXQsIGUubmV3VGV4dC5sZW5ndGgpLFxuXHRcdFx0XHRnZXRPcmlnaW5hbFNsaWNlKGUucmVwbGFjZVJhbmdlLnN0YXJ0LCBlLnJlcGxhY2VSYW5nZS5lbmRFeGNsdXNpdmUpXG5cdFx0XHQpKTtcblx0XHRcdG9mZnNldCArPSBlLm5ld1RleHQubGVuZ3RoIC0gZS5yZXBsYWNlUmFuZ2UubGVuZ3RoO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFN0cmluZ0VkaXQoZWRpdHMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYW4gZWRpdCB0aGF0IHJldmVydHMgdGhpcyBlZGl0LlxuXHQgKi9cblx0cHVibGljIGludmVyc2Uob3JpZ2luYWw6IHN0cmluZyk6IFN0cmluZ0VkaXQge1xuXHRcdHJldHVybiB0aGlzLmludmVyc2VPblNsaWNlKChzdGFydCwgZW5kRXgpID0+IG9yaWdpbmFsLnN1YnN0cmluZyhzdGFydCwgZW5kRXgpKTtcblx0fVxuXG5cdHB1YmxpYyByZWJhc2VTa2lwQ29uZmxpY3RpbmcoYmFzZTogU3RyaW5nRWRpdCk6IFN0cmluZ0VkaXQge1xuXHRcdHJldHVybiB0aGlzLl90cnlSZWJhc2UoYmFzZSwgZmFsc2UpITtcblx0fVxuXG5cdHB1YmxpYyB0cnlSZWJhc2UoYmFzZTogU3RyaW5nRWRpdCk6IFN0cmluZ0VkaXQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl90cnlSZWJhc2UoYmFzZSwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIF90cnlSZWJhc2UoYmFzZTogU3RyaW5nRWRpdCwgbm9PdmVybGFwOiBib29sZWFuKTogU3RyaW5nRWRpdCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbmV3RWRpdHM6IFN0cmluZ1JlcGxhY2VtZW50W10gPSBbXTtcblxuXHRcdGxldCBiYXNlSWR4ID0gMDtcblx0XHRsZXQgb3VySWR4ID0gMDtcblx0XHRsZXQgb2Zmc2V0ID0gMDtcblxuXHRcdHdoaWxlIChvdXJJZHggPCB0aGlzLnJlcGxhY2VtZW50cy5sZW5ndGggfHwgYmFzZUlkeCA8IGJhc2UucmVwbGFjZW1lbnRzLmxlbmd0aCkge1xuXHRcdFx0Ly8gdGFrZSB0aGUgZWRpdCB0aGF0IHN0YXJ0cyBmaXJzdFxuXHRcdFx0Y29uc3QgYmFzZUVkaXQgPSBiYXNlLnJlcGxhY2VtZW50cy5hdChiYXNlSWR4KTtcblx0XHRcdGNvbnN0IG91ckVkaXQgPSB0aGlzLnJlcGxhY2VtZW50cy5hdChvdXJJZHgpO1xuXG5cdFx0XHRpZiAoIW91ckVkaXQpIHtcblx0XHRcdFx0Ly8gV2UgcHJvY2Vzc2VkIGFsbCBvdXIgZWRpdHNcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9IGVsc2UgaWYgKCFiYXNlRWRpdCkge1xuXHRcdFx0XHQvLyBubyBtb3JlIGVkaXRzIGZyb20gYmFzZVxuXHRcdFx0XHRjb25zdCB0cmFuc2Zvcm1lZFJhbmdlID0gb3VyRWRpdC5yZXBsYWNlUmFuZ2UuZGVsdGEob2Zmc2V0KTtcblx0XHRcdFx0bmV3RWRpdHMucHVzaChuZXcgU3RyaW5nUmVwbGFjZW1lbnQodHJhbnNmb3JtZWRSYW5nZSwgb3VyRWRpdC5uZXdUZXh0KSk7XG5cdFx0XHRcdG91cklkeCsrO1xuXHRcdFx0fSBlbHNlIGlmIChcblx0XHRcdFx0b3VyRWRpdC5yZXBsYWNlUmFuZ2UuaW50ZXJzZWN0cyhiYXNlRWRpdC5yZXBsYWNlUmFuZ2UpIHx8XG5cdFx0XHRcdGFyZUNvbmN1cnJlbnRJbnNlcnRzKG91ckVkaXQucmVwbGFjZVJhbmdlLCBiYXNlRWRpdC5yZXBsYWNlUmFuZ2UpIHx8XG5cdFx0XHRcdGlzSW5zZXJ0U3RyaWN0bHlJbnNpZGVSYW5nZShvdXJFZGl0LnJlcGxhY2VSYW5nZSwgYmFzZUVkaXQucmVwbGFjZVJhbmdlKSB8fFxuXHRcdFx0XHRpc0luc2VydFN0cmljdGx5SW5zaWRlUmFuZ2UoYmFzZUVkaXQucmVwbGFjZVJhbmdlLCBvdXJFZGl0LnJlcGxhY2VSYW5nZSlcblx0XHRcdCkge1xuXHRcdFx0XHRvdXJJZHgrKzsgLy8gRG9uJ3QgdGFrZSBvdXIgZWRpdCwgYXMgaXQgaXMgY29uZmxpY3RpbmcgLT4gc2tpcFxuXHRcdFx0XHRpZiAobm9PdmVybGFwKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChvdXJFZGl0LnJlcGxhY2VSYW5nZS5zdGFydCA8IGJhc2VFZGl0LnJlcGxhY2VSYW5nZS5zdGFydCB8fFxuXHRcdFx0XHQob3VyRWRpdC5yZXBsYWNlUmFuZ2UuaXNFbXB0eSAmJiBvdXJFZGl0LnJlcGxhY2VSYW5nZS5zdGFydCA9PT0gYmFzZUVkaXQucmVwbGFjZVJhbmdlLnN0YXJ0KSkge1xuXHRcdFx0XHQvLyBPdXIgZWRpdCBzdGFydHMgZmlyc3QsIG9yIGlzIGFuIGluc2VydCBhdCB0aGUgc3RhcnQgb2YgYmFzZSdzIHJhbmdlXG5cdFx0XHRcdGNvbnN0IHRyYW5zZm9ybWVkUmFuZ2UgPSBvdXJFZGl0LnJlcGxhY2VSYW5nZS5kZWx0YShvZmZzZXQpO1xuXHRcdFx0XHQvLyBDaGVjayBpZiB0aGUgdHJhbnNmb3JtZWQgZWRpdCB3b3VsZCB2aW9sYXRlIHRoZSBzb3J0ZWQvZGlzam9pbnQgaW52YXJpYW50XG5cdFx0XHRcdG5ld0VkaXRzLnB1c2gobmV3IFN0cmluZ1JlcGxhY2VtZW50KHRyYW5zZm9ybWVkUmFuZ2UsIG91ckVkaXQubmV3VGV4dCkpO1xuXHRcdFx0XHRvdXJJZHgrKztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJhc2VJZHgrKztcblx0XHRcdFx0b2Zmc2V0ICs9IGJhc2VFZGl0Lm5ld1RleHQubGVuZ3RoIC0gYmFzZUVkaXQucmVwbGFjZVJhbmdlLmxlbmd0aDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFN0cmluZ0VkaXQobmV3RWRpdHMpO1xuXHR9XG5cblx0cHVibGljIHRvSnNvbigpOiBJU2VyaWFsaXplZFN0cmluZ0VkaXQge1xuXHRcdHJldHVybiB0aGlzLnJlcGxhY2VtZW50cy5tYXAoZSA9PiBlLnRvSnNvbigpKTtcblx0fVxuXG5cdHB1YmxpYyBpc05ldXRyYWxPbih0ZXh0OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5yZXBsYWNlbWVudHMuZXZlcnkoZSA9PiBlLmlzTmV1dHJhbE9uKHRleHQpKTtcblx0fVxuXG5cdHB1YmxpYyByZW1vdmVDb21tb25TdWZmaXhQcmVmaXgob3JpZ2luYWxUZXh0OiBzdHJpbmcpOiBTdHJpbmdFZGl0IHtcblx0XHRjb25zdCBlZGl0czogU3RyaW5nUmVwbGFjZW1lbnRbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZSBvZiB0aGlzLnJlcGxhY2VtZW50cykge1xuXHRcdFx0Y29uc3QgZWRpdCA9IGUucmVtb3ZlQ29tbW9uU3VmZml4UHJlZml4KG9yaWdpbmFsVGV4dCk7XG5cdFx0XHRpZiAoIWVkaXQuaXNFbXB0eSkge1xuXHRcdFx0XHRlZGl0cy5wdXNoKGVkaXQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFN0cmluZ0VkaXQoZWRpdHMpO1xuXHR9XG5cblx0cHVibGljIG5vcm1hbGl6ZUVPTChlb2w6ICdcXHJcXG4nIHwgJ1xcbicpOiBTdHJpbmdFZGl0IHtcblx0XHRyZXR1cm4gbmV3IFN0cmluZ0VkaXQodGhpcy5yZXBsYWNlbWVudHMubWFwKGVkaXQgPT4gZWRpdC5ub3JtYWxpemVFT0woZW9sKSkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIElmIGBlMS5hcHBseShzb3VyY2UpID09PSBlMi5hcHBseShzb3VyY2UpYCwgdGhlbiBgZTEubm9ybWFsaXplT25Tb3VyY2Uoc291cmNlKS5lcXVhbHMoZTIubm9ybWFsaXplT25Tb3VyY2Uoc291cmNlKSlgLlxuXHQqL1xuXHRwdWJsaWMgbm9ybWFsaXplT25Tb3VyY2Uoc291cmNlOiBzdHJpbmcpOiBTdHJpbmdFZGl0IHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmFwcGx5KHNvdXJjZSk7XG5cblx0XHRjb25zdCBlZGl0ID0gU3RyaW5nUmVwbGFjZW1lbnQucmVwbGFjZShPZmZzZXRSYW5nZS5vZkxlbmd0aChzb3VyY2UubGVuZ3RoKSwgcmVzdWx0KTtcblx0XHRjb25zdCBlID0gZWRpdC5yZW1vdmVDb21tb25TdWZmaXhBbmRQcmVmaXgoc291cmNlKTtcblx0XHRpZiAoZS5pc0VtcHR5KSB7XG5cdFx0XHRyZXR1cm4gU3RyaW5nRWRpdC5lbXB0eTtcblx0XHR9XG5cdFx0cmV0dXJuIGUudG9FZGl0KCk7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlQ29tbW9uU3VmZml4QW5kUHJlZml4KHNvdXJjZTogc3RyaW5nKTogVEVkaXQge1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVOZXcodGhpcy5yZXBsYWNlbWVudHMubWFwKGUgPT4gZS5yZW1vdmVDb21tb25TdWZmaXhBbmRQcmVmaXgoc291cmNlKSkpLm5vcm1hbGl6ZSgpO1xuXHR9XG5cblx0cHVibGljIGFwcGx5T25UZXh0KGRvY0NvbnRlbnRzOiBTdHJpbmdUZXh0KTogU3RyaW5nVGV4dCB7XG5cdFx0cmV0dXJuIG5ldyBTdHJpbmdUZXh0KHRoaXMuYXBwbHkoZG9jQ29udGVudHMudmFsdWUpKTtcblx0fVxuXG5cdHB1YmxpYyBtYXBEYXRhPFREYXRhIGV4dGVuZHMgSUVkaXREYXRhPFREYXRhPj4oZjogKHJlcGxhY2VtZW50OiBUKSA9PiBURGF0YSk6IEFubm90YXRlZFN0cmluZ0VkaXQ8VERhdGE+IHtcblx0XHRyZXR1cm4gbmV3IEFubm90YXRlZFN0cmluZ0VkaXQoXG5cdFx0XHR0aGlzLnJlcGxhY2VtZW50cy5tYXAoZSA9PiBuZXcgQW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQoXG5cdFx0XHRcdGUucmVwbGFjZVJhbmdlLFxuXHRcdFx0XHRlLm5ld1RleHQsXG5cdFx0XHRcdGYoZSlcblx0XHRcdCkpXG5cdFx0KTtcblx0fVxufVxuXG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEJhc2VTdHJpbmdSZXBsYWNlbWVudDxUIGV4dGVuZHMgQmFzZVN0cmluZ1JlcGxhY2VtZW50PFQ+ID0gQmFzZVN0cmluZ1JlcGxhY2VtZW50PGFueT4+IGV4dGVuZHMgQmFzZVJlcGxhY2VtZW50PFQ+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cmFuZ2U6IE9mZnNldFJhbmdlLFxuXHRcdHB1YmxpYyByZWFkb25seSBuZXdUZXh0OiBzdHJpbmdcblx0KSB7XG5cdFx0c3VwZXIocmFuZ2UpO1xuXHR9XG5cblx0Z2V0TmV3TGVuZ3RoKCk6IG51bWJlciB7IHJldHVybiB0aGlzLm5ld1RleHQubGVuZ3RoOyB9XG5cblx0b3ZlcnJpZGUgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7dGhpcy5yZXBsYWNlUmFuZ2V9IC0+ICR7SlNPTi5zdHJpbmdpZnkodGhpcy5uZXdUZXh0KX1gO1xuXHR9XG5cblx0cmVwbGFjZShzdHI6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHN0ci5zdWJzdHJpbmcoMCwgdGhpcy5yZXBsYWNlUmFuZ2Uuc3RhcnQpICsgdGhpcy5uZXdUZXh0ICsgc3RyLnN1YnN0cmluZyh0aGlzLnJlcGxhY2VSYW5nZS5lbmRFeGNsdXNpdmUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWNrcyBpZiB0aGUgZWRpdCB3b3VsZCBwcm9kdWNlIG5vIGNoYW5nZXMgd2hlbiBhcHBsaWVkIHRvIHRoZSBnaXZlbiB0ZXh0LlxuXHQgKi9cblx0aXNOZXV0cmFsT24odGV4dDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubmV3VGV4dCA9PT0gdGV4dC5zdWJzdHJpbmcodGhpcy5yZXBsYWNlUmFuZ2Uuc3RhcnQsIHRoaXMucmVwbGFjZVJhbmdlLmVuZEV4Y2x1c2l2ZSk7XG5cdH1cblxuXHRyZW1vdmVDb21tb25TdWZmaXhQcmVmaXgob3JpZ2luYWxUZXh0OiBzdHJpbmcpOiBTdHJpbmdSZXBsYWNlbWVudCB7XG5cdFx0Y29uc3Qgb2xkVGV4dCA9IG9yaWdpbmFsVGV4dC5zdWJzdHJpbmcodGhpcy5yZXBsYWNlUmFuZ2Uuc3RhcnQsIHRoaXMucmVwbGFjZVJhbmdlLmVuZEV4Y2x1c2l2ZSk7XG5cblx0XHRjb25zdCBwcmVmaXhMZW4gPSBjb21tb25QcmVmaXhMZW5ndGgob2xkVGV4dCwgdGhpcy5uZXdUZXh0KTtcblx0XHRjb25zdCBzdWZmaXhMZW4gPSBNYXRoLm1pbihcblx0XHRcdG9sZFRleHQubGVuZ3RoIC0gcHJlZml4TGVuLFxuXHRcdFx0dGhpcy5uZXdUZXh0Lmxlbmd0aCAtIHByZWZpeExlbixcblx0XHRcdGNvbW1vblN1ZmZpeExlbmd0aChvbGRUZXh0LCB0aGlzLm5ld1RleHQpXG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlcGxhY2VSYW5nZSA9IG5ldyBPZmZzZXRSYW5nZShcblx0XHRcdHRoaXMucmVwbGFjZVJhbmdlLnN0YXJ0ICsgcHJlZml4TGVuLFxuXHRcdFx0dGhpcy5yZXBsYWNlUmFuZ2UuZW5kRXhjbHVzaXZlIC0gc3VmZml4TGVuLFxuXHRcdCk7XG5cdFx0Y29uc3QgbmV3VGV4dCA9IHRoaXMubmV3VGV4dC5zdWJzdHJpbmcocHJlZml4TGVuLCB0aGlzLm5ld1RleHQubGVuZ3RoIC0gc3VmZml4TGVuKTtcblxuXHRcdHJldHVybiBuZXcgU3RyaW5nUmVwbGFjZW1lbnQocmVwbGFjZVJhbmdlLCBuZXdUZXh0KTtcblx0fVxuXG5cdG5vcm1hbGl6ZUVPTChlb2w6ICdcXHJcXG4nIHwgJ1xcbicpOiBTdHJpbmdSZXBsYWNlbWVudCB7XG5cdFx0Y29uc3QgbmV3VGV4dCA9IHRoaXMubmV3VGV4dC5yZXBsYWNlKC9cXHJcXG58XFxuL2csIGVvbCk7XG5cdFx0cmV0dXJuIG5ldyBTdHJpbmdSZXBsYWNlbWVudCh0aGlzLnJlcGxhY2VSYW5nZSwgbmV3VGV4dCk7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlQ29tbW9uU3VmZml4QW5kUHJlZml4KHNvdXJjZTogc3RyaW5nKTogVCB7XG5cdFx0cmV0dXJuIHRoaXMucmVtb3ZlQ29tbW9uU3VmZml4KHNvdXJjZSkucmVtb3ZlQ29tbW9uUHJlZml4KHNvdXJjZSk7XG5cdH1cblxuXHRwdWJsaWMgcmVtb3ZlQ29tbW9uUHJlZml4KHNvdXJjZTogc3RyaW5nKTogVCB7XG5cdFx0Y29uc3Qgb2xkVGV4dCA9IHRoaXMucmVwbGFjZVJhbmdlLnN1YnN0cmluZyhzb3VyY2UpO1xuXG5cdFx0Y29uc3QgcHJlZml4TGVuID0gY29tbW9uUHJlZml4TGVuZ3RoKG9sZFRleHQsIHRoaXMubmV3VGV4dCk7XG5cdFx0aWYgKHByZWZpeExlbiA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHRoaXMgYXMgdW5rbm93biBhcyBUO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnNsaWNlKHRoaXMucmVwbGFjZVJhbmdlLmRlbHRhU3RhcnQocHJlZml4TGVuKSwgbmV3IE9mZnNldFJhbmdlKHByZWZpeExlbiwgdGhpcy5uZXdUZXh0Lmxlbmd0aCkpO1xuXHR9XG5cblx0cHVibGljIHJlbW92ZUNvbW1vblN1ZmZpeChzb3VyY2U6IHN0cmluZyk6IFQge1xuXHRcdGNvbnN0IG9sZFRleHQgPSB0aGlzLnJlcGxhY2VSYW5nZS5zdWJzdHJpbmcoc291cmNlKTtcblxuXHRcdGNvbnN0IHN1ZmZpeExlbiA9IGNvbW1vblN1ZmZpeExlbmd0aChvbGRUZXh0LCB0aGlzLm5ld1RleHQpO1xuXHRcdGlmIChzdWZmaXhMZW4gPT09IDApIHtcblx0XHRcdHJldHVybiB0aGlzIGFzIHVua25vd24gYXMgVDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuc2xpY2UodGhpcy5yZXBsYWNlUmFuZ2UuZGVsdGFFbmQoLXN1ZmZpeExlbiksIG5ldyBPZmZzZXRSYW5nZSgwLCB0aGlzLm5ld1RleHQubGVuZ3RoIC0gc3VmZml4TGVuKSk7XG5cdH1cblxuXHRwdWJsaWMgdG9FZGl0KCk6IFN0cmluZ0VkaXQge1xuXHRcdHJldHVybiBuZXcgU3RyaW5nRWRpdChbdGhpc10pO1xuXHR9XG5cblx0cHVibGljIHRvSnNvbigpOiBJU2VyaWFsaXplZFN0cmluZ1JlcGxhY2VtZW50IHtcblx0XHRyZXR1cm4gKHtcblx0XHRcdHR4dDogdGhpcy5uZXdUZXh0LFxuXHRcdFx0cG9zOiB0aGlzLnJlcGxhY2VSYW5nZS5zdGFydCxcblx0XHRcdGxlbjogdGhpcy5yZXBsYWNlUmFuZ2UubGVuZ3RoLFxuXHRcdH0pO1xuXHR9XG59XG5cblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgc2V0IG9mIHJlcGxhY2VtZW50cyB0byBhIHN0cmluZy5cbiAqIEFsbCB0aGVzZSByZXBsYWNlbWVudHMgYXJlIGFwcGxpZWQgYXQgb25jZS5cbiovXG5leHBvcnQgY2xhc3MgU3RyaW5nRWRpdCBleHRlbmRzIEJhc2VTdHJpbmdFZGl0PFN0cmluZ1JlcGxhY2VtZW50LCBTdHJpbmdFZGl0PiB7XG5cdC8qKlxuXHQgKiBQYXJzZXMgYW4gZWRpdCBmcm9tIGl0cyBzdHJpbmcgcmVwcmVzZW50YXRpb24uXG5cdCAqIEUuZy4gW1syLCAxMikgLT4gXCJmZ2hcIiwgWzE0LCAyMCkgLT4gXCJxcnN0XCIsIFsyMiwgMjIpIC0+IFwiZGVcXG5cIl1cblx0Ki9cblx0cHVibGljIHN0YXRpYyBwYXJzZSh0b1N0cmluZ1ZhbHVlOiBzdHJpbmcpOiBTdHJpbmdFZGl0IHtcblx0XHRjb25zdCByZXBsYWNlbWVudHM6IFN0cmluZ1JlcGxhY2VtZW50W10gPSBbXTtcblx0XHRjb25zdCByZWdleCA9IC9cXFsoXFxkKyksXFxzKihcXGQrKVxcKVxccyotPlxccypcIihbXlwiXSopXCIvZztcblx0XHRsZXQgbWF0Y2g7XG5cblx0XHR3aGlsZSAoKG1hdGNoID0gcmVnZXguZXhlYyh0b1N0cmluZ1ZhbHVlKSkgIT09IG51bGwpIHtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gcGFyc2VJbnQobWF0Y2hbMV0sIDEwKTtcblx0XHRcdGNvbnN0IGVuZEV4ID0gcGFyc2VJbnQobWF0Y2hbMl0sIDEwKTtcblx0XHRcdGNvbnN0IHRleHQgPSBtYXRjaFszXS5yZXBsYWNlKC9cXFxcbi9nLCAnXFxuJykucmVwbGFjZSgvXFxcXHIvZywgJ1xccicpLnJlcGxhY2UoL1xcXFxcXFxcL2csICdcXFxcJyk7XG5cdFx0XHRyZXBsYWNlbWVudHMucHVzaChuZXcgU3RyaW5nUmVwbGFjZW1lbnQobmV3IE9mZnNldFJhbmdlKHN0YXJ0LCBlbmRFeCksIHRleHQpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFN0cmluZ0VkaXQocmVwbGFjZW1lbnRzKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgZW1wdHkgPSBuZXcgU3RyaW5nRWRpdChbXSk7XG5cblx0cHVibGljIHN0YXRpYyBjcmVhdGUocmVwbGFjZW1lbnRzOiByZWFkb25seSBTdHJpbmdSZXBsYWNlbWVudFtdKTogU3RyaW5nRWRpdCB7XG5cdFx0cmV0dXJuIG5ldyBTdHJpbmdFZGl0KHJlcGxhY2VtZW50cyk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHNpbmdsZShyZXBsYWNlbWVudDogU3RyaW5nUmVwbGFjZW1lbnQpOiBTdHJpbmdFZGl0IHtcblx0XHRyZXR1cm4gbmV3IFN0cmluZ0VkaXQoW3JlcGxhY2VtZW50XSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHJlcGxhY2UocmFuZ2U6IE9mZnNldFJhbmdlLCByZXBsYWNlbWVudDogc3RyaW5nKTogU3RyaW5nRWRpdCB7XG5cdFx0cmV0dXJuIG5ldyBTdHJpbmdFZGl0KFtuZXcgU3RyaW5nUmVwbGFjZW1lbnQocmFuZ2UsIHJlcGxhY2VtZW50KV0pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBpbnNlcnQob2Zmc2V0OiBudW1iZXIsIHJlcGxhY2VtZW50OiBzdHJpbmcpOiBTdHJpbmdFZGl0IHtcblx0XHRyZXR1cm4gbmV3IFN0cmluZ0VkaXQoW25ldyBTdHJpbmdSZXBsYWNlbWVudChPZmZzZXRSYW5nZS5lbXB0eUF0KG9mZnNldCksIHJlcGxhY2VtZW50KV0pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBkZWxldGUocmFuZ2U6IE9mZnNldFJhbmdlKTogU3RyaW5nRWRpdCB7XG5cdFx0cmV0dXJuIG5ldyBTdHJpbmdFZGl0KFtuZXcgU3RyaW5nUmVwbGFjZW1lbnQocmFuZ2UsICcnKV0pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBmcm9tSnNvbihkYXRhOiBJU2VyaWFsaXplZFN0cmluZ0VkaXQpOiBTdHJpbmdFZGl0IHtcblx0XHRyZXR1cm4gbmV3IFN0cmluZ0VkaXQoZGF0YS5tYXAoU3RyaW5nUmVwbGFjZW1lbnQuZnJvbUpzb24pKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY29tcG9zZShlZGl0czogcmVhZG9ubHkgU3RyaW5nRWRpdFtdKTogU3RyaW5nRWRpdCB7XG5cdFx0aWYgKGVkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFN0cmluZ0VkaXQuZW1wdHk7XG5cdFx0fVxuXHRcdGxldCByZXN1bHQgPSBlZGl0c1swXTtcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGVkaXRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRyZXN1bHQgPSByZXN1bHQuY29tcG9zZShlZGl0c1tpXSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIHJlcGxhY2VtZW50cyBhcmUgYXBwbGllZCBpbiBvcmRlciFcblx0ICogRXF1YWxzIGBTdHJpbmdFZGl0LmNvbXBvc2UocmVwbGFjZW1lbnRzLm1hcChyID0+IHIudG9FZGl0KCkpKWAsIGJ1dCBpcyBtdWNoIG1vcmUgcGVyZm9ybWFudC5cblx0Ki9cblx0cHVibGljIHN0YXRpYyBjb21wb3NlU2VxdWVudGlhbFJlcGxhY2VtZW50cyhyZXBsYWNlbWVudHM6IHJlYWRvbmx5IFN0cmluZ1JlcGxhY2VtZW50W10pOiBTdHJpbmdFZGl0IHtcblx0XHRsZXQgZWRpdCA9IFN0cmluZ0VkaXQuZW1wdHk7XG5cdFx0bGV0IGN1ckVkaXRSZXBsYWNlbWVudHM6IFN0cmluZ1JlcGxhY2VtZW50W10gPSBbXTsgLy8gVGhlc2UgYXJlIHJldmVyc2Ugc29ydGVkXG5cblx0XHRmb3IgKGNvbnN0IHIgb2YgcmVwbGFjZW1lbnRzKSB7XG5cdFx0XHRjb25zdCBsYXN0ID0gY3VyRWRpdFJlcGxhY2VtZW50cy5hdCgtMSk7XG5cdFx0XHRpZiAoIWxhc3QgfHwgci5yZXBsYWNlUmFuZ2UuaXNCZWZvcmUobGFzdC5yZXBsYWNlUmFuZ2UpKSB7XG5cdFx0XHRcdC8vIERldGVjdCBzdWJzZXF1ZW5jZXMgb2YgcmV2ZXJzZSBzb3J0ZWQgcmVwbGFjZW1lbnRzXG5cdFx0XHRcdGN1ckVkaXRSZXBsYWNlbWVudHMucHVzaChyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIE9uY2UgdGhlIHN1YnNlcXVlbmNlIGlzIGJyb2tlbiwgY29tcG9zZSB0aGUgY3VycmVudCByZXBsYWNlbWVudHMgYW5kIGxvb2sgZm9yIGEgbmV3IHN1YnNlcXVlbmNlLlxuXHRcdFx0XHRlZGl0ID0gZWRpdC5jb21wb3NlKFN0cmluZ0VkaXQuY3JlYXRlKGN1ckVkaXRSZXBsYWNlbWVudHMucmV2ZXJzZSgpKSk7XG5cdFx0XHRcdGN1ckVkaXRSZXBsYWNlbWVudHMgPSBbcl07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZWRpdCA9IGVkaXQuY29tcG9zZShTdHJpbmdFZGl0LmNyZWF0ZShjdXJFZGl0UmVwbGFjZW1lbnRzLnJldmVyc2UoKSkpO1xuXHRcdHJldHVybiBlZGl0O1xuXHR9XG5cblx0Y29uc3RydWN0b3IocmVwbGFjZW1lbnRzOiByZWFkb25seSBTdHJpbmdSZXBsYWNlbWVudFtdKSB7XG5cdFx0c3VwZXIocmVwbGFjZW1lbnRzKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfY3JlYXRlTmV3KHJlcGxhY2VtZW50czogcmVhZG9ubHkgU3RyaW5nUmVwbGFjZW1lbnRbXSk6IFN0cmluZ0VkaXQge1xuXHRcdHJldHVybiBuZXcgU3RyaW5nRWRpdChyZXBsYWNlbWVudHMpO1xuXHR9XG59XG5cbi8qKlxuICogV2FybmluZzogQmUgY2FyZWZ1bCB3aGVuIGNoYW5naW5nIHRoaXMgdHlwZSwgYXMgaXQgaXMgdXNlZCBmb3Igc2VyaWFsaXphdGlvbiFcbiovXG5leHBvcnQgdHlwZSBJU2VyaWFsaXplZFN0cmluZ0VkaXQgPSBJU2VyaWFsaXplZFN0cmluZ1JlcGxhY2VtZW50W107XG5cbi8qKlxuICogV2FybmluZzogQmUgY2FyZWZ1bCB3aGVuIGNoYW5naW5nIHRoaXMgdHlwZSwgYXMgaXQgaXMgdXNlZCBmb3Igc2VyaWFsaXphdGlvbiFcbiovXG5leHBvcnQgaW50ZXJmYWNlIElTZXJpYWxpemVkU3RyaW5nUmVwbGFjZW1lbnQge1xuXHR0eHQ6IHN0cmluZztcblx0cG9zOiBudW1iZXI7XG5cdGxlbjogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgU3RyaW5nUmVwbGFjZW1lbnQgZXh0ZW5kcyBCYXNlU3RyaW5nUmVwbGFjZW1lbnQ8U3RyaW5nUmVwbGFjZW1lbnQ+IHtcblx0cHVibGljIHN0YXRpYyBpbnNlcnQob2Zmc2V0OiBudW1iZXIsIHRleHQ6IHN0cmluZyk6IFN0cmluZ1JlcGxhY2VtZW50IHtcblx0XHRyZXR1cm4gbmV3IFN0cmluZ1JlcGxhY2VtZW50KE9mZnNldFJhbmdlLmVtcHR5QXQob2Zmc2V0KSwgdGV4dCk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHJlcGxhY2UocmFuZ2U6IE9mZnNldFJhbmdlLCB0ZXh0OiBzdHJpbmcpOiBTdHJpbmdSZXBsYWNlbWVudCB7XG5cdFx0cmV0dXJuIG5ldyBTdHJpbmdSZXBsYWNlbWVudChyYW5nZSwgdGV4dCk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRlbGV0ZShyYW5nZTogT2Zmc2V0UmFuZ2UpOiBTdHJpbmdSZXBsYWNlbWVudCB7XG5cdFx0cmV0dXJuIG5ldyBTdHJpbmdSZXBsYWNlbWVudChyYW5nZSwgJycpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBmcm9tSnNvbihkYXRhOiBJU2VyaWFsaXplZFN0cmluZ1JlcGxhY2VtZW50KTogU3RyaW5nUmVwbGFjZW1lbnQge1xuXHRcdHJldHVybiBuZXcgU3RyaW5nUmVwbGFjZW1lbnQoT2Zmc2V0UmFuZ2Uub2ZTdGFydEFuZExlbmd0aChkYXRhLnBvcywgZGF0YS5sZW4pLCBkYXRhLnR4dCk7XG5cdH1cblxuXHRvdmVycmlkZSBlcXVhbHMob3RoZXI6IFN0cmluZ1JlcGxhY2VtZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucmVwbGFjZVJhbmdlLmVxdWFscyhvdGhlci5yZXBsYWNlUmFuZ2UpICYmIHRoaXMubmV3VGV4dCA9PT0gb3RoZXIubmV3VGV4dDtcblx0fVxuXG5cdG92ZXJyaWRlIHRyeUpvaW5Ub3VjaGluZyhvdGhlcjogU3RyaW5nUmVwbGFjZW1lbnQpOiBTdHJpbmdSZXBsYWNlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIG5ldyBTdHJpbmdSZXBsYWNlbWVudCh0aGlzLnJlcGxhY2VSYW5nZS5qb2luUmlnaHRUb3VjaGluZyhvdGhlci5yZXBsYWNlUmFuZ2UpLCB0aGlzLm5ld1RleHQgKyBvdGhlci5uZXdUZXh0KTtcblx0fVxuXG5cdG92ZXJyaWRlIHNsaWNlKHJhbmdlOiBPZmZzZXRSYW5nZSwgcmFuZ2VJblJlcGxhY2VtZW50PzogT2Zmc2V0UmFuZ2UpOiBTdHJpbmdSZXBsYWNlbWVudCB7XG5cdFx0cmV0dXJuIG5ldyBTdHJpbmdSZXBsYWNlbWVudChyYW5nZSwgcmFuZ2VJblJlcGxhY2VtZW50ID8gcmFuZ2VJblJlcGxhY2VtZW50LnN1YnN0cmluZyh0aGlzLm5ld1RleHQpIDogdGhpcy5uZXdUZXh0KTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gYXBwbHlFZGl0c1RvUmFuZ2VzKHNvcnRlZFJhbmdlczogT2Zmc2V0UmFuZ2VbXSwgZWRpdDogU3RyaW5nRWRpdCk6IE9mZnNldFJhbmdlW10ge1xuXHRzb3J0ZWRSYW5nZXMgPSBzb3J0ZWRSYW5nZXMuc2xpY2UoKTtcblxuXHQvLyB0cmVhdCBlZGl0cyBhcyBkZWxldGlvbiBvZiB0aGUgcmVwbGFjZSByYW5nZSBhbmQgdGhlbiBhcyBpbnNlcnRpb24gdGhhdCBleHRlbmRzIHRoZSBmaXJzdCByYW5nZVxuXHRjb25zdCByZXN1bHQ6IE9mZnNldFJhbmdlW10gPSBbXTtcblxuXHRsZXQgb2Zmc2V0ID0gMDtcblxuXHRmb3IgKGNvbnN0IGUgb2YgZWRpdC5yZXBsYWNlbWVudHMpIHtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Ly8gcmFuZ2VzIGJlZm9yZSB0aGUgY3VycmVudCBlZGl0XG5cdFx0XHRjb25zdCByID0gc29ydGVkUmFuZ2VzWzBdO1xuXHRcdFx0aWYgKCFyIHx8IHIuZW5kRXhjbHVzaXZlID49IGUucmVwbGFjZVJhbmdlLnN0YXJ0KSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0c29ydGVkUmFuZ2VzLnNoaWZ0KCk7XG5cdFx0XHRyZXN1bHQucHVzaChyLmRlbHRhKG9mZnNldCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGludGVyc2VjdGluZzogT2Zmc2V0UmFuZ2VbXSA9IFtdO1xuXHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRjb25zdCByID0gc29ydGVkUmFuZ2VzWzBdO1xuXHRcdFx0aWYgKCFyIHx8ICFyLmludGVyc2VjdHNPclRvdWNoZXMoZS5yZXBsYWNlUmFuZ2UpKSB7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0c29ydGVkUmFuZ2VzLnNoaWZ0KCk7XG5cdFx0XHRpbnRlcnNlY3RpbmcucHVzaChyKTtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gaW50ZXJzZWN0aW5nLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRsZXQgciA9IGludGVyc2VjdGluZ1tpXTtcblxuXHRcdFx0Y29uc3Qgb3ZlcmxhcCA9IHIuaW50ZXJzZWN0KGUucmVwbGFjZVJhbmdlKSEubGVuZ3RoO1xuXHRcdFx0ciA9IHIuZGVsdGFFbmQoLW92ZXJsYXAgKyAoaSA9PT0gMCA/IGUubmV3VGV4dC5sZW5ndGggOiAwKSk7XG5cblx0XHRcdGNvbnN0IHJhbmdlQWhlYWRPZlJlcGxhY2VSYW5nZSA9IHIuc3RhcnQgLSBlLnJlcGxhY2VSYW5nZS5zdGFydDtcblx0XHRcdGlmIChyYW5nZUFoZWFkT2ZSZXBsYWNlUmFuZ2UgPiAwKSB7XG5cdFx0XHRcdHIgPSByLmRlbHRhKC1yYW5nZUFoZWFkT2ZSZXBsYWNlUmFuZ2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaSAhPT0gMCkge1xuXHRcdFx0XHRyID0gci5kZWx0YShlLm5ld1RleHQubGVuZ3RoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gV2UgYWxyZWFkeSB0b29rIG91ciBvZmZzZXQgaW50byBhY2NvdW50LlxuXHRcdFx0Ly8gQmVjYXVzZSB3ZSBhZGQgciBiYWNrIHRvIHRoZSBxdWV1ZSAod2hpY2ggdGhlbiBhZGRzIG9mZnNldCBhZ2FpbiksXG5cdFx0XHQvLyB3ZSBoYXZlIHRvIHJlbW92ZSBpdCBoZXJlLlxuXHRcdFx0ciA9IHIuZGVsdGEoLShlLm5ld1RleHQubGVuZ3RoIC0gZS5yZXBsYWNlUmFuZ2UubGVuZ3RoKSk7XG5cblx0XHRcdHNvcnRlZFJhbmdlcy51bnNoaWZ0KHIpO1xuXHRcdH1cblxuXHRcdG9mZnNldCArPSBlLm5ld1RleHQubGVuZ3RoIC0gZS5yZXBsYWNlUmFuZ2UubGVuZ3RoO1xuXHR9XG5cblx0d2hpbGUgKHRydWUpIHtcblx0XHRjb25zdCByID0gc29ydGVkUmFuZ2VzWzBdO1xuXHRcdGlmICghcikge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdHNvcnRlZFJhbmdlcy5zaGlmdCgpO1xuXHRcdHJlc3VsdC5wdXNoKHIuZGVsdGEob2Zmc2V0KSk7XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgZGF0YSBhc3NvY2lhdGVkIHRvIGEgc2luZ2xlIGVkaXQsIHdoaWNoIHN1cnZpdmVzIGNlcnRhaW4gZWRpdCBvcGVyYXRpb25zLlxuKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUVkaXREYXRhPFQ+IHtcblx0am9pbihvdGhlcjogVCk6IFQgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBWb2lkRWRpdERhdGEgaW1wbGVtZW50cyBJRWRpdERhdGE8Vm9pZEVkaXREYXRhPiB7XG5cdGpvaW4ob3RoZXI6IFZvaWRFZGl0RGF0YSk6IFZvaWRFZGl0RGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXM7XG5cdH1cbn1cblxuLyoqXG4gKiBSZXByZXNlbnRzIGEgc2V0IG9mIHJlcGxhY2VtZW50cyB0byBhIHN0cmluZy5cbiAqIEFsbCB0aGVzZSByZXBsYWNlbWVudHMgYXJlIGFwcGxpZWQgYXQgb25jZS5cbiovXG5leHBvcnQgY2xhc3MgQW5ub3RhdGVkU3RyaW5nRWRpdDxUIGV4dGVuZHMgSUVkaXREYXRhPFQ+PiBleHRlbmRzIEJhc2VTdHJpbmdFZGl0PEFubm90YXRlZFN0cmluZ1JlcGxhY2VtZW50PFQ+LCBBbm5vdGF0ZWRTdHJpbmdFZGl0PFQ+PiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgZW1wdHkgPSBuZXcgQW5ub3RhdGVkU3RyaW5nRWRpdDxuZXZlcj4oW10pO1xuXG5cdHB1YmxpYyBzdGF0aWMgY3JlYXRlPFQgZXh0ZW5kcyBJRWRpdERhdGE8VD4+KHJlcGxhY2VtZW50czogcmVhZG9ubHkgQW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQ8VD5bXSk6IEFubm90YXRlZFN0cmluZ0VkaXQ8VD4ge1xuXHRcdHJldHVybiBuZXcgQW5ub3RhdGVkU3RyaW5nRWRpdChyZXBsYWNlbWVudHMpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBzaW5nbGU8VCBleHRlbmRzIElFZGl0RGF0YTxUPj4ocmVwbGFjZW1lbnQ6IEFubm90YXRlZFN0cmluZ1JlcGxhY2VtZW50PFQ+KTogQW5ub3RhdGVkU3RyaW5nRWRpdDxUPiB7XG5cdFx0cmV0dXJuIG5ldyBBbm5vdGF0ZWRTdHJpbmdFZGl0KFtyZXBsYWNlbWVudF0pO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyByZXBsYWNlPFQgZXh0ZW5kcyBJRWRpdERhdGE8VD4+KHJhbmdlOiBPZmZzZXRSYW5nZSwgcmVwbGFjZW1lbnQ6IHN0cmluZywgZGF0YTogVCk6IEFubm90YXRlZFN0cmluZ0VkaXQ8VD4ge1xuXHRcdHJldHVybiBuZXcgQW5ub3RhdGVkU3RyaW5nRWRpdChbbmV3IEFubm90YXRlZFN0cmluZ1JlcGxhY2VtZW50KHJhbmdlLCByZXBsYWNlbWVudCwgZGF0YSldKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgaW5zZXJ0PFQgZXh0ZW5kcyBJRWRpdERhdGE8VD4+KG9mZnNldDogbnVtYmVyLCByZXBsYWNlbWVudDogc3RyaW5nLCBkYXRhOiBUKTogQW5ub3RhdGVkU3RyaW5nRWRpdDxUPiB7XG5cdFx0cmV0dXJuIG5ldyBBbm5vdGF0ZWRTdHJpbmdFZGl0KFtuZXcgQW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQoT2Zmc2V0UmFuZ2UuZW1wdHlBdChvZmZzZXQpLCByZXBsYWNlbWVudCwgZGF0YSldKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgZGVsZXRlPFQgZXh0ZW5kcyBJRWRpdERhdGE8VD4+KHJhbmdlOiBPZmZzZXRSYW5nZSwgZGF0YTogVCk6IEFubm90YXRlZFN0cmluZ0VkaXQ8VD4ge1xuXHRcdHJldHVybiBuZXcgQW5ub3RhdGVkU3RyaW5nRWRpdChbbmV3IEFubm90YXRlZFN0cmluZ1JlcGxhY2VtZW50KHJhbmdlLCAnJywgZGF0YSldKTtcblx0fVxuXG5cdHB1YmxpYyBzdGF0aWMgY29tcG9zZTxUIGV4dGVuZHMgSUVkaXREYXRhPFQ+PihlZGl0czogcmVhZG9ubHkgQW5ub3RhdGVkU3RyaW5nRWRpdDxUPltdKTogQW5ub3RhdGVkU3RyaW5nRWRpdDxUPiB7XG5cdFx0aWYgKGVkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIEFubm90YXRlZFN0cmluZ0VkaXQuZW1wdHk7XG5cdFx0fVxuXHRcdGxldCByZXN1bHQgPSBlZGl0c1swXTtcblx0XHRmb3IgKGxldCBpID0gMTsgaSA8IGVkaXRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRyZXN1bHQgPSByZXN1bHQuY29tcG9zZShlZGl0c1tpXSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihyZXBsYWNlbWVudHM6IHJlYWRvbmx5IEFubm90YXRlZFN0cmluZ1JlcGxhY2VtZW50PFQ+W10pIHtcblx0XHRzdXBlcihyZXBsYWNlbWVudHMpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9jcmVhdGVOZXcocmVwbGFjZW1lbnRzOiByZWFkb25seSBBbm5vdGF0ZWRTdHJpbmdSZXBsYWNlbWVudDxUPltdKTogQW5ub3RhdGVkU3RyaW5nRWRpdDxUPiB7XG5cdFx0cmV0dXJuIG5ldyBBbm5vdGF0ZWRTdHJpbmdFZGl0PFQ+KHJlcGxhY2VtZW50cyk7XG5cdH1cblxuXHRwdWJsaWMgdG9TdHJpbmdFZGl0KGZpbHRlcj86IChyZXBsYWNlbWVudDogQW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQ8VD4pID0+IGJvb2xlYW4pOiBTdHJpbmdFZGl0IHtcblx0XHRjb25zdCBuZXdSZXBsYWNlbWVudHM6IFN0cmluZ1JlcGxhY2VtZW50W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHIgb2YgdGhpcy5yZXBsYWNlbWVudHMpIHtcblx0XHRcdGlmICghZmlsdGVyIHx8IGZpbHRlcihyKSkge1xuXHRcdFx0XHRuZXdSZXBsYWNlbWVudHMucHVzaChuZXcgU3RyaW5nUmVwbGFjZW1lbnQoci5yZXBsYWNlUmFuZ2UsIHIubmV3VGV4dCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbmV3IFN0cmluZ0VkaXQobmV3UmVwbGFjZW1lbnRzKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQ8VCBleHRlbmRzIElFZGl0RGF0YTxUPj4gZXh0ZW5kcyBCYXNlU3RyaW5nUmVwbGFjZW1lbnQ8QW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQ8VD4+IHtcblx0cHVibGljIHN0YXRpYyBpbnNlcnQ8VCBleHRlbmRzIElFZGl0RGF0YTxUPj4ob2Zmc2V0OiBudW1iZXIsIHRleHQ6IHN0cmluZywgZGF0YTogVCk6IEFubm90YXRlZFN0cmluZ1JlcGxhY2VtZW50PFQ+IHtcblx0XHRyZXR1cm4gbmV3IEFubm90YXRlZFN0cmluZ1JlcGxhY2VtZW50PFQ+KE9mZnNldFJhbmdlLmVtcHR5QXQob2Zmc2V0KSwgdGV4dCwgZGF0YSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHJlcGxhY2U8VCBleHRlbmRzIElFZGl0RGF0YTxUPj4ocmFuZ2U6IE9mZnNldFJhbmdlLCB0ZXh0OiBzdHJpbmcsIGRhdGE6IFQpOiBBbm5vdGF0ZWRTdHJpbmdSZXBsYWNlbWVudDxUPiB7XG5cdFx0cmV0dXJuIG5ldyBBbm5vdGF0ZWRTdHJpbmdSZXBsYWNlbWVudDxUPihyYW5nZSwgdGV4dCwgZGF0YSk7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGRlbGV0ZTxUIGV4dGVuZHMgSUVkaXREYXRhPFQ+PihyYW5nZTogT2Zmc2V0UmFuZ2UsIGRhdGE6IFQpOiBBbm5vdGF0ZWRTdHJpbmdSZXBsYWNlbWVudDxUPiB7XG5cdFx0cmV0dXJuIG5ldyBBbm5vdGF0ZWRTdHJpbmdSZXBsYWNlbWVudDxUPihyYW5nZSwgJycsIGRhdGEpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmFuZ2U6IE9mZnNldFJhbmdlLFxuXHRcdG5ld1RleHQ6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgZGF0YTogVFxuXHQpIHtcblx0XHRzdXBlcihyYW5nZSwgbmV3VGV4dCk7XG5cdH1cblxuXHRvdmVycmlkZSBlcXVhbHMob3RoZXI6IEFubm90YXRlZFN0cmluZ1JlcGxhY2VtZW50PFQ+KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMucmVwbGFjZVJhbmdlLmVxdWFscyhvdGhlci5yZXBsYWNlUmFuZ2UpICYmIHRoaXMubmV3VGV4dCA9PT0gb3RoZXIubmV3VGV4dCAmJiB0aGlzLmRhdGEgPT09IG90aGVyLmRhdGE7XG5cdH1cblxuXHR0cnlKb2luVG91Y2hpbmcob3RoZXI6IEFubm90YXRlZFN0cmluZ1JlcGxhY2VtZW50PFQ+KTogQW5ub3RhdGVkU3RyaW5nUmVwbGFjZW1lbnQ8VD4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGpvaW5lZCA9IHRoaXMuZGF0YS5qb2luKG90aGVyLmRhdGEpO1xuXHRcdGlmIChqb2luZWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBBbm5vdGF0ZWRTdHJpbmdSZXBsYWNlbWVudCh0aGlzLnJlcGxhY2VSYW5nZS5qb2luUmlnaHRUb3VjaGluZyhvdGhlci5yZXBsYWNlUmFuZ2UpLCB0aGlzLm5ld1RleHQgKyBvdGhlci5uZXdUZXh0LCBqb2luZWQpO1xuXHR9XG5cblx0c2xpY2UocmFuZ2U6IE9mZnNldFJhbmdlLCByYW5nZUluUmVwbGFjZW1lbnQ/OiBPZmZzZXRSYW5nZSk6IEFubm90YXRlZFN0cmluZ1JlcGxhY2VtZW50PFQ+IHtcblx0XHRyZXR1cm4gbmV3IEFubm90YXRlZFN0cmluZ1JlcGxhY2VtZW50KHJhbmdlLCByYW5nZUluUmVwbGFjZW1lbnQgPyByYW5nZUluUmVwbGFjZW1lbnQuc3Vic3RyaW5nKHRoaXMubmV3VGV4dCkgOiB0aGlzLm5ld1RleHQsIHRoaXMuZGF0YSk7XG5cdH1cbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgYm90aCByYW5nZXMgYXJlIGVtcHR5IChpbnNlcnRzKSBhdCB0aGUgZXhhY3Qgc2FtZSBwb3NpdGlvbi5cbiAqIEluIHRoaXMgY2FzZSwgYWx0aG91Z2ggdGhleSBkb24ndCBcImludGVyc2VjdFwiIGluIHRoZSB0cmFkaXRpb25hbCBzZW5zZSxcbiAqIHRoZXkgY29uZmxpY3QgYmVjYXVzZSB0aGUgb3JkZXIgb2YgaW5zZXJ0aW9uIG1hdHRlcnMuXG4gKi9cbmZ1bmN0aW9uIGFyZUNvbmN1cnJlbnRJbnNlcnRzKHIxOiBPZmZzZXRSYW5nZSwgcjI6IE9mZnNldFJhbmdlKTogYm9vbGVhbiB7XG5cdHJldHVybiByMS5pc0VtcHR5ICYmIHIyLmlzRW1wdHkgJiYgcjEuc3RhcnQgPT09IHIyLnN0YXJ0O1xufVxuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiBgaW5zZXJ0YCBpcyBhbiBlbXB0eSByYW5nZSAoaW5zZXJ0KSBzdHJpY3RseSBpbnNpZGUgYHJhbmdlYC5cbiAqIEZvciBleGFtcGxlLCBpbnNlcnQgYXQgcG9zaXRpb24gNSBpcyBpbnNpZGUgWzMsIDcpIGJ1dCBub3QgaW5zaWRlIFs1LCA3KSBvciBbMywgNSkuXG4gKi9cbmZ1bmN0aW9uIGlzSW5zZXJ0U3RyaWN0bHlJbnNpZGVSYW5nZShpbnNlcnQ6IE9mZnNldFJhbmdlLCByYW5nZTogT2Zmc2V0UmFuZ2UpOiBib29sZWFuIHtcblx0cmV0dXJuIGluc2VydC5pc0VtcHR5ICYmIHJhbmdlLnN0YXJ0IDwgaW5zZXJ0LnN0YXJ0ICYmIGluc2VydC5zdGFydCA8IHJhbmdlLmVuZEV4Y2x1c2l2ZTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsb0JBQW9CLDBCQUEwQjtBQUN2RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFVBQVUsdUJBQXVCO0FBSW5DLE1BQWUsdUJBQTJKLFNBQW1CO0FBQUEsRUFDbk0sSUFBSSxlQUFrQjtBQUNyQixVQUFNLElBQUksTUFBTSxnREFBZ0Q7QUFBQSxFQUNqRTtBQUFBLEVBRUEsT0FBYyxtQkFBNkMsT0FBb0M7QUFDOUYsUUFBSSxNQUFNLFdBQVcsR0FBRztBQUN2QixhQUFPO0FBQUEsSUFDUjtBQUNBLFFBQUksU0FBUyxNQUFNLENBQUM7QUFDcEIsYUFBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLFFBQVEsS0FBSztBQUV0QyxlQUFTLE9BQU8sUUFBUSxNQUFNLENBQUMsQ0FBQztBQUFBLElBQ2pDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFB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
