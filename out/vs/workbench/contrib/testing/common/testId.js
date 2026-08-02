var TestIdPathParts = /* @__PURE__ */ ((TestIdPathParts2) => {
  TestIdPathParts2["Delimiter"] = "\0";
  return TestIdPathParts2;
})(TestIdPathParts || {});
var TestPosition = /* @__PURE__ */ ((TestPosition2) => {
  TestPosition2[TestPosition2["IsSame"] = 0] = "IsSame";
  TestPosition2[TestPosition2["Disconnected"] = 1] = "Disconnected";
  TestPosition2[TestPosition2["IsChild"] = 2] = "IsChild";
  TestPosition2[TestPosition2["IsParent"] = 3] = "IsParent";
  return TestPosition2;
})(TestPosition || {});
class TestId {
  constructor(path, viewEnd = path.length) {
    this.path = path;
    this.viewEnd = viewEnd;
    if (path.length === 0 || viewEnd < 1) {
      throw new Error("cannot create test with empty path");
    }
  }
  /**
   * Creates a test ID from an ext host test item.
   */
  static fromExtHostTestItem(item, rootId, parent = item.parent) {
    if (item._isRoot) {
      return new TestId([rootId]);
    }
    const path = [item.id];
    for (let i = parent; i && i.id !== rootId; i = i.parent) {
      path.push(i.id);
    }
    path.push(rootId);
    return new TestId(path.reverse());
  }
  /**
   * Cheaply ets whether the ID refers to the root .
   */
  static isRoot(idString) {
    return !idString.includes("\0" /* Delimiter */);
  }
  /**
   * Cheaply gets whether the ID refers to the root .
   */
  static root(idString) {
    const idx = idString.indexOf("\0" /* Delimiter */);
    return idx === -1 ? idString : idString.slice(0, idx);
  }
  /**
   * Creates a test ID from a serialized TestId instance.
   */
  static fromString(idString) {
    return new TestId(idString.split("\0" /* Delimiter */));
  }
  /**
   * Gets the ID resulting from adding b to the base ID.
   */
  static join(base, b) {
    return new TestId([...base.path, b]);
  }
  /**
   * Splits a test ID into its parts.
   */
  static split(idString) {
    return idString.split("\0" /* Delimiter */);
  }
  /**
   * Gets the string ID resulting from adding b to the base ID.
   */
  static joinToString(base, b) {
    return base.toString() + "\0" /* Delimiter */ + b;
  }
  /**
   * Cheaply gets the parent ID of a test identified with the string.
   */
  static parentId(idString) {
    const idx = idString.lastIndexOf("\0" /* Delimiter */);
    return idx === -1 ? void 0 : idString.slice(0, idx);
  }
  /**
   * Cheaply gets the local ID of a test identified with the string.
   */
  static localId(idString) {
    const idx = idString.lastIndexOf("\0" /* Delimiter */);
    return idx === -1 ? idString : idString.slice(idx + "\0" /* Delimiter */.length);
  }
  /**
   * Gets whether maybeChild is a child of maybeParent.
   * todo@connor4312: review usages of this to see if using the WellDefinedPrefixTree is better
   */
  static isChild(maybeParent, maybeChild) {
    return maybeChild[maybeParent.length] === "\0" /* Delimiter */ && maybeChild.startsWith(maybeParent);
  }
  /**
   * Compares the position of the two ID strings.
   * todo@connor4312: review usages of this to see if using the WellDefinedPrefixTree is better
   */
  static compare(a, b) {
    if (a === b) {
      return 0 /* IsSame */;
    }
    if (TestId.isChild(a, b)) {
      return 2 /* IsChild */;
    }
    if (TestId.isChild(b, a)) {
      return 3 /* IsParent */;
    }
    return 1 /* Disconnected */;
  }
  static getLengthOfCommonPrefix(length, getId) {
    if (length === 0) {
      return 0;
    }
    let commonPrefix = 0;
    while (commonPrefix < length - 1) {
      for (let i = 1; i < length; i++) {
        const a = getId(i - 1);
        const b = getId(i);
        if (a.path[commonPrefix] !== b.path[commonPrefix]) {
          return commonPrefix;
        }
      }
      commonPrefix++;
    }
    return commonPrefix;
  }
  /**
   * Gets the ID of the parent test.
   */
  get rootId() {
    return new TestId(this.path, 1);
  }
  /**
   * Gets the ID of the parent test.
   */
  get parentId() {
    return this.viewEnd > 1 ? new TestId(this.path, this.viewEnd - 1) : void 0;
  }
  /**
   * Gets the local ID of the current full test ID.
   */
  get localId() {
    return this.path[this.viewEnd - 1];
  }
  /**
   * Gets whether this ID refers to the root.
   */
  get controllerId() {
    return this.path[0];
  }
  /**
   * Gets whether this ID refers to the root.
   */
  get isRoot() {
    return this.viewEnd === 1;
  }
  /**
   * Returns an iterable that yields IDs of all parent items down to and
   * including the current item.
   */
  *idsFromRoot() {
    for (let i = 1; i <= this.viewEnd; i++) {
      yield new TestId(this.path, i);
    }
  }
  /**
   * Returns an iterable that yields IDs of the current item up to the root
   * item.
   */
  *idsToRoot() {
    for (let i = this.viewEnd; i > 0; i--) {
      yield new TestId(this.path, i);
    }
  }
  /**
   * Compares the other test ID with this one.
   */
  compare(other) {
    if (typeof other === "string") {
      return TestId.compare(this.toString(), other);
    }
    for (let i = 0; i < other.viewEnd && i < this.viewEnd; i++) {
      if (other.path[i] !== this.path[i]) {
        return 1 /* Disconnected */;
      }
    }
    if (other.viewEnd > this.viewEnd) {
      return 2 /* IsChild */;
    }
    if (other.viewEnd < this.viewEnd) {
      return 3 /* IsParent */;
    }
    return 0 /* IsSame */;
  }
  /**
   * Serializes the ID.
   */
  toJSON() {
    return this.toString();
  }
  /**
   * Serializes the ID to a string.
   */
  toString() {
    if (!this.stringifed) {
      this.stringifed = this.path[0];
      for (let i = 1; i < this.viewEnd; i++) {
        this.stringifed += "\0" /* Delimiter */;
        this.stringifed += this.path[i];
      }
    }
    return this.stringifed;
  }
}
export {
  TestId,
  TestIdPathParts,
  TestPosition
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvY29tbW9uL3Rlc3RJZC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmV4cG9ydCBjb25zdCBlbnVtIFRlc3RJZFBhdGhQYXJ0cyB7XG5cdC8qKiBEZWxpbWl0ZXIgZm9yIHBhdGggcGFydHMgaW4gdGVzdCBJRHMgKi9cblx0RGVsaW1pdGVyID0gJ1xcMCcsXG59XG5cbi8qKlxuICogRW51bSBmb3IgZGVzY3JpYmluZyByZWxhdGl2ZSBwb3NpdGlvbnMgb2YgdGVzdHMuIFNpbWlsYXIgdG9cbiAqIGBub2RlLmNvbXBhcmVEb2N1bWVudFBvc2l0aW9uYCBpbiB0aGUgRE9NLlxuICovXG5leHBvcnQgY29uc3QgZW51bSBUZXN0UG9zaXRpb24ge1xuXHQvKiogYSA9PT0gYiAqL1xuXHRJc1NhbWUsXG5cdC8qKiBOZWl0aGVyIGEgbm9yIGIgYXJlIGEgY2hpbGQgb2Ygb25lIGFub3RoZXIuIFRoZXkgbWF5IHNoYXJlIGEgY29tbW9uIHBhcmVudCwgdGhvdWdoLiAqL1xuXHREaXNjb25uZWN0ZWQsXG5cdC8qKiBiIGlzIGEgY2hpbGQgb2YgYSAqL1xuXHRJc0NoaWxkLFxuXHQvKiogYiBpcyBhIHBhcmVudCBvZiBhICovXG5cdElzUGFyZW50LFxufVxuXG50eXBlIFRlc3RJdGVtTGlrZSA9IHsgaWQ6IHN0cmluZzsgcGFyZW50PzogVGVzdEl0ZW1MaWtlOyBfaXNSb290PzogYm9vbGVhbiB9O1xuXG4vKipcbiAqIFRoZSB0ZXN0IElEIGlzIGEgc3RyaW5naWZpYWJsZSBjbGllbnQgdGhhdFxuICovXG5leHBvcnQgY2xhc3MgVGVzdElkIHtcblx0cHJpdmF0ZSBzdHJpbmdpZmVkPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgdGVzdCBJRCBmcm9tIGFuIGV4dCBob3N0IHRlc3QgaXRlbS5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgZnJvbUV4dEhvc3RUZXN0SXRlbShpdGVtOiBUZXN0SXRlbUxpa2UsIHJvb3RJZDogc3RyaW5nLCBwYXJlbnQgPSBpdGVtLnBhcmVudCkge1xuXHRcdGlmIChpdGVtLl9pc1Jvb3QpIHtcblx0XHRcdHJldHVybiBuZXcgVGVzdElkKFtyb290SWRdKTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXRoID0gW2l0ZW0uaWRdO1xuXHRcdGZvciAobGV0IGkgPSBwYXJlbnQ7IGkgJiYgaS5pZCAhPT0gcm9vdElkOyBpID0gaS5wYXJlbnQpIHtcblx0XHRcdHBhdGgucHVzaChpLmlkKTtcblx0XHR9XG5cdFx0cGF0aC5wdXNoKHJvb3RJZCk7XG5cblx0XHRyZXR1cm4gbmV3IFRlc3RJZChwYXRoLnJldmVyc2UoKSk7XG5cdH1cblxuXHQvKipcblx0ICogQ2hlYXBseSBldHMgd2hldGhlciB0aGUgSUQgcmVmZXJzIHRvIHRoZSByb290IC5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgaXNSb290KGlkU3RyaW5nOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gIWlkU3RyaW5nLmluY2x1ZGVzKFRlc3RJZFBhdGhQYXJ0cy5EZWxpbWl0ZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWFwbHkgZ2V0cyB3aGV0aGVyIHRoZSBJRCByZWZlcnMgdG8gdGhlIHJvb3QgLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyByb290KGlkU3RyaW5nOiBzdHJpbmcpIHtcblx0XHRjb25zdCBpZHggPSBpZFN0cmluZy5pbmRleE9mKFRlc3RJZFBhdGhQYXJ0cy5EZWxpbWl0ZXIpO1xuXHRcdHJldHVybiBpZHggPT09IC0xID8gaWRTdHJpbmcgOiBpZFN0cmluZy5zbGljZSgwLCBpZHgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENyZWF0ZXMgYSB0ZXN0IElEIGZyb20gYSBzZXJpYWxpemVkIFRlc3RJZCBpbnN0YW5jZS5cblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgZnJvbVN0cmluZyhpZFN0cmluZzogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIG5ldyBUZXN0SWQoaWRTdHJpbmcuc3BsaXQoVGVzdElkUGF0aFBhcnRzLkRlbGltaXRlcikpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIElEIHJlc3VsdGluZyBmcm9tIGFkZGluZyBiIHRvIHRoZSBiYXNlIElELlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBqb2luKGJhc2U6IFRlc3RJZCwgYjogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIG5ldyBUZXN0SWQoWy4uLmJhc2UucGF0aCwgYl0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNwbGl0cyBhIHRlc3QgSUQgaW50byBpdHMgcGFydHMuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIHNwbGl0KGlkU3RyaW5nOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gaWRTdHJpbmcuc3BsaXQoVGVzdElkUGF0aFBhcnRzLkRlbGltaXRlcik7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgc3RyaW5nIElEIHJlc3VsdGluZyBmcm9tIGFkZGluZyBiIHRvIHRoZSBiYXNlIElELlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBqb2luVG9TdHJpbmcoYmFzZTogc3RyaW5nIHwgVGVzdElkLCBiOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gYmFzZS50b1N0cmluZygpICsgVGVzdElkUGF0aFBhcnRzLkRlbGltaXRlciArIGI7XG5cdH1cblxuXHQvKipcblx0ICogQ2hlYXBseSBnZXRzIHRoZSBwYXJlbnQgSUQgb2YgYSB0ZXN0IGlkZW50aWZpZWQgd2l0aCB0aGUgc3RyaW5nLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBwYXJlbnRJZChpZFN0cmluZzogc3RyaW5nKSB7XG5cdFx0Y29uc3QgaWR4ID0gaWRTdHJpbmcubGFzdEluZGV4T2YoVGVzdElkUGF0aFBhcnRzLkRlbGltaXRlcik7XG5cdFx0cmV0dXJuIGlkeCA9PT0gLTEgPyB1bmRlZmluZWQgOiBpZFN0cmluZy5zbGljZSgwLCBpZHgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENoZWFwbHkgZ2V0cyB0aGUgbG9jYWwgSUQgb2YgYSB0ZXN0IGlkZW50aWZpZWQgd2l0aCB0aGUgc3RyaW5nLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBsb2NhbElkKGlkU3RyaW5nOiBzdHJpbmcpIHtcblx0XHRjb25zdCBpZHggPSBpZFN0cmluZy5sYXN0SW5kZXhPZihUZXN0SWRQYXRoUGFydHMuRGVsaW1pdGVyKTtcblx0XHRyZXR1cm4gaWR4ID09PSAtMSA/IGlkU3RyaW5nIDogaWRTdHJpbmcuc2xpY2UoaWR4ICsgVGVzdElkUGF0aFBhcnRzLkRlbGltaXRlci5sZW5ndGgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgd2hldGhlciBtYXliZUNoaWxkIGlzIGEgY2hpbGQgb2YgbWF5YmVQYXJlbnQuXG5cdCAqIHRvZG9AY29ubm9yNDMxMjogcmV2aWV3IHVzYWdlcyBvZiB0aGlzIHRvIHNlZSBpZiB1c2luZyB0aGUgV2VsbERlZmluZWRQcmVmaXhUcmVlIGlzIGJldHRlclxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBpc0NoaWxkKG1heWJlUGFyZW50OiBzdHJpbmcsIG1heWJlQ2hpbGQ6IHN0cmluZykge1xuXHRcdHJldHVybiBtYXliZUNoaWxkW21heWJlUGFyZW50Lmxlbmd0aF0gPT09IFRlc3RJZFBhdGhQYXJ0cy5EZWxpbWl0ZXIgJiYgbWF5YmVDaGlsZC5zdGFydHNXaXRoKG1heWJlUGFyZW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wYXJlcyB0aGUgcG9zaXRpb24gb2YgdGhlIHR3byBJRCBzdHJpbmdzLlxuXHQgKiB0b2RvQGNvbm5vcjQzMTI6IHJldmlldyB1c2FnZXMgb2YgdGhpcyB0byBzZWUgaWYgdXNpbmcgdGhlIFdlbGxEZWZpbmVkUHJlZml4VHJlZSBpcyBiZXR0ZXJcblx0ICovXG5cdHB1YmxpYyBzdGF0aWMgY29tcGFyZShhOiBzdHJpbmcsIGI6IHN0cmluZykge1xuXHRcdGlmIChhID09PSBiKSB7XG5cdFx0XHRyZXR1cm4gVGVzdFBvc2l0aW9uLklzU2FtZTtcblx0XHR9XG5cblx0XHRpZiAoVGVzdElkLmlzQ2hpbGQoYSwgYikpIHtcblx0XHRcdHJldHVybiBUZXN0UG9zaXRpb24uSXNDaGlsZDtcblx0XHR9XG5cblx0XHRpZiAoVGVzdElkLmlzQ2hpbGQoYiwgYSkpIHtcblx0XHRcdHJldHVybiBUZXN0UG9zaXRpb24uSXNQYXJlbnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFRlc3RQb3NpdGlvbi5EaXNjb25uZWN0ZWQ7XG5cdH1cblxuXHRwdWJsaWMgc3RhdGljIGdldExlbmd0aE9mQ29tbW9uUHJlZml4KGxlbmd0aDogbnVtYmVyLCBnZXRJZDogKGk6IG51bWJlcikgPT4gVGVzdElkKTogbnVtYmVyIHtcblx0XHRpZiAobGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRsZXQgY29tbW9uUHJlZml4ID0gMDtcblx0XHR3aGlsZSAoY29tbW9uUHJlZml4IDwgbGVuZ3RoIC0gMSkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCBsZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBhID0gZ2V0SWQoaSAtIDEpO1xuXHRcdFx0XHRjb25zdCBiID0gZ2V0SWQoaSk7XG5cdFx0XHRcdGlmIChhLnBhdGhbY29tbW9uUHJlZml4XSAhPT0gYi5wYXRoW2NvbW1vblByZWZpeF0pIHtcblx0XHRcdFx0XHRyZXR1cm4gY29tbW9uUHJlZml4O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbW1vblByZWZpeCsrO1xuXHRcdH1cblxuXHRcdHJldHVybiBjb21tb25QcmVmaXg7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgcGF0aDogcmVhZG9ubHkgc3RyaW5nW10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2aWV3RW5kID0gcGF0aC5sZW5ndGgsXG5cdCkge1xuXHRcdGlmIChwYXRoLmxlbmd0aCA9PT0gMCB8fCB2aWV3RW5kIDwgMSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdjYW5ub3QgY3JlYXRlIHRlc3Qgd2l0aCBlbXB0eSBwYXRoJyk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEdldHMgdGhlIElEIG9mIHRoZSBwYXJlbnQgdGVzdC5cblx0ICovXG5cdHB1YmxpYyBnZXQgcm9vdElkKCk6IFRlc3RJZCB7XG5cdFx0cmV0dXJuIG5ldyBUZXN0SWQodGhpcy5wYXRoLCAxKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBJRCBvZiB0aGUgcGFyZW50IHRlc3QuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IHBhcmVudElkKCk6IFRlc3RJZCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMudmlld0VuZCA+IDEgPyBuZXcgVGVzdElkKHRoaXMucGF0aCwgdGhpcy52aWV3RW5kIC0gMSkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB0aGUgbG9jYWwgSUQgb2YgdGhlIGN1cnJlbnQgZnVsbCB0ZXN0IElELlxuXHQgKi9cblx0cHVibGljIGdldCBsb2NhbElkKCkge1xuXHRcdHJldHVybiB0aGlzLnBhdGhbdGhpcy52aWV3RW5kIC0gMV07XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyB3aGV0aGVyIHRoaXMgSUQgcmVmZXJzIHRvIHRoZSByb290LlxuXHQgKi9cblx0cHVibGljIGdldCBjb250cm9sbGVySWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMucGF0aFswXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHdoZXRoZXIgdGhpcyBJRCByZWZlcnMgdG8gdGhlIHJvb3QuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0IGlzUm9vdCgpIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3RW5kID09PSAxO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYW4gaXRlcmFibGUgdGhhdCB5aWVsZHMgSURzIG9mIGFsbCBwYXJlbnQgaXRlbXMgZG93biB0byBhbmRcblx0ICogaW5jbHVkaW5nIHRoZSBjdXJyZW50IGl0ZW0uXG5cdCAqL1xuXHRwdWJsaWMgKmlkc0Zyb21Sb290KCkge1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDw9IHRoaXMudmlld0VuZDsgaSsrKSB7XG5cdFx0XHR5aWVsZCBuZXcgVGVzdElkKHRoaXMucGF0aCwgaSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYW4gaXRlcmFibGUgdGhhdCB5aWVsZHMgSURzIG9mIHRoZSBjdXJyZW50IGl0ZW0gdXAgdG8gdGhlIHJvb3Rcblx0ICogaXRlbS5cblx0ICovXG5cdHB1YmxpYyAqaWRzVG9Sb290KCkge1xuXHRcdGZvciAobGV0IGkgPSB0aGlzLnZpZXdFbmQ7IGkgPiAwOyBpLS0pIHtcblx0XHRcdHlpZWxkIG5ldyBUZXN0SWQodGhpcy5wYXRoLCBpKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ29tcGFyZXMgdGhlIG90aGVyIHRlc3QgSUQgd2l0aCB0aGlzIG9uZS5cblx0ICovXG5cdHB1YmxpYyBjb21wYXJlKG90aGVyOiBUZXN0SWQgfCBzdHJpbmcpIHtcblx0XHRpZiAodHlwZW9mIG90aGVyID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIFRlc3RJZC5jb21wYXJlKHRoaXMudG9TdHJpbmcoKSwgb3RoZXIpO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgb3RoZXIudmlld0VuZCAmJiBpIDwgdGhpcy52aWV3RW5kOyBpKyspIHtcblx0XHRcdGlmIChvdGhlci5wYXRoW2ldICE9PSB0aGlzLnBhdGhbaV0pIHtcblx0XHRcdFx0cmV0dXJuIFRlc3RQb3NpdGlvbi5EaXNjb25uZWN0ZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG90aGVyLnZpZXdFbmQgPiB0aGlzLnZpZXdFbmQpIHtcblx0XHRcdHJldHVybiBUZXN0UG9zaXRpb24uSXNDaGlsZDtcblx0XHR9XG5cblx0XHRpZiAob3RoZXIudmlld0VuZCA8IHRoaXMudmlld0VuZCkge1xuXHRcdFx0cmV0dXJuIFRlc3RQb3NpdGlvbi5Jc1BhcmVudDtcblx0XHR9XG5cblx0XHRyZXR1cm4gVGVzdFBvc2l0aW9uLklzU2FtZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXJpYWxpemVzIHRoZSBJRC5cblx0ICovXG5cdHB1YmxpYyB0b0pTT04oKSB7XG5cdFx0cmV0dXJuIHRoaXMudG9TdHJpbmcoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXJpYWxpemVzIHRoZSBJRCB0byBhIHN0cmluZy5cblx0ICovXG5cdHB1YmxpYyB0b1N0cmluZygpIHtcblx0XHRpZiAoIXRoaXMuc3RyaW5naWZlZCkge1xuXHRcdFx0dGhpcy5zdHJpbmdpZmVkID0gdGhpcy5wYXRoWzBdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDE7IGkgPCB0aGlzLnZpZXdFbmQ7IGkrKykge1xuXHRcdFx0XHR0aGlzLnN0cmluZ2lmZWQgKz0gVGVzdElkUGF0aFBhcnRzLkRlbGltaXRlcjtcblx0XHRcdFx0dGhpcy5zdHJpbmdpZmVkICs9IHRoaXMucGF0aFtpXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5zdHJpbmdpZmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLTyxJQUFXLGtCQUFYLGtCQUFXQSxxQkFBWDtBQUVOLEVBQUFBLGlCQUFBLGVBQVk7QUFGSyxTQUFBQTtBQUFBLEdBQUE7QUFTWCxJQUFXLGVBQVgsa0JBQVdDLGtCQUFYO0FBRU4sRUFBQUEsNEJBQUE7QUFFQSxFQUFBQSw0QkFBQTtBQUVBLEVBQUFBLDRCQUFBO0FBRUEsRUFBQUEsNEJBQUE7QUFSaUIsU0FBQUE7QUFBQSxHQUFBO0FBZ0JYLE1BQU0sT0FBTztBQUFBLEVBZ0luQixZQUNpQixNQUNDLFVBQVUsS0FBSyxRQUMvQjtBQUZlO0FBQ0M7QUFFakIsUUFBSSxLQUFLLFdBQVcsS0FBSyxVQUFVLEdBQUc7QUFDckMsWUFBTSxJQUFJLE1BQU0sb0NBQW9DO0FBQUEsSUFDckQ7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFqSUEsT0FBYyxvQkFBb0IsTUFBb0IsUUFBZ0IsU0FBUyxLQUFLLFFBQVE7QUFDM0YsUUFBSSxLQUFLLFNBQVM7QUFDakIsYUFBTyxJQUFJLE9BQU8sQ0FBQyxNQUFNLENBQUM7QUFBQSxJQUMzQjtBQUVBLFVBQU0sT0FBTyxDQUFDLEtBQUssRUFBRTtBQUNyQixhQUFTLElBQUksUUFBUSxLQUFLLEVBQUUsT0FBTyxRQUFRLElBQUksRUFBRSxRQUFRO0FBQ3hELFdBQUssS0FBSyxFQUFFLEVBQUU7QUFBQSxJQUNmO0FBQ0EsU0FBSyxLQUFLLE1BQU07QUFFaEIsV0FBTyxJQUFJLE9BQU8sS0FBSyxRQUFRLENBQUM7QUFBQSxFQUNqQztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsT0FBYyxPQUFPLFVBQWtCO0FBQ3RDLFdBQU8sQ0FBQyxTQUFTLFNBQVMsb0JBQXlCO0FBQUEsRUFDcEQ7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE9BQWMsS0FBSyxVQUFrQjtBQUNwQyxVQUFNLE1BQU0sU0FBUyxRQUFRLG9CQUF5QjtBQUN0RCxXQUFPLFFBQVEsS0FBSyxXQUFXLFNBQVMsTUFBTSxHQUFHLEdBQUc7QUFBQSxFQUNyRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsT0FBYyxXQUFXLFVBQWtCO0FBQzFDLFdBQU8sSUFBSSxPQUFPLFNBQVMsTUFBTSxvQkFBeUIsQ0FBQztBQUFBLEVBQzVEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxPQUFjLEtBQUssTUFBYyxHQUFXO0FBQzNDLFdBQU8sSUFBSSxPQUFPLENBQUMsR0FBRyxLQUFLLE1BQU0sQ0FBQyxDQUFDO0FBQUEsRUFDcEM7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE9BQWMsTUFBTSxVQUFrQjtBQUNyQyxXQUFPLFNBQVMsTUFBTSxvQkFBeUI7QUFBQSxFQUNoRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsT0FBYyxhQUFhLE1BQXVCLEdBQVc7QUFDNUQsV0FBTyxLQUFLLFNBQVMsSUFBSSx1QkFBNEI7QUFBQSxFQUN0RDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsT0FBYyxTQUFTLFVBQWtCO0FBQ3hDLFVBQU0sTUFBTSxTQUFTLFlBQVksb0JBQXlCO0FBQzFELFdBQU8sUUFBUSxLQUFLLFNBQVksU0FBUyxNQUFNLEdBQUcsR0FBRztBQUFBLEVBQ3REO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxPQUFjLFFBQVEsVUFBa0I7QUFDdkMsVUFBTSxNQUFNLFNBQVMsWUFBWSxvQkFBeUI7QUFDMUQsV0FBTyxRQUFRLEtBQUssV0FBVyxTQUFTLE1BQU0sTUFBTSxxQkFBMEIsTUFBTTtBQUFBLEVBQ3JGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLE9BQWMsUUFBUSxhQUFxQixZQUFvQjtBQUM5RCxXQUFPLFdBQVcsWUFBWSxNQUFNLE1BQU0sd0JBQTZCLFdBQVcsV0FBVyxXQUFXO0FBQUEsRUFDekc7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsT0FBYyxRQUFRLEdBQVcsR0FBVztBQUMzQyxRQUFJLE1BQU0sR0FBRztBQUNaLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxPQUFPLFFBQVEsR0FBRyxDQUFDLEdBQUc7QUFDekIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLE9BQU8sUUFBUSxHQUFHLENBQUMsR0FBRztBQUN6QixhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxPQUFjLHdCQUF3QixRQUFnQixPQUFzQztBQUMzRixRQUFJLFdBQVcsR0FBRztBQUNqQixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksZUFBZTtBQUNuQixXQUFPLGVBQWUsU0FBUyxHQUFHO0FBQ2pDLGVBQVMsSUFBSSxHQUFHLElBQUksUUFBUSxLQUFLO0FBQ2hDLGNBQU0sSUFBSSxNQUFNLElBQUksQ0FBQztBQUNyQixjQUFNLElBQUksTUFBTSxDQUFDO0FBQ2pCLFlBQUksRUFBRSxLQUFLLFlBQVksTUFBTSxFQUFFLEtBQUssWUFBWSxHQUFHO0FBQ2xELGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFFQTtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBY0EsSUFBVyxTQUFpQjtBQUMzQixXQUFPLElBQUksT0FBTyxLQUFLLE1BQU0sQ0FBQztBQUFBLEVBQy9CO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxJQUFXLFdBQStCO0FBQ3pDLFdBQU8sS0FBSyxVQUFVLElBQUksSUFBSSxPQUFPLEtBQUssTUFBTSxLQUFLLFVBQVUsQ0FBQyxJQUFJO0FBQUEsRUFDckU7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLElBQVcsVUFBVTtBQUNwQixXQUFPLEtBQUssS0FBSyxLQUFLLFVBQVUsQ0FBQztBQUFBLEVBQ2xDO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxJQUFXLGVBQWU7QUFDekIsV0FBTyxLQUFLLEtBQUssQ0FBQztBQUFBLEVBQ25CO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxJQUFXLFNBQVM7QUFDbkIsV0FBTyxLQUFLLFlBQVk7QUFBQSxFQUN6QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxDQUFRLGNBQWM7QUFDckIsYUFBUyxJQUFJLEdBQUcsS0FBSyxLQUFLLFNBQVMsS0FBSztBQUN2QyxZQUFNLElBQUksT0FBTyxLQUFLLE1BQU0sQ0FBQztBQUFBLElBQzlCO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxDQUFRLFlBQVk7QUFDbkIsYUFBUyxJQUFJLEtBQUssU0FBUyxJQUFJLEdBQUcsS0FBSztBQUN0QyxZQUFNLElBQUksT0FBTyxLQUFLLE1BQU0sQ0FBQztBQUFBLElBQzlCO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sUUFBUSxPQUF3QjtBQUN0QyxRQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLGFBQU8sT0FBTyxRQUFRLEtBQUssU0FBUyxHQUFHLEtBQUs7QUFBQSxJQUM3QztBQUVBLGFBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxXQUFXLElBQUksS0FBSyxTQUFTLEtBQUs7QUFDM0QsVUFBSSxNQUFNLEtBQUssQ0FBQyxNQUFNLEtBQUssS0FBSyxDQUFDLEdBQUc7QUFDbkMsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsUUFBSSxNQUFNLFVBQVUsS0FBSyxTQUFTO0FBQ2pDLGFBQU87QUFBQSxJQUNSO0FBRUEsUUFBSSxNQUFNLFVBQVUsS0FBSyxTQUFTO0FBQ2pDLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtPLFNBQVM7QUFDZixXQUFPLEtBQUssU0FBUztBQUFBLEVBQ3RCO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxXQUFXO0FBQ2pCLFFBQUksQ0FBQyxLQUFLLFlBQVk7QUFDckIsV0FBSyxhQUFhLEtBQUssS0FBSyxDQUFDO0FBQzdCLGVBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxTQUFTLEtBQUs7QUFDdEMsYUFBSyxjQUFjO0FBQ25CLGFBQUssY0FBYyxLQUFLLEtBQUssQ0FBQztBQUFBLE1BQy9CO0FBQUEsSUFDRDtBQUVBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFDRDsiLAogICJuYW1lcyI6IFsiVGVzdElkUGF0aFBhcnRzIiwgIlRlc3RQb3NpdGlvbiJdCn0K
