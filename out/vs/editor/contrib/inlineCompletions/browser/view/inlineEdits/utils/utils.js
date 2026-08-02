import { getDomNodePagePosition, h } from "../../../../../../../base/browser/dom.js";
import { KeybindingLabel, unthemedKeybindingLabelOptions } from "../../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { numberComparator } from "../../../../../../../base/common/arrays.js";
import { findFirstMin } from "../../../../../../../base/common/arraysFind.js";
import { toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { DebugLocation, derived, derivedObservableWithCache, derivedOpts, observableSignalFromEvent, observableValue, transaction } from "../../../../../../../base/common/observable.js";
import { OS } from "../../../../../../../base/common/platform.js";
import { splitLines } from "../../../../../../../base/common/strings.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { MenuEntryActionViewItem } from "../../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { observableCodeEditor } from "../../../../../../browser/observableCodeEditor.js";
import { Rect } from "../../../../../../common/core/2d/rect.js";
import { EditorOption } from "../../../../../../common/config/editorOptions.js";
import { OffsetRange } from "../../../../../../common/core/ranges/offsetRange.js";
import { Position } from "../../../../../../common/core/position.js";
import { Range } from "../../../../../../common/core/range.js";
import { TextReplacement, TextEdit } from "../../../../../../common/core/edits/textEdit.js";
import { RangeMapping } from "../../../../../../common/diff/rangeMapping.js";
import { indentOfLine } from "../../../../../../common/model/textModel.js";
import { CharCode } from "../../../../../../../base/common/charCode.js";
import { BugIndicatingError } from "../../../../../../../base/common/errors.js";
import { Size2D } from "../../../../../../common/core/2d/size.js";
function maxContentWidthInRange(editor, range, reader) {
  const model = editor.model.read(reader);
  if (!model) {
    return 0;
  }
  let maxContentWidth = 0;
  for (let i = range.startLineNumber; i < range.endLineNumberExclusive; i++) {
    const lineContentWidth = editor.getWidthOfLine(i, reader);
    maxContentWidth = Math.max(maxContentWidth, lineContentWidth);
  }
  const lines = range.mapToLineArray((l) => model.getLineContent(l));
  if (maxContentWidth < 5 && lines.some((l) => l.length > 0) && model.uri.scheme !== "file") {
    console.log("unexpected width");
  }
  return maxContentWidth;
}
function getContentSizeOfLines(editor, range, reader) {
  observableSignalFromEvent(editor, editor.editor.onDidChangeLineHeight).read(reader);
  const model = editor.model.read(reader);
  if (!model) {
    throw new BugIndicatingError("Model is required");
  }
  const sizes = [];
  for (let i = range.startLineNumber; i < range.endLineNumberExclusive; i++) {
    let lineContentWidth = editor.getWidthOfLine(i, reader);
    if (lineContentWidth === -1) {
      const column = model.getLineMaxColumn(i);
      const typicalHalfwidthCharacterWidth = editor.editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
      const approximation = column * typicalHalfwidthCharacterWidth;
      lineContentWidth = approximation;
    }
    const height = editor.editor.getLineHeightForPosition(new Position(i, 1));
    sizes.push(new Size2D(lineContentWidth, height));
  }
  return sizes;
}
function getOffsetForPos(editor, pos, reader) {
  editor.layoutInfo.read(reader);
  editor.value.read(reader);
  const model = editor.model.read(reader);
  if (!model) {
    return 0;
  }
  editor.scrollTop.read(reader);
  const lineContentWidth = editor.editor.getOffsetForColumn(pos.lineNumber, pos.column);
  return lineContentWidth;
}
function getPrefixTrim(diffRanges, originalLinesRange, modifiedLines, editor, reader = void 0) {
  const textModel = editor.getModel();
  if (!textModel) {
    return { prefixTrim: 0, prefixLeftOffset: 0 };
  }
  const replacementStart = diffRanges.map((r) => r.isSingleLine() ? r.startColumn - 1 : 0);
  const originalIndents = originalLinesRange.mapToLineArray((line) => indentOfLine(textModel.getLineContent(line)));
  const modifiedIndents = modifiedLines.filter((line) => line !== "").map((line) => indentOfLine(line));
  const prefixTrim = Math.min(...replacementStart, ...originalIndents, ...modifiedIndents);
  let prefixLeftOffset;
  const startLineIndent = textModel.getLineIndentColumn(originalLinesRange.startLineNumber);
  if (startLineIndent >= prefixTrim + 1) {
    observableCodeEditor(editor).scrollTop.read(reader);
    prefixLeftOffset = editor.getOffsetForColumn(originalLinesRange.startLineNumber, prefixTrim + 1);
  } else if (modifiedLines.length > 0) {
    prefixLeftOffset = getContentRenderWidth(modifiedLines[0].slice(0, prefixTrim), editor, textModel);
  } else {
    return { prefixTrim: 0, prefixLeftOffset: 0 };
  }
  return { prefixTrim, prefixLeftOffset };
}
function getContentRenderWidth(content, editor, textModel) {
  const w = editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
  const tabSize = textModel.getOptions().tabSize * w;
  const numTabs = content.split("	").length - 1;
  const numNoneTabs = content.length - numTabs;
  return numNoneTabs * w + numTabs * tabSize;
}
function getEditorValidOverlayRect(editor) {
  const contentLeft = editor.layoutInfoContentLeft;
  const width = derived({ name: "editor.validOverlay.width" }, (r) => {
    const hasMinimapOnTheRight = editor.layoutInfoMinimap.read(r).minimapLeft !== 0;
    const editorWidth = Math.max(0, editor.layoutInfoWidth.read(r) - contentLeft.read(r));
    if (hasMinimapOnTheRight) {
      const minimapAndScrollbarWidth = editor.layoutInfoMinimap.read(r).minimapWidth + editor.layoutInfoVerticalScrollbarWidth.read(r);
      return Math.max(0, editorWidth - minimapAndScrollbarWidth);
    }
    return editorWidth;
  });
  const height = derived({ name: "editor.validOverlay.height" }, (r) => editor.layoutInfoHeight.read(r) + editor.contentHeight.read(r));
  return derived({ name: "editor.validOverlay" }, (r) => Rect.fromLeftTopWidthHeight(contentLeft.read(r), 0, width.read(r), height.read(r)));
}
class StatusBarViewItem extends MenuEntryActionViewItem {
  constructor() {
    super(...arguments);
    this._updateLabelListener = this._register(this._contextKeyService.onDidChangeContext(() => {
      this.updateLabel();
    }));
  }
  updateLabel() {
    const kb = this._keybindingService.lookupKeybinding(this._action.id, this._contextKeyService, true);
    if (!kb) {
      return super.updateLabel();
    }
    if (this.label) {
      const div = h("div.keybinding").root;
      const keybindingLabel = this._register(new KeybindingLabel(div, OS, { disableTitle: true, ...unthemedKeybindingLabelOptions }));
      keybindingLabel.set(kb);
      this.label.textContent = this._action.label;
      this.label.appendChild(div);
      this.label.classList.add("inlineSuggestionStatusBarItemLabel");
    }
  }
  updateTooltip() {
  }
}
const _UniqueUriGenerator = class _UniqueUriGenerator {
  constructor(scheme) {
    this.scheme = scheme;
  }
  getUniqueUri() {
    return URI.from({ scheme: this.scheme, path: (/* @__PURE__ */ new Date()).toString() + String(_UniqueUriGenerator._modelId++) });
  }
};
_UniqueUriGenerator._modelId = 0;
let UniqueUriGenerator = _UniqueUriGenerator;
function applyEditToModifiedRangeMappings(rangeMapping, edit) {
  const updatedMappings = [];
  for (const m of rangeMapping) {
    const updatedRange = edit.mapRange(m.modifiedRange);
    updatedMappings.push(new RangeMapping(m.originalRange, updatedRange));
  }
  return updatedMappings;
}
function classNames(...classes) {
  return classes.filter((c) => typeof c === "string").join(" ");
}
function offsetRangeToRange(columnOffsetRange, startPos) {
  return new Range(
    startPos.lineNumber,
    startPos.column + columnOffsetRange.start,
    startPos.lineNumber,
    startPos.column + columnOffsetRange.endExclusive
  );
}
function getIndentationSize(line, tabSize) {
  let currentSize = 0;
  loop: for (let i = 0, len = line.length; i < len; i++) {
    switch (line.charCodeAt(i)) {
      case CharCode.Tab:
        currentSize += tabSize;
        break;
      case CharCode.Space:
        currentSize++;
        break;
      default:
        break loop;
    }
  }
  return currentSize - currentSize % tabSize;
}
function indentSizeToIndentLength(line, indentSize, tabSize) {
  let remainingSize = indentSize - indentSize % tabSize;
  let i = 0;
  for (; i < line.length; i++) {
    if (remainingSize === 0) {
      break;
    }
    switch (line.charCodeAt(i)) {
      case CharCode.Tab:
        remainingSize -= tabSize;
        break;
      case CharCode.Space:
        remainingSize--;
        break;
      default:
        throw new BugIndicatingError("Unexpected character found while calculating indent length");
    }
  }
  return i;
}
function createReindentEdit(text, range, tabSize) {
  const newLines = splitLines(text);
  const edits = [];
  const minIndentSize = findFirstMin(range.mapToLineArray((l) => getIndentationSize(newLines[l - 1], tabSize)), numberComparator);
  range.forEach((lineNumber) => {
    const indentLength = indentSizeToIndentLength(newLines[lineNumber - 1], minIndentSize, tabSize);
    edits.push(new TextReplacement(offsetRangeToRange(new OffsetRange(0, indentLength), new Position(lineNumber, 1)), ""));
  });
  return new TextEdit(edits);
}
class PathBuilder {
  constructor() {
    this._data = "";
  }
  moveTo(point) {
    this._data += `M ${point.x} ${point.y} `;
    return this;
  }
  lineTo(point) {
    this._data += `L ${point.x} ${point.y} `;
    return this;
  }
  curveTo(cp, to) {
    this._data += `Q ${cp.x} ${cp.y} ${to.x} ${to.y} `;
    return this;
  }
  curveTo2(cp1, cp2, to) {
    this._data += `C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${to.x} ${to.y} `;
    return this;
  }
  build() {
    return this._data;
  }
}
function createRectangle(layout, padding, borderRadius, options = {}) {
  const topLeftInner = layout.topLeft;
  const topRightInner = topLeftInner.deltaX(layout.width);
  const bottomLeftInner = topLeftInner.deltaY(layout.height);
  const bottomRightInner = bottomLeftInner.deltaX(layout.width);
  const { top: paddingTop, bottom: paddingBottom, left: paddingLeft, right: paddingRight } = typeof padding === "number" ? { top: padding, bottom: padding, left: padding, right: padding } : padding;
  const { topLeft: radiusTL, topRight: radiusTR, bottomLeft: radiusBL, bottomRight: radiusBR } = typeof borderRadius === "number" ? { topLeft: borderRadius, topRight: borderRadius, bottomLeft: borderRadius, bottomRight: borderRadius } : borderRadius;
  const totalHeight = layout.height + paddingTop + paddingBottom;
  const totalWidth = layout.width + paddingLeft + paddingRight;
  const topLeft = topLeftInner.deltaX(-paddingLeft).deltaY(-paddingTop);
  const topRight = topRightInner.deltaX(paddingRight).deltaY(-paddingTop);
  const topLeftBefore = topLeft.deltaY(Math.min(radiusTL, totalHeight / 2));
  const topLeftAfter = topLeft.deltaX(Math.min(radiusTL, totalWidth / 2));
  const topRightBefore = topRight.deltaX(-Math.min(radiusTR, totalWidth / 2));
  const topRightAfter = topRight.deltaY(Math.min(radiusTR, totalHeight / 2));
  const bottomLeft = bottomLeftInner.deltaX(-paddingLeft).deltaY(paddingBottom);
  const bottomRight = bottomRightInner.deltaX(paddingRight).deltaY(paddingBottom);
  const bottomLeftBefore = bottomLeft.deltaX(Math.min(radiusBL, totalWidth / 2));
  const bottomLeftAfter = bottomLeft.deltaY(-Math.min(radiusBL, totalHeight / 2));
  const bottomRightBefore = bottomRight.deltaY(-Math.min(radiusBR, totalHeight / 2));
  const bottomRightAfter = bottomRight.deltaX(-Math.min(radiusBR, totalWidth / 2));
  const path = new PathBuilder();
  if (!options.hideLeft) {
    path.moveTo(bottomLeftAfter).lineTo(topLeftBefore);
  }
  if (!options.hideLeft && !options.hideTop) {
    path.curveTo(topLeft, topLeftAfter);
  } else {
    path.moveTo(topLeftAfter);
  }
  if (!options.hideTop) {
    path.lineTo(topRightBefore);
  }
  if (!options.hideTop && !options.hideRight) {
    path.curveTo(topRight, topRightAfter);
  } else {
    path.moveTo(topRightAfter);
  }
  if (!options.hideRight) {
    path.lineTo(bottomRightBefore);
  }
  if (!options.hideRight && !options.hideBottom) {
    path.curveTo(bottomRight, bottomRightAfter);
  } else {
    path.moveTo(bottomRightAfter);
  }
  if (!options.hideBottom) {
    path.lineTo(bottomLeftBefore);
  }
  if (!options.hideBottom && !options.hideLeft) {
    path.curveTo(bottomLeft, bottomLeftAfter);
  } else {
    path.moveTo(bottomLeftAfter);
  }
  return path.build();
}
function mapOutFalsy(obs) {
  const nonUndefinedObs = derivedObservableWithCache(void 0, (reader, lastValue) => obs.read(reader) || lastValue);
  return derivedOpts({
    debugName: () => `${obs.debugName}.mapOutFalsy`
  }, (reader) => {
    nonUndefinedObs.read(reader);
    const val = obs.read(reader);
    if (!val) {
      return void 0;
    }
    return nonUndefinedObs;
  });
}
function observeElementPosition(element, store) {
  const topLeft = getDomNodePagePosition(element);
  const top = observableValue("top", topLeft.top);
  const left = observableValue("left", topLeft.left);
  const resizeObserver = new ResizeObserver(() => {
    transaction((tx) => {
      const topLeft2 = getDomNodePagePosition(element);
      top.set(topLeft2.top, tx);
      left.set(topLeft2.left, tx);
    });
  });
  resizeObserver.observe(element);
  store.add(toDisposable(() => resizeObserver.disconnect()));
  return {
    top,
    left
  };
}
function rectToProps(fn, debugLocation = DebugLocation.ofCaller()) {
  return {
    left: derived({ name: "editor.validOverlay.left" }, (reader) => (
      /** @description left */
      fn(reader)?.left
    ), debugLocation),
    top: derived({ name: "editor.validOverlay.top" }, (reader) => (
      /** @description top */
      fn(reader)?.top
    ), debugLocation),
    width: derived({ name: "editor.validOverlay.width" }, (reader) => {
      const val = fn(reader);
      if (!val) {
        return void 0;
      }
      return val.width;
    }, debugLocation),
    height: derived({ name: "editor.validOverlay.height" }, (reader) => {
      const val = fn(reader);
      if (!val) {
        return void 0;
      }
      return val.height;
    }, debugLocation)
  };
}
function observeEditorBoundingClientRect(editor, store) {
  const dom = editor.getContainerDomNode();
  const initialDomRect = observableValue("domRect", dom.getBoundingClientRect());
  store.add(editor.onDidLayoutChange((e) => {
    initialDomRect.set(dom.getBoundingClientRect(), void 0);
  }));
  return initialDomRect;
}
export {
  PathBuilder,
  StatusBarViewItem,
  UniqueUriGenerator,
  applyEditToModifiedRangeMappings,
  classNames,
  createRectangle,
  createReindentEdit,
  getContentRenderWidth,
  getContentSizeOfLines,
  getEditorValidOverlayRect,
  getOffsetForPos,
  getPrefixTrim,
  mapOutFalsy,
  maxContentWidthInRange,
  observeEditorBoundingClientRect,
  observeElementPosition,
  rectToProps
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy91dGlscy91dGlscy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdldERvbU5vZGVQYWdlUG9zaXRpb24sIGggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdMYWJlbCwgdW50aGVtZWRLZXliaW5kaW5nTGFiZWxPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2tleWJpbmRpbmdMYWJlbC9rZXliaW5kaW5nTGFiZWwuanMnO1xuaW1wb3J0IHsgbnVtYmVyQ29tcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBmaW5kRmlyc3RNaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXNGaW5kLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IERlYnVnTG9jYXRpb24sIGRlcml2ZWQsIGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlLCBkZXJpdmVkT3B0cywgSU9ic2VydmFibGUsIElSZWFkZXIsIG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQsIG9ic2VydmFibGVWYWx1ZSwgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgc3BsaXRMaW5lcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IE1lbnVFbnRyeUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb2RlRWRpdG9yLCBPYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgUG9pbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS8yZC9wb2ludC5qcyc7XG5pbXBvcnQgeyBSZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvMmQvcmVjdC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL2xpbmVSYW5nZS5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9vZmZzZXRSYW5nZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVGV4dFJlcGxhY2VtZW50LCBUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRzL3RleHRFZGl0LmpzJztcbmltcG9ydCB7IFJhbmdlTWFwcGluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9kaWZmL3JhbmdlTWFwcGluZy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGluZGVudE9mTGluZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgU2l6ZTJEIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvMmQvc2l6ZS5qcyc7XG5cbi8qKlxuICogV2FybmluZzogbWlnaHQgcmV0dXJuIDAuXG4qL1xuZXhwb3J0IGZ1bmN0aW9uIG1heENvbnRlbnRXaWR0aEluUmFuZ2UoZWRpdG9yOiBPYnNlcnZhYmxlQ29kZUVkaXRvciwgcmFuZ2U6IExpbmVSYW5nZSwgcmVhZGVyOiBJUmVhZGVyIHwgdW5kZWZpbmVkKTogbnVtYmVyIHtcblx0Y29uc3QgbW9kZWwgPSBlZGl0b3IubW9kZWwucmVhZChyZWFkZXIpO1xuXHRpZiAoIW1vZGVsKSB7IHJldHVybiAwOyB9XG5cdGxldCBtYXhDb250ZW50V2lkdGggPSAwO1xuXG5cdGZvciAobGV0IGkgPSByYW5nZS5zdGFydExpbmVOdW1iZXI7IGkgPCByYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlOyBpKyspIHtcblx0XHRjb25zdCBsaW5lQ29udGVudFdpZHRoID0gZWRpdG9yLmdldFdpZHRoT2ZMaW5lKGksIHJlYWRlcik7XG5cdFx0bWF4Q29udGVudFdpZHRoID0gTWF0aC5tYXgobWF4Q29udGVudFdpZHRoLCBsaW5lQ29udGVudFdpZHRoKTtcblx0fVxuXHRjb25zdCBsaW5lcyA9IHJhbmdlLm1hcFRvTGluZUFycmF5KGwgPT4gbW9kZWwuZ2V0TGluZUNvbnRlbnQobCkpO1xuXG5cdGlmIChtYXhDb250ZW50V2lkdGggPCA1ICYmIGxpbmVzLnNvbWUobCA9PiBsLmxlbmd0aCA+IDApICYmIG1vZGVsLnVyaS5zY2hlbWUgIT09ICdmaWxlJykge1xuXHRcdGNvbnNvbGUubG9nKCd1bmV4cGVjdGVkIHdpZHRoJyk7XG5cdH1cblx0cmV0dXJuIG1heENvbnRlbnRXaWR0aDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbnRlbnRTaXplT2ZMaW5lcyhlZGl0b3I6IE9ic2VydmFibGVDb2RlRWRpdG9yLCByYW5nZTogTGluZVJhbmdlLCByZWFkZXI6IElSZWFkZXIgfCB1bmRlZmluZWQpOiBTaXplMkRbXSB7XG5cdG9ic2VydmFibGVTaWduYWxGcm9tRXZlbnQoZWRpdG9yLCBlZGl0b3IuZWRpdG9yLm9uRGlkQ2hhbmdlTGluZUhlaWdodCkucmVhZChyZWFkZXIpO1xuXG5cdGNvbnN0IG1vZGVsID0gZWRpdG9yLm1vZGVsLnJlYWQocmVhZGVyKTtcblx0aWYgKCFtb2RlbCkgeyB0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdNb2RlbCBpcyByZXF1aXJlZCcpOyB9XG5cblx0Y29uc3Qgc2l6ZXM6IFNpemUyRFtdID0gW107XG5cblx0Zm9yIChsZXQgaSA9IHJhbmdlLnN0YXJ0TGluZU51bWJlcjsgaSA8IHJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmU7IGkrKykge1xuXHRcdGxldCBsaW5lQ29udGVudFdpZHRoID0gZWRpdG9yLmdldFdpZHRoT2ZMaW5lKGksIHJlYWRlcik7XG5cdFx0aWYgKGxpbmVDb250ZW50V2lkdGggPT09IC0xKSB7XG5cdFx0XHQvLyBhcHByb3hpbWF0aW9uXG5cdFx0XHRjb25zdCBjb2x1bW4gPSBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKGkpO1xuXHRcdFx0Y29uc3QgdHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoID0gZWRpdG9yLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKS50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg7XG5cdFx0XHRjb25zdCBhcHByb3hpbWF0aW9uID0gY29sdW1uICogdHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoO1xuXHRcdFx0bGluZUNvbnRlbnRXaWR0aCA9IGFwcHJveGltYXRpb247XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVpZ2h0ID0gZWRpdG9yLmVkaXRvci5nZXRMaW5lSGVpZ2h0Rm9yUG9zaXRpb24obmV3IFBvc2l0aW9uKGksIDEpKTtcblx0XHRzaXplcy5wdXNoKG5ldyBTaXplMkQobGluZUNvbnRlbnRXaWR0aCwgaGVpZ2h0KSk7XG5cdH1cblxuXHRyZXR1cm4gc2l6ZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRPZmZzZXRGb3JQb3MoZWRpdG9yOiBPYnNlcnZhYmxlQ29kZUVkaXRvciwgcG9zOiBQb3NpdGlvbiwgcmVhZGVyOiBJUmVhZGVyKTogbnVtYmVyIHtcblx0ZWRpdG9yLmxheW91dEluZm8ucmVhZChyZWFkZXIpO1xuXHRlZGl0b3IudmFsdWUucmVhZChyZWFkZXIpO1xuXG5cdGNvbnN0IG1vZGVsID0gZWRpdG9yLm1vZGVsLnJlYWQocmVhZGVyKTtcblx0aWYgKCFtb2RlbCkgeyByZXR1cm4gMDsgfVxuXG5cdGVkaXRvci5zY3JvbGxUb3AucmVhZChyZWFkZXIpO1xuXHRjb25zdCBsaW5lQ29udGVudFdpZHRoID0gZWRpdG9yLmVkaXRvci5nZXRPZmZzZXRGb3JDb2x1bW4ocG9zLmxpbmVOdW1iZXIsIHBvcy5jb2x1bW4pO1xuXG5cdHJldHVybiBsaW5lQ29udGVudFdpZHRoO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UHJlZml4VHJpbShkaWZmUmFuZ2VzOiBSYW5nZVtdLCBvcmlnaW5hbExpbmVzUmFuZ2U6IExpbmVSYW5nZSwgbW9kaWZpZWRMaW5lczogc3RyaW5nW10sIGVkaXRvcjogSUNvZGVFZGl0b3IsIHJlYWRlcjogSVJlYWRlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCk6IHsgcHJlZml4VHJpbTogbnVtYmVyOyBwcmVmaXhMZWZ0T2Zmc2V0OiBudW1iZXIgfSB7XG5cdGNvbnN0IHRleHRNb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRpZiAoIXRleHRNb2RlbCkge1xuXHRcdHJldHVybiB7IHByZWZpeFRyaW06IDAsIHByZWZpeExlZnRPZmZzZXQ6IDAgfTtcblx0fVxuXG5cdGNvbnN0IHJlcGxhY2VtZW50U3RhcnQgPSBkaWZmUmFuZ2VzLm1hcChyID0+IHIuaXNTaW5nbGVMaW5lKCkgPyByLnN0YXJ0Q29sdW1uIC0gMSA6IDApO1xuXHRjb25zdCBvcmlnaW5hbEluZGVudHMgPSBvcmlnaW5hbExpbmVzUmFuZ2UubWFwVG9MaW5lQXJyYXkobGluZSA9PiBpbmRlbnRPZkxpbmUodGV4dE1vZGVsLmdldExpbmVDb250ZW50KGxpbmUpKSk7XG5cdGNvbnN0IG1vZGlmaWVkSW5kZW50cyA9IG1vZGlmaWVkTGluZXMuZmlsdGVyKGxpbmUgPT4gbGluZSAhPT0gJycpLm1hcChsaW5lID0+IGluZGVudE9mTGluZShsaW5lKSk7XG5cdGNvbnN0IHByZWZpeFRyaW0gPSBNYXRoLm1pbiguLi5yZXBsYWNlbWVudFN0YXJ0LCAuLi5vcmlnaW5hbEluZGVudHMsIC4uLm1vZGlmaWVkSW5kZW50cyk7XG5cblx0bGV0IHByZWZpeExlZnRPZmZzZXQ7XG5cdGNvbnN0IHN0YXJ0TGluZUluZGVudCA9IHRleHRNb2RlbC5nZXRMaW5lSW5kZW50Q29sdW1uKG9yaWdpbmFsTGluZXNSYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRpZiAoc3RhcnRMaW5lSW5kZW50ID49IHByZWZpeFRyaW0gKyAxKSB7XG5cdFx0Ly8gV2UgY2FuIHVzZSB0aGUgZWRpdG9yIHRvIGdldCB0aGUgb2Zmc2V0XG5cdFx0Ly8gVE9ETyBnbyB0aHJvdWdoIG90aGVyIHVzYWdlcyBvZiBnZXRPZmZzZXRGb3JDb2x1bW4gYW5kIGNvbWUgdXAgd2l0aCBhIHJvYnVzdCByZWFjdGl2ZSBzb2x1dGlvbiB0byByZWFkIGl0XG5cdFx0b2JzZXJ2YWJsZUNvZGVFZGl0b3IoZWRpdG9yKS5zY3JvbGxUb3AucmVhZChyZWFkZXIpOyAvLyBnZXRPZmZzZXRGb3JDb2x1bW4gcmVxdWlyZXMgdGhlIGxpbmUgbnVtYmVyIHRvIGJlIHZpc2libGUuIFRoaXMgbWlnaHQgY2hhbmdlIG9uIHNjcm9sbCB0b3AuXG5cdFx0cHJlZml4TGVmdE9mZnNldCA9IGVkaXRvci5nZXRPZmZzZXRGb3JDb2x1bW4ob3JpZ2luYWxMaW5lc1JhbmdlLnN0YXJ0TGluZU51bWJlciwgcHJlZml4VHJpbSArIDEpO1xuXHR9IGVsc2UgaWYgKG1vZGlmaWVkTGluZXMubGVuZ3RoID4gMCkge1xuXHRcdC8vIENvbnRlbnQgaXMgbm90IGluIHRoZSBlZGl0b3IsIHdlIGNhbiB1c2UgdGhlIGNvbnRlbnQgd2lkdGggdG8gY2FsY3VsYXRlIHRoZSBvZmZzZXRcblx0XHRwcmVmaXhMZWZ0T2Zmc2V0ID0gZ2V0Q29udGVudFJlbmRlcldpZHRoKG1vZGlmaWVkTGluZXNbMF0uc2xpY2UoMCwgcHJlZml4VHJpbSksIGVkaXRvciwgdGV4dE1vZGVsKTtcblx0fSBlbHNlIHtcblx0XHQvLyB1bmFibGUgdG8gYXBwcm94aW1hdGUgdGhlIG9mZnNldFxuXHRcdHJldHVybiB7IHByZWZpeFRyaW06IDAsIHByZWZpeExlZnRPZmZzZXQ6IDAgfTtcblx0fVxuXG5cdHJldHVybiB7IHByZWZpeFRyaW0sIHByZWZpeExlZnRPZmZzZXQgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbnRlbnRSZW5kZXJXaWR0aChjb250ZW50OiBzdHJpbmcsIGVkaXRvcjogSUNvZGVFZGl0b3IsIHRleHRNb2RlbDogSVRleHRNb2RlbCkge1xuXHRjb25zdCB3ID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udEluZm8pLnR5cGljYWxIYWxmd2lkdGhDaGFyYWN0ZXJXaWR0aDtcblx0Y29uc3QgdGFiU2l6ZSA9IHRleHRNb2RlbC5nZXRPcHRpb25zKCkudGFiU2l6ZSAqIHc7XG5cblx0Y29uc3QgbnVtVGFicyA9IGNvbnRlbnQuc3BsaXQoJ1xcdCcpLmxlbmd0aCAtIDE7XG5cdGNvbnN0IG51bU5vbmVUYWJzID0gY29udGVudC5sZW5ndGggLSBudW1UYWJzO1xuXHRyZXR1cm4gbnVtTm9uZVRhYnMgKiB3ICsgbnVtVGFicyAqIHRhYlNpemU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRFZGl0b3JWYWxpZE92ZXJsYXlSZWN0KGVkaXRvcjogT2JzZXJ2YWJsZUNvZGVFZGl0b3IpOiBJT2JzZXJ2YWJsZTxSZWN0PiB7XG5cdGNvbnN0IGNvbnRlbnRMZWZ0ID0gZWRpdG9yLmxheW91dEluZm9Db250ZW50TGVmdDtcblxuXHRjb25zdCB3aWR0aCA9IGRlcml2ZWQoeyBuYW1lOiAnZWRpdG9yLnZhbGlkT3ZlcmxheS53aWR0aCcgfSwgciA9PiB7XG5cdFx0Y29uc3QgaGFzTWluaW1hcE9uVGhlUmlnaHQgPSBlZGl0b3IubGF5b3V0SW5mb01pbmltYXAucmVhZChyKS5taW5pbWFwTGVmdCAhPT0gMDtcblx0XHRjb25zdCBlZGl0b3JXaWR0aCA9IE1hdGgubWF4KDAsIGVkaXRvci5sYXlvdXRJbmZvV2lkdGgucmVhZChyKSAtIGNvbnRlbnRMZWZ0LnJlYWQocikpO1xuXG5cdFx0aWYgKGhhc01pbmltYXBPblRoZVJpZ2h0KSB7XG5cdFx0XHRjb25zdCBtaW5pbWFwQW5kU2Nyb2xsYmFyV2lkdGggPSBlZGl0b3IubGF5b3V0SW5mb01pbmltYXAucmVhZChyKS5taW5pbWFwV2lkdGggKyBlZGl0b3IubGF5b3V0SW5mb1ZlcnRpY2FsU2Nyb2xsYmFyV2lkdGgucmVhZChyKTtcblx0XHRcdHJldHVybiBNYXRoLm1heCgwLCBlZGl0b3JXaWR0aCAtIG1pbmltYXBBbmRTY3JvbGxiYXJXaWR0aCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVkaXRvcldpZHRoO1xuXHR9KTtcblxuXHRjb25zdCBoZWlnaHQgPSBkZXJpdmVkKHsgbmFtZTogJ2VkaXRvci52YWxpZE92ZXJsYXkuaGVpZ2h0JyB9LCByID0+IGVkaXRvci5sYXlvdXRJbmZvSGVpZ2h0LnJlYWQocikgKyBlZGl0b3IuY29udGVudEhlaWdodC5yZWFkKHIpKTtcblxuXHRyZXR1cm4gZGVyaXZlZCh7IG5hbWU6ICdlZGl0b3IudmFsaWRPdmVybGF5JyB9LCByID0+IFJlY3QuZnJvbUxlZnRUb3BXaWR0aEhlaWdodChjb250ZW50TGVmdC5yZWFkKHIpLCAwLCB3aWR0aC5yZWFkKHIpLCBoZWlnaHQucmVhZChyKSkpO1xufVxuXG5leHBvcnQgY2xhc3MgU3RhdHVzQmFyVmlld0l0ZW0gZXh0ZW5kcyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB7XG5cdHByb3RlY3RlZCByZWFkb25seSBfdXBkYXRlTGFiZWxMaXN0ZW5lciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dCgoKSA9PiB7XG5cdFx0dGhpcy51cGRhdGVMYWJlbCgpO1xuXHR9KSk7XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUxhYmVsKCkge1xuXHRcdGNvbnN0IGtiID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyh0aGlzLl9hY3Rpb24uaWQsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLCB0cnVlKTtcblx0XHRpZiAoIWtiKSB7XG5cdFx0XHRyZXR1cm4gc3VwZXIudXBkYXRlTGFiZWwoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMubGFiZWwpIHtcblx0XHRcdGNvbnN0IGRpdiA9IGgoJ2Rpdi5rZXliaW5kaW5nJykucm9vdDtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmdMYWJlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBLZXliaW5kaW5nTGFiZWwoZGl2LCBPUywgeyBkaXNhYmxlVGl0bGU6IHRydWUsIC4uLnVudGhlbWVkS2V5YmluZGluZ0xhYmVsT3B0aW9ucyB9KSk7XG5cdFx0XHRrZXliaW5kaW5nTGFiZWwuc2V0KGtiKTtcblx0XHRcdHRoaXMubGFiZWwudGV4dENvbnRlbnQgPSB0aGlzLl9hY3Rpb24ubGFiZWw7XG5cdFx0XHR0aGlzLmxhYmVsLmFwcGVuZENoaWxkKGRpdik7XG5cdFx0XHR0aGlzLmxhYmVsLmNsYXNzTGlzdC5hZGQoJ2lubGluZVN1Z2dlc3Rpb25TdGF0dXNCYXJJdGVtTGFiZWwnKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlVG9vbHRpcCgpOiB2b2lkIHtcblx0XHQvLyBOT09QLCBkaXNhYmxlIHRvb2x0aXBcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVW5pcXVlVXJpR2VuZXJhdG9yIHtcblx0cHJpdmF0ZSBzdGF0aWMgX21vZGVsSWQgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSBzY2hlbWU6IHN0cmluZ1xuXHQpIHsgfVxuXG5cdHB1YmxpYyBnZXRVbmlxdWVVcmkoKTogVVJJIHtcblx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6IHRoaXMuc2NoZW1lLCBwYXRoOiBuZXcgRGF0ZSgpLnRvU3RyaW5nKCkgKyBTdHJpbmcoVW5pcXVlVXJpR2VuZXJhdG9yLl9tb2RlbElkKyspIH0pO1xuXHR9XG59XG5leHBvcnQgZnVuY3Rpb24gYXBwbHlFZGl0VG9Nb2RpZmllZFJhbmdlTWFwcGluZ3MocmFuZ2VNYXBwaW5nOiBSYW5nZU1hcHBpbmdbXSwgZWRpdDogVGV4dEVkaXQpOiBSYW5nZU1hcHBpbmdbXSB7XG5cdGNvbnN0IHVwZGF0ZWRNYXBwaW5nczogUmFuZ2VNYXBwaW5nW10gPSBbXTtcblx0Zm9yIChjb25zdCBtIG9mIHJhbmdlTWFwcGluZykge1xuXHRcdGNvbnN0IHVwZGF0ZWRSYW5nZSA9IGVkaXQubWFwUmFuZ2UobS5tb2RpZmllZFJhbmdlKTtcblx0XHR1cGRhdGVkTWFwcGluZ3MucHVzaChuZXcgUmFuZ2VNYXBwaW5nKG0ub3JpZ2luYWxSYW5nZSwgdXBkYXRlZFJhbmdlKSk7XG5cdH1cblx0cmV0dXJuIHVwZGF0ZWRNYXBwaW5ncztcbn1cblxuXG5leHBvcnQgZnVuY3Rpb24gY2xhc3NOYW1lcyguLi5jbGFzc2VzOiAoc3RyaW5nIHwgZmFsc2UgfCB1bmRlZmluZWQgfCBudWxsKVtdKSB7XG5cdHJldHVybiBjbGFzc2VzLmZpbHRlcihjID0+IHR5cGVvZiBjID09PSAnc3RyaW5nJykuam9pbignICcpO1xufVxuXG5mdW5jdGlvbiBvZmZzZXRSYW5nZVRvUmFuZ2UoY29sdW1uT2Zmc2V0UmFuZ2U6IE9mZnNldFJhbmdlLCBzdGFydFBvczogUG9zaXRpb24pOiBSYW5nZSB7XG5cdHJldHVybiBuZXcgUmFuZ2UoXG5cdFx0c3RhcnRQb3MubGluZU51bWJlcixcblx0XHRzdGFydFBvcy5jb2x1bW4gKyBjb2x1bW5PZmZzZXRSYW5nZS5zdGFydCxcblx0XHRzdGFydFBvcy5saW5lTnVtYmVyLFxuXHRcdHN0YXJ0UG9zLmNvbHVtbiArIGNvbHVtbk9mZnNldFJhbmdlLmVuZEV4Y2x1c2l2ZSxcblx0KTtcbn1cblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBpbmRlbnRhdGlvbiBzaXplIChpbiBzcGFjZXMpIG9mIGEgZ2l2ZW4gbGluZSxcbiAqIGludGVycHJldGluZyB0YWJzIGFzIHRoZSBzcGVjaWZpZWQgdGFiIHNpemUuXG4gKi9cbmZ1bmN0aW9uIGdldEluZGVudGF0aW9uU2l6ZShsaW5lOiBzdHJpbmcsIHRhYlNpemU6IG51bWJlcik6IG51bWJlciB7XG5cdGxldCBjdXJyZW50U2l6ZSA9IDA7XG5cdGxvb3A6IGZvciAobGV0IGkgPSAwLCBsZW4gPSBsaW5lLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG5cdFx0c3dpdGNoIChsaW5lLmNoYXJDb2RlQXQoaSkpIHtcblx0XHRcdGNhc2UgQ2hhckNvZGUuVGFiOiBjdXJyZW50U2l6ZSArPSB0YWJTaXplOyBicmVhaztcblx0XHRcdGNhc2UgQ2hhckNvZGUuU3BhY2U6IGN1cnJlbnRTaXplKys7IGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDogYnJlYWsgbG9vcDtcblx0XHR9XG5cdH1cblx0Ly8gaWYgY3VycmVudFNpemUgJSB0YWJTaXplICE9PSAwLFxuXHQvLyB0aGVuIHRoZXJlIGFyZSBzcGFjZXMgd2hpY2ggYXJlIG5vdCBwYXJ0IG9mIHRoZSBpbmRlbnRhdGlvblxuXHRyZXR1cm4gY3VycmVudFNpemUgLSAoY3VycmVudFNpemUgJSB0YWJTaXplKTtcbn1cblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBudW1iZXIgb2YgY2hhcmFjdGVycyBhdCB0aGUgc3RhcnQgb2YgYSBsaW5lIHRoYXQgY29ycmVzcG9uZCB0byBhIGdpdmVuIGluZGVudGF0aW9uIHNpemUsXG4gKiB0YWtpbmcgaW50byBhY2NvdW50IGJvdGggdGFicyBhbmQgc3BhY2VzLlxuICovXG5mdW5jdGlvbiBpbmRlbnRTaXplVG9JbmRlbnRMZW5ndGgobGluZTogc3RyaW5nLCBpbmRlbnRTaXplOiBudW1iZXIsIHRhYlNpemU6IG51bWJlcik6IG51bWJlciB7XG5cdGxldCByZW1haW5pbmdTaXplID0gaW5kZW50U2l6ZSAtIChpbmRlbnRTaXplICUgdGFiU2l6ZSk7XG5cdGxldCBpID0gMDtcblx0Zm9yICg7IGkgPCBsaW5lLmxlbmd0aDsgaSsrKSB7XG5cdFx0aWYgKHJlbWFpbmluZ1NpemUgPT09IDApIHtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRzd2l0Y2ggKGxpbmUuY2hhckNvZGVBdChpKSkge1xuXHRcdFx0Y2FzZSBDaGFyQ29kZS5UYWI6IHJlbWFpbmluZ1NpemUgLT0gdGFiU2l6ZTsgYnJlYWs7XG5cdFx0XHRjYXNlIENoYXJDb2RlLlNwYWNlOiByZW1haW5pbmdTaXplLS07IGJyZWFrO1xuXHRcdFx0ZGVmYXVsdDogdGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignVW5leHBlY3RlZCBjaGFyYWN0ZXIgZm91bmQgd2hpbGUgY2FsY3VsYXRpbmcgaW5kZW50IGxlbmd0aCcpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gaTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVJlaW5kZW50RWRpdCh0ZXh0OiBzdHJpbmcsIHJhbmdlOiBMaW5lUmFuZ2UsIHRhYlNpemU6IG51bWJlcik6IFRleHRFZGl0IHtcblx0Y29uc3QgbmV3TGluZXMgPSBzcGxpdExpbmVzKHRleHQpO1xuXHRjb25zdCBlZGl0czogVGV4dFJlcGxhY2VtZW50W10gPSBbXTtcblx0Y29uc3QgbWluSW5kZW50U2l6ZSA9IGZpbmRGaXJzdE1pbihyYW5nZS5tYXBUb0xpbmVBcnJheShsID0+IGdldEluZGVudGF0aW9uU2l6ZShuZXdMaW5lc1tsIC0gMV0sIHRhYlNpemUpKSwgbnVtYmVyQ29tcGFyYXRvcikhO1xuXHRyYW5nZS5mb3JFYWNoKGxpbmVOdW1iZXIgPT4ge1xuXHRcdGNvbnN0IGluZGVudExlbmd0aCA9IGluZGVudFNpemVUb0luZGVudExlbmd0aChuZXdMaW5lc1tsaW5lTnVtYmVyIC0gMV0sIG1pbkluZGVudFNpemUsIHRhYlNpemUpO1xuXHRcdGVkaXRzLnB1c2gobmV3IFRleHRSZXBsYWNlbWVudChvZmZzZXRSYW5nZVRvUmFuZ2UobmV3IE9mZnNldFJhbmdlKDAsIGluZGVudExlbmd0aCksIG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCAxKSksICcnKSk7XG5cdH0pO1xuXHRyZXR1cm4gbmV3IFRleHRFZGl0KGVkaXRzKTtcbn1cblxuZXhwb3J0IGNsYXNzIFBhdGhCdWlsZGVyIHtcblx0cHJpdmF0ZSBfZGF0YTogc3RyaW5nID0gJyc7XG5cblx0cHVibGljIG1vdmVUbyhwb2ludDogUG9pbnQpOiB0aGlzIHtcblx0XHR0aGlzLl9kYXRhICs9IGBNICR7cG9pbnQueH0gJHtwb2ludC55fSBgO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGxpbmVUbyhwb2ludDogUG9pbnQpOiB0aGlzIHtcblx0XHR0aGlzLl9kYXRhICs9IGBMICR7cG9pbnQueH0gJHtwb2ludC55fSBgO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGN1cnZlVG8oY3A6IFBvaW50LCB0bzogUG9pbnQpOiB0aGlzIHtcblx0XHR0aGlzLl9kYXRhICs9IGBRICR7Y3AueH0gJHtjcC55fSAke3RvLnh9ICR7dG8ueX0gYDtcblx0XHRyZXR1cm4gdGhpcztcblx0fVxuXG5cdHB1YmxpYyBjdXJ2ZVRvMihjcDE6IFBvaW50LCBjcDI6IFBvaW50LCB0bzogUG9pbnQpOiB0aGlzIHtcblx0XHR0aGlzLl9kYXRhICs9IGBDICR7Y3AxLnh9ICR7Y3AxLnl9ICR7Y3AyLnh9ICR7Y3AyLnl9ICR7dG8ueH0gJHt0by55fSBgO1xuXHRcdHJldHVybiB0aGlzO1xuXHR9XG5cblx0cHVibGljIGJ1aWxkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2RhdGE7XG5cdH1cbn1cblxuLy8gQXJndW1lbnRzIGFyZSBhIGJpdCBtZXNzeSBjdXJyZW50bHksIGNvdWxkIGJlIGltcHJvdmVkXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlUmVjdGFuZ2xlKFxuXHRsYXlvdXQ6IHsgdG9wTGVmdDogUG9pbnQ7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0sXG5cdHBhZGRpbmc6IG51bWJlciB8IHsgdG9wOiBudW1iZXI7IHJpZ2h0OiBudW1iZXI7IGJvdHRvbTogbnVtYmVyOyBsZWZ0OiBudW1iZXIgfSxcblx0Ym9yZGVyUmFkaXVzOiBudW1iZXIgfCB7IHRvcExlZnQ6IG51bWJlcjsgdG9wUmlnaHQ6IG51bWJlcjsgYm90dG9tTGVmdDogbnVtYmVyOyBib3R0b21SaWdodDogbnVtYmVyIH0sXG5cdG9wdGlvbnM6IHsgaGlkZUxlZnQ/OiBib29sZWFuOyBoaWRlUmlnaHQ/OiBib29sZWFuOyBoaWRlVG9wPzogYm9vbGVhbjsgaGlkZUJvdHRvbT86IGJvb2xlYW4gfSA9IHt9XG4pOiBzdHJpbmcge1xuXG5cdGNvbnN0IHRvcExlZnRJbm5lciA9IGxheW91dC50b3BMZWZ0O1xuXHRjb25zdCB0b3BSaWdodElubmVyID0gdG9wTGVmdElubmVyLmRlbHRhWChsYXlvdXQud2lkdGgpO1xuXHRjb25zdCBib3R0b21MZWZ0SW5uZXIgPSB0b3BMZWZ0SW5uZXIuZGVsdGFZKGxheW91dC5oZWlnaHQpO1xuXHRjb25zdCBib3R0b21SaWdodElubmVyID0gYm90dG9tTGVmdElubmVyLmRlbHRhWChsYXlvdXQud2lkdGgpO1xuXG5cdC8vIHBhZGRpbmdcblx0Y29uc3QgeyB0b3A6IHBhZGRpbmdUb3AsIGJvdHRvbTogcGFkZGluZ0JvdHRvbSwgbGVmdDogcGFkZGluZ0xlZnQsIHJpZ2h0OiBwYWRkaW5nUmlnaHQgfSA9IHR5cGVvZiBwYWRkaW5nID09PSAnbnVtYmVyJyA/XG5cdFx0eyB0b3A6IHBhZGRpbmcsIGJvdHRvbTogcGFkZGluZywgbGVmdDogcGFkZGluZywgcmlnaHQ6IHBhZGRpbmcgfVxuXHRcdDogcGFkZGluZztcblxuXHQvLyBjb3JuZXIgcmFkaXVzXG5cdGNvbnN0IHsgdG9wTGVmdDogcmFkaXVzVEwsIHRvcFJpZ2h0OiByYWRpdXNUUiwgYm90dG9tTGVmdDogcmFkaXVzQkwsIGJvdHRvbVJpZ2h0OiByYWRpdXNCUiB9ID0gdHlwZW9mIGJvcmRlclJhZGl1cyA9PT0gJ251bWJlcicgP1xuXHRcdHsgdG9wTGVmdDogYm9yZGVyUmFkaXVzLCB0b3BSaWdodDogYm9yZGVyUmFkaXVzLCBib3R0b21MZWZ0OiBib3JkZXJSYWRpdXMsIGJvdHRvbVJpZ2h0OiBib3JkZXJSYWRpdXMgfSA6XG5cdFx0Ym9yZGVyUmFkaXVzO1xuXG5cdGNvbnN0IHRvdGFsSGVpZ2h0ID0gbGF5b3V0LmhlaWdodCArIHBhZGRpbmdUb3AgKyBwYWRkaW5nQm90dG9tO1xuXHRjb25zdCB0b3RhbFdpZHRoID0gbGF5b3V0LndpZHRoICsgcGFkZGluZ0xlZnQgKyBwYWRkaW5nUmlnaHQ7XG5cblx0Ly8gVGhlIHBhdGggaXMgZHJhd24gZnJvbSBib3R0b20gbGVmdCBhdCB0aGUgZW5kIG9mIHRoZSByb3VuZGVkIGNvcm5lciBpbiBhIGNsb2Nrd2lzZSBkaXJlY3Rpb25cblx0Ly8gQmVmb3JlOiBiZWZvcmUgdGhlIHJvdW5kZWQgY29ybmVyXG5cdC8vIEFmdGVyOiBhZnRlciB0aGUgcm91bmRlZCBjb3JuZXJcblx0Y29uc3QgdG9wTGVmdCA9IHRvcExlZnRJbm5lci5kZWx0YVgoLXBhZGRpbmdMZWZ0KS5kZWx0YVkoLXBhZGRpbmdUb3ApO1xuXHRjb25zdCB0b3BSaWdodCA9IHRvcFJpZ2h0SW5uZXIuZGVsdGFYKHBhZGRpbmdSaWdodCkuZGVsdGFZKC1wYWRkaW5nVG9wKTtcblx0Y29uc3QgdG9wTGVmdEJlZm9yZSA9IHRvcExlZnQuZGVsdGFZKE1hdGgubWluKHJhZGl1c1RMLCB0b3RhbEhlaWdodCAvIDIpKTtcblx0Y29uc3QgdG9wTGVmdEFmdGVyID0gdG9wTGVmdC5kZWx0YVgoTWF0aC5taW4ocmFkaXVzVEwsIHRvdGFsV2lkdGggLyAyKSk7XG5cdGNvbnN0IHRvcFJpZ2h0QmVmb3JlID0gdG9wUmlnaHQuZGVsdGFYKC1NYXRoLm1pbihyYWRpdXNUUiwgdG90YWxXaWR0aCAvIDIpKTtcblx0Y29uc3QgdG9wUmlnaHRBZnRlciA9IHRvcFJpZ2h0LmRlbHRhWShNYXRoLm1pbihyYWRpdXNUUiwgdG90YWxIZWlnaHQgLyAyKSk7XG5cblx0Y29uc3QgYm90dG9tTGVmdCA9IGJvdHRvbUxlZnRJbm5lci5kZWx0YVgoLXBhZGRpbmdMZWZ0KS5kZWx0YVkocGFkZGluZ0JvdHRvbSk7XG5cdGNvbnN0IGJvdHRvbVJpZ2h0ID0gYm90dG9tUmlnaHRJbm5lci5kZWx0YVgocGFkZGluZ1JpZ2h0KS5kZWx0YVkocGFkZGluZ0JvdHRvbSk7XG5cdGNvbnN0IGJvdHRvbUxlZnRCZWZvcmUgPSBib3R0b21MZWZ0LmRlbHRhWChNYXRoLm1pbihyYWRpdXNCTCwgdG90YWxXaWR0aCAvIDIpKTtcblx0Y29uc3QgYm90dG9tTGVmdEFmdGVyID0gYm90dG9tTGVmdC5kZWx0YVkoLU1hdGgubWluKHJhZGl1c0JMLCB0b3RhbEhlaWdodCAvIDIpKTtcblx0Y29uc3QgYm90dG9tUmlnaHRCZWZvcmUgPSBib3R0b21SaWdodC5kZWx0YVkoLU1hdGgubWluKHJhZGl1c0JSLCB0b3RhbEhlaWdodCAvIDIpKTtcblx0Y29uc3QgYm90dG9tUmlnaHRBZnRlciA9IGJvdHRvbVJpZ2h0LmRlbHRhWCgtTWF0aC5taW4ocmFkaXVzQlIsIHRvdGFsV2lkdGggLyAyKSk7XG5cblx0Y29uc3QgcGF0aCA9IG5ldyBQYXRoQnVpbGRlcigpO1xuXG5cdGlmICghb3B0aW9ucy5oaWRlTGVmdCkge1xuXHRcdHBhdGgubW92ZVRvKGJvdHRvbUxlZnRBZnRlcikubGluZVRvKHRvcExlZnRCZWZvcmUpO1xuXHR9XG5cblx0aWYgKCFvcHRpb25zLmhpZGVMZWZ0ICYmICFvcHRpb25zLmhpZGVUb3ApIHtcblx0XHRwYXRoLmN1cnZlVG8odG9wTGVmdCwgdG9wTGVmdEFmdGVyKTtcblx0fSBlbHNlIHtcblx0XHRwYXRoLm1vdmVUbyh0b3BMZWZ0QWZ0ZXIpO1xuXHR9XG5cblx0aWYgKCFvcHRpb25zLmhpZGVUb3ApIHtcblx0XHRwYXRoLmxpbmVUbyh0b3BSaWdodEJlZm9yZSk7XG5cdH1cblxuXHRpZiAoIW9wdGlvbnMuaGlkZVRvcCAmJiAhb3B0aW9ucy5oaWRlUmlnaHQpIHtcblx0XHRwYXRoLmN1cnZlVG8odG9wUmlnaHQsIHRvcFJpZ2h0QWZ0ZXIpO1xuXHR9IGVsc2Uge1xuXHRcdHBhdGgubW92ZVRvKHRvcFJpZ2h0QWZ0ZXIpO1xuXHR9XG5cblx0aWYgKCFvcHRpb25zLmhpZGVSaWdodCkge1xuXHRcdHBhdGgubGluZVRvKGJvdHRvbVJpZ2h0QmVmb3JlKTtcblx0fVxuXG5cdGlmICghb3B0aW9ucy5oaWRlUmlnaHQgJiYgIW9wdGlvbnMuaGlkZUJvdHRvbSkge1xuXHRcdHBhdGguY3VydmVUbyhib3R0b21SaWdodCwgYm90dG9tUmlnaHRBZnRlcik7XG5cdH0gZWxzZSB7XG5cdFx0cGF0aC5tb3ZlVG8oYm90dG9tUmlnaHRBZnRlcik7XG5cdH1cblxuXHRpZiAoIW9wdGlvbnMuaGlkZUJvdHRvbSkge1xuXHRcdHBhdGgubGluZVRvKGJvdHRvbUxlZnRCZWZvcmUpO1xuXHR9XG5cblx0aWYgKCFvcHRpb25zLmhpZGVCb3R0b20gJiYgIW9wdGlvbnMuaGlkZUxlZnQpIHtcblx0XHRwYXRoLmN1cnZlVG8oYm90dG9tTGVmdCwgYm90dG9tTGVmdEFmdGVyKTtcblx0fSBlbHNlIHtcblx0XHRwYXRoLm1vdmVUbyhib3R0b21MZWZ0QWZ0ZXIpO1xuXHR9XG5cblx0cmV0dXJuIHBhdGguYnVpbGQoKTtcbn1cblxudHlwZSBSZW1vdmVGYWxzeTxUPiA9IFQgZXh0ZW5kcyBmYWxzZSB8IHVuZGVmaW5lZCB8IG51bGwgPyBuZXZlciA6IFQ7XG50eXBlIEZhbHN5PFQ+ID0gVCBleHRlbmRzIGZhbHNlIHwgdW5kZWZpbmVkIHwgbnVsbCA/IFQgOiBuZXZlcjtcblxuZXhwb3J0IGZ1bmN0aW9uIG1hcE91dEZhbHN5PFQ+KG9iczogSU9ic2VydmFibGU8VD4pOiBJT2JzZXJ2YWJsZTxJT2JzZXJ2YWJsZTxSZW1vdmVGYWxzeTxUPj4gfCBGYWxzeTxUPj4ge1xuXHRjb25zdCBub25VbmRlZmluZWRPYnMgPSBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZTxUIHwgdW5kZWZpbmVkIHwgbnVsbCB8IGZhbHNlPih1bmRlZmluZWQsIChyZWFkZXIsIGxhc3RWYWx1ZSkgPT4gb2JzLnJlYWQocmVhZGVyKSB8fCBsYXN0VmFsdWUpO1xuXG5cdHJldHVybiBkZXJpdmVkT3B0cyh7XG5cdFx0ZGVidWdOYW1lOiAoKSA9PiBgJHtvYnMuZGVidWdOYW1lfS5tYXBPdXRGYWxzeWBcblx0fSwgcmVhZGVyID0+IHtcblx0XHRub25VbmRlZmluZWRPYnMucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IHZhbCA9IG9icy5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCF2YWwpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQgYXMgRmFsc3k8VD47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5vblVuZGVmaW5lZE9icyBhcyBJT2JzZXJ2YWJsZTxSZW1vdmVGYWxzeTxUPj47XG5cdH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gb2JzZXJ2ZUVsZW1lbnRQb3NpdGlvbihlbGVtZW50OiBIVE1MRWxlbWVudCwgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSkge1xuXHRjb25zdCB0b3BMZWZ0ID0gZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbihlbGVtZW50KTtcblx0Y29uc3QgdG9wID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlcj4oJ3RvcCcsIHRvcExlZnQudG9wKTtcblx0Y29uc3QgbGVmdCA9IG9ic2VydmFibGVWYWx1ZTxudW1iZXI+KCdsZWZ0JywgdG9wTGVmdC5sZWZ0KTtcblxuXHRjb25zdCByZXNpemVPYnNlcnZlciA9IG5ldyBSZXNpemVPYnNlcnZlcigoKSA9PiB7XG5cdFx0dHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0Y29uc3QgdG9wTGVmdCA9IGdldERvbU5vZGVQYWdlUG9zaXRpb24oZWxlbWVudCk7XG5cdFx0XHR0b3Auc2V0KHRvcExlZnQudG9wLCB0eCk7XG5cdFx0XHRsZWZ0LnNldCh0b3BMZWZ0LmxlZnQsIHR4KTtcblx0XHR9KTtcblx0fSk7XG5cblx0cmVzaXplT2JzZXJ2ZXIub2JzZXJ2ZShlbGVtZW50KTtcblxuXHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHJlc2l6ZU9ic2VydmVyLmRpc2Nvbm5lY3QoKSkpO1xuXG5cdHJldHVybiB7XG5cdFx0dG9wLFxuXHRcdGxlZnRcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlY3RUb1Byb3BzKGZuOiAocmVhZGVyOiBJUmVhZGVyKSA9PiBSZWN0IHwgdW5kZWZpbmVkLCBkZWJ1Z0xvY2F0aW9uOiBEZWJ1Z0xvY2F0aW9uID0gRGVidWdMb2NhdGlvbi5vZkNhbGxlcigpKSB7XG5cdHJldHVybiB7XG5cdFx0bGVmdDogZGVyaXZlZCh7IG5hbWU6ICdlZGl0b3IudmFsaWRPdmVybGF5LmxlZnQnIH0sIHJlYWRlciA9PiAvKiogQGRlc2NyaXB0aW9uIGxlZnQgKi8gZm4ocmVhZGVyKT8ubGVmdCwgZGVidWdMb2NhdGlvbiksXG5cdFx0dG9wOiBkZXJpdmVkKHsgbmFtZTogJ2VkaXRvci52YWxpZE92ZXJsYXkudG9wJyB9LCByZWFkZXIgPT4gLyoqIEBkZXNjcmlwdGlvbiB0b3AgKi8gZm4ocmVhZGVyKT8udG9wLCBkZWJ1Z0xvY2F0aW9uKSxcblx0XHR3aWR0aDogZGVyaXZlZCh7IG5hbWU6ICdlZGl0b3IudmFsaWRPdmVybGF5LndpZHRoJyB9LCByZWFkZXIgPT4ge1xuXHRcdFx0LyoqIEBkZXNjcmlwdGlvbiB3aWR0aCAqL1xuXHRcdFx0Y29uc3QgdmFsID0gZm4ocmVhZGVyKTtcblx0XHRcdGlmICghdmFsKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdmFsLndpZHRoO1xuXHRcdH0sIGRlYnVnTG9jYXRpb24pLFxuXHRcdGhlaWdodDogZGVyaXZlZCh7IG5hbWU6ICdlZGl0b3IudmFsaWRPdmVybGF5LmhlaWdodCcgfSwgcmVhZGVyID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gaGVpZ2h0ICovXG5cdFx0XHRjb25zdCB2YWwgPSBmbihyZWFkZXIpO1xuXHRcdFx0aWYgKCF2YWwpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB2YWwuaGVpZ2h0O1xuXHRcdH0sIGRlYnVnTG9jYXRpb24pLFxuXHR9O1xufVxuXG5leHBvcnQgdHlwZSBGaXJzdEZuQXJnPFQ+ID0gVCBleHRlbmRzIChhcmc6IGluZmVyIFUpID0+IGFueSA/IFUgOiBuZXZlcjtcblxuXG5leHBvcnQgZnVuY3Rpb24gb2JzZXJ2ZUVkaXRvckJvdW5kaW5nQ2xpZW50UmVjdChlZGl0b3I6IElDb2RlRWRpdG9yLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogSU9ic2VydmFibGU8RE9NUmVjdFJlYWRPbmx5PiB7XG5cdGNvbnN0IGRvbSA9IGVkaXRvci5nZXRDb250YWluZXJEb21Ob2RlKCkhO1xuXHRjb25zdCBpbml0aWFsRG9tUmVjdCA9IG9ic2VydmFibGVWYWx1ZSgnZG9tUmVjdCcsIGRvbS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSk7XG5cdHN0b3JlLmFkZChlZGl0b3Iub25EaWRMYXlvdXRDaGFuZ2UoZSA9PiB7XG5cdFx0aW5pdGlhbERvbVJlY3Quc2V0KGRvbS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSwgdW5kZWZpbmVkKTtcblx0fSkpO1xuXHRyZXR1cm4gaW5pdGlhbERvbVJlY3Q7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLHdCQUF3QixTQUFTO0FBQzFDLFNBQVMsaUJBQWlCLHNDQUFzQztBQUNoRSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLG9CQUFvQjtB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
