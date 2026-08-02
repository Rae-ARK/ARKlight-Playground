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
import { Separator } from "../../../../base/common/actions.js";
import { h } from "../../../../base/browser/dom.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, constObservable, derived, observableFromEvent } from "../../../../base/common/observable.js";
import { getActionBarActions, MenuEntryActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { IMenuService, MenuId, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { OverlayWidgetPositionPreference } from "../../../browser/editorBrowser.js";
import { observableCodeEditor } from "../../../browser/observableCodeEditor.js";
let FloatingEditorToolbar = class extends Disposable {
  constructor(editor, instantiationService, keybindingService, menuService) {
    super();
    const editorObs = this._register(observableCodeEditor(editor));
    const editorUriObs = derived((reader) => editorObs.model.read(reader)?.uri);
    const widget = this._register(instantiationService.createInstance(
      FloatingEditorToolbarWidget,
      MenuId.EditorContent,
      editor.contextKeyService,
      editorUriObs
    ));
    this._register(autorun((reader) => {
      const hasActions = widget.hasActions.read(reader);
      if (!hasActions) {
        return;
      }
      reader.store.add(editorObs.createOverlayWidget({
        allowEditorOverflow: false,
        domNode: widget.element,
        minContentWidthInPx: constObservable(0),
        position: constObservable({
          preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
        })
      }));
    }));
  }
};
FloatingEditorToolbar.ID = "editor.contrib.floatingToolbar";
FloatingEditorToolbar = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IKeybindingService),
  __decorateParam(3, IMenuService)
], FloatingEditorToolbar);
let FloatingEditorToolbarWidget = class extends Disposable {
  constructor(_menuId, _scopedContextKeyService, _toolbarContext, instantiationService, keybindingService, menuService) {
    super();
    const menu = this._register(menuService.createMenu(_menuId, _scopedContextKeyService));
    const menuGroupsObs = observableFromEvent(this, menu.onDidChange, () => menu.getActions());
    const menuPrimaryActionsObs = derived((reader) => {
      const menuGroups = menuGroupsObs.read(reader);
      const { primary } = getActionBarActions(menuGroups, () => true);
      return primary.filter((a) => a.id !== Separator.ID);
    });
    this.hasActions = derived((reader) => menuPrimaryActionsObs.read(reader).length > 0);
    this.element = h("div.floating-menu-overlay-widget").root;
    this._register(toDisposable(() => this.element.remove()));
    this._register(autorun((reader) => {
      const primaryActions = menuPrimaryActionsObs.read(reader);
      const hasActions = primaryActions.length > 0;
      const menuPrimaryActionId = hasActions ? primaryActions[0].id : void 0;
      const isSingleButton = primaryActions.length === 1;
      this.element.classList.toggle("single-button", isSingleButton);
      this.element.style.height = isSingleButton ? "28px" : "26px";
      if (!hasActions) {
        return;
      }
      const toolbar = instantiationService.createInstance(MenuWorkbenchToolBar, this.element, _menuId, {
        actionViewItemProvider: (action, options) => {
          if (!(action instanceof MenuItemAction)) {
            return void 0;
          }
          return instantiationService.createInstance(class extends MenuEntryActionViewItem {
            render(container) {
              super.render(container);
              if (action.id === menuPrimaryActionId) {
                this.element?.classList.add("primary");
              }
            }
            updateLabel() {
              const keybinding = keybindingService.lookupKeybinding(action.id);
              const keybindingLabel = keybinding ? keybinding.getLabel() : void 0;
              if (this.options.label && this.label) {
                this.label.textContent = keybindingLabel ? `${this._commandAction.label} (${keybindingLabel})` : this._commandAction.label;
              }
            }
          }, action, { ...options, keybindingNotRenderedWithLabel: true });
        },
        hiddenItemStrategy: HiddenItemStrategy.Ignore,
        menuOptions: {
          shouldForwardArgs: true
        },
        telemetrySource: "editor.overlayToolbar",
        toolbarOptions: {
          primaryGroup: () => true,
          useSeparatorsInPrimaryActions: true
        }
      });
      reader.store.add(toolbar);
      reader.store.add(autorun((reader2) => {
        const context = _toolbarContext.read(reader2);
        toolbar.context = context;
      }));
    }));
  }
};
FloatingEditorToolbarWidget = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IMenuService)
], FloatingEditorToolbarWidget);
export {
  FloatingEditorToolbar,
  FloatingEditorToolbarWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2Zsb2F0aW5nTWVudS9icm93c2VyL2Zsb2F0aW5nTWVudS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIGNvbnN0T2JzZXJ2YWJsZSwgZGVyaXZlZCwgSU9ic2VydmFibGUsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZXRBY3Rpb25CYXJBY3Rpb25zLCBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBIaWRkZW5JdGVtU3RyYXRlZ3ksIE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgT3ZlcmxheVdpZGdldFBvc2l0aW9uUHJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuXG5leHBvcnQgY2xhc3MgRmxvYXRpbmdFZGl0b3JUb29sYmFyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmNvbnRyaWIuZmxvYXRpbmdUb29sYmFyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBlZGl0b3JPYnMgPSB0aGlzLl9yZWdpc3RlcihvYnNlcnZhYmxlQ29kZUVkaXRvcihlZGl0b3IpKTtcblx0XHRjb25zdCBlZGl0b3JVcmlPYnMgPSBkZXJpdmVkKHJlYWRlciA9PiBlZGl0b3JPYnMubW9kZWwucmVhZChyZWFkZXIpPy51cmkpO1xuXG5cdFx0Ly8gV2lkZ2V0XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRGbG9hdGluZ0VkaXRvclRvb2xiYXJXaWRnZXQsXG5cdFx0XHRNZW51SWQuRWRpdG9yQ29udGVudCxcblx0XHRcdGVkaXRvci5jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdGVkaXRvclVyaU9icykpO1xuXG5cdFx0Ly8gUmVuZGVyIHdpZGdldFxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGhhc0FjdGlvbnMgPSB3aWRnZXQuaGFzQWN0aW9ucy5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWhhc0FjdGlvbnMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBPdmVybGF5IHdpZGdldFxuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZChlZGl0b3JPYnMuY3JlYXRlT3ZlcmxheVdpZGdldCh7XG5cdFx0XHRcdGFsbG93RWRpdG9yT3ZlcmZsb3c6IGZhbHNlLFxuXHRcdFx0XHRkb21Ob2RlOiB3aWRnZXQuZWxlbWVudCxcblx0XHRcdFx0bWluQ29udGVudFdpZHRoSW5QeDogY29uc3RPYnNlcnZhYmxlKDApLFxuXHRcdFx0XHRwb3NpdGlvbjogY29uc3RPYnNlcnZhYmxlKHtcblx0XHRcdFx0XHRwcmVmZXJlbmNlOiBPdmVybGF5V2lkZ2V0UG9zaXRpb25QcmVmZXJlbmNlLkJPVFRPTV9SSUdIVF9DT1JORVJcblx0XHRcdFx0fSlcblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZsb2F0aW5nRWRpdG9yVG9vbGJhcldpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgaGFzQWN0aW9uczogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0X21lbnVJZDogTWVudUlkLFxuXHRcdF9zY29wZWRDb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdF90b29sYmFyQ29udGV4dDogSU9ic2VydmFibGU8VVJJIHwgdW5kZWZpbmVkPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJTWVudVNlcnZpY2UgbWVudVNlcnZpY2U6IElNZW51U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgbWVudSA9IHRoaXMuX3JlZ2lzdGVyKG1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoX21lbnVJZCwgX3Njb3BlZENvbnRleHRLZXlTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgbWVudUdyb3Vwc09icyA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcywgbWVudS5vbkRpZENoYW5nZSwgKCkgPT4gbWVudS5nZXRBY3Rpb25zKCkpO1xuXG5cdFx0Y29uc3QgbWVudVByaW1hcnlBY3Rpb25zT2JzID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbWVudUdyb3VwcyA9IG1lbnVHcm91cHNPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgeyBwcmltYXJ5IH0gPSBnZXRBY3Rpb25CYXJBY3Rpb25zKG1lbnVHcm91cHMsICgpID0+IHRydWUpO1xuXHRcdFx0cmV0dXJuIHByaW1hcnkuZmlsdGVyKGEgPT4gYS5pZCAhPT0gU2VwYXJhdG9yLklEKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuaGFzQWN0aW9ucyA9IGRlcml2ZWQocmVhZGVyID0+IG1lbnVQcmltYXJ5QWN0aW9uc09icy5yZWFkKHJlYWRlcikubGVuZ3RoID4gMCk7XG5cblx0XHR0aGlzLmVsZW1lbnQgPSBoKCdkaXYuZmxvYXRpbmctbWVudS1vdmVybGF5LXdpZGdldCcpLnJvb3Q7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuZWxlbWVudC5yZW1vdmUoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgcHJpbWFyeUFjdGlvbnMgPSBtZW51UHJpbWFyeUFjdGlvbnNPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgaGFzQWN0aW9ucyA9IHByaW1hcnlBY3Rpb25zLmxlbmd0aCA+IDA7XG5cdFx0XHRjb25zdCBtZW51UHJpbWFyeUFjdGlvbklkID0gaGFzQWN0aW9ucyA/IHByaW1hcnlBY3Rpb25zWzBdLmlkIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCBpc1NpbmdsZUJ1dHRvbiA9IHByaW1hcnlBY3Rpb25zLmxlbmd0aCA9PT0gMTtcblx0XHRcdHRoaXMuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdzaW5nbGUtYnV0dG9uJywgaXNTaW5nbGVCdXR0b24pO1xuXHRcdFx0Ly8gU2V0IGhlaWdodCBleHBsaWNpdGx5IHRvIGVuc3VyZSB0aGF0IHRoZSBmbG9hdGluZyBtZW51IGVsZW1lbnRcblx0XHRcdC8vIGlzIHJlbmRlcmVkIGluIHRoZSBsb3dlciByaWdodCBjb3JuZXIgYXQgdGhlIGNvcnJlY3QgcG9zaXRpb24uXG5cdFx0XHR0aGlzLmVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gaXNTaW5nbGVCdXR0b24gPyAnMjhweCcgOiAnMjZweCc7XG5cblx0XHRcdGlmICghaGFzQWN0aW9ucykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRvb2xiYXJcblx0XHRcdGNvbnN0IHRvb2xiYXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgdGhpcy5lbGVtZW50LCBfbWVudUlkLCB7XG5cdFx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0XHRpZiAoIShhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikpIHtcblx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKGNsYXNzIGV4dGVuZHMgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0ge1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRcdFx0XHRcdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cblx0XHRcdFx0XHRcdFx0Ly8gSGlnaGxpZ2h0IHByaW1hcnkgYWN0aW9uXG5cdFx0XHRcdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IG1lbnVQcmltYXJ5QWN0aW9uSWQpIHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmVsZW1lbnQ/LmNsYXNzTGlzdC5hZGQoJ3ByaW1hcnknKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlTGFiZWwoKTogdm9pZCB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSBrZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjdGlvbi5pZCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGtleWJpbmRpbmdMYWJlbCA9IGtleWJpbmRpbmcgPyBrZXliaW5kaW5nLmdldExhYmVsKCkgOiB1bmRlZmluZWQ7XG5cblx0XHRcdFx0XHRcdFx0aWYgKHRoaXMub3B0aW9ucy5sYWJlbCAmJiB0aGlzLmxhYmVsKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5sYWJlbC50ZXh0Q29udGVudCA9IGtleWJpbmRpbmdMYWJlbFxuXHRcdFx0XHRcdFx0XHRcdFx0PyBgJHt0aGlzLl9jb21tYW5kQWN0aW9uLmxhYmVsfSAoJHtrZXliaW5kaW5nTGFiZWx9KWBcblx0XHRcdFx0XHRcdFx0XHRcdDogdGhpcy5fY29tbWFuZEFjdGlvbi5sYWJlbDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sIGFjdGlvbiwgeyAuLi5vcHRpb25zLCBrZXliaW5kaW5nTm90UmVuZGVyZWRXaXRoTGFiZWw6IHRydWUgfSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lklnbm9yZSxcblx0XHRcdFx0bWVudU9wdGlvbnM6IHtcblx0XHRcdFx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0ZWxlbWV0cnlTb3VyY2U6ICdlZGl0b3Iub3ZlcmxheVRvb2xiYXInLFxuXHRcdFx0XHR0b29sYmFyT3B0aW9uczoge1xuXHRcdFx0XHRcdHByaW1hcnlHcm91cDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0XHR1c2VTZXBhcmF0b3JzSW5QcmltYXJ5QWN0aW9uczogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdHJlYWRlci5zdG9yZS5hZGQodG9vbGJhcik7XG5cdFx0XHRyZWFkZXIuc3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgY29udGV4dCA9IF90b29sYmFyQ29udGV4dC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHRvb2xiYXIuY29udGV4dCA9IGNvbnRleHQ7XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsU0FBUztBQUNsQixTQUFTLFlBQVksb0JBQW9CO0FBQ3pDLFNBQVMsU0FBUyxpQkFBaUIsU0FBc0IsMkJBQTJCO0FBRXBGLFNBQVMscUJBQXFCLCtCQUErQjtBQUM3RCxTQUFTLG9CQUFvQiw0QkFBNEI7QUFDekQsU0FBUyxjQUFjLFFBQVEsc0JBQXNCO0FBRXJELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQXNCLHVDQUF1QztBQUM3RCxTQUFTLDRCQUE0QjtBQUc5QixJQUFNLHdCQUFOLGNBQW9DLFdBQTBDO0FBQUEsRUFHcEYsWUFDQyxRQUN1QixzQkFDSCxtQkFDTixhQUNiO0FBQ0QsVUFBTTtBQUVOLFVBQU0sWUFBWSxLQUFLLFVBQVUscUJBQXFCLE1BQU0sQ0FBQztBQUM3RCxVQUFNLGVBQWUsUUFBUSxZQUFVLFVBQVUsTUFBTSxLQUFLLE1BQU0sR0FBRyxHQUFHO0FBR3hFLFVBQU0sU0FBUyxLQUFLLFVBQVUscUJBQXFCO0FBQUEsTUFDbEQ7QUFBQSxNQUNBLE9BQU87QUFBQSxNQUNQLE9BQU87QUFBQSxNQUNQ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
