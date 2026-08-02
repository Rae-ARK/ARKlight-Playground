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
import * as dom from "../../../base/browser/dom.js";
import { Radio } from "../../../base/browser/ui/radio/radio.js";
import { KeyCode } from "../../../base/common/keyCodes.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { IContextViewService } from "../../contextview/browser/contextView.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { ActionList } from "./actionList.js";
import "./tabbedActionListWidget.css";
let TabbedActionListWidget = class extends Disposable {
  constructor(_contextViewService, _instantiationService) {
    super();
    this._contextViewService = _contextViewService;
    this._instantiationService = _instantiationService;
    this._onDidChangeTab = this._register(new Emitter());
    this.onDidChangeTab = this._onDidChangeTab.event;
    this._onDidHide = this._register(new Emitter());
    this.onDidHide = this._onDidHide.event;
    this._activePopup = this._register(new MutableDisposable());
    this._swappingTab = false;
  }
  get isVisible() {
    return !!this._activePopup.value;
  }
  /**
   * Shows the popup anchored to {@link ITabbedActionListShowOptions.anchor}.
   * If a popup is already visible, it is replaced in place.
   */
  show(options) {
    const isSwap = this.isVisible;
    if (isSwap) {
      this._swappingTab = true;
      this._activePopup.value = void 0;
    }
    let activeTab = options.initialTab;
    const popupDisposables = new DisposableStore();
    const hide = () => {
      if (this._activePopup.value === popupDisposables) {
        this._activePopup.value = void 0;
      }
    };
    this._activePopup.value = popupDisposables;
    popupDisposables.add(toDisposable(() => {
      this._contextViewService.hideContextView();
    }));
    let listRef;
    this._contextViewService.showContextView({
      getAnchor: () => options.anchor,
      render: (container) => {
        const renderDisposables = new DisposableStore();
        const widget = dom.append(container, dom.$(".action-widget"));
        const tabBar = dom.append(widget, dom.$(".tabbed-action-list-tabbar"));
        if (options.tabBarClassName) {
          tabBar.classList.add(options.tabBarClassName);
        }
        const radio = renderDisposables.add(new Radio({
          items: options.tabs.map((tab) => {
            const label = tab.label ?? tab.id;
            const text = tab.icon ? `$(${tab.icon.id}) ${label}` : label;
            return { text, tooltip: tab.tooltip ?? label, isActive: tab.id === activeTab };
          })
        }));
        tabBar.appendChild(radio.domNode);
        const activateTab = (next) => {
          if (next === activeTab) {
            return;
          }
          activeTab = next;
          this._onDidChangeTab.fire(next);
          this.show({ ...options, initialTab: next });
        };
        renderDisposables.add(radio.onDidSelect((index) => {
          const next = options.tabs[index];
          if (next) {
            activateTab(next.id);
          }
        }));
        const { items, listOptions } = options.createActionList(activeTab);
        const list = renderDisposables.add(this._instantiationService.createInstance(
          ActionList,
          options.user,
          false,
          items,
          options.delegate,
          options.accessibilityProvider,
          listOptions,
          options.anchor
        ));
        listRef = list;
        if (list.filterContainer) {
          widget.appendChild(list.filterContainer);
        }
        widget.appendChild(list.domNode);
        const width = list.layout(0);
        widget.style.width = `${options.width ?? width}px`;
        list.focus();
        renderDisposables.add(dom.addStandardDisposableListener(widget, "keydown", (e) => {
          const target = e.target;
          const onTabBar = !!target?.closest(".tabbed-action-list-tabbar");
          const onEditable = !!target?.closest('input, textarea, [contenteditable="true"]');
          if (e.keyCode === KeyCode.Escape) {
            dom.EventHelper.stop(e, true);
            hide();
            return;
          }
          if (e.keyCode === KeyCode.Enter && !onTabBar) {
            dom.EventHelper.stop(e, true);
            list.acceptSelected();
            return;
          }
          if (e.keyCode === KeyCode.UpArrow && !onTabBar) {
            dom.EventHelper.stop(e, true);
            list.focusPrevious();
            return;
          }
          if (e.keyCode === KeyCode.DownArrow && !onTabBar) {
            dom.EventHelper.stop(e, true);
            list.focusNext();
            return;
          }
          if (e.keyCode !== KeyCode.LeftArrow && e.keyCode !== KeyCode.RightArrow) {
            return;
          }
          if (onEditable && !onTabBar) {
            return;
          }
          const currentIndex = options.tabs.findIndex((t) => t.id === activeTab);
          if (currentIndex < 0) {
            return;
          }
          const delta = e.keyCode === KeyCode.RightArrow ? 1 : -1;
          const nextIndex = (currentIndex + delta + options.tabs.length) % options.tabs.length;
          e.preventDefault();
          e.stopPropagation();
          activateTab(options.tabs[nextIndex].id);
        }));
        const focusTracker = renderDisposables.add(dom.trackFocus(container));
        renderDisposables.add(focusTracker.onDidBlur(() => {
          if (this._swappingTab) {
            return;
          }
          const activeElement = dom.getActiveElement();
          if (activeElement && (activeElement.closest(".action-widget-hover") || activeElement.closest(".action-list-submenu-panel"))) {
            return;
          }
          hide();
        }));
        return renderDisposables;
      },
      onHide: () => {
        listRef = void 0;
        if (this._swappingTab) {
          return;
        }
        if (this._activePopup.value === popupDisposables) {
          this._activePopup.value = void 0;
        }
        options.delegate.onHide?.();
        this._onDidHide.fire();
      },
      get anchorPosition() {
        return listRef?.anchorPosition;
      }
    }, void 0, false);
    if (isSwap) {
      this._swappingTab = false;
    }
  }
  hide() {
    this._activePopup.value = void 0;
  }
  dispose() {
    this._activePopup.value = void 0;
    super.dispose();
  }
};
TabbedActionListWidget = __decorateClass([
  __decorateParam(0, IContextViewService),
  __decorateParam(1, IInstantiationService)
], TabbedActionListWidget);
export {
  TabbedActionListWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL3RhYmJlZEFjdGlvbkxpc3RXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgUmFkaW8gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvcmFkaW8vcmFkaW8uanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQWN0aW9uTGlzdCwgSUFjdGlvbkxpc3REZWxlZ2F0ZSwgSUFjdGlvbkxpc3RJdGVtLCBJQWN0aW9uTGlzdE9wdGlvbnMgfSBmcm9tICcuL2FjdGlvbkxpc3QuanMnO1xuaW1wb3J0ICcuL3RhYmJlZEFjdGlvbkxpc3RXaWRnZXQuY3NzJztcblxuLyoqXG4gKiBSZXN1bHQgb2Yge0BsaW5rIElUYWJiZWRBY3Rpb25MaXN0U2hvd09wdGlvbnMuY3JlYXRlQWN0aW9uTGlzdH0uIFRoZSBsaXN0XG4gKiBvcHRpb25zIGFyZSByZWNvbXB1dGVkIG9uIGV2ZXJ5IHRhYiBzd2l0Y2ggc28gY2FsbGVycyBjYW4gdmFyeSBmaWx0ZXJcbiAqIHZpc2liaWxpdHksIHdpZHRoLCBldGMuIGJ5IHRhYi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGFiYmVkQWN0aW9uTGlzdEJ1aWxkUmVzdWx0PFQ+IHtcblx0cmVhZG9ubHkgaXRlbXM6IHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxUPltdO1xuXHRyZWFkb25seSBsaXN0T3B0aW9ucz86IElBY3Rpb25MaXN0T3B0aW9ucztcbn1cblxuLyoqXG4gKiBEZXNjcmliZXMgb25lIHRhYiBpbiBhIHtAbGluayBUYWJiZWRBY3Rpb25MaXN0V2lkZ2V0fS4gVGhlIHtAbGluayBpZH1cbiAqIGlzIHRoZSBzdGFibGUgaWRlbnRpdHkgdXNlZCBldmVyeXdoZXJlIHRoZSB3aWRnZXQgcmVhc29ucyBhYm91dCBhXG4gKiB0YWIgKGluaXRpYWwgc2VsZWN0aW9uLCBjaGFuZ2UgZXZlbnRzLCBgY3JlYXRlQWN0aW9uTGlzdGAgY2FsbGJhY2spO1xuICoge0BsaW5rIGxhYmVsfSwge0BsaW5rIHRvb2x0aXB9LCBhbmQge0BsaW5rIGljb259IGFyZSBwcmVzZW50YXRpb24gb25seS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGFiRGVzY3JpcHRvciB7XG5cdC8qKiBTdGFibGUgaWRlbnRpZmllciB1c2VkIGZvciB0YWIgaWRlbnRpdHkgYW5kIHNlbGVjdGlvbiBjYWxsYmFja3MuICovXG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdC8qKiBWaXNpYmxlIGxhYmVsLiBEZWZhdWx0cyB0byB7QGxpbmsgaWR9LiBMb2NhbGl6ZSBhdCB0aGUgY2FsbCBzaXRlLiAqL1xuXHRyZWFkb25seSBsYWJlbD86IHN0cmluZztcblx0LyoqIEhvdmVyIHRvb2x0aXAuIERlZmF1bHRzIHRvIHtAbGluayBsYWJlbH0gPz8ge0BsaW5rIGlkfS4gKi9cblx0cmVhZG9ubHkgdG9vbHRpcD86IHN0cmluZztcblx0LyoqIE9wdGlvbmFsIGxlYWRpbmcgaWNvbiByZW5kZXJlZCBiZWZvcmUgdGhlIGxhYmVsLiAqL1xuXHRyZWFkb25seSBpY29uPzogVGhlbWVJY29uO1xufVxuXG4vKipcbiAqIE9wdGlvbnMgZm9yIHtAbGluayBUYWJiZWRBY3Rpb25MaXN0V2lkZ2V0LnNob3d9LiBUaGUgd2lkZ2V0IHJlbmRlcnMgYVxuICogdGFiIGJhciBhYm92ZSBhbiBgQWN0aW9uTGlzdGAgaW5zaWRlIGEgc2luZ2xlIHBvcHVwLiBDb25zdW1lcnMgZGVzY3JpYmVcbiAqIGhvdyB0byBjb21wdXRlIGl0ZW1zIGZvciBlYWNoIHRhYjsgdGhlIHdpZGdldCBoYW5kbGVzIHRhYiBzd2l0Y2hpbmcgYW5kXG4gKiBsaWZlY3ljbGUgaW50ZXJuYWxseS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGFiYmVkQWN0aW9uTGlzdFNob3dPcHRpb25zPFQ+IHtcblx0LyoqIExvZ2ljYWwgdXNlciAvIHNvdXJjZSBpZGVudGlmaWVyIHBhc3NlZCB0aHJvdWdoIHRvIHtAbGluayBBY3Rpb25MaXN0fS4gKi9cblx0cmVhZG9ubHkgdXNlcjogc3RyaW5nO1xuXHQvKiogRWxlbWVudCB0aGUgcG9wdXAgaXMgYW5jaG9yZWQgdG8uICovXG5cdHJlYWRvbmx5IGFuY2hvcjogSFRNTEVsZW1lbnQ7XG5cdC8qKiBUYWJzIHJlbmRlcmVkIGluIG9yZGVyLiAqL1xuXHRyZWFkb25seSB0YWJzOiByZWFkb25seSBJVGFiRGVzY3JpcHRvcltdO1xuXHQvKiogSW5pdGlhbGx5IGFjdGl2ZSB0YWIgaWQuIE11c3QgbWF0Y2ggYW4gZW50cnkgaW4ge0BsaW5rIHRhYnN9LiAqL1xuXHRyZWFkb25seSBpbml0aWFsVGFiOiBzdHJpbmc7XG5cdC8qKiBDb21wdXRlcyB0aGUgbGlzdCBpdGVtcyBhbmQgcGVyLXRhYiBvcHRpb25zIHNob3duIHdoZW4gdGhlIGdpdmVuIHRhYiBpcyBhY3RpdmUuICovXG5cdGNyZWF0ZUFjdGlvbkxpc3QoYWN0aXZlVGFiOiBzdHJpbmcpOiBJVGFiYmVkQWN0aW9uTGlzdEJ1aWxkUmVzdWx0PFQ+O1xuXHQvKiogSXRlbSBkZWxlZ2F0ZSAoc2VsZWN0aW9uLCBoaWRlLCBmb2N1cykuICovXG5cdHJlYWRvbmx5IGRlbGVnYXRlOiBJQWN0aW9uTGlzdERlbGVnYXRlPFQ+O1xuXHQvKiogT3B0aW9uYWwgYWNjZXNzaWJpbGl0eSBwcm92aWRlciBwYXNzZWQgdG8gdGhlIHVuZGVybHlpbmcgbGlzdC4gKi9cblx0cmVhZG9ubHkgYWNjZXNzaWJpbGl0eVByb3ZpZGVyPzogUGFydGlhbDxJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxJQWN0aW9uTGlzdEl0ZW08VD4+Pjtcblx0LyoqIE9wdGlvbmFsIGZpeGVkIHBvcHVwIHdpZHRoLiAqL1xuXHRyZWFkb25seSB3aWR0aD86IG51bWJlcjtcblx0LyoqIE9wdGlvbmFsIGNsYXNzIG5hbWUgdG8gYWRkIHRvIHRoZSB0YWIgYmFyIGVsZW1lbnQgKGluIGFkZGl0aW9uIHRvIGAudGFiYmVkLWFjdGlvbi1saXN0LXRhYmJhcmApLiBNdXN0IGJlIGEgc2luZ2xlIGNsYXNzLiAqL1xuXHRyZWFkb25seSB0YWJCYXJDbGFzc05hbWU/OiBzdHJpbmc7XG59XG5cbi8qKlxuICogQSB3aWRnZXQgdGhhdCBzaG93cyBhIHRhYmJlZCBhY3Rpb24gbGlzdCBpbiBhIGNvbnRleHQgdmlldyBwb3B1cFxuICovXG5leHBvcnQgY2xhc3MgVGFiYmVkQWN0aW9uTGlzdFdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlVGFiID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VUYWIgPSB0aGlzLl9vbkRpZENoYW5nZVRhYi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEhpZGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRIaWRlID0gdGhpcy5fb25EaWRIaWRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVBvcHVwID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRwcml2YXRlIF9zd2FwcGluZ1RhYiA9IGZhbHNlO1xuXG5cdGdldCBpc1Zpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhdGhpcy5fYWN0aXZlUG9wdXAudmFsdWU7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNob3dzIHRoZSBwb3B1cCBhbmNob3JlZCB0byB7QGxpbmsgSVRhYmJlZEFjdGlvbkxpc3RTaG93T3B0aW9ucy5hbmNob3J9LlxuXHQgKiBJZiBhIHBvcHVwIGlzIGFscmVhZHkgdmlzaWJsZSwgaXQgaXMgcmVwbGFjZWQgaW4gcGxhY2UuXG5cdCAqL1xuXHRzaG93PFQ+KG9wdGlvbnM6IElUYWJiZWRBY3Rpb25MaXN0U2hvd09wdGlvbnM8VD4pOiB2b2lkIHtcblx0XHRjb25zdCBpc1N3YXAgPSB0aGlzLmlzVmlzaWJsZTtcblx0XHRpZiAoaXNTd2FwKSB7XG5cdFx0XHR0aGlzLl9zd2FwcGluZ1RhYiA9IHRydWU7XG5cdFx0XHR0aGlzLl9hY3RpdmVQb3B1cC52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgYWN0aXZlVGFiID0gb3B0aW9ucy5pbml0aWFsVGFiO1xuXHRcdGNvbnN0IHBvcHVwRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBoaWRlID0gKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2FjdGl2ZVBvcHVwLnZhbHVlID09PSBwb3B1cERpc3Bvc2FibGVzKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZVBvcHVwLnZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBSZXNlcnZlIHRoZSBkaXNwb3NhYmxlIHNsb3QgdXAtZnJvbnQgc28gYW55IHN5bmNocm9ub3VzIGhpZGVcblx0XHQvLyB0cmlnZ2VyZWQgZHVyaW5nIHJlbmRlciAoZS5nLiBhbiBpbW1lZGlhdGUgc2VsZWN0aW9uKSBmaW5kcyB0aGVcblx0XHQvLyBleHBlY3RlZCBkaXNwb3NhYmxlIHRvIGNsZWFyLlxuXHRcdHRoaXMuX2FjdGl2ZVBvcHVwLnZhbHVlID0gcG9wdXBEaXNwb3NhYmxlcztcblx0XHRwb3B1cERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLmhpZGVDb250ZXh0VmlldygpO1xuXHRcdH0pKTtcblxuXHRcdGxldCBsaXN0UmVmOiBBY3Rpb25MaXN0PFQ+IHwgdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLnNob3dDb250ZXh0Vmlldyh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IG9wdGlvbnMuYW5jaG9yLFxuXHRcdFx0cmVuZGVyOiAoY29udGFpbmVyOiBIVE1MRWxlbWVudCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZW5kZXJEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5hY3Rpb24td2lkZ2V0JykpO1xuXG5cdFx0XHRcdGNvbnN0IHRhYkJhciA9IGRvbS5hcHBlbmQod2lkZ2V0LCBkb20uJCgnLnRhYmJlZC1hY3Rpb24tbGlzdC10YWJiYXInKSk7XG5cdFx0XHRcdGlmIChvcHRpb25zLnRhYkJhckNsYXNzTmFtZSkge1xuXHRcdFx0XHRcdHRhYkJhci5jbGFzc0xpc3QuYWRkKG9wdGlvbnMudGFiQmFyQ2xhc3NOYW1lKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCByYWRpbyA9IHJlbmRlckRpc3Bvc2FibGVzLmFkZChuZXcgUmFkaW8oe1xuXHRcdFx0XHRcdGl0ZW1zOiBvcHRpb25zLnRhYnMubWFwKHRhYiA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IHRhYi5sYWJlbCA/PyB0YWIuaWQ7XG5cdFx0XHRcdFx0XHRjb25zdCB0ZXh0ID0gdGFiLmljb24gPyBgJCgke3RhYi5pY29uLmlkfSkgJHtsYWJlbH1gIDogbGFiZWw7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyB0ZXh0LCB0b29sdGlwOiB0YWIudG9vbHRpcCA/PyBsYWJlbCwgaXNBY3RpdmU6IHRhYi5pZCA9PT0gYWN0aXZlVGFiIH07XG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0dGFiQmFyLmFwcGVuZENoaWxkKHJhZGlvLmRvbU5vZGUpO1xuXG5cdFx0XHRcdGNvbnN0IGFjdGl2YXRlVGFiID0gKG5leHQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdGlmIChuZXh0ID09PSBhY3RpdmVUYWIpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YWN0aXZlVGFiID0gbmV4dDtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVRhYi5maXJlKG5leHQpO1xuXHRcdFx0XHRcdHRoaXMuc2hvdyh7IC4uLm9wdGlvbnMsIGluaXRpYWxUYWI6IG5leHQgfSk7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0cmVuZGVyRGlzcG9zYWJsZXMuYWRkKHJhZGlvLm9uRGlkU2VsZWN0KGluZGV4ID0+IHtcblx0XHRcdFx0XHRjb25zdCBuZXh0ID0gb3B0aW9ucy50YWJzW2luZGV4XTtcblx0XHRcdFx0XHRpZiAobmV4dCkge1xuXHRcdFx0XHRcdFx0YWN0aXZhdGVUYWIobmV4dC5pZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Y29uc3QgeyBpdGVtcywgbGlzdE9wdGlvbnMgfSA9IG9wdGlvbnMuY3JlYXRlQWN0aW9uTGlzdChhY3RpdmVUYWIpO1xuXHRcdFx0XHRjb25zdCBsaXN0ID0gcmVuZGVyRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdEFjdGlvbkxpc3Q8VD4sXG5cdFx0XHRcdFx0b3B0aW9ucy51c2VyLFxuXHRcdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRcdGl0ZW1zLFxuXHRcdFx0XHRcdG9wdGlvbnMuZGVsZWdhdGUsXG5cdFx0XHRcdFx0b3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIsXG5cdFx0XHRcdFx0bGlzdE9wdGlvbnMsXG5cdFx0XHRcdFx0b3B0aW9ucy5hbmNob3IsXG5cdFx0XHRcdCkpO1xuXHRcdFx0XHRsaXN0UmVmID0gbGlzdDtcblxuXHRcdFx0XHRpZiAobGlzdC5maWx0ZXJDb250YWluZXIpIHtcblx0XHRcdFx0XHR3aWRnZXQuYXBwZW5kQ2hpbGQobGlzdC5maWx0ZXJDb250YWluZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHdpZGdldC5hcHBlbmRDaGlsZChsaXN0LmRvbU5vZGUpO1xuXG5cdFx0XHRcdGNvbnN0IHdpZHRoID0gbGlzdC5sYXlvdXQoMCk7XG5cdFx0XHRcdHdpZGdldC5zdHlsZS53aWR0aCA9IGAke29wdGlvbnMud2lkdGggPz8gd2lkdGh9cHhgO1xuXHRcdFx0XHRsaXN0LmZvY3VzKCk7XG5cblx0XHRcdFx0Ly8gS2V5Ym9hcmQgbmF2LiBCb3VuZCB0byB0aGUgcG9wdXAgd2lkZ2V0IHNvIHdlIGRvbid0XG5cdFx0XHRcdC8vIG9ic2VydmUgdW5yZWxhdGVkIGRvY3VtZW50LXdpZGUga2V5cHJlc3Nlcy5cblx0XHRcdFx0cmVuZGVyRGlzcG9zYWJsZXMuYWRkKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih3aWRnZXQsICdrZXlkb3duJywgZSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdGFyZ2V0ID0gZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQgfCBudWxsO1xuXHRcdFx0XHRcdGNvbnN0IG9uVGFiQmFyID0gISF0YXJnZXQ/LmNsb3Nlc3QoJy50YWJiZWQtYWN0aW9uLWxpc3QtdGFiYmFyJyk7XG5cdFx0XHRcdFx0Y29uc3Qgb25FZGl0YWJsZSA9ICEhdGFyZ2V0Py5jbG9zZXN0KCdpbnB1dCwgdGV4dGFyZWEsIFtjb250ZW50ZWRpdGFibGU9XCJ0cnVlXCJdJyk7XG5cblx0XHRcdFx0XHRpZiAoZS5rZXlDb2RlID09PSBLZXlDb2RlLkVzY2FwZSkge1xuXHRcdFx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRoaWRlKCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlLmtleUNvZGUgPT09IEtleUNvZGUuRW50ZXIgJiYgIW9uVGFiQmFyKSB7XG5cdFx0XHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0XHRcdGxpc3QuYWNjZXB0U2VsZWN0ZWQoKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGUua2V5Q29kZSA9PT0gS2V5Q29kZS5VcEFycm93ICYmICFvblRhYkJhcikge1xuXHRcdFx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRsaXN0LmZvY3VzUHJldmlvdXMoKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGUua2V5Q29kZSA9PT0gS2V5Q29kZS5Eb3duQXJyb3cgJiYgIW9uVGFiQmFyKSB7XG5cdFx0XHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0XHRcdGxpc3QuZm9jdXNOZXh0KCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChlLmtleUNvZGUgIT09IEtleUNvZGUuTGVmdEFycm93ICYmIGUua2V5Q29kZSAhPT0gS2V5Q29kZS5SaWdodEFycm93KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChvbkVkaXRhYmxlICYmICFvblRhYkJhcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBjdXJyZW50SW5kZXggPSBvcHRpb25zLnRhYnMuZmluZEluZGV4KHQgPT4gdC5pZCA9PT0gYWN0aXZlVGFiKTtcblx0XHRcdFx0XHRpZiAoY3VycmVudEluZGV4IDwgMCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBkZWx0YSA9IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5SaWdodEFycm93ID8gMSA6IC0xO1xuXHRcdFx0XHRcdGNvbnN0IG5leHRJbmRleCA9IChjdXJyZW50SW5kZXggKyBkZWx0YSArIG9wdGlvbnMudGFicy5sZW5ndGgpICUgb3B0aW9ucy50YWJzLmxlbmd0aDtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHRhY3RpdmF0ZVRhYihvcHRpb25zLnRhYnNbbmV4dEluZGV4XS5pZCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHQvLyBEaXNtaXNzIHdoZW4gZm9jdXMgbGVhdmVzIHRoZSBwb3B1cC4gU3VwcHJlc3NlZCBkdXJpbmcgYVxuXHRcdFx0XHQvLyB0YWIgc3dhcCBzbyB0aGUgdGVhcmRvd24gb2YgdGhlIHByZXZpb3VzIHBvcHVwIGRvZXNuJ3Rcblx0XHRcdFx0Ly8gdGFrZSB0aGUgbmV3IG9uZSBkb3duIHdpdGggaXQuXG5cdFx0XHRcdGNvbnN0IGZvY3VzVHJhY2tlciA9IHJlbmRlckRpc3Bvc2FibGVzLmFkZChkb20udHJhY2tGb2N1cyhjb250YWluZXIpKTtcblx0XHRcdFx0cmVuZGVyRGlzcG9zYWJsZXMuYWRkKGZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLl9zd2FwcGluZ1RhYikge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gZG9tLmdldEFjdGl2ZUVsZW1lbnQoKTtcblx0XHRcdFx0XHRpZiAoYWN0aXZlRWxlbWVudCAmJiAoYWN0aXZlRWxlbWVudC5jbG9zZXN0KCcuYWN0aW9uLXdpZGdldC1ob3ZlcicpIHx8IGFjdGl2ZUVsZW1lbnQuY2xvc2VzdCgnLmFjdGlvbi1saXN0LXN1Ym1lbnUtcGFuZWwnKSkpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aGlkZSgpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0cmV0dXJuIHJlbmRlckRpc3Bvc2FibGVzO1xuXHRcdFx0fSxcblx0XHRcdG9uSGlkZTogKCkgPT4ge1xuXHRcdFx0XHRsaXN0UmVmID0gdW5kZWZpbmVkO1xuXHRcdFx0XHQvLyBTa2lwIGNvbnN1bWVyIGNhbGxiYWNrcyBkdXJpbmcgYSB0YWIgc3dhcCBcdTIwMTQgd2UgYXJlIGFib3V0XG5cdFx0XHRcdC8vIHRvIHJlLXNob3cgd2l0aCB0aGUgc2FtZSBhbmNob3IsIHNvIHRoZSBjb25zdW1lciBzaG91bGRcblx0XHRcdFx0Ly8gbm90IGUuZy4gcmVmb2N1cyB0aGUgdHJpZ2dlciBidXR0b24gYmV0d2VlbiBoaWRlIGFuZCBzaG93LlxuXHRcdFx0XHRpZiAodGhpcy5fc3dhcHBpbmdUYWIpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRXh0ZXJuYWwgZGlzbWlzc2FsIChFc2NhcGUsIGNsaWNrIG91dHNpZGUpIFx1MjAxNCBjbGVhciBvdXJcblx0XHRcdFx0Ly8gb3duIHRyYWNrZXIgc28gYGlzVmlzaWJsZWAgcmVmbGVjdHMgcmVhbGl0eS4gRG9uZSBiZWZvcmVcblx0XHRcdFx0Ly8gZmlyaW5nIGNvbnN1bWVyIGNhbGxiYWNrcyBpbiBjYXNlIHRoZXkgcmUtc2hvdy5cblx0XHRcdFx0aWYgKHRoaXMuX2FjdGl2ZVBvcHVwLnZhbHVlID09PSBwb3B1cERpc3Bvc2FibGVzKSB7XG5cdFx0XHRcdFx0dGhpcy5fYWN0aXZlUG9wdXAudmFsdWUgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3B0aW9ucy5kZWxlZ2F0ZS5vbkhpZGU/LigpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZEhpZGUuZmlyZSgpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBhbmNob3JQb3NpdGlvbigpIHsgcmV0dXJuIGxpc3RSZWY/LmFuY2hvclBvc2l0aW9uOyB9LFxuXHRcdH0sIHVuZGVmaW5lZCwgZmFsc2UpO1xuXG5cdFx0aWYgKGlzU3dhcCkge1xuXHRcdFx0dGhpcy5fc3dhcHBpbmdUYWIgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRoaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGl2ZVBvcHVwLnZhbHVlID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmVQb3B1cC52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxpQkFBaUIsbUJBQW1CLG9CQUFvQjtBQUU3RSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtCQUE0RTtBQUNyRixPQUFPO0FBMkRBLElBQU0seUJBQU4sY0FBcUMsV0FBVztBQUFBLEVBZXRELFlBQ3VDLHFCQUNFLHVCQUN2QztBQUNELFVBQU07QUFIZ0M7QUFDRTtBQWZ6QyxTQUFpQixrQkFBa0IsS0FBSyxVQUFVLElBQUksUUFBZ0IsQ0FBQztBQUN2RSxTQUFTLGlCQUFpQixLQUFLLGdCQUFnQjtBQUUvQyxTQUFpQixhQUFhLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUNoRSxTQUFTLFlBQVksS0FBSyxXQUFXO0FBRXJDLFNBQWlCLGVBQWUsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFDdEUsU0FBUSxlQUFlO0FBQUEsRUFXdkI7QUFBQSxFQVRBLElBQUksWUFBcUI7QUFDeEIsV0FBTyxDQUFDLENBQUMsS0FBSyxhQUFhO0FBQUEsRUFDNUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBYUEsS0FBUSxTQUFnRDtBQUN2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
