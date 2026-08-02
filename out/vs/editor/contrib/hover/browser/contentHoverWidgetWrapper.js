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
import * as dom from "../../../../base/browser/dom.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { MouseTargetType } from "../../../browser/editorBrowser.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { TokenizationRegistry } from "../../../common/languages.js";
import { HoverOperation, HoverStartMode, HoverStartSource } from "./hoverOperation.js";
import { HoverParticipantRegistry, HoverRangeAnchor } from "./hoverTypes.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ContentHoverWidget } from "./contentHoverWidget.js";
import { ContentHoverComputer } from "./contentHoverComputer.js";
import { ContentHoverResult } from "./contentHoverTypes.js";
import { Emitter } from "../../../../base/common/event.js";
import { RenderedContentHover } from "./contentHoverRendered.js";
import { isMousePositionWithinElement } from "./hoverUtils.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
let ContentHoverWidgetWrapper = class extends Disposable {
  constructor(_editor, _instantiationService, _keybindingService, _hoverService, _clipboardService) {
    super();
    this._editor = _editor;
    this._instantiationService = _instantiationService;
    this._keybindingService = _keybindingService;
    this._hoverService = _hoverService;
    this._clipboardService = _clipboardService;
    this._currentResult = null;
    this._renderedContentHover = this._register(new MutableDisposable());
    this._onContentsChanged = this._register(new Emitter());
    this.onContentsChanged = this._onContentsChanged.event;
    this._contentHoverWidget = this._register(this._instantiationService.createInstance(ContentHoverWidget, this._editor));
    this._participants = this._initializeHoverParticipants();
    this._hoverOperation = this._register(new HoverOperation(this._editor, new ContentHoverComputer(this._editor, this._participants)));
    this._registerListeners();
  }
  _initializeHoverParticipants() {
    const participants = [];
    for (const participant of HoverParticipantRegistry.getAll()) {
      const participantInstance = this._instantiationService.createInstance(participant, this._editor);
      participants.push(participantInstance);
    }
    participants.sort((p1, p2) => p1.hoverOrdinal - p2.hoverOrdinal);
    this._register(this._contentHoverWidget.onDidResize(() => {
      this._participants.forEach((participant) => participant.handleResize?.());
    }));
    this._register(this._contentHoverWidget.onDidScroll((e) => {
      this._participants.forEach((participant) => participant.handleScroll?.(e));
    }));
    this._register(this._contentHoverWidget.onContentsChanged(() => {
      this._participants.forEach((participant) => participant.handleContentsChanged?.());
    }));
    return participants;
  }
  _registerListeners() {
    this._register(this._hoverOperation.onResult((result) => {
      const messages = result.hasLoadingMessage ? this._addLoadingMessage(result) : result.value;
      this._withResult(new ContentHoverResult(messages, result.isComplete, result.options));
    }));
    const contentHoverWidgetNode = this._contentHoverWidget.getDomNode();
    this._register(dom.addStandardDisposableListener(contentHoverWidgetNode, "keydown", (e) => {
      if (e.equals(KeyCode.Escape)) {
        this.hide();
      }
    }));
    this._register(dom.addStandardDisposableListener(contentHoverWidgetNode, "mouseleave", (e) => {
      this._onMouseLeave(e);
    }));
    this._register(TokenizationRegistry.onDidChange(() => {
      if (this._contentHoverWidget.position && this._currentResult) {
        this._setCurrentResult(this._currentResult);
      }
    }));
    this._register(this._contentHoverWidget.onContentsChanged(() => {
      this._onContentsChanged.fire();
    }));
  }
  /**
   * Returns true if the hover shows now or will show.
   */
  _startShowingOrUpdateHover(anchor, mode, source, focus, mouseEvent) {
    const contentHoverIsVisible = this._contentHoverWidget.position && this._currentResult;
    if (!contentHoverIsVisible) {
      if (anchor) {
        this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
        return true;
      }
      return false;
    }
    const isHoverSticky = this._editor.getOption(EditorOption.hover).sticky;
    const isMouseGettingCloser = mouseEvent && this._contentHoverWidget.isMouseGettingCloser(mouseEvent.event.posx, mouseEvent.event.posy);
    const isHoverStickyAndIsMouseGettingCloser = isHoverSticky && isMouseGettingCloser;
    if (isHoverStickyAndIsMouseGettingCloser) {
      if (anchor) {
        this._startHoverOperationIfNecessary(anchor, mode, source, focus, true);
      }
      return true;
    }
    if (!anchor) {
      this._setCurrentResult(null);
      return false;
    }
    const currentAnchorEqualsPreviousAnchor = this._currentResult && this._currentResult.options.anchor.equals(anchor);
    if (currentAnchorEqualsPreviousAnchor) {
      return true;
    }
    const currentAnchorCompatibleWithPreviousAnchor = this._currentResult && anchor.canAdoptVisibleHover(this._currentResult.options.anchor, this._contentHoverWidget.position);
    if (!currentAnchorCompatibleWithPreviousAnchor) {
      this._setCurrentResult(null);
      this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
      return true;
    }
    if (this._currentResult) {
      this._setCurrentResult(this._currentResult.filter(anchor));
    }
    this._startHoverOperationIfNecessary(anchor, mode, source, focus, false);
    return true;
  }
  _startHoverOperationIfNecessary(anchor, mode, source, shouldFocus, insistOnKeepingHoverVisible) {
    const currentAnchorEqualToPreviousHover = this._hoverOperation.options && this._hoverOperation.options.anchor.equals(anchor);
    if (currentAnchorEqualToPreviousHover) {
      return;
    }
    this._hoverOperation.cancel();
    const contentHoverComputerOptions = {
      anchor,
      source,
      shouldFocus,
      insistOnKeepingHoverVisible
    };
    this._hoverOperation.start(mode, contentHoverComputerOptions);
  }
  _setCurrentResult(hoverResult) {
    let currentHoverResult = hoverResult;
    const currentResultEqualToPreviousResult = this._currentResult === currentHoverResult;
    if (currentResultEqualToPreviousResult) {
      return;
    }
    const currentHoverResultIsEmpty = currentHoverResult && currentHoverResult.hoverParts.length === 0;
    if (currentHoverResultIsEmpty) {
      currentHoverResult = null;
    }
    this._currentResult = currentHoverResult;
    if (this._currentResult) {
      this._showHover(this._currentResult);
    } else {
      this._hideHover();
    }
  }
  _addLoadingMessage(hoverResult) {
    for (const participant of this._participants) {
      if (!participant.createLoadingMessage) {
        continue;
      }
      const loadingMessage = participant.createLoadingMessage(hoverResult.options.anchor);
      if (!loadingMessage) {
        continue;
      }
      return hoverResult.value.slice(0).concat([loadingMessage]);
    }
    return hoverResult.value;
  }
  _withResult(hoverResult) {
    const previousHoverIsVisibleWithCompleteResult = this._contentHoverWidget.position && this._currentResult && this._currentResult.isComplete;
    if (!previousHoverIsVisibleWithCompleteResult) {
      this._setCurrentResult(hoverResult);
    }
    const isCurrentHoverResultComplete = hoverResult.isComplete;
    if (!isCurrentHoverResultComplete) {
      return;
    }
    const currentHoverResultIsEmpty = hoverResult.hoverParts.length === 0;
    const insistOnKeepingPreviousHoverVisible = hoverResult.options.insistOnKeepingHoverVisible;
    const shouldKeepPreviousHoverVisible = currentHoverResultIsEmpty && insistOnKeepingPreviousHoverVisible;
    if (shouldKeepPreviousHoverVisible) {
      return;
    }
    this._setCurrentResult(hoverResult);
  }
  _showHover(hoverResult) {
    const context = this._getHoverContext();
    this._renderedContentHover.value = new RenderedContentHover(this._editor, hoverResult, this._participants, context, this._keybindingService, this._hoverService, this._clipboardService);
    if (this._renderedContentHover.value.domNodeHasChildren) {
      this._contentHoverWidget.show(this._renderedContentHover.value);
    } else {
      this._renderedContentHover.clear();
    }
  }
  _hideHover() {
    this._contentHoverWidget.hide();
    this._participants.forEach((participant) => participant.handleHide?.());
  }
  _getHoverContext() {
    const hide = () => {
      this.hide();
    };
    const onContentsChanged = () => {
      this._contentHoverWidget.handleContentsChanged();
    };
    const setMinimumDimensions = (dimensions) => {
      this._contentHoverWidget.setMinimumDimensions(dimensions);
    };
    const focus = () => this.focus();
    return { hide, onContentsChanged, setMinimumDimensions, focus };
  }
  showsOrWillShow(mouseEvent) {
    const isContentWidgetResizing = this._contentHoverWidget.isResizing;
    if (isContentWidgetResizing) {
      return true;
    }
    if (this._isMouseOnCodeActionWidget(mouseEvent)) {
      return true;
    }
    const anchorCandidates = this._findHoverAnchorCandidates(mouseEvent);
    const anchorCandidatesExist = anchorCandidates.length > 0;
    if (!anchorCandidatesExist) {
      return this._startShowingOrUpdateHover(null, HoverStartMode.Delayed, HoverStartSource.Mouse, false, mouseEvent);
    }
    const anchor = anchorCandidates[0];
    return this._startShowingOrUpdateHover(anchor, HoverStartMode.Delayed, HoverStartSource.Mouse, false, mouseEvent);
  }
  _findHoverAnchorCandidates(mouseEvent) {
    const anchorCandidates = [];
    for (const participant of this._participants) {
      if (!participant.suggestHoverAnchor) {
        continue;
      }
      const anchor = participant.suggestHoverAnchor(mouseEvent);
      if (!anchor) {
        continue;
      }
      anchorCandidates.push(anchor);
    }
    const target = mouseEvent.target;
    switch (target.type) {
      case MouseTargetType.CONTENT_TEXT: {
        anchorCandidates.push(new HoverRangeAnchor(0, target.range, mouseEvent.event.posx, mouseEvent.event.posy));
        break;
      }
      case MouseTargetType.CONTENT_EMPTY: {
        const epsilon = this._editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth / 2;
        const mouseIsWithinLinesAndCloseToHover = !target.detail.isAfterLines && typeof target.detail.horizontalDistanceToText === "number" && target.detail.horizontalDistanceToText < epsilon;
        if (!mouseIsWithinLinesAndCloseToHover) {
          break;
        }
        anchorCandidates.push(new HoverRangeAnchor(0, target.range, mouseEvent.event.posx, mouseEvent.event.posy));
        break;
      }
    }
    anchorCandidates.sort((a, b) => b.priority - a.priority);
    return anchorCandidates;
  }
  _isMouseOnCodeActionWidget(mouseEvent) {
    const target = mouseEvent.event.browserEvent.target;
    if (target instanceof Element && !!target.closest(".action-widget")) {
      return true;
    }
    return false;
  }
  _onMouseLeave(e) {
    const editorDomNode = this._editor.getDomNode();
    const isMousePositionOutsideOfEditor = !editorDomNode || !isMousePositionWithinElement(editorDomNode, e.x, e.y);
    if (isMousePositionOutsideOfEditor) {
      this.hide();
    }
  }
  startShowingAtRange(range, mode, source, focus) {
    this._startShowingOrUpdateHover(new HoverRangeAnchor(0, range, void 0, void 0), mode, source, focus, null);
  }
  getWidgetContent() {
    const node = this._contentHoverWidget.getDomNode();
    if (!node.textContent) {
      return void 0;
    }
    return node.textContent;
  }
  async updateHoverVerbosityLevel(action, index, focus) {
    this._renderedContentHover.value?.updateHoverVerbosityLevel(action, index, focus);
  }
  doesHoverAtIndexSupportVerbosityAction(index, action) {
    return this._renderedContentHover.value?.doesHoverAtIndexSupportVerbosityAction(index, action) ?? false;
  }
  getAccessibleWidgetContent() {
    return this._renderedContentHover.value?.getAccessibleWidgetContent();
  }
  getAccessibleWidgetContentAtIndex(index) {
    return this._renderedContentHover.value?.getAccessibleWidgetContentAtIndex(index);
  }
  focusedHoverPartIndex() {
    return this._renderedContentHover.value?.focusedHoverPartIndex ?? -1;
  }
  containsNode(node) {
    return node ? this._contentHoverWidget.getDomNode().contains(node) : false;
  }
  focus() {
    const hoverPartsCount = this._renderedContentHover.value?.hoverPartsCount;
    if (hoverPartsCount === 1) {
      this.focusHoverPartWithIndex(0);
      return;
    }
    this._contentHoverWidget.focus();
  }
  focusHoverPartWithIndex(index) {
    this._renderedContentHover.value?.focusHoverPartWithIndex(index);
  }
  scrollUp() {
    this._contentHoverWidget.scrollUp();
  }
  scrollDown() {
    this._contentHoverWidget.scrollDown();
  }
  scrollLeft() {
    this._contentHoverWidget.scrollLeft();
  }
  scrollRight() {
    this._contentHoverWidget.scrollRight();
  }
  pageUp() {
    this._contentHoverWidget.pageUp();
  }
  pageDown() {
    this._contentHoverWidget.pageDown();
  }
  goToTop() {
    this._contentHoverWidget.goToTop();
  }
  goToBottom() {
    this._contentHoverWidget.goToBottom();
  }
  hide() {
    this._hoverOperation.cancel();
    this._setCurrentResult(null);
  }
  getDomNode() {
    return this._contentHoverWidget.getDomNode();
  }
  get isColorPickerVisible() {
    return this._renderedContentHover.value?.isColorPickerVisible() ?? false;
  }
  get isVisibleFromKeyboard() {
    return this._contentHoverWidget.isVisibleFromKeyboard;
  }
  get isVisible() {
    return this._contentHoverWidget.isVisible;
  }
  get isFocused() {
    return this._contentHoverWidget.isFocused;
  }
  get isResizing() {
    return this._contentHoverWidget.isResizing;
  }
  get widget() {
    return this._contentHoverWidget;
  }
};
ContentHoverWidgetWrapper = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IClipboardService)
], ContentHoverWidgetWrapper);
export {
  ContentHoverWidgetWrapper
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvY29udGVudEhvdmVyV2lkZ2V0V3JhcHBlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgSUVkaXRvck1vdXNlRXZlbnQsIE1vdXNlVGFyZ2V0VHlwZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBUb2tlbml6YXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSG92ZXJPcGVyYXRpb24sIEhvdmVyUmVzdWx0LCBIb3ZlclN0YXJ0TW9kZSwgSG92ZXJTdGFydFNvdXJjZSB9IGZyb20gJy4vaG92ZXJPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgSG92ZXJBbmNob3IsIEhvdmVyUGFydGljaXBhbnRSZWdpc3RyeSwgSG92ZXJSYW5nZUFuY2hvciwgSUVkaXRvckhvdmVyQ29udGV4dCwgSUVkaXRvckhvdmVyUGFydGljaXBhbnQsIElIb3ZlclBhcnQsIElIb3ZlcldpZGdldCB9IGZyb20gJy4vaG92ZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSG92ZXJWZXJib3NpdHlBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc3RhbmRhbG9uZS9zdGFuZGFsb25lRW51bXMuanMnO1xuaW1wb3J0IHsgQ29udGVudEhvdmVyV2lkZ2V0IH0gZnJvbSAnLi9jb250ZW50SG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgQ29udGVudEhvdmVyQ29tcHV0ZXIsIENvbnRlbnRIb3ZlckNvbXB1dGVyT3B0aW9ucyB9IGZyb20gJy4vY29udGVudEhvdmVyQ29tcHV0ZXIuanMnO1xuaW1wb3J0IHsgQ29udGVudEhvdmVyUmVzdWx0IH0gZnJvbSAnLi9jb250ZW50SG92ZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgUmVuZGVyZWRDb250ZW50SG92ZXIgfSBmcm9tICcuL2NvbnRlbnRIb3ZlclJlbmRlcmVkLmpzJztcbmltcG9ydCB7IGlzTW91c2VQb3NpdGlvbldpdGhpbkVsZW1lbnQgfSBmcm9tICcuL2hvdmVyVXRpbHMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgQ29udGVudEhvdmVyV2lkZ2V0V3JhcHBlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJSG92ZXJXaWRnZXQge1xuXG5cdHByaXZhdGUgX2N1cnJlbnRSZXN1bHQ6IENvbnRlbnRIb3ZlclJlc3VsdCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJlZENvbnRlbnRIb3ZlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxSZW5kZXJlZENvbnRlbnRIb3Zlcj4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udGVudEhvdmVyV2lkZ2V0OiBDb250ZW50SG92ZXJXaWRnZXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3BhcnRpY2lwYW50czogSUVkaXRvckhvdmVyUGFydGljaXBhbnRbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfaG92ZXJPcGVyYXRpb246IEhvdmVyT3BlcmF0aW9uPENvbnRlbnRIb3ZlckNvbXB1dGVyT3B0aW9ucywgSUhvdmVyUGFydD47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25Db250ZW50c0NoYW5nZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uQ29udGVudHNDaGFuZ2VkID0gdGhpcy5fb25Db250ZW50c0NoYW5nZWQuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb250ZW50SG92ZXJXaWRnZXQsIHRoaXMuX2VkaXRvcikpO1xuXHRcdHRoaXMuX3BhcnRpY2lwYW50cyA9IHRoaXMuX2luaXRpYWxpemVIb3ZlclBhcnRpY2lwYW50cygpO1xuXHRcdHRoaXMuX2hvdmVyT3BlcmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEhvdmVyT3BlcmF0aW9uKHRoaXMuX2VkaXRvciwgbmV3IENvbnRlbnRIb3ZlckNvbXB1dGVyKHRoaXMuX2VkaXRvciwgdGhpcy5fcGFydGljaXBhbnRzKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9pbml0aWFsaXplSG92ZXJQYXJ0aWNpcGFudHMoKTogSUVkaXRvckhvdmVyUGFydGljaXBhbnRbXSB7XG5cdFx0Y29uc3QgcGFydGljaXBhbnRzOiBJRWRpdG9ySG92ZXJQYXJ0aWNpcGFudFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBwYXJ0aWNpcGFudCBvZiBIb3ZlclBhcnRpY2lwYW50UmVnaXN0cnkuZ2V0QWxsKCkpIHtcblx0XHRcdGNvbnN0IHBhcnRpY2lwYW50SW5zdGFuY2UgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShwYXJ0aWNpcGFudCwgdGhpcy5fZWRpdG9yKTtcblx0XHRcdHBhcnRpY2lwYW50cy5wdXNoKHBhcnRpY2lwYW50SW5zdGFuY2UpO1xuXHRcdH1cblx0XHRwYXJ0aWNpcGFudHMuc29ydCgocDEsIHAyKSA9PiBwMS5ob3Zlck9yZGluYWwgLSBwMi5ob3Zlck9yZGluYWwpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5vbkRpZFJlc2l6ZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9wYXJ0aWNpcGFudHMuZm9yRWFjaChwYXJ0aWNpcGFudCA9PiBwYXJ0aWNpcGFudC5oYW5kbGVSZXNpemU/LigpKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29udGVudEhvdmVyV2lkZ2V0Lm9uRGlkU2Nyb2xsKChlKSA9PiB7XG5cdFx0XHR0aGlzLl9wYXJ0aWNpcGFudHMuZm9yRWFjaChwYXJ0aWNpcGFudCA9PiBwYXJ0aWNpcGFudC5oYW5kbGVTY3JvbGw/LihlKSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5vbkNvbnRlbnRzQ2hhbmdlZCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9wYXJ0aWNpcGFudHMuZm9yRWFjaChwYXJ0aWNpcGFudCA9PiBwYXJ0aWNpcGFudC5oYW5kbGVDb250ZW50c0NoYW5nZWQ/LigpKTtcblx0XHR9KSk7XG5cdFx0cmV0dXJuIHBhcnRpY2lwYW50cztcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2hvdmVyT3BlcmF0aW9uLm9uUmVzdWx0KChyZXN1bHQpID0+IHtcblx0XHRcdGNvbnN0IG1lc3NhZ2VzID0gKHJlc3VsdC5oYXNMb2FkaW5nTWVzc2FnZSA/IHRoaXMuX2FkZExvYWRpbmdNZXNzYWdlKHJlc3VsdCkgOiByZXN1bHQudmFsdWUpO1xuXHRcdFx0dGhpcy5fd2l0aFJlc3VsdChuZXcgQ29udGVudEhvdmVyUmVzdWx0KG1lc3NhZ2VzLCByZXN1bHQuaXNDb21wbGV0ZSwgcmVzdWx0Lm9wdGlvbnMpKTtcblx0XHR9KSk7XG5cdFx0Y29uc3QgY29udGVudEhvdmVyV2lkZ2V0Tm9kZSA9IHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5nZXREb21Ob2RlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRlbnRIb3ZlcldpZGdldE5vZGUsICdrZXlkb3duJywgKGUpID0+IHtcblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLkVzY2FwZSkpIHtcblx0XHRcdFx0dGhpcy5oaWRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihjb250ZW50SG92ZXJXaWRnZXROb2RlLCAnbW91c2VsZWF2ZScsIChlKSA9PiB7XG5cdFx0XHR0aGlzLl9vbk1vdXNlTGVhdmUoZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKFRva2VuaXphdGlvblJlZ2lzdHJ5Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQucG9zaXRpb24gJiYgdGhpcy5fY3VycmVudFJlc3VsdCkge1xuXHRcdFx0XHR0aGlzLl9zZXRDdXJyZW50UmVzdWx0KHRoaXMuX2N1cnJlbnRSZXN1bHQpOyAvLyByZW5kZXIgYWdhaW5cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29udGVudEhvdmVyV2lkZ2V0Lm9uQ29udGVudHNDaGFuZ2VkKCgpID0+IHtcblx0XHRcdHRoaXMuX29uQ29udGVudHNDaGFuZ2VkLmZpcmUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHRoZSBob3ZlciBzaG93cyBub3cgb3Igd2lsbCBzaG93LlxuXHQgKi9cblx0cHJpdmF0ZSBfc3RhcnRTaG93aW5nT3JVcGRhdGVIb3Zlcihcblx0XHRhbmNob3I6IEhvdmVyQW5jaG9yIHwgbnVsbCxcblx0XHRtb2RlOiBIb3ZlclN0YXJ0TW9kZSxcblx0XHRzb3VyY2U6IEhvdmVyU3RhcnRTb3VyY2UsXG5cdFx0Zm9jdXM6IGJvb2xlYW4sXG5cdFx0bW91c2VFdmVudDogSUVkaXRvck1vdXNlRXZlbnQgfCBudWxsXG5cdCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNvbnRlbnRIb3ZlcklzVmlzaWJsZSA9IHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5wb3NpdGlvbiAmJiB0aGlzLl9jdXJyZW50UmVzdWx0O1xuXHRcdGlmICghY29udGVudEhvdmVySXNWaXNpYmxlKSB7XG5cdFx0XHRpZiAoYW5jaG9yKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXJ0SG92ZXJPcGVyYXRpb25JZk5lY2Vzc2FyeShhbmNob3IsIG1vZGUsIHNvdXJjZSwgZm9jdXMsIGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IGlzSG92ZXJTdGlja3kgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5ob3Zlcikuc3RpY2t5O1xuXHRcdGNvbnN0IGlzTW91c2VHZXR0aW5nQ2xvc2VyID0gbW91c2VFdmVudCAmJiB0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQuaXNNb3VzZUdldHRpbmdDbG9zZXIobW91c2VFdmVudC5ldmVudC5wb3N4LCBtb3VzZUV2ZW50LmV2ZW50LnBvc3kpO1xuXHRcdGNvbnN0IGlzSG92ZXJTdGlja3lBbmRJc01vdXNlR2V0dGluZ0Nsb3NlciA9IGlzSG92ZXJTdGlja3kgJiYgaXNNb3VzZUdldHRpbmdDbG9zZXI7XG5cdFx0Ly8gVGhlIG1vdXNlIGlzIGdldHRpbmcgY2xvc2VyIHRvIHRoZSBob3Zlciwgc28gd2Ugd2lsbCBrZWVwIHRoZSBob3ZlciB1bnRvdWNoZWRcblx0XHQvLyBCdXQgd2Ugd2lsbCBraWNrIG9mZiBhIGhvdmVyIHVwZGF0ZSBhdCB0aGUgbmV3IGFuY2hvciwgaW5zaXN0aW5nIG9uIGtlZXBpbmcgdGhlIGhvdmVyIHZpc2libGUuXG5cdFx0aWYgKGlzSG92ZXJTdGlja3lBbmRJc01vdXNlR2V0dGluZ0Nsb3Nlcikge1xuXHRcdFx0aWYgKGFuY2hvcikge1xuXHRcdFx0XHR0aGlzLl9zdGFydEhvdmVyT3BlcmF0aW9uSWZOZWNlc3NhcnkoYW5jaG9yLCBtb2RlLCBzb3VyY2UsIGZvY3VzLCB0cnVlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHQvLyBJZiBtb3VzZSBpcyBub3QgZ2V0dGluZyBjbG9zZXIgYW5kIGFuY2hvciBub3QgZGVmaW5lZCwgaGlkZSB0aGUgaG92ZXJcblx0XHRpZiAoIWFuY2hvcikge1xuXHRcdFx0dGhpcy5fc2V0Q3VycmVudFJlc3VsdChudWxsKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gSWYgbW91c2UgaWYgbm90IGdldHRpbmcgY2xvc2VyIGFuZCBhbmNob3IgaXMgZGVmaW5lZCwgYW5kIHRoZSBuZXcgYW5jaG9yIGlzIHRoZSBzYW1lIGFzIHRoZSBwcmV2aW91cyBhbmNob3Jcblx0XHRjb25zdCBjdXJyZW50QW5jaG9yRXF1YWxzUHJldmlvdXNBbmNob3IgPSB0aGlzLl9jdXJyZW50UmVzdWx0ICYmIHRoaXMuX2N1cnJlbnRSZXN1bHQub3B0aW9ucy5hbmNob3IuZXF1YWxzKGFuY2hvcik7XG5cdFx0aWYgKGN1cnJlbnRBbmNob3JFcXVhbHNQcmV2aW91c0FuY2hvcikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdC8vIElmIG1vdXNlIGlmIG5vdCBnZXR0aW5nIGNsb3NlciBhbmQgYW5jaG9yIGlzIGRlZmluZWQsIGFuZCB0aGUgbmV3IGFuY2hvciBpcyBub3QgY29tcGF0aWJsZSB3aXRoIHRoZSBwcmV2aW91cyBhbmNob3Jcblx0XHRjb25zdCBjdXJyZW50QW5jaG9yQ29tcGF0aWJsZVdpdGhQcmV2aW91c0FuY2hvciA9IHRoaXMuX2N1cnJlbnRSZXN1bHQgJiYgYW5jaG9yLmNhbkFkb3B0VmlzaWJsZUhvdmVyKHRoaXMuX2N1cnJlbnRSZXN1bHQub3B0aW9ucy5hbmNob3IsIHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5wb3NpdGlvbik7XG5cdFx0aWYgKCFjdXJyZW50QW5jaG9yQ29tcGF0aWJsZVdpdGhQcmV2aW91c0FuY2hvcikge1xuXHRcdFx0dGhpcy5fc2V0Q3VycmVudFJlc3VsdChudWxsKTtcblx0XHRcdHRoaXMuX3N0YXJ0SG92ZXJPcGVyYXRpb25JZk5lY2Vzc2FyeShhbmNob3IsIG1vZGUsIHNvdXJjZSwgZm9jdXMsIGZhbHNlKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHQvLyBXZSBhcmVuJ3QgZ2V0dGluZyBhbnkgY2xvc2VyIHRvIHRoZSBob3Zlciwgc28gd2Ugd2lsbCBmaWx0ZXIgZXhpc3RpbmcgcmVzdWx0c1xuXHRcdC8vIGFuZCBrZWVwIHRob3NlIHdoaWNoIGFsc28gYXBwbHkgdG8gdGhlIG5ldyBhbmNob3IuXG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRSZXN1bHQpIHtcblx0XHRcdHRoaXMuX3NldEN1cnJlbnRSZXN1bHQodGhpcy5fY3VycmVudFJlc3VsdC5maWx0ZXIoYW5jaG9yKSk7XG5cdFx0fVxuXHRcdHRoaXMuX3N0YXJ0SG92ZXJPcGVyYXRpb25JZk5lY2Vzc2FyeShhbmNob3IsIG1vZGUsIHNvdXJjZSwgZm9jdXMsIGZhbHNlKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3N0YXJ0SG92ZXJPcGVyYXRpb25JZk5lY2Vzc2FyeShhbmNob3I6IEhvdmVyQW5jaG9yLCBtb2RlOiBIb3ZlclN0YXJ0TW9kZSwgc291cmNlOiBIb3ZlclN0YXJ0U291cmNlLCBzaG91bGRGb2N1czogYm9vbGVhbiwgaW5zaXN0T25LZWVwaW5nSG92ZXJWaXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgY3VycmVudEFuY2hvckVxdWFsVG9QcmV2aW91c0hvdmVyID0gdGhpcy5faG92ZXJPcGVyYXRpb24ub3B0aW9ucyAmJiB0aGlzLl9ob3Zlck9wZXJhdGlvbi5vcHRpb25zLmFuY2hvci5lcXVhbHMoYW5jaG9yKTtcblx0XHRpZiAoY3VycmVudEFuY2hvckVxdWFsVG9QcmV2aW91c0hvdmVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2hvdmVyT3BlcmF0aW9uLmNhbmNlbCgpO1xuXHRcdGNvbnN0IGNvbnRlbnRIb3ZlckNvbXB1dGVyT3B0aW9uczogQ29udGVudEhvdmVyQ29tcHV0ZXJPcHRpb25zID0ge1xuXHRcdFx0YW5jaG9yLFxuXHRcdFx0c291cmNlLFxuXHRcdFx0c2hvdWxkRm9jdXMsXG5cdFx0XHRpbnNpc3RPbktlZXBpbmdIb3ZlclZpc2libGVcblx0XHR9O1xuXHRcdHRoaXMuX2hvdmVyT3BlcmF0aW9uLnN0YXJ0KG1vZGUsIGNvbnRlbnRIb3ZlckNvbXB1dGVyT3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIF9zZXRDdXJyZW50UmVzdWx0KGhvdmVyUmVzdWx0OiBDb250ZW50SG92ZXJSZXN1bHQgfCBudWxsKTogdm9pZCB7XG5cdFx0bGV0IGN1cnJlbnRIb3ZlclJlc3VsdCA9IGhvdmVyUmVzdWx0O1xuXHRcdGNvbnN0IGN1cnJlbnRSZXN1bHRFcXVhbFRvUHJldmlvdXNSZXN1bHQgPSB0aGlzLl9jdXJyZW50UmVzdWx0ID09PSBjdXJyZW50SG92ZXJSZXN1bHQ7XG5cdFx0aWYgKGN1cnJlbnRSZXN1bHRFcXVhbFRvUHJldmlvdXNSZXN1bHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudEhvdmVyUmVzdWx0SXNFbXB0eSA9IGN1cnJlbnRIb3ZlclJlc3VsdCAmJiBjdXJyZW50SG92ZXJSZXN1bHQuaG92ZXJQYXJ0cy5sZW5ndGggPT09IDA7XG5cdFx0aWYgKGN1cnJlbnRIb3ZlclJlc3VsdElzRW1wdHkpIHtcblx0XHRcdGN1cnJlbnRIb3ZlclJlc3VsdCA9IG51bGw7XG5cdFx0fVxuXHRcdHRoaXMuX2N1cnJlbnRSZXN1bHQgPSBjdXJyZW50SG92ZXJSZXN1bHQ7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRSZXN1bHQpIHtcblx0XHRcdHRoaXMuX3Nob3dIb3Zlcih0aGlzLl9jdXJyZW50UmVzdWx0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5faGlkZUhvdmVyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfYWRkTG9hZGluZ01lc3NhZ2UoaG92ZXJSZXN1bHQ6IEhvdmVyUmVzdWx0PENvbnRlbnRIb3ZlckNvbXB1dGVyT3B0aW9ucywgSUhvdmVyUGFydD4pOiBJSG92ZXJQYXJ0W10ge1xuXHRcdGZvciAoY29uc3QgcGFydGljaXBhbnQgb2YgdGhpcy5fcGFydGljaXBhbnRzKSB7XG5cdFx0XHRpZiAoIXBhcnRpY2lwYW50LmNyZWF0ZUxvYWRpbmdNZXNzYWdlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbG9hZGluZ01lc3NhZ2UgPSBwYXJ0aWNpcGFudC5jcmVhdGVMb2FkaW5nTWVzc2FnZShob3ZlclJlc3VsdC5vcHRpb25zLmFuY2hvcik7XG5cdFx0XHRpZiAoIWxvYWRpbmdNZXNzYWdlKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGhvdmVyUmVzdWx0LnZhbHVlLnNsaWNlKDApLmNvbmNhdChbbG9hZGluZ01lc3NhZ2VdKTtcblx0XHR9XG5cdFx0cmV0dXJuIGhvdmVyUmVzdWx0LnZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2l0aFJlc3VsdChob3ZlclJlc3VsdDogQ29udGVudEhvdmVyUmVzdWx0KTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXNIb3ZlcklzVmlzaWJsZVdpdGhDb21wbGV0ZVJlc3VsdCA9IHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5wb3NpdGlvbiAmJiB0aGlzLl9jdXJyZW50UmVzdWx0ICYmIHRoaXMuX2N1cnJlbnRSZXN1bHQuaXNDb21wbGV0ZTtcblx0XHRpZiAoIXByZXZpb3VzSG92ZXJJc1Zpc2libGVXaXRoQ29tcGxldGVSZXN1bHQpIHtcblx0XHRcdHRoaXMuX3NldEN1cnJlbnRSZXN1bHQoaG92ZXJSZXN1bHQpO1xuXHRcdH1cblx0XHQvLyBUaGUgaG92ZXIgaXMgdmlzaWJsZSB3aXRoIGEgcHJldmlvdXMgY29tcGxldGUgcmVzdWx0LlxuXHRcdGNvbnN0IGlzQ3VycmVudEhvdmVyUmVzdWx0Q29tcGxldGUgPSBob3ZlclJlc3VsdC5pc0NvbXBsZXRlO1xuXHRcdGlmICghaXNDdXJyZW50SG92ZXJSZXN1bHRDb21wbGV0ZSkge1xuXHRcdFx0Ly8gSW5zdGVhZCBvZiByZW5kZXJpbmcgdGhlIG5ldyBwYXJ0aWFsIHJlc3VsdCwgd2Ugd2FpdCBmb3IgdGhlIHJlc3VsdCB0byBiZSBjb21wbGV0ZS5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudEhvdmVyUmVzdWx0SXNFbXB0eSA9IGhvdmVyUmVzdWx0LmhvdmVyUGFydHMubGVuZ3RoID09PSAwO1xuXHRcdGNvbnN0IGluc2lzdE9uS2VlcGluZ1ByZXZpb3VzSG92ZXJWaXNpYmxlID0gaG92ZXJSZXN1bHQub3B0aW9ucy5pbnNpc3RPbktlZXBpbmdIb3ZlclZpc2libGU7XG5cdFx0Y29uc3Qgc2hvdWxkS2VlcFByZXZpb3VzSG92ZXJWaXNpYmxlID0gY3VycmVudEhvdmVyUmVzdWx0SXNFbXB0eSAmJiBpbnNpc3RPbktlZXBpbmdQcmV2aW91c0hvdmVyVmlzaWJsZTtcblx0XHRpZiAoc2hvdWxkS2VlcFByZXZpb3VzSG92ZXJWaXNpYmxlKSB7XG5cdFx0XHQvLyBUaGUgaG92ZXIgd291bGQgbm93IGhpZGUgbm9ybWFsbHksIHNvIHdlJ2xsIGtlZXAgdGhlIHByZXZpb3VzIG1lc3NhZ2VzXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3NldEN1cnJlbnRSZXN1bHQoaG92ZXJSZXN1bHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0hvdmVyKGhvdmVyUmVzdWx0OiBDb250ZW50SG92ZXJSZXN1bHQpOiB2b2lkIHtcblx0XHRjb25zdCBjb250ZXh0ID0gdGhpcy5fZ2V0SG92ZXJDb250ZXh0KCk7XG5cdFx0dGhpcy5fcmVuZGVyZWRDb250ZW50SG92ZXIudmFsdWUgPSBuZXcgUmVuZGVyZWRDb250ZW50SG92ZXIodGhpcy5fZWRpdG9yLCBob3ZlclJlc3VsdCwgdGhpcy5fcGFydGljaXBhbnRzLCBjb250ZXh0LCB0aGlzLl9rZXliaW5kaW5nU2VydmljZSwgdGhpcy5faG92ZXJTZXJ2aWNlLCB0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlKTtcblx0XHRpZiAodGhpcy5fcmVuZGVyZWRDb250ZW50SG92ZXIudmFsdWUuZG9tTm9kZUhhc0NoaWxkcmVuKSB7XG5cdFx0XHR0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQuc2hvdyh0aGlzLl9yZW5kZXJlZENvbnRlbnRIb3Zlci52YWx1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlbmRlcmVkQ29udGVudEhvdmVyLmNsZWFyKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGlkZUhvdmVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5oaWRlKCk7XG5cdFx0dGhpcy5fcGFydGljaXBhbnRzLmZvckVhY2gocGFydGljaXBhbnQgPT4gcGFydGljaXBhbnQuaGFuZGxlSGlkZT8uKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0SG92ZXJDb250ZXh0KCk6IElFZGl0b3JIb3ZlckNvbnRleHQge1xuXHRcdGNvbnN0IGhpZGUgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLmhpZGUoKTtcblx0XHR9O1xuXHRcdGNvbnN0IG9uQ29udGVudHNDaGFuZ2VkID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29udGVudEhvdmVyV2lkZ2V0LmhhbmRsZUNvbnRlbnRzQ2hhbmdlZCgpO1xuXHRcdH07XG5cdFx0Y29uc3Qgc2V0TWluaW11bURpbWVuc2lvbnMgPSAoZGltZW5zaW9uczogZG9tLkRpbWVuc2lvbikgPT4ge1xuXHRcdFx0dGhpcy5fY29udGVudEhvdmVyV2lkZ2V0LnNldE1pbmltdW1EaW1lbnNpb25zKGRpbWVuc2lvbnMpO1xuXHRcdH07XG5cdFx0Y29uc3QgZm9jdXMgPSAoKSA9PiB0aGlzLmZvY3VzKCk7XG5cdFx0cmV0dXJuIHsgaGlkZSwgb25Db250ZW50c0NoYW5nZWQsIHNldE1pbmltdW1EaW1lbnNpb25zLCBmb2N1cyB9O1xuXHR9XG5cblxuXHRwdWJsaWMgc2hvd3NPcldpbGxTaG93KG1vdXNlRXZlbnQ6IElFZGl0b3JNb3VzZUV2ZW50KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgaXNDb250ZW50V2lkZ2V0UmVzaXppbmcgPSB0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQuaXNSZXNpemluZztcblx0XHRpZiAoaXNDb250ZW50V2lkZ2V0UmVzaXppbmcpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5faXNNb3VzZU9uQ29kZUFjdGlvbldpZGdldChtb3VzZUV2ZW50KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IGFuY2hvckNhbmRpZGF0ZXM6IEhvdmVyQW5jaG9yW10gPSB0aGlzLl9maW5kSG92ZXJBbmNob3JDYW5kaWRhdGVzKG1vdXNlRXZlbnQpO1xuXHRcdGNvbnN0IGFuY2hvckNhbmRpZGF0ZXNFeGlzdCA9IGFuY2hvckNhbmRpZGF0ZXMubGVuZ3RoID4gMDtcblx0XHRpZiAoIWFuY2hvckNhbmRpZGF0ZXNFeGlzdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3N0YXJ0U2hvd2luZ09yVXBkYXRlSG92ZXIobnVsbCwgSG92ZXJTdGFydE1vZGUuRGVsYXllZCwgSG92ZXJTdGFydFNvdXJjZS5Nb3VzZSwgZmFsc2UsIG1vdXNlRXZlbnQpO1xuXHRcdH1cblx0XHRjb25zdCBhbmNob3IgPSBhbmNob3JDYW5kaWRhdGVzWzBdO1xuXHRcdHJldHVybiB0aGlzLl9zdGFydFNob3dpbmdPclVwZGF0ZUhvdmVyKGFuY2hvciwgSG92ZXJTdGFydE1vZGUuRGVsYXllZCwgSG92ZXJTdGFydFNvdXJjZS5Nb3VzZSwgZmFsc2UsIG1vdXNlRXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmluZEhvdmVyQW5jaG9yQ2FuZGlkYXRlcyhtb3VzZUV2ZW50OiBJRWRpdG9yTW91c2VFdmVudCk6IEhvdmVyQW5jaG9yW10ge1xuXHRcdGNvbnN0IGFuY2hvckNhbmRpZGF0ZXM6IEhvdmVyQW5jaG9yW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHBhcnRpY2lwYW50IG9mIHRoaXMuX3BhcnRpY2lwYW50cykge1xuXHRcdFx0aWYgKCFwYXJ0aWNpcGFudC5zdWdnZXN0SG92ZXJBbmNob3IpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhbmNob3IgPSBwYXJ0aWNpcGFudC5zdWdnZXN0SG92ZXJBbmNob3IobW91c2VFdmVudCk7XG5cdFx0XHRpZiAoIWFuY2hvcikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGFuY2hvckNhbmRpZGF0ZXMucHVzaChhbmNob3IpO1xuXHRcdH1cblx0XHRjb25zdCB0YXJnZXQgPSBtb3VzZUV2ZW50LnRhcmdldDtcblx0XHRzd2l0Y2ggKHRhcmdldC50eXBlKSB7XG5cdFx0XHRjYXNlIE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX1RFWFQ6IHtcblx0XHRcdFx0YW5jaG9yQ2FuZGlkYXRlcy5wdXNoKG5ldyBIb3ZlclJhbmdlQW5jaG9yKDAsIHRhcmdldC5yYW5nZSwgbW91c2VFdmVudC5ldmVudC5wb3N4LCBtb3VzZUV2ZW50LmV2ZW50LnBvc3kpKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIE1vdXNlVGFyZ2V0VHlwZS5DT05URU5UX0VNUFRZOiB7XG5cdFx0XHRcdGNvbnN0IGVwc2lsb24gPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250SW5mbykudHlwaWNhbEhhbGZ3aWR0aENoYXJhY3RlcldpZHRoIC8gMjtcblx0XHRcdFx0Ly8gTGV0IGhvdmVyIGtpY2sgaW4gZXZlbiB3aGVuIHRoZSBtb3VzZSBpcyB0ZWNobmljYWxseSBpbiB0aGUgZW1wdHkgYXJlYSBhZnRlciBhIGxpbmUsIGdpdmVuIHRoZSBkaXN0YW5jZSBpcyBzbWFsbCBlbm91Z2hcblx0XHRcdFx0Y29uc3QgbW91c2VJc1dpdGhpbkxpbmVzQW5kQ2xvc2VUb0hvdmVyID0gIXRhcmdldC5kZXRhaWwuaXNBZnRlckxpbmVzXG5cdFx0XHRcdFx0JiYgdHlwZW9mIHRhcmdldC5kZXRhaWwuaG9yaXpvbnRhbERpc3RhbmNlVG9UZXh0ID09PSAnbnVtYmVyJ1xuXHRcdFx0XHRcdCYmIHRhcmdldC5kZXRhaWwuaG9yaXpvbnRhbERpc3RhbmNlVG9UZXh0IDwgZXBzaWxvbjtcblx0XHRcdFx0aWYgKCFtb3VzZUlzV2l0aGluTGluZXNBbmRDbG9zZVRvSG92ZXIpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRhbmNob3JDYW5kaWRhdGVzLnB1c2gobmV3IEhvdmVyUmFuZ2VBbmNob3IoMCwgdGFyZ2V0LnJhbmdlLCBtb3VzZUV2ZW50LmV2ZW50LnBvc3gsIG1vdXNlRXZlbnQuZXZlbnQucG9zeSkpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0YW5jaG9yQ2FuZGlkYXRlcy5zb3J0KChhLCBiKSA9PiBiLnByaW9yaXR5IC0gYS5wcmlvcml0eSk7XG5cdFx0cmV0dXJuIGFuY2hvckNhbmRpZGF0ZXM7XG5cdH1cblxuXHRwcml2YXRlIF9pc01vdXNlT25Db2RlQWN0aW9uV2lkZ2V0KG1vdXNlRXZlbnQ6IElFZGl0b3JNb3VzZUV2ZW50KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gbW91c2VFdmVudC5ldmVudC5icm93c2VyRXZlbnQudGFyZ2V0O1xuXHRcdGlmICh0YXJnZXQgaW5zdGFuY2VvZiBFbGVtZW50ICYmICEhdGFyZ2V0LmNsb3Nlc3QoJy5hY3Rpb24td2lkZ2V0JykpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9vbk1vdXNlTGVhdmUoZTogTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRvckRvbU5vZGUgPSB0aGlzLl9lZGl0b3IuZ2V0RG9tTm9kZSgpO1xuXHRcdGNvbnN0IGlzTW91c2VQb3NpdGlvbk91dHNpZGVPZkVkaXRvciA9ICFlZGl0b3JEb21Ob2RlIHx8ICFpc01vdXNlUG9zaXRpb25XaXRoaW5FbGVtZW50KGVkaXRvckRvbU5vZGUsIGUueCwgZS55KTtcblx0XHRpZiAoaXNNb3VzZVBvc2l0aW9uT3V0c2lkZU9mRWRpdG9yKSB7XG5cdFx0XHR0aGlzLmhpZGUoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgc3RhcnRTaG93aW5nQXRSYW5nZShyYW5nZTogUmFuZ2UsIG1vZGU6IEhvdmVyU3RhcnRNb2RlLCBzb3VyY2U6IEhvdmVyU3RhcnRTb3VyY2UsIGZvY3VzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RhcnRTaG93aW5nT3JVcGRhdGVIb3ZlcihuZXcgSG92ZXJSYW5nZUFuY2hvcigwLCByYW5nZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpLCBtb2RlLCBzb3VyY2UsIGZvY3VzLCBudWxsKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRXaWRnZXRDb250ZW50KCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5nZXREb21Ob2RlKCk7XG5cdFx0aWYgKCFub2RlLnRleHRDb250ZW50KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gbm9kZS50ZXh0Q29udGVudDtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyB1cGRhdGVIb3ZlclZlcmJvc2l0eUxldmVsKGFjdGlvbjogSG92ZXJWZXJib3NpdHlBY3Rpb24sIGluZGV4OiBudW1iZXIsIGZvY3VzPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3JlbmRlcmVkQ29udGVudEhvdmVyLnZhbHVlPy51cGRhdGVIb3ZlclZlcmJvc2l0eUxldmVsKGFjdGlvbiwgaW5kZXgsIGZvY3VzKTtcblx0fVxuXG5cdHB1YmxpYyBkb2VzSG92ZXJBdEluZGV4U3VwcG9ydFZlcmJvc2l0eUFjdGlvbihpbmRleDogbnVtYmVyLCBhY3Rpb246IEhvdmVyVmVyYm9zaXR5QWN0aW9uKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkQ29udGVudEhvdmVyLnZhbHVlPy5kb2VzSG92ZXJBdEluZGV4U3VwcG9ydFZlcmJvc2l0eUFjdGlvbihpbmRleCwgYWN0aW9uKSA/PyBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY2Nlc3NpYmxlV2lkZ2V0Q29udGVudCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlZENvbnRlbnRIb3Zlci52YWx1ZT8uZ2V0QWNjZXNzaWJsZVdpZGdldENvbnRlbnQoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY2Nlc3NpYmxlV2lkZ2V0Q29udGVudEF0SW5kZXgoaW5kZXg6IG51bWJlcik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkQ29udGVudEhvdmVyLnZhbHVlPy5nZXRBY2Nlc3NpYmxlV2lkZ2V0Q29udGVudEF0SW5kZXgoaW5kZXgpO1xuXHR9XG5cblx0cHVibGljIGZvY3VzZWRIb3ZlclBhcnRJbmRleCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlZENvbnRlbnRIb3Zlci52YWx1ZT8uZm9jdXNlZEhvdmVyUGFydEluZGV4ID8/IC0xO1xuXHR9XG5cblx0cHVibGljIGNvbnRhaW5zTm9kZShub2RlOiBOb2RlIHwgbnVsbCB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAobm9kZSA/IHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5nZXREb21Ob2RlKCkuY29udGFpbnMobm9kZSkgOiBmYWxzZSk7XG5cdH1cblxuXHRwdWJsaWMgZm9jdXMoKTogdm9pZCB7XG5cdFx0Y29uc3QgaG92ZXJQYXJ0c0NvdW50ID0gdGhpcy5fcmVuZGVyZWRDb250ZW50SG92ZXIudmFsdWU/LmhvdmVyUGFydHNDb3VudDtcblx0XHRpZiAoaG92ZXJQYXJ0c0NvdW50ID09PSAxKSB7XG5cdFx0XHR0aGlzLmZvY3VzSG92ZXJQYXJ0V2l0aEluZGV4KDApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQuZm9jdXMoKTtcblx0fVxuXG5cdHB1YmxpYyBmb2N1c0hvdmVyUGFydFdpdGhJbmRleChpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVuZGVyZWRDb250ZW50SG92ZXIudmFsdWU/LmZvY3VzSG92ZXJQYXJ0V2l0aEluZGV4KGluZGV4KTtcblx0fVxuXG5cdHB1YmxpYyBzY3JvbGxVcCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQuc2Nyb2xsVXAoKTtcblx0fVxuXG5cdHB1YmxpYyBzY3JvbGxEb3duKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5zY3JvbGxEb3duKCk7XG5cdH1cblxuXHRwdWJsaWMgc2Nyb2xsTGVmdCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQuc2Nyb2xsTGVmdCgpO1xuXHR9XG5cblx0cHVibGljIHNjcm9sbFJpZ2h0KCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5zY3JvbGxSaWdodCgpO1xuXHR9XG5cblx0cHVibGljIHBhZ2VVcCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQucGFnZVVwKCk7XG5cdH1cblxuXHRwdWJsaWMgcGFnZURvd24oKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGVudEhvdmVyV2lkZ2V0LnBhZ2VEb3duKCk7XG5cdH1cblxuXHRwdWJsaWMgZ29Ub1RvcCgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQuZ29Ub1RvcCgpO1xuXHR9XG5cblx0cHVibGljIGdvVG9Cb3R0b20oKTogdm9pZCB7XG5cdFx0dGhpcy5fY29udGVudEhvdmVyV2lkZ2V0LmdvVG9Cb3R0b20oKTtcblx0fVxuXG5cdHB1YmxpYyBoaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2hvdmVyT3BlcmF0aW9uLmNhbmNlbCgpO1xuXHRcdHRoaXMuX3NldEN1cnJlbnRSZXN1bHQobnVsbCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0RG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5nZXREb21Ob2RlKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGlzQ29sb3JQaWNrZXJWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlZENvbnRlbnRIb3Zlci52YWx1ZT8uaXNDb2xvclBpY2tlclZpc2libGUoKSA/PyBmYWxzZTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNWaXNpYmxlRnJvbUtleWJvYXJkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jb250ZW50SG92ZXJXaWRnZXQuaXNWaXNpYmxlRnJvbUtleWJvYXJkO1xuXHR9XG5cblx0cHVibGljIGdldCBpc1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRlbnRIb3ZlcldpZGdldC5pc1Zpc2libGU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGlzRm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGVudEhvdmVyV2lkZ2V0LmlzRm9jdXNlZDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgaXNSZXNpemluZygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGVudEhvdmVyV2lkZ2V0LmlzUmVzaXppbmc7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHdpZGdldCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fY29udGVudEhvdmVyV2lkZ2V0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZLHlCQUF5QjtBQUM5QyxTQUF5Qyx1QkFBdUI7QUFDaEUsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxnQkFBNkIsZ0JBQWdCLHdCQUF3QjtBQUM5RSxTQUFzQiwwQkFBMEIsd0JBQWdHO0FBQ2hKLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNEJBQXlEO0FBQ2xFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZUFBZTtBQUN4QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHlCQUF5QjtBQUUzQixJQUFNLDRCQUFOLGNBQXdDLFdBQW1DO0FBQUEsRUFZakYsWUFDa0IsU0FDdUIsdUJBQ0gsb0JBQ0wsZUFDSSxtQkFDbkM7QUFDRCxVQUFNO0FBTlc7QUFDdUI7QUFDSDtBQUNMO0FBQ0k7QUFmckMsU0FBUSxpQkFBNEM7QUFDcEQsU0FBaUIsd0JBQXdCLEtBQUssVUFBVSxJQUFJLGtCQUF3QyxDQUFDO0FBTXJHLFNBQWlCLHFC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
