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
import { RenderedHoverParts } from "./hoverTypes.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { EditorHoverStatusBar } from "./contentHoverStatusBar.js";
import { HoverCopyButton } from "./hoverCopyButton.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import * as dom from "../../../../base/browser/dom.js";
import { MarkdownHoverParticipant } from "./markdownHoverParticipant.js";
import { ColorHover, HoverColorPickerParticipant } from "../../colorPicker/browser/hoverColorPicker/hoverColorPickerParticipant.js";
import { localize } from "../../../../nls.js";
import { InlayHintsHover } from "../../inlayHints/browser/inlayHintsHover.js";
import { BugIndicatingError } from "../../../../base/common/errors.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
let RenderedContentHover = class extends Disposable {
  constructor(editor, hoverResult, participants, context, keybindingService, hoverService, clipboardService) {
    super();
    const parts = hoverResult.hoverParts;
    this._renderedHoverParts = this._register(new RenderedContentHoverParts(
      editor,
      participants,
      parts,
      context,
      keybindingService,
      hoverService,
      clipboardService
    ));
    const contentHoverComputerOptions = hoverResult.options;
    const anchor = contentHoverComputerOptions.anchor;
    const { showAtPosition, showAtSecondaryPosition } = RenderedContentHover.computeHoverPositions(editor, anchor.range, parts);
    this.shouldAppearBeforeContent = parts.some((m) => m.isBeforeContent);
    this.showAtPosition = showAtPosition;
    this.showAtSecondaryPosition = showAtSecondaryPosition;
    this.initialMousePosX = anchor.initialMousePosX;
    this.initialMousePosY = anchor.initialMousePosY;
    this.shouldFocus = contentHoverComputerOptions.shouldFocus;
    this.source = contentHoverComputerOptions.source;
  }
  get domNode() {
    return this._renderedHoverParts.domNode;
  }
  get domNodeHasChildren() {
    return this._renderedHoverParts.domNodeHasChildren;
  }
  get focusedHoverPartIndex() {
    return this._renderedHoverParts.focusedHoverPartIndex;
  }
  get hoverPartsCount() {
    return this._renderedHoverParts.hoverPartsCount;
  }
  focusHoverPartWithIndex(index) {
    this._renderedHoverParts.focusHoverPartWithIndex(index);
  }
  getAccessibleWidgetContent() {
    return this._renderedHoverParts.getAccessibleContent();
  }
  getAccessibleWidgetContentAtIndex(index) {
    return this._renderedHoverParts.getAccessibleHoverContentAtIndex(index);
  }
  async updateHoverVerbosityLevel(action, index, focus) {
    this._renderedHoverParts.updateHoverVerbosityLevel(action, index, focus);
  }
  doesHoverAtIndexSupportVerbosityAction(index, action) {
    return this._renderedHoverParts.doesHoverAtIndexSupportVerbosityAction(index, action);
  }
  isColorPickerVisible() {
    return this._renderedHoverParts.isColorPickerVisible();
  }
  static computeHoverPositions(editor, anchorRange, hoverParts) {
    let startColumnBoundary = 1;
    if (editor.hasModel()) {
      const viewModel = editor._getViewModel();
      const coordinatesConverter = viewModel.coordinatesConverter;
      const anchorViewRange = coordinatesConverter.convertModelRangeToViewRange(anchorRange);
      const anchorViewMinColumn = viewModel.getLineMinColumn(anchorViewRange.startLineNumber);
      const anchorViewRangeStart = new Position(anchorViewRange.startLineNumber, anchorViewMinColumn);
      startColumnBoundary = coordinatesConverter.convertViewPositionToModelPosition(anchorViewRangeStart).column;
    }
    const anchorStartLineNumber = anchorRange.startLineNumber;
    let secondaryPositionColumn = anchorRange.startColumn;
    let forceShowAtRange;
    for (const hoverPart of hoverParts) {
      const hoverPartRange = hoverPart.range;
      const hoverPartRangeOnAnchorStartLine = hoverPartRange.startLineNumber === anchorStartLineNumber;
      const hoverPartRangeOnAnchorEndLine = hoverPartRange.endLineNumber === anchorStartLineNumber;
      const hoverPartRangeIsOnAnchorLine = hoverPartRangeOnAnchorStartLine && hoverPartRangeOnAnchorEndLine;
      if (hoverPartRangeIsOnAnchorLine) {
        const hoverPartStartColumn = hoverPartRange.startColumn;
        const minSecondaryPositionColumn = Math.min(secondaryPositionColumn, hoverPartStartColumn);
        secondaryPositionColumn = Math.max(minSecondaryPositionColumn, startColumnBoundary);
      }
      if (hoverPart.forceShowAtRange) {
        forceShowAtRange = hoverPartRange;
      }
    }
    let showAtPosition;
    let showAtSecondaryPosition;
    if (forceShowAtRange) {
      const forceShowAtPosition = forceShowAtRange.getStartPosition();
      showAtPosition = forceShowAtPosition;
      showAtSecondaryPosition = forceShowAtPosition;
    } else {
      showAtPosition = anchorRange.getStartPosition();
      showAtSecondaryPosition = new Position(anchorStartLineNumber, secondaryPositionColumn);
    }
    return {
      showAtPosition,
      showAtSecondaryPosition
    };
  }
};
RenderedContentHover = __decorateClass([
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IClipboardService)
], RenderedContentHover);
class RenderedStatusBar {
  constructor(fragment, _statusBar) {
    this._statusBar = _statusBar;
    fragment.appendChild(this._statusBar.hoverElement);
  }
  get hoverElement() {
    return this._statusBar.hoverElement;
  }
  get actions() {
    return this._statusBar.actions;
  }
  dispose() {
    this._statusBar.dispose();
  }
}
let RenderedContentHoverParts = class extends Disposable {
  constructor(editor, participants, hoverParts, context, keybindingService, _hoverService, _clipboardService) {
    super();
    this._hoverService = _hoverService;
    this._clipboardService = _clipboardService;
    this._renderedParts = [];
    this._perPartDisposables = /* @__PURE__ */ new Map();
    this._focusedHoverPartIndex = -1;
    this._context = context;
    this._fragment = document.createDocumentFragment();
    this._register(this._renderParts(participants, hoverParts, context, keybindingService, this._hoverService));
    this._register(this._registerListenersOnRenderedParts());
    this._register(this._createEditorDecorations(editor, hoverParts));
    this._updateMarkdownAndColorParticipantInfo(participants);
  }
  _createEditorDecorations(editor, hoverParts) {
    if (hoverParts.length === 0) {
      return Disposable.None;
    }
    let highlightRange = hoverParts[0].range;
    for (const hoverPart of hoverParts) {
      const hoverPartRange = hoverPart.range;
      highlightRange = Range.plusRange(highlightRange, hoverPartRange);
    }
    const highlightDecoration = editor.createDecorationsCollection();
    highlightDecoration.set([{
      range: highlightRange,
      options: RenderedContentHoverParts._DECORATION_OPTIONS
    }]);
    return toDisposable(() => {
      highlightDecoration.clear();
    });
  }
  _renderParts(participants, hoverParts, hoverContext, keybindingService, hoverService) {
    const statusBar = new EditorHoverStatusBar(keybindingService, hoverService);
    const hoverRenderingContext = {
      fragment: this._fragment,
      statusBar,
      ...hoverContext
    };
    const disposables = new DisposableStore();
    disposables.add(statusBar);
    for (const participant of participants) {
      const renderedHoverParts = this._renderHoverPartsForParticipant(hoverParts, participant, hoverRenderingContext);
      disposables.add(renderedHoverParts);
      for (const renderedHoverPart of renderedHoverParts.renderedHoverParts) {
        this._renderedParts.push({
          type: "hoverPart",
          participant,
          hoverPart: renderedHoverPart.hoverPart,
          hoverElement: renderedHoverPart.hoverElement
        });
      }
    }
    const renderedStatusBar = this._renderStatusBar(this._fragment, statusBar);
    if (renderedStatusBar) {
      disposables.add(renderedStatusBar);
      this._renderedParts.push({
        type: "statusBar",
        hoverElement: renderedStatusBar.hoverElement,
        actions: renderedStatusBar.actions
      });
    }
    return disposables;
  }
  _renderHoverPartsForParticipant(hoverParts, participant, hoverRenderingContext) {
    const hoverPartsForParticipant = hoverParts.filter((hoverPart) => hoverPart.owner === participant);
    const hasHoverPartsForParticipant = hoverPartsForParticipant.length > 0;
    if (!hasHoverPartsForParticipant) {
      return new RenderedHoverParts([]);
    }
    return participant.renderHoverParts(hoverRenderingContext, hoverPartsForParticipant);
  }
  _renderStatusBar(fragment, statusBar) {
    if (!statusBar.hasContent) {
      return void 0;
    }
    return new RenderedStatusBar(fragment, statusBar);
  }
  _registerListenersOnRenderedParts() {
    this._renderedParts.forEach((renderedPart, index) => {
      this._createListenersForPart(index, renderedPart);
    });
    return toDisposable(() => {
      for (const d of this._perPartDisposables.values()) {
        d.dispose();
      }
      this._perPartDisposables.clear();
    });
  }
  _createListenersForPart(index, renderedPart) {
    const partDisposables = new DisposableStore();
    const element = renderedPart.hoverElement;
    element.tabIndex = 0;
    partDisposables.add(dom.addDisposableListener(element, dom.EventType.FOCUS_IN, (event) => {
      event.stopPropagation();
      this._focusedHoverPartIndex = index;
    }));
    partDisposables.add(dom.addDisposableListener(element, dom.EventType.FOCUS_OUT, (event) => {
      event.stopPropagation();
      this._focusedHoverPartIndex = -1;
    }));
    if (renderedPart.type === "hoverPart" && !(renderedPart.hoverPart instanceof ColorHover) && !renderedPart.participant.hideCopyButton) {
      partDisposables.add(new HoverCopyButton(
        element,
        () => renderedPart.participant.getAccessibleContent(renderedPart.hoverPart),
        this._clipboardService,
        this._hoverService
      ));
    }
    this._perPartDisposables.set(index, partDisposables);
  }
  _updateMarkdownAndColorParticipantInfo(participants) {
    const markdownHoverParticipant = participants.find((p) => {
      return p instanceof MarkdownHoverParticipant && !(p instanceof InlayHintsHover);
    });
    if (markdownHoverParticipant) {
      this._markdownHoverParticipant = markdownHoverParticipant;
    }
    this._colorHoverParticipant = participants.find((p) => p instanceof HoverColorPickerParticipant);
  }
  focusHoverPartWithIndex(index) {
    if (index < 0 || index >= this._renderedParts.length) {
      return;
    }
    this._renderedParts[index].hoverElement.focus();
  }
  getAccessibleContent() {
    const content = [];
    for (let i = 0; i < this._renderedParts.length; i++) {
      content.push(this.getAccessibleHoverContentAtIndex(i));
    }
    return content.join("\n\n");
  }
  getAccessibleHoverContentAtIndex(index) {
    const renderedPart = this._renderedParts[index];
    if (!renderedPart) {
      return "";
    }
    if (renderedPart.type === "statusBar") {
      const statusBarDescription = [localize("hoverAccessibilityStatusBar", "This is a hover status bar.")];
      for (const action of renderedPart.actions) {
        const keybinding = action.actionKeybindingLabel;
        if (keybinding) {
          statusBarDescription.push(localize("hoverAccessibilityStatusBarActionWithKeybinding", "It has an action with label {0} and keybinding {1}.", action.actionLabel, keybinding));
        } else {
          statusBarDescription.push(localize("hoverAccessibilityStatusBarActionWithoutKeybinding", "It has an action with label {0}.", action.actionLabel));
        }
      }
      return statusBarDescription.join("\n");
    }
    return renderedPart.participant.getAccessibleContent(renderedPart.hoverPart);
  }
  async updateHoverVerbosityLevel(action, index, focus) {
    if (!this._markdownHoverParticipant) {
      return;
    }
    let rangeOfIndicesToUpdate;
    if (index >= 0) {
      rangeOfIndicesToUpdate = { start: index, endExclusive: index + 1 };
    } else {
      rangeOfIndicesToUpdate = this._findRangeOfMarkdownHoverParts(this._markdownHoverParticipant);
    }
    for (let i = rangeOfIndicesToUpdate.start; i < rangeOfIndicesToUpdate.endExclusive; i++) {
      const normalizedMarkdownHoverIndex = this._normalizedIndexToMarkdownHoverIndexRange(this._markdownHoverParticipant, i);
      if (normalizedMarkdownHoverIndex === void 0) {
        continue;
      }
      const renderedPart = await this._markdownHoverParticipant.updateMarkdownHoverVerbosityLevel(action, normalizedMarkdownHoverIndex);
      if (!renderedPart) {
        continue;
      }
      const prevDisposable = this._perPartDisposables.get(i);
      if (prevDisposable) {
        prevDisposable.dispose();
        this._perPartDisposables.delete(i);
      }
      this._renderedParts[i] = {
        type: "hoverPart",
        participant: this._markdownHoverParticipant,
        hoverPart: renderedPart.hoverPart,
        hoverElement: renderedPart.hoverElement
      };
      this._createListenersForPart(i, this._renderedParts[i]);
    }
    if (focus) {
      if (index >= 0) {
        this.focusHoverPartWithIndex(index);
      } else {
        this._context.focus();
      }
    }
    this._context.onContentsChanged();
  }
  doesHoverAtIndexSupportVerbosityAction(index, action) {
    if (!this._markdownHoverParticipant) {
      return false;
    }
    const normalizedMarkdownHoverIndex = this._normalizedIndexToMarkdownHoverIndexRange(this._markdownHoverParticipant, index);
    if (normalizedMarkdownHoverIndex === void 0) {
      return false;
    }
    return this._markdownHoverParticipant.doesMarkdownHoverAtIndexSupportVerbosityAction(normalizedMarkdownHoverIndex, action);
  }
  isColorPickerVisible() {
    return this._colorHoverParticipant?.isColorPickerVisible() ?? false;
  }
  _normalizedIndexToMarkdownHoverIndexRange(markdownHoverParticipant, index) {
    const renderedPart = this._renderedParts[index];
    if (!renderedPart || renderedPart.type !== "hoverPart") {
      return void 0;
    }
    const isHoverPartMarkdownHover = renderedPart.participant === markdownHoverParticipant;
    if (!isHoverPartMarkdownHover) {
      return void 0;
    }
    const firstIndexOfMarkdownHovers = this._renderedParts.findIndex(
      (renderedPart2) => renderedPart2.type === "hoverPart" && renderedPart2.participant === markdownHoverParticipant
    );
    if (firstIndexOfMarkdownHovers === -1) {
      throw new BugIndicatingError();
    }
    return index - firstIndexOfMarkdownHovers;
  }
  _findRangeOfMarkdownHoverParts(markdownHoverParticipant) {
    const copiedRenderedParts = this._renderedParts.slice();
    const firstIndexOfMarkdownHovers = copiedRenderedParts.findIndex((renderedPart) => renderedPart.type === "hoverPart" && renderedPart.participant === markdownHoverParticipant);
    const inversedLastIndexOfMarkdownHovers = copiedRenderedParts.reverse().findIndex((renderedPart) => renderedPart.type === "hoverPart" && renderedPart.participant === markdownHoverParticipant);
    const lastIndexOfMarkdownHovers = inversedLastIndexOfMarkdownHovers >= 0 ? copiedRenderedParts.length - inversedLastIndexOfMarkdownHovers : inversedLastIndexOfMarkdownHovers;
    return { start: firstIndexOfMarkdownHovers, endExclusive: lastIndexOfMarkdownHovers + 1 };
  }
  get domNode() {
    return this._fragment;
  }
  get domNodeHasChildren() {
    return this._fragment.hasChildNodes();
  }
  get focusedHoverPartIndex() {
    return this._focusedHoverPartIndex;
  }
  get hoverPartsCount() {
    return this._renderedParts.length;
  }
};
RenderedContentHoverParts._DECORATION_OPTIONS = ModelDecorationOptions.register({
  description: "content-hover-highlight",
  className: "hoverHighlight"
});
RenderedContentHoverParts = __decorateClass([
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IHoverService),
  __decorateParam(6, IClipboardService)
], RenderedContentHoverParts);
export {
  RenderedContentHover
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvY29udGVudEhvdmVyUmVuZGVyZWQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJRWRpdG9ySG92ZXJDb250ZXh0LCBJRWRpdG9ySG92ZXJQYXJ0aWNpcGFudCwgSUVkaXRvckhvdmVyUmVuZGVyQ29udGV4dCwgSUhvdmVyUGFydCwgSVJlbmRlcmVkSG92ZXJQYXJ0cywgUmVuZGVyZWRIb3ZlclBhcnRzIH0gZnJvbSAnLi9ob3ZlclR5cGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JIb3ZlclN0YXR1c0JhciB9IGZyb20gJy4vY29udGVudEhvdmVyU3RhdHVzQmFyLmpzJztcbmltcG9ydCB7IEhvdmVyU3RhcnRTb3VyY2UgfSBmcm9tICcuL2hvdmVyT3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IEhvdmVyQ29weUJ1dHRvbiB9IGZyb20gJy4vaG92ZXJDb3B5QnV0dG9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IENvbnRlbnRIb3ZlclJlc3VsdCB9IGZyb20gJy4vY29udGVudEhvdmVyVHlwZXMuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSG92ZXJWZXJib3NpdHlBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IE1hcmtkb3duSG92ZXJQYXJ0aWNpcGFudCB9IGZyb20gJy4vbWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50LmpzJztcbmltcG9ydCB7IENvbG9ySG92ZXIsIEhvdmVyQ29sb3JQaWNrZXJQYXJ0aWNpcGFudCB9IGZyb20gJy4uLy4uL2NvbG9yUGlja2VyL2Jyb3dzZXIvaG92ZXJDb2xvclBpY2tlci9ob3ZlckNvbG9yUGlja2VyUGFydGljaXBhbnQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSW5sYXlIaW50c0hvdmVyIH0gZnJvbSAnLi4vLi4vaW5sYXlIaW50cy9icm93c2VyL2lubGF5SGludHNIb3Zlci5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSG92ZXJBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSU9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIFJlbmRlcmVkQ29udGVudEhvdmVyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHVibGljIGNsb3Nlc3RNb3VzZURpc3RhbmNlOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBpbml0aWFsTW91c2VQb3NYOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBpbml0aWFsTW91c2VQb3NZOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIHJlYWRvbmx5IHNob3dBdFBvc2l0aW9uOiBQb3NpdGlvbjtcblx0cHVibGljIHJlYWRvbmx5IHNob3dBdFNlY29uZGFyeVBvc2l0aW9uOiBQb3NpdGlvbjtcblx0cHVibGljIHJlYWRvbmx5IHNob3VsZEZvY3VzOiBib29sZWFuO1xuXHRwdWJsaWMgcmVhZG9ubHkgc291cmNlOiBIb3ZlclN0YXJ0U291cmNlO1xuXHRwdWJsaWMgcmVhZG9ubHkgc2hvdWxkQXBwZWFyQmVmb3JlQ29udGVudDogYm9vbGVhbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJlZEhvdmVyUGFydHM6IFJlbmRlcmVkQ29udGVudEhvdmVyUGFydHM7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRob3ZlclJlc3VsdDogQ29udGVudEhvdmVyUmVzdWx0LFxuXHRcdHBhcnRpY2lwYW50czogSUVkaXRvckhvdmVyUGFydGljaXBhbnQ8SUhvdmVyUGFydD5bXSxcblx0XHRjb250ZXh0OiBJRWRpdG9ySG92ZXJDb250ZXh0LFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3QgcGFydHMgPSBob3ZlclJlc3VsdC5ob3ZlclBhcnRzO1xuXHRcdHRoaXMuX3JlbmRlcmVkSG92ZXJQYXJ0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSZW5kZXJlZENvbnRlbnRIb3ZlclBhcnRzKFxuXHRcdFx0ZWRpdG9yLFxuXHRcdFx0cGFydGljaXBhbnRzLFxuXHRcdFx0cGFydHMsXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0a2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0XHRob3ZlclNlcnZpY2UsXG5cdFx0XHRjbGlwYm9hcmRTZXJ2aWNlXG5cdFx0KSk7XG5cdFx0Y29uc3QgY29udGVudEhvdmVyQ29tcHV0ZXJPcHRpb25zID0gaG92ZXJSZXN1bHQub3B0aW9ucztcblx0XHRjb25zdCBhbmNob3IgPSBjb250ZW50SG92ZXJDb21wdXRlck9wdGlvbnMuYW5jaG9yO1xuXHRcdGNvbnN0IHsgc2hvd0F0UG9zaXRpb24sIHNob3dBdFNlY29uZGFyeVBvc2l0aW9uIH0gPSBSZW5kZXJlZENvbnRlbnRIb3Zlci5jb21wdXRlSG92ZXJQb3NpdGlvbnMoZWRpdG9yLCBhbmNob3IucmFuZ2UsIHBhcnRzKTtcblx0XHR0aGlzLnNob3VsZEFwcGVhckJlZm9yZUNvbnRlbnQgPSBwYXJ0cy5zb21lKG0gPT4gbS5pc0JlZm9yZUNvbnRlbnQpO1xuXHRcdHRoaXMuc2hvd0F0UG9zaXRpb24gPSBzaG93QXRQb3NpdGlvbjtcblx0XHR0aGlzLnNob3dBdFNlY29uZGFyeVBvc2l0aW9uID0gc2hvd0F0U2Vjb25kYXJ5UG9zaXRpb247XG5cdFx0dGhpcy5pbml0aWFsTW91c2VQb3NYID0gYW5jaG9yLmluaXRpYWxNb3VzZVBvc1g7XG5cdFx0dGhpcy5pbml0aWFsTW91c2VQb3NZID0gYW5jaG9yLmluaXRpYWxNb3VzZVBvc1k7XG5cdFx0dGhpcy5zaG91bGRGb2N1cyA9IGNvbnRlbnRIb3ZlckNvbXB1dGVyT3B0aW9ucy5zaG91bGRGb2N1cztcblx0XHR0aGlzLnNvdXJjZSA9IGNvbnRlbnRIb3ZlckNvbXB1dGVyT3B0aW9ucy5zb3VyY2U7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGRvbU5vZGUoKTogRG9jdW1lbnRGcmFnbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkSG92ZXJQYXJ0cy5kb21Ob2RlO1xuXHR9XG5cblx0cHVibGljIGdldCBkb21Ob2RlSGFzQ2hpbGRyZW4oKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkSG92ZXJQYXJ0cy5kb21Ob2RlSGFzQ2hpbGRyZW47XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGZvY3VzZWRIb3ZlclBhcnRJbmRleCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlZEhvdmVyUGFydHMuZm9jdXNlZEhvdmVyUGFydEluZGV4O1xuXHR9XG5cblx0cHVibGljIGdldCBob3ZlclBhcnRzQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRIb3ZlclBhcnRzLmhvdmVyUGFydHNDb3VudDtcblx0fVxuXG5cdHB1YmxpYyBmb2N1c0hvdmVyUGFydFdpdGhJbmRleChpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVuZGVyZWRIb3ZlclBhcnRzLmZvY3VzSG92ZXJQYXJ0V2l0aEluZGV4KGluZGV4KTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY2Nlc3NpYmxlV2lkZ2V0Q29udGVudCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlZEhvdmVyUGFydHMuZ2V0QWNjZXNzaWJsZUNvbnRlbnQoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY2Nlc3NpYmxlV2lkZ2V0Q29udGVudEF0SW5kZXgoaW5kZXg6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkSG92ZXJQYXJ0cy5nZXRBY2Nlc3NpYmxlSG92ZXJDb250ZW50QXRJbmRleChpbmRleCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdXBkYXRlSG92ZXJWZXJib3NpdHlMZXZlbChhY3Rpb246IEhvdmVyVmVyYm9zaXR5QWN0aW9uLCBpbmRleDogbnVtYmVyLCBmb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9yZW5kZXJlZEhvdmVyUGFydHMudXBkYXRlSG92ZXJWZXJib3NpdHlMZXZlbChhY3Rpb24sIGluZGV4LCBmb2N1cyk7XG5cdH1cblxuXHRwdWJsaWMgZG9lc0hvdmVyQXRJbmRleFN1cHBvcnRWZXJib3NpdHlBY3Rpb24oaW5kZXg6IG51bWJlciwgYWN0aW9uOiBIb3ZlclZlcmJvc2l0eUFjdGlvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlZEhvdmVyUGFydHMuZG9lc0hvdmVyQXRJbmRleFN1cHBvcnRWZXJib3NpdHlBY3Rpb24oaW5kZXgsIGFjdGlvbik7XG5cdH1cblxuXHRwdWJsaWMgaXNDb2xvclBpY2tlclZpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlbmRlcmVkSG92ZXJQYXJ0cy5pc0NvbG9yUGlja2VyVmlzaWJsZSgpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBjb21wdXRlSG92ZXJQb3NpdGlvbnMoZWRpdG9yOiBJQ29kZUVkaXRvciwgYW5jaG9yUmFuZ2U6IFJhbmdlLCBob3ZlclBhcnRzOiBJSG92ZXJQYXJ0W10pOiB7IHNob3dBdFBvc2l0aW9uOiBQb3NpdGlvbjsgc2hvd0F0U2Vjb25kYXJ5UG9zaXRpb246IFBvc2l0aW9uIH0ge1xuXG5cdFx0bGV0IHN0YXJ0Q29sdW1uQm91bmRhcnkgPSAxO1xuXHRcdGlmIChlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0Ly8gRW5zdXJlIHRoZSByYW5nZSBpcyBvbiB0aGUgY3VycmVudCB2aWV3IGxpbmVcblx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IGVkaXRvci5fZ2V0Vmlld01vZGVsKCk7XG5cdFx0XHRjb25zdCBjb29yZGluYXRlc0NvbnZlcnRlciA9IHZpZXdNb2RlbC5jb29yZGluYXRlc0NvbnZlcnRlcjtcblx0XHRcdGNvbnN0IGFuY2hvclZpZXdSYW5nZSA9IGNvb3JkaW5hdGVzQ29udmVydGVyLmNvbnZlcnRNb2RlbFJhbmdlVG9WaWV3UmFuZ2UoYW5jaG9yUmFuZ2UpO1xuXHRcdFx0Y29uc3QgYW5jaG9yVmlld01pbkNvbHVtbiA9IHZpZXdNb2RlbC5nZXRMaW5lTWluQ29sdW1uKGFuY2hvclZpZXdSYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgYW5jaG9yVmlld1JhbmdlU3RhcnQgPSBuZXcgUG9zaXRpb24oYW5jaG9yVmlld1JhbmdlLnN0YXJ0TGluZU51bWJlciwgYW5jaG9yVmlld01pbkNvbHVtbik7XG5cdFx0XHRzdGFydENvbHVtbkJvdW5kYXJ5ID0gY29vcmRpbmF0ZXNDb252ZXJ0ZXIuY29udmVydFZpZXdQb3NpdGlvblRvTW9kZWxQb3NpdGlvbihhbmNob3JWaWV3UmFuZ2VTdGFydCkuY29sdW1uO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBhbmNob3IgcmFuZ2UgaXMgYWx3YXlzIG9uIGEgc2luZ2xlIGxpbmVcblx0XHRjb25zdCBhbmNob3JTdGFydExpbmVOdW1iZXIgPSBhbmNob3JSYW5nZS5zdGFydExpbmVOdW1iZXI7XG5cdFx0bGV0IHNlY29uZGFyeVBvc2l0aW9uQ29sdW1uID0gYW5jaG9yUmFuZ2Uuc3RhcnRDb2x1bW47XG5cdFx0bGV0IGZvcmNlU2hvd0F0UmFuZ2U6IFJhbmdlIHwgdW5kZWZpbmVkO1xuXG5cdFx0Zm9yIChjb25zdCBob3ZlclBhcnQgb2YgaG92ZXJQYXJ0cykge1xuXHRcdFx0Y29uc3QgaG92ZXJQYXJ0UmFuZ2UgPSBob3ZlclBhcnQucmFuZ2U7XG5cdFx0XHRjb25zdCBob3ZlclBhcnRSYW5nZU9uQW5jaG9yU3RhcnRMaW5lID0gaG92ZXJQYXJ0UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBhbmNob3JTdGFydExpbmVOdW1iZXI7XG5cdFx0XHRjb25zdCBob3ZlclBhcnRSYW5nZU9uQW5jaG9yRW5kTGluZSA9IGhvdmVyUGFydFJhbmdlLmVuZExpbmVOdW1iZXIgPT09IGFuY2hvclN0YXJ0TGluZU51bWJlcjtcblx0XHRcdGNvbnN0IGhvdmVyUGFydFJhbmdlSXNPbkFuY2hvckxpbmUgPSBob3ZlclBhcnRSYW5nZU9uQW5jaG9yU3RhcnRMaW5lICYmIGhvdmVyUGFydFJhbmdlT25BbmNob3JFbmRMaW5lO1xuXHRcdFx0aWYgKGhvdmVyUGFydFJhbmdlSXNPbkFuY2hvckxpbmUpIHtcblx0XHRcdFx0Ly8gdGhpcyBtZXNzYWdlIGhhcyBhIHJhbmdlIHRoYXQgaXMgY29tcGxldGVseSBzaXR0aW5nIG9uIHRoZSBsaW5lIG9mIHRoZSBhbmNob3Jcblx0XHRcdFx0Y29uc3QgaG92ZXJQYXJ0U3RhcnRDb2x1bW4gPSBob3ZlclBhcnRSYW5nZS5zdGFydENvbHVtbjtcblx0XHRcdFx0Y29uc3QgbWluU2Vjb25kYXJ5UG9zaXRpb25Db2x1bW4gPSBNYXRoLm1pbihzZWNvbmRhcnlQb3NpdGlvbkNvbHVtbiwgaG92ZXJQYXJ0U3RhcnRDb2x1bW4pO1xuXHRcdFx0XHRzZWNvbmRhcnlQb3NpdGlvbkNvbHVtbiA9IE1hdGgubWF4KG1pblNlY29uZGFyeVBvc2l0aW9uQ29sdW1uLCBzdGFydENvbHVtbkJvdW5kYXJ5KTtcblx0XHRcdH1cblx0XHRcdGlmIChob3ZlclBhcnQuZm9yY2VTaG93QXRSYW5nZSkge1xuXHRcdFx0XHRmb3JjZVNob3dBdFJhbmdlID0gaG92ZXJQYXJ0UmFuZ2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHNob3dBdFBvc2l0aW9uOiBQb3NpdGlvbjtcblx0XHRsZXQgc2hvd0F0U2Vjb25kYXJ5UG9zaXRpb246IFBvc2l0aW9uO1xuXHRcdGlmIChmb3JjZVNob3dBdFJhbmdlKSB7XG5cdFx0XHRjb25zdCBmb3JjZVNob3dBdFBvc2l0aW9uID0gZm9yY2VTaG93QXRSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0XHRzaG93QXRQb3NpdGlvbiA9IGZvcmNlU2hvd0F0UG9zaXRpb247XG5cdFx0XHRzaG93QXRTZWNvbmRhcnlQb3NpdGlvbiA9IGZvcmNlU2hvd0F0UG9zaXRpb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNob3dBdFBvc2l0aW9uID0gYW5jaG9yUmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdFx0c2hvd0F0U2Vjb25kYXJ5UG9zaXRpb24gPSBuZXcgUG9zaXRpb24oYW5jaG9yU3RhcnRMaW5lTnVtYmVyLCBzZWNvbmRhcnlQb3NpdGlvbkNvbHVtbik7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRzaG93QXRQb3NpdGlvbixcblx0XHRcdHNob3dBdFNlY29uZGFyeVBvc2l0aW9uLFxuXHRcdH07XG5cdH1cbn1cblxuaW50ZXJmYWNlIElSZW5kZXJlZENvbnRlbnRIb3ZlclBhcnQge1xuXHQvKipcblx0ICogVHlwZSBvZiByZW5kZXJlZCBwYXJ0XG5cdCAqL1xuXHR0eXBlOiAnaG92ZXJQYXJ0Jztcblx0LyoqXG5cdCAqIFBhcnRpY2lwYW50IG9mIHRoZSByZW5kZXJlZCBob3ZlciBwYXJ0XG5cdCAqL1xuXHRwYXJ0aWNpcGFudDogSUVkaXRvckhvdmVyUGFydGljaXBhbnQ8SUhvdmVyUGFydD47XG5cdC8qKlxuXHQgKiBUaGUgcmVuZGVyZWQgaG92ZXIgcGFydFxuXHQgKi9cblx0aG92ZXJQYXJ0OiBJSG92ZXJQYXJ0O1xuXHQvKipcblx0ICogVGhlIEhUTUwgZWxlbWVudCBjb250YWluaW5nIHRoZSBob3ZlciBzdGF0dXMgYmFyLlxuXHQgKi9cblx0aG92ZXJFbGVtZW50OiBIVE1MRWxlbWVudDtcbn1cblxuaW50ZXJmYWNlIElSZW5kZXJlZENvbnRlbnRTdGF0dXNCYXIge1xuXHQvKipcblx0ICogVHlwZSBvZiByZW5kZXJlZCBwYXJ0XG5cdCAqL1xuXHR0eXBlOiAnc3RhdHVzQmFyJztcblx0LyoqXG5cdCAqIFRoZSBIVE1MIGVsZW1lbnQgY29udGFpbmluZyB0aGUgaG92ZXIgc3RhdHVzIGJhci5cblx0ICovXG5cdGhvdmVyRWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdC8qKlxuXHQgKiBUaGUgYWN0aW9ucyBvZiB0aGUgaG92ZXIgc3RhdHVzIGJhci5cblx0ICovXG5cdGFjdGlvbnM6IEhvdmVyQWN0aW9uW107XG59XG5cbnR5cGUgSVJlbmRlcmVkQ29udGVudEhvdmVyUGFydE9yU3RhdHVzQmFyID0gSVJlbmRlcmVkQ29udGVudEhvdmVyUGFydCB8IElSZW5kZXJlZENvbnRlbnRTdGF0dXNCYXI7XG5cbmNsYXNzIFJlbmRlcmVkU3RhdHVzQmFyIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdGNvbnN0cnVjdG9yKGZyYWdtZW50OiBEb2N1bWVudEZyYWdtZW50LCBwcml2YXRlIHJlYWRvbmx5IF9zdGF0dXNCYXI6IEVkaXRvckhvdmVyU3RhdHVzQmFyKSB7XG5cdFx0ZnJhZ21lbnQuYXBwZW5kQ2hpbGQodGhpcy5fc3RhdHVzQmFyLmhvdmVyRWxlbWVudCk7XG5cdH1cblxuXHRnZXQgaG92ZXJFbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhdHVzQmFyLmhvdmVyRWxlbWVudDtcblx0fVxuXG5cdGdldCBhY3Rpb25zKCk6IEhvdmVyQWN0aW9uW10ge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0dXNCYXIuYWN0aW9ucztcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fc3RhdHVzQmFyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBSZW5kZXJlZENvbnRlbnRIb3ZlclBhcnRzIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX0RFQ09SQVRJT05fT1BUSU9OUyA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoe1xuXHRcdGRlc2NyaXB0aW9uOiAnY29udGVudC1ob3Zlci1oaWdobGlnaHQnLFxuXHRcdGNsYXNzTmFtZTogJ2hvdmVySGlnaGxpZ2h0J1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJlZFBhcnRzOiBJUmVuZGVyZWRDb250ZW50SG92ZXJQYXJ0T3JTdGF0dXNCYXJbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZXJQYXJ0RGlzcG9zYWJsZXMgPSBuZXcgTWFwPG51bWJlciwgSURpc3Bvc2FibGU+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZyYWdtZW50OiBEb2N1bWVudEZyYWdtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0OiBJRWRpdG9ySG92ZXJDb250ZXh0O1xuXG5cdHByaXZhdGUgX21hcmtkb3duSG92ZXJQYXJ0aWNpcGFudDogTWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jb2xvckhvdmVyUGFydGljaXBhbnQ6IEhvdmVyQ29sb3JQaWNrZXJQYXJ0aWNpcGFudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZm9jdXNlZEhvdmVyUGFydEluZGV4OiBudW1iZXIgPSAtMTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHBhcnRpY2lwYW50czogSUVkaXRvckhvdmVyUGFydGljaXBhbnQ8SUhvdmVyUGFydD5bXSxcblx0XHRob3ZlclBhcnRzOiBJSG92ZXJQYXJ0W10sXG5cdFx0Y29udGV4dDogSUVkaXRvckhvdmVyQ29udGV4dCxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ2xpcGJvYXJkU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NvbnRleHQgPSBjb250ZXh0O1xuXHRcdHRoaXMuX2ZyYWdtZW50ID0gZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlbmRlclBhcnRzKHBhcnRpY2lwYW50cywgaG92ZXJQYXJ0cywgY29udGV4dCwga2V5YmluZGluZ1NlcnZpY2UsIHRoaXMuX2hvdmVyU2VydmljZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3JlZ2lzdGVyTGlzdGVuZXJzT25SZW5kZXJlZFBhcnRzKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NyZWF0ZUVkaXRvckRlY29yYXRpb25zKGVkaXRvciwgaG92ZXJQYXJ0cykpO1xuXHRcdHRoaXMuX3VwZGF0ZU1hcmtkb3duQW5kQ29sb3JQYXJ0aWNpcGFudEluZm8ocGFydGljaXBhbnRzKTtcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZUVkaXRvckRlY29yYXRpb25zKGVkaXRvcjogSUNvZGVFZGl0b3IsIGhvdmVyUGFydHM6IElIb3ZlclBhcnRbXSk6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAoaG92ZXJQYXJ0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0fVxuXHRcdGxldCBoaWdobGlnaHRSYW5nZSA9IGhvdmVyUGFydHNbMF0ucmFuZ2U7XG5cdFx0Zm9yIChjb25zdCBob3ZlclBhcnQgb2YgaG92ZXJQYXJ0cykge1xuXHRcdFx0Y29uc3QgaG92ZXJQYXJ0UmFuZ2UgPSBob3ZlclBhcnQucmFuZ2U7XG5cdFx0XHRoaWdobGlnaHRSYW5nZSA9IFJhbmdlLnBsdXNSYW5nZShoaWdobGlnaHRSYW5nZSwgaG92ZXJQYXJ0UmFuZ2UpO1xuXHRcdH1cblx0XHRjb25zdCBoaWdobGlnaHREZWNvcmF0aW9uID0gZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdGhpZ2hsaWdodERlY29yYXRpb24uc2V0KFt7XG5cdFx0XHRyYW5nZTogaGlnaGxpZ2h0UmFuZ2UsXG5cdFx0XHRvcHRpb25zOiBSZW5kZXJlZENvbnRlbnRIb3ZlclBhcnRzLl9ERUNPUkFUSU9OX09QVElPTlNcblx0XHR9XSk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRoaWdobGlnaHREZWNvcmF0aW9uLmNsZWFyKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW5kZXJQYXJ0cyhwYXJ0aWNpcGFudHM6IElFZGl0b3JIb3ZlclBhcnRpY2lwYW50PElIb3ZlclBhcnQ+W10sIGhvdmVyUGFydHM6IElIb3ZlclBhcnRbXSwgaG92ZXJDb250ZXh0OiBJRWRpdG9ySG92ZXJDb250ZXh0LCBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLCBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3Qgc3RhdHVzQmFyID0gbmV3IEVkaXRvckhvdmVyU3RhdHVzQmFyKGtleWJpbmRpbmdTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXHRcdGNvbnN0IGhvdmVyUmVuZGVyaW5nQ29udGV4dDogSUVkaXRvckhvdmVyUmVuZGVyQ29udGV4dCA9IHtcblx0XHRcdGZyYWdtZW50OiB0aGlzLl9mcmFnbWVudCxcblx0XHRcdHN0YXR1c0Jhcixcblx0XHRcdC4uLmhvdmVyQ29udGV4dFxuXHRcdH07XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHN0YXR1c0Jhcik7XG5cdFx0Zm9yIChjb25zdCBwYXJ0aWNpcGFudCBvZiBwYXJ0aWNpcGFudHMpIHtcblx0XHRcdGNvbnN0IHJlbmRlcmVkSG92ZXJQYXJ0cyA9IHRoaXMuX3JlbmRlckhvdmVyUGFydHNGb3JQYXJ0aWNpcGFudChob3ZlclBhcnRzLCBwYXJ0aWNpcGFudCwgaG92ZXJSZW5kZXJpbmdDb250ZXh0KTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChyZW5kZXJlZEhvdmVyUGFydHMpO1xuXHRcdFx0Zm9yIChjb25zdCByZW5kZXJlZEhvdmVyUGFydCBvZiByZW5kZXJlZEhvdmVyUGFydHMucmVuZGVyZWRIb3ZlclBhcnRzKSB7XG5cdFx0XHRcdHRoaXMuX3JlbmRlcmVkUGFydHMucHVzaCh7XG5cdFx0XHRcdFx0dHlwZTogJ2hvdmVyUGFydCcsXG5cdFx0XHRcdFx0cGFydGljaXBhbnQsXG5cdFx0XHRcdFx0aG92ZXJQYXJ0OiByZW5kZXJlZEhvdmVyUGFydC5ob3ZlclBhcnQsXG5cdFx0XHRcdFx0aG92ZXJFbGVtZW50OiByZW5kZXJlZEhvdmVyUGFydC5ob3ZlckVsZW1lbnQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCByZW5kZXJlZFN0YXR1c0JhciA9IHRoaXMuX3JlbmRlclN0YXR1c0Jhcih0aGlzLl9mcmFnbWVudCwgc3RhdHVzQmFyKTtcblx0XHRpZiAocmVuZGVyZWRTdGF0dXNCYXIpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChyZW5kZXJlZFN0YXR1c0Jhcik7XG5cdFx0XHR0aGlzLl9yZW5kZXJlZFBhcnRzLnB1c2goe1xuXHRcdFx0XHR0eXBlOiAnc3RhdHVzQmFyJyxcblx0XHRcdFx0aG92ZXJFbGVtZW50OiByZW5kZXJlZFN0YXR1c0Jhci5ob3ZlckVsZW1lbnQsXG5cdFx0XHRcdGFjdGlvbnM6IHJlbmRlcmVkU3RhdHVzQmFyLmFjdGlvbnMsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVySG92ZXJQYXJ0c0ZvclBhcnRpY2lwYW50KGhvdmVyUGFydHM6IElIb3ZlclBhcnRbXSwgcGFydGljaXBhbnQ6IElFZGl0b3JIb3ZlclBhcnRpY2lwYW50PElIb3ZlclBhcnQ+LCBob3ZlclJlbmRlcmluZ0NvbnRleHQ6IElFZGl0b3JIb3ZlclJlbmRlckNvbnRleHQpOiBJUmVuZGVyZWRIb3ZlclBhcnRzPElIb3ZlclBhcnQ+IHtcblx0XHRjb25zdCBob3ZlclBhcnRzRm9yUGFydGljaXBhbnQgPSBob3ZlclBhcnRzLmZpbHRlcihob3ZlclBhcnQgPT4gaG92ZXJQYXJ0Lm93bmVyID09PSBwYXJ0aWNpcGFudCk7XG5cdFx0Y29uc3QgaGFzSG92ZXJQYXJ0c0ZvclBhcnRpY2lwYW50ID0gaG92ZXJQYXJ0c0ZvclBhcnRpY2lwYW50Lmxlbmd0aCA+IDA7XG5cdFx0aWYgKCFoYXNIb3ZlclBhcnRzRm9yUGFydGljaXBhbnQpIHtcblx0XHRcdHJldHVybiBuZXcgUmVuZGVyZWRIb3ZlclBhcnRzKFtdKTtcblx0XHR9XG5cdFx0cmV0dXJuIHBhcnRpY2lwYW50LnJlbmRlckhvdmVyUGFydHMoaG92ZXJSZW5kZXJpbmdDb250ZXh0LCBob3ZlclBhcnRzRm9yUGFydGljaXBhbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVuZGVyU3RhdHVzQmFyKGZyYWdtZW50OiBEb2N1bWVudEZyYWdtZW50LCBzdGF0dXNCYXI6IEVkaXRvckhvdmVyU3RhdHVzQmFyKTogUmVuZGVyZWRTdGF0dXNCYXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICghc3RhdHVzQmFyLmhhc0NvbnRlbnQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgUmVuZGVyZWRTdGF0dXNCYXIoZnJhZ21lbnQsIHN0YXR1c0Jhcik7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3Rlckxpc3RlbmVyc09uUmVuZGVyZWRQYXJ0cygpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Ly8gQ3JlYXRlIHBlci1wYXJ0IGRpc3Bvc2FibGVzIHNvIHRoYXQgd2hlbiBhbiBpbmRpdmlkdWFsIHJlbmRlcmVkIHBhcnQgaXNcblx0XHQvLyB1cGRhdGVkIHdlIGNhbiBkaXNwb3NlIGl0cyBsaXN0ZW5lcnMgYW5kIGNvcHkgYnV0dG9uIHdpdGhvdXQgYWZmZWN0aW5nXG5cdFx0Ly8gdGhlIG90aGVycy5cblx0XHR0aGlzLl9yZW5kZXJlZFBhcnRzLmZvckVhY2goKHJlbmRlcmVkUGFydDogSVJlbmRlcmVkQ29udGVudEhvdmVyUGFydE9yU3RhdHVzQmFyLCBpbmRleDogbnVtYmVyKSA9PiB7XG5cdFx0XHR0aGlzLl9jcmVhdGVMaXN0ZW5lcnNGb3JQYXJ0KGluZGV4LCByZW5kZXJlZFBhcnQpO1xuXHRcdH0pO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBkIG9mIHRoaXMuX3BlclBhcnREaXNwb3NhYmxlcy52YWx1ZXMoKSkge1xuXHRcdFx0XHRkLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3BlclBhcnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlTGlzdGVuZXJzRm9yUGFydChpbmRleDogbnVtYmVyLCByZW5kZXJlZFBhcnQ6IElSZW5kZXJlZENvbnRlbnRIb3ZlclBhcnRPclN0YXR1c0Jhcik6IHZvaWQge1xuXHRcdGNvbnN0IHBhcnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBlbGVtZW50ID0gcmVuZGVyZWRQYXJ0LmhvdmVyRWxlbWVudDtcblx0XHRlbGVtZW50LnRhYkluZGV4ID0gMDtcblx0XHRwYXJ0RGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5GT0NVU19JTiwgKGV2ZW50OiBFdmVudCkgPT4ge1xuXHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR0aGlzLl9mb2N1c2VkSG92ZXJQYXJ0SW5kZXggPSBpbmRleDtcblx0XHR9KSk7XG5cdFx0cGFydERpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGVsZW1lbnQsIGRvbS5FdmVudFR5cGUuRk9DVVNfT1VULCAoZXZlbnQ6IEV2ZW50KSA9PiB7XG5cdFx0XHRldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMuX2ZvY3VzZWRIb3ZlclBhcnRJbmRleCA9IC0xO1xuXHRcdH0pKTtcblx0XHQvLyBBZGQgY29weSBidXR0b24gZm9yIG1hcmtlciBob3ZlcnNcblx0XHRpZiAocmVuZGVyZWRQYXJ0LnR5cGUgPT09ICdob3ZlclBhcnQnICYmICEocmVuZGVyZWRQYXJ0LmhvdmVyUGFydCBpbnN0YW5jZW9mIENvbG9ySG92ZXIpICYmICFyZW5kZXJlZFBhcnQucGFydGljaXBhbnQuaGlkZUNvcHlCdXR0b24pIHtcblx0XHRcdHBhcnREaXNwb3NhYmxlcy5hZGQobmV3IEhvdmVyQ29weUJ1dHRvbihcblx0XHRcdFx0ZWxlbWVudCxcblx0XHRcdFx0KCkgPT4gcmVuZGVyZWRQYXJ0LnBhcnRpY2lwYW50LmdldEFjY2Vzc2libGVDb250ZW50KHJlbmRlcmVkUGFydC5ob3ZlclBhcnQpLFxuXHRcdFx0XHR0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdFx0XHR0aGlzLl9ob3ZlclNlcnZpY2Vcblx0XHRcdCkpO1xuXHRcdH1cblx0XHR0aGlzLl9wZXJQYXJ0RGlzcG9zYWJsZXMuc2V0KGluZGV4LCBwYXJ0RGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlTWFya2Rvd25BbmRDb2xvclBhcnRpY2lwYW50SW5mbyhwYXJ0aWNpcGFudHM6IElFZGl0b3JIb3ZlclBhcnRpY2lwYW50PElIb3ZlclBhcnQ+W10pIHtcblx0XHRjb25zdCBtYXJrZG93bkhvdmVyUGFydGljaXBhbnQgPSBwYXJ0aWNpcGFudHMuZmluZChwID0+IHtcblx0XHRcdHJldHVybiAocCBpbnN0YW5jZW9mIE1hcmtkb3duSG92ZXJQYXJ0aWNpcGFudCkgJiYgIShwIGluc3RhbmNlb2YgSW5sYXlIaW50c0hvdmVyKTtcblx0XHR9KTtcblx0XHRpZiAobWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50KSB7XG5cdFx0XHR0aGlzLl9tYXJrZG93bkhvdmVyUGFydGljaXBhbnQgPSBtYXJrZG93bkhvdmVyUGFydGljaXBhbnQgYXMgTWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50O1xuXHRcdH1cblx0XHR0aGlzLl9jb2xvckhvdmVyUGFydGljaXBhbnQgPSBwYXJ0aWNpcGFudHMuZmluZChwID0+IHAgaW5zdGFuY2VvZiBIb3ZlckNvbG9yUGlja2VyUGFydGljaXBhbnQpO1xuXHR9XG5cblx0cHVibGljIGZvY3VzSG92ZXJQYXJ0V2l0aEluZGV4KGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMuX3JlbmRlcmVkUGFydHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3JlbmRlcmVkUGFydHNbaW5kZXhdLmhvdmVyRWxlbWVudC5mb2N1cygpO1xuXHR9XG5cblx0cHVibGljIGdldEFjY2Vzc2libGVDb250ZW50KCk6IHN0cmluZyB7XG5cdFx0Y29uc3QgY29udGVudDogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX3JlbmRlcmVkUGFydHMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnRlbnQucHVzaCh0aGlzLmdldEFjY2Vzc2libGVIb3ZlckNvbnRlbnRBdEluZGV4KGkpKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNvbnRlbnQuam9pbignXFxuXFxuJyk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0QWNjZXNzaWJsZUhvdmVyQ29udGVudEF0SW5kZXgoaW5kZXg6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0Y29uc3QgcmVuZGVyZWRQYXJ0ID0gdGhpcy5fcmVuZGVyZWRQYXJ0c1tpbmRleF07XG5cdFx0aWYgKCFyZW5kZXJlZFBhcnQpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdFx0aWYgKHJlbmRlcmVkUGFydC50eXBlID09PSAnc3RhdHVzQmFyJykge1xuXHRcdFx0Y29uc3Qgc3RhdHVzQmFyRGVzY3JpcHRpb24gPSBbbG9jYWxpemUoJ2hvdmVyQWNjZXNzaWJpbGl0eVN0YXR1c0JhcicsIFwiVGhpcyBpcyBhIGhvdmVyIHN0YXR1cyBiYXIuXCIpXTtcblx0XHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIHJlbmRlcmVkUGFydC5hY3Rpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSBhY3Rpb24uYWN0aW9uS2V5YmluZGluZ0xhYmVsO1xuXHRcdFx0XHRpZiAoa2V5YmluZGluZykge1xuXHRcdFx0XHRcdHN0YXR1c0JhckRlc2NyaXB0aW9uLnB1c2gobG9jYWxpemUoJ2hvdmVyQWNjZXNzaWJpbGl0eVN0YXR1c0JhckFjdGlvbldpdGhLZXliaW5kaW5nJywgXCJJdCBoYXMgYW4gYWN0aW9uIHdpdGggbGFiZWwgezB9IGFuZCBrZXliaW5kaW5nIHsxfS5cIiwgYWN0aW9uLmFjdGlvbkxhYmVsLCBrZXliaW5kaW5nKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c3RhdHVzQmFyRGVzY3JpcHRpb24ucHVzaChsb2NhbGl6ZSgnaG92ZXJBY2Nlc3NpYmlsaXR5U3RhdHVzQmFyQWN0aW9uV2l0aG91dEtleWJpbmRpbmcnLCBcIkl0IGhhcyBhbiBhY3Rpb24gd2l0aCBsYWJlbCB7MH0uXCIsIGFjdGlvbi5hY3Rpb25MYWJlbCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gc3RhdHVzQmFyRGVzY3JpcHRpb24uam9pbignXFxuJyk7XG5cdFx0fVxuXHRcdHJldHVybiByZW5kZXJlZFBhcnQucGFydGljaXBhbnQuZ2V0QWNjZXNzaWJsZUNvbnRlbnQocmVuZGVyZWRQYXJ0LmhvdmVyUGFydCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgdXBkYXRlSG92ZXJWZXJib3NpdHlMZXZlbChhY3Rpb246IEhvdmVyVmVyYm9zaXR5QWN0aW9uLCBpbmRleDogbnVtYmVyLCBmb2N1cz86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuX21hcmtkb3duSG92ZXJQYXJ0aWNpcGFudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgcmFuZ2VPZkluZGljZXNUb1VwZGF0ZTogSU9mZnNldFJhbmdlO1xuXHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHRyYW5nZU9mSW5kaWNlc1RvVXBkYXRlID0geyBzdGFydDogaW5kZXgsIGVuZEV4Y2x1c2l2ZTogaW5kZXggKyAxIH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJhbmdlT2ZJbmRpY2VzVG9VcGRhdGUgPSB0aGlzLl9maW5kUmFuZ2VPZk1hcmtkb3duSG92ZXJQYXJ0cyh0aGlzLl9tYXJrZG93bkhvdmVyUGFydGljaXBhbnQpO1xuXHRcdH1cblx0XHRmb3IgKGxldCBpID0gcmFuZ2VPZkluZGljZXNUb1VwZGF0ZS5zdGFydDsgaSA8IHJhbmdlT2ZJbmRpY2VzVG9VcGRhdGUuZW5kRXhjbHVzaXZlOyBpKyspIHtcblx0XHRcdGNvbnN0IG5vcm1hbGl6ZWRNYXJrZG93bkhvdmVySW5kZXggPSB0aGlzLl9ub3JtYWxpemVkSW5kZXhUb01hcmtkb3duSG92ZXJJbmRleFJhbmdlKHRoaXMuX21hcmtkb3duSG92ZXJQYXJ0aWNpcGFudCwgaSk7XG5cdFx0XHRpZiAobm9ybWFsaXplZE1hcmtkb3duSG92ZXJJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVuZGVyZWRQYXJ0ID0gYXdhaXQgdGhpcy5fbWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50LnVwZGF0ZU1hcmtkb3duSG92ZXJWZXJib3NpdHlMZXZlbChhY3Rpb24sIG5vcm1hbGl6ZWRNYXJrZG93bkhvdmVySW5kZXgpO1xuXHRcdFx0aWYgKCFyZW5kZXJlZFBhcnQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHQvLyBEaXNwb3NlIGFueSBsaXN0ZW5lcnMvY29weSBidXR0b24gZm9yIHRoZSBwcmV2aW91cyBwYXJ0IGF0IHRoaXMgaW5kZXhcblx0XHRcdGNvbnN0IHByZXZEaXNwb3NhYmxlID0gdGhpcy5fcGVyUGFydERpc3Bvc2FibGVzLmdldChpKTtcblx0XHRcdGlmIChwcmV2RGlzcG9zYWJsZSkge1xuXHRcdFx0XHRwcmV2RGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX3BlclBhcnREaXNwb3NhYmxlcy5kZWxldGUoaSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9yZW5kZXJlZFBhcnRzW2ldID0ge1xuXHRcdFx0XHR0eXBlOiAnaG92ZXJQYXJ0Jyxcblx0XHRcdFx0cGFydGljaXBhbnQ6IHRoaXMuX21hcmtkb3duSG92ZXJQYXJ0aWNpcGFudCxcblx0XHRcdFx0aG92ZXJQYXJ0OiByZW5kZXJlZFBhcnQuaG92ZXJQYXJ0LFxuXHRcdFx0XHRob3ZlckVsZW1lbnQ6IHJlbmRlcmVkUGFydC5ob3ZlckVsZW1lbnQsXG5cdFx0XHR9O1xuXHRcdFx0Ly8gUmVjcmVhdGUgbGlzdGVuZXJzIGFuZCBjb3B5IGJ1dHRvbiBmb3IgdGhlIHVwZGF0ZWQgcGFydC5cblx0XHRcdHRoaXMuX2NyZWF0ZUxpc3RlbmVyc0ZvclBhcnQoaSwgdGhpcy5fcmVuZGVyZWRQYXJ0c1tpXSk7XG5cdFx0fVxuXHRcdGlmIChmb2N1cykge1xuXHRcdFx0aWYgKGluZGV4ID49IDApIHtcblx0XHRcdFx0dGhpcy5mb2N1c0hvdmVyUGFydFdpdGhJbmRleChpbmRleCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9jb250ZXh0LmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2NvbnRleHQub25Db250ZW50c0NoYW5nZWQoKTtcblx0fVxuXG5cdHB1YmxpYyBkb2VzSG92ZXJBdEluZGV4U3VwcG9ydFZlcmJvc2l0eUFjdGlvbihpbmRleDogbnVtYmVyLCBhY3Rpb246IEhvdmVyVmVyYm9zaXR5QWN0aW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9tYXJrZG93bkhvdmVyUGFydGljaXBhbnQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3Qgbm9ybWFsaXplZE1hcmtkb3duSG92ZXJJbmRleCA9IHRoaXMuX25vcm1hbGl6ZWRJbmRleFRvTWFya2Rvd25Ib3ZlckluZGV4UmFuZ2UodGhpcy5fbWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50LCBpbmRleCk7XG5cdFx0aWYgKG5vcm1hbGl6ZWRNYXJrZG93bkhvdmVySW5kZXggPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50LmRvZXNNYXJrZG93bkhvdmVyQXRJbmRleFN1cHBvcnRWZXJib3NpdHlBY3Rpb24obm9ybWFsaXplZE1hcmtkb3duSG92ZXJJbmRleCwgYWN0aW9uKTtcblx0fVxuXG5cdHB1YmxpYyBpc0NvbG9yUGlja2VyVmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY29sb3JIb3ZlclBhcnRpY2lwYW50Py5pc0NvbG9yUGlja2VyVmlzaWJsZSgpID8/IGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBfbm9ybWFsaXplZEluZGV4VG9NYXJrZG93bkhvdmVySW5kZXhSYW5nZShtYXJrZG93bkhvdmVyUGFydGljaXBhbnQ6IE1hcmtkb3duSG92ZXJQYXJ0aWNpcGFudCwgaW5kZXg6IG51bWJlcik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVuZGVyZWRQYXJ0ID0gdGhpcy5fcmVuZGVyZWRQYXJ0c1tpbmRleF07XG5cdFx0aWYgKCFyZW5kZXJlZFBhcnQgfHwgcmVuZGVyZWRQYXJ0LnR5cGUgIT09ICdob3ZlclBhcnQnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBpc0hvdmVyUGFydE1hcmtkb3duSG92ZXIgPSByZW5kZXJlZFBhcnQucGFydGljaXBhbnQgPT09IG1hcmtkb3duSG92ZXJQYXJ0aWNpcGFudDtcblx0XHRpZiAoIWlzSG92ZXJQYXJ0TWFya2Rvd25Ib3Zlcikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZmlyc3RJbmRleE9mTWFya2Rvd25Ib3ZlcnMgPSB0aGlzLl9yZW5kZXJlZFBhcnRzLmZpbmRJbmRleChyZW5kZXJlZFBhcnQgPT5cblx0XHRcdHJlbmRlcmVkUGFydC50eXBlID09PSAnaG92ZXJQYXJ0J1xuXHRcdFx0JiYgcmVuZGVyZWRQYXJ0LnBhcnRpY2lwYW50ID09PSBtYXJrZG93bkhvdmVyUGFydGljaXBhbnRcblx0XHQpO1xuXHRcdGlmIChmaXJzdEluZGV4T2ZNYXJrZG93bkhvdmVycyA9PT0gLTEpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoKTtcblx0XHR9XG5cdFx0cmV0dXJuIGluZGV4IC0gZmlyc3RJbmRleE9mTWFya2Rvd25Ib3ZlcnM7XG5cdH1cblxuXHRwcml2YXRlIF9maW5kUmFuZ2VPZk1hcmtkb3duSG92ZXJQYXJ0cyhtYXJrZG93bkhvdmVyUGFydGljaXBhbnQ6IE1hcmtkb3duSG92ZXJQYXJ0aWNpcGFudCk6IElPZmZzZXRSYW5nZSB7XG5cdFx0Y29uc3QgY29waWVkUmVuZGVyZWRQYXJ0cyA9IHRoaXMuX3JlbmRlcmVkUGFydHMuc2xpY2UoKTtcblx0XHRjb25zdCBmaXJzdEluZGV4T2ZNYXJrZG93bkhvdmVycyA9IGNvcGllZFJlbmRlcmVkUGFydHMuZmluZEluZGV4KHJlbmRlcmVkUGFydCA9PiByZW5kZXJlZFBhcnQudHlwZSA9PT0gJ2hvdmVyUGFydCcgJiYgcmVuZGVyZWRQYXJ0LnBhcnRpY2lwYW50ID09PSBtYXJrZG93bkhvdmVyUGFydGljaXBhbnQpO1xuXHRcdGNvbnN0IGludmVyc2VkTGFzdEluZGV4T2ZNYXJrZG93bkhvdmVycyA9IGNvcGllZFJlbmRlcmVkUGFydHMucmV2ZXJzZSgpLmZpbmRJbmRleChyZW5kZXJlZFBhcnQgPT4gcmVuZGVyZWRQYXJ0LnR5cGUgPT09ICdob3ZlclBhcnQnICYmIHJlbmRlcmVkUGFydC5wYXJ0aWNpcGFudCA9PT0gbWFya2Rvd25Ib3ZlclBhcnRpY2lwYW50KTtcblx0XHRjb25zdCBsYXN0SW5kZXhPZk1hcmtkb3duSG92ZXJzID0gaW52ZXJzZWRMYXN0SW5kZXhPZk1hcmtkb3duSG92ZXJzID49IDAgPyBjb3BpZWRSZW5kZXJlZFBhcnRzLmxlbmd0aCAtIGludmVyc2VkTGFzdEluZGV4T2ZNYXJrZG93bkhvdmVycyA6IGludmVyc2VkTGFzdEluZGV4T2ZNYXJrZG93bkhvdmVycztcblx0XHRyZXR1cm4geyBzdGFydDogZmlyc3RJbmRleE9mTWFya2Rvd25Ib3ZlcnMsIGVuZEV4Y2x1c2l2ZTogbGFzdEluZGV4T2ZNYXJrZG93bkhvdmVycyArIDEgfTtcblx0fVxuXG5cdHB1YmxpYyBnZXQgZG9tTm9kZSgpOiBEb2N1bWVudEZyYWdtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fZnJhZ21lbnQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGRvbU5vZGVIYXNDaGlsZHJlbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fZnJhZ21lbnQuaGFzQ2hpbGROb2RlcygpO1xuXHR9XG5cblx0cHVibGljIGdldCBmb2N1c2VkSG92ZXJQYXJ0SW5kZXgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fZm9jdXNlZEhvdmVyUGFydEluZGV4O1xuXHR9XG5cblx0cHVibGljIGdldCBob3ZlclBhcnRzQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVuZGVyZWRQYXJ0cy5sZW5ndGg7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBbUgsMEJBQTBCO0FBQzdJLFNBQVMsWUFBWSxpQkFBOEIsb0JBQW9CO0FBQ3ZFLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsOEJBQThCO0FBRXZDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUV0QixZQUFZLFNBQVM7QUFFckIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxZQUFZLG1DQUFtQztBQUN4RCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUVuQyxTQUFTLHFCQUFxQjtBQUU5QixTQUFTLHlCQUF5QjtBQUUzQixJQUFNLHVCQUFOLGNBQW1DLFdBQVc7QUFBQSxFQWNwRCxZQUNDLFFBQ0EsYUFDQSxjQUNBLFNBQ29CLG1CQUNMLGNBQ0ksa0JBQ2xCO0FBQ0QsVUFBTTtBQUNOLFVBQU0sUUFBUSxZQUFZO0FBQzFCLFNBQUssc0JBQXNCLEtBQUssVUFBVSxJQUFJO0FBQUEsTUFDN0M7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLDhCQUE4QixZQUFZO0FBQ2hELFVBQU0sU0FBUyw0QkFBNEI7QUFDM0MsVUFBTSxFQUFFLGdCQUFnQix3QkFBd0IsSUFBSSxxQkFBcUIsc0JBQXNCLFFBQVEsT0FBTyxPQUFPLEtBQUs7QUFDMUgsU0FBSyw0QkFBNEIsTUFBTSxLQUFLLE9BQUssRUFBRSxlQUFlO0FBQ2xFLFNBQUssaUJBQWlCO0FBQ3RCLFNBQUssMEJBQTBCO0FBQy9CLFNBQUssbUJBQW1CLE9BQU87QUFDL0IsU0FBSyxtQkFBbUIsT0FBTztBQUMvQixTQUFLLGNBQWMsNEJBQTRCO0FBQy9DLFNBQUssU0FBUyw0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
