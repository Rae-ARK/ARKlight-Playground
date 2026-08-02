import { RunOnceScheduler } from "../../../../base/common/async.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import "./bracketMatching.css";
import { EditorAction, EditorContributionInstantiation, registerEditorAction, registerEditorContribution } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { Selection } from "../../../common/core/selection.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { OverviewRulerLane, TrackedRangeStickiness } from "../../../common/model.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import * as nls from "../../../../nls.js";
import { MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { registerThemingParticipant, themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import { editorBracketMatchForeground } from "../../../common/core/editorColorRegistry.js";
const overviewRulerBracketMatchForeground = registerColor("editorOverviewRuler.bracketMatchForeground", "#A0A0A0", nls.localize("overviewRulerBracketMatchForeground", "Overview ruler marker color for matching brackets."));
class JumpToBracketAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.jumpToBracket",
      label: nls.localize2("smartSelect.jumpBracket", "Go to Bracket"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Backslash,
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor, editor) {
    BracketMatchingController.get(editor)?.jumpToBracket();
  }
}
class SelectToBracketAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.selectToBracket",
      label: nls.localize2("smartSelect.selectToBracket", "Select to Bracket"),
      precondition: void 0,
      metadata: {
        description: nls.localize2("smartSelect.selectToBracketDescription", "Select the text inside and including the brackets or curly braces"),
        args: [{
          name: "args",
          schema: {
            type: "object",
            properties: {
              "selectBrackets": {
                type: "boolean",
                default: true
              }
            }
          }
        }]
      }
    });
  }
  run(accessor, editor, args) {
    let selectBrackets = true;
    if (args && args.selectBrackets === false) {
      selectBrackets = false;
    }
    BracketMatchingController.get(editor)?.selectToBracket(selectBrackets);
  }
}
class RemoveBracketsAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.removeBrackets",
      label: nls.localize2("smartSelect.removeBrackets", "Remove Brackets"),
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.Backspace,
        weight: KeybindingWeight.EditorContrib
      },
      canTriggerInlineEdits: true
    });
  }
  run(accessor, editor) {
    BracketMatchingController.get(editor)?.removeBrackets(this.id);
  }
}
class BracketsData {
  constructor(position, brackets, options) {
    this.position = position;
    this.brackets = brackets;
    this.options = options;
  }
}
const _BracketMatchingController = class _BracketMatchingController extends Disposable {
  static get(editor) {
    return editor.getContribution(_BracketMatchingController.ID);
  }
  constructor(editor) {
    super();
    this._editor = editor;
    this._lastBracketsData = [];
    this._lastVersionId = 0;
    this._decorations = this._editor.createDecorationsCollection();
    this._updateBracketsSoon = this._register(new RunOnceScheduler(() => this._updateBrackets(), 50));
    this._matchBrackets = this._editor.getOption(EditorOption.matchBrackets);
    this._updateBracketsSoon.schedule();
    this._register(editor.onDidChangeCursorPosition((e) => {
      if (this._matchBrackets === "never") {
        return;
      }
      this._updateBracketsSoon.schedule();
    }));
    this._register(editor.onDidChangeModelContent((e) => {
      this._updateBracketsSoon.schedule();
    }));
    this._register(editor.onDidChangeModel((e) => {
      this._lastBracketsData = [];
      this._updateBracketsSoon.schedule();
    }));
    this._register(editor.onDidChangeModelLanguageConfiguration((e) => {
      this._lastBracketsData = [];
      this._updateBracketsSoon.schedule();
    }));
    this._register(editor.onDidChangeConfiguration((e) => {
      if (e.hasChanged(EditorOption.matchBrackets)) {
        this._matchBrackets = this._editor.getOption(EditorOption.matchBrackets);
        this._decorations.clear();
        this._lastBracketsData = [];
        this._lastVersionId = 0;
        this._updateBracketsSoon.schedule();
      }
    }));
    this._register(editor.onDidBlurEditorWidget(() => {
      this._updateBracketsSoon.schedule();
    }));
    this._register(editor.onDidFocusEditorWidget(() => {
      this._updateBracketsSoon.schedule();
    }));
  }
  jumpToBracket() {
    if (!this._editor.hasModel()) {
      return;
    }
    const model = this._editor.getModel();
    const newSelections = this._editor.getSelections().map((selection) => {
      const position = selection.getStartPosition();
      const brackets = model.bracketPairs.matchBracket(position);
      let newCursorPosition = null;
      if (brackets) {
        if (brackets[0].containsPosition(position) && !brackets[1].containsPosition(position)) {
          newCursorPosition = brackets[1].getStartPosition();
        } else if (brackets[1].containsPosition(position)) {
          newCursorPosition = brackets[0].getStartPosition();
        }
      } else {
        const enclosingBrackets = model.bracketPairs.findEnclosingBrackets(position);
        if (enclosingBrackets) {
          newCursorPosition = enclosingBrackets[1].getStartPosition();
        } else {
          const nextBracket = model.bracketPairs.findNextBracket(position);
          if (nextBracket && nextBracket.range) {
            newCursorPosition = nextBracket.range.getStartPosition();
          }
        }
      }
      if (newCursorPosition) {
        return new Selection(newCursorPosition.lineNumber, newCursorPosition.column, newCursorPosition.lineNumber, newCursorPosition.column);
      }
      return new Selection(position.lineNumber, position.column, position.lineNumber, position.column);
    });
    this._editor.setSelections(newSelections);
    this._editor.revealRange(newSelections[0]);
  }
  selectToBracket(selectBrackets) {
    if (!this._editor.hasModel()) {
      return;
    }
    const model = this._editor.getModel();
    const newSelections = [];
    this._editor.getSelections().forEach((selection) => {
      const position = selection.getStartPosition();
      let brackets = model.bracketPairs.matchBracket(position);
      if (!brackets) {
        brackets = model.bracketPairs.findEnclosingBrackets(position);
        if (!brackets) {
          const nextBracket = model.bracketPairs.findNextBracket(position);
          if (nextBracket && nextBracket.range) {
            brackets = model.bracketPairs.matchBracket(nextBracket.range.getStartPosition());
          }
        }
      }
      let selectFrom = null;
      let selectTo = null;
      if (brackets) {
        brackets.sort(Range.compareRangesUsingStarts);
        const [open, close] = brackets;
        selectFrom = selectBrackets ? open.getStartPosition() : open.getEndPosition();
        selectTo = selectBrackets ? close.getEndPosition() : close.getStartPosition();
        if (close.containsPosition(position)) {
          const tmp = selectFrom;
          selectFrom = selectTo;
          selectTo = tmp;
        }
      }
      if (selectFrom && selectTo) {
        newSelections.push(new Selection(selectFrom.lineNumber, selectFrom.column, selectTo.lineNumber, selectTo.column));
      }
    });
    if (newSelections.length > 0) {
      this._editor.setSelections(newSelections);
      this._editor.revealRange(newSelections[0]);
    }
  }
  removeBrackets(editSource) {
    if (!this._editor.hasModel()) {
      return;
    }
    const model = this._editor.getModel();
    this._editor.getSelections().forEach((selection) => {
      const position = selection.getPosition();
      let brackets = model.bracketPairs.matchBracket(position);
      if (!brackets) {
        brackets = model.bracketPairs.findEnclosingBrackets(position);
      }
      if (brackets) {
        this._editor.pushUndoStop();
        this._editor.executeEdits(
          editSource,
          [
            { range: brackets[0], text: "" },
            { range: brackets[1], text: "" }
          ]
        );
        this._editor.pushUndoStop();
      }
    });
  }
  _updateBrackets() {
    if (this._matchBrackets === "never") {
      return;
    }
    this._recomputeBrackets();
    const newDecorations = [];
    let newDecorationsLen = 0;
    for (const bracketData of this._lastBracketsData) {
      const brackets = bracketData.brackets;
      if (brackets) {
        newDecorations[newDecorationsLen++] = { range: brackets[0], options: bracketData.options };
        newDecorations[newDecorationsLen++] = { range: brackets[1], options: bracketData.options };
      }
    }
    this._decorations.set(newDecorations);
  }
  _recomputeBrackets() {
    if (!this._editor.hasModel() || !this._editor.hasWidgetFocus()) {
      this._lastBracketsData = [];
      this._lastVersionId = 0;
      return;
    }
    const selections = this._editor.getSelections();
    if (selections.length > 100) {
      this._lastBracketsData = [];
      this._lastVersionId = 0;
      return;
    }
    const model = this._editor.getModel();
    const versionId = model.getVersionId();
    let previousData = [];
    if (this._lastVersionId === versionId) {
      previousData = this._lastBracketsData;
    }
    const positions = [];
    let positionsLen = 0;
    for (let i = 0, len = selections.length; i < len; i++) {
      const selection = selections[i];
      if (selection.isEmpty()) {
        positions[positionsLen++] = selection.getStartPosition();
      }
    }
    if (positions.length > 1) {
      positions.sort(Position.compare);
    }
    const newData = [];
    let newDataLen = 0;
    let previousIndex = 0;
    const previousLen = previousData.length;
    for (let i = 0, len = positions.length; i < len; i++) {
      const position = positions[i];
      while (previousIndex < previousLen && previousData[previousIndex].position.isBefore(position)) {
        previousIndex++;
      }
      if (previousIndex < previousLen && previousData[previousIndex].position.equals(position)) {
        newData[newDataLen++] = previousData[previousIndex];
      } else {
        let brackets = model.bracketPairs.matchBracket(
          position,
          20
          /* give at most 20ms to compute */
        );
        let options = _BracketMatchingController._DECORATION_OPTIONS_WITH_OVERVIEW_RULER;
        if (!brackets && this._matchBrackets === "always") {
          brackets = model.bracketPairs.findEnclosingBrackets(
            position,
            20
            /* give at most 20ms to compute */
          );
          options = _BracketMatchingController._DECORATION_OPTIONS_WITHOUT_OVERVIEW_RULER;
        }
        newData[newDataLen++] = new BracketsData(position, brackets, options);
      }
    }
    this._lastBracketsData = newData;
    this._lastVersionId = versionId;
  }
};
_BracketMatchingController.ID = "editor.contrib.bracketMatchingController";
_BracketMatchingController._DECORATION_OPTIONS_WITH_OVERVIEW_RULER = ModelDecorationOptions.register({
  description: "bracket-match-overview",
  stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
  className: "bracket-match",
  inlineClassName: "bracket-match-inline",
  overviewRuler: {
    color: themeColorFromId(overviewRulerBracketMatchForeground),
    position: OverviewRulerLane.Center
  }
});
_BracketMatchingController._DECORATION_OPTIONS_WITHOUT_OVERVIEW_RULER = ModelDecorationOptions.register({
  description: "bracket-match-no-overview",
  stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
  className: "bracket-match",
  inlineClassName: "bracket-match-inline"
});
let BracketMatchingController = _BracketMatchingController;
registerEditorContribution(BracketMatchingController.ID, BracketMatchingController, EditorContributionInstantiation.AfterFirstRender);
registerEditorAction(SelectToBracketAction);
registerEditorAction(JumpToBracketAction);
registerEditorAction(RemoveBracketsAction);
MenuRegistry.appendMenuItem(MenuId.MenubarGoMenu, {
  group: "5_infile_nav",
  command: {
    id: "editor.action.jumpToBracket",
    title: nls.localize({ key: "miGoToBracket", comment: ["&& denotes a mnemonic"] }, "Go to &&Bracket")
  },
  order: 2
});
registerThemingParticipant((theme, collector) => {
  const bracketMatchForeground = theme.getColor(editorBracketMatchForeground);
  if (bracketMatchForeground) {
    collector.addRule(`.monaco-editor .bracket-match-inline { color: ${bracketMatchForeground} !important; }`);
  }
});
export {
  BracketMatchingController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2JyYWNrZXRNYXRjaGluZy9icm93c2VyL2JyYWNrZXRNYXRjaGluZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAnLi9icmFja2V0TWF0Y2hpbmcuY3NzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbiwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbiwgcmVnaXN0ZXJFZGl0b3JBY3Rpb24sIHJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24sIElFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElNb2RlbERlbHRhRGVjb3JhdGlvbiwgT3ZlcnZpZXdSdWxlckxhbmUsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgTW9kZWxEZWNvcmF0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBNZW51SWQsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyVGhlbWluZ1BhcnRpY2lwYW50LCB0aGVtZUNvbG9yRnJvbUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlZGl0b3JCcmFja2V0TWF0Y2hGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvZWRpdG9yQ29sb3JSZWdpc3RyeS5qcyc7XG5cbmNvbnN0IG92ZXJ2aWV3UnVsZXJCcmFja2V0TWF0Y2hGb3JlZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZWRpdG9yT3ZlcnZpZXdSdWxlci5icmFja2V0TWF0Y2hGb3JlZ3JvdW5kJywgJyNBMEEwQTAnLCBubHMubG9jYWxpemUoJ292ZXJ2aWV3UnVsZXJCcmFja2V0TWF0Y2hGb3JlZ3JvdW5kJywgJ092ZXJ2aWV3IHJ1bGVyIG1hcmtlciBjb2xvciBmb3IgbWF0Y2hpbmcgYnJhY2tldHMuJykpO1xuXG5jbGFzcyBKdW1wVG9CcmFja2V0QWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmp1bXBUb0JyYWNrZXQnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ3NtYXJ0U2VsZWN0Lmp1bXBCcmFja2V0JywgXCJHbyB0byBCcmFja2V0XCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5lZGl0b3JUZXh0Rm9jdXMsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5CYWNrc2xhc2gsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0QnJhY2tldE1hdGNoaW5nQ29udHJvbGxlci5nZXQoZWRpdG9yKT8uanVtcFRvQnJhY2tldCgpO1xuXHR9XG59XG5cbmNsYXNzIFNlbGVjdFRvQnJhY2tldEFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5zZWxlY3RUb0JyYWNrZXQnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ3NtYXJ0U2VsZWN0LnNlbGVjdFRvQnJhY2tldCcsIFwiU2VsZWN0IHRvIEJyYWNrZXRcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUyKCdzbWFydFNlbGVjdC5zZWxlY3RUb0JyYWNrZXREZXNjcmlwdGlvbicsIFwiU2VsZWN0IHRoZSB0ZXh0IGluc2lkZSBhbmQgaW5jbHVkaW5nIHRoZSBicmFja2V0cyBvciBjdXJseSBicmFjZXNcIiksXG5cdFx0XHRcdGFyZ3M6IFt7XG5cdFx0XHRcdFx0bmFtZTogJ2FyZ3MnLFxuXHRcdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdCdzZWxlY3RCcmFja2V0cyc6IHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IsIGFyZ3M6IGFueSk6IHZvaWQge1xuXHRcdGxldCBzZWxlY3RCcmFja2V0cyA9IHRydWU7XG5cdFx0aWYgKGFyZ3MgJiYgYXJncy5zZWxlY3RCcmFja2V0cyA9PT0gZmFsc2UpIHtcblx0XHRcdHNlbGVjdEJyYWNrZXRzID0gZmFsc2U7XG5cdFx0fVxuXHRcdEJyYWNrZXRNYXRjaGluZ0NvbnRyb2xsZXIuZ2V0KGVkaXRvcik/LnNlbGVjdFRvQnJhY2tldChzZWxlY3RCcmFja2V0cyk7XG5cdH1cbn1cblxuY2xhc3MgUmVtb3ZlQnJhY2tldHNBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24ucmVtb3ZlQnJhY2tldHMnLFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoJ3NtYXJ0U2VsZWN0LnJlbW92ZUJyYWNrZXRzJywgXCJSZW1vdmUgQnJhY2tldHNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmVkaXRvclRleHRGb2N1cyxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5CYWNrc3BhY2UsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0Y2FuVHJpZ2dlcklubGluZUVkaXRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdEJyYWNrZXRNYXRjaGluZ0NvbnRyb2xsZXIuZ2V0KGVkaXRvcik/LnJlbW92ZUJyYWNrZXRzKHRoaXMuaWQpO1xuXHR9XG59XG5cbnR5cGUgQnJhY2tldHMgPSBbUmFuZ2UsIFJhbmdlXTtcblxuY2xhc3MgQnJhY2tldHNEYXRhIHtcblx0cHVibGljIHJlYWRvbmx5IHBvc2l0aW9uOiBQb3NpdGlvbjtcblx0cHVibGljIHJlYWRvbmx5IGJyYWNrZXRzOiBCcmFja2V0cyB8IG51bGw7XG5cdHB1YmxpYyByZWFkb25seSBvcHRpb25zOiBNb2RlbERlY29yYXRpb25PcHRpb25zO1xuXG5cdGNvbnN0cnVjdG9yKHBvc2l0aW9uOiBQb3NpdGlvbiwgYnJhY2tldHM6IEJyYWNrZXRzIHwgbnVsbCwgb3B0aW9uczogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucykge1xuXHRcdHRoaXMucG9zaXRpb24gPSBwb3NpdGlvbjtcblx0XHR0aGlzLmJyYWNrZXRzID0gYnJhY2tldHM7XG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQnJhY2tldE1hdGNoaW5nQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuY29udHJpYi5icmFja2V0TWF0Y2hpbmdDb250cm9sbGVyJztcblxuXHRwdWJsaWMgc3RhdGljIGdldChlZGl0b3I6IElDb2RlRWRpdG9yKTogQnJhY2tldE1hdGNoaW5nQ29udHJvbGxlciB8IG51bGwge1xuXHRcdHJldHVybiBlZGl0b3IuZ2V0Q29udHJpYnV0aW9uPEJyYWNrZXRNYXRjaGluZ0NvbnRyb2xsZXI+KEJyYWNrZXRNYXRjaGluZ0NvbnRyb2xsZXIuSUQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcjtcblxuXHRwcml2YXRlIF9sYXN0QnJhY2tldHNEYXRhOiBCcmFja2V0c0RhdGFbXTtcblx0cHJpdmF0ZSBfbGFzdFZlcnNpb25JZDogbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWNvcmF0aW9uczogSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfdXBkYXRlQnJhY2tldHNTb29uOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIF9tYXRjaEJyYWNrZXRzOiAnbmV2ZXInIHwgJ25lYXInIHwgJ2Fsd2F5cyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBJQ29kZUVkaXRvclxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2VkaXRvciA9IGVkaXRvcjtcblx0XHR0aGlzLl9sYXN0QnJhY2tldHNEYXRhID0gW107XG5cdFx0dGhpcy5fbGFzdFZlcnNpb25JZCA9IDA7XG5cdFx0dGhpcy5fZGVjb3JhdGlvbnMgPSB0aGlzLl9lZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKCk7XG5cdFx0dGhpcy5fdXBkYXRlQnJhY2tldHNTb29uID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5fdXBkYXRlQnJhY2tldHMoKSwgNTApKTtcblx0XHR0aGlzLl9tYXRjaEJyYWNrZXRzID0gdGhpcy5fZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24ubWF0Y2hCcmFja2V0cyk7XG5cblx0XHR0aGlzLl91cGRhdGVCcmFja2V0c1Nvb24uc2NoZWR1bGUoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbigoZSkgPT4ge1xuXG5cdFx0XHRpZiAodGhpcy5fbWF0Y2hCcmFja2V0cyA9PT0gJ25ldmVyJykge1xuXHRcdFx0XHQvLyBFYXJseSBleGl0IGlmIG5vdGhpbmcgbmVlZHMgdG8gYmUgZG9uZSFcblx0XHRcdFx0Ly8gTGVhdmUgc29tZSBmb3JtIG9mIGVhcmx5IGV4aXQgY2hlY2sgaGVyZSBpZiB5b3Ugd2lzaCB0byBjb250aW51ZSBiZWluZyBhIGN1cnNvciBwb3NpdGlvbiBjaGFuZ2UgbGlzdGVuZXIgOylcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl91cGRhdGVCcmFja2V0c1Nvb24uc2NoZWR1bGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KChlKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVCcmFja2V0c1Nvb24uc2NoZWR1bGUoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKGUpID0+IHtcblx0XHRcdHRoaXMuX2xhc3RCcmFja2V0c0RhdGEgPSBbXTtcblx0XHRcdHRoaXMuX3VwZGF0ZUJyYWNrZXRzU29vbi5zY2hlZHVsZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VNb2RlbExhbmd1YWdlQ29uZmlndXJhdGlvbigoZSkgPT4ge1xuXHRcdFx0dGhpcy5fbGFzdEJyYWNrZXRzRGF0YSA9IFtdO1xuXHRcdFx0dGhpcy5fdXBkYXRlQnJhY2tldHNTb29uLnNjaGVkdWxlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGVkaXRvci5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oKGUpID0+IHtcblx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLm1hdGNoQnJhY2tldHMpKSB7XG5cdFx0XHRcdHRoaXMuX21hdGNoQnJhY2tldHMgPSB0aGlzLl9lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5tYXRjaEJyYWNrZXRzKTtcblx0XHRcdFx0dGhpcy5fZGVjb3JhdGlvbnMuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5fbGFzdEJyYWNrZXRzRGF0YSA9IFtdO1xuXHRcdFx0XHR0aGlzLl9sYXN0VmVyc2lvbklkID0gMDtcblx0XHRcdFx0dGhpcy5fdXBkYXRlQnJhY2tldHNTb29uLnNjaGVkdWxlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQmx1ckVkaXRvcldpZGdldCgoKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVCcmFja2V0c1Nvb24uc2NoZWR1bGUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRGb2N1c0VkaXRvcldpZGdldCgoKSA9PiB7XG5cdFx0XHR0aGlzLl91cGRhdGVCcmFja2V0c1Nvb24uc2NoZWR1bGUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMganVtcFRvQnJhY2tldCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBuZXdTZWxlY3Rpb25zID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbnMoKS5tYXAoc2VsZWN0aW9uID0+IHtcblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gc2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKTtcblxuXHRcdFx0Ly8gZmluZCBtYXRjaGluZyBicmFja2V0cyBpZiBwb3NpdGlvbiBpcyBvbiBhIGJyYWNrZXRcblx0XHRcdGNvbnN0IGJyYWNrZXRzID0gbW9kZWwuYnJhY2tldFBhaXJzLm1hdGNoQnJhY2tldChwb3NpdGlvbik7XG5cdFx0XHRsZXQgbmV3Q3Vyc29yUG9zaXRpb246IFBvc2l0aW9uIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRpZiAoYnJhY2tldHMpIHtcblx0XHRcdFx0aWYgKGJyYWNrZXRzWzBdLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pICYmICFicmFja2V0c1sxXS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSkge1xuXHRcdFx0XHRcdG5ld0N1cnNvclBvc2l0aW9uID0gYnJhY2tldHNbMV0uZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGJyYWNrZXRzWzFdLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHRcdFx0bmV3Q3Vyc29yUG9zaXRpb24gPSBicmFja2V0c1swXS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIGZpbmQgdGhlIGVuY2xvc2luZyBicmFja2V0cyBpZiB0aGUgcG9zaXRpb24gaXNuJ3Qgb24gYSBtYXRjaGluZyBicmFja2V0XG5cdFx0XHRcdGNvbnN0IGVuY2xvc2luZ0JyYWNrZXRzID0gbW9kZWwuYnJhY2tldFBhaXJzLmZpbmRFbmNsb3NpbmdCcmFja2V0cyhwb3NpdGlvbik7XG5cdFx0XHRcdGlmIChlbmNsb3NpbmdCcmFja2V0cykge1xuXHRcdFx0XHRcdG5ld0N1cnNvclBvc2l0aW9uID0gZW5jbG9zaW5nQnJhY2tldHNbMV0uZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIG5vIGVuY2xvc2luZyBicmFja2V0cywgdHJ5IHRoZSB2ZXJ5IGZpcnN0IG5leHQgYnJhY2tldFxuXHRcdFx0XHRcdGNvbnN0IG5leHRCcmFja2V0ID0gbW9kZWwuYnJhY2tldFBhaXJzLmZpbmROZXh0QnJhY2tldChwb3NpdGlvbik7XG5cdFx0XHRcdFx0aWYgKG5leHRCcmFja2V0ICYmIG5leHRCcmFja2V0LnJhbmdlKSB7XG5cdFx0XHRcdFx0XHRuZXdDdXJzb3JQb3NpdGlvbiA9IG5leHRCcmFja2V0LnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKG5ld0N1cnNvclBvc2l0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBuZXcgU2VsZWN0aW9uKG5ld0N1cnNvclBvc2l0aW9uLmxpbmVOdW1iZXIsIG5ld0N1cnNvclBvc2l0aW9uLmNvbHVtbiwgbmV3Q3Vyc29yUG9zaXRpb24ubGluZU51bWJlciwgbmV3Q3Vyc29yUG9zaXRpb24uY29sdW1uKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBuZXcgU2VsZWN0aW9uKHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX2VkaXRvci5zZXRTZWxlY3Rpb25zKG5ld1NlbGVjdGlvbnMpO1xuXHRcdHRoaXMuX2VkaXRvci5yZXZlYWxSYW5nZShuZXdTZWxlY3Rpb25zWzBdKTtcblx0fVxuXG5cdHB1YmxpYyBzZWxlY3RUb0JyYWNrZXQoc2VsZWN0QnJhY2tldHM6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRjb25zdCBuZXdTZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSA9IFtdO1xuXG5cdFx0dGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbnMoKS5mb3JFYWNoKHNlbGVjdGlvbiA9PiB7XG5cdFx0XHRjb25zdCBwb3NpdGlvbiA9IHNlbGVjdGlvbi5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0XHRsZXQgYnJhY2tldHMgPSBtb2RlbC5icmFja2V0UGFpcnMubWF0Y2hCcmFja2V0KHBvc2l0aW9uKTtcblxuXHRcdFx0aWYgKCFicmFja2V0cykge1xuXHRcdFx0XHRicmFja2V0cyA9IG1vZGVsLmJyYWNrZXRQYWlycy5maW5kRW5jbG9zaW5nQnJhY2tldHMocG9zaXRpb24pO1xuXHRcdFx0XHRpZiAoIWJyYWNrZXRzKSB7XG5cdFx0XHRcdFx0Y29uc3QgbmV4dEJyYWNrZXQgPSBtb2RlbC5icmFja2V0UGFpcnMuZmluZE5leHRCcmFja2V0KHBvc2l0aW9uKTtcblx0XHRcdFx0XHRpZiAobmV4dEJyYWNrZXQgJiYgbmV4dEJyYWNrZXQucmFuZ2UpIHtcblx0XHRcdFx0XHRcdGJyYWNrZXRzID0gbW9kZWwuYnJhY2tldFBhaXJzLm1hdGNoQnJhY2tldChuZXh0QnJhY2tldC5yYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRsZXQgc2VsZWN0RnJvbTogUG9zaXRpb24gfCBudWxsID0gbnVsbDtcblx0XHRcdGxldCBzZWxlY3RUbzogUG9zaXRpb24gfCBudWxsID0gbnVsbDtcblxuXHRcdFx0aWYgKGJyYWNrZXRzKSB7XG5cdFx0XHRcdGJyYWNrZXRzLnNvcnQoUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKTtcblx0XHRcdFx0Y29uc3QgW29wZW4sIGNsb3NlXSA9IGJyYWNrZXRzO1xuXHRcdFx0XHRzZWxlY3RGcm9tID0gc2VsZWN0QnJhY2tldHMgPyBvcGVuLmdldFN0YXJ0UG9zaXRpb24oKSA6IG9wZW4uZ2V0RW5kUG9zaXRpb24oKTtcblx0XHRcdFx0c2VsZWN0VG8gPSBzZWxlY3RCcmFja2V0cyA/IGNsb3NlLmdldEVuZFBvc2l0aW9uKCkgOiBjbG9zZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cblx0XHRcdFx0aWYgKGNsb3NlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHRcdFx0Ly8gc2VsZWN0IGJhY2t3YXJkcyBpZiB0aGUgY3Vyc29yIHdhcyBvbiB0aGUgY2xvc2luZyBicmFja2V0XG5cdFx0XHRcdFx0Y29uc3QgdG1wID0gc2VsZWN0RnJvbTtcblx0XHRcdFx0XHRzZWxlY3RGcm9tID0gc2VsZWN0VG87XG5cdFx0XHRcdFx0c2VsZWN0VG8gPSB0bXA7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKHNlbGVjdEZyb20gJiYgc2VsZWN0VG8pIHtcblx0XHRcdFx0bmV3U2VsZWN0aW9ucy5wdXNoKG5ldyBTZWxlY3Rpb24oc2VsZWN0RnJvbS5saW5lTnVtYmVyLCBzZWxlY3RGcm9tLmNvbHVtbiwgc2VsZWN0VG8ubGluZU51bWJlciwgc2VsZWN0VG8uY29sdW1uKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAobmV3U2VsZWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3Iuc2V0U2VsZWN0aW9ucyhuZXdTZWxlY3Rpb25zKTtcblx0XHRcdHRoaXMuX2VkaXRvci5yZXZlYWxSYW5nZShuZXdTZWxlY3Rpb25zWzBdKTtcblx0XHR9XG5cdH1cblx0cHVibGljIHJlbW92ZUJyYWNrZXRzKGVkaXRTb3VyY2U/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHR0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9ucygpLmZvckVhY2goKHNlbGVjdGlvbikgPT4ge1xuXHRcdFx0Y29uc3QgcG9zaXRpb24gPSBzZWxlY3Rpb24uZ2V0UG9zaXRpb24oKTtcblxuXHRcdFx0bGV0IGJyYWNrZXRzID0gbW9kZWwuYnJhY2tldFBhaXJzLm1hdGNoQnJhY2tldChwb3NpdGlvbik7XG5cdFx0XHRpZiAoIWJyYWNrZXRzKSB7XG5cdFx0XHRcdGJyYWNrZXRzID0gbW9kZWwuYnJhY2tldFBhaXJzLmZpbmRFbmNsb3NpbmdCcmFja2V0cyhwb3NpdGlvbik7XG5cdFx0XHR9XG5cdFx0XHRpZiAoYnJhY2tldHMpIHtcblx0XHRcdFx0dGhpcy5fZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdFx0XHR0aGlzLl9lZGl0b3IuZXhlY3V0ZUVkaXRzKFxuXHRcdFx0XHRcdGVkaXRTb3VyY2UsXG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0eyByYW5nZTogYnJhY2tldHNbMF0sIHRleHQ6ICcnIH0sXG5cdFx0XHRcdFx0XHR7IHJhbmdlOiBicmFja2V0c1sxXSwgdGV4dDogJycgfVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdFx0dGhpcy5fZWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX0RFQ09SQVRJT05fT1BUSU9OU19XSVRIX09WRVJWSUVXX1JVTEVSID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0ZGVzY3JpcHRpb246ICdicmFja2V0LW1hdGNoLW92ZXJ2aWV3Jyxcblx0XHRzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyxcblx0XHRjbGFzc05hbWU6ICdicmFja2V0LW1hdGNoJyxcblx0XHRpbmxpbmVDbGFzc05hbWU6ICdicmFja2V0LW1hdGNoLWlubGluZScsXG5cdFx0b3ZlcnZpZXdSdWxlcjoge1xuXHRcdFx0Y29sb3I6IHRoZW1lQ29sb3JGcm9tSWQob3ZlcnZpZXdSdWxlckJyYWNrZXRNYXRjaEZvcmVncm91bmQpLFxuXHRcdFx0cG9zaXRpb246IE92ZXJ2aWV3UnVsZXJMYW5lLkNlbnRlclxuXHRcdH1cblx0fSk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX0RFQ09SQVRJT05fT1BUSU9OU19XSVRIT1VUX09WRVJWSUVXX1JVTEVSID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0ZGVzY3JpcHRpb246ICdicmFja2V0LW1hdGNoLW5vLW92ZXJ2aWV3Jyxcblx0XHRzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyxcblx0XHRjbGFzc05hbWU6ICdicmFja2V0LW1hdGNoJyxcblx0XHRpbmxpbmVDbGFzc05hbWU6ICdicmFja2V0LW1hdGNoLWlubGluZSdcblx0fSk7XG5cblx0cHJpdmF0ZSBfdXBkYXRlQnJhY2tldHMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX21hdGNoQnJhY2tldHMgPT09ICduZXZlcicpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcmVjb21wdXRlQnJhY2tldHMoKTtcblxuXHRcdGNvbnN0IG5ld0RlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXHRcdGxldCBuZXdEZWNvcmF0aW9uc0xlbiA9IDA7XG5cdFx0Zm9yIChjb25zdCBicmFja2V0RGF0YSBvZiB0aGlzLl9sYXN0QnJhY2tldHNEYXRhKSB7XG5cdFx0XHRjb25zdCBicmFja2V0cyA9IGJyYWNrZXREYXRhLmJyYWNrZXRzO1xuXHRcdFx0aWYgKGJyYWNrZXRzKSB7XG5cdFx0XHRcdG5ld0RlY29yYXRpb25zW25ld0RlY29yYXRpb25zTGVuKytdID0geyByYW5nZTogYnJhY2tldHNbMF0sIG9wdGlvbnM6IGJyYWNrZXREYXRhLm9wdGlvbnMgfTtcblx0XHRcdFx0bmV3RGVjb3JhdGlvbnNbbmV3RGVjb3JhdGlvbnNMZW4rK10gPSB7IHJhbmdlOiBicmFja2V0c1sxXSwgb3B0aW9uczogYnJhY2tldERhdGEub3B0aW9ucyB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2RlY29yYXRpb25zLnNldChuZXdEZWNvcmF0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvbXB1dGVCcmFja2V0cygpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpIHx8ICF0aGlzLl9lZGl0b3IuaGFzV2lkZ2V0Rm9jdXMoKSkge1xuXHRcdFx0Ly8gbm8gbW9kZWwgb3Igbm8gZm9jdXMgPT4gbm8gYnJhY2tldHMhXG5cdFx0XHR0aGlzLl9sYXN0QnJhY2tldHNEYXRhID0gW107XG5cdFx0XHR0aGlzLl9sYXN0VmVyc2lvbklkID0gMDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb25zID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRpZiAoc2VsZWN0aW9ucy5sZW5ndGggPiAxMDApIHtcblx0XHRcdC8vIG5vIGJyYWNrZXQgbWF0Y2hpbmcgZm9yIGhpZ2ggbnVtYmVycyBvZiBzZWxlY3Rpb25zXG5cdFx0XHR0aGlzLl9sYXN0QnJhY2tldHNEYXRhID0gW107XG5cdFx0XHR0aGlzLl9sYXN0VmVyc2lvbklkID0gMDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGNvbnN0IHZlcnNpb25JZCA9IG1vZGVsLmdldFZlcnNpb25JZCgpO1xuXHRcdGxldCBwcmV2aW91c0RhdGE6IEJyYWNrZXRzRGF0YVtdID0gW107XG5cdFx0aWYgKHRoaXMuX2xhc3RWZXJzaW9uSWQgPT09IHZlcnNpb25JZCkge1xuXHRcdFx0Ly8gdXNlIHRoZSBwcmV2aW91cyBkYXRhIG9ubHkgaWYgdGhlIG1vZGVsIGlzIGF0IHRoZSBzYW1lIHZlcnNpb24gaWRcblx0XHRcdHByZXZpb3VzRGF0YSA9IHRoaXMuX2xhc3RCcmFja2V0c0RhdGE7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcG9zaXRpb25zOiBQb3NpdGlvbltdID0gW107XG5cdFx0bGV0IHBvc2l0aW9uc0xlbiA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IHNlbGVjdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHNlbGVjdGlvbnNbaV07XG5cblx0XHRcdGlmIChzZWxlY3Rpb24uaXNFbXB0eSgpKSB7XG5cdFx0XHRcdC8vIHdpbGwgYnJhY2tldCBtYXRjaCBhIGN1cnNvciBvbmx5IGlmIHRoZSBzZWxlY3Rpb24gaXMgY29sbGFwc2VkXG5cdFx0XHRcdHBvc2l0aW9uc1twb3NpdGlvbnNMZW4rK10gPSBzZWxlY3Rpb24uZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIHNvcnQgcG9zaXRpb25zIGZvciBgcHJldmlvdXNEYXRhYCBjYWNoZSBoaXRzXG5cdFx0aWYgKHBvc2l0aW9ucy5sZW5ndGggPiAxKSB7XG5cdFx0XHRwb3NpdGlvbnMuc29ydChQb3NpdGlvbi5jb21wYXJlKTtcblx0XHR9XG5cblx0XHRjb25zdCBuZXdEYXRhOiBCcmFja2V0c0RhdGFbXSA9IFtdO1xuXHRcdGxldCBuZXdEYXRhTGVuID0gMDtcblx0XHRsZXQgcHJldmlvdXNJbmRleCA9IDA7XG5cdFx0Y29uc3QgcHJldmlvdXNMZW4gPSBwcmV2aW91c0RhdGEubGVuZ3RoO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBwb3NpdGlvbnMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGNvbnN0IHBvc2l0aW9uID0gcG9zaXRpb25zW2ldO1xuXG5cdFx0XHR3aGlsZSAocHJldmlvdXNJbmRleCA8IHByZXZpb3VzTGVuICYmIHByZXZpb3VzRGF0YVtwcmV2aW91c0luZGV4XS5wb3NpdGlvbi5pc0JlZm9yZShwb3NpdGlvbikpIHtcblx0XHRcdFx0cHJldmlvdXNJbmRleCsrO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocHJldmlvdXNJbmRleCA8IHByZXZpb3VzTGVuICYmIHByZXZpb3VzRGF0YVtwcmV2aW91c0luZGV4XS5wb3NpdGlvbi5lcXVhbHMocG9zaXRpb24pKSB7XG5cdFx0XHRcdG5ld0RhdGFbbmV3RGF0YUxlbisrXSA9IHByZXZpb3VzRGF0YVtwcmV2aW91c0luZGV4XTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBicmFja2V0cyA9IG1vZGVsLmJyYWNrZXRQYWlycy5tYXRjaEJyYWNrZXQocG9zaXRpb24sIDIwIC8qIGdpdmUgYXQgbW9zdCAyMG1zIHRvIGNvbXB1dGUgKi8pO1xuXHRcdFx0XHRsZXQgb3B0aW9ucyA9IEJyYWNrZXRNYXRjaGluZ0NvbnRyb2xsZXIuX0RFQ09SQVRJT05fT1BUSU9OU19XSVRIX09WRVJWSUVXX1JVTEVSO1xuXHRcdFx0XHRpZiAoIWJyYWNrZXRzICYmIHRoaXMuX21hdGNoQnJhY2tldHMgPT09ICdhbHdheXMnKSB7XG5cdFx0XHRcdFx0YnJhY2tldHMgPSBtb2RlbC5icmFja2V0UGFpcnMuZmluZEVuY2xvc2luZ0JyYWNrZXRzKHBvc2l0aW9uLCAyMCAvKiBnaXZlIGF0IG1vc3QgMjBtcyB0byBjb21wdXRlICovKTtcblx0XHRcdFx0XHRvcHRpb25zID0gQnJhY2tldE1hdGNoaW5nQ29udHJvbGxlci5fREVDT1JBVElPTl9PUFRJT05TX1dJVEhPVVRfT1ZFUlZJRVdfUlVMRVI7XG5cdFx0XHRcdH1cblx0XHRcdFx0bmV3RGF0YVtuZXdEYXRhTGVuKytdID0gbmV3IEJyYWNrZXRzRGF0YShwb3NpdGlvbiwgYnJhY2tldHMsIG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2xhc3RCcmFja2V0c0RhdGEgPSBuZXdEYXRhO1xuXHRcdHRoaXMuX2xhc3RWZXJzaW9uSWQgPSB2ZXJzaW9uSWQ7XG5cdH1cbn1cblxucmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24oQnJhY2tldE1hdGNoaW5nQ29udHJvbGxlci5JRCwgQnJhY2tldE1hdGNoaW5nQ29udHJvbGxlciwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5BZnRlckZpcnN0UmVuZGVyKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFNlbGVjdFRvQnJhY2tldEFjdGlvbik7XG5yZWdpc3RlckVkaXRvckFjdGlvbihKdW1wVG9CcmFja2V0QWN0aW9uKTtcbnJlZ2lzdGVyRWRpdG9yQWN0aW9uKFJlbW92ZUJyYWNrZXRzQWN0aW9uKTtcblxuLy8gR28gdG8gbWVudVxuTWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5NZW51YmFyR29NZW51LCB7XG5cdGdyb3VwOiAnNV9pbmZpbGVfbmF2Jyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnZWRpdG9yLmFjdGlvbi5qdW1wVG9CcmFja2V0Jyxcblx0XHR0aXRsZTogbmxzLmxvY2FsaXplKHsga2V5OiAnbWlHb1RvQnJhY2tldCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJHbyB0byAmJkJyYWNrZXRcIilcblx0fSxcblx0b3JkZXI6IDJcbn0pO1xuXG4vLyBUaGVtaW5nIHBhcnRpY2lwYW50IHRvIGVuc3VyZSBicmFja2V0LW1hdGNoIGNvbG9yIG92ZXJyaWRlcyBicmFja2V0IHBhaXIgY29sb3JpemF0aW9uXG5yZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCgodGhlbWUsIGNvbGxlY3RvcikgPT4ge1xuXHRjb25zdCBicmFja2V0TWF0Y2hGb3JlZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9yQnJhY2tldE1hdGNoRm9yZWdyb3VuZCk7XG5cdGlmIChicmFja2V0TWF0Y2hGb3JlZ3JvdW5kKSB7XG5cdFx0Ly8gVXNlIGhpZ2hlciBzcGVjaWZpY2l0eSB0byBvdmVycmlkZSBicmFja2V0IHBhaXIgY29sb3JpemF0aW9uXG5cdFx0Ly8gQXBwbHkgY29sb3IgdG8gaW5saW5lIGNsYXNzIHRvIGF2b2lkIGxheW91dCBqdW1wc1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLWVkaXRvciAuYnJhY2tldC1tYXRjaC1pbmxpbmUgeyBjb2xvcjogJHticmFja2V0TWF0Y2hGb3JlZ3JvdW5kfSAhaW1wb3J0YW50OyB9YCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxrQkFBa0I7QUFDM0IsT0FBTztBQUVQLFNBQVMsY0FBYyxpQ0FBaUMsc0JBQXNCLGtDQUFvRDtBQUNsSSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBZ0MsbUJBQW1CLDhCQUE4QjtBQUNqRixTQUFTLDhCQUE4QjtBQUN2QyxZQUFZLFNBQVM7QUFDckIsU0FBUyxRQUFRLG9CQUFvQjtBQUNyQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDRCQUE0Qix3QkFBd0I7QUFDN0QsU0FBUyxvQ0FBb0M7QUFFN0MsTUFBTSxzQ0FBc0MsY0FBYyw4Q0FBOEMsV0FBVyxJQUFJLFNBQVMsdUNBQXVDLG9EQUFvRCxDQUFDO0FBRTVOLE1BQU0sNEJBQTRCLGFBQWE7QUFBQSxFQUM5QyxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxJQUFJLFVBQVUsMkJBQTJCLGVBQWU7QUFBQSxNQUMvRCxjQUFjO0FBQUEsTUFDZCxRQUFRO0FBQUEsUUFDUCxRQUFRLGtCQUFrQjtBQUFBLFFBQzFCLFNBQVMsT0FBTyxVQUFVLE9BQU8sUUFBUSxRQUFRO0FBQUEsUUFDakQsUUFBUSxpQkFBaUI7QUFBQSxNQUMxQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVPLElBQUksVUFBNEIsUUFBMkI7QUFDakUsOEJBQTBCLElBQUksTUFBTSxHQUFHLGNBQWM7QUFBQSxFQUN0RDtBQUNEO0FBRUEsTUFBTSw4QkFBOEIsYUFBYTtBQUFBLEVBQ2hELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLElBQUksVUFBVSwrQkFBK0IsbUJBQW1CO0FBQUEsTUFDdkUsY0FBYztBQUFBLE1BQ2QsVUFBVTtBQUFBLFFBQ1QsYUFBYSxJQUFJLFVBQVUsMENBQTBDLG1FQUFtRTtBQUFBLFFBQ3hJLE1BQU0sQ0FBQztBQUFBLFVBQ04sTUFBTTtBQUFBLFVBQ04sUUFBUTtBQUFBLFlBQ1AsTUFBTTtBQUFBLFlBQ04sWUFBWTtBQUFBLGNBQ1gsa0JBQWtCO0FBQUEsZ0JBQ2pCLE1BQU07QUFBQSxnQkFDTixTQUFTO0FBQUEsY0FDVjtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsUUFDRCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVPLElBQUksVUFBNEIsUUFBcUIsTUFBaUI7QUFDNUUsUUFBSSxpQkFBaUI7QUFDckIsUUFBSSxRQUFRLEtBQUssbUJBQW1CLE9BQU87QUFDMUMsdUJBQWlCO0FBQUEsSUFDbEI7QUFDQSw4QkFBMEIsSUFBSSxNQUFNLEdBQUcsZ0JBQWdCLGNBQWM7QUFBQSxFQUN0RTtBQUNEO0FBRUEsTUFBTSw2QkFBNkIsYUFBYTtBQUFBLEVBQy9DLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLElBQUksVUFBVSw4QkFBOEIsaUJBQWlCO0FBQUEsTUFDcEUsY0FBYztBQUFBLE1BQ2QsUUFBUTtBQUFBLFFBQ1AsUUFBUSxrQkFBa0I7QUFBQSxRQUMxQixTQUFTLE9BQU8sVUFBVSxPQUFPLE1BQU0sUUFBUTtBQUFBLFFBQy9DLFFBQVEsaUJBQWlCO0FBQUEsTUFDMUI7QUFBQSxNQUNBLHVCQUF1QjtBQUFBLElBQ3hCLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFTyxJQUFJLFVBQTRCLFFBQTJCO0FBQ2pFLDhCQUEwQixJQUFJLE1BQU0sR0FBRyxlQUFlLEtBQUssRUFBRTtBQUFBLEVBQzlEO0FBQ0Q7QUFJQSxNQUFNLGFBQWE7QUFBQSxFQUtsQixZQUFZLFVBQW9CLFVBQTJCLFNBQWlDO0FBQzNGLFNBQUssV0FBVztBQUNoQixTQUFLLFdBQVc7QUFDaEIsU0FBSyxVQUFVO0FBQUEsRUFDaEI7QUFDRDtBQUVPLE1BQU0sNkJBQU4sTUFBTSxtQ0FBa0MsV0FBMEM7QUFBQSxFQUd4RixPQUFjLElBQUksUUFBdUQ7QUFDeEUsV0FBTyxPQUFPLGdCQUEyQywyQkFBMEIsRUFBRTtBQUFBLEVBQ3RGO0FBQUEsRUFVQSxZQUNDLFFBQ0M7QUFDRCxVQUFNO0FBQ04sU0FBSyxVQUFVO0FBQ2YsU0FBSyxvQkFBb0IsQ0FBQztBQUMxQixTQUFLLGlCQUFpQjtBQUN0QixTQUFLLGVBQWUsS0FBSyxRQUFRLDRCQUE0QjtBQUM3RCxTQUFLLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxpQkFBaUIsTUFBTSxLQUFLLGdCQUFnQixHQUFHLEVBQUUsQ0FBQztBQUNoRyxTQUFLLGlCQUFpQixLQUFLLFFBQVEsVUFBVSxhQUFhLGFBQWE7QUFFdkUsU0FBSyxvQkFBb0IsU0FBUztBQUNsQyxTQUFLLFVBQVUsT0FBTywwQkFBMEIsQ0FBQyxNQUFNO0FBRXRELFVBQUksS0FBSyxtQkFBbUIsU0FBUztBQUdwQztBQUFBLE1BQ0Q7QUFFQSxXQUFLLG9CQUFvQixTQUFTO0FBQUEsSUFDbkMsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLE9BQU8sd0JBQXdCLENBQUMsTUFBTTtBQUNwRCxXQUFLLG9CQUFvQixTQUFTO0FBQUEsSUFDbkMsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLE9BQU8saUJBQWlCLENBQUMsTUFBTTtBQUM3QyxXQUFLLG9CQUFvQixDQUFDO0FBQzFCLFdBQUssb0JBQW9CLFNBQVM7QUFBQSxJQUNuQyxDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsT0FBTyxzQ0FBc0MsQ0FBQyxNQUFNO0FBQ2xFLFdBQUssb0JBQW9CLENBQUM7QUFDMUIsV0FBSyxvQkFBb0IsU0FBUztBQUFBLElBQ25DLENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxPQUFPLHlCQUF5QixDQUFDLE1BQU07QUFDckQsVUFBSSxFQUFFLFdBQVcsYUFBYSxhQUFhLEdBQUc7QUFDN0MsYUFBSyxpQkFBaUIsS0FBSyxRQUFRLFVBQVUsYUFBYSxhQUFhO0FBQ3ZFLGFBQUssYUFBYSxNQUFNO0FBQ3hCLGFBQUssb0JBQW9CLENBQUM7QUFDMUIsYUFBSyxpQkFBaUI7QUFDdEIsYUFBSyxvQkFBb0IsU0FBUztBQUFBLE1BQ25DO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsT0FBTyxzQkFBc0IsTUFBTTtBQUNqRCxXQUFLLG9CQUFvQixTQUFTO0FBQUEsSUFDbkMsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLE9BQU8sdUJBQXVCLE1BQU07QUFDbEQsV0FBSyxvQkFBb0IsU0FBUztBQUFBLElBQ25DLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVPLGdCQUFzQjtBQUM1QixRQUFJLENBQUMsS0FBSyxRQUFRLFNBQVMsR0FBRztBQUM3QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFFBQVEsS0FBSyxRQUFRLFNBQVM7QUFDcEMsVUFBTSxnQkFBZ0IsS0FBSyxRQUFRLGNBQWMsRUFBRSxJQUFJLGVBQWE7QUFDbkUsWUFBTSxXQUFXLFVBQVUsaUJBQWlCO0FBRzVDLFlBQU0sV0FBVyxNQUFNLGFBQWEsYUFBYSxRQUFRO0FBQ3pELFVBQUksb0JBQXFDO0FBQ3pDLFVBQUksVUFBVTtBQUNiLFlBQUksU0FBUyxDQUFDLEVBQUUsaUJBQWlCLFFBQVEsS0FBSyxDQUFDLFNBQVMsQ0FBQyxFQUFFLGlCQUFpQixRQUFRLEdBQUc7QUFDdEYsOEJBQW9CLFNBQVMsQ0FBQyxFQUFFLGlCQUFpQjtBQUFBLFFBQ2xELFdBQVcsU0FBUyxDQUFDLEVBQUUsaUJBQWlCLFFBQVEsR0FBRztBQUNsRCw4QkFBb0IsU0FBUyxDQUFDLEVBQUUsaUJBQWlCO0FBQUEsUUFDbEQ7QUFBQSxNQUNELE9BQU87QUFFTixjQUFNLG9CQUFvQixNQUFNLGFBQWEsc0JBQXNCLFFBQVE7QUFDM0UsWUFBSSxtQkFBbUI7QUFDdEIsOEJBQW9CLGtCQUFrQixDQUFDLEVBQUUsaUJBQWlCO0FBQUEsUUFDM0QsT0FBTztBQUVOLGdCQUFNLGNBQWMsTUFBTSxhQUFhLGdCQUFnQixRQUFRO0FBQy9ELGNBQUksZUFBZSxZQUFZLE9BQU87QUFDckMsZ0NBQW9CLFlBQVksTUFBTSxpQkFBaUI7QUFBQSxVQUN4RDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsVUFBSSxtQkFBbUI7QUFDdEIsZUFBTyxJQUFJLFVBQVUsa0JBQWtCLFlBQVksa0JBQWtCLFFBQVEsa0JBQWtCLFlBQVksa0JBQWtCLE1BQU07QUFBQSxNQUNwSTtBQUNBLGFBQU8sSUFBSSxVQUFVLFNBQVMsWUFBWSxTQUFTLFFBQVEsU0FBUyxZQUFZLFNBQVMsTUFBTTtBQUFBLElBQ2hHLENBQUM7QUFFRCxTQUFLLFFBQVEsY0FBYyxhQUFhO0FBQ3hDLFNBQUssUUFBUSxZQUFZLGNBQWMsQ0FBQyxDQUFDO0FBQUEsRUFDMUM7QUFBQSxFQUVPLGdCQUFnQixnQkFBK0I7QUFDckQsUUFBSSxDQUFDLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFDN0I7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUFRLEtBQUssUUFBUSxTQUFTO0FBQ3BDLFVBQU0sZ0JBQTZCLENBQUM7QUFFcEMsU0FBSyxRQUFRLGNBQWMsRUFBRSxRQUFRLGVBQWE7QUFDakQsWUFBTSxXQUFXLFVBQVUsaUJBQWlCO0FBQzVDLFVBQUksV0FBVyxNQUFNLGFBQWEsYUFBYSxRQUFRO0FBRXZELFVBQUksQ0FBQyxVQUFVO0FBQ2QsbUJBQVcsTUFBTSxhQUFhLHNCQUFzQixRQUFRO0FBQzVELFlBQUksQ0FBQyxVQUFVO0FBQ2QsZ0JBQU0sY0FBYyxNQUFNLGFBQWEsZ0JBQWdCLFFBQVE7QUFDL0QsY0FBSSxlQUFlLFlBQVksT0FBTztBQUNyQyx1QkFBVyxNQUFNLGFBQWEsYUFBYSxZQUFZLE1BQU0saUJBQWlCLENBQUM7QUFBQSxVQUNoRjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsVUFBSSxhQUE4QjtBQUNsQyxVQUFJLFdBQTRCO0FBRWhDLFVBQUksVUFBVTtBQUNiLGlCQUFTLEtBQUssTUFBTSx3QkFBd0I7QUFDNUMsY0FBTSxDQUFDLE1BQU0sS0FBSyxJQUFJO0FBQ3RCLHFCQUFhLGlCQUFpQixLQUFLLGlCQUFpQixJQUFJLEtBQUssZUFBZTtBQUM1RSxtQkFBVyxpQkFBaUIsTUFBTSxlQUFlLElBQUksTUFBTSxpQkFBaUI7QUFFNUUsWUFBSSxNQUFNLGlCQUFpQixRQUFRLEdBQUc7QUFFckMsZ0JBQU0sTUFBTTtBQUNaLHVCQUFhO0FBQ2IscUJBQVc7QUFBQSxRQUNaO0FBQUEsTUFDRDtBQUVBLFVBQUksY0FBYyxVQUFVO0FBQzNCLHNCQUFjLEtBQUssSUFBSSxVQUFVLFdBQVcsWUFBWSxXQUFXLFFBQVEsU0FBUyxZQUFZLFNBQVMsTUFBTSxDQUFDO0FBQUEsTUFDakg7QUFBQSxJQUNELENBQUM7QUFFRCxRQUFJLGNBQWMsU0FBUyxHQUFHO0FBQzdCLFdBQUssUUFBUSxjQUFjLGFBQWE7QUFDeEMsV0FBSyxRQUFRLFlBQVksY0FBYyxDQUFDLENBQUM7QUFBQSxJQUMxQztBQUFBLEVBQ0Q7QUFBQSxFQUNPLGVBQWUsWUFBMkI7QUFDaEQsUUFBSSxDQUFDLEtBQUssUUFBUSxTQUFTLEdBQUc7QUFDN0I7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUFRLEtBQUssUUFBUSxTQUFTO0FBQ3BDLFNBQUssUUFBUSxjQUFjLEVBQUUsUUFBUSxDQUFDLGNBQWM7QUFDbkQsWUFBTSxXQUFXLFVBQVUsWUFBWTtBQUV2QyxVQUFJLFdBQVcsTUFBTSxhQUFhLGFBQWEsUUFBUTtBQUN2RCxVQUFJLENBQUMsVUFBVTtBQUNkLG1CQUFXLE1BQU0sYUFBYSxzQkFBc0IsUUFBUTtBQUFBLE1BQzdEO0FBQ0EsVUFBSSxVQUFVO0FBQ2IsYUFBSyxRQUFRLGFBQWE7QUFDMUIsYUFBSyxRQUFRO0FBQUEsVUFDWjtBQUFBLFVBQ0E7QUFBQSxZQUNDLEVBQUUsT0FBTyxTQUFTLENBQUMsR0FBRyxNQUFNLEdBQUc7QUFBQSxZQUMvQixFQUFFLE9BQU8sU0FBUyxDQUFDLEdBQUcsTUFBTSxHQUFHO0FBQUEsVUFDaEM7QUFBQSxRQUNEO0FBQ0EsYUFBSyxRQUFRLGFBQWE7QUFBQSxNQUMzQjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQW9CUSxrQkFBd0I7QUFDL0IsUUFBSSxLQUFLLG1CQUFtQixTQUFTO0FBQ3BDO0FBQUEsSUFDRDtBQUNBLFNBQUssbUJBQW1CO0FBRXhCLFVBQU0saUJBQTBDLENBQUM7QUFDakQsUUFBSSxvQkFBb0I7QUFDeEIsZUFBVyxlQUFlLEtBQUssbUJBQW1CO0FBQ2pELFlBQU0sV0FBVyxZQUFZO0FBQzdCLFVBQUksVUFBVTtBQUNiLHVCQUFlLG1CQUFtQixJQUFJLEVBQUUsT0FBTyxTQUFTLENBQUMsR0FBRyxTQUFTLFlBQVksUUFBUTtBQUN6Rix1QkFBZSxtQkFBbUIsSUFBSSxFQUFFLE9BQU8sU0FBUyxDQUFDLEdBQUcsU0FBUyxZQUFZLFFBQVE7QUFBQSxNQUMxRjtBQUFBLElBQ0Q7QUFFQSxTQUFLLGFBQWEsSUFBSSxjQUFjO0FBQUEsRUFDckM7QUFBQSxFQUVRLHFCQUEyQjtBQUNsQyxRQUFJLENBQUMsS0FBSyxRQUFRLFNBQVMsS0FBSyxDQUFDLEtBQUssUUFBUSxlQUFlLEdBQUc7QUFFL0QsV0FBSyxvQkFBb0IsQ0FBQztBQUMxQixXQUFLLGlCQUFpQjtBQUN0QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGFBQWEsS0FBSyxRQUFRLGNBQWM7QUFDOUMsUUFBSSxXQUFXLFNBQVMsS0FBSztBQUU1QixXQUFLLG9CQUFvQixDQUFDO0FBQzFCLFdBQUssaUJBQWlCO0FBQ3RCO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxLQUFLLFFBQVEsU0FBUztBQUNwQyxVQUFNLFlBQVksTUFBTSxhQUFhO0FBQ3JDLFFBQUksZUFBK0IsQ0FBQztBQUNwQyxRQUFJLEtBQUssbUJBQW1CLFdBQVc7QUFFdEMscUJBQWUsS0FBSztBQUFBLElBQ3JCO0FBRUEsVUFBTSxZQUF3QixDQUFDO0FBQy9CLFFBQUksZUFBZTtBQUNuQixhQUFTLElBQUksR0FBRyxNQUFNLFdBQVcsUUFBUSxJQUFJLEtBQUssS0FBSztBQUN0RCxZQUFNLFlBQVksV0FBVyxDQUFDO0FBRTlCLFVBQUksVUFBVSxRQUFRLEdBQUc7QUFFeEIsa0JBQVUsY0FBYyxJQUFJLFVBQVUsaUJBQWlCO0FBQUEsTUFDeEQ7QUFBQSxJQUNEO0FBR0EsUUFBSSxVQUFVLFNBQVMsR0FBRztBQUN6QixnQkFBVSxLQUFLLFNBQVMsT0FBTztBQUFBLElBQ2hDO0FBRUEsVUFBTSxVQUEwQixDQUFDO0FBQ2pDLFFBQUksYUFBYTtBQUNqQixRQUFJLGdCQUFnQjtBQUNwQixVQUFNLGNBQWMsYUFBYTtBQUNqQyxhQUFTLElBQUksR0FBRyxNQUFNLFVBQVUsUUFBUSxJQUFJLEtBQUssS0FBSztBQUNyRCxZQUFNLFdBQVcsVUFBVSxDQUFDO0FBRTVCLGFBQU8sZ0JBQWdCLGVBQWUsYUFBYSxhQUFhLEVBQUUsU0FBUyxTQUFTLFFBQVEsR0FBRztBQUM5RjtBQUFBLE1BQ0Q7QUFFQSxVQUFJLGdCQUFnQixlQUFlLGFBQWEsYUFBYSxFQUFFLFNBQVMsT0FBTyxRQUFRLEdBQUc7QUFDekYsZ0JBQVEsWUFBWSxJQUFJLGFBQWEsYUFBYTtBQUFBLE1BQ25ELE9BQU87QUFDTixZQUFJLFdBQVcsTUFBTSxhQUFhO0FBQUEsVUFBYTtBQUFBLFVBQVU7QUFBQTtBQUFBLFFBQXFDO0FBQzlGLFlBQUksVUFBVSwyQkFBMEI7QUFDeEMsWUFBSSxDQUFDLFlBQVksS0FBSyxtQkFBbUIsVUFBVTtBQUNsRCxxQkFBVyxNQUFNLGFBQWE7QUFBQSxZQUFzQjtBQUFBLFlBQVU7QUFBQTtBQUFBLFVBQXFDO0FBQ25HLG9CQUFVLDJCQUEwQjtBQUFBLFFBQ3JDO0FBQ0EsZ0JBQVEsWUFBWSxJQUFJLElBQUksYUFBYSxVQUFVLFVBQVUsT0FBTztBQUFBLE1BQ3JFO0FBQUEsSUFDRDtBQUVBLFNBQUssb0JBQW9CO0FBQ3pCLFNBQUssaUJBQWlCO0FBQUEsRUFDdkI7QUFDRDtBQWpTYSwyQkFDVyxLQUFLO0FBRGhCLDJCQXlMWSwwQ0FBMEMsdUJBQXVCLFNBQVM7QUFBQSxFQUNqRyxhQUFhO0FBQUEsRUFDYixZQUFZLHVCQUF1QjtBQUFBLEVBQ25DLFdBQVc7QUFBQSxFQUNYLGlCQUFpQjtBQUFBLEVBQ2pCLGVBQWU7QUFBQSxJQUNkLE9BQU8saUJBQWlCLG1DQUFtQztBQUFBLElBQzNELFVBQVUsa0JBQWtCO0FBQUEsRUFDN0I7QUFDRCxDQUFDO0FBbE1XLDJCQW9NWSw2Q0FBNkMsdUJBQXVCLFNBQVM7QUFBQSxFQUNwRyxhQUFhO0FBQUEsRUFDYixZQUFZLHVCQUF1QjtBQUFBLEVBQ25DLFdBQVc7QUFBQSxFQUNYLGlCQUFpQjtBQUNsQixDQUFDO0FBek1LLElBQU0sNEJBQU47QUFtU1AsMkJBQTJCLDBCQUEwQixJQUFJLDJCQUEyQixnQ0FBZ0MsZ0JBQWdCO0FBQ3BJLHFCQUFxQixxQkFBcUI7QUFDMUMscUJBQXFCLG1CQUFtQjtBQUN4QyxxQkFBcUIsb0JBQW9CO0FBR3pDLGFBQWEsZUFBZSxPQUFPLGVBQWU7QUFBQSxFQUNqRCxPQUFPO0FBQUEsRUFDUCxTQUFTO0FBQUEsSUFDUixJQUFJO0FBQUEsSUFDSixPQUFPLElBQUksU0FBUyxFQUFFLEtBQUssaUJBQWlCLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLGlCQUFpQjtBQUFBLEVBQ3BHO0FBQUEsRUFDQSxPQUFPO0FBQ1IsQ0FBQztBQUdELDJCQUEyQixDQUFDLE9BQU8sY0FBYztBQUNoRCxRQUFNLHlCQUF5QixNQUFNLFNBQVMsNEJBQTRCO0FBQzFFLE1BQUksd0JBQXdCO0FBRzNCLGNBQVUsUUFBUSxpREFBaUQsc0JBQXNCLGdCQUFnQjtBQUFBLEVBQzFHO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
