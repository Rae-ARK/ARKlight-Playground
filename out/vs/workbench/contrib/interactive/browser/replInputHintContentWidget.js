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
import { status } from "../../../../base/browser/ui/aria/aria.js";
import { KeybindingLabel } from "../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { OS } from "../../../../base/common/platform.js";
import { ContentWidgetPositionPreference } from "../../../../editor/browser/editorBrowser.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../editor/common/core/position.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { ReplEditorSettings } from "./interactiveCommon.js";
let ReplInputHintContentWidget = class extends Disposable {
  constructor(editor, configurationService, keybindingService) {
    super();
    this.editor = editor;
    this.configurationService = configurationService;
    this.keybindingService = keybindingService;
    this.ariaLabel = "";
    this._register(this.editor.onDidChangeConfiguration((e) => {
      if (this.domNode && e.hasChanged(EditorOption.fontInfo)) {
        this.editor.applyFontInfo(this.domNode);
      }
    }));
    const onDidFocusEditorText = Event.debounce(this.editor.onDidFocusEditorText, () => void 0, 500);
    this._register(onDidFocusEditorText(() => {
      if (this.editor.hasTextFocus() && this.ariaLabel && configurationService.getValue(AccessibilityVerbositySettingId.ReplEditor)) {
        status(this.ariaLabel);
      }
    }));
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ReplEditorSettings.executeWithShiftEnter)) {
        this.setHint();
      }
    }));
    this.editor.addContentWidget(this);
  }
  getId() {
    return ReplInputHintContentWidget.ID;
  }
  getPosition() {
    return {
      position: { lineNumber: 1, column: 1 },
      preference: [ContentWidgetPositionPreference.EXACT]
    };
  }
  getDomNode() {
    if (!this.domNode) {
      this.domNode = dom.$(".empty-editor-hint");
      this.domNode.style.width = "max-content";
      this.domNode.style.paddingLeft = "4px";
      this.setHint();
      this._register(dom.addDisposableListener(this.domNode, "click", () => {
        this.editor.focus();
      }));
      this.editor.applyFontInfo(this.domNode);
      const lineHeight = this.editor.getLineHeightForPosition(new Position(1, 1));
      this.domNode.style.lineHeight = lineHeight + "px";
    }
    return this.domNode;
  }
  setHint() {
    if (!this.domNode) {
      return;
    }
    while (this.domNode.firstChild) {
      this.domNode.removeChild(this.domNode.firstChild);
    }
    const hintElement = dom.$("div.empty-hint-text");
    hintElement.style.cursor = "text";
    hintElement.style.whiteSpace = "nowrap";
    const keybinding = this.getKeybinding();
    const keybindingHintLabel = keybinding?.getLabel();
    if (keybinding && keybindingHintLabel) {
      const actionPart = localize("emptyHintText", "Press {0} to execute. ", keybindingHintLabel);
      const [before, after] = actionPart.split(keybindingHintLabel).map((fragment) => {
        const hintPart = dom.$("span", void 0, fragment);
        hintPart.style.fontStyle = "italic";
        return hintPart;
      });
      hintElement.appendChild(before);
      if (this.label) {
        this.label.dispose();
      }
      this.label = this._register(new KeybindingLabel(hintElement, OS));
      this.label.set(keybinding);
      this.label.element.style.width = "min-content";
      this.label.element.style.display = "inline";
      hintElement.appendChild(after);
      this.domNode.append(hintElement);
      const helpKeybinding = this.keybindingService.lookupKeybinding(AccessibilityCommandId.OpenAccessibilityHelp)?.getLabel();
      const helpInfo = helpKeybinding ? localize("ReplInputAriaLabelHelp", "Use {0} for accessibility help. ", helpKeybinding) : localize("ReplInputAriaLabelHelpNoKb", "Run the Open Accessibility Help command for more information. ");
      this.ariaLabel = actionPart.concat(helpInfo, localize("disableHint", " Toggle {0} in settings to disable this hint.", AccessibilityVerbositySettingId.ReplEditor));
    }
  }
  getKeybinding() {
    const keybindings = this.keybindingService.lookupKeybindings("interactive.execute");
    const shiftEnterConfig = this.configurationService.getValue(ReplEditorSettings.executeWithShiftEnter);
    const hasEnterChord = (kb, modifier = "") => {
      const chords = kb.getDispatchChords();
      const chord = modifier + "Enter";
      const chordAlt = modifier + "[Enter]";
      return chords.length === 1 && (chords[0] === chord || chords[0] === chordAlt);
    };
    if (shiftEnterConfig) {
      const keybinding = keybindings.find((kb) => hasEnterChord(kb, "shift+"));
      if (keybinding) {
        return keybinding;
      }
    } else {
      let keybinding = keybindings.find((kb) => hasEnterChord(kb));
      if (keybinding) {
        return keybinding;
      }
      keybinding = this.keybindingService.lookupKeybindings("python.execInREPLEnter").find((kb) => hasEnterChord(kb));
      if (keybinding) {
        return keybinding;
      }
    }
    return keybindings?.[0];
  }
  dispose() {
    super.dispose();
    this.editor.removeContentWidget(this);
    this.label?.dispose();
  }
};
ReplInputHintContentWidget.ID = "replInput.widget.emptyHint";
ReplInputHintContentWidget = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IKeybindingService)
], ReplInputHintContentWidget);
export {
  ReplInputHintContentWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2ludGVyYWN0aXZlL2Jyb3dzZXIvcmVwbElucHV0SGludENvbnRlbnRXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBzdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9rZXliaW5kaW5nTGFiZWwva2V5YmluZGluZ0xhYmVsLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgUmVzb2x2ZWRLZXliaW5kaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5YmluZGluZ3MuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBPUyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IENvbnRlbnRXaWRnZXRQb3NpdGlvblByZWZlcmVuY2UsIElDb2RlRWRpdG9yLCBJQ29udGVudFdpZGdldCwgSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCwgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZCB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5Q29tbWFuZElkIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IFJlcGxFZGl0b3JTZXR0aW5ncyB9IGZyb20gJy4vaW50ZXJhY3RpdmVDb21tb24uanMnO1xuXG5cbmV4cG9ydCBjbGFzcyBSZXBsSW5wdXRIaW50Q29udGVudFdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29udGVudFdpZGdldCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgSUQgPSAncmVwbElucHV0LndpZGdldC5lbXB0eUhpbnQnO1xuXG5cdHByaXZhdGUgZG9tTm9kZTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgYXJpYUxhYmVsOiBzdHJpbmcgPSAnJztcblx0cHJpdmF0ZSBsYWJlbDogS2V5YmluZGluZ0xhYmVsIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoZTogQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuZG9tTm9kZSAmJiBlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLmZvbnRJbmZvKSkge1xuXHRcdFx0XHR0aGlzLmVkaXRvci5hcHBseUZvbnRJbmZvKHRoaXMuZG9tTm9kZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IG9uRGlkRm9jdXNFZGl0b3JUZXh0ID0gRXZlbnQuZGVib3VuY2UodGhpcy5lZGl0b3Iub25EaWRGb2N1c0VkaXRvclRleHQsICgpID0+IHVuZGVmaW5lZCwgNTAwKTtcblx0XHR0aGlzLl9yZWdpc3RlcihvbkRpZEZvY3VzRWRpdG9yVGV4dCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5lZGl0b3IuaGFzVGV4dEZvY3VzKCkgJiYgdGhpcy5hcmlhTGFiZWwgJiYgY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5SZXBsRWRpdG9yKSkge1xuXHRcdFx0XHRzdGF0dXModGhpcy5hcmlhTGFiZWwpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihSZXBsRWRpdG9yU2V0dGluZ3MuZXhlY3V0ZVdpdGhTaGlmdEVudGVyKSkge1xuXHRcdFx0XHR0aGlzLnNldEhpbnQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5lZGl0b3IuYWRkQ29udGVudFdpZGdldCh0aGlzKTtcblx0fVxuXG5cdGdldElkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIFJlcGxJbnB1dEhpbnRDb250ZW50V2lkZ2V0LklEO1xuXHR9XG5cblx0Z2V0UG9zaXRpb24oKTogSUNvbnRlbnRXaWRnZXRQb3NpdGlvbiB8IG51bGwge1xuXHRcdHJldHVybiB7XG5cdFx0XHRwb3NpdGlvbjogeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDEgfSxcblx0XHRcdHByZWZlcmVuY2U6IFtDb250ZW50V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkVYQUNUXVxuXHRcdH07XG5cdH1cblxuXHRnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHtcblx0XHRpZiAoIXRoaXMuZG9tTm9kZSkge1xuXHRcdFx0dGhpcy5kb21Ob2RlID0gZG9tLiQoJy5lbXB0eS1lZGl0b3ItaGludCcpO1xuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLndpZHRoID0gJ21heC1jb250ZW50Jztcblx0XHRcdHRoaXMuZG9tTm9kZS5zdHlsZS5wYWRkaW5nTGVmdCA9ICc0cHgnO1xuXG5cdFx0XHR0aGlzLnNldEhpbnQoKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmRvbU5vZGUsICdjbGljaycsICgpID0+IHtcblx0XHRcdFx0dGhpcy5lZGl0b3IuZm9jdXMoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5lZGl0b3IuYXBwbHlGb250SW5mbyh0aGlzLmRvbU5vZGUpO1xuXHRcdFx0Y29uc3QgbGluZUhlaWdodCA9IHRoaXMuZWRpdG9yLmdldExpbmVIZWlnaHRGb3JQb3NpdGlvbihuZXcgUG9zaXRpb24oMSwgMSkpO1xuXHRcdFx0dGhpcy5kb21Ob2RlLnN0eWxlLmxpbmVIZWlnaHQgPSBsaW5lSGVpZ2h0ICsgJ3B4Jztcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5kb21Ob2RlO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRIaW50KCkge1xuXHRcdGlmICghdGhpcy5kb21Ob2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHdoaWxlICh0aGlzLmRvbU5vZGUuZmlyc3RDaGlsZCkge1xuXHRcdFx0dGhpcy5kb21Ob2RlLnJlbW92ZUNoaWxkKHRoaXMuZG9tTm9kZS5maXJzdENoaWxkKTtcblx0XHR9XG5cblx0XHRjb25zdCBoaW50RWxlbWVudCA9IGRvbS4kKCdkaXYuZW1wdHktaGludC10ZXh0Jyk7XG5cdFx0aGludEVsZW1lbnQuc3R5bGUuY3Vyc29yID0gJ3RleHQnO1xuXHRcdGhpbnRFbGVtZW50LnN0eWxlLndoaXRlU3BhY2UgPSAnbm93cmFwJztcblxuXHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLmdldEtleWJpbmRpbmcoKTtcblx0XHRjb25zdCBrZXliaW5kaW5nSGludExhYmVsID0ga2V5YmluZGluZz8uZ2V0TGFiZWwoKTtcblxuXHRcdGlmIChrZXliaW5kaW5nICYmIGtleWJpbmRpbmdIaW50TGFiZWwpIHtcblx0XHRcdGNvbnN0IGFjdGlvblBhcnQgPSBsb2NhbGl6ZSgnZW1wdHlIaW50VGV4dCcsICdQcmVzcyB7MH0gdG8gZXhlY3V0ZS4gJywga2V5YmluZGluZ0hpbnRMYWJlbCk7XG5cblx0XHRcdGNvbnN0IFtiZWZvcmUsIGFmdGVyXSA9IGFjdGlvblBhcnQuc3BsaXQoa2V5YmluZGluZ0hpbnRMYWJlbCkubWFwKChmcmFnbWVudCkgPT4ge1xuXHRcdFx0XHRjb25zdCBoaW50UGFydCA9IGRvbS4kKCdzcGFuJywgdW5kZWZpbmVkLCBmcmFnbWVudCk7XG5cdFx0XHRcdGhpbnRQYXJ0LnN0eWxlLmZvbnRTdHlsZSA9ICdpdGFsaWMnO1xuXHRcdFx0XHRyZXR1cm4gaGludFBhcnQ7XG5cdFx0XHR9KTtcblxuXHRcdFx0aGludEVsZW1lbnQuYXBwZW5kQ2hpbGQoYmVmb3JlKTtcblxuXHRcdFx0aWYgKHRoaXMubGFiZWwpIHtcblx0XHRcdFx0dGhpcy5sYWJlbC5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxhYmVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IEtleWJpbmRpbmdMYWJlbChoaW50RWxlbWVudCwgT1MpKTtcblx0XHRcdHRoaXMubGFiZWwuc2V0KGtleWJpbmRpbmcpO1xuXHRcdFx0dGhpcy5sYWJlbC5lbGVtZW50LnN0eWxlLndpZHRoID0gJ21pbi1jb250ZW50Jztcblx0XHRcdHRoaXMubGFiZWwuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZSc7XG5cblx0XHRcdGhpbnRFbGVtZW50LmFwcGVuZENoaWxkKGFmdGVyKTtcblx0XHRcdHRoaXMuZG9tTm9kZS5hcHBlbmQoaGludEVsZW1lbnQpO1xuXG5cdFx0XHRjb25zdCBoZWxwS2V5YmluZGluZyA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhBY2Nlc3NpYmlsaXR5Q29tbWFuZElkLk9wZW5BY2Nlc3NpYmlsaXR5SGVscCk/LmdldExhYmVsKCk7XG5cdFx0XHRjb25zdCBoZWxwSW5mbyA9IGhlbHBLZXliaW5kaW5nXG5cdFx0XHRcdD8gbG9jYWxpemUoJ1JlcGxJbnB1dEFyaWFMYWJlbEhlbHAnLCBcIlVzZSB7MH0gZm9yIGFjY2Vzc2liaWxpdHkgaGVscC4gXCIsIGhlbHBLZXliaW5kaW5nKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdSZXBsSW5wdXRBcmlhTGFiZWxIZWxwTm9LYicsIFwiUnVuIHRoZSBPcGVuIEFjY2Vzc2liaWxpdHkgSGVscCBjb21tYW5kIGZvciBtb3JlIGluZm9ybWF0aW9uLiBcIik7XG5cblx0XHRcdHRoaXMuYXJpYUxhYmVsID0gYWN0aW9uUGFydC5jb25jYXQoaGVscEluZm8sIGxvY2FsaXplKCdkaXNhYmxlSGludCcsICcgVG9nZ2xlIHswfSBpbiBzZXR0aW5ncyB0byBkaXNhYmxlIHRoaXMgaGludC4nLCBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLlJlcGxFZGl0b3IpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEtleWJpbmRpbmcoKSB7XG5cdFx0Y29uc3Qga2V5YmluZGluZ3MgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmdzKCdpbnRlcmFjdGl2ZS5leGVjdXRlJyk7XG5cdFx0Y29uc3Qgc2hpZnRFbnRlckNvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoUmVwbEVkaXRvclNldHRpbmdzLmV4ZWN1dGVXaXRoU2hpZnRFbnRlcik7XG5cdFx0Y29uc3QgaGFzRW50ZXJDaG9yZCA9IChrYjogUmVzb2x2ZWRLZXliaW5kaW5nLCBtb2RpZmllcjogc3RyaW5nID0gJycpID0+IHtcblx0XHRcdGNvbnN0IGNob3JkcyA9IGtiLmdldERpc3BhdGNoQ2hvcmRzKCk7XG5cdFx0XHRjb25zdCBjaG9yZCA9IG1vZGlmaWVyICsgJ0VudGVyJztcblx0XHRcdGNvbnN0IGNob3JkQWx0ID0gbW9kaWZpZXIgKyAnW0VudGVyXSc7XG5cdFx0XHRyZXR1cm4gY2hvcmRzLmxlbmd0aCA9PT0gMSAmJiAoY2hvcmRzWzBdID09PSBjaG9yZCB8fCBjaG9yZHNbMF0gPT09IGNob3JkQWx0KTtcblx0XHR9O1xuXG5cdFx0aWYgKHNoaWZ0RW50ZXJDb25maWcpIHtcblx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSBrZXliaW5kaW5ncy5maW5kKGtiID0+IGhhc0VudGVyQ2hvcmQoa2IsICdzaGlmdCsnKSk7XG5cdFx0XHRpZiAoa2V5YmluZGluZykge1xuXHRcdFx0XHRyZXR1cm4ga2V5YmluZGluZztcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IGtleWJpbmRpbmcgPSBrZXliaW5kaW5ncy5maW5kKGtiID0+IGhhc0VudGVyQ2hvcmQoa2IpKTtcblx0XHRcdGlmIChrZXliaW5kaW5nKSB7XG5cdFx0XHRcdHJldHVybiBrZXliaW5kaW5nO1xuXHRcdFx0fVxuXHRcdFx0a2V5YmluZGluZyA9IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZ3MoJ3B5dGhvbi5leGVjSW5SRVBMRW50ZXInKVxuXHRcdFx0XHQuZmluZChrYiA9PiBoYXNFbnRlckNob3JkKGtiKSk7XG5cdFx0XHRpZiAoa2V5YmluZGluZykge1xuXHRcdFx0XHRyZXR1cm4ga2V5YmluZGluZztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4ga2V5YmluZGluZ3M/LlswXTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZWRpdG9yLnJlbW92ZUNvbnRlbnRXaWRnZXQodGhpcyk7XG5cdFx0dGhpcy5sYWJlbD8uZGlzcG9zZSgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGNBQWM7QUFDdkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxhQUFh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
