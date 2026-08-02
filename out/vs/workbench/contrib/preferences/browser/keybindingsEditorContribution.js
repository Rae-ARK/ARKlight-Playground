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
import * as nls from "../../../../nls.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Range } from "../../../../editor/common/core/range.js";
import { registerEditorContribution, EditorContributionInstantiation } from "../../../../editor/browser/editorExtensions.js";
import { SnippetController2 } from "../../../../editor/contrib/snippet/browser/snippetController2.js";
import { SmartSnippetInserter } from "../common/smartSnippetInserter.js";
import { DefineKeybindingOverlayWidget } from "./keybindingWidgets.js";
import { parseTree } from "../../../../base/common/json.js";
import { WindowsNativeResolvedKeybinding } from "../../../services/keybinding/common/windowsKeyboardMapper.js";
import { themeColorFromId } from "../../../../platform/theme/common/themeService.js";
import { overviewRulerInfo, overviewRulerError } from "../../../../editor/common/core/editorColorRegistry.js";
import { TrackedRangeStickiness, OverviewRulerLane } from "../../../../editor/common/model.js";
import { KeybindingParser } from "../../../../base/common/keybindingParser.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { isEqual } from "../../../../base/common/resources.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { DEFINE_KEYBINDING_EDITOR_CONTRIB_ID } from "../../../services/preferences/common/preferences.js";
const NLS_KB_LAYOUT_ERROR_MESSAGE = nls.localize("defineKeybinding.kbLayoutErrorMessage", "You won't be able to produce this key combination under your current keyboard layout.");
let DefineKeybindingEditorContribution = class extends Disposable {
  constructor(_editor, _instantiationService, _userDataProfileService) {
    super();
    this._editor = _editor;
    this._instantiationService = _instantiationService;
    this._userDataProfileService = _userDataProfileService;
    this._keybindingDecorationRenderer = this._register(new MutableDisposable());
    this._defineWidget = this._register(this._instantiationService.createInstance(DefineKeybindingOverlayWidget, this._editor));
    this._register(this._editor.onDidChangeModel((e) => this._update()));
    this._update();
  }
  _update() {
    this._keybindingDecorationRenderer.value = isInterestingEditorModel(this._editor, this._userDataProfileService) ? this._instantiationService.createInstance(KeybindingEditorDecorationsRenderer, this._editor) : void 0;
  }
  showDefineKeybindingWidget() {
    if (isInterestingEditorModel(this._editor, this._userDataProfileService)) {
      this._defineWidget.start().then((keybinding) => this._onAccepted(keybinding));
    }
  }
  _onAccepted(keybinding) {
    this._editor.focus();
    if (keybinding && this._editor.hasModel()) {
      const regexp = new RegExp(/\\/g);
      const backslash = regexp.test(keybinding);
      if (backslash) {
        keybinding = keybinding.slice(0, -1) + "\\\\";
      }
      let snippetText = [
        "{",
        '	"key": ' + JSON.stringify(keybinding) + ",",
        '	"command": "${1:commandId}",',
        '	"when": "${2:editorTextFocus}"',
        "}$0"
      ].join("\n");
      const smartInsertInfo = SmartSnippetInserter.insertSnippet(this._editor.getModel(), this._editor.getPosition());
      snippetText = smartInsertInfo.prepend + snippetText + smartInsertInfo.append;
      this._editor.setPosition(smartInsertInfo.position);
      SnippetController2.get(this._editor)?.insert(snippetText, { overwriteBefore: 0, overwriteAfter: 0 });
    }
  }
};
DefineKeybindingEditorContribution = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IUserDataProfileService)
], DefineKeybindingEditorContribution);
let KeybindingEditorDecorationsRenderer = class extends Disposable {
  constructor(_editor, _keybindingService) {
    super();
    this._editor = _editor;
    this._keybindingService = _keybindingService;
    this._dec = this._editor.createDecorationsCollection();
    this._updateDecorations = this._register(new RunOnceScheduler(() => this._updateDecorationsNow(), 500));
    const model = assertReturnsDefined(this._editor.getModel());
    this._register(model.onDidChangeContent(() => this._updateDecorations.schedule()));
    this._register(this._keybindingService.onDidUpdateKeybindings(() => this._updateDecorations.schedule()));
    this._register({
      dispose: () => {
        this._dec.clear();
        this._updateDecorations.cancel();
      }
    });
    this._updateDecorations.schedule();
  }
  _updateDecorationsNow() {
    const model = assertReturnsDefined(this._editor.getModel());
    const newDecorations = [];
    const root = parseTree(model.getValue());
    if (root && Array.isArray(root.children)) {
      for (let i = 0, len = root.children.length; i < len; i++) {
        const entry = root.children[i];
        const dec = this._getDecorationForEntry(model, entry);
        if (dec !== null) {
          newDecorations.push(dec);
        }
      }
    }
    this._dec.set(newDecorations);
  }
  _getDecorationForEntry(model, entry) {
    if (!Array.isArray(entry.children)) {
      return null;
    }
    for (let i = 0, len = entry.children.length; i < len; i++) {
      const prop = entry.children[i];
      if (prop.type !== "property") {
        continue;
      }
      if (!Array.isArray(prop.children) || prop.children.length !== 2) {
        continue;
      }
      const key = prop.children[0];
      if (key.value !== "key") {
        continue;
      }
      const value = prop.children[1];
      if (value.type !== "string") {
        continue;
      }
      const resolvedKeybindings = this._keybindingService.resolveUserBinding(value.value);
      if (resolvedKeybindings.length === 0) {
        return this._createDecoration(true, null, null, model, value);
      }
      const resolvedKeybinding = resolvedKeybindings[0];
      let usLabel = null;
      if (resolvedKeybinding instanceof WindowsNativeResolvedKeybinding) {
        usLabel = resolvedKeybinding.getUSLabel();
      }
      if (!resolvedKeybinding.isWYSIWYG()) {
        const uiLabel = resolvedKeybinding.getLabel();
        if (typeof uiLabel === "string" && value.value.toLowerCase() === uiLabel.toLowerCase()) {
          return null;
        }
        return this._createDecoration(false, resolvedKeybinding.getLabel(), usLabel, model, value);
      }
      if (/abnt_|oem_/.test(value.value)) {
        return this._createDecoration(false, resolvedKeybinding.getLabel(), usLabel, model, value);
      }
      const expectedUserSettingsLabel = resolvedKeybinding.getUserSettingsLabel();
      if (typeof expectedUserSettingsLabel === "string" && !KeybindingEditorDecorationsRenderer._userSettingsFuzzyEquals(value.value, expectedUserSettingsLabel)) {
        return this._createDecoration(false, resolvedKeybinding.getLabel(), usLabel, model, value);
      }
      return null;
    }
    return null;
  }
  static _userSettingsFuzzyEquals(a, b) {
    a = a.trim().toLowerCase();
    b = b.trim().toLowerCase();
    if (a === b) {
      return true;
    }
    const aKeybinding = KeybindingParser.parseKeybinding(a);
    const bKeybinding = KeybindingParser.parseKeybinding(b);
    if (aKeybinding === null && bKeybinding === null) {
      return true;
    }
    if (!aKeybinding || !bKeybinding) {
      return false;
    }
    return aKeybinding.equals(bKeybinding);
  }
  _createDecoration(isError, uiLabel, usLabel, model, keyNode) {
    let msg;
    let className;
    let overviewRulerColor;
    if (isError) {
      msg = new MarkdownString().appendText(NLS_KB_LAYOUT_ERROR_MESSAGE);
      className = "keybindingError";
      overviewRulerColor = themeColorFromId(overviewRulerError);
    } else {
      if (usLabel && uiLabel !== usLabel) {
        msg = new MarkdownString(
          nls.localize({
            key: "defineKeybinding.kbLayoutLocalAndUSMessage",
            comment: [
              "Please translate maintaining the stars (*) around the placeholders such that they will be rendered in bold.",
              "The placeholders will contain a keyboard combination e.g. Ctrl+Shift+/"
            ]
          }, "**{0}** for your current keyboard layout (**{1}** for US standard).", uiLabel, usLabel)
        );
      } else {
        msg = new MarkdownString(
          nls.localize({
            key: "defineKeybinding.kbLayoutLocalMessage",
            comment: [
              "Please translate maintaining the stars (*) around the placeholder such that it will be rendered in bold.",
              "The placeholder will contain a keyboard combination e.g. Ctrl+Shift+/"
            ]
          }, "**{0}** for your current keyboard layout.", uiLabel)
        );
      }
      className = "keybindingInfo";
      overviewRulerColor = themeColorFromId(overviewRulerInfo);
    }
    const startPosition = model.getPositionAt(keyNode.offset);
    const endPosition = model.getPositionAt(keyNode.offset + keyNode.length);
    const range = new Range(
      startPosition.lineNumber,
      startPosition.column,
      endPosition.lineNumber,
      endPosition.column
    );
    return {
      range,
      options: {
        description: "keybindings-widget",
        stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        className,
        hoverMessage: msg,
        overviewRuler: {
          color: overviewRulerColor,
          position: OverviewRulerLane.Right
        }
      }
    };
  }
};
KeybindingEditorDecorationsRenderer = __decorateClass([
  __decorateParam(1, IKeybindingService)
], KeybindingEditorDecorationsRenderer);
function isInterestingEditorModel(editor, userDataProfileService) {
  const model = editor.getModel();
  if (!model) {
    return false;
  }
  return isEqual(model.uri, userDataProfileService.currentProfile.keybindingsResource);
}
registerEditorContribution(DEFINE_KEYBINDING_EDITOR_CONTRIB_ID, DefineKeybindingEditorContribution, EditorContributionInstantiation.AfterFirstRender);
export {
  KeybindingEditorDecorationsRenderer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL2Jyb3dzZXIva2V5YmluZGluZ3NFZGl0b3JDb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IFNuaXBwZXRDb250cm9sbGVyMiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0Q29udHJvbGxlcjIuanMnO1xuaW1wb3J0IHsgU21hcnRTbmlwcGV0SW5zZXJ0ZXIgfSBmcm9tICcuLi9jb21tb24vc21hcnRTbmlwcGV0SW5zZXJ0ZXIuanMnO1xuaW1wb3J0IHsgRGVmaW5lS2V5YmluZGluZ092ZXJsYXlXaWRnZXQgfSBmcm9tICcuL2tleWJpbmRpbmdXaWRnZXRzLmpzJztcbmltcG9ydCB7IHBhcnNlVHJlZSwgTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgV2luZG93c05hdGl2ZVJlc29sdmVkS2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2tleWJpbmRpbmcvY29tbW9uL3dpbmRvd3NLZXlib2FyZE1hcHBlci5qcyc7XG5pbXBvcnQgeyB0aGVtZUNvbG9yRnJvbUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUNvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IG92ZXJ2aWV3UnVsZXJJbmZvLCBvdmVydmlld1J1bGVyRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdG9yQ29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24sIElUZXh0TW9kZWwsIFRyYWNrZWRSYW5nZVN0aWNraW5lc3MsIE92ZXJ2aWV3UnVsZXJMYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nUGFyc2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5YmluZGluZ1BhcnNlci5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBERUZJTkVfS0VZQklORElOR19FRElUT1JfQ09OVFJJQl9JRCwgSURlZmluZUtleWJpbmRpbmdFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgSUVkaXRvckRlY29yYXRpb25zQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcblxuY29uc3QgTkxTX0tCX0xBWU9VVF9FUlJPUl9NRVNTQUdFID0gbmxzLmxvY2FsaXplKCdkZWZpbmVLZXliaW5kaW5nLmtiTGF5b3V0RXJyb3JNZXNzYWdlJywgXCJZb3Ugd29uJ3QgYmUgYWJsZSB0byBwcm9kdWNlIHRoaXMga2V5IGNvbWJpbmF0aW9uIHVuZGVyIHlvdXIgY3VycmVudCBrZXlib2FyZCBsYXlvdXQuXCIpO1xuXG5jbGFzcyBEZWZpbmVLZXliaW5kaW5nRWRpdG9yQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElEZWZpbmVLZXliaW5kaW5nRWRpdG9yQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nRGVjb3JhdGlvblJlbmRlcmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPEtleWJpbmRpbmdFZGl0b3JEZWNvcmF0aW9uc1JlbmRlcmVyPigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWZpbmVXaWRnZXQ6IERlZmluZUtleWJpbmRpbmdPdmVybGF5V2lkZ2V0O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fZGVmaW5lV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVmaW5lS2V5YmluZGluZ092ZXJsYXlXaWRnZXQsIHRoaXMuX2VkaXRvcikpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZU1vZGVsKGUgPT4gdGhpcy5fdXBkYXRlKCkpKTtcblx0XHR0aGlzLl91cGRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3VwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9rZXliaW5kaW5nRGVjb3JhdGlvblJlbmRlcmVyLnZhbHVlID0gaXNJbnRlcmVzdGluZ0VkaXRvck1vZGVsKHRoaXMuX2VkaXRvciwgdGhpcy5fdXNlckRhdGFQcm9maWxlU2VydmljZSlcblx0XHRcdC8vIERlY29yYXRpb25zIGFyZSBzaG93biBmb3IgdGhlIGRlZmF1bHQga2V5YmluZGluZ3MuanNvbiAqKmFuZCoqIGZvciB0aGUgdXNlciBrZXliaW5kaW5ncy5qc29uXG5cdFx0XHQ/IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEtleWJpbmRpbmdFZGl0b3JEZWNvcmF0aW9uc1JlbmRlcmVyLCB0aGlzLl9lZGl0b3IpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHNob3dEZWZpbmVLZXliaW5kaW5nV2lkZ2V0KCk6IHZvaWQge1xuXHRcdGlmIChpc0ludGVyZXN0aW5nRWRpdG9yTW9kZWwodGhpcy5fZWRpdG9yLCB0aGlzLl91c2VyRGF0YVByb2ZpbGVTZXJ2aWNlKSkge1xuXHRcdFx0dGhpcy5fZGVmaW5lV2lkZ2V0LnN0YXJ0KCkudGhlbihrZXliaW5kaW5nID0+IHRoaXMuX29uQWNjZXB0ZWQoa2V5YmluZGluZykpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uQWNjZXB0ZWQoa2V5YmluZGluZzogc3RyaW5nIHwgbnVsbCk6IHZvaWQge1xuXHRcdHRoaXMuX2VkaXRvci5mb2N1cygpO1xuXHRcdGlmIChrZXliaW5kaW5nICYmIHRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRjb25zdCByZWdleHAgPSBuZXcgUmVnRXhwKC9cXFxcL2cpO1xuXHRcdFx0Y29uc3QgYmFja3NsYXNoID0gcmVnZXhwLnRlc3Qoa2V5YmluZGluZyk7XG5cdFx0XHRpZiAoYmFja3NsYXNoKSB7XG5cdFx0XHRcdGtleWJpbmRpbmcgPSBrZXliaW5kaW5nLnNsaWNlKDAsIC0xKSArICdcXFxcXFxcXCc7XG5cdFx0XHR9XG5cdFx0XHRsZXQgc25pcHBldFRleHQgPSBbXG5cdFx0XHRcdCd7Jyxcblx0XHRcdFx0J1xcdFwia2V5XCI6ICcgKyBKU09OLnN0cmluZ2lmeShrZXliaW5kaW5nKSArICcsJyxcblx0XHRcdFx0J1xcdFwiY29tbWFuZFwiOiBcIiR7MTpjb21tYW5kSWR9XCIsJyxcblx0XHRcdFx0J1xcdFwid2hlblwiOiBcIiR7MjplZGl0b3JUZXh0Rm9jdXN9XCInLFxuXHRcdFx0XHQnfSQwJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3Qgc21hcnRJbnNlcnRJbmZvID0gU21hcnRTbmlwcGV0SW5zZXJ0ZXIuaW5zZXJ0U25pcHBldCh0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSwgdGhpcy5fZWRpdG9yLmdldFBvc2l0aW9uKCkpO1xuXHRcdFx0c25pcHBldFRleHQgPSBzbWFydEluc2VydEluZm8ucHJlcGVuZCArIHNuaXBwZXRUZXh0ICsgc21hcnRJbnNlcnRJbmZvLmFwcGVuZDtcblx0XHRcdHRoaXMuX2VkaXRvci5zZXRQb3NpdGlvbihzbWFydEluc2VydEluZm8ucG9zaXRpb24pO1xuXG5cdFx0XHRTbmlwcGV0Q29udHJvbGxlcjIuZ2V0KHRoaXMuX2VkaXRvcik/Lmluc2VydChzbmlwcGV0VGV4dCwgeyBvdmVyd3JpdGVCZWZvcmU6IDAsIG92ZXJ3cml0ZUFmdGVyOiAwIH0pO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgS2V5YmluZGluZ0VkaXRvckRlY29yYXRpb25zUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIF91cGRhdGVEZWNvcmF0aW9uczogUnVuT25jZVNjaGVkdWxlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfZGVjOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2RlYyA9IHRoaXMuX2VkaXRvci5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblxuXHRcdHRoaXMuX3VwZGF0ZURlY29yYXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gdGhpcy5fdXBkYXRlRGVjb3JhdGlvbnNOb3coKSwgNTAwKSk7XG5cblx0XHRjb25zdCBtb2RlbCA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbC5vbkRpZENoYW5nZUNvbnRlbnQoKCkgPT4gdGhpcy5fdXBkYXRlRGVjb3JhdGlvbnMuc2NoZWR1bGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLm9uRGlkVXBkYXRlS2V5YmluZGluZ3MoKCkgPT4gdGhpcy5fdXBkYXRlRGVjb3JhdGlvbnMuc2NoZWR1bGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fZGVjLmNsZWFyKCk7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZURlY29yYXRpb25zLmNhbmNlbCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX3VwZGF0ZURlY29yYXRpb25zLnNjaGVkdWxlKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVEZWNvcmF0aW9uc05vdygpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpKTtcblxuXHRcdGNvbnN0IG5ld0RlY29yYXRpb25zOiBJTW9kZWxEZWx0YURlY29yYXRpb25bXSA9IFtdO1xuXG5cdFx0Y29uc3Qgcm9vdCA9IHBhcnNlVHJlZShtb2RlbC5nZXRWYWx1ZSgpKTtcblx0XHRpZiAocm9vdCAmJiBBcnJheS5pc0FycmF5KHJvb3QuY2hpbGRyZW4pKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gcm9vdC5jaGlsZHJlbi5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHJvb3QuY2hpbGRyZW5baV07XG5cdFx0XHRcdGNvbnN0IGRlYyA9IHRoaXMuX2dldERlY29yYXRpb25Gb3JFbnRyeShtb2RlbCwgZW50cnkpO1xuXHRcdFx0XHRpZiAoZGVjICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0bmV3RGVjb3JhdGlvbnMucHVzaChkZWMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fZGVjLnNldChuZXdEZWNvcmF0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIF9nZXREZWNvcmF0aW9uRm9yRW50cnkobW9kZWw6IElUZXh0TW9kZWwsIGVudHJ5OiBOb2RlKTogSU1vZGVsRGVsdGFEZWNvcmF0aW9uIHwgbnVsbCB7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KGVudHJ5LmNoaWxkcmVuKSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBlbnRyeS5jaGlsZHJlbi5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0Y29uc3QgcHJvcCA9IGVudHJ5LmNoaWxkcmVuW2ldO1xuXHRcdFx0aWYgKHByb3AudHlwZSAhPT0gJ3Byb3BlcnR5Jykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICghQXJyYXkuaXNBcnJheShwcm9wLmNoaWxkcmVuKSB8fCBwcm9wLmNoaWxkcmVuLmxlbmd0aCAhPT0gMikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGtleSA9IHByb3AuY2hpbGRyZW5bMF07XG5cdFx0XHRpZiAoa2V5LnZhbHVlICE9PSAna2V5Jykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHZhbHVlID0gcHJvcC5jaGlsZHJlblsxXTtcblx0XHRcdGlmICh2YWx1ZS50eXBlICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzb2x2ZWRLZXliaW5kaW5ncyA9IHRoaXMuX2tleWJpbmRpbmdTZXJ2aWNlLnJlc29sdmVVc2VyQmluZGluZyh2YWx1ZS52YWx1ZSk7XG5cdFx0XHRpZiAocmVzb2x2ZWRLZXliaW5kaW5ncy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURlY29yYXRpb24odHJ1ZSwgbnVsbCwgbnVsbCwgbW9kZWwsIHZhbHVlKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc29sdmVkS2V5YmluZGluZyA9IHJlc29sdmVkS2V5YmluZGluZ3NbMF07XG5cdFx0XHRsZXQgdXNMYWJlbDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdFx0XHRpZiAocmVzb2x2ZWRLZXliaW5kaW5nIGluc3RhbmNlb2YgV2luZG93c05hdGl2ZVJlc29sdmVkS2V5YmluZGluZykge1xuXHRcdFx0XHR1c0xhYmVsID0gcmVzb2x2ZWRLZXliaW5kaW5nLmdldFVTTGFiZWwoKTtcblx0XHRcdH1cblx0XHRcdGlmICghcmVzb2x2ZWRLZXliaW5kaW5nLmlzV1lTSVdZRygpKSB7XG5cdFx0XHRcdGNvbnN0IHVpTGFiZWwgPSByZXNvbHZlZEtleWJpbmRpbmcuZ2V0TGFiZWwoKTtcblx0XHRcdFx0aWYgKHR5cGVvZiB1aUxhYmVsID09PSAnc3RyaW5nJyAmJiB2YWx1ZS52YWx1ZS50b0xvd2VyQ2FzZSgpID09PSB1aUxhYmVsLnRvTG93ZXJDYXNlKCkpIHtcblx0XHRcdFx0XHQvLyBjb2luY2lkZW50YWxseSwgdGhpcyBpcyBhY3R1YWxseSBXWVNJV1lHXG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXMuX2NyZWF0ZURlY29yYXRpb24oZmFsc2UsIHJlc29sdmVkS2V5YmluZGluZy5nZXRMYWJlbCgpLCB1c0xhYmVsLCBtb2RlbCwgdmFsdWUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKC9hYm50X3xvZW1fLy50ZXN0KHZhbHVlLnZhbHVlKSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fY3JlYXRlRGVjb3JhdGlvbihmYWxzZSwgcmVzb2x2ZWRLZXliaW5kaW5nLmdldExhYmVsKCksIHVzTGFiZWwsIG1vZGVsLCB2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBleHBlY3RlZFVzZXJTZXR0aW5nc0xhYmVsID0gcmVzb2x2ZWRLZXliaW5kaW5nLmdldFVzZXJTZXR0aW5nc0xhYmVsKCk7XG5cdFx0XHRpZiAodHlwZW9mIGV4cGVjdGVkVXNlclNldHRpbmdzTGFiZWwgPT09ICdzdHJpbmcnICYmICFLZXliaW5kaW5nRWRpdG9yRGVjb3JhdGlvbnNSZW5kZXJlci5fdXNlclNldHRpbmdzRnV6enlFcXVhbHModmFsdWUudmFsdWUsIGV4cGVjdGVkVXNlclNldHRpbmdzTGFiZWwpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVEZWNvcmF0aW9uKGZhbHNlLCByZXNvbHZlZEtleWJpbmRpbmcuZ2V0TGFiZWwoKSwgdXNMYWJlbCwgbW9kZWwsIHZhbHVlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHN0YXRpYyBfdXNlclNldHRpbmdzRnV6enlFcXVhbHMoYTogc3RyaW5nLCBiOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRhID0gYS50cmltKCkudG9Mb3dlckNhc2UoKTtcblx0XHRiID0gYi50cmltKCkudG9Mb3dlckNhc2UoKTtcblxuXHRcdGlmIChhID09PSBiKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBhS2V5YmluZGluZyA9IEtleWJpbmRpbmdQYXJzZXIucGFyc2VLZXliaW5kaW5nKGEpO1xuXHRcdGNvbnN0IGJLZXliaW5kaW5nID0gS2V5YmluZGluZ1BhcnNlci5wYXJzZUtleWJpbmRpbmcoYik7XG5cdFx0aWYgKGFLZXliaW5kaW5nID09PSBudWxsICYmIGJLZXliaW5kaW5nID09PSBudWxsKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aWYgKCFhS2V5YmluZGluZyB8fCAhYktleWJpbmRpbmcpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIGFLZXliaW5kaW5nLmVxdWFscyhiS2V5YmluZGluZyk7XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVEZWNvcmF0aW9uKGlzRXJyb3I6IGJvb2xlYW4sIHVpTGFiZWw6IHN0cmluZyB8IG51bGwsIHVzTGFiZWw6IHN0cmluZyB8IG51bGwsIG1vZGVsOiBJVGV4dE1vZGVsLCBrZXlOb2RlOiBOb2RlKTogSU1vZGVsRGVsdGFEZWNvcmF0aW9uIHtcblx0XHRsZXQgbXNnOiBNYXJrZG93blN0cmluZztcblx0XHRsZXQgY2xhc3NOYW1lOiBzdHJpbmc7XG5cdFx0bGV0IG92ZXJ2aWV3UnVsZXJDb2xvcjogVGhlbWVDb2xvcjtcblxuXHRcdGlmIChpc0Vycm9yKSB7XG5cdFx0XHQvLyB0aGlzIGlzIHRoZSBlcnJvciBjYXNlXG5cdFx0XHRtc2cgPSBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KE5MU19LQl9MQVlPVVRfRVJST1JfTUVTU0FHRSk7XG5cdFx0XHRjbGFzc05hbWUgPSAna2V5YmluZGluZ0Vycm9yJztcblx0XHRcdG92ZXJ2aWV3UnVsZXJDb2xvciA9IHRoZW1lQ29sb3JGcm9tSWQob3ZlcnZpZXdSdWxlckVycm9yKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gdGhpcyBpcyB0aGUgaW5mbyBjYXNlXG5cdFx0XHRpZiAodXNMYWJlbCAmJiB1aUxhYmVsICE9PSB1c0xhYmVsKSB7XG5cdFx0XHRcdG1zZyA9IG5ldyBNYXJrZG93blN0cmluZyhcblx0XHRcdFx0XHRubHMubG9jYWxpemUoe1xuXHRcdFx0XHRcdFx0a2V5OiAnZGVmaW5lS2V5YmluZGluZy5rYkxheW91dExvY2FsQW5kVVNNZXNzYWdlJyxcblx0XHRcdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHRcdFx0J1BsZWFzZSB0cmFuc2xhdGUgbWFpbnRhaW5pbmcgdGhlIHN0YXJzICgqKSBhcm91bmQgdGhlIHBsYWNlaG9sZGVycyBzdWNoIHRoYXQgdGhleSB3aWxsIGJlIHJlbmRlcmVkIGluIGJvbGQuJyxcblx0XHRcdFx0XHRcdFx0J1RoZSBwbGFjZWhvbGRlcnMgd2lsbCBjb250YWluIGEga2V5Ym9hcmQgY29tYmluYXRpb24gZS5nLiBDdHJsK1NoaWZ0Ky8nXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSwgXCIqKnswfSoqIGZvciB5b3VyIGN1cnJlbnQga2V5Ym9hcmQgbGF5b3V0ICgqKnsxfSoqIGZvciBVUyBzdGFuZGFyZCkuXCIsIHVpTGFiZWwsIHVzTGFiZWwpXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRtc2cgPSBuZXcgTWFya2Rvd25TdHJpbmcoXG5cdFx0XHRcdFx0bmxzLmxvY2FsaXplKHtcblx0XHRcdFx0XHRcdGtleTogJ2RlZmluZUtleWJpbmRpbmcua2JMYXlvdXRMb2NhbE1lc3NhZ2UnLFxuXHRcdFx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdFx0XHQnUGxlYXNlIHRyYW5zbGF0ZSBtYWludGFpbmluZyB0aGUgc3RhcnMgKCopIGFyb3VuZCB0aGUgcGxhY2Vob2xkZXIgc3VjaCB0aGF0IGl0IHdpbGwgYmUgcmVuZGVyZWQgaW4gYm9sZC4nLFxuXHRcdFx0XHRcdFx0XHQnVGhlIHBsYWNlaG9sZGVyIHdpbGwgY29udGFpbiBhIGtleWJvYXJkIGNvbWJpbmF0aW9uIGUuZy4gQ3RybCtTaGlmdCsvJ1xuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH0sIFwiKip7MH0qKiBmb3IgeW91ciBjdXJyZW50IGtleWJvYXJkIGxheW91dC5cIiwgdWlMYWJlbClcblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHRcdGNsYXNzTmFtZSA9ICdrZXliaW5kaW5nSW5mbyc7XG5cdFx0XHRvdmVydmlld1J1bGVyQ29sb3IgPSB0aGVtZUNvbG9yRnJvbUlkKG92ZXJ2aWV3UnVsZXJJbmZvKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydFBvc2l0aW9uID0gbW9kZWwuZ2V0UG9zaXRpb25BdChrZXlOb2RlLm9mZnNldCk7XG5cdFx0Y29uc3QgZW5kUG9zaXRpb24gPSBtb2RlbC5nZXRQb3NpdGlvbkF0KGtleU5vZGUub2Zmc2V0ICsga2V5Tm9kZS5sZW5ndGgpO1xuXHRcdGNvbnN0IHJhbmdlID0gbmV3IFJhbmdlKFxuXHRcdFx0c3RhcnRQb3NpdGlvbi5saW5lTnVtYmVyLCBzdGFydFBvc2l0aW9uLmNvbHVtbixcblx0XHRcdGVuZFBvc2l0aW9uLmxpbmVOdW1iZXIsIGVuZFBvc2l0aW9uLmNvbHVtblxuXHRcdCk7XG5cblx0XHQvLyBpY29uICsgaGlnaGxpZ2h0ICsgbWVzc2FnZSBkZWNvcmF0aW9uXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJhbmdlOiByYW5nZSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdrZXliaW5kaW5ncy13aWRnZXQnLFxuXHRcdFx0XHRzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcyxcblx0XHRcdFx0Y2xhc3NOYW1lOiBjbGFzc05hbWUsXG5cdFx0XHRcdGhvdmVyTWVzc2FnZTogbXNnLFxuXHRcdFx0XHRvdmVydmlld1J1bGVyOiB7XG5cdFx0XHRcdFx0Y29sb3I6IG92ZXJ2aWV3UnVsZXJDb2xvcixcblx0XHRcdFx0XHRwb3NpdGlvbjogT3ZlcnZpZXdSdWxlckxhbmUuUmlnaHRcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxufVxuXG5mdW5jdGlvbiBpc0ludGVyZXN0aW5nRWRpdG9yTW9kZWwoZWRpdG9yOiBJQ29kZUVkaXRvciwgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UpOiBib29sZWFuIHtcblx0Y29uc3QgbW9kZWwgPSBlZGl0b3IuZ2V0TW9kZWwoKTtcblx0aWYgKCFtb2RlbCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gaXNFcXVhbChtb2RlbC51cmksIHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUua2V5YmluZGluZ3NSZXNvdXJjZSk7XG59XG5cbnJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uKERFRklORV9LRVlCSU5ESU5HX0VESVRPUl9DT05UUklCX0lELCBEZWZpbmVLZXliaW5kaW5nRWRpdG9yQ29udHJpYnV0aW9uLCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLkFmdGVyRmlyc3RSZW5kZXIpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZLHlCQUF5QjtBQUM5QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGFBQWE7QUFDdEIsU0FBUyw0QkFBNEIsdUNBQXVDO0FBRTVFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsaUJBQXVCO0FBQ2hDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsbUJBQW1CLDBCQUEwQjtBQUN0RCxTQUE0Qyx3QkFBd0IseUJBQXlCO0FBQzdGLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZUFBZTtBQUN4QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDJD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
