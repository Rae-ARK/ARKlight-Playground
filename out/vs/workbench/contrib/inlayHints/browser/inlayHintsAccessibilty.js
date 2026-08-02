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
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { EditorAction2, EditorContributionInstantiation, registerEditorContribution } from "../../../../editor/browser/editorExtensions.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { asCommandLink } from "../../../../editor/contrib/inlayHints/browser/inlayHints.js";
import { InlayHintsController } from "../../../../editor/contrib/inlayHints/browser/inlayHintsController.js";
import { localize, localize2 } from "../../../../nls.js";
import { registerAction2 } from "../../../../platform/actions/common/actions.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { Link } from "../../../../platform/opener/browser/link.js";
let InlayHintsAccessibility = class {
  constructor(_editor, contextKeyService, _accessibilitySignalService, _instaService) {
    this._editor = _editor;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._instaService = _instaService;
    this._sessionDispoosables = new DisposableStore();
    this._ariaElement = document.createElement("span");
    this._ariaElement.style.position = "fixed";
    this._ariaElement.className = "inlayhint-accessibility-element";
    this._ariaElement.tabIndex = 0;
    this._ariaElement.setAttribute("aria-description", localize("description", "Code with Inlay Hint Information"));
    this._ctxIsReading = InlayHintsAccessibility.IsReading.bindTo(contextKeyService);
  }
  static get(editor) {
    return editor.getContribution(InlayHintsAccessibility.ID) ?? void 0;
  }
  dispose() {
    this._sessionDispoosables.dispose();
    this._ctxIsReading.reset();
    this._ariaElement.remove();
  }
  _reset() {
    dom.clearNode(this._ariaElement);
    this._sessionDispoosables.clear();
    this._ctxIsReading.reset();
  }
  async _read(line, hints) {
    this._sessionDispoosables.clear();
    if (!this._ariaElement.isConnected) {
      this._editor.getDomNode()?.appendChild(this._ariaElement);
    }
    if (!this._editor.hasModel() || !this._ariaElement.isConnected) {
      this._ctxIsReading.set(false);
      return;
    }
    const cts = new CancellationTokenSource();
    this._sessionDispoosables.add(cts);
    for (const hint of hints) {
      await hint.resolve(cts.token);
    }
    if (cts.token.isCancellationRequested) {
      return;
    }
    const model = this._editor.getModel();
    const newChildren = [];
    let start = 0;
    let tooLongToRead = false;
    for (const item of hints) {
      const part = model.getValueInRange({ startLineNumber: line, startColumn: start + 1, endLineNumber: line, endColumn: item.hint.position.column });
      if (part.length > 0) {
        newChildren.push(part);
        start = item.hint.position.column - 1;
      }
      if (start > 750) {
        newChildren.push("\u2026");
        tooLongToRead = true;
        break;
      }
      const em = document.createElement("em");
      const { label } = item.hint;
      if (typeof label === "string") {
        em.innerText = label;
      } else {
        for (const part2 of label) {
          if (part2.command) {
            const link = this._instaService.createInstance(
              Link,
              em,
              { href: asCommandLink(part2.command), label: part2.label, title: part2.command.title },
              void 0
            );
            this._sessionDispoosables.add(link);
          } else {
            em.innerText += part2.label;
          }
        }
      }
      newChildren.push(em);
    }
    if (!tooLongToRead) {
      newChildren.push(model.getValueInRange({ startLineNumber: line, startColumn: start + 1, endLineNumber: line, endColumn: Number.MAX_SAFE_INTEGER }));
    }
    dom.reset(this._ariaElement, ...newChildren);
    this._ariaElement.focus();
    this._ctxIsReading.set(true);
    this._sessionDispoosables.add(dom.addDisposableListener(this._ariaElement, "focusout", () => {
      this._reset();
    }));
  }
  startInlayHintsReading() {
    if (!this._editor.hasModel()) {
      return;
    }
    const line = this._editor.getPosition().lineNumber;
    const hints = InlayHintsController.get(this._editor)?.getInlayHintsForLine(line);
    if (!hints || hints.length === 0) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.noInlayHints);
    } else {
      this._read(line, hints);
    }
  }
  stopInlayHintsReading() {
    this._reset();
    this._editor.focus();
  }
};
InlayHintsAccessibility.IsReading = new RawContextKey("isReadingLineWithInlayHints", false, { type: "boolean", description: localize("isReadingLineWithInlayHints", "Whether the current line and its inlay hints are currently focused") });
InlayHintsAccessibility.ID = "editor.contrib.InlayHintsAccessibility";
InlayHintsAccessibility = __decorateClass([
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IAccessibilitySignalService),
  __decorateParam(3, IInstantiationService)
], InlayHintsAccessibility);
registerAction2(class StartReadHints extends EditorAction2 {
  constructor() {
    super({
      id: "inlayHints.startReadingLineWithHint",
      title: localize2("read.title", "Read Line with Inlay Hints"),
      precondition: EditorContextKeys.hasInlayHintsProvider,
      f1: true
    });
  }
  runEditorCommand(_accessor, editor) {
    const ctrl = InlayHintsAccessibility.get(editor);
    ctrl?.startInlayHintsReading();
  }
});
registerAction2(class StopReadHints extends EditorAction2 {
  constructor() {
    super({
      id: "inlayHints.stopReadingLineWithHint",
      title: localize2("stop.title", "Stop Inlay Hints Reading"),
      precondition: InlayHintsAccessibility.IsReading,
      f1: true,
      keybinding: {
        weight: KeybindingWeight.EditorContrib,
        primary: KeyCode.Escape
      }
    });
  }
  runEditorCommand(_accessor, editor) {
    const ctrl = InlayHintsAccessibility.get(editor);
    ctrl?.stopInlayHintsReading();
  }
});
registerEditorContribution(InlayHintsAccessibility.ID, InlayHintsAccessibility, EditorContributionInstantiation.Lazy);
export {
  InlayHintsAccessibility
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lubGF5SGludHMvYnJvd3Nlci9pbmxheUhpbnRzQWNjZXNzaWJpbHR5LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yQWN0aW9uMiwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbiwgcmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgSW5sYXlIaW50SXRlbSwgYXNDb21tYW5kTGluayB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGF5SGludHMvYnJvd3Nlci9pbmxheUhpbnRzLmpzJztcbmltcG9ydCB7IElubGF5SGludHNDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaW5sYXlIaW50cy9icm93c2VyL2lubGF5SGludHNDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBMaW5rIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2Jyb3dzZXIvbGluay5qcyc7XG5cblxuZXhwb3J0IGNsYXNzIElubGF5SGludHNBY2Nlc3NpYmlsaXR5IGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElzUmVhZGluZyA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdpc1JlYWRpbmdMaW5lV2l0aElubGF5SGludHMnLCBmYWxzZSwgeyB0eXBlOiAnYm9vbGVhbicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaXNSZWFkaW5nTGluZVdpdGhJbmxheUhpbnRzJywgXCJXaGV0aGVyIHRoZSBjdXJyZW50IGxpbmUgYW5kIGl0cyBpbmxheSBoaW50cyBhcmUgY3VycmVudGx5IGZvY3VzZWRcIikgfSk7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEOiBzdHJpbmcgPSAnZWRpdG9yLmNvbnRyaWIuSW5sYXlIaW50c0FjY2Vzc2liaWxpdHknO1xuXG5cdHN0YXRpYyBnZXQoZWRpdG9yOiBJQ29kZUVkaXRvcik6IElubGF5SGludHNBY2Nlc3NpYmlsaXR5IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gZWRpdG9yLmdldENvbnRyaWJ1dGlvbjxJbmxheUhpbnRzQWNjZXNzaWJpbGl0eT4oSW5sYXlIaW50c0FjY2Vzc2liaWxpdHkuSUQpID8/IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FyaWFFbGVtZW50OiBIVE1MU3BhbkVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2N0eElzUmVhZGluZzogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbkRpc3Bvb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YVNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fYXJpYUVsZW1lbnQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0dGhpcy5fYXJpYUVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAnZml4ZWQnO1xuXHRcdHRoaXMuX2FyaWFFbGVtZW50LmNsYXNzTmFtZSA9ICdpbmxheWhpbnQtYWNjZXNzaWJpbGl0eS1lbGVtZW50Jztcblx0XHR0aGlzLl9hcmlhRWxlbWVudC50YWJJbmRleCA9IDA7XG5cdFx0dGhpcy5fYXJpYUVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWRlc2NyaXB0aW9uJywgbG9jYWxpemUoJ2Rlc2NyaXB0aW9uJywgXCJDb2RlIHdpdGggSW5sYXkgSGludCBJbmZvcm1hdGlvblwiKSk7XG5cblx0XHR0aGlzLl9jdHhJc1JlYWRpbmcgPSBJbmxheUhpbnRzQWNjZXNzaWJpbGl0eS5Jc1JlYWRpbmcuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY3R4SXNSZWFkaW5nLnJlc2V0KCk7XG5cdFx0dGhpcy5fYXJpYUVsZW1lbnQucmVtb3ZlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZXNldCgpOiB2b2lkIHtcblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuX2FyaWFFbGVtZW50KTtcblx0XHR0aGlzLl9zZXNzaW9uRGlzcG9vc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fY3R4SXNSZWFkaW5nLnJlc2V0KCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWFkKGxpbmU6IG51bWJlciwgaGludHM6IElubGF5SGludEl0ZW1bXSkge1xuXG5cdFx0dGhpcy5fc2Vzc2lvbkRpc3Bvb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0aWYgKCF0aGlzLl9hcmlhRWxlbWVudC5pc0Nvbm5lY3RlZCkge1xuXHRcdFx0dGhpcy5fZWRpdG9yLmdldERvbU5vZGUoKT8uYXBwZW5kQ2hpbGQodGhpcy5fYXJpYUVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkgfHwgIXRoaXMuX2FyaWFFbGVtZW50LmlzQ29ubmVjdGVkKSB7XG5cdFx0XHR0aGlzLl9jdHhJc1JlYWRpbmcuc2V0KGZhbHNlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl9zZXNzaW9uRGlzcG9vc2FibGVzLmFkZChjdHMpO1xuXG5cdFx0Zm9yIChjb25zdCBoaW50IG9mIGhpbnRzKSB7XG5cdFx0XHRhd2FpdCBoaW50LnJlc29sdmUoY3RzLnRva2VuKTtcblx0XHR9XG5cblx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0Ly8gY29uc3QgdGV4dCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLmdldExpbmVDb250ZW50KGxpbmUpO1xuXHRcdGNvbnN0IG5ld0NoaWxkcmVuOiAoc3RyaW5nIHwgSFRNTEVsZW1lbnQpW10gPSBbXTtcblxuXHRcdGxldCBzdGFydCA9IDA7XG5cdFx0bGV0IHRvb0xvbmdUb1JlYWQgPSBmYWxzZTtcblxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBoaW50cykge1xuXG5cdFx0XHQvLyB0ZXh0XG5cdFx0XHRjb25zdCBwYXJ0ID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKHsgc3RhcnRMaW5lTnVtYmVyOiBsaW5lLCBzdGFydENvbHVtbjogc3RhcnQgKyAxLCBlbmRMaW5lTnVtYmVyOiBsaW5lLCBlbmRDb2x1bW46IGl0ZW0uaGludC5wb3NpdGlvbi5jb2x1bW4gfSk7XG5cdFx0XHRpZiAocGFydC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdG5ld0NoaWxkcmVuLnB1c2gocGFydCk7XG5cdFx0XHRcdHN0YXJ0ID0gaXRlbS5oaW50LnBvc2l0aW9uLmNvbHVtbiAtIDE7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGNoZWNrIGxlbmd0aFxuXHRcdFx0aWYgKHN0YXJ0ID4gNzUwKSB7XG5cdFx0XHRcdG5ld0NoaWxkcmVuLnB1c2goJ1x1MjAyNicpO1xuXHRcdFx0XHR0b29Mb25nVG9SZWFkID0gdHJ1ZTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGhpbnRcblx0XHRcdGNvbnN0IGVtID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZW0nKTtcblx0XHRcdGNvbnN0IHsgbGFiZWwgfSA9IGl0ZW0uaGludDtcblx0XHRcdGlmICh0eXBlb2YgbGFiZWwgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGVtLmlubmVyVGV4dCA9IGxhYmVsO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIGxhYmVsKSB7XG5cdFx0XHRcdFx0aWYgKHBhcnQuY29tbWFuZCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGluayA9IHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShMaW5rLCBlbSxcblx0XHRcdFx0XHRcdFx0eyBocmVmOiBhc0NvbW1hbmRMaW5rKHBhcnQuY29tbWFuZCksIGxhYmVsOiBwYXJ0LmxhYmVsLCB0aXRsZTogcGFydC5jb21tYW5kLnRpdGxlIH0sXG5cdFx0XHRcdFx0XHRcdHVuZGVmaW5lZFxuXHRcdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRcdHRoaXMuX3Nlc3Npb25EaXNwb29zYWJsZXMuYWRkKGxpbmspO1xuXG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGVtLmlubmVyVGV4dCArPSBwYXJ0LmxhYmVsO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0bmV3Q2hpbGRyZW4ucHVzaChlbSk7XG5cdFx0fVxuXG5cdFx0Ly8gdHJhaWxpbmcgdGV4dFxuXHRcdGlmICghdG9vTG9uZ1RvUmVhZCkge1xuXHRcdFx0bmV3Q2hpbGRyZW4ucHVzaChtb2RlbC5nZXRWYWx1ZUluUmFuZ2UoeyBzdGFydExpbmVOdW1iZXI6IGxpbmUsIHN0YXJ0Q29sdW1uOiBzdGFydCArIDEsIGVuZExpbmVOdW1iZXI6IGxpbmUsIGVuZENvbHVtbjogTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVIgfSkpO1xuXHRcdH1cblxuXHRcdGRvbS5yZXNldCh0aGlzLl9hcmlhRWxlbWVudCwgLi4ubmV3Q2hpbGRyZW4pO1xuXHRcdHRoaXMuX2FyaWFFbGVtZW50LmZvY3VzKCk7XG5cdFx0dGhpcy5fY3R4SXNSZWFkaW5nLnNldCh0cnVlKTtcblxuXHRcdC8vIHJlc2V0IG9uIGJsdXJcblx0XHR0aGlzLl9zZXNzaW9uRGlzcG9vc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2FyaWFFbGVtZW50LCAnZm9jdXNvdXQnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9yZXNldCgpO1xuXHRcdH0pKTtcblx0fVxuXG5cblxuXHRzdGFydElubGF5SGludHNSZWFkaW5nKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGluZSA9IHRoaXMuX2VkaXRvci5nZXRQb3NpdGlvbigpLmxpbmVOdW1iZXI7XG5cdFx0Y29uc3QgaGludHMgPSBJbmxheUhpbnRzQ29udHJvbGxlci5nZXQodGhpcy5fZWRpdG9yKT8uZ2V0SW5sYXlIaW50c0ZvckxpbmUobGluZSk7XG5cdFx0aWYgKCFoaW50cyB8fCBoaW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5ub0lubGF5SGludHMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9yZWFkKGxpbmUsIGhpbnRzKTtcblx0XHR9XG5cdH1cblxuXHRzdG9wSW5sYXlIaW50c1JlYWRpbmcoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVzZXQoKTtcblx0XHR0aGlzLl9lZGl0b3IuZm9jdXMoKTtcblx0fVxufVxuXG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTdGFydFJlYWRIaW50cyBleHRlbmRzIEVkaXRvckFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnaW5sYXlIaW50cy5zdGFydFJlYWRpbmdMaW5lV2l0aEhpbnQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVhZC50aXRsZScsIFwiUmVhZCBMaW5lIHdpdGggSW5sYXkgSGludHNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLmhhc0lubGF5SGludHNQcm92aWRlcixcblx0XHRcdGYxOiB0cnVlXG5cdFx0fSk7XG5cdH1cblxuXHRydW5FZGl0b3JDb21tYW5kKF9hY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcikge1xuXHRcdGNvbnN0IGN0cmwgPSBJbmxheUhpbnRzQWNjZXNzaWJpbGl0eS5nZXQoZWRpdG9yKTtcblx0XHRjdHJsPy5zdGFydElubGF5SGludHNSZWFkaW5nKCk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgU3RvcFJlYWRIaW50cyBleHRlbmRzIEVkaXRvckFjdGlvbjIge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnaW5sYXlIaW50cy5zdG9wUmVhZGluZ0xpbmVXaXRoSGludCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdzdG9wLnRpdGxlJywgXCJTdG9wIElubGF5IEhpbnRzIFJlYWRpbmdcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IElubGF5SGludHNBY2Nlc3NpYmlsaXR5LklzUmVhZGluZyxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGVcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bkVkaXRvckNvbW1hbmQoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKSB7XG5cdFx0Y29uc3QgY3RybCA9IElubGF5SGludHNBY2Nlc3NpYmlsaXR5LmdldChlZGl0b3IpO1xuXHRcdGN0cmw/LnN0b3BJbmxheUhpbnRzUmVhZGluZygpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24oSW5sYXlIaW50c0FjY2Vzc2liaWxpdHkuSUQsIElubGF5SGludHNBY2Nlc3NpYmlsaXR5LCBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLkxhenkpO1xuIl0s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
