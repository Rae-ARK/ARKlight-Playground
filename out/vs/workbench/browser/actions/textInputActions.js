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
import { Separator, toAction } from "../../../base/common/actions.js";
import { localize } from "../../../nls.js";
import { IWorkbenchLayoutService } from "../../services/layout/browser/layoutService.js";
import { IContextMenuService } from "../../../platform/contextview/browser/contextView.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { EventHelper, addDisposableListener, getActiveDocument, getWindow, isHTMLInputElement, isHTMLTextAreaElement } from "../../../base/browser/dom.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../common/contributions.js";
import { IClipboardService } from "../../../platform/clipboard/common/clipboardService.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { Event as BaseEvent } from "../../../base/common/event.js";
import { Lazy } from "../../../base/common/lazy.js";
import { ILogService } from "../../../platform/log/common/log.js";
function createTextInputActions(clipboardService, logService) {
  return [
    toAction({ id: "undo", label: localize("undo", "Undo"), run: () => getActiveDocument().execCommand("undo") }),
    toAction({ id: "redo", label: localize("redo", "Redo"), run: () => getActiveDocument().execCommand("redo") }),
    new Separator(),
    toAction({
      id: "editor.action.clipboardCutAction",
      label: localize("cut", "Cut"),
      run: () => {
        logService.trace("TextInputActionsProvider#cut");
        getActiveDocument().execCommand("cut");
      }
    }),
    toAction({
      id: "editor.action.clipboardCopyAction",
      label: localize("copy", "Copy"),
      run: () => {
        logService.trace("TextInputActionsProvider#copy");
        getActiveDocument().execCommand("copy");
      }
    }),
    toAction({
      id: "editor.action.clipboardPasteAction",
      label: localize("paste", "Paste"),
      run: async (element) => {
        logService.trace("TextInputActionsProvider#paste");
        const clipboardText = await clipboardService.readText();
        if (isHTMLTextAreaElement(element) || isHTMLInputElement(element)) {
          const selectionStart = element.selectionStart || 0;
          const selectionEnd = element.selectionEnd || 0;
          element.value = `${element.value.substring(0, selectionStart)}${clipboardText}${element.value.substring(selectionEnd, element.value.length)}`;
          element.selectionStart = selectionStart + clipboardText.length;
          element.selectionEnd = element.selectionStart;
          element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
        }
      }
    }),
    new Separator(),
    toAction({ id: "editor.action.selectAll", label: localize("selectAll", "Select All"), run: () => getActiveDocument().execCommand("selectAll") })
  ];
}
let TextInputActionsProvider = class extends Disposable {
  constructor(layoutService, contextMenuService, clipboardService, logService) {
    super();
    this.layoutService = layoutService;
    this.contextMenuService = contextMenuService;
    this.clipboardService = clipboardService;
    this.logService = logService;
    this.textInputActions = new Lazy(() => createTextInputActions(this.clipboardService, this.logService));
    this.registerListeners();
  }
  registerListeners() {
    this._register(BaseEvent.runAndSubscribe(this.layoutService.onDidAddContainer, ({ container, disposables }) => {
      disposables.add(addDisposableListener(container, "contextmenu", (e) => this.onContextMenu(getWindow(container), e)));
    }, { container: this.layoutService.mainContainer, disposables: this._store }));
  }
  onContextMenu(targetWindow, e) {
    if (e.defaultPrevented) {
      return;
    }
    const target = e.target;
    if (!isHTMLTextAreaElement(target) && !isHTMLInputElement(target)) {
      return;
    }
    EventHelper.stop(e, true);
    const event = new StandardMouseEvent(targetWindow, e);
    this.contextMenuService.showContextMenu({
      getAnchor: () => event,
      getActions: () => this.textInputActions.value,
      getActionsContext: () => target
    });
  }
};
TextInputActionsProvider.ID = "workbench.contrib.textInputActionsProvider";
TextInputActionsProvider = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IClipboardService),
  __decorateParam(3, ILogService)
], TextInputActionsProvider);
registerWorkbenchContribution2(
  TextInputActionsProvider.ID,
  TextInputActionsProvider,
  WorkbenchPhase.BlockRestore
  // Block to allow right-click into input fields before restore finished
);
export {
  TextInputActionsProvider,
  createTextInputActions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL2FjdGlvbnMvdGV4dElucHV0QWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElBY3Rpb24sIFNlcGFyYXRvciwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEV2ZW50SGVscGVyLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIGdldEFjdGl2ZURvY3VtZW50LCBnZXRXaW5kb3csIGlzSFRNTElucHV0RWxlbWVudCwgaXNIVE1MVGV4dEFyZWFFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgRXZlbnQgYXMgQmFzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVUZXh0SW5wdXRBY3Rpb25zKGNsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLCBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSk6IElBY3Rpb25bXSB7XG5cdHJldHVybiBbXG5cblx0XHR0b0FjdGlvbih7IGlkOiAndW5kbycsIGxhYmVsOiBsb2NhbGl6ZSgndW5kbycsIFwiVW5kb1wiKSwgcnVuOiAoKSA9PiBnZXRBY3RpdmVEb2N1bWVudCgpLmV4ZWNDb21tYW5kKCd1bmRvJykgfSksXG5cdFx0dG9BY3Rpb24oeyBpZDogJ3JlZG8nLCBsYWJlbDogbG9jYWxpemUoJ3JlZG8nLCBcIlJlZG9cIiksIHJ1bjogKCkgPT4gZ2V0QWN0aXZlRG9jdW1lbnQoKS5leGVjQ29tbWFuZCgncmVkbycpIH0pLFxuXHRcdG5ldyBTZXBhcmF0b3IoKSxcblx0XHR0b0FjdGlvbih7XG5cdFx0XHRpZDogJ2VkaXRvci5hY3Rpb24uY2xpcGJvYXJkQ3V0QWN0aW9uJywgbGFiZWw6IGxvY2FsaXplKCdjdXQnLCBcIkN1dFwiKSwgcnVuOiAoKSA9PiB7XG5cdFx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoJ1RleHRJbnB1dEFjdGlvbnNQcm92aWRlciNjdXQnKTtcblx0XHRcdFx0Z2V0QWN0aXZlRG9jdW1lbnQoKS5leGVjQ29tbWFuZCgnY3V0Jyk7XG5cdFx0XHR9XG5cdFx0fSksXG5cdFx0dG9BY3Rpb24oe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmNsaXBib2FyZENvcHlBY3Rpb24nLCBsYWJlbDogbG9jYWxpemUoJ2NvcHknLCBcIkNvcHlcIiksIHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdUZXh0SW5wdXRBY3Rpb25zUHJvdmlkZXIjY29weScpO1xuXHRcdFx0XHRnZXRBY3RpdmVEb2N1bWVudCgpLmV4ZWNDb21tYW5kKCdjb3B5Jyk7XG5cdFx0XHR9XG5cdFx0fSksXG5cdFx0dG9BY3Rpb24oe1xuXHRcdFx0aWQ6ICdlZGl0b3IuYWN0aW9uLmNsaXBib2FyZFBhc3RlQWN0aW9uJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncGFzdGUnLCBcIlBhc3RlXCIpLFxuXHRcdFx0cnVuOiBhc3luYyAoZWxlbWVudDogdW5rbm93bikgPT4ge1xuXHRcdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKCdUZXh0SW5wdXRBY3Rpb25zUHJvdmlkZXIjcGFzdGUnKTtcblx0XHRcdFx0Y29uc3QgY2xpcGJvYXJkVGV4dCA9IGF3YWl0IGNsaXBib2FyZFNlcnZpY2UucmVhZFRleHQoKTtcblx0XHRcdFx0aWYgKGlzSFRNTFRleHRBcmVhRWxlbWVudChlbGVtZW50KSB8fCBpc0hUTUxJbnB1dEVsZW1lbnQoZWxlbWVudCkpIHtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb25TdGFydCA9IGVsZW1lbnQuc2VsZWN0aW9uU3RhcnQgfHwgMDtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb25FbmQgPSBlbGVtZW50LnNlbGVjdGlvbkVuZCB8fCAwO1xuXG5cdFx0XHRcdFx0ZWxlbWVudC52YWx1ZSA9IGAke2VsZW1lbnQudmFsdWUuc3Vic3RyaW5nKDAsIHNlbGVjdGlvblN0YXJ0KX0ke2NsaXBib2FyZFRleHR9JHtlbGVtZW50LnZhbHVlLnN1YnN0cmluZyhzZWxlY3Rpb25FbmQsIGVsZW1lbnQudmFsdWUubGVuZ3RoKX1gO1xuXHRcdFx0XHRcdGVsZW1lbnQuc2VsZWN0aW9uU3RhcnQgPSBzZWxlY3Rpb25TdGFydCArIGNsaXBib2FyZFRleHQubGVuZ3RoO1xuXHRcdFx0XHRcdGVsZW1lbnQuc2VsZWN0aW9uRW5kID0gZWxlbWVudC5zZWxlY3Rpb25TdGFydDtcblx0XHRcdFx0XHRlbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IEV2ZW50KCdpbnB1dCcsIHsgYnViYmxlczogdHJ1ZSwgY2FuY2VsYWJsZTogdHJ1ZSB9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSxcblx0XHRuZXcgU2VwYXJhdG9yKCksXG5cdFx0dG9BY3Rpb24oeyBpZDogJ2VkaXRvci5hY3Rpb24uc2VsZWN0QWxsJywgbGFiZWw6IGxvY2FsaXplKCdzZWxlY3RBbGwnLCBcIlNlbGVjdCBBbGxcIiksIHJ1bjogKCkgPT4gZ2V0QWN0aXZlRG9jdW1lbnQoKS5leGVjQ29tbWFuZCgnc2VsZWN0QWxsJykgfSlcblx0XTtcbn1cblxuZXhwb3J0IGNsYXNzIFRleHRJbnB1dEFjdGlvbnNQcm92aWRlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIudGV4dElucHV0QWN0aW9uc1Byb3ZpZGVyJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IHRleHRJbnB1dEFjdGlvbnMgPSBuZXcgTGF6eTxJQWN0aW9uW10+KCgpID0+IGNyZWF0ZVRleHRJbnB1dEFjdGlvbnModGhpcy5jbGlwYm9hcmRTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIENvbnRleHQgbWVudSBzdXBwb3J0IGluIGlucHV0L3RleHRhcmVhXG5cdFx0dGhpcy5fcmVnaXN0ZXIoQmFzZUV2ZW50LnJ1bkFuZFN1YnNjcmliZSh0aGlzLmxheW91dFNlcnZpY2Uub25EaWRBZGRDb250YWluZXIsICh7IGNvbnRhaW5lciwgZGlzcG9zYWJsZXMgfSkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb250YWluZXIsICdjb250ZXh0bWVudScsIGUgPT4gdGhpcy5vbkNvbnRleHRNZW51KGdldFdpbmRvdyhjb250YWluZXIpLCBlKSkpO1xuXHRcdH0sIHsgY29udGFpbmVyOiB0aGlzLmxheW91dFNlcnZpY2UubWFpbkNvbnRhaW5lciwgZGlzcG9zYWJsZXM6IHRoaXMuX3N0b3JlIH0pKTtcblx0fVxuXG5cdHByaXZhdGUgb25Db250ZXh0TWVudSh0YXJnZXRXaW5kb3c6IFdpbmRvdywgZTogTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLmRlZmF1bHRQcmV2ZW50ZWQpIHtcblx0XHRcdHJldHVybjsgLy8gbWFrZSBzdXJlIHRvIG5vdCBzaG93IHRoZXNlIGFjdGlvbnMgYnkgYWNjaWRlbnQgaWYgY29tcG9uZW50IGluZGljYXRlZCB0byBwcmV2ZW50XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQ7XG5cdFx0aWYgKCFpc0hUTUxUZXh0QXJlYUVsZW1lbnQodGFyZ2V0KSAmJiAhaXNIVE1MSW5wdXRFbGVtZW50KHRhcmdldCkpIHtcblx0XHRcdHJldHVybjsgLy8gb25seSBmb3IgaW5wdXRzIG9yIHRleHRhcmVhc1xuXHRcdH1cblxuXHRcdEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQodGFyZ2V0V2luZG93LCBlKTtcblxuXHRcdHRoaXMuY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGV2ZW50LFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gdGhpcy50ZXh0SW5wdXRBY3Rpb25zLnZhbHVlLFxuXHRcdFx0Z2V0QWN0aW9uc0NvbnRleHQ6ICgpID0+IHRhcmdldCxcblx0XHR9KTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoXG5cdFRleHRJbnB1dEFjdGlvbnNQcm92aWRlci5JRCxcblx0VGV4dElucHV0QWN0aW9uc1Byb3ZpZGVyLFxuXHRXb3JrYmVuY2hQaGFzZS5CbG9ja1Jlc3RvcmUgLy8gQmxvY2sgdG8gYWxsb3cgcmlnaHQtY2xpY2sgaW50byBpbnB1dCBmaWVsZHMgYmVmb3JlIHJlc3RvcmUgZmluaXNoZWRcbik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQWtCLFdBQVcsZ0JBQWdCO0FBQzdDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsYUFBYSx1QkFBdUIsbUJBQW1CLFdBQVcsb0JBQW9CLDZCQUE2QjtBQUM1SCxTQUFpQyxnQkFBZ0Isc0NBQXNDO0FBQ3ZGLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsU0FBUyxpQkFBaUI7QUFDbkMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsbUJBQW1CO0FBRXJCLFNBQVMsdUJBQXVCLGtCQUFxQyxZQUFvQztBQUMvRyxTQUFPO0FBQUEsSUFFTixTQUFTLEVBQUUsSUFBSSxRQUFRLE9BQU8sU0FBUyxRQUFRLE1BQU0sR0FBRyxLQUFLLE1BQU0sa0JBQWtCLEVBQUUsWUFBWSxNQUFNLEVBQUUsQ0FBQztBQUFBLElBQzVHLFNBQVMsRUFBRSxJQUFJLFFBQVEsT0FBTyxTQUFTLFFBQVEsTUFBTSxHQUFHLEtBQUssTUFBTSxrQkFBa0IsRUFBRSxZQUFZLE1BQU0sRUFBRSxDQUFDO0FBQUEsSUFDNUcsSUFBSSxVQUFVO0FBQUEsSUFDZCxTQUFTO0FBQUEsTUFDUixJQUFJO0FBQUEsTUFBb0MsT0FBTyxTQUFTLE9BQU8sS0FBSztBQUFBLE1BQUcsS0FBSyxNQUFNO0FBQ2pGLG1CQUFXLE1BQU0sOEJBQThCO0FBQy9DLDBCQUFrQixFQUFFLFlBQVksS0FBSztBQUFBLE1BQ3RDO0FBQUEsSUFDRCxDQUFDO0FBQUEsSUFDRCxTQUFTO0FBQUEsTUFDUixJQUFJO0FBQUEsTUFBcUMsT0FBTyxTQUFTLFFBQVEsTUFBTTtBQUFBLE1BQUcsS0FBSyxNQUFNO0FBQ3BGLG1CQUFXLE1BQU0sK0JBQStCO0FBQ2hELDBCQUFrQixFQUFFLFlB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
