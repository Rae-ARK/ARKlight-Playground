import { CharCode } from "../../../base/common/charCode.js";
import { CursorColumns } from "../core/cursorColumns.js";
var Direction = /* @__PURE__ */ ((Direction2) => {
  Direction2[Direction2["Left"] = 0] = "Left";
  Direction2[Direction2["Right"] = 1] = "Right";
  Direction2[Direction2["Nearest"] = 2] = "Nearest";
  return Direction2;
})(Direction || {});
class AtomicTabMoveOperations {
  /**
   * Get the visible column at the position. If we get to a non-whitespace character first
   * or past the end of string then return -1.
   *
   * **Note** `position` and the return value are 0-based.
   */
  static whitespaceVisibleColumn(lineContent, position, tabSize) {
    const lineLength = lineContent.length;
    let visibleColumn = 0;
    let prevTabStopPosition = -1;
    let prevTabStopVisibleColumn = -1;
    for (let i = 0; i < lineLength; i++) {
      if (i === position) {
        return [prevTabStopPosition, prevTabStopVisibleColumn, visibleColumn];
      }
      if (visibleColumn % tabSize === 0) {
        prevTabStopPosition = i;
        prevTabStopVisibleColumn = visibleColumn;
      }
      const chCode = lineContent.charCodeAt(i);
      switch (chCode) {
        case CharCode.Space:
          visibleColumn += 1;
          break;
        case CharCode.Tab:
          visibleColumn = CursorColumns.nextRenderTabStop(visibleColumn, tabSize);
          break;
        default:
          return [-1, -1, -1];
      }
    }
    if (position === lineLength) {
      return [prevTabStopPosition, prevTabStopVisibleColumn, visibleColumn];
    }
    return [-1, -1, -1];
  }
  /**
   * Return the position that should result from a move left, right or to the
   * nearest tab, if atomic tabs are enabled. Left and right are used for the
   * arrow key movements, nearest is used for mouse selection. It returns
   * -1 if atomic tabs are not relevant and you should fall back to normal
   * behaviour.
   *
   * **Note**: `position` and the return value are 0-based.
   */
  static atomicPosition(lineContent, position, tabSize, direction) {
    const lineLength = lineContent.length;
    const [prevTabStopPosition, prevTabStopVisibleColumn, visibleColumn] = AtomicTabMoveOperations.whitespaceVisibleColumn(lineContent, position, tabSize);
    if (visibleColumn === -1) {
      return -1;
    }
    let left;
    switch (direction) {
      case 0 /* Left */:
        left = true;
        break;
      case 1 /* Right */:
        left = false;
        break;
      case 2 /* Nearest */:
        if (visibleColumn % tabSize === 0) {
          return position;
        }
        left = visibleColumn % tabSize <= tabSize / 2;
        break;
    }
    if (left) {
      if (prevTabStopPosition === -1) {
        return -1;
      }
      let currentVisibleColumn2 = prevTabStopVisibleColumn;
      for (let i = prevTabStopPosition; i < lineLength; ++i) {
        if (currentVisibleColumn2 === prevTabStopVisibleColumn + tabSize) {
          return prevTabStopPosition;
        }
        const chCode = lineContent.charCodeAt(i);
        switch (chCode) {
          case CharCode.Space:
            currentVisibleColumn2 += 1;
            break;
          case CharCode.Tab:
            currentVisibleColumn2 = CursorColumns.nextRenderTabStop(currentVisibleColumn2, tabSize);
            break;
          default:
            return -1;
        }
      }
      if (currentVisibleColumn2 === prevTabStopVisibleColumn + tabSize) {
        return prevTabStopPosition;
      }
      return -1;
    }
    const targetVisibleColumn = CursorColumns.nextRenderTabStop(visibleColumn, tabSize);
    let currentVisibleColumn = visibleColumn;
    for (let i = position; i < lineLength; i++) {
      if (currentVisibleColumn === targetVisibleColumn) {
        return i;
      }
      const chCode = lineContent.charCodeAt(i);
      switch (chCode) {
        case CharCode.Space:
          currentVisibleColumn += 1;
          break;
        case CharCode.Tab:
          currentVisibleColumn = CursorColumns.nextRenderTabStop(currentVisibleColumn, tabSize);
          break;
        default:
          return -1;
      }
    }
    if (currentVisibleColumn === targetVisibleColumn) {
      return lineLength;
    }
    return -1;
  }
}
export {
  AtomicTabMoveOperations,
  Direction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb21tb24vY3Vyc29yL2N1cnNvckF0b21pY01vdmVPcGVyYXRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBDdXJzb3JDb2x1bW5zIH0gZnJvbSAnLi4vY29yZS9jdXJzb3JDb2x1bW5zLmpzJztcblxuZXhwb3J0IGNvbnN0IGVudW0gRGlyZWN0aW9uIHtcblx0TGVmdCxcblx0UmlnaHQsXG5cdE5lYXJlc3QsXG59XG5cbmV4cG9ydCBjbGFzcyBBdG9taWNUYWJNb3ZlT3BlcmF0aW9ucyB7XG5cdC8qKlxuXHQgKiBHZXQgdGhlIHZpc2libGUgY29sdW1uIGF0IHRoZSBwb3NpdGlvbi4gSWYgd2UgZ2V0IHRvIGEgbm9uLXdoaXRlc3BhY2UgY2hhcmFjdGVyIGZpcnN0XG5cdCAqIG9yIHBhc3QgdGhlIGVuZCBvZiBzdHJpbmcgdGhlbiByZXR1cm4gLTEuXG5cdCAqXG5cdCAqICoqTm90ZSoqIGBwb3NpdGlvbmAgYW5kIHRoZSByZXR1cm4gdmFsdWUgYXJlIDAtYmFzZWQuXG5cdCAqL1xuXHRwdWJsaWMgc3RhdGljIHdoaXRlc3BhY2VWaXNpYmxlQ29sdW1uKGxpbmVDb250ZW50OiBzdHJpbmcsIHBvc2l0aW9uOiBudW1iZXIsIHRhYlNpemU6IG51bWJlcik6IFtudW1iZXIsIG51bWJlciwgbnVtYmVyXSB7XG5cdFx0Y29uc3QgbGluZUxlbmd0aCA9IGxpbmVDb250ZW50Lmxlbmd0aDtcblx0XHRsZXQgdmlzaWJsZUNvbHVtbiA9IDA7XG5cdFx0bGV0IHByZXZUYWJTdG9wUG9zaXRpb24gPSAtMTtcblx0XHRsZXQgcHJldlRhYlN0b3BWaXNpYmxlQ29sdW1uID0gLTE7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBsaW5lTGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChpID09PSBwb3NpdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gW3ByZXZUYWJTdG9wUG9zaXRpb24sIHByZXZUYWJTdG9wVmlzaWJsZUNvbHVtbiwgdmlzaWJsZUNvbHVtbl07XG5cdFx0XHR9XG5cdFx0XHRpZiAodmlzaWJsZUNvbHVtbiAlIHRhYlNpemUgPT09IDApIHtcblx0XHRcdFx0cHJldlRhYlN0b3BQb3NpdGlvbiA9IGk7XG5cdFx0XHRcdHByZXZUYWJTdG9wVmlzaWJsZUNvbHVtbiA9IHZpc2libGVDb2x1bW47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjaENvZGUgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGkpO1xuXHRcdFx0c3dpdGNoIChjaENvZGUpIHtcblx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5TcGFjZTpcblx0XHRcdFx0XHR2aXNpYmxlQ29sdW1uICs9IDE7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuVGFiOlxuXHRcdFx0XHRcdC8vIFNraXAgdG8gdGhlIG5leHQgbXVsdGlwbGUgb2YgdGFiU2l6ZS5cblx0XHRcdFx0XHR2aXNpYmxlQ29sdW1uID0gQ3Vyc29yQ29sdW1ucy5uZXh0UmVuZGVyVGFiU3RvcCh2aXNpYmxlQ29sdW1uLCB0YWJTaXplKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRyZXR1cm4gWy0xLCAtMSwgLTFdO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAocG9zaXRpb24gPT09IGxpbmVMZW5ndGgpIHtcblx0XHRcdHJldHVybiBbcHJldlRhYlN0b3BQb3NpdGlvbiwgcHJldlRhYlN0b3BWaXNpYmxlQ29sdW1uLCB2aXNpYmxlQ29sdW1uXTtcblx0XHR9XG5cdFx0cmV0dXJuIFstMSwgLTEsIC0xXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm4gdGhlIHBvc2l0aW9uIHRoYXQgc2hvdWxkIHJlc3VsdCBmcm9tIGEgbW92ZSBsZWZ0LCByaWdodCBvciB0byB0aGVcblx0ICogbmVhcmVzdCB0YWIsIGlmIGF0b21pYyB0YWJzIGFyZSBlbmFibGVkLiBMZWZ0IGFuZCByaWdodCBhcmUgdXNlZCBmb3IgdGhlXG5cdCAqIGFycm93IGtleSBtb3ZlbWVudHMsIG5lYXJlc3QgaXMgdXNlZCBmb3IgbW91c2Ugc2VsZWN0aW9uLiBJdCByZXR1cm5zXG5cdCAqIC0xIGlmIGF0b21pYyB0YWJzIGFyZSBub3QgcmVsZXZhbnQgYW5kIHlvdSBzaG91bGQgZmFsbCBiYWNrIHRvIG5vcm1hbFxuXHQgKiBiZWhhdmlvdXIuXG5cdCAqXG5cdCAqICoqTm90ZSoqOiBgcG9zaXRpb25gIGFuZCB0aGUgcmV0dXJuIHZhbHVlIGFyZSAwLWJhc2VkLlxuXHQgKi9cblx0cHVibGljIHN0YXRpYyBhdG9taWNQb3NpdGlvbihsaW5lQ29udGVudDogc3RyaW5nLCBwb3NpdGlvbjogbnVtYmVyLCB0YWJTaXplOiBudW1iZXIsIGRpcmVjdGlvbjogRGlyZWN0aW9uKTogbnVtYmVyIHtcblx0XHRjb25zdCBsaW5lTGVuZ3RoID0gbGluZUNvbnRlbnQubGVuZ3RoO1xuXG5cdFx0Ly8gR2V0IHRoZSAwLWJhc2VkIHZpc2libGUgY29sdW1uIGNvcnJlc3BvbmRpbmcgdG8gdGhlIHBvc2l0aW9uLCBvciByZXR1cm5cblx0XHQvLyAtMSBpZiBpdCBpcyBub3QgaW4gdGhlIGluaXRpYWwgd2hpdGVzcGFjZS5cblx0XHRjb25zdCBbcHJldlRhYlN0b3BQb3NpdGlvbiwgcHJldlRhYlN0b3BWaXNpYmxlQ29sdW1uLCB2aXNpYmxlQ29sdW1uXSA9IEF0b21pY1RhYk1vdmVPcGVyYXRpb25zLndoaXRlc3BhY2VWaXNpYmxlQ29sdW1uKGxpbmVDb250ZW50LCBwb3NpdGlvbiwgdGFiU2l6ZSk7XG5cblx0XHRpZiAodmlzaWJsZUNvbHVtbiA9PT0gLTEpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cblx0XHQvLyBJcyB0aGUgb3V0cHV0IGxlZnQgb3IgcmlnaHQgb2YgdGhlIGN1cnJlbnQgcG9zaXRpb24uIFRoZSBjYXNlIGZvciBuZWFyZXN0XG5cdFx0Ly8gd2hlcmUgaXQgaXMgdGhlIHNhbWUgYXMgdGhlIGN1cnJlbnQgcG9zaXRpb24gaXMgaGFuZGxlZCBpbiB0aGUgc3dpdGNoLlxuXHRcdGxldCBsZWZ0OiBib29sZWFuO1xuXHRcdHN3aXRjaCAoZGlyZWN0aW9uKSB7XG5cdFx0XHRjYXNlIERpcmVjdGlvbi5MZWZ0OlxuXHRcdFx0XHRsZWZ0ID0gdHJ1ZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIERpcmVjdGlvbi5SaWdodDpcblx0XHRcdFx0bGVmdCA9IGZhbHNlO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRGlyZWN0aW9uLk5lYXJlc3Q6XG5cdFx0XHRcdC8vIFRoZSBjb2RlIGJlbG93IGFzc3VtZXMgdGhlIG91dHB1dCBwb3NpdGlvbiBpcyBlaXRoZXIgbGVmdCBvciByaWdodFxuXHRcdFx0XHQvLyBvZiB0aGUgaW5wdXQgcG9zaXRpb24uIElmIGl0IGlzIHRoZSBzYW1lLCByZXR1cm4gaW1tZWRpYXRlbHkuXG5cdFx0XHRcdGlmICh2aXNpYmxlQ29sdW1uICUgdGFiU2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRcdHJldHVybiBwb3NpdGlvbjtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBHbyB0byB0aGUgbmVhcmVzdCBpbmRlbnRhdGlvbi5cblx0XHRcdFx0bGVmdCA9IHZpc2libGVDb2x1bW4gJSB0YWJTaXplIDw9ICh0YWJTaXplIC8gMik7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdC8vIElmIGdvaW5nIGxlZnQsIHdlIGNhbiBqdXN0IHVzZSB0aGUgaW5mbyBhYm91dCB0aGUgbGFzdCB0YWIgc3RvcCBwb3NpdGlvbiBhbmRcblx0XHQvLyBsYXN0IHRhYiBzdG9wIHZpc2libGUgY29sdW1uIHRoYXQgd2UgY29tcHV0ZWQgaW4gdGhlIGZpcnN0IHdhbGsgb3ZlciB0aGUgd2hpdGVzcGFjZS5cblx0XHRpZiAobGVmdCkge1xuXHRcdFx0aWYgKHByZXZUYWJTdG9wUG9zaXRpb24gPT09IC0xKSB7XG5cdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdH1cblx0XHRcdC8vIElmIHRoZSBkaXJlY3Rpb24gaXMgbGVmdCwgd2UgbmVlZCB0byBrZWVwIHNjYW5uaW5nIHJpZ2h0IHRvIGVuc3VyZVxuXHRcdFx0Ly8gdGhhdCB0YXJnZXRWaXNpYmxlQ29sdW1uICsgdGFiU2l6ZSBpcyBiZWZvcmUgbm9uLXdoaXRlc3BhY2UuXG5cdFx0XHQvLyBUaGlzIGlzIHNvIHRoYXQgd2hlbiB3ZSBwcmVzcyBsZWZ0IGF0IHRoZSBlbmQgb2YgYSBwYXJ0aWFsXG5cdFx0XHQvLyBpbmRlbnRhdGlvbiBpdCBvbmx5IGdvZXMgb25lIGNoYXJhY3Rlci4gRm9yIGV4YW1wbGUgJyAgICAgIGZvbycgd2l0aFxuXHRcdFx0Ly8gdGFiU2l6ZSA0LCBzaG91bGQganVtcCBmcm9tIHBvc2l0aW9uIDYgdG8gcG9zaXRpb24gNSwgbm90IDQuXG5cdFx0XHRsZXQgY3VycmVudFZpc2libGVDb2x1bW4gPSBwcmV2VGFiU3RvcFZpc2libGVDb2x1bW47XG5cdFx0XHRmb3IgKGxldCBpID0gcHJldlRhYlN0b3BQb3NpdGlvbjsgaSA8IGxpbmVMZW5ndGg7ICsraSkge1xuXHRcdFx0XHRpZiAoY3VycmVudFZpc2libGVDb2x1bW4gPT09IHByZXZUYWJTdG9wVmlzaWJsZUNvbHVtbiArIHRhYlNpemUpIHtcblx0XHRcdFx0XHQvLyBJdCBpcyBhIGZ1bGwgaW5kZW50YXRpb24uXG5cdFx0XHRcdFx0cmV0dXJuIHByZXZUYWJTdG9wUG9zaXRpb247XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjaENvZGUgPSBsaW5lQ29udGVudC5jaGFyQ29kZUF0KGkpO1xuXHRcdFx0XHRzd2l0Y2ggKGNoQ29kZSkge1xuXHRcdFx0XHRcdGNhc2UgQ2hhckNvZGUuU3BhY2U6XG5cdFx0XHRcdFx0XHRjdXJyZW50VmlzaWJsZUNvbHVtbiArPSAxO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBDaGFyQ29kZS5UYWI6XG5cdFx0XHRcdFx0XHRjdXJyZW50VmlzaWJsZUNvbHVtbiA9IEN1cnNvckNvbHVtbnMubmV4dFJlbmRlclRhYlN0b3AoY3VycmVudFZpc2libGVDb2x1bW4sIHRhYlNpemUpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHJldHVybiAtMTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGN1cnJlbnRWaXNpYmxlQ29sdW1uID09PSBwcmV2VGFiU3RvcFZpc2libGVDb2x1bW4gKyB0YWJTaXplKSB7XG5cdFx0XHRcdHJldHVybiBwcmV2VGFiU3RvcFBvc2l0aW9uO1xuXHRcdFx0fVxuXHRcdFx0Ly8gSXQgbXVzdCBoYXZlIGJlZW4gYSBwYXJ0aWFsIGluZGVudGF0aW9uLlxuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblxuXHRcdC8vIFdlIGFyZSBnb2luZyByaWdodC5cblx0XHRjb25zdCB0YXJnZXRWaXNpYmxlQ29sdW1uID0gQ3Vyc29yQ29sdW1ucy5uZXh0UmVuZGVyVGFiU3RvcCh2aXNpYmxlQ29sdW1uLCB0YWJTaXplKTtcblxuXHRcdC8vIFdlIGNhbiBqdXN0IGNvbnRpbnVlIGZyb20gd2hlcmUgd2hpdGVzcGFjZVZpc2libGVDb2x1bW4gZ290IHRvLlxuXHRcdGxldCBjdXJyZW50VmlzaWJsZUNvbHVtbiA9IHZpc2libGVDb2x1bW47XG5cdFx0Zm9yIChsZXQgaSA9IHBvc2l0aW9uOyBpIDwgbGluZUxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoY3VycmVudFZpc2libGVDb2x1bW4gPT09IHRhcmdldFZpc2libGVDb2x1bW4pIHtcblx0XHRcdFx0cmV0dXJuIGk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNoQ29kZSA9IGxpbmVDb250ZW50LmNoYXJDb2RlQXQoaSk7XG5cdFx0XHRzd2l0Y2ggKGNoQ29kZSkge1xuXHRcdFx0XHRjYXNlIENoYXJDb2RlLlNwYWNlOlxuXHRcdFx0XHRcdGN1cnJlbnRWaXNpYmxlQ29sdW1uICs9IDE7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQ2hhckNvZGUuVGFiOlxuXHRcdFx0XHRcdGN1cnJlbnRWaXNpYmxlQ29sdW1uID0gQ3Vyc29yQ29sdW1ucy5uZXh0UmVuZGVyVGFiU3RvcChjdXJyZW50VmlzaWJsZUNvbHVtbiwgdGFiU2l6ZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBUaGlzIGNvbmRpdGlvbiBoYW5kbGVzIHdoZW4gdGhlIHRhcmdldCBjb2x1bW4gaXMgYXQgdGhlIGVuZCBvZiB0aGUgbGluZS5cblx0XHRpZiAoY3VycmVudFZpc2libGVDb2x1bW4gPT09IHRhcmdldFZpc2libGVDb2x1bW4pIHtcblx0XHRcdHJldHVybiBsaW5lTGVuZ3RoO1xuXHRcdH1cblx0XHRyZXR1cm4gLTE7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCO0FBRXZCLElBQVcsWUFBWCxrQkFBV0EsZUFBWDtBQUNOLEVBQUFBLHNCQUFBO0FBQ0EsRUFBQUEsc0JBQUE7QUFDQSxFQUFBQSxzQkFBQTtBQUhpQixTQUFBQTtBQUFBLEdBQUE7QUFNWCxNQUFNLHdCQUF3QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT3BDLE9BQWMsd0JBQXdCLGFBQXFCLFVBQWtCLFNBQTJDO0FBQ3ZILFVBQU0sYUFBYSxZQUFZO0FBQy9CLFFBQUksZ0JBQWdCO0FBQ3BCLFFBQUksc0JBQXNCO0FBQzFCLFFBQUksMkJBQTJCO0FBQy9CLGFBQVMsSUFBSSxHQUFHLElBQUksWUFBWSxLQUFLO0FBQ3BDLFVBQUksTUFBTSxVQUFVO0FBQ25CLGVBQU8sQ0FBQyxxQkFBcUIsMEJBQTBCLGFBQWE7QUFBQSxNQUNyRTtBQUNBLFVBQUksZ0JBQWdCLFlBQVksR0FBRztBQUNsQyw4QkFBc0I7QUFDdEIsbUNBQTJCO0FBQUEsTUFDNUI7QUFDQSxZQUFNLFNBQVMsWUFBWSxXQUFXLENBQUM7QUFDdkMsY0FBUSxRQUFRO0FBQUEsUUFDZixLQUFLLFNBQVM7QUFDYiwyQkFBaUI7QUFDakI7QUFBQSxRQUNELEtBQUssU0FBUztBQUViLDBCQUFnQixjQUFjLGtCQUFrQixlQUFlLE9BQU87QUFDdEU7QUFBQSxRQUNEO0FBQ0MsaUJBQU8sQ0FBQyxJQUFJLElBQUksRUFBRTtBQUFBLE1BQ3BCO0FBQUEsSUFDRDtBQUNBLFFBQUksYUFBYSxZQUFZO0FBQzVCLGFBQU8sQ0FBQyxxQkFBcUIsMEJBQTBCLGFBQWE7QUFBQSxJQUNyRTtBQUNBLFdBQU8sQ0FBQyxJQUFJLElBQUksRUFBRTtBQUFBLEVBQ25CO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFXQSxPQUFjLGVBQWUsYUFBcUIsVUFBa0IsU0FBaUIsV0FBOEI7QUFDbEgsVUFBTSxhQUFhLFlBQVk7QUFJL0IsVUFBTSxDQUFDLHFCQUFxQiwwQkFBMEIsYUFBYSxJQUFJLHdCQUF3Qix3QkFBd0IsYUFBYSxVQUFVLE9BQU87QUFFckosUUFBSSxrQkFBa0IsSUFBSTtBQUN6QixhQUFPO0FBQUEsSUFDUjtBQUlBLFFBQUk7QUFDSixZQUFRLFdBQVc7QUFBQSxNQUNsQixLQUFLO0FBQ0osZUFBTztBQUNQO0FBQUEsTUFDRCxLQUFLO0FBQ0osZUFBTztBQUNQO0FBQUEsTUFDRCxLQUFLO0FBR0osWUFBSSxnQkFBZ0IsWUFBWSxHQUFHO0FBQ2xDLGlCQUFPO0FBQUEsUUFDUjtBQUVBLGVBQU8sZ0JBQWdCLFdBQVksVUFBVTtBQUM3QztBQUFBLElBQ0Y7QUFJQSxRQUFJLE1BQU07QUFDVCxVQUFJLHdCQUF3QixJQUFJO0FBQy9CLGVBQU87QUFBQSxNQUNSO0FBTUEsVUFBSUMsd0JBQXVCO0FBQzNCLGVBQVMsSUFBSSxxQkFBcUIsSUFBSSxZQUFZLEVBQUUsR0FBRztBQUN0RCxZQUFJQSwwQkFBeUIsMkJBQTJCLFNBQVM7QUFFaEUsaUJBQU87QUFBQSxRQUNSO0FBRUEsY0FBTSxTQUFTLFlBQVksV0FBVyxDQUFDO0FBQ3ZDLGdCQUFRLFFBQVE7QUFBQSxVQUNmLEtBQUssU0FBUztBQUNiLFlBQUFBLHlCQUF3QjtBQUN4QjtBQUFBLFVBQ0QsS0FBSyxTQUFTO0FBQ2IsWUFBQUEsd0JBQXVCLGNBQWMsa0JBQWtCQSx1QkFBc0IsT0FBTztBQUNwRjtBQUFBLFVBQ0Q7QUFDQyxtQkFBTztBQUFBLFFBQ1Q7QUFBQSxNQUNEO0FBQ0EsVUFBSUEsMEJBQXlCLDJCQUEyQixTQUFTO0FBQ2hFLGVBQU87QUFBQSxNQUNSO0FBRUEsYUFBTztBQUFBLElBQ1I7QUFHQSxVQUFNLHNCQUFzQixjQUFjLGtCQUFrQixlQUFlLE9BQU87QUFHbEYsUUFBSSx1QkFBdUI7QUFDM0IsYUFBUyxJQUFJLFVBQVUsSUFBSSxZQUFZLEtBQUs7QUFDM0MsVUFBSSx5QkFBeUIscUJBQXFCO0FBQ2pELGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTSxTQUFTLFlBQVksV0FBVyxDQUFDO0FBQ3ZDLGNBQVEsUUFBUTtBQUFBLFFBQ2YsS0FBSyxTQUFTO0FBQ2Isa0NBQXdCO0FBQ3hCO0FBQUEsUUFDRCxLQUFLLFNBQVM7QUFDYixpQ0FBdUIsY0FBYyxrQkFBa0Isc0JBQXNCLE9BQU87QUFDcEY7QUFBQSxRQUNEO0FBQ0MsaUJBQU87QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUVBLFFBQUkseUJBQXlCLHFCQUFxQjtBQUNqRCxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7IiwKICAibmFtZXMiOiBbIkRpcmVjdGlvbiIsICJjdXJyZW50VmlzaWJsZUNvbHVtbiJdCn0K
