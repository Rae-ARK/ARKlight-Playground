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
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { SideBySideEditor } from "../../../browser/parts/editor/sideBySideEditor.js";
import { isEditorPaneWithScrolling } from "../../../common/editor.js";
import { ReentrancyBarrier } from "../../../../base/common/controlFlow.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IStatusbarService, StatusbarAlignment } from "../../../services/statusbar/browser/statusbar.js";
let SyncScroll = class extends Disposable {
  constructor(editorService, statusbarService) {
    super();
    this.editorService = editorService;
    this.statusbarService = statusbarService;
    this.paneInitialScrollTop = /* @__PURE__ */ new Map();
    this.syncScrollDispoasbles = this._register(new DisposableStore());
    this.paneDisposables = this._register(new DisposableStore());
    this.statusBarEntry = this._register(new MutableDisposable());
    this.isActive = false;
    // makes sure that the onDidEditorPaneScroll is not called multiple times for the same event
    this._reentrancyBarrier = new ReentrancyBarrier();
    this.registerActions();
  }
  registerActiveListeners() {
    this.syncScrollDispoasbles.add(this.editorService.onDidVisibleEditorsChange(() => this.trackVisiblePanes()));
  }
  activate() {
    this.registerActiveListeners();
    this.trackVisiblePanes();
  }
  toggle() {
    if (this.isActive) {
      this.deactivate();
    } else {
      this.activate();
    }
    this.isActive = !this.isActive;
    this.toggleStatusbarItem(this.isActive);
  }
  trackVisiblePanes() {
    this.paneDisposables.clear();
    this.paneInitialScrollTop.clear();
    for (const pane of this.getAllVisiblePanes()) {
      if (!isEditorPaneWithScrolling(pane)) {
        continue;
      }
      this.paneInitialScrollTop.set(pane, pane.getScrollPosition());
      this.paneDisposables.add(pane.onDidChangeScroll(
        () => this._reentrancyBarrier.runExclusivelyOrSkip(() => {
          this.onDidEditorPaneScroll(pane);
        })
      ));
    }
  }
  onDidEditorPaneScroll(scrolledPane) {
    const scrolledPaneInitialOffset = this.paneInitialScrollTop.get(scrolledPane);
    if (scrolledPaneInitialOffset === void 0) {
      throw new Error("Scrolled pane not tracked");
    }
    if (!isEditorPaneWithScrolling(scrolledPane)) {
      throw new Error("Scrolled pane does not support scrolling");
    }
    const scrolledPaneCurrentPosition = scrolledPane.getScrollPosition();
    const scrolledFromInitial = {
      scrollTop: scrolledPaneCurrentPosition.scrollTop - scrolledPaneInitialOffset.scrollTop,
      scrollLeft: scrolledPaneCurrentPosition.scrollLeft !== void 0 && scrolledPaneInitialOffset.scrollLeft !== void 0 ? scrolledPaneCurrentPosition.scrollLeft - scrolledPaneInitialOffset.scrollLeft : void 0
    };
    for (const pane of this.getAllVisiblePanes()) {
      if (pane === scrolledPane) {
        continue;
      }
      if (!isEditorPaneWithScrolling(pane)) {
        continue;
      }
      const initialOffset = this.paneInitialScrollTop.get(pane);
      if (initialOffset === void 0) {
        throw new Error("Could not find initial offset for pane");
      }
      const currentPanePosition = pane.getScrollPosition();
      const newPaneScrollPosition = {
        scrollTop: initialOffset.scrollTop + scrolledFromInitial.scrollTop,
        scrollLeft: initialOffset.scrollLeft !== void 0 && scrolledFromInitial.scrollLeft !== void 0 ? initialOffset.scrollLeft + scrolledFromInitial.scrollLeft : void 0
      };
      if (currentPanePosition.scrollTop === newPaneScrollPosition.scrollTop && currentPanePosition.scrollLeft === newPaneScrollPosition.scrollLeft) {
        continue;
      }
      pane.setScrollPosition(newPaneScrollPosition);
    }
  }
  getAllVisiblePanes() {
    const panes = [];
    for (const pane of this.editorService.visibleEditorPanes) {
      if (pane instanceof SideBySideEditor) {
        const primaryPane = pane.getPrimaryEditorPane();
        const secondaryPane = pane.getSecondaryEditorPane();
        if (primaryPane) {
          panes.push(primaryPane);
        }
        if (secondaryPane) {
          panes.push(secondaryPane);
        }
        continue;
      }
      panes.push(pane);
    }
    return panes;
  }
  deactivate() {
    this.paneDisposables.clear();
    this.syncScrollDispoasbles.clear();
    this.paneInitialScrollTop.clear();
  }
  // Actions & Commands
  toggleStatusbarItem(active) {
    if (active) {
      if (!this.statusBarEntry.value) {
        const text = localize("mouseScrolllingLocked", "Scrolling Locked");
        const tooltip = localize("mouseLockScrollingEnabled", "Lock Scrolling Enabled");
        this.statusBarEntry.value = this.statusbarService.addEntry({
          name: text,
          text,
          tooltip,
          ariaLabel: text,
          command: {
            id: "workbench.action.toggleLockedScrolling",
            title: ""
          },
          kind: "prominent",
          showInAllWindows: true
        }, "status.scrollLockingEnabled", StatusbarAlignment.RIGHT, 102);
      }
    } else {
      this.statusBarEntry.clear();
    }
  }
  registerActions() {
    const $this = this;
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.toggleLockedScrolling",
          title: {
            ...localize2("toggleLockedScrolling", "Toggle Locked Scrolling Across Editors"),
            mnemonicTitle: localize({ key: "miToggleLockedScrolling", comment: ["&& denotes a mnemonic"] }, "Locked Scrolling")
          },
          category: Categories.View,
          f1: true,
          metadata: {
            description: localize("synchronizeScrolling", "Synchronize Scrolling Editors")
          }
        });
      }
      run() {
        $this.toggle();
      }
    }));
    this._register(registerAction2(class extends Action2 {
      constructor() {
        super({
          id: "workbench.action.holdLockedScrolling",
          title: {
            ...localize2("holdLockedScrolling", "Hold Locked Scrolling Across Editors"),
            mnemonicTitle: localize({ key: "miHoldLockedScrolling", comment: ["&& denotes a mnemonic"] }, "Locked Scrolling")
          },
          category: Categories.View
        });
      }
      run(accessor) {
        const keybindingService = accessor.get(IKeybindingService);
        $this.toggle();
        const holdMode = keybindingService.enableKeybindingHoldMode("workbench.action.holdLockedScrolling");
        if (!holdMode) {
          return;
        }
        holdMode.finally(() => {
          $this.toggle();
        });
      }
    }));
  }
  dispose() {
    this.deactivate();
    super.dispose();
  }
};
SyncScroll.ID = "workbench.contrib.syncScrolling";
SyncScroll = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IStatusbarService)
], SyncScroll);
export {
  SyncScroll
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Njcm9sbExvY2tpbmcvYnJvd3Nlci9zY3JvbGxMb2NraW5nLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IFNpZGVCeVNpZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9zaWRlQnlTaWRlRWRpdG9yLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUGFuZSwgSUVkaXRvclBhbmVTY3JvbGxQb3NpdGlvbiwgaXNFZGl0b3JQYW5lV2l0aFNjcm9sbGluZyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgUmVlbnRyYW5jeUJhcnJpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb250cm9sRmxvdy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciwgSVN0YXR1c2JhclNlcnZpY2UsIFN0YXR1c2JhckFsaWdubWVudCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5cbmV4cG9ydCBjbGFzcyBTeW5jU2Nyb2xsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5zeW5jU2Nyb2xsaW5nJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IHBhbmVJbml0aWFsU2Nyb2xsVG9wID0gbmV3IE1hcDxJRWRpdG9yUGFuZSwgSUVkaXRvclBhbmVTY3JvbGxQb3NpdGlvbiB8IHVuZGVmaW5lZD4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHN5bmNTY3JvbGxEaXNwb2FzYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgcGFuZURpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHN0YXR1c0JhckVudHJ5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yPigpKTtcblxuXHRwcml2YXRlIGlzQWN0aXZlOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElTdGF0dXNiYXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RhdHVzYmFyU2VydmljZTogSVN0YXR1c2JhclNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJBY3Rpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQWN0aXZlTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuc3luY1Njcm9sbERpc3BvYXNibGVzLmFkZCh0aGlzLmVkaXRvclNlcnZpY2Uub25EaWRWaXNpYmxlRWRpdG9yc0NoYW5nZSgoKSA9PiB0aGlzLnRyYWNrVmlzaWJsZVBhbmVzKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgYWN0aXZhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5yZWdpc3RlckFjdGl2ZUxpc3RlbmVycygpO1xuXG5cdFx0dGhpcy50cmFja1Zpc2libGVQYW5lcygpO1xuXHR9XG5cblx0dG9nZ2xlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzQWN0aXZlKSB7XG5cdFx0XHR0aGlzLmRlYWN0aXZhdGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5hY3RpdmF0ZSgpO1xuXHRcdH1cblxuXHRcdHRoaXMuaXNBY3RpdmUgPSAhdGhpcy5pc0FjdGl2ZTtcblxuXHRcdHRoaXMudG9nZ2xlU3RhdHVzYmFySXRlbSh0aGlzLmlzQWN0aXZlKTtcblx0fVxuXG5cdC8vIG1ha2VzIHN1cmUgdGhhdCB0aGUgb25EaWRFZGl0b3JQYW5lU2Nyb2xsIGlzIG5vdCBjYWxsZWQgbXVsdGlwbGUgdGltZXMgZm9yIHRoZSBzYW1lIGV2ZW50XG5cdHByaXZhdGUgX3JlZW50cmFuY3lCYXJyaWVyID0gbmV3IFJlZW50cmFuY3lCYXJyaWVyKCk7XG5cblx0cHJpdmF0ZSB0cmFja1Zpc2libGVQYW5lcygpOiB2b2lkIHtcblx0XHR0aGlzLnBhbmVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMucGFuZUluaXRpYWxTY3JvbGxUb3AuY2xlYXIoKTtcblxuXHRcdGZvciAoY29uc3QgcGFuZSBvZiB0aGlzLmdldEFsbFZpc2libGVQYW5lcygpKSB7XG5cblx0XHRcdGlmICghaXNFZGl0b3JQYW5lV2l0aFNjcm9sbGluZyhwYW5lKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5wYW5lSW5pdGlhbFNjcm9sbFRvcC5zZXQocGFuZSwgcGFuZS5nZXRTY3JvbGxQb3NpdGlvbigpKTtcblx0XHRcdHRoaXMucGFuZURpc3Bvc2FibGVzLmFkZChwYW5lLm9uRGlkQ2hhbmdlU2Nyb2xsKCgpID0+XG5cdFx0XHRcdHRoaXMuX3JlZW50cmFuY3lCYXJyaWVyLnJ1bkV4Y2x1c2l2ZWx5T3JTa2lwKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLm9uRGlkRWRpdG9yUGFuZVNjcm9sbChwYW5lKTtcblx0XHRcdFx0fSlcblx0XHRcdCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25EaWRFZGl0b3JQYW5lU2Nyb2xsKHNjcm9sbGVkUGFuZTogSUVkaXRvclBhbmUpIHtcblxuXHRcdGNvbnN0IHNjcm9sbGVkUGFuZUluaXRpYWxPZmZzZXQgPSB0aGlzLnBhbmVJbml0aWFsU2Nyb2xsVG9wLmdldChzY3JvbGxlZFBhbmUpO1xuXHRcdGlmIChzY3JvbGxlZFBhbmVJbml0aWFsT2Zmc2V0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignU2Nyb2xsZWQgcGFuZSBub3QgdHJhY2tlZCcpO1xuXHRcdH1cblxuXHRcdGlmICghaXNFZGl0b3JQYW5lV2l0aFNjcm9sbGluZyhzY3JvbGxlZFBhbmUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Njcm9sbGVkIHBhbmUgZG9lcyBub3Qgc3VwcG9ydCBzY3JvbGxpbmcnKTtcblx0XHR9XG5cblx0XHRjb25zdCBzY3JvbGxlZFBhbmVDdXJyZW50UG9zaXRpb24gPSBzY3JvbGxlZFBhbmUuZ2V0U2Nyb2xsUG9zaXRpb24oKTtcblx0XHRjb25zdCBzY3JvbGxlZEZyb21Jbml0aWFsID0ge1xuXHRcdFx0c2Nyb2xsVG9wOiBzY3JvbGxlZFBhbmVDdXJyZW50UG9zaXRpb24uc2Nyb2xsVG9wIC0gc2Nyb2xsZWRQYW5lSW5pdGlhbE9mZnNldC5zY3JvbGxUb3AsXG5cdFx0XHRzY3JvbGxMZWZ0OiBzY3JvbGxlZFBhbmVDdXJyZW50UG9zaXRpb24uc2Nyb2xsTGVmdCAhPT0gdW5kZWZpbmVkICYmIHNjcm9sbGVkUGFuZUluaXRpYWxPZmZzZXQuc2Nyb2xsTGVmdCAhPT0gdW5kZWZpbmVkID8gc2Nyb2xsZWRQYW5lQ3VycmVudFBvc2l0aW9uLnNjcm9sbExlZnQgLSBzY3JvbGxlZFBhbmVJbml0aWFsT2Zmc2V0LnNjcm9sbExlZnQgOiB1bmRlZmluZWQsXG5cdFx0fTtcblxuXHRcdGZvciAoY29uc3QgcGFuZSBvZiB0aGlzLmdldEFsbFZpc2libGVQYW5lcygpKSB7XG5cdFx0XHRpZiAocGFuZSA9PT0gc2Nyb2xsZWRQYW5lKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWlzRWRpdG9yUGFuZVdpdGhTY3JvbGxpbmcocGFuZSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGluaXRpYWxPZmZzZXQgPSB0aGlzLnBhbmVJbml0aWFsU2Nyb2xsVG9wLmdldChwYW5lKTtcblx0XHRcdGlmIChpbml0aWFsT2Zmc2V0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb3VsZCBub3QgZmluZCBpbml0aWFsIG9mZnNldCBmb3IgcGFuZScpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjdXJyZW50UGFuZVBvc2l0aW9uID0gcGFuZS5nZXRTY3JvbGxQb3NpdGlvbigpO1xuXHRcdFx0Y29uc3QgbmV3UGFuZVNjcm9sbFBvc2l0aW9uID0ge1xuXHRcdFx0XHRzY3JvbGxUb3A6IGluaXRpYWxPZmZzZXQuc2Nyb2xsVG9wICsgc2Nyb2xsZWRGcm9tSW5pdGlhbC5zY3JvbGxUb3AsXG5cdFx0XHRcdHNjcm9sbExlZnQ6IGluaXRpYWxPZmZzZXQuc2Nyb2xsTGVmdCAhPT0gdW5kZWZpbmVkICYmIHNjcm9sbGVkRnJvbUluaXRpYWwuc2Nyb2xsTGVmdCAhPT0gdW5kZWZpbmVkID8gaW5pdGlhbE9mZnNldC5zY3JvbGxMZWZ0ICsgc2Nyb2xsZWRGcm9tSW5pdGlhbC5zY3JvbGxMZWZ0IDogdW5kZWZpbmVkLFxuXHRcdFx0fTtcblxuXHRcdFx0aWYgKGN1cnJlbnRQYW5lUG9zaXRpb24uc2Nyb2xsVG9wID09PSBuZXdQYW5lU2Nyb2xsUG9zaXRpb24uc2Nyb2xsVG9wICYmIGN1cnJlbnRQYW5lUG9zaXRpb24uc2Nyb2xsTGVmdCA9PT0gbmV3UGFuZVNjcm9sbFBvc2l0aW9uLnNjcm9sbExlZnQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdHBhbmUuc2V0U2Nyb2xsUG9zaXRpb24obmV3UGFuZVNjcm9sbFBvc2l0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEFsbFZpc2libGVQYW5lcygpOiBJRWRpdG9yUGFuZVtdIHtcblx0XHRjb25zdCBwYW5lczogSUVkaXRvclBhbmVbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBwYW5lIG9mIHRoaXMuZWRpdG9yU2VydmljZS52aXNpYmxlRWRpdG9yUGFuZXMpIHtcblxuXHRcdFx0aWYgKHBhbmUgaW5zdGFuY2VvZiBTaWRlQnlTaWRlRWRpdG9yKSB7XG5cdFx0XHRcdGNvbnN0IHByaW1hcnlQYW5lID0gcGFuZS5nZXRQcmltYXJ5RWRpdG9yUGFuZSgpO1xuXHRcdFx0XHRjb25zdCBzZWNvbmRhcnlQYW5lID0gcGFuZS5nZXRTZWNvbmRhcnlFZGl0b3JQYW5lKCk7XG5cdFx0XHRcdGlmIChwcmltYXJ5UGFuZSkge1xuXHRcdFx0XHRcdHBhbmVzLnB1c2gocHJpbWFyeVBhbmUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzZWNvbmRhcnlQYW5lKSB7XG5cdFx0XHRcdFx0cGFuZXMucHVzaChzZWNvbmRhcnlQYW5lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0cGFuZXMucHVzaChwYW5lKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGFuZXM7XG5cdH1cblxuXHRwcml2YXRlIGRlYWN0aXZhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5wYW5lRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLnN5bmNTY3JvbGxEaXNwb2FzYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMucGFuZUluaXRpYWxTY3JvbGxUb3AuY2xlYXIoKTtcblx0fVxuXG5cdC8vIEFjdGlvbnMgJiBDb21tYW5kc1xuXG5cdHByaXZhdGUgdG9nZ2xlU3RhdHVzYmFySXRlbShhY3RpdmU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoYWN0aXZlKSB7XG5cdFx0XHRpZiAoIXRoaXMuc3RhdHVzQmFyRW50cnkudmFsdWUpIHtcblx0XHRcdFx0Y29uc3QgdGV4dCA9IGxvY2FsaXplKCdtb3VzZVNjcm9sbGxpbmdMb2NrZWQnLCAnU2Nyb2xsaW5nIExvY2tlZCcpO1xuXHRcdFx0XHRjb25zdCB0b29sdGlwID0gbG9jYWxpemUoJ21vdXNlTG9ja1Njcm9sbGluZ0VuYWJsZWQnLCAnTG9jayBTY3JvbGxpbmcgRW5hYmxlZCcpO1xuXHRcdFx0XHR0aGlzLnN0YXR1c0JhckVudHJ5LnZhbHVlID0gdGhpcy5zdGF0dXNiYXJTZXJ2aWNlLmFkZEVudHJ5KHtcblx0XHRcdFx0XHRuYW1lOiB0ZXh0LFxuXHRcdFx0XHRcdHRleHQsXG5cdFx0XHRcdFx0dG9vbHRpcCxcblx0XHRcdFx0XHRhcmlhTGFiZWw6IHRleHQsXG5cdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZUxvY2tlZFNjcm9sbGluZycsXG5cdFx0XHRcdFx0XHR0aXRsZTogJydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGtpbmQ6ICdwcm9taW5lbnQnLFxuXHRcdFx0XHRcdHNob3dJbkFsbFdpbmRvd3M6IHRydWVcblx0XHRcdFx0fSwgJ3N0YXR1cy5zY3JvbGxMb2NraW5nRW5hYmxlZCcsIFN0YXR1c2JhckFsaWdubWVudC5SSUdIVCwgMTAyKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdGF0dXNCYXJFbnRyeS5jbGVhcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJBY3Rpb25zKCkge1xuXHRcdGNvbnN0ICR0aGlzID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnRvZ2dsZUxvY2tlZFNjcm9sbGluZycsXG5cdFx0XHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0XHRcdC4uLmxvY2FsaXplMigndG9nZ2xlTG9ja2VkU2Nyb2xsaW5nJywgXCJUb2dnbGUgTG9ja2VkIFNjcm9sbGluZyBBY3Jvc3MgRWRpdG9yc1wiKSxcblx0XHRcdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlUb2dnbGVMb2NrZWRTY3JvbGxpbmcnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiTG9ja2VkIFNjcm9sbGluZ1wiKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc3luY2hyb25pemVTY3JvbGxpbmcnLCBcIlN5bmNocm9uaXplIFNjcm9sbGluZyBFZGl0b3JzXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJ1bigpOiB2b2lkIHtcblx0XHRcdFx0JHRoaXMudG9nZ2xlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uaG9sZExvY2tlZFNjcm9sbGluZycsXG5cdFx0XHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0XHRcdC4uLmxvY2FsaXplMignaG9sZExvY2tlZFNjcm9sbGluZycsIFwiSG9sZCBMb2NrZWQgU2Nyb2xsaW5nIEFjcm9zcyBFZGl0b3JzXCIpLFxuXHRcdFx0XHRcdFx0bW5lbW9uaWNUaXRsZTogbG9jYWxpemUoeyBrZXk6ICdtaUhvbGRMb2NrZWRTY3JvbGxpbmcnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiTG9ja2VkIFNjcm9sbGluZ1wiKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBDYXRlZ29yaWVzLlZpZXcsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiB2b2lkIHtcblx0XHRcdFx0Y29uc3Qga2V5YmluZGluZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUtleWJpbmRpbmdTZXJ2aWNlKTtcblxuXHRcdFx0XHQvLyBFbmFibGUgU3luYyBTY3JvbGxpbmcgd2hpbGUgcHJlc3NlZFxuXHRcdFx0XHQkdGhpcy50b2dnbGUoKTtcblxuXHRcdFx0XHRjb25zdCBob2xkTW9kZSA9IGtleWJpbmRpbmdTZXJ2aWNlLmVuYWJsZUtleWJpbmRpbmdIb2xkTW9kZSgnd29ya2JlbmNoLmFjdGlvbi5ob2xkTG9ja2VkU2Nyb2xsaW5nJyk7XG5cdFx0XHRcdGlmICghaG9sZE1vZGUpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRob2xkTW9kZS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0XHQkdGhpcy50b2dnbGUoKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRlYWN0aXZhdGUoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLGlCQUFpQix5QkFBeUI7QUFFL0QsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFNBQVMsdUJBQXVCO0FBQ3pDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsd0JBQXdCO0FBRWpDLFNBQWlELGlDQUFpQztBQUNsRixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFrQyxtQkFBbUIsMEJBQTBCO0FBRXhFLElBQU0sYUFBTixjQUF5QixXQUE2QztBQUFBLEVBYTVFLFlB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
