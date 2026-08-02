import { createFastDomNode } from "../../../base/browser/fastDomNode.js";
import { createTrustedTypesPolicy } from "../../../base/browser/trustedTypes.js";
import { BugIndicatingError } from "../../../base/common/errors.js";
import { EditorOption } from "../../common/config/editorOptions.js";
import { StringBuilder } from "../../common/core/stringBuilder.js";
class RenderedLinesCollection {
  constructor(_lineFactory) {
    this._lineFactory = _lineFactory;
    this._set(1, []);
  }
  flush() {
    this._set(1, []);
  }
  _set(rendLineNumberStart, lines) {
    this._lines = lines;
    this._rendLineNumberStart = rendLineNumberStart;
  }
  _get() {
    return {
      rendLineNumberStart: this._rendLineNumberStart,
      lines: this._lines
    };
  }
  /**
   * @returns Inclusive line number that is inside this collection
   */
  getStartLineNumber() {
    return this._rendLineNumberStart;
  }
  /**
   * @returns Inclusive line number that is inside this collection
   */
  getEndLineNumber() {
    return this._rendLineNumberStart + this._lines.length - 1;
  }
  getCount() {
    return this._lines.length;
  }
  getLine(lineNumber) {
    const lineIndex = lineNumber - this._rendLineNumberStart;
    if (lineIndex < 0 || lineIndex >= this._lines.length) {
      throw new BugIndicatingError("Illegal value for lineNumber");
    }
    return this._lines[lineIndex];
  }
  /**
   * @returns Lines that were removed from this collection
   */
  onLinesDeleted(deleteFromLineNumber, deleteToLineNumber) {
    if (this.getCount() === 0) {
      return null;
    }
    const startLineNumber = this.getStartLineNumber();
    const endLineNumber = this.getEndLineNumber();
    if (deleteToLineNumber < startLineNumber) {
      const deleteCnt = deleteToLineNumber - deleteFromLineNumber + 1;
      this._rendLineNumberStart -= deleteCnt;
      return null;
    }
    if (deleteFromLineNumber > endLineNumber) {
      return null;
    }
    let deleteStartIndex = 0;
    let deleteCount = 0;
    for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
      const lineIndex = lineNumber - this._rendLineNumberStart;
      if (deleteFromLineNumber <= lineNumber && lineNumber <= deleteToLineNumber) {
        if (deleteCount === 0) {
          deleteStartIndex = lineIndex;
          deleteCount = 1;
        } else {
          deleteCount++;
        }
      }
    }
    if (deleteFromLineNumber < startLineNumber) {
      let deleteAboveCount = 0;
      if (deleteToLineNumber < startLineNumber) {
        deleteAboveCount = deleteToLineNumber - deleteFromLineNumber + 1;
      } else {
        deleteAboveCount = startLineNumber - deleteFromLineNumber;
      }
      this._rendLineNumberStart -= deleteAboveCount;
    }
    const deleted = this._lines.splice(deleteStartIndex, deleteCount);
    return deleted;
  }
  onLinesChanged(changeFromLineNumber, changeCount) {
    const changeToLineNumber = changeFromLineNumber + changeCount - 1;
    if (this.getCount() === 0) {
      return false;
    }
    const startLineNumber = this.getStartLineNumber();
    const endLineNumber = this.getEndLineNumber();
    let someoneNotified = false;
    for (let changedLineNumber = changeFromLineNumber; changedLineNumber <= changeToLineNumber; changedLineNumber++) {
      if (changedLineNumber >= startLineNumber && changedLineNumber <= endLineNumber) {
        this._lines[changedLineNumber - this._rendLineNumberStart].onContentChanged();
        someoneNotified = true;
      }
    }
    return someoneNotified;
  }
  onLinesInserted(insertFromLineNumber, insertToLineNumber) {
    if (this.getCount() === 0) {
      return null;
    }
    const insertCnt = insertToLineNumber - insertFromLineNumber + 1;
    const startLineNumber = this.getStartLineNumber();
    const endLineNumber = this.getEndLineNumber();
    if (insertFromLineNumber <= startLineNumber) {
      this._rendLineNumberStart += insertCnt;
      return null;
    }
    if (insertFromLineNumber > endLineNumber) {
      return null;
    }
    if (insertCnt + insertFromLineNumber > endLineNumber) {
      const deleted = this._lines.splice(insertFromLineNumber - this._rendLineNumberStart, endLineNumber - insertFromLineNumber + 1);
      return deleted;
    }
    const newLines = [];
    for (let i = 0; i < insertCnt; i++) {
      newLines[i] = this._lineFactory.createLine();
    }
    const insertIndex = insertFromLineNumber - this._rendLineNumberStart;
    const beforeLines = this._lines.slice(0, insertIndex);
    const afterLines = this._lines.slice(insertIndex, this._lines.length - insertCnt);
    const deletedLines = this._lines.slice(this._lines.length - insertCnt, this._lines.length);
    this._lines = beforeLines.concat(newLines).concat(afterLines);
    return deletedLines;
  }
  onTokensChanged(ranges) {
    if (this.getCount() === 0) {
      return false;
    }
    const startLineNumber = this.getStartLineNumber();
    const endLineNumber = this.getEndLineNumber();
    let notifiedSomeone = false;
    for (let i = 0, len = ranges.length; i < len; i++) {
      const rng = ranges[i];
      if (rng.toLineNumber < startLineNumber || rng.fromLineNumber > endLineNumber) {
        continue;
      }
      const from = Math.max(startLineNumber, rng.fromLineNumber);
      const to = Math.min(endLineNumber, rng.toLineNumber);
      for (let lineNumber = from; lineNumber <= to; lineNumber++) {
        const lineIndex = lineNumber - this._rendLineNumberStart;
        this._lines[lineIndex].onTokensChanged();
        notifiedSomeone = true;
      }
    }
    return notifiedSomeone;
  }
}
class VisibleLinesCollection {
  constructor(_viewContext, _lineFactory) {
    this._viewContext = _viewContext;
    this._lineFactory = _lineFactory;
    this.domNode = this._createDomNode();
    this._linesCollection = new RenderedLinesCollection(this._lineFactory);
  }
  _createDomNode() {
    const domNode = createFastDomNode(document.createElement("div"));
    domNode.setClassName("view-layer");
    domNode.setPosition("absolute");
    domNode.domNode.setAttribute("role", "presentation");
    domNode.domNode.setAttribute("aria-hidden", "true");
    return domNode;
  }
  // ---- begin view event handlers
  onConfigurationChanged(e) {
    if (e.hasChanged(EditorOption.layoutInfo)) {
      return true;
    }
    return false;
  }
  onFlushed(e, flushDom) {
    if (flushDom) {
      const start = this._linesCollection.getStartLineNumber();
      const end = this._linesCollection.getEndLineNumber();
      for (let i = start; i <= end; i++) {
        this._linesCollection.getLine(i).getDomNode()?.remove();
      }
    }
    this._linesCollection.flush();
    return true;
  }
  onLinesChanged(e) {
    return this._linesCollection.onLinesChanged(e.fromLineNumber, e.count);
  }
  onLinesDeleted(e) {
    const deleted = this._linesCollection.onLinesDeleted(e.fromLineNumber, e.toLineNumber);
    if (deleted) {
      for (let i = 0, len = deleted.length; i < len; i++) {
        const lineDomNode = deleted[i].getDomNode();
        lineDomNode?.remove();
      }
    }
    return true;
  }
  onLinesInserted(e) {
    const deleted = this._linesCollection.onLinesInserted(e.fromLineNumber, e.toLineNumber);
    if (deleted) {
      for (let i = 0, len = deleted.length; i < len; i++) {
        const lineDomNode = deleted[i].getDomNode();
        lineDomNode?.remove();
      }
    }
    return true;
  }
  onScrollChanged(e) {
    return e.scrollTopChanged;
  }
  onTokensChanged(e) {
    return this._linesCollection.onTokensChanged(e.ranges);
  }
  onZonesChanged(e) {
    return true;
  }
  // ---- end view event handlers
  getStartLineNumber() {
    return this._linesCollection.getStartLineNumber();
  }
  getEndLineNumber() {
    return this._linesCollection.getEndLineNumber();
  }
  getVisibleLine(lineNumber) {
    return this._linesCollection.getLine(lineNumber);
  }
  renderLines(viewportData) {
    const inp = this._linesCollection._get();
    const renderer = new ViewLayerRenderer(this.domNode.domNode, this._lineFactory, viewportData, this._viewContext);
    const ctx = {
      rendLineNumberStart: inp.rendLineNumberStart,
      lines: inp.lines,
      linesLength: inp.lines.length
    };
    const resCtx = renderer.render(ctx, viewportData.startLineNumber, viewportData.endLineNumber, viewportData.relativeVerticalOffset);
    this._linesCollection._set(resCtx.rendLineNumberStart, resCtx.lines);
  }
}
const _ViewLayerRenderer = class _ViewLayerRenderer {
  constructor(_domNode, _lineFactory, _viewportData, _viewContext) {
    this._domNode = _domNode;
    this._lineFactory = _lineFactory;
    this._viewportData = _viewportData;
    this._viewContext = _viewContext;
  }
  render(inContext, startLineNumber, stopLineNumber, deltaTop) {
    const ctx = {
      rendLineNumberStart: inContext.rendLineNumberStart,
      lines: inContext.lines.slice(0),
      linesLength: inContext.linesLength
    };
    if (ctx.rendLineNumberStart + ctx.linesLength - 1 < startLineNumber || stopLineNumber < ctx.rendLineNumberStart) {
      ctx.rendLineNumberStart = startLineNumber;
      ctx.linesLength = stopLineNumber - startLineNumber + 1;
      ctx.lines = [];
      for (let x = startLineNumber; x <= stopLineNumber; x++) {
        ctx.lines[x - startLineNumber] = this._lineFactory.createLine();
      }
      this._finishRendering(ctx, true, deltaTop);
      return ctx;
    }
    this._renderUntouchedLines(
      ctx,
      Math.max(startLineNumber - ctx.rendLineNumberStart, 0),
      Math.min(stopLineNumber - ctx.rendLineNumberStart, ctx.linesLength - 1),
      deltaTop,
      startLineNumber
    );
    if (ctx.rendLineNumberStart > startLineNumber) {
      const fromLineNumber = startLineNumber;
      const toLineNumber = Math.min(stopLineNumber, ctx.rendLineNumberStart - 1);
      if (fromLineNumber <= toLineNumber) {
        this._insertLinesBefore(ctx, fromLineNumber, toLineNumber, deltaTop, startLineNumber);
        ctx.linesLength += toLineNumber - fromLineNumber + 1;
      }
    } else if (ctx.rendLineNumberStart < startLineNumber) {
      const removeCnt = Math.min(ctx.linesLength, startLineNumber - ctx.rendLineNumberStart);
      if (removeCnt > 0) {
        this._removeLinesBefore(ctx, removeCnt);
        ctx.linesLength -= removeCnt;
      }
    }
    ctx.rendLineNumberStart = startLineNumber;
    if (ctx.rendLineNumberStart + ctx.linesLength - 1 < stopLineNumber) {
      const fromLineNumber = ctx.rendLineNumberStart + ctx.linesLength;
      const toLineNumber = stopLineNumber;
      if (fromLineNumber <= toLineNumber) {
        this._insertLinesAfter(ctx, fromLineNumber, toLineNumber, deltaTop, startLineNumber);
        ctx.linesLength += toLineNumber - fromLineNumber + 1;
      }
    } else if (ctx.rendLineNumberStart + ctx.linesLength - 1 > stopLineNumber) {
      const fromLineNumber = Math.max(0, stopLineNumber - ctx.rendLineNumberStart + 1);
      const toLineNumber = ctx.linesLength - 1;
      const removeCnt = toLineNumber - fromLineNumber + 1;
      if (removeCnt > 0) {
        this._removeLinesAfter(ctx, removeCnt);
        ctx.linesLength -= removeCnt;
      }
    }
    this._finishRendering(ctx, false, deltaTop);
    return ctx;
  }
  _renderUntouchedLines(ctx, startIndex, endIndex, deltaTop, deltaLN) {
    const rendLineNumberStart = ctx.rendLineNumberStart;
    const lines = ctx.lines;
    for (let i = startIndex; i <= endIndex; i++) {
      const lineNumber = rendLineNumberStart + i;
      lines[i].layoutLine(lineNumber, deltaTop[lineNumber - deltaLN], this._lineHeightForLineNumber(lineNumber));
    }
  }
  _insertLinesBefore(ctx, fromLineNumber, toLineNumber, deltaTop, deltaLN) {
    const newLines = [];
    let newLinesLen = 0;
    for (let lineNumber = fromLineNumber; lineNumber <= toLineNumber; lineNumber++) {
      newLines[newLinesLen++] = this._lineFactory.createLine();
    }
    ctx.lines = newLines.concat(ctx.lines);
  }
  _removeLinesBefore(ctx, removeCount) {
    for (let i = 0; i < removeCount; i++) {
      const lineDomNode = ctx.lines[i].getDomNode();
      lineDomNode?.remove();
    }
    ctx.lines.splice(0, removeCount);
  }
  _insertLinesAfter(ctx, fromLineNumber, toLineNumber, deltaTop, deltaLN) {
    const newLines = [];
    let newLinesLen = 0;
    for (let lineNumber = fromLineNumber; lineNumber <= toLineNumber; lineNumber++) {
      newLines[newLinesLen++] = this._lineFactory.createLine();
    }
    ctx.lines = ctx.lines.concat(newLines);
  }
  _removeLinesAfter(ctx, removeCount) {
    const removeIndex = ctx.linesLength - removeCount;
    for (let i = 0; i < removeCount; i++) {
      const lineDomNode = ctx.lines[removeIndex + i].getDomNode();
      lineDomNode?.remove();
    }
    ctx.lines.splice(removeIndex, removeCount);
  }
  _finishRenderingNewLines(ctx, domNodeIsEmpty, newLinesHTML, wasNew) {
    if (_ViewLayerRenderer._ttPolicy) {
      newLinesHTML = _ViewLayerRenderer._ttPolicy.createHTML(newLinesHTML);
    }
    const lastChild = this._domNode.lastChild;
    if (domNodeIsEmpty || !lastChild) {
      this._domNode.innerHTML = newLinesHTML;
    } else {
      lastChild.insertAdjacentHTML("afterend", newLinesHTML);
    }
    let currChild = this._domNode.lastChild;
    for (let i = ctx.linesLength - 1; i >= 0; i--) {
      const line = ctx.lines[i];
      if (wasNew[i]) {
        line.setDomNode(currChild);
        currChild = currChild.previousSibling;
      }
    }
  }
  _finishRenderingInvalidLines(ctx, invalidLinesHTML, wasInvalid) {
    const hugeDomNode = document.createElement("div");
    if (_ViewLayerRenderer._ttPolicy) {
      invalidLinesHTML = _ViewLayerRenderer._ttPolicy.createHTML(invalidLinesHTML);
    }
    hugeDomNode.innerHTML = invalidLinesHTML;
    for (let i = 0; i < ctx.linesLength; i++) {
      const line = ctx.lines[i];
      if (wasInvalid[i]) {
        const source = hugeDomNode.firstChild;
        const lineDomNode = line.getDomNode();
        lineDomNode.replaceWith(source);
        line.setDomNode(source);
      }
    }
  }
  _finishRendering(ctx, domNodeIsEmpty, deltaTop) {
    const sb = _ViewLayerRenderer._sb;
    const linesLength = ctx.linesLength;
    const lines = ctx.lines;
    const rendLineNumberStart = ctx.rendLineNumberStart;
    const wasNew = [];
    {
      sb.reset();
      let hadNewLine = false;
      for (let i = 0; i < linesLength; i++) {
        const line = lines[i];
        wasNew[i] = false;
        const lineDomNode = line.getDomNode();
        if (lineDomNode) {
          continue;
        }
        const renderedLineNumber = i + rendLineNumberStart;
        const renderResult = line.renderLine(renderedLineNumber, deltaTop[i], this._lineHeightForLineNumber(renderedLineNumber), this._viewportData, sb);
        if (!renderResult) {
          continue;
        }
        wasNew[i] = true;
        hadNewLine = true;
      }
      if (hadNewLine) {
        this._finishRenderingNewLines(ctx, domNodeIsEmpty, sb.build(), wasNew);
      }
    }
    {
      sb.reset();
      let hadInvalidLine = false;
      const wasInvalid = [];
      for (let i = 0; i < linesLength; i++) {
        const line = lines[i];
        wasInvalid[i] = false;
        if (wasNew[i]) {
          continue;
        }
        const renderedLineNumber = i + rendLineNumberStart;
        const renderResult = line.renderLine(renderedLineNumber, deltaTop[i], this._lineHeightForLineNumber(renderedLineNumber), this._viewportData, sb);
        if (!renderResult) {
          continue;
        }
        wasInvalid[i] = true;
        hadInvalidLine = true;
      }
      if (hadInvalidLine) {
        this._finishRenderingInvalidLines(ctx, sb.build(), wasInvalid);
      }
    }
  }
  _lineHeightForLineNumber(lineNumber) {
    return this._viewContext.viewLayout.getLineHeightForLineNumber(lineNumber);
  }
};
_ViewLayerRenderer._ttPolicy = createTrustedTypesPolicy("editorViewLayer", { createHTML: (value) => value });
_ViewLayerRenderer._sb = new StringBuilder(1e5);
let ViewLayerRenderer = _ViewLayerRenderer;
export {
  RenderedLinesCollection,
  VisibleLinesCollection
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3ZpZXcvdmlld0xheWVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRmFzdERvbU5vZGUsIGNyZWF0ZUZhc3REb21Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2Zhc3REb21Ob2RlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRydXN0ZWRUeXBlc1BvbGljeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90cnVzdGVkVHlwZXMuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBTdHJpbmdCdWlsZGVyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvcmUvc3RyaW5nQnVpbGRlci5qcyc7XG5pbXBvcnQgKiBhcyB2aWV3RXZlbnRzIGZyb20gJy4uLy4uL2NvbW1vbi92aWV3RXZlbnRzLmpzJztcbmltcG9ydCB7IFZpZXdwb3J0RGF0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi92aWV3TGF5b3V0L3ZpZXdMaW5lc1ZpZXdwb3J0RGF0YS5qcyc7XG5pbXBvcnQgeyBWaWV3Q29udGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi92aWV3TW9kZWwvdmlld0NvbnRleHQuanMnO1xuXG4vKipcbiAqIFJlcHJlc2VudHMgYSB2aXNpYmxlIGxpbmVcbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVmlzaWJsZUxpbmUgZXh0ZW5kcyBJTGluZSB7XG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRzZXREb21Ob2RlKGRvbU5vZGU6IEhUTUxFbGVtZW50KTogdm9pZDtcblxuXHQvKipcblx0ICogUmV0dXJuIG51bGwgaWYgdGhlIEhUTUwgc2hvdWxkIG5vdCBiZSB0b3VjaGVkLlxuXHQgKiBSZXR1cm4gdGhlIG5ldyBIVE1MIG90aGVyd2lzZS5cblx0ICovXG5cdHJlbmRlckxpbmUobGluZU51bWJlcjogbnVtYmVyLCBkZWx0YVRvcDogbnVtYmVyLCBsaW5lSGVpZ2h0OiBudW1iZXIsIHZpZXdwb3J0RGF0YTogVmlld3BvcnREYXRhLCBzYjogU3RyaW5nQnVpbGRlcik6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIExheW91dCB0aGUgbGluZS5cblx0ICovXG5cdGxheW91dExpbmUobGluZU51bWJlcjogbnVtYmVyLCBkZWx0YVRvcDogbnVtYmVyLCBsaW5lSGVpZ2h0OiBudW1iZXIpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMaW5lIHtcblx0b25Db250ZW50Q2hhbmdlZCgpOiB2b2lkO1xuXHRvblRva2Vuc0NoYW5nZWQoKTogdm9pZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGluZUZhY3Rvcnk8VCBleHRlbmRzIElMaW5lPiB7XG5cdGNyZWF0ZUxpbmUoKTogVDtcbn1cblxuZXhwb3J0IGNsYXNzIFJlbmRlcmVkTGluZXNDb2xsZWN0aW9uPFQgZXh0ZW5kcyBJTGluZT4ge1xuXHRwcml2YXRlIF9saW5lcyE6IFRbXTtcblx0cHJpdmF0ZSBfcmVuZExpbmVOdW1iZXJTdGFydCE6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9saW5lRmFjdG9yeTogSUxpbmVGYWN0b3J5PFQ+LFxuXHQpIHtcblx0XHR0aGlzLl9zZXQoMSwgW10pO1xuXHR9XG5cblx0cHVibGljIGZsdXNoKCk6IHZvaWQge1xuXHRcdHRoaXMuX3NldCgxLCBbXSk7XG5cdH1cblxuXHRfc2V0KHJlbmRMaW5lTnVtYmVyU3RhcnQ6IG51bWJlciwgbGluZXM6IFRbXSk6IHZvaWQge1xuXHRcdHRoaXMuX2xpbmVzID0gbGluZXM7XG5cdFx0dGhpcy5fcmVuZExpbmVOdW1iZXJTdGFydCA9IHJlbmRMaW5lTnVtYmVyU3RhcnQ7XG5cdH1cblxuXHRfZ2V0KCk6IHsgcmVuZExpbmVOdW1iZXJTdGFydDogbnVtYmVyOyBsaW5lczogVFtdIH0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZW5kTGluZU51bWJlclN0YXJ0OiB0aGlzLl9yZW5kTGluZU51bWJlclN0YXJ0LFxuXHRcdFx0bGluZXM6IHRoaXMuX2xpbmVzXG5cdFx0fTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAcmV0dXJucyBJbmNsdXNpdmUgbGluZSBudW1iZXIgdGhhdCBpcyBpbnNpZGUgdGhpcyBjb2xsZWN0aW9uXG5cdCAqL1xuXHRwdWJsaWMgZ2V0U3RhcnRMaW5lTnVtYmVyKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRMaW5lTnVtYmVyU3RhcnQ7XG5cdH1cblxuXHQvKipcblx0ICogQHJldHVybnMgSW5jbHVzaXZlIGxpbmUgbnVtYmVyIHRoYXQgaXMgaW5zaWRlIHRoaXMgY29sbGVjdGlvblxuXHQgKi9cblx0cHVibGljIGdldEVuZExpbmVOdW1iZXIoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZExpbmVOdW1iZXJTdGFydCArIHRoaXMuX2xpbmVzLmxlbmd0aCAtIDE7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXMubGVuZ3RoO1xuXHR9XG5cblx0cHVibGljIGdldExpbmUobGluZU51bWJlcjogbnVtYmVyKTogVCB7XG5cdFx0Y29uc3QgbGluZUluZGV4ID0gbGluZU51bWJlciAtIHRoaXMuX3JlbmRMaW5lTnVtYmVyU3RhcnQ7XG5cdFx0aWYgKGxpbmVJbmRleCA8IDAgfHwgbGluZUluZGV4ID49IHRoaXMuX2xpbmVzLmxlbmd0aCkge1xuXHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignSWxsZWdhbCB2YWx1ZSBmb3IgbGluZU51bWJlcicpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbGluZXNbbGluZUluZGV4XTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAcmV0dXJucyBMaW5lcyB0aGF0IHdlcmUgcmVtb3ZlZCBmcm9tIHRoaXMgY29sbGVjdGlvblxuXHQgKi9cblx0cHVibGljIG9uTGluZXNEZWxldGVkKGRlbGV0ZUZyb21MaW5lTnVtYmVyOiBudW1iZXIsIGRlbGV0ZVRvTGluZU51bWJlcjogbnVtYmVyKTogVFtdIHwgbnVsbCB7XG5cdFx0aWYgKHRoaXMuZ2V0Q291bnQoKSA9PT0gMCkge1xuXHRcdFx0Ly8gbm8gbGluZXNcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IHRoaXMuZ2V0U3RhcnRMaW5lTnVtYmVyKCk7XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IHRoaXMuZ2V0RW5kTGluZU51bWJlcigpO1xuXG5cdFx0aWYgKGRlbGV0ZVRvTGluZU51bWJlciA8IHN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0Ly8gZGVsZXRpbmcgYWJvdmUgdGhlIHZpZXdwb3J0XG5cdFx0XHRjb25zdCBkZWxldGVDbnQgPSBkZWxldGVUb0xpbmVOdW1iZXIgLSBkZWxldGVGcm9tTGluZU51bWJlciArIDE7XG5cdFx0XHR0aGlzLl9yZW5kTGluZU51bWJlclN0YXJ0IC09IGRlbGV0ZUNudDtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGlmIChkZWxldGVGcm9tTGluZU51bWJlciA+IGVuZExpbmVOdW1iZXIpIHtcblx0XHRcdC8vIGRlbGV0ZWQgYmVsb3cgdGhlIHZpZXdwb3J0XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBSZWNvcmQgd2hhdCBuZWVkcyB0byBiZSBkZWxldGVkXG5cdFx0bGV0IGRlbGV0ZVN0YXJ0SW5kZXggPSAwO1xuXHRcdGxldCBkZWxldGVDb3VudCA9IDA7XG5cdFx0Zm9yIChsZXQgbGluZU51bWJlciA9IHN0YXJ0TGluZU51bWJlcjsgbGluZU51bWJlciA8PSBlbmRMaW5lTnVtYmVyOyBsaW5lTnVtYmVyKyspIHtcblx0XHRcdGNvbnN0IGxpbmVJbmRleCA9IGxpbmVOdW1iZXIgLSB0aGlzLl9yZW5kTGluZU51bWJlclN0YXJ0O1xuXG5cdFx0XHRpZiAoZGVsZXRlRnJvbUxpbmVOdW1iZXIgPD0gbGluZU51bWJlciAmJiBsaW5lTnVtYmVyIDw9IGRlbGV0ZVRvTGluZU51bWJlcikge1xuXHRcdFx0XHQvLyB0aGlzIGlzIGEgbGluZSB0byBiZSBkZWxldGVkXG5cdFx0XHRcdGlmIChkZWxldGVDb3VudCA9PT0gMCkge1xuXHRcdFx0XHRcdC8vIHRoaXMgaXMgdGhlIGZpcnN0IGxpbmUgdG8gYmUgZGVsZXRlZFxuXHRcdFx0XHRcdGRlbGV0ZVN0YXJ0SW5kZXggPSBsaW5lSW5kZXg7XG5cdFx0XHRcdFx0ZGVsZXRlQ291bnQgPSAxO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRlbGV0ZUNvdW50Kys7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBBZGp1c3QgdGhpcy5fcmVuZExpbmVOdW1iZXJTdGFydCBmb3IgbGluZXMgZGVsZXRlZCBhYm92ZVxuXHRcdGlmIChkZWxldGVGcm9tTGluZU51bWJlciA8IHN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0Ly8gU29tZXRoaW5nIHdhcyBkZWxldGVkIGFib3ZlXG5cdFx0XHRsZXQgZGVsZXRlQWJvdmVDb3VudCA9IDA7XG5cblx0XHRcdGlmIChkZWxldGVUb0xpbmVOdW1iZXIgPCBzdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdFx0Ly8gdGhlIGVudGlyZSBkZWxldGVkIGxpbmVzIGFyZSBhYm92ZVxuXHRcdFx0XHRkZWxldGVBYm92ZUNvdW50ID0gZGVsZXRlVG9MaW5lTnVtYmVyIC0gZGVsZXRlRnJvbUxpbmVOdW1iZXIgKyAxO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGVsZXRlQWJvdmVDb3VudCA9IHN0YXJ0TGluZU51bWJlciAtIGRlbGV0ZUZyb21MaW5lTnVtYmVyO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9yZW5kTGluZU51bWJlclN0YXJ0IC09IGRlbGV0ZUFib3ZlQ291bnQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGVsZXRlZCA9IHRoaXMuX2xpbmVzLnNwbGljZShkZWxldGVTdGFydEluZGV4LCBkZWxldGVDb3VudCk7XG5cdFx0cmV0dXJuIGRlbGV0ZWQ7XG5cdH1cblxuXHRwdWJsaWMgb25MaW5lc0NoYW5nZWQoY2hhbmdlRnJvbUxpbmVOdW1iZXI6IG51bWJlciwgY2hhbmdlQ291bnQ6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNoYW5nZVRvTGluZU51bWJlciA9IGNoYW5nZUZyb21MaW5lTnVtYmVyICsgY2hhbmdlQ291bnQgLSAxO1xuXHRcdGlmICh0aGlzLmdldENvdW50KCkgPT09IDApIHtcblx0XHRcdC8vIG5vIGxpbmVzXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gdGhpcy5nZXRTdGFydExpbmVOdW1iZXIoKTtcblx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gdGhpcy5nZXRFbmRMaW5lTnVtYmVyKCk7XG5cblx0XHRsZXQgc29tZW9uZU5vdGlmaWVkID0gZmFsc2U7XG5cblx0XHRmb3IgKGxldCBjaGFuZ2VkTGluZU51bWJlciA9IGNoYW5nZUZyb21MaW5lTnVtYmVyOyBjaGFuZ2VkTGluZU51bWJlciA8PSBjaGFuZ2VUb0xpbmVOdW1iZXI7IGNoYW5nZWRMaW5lTnVtYmVyKyspIHtcblx0XHRcdGlmIChjaGFuZ2VkTGluZU51bWJlciA+PSBzdGFydExpbmVOdW1iZXIgJiYgY2hhbmdlZExpbmVOdW1iZXIgPD0gZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHQvLyBOb3RpZnkgdGhlIGxpbmVcblx0XHRcdFx0dGhpcy5fbGluZXNbY2hhbmdlZExpbmVOdW1iZXIgLSB0aGlzLl9yZW5kTGluZU51bWJlclN0YXJ0XS5vbkNvbnRlbnRDaGFuZ2VkKCk7XG5cdFx0XHRcdHNvbWVvbmVOb3RpZmllZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNvbWVvbmVOb3RpZmllZDtcblx0fVxuXG5cdHB1YmxpYyBvbkxpbmVzSW5zZXJ0ZWQoaW5zZXJ0RnJvbUxpbmVOdW1iZXI6IG51bWJlciwgaW5zZXJ0VG9MaW5lTnVtYmVyOiBudW1iZXIpOiBUW10gfCBudWxsIHtcblx0XHRpZiAodGhpcy5nZXRDb3VudCgpID09PSAwKSB7XG5cdFx0XHQvLyBubyBsaW5lc1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5zZXJ0Q250ID0gaW5zZXJ0VG9MaW5lTnVtYmVyIC0gaW5zZXJ0RnJvbUxpbmVOdW1iZXIgKyAxO1xuXHRcdGNvbnN0IHN0YXJ0TGluZU51bWJlciA9IHRoaXMuZ2V0U3RhcnRMaW5lTnVtYmVyKCk7XG5cdFx0Y29uc3QgZW5kTGluZU51bWJlciA9IHRoaXMuZ2V0RW5kTGluZU51bWJlcigpO1xuXG5cdFx0aWYgKGluc2VydEZyb21MaW5lTnVtYmVyIDw9IHN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0Ly8gaW5zZXJ0aW5nIGFib3ZlIHRoZSB2aWV3cG9ydFxuXHRcdFx0dGhpcy5fcmVuZExpbmVOdW1iZXJTdGFydCArPSBpbnNlcnRDbnQ7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAoaW5zZXJ0RnJvbUxpbmVOdW1iZXIgPiBlbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHQvLyBpbnNlcnRpbmcgYmVsb3cgdGhlIHZpZXdwb3J0XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRpZiAoaW5zZXJ0Q250ICsgaW5zZXJ0RnJvbUxpbmVOdW1iZXIgPiBlbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHQvLyBpbnNlcnQgaW5zaWRlIHRoZSB2aWV3cG9ydCBpbiBzdWNoIGEgd2F5IHRoYXQgYWxsIHJlbWFpbmluZyBsaW5lcyBhcmUgcHVzaGVkIG91dHNpZGVcblx0XHRcdGNvbnN0IGRlbGV0ZWQgPSB0aGlzLl9saW5lcy5zcGxpY2UoaW5zZXJ0RnJvbUxpbmVOdW1iZXIgLSB0aGlzLl9yZW5kTGluZU51bWJlclN0YXJ0LCBlbmRMaW5lTnVtYmVyIC0gaW5zZXJ0RnJvbUxpbmVOdW1iZXIgKyAxKTtcblx0XHRcdHJldHVybiBkZWxldGVkO1xuXHRcdH1cblxuXHRcdC8vIGluc2VydCBpbnNpZGUgdGhlIHZpZXdwb3J0LCBwdXNoIG91dCBzb21lIGxpbmVzLCBidXQgbm90IGFsbCByZW1haW5pbmcgbGluZXNcblx0XHRjb25zdCBuZXdMaW5lczogVFtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBpbnNlcnRDbnQ7IGkrKykge1xuXHRcdFx0bmV3TGluZXNbaV0gPSB0aGlzLl9saW5lRmFjdG9yeS5jcmVhdGVMaW5lKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGluc2VydEluZGV4ID0gaW5zZXJ0RnJvbUxpbmVOdW1iZXIgLSB0aGlzLl9yZW5kTGluZU51bWJlclN0YXJ0O1xuXHRcdGNvbnN0IGJlZm9yZUxpbmVzID0gdGhpcy5fbGluZXMuc2xpY2UoMCwgaW5zZXJ0SW5kZXgpO1xuXHRcdGNvbnN0IGFmdGVyTGluZXMgPSB0aGlzLl9saW5lcy5zbGljZShpbnNlcnRJbmRleCwgdGhpcy5fbGluZXMubGVuZ3RoIC0gaW5zZXJ0Q250KTtcblx0XHRjb25zdCBkZWxldGVkTGluZXMgPSB0aGlzLl9saW5lcy5zbGljZSh0aGlzLl9saW5lcy5sZW5ndGggLSBpbnNlcnRDbnQsIHRoaXMuX2xpbmVzLmxlbmd0aCk7XG5cblx0XHR0aGlzLl9saW5lcyA9IGJlZm9yZUxpbmVzLmNvbmNhdChuZXdMaW5lcykuY29uY2F0KGFmdGVyTGluZXMpO1xuXG5cdFx0cmV0dXJuIGRlbGV0ZWRMaW5lcztcblx0fVxuXG5cdHB1YmxpYyBvblRva2Vuc0NoYW5nZWQocmFuZ2VzOiB7IGZyb21MaW5lTnVtYmVyOiBudW1iZXI7IHRvTGluZU51bWJlcjogbnVtYmVyIH1bXSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmdldENvdW50KCkgPT09IDApIHtcblx0XHRcdC8vIG5vIGxpbmVzXG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gdGhpcy5nZXRTdGFydExpbmVOdW1iZXIoKTtcblx0XHRjb25zdCBlbmRMaW5lTnVtYmVyID0gdGhpcy5nZXRFbmRMaW5lTnVtYmVyKCk7XG5cblx0XHRsZXQgbm90aWZpZWRTb21lb25lID0gZmFsc2U7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHJhbmdlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3Qgcm5nID0gcmFuZ2VzW2ldO1xuXG5cdFx0XHRpZiAocm5nLnRvTGluZU51bWJlciA8IHN0YXJ0TGluZU51bWJlciB8fCBybmcuZnJvbUxpbmVOdW1iZXIgPiBlbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdC8vIHJhbmdlIG91dHNpZGUgdmlld3BvcnRcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZyb20gPSBNYXRoLm1heChzdGFydExpbmVOdW1iZXIsIHJuZy5mcm9tTGluZU51bWJlcik7XG5cdFx0XHRjb25zdCB0byA9IE1hdGgubWluKGVuZExpbmVOdW1iZXIsIHJuZy50b0xpbmVOdW1iZXIpO1xuXG5cdFx0XHRmb3IgKGxldCBsaW5lTnVtYmVyID0gZnJvbTsgbGluZU51bWJlciA8PSB0bzsgbGluZU51bWJlcisrKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVJbmRleCA9IGxpbmVOdW1iZXIgLSB0aGlzLl9yZW5kTGluZU51bWJlclN0YXJ0O1xuXHRcdFx0XHR0aGlzLl9saW5lc1tsaW5lSW5kZXhdLm9uVG9rZW5zQ2hhbmdlZCgpO1xuXHRcdFx0XHRub3RpZmllZFNvbWVvbmUgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBub3RpZmllZFNvbWVvbmU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFZpc2libGVMaW5lc0NvbGxlY3Rpb248VCBleHRlbmRzIElWaXNpYmxlTGluZT4ge1xuXG5cdHB1YmxpYyByZWFkb25seSBkb21Ob2RlOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpbmVzQ29sbGVjdGlvbjogUmVuZGVyZWRMaW5lc0NvbGxlY3Rpb248VD47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdmlld0NvbnRleHQ6IFZpZXdDb250ZXh0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xpbmVGYWN0b3J5OiBJTGluZUZhY3Rvcnk8VD4sXG5cdCkge1xuXHRcdHRoaXMuZG9tTm9kZSA9IHRoaXMuX2NyZWF0ZURvbU5vZGUoKTtcblx0XHR0aGlzLl9saW5lc0NvbGxlY3Rpb24gPSBuZXcgUmVuZGVyZWRMaW5lc0NvbGxlY3Rpb248VD4odGhpcy5fbGluZUZhY3RvcnkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlRG9tTm9kZSgpOiBGYXN0RG9tTm9kZTxIVE1MRWxlbWVudD4ge1xuXHRcdGNvbnN0IGRvbU5vZGUgPSBjcmVhdGVGYXN0RG9tTm9kZShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSk7XG5cdFx0ZG9tTm9kZS5zZXRDbGFzc05hbWUoJ3ZpZXctbGF5ZXInKTtcblx0XHRkb21Ob2RlLnNldFBvc2l0aW9uKCdhYnNvbHV0ZScpO1xuXHRcdGRvbU5vZGUuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAncHJlc2VudGF0aW9uJyk7XG5cdFx0ZG9tTm9kZS5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1oaWRkZW4nLCAndHJ1ZScpO1xuXHRcdHJldHVybiBkb21Ob2RlO1xuXHR9XG5cblx0Ly8gLS0tLSBiZWdpbiB2aWV3IGV2ZW50IGhhbmRsZXJzXG5cblx0cHVibGljIG9uQ29uZmlndXJhdGlvbkNoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Q29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmxheW91dEluZm8pKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHVibGljIG9uRmx1c2hlZChlOiB2aWV3RXZlbnRzLlZpZXdGbHVzaGVkRXZlbnQsIGZsdXNoRG9tPzogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdC8vIE5vIG5lZWQgdG8gY2xlYXIgdGhlIGRvbSBub2RlIGJlY2F1c2UgYSBmdWxsIC5pbm5lckhUTUwgd2lsbCBvY2N1ciBpblxuXHRcdC8vIFZpZXdMYXllclJlbmRlcmVyLl9yZW5kZXIsIGhvd2V2ZXIgdGhlIGZhbGxiYWNrIG1lY2hhbmlzbSBpbiB0aGVcblx0XHQvLyBHUFUgcmVuZGVyZXIgbWF5IGNhdXNlIHRoaXMgdG8gYmUgbmVjZXNzYXJ5IGFzIHRoZSAuaW5uZXJIVE1MIGNhbGxcblx0XHQvLyBtYXkgbm90IGhhcHBlbiBkZXBlbmRpbmcgb24gdGhlIG5ldyBzdGF0ZSwgbGVhdmluZyBzdGFsZSBET00gbm9kZXNcblx0XHQvLyBhcm91bmQuXG5cdFx0aWYgKGZsdXNoRG9tKSB7XG5cdFx0XHRjb25zdCBzdGFydCA9IHRoaXMuX2xpbmVzQ29sbGVjdGlvbi5nZXRTdGFydExpbmVOdW1iZXIoKTtcblx0XHRcdGNvbnN0IGVuZCA9IHRoaXMuX2xpbmVzQ29sbGVjdGlvbi5nZXRFbmRMaW5lTnVtYmVyKCk7XG5cdFx0XHRmb3IgKGxldCBpID0gc3RhcnQ7IGkgPD0gZW5kOyBpKyspIHtcblx0XHRcdFx0dGhpcy5fbGluZXNDb2xsZWN0aW9uLmdldExpbmUoaSkuZ2V0RG9tTm9kZSgpPy5yZW1vdmUoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fbGluZXNDb2xsZWN0aW9uLmZsdXNoKCk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb25MaW5lc0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3TGluZXNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXNDb2xsZWN0aW9uLm9uTGluZXNDaGFuZ2VkKGUuZnJvbUxpbmVOdW1iZXIsIGUuY291bnQpO1xuXHR9XG5cblx0cHVibGljIG9uTGluZXNEZWxldGVkKGU6IHZpZXdFdmVudHMuVmlld0xpbmVzRGVsZXRlZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZGVsZXRlZCA9IHRoaXMuX2xpbmVzQ29sbGVjdGlvbi5vbkxpbmVzRGVsZXRlZChlLmZyb21MaW5lTnVtYmVyLCBlLnRvTGluZU51bWJlcik7XG5cdFx0aWYgKGRlbGV0ZWQpIHtcblx0XHRcdC8vIFJlbW92ZSBmcm9tIERPTVxuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGRlbGV0ZWQubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZURvbU5vZGUgPSBkZWxldGVkW2ldLmdldERvbU5vZGUoKTtcblx0XHRcdFx0bGluZURvbU5vZGU/LnJlbW92ZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG9uTGluZXNJbnNlcnRlZChlOiB2aWV3RXZlbnRzLlZpZXdMaW5lc0luc2VydGVkRXZlbnQpOiBib29sZWFuIHtcblx0XHRjb25zdCBkZWxldGVkID0gdGhpcy5fbGluZXNDb2xsZWN0aW9uLm9uTGluZXNJbnNlcnRlZChlLmZyb21MaW5lTnVtYmVyLCBlLnRvTGluZU51bWJlcik7XG5cdFx0aWYgKGRlbGV0ZWQpIHtcblx0XHRcdC8vIFJlbW92ZSBmcm9tIERPTVxuXHRcdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGRlbGV0ZWQubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZURvbU5vZGUgPSBkZWxldGVkW2ldLmdldERvbU5vZGUoKTtcblx0XHRcdFx0bGluZURvbU5vZGU/LnJlbW92ZSgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG9uU2Nyb2xsQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdTY3JvbGxDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZS5zY3JvbGxUb3BDaGFuZ2VkO1xuXHR9XG5cblx0cHVibGljIG9uVG9rZW5zQ2hhbmdlZChlOiB2aWV3RXZlbnRzLlZpZXdUb2tlbnNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZXNDb2xsZWN0aW9uLm9uVG9rZW5zQ2hhbmdlZChlLnJhbmdlcyk7XG5cdH1cblxuXHRwdWJsaWMgb25ab25lc0NoYW5nZWQoZTogdmlld0V2ZW50cy5WaWV3Wm9uZXNDaGFuZ2VkRXZlbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdC8vIC0tLS0gZW5kIHZpZXcgZXZlbnQgaGFuZGxlcnNcblxuXHRwdWJsaWMgZ2V0U3RhcnRMaW5lTnVtYmVyKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzQ29sbGVjdGlvbi5nZXRTdGFydExpbmVOdW1iZXIoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRFbmRMaW5lTnVtYmVyKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzQ29sbGVjdGlvbi5nZXRFbmRMaW5lTnVtYmVyKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0VmlzaWJsZUxpbmUobGluZU51bWJlcjogbnVtYmVyKTogVCB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVzQ29sbGVjdGlvbi5nZXRMaW5lKGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0cHVibGljIHJlbmRlckxpbmVzKHZpZXdwb3J0RGF0YTogVmlld3BvcnREYXRhKTogdm9pZCB7XG5cblx0XHRjb25zdCBpbnAgPSB0aGlzLl9saW5lc0NvbGxlY3Rpb24uX2dldCgpO1xuXG5cdFx0Y29uc3QgcmVuZGVyZXIgPSBuZXcgVmlld0xheWVyUmVuZGVyZXI8VD4odGhpcy5kb21Ob2RlLmRvbU5vZGUsIHRoaXMuX2xpbmVGYWN0b3J5LCB2aWV3cG9ydERhdGEsIHRoaXMuX3ZpZXdDb250ZXh0KTtcblxuXHRcdGNvbnN0IGN0eDogSVJlbmRlcmVyQ29udGV4dDxUPiA9IHtcblx0XHRcdHJlbmRMaW5lTnVtYmVyU3RhcnQ6IGlucC5yZW5kTGluZU51bWJlclN0YXJ0LFxuXHRcdFx0bGluZXM6IGlucC5saW5lcyxcblx0XHRcdGxpbmVzTGVuZ3RoOiBpbnAubGluZXMubGVuZ3RoXG5cdFx0fTtcblxuXHRcdC8vIERlY2lkZSBpZiB0aGlzIHJlbmRlciB3aWxsIGRvIGEgc2luZ2xlIHVwZGF0ZSAoc2luZ2xlIGxhcmdlIC5pbm5lckhUTUwpIG9yIG1hbnkgdXBkYXRlcyAoaW5zZXJ0aW5nL3JlbW92aW5nIGRvbSBub2Rlcylcblx0XHRjb25zdCByZXNDdHggPSByZW5kZXJlci5yZW5kZXIoY3R4LCB2aWV3cG9ydERhdGEuc3RhcnRMaW5lTnVtYmVyLCB2aWV3cG9ydERhdGEuZW5kTGluZU51bWJlciwgdmlld3BvcnREYXRhLnJlbGF0aXZlVmVydGljYWxPZmZzZXQpO1xuXG5cdFx0dGhpcy5fbGluZXNDb2xsZWN0aW9uLl9zZXQocmVzQ3R4LnJlbmRMaW5lTnVtYmVyU3RhcnQsIHJlc0N0eC5saW5lcyk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElSZW5kZXJlckNvbnRleHQ8VCBleHRlbmRzIElWaXNpYmxlTGluZT4ge1xuXHRyZW5kTGluZU51bWJlclN0YXJ0OiBudW1iZXI7XG5cdGxpbmVzOiBUW107XG5cdGxpbmVzTGVuZ3RoOiBudW1iZXI7XG59XG5cbmNsYXNzIFZpZXdMYXllclJlbmRlcmVyPFQgZXh0ZW5kcyBJVmlzaWJsZUxpbmU+IHtcblxuXHRwcml2YXRlIHN0YXRpYyBfdHRQb2xpY3kgPSBjcmVhdGVUcnVzdGVkVHlwZXNQb2xpY3koJ2VkaXRvclZpZXdMYXllcicsIHsgY3JlYXRlSFRNTDogdmFsdWUgPT4gdmFsdWUgfSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9tTm9kZTogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGluZUZhY3Rvcnk6IElMaW5lRmFjdG9yeTxUPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF92aWV3cG9ydERhdGE6IFZpZXdwb3J0RGF0YSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF92aWV3Q29udGV4dDogVmlld0NvbnRleHRcblx0KSB7XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyKGluQ29udGV4dDogSVJlbmRlcmVyQ29udGV4dDxUPiwgc3RhcnRMaW5lTnVtYmVyOiBudW1iZXIsIHN0b3BMaW5lTnVtYmVyOiBudW1iZXIsIGRlbHRhVG9wOiBudW1iZXJbXSk6IElSZW5kZXJlckNvbnRleHQ8VD4ge1xuXG5cdFx0Y29uc3QgY3R4OiBJUmVuZGVyZXJDb250ZXh0PFQ+ID0ge1xuXHRcdFx0cmVuZExpbmVOdW1iZXJTdGFydDogaW5Db250ZXh0LnJlbmRMaW5lTnVtYmVyU3RhcnQsXG5cdFx0XHRsaW5lczogaW5Db250ZXh0LmxpbmVzLnNsaWNlKDApLFxuXHRcdFx0bGluZXNMZW5ndGg6IGluQ29udGV4dC5saW5lc0xlbmd0aFxuXHRcdH07XG5cblx0XHRpZiAoKGN0eC5yZW5kTGluZU51bWJlclN0YXJ0ICsgY3R4LmxpbmVzTGVuZ3RoIC0gMSA8IHN0YXJ0TGluZU51bWJlcikgfHwgKHN0b3BMaW5lTnVtYmVyIDwgY3R4LnJlbmRMaW5lTnVtYmVyU3RhcnQpKSB7XG5cdFx0XHQvLyBUaGVyZSBpcyBubyBvdmVybGFwIHdoYXRzb2V2ZXJcblx0XHRcdGN0eC5yZW5kTGluZU51bWJlclN0YXJ0ID0gc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0Y3R4LmxpbmVzTGVuZ3RoID0gc3RvcExpbmVOdW1iZXIgLSBzdGFydExpbmVOdW1iZXIgKyAxO1xuXHRcdFx0Y3R4LmxpbmVzID0gW107XG5cdFx0XHRmb3IgKGxldCB4ID0gc3RhcnRMaW5lTnVtYmVyOyB4IDw9IHN0b3BMaW5lTnVtYmVyOyB4KyspIHtcblx0XHRcdFx0Y3R4LmxpbmVzW3ggLSBzdGFydExpbmVOdW1iZXJdID0gdGhpcy5fbGluZUZhY3RvcnkuY3JlYXRlTGluZSgpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZmluaXNoUmVuZGVyaW5nKGN0eCwgdHJ1ZSwgZGVsdGFUb3ApO1xuXHRcdFx0cmV0dXJuIGN0eDtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgbGluZXMgd2hpY2ggd2lsbCByZW1haW4gdW50b3VjaGVkXG5cdFx0dGhpcy5fcmVuZGVyVW50b3VjaGVkTGluZXMoXG5cdFx0XHRjdHgsXG5cdFx0XHRNYXRoLm1heChzdGFydExpbmVOdW1iZXIgLSBjdHgucmVuZExpbmVOdW1iZXJTdGFydCwgMCksXG5cdFx0XHRNYXRoLm1pbihzdG9wTGluZU51bWJlciAtIGN0eC5yZW5kTGluZU51bWJlclN0YXJ0LCBjdHgubGluZXNMZW5ndGggLSAxKSxcblx0XHRcdGRlbHRhVG9wLFxuXHRcdFx0c3RhcnRMaW5lTnVtYmVyXG5cdFx0KTtcblxuXHRcdGlmIChjdHgucmVuZExpbmVOdW1iZXJTdGFydCA+IHN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0Ly8gSW5zZXJ0IGxpbmVzIGJlZm9yZVxuXHRcdFx0Y29uc3QgZnJvbUxpbmVOdW1iZXIgPSBzdGFydExpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCB0b0xpbmVOdW1iZXIgPSBNYXRoLm1pbihzdG9wTGluZU51bWJlciwgY3R4LnJlbmRMaW5lTnVtYmVyU3RhcnQgLSAxKTtcblx0XHRcdGlmIChmcm9tTGluZU51bWJlciA8PSB0b0xpbmVOdW1iZXIpIHtcblx0XHRcdFx0dGhpcy5faW5zZXJ0TGluZXNCZWZvcmUoY3R4LCBmcm9tTGluZU51bWJlciwgdG9MaW5lTnVtYmVyLCBkZWx0YVRvcCwgc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0Y3R4LmxpbmVzTGVuZ3RoICs9IHRvTGluZU51bWJlciAtIGZyb21MaW5lTnVtYmVyICsgMTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGN0eC5yZW5kTGluZU51bWJlclN0YXJ0IDwgc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHQvLyBSZW1vdmUgbGluZXMgYmVmb3JlXG5cdFx0XHRjb25zdCByZW1vdmVDbnQgPSBNYXRoLm1pbihjdHgubGluZXNMZW5ndGgsIHN0YXJ0TGluZU51bWJlciAtIGN0eC5yZW5kTGluZU51bWJlclN0YXJ0KTtcblx0XHRcdGlmIChyZW1vdmVDbnQgPiAwKSB7XG5cdFx0XHRcdHRoaXMuX3JlbW92ZUxpbmVzQmVmb3JlKGN0eCwgcmVtb3ZlQ250KTtcblx0XHRcdFx0Y3R4LmxpbmVzTGVuZ3RoIC09IHJlbW92ZUNudDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjdHgucmVuZExpbmVOdW1iZXJTdGFydCA9IHN0YXJ0TGluZU51bWJlcjtcblxuXHRcdGlmIChjdHgucmVuZExpbmVOdW1iZXJTdGFydCArIGN0eC5saW5lc0xlbmd0aCAtIDEgPCBzdG9wTGluZU51bWJlcikge1xuXHRcdFx0Ly8gSW5zZXJ0IGxpbmVzIGFmdGVyXG5cdFx0XHRjb25zdCBmcm9tTGluZU51bWJlciA9IGN0eC5yZW5kTGluZU51bWJlclN0YXJ0ICsgY3R4LmxpbmVzTGVuZ3RoO1xuXHRcdFx0Y29uc3QgdG9MaW5lTnVtYmVyID0gc3RvcExpbmVOdW1iZXI7XG5cblx0XHRcdGlmIChmcm9tTGluZU51bWJlciA8PSB0b0xpbmVOdW1iZXIpIHtcblx0XHRcdFx0dGhpcy5faW5zZXJ0TGluZXNBZnRlcihjdHgsIGZyb21MaW5lTnVtYmVyLCB0b0xpbmVOdW1iZXIsIGRlbHRhVG9wLCBzdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRjdHgubGluZXNMZW5ndGggKz0gdG9MaW5lTnVtYmVyIC0gZnJvbUxpbmVOdW1iZXIgKyAxO1xuXHRcdFx0fVxuXG5cdFx0fSBlbHNlIGlmIChjdHgucmVuZExpbmVOdW1iZXJTdGFydCArIGN0eC5saW5lc0xlbmd0aCAtIDEgPiBzdG9wTGluZU51bWJlcikge1xuXHRcdFx0Ly8gUmVtb3ZlIGxpbmVzIGFmdGVyXG5cdFx0XHRjb25zdCBmcm9tTGluZU51bWJlciA9IE1hdGgubWF4KDAsIHN0b3BMaW5lTnVtYmVyIC0gY3R4LnJlbmRMaW5lTnVtYmVyU3RhcnQgKyAxKTtcblx0XHRcdGNvbnN0IHRvTGluZU51bWJlciA9IGN0eC5saW5lc0xlbmd0aCAtIDE7XG5cdFx0XHRjb25zdCByZW1vdmVDbnQgPSB0b0xpbmVOdW1iZXIgLSBmcm9tTGluZU51bWJlciArIDE7XG5cblx0XHRcdGlmIChyZW1vdmVDbnQgPiAwKSB7XG5cdFx0XHRcdHRoaXMuX3JlbW92ZUxpbmVzQWZ0ZXIoY3R4LCByZW1vdmVDbnQpO1xuXHRcdFx0XHRjdHgubGluZXNMZW5ndGggLT0gcmVtb3ZlQ250O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2ZpbmlzaFJlbmRlcmluZyhjdHgsIGZhbHNlLCBkZWx0YVRvcCk7XG5cblx0XHRyZXR1cm4gY3R4O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyVW50b3VjaGVkTGluZXMoY3R4OiBJUmVuZGVyZXJDb250ZXh0PFQ+LCBzdGFydEluZGV4OiBudW1iZXIsIGVuZEluZGV4OiBudW1iZXIsIGRlbHRhVG9wOiBudW1iZXJbXSwgZGVsdGFMTjogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVuZExpbmVOdW1iZXJTdGFydCA9IGN0eC5yZW5kTGluZU51bWJlclN0YXJ0O1xuXHRcdGNvbnN0IGxpbmVzID0gY3R4LmxpbmVzO1xuXG5cdFx0Zm9yIChsZXQgaSA9IHN0YXJ0SW5kZXg7IGkgPD0gZW5kSW5kZXg7IGkrKykge1xuXHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHJlbmRMaW5lTnVtYmVyU3RhcnQgKyBpO1xuXHRcdFx0bGluZXNbaV0ubGF5b3V0TGluZShsaW5lTnVtYmVyLCBkZWx0YVRvcFtsaW5lTnVtYmVyIC0gZGVsdGFMTl0sIHRoaXMuX2xpbmVIZWlnaHRGb3JMaW5lTnVtYmVyKGxpbmVOdW1iZXIpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9pbnNlcnRMaW5lc0JlZm9yZShjdHg6IElSZW5kZXJlckNvbnRleHQ8VD4sIGZyb21MaW5lTnVtYmVyOiBudW1iZXIsIHRvTGluZU51bWJlcjogbnVtYmVyLCBkZWx0YVRvcDogbnVtYmVyW10sIGRlbHRhTE46IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IG5ld0xpbmVzOiBUW10gPSBbXTtcblx0XHRsZXQgbmV3TGluZXNMZW4gPSAwO1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBmcm9tTGluZU51bWJlcjsgbGluZU51bWJlciA8PSB0b0xpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0bmV3TGluZXNbbmV3TGluZXNMZW4rK10gPSB0aGlzLl9saW5lRmFjdG9yeS5jcmVhdGVMaW5lKCk7XG5cdFx0fVxuXHRcdGN0eC5saW5lcyA9IG5ld0xpbmVzLmNvbmNhdChjdHgubGluZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlTGluZXNCZWZvcmUoY3R4OiBJUmVuZGVyZXJDb250ZXh0PFQ+LCByZW1vdmVDb3VudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZW1vdmVDb3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lRG9tTm9kZSA9IGN0eC5saW5lc1tpXS5nZXREb21Ob2RlKCk7XG5cdFx0XHRsaW5lRG9tTm9kZT8ucmVtb3ZlKCk7XG5cdFx0fVxuXHRcdGN0eC5saW5lcy5zcGxpY2UoMCwgcmVtb3ZlQ291bnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5zZXJ0TGluZXNBZnRlcihjdHg6IElSZW5kZXJlckNvbnRleHQ8VD4sIGZyb21MaW5lTnVtYmVyOiBudW1iZXIsIHRvTGluZU51bWJlcjogbnVtYmVyLCBkZWx0YVRvcDogbnVtYmVyW10sIGRlbHRhTE46IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IG5ld0xpbmVzOiBUW10gPSBbXTtcblx0XHRsZXQgbmV3TGluZXNMZW4gPSAwO1xuXHRcdGZvciAobGV0IGxpbmVOdW1iZXIgPSBmcm9tTGluZU51bWJlcjsgbGluZU51bWJlciA8PSB0b0xpbmVOdW1iZXI7IGxpbmVOdW1iZXIrKykge1xuXHRcdFx0bmV3TGluZXNbbmV3TGluZXNMZW4rK10gPSB0aGlzLl9saW5lRmFjdG9yeS5jcmVhdGVMaW5lKCk7XG5cdFx0fVxuXHRcdGN0eC5saW5lcyA9IGN0eC5saW5lcy5jb25jYXQobmV3TGluZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlTGluZXNBZnRlcihjdHg6IElSZW5kZXJlckNvbnRleHQ8VD4sIHJlbW92ZUNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCByZW1vdmVJbmRleCA9IGN0eC5saW5lc0xlbmd0aCAtIHJlbW92ZUNvdW50O1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZW1vdmVDb3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lRG9tTm9kZSA9IGN0eC5saW5lc1tyZW1vdmVJbmRleCArIGldLmdldERvbU5vZGUoKTtcblx0XHRcdGxpbmVEb21Ob2RlPy5yZW1vdmUoKTtcblx0XHR9XG5cdFx0Y3R4LmxpbmVzLnNwbGljZShyZW1vdmVJbmRleCwgcmVtb3ZlQ291bnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluaXNoUmVuZGVyaW5nTmV3TGluZXMoY3R4OiBJUmVuZGVyZXJDb250ZXh0PFQ+LCBkb21Ob2RlSXNFbXB0eTogYm9vbGVhbiwgbmV3TGluZXNIVE1MOiBzdHJpbmcgfCBUcnVzdGVkSFRNTCwgd2FzTmV3OiBib29sZWFuW10pOiB2b2lkIHtcblx0XHRpZiAoVmlld0xheWVyUmVuZGVyZXIuX3R0UG9saWN5KSB7XG5cdFx0XHRuZXdMaW5lc0hUTUwgPSBWaWV3TGF5ZXJSZW5kZXJlci5fdHRQb2xpY3kuY3JlYXRlSFRNTChuZXdMaW5lc0hUTUwgYXMgc3RyaW5nKTtcblx0XHR9XG5cdFx0Y29uc3QgbGFzdENoaWxkID0gPEhUTUxFbGVtZW50PnRoaXMuX2RvbU5vZGUubGFzdENoaWxkO1xuXHRcdGlmIChkb21Ob2RlSXNFbXB0eSB8fCAhbGFzdENoaWxkKSB7XG5cdFx0XHR0aGlzLl9kb21Ob2RlLmlubmVySFRNTCA9IG5ld0xpbmVzSFRNTCBhcyBzdHJpbmc7IC8vIGV4cGxhaW5zIHRoZSB1Z2x5IGNhc3RzIC0+IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMDYzOTYjaXNzdWVjb21tZW50LTY5MjYyNTM5Mztcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGFzdENoaWxkLmluc2VydEFkamFjZW50SFRNTCgnYWZ0ZXJlbmQnLCBuZXdMaW5lc0hUTUwgYXMgc3RyaW5nKTtcblx0XHR9XG5cblx0XHRsZXQgY3VyckNoaWxkID0gPEhUTUxFbGVtZW50PnRoaXMuX2RvbU5vZGUubGFzdENoaWxkO1xuXHRcdGZvciAobGV0IGkgPSBjdHgubGluZXNMZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgbGluZSA9IGN0eC5saW5lc1tpXTtcblx0XHRcdGlmICh3YXNOZXdbaV0pIHtcblx0XHRcdFx0bGluZS5zZXREb21Ob2RlKGN1cnJDaGlsZCk7XG5cdFx0XHRcdGN1cnJDaGlsZCA9IDxIVE1MRWxlbWVudD5jdXJyQ2hpbGQucHJldmlvdXNTaWJsaW5nO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2ZpbmlzaFJlbmRlcmluZ0ludmFsaWRMaW5lcyhjdHg6IElSZW5kZXJlckNvbnRleHQ8VD4sIGludmFsaWRMaW5lc0hUTUw6IHN0cmluZyB8IFRydXN0ZWRIVE1MLCB3YXNJbnZhbGlkOiBib29sZWFuW10pOiB2b2lkIHtcblx0XHRjb25zdCBodWdlRG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdFx0aWYgKFZpZXdMYXllclJlbmRlcmVyLl90dFBvbGljeSkge1xuXHRcdFx0aW52YWxpZExpbmVzSFRNTCA9IFZpZXdMYXllclJlbmRlcmVyLl90dFBvbGljeS5jcmVhdGVIVE1MKGludmFsaWRMaW5lc0hUTUwgYXMgc3RyaW5nKTtcblx0XHR9XG5cdFx0aHVnZURvbU5vZGUuaW5uZXJIVE1MID0gaW52YWxpZExpbmVzSFRNTCBhcyBzdHJpbmc7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGN0eC5saW5lc0xlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gY3R4LmxpbmVzW2ldO1xuXHRcdFx0aWYgKHdhc0ludmFsaWRbaV0pIHtcblx0XHRcdFx0Y29uc3Qgc291cmNlID0gPEhUTUxFbGVtZW50Pmh1Z2VEb21Ob2RlLmZpcnN0Q2hpbGQ7XG5cdFx0XHRcdGNvbnN0IGxpbmVEb21Ob2RlID0gbGluZS5nZXREb21Ob2RlKCkhO1xuXHRcdFx0XHRsaW5lRG9tTm9kZS5yZXBsYWNlV2l0aChzb3VyY2UpO1xuXHRcdFx0XHRsaW5lLnNldERvbU5vZGUoc291cmNlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfc2IgPSBuZXcgU3RyaW5nQnVpbGRlcigxMDAwMDApO1xuXG5cdHByaXZhdGUgX2ZpbmlzaFJlbmRlcmluZyhjdHg6IElSZW5kZXJlckNvbnRleHQ8VD4sIGRvbU5vZGVJc0VtcHR5OiBib29sZWFuLCBkZWx0YVRvcDogbnVtYmVyW10pOiB2b2lkIHtcblxuXHRcdGNvbnN0IHNiID0gVmlld0xheWVyUmVuZGVyZXIuX3NiO1xuXHRcdGNvbnN0IGxpbmVzTGVuZ3RoID0gY3R4LmxpbmVzTGVuZ3RoO1xuXHRcdGNvbnN0IGxpbmVzID0gY3R4LmxpbmVzO1xuXHRcdGNvbnN0IHJlbmRMaW5lTnVtYmVyU3RhcnQgPSBjdHgucmVuZExpbmVOdW1iZXJTdGFydDtcblxuXHRcdGNvbnN0IHdhc05ldzogYm9vbGVhbltdID0gW107XG5cdFx0e1xuXHRcdFx0c2IucmVzZXQoKTtcblx0XHRcdGxldCBoYWROZXdMaW5lID0gZmFsc2U7XG5cblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbGluZXNMZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBsaW5lID0gbGluZXNbaV07XG5cdFx0XHRcdHdhc05ld1tpXSA9IGZhbHNlO1xuXG5cdFx0XHRcdGNvbnN0IGxpbmVEb21Ob2RlID0gbGluZS5nZXREb21Ob2RlKCk7XG5cdFx0XHRcdGlmIChsaW5lRG9tTm9kZSkge1xuXHRcdFx0XHRcdC8vIGxpbmUgaXMgbm90IG5ld1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVuZGVyZWRMaW5lTnVtYmVyID0gaSArIHJlbmRMaW5lTnVtYmVyU3RhcnQ7XG5cdFx0XHRcdGNvbnN0IHJlbmRlclJlc3VsdCA9IGxpbmUucmVuZGVyTGluZShyZW5kZXJlZExpbmVOdW1iZXIsIGRlbHRhVG9wW2ldLCB0aGlzLl9saW5lSGVpZ2h0Rm9yTGluZU51bWJlcihyZW5kZXJlZExpbmVOdW1iZXIpLCB0aGlzLl92aWV3cG9ydERhdGEsIHNiKTtcblx0XHRcdFx0aWYgKCFyZW5kZXJSZXN1bHQpIHtcblx0XHRcdFx0XHQvLyBsaW5lIGRvZXMgbm90IG5lZWQgcmVuZGVyaW5nXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR3YXNOZXdbaV0gPSB0cnVlO1xuXHRcdFx0XHRoYWROZXdMaW5lID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGhhZE5ld0xpbmUpIHtcblx0XHRcdFx0dGhpcy5fZmluaXNoUmVuZGVyaW5nTmV3TGluZXMoY3R4LCBkb21Ob2RlSXNFbXB0eSwgc2IuYnVpbGQoKSwgd2FzTmV3KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR7XG5cdFx0XHRzYi5yZXNldCgpO1xuXG5cdFx0XHRsZXQgaGFkSW52YWxpZExpbmUgPSBmYWxzZTtcblx0XHRcdGNvbnN0IHdhc0ludmFsaWQ6IGJvb2xlYW5bXSA9IFtdO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxpbmVzTGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZSA9IGxpbmVzW2ldO1xuXHRcdFx0XHR3YXNJbnZhbGlkW2ldID0gZmFsc2U7XG5cblx0XHRcdFx0aWYgKHdhc05ld1tpXSkge1xuXHRcdFx0XHRcdC8vIGxpbmUgd2FzIG5ld1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVuZGVyZWRMaW5lTnVtYmVyID0gaSArIHJlbmRMaW5lTnVtYmVyU3RhcnQ7XG5cdFx0XHRcdGNvbnN0IHJlbmRlclJlc3VsdCA9IGxpbmUucmVuZGVyTGluZShyZW5kZXJlZExpbmVOdW1iZXIsIGRlbHRhVG9wW2ldLCB0aGlzLl9saW5lSGVpZ2h0Rm9yTGluZU51bWJlcihyZW5kZXJlZExpbmVOdW1iZXIpLCB0aGlzLl92aWV3cG9ydERhdGEsIHNiKTtcblx0XHRcdFx0aWYgKCFyZW5kZXJSZXN1bHQpIHtcblx0XHRcdFx0XHQvLyBsaW5lIGRvZXMgbm90IG5lZWQgcmVuZGVyaW5nXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR3YXNJbnZhbGlkW2ldID0gdHJ1ZTtcblx0XHRcdFx0aGFkSW52YWxpZExpbmUgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaGFkSW52YWxpZExpbmUpIHtcblx0XHRcdFx0dGhpcy5fZmluaXNoUmVuZGVyaW5nSW52YWxpZExpbmVzKGN0eCwgc2IuYnVpbGQoKSwgd2FzSW52YWxpZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbGluZUhlaWdodEZvckxpbmVOdW1iZXIobGluZU51bWJlcjogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlld0NvbnRleHQudmlld0xheW91dC5nZXRMaW5lSGVpZ2h0Rm9yTGluZU51bWJlcihsaW5lTnVtYmVyKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBc0IseUJBQXlCO0FBQy9DLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMscUJBQXFCO0FBaUN2QixNQUFNLHdCQUF5QztBQUFBLEVBSXJELFlBQ2tCLGNBQ2hCO0FBRGdCO0FBRWpCLFNBQUssS0FBSyxHQUFHLENBQUMsQ0FBQztBQUFBLEVBQ2hCO0FBQUEsRUFFTyxRQUFjO0FBQ3BCLFNBQUssS0FBSyxHQUFHLENBQUMsQ0FBQztBQUFBLEVBQ2hCO0FBQUEsRUFFQSxLQUFLLHFCQUE2QixPQUFrQjtBQUNuRCxTQUFLLFNBQVM7QUFDZCxTQUFLLHVCQUF1QjtBQUFBLEVBQzdCO0FBQUEsRUFFQSxPQUFvRDtBQUNuRCxXQUFPO0FBQUEsTUFDTixxQkFBcUIsS0FBSztBQUFBLE1BQzFCLE9BQU8sS0FBSztBQUFBLElBQ2I7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLTyxxQkFBNkI7QUFDbkMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS08sbUJBQTJCO0FBQ2pDLFdBQU8sS0FBSyx1QkFBdUIsS0FBSyxPQUFPLFNBQVM7QUFBQSxFQUN6RDtBQUFBLEVBRU8sV0FBbUI7QUFDekIsV0FBTyxLQUFLLE9BQU87QUFBQSxFQUNwQjtBQUFBLEVBRU8sUUFBUSxZQUF1QjtBQUNyQyxVQUFNLFlBQVksYUFBYSxLQUFLO0FBQ3BDLFFBQUksWUFBWSxLQUFLLGFBQWEsS0FBSyxPQUFPLFFBQVE7QUFDckQs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
