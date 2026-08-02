import * as dom from "../../../../base/browser/dom.js";
import { createTrustedTypesPolicy } from "../../../../base/browser/trustedTypes.js";
import { equals } from "../../../../base/common/arrays.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import "./stickyScroll.css";
import { OverlayWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { getColumnOfNodeOffset } from "../../../browser/viewParts/viewLines/viewLine.js";
import { EmbeddedCodeEditorWidget } from "../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { EditorOption, RenderLineNumbersType } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { StringBuilder } from "../../../common/core/stringBuilder.js";
import { LineDecoration } from "../../../common/viewLayout/lineDecorations.js";
import { RenderLineInput, renderViewLine } from "../../../common/viewLayout/viewLineRenderer.js";
import { foldingCollapsedIcon, foldingExpandedIcon } from "../../folding/browser/foldingDecorations.js";
import { Emitter } from "../../../../base/common/event.js";
class StickyScrollWidgetState {
  constructor(startLineNumbers, endLineNumbers, lastLineRelativePosition, showEndForLine = null) {
    this.startLineNumbers = startLineNumbers;
    this.endLineNumbers = endLineNumbers;
    this.lastLineRelativePosition = lastLineRelativePosition;
    this.showEndForLine = showEndForLine;
  }
  equals(other) {
    return !!other && this.lastLineRelativePosition === other.lastLineRelativePosition && this.showEndForLine === other.showEndForLine && equals(this.startLineNumbers, other.startLineNumbers) && equals(this.endLineNumbers, other.endLineNumbers);
  }
  static get Empty() {
    return new StickyScrollWidgetState([], [], 0);
  }
}
const _ttPolicy = createTrustedTypesPolicy("stickyScrollViewLayer", { createHTML: (value) => value });
const STICKY_INDEX_ATTR = "data-sticky-line-index";
const STICKY_IS_LINE_ATTR = "data-sticky-is-line";
const STICKY_IS_LINE_NUMBER_ATTR = "data-sticky-is-line-number";
const STICKY_IS_FOLDING_ICON_ATTR = "data-sticky-is-folding-icon";
class StickyScrollWidget extends Disposable {
  constructor(editor) {
    super();
    this._foldingIconStore = this._register(new DisposableStore());
    this._rootDomNode = document.createElement("div");
    this._lineNumbersDomNode = document.createElement("div");
    this._linesDomNodeScrollable = document.createElement("div");
    this._linesDomNode = document.createElement("div");
    this._renderedStickyLines = [];
    this._lineNumbers = [];
    this._lastLineRelativePosition = 0;
    this._minContentWidthInPx = 0;
    this._isOnGlyphMargin = false;
    this._height = -1;
    this._onDidChangeStickyScrollHeight = this._register(new Emitter());
    this.onDidChangeStickyScrollHeight = this._onDidChangeStickyScrollHeight.event;
    this._editor = editor;
    this._lineNumbersDomNode.className = "sticky-widget-line-numbers";
    this._lineNumbersDomNode.setAttribute("role", "none");
    this._linesDomNode.className = "sticky-widget-lines";
    this._linesDomNode.setAttribute("role", "list");
    this._linesDomNodeScrollable.className = "sticky-widget-lines-scrollable";
    this._linesDomNodeScrollable.appendChild(this._linesDomNode);
    this._rootDomNode.className = "sticky-widget";
    this._rootDomNode.classList.toggle("peek", editor instanceof EmbeddedCodeEditorWidget);
    this._rootDomNode.appendChild(this._lineNumbersDomNode);
    this._rootDomNode.appendChild(this._linesDomNodeScrollable);
    this._setHeight(0);
    const updateScrollLeftPosition = () => {
      this._linesDomNode.style.left = this._editor.getOption(EditorOption.stickyScroll).scrollWithEditor ? `-${this._editor.getScrollLeft()}px` : "0px";
    };
    this._register(this._editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.stickyScroll)) {
        updateScrollLeftPosition();
      }
    }));
    this._register(this._editor.onDidScrollChange((e) => {
      if (e.scrollLeftChanged) {
        updateScrollLeftPosition();
      }
      if (e.scrollWidthChanged) {
        this._updateWidgetWidth();
      }
    }));
    this._register(this._editor.onDidChangeModel(() => {
      updateScrollLeftPosition();
      this._updateWidgetWidth();
    }));
    updateScrollLeftPosition();
    this._register(this._editor.onDidLayoutChange((e) => {
      this._updateWidgetWidth();
    }));
    this._updateWidgetWidth();
  }
  get height() {
    return this._height;
  }
  get lineNumbers() {
    return this._lineNumbers;
  }
  get lineNumberCount() {
    return this._lineNumbers.length;
  }
  getRenderedStickyLine(lineNumber) {
    return this._renderedStickyLines.find((stickyLine) => stickyLine.lineNumber === lineNumber);
  }
  getCurrentLines() {
    return this._lineNumbers;
  }
  setState(state, foldingModel, rebuildFromIndexCandidate) {
    const currentStateAndPreviousStateUndefined = !this._state && !state;
    const currentStateDefinedAndEqualsPreviousState = this._state && this._state.equals(state);
    if (rebuildFromIndexCandidate === void 0 && (currentStateAndPreviousStateUndefined || currentStateDefinedAndEqualsPreviousState)) {
      return;
    }
    const data = this._findRenderingData(state);
    const previousLineNumbers = this._lineNumbers;
    this._lineNumbers = data.lineNumbers;
    this._lastLineRelativePosition = data.lastLineRelativePosition;
    const rebuildFromIndex = this._findIndexToRebuildFrom(previousLineNumbers, this._lineNumbers, rebuildFromIndexCandidate);
    this._renderRootNode(this._lineNumbers, this._lastLineRelativePosition, foldingModel, rebuildFromIndex);
    this._state = state;
  }
  _findRenderingData(state) {
    if (!state) {
      return { lineNumbers: [], lastLineRelativePosition: 0 };
    }
    const candidateLineNumbers = [...state.startLineNumbers];
    if (state.showEndForLine !== null) {
      candidateLineNumbers[state.showEndForLine] = state.endLineNumbers[state.showEndForLine];
    }
    let totalHeight = 0;
    for (let i = 0; i < candidateLineNumbers.length; i++) {
      const position = new Position(candidateLineNumbers[i], 1);
      const viewModel = this._editor._getViewModel();
      if (viewModel && position.lineNumber <= viewModel.getLineCount()) {
        totalHeight += this._editor.getLineHeightForPosition(new Position(candidateLineNumbers[i], 1));
      }
    }
    if (totalHeight === 0) {
      return { lineNumbers: [], lastLineRelativePosition: 0 };
    }
    return { lineNumbers: candidateLineNumbers, lastLineRelativePosition: state.lastLineRelativePosition };
  }
  _findIndexToRebuildFrom(previousLineNumbers, newLineNumbers, rebuildFromIndexCandidate) {
    if (newLineNumbers.length === 0) {
      return 0;
    }
    if (rebuildFromIndexCandidate !== void 0) {
      return rebuildFromIndexCandidate;
    }
    const validIndex = newLineNumbers.findIndex((startLineNumber) => !previousLineNumbers.includes(startLineNumber));
    return validIndex === -1 ? 0 : validIndex;
  }
  _updateWidgetWidth() {
    const layoutInfo = this._editor.getLayoutInfo();
    const lineNumbersWidth = layoutInfo.contentLeft;
    this._lineNumbersDomNode.style.width = `${lineNumbersWidth}px`;
    this._linesDomNodeScrollable.style.setProperty("--vscode-editorStickyScroll-scrollableWidth", `${this._editor.getScrollWidth() - layoutInfo.verticalScrollbarWidth}px`);
    this._rootDomNode.style.width = `${layoutInfo.width - layoutInfo.verticalScrollbarWidth}px`;
  }
  _useFoldingOpacityTransition(requireTransitions) {
    this._lineNumbersDomNode.style.setProperty("--vscode-editorStickyScroll-foldingOpacityTransition", `opacity ${requireTransitions ? 0.5 : 0}s`);
  }
  _setFoldingIconsVisibility(allVisible) {
    for (const line of this._renderedStickyLines) {
      const foldingIcon = line.foldingIcon;
      if (!foldingIcon) {
        continue;
      }
      foldingIcon.setVisible(allVisible ? true : foldingIcon.isCollapsed);
    }
  }
  async _renderRootNode(lineNumbers, lastLineRelativePosition, foldingModel, rebuildFromIndex) {
    const viewModel = this._editor._getViewModel();
    if (!viewModel) {
      this._clearWidget();
      return;
    }
    if (lineNumbers.length === 0) {
      this._clearWidget();
      return;
    }
    const renderedStickyLines = [];
    const lastLineNumber = lineNumbers[lineNumbers.length - 1];
    let top = 0;
    for (let i = 0; i < this._renderedStickyLines.length; i++) {
      if (i < rebuildFromIndex) {
        const renderedLine = this._renderedStickyLines[i];
        renderedStickyLines.push(this._updatePosition(renderedLine, top, renderedLine.lineNumber === lastLineNumber));
        top += renderedLine.height;
      } else {
        const renderedLine = this._renderedStickyLines[i];
        renderedLine.lineNumberDomNode.remove();
        renderedLine.lineDomNode.remove();
      }
    }
    const layoutInfo = this._editor.getLayoutInfo();
    for (let i = rebuildFromIndex; i < lineNumbers.length; i++) {
      const lineNumber = lineNumbers[i];
      if (lineNumber > viewModel.getLineCount()) {
        continue;
      }
      const stickyLine = this._renderChildNode(viewModel, i, lineNumber, top, lastLineNumber === lineNumber, foldingModel, layoutInfo);
      top += stickyLine.height;
      this._linesDomNode.appendChild(stickyLine.lineDomNode);
      this._lineNumbersDomNode.appendChild(stickyLine.lineNumberDomNode);
      renderedStickyLines.push(stickyLine);
    }
    if (foldingModel) {
      this._setFoldingHoverListeners();
      this._useFoldingOpacityTransition(!this._isOnGlyphMargin);
    }
    this._minContentWidthInPx = Math.max(...this._renderedStickyLines.map((l) => l.scrollWidth)) + layoutInfo.verticalScrollbarWidth;
    this._renderedStickyLines = renderedStickyLines;
    this._setHeight(top + lastLineRelativePosition);
    this._editor.layoutOverlayWidget(this);
  }
  _clearWidget() {
    for (let i = 0; i < this._renderedStickyLines.length; i++) {
      const stickyLine = this._renderedStickyLines[i];
      stickyLine.lineNumberDomNode.remove();
      stickyLine.lineDomNode.remove();
    }
    this._setHeight(0);
  }
  _setHeight(height) {
    if (this._height === height) {
      return;
    }
    this._height = height;
    if (this._height === 0) {
      this._rootDomNode.style.display = "none";
    } else {
      this._rootDomNode.style.display = "block";
      this._lineNumbersDomNode.style.height = `${this._height}px`;
      this._linesDomNodeScrollable.style.height = `${this._height}px`;
      this._rootDomNode.style.height = `${this._height}px`;
    }
    this._onDidChangeStickyScrollHeight.fire({ height: this._height });
  }
  _setFoldingHoverListeners() {
    this._foldingIconStore.clear();
    const showFoldingControls = this._editor.getOption(EditorOption.showFoldingControls);
    if (showFoldingControls !== "mouseover") {
      return;
    }
    this._foldingIconStore.clear();
    this._foldingIconStore.add(dom.addDisposableListener(this._lineNumbersDomNode, dom.EventType.MOUSE_ENTER, () => {
      this._isOnGlyphMargin = true;
      this._setFoldingIconsVisibility(true);
    }));
    this._foldingIconStore.add(dom.addDisposableListener(this._lineNumbersDomNode, dom.EventType.MOUSE_LEAVE, () => {
      this._isOnGlyphMargin = false;
      this._useFoldingOpacityTransition(true);
      this._setFoldingIconsVisibility(false);
    }));
  }
  _renderChildNode(viewModel, index, line, top, isLastLine, foldingModel, layoutInfo) {
    const renderedLine = new RenderedStickyLine(
      this._editor,
      viewModel,
      layoutInfo,
      foldingModel,
      this._isOnGlyphMargin,
      index,
      line
    );
    return this._updatePosition(renderedLine, top, isLastLine);
  }
  _updatePosition(stickyLine, top, isLastLine) {
    const lineHTMLNode = stickyLine.lineDomNode;
    const lineNumberHTMLNode = stickyLine.lineNumberDomNode;
    if (isLastLine) {
      const zIndex = "0";
      lineHTMLNode.style.zIndex = zIndex;
      lineNumberHTMLNode.style.zIndex = zIndex;
      const updatedTop = `${top + this._lastLineRelativePosition + (stickyLine.foldingIcon?.isCollapsed ? 1 : 0)}px`;
      lineHTMLNode.style.top = updatedTop;
      lineNumberHTMLNode.style.top = updatedTop;
    } else {
      const zIndex = "1";
      lineHTMLNode.style.zIndex = zIndex;
      lineNumberHTMLNode.style.zIndex = zIndex;
      lineHTMLNode.style.top = `${top}px`;
      lineNumberHTMLNode.style.top = `${top}px`;
    }
    return stickyLine;
  }
  getId() {
    return "editor.contrib.stickyScrollWidget";
  }
  getDomNode() {
    return this._rootDomNode;
  }
  getPosition() {
    return {
      preference: OverlayWidgetPositionPreference.TOP_CENTER,
      stackOrdinal: 10
    };
  }
  getMinContentWidthInPx() {
    return this._minContentWidthInPx;
  }
  focusLineWithIndex(index) {
    if (0 <= index && index < this._renderedStickyLines.length) {
      this._renderedStickyLines[index].lineDomNode.focus();
    }
  }
  /**
   * Given a leaf dom node, tries to find the editor position.
   */
  getEditorPositionFromNode(spanDomNode) {
    if (!spanDomNode || spanDomNode.children.length > 0) {
      return null;
    }
    const renderedStickyLine = this._getRenderedStickyLineFromChildDomNode(spanDomNode);
    if (!renderedStickyLine) {
      return null;
    }
    const column = getColumnOfNodeOffset(renderedStickyLine.characterMapping, spanDomNode, 0);
    return new Position(renderedStickyLine.lineNumber, column);
  }
  getLineNumberFromChildDomNode(domNode) {
    return this._getRenderedStickyLineFromChildDomNode(domNode)?.lineNumber ?? null;
  }
  _getRenderedStickyLineFromChildDomNode(domNode) {
    const index = this.getLineIndexFromChildDomNode(domNode);
    if (index === null || index < 0 || index >= this._renderedStickyLines.length) {
      return null;
    }
    return this._renderedStickyLines[index];
  }
  /**
   * Given a child dom node, tries to find the line number attribute that was stored in the node.
   * @returns the attribute value or null if none is found.
   */
  getLineIndexFromChildDomNode(domNode) {
    const lineIndex = this._getAttributeValue(domNode, STICKY_INDEX_ATTR);
    return lineIndex ? parseInt(lineIndex, 10) : null;
  }
  /**
   * Given a child dom node, tries to find if it is (contained in) a sticky line.
   * @returns a boolean.
   */
  isInStickyLine(domNode) {
    const isInLine = this._getAttributeValue(domNode, STICKY_IS_LINE_ATTR);
    return isInLine !== void 0;
  }
  /**
   * Given a child dom node, tries to find if this dom node is (contained in) a sticky folding icon.
   * @returns a boolean.
   */
  isInFoldingIconDomNode(domNode) {
    const isInFoldingIcon = this._getAttributeValue(domNode, STICKY_IS_FOLDING_ICON_ATTR);
    return isInFoldingIcon !== void 0;
  }
  /**
   * Given the dom node, finds if it or its parent sequence contains the given attribute.
   * @returns the attribute value or undefined.
   */
  _getAttributeValue(domNode, attribute) {
    while (domNode && domNode !== this._rootDomNode) {
      const line = domNode.getAttribute(attribute);
      if (line !== null) {
        return line;
      }
      domNode = domNode.parentElement;
    }
    return;
  }
}
class RenderedStickyLine {
  constructor(editor, viewModel, layoutInfo, foldingModel, isOnGlyphMargin, index, lineNumber) {
    this.index = index;
    this.lineNumber = lineNumber;
    const viewLineNumber = viewModel.coordinatesConverter.convertModelPositionToViewPosition(new Position(lineNumber, 1)).lineNumber;
    const lineRenderingData = viewModel.getViewLineRenderingData(viewLineNumber);
    const lineNumberOption = editor.getOption(EditorOption.lineNumbers);
    const verticalScrollbarSize = editor.getOption(EditorOption.scrollbar).verticalScrollbarSize;
    let actualInlineDecorations;
    try {
      actualInlineDecorations = LineDecoration.filter(lineRenderingData.inlineDecorations, viewLineNumber, lineRenderingData.minColumn, lineRenderingData.maxColumn);
    } catch (err) {
      actualInlineDecorations = [];
    }
    const lineHeight = editor.getLineHeightForPosition(new Position(lineNumber, 1));
    const textDirection = viewModel.getTextDirection(lineNumber);
    const renderLineInput = new RenderLineInput(
      true,
      true,
      lineRenderingData.content,
      lineRenderingData.continuesWithWrappedLine,
      lineRenderingData.isBasicASCII,
      lineRenderingData.containsRTL,
      0,
      lineRenderingData.tokens,
      actualInlineDecorations,
      lineRenderingData.tabSize,
      lineRenderingData.startVisibleColumn,
      1,
      1,
      1,
      500,
      "none",
      true,
      true,
      null,
      textDirection,
      verticalScrollbarSize
    );
    const sb = new StringBuilder(2e3);
    const renderOutput = renderViewLine(renderLineInput, sb);
    this.characterMapping = renderOutput.characterMapping;
    let newLine;
    if (_ttPolicy) {
      newLine = _ttPolicy.createHTML(sb.build());
    } else {
      newLine = sb.build();
    }
    const lineHTMLNode = document.createElement("span");
    lineHTMLNode.setAttribute(STICKY_INDEX_ATTR, String(index));
    lineHTMLNode.setAttribute(STICKY_IS_LINE_ATTR, "");
    lineHTMLNode.setAttribute("role", "listitem");
    lineHTMLNode.tabIndex = 0;
    lineHTMLNode.className = "sticky-line-content";
    lineHTMLNode.classList.add(`stickyLine${lineNumber}`);
    lineHTMLNode.style.lineHeight = `${lineHeight}px`;
    lineHTMLNode.innerHTML = newLine;
    const lineNumberHTMLNode = document.createElement("span");
    lineNumberHTMLNode.setAttribute(STICKY_INDEX_ATTR, String(index));
    lineNumberHTMLNode.setAttribute(STICKY_IS_LINE_NUMBER_ATTR, "");
    lineNumberHTMLNode.className = "sticky-line-number";
    lineNumberHTMLNode.style.lineHeight = `${lineHeight}px`;
    const lineNumbersWidth = layoutInfo.contentLeft;
    lineNumberHTMLNode.style.width = `${lineNumbersWidth}px`;
    const innerLineNumberHTML = document.createElement("span");
    if (lineNumberOption.renderType === RenderLineNumbersType.On || lineNumberOption.renderType === RenderLineNumbersType.Interval && lineNumber % 10 === 0) {
      innerLineNumberHTML.innerText = lineNumber.toString();
    } else if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
      innerLineNumberHTML.innerText = Math.abs(lineNumber - editor.getPosition().lineNumber).toString();
    }
    innerLineNumberHTML.className = "sticky-line-number-inner";
    innerLineNumberHTML.style.width = `${layoutInfo.lineNumbersWidth}px`;
    innerLineNumberHTML.style.paddingLeft = `${layoutInfo.lineNumbersLeft}px`;
    lineNumberHTMLNode.appendChild(innerLineNumberHTML);
    this.foldingIcon = this._renderFoldingIconForLine(editor, foldingModel, lineNumber, lineHeight, isOnGlyphMargin);
    if (this.foldingIcon) {
      lineNumberHTMLNode.appendChild(this.foldingIcon.domNode);
      this.foldingIcon.domNode.style.left = `${layoutInfo.lineNumbersWidth + layoutInfo.lineNumbersLeft}px`;
      this.foldingIcon.domNode.style.lineHeight = `${lineHeight}px`;
    }
    editor.applyFontInfo(lineHTMLNode);
    editor.applyFontInfo(lineNumberHTMLNode);
    lineNumberHTMLNode.style.lineHeight = `${lineHeight}px`;
    lineHTMLNode.style.lineHeight = `${lineHeight}px`;
    lineNumberHTMLNode.style.height = `${lineHeight}px`;
    lineHTMLNode.style.height = `${lineHeight}px`;
    this.scrollWidth = lineHTMLNode.scrollWidth;
    this.lineDomNode = lineHTMLNode;
    this.lineNumberDomNode = lineNumberHTMLNode;
    this.height = lineHeight;
  }
  _renderFoldingIconForLine(editor, foldingModel, line, lineHeight, isOnGlyphMargin) {
    const showFoldingControls = editor.getOption(EditorOption.showFoldingControls);
    if (!foldingModel || showFoldingControls === "never") {
      return;
    }
    const foldingRegions = foldingModel.regions;
    const indexOfFoldingRegion = foldingRegions.findRange(line);
    const startLineNumber = foldingRegions.getStartLineNumber(indexOfFoldingRegion);
    const isFoldingScope = line === startLineNumber;
    if (!isFoldingScope) {
      return;
    }
    const isCollapsed = foldingRegions.isCollapsed(indexOfFoldingRegion);
    const foldingIcon = new StickyFoldingIcon(isCollapsed, startLineNumber, foldingRegions.getEndLineNumber(indexOfFoldingRegion), lineHeight);
    foldingIcon.setVisible(isOnGlyphMargin ? true : isCollapsed || showFoldingControls === "always");
    foldingIcon.domNode.setAttribute(STICKY_IS_FOLDING_ICON_ATTR, "");
    return foldingIcon;
  }
}
class StickyFoldingIcon {
  constructor(isCollapsed, foldingStartLine, foldingEndLine, dimension) {
    this.isCollapsed = isCollapsed;
    this.foldingStartLine = foldingStartLine;
    this.foldingEndLine = foldingEndLine;
    this.dimension = dimension;
    this.domNode = document.createElement("div");
    this.domNode.style.width = `26px`;
    this.domNode.style.height = `${dimension}px`;
    this.domNode.style.lineHeight = `${dimension}px`;
    this.domNode.className = ThemeIcon.asClassName(isCollapsed ? foldingCollapsedIcon : foldingExpandedIcon);
  }
  setVisible(visible) {
    this.domNode.style.cursor = visible ? "pointer" : "default";
    this.domNode.style.opacity = visible ? "1" : "0";
  }
}
export {
  StickyScrollWidget,
  StickyScrollWidgetState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3N0aWNreVNjcm9sbC9icm93c2VyL3N0aWNreVNjcm9sbFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRydXN0ZWRUeXBlc1BvbGljeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci90cnVzdGVkVHlwZXMuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0ICcuL3N0aWNreVNjcm9sbC5jc3MnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIElPdmVybGF5V2lkZ2V0LCBJT3ZlcmxheVdpZGdldFBvc2l0aW9uLCBPdmVybGF5V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IGdldENvbHVtbk9mTm9kZU9mZnNldCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvdmlld1BhcnRzL3ZpZXdMaW5lcy92aWV3TGluZS5qcyc7XG5pbXBvcnQgeyBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2VtYmVkZGVkQ29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JMYXlvdXRJbmZvLCBFZGl0b3JPcHRpb24sIFJlbmRlckxpbmVOdW1iZXJzVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFN0cmluZ0J1aWxkZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zdHJpbmdCdWlsZGVyLmpzJztcbmltcG9ydCB7IExpbmVEZWNvcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdMYXlvdXQvbGluZURlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IENoYXJhY3Rlck1hcHBpbmcsIFJlbmRlckxpbmVJbnB1dCwgcmVuZGVyVmlld0xpbmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld0xheW91dC92aWV3TGluZVJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGZvbGRpbmdDb2xsYXBzZWRJY29uLCBmb2xkaW5nRXhwYW5kZWRJY29uIH0gZnJvbSAnLi4vLi4vZm9sZGluZy9icm93c2VyL2ZvbGRpbmdEZWNvcmF0aW9ucy5qcyc7XG5pbXBvcnQgeyBGb2xkaW5nTW9kZWwgfSBmcm9tICcuLi8uLi9mb2xkaW5nL2Jyb3dzZXIvZm9sZGluZ01vZGVsLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdNb2RlbC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBTdGlja3lTY3JvbGxXaWRnZXRTdGF0ZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHN0YXJ0TGluZU51bWJlcnM6IG51bWJlcltdLFxuXHRcdHJlYWRvbmx5IGVuZExpbmVOdW1iZXJzOiBudW1iZXJbXSxcblx0XHRyZWFkb25seSBsYXN0TGluZVJlbGF0aXZlUG9zaXRpb246IG51bWJlcixcblx0XHRyZWFkb25seSBzaG93RW5kRm9yTGluZTogbnVtYmVyIHwgbnVsbCA9IG51bGxcblx0KSB7IH1cblxuXHRlcXVhbHMob3RoZXI6IFN0aWNreVNjcm9sbFdpZGdldFN0YXRlIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhb3RoZXJcblx0XHRcdCYmIHRoaXMubGFzdExpbmVSZWxhdGl2ZVBvc2l0aW9uID09PSBvdGhlci5sYXN0TGluZVJlbGF0aXZlUG9zaXRpb25cblx0XHRcdCYmIHRoaXMuc2hvd0VuZEZvckxpbmUgPT09IG90aGVyLnNob3dFbmRGb3JMaW5lXG5cdFx0XHQmJiBlcXVhbHModGhpcy5zdGFydExpbmVOdW1iZXJzLCBvdGhlci5zdGFydExpbmVOdW1iZXJzKVxuXHRcdFx0JiYgZXF1YWxzKHRoaXMuZW5kTGluZU51bWJlcnMsIG90aGVyLmVuZExpbmVOdW1iZXJzKTtcblx0fVxuXG5cdHN0YXRpYyBnZXQgRW1wdHkoKSB7XG5cdFx0cmV0dXJuIG5ldyBTdGlja3lTY3JvbGxXaWRnZXRTdGF0ZShbXSwgW10sIDApO1xuXHR9XG59XG5cbmNvbnN0IF90dFBvbGljeSA9IGNyZWF0ZVRydXN0ZWRUeXBlc1BvbGljeSgnc3RpY2t5U2Nyb2xsVmlld0xheWVyJywgeyBjcmVhdGVIVE1MOiB2YWx1ZSA9PiB2YWx1ZSB9KTtcbmNvbnN0IFNUSUNLWV9JTkRFWF9BVFRSID0gJ2RhdGEtc3RpY2t5LWxpbmUtaW5kZXgnO1xuY29uc3QgU1RJQ0tZX0lTX0xJTkVfQVRUUiA9ICdkYXRhLXN0aWNreS1pcy1saW5lJztcbmNvbnN0IFNUSUNLWV9JU19MSU5FX05VTUJFUl9BVFRSID0gJ2RhdGEtc3RpY2t5LWlzLWxpbmUtbnVtYmVyJztcbmNvbnN0IFNUSUNLWV9JU19GT0xESU5HX0lDT05fQVRUUiA9ICdkYXRhLXN0aWNreS1pcy1mb2xkaW5nLWljb24nO1xuXG5leHBvcnQgY2xhc3MgU3RpY2t5U2Nyb2xsV2lkZ2V0IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElPdmVybGF5V2lkZ2V0IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9mb2xkaW5nSWNvblN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcm9vdERvbU5vZGU6IEhUTUxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpbmVOdW1iZXJzRG9tTm9kZTogSFRNTEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbGluZXNEb21Ob2RlU2Nyb2xsYWJsZTogSFRNTEVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0cHJpdmF0ZSByZWFkb25seSBfbGluZXNEb21Ob2RlOiBIVE1MRWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3I7XG5cblx0cHJpdmF0ZSBfc3RhdGU6IFN0aWNreVNjcm9sbFdpZGdldFN0YXRlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9yZW5kZXJlZFN0aWNreUxpbmVzOiBSZW5kZXJlZFN0aWNreUxpbmVbXSA9IFtdO1xuXHRwcml2YXRlIF9saW5lTnVtYmVyczogbnVtYmVyW10gPSBbXTtcblx0cHJpdmF0ZSBfbGFzdExpbmVSZWxhdGl2ZVBvc2l0aW9uOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9taW5Db250ZW50V2lkdGhJblB4OiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIF9pc09uR2x5cGhNYXJnaW46IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBfaGVpZ2h0OiBudW1iZXIgPSAtMTtcblxuXHRwdWJsaWMgZ2V0IGhlaWdodCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5faGVpZ2h0OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTdGlja3lTY3JvbGxIZWlnaHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGhlaWdodDogbnVtYmVyIH0+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VTdGlja3lTY3JvbGxIZWlnaHQgPSB0aGlzLl9vbkRpZENoYW5nZVN0aWNreVNjcm9sbEhlaWdodC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9lZGl0b3IgPSBlZGl0b3I7XG5cdFx0dGhpcy5fbGluZU51bWJlcnNEb21Ob2RlLmNsYXNzTmFtZSA9ICdzdGlja3ktd2lkZ2V0LWxpbmUtbnVtYmVycyc7XG5cdFx0dGhpcy5fbGluZU51bWJlcnNEb21Ob2RlLnNldEF0dHJpYnV0ZSgncm9sZScsICdub25lJyk7XG5cblx0XHR0aGlzLl9saW5lc0RvbU5vZGUuY2xhc3NOYW1lID0gJ3N0aWNreS13aWRnZXQtbGluZXMnO1xuXHRcdHRoaXMuX2xpbmVzRG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbGlzdCcpO1xuXG5cdFx0dGhpcy5fbGluZXNEb21Ob2RlU2Nyb2xsYWJsZS5jbGFzc05hbWUgPSAnc3RpY2t5LXdpZGdldC1saW5lcy1zY3JvbGxhYmxlJztcblx0XHR0aGlzLl9saW5lc0RvbU5vZGVTY3JvbGxhYmxlLmFwcGVuZENoaWxkKHRoaXMuX2xpbmVzRG9tTm9kZSk7XG5cblx0XHR0aGlzLl9yb290RG9tTm9kZS5jbGFzc05hbWUgPSAnc3RpY2t5LXdpZGdldCc7XG5cdFx0dGhpcy5fcm9vdERvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgncGVlaycsIGVkaXRvciBpbnN0YW5jZW9mIEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCk7XG5cdFx0dGhpcy5fcm9vdERvbU5vZGUuYXBwZW5kQ2hpbGQodGhpcy5fbGluZU51bWJlcnNEb21Ob2RlKTtcblx0XHR0aGlzLl9yb290RG9tTm9kZS5hcHBlbmRDaGlsZCh0aGlzLl9saW5lc0RvbU5vZGVTY3JvbGxhYmxlKTtcblx0XHR0aGlzLl9zZXRIZWlnaHQoMCk7XG5cblx0XHRjb25zdCB1cGRhdGVTY3JvbGxMZWZ0UG9zaXRpb24gPSAoKSA9PiB7XG5cdFx0XHR0aGlzLl9saW5lc0RvbU5vZGUuc3R5bGUubGVmdCA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN0aWNreVNjcm9sbCkuc2Nyb2xsV2l0aEVkaXRvciA/IGAtJHt0aGlzLl9lZGl0b3IuZ2V0U2Nyb2xsTGVmdCgpfXB4YCA6ICcwcHgnO1xuXHRcdH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0aWYgKGUuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24uc3RpY2t5U2Nyb2xsKSkge1xuXHRcdFx0XHR1cGRhdGVTY3JvbGxMZWZ0UG9zaXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkU2Nyb2xsQ2hhbmdlKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5zY3JvbGxMZWZ0Q2hhbmdlZCkge1xuXHRcdFx0XHR1cGRhdGVTY3JvbGxMZWZ0UG9zaXRpb24oKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLnNjcm9sbFdpZHRoQ2hhbmdlZCkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVXaWRnZXRXaWR0aCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB7XG5cdFx0XHR1cGRhdGVTY3JvbGxMZWZ0UG9zaXRpb24oKTtcblx0XHRcdHRoaXMuX3VwZGF0ZVdpZGdldFdpZHRoKCk7XG5cdFx0fSkpO1xuXHRcdHVwZGF0ZVNjcm9sbExlZnRQb3NpdGlvbigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkTGF5b3V0Q2hhbmdlKChlKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVXaWRnZXRXaWR0aCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl91cGRhdGVXaWRnZXRXaWR0aCgpO1xuXHR9XG5cblx0Z2V0IGxpbmVOdW1iZXJzKCk6IG51bWJlcltdIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZU51bWJlcnM7XG5cdH1cblxuXHRnZXQgbGluZU51bWJlckNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2xpbmVOdW1iZXJzLmxlbmd0aDtcblx0fVxuXG5cdGdldFJlbmRlcmVkU3RpY2t5TGluZShsaW5lTnVtYmVyOiBudW1iZXIpOiBSZW5kZXJlZFN0aWNreUxpbmUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlZFN0aWNreUxpbmVzLmZpbmQoc3RpY2t5TGluZSA9PiBzdGlja3lMaW5lLmxpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIpO1xuXHR9XG5cblx0Z2V0Q3VycmVudExpbmVzKCk6IHJlYWRvbmx5IG51bWJlcltdIHtcblx0XHRyZXR1cm4gdGhpcy5fbGluZU51bWJlcnM7XG5cdH1cblxuXHRzZXRTdGF0ZShzdGF0ZTogU3RpY2t5U2Nyb2xsV2lkZ2V0U3RhdGUgfCB1bmRlZmluZWQsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsIHwgdW5kZWZpbmVkLCByZWJ1aWxkRnJvbUluZGV4Q2FuZGlkYXRlPzogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudFN0YXRlQW5kUHJldmlvdXNTdGF0ZVVuZGVmaW5lZCA9ICF0aGlzLl9zdGF0ZSAmJiAhc3RhdGU7XG5cdFx0Y29uc3QgY3VycmVudFN0YXRlRGVmaW5lZEFuZEVxdWFsc1ByZXZpb3VzU3RhdGUgPSB0aGlzLl9zdGF0ZSAmJiB0aGlzLl9zdGF0ZS5lcXVhbHMoc3RhdGUpO1xuXHRcdGlmIChyZWJ1aWxkRnJvbUluZGV4Q2FuZGlkYXRlID09PSB1bmRlZmluZWQgJiYgKGN1cnJlbnRTdGF0ZUFuZFByZXZpb3VzU3RhdGVVbmRlZmluZWQgfHwgY3VycmVudFN0YXRlRGVmaW5lZEFuZEVxdWFsc1ByZXZpb3VzU3RhdGUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9maW5kUmVuZGVyaW5nRGF0YShzdGF0ZSk7XG5cdFx0Y29uc3QgcHJldmlvdXNMaW5lTnVtYmVycyA9IHRoaXMuX2xpbmVOdW1iZXJzO1xuXHRcdHRoaXMuX2xpbmVOdW1iZXJzID0gZGF0YS5saW5lTnVtYmVycztcblx0XHR0aGlzLl9sYXN0TGluZVJlbGF0aXZlUG9zaXRpb24gPSBkYXRhLmxhc3RMaW5lUmVsYXRpdmVQb3NpdGlvbjtcblx0XHRjb25zdCByZWJ1aWxkRnJvbUluZGV4ID0gdGhpcy5fZmluZEluZGV4VG9SZWJ1aWxkRnJvbShwcmV2aW91c0xpbmVOdW1iZXJzLCB0aGlzLl9saW5lTnVtYmVycywgcmVidWlsZEZyb21JbmRleENhbmRpZGF0ZSk7XG5cdFx0dGhpcy5fcmVuZGVyUm9vdE5vZGUodGhpcy5fbGluZU51bWJlcnMsIHRoaXMuX2xhc3RMaW5lUmVsYXRpdmVQb3NpdGlvbiwgZm9sZGluZ01vZGVsLCByZWJ1aWxkRnJvbUluZGV4KTtcblx0XHR0aGlzLl9zdGF0ZSA9IHN0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZFJlbmRlcmluZ0RhdGEoc3RhdGU6IFN0aWNreVNjcm9sbFdpZGdldFN0YXRlIHwgdW5kZWZpbmVkKTogeyBsaW5lTnVtYmVyczogbnVtYmVyW107IGxhc3RMaW5lUmVsYXRpdmVQb3NpdGlvbjogbnVtYmVyIH0ge1xuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdHJldHVybiB7IGxpbmVOdW1iZXJzOiBbXSwgbGFzdExpbmVSZWxhdGl2ZVBvc2l0aW9uOiAwIH07XG5cdFx0fVxuXHRcdGNvbnN0IGNhbmRpZGF0ZUxpbmVOdW1iZXJzID0gWy4uLnN0YXRlLnN0YXJ0TGluZU51bWJlcnNdO1xuXHRcdGlmIChzdGF0ZS5zaG93RW5kRm9yTGluZSAhPT0gbnVsbCkge1xuXHRcdFx0Y2FuZGlkYXRlTGluZU51bWJlcnNbc3RhdGUuc2hvd0VuZEZvckxpbmVdID0gc3RhdGUuZW5kTGluZU51bWJlcnNbc3RhdGUuc2hvd0VuZEZvckxpbmVdO1xuXHRcdH1cblx0XHRsZXQgdG90YWxIZWlnaHQgPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY2FuZGlkYXRlTGluZU51bWJlcnMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKGNhbmRpZGF0ZUxpbmVOdW1iZXJzW2ldLCAxKTtcblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IHRoaXMuX2VkaXRvci5fZ2V0Vmlld01vZGVsKCk7XG5cdFx0XHRpZiAodmlld01vZGVsICYmIHBvc2l0aW9uLmxpbmVOdW1iZXIgPD0gdmlld01vZGVsLmdldExpbmVDb3VudCgpKSB7XG5cdFx0XHRcdHRvdGFsSGVpZ2h0ICs9IHRoaXMuX2VkaXRvci5nZXRMaW5lSGVpZ2h0Rm9yUG9zaXRpb24obmV3IFBvc2l0aW9uKGNhbmRpZGF0ZUxpbmVOdW1iZXJzW2ldLCAxKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0b3RhbEhlaWdodCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHsgbGluZU51bWJlcnM6IFtdLCBsYXN0TGluZVJlbGF0aXZlUG9zaXRpb246IDAgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgbGluZU51bWJlcnM6IGNhbmRpZGF0ZUxpbmVOdW1iZXJzLCBsYXN0TGluZVJlbGF0aXZlUG9zaXRpb246IHN0YXRlLmxhc3RMaW5lUmVsYXRpdmVQb3NpdGlvbiB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZEluZGV4VG9SZWJ1aWxkRnJvbShwcmV2aW91c0xpbmVOdW1iZXJzOiBudW1iZXJbXSwgbmV3TGluZU51bWJlcnM6IG51bWJlcltdLCByZWJ1aWxkRnJvbUluZGV4Q2FuZGlkYXRlPzogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRpZiAobmV3TGluZU51bWJlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gMDtcblx0XHR9XG5cdFx0aWYgKHJlYnVpbGRGcm9tSW5kZXhDYW5kaWRhdGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHJlYnVpbGRGcm9tSW5kZXhDYW5kaWRhdGU7XG5cdFx0fVxuXHRcdGNvbnN0IHZhbGlkSW5kZXggPSBuZXdMaW5lTnVtYmVycy5maW5kSW5kZXgoc3RhcnRMaW5lTnVtYmVyID0+ICFwcmV2aW91c0xpbmVOdW1iZXJzLmluY2x1ZGVzKHN0YXJ0TGluZU51bWJlcikpO1xuXHRcdHJldHVybiB2YWxpZEluZGV4ID09PSAtMSA/IDAgOiB2YWxpZEluZGV4O1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlV2lkZ2V0V2lkdGgoKTogdm9pZCB7XG5cdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHRoaXMuX2VkaXRvci5nZXRMYXlvdXRJbmZvKCk7XG5cdFx0Y29uc3QgbGluZU51bWJlcnNXaWR0aCA9IGxheW91dEluZm8uY29udGVudExlZnQ7XG5cdFx0dGhpcy5fbGluZU51bWJlcnNEb21Ob2RlLnN0eWxlLndpZHRoID0gYCR7bGluZU51bWJlcnNXaWR0aH1weGA7XG5cdFx0dGhpcy5fbGluZXNEb21Ob2RlU2Nyb2xsYWJsZS5zdHlsZS5zZXRQcm9wZXJ0eSgnLS12c2NvZGUtZWRpdG9yU3RpY2t5U2Nyb2xsLXNjcm9sbGFibGVXaWR0aCcsIGAke3RoaXMuX2VkaXRvci5nZXRTY3JvbGxXaWR0aCgpIC0gbGF5b3V0SW5mby52ZXJ0aWNhbFNjcm9sbGJhcldpZHRofXB4YCk7XG5cdFx0dGhpcy5fcm9vdERvbU5vZGUuc3R5bGUud2lkdGggPSBgJHtsYXlvdXRJbmZvLndpZHRoIC0gbGF5b3V0SW5mby52ZXJ0aWNhbFNjcm9sbGJhcldpZHRofXB4YDtcblx0fVxuXG5cdHByaXZhdGUgX3VzZUZvbGRpbmdPcGFjaXR5VHJhbnNpdGlvbihyZXF1aXJlVHJhbnNpdGlvbnM6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9saW5lTnVtYmVyc0RvbU5vZGUuc3R5bGUuc2V0UHJvcGVydHkoJy0tdnNjb2RlLWVkaXRvclN0aWNreVNjcm9sbC1mb2xkaW5nT3BhY2l0eVRyYW5zaXRpb24nLCBgb3BhY2l0eSAke3JlcXVpcmVUcmFuc2l0aW9ucyA/IDAuNSA6IDB9c2ApO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Rm9sZGluZ0ljb25zVmlzaWJpbGl0eShhbGxWaXNpYmxlOiBib29sZWFuKSB7XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIHRoaXMuX3JlbmRlcmVkU3RpY2t5TGluZXMpIHtcblx0XHRcdGNvbnN0IGZvbGRpbmdJY29uID0gbGluZS5mb2xkaW5nSWNvbjtcblx0XHRcdGlmICghZm9sZGluZ0ljb24pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb2xkaW5nSWNvbi5zZXRWaXNpYmxlKGFsbFZpc2libGUgPyB0cnVlIDogZm9sZGluZ0ljb24uaXNDb2xsYXBzZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlbmRlclJvb3ROb2RlKGxpbmVOdW1iZXJzOiBudW1iZXJbXSwgbGFzdExpbmVSZWxhdGl2ZVBvc2l0aW9uOiBudW1iZXIsIGZvbGRpbmdNb2RlbDogRm9sZGluZ01vZGVsIHwgdW5kZWZpbmVkLCByZWJ1aWxkRnJvbUluZGV4OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2aWV3TW9kZWwgPSB0aGlzLl9lZGl0b3IuX2dldFZpZXdNb2RlbCgpO1xuXHRcdGlmICghdmlld01vZGVsKSB7XG5cdFx0XHR0aGlzLl9jbGVhcldpZGdldCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAobGluZU51bWJlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9jbGVhcldpZGdldCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCByZW5kZXJlZFN0aWNreUxpbmVzOiBSZW5kZXJlZFN0aWNreUxpbmVbXSA9IFtdO1xuXHRcdGNvbnN0IGxhc3RMaW5lTnVtYmVyID0gbGluZU51bWJlcnNbbGluZU51bWJlcnMubGVuZ3RoIC0gMV07XG5cdFx0bGV0IHRvcDogbnVtYmVyID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3JlbmRlcmVkU3RpY2t5TGluZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChpIDwgcmVidWlsZEZyb21JbmRleCkge1xuXHRcdFx0XHRjb25zdCByZW5kZXJlZExpbmUgPSB0aGlzLl9yZW5kZXJlZFN0aWNreUxpbmVzW2ldO1xuXHRcdFx0XHRyZW5kZXJlZFN0aWNreUxpbmVzLnB1c2godGhpcy5fdXBkYXRlUG9zaXRpb24ocmVuZGVyZWRMaW5lLCB0b3AsIHJlbmRlcmVkTGluZS5saW5lTnVtYmVyID09PSBsYXN0TGluZU51bWJlcikpO1xuXHRcdFx0XHR0b3AgKz0gcmVuZGVyZWRMaW5lLmhlaWdodDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHJlbmRlcmVkTGluZSA9IHRoaXMuX3JlbmRlcmVkU3RpY2t5TGluZXNbaV07XG5cdFx0XHRcdHJlbmRlcmVkTGluZS5saW5lTnVtYmVyRG9tTm9kZS5yZW1vdmUoKTtcblx0XHRcdFx0cmVuZGVyZWRMaW5lLmxpbmVEb21Ob2RlLnJlbW92ZSgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBsYXlvdXRJbmZvID0gdGhpcy5fZWRpdG9yLmdldExheW91dEluZm8oKTtcblx0XHRmb3IgKGxldCBpID0gcmVidWlsZEZyb21JbmRleDsgaSA8IGxpbmVOdW1iZXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyID0gbGluZU51bWJlcnNbaV07XG5cdFx0XHRpZiAobGluZU51bWJlciA+IHZpZXdNb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN0aWNreUxpbmUgPSB0aGlzLl9yZW5kZXJDaGlsZE5vZGUodmlld01vZGVsLCBpLCBsaW5lTnVtYmVyLCB0b3AsIGxhc3RMaW5lTnVtYmVyID09PSBsaW5lTnVtYmVyLCBmb2xkaW5nTW9kZWwsIGxheW91dEluZm8pO1xuXHRcdFx0dG9wICs9IHN0aWNreUxpbmUuaGVpZ2h0O1xuXHRcdFx0dGhpcy5fbGluZXNEb21Ob2RlLmFwcGVuZENoaWxkKHN0aWNreUxpbmUubGluZURvbU5vZGUpO1xuXHRcdFx0dGhpcy5fbGluZU51bWJlcnNEb21Ob2RlLmFwcGVuZENoaWxkKHN0aWNreUxpbmUubGluZU51bWJlckRvbU5vZGUpO1xuXHRcdFx0cmVuZGVyZWRTdGlja3lMaW5lcy5wdXNoKHN0aWNreUxpbmUpO1xuXHRcdH1cblx0XHRpZiAoZm9sZGluZ01vZGVsKSB7XG5cdFx0XHR0aGlzLl9zZXRGb2xkaW5nSG92ZXJMaXN0ZW5lcnMoKTtcblx0XHRcdHRoaXMuX3VzZUZvbGRpbmdPcGFjaXR5VHJhbnNpdGlvbighdGhpcy5faXNPbkdseXBoTWFyZ2luKTtcblx0XHR9XG5cdFx0dGhpcy5fbWluQ29udGVudFdpZHRoSW5QeCA9IE1hdGgubWF4KC4uLnRoaXMuX3JlbmRlcmVkU3RpY2t5TGluZXMubWFwKGwgPT4gbC5zY3JvbGxXaWR0aCkpICsgbGF5b3V0SW5mby52ZXJ0aWNhbFNjcm9sbGJhcldpZHRoO1xuXHRcdHRoaXMuX3JlbmRlcmVkU3RpY2t5TGluZXMgPSByZW5kZXJlZFN0aWNreUxpbmVzO1xuXHRcdHRoaXMuX3NldEhlaWdodCh0b3AgKyBsYXN0TGluZVJlbGF0aXZlUG9zaXRpb24pO1xuXHRcdHRoaXMuX2VkaXRvci5sYXlvdXRPdmVybGF5V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xlYXJXaWRnZXQoKTogdm9pZCB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9yZW5kZXJlZFN0aWNreUxpbmVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBzdGlja3lMaW5lID0gdGhpcy5fcmVuZGVyZWRTdGlja3lMaW5lc1tpXTtcblx0XHRcdHN0aWNreUxpbmUubGluZU51bWJlckRvbU5vZGUucmVtb3ZlKCk7XG5cdFx0XHRzdGlja3lMaW5lLmxpbmVEb21Ob2RlLnJlbW92ZSgpO1xuXHRcdH1cblx0XHR0aGlzLl9zZXRIZWlnaHQoMCk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRIZWlnaHQoaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faGVpZ2h0ID09PSBoZWlnaHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5faGVpZ2h0ID0gaGVpZ2h0O1xuXG5cdFx0aWYgKHRoaXMuX2hlaWdodCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fcm9vdERvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fcm9vdERvbU5vZGUuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdFx0XHR0aGlzLl9saW5lTnVtYmVyc0RvbU5vZGUuc3R5bGUuaGVpZ2h0ID0gYCR7dGhpcy5faGVpZ2h0fXB4YDtcblx0XHRcdHRoaXMuX2xpbmVzRG9tTm9kZVNjcm9sbGFibGUuc3R5bGUuaGVpZ2h0ID0gYCR7dGhpcy5faGVpZ2h0fXB4YDtcblx0XHRcdHRoaXMuX3Jvb3REb21Ob2RlLnN0eWxlLmhlaWdodCA9IGAke3RoaXMuX2hlaWdodH1weGA7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGlja3lTY3JvbGxIZWlnaHQuZmlyZSh7IGhlaWdodDogdGhpcy5faGVpZ2h0IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0Rm9sZGluZ0hvdmVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX2ZvbGRpbmdJY29uU3RvcmUuY2xlYXIoKTtcblx0XHRjb25zdCBzaG93Rm9sZGluZ0NvbnRyb2xzOiAnbW91c2VvdmVyJyB8ICdhbHdheXMnIHwgJ25ldmVyJyA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnNob3dGb2xkaW5nQ29udHJvbHMpO1xuXHRcdGlmIChzaG93Rm9sZGluZ0NvbnRyb2xzICE9PSAnbW91c2VvdmVyJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9mb2xkaW5nSWNvblN0b3JlLmNsZWFyKCk7XG5cdFx0dGhpcy5fZm9sZGluZ0ljb25TdG9yZS5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9saW5lTnVtYmVyc0RvbU5vZGUsIGRvbS5FdmVudFR5cGUuTU9VU0VfRU5URVIsICgpID0+IHtcblx0XHRcdHRoaXMuX2lzT25HbHlwaE1hcmdpbiA9IHRydWU7XG5cdFx0XHR0aGlzLl9zZXRGb2xkaW5nSWNvbnNWaXNpYmlsaXR5KHRydWUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9mb2xkaW5nSWNvblN0b3JlLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2xpbmVOdW1iZXJzRG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5NT1VTRV9MRUFWRSwgKCkgPT4ge1xuXHRcdFx0dGhpcy5faXNPbkdseXBoTWFyZ2luID0gZmFsc2U7XG5cdFx0XHR0aGlzLl91c2VGb2xkaW5nT3BhY2l0eVRyYW5zaXRpb24odHJ1ZSk7XG5cdFx0XHR0aGlzLl9zZXRGb2xkaW5nSWNvbnNWaXNpYmlsaXR5KGZhbHNlKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJDaGlsZE5vZGUodmlld01vZGVsOiBJVmlld01vZGVsLCBpbmRleDogbnVtYmVyLCBsaW5lOiBudW1iZXIsIHRvcDogbnVtYmVyLCBpc0xhc3RMaW5lOiBib29sZWFuLCBmb2xkaW5nTW9kZWw6IEZvbGRpbmdNb2RlbCB8IHVuZGVmaW5lZCwgbGF5b3V0SW5mbzogRWRpdG9yTGF5b3V0SW5mbyk6IFJlbmRlcmVkU3RpY2t5TGluZSB7XG5cblx0XHRjb25zdCByZW5kZXJlZExpbmUgPSBuZXcgUmVuZGVyZWRTdGlja3lMaW5lKFxuXHRcdFx0dGhpcy5fZWRpdG9yLFxuXHRcdFx0dmlld01vZGVsLFxuXHRcdFx0bGF5b3V0SW5mbyxcblx0XHRcdGZvbGRpbmdNb2RlbCxcblx0XHRcdHRoaXMuX2lzT25HbHlwaE1hcmdpbixcblx0XHRcdGluZGV4LFxuXHRcdFx0bGluZVxuXHRcdCk7XG5cdFx0cmV0dXJuIHRoaXMuX3VwZGF0ZVBvc2l0aW9uKHJlbmRlcmVkTGluZSwgdG9wLCBpc0xhc3RMaW5lKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZVBvc2l0aW9uKHN0aWNreUxpbmU6IFJlbmRlcmVkU3RpY2t5TGluZSwgdG9wOiBudW1iZXIsIGlzTGFzdExpbmU6IGJvb2xlYW4pOiBSZW5kZXJlZFN0aWNreUxpbmUge1xuXHRcdGNvbnN0IGxpbmVIVE1MTm9kZSA9IHN0aWNreUxpbmUubGluZURvbU5vZGU7XG5cdFx0Y29uc3QgbGluZU51bWJlckhUTUxOb2RlID0gc3RpY2t5TGluZS5saW5lTnVtYmVyRG9tTm9kZTtcblx0XHRpZiAoaXNMYXN0TGluZSkge1xuXHRcdFx0Y29uc3QgekluZGV4ID0gJzAnO1xuXHRcdFx0bGluZUhUTUxOb2RlLnN0eWxlLnpJbmRleCA9IHpJbmRleDtcblx0XHRcdGxpbmVOdW1iZXJIVE1MTm9kZS5zdHlsZS56SW5kZXggPSB6SW5kZXg7XG5cdFx0XHRjb25zdCB1cGRhdGVkVG9wID0gYCR7dG9wICsgdGhpcy5fbGFzdExpbmVSZWxhdGl2ZVBvc2l0aW9uICsgKHN0aWNreUxpbmUuZm9sZGluZ0ljb24/LmlzQ29sbGFwc2VkID8gMSA6IDApfXB4YDtcblx0XHRcdGxpbmVIVE1MTm9kZS5zdHlsZS50b3AgPSB1cGRhdGVkVG9wO1xuXHRcdFx0bGluZU51bWJlckhUTUxOb2RlLnN0eWxlLnRvcCA9IHVwZGF0ZWRUb3A7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHpJbmRleCA9ICcxJztcblx0XHRcdGxpbmVIVE1MTm9kZS5zdHlsZS56SW5kZXggPSB6SW5kZXg7XG5cdFx0XHRsaW5lTnVtYmVySFRNTE5vZGUuc3R5bGUuekluZGV4ID0gekluZGV4O1xuXHRcdFx0bGluZUhUTUxOb2RlLnN0eWxlLnRvcCA9IGAke3RvcH1weGA7XG5cdFx0XHRsaW5lTnVtYmVySFRNTE5vZGUuc3R5bGUudG9wID0gYCR7dG9wfXB4YDtcblx0XHR9XG5cdFx0cmV0dXJuIHN0aWNreUxpbmU7XG5cdH1cblxuXHRnZXRJZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiAnZWRpdG9yLmNvbnRyaWIuc3RpY2t5U2Nyb2xsV2lkZ2V0Jztcblx0fVxuXG5cdGdldERvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLl9yb290RG9tTm9kZTtcblx0fVxuXG5cdGdldFBvc2l0aW9uKCk6IElPdmVybGF5V2lkZ2V0UG9zaXRpb24gfCBudWxsIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cHJlZmVyZW5jZTogT3ZlcmxheVdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5UT1BfQ0VOVEVSLFxuXHRcdFx0c3RhY2tPcmRpbmFsOiAxMCxcblx0XHR9O1xuXHR9XG5cblx0Z2V0TWluQ29udGVudFdpZHRoSW5QeCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9taW5Db250ZW50V2lkdGhJblB4O1xuXHR9XG5cblx0Zm9jdXNMaW5lV2l0aEluZGV4KGluZGV4OiBudW1iZXIpIHtcblx0XHRpZiAoMCA8PSBpbmRleCAmJiBpbmRleCA8IHRoaXMuX3JlbmRlcmVkU3RpY2t5TGluZXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLl9yZW5kZXJlZFN0aWNreUxpbmVzW2luZGV4XS5saW5lRG9tTm9kZS5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBHaXZlbiBhIGxlYWYgZG9tIG5vZGUsIHRyaWVzIHRvIGZpbmQgdGhlIGVkaXRvciBwb3NpdGlvbi5cblx0ICovXG5cdGdldEVkaXRvclBvc2l0aW9uRnJvbU5vZGUoc3BhbkRvbU5vZGU6IEhUTUxFbGVtZW50IHwgbnVsbCk6IFBvc2l0aW9uIHwgbnVsbCB7XG5cdFx0aWYgKCFzcGFuRG9tTm9kZSB8fCBzcGFuRG9tTm9kZS5jaGlsZHJlbi5sZW5ndGggPiAwKSB7XG5cdFx0XHQvLyBUaGlzIGlzIG5vdCBhIGxlYWYgbm9kZVxuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGNvbnN0IHJlbmRlcmVkU3RpY2t5TGluZSA9IHRoaXMuX2dldFJlbmRlcmVkU3RpY2t5TGluZUZyb21DaGlsZERvbU5vZGUoc3BhbkRvbU5vZGUpO1xuXHRcdGlmICghcmVuZGVyZWRTdGlja3lMaW5lKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3QgY29sdW1uID0gZ2V0Q29sdW1uT2ZOb2RlT2Zmc2V0KHJlbmRlcmVkU3RpY2t5TGluZS5jaGFyYWN0ZXJNYXBwaW5nLCBzcGFuRG9tTm9kZSwgMCk7XG5cdFx0cmV0dXJuIG5ldyBQb3NpdGlvbihyZW5kZXJlZFN0aWNreUxpbmUubGluZU51bWJlciwgY29sdW1uKTtcblx0fVxuXG5cdGdldExpbmVOdW1iZXJGcm9tQ2hpbGREb21Ob2RlKGRvbU5vZGU6IEhUTUxFbGVtZW50IHwgbnVsbCk6IG51bWJlciB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9nZXRSZW5kZXJlZFN0aWNreUxpbmVGcm9tQ2hpbGREb21Ob2RlKGRvbU5vZGUpPy5saW5lTnVtYmVyID8/IG51bGw7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRSZW5kZXJlZFN0aWNreUxpbmVGcm9tQ2hpbGREb21Ob2RlKGRvbU5vZGU6IEhUTUxFbGVtZW50IHwgbnVsbCk6IFJlbmRlcmVkU3RpY2t5TGluZSB8IG51bGwge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5nZXRMaW5lSW5kZXhGcm9tQ2hpbGREb21Ob2RlKGRvbU5vZGUpO1xuXHRcdGlmIChpbmRleCA9PT0gbnVsbCB8fCBpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy5fcmVuZGVyZWRTdGlja3lMaW5lcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRTdGlja3lMaW5lc1tpbmRleF07XG5cdH1cblxuXHQvKipcblx0ICogR2l2ZW4gYSBjaGlsZCBkb20gbm9kZSwgdHJpZXMgdG8gZmluZCB0aGUgbGluZSBudW1iZXIgYXR0cmlidXRlIHRoYXQgd2FzIHN0b3JlZCBpbiB0aGUgbm9kZS5cblx0ICogQHJldHVybnMgdGhlIGF0dHJpYnV0ZSB2YWx1ZSBvciBudWxsIGlmIG5vbmUgaXMgZm91bmQuXG5cdCAqL1xuXHRnZXRMaW5lSW5kZXhGcm9tQ2hpbGREb21Ob2RlKGRvbU5vZGU6IEhUTUxFbGVtZW50IHwgbnVsbCk6IG51bWJlciB8IG51bGwge1xuXHRcdGNvbnN0IGxpbmVJbmRleCA9IHRoaXMuX2dldEF0dHJpYnV0ZVZhbHVlKGRvbU5vZGUsIFNUSUNLWV9JTkRFWF9BVFRSKTtcblx0XHRyZXR1cm4gbGluZUluZGV4ID8gcGFyc2VJbnQobGluZUluZGV4LCAxMCkgOiBudWxsO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdpdmVuIGEgY2hpbGQgZG9tIG5vZGUsIHRyaWVzIHRvIGZpbmQgaWYgaXQgaXMgKGNvbnRhaW5lZCBpbikgYSBzdGlja3kgbGluZS5cblx0ICogQHJldHVybnMgYSBib29sZWFuLlxuXHQgKi9cblx0aXNJblN0aWNreUxpbmUoZG9tTm9kZTogSFRNTEVsZW1lbnQgfCBudWxsKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaXNJbkxpbmUgPSB0aGlzLl9nZXRBdHRyaWJ1dGVWYWx1ZShkb21Ob2RlLCBTVElDS1lfSVNfTElORV9BVFRSKTtcblx0XHRyZXR1cm4gaXNJbkxpbmUgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBHaXZlbiBhIGNoaWxkIGRvbSBub2RlLCB0cmllcyB0byBmaW5kIGlmIHRoaXMgZG9tIG5vZGUgaXMgKGNvbnRhaW5lZCBpbikgYSBzdGlja3kgZm9sZGluZyBpY29uLlxuXHQgKiBAcmV0dXJucyBhIGJvb2xlYW4uXG5cdCAqL1xuXHRpc0luRm9sZGluZ0ljb25Eb21Ob2RlKGRvbU5vZGU6IEhUTUxFbGVtZW50IHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGlzSW5Gb2xkaW5nSWNvbiA9IHRoaXMuX2dldEF0dHJpYnV0ZVZhbHVlKGRvbU5vZGUsIFNUSUNLWV9JU19GT0xESU5HX0lDT05fQVRUUik7XG5cdFx0cmV0dXJuIGlzSW5Gb2xkaW5nSWNvbiAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdpdmVuIHRoZSBkb20gbm9kZSwgZmluZHMgaWYgaXQgb3IgaXRzIHBhcmVudCBzZXF1ZW5jZSBjb250YWlucyB0aGUgZ2l2ZW4gYXR0cmlidXRlLlxuXHQgKiBAcmV0dXJucyB0aGUgYXR0cmlidXRlIHZhbHVlIG9yIHVuZGVmaW5lZC5cblx0ICovXG5cdHByaXZhdGUgX2dldEF0dHJpYnV0ZVZhbHVlKGRvbU5vZGU6IEhUTUxFbGVtZW50IHwgbnVsbCwgYXR0cmlidXRlOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHdoaWxlIChkb21Ob2RlICYmIGRvbU5vZGUgIT09IHRoaXMuX3Jvb3REb21Ob2RlKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gZG9tTm9kZS5nZXRBdHRyaWJ1dGUoYXR0cmlidXRlKTtcblx0XHRcdGlmIChsaW5lICE9PSBudWxsKSB7XG5cdFx0XHRcdHJldHVybiBsaW5lO1xuXHRcdFx0fVxuXHRcdFx0ZG9tTm9kZSA9IGRvbU5vZGUucGFyZW50RWxlbWVudDtcblx0XHR9XG5cdFx0cmV0dXJuO1xuXHR9XG59XG5cbmNsYXNzIFJlbmRlcmVkU3RpY2t5TGluZSB7XG5cblx0cHVibGljIHJlYWRvbmx5IGxpbmVEb21Ob2RlOiBIVE1MRWxlbWVudDtcblx0cHVibGljIHJlYWRvbmx5IGxpbmVOdW1iZXJEb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgZm9sZGluZ0ljb246IFN0aWNreUZvbGRpbmdJY29uIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgcmVhZG9ubHkgY2hhcmFjdGVyTWFwcGluZzogQ2hhcmFjdGVyTWFwcGluZztcblxuXHRwdWJsaWMgcmVhZG9ubHkgc2Nyb2xsV2lkdGg6IG51bWJlcjtcblx0cHVibGljIHJlYWRvbmx5IGhlaWdodDogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0dmlld01vZGVsOiBJVmlld01vZGVsLFxuXHRcdGxheW91dEluZm86IEVkaXRvckxheW91dEluZm8sXG5cdFx0Zm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwgfCB1bmRlZmluZWQsXG5cdFx0aXNPbkdseXBoTWFyZ2luOiBib29sZWFuLFxuXHRcdHB1YmxpYyByZWFkb25seSBpbmRleDogbnVtYmVyLFxuXHRcdHB1YmxpYyByZWFkb25seSBsaW5lTnVtYmVyOiBudW1iZXIsXG5cdCkge1xuXHRcdGNvbnN0IHZpZXdMaW5lTnVtYmVyID0gdmlld01vZGVsLmNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFBvc2l0aW9uVG9WaWV3UG9zaXRpb24obmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIDEpKS5saW5lTnVtYmVyO1xuXHRcdGNvbnN0IGxpbmVSZW5kZXJpbmdEYXRhID0gdmlld01vZGVsLmdldFZpZXdMaW5lUmVuZGVyaW5nRGF0YSh2aWV3TGluZU51bWJlcik7XG5cdFx0Y29uc3QgbGluZU51bWJlck9wdGlvbiA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVOdW1iZXJzKTtcblx0XHRjb25zdCB2ZXJ0aWNhbFNjcm9sbGJhclNpemUgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zY3JvbGxiYXIpLnZlcnRpY2FsU2Nyb2xsYmFyU2l6ZTtcblxuXHRcdGxldCBhY3R1YWxJbmxpbmVEZWNvcmF0aW9uczogTGluZURlY29yYXRpb25bXTtcblx0XHR0cnkge1xuXHRcdFx0YWN0dWFsSW5saW5lRGVjb3JhdGlvbnMgPSBMaW5lRGVjb3JhdGlvbi5maWx0ZXIobGluZVJlbmRlcmluZ0RhdGEuaW5saW5lRGVjb3JhdGlvbnMsIHZpZXdMaW5lTnVtYmVyLCBsaW5lUmVuZGVyaW5nRGF0YS5taW5Db2x1bW4sIGxpbmVSZW5kZXJpbmdEYXRhLm1heENvbHVtbik7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRhY3R1YWxJbmxpbmVEZWNvcmF0aW9ucyA9IFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSBlZGl0b3IuZ2V0TGluZUhlaWdodEZvclBvc2l0aW9uKG5ldyBQb3NpdGlvbihsaW5lTnVtYmVyLCAxKSk7XG5cdFx0Y29uc3QgdGV4dERpcmVjdGlvbiA9IHZpZXdNb2RlbC5nZXRUZXh0RGlyZWN0aW9uKGxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IHJlbmRlckxpbmVJbnB1dDogUmVuZGVyTGluZUlucHV0ID0gbmV3IFJlbmRlckxpbmVJbnB1dCh0cnVlLCB0cnVlLCBsaW5lUmVuZGVyaW5nRGF0YS5jb250ZW50LFxuXHRcdFx0bGluZVJlbmRlcmluZ0RhdGEuY29udGludWVzV2l0aFdyYXBwZWRMaW5lLFxuXHRcdFx0bGluZVJlbmRlcmluZ0RhdGEuaXNCYXNpY0FTQ0lJLCBsaW5lUmVuZGVyaW5nRGF0YS5jb250YWluc1JUTCwgMCxcblx0XHRcdGxpbmVSZW5kZXJpbmdEYXRhLnRva2VucywgYWN0dWFsSW5saW5lRGVjb3JhdGlvbnMsXG5cdFx0XHRsaW5lUmVuZGVyaW5nRGF0YS50YWJTaXplLCBsaW5lUmVuZGVyaW5nRGF0YS5zdGFydFZpc2libGVDb2x1bW4sXG5cdFx0XHQxLCAxLCAxLCA1MDAsICdub25lJywgdHJ1ZSwgdHJ1ZSwgbnVsbCxcblx0XHRcdHRleHREaXJlY3Rpb24sIHZlcnRpY2FsU2Nyb2xsYmFyU2l6ZVxuXHRcdCk7XG5cblx0XHRjb25zdCBzYiA9IG5ldyBTdHJpbmdCdWlsZGVyKDIwMDApO1xuXHRcdGNvbnN0IHJlbmRlck91dHB1dCA9IHJlbmRlclZpZXdMaW5lKHJlbmRlckxpbmVJbnB1dCwgc2IpO1xuXHRcdHRoaXMuY2hhcmFjdGVyTWFwcGluZyA9IHJlbmRlck91dHB1dC5jaGFyYWN0ZXJNYXBwaW5nO1xuXG5cdFx0bGV0IG5ld0xpbmU7XG5cdFx0aWYgKF90dFBvbGljeSkge1xuXHRcdFx0bmV3TGluZSA9IF90dFBvbGljeS5jcmVhdGVIVE1MKHNiLmJ1aWxkKCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRuZXdMaW5lID0gc2IuYnVpbGQoKTtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lSFRNTE5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0bGluZUhUTUxOb2RlLnNldEF0dHJpYnV0ZShTVElDS1lfSU5ERVhfQVRUUiwgU3RyaW5nKGluZGV4KSk7XG5cdFx0bGluZUhUTUxOb2RlLnNldEF0dHJpYnV0ZShTVElDS1lfSVNfTElORV9BVFRSLCAnJyk7XG5cdFx0bGluZUhUTUxOb2RlLnNldEF0dHJpYnV0ZSgncm9sZScsICdsaXN0aXRlbScpO1xuXHRcdGxpbmVIVE1MTm9kZS50YWJJbmRleCA9IDA7XG5cdFx0bGluZUhUTUxOb2RlLmNsYXNzTmFtZSA9ICdzdGlja3ktbGluZS1jb250ZW50Jztcblx0XHRsaW5lSFRNTE5vZGUuY2xhc3NMaXN0LmFkZChgc3RpY2t5TGluZSR7bGluZU51bWJlcn1gKTtcblx0XHRsaW5lSFRNTE5vZGUuc3R5bGUubGluZUhlaWdodCA9IGAke2xpbmVIZWlnaHR9cHhgO1xuXHRcdGxpbmVIVE1MTm9kZS5pbm5lckhUTUwgPSBuZXdMaW5lIGFzIHN0cmluZztcblxuXHRcdGNvbnN0IGxpbmVOdW1iZXJIVE1MTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRsaW5lTnVtYmVySFRNTE5vZGUuc2V0QXR0cmlidXRlKFNUSUNLWV9JTkRFWF9BVFRSLCBTdHJpbmcoaW5kZXgpKTtcblx0XHRsaW5lTnVtYmVySFRNTE5vZGUuc2V0QXR0cmlidXRlKFNUSUNLWV9JU19MSU5FX05VTUJFUl9BVFRSLCAnJyk7XG5cdFx0bGluZU51bWJlckhUTUxOb2RlLmNsYXNzTmFtZSA9ICdzdGlja3ktbGluZS1udW1iZXInO1xuXHRcdGxpbmVOdW1iZXJIVE1MTm9kZS5zdHlsZS5saW5lSGVpZ2h0ID0gYCR7bGluZUhlaWdodH1weGA7XG5cdFx0Y29uc3QgbGluZU51bWJlcnNXaWR0aCA9IGxheW91dEluZm8uY29udGVudExlZnQ7XG5cdFx0bGluZU51bWJlckhUTUxOb2RlLnN0eWxlLndpZHRoID0gYCR7bGluZU51bWJlcnNXaWR0aH1weGA7XG5cblx0XHRjb25zdCBpbm5lckxpbmVOdW1iZXJIVE1MID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdGlmIChsaW5lTnVtYmVyT3B0aW9uLnJlbmRlclR5cGUgPT09IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PbiB8fCBsaW5lTnVtYmVyT3B0aW9uLnJlbmRlclR5cGUgPT09IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5JbnRlcnZhbCAmJiBsaW5lTnVtYmVyICUgMTAgPT09IDApIHtcblx0XHRcdGlubmVyTGluZU51bWJlckhUTUwuaW5uZXJUZXh0ID0gbGluZU51bWJlci50b1N0cmluZygpO1xuXHRcdH0gZWxzZSBpZiAobGluZU51bWJlck9wdGlvbi5yZW5kZXJUeXBlID09PSBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuUmVsYXRpdmUpIHtcblx0XHRcdGlubmVyTGluZU51bWJlckhUTUwuaW5uZXJUZXh0ID0gTWF0aC5hYnMobGluZU51bWJlciAtIGVkaXRvci5nZXRQb3NpdGlvbigpIS5saW5lTnVtYmVyKS50b1N0cmluZygpO1xuXHRcdH1cblx0XHRpbm5lckxpbmVOdW1iZXJIVE1MLmNsYXNzTmFtZSA9ICdzdGlja3ktbGluZS1udW1iZXItaW5uZXInO1xuXHRcdGlubmVyTGluZU51bWJlckhUTUwuc3R5bGUud2lkdGggPSBgJHtsYXlvdXRJbmZvLmxpbmVOdW1iZXJzV2lkdGh9cHhgO1xuXHRcdGlubmVyTGluZU51bWJlckhUTUwuc3R5bGUucGFkZGluZ0xlZnQgPSBgJHtsYXlvdXRJbmZvLmxpbmVOdW1iZXJzTGVmdH1weGA7XG5cblx0XHRsaW5lTnVtYmVySFRNTE5vZGUuYXBwZW5kQ2hpbGQoaW5uZXJMaW5lTnVtYmVySFRNTCk7XG5cdFx0dGhpcy5mb2xkaW5nSWNvbiA9IHRoaXMuX3JlbmRlckZvbGRpbmdJY29uRm9yTGluZShlZGl0b3IsIGZvbGRpbmdNb2RlbCwgbGluZU51bWJlciwgbGluZUhlaWdodCwgaXNPbkdseXBoTWFyZ2luKTtcblx0XHRpZiAodGhpcy5mb2xkaW5nSWNvbikge1xuXHRcdFx0bGluZU51bWJlckhUTUxOb2RlLmFwcGVuZENoaWxkKHRoaXMuZm9sZGluZ0ljb24uZG9tTm9kZSk7XG5cdFx0XHR0aGlzLmZvbGRpbmdJY29uLmRvbU5vZGUuc3R5bGUubGVmdCA9IGAke2xheW91dEluZm8ubGluZU51bWJlcnNXaWR0aCArIGxheW91dEluZm8ubGluZU51bWJlcnNMZWZ0fXB4YDtcblx0XHRcdHRoaXMuZm9sZGluZ0ljb24uZG9tTm9kZS5zdHlsZS5saW5lSGVpZ2h0ID0gYCR7bGluZUhlaWdodH1weGA7XG5cdFx0fVxuXG5cdFx0ZWRpdG9yLmFwcGx5Rm9udEluZm8obGluZUhUTUxOb2RlKTtcblx0XHRlZGl0b3IuYXBwbHlGb250SW5mbyhsaW5lTnVtYmVySFRNTE5vZGUpO1xuXG5cdFx0bGluZU51bWJlckhUTUxOb2RlLnN0eWxlLmxpbmVIZWlnaHQgPSBgJHtsaW5lSGVpZ2h0fXB4YDtcblx0XHRsaW5lSFRNTE5vZGUuc3R5bGUubGluZUhlaWdodCA9IGAke2xpbmVIZWlnaHR9cHhgO1xuXHRcdGxpbmVOdW1iZXJIVE1MTm9kZS5zdHlsZS5oZWlnaHQgPSBgJHtsaW5lSGVpZ2h0fXB4YDtcblx0XHRsaW5lSFRNTE5vZGUuc3R5bGUuaGVpZ2h0ID0gYCR7bGluZUhlaWdodH1weGA7XG5cblx0XHR0aGlzLnNjcm9sbFdpZHRoID0gbGluZUhUTUxOb2RlLnNjcm9sbFdpZHRoO1xuXHRcdHRoaXMubGluZURvbU5vZGUgPSBsaW5lSFRNTE5vZGU7XG5cdFx0dGhpcy5saW5lTnVtYmVyRG9tTm9kZSA9IGxpbmVOdW1iZXJIVE1MTm9kZTtcblx0XHR0aGlzLmhlaWdodCA9IGxpbmVIZWlnaHQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJGb2xkaW5nSWNvbkZvckxpbmUoZWRpdG9yOiBJQ29kZUVkaXRvciwgZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwgfCB1bmRlZmluZWQsIGxpbmU6IG51bWJlciwgbGluZUhlaWdodDogbnVtYmVyLCBpc09uR2x5cGhNYXJnaW46IGJvb2xlYW4pOiBTdGlja3lGb2xkaW5nSWNvbiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2hvd0ZvbGRpbmdDb250cm9sczogJ21vdXNlb3ZlcicgfCAnYWx3YXlzJyB8ICduZXZlcicgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zaG93Rm9sZGluZ0NvbnRyb2xzKTtcblx0XHRpZiAoIWZvbGRpbmdNb2RlbCB8fCBzaG93Rm9sZGluZ0NvbnRyb2xzID09PSAnbmV2ZXInKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGZvbGRpbmdSZWdpb25zID0gZm9sZGluZ01vZGVsLnJlZ2lvbnM7XG5cdFx0Y29uc3QgaW5kZXhPZkZvbGRpbmdSZWdpb24gPSBmb2xkaW5nUmVnaW9ucy5maW5kUmFuZ2UobGluZSk7XG5cdFx0Y29uc3Qgc3RhcnRMaW5lTnVtYmVyID0gZm9sZGluZ1JlZ2lvbnMuZ2V0U3RhcnRMaW5lTnVtYmVyKGluZGV4T2ZGb2xkaW5nUmVnaW9uKTtcblx0XHRjb25zdCBpc0ZvbGRpbmdTY29wZSA9IGxpbmUgPT09IHN0YXJ0TGluZU51bWJlcjtcblx0XHRpZiAoIWlzRm9sZGluZ1Njb3BlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGlzQ29sbGFwc2VkID0gZm9sZGluZ1JlZ2lvbnMuaXNDb2xsYXBzZWQoaW5kZXhPZkZvbGRpbmdSZWdpb24pO1xuXHRcdGNvbnN0IGZvbGRpbmdJY29uID0gbmV3IFN0aWNreUZvbGRpbmdJY29uKGlzQ29sbGFwc2VkLCBzdGFydExpbmVOdW1iZXIsIGZvbGRpbmdSZWdpb25zLmdldEVuZExpbmVOdW1iZXIoaW5kZXhPZkZvbGRpbmdSZWdpb24pLCBsaW5lSGVpZ2h0KTtcblx0XHRmb2xkaW5nSWNvbi5zZXRWaXNpYmxlKGlzT25HbHlwaE1hcmdpbiA/IHRydWUgOiAoaXNDb2xsYXBzZWQgfHwgc2hvd0ZvbGRpbmdDb250cm9scyA9PT0gJ2Fsd2F5cycpKTtcblx0XHRmb2xkaW5nSWNvbi5kb21Ob2RlLnNldEF0dHJpYnV0ZShTVElDS1lfSVNfRk9MRElOR19JQ09OX0FUVFIsICcnKTtcblx0XHRyZXR1cm4gZm9sZGluZ0ljb247XG5cdH1cbn1cblxuY2xhc3MgU3RpY2t5Rm9sZGluZ0ljb24ge1xuXG5cdHB1YmxpYyBkb21Ob2RlOiBIVE1MRWxlbWVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgaXNDb2xsYXBzZWQ6IGJvb2xlYW4sXG5cdFx0cHVibGljIGZvbGRpbmdTdGFydExpbmU6IG51bWJlcixcblx0XHRwdWJsaWMgZm9sZGluZ0VuZExpbmU6IG51bWJlcixcblx0XHRwdWJsaWMgZGltZW5zaW9uOiBudW1iZXJcblx0KSB7XG5cdFx0dGhpcy5kb21Ob2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5kb21Ob2RlLnN0eWxlLndpZHRoID0gYDI2cHhgO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5oZWlnaHQgPSBgJHtkaW1lbnNpb259cHhgO1xuXHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5saW5lSGVpZ2h0ID0gYCR7ZGltZW5zaW9ufXB4YDtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NOYW1lID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGlzQ29sbGFwc2VkID8gZm9sZGluZ0NvbGxhcHNlZEljb24gOiBmb2xkaW5nRXhwYW5kZWRJY29uKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuY3Vyc29yID0gdmlzaWJsZSA/ICdwb2ludGVyJyA6ICdkZWZhdWx0Jztcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUub3BhY2l0eSA9IHZpc2libGUgPyAnMScgOiAnMCc7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGNBQWM7QUFDdkIsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLGlCQUFpQjtBQUMxQixPQUFPO0FBQ1AsU0FBOEQsdUNBQXVDO0FBQ3JHLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQTJCLGNBQWMsNkJBQTZCO0FBQ3RFLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQTJCLGlCQUFpQixzQkFBc0I7QUFDbEUsU0FBUyxzQkFBc0IsMkJBQTJCO0FBRTFELFNBQVMsZUFBZTtBQUdqQixNQUFNLHdCQUF3QjtBQUFBLEVBQ3BDLFlBQ1Usa0JBQ0EsZ0JBQ0EsMEJBQ0EsaUJBQWdDLE1BQ3hDO0FBSlE7QUFDQTtBQUNBO0FBQ0E7QUFBQSxFQUNOO0FBQUEsRUFFSixPQUFPLE9BQXFEO0FBQzNELFdBQU8sQ0FBQyxDQUFDLFNBQ0wsS0FBSyw2QkFB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
