import { Range } from "../../../common/range.js";
function groupIntersect(range, groups) {
  const result = [];
  for (const r of groups) {
    if (range.start >= r.range.end) {
      continue;
    }
    if (range.end < r.range.start) {
      break;
    }
    const intersection = Range.intersect(range, r.range);
    if (Range.isEmpty(intersection)) {
      continue;
    }
    result.push({
      range: intersection,
      size: r.size
    });
  }
  return result;
}
function shift({ start, end }, much) {
  return { start: start + much, end: end + much };
}
function consolidate(groups) {
  const result = [];
  let previousGroup = null;
  for (const group of groups) {
    const start = group.range.start;
    const end = group.range.end;
    const size = group.size;
    if (previousGroup && size === previousGroup.size) {
      previousGroup.range.end = end;
      continue;
    }
    previousGroup = { range: { start, end }, size };
    result.push(previousGroup);
  }
  return result;
}
function concat(...groups) {
  return consolidate(groups.reduce((r, g) => r.concat(g), []));
}
class RangeMap {
  constructor(topPadding) {
    this.groups = [];
    this._size = 0;
    this._paddingTop = 0;
    this._paddingTop = topPadding ?? 0;
    this._size = this._paddingTop;
  }
  get paddingTop() {
    return this._paddingTop;
  }
  set paddingTop(paddingTop) {
    this._size = this._size + paddingTop - this._paddingTop;
    this._paddingTop = paddingTop;
  }
  splice(index, deleteCount, items = []) {
    const diff = items.length - deleteCount;
    const before = groupIntersect({ start: 0, end: index }, this.groups);
    const after = groupIntersect({ start: index + deleteCount, end: Number.POSITIVE_INFINITY }, this.groups).map((g) => ({ range: shift(g.range, diff), size: g.size }));
    const middle = items.map((item, i) => ({
      range: { start: index + i, end: index + i + 1 },
      size: item.size
    }));
    this.groups = concat(before, middle, after);
    this._size = this._paddingTop + this.groups.reduce((t, g) => t + g.size * (g.range.end - g.range.start), 0);
  }
  /**
   * Returns the number of items in the range map.
   */
  get count() {
    const len = this.groups.length;
    if (!len) {
      return 0;
    }
    return this.groups[len - 1].range.end;
  }
  /**
   * Returns the sum of the sizes of all items in the range map.
   */
  get size() {
    return this._size;
  }
  /**
   * Returns the index of the item at the given position.
   */
  indexAt(position) {
    if (position < 0) {
      return -1;
    }
    if (position < this._paddingTop) {
      return 0;
    }
    let index = 0;
    let size = this._paddingTop;
    for (const group of this.groups) {
      const count = group.range.end - group.range.start;
      const newSize = size + count * group.size;
      if (position < newSize) {
        return index + Math.floor((position - size) / group.size);
      }
      index += count;
      size = newSize;
    }
    return index;
  }
  /**
   * Returns the index of the item right after the item at the
   * index of the given position.
   */
  indexAfter(position) {
    return Math.min(this.indexAt(position) + 1, this.count);
  }
  /**
   * Returns the start position of the item at the given index.
   */
  positionAt(index) {
    if (index < 0) {
      return -1;
    }
    let position = 0;
    let count = 0;
    for (const group of this.groups) {
      const groupCount = group.range.end - group.range.start;
      const newCount = count + groupCount;
      if (index < newCount) {
        return this._paddingTop + position + (index - count) * group.size;
      }
      position += groupCount * group.size;
      count = newCount;
    }
    return -1;
  }
}
export {
  RangeMap,
  consolidate,
  groupIntersect,
  shift
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvYnJvd3Nlci91aS9saXN0L3JhbmdlTWFwLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9yYW5nZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUl0ZW0ge1xuXHRzaXplOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJhbmdlZEdyb3VwIHtcblx0cmFuZ2U6IElSYW5nZTtcblx0c2l6ZTogbnVtYmVyO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIGludGVyc2VjdGlvbiBiZXR3ZWVuIGEgcmFuZ2VkIGdyb3VwIGFuZCBhIHJhbmdlLlxuICogUmV0dXJucyBgW11gIGlmIHRoZSBpbnRlcnNlY3Rpb24gaXMgZW1wdHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBncm91cEludGVyc2VjdChyYW5nZTogSVJhbmdlLCBncm91cHM6IElSYW5nZWRHcm91cFtdKTogSVJhbmdlZEdyb3VwW10ge1xuXHRjb25zdCByZXN1bHQ6IElSYW5nZWRHcm91cFtdID0gW107XG5cblx0Zm9yIChjb25zdCByIG9mIGdyb3Vwcykge1xuXHRcdGlmIChyYW5nZS5zdGFydCA+PSByLnJhbmdlLmVuZCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKHJhbmdlLmVuZCA8IHIucmFuZ2Uuc3RhcnQpIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGNvbnN0IGludGVyc2VjdGlvbiA9IFJhbmdlLmludGVyc2VjdChyYW5nZSwgci5yYW5nZSk7XG5cblx0XHRpZiAoUmFuZ2UuaXNFbXB0eShpbnRlcnNlY3Rpb24pKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRyYW5nZTogaW50ZXJzZWN0aW9uLFxuXHRcdFx0c2l6ZTogci5zaXplXG5cdFx0fSk7XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFNoaWZ0cyBhIHJhbmdlIGJ5IHRoYXQgYG11Y2hgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc2hpZnQoeyBzdGFydCwgZW5kIH06IElSYW5nZSwgbXVjaDogbnVtYmVyKTogSVJhbmdlIHtcblx0cmV0dXJuIHsgc3RhcnQ6IHN0YXJ0ICsgbXVjaCwgZW5kOiBlbmQgKyBtdWNoIH07XG59XG5cbi8qKlxuICogQ29uc29saWRhdGVzIGEgY29sbGVjdGlvbiBvZiByYW5nZWQgZ3JvdXBzLlxuICpcbiAqIENvbnNvbGlkYXRpb24gaXMgdGhlIHByb2Nlc3Mgb2YgbWVyZ2luZyBjb25zZWN1dGl2ZSByYW5nZWQgZ3JvdXBzXG4gKiB0aGF0IHNoYXJlIHRoZSBzYW1lIGBzaXplYC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbnNvbGlkYXRlKGdyb3VwczogSVJhbmdlZEdyb3VwW10pOiBJUmFuZ2VkR3JvdXBbXSB7XG5cdGNvbnN0IHJlc3VsdDogSVJhbmdlZEdyb3VwW10gPSBbXTtcblx0bGV0IHByZXZpb3VzR3JvdXA6IElSYW5nZWRHcm91cCB8IG51bGwgPSBudWxsO1xuXG5cdGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG5cdFx0Y29uc3Qgc3RhcnQgPSBncm91cC5yYW5nZS5zdGFydDtcblx0XHRjb25zdCBlbmQgPSBncm91cC5yYW5nZS5lbmQ7XG5cdFx0Y29uc3Qgc2l6ZSA9IGdyb3VwLnNpemU7XG5cblx0XHRpZiAocHJldmlvdXNHcm91cCAmJiBzaXplID09PSBwcmV2aW91c0dyb3VwLnNpemUpIHtcblx0XHRcdHByZXZpb3VzR3JvdXAucmFuZ2UuZW5kID0gZW5kO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0cHJldmlvdXNHcm91cCA9IHsgcmFuZ2U6IHsgc3RhcnQsIGVuZCB9LCBzaXplIH07XG5cdFx0cmVzdWx0LnB1c2gocHJldmlvdXNHcm91cCk7XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIENvbmNhdGVuYXRlcyBzZXZlcmFsIGNvbGxlY3Rpb25zIG9mIHJhbmdlZCBncm91cHMgaW50byBhIHNpbmdsZVxuICogY29sbGVjdGlvbi5cbiAqL1xuZnVuY3Rpb24gY29uY2F0KC4uLmdyb3VwczogSVJhbmdlZEdyb3VwW11bXSk6IElSYW5nZWRHcm91cFtdIHtcblx0cmV0dXJuIGNvbnNvbGlkYXRlKGdyb3Vwcy5yZWR1Y2UoKHIsIGcpID0+IHIuY29uY2F0KGcpLCBbXSkpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElSYW5nZU1hcCB7XG5cdHJlYWRvbmx5IHNpemU6IG51bWJlcjtcblx0cmVhZG9ubHkgY291bnQ6IG51bWJlcjtcblx0cGFkZGluZ1RvcDogbnVtYmVyO1xuXHRzcGxpY2UoaW5kZXg6IG51bWJlciwgZGVsZXRlQ291bnQ6IG51bWJlciwgaXRlbXM/OiBJSXRlbVtdKTogdm9pZDtcblx0aW5kZXhBdChwb3NpdGlvbjogbnVtYmVyKTogbnVtYmVyO1xuXHRpbmRleEFmdGVyKHBvc2l0aW9uOiBudW1iZXIpOiBudW1iZXI7XG5cdHBvc2l0aW9uQXQoaW5kZXg6IG51bWJlcik6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIFJhbmdlTWFwIGltcGxlbWVudHMgSVJhbmdlTWFwIHtcblxuXHRwcml2YXRlIGdyb3VwczogSVJhbmdlZEdyb3VwW10gPSBbXTtcblx0cHJpdmF0ZSBfc2l6ZSA9IDA7XG5cdHByaXZhdGUgX3BhZGRpbmdUb3AgPSAwO1xuXG5cdGdldCBwYWRkaW5nVG9wKCkge1xuXHRcdHJldHVybiB0aGlzLl9wYWRkaW5nVG9wO1xuXHR9XG5cblx0c2V0IHBhZGRpbmdUb3AocGFkZGluZ1RvcDogbnVtYmVyKSB7XG5cdFx0dGhpcy5fc2l6ZSA9IHRoaXMuX3NpemUgKyBwYWRkaW5nVG9wIC0gdGhpcy5fcGFkZGluZ1RvcDtcblx0XHR0aGlzLl9wYWRkaW5nVG9wID0gcGFkZGluZ1RvcDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHRvcFBhZGRpbmc/OiBudW1iZXIpIHtcblx0XHR0aGlzLl9wYWRkaW5nVG9wID0gdG9wUGFkZGluZyA/PyAwO1xuXHRcdHRoaXMuX3NpemUgPSB0aGlzLl9wYWRkaW5nVG9wO1xuXHR9XG5cblx0c3BsaWNlKGluZGV4OiBudW1iZXIsIGRlbGV0ZUNvdW50OiBudW1iZXIsIGl0ZW1zOiBJSXRlbVtdID0gW10pOiB2b2lkIHtcblx0XHRjb25zdCBkaWZmID0gaXRlbXMubGVuZ3RoIC0gZGVsZXRlQ291bnQ7XG5cdFx0Y29uc3QgYmVmb3JlID0gZ3JvdXBJbnRlcnNlY3QoeyBzdGFydDogMCwgZW5kOiBpbmRleCB9LCB0aGlzLmdyb3Vwcyk7XG5cdFx0Y29uc3QgYWZ0ZXIgPSBncm91cEludGVyc2VjdCh7IHN0YXJ0OiBpbmRleCArIGRlbGV0ZUNvdW50LCBlbmQ6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSB9LCB0aGlzLmdyb3Vwcylcblx0XHRcdC5tYXA8SVJhbmdlZEdyb3VwPihnID0+ICh7IHJhbmdlOiBzaGlmdChnLnJhbmdlLCBkaWZmKSwgc2l6ZTogZy5zaXplIH0pKTtcblxuXHRcdGNvbnN0IG1pZGRsZSA9IGl0ZW1zLm1hcDxJUmFuZ2VkR3JvdXA+KChpdGVtLCBpKSA9PiAoe1xuXHRcdFx0cmFuZ2U6IHsgc3RhcnQ6IGluZGV4ICsgaSwgZW5kOiBpbmRleCArIGkgKyAxIH0sXG5cdFx0XHRzaXplOiBpdGVtLnNpemVcblx0XHR9KSk7XG5cblx0XHR0aGlzLmdyb3VwcyA9IGNvbmNhdChiZWZvcmUsIG1pZGRsZSwgYWZ0ZXIpO1xuXHRcdHRoaXMuX3NpemUgPSB0aGlzLl9wYWRkaW5nVG9wICsgdGhpcy5ncm91cHMucmVkdWNlKCh0LCBnKSA9PiB0ICsgKGcuc2l6ZSAqIChnLnJhbmdlLmVuZCAtIGcucmFuZ2Uuc3RhcnQpKSwgMCk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgbnVtYmVyIG9mIGl0ZW1zIGluIHRoZSByYW5nZSBtYXAuXG5cdCAqL1xuXHRnZXQgY291bnQoKTogbnVtYmVyIHtcblx0XHRjb25zdCBsZW4gPSB0aGlzLmdyb3Vwcy5sZW5ndGg7XG5cblx0XHRpZiAoIWxlbikge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuZ3JvdXBzW2xlbiAtIDFdLnJhbmdlLmVuZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBzdW0gb2YgdGhlIHNpemVzIG9mIGFsbCBpdGVtcyBpbiB0aGUgcmFuZ2UgbWFwLlxuXHQgKi9cblx0Z2V0IHNpemUoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fc2l6ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBpbmRleCBvZiB0aGUgaXRlbSBhdCB0aGUgZ2l2ZW4gcG9zaXRpb24uXG5cdCAqL1xuXHRpbmRleEF0KHBvc2l0aW9uOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmIChwb3NpdGlvbiA8IDApIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cblx0XHRpZiAocG9zaXRpb24gPCB0aGlzLl9wYWRkaW5nVG9wKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cblx0XHRsZXQgaW5kZXggPSAwO1xuXHRcdGxldCBzaXplID0gdGhpcy5fcGFkZGluZ1RvcDtcblxuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgdGhpcy5ncm91cHMpIHtcblx0XHRcdGNvbnN0IGNvdW50ID0gZ3JvdXAucmFuZ2UuZW5kIC0gZ3JvdXAucmFuZ2Uuc3RhcnQ7XG5cdFx0XHRjb25zdCBuZXdTaXplID0gc2l6ZSArIChjb3VudCAqIGdyb3VwLnNpemUpO1xuXG5cdFx0XHRpZiAocG9zaXRpb24gPCBuZXdTaXplKSB7XG5cdFx0XHRcdHJldHVybiBpbmRleCArIE1hdGguZmxvb3IoKHBvc2l0aW9uIC0gc2l6ZSkgLyBncm91cC5zaXplKTtcblx0XHRcdH1cblxuXHRcdFx0aW5kZXggKz0gY291bnQ7XG5cdFx0XHRzaXplID0gbmV3U2l6ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaW5kZXg7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgaW5kZXggb2YgdGhlIGl0ZW0gcmlnaHQgYWZ0ZXIgdGhlIGl0ZW0gYXQgdGhlXG5cdCAqIGluZGV4IG9mIHRoZSBnaXZlbiBwb3NpdGlvbi5cblx0ICovXG5cdGluZGV4QWZ0ZXIocG9zaXRpb246IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIE1hdGgubWluKHRoaXMuaW5kZXhBdChwb3NpdGlvbikgKyAxLCB0aGlzLmNvdW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBzdGFydCBwb3NpdGlvbiBvZiB0aGUgaXRlbSBhdCB0aGUgZ2l2ZW4gaW5kZXguXG5cdCAqL1xuXHRwb3NpdGlvbkF0KGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGlmIChpbmRleCA8IDApIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cblx0XHRsZXQgcG9zaXRpb24gPSAwO1xuXHRcdGxldCBjb3VudCA9IDA7XG5cblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZ3JvdXBzKSB7XG5cdFx0XHRjb25zdCBncm91cENvdW50ID0gZ3JvdXAucmFuZ2UuZW5kIC0gZ3JvdXAucmFuZ2Uuc3RhcnQ7XG5cdFx0XHRjb25zdCBuZXdDb3VudCA9IGNvdW50ICsgZ3JvdXBDb3VudDtcblxuXHRcdFx0aWYgKGluZGV4IDwgbmV3Q291bnQpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX3BhZGRpbmdUb3AgKyBwb3NpdGlvbiArICgoaW5kZXggLSBjb3VudCkgKiBncm91cC5zaXplKTtcblx0XHRcdH1cblxuXHRcdFx0cG9zaXRpb24gKz0gZ3JvdXBDb3VudCAqIGdyb3VwLnNpemU7XG5cdFx0XHRjb3VudCA9IG5ld0NvdW50O1xuXHRcdH1cblxuXHRcdHJldHVybiAtMTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBaUIsYUFBYTtBQWV2QixTQUFTLGVBQWUsT0FBZSxRQUF3QztBQUNyRixRQUFNLFNBQXlCLENBQUM7QUFFaEMsYUFBVyxLQUFLLFFBQVE7QUFDdkIsUUFBSSxNQUFNLFNBQVMsRUFBRSxNQUFNLEtBQUs7QUFDL0I7QUFBQSxJQUNEO0FBRUEsUUFBSSxNQUFNLE1BQU0sRUFBRSxNQUFNLE9BQU87QUFDOUI7QUFBQSxJQUNEO0FBRUEsVUFBTSxlQUFlLE1BQU0sVUFBVSxPQUFPLEVBQUUsS0FBSztBQUVuRCxRQUFJLE1BQU0sUUFBUSxZQUFZLEdBQUc7QUFDaEM7QUFBQSxJQUNEO0FBRUEsV0FBTyxLQUFLO0FBQUEsTUFDWCxPQUFPO0FBQUEsTUFDUCxNQUFNLEVBQUU7QUFBQSxJQUNULENBQUM7QUFBQSxFQUNGO0FBRUEsU0FBTztBQUNSO0FBS08sU0FBUyxNQUFNLEVBQUUsT0FBTyxJQUFJLEdBQVcsTUFBc0I7QUFDbkUsU0FBTyxFQUFFLE9BQU8sUUFBUSxNQUFNLEtBQUssTUFBTSxLQUFLO0FBQy9DO0FBUU8sU0FBUyxZQUFZLFFBQXdDO0FBQ25FLFFBQU0sU0FBeUIsQ0FBQztBQUNoQyxNQUFJLGdCQUFxQztBQUV6QyxhQUFXLFNBQVMsUUFBUTtBQUMz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
