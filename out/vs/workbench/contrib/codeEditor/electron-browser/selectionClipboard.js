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
import { Disposable } from "../../../../base/common/lifecycle.js";
import * as platform from "../../../../base/common/platform.js";
import { registerEditorContribution, EditorAction, registerEditorAction, EditorContributionInstantiation } from "../../../../editor/browser/editorExtensions.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Range } from "../../../../editor/common/core/range.js";
import { Handler } from "../../../../editor/common/editorCommon.js";
import { EndOfLinePreference } from "../../../../editor/common/model.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { SelectionClipboardContributionID } from "../browser/selectionClipboard.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { EditorContextKeys } from "../../../../editor/common/editorContextKeys.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { Event } from "../../../../base/common/event.js";
import { addDisposableListener, onDidRegisterWindow } from "../../../../base/browser/dom.js";
let SelectionClipboard = class extends Disposable {
  constructor(editor, clipboardService) {
    super();
    if (platform.isLinux) {
      let isEnabled = editor.getOption(EditorOption.selectionClipboard);
      this._register(editor.onDidChangeConfiguration((e) => {
        if (e.hasChanged(EditorOption.selectionClipboard)) {
          isEnabled = editor.getOption(EditorOption.selectionClipboard);
        }
      }));
      const setSelectionToClipboard = this._register(new RunOnceScheduler(() => {
        if (!editor.hasModel()) {
          return;
        }
        const model = editor.getModel();
        let selections = editor.getSelections();
        selections = selections.slice(0);
        selections.sort(Range.compareRangesUsingStarts);
        let resultLength = 0;
        for (const sel of selections) {
          if (sel.isEmpty()) {
            return;
          }
          resultLength += model.getValueLengthInRange(sel);
        }
        if (resultLength > SelectionClipboard.SELECTION_LENGTH_LIMIT) {
          return;
        }
        const result = [];
        for (const sel of selections) {
          result.push(model.getValueInRange(sel, EndOfLinePreference.TextDefined));
        }
        const textToCopy = result.join(model.getEOL());
        clipboardService.writeText(textToCopy, "selection");
      }, 100));
      this._register(editor.onDidChangeCursorSelection((e) => {
        if (!isEnabled) {
          return;
        }
        if (e.source === "restoreState") {
          return;
        }
        setSelectionToClipboard.schedule();
      }));
    }
  }
};
SelectionClipboard.SELECTION_LENGTH_LIMIT = 65536;
SelectionClipboard = __decorateClass([
  __decorateParam(1, IClipboardService)
], SelectionClipboard);
let LinuxSelectionClipboardPastePreventer = class extends Disposable {
  constructor(configurationService) {
    super();
    this._register(Event.runAndSubscribe(onDidRegisterWindow, ({ window, disposables }) => {
      disposables.add(addDisposableListener(window.document, "mouseup", (e) => {
        if (e.button === 1) {
          const config = configurationService.getValue("editor");
          if (!config.selectionClipboard) {
            e.preventDefault();
          }
        }
      }));
    }, { window: mainWindow, disposables: this._store }));
  }
};
LinuxSelectionClipboardPastePreventer.ID = "workbench.contrib.linuxSelectionClipboardPastePreventer";
LinuxSelectionClipboardPastePreventer = __decorateClass([
  __decorateParam(0, IConfigurationService)
], LinuxSelectionClipboardPastePreventer);
class PasteSelectionClipboardAction extends EditorAction {
  constructor() {
    super({
      id: "editor.action.selectionClipboardPaste",
      label: nls.localize2("actions.pasteSelectionClipboard", "Paste Selection Clipboard"),
      precondition: EditorContextKeys.writable
    });
  }
  async run(accessor, editor, args) {
    const clipboardService = accessor.get(IClipboardService);
    const text = await clipboardService.readText("selection");
    editor.trigger("keyboard", Handler.Paste, {
      text,
      pasteOnNewLine: false,
      multicursorText: null
    });
  }
}
registerEditorContribution(SelectionClipboardContributionID, SelectionClipboard, EditorContributionInstantiation.Eager);
if (platform.isLinux) {
  registerWorkbenchContribution2(LinuxSelectionClipboardPastePreventer.ID, LinuxSelectionClipboardPastePreventer, WorkbenchPhase.BlockRestore);
  registerEditorAction(PasteSelectionClipboardAction);
}
export {
  SelectionClipboard
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvZWxlY3Ryb24tYnJvd3Nlci9zZWxlY3Rpb25DbGlwYm9hcmQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiwgRWRpdG9yQWN0aW9uLCBTZXJ2aWNlc0FjY2Vzc29yLCByZWdpc3RlckVkaXRvckFjdGlvbiwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvbkNoYW5nZWRFdmVudCwgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ3Vyc29yU2VsZWN0aW9uQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jdXJzb3JFdmVudHMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiwgSGFuZGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVuZE9mTGluZVByZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElDbGlwYm9hcmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY2xpcGJvYXJkL2NvbW1vbi9jbGlwYm9hcmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbkNsaXBib2FyZENvbnRyaWJ1dGlvbklEIH0gZnJvbSAnLi4vYnJvd3Nlci9zZWxlY3Rpb25DbGlwYm9hcmQuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UsIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRWRpdG9yQ29udGV4dEtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBvbkRpZFJlZ2lzdGVyV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBTZWxlY3Rpb25DbGlwYm9hcmQgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNFTEVDVElPTl9MRU5HVEhfTElNSVQgPSA2NTUzNjtcblxuXHRjb25zdHJ1Y3RvcihlZGl0b3I6IElDb2RlRWRpdG9yLCBASUNsaXBib2FyZFNlcnZpY2UgY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0aWYgKHBsYXRmb3JtLmlzTGludXgpIHtcblx0XHRcdGxldCBpc0VuYWJsZWQgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zZWxlY3Rpb25DbGlwYm9hcmQpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihlZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlOiBDb25maWd1cmF0aW9uQ2hhbmdlZEV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmIChlLmhhc0NoYW5nZWQoRWRpdG9yT3B0aW9uLnNlbGVjdGlvbkNsaXBib2FyZCkpIHtcblx0XHRcdFx0XHRpc0VuYWJsZWQgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5zZWxlY3Rpb25DbGlwYm9hcmQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGNvbnN0IHNldFNlbGVjdGlvblRvQ2xpcGJvYXJkID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4ge1xuXHRcdFx0XHRpZiAoIWVkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0XHRcdGxldCBzZWxlY3Rpb25zID0gZWRpdG9yLmdldFNlbGVjdGlvbnMoKTtcblx0XHRcdFx0c2VsZWN0aW9ucyA9IHNlbGVjdGlvbnMuc2xpY2UoMCk7XG5cdFx0XHRcdHNlbGVjdGlvbnMuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpO1xuXG5cdFx0XHRcdGxldCByZXN1bHRMZW5ndGggPSAwO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNlbCBvZiBzZWxlY3Rpb25zKSB7XG5cdFx0XHRcdFx0aWYgKHNlbC5pc0VtcHR5KCkpIHtcblx0XHRcdFx0XHRcdC8vIE9ubHkgd3JpdGUgaWYgYWxsIGN1cnNvcnMgaGF2ZSBzZWxlY3Rpb25cblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmVzdWx0TGVuZ3RoICs9IG1vZGVsLmdldFZhbHVlTGVuZ3RoSW5SYW5nZShzZWwpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHJlc3VsdExlbmd0aCA+IFNlbGVjdGlvbkNsaXBib2FyZC5TRUxFQ1RJT05fTEVOR1RIX0xJTUlUKSB7XG5cdFx0XHRcdFx0Ly8gVGhpcyBpcyBhIGxhcmdlIHNlbGVjdGlvbiFcblx0XHRcdFx0XHQvLyA9PiBkbyBub3Qgd3JpdGUgaXQgdG8gdGhlIHNlbGVjdGlvbiBjbGlwYm9hcmRcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3Qgc2VsIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaChtb2RlbC5nZXRWYWx1ZUluUmFuZ2Uoc2VsLCBFbmRPZkxpbmVQcmVmZXJlbmNlLlRleHREZWZpbmVkKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB0ZXh0VG9Db3B5ID0gcmVzdWx0LmpvaW4obW9kZWwuZ2V0RU9MKCkpO1xuXHRcdFx0XHRjbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dCh0ZXh0VG9Db3B5LCAnc2VsZWN0aW9uJyk7XG5cdFx0XHR9LCAxMDApKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZWRpdG9yLm9uRGlkQ2hhbmdlQ3Vyc29yU2VsZWN0aW9uKChlOiBJQ3Vyc29yU2VsZWN0aW9uQ2hhbmdlZEV2ZW50KSA9PiB7XG5cdFx0XHRcdGlmICghaXNFbmFibGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLnNvdXJjZSA9PT0gJ3Jlc3RvcmVTdGF0ZScpIHtcblx0XHRcdFx0XHQvLyBkbyBub3Qgc2V0IHNlbGVjdGlvbiB0byBjbGlwYm9hcmQgaWYgdGhpcyBzZWxlY3Rpb24gY2hhbmdlXG5cdFx0XHRcdFx0Ly8gd2FzIGNhdXNlZCBieSByZXN0b3JpbmcgZWRpdG9ycy4uLlxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZXRTZWxlY3Rpb25Ub0NsaXBib2FyZC5zY2hlZHVsZSgpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG59XG5cbmNsYXNzIExpbnV4U2VsZWN0aW9uQ2xpcGJvYXJkUGFzdGVQcmV2ZW50ZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmxpbnV4U2VsZWN0aW9uQ2xpcGJvYXJkUGFzdGVQcmV2ZW50ZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKG9uRGlkUmVnaXN0ZXJXaW5kb3csICh7IHdpbmRvdywgZGlzcG9zYWJsZXMgfSkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih3aW5kb3cuZG9jdW1lbnQsICdtb3VzZXVwJywgZSA9PiB7XG5cdFx0XHRcdGlmIChlLmJ1dHRvbiA9PT0gMSkge1xuXHRcdFx0XHRcdC8vIG1pZGRsZSBidXR0b25cblx0XHRcdFx0XHRjb25zdCBjb25maWcgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx7IHNlbGVjdGlvbkNsaXBib2FyZDogYm9vbGVhbiB9PignZWRpdG9yJyk7XG5cdFx0XHRcdFx0aWYgKCFjb25maWcuc2VsZWN0aW9uQ2xpcGJvYXJkKSB7XG5cdFx0XHRcdFx0XHQvLyBzZWxlY3Rpb24gY2xpcGJvYXJkIGlzIGRpc2FibGVkXG5cdFx0XHRcdFx0XHQvLyB0cnkgdG8gc3RvcCB0aGUgdXBjb21pbmcgcGFzdGVcblx0XHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9LCB7IHdpbmRvdzogbWFpbldpbmRvdywgZGlzcG9zYWJsZXM6IHRoaXMuX3N0b3JlIH0pKTtcblx0fVxufVxuXG5jbGFzcyBQYXN0ZVNlbGVjdGlvbkNsaXBib2FyZEFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLnNlbGVjdGlvbkNsaXBib2FyZFBhc3RlJyxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKCdhY3Rpb25zLnBhc3RlU2VsZWN0aW9uQ2xpcGJvYXJkJywgXCJQYXN0ZSBTZWxlY3Rpb24gQ2xpcGJvYXJkXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy53cml0YWJsZVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogdW5rbm93bik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNsaXBib2FyZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNsaXBib2FyZFNlcnZpY2UpO1xuXG5cdFx0Ly8gcmVhZCBzZWxlY3Rpb24gY2xpcGJvYXJkXG5cdFx0Y29uc3QgdGV4dCA9IGF3YWl0IGNsaXBib2FyZFNlcnZpY2UucmVhZFRleHQoJ3NlbGVjdGlvbicpO1xuXG5cdFx0ZWRpdG9yLnRyaWdnZXIoJ2tleWJvYXJkJywgSGFuZGxlci5QYXN0ZSwge1xuXHRcdFx0dGV4dDogdGV4dCxcblx0XHRcdHBhc3RlT25OZXdMaW5lOiBmYWxzZSxcblx0XHRcdG11bHRpY3Vyc29yVGV4dDogbnVsbFxuXHRcdH0pO1xuXHR9XG59XG5cbnJlZ2lzdGVyRWRpdG9yQ29udHJpYnV0aW9uKFNlbGVjdGlvbkNsaXBib2FyZENvbnRyaWJ1dGlvbklELCBTZWxlY3Rpb25DbGlwYm9hcmQsIEVkaXRvckNvbnRyaWJ1dGlvbkluc3RhbnRpYXRpb24uRWFnZXIpOyAvLyBlYWdlciBiZWNhdXNlIGl0IG5lZWRzIHRvIGxpc3RlbiB0byBzZWxlY3Rpb24gY2hhbmdlIGV2ZW50c1xuaWYgKHBsYXRmb3JtLmlzTGludXgpIHtcblx0cmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKExpbnV4U2VsZWN0aW9uQ2xpcGJvYXJkUGFzdGVQcmV2ZW50ZXIuSUQsIExpbnV4U2VsZWN0aW9uQ2xpcGJvYXJkUGFzdGVQcmV2ZW50ZXIsIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7IC8vIGVhZ2VyIGJlY2F1c2UgaXQgbGlzdGVucyB0byBtb3VzZS11cCBldmVudHMgZ2xvYmFsbHlcblx0cmVnaXN0ZXJFZGl0b3JBY3Rpb24oUGFzdGVTZWxlY3Rpb25DbGlwYm9hcmRBY3Rpb24pO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQkFBa0I7QUFDM0IsWUFBWSxjQUFjO0FBRTFCLFNBQVMsNEJBQTRCLGNBQWdDLHNCQUFzQix1Q0FBdUM7QUFDbEksU0FBb0Msb0JBQW9CO0FBRXhELFNBQVMsYUFBYTtBQUN0QixTQUE4QixlQUFlO0FBQzdDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQWlDLGdCQUFnQixzQ0FBc0M7QUFDdkYsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsdUJBQXVCLDJCQUEyQjtBQUVwRCxJQUFNLHFCQUFOLGNBQWlDLFdBQTBDO0FBQUEsRUFHakYsWUFBWSxRQUF3QyxrQkFBcUM7QUFDeEYsVUFBTTtBQUVOLFFBQUksU0FBUyxTQUFTO0FBQ3JCLFVBQUksWUFBWSxPQUFPLFVBQVUsYUFBYSxrQkFBa0I7QUFFaEUsV0FBSyxVQUFVLE9BQU8seUJBQXlCLENBQUMsTUFBaUM7QUFDaEYsWUFBSSxFQUFFLFdBQVcsYUFBYSxrQkFBa0IsR0FBRztBQUNsRCxzQkFBWSxPQUFPLFVBQVUsYUFBYSxrQkFBa0I7QUFBQSxRQUM3RDtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBRUYsWUFBTSwwQkFBMEIsS0FBSyxVQUFVLElBQUksaUJBQWlCLE1BQU07QUFDekUsWUFBSSxDQUFDLE9BQU8sU0FBUyxHQUFHO0FB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
