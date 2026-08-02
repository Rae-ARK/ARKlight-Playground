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
import { Gesture } from "../../../../base/browser/touch.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { autorun, derived, observableValue } from "../../../../base/common/observable.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import "./lightBulbWidget.css";
import { ContentWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { EditorOption, ShowLightbulbIconMode } from "../../../common/config/editorOptions.js";
import { GlyphMarginLane, TrackedRangeStickiness } from "../../../common/model.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { computeIndentLevel } from "../../../common/model/utils.js";
import { autoFixCommandId, quickFixCommandId } from "./codeAction.js";
import * as nls from "../../../../nls.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { Range } from "../../../common/core/range.js";
const GUTTER_LIGHTBULB_ICON = registerIcon("gutter-lightbulb", Codicon.lightBulb, nls.localize("gutterLightbulbWidget", "Icon which spawns code actions menu from the gutter when there is no space in the editor."));
const GUTTER_LIGHTBULB_AUTO_FIX_ICON = registerIcon("gutter-lightbulb-auto-fix", Codicon.lightbulbAutofix, nls.localize("gutterLightbulbAutoFixWidget", "Icon which spawns code actions menu from the gutter when there is no space in the editor and a quick fix is available."));
const GUTTER_LIGHTBULB_AIFIX_ICON = registerIcon("gutter-lightbulb-sparkle", Codicon.lightbulbSparkle, nls.localize("gutterLightbulbAIFixWidget", "Icon which spawns code actions menu from the gutter when there is no space in the editor and an AI fix is available."));
const GUTTER_LIGHTBULB_AIFIX_AUTO_FIX_ICON = registerIcon("gutter-lightbulb-aifix-auto-fix", Codicon.lightbulbSparkleAutofix, nls.localize("gutterLightbulbAIFixAutoFixWidget", "Icon which spawns code actions menu from the gutter when there is no space in the editor and an AI fix and a quick fix is available."));
const GUTTER_SPARKLE_FILLED_ICON = registerIcon("gutter-lightbulb-sparkle-filled", Codicon.sparkleFilled, nls.localize("gutterLightbulbSparkleFilledWidget", "Icon which spawns code actions menu from the gutter when there is no space in the editor and an AI fix and a quick fix is available."));
var LightBulbState;
((LightBulbState2) => {
  let Type;
  ((Type2) => {
    Type2[Type2["Hidden"] = 0] = "Hidden";
    Type2[Type2["Showing"] = 1] = "Showing";
  })(Type = LightBulbState2.Type || (LightBulbState2.Type = {}));
  LightBulbState2.Hidden = { type: 0 /* Hidden */ };
  class Showing {
    constructor(actions, trigger, editorPosition, widgetPosition) {
      this.actions = actions;
      this.trigger = trigger;
      this.editorPosition = editorPosition;
      this.widgetPosition = widgetPosition;
      this.type = 1 /* Showing */;
    }
  }
  LightBulbState2.Showing = Showing;
})(LightBulbState || (LightBulbState = {}));
function computeLightBulbInfo(actions, trigger, preferredKbLabel, quickFixKbLabel, forGutter = false) {
  if (actions.validActions.length <= 0) {
    return void 0;
  }
  let icon;
  let autoRun = false;
  if (actions.allAIFixes) {
    icon = forGutter ? GUTTER_SPARKLE_FILLED_ICON : Codicon.sparkleFilled;
    if (actions.validActions.length === 1) {
      autoRun = true;
    }
  } else if (actions.hasAutoFix) {
    if (actions.hasAIFix) {
      icon = forGutter ? GUTTER_LIGHTBULB_AIFIX_AUTO_FIX_ICON : Codicon.lightbulbSparkleAutofix;
    } else {
      icon = forGutter ? GUTTER_LIGHTBULB_AUTO_FIX_ICON : Codicon.lightbulbAutofix;
    }
  } else if (actions.hasAIFix) {
    icon = forGutter ? GUTTER_LIGHTBULB_AIFIX_ICON : Codicon.lightbulbSparkle;
  } else {
    icon = forGutter ? GUTTER_LIGHTBULB_ICON : Codicon.lightBulb;
  }
  let title;
  if (autoRun) {
    title = nls.localize("codeActionAutoRun", "Run: {0}", actions.validActions[0].action.title);
  } else if (actions.hasAutoFix && preferredKbLabel) {
    title = nls.localize("preferredcodeActionWithKb", "Show Code Actions. Preferred Quick Fix Available ({0})", preferredKbLabel);
  } else if (!actions.hasAutoFix && quickFixKbLabel) {
    title = nls.localize("codeActionWithKb", "Show Code Actions ({0})", quickFixKbLabel);
  } else {
    title = nls.localize("codeAction", "Show Code Actions");
  }
  return { actions, trigger, icon, autoRun, title, isGutter: forGutter };
}
let LightBulbWidget = class extends Disposable {
  constructor(_editor, _keybindingService) {
    super();
    this._editor = _editor;
    this._keybindingService = _keybindingService;
    this.onlyWithEmptySelection = false;
    this._onClick = this._register(new Emitter());
    this.onClick = this._onClick.event;
    this._state = observableValue(this, LightBulbState.Hidden);
    this._gutterState = observableValue(this, LightBulbState.Hidden);
    this._combinedInfo = derived(this, (reader) => {
      const gutterState = this._gutterState.read(reader);
      if (gutterState.type === 1 /* Showing */) {
        return LightBulbWidget._computeLightBulbInfo(gutterState, true, this._preferredKbLabel.read(reader), this._quickFixKbLabel.read(reader));
      }
      const state = this._state.read(reader);
      if (state.type === 1 /* Showing */) {
        return LightBulbWidget._computeLightBulbInfo(state, false, this._preferredKbLabel.read(reader), this._quickFixKbLabel.read(reader));
      }
      return void 0;
    });
    this.lightBulbInfo = this._combinedInfo;
    this._iconClasses = [];
    this.lightbulbClasses = [
      "codicon-" + GUTTER_LIGHTBULB_ICON.id,
      "codicon-" + GUTTER_LIGHTBULB_AIFIX_AUTO_FIX_ICON.id,
      "codicon-" + GUTTER_LIGHTBULB_AUTO_FIX_ICON.id,
      "codicon-" + GUTTER_LIGHTBULB_AIFIX_ICON.id,
      "codicon-" + GUTTER_SPARKLE_FILLED_ICON.id
    ];
    this._preferredKbLabel = observableValue(this, void 0);
    this._quickFixKbLabel = observableValue(this, void 0);
    this.gutterDecoration = LightBulbWidget.GUTTER_DECORATION;
    this._domNode = dom.$("div.lightBulbWidget");
    this._domNode.role = "listbox";
    this._register(Gesture.ignoreTarget(this._domNode));
    this._editor.addContentWidget(this);
    this._register(this._editor.onDidChangeModelContent((_) => {
      const editorModel = this._editor.getModel();
      const state = this._state.get();
      if (state.type !== 1 /* Showing */ || !editorModel || state.editorPosition.lineNumber >= editorModel.getLineCount()) {
        this.hide();
      }
      const gutterState = this._gutterState.get();
      if (gutterState.type !== 1 /* Showing */ || !editorModel || gutterState.editorPosition.lineNumber >= editorModel.getLineCount()) {
        this.gutterHide();
      }
    }));
    this._register(dom.addStandardDisposableGenericMouseDownListener(this._domNode, (e) => {
      const state = this._state.get();
      if (state.type !== 1 /* Showing */) {
        return;
      }
      this._editor.focus();
      e.preventDefault();
      const { top, height } = dom.getDomNodePagePosition(this._domNode);
      const lineHeight = this._editor.getOption(EditorOption.lineHeight);
      let pad = Math.floor(lineHeight / 3);
      if (state.widgetPosition.position !== null && state.widgetPosition.position.lineNumber < state.editorPosition.lineNumber) {
        pad += lineHeight;
      }
      this._onClick.fire({
        x: e.posx,
        y: top + height + pad,
        actions: state.actions,
        trigger: state.trigger
      });
    }));
    this._register(dom.addDisposableListener(this._domNode, "mouseenter", (e) => {
      if ((e.buttons & 1) !== 1) {
        return;
      }
      this.hide();
    }));
    this._register(Event.runAndSubscribe(this._keybindingService.onDidUpdateKeybindings, () => {
      this._preferredKbLabel.set(this._keybindingService.lookupKeybinding(autoFixCommandId)?.getLabel() ?? void 0, void 0);
      this._quickFixKbLabel.set(this._keybindingService.lookupKeybinding(quickFixCommandId)?.getLabel() ?? void 0, void 0);
    }));
    this._register(autorun((reader) => {
      const info = this._combinedInfo.read(reader);
      this._updateLightBulbTitleAndIcon(info);
      this._updateGutterDecorationOptions(info);
    }));
    this._register(this._editor.onMouseDown(async (e) => {
      if (!e.target.element || !this.lightbulbClasses.some((cls) => e.target.element && e.target.element.classList.contains(cls))) {
        return;
      }
      const gutterState = this._gutterState.get();
      if (gutterState.type !== 1 /* Showing */) {
        return;
      }
      this._editor.focus();
      const { top, height } = dom.getDomNodePagePosition(e.target.element);
      const lineHeight = this._editor.getOption(EditorOption.lineHeight);
      let pad = Math.floor(lineHeight / 3);
      if (gutterState.widgetPosition.position !== null && gutterState.widgetPosition.position.lineNumber < gutterState.editorPosition.lineNumber) {
        pad += lineHeight;
      }
      this._onClick.fire({
        x: e.event.posx,
        y: top + height + pad,
        actions: gutterState.actions,
        trigger: gutterState.trigger
      });
    }));
  }
  static _computeLightBulbInfo(state, forGutter, preferredKbLabel, quickFixKbLabel) {
    if (state.type !== 1 /* Showing */) {
      return void 0;
    }
    return computeLightBulbInfo(state.actions, state.trigger, preferredKbLabel, quickFixKbLabel, forGutter);
  }
  dispose() {
    super.dispose();
    this._editor.removeContentWidget(this);
    if (this._gutterDecorationID) {
      this._removeGutterDecoration(this._gutterDecorationID);
    }
  }
  getId() {
    return "LightBulbWidget";
  }
  getDomNode() {
    return this._domNode;
  }
  getPosition() {
    const state = this._state.get();
    return state.type === 1 /* Showing */ ? state.widgetPosition : null;
  }
  update(actions, trigger, atPosition) {
    if (actions.validActions.length <= 0) {
      this.gutterHide();
      return this.hide();
    }
    if (this.onlyWithEmptySelection && !this._editor.getSelection()?.isEmpty()) {
      this.gutterHide();
      return this.hide();
    }
    const hasTextFocus = this._editor.hasTextFocus();
    if (!hasTextFocus) {
      this.gutterHide();
      return this.hide();
    }
    const options = this._editor.getOptions();
    if (options.get(EditorOption.lightbulb).enabled === ShowLightbulbIconMode.Off) {
      this.gutterHide();
      return this.hide();
    }
    const model = this._editor.getModel();
    if (!model) {
      this.gutterHide();
      return this.hide();
    }
    const { lineNumber, column } = model.validatePosition(atPosition);
    const tabSize = model.getOptions().tabSize;
    const fontInfo = this._editor.getOptions().get(EditorOption.fontInfo);
    const lineContent = model.getLineContent(lineNumber);
    const indent = computeIndentLevel(lineContent, tabSize);
    const lineHasSpace = fontInfo.spaceWidth * indent > 22;
    const isFolded = (lineNumber2) => {
      return lineNumber2 > 2 && this._editor.getTopForLineNumber(lineNumber2) === this._editor.getTopForLineNumber(lineNumber2 - 1);
    };
    const currLineDecorations = this._editor.getLineDecorations(lineNumber);
    let hasDecoration = false;
    if (currLineDecorations) {
      for (const decoration of currLineDecorations) {
        const glyphClass = decoration.options.glyphMarginClassName;
        if (glyphClass && !this.lightbulbClasses.some((className) => glyphClass.includes(className))) {
          hasDecoration = true;
          break;
        }
      }
    }
    let effectiveLineNumber = lineNumber;
    let effectiveColumnNumber = 1;
    if (!lineHasSpace) {
      const isLineEmptyOrIndented = (lineNumber2) => {
        const lineContent2 = model.getLineContent(lineNumber2);
        return /^\s*$|^\s+/.test(lineContent2) || lineContent2.length <= effectiveColumnNumber;
      };
      if (lineNumber > 1 && !isFolded(lineNumber - 1)) {
        const lineCount = model.getLineCount();
        const endLine = lineNumber === lineCount;
        const prevLineEmptyOrIndented = lineNumber > 1 && isLineEmptyOrIndented(lineNumber - 1);
        const nextLineEmptyOrIndented = !endLine && isLineEmptyOrIndented(lineNumber + 1);
        const currLineEmptyOrIndented = isLineEmptyOrIndented(lineNumber);
        const notEmpty = !nextLineEmptyOrIndented && !prevLineEmptyOrIndented;
        if (!nextLineEmptyOrIndented && !prevLineEmptyOrIndented && !hasDecoration) {
          this._gutterState.set(new LightBulbState.Showing(actions, trigger, atPosition, {
            position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
            preference: LightBulbWidget._posPref
          }), void 0);
          this.renderGutterLightbub();
          return this.hide();
        } else if (prevLineEmptyOrIndented || endLine || prevLineEmptyOrIndented && !currLineEmptyOrIndented) {
          effectiveLineNumber -= 1;
        } else if (nextLineEmptyOrIndented || notEmpty && currLineEmptyOrIndented) {
          effectiveLineNumber += 1;
        }
      } else if (lineNumber === 1 && (lineNumber === model.getLineCount() || !isLineEmptyOrIndented(lineNumber + 1) && !isLineEmptyOrIndented(lineNumber))) {
        this._gutterState.set(new LightBulbState.Showing(actions, trigger, atPosition, {
          position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
          preference: LightBulbWidget._posPref
        }), void 0);
        if (hasDecoration) {
          this.gutterHide();
        } else {
          this.renderGutterLightbub();
          return this.hide();
        }
      } else if (lineNumber < model.getLineCount() && !isFolded(lineNumber + 1)) {
        effectiveLineNumber += 1;
      } else if (column * fontInfo.spaceWidth < 22) {
        return this.hide();
      }
      effectiveColumnNumber = /^\S\s*$/.test(model.getLineContent(effectiveLineNumber)) ? 2 : 1;
    }
    this._state.set(new LightBulbState.Showing(actions, trigger, atPosition, {
      position: { lineNumber: effectiveLineNumber, column: effectiveColumnNumber },
      preference: LightBulbWidget._posPref
    }), void 0);
    if (this._gutterDecorationID) {
      this._removeGutterDecoration(this._gutterDecorationID);
      this.gutterHide();
    }
    const validActions = actions.validActions;
    const actionKind = actions.validActions[0].action.kind;
    if (validActions.length !== 1 || !actionKind) {
      this._editor.layoutContentWidget(this);
      return;
    }
    this._editor.layoutContentWidget(this);
  }
  hide() {
    if (this._state.get() === LightBulbState.Hidden) {
      return;
    }
    this._state.set(LightBulbState.Hidden, void 0);
    this._editor.layoutContentWidget(this);
  }
  gutterHide() {
    if (this._gutterState.get() === LightBulbState.Hidden) {
      return;
    }
    if (this._gutterDecorationID) {
      this._removeGutterDecoration(this._gutterDecorationID);
    }
    this._gutterState.set(LightBulbState.Hidden, void 0);
  }
  _updateLightBulbTitleAndIcon(info) {
    this._domNode.classList.remove(...this._iconClasses);
    this._iconClasses = [];
    if (!info || info.isGutter) {
      return;
    }
    this._domNode.title = info.title;
    this._iconClasses = ThemeIcon.asClassNameArray(info.icon);
    this._domNode.classList.add(...this._iconClasses);
  }
  _updateGutterDecorationOptions(info) {
    if (!info || !info.isGutter) {
      return;
    }
    this.gutterDecoration = ModelDecorationOptions.register({
      description: "codicon-gutter-lightbulb-decoration",
      glyphMarginClassName: ThemeIcon.asClassName(info.icon),
      glyphMargin: { position: GlyphMarginLane.Left },
      stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    });
  }
  /* Gutter Helper Functions */
  renderGutterLightbub() {
    const selection = this._editor.getSelection();
    if (!selection) {
      return;
    }
    if (this._gutterDecorationID === void 0) {
      this._addGutterDecoration(selection.startLineNumber);
    } else {
      this._updateGutterDecoration(this._gutterDecorationID, selection.startLineNumber);
    }
  }
  _addGutterDecoration(lineNumber) {
    this._editor.changeDecorations((accessor) => {
      this._gutterDecorationID = accessor.addDecoration(new Range(lineNumber, 0, lineNumber, 0), this.gutterDecoration);
    });
  }
  _removeGutterDecoration(decorationId) {
    this._editor.changeDecorations((accessor) => {
      accessor.removeDecoration(decorationId);
      this._gutterDecorationID = void 0;
    });
  }
  _updateGutterDecoration(decorationId, lineNumber) {
    this._editor.changeDecorations((accessor) => {
      accessor.changeDecoration(decorationId, new Range(lineNumber, 0, lineNumber, 0));
      accessor.changeDecorationOptions(decorationId, this.gutterDecoration);
    });
  }
};
LightBulbWidget.GUTTER_DECORATION = ModelDecorationOptions.register({
  description: "codicon-gutter-lightbulb-decoration",
  glyphMarginClassName: ThemeIcon.asClassName(Codicon.lightBulb),
  glyphMargin: { position: GlyphMarginLane.Left },
  stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
});
LightBulbWidget.ID = "editor.contrib.lightbulbWidget";
LightBulbWidget._posPref = [ContentWidgetPositionPreference.EXACT];
LightBulbWidget = __decorateClass([
  __decorateParam(1, IKeybindingService)
], LightBulbWidget);
export {
  LightBulbWidget,
  computeLightBulbInfo
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vYnJvd3Nlci9saWdodEJ1bGJXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBHZXN0dXJlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3RvdWNoLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCAnLi9saWdodEJ1bGJXaWRnZXQuY3NzJztcbmltcG9ydCB7IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UsIElDb2RlRWRpdG9yLCBJQ29udGVudFdpZGdldCwgSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiwgSUVkaXRvck1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uLCBTaG93TGlnaHRidWxiSWNvbk1vZGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgR2x5cGhNYXJnaW5MYW5lLCBJTW9kZWxEZWNvcmF0aW9uc0NoYW5nZUFjY2Vzc29yLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IGNvbXB1dGVJbmRlbnRMZXZlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC91dGlscy5qcyc7XG5pbXBvcnQgeyBhdXRvRml4Q29tbWFuZElkLCBxdWlja0ZpeENvbW1hbmRJZCB9IGZyb20gJy4vY29kZUFjdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uU2V0LCBDb2RlQWN0aW9uVHJpZ2dlciB9IGZyb20gJy4uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcblxuY29uc3QgR1VUVEVSX0xJR0hUQlVMQl9JQ09OID0gcmVnaXN0ZXJJY29uKCdndXR0ZXItbGlnaHRidWxiJywgQ29kaWNvbi5saWdodEJ1bGIsIG5scy5sb2NhbGl6ZSgnZ3V0dGVyTGlnaHRidWxiV2lkZ2V0JywgJ0ljb24gd2hpY2ggc3Bhd25zIGNvZGUgYWN0aW9ucyBtZW51IGZyb20gdGhlIGd1dHRlciB3aGVuIHRoZXJlIGlzIG5vIHNwYWNlIGluIHRoZSBlZGl0b3IuJykpO1xuY29uc3QgR1VUVEVSX0xJR0hUQlVMQl9BVVRPX0ZJWF9JQ09OID0gcmVnaXN0ZXJJY29uKCdndXR0ZXItbGlnaHRidWxiLWF1dG8tZml4JywgQ29kaWNvbi5saWdodGJ1bGJBdXRvZml4LCBubHMubG9jYWxpemUoJ2d1dHRlckxpZ2h0YnVsYkF1dG9GaXhXaWRnZXQnLCAnSWNvbiB3aGljaCBzcGF3bnMgY29kZSBhY3Rpb25zIG1lbnUgZnJvbSB0aGUgZ3V0dGVyIHdoZW4gdGhlcmUgaXMgbm8gc3BhY2UgaW4gdGhlIGVkaXRvciBhbmQgYSBxdWljayBmaXggaXMgYXZhaWxhYmxlLicpKTtcbmNvbnN0IEdVVFRFUl9MSUdIVEJVTEJfQUlGSVhfSUNPTiA9IHJlZ2lzdGVySWNvbignZ3V0dGVyLWxpZ2h0YnVsYi1zcGFya2xlJywgQ29kaWNvbi5saWdodGJ1bGJTcGFya2xlLCBubHMubG9jYWxpemUoJ2d1dHRlckxpZ2h0YnVsYkFJRml4V2lkZ2V0JywgJ0ljb24gd2hpY2ggc3Bhd25zIGNvZGUgYWN0aW9ucyBtZW51IGZyb20gdGhlIGd1dHRlciB3aGVuIHRoZXJlIGlzIG5vIHNwYWNlIGluIHRoZSBlZGl0b3IgYW5kIGFuIEFJIGZpeCBpcyBhdmFpbGFibGUuJykpO1xuY29uc3QgR1VUVEVSX0xJR0hUQlVMQl9BSUZJWF9BVVRPX0ZJWF9JQ09OID0gcmVnaXN0ZXJJY29uKCdndXR0ZXItbGlnaHRidWxiLWFpZml4LWF1dG8tZml4JywgQ29kaWNvbi5saWdodGJ1bGJTcGFya2xlQXV0b2ZpeCwgbmxzLmxvY2FsaXplKCdndXR0ZXJMaWdodGJ1bGJBSUZpeEF1dG9GaXhXaWRnZXQnLCAnSWNvbiB3aGljaCBzcGF3bnMgY29kZSBhY3Rpb25zIG1lbnUgZnJvbSB0aGUgZ3V0dGVyIHdoZW4gdGhlcmUgaXMgbm8gc3BhY2UgaW4gdGhlIGVkaXRvciBhbmQgYW4gQUkgZml4IGFuZCBhIHF1aWNrIGZpeCBpcyBhdmFpbGFibGUuJykpO1xuY29uc3QgR1VUVEVSX1NQQVJLTEVfRklMTEVEX0lDT04gPSByZWdpc3Rlckljb24oJ2d1dHRlci1saWdodGJ1bGItc3BhcmtsZS1maWxsZWQnLCBDb2RpY29uLnNwYXJrbGVGaWxsZWQsIG5scy5sb2NhbGl6ZSgnZ3V0dGVyTGlnaHRidWxiU3BhcmtsZUZpbGxlZFdpZGdldCcsICdJY29uIHdoaWNoIHNwYXducyBjb2RlIGFjdGlvbnMgbWVudSBmcm9tIHRoZSBndXR0ZXIgd2hlbiB0aGVyZSBpcyBubyBzcGFjZSBpbiB0aGUgZWRpdG9yIGFuZCBhbiBBSSBmaXggYW5kIGEgcXVpY2sgZml4IGlzIGF2YWlsYWJsZS4nKSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTGlnaHRCdWxiSW5mbyB7XG5cdHJlYWRvbmx5IGFjdGlvbnM6IENvZGVBY3Rpb25TZXQ7XG5cdHJlYWRvbmx5IHRyaWdnZXI6IENvZGVBY3Rpb25UcmlnZ2VyO1xuXHRyZWFkb25seSBpY29uOiBUaGVtZUljb247XG5cdHJlYWRvbmx5IGF1dG9SdW46IGJvb2xlYW47XG5cdHJlYWRvbmx5IHRpdGxlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGlzR3V0dGVyOiBib29sZWFuO1xufVxuXG5uYW1lc3BhY2UgTGlnaHRCdWxiU3RhdGUge1xuXG5cdGV4cG9ydCBjb25zdCBlbnVtIFR5cGUge1xuXHRcdEhpZGRlbixcblx0XHRTaG93aW5nLFxuXHR9XG5cblx0ZXhwb3J0IGNvbnN0IEhpZGRlbiA9IHsgdHlwZTogVHlwZS5IaWRkZW4gfSBhcyBjb25zdDtcblxuXHRleHBvcnQgY2xhc3MgU2hvd2luZyB7XG5cdFx0cmVhZG9ubHkgdHlwZSA9IFR5cGUuU2hvd2luZztcblxuXHRcdGNvbnN0cnVjdG9yKFxuXHRcdFx0cHVibGljIHJlYWRvbmx5IGFjdGlvbnM6IENvZGVBY3Rpb25TZXQsXG5cdFx0XHRwdWJsaWMgcmVhZG9ubHkgdHJpZ2dlcjogQ29kZUFjdGlvblRyaWdnZXIsXG5cdFx0XHRwdWJsaWMgcmVhZG9ubHkgZWRpdG9yUG9zaXRpb246IElQb3NpdGlvbixcblx0XHRcdHB1YmxpYyByZWFkb25seSB3aWRnZXRQb3NpdGlvbjogSUNvbnRlbnRXaWRnZXRQb3NpdGlvbixcblx0XHQpIHsgfVxuXHR9XG5cblx0ZXhwb3J0IHR5cGUgU3RhdGUgPSB0eXBlb2YgSGlkZGVuIHwgU2hvd2luZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbXB1dGVMaWdodEJ1bGJJbmZvKGFjdGlvbnM6IENvZGVBY3Rpb25TZXQsIHRyaWdnZXI6IENvZGVBY3Rpb25UcmlnZ2VyLCBwcmVmZXJyZWRLYkxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQsIHF1aWNrRml4S2JMYWJlbDogc3RyaW5nIHwgdW5kZWZpbmVkLCBmb3JHdXR0ZXI6IGJvb2xlYW4gPSBmYWxzZSk6IExpZ2h0QnVsYkluZm8gfCB1bmRlZmluZWQge1xuXHRpZiAoYWN0aW9ucy52YWxpZEFjdGlvbnMubGVuZ3RoIDw9IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0bGV0IGljb246IFRoZW1lSWNvbjtcblx0bGV0IGF1dG9SdW4gPSBmYWxzZTtcblx0aWYgKGFjdGlvbnMuYWxsQUlGaXhlcykge1xuXHRcdGljb24gPSBmb3JHdXR0ZXIgPyBHVVRURVJfU1BBUktMRV9GSUxMRURfSUNPTiA6IENvZGljb24uc3BhcmtsZUZpbGxlZDtcblx0XHRpZiAoYWN0aW9ucy52YWxpZEFjdGlvbnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRhdXRvUnVuID0gdHJ1ZTtcblx0XHR9XG5cdH0gZWxzZSBpZiAoYWN0aW9ucy5oYXNBdXRvRml4KSB7XG5cdFx0aWYgKGFjdGlvbnMuaGFzQUlGaXgpIHtcblx0XHRcdGljb24gPSBmb3JHdXR0ZXIgPyBHVVRURVJfTElHSFRCVUxCX0FJRklYX0FVVE9fRklYX0lDT04gOiBDb2RpY29uLmxpZ2h0YnVsYlNwYXJrbGVBdXRvZml4O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRpY29uID0gZm9yR3V0dGVyID8gR1VUVEVSX0xJR0hUQlVMQl9BVVRPX0ZJWF9JQ09OIDogQ29kaWNvbi5saWdodGJ1bGJBdXRvZml4O1xuXHRcdH1cblx0fSBlbHNlIGlmIChhY3Rpb25zLmhhc0FJRml4KSB7XG5cdFx0aWNvbiA9IGZvckd1dHRlciA/IEdVVFRFUl9MSUdIVEJVTEJfQUlGSVhfSUNPTiA6IENvZGljb24ubGlnaHRidWxiU3BhcmtsZTtcblx0fSBlbHNlIHtcblx0XHRpY29uID0gZm9yR3V0dGVyID8gR1VUVEVSX0xJR0hUQlVMQl9JQ09OIDogQ29kaWNvbi5saWdodEJ1bGI7XG5cdH1cblxuXHRsZXQgdGl0bGU6IHN0cmluZztcblx0aWYgKGF1dG9SdW4pIHtcblx0XHR0aXRsZSA9IG5scy5sb2NhbGl6ZSgnY29kZUFjdGlvbkF1dG9SdW4nLCBcIlJ1bjogezB9XCIsIGFjdGlvbnMudmFsaWRBY3Rpb25zWzBdLmFjdGlvbi50aXRsZSk7XG5cdH0gZWxzZSBpZiAoYWN0aW9ucy5oYXNBdXRvRml4ICYmIHByZWZlcnJlZEtiTGFiZWwpIHtcblx0XHR0aXRsZSA9IG5scy5sb2NhbGl6ZSgncHJlZmVycmVkY29kZUFjdGlvbldpdGhLYicsIFwiU2hvdyBDb2RlIEFjdGlvbnMuIFByZWZlcnJlZCBRdWljayBGaXggQXZhaWxhYmxlICh7MH0pXCIsIHByZWZlcnJlZEtiTGFiZWwpO1xuXHR9IGVsc2UgaWYgKCFhY3Rpb25zLmhhc0F1dG9GaXggJiYgcXVpY2tGaXhLYkxhYmVsKSB7XG5cdFx0dGl0bGUgPSBubHMubG9jYWxpemUoJ2NvZGVBY3Rpb25XaXRoS2InLCBcIlNob3cgQ29kZSBBY3Rpb25zICh7MH0pXCIsIHF1aWNrRml4S2JMYWJlbCk7XG5cdH0gZWxzZSB7XG5cdFx0dGl0bGUgPSBubHMubG9jYWxpemUoJ2NvZGVBY3Rpb24nLCBcIlNob3cgQ29kZSBBY3Rpb25zXCIpO1xuXHR9XG5cblx0cmV0dXJuIHsgYWN0aW9ucywgdHJpZ2dlciwgaWNvbiwgYXV0b1J1biwgdGl0bGUsIGlzR3V0dGVyOiBmb3JHdXR0ZXIgfTtcbn1cblxuZXhwb3J0IGNsYXNzIExpZ2h0QnVsYldpZGdldCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29udGVudFdpZGdldCB7XG5cdHByaXZhdGUgX2d1dHRlckRlY29yYXRpb25JRDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdG9ubHlXaXRoRW1wdHlTZWxlY3Rpb24gPSBmYWxzZTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBHVVRURVJfREVDT1JBVElPTiA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoe1xuXHRcdGRlc2NyaXB0aW9uOiAnY29kaWNvbi1ndXR0ZXItbGlnaHRidWxiLWRlY29yYXRpb24nLFxuXHRcdGdseXBoTWFyZ2luQ2xhc3NOYW1lOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5saWdodEJ1bGIpLFxuXHRcdGdseXBoTWFyZ2luOiB7IHBvc2l0aW9uOiBHbHlwaE1hcmdpbkxhbmUuTGVmdCB9LFxuXHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHR9KTtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLmxpZ2h0YnVsYldpZGdldCc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX3Bvc1ByZWYgPSBbQ29udGVudFdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZS5FWEFDVF07XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25DbGljayA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgeDogbnVtYmVyOyByZWFkb25seSB5OiBudW1iZXI7IHJlYWRvbmx5IGFjdGlvbnM6IENvZGVBY3Rpb25TZXQ7IHJlYWRvbmx5IHRyaWdnZXI6IENvZGVBY3Rpb25UcmlnZ2VyIH0+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25DbGljayA9IHRoaXMuX29uQ2xpY2suZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdGUgPSBvYnNlcnZhYmxlVmFsdWU8TGlnaHRCdWxiU3RhdGUuU3RhdGU+KHRoaXMsIExpZ2h0QnVsYlN0YXRlLkhpZGRlbik7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2d1dHRlclN0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPExpZ2h0QnVsYlN0YXRlLlN0YXRlPih0aGlzLCBMaWdodEJ1bGJTdGF0ZS5IaWRkZW4pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbWJpbmVkSW5mbyA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRjb25zdCBndXR0ZXJTdGF0ZSA9IHRoaXMuX2d1dHRlclN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoZ3V0dGVyU3RhdGUudHlwZSA9PT0gTGlnaHRCdWxiU3RhdGUuVHlwZS5TaG93aW5nKSB7XG5cdFx0XHRyZXR1cm4gTGlnaHRCdWxiV2lkZ2V0Ll9jb21wdXRlTGlnaHRCdWxiSW5mbyhndXR0ZXJTdGF0ZSwgdHJ1ZSwgdGhpcy5fcHJlZmVycmVkS2JMYWJlbC5yZWFkKHJlYWRlciksIHRoaXMuX3F1aWNrRml4S2JMYWJlbC5yZWFkKHJlYWRlcikpO1xuXHRcdH1cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoc3RhdGUudHlwZSA9PT0gTGlnaHRCdWxiU3RhdGUuVHlwZS5TaG93aW5nKSB7XG5cdFx0XHRyZXR1cm4gTGlnaHRCdWxiV2lkZ2V0Ll9jb21wdXRlTGlnaHRCdWxiSW5mbyhzdGF0ZSwgZmFsc2UsIHRoaXMuX3ByZWZlcnJlZEtiTGFiZWwucmVhZChyZWFkZXIpLCB0aGlzLl9xdWlja0ZpeEtiTGFiZWwucmVhZChyZWFkZXIpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fSk7XG5cblx0cHVibGljIHJlYWRvbmx5IGxpZ2h0QnVsYkluZm86IElPYnNlcnZhYmxlPExpZ2h0QnVsYkluZm8gfCB1bmRlZmluZWQ+ID0gdGhpcy5fY29tYmluZWRJbmZvO1xuXG5cdHByaXZhdGUgX2ljb25DbGFzc2VzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbGlnaHRidWxiQ2xhc3NlcyA9IFtcblx0XHQnY29kaWNvbi0nICsgR1VUVEVSX0xJR0hUQlVMQl9JQ09OLmlkLFxuXHRcdCdjb2RpY29uLScgKyBHVVRURVJfTElHSFRCVUxCX0FJRklYX0FVVE9fRklYX0lDT04uaWQsXG5cdFx0J2NvZGljb24tJyArIEdVVFRFUl9MSUdIVEJVTEJfQVVUT19GSVhfSUNPTi5pZCxcblx0XHQnY29kaWNvbi0nICsgR1VUVEVSX0xJR0hUQlVMQl9BSUZJWF9JQ09OLmlkLFxuXHRcdCdjb2RpY29uLScgKyBHVVRURVJfU1BBUktMRV9GSUxMRURfSUNPTi5pZFxuXHRdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3ByZWZlcnJlZEtiTGFiZWwgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9xdWlja0ZpeEtiTGFiZWwgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXG5cdHByaXZhdGUgZ3V0dGVyRGVjb3JhdGlvbjogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyA9IExpZ2h0QnVsYldpZGdldC5HVVRURVJfREVDT1JBVElPTjtcblxuXHRwcml2YXRlIHN0YXRpYyBfY29tcHV0ZUxpZ2h0QnVsYkluZm8oc3RhdGU6IExpZ2h0QnVsYlN0YXRlLlN0YXRlLCBmb3JHdXR0ZXI6IGJvb2xlYW4sIHByZWZlcnJlZEtiTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZCwgcXVpY2tGaXhLYkxhYmVsOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBMaWdodEJ1bGJJbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoc3RhdGUudHlwZSAhPT0gTGlnaHRCdWxiU3RhdGUuVHlwZS5TaG93aW5nKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gY29tcHV0ZUxpZ2h0QnVsYkluZm8oc3RhdGUuYWN0aW9ucywgc3RhdGUudHJpZ2dlciwgcHJlZmVycmVkS2JMYWJlbCwgcXVpY2tGaXhLYkxhYmVsLCBmb3JHdXR0ZXIpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2tleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2RvbU5vZGUgPSBkb20uJCgnZGl2LmxpZ2h0QnVsYldpZGdldCcpO1xuXHRcdHRoaXMuX2RvbU5vZGUucm9sZSA9ICdsaXN0Ym94Jztcblx0XHR0aGlzLl9yZWdpc3RlcihHZXN0dXJlLmlnbm9yZVRhcmdldCh0aGlzLl9kb21Ob2RlKSk7XG5cblx0XHR0aGlzLl9lZGl0b3IuYWRkQ29udGVudFdpZGdldCh0aGlzKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsQ29udGVudChfID0+IHtcblx0XHRcdC8vIGNhbmNlbCB3aGVuIHRoZSBsaW5lIGluIHF1ZXN0aW9uIGhhcyBiZWVuIHJlbW92ZWRcblx0XHRcdGNvbnN0IGVkaXRvck1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlLmdldCgpO1xuXHRcdFx0aWYgKHN0YXRlLnR5cGUgIT09IExpZ2h0QnVsYlN0YXRlLlR5cGUuU2hvd2luZyB8fCAhZWRpdG9yTW9kZWwgfHwgc3RhdGUuZWRpdG9yUG9zaXRpb24ubGluZU51bWJlciA+PSBlZGl0b3JNb2RlbC5nZXRMaW5lQ291bnQoKSkge1xuXHRcdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZ3V0dGVyU3RhdGUgPSB0aGlzLl9ndXR0ZXJTdGF0ZS5nZXQoKTtcblx0XHRcdGlmIChndXR0ZXJTdGF0ZS50eXBlICE9PSBMaWdodEJ1bGJTdGF0ZS5UeXBlLlNob3dpbmcgfHwgIWVkaXRvck1vZGVsIHx8IGd1dHRlclN0YXRlLmVkaXRvclBvc2l0aW9uLmxpbmVOdW1iZXIgPj0gZWRpdG9yTW9kZWwuZ2V0TGluZUNvdW50KCkpIHtcblx0XHRcdFx0dGhpcy5ndXR0ZXJIaWRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUdlbmVyaWNNb3VzZURvd25MaXN0ZW5lcih0aGlzLl9kb21Ob2RlLCBlID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGUuZ2V0KCk7XG5cdFx0XHRpZiAoc3RhdGUudHlwZSAhPT0gTGlnaHRCdWxiU3RhdGUuVHlwZS5TaG93aW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gTWFrZSBzdXJlIHRoYXQgZm9jdXMgLyBjdXJzb3IgbG9jYXRpb24gaXMgbm90IGxvc3Qgd2hlbiBjbGlja2luZyB3aWRnZXQgaWNvblxuXHRcdFx0dGhpcy5fZWRpdG9yLmZvY3VzKCk7XG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cblx0XHRcdC8vIGEgYml0IG9mIGV4dHJhIHdvcmsgdG8gbWFrZSBzdXJlIHRoZSBtZW51XG5cdFx0XHQvLyBkb2Vzbid0IGNvdmVyIHRoZSBsaW5lLXRleHRcblx0XHRcdGNvbnN0IHsgdG9wLCBoZWlnaHQgfSA9IGRvbS5nZXREb21Ob2RlUGFnZVBvc2l0aW9uKHRoaXMuX2RvbU5vZGUpO1xuXHRcdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuX2VkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmxpbmVIZWlnaHQpO1xuXG5cdFx0XHRsZXQgcGFkID0gTWF0aC5mbG9vcihsaW5lSGVpZ2h0IC8gMyk7XG5cdFx0XHRpZiAoc3RhdGUud2lkZ2V0UG9zaXRpb24ucG9zaXRpb24gIT09IG51bGwgJiYgc3RhdGUud2lkZ2V0UG9zaXRpb24ucG9zaXRpb24ubGluZU51bWJlciA8IHN0YXRlLmVkaXRvclBvc2l0aW9uLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0cGFkICs9IGxpbmVIZWlnaHQ7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX29uQ2xpY2suZmlyZSh7XG5cdFx0XHRcdHg6IGUucG9zeCxcblx0XHRcdFx0eTogdG9wICsgaGVpZ2h0ICsgcGFkLFxuXHRcdFx0XHRhY3Rpb25zOiBzdGF0ZS5hY3Rpb25zLFxuXHRcdFx0XHR0cmlnZ2VyOiBzdGF0ZS50cmlnZ2VyLFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9kb21Ob2RlLCAnbW91c2VlbnRlcicsIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoKGUuYnV0dG9ucyAmIDEpICE9PSAxKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdC8vIG1vdXNlIGVudGVycyBsaWdodGJ1bGIgd2hpbGUgdGhlIHByaW1hcnkvbGVmdCBidXR0b25cblx0XHRcdC8vIGlzIGJlaW5nIHByZXNzZWQgLT4gaGlkZSB0aGUgbGlnaHRidWxiXG5cdFx0XHR0aGlzLmhpZGUoKTtcblx0XHR9KSk7XG5cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aGlzLl9rZXliaW5kaW5nU2VydmljZS5vbkRpZFVwZGF0ZUtleWJpbmRpbmdzLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9wcmVmZXJyZWRLYkxhYmVsLnNldCh0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGF1dG9GaXhDb21tYW5kSWQpPy5nZXRMYWJlbCgpID8/IHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX3F1aWNrRml4S2JMYWJlbC5zZXQodGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhxdWlja0ZpeENvbW1hbmRJZCk/LmdldExhYmVsKCkgPz8gdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEF1dG9ydW4gdG8gdXBkYXRlIHRoZSBET00gYmFzZWQgb24gc3RhdGUgY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGluZm8gPSB0aGlzLl9jb21iaW5lZEluZm8ucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fdXBkYXRlTGlnaHRCdWxiVGl0bGVBbmRJY29uKGluZm8pO1xuXHRcdFx0dGhpcy5fdXBkYXRlR3V0dGVyRGVjb3JhdGlvbk9wdGlvbnMoaW5mbyk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uTW91c2VEb3duKGFzeW5jIChlOiBJRWRpdG9yTW91c2VFdmVudCkgPT4ge1xuXG5cdFx0XHRpZiAoIWUudGFyZ2V0LmVsZW1lbnQgfHwgIXRoaXMubGlnaHRidWxiQ2xhc3Nlcy5zb21lKGNscyA9PiBlLnRhcmdldC5lbGVtZW50ICYmIGUudGFyZ2V0LmVsZW1lbnQuY2xhc3NMaXN0LmNvbnRhaW5zKGNscykpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZ3V0dGVyU3RhdGUgPSB0aGlzLl9ndXR0ZXJTdGF0ZS5nZXQoKTtcblx0XHRcdGlmIChndXR0ZXJTdGF0ZS50eXBlICE9PSBMaWdodEJ1bGJTdGF0ZS5UeXBlLlNob3dpbmcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNYWtlIHN1cmUgdGhhdCBmb2N1cyAvIGN1cnNvciBsb2NhdGlvbiBpcyBub3QgbG9zdCB3aGVuIGNsaWNraW5nIHdpZGdldCBpY29uXG5cdFx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblxuXHRcdFx0Ly8gYSBiaXQgb2YgZXh0cmEgd29yayB0byBtYWtlIHN1cmUgdGhlIG1lbnVcblx0XHRcdC8vIGRvZXNuJ3QgY292ZXIgdGhlIGxpbmUtdGV4dFxuXHRcdFx0Y29uc3QgeyB0b3AsIGhlaWdodCB9ID0gZG9tLmdldERvbU5vZGVQYWdlUG9zaXRpb24oZS50YXJnZXQuZWxlbWVudCk7XG5cdFx0XHRjb25zdCBsaW5lSGVpZ2h0ID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubGluZUhlaWdodCk7XG5cblx0XHRcdGxldCBwYWQgPSBNYXRoLmZsb29yKGxpbmVIZWlnaHQgLyAzKTtcblx0XHRcdGlmIChndXR0ZXJTdGF0ZS53aWRnZXRQb3NpdGlvbi5wb3NpdGlvbiAhPT0gbnVsbCAmJiBndXR0ZXJTdGF0ZS53aWRnZXRQb3NpdGlvbi5wb3NpdGlvbi5saW5lTnVtYmVyIDwgZ3V0dGVyU3RhdGUuZWRpdG9yUG9zaXRpb24ubGluZU51bWJlcikge1xuXHRcdFx0XHRwYWQgKz0gbGluZUhlaWdodDtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fb25DbGljay5maXJlKHtcblx0XHRcdFx0eDogZS5ldmVudC5wb3N4LFxuXHRcdFx0XHR5OiB0b3AgKyBoZWlnaHQgKyBwYWQsXG5cdFx0XHRcdGFjdGlvbnM6IGd1dHRlclN0YXRlLmFjdGlvbnMsXG5cdFx0XHRcdHRyaWdnZXI6IGd1dHRlclN0YXRlLnRyaWdnZXIsXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9lZGl0b3IucmVtb3ZlQ29udGVudFdpZGdldCh0aGlzKTtcblx0XHRpZiAodGhpcy5fZ3V0dGVyRGVjb3JhdGlvbklEKSB7XG5cdFx0XHR0aGlzLl9yZW1vdmVHdXR0ZXJEZWNvcmF0aW9uKHRoaXMuX2d1dHRlckRlY29yYXRpb25JRCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJ0xpZ2h0QnVsYldpZGdldCc7XG5cdH1cblxuXHRnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5fZG9tTm9kZTtcblx0fVxuXG5cdGdldFBvc2l0aW9uKCk6IElDb250ZW50V2lkZ2V0UG9zaXRpb24gfCBudWxsIHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlLmdldCgpO1xuXHRcdHJldHVybiBzdGF0ZS50eXBlID09PSBMaWdodEJ1bGJTdGF0ZS5UeXBlLlNob3dpbmcgPyBzdGF0ZS53aWRnZXRQb3NpdGlvbiA6IG51bGw7XG5cdH1cblxuXHRwdWJsaWMgdXBkYXRlKGFjdGlvbnM6IENvZGVBY3Rpb25TZXQsIHRyaWdnZXI6IENvZGVBY3Rpb25UcmlnZ2VyLCBhdFBvc2l0aW9uOiBJUG9zaXRpb24pIHtcblx0XHRpZiAoYWN0aW9ucy52YWxpZEFjdGlvbnMubGVuZ3RoIDw9IDApIHtcblx0XHRcdHRoaXMuZ3V0dGVySGlkZSgpO1xuXHRcdFx0cmV0dXJuIHRoaXMuaGlkZSgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLm9ubHlXaXRoRW1wdHlTZWxlY3Rpb24gJiYgIXRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb24oKT8uaXNFbXB0eSgpKSB7XG5cdFx0XHR0aGlzLmd1dHRlckhpZGUoKTtcblx0XHRcdHJldHVybiB0aGlzLmhpZGUoKTtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNUZXh0Rm9jdXMgPSB0aGlzLl9lZGl0b3IuaGFzVGV4dEZvY3VzKCk7XG5cdFx0aWYgKCFoYXNUZXh0Rm9jdXMpIHtcblx0XHRcdHRoaXMuZ3V0dGVySGlkZSgpO1xuXHRcdFx0cmV0dXJuIHRoaXMuaGlkZSgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wdGlvbnMgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9ucygpO1xuXHRcdGlmIChvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGlnaHRidWxiKS5lbmFibGVkID09PSBTaG93TGlnaHRidWxiSWNvbk1vZGUuT2ZmKSB7XG5cdFx0XHR0aGlzLmd1dHRlckhpZGUoKTtcblx0XHRcdHJldHVybiB0aGlzLmhpZGUoKTtcblx0XHR9XG5cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhpcy5ndXR0ZXJIaWRlKCk7XG5cdFx0XHRyZXR1cm4gdGhpcy5oaWRlKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgeyBsaW5lTnVtYmVyLCBjb2x1bW4gfSA9IG1vZGVsLnZhbGlkYXRlUG9zaXRpb24oYXRQb3NpdGlvbik7XG5cblx0XHRjb25zdCB0YWJTaXplID0gbW9kZWwuZ2V0T3B0aW9ucygpLnRhYlNpemU7XG5cdFx0Y29uc3QgZm9udEluZm8gPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9ucygpLmdldChFZGl0b3JPcHRpb24uZm9udEluZm8pO1xuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bWJlcik7XG5cdFx0Y29uc3QgaW5kZW50ID0gY29tcHV0ZUluZGVudExldmVsKGxpbmVDb250ZW50LCB0YWJTaXplKTtcblx0XHRjb25zdCBsaW5lSGFzU3BhY2UgPSBmb250SW5mby5zcGFjZVdpZHRoICogaW5kZW50ID4gMjI7XG5cdFx0Y29uc3QgaXNGb2xkZWQgPSAobGluZU51bWJlcjogbnVtYmVyKSA9PiB7XG5cdFx0XHRyZXR1cm4gbGluZU51bWJlciA+IDIgJiYgdGhpcy5fZWRpdG9yLmdldFRvcEZvckxpbmVOdW1iZXIobGluZU51bWJlcikgPT09IHRoaXMuX2VkaXRvci5nZXRUb3BGb3JMaW5lTnVtYmVyKGxpbmVOdW1iZXIgLSAxKTtcblx0XHR9O1xuXG5cdFx0Ly8gQ2hlY2sgZm9yIGdseXBoIG1hcmdpbiBkZWNvcmF0aW9ucyBvZiBhbnkga2luZFxuXHRcdGNvbnN0IGN1cnJMaW5lRGVjb3JhdGlvbnMgPSB0aGlzLl9lZGl0b3IuZ2V0TGluZURlY29yYXRpb25zKGxpbmVOdW1iZXIpO1xuXHRcdGxldCBoYXNEZWNvcmF0aW9uID0gZmFsc2U7XG5cdFx0aWYgKGN1cnJMaW5lRGVjb3JhdGlvbnMpIHtcblx0XHRcdGZvciAoY29uc3QgZGVjb3JhdGlvbiBvZiBjdXJyTGluZURlY29yYXRpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGdseXBoQ2xhc3MgPSBkZWNvcmF0aW9uLm9wdGlvbnMuZ2x5cGhNYXJnaW5DbGFzc05hbWU7XG5cblx0XHRcdFx0aWYgKGdseXBoQ2xhc3MgJiYgIXRoaXMubGlnaHRidWxiQ2xhc3Nlcy5zb21lKGNsYXNzTmFtZSA9PiBnbHlwaENsYXNzLmluY2x1ZGVzKGNsYXNzTmFtZSkpKSB7XG5cdFx0XHRcdFx0aGFzRGVjb3JhdGlvbiA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgZWZmZWN0aXZlTGluZU51bWJlciA9IGxpbmVOdW1iZXI7XG5cdFx0bGV0IGVmZmVjdGl2ZUNvbHVtbk51bWJlciA9IDE7XG5cdFx0aWYgKCFsaW5lSGFzU3BhY2UpIHtcblx0XHRcdC8vIENoZWNrcyBpZiBsaW5lIGlzIGVtcHR5IG9yIHN0YXJ0cyB3aXRoIGFueSBhbW91bnQgb2Ygd2hpdGVzcGFjZVxuXHRcdFx0Y29uc3QgaXNMaW5lRW1wdHlPckluZGVudGVkID0gKGxpbmVOdW1iZXI6IG51bWJlcik6IGJvb2xlYW4gPT4ge1xuXHRcdFx0XHRjb25zdCBsaW5lQ29udGVudCA9IG1vZGVsLmdldExpbmVDb250ZW50KGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRyZXR1cm4gL15cXHMqJHxeXFxzKy8udGVzdChsaW5lQ29udGVudCkgfHwgbGluZUNvbnRlbnQubGVuZ3RoIDw9IGVmZmVjdGl2ZUNvbHVtbk51bWJlcjtcblx0XHRcdH07XG5cblx0XHRcdGlmIChsaW5lTnVtYmVyID4gMSAmJiAhaXNGb2xkZWQobGluZU51bWJlciAtIDEpKSB7XG5cdFx0XHRcdGNvbnN0IGxpbmVDb3VudCA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdFx0XHRjb25zdCBlbmRMaW5lID0gbGluZU51bWJlciA9PT0gbGluZUNvdW50O1xuXHRcdFx0XHRjb25zdCBwcmV2TGluZUVtcHR5T3JJbmRlbnRlZCA9IGxpbmVOdW1iZXIgPiAxICYmIGlzTGluZUVtcHR5T3JJbmRlbnRlZChsaW5lTnVtYmVyIC0gMSk7XG5cdFx0XHRcdGNvbnN0IG5leHRMaW5lRW1wdHlPckluZGVudGVkID0gIWVuZExpbmUgJiYgaXNMaW5lRW1wdHlPckluZGVudGVkKGxpbmVOdW1iZXIgKyAxKTtcblx0XHRcdFx0Y29uc3QgY3VyckxpbmVFbXB0eU9ySW5kZW50ZWQgPSBpc0xpbmVFbXB0eU9ySW5kZW50ZWQobGluZU51bWJlcik7XG5cdFx0XHRcdGNvbnN0IG5vdEVtcHR5ID0gIW5leHRMaW5lRW1wdHlPckluZGVudGVkICYmICFwcmV2TGluZUVtcHR5T3JJbmRlbnRlZDtcblxuXHRcdFx0XHQvLyBjaGVjayBhYm92ZSBhbmQgYmVsb3cuIGlmIGJvdGggYXJlIGJsb2NrZWQsIGRpc3BsYXkgbGlnaHRidWxiIGluIHRoZSBndXR0ZXIuXG5cdFx0XHRcdGlmICghbmV4dExpbmVFbXB0eU9ySW5kZW50ZWQgJiYgIXByZXZMaW5lRW1wdHlPckluZGVudGVkICYmICFoYXNEZWNvcmF0aW9uKSB7XG5cdFx0XHRcdFx0dGhpcy5fZ3V0dGVyU3RhdGUuc2V0KG5ldyBMaWdodEJ1bGJTdGF0ZS5TaG93aW5nKGFjdGlvbnMsIHRyaWdnZXIsIGF0UG9zaXRpb24sIHtcblx0XHRcdFx0XHRcdHBvc2l0aW9uOiB7IGxpbmVOdW1iZXI6IGVmZmVjdGl2ZUxpbmVOdW1iZXIsIGNvbHVtbjogZWZmZWN0aXZlQ29sdW1uTnVtYmVyIH0sXG5cdFx0XHRcdFx0XHRwcmVmZXJlbmNlOiBMaWdodEJ1bGJXaWRnZXQuX3Bvc1ByZWZcblx0XHRcdFx0XHR9KSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHR0aGlzLnJlbmRlckd1dHRlckxpZ2h0YnViKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaGlkZSgpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHByZXZMaW5lRW1wdHlPckluZGVudGVkIHx8IGVuZExpbmUgfHwgKHByZXZMaW5lRW1wdHlPckluZGVudGVkICYmICFjdXJyTGluZUVtcHR5T3JJbmRlbnRlZCkpIHtcblx0XHRcdFx0XHRlZmZlY3RpdmVMaW5lTnVtYmVyIC09IDE7XG5cdFx0XHRcdH0gZWxzZSBpZiAobmV4dExpbmVFbXB0eU9ySW5kZW50ZWQgfHwgKG5vdEVtcHR5ICYmIGN1cnJMaW5lRW1wdHlPckluZGVudGVkKSkge1xuXHRcdFx0XHRcdGVmZmVjdGl2ZUxpbmVOdW1iZXIgKz0gMTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChsaW5lTnVtYmVyID09PSAxICYmIChsaW5lTnVtYmVyID09PSBtb2RlbC5nZXRMaW5lQ291bnQoKSB8fCAhaXNMaW5lRW1wdHlPckluZGVudGVkKGxpbmVOdW1iZXIgKyAxKSAmJiAhaXNMaW5lRW1wdHlPckluZGVudGVkKGxpbmVOdW1iZXIpKSkge1xuXHRcdFx0XHQvLyBzcGVjaWFsIGNoZWNrcyBmb3IgZmlyc3QgbGluZSBibG9ja2VkIHZzLiBub3QgYmxvY2tlZC5cblx0XHRcdFx0dGhpcy5fZ3V0dGVyU3RhdGUuc2V0KG5ldyBMaWdodEJ1bGJTdGF0ZS5TaG93aW5nKGFjdGlvbnMsIHRyaWdnZXIsIGF0UG9zaXRpb24sIHtcblx0XHRcdFx0XHRwb3NpdGlvbjogeyBsaW5lTnVtYmVyOiBlZmZlY3RpdmVMaW5lTnVtYmVyLCBjb2x1bW46IGVmZmVjdGl2ZUNvbHVtbk51bWJlciB9LFxuXHRcdFx0XHRcdHByZWZlcmVuY2U6IExpZ2h0QnVsYldpZGdldC5fcG9zUHJlZlxuXHRcdFx0XHR9KSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0XHRpZiAoaGFzRGVjb3JhdGlvbikge1xuXHRcdFx0XHRcdHRoaXMuZ3V0dGVySGlkZSgpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyR3V0dGVyTGlnaHRidWIoKTtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5oaWRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoKGxpbmVOdW1iZXIgPCBtb2RlbC5nZXRMaW5lQ291bnQoKSkgJiYgIWlzRm9sZGVkKGxpbmVOdW1iZXIgKyAxKSkge1xuXHRcdFx0XHRlZmZlY3RpdmVMaW5lTnVtYmVyICs9IDE7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbHVtbiAqIGZvbnRJbmZvLnNwYWNlV2lkdGggPCAyMikge1xuXHRcdFx0XHQvLyBjYW5ub3Qgc2hvdyBsaWdodGJ1bGIgYWJvdmUvYmVsb3cgYW5kIHNob3dpbmdcblx0XHRcdFx0Ly8gaXQgaW5saW5lIHdvdWxkIG92ZXJsYXkgdGhlIGN1cnNvci4uLlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5oaWRlKCk7XG5cdFx0XHR9XG5cdFx0XHRlZmZlY3RpdmVDb2x1bW5OdW1iZXIgPSAvXlxcU1xccyokLy50ZXN0KG1vZGVsLmdldExpbmVDb250ZW50KGVmZmVjdGl2ZUxpbmVOdW1iZXIpKSA/IDIgOiAxO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXRlLnNldChuZXcgTGlnaHRCdWxiU3RhdGUuU2hvd2luZyhhY3Rpb25zLCB0cmlnZ2VyLCBhdFBvc2l0aW9uLCB7XG5cdFx0XHRwb3NpdGlvbjogeyBsaW5lTnVtYmVyOiBlZmZlY3RpdmVMaW5lTnVtYmVyLCBjb2x1bW46IGVmZmVjdGl2ZUNvbHVtbk51bWJlciB9LFxuXHRcdFx0cHJlZmVyZW5jZTogTGlnaHRCdWxiV2lkZ2V0Ll9wb3NQcmVmXG5cdFx0fSksIHVuZGVmaW5lZCk7XG5cblx0XHRpZiAodGhpcy5fZ3V0dGVyRGVjb3JhdGlvbklEKSB7XG5cdFx0XHR0aGlzLl9yZW1vdmVHdXR0ZXJEZWNvcmF0aW9uKHRoaXMuX2d1dHRlckRlY29yYXRpb25JRCk7XG5cdFx0XHR0aGlzLmd1dHRlckhpZGUoKTtcblx0XHR9XG5cblx0XHRjb25zdCB2YWxpZEFjdGlvbnMgPSBhY3Rpb25zLnZhbGlkQWN0aW9ucztcblx0XHRjb25zdCBhY3Rpb25LaW5kID0gYWN0aW9ucy52YWxpZEFjdGlvbnNbMF0uYWN0aW9uLmtpbmQ7XG5cdFx0aWYgKHZhbGlkQWN0aW9ucy5sZW5ndGggIT09IDEgfHwgIWFjdGlvbktpbmQpIHtcblx0XHRcdHRoaXMuX2VkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX2VkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0cHVibGljIGhpZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmdldCgpID09PSBMaWdodEJ1bGJTdGF0ZS5IaWRkZW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zdGF0ZS5zZXQoTGlnaHRCdWxiU3RhdGUuSGlkZGVuLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuX2VkaXRvci5sYXlvdXRDb250ZW50V2lkZ2V0KHRoaXMpO1xuXHR9XG5cblx0cHVibGljIGd1dHRlckhpZGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2d1dHRlclN0YXRlLmdldCgpID09PSBMaWdodEJ1bGJTdGF0ZS5IaWRkZW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZ3V0dGVyRGVjb3JhdGlvbklEKSB7XG5cdFx0XHR0aGlzLl9yZW1vdmVHdXR0ZXJEZWNvcmF0aW9uKHRoaXMuX2d1dHRlckRlY29yYXRpb25JRCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fZ3V0dGVyU3RhdGUuc2V0KExpZ2h0QnVsYlN0YXRlLkhpZGRlbiwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUxpZ2h0QnVsYlRpdGxlQW5kSWNvbihpbmZvOiBMaWdodEJ1bGJJbmZvIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fZG9tTm9kZS5jbGFzc0xpc3QucmVtb3ZlKC4uLnRoaXMuX2ljb25DbGFzc2VzKTtcblx0XHR0aGlzLl9pY29uQ2xhc3NlcyA9IFtdO1xuXHRcdGlmICghaW5mbyB8fCBpbmZvLmlzR3V0dGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2RvbU5vZGUudGl0bGUgPSBpbmZvLnRpdGxlO1xuXHRcdHRoaXMuX2ljb25DbGFzc2VzID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoaW5mby5pY29uKTtcblx0XHR0aGlzLl9kb21Ob2RlLmNsYXNzTGlzdC5hZGQoLi4udGhpcy5faWNvbkNsYXNzZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlR3V0dGVyRGVjb3JhdGlvbk9wdGlvbnMoaW5mbzogTGlnaHRCdWxiSW5mbyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghaW5mbyB8fCAhaW5mby5pc0d1dHRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZ3V0dGVyRGVjb3JhdGlvbiA9IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoe1xuXHRcdFx0ZGVzY3JpcHRpb246ICdjb2RpY29uLWd1dHRlci1saWdodGJ1bGItZGVjb3JhdGlvbicsXG5cdFx0XHRnbHlwaE1hcmdpbkNsYXNzTmFtZTogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGluZm8uaWNvbiksXG5cdFx0XHRnbHlwaE1hcmdpbjogeyBwb3NpdGlvbjogR2x5cGhNYXJnaW5MYW5lLkxlZnQgfSxcblx0XHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHRcdH0pO1xuXHR9XG5cblx0LyogR3V0dGVyIEhlbHBlciBGdW5jdGlvbnMgKi9cblx0cHJpdmF0ZSByZW5kZXJHdXR0ZXJMaWdodGJ1YigpOiB2b2lkIHtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKCFzZWxlY3Rpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZ3V0dGVyRGVjb3JhdGlvbklEID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuX2FkZEd1dHRlckRlY29yYXRpb24oc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlcik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3VwZGF0ZUd1dHRlckRlY29yYXRpb24odGhpcy5fZ3V0dGVyRGVjb3JhdGlvbklELCBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9hZGRHdXR0ZXJEZWNvcmF0aW9uKGxpbmVOdW1iZXI6IG51bWJlcikge1xuXHRcdHRoaXMuX2VkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucygoYWNjZXNzb3I6IElNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdHRoaXMuX2d1dHRlckRlY29yYXRpb25JRCA9IGFjY2Vzc29yLmFkZERlY29yYXRpb24obmV3IFJhbmdlKGxpbmVOdW1iZXIsIDAsIGxpbmVOdW1iZXIsIDApLCB0aGlzLmd1dHRlckRlY29yYXRpb24pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVtb3ZlR3V0dGVyRGVjb3JhdGlvbihkZWNvcmF0aW9uSWQ6IHN0cmluZykge1xuXHRcdHRoaXMuX2VkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucygoYWNjZXNzb3I6IElNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdGFjY2Vzc29yLnJlbW92ZURlY29yYXRpb24oZGVjb3JhdGlvbklkKTtcblx0XHRcdHRoaXMuX2d1dHRlckRlY29yYXRpb25JRCA9IHVuZGVmaW5lZDtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZUd1dHRlckRlY29yYXRpb24oZGVjb3JhdGlvbklkOiBzdHJpbmcsIGxpbmVOdW1iZXI6IG51bWJlcikge1xuXHRcdHRoaXMuX2VkaXRvci5jaGFuZ2VEZWNvcmF0aW9ucygoYWNjZXNzb3I6IElNb2RlbERlY29yYXRpb25zQ2hhbmdlQWNjZXNzb3IpID0+IHtcblx0XHRcdGFjY2Vzc29yLmNoYW5nZURlY29yYXRpb24oZGVjb3JhdGlvbklkLCBuZXcgUmFuZ2UobGluZU51bWJlciwgMCwgbGluZU51bWJlciwgMCkpO1xuXHRcdFx0YWNjZXNzb3IuY2hhbmdlRGVjb3JhdGlvbk9wdGlvbnMoZGVjb3JhdGlvbklkLCB0aGlzLmd1dHRlckRlY29yYXRpb24pO1xuXHRcdH0pO1xuXHR9XG5cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFNBQVMsU0FBc0IsdUJBQXVCO0FBQy9ELFNBQVMsaUJBQWlCO0FBQzFCLE9BQU87QUFDUCxTQUFTLHVDQUErRztBQUN4SCxTQUFTLGNBQWMsNkJBQTZCO0FBRXBELFNBQVMsaUJBQWtELDhCQUE4QjtBQUN6RixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGtCQUFrQix5QkFBeUI7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Y0FBYyxJQUFJLE1BQU0sWUFBWSxHQUFHLFlBQVksQ0FBQyxHQUFHLEtBQUssZ0JBQWdCO0FBQUEsSUFDakgsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLHdCQUF3QixjQUFzQjtBQUNyRCxTQUFLLFFBQVEsa0JBQWtCLENBQUMsYUFBOEM7QUFDN0UsZUFBUyxpQkFBaUIsWUFBWTtBQUN0QyxXQUFLLHNCQUFzQjtBQUFBLElBQzVCLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSx3QkFBd0IsY0FBc0IsWUFBb0I7QUFDekUsU0FBSyxRQUFRLGtCQUFrQixDQUFDLGFBQThDO0FBQzdFLGVBQVMsaUJBQWlCLGNBQWMsSUFBSSxNQUFNLFlBQVksR0FBRyxZQUFZLENBQUMsQ0FBQztBQUMvRSxlQUFTLHdCQUF3QixjQUFjLEtBQUssZ0JBQWdCO0FBQUEsSUFDckUsQ0FBQztBQUFBLEVBQ0Y7QUFHRDtBQTlZYSxnQkFLWSxvQkFBb0IsdUJBQXVCLFNBQVM7QUFBQSxFQUMzRSxhQUFhO0FBQUEsRUFDYixzQkFBc0IsVUFBVSxZQUFZLFFBQVEsU0FBUztBQUFBLEVBQzdELGFBQWEsRUFBRSxVQUFVLGdCQUFnQixLQUFLO0FBQUEsRUFDOUMsWUFBWSx1QkFBdUI7QUFDcEMsQ0FBQztBQVZXLGdCQVlXLEtBQUs7QUFaaEIsZ0JBY1ksV0FBVyxDQUFDLGdDQUFnQyxLQUFLO0FBZDdELGtCQUFOO0FBQUEsRUE4REo7QUFBQSxHQTlEVTsiLAogICJuYW1lcyI6IFsiTGlnaHRCdWxiU3RhdGUiLCAiVHlwZSIsICJsaW5lTnVtYmVyIiwgImxpbmVDb250ZW50Il0KfQo=
