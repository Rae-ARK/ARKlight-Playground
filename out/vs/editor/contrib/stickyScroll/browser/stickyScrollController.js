var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { MouseTargetType } from "../../../browser/editorBrowser.js";
import { ScrollType } from "../../../common/editorCommon.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { EditorOption, RenderLineNumbersType } from "../../../common/config/editorOptions.js";
import { StickyScrollWidget, StickyScrollWidgetState } from "./stickyScrollWidget.js";
import { StickyLineCandidateProvider } from "./stickyScrollProvider.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { ClickLinkGesture } from "../../gotoSymbol/browser/link/clickLinkGesture.js";
import { Range } from "../../../common/core/range.js";
import { getDefinitionsAtPosition } from "../../gotoSymbol/browser/goToSymbol.js";
import { goToDefinitionWithLocation } from "../../inlayHints/browser/inlayHintsLocations.js";
import { Position } from "../../../common/core/position.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { ILanguageFeatureDebounceService } from "../../../common/services/languageFeatureDebounce.js";
import * as dom from "../../../../base/browser/dom.js";
import { StickyRange } from "./stickyScrollElement.js";
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { FoldingController } from "../../folding/browser/folding.js";
import { toggleCollapseState } from "../../folding/browser/foldingModel.js";
import { Emitter } from "../../../../base/common/event.js";
import { mainWindow } from "../../../../base/browser/window.js";
let StickyScrollController = class extends Disposable {
  constructor(_editor, _contextMenuService, _languageFeaturesService, _instaService, _languageConfigurationService, _languageFeatureDebounceService, _contextKeyService) {
    super();
    this._editor = _editor;
    this._contextMenuService = _contextMenuService;
    this._languageFeaturesService = _languageFeaturesService;
    this._instaService = _instaService;
    this._contextKeyService = _contextKeyService;
    this._sessionStore = new DisposableStore();
    this._maxStickyLines = Number.MAX_SAFE_INTEGER;
    this._candidateDefinitionsLength = -1;
    this._focusedStickyElementIndex = -1;
    this._enabled = false;
    this._focused = false;
    this._positionRevealed = false;
    this._onMouseDown = false;
    this._endLineNumbers = [];
    this._mouseTarget = null;
    this._onDidChangeStickyScrollHeight = this._register(new Emitter());
    this.onDidChangeStickyScrollHeight = this._onDidChangeStickyScrollHeight.event;
    this._stickyScrollWidget = new StickyScrollWidget(this._editor);
    this._stickyLineCandidateProvider = new StickyLineCandidateProvider(this._editor, _languageFeaturesService, _languageConfigurationService);
    this._register(this._stickyScrollWidget);
    this._register(this._stickyLineCandidateProvider);
    this._widgetState = StickyScrollWidgetState.Empty;
    const stickyScrollDomNode = this._stickyScrollWidget.getDomNode();
    this._register(this._editor.onDidChangeLineHeight((e) => {
      e.changes.forEach((change) => {
        const lineNumber = change.lineNumber;
        if (this._widgetState.startLineNumbers.includes(lineNumber)) {
          this._renderStickyScroll(lineNumber);
        }
      });
    }));
    this._register(this._editor.onDidChangeFont((e) => {
      e.changes.forEach((change) => {
        const lineNumber = change.lineNumber;
        if (this._widgetState.startLineNumbers.includes(lineNumber)) {
          this._renderStickyScroll(lineNumber);
        }
      });
    }));
    this._register(this._editor.onDidChangeConfiguration((e) => {
      this._readConfigurationChange(e);
    }));
    this._register(dom.addDisposableListener(stickyScrollDomNode, dom.EventType.CONTEXT_MENU, async (event) => {
      this._onContextMenu(dom.getWindow(stickyScrollDomNode), event);
    }));
    this._stickyScrollFocusedContextKey = EditorContextKeys.stickyScrollFocused.bindTo(this._contextKeyService);
    this._stickyScrollVisibleContextKey = EditorContextKeys.stickyScrollVisible.bindTo(this._contextKeyService);
    const focusTracker = this._register(dom.trackFocus(stickyScrollDomNode));
    this._register(focusTracker.onDidBlur((_) => {
      if (this._positionRevealed === false && stickyScrollDomNode.clientHeight === 0) {
        this._focusedStickyElementIndex = -1;
        this.focus();
      } else {
        this._disposeFocusStickyScrollStore();
      }
    }));
    this._register(focusTracker.onDidFocus((_) => {
      this.focus();
    }));
    this._registerMouseListeners();
    this._register(dom.addDisposableListener(stickyScrollDomNode, dom.EventType.MOUSE_DOWN, (e) => {
      this._onMouseDown = true;
    }));
    this._register(this._stickyScrollWidget.onDidChangeStickyScrollHeight((e) => {
      this._onDidChangeStickyScrollHeight.fire(e);
    }));
    this._onDidResize();
    this._readConfiguration();
  }
  get stickyScrollCandidateProvider() {
    return this._stickyLineCandidateProvider;
  }
  get stickyScrollWidgetState() {
    return this._widgetState;
  }
  get stickyScrollWidgetHeight() {
    return this._stickyScrollWidget.height;
  }
  static get(editor) {
    return editor.getContribution(StickyScrollController.ID);
  }
  _disposeFocusStickyScrollStore() {
    this._stickyScrollFocusedContextKey.set(false);
    this._focusDisposableStore?.dispose();
    this._focused = false;
    this._positionRevealed = false;
    this._onMouseDown = false;
  }
  isFocused() {
    return this._focused;
  }
  focus() {
    if (this._onMouseDown) {
      this._onMouseDown = false;
      this._editor.focus();
      return;
    }
    const focusState = this._stickyScrollFocusedContextKey.get();
    if (focusState === true) {
      return;
    }
    this._focused = true;
    this._focusDisposableStore = new DisposableStore();
    this._stickyScrollFocusedContextKey.set(true);
    this._focusedStickyElementIndex = this._stickyScrollWidget.lineNumbers.length - 1;
    this._stickyScrollWidget.focusLineWithIndex(this._focusedStickyElementIndex);
  }
  focusNext() {
    if (this._focusedStickyElementIndex < this._stickyScrollWidget.lineNumberCount - 1) {
      this._focusNav(true);
    }
  }
  focusPrevious() {
    if (this._focusedStickyElementIndex > 0) {
      this._focusNav(false);
    }
  }
  selectEditor() {
    this._editor.focus();
  }
  // True is next, false is previous
  _focusNav(direction) {
    this._focusedStickyElementIndex = direction ? this._focusedStickyElementIndex + 1 : this._focusedStickyElementIndex - 1;
    this._stickyScrollWidget.focusLineWithIndex(this._focusedStickyElementIndex);
  }
  goToFocused() {
    const lineNumbers = this._stickyScrollWidget.lineNumbers;
    this._disposeFocusStickyScrollStore();
    this._revealPosition({ lineNumber: lineNumbers[this._focusedStickyElementIndex], column: 1 });
  }
  _revealPosition(position) {
    this._reveaInEditor(position, () => this._editor.revealPosition(position));
  }
  _revealLineInCenterIfOutsideViewport(position) {
    this._reveaInEditor(position, () => this._editor.revealLineInCenterIfOutsideViewport(position.lineNumber, ScrollType.Smooth));
  }
  _reveaInEditor(position, revealFunction) {
    if (this._focused) {
      this._disposeFocusStickyScrollStore();
    }
    this._positionRevealed = true;
    revealFunction();
    this._editor.setSelection(Range.fromPositions(position));
    this._editor.focus();
  }
  _registerMouseListeners() {
    const sessionStore = this._register(new DisposableStore());
    const gesture = this._register(new ClickLinkGesture(this._editor, {
      extractLineNumberFromMouseEvent: (e) => {
        const position = this._stickyScrollWidget.getEditorPositionFromNode(e.target.element);
        return position ? position.lineNumber : 0;
      }
    }));
    const getMouseEventTarget = (mouseEvent) => {
      if (!this._editor.hasModel()) {
        return null;
      }
      if (mouseEvent.target.type !== MouseTargetType.OVERLAY_WIDGET || mouseEvent.target.detail !== this._stickyScrollWidget.getId()) {
        return null;
      }
      const mouseTargetElement = mouseEvent.target.element;
      if (!mouseTargetElement || mouseTargetElement.innerText !== mouseTargetElement.innerHTML) {
        return null;
      }
      const position = this._stickyScrollWidget.getEditorPositionFromNode(mouseTargetElement);
      if (!position) {
        return null;
      }
      return {
        range: new Range(position.lineNumber, position.column, position.lineNumber, position.column + mouseTargetElement.innerText.length),
        textElement: mouseTargetElement
      };
    };
    const stickyScrollWidgetDomNode = this._stickyScrollWidget.getDomNode();
    this._register(dom.addStandardDisposableListener(stickyScrollWidgetDomNode, dom.EventType.CLICK, (mouseEvent) => {
      if (mouseEvent.ctrlKey || mouseEvent.altKey || mouseEvent.metaKey) {
        return;
      }
      if (!mouseEvent.leftButton) {
        return;
      }
      if (mouseEvent.shiftKey) {
        const lineIndex = this._stickyScrollWidget.getLineIndexFromChildDomNode(mouseEvent.target);
        if (lineIndex === null) {
          return;
        }
        const position2 = new Position(this._endLineNumbers[lineIndex], 1);
        this._revealLineInCenterIfOutsideViewport(position2);
        return;
      }
      const isInFoldingIconDomNode = this._stickyScrollWidget.isInFoldingIconDomNode(mouseEvent.target);
      if (isInFoldingIconDomNode) {
        const lineNumber = this._stickyScrollWidget.getLineNumberFromChildDomNode(mouseEvent.target);
        this._toggleFoldingRegionForLine(lineNumber);
        return;
      }
      const isInStickyLine = this._stickyScrollWidget.isInStickyLine(mouseEvent.target);
      if (!isInStickyLine) {
        return;
      }
      let position = this._stickyScrollWidget.getEditorPositionFromNode(mouseEvent.target);
      if (!position) {
        const lineNumber = this._stickyScrollWidget.getLineNumberFromChildDomNode(mouseEvent.target);
        if (lineNumber === null) {
          return;
        }
        position = new Position(lineNumber, 1);
      }
      this._revealPosition(position);
    }));
    this._register(dom.addDisposableListener(mainWindow, dom.EventType.MOUSE_MOVE, (mouseEvent) => {
      this._mouseTarget = mouseEvent.target;
      this._onMouseMoveOrKeyDown(mouseEvent);
    }));
    this._register(dom.addDisposableListener(mainWindow, dom.EventType.KEY_DOWN, (mouseEvent) => {
      this._onMouseMoveOrKeyDown(mouseEvent);
    }));
    this._register(dom.addDisposableListener(mainWindow, dom.EventType.KEY_UP, () => {
      if (this._showEndForLine !== void 0) {
        this._showEndForLine = void 0;
        this._renderStickyScroll();
      }
    }));
    this._register(gesture.onMouseMoveOrRelevantKeyDown(([mouseEvent, _keyboardEvent]) => {
      const mouseTarget = getMouseEventTarget(mouseEvent);
      if (!mouseTarget || !mouseEvent.hasTriggerModifier || !this._editor.hasModel()) {
        sessionStore.clear();
        return;
      }
      const { range, textElement } = mouseTarget;
      if (!range.equalsRange(this._stickyRangeProjectedOnEditor)) {
        this._stickyRangeProjectedOnEditor = range;
        sessionStore.clear();
      } else if (textElement.style.textDecoration === "underline") {
        return;
      }
      const cancellationToken = new CancellationTokenSource();
      sessionStore.add(toDisposable(() => cancellationToken.dispose(true)));
      let currentHTMLChild;
      getDefinitionsAtPosition(this._languageFeaturesService.definitionProvider, this._editor.getModel(), new Position(range.startLineNumber, range.startColumn + 1), false, cancellationToken.token).then(((candidateDefinitions) => {
        if (cancellationToken.token.isCancellationRequested) {
          return;
        }
        if (candidateDefinitions.length !== 0) {
          this._candidateDefinitionsLength = candidateDefinitions.length;
          const childHTML = textElement;
          if (currentHTMLChild !== childHTML) {
            sessionStore.clear();
            currentHTMLChild = childHTML;
            currentHTMLChild.style.textDecoration = "underline";
            sessionStore.add(toDisposable(() => {
              currentHTMLChild.style.textDecoration = "none";
            }));
          } else if (!currentHTMLChild) {
            currentHTMLChild = childHTML;
            currentHTMLChild.style.textDecoration = "underline";
            sessionStore.add(toDisposable(() => {
              currentHTMLChild.style.textDecoration = "none";
            }));
          }
        } else {
          sessionStore.clear();
        }
      }));
    }));
    this._register(gesture.onCancel(() => {
      sessionStore.clear();
    }));
    this._register(gesture.onExecute(async (e) => {
      if (e.target.type !== MouseTargetType.OVERLAY_WIDGET || e.target.detail !== this._stickyScrollWidget.getId()) {
        return;
      }
      const position = this._stickyScrollWidget.getEditorPositionFromNode(e.target.element);
      if (!position) {
        return;
      }
      if (!this._editor.hasModel() || !this._stickyRangeProjectedOnEditor) {
        return;
      }
      if (this._candidateDefinitionsLength > 1) {
        if (this._focused) {
          this._disposeFocusStickyScrollStore();
        }
        this._revealPosition({ lineNumber: position.lineNumber, column: 1 });
      }
      this._instaService.invokeFunction(goToDefinitionWithLocation, e, this._editor, { uri: this._editor.getModel().uri, range: this._stickyRangeProjectedOnEditor });
    }));
  }
  _onContextMenu(targetWindow, e) {
    const event = new StandardMouseEvent(targetWindow, e);
    this._contextMenuService.showContextMenu({
      menuId: MenuId.StickyScrollContext,
      getAnchor: () => event,
      menuActionOptions: { renderShortTitle: true }
    });
  }
  _onMouseMoveOrKeyDown(mouseEvent) {
    if (!mouseEvent.shiftKey) {
      return;
    }
    if (!this._mouseTarget || !dom.isHTMLElement(this._mouseTarget)) {
      return;
    }
    const currentEndForLineIndex = this._stickyScrollWidget.getLineIndexFromChildDomNode(this._mouseTarget);
    if (currentEndForLineIndex === null || this._showEndForLine === currentEndForLineIndex) {
      return;
    }
    this._showEndForLine = currentEndForLineIndex;
    this._renderStickyScroll();
  }
  _toggleFoldingRegionForLine(line) {
    if (!this._foldingModel || line === null) {
      return;
    }
    const stickyLine = this._stickyScrollWidget.getRenderedStickyLine(line);
    const foldingIcon = stickyLine?.foldingIcon;
    if (!foldingIcon) {
      return;
    }
    toggleCollapseState(this._foldingModel, 1, [line]);
    foldingIcon.isCollapsed = !foldingIcon.isCollapsed;
    const scrollTop = (foldingIcon.isCollapsed ? this._editor.getTopForLineNumber(foldingIcon.foldingEndLine) : this._editor.getTopForLineNumber(foldingIcon.foldingStartLine)) - this._editor.getOption(EditorOption.lineHeight) * stickyLine.index + 1;
    this._editor.setScrollTop(scrollTop);
    this._renderStickyScroll(line);
  }
  _readConfiguration() {
    const options = this._editor.getOption(EditorOption.stickyScroll);
    if (options.enabled === false) {
      this._editor.removeOverlayWidget(this._stickyScrollWidget);
      this._resetState();
      this._sessionStore.clear();
      this._enabled = false;
      return;
    } else if (options.enabled && !this._enabled) {
      this._editor.addOverlayWidget(this._stickyScrollWidget);
      this._sessionStore.add(this._editor.onDidScrollChange((e) => {
        if (e.scrollTopChanged) {
          this._showEndForLine = void 0;
          this._renderStickyScroll();
        }
      }));
      this._sessionStore.add(this._editor.onDidLayoutChange(() => this._onDidResize()));
      this._sessionStore.add(this._editor.onDidChangeModelTokens((e) => this._onTokensChange(e)));
      this._sessionStore.add(this._stickyLineCandidateProvider.onDidChangeStickyScroll(() => {
        this._showEndForLine = void 0;
        this._renderStickyScroll();
      }));
      this._enabled = true;
    }
    const lineNumberOption = this._editor.getOption(EditorOption.lineNumbers);
    if (lineNumberOption.renderType === RenderLineNumbersType.Relative) {
      if (!this._cursorPositionListener) {
        this._cursorPositionListener = this._editor.onDidChangeCursorPosition((e) => {
          if (this._positionLineNumber === e.position.lineNumber) {
            return;
          }
          this._positionLineNumber = e.position.lineNumber;
          this._showEndForLine = void 0;
          this._renderStickyScroll(0);
        });
        this._sessionStore.add(this._cursorPositionListener);
      }
    } else if (this._cursorPositionListener) {
      this._sessionStore.delete(this._cursorPositionListener);
      this._cursorPositionListener.dispose();
      this._cursorPositionListener = void 0;
    }
  }
  _readConfigurationChange(event) {
    if (event.hasChanged(EditorOption.stickyScroll) || event.hasChanged(EditorOption.minimap) || event.hasChanged(EditorOption.lineHeight) || event.hasChanged(EditorOption.showFoldingControls) || event.hasChanged(EditorOption.lineNumbers)) {
      this._readConfiguration();
    }
    if (event.hasChanged(EditorOption.lineNumbers) || event.hasChanged(EditorOption.folding) || event.hasChanged(EditorOption.showFoldingControls)) {
      this._renderStickyScroll(0);
    }
  }
  _needsUpdate(event) {
    const stickyLineNumbers = this._stickyScrollWidget.getCurrentLines();
    for (const stickyLineNumber of stickyLineNumbers) {
      for (const range of event.ranges) {
        if (stickyLineNumber >= range.fromLineNumber && stickyLineNumber <= range.toLineNumber) {
          return true;
        }
      }
    }
    return false;
  }
  _onTokensChange(event) {
    if (this._needsUpdate(event)) {
      this._renderStickyScroll(0);
    }
  }
  _onDidResize() {
    const layoutInfo = this._editor.getLayoutInfo();
    const theoreticalLines = layoutInfo.height / this._editor.getOption(EditorOption.lineHeight);
    this._maxStickyLines = Math.round(theoreticalLines * 0.25);
    this._renderStickyScroll(0);
  }
  async _renderStickyScroll(rebuildFromLine) {
    const model = this._editor.getModel();
    if (!model || model.isTooLargeForTokenization()) {
      this._resetState();
      return;
    }
    const nextRebuildFromLine = this._updateAndGetMinRebuildFromLine(rebuildFromLine);
    const stickyWidgetVersion = this._stickyLineCandidateProvider.getVersionId();
    const shouldUpdateState = stickyWidgetVersion === void 0 || stickyWidgetVersion === model.getVersionId();
    if (shouldUpdateState) {
      if (!this._focused) {
        await this._updateState(nextRebuildFromLine);
      } else {
        if (this._focusedStickyElementIndex === -1) {
          await this._updateState(nextRebuildFromLine);
          this._focusedStickyElementIndex = this._stickyScrollWidget.lineNumberCount - 1;
          if (this._focusedStickyElementIndex !== -1) {
            this._stickyScrollWidget.focusLineWithIndex(this._focusedStickyElementIndex);
          }
        } else {
          const focusedStickyElementLineNumber = this._stickyScrollWidget.lineNumbers[this._focusedStickyElementIndex];
          await this._updateState(nextRebuildFromLine);
          if (this._stickyScrollWidget.lineNumberCount === 0) {
            this._focusedStickyElementIndex = -1;
          } else {
            const previousFocusedLineNumberExists = this._stickyScrollWidget.lineNumbers.includes(focusedStickyElementLineNumber);
            if (!previousFocusedLineNumberExists) {
              this._focusedStickyElementIndex = this._stickyScrollWidget.lineNumberCount - 1;
            }
            this._stickyScrollWidget.focusLineWithIndex(this._focusedStickyElementIndex);
          }
        }
      }
    }
  }
  _updateAndGetMinRebuildFromLine(rebuildFromLine) {
    if (rebuildFromLine !== void 0) {
      const minRebuildFromLineOrInfinity = this._minRebuildFromLine !== void 0 ? this._minRebuildFromLine : Infinity;
      this._minRebuildFromLine = Math.min(rebuildFromLine, minRebuildFromLineOrInfinity);
    }
    return this._minRebuildFromLine;
  }
  async _updateState(rebuildFromLine) {
    this._minRebuildFromLine = void 0;
    this._foldingModel = await FoldingController.get(this._editor)?.getFoldingModel() ?? void 0;
    this._widgetState = this.findScrollWidgetState();
    const stickyWidgetHasLines = this._widgetState.startLineNumbers.length > 0;
    this._stickyScrollVisibleContextKey.set(stickyWidgetHasLines);
    this._stickyScrollWidget.setState(this._widgetState, this._foldingModel, rebuildFromLine);
  }
  async _resetState() {
    this._minRebuildFromLine = void 0;
    this._foldingModel = void 0;
    this._widgetState = StickyScrollWidgetState.Empty;
    this._stickyScrollVisibleContextKey.set(false);
    this._stickyScrollWidget.setState(void 0, void 0);
  }
  findScrollWidgetState() {
    const maxNumberStickyLines = Math.min(this._maxStickyLines, this._editor.getOption(EditorOption.stickyScroll).maxLineCount);
    const scrollTop = this._editor.getScrollTop();
    let lastLineRelativePosition = 0;
    const startLineNumbers = [];
    const endLineNumbers = [];
    const arrayVisibleRanges = this._editor.getVisibleRanges();
    if (arrayVisibleRanges.length !== 0) {
      const fullVisibleRange = new StickyRange(arrayVisibleRanges[0].startLineNumber, arrayVisibleRanges[arrayVisibleRanges.length - 1].endLineNumber);
      const candidateRanges = this._stickyLineCandidateProvider.getCandidateStickyLinesIntersecting(fullVisibleRange);
      for (const range of candidateRanges) {
        const start = range.startLineNumber;
        const end = range.endLineNumber;
        const topOfElement = range.top;
        const bottomOfElement = topOfElement + range.height;
        const topOfBeginningLine = this._editor.getTopForLineNumber(start) - scrollTop;
        const bottomOfEndLine = this._editor.getBottomForLineNumber(end) - scrollTop;
        if (topOfElement > topOfBeginningLine && topOfElement <= bottomOfEndLine) {
          startLineNumbers.push(start);
          endLineNumbers.push(end + 1);
          if (bottomOfElement > bottomOfEndLine) {
            lastLineRelativePosition = bottomOfEndLine - bottomOfElement;
          }
        }
        if (startLineNumbers.length === maxNumberStickyLines) {
          break;
        }
      }
    }
    this._endLineNumbers = endLineNumbers;
    return new StickyScrollWidgetState(startLineNumbers, endLineNumbers, lastLineRelativePosition, this._showEndForLine);
  }
  dispose() {
    super.dispose();
    this._sessionStore.dispose();
  }
};
StickyScrollController.ID = "store.contrib.stickyScrollController";
StickyScrollController = __decorateClass([
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, ILanguageFeaturesService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ILanguageConfigurationService),
  __decorateParam(5, ILanguageFeatureDebounceService),
  __decorateParam(6, IContextKeyService)
], StickyScrollController);
export {
  StickyScrollController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3N0aWNreVNjcm9sbC9icm93c2VyL3N0aWNreVNjcm9sbENvbnRyb2xsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIE1vdXNlVGFyZ2V0VHlwZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29udHJpYnV0aW9uLCBTY3JvbGxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24sIFJlbmRlckxpbmVOdW1iZXJzVHlwZSwgQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBTdGlja3lTY3JvbGxXaWRnZXQsIFN0aWNreVNjcm9sbFdpZGdldFN0YXRlIH0gZnJvbSAnLi9zdGlja3lTY3JvbGxXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVN0aWNreUxpbmVDYW5kaWRhdGVQcm92aWRlciwgU3RpY2t5TGluZUNhbmRpZGF0ZVByb3ZpZGVyIH0gZnJvbSAnLi9zdGlja3lTY3JvbGxQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJTW9kZWxUb2tlbnNDaGFuZ2VkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGV4dE1vZGVsRXZlbnRzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDbGlja0xpbmtHZXN0dXJlLCBDbGlja0xpbmtNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vZ290b1N5bWJvbC9icm93c2VyL2xpbmsvY2xpY2tMaW5rR2VzdHVyZS5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UsIFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgZ2V0RGVmaW5pdGlvbnNBdFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vZ290b1N5bWJvbC9icm93c2VyL2dvVG9TeW1ib2wuanMnO1xuaW1wb3J0IHsgZ29Ub0RlZmluaXRpb25XaXRoTG9jYXRpb24gfSBmcm9tICcuLi8uLi9pbmxheUhpbnRzL2Jyb3dzZXIvaW5sYXlIaW50c0xvY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24sIFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlQ29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2UuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RpY2t5UmFuZ2UgfSBmcm9tICcuL3N0aWNreVNjcm9sbEVsZW1lbnQuanMnO1xuaW1wb3J0IHsgSU1vdXNlRXZlbnQsIFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IEZvbGRpbmdDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vZm9sZGluZy9icm93c2VyL2ZvbGRpbmcuanMnO1xuaW1wb3J0IHsgRm9sZGluZ01vZGVsLCB0b2dnbGVDb2xsYXBzZVN0YXRlIH0gZnJvbSAnLi4vLi4vZm9sZGluZy9icm93c2VyL2ZvbGRpbmdNb2RlbC5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJU3RpY2t5U2Nyb2xsQ29udHJvbGxlciB7XG5cdGdldCBzdGlja3lTY3JvbGxDYW5kaWRhdGVQcm92aWRlcigpOiBJU3RpY2t5TGluZUNhbmRpZGF0ZVByb3ZpZGVyO1xuXHRnZXQgc3RpY2t5U2Nyb2xsV2lkZ2V0U3RhdGUoKTogU3RpY2t5U2Nyb2xsV2lkZ2V0U3RhdGU7XG5cdHJlYWRvbmx5IHN0aWNreVNjcm9sbFdpZGdldEhlaWdodDogbnVtYmVyO1xuXHRpc0ZvY3VzZWQoKTogYm9vbGVhbjtcblx0Zm9jdXMoKTogdm9pZDtcblx0Zm9jdXNOZXh0KCk6IHZvaWQ7XG5cdGZvY3VzUHJldmlvdXMoKTogdm9pZDtcblx0Z29Ub0ZvY3VzZWQoKTogdm9pZDtcblx0ZmluZFNjcm9sbFdpZGdldFN0YXRlKCk6IFN0aWNreVNjcm9sbFdpZGdldFN0YXRlO1xuXHRkaXNwb3NlKCk6IHZvaWQ7XG5cdHNlbGVjdEVkaXRvcigpOiB2b2lkO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVN0aWNreVNjcm9sbEhlaWdodDogRXZlbnQ8eyBoZWlnaHQ6IG51bWJlciB9Pjtcbn1cblxuZXhwb3J0IGNsYXNzIFN0aWNreVNjcm9sbENvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiwgSVN0aWNreVNjcm9sbENvbnRyb2xsZXIge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdzdG9yZS5jb250cmliLnN0aWNreVNjcm9sbENvbnRyb2xsZXInO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0aWNreVNjcm9sbFdpZGdldDogU3RpY2t5U2Nyb2xsV2lkZ2V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGlja3lMaW5lQ2FuZGlkYXRlUHJvdmlkZXI6IElTdGlja3lMaW5lQ2FuZGlkYXRlUHJvdmlkZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25TdG9yZTogRGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgX3dpZGdldFN0YXRlOiBTdGlja3lTY3JvbGxXaWRnZXRTdGF0ZTtcblx0cHJpdmF0ZSBfZm9sZGluZ01vZGVsOiBGb2xkaW5nTW9kZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX21heFN0aWNreUxpbmVzOiBudW1iZXIgPSBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUjtcblxuXHRwcml2YXRlIF9zdGlja3lSYW5nZVByb2plY3RlZE9uRWRpdG9yOiBJUmFuZ2UgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2NhbmRpZGF0ZURlZmluaXRpb25zTGVuZ3RoOiBudW1iZXIgPSAtMTtcblxuXHRwcml2YXRlIF9zdGlja3lTY3JvbGxGb2N1c2VkQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX3N0aWNreVNjcm9sbFZpc2libGVDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIF9mb2N1c0Rpc3Bvc2FibGVTdG9yZTogRGlzcG9zYWJsZVN0b3JlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9mb2N1c2VkU3RpY2t5RWxlbWVudEluZGV4OiBudW1iZXIgPSAtMTtcblx0cHJpdmF0ZSBfZW5hYmxlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF9mb2N1c2VkID0gZmFsc2U7XG5cdHByaXZhdGUgX3Bvc2l0aW9uUmV2ZWFsZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfb25Nb3VzZURvd24gPSBmYWxzZTtcblx0cHJpdmF0ZSBfZW5kTGluZU51bWJlcnM6IG51bWJlcltdID0gW107XG5cdHByaXZhdGUgX3Nob3dFbmRGb3JMaW5lOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX21pblJlYnVpbGRGcm9tTGluZTogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9tb3VzZVRhcmdldDogRXZlbnRUYXJnZXQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfY3Vyc29yUG9zaXRpb25MaXN0ZW5lcjogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Bvc2l0aW9uTGluZU51bWJlcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU3RpY2t5U2Nyb2xsSGVpZ2h0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBoZWlnaHQ6IG51bWJlciB9PigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3RpY2t5U2Nyb2xsSGVpZ2h0ID0gdGhpcy5fb25EaWRDaGFuZ2VTdGlja3lTY3JvbGxIZWlnaHQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIF9sYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSBfbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldCA9IG5ldyBTdGlja3lTY3JvbGxXaWRnZXQodGhpcy5fZWRpdG9yKTtcblx0XHR0aGlzLl9zdGlja3lMaW5lQ2FuZGlkYXRlUHJvdmlkZXIgPSBuZXcgU3RpY2t5TGluZUNhbmRpZGF0ZVByb3ZpZGVyKHRoaXMuX2VkaXRvciwgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLCBfbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdGlja3lMaW5lQ2FuZGlkYXRlUHJvdmlkZXIpO1xuXG5cdFx0dGhpcy5fd2lkZ2V0U3RhdGUgPSBTdGlja3lTY3JvbGxXaWRnZXRTdGF0ZS5FbXB0eTtcblx0XHRjb25zdCBzdGlja3lTY3JvbGxEb21Ob2RlID0gdGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmdldERvbU5vZGUoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VMaW5lSGVpZ2h0KChlKSA9PiB7XG5cdFx0XHRlLmNoYW5nZXMuZm9yRWFjaCgoY2hhbmdlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBjaGFuZ2UubGluZU51bWJlcjtcblx0XHRcdFx0aWYgKHRoaXMuX3dpZGdldFN0YXRlLnN0YXJ0TGluZU51bWJlcnMuaW5jbHVkZXMobGluZU51bWJlcikpIHtcblx0XHRcdFx0XHR0aGlzLl9yZW5kZXJTdGlja3lTY3JvbGwobGluZU51bWJlcik7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VGb250KChlKSA9PiB7XG5cdFx0XHRlLmNoYW5nZXMuZm9yRWFjaCgoY2hhbmdlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBjaGFuZ2UubGluZU51bWJlcjtcblx0XHRcdFx0aWYgKHRoaXMuX3dpZGdldFN0YXRlLnN0YXJ0TGluZU51bWJlcnMuaW5jbHVkZXMobGluZU51bWJlcikpIHtcblx0XHRcdFx0XHR0aGlzLl9yZW5kZXJTdGlja3lTY3JvbGwobGluZU51bWJlcik7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0dGhpcy5fcmVhZENvbmZpZ3VyYXRpb25DaGFuZ2UoZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoc3RpY2t5U2Nyb2xsRG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5DT05URVhUX01FTlUsIGFzeW5jIChldmVudDogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0dGhpcy5fb25Db250ZXh0TWVudShkb20uZ2V0V2luZG93KHN0aWNreVNjcm9sbERvbU5vZGUpLCBldmVudCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3N0aWNreVNjcm9sbEZvY3VzZWRDb250ZXh0S2V5ID0gRWRpdG9yQ29udGV4dEtleXMuc3RpY2t5U2Nyb2xsRm9jdXNlZC5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX3N0aWNreVNjcm9sbFZpc2libGVDb250ZXh0S2V5ID0gRWRpdG9yQ29udGV4dEtleXMuc3RpY2t5U2Nyb2xsVmlzaWJsZS5iaW5kVG8odGhpcy5fY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGNvbnN0IGZvY3VzVHJhY2tlciA9IHRoaXMuX3JlZ2lzdGVyKGRvbS50cmFja0ZvY3VzKHN0aWNreVNjcm9sbERvbU5vZGUpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRCbHVyKF8gPT4ge1xuXHRcdFx0Ly8gU3VwcG9zZSB0aGF0IHRoZSBibHVycmluZyBpcyBjYXVzZWQgYnkgc2Nyb2xsaW5nLCB0aGVuIGtlZXAgdGhlIGZvY3VzIG9uIHRoZSBzdGlja3kgc2Nyb2xsXG5cdFx0XHQvLyBUaGlzIGlzIGRldGVybWluZWQgYnkgdGhlIGZhY3QgdGhhdCB0aGUgaGVpZ2h0IG9mIHRoZSB3aWRnZXQgaGFzIGJlY29tZSB6ZXJvIGFuZCB0aGVyZSBoYXMgYmVlbiBubyBwb3NpdGlvbiByZXZlYWxpbmdcblx0XHRcdGlmICh0aGlzLl9wb3NpdGlvblJldmVhbGVkID09PSBmYWxzZSAmJiBzdGlja3lTY3JvbGxEb21Ob2RlLmNsaWVudEhlaWdodCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9mb2N1c2VkU3RpY2t5RWxlbWVudEluZGV4ID0gLTE7XG5cdFx0XHRcdHRoaXMuZm9jdXMoKTtcblxuXHRcdFx0fVxuXHRcdFx0Ly8gSW4gYWxsIG90aGVyIGNhc2VlcywgZGlzcG9zZSB0aGUgZm9jdXMgb24gdGhlIHN0aWNreSBzY3JvbGxcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9kaXNwb3NlRm9jdXNTdGlja3lTY3JvbGxTdG9yZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihmb2N1c1RyYWNrZXIub25EaWRGb2N1cyhfID0+IHtcblx0XHRcdHRoaXMuZm9jdXMoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJNb3VzZUxpc3RlbmVycygpO1xuXHRcdC8vIFN1cHBvc2UgdGhhdCBtb3VzZSBkb3duIG9uIHRoZSBzdGlja3kgc2Nyb2xsLCB0aGVuIGRvIG5vdCBmb2N1cyBvbiB0aGUgc3RpY2t5IHNjcm9sbCBiZWNhdXNlIHRoaXMgd2lsbCBiZSBmb2xsb3dlZCBieSB0aGUgcmV2ZWFsaW5nIG9mIGEgcG9zaXRpb25cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHN0aWNreVNjcm9sbERvbU5vZGUsIGRvbS5FdmVudFR5cGUuTU9VU0VfRE9XTiwgKGUpID0+IHtcblx0XHRcdHRoaXMuX29uTW91c2VEb3duID0gdHJ1ZTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0Lm9uRGlkQ2hhbmdlU3RpY2t5U2Nyb2xsSGVpZ2h0KChlKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVN0aWNreVNjcm9sbEhlaWdodC5maXJlKGUpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9vbkRpZFJlc2l6ZSgpO1xuXHRcdHRoaXMuX3JlYWRDb25maWd1cmF0aW9uKCk7XG5cdH1cblxuXHRnZXQgc3RpY2t5U2Nyb2xsQ2FuZGlkYXRlUHJvdmlkZXIoKTogSVN0aWNreUxpbmVDYW5kaWRhdGVQcm92aWRlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0aWNreUxpbmVDYW5kaWRhdGVQcm92aWRlcjtcblx0fVxuXG5cdGdldCBzdGlja3lTY3JvbGxXaWRnZXRTdGF0ZSgpOiBTdGlja3lTY3JvbGxXaWRnZXRTdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldFN0YXRlO1xuXHR9XG5cblx0Z2V0IHN0aWNreVNjcm9sbFdpZGdldEhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQuaGVpZ2h0O1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBnZXQoZWRpdG9yOiBJQ29kZUVkaXRvcik6IElTdGlja3lTY3JvbGxDb250cm9sbGVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRDb250cmlidXRpb248U3RpY2t5U2Nyb2xsQ29udHJvbGxlcj4oU3RpY2t5U2Nyb2xsQ29udHJvbGxlci5JRCk7XG5cdH1cblxuXHRwcml2YXRlIF9kaXNwb3NlRm9jdXNTdGlja3lTY3JvbGxTdG9yZSgpIHtcblx0XHR0aGlzLl9zdGlja3lTY3JvbGxGb2N1c2VkQ29udGV4dEtleS5zZXQoZmFsc2UpO1xuXHRcdHRoaXMuX2ZvY3VzRGlzcG9zYWJsZVN0b3JlPy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fZm9jdXNlZCA9IGZhbHNlO1xuXHRcdHRoaXMuX3Bvc2l0aW9uUmV2ZWFsZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9vbk1vdXNlRG93biA9IGZhbHNlO1xuXHR9XG5cblx0cHVibGljIGlzRm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZm9jdXNlZDtcblx0fVxuXG5cdHB1YmxpYyBmb2N1cygpOiB2b2lkIHtcblx0XHQvLyBJZiB0aGUgbW91c2UgaXMgZG93biwgZG8gbm90IGZvY3VzIG9uIHRoZSBzdGlja3kgc2Nyb2xsXG5cdFx0aWYgKHRoaXMuX29uTW91c2VEb3duKSB7XG5cdFx0XHR0aGlzLl9vbk1vdXNlRG93biA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGZvY3VzU3RhdGUgPSB0aGlzLl9zdGlja3lTY3JvbGxGb2N1c2VkQ29udGV4dEtleS5nZXQoKTtcblx0XHRpZiAoZm9jdXNTdGF0ZSA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9mb2N1c2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9mb2N1c0Rpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLl9zdGlja3lTY3JvbGxGb2N1c2VkQ29udGV4dEtleS5zZXQodHJ1ZSk7XG5cdFx0dGhpcy5fZm9jdXNlZFN0aWNreUVsZW1lbnRJbmRleCA9IHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5saW5lTnVtYmVycy5sZW5ndGggLSAxO1xuXHRcdHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5mb2N1c0xpbmVXaXRoSW5kZXgodGhpcy5fZm9jdXNlZFN0aWNreUVsZW1lbnRJbmRleCk7XG5cdH1cblxuXHRwdWJsaWMgZm9jdXNOZXh0KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9mb2N1c2VkU3RpY2t5RWxlbWVudEluZGV4IDwgdGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmxpbmVOdW1iZXJDb3VudCAtIDEpIHtcblx0XHRcdHRoaXMuX2ZvY3VzTmF2KHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBmb2N1c1ByZXZpb3VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9mb2N1c2VkU3RpY2t5RWxlbWVudEluZGV4ID4gMCkge1xuXHRcdFx0dGhpcy5fZm9jdXNOYXYoZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzZWxlY3RFZGl0b3IoKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cdH1cblxuXHQvLyBUcnVlIGlzIG5leHQsIGZhbHNlIGlzIHByZXZpb3VzXG5cdHByaXZhdGUgX2ZvY3VzTmF2KGRpcmVjdGlvbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2ZvY3VzZWRTdGlja3lFbGVtZW50SW5kZXggPSBkaXJlY3Rpb24gPyB0aGlzLl9mb2N1c2VkU3RpY2t5RWxlbWVudEluZGV4ICsgMSA6IHRoaXMuX2ZvY3VzZWRTdGlja3lFbGVtZW50SW5kZXggLSAxO1xuXHRcdHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5mb2N1c0xpbmVXaXRoSW5kZXgodGhpcy5fZm9jdXNlZFN0aWNreUVsZW1lbnRJbmRleCk7XG5cdH1cblxuXHRwdWJsaWMgZ29Ub0ZvY3VzZWQoKTogdm9pZCB7XG5cdFx0Y29uc3QgbGluZU51bWJlcnMgPSB0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQubGluZU51bWJlcnM7XG5cdFx0dGhpcy5fZGlzcG9zZUZvY3VzU3RpY2t5U2Nyb2xsU3RvcmUoKTtcblx0XHR0aGlzLl9yZXZlYWxQb3NpdGlvbih7IGxpbmVOdW1iZXI6IGxpbmVOdW1iZXJzW3RoaXMuX2ZvY3VzZWRTdGlja3lFbGVtZW50SW5kZXhdLCBjb2x1bW46IDEgfSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXZlYWxQb3NpdGlvbihwb3NpdGlvbjogSVBvc2l0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fcmV2ZWFJbkVkaXRvcihwb3NpdGlvbiwgKCkgPT4gdGhpcy5fZWRpdG9yLnJldmVhbFBvc2l0aW9uKHBvc2l0aW9uKSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXZlYWxMaW5lSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChwb3NpdGlvbjogSVBvc2l0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fcmV2ZWFJbkVkaXRvcihwb3NpdGlvbiwgKCkgPT4gdGhpcy5fZWRpdG9yLnJldmVhbExpbmVJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KHBvc2l0aW9uLmxpbmVOdW1iZXIsIFNjcm9sbFR5cGUuU21vb3RoKSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXZlYUluRWRpdG9yKHBvc2l0aW9uOiBJUG9zaXRpb24sIHJldmVhbEZ1bmN0aW9uOiAoKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2ZvY3VzZWQpIHtcblx0XHRcdHRoaXMuX2Rpc3Bvc2VGb2N1c1N0aWNreVNjcm9sbFN0b3JlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Bvc2l0aW9uUmV2ZWFsZWQgPSB0cnVlO1xuXHRcdHJldmVhbEZ1bmN0aW9uKCk7XG5cdFx0dGhpcy5fZWRpdG9yLnNldFNlbGVjdGlvbihSYW5nZS5mcm9tUG9zaXRpb25zKHBvc2l0aW9uKSk7XG5cdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3Rlck1vdXNlTGlzdGVuZXJzKCk6IHZvaWQge1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblN0b3JlID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBnZXN0dXJlID0gdGhpcy5fcmVnaXN0ZXIobmV3IENsaWNrTGlua0dlc3R1cmUodGhpcy5fZWRpdG9yLCB7XG5cdFx0XHRleHRyYWN0TGluZU51bWJlckZyb21Nb3VzZUV2ZW50OiAoZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5nZXRFZGl0b3JQb3NpdGlvbkZyb21Ob2RlKGUudGFyZ2V0LmVsZW1lbnQpO1xuXHRcdFx0XHRyZXR1cm4gcG9zaXRpb24gPyBwb3NpdGlvbi5saW5lTnVtYmVyIDogMDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBnZXRNb3VzZUV2ZW50VGFyZ2V0ID0gKG1vdXNlRXZlbnQ6IENsaWNrTGlua01vdXNlRXZlbnQpOiB7IHJhbmdlOiBSYW5nZTsgdGV4dEVsZW1lbnQ6IEhUTUxFbGVtZW50IH0gfCBudWxsID0+IHtcblx0XHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0XHRpZiAobW91c2VFdmVudC50YXJnZXQudHlwZSAhPT0gTW91c2VUYXJnZXRUeXBlLk9WRVJMQVlfV0lER0VUIHx8IG1vdXNlRXZlbnQudGFyZ2V0LmRldGFpbCAhPT0gdGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmdldElkKCkpIHtcblx0XHRcdFx0Ly8gbm90IGhvdmVyaW5nIG92ZXIgb3VyIHdpZGdldFxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG1vdXNlVGFyZ2V0RWxlbWVudCA9IG1vdXNlRXZlbnQudGFyZ2V0LmVsZW1lbnQ7XG5cdFx0XHRpZiAoIW1vdXNlVGFyZ2V0RWxlbWVudCB8fCBtb3VzZVRhcmdldEVsZW1lbnQuaW5uZXJUZXh0ICE9PSBtb3VzZVRhcmdldEVsZW1lbnQuaW5uZXJIVE1MKSB7XG5cdFx0XHRcdC8vIG5vdCBvbiBhIHNwYW4gZWxlbWVudCByZW5kZXJpbmcgdGV4dFxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmdldEVkaXRvclBvc2l0aW9uRnJvbU5vZGUobW91c2VUYXJnZXRFbGVtZW50KTtcblx0XHRcdGlmICghcG9zaXRpb24pIHtcblx0XHRcdFx0Ly8gbm90IGhvdmVyaW5nIGEgc3RpY2t5IHNjcm9sbCBsaW5lXG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiArIG1vdXNlVGFyZ2V0RWxlbWVudC5pbm5lclRleHQubGVuZ3RoKSxcblx0XHRcdFx0dGV4dEVsZW1lbnQ6IG1vdXNlVGFyZ2V0RWxlbWVudFxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3RpY2t5U2Nyb2xsV2lkZ2V0RG9tTm9kZSA9IHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5nZXREb21Ob2RlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHN0aWNreVNjcm9sbFdpZGdldERvbU5vZGUsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIChtb3VzZUV2ZW50OiBJTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0aWYgKG1vdXNlRXZlbnQuY3RybEtleSB8fCBtb3VzZUV2ZW50LmFsdEtleSB8fCBtb3VzZUV2ZW50Lm1ldGFLZXkpIHtcblx0XHRcdFx0Ly8gbW9kaWZpZXIgcHJlc3NlZFxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIW1vdXNlRXZlbnQubGVmdEJ1dHRvbikge1xuXHRcdFx0XHQvLyBub3QgbGVmdCBjbGlja1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAobW91c2VFdmVudC5zaGlmdEtleSkge1xuXHRcdFx0XHQvLyBzaGlmdCBjbGlja1xuXHRcdFx0XHRjb25zdCBsaW5lSW5kZXggPSB0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQuZ2V0TGluZUluZGV4RnJvbUNoaWxkRG9tTm9kZShtb3VzZUV2ZW50LnRhcmdldCk7XG5cdFx0XHRcdGlmIChsaW5lSW5kZXggPT09IG51bGwpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24odGhpcy5fZW5kTGluZU51bWJlcnNbbGluZUluZGV4XSwgMSk7XG5cdFx0XHRcdHRoaXMuX3JldmVhbExpbmVJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0KHBvc2l0aW9uKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaXNJbkZvbGRpbmdJY29uRG9tTm9kZSA9IHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5pc0luRm9sZGluZ0ljb25Eb21Ob2RlKG1vdXNlRXZlbnQudGFyZ2V0KTtcblx0XHRcdGlmIChpc0luRm9sZGluZ0ljb25Eb21Ob2RlKSB7XG5cdFx0XHRcdC8vIGNsaWNrZWQgb24gZm9sZGluZyBpY29uXG5cdFx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSB0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQuZ2V0TGluZU51bWJlckZyb21DaGlsZERvbU5vZGUobW91c2VFdmVudC50YXJnZXQpO1xuXHRcdFx0XHR0aGlzLl90b2dnbGVGb2xkaW5nUmVnaW9uRm9yTGluZShsaW5lTnVtYmVyKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaXNJblN0aWNreUxpbmUgPSB0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQuaXNJblN0aWNreUxpbmUobW91c2VFdmVudC50YXJnZXQpO1xuXHRcdFx0aWYgKCFpc0luU3RpY2t5TGluZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBub3JtYWwgY2xpY2tcblx0XHRcdGxldCBwb3NpdGlvbiA9IHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5nZXRFZGl0b3JQb3NpdGlvbkZyb21Ob2RlKG1vdXNlRXZlbnQudGFyZ2V0KTtcblx0XHRcdGlmICghcG9zaXRpb24pIHtcblx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5nZXRMaW5lTnVtYmVyRnJvbUNoaWxkRG9tTm9kZShtb3VzZUV2ZW50LnRhcmdldCk7XG5cdFx0XHRcdGlmIChsaW5lTnVtYmVyID09PSBudWxsKSB7XG5cdFx0XHRcdFx0Ly8gbm90IGhvdmVyaW5nIGEgc3RpY2t5IHNjcm9sbCBsaW5lXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKGxpbmVOdW1iZXIsIDEpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcmV2ZWFsUG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG1haW5XaW5kb3csIGRvbS5FdmVudFR5cGUuTU9VU0VfTU9WRSwgbW91c2VFdmVudCA9PiB7XG5cdFx0XHR0aGlzLl9tb3VzZVRhcmdldCA9IG1vdXNlRXZlbnQudGFyZ2V0O1xuXHRcdFx0dGhpcy5fb25Nb3VzZU1vdmVPcktleURvd24obW91c2VFdmVudCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobWFpbldpbmRvdywgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgbW91c2VFdmVudCA9PiB7XG5cdFx0XHR0aGlzLl9vbk1vdXNlTW92ZU9yS2V5RG93bihtb3VzZUV2ZW50KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihtYWluV2luZG93LCBkb20uRXZlbnRUeXBlLktFWV9VUCwgKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX3Nob3dFbmRGb3JMaW5lICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5fc2hvd0VuZEZvckxpbmUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX3JlbmRlclN0aWNreVNjcm9sbCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGdlc3R1cmUub25Nb3VzZU1vdmVPclJlbGV2YW50S2V5RG93bigoW21vdXNlRXZlbnQsIF9rZXlib2FyZEV2ZW50XSkgPT4ge1xuXHRcdFx0Y29uc3QgbW91c2VUYXJnZXQgPSBnZXRNb3VzZUV2ZW50VGFyZ2V0KG1vdXNlRXZlbnQpO1xuXHRcdFx0aWYgKCFtb3VzZVRhcmdldCB8fCAhbW91c2VFdmVudC5oYXNUcmlnZ2VyTW9kaWZpZXIgfHwgIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdHNlc3Npb25TdG9yZS5jbGVhcigpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB7IHJhbmdlLCB0ZXh0RWxlbWVudCB9ID0gbW91c2VUYXJnZXQ7XG5cblx0XHRcdGlmICghcmFuZ2UuZXF1YWxzUmFuZ2UodGhpcy5fc3RpY2t5UmFuZ2VQcm9qZWN0ZWRPbkVkaXRvcikpIHtcblx0XHRcdFx0dGhpcy5fc3RpY2t5UmFuZ2VQcm9qZWN0ZWRPbkVkaXRvciA9IHJhbmdlO1xuXHRcdFx0XHRzZXNzaW9uU3RvcmUuY2xlYXIoKTtcblx0XHRcdH0gZWxzZSBpZiAodGV4dEVsZW1lbnQuc3R5bGUudGV4dERlY29yYXRpb24gPT09ICd1bmRlcmxpbmUnKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY2FuY2VsbGF0aW9uVG9rZW4gPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdHNlc3Npb25TdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGNhbmNlbGxhdGlvblRva2VuLmRpc3Bvc2UodHJ1ZSkpKTtcblxuXHRcdFx0bGV0IGN1cnJlbnRIVE1MQ2hpbGQ6IEhUTUxFbGVtZW50O1xuXG5cdFx0XHRnZXREZWZpbml0aW9uc0F0UG9zaXRpb24odGhpcy5fbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuZGVmaW5pdGlvblByb3ZpZGVyLCB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSwgbmV3IFBvc2l0aW9uKHJhbmdlLnN0YXJ0TGluZU51bWJlciwgcmFuZ2Uuc3RhcnRDb2x1bW4gKyAxKSwgZmFsc2UsIGNhbmNlbGxhdGlvblRva2VuLnRva2VuKS50aGVuKChjYW5kaWRhdGVEZWZpbml0aW9ucyA9PiB7XG5cdFx0XHRcdGlmIChjYW5jZWxsYXRpb25Ub2tlbi50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY2FuZGlkYXRlRGVmaW5pdGlvbnMubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fY2FuZGlkYXRlRGVmaW5pdGlvbnNMZW5ndGggPSBjYW5kaWRhdGVEZWZpbml0aW9ucy5sZW5ndGg7XG5cdFx0XHRcdFx0Y29uc3QgY2hpbGRIVE1MOiBIVE1MRWxlbWVudCA9IHRleHRFbGVtZW50O1xuXHRcdFx0XHRcdGlmIChjdXJyZW50SFRNTENoaWxkICE9PSBjaGlsZEhUTUwpIHtcblx0XHRcdFx0XHRcdHNlc3Npb25TdG9yZS5jbGVhcigpO1xuXHRcdFx0XHRcdFx0Y3VycmVudEhUTUxDaGlsZCA9IGNoaWxkSFRNTDtcblx0XHRcdFx0XHRcdGN1cnJlbnRIVE1MQ2hpbGQuc3R5bGUudGV4dERlY29yYXRpb24gPSAndW5kZXJsaW5lJztcblx0XHRcdFx0XHRcdHNlc3Npb25TdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0Y3VycmVudEhUTUxDaGlsZC5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9ICdub25lJztcblx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKCFjdXJyZW50SFRNTENoaWxkKSB7XG5cdFx0XHRcdFx0XHRjdXJyZW50SFRNTENoaWxkID0gY2hpbGRIVE1MO1xuXHRcdFx0XHRcdFx0Y3VycmVudEhUTUxDaGlsZC5zdHlsZS50ZXh0RGVjb3JhdGlvbiA9ICd1bmRlcmxpbmUnO1xuXHRcdFx0XHRcdFx0c2Vzc2lvblN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRjdXJyZW50SFRNTENoaWxkLnN0eWxlLnRleHREZWNvcmF0aW9uID0gJ25vbmUnO1xuXHRcdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZXNzaW9uU3RvcmUuY2xlYXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihnZXN0dXJlLm9uQ2FuY2VsKCgpID0+IHtcblx0XHRcdHNlc3Npb25TdG9yZS5jbGVhcigpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihnZXN0dXJlLm9uRXhlY3V0ZShhc3luYyBlID0+IHtcblx0XHRcdGlmIChlLnRhcmdldC50eXBlICE9PSBNb3VzZVRhcmdldFR5cGUuT1ZFUkxBWV9XSURHRVQgfHwgZS50YXJnZXQuZGV0YWlsICE9PSB0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQuZ2V0SWQoKSkge1xuXHRcdFx0XHQvLyBub3QgaG92ZXJpbmcgb3ZlciBvdXIgd2lkZ2V0XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gdGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmdldEVkaXRvclBvc2l0aW9uRnJvbU5vZGUoZS50YXJnZXQuZWxlbWVudCk7XG5cdFx0XHRpZiAoIXBvc2l0aW9uKSB7XG5cdFx0XHRcdC8vIG5vdCBob3ZlcmluZyBhIHN0aWNreSBzY3JvbGwgbGluZVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpIHx8ICF0aGlzLl9zdGlja3lSYW5nZVByb2plY3RlZE9uRWRpdG9yKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9jYW5kaWRhdGVEZWZpbml0aW9uc0xlbmd0aCA+IDEpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2ZvY3VzZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9kaXNwb3NlRm9jdXNTdGlja3lTY3JvbGxTdG9yZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3JldmVhbFBvc2l0aW9uKHsgbGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlciwgY29sdW1uOiAxIH0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5faW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGdvVG9EZWZpbml0aW9uV2l0aExvY2F0aW9uLCBlLCB0aGlzLl9lZGl0b3IsIHsgdXJpOiB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKS51cmksIHJhbmdlOiB0aGlzLl9zdGlja3lSYW5nZVByb2plY3RlZE9uRWRpdG9yIH0pO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX29uQ29udGV4dE1lbnUodGFyZ2V0V2luZG93OiBXaW5kb3csIGU6IE1vdXNlRXZlbnQpIHtcblx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQodGFyZ2V0V2luZG93LCBlKTtcblxuXHRcdHRoaXMuX2NvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0bWVudUlkOiBNZW51SWQuU3RpY2t5U2Nyb2xsQ29udGV4dCxcblx0XHRcdGdldEFuY2hvcjogKCkgPT4gZXZlbnQsXG5cdFx0XHRtZW51QWN0aW9uT3B0aW9uczogeyByZW5kZXJTaG9ydFRpdGxlOiB0cnVlIH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9vbk1vdXNlTW92ZU9yS2V5RG93bihtb3VzZUV2ZW50OiBLZXlib2FyZEV2ZW50IHwgTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGlmICghbW91c2VFdmVudC5zaGlmdEtleSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuX21vdXNlVGFyZ2V0IHx8ICFkb20uaXNIVE1MRWxlbWVudCh0aGlzLl9tb3VzZVRhcmdldCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudEVuZEZvckxpbmVJbmRleCA9IHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5nZXRMaW5lSW5kZXhGcm9tQ2hpbGREb21Ob2RlKHRoaXMuX21vdXNlVGFyZ2V0KTtcblx0XHRpZiAoY3VycmVudEVuZEZvckxpbmVJbmRleCA9PT0gbnVsbCB8fCB0aGlzLl9zaG93RW5kRm9yTGluZSA9PT0gY3VycmVudEVuZEZvckxpbmVJbmRleCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zaG93RW5kRm9yTGluZSA9IGN1cnJlbnRFbmRGb3JMaW5lSW5kZXg7XG5cdFx0dGhpcy5fcmVuZGVyU3RpY2t5U2Nyb2xsKCk7XG5cdH1cblxuXHRwcml2YXRlIF90b2dnbGVGb2xkaW5nUmVnaW9uRm9yTGluZShsaW5lOiBudW1iZXIgfCBudWxsKSB7XG5cdFx0aWYgKCF0aGlzLl9mb2xkaW5nTW9kZWwgfHwgbGluZSA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdGlja3lMaW5lID0gdGhpcy5fc3RpY2t5U2Nyb2xsV2lkZ2V0LmdldFJlbmRlcmVkU3RpY2t5TGluZShsaW5lKTtcblx0XHRjb25zdCBmb2xkaW5nSWNvbiA9IHN0aWNreUxpbmU/LmZvbGRpbmdJY29uO1xuXHRcdGlmICghZm9sZGluZ0ljb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dG9nZ2xlQ29sbGFwc2VTdGF0ZSh0aGlzLl9mb2xkaW5nTW9kZWwsIDEsIFtsaW5lXSk7XG5cdFx0Zm9sZGluZ0ljb24uaXNDb2xsYXBzZWQgPSAhZm9sZGluZ0ljb24uaXNDb2xsYXBzZWQ7XG5cdFx0Y29uc3Qgc2Nyb2xsVG9wID0gKGZvbGRpbmdJY29uLmlzQ29sbGFwc2VkID9cblx0XHRcdHRoaXMuX2VkaXRvci5nZXRUb3BGb3JMaW5lTnVtYmVyKGZvbGRpbmdJY29uLmZvbGRpbmdFbmRMaW5lKVxuXHRcdFx0OiB0aGlzLl9lZGl0b3IuZ2V0VG9wRm9yTGluZU51bWJlcihmb2xkaW5nSWNvbi5mb2xkaW5nU3RhcnRMaW5lKSlcblx0XHRcdC0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCkgKiBzdGlja3lMaW5lLmluZGV4ICsgMTtcblx0XHR0aGlzLl9lZGl0b3Iuc2V0U2Nyb2xsVG9wKHNjcm9sbFRvcCk7XG5cdFx0dGhpcy5fcmVuZGVyU3RpY2t5U2Nyb2xsKGxpbmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZENvbmZpZ3VyYXRpb24oKSB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN0aWNreVNjcm9sbCk7XG5cdFx0aWYgKG9wdGlvbnMuZW5hYmxlZCA9PT0gZmFsc2UpIHtcblx0XHRcdHRoaXMuX2VkaXRvci5yZW1vdmVPdmVybGF5V2lkZ2V0KHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldCk7XG5cdFx0XHR0aGlzLl9yZXNldFN0YXRlKCk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uU3RvcmUuY2xlYXIoKTtcblx0XHRcdHRoaXMuX2VuYWJsZWQgPSBmYWxzZTtcblx0XHRcdHJldHVybjtcblx0XHR9IGVsc2UgaWYgKG9wdGlvbnMuZW5hYmxlZCAmJiAhdGhpcy5fZW5hYmxlZCkge1xuXHRcdFx0Ly8gV2hlbiBzdGlja3kgc2Nyb2xsIHdhcyBqdXN0IGVuYWJsZWQsIGFkZCB0aGUgbGlzdGVuZXJzIG9uIHRoZSBzdGlja3kgc2Nyb2xsXG5cdFx0XHR0aGlzLl9lZGl0b3IuYWRkT3ZlcmxheVdpZGdldCh0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvblN0b3JlLmFkZCh0aGlzLl9lZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UoKGUpID0+IHtcblx0XHRcdFx0aWYgKGUuc2Nyb2xsVG9wQ2hhbmdlZCkge1xuXHRcdFx0XHRcdHRoaXMuX3Nob3dFbmRGb3JMaW5lID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRoaXMuX3JlbmRlclN0aWNreVNjcm9sbCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uU3RvcmUuYWRkKHRoaXMuX2VkaXRvci5vbkRpZExheW91dENoYW5nZSgoKSA9PiB0aGlzLl9vbkRpZFJlc2l6ZSgpKSk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uU3RvcmUuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsVG9rZW5zKChlKSA9PiB0aGlzLl9vblRva2Vuc0NoYW5nZShlKSkpO1xuXHRcdFx0dGhpcy5fc2Vzc2lvblN0b3JlLmFkZCh0aGlzLl9zdGlja3lMaW5lQ2FuZGlkYXRlUHJvdmlkZXIub25EaWRDaGFuZ2VTdGlja3lTY3JvbGwoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zaG93RW5kRm9yTGluZSA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fcmVuZGVyU3RpY2t5U2Nyb2xsKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9lbmFibGVkID0gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBsaW5lTnVtYmVyT3B0aW9uID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZU51bWJlcnMpO1xuXHRcdGlmIChsaW5lTnVtYmVyT3B0aW9uLnJlbmRlclR5cGUgPT09IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5SZWxhdGl2ZSkge1xuXHRcdFx0aWYgKCF0aGlzLl9jdXJzb3JQb3NpdGlvbkxpc3RlbmVyKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnNvclBvc2l0aW9uTGlzdGVuZXIgPSB0aGlzLl9lZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbigoZSkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9wb3NpdGlvbkxpbmVOdW1iZXIgPT09IGUucG9zaXRpb24ubGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9wb3NpdGlvbkxpbmVOdW1iZXIgPSBlLnBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0dGhpcy5fc2hvd0VuZEZvckxpbmUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fcmVuZGVyU3RpY2t5U2Nyb2xsKDApO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvblN0b3JlLmFkZCh0aGlzLl9jdXJzb3JQb3NpdGlvbkxpc3RlbmVyKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHRoaXMuX2N1cnNvclBvc2l0aW9uTGlzdGVuZXIpIHtcblx0XHRcdHRoaXMuX3Nlc3Npb25TdG9yZS5kZWxldGUodGhpcy5fY3Vyc29yUG9zaXRpb25MaXN0ZW5lcik7XG5cdFx0XHR0aGlzLl9jdXJzb3JQb3NpdGlvbkxpc3RlbmVyLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2N1cnNvclBvc2l0aW9uTGlzdGVuZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZENvbmZpZ3VyYXRpb25DaGFuZ2UoZXZlbnQ6IENvbmZpZ3VyYXRpb25DaGFuZ2VkRXZlbnQpIHtcblx0XHRpZiAoXG5cdFx0XHRldmVudC5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5zdGlja3lTY3JvbGwpXG5cdFx0XHR8fCBldmVudC5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5taW5pbWFwKVxuXHRcdFx0fHwgZXZlbnQuaGFzQ2hhbmdlZChFZGl0b3JPcHRpb24ubGluZUhlaWdodClcblx0XHRcdHx8IGV2ZW50Lmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLnNob3dGb2xkaW5nQ29udHJvbHMpXG5cdFx0XHR8fCBldmVudC5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5saW5lTnVtYmVycylcblx0XHQpIHtcblx0XHRcdHRoaXMuX3JlYWRDb25maWd1cmF0aW9uKCk7XG5cdFx0fVxuXG5cdFx0aWYgKGV2ZW50Lmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmxpbmVOdW1iZXJzKSB8fCBldmVudC5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5mb2xkaW5nKSB8fCBldmVudC5oYXNDaGFuZ2VkKEVkaXRvck9wdGlvbi5zaG93Rm9sZGluZ0NvbnRyb2xzKSkge1xuXHRcdFx0dGhpcy5fcmVuZGVyU3RpY2t5U2Nyb2xsKDApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX25lZWRzVXBkYXRlKGV2ZW50OiBJTW9kZWxUb2tlbnNDaGFuZ2VkRXZlbnQpIHtcblx0XHRjb25zdCBzdGlja3lMaW5lTnVtYmVycyA9IHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5nZXRDdXJyZW50TGluZXMoKTtcblx0XHRmb3IgKGNvbnN0IHN0aWNreUxpbmVOdW1iZXIgb2Ygc3RpY2t5TGluZU51bWJlcnMpIHtcblx0XHRcdGZvciAoY29uc3QgcmFuZ2Ugb2YgZXZlbnQucmFuZ2VzKSB7XG5cdFx0XHRcdGlmIChzdGlja3lMaW5lTnVtYmVyID49IHJhbmdlLmZyb21MaW5lTnVtYmVyICYmIHN0aWNreUxpbmVOdW1iZXIgPD0gcmFuZ2UudG9MaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25Ub2tlbnNDaGFuZ2UoZXZlbnQ6IElNb2RlbFRva2Vuc0NoYW5nZWRFdmVudCkge1xuXHRcdGlmICh0aGlzLl9uZWVkc1VwZGF0ZShldmVudCkpIHtcblx0XHRcdC8vIFJlYnVpbGRpbmcgdGhlIHdob2xlIHdpZGdldCBmcm9tIGxpbmUgMFxuXHRcdFx0dGhpcy5fcmVuZGVyU3RpY2t5U2Nyb2xsKDApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uRGlkUmVzaXplKCkge1xuXHRcdGNvbnN0IGxheW91dEluZm8gPSB0aGlzLl9lZGl0b3IuZ2V0TGF5b3V0SW5mbygpO1xuXHRcdC8vIE1ha2Ugc3VyZSBzdGlja3kgc2Nyb2xsIGRvZXNuJ3QgdGFrZSB1cCBtb3JlIHRoYW4gMjUlIG9mIHRoZSBlZGl0b3Jcblx0XHRjb25zdCB0aGVvcmV0aWNhbExpbmVzID0gbGF5b3V0SW5mby5oZWlnaHQgLyB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5saW5lSGVpZ2h0KTtcblx0XHR0aGlzLl9tYXhTdGlja3lMaW5lcyA9IE1hdGgucm91bmQodGhlb3JldGljYWxMaW5lcyAqIC4yNSk7XG5cdFx0dGhpcy5fcmVuZGVyU3RpY2t5U2Nyb2xsKDApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVuZGVyU3RpY2t5U2Nyb2xsKHJlYnVpbGRGcm9tTGluZT86IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCB8fCBtb2RlbC5pc1Rvb0xhcmdlRm9yVG9rZW5pemF0aW9uKCkpIHtcblx0XHRcdHRoaXMuX3Jlc2V0U3RhdGUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbmV4dFJlYnVpbGRGcm9tTGluZSA9IHRoaXMuX3VwZGF0ZUFuZEdldE1pblJlYnVpbGRGcm9tTGluZShyZWJ1aWxkRnJvbUxpbmUpO1xuXHRcdGNvbnN0IHN0aWNreVdpZGdldFZlcnNpb24gPSB0aGlzLl9zdGlja3lMaW5lQ2FuZGlkYXRlUHJvdmlkZXIuZ2V0VmVyc2lvbklkKCk7XG5cdFx0Y29uc3Qgc2hvdWxkVXBkYXRlU3RhdGUgPSBzdGlja3lXaWRnZXRWZXJzaW9uID09PSB1bmRlZmluZWQgfHwgc3RpY2t5V2lkZ2V0VmVyc2lvbiA9PT0gbW9kZWwuZ2V0VmVyc2lvbklkKCk7XG5cdFx0aWYgKHNob3VsZFVwZGF0ZVN0YXRlKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2ZvY3VzZWQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fdXBkYXRlU3RhdGUobmV4dFJlYnVpbGRGcm9tTGluZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBTdXBwb3NlIHRoYXQgcHJldmlvdXNseSB0aGUgc3RpY2t5IHNjcm9sbCB3aWRnZXQgaGFkIGhlaWdodCAwLCB0aGVuIGlmIHRoZXJlIGFyZSB2aXNpYmxlIGxpbmVzLCBzZXQgdGhlIGxhc3QgbGluZSBhcyBmb2N1c2VkXG5cdFx0XHRcdGlmICh0aGlzLl9mb2N1c2VkU3RpY2t5RWxlbWVudEluZGV4ID09PSAtMSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3VwZGF0ZVN0YXRlKG5leHRSZWJ1aWxkRnJvbUxpbmUpO1xuXHRcdFx0XHRcdHRoaXMuX2ZvY3VzZWRTdGlja3lFbGVtZW50SW5kZXggPSB0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQubGluZU51bWJlckNvdW50IC0gMTtcblx0XHRcdFx0XHRpZiAodGhpcy5fZm9jdXNlZFN0aWNreUVsZW1lbnRJbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5mb2N1c0xpbmVXaXRoSW5kZXgodGhpcy5fZm9jdXNlZFN0aWNreUVsZW1lbnRJbmRleCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGZvY3VzZWRTdGlja3lFbGVtZW50TGluZU51bWJlciA9IHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5saW5lTnVtYmVyc1t0aGlzLl9mb2N1c2VkU3RpY2t5RWxlbWVudEluZGV4XTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl91cGRhdGVTdGF0ZShuZXh0UmVidWlsZEZyb21MaW5lKTtcblx0XHRcdFx0XHQvLyBTdXBwb3NlIHRoYXQgYWZ0ZXIgc2V0dGluZyB0aGUgc3RhdGUsIHRoZXJlIGFyZSBubyBzdGlja3kgbGluZXMsIHNldCB0aGUgZm9jdXNlZCBpbmRleCB0byAtMVxuXHRcdFx0XHRcdGlmICh0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQubGluZU51bWJlckNvdW50ID09PSAwKSB7XG5cdFx0XHRcdFx0XHR0aGlzLl9mb2N1c2VkU3RpY2t5RWxlbWVudEluZGV4ID0gLTE7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IHByZXZpb3VzRm9jdXNlZExpbmVOdW1iZXJFeGlzdHMgPSB0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQubGluZU51bWJlcnMuaW5jbHVkZXMoZm9jdXNlZFN0aWNreUVsZW1lbnRMaW5lTnVtYmVyKTtcblxuXHRcdFx0XHRcdFx0Ly8gSWYgdGhlIGxpbmUgbnVtYmVyIGlzIHN0aWxsIHRoZXJlLCBkbyBub3QgY2hhbmdlIGFueXRoaW5nXG5cdFx0XHRcdFx0XHQvLyBJZiB0aGUgbGluZSBudW1iZXIgaXMgbm90IHRoZXJlLCBzZXQgdGhlIG5ldyBmb2N1c2VkIGxpbmUgdG8gYmUgdGhlIGxhc3QgbGluZVxuXHRcdFx0XHRcdFx0aWYgKCFwcmV2aW91c0ZvY3VzZWRMaW5lTnVtYmVyRXhpc3RzKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2ZvY3VzZWRTdGlja3lFbGVtZW50SW5kZXggPSB0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQubGluZU51bWJlckNvdW50IC0gMTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5mb2N1c0xpbmVXaXRoSW5kZXgodGhpcy5fZm9jdXNlZFN0aWNreUVsZW1lbnRJbmRleCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlQW5kR2V0TWluUmVidWlsZEZyb21MaW5lKHJlYnVpbGRGcm9tTGluZTogbnVtYmVyIHwgdW5kZWZpbmVkKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAocmVidWlsZEZyb21MaW5lICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IG1pblJlYnVpbGRGcm9tTGluZU9ySW5maW5pdHkgPSB0aGlzLl9taW5SZWJ1aWxkRnJvbUxpbmUgIT09IHVuZGVmaW5lZCA/IHRoaXMuX21pblJlYnVpbGRGcm9tTGluZSA6IEluZmluaXR5O1xuXHRcdFx0dGhpcy5fbWluUmVidWlsZEZyb21MaW5lID0gTWF0aC5taW4ocmVidWlsZEZyb21MaW5lLCBtaW5SZWJ1aWxkRnJvbUxpbmVPckluZmluaXR5KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21pblJlYnVpbGRGcm9tTGluZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZVN0YXRlKHJlYnVpbGRGcm9tTGluZT86IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX21pblJlYnVpbGRGcm9tTGluZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9mb2xkaW5nTW9kZWwgPSBhd2FpdCBGb2xkaW5nQ29udHJvbGxlci5nZXQodGhpcy5fZWRpdG9yKT8uZ2V0Rm9sZGluZ01vZGVsKCkgPz8gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3dpZGdldFN0YXRlID0gdGhpcy5maW5kU2Nyb2xsV2lkZ2V0U3RhdGUoKTtcblx0XHRjb25zdCBzdGlja3lXaWRnZXRIYXNMaW5lcyA9IHRoaXMuX3dpZGdldFN0YXRlLnN0YXJ0TGluZU51bWJlcnMubGVuZ3RoID4gMDtcblx0XHR0aGlzLl9zdGlja3lTY3JvbGxWaXNpYmxlQ29udGV4dEtleS5zZXQoc3RpY2t5V2lkZ2V0SGFzTGluZXMpO1xuXHRcdHRoaXMuX3N0aWNreVNjcm9sbFdpZGdldC5zZXRTdGF0ZSh0aGlzLl93aWRnZXRTdGF0ZSwgdGhpcy5fZm9sZGluZ01vZGVsLCByZWJ1aWxkRnJvbUxpbmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzZXRTdGF0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9taW5SZWJ1aWxkRnJvbUxpbmUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZm9sZGluZ01vZGVsID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3dpZGdldFN0YXRlID0gU3RpY2t5U2Nyb2xsV2lkZ2V0U3RhdGUuRW1wdHk7XG5cdFx0dGhpcy5fc3RpY2t5U2Nyb2xsVmlzaWJsZUNvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHR0aGlzLl9zdGlja3lTY3JvbGxXaWRnZXQuc2V0U3RhdGUodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0ZmluZFNjcm9sbFdpZGdldFN0YXRlKCk6IFN0aWNreVNjcm9sbFdpZGdldFN0YXRlIHtcblx0XHRjb25zdCBtYXhOdW1iZXJTdGlja3lMaW5lcyA9IE1hdGgubWluKHRoaXMuX21heFN0aWNreUxpbmVzLCB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zdGlja3lTY3JvbGwpLm1heExpbmVDb3VudCk7XG5cdFx0Y29uc3Qgc2Nyb2xsVG9wOiBudW1iZXIgPSB0aGlzLl9lZGl0b3IuZ2V0U2Nyb2xsVG9wKCk7XG5cdFx0bGV0IGxhc3RMaW5lUmVsYXRpdmVQb3NpdGlvbjogbnVtYmVyID0gMDtcblx0XHRjb25zdCBzdGFydExpbmVOdW1iZXJzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGVuZExpbmVOdW1iZXJzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGFycmF5VmlzaWJsZVJhbmdlcyA9IHRoaXMuX2VkaXRvci5nZXRWaXNpYmxlUmFuZ2VzKCk7XG5cdFx0aWYgKGFycmF5VmlzaWJsZVJhbmdlcy5sZW5ndGggIT09IDApIHtcblx0XHRcdGNvbnN0IGZ1bGxWaXNpYmxlUmFuZ2UgPSBuZXcgU3RpY2t5UmFuZ2UoYXJyYXlWaXNpYmxlUmFuZ2VzWzBdLnN0YXJ0TGluZU51bWJlciwgYXJyYXlWaXNpYmxlUmFuZ2VzW2FycmF5VmlzaWJsZVJhbmdlcy5sZW5ndGggLSAxXS5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdGNvbnN0IGNhbmRpZGF0ZVJhbmdlcyA9IHRoaXMuX3N0aWNreUxpbmVDYW5kaWRhdGVQcm92aWRlci5nZXRDYW5kaWRhdGVTdGlja3lMaW5lc0ludGVyc2VjdGluZyhmdWxsVmlzaWJsZVJhbmdlKTtcblx0XHRcdGZvciAoY29uc3QgcmFuZ2Ugb2YgY2FuZGlkYXRlUmFuZ2VzKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0ID0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0XHRjb25zdCBlbmQgPSByYW5nZS5lbmRMaW5lTnVtYmVyO1xuXHRcdFx0XHRjb25zdCB0b3BPZkVsZW1lbnQgPSByYW5nZS50b3A7XG5cdFx0XHRcdGNvbnN0IGJvdHRvbU9mRWxlbWVudCA9IHRvcE9mRWxlbWVudCArIHJhbmdlLmhlaWdodDtcblx0XHRcdFx0Y29uc3QgdG9wT2ZCZWdpbm5pbmdMaW5lID0gdGhpcy5fZWRpdG9yLmdldFRvcEZvckxpbmVOdW1iZXIoc3RhcnQpIC0gc2Nyb2xsVG9wO1xuXHRcdFx0XHRjb25zdCBib3R0b21PZkVuZExpbmUgPSB0aGlzLl9lZGl0b3IuZ2V0Qm90dG9tRm9yTGluZU51bWJlcihlbmQpIC0gc2Nyb2xsVG9wO1xuXHRcdFx0XHRpZiAodG9wT2ZFbGVtZW50ID4gdG9wT2ZCZWdpbm5pbmdMaW5lICYmIHRvcE9mRWxlbWVudCA8PSBib3R0b21PZkVuZExpbmUpIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXJzLnB1c2goc3RhcnQpO1xuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXJzLnB1c2goZW5kICsgMSk7XG5cdFx0XHRcdFx0aWYgKGJvdHRvbU9mRWxlbWVudCA+IGJvdHRvbU9mRW5kTGluZSkge1xuXHRcdFx0XHRcdFx0bGFzdExpbmVSZWxhdGl2ZVBvc2l0aW9uID0gYm90dG9tT2ZFbmRMaW5lIC0gYm90dG9tT2ZFbGVtZW50O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoc3RhcnRMaW5lTnVtYmVycy5sZW5ndGggPT09IG1heE51bWJlclN0aWNreUxpbmVzKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fZW5kTGluZU51bWJlcnMgPSBlbmRMaW5lTnVtYmVycztcblx0XHRyZXR1cm4gbmV3IFN0aWNreVNjcm9sbFdpZGdldFN0YXRlKHN0YXJ0TGluZU51bWJlcnMsIGVuZExpbmVOdW1iZXJzLCBsYXN0TGluZVJlbGF0aXZlUG9zaXRpb24sIHRoaXMuX3Nob3dFbmRGb3JMaW5lKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3Nlc3Npb25TdG9yZS5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBc0IsWUFBWSxpQkFBaUIsb0JBQW9CO0FBQ3ZFLFNBQXNCLHVCQUF1QjtBQUM3QyxTQUE4QixrQkFBa0I7QUFDaEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxjQUFjLDZCQUF3RDtBQUMvRSxTQUFTLG9CQUFvQiwrQkFBK0I7QUFDNUQsU0FBdUMsbUNBQW1DO0FBRTFFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsY0FBYztBQUN2QixTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBNkM7QUFDdEQsU0FBaUIsYUFBYTtBQUM5QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFvQixnQkFBZ0I7QUFDcEMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyx1Q0FBdUM7QUFDaEQsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUF1QiwyQkFBMkI7QUFDbEQsU0FBUyxlQUFzQjtBQUMvQixTQUFTLGtCQUFrQjtBQWlCcEIsSUFBTSx5QkFBTixjQUFxQyxXQUFtRTtBQUFBLEVBa0M5RyxZQUNrQixTQUNxQixxQkFDSywwQkFDSCxlQUNULCtCQUNFLGlDQUNJLG9CQUNwQztBQUNELFVBQU07QUFSVztBQUNxQjtBQUNLO0FB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
