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
import { $, getWindow, n } from "../../../../../../../base/browser/dom.js";
import { Color } from "../../../../../../../base/common/color.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { autorun, constObservable, derived, derivedObservableWithCache, observableFromEvent } from "../../../../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { asCssVariable } from "../../../../../../../platform/theme/common/colorUtils.js";
import { IThemeService } from "../../../../../../../platform/theme/common/themeService.js";
import { IUserInteractionService } from "../../../../../../../platform/userInteraction/browser/userInteractionService.js";
import { observableCodeEditor } from "../../../../../../browser/observableCodeEditor.js";
import { Rect } from "../../../../../../common/core/2d/rect.js";
import { EmbeddedCodeEditorWidget } from "../../../../../../browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { OffsetRange } from "../../../../../../common/core/ranges/offsetRange.js";
import { Position } from "../../../../../../common/core/position.js";
import { Range } from "../../../../../../common/core/range.js";
import { StickyScrollController } from "../../../../../stickyScroll/browser/stickyScrollController.js";
import { InlineCompletionContextKeys } from "../../../controller/inlineCompletionContextKeys.js";
import { InlineEditClickEvent } from "../inlineEditsViewInterface.js";
import { getEditorBackgroundColor, getEditorBlendedColor, getModifiedBorderColor, getOriginalBorderColor, INLINE_EDITS_BORDER_RADIUS, modifiedBackgroundColor, originalBackgroundColor } from "../theme.js";
import { PathBuilder, getContentRenderWidth, getOffsetForPos, mapOutFalsy, maxContentWidthInRange, observeEditorBoundingClientRect } from "../utils/utils.js";
import { InlineCompletionEditorType } from "../../../model/provideInlineCompletions.js";
const HORIZONTAL_PADDING = 0;
const VERTICAL_PADDING = 0;
const ENABLE_OVERFLOW = false;
const BORDER_WIDTH = 1;
const WIDGET_SEPARATOR_WIDTH = 1;
const WIDGET_SEPARATOR_DIFF_EDITOR_WIDTH = 3;
const BORDER_RADIUS = INLINE_EDITS_BORDER_RADIUS;
const ORIGINAL_END_PADDING = 20;
const MODIFIED_END_PADDING = 12;
let InlineEditsSideBySideView = class extends Disposable {
  constructor(_editor, _edit, _previewTextModel, _uiState, _tabAction, _instantiationService, _themeService, _userInteractionService) {
    super();
    this._editor = _editor;
    this._edit = _edit;
    this._previewTextModel = _previewTextModel;
    this._uiState = _uiState;
    this._tabAction = _tabAction;
    this._instantiationService = _instantiationService;
    this._themeService = _themeService;
    this._userInteractionService = _userInteractionService;
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this._editorObs = observableCodeEditor(this._editor);
    this._display = derived(this, (reader) => !!this._uiState.read(reader) ? "block" : "none");
    this.previewRef = n.ref();
    const separatorWidthObs = this._uiState.map((s) => s?.editorType === InlineCompletionEditorType.DiffEditor ? WIDGET_SEPARATOR_DIFF_EDITOR_WIDTH : WIDGET_SEPARATOR_WIDTH);
    this._editorContainer = n.div({
      class: ["editorContainer"],
      style: { position: "absolute", overflow: "hidden", cursor: "pointer" },
      onmousedown: (e) => {
        e.preventDefault();
      },
      onclick: (e) => {
        this._onDidClick.fire(InlineEditClickEvent.create(e));
      }
    }, [
      n.div({ class: "preview", style: { pointerEvents: "none" }, ref: this.previewRef })
    ]).keepUpdated(this._store);
    this.isHovered = this._userInteractionService.createHoverTracker(this._editorContainer.element, this._store);
    this.previewEditor = this._register(this._instantiationService.createInstance(
      EmbeddedCodeEditorWidget,
      this.previewRef.element,
      {
        glyphMargin: false,
        lineNumbers: "off",
        minimap: { enabled: false },
        guides: {
          indentation: false,
          bracketPairs: false,
          bracketPairsHorizontal: false,
          highlightActiveIndentation: false
        },
        editContext: false,
        // is a bit faster
        rulers: [],
        padding: { top: 0, bottom: 0 },
        folding: false,
        selectOnLineNumbers: false,
        selectionHighlight: false,
        columnSelection: false,
        overviewRulerBorder: false,
        overviewRulerLanes: 0,
        lineDecorationsWidth: 0,
        lineNumbersMinChars: 0,
        revealHorizontalRightPadding: 0,
        bracketPairColorization: { enabled: true, independentColorPoolPerBracketType: false },
        scrollBeyondLastLine: false,
        scrollbar: {
          vertical: "hidden",
          horizontal: "hidden",
          handleMouseWheel: false
        },
        readOnly: true,
        wordWrap: "off",
        wordWrapOverride1: "off",
        wordWrapOverride2: "off"
      },
      {
        contextKeyValues: {
          [InlineCompletionContextKeys.inInlineEditsPreviewEditor.key]: true
        },
        contributions: []
      },
      this._editor
    ));
    this._previewEditorObs = observableCodeEditor(this.previewEditor);
    this._activeViewZones = [];
    this._updatePreviewEditor = derived(this, (reader) => {
      this._editorContainer.readEffect(reader);
      this._previewEditorObs.model.read(reader);
      this._display.read(reader);
      if (this._nonOverflowView) {
        this._nonOverflowView.element.style.display = this._display.read(reader);
      }
      const uiState = this._uiState.read(reader);
      const edit = this._edit.read(reader);
      if (!uiState || !edit) {
        return;
      }
      const range = edit.originalLineRange;
      const hiddenAreas = [];
      if (range.startLineNumber > 1) {
        hiddenAreas.push(new Range(1, 1, range.startLineNumber - 1, 1));
      }
      if (range.startLineNumber + uiState.newTextLineCount < this._previewTextModel.getLineCount() + 1) {
        hiddenAreas.push(new Range(range.startLineNumber + uiState.newTextLineCount, 1, this._previewTextModel.getLineCount() + 1, 1));
      }
      this.previewEditor.setHiddenAreas(hiddenAreas, void 0, true);
      const previousViewZones = [...this._activeViewZones];
      this._activeViewZones = [];
      const reducedLinesCount = range.endLineNumberExclusive - range.startLineNumber - uiState.newTextLineCount;
      this.previewEditor.changeViewZones((changeAccessor) => {
        previousViewZones.forEach((id) => changeAccessor.removeZone(id));
        if (reducedLinesCount > 0) {
          this._activeViewZones.push(changeAccessor.addZone({
            afterLineNumber: range.startLineNumber + uiState.newTextLineCount - 1,
            heightInLines: reducedLinesCount,
            showInHiddenAreas: true,
            domNode: $("div.diagonal-fill.inline-edits-view-zone")
          }));
        }
      });
    });
    this._previewEditorWidth = derived(this, (reader) => {
      const edit = this._edit.read(reader);
      if (!edit) {
        return 0;
      }
      this._updatePreviewEditor.read(reader);
      return maxContentWidthInRange(this._previewEditorObs, edit.modifiedLineRange, reader);
    });
    this._cursorPosIfTouchesEdit = derived(this, (reader) => {
      const cursorPos = this._editorObs.cursorPosition.read(reader);
      const edit = this._edit.read(reader);
      if (!edit || !cursorPos) {
        return void 0;
      }
      return edit.modifiedLineRange.contains(cursorPos.lineNumber) ? cursorPos : void 0;
    });
    this._originalStartPosition = derived(this, (reader) => {
      const inlineEdit = this._edit.read(reader);
      return inlineEdit ? new Position(inlineEdit.originalLineRange.startLineNumber, 1) : null;
    });
    this._originalEndPosition = derived(this, (reader) => {
      const inlineEdit = this._edit.read(reader);
      return inlineEdit ? new Position(inlineEdit.originalLineRange.endLineNumberExclusive, 1) : null;
    });
    this._originalVerticalStartPosition = this._editorObs.observePosition(this._originalStartPosition, this._store).map((p) => p?.y);
    this._originalVerticalEndPosition = this._editorObs.observePosition(this._originalEndPosition, this._store).map((p) => p?.y);
    this._originalDisplayRange = this._edit.map((e) => e?.displayRange);
    this._editorMaxContentWidthInRange = derived(this, (reader) => {
      const originalDisplayRange = this._originalDisplayRange.read(reader);
      if (!originalDisplayRange) {
        return constObservable(0);
      }
      this._editorObs.versionId.read(reader);
      return derivedObservableWithCache(this, (reader2, lastValue) => {
        const maxWidth = maxContentWidthInRange(this._editorObs, originalDisplayRange, reader2);
        return Math.max(maxWidth, lastValue ?? 0);
      });
    }).map((v, r) => v.read(r));
    const editorDomContentRect = observeEditorBoundingClientRect(this._editor, this._store);
    this._previewEditorLayoutInfo = derived(this, (reader) => {
      const inlineEdit = this._edit.read(reader);
      if (!inlineEdit) {
        return null;
      }
      const state = this._uiState.read(reader);
      if (!state) {
        return null;
      }
      const range = inlineEdit.originalLineRange;
      const horizontalScrollOffset = this._editorObs.scrollLeft.read(reader);
      const editorContentMaxWidthInRange = this._editorMaxContentWidthInRange.read(reader);
      const editorLayout = this._editorObs.layoutInfo.read(reader);
      const previewContentWidth = this._previewEditorWidth.read(reader);
      const editorContentAreaWidth = editorLayout.contentWidth - editorLayout.verticalScrollbarWidth;
      const editorBoundingClientRect = editorDomContentRect.read(reader);
      const clientContentAreaRight = editorLayout.contentLeft + editorLayout.contentWidth + editorBoundingClientRect.left;
      const remainingWidthRightOfContent = getWindow(this._editor.getContainerDomNode()).innerWidth - clientContentAreaRight;
      const remainingWidthRightOfEditor = getWindow(this._editor.getContainerDomNode()).innerWidth - editorBoundingClientRect.right;
      const desiredMinimumWidth = Math.min(editorLayout.contentWidth * 0.3, previewContentWidth, 100);
      const IN_EDITOR_DISPLACEMENT = 0;
      const maximumAvailableWidth = IN_EDITOR_DISPLACEMENT + remainingWidthRightOfContent;
      const cursorPos = this._cursorPosIfTouchesEdit.read(reader);
      const maxPreviewEditorLeft = Math.max(
        // We're starting from the content area right and moving it left by IN_EDITOR_DISPLACEMENT and also by an amount to ensure some minimum desired width
        editorContentAreaWidth + horizontalScrollOffset - IN_EDITOR_DISPLACEMENT - Math.max(0, desiredMinimumWidth - maximumAvailableWidth),
        // But we don't want that the moving left ends up covering the cursor, so this will push it to the right again
        Math.min(
          cursorPos ? getOffsetForPos(this._editorObs, cursorPos, reader) + 50 : 0,
          editorContentAreaWidth + horizontalScrollOffset
        )
      );
      const previewEditorLeftInTextArea = Math.min(editorContentMaxWidthInRange + ORIGINAL_END_PADDING, maxPreviewEditorLeft);
      const maxContentWidth = editorContentMaxWidthInRange + ORIGINAL_END_PADDING + previewContentWidth + 70;
      const dist = maxPreviewEditorLeft - previewEditorLeftInTextArea;
      let desiredPreviewEditorScrollLeft;
      let codeRight;
      if (previewEditorLeftInTextArea > horizontalScrollOffset) {
        desiredPreviewEditorScrollLeft = 0;
        codeRight = editorLayout.contentLeft + previewEditorLeftInTextArea - horizontalScrollOffset;
      } else {
        desiredPreviewEditorScrollLeft = horizontalScrollOffset - previewEditorLeftInTextArea;
        codeRight = editorLayout.contentLeft;
      }
      const selectionTop = this._originalVerticalStartPosition.read(reader) ?? this._editor.getTopForLineNumber(range.startLineNumber) - this._editorObs.scrollTop.read(reader);
      const selectionBottom = this._originalVerticalEndPosition.read(reader) ?? this._editor.getBottomForLineNumber(range.endLineNumberExclusive - 1) - this._editorObs.scrollTop.read(reader);
      const codeLeft = editorLayout.contentLeft - horizontalScrollOffset;
      let codeRect = Rect.fromLeftTopRightBottom(codeLeft, selectionTop, codeRight, selectionBottom);
      const isInsertion = codeRect.height === 0;
      if (!isInsertion) {
        codeRect = codeRect.withMargin(VERTICAL_PADDING, HORIZONTAL_PADDING);
      }
      const previewLineHeights = this._previewEditorObs.observeLineHeightsForLineRange(inlineEdit.modifiedLineRange).read(reader);
      const editHeight = previewLineHeights.reduce((acc, h) => acc + h, 0);
      const codeHeight = selectionBottom - selectionTop;
      const previewEditorHeight = Math.max(codeHeight, editHeight);
      const clipped = dist === 0;
      const codeEditDist = 0;
      const previewEditorWidth = Math.min(previewContentWidth + MODIFIED_END_PADDING, remainingWidthRightOfEditor + editorLayout.width - editorLayout.contentLeft - codeEditDist);
      let editRect = Rect.fromLeftTopWidthHeight(codeRect.right + codeEditDist, selectionTop, previewEditorWidth, previewEditorHeight);
      if (!isInsertion) {
        editRect = editRect.withMargin(VERTICAL_PADDING, HORIZONTAL_PADDING).translateX(HORIZONTAL_PADDING + BORDER_WIDTH);
      } else {
        editRect = editRect.withMargin(VERTICAL_PADDING, HORIZONTAL_PADDING).translateY(VERTICAL_PADDING);
      }
      return {
        codeRect,
        editRect,
        codeScrollLeft: horizontalScrollOffset,
        contentLeft: editorLayout.contentLeft,
        isInsertion,
        maxContentWidth,
        shouldShowShadow: clipped,
        desiredPreviewEditorScrollLeft,
        previewEditorWidth
      };
    });
    this._stickyScrollController = StickyScrollController.get(this._editorObs.editor);
    this._stickyScrollHeight = this._stickyScrollController ? observableFromEvent(this._stickyScrollController.onDidChangeStickyScrollHeight, () => this._stickyScrollController.stickyScrollWidgetHeight) : constObservable(0);
    this._shouldOverflow = derived(this, (reader) => {
      if (!ENABLE_OVERFLOW) {
        return false;
      }
      const range = this._edit.read(reader)?.originalLineRange;
      if (!range) {
        return false;
      }
      const stickyScrollHeight = this._stickyScrollHeight.read(reader);
      const top = this._editor.getTopForLineNumber(range.startLineNumber) - this._editorObs.scrollTop.read(reader);
      if (top <= stickyScrollHeight) {
        return false;
      }
      const bottom = this._editor.getTopForLineNumber(range.endLineNumberExclusive) - this._editorObs.scrollTop.read(reader);
      if (bottom >= this._editorObs.layoutInfo.read(reader).height) {
        return false;
      }
      return true;
    });
    this._originalBackgroundColor = observableFromEvent(this, this._themeService.onDidColorThemeChange, () => {
      return this._themeService.getColorTheme().getColor(originalBackgroundColor) ?? Color.transparent;
    });
    this._editorBackgroundColor = this._uiState.map((s) => {
      return getEditorBackgroundColor(s?.editorType ?? InlineCompletionEditorType.TextEditor);
    });
    this._backgroundSvg = n.svg({
      transform: "translate(-0.5 -0.5)",
      style: { overflow: "visible", pointerEvents: "none", position: "absolute" }
    }, [
      n.svgElem("path", {
        class: "rightOfModifiedBackgroundCoverUp",
        d: derived(this, (reader) => {
          const layoutInfo = this._previewEditorLayoutInfo.read(reader);
          if (!layoutInfo) {
            return void 0;
          }
          const originalBackgroundColor2 = this._originalBackgroundColor.read(reader);
          if (originalBackgroundColor2.isTransparent()) {
            return void 0;
          }
          return new PathBuilder().moveTo(layoutInfo.codeRect.getRightTop()).lineTo(layoutInfo.codeRect.getRightTop().deltaX(1e3)).lineTo(layoutInfo.codeRect.getRightBottom().deltaX(1e3)).lineTo(layoutInfo.codeRect.getRightBottom()).build();
        }),
        style: {
          fill: this._editorBackgroundColor
        }
      })
    ]).keepUpdated(this._store);
    this._originalOverlay = n.div({
      style: { pointerEvents: "none", display: this._previewEditorLayoutInfo.map((layoutInfo) => layoutInfo?.isInsertion ? "none" : "block") }
    }, derived(this, (reader) => {
      const layoutInfoObs = mapOutFalsy(this._previewEditorLayoutInfo).read(reader);
      if (!layoutInfoObs) {
        return void 0;
      }
      const editorBackground = this._editorBackgroundColor.read(reader);
      const separatorWidth = separatorWidthObs.read(reader);
      const borderStyling = getOriginalBorderColor(this._tabAction).map((bc) => `${BORDER_WIDTH}px solid ${asCssVariable(bc)}`);
      const borderStylingSeparator = `${BORDER_WIDTH + separatorWidth}px solid ${editorBackground}`;
      const hasBorderLeft = layoutInfoObs.read(reader).codeScrollLeft !== 0;
      const isModifiedLower = layoutInfoObs.map((layoutInfo) => layoutInfo.codeRect.bottom < layoutInfo.editRect.bottom);
      const transitionRectSize = BORDER_RADIUS * 2 + BORDER_WIDTH * 2;
      const overlayHider = layoutInfoObs.map((layoutInfo) => Rect.fromLeftTopRightBottom(
        layoutInfo.contentLeft - BORDER_RADIUS - BORDER_WIDTH,
        layoutInfo.codeRect.top,
        layoutInfo.contentLeft,
        layoutInfo.codeRect.bottom + transitionRectSize
      )).read(reader);
      const intersectionLine = new OffsetRange(overlayHider.left, Number.MAX_SAFE_INTEGER);
      const overlayRect = layoutInfoObs.map((layoutInfo) => layoutInfo.codeRect.intersectHorizontal(intersectionLine));
      const separatorRect = overlayRect.map((overlayRect2) => overlayRect2.withMargin(separatorWidth, 0, separatorWidth, separatorWidth).intersectHorizontal(intersectionLine));
      const transitionRect = overlayRect.map((overlayRect2) => Rect.fromLeftTopWidthHeight(overlayRect2.right - transitionRectSize + BORDER_WIDTH, overlayRect2.bottom - BORDER_WIDTH, transitionRectSize, transitionRectSize).intersectHorizontal(intersectionLine));
      return [
        n.div({
          class: "originalSeparatorSideBySide",
          style: {
            ...separatorRect.read(reader).toStyles(),
            boxSizing: "border-box",
            borderRadius: `${BORDER_RADIUS}px 0 0 ${BORDER_RADIUS}px`,
            borderTop: borderStylingSeparator,
            borderBottom: borderStylingSeparator,
            borderLeft: hasBorderLeft ? "none" : borderStylingSeparator
          }
        }),
        n.div({
          class: "originalOverlaySideBySide",
          style: {
            ...overlayRect.read(reader).toStyles(),
            boxSizing: "border-box",
            borderRadius: `${BORDER_RADIUS}px 0 0 ${BORDER_RADIUS}px`,
            borderTop: borderStyling,
            borderBottom: borderStyling,
            borderLeft: hasBorderLeft ? "none" : borderStyling,
            backgroundColor: asCssVariable(originalBackgroundColor)
          }
        }),
        n.div({
          class: "originalCornerCutoutSideBySide",
          style: {
            pointerEvents: "none",
            display: isModifiedLower.map((isLower) => isLower ? "block" : "none"),
            ...transitionRect.read(reader).toStyles()
          }
        }, [
          n.div({
            class: "originalCornerCutoutBackground",
            style: {
              position: "absolute",
              top: "0px",
              left: "0px",
              width: "100%",
              height: "100%",
              backgroundColor: getEditorBlendedColor(originalBackgroundColor, this._themeService).map((c) => c.toString())
            }
          }),
          n.div({
            class: "originalCornerCutoutBorder",
            style: {
              position: "absolute",
              top: "0px",
              left: "0px",
              width: "100%",
              height: "100%",
              boxSizing: "border-box",
              borderTop: borderStyling,
              borderRight: borderStyling,
              borderRadius: `0 100% 0 0`,
              backgroundColor: editorBackground
            }
          })
        ]),
        n.div({
          class: "originalOverlaySideBySideHider",
          style: {
            ...overlayHider.toStyles(),
            backgroundColor: editorBackground
          }
        })
      ];
    })).keepUpdated(this._store);
    this._modifiedOverlay = n.div({
      style: { pointerEvents: "none" }
    }, derived(this, (reader) => {
      const layoutInfoObs = mapOutFalsy(this._previewEditorLayoutInfo).read(reader);
      if (!layoutInfoObs) {
        return void 0;
      }
      const isModifiedLower = layoutInfoObs.map((layoutInfo) => layoutInfo.codeRect.bottom < layoutInfo.editRect.bottom);
      const editorBackground = this._editorBackgroundColor.read(reader);
      const separatorWidth = separatorWidthObs.read(reader);
      const borderRadius = isModifiedLower.map((isLower) => `0 ${BORDER_RADIUS}px ${BORDER_RADIUS}px ${isLower ? BORDER_RADIUS : 0}px`);
      const borderStyling = getEditorBlendedColor(getModifiedBorderColor(this._tabAction), this._themeService).map((c) => `1px solid ${c.toString()}`);
      const borderStylingSeparator = `${BORDER_WIDTH + separatorWidth}px solid ${editorBackground}`;
      const overlayRect = layoutInfoObs.map((layoutInfo) => layoutInfo.editRect.withMargin(0, BORDER_WIDTH));
      const separatorRect = overlayRect.map((overlayRect2) => overlayRect2.withMargin(separatorWidth, separatorWidth, separatorWidth, 0));
      const insertionRect = derived(this, (reader2) => {
        const overlay = overlayRect.read(reader2);
        const layoutinfo = layoutInfoObs.read(reader2);
        if (!layoutinfo.isInsertion || layoutinfo.contentLeft >= overlay.left) {
          return Rect.fromLeftTopWidthHeight(overlay.left, overlay.top, 0, 0);
        }
        return new Rect(layoutinfo.contentLeft, overlay.top, overlay.left, overlay.top + BORDER_WIDTH * 2);
      });
      return [
        n.div({
          class: "modifiedInsertionSideBySide",
          style: {
            ...insertionRect.read(reader).toStyles(),
            backgroundColor: getModifiedBorderColor(this._tabAction).map((c) => asCssVariable(c))
          }
        }),
        n.div({
          class: "modifiedSeparatorSideBySide",
          style: {
            ...separatorRect.read(reader).toStyles(),
            borderRadius,
            borderTop: borderStylingSeparator,
            borderBottom: borderStylingSeparator,
            borderRight: borderStylingSeparator,
            boxSizing: "border-box"
          }
        }),
        n.div({
          class: "modifiedOverlaySideBySide",
          style: {
            ...overlayRect.read(reader).toStyles(),
            borderRadius,
            border: borderStyling,
            boxSizing: "border-box",
            backgroundColor: asCssVariable(modifiedBackgroundColor)
          }
        })
      ];
    })).keepUpdated(this._store);
    this._nonOverflowView = n.div({
      class: "inline-edits-view",
      style: {
        position: "absolute",
        overflow: "visible",
        top: "0px",
        left: "0px",
        display: this._display
      }
    }, [
      this._backgroundSvg,
      derived(this, (reader) => this._shouldOverflow.read(reader) ? [] : [this._editorContainer, this._originalOverlay, this._modifiedOverlay])
    ]).keepUpdated(this._store);
    this._register(this._editorObs.createOverlayWidget({
      domNode: this._nonOverflowView.element,
      position: constObservable(null),
      allowEditorOverflow: false,
      minContentWidthInPx: derived(this, (reader) => {
        const x = this._previewEditorLayoutInfo.read(reader)?.maxContentWidth;
        if (x === void 0) {
          return 0;
        }
        return x;
      })
    }));
    this.previewEditor.setModel(this._previewTextModel);
    this._register(autorun((reader) => {
      const layoutInfo = this._previewEditorLayoutInfo.read(reader);
      if (!layoutInfo) {
        return;
      }
      const editorRect = layoutInfo.editRect.withMargin(-VERTICAL_PADDING, -HORIZONTAL_PADDING);
      this.previewEditor.layout({
        height: editorRect.height,
        width: layoutInfo.previewEditorWidth + 15
        /* Make sure editor does not scroll horizontally */
      });
      this._editorContainer.element.style.top = `${editorRect.top}px`;
      this._editorContainer.element.style.left = `${editorRect.left}px`;
      this._editorContainer.element.style.width = `${layoutInfo.previewEditorWidth + HORIZONTAL_PADDING}px`;
    }));
    this._register(autorun((reader) => {
      const layoutInfo = this._previewEditorLayoutInfo.read(reader);
      if (!layoutInfo) {
        return;
      }
      this._previewEditorObs.editor.setScrollLeft(layoutInfo.desiredPreviewEditorScrollLeft);
    }));
    this._updatePreviewEditor.recomputeInitiallyAndOnChange(this._store);
  }
  // This is an approximation and should be improved by using the real parameters used bellow
  static fitsInsideViewport(editor, textModel, edit, reader) {
    const editorObs = observableCodeEditor(editor);
    const editorWidth = editorObs.layoutInfoWidth.read(reader);
    const editorContentLeft = editorObs.layoutInfoContentLeft.read(reader);
    const editorVerticalScrollbar = editor.getLayoutInfo().verticalScrollbarWidth;
    const minimapWidth = editorObs.layoutInfoMinimap.read(reader).minimapLeft !== 0 ? editorObs.layoutInfoMinimap.read(reader).minimapWidth : 0;
    const maxOriginalContent = maxContentWidthInRange(
      editorObs,
      edit.displayRange,
      void 0
      /* do not reconsider on each layout info change */
    );
    const maxModifiedContent = edit.lineEdit.newLines.reduce((max, line) => Math.max(max, getContentRenderWidth(line, editor, textModel)), 0);
    const originalPadding = ORIGINAL_END_PADDING;
    const modifiedPadding = MODIFIED_END_PADDING + 2 * BORDER_WIDTH;
    return maxOriginalContent + maxModifiedContent + originalPadding + modifiedPadding < editorWidth - editorContentLeft - editorVerticalScrollbar - minimapWidth;
  }
};
InlineEditsSideBySideView = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IThemeService),
  __decorateParam(7, IUserInteractionService)
], InlineEditsSideBySideView);
export {
  InlineEditsSideBySideView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c1ZpZXdzL2lubGluZUVkaXRzU2lkZUJ5U2lkZVZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IHsgJCwgZ2V0V2luZG93LCBuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBJUmVhZGVyLCBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIGRlcml2ZWRPYnNlcnZhYmxlV2l0aENhY2hlLCBvYnNlcnZhYmxlRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JVdGlscy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXNlckludGVyYWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJJbnRlcmFjdGlvbi9icm93c2VyL3VzZXJJbnRlcmFjdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL29ic2VydmFibGVDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IFJlY3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS8yZC9yZWN0LmpzJztcbmltcG9ydCB7IEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvZW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFN0aWNreVNjcm9sbENvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zdGlja3lTY3JvbGwvYnJvd3Nlci9zdGlja3lTY3JvbGxDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25Db250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbnRyb2xsZXIvaW5saW5lQ29tcGxldGlvbkNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElJbmxpbmVFZGl0c1ZpZXcsIElubGluZUVkaXRDbGlja0V2ZW50LCBJbmxpbmVFZGl0VGFiQWN0aW9uIH0gZnJvbSAnLi4vaW5saW5lRWRpdHNWaWV3SW50ZXJmYWNlLmpzJztcbmltcG9ydCB7IElubGluZUVkaXRXaXRoQ2hhbmdlcyB9IGZyb20gJy4uL2lubGluZUVkaXRXaXRoQ2hhbmdlcy5qcyc7XG5pbXBvcnQgeyBnZXRFZGl0b3JCYWNrZ3JvdW5kQ29sb3IsIGdldEVkaXRvckJsZW5kZWRDb2xvciwgZ2V0TW9kaWZpZWRCb3JkZXJDb2xvciwgZ2V0T3JpZ2luYWxCb3JkZXJDb2xvciwgSU5MSU5FX0VESVRTX0JPUkRFUl9SQURJVVMsIG1vZGlmaWVkQmFja2dyb3VuZENvbG9yLCBvcmlnaW5hbEJhY2tncm91bmRDb2xvciB9IGZyb20gJy4uL3RoZW1lLmpzJztcbmltcG9ydCB7IFBhdGhCdWlsZGVyLCBnZXRDb250ZW50UmVuZGVyV2lkdGgsIGdldE9mZnNldEZvclBvcywgbWFwT3V0RmFsc3ksIG1heENvbnRlbnRXaWR0aEluUmFuZ2UsIG9ic2VydmVFZGl0b3JCb3VuZGluZ0NsaWVudFJlY3QgfSBmcm9tICcuLi91dGlscy91dGlscy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZSB9IGZyb20gJy4uLy4uLy4uL21vZGVsL3Byb3ZpZGVJbmxpbmVDb21wbGV0aW9ucy5qcyc7XG5cbmNvbnN0IEhPUklaT05UQUxfUEFERElORyA9IDA7XG5jb25zdCBWRVJUSUNBTF9QQURESU5HID0gMDtcbmNvbnN0IEVOQUJMRV9PVkVSRkxPVyA9IGZhbHNlO1xuXG5jb25zdCBCT1JERVJfV0lEVEggPSAxO1xuY29uc3QgV0lER0VUX1NFUEFSQVRPUl9XSURUSCA9IDE7XG5jb25zdCBXSURHRVRfU0VQQVJBVE9SX0RJRkZfRURJVE9SX1dJRFRIID0gMztcbmNvbnN0IEJPUkRFUl9SQURJVVMgPSBJTkxJTkVfRURJVFNfQk9SREVSX1JBRElVUztcbmNvbnN0IE9SSUdJTkFMX0VORF9QQURESU5HID0gMjA7XG5jb25zdCBNT0RJRklFRF9FTkRfUEFERElORyA9IDEyO1xuXG5leHBvcnQgY2xhc3MgSW5saW5lRWRpdHNTaWRlQnlTaWRlVmlldyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJSW5saW5lRWRpdHNWaWV3IHtcblxuXHQvLyBUaGlzIGlzIGFuIGFwcHJveGltYXRpb24gYW5kIHNob3VsZCBiZSBpbXByb3ZlZCBieSB1c2luZyB0aGUgcmVhbCBwYXJhbWV0ZXJzIHVzZWQgYmVsbG93XG5cdHN0YXRpYyBmaXRzSW5zaWRlVmlld3BvcnQoZWRpdG9yOiBJQ29kZUVkaXRvciwgdGV4dE1vZGVsOiBJVGV4dE1vZGVsLCBlZGl0OiBJbmxpbmVFZGl0V2l0aENoYW5nZXMsIHJlYWRlcjogSVJlYWRlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGVkaXRvck9icyA9IG9ic2VydmFibGVDb2RlRWRpdG9yKGVkaXRvcik7XG5cdFx0Y29uc3QgZWRpdG9yV2lkdGggPSBlZGl0b3JPYnMubGF5b3V0SW5mb1dpZHRoLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBlZGl0b3JDb250ZW50TGVmdCA9IGVkaXRvck9icy5sYXlvdXRJbmZvQ29udGVudExlZnQucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGVkaXRvclZlcnRpY2FsU2Nyb2xsYmFyID0gZWRpdG9yLmdldExheW91dEluZm8oKS52ZXJ0aWNhbFNjcm9sbGJhcldpZHRoO1xuXHRcdGNvbnN0IG1pbmltYXBXaWR0aCA9IGVkaXRvck9icy5sYXlvdXRJbmZvTWluaW1hcC5yZWFkKHJlYWRlcikubWluaW1hcExlZnQgIT09IDAgPyBlZGl0b3JPYnMubGF5b3V0SW5mb01pbmltYXAucmVhZChyZWFkZXIpLm1pbmltYXBXaWR0aCA6IDA7XG5cblx0XHRjb25zdCBtYXhPcmlnaW5hbENvbnRlbnQgPSBtYXhDb250ZW50V2lkdGhJblJhbmdlKGVkaXRvck9icywgZWRpdC5kaXNwbGF5UmFuZ2UsIHVuZGVmaW5lZC8qIGRvIG5vdCByZWNvbnNpZGVyIG9uIGVhY2ggbGF5b3V0IGluZm8gY2hhbmdlICovKTtcblx0XHRjb25zdCBtYXhNb2RpZmllZENvbnRlbnQgPSBlZGl0LmxpbmVFZGl0Lm5ld0xpbmVzLnJlZHVjZSgobWF4LCBsaW5lKSA9PiBNYXRoLm1heChtYXgsIGdldENvbnRlbnRSZW5kZXJXaWR0aChsaW5lLCBlZGl0b3IsIHRleHRNb2RlbCkpLCAwKTtcblx0XHRjb25zdCBvcmlnaW5hbFBhZGRpbmcgPSBPUklHSU5BTF9FTkRfUEFERElORzsgLy8gcGFkZGluZyBhZnRlciBsYXN0IGxpbmUgb2Ygb3JpZ2luYWwgZWRpdG9yXG5cdFx0Y29uc3QgbW9kaWZpZWRQYWRkaW5nID0gTU9ESUZJRURfRU5EX1BBRERJTkcgKyAyICogQk9SREVSX1dJRFRIOyAvLyBwYWRkaW5nIGFmdGVyIGxhc3QgbGluZSBvZiBtb2RpZmllZCBlZGl0b3JcblxuXHRcdHJldHVybiBtYXhPcmlnaW5hbENvbnRlbnQgKyBtYXhNb2RpZmllZENvbnRlbnQgKyBvcmlnaW5hbFBhZGRpbmcgKyBtb2RpZmllZFBhZGRpbmcgPCBlZGl0b3JXaWR0aCAtIGVkaXRvckNvbnRlbnRMZWZ0IC0gZWRpdG9yVmVydGljYWxTY3JvbGxiYXIgLSBtaW5pbWFwV2lkdGg7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JPYnM7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbGljayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElubGluZUVkaXRDbGlja0V2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDbGljayA9IHRoaXMuX29uRGlkQ2xpY2suZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0OiBJT2JzZXJ2YWJsZTxJbmxpbmVFZGl0V2l0aENoYW5nZXMgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3ByZXZpZXdUZXh0TW9kZWw6IElUZXh0TW9kZWwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdWlTdGF0ZTogSU9ic2VydmFibGU8e1xuXHRcdFx0bmV3VGV4dExpbmVDb3VudDogbnVtYmVyO1xuXHRcdFx0ZWRpdG9yVHlwZTogSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGU7XG5cdFx0fSB8IHVuZGVmaW5lZD4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGFiQWN0aW9uOiBJT2JzZXJ2YWJsZTxJbmxpbmVFZGl0VGFiQWN0aW9uPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJVXNlckludGVyYWN0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91c2VySW50ZXJhY3Rpb25TZXJ2aWNlOiBJVXNlckludGVyYWN0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9lZGl0b3JPYnMgPSBvYnNlcnZhYmxlQ29kZUVkaXRvcih0aGlzLl9lZGl0b3IpO1xuXHRcdHRoaXMuX2Rpc3BsYXkgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiAhIXRoaXMuX3VpU3RhdGUucmVhZChyZWFkZXIpID8gJ2Jsb2NrJyA6ICdub25lJyk7XG5cdFx0dGhpcy5wcmV2aWV3UmVmID0gbi5yZWY8SFRNTERpdkVsZW1lbnQ+KCk7XG5cdFx0Y29uc3Qgc2VwYXJhdG9yV2lkdGhPYnMgPSB0aGlzLl91aVN0YXRlLm1hcChzID0+IHM/LmVkaXRvclR5cGUgPT09IElubGluZUNvbXBsZXRpb25FZGl0b3JUeXBlLkRpZmZFZGl0b3IgPyBXSURHRVRfU0VQQVJBVE9SX0RJRkZfRURJVE9SX1dJRFRIIDogV0lER0VUX1NFUEFSQVRPUl9XSURUSCk7XG5cdFx0dGhpcy5fZWRpdG9yQ29udGFpbmVyID0gbi5kaXYoe1xuXHRcdFx0Y2xhc3M6IFsnZWRpdG9yQ29udGFpbmVyJ10sXG5cdFx0XHRzdHlsZTogeyBwb3NpdGlvbjogJ2Fic29sdXRlJywgb3ZlcmZsb3c6ICdoaWRkZW4nLCBjdXJzb3I6ICdwb2ludGVyJyB9LFxuXHRcdFx0b25tb3VzZWRvd246IGUgPT4ge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7IC8vIFRoaXMgcHJldmVudHMgdGhhdCB0aGUgZWRpdG9yIGxvc2VzIGZvY3VzXG5cdFx0XHR9LFxuXHRcdFx0b25jbGljazogKGUpID0+IHtcblx0XHRcdFx0dGhpcy5fb25EaWRDbGljay5maXJlKElubGluZUVkaXRDbGlja0V2ZW50LmNyZWF0ZShlKSk7XG5cdFx0XHR9XG5cdFx0fSwgW1xuXHRcdFx0bi5kaXYoeyBjbGFzczogJ3ByZXZpZXcnLCBzdHlsZTogeyBwb2ludGVyRXZlbnRzOiAnbm9uZScgfSwgcmVmOiB0aGlzLnByZXZpZXdSZWYgfSksXG5cdFx0XSkua2VlcFVwZGF0ZWQodGhpcy5fc3RvcmUpO1xuXHRcdHRoaXMuaXNIb3ZlcmVkID0gdGhpcy5fdXNlckludGVyYWN0aW9uU2VydmljZS5jcmVhdGVIb3ZlclRyYWNrZXIodGhpcy5fZWRpdG9yQ29udGFpbmVyLmVsZW1lbnQsIHRoaXMuX3N0b3JlKTtcblx0XHR0aGlzLnByZXZpZXdFZGl0b3IgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdEVtYmVkZGVkQ29kZUVkaXRvcldpZGdldCxcblx0XHRcdHRoaXMucHJldmlld1JlZi5lbGVtZW50LFxuXHRcdFx0e1xuXHRcdFx0XHRnbHlwaE1hcmdpbjogZmFsc2UsXG5cdFx0XHRcdGxpbmVOdW1iZXJzOiAnb2ZmJyxcblx0XHRcdFx0bWluaW1hcDogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0XHRndWlkZXM6IHtcblx0XHRcdFx0XHRpbmRlbnRhdGlvbjogZmFsc2UsXG5cdFx0XHRcdFx0YnJhY2tldFBhaXJzOiBmYWxzZSxcblx0XHRcdFx0XHRicmFja2V0UGFpcnNIb3Jpem9udGFsOiBmYWxzZSxcblx0XHRcdFx0XHRoaWdobGlnaHRBY3RpdmVJbmRlbnRhdGlvbjogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVkaXRDb250ZXh0OiBmYWxzZSwgLy8gaXMgYSBiaXQgZmFzdGVyXG5cdFx0XHRcdHJ1bGVyczogW10sXG5cdFx0XHRcdHBhZGRpbmc6IHsgdG9wOiAwLCBib3R0b206IDAgfSxcblx0XHRcdFx0Zm9sZGluZzogZmFsc2UsXG5cdFx0XHRcdHNlbGVjdE9uTGluZU51bWJlcnM6IGZhbHNlLFxuXHRcdFx0XHRzZWxlY3Rpb25IaWdobGlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRjb2x1bW5TZWxlY3Rpb246IGZhbHNlLFxuXHRcdFx0XHRvdmVydmlld1J1bGVyQm9yZGVyOiBmYWxzZSxcblx0XHRcdFx0b3ZlcnZpZXdSdWxlckxhbmVzOiAwLFxuXHRcdFx0XHRsaW5lRGVjb3JhdGlvbnNXaWR0aDogMCxcblx0XHRcdFx0bGluZU51bWJlcnNNaW5DaGFyczogMCxcblx0XHRcdFx0cmV2ZWFsSG9yaXpvbnRhbFJpZ2h0UGFkZGluZzogMCxcblx0XHRcdFx0YnJhY2tldFBhaXJDb2xvcml6YXRpb246IHsgZW5hYmxlZDogdHJ1ZSwgaW5kZXBlbmRlbnRDb2xvclBvb2xQZXJCcmFja2V0VHlwZTogZmFsc2UgfSxcblx0XHRcdFx0c2Nyb2xsQmV5b25kTGFzdExpbmU6IGZhbHNlLFxuXHRcdFx0XHRzY3JvbGxiYXI6IHtcblx0XHRcdFx0XHR2ZXJ0aWNhbDogJ2hpZGRlbicsXG5cdFx0XHRcdFx0aG9yaXpvbnRhbDogJ2hpZGRlbicsXG5cdFx0XHRcdFx0aGFuZGxlTW91c2VXaGVlbDogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlYWRPbmx5OiB0cnVlLFxuXHRcdFx0XHR3b3JkV3JhcDogJ29mZicsXG5cdFx0XHRcdHdvcmRXcmFwT3ZlcnJpZGUxOiAnb2ZmJyxcblx0XHRcdFx0d29yZFdyYXBPdmVycmlkZTI6ICdvZmYnLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Y29udGV4dEtleVZhbHVlczoge1xuXHRcdFx0XHRcdFtJbmxpbmVDb21wbGV0aW9uQ29udGV4dEtleXMuaW5JbmxpbmVFZGl0c1ByZXZpZXdFZGl0b3Iua2V5XTogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29udHJpYnV0aW9uczogW10sXG5cdFx0XHR9LFxuXHRcdFx0dGhpcy5fZWRpdG9yXG5cdFx0KSk7XG5cdFx0dGhpcy5fcHJldmlld0VkaXRvck9icyA9IG9ic2VydmFibGVDb2RlRWRpdG9yKHRoaXMucHJldmlld0VkaXRvcik7XG5cdFx0dGhpcy5fYWN0aXZlVmlld1pvbmVzID0gW107XG5cdFx0dGhpcy5fdXBkYXRlUHJldmlld0VkaXRvciA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX2VkaXRvckNvbnRhaW5lci5yZWFkRWZmZWN0KHJlYWRlcik7XG5cdFx0XHR0aGlzLl9wcmV2aWV3RWRpdG9yT2JzLm1vZGVsLnJlYWQocmVhZGVyKTsgLy8gdXBkYXRlIHdoZW4gdGhlIG1vZGVsIGlzIHNldFxuXG5cdFx0XHQvLyBTZXR0aW5nIHRoaXMgaGVyZSBleHBsaWNpdGx5IHRvIG1ha2Ugc3VyZSB0aGF0IHRoZSBwcmV2aWV3IGVkaXRvciBpc1xuXHRcdFx0Ly8gdmlzaWJsZSB3aGVuIG5lZWRlZCwgd2UncmUgYWxzbyBjaGVja2luZyB0aGF0IHRoZXNlIGZpZWxkcyBhcmUgZGVmaW5lZFxuXHRcdFx0Ly8gYmVjYXVzZSBvZiB0aGUgYXV0byBydW4gaW5pdGlhbFxuXHRcdFx0Ly8gQmVmb3JlIHJlbW92aW5nIHRoZXNlLCB2ZXJpZnkgd2l0aCBhIG5vbi1tb25vc3BhY2UgZm9udCBmYW1pbHlcblx0XHRcdHRoaXMuX2Rpc3BsYXkucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHRoaXMuX25vbk92ZXJmbG93Vmlldykge1xuXHRcdFx0XHR0aGlzLl9ub25PdmVyZmxvd1ZpZXcuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gdGhpcy5fZGlzcGxheS5yZWFkKHJlYWRlcik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHVpU3RhdGUgPSB0aGlzLl91aVN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGVkaXQgPSB0aGlzLl9lZGl0LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghdWlTdGF0ZSB8fCAhZWRpdCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJhbmdlID0gZWRpdC5vcmlnaW5hbExpbmVSYW5nZTtcblxuXHRcdFx0Y29uc3QgaGlkZGVuQXJlYXM6IFJhbmdlW10gPSBbXTtcblx0XHRcdGlmIChyYW5nZS5zdGFydExpbmVOdW1iZXIgPiAxKSB7XG5cdFx0XHRcdGhpZGRlbkFyZWFzLnB1c2gobmV3IFJhbmdlKDEsIDEsIHJhbmdlLnN0YXJ0TGluZU51bWJlciAtIDEsIDEpKTtcblx0XHRcdH1cblx0XHRcdGlmIChyYW5nZS5zdGFydExpbmVOdW1iZXIgKyB1aVN0YXRlLm5ld1RleHRMaW5lQ291bnQgPCB0aGlzLl9wcmV2aWV3VGV4dE1vZGVsLmdldExpbmVDb3VudCgpICsgMSkge1xuXHRcdFx0XHRoaWRkZW5BcmVhcy5wdXNoKG5ldyBSYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIgKyB1aVN0YXRlLm5ld1RleHRMaW5lQ291bnQsIDEsIHRoaXMuX3ByZXZpZXdUZXh0TW9kZWwuZ2V0TGluZUNvdW50KCkgKyAxLCAxKSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucHJldmlld0VkaXRvci5zZXRIaWRkZW5BcmVhcyhoaWRkZW5BcmVhcywgdW5kZWZpbmVkLCB0cnVlKTtcblxuXHRcdFx0Ly8gVE9ETzogaXMgdGhpcyB0aGUgcHJvcGVyIHdheSB0byBoYW5kbGUgdmlld3pvbmVzP1xuXHRcdFx0Y29uc3QgcHJldmlvdXNWaWV3Wm9uZXMgPSBbLi4udGhpcy5fYWN0aXZlVmlld1pvbmVzXTtcblx0XHRcdHRoaXMuX2FjdGl2ZVZpZXdab25lcyA9IFtdO1xuXG5cdFx0XHRjb25zdCByZWR1Y2VkTGluZXNDb3VudCA9IChyYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSAtIHVpU3RhdGUubmV3VGV4dExpbmVDb3VudDtcblx0XHRcdHRoaXMucHJldmlld0VkaXRvci5jaGFuZ2VWaWV3Wm9uZXMoKGNoYW5nZUFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdHByZXZpb3VzVmlld1pvbmVzLmZvckVhY2goaWQgPT4gY2hhbmdlQWNjZXNzb3IucmVtb3ZlWm9uZShpZCkpO1xuXG5cdFx0XHRcdGlmIChyZWR1Y2VkTGluZXNDb3VudCA+IDApIHtcblx0XHRcdFx0XHR0aGlzLl9hY3RpdmVWaWV3Wm9uZXMucHVzaChjaGFuZ2VBY2Nlc3Nvci5hZGRab25lKHtcblx0XHRcdFx0XHRcdGFmdGVyTGluZU51bWJlcjogcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICsgdWlTdGF0ZS5uZXdUZXh0TGluZUNvdW50IC0gMSxcblx0XHRcdFx0XHRcdGhlaWdodEluTGluZXM6IHJlZHVjZWRMaW5lc0NvdW50LFxuXHRcdFx0XHRcdFx0c2hvd0luSGlkZGVuQXJlYXM6IHRydWUsXG5cdFx0XHRcdFx0XHRkb21Ob2RlOiAkKCdkaXYuZGlhZ29uYWwtZmlsbC5pbmxpbmUtZWRpdHMtdmlldy16b25lJyksXG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHR0aGlzLl9wcmV2aWV3RWRpdG9yV2lkdGggPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBlZGl0ID0gdGhpcy5fZWRpdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWVkaXQpIHsgcmV0dXJuIDA7IH1cblx0XHRcdHRoaXMuX3VwZGF0ZVByZXZpZXdFZGl0b3IucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRyZXR1cm4gbWF4Q29udGVudFdpZHRoSW5SYW5nZSh0aGlzLl9wcmV2aWV3RWRpdG9yT2JzLCBlZGl0Lm1vZGlmaWVkTGluZVJhbmdlLCByZWFkZXIpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX2N1cnNvclBvc0lmVG91Y2hlc0VkaXQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjdXJzb3JQb3MgPSB0aGlzLl9lZGl0b3JPYnMuY3Vyc29yUG9zaXRpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZWRpdCA9IHRoaXMuX2VkaXQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFlZGl0IHx8ICFjdXJzb3JQb3MpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0cmV0dXJuIGVkaXQubW9kaWZpZWRMaW5lUmFuZ2UuY29udGFpbnMoY3Vyc29yUG9zLmxpbmVOdW1iZXIpID8gY3Vyc29yUG9zIDogdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHRcdHRoaXMuX29yaWdpbmFsU3RhcnRQb3NpdGlvbiA9IGRlcml2ZWQodGhpcywgKHJlYWRlcikgPT4ge1xuXHRcdFx0Y29uc3QgaW5saW5lRWRpdCA9IHRoaXMuX2VkaXQucmVhZChyZWFkZXIpO1xuXHRcdFx0cmV0dXJuIGlubGluZUVkaXQgPyBuZXcgUG9zaXRpb24oaW5saW5lRWRpdC5vcmlnaW5hbExpbmVSYW5nZS5zdGFydExpbmVOdW1iZXIsIDEpIDogbnVsbDtcblx0XHR9KTtcblx0XHR0aGlzLl9vcmlnaW5hbEVuZFBvc2l0aW9uID0gZGVyaXZlZCh0aGlzLCAocmVhZGVyKSA9PiB7XG5cdFx0XHRjb25zdCBpbmxpbmVFZGl0ID0gdGhpcy5fZWRpdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRyZXR1cm4gaW5saW5lRWRpdCA/IG5ldyBQb3NpdGlvbihpbmxpbmVFZGl0Lm9yaWdpbmFsTGluZVJhbmdlLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUsIDEpIDogbnVsbDtcblx0XHR9KTtcblx0XHR0aGlzLl9vcmlnaW5hbFZlcnRpY2FsU3RhcnRQb3NpdGlvbiA9IHRoaXMuX2VkaXRvck9icy5vYnNlcnZlUG9zaXRpb24odGhpcy5fb3JpZ2luYWxTdGFydFBvc2l0aW9uLCB0aGlzLl9zdG9yZSkubWFwKHAgPT4gcD8ueSk7XG5cdFx0dGhpcy5fb3JpZ2luYWxWZXJ0aWNhbEVuZFBvc2l0aW9uID0gdGhpcy5fZWRpdG9yT2JzLm9ic2VydmVQb3NpdGlvbih0aGlzLl9vcmlnaW5hbEVuZFBvc2l0aW9uLCB0aGlzLl9zdG9yZSkubWFwKHAgPT4gcD8ueSk7XG5cdFx0dGhpcy5fb3JpZ2luYWxEaXNwbGF5UmFuZ2UgPSB0aGlzLl9lZGl0Lm1hcChlID0+IGU/LmRpc3BsYXlSYW5nZSk7XG5cdFx0dGhpcy5fZWRpdG9yTWF4Q29udGVudFdpZHRoSW5SYW5nZSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IG9yaWdpbmFsRGlzcGxheVJhbmdlID0gdGhpcy5fb3JpZ2luYWxEaXNwbGF5UmFuZ2UucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFvcmlnaW5hbERpc3BsYXlSYW5nZSkge1xuXHRcdFx0XHRyZXR1cm4gY29uc3RPYnNlcnZhYmxlKDApO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZWRpdG9yT2JzLnZlcnNpb25JZC5yZWFkKHJlYWRlcik7XG5cblx0XHRcdC8vIFRha2UgdGhlIG1heCB2YWx1ZSB0aGF0IHdlIG9ic2VydmVkLlxuXHRcdFx0Ly8gUmVzZXQgd2hlbiBlaXRoZXIgdGhlIGVkaXQgY2hhbmdlcyBvciB0aGUgZWRpdG9yIHRleHQgdmVyc2lvbi5cblx0XHRcdHJldHVybiBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZTxudW1iZXI+KHRoaXMsIChyZWFkZXIsIGxhc3RWYWx1ZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBtYXhXaWR0aCA9IG1heENvbnRlbnRXaWR0aEluUmFuZ2UodGhpcy5fZWRpdG9yT2JzLCBvcmlnaW5hbERpc3BsYXlSYW5nZSwgcmVhZGVyKTtcblx0XHRcdFx0cmV0dXJuIE1hdGgubWF4KG1heFdpZHRoLCBsYXN0VmFsdWUgPz8gMCk7XG5cdFx0XHR9KTtcblx0XHR9KS5tYXAoKHYsIHIpID0+IHYucmVhZChyKSk7XG5cblx0XHRjb25zdCBlZGl0b3JEb21Db250ZW50UmVjdCA9IG9ic2VydmVFZGl0b3JCb3VuZGluZ0NsaWVudFJlY3QodGhpcy5fZWRpdG9yLCB0aGlzLl9zdG9yZSk7XG5cblx0XHR0aGlzLl9wcmV2aWV3RWRpdG9yTGF5b3V0SW5mbyA9IGRlcml2ZWQodGhpcywgKHJlYWRlcikgPT4ge1xuXHRcdFx0Y29uc3QgaW5saW5lRWRpdCA9IHRoaXMuX2VkaXQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFpbmxpbmVFZGl0KSB7XG5cdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl91aVN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghc3RhdGUpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJhbmdlID0gaW5saW5lRWRpdC5vcmlnaW5hbExpbmVSYW5nZTtcblxuXHRcdFx0Y29uc3QgaG9yaXpvbnRhbFNjcm9sbE9mZnNldCA9IHRoaXMuX2VkaXRvck9icy5zY3JvbGxMZWZ0LnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3QgZWRpdG9yQ29udGVudE1heFdpZHRoSW5SYW5nZSA9IHRoaXMuX2VkaXRvck1heENvbnRlbnRXaWR0aEluUmFuZ2UucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZWRpdG9yTGF5b3V0ID0gdGhpcy5fZWRpdG9yT2JzLmxheW91dEluZm8ucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgcHJldmlld0NvbnRlbnRXaWR0aCA9IHRoaXMuX3ByZXZpZXdFZGl0b3JXaWR0aC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBlZGl0b3JDb250ZW50QXJlYVdpZHRoID0gZWRpdG9yTGF5b3V0LmNvbnRlbnRXaWR0aCAtIGVkaXRvckxheW91dC52ZXJ0aWNhbFNjcm9sbGJhcldpZHRoO1xuXHRcdFx0Y29uc3QgZWRpdG9yQm91bmRpbmdDbGllbnRSZWN0ID0gZWRpdG9yRG9tQ29udGVudFJlY3QucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgY2xpZW50Q29udGVudEFyZWFSaWdodCA9IGVkaXRvckxheW91dC5jb250ZW50TGVmdCArIGVkaXRvckxheW91dC5jb250ZW50V2lkdGggKyBlZGl0b3JCb3VuZGluZ0NsaWVudFJlY3QubGVmdDtcblx0XHRcdGNvbnN0IHJlbWFpbmluZ1dpZHRoUmlnaHRPZkNvbnRlbnQgPSBnZXRXaW5kb3codGhpcy5fZWRpdG9yLmdldENvbnRhaW5lckRvbU5vZGUoKSkuaW5uZXJXaWR0aCAtIGNsaWVudENvbnRlbnRBcmVhUmlnaHQ7XG5cdFx0XHRjb25zdCByZW1haW5pbmdXaWR0aFJpZ2h0T2ZFZGl0b3IgPSBnZXRXaW5kb3codGhpcy5fZWRpdG9yLmdldENvbnRhaW5lckRvbU5vZGUoKSkuaW5uZXJXaWR0aCAtIGVkaXRvckJvdW5kaW5nQ2xpZW50UmVjdC5yaWdodDtcblx0XHRcdGNvbnN0IGRlc2lyZWRNaW5pbXVtV2lkdGggPSBNYXRoLm1pbihlZGl0b3JMYXlvdXQuY29udGVudFdpZHRoICogMC4zLCBwcmV2aWV3Q29udGVudFdpZHRoLCAxMDApO1xuXHRcdFx0Y29uc3QgSU5fRURJVE9SX0RJU1BMQUNFTUVOVCA9IDA7XG5cdFx0XHRjb25zdCBtYXhpbXVtQXZhaWxhYmxlV2lkdGggPSBJTl9FRElUT1JfRElTUExBQ0VNRU5UICsgcmVtYWluaW5nV2lkdGhSaWdodE9mQ29udGVudDtcblxuXHRcdFx0Y29uc3QgY3Vyc29yUG9zID0gdGhpcy5fY3Vyc29yUG9zSWZUb3VjaGVzRWRpdC5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IG1heFByZXZpZXdFZGl0b3JMZWZ0ID0gTWF0aC5tYXgoXG5cdFx0XHRcdC8vIFdlJ3JlIHN0YXJ0aW5nIGZyb20gdGhlIGNvbnRlbnQgYXJlYSByaWdodCBhbmQgbW92aW5nIGl0IGxlZnQgYnkgSU5fRURJVE9SX0RJU1BMQUNFTUVOVCBhbmQgYWxzbyBieSBhbiBhbW91bnQgdG8gZW5zdXJlIHNvbWUgbWluaW11bSBkZXNpcmVkIHdpZHRoXG5cdFx0XHRcdGVkaXRvckNvbnRlbnRBcmVhV2lkdGggKyBob3Jpem9udGFsU2Nyb2xsT2Zmc2V0IC0gSU5fRURJVE9SX0RJU1BMQUNFTUVOVCAtIE1hdGgubWF4KDAsIGRlc2lyZWRNaW5pbXVtV2lkdGggLSBtYXhpbXVtQXZhaWxhYmxlV2lkdGgpLFxuXHRcdFx0XHQvLyBCdXQgd2UgZG9uJ3Qgd2FudCB0aGF0IHRoZSBtb3ZpbmcgbGVmdCBlbmRzIHVwIGNvdmVyaW5nIHRoZSBjdXJzb3IsIHNvIHRoaXMgd2lsbCBwdXNoIGl0IHRvIHRoZSByaWdodCBhZ2FpblxuXHRcdFx0XHRNYXRoLm1pbihcblx0XHRcdFx0XHRjdXJzb3JQb3MgPyBnZXRPZmZzZXRGb3JQb3ModGhpcy5fZWRpdG9yT2JzLCBjdXJzb3JQb3MsIHJlYWRlcikgKyA1MCA6IDAsXG5cdFx0XHRcdFx0ZWRpdG9yQ29udGVudEFyZWFXaWR0aCArIGhvcml6b250YWxTY3JvbGxPZmZzZXRcblx0XHRcdFx0KVxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHByZXZpZXdFZGl0b3JMZWZ0SW5UZXh0QXJlYSA9IE1hdGgubWluKGVkaXRvckNvbnRlbnRNYXhXaWR0aEluUmFuZ2UgKyBPUklHSU5BTF9FTkRfUEFERElORywgbWF4UHJldmlld0VkaXRvckxlZnQpO1xuXG5cdFx0XHRjb25zdCBtYXhDb250ZW50V2lkdGggPSBlZGl0b3JDb250ZW50TWF4V2lkdGhJblJhbmdlICsgT1JJR0lOQUxfRU5EX1BBRERJTkcgKyBwcmV2aWV3Q29udGVudFdpZHRoICsgNzA7XG5cblx0XHRcdGNvbnN0IGRpc3QgPSBtYXhQcmV2aWV3RWRpdG9yTGVmdCAtIHByZXZpZXdFZGl0b3JMZWZ0SW5UZXh0QXJlYTtcblxuXHRcdFx0bGV0IGRlc2lyZWRQcmV2aWV3RWRpdG9yU2Nyb2xsTGVmdDtcblx0XHRcdGxldCBjb2RlUmlnaHQ7XG5cdFx0XHRpZiAocHJldmlld0VkaXRvckxlZnRJblRleHRBcmVhID4gaG9yaXpvbnRhbFNjcm9sbE9mZnNldCkge1xuXHRcdFx0XHRkZXNpcmVkUHJldmlld0VkaXRvclNjcm9sbExlZnQgPSAwO1xuXHRcdFx0XHRjb2RlUmlnaHQgPSBlZGl0b3JMYXlvdXQuY29udGVudExlZnQgKyBwcmV2aWV3RWRpdG9yTGVmdEluVGV4dEFyZWEgLSBob3Jpem9udGFsU2Nyb2xsT2Zmc2V0O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGVzaXJlZFByZXZpZXdFZGl0b3JTY3JvbGxMZWZ0ID0gaG9yaXpvbnRhbFNjcm9sbE9mZnNldCAtIHByZXZpZXdFZGl0b3JMZWZ0SW5UZXh0QXJlYTtcblx0XHRcdFx0Y29kZVJpZ2h0ID0gZWRpdG9yTGF5b3V0LmNvbnRlbnRMZWZ0O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZWxlY3Rpb25Ub3AgPSB0aGlzLl9vcmlnaW5hbFZlcnRpY2FsU3RhcnRQb3NpdGlvbi5yZWFkKHJlYWRlcikgPz8gdGhpcy5fZWRpdG9yLmdldFRvcEZvckxpbmVOdW1iZXIocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSAtIHRoaXMuX2VkaXRvck9icy5zY3JvbGxUb3AucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uQm90dG9tID0gdGhpcy5fb3JpZ2luYWxWZXJ0aWNhbEVuZFBvc2l0aW9uLnJlYWQocmVhZGVyKSA/PyB0aGlzLl9lZGl0b3IuZ2V0Qm90dG9tRm9yTGluZU51bWJlcihyYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlIC0gMSkgLSB0aGlzLl9lZGl0b3JPYnMuc2Nyb2xsVG9wLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Ly8gVE9ETzogY29uc3QgeyBwcmVmaXhMZWZ0T2Zmc2V0IH0gPSBnZXRQcmVmaXhUcmltKGlubGluZUVkaXQuZWRpdC5lZGl0cy5tYXAoZSA9PiBlLnJhbmdlKSwgaW5saW5lRWRpdC5vcmlnaW5hbExpbmVSYW5nZSwgW10sIHRoaXMuX2VkaXRvcik7XG5cdFx0XHRjb25zdCBjb2RlTGVmdCA9IGVkaXRvckxheW91dC5jb250ZW50TGVmdCAtIGhvcml6b250YWxTY3JvbGxPZmZzZXQ7XG5cblx0XHRcdGxldCBjb2RlUmVjdCA9IFJlY3QuZnJvbUxlZnRUb3BSaWdodEJvdHRvbShjb2RlTGVmdCwgc2VsZWN0aW9uVG9wLCBjb2RlUmlnaHQsIHNlbGVjdGlvbkJvdHRvbSk7XG5cdFx0XHRjb25zdCBpc0luc2VydGlvbiA9IGNvZGVSZWN0LmhlaWdodCA9PT0gMDtcblx0XHRcdGlmICghaXNJbnNlcnRpb24pIHtcblx0XHRcdFx0Y29kZVJlY3QgPSBjb2RlUmVjdC53aXRoTWFyZ2luKFZFUlRJQ0FMX1BBRERJTkcsIEhPUklaT05UQUxfUEFERElORyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHByZXZpZXdMaW5lSGVpZ2h0cyA9IHRoaXMuX3ByZXZpZXdFZGl0b3JPYnMub2JzZXJ2ZUxpbmVIZWlnaHRzRm9yTGluZVJhbmdlKGlubGluZUVkaXQubW9kaWZpZWRMaW5lUmFuZ2UpLnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IGVkaXRIZWlnaHQgPSBwcmV2aWV3TGluZUhlaWdodHMucmVkdWNlKChhY2MsIGgpID0+IGFjYyArIGgsIDApO1xuXHRcdFx0Y29uc3QgY29kZUhlaWdodCA9IHNlbGVjdGlvbkJvdHRvbSAtIHNlbGVjdGlvblRvcDtcblx0XHRcdGNvbnN0IHByZXZpZXdFZGl0b3JIZWlnaHQgPSBNYXRoLm1heChjb2RlSGVpZ2h0LCBlZGl0SGVpZ2h0KTtcblxuXHRcdFx0Y29uc3QgY2xpcHBlZCA9IGRpc3QgPT09IDA7XG5cdFx0XHRjb25zdCBjb2RlRWRpdERpc3QgPSAwO1xuXHRcdFx0Y29uc3QgcHJldmlld0VkaXRvcldpZHRoID0gTWF0aC5taW4ocHJldmlld0NvbnRlbnRXaWR0aCArIE1PRElGSUVEX0VORF9QQURESU5HLCByZW1haW5pbmdXaWR0aFJpZ2h0T2ZFZGl0b3IgKyBlZGl0b3JMYXlvdXQud2lkdGggLSBlZGl0b3JMYXlvdXQuY29udGVudExlZnQgLSBjb2RlRWRpdERpc3QpO1xuXG5cdFx0XHRsZXQgZWRpdFJlY3QgPSBSZWN0LmZyb21MZWZ0VG9wV2lkdGhIZWlnaHQoY29kZVJlY3QucmlnaHQgKyBjb2RlRWRpdERpc3QsIHNlbGVjdGlvblRvcCwgcHJldmlld0VkaXRvcldpZHRoLCBwcmV2aWV3RWRpdG9ySGVpZ2h0KTtcblx0XHRcdGlmICghaXNJbnNlcnRpb24pIHtcblx0XHRcdFx0ZWRpdFJlY3QgPSBlZGl0UmVjdC53aXRoTWFyZ2luKFZFUlRJQ0FMX1BBRERJTkcsIEhPUklaT05UQUxfUEFERElORykudHJhbnNsYXRlWChIT1JJWk9OVEFMX1BBRERJTkcgKyBCT1JERVJfV0lEVEgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gQWxpZ24gdG9wIG9mIGVkaXQgd2l0aCBpbnNlcnRpb24gbGluZVxuXHRcdFx0XHRlZGl0UmVjdCA9IGVkaXRSZWN0LndpdGhNYXJnaW4oVkVSVElDQUxfUEFERElORywgSE9SSVpPTlRBTF9QQURESU5HKS50cmFuc2xhdGVZKFZFUlRJQ0FMX1BBRERJTkcpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBkZWJ1Z1ZpZXcoZGVidWdMb2dSZWN0cyh7IGNvZGVSZWN0LCBlZGl0UmVjdCB9LCB0aGlzLl9lZGl0b3IuZ2V0RG9tTm9kZSgpISksIHJlYWRlcik7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNvZGVSZWN0LFxuXHRcdFx0XHRlZGl0UmVjdCxcblx0XHRcdFx0Y29kZVNjcm9sbExlZnQ6IGhvcml6b250YWxTY3JvbGxPZmZzZXQsXG5cdFx0XHRcdGNvbnRlbnRMZWZ0OiBlZGl0b3JMYXlvdXQuY29udGVudExlZnQsXG5cblx0XHRcdFx0aXNJbnNlcnRpb24sXG5cdFx0XHRcdG1heENvbnRlbnRXaWR0aCxcblx0XHRcdFx0c2hvdWxkU2hvd1NoYWRvdzogY2xpcHBlZCxcblx0XHRcdFx0ZGVzaXJlZFByZXZpZXdFZGl0b3JTY3JvbGxMZWZ0LFxuXHRcdFx0XHRwcmV2aWV3RWRpdG9yV2lkdGgsXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdHRoaXMuX3N0aWNreVNjcm9sbENvbnRyb2xsZXIgPSBTdGlja3lTY3JvbGxDb250cm9sbGVyLmdldCh0aGlzLl9lZGl0b3JPYnMuZWRpdG9yKTtcblx0XHR0aGlzLl9zdGlja3lTY3JvbGxIZWlnaHQgPSB0aGlzLl9zdGlja3lTY3JvbGxDb250cm9sbGVyID8gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLl9zdGlja3lTY3JvbGxDb250cm9sbGVyLm9uRGlkQ2hhbmdlU3RpY2t5U2Nyb2xsSGVpZ2h0LCAoKSA9PiB0aGlzLl9zdGlja3lTY3JvbGxDb250cm9sbGVyIS5zdGlja3lTY3JvbGxXaWRnZXRIZWlnaHQpIDogY29uc3RPYnNlcnZhYmxlKDApO1xuXHRcdHRoaXMuX3Nob3VsZE92ZXJmbG93ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0aWYgKCFFTkFCTEVfT1ZFUkZMT1cpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl9lZGl0LnJlYWQocmVhZGVyKT8ub3JpZ2luYWxMaW5lUmFuZ2U7XG5cdFx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHN0aWNreVNjcm9sbEhlaWdodCA9IHRoaXMuX3N0aWNreVNjcm9sbEhlaWdodC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB0b3AgPSB0aGlzLl9lZGl0b3IuZ2V0VG9wRm9yTGluZU51bWJlcihyYW5nZS5zdGFydExpbmVOdW1iZXIpIC0gdGhpcy5fZWRpdG9yT2JzLnNjcm9sbFRvcC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAodG9wIDw9IHN0aWNreVNjcm9sbEhlaWdodCkge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBib3R0b20gPSB0aGlzLl9lZGl0b3IuZ2V0VG9wRm9yTGluZU51bWJlcihyYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlKSAtIHRoaXMuX2VkaXRvck9icy5zY3JvbGxUb3AucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGJvdHRvbSA+PSB0aGlzLl9lZGl0b3JPYnMubGF5b3V0SW5mby5yZWFkKHJlYWRlcikuaGVpZ2h0KSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXHRcdHRoaXMuX29yaWdpbmFsQmFja2dyb3VuZENvbG9yID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCB0aGlzLl90aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlLCAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS5nZXRDb2xvcihvcmlnaW5hbEJhY2tncm91bmRDb2xvcikgPz8gQ29sb3IudHJhbnNwYXJlbnQ7XG5cdFx0fSk7XG5cdFx0dGhpcy5fZWRpdG9yQmFja2dyb3VuZENvbG9yID0gdGhpcy5fdWlTdGF0ZS5tYXAocyA9PiB7XG5cdFx0XHRyZXR1cm4gZ2V0RWRpdG9yQmFja2dyb3VuZENvbG9yKHM/LmVkaXRvclR5cGUgPz8gSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUuVGV4dEVkaXRvcik7XG5cdFx0fSk7XG5cdFx0dGhpcy5fYmFja2dyb3VuZFN2ZyA9IG4uc3ZnKHtcblx0XHRcdHRyYW5zZm9ybTogJ3RyYW5zbGF0ZSgtMC41IC0wLjUpJyxcblx0XHRcdHN0eWxlOiB7IG92ZXJmbG93OiAndmlzaWJsZScsIHBvaW50ZXJFdmVudHM6ICdub25lJywgcG9zaXRpb246ICdhYnNvbHV0ZScgfSxcblx0XHR9LCBbXG5cdFx0XHRuLnN2Z0VsZW0oJ3BhdGgnLCB7XG5cdFx0XHRcdGNsYXNzOiAncmlnaHRPZk1vZGlmaWVkQmFja2dyb3VuZENvdmVyVXAnLFxuXHRcdFx0XHRkOiBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHRoaXMuX3ByZXZpZXdFZGl0b3JMYXlvdXRJbmZvLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRpZiAoIWxheW91dEluZm8pIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsQmFja2dyb3VuZENvbG9yID0gdGhpcy5fb3JpZ2luYWxCYWNrZ3JvdW5kQ29sb3IucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRcdGlmIChvcmlnaW5hbEJhY2tncm91bmRDb2xvci5pc1RyYW5zcGFyZW50KCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBQYXRoQnVpbGRlcigpXG5cdFx0XHRcdFx0XHQubW92ZVRvKGxheW91dEluZm8uY29kZVJlY3QuZ2V0UmlnaHRUb3AoKSlcblx0XHRcdFx0XHRcdC5saW5lVG8obGF5b3V0SW5mby5jb2RlUmVjdC5nZXRSaWdodFRvcCgpLmRlbHRhWCgxMDAwKSlcblx0XHRcdFx0XHRcdC5saW5lVG8obGF5b3V0SW5mby5jb2RlUmVjdC5nZXRSaWdodEJvdHRvbSgpLmRlbHRhWCgxMDAwKSlcblx0XHRcdFx0XHRcdC5saW5lVG8obGF5b3V0SW5mby5jb2RlUmVjdC5nZXRSaWdodEJvdHRvbSgpKVxuXHRcdFx0XHRcdFx0LmJ1aWxkKCk7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdGZpbGw6IHRoaXMuX2VkaXRvckJhY2tncm91bmRDb2xvcixcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0XSkua2VlcFVwZGF0ZWQodGhpcy5fc3RvcmUpO1xuXHRcdHRoaXMuX29yaWdpbmFsT3ZlcmxheSA9IG4uZGl2KHtcblx0XHRcdHN0eWxlOiB7IHBvaW50ZXJFdmVudHM6ICdub25lJywgZGlzcGxheTogdGhpcy5fcHJldmlld0VkaXRvckxheW91dEluZm8ubWFwKGxheW91dEluZm8gPT4gbGF5b3V0SW5mbz8uaXNJbnNlcnRpb24gPyAnbm9uZScgOiAnYmxvY2snKSB9LFxuXHRcdH0sIGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGxheW91dEluZm9PYnMgPSBtYXBPdXRGYWxzeSh0aGlzLl9wcmV2aWV3RWRpdG9yTGF5b3V0SW5mbykucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFsYXlvdXRJbmZvT2JzKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdFx0Y29uc3QgZWRpdG9yQmFja2dyb3VuZCA9IHRoaXMuX2VkaXRvckJhY2tncm91bmRDb2xvci5yZWFkKHJlYWRlcik7XG5cblx0XHRcdGNvbnN0IHNlcGFyYXRvcldpZHRoID0gc2VwYXJhdG9yV2lkdGhPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgYm9yZGVyU3R5bGluZyA9IGdldE9yaWdpbmFsQm9yZGVyQ29sb3IodGhpcy5fdGFiQWN0aW9uKS5tYXAoYmMgPT4gYCR7Qk9SREVSX1dJRFRIfXB4IHNvbGlkICR7YXNDc3NWYXJpYWJsZShiYyl9YCk7XG5cdFx0XHRjb25zdCBib3JkZXJTdHlsaW5nU2VwYXJhdG9yID0gYCR7Qk9SREVSX1dJRFRIICsgc2VwYXJhdG9yV2lkdGh9cHggc29saWQgJHtlZGl0b3JCYWNrZ3JvdW5kfWA7XG5cblx0XHRcdGNvbnN0IGhhc0JvcmRlckxlZnQgPSBsYXlvdXRJbmZvT2JzLnJlYWQocmVhZGVyKS5jb2RlU2Nyb2xsTGVmdCAhPT0gMDtcblx0XHRcdGNvbnN0IGlzTW9kaWZpZWRMb3dlciA9IGxheW91dEluZm9PYnMubWFwKGxheW91dEluZm8gPT4gbGF5b3V0SW5mby5jb2RlUmVjdC5ib3R0b20gPCBsYXlvdXRJbmZvLmVkaXRSZWN0LmJvdHRvbSk7XG5cdFx0XHRjb25zdCB0cmFuc2l0aW9uUmVjdFNpemUgPSBCT1JERVJfUkFESVVTICogMiArIEJPUkRFUl9XSURUSCAqIDI7XG5cblx0XHRcdC8vIENyZWF0ZSBhbiBvdmVybGF5IHdoaWNoIGhpZGVzIHRoZSBsZWZ0IGhhbmQgc2lkZSBvZiB0aGUgb3JpZ2luYWwgb3ZlcmxheSB3aGVuIGl0IG92ZXJmbG93cyB0byB0aGUgbGVmdFxuXHRcdFx0Ly8gc3VjaCB0aGF0IHRoZXJlIGlzIGEgc21vb3RoIHRyYW5zaXRpb24gYXQgdGhlIGVkZ2Ugb2YgY29udGVudCBsZWZ0XG5cdFx0XHRjb25zdCBvdmVybGF5SGlkZXIgPSBsYXlvdXRJbmZvT2JzLm1hcChsYXlvdXRJbmZvID0+IFJlY3QuZnJvbUxlZnRUb3BSaWdodEJvdHRvbShcblx0XHRcdFx0bGF5b3V0SW5mby5jb250ZW50TGVmdCAtIEJPUkRFUl9SQURJVVMgLSBCT1JERVJfV0lEVEgsXG5cdFx0XHRcdGxheW91dEluZm8uY29kZVJlY3QudG9wLFxuXHRcdFx0XHRsYXlvdXRJbmZvLmNvbnRlbnRMZWZ0LFxuXHRcdFx0XHRsYXlvdXRJbmZvLmNvZGVSZWN0LmJvdHRvbSArIHRyYW5zaXRpb25SZWN0U2l6ZVxuXHRcdFx0KSkucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRjb25zdCBpbnRlcnNlY3Rpb25MaW5lID0gbmV3IE9mZnNldFJhbmdlKG92ZXJsYXlIaWRlci5sZWZ0LCBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUik7XG5cdFx0XHRjb25zdCBvdmVybGF5UmVjdCA9IGxheW91dEluZm9PYnMubWFwKGxheW91dEluZm8gPT4gbGF5b3V0SW5mby5jb2RlUmVjdC5pbnRlcnNlY3RIb3Jpem9udGFsKGludGVyc2VjdGlvbkxpbmUpKTtcblx0XHRcdGNvbnN0IHNlcGFyYXRvclJlY3QgPSBvdmVybGF5UmVjdC5tYXAob3ZlcmxheVJlY3QgPT4gb3ZlcmxheVJlY3Qud2l0aE1hcmdpbihzZXBhcmF0b3JXaWR0aCwgMCwgc2VwYXJhdG9yV2lkdGgsIHNlcGFyYXRvcldpZHRoKS5pbnRlcnNlY3RIb3Jpem9udGFsKGludGVyc2VjdGlvbkxpbmUpKTtcblxuXHRcdFx0Y29uc3QgdHJhbnNpdGlvblJlY3QgPSBvdmVybGF5UmVjdC5tYXAob3ZlcmxheVJlY3QgPT4gUmVjdC5mcm9tTGVmdFRvcFdpZHRoSGVpZ2h0KG92ZXJsYXlSZWN0LnJpZ2h0IC0gdHJhbnNpdGlvblJlY3RTaXplICsgQk9SREVSX1dJRFRILCBvdmVybGF5UmVjdC5ib3R0b20gLSBCT1JERVJfV0lEVEgsIHRyYW5zaXRpb25SZWN0U2l6ZSwgdHJhbnNpdGlvblJlY3RTaXplKS5pbnRlcnNlY3RIb3Jpem9udGFsKGludGVyc2VjdGlvbkxpbmUpKTtcblxuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRcdGNsYXNzOiAnb3JpZ2luYWxTZXBhcmF0b3JTaWRlQnlTaWRlJyxcblx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0Li4uc2VwYXJhdG9yUmVjdC5yZWFkKHJlYWRlcikudG9TdHlsZXMoKSxcblx0XHRcdFx0XHRcdGJveFNpemluZzogJ2JvcmRlci1ib3gnLFxuXHRcdFx0XHRcdFx0Ym9yZGVyUmFkaXVzOiBgJHtCT1JERVJfUkFESVVTfXB4IDAgMCAke0JPUkRFUl9SQURJVVN9cHhgLFxuXHRcdFx0XHRcdFx0Ym9yZGVyVG9wOiBib3JkZXJTdHlsaW5nU2VwYXJhdG9yLFxuXHRcdFx0XHRcdFx0Ym9yZGVyQm90dG9tOiBib3JkZXJTdHlsaW5nU2VwYXJhdG9yLFxuXHRcdFx0XHRcdFx0Ym9yZGVyTGVmdDogaGFzQm9yZGVyTGVmdCA/ICdub25lJyA6IGJvcmRlclN0eWxpbmdTZXBhcmF0b3IsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSxcblxuXHRcdFx0XHRuLmRpdih7XG5cdFx0XHRcdFx0Y2xhc3M6ICdvcmlnaW5hbE92ZXJsYXlTaWRlQnlTaWRlJyxcblx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0Li4ub3ZlcmxheVJlY3QucmVhZChyZWFkZXIpLnRvU3R5bGVzKCksXG5cdFx0XHRcdFx0XHRib3hTaXppbmc6ICdib3JkZXItYm94Jyxcblx0XHRcdFx0XHRcdGJvcmRlclJhZGl1czogYCR7Qk9SREVSX1JBRElVU31weCAwIDAgJHtCT1JERVJfUkFESVVTfXB4YCxcblx0XHRcdFx0XHRcdGJvcmRlclRvcDogYm9yZGVyU3R5bGluZyxcblx0XHRcdFx0XHRcdGJvcmRlckJvdHRvbTogYm9yZGVyU3R5bGluZyxcblx0XHRcdFx0XHRcdGJvcmRlckxlZnQ6IGhhc0JvcmRlckxlZnQgPyAnbm9uZScgOiBib3JkZXJTdHlsaW5nLFxuXHRcdFx0XHRcdFx0YmFja2dyb3VuZENvbG9yOiBhc0Nzc1ZhcmlhYmxlKG9yaWdpbmFsQmFja2dyb3VuZENvbG9yKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pLFxuXG5cdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRjbGFzczogJ29yaWdpbmFsQ29ybmVyQ3V0b3V0U2lkZUJ5U2lkZScsXG5cdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdHBvaW50ZXJFdmVudHM6ICdub25lJyxcblx0XHRcdFx0XHRcdGRpc3BsYXk6IGlzTW9kaWZpZWRMb3dlci5tYXAoaXNMb3dlciA9PiBpc0xvd2VyID8gJ2Jsb2NrJyA6ICdub25lJyksXG5cdFx0XHRcdFx0XHQuLi50cmFuc2l0aW9uUmVjdC5yZWFkKHJlYWRlcikudG9TdHlsZXMoKSxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIFtcblx0XHRcdFx0XHRuLmRpdih7XG5cdFx0XHRcdFx0XHRjbGFzczogJ29yaWdpbmFsQ29ybmVyQ3V0b3V0QmFja2dyb3VuZCcsXG5cdFx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogJ2Fic29sdXRlJywgdG9wOiAnMHB4JywgbGVmdDogJzBweCcsIHdpZHRoOiAnMTAwJScsIGhlaWdodDogJzEwMCUnLFxuXHRcdFx0XHRcdFx0XHRiYWNrZ3JvdW5kQ29sb3I6IGdldEVkaXRvckJsZW5kZWRDb2xvcihvcmlnaW5hbEJhY2tncm91bmRDb2xvciwgdGhpcy5fdGhlbWVTZXJ2aWNlKS5tYXAoYyA9PiBjLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRcdGNsYXNzOiAnb3JpZ2luYWxDb3JuZXJDdXRvdXRCb3JkZXInLFxuXHRcdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsIHRvcDogJzBweCcsIGxlZnQ6ICcwcHgnLCB3aWR0aDogJzEwMCUnLCBoZWlnaHQ6ICcxMDAlJyxcblx0XHRcdFx0XHRcdFx0Ym94U2l6aW5nOiAnYm9yZGVyLWJveCcsXG5cdFx0XHRcdFx0XHRcdGJvcmRlclRvcDogYm9yZGVyU3R5bGluZyxcblx0XHRcdFx0XHRcdFx0Ym9yZGVyUmlnaHQ6IGJvcmRlclN0eWxpbmcsXG5cdFx0XHRcdFx0XHRcdGJvcmRlclJhZGl1czogYDAgMTAwJSAwIDBgLFxuXHRcdFx0XHRcdFx0XHRiYWNrZ3JvdW5kQ29sb3I6IGVkaXRvckJhY2tncm91bmRcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KVxuXHRcdFx0XHRdKSxcblx0XHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRcdGNsYXNzOiAnb3JpZ2luYWxPdmVybGF5U2lkZUJ5U2lkZUhpZGVyJyxcblx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0Li4ub3ZlcmxheUhpZGVyLnRvU3R5bGVzKCksXG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kQ29sb3I6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSxcblx0XHRcdF07XG5cdFx0fSkpLmtlZXBVcGRhdGVkKHRoaXMuX3N0b3JlKTtcblx0XHR0aGlzLl9tb2RpZmllZE92ZXJsYXkgPSBuLmRpdih7XG5cdFx0XHRzdHlsZTogeyBwb2ludGVyRXZlbnRzOiAnbm9uZScsIH1cblx0XHR9LCBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBsYXlvdXRJbmZvT2JzID0gbWFwT3V0RmFsc3kodGhpcy5fcHJldmlld0VkaXRvckxheW91dEluZm8pLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghbGF5b3V0SW5mb09icykgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0XHRcdGNvbnN0IGlzTW9kaWZpZWRMb3dlciA9IGxheW91dEluZm9PYnMubWFwKGxheW91dEluZm8gPT4gbGF5b3V0SW5mby5jb2RlUmVjdC5ib3R0b20gPCBsYXlvdXRJbmZvLmVkaXRSZWN0LmJvdHRvbSk7XG5cdFx0XHRjb25zdCBlZGl0b3JCYWNrZ3JvdW5kID0gdGhpcy5fZWRpdG9yQmFja2dyb3VuZENvbG9yLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Y29uc3Qgc2VwYXJhdG9yV2lkdGggPSBzZXBhcmF0b3JXaWR0aE9icy5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBib3JkZXJSYWRpdXMgPSBpc01vZGlmaWVkTG93ZXIubWFwKGlzTG93ZXIgPT4gYDAgJHtCT1JERVJfUkFESVVTfXB4ICR7Qk9SREVSX1JBRElVU31weCAke2lzTG93ZXIgPyBCT1JERVJfUkFESVVTIDogMH1weGApO1xuXHRcdFx0Y29uc3QgYm9yZGVyU3R5bGluZyA9IGdldEVkaXRvckJsZW5kZWRDb2xvcihnZXRNb2RpZmllZEJvcmRlckNvbG9yKHRoaXMuX3RhYkFjdGlvbiksIHRoaXMuX3RoZW1lU2VydmljZSkubWFwKGMgPT4gYDFweCBzb2xpZCAke2MudG9TdHJpbmcoKX1gKTtcblx0XHRcdGNvbnN0IGJvcmRlclN0eWxpbmdTZXBhcmF0b3IgPSBgJHtCT1JERVJfV0lEVEggKyBzZXBhcmF0b3JXaWR0aH1weCBzb2xpZCAke2VkaXRvckJhY2tncm91bmR9YDtcblxuXHRcdFx0Y29uc3Qgb3ZlcmxheVJlY3QgPSBsYXlvdXRJbmZvT2JzLm1hcChsYXlvdXRJbmZvID0+IGxheW91dEluZm8uZWRpdFJlY3Qud2l0aE1hcmdpbigwLCBCT1JERVJfV0lEVEgpKTtcblx0XHRcdGNvbnN0IHNlcGFyYXRvclJlY3QgPSBvdmVybGF5UmVjdC5tYXAob3ZlcmxheVJlY3QgPT4gb3ZlcmxheVJlY3Qud2l0aE1hcmdpbihzZXBhcmF0b3JXaWR0aCwgc2VwYXJhdG9yV2lkdGgsIHNlcGFyYXRvcldpZHRoLCAwKSk7XG5cblx0XHRcdGNvbnN0IGluc2VydGlvblJlY3QgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IG92ZXJsYXkgPSBvdmVybGF5UmVjdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IGxheW91dGluZm8gPSBsYXlvdXRJbmZvT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0aWYgKCFsYXlvdXRpbmZvLmlzSW5zZXJ0aW9uIHx8IGxheW91dGluZm8uY29udGVudExlZnQgPj0gb3ZlcmxheS5sZWZ0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIFJlY3QuZnJvbUxlZnRUb3BXaWR0aEhlaWdodChvdmVybGF5LmxlZnQsIG92ZXJsYXkudG9wLCAwLCAwKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbmV3IFJlY3QobGF5b3V0aW5mby5jb250ZW50TGVmdCwgb3ZlcmxheS50b3AsIG92ZXJsYXkubGVmdCwgb3ZlcmxheS50b3AgKyBCT1JERVJfV0lEVEggKiAyKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRuLmRpdih7XG5cdFx0XHRcdFx0Y2xhc3M6ICdtb2RpZmllZEluc2VydGlvblNpZGVCeVNpZGUnLFxuXHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHQuLi5pbnNlcnRpb25SZWN0LnJlYWQocmVhZGVyKS50b1N0eWxlcygpLFxuXHRcdFx0XHRcdFx0YmFja2dyb3VuZENvbG9yOiBnZXRNb2RpZmllZEJvcmRlckNvbG9yKHRoaXMuX3RhYkFjdGlvbikubWFwKGMgPT4gYXNDc3NWYXJpYWJsZShjKSksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSxcblx0XHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRcdGNsYXNzOiAnbW9kaWZpZWRTZXBhcmF0b3JTaWRlQnlTaWRlJyxcblx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0Li4uc2VwYXJhdG9yUmVjdC5yZWFkKHJlYWRlcikudG9TdHlsZXMoKSxcblx0XHRcdFx0XHRcdGJvcmRlclJhZGl1cyxcblx0XHRcdFx0XHRcdGJvcmRlclRvcDogYm9yZGVyU3R5bGluZ1NlcGFyYXRvcixcblx0XHRcdFx0XHRcdGJvcmRlckJvdHRvbTogYm9yZGVyU3R5bGluZ1NlcGFyYXRvcixcblx0XHRcdFx0XHRcdGJvcmRlclJpZ2h0OiBib3JkZXJTdHlsaW5nU2VwYXJhdG9yLFxuXHRcdFx0XHRcdFx0Ym94U2l6aW5nOiAnYm9yZGVyLWJveCcsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSxcblx0XHRcdFx0bi5kaXYoe1xuXHRcdFx0XHRcdGNsYXNzOiAnbW9kaWZpZWRPdmVybGF5U2lkZUJ5U2lkZScsXG5cdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdC4uLm92ZXJsYXlSZWN0LnJlYWQocmVhZGVyKS50b1N0eWxlcygpLFxuXHRcdFx0XHRcdFx0Ym9yZGVyUmFkaXVzLFxuXHRcdFx0XHRcdFx0Ym9yZGVyOiBib3JkZXJTdHlsaW5nLFxuXHRcdFx0XHRcdFx0Ym94U2l6aW5nOiAnYm9yZGVyLWJveCcsXG5cdFx0XHRcdFx0XHRiYWNrZ3JvdW5kQ29sb3I6IGFzQ3NzVmFyaWFibGUobW9kaWZpZWRCYWNrZ3JvdW5kQ29sb3IpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSlcblx0XHRcdF07XG5cdFx0fSkpLmtlZXBVcGRhdGVkKHRoaXMuX3N0b3JlKTtcblx0XHR0aGlzLl9ub25PdmVyZmxvd1ZpZXcgPSBuLmRpdih7XG5cdFx0XHRjbGFzczogJ2lubGluZS1lZGl0cy12aWV3Jyxcblx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHRvdmVyZmxvdzogJ3Zpc2libGUnLFxuXHRcdFx0XHR0b3A6ICcwcHgnLFxuXHRcdFx0XHRsZWZ0OiAnMHB4Jyxcblx0XHRcdFx0ZGlzcGxheTogdGhpcy5fZGlzcGxheSxcblx0XHRcdH0sXG5cdFx0fSwgW1xuXHRcdFx0dGhpcy5fYmFja2dyb3VuZFN2Zyxcblx0XHRcdGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHRoaXMuX3Nob3VsZE92ZXJmbG93LnJlYWQocmVhZGVyKSA/IFtdIDogW3RoaXMuX2VkaXRvckNvbnRhaW5lciwgdGhpcy5fb3JpZ2luYWxPdmVybGF5LCB0aGlzLl9tb2RpZmllZE92ZXJsYXldKSxcblx0XHRdKS5rZWVwVXBkYXRlZCh0aGlzLl9zdG9yZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JPYnMuY3JlYXRlT3ZlcmxheVdpZGdldCh7XG5cdFx0XHRkb21Ob2RlOiB0aGlzLl9ub25PdmVyZmxvd1ZpZXcuZWxlbWVudCxcblx0XHRcdHBvc2l0aW9uOiBjb25zdE9ic2VydmFibGUobnVsbCksXG5cdFx0XHRhbGxvd0VkaXRvck92ZXJmbG93OiBmYWxzZSxcblx0XHRcdG1pbkNvbnRlbnRXaWR0aEluUHg6IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgeCA9IHRoaXMuX3ByZXZpZXdFZGl0b3JMYXlvdXRJbmZvLnJlYWQocmVhZGVyKT8ubWF4Q29udGVudFdpZHRoO1xuXHRcdFx0XHRpZiAoeCA9PT0gdW5kZWZpbmVkKSB7IHJldHVybiAwOyB9XG5cdFx0XHRcdHJldHVybiB4O1xuXHRcdFx0fSksXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5wcmV2aWV3RWRpdG9yLnNldE1vZGVsKHRoaXMuX3ByZXZpZXdUZXh0TW9kZWwpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbGF5b3V0SW5mbyA9IHRoaXMuX3ByZXZpZXdFZGl0b3JMYXlvdXRJbmZvLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghbGF5b3V0SW5mbykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlZGl0b3JSZWN0ID0gbGF5b3V0SW5mby5lZGl0UmVjdC53aXRoTWFyZ2luKC1WRVJUSUNBTF9QQURESU5HLCAtSE9SSVpPTlRBTF9QQURESU5HKTtcblxuXHRcdFx0dGhpcy5wcmV2aWV3RWRpdG9yLmxheW91dCh7IGhlaWdodDogZWRpdG9yUmVjdC5oZWlnaHQsIHdpZHRoOiBsYXlvdXRJbmZvLnByZXZpZXdFZGl0b3JXaWR0aCArIDE1IC8qIE1ha2Ugc3VyZSBlZGl0b3IgZG9lcyBub3Qgc2Nyb2xsIGhvcml6b250YWxseSAqLyB9KTtcblx0XHRcdHRoaXMuX2VkaXRvckNvbnRhaW5lci5lbGVtZW50LnN0eWxlLnRvcCA9IGAke2VkaXRvclJlY3QudG9wfXB4YDtcblx0XHRcdHRoaXMuX2VkaXRvckNvbnRhaW5lci5lbGVtZW50LnN0eWxlLmxlZnQgPSBgJHtlZGl0b3JSZWN0LmxlZnR9cHhgO1xuXHRcdFx0dGhpcy5fZWRpdG9yQ29udGFpbmVyLmVsZW1lbnQuc3R5bGUud2lkdGggPSBgJHtsYXlvdXRJbmZvLnByZXZpZXdFZGl0b3JXaWR0aCArIEhPUklaT05UQUxfUEFERElOR31weGA7IC8vIFNldCB3aWR0aCB0byBjbGlwIHZpZXcgem9uZVxuXHRcdFx0Ly90aGlzLl9lZGl0b3JDb250YWluZXIuZWxlbWVudC5zdHlsZS5ib3JkZXJSYWRpdXMgPSBgMCAke0JPUkRFUl9SQURJVVN9cHggJHtCT1JERVJfUkFESVVTfXB4IDBgO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGxheW91dEluZm8gPSB0aGlzLl9wcmV2aWV3RWRpdG9yTGF5b3V0SW5mby5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWxheW91dEluZm8pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9wcmV2aWV3RWRpdG9yT2JzLmVkaXRvci5zZXRTY3JvbGxMZWZ0KGxheW91dEluZm8uZGVzaXJlZFByZXZpZXdFZGl0b3JTY3JvbGxMZWZ0KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl91cGRhdGVQcmV2aWV3RWRpdG9yLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3BsYXk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcmV2aWV3UmVmO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckNvbnRhaW5lcjtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaXNIb3ZlcmVkO1xuXG5cdHB1YmxpYyByZWFkb25seSBwcmV2aWV3RWRpdG9yO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByZXZpZXdFZGl0b3JPYnM7XG5cblx0cHJpdmF0ZSBfYWN0aXZlVmlld1pvbmVzOiBzdHJpbmdbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfdXBkYXRlUHJldmlld0VkaXRvcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmV2aWV3RWRpdG9yV2lkdGg7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY3Vyc29yUG9zSWZUb3VjaGVzRWRpdDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbFN0YXJ0UG9zaXRpb247XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ2luYWxFbmRQb3NpdGlvbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbFZlcnRpY2FsU3RhcnRQb3NpdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ2luYWxWZXJ0aWNhbEVuZFBvc2l0aW9uO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29yaWdpbmFsRGlzcGxheVJhbmdlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JNYXhDb250ZW50V2lkdGhJblJhbmdlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByZXZpZXdFZGl0b3JMYXlvdXRJbmZvO1xuXG5cdHByaXZhdGUgX3N0aWNreVNjcm9sbENvbnRyb2xsZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0aWNreVNjcm9sbEhlaWdodDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zaG91bGRPdmVyZmxvdztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbEJhY2tncm91bmRDb2xvcjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JCYWNrZ3JvdW5kQ29sb3I7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYmFja2dyb3VuZFN2ZztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbE92ZXJsYXk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kaWZpZWRPdmVybGF5O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX25vbk92ZXJmbG93Vmlldztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBSUEsU0FBUyxHQUFHLFdBQVcsU0FBUztBQUNoQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQStCLFNBQVMsaUJBQWlCLFNBQVMsNEJBQTRCLDJCQUEyQjtBQUN6SCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLCtCQUErQjtBQUV4QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBRXRCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQTJCLDRCQUFpRDtBQUU1RSxTQUFTLDBCQUEwQix1QkFBdUIsd0JBQXdCLHdCQUF3Qiw0QkFBNEIseUJBQXlCLCtCQUErQjtBQUM5TCxTQUFTLGFBQWEsdUJBQXVCLGlCQUFpQixhQUFhLHdCQUF3Qix1Q0FBdUM7QUFDMUksU0FBUyxrQ0FBa0M7QUFFM0MsTUFBTSxxQkFBcUI7QUFDM0IsTUFBTSxtQkFBbUI7QUFDekIsTUFBTSxrQkFBa0I7QUFFeEIsTUFBTSxlQUFlO0FBQ3JCLE1BQU0seUJBQXlCO0FBQy9CLE1BQU0scUNBQXFDO0FBQzNDLE1BQU0sZ0JBQWdCO0FBQ3RCLE1BQU0sdUJBQXVCO0FBQzdCLE1BQU0sdUJBQXVCO0FBRXRCLElBQU0sNEJBQU4sY0FBd0MsV0FBdUM7QUFBQSxFQXVCckYsWUFDa0IsU0FDQSxPQUNBLG1CQUNBLFVBSUEsWUFDdUIsdUJBQ1IsZUFDVSx5QkFDekM7QUFDRCxVQUFNO0FBWlc7QUFDQTtBQUNBO0FBQ0E7QUFJQTtBQUN1QjtBQUNSO0FBQ1U7QUFkM0MsU0FBaUIsY0FBYyxLQUFLLFVBQVUsSUFBSSxRQUE4QixDQUFDO0FBQ2pGLFNBQVMsYUFBYSxLQUFLLFlBQVk7QUFnQnRDLFNBQUssYUFBYSxxQkFBcUIsS0FBSyxPQUFPO0FBQ25ELFNBQUssV0FBVyxRQUFRLE1BQU0sWUFBVSxDQUFDLENBQUMsS0FBSyxTQUFTLEtBQUssTUFBTSxJQUFJLFVBQVUsTUFBTTtBQUN2RixTQUFLLGFBQWEsRUFBRSxJQUFvQjtBQUN4QyxVQUFNLG9CQUFvQixLQUFLLFNBQVMsSUFBSSxPQUFLLEdBQUcsZUFBZSwyQkFBMkIsYUFBYSxxQ0FBcUMsc0JBQXNCO0FBQ3RLLFNBQUssbUJBQW1CLEVBQUUsSUFBSTtBQUFBLE1BQzdCLE9BQU8sQ0FBQyxpQkFBaUI7QUFBQSxNQUN6QixPQUFPLEVBQUUsVUFBVSxZQUFZLFVBQVUsVUFBVSxRQUFRLFVBQVU7QUFBQSxNQUNyRSxhQUFhLE9BQUs7QUFDakIsVUFBRSxlQUFlO0FBQUEsTUFDbEI7QUFBQSxNQUNBLFNBQVMsQ0FBQyxNQUFNO0FBQ2YsYUFBSyxZQUFZLEtBQUsscUJBQXFCLE9BQU8sQ0FBQyxDQUFDO0FBQUEsTUFDckQ7QUFBQSxJQUNELEdBQUc7QUFBQSxNQUNGLEVBQUUsSUFBSSxFQUFFLE9BQU8sV0FBVyxPQUFPLEVBQUUsZUFBZSxPQUFPLEdBQUcsS0FBSyxLQUFLLFdBQVcsQ0FBQztBQUFBLElBQ25GLENBQUMsRUFBRSxZQUFZLEtBQUssTUFBTTtBQUMxQixTQUFLLFlBQVksS0FBSyx3QkFBd0IsbUJBQW1CLEtBQUssaUJBQWlCLFNBQVMsS0FBSyxNQUFNO0FBQzNHLFNBQUssZ0JBQWdCLEtBQUssVUFBVSxLQUFLLHNCQUFzQjtBQUFBLE1BQzlEO0FBQUEsTUFDQSxLQUFLLFdBQVc7QUFBQSxNQUNoQjtBQUFBLFFBQ0MsYUFBYTtBQUFBLFFBQ2IsYUFBYTtBQUFBLFFBQ2IsU0FBUyxFQUFFLFNBQVMsTUFBTTtBQUFBLFFBQzFCLFFBQVE7QUFBQSxVQUNQLGFBQWE7QUFBQSxVQUNiLGNBQWM7QUFBQSxVQUNkLHdCQUF3QjtBQUFBLFVBQ3hCLDRCQUE0QjtBQUFBLFFBQzdCO0FBQUEsUUFDQSxhQUFhO0FBQUE7QUFBQSxRQUNiLFFBQVEsQ0FBQztBQUFBLFFBQ1QsU0FBUyxFQUFFLEtBQUssR0FBRyxRQUFRLEVBQUU7QUFBQSxRQUM3QixTQUFTO0FBQUEsUUFDVCxxQkFBcUI7QUFBQSxRQUNyQixvQkFBb0I7QUFBQSxRQUNwQixpQkFBaUI7QUFBQSxRQUNqQixxQkFBcUI7QUFBQSxRQUNyQixvQkFBb0I7QUFBQSxRQUNwQixzQkFBc0I7QUFBQSxRQUN0QixxQkFBcUI7QUFBQSxRQUNyQiw4QkFBOEI7QUFBQSxRQUM5Qix5QkFBeUIsRUFBRSxTQUFTLE1BQU0sb0NBQW9DLE1BQU07QUFBQSxRQUNwRixzQkFBc0I7QUFBQSxRQUN0QixXQUFXO0FBQUEsVUFDVixVQUFVO0FBQUEsVUFDVixZQUFZO0FBQUEsVUFDWixrQkFBa0I7QUFBQSxRQUNuQjtBQUFBLFFBQ0EsVUFBVTtBQUFBLFFBQ1YsVUFBVTtBQUFBLFFBQ1YsbUJBQW1CO0FBQUEsUUFDbkIsbUJBQW1CO0FBQUEsTUFDcEI7QUFBQSxNQUNBO0FBQUEsUUFDQyxrQkFBa0I7QUFBQSxVQUNqQixDQUFDLDRCQUE0QiwyQkFBMkIsR0FBRyxHQUFHO0FBQUEsUUFDL0Q7QUFBQSxRQUNBLGVBQWUsQ0FBQztBQUFBLE1BQ2pCO0FBQUEsTUFDQSxLQUFLO0FBQUEsSUFDTixDQUFDO0FBQ0QsU0FBSyxvQkFBb0IscUJBQXFCLEtBQUssYUFBYTtBQUNoRSxTQUFLLG1CQUFtQixDQUFDO0FBQ3pCLFNBQUssdUJBQXVCLFFBQVEsTUFBTSxZQUFVO0FBQ25ELFdBQUssaUJBQWlCLFdBQVcsTUFBTTtBQUN2QyxXQUFLLGtCQUFrQixNQUFNLEtBQUssTUFBTTtBQU14QyxXQUFLLFNBQVMsS0FBSyxNQUFNO0FBQ3pCLFVBQUksS0FBSyxrQkFBa0I7QUFDMUIsYUFBSyxpQkFBaUIsUUFBUSxNQUFNLFVBQVUsS0FBSyxTQUFTLEtBQUssTUFBTTtBQUFBLE1BQ3hFO0FBRUEsWUFBTSxVQUFVLEtBQUssU0FBUyxLQUFLLE1BQU07QUFDekMsWUFBTSxPQUFPLEtBQUssTUFBTSxLQUFLLE1BQU07QUFDbkMsVUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNO0FBQ3RCO0FBQUEsTUFDRDtBQUVBLFlBQU0sUUFBUSxLQUFLO0FBRW5CLFlBQU0sY0FBdUIsQ0FBQztBQUM5QixVQUFJLE1BQU0sa0JBQWtCLEdBQUc7QUFDOUIsb0JBQVksS0FBSyxJQUFJLE1BQU0sR0FBRyxHQUFHLE1BQU0sa0JBQWtCLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDL0Q7QUFDQSxVQUFJLE1BQU0sa0JBQWtCLFFBQVEsbUJBQW1CLEtBQUssa0JBQWtCLGFBQWEsSUFBSSxHQUFHO0FBQ2pHLG9CQUFZLEtBQUssSUFBSSxNQUFNLE1BQU0sa0JBQWtCLFFBQVEsa0JBQWtCLEdBQUcsS0FBSyxrQkFBa0IsYUFBYSxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQUEsTUFDOUg7QUFFQSxXQUFLLGNBQWMsZUFBZSxhQUFhLFFBQVcsSUFBSTtBQUc5RCxZQUFNLG9CQUFvQixDQUFDLEdBQUcsS0FBSyxnQkFBZ0I7QUFDbkQsV0FBSyxtQkFBbUIsQ0FBQztBQUV6QixZQUFNLG9CQUFxQixNQUFNLHlCQUF5QixNQUFNLGtCQUFtQixRQUFRO0FBQzNGLFdBQUssY0FBYyxnQkFBZ0IsQ0FBQyxtQkFBbUI7QUFDdEQsMEJBQWtCLFFBQVEsUUFBTSxlQUFlLFdBQVcsRUFBRSxDQUFDO0FBRTdELFlBQUksb0JBQW9CLEdBQUc7QUFDMUIsZUFBSyxpQkFBaUIsS0FBSyxlQUFlLFFBQVE7QUFBQSxZQUNqRCxpQkFBaUIsTUFBTSxrQkFBa0IsUUFBUSxtQkFBbUI7QUFBQSxZQUNwRSxlQUFlO0FBQUEsWUFDZixtQkFBbUI7QUFBQSxZQUNuQixTQUFTLEVBQUUsMENBQTBDO0FBQUEsVUFDdEQsQ0FBQyxDQUFDO0FBQUEsUUFDSDtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUNELFNBQUssc0JBQXNCLFFBQVEsTUFBTSxZQUFVO0FBQ2xELFlBQU0sT0FBTyxLQUFLLE1BQU0sS0FBSyxNQUFNO0FBQ25DLFVBQUksQ0FBQyxNQUFNO0FBQUUsZUFBTztBQUFBLE1BQUc7QUFDdkIsV0FBSyxxQkFBcUIsS0FBSyxNQUFNO0FBRXJDLGFBQU8sdUJBQXVCLEtBQUssbUJBQW1CLEtBQUssbUJBQW1CLE1BQU07QUFBQSxJQUNyRixDQUFDO0FBQ0QsU0FBSywwQkFBMEIsUUFBUSxNQUFNLFlBQVU7QUFDdEQsWUFBTSxZQUFZLEtBQUssV0FBVyxlQUFlLEtBQUssTUFBTTtBQUM1RCxZQUFNLE9BQU8sS0FBSyxNQUFNLEtBQUssTUFBTTtBQUNuQyxVQUFJLENBQUMsUUFBUSxDQUFDLFdBQVc7QUFBRSxlQUFPO0FBQUEsTUFBVztBQUM3QyxhQUFPLEtBQUssa0JBQWtCLFNBQVMsVUFBVSxVQUFVLElBQUksWUFBWTtBQUFBLElBQzVFLENBQUM7QUFDRCxTQUFLLHlCQUF5QixRQUFRLE1BQU0sQ0FBQyxXQUFXO0FBQ3ZELFlBQU0sYUFBYSxLQUFLLE1BQU0sS0FBSyxNQUFNO0FBQ3pDLGFBQU8sYUFBYSxJQUFJLFNBQVMsV0FBVyxrQkFBa0IsaUJBQWlCLENBQUMsSUFBSTtBQUFBLElBQ3JGLENBQUM7QUFDRCxTQUFLLHVCQUF1QixRQUFRLE1BQU0sQ0FBQyxXQUFXO0FBQ3JELFlBQU0sYUFBYSxLQUFLLE1BQU0sS0FBSyxNQUFNO0FBQ3pDLGFBQU8sYUFBYSxJQUFJLFNBQVMsV0FBVyxrQkFBa0Isd0JBQXdCLENBQUMsSUFBSTtBQUFBLElBQzVGLENBQUM7QUFDRCxTQUFLLGlDQUFpQyxLQUFLLFdBQVcsZ0JBQWdCLEtBQUssd0JBQXdCLEtBQUssTUFBTSxFQUFFLElBQUksT0FBSyxHQUFHLENBQUM7QUFDN0gsU0FBSywrQkFBK0IsS0FBSyxXQUFXLGdCQUFnQixLQUFLLHNCQUFzQixLQUFLLE1BQU0sRUFBRSxJQUFJLE9BQUssR0FBRyxDQUFDO0FBQ3pILFNBQUssd0JBQXdCLEtBQUssTUFBTSxJQUFJLE9BQUssR0FBRyxZQUFZO0FBQ2hFLFNBQUssZ0NBQWdDLFFBQVEsTUFBTSxZQUFVO0FBQzVELFlBQU0sdUJBQXVCLEtBQUssc0JBQXNCLEtBQUssTUFBTTtBQUNuRSxVQUFJLENBQUMsc0JBQXNCO0FBQzFCLGVBQU8sZ0JBQWdCLENBQUM7QUFBQSxNQUN6QjtBQUNBLFdBQUssV0FBVyxVQUFVLEtBQUssTUFBTTtBQUlyQyxhQUFPLDJCQUFtQyxNQUFNLENBQUNBLFNBQVEsY0FBYztBQUN0RSxjQUFNLFdBQVcsdUJBQXVCLEtBQUssWUFBWSxzQkFBc0JBLE9BQU07QUFDckYsZUFBTyxLQUFLLElBQUksVUFBVSxhQUFhLENBQUM7QUFBQSxNQUN6QyxDQUFDO0FBQUEsSUFDRixDQUFDLEVBQUUsSUFBSSxDQUFDLEdBQUcsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBRTFCLFVBQU0sdUJBQXVCLGdDQUFnQyxLQUFLLFNBQVMsS0FBSyxNQUFNO0FBRXRGLFNBQUssMkJBQTJCLFFBQVEsTUFBTSxDQUFDLFdBQVc7QUFDekQsWUFBTSxhQUFhLEtBQUssTUFBTSxLQUFLLE1BQU07QUFDekMsVUFBSSxDQUFDLFlBQVk7QUFDaEIsZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLFFBQVEsS0FBSyxTQUFTLEtBQUssTUFBTTtBQUN2QyxVQUFJLENBQUMsT0FBTztBQUNYLGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTSxRQUFRLFdBQVc7QUFFekIsWUFBTSx5QkFBeUIsS0FBSyxXQUFXLFdBQVcsS0FBSyxNQUFNO0FBRXJFLFlBQU0sK0JBQStCLEtBQUssOEJBQThCLEtBQUssTUFBTTtBQUNuRixZQUFNLGVBQWUsS0FBSyxXQUFXLFdBQVcsS0FBSyxNQUFNO0FBQzNELFlBQU0sc0JBQXNCLEtBQUssb0JBQW9CLEtBQUssTUFBTTtBQUNoRSxZQUFNLHlCQUF5QixhQUFhLGVBQWUsYUFBYTtBQUN4RSxZQUFNLDJCQUEyQixxQkFBcUIsS0FBSyxNQUFNO0FBQ2pFLFlBQU0seUJBQXlCLGFBQWEsY0FBYyxhQUFhLGVBQWUseUJBQXlCO0FBQy9HLFlBQU0sK0JBQStCLFVBQVUsS0FBSyxRQUFRLG9CQUFvQixDQUFDLEVBQUUsYUFBYTtBQUNoRyxZQUFNLDhCQUE4QixVQUFVLEtBQUssUUFBUSxvQkFBb0IsQ0FBQyxFQUFFLGFBQWEseUJBQXlCO0FBQ3hILFlBQU0sc0JBQXNCLEtBQUssSUFBSSxhQUFhLGVBQWUsS0FBSyxxQkFBcUIsR0FBRztBQUM5RixZQUFNLHlCQUF5QjtBQUMvQixZQUFNLHdCQUF3Qix5QkFBeUI7QUFFdkQsWUFBTSxZQUFZLEtBQUssd0JBQXdCLEtBQUssTUFBTTtBQUUxRCxZQUFNLHVCQUF1QixLQUFLO0FBQUE7QUFBQSxRQUVqQyx5QkFBeUIseUJBQXlCLHlCQUF5QixLQUFLLElBQUksR0FBRyxzQkFBc0IscUJBQXFCO0FBQUE7QUFBQSxRQUVsSSxLQUFLO0FBQUEsVUFDSixZQUFZLGdCQUFnQixLQUFLLFlBQVksV0FBVyxNQUFNLElBQUksS0FBSztBQUFBLFVBQ3ZFLHlCQUF5QjtBQUFBLFFBQzFCO0FBQUEsTUFDRDtBQUNBLFlBQU0sOEJBQThCLEtBQUssSUFBSSwrQkFBK0Isc0JBQXNCLG9CQUFvQjtBQUV0SCxZQUFNLGtCQUFrQiwrQkFBK0IsdUJBQXVCLHNCQUFzQjtBQUVwRyxZQUFNLE9BQU8sdUJBQXVCO0FBRXBDLFVBQUk7QUFDSixVQUFJO0FBQ0osVUFBSSw4QkFBOEIsd0JBQXdCO0FBQ3pELHlDQUFpQztBQUNqQyxvQkFBWSxhQUFhLGNBQWMsOEJBQThCO0FBQUEsTUFDdEUsT0FBTztBQUNOLHlDQUFpQyx5QkFBeUI7QUFDMUQsb0JBQVksYUFBYTtBQUFBLE1BQzFCO0FBRUEsWUFBTSxlQUFlLEtBQUssK0JBQStCLEtBQUssTUFBTSxLQUFLLEtBQUssUUFBUSxvQkFBb0IsTUFBTSxlQUFlLElBQUksS0FBSyxXQUFXLFVBQVUsS0FBSyxNQUFNO0FBQ3hLLFlBQU0sa0JBQWtCLEtBQUssNkJBQTZCLEtBQUssTUFBTSxLQUFLLEtBQUssUUFBUSx1QkFBdUIsTUFBTSx5QkFBeUIsQ0FBQyxJQUFJLEtBQUssV0FBVyxVQUFVLEtBQUssTUFBTTtBQUd2TCxZQUFNLFdBQVcsYUFBYSxjQUFjO0FBRTVDLFVBQUksV0FBVyxLQUFLLHVCQUF1QixVQUFVLGNBQWMsV0FBVyxlQUFlO0FBQzdGLFlBQU0sY0FBYyxTQUFTLFdBQVc7QUFDeEMsVUFBSSxDQUFDLGFBQWE7QUFDakIsbUJBQVcsU0FBUyxXQUFXLGtCQUFrQixrQkFBa0I7QUFBQSxNQUNwRTtBQUVBLFlBQU0scUJBQXFCLEtBQUssa0JBQWtCLCtCQUErQixXQUFXLGlCQUFpQixFQUFFLEtBQUssTUFBTTtBQUMxSCxZQUFNLGFBQWEsbUJBQW1CLE9BQU8sQ0FBQyxLQUFLLE1BQU0sTUFBTSxHQUFHLENBQUM7QUFDbkUsWUFBTSxhQUFhLGtCQUFrQjtBQUNyQyxZQUFNLHNCQUFzQixLQUFLLElBQUksWUFBWSxVQUFVO0FBRTNELFlBQU0sVUFBVSxTQUFTO0FBQ3pCLFlBQU0sZUFBZTtBQUNyQixZQUFNLHFCQUFxQixLQUFLLElBQUksc0JBQXNCLHNCQUFzQiw4QkFBOEIsYUFBYSxRQUFRLGFBQWEsY0FBYyxZQUFZO0FBRTFLLFVBQUksV0FBVyxLQUFLLHVCQUF1QixTQUFTLFFBQVEsY0FBYyxjQUFjLG9CQUFvQixtQkFBbUI7QUFDL0gsVUFBSSxDQUFDLGFBQWE7QUFDakIsbUJBQVcsU0FBUyxXQUFXLGtCQUFrQixrQkFBa0IsRUFBRSxXQUFXLHFCQUFxQixZQUFZO0FBQUEsTUFDbEgsT0FBTztBQUVOLG1CQUFXLFNBQVMsV0FBVyxrQkFBa0Isa0JBQWtCLEVBQUUsV0FBVyxnQkFBZ0I7QUFBQSxNQUNqRztBQUlBLGFBQU87QUFBQSxRQUNOO0FBQUEsUUFDQTtBQUFBLFFBQ0EsZ0JBQWdCO0FBQUEsUUFDaEIsYUFBYSxhQUFhO0FBQUEsUUFFMUI7QUFBQSxRQUNBO0FBQUEsUUFDQSxrQkFBa0I7QUFBQSxRQUNsQjtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQ0QsU0FBSywwQkFBMEIsdUJBQXVCLElBQUksS0FBSyxXQUFXLE1BQU07QUFDaEYsU0FBSyxzQkFBc0IsS0FBSywwQkFBMEIsb0JBQW9CLEtBQUssd0JBQXdCLCtCQUErQixNQUFNLEtBQUssd0JBQXlCLHdCQUF3QixJQUFJLGdCQUFnQixDQUFDO0FBQzNOLFNBQUssa0JBQWtCLFFBQVEsTUFBTSxZQUFVO0FBQzlDLFVBQUksQ0FBQyxpQkFBaUI7QUFDckIsZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLFFBQVEsS0FBSyxNQUFNLEtBQUssTUFBTSxHQUFHO0FBQ3ZDLFVBQUksQ0FBQyxPQUFPO0FBQ1gsZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLHFCQUFxQixLQUFLLG9CQUFvQixLQUFLLE1BQU07QUFDL0QsWUFBTSxNQUFNLEtBQUssUUFBUSxvQkFBb0IsTUFBTSxlQUFlLElBQUksS0FBSyxXQUFXLFVBQVUsS0FBSyxNQUFNO0FBQzNHLFVBQUksT0FBTyxvQkFBb0I7QUFDOUIsZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLFNBQVMsS0FBSyxRQUFRLG9CQUFvQixNQUFNLHNCQUFzQixJQUFJLEtBQUssV0FBVyxVQUFVLEtBQUssTUFBTTtBQUNySCxVQUFJLFVBQVUsS0FBSyxXQUFXLFdBQVcsS0FBSyxNQUFNLEVBQUUsUUFBUTtBQUM3RCxlQUFPO0FBQUEsTUFDUjtBQUNBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFDRCxTQUFLLDJCQUEyQixvQkFBb0IsTUFBTSxLQUFLLGNBQWMsdUJBQXVCLE1BQU07QUFDekcsYUFBTyxLQUFLLGNBQWMsY0FBYyxFQUFFLFNBQVMsdUJBQXVCLEtBQUssTUFBTTtBQUFBLElBQ3RGLENBQUM7QUFDRCxTQUFLLHlCQUF5QixLQUFLLFNBQVMsSUFBSSxPQUFLO0FBQ3BELGFBQU8seUJBQXlCLEdBQUcsY0FBYywyQkFBMkIsVUFBVTtBQUFBLElBQ3ZGLENBQUM7QUFDRCxTQUFLLGlCQUFpQixFQUFFLElBQUk7QUFBQSxNQUMzQixXQUFXO0FBQUEsTUFDWCxPQUFPLEVBQUUsVUFBVSxXQUFXLGVBQWUsUUFBUSxVQUFVLFdBQVc7QUFBQSxJQUMzRSxHQUFHO0FBQUEsTUFDRixFQUFFLFFBQVEsUUFBUTtBQUFBLFFBQ2pCLE9BQU87QUFBQSxRQUNQLEdBQUcsUUFBUSxNQUFNLFlBQVU7QUFDMUIsZ0JBQU0sYUFBYSxLQUFLLHlCQUF5QixLQUFLLE1BQU07QUFDNUQsY0FBSSxDQUFDLFlBQVk7QUFDaEIsbUJBQU87QUFBQSxVQUNSO0FBQ0EsZ0JBQU1DLDJCQUEwQixLQUFLLHlCQUF5QixLQUFLLE1BQU07QUFDekUsY0FBSUEseUJBQXdCLGNBQWMsR0FBRztBQUM1QyxtQkFBTztBQUFBLFVBQ1I7QUFFQSxpQkFBTyxJQUFJLFlBQVksRUFDckIsT0FBTyxXQUFXLFNBQVMsWUFBWSxDQUFDLEVBQ3hDLE9BQU8sV0FBVyxTQUFTLFlBQVksRUFBRSxPQUFPLEdBQUksQ0FBQyxFQUNyRCxPQUFPLFdBQVcsU0FBUyxlQUFlLEVBQUUsT0FBTyxHQUFJLENBQUMsRUFDeEQsT0FBTyxXQUFXLFNBQVMsZUFBZSxDQUFDLEVBQzNDLE1BQU07QUFBQSxRQUNULENBQUM7QUFBQSxRQUNELE9BQU87QUFBQSxVQUNOLE1BQU0sS0FBSztBQUFBLFFBQ1o7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGLENBQUMsRUFBRSxZQUFZLEtBQUssTUFBTTtBQUMxQixTQUFLLG1CQUFtQixFQUFFLElBQUk7QUFBQSxNQUM3QixPQUFPLEVBQUUsZUFBZSxRQUFRLFNBQVMsS0FBSyx5QkFBeUIsSUFBSSxnQkFBYyxZQUFZLGNBQWMsU0FBUyxPQUFPLEVBQUU7QUFBQSxJQUN0SSxHQUFHLFFBQVEsTUFBTSxZQUFVO0FBQzFCLFlBQU0sZ0JBQWdCLFlBQVksS0FBSyx3QkFBd0IsRUFBRSxLQUFLLE1BQU07QUFDNUUsVUFBSSxDQUFDLGVBQWU7QUFBRSxlQUFPO0FBQUEsTUFBVztBQUV4QyxZQUFNLG1CQUFtQixLQUFLLHVCQUF1QixLQUFLLE1BQU07QUFFaEUsWUFBTSxpQkFBaUIsa0JBQWtCLEtBQUssTUFBTTtBQUNwRCxZQUFNLGdCQUFnQix1QkFBdUIsS0FBSyxVQUFVLEVBQUUsSUFBSSxRQUFNLEdBQUcsWUFBWSxZQUFZLGNBQWMsRUFBRSxDQUFDLEVBQUU7QUFDdEgsWUFBTSx5QkFBeUIsR0FBRyxlQUFlLGNBQWMsWUFBWSxnQkFBZ0I7QUFFM0YsWUFBTSxnQkFBZ0IsY0FBYyxLQUFLLE1BQU0sRUFBRSxtQkFBbUI7QUFDcEUsWUFBTSxrQkFBa0IsY0FBYyxJQUFJLGdCQUFjLFdBQVcsU0FBUyxTQUFTLFdBQVcsU0FBUyxNQUFNO0FBQy9HLFlBQU0scUJBQXFCLGdCQUFnQixJQUFJLGVBQWU7QUFJOUQsWUFBTSxlQUFlLGNBQWMsSUFBSSxnQkFBYyxLQUFLO0FBQUEsUUFDekQsV0FBVyxjQUFjLGdCQUFnQjtBQUFBLFFBQ3pDLFdBQVcsU0FBUztBQUFBLFFBQ3BCLFdBQVc7QUFBQSxRQUNYLFdBQVcsU0FBUyxTQUFTO0FBQUEsTUFDOUIsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUVkLFlBQU0sbUJBQW1CLElBQUksWUFBWSxhQUFhLE1BQU0sT0FBTyxnQkFBZ0I7QUFDbkYsWUFBTSxjQUFjLGNBQWMsSUFBSSxnQkFBYyxXQUFXLFNBQVMsb0JBQW9CLGdCQUFnQixDQUFDO0FBQzdHLFlBQU0sZ0JBQWdCLFlBQVksSUFBSSxDQUFBQyxpQkFBZUEsYUFBWSxXQUFXLGdCQUFnQixHQUFHLGdCQUFnQixjQUFjLEVBQUUsb0JBQW9CLGdCQUFnQixDQUFDO0FBRXBLLFlBQU0saUJBQWlCLFlBQVksSUFBSSxDQUFBQSxpQkFBZSxLQUFLLHVCQUF1QkEsYUFBWSxRQUFRLHFCQUFxQixjQUFjQSxhQUFZLFNBQVMsY0FBYyxvQkFBb0Isa0JBQWtCLEVBQUUsb0JBQW9CLGdCQUFnQixDQUFDO0FBRXpQLGFBQU87QUFBQSxRQUNOLEVBQUUsSUFBSTtBQUFBLFVBQ0wsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFlBQ04sR0FBRyxjQUFjLEtBQUssTUFBTSxFQUFFLFNBQVM7QUFBQSxZQUN2QyxXQUFXO0FBQUEsWUFDWCxjQUFjLEdBQUcsYUFBYSxVQUFVLGFBQWE7QUFBQSxZQUNyRCxXQUFXO0FBQUEsWUFDWCxjQUFjO0FBQUEsWUFDZCxZQUFZLGdCQUFnQixTQUFTO0FBQUEsVUFDdEM7QUFBQSxRQUNELENBQUM7QUFBQSxRQUVELEVBQUUsSUFBSTtBQUFBLFVBQ0wsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFlBQ04sR0FBRyxZQUFZLEtBQUssTUFBTSxFQUFFLFNBQVM7QUFBQSxZQUNyQyxXQUFXO0FBQUEsWUFDWCxjQUFjLEdBQUcsYUFBYSxVQUFVLGFBQWE7QUFBQSxZQUNyRCxXQUFXO0FBQUEsWUFDWCxjQUFjO0FBQUEsWUFDZCxZQUFZLGdCQUFnQixTQUFTO0FBQUEsWUFDckMsaUJBQWlCLGNBQWMsdUJBQXVCO0FBQUEsVUFDdkQ7QUFBQSxRQUNELENBQUM7QUFBQSxRQUVELEVBQUUsSUFBSTtBQUFBLFVBQ0wsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFlBQ04sZUFBZTtBQUFBLFlBQ2YsU0FBUyxnQkFBZ0IsSUFBSSxhQUFXLFVBQVUsVUFBVSxNQUFNO0FBQUEsWUFDbEUsR0FBRyxlQUFlLEtBQUssTUFBTSxFQUFFLFNBQVM7QUFBQSxVQUN6QztBQUFBLFFBQ0QsR0FBRztBQUFBLFVBQ0YsRUFBRSxJQUFJO0FBQUEsWUFDTCxPQUFPO0FBQUEsWUFDUCxPQUFPO0FBQUEsY0FDTixVQUFVO0FBQUEsY0FBWSxLQUFLO0FBQUEsY0FBTyxNQUFNO0FBQUEsY0FBTyxPQUFPO0FBQUEsY0FBUSxRQUFRO0FBQUEsY0FDdEUsaUJBQWlCLHNCQUFzQix5QkFBeUIsS0FBSyxhQUFhLEVBQUUsSUFBSSxPQUFLLEVBQUUsU0FBUyxDQUFDO0FBQUEsWUFDMUc7QUFBQSxVQUNELENBQUM7QUFBQSxVQUNELEVBQUUsSUFBSTtBQUFBLFlBQ0wsT0FBTztBQUFBLFlBQ1AsT0FBTztBQUFBLGNBQ04sVUFBVTtBQUFBLGNBQVksS0FBSztBQUFBLGNBQU8sTUFBTTtBQUFBLGNBQU8sT0FBTztBQUFBLGNBQVEsUUFBUTtBQUFBLGNBQ3RFLFdBQVc7QUFBQSxjQUNYLFdBQVc7QUFBQSxjQUNYLGFBQWE7QUFBQSxjQUNiLGNBQWM7QUFBQSxjQUNkLGlCQUFpQjtBQUFBLFlBQ2xCO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRixDQUFDO0FBQUEsUUFDRCxFQUFFLElBQUk7QUFBQSxVQUNMLE9BQU87QUFBQSxVQUNQLE9BQU87QUFBQSxZQUNOLEdBQUcsYUFBYSxTQUFTO0FBQUEsWUFDekIsaUJBQWlCO0FBQUEsVUFDbEI7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUFDLENBQUMsRUFBRSxZQUFZLEtBQUssTUFBTTtBQUMzQixTQUFLLG1CQUFtQixFQUFFLElBQUk7QUFBQSxNQUM3QixPQUFPLEVBQUUsZUFBZSxPQUFRO0FBQUEsSUFDakMsR0FBRyxRQUFRLE1BQU0sWUFBVTtBQUMxQixZQUFNLGdCQUFnQixZQUFZLEtBQUssd0JBQXdCLEVBQUUsS0FBSyxNQUFNO0FBQzVFLFVBQUksQ0FBQyxlQUFlO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFFeEMsWUFBTSxrQkFBa0IsY0FBYyxJQUFJLGdCQUFjLFdBQVcsU0FBUyxTQUFTLFdBQVcsU0FBUyxNQUFNO0FBQy9HLFlBQU0sbUJBQW1CLEtBQUssdUJBQXVCLEtBQUssTUFBTTtBQUVoRSxZQUFNLGlCQUFpQixrQkFBa0IsS0FBSyxNQUFNO0FBQ3BELFlBQU0sZUFBZSxnQkFBZ0IsSUFBSSxhQUFXLEtBQUssYUFBYSxNQUFNLGFBQWEsTUFBTSxVQUFVLGdCQUFnQixDQUFDLElBQUk7QUFDOUgsWUFBTSxnQkFBZ0Isc0JBQXNCLHVCQUF1QixLQUFLLFVBQVUsR0FBRyxLQUFLLGFBQWEsRUFBRSxJQUFJLE9BQUssYUFBYSxFQUFFLFNBQVMsQ0FBQyxFQUFFO0FBQzdJLFlBQU0seUJBQXlCLEdBQUcsZUFBZSxjQUFjLFlBQVksZ0JBQWdCO0FBRTNGLFlBQU0sY0FBYyxjQUFjLElBQUksZ0JBQWMsV0FBVyxTQUFTLFdBQVcsR0FBRyxZQUFZLENBQUM7QUFDbkcsWUFBTSxnQkFBZ0IsWUFBWSxJQUFJLENBQUFBLGlCQUFlQSxhQUFZLFdBQVcsZ0JBQWdCLGdCQUFnQixnQkFBZ0IsQ0FBQyxDQUFDO0FBRTlILFlBQU0sZ0JBQWdCLFFBQVEsTUFBTSxDQUFBRixZQUFVO0FBQzdDLGNBQU0sVUFBVSxZQUFZLEtBQUtBLE9BQU07QUFDdkMsY0FBTSxhQUFhLGNBQWMsS0FBS0EsT0FBTTtBQUM1QyxZQUFJLENBQUMsV0FBVyxlQUFlLFdBQVcsZUFBZSxRQUFRLE1BQU07QUFDdEUsaUJBQU8sS0FBSyx1QkFBdUIsUUFBUSxNQUFNLFFBQVEsS0FBSyxHQUFHLENBQUM7QUFBQSxRQUNuRTtBQUNBLGVBQU8sSUFBSSxLQUFLLFdBQVcsYUFBYSxRQUFRLEtBQUssUUFBUSxNQUFNLFFBQVEsTUFBTSxlQUFlLENBQUM7QUFBQSxNQUNsRyxDQUFDO0FBRUQsYUFBTztBQUFBLFFBQ04sRUFBRSxJQUFJO0FBQUEsVUFDTCxPQUFPO0FBQUEsVUFDUCxPQUFPO0FBQUEsWUFDTixHQUFHLGNBQWMsS0FBSyxNQUFNLEVBQUUsU0FBUztBQUFBLFlBQ3ZDLGlCQUFpQix1QkFBdUIsS0FBSyxVQUFVLEVBQUUsSUFBSSxPQUFLLGNBQWMsQ0FBQyxDQUFDO0FBQUEsVUFDbkY7QUFBQSxRQUNELENBQUM7QUFBQSxRQUNELEVBQUUsSUFBSTtBQUFBLFVBQ0wsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFlBQ04sR0FBRyxjQUFjLEtBQUssTUFBTSxFQUFFLFNBQVM7QUFBQSxZQUN2QztBQUFBLFlBQ0EsV0FBVztBQUFBLFlBQ1gsY0FBYztBQUFBLFlBQ2QsYUFBYTtBQUFBLFlBQ2IsV0FBVztBQUFBLFVBQ1o7QUFBQSxRQUNELENBQUM7QUFBQSxRQUNELEVBQUUsSUFBSTtBQUFBLFVBQ0wsT0FBTztBQUFBLFVBQ1AsT0FBTztBQUFBLFlBQ04sR0FBRyxZQUFZLEtBQUssTUFBTSxFQUFFLFNBQVM7QUFBQSxZQUNyQztBQUFBLFlBQ0EsUUFBUTtBQUFBLFlBQ1IsV0FBVztBQUFBLFlBQ1gsaUJBQWlCLGNBQWMsdUJBQXVCO0FBQUEsVUFDdkQ7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUFDLENBQUMsRUFBRSxZQUFZLEtBQUssTUFBTTtBQUMzQixTQUFLLG1CQUFtQixFQUFFLElBQUk7QUFBQSxNQUM3QixPQUFPO0FBQUEsTUFDUCxPQUFPO0FBQUEsUUFDTixVQUFVO0FBQUEsUUFDVixVQUFVO0FBQUEsUUFDVixLQUFLO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFDTixTQUFTLEtBQUs7QUFBQSxNQUNmO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixLQUFLO0FBQUEsTUFDTCxRQUFRLE1BQU0sWUFBVSxLQUFLLGdCQUFnQixLQUFLLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLGtCQUFrQixLQUFLLGtCQUFrQixLQUFLLGdCQUFnQixDQUFDO0FBQUEsSUFDdkksQ0FBQyxFQUFFLFlBQVksS0FBSyxNQUFNO0FBRTFCLFNBQUssVUFBVSxLQUFLLFdBQVcsb0JBQW9CO0FBQUEsTUFDbEQsU0FBUyxLQUFLLGlCQUFpQjtBQUFBLE1BQy9CLFVBQVUsZ0JBQWdCLElBQUk7QUFBQSxNQUM5QixxQkFBcUI7QUFBQSxNQUNyQixxQkFBcUIsUUFBUSxNQUFNLFlBQVU7QUFDNUMsY0FBTSxJQUFJLEtBQUsseUJBQXlCLEtBQUssTUFBTSxHQUFHO0FBQ3RELFlBQUksTUFBTSxRQUFXO0FBQUUsaUJBQU87QUFBQSxRQUFHO0FBQ2pDLGVBQU87QUFBQSxNQUNSLENBQUM7QUFBQSxJQUNGLENBQUMsQ0FBQztBQUVGLFNBQUssY0FBYyxTQUFTLEtBQUssaUJBQWlCO0FBRWxELFNBQUssVUFBVSxRQUFRLFlBQVU7QUFDaEMsWUFBTSxhQUFhLEtBQUsseUJBQXlCLEtBQUssTUFBTTtBQUM1RCxVQUFJLENBQUMsWUFBWTtBQUNoQjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLGFBQWEsV0FBVyxTQUFTLFdBQVcsQ0FBQyxrQkFBa0IsQ0FBQyxrQkFBa0I7QUFFeEYsV0FBSyxjQUFjLE9BQU87QUFBQSxRQUFFLFFBQVEsV0FBVztBQUFBLFFBQVEsT0FBTyxXQUFXLHFCQUFxQjtBQUFBO0FBQUEsTUFBdUQsQ0FBQztBQUN0SixXQUFLLGlCQUFpQixRQUFRLE1BQU0sTUFBTSxHQUFHLFdBQVcsR0FBRztBQUMzRCxXQUFLLGlCQUFpQixRQUFRLE1BQU0sT0FBTyxHQUFHLFdBQVcsSUFBSTtBQUM3RCxXQUFLLGlCQUFpQixRQUFRLE1BQU0sUUFBUSxHQUFHLFdBQVcscUJBQXFCLGtCQUFrQjtBQUFBLElBRWxHLENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxRQUFRLFlBQVU7QUFDaEMsWUFBTSxhQUFhLEtBQUsseUJBQXlCLEtBQUssTUFBTTtBQUM1RCxVQUFJLENBQUMsWUFBWTtBQUNoQjtBQUFBLE1BQ0Q7QUFFQSxXQUFLLGtCQUFrQixPQUFPLGNBQWMsV0FBVyw4QkFBOEI7QUFBQSxJQUN0RixDQUFDLENBQUM7QUFFRixTQUFLLHFCQUFxQiw4QkFBOEIsS0FBSyxNQUFNO0FBQUEsRUFDcEU7QUFBQTtBQUFBLEVBN2hCQSxPQUFPLG1CQUFtQixRQUFxQixXQUF1QixNQUE2QixRQUEwQjtBQUM1SCxVQUFNLFlBQVkscUJBQXFCLE1BQU07QUFDN0MsVUFBTSxjQUFjLFVBQVUsZ0JBQWdCLEtBQUssTUFBTTtBQUN6RCxVQUFNLG9CQUFvQixVQUFVLHNCQUFzQixLQUFLLE1BQU07QUFDckUsVUFBTSwwQkFBMEIsT0FBTyxjQUFjLEVBQUU7QUFDdkQsVUFBTSxlQUFlLFVBQVUsa0JBQWtCLEtBQUssTUFBTSxFQUFFLGdCQUFnQixJQUFJLFVBQVUsa0JBQWtCLEtBQUssTUFBTSxFQUFFLGVBQWU7QUFFMUksVUFBTSxxQkFBcUI7QUFBQSxNQUF1QjtBQUFBLE1BQVcsS0FBSztBQUFBLE1BQWM7QUFBQTtBQUFBLElBQTJEO0FBQzNJLFVBQU0scUJBQXFCLEtBQUssU0FBUyxTQUFTLE9BQU8sQ0FBQyxLQUFLLFNBQVMsS0FBSyxJQUFJLEtBQUssc0JBQXNCLE1BQU0sUUFBUSxTQUFTLENBQUMsR0FBRyxDQUFDO0FBQ3hJLFVBQU0sa0JBQWtCO0FBQ3hCLFVBQU0sa0JBQWtCLHVCQUF1QixJQUFJO0FBRW5ELFdBQU8scUJBQXFCLHFCQUFxQixrQkFBa0Isa0JBQWtCLGNBQWMsb0JBQW9CLDBCQUEwQjtBQUFBLEVBQ2xKO0FBaWtCRDtBQWpsQmEsNEJBQU47QUFBQSxFQWdDSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FsQ1U7IiwKICAibmFtZXMiOiBbInJlYWRlciIsICJvcmlnaW5hbEJhY2tncm91bmRDb2xvciIsICJvdmVybGF5UmVjdCJdCn0K
