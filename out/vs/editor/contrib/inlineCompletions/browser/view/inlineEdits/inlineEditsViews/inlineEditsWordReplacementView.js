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
import { $, n } from "../../../../../../../base/browser/dom.js";
import { renderIcon } from "../../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { KeybindingLabel, unthemedKeybindingLabelOptions } from "../../../../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { Emitter } from "../../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { constObservable, derived, observableFromEvent, observableFromPromise, observableValue } from "../../../../../../../base/common/observable.js";
import { OS } from "../../../../../../../base/common/platform.js";
import { localize } from "../../../../../../../nls.js";
import { IHoverService } from "../../../../../../../platform/hover/browser/hover.js";
import { IKeybindingService } from "../../../../../../../platform/keybinding/common/keybinding.js";
import { editorHoverForeground } from "../../../../../../../platform/theme/common/colorRegistry.js";
import { contrastBorder } from "../../../../../../../platform/theme/common/colors/baseColors.js";
import { asCssVariable } from "../../../../../../../platform/theme/common/colorUtils.js";
import { IThemeService } from "../../../../../../../platform/theme/common/themeService.js";
import { LineSource, renderLines, RenderOptions } from "../../../../../../browser/widget/diffEditor/components/diffEditorViewZones/renderLines.js";
import { EditorOption } from "../../../../../../common/config/editorOptions.js";
import { Point } from "../../../../../../common/core/2d/point.js";
import { Rect } from "../../../../../../common/core/2d/rect.js";
import { StringReplacement } from "../../../../../../common/core/edits/stringEdit.js";
import { OffsetRange } from "../../../../../../common/core/ranges/offsetRange.js";
import { ILanguageService } from "../../../../../../common/languages/language.js";
import { LineTokens, TokenArray } from "../../../../../../common/tokens/lineTokens.js";
import { inlineSuggestCommitAlternativeActionId } from "../../../controller/commandIds.js";
import { InlineEditClickEvent } from "../inlineEditsViewInterface.js";
import { getEditorBackgroundColor, getModifiedBorderColor, getOriginalBorderColor, INLINE_EDITS_BORDER_RADIUS, inlineEditIndicatorPrimaryBackground, inlineEditIndicatorPrimaryBorder, inlineEditIndicatorPrimaryForeground, modifiedChangedTextOverlayColor, observeColor, originalChangedTextOverlayColor } from "../theme.js";
import { getEditorValidOverlayRect, mapOutFalsy, rectToProps } from "../utils/utils.js";
import { IUserInteractionService } from "../../../../../../../platform/userInteraction/browser/userInteractionService.js";
class WordReplacementsViewData {
  constructor(edit, editorType, alternativeAction) {
    this.edit = edit;
    this.editorType = editorType;
    this.alternativeAction = alternativeAction;
  }
  equals(other) {
    return this.edit.equals(other.edit) && this.alternativeAction === other.alternativeAction;
  }
}
const BORDER_WIDTH = 1;
const DOM_ID_OVERLAY = "word-replacement-view-overlay";
const DOM_ID_WIDGET = "word-replacement-view-widget";
const DOM_ID_REPLACEMENT = "word-replacement-view-replacement";
const DOM_ID_RENAME = "word-replacement-view-rename";
let InlineEditsWordReplacementView = class extends Disposable {
  constructor(_editor, _viewData, _tabAction, _languageService, _themeService, _keybindingService, _hoverService, _userInteractionService) {
    super();
    this._editor = _editor;
    this._viewData = _viewData;
    this._tabAction = _tabAction;
    this._languageService = _languageService;
    this._themeService = _themeService;
    this._keybindingService = _keybindingService;
    this._hoverService = _hoverService;
    this._userInteractionService = _userInteractionService;
    this._onDidClick = this._register(new Emitter());
    this.onDidClick = this._onDidClick.event;
    this._start = this._editor.observePosition(constObservable(this._viewData.edit.range.getStartPosition()), this._store);
    this._end = this._editor.observePosition(constObservable(this._viewData.edit.range.getEndPosition()), this._store);
    this._line = document.createElement("div");
    this._primaryElement = observableValue(this, null);
    this._secondaryElement = observableValue(this, null);
    this.isHovered = derived(this, (reader) => {
      const elem = this._primaryElement.read(reader);
      if (!elem) {
        return false;
      }
      return this._userInteractionService.createHoverTracker(elem.element, reader.store).read(reader);
    });
    this._renderTextEffect = derived(this, (_reader) => {
      const tm = this._editor.model.read(void 0);
      if (!tm) {
        return;
      }
      const origLine = tm.getLineContent(this._viewData.edit.range.startLineNumber);
      const edit = StringReplacement.replace(new OffsetRange(this._viewData.edit.range.startColumn - 1, this._viewData.edit.range.endColumn - 1), this._viewData.edit.text);
      const lineToTokenize = edit.replace(origLine);
      const t = tm.tokenization.tokenizeLinesAt(this._viewData.edit.range.startLineNumber, [lineToTokenize])?.[0];
      let tokens;
      if (t) {
        tokens = TokenArray.fromLineTokens(t).slice(edit.getRangeAfterReplace()).toLineTokens(this._viewData.edit.text, this._languageService.languageIdCodec);
      } else {
        tokens = LineTokens.createEmpty(this._viewData.edit.text, this._languageService.languageIdCodec);
      }
      const res = renderLines(new LineSource([tokens]), RenderOptions.fromEditor(this._editor.editor).withSetWidth(false).withScrollBeyondLastColumn(0), [], this._line, true);
      this._line.style.width = `${res.minWidthInPx}px`;
    });
    const modifiedLineHeight = this._editor.observeLineHeightForPosition(this._viewData.edit.range.getStartPosition());
    const altCount = observableFromPromise(this._viewData.alternativeAction?.count ?? new Promise((resolve) => resolve(void 0))).map((c) => c.value);
    const altModifierActive = derived(this, (reader) => this._userInteractionService.readModifierKeyStatus(this._editor.editor.getDomNode(), reader).shiftKey);
    this._layout = derived(this, (reader) => {
      this._renderTextEffect.read(reader);
      const widgetStart = this._start.read(reader);
      const widgetEnd = this._end.read(reader);
      if (!widgetStart || !widgetEnd || widgetStart.x > widgetEnd.x || widgetStart.y > widgetEnd.y) {
        return void 0;
      }
      const lineHeight = modifiedLineHeight.read(reader);
      if (lineHeight <= 0) {
        return void 0;
      }
      const scrollLeft = this._editor.scrollLeft.read(reader);
      const w = this._editor.getOption(EditorOption.fontInfo).read(reader).typicalHalfwidthCharacterWidth;
      const modifiedLeftOffset = 3 * w;
      const modifiedTopOffset = 4;
      const modifiedOffset = new Point(modifiedLeftOffset, modifiedTopOffset);
      let alternativeAction = void 0;
      if (this._viewData.alternativeAction) {
        const label = this._viewData.alternativeAction.label;
        const count = altCount.read(reader);
        const active = altModifierActive.read(reader);
        const occurrencesLabel = count !== void 0 ? count === 1 ? localize("labelOccurence", "{0} 1 occurrence", label) : localize("labelOccurences", "{0} {1} occurrences", label, count) : label;
        const keybindingTooltip = localize("shiftToSeeOccurences", "{0} show occurrences", "[shift]");
        alternativeAction = {
          label: count !== void 0 ? active ? occurrencesLabel : label : label,
          tooltip: occurrencesLabel ? `${occurrencesLabel}
${keybindingTooltip}` : void 0,
          icon: void 0,
          //this._viewData.alternativeAction.icon, Do not render icon fo the moment
          count,
          keybinding: this._keybindingService.lookupKeybinding(inlineSuggestCommitAlternativeActionId),
          active: altModifierActive
        };
      }
      const originalLine = Rect.fromPoints(widgetStart, widgetEnd).withHeight(lineHeight).translateX(-scrollLeft);
      const codeLine = Rect.fromPointSize(originalLine.getLeftBottom().add(modifiedOffset), new Point(this._viewData.edit.text.length * w, originalLine.height));
      const modifiedLine = codeLine.withWidth(codeLine.width + (alternativeAction ? alternativeAction.label.length * w + 8 + 4 + 12 : 0));
      const lowerBackground = modifiedLine.withLeft(originalLine.left);
      return {
        alternativeAction,
        originalLine,
        codeLine,
        modifiedLine,
        lowerBackground,
        lineHeight
      };
    });
    this.minEditorScrollHeight = derived(this, (reader) => {
      const layout = mapOutFalsy(this._layout).read(reader);
      if (!layout) {
        return 0;
      }
      return layout.read(reader).modifiedLine.bottom + BORDER_WIDTH + this._editor.editor.getScrollTop();
    });
    this._root = n.div({
      class: "word-replacement"
    }, [
      derived(this, (reader) => {
        const layout = mapOutFalsy(this._layout).read(reader);
        if (!layout) {
          return [];
        }
        const originalBorderColor = getOriginalBorderColor(this._tabAction).map((c) => asCssVariable(c)).read(reader);
        const modifiedBorderColor = getModifiedBorderColor(this._tabAction).map((c) => asCssVariable(c)).read(reader);
        this._line.style.lineHeight = `${layout.read(reader).modifiedLine.height + 2 * BORDER_WIDTH}px`;
        const secondaryElementHovered = constObservable(false);
        const alternativeAction = layout.map((l) => l.alternativeAction);
        const alternativeActionActive = derived((reader2) => (alternativeAction.read(reader2)?.active.read(reader2) ?? false) || secondaryElementHovered.read(reader2));
        const isHighContrast = observableFromEvent(this._themeService.onDidColorThemeChange, () => {
          const theme = this._themeService.getColorTheme();
          return theme.type === "hcDark" || theme.type === "hcLight";
        }).read(reader);
        const hcBorderColor = isHighContrast ? observeColor(contrastBorder, this._themeService).read(reader) : null;
        const primaryActiveStyles = {
          borderColor: hcBorderColor ? hcBorderColor.toString() : modifiedBorderColor,
          backgroundColor: asCssVariable(modifiedChangedTextOverlayColor),
          color: "",
          opacity: "1"
        };
        const secondaryActiveStyles = {
          borderColor: hcBorderColor ? hcBorderColor.toString() : asCssVariable(inlineEditIndicatorPrimaryBorder),
          backgroundColor: asCssVariable(inlineEditIndicatorPrimaryBackground),
          color: asCssVariable(inlineEditIndicatorPrimaryForeground),
          opacity: "1"
        };
        const passiveStyles = {
          borderColor: hcBorderColor ? hcBorderColor.toString() : observeColor(editorHoverForeground, this._themeService).map((c) => c.transparent(0.2).toString()).read(reader),
          backgroundColor: getEditorBackgroundColor(this._viewData.editorType),
          color: "",
          opacity: "0.7"
        };
        const editorBackground = getEditorBackgroundColor(this._viewData.editorType);
        const primaryActionStyles = derived(this, (r) => alternativeActionActive.read(r) ? primaryActiveStyles : primaryActiveStyles);
        const secondaryActionStyles = derived(this, (r) => alternativeActionActive.read(r) ? secondaryActiveStyles : passiveStyles);
        return [
          n.div({
            id: DOM_ID_OVERLAY,
            style: {
              position: "absolute",
              ...rectToProps((r) => getEditorValidOverlayRect(this._editor).read(r)),
              overflow: "hidden",
              pointerEvents: "none"
            }
          }, [
            n.div({
              style: {
                position: "absolute",
                ...rectToProps((reader2) => layout.read(reader2).lowerBackground.withMargin(BORDER_WIDTH, 2 * BORDER_WIDTH, BORDER_WIDTH, 0)),
                background: editorBackground,
                cursor: "pointer",
                pointerEvents: "auto"
              },
              onmousedown: (e) => this._mouseDown(e)
            }),
            n.div({
              id: DOM_ID_WIDGET,
              style: {
                position: "absolute",
                ...rectToProps((reader2) => layout.read(reader2).modifiedLine.withMargin(BORDER_WIDTH, 2 * BORDER_WIDTH)),
                width: void 0,
                pointerEvents: "auto",
                boxSizing: "border-box",
                borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                background: editorBackground,
                display: "flex",
                justifyContent: "left",
                outline: `2px solid ${editorBackground}`
              },
              onmousedown: (e) => this._mouseDown(e)
            }, [
              n.div({
                id: DOM_ID_REPLACEMENT,
                style: {
                  fontFamily: this._editor.getOption(EditorOption.fontFamily),
                  fontSize: this._editor.getOption(EditorOption.fontSize),
                  fontWeight: this._editor.getOption(EditorOption.fontWeight),
                  width: rectToProps((reader2) => layout.read(reader2).codeLine.withMargin(BORDER_WIDTH, 2 * BORDER_WIDTH)).width,
                  borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                  border: primaryActionStyles.map((s) => `${BORDER_WIDTH}px solid ${s.borderColor}`),
                  boxSizing: "border-box",
                  padding: `${BORDER_WIDTH}px`,
                  opacity: primaryActionStyles.map((s) => s.opacity),
                  background: primaryActionStyles.map((s) => s.backgroundColor),
                  display: "flex",
                  justifyContent: "left",
                  alignItems: "center",
                  pointerEvents: "auto",
                  cursor: "pointer"
                },
                obsRef: (elem) => {
                  this._primaryElement.set(elem, void 0);
                }
              }, [this._line]),
              derived(this, (reader2) => {
                const altAction = alternativeAction.read(reader2);
                if (!altAction) {
                  return void 0;
                }
                const keybinding = document.createElement("div");
                const keybindingLabel = reader2.store.add(new KeybindingLabel(keybinding, OS, { ...unthemedKeybindingLabelOptions, disableTitle: true }));
                keybindingLabel.set(altAction.keybinding);
                return n.div({
                  id: DOM_ID_RENAME,
                  style: {
                    position: "relative",
                    borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                    borderTop: `${BORDER_WIDTH}px solid`,
                    borderRight: `${BORDER_WIDTH}px solid`,
                    borderBottom: `${BORDER_WIDTH}px solid`,
                    borderLeft: `${BORDER_WIDTH}px solid`,
                    borderColor: secondaryActionStyles.map((s) => s.borderColor),
                    opacity: secondaryActionStyles.map((s) => s.opacity),
                    color: secondaryActionStyles.map((s) => s.color),
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    padding: "0 4px 0 1px",
                    marginLeft: "4px",
                    background: secondaryActionStyles.map((s) => s.backgroundColor),
                    cursor: "pointer",
                    textWrap: "nowrap"
                  },
                  class: "inline-edit-alternative-action-label",
                  obsRef: (elem) => {
                    this._secondaryElement.set(elem, void 0);
                  },
                  ref: (elem) => {
                    if (altAction.tooltip) {
                      reader2.store.add(this._hoverService.setupDelayedHoverAtMouse(elem, { content: altAction.tooltip, appearance: { compact: true } }));
                    }
                  }
                }, [
                  keybinding,
                  $("div.inline-edit-alternative-action-label-separator"),
                  altAction.icon ? renderIcon(altAction.icon) : void 0,
                  altAction.label
                ]);
              })
            ]),
            n.div({
              style: {
                position: "absolute",
                ...rectToProps((reader2) => layout.read(reader2).originalLine.withMargin(BORDER_WIDTH)),
                boxSizing: "border-box",
                borderRadius: `${INLINE_EDITS_BORDER_RADIUS}px`,
                border: `${BORDER_WIDTH}px solid ${originalBorderColor}`,
                background: asCssVariable(originalChangedTextOverlayColor),
                pointerEvents: "none"
              }
            }, []),
            n.svg({
              width: 11,
              height: 14,
              viewBox: "0 0 11 14",
              fill: "none",
              style: {
                position: "absolute",
                left: layout.map((l) => l.modifiedLine.left - 16),
                top: layout.map((l) => l.modifiedLine.top + Math.round((l.lineHeight - 14 - 5) / 2)),
                pointerEvents: "none"
              },
              onmousedown: (e) => this._mouseDown(e)
            }, [
              n.svgElem("path", {
                d: "M1 0C1 2.98966 1 5.92087 1 8.49952C1 9.60409 1.89543 10.5 3 10.5H10.5",
                stroke: asCssVariable(editorHoverForeground)
              }),
              n.svgElem("path", {
                d: "M6 7.5L9.99999 10.49998L6 13.5",
                stroke: asCssVariable(editorHoverForeground)
              })
            ])
          ])
        ];
      })
    ]).keepUpdated(this._store);
    this._register(this._editor.createOverlayWidget({
      domNode: this._root.element,
      minContentWidthInPx: constObservable(0),
      position: constObservable({ preference: { top: 0, left: 0 } }),
      allowEditorOverflow: false
    }));
  }
  _mouseDown(e) {
    const target_id = traverseParentsUntilId(e.target, /* @__PURE__ */ new Set([DOM_ID_WIDGET, DOM_ID_REPLACEMENT, DOM_ID_RENAME, DOM_ID_OVERLAY]));
    if (!target_id) {
      return;
    }
    e.preventDefault();
    this._onDidClick.fire(InlineEditClickEvent.create(e, target_id === DOM_ID_RENAME));
  }
};
InlineEditsWordReplacementView.MAX_LENGTH = 100;
InlineEditsWordReplacementView = __decorateClass([
  __decorateParam(3, ILanguageService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IKeybindingService),
  __decorateParam(6, IHoverService),
  __decorateParam(7, IUserInteractionService)
], InlineEditsWordReplacementView);
function traverseParentsUntilId(element, ids) {
  let current = element;
  while (current) {
    if (ids.has(current.id)) {
      return current.id;
    }
    current = current.parentElement;
  }
  return null;
}
export {
  InlineEditsWordReplacementView,
  WordReplacementsViewData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c1ZpZXdzL2lubGluZUVkaXRzV29yZFJlcGxhY2VtZW50Vmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7ICQsIG4sIE9ic2VydmVyTm9kZVdpdGhFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdMYWJlbCwgdW50aGVtZWRLZXliaW5kaW5nTGFiZWxPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2tleWJpbmRpbmdMYWJlbC9rZXliaW5kaW5nTGFiZWwuanMnO1xuaW1wb3J0IHsgSUVxdWF0YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2VxdWFscy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlRnJvbUV2ZW50LCBvYnNlcnZhYmxlRnJvbVByb21pc2UsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgT1MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IGVkaXRvckhvdmVyRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGNvbnRyYXN0Qm9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9ycy9iYXNlQ29sb3JzLmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JVdGlscy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBPYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgTGluZVNvdXJjZSwgcmVuZGVyTGluZXMsIFJlbmRlck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2NvbXBvbmVudHMvZGlmZkVkaXRvclZpZXdab25lcy9yZW5kZXJMaW5lcy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9pbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS8yZC9wb2ludC5qcyc7XG5pbXBvcnQgeyBSZWN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvMmQvcmVjdC5qcyc7XG5pbXBvcnQgeyBTdHJpbmdSZXBsYWNlbWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRzL3N0cmluZ0VkaXQuanMnO1xuaW1wb3J0IHsgVGV4dFJlcGxhY2VtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdHMvdGV4dEVkaXQuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgTGluZVRva2VucywgVG9rZW5BcnJheSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi90b2tlbnMvbGluZVRva2Vucy5qcyc7XG5pbXBvcnQgeyBpbmxpbmVTdWdnZXN0Q29tbWl0QWx0ZXJuYXRpdmVBY3Rpb25JZCB9IGZyb20gJy4uLy4uLy4uL2NvbnRyb2xsZXIvY29tbWFuZElkcy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVTdWdnZXN0QWx0ZXJuYXRpdmVBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9tb2RlbC9JbmxpbmVTdWdnZXN0QWx0ZXJuYXRpdmVBY3Rpb24uanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUgfSBmcm9tICcuLi8uLi8uLi9tb2RlbC9wcm92aWRlSW5saW5lQ29tcGxldGlvbnMuanMnO1xuaW1wb3J0IHsgSUlubGluZUVkaXRzVmlldywgSW5saW5lRWRpdENsaWNrRXZlbnQsIElubGluZUVkaXRUYWJBY3Rpb24gfSBmcm9tICcuLi9pbmxpbmVFZGl0c1ZpZXdJbnRlcmZhY2UuanMnO1xuaW1wb3J0IHsgZ2V0RWRpdG9yQmFja2dyb3VuZENvbG9yLCBnZXRNb2RpZmllZEJvcmRlckNvbG9yLCBnZXRPcmlnaW5hbEJvcmRlckNvbG9yLCBJTkxJTkVfRURJVFNfQk9SREVSX1JBRElVUywgaW5saW5lRWRpdEluZGljYXRvclByaW1hcnlCYWNrZ3JvdW5kLCBpbmxpbmVFZGl0SW5kaWNhdG9yUHJpbWFyeUJvcmRlciwgaW5saW5lRWRpdEluZGljYXRvclByaW1hcnlGb3JlZ3JvdW5kLCBtb2RpZmllZENoYW5nZWRUZXh0T3ZlcmxheUNvbG9yLCBvYnNlcnZlQ29sb3IsIG9yaWdpbmFsQ2hhbmdlZFRleHRPdmVybGF5Q29sb3IgfSBmcm9tICcuLi90aGVtZS5qcyc7XG5pbXBvcnQgeyBnZXRFZGl0b3JWYWxpZE92ZXJsYXlSZWN0LCBtYXBPdXRGYWxzeSwgcmVjdFRvUHJvcHMgfSBmcm9tICcuLi91dGlscy91dGlscy5qcyc7XG5pbXBvcnQgeyBJVXNlckludGVyYWN0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJJbnRlcmFjdGlvbi9icm93c2VyL3VzZXJJbnRlcmFjdGlvblNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgV29yZFJlcGxhY2VtZW50c1ZpZXdEYXRhIGltcGxlbWVudHMgSUVxdWF0YWJsZTxXb3JkUmVwbGFjZW1lbnRzVmlld0RhdGE+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IGVkaXQ6IFRleHRSZXBsYWNlbWVudCxcblx0XHRwdWJsaWMgcmVhZG9ubHkgZWRpdG9yVHlwZTogSW5saW5lQ29tcGxldGlvbkVkaXRvclR5cGUsXG5cdFx0cHVibGljIHJlYWRvbmx5IGFsdGVybmF0aXZlQWN0aW9uOiBJbmxpbmVTdWdnZXN0QWx0ZXJuYXRpdmVBY3Rpb24gfCB1bmRlZmluZWQsXG5cdCkgeyB9XG5cblx0ZXF1YWxzKG90aGVyOiBXb3JkUmVwbGFjZW1lbnRzVmlld0RhdGEpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0LmVxdWFscyhvdGhlci5lZGl0KSAmJiB0aGlzLmFsdGVybmF0aXZlQWN0aW9uID09PSBvdGhlci5hbHRlcm5hdGl2ZUFjdGlvbjtcblx0fVxufVxuXG5jb25zdCBCT1JERVJfV0lEVEggPSAxO1xuY29uc3QgRE9NX0lEX09WRVJMQVkgPSAnd29yZC1yZXBsYWNlbWVudC12aWV3LW92ZXJsYXknO1xuY29uc3QgRE9NX0lEX1dJREdFVCA9ICd3b3JkLXJlcGxhY2VtZW50LXZpZXctd2lkZ2V0JztcbmNvbnN0IERPTV9JRF9SRVBMQUNFTUVOVCA9ICd3b3JkLXJlcGxhY2VtZW50LXZpZXctcmVwbGFjZW1lbnQnO1xuY29uc3QgRE9NX0lEX1JFTkFNRSA9ICd3b3JkLXJlcGxhY2VtZW50LXZpZXctcmVuYW1lJztcblxuZXhwb3J0IGNsYXNzIElubGluZUVkaXRzV29yZFJlcGxhY2VtZW50VmlldyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJSW5saW5lRWRpdHNWaWV3IHtcblxuXHRwdWJsaWMgc3RhdGljIE1BWF9MRU5HVEggPSAxMDA7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbGljayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElubGluZUVkaXRDbGlja0V2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDbGljayA9IHRoaXMuX29uRGlkQ2xpY2suZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhcnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VuZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9saW5lO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByaW1hcnlFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZWNvbmRhcnlFbGVtZW50O1xuXG5cdHJlYWRvbmx5IGlzSG92ZXJlZDtcblxuXHRyZWFkb25seSBtaW5FZGl0b3JTY3JvbGxIZWlnaHQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBPYnNlcnZhYmxlQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF92aWV3RGF0YTogV29yZFJlcGxhY2VtZW50c1ZpZXdEYXRhLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfdGFiQWN0aW9uOiBJT2JzZXJ2YWJsZTxJbmxpbmVFZGl0VGFiQWN0aW9uPixcblx0XHRASUxhbmd1YWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3VzZXJJbnRlcmFjdGlvblNlcnZpY2U6IElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3N0YXJ0ID0gdGhpcy5fZWRpdG9yLm9ic2VydmVQb3NpdGlvbihjb25zdE9ic2VydmFibGUodGhpcy5fdmlld0RhdGEuZWRpdC5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpLCB0aGlzLl9zdG9yZSk7XG5cdFx0dGhpcy5fZW5kID0gdGhpcy5fZWRpdG9yLm9ic2VydmVQb3NpdGlvbihjb25zdE9ic2VydmFibGUodGhpcy5fdmlld0RhdGEuZWRpdC5yYW5nZS5nZXRFbmRQb3NpdGlvbigpKSwgdGhpcy5fc3RvcmUpO1xuXHRcdHRoaXMuX2xpbmUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLl9wcmltYXJ5RWxlbWVudCA9IG9ic2VydmFibGVWYWx1ZTxPYnNlcnZlck5vZGVXaXRoRWxlbWVudCB8IG51bGw+KHRoaXMsIG51bGwpO1xuXHRcdHRoaXMuX3NlY29uZGFyeUVsZW1lbnQgPSBvYnNlcnZhYmxlVmFsdWU8T2JzZXJ2ZXJOb2RlV2l0aEVsZW1lbnQgfCBudWxsPih0aGlzLCBudWxsKTtcblx0XHR0aGlzLmlzSG92ZXJlZCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGVsZW0gPSB0aGlzLl9wcmltYXJ5RWxlbWVudC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWVsZW0pIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0XHRyZXR1cm4gdGhpcy5fdXNlckludGVyYWN0aW9uU2VydmljZS5jcmVhdGVIb3ZlclRyYWNrZXIoZWxlbS5lbGVtZW50LCByZWFkZXIuc3RvcmUpLnJlYWQocmVhZGVyKTtcblx0XHR9KTtcblx0XHR0aGlzLl9yZW5kZXJUZXh0RWZmZWN0ID0gZGVyaXZlZCh0aGlzLCBfcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHRtID0gdGhpcy5fZWRpdG9yLm1vZGVsLnJlYWQodW5kZWZpbmVkKTtcblx0XHRcdGlmICghdG0pIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBvcmlnTGluZSA9IHRtLmdldExpbmVDb250ZW50KHRoaXMuX3ZpZXdEYXRhLmVkaXQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblxuXHRcdFx0Y29uc3QgZWRpdCA9IFN0cmluZ1JlcGxhY2VtZW50LnJlcGxhY2UobmV3IE9mZnNldFJhbmdlKHRoaXMuX3ZpZXdEYXRhLmVkaXQucmFuZ2Uuc3RhcnRDb2x1bW4gLSAxLCB0aGlzLl92aWV3RGF0YS5lZGl0LnJhbmdlLmVuZENvbHVtbiAtIDEpLCB0aGlzLl92aWV3RGF0YS5lZGl0LnRleHQpO1xuXHRcdFx0Y29uc3QgbGluZVRvVG9rZW5pemUgPSBlZGl0LnJlcGxhY2Uob3JpZ0xpbmUpO1xuXHRcdFx0Y29uc3QgdCA9IHRtLnRva2VuaXphdGlvbi50b2tlbml6ZUxpbmVzQXQodGhpcy5fdmlld0RhdGEuZWRpdC5yYW5nZS5zdGFydExpbmVOdW1iZXIsIFtsaW5lVG9Ub2tlbml6ZV0pPy5bMF07XG5cdFx0XHRsZXQgdG9rZW5zOiBMaW5lVG9rZW5zO1xuXHRcdFx0aWYgKHQpIHtcblx0XHRcdFx0dG9rZW5zID0gVG9rZW5BcnJheS5mcm9tTGluZVRva2Vucyh0KS5zbGljZShlZGl0LmdldFJhbmdlQWZ0ZXJSZXBsYWNlKCkpLnRvTGluZVRva2Vucyh0aGlzLl92aWV3RGF0YS5lZGl0LnRleHQsIHRoaXMuX2xhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dG9rZW5zID0gTGluZVRva2Vucy5jcmVhdGVFbXB0eSh0aGlzLl92aWV3RGF0YS5lZGl0LnRleHQsIHRoaXMuX2xhbmd1YWdlU2VydmljZS5sYW5ndWFnZUlkQ29kZWMpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzID0gcmVuZGVyTGluZXMobmV3IExpbmVTb3VyY2UoW3Rva2Vuc10pLCBSZW5kZXJPcHRpb25zLmZyb21FZGl0b3IodGhpcy5fZWRpdG9yLmVkaXRvcikud2l0aFNldFdpZHRoKGZhbHNlKS53aXRoU2Nyb2xsQmV5b25kTGFzdENvbHVtbigwKSwgW10sIHRoaXMuX2xpbmUsIHRydWUpO1xuXHRcdFx0dGhpcy5fbGluZS5zdHlsZS53aWR0aCA9IGAke3Jlcy5taW5XaWR0aEluUHh9cHhgO1xuXHRcdH0pO1xuXHRcdGNvbnN0IG1vZGlmaWVkTGluZUhlaWdodCA9IHRoaXMuX2VkaXRvci5vYnNlcnZlTGluZUhlaWdodEZvclBvc2l0aW9uKHRoaXMuX3ZpZXdEYXRhLmVkaXQucmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpKTtcblx0XHRjb25zdCBhbHRDb3VudCA9IG9ic2VydmFibGVGcm9tUHJvbWlzZSh0aGlzLl92aWV3RGF0YS5hbHRlcm5hdGl2ZUFjdGlvbj8uY291bnQgPz8gbmV3IFByb21pc2U8dW5kZWZpbmVkPihyZXNvbHZlID0+IHJlc29sdmUodW5kZWZpbmVkKSkpLm1hcChjID0+IGMudmFsdWUpO1xuXHRcdGNvbnN0IGFsdE1vZGlmaWVyQWN0aXZlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4gdGhpcy5fdXNlckludGVyYWN0aW9uU2VydmljZS5yZWFkTW9kaWZpZXJLZXlTdGF0dXModGhpcy5fZWRpdG9yLmVkaXRvci5nZXREb21Ob2RlKCkhLCByZWFkZXIpLnNoaWZ0S2V5KTtcblx0XHR0aGlzLl9sYXlvdXQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl9yZW5kZXJUZXh0RWZmZWN0LnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHdpZGdldFN0YXJ0ID0gdGhpcy5fc3RhcnQucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3Qgd2lkZ2V0RW5kID0gdGhpcy5fZW5kLnJlYWQocmVhZGVyKTtcblxuXHRcdFx0Ly8gVE9ET0BoZWRpZXQgYmV0dGVyIGFib3V0IHdpZGdldFN0YXJ0IGFuZCB3aWRnZXRFbmQgaW4gYSBzaW5nbGUgdHJhbnNhY3Rpb24hXG5cdFx0XHRpZiAoIXdpZGdldFN0YXJ0IHx8ICF3aWRnZXRFbmQgfHwgd2lkZ2V0U3RhcnQueCA+IHdpZGdldEVuZC54IHx8IHdpZGdldFN0YXJ0LnkgPiB3aWRnZXRFbmQueSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gbW9kaWZpZWRMaW5lSGVpZ2h0LnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChsaW5lSGVpZ2h0IDw9IDApIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNjcm9sbExlZnQgPSB0aGlzLl9lZGl0b3Iuc2Nyb2xsTGVmdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCB3ID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uZm9udEluZm8pLnJlYWQocmVhZGVyKS50eXBpY2FsSGFsZndpZHRoQ2hhcmFjdGVyV2lkdGg7XG5cblx0XHRcdGNvbnN0IG1vZGlmaWVkTGVmdE9mZnNldCA9IDMgKiB3O1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRUb3BPZmZzZXQgPSA0O1xuXHRcdFx0Y29uc3QgbW9kaWZpZWRPZmZzZXQgPSBuZXcgUG9pbnQobW9kaWZpZWRMZWZ0T2Zmc2V0LCBtb2RpZmllZFRvcE9mZnNldCk7XG5cblx0XHRcdGxldCBhbHRlcm5hdGl2ZUFjdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0aGlzLl92aWV3RGF0YS5hbHRlcm5hdGl2ZUFjdGlvbikge1xuXHRcdFx0XHRjb25zdCBsYWJlbCA9IHRoaXMuX3ZpZXdEYXRhLmFsdGVybmF0aXZlQWN0aW9uLmxhYmVsO1xuXHRcdFx0XHRjb25zdCBjb3VudCA9IGFsdENvdW50LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgYWN0aXZlID0gYWx0TW9kaWZpZXJBY3RpdmUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBvY2N1cnJlbmNlc0xhYmVsID0gY291bnQgIT09IHVuZGVmaW5lZCA/IGNvdW50ID09PSAxID9cblx0XHRcdFx0XHRsb2NhbGl6ZSgnbGFiZWxPY2N1cmVuY2UnLCBcInswfSAxIG9jY3VycmVuY2VcIiwgbGFiZWwpIDpcblx0XHRcdFx0XHRsb2NhbGl6ZSgnbGFiZWxPY2N1cmVuY2VzJywgXCJ7MH0gezF9IG9jY3VycmVuY2VzXCIsIGxhYmVsLCBjb3VudClcblx0XHRcdFx0XHQ6IGxhYmVsO1xuXHRcdFx0XHRjb25zdCBrZXliaW5kaW5nVG9vbHRpcCA9IGxvY2FsaXplKCdzaGlmdFRvU2VlT2NjdXJlbmNlcycsIFwiezB9IHNob3cgb2NjdXJyZW5jZXNcIiwgJ1tzaGlmdF0nKTtcblx0XHRcdFx0YWx0ZXJuYXRpdmVBY3Rpb24gPSB7XG5cdFx0XHRcdFx0bGFiZWw6IGNvdW50ICE9PSB1bmRlZmluZWQgPyAoYWN0aXZlID8gb2NjdXJyZW5jZXNMYWJlbCA6IGxhYmVsKSA6IGxhYmVsLFxuXHRcdFx0XHRcdHRvb2x0aXA6IG9jY3VycmVuY2VzTGFiZWwgPyBgJHtvY2N1cnJlbmNlc0xhYmVsfVxcbiR7a2V5YmluZGluZ1Rvb2x0aXB9YCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRpY29uOiB1bmRlZmluZWQsIC8vdGhpcy5fdmlld0RhdGEuYWx0ZXJuYXRpdmVBY3Rpb24uaWNvbiwgRG8gbm90IHJlbmRlciBpY29uIGZvIHRoZSBtb21lbnRcblx0XHRcdFx0XHRjb3VudCxcblx0XHRcdFx0XHRrZXliaW5kaW5nOiB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGlubGluZVN1Z2dlc3RDb21taXRBbHRlcm5hdGl2ZUFjdGlvbklkKSxcblx0XHRcdFx0XHRhY3RpdmU6IGFsdE1vZGlmaWVyQWN0aXZlLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBvcmlnaW5hbExpbmUgPSBSZWN0LmZyb21Qb2ludHMod2lkZ2V0U3RhcnQsIHdpZGdldEVuZCkud2l0aEhlaWdodChsaW5lSGVpZ2h0KS50cmFuc2xhdGVYKC1zY3JvbGxMZWZ0KTtcblx0XHRcdGNvbnN0IGNvZGVMaW5lID0gUmVjdC5mcm9tUG9pbnRTaXplKG9yaWdpbmFsTGluZS5nZXRMZWZ0Qm90dG9tKCkuYWRkKG1vZGlmaWVkT2Zmc2V0KSwgbmV3IFBvaW50KHRoaXMuX3ZpZXdEYXRhLmVkaXQudGV4dC5sZW5ndGggKiB3LCBvcmlnaW5hbExpbmUuaGVpZ2h0KSk7XG5cdFx0XHRjb25zdCBtb2RpZmllZExpbmUgPSBjb2RlTGluZS53aXRoV2lkdGgoY29kZUxpbmUud2lkdGggKyAoYWx0ZXJuYXRpdmVBY3Rpb24gPyBhbHRlcm5hdGl2ZUFjdGlvbi5sYWJlbC5sZW5ndGggKiB3ICsgOCArIDQgKyAxMiA6IDApKTtcblx0XHRcdGNvbnN0IGxvd2VyQmFja2dyb3VuZCA9IG1vZGlmaWVkTGluZS53aXRoTGVmdChvcmlnaW5hbExpbmUubGVmdCk7XG5cblx0XHRcdC8vIGRlYnVnVmlldyhkZWJ1Z0xvZ1JlY3RzKHsgbG93ZXJCYWNrZ3JvdW5kIH0sIHRoaXMuX2VkaXRvci5lZGl0b3IuZ2V0Q29udGFpbmVyRG9tTm9kZSgpKSwgcmVhZGVyKTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0YWx0ZXJuYXRpdmVBY3Rpb24sXG5cdFx0XHRcdG9yaWdpbmFsTGluZSxcblx0XHRcdFx0Y29kZUxpbmUsXG5cdFx0XHRcdG1vZGlmaWVkTGluZSxcblx0XHRcdFx0bG93ZXJCYWNrZ3JvdW5kLFxuXHRcdFx0XHRsaW5lSGVpZ2h0LFxuXHRcdFx0fTtcblx0XHR9KTtcblx0XHR0aGlzLm1pbkVkaXRvclNjcm9sbEhlaWdodCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGxheW91dCA9IG1hcE91dEZhbHN5KHRoaXMuX2xheW91dCkucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFsYXlvdXQpIHtcblx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbGF5b3V0LnJlYWQocmVhZGVyKS5tb2RpZmllZExpbmUuYm90dG9tICsgQk9SREVSX1dJRFRIICsgdGhpcy5fZWRpdG9yLmVkaXRvci5nZXRTY3JvbGxUb3AoKTtcblx0XHR9KTtcblx0XHR0aGlzLl9yb290ID0gbi5kaXYoe1xuXHRcdFx0Y2xhc3M6ICd3b3JkLXJlcGxhY2VtZW50Jyxcblx0XHR9LCBbXG5cdFx0XHRkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IGxheW91dCA9IG1hcE91dEZhbHN5KHRoaXMuX2xheW91dCkucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIWxheW91dCkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsQm9yZGVyQ29sb3IgPSBnZXRPcmlnaW5hbEJvcmRlckNvbG9yKHRoaXMuX3RhYkFjdGlvbikubWFwKGMgPT4gYXNDc3NWYXJpYWJsZShjKSkucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjb25zdCBtb2RpZmllZEJvcmRlckNvbG9yID0gZ2V0TW9kaWZpZWRCb3JkZXJDb2xvcih0aGlzLl90YWJBY3Rpb24pLm1hcChjID0+IGFzQ3NzVmFyaWFibGUoYykpLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0dGhpcy5fbGluZS5zdHlsZS5saW5lSGVpZ2h0ID0gYCR7bGF5b3V0LnJlYWQocmVhZGVyKS5tb2RpZmllZExpbmUuaGVpZ2h0ICsgMiAqIEJPUkRFUl9XSURUSH1weGA7XG5cblx0XHRcdFx0Y29uc3Qgc2Vjb25kYXJ5RWxlbWVudEhvdmVyZWQgPSBjb25zdE9ic2VydmFibGUoZmFsc2UpOy8vdGhpcy5fc2Vjb25kYXJ5RWxlbWVudC5tYXAoKGUsIHIpID0+IGU/LmlzSG92ZXJlZC5yZWFkKHIpID8/IGZhbHNlKTtcblx0XHRcdFx0Y29uc3QgYWx0ZXJuYXRpdmVBY3Rpb24gPSBsYXlvdXQubWFwKGwgPT4gbC5hbHRlcm5hdGl2ZUFjdGlvbik7XG5cdFx0XHRcdGNvbnN0IGFsdGVybmF0aXZlQWN0aW9uQWN0aXZlID0gZGVyaXZlZChyZWFkZXIgPT4gKGFsdGVybmF0aXZlQWN0aW9uLnJlYWQocmVhZGVyKT8uYWN0aXZlLnJlYWQocmVhZGVyKSA/PyBmYWxzZSkgfHwgc2Vjb25kYXJ5RWxlbWVudEhvdmVyZWQucmVhZChyZWFkZXIpKTtcblxuXHRcdFx0XHRjb25zdCBpc0hpZ2hDb250cmFzdCA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcy5fdGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSwgKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHRoZW1lID0gdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhlbWUudHlwZSA9PT0gJ2hjRGFyaycgfHwgdGhlbWUudHlwZSA9PT0gJ2hjTGlnaHQnO1xuXHRcdFx0XHR9KS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdGNvbnN0IGhjQm9yZGVyQ29sb3IgPSBpc0hpZ2hDb250cmFzdCA/IG9ic2VydmVDb2xvcihjb250cmFzdEJvcmRlciwgdGhpcy5fdGhlbWVTZXJ2aWNlKS5yZWFkKHJlYWRlcikgOiBudWxsO1xuXG5cdFx0XHRcdGNvbnN0IHByaW1hcnlBY3RpdmVTdHlsZXMgPSB7XG5cdFx0XHRcdFx0Ym9yZGVyQ29sb3I6IGhjQm9yZGVyQ29sb3IgPyBoY0JvcmRlckNvbG9yLnRvU3RyaW5nKCkgOiBtb2RpZmllZEJvcmRlckNvbG9yLFxuXHRcdFx0XHRcdGJhY2tncm91bmRDb2xvcjogYXNDc3NWYXJpYWJsZShtb2RpZmllZENoYW5nZWRUZXh0T3ZlcmxheUNvbG9yKSxcblx0XHRcdFx0XHRjb2xvcjogJycsXG5cdFx0XHRcdFx0b3BhY2l0eTogJzEnLFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHNlY29uZGFyeUFjdGl2ZVN0eWxlcyA9IHtcblx0XHRcdFx0XHRib3JkZXJDb2xvcjogaGNCb3JkZXJDb2xvciA/IGhjQm9yZGVyQ29sb3IudG9TdHJpbmcoKSA6IGFzQ3NzVmFyaWFibGUoaW5saW5lRWRpdEluZGljYXRvclByaW1hcnlCb3JkZXIpLFxuXHRcdFx0XHRcdGJhY2tncm91bmRDb2xvcjogYXNDc3NWYXJpYWJsZShpbmxpbmVFZGl0SW5kaWNhdG9yUHJpbWFyeUJhY2tncm91bmQpLFxuXHRcdFx0XHRcdGNvbG9yOiBhc0Nzc1ZhcmlhYmxlKGlubGluZUVkaXRJbmRpY2F0b3JQcmltYXJ5Rm9yZWdyb3VuZCksXG5cdFx0XHRcdFx0b3BhY2l0eTogJzEnLFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHBhc3NpdmVTdHlsZXMgPSB7XG5cdFx0XHRcdFx0Ym9yZGVyQ29sb3I6IGhjQm9yZGVyQ29sb3IgPyBoY0JvcmRlckNvbG9yLnRvU3RyaW5nKCkgOiBvYnNlcnZlQ29sb3IoZWRpdG9ySG92ZXJGb3JlZ3JvdW5kLCB0aGlzLl90aGVtZVNlcnZpY2UpLm1hcChjID0+IGMudHJhbnNwYXJlbnQoMC4yKS50b1N0cmluZygpKS5yZWFkKHJlYWRlciksXG5cdFx0XHRcdFx0YmFja2dyb3VuZENvbG9yOiBnZXRFZGl0b3JCYWNrZ3JvdW5kQ29sb3IodGhpcy5fdmlld0RhdGEuZWRpdG9yVHlwZSksXG5cdFx0XHRcdFx0Y29sb3I6ICcnLFxuXHRcdFx0XHRcdG9wYWNpdHk6ICcwLjcnLFxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IGVkaXRvckJhY2tncm91bmQgPSBnZXRFZGl0b3JCYWNrZ3JvdW5kQ29sb3IodGhpcy5fdmlld0RhdGEuZWRpdG9yVHlwZSk7XG5cdFx0XHRcdGNvbnN0IHByaW1hcnlBY3Rpb25TdHlsZXMgPSBkZXJpdmVkKHRoaXMsIHIgPT4gYWx0ZXJuYXRpdmVBY3Rpb25BY3RpdmUucmVhZChyKSA/IHByaW1hcnlBY3RpdmVTdHlsZXMgOiBwcmltYXJ5QWN0aXZlU3R5bGVzKTtcblx0XHRcdFx0Y29uc3Qgc2Vjb25kYXJ5QWN0aW9uU3R5bGVzID0gZGVyaXZlZCh0aGlzLCByID0+IGFsdGVybmF0aXZlQWN0aW9uQWN0aXZlLnJlYWQocikgPyBzZWNvbmRhcnlBY3RpdmVTdHlsZXMgOiBwYXNzaXZlU3R5bGVzKTtcblx0XHRcdFx0Ly8gVE9ET0BiZW5pYmVuaiBjbGlja2luZyB0aGUgYXJyb3cgZG9lcyBub3QgYWNjZXB0IHN1Z2dlc3Rpb24gYW55bW9yZVxuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRcdGlkOiBET01fSURfT1ZFUkxBWSxcblx0XHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHRcdHBvc2l0aW9uOiAnYWJzb2x1dGUnLFxuXHRcdFx0XHRcdFx0XHQuLi5yZWN0VG9Qcm9wcygocikgPT4gZ2V0RWRpdG9yVmFsaWRPdmVybGF5UmVjdCh0aGlzLl9lZGl0b3IpLnJlYWQocikpLFxuXHRcdFx0XHRcdFx0XHRvdmVyZmxvdzogJ2hpZGRlbicsXG5cdFx0XHRcdFx0XHRcdHBvaW50ZXJFdmVudHM6ICdub25lJyxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LCBbXG5cdFx0XHRcdFx0XHRuLmRpdih7XG5cdFx0XHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRcdFx0XHRcdFx0Li4ucmVjdFRvUHJvcHMocmVhZGVyID0+IGxheW91dC5yZWFkKHJlYWRlcikubG93ZXJCYWNrZ3JvdW5kLndpdGhNYXJnaW4oQk9SREVSX1dJRFRILCAyICogQk9SREVSX1dJRFRILCBCT1JERVJfV0lEVEgsIDApKSxcblx0XHRcdFx0XHRcdFx0XHRiYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0XHRcdFx0XHRcdGN1cnNvcjogJ3BvaW50ZXInLFxuXHRcdFx0XHRcdFx0XHRcdHBvaW50ZXJFdmVudHM6ICdhdXRvJyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0b25tb3VzZWRvd246IChlKSA9PiB0aGlzLl9tb3VzZURvd24oZSksXG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRcdFx0aWQ6IERPTV9JRF9XSURHRVQsXG5cdFx0XHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHRcdFx0cG9zaXRpb246ICdhYnNvbHV0ZScsXG5cdFx0XHRcdFx0XHRcdFx0Li4ucmVjdFRvUHJvcHMocmVhZGVyID0+IGxheW91dC5yZWFkKHJlYWRlcikubW9kaWZpZWRMaW5lLndpdGhNYXJnaW4oQk9SREVSX1dJRFRILCAyICogQk9SREVSX1dJRFRIKSksXG5cdFx0XHRcdFx0XHRcdFx0d2lkdGg6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRwb2ludGVyRXZlbnRzOiAnYXV0bycsXG5cdFx0XHRcdFx0XHRcdFx0Ym94U2l6aW5nOiAnYm9yZGVyLWJveCcsXG5cdFx0XHRcdFx0XHRcdFx0Ym9yZGVyUmFkaXVzOiBgJHtJTkxJTkVfRURJVFNfQk9SREVSX1JBRElVU31weGAsXG5cblx0XHRcdFx0XHRcdFx0XHRiYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kLFxuXHRcdFx0XHRcdFx0XHRcdGRpc3BsYXk6ICdmbGV4Jyxcblx0XHRcdFx0XHRcdFx0XHRqdXN0aWZ5Q29udGVudDogJ2xlZnQnLFxuXG5cdFx0XHRcdFx0XHRcdFx0b3V0bGluZTogYDJweCBzb2xpZCAke2VkaXRvckJhY2tncm91bmR9YCxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0b25tb3VzZWRvd246IChlKSA9PiB0aGlzLl9tb3VzZURvd24oZSksXG5cdFx0XHRcdFx0XHR9LCBbXG5cdFx0XHRcdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRcdFx0XHRpZDogRE9NX0lEX1JFUExBQ0VNRU5ULFxuXHRcdFx0XHRcdFx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRmb250RmFtaWx5OiB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250RmFtaWx5KSxcblx0XHRcdFx0XHRcdFx0XHRcdGZvbnRTaXplOiB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250U2l6ZSksXG5cdFx0XHRcdFx0XHRcdFx0XHRmb250V2VpZ2h0OiB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5mb250V2VpZ2h0KSxcblx0XHRcdFx0XHRcdFx0XHRcdHdpZHRoOiByZWN0VG9Qcm9wcyhyZWFkZXIgPT4gbGF5b3V0LnJlYWQocmVhZGVyKS5jb2RlTGluZS53aXRoTWFyZ2luKEJPUkRFUl9XSURUSCwgMiAqIEJPUkRFUl9XSURUSCkpLndpZHRoLFxuXHRcdFx0XHRcdFx0XHRcdFx0Ym9yZGVyUmFkaXVzOiBgJHtJTkxJTkVfRURJVFNfQk9SREVSX1JBRElVU31weGAsXG5cdFx0XHRcdFx0XHRcdFx0XHRib3JkZXI6IHByaW1hcnlBY3Rpb25TdHlsZXMubWFwKHMgPT4gYCR7Qk9SREVSX1dJRFRIfXB4IHNvbGlkICR7cy5ib3JkZXJDb2xvcn1gKSxcblx0XHRcdFx0XHRcdFx0XHRcdGJveFNpemluZzogJ2JvcmRlci1ib3gnLFxuXHRcdFx0XHRcdFx0XHRcdFx0cGFkZGluZzogYCR7Qk9SREVSX1dJRFRIfXB4YCxcblx0XHRcdFx0XHRcdFx0XHRcdG9wYWNpdHk6IHByaW1hcnlBY3Rpb25TdHlsZXMubWFwKHMgPT4gcy5vcGFjaXR5KSxcblx0XHRcdFx0XHRcdFx0XHRcdGJhY2tncm91bmQ6IHByaW1hcnlBY3Rpb25TdHlsZXMubWFwKHMgPT4gcy5iYWNrZ3JvdW5kQ29sb3IpLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGlzcGxheTogJ2ZsZXgnLFxuXHRcdFx0XHRcdFx0XHRcdFx0anVzdGlmeUNvbnRlbnQ6ICdsZWZ0Jyxcblx0XHRcdFx0XHRcdFx0XHRcdGFsaWduSXRlbXM6ICdjZW50ZXInLFxuXHRcdFx0XHRcdFx0XHRcdFx0cG9pbnRlckV2ZW50czogJ2F1dG8nLFxuXHRcdFx0XHRcdFx0XHRcdFx0Y3Vyc29yOiAncG9pbnRlcicsXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRvYnNSZWY6IChlbGVtKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl9wcmltYXJ5RWxlbWVudC5zZXQoZWxlbSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0sIFt0aGlzLl9saW5lXSksXG5cdFx0XHRcdFx0XHRcdGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBhbHRBY3Rpb24gPSBhbHRlcm5hdGl2ZUFjdGlvbi5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKCFhbHRBY3Rpb24pIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBrZXliaW5kaW5nTGFiZWwgPSByZWFkZXIuc3RvcmUuYWRkKG5ldyBLZXliaW5kaW5nTGFiZWwoa2V5YmluZGluZywgT1MsIHsgLi4udW50aGVtZWRLZXliaW5kaW5nTGFiZWxPcHRpb25zLCBkaXNhYmxlVGl0bGU6IHRydWUgfSkpO1xuXHRcdFx0XHRcdFx0XHRcdGtleWJpbmRpbmdMYWJlbC5zZXQoYWx0QWN0aW9uLmtleWJpbmRpbmcpO1xuXG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIG4uZGl2KHtcblx0XHRcdFx0XHRcdFx0XHRcdGlkOiBET01fSURfUkVOQU1FLFxuXHRcdFx0XHRcdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0cG9zaXRpb246ICdyZWxhdGl2ZScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJvcmRlclJhZGl1czogYCR7SU5MSU5FX0VESVRTX0JPUkRFUl9SQURJVVN9cHhgLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRib3JkZXJUb3A6IGAke0JPUkRFUl9XSURUSH1weCBzb2xpZGAsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJvcmRlclJpZ2h0OiBgJHtCT1JERVJfV0lEVEh9cHggc29saWRgLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRib3JkZXJCb3R0b206IGAke0JPUkRFUl9XSURUSH1weCBzb2xpZGAsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJvcmRlckxlZnQ6IGAke0JPUkRFUl9XSURUSH1weCBzb2xpZGAsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGJvcmRlckNvbG9yOiBzZWNvbmRhcnlBY3Rpb25TdHlsZXMubWFwKHMgPT4gcy5ib3JkZXJDb2xvciksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdG9wYWNpdHk6IHNlY29uZGFyeUFjdGlvblN0eWxlcy5tYXAocyA9PiBzLm9wYWNpdHkpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjb2xvcjogc2Vjb25kYXJ5QWN0aW9uU3R5bGVzLm1hcChzID0+IHMuY29sb3IpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkaXNwbGF5OiAnZmxleCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGp1c3RpZnlDb250ZW50OiAnY2VudGVyJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0YWxpZ25JdGVtczogJ2NlbnRlcicsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHBhZGRpbmc6ICcwIDRweCAwIDFweCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdG1hcmdpbkxlZnQ6ICc0cHgnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRiYWNrZ3JvdW5kOiBzZWNvbmRhcnlBY3Rpb25TdHlsZXMubWFwKHMgPT4gcy5iYWNrZ3JvdW5kQ29sb3IpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRjdXJzb3I6ICdwb2ludGVyJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGV4dFdyYXA6ICdub3dyYXAnLFxuXHRcdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRcdGNsYXNzOiAnaW5saW5lLWVkaXQtYWx0ZXJuYXRpdmUtYWN0aW9uLWxhYmVsJyxcblx0XHRcdFx0XHRcdFx0XHRcdG9ic1JlZjogKGVsZW0pID0+IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0dGhpcy5fc2Vjb25kYXJ5RWxlbWVudC5zZXQoZWxlbSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRyZWY6IChlbGVtKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmIChhbHRBY3Rpb24udG9vbHRpcCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQodGhpcy5faG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyQXRNb3VzZShlbGVtLCB7IGNvbnRlbnQ6IGFsdEFjdGlvbi50b29sdGlwLCBhcHBlYXJhbmNlOiB7IGNvbXBhY3Q6IHRydWUgfSB9KSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9LCBbXG5cdFx0XHRcdFx0XHRcdFx0XHRrZXliaW5kaW5nLFxuXHRcdFx0XHRcdFx0XHRcdFx0JCgnZGl2LmlubGluZS1lZGl0LWFsdGVybmF0aXZlLWFjdGlvbi1sYWJlbC1zZXBhcmF0b3InKSxcblx0XHRcdFx0XHRcdFx0XHRcdGFsdEFjdGlvbi5pY29uID8gcmVuZGVySWNvbihhbHRBY3Rpb24uaWNvbikgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdFx0XHRhbHRBY3Rpb24ubGFiZWwsXG5cdFx0XHRcdFx0XHRcdFx0XSk7XG5cdFx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0XHRdKSxcblx0XHRcdFx0XHRcdG4uZGl2KHtcblx0XHRcdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogJ2Fic29sdXRlJyxcblx0XHRcdFx0XHRcdFx0XHQuLi5yZWN0VG9Qcm9wcyhyZWFkZXIgPT4gbGF5b3V0LnJlYWQocmVhZGVyKS5vcmlnaW5hbExpbmUud2l0aE1hcmdpbihCT1JERVJfV0lEVEgpKSxcblx0XHRcdFx0XHRcdFx0XHRib3hTaXppbmc6ICdib3JkZXItYm94Jyxcblx0XHRcdFx0XHRcdFx0XHRib3JkZXJSYWRpdXM6IGAke0lOTElORV9FRElUU19CT1JERVJfUkFESVVTfXB4YCxcblx0XHRcdFx0XHRcdFx0XHRib3JkZXI6IGAke0JPUkRFUl9XSURUSH1weCBzb2xpZCAke29yaWdpbmFsQm9yZGVyQ29sb3J9YCxcblx0XHRcdFx0XHRcdFx0XHRiYWNrZ3JvdW5kOiBhc0Nzc1ZhcmlhYmxlKG9yaWdpbmFsQ2hhbmdlZFRleHRPdmVybGF5Q29sb3IpLFxuXHRcdFx0XHRcdFx0XHRcdHBvaW50ZXJFdmVudHM6ICdub25lJyxcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSwgW10pLFxuXG5cdFx0XHRcdFx0XHRuLnN2Zyh7XG5cdFx0XHRcdFx0XHRcdHdpZHRoOiAxMSxcblx0XHRcdFx0XHRcdFx0aGVpZ2h0OiAxNCxcblx0XHRcdFx0XHRcdFx0dmlld0JveDogJzAgMCAxMSAxNCcsXG5cdFx0XHRcdFx0XHRcdGZpbGw6ICdub25lJyxcblx0XHRcdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdFx0XHRwb3NpdGlvbjogJ2Fic29sdXRlJyxcblx0XHRcdFx0XHRcdFx0XHRsZWZ0OiBsYXlvdXQubWFwKGwgPT4gbC5tb2RpZmllZExpbmUubGVmdCAtIDE2KSxcblx0XHRcdFx0XHRcdFx0XHR0b3A6IGxheW91dC5tYXAobCA9PiBsLm1vZGlmaWVkTGluZS50b3AgKyBNYXRoLnJvdW5kKChsLmxpbmVIZWlnaHQgLSAxNCAtIDUpIC8gMikpLFxuXHRcdFx0XHRcdFx0XHRcdHBvaW50ZXJFdmVudHM6ICdub25lJyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0b25tb3VzZWRvd246IChlKSA9PiB0aGlzLl9tb3VzZURvd24oZSksXG5cdFx0XHRcdFx0XHR9LCBbXG5cdFx0XHRcdFx0XHRcdG4uc3ZnRWxlbSgncGF0aCcsIHtcblx0XHRcdFx0XHRcdFx0XHRkOiAnTTEgMEMxIDIuOTg5NjYgMSA1LjkyMDg3IDEgOC40OTk1MkMxIDkuNjA0MDkgMS44OTU0MyAxMC41IDMgMTAuNUgxMC41Jyxcblx0XHRcdFx0XHRcdFx0XHRzdHJva2U6IGFzQ3NzVmFyaWFibGUoZWRpdG9ySG92ZXJGb3JlZ3JvdW5kKSxcblx0XHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0XHRcdG4uc3ZnRWxlbSgncGF0aCcsIHtcblx0XHRcdFx0XHRcdFx0XHRkOiAnTTYgNy41TDkuOTk5OTkgMTAuNDk5OThMNiAxMy41Jyxcblx0XHRcdFx0XHRcdFx0XHRzdHJva2U6IGFzQ3NzVmFyaWFibGUoZWRpdG9ySG92ZXJGb3JlZ3JvdW5kKSxcblx0XHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XHRcdF0pLFxuXG5cdFx0XHRcdFx0XSlcblx0XHRcdFx0XTtcblx0XHRcdH0pXG5cdFx0XSkua2VlcFVwZGF0ZWQodGhpcy5fc3RvcmUpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLmNyZWF0ZU92ZXJsYXlXaWRnZXQoe1xuXHRcdFx0ZG9tTm9kZTogdGhpcy5fcm9vdC5lbGVtZW50LFxuXHRcdFx0bWluQ29udGVudFdpZHRoSW5QeDogY29uc3RPYnNlcnZhYmxlKDApLFxuXHRcdFx0cG9zaXRpb246IGNvbnN0T2JzZXJ2YWJsZSh7IHByZWZlcmVuY2U6IHsgdG9wOiAwLCBsZWZ0OiAwIH0gfSksXG5cdFx0XHRhbGxvd0VkaXRvck92ZXJmbG93OiBmYWxzZSxcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJUZXh0RWZmZWN0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xheW91dDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yb290O1xuXG5cdHByaXZhdGUgX21vdXNlRG93bihlOiBNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0X2lkID0gdHJhdmVyc2VQYXJlbnRzVW50aWxJZChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCwgbmV3IFNldChbRE9NX0lEX1dJREdFVCwgRE9NX0lEX1JFUExBQ0VNRU5ULCBET01fSURfUkVOQU1FLCBET01fSURfT1ZFUkxBWV0pKTtcblx0XHRpZiAoIXRhcmdldF9pZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRlLnByZXZlbnREZWZhdWx0KCk7IC8vIFRoaXMgcHJldmVudHMgdGhhdCB0aGUgZWRpdG9yIGxvc2VzIGZvY3VzXG5cdFx0dGhpcy5fb25EaWRDbGljay5maXJlKElubGluZUVkaXRDbGlja0V2ZW50LmNyZWF0ZShlLCB0YXJnZXRfaWQgPT09IERPTV9JRF9SRU5BTUUpKTtcblx0fVxufVxuXG5mdW5jdGlvbiB0cmF2ZXJzZVBhcmVudHNVbnRpbElkKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBpZHM6IFNldDxzdHJpbmc+KTogc3RyaW5nIHwgbnVsbCB7XG5cdGxldCBjdXJyZW50OiBIVE1MRWxlbWVudCB8IG51bGwgPSBlbGVtZW50O1xuXHR3aGlsZSAoY3VycmVudCkge1xuXHRcdGlmIChpZHMuaGFzKGN1cnJlbnQuaWQpKSB7XG5cdFx0XHRyZXR1cm4gY3VycmVudC5pZDtcblx0XHR9XG5cdFx0Y3VycmVudCA9IGN1cnJlbnQucGFyZW50RWxlbWVudDtcblx0fVxuXHRyZXR1cm4gbnVsbDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxHQUFHLFNBQWtDO0FBQzlDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUJBQWlCLHNDQUFzQztBQUVoRSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBaUIsU0FBc0IscUJBQXFCLHVCQUF1Qix1QkFBdUI7QUFDbkgsU0FBUyxVQUFVO0FBQ25CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNB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
