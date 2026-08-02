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
import { n } from "../../../../../../../base/browser/dom.js";
import { renderIcon } from "../../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { BugIndicatingError } from "../../../../../../../base/common/errors.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { autorun, constObservable, debouncedObservable, derived, observableFromEvent, observableValue, runOnChange } from "../../../../../../../base/common/observable.js";
import { IAccessibilityService } from "../../../../../../../platform/accessibility/common/accessibility.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../../../../platform/theme/common/themeService.js";
import { Point } from "../../../../../../common/core/2d/point.js";
import { Rect } from "../../../../../../common/core/2d/rect.js";
import { EditorOption, RenderLineNumbersType } from "../../../../../../common/config/editorOptions.js";
import { OffsetRange } from "../../../../../../common/core/ranges/offsetRange.js";
import { StickyScrollController } from "../../../../../stickyScroll/browser/stickyScrollController.js";
import { InlineEditTabAction } from "../inlineEditsViewInterface.js";
import { getEditorBlendedColor, INLINE_EDITS_BORDER_RADIUS, inlineEditIndicatorBackground, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorPrimaryBorder, inlineEditIndicatorPrimaryForeground, inlineEditIndicatorSecondaryBackground, inlineEditIndicatorSecondaryBorder, inlineEditIndicatorSecondaryForeground, inlineEditIndicatorSuccessfulBackground, inlineEditIndicatorSuccessfulBorder, inlineEditIndicatorSuccessfulForeground } from "../theme.js";
import { mapOutFalsy, rectToProps } from "../utils/utils.js";
import { GutterIndicatorMenuContent } from "./gutterIndicatorMenu.js";
import { assertNever } from "../../../../../../../base/common/assert.js";
import { localize } from "../../../../../../../nls.js";
import { asCssVariable } from "../../../../../../../platform/theme/common/colorUtils.js";
import { IUserInteractionService } from "../../../../../../../platform/userInteraction/browser/userInteractionService.js";
import { Emitter } from "../../../../../../../base/common/event.js";
class InlineEditsGutterIndicatorData {
  constructor(gutterMenuData, originalRange, model, altAction, customization) {
    this.gutterMenuData = gutterMenuData;
    this.originalRange = originalRange;
    this.model = model;
    this.altAction = altAction;
    this.customization = customization;
  }
}
class InlineSuggestionGutterMenuData {
  constructor(action, displayName, extensionCommands, alternativeAction, modelInfo, setModelId, extensionCommandsOnly = false) {
    this.action = action;
    this.displayName = displayName;
    this.extensionCommands = extensionCommands;
    this.alternativeAction = alternativeAction;
    this.modelInfo = modelInfo;
    this.setModelId = setModelId;
    this.extensionCommandsOnly = extensionCommandsOnly;
  }
  static fromInlineSuggestion(suggestion) {
    const alternativeAction = suggestion.action?.kind === "edit" ? suggestion.action.alternativeAction : void 0;
    const commands = suggestion.source.inlineSuggestions.commands ?? [];
    return new InlineSuggestionGutterMenuData(
      suggestion.gutterMenuLinkAction,
      suggestion.source.provider.displayName ?? localize("inlineSuggestion", "Inline Suggestion"),
      commands.length > 0 ? [commands] : [],
      alternativeAction,
      suggestion.source.provider.modelInfo,
      suggestion.source.provider.setModelId?.bind(suggestion.source.provider)
    );
  }
}
class SimpleInlineSuggestModel {
  constructor(accept, jump) {
    this.accept = accept;
    this.jump = jump;
  }
  static fromInlineCompletionModel(model) {
    return new SimpleInlineSuggestModel(
      () => model.accept(),
      () => model.jump()
    );
  }
}
const CODICON_SIZE_PX = 16;
const CODICON_PADDING_PX = 2;
let InlineEditsGutterIndicator = class extends Disposable {
  constructor(_editorObs, _data, _tabAction, _verticalOffset, _isHoveringOverInlineEdit, _focusIsInMenu, _hoverService, _instantiationService, _accessibilityService, _themeService, _userInteractionService) {
    super();
    this._editorObs = _editorObs;
    this._data = _data;
    this._tabAction = _tabAction;
    this._verticalOffset = _verticalOffset;
    this._isHoveringOverInlineEdit = _isHoveringOverInlineEdit;
    this._focusIsInMenu = _focusIsInMenu;
    this._hoverService = _hoverService;
    this._instantiationService = _instantiationService;
    this._accessibilityService = _accessibilityService;
    this._themeService = _themeService;
    this._userInteractionService = _userInteractionService;
    this._onDidCloseWithCommand = this._register(new Emitter());
    this.onDidCloseWithCommand = this._onDidCloseWithCommand.event;
    this._modifierPressed = derived(
      this,
      (reader) => this._userInteractionService.readModifierKeyStatus(this._editorObs.editor.getDomNode(), reader).shiftKey
    );
    this._gutterIndicatorStyles = derived(this, (reader) => {
      let v = this._tabAction.read(reader);
      const altAction = this._data.read(reader)?.altAction;
      const modifiedPressed = this._modifierPressed.read(reader);
      if (altAction && modifiedPressed) {
        v = InlineEditTabAction.Inactive;
      }
      switch (v) {
        case InlineEditTabAction.Inactive:
          return {
            background: getEditorBlendedColor(inlineEditIndicatorSecondaryBackground, this._themeService).read(reader).toString(),
            foreground: getEditorBlendedColor(inlineEditIndicatorSecondaryForeground, this._themeService).read(reader).toString(),
            border: getEditorBlendedColor(inlineEditIndicatorSecondaryBorder, this._themeService).read(reader).toString()
          };
        case InlineEditTabAction.Jump:
          return {
            background: getEditorBlendedColor(inlineEditIndicatorPrimaryBackground, this._themeService).read(reader).toString(),
            foreground: getEditorBlendedColor(inlineEditIndicatorPrimaryForeground, this._themeService).read(reader).toString(),
            border: getEditorBlendedColor(inlineEditIndicatorPrimaryBorder, this._themeService).read(reader).toString()
          };
        case InlineEditTabAction.Accept:
          return {
            background: getEditorBlendedColor(inlineEditIndicatorSuccessfulBackground, this._themeService).read(reader).toString(),
            foreground: getEditorBlendedColor(inlineEditIndicatorSuccessfulForeground, this._themeService).read(reader).toString(),
            border: getEditorBlendedColor(inlineEditIndicatorSuccessfulBorder, this._themeService).read(reader).toString()
          };
        default:
          assertNever(v);
      }
    });
    this._state = derived(this, (reader) => {
      const range = this._originalRangeObs.read(reader);
      if (!range) {
        return void 0;
      }
      return {
        range,
        lineOffsetRange: this._editorObs.observeLineOffsetRange(range, reader.store)
      };
    });
    this._lineNumberToRender = derived(this, (reader) => {
      if (this._verticalOffset.read(reader) !== 0) {
        return "";
      }
      const lineNumber = this._data.read(reader)?.originalRange.startLineNumber;
      const lineNumberOptions = this._editorObs.getOption(EditorOption.lineNumbers).read(reader);
      if (lineNumber === void 0 || lineNumberOptions.renderType === RenderLineNumbersType.Off) {
        return "";
      }
      if (lineNumberOptions.renderType === RenderLineNumbersType.Interval) {
        const cursorPosition = this._editorObs.cursorPosition.read(reader);
        if (lineNumber % 10 === 0 || cursorPosition && cursorPosition.lineNumber === lineNumber) {
          return lineNumber.toString();
        }
        return "";
      }
      if (lineNumberOptions.renderType === RenderLineNumbersType.Relative) {
        const cursorPosition = this._editorObs.cursorPosition.read(reader);
        if (!cursorPosition) {
          return "";
        }
        const relativeLineNumber = Math.abs(lineNumber - cursorPosition.lineNumber);
        if (relativeLineNumber === 0) {
          return lineNumber.toString();
        }
        return relativeLineNumber.toString();
      }
      if (lineNumberOptions.renderType === RenderLineNumbersType.Custom) {
        if (lineNumberOptions.renderFn) {
          return lineNumberOptions.renderFn(lineNumber);
        }
        return "";
      }
      return lineNumber.toString();
    });
    this._availableWidthForIcon = derived(this, (reader) => {
      const textModel = this._editorObs.editor.getModel();
      const editor = this._editorObs.editor;
      const layout = this._editorObs.layoutInfo.read(reader);
      const gutterWidth = layout.decorationsLeft + layout.decorationsWidth - layout.glyphMarginLeft;
      if (!textModel || gutterWidth <= 0) {
        return () => 0;
      }
      if (layout.lineNumbersLeft === 0) {
        return () => gutterWidth;
      }
      const lineNumberOptions = this._editorObs.getOption(EditorOption.lineNumbers).read(reader);
      if (lineNumberOptions.renderType === RenderLineNumbersType.Relative || /* likely to flicker */
      lineNumberOptions.renderType === RenderLineNumbersType.Off) {
        return () => gutterWidth;
      }
      const w = editor.getOption(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
      const rightOfLineNumber = layout.lineNumbersLeft + layout.lineNumbersWidth;
      const totalLines = textModel.getLineCount();
      const totalLinesDigits = (totalLines + 1).toString().length;
      const offsetDigits = [];
      for (let digits = 1; digits <= totalLinesDigits; digits++) {
        const firstLineNumberWithDigitCount = 10 ** (digits - 1);
        const topOfLineNumber = editor.getTopForLineNumber(firstLineNumberWithDigitCount);
        const digitsWidth = digits * w;
        const usableWidthLeftOfLineNumber = Math.min(gutterWidth, Math.max(0, rightOfLineNumber - digitsWidth - layout.glyphMarginLeft));
        offsetDigits.push({ firstLineNumberWithDigitCount, topOfLineNumber, usableWidthLeftOfLineNumber });
      }
      return (topOffset) => {
        for (let i = offsetDigits.length - 1; i >= 0; i--) {
          if (topOffset >= offsetDigits[i].topOfLineNumber) {
            return offsetDigits[i].usableWidthLeftOfLineNumber;
          }
        }
        throw new BugIndicatingError("Could not find avilable width for icon");
      };
    });
    this._layout = derived(this, (reader) => {
      const s = this._state.read(reader);
      if (!s) {
        return void 0;
      }
      const layout = this._editorObs.layoutInfo.read(reader);
      const lineHeight = this._editorObs.observeLineHeightForLine(s.range.map((r) => r.startLineNumber)).read(reader);
      const gutterViewPortPaddingLeft = 1;
      const gutterViewPortPaddingTop = 2;
      const gutterWidthWithoutPadding = layout.decorationsLeft + layout.decorationsWidth - layout.glyphMarginLeft - 2 * gutterViewPortPaddingLeft;
      const gutterHeightWithoutPadding = layout.height - 2 * gutterViewPortPaddingTop;
      const gutterViewPortWithStickyScroll = Rect.fromLeftTopWidthHeight(gutterViewPortPaddingLeft, gutterViewPortPaddingTop, gutterWidthWithoutPadding, gutterHeightWithoutPadding);
      const gutterViewPortWithoutStickyScrollWithoutPaddingTop = gutterViewPortWithStickyScroll.withTop(this._stickyScrollHeight.read(reader));
      const gutterViewPortWithoutStickyScroll = gutterViewPortWithStickyScroll.withTop(gutterViewPortWithoutStickyScrollWithoutPaddingTop.top + gutterViewPortPaddingTop);
      const verticalEditRange = s.lineOffsetRange.read(reader);
      const gutterEditArea = Rect.fromRanges(OffsetRange.fromTo(gutterViewPortWithoutStickyScroll.left, gutterViewPortWithoutStickyScroll.right), verticalEditRange);
      const pillHeight = lineHeight;
      const pillOffset = this._verticalOffset.read(reader);
      const pillFullyDockedRect = gutterEditArea.withHeight(pillHeight).translateY(pillOffset);
      const pillIsFullyDocked = gutterViewPortWithoutStickyScrollWithoutPaddingTop.containsRect(pillFullyDockedRect);
      const customIcon = this._data.read(reader)?.customization?.icon;
      const iconNoneDocked = customIcon ? constObservable(customIcon) : this._tabAction.map((action) => action === InlineEditTabAction.Accept ? Codicon.keyboardTab : Codicon.arrowRight);
      const iconDocked = customIcon ? constObservable(customIcon) : derived(this, (reader2) => {
        if (this._isHoveredOverIconDebounced.read(reader2) || this._isHoveredOverInlineEditDebounced.read(reader2)) {
          return Codicon.check;
        }
        if (this._tabAction.read(reader2) === InlineEditTabAction.Accept) {
          return Codicon.keyboardTab;
        }
        const cursorLineNumber = this._editorObs.cursorLineNumber.read(reader2) ?? 0;
        const editStartLineNumber = s.range.read(reader2).startLineNumber;
        return cursorLineNumber <= editStartLineNumber ? Codicon.keyboardTabAbove : Codicon.keyboardTabBelow;
      });
      const idealIconAreaWidth = 22;
      const iconWidth = (pillRect2) => {
        const availableIconAreaWidth = this._availableWidthForIcon.read(void 0)(pillRect2.bottom + this._editorObs.editor.getScrollTop()) - gutterViewPortPaddingLeft;
        return Math.max(Math.min(availableIconAreaWidth, idealIconAreaWidth), CODICON_SIZE_PX);
      };
      if (pillIsFullyDocked) {
        const pillRect2 = pillFullyDockedRect;
        let widthUntilLineNumberEnd;
        if (layout.lineNumbersWidth === 0) {
          widthUntilLineNumberEnd = Math.max(0, Math.min(Math.max(layout.lineNumbersLeft - gutterViewPortWithStickyScroll.left, 0), pillRect2.width - idealIconAreaWidth));
        } else {
          widthUntilLineNumberEnd = Math.max(layout.lineNumbersLeft + layout.lineNumbersWidth - gutterViewPortWithStickyScroll.left, 0);
        }
        const lineNumberRect = pillRect2.withWidth(widthUntilLineNumberEnd);
        const minimalIconWidthWithPadding = CODICON_SIZE_PX + CODICON_PADDING_PX;
        const iconWidth2 = Math.min(pillRect2.width - widthUntilLineNumberEnd, idealIconAreaWidth);
        const iconRect2 = pillRect2.withWidth(Math.max(iconWidth2, minimalIconWidthWithPadding)).translateX(widthUntilLineNumberEnd);
        const iconVisible = iconWidth2 >= minimalIconWidthWithPadding;
        return {
          gutterEditArea,
          icon: iconDocked,
          iconDirection: "right",
          iconRect: iconRect2,
          iconVisible,
          pillRect: pillRect2,
          lineNumberRect
        };
      }
      const pillPartiallyDockedPossibleArea = gutterViewPortWithStickyScroll.intersect(gutterEditArea);
      const pillIsPartiallyDocked = pillPartiallyDockedPossibleArea && pillPartiallyDockedPossibleArea.height >= pillHeight;
      if (pillIsPartiallyDocked) {
        const pillRectMoved2 = pillFullyDockedRect.moveToBeContainedIn(gutterViewPortWithoutStickyScroll).moveToBeContainedIn(pillPartiallyDockedPossibleArea);
        const pillRect2 = pillRectMoved2.withWidth(iconWidth(pillRectMoved2));
        const iconRect2 = pillRect2;
        return {
          gutterEditArea,
          icon: iconDocked,
          iconDirection: "right",
          iconRect: iconRect2,
          pillRect: pillRect2,
          iconVisible: true
        };
      }
      const pillRectMoved = pillFullyDockedRect.moveToBeContainedIn(gutterViewPortWithStickyScroll);
      const pillRect = pillRectMoved.withWidth(iconWidth(pillRectMoved));
      const iconRect = pillRect;
      const iconDirection = pillRect.top < pillFullyDockedRect.top ? "top" : "bottom";
      return {
        gutterEditArea,
        icon: iconNoneDocked,
        iconDirection,
        iconRect,
        pillRect,
        iconVisible: true
      };
    });
    this._iconRef = n.ref();
    this.isVisible = this._layout.map((l) => !!l);
    this._hoverVisible = observableValue(this, false);
    this.isHoverVisible = this._hoverVisible;
    this._isHoveredOverIcon = observableValue(this, false);
    this._isHoveredOverIconDebounced = debouncedObservable(this._isHoveredOverIcon, 100);
    this.isHoveredOverIcon = this._isHoveredOverIconDebounced;
    this._indicator = n.div({
      class: "inline-edits-view-gutter-indicator",
      style: {
        position: "absolute",
        overflow: "visible"
      }
    }, mapOutFalsy(this._layout).map((layout) => !layout ? [] : [
      n.div({
        style: {
          position: "absolute",
          background: asCssVariable(inlineEditIndicatorBackground),
          borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
          ...rectToProps((reader) => layout.read(reader).gutterEditArea)
        }
      }),
      n.div({
        class: "icon",
        ref: this._iconRef,
        tabIndex: 0,
        onclick: () => {
          const layout2 = this._layout.get();
          const acceptOnClick = layout2?.icon.get() === Codicon.check;
          const data = this._data.get();
          if (!data) {
            throw new BugIndicatingError("Gutter indicator data not available");
          }
          this._editorObs.editor.focus();
          if (acceptOnClick) {
            data.model.accept();
          } else {
            data.model.jump();
          }
        },
        onmouseenter: () => {
          this._showHover();
        },
        style: {
          cursor: "pointer",
          zIndex: "20",
          position: "absolute",
          backgroundColor: this._gutterIndicatorStyles.map((v) => v.background),
          // eslint-disable-next-line local/code-no-any-casts
          ["--vscodeIconForeground"]: this._gutterIndicatorStyles.map((v) => v.foreground),
          border: this._gutterIndicatorStyles.map((v) => `1px solid ${v.border}`),
          boxSizing: "border-box",
          borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
          display: "flex",
          justifyContent: layout.map((l) => l.iconDirection === "bottom" ? "flex-start" : "flex-end"),
          transition: this._modifierPressed.map((m) => m ? "" : "background-color 0.2s ease-in-out, width 0.2s ease-in-out"),
          ...rectToProps((reader) => layout.read(reader).pillRect)
        }
      }, [
        n.div(
          {
            className: "line-number",
            style: {
              lineHeight: layout.map((l) => l.lineNumberRect ? l.lineNumberRect.height : 0),
              display: layout.map((l) => l.lineNumberRect ? "flex" : "none"),
              alignItems: "center",
              justifyContent: "flex-end",
              width: layout.map((l) => l.lineNumberRect ? l.lineNumberRect.width : 0),
              height: "100%",
              color: this._gutterIndicatorStyles.map((v) => v.foreground)
            }
          },
          this._lineNumberToRender
        ),
        n.div({
          style: {
            transform: layout.map((l) => `rotate(${getRotationFromDirection(l.iconDirection)}deg)`),
            transition: "rotate 0.2s ease-in-out, opacity 0.2s ease-in-out",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            opacity: layout.map((l) => l.iconVisible ? "1" : "0"),
            marginRight: layout.map((l) => l.pillRect.width - l.iconRect.width - (l.lineNumberRect?.width ?? 0)),
            width: layout.map((l) => l.iconRect.width),
            position: "relative",
            right: layout.map((l) => l.iconDirection === "top" ? "1px" : "0"),
            color: this._data.map((d) => d?.customization?.icon?.color ? asCssVariable(d.customization.icon.color.id) : void 0)
          }
        }, [
          layout.map((l, reader) => withStyles(renderIcon(l.icon.read(reader)), { fontSize: toPx(Math.min(l.iconRect.width - CODICON_PADDING_PX, CODICON_SIZE_PX)) }))
        ])
      ])
    ]));
    this._originalRangeObs = mapOutFalsy(this._data.map((d) => d?.originalRange));
    this._stickyScrollController = StickyScrollController.get(this._editorObs.editor);
    this._stickyScrollHeight = this._stickyScrollController ? observableFromEvent(this._stickyScrollController.onDidChangeStickyScrollHeight, () => this._stickyScrollController.stickyScrollWidgetHeight) : constObservable(0);
    this._isHoveredOverInlineEditDebounced = debouncedObservable(this._isHoveringOverInlineEdit, 100);
    const indicator = this._indicator.keepUpdated(this._store);
    this._register(this._editorObs.createOverlayWidget({
      domNode: indicator.element,
      position: constObservable(null),
      allowEditorOverflow: false,
      minContentWidthInPx: constObservable(0)
    }));
    this._register(this._editorObs.editor.onMouseMove((e) => {
      const state = this._state.get();
      if (state === void 0) {
        return;
      }
      const el = this._iconRef.element;
      const rect = el.getBoundingClientRect();
      const rectangularArea = Rect.fromLeftTopWidthHeight(rect.left, rect.top, rect.width, rect.height);
      const point = new Point(e.event.posx, e.event.posy);
      this._isHoveredOverIcon.set(rectangularArea.containsPoint(point), void 0);
    }));
    this._register(this._editorObs.editor.onDidScrollChange(() => {
      this._isHoveredOverIcon.set(false, void 0);
    }));
    this._register(runOnChange(this._isHoveredOverInlineEditDebounced, (isHovering) => {
      if (isHovering) {
        this.triggerAnimation();
      }
    }));
    this._register(autorun((reader) => {
      indicator.readEffect(reader);
      if (indicator.element) {
        this._editorObs.editor.applyFontInfo(indicator.element);
      }
    }));
  }
  triggerAnimation() {
    if (this._accessibilityService.isMotionReduced()) {
      return new Animation(null, null).finished;
    }
    const animation = this._iconRef.element.animate([
      {
        outline: `2px solid ${this._gutterIndicatorStyles.map((v) => v.border).get()}`,
        outlineOffset: "-1px",
        offset: 0
      },
      {
        outline: `2px solid transparent`,
        outlineOffset: "10px",
        offset: 1
      }
    ], { duration: 500 });
    return animation.finished;
  }
  _showHover() {
    if (this._hoverVisible.get()) {
      return;
    }
    const data = this._data.get();
    if (!data) {
      throw new BugIndicatingError("Gutter indicator data not available");
    }
    const disposableStore = new DisposableStore();
    const content = disposableStore.add(this._instantiationService.createInstance(
      GutterIndicatorMenuContent,
      this._editorObs,
      data.gutterMenuData,
      (focusEditor, commandId) => {
        if (focusEditor) {
          this._editorObs.editor.focus();
        }
        if (commandId) {
          this._onDidCloseWithCommand.fire(commandId);
        }
        h?.dispose();
      }
    ).toDisposableLiveElement());
    const isFocused = this._userInteractionService.createFocusTracker(content.element, disposableStore);
    disposableStore.add(autorun((reader) => {
      this._focusIsInMenu.set(isFocused.read(reader), void 0);
    }));
    disposableStore.add(toDisposable(() => this._focusIsInMenu.set(false, void 0)));
    const h = this._hoverService.showInstantHover({
      target: this._iconRef.element,
      content: content.element
    });
    if (h) {
      this._hoverVisible.set(true, void 0);
      disposableStore.add(this._editorObs.editor.onDidScrollChange(() => h.dispose()));
      disposableStore.add(h.onDispose(() => {
        this._hoverVisible.set(false, void 0);
        disposableStore.dispose();
      }));
    } else {
      disposableStore.dispose();
    }
  }
};
InlineEditsGutterIndicator = __decorateClass([
  __decorateParam(6, IHoverService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IAccessibilityService),
  __decorateParam(9, IThemeService),
  __decorateParam(10, IUserInteractionService)
], InlineEditsGutterIndicator);
function getRotationFromDirection(direction) {
  switch (direction) {
    case "top":
      return 90;
    case "bottom":
      return -90;
    case "right":
      return 0;
  }
}
function withStyles(element, styles) {
  for (const key in styles) {
    element.style[key] = styles[key];
  }
  return element;
}
function toPx(n2) {
  return `${n2}px`;
}
export {
  InlineEditsGutterIndicator,
  InlineEditsGutterIndicatorData,
  InlineSuggestionGutterMenuData,
  SimpleInlineSuggestModel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9jb21wb25lbnRzL2d1dHRlckluZGljYXRvclZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIElTZXR0YWJsZU9ic2VydmFibGUsIGF1dG9ydW4sIGNvbnN0T2JzZXJ2YWJsZSwgZGVib3VuY2VkT2JzZXJ2YWJsZSwgZGVyaXZlZCwgb2JzZXJ2YWJsZUZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlLCBydW5PbkNoYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IE9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYnJvd3Nlci9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBQb2ludCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlLzJkL3BvaW50LmpzJztcbmltcG9ydCB7IFJlY3QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS8yZC9yZWN0LmpzJztcbmltcG9ydCB7IEhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEhvdmVyV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24sIFJlbmRlckxpbmVOdW1iZXJzVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBMaW5lUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvbGluZVJhbmdlLmpzJztcbmltcG9ydCB7IE9mZnNldFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IFN0aWNreVNjcm9sbENvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zdGlja3lTY3JvbGwvYnJvd3Nlci9zdGlja3lTY3JvbGxDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IElubGluZUVkaXRUYWJBY3Rpb24gfSBmcm9tICcuLi9pbmxpbmVFZGl0c1ZpZXdJbnRlcmZhY2UuanMnO1xuaW1wb3J0IHsgZ2V0RWRpdG9yQmxlbmRlZENvbG9yLCBJTkxJTkVfRURJVFNfQk9SREVSX1JBRElVUywgaW5saW5lRWRpdEluZGljYXRvckJhY2tncm91bmQsIGlubGluZUVkaXRJbmRpY2F0b3JQcmltYXJ5QmFja2dyb3VuZCwgaW5saW5lRWRpdEluZGljYXRvclByaW1hcnlCb3JkZXIsIGlubGluZUVkaXRJbmRpY2F0b3JQcmltYXJ5Rm9yZWdyb3VuZCwgaW5saW5lRWRpdEluZGljYXRvclNlY29uZGFyeUJhY2tncm91bmQsIGlubGluZUVkaXRJbmRpY2F0b3JTZWNvbmRhcnlCb3JkZXIsIGlubGluZUVkaXRJbmRpY2F0b3JTZWNvbmRhcnlGb3JlZ3JvdW5kLCBpbmxpbmVFZGl0SW5kaWNhdG9yU3VjY2Vzc2Z1bEJhY2tncm91bmQsIGlubGluZUVkaXRJbmRpY2F0b3JTdWNjZXNzZnVsQm9yZGVyLCBpbmxpbmVFZGl0SW5kaWNhdG9yU3VjY2Vzc2Z1bEZvcmVncm91bmQgfSBmcm9tICcuLi90aGVtZS5qcyc7XG5pbXBvcnQgeyBtYXBPdXRGYWxzeSwgcmVjdFRvUHJvcHMgfSBmcm9tICcuLi91dGlscy91dGlscy5qcyc7XG5pbXBvcnQgeyBHdXR0ZXJJbmRpY2F0b3JNZW51Q29udGVudCB9IGZyb20gJy4vZ3V0dGVySW5kaWNhdG9yTWVudS5qcyc7XG5pbXBvcnQgeyBhc3NlcnROZXZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBDb21tYW5kLCBJbmxpbmVDb21wbGV0aW9uQ29tbWFuZCwgSUlubGluZUNvbXBsZXRpb25Nb2RlbEluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElubGluZVN1Z2dlc3Rpb25JdGVtIH0gZnJvbSAnLi4vLi4vLi4vbW9kZWwvaW5saW5lU3VnZ2VzdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbnNNb2RlbCB9IGZyb20gJy4uLy4uLy4uL21vZGVsL2lubGluZUNvbXBsZXRpb25zTW9kZWwuanMnO1xuaW1wb3J0IHsgSW5saW5lU3VnZ2VzdEFsdGVybmF0aXZlQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vbW9kZWwvSW5saW5lU3VnZ2VzdEFsdGVybmF0aXZlQWN0aW9uLmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JVdGlscy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSVVzZXJJbnRlcmFjdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VySW50ZXJhY3Rpb24vYnJvd3Nlci91c2VySW50ZXJhY3Rpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuXG4vKipcbiAqIEN1c3RvbWl6YXRpb24gb3B0aW9ucyBmb3IgdGhlIGd1dHRlciBpbmRpY2F0b3IgYXBwZWFyYW5jZSBhbmQgYmVoYXZpb3IuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgR3V0dGVySW5kaWNhdG9yQ3VzdG9taXphdGlvbiB7XG5cdC8qKiBPdmVycmlkZSB0aGUgZGVmYXVsdCBpY29uICovXG5cdHJlYWRvbmx5IGljb24/OiBUaGVtZUljb247XG59XG5cbmV4cG9ydCBjbGFzcyBJbmxpbmVFZGl0c0d1dHRlckluZGljYXRvckRhdGEge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBndXR0ZXJNZW51RGF0YTogSW5saW5lU3VnZ2VzdGlvbkd1dHRlck1lbnVEYXRhLFxuXHRcdHJlYWRvbmx5IG9yaWdpbmFsUmFuZ2U6IExpbmVSYW5nZSxcblx0XHRyZWFkb25seSBtb2RlbDogU2ltcGxlSW5saW5lU3VnZ2VzdE1vZGVsLFxuXHRcdHJlYWRvbmx5IGFsdEFjdGlvbjogSW5saW5lU3VnZ2VzdEFsdGVybmF0aXZlQWN0aW9uIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IGN1c3RvbWl6YXRpb24/OiBHdXR0ZXJJbmRpY2F0b3JDdXN0b21pemF0aW9uLFxuXHQpIHsgfVxufVxuXG5leHBvcnQgY2xhc3MgSW5saW5lU3VnZ2VzdGlvbkd1dHRlck1lbnVEYXRhIHtcblx0cHVibGljIHN0YXRpYyBmcm9tSW5saW5lU3VnZ2VzdGlvbihzdWdnZXN0aW9uOiBJbmxpbmVTdWdnZXN0aW9uSXRlbSk6IElubGluZVN1Z2dlc3Rpb25HdXR0ZXJNZW51RGF0YSB7XG5cdFx0Y29uc3QgYWx0ZXJuYXRpdmVBY3Rpb24gPSBzdWdnZXN0aW9uLmFjdGlvbj8ua2luZCA9PT0gJ2VkaXQnID8gc3VnZ2VzdGlvbi5hY3Rpb24uYWx0ZXJuYXRpdmVBY3Rpb24gOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY29tbWFuZHMgPSBzdWdnZXN0aW9uLnNvdXJjZS5pbmxpbmVTdWdnZXN0aW9ucy5jb21tYW5kcyA/PyBbXTtcblx0XHRyZXR1cm4gbmV3IElubGluZVN1Z2dlc3Rpb25HdXR0ZXJNZW51RGF0YShcblx0XHRcdHN1Z2dlc3Rpb24uZ3V0dGVyTWVudUxpbmtBY3Rpb24sXG5cdFx0XHRzdWdnZXN0aW9uLnNvdXJjZS5wcm92aWRlci5kaXNwbGF5TmFtZSA/PyBsb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdGlvbicsIFwiSW5saW5lIFN1Z2dlc3Rpb25cIiksXG5cdFx0XHRjb21tYW5kcy5sZW5ndGggPiAwID8gW2NvbW1hbmRzXSA6IFtdLFxuXHRcdFx0YWx0ZXJuYXRpdmVBY3Rpb24sXG5cdFx0XHRzdWdnZXN0aW9uLnNvdXJjZS5wcm92aWRlci5tb2RlbEluZm8sXG5cdFx0XHRzdWdnZXN0aW9uLnNvdXJjZS5wcm92aWRlci5zZXRNb2RlbElkPy5iaW5kKHN1Z2dlc3Rpb24uc291cmNlLnByb3ZpZGVyKSxcblx0XHQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgYWN0aW9uOiBDb21tYW5kIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgZXh0ZW5zaW9uQ29tbWFuZHM6IElubGluZUNvbXBsZXRpb25Db21tYW5kW11bXSxcblx0XHRyZWFkb25seSBhbHRlcm5hdGl2ZUFjdGlvbjogSW5saW5lU3VnZ2VzdEFsdGVybmF0aXZlQWN0aW9uIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IG1vZGVsSW5mbzogSUlubGluZUNvbXBsZXRpb25Nb2RlbEluZm8gfCB1bmRlZmluZWQsXG5cdFx0cmVhZG9ubHkgc2V0TW9kZWxJZDogKChtb2RlbElkOiBzdHJpbmcpID0+IFByb21pc2U8dm9pZD4pIHwgdW5kZWZpbmVkLFxuXHRcdHJlYWRvbmx5IGV4dGVuc2lvbkNvbW1hbmRzT25seTogYm9vbGVhbiA9IGZhbHNlLFxuXHQpIHsgfVxufVxuXG4vLyBUT0RPIHRoaXMgY2xhc3MgZG9lcyBub3QgbWFrZSB0aGF0IG11Y2ggc2Vuc2UgeWV0LlxuZXhwb3J0IGNsYXNzIFNpbXBsZUlubGluZVN1Z2dlc3RNb2RlbCB7XG5cdHB1YmxpYyBzdGF0aWMgZnJvbUlubGluZUNvbXBsZXRpb25Nb2RlbChtb2RlbDogSW5saW5lQ29tcGxldGlvbnNNb2RlbCk6IFNpbXBsZUlubGluZVN1Z2dlc3RNb2RlbCB7XG5cdFx0cmV0dXJuIG5ldyBTaW1wbGVJbmxpbmVTdWdnZXN0TW9kZWwoXG5cdFx0XHQoKSA9PiBtb2RlbC5hY2NlcHQoKSxcblx0XHRcdCgpID0+IG1vZGVsLmp1bXAoKSxcblx0XHQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgYWNjZXB0OiAoKSA9PiB2b2lkLFxuXHRcdHJlYWRvbmx5IGp1bXA6ICgpID0+IHZvaWQsXG5cdCkgeyB9XG59XG5cbmNvbnN0IENPRElDT05fU0laRV9QWCA9IDE2O1xuY29uc3QgQ09ESUNPTl9QQURESU5HX1BYID0gMjtcblxuZXhwb3J0IGNsYXNzIElubGluZUVkaXRzR3V0dGVySW5kaWNhdG9yIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbG9zZVdpdGhDb21tYW5kID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRDbG9zZVdpdGhDb21tYW5kOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25EaWRDbG9zZVdpdGhDb21tYW5kLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvck9iczogT2JzZXJ2YWJsZUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGF0YTogSU9ic2VydmFibGU8SW5saW5lRWRpdHNHdXR0ZXJJbmRpY2F0b3JEYXRhIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90YWJBY3Rpb246IElPYnNlcnZhYmxlPElubGluZUVkaXRUYWJBY3Rpb24+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3ZlcnRpY2FsT2Zmc2V0OiBJT2JzZXJ2YWJsZTxudW1iZXI+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2lzSG92ZXJpbmdPdmVySW5saW5lRWRpdDogSU9ic2VydmFibGU8Ym9vbGVhbj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZm9jdXNJc0luTWVudTogSVNldHRhYmxlT2JzZXJ2YWJsZTxib29sZWFuPixcblxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBIb3ZlclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VzZXJJbnRlcmFjdGlvblNlcnZpY2U6IElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9vcmlnaW5hbFJhbmdlT2JzID0gbWFwT3V0RmFsc3kodGhpcy5fZGF0YS5tYXAoZCA9PiBkPy5vcmlnaW5hbFJhbmdlKSk7XG5cblx0XHR0aGlzLl9zdGlja3lTY3JvbGxDb250cm9sbGVyID0gU3RpY2t5U2Nyb2xsQ29udHJvbGxlci5nZXQodGhpcy5fZWRpdG9yT2JzLmVkaXRvcik7XG5cdFx0dGhpcy5fc3RpY2t5U2Nyb2xsSGVpZ2h0ID0gdGhpcy5fc3RpY2t5U2Nyb2xsQ29udHJvbGxlclxuXHRcdFx0PyBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMuX3N0aWNreVNjcm9sbENvbnRyb2xsZXIub25EaWRDaGFuZ2VTdGlja3lTY3JvbGxIZWlnaHQsICgpID0+IHRoaXMuX3N0aWNreVNjcm9sbENvbnRyb2xsZXIhLnN0aWNreVNjcm9sbFdpZGdldEhlaWdodClcblx0XHRcdDogY29uc3RPYnNlcnZhYmxlKDApO1xuXG5cdFx0dGhpcy5faXNIb3ZlcmVkT3ZlcklubGluZUVkaXREZWJvdW5jZWQgPSBkZWJvdW5jZWRPYnNlcnZhYmxlKHRoaXMuX2lzSG92ZXJpbmdPdmVySW5saW5lRWRpdCwgMTAwKTtcblxuXHRcdGNvbnN0IGluZGljYXRvciA9IHRoaXMuX2luZGljYXRvci5rZWVwVXBkYXRlZCh0aGlzLl9zdG9yZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JPYnMuY3JlYXRlT3ZlcmxheVdpZGdldCh7XG5cdFx0XHRkb21Ob2RlOiBpbmRpY2F0b3IuZWxlbWVudCxcblx0XHRcdHBvc2l0aW9uOiBjb25zdE9ic2VydmFibGUobnVsbCksXG5cdFx0XHRhbGxvd0VkaXRvck92ZXJmbG93OiBmYWxzZSxcblx0XHRcdG1pbkNvbnRlbnRXaWR0aEluUHg6IGNvbnN0T2JzZXJ2YWJsZSgwKSxcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lZGl0b3JPYnMuZWRpdG9yLm9uTW91c2VNb3ZlKChlOiBJRWRpdG9yTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZS5nZXQoKTtcblx0XHRcdGlmIChzdGF0ZSA9PT0gdW5kZWZpbmVkKSB7IHJldHVybjsgfVxuXG5cdFx0XHRjb25zdCBlbCA9IHRoaXMuX2ljb25SZWYuZWxlbWVudDtcblx0XHRcdGNvbnN0IHJlY3QgPSBlbC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdGNvbnN0IHJlY3Rhbmd1bGFyQXJlYSA9IFJlY3QuZnJvbUxlZnRUb3BXaWR0aEhlaWdodChyZWN0LmxlZnQsIHJlY3QudG9wLCByZWN0LndpZHRoLCByZWN0LmhlaWdodCk7XG5cdFx0XHRjb25zdCBwb2ludCA9IG5ldyBQb2ludChlLmV2ZW50LnBvc3gsIGUuZXZlbnQucG9zeSk7XG5cdFx0XHR0aGlzLl9pc0hvdmVyZWRPdmVySWNvbi5zZXQocmVjdGFuZ3VsYXJBcmVhLmNvbnRhaW5zUG9pbnQocG9pbnQpLCB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvck9icy5lZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5faXNIb3ZlcmVkT3Zlckljb24uc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblxuXHRcdC8vIHB1bHNlIGFuaW1hdGlvbiB3aGVuIGhvdmVyaW5nIGlubGluZSBlZGl0XG5cdFx0dGhpcy5fcmVnaXN0ZXIocnVuT25DaGFuZ2UodGhpcy5faXNIb3ZlcmVkT3ZlcklubGluZUVkaXREZWJvdW5jZWQsIChpc0hvdmVyaW5nKSA9PiB7XG5cdFx0XHRpZiAoaXNIb3ZlcmluZykge1xuXHRcdFx0XHR0aGlzLnRyaWdnZXJBbmltYXRpb24oKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRpbmRpY2F0b3IucmVhZEVmZmVjdChyZWFkZXIpO1xuXHRcdFx0aWYgKGluZGljYXRvci5lbGVtZW50KSB7XG5cdFx0XHRcdC8vIEZvciB0aGUgbGluZSBudW1iZXJcblx0XHRcdFx0dGhpcy5fZWRpdG9yT2JzLmVkaXRvci5hcHBseUZvbnRJbmZvKGluZGljYXRvci5lbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pc0hvdmVyZWRPdmVySW5saW5lRWRpdERlYm91bmNlZDogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kaWZpZXJQcmVzc2VkID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT5cblx0XHR0aGlzLl91c2VySW50ZXJhY3Rpb25TZXJ2aWNlLnJlYWRNb2RpZmllcktleVN0YXR1cyh0aGlzLl9lZGl0b3JPYnMuZWRpdG9yLmdldERvbU5vZGUoKSEsIHJlYWRlcikuc2hpZnRLZXlcblx0KTtcblx0cHJpdmF0ZSByZWFkb25seSBfZ3V0dGVySW5kaWNhdG9yU3R5bGVzID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGxldCB2ID0gdGhpcy5fdGFiQWN0aW9uLnJlYWQocmVhZGVyKTtcblxuXHRcdC8vIFRPRE86IGFkZCBzb3VyY2Ugb2YgdHJ1dGggZm9yIGFsdCBhY3Rpb24gYWN0aXZlIGFuZCBrZXkgcHJlc3NlZFxuXHRcdGNvbnN0IGFsdEFjdGlvbiA9IHRoaXMuX2RhdGEucmVhZChyZWFkZXIpPy5hbHRBY3Rpb247XG5cdFx0Y29uc3QgbW9kaWZpZWRQcmVzc2VkID0gdGhpcy5fbW9kaWZpZXJQcmVzc2VkLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoYWx0QWN0aW9uICYmIG1vZGlmaWVkUHJlc3NlZCkge1xuXHRcdFx0diA9IElubGluZUVkaXRUYWJBY3Rpb24uSW5hY3RpdmU7XG5cdFx0fVxuXG5cdFx0c3dpdGNoICh2KSB7XG5cdFx0XHRjYXNlIElubGluZUVkaXRUYWJBY3Rpb24uSW5hY3RpdmU6IHJldHVybiB7XG5cdFx0XHRcdGJhY2tncm91bmQ6IGdldEVkaXRvckJsZW5kZWRDb2xvcihpbmxpbmVFZGl0SW5kaWNhdG9yU2Vjb25kYXJ5QmFja2dyb3VuZCwgdGhpcy5fdGhlbWVTZXJ2aWNlKS5yZWFkKHJlYWRlcikudG9TdHJpbmcoKSxcblx0XHRcdFx0Zm9yZWdyb3VuZDogZ2V0RWRpdG9yQmxlbmRlZENvbG9yKGlubGluZUVkaXRJbmRpY2F0b3JTZWNvbmRhcnlGb3JlZ3JvdW5kLCB0aGlzLl90aGVtZVNlcnZpY2UpLnJlYWQocmVhZGVyKS50b1N0cmluZygpLFxuXHRcdFx0XHRib3JkZXI6IGdldEVkaXRvckJsZW5kZWRDb2xvcihpbmxpbmVFZGl0SW5kaWNhdG9yU2Vjb25kYXJ5Qm9yZGVyLCB0aGlzLl90aGVtZVNlcnZpY2UpLnJlYWQocmVhZGVyKS50b1N0cmluZygpLFxuXHRcdFx0fTtcblx0XHRcdGNhc2UgSW5saW5lRWRpdFRhYkFjdGlvbi5KdW1wOiByZXR1cm4ge1xuXHRcdFx0XHRiYWNrZ3JvdW5kOiBnZXRFZGl0b3JCbGVuZGVkQ29sb3IoaW5saW5lRWRpdEluZGljYXRvclByaW1hcnlCYWNrZ3JvdW5kLCB0aGlzLl90aGVtZVNlcnZpY2UpLnJlYWQocmVhZGVyKS50b1N0cmluZygpLFxuXHRcdFx0XHRmb3JlZ3JvdW5kOiBnZXRFZGl0b3JCbGVuZGVkQ29sb3IoaW5saW5lRWRpdEluZGljYXRvclByaW1hcnlGb3JlZ3JvdW5kLCB0aGlzLl90aGVtZVNlcnZpY2UpLnJlYWQocmVhZGVyKS50b1N0cmluZygpLFxuXHRcdFx0XHRib3JkZXI6IGdldEVkaXRvckJsZW5kZWRDb2xvcihpbmxpbmVFZGl0SW5kaWNhdG9yUHJpbWFyeUJvcmRlciwgdGhpcy5fdGhlbWVTZXJ2aWNlKS5yZWFkKHJlYWRlcikudG9TdHJpbmcoKVxuXHRcdFx0fTtcblx0XHRcdGNhc2UgSW5saW5lRWRpdFRhYkFjdGlvbi5BY2NlcHQ6IHJldHVybiB7XG5cdFx0XHRcdGJhY2tncm91bmQ6IGdldEVkaXRvckJsZW5kZWRDb2xvcihpbmxpbmVFZGl0SW5kaWNhdG9yU3VjY2Vzc2Z1bEJhY2tncm91bmQsIHRoaXMuX3RoZW1lU2VydmljZSkucmVhZChyZWFkZXIpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGZvcmVncm91bmQ6IGdldEVkaXRvckJsZW5kZWRDb2xvcihpbmxpbmVFZGl0SW5kaWNhdG9yU3VjY2Vzc2Z1bEZvcmVncm91bmQsIHRoaXMuX3RoZW1lU2VydmljZSkucmVhZChyZWFkZXIpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGJvcmRlcjogZ2V0RWRpdG9yQmxlbmRlZENvbG9yKGlubGluZUVkaXRJbmRpY2F0b3JTdWNjZXNzZnVsQm9yZGVyLCB0aGlzLl90aGVtZVNlcnZpY2UpLnJlYWQocmVhZGVyKS50b1N0cmluZygpXG5cdFx0XHR9O1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YXNzZXJ0TmV2ZXIodik7XG5cdFx0fVxuXHR9KTtcblxuXHRwdWJsaWMgdHJpZ2dlckFuaW1hdGlvbigpOiBQcm9taXNlPEFuaW1hdGlvbj4ge1xuXHRcdGlmICh0aGlzLl9hY2Nlc3NpYmlsaXR5U2VydmljZS5pc01vdGlvblJlZHVjZWQoKSkge1xuXHRcdFx0cmV0dXJuIG5ldyBBbmltYXRpb24obnVsbCwgbnVsbCkuZmluaXNoZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gUFVMU0UgQU5JTUFUSU9OOlxuXHRcdGNvbnN0IGFuaW1hdGlvbiA9IHRoaXMuX2ljb25SZWYuZWxlbWVudC5hbmltYXRlKFtcblx0XHRcdHtcblx0XHRcdFx0b3V0bGluZTogYDJweCBzb2xpZCAke3RoaXMuX2d1dHRlckluZGljYXRvclN0eWxlcy5tYXAodiA9PiB2LmJvcmRlcikuZ2V0KCl9YCxcblx0XHRcdFx0b3V0bGluZU9mZnNldDogJy0xcHgnLFxuXHRcdFx0XHRvZmZzZXQ6IDBcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdG91dGxpbmU6IGAycHggc29saWQgdHJhbnNwYXJlbnRgLFxuXHRcdFx0XHRvdXRsaW5lT2Zmc2V0OiAnMTBweCcsXG5cdFx0XHRcdG9mZnNldDogMVxuXHRcdFx0fSxcblx0XHRdLCB7IGR1cmF0aW9uOiA1MDAgfSk7XG5cblx0XHRyZXR1cm4gYW5pbWF0aW9uLmZpbmlzaGVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ2luYWxSYW5nZU9icztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZSA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCByYW5nZSA9IHRoaXMuX29yaWdpbmFsUmFuZ2VPYnMucmVhZChyZWFkZXIpO1xuXHRcdGlmICghcmFuZ2UpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdHJldHVybiB7XG5cdFx0XHRyYW5nZSxcblx0XHRcdGxpbmVPZmZzZXRSYW5nZTogdGhpcy5fZWRpdG9yT2JzLm9ic2VydmVMaW5lT2Zmc2V0UmFuZ2UocmFuZ2UsIHJlYWRlci5zdG9yZSksXG5cdFx0fTtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RpY2t5U2Nyb2xsQ29udHJvbGxlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RpY2t5U2Nyb2xsSGVpZ2h0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xpbmVOdW1iZXJUb1JlbmRlciA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRpZiAodGhpcy5fdmVydGljYWxPZmZzZXQucmVhZChyZWFkZXIpICE9PSAwKSB7XG5cdFx0XHRyZXR1cm4gJyc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZU51bWJlciA9IHRoaXMuX2RhdGEucmVhZChyZWFkZXIpPy5vcmlnaW5hbFJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBsaW5lTnVtYmVyT3B0aW9ucyA9IHRoaXMuX2VkaXRvck9icy5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVOdW1iZXJzKS5yZWFkKHJlYWRlcik7XG5cblx0XHRpZiAobGluZU51bWJlciA9PT0gdW5kZWZpbmVkIHx8IGxpbmVOdW1iZXJPcHRpb25zLnJlbmRlclR5cGUgPT09IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5PZmYpIHtcblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRpZiAobGluZU51bWJlck9wdGlvbnMucmVuZGVyVHlwZSA9PT0gUmVuZGVyTGluZU51bWJlcnNUeXBlLkludGVydmFsKSB7XG5cdFx0XHRjb25zdCBjdXJzb3JQb3NpdGlvbiA9IHRoaXMuX2VkaXRvck9icy5jdXJzb3JQb3NpdGlvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAobGluZU51bWJlciAlIDEwID09PSAwIHx8IGN1cnNvclBvc2l0aW9uICYmIGN1cnNvclBvc2l0aW9uLmxpbmVOdW1iZXIgPT09IGxpbmVOdW1iZXIpIHtcblx0XHRcdFx0cmV0dXJuIGxpbmVOdW1iZXIudG9TdHJpbmcoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRpZiAobGluZU51bWJlck9wdGlvbnMucmVuZGVyVHlwZSA9PT0gUmVuZGVyTGluZU51bWJlcnNUeXBlLlJlbGF0aXZlKSB7XG5cdFx0XHRjb25zdCBjdXJzb3JQb3NpdGlvbiA9IHRoaXMuX2VkaXRvck9icy5jdXJzb3JQb3NpdGlvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWN1cnNvclBvc2l0aW9uKSB7XG5cdFx0XHRcdHJldHVybiAnJztcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlbGF0aXZlTGluZU51bWJlciA9IE1hdGguYWJzKGxpbmVOdW1iZXIgLSBjdXJzb3JQb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRcdGlmIChyZWxhdGl2ZUxpbmVOdW1iZXIgPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIGxpbmVOdW1iZXIudG9TdHJpbmcoKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZWxhdGl2ZUxpbmVOdW1iZXIudG9TdHJpbmcoKTtcblx0XHR9XG5cblx0XHRpZiAobGluZU51bWJlck9wdGlvbnMucmVuZGVyVHlwZSA9PT0gUmVuZGVyTGluZU51bWJlcnNUeXBlLkN1c3RvbSkge1xuXHRcdFx0aWYgKGxpbmVOdW1iZXJPcHRpb25zLnJlbmRlckZuKSB7XG5cdFx0XHRcdHJldHVybiBsaW5lTnVtYmVyT3B0aW9ucy5yZW5kZXJGbihsaW5lTnVtYmVyKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cblx0XHRyZXR1cm4gbGluZU51bWJlci50b1N0cmluZygpO1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9hdmFpbGFibGVXaWR0aEZvckljb24gPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5fZWRpdG9yT2JzLmVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IGVkaXRvciA9IHRoaXMuX2VkaXRvck9icy5lZGl0b3I7XG5cdFx0Y29uc3QgbGF5b3V0ID0gdGhpcy5fZWRpdG9yT2JzLmxheW91dEluZm8ucmVhZChyZWFkZXIpO1xuXHRcdGNvbnN0IGd1dHRlcldpZHRoID0gbGF5b3V0LmRlY29yYXRpb25zTGVmdCArIGxheW91dC5kZWNvcmF0aW9uc1dpZHRoIC0gbGF5b3V0LmdseXBoTWFyZ2luTGVmdDtcblxuXHRcdGlmICghdGV4dE1vZGVsIHx8IGd1dHRlcldpZHRoIDw9IDApIHtcblx0XHRcdHJldHVybiAoKSA9PiAwO1xuXHRcdH1cblxuXHRcdC8vIG5vIGdseXBoIG1hcmdpbiA9PiB0aGUgZW50aXJlIGd1dHRlciB3aWR0aCBpcyBhdmFpbGFibGUgYXMgdGhlcmUgaXMgbm8gb3B0aW1hbCBwbGFjZSB0byBwdXQgdGhlIGljb25cblx0XHRpZiAobGF5b3V0LmxpbmVOdW1iZXJzTGVmdCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuICgpID0+IGd1dHRlcldpZHRoO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVOdW1iZXJPcHRpb25zID0gdGhpcy5fZWRpdG9yT2JzLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZU51bWJlcnMpLnJlYWQocmVhZGVyKTtcblx0XHRpZiAobGluZU51bWJlck9wdGlvbnMucmVuZGVyVHlwZSA9PT0gUmVuZGVyTGluZU51bWJlcnNUeXBlLlJlbGF0aXZlIHx8IC8qIGxpa2VseSB0byBmbGlja2VyICovXG5cdFx0XHRsaW5lTnVtYmVyT3B0aW9ucy5yZW5kZXJUeXBlID09PSBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuT2ZmKSB7XG5cdFx0XHRyZXR1cm4gKCkgPT4gZ3V0dGVyV2lkdGg7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdyA9IGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmZvbnRJbmZvKS50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg7XG5cdFx0Y29uc3QgcmlnaHRPZkxpbmVOdW1iZXIgPSBsYXlvdXQubGluZU51bWJlcnNMZWZ0ICsgbGF5b3V0LmxpbmVOdW1iZXJzV2lkdGg7XG5cdFx0Y29uc3QgdG90YWxMaW5lcyA9IHRleHRNb2RlbC5nZXRMaW5lQ291bnQoKTtcblx0XHRjb25zdCB0b3RhbExpbmVzRGlnaXRzID0gKHRvdGFsTGluZXMgKyAxIC8qIDAgYmFzZWQgdG8gMSBiYXNlZCovKS50b1N0cmluZygpLmxlbmd0aDtcblxuXHRcdGNvbnN0IG9mZnNldERpZ2l0czoge1xuXHRcdFx0Zmlyc3RMaW5lTnVtYmVyV2l0aERpZ2l0Q291bnQ6IG51bWJlcjtcblx0XHRcdHRvcE9mTGluZU51bWJlcjogbnVtYmVyO1xuXHRcdFx0dXNhYmxlV2lkdGhMZWZ0T2ZMaW5lTnVtYmVyOiBudW1iZXI7XG5cdFx0fVtdID0gW107XG5cblx0XHQvLyBXZSBvbmx5IG5lZWQgdG8gcHJlIGNvbXB1dGUgdGhlIHVzYWJsZSB3aWR0aCBsZWZ0IG9mIHRoZSBsaW5lIG51bWJlciBmb3IgdGhlIGZpcnN0IGxpbmUgbnVtYmVyIHdpdGggYSBnaXZlbiBkaWdpdCBjb3VudFxuXHRcdGZvciAobGV0IGRpZ2l0cyA9IDE7IGRpZ2l0cyA8PSB0b3RhbExpbmVzRGlnaXRzOyBkaWdpdHMrKykge1xuXHRcdFx0Y29uc3QgZmlyc3RMaW5lTnVtYmVyV2l0aERpZ2l0Q291bnQgPSAxMCAqKiAoZGlnaXRzIC0gMSk7XG5cdFx0XHRjb25zdCB0b3BPZkxpbmVOdW1iZXIgPSBlZGl0b3IuZ2V0VG9wRm9yTGluZU51bWJlcihmaXJzdExpbmVOdW1iZXJXaXRoRGlnaXRDb3VudCk7XG5cdFx0XHRjb25zdCBkaWdpdHNXaWR0aCA9IGRpZ2l0cyAqIHc7XG5cdFx0XHRjb25zdCB1c2FibGVXaWR0aExlZnRPZkxpbmVOdW1iZXIgPSBNYXRoLm1pbihndXR0ZXJXaWR0aCwgTWF0aC5tYXgoMCwgcmlnaHRPZkxpbmVOdW1iZXIgLSBkaWdpdHNXaWR0aCAtIGxheW91dC5nbHlwaE1hcmdpbkxlZnQpKTtcblx0XHRcdG9mZnNldERpZ2l0cy5wdXNoKHsgZmlyc3RMaW5lTnVtYmVyV2l0aERpZ2l0Q291bnQsIHRvcE9mTGluZU51bWJlciwgdXNhYmxlV2lkdGhMZWZ0T2ZMaW5lTnVtYmVyIH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiAodG9wT2Zmc2V0OiBudW1iZXIpID0+IHtcblx0XHRcdGZvciAobGV0IGkgPSBvZmZzZXREaWdpdHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdFx0aWYgKHRvcE9mZnNldCA+PSBvZmZzZXREaWdpdHNbaV0udG9wT2ZMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG9mZnNldERpZ2l0c1tpXS51c2FibGVXaWR0aExlZnRPZkxpbmVOdW1iZXI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0NvdWxkIG5vdCBmaW5kIGF2aWxhYmxlIHdpZHRoIGZvciBpY29uJyk7XG5cdFx0fTtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGF5b3V0ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHMgPSB0aGlzLl9zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFzKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdGNvbnN0IGxheW91dCA9IHRoaXMuX2VkaXRvck9icy5sYXlvdXRJbmZvLnJlYWQocmVhZGVyKTtcblxuXHRcdGNvbnN0IGxpbmVIZWlnaHQgPSB0aGlzLl9lZGl0b3JPYnMub2JzZXJ2ZUxpbmVIZWlnaHRGb3JMaW5lKHMucmFuZ2UubWFwKHIgPT4gci5zdGFydExpbmVOdW1iZXIpKS5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgZ3V0dGVyVmlld1BvcnRQYWRkaW5nTGVmdCA9IDE7XG5cdFx0Y29uc3QgZ3V0dGVyVmlld1BvcnRQYWRkaW5nVG9wID0gMjtcblxuXHRcdC8vIEVudGlyZSBndXR0ZXIgdmlldyBmcm9tIHRvcCBsZWZ0IHRvIGJvdHRvbSByaWdodFxuXHRcdGNvbnN0IGd1dHRlcldpZHRoV2l0aG91dFBhZGRpbmcgPSBsYXlvdXQuZGVjb3JhdGlvbnNMZWZ0ICsgbGF5b3V0LmRlY29yYXRpb25zV2lkdGggLSBsYXlvdXQuZ2x5cGhNYXJnaW5MZWZ0IC0gMiAqIGd1dHRlclZpZXdQb3J0UGFkZGluZ0xlZnQ7XG5cdFx0Y29uc3QgZ3V0dGVySGVpZ2h0V2l0aG91dFBhZGRpbmcgPSBsYXlvdXQuaGVpZ2h0IC0gMiAqIGd1dHRlclZpZXdQb3J0UGFkZGluZ1RvcDtcblx0XHRjb25zdCBndXR0ZXJWaWV3UG9ydFdpdGhTdGlja3lTY3JvbGwgPSBSZWN0LmZyb21MZWZ0VG9wV2lkdGhIZWlnaHQoZ3V0dGVyVmlld1BvcnRQYWRkaW5nTGVmdCwgZ3V0dGVyVmlld1BvcnRQYWRkaW5nVG9wLCBndXR0ZXJXaWR0aFdpdGhvdXRQYWRkaW5nLCBndXR0ZXJIZWlnaHRXaXRob3V0UGFkZGluZyk7XG5cdFx0Y29uc3QgZ3V0dGVyVmlld1BvcnRXaXRob3V0U3RpY2t5U2Nyb2xsV2l0aG91dFBhZGRpbmdUb3AgPSBndXR0ZXJWaWV3UG9ydFdpdGhTdGlja3lTY3JvbGwud2l0aFRvcCh0aGlzLl9zdGlja3lTY3JvbGxIZWlnaHQucmVhZChyZWFkZXIpKTtcblx0XHRjb25zdCBndXR0ZXJWaWV3UG9ydFdpdGhvdXRTdGlja3lTY3JvbGwgPSBndXR0ZXJWaWV3UG9ydFdpdGhTdGlja3lTY3JvbGwud2l0aFRvcChndXR0ZXJWaWV3UG9ydFdpdGhvdXRTdGlja3lTY3JvbGxXaXRob3V0UGFkZGluZ1RvcC50b3AgKyBndXR0ZXJWaWV3UG9ydFBhZGRpbmdUb3ApO1xuXG5cdFx0Ly8gVGhlIGdseXBoIG1hcmdpbiBhcmVhIGFjcm9zcyBhbGwgcmVsZXZhbnQgbGluZXNcblx0XHRjb25zdCB2ZXJ0aWNhbEVkaXRSYW5nZSA9IHMubGluZU9mZnNldFJhbmdlLnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBndXR0ZXJFZGl0QXJlYSA9IFJlY3QuZnJvbVJhbmdlcyhPZmZzZXRSYW5nZS5mcm9tVG8oZ3V0dGVyVmlld1BvcnRXaXRob3V0U3RpY2t5U2Nyb2xsLmxlZnQsIGd1dHRlclZpZXdQb3J0V2l0aG91dFN0aWNreVNjcm9sbC5yaWdodCksIHZlcnRpY2FsRWRpdFJhbmdlKTtcblxuXHRcdC8vIFRoZSBndXR0ZXIgdmlldyBjb250YWluZXIgKHBpbGwpXG5cdFx0Y29uc3QgcGlsbEhlaWdodCA9IGxpbmVIZWlnaHQ7XG5cdFx0Y29uc3QgcGlsbE9mZnNldCA9IHRoaXMuX3ZlcnRpY2FsT2Zmc2V0LnJlYWQocmVhZGVyKTtcblx0XHRjb25zdCBwaWxsRnVsbHlEb2NrZWRSZWN0ID0gZ3V0dGVyRWRpdEFyZWEud2l0aEhlaWdodChwaWxsSGVpZ2h0KS50cmFuc2xhdGVZKHBpbGxPZmZzZXQpO1xuXHRcdGNvbnN0IHBpbGxJc0Z1bGx5RG9ja2VkID0gZ3V0dGVyVmlld1BvcnRXaXRob3V0U3RpY2t5U2Nyb2xsV2l0aG91dFBhZGRpbmdUb3AuY29udGFpbnNSZWN0KHBpbGxGdWxseURvY2tlZFJlY3QpO1xuXG5cdFx0Ly8gVGhlIGljb24gd2hpY2ggd2lsbCBiZSByZW5kZXJlZCBpbiB0aGUgcGlsbFxuXHRcdGNvbnN0IGN1c3RvbUljb24gPSB0aGlzLl9kYXRhLnJlYWQocmVhZGVyKT8uY3VzdG9taXphdGlvbj8uaWNvbjtcblx0XHRjb25zdCBpY29uTm9uZURvY2tlZCA9IGN1c3RvbUljb25cblx0XHRcdD8gY29uc3RPYnNlcnZhYmxlKGN1c3RvbUljb24pXG5cdFx0XHQ6IHRoaXMuX3RhYkFjdGlvbi5tYXAoYWN0aW9uID0+IGFjdGlvbiA9PT0gSW5saW5lRWRpdFRhYkFjdGlvbi5BY2NlcHQgPyBDb2RpY29uLmtleWJvYXJkVGFiIDogQ29kaWNvbi5hcnJvd1JpZ2h0KTtcblx0XHRjb25zdCBpY29uRG9ja2VkID0gY3VzdG9tSWNvblxuXHRcdFx0PyBjb25zdE9ic2VydmFibGUoY3VzdG9tSWNvbilcblx0XHRcdDogZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5faXNIb3ZlcmVkT3Zlckljb25EZWJvdW5jZWQucmVhZChyZWFkZXIpIHx8IHRoaXMuX2lzSG92ZXJlZE92ZXJJbmxpbmVFZGl0RGVib3VuY2VkLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdHJldHVybiBDb2RpY29uLmNoZWNrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLl90YWJBY3Rpb24ucmVhZChyZWFkZXIpID09PSBJbmxpbmVFZGl0VGFiQWN0aW9uLkFjY2VwdCkge1xuXHRcdFx0XHRcdHJldHVybiBDb2RpY29uLmtleWJvYXJkVGFiO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGN1cnNvckxpbmVOdW1iZXIgPSB0aGlzLl9lZGl0b3JPYnMuY3Vyc29yTGluZU51bWJlci5yZWFkKHJlYWRlcikgPz8gMDtcblx0XHRcdFx0Y29uc3QgZWRpdFN0YXJ0TGluZU51bWJlciA9IHMucmFuZ2UucmVhZChyZWFkZXIpLnN0YXJ0TGluZU51bWJlcjtcblx0XHRcdFx0cmV0dXJuIGN1cnNvckxpbmVOdW1iZXIgPD0gZWRpdFN0YXJ0TGluZU51bWJlciA/IENvZGljb24ua2V5Ym9hcmRUYWJBYm92ZSA6IENvZGljb24ua2V5Ym9hcmRUYWJCZWxvdztcblx0XHRcdH0pO1xuXG5cdFx0Y29uc3QgaWRlYWxJY29uQXJlYVdpZHRoID0gMjI7XG5cdFx0Y29uc3QgaWNvbldpZHRoID0gKHBpbGxSZWN0OiBSZWN0KSA9PiB7XG5cdFx0XHRjb25zdCBhdmFpbGFibGVJY29uQXJlYVdpZHRoID0gdGhpcy5fYXZhaWxhYmxlV2lkdGhGb3JJY29uLnJlYWQodW5kZWZpbmVkKShwaWxsUmVjdC5ib3R0b20gKyB0aGlzLl9lZGl0b3JPYnMuZWRpdG9yLmdldFNjcm9sbFRvcCgpKSAtIGd1dHRlclZpZXdQb3J0UGFkZGluZ0xlZnQ7XG5cdFx0XHRyZXR1cm4gTWF0aC5tYXgoTWF0aC5taW4oYXZhaWxhYmxlSWNvbkFyZWFXaWR0aCwgaWRlYWxJY29uQXJlYVdpZHRoKSwgQ09ESUNPTl9TSVpFX1BYKTtcblx0XHR9O1xuXG5cdFx0aWYgKHBpbGxJc0Z1bGx5RG9ja2VkKSB7XG5cdFx0XHRjb25zdCBwaWxsUmVjdCA9IHBpbGxGdWxseURvY2tlZFJlY3Q7XG5cblx0XHRcdGxldCB3aWR0aFVudGlsTGluZU51bWJlckVuZDtcblx0XHRcdGlmIChsYXlvdXQubGluZU51bWJlcnNXaWR0aCA9PT0gMCkge1xuXHRcdFx0XHR3aWR0aFVudGlsTGluZU51bWJlckVuZCA9IE1hdGgubWF4KDAsIE1hdGgubWluKE1hdGgubWF4KGxheW91dC5saW5lTnVtYmVyc0xlZnQgLSBndXR0ZXJWaWV3UG9ydFdpdGhTdGlja3lTY3JvbGwubGVmdCwgMCksIHBpbGxSZWN0LndpZHRoIC0gaWRlYWxJY29uQXJlYVdpZHRoKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR3aWR0aFVudGlsTGluZU51bWJlckVuZCA9IE1hdGgubWF4KGxheW91dC5saW5lTnVtYmVyc0xlZnQgKyBsYXlvdXQubGluZU51bWJlcnNXaWR0aCAtIGd1dHRlclZpZXdQb3J0V2l0aFN0aWNreVNjcm9sbC5sZWZ0LCAwKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbGluZU51bWJlclJlY3QgPSBwaWxsUmVjdC53aXRoV2lkdGgod2lkdGhVbnRpbExpbmVOdW1iZXJFbmQpO1xuXHRcdFx0Y29uc3QgbWluaW1hbEljb25XaWR0aFdpdGhQYWRkaW5nID0gQ09ESUNPTl9TSVpFX1BYICsgQ09ESUNPTl9QQURESU5HX1BYO1xuXHRcdFx0Y29uc3QgaWNvbldpZHRoID0gTWF0aC5taW4ocGlsbFJlY3Qud2lkdGggLSB3aWR0aFVudGlsTGluZU51bWJlckVuZCwgaWRlYWxJY29uQXJlYVdpZHRoKTtcblx0XHRcdGNvbnN0IGljb25SZWN0ID0gcGlsbFJlY3Qud2l0aFdpZHRoKE1hdGgubWF4KGljb25XaWR0aCwgbWluaW1hbEljb25XaWR0aFdpdGhQYWRkaW5nKSkudHJhbnNsYXRlWCh3aWR0aFVudGlsTGluZU51bWJlckVuZCk7XG5cdFx0XHRjb25zdCBpY29uVmlzaWJsZSA9IGljb25XaWR0aCA+PSBtaW5pbWFsSWNvbldpZHRoV2l0aFBhZGRpbmc7XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGd1dHRlckVkaXRBcmVhLFxuXHRcdFx0XHRpY29uOiBpY29uRG9ja2VkLFxuXHRcdFx0XHRpY29uRGlyZWN0aW9uOiAncmlnaHQnIGFzIGNvbnN0LFxuXHRcdFx0XHRpY29uUmVjdCxcblx0XHRcdFx0aWNvblZpc2libGUsXG5cdFx0XHRcdHBpbGxSZWN0LFxuXHRcdFx0XHRsaW5lTnVtYmVyUmVjdCxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGlsbFBhcnRpYWxseURvY2tlZFBvc3NpYmxlQXJlYSA9IGd1dHRlclZpZXdQb3J0V2l0aFN0aWNreVNjcm9sbC5pbnRlcnNlY3QoZ3V0dGVyRWRpdEFyZWEpOyAvLyBUaGUgYXJlYSBpbiB3aGljaCB0aGUgcGlsbCBjb3VsZCBiZSBwYXJ0aWFsbHkgZG9ja2VkXG5cdFx0Y29uc3QgcGlsbElzUGFydGlhbGx5RG9ja2VkID0gcGlsbFBhcnRpYWxseURvY2tlZFBvc3NpYmxlQXJlYSAmJiBwaWxsUGFydGlhbGx5RG9ja2VkUG9zc2libGVBcmVhLmhlaWdodCA+PSBwaWxsSGVpZ2h0O1xuXG5cdFx0aWYgKHBpbGxJc1BhcnRpYWxseURvY2tlZCkge1xuXHRcdFx0Ly8gcGlsbEZ1bGx5RG9ja2VkUmVjdCBpcyBvdXRzaWRlIHZpZXdwb3J0LCBtb3ZlIGl0IGludG8gdGhlIHZpZXdwb3J0IHVuZGVyIHN0aWNreSBzY3JvbGwgYXMgd2UgcHJlZmVyIHRoZSBwaWxsIHRvIG5vdCBiZSBvbiB0b3Agb2YgdGhlIHN0aWNreSBzY3JvbGxcblx0XHRcdC8vIHRoZW4gbW92ZSBpdCBpbnRvIHRoZSBwb3NzaWJsZSBhcmVhIHdoaWNoIHdpbGwgb25seSBjYXVzZSBpdCB0byBtb3ZlIGlmIGl0IGhhcyB0byBiZSByZW5kZXJlZCBvbiB0b3Agb2YgdGhlIHN0aWNreSBzY3JvbGxcblx0XHRcdGNvbnN0IHBpbGxSZWN0TW92ZWQgPSBwaWxsRnVsbHlEb2NrZWRSZWN0Lm1vdmVUb0JlQ29udGFpbmVkSW4oZ3V0dGVyVmlld1BvcnRXaXRob3V0U3RpY2t5U2Nyb2xsKS5tb3ZlVG9CZUNvbnRhaW5lZEluKHBpbGxQYXJ0aWFsbHlEb2NrZWRQb3NzaWJsZUFyZWEpO1xuXHRcdFx0Y29uc3QgcGlsbFJlY3QgPSBwaWxsUmVjdE1vdmVkLndpdGhXaWR0aChpY29uV2lkdGgocGlsbFJlY3RNb3ZlZCkpO1xuXHRcdFx0Y29uc3QgaWNvblJlY3QgPSBwaWxsUmVjdDtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Z3V0dGVyRWRpdEFyZWEsXG5cdFx0XHRcdGljb246IGljb25Eb2NrZWQsXG5cdFx0XHRcdGljb25EaXJlY3Rpb246ICdyaWdodCcgYXMgY29uc3QsXG5cdFx0XHRcdGljb25SZWN0LFxuXHRcdFx0XHRwaWxsUmVjdCxcblx0XHRcdFx0aWNvblZpc2libGU6IHRydWUsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIHBpbGxGdWxseURvY2tlZFJlY3QgaXMgb3V0c2lkZSB2aWV3cG9ydCwgc28gbW92ZSBpdCBpbnRvIHZpZXdwb3J0XG5cdFx0Y29uc3QgcGlsbFJlY3RNb3ZlZCA9IHBpbGxGdWxseURvY2tlZFJlY3QubW92ZVRvQmVDb250YWluZWRJbihndXR0ZXJWaWV3UG9ydFdpdGhTdGlja3lTY3JvbGwpO1xuXHRcdGNvbnN0IHBpbGxSZWN0ID0gcGlsbFJlY3RNb3ZlZC53aXRoV2lkdGgoaWNvbldpZHRoKHBpbGxSZWN0TW92ZWQpKTtcblx0XHRjb25zdCBpY29uUmVjdCA9IHBpbGxSZWN0O1xuXG5cdFx0Ly8gZG9ja2VkID0gcGlsbCB3YXMgYWxyZWFkeSBpbiB0aGUgdmlld3BvcnRcblx0XHRjb25zdCBpY29uRGlyZWN0aW9uID0gcGlsbFJlY3QudG9wIDwgcGlsbEZ1bGx5RG9ja2VkUmVjdC50b3AgP1xuXHRcdFx0J3RvcCcgYXMgY29uc3QgOlxuXHRcdFx0J2JvdHRvbScgYXMgY29uc3Q7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Z3V0dGVyRWRpdEFyZWEsXG5cdFx0XHRpY29uOiBpY29uTm9uZURvY2tlZCxcblx0XHRcdGljb25EaXJlY3Rpb24sXG5cdFx0XHRpY29uUmVjdCxcblx0XHRcdHBpbGxSZWN0LFxuXHRcdFx0aWNvblZpc2libGU6IHRydWUsXG5cdFx0fTtcblx0fSk7XG5cblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2ljb25SZWYgPSBuLnJlZjxIVE1MRGl2RWxlbWVudD4oKTtcblxuXHRwdWJsaWMgcmVhZG9ubHkgaXNWaXNpYmxlID0gdGhpcy5fbGF5b3V0Lm1hcChsID0+ICEhbCk7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9ob3ZlclZpc2libGUgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXHRwdWJsaWMgcmVhZG9ubHkgaXNIb3ZlclZpc2libGU6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gdGhpcy5faG92ZXJWaXNpYmxlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lzSG92ZXJlZE92ZXJJY29uID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGZhbHNlKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaXNIb3ZlcmVkT3Zlckljb25EZWJvdW5jZWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gZGVib3VuY2VkT2JzZXJ2YWJsZSh0aGlzLl9pc0hvdmVyZWRPdmVySWNvbiwgMTAwKTtcblx0cHVibGljIHJlYWRvbmx5IGlzSG92ZXJlZE92ZXJJY29uOiBJT2JzZXJ2YWJsZTxib29sZWFuPiA9IHRoaXMuX2lzSG92ZXJlZE92ZXJJY29uRGVib3VuY2VkO1xuXG5cdHByb3RlY3RlZCBfc2hvd0hvdmVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9ob3ZlclZpc2libGUuZ2V0KCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkYXRhID0gdGhpcy5fZGF0YS5nZXQoKTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHRocm93IG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ0d1dHRlciBpbmRpY2F0b3IgZGF0YSBub3QgYXZhaWxhYmxlJyk7XG5cdFx0fVxuXHRcdGNvbnN0IGRpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjb250ZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdEd1dHRlckluZGljYXRvck1lbnVDb250ZW50LFxuXHRcdFx0dGhpcy5fZWRpdG9yT2JzLFxuXHRcdFx0ZGF0YS5ndXR0ZXJNZW51RGF0YSxcblx0XHRcdChmb2N1c0VkaXRvciwgY29tbWFuZElkKSA9PiB7XG5cdFx0XHRcdGlmIChmb2N1c0VkaXRvcikge1xuXHRcdFx0XHRcdHRoaXMuX2VkaXRvck9icy5lZGl0b3IuZm9jdXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY29tbWFuZElkKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDbG9zZVdpdGhDb21tYW5kLmZpcmUoY29tbWFuZElkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRoPy5kaXNwb3NlKCk7XG5cdFx0XHR9LFxuXHRcdCkudG9EaXNwb3NhYmxlTGl2ZUVsZW1lbnQoKSk7XG5cblx0XHRjb25zdCBpc0ZvY3VzZWQgPSB0aGlzLl91c2VySW50ZXJhY3Rpb25TZXJ2aWNlLmNyZWF0ZUZvY3VzVHJhY2tlcihjb250ZW50LmVsZW1lbnQsIGRpc3Bvc2FibGVTdG9yZSk7IC8vIFRPRE9AYmVuaWJlbmogc2hvdWxkIHRoaXMgYmUgcmVtb3ZlZD9cblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHRoaXMuX2ZvY3VzSXNJbk1lbnUuc2V0KGlzRm9jdXNlZC5yZWFkKHJlYWRlciksIHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX2ZvY3VzSXNJbk1lbnUuc2V0KGZhbHNlLCB1bmRlZmluZWQpKSk7XG5cblx0XHRjb25zdCBoID0gdGhpcy5faG92ZXJTZXJ2aWNlLnNob3dJbnN0YW50SG92ZXIoe1xuXHRcdFx0dGFyZ2V0OiB0aGlzLl9pY29uUmVmLmVsZW1lbnQsXG5cdFx0XHRjb250ZW50OiBjb250ZW50LmVsZW1lbnQsXG5cdFx0fSkgYXMgSG92ZXJXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGgpIHtcblx0XHRcdHRoaXMuX2hvdmVyVmlzaWJsZS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTtcblx0XHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fZWRpdG9yT2JzLmVkaXRvci5vbkRpZFNjcm9sbENoYW5nZSgoKSA9PiBoLmRpc3Bvc2UoKSkpO1xuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZChoLm9uRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2hvdmVyVmlzaWJsZS5zZXQoZmFsc2UsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGRpc3Bvc2FibGVTdG9yZS5kaXNwb3NlKCk7XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRpc3Bvc2FibGVTdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaW5kaWNhdG9yID0gbi5kaXYoe1xuXHRcdGNsYXNzOiAnaW5saW5lLWVkaXRzLXZpZXctZ3V0dGVyLWluZGljYXRvcicsXG5cdFx0c3R5bGU6IHtcblx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0b3ZlcmZsb3c6ICd2aXNpYmxlJyxcblx0XHR9LFxuXHR9LCBtYXBPdXRGYWxzeSh0aGlzLl9sYXlvdXQpLm1hcChsYXlvdXQgPT4gIWxheW91dCA/IFtdIDogW1xuXHRcdG4uZGl2KHtcblx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHRiYWNrZ3JvdW5kOiBhc0Nzc1ZhcmlhYmxlKGlubGluZUVkaXRJbmRpY2F0b3JCYWNrZ3JvdW5kKSxcblx0XHRcdFx0Ym9yZGVyUmFkaXVzOiBgJHtJTkxJTkVfRURJVFNfQk9SREVSX1JBRElVU31weGAsXG5cdFx0XHRcdC4uLnJlY3RUb1Byb3BzKHJlYWRlciA9PiBsYXlvdXQucmVhZChyZWFkZXIpLmd1dHRlckVkaXRBcmVhKSxcblx0XHRcdH1cblx0XHR9KSxcblx0XHRuLmRpdih7XG5cdFx0XHRjbGFzczogJ2ljb24nLFxuXHRcdFx0cmVmOiB0aGlzLl9pY29uUmVmLFxuXG5cdFx0XHR0YWJJbmRleDogMCxcblx0XHRcdG9uY2xpY2s6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgbGF5b3V0ID0gdGhpcy5fbGF5b3V0LmdldCgpO1xuXHRcdFx0XHRjb25zdCBhY2NlcHRPbkNsaWNrID0gbGF5b3V0Py5pY29uLmdldCgpID09PSBDb2RpY29uLmNoZWNrO1xuXG5cdFx0XHRcdGNvbnN0IGRhdGEgPSB0aGlzLl9kYXRhLmdldCgpO1xuXHRcdFx0XHRpZiAoIWRhdGEpIHsgdGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignR3V0dGVyIGluZGljYXRvciBkYXRhIG5vdCBhdmFpbGFibGUnKTsgfVxuXG5cdFx0XHRcdHRoaXMuX2VkaXRvck9icy5lZGl0b3IuZm9jdXMoKTtcblx0XHRcdFx0aWYgKGFjY2VwdE9uQ2xpY2spIHtcblx0XHRcdFx0XHRkYXRhLm1vZGVsLmFjY2VwdCgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRhdGEubW9kZWwuanVtcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXG5cdFx0XHRvbm1vdXNlZW50ZXI6ICgpID0+IHtcblx0XHRcdFx0Ly8gVE9ETyBzaG93IGhvdmVyIHdoZW4gaG92ZXJpbmcgZ2hvc3QgdGV4dCBldGMuXG5cdFx0XHRcdHRoaXMuX3Nob3dIb3ZlcigpO1xuXHRcdFx0fSxcblx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdGN1cnNvcjogJ3BvaW50ZXInLFxuXHRcdFx0XHR6SW5kZXg6ICcyMCcsXG5cdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHRiYWNrZ3JvdW5kQ29sb3I6IHRoaXMuX2d1dHRlckluZGljYXRvclN0eWxlcy5tYXAodiA9PiB2LmJhY2tncm91bmQpLFxuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0WyctLXZzY29kZUljb25Gb3JlZ3JvdW5kJyBhcyBhbnldOiB0aGlzLl9ndXR0ZXJJbmRpY2F0b3JTdHlsZXMubWFwKHYgPT4gdi5mb3JlZ3JvdW5kKSxcblx0XHRcdFx0Ym9yZGVyOiB0aGlzLl9ndXR0ZXJJbmRpY2F0b3JTdHlsZXMubWFwKHYgPT4gYDFweCBzb2xpZCAke3YuYm9yZGVyfWApLFxuXHRcdFx0XHRib3hTaXppbmc6ICdib3JkZXItYm94Jyxcblx0XHRcdFx0Ym9yZGVyUmFkaXVzOiBgJHtJTkxJTkVfRURJVFNfQk9SREVSX1JBRElVU31weGAsXG5cdFx0XHRcdGRpc3BsYXk6ICdmbGV4Jyxcblx0XHRcdFx0anVzdGlmeUNvbnRlbnQ6IGxheW91dC5tYXAobCA9PiBsLmljb25EaXJlY3Rpb24gPT09ICdib3R0b20nID8gJ2ZsZXgtc3RhcnQnIDogJ2ZsZXgtZW5kJyksXG5cdFx0XHRcdHRyYW5zaXRpb246IHRoaXMuX21vZGlmaWVyUHJlc3NlZC5tYXAobSA9PiBtID8gJycgOiAnYmFja2dyb3VuZC1jb2xvciAwLjJzIGVhc2UtaW4tb3V0LCB3aWR0aCAwLjJzIGVhc2UtaW4tb3V0JyksXG5cdFx0XHRcdC4uLnJlY3RUb1Byb3BzKHJlYWRlciA9PiBsYXlvdXQucmVhZChyZWFkZXIpLnBpbGxSZWN0KSxcblx0XHRcdH1cblx0XHR9LCBbXG5cdFx0XHRuLmRpdih7XG5cdFx0XHRcdGNsYXNzTmFtZTogJ2xpbmUtbnVtYmVyJyxcblx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRsaW5lSGVpZ2h0OiBsYXlvdXQubWFwKGwgPT4gbC5saW5lTnVtYmVyUmVjdCA/IGwubGluZU51bWJlclJlY3QuaGVpZ2h0IDogMCksXG5cdFx0XHRcdFx0ZGlzcGxheTogbGF5b3V0Lm1hcChsID0+IGwubGluZU51bWJlclJlY3QgPyAnZmxleCcgOiAnbm9uZScpLFxuXHRcdFx0XHRcdGFsaWduSXRlbXM6ICdjZW50ZXInLFxuXHRcdFx0XHRcdGp1c3RpZnlDb250ZW50OiAnZmxleC1lbmQnLFxuXHRcdFx0XHRcdHdpZHRoOiBsYXlvdXQubWFwKGwgPT4gbC5saW5lTnVtYmVyUmVjdCA/IGwubGluZU51bWJlclJlY3Qud2lkdGggOiAwKSxcblx0XHRcdFx0XHRoZWlnaHQ6ICcxMDAlJyxcblx0XHRcdFx0XHRjb2xvcjogdGhpcy5fZ3V0dGVySW5kaWNhdG9yU3R5bGVzLm1hcCh2ID0+IHYuZm9yZWdyb3VuZCksXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRcdHRoaXMuX2xpbmVOdW1iZXJUb1JlbmRlclxuXHRcdFx0KSxcblx0XHRcdG4uZGl2KHtcblx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHR0cmFuc2Zvcm06IGxheW91dC5tYXAobCA9PiBgcm90YXRlKCR7Z2V0Um90YXRpb25Gcm9tRGlyZWN0aW9uKGwuaWNvbkRpcmVjdGlvbil9ZGVnKWApLFxuXHRcdFx0XHRcdHRyYW5zaXRpb246ICdyb3RhdGUgMC4ycyBlYXNlLWluLW91dCwgb3BhY2l0eSAwLjJzIGVhc2UtaW4tb3V0Jyxcblx0XHRcdFx0XHRkaXNwbGF5OiAnZmxleCcsXG5cdFx0XHRcdFx0YWxpZ25JdGVtczogJ2NlbnRlcicsXG5cdFx0XHRcdFx0anVzdGlmeUNvbnRlbnQ6ICdjZW50ZXInLFxuXHRcdFx0XHRcdGhlaWdodDogJzEwMCUnLFxuXHRcdFx0XHRcdG9wYWNpdHk6IGxheW91dC5tYXAobCA9PiBsLmljb25WaXNpYmxlID8gJzEnIDogJzAnKSxcblx0XHRcdFx0XHRtYXJnaW5SaWdodDogbGF5b3V0Lm1hcChsID0+IGwucGlsbFJlY3Qud2lkdGggLSBsLmljb25SZWN0LndpZHRoIC0gKGwubGluZU51bWJlclJlY3Q/LndpZHRoID8/IDApKSxcblx0XHRcdFx0XHR3aWR0aDogbGF5b3V0Lm1hcChsID0+IGwuaWNvblJlY3Qud2lkdGgpLFxuXHRcdFx0XHRcdHBvc2l0aW9uOiAncmVsYXRpdmUnLFxuXHRcdFx0XHRcdHJpZ2h0OiBsYXlvdXQubWFwKGwgPT4gbC5pY29uRGlyZWN0aW9uID09PSAndG9wJyA/ICcxcHgnIDogJzAnKSxcblx0XHRcdFx0XHRjb2xvcjogdGhpcy5fZGF0YS5tYXAoZCA9PiBkPy5jdXN0b21pemF0aW9uPy5pY29uPy5jb2xvciA/IGFzQ3NzVmFyaWFibGUoZC5jdXN0b21pemF0aW9uLmljb24uY29sb3IuaWQpIDogdW5kZWZpbmVkKSxcblx0XHRcdFx0fVxuXHRcdFx0fSwgW1xuXHRcdFx0XHRsYXlvdXQubWFwKChsLCByZWFkZXIpID0+IHdpdGhTdHlsZXMocmVuZGVySWNvbihsLmljb24ucmVhZChyZWFkZXIpKSwgeyBmb250U2l6ZTogdG9QeChNYXRoLm1pbihsLmljb25SZWN0LndpZHRoIC0gQ09ESUNPTl9QQURESU5HX1BYLCBDT0RJQ09OX1NJWkVfUFgpKSB9KSksXG5cdFx0XHRdKVxuXHRcdF0pLFxuXHRdKSk7XG59XG5cbmZ1bmN0aW9uIGdldFJvdGF0aW9uRnJvbURpcmVjdGlvbihkaXJlY3Rpb246ICd0b3AnIHwgJ2JvdHRvbScgfCAncmlnaHQnKTogbnVtYmVyIHtcblx0c3dpdGNoIChkaXJlY3Rpb24pIHtcblx0XHRjYXNlICd0b3AnOiByZXR1cm4gOTA7XG5cdFx0Y2FzZSAnYm90dG9tJzogcmV0dXJuIC05MDtcblx0XHRjYXNlICdyaWdodCc6IHJldHVybiAwO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHdpdGhTdHlsZXM8VCBleHRlbmRzIEhUTUxFbGVtZW50PihlbGVtZW50OiBULCBzdHlsZXM6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0pOiBUIHtcblx0Zm9yIChjb25zdCBrZXkgaW4gc3R5bGVzKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0ZWxlbWVudC5zdHlsZVtrZXkgYXMgYW55XSA9IHN0eWxlc1trZXldO1xuXHR9XG5cdHJldHVybiBlbGVtZW50O1xufVxuXG5mdW5jdGlvbiB0b1B4KG46IG51bWJlcik6IHN0cmluZyB7XG5cdHJldHVybiBgJHtufXB4YDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxTQUFTO0FBQ2xCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFlBQVksaUJBQWlCLG9CQUFvQjtBQUMxRCxTQUEyQyxTQUFTLGlCQUFpQixxQkFBcUIsU0FBUyxxQkFBcUIsaUJBQWlCLG1CQUFtQjtBQUM1SixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFxQjtBQUc5QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZO0FBR3JCLFNBQVMsY0FBYyw2QkFBNkI7QUFFcEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUywyQkFBMkI7QUFDcEMsU0FB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O0FBQUEsUUFDM0M7QUFDQSxXQUFHLFFBQVE7QUFBQSxNQUNaO0FBQUEsSUFDRCxFQUFFLHdCQUF3QixDQUFDO0FBRTNCLFVBQU0sWUFBWSxLQUFLLHdCQUF3QixtQkFBbUIsUUFBUSxTQUFTLGVBQWU7QUFDbEcsb0JBQWdCLElBQUksUUFBUSxZQUFVO0FBQ3JDLFdBQUssZUFBZSxJQUFJLFVBQVUsS0FBSyxNQUFNLEdBQUcsTUFBUztBQUFBLElBQzFELENBQUMsQ0FBQztBQUNGLG9CQUFnQixJQUFJLGFBQWEsTUFBTSxLQUFLLGVBQWUsSUFBSSxPQUFPLE1BQVMsQ0FBQyxDQUFDO0FBRWpGLFVBQU0sSUFBSSxLQUFLLGNBQWMsaUJBQWlCO0FBQUEsTUFDN0MsUUFBUSxLQUFLLFNBQVM7QUFBQSxNQUN0QixTQUFTLFFBQVE7QUFBQSxJQUNsQixDQUFDO0FBQ0QsUUFBSSxHQUFHO0FBQ04sV0FBSyxjQUFjLElBQUksTUFBTSxNQUFTO0FBQ3RDLHNCQUFnQixJQUFJLEtBQUssV0FBVyxPQUFPLGtCQUFrQixNQUFNLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDL0Usc0JBQWdCLElBQUksRUFBRSxVQUFVLE1BQU07QUFDckMsYUFBSyxjQUFjLElBQUksT0FBTyxNQUFTO0FBQ3ZDLHdCQUFnQixRQUFRO0FBQUEsTUFDekIsQ0FBQyxDQUFDO0FBQUEsSUFDSCxPQUFPO0FBQ04sc0JBQWdCLFFBQVE7QUFBQSxJQUN6QjtBQUFBLEVBQ0Q7QUEyRkQ7QUF0ZmEsNkJBQU47QUFBQSxFQWFKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBakJVO0FBd2ZiLFNBQVMseUJBQXlCLFdBQStDO0FBQ2hGLFVBQVEsV0FBVztBQUFBLElBQ2xCLEtBQUs7QUFBTyxhQUFPO0FBQUEsSUFDbkIsS0FBSztBQUFVLGFBQU87QUFBQSxJQUN0QixLQUFLO0FBQVMsYUFBTztBQUFBLEVBQ3RCO0FBQ0Q7QUFFQSxTQUFTLFdBQWtDLFNBQVksUUFBc0M7QUFDNUYsYUFBVyxPQUFPLFFBQVE7QUFFekIsWUFBUSxNQUFNLEdBQVUsSUFBSSxPQUFPLEdBQUc7QUFBQSxFQUN2QztBQUNBLFNBQU87QUFDUjtBQUVBLFNBQVMsS0FBS0MsSUFBbUI7QUFDaEMsU0FBTyxHQUFHQSxFQUFDO0FBQ1o7IiwKICAibmFtZXMiOiBbInJlYWRlciIsICJwaWxsUmVjdCIsICJpY29uV2lkdGgiLCAiaWNvblJlY3QiLCAicGlsbFJlY3RNb3ZlZCIsICJsYXlvdXQiLCAibiJdCn0K
