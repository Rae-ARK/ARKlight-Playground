import * as buffer from "../../../base/common/buffer.js";
import { decodeUTF16LE } from "./stringBuilder.js";
function escapeNewLine(str) {
  return str.replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}
class TextChange {
  constructor(oldPosition, oldText, newPosition, newText) {
    this.oldPosition = oldPosition;
    this.oldText = oldText;
    this.newPosition = newPosition;
    this.newText = newText;
  }
  get oldLength() {
    return this.oldText.length;
  }
  get oldEnd() {
    return this.oldPosition + this.oldText.length;
  }
  get newLength() {
    return this.newText.length;
  }
  get newEnd() {
    return this.newPosition + this.newText.length;
  }
  toString() {
    if (this.oldText.length === 0) {
      return `(insert@${this.oldPosition} "${escapeNewLine(this.newText)}")`;
    }
    if (this.newText.length === 0) {
      return `(delete@${this.oldPosition} "${escapeNewLine(this.oldText)}")`;
    }
    return `(replace@${this.oldPosition} "${escapeNewLine(this.oldText)}" with "${escapeNewLine(this.newText)}")`;
  }
  static _writeStringSize(str) {
    return 4 + 2 * str.length;
  }
  static _writeString(b, str, offset) {
    const len = str.length;
    buffer.writeUInt32BE(b, len, offset);
    offset += 4;
    for (let i = 0; i < len; i++) {
      buffer.writeUInt16LE(b, str.charCodeAt(i), offset);
      offset += 2;
    }
    return offset;
  }
  static _readString(b, offset) {
    const len = buffer.readUInt32BE(b, offset);
    offset += 4;
    return decodeUTF16LE(b, offset, len);
  }
  writeSize() {
    return 4 + 4 + TextChange._writeStringSize(this.oldText) + TextChange._writeStringSize(this.newText);
  }
  write(b, offset) {
    buffer.writeUInt32BE(b, this.oldPosition, offset);
    offset += 4;
    buffer.writeUInt32BE(b, this.newPosition, offset);
    offset += 4;
    offset = TextChange._writeString(b, this.oldText, offset);
    offset = TextChange._writeString(b, this.newText, offset);
    return offset;
  }
  static read(b, offset, dest) {
    const oldPosition = buffer.readUInt32BE(b, offset);
    offset += 4;
    const newPosition = buffer.readUInt32BE(b, offset);
    offset += 4;
    const oldText = TextChange._readString(b, offset);
    offset += TextChange._writeStringSize(oldText);
    const newText = TextChange._readString(b, offset);
    offset += TextChange._writeStringSize(newText);
    dest.push(new TextChange(oldPosition, oldText, newPosition, newText));
    return offset;
  }
}
function compressConsecutiveTextChanges(prevEdits, currEdits) {
  if (prevEdits === null || prevEdits.length === 0) {
    return currEdits;
  }
  const compressor = new TextChangeCompressor(prevEdits, currEdits);
  return compressor.compress();
}
class TextChangeCompressor {
  constructor(prevEdits, currEdits) {
    this._prevEdits = prevEdits;
    this._currEdits = currEdits;
    this._result = [];
    this._resultLen = 0;
    this._prevLen = this._prevEdits.length;
    this._prevDeltaOffset = 0;
    this._currLen = this._currEdits.length;
    this._currDeltaOffset = 0;
  }
  compress() {
    let prevIndex = 0;
    let currIndex = 0;
    let prevEdit = this._getPrev(prevIndex);
    let currEdit = this._getCurr(currIndex);
    while (prevIndex < this._prevLen || currIndex < this._currLen) {
      if (prevEdit === null) {
        this._acceptCurr(currEdit);
        currEdit = this._getCurr(++currIndex);
        continue;
      }
      if (currEdit === null) {
        this._acceptPrev(prevEdit);
        prevEdit = this._getPrev(++prevIndex);
        continue;
      }
      if (currEdit.oldEnd <= prevEdit.newPosition) {
        this._acceptCurr(currEdit);
        currEdit = this._getCurr(++currIndex);
        continue;
      }
      if (prevEdit.newEnd <= currEdit.oldPosition) {
        this._acceptPrev(prevEdit);
        prevEdit = this._getPrev(++prevIndex);
        continue;
      }
      if (currEdit.oldPosition < prevEdit.newPosition) {
        const [e1, e2] = TextChangeCompressor._splitCurr(currEdit, prevEdit.newPosition - currEdit.oldPosition);
        this._acceptCurr(e1);
        currEdit = e2;
        continue;
      }
      if (prevEdit.newPosition < currEdit.oldPosition) {
        const [e1, e2] = TextChangeCompressor._splitPrev(prevEdit, currEdit.oldPosition - prevEdit.newPosition);
        this._acceptPrev(e1);
        prevEdit = e2;
        continue;
      }
      let mergePrev;
      let mergeCurr;
      if (currEdit.oldEnd === prevEdit.newEnd) {
        mergePrev = prevEdit;
        mergeCurr = currEdit;
        prevEdit = this._getPrev(++prevIndex);
        currEdit = this._getCurr(++currIndex);
      } else if (currEdit.oldEnd < prevEdit.newEnd) {
        const [e1, e2] = TextChangeCompressor._splitPrev(prevEdit, currEdit.oldLength);
        mergePrev = e1;
        mergeCurr = currEdit;
        prevEdit = e2;
        currEdit = this._getCurr(++currIndex);
      } else {
        const [e1, e2] = TextChangeCompressor._splitCurr(currEdit, prevEdit.newLength);
        mergePrev = prevEdit;
        mergeCurr = e1;
        prevEdit = this._getPrev(++prevIndex);
        currEdit = e2;
      }
      this._result[this._resultLen++] = new TextChange(
        mergePrev.oldPosition,
        mergePrev.oldText,
        mergeCurr.newPosition,
        mergeCurr.newText
      );
      this._prevDeltaOffset += mergePrev.newLength - mergePrev.oldLength;
      this._currDeltaOffset += mergeCurr.newLength - mergeCurr.oldLength;
    }
    const merged = TextChangeCompressor._merge(this._result);
    const cleaned = TextChangeCompressor._removeNoOps(merged);
    return cleaned;
  }
  _acceptCurr(currEdit) {
    this._result[this._resultLen++] = TextChangeCompressor._rebaseCurr(this._prevDeltaOffset, currEdit);
    this._currDeltaOffset += currEdit.newLength - currEdit.oldLength;
  }
  _getCurr(currIndex) {
    return currIndex < this._currLen ? this._currEdits[currIndex] : null;
  }
  _acceptPrev(prevEdit) {
    this._result[this._resultLen++] = TextChangeCompressor._rebasePrev(this._currDeltaOffset, prevEdit);
    this._prevDeltaOffset += prevEdit.newLength - prevEdit.oldLength;
  }
  _getPrev(prevIndex) {
    return prevIndex < this._prevLen ? this._prevEdits[prevIndex] : null;
  }
  static _rebaseCurr(prevDeltaOffset, currEdit) {
    return new TextChange(
      currEdit.oldPosition - prevDeltaOffset,
      currEdit.oldText,
      currEdit.newPosition,
      currEdit.newText
    );
  }
  static _rebasePrev(currDeltaOffset, prevEdit) {
    return new TextChange(
      prevEdit.oldPosition,
      prevEdit.oldText,
      prevEdit.newPosition + currDeltaOffset,
      prevEdit.newText
    );
  }
  static _splitPrev(edit, offset) {
    const preText = edit.newText.substr(0, offset);
    const postText = edit.newText.substr(offset);
    return [
      new TextChange(
        edit.oldPosition,
        edit.oldText,
        edit.newPosition,
        preText
      ),
      new TextChange(
        edit.oldEnd,
        "",
        edit.newPosition + offset,
        postText
      )
    ];
  }
  static _splitCurr(edit, offset) {
    const preText = edit.oldText.substr(0, offset);
    const postText = edit.oldText.substr(offset);
    return [
      new TextChange(
        edit.oldPosition,
        preText,
        edit.newPosition,
        edit.newText
      ),
      new TextChange(
        edit.oldPosition + offset,
        postText,
        edit.newEnd,
        ""
      )
    ];
  }
  static _merge(edits) {
    if (edits.length === 0) {
      return edits;
    }
    const result = [];
    let resultLen = 0;
    let prev = edits[0];
    for (let i = 1; i < edits.length; i++) {
      const curr = edits[i];
      if (prev.oldEnd === curr.oldPosition) {
        prev = new TextChange(
          prev.oldPosition,
          prev.oldText + curr.oldText,
          prev.newPosition,
          prev.newText + curr.newText
        );
      } else {
        result[resultLen++] = prev;
        prev = curr;
      }
    }
    result[resultLen++] = prev;
    return result;
  }
  static _removeNoOps(edits) {
    if (edits.length === 0) {
      return edits;
    }
    const result = [];
    let resultLen = 0;
    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      if (edit.oldText === edit.newText) {
        continue;
      }
      result[resultLen++] = edit;
    }
    return result;
  }
}
export {
  TextChange,
  compressConsecutiveTextChanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vY29yZS90ZXh0Q2hhbmdlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgYnVmZmVyIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBkZWNvZGVVVEYxNkxFIH0gZnJvbSAnLi9zdHJpbmdCdWlsZGVyLmpzJztcblxuZnVuY3Rpb24gZXNjYXBlTmV3TGluZShzdHI6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiAoXG5cdFx0c3RyXG5cdFx0XHQucmVwbGFjZSgvXFxuL2csICdcXFxcbicpXG5cdFx0XHQucmVwbGFjZSgvXFxyL2csICdcXFxccicpXG5cdCk7XG59XG5cbmV4cG9ydCBjbGFzcyBUZXh0Q2hhbmdlIHtcblxuXHRwdWJsaWMgZ2V0IG9sZExlbmd0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm9sZFRleHQubGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIGdldCBvbGRFbmQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5vbGRQb3NpdGlvbiArIHRoaXMub2xkVGV4dC5sZW5ndGg7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IG5ld0xlbmd0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLm5ld1RleHQubGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIGdldCBuZXdFbmQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5uZXdQb3NpdGlvbiArIHRoaXMubmV3VGV4dC5sZW5ndGg7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgb2xkUG9zaXRpb246IG51bWJlcixcblx0XHRwdWJsaWMgcmVhZG9ubHkgb2xkVGV4dDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBuZXdQb3NpdGlvbjogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBuZXdUZXh0OiBzdHJpbmdcblx0KSB7IH1cblxuXHRwdWJsaWMgdG9TdHJpbmcoKTogc3RyaW5nIHtcblx0XHRpZiAodGhpcy5vbGRUZXh0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGAoaW5zZXJ0QCR7dGhpcy5vbGRQb3NpdGlvbn0gXCIke2VzY2FwZU5ld0xpbmUodGhpcy5uZXdUZXh0KX1cIilgO1xuXHRcdH1cblx0XHRpZiAodGhpcy5uZXdUZXh0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGAoZGVsZXRlQCR7dGhpcy5vbGRQb3NpdGlvbn0gXCIke2VzY2FwZU5ld0xpbmUodGhpcy5vbGRUZXh0KX1cIilgO1xuXHRcdH1cblx0XHRyZXR1cm4gYChyZXBsYWNlQCR7dGhpcy5vbGRQb3NpdGlvbn0gXCIke2VzY2FwZU5ld0xpbmUodGhpcy5vbGRUZXh0KX1cIiB3aXRoIFwiJHtlc2NhcGVOZXdMaW5lKHRoaXMubmV3VGV4dCl9XCIpYDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF93cml0ZVN0cmluZ1NpemUoc3RyOiBzdHJpbmcpOiBudW1iZXIge1xuXHRcdHJldHVybiAoXG5cdFx0XHQ0ICsgMiAqIHN0ci5sZW5ndGhcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3dyaXRlU3RyaW5nKGI6IFVpbnQ4QXJyYXksIHN0cjogc3RyaW5nLCBvZmZzZXQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0Y29uc3QgbGVuID0gc3RyLmxlbmd0aDtcblx0XHRidWZmZXIud3JpdGVVSW50MzJCRShiLCBsZW4sIG9mZnNldCk7IG9mZnNldCArPSA0O1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGJ1ZmZlci53cml0ZVVJbnQxNkxFKGIsIHN0ci5jaGFyQ29kZUF0KGkpLCBvZmZzZXQpOyBvZmZzZXQgKz0gMjtcblx0XHR9XG5cdFx0cmV0dXJuIG9mZnNldDtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yZWFkU3RyaW5nKGI6IFVpbnQ4QXJyYXksIG9mZnNldDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRjb25zdCBsZW4gPSBidWZmZXIucmVhZFVJbnQzMkJFKGIsIG9mZnNldCk7IG9mZnNldCArPSA0O1xuXHRcdHJldHVybiBkZWNvZGVVVEYxNkxFKGIsIG9mZnNldCwgbGVuKTtcblx0fVxuXG5cdHB1YmxpYyB3cml0ZVNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gKFxuXHRcdFx0KyA0IC8vIG9sZFBvc2l0aW9uXG5cdFx0XHQrIDQgLy8gbmV3UG9zaXRpb25cblx0XHRcdCsgVGV4dENoYW5nZS5fd3JpdGVTdHJpbmdTaXplKHRoaXMub2xkVGV4dClcblx0XHRcdCsgVGV4dENoYW5nZS5fd3JpdGVTdHJpbmdTaXplKHRoaXMubmV3VGV4dClcblx0XHQpO1xuXHR9XG5cblx0cHVibGljIHdyaXRlKGI6IFVpbnQ4QXJyYXksIG9mZnNldDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRidWZmZXIud3JpdGVVSW50MzJCRShiLCB0aGlzLm9sZFBvc2l0aW9uLCBvZmZzZXQpOyBvZmZzZXQgKz0gNDtcblx0XHRidWZmZXIud3JpdGVVSW50MzJCRShiLCB0aGlzLm5ld1Bvc2l0aW9uLCBvZmZzZXQpOyBvZmZzZXQgKz0gNDtcblx0XHRvZmZzZXQgPSBUZXh0Q2hhbmdlLl93cml0ZVN0cmluZyhiLCB0aGlzLm9sZFRleHQsIG9mZnNldCk7XG5cdFx0b2Zmc2V0ID0gVGV4dENoYW5nZS5fd3JpdGVTdHJpbmcoYiwgdGhpcy5uZXdUZXh0LCBvZmZzZXQpO1xuXHRcdHJldHVybiBvZmZzZXQ7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIHJlYWQoYjogVWludDhBcnJheSwgb2Zmc2V0OiBudW1iZXIsIGRlc3Q6IFRleHRDaGFuZ2VbXSk6IG51bWJlciB7XG5cdFx0Y29uc3Qgb2xkUG9zaXRpb24gPSBidWZmZXIucmVhZFVJbnQzMkJFKGIsIG9mZnNldCk7IG9mZnNldCArPSA0O1xuXHRcdGNvbnN0IG5ld1Bvc2l0aW9uID0gYnVmZmVyLnJlYWRVSW50MzJCRShiLCBvZmZzZXQpOyBvZmZzZXQgKz0gNDtcblx0XHRjb25zdCBvbGRUZXh0ID0gVGV4dENoYW5nZS5fcmVhZFN0cmluZyhiLCBvZmZzZXQpOyBvZmZzZXQgKz0gVGV4dENoYW5nZS5fd3JpdGVTdHJpbmdTaXplKG9sZFRleHQpO1xuXHRcdGNvbnN0IG5ld1RleHQgPSBUZXh0Q2hhbmdlLl9yZWFkU3RyaW5nKGIsIG9mZnNldCk7IG9mZnNldCArPSBUZXh0Q2hhbmdlLl93cml0ZVN0cmluZ1NpemUobmV3VGV4dCk7XG5cdFx0ZGVzdC5wdXNoKG5ldyBUZXh0Q2hhbmdlKG9sZFBvc2l0aW9uLCBvbGRUZXh0LCBuZXdQb3NpdGlvbiwgbmV3VGV4dCkpO1xuXHRcdHJldHVybiBvZmZzZXQ7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbXByZXNzQ29uc2VjdXRpdmVUZXh0Q2hhbmdlcyhwcmV2RWRpdHM6IFRleHRDaGFuZ2VbXSB8IG51bGwsIGN1cnJFZGl0czogVGV4dENoYW5nZVtdKTogVGV4dENoYW5nZVtdIHtcblx0aWYgKHByZXZFZGl0cyA9PT0gbnVsbCB8fCBwcmV2RWRpdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIGN1cnJFZGl0cztcblx0fVxuXHRjb25zdCBjb21wcmVzc29yID0gbmV3IFRleHRDaGFuZ2VDb21wcmVzc29yKHByZXZFZGl0cywgY3VyckVkaXRzKTtcblx0cmV0dXJuIGNvbXByZXNzb3IuY29tcHJlc3MoKTtcbn1cblxuY2xhc3MgVGV4dENoYW5nZUNvbXByZXNzb3Ige1xuXG5cdHByaXZhdGUgX3ByZXZFZGl0czogVGV4dENoYW5nZVtdO1xuXHRwcml2YXRlIF9jdXJyRWRpdHM6IFRleHRDaGFuZ2VbXTtcblxuXHRwcml2YXRlIF9yZXN1bHQ6IFRleHRDaGFuZ2VbXTtcblx0cHJpdmF0ZSBfcmVzdWx0TGVuOiBudW1iZXI7XG5cblx0cHJpdmF0ZSBfcHJldkxlbjogbnVtYmVyO1xuXHRwcml2YXRlIF9wcmV2RGVsdGFPZmZzZXQ6IG51bWJlcjtcblxuXHRwcml2YXRlIF9jdXJyTGVuOiBudW1iZXI7XG5cdHByaXZhdGUgX2N1cnJEZWx0YU9mZnNldDogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKHByZXZFZGl0czogVGV4dENoYW5nZVtdLCBjdXJyRWRpdHM6IFRleHRDaGFuZ2VbXSkge1xuXHRcdHRoaXMuX3ByZXZFZGl0cyA9IHByZXZFZGl0cztcblx0XHR0aGlzLl9jdXJyRWRpdHMgPSBjdXJyRWRpdHM7XG5cblx0XHR0aGlzLl9yZXN1bHQgPSBbXTtcblx0XHR0aGlzLl9yZXN1bHRMZW4gPSAwO1xuXG5cdFx0dGhpcy5fcHJldkxlbiA9IHRoaXMuX3ByZXZFZGl0cy5sZW5ndGg7XG5cdFx0dGhpcy5fcHJldkRlbHRhT2Zmc2V0ID0gMDtcblxuXHRcdHRoaXMuX2N1cnJMZW4gPSB0aGlzLl9jdXJyRWRpdHMubGVuZ3RoO1xuXHRcdHRoaXMuX2N1cnJEZWx0YU9mZnNldCA9IDA7XG5cdH1cblxuXHRwdWJsaWMgY29tcHJlc3MoKTogVGV4dENoYW5nZVtdIHtcblx0XHRsZXQgcHJldkluZGV4ID0gMDtcblx0XHRsZXQgY3VyckluZGV4ID0gMDtcblxuXHRcdGxldCBwcmV2RWRpdCA9IHRoaXMuX2dldFByZXYocHJldkluZGV4KTtcblx0XHRsZXQgY3VyckVkaXQgPSB0aGlzLl9nZXRDdXJyKGN1cnJJbmRleCk7XG5cblx0XHR3aGlsZSAocHJldkluZGV4IDwgdGhpcy5fcHJldkxlbiB8fCBjdXJySW5kZXggPCB0aGlzLl9jdXJyTGVuKSB7XG5cblx0XHRcdGlmIChwcmV2RWRpdCA9PT0gbnVsbCkge1xuXHRcdFx0XHR0aGlzLl9hY2NlcHRDdXJyKGN1cnJFZGl0ISk7XG5cdFx0XHRcdGN1cnJFZGl0ID0gdGhpcy5fZ2V0Q3VycigrK2N1cnJJbmRleCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY3VyckVkaXQgPT09IG51bGwpIHtcblx0XHRcdFx0dGhpcy5fYWNjZXB0UHJldihwcmV2RWRpdCk7XG5cdFx0XHRcdHByZXZFZGl0ID0gdGhpcy5fZ2V0UHJldigrK3ByZXZJbmRleCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoY3VyckVkaXQub2xkRW5kIDw9IHByZXZFZGl0Lm5ld1Bvc2l0aW9uKSB7XG5cdFx0XHRcdHRoaXMuX2FjY2VwdEN1cnIoY3VyckVkaXQpO1xuXHRcdFx0XHRjdXJyRWRpdCA9IHRoaXMuX2dldEN1cnIoKytjdXJySW5kZXgpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHByZXZFZGl0Lm5ld0VuZCA8PSBjdXJyRWRpdC5vbGRQb3NpdGlvbikge1xuXHRcdFx0XHR0aGlzLl9hY2NlcHRQcmV2KHByZXZFZGl0KTtcblx0XHRcdFx0cHJldkVkaXQgPSB0aGlzLl9nZXRQcmV2KCsrcHJldkluZGV4KTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChjdXJyRWRpdC5vbGRQb3NpdGlvbiA8IHByZXZFZGl0Lm5ld1Bvc2l0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IFtlMSwgZTJdID0gVGV4dENoYW5nZUNvbXByZXNzb3IuX3NwbGl0Q3VycihjdXJyRWRpdCwgcHJldkVkaXQubmV3UG9zaXRpb24gLSBjdXJyRWRpdC5vbGRQb3NpdGlvbik7XG5cdFx0XHRcdHRoaXMuX2FjY2VwdEN1cnIoZTEpO1xuXHRcdFx0XHRjdXJyRWRpdCA9IGUyO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHByZXZFZGl0Lm5ld1Bvc2l0aW9uIDwgY3VyckVkaXQub2xkUG9zaXRpb24pIHtcblx0XHRcdFx0Y29uc3QgW2UxLCBlMl0gPSBUZXh0Q2hhbmdlQ29tcHJlc3Nvci5fc3BsaXRQcmV2KHByZXZFZGl0LCBjdXJyRWRpdC5vbGRQb3NpdGlvbiAtIHByZXZFZGl0Lm5ld1Bvc2l0aW9uKTtcblx0XHRcdFx0dGhpcy5fYWNjZXB0UHJldihlMSk7XG5cdFx0XHRcdHByZXZFZGl0ID0gZTI7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBdCB0aGlzIHBvaW50LCBjdXJyRWRpdC5vbGRQb3NpdGlvbiA9PT0gcHJldkVkaXQubmV3UG9zaXRpb25cblxuXHRcdFx0bGV0IG1lcmdlUHJldjogVGV4dENoYW5nZTtcblx0XHRcdGxldCBtZXJnZUN1cnI6IFRleHRDaGFuZ2U7XG5cblx0XHRcdGlmIChjdXJyRWRpdC5vbGRFbmQgPT09IHByZXZFZGl0Lm5ld0VuZCkge1xuXHRcdFx0XHRtZXJnZVByZXYgPSBwcmV2RWRpdDtcblx0XHRcdFx0bWVyZ2VDdXJyID0gY3VyckVkaXQ7XG5cdFx0XHRcdHByZXZFZGl0ID0gdGhpcy5fZ2V0UHJldigrK3ByZXZJbmRleCk7XG5cdFx0XHRcdGN1cnJFZGl0ID0gdGhpcy5fZ2V0Q3VycigrK2N1cnJJbmRleCk7XG5cdFx0XHR9IGVsc2UgaWYgKGN1cnJFZGl0Lm9sZEVuZCA8IHByZXZFZGl0Lm5ld0VuZCkge1xuXHRcdFx0XHRjb25zdCBbZTEsIGUyXSA9IFRleHRDaGFuZ2VDb21wcmVzc29yLl9zcGxpdFByZXYocHJldkVkaXQsIGN1cnJFZGl0Lm9sZExlbmd0aCk7XG5cdFx0XHRcdG1lcmdlUHJldiA9IGUxO1xuXHRcdFx0XHRtZXJnZUN1cnIgPSBjdXJyRWRpdDtcblx0XHRcdFx0cHJldkVkaXQgPSBlMjtcblx0XHRcdFx0Y3VyckVkaXQgPSB0aGlzLl9nZXRDdXJyKCsrY3VyckluZGV4KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IFtlMSwgZTJdID0gVGV4dENoYW5nZUNvbXByZXNzb3IuX3NwbGl0Q3VycihjdXJyRWRpdCwgcHJldkVkaXQubmV3TGVuZ3RoKTtcblx0XHRcdFx0bWVyZ2VQcmV2ID0gcHJldkVkaXQ7XG5cdFx0XHRcdG1lcmdlQ3VyciA9IGUxO1xuXHRcdFx0XHRwcmV2RWRpdCA9IHRoaXMuX2dldFByZXYoKytwcmV2SW5kZXgpO1xuXHRcdFx0XHRjdXJyRWRpdCA9IGUyO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9yZXN1bHRbdGhpcy5fcmVzdWx0TGVuKytdID0gbmV3IFRleHRDaGFuZ2UoXG5cdFx0XHRcdG1lcmdlUHJldi5vbGRQb3NpdGlvbixcblx0XHRcdFx0bWVyZ2VQcmV2Lm9sZFRleHQsXG5cdFx0XHRcdG1lcmdlQ3Vyci5uZXdQb3NpdGlvbixcblx0XHRcdFx0bWVyZ2VDdXJyLm5ld1RleHRcblx0XHRcdCk7XG5cdFx0XHR0aGlzLl9wcmV2RGVsdGFPZmZzZXQgKz0gbWVyZ2VQcmV2Lm5ld0xlbmd0aCAtIG1lcmdlUHJldi5vbGRMZW5ndGg7XG5cdFx0XHR0aGlzLl9jdXJyRGVsdGFPZmZzZXQgKz0gbWVyZ2VDdXJyLm5ld0xlbmd0aCAtIG1lcmdlQ3Vyci5vbGRMZW5ndGg7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWVyZ2VkID0gVGV4dENoYW5nZUNvbXByZXNzb3IuX21lcmdlKHRoaXMuX3Jlc3VsdCk7XG5cdFx0Y29uc3QgY2xlYW5lZCA9IFRleHRDaGFuZ2VDb21wcmVzc29yLl9yZW1vdmVOb09wcyhtZXJnZWQpO1xuXHRcdHJldHVybiBjbGVhbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWNjZXB0Q3VycihjdXJyRWRpdDogVGV4dENoYW5nZSk6IHZvaWQge1xuXHRcdHRoaXMuX3Jlc3VsdFt0aGlzLl9yZXN1bHRMZW4rK10gPSBUZXh0Q2hhbmdlQ29tcHJlc3Nvci5fcmViYXNlQ3Vycih0aGlzLl9wcmV2RGVsdGFPZmZzZXQsIGN1cnJFZGl0KTtcblx0XHR0aGlzLl9jdXJyRGVsdGFPZmZzZXQgKz0gY3VyckVkaXQubmV3TGVuZ3RoIC0gY3VyckVkaXQub2xkTGVuZ3RoO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q3VycihjdXJySW5kZXg6IG51bWJlcik6IFRleHRDaGFuZ2UgfCBudWxsIHtcblx0XHRyZXR1cm4gKGN1cnJJbmRleCA8IHRoaXMuX2N1cnJMZW4gPyB0aGlzLl9jdXJyRWRpdHNbY3VyckluZGV4XSA6IG51bGwpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYWNjZXB0UHJldihwcmV2RWRpdDogVGV4dENoYW5nZSk6IHZvaWQge1xuXHRcdHRoaXMuX3Jlc3VsdFt0aGlzLl9yZXN1bHRMZW4rK10gPSBUZXh0Q2hhbmdlQ29tcHJlc3Nvci5fcmViYXNlUHJldih0aGlzLl9jdXJyRGVsdGFPZmZzZXQsIHByZXZFZGl0KTtcblx0XHR0aGlzLl9wcmV2RGVsdGFPZmZzZXQgKz0gcHJldkVkaXQubmV3TGVuZ3RoIC0gcHJldkVkaXQub2xkTGVuZ3RoO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0UHJldihwcmV2SW5kZXg6IG51bWJlcik6IFRleHRDaGFuZ2UgfCBudWxsIHtcblx0XHRyZXR1cm4gKHByZXZJbmRleCA8IHRoaXMuX3ByZXZMZW4gPyB0aGlzLl9wcmV2RWRpdHNbcHJldkluZGV4XSA6IG51bGwpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3JlYmFzZUN1cnIocHJldkRlbHRhT2Zmc2V0OiBudW1iZXIsIGN1cnJFZGl0OiBUZXh0Q2hhbmdlKTogVGV4dENoYW5nZSB7XG5cdFx0cmV0dXJuIG5ldyBUZXh0Q2hhbmdlKFxuXHRcdFx0Y3VyckVkaXQub2xkUG9zaXRpb24gLSBwcmV2RGVsdGFPZmZzZXQsXG5cdFx0XHRjdXJyRWRpdC5vbGRUZXh0LFxuXHRcdFx0Y3VyckVkaXQubmV3UG9zaXRpb24sXG5cdFx0XHRjdXJyRWRpdC5uZXdUZXh0XG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIF9yZWJhc2VQcmV2KGN1cnJEZWx0YU9mZnNldDogbnVtYmVyLCBwcmV2RWRpdDogVGV4dENoYW5nZSk6IFRleHRDaGFuZ2Uge1xuXHRcdHJldHVybiBuZXcgVGV4dENoYW5nZShcblx0XHRcdHByZXZFZGl0Lm9sZFBvc2l0aW9uLFxuXHRcdFx0cHJldkVkaXQub2xkVGV4dCxcblx0XHRcdHByZXZFZGl0Lm5ld1Bvc2l0aW9uICsgY3VyckRlbHRhT2Zmc2V0LFxuXHRcdFx0cHJldkVkaXQubmV3VGV4dFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfc3BsaXRQcmV2KGVkaXQ6IFRleHRDaGFuZ2UsIG9mZnNldDogbnVtYmVyKTogW1RleHRDaGFuZ2UsIFRleHRDaGFuZ2VdIHtcblx0XHRjb25zdCBwcmVUZXh0ID0gZWRpdC5uZXdUZXh0LnN1YnN0cigwLCBvZmZzZXQpO1xuXHRcdGNvbnN0IHBvc3RUZXh0ID0gZWRpdC5uZXdUZXh0LnN1YnN0cihvZmZzZXQpO1xuXG5cdFx0cmV0dXJuIFtcblx0XHRcdG5ldyBUZXh0Q2hhbmdlKFxuXHRcdFx0XHRlZGl0Lm9sZFBvc2l0aW9uLFxuXHRcdFx0XHRlZGl0Lm9sZFRleHQsXG5cdFx0XHRcdGVkaXQubmV3UG9zaXRpb24sXG5cdFx0XHRcdHByZVRleHRcblx0XHRcdCksXG5cdFx0XHRuZXcgVGV4dENoYW5nZShcblx0XHRcdFx0ZWRpdC5vbGRFbmQsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHRlZGl0Lm5ld1Bvc2l0aW9uICsgb2Zmc2V0LFxuXHRcdFx0XHRwb3N0VGV4dFxuXHRcdFx0KVxuXHRcdF07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfc3BsaXRDdXJyKGVkaXQ6IFRleHRDaGFuZ2UsIG9mZnNldDogbnVtYmVyKTogW1RleHRDaGFuZ2UsIFRleHRDaGFuZ2VdIHtcblx0XHRjb25zdCBwcmVUZXh0ID0gZWRpdC5vbGRUZXh0LnN1YnN0cigwLCBvZmZzZXQpO1xuXHRcdGNvbnN0IHBvc3RUZXh0ID0gZWRpdC5vbGRUZXh0LnN1YnN0cihvZmZzZXQpO1xuXG5cdFx0cmV0dXJuIFtcblx0XHRcdG5ldyBUZXh0Q2hhbmdlKFxuXHRcdFx0XHRlZGl0Lm9sZFBvc2l0aW9uLFxuXHRcdFx0XHRwcmVUZXh0LFxuXHRcdFx0XHRlZGl0Lm5ld1Bvc2l0aW9uLFxuXHRcdFx0XHRlZGl0Lm5ld1RleHRcblx0XHRcdCksXG5cdFx0XHRuZXcgVGV4dENoYW5nZShcblx0XHRcdFx0ZWRpdC5vbGRQb3NpdGlvbiArIG9mZnNldCxcblx0XHRcdFx0cG9zdFRleHQsXG5cdFx0XHRcdGVkaXQubmV3RW5kLFxuXHRcdFx0XHQnJ1xuXHRcdFx0KVxuXHRcdF07XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfbWVyZ2UoZWRpdHM6IFRleHRDaGFuZ2VbXSk6IFRleHRDaGFuZ2VbXSB7XG5cdFx0aWYgKGVkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGVkaXRzO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogVGV4dENoYW5nZVtdID0gW107XG5cdFx0bGV0IHJlc3VsdExlbiA9IDA7XG5cblx0XHRsZXQgcHJldiA9IGVkaXRzWzBdO1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgZWRpdHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGN1cnIgPSBlZGl0c1tpXTtcblxuXHRcdFx0aWYgKHByZXYub2xkRW5kID09PSBjdXJyLm9sZFBvc2l0aW9uKSB7XG5cdFx0XHRcdC8vIE1lcmdlIGludG8gYHByZXZgXG5cdFx0XHRcdHByZXYgPSBuZXcgVGV4dENoYW5nZShcblx0XHRcdFx0XHRwcmV2Lm9sZFBvc2l0aW9uLFxuXHRcdFx0XHRcdHByZXYub2xkVGV4dCArIGN1cnIub2xkVGV4dCxcblx0XHRcdFx0XHRwcmV2Lm5ld1Bvc2l0aW9uLFxuXHRcdFx0XHRcdHByZXYubmV3VGV4dCArIGN1cnIubmV3VGV4dFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0W3Jlc3VsdExlbisrXSA9IHByZXY7XG5cdFx0XHRcdHByZXYgPSBjdXJyO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXN1bHRbcmVzdWx0TGVuKytdID0gcHJldjtcblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmVtb3ZlTm9PcHMoZWRpdHM6IFRleHRDaGFuZ2VbXSk6IFRleHRDaGFuZ2VbXSB7XG5cdFx0aWYgKGVkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGVkaXRzO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdDogVGV4dENoYW5nZVtdID0gW107XG5cdFx0bGV0IHJlc3VsdExlbiA9IDA7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGVkaXRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBlZGl0ID0gZWRpdHNbaV07XG5cblx0XHRcdGlmIChlZGl0Lm9sZFRleHQgPT09IGVkaXQubmV3VGV4dCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdFtyZXN1bHRMZW4rK10gPSBlZGl0O1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixTQUFTLHFCQUFxQjtBQUU5QixTQUFTLGNBQWMsS0FBcUI7QUFDM0MsU0FDQyxJQUNFLFFBQVEsT0FBTyxLQUFLLEVBQ3BCLFFBQVEsT0FBTyxLQUFLO0FBRXhCO0FBRU8sTUFBTSxXQUFXO0FBQUEsRUFrQnZCLFlBQ2lCLGFBQ0EsU0FDQSxhQUNBLFNBQ2Y7QUFKZTtBQUNBO0FBQ0E7QUFDQTtBQUFBLEVBQ2I7QUFBQSxFQXJCSixJQUFXLFlBQW9CO0FBQzlCLFdBQU8sS0FBSyxRQUFRO0FBQUEsRUFDckI7QUFBQSxFQUVBLElBQVcsU0FBaUI7QUFDM0IsV0FBTyxLQUFLLGNBQWMsS0FBSyxRQUFRO0FBQUEsRUFDeEM7QUFBQSxFQUVBLElBQVcsWUFBb0I7QUFDOUIsV0FBTyxLQUFLLFFBQVE7QUFBQSxFQUNyQjtBQUFBLEVBRUEsSUFBVyxTQUFpQjtBQUMzQixXQUFPLEtBQUssY0FBYyxLQUFLLFFBQVE7QUFBQSxFQUN4QztBQUFBLEVBU08sV0FBbUI7QUFDekIsUUFBSSxLQUFLLFFBQVEsV0FBVyxHQUFHO0FBQzlCLGFBQU8sV0FBVyxLQUFLLFdBQVcsS0FBSyxjQUFjLEtBQUssT0FBTyxDQUFDO0FBQUEsSUFDbkU7QUFDQSxRQUFJLEtBQUssUUFBUSxXQUFXLEdBQUc7QUFDOUIsYUFBTyxXQUFXLEtBQUssV0FBVyxLQUFLLGNBQWMsS0FBSyxPQUFPLENBQUM7QUFBQSxJQUNuRTtBQUNBLFdBQU8sWUFBWSxLQUFLLFdBQVcsS0FBSyxjQUFjLEtBQUssT0FBTyxDQUFDLFdBQVcsY0FBYyxLQUFLLE9BQU8sQ0FBQztBQUFBLEVBQzFHO0FBQUEsRUFFQSxPQUFlLGlCQUFpQixLQUFxQjtBQUNwRCxXQUNDLElBQUksSUFBSSxJQUFJO0FBQUEsRUFFZDtBQUFBLEVBRUEsT0FBZSxhQUFhLEdBQWUsS0FBYSxRQUF3QjtBQUMvRSxVQUFNLE1BQU0sSUFBSTtBQUNoQixXQUFPLGNBQWMsR0FBRyxLQUFLLE1BQU07QUFBRyxjQUFVO0FBQ2hELGFBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxLQUFLO0FBQzdCLGFBQU8sY0FBYyxHQUFHLElBQUksV0FBVyxDQUFDLEdBQUcsTUFBTTtBQUFHLGdCQUFVO0FBQUEsSUFDL0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsT0FBZSxZQUFZLEdBQWUsUUFBd0I7QUFDakUsVUFBTSxNQUFNLE9BQU8sYUFBYSxHQUFHLE1BQU07QUFBRyxjQUFVO0FBQ3RELFdBQU8sY0FBYyxHQUFHLFFBQVEsR0FBRztBQUFBLEVBQ3BDO0FBQUEsRUFFTyxZQUFvQjtBQUMxQixXQUNDLElBQ0UsSUFDQSxXQUFXLGlCQUFpQixLQUFLLE9BQU8sSUFDeEMsV0FBVyxpQkFBaUIsS0FBSyxPQUFPO0FBQUEsRUFFNUM7QUFBQSxFQUVPLE1BQU0sR0FBZSxRQUF3QjtBQUNuRCxXQUFPLGNBQWMsR0FBRyxLQUFLLGFBQWEsTUFBTTtBQUFHLGNBQVU7QUFDN0QsV0FBTyxjQUFjLEdBQUcsS0FBSyxhQUFhLE1BQU07QUFBRyxjQUFVO0FBQzdELGFBQVMsV0FBVyxhQUFhLEdBQUcsS0FBSyxTQUFTLE1BQU07QUFDeEQsYUFBUyxXQUFXLGFBQWEsR0FBRyxLQUFLLFNBQVMsTUFBTTtBQUN4RCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsT0FBYyxLQUFLLEdBQWUsUUFBZ0IsTUFBNEI7QUFDN0UsVUFBTSxjQUFjLE9BQU8sYUFBYSxHQUFHLE1BQU07QUFBRyxjQUFVO0FBQzlELFVBQU0sY0FBYyxPQUFPLGFBQWEsR0FBRyxNQUFNO0FBQUcsY0FBVTtBQUM5RCxVQUFNLFVBQVUsV0FBVyxZQUFZLEdBQUcsTUFBTTtBQUFHLGNBQVUsV0FBVyxpQkFBaUIsT0FBTztBQUNoRyxVQUFNLFVBQVUsV0FBVyxZQUFZLEdBQUcsTUFBTTtBQUFHLGNBQVUsV0FBVyxpQkFBaUIsT0FBTztBQUNoRyxTQUFLLEtBQUssSUFBSSxXQUFXLGFBQWEsU0FBUyxhQUFhLE9BQU8sQ0FBQztBQUNwRSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRU8sU0FBUywrQkFBK0IsV0FBZ0MsV0FBdUM7QUFDckgsTUFBSSxjQUFjLFFBQVEsVUFBVSxXQUFXLEdBQUc7QUFDakQsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLGFBQWEsSUFBSSxxQkFBcUIsV0FBVyxTQUFTO0FBQ2hFLFNBQU8sV0FBVyxTQUFTO0FBQzVCO0FBRUEsTUFBTSxxQkFBcUI7QUFBQSxFQWMxQixZQUFZLFdBQXlCLFdBQXlCO0FBQzdELFNBQUssYUFBYTtBQUNsQixTQUFLLGFBQWE7QUFFbEIsU0FBSyxVQUFVLENBQUM7QUFDaEIsU0FBSyxhQUFhO0FBRWxCLFNBQUssV0FBVyxLQUFLLFdBQVc7QUFDaEMsU0FBSyxtQkFBbUI7QUFFeEIsU0FBSyxXQUFXLEtBQUssV0FBVztBQUNoQyxTQUFLLG1CQUFtQjtBQUFBLEVBQ3pCO0FBQUEsRUFFTyxXQUF5QjtBQUMvQixRQUFJLFlBQVk7QUFDaEIsUUFBSSxZQUFZO0FBRWhCLFFBQUksV0FBVyxLQUFLLFNBQVMsU0FBUztBQUN0QyxRQUFJLFdBQVcsS0FBSyxTQUFTLFNBQVM7QUFFdEMsV0FBTyxZQUFZLEtBQUssWUFBWSxZQUFZLEtBQUssVUFBVTtBQUU5RCxVQUFJLGFBQWEsTUFBTTtBQUN0QixhQUFLLFlBQVksUUFBUztBQUMxQixtQkFBVyxLQUFLLFNBQVMsRUFBRSxTQUFTO0FBQ3BDO0FBQUEsTUFDRDtBQUVBLFVBQUksYUFBYSxNQUFNO0FBQ3RCLGFBQUssWUFBWSxRQUFRO0FBQ3pCLG1CQUFXLEtBQUssU0FBUyxFQUFFLFNBQVM7QUFDcEM7QUFBQSxNQUNEO0FBRUEsVUFBSSxTQUFTLFVBQVUsU0FBUyxhQUFhO0FBQzVDLGFBQUssWUFBWSxRQUFRO0FBQ3pCLG1CQUFXLEtBQUssU0FBUyxFQUFFLFNBQVM7QUFDcEM7QUFBQSxNQUNEO0FBRUEsVUFBSSxTQUFTLFVBQVUsU0FBUyxhQUFhO0FBQzVDLGFBQUssWUFBWSxRQUFRO0FBQ3pCLG1CQUFXLEtBQUssU0FBUyxFQUFFLFNBQVM7QUFDcEM7QUFBQSxNQUNEO0FBRUEsVUFBSSxTQUFTLGNBQWMsU0FBUyxhQUFhO0FBQ2hELGNBQU0sQ0FBQyxJQUFJLEVBQUUsSUFBSSxxQkFBcUIsV0FBVyxVQUFVLFNBQVMsY0FBYyxTQUFTLFdBQVc7QUFDdEcsYUFBSyxZQUFZLEVBQUU7QUFDbkIsbUJBQVc7QUFDWDtBQUFBLE1BQ0Q7QUFFQSxVQUFJLFNBQVMsY0FBYyxTQUFTLGFBQWE7QUFDaEQsY0FBTSxDQUFDLElBQUksRUFBRSxJQUFJLHFCQUFxQixXQUFXLFVBQVUsU0FBUyxjQUFjLFNBQVMsV0FBVztBQUN0RyxhQUFLLFlBQVksRUFBRTtBQUNuQixtQkFBVztBQUNYO0FBQUEsTUFDRDtBQUlBLFVBQUk7QUFDSixVQUFJO0FBRUosVUFBSSxTQUFTLFdBQVcsU0FBUyxRQUFRO0FBQ3hDLG9CQUFZO0FBQ1osb0JBQVk7QUFDWixtQkFBVyxLQUFLLFNBQVMsRUFBRSxTQUFTO0FBQ3BDLG1CQUFXLEtBQUssU0FBUyxFQUFFLFNBQVM7QUFBQSxNQUNyQyxXQUFXLFNBQVMsU0FBUyxTQUFTLFFBQVE7QUFDN0MsY0FBTSxDQUFDLElBQUksRUFBRSxJQUFJLHFCQUFxQixXQUFXLFVBQVUsU0FBUyxTQUFTO0FBQzdFLG9CQUFZO0FBQ1osb0JBQVk7QUFDWixtQkFBVztBQUNYLG1CQUFXLEtBQUssU0FBUyxFQUFFLFNBQVM7QUFBQSxNQUNyQyxPQUFPO0FBQ04sY0FBTSxDQUFDLElBQUksRUFBRSxJQUFJLHFCQUFxQixXQUFXLFVBQVUsU0FBUyxTQUFTO0FBQzdFLG9CQUFZO0FBQ1osb0JBQVk7QUFDWixtQkFBVyxLQUFLLFNBQVMsRUFBRSxTQUFTO0FBQ3BDLG1CQUFXO0FBQUEsTUFDWjtBQUVBLFdBQUssUUFBUSxLQUFLLFlBQVksSUFBSSxJQUFJO0FBQUEsUUFDckMsVUFBVTtBQUFBLFFBQ1YsVUFBVTtBQUFBLFFBQ1YsVUFBVTtBQUFBLFFBQ1YsVUFBVTtBQUFBLE1BQ1g7QUFDQSxXQUFLLG9CQUFvQixVQUFVLFlBQVksVUFBVTtBQUN6RCxXQUFLLG9CQUFvQixVQUFVLFlBQVksVUFBVTtBQUFBLElBQzFEO0FBRUEsVUFBTSxTQUFTLHFCQUFxQixPQUFPLEtBQUssT0FBTztBQUN2RCxVQUFNLFVBQVUscUJBQXFCLGFBQWEsTUFBTTtBQUN4RCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsWUFBWSxVQUE0QjtBQUMvQyxTQUFLLFFBQVEsS0FBSyxZQUFZLElBQUkscUJBQXFCLFlBQVksS0FBSyxrQkFBa0IsUUFBUTtBQUNsRyxTQUFLLG9CQUFvQixTQUFTLFlBQVksU0FBUztBQUFBLEVBQ3hEO0FBQUEsRUFFUSxTQUFTLFdBQXNDO0FBQ3RELFdBQVEsWUFBWSxLQUFLLFdBQVcsS0FBSyxXQUFXLFNBQVMsSUFBSTtBQUFBLEVBQ2xFO0FBQUEsRUFFUSxZQUFZLFVBQTRCO0FBQy9DLFNBQUssUUFBUSxLQUFLLFlBQVksSUFBSSxxQkFBcUIsWUFBWSxLQUFLLGtCQUFrQixRQUFRO0FBQ2xHLFNBQUssb0JBQW9CLFNBQVMsWUFBWSxTQUFTO0FBQUEsRUFDeEQ7QUFBQSxFQUVRLFNBQVMsV0FBc0M7QUFDdEQsV0FBUSxZQUFZLEtBQUssV0FBVyxLQUFLLFdBQVcsU0FBUyxJQUFJO0FBQUEsRUFDbEU7QUFBQSxFQUVBLE9BQWUsWUFBWSxpQkFBeUIsVUFBa0M7QUFDckYsV0FBTyxJQUFJO0FBQUEsTUFDVixTQUFTLGNBQWM7QUFBQSxNQUN2QixTQUFTO0FBQUEsTUFDVCxTQUFTO0FBQUEsTUFDVCxTQUFTO0FBQUEsSUFDVjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE9BQWUsWUFBWSxpQkFBeUIsVUFBa0M7QUFDckYsV0FBTyxJQUFJO0FBQUEsTUFDVixTQUFTO0FBQUEsTUFDVCxTQUFTO0FBQUEsTUFDVCxTQUFTLGNBQWM7QUFBQSxNQUN2QixTQUFTO0FBQUEsSUFDVjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE9BQWUsV0FBVyxNQUFrQixRQUEwQztBQUNyRixVQUFNLFVBQVUsS0FBSyxRQUFRLE9BQU8sR0FBRyxNQUFNO0FBQzdDLFVBQU0sV0FBVyxLQUFLLFFBQVEsT0FBTyxNQUFNO0FBRTNDLFdBQU87QUFBQSxNQUNOLElBQUk7QUFBQSxRQUNILEtBQUs7QUFBQSxRQUNMLEtBQUs7QUFBQSxRQUNMLEtBQUs7QUFBQSxRQUNMO0FBQUEsTUFDRDtBQUFBLE1BQ0EsSUFBSTtBQUFBLFFBQ0gsS0FBSztBQUFBLFFBQ0w7QUFBQSxRQUNBLEtBQUssY0FBYztBQUFBLFFBQ25CO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxPQUFlLFdBQVcsTUFBa0IsUUFBMEM7QUFDckYsVUFBTSxVQUFVLEtBQUssUUFBUSxPQUFPLEdBQUcsTUFBTTtBQUM3QyxVQUFNLFdBQVcsS0FBSyxRQUFRLE9BQU8sTUFBTTtBQUUzQyxXQUFPO0FBQUEsTUFDTixJQUFJO0FBQUEsUUFDSCxLQUFLO0FBQUEsUUFDTDtBQUFBLFFBQ0EsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLE1BQ047QUFBQSxNQUNBLElBQUk7QUFBQSxRQUNILEtBQUssY0FBYztBQUFBLFFBQ25CO0FBQUEsUUFDQSxLQUFLO0FBQUEsUUFDTDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsT0FBZSxPQUFPLE9BQW1DO0FBQ3hELFFBQUksTUFBTSxXQUFXLEdBQUc7QUFDdkIsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFNBQXVCLENBQUM7QUFDOUIsUUFBSSxZQUFZO0FBRWhCLFFBQUksT0FBTyxNQUFNLENBQUM7QUFDbEIsYUFBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLFFBQVEsS0FBSztBQUN0QyxZQUFNLE9BQU8sTUFBTSxDQUFDO0FBRXBCLFVBQUksS0FBSyxXQUFXLEtBQUssYUFBYTtBQUVyQyxlQUFPLElBQUk7QUFBQSxVQUNWLEtBQUs7QUFBQSxVQUNMLEtBQUssVUFBVSxLQUFLO0FBQUEsVUFDcEIsS0FBSztBQUFBLFVBQ0wsS0FBSyxVQUFVLEtBQUs7QUFBQSxRQUNyQjtBQUFBLE1BQ0QsT0FBTztBQUNOLGVBQU8sV0FBVyxJQUFJO0FBQ3RCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU8sV0FBVyxJQUFJO0FBRXRCLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxPQUFlLGFBQWEsT0FBbUM7QUFDOUQsUUFBSSxNQUFNLFdBQVcsR0FBRztBQUN2QixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sU0FBdUIsQ0FBQztBQUM5QixRQUFJLFlBQVk7QUFFaEIsYUFBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLFFBQVEsS0FBSztBQUN0QyxZQUFNLE9BQU8sTUFBTSxDQUFDO0FBRXBCLFVBQUksS0FBSyxZQUFZLEtBQUssU0FBUztBQUNsQztBQUFBLE1BQ0Q7QUFDQSxhQUFPLFdBQVcsSUFBSTtBQUFBLElBQ3ZCO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
