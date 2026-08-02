import { $, addDisposableListener, EventType, getActiveElement, getWindow, isAncestor, isHTMLElement } from "../../../base/browser/dom.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { Menu } from "../../../base/browser/ui/menu/menu.js";
import { ActionRunner } from "../../../base/common/actions.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { combinedDisposable, DisposableStore } from "../../../base/common/lifecycle.js";
import { defaultMenuStyles } from "../../theme/browser/defaultStyles.js";
class ContextMenuHandler {
  constructor(contextViewService, telemetryService, notificationService, keybindingService) {
    this.contextViewService = contextViewService;
    this.telemetryService = telemetryService;
    this.notificationService = notificationService;
    this.keybindingService = keybindingService;
    this.focusToReturn = null;
    this.lastContainer = null;
    this.block = null;
    this.blockDisposable = null;
    this.options = { blockMouse: true };
  }
  configure(options) {
    this.options = options;
  }
  showContextMenu(delegate) {
    const actions = delegate.getActions();
    if (!actions.length) {
      return;
    }
    this.focusToReturn = getActiveElement();
    let menu;
    const shadowRootElement = isHTMLElement(delegate.domForShadowRoot) ? delegate.domForShadowRoot : void 0;
    this.contextViewService.showContextView({
      getAnchor: () => delegate.getAnchor(),
      canRelayout: false,
      anchorAlignment: delegate.anchorAlignment,
      anchorAxisAlignment: delegate.anchorAxisAlignment,
      closeAnimation: delegate.closeAnimation,
      layer: delegate.layer,
      render: (container) => {
        this.lastContainer = container;
        const className = delegate.getMenuClassName ? delegate.getMenuClassName() : "";
        if (className) {
          container.className += " " + className;
        }
        if (this.options.blockMouse) {
          this.block = container.appendChild($(".context-view-block"));
          this.block.style.position = "fixed";
          this.block.style.cursor = "initial";
          this.block.style.left = "0";
          this.block.style.top = "0";
          this.block.style.width = "100%";
          this.block.style.height = "100%";
          this.block.style.zIndex = "-1";
          this.blockDisposable?.dispose();
          this.blockDisposable = addDisposableListener(this.block, EventType.MOUSE_DOWN, (e) => e.stopPropagation());
        }
        const menuDisposables = new DisposableStore();
        const actionRunner = delegate.actionRunner || menuDisposables.add(new ActionRunner());
        actionRunner.onWillRun((evt) => this.onActionRun(evt, !delegate.skipTelemetry), this, menuDisposables);
        actionRunner.onDidRun(this.onDidActionRun, this, menuDisposables);
        menu = new Menu(
          container,
          actions,
          {
            actionViewItemProvider: delegate.getActionViewItem,
            context: delegate.getActionsContext ? delegate.getActionsContext() : null,
            actionRunner,
            getKeyBinding: delegate.getKeyBinding ? delegate.getKeyBinding : (action) => this.keybindingService.lookupKeybinding(action.id)
          },
          defaultMenuStyles
        );
        menu.onDidCancel(() => this.contextViewService.hideContextView(true), null, menuDisposables);
        menu.onDidBlur(() => this.contextViewService.hideContextView(true), null, menuDisposables);
        const targetWindow = getWindow(container);
        menuDisposables.add(addDisposableListener(targetWindow, EventType.BLUR, () => this.contextViewService.hideContextView(true)));
        menuDisposables.add(addDisposableListener(targetWindow, EventType.MOUSE_DOWN, (e) => {
          if (e.defaultPrevented) {
            return;
          }
          const event = new StandardMouseEvent(targetWindow, e);
          let element = event.target;
          if (event.rightButton) {
            return;
          }
          while (element) {
            if (element === container) {
              return;
            }
            element = element.parentElement;
          }
          this.contextViewService.hideContextView(true);
        }));
        return combinedDisposable(menuDisposables, menu);
      },
      focus: () => {
        menu?.focus(!!delegate.autoSelectFirstItem);
      },
      onHide: (didCancel) => {
        delegate.onHide?.(!!didCancel);
        if (this.block) {
          this.block.remove();
          this.block = null;
        }
        this.blockDisposable?.dispose();
        this.blockDisposable = null;
        if (!!this.lastContainer && (getActiveElement() === this.lastContainer || isAncestor(getActiveElement(), this.lastContainer))) {
          this.focusToReturn?.focus();
        }
        this.lastContainer = null;
      }
    }, shadowRootElement, !!shadowRootElement);
  }
  onActionRun(e, logTelemetry) {
    if (logTelemetry) {
      this.telemetryService.publicLog2("workbenchActionExecuted", { id: e.action.id, from: "contextMenu" });
    }
    this.contextViewService.hideContextView(false);
  }
  onDidActionRun(e) {
    if (e.error && !isCancellationError(e.error)) {
      this.notificationService.error(e.error);
    }
  }
}
export {
  ContextMenuHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dE1lbnVIYW5kbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUNvbnRleHRNZW51RGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvY29udGV4dG1lbnUuanMnO1xuaW1wb3J0IHsgJCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBFdmVudFR5cGUsIGdldEFjdGl2ZUVsZW1lbnQsIGdldFdpbmRvdywgaXNBbmNlc3RvciwgaXNIVE1MRWxlbWVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgTWVudSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9tZW51L21lbnUuanMnO1xuaW1wb3J0IHsgQWN0aW9uUnVubmVyLCBJUnVuRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24sIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgY29tYmluZWREaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGRlZmF1bHRNZW51U3R5bGVzIH0gZnJvbSAnLi4vLi4vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcblxuXG5leHBvcnQgaW50ZXJmYWNlIElDb250ZXh0TWVudUhhbmRsZXJPcHRpb25zIHtcblx0YmxvY2tNb3VzZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIENvbnRleHRNZW51SGFuZGxlciB7XG5cdHByaXZhdGUgZm9jdXNUb1JldHVybjogSFRNTEVsZW1lbnQgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBsYXN0Q29udGFpbmVyOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGJsb2NrOiBIVE1MRWxlbWVudCB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGJsb2NrRGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBvcHRpb25zOiBJQ29udGV4dE1lbnVIYW5kbGVyT3B0aW9ucyA9IHsgYmxvY2tNb3VzZTogdHJ1ZSB9O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdHByaXZhdGUgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRwcml2YXRlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0Y29uZmlndXJlKG9wdGlvbnM6IElDb250ZXh0TWVudUhhbmRsZXJPcHRpb25zKTogdm9pZCB7XG5cdFx0dGhpcy5vcHRpb25zID0gb3B0aW9ucztcblx0fVxuXG5cdHNob3dDb250ZXh0TWVudShkZWxlZ2F0ZTogSUNvbnRleHRNZW51RGVsZWdhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBhY3Rpb25zID0gZGVsZWdhdGUuZ2V0QWN0aW9ucygpO1xuXHRcdGlmICghYWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybjsgLy8gRG9uJ3QgcmVuZGVyIGFuIGVtcHR5IGNvbnRleHQgbWVudVxuXHRcdH1cblxuXHRcdHRoaXMuZm9jdXNUb1JldHVybiA9IGdldEFjdGl2ZUVsZW1lbnQoKSBhcyBIVE1MRWxlbWVudDtcblxuXHRcdGxldCBtZW51OiBNZW51IHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgc2hhZG93Um9vdEVsZW1lbnQgPSBpc0hUTUxFbGVtZW50KGRlbGVnYXRlLmRvbUZvclNoYWRvd1Jvb3QpID8gZGVsZWdhdGUuZG9tRm9yU2hhZG93Um9vdCA6IHVuZGVmaW5lZDtcblx0XHR0aGlzLmNvbnRleHRWaWV3U2VydmljZS5zaG93Q29udGV4dFZpZXcoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBkZWxlZ2F0ZS5nZXRBbmNob3IoKSxcblx0XHRcdGNhblJlbGF5b3V0OiBmYWxzZSxcblx0XHRcdGFuY2hvckFsaWdubWVudDogZGVsZWdhdGUuYW5jaG9yQWxpZ25tZW50LFxuXHRcdFx0YW5jaG9yQXhpc0FsaWdubWVudDogZGVsZWdhdGUuYW5jaG9yQXhpc0FsaWdubWVudCxcblx0XHRcdGNsb3NlQW5pbWF0aW9uOiBkZWxlZ2F0ZS5jbG9zZUFuaW1hdGlvbixcblx0XHRcdGxheWVyOiBkZWxlZ2F0ZS5sYXllcixcblx0XHRcdHJlbmRlcjogKGNvbnRhaW5lcikgPT4ge1xuXHRcdFx0XHR0aGlzLmxhc3RDb250YWluZXIgPSBjb250YWluZXI7XG5cdFx0XHRcdGNvbnN0IGNsYXNzTmFtZSA9IGRlbGVnYXRlLmdldE1lbnVDbGFzc05hbWUgPyBkZWxlZ2F0ZS5nZXRNZW51Q2xhc3NOYW1lKCkgOiAnJztcblxuXHRcdFx0XHRpZiAoY2xhc3NOYW1lKSB7XG5cdFx0XHRcdFx0Y29udGFpbmVyLmNsYXNzTmFtZSArPSAnICcgKyBjbGFzc05hbWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBSZW5kZXIgaW52aXNpYmxlIGRpdiB0byBibG9jayBtb3VzZSBpbnRlcmFjdGlvbiBpbiB0aGUgcmVzdCBvZiB0aGUgVUlcblx0XHRcdFx0aWYgKHRoaXMub3B0aW9ucy5ibG9ja01vdXNlKSB7XG5cdFx0XHRcdFx0dGhpcy5ibG9jayA9IGNvbnRhaW5lci5hcHBlbmRDaGlsZCgkKCcuY29udGV4dC12aWV3LWJsb2NrJykpO1xuXHRcdFx0XHRcdHRoaXMuYmxvY2suc3R5bGUucG9zaXRpb24gPSAnZml4ZWQnO1xuXHRcdFx0XHRcdHRoaXMuYmxvY2suc3R5bGUuY3Vyc29yID0gJ2luaXRpYWwnO1xuXHRcdFx0XHRcdHRoaXMuYmxvY2suc3R5bGUubGVmdCA9ICcwJztcblx0XHRcdFx0XHR0aGlzLmJsb2NrLnN0eWxlLnRvcCA9ICcwJztcblx0XHRcdFx0XHR0aGlzLmJsb2NrLnN0eWxlLndpZHRoID0gJzEwMCUnO1xuXHRcdFx0XHRcdHRoaXMuYmxvY2suc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXHRcdFx0XHRcdHRoaXMuYmxvY2suc3R5bGUuekluZGV4ID0gJy0xJztcblxuXHRcdFx0XHRcdHRoaXMuYmxvY2tEaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5ibG9ja0Rpc3Bvc2FibGUgPSBhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5ibG9jaywgRXZlbnRUeXBlLk1PVVNFX0RPV04sIGUgPT4gZS5zdG9wUHJvcGFnYXRpb24oKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBtZW51RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdFx0Y29uc3QgYWN0aW9uUnVubmVyID0gZGVsZWdhdGUuYWN0aW9uUnVubmVyIHx8IG1lbnVEaXNwb3NhYmxlcy5hZGQobmV3IEFjdGlvblJ1bm5lcigpKTtcblx0XHRcdFx0YWN0aW9uUnVubmVyLm9uV2lsbFJ1bihldnQgPT4gdGhpcy5vbkFjdGlvblJ1bihldnQsICFkZWxlZ2F0ZS5za2lwVGVsZW1ldHJ5KSwgdGhpcywgbWVudURpc3Bvc2FibGVzKTtcblx0XHRcdFx0YWN0aW9uUnVubmVyLm9uRGlkUnVuKHRoaXMub25EaWRBY3Rpb25SdW4sIHRoaXMsIG1lbnVEaXNwb3NhYmxlcyk7XG5cdFx0XHRcdG1lbnUgPSBuZXcgTWVudShjb250YWluZXIsIGFjdGlvbnMsIHtcblx0XHRcdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiBkZWxlZ2F0ZS5nZXRBY3Rpb25WaWV3SXRlbSxcblx0XHRcdFx0XHRjb250ZXh0OiBkZWxlZ2F0ZS5nZXRBY3Rpb25zQ29udGV4dCA/IGRlbGVnYXRlLmdldEFjdGlvbnNDb250ZXh0KCkgOiBudWxsLFxuXHRcdFx0XHRcdGFjdGlvblJ1bm5lcixcblx0XHRcdFx0XHRnZXRLZXlCaW5kaW5nOiBkZWxlZ2F0ZS5nZXRLZXlCaW5kaW5nID8gZGVsZWdhdGUuZ2V0S2V5QmluZGluZyA6IGFjdGlvbiA9PiB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoYWN0aW9uLmlkKVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRlZmF1bHRNZW51U3R5bGVzXG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0bWVudS5vbkRpZENhbmNlbCgoKSA9PiB0aGlzLmNvbnRleHRWaWV3U2VydmljZS5oaWRlQ29udGV4dFZpZXcodHJ1ZSksIG51bGwsIG1lbnVEaXNwb3NhYmxlcyk7XG5cdFx0XHRcdG1lbnUub25EaWRCbHVyKCgpID0+IHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLmhpZGVDb250ZXh0Vmlldyh0cnVlKSwgbnVsbCwgbWVudURpc3Bvc2FibGVzKTtcblx0XHRcdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZ2V0V2luZG93KGNvbnRhaW5lcik7XG5cdFx0XHRcdG1lbnVEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldFdpbmRvdywgRXZlbnRUeXBlLkJMVVIsICgpID0+IHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLmhpZGVDb250ZXh0Vmlldyh0cnVlKSkpO1xuXHRcdFx0XHRtZW51RGlzcG9zYWJsZXMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0YXJnZXRXaW5kb3csIEV2ZW50VHlwZS5NT1VTRV9ET1dOLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0XHRcdGlmIChlLmRlZmF1bHRQcmV2ZW50ZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZE1vdXNlRXZlbnQodGFyZ2V0V2luZG93LCBlKTtcblx0XHRcdFx0XHRsZXQgZWxlbWVudDogSFRNTEVsZW1lbnQgfCBudWxsID0gZXZlbnQudGFyZ2V0O1xuXG5cdFx0XHRcdFx0Ly8gRG9uJ3QgZG8gYW55dGhpbmcgYXMgd2UgYXJlIGxpa2VseSBjcmVhdGluZyBhIGNvbnRleHQgbWVudVxuXHRcdFx0XHRcdGlmIChldmVudC5yaWdodEJ1dHRvbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHdoaWxlIChlbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudCA9PT0gY29udGFpbmVyKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0ZWxlbWVudCA9IGVsZW1lbnQucGFyZW50RWxlbWVudDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLmNvbnRleHRWaWV3U2VydmljZS5oaWRlQ29udGV4dFZpZXcodHJ1ZSk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRyZXR1cm4gY29tYmluZWREaXNwb3NhYmxlKG1lbnVEaXNwb3NhYmxlcywgbWVudSk7XG5cdFx0XHR9LFxuXG5cdFx0XHRmb2N1czogKCkgPT4ge1xuXHRcdFx0XHRtZW51Py5mb2N1cyghIWRlbGVnYXRlLmF1dG9TZWxlY3RGaXJzdEl0ZW0pO1xuXHRcdFx0fSxcblxuXHRcdFx0b25IaWRlOiAoZGlkQ2FuY2VsPzogYm9vbGVhbikgPT4ge1xuXHRcdFx0XHRkZWxlZ2F0ZS5vbkhpZGU/LighIWRpZENhbmNlbCk7XG5cblx0XHRcdFx0aWYgKHRoaXMuYmxvY2spIHtcblx0XHRcdFx0XHR0aGlzLmJsb2NrLnJlbW92ZSgpO1xuXHRcdFx0XHRcdHRoaXMuYmxvY2sgPSBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5ibG9ja0Rpc3Bvc2FibGU/LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5ibG9ja0Rpc3Bvc2FibGUgPSBudWxsO1xuXG5cdFx0XHRcdGlmICghIXRoaXMubGFzdENvbnRhaW5lciAmJiAoZ2V0QWN0aXZlRWxlbWVudCgpID09PSB0aGlzLmxhc3RDb250YWluZXIgfHwgaXNBbmNlc3RvcihnZXRBY3RpdmVFbGVtZW50KCksIHRoaXMubGFzdENvbnRhaW5lcikpKSB7XG5cdFx0XHRcdFx0dGhpcy5mb2N1c1RvUmV0dXJuPy5mb2N1cygpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5sYXN0Q29udGFpbmVyID0gbnVsbDtcblx0XHRcdH1cblx0XHR9LCBzaGFkb3dSb290RWxlbWVudCwgISFzaGFkb3dSb290RWxlbWVudCk7XG5cdH1cblxuXHRwcml2YXRlIG9uQWN0aW9uUnVuKGU6IElSdW5FdmVudCwgbG9nVGVsZW1ldHJ5OiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGxvZ1RlbGVtZXRyeSkge1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogZS5hY3Rpb24uaWQsIGZyb206ICdjb250ZXh0TWVudScgfSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jb250ZXh0Vmlld1NlcnZpY2UuaGlkZUNvbnRleHRWaWV3KGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRBY3Rpb25SdW4oZTogSVJ1bkV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGUuZXJyb3IgJiYgIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZS5lcnJvcikpIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlLmVycm9yKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsR0FBRyx1QkFBdUIsV0FBVyxrQkFBa0IsV0FBVyxZQUFZLHFCQUFxQjtBQUM1RyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxvQkFBb0c7QUFDN0csU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0IsdUJB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
