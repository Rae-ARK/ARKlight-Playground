import { Position } from "./position.js";
class Range {
  constructor(startLineNumber, startColumn, endLineNumber, endColumn) {
    if (startLineNumber > endLineNumber || startLineNumber === endLineNumber && startColumn > endColumn) {
      this.startLineNumber = endLineNumber;
      this.startColumn = endColumn;
      this.endLineNumber = startLineNumber;
      this.endColumn = startColumn;
    } else {
      this.startLineNumber = startLineNumber;
      this.startColumn = startColumn;
      this.endLineNumber = endLineNumber;
      this.endColumn = endColumn;
    }
  }
  /**
   * Test if this range is empty.
   */
  isEmpty() {
    return Range.isEmpty(this);
  }
  /**
   * Test if `range` is empty.
   */
  static isEmpty(range) {
    return range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn;
  }
  /**
   * Test if position is in this range. If the position is at the edges, will return true.
   */
  containsPosition(position) {
    return Range.containsPosition(this, position);
  }
  /**
   * Test if `position` is in `range`. If the position is at the edges, will return true.
   */
  static containsPosition(range, position) {
    if (position.lineNumber < range.startLineNumber || position.lineNumber > range.endLineNumber) {
      return false;
    }
    if (position.lineNumber === range.startLineNumber && position.column < range.startColumn) {
      return false;
    }
    if (position.lineNumber === range.endLineNumber && position.column > range.endColumn) {
      return false;
    }
    return true;
  }
  /**
   * Test if `position` is in `range`. If the position is at the edges, will return false.
   * @internal
   */
  static strictContainsPosition(range, position) {
    if (position.lineNumber < range.startLineNumber || position.lineNumber > range.endLineNumber) {
      return false;
    }
    if (position.lineNumber === range.startLineNumber && position.column <= range.startColumn) {
      return false;
    }
    if (position.lineNumber === range.endLineNumber && position.column >= range.endColumn) {
      return false;
    }
    return true;
  }
  /**
   * Test if range is in this range. If the range is equal to this range, will return true.
   */
  containsRange(range) {
    return Range.containsRange(this, range);
  }
  /**
   * Test if `otherRange` is in `range`. If the ranges are equal, will return true.
   */
  static containsRange(range, otherRange) {
    if (otherRange.startLineNumber < range.startLineNumber || otherRange.endLineNumber < range.startLineNumber) {
      return false;
    }
    if (otherRange.startLineNumber > range.endLineNumber || otherRange.endLineNumber > range.endLineNumber) {
      return false;
    }
    if (otherRange.startLineNumber === range.startLineNumber && otherRange.startColumn < range.startColumn) {
      return false;
    }
    if (otherRange.endLineNumber === range.endLineNumber && otherRange.endColumn > range.endColumn) {
      return false;
    }
    return true;
  }
  /**
   * Test if `range` is strictly in this range. `range` must start after and end before this range for the result to be true.
   */
  strictContainsRange(range) {
    return Range.strictContainsRange(this, range);
  }
  /**
   * Test if `otherRange` is strictly in `range` (must start after, and end before). If the ranges are equal, will return false.
   */
  static strictContainsRange(range, otherRange) {
    if (otherRange.startLineNumber < range.startLineNumber || otherRange.endLineNumber < range.startLineNumber) {
      return false;
    }
    if (otherRange.startLineNumber > range.endLineNumber || otherRange.endLineNumber > range.endLineNumber) {
      return false;
    }
    if (otherRange.startLineNumber === range.startLineNumber && otherRange.startColumn <= range.startColumn) {
      return false;
    }
    if (otherRange.endLineNumber === range.endLineNumber && otherRange.endColumn >= range.endColumn) {
      return false;
    }
    return true;
  }
  /**
   * A reunion of the two ranges.
   * The smallest position will be used as the start point, and the largest one as the end point.
   */
  plusRange(range) {
    return Range.plusRange(this, range);
  }
  /**
   * A reunion of the two ranges.
   * The smallest position will be used as the start point, and the largest one as the end point.
   */
  static plusRange(a, b) {
    let startLineNumber;
    let startColumn;
    let endLineNumber;
    let endColumn;
    if (b.startLineNumber < a.startLineNumber) {
      startLineNumber = b.startLineNumber;
      startColumn = b.startColumn;
    } else if (b.startLineNumber === a.startLineNumber) {
      startLineNumber = b.startLineNumber;
      startColumn = Math.min(b.startColumn, a.startColumn);
    } else {
      startLineNumber = a.startLineNumber;
      startColumn = a.startColumn;
    }
    if (b.endLineNumber > a.endLineNumber) {
      endLineNumber = b.endLineNumber;
      endColumn = b.endColumn;
    } else if (b.endLineNumber === a.endLineNumber) {
      endLineNumber = b.endLineNumber;
      endColumn = Math.max(b.endColumn, a.endColumn);
    } else {
      endLineNumber = a.endLineNumber;
      endColumn = a.endColumn;
    }
    return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
  }
  /**
   * A intersection of the two ranges.
   */
  intersectRanges(range) {
    return Range.intersectRanges(this, range);
  }
  /**
   * A intersection of the two ranges.
   */
  static intersectRanges(a, b) {
    let resultStartLineNumber = a.startLineNumber;
    let resultStartColumn = a.startColumn;
    let resultEndLineNumber = a.endLineNumber;
    let resultEndColumn = a.endColumn;
    const otherStartLineNumber = b.startLineNumber;
    const otherStartColumn = b.startColumn;
    const otherEndLineNumber = b.endLineNumber;
    const otherEndColumn = b.endColumn;
    if (resultStartLineNumber < otherStartLineNumber) {
      resultStartLineNumber = otherStartLineNumber;
      resultStartColumn = otherStartColumn;
    } else if (resultStartLineNumber === otherStartLineNumber) {
      resultStartColumn = Math.max(resultStartColumn, otherStartColumn);
    }
    if (resultEndLineNumber > otherEndLineNumber) {
      resultEndLineNumber = otherEndLineNumber;
      resultEndColumn = otherEndColumn;
    } else if (resultEndLineNumber === otherEndLineNumber) {
      resultEndColumn = Math.min(resultEndColumn, otherEndColumn);
    }
    if (resultStartLineNumber > resultEndLineNumber) {
      return null;
    }
    if (resultStartLineNumber === resultEndLineNumber && resultStartColumn > resultEndColumn) {
      return null;
    }
    return new Range(resultStartLineNumber, resultStartColumn, resultEndLineNumber, resultEndColumn);
  }
  /**
   * Test if this range equals other.
   */
  equalsRange(other) {
    return Range.equalsRange(this, other);
  }
  /**
   * Test if range `a` equals `b`.
   */
  static equalsRange(a, b) {
    if (!a && !b) {
      return true;
    }
    return !!a && !!b && a.startLineNumber === b.startLineNumber && a.startColumn === b.startColumn && a.endLineNumber === b.endLineNumber && a.endColumn === b.endColumn;
  }
  /**
   * Return the end position (which will be after or equal to the start position)
   */
  getEndPosition() {
    return Range.getEndPosition(this);
  }
  /**
   * Return the end position (which will be after or equal to the start position)
   */
  static getEndPosition(range) {
    return new Position(range.endLineNumber, range.endColumn);
  }
  /**
   * Return the start position (which will be before or equal to the end position)
   */
  getStartPosition() {
    return Range.getStartPosition(this);
  }
  /**
   * Return the start position (which will be before or equal to the end position)
   */
  static getStartPosition(range) {
    return new Position(range.startLineNumber, range.startColumn);
  }
  /**
   * Transform to a user presentable string representation.
   */
  toString() {
    return "[" + this.startLineNumber + "," + this.startColumn + " -> " + this.endLineNumber + "," + this.endColumn + "]";
  }
  /**
   * Create a new range using this range's start position, and using endLineNumber and endColumn as the end position.
   */
  setEndPosition(endLineNumber, endColumn) {
    return new Range(this.startLineNumber, this.startColumn, endLineNumber, endColumn);
  }
  /**
   * Create a new range using this range's end position, and using startLineNumber and startColumn as the start position.
   */
  setStartPosition(startLineNumber, startColumn) {
    return new Range(startLineNumber, startColumn, this.endLineNumber, this.endColumn);
  }
  /**
   * Create a new empty range using this range's start position.
   */
  collapseToStart() {
    return Range.collapseToStart(this);
  }
  /**
   * Create a new empty range using this range's start position.
   */
  static collapseToStart(range) {
    return new Range(range.startLineNumber, range.startColumn, range.startLineNumber, range.startColumn);
  }
  /**
   * Create a new empty range using this range's end position.
   */
  collapseToEnd() {
    return Range.collapseToEnd(this);
  }
  /**
   * Create a new empty range using this range's end position.
   */
  static collapseToEnd(range) {
    return new Range(range.endLineNumber, range.endColumn, range.endLineNumber, range.endColumn);
  }
  /**
   * Moves the range by the given amount of lines.
   */
  delta(lineCount) {
    return new Range(this.startLineNumber + lineCount, this.startColumn, this.endLineNumber + lineCount, this.endColumn);
  }
  /**
   * Test if this range starts and ends on the same line.
   */
  isSingleLine() {
    return this.startLineNumber === this.endLineNumber;
  }
  // ---
  static fromPositions(start, end = start) {
    return new Range(start.lineNumber, start.column, end.lineNumber, end.column);
  }
  static lift(range) {
    if (!range) {
      return null;
    }
    return new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
  }
  /**
   * Test if `obj` is an `IRange`.
   */
  static isIRange(obj) {
    return !!obj && typeof obj.startLineNumber === "number" && typeof obj.startColumn === "number" && typeof obj.endLineNumber === "number" && typeof obj.endColumn === "number";
  }
  /**
   * Test if the two ranges are touching in any way.
   */
  static areIntersectingOrTouching(a, b) {
    if (a.endLineNumber < b.startLineNumber || a.endLineNumber === b.startLineNumber && a.endColumn < b.startColumn) {
      return false;
    }
    if (b.endLineNumber < a.startLineNumber || b.endLineNumber === a.startLineNumber && b.endColumn < a.startColumn) {
      return false;
    }
    return true;
  }
  /**
   * Test if the two ranges are intersecting. If the ranges are touching it returns true.
   */
  static areIntersecting(a, b) {
    if (a.endLineNumber < b.startLineNumber || a.endLineNumber === b.startLineNumber && a.endColumn <= b.startColumn) {
      return false;
    }
    if (b.endLineNumber < a.startLineNumber || b.endLineNumber === a.startLineNumber && b.endColumn <= a.startColumn) {
      return false;
    }
    return true;
  }
  /**
   * Test if the two ranges are intersecting, but not touching at all.
   */
  static areOnlyIntersecting(a, b) {
    if (a.endLineNumber < b.startLineNumber - 1 || a.endLineNumber === b.startLineNumber && a.endColumn < b.startColumn - 1) {
      return false;
    }
    if (b.endLineNumber < a.startLineNumber - 1 || b.endLineNumber === a.startLineNumber && b.endColumn < a.startColumn - 1) {
      return false;
    }
    return true;
  }
  /**
   * A function that compares ranges, useful for sorting ranges
   * It will first compare ranges on the startPosition and then on the endPosition
   */
  static compareRangesUsingStarts(a, b) {
    if (a && b) {
      const aStartLineNumber = a.startLineNumber | 0;
      const bStartLineNumber = b.startLineNumber | 0;
      if (aStartLineNumber === bStartLineNumber) {
        const aStartColumn = a.startColumn | 0;
        const bStartColumn = b.startColumn | 0;
        if (aStartColumn === bStartColumn) {
          const aEndLineNumber = a.endLineNumber | 0;
          const bEndLineNumber = b.endLineNumber | 0;
          if (aEndLineNumber === bEndLineNumber) {
            const aEndColumn = a.endColumn | 0;
            const bEndColumn = b.endColumn | 0;
            return aEndColumn - bEndColumn;
          }
          return aEndLineNumber - bEndLineNumber;
        }
        return aStartColumn - bStartColumn;
      }
      return aStartLineNumber - bStartLineNumber;
    }
    const aExists = a ? 1 : 0;
    const bExists = b ? 1 : 0;
    return aExists - bExists;
  }
  /**
   * A function that compares ranges, useful for sorting ranges
   * It will first compare ranges on the endPosition and then on the startPosition
   */
  static compareRangesUsingEnds(a, b) {
    if (a.endLineNumber === b.endLineNumber) {
      if (a.endColumn === b.endColumn) {
        if (a.startLineNumber === b.startLineNumber) {
          return a.startColumn - b.startColumn;
        }
        return a.startLineNumber - b.startLineNumber;
      }
      return a.endColumn - b.endColumn;
    }
    return a.endLineNumber - b.endLineNumber;
  }
  /**
   * Test if the range spans multiple lines.
   */
  static spansMultipleLines(range) {
    return range.endLineNumber > range.startLineNumber;
  }
  toJSON() {
    return this;
  }
}
export {
  Range
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElQb3NpdGlvbiwgUG9zaXRpb24gfSBmcm9tICcuL3Bvc2l0aW9uLmpzJztcblxuLyoqXG4gKiBBIHJhbmdlIGluIHRoZSBlZGl0b3IuIFRoaXMgaW50ZXJmYWNlIGlzIHN1aXRhYmxlIGZvciBzZXJpYWxpemF0aW9uLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElSYW5nZSB7XG5cdC8qKlxuXHQgKiBMaW5lIG51bWJlciBvbiB3aGljaCB0aGUgcmFuZ2Ugc3RhcnRzIChzdGFydHMgYXQgMSkuXG5cdCAqL1xuXHRyZWFkb25seSBzdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0LyoqXG5cdCAqIENvbHVtbiBvbiB3aGljaCB0aGUgcmFuZ2Ugc3RhcnRzIGluIGxpbmUgYHN0YXJ0TGluZU51bWJlcmAgKHN0YXJ0cyBhdCAxKS5cblx0ICovXG5cdHJlYWRvbmx5IHN0YXJ0Q29sdW1uOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBMaW5lIG51bWJlciBvbiB3aGljaCB0aGUgcmFuZ2UgZW5kcy5cblx0ICovXG5cdHJlYWRvbmx5IGVuZExpbmVOdW1iZXI6IG51bWJlcjtcblx0LyoqXG5cdCAqIENvbHVtbiBvbiB3aGljaCB0aGUgcmFuZ2UgZW5kcyBpbiBsaW5lIGBlbmRMaW5lTnVtYmVyYC5cblx0ICovXG5cdHJlYWRvbmx5IGVuZENvbHVtbjogbnVtYmVyO1xufVxuXG4vKipcbiAqIEEgcmFuZ2UgaW4gdGhlIGVkaXRvci4gKHN0YXJ0TGluZU51bWJlcixzdGFydENvbHVtbikgaXMgPD0gKGVuZExpbmVOdW1iZXIsZW5kQ29sdW1uKVxuICovXG5leHBvcnQgY2xhc3MgUmFuZ2Uge1xuXG5cdC8qKlxuXHQgKiBMaW5lIG51bWJlciBvbiB3aGljaCB0aGUgcmFuZ2Ugc3RhcnRzIChzdGFydHMgYXQgMSkuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBDb2x1bW4gb24gd2hpY2ggdGhlIHJhbmdlIHN0YXJ0cyBpbiBsaW5lIGBzdGFydExpbmVOdW1iZXJgIChzdGFydHMgYXQgMSkuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgc3RhcnRDb2x1bW46IG51bWJlcjtcblx0LyoqXG5cdCAqIExpbmUgbnVtYmVyIG9uIHdoaWNoIHRoZSByYW5nZSBlbmRzLlxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IGVuZExpbmVOdW1iZXI6IG51bWJlcjtcblx0LyoqXG5cdCAqIENvbHVtbiBvbiB3aGljaCB0aGUgcmFuZ2UgZW5kcyBpbiBsaW5lIGBlbmRMaW5lTnVtYmVyYC5cblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBlbmRDb2x1bW46IG51bWJlcjtcblxuXHRjb25zdHJ1Y3RvcihzdGFydExpbmVOdW1iZXI6IG51bWJlciwgc3RhcnRDb2x1bW46IG51bWJlciwgZW5kTGluZU51bWJlcjogbnVtYmVyLCBlbmRDb2x1bW46IG51bWJlcikge1xuXHRcdGlmICgoc3RhcnRMaW5lTnVtYmVyID4gZW5kTGluZU51bWJlcikgfHwgKHN0YXJ0TGluZU51bWJlciA9PT0gZW5kTGluZU51bWJlciAmJiBzdGFydENvbHVtbiA+IGVuZENvbHVtbikpIHtcblx0XHRcdHRoaXMuc3RhcnRMaW5lTnVtYmVyID0gZW5kTGluZU51bWJlcjtcblx0XHRcdHRoaXMuc3RhcnRDb2x1bW4gPSBlbmRDb2x1bW47XG5cdFx0XHR0aGlzLmVuZExpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7XG5cdFx0XHR0aGlzLmVuZENvbHVtbiA9IHN0YXJ0Q29sdW1uO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnN0YXJ0TGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlcjtcblx0XHRcdHRoaXMuc3RhcnRDb2x1bW4gPSBzdGFydENvbHVtbjtcblx0XHRcdHRoaXMuZW5kTGluZU51bWJlciA9IGVuZExpbmVOdW1iZXI7XG5cdFx0XHR0aGlzLmVuZENvbHVtbiA9IGVuZENvbHVtbjtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogVGVzdCBpZiB0aGlzIHJhbmdlIGlzIGVtcHR5LlxuXHQgKi9cblx0cHVibGljIGlzRW1wdHkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIFJhbmdlLmlzRW1wdHkodGhpcyk7XG5cdH1cblxuXHQvKipcblx0ICogVGVzdCBpZiBgcmFuZ2VgIGlzIGVtcHR5LlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBpc0VtcHR5KHJhbmdlOiBJUmFuZ2UpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gKHJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gcmFuZ2UuZW5kTGluZU51bWJlciAmJiByYW5nZS5zdGFydENvbHVtbiA9PT0gcmFuZ2UuZW5kQ29sdW1uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIHBvc2l0aW9uIGlzIGluIHRoaXMgcmFuZ2UuIElmIHRoZSBwb3NpdGlvbiBpcyBhdCB0aGUgZWRnZXMsIHdpbGwgcmV0dXJuIHRydWUuXG5cdCAqL1xuXHRwdWJsaWMgY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbjogSVBvc2l0aW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIFJhbmdlLmNvbnRhaW5zUG9zaXRpb24odGhpcywgcG9zaXRpb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgYHBvc2l0aW9uYCBpcyBpbiBgcmFuZ2VgLiBJZiB0aGUgcG9zaXRpb24gaXMgYXQgdGhlIGVkZ2VzLCB3aWxsIHJldHVybiB0cnVlLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBjb250YWluc1Bvc2l0aW9uKHJhbmdlOiBJUmFuZ2UsIHBvc2l0aW9uOiBJUG9zaXRpb24pOiBib29sZWFuIHtcblx0XHRpZiAocG9zaXRpb24ubGluZU51bWJlciA8IHJhbmdlLnN0YXJ0TGluZU51bWJlciB8fCBwb3NpdGlvbi5saW5lTnVtYmVyID4gcmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAocG9zaXRpb24ubGluZU51bWJlciA9PT0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICYmIHBvc2l0aW9uLmNvbHVtbiA8IHJhbmdlLnN0YXJ0Q29sdW1uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChwb3NpdGlvbi5saW5lTnVtYmVyID09PSByYW5nZS5lbmRMaW5lTnVtYmVyICYmIHBvc2l0aW9uLmNvbHVtbiA+IHJhbmdlLmVuZENvbHVtbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIGBwb3NpdGlvbmAgaXMgaW4gYHJhbmdlYC4gSWYgdGhlIHBvc2l0aW9uIGlzIGF0IHRoZSBlZGdlcywgd2lsbCByZXR1cm4gZmFsc2UuXG5cdCAqIEBpbnRlcm5hbFxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBzdHJpY3RDb250YWluc1Bvc2l0aW9uKHJhbmdlOiBJUmFuZ2UsIHBvc2l0aW9uOiBJUG9zaXRpb24pOiBib29sZWFuIHtcblx0XHRpZiAocG9zaXRpb24ubGluZU51bWJlciA8IHJhbmdlLnN0YXJ0TGluZU51bWJlciB8fCBwb3NpdGlvbi5saW5lTnVtYmVyID4gcmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAocG9zaXRpb24ubGluZU51bWJlciA9PT0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICYmIHBvc2l0aW9uLmNvbHVtbiA8PSByYW5nZS5zdGFydENvbHVtbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAocG9zaXRpb24ubGluZU51bWJlciA9PT0gcmFuZ2UuZW5kTGluZU51bWJlciAmJiBwb3NpdGlvbi5jb2x1bW4gPj0gcmFuZ2UuZW5kQ29sdW1uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgcmFuZ2UgaXMgaW4gdGhpcyByYW5nZS4gSWYgdGhlIHJhbmdlIGlzIGVxdWFsIHRvIHRoaXMgcmFuZ2UsIHdpbGwgcmV0dXJuIHRydWUuXG5cdCAqL1xuXHRwdWJsaWMgY29udGFpbnNSYW5nZShyYW5nZTogSVJhbmdlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIFJhbmdlLmNvbnRhaW5zUmFuZ2UodGhpcywgcmFuZ2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgYG90aGVyUmFuZ2VgIGlzIGluIGByYW5nZWAuIElmIHRoZSByYW5nZXMgYXJlIGVxdWFsLCB3aWxsIHJldHVybiB0cnVlLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBjb250YWluc1JhbmdlKHJhbmdlOiBJUmFuZ2UsIG90aGVyUmFuZ2U6IElSYW5nZSk6IGJvb2xlYW4ge1xuXHRcdGlmIChvdGhlclJhbmdlLnN0YXJ0TGluZU51bWJlciA8IHJhbmdlLnN0YXJ0TGluZU51bWJlciB8fCBvdGhlclJhbmdlLmVuZExpbmVOdW1iZXIgPCByYW5nZS5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKG90aGVyUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gcmFuZ2UuZW5kTGluZU51bWJlciB8fCBvdGhlclJhbmdlLmVuZExpbmVOdW1iZXIgPiByYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChvdGhlclJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICYmIG90aGVyUmFuZ2Uuc3RhcnRDb2x1bW4gPCByYW5nZS5zdGFydENvbHVtbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAob3RoZXJSYW5nZS5lbmRMaW5lTnVtYmVyID09PSByYW5nZS5lbmRMaW5lTnVtYmVyICYmIG90aGVyUmFuZ2UuZW5kQ29sdW1uID4gcmFuZ2UuZW5kQ29sdW1uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgYHJhbmdlYCBpcyBzdHJpY3RseSBpbiB0aGlzIHJhbmdlLiBgcmFuZ2VgIG11c3Qgc3RhcnQgYWZ0ZXIgYW5kIGVuZCBiZWZvcmUgdGhpcyByYW5nZSBmb3IgdGhlIHJlc3VsdCB0byBiZSB0cnVlLlxuXHQgKi9cblx0cHVibGljIHN0cmljdENvbnRhaW5zUmFuZ2UocmFuZ2U6IElSYW5nZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBSYW5nZS5zdHJpY3RDb250YWluc1JhbmdlKHRoaXMsIHJhbmdlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIGBvdGhlclJhbmdlYCBpcyBzdHJpY3RseSBpbiBgcmFuZ2VgIChtdXN0IHN0YXJ0IGFmdGVyLCBhbmQgZW5kIGJlZm9yZSkuIElmIHRoZSByYW5nZXMgYXJlIGVxdWFsLCB3aWxsIHJldHVybiBmYWxzZS5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgc3RyaWN0Q29udGFpbnNSYW5nZShyYW5nZTogSVJhbmdlLCBvdGhlclJhbmdlOiBJUmFuZ2UpOiBib29sZWFuIHtcblx0XHRpZiAob3RoZXJSYW5nZS5zdGFydExpbmVOdW1iZXIgPCByYW5nZS5zdGFydExpbmVOdW1iZXIgfHwgb3RoZXJSYW5nZS5lbmRMaW5lTnVtYmVyIDwgcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChvdGhlclJhbmdlLnN0YXJ0TGluZU51bWJlciA+IHJhbmdlLmVuZExpbmVOdW1iZXIgfHwgb3RoZXJSYW5nZS5lbmRMaW5lTnVtYmVyID4gcmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAob3RoZXJSYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IHJhbmdlLnN0YXJ0TGluZU51bWJlciAmJiBvdGhlclJhbmdlLnN0YXJ0Q29sdW1uIDw9IHJhbmdlLnN0YXJ0Q29sdW1uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChvdGhlclJhbmdlLmVuZExpbmVOdW1iZXIgPT09IHJhbmdlLmVuZExpbmVOdW1iZXIgJiYgb3RoZXJSYW5nZS5lbmRDb2x1bW4gPj0gcmFuZ2UuZW5kQ29sdW1uKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgcmV1bmlvbiBvZiB0aGUgdHdvIHJhbmdlcy5cblx0ICogVGhlIHNtYWxsZXN0IHBvc2l0aW9uIHdpbGwgYmUgdXNlZCBhcyB0aGUgc3RhcnQgcG9pbnQsIGFuZCB0aGUgbGFyZ2VzdCBvbmUgYXMgdGhlIGVuZCBwb2ludC5cblx0ICovXG5cdHB1YmxpYyBwbHVzUmFuZ2UocmFuZ2U6IElSYW5nZSk6IFJhbmdlIHtcblx0XHRyZXR1cm4gUmFuZ2UucGx1c1JhbmdlKHRoaXMsIHJhbmdlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIHJldW5pb24gb2YgdGhlIHR3byByYW5nZXMuXG5cdCAqIFRoZSBzbWFsbGVzdCBwb3NpdGlvbiB3aWxsIGJlIHVzZWQgYXMgdGhlIHN0YXJ0IHBvaW50LCBhbmQgdGhlIGxhcmdlc3Qgb25lIGFzIHRoZSBlbmQgcG9pbnQuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIHBsdXNSYW5nZShhOiBJUmFuZ2UsIGI6IElSYW5nZSk6IFJhbmdlIHtcblx0XHRsZXQgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdFx0bGV0IHN0YXJ0Q29sdW1uOiBudW1iZXI7XG5cdFx0bGV0IGVuZExpbmVOdW1iZXI6IG51bWJlcjtcblx0XHRsZXQgZW5kQ29sdW1uOiBudW1iZXI7XG5cblx0XHRpZiAoYi5zdGFydExpbmVOdW1iZXIgPCBhLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyID0gYi5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRzdGFydENvbHVtbiA9IGIuc3RhcnRDb2x1bW47XG5cdFx0fSBlbHNlIGlmIChiLnN0YXJ0TGluZU51bWJlciA9PT0gYS5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdHN0YXJ0TGluZU51bWJlciA9IGIuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0c3RhcnRDb2x1bW4gPSBNYXRoLm1pbihiLnN0YXJ0Q29sdW1uLCBhLnN0YXJ0Q29sdW1uKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0c3RhcnRMaW5lTnVtYmVyID0gYS5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRzdGFydENvbHVtbiA9IGEuc3RhcnRDb2x1bW47XG5cdFx0fVxuXG5cdFx0aWYgKGIuZW5kTGluZU51bWJlciA+IGEuZW5kTGluZU51bWJlcikge1xuXHRcdFx0ZW5kTGluZU51bWJlciA9IGIuZW5kTGluZU51bWJlcjtcblx0XHRcdGVuZENvbHVtbiA9IGIuZW5kQ29sdW1uO1xuXHRcdH0gZWxzZSBpZiAoYi5lbmRMaW5lTnVtYmVyID09PSBhLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdGVuZExpbmVOdW1iZXIgPSBiLmVuZExpbmVOdW1iZXI7XG5cdFx0XHRlbmRDb2x1bW4gPSBNYXRoLm1heChiLmVuZENvbHVtbiwgYS5lbmRDb2x1bW4pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlbmRMaW5lTnVtYmVyID0gYS5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0ZW5kQ29sdW1uID0gYS5lbmRDb2x1bW47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBSYW5nZShzdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgaW50ZXJzZWN0aW9uIG9mIHRoZSB0d28gcmFuZ2VzLlxuXHQgKi9cblx0cHVibGljIGludGVyc2VjdFJhbmdlcyhyYW5nZTogSVJhbmdlKTogUmFuZ2UgfCBudWxsIHtcblx0XHRyZXR1cm4gUmFuZ2UuaW50ZXJzZWN0UmFuZ2VzKHRoaXMsIHJhbmdlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBIGludGVyc2VjdGlvbiBvZiB0aGUgdHdvIHJhbmdlcy5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgaW50ZXJzZWN0UmFuZ2VzKGE6IElSYW5nZSwgYjogSVJhbmdlKTogUmFuZ2UgfCBudWxsIHtcblx0XHRsZXQgcmVzdWx0U3RhcnRMaW5lTnVtYmVyID0gYS5zdGFydExpbmVOdW1iZXI7XG5cdFx0bGV0IHJlc3VsdFN0YXJ0Q29sdW1uID0gYS5zdGFydENvbHVtbjtcblx0XHRsZXQgcmVzdWx0RW5kTGluZU51bWJlciA9IGEuZW5kTGluZU51bWJlcjtcblx0XHRsZXQgcmVzdWx0RW5kQ29sdW1uID0gYS5lbmRDb2x1bW47XG5cdFx0Y29uc3Qgb3RoZXJTdGFydExpbmVOdW1iZXIgPSBiLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBvdGhlclN0YXJ0Q29sdW1uID0gYi5zdGFydENvbHVtbjtcblx0XHRjb25zdCBvdGhlckVuZExpbmVOdW1iZXIgPSBiLmVuZExpbmVOdW1iZXI7XG5cdFx0Y29uc3Qgb3RoZXJFbmRDb2x1bW4gPSBiLmVuZENvbHVtbjtcblxuXHRcdGlmIChyZXN1bHRTdGFydExpbmVOdW1iZXIgPCBvdGhlclN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0cmVzdWx0U3RhcnRMaW5lTnVtYmVyID0gb3RoZXJTdGFydExpbmVOdW1iZXI7XG5cdFx0XHRyZXN1bHRTdGFydENvbHVtbiA9IG90aGVyU3RhcnRDb2x1bW47XG5cdFx0fSBlbHNlIGlmIChyZXN1bHRTdGFydExpbmVOdW1iZXIgPT09IG90aGVyU3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXN1bHRTdGFydENvbHVtbiA9IE1hdGgubWF4KHJlc3VsdFN0YXJ0Q29sdW1uLCBvdGhlclN0YXJ0Q29sdW1uKTtcblx0XHR9XG5cblx0XHRpZiAocmVzdWx0RW5kTGluZU51bWJlciA+IG90aGVyRW5kTGluZU51bWJlcikge1xuXHRcdFx0cmVzdWx0RW5kTGluZU51bWJlciA9IG90aGVyRW5kTGluZU51bWJlcjtcblx0XHRcdHJlc3VsdEVuZENvbHVtbiA9IG90aGVyRW5kQ29sdW1uO1xuXHRcdH0gZWxzZSBpZiAocmVzdWx0RW5kTGluZU51bWJlciA9PT0gb3RoZXJFbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRyZXN1bHRFbmRDb2x1bW4gPSBNYXRoLm1pbihyZXN1bHRFbmRDb2x1bW4sIG90aGVyRW5kQ29sdW1uKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiBzZWxlY3Rpb24gaXMgbm93IGVtcHR5XG5cdFx0aWYgKHJlc3VsdFN0YXJ0TGluZU51bWJlciA+IHJlc3VsdEVuZExpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRpZiAocmVzdWx0U3RhcnRMaW5lTnVtYmVyID09PSByZXN1bHRFbmRMaW5lTnVtYmVyICYmIHJlc3VsdFN0YXJ0Q29sdW1uID4gcmVzdWx0RW5kQ29sdW1uKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBSYW5nZShyZXN1bHRTdGFydExpbmVOdW1iZXIsIHJlc3VsdFN0YXJ0Q29sdW1uLCByZXN1bHRFbmRMaW5lTnVtYmVyLCByZXN1bHRFbmRDb2x1bW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgdGhpcyByYW5nZSBlcXVhbHMgb3RoZXIuXG5cdCAqL1xuXHRwdWJsaWMgZXF1YWxzUmFuZ2Uob3RoZXI6IElSYW5nZSB8IG51bGwgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gUmFuZ2UuZXF1YWxzUmFuZ2UodGhpcywgb3RoZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgcmFuZ2UgYGFgIGVxdWFscyBgYmAuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGVxdWFsc1JhbmdlKGE6IElSYW5nZSB8IG51bGwgfCB1bmRlZmluZWQsIGI6IElSYW5nZSB8IG51bGwgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0XHRpZiAoIWEgJiYgIWIpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gKFxuXHRcdFx0ISFhICYmXG5cdFx0XHQhIWIgJiZcblx0XHRcdGEuc3RhcnRMaW5lTnVtYmVyID09PSBiLnN0YXJ0TGluZU51bWJlciAmJlxuXHRcdFx0YS5zdGFydENvbHVtbiA9PT0gYi5zdGFydENvbHVtbiAmJlxuXHRcdFx0YS5lbmRMaW5lTnVtYmVyID09PSBiLmVuZExpbmVOdW1iZXIgJiZcblx0XHRcdGEuZW5kQ29sdW1uID09PSBiLmVuZENvbHVtblxuXHRcdCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJuIHRoZSBlbmQgcG9zaXRpb24gKHdoaWNoIHdpbGwgYmUgYWZ0ZXIgb3IgZXF1YWwgdG8gdGhlIHN0YXJ0IHBvc2l0aW9uKVxuXHQgKi9cblx0cHVibGljIGdldEVuZFBvc2l0aW9uKCk6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gUmFuZ2UuZ2V0RW5kUG9zaXRpb24odGhpcyk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJuIHRoZSBlbmQgcG9zaXRpb24gKHdoaWNoIHdpbGwgYmUgYWZ0ZXIgb3IgZXF1YWwgdG8gdGhlIHN0YXJ0IHBvc2l0aW9uKVxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBnZXRFbmRQb3NpdGlvbihyYW5nZTogSVJhbmdlKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiBuZXcgUG9zaXRpb24ocmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm4gdGhlIHN0YXJ0IHBvc2l0aW9uICh3aGljaCB3aWxsIGJlIGJlZm9yZSBvciBlcXVhbCB0byB0aGUgZW5kIHBvc2l0aW9uKVxuXHQgKi9cblx0cHVibGljIGdldFN0YXJ0UG9zaXRpb24oKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiBSYW5nZS5nZXRTdGFydFBvc2l0aW9uKHRoaXMpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybiB0aGUgc3RhcnQgcG9zaXRpb24gKHdoaWNoIHdpbGwgYmUgYmVmb3JlIG9yIGVxdWFsIHRvIHRoZSBlbmQgcG9zaXRpb24pXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGdldFN0YXJ0UG9zaXRpb24ocmFuZ2U6IElSYW5nZSk6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRyYW5zZm9ybSB0byBhIHVzZXIgcHJlc2VudGFibGUgc3RyaW5nIHJlcHJlc2VudGF0aW9uLlxuXHQgKi9cblx0cHVibGljIHRvU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICdbJyArIHRoaXMuc3RhcnRMaW5lTnVtYmVyICsgJywnICsgdGhpcy5zdGFydENvbHVtbiArICcgLT4gJyArIHRoaXMuZW5kTGluZU51bWJlciArICcsJyArIHRoaXMuZW5kQ29sdW1uICsgJ10nO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIG5ldyByYW5nZSB1c2luZyB0aGlzIHJhbmdlJ3Mgc3RhcnQgcG9zaXRpb24sIGFuZCB1c2luZyBlbmRMaW5lTnVtYmVyIGFuZCBlbmRDb2x1bW4gYXMgdGhlIGVuZCBwb3NpdGlvbi5cblx0ICovXG5cdHB1YmxpYyBzZXRFbmRQb3NpdGlvbihlbmRMaW5lTnVtYmVyOiBudW1iZXIsIGVuZENvbHVtbjogbnVtYmVyKTogUmFuZ2Uge1xuXHRcdHJldHVybiBuZXcgUmFuZ2UodGhpcy5zdGFydExpbmVOdW1iZXIsIHRoaXMuc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXIsIGVuZENvbHVtbik7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IHJhbmdlIHVzaW5nIHRoaXMgcmFuZ2UncyBlbmQgcG9zaXRpb24sIGFuZCB1c2luZyBzdGFydExpbmVOdW1iZXIgYW5kIHN0YXJ0Q29sdW1uIGFzIHRoZSBzdGFydCBwb3NpdGlvbi5cblx0ICovXG5cdHB1YmxpYyBzZXRTdGFydFBvc2l0aW9uKHN0YXJ0TGluZU51bWJlcjogbnVtYmVyLCBzdGFydENvbHVtbjogbnVtYmVyKTogUmFuZ2Uge1xuXHRcdHJldHVybiBuZXcgUmFuZ2Uoc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbiwgdGhpcy5lbmRMaW5lTnVtYmVyLCB0aGlzLmVuZENvbHVtbik7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IGVtcHR5IHJhbmdlIHVzaW5nIHRoaXMgcmFuZ2UncyBzdGFydCBwb3NpdGlvbi5cblx0ICovXG5cdHB1YmxpYyBjb2xsYXBzZVRvU3RhcnQoKTogUmFuZ2Uge1xuXHRcdHJldHVybiBSYW5nZS5jb2xsYXBzZVRvU3RhcnQodGhpcyk7XG5cdH1cblxuXHQvKipcblx0ICogQ3JlYXRlIGEgbmV3IGVtcHR5IHJhbmdlIHVzaW5nIHRoaXMgcmFuZ2UncyBzdGFydCBwb3NpdGlvbi5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgY29sbGFwc2VUb1N0YXJ0KHJhbmdlOiBJUmFuZ2UpOiBSYW5nZSB7XG5cdFx0cmV0dXJuIG5ldyBSYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uLCByYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBuZXcgZW1wdHkgcmFuZ2UgdXNpbmcgdGhpcyByYW5nZSdzIGVuZCBwb3NpdGlvbi5cblx0ICovXG5cdHB1YmxpYyBjb2xsYXBzZVRvRW5kKCk6IFJhbmdlIHtcblx0XHRyZXR1cm4gUmFuZ2UuY29sbGFwc2VUb0VuZCh0aGlzKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBuZXcgZW1wdHkgcmFuZ2UgdXNpbmcgdGhpcyByYW5nZSdzIGVuZCBwb3NpdGlvbi5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgY29sbGFwc2VUb0VuZChyYW5nZTogSVJhbmdlKTogUmFuZ2Uge1xuXHRcdHJldHVybiBuZXcgUmFuZ2UocmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uLCByYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1vdmVzIHRoZSByYW5nZSBieSB0aGUgZ2l2ZW4gYW1vdW50IG9mIGxpbmVzLlxuXHQgKi9cblx0cHVibGljIGRlbHRhKGxpbmVDb3VudDogbnVtYmVyKTogUmFuZ2Uge1xuXHRcdHJldHVybiBuZXcgUmFuZ2UodGhpcy5zdGFydExpbmVOdW1iZXIgKyBsaW5lQ291bnQsIHRoaXMuc3RhcnRDb2x1bW4sIHRoaXMuZW5kTGluZU51bWJlciArIGxpbmVDb3VudCwgdGhpcy5lbmRDb2x1bW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgdGhpcyByYW5nZSBzdGFydHMgYW5kIGVuZHMgb24gdGhlIHNhbWUgbGluZS5cblx0ICovXG5cdHB1YmxpYyBpc1NpbmdsZUxpbmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuc3RhcnRMaW5lTnVtYmVyID09PSB0aGlzLmVuZExpbmVOdW1iZXI7XG5cdH1cblxuXHQvLyAtLS1cblxuXHRwdWJsaWMgc3RhdGljIGZyb21Qb3NpdGlvbnMoc3RhcnQ6IElQb3NpdGlvbiwgZW5kOiBJUG9zaXRpb24gPSBzdGFydCk6IFJhbmdlIHtcblx0XHRyZXR1cm4gbmV3IFJhbmdlKHN0YXJ0LmxpbmVOdW1iZXIsIHN0YXJ0LmNvbHVtbiwgZW5kLmxpbmVOdW1iZXIsIGVuZC5jb2x1bW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIGBSYW5nZWAgZnJvbSBhbiBgSVJhbmdlYC5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgbGlmdChyYW5nZTogdW5kZWZpbmVkIHwgbnVsbCk6IG51bGw7XG5cdHB1YmxpYyBzdGF0aWMgbGlmdChyYW5nZTogSVJhbmdlKTogUmFuZ2U7XG5cdHB1YmxpYyBzdGF0aWMgbGlmdChyYW5nZTogSVJhbmdlIHwgdW5kZWZpbmVkIHwgbnVsbCk6IFJhbmdlIHwgbnVsbDtcblx0cHVibGljIHN0YXRpYyBsaWZ0KHJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQgfCBudWxsKTogUmFuZ2UgfCBudWxsIHtcblx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIG5ldyBSYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uLCByYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgYG9iamAgaXMgYW4gYElSYW5nZWAuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGlzSVJhbmdlKG9iajogdW5rbm93bik6IG9iaiBpcyBJUmFuZ2Uge1xuXHRcdHJldHVybiAoXG5cdFx0XHQhIW9ialxuXHRcdFx0JiYgKHR5cGVvZiAob2JqIGFzIElSYW5nZSkuc3RhcnRMaW5lTnVtYmVyID09PSAnbnVtYmVyJylcblx0XHRcdCYmICh0eXBlb2YgKG9iaiBhcyBJUmFuZ2UpLnN0YXJ0Q29sdW1uID09PSAnbnVtYmVyJylcblx0XHRcdCYmICh0eXBlb2YgKG9iaiBhcyBJUmFuZ2UpLmVuZExpbmVOdW1iZXIgPT09ICdudW1iZXInKVxuXHRcdFx0JiYgKHR5cGVvZiAob2JqIGFzIElSYW5nZSkuZW5kQ29sdW1uID09PSAnbnVtYmVyJylcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgdGhlIHR3byByYW5nZXMgYXJlIHRvdWNoaW5nIGluIGFueSB3YXkuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGFyZUludGVyc2VjdGluZ09yVG91Y2hpbmcoYTogSVJhbmdlLCBiOiBJUmFuZ2UpOiBib29sZWFuIHtcblx0XHQvLyBDaGVjayBpZiBgYWAgaXMgYmVmb3JlIGBiYFxuXHRcdGlmIChhLmVuZExpbmVOdW1iZXIgPCBiLnN0YXJ0TGluZU51bWJlciB8fCAoYS5lbmRMaW5lTnVtYmVyID09PSBiLnN0YXJ0TGluZU51bWJlciAmJiBhLmVuZENvbHVtbiA8IGIuc3RhcnRDb2x1bW4pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgaWYgYGJgIGlzIGJlZm9yZSBgYWBcblx0XHRpZiAoYi5lbmRMaW5lTnVtYmVyIDwgYS5zdGFydExpbmVOdW1iZXIgfHwgKGIuZW5kTGluZU51bWJlciA9PT0gYS5zdGFydExpbmVOdW1iZXIgJiYgYi5lbmRDb2x1bW4gPCBhLnN0YXJ0Q29sdW1uKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFRoZXNlIHJhbmdlcyBtdXN0IGludGVyc2VjdFxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgdGhlIHR3byByYW5nZXMgYXJlIGludGVyc2VjdGluZy4gSWYgdGhlIHJhbmdlcyBhcmUgdG91Y2hpbmcgaXQgcmV0dXJucyB0cnVlLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBhcmVJbnRlcnNlY3RpbmcoYTogSVJhbmdlLCBiOiBJUmFuZ2UpOiBib29sZWFuIHtcblx0XHQvLyBDaGVjayBpZiBgYWAgaXMgYmVmb3JlIGBiYFxuXHRcdGlmIChhLmVuZExpbmVOdW1iZXIgPCBiLnN0YXJ0TGluZU51bWJlciB8fCAoYS5lbmRMaW5lTnVtYmVyID09PSBiLnN0YXJ0TGluZU51bWJlciAmJiBhLmVuZENvbHVtbiA8PSBiLnN0YXJ0Q29sdW1uKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIGBiYCBpcyBiZWZvcmUgYGFgXG5cdFx0aWYgKGIuZW5kTGluZU51bWJlciA8IGEuc3RhcnRMaW5lTnVtYmVyIHx8IChiLmVuZExpbmVOdW1iZXIgPT09IGEuc3RhcnRMaW5lTnVtYmVyICYmIGIuZW5kQ29sdW1uIDw9IGEuc3RhcnRDb2x1bW4pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gVGhlc2UgcmFuZ2VzIG11c3QgaW50ZXJzZWN0XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogVGVzdCBpZiB0aGUgdHdvIHJhbmdlcyBhcmUgaW50ZXJzZWN0aW5nLCBidXQgbm90IHRvdWNoaW5nIGF0IGFsbC5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgYXJlT25seUludGVyc2VjdGluZyhhOiBJUmFuZ2UsIGI6IElSYW5nZSk6IGJvb2xlYW4ge1xuXHRcdC8vIENoZWNrIGlmIGBhYCBpcyBiZWZvcmUgYGJgXG5cdFx0aWYgKGEuZW5kTGluZU51bWJlciA8IChiLnN0YXJ0TGluZU51bWJlciAtIDEpIHx8IChhLmVuZExpbmVOdW1iZXIgPT09IGIuc3RhcnRMaW5lTnVtYmVyICYmIGEuZW5kQ29sdW1uIDwgKGIuc3RhcnRDb2x1bW4gLSAxKSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiBgYmAgaXMgYmVmb3JlIGBhYFxuXHRcdGlmIChiLmVuZExpbmVOdW1iZXIgPCAoYS5zdGFydExpbmVOdW1iZXIgLSAxKSB8fCAoYi5lbmRMaW5lTnVtYmVyID09PSBhLnN0YXJ0TGluZU51bWJlciAmJiBiLmVuZENvbHVtbiA8IChhLnN0YXJ0Q29sdW1uIC0gMSkpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gVGhlc2UgcmFuZ2VzIG11c3QgaW50ZXJzZWN0XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogQSBmdW5jdGlvbiB0aGF0IGNvbXBhcmVzIHJhbmdlcywgdXNlZnVsIGZvciBzb3J0aW5nIHJhbmdlc1xuXHQgKiBJdCB3aWxsIGZpcnN0IGNvbXBhcmUgcmFuZ2VzIG9uIHRoZSBzdGFydFBvc2l0aW9uIGFuZCB0aGVuIG9uIHRoZSBlbmRQb3NpdGlvblxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBjb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMoYTogSVJhbmdlIHwgbnVsbCB8IHVuZGVmaW5lZCwgYjogSVJhbmdlIHwgbnVsbCB8IHVuZGVmaW5lZCk6IG51bWJlciB7XG5cdFx0aWYgKGEgJiYgYikge1xuXHRcdFx0Y29uc3QgYVN0YXJ0TGluZU51bWJlciA9IGEuc3RhcnRMaW5lTnVtYmVyIHwgMDtcblx0XHRcdGNvbnN0IGJTdGFydExpbmVOdW1iZXIgPSBiLnN0YXJ0TGluZU51bWJlciB8IDA7XG5cblx0XHRcdGlmIChhU3RhcnRMaW5lTnVtYmVyID09PSBiU3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGNvbnN0IGFTdGFydENvbHVtbiA9IGEuc3RhcnRDb2x1bW4gfCAwO1xuXHRcdFx0XHRjb25zdCBiU3RhcnRDb2x1bW4gPSBiLnN0YXJ0Q29sdW1uIHwgMDtcblxuXHRcdFx0XHRpZiAoYVN0YXJ0Q29sdW1uID09PSBiU3RhcnRDb2x1bW4pIHtcblx0XHRcdFx0XHRjb25zdCBhRW5kTGluZU51bWJlciA9IGEuZW5kTGluZU51bWJlciB8IDA7XG5cdFx0XHRcdFx0Y29uc3QgYkVuZExpbmVOdW1iZXIgPSBiLmVuZExpbmVOdW1iZXIgfCAwO1xuXG5cdFx0XHRcdFx0aWYgKGFFbmRMaW5lTnVtYmVyID09PSBiRW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0Y29uc3QgYUVuZENvbHVtbiA9IGEuZW5kQ29sdW1uIHwgMDtcblx0XHRcdFx0XHRcdGNvbnN0IGJFbmRDb2x1bW4gPSBiLmVuZENvbHVtbiB8IDA7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYUVuZENvbHVtbiAtIGJFbmRDb2x1bW47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBhRW5kTGluZU51bWJlciAtIGJFbmRMaW5lTnVtYmVyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhU3RhcnRDb2x1bW4gLSBiU3RhcnRDb2x1bW47XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYVN0YXJ0TGluZU51bWJlciAtIGJTdGFydExpbmVOdW1iZXI7XG5cdFx0fVxuXHRcdGNvbnN0IGFFeGlzdHMgPSAoYSA/IDEgOiAwKTtcblx0XHRjb25zdCBiRXhpc3RzID0gKGIgPyAxIDogMCk7XG5cdFx0cmV0dXJuIGFFeGlzdHMgLSBiRXhpc3RzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgZnVuY3Rpb24gdGhhdCBjb21wYXJlcyByYW5nZXMsIHVzZWZ1bCBmb3Igc29ydGluZyByYW5nZXNcblx0ICogSXQgd2lsbCBmaXJzdCBjb21wYXJlIHJhbmdlcyBvbiB0aGUgZW5kUG9zaXRpb24gYW5kIHRoZW4gb24gdGhlIHN0YXJ0UG9zaXRpb25cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgY29tcGFyZVJhbmdlc1VzaW5nRW5kcyhhOiBJUmFuZ2UsIGI6IElSYW5nZSk6IG51bWJlciB7XG5cdFx0aWYgKGEuZW5kTGluZU51bWJlciA9PT0gYi5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRpZiAoYS5lbmRDb2x1bW4gPT09IGIuZW5kQ29sdW1uKSB7XG5cdFx0XHRcdGlmIChhLnN0YXJ0TGluZU51bWJlciA9PT0gYi5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gYS5zdGFydENvbHVtbiAtIGIuc3RhcnRDb2x1bW47XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGEuc3RhcnRMaW5lTnVtYmVyIC0gYi5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gYS5lbmRDb2x1bW4gLSBiLmVuZENvbHVtbjtcblx0XHR9XG5cdFx0cmV0dXJuIGEuZW5kTGluZU51bWJlciAtIGIuZW5kTGluZU51bWJlcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIHRoZSByYW5nZSBzcGFucyBtdWx0aXBsZSBsaW5lcy5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgc3BhbnNNdWx0aXBsZUxpbmVzKHJhbmdlOiBJUmFuZ2UpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gcmFuZ2UuZW5kTGluZU51bWJlciA+IHJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0fVxuXG5cdHB1YmxpYyB0b0pTT04oKTogSVJhbmdlIHtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBb0IsZ0JBQWdCO0FBMkI3QixNQUFNLE1BQU07QUFBQSxFQW1CbEIsWUFBWSxpQkFBeUIsYUFBcUIsZUFBdUIsV0FBbUI7QUFDbkcsUUFBSyxrQkFBa0IsaUJBQW1CLG9CQUFvQixpQkFBaUIsY0FBYyxXQUFZO0FBQ3hHLFdBQUssa0JBQWtCO0FBQ3ZCLFdBQUssY0FBYztBQUNuQixXQUFLLGdCQUFnQjtBQUNyQixXQUFLLFlBQVk7QUFBQSxJQUNsQixPQUFPO0FBQ04sV0FBSyxrQkFBa0I7QUFDdkIsV0FBSyxjQUFjO0FBQ25CLFdBQUssZ0JBQWdCO0FBQ3JCLFdBQUssWUFBWTtBQUFBLElBQ2xCO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sVUFBbUI7QUFDekIsV0FBTyxNQUFNLFFBQVEsSUFBSTtBQUFBLEVBQzFCO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxPQUFjLFFBQVEsT0FBd0I7QUFDN0MsV0FBUSxNQUFNLG9CQUFvQixNQUFNLGlCQUFpQixNQUFNLGdCQUFnQixNQUFNO0FBQUEsRUFDdEY7QUFBQTtBQUFB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
