class Position {
  constructor(lineNumber, column) {
    this.lineNumber = lineNumber;
    this.column = column;
  }
  /**
   * Create a new position from this position.
   *
   * @param newLineNumber new line number
   * @param newColumn new column
   */
  with(newLineNumber = this.lineNumber, newColumn = this.column) {
    if (newLineNumber === this.lineNumber && newColumn === this.column) {
      return this;
    } else {
      return new Position(newLineNumber, newColumn);
    }
  }
  /**
   * Derive a new position from this position.
   *
   * @param deltaLineNumber line number delta
   * @param deltaColumn column delta
   */
  delta(deltaLineNumber = 0, deltaColumn = 0) {
    return this.with(Math.max(1, this.lineNumber + deltaLineNumber), Math.max(1, this.column + deltaColumn));
  }
  /**
   * Test if this position equals other position
   */
  equals(other) {
    return Position.equals(this, other);
  }
  /**
   * Test if position `a` equals position `b`
   */
  static equals(a, b) {
    if (!a && !b) {
      return true;
    }
    return !!a && !!b && a.lineNumber === b.lineNumber && a.column === b.column;
  }
  /**
   * Test if this position is before other position.
   * If the two positions are equal, the result will be false.
   */
  isBefore(other) {
    return Position.isBefore(this, other);
  }
  /**
   * Test if position `a` is before position `b`.
   * If the two positions are equal, the result will be false.
   */
  static isBefore(a, b) {
    if (a.lineNumber < b.lineNumber) {
      return true;
    }
    if (b.lineNumber < a.lineNumber) {
      return false;
    }
    return a.column < b.column;
  }
  /**
   * Test if this position is before other position.
   * If the two positions are equal, the result will be true.
   */
  isBeforeOrEqual(other) {
    return Position.isBeforeOrEqual(this, other);
  }
  /**
   * Test if position `a` is before position `b`.
   * If the two positions are equal, the result will be true.
   */
  static isBeforeOrEqual(a, b) {
    if (a.lineNumber < b.lineNumber) {
      return true;
    }
    if (b.lineNumber < a.lineNumber) {
      return false;
    }
    return a.column <= b.column;
  }
  /**
   * A function that compares positions, useful for sorting
   */
  static compare(a, b) {
    const aLineNumber = a.lineNumber | 0;
    const bLineNumber = b.lineNumber | 0;
    if (aLineNumber === bLineNumber) {
      const aColumn = a.column | 0;
      const bColumn = b.column | 0;
      return aColumn - bColumn;
    }
    return aLineNumber - bLineNumber;
  }
  /**
   * Clone this position.
   */
  clone() {
    return new Position(this.lineNumber, this.column);
  }
  /**
   * Convert to a human-readable representation.
   */
  toString() {
    return "(" + this.lineNumber + "," + this.column + ")";
  }
  // ---
  /**
   * Create a `Position` from an `IPosition`.
   */
  static lift(pos) {
    return new Position(pos.lineNumber, pos.column);
  }
  /**
   * Test if `obj` is an `IPosition`.
   */
  static isIPosition(obj) {
    return !!obj && typeof obj.lineNumber === "number" && typeof obj.column === "number";
  }
  toJSON() {
    return {
      lineNumber: this.lineNumber,
      column: this.column
    };
  }
}
export {
  Position
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qKlxuICogQSBwb3NpdGlvbiBpbiB0aGUgZWRpdG9yLiBUaGlzIGludGVyZmFjZSBpcyBzdWl0YWJsZSBmb3Igc2VyaWFsaXphdGlvbi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJUG9zaXRpb24ge1xuXHQvKipcblx0ICogbGluZSBudW1iZXIgKHN0YXJ0cyBhdCAxKVxuXHQgKi9cblx0cmVhZG9ubHkgbGluZU51bWJlcjogbnVtYmVyO1xuXHQvKipcblx0ICogY29sdW1uICh0aGUgZmlyc3QgY2hhcmFjdGVyIGluIGEgbGluZSBpcyBiZXR3ZWVuIGNvbHVtbiAxIGFuZCBjb2x1bW4gMilcblx0ICovXG5cdHJlYWRvbmx5IGNvbHVtbjogbnVtYmVyO1xufVxuXG4vKipcbiAqIEEgcG9zaXRpb24gaW4gdGhlIGVkaXRvci5cbiAqL1xuZXhwb3J0IGNsYXNzIFBvc2l0aW9uIHtcblx0LyoqXG5cdCAqIGxpbmUgbnVtYmVyIChzdGFydHMgYXQgMSlcblx0ICovXG5cdHB1YmxpYyByZWFkb25seSBsaW5lTnVtYmVyOiBudW1iZXI7XG5cdC8qKlxuXHQgKiBjb2x1bW4gKHRoZSBmaXJzdCBjaGFyYWN0ZXIgaW4gYSBsaW5lIGlzIGJldHdlZW4gY29sdW1uIDEgYW5kIGNvbHVtbiAyKVxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IGNvbHVtbjogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKGxpbmVOdW1iZXI6IG51bWJlciwgY29sdW1uOiBudW1iZXIpIHtcblx0XHR0aGlzLmxpbmVOdW1iZXIgPSBsaW5lTnVtYmVyO1xuXHRcdHRoaXMuY29sdW1uID0gY29sdW1uO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZSBhIG5ldyBwb3NpdGlvbiBmcm9tIHRoaXMgcG9zaXRpb24uXG5cdCAqXG5cdCAqIEBwYXJhbSBuZXdMaW5lTnVtYmVyIG5ldyBsaW5lIG51bWJlclxuXHQgKiBAcGFyYW0gbmV3Q29sdW1uIG5ldyBjb2x1bW5cblx0ICovXG5cdHdpdGgobmV3TGluZU51bWJlcjogbnVtYmVyID0gdGhpcy5saW5lTnVtYmVyLCBuZXdDb2x1bW46IG51bWJlciA9IHRoaXMuY29sdW1uKTogUG9zaXRpb24ge1xuXHRcdGlmIChuZXdMaW5lTnVtYmVyID09PSB0aGlzLmxpbmVOdW1iZXIgJiYgbmV3Q29sdW1uID09PSB0aGlzLmNvbHVtbikge1xuXHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBuZXcgUG9zaXRpb24obmV3TGluZU51bWJlciwgbmV3Q29sdW1uKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRGVyaXZlIGEgbmV3IHBvc2l0aW9uIGZyb20gdGhpcyBwb3NpdGlvbi5cblx0ICpcblx0ICogQHBhcmFtIGRlbHRhTGluZU51bWJlciBsaW5lIG51bWJlciBkZWx0YVxuXHQgKiBAcGFyYW0gZGVsdGFDb2x1bW4gY29sdW1uIGRlbHRhXG5cdCAqL1xuXHRkZWx0YShkZWx0YUxpbmVOdW1iZXI6IG51bWJlciA9IDAsIGRlbHRhQ29sdW1uOiBudW1iZXIgPSAwKTogUG9zaXRpb24ge1xuXHRcdHJldHVybiB0aGlzLndpdGgoTWF0aC5tYXgoMSwgdGhpcy5saW5lTnVtYmVyICsgZGVsdGFMaW5lTnVtYmVyKSwgTWF0aC5tYXgoMSwgdGhpcy5jb2x1bW4gKyBkZWx0YUNvbHVtbikpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgdGhpcyBwb3NpdGlvbiBlcXVhbHMgb3RoZXIgcG9zaXRpb25cblx0ICovXG5cdHB1YmxpYyBlcXVhbHMob3RoZXI6IElQb3NpdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBQb3NpdGlvbi5lcXVhbHModGhpcywgb3RoZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgcG9zaXRpb24gYGFgIGVxdWFscyBwb3NpdGlvbiBgYmBcblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgZXF1YWxzKGE6IElQb3NpdGlvbiB8IG51bGwsIGI6IElQb3NpdGlvbiB8IG51bGwpOiBib29sZWFuIHtcblx0XHRpZiAoIWEgJiYgIWIpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gKFxuXHRcdFx0ISFhICYmXG5cdFx0XHQhIWIgJiZcblx0XHRcdGEubGluZU51bWJlciA9PT0gYi5saW5lTnVtYmVyICYmXG5cdFx0XHRhLmNvbHVtbiA9PT0gYi5jb2x1bW5cblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgdGhpcyBwb3NpdGlvbiBpcyBiZWZvcmUgb3RoZXIgcG9zaXRpb24uXG5cdCAqIElmIHRoZSB0d28gcG9zaXRpb25zIGFyZSBlcXVhbCwgdGhlIHJlc3VsdCB3aWxsIGJlIGZhbHNlLlxuXHQgKi9cblx0cHVibGljIGlzQmVmb3JlKG90aGVyOiBJUG9zaXRpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gUG9zaXRpb24uaXNCZWZvcmUodGhpcywgb3RoZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgcG9zaXRpb24gYGFgIGlzIGJlZm9yZSBwb3NpdGlvbiBgYmAuXG5cdCAqIElmIHRoZSB0d28gcG9zaXRpb25zIGFyZSBlcXVhbCwgdGhlIHJlc3VsdCB3aWxsIGJlIGZhbHNlLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBpc0JlZm9yZShhOiBJUG9zaXRpb24sIGI6IElQb3NpdGlvbik6IGJvb2xlYW4ge1xuXHRcdGlmIChhLmxpbmVOdW1iZXIgPCBiLmxpbmVOdW1iZXIpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoYi5saW5lTnVtYmVyIDwgYS5saW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBhLmNvbHVtbiA8IGIuY29sdW1uO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRlc3QgaWYgdGhpcyBwb3NpdGlvbiBpcyBiZWZvcmUgb3RoZXIgcG9zaXRpb24uXG5cdCAqIElmIHRoZSB0d28gcG9zaXRpb25zIGFyZSBlcXVhbCwgdGhlIHJlc3VsdCB3aWxsIGJlIHRydWUuXG5cdCAqL1xuXHRwdWJsaWMgaXNCZWZvcmVPckVxdWFsKG90aGVyOiBJUG9zaXRpb24pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gUG9zaXRpb24uaXNCZWZvcmVPckVxdWFsKHRoaXMsIG90aGVyKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUZXN0IGlmIHBvc2l0aW9uIGBhYCBpcyBiZWZvcmUgcG9zaXRpb24gYGJgLlxuXHQgKiBJZiB0aGUgdHdvIHBvc2l0aW9ucyBhcmUgZXF1YWwsIHRoZSByZXN1bHQgd2lsbCBiZSB0cnVlLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBpc0JlZm9yZU9yRXF1YWwoYTogSVBvc2l0aW9uLCBiOiBJUG9zaXRpb24pOiBib29sZWFuIHtcblx0XHRpZiAoYS5saW5lTnVtYmVyIDwgYi5saW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKGIubGluZU51bWJlciA8IGEubGluZU51bWJlcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gYS5jb2x1bW4gPD0gYi5jb2x1bW47XG5cdH1cblxuXHQvKipcblx0ICogQSBmdW5jdGlvbiB0aGF0IGNvbXBhcmVzIHBvc2l0aW9ucywgdXNlZnVsIGZvciBzb3J0aW5nXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGNvbXBhcmUoYTogSVBvc2l0aW9uLCBiOiBJUG9zaXRpb24pOiBudW1iZXIge1xuXHRcdGNvbnN0IGFMaW5lTnVtYmVyID0gYS5saW5lTnVtYmVyIHwgMDtcblx0XHRjb25zdCBiTGluZU51bWJlciA9IGIubGluZU51bWJlciB8IDA7XG5cblx0XHRpZiAoYUxpbmVOdW1iZXIgPT09IGJMaW5lTnVtYmVyKSB7XG5cdFx0XHRjb25zdCBhQ29sdW1uID0gYS5jb2x1bW4gfCAwO1xuXHRcdFx0Y29uc3QgYkNvbHVtbiA9IGIuY29sdW1uIHwgMDtcblx0XHRcdHJldHVybiBhQ29sdW1uIC0gYkNvbHVtbjtcblx0XHR9XG5cblx0XHRyZXR1cm4gYUxpbmVOdW1iZXIgLSBiTGluZU51bWJlcjtcblx0fVxuXG5cdC8qKlxuXHQgKiBDbG9uZSB0aGlzIHBvc2l0aW9uLlxuXHQgKi9cblx0cHVibGljIGNsb25lKCk6IFBvc2l0aW9uIHtcblx0XHRyZXR1cm4gbmV3IFBvc2l0aW9uKHRoaXMubGluZU51bWJlciwgdGhpcy5jb2x1bW4pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENvbnZlcnQgdG8gYSBodW1hbi1yZWFkYWJsZSByZXByZXNlbnRhdGlvbi5cblx0ICovXG5cdHB1YmxpYyB0b1N0cmluZygpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnKCcgKyB0aGlzLmxpbmVOdW1iZXIgKyAnLCcgKyB0aGlzLmNvbHVtbiArICcpJztcblx0fVxuXG5cdC8vIC0tLVxuXG5cdC8qKlxuXHQgKiBDcmVhdGUgYSBgUG9zaXRpb25gIGZyb20gYW4gYElQb3NpdGlvbmAuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIGxpZnQocG9zOiBJUG9zaXRpb24pOiBQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihwb3MubGluZU51bWJlciwgcG9zLmNvbHVtbik7XG5cdH1cblxuXHQvKipcblx0ICogVGVzdCBpZiBgb2JqYCBpcyBhbiBgSVBvc2l0aW9uYC5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgaXNJUG9zaXRpb24ob2JqOiB1bmtub3duKTogb2JqIGlzIElQb3NpdGlvbiB7XG5cdFx0cmV0dXJuIChcblx0XHRcdCEhb2JqXG5cdFx0XHQmJiAodHlwZW9mIChvYmogYXMgSVBvc2l0aW9uKS5saW5lTnVtYmVyID09PSAnbnVtYmVyJylcblx0XHRcdCYmICh0eXBlb2YgKG9iaiBhcyBJUG9zaXRpb24pLmNvbHVtbiA9PT0gJ251bWJlcicpXG5cdFx0KTtcblx0fVxuXG5cdHB1YmxpYyB0b0pTT04oKTogSVBvc2l0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bGluZU51bWJlcjogdGhpcy5saW5lTnVtYmVyLFxuXHRcdFx0Y29sdW1uOiB0aGlzLmNvbHVtblxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQXNCTyxNQUFNLFNBQVM7QUFBQSxFQVVyQixZQUFZLFlBQW9CLFFBQWdCO0FBQy9DLFNBQUssYUFBYTtBQUNsQixTQUFLLFNBQVM7QUFBQSxFQUNmO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRQSxLQUFLLGdCQUF3QixLQUFLLFlBQVksWUFBb0IsS0FBSyxRQUFrQjtBQUN4RixRQUFJLGtCQUFrQixLQUFLLGNBQWMsY0FBYyxLQUFLLFFBQVE7QUFDbkUsYUFBTztBQUFBLElBQ1IsT0FBTztBQUNOLGFBQU8sSUFBSSxTQUFTLGVBQWUsU0FBUztBQUFBLElBQzdDO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsTUFBTSxrQkFBMEIsR0FBRyxjQUFzQixHQUFhO0FBQ3JF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
