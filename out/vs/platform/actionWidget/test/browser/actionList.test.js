import assert from "assert";
import { mainWindow } from "../../../../base/browser/window.js";
import { toAction } from "../../../../base/common/actions.js";
import { DeferredPromise, timeout } from "../../../../base/common/async.js";
import { Event as CommonEvent } from "../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { IContextViewService } from "../../../contextview/browser/contextView.js";
import { IHoverService } from "../../../hover/browser/hover.js";
import { NullHoverService } from "../../../hover/test/browser/nullHoverService.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { MockKeybindingService } from "../../../keybinding/test/common/mockKeybindingService.js";
import { IKeybindingService } from "../../../keybinding/common/keybinding.js";
import { ILayoutService } from "../../../layout/browser/layoutService.js";
import { IOpenerService } from "../../../opener/common/opener.js";
import { NullOpenerService } from "../../../opener/test/common/nullOpenerService.js";
import { URI } from "../../../../base/common/uri.js";
import { ActionList, ActionListItemKind, ActionListWidget } from "../../browser/actionList.js";
import { AnchorPosition } from "../../../../base/common/layout.js";
function action(id) {
  return { kind: ActionListItemKind.Action, label: id, item: { id } };
}
function separator(label) {
  return { kind: ActionListItemKind.Separator, label };
}
function createActionListWidget(disposables, options) {
  const instantiationService = disposables.add(new TestInstantiationService());
  instantiationService.set(IKeybindingService, new MockKeybindingService());
  instantiationService.set(IHoverService, NullHoverService);
  instantiationService.set(IOpenerService, NullOpenerService);
  const delegate = options.onFilter ? {
    onHide: () => {
    },
    onSelect: () => {
    },
    onFilter: options.onFilter
  } : {
    onHide: () => {
    },
    onSelect: () => {
    }
  };
  const widget = disposables.add(instantiationService.createInstance(
    ActionListWidget,
    "testActionList",
    false,
    options.items ?? [action("initial")],
    delegate,
    void 0,
    { showFilter: true, ...options.listOptions }
  ));
  if (widget.filterContainer) {
    document.body.appendChild(widget.filterContainer);
    disposables.add({ dispose: () => widget.filterContainer?.remove() });
  }
  const headerContainer = widget.headerContainer;
  if (headerContainer) {
    document.body.appendChild(headerContainer);
    disposables.add({ dispose: () => headerContainer.remove() });
  }
  document.body.appendChild(widget.domNode);
  disposables.add({ dispose: () => widget.domNode.remove() });
  widget.layout(200, 200);
  return widget;
}
function typeFilter(widget, value) {
  assert.ok(widget.filterInput);
  widget.filterInput.value = value;
  widget.filterInput.dispatchEvent(new Event("input"));
}
function getVisibleRowText(widget) {
  return Array.from(widget.domNode.querySelectorAll(".monaco-list-row")).map((row) => row.textContent ?? "").filter((text) => text.length > 0);
}
function withWindowInnerHeight(height, callback) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(mainWindow, "innerHeight");
  Object.defineProperty(mainWindow, "innerHeight", { configurable: true, value: height });
  try {
    return callback();
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(mainWindow, "innerHeight", originalDescriptor);
    } else {
      Reflect.deleteProperty(mainWindow, "innerHeight");
    }
  }
}
function createActionList(disposables, items, options) {
  const instantiationService = disposables.add(new TestInstantiationService());
  instantiationService.set(IKeybindingService, new MockKeybindingService());
  instantiationService.set(IHoverService, NullHoverService);
  instantiationService.set(IOpenerService, NullOpenerService);
  instantiationService.stub(IContextViewService, {
    layout: () => {
    },
    hideContextView: () => {
    },
    getContextViewElement: () => document.body
  });
  instantiationService.stub(ILayoutService, {
    getContainer: () => document.body,
    mainContainer: document.body,
    activeContainer: document.body,
    onDidLayoutMainContainer: CommonEvent.None,
    onDidLayoutContainer: CommonEvent.None,
    onDidLayoutActiveContainer: CommonEvent.None,
    onDidAddContainer: CommonEvent.None,
    onDidChangeActiveContainer: CommonEvent.None
  });
  const list = disposables.add(instantiationService.createInstance(
    ActionList,
    "testActionList",
    false,
    items,
    {
      onHide: () => {
      },
      onSelect: () => {
      }
    },
    void 0,
    { showFilter: true, ...options?.listOptions },
    options?.anchor ?? { x: 10, y: 150, width: 20, height: 20 }
  ));
  const widget = document.createElement("div");
  widget.classList.add("action-widget");
  document.body.appendChild(widget);
  disposables.add({ dispose: () => widget.remove() });
  if (list.filterContainer) {
    widget.appendChild(list.filterContainer);
  }
  widget.appendChild(list.domNode);
  return list;
}
suite("ActionListWidget", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("runs dynamic filter updates immediately", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const filters = [];
    const widget = createActionListWidget(disposables, {
      onFilter: async (filter) => {
        filters.push(filter);
        return [action(`server-${filter === "ma" ? "ranked" : filter}-result`)];
      }
    });
    typeFilter(widget, "m");
    typeFilter(widget, "ma");
    assert.deepStrictEqual(filters, ["m", "ma"]);
    await timeout(0);
    assert.ok(widget.domNode.textContent?.includes("server-ranked-result"));
  }));
  test("ignores stale dynamic filter results", async () => {
    const firstResult = new DeferredPromise();
    const secondResult = new DeferredPromise();
    const filters = [];
    const widget = createActionListWidget(disposables, {
      onFilter: (filter) => {
        filters.push(filter);
        return filter === "m" ? firstResult.p : secondResult.p;
      }
    });
    typeFilter(widget, "m");
    typeFilter(widget, "ma");
    assert.deepStrictEqual(filters, ["m", "ma"]);
    firstResult.complete([action("ma-stale-result")]);
    await timeout(0);
    assert.ok(!widget.domNode.textContent?.includes("ma-stale-result"));
    secondResult.complete([action("ma-fresh-result")]);
    await timeout(0);
    assert.ok(widget.domNode.textContent?.includes("ma-fresh-result"));
  });
  test("does not filter while an IME composition is in progress", () => {
    const filters = [];
    const widget = createActionListWidget(disposables, {
      onFilter: async (filter) => {
        filters.push(filter);
        return [action(`result-${filter}`)];
      }
    });
    assert.ok(widget.filterInput);
    widget.filterInput.dispatchEvent(new Event("compositionstart"));
    typeFilter(widget, "d");
    typeFilter(widget, "deepseek");
    widget.filterInput.value = "DeepSeek";
    widget.filterInput.dispatchEvent(new Event("compositionend"));
    typeFilter(widget, "DeepSeek");
    assert.deepStrictEqual(filters, ["DeepSeek"]);
  });
  test("cancels an in-flight dynamic filter when a composition starts", async () => {
    const pending = new DeferredPromise();
    const widget = createActionListWidget(disposables, {
      onFilter: () => pending.p
    });
    typeFilter(widget, "d");
    assert.ok(widget.filterInput);
    widget.filterInput.dispatchEvent(new Event("compositionstart"));
    pending.complete([action("stale-result")]);
    await timeout(0);
    assert.ok(!widget.domNode.textContent?.includes("stale-result"));
  });
  test("batches row width writes before reading layout", () => {
    const widget = createActionListWidget(disposables, {
      items: [
        action("first"),
        { ...action("second"), toolbarActions: [toAction({ id: "toolbar", label: "Toolbar", run: () => {
        } })] },
        action("third")
      ]
    });
    const rows = Array.from(widget.domNode.querySelectorAll(".monaco-list-row"));
    const allRowsAutoAtRead = [];
    const measuredWidths = [120, 240, 180];
    for (let i = 0; i < rows.length; i++) {
      rows[i].getBoundingClientRect = () => {
        allRowsAutoAtRead.push(rows.every((row) => row.style.width === "auto"));
        return new mainWindow.DOMRect(0, 0, measuredWidths[i], 24);
      };
    }
    const width = widget.computeMaxWidth(0);
    assert.deepStrictEqual({
      width,
      allRowsAutoAtRead,
      restoredWidths: rows.map((row) => row.style.width)
    }, {
      width: 268,
      allRowsAutoAtRead: [true, true, true],
      restoredWidths: ["", "", ""]
    });
  });
  test("keeps titled separator above first filtered match", () => {
    const widget = createActionListWidget(disposables, {
      items: [
        separator("Provider A"),
        action("alpha"),
        separator("Provider B"),
        action("beta")
      ]
    });
    typeFilter(widget, "alpha");
    assert.deepStrictEqual(getVisibleRowText(widget), ["Provider A", "alpha"]);
  });
  test("keeps only titled separators for sections with filtered matches", () => {
    const widget = createActionListWidget(disposables, {
      items: [
        separator("Provider A"),
        action("alpha"),
        separator("Provider B"),
        action("beta"),
        separator("Provider C"),
        action("gamma")
      ]
    });
    typeFilter(widget, "beta");
    assert.deepStrictEqual(getVisibleRowText(widget), ["Provider B", "beta"]);
  });
  test("leaves room for action widget chrome when clamping dynamic height", () => withWindowInnerHeight(300, () => {
    const list = createActionList(disposables, Array.from({ length: 50 }, (_, i) => action(`item-${i}`)));
    list.layout(200);
    const filterHeight = 36;
    const widget = list.domNode.parentElement;
    const style = mainWindow.getComputedStyle(widget);
    const toPixels = (value) => Number.parseFloat(value) || 0;
    const actionWidgetVerticalChromeHeight = toPixels(style.paddingTop) + toPixels(style.paddingBottom) + toPixels(style.borderTopWidth) + toPixels(style.borderBottomWidth);
    const availableSpaceAboveAnchor = 150;
    const listHeight = parseFloat(list.domNode.style.height);
    assert.ok(listHeight + filterHeight + actionWidgetVerticalChromeHeight <= availableSpaceAboveAnchor);
  }));
  test("forced above anchor position can clamp dynamic height without the default minimum floor", () => withWindowInnerHeight(300, () => {
    const list = createActionList(disposables, Array.from({ length: 50 }, (_, i) => action(`item-${i}`)), {
      listOptions: { anchorPosition: AnchorPosition.ABOVE },
      anchor: { x: 10, y: 20, width: 20, height: 20 }
    });
    list.layout(200);
    assert.deepStrictEqual(
      { anchorPosition: list.anchorPosition, listHeight: parseFloat(list.domNode.style.height) },
      { anchorPosition: AnchorPosition.ABOVE, listHeight: 0 }
    );
  }));
  test("header dismiss removes the banner and requests a re-layout", () => {
    let dismissed = false;
    let layoutRequested = false;
    const widget = createActionListWidget(disposables, {
      listOptions: { headerText: "Cache hint", headerDismiss: () => {
        dismissed = true;
      } }
    });
    disposables.add(widget.onDidRequestLayout(() => {
      layoutRequested = true;
    }));
    const header = widget.headerContainer;
    assert.ok(header, "header banner should render when headerText + headerDismiss are set");
    const dismissButton = header.querySelector(".action-list-header-dismiss");
    assert.ok(dismissButton, "dismiss button should render");
    dismissButton.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    assert.deepStrictEqual(
      { dismissed, layoutRequested, headerCleared: widget.headerContainer === void 0, headerStillInDom: header.isConnected },
      { dismissed: true, layoutRequested: true, headerCleared: true, headerStillInDom: false }
    );
  });
  test("shows a row hover panel once the hover delay elapses", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const widget = createActionListWidget(disposables, {
      items: [{ ...action("auto"), hover: { content: "Auto routes based on your task" } }, action("other")],
      listOptions: { headerText: "Cache hint" }
    });
    const panel = widget.domNode.querySelector(".action-list-submenu-panel");
    widget.domNode.querySelector(".monaco-list-row").dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await timeout(1e3);
    assert.deepStrictEqual({ display: panel.style.display, text: panel.textContent }, { display: "", text: "Auto routes based on your task" });
  }));
  test("does not open a row hover panel once the pointer has left the list", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const widget = createActionListWidget(disposables, {
      items: [{ ...action("auto"), hover: { content: "Auto routes based on your task" } }, action("other")],
      listOptions: { headerText: "Cache hint" }
    });
    const panel = widget.domNode.querySelector(".action-list-submenu-panel");
    widget.domNode.querySelector(".monaco-list-row").dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    widget.domNode.dispatchEvent(new MouseEvent("mouseleave"));
    await timeout(1e3);
    assert.deepStrictEqual({ display: panel.style.display, text: panel.textContent }, { display: "none", text: "" });
  }));
  test("dismisses an open row hover panel when the pointer reaches the header banner", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const widget = createActionListWidget(disposables, {
      items: [{ ...action("auto"), hover: { content: "Auto routes based on your task" } }, action("other")],
      listOptions: { headerText: "Cache hint" }
    });
    const panel = widget.domNode.querySelector(".action-list-submenu-panel");
    widget.domNode.querySelector(".monaco-list-row").dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await timeout(600);
    const openedWhileOnRow = panel.textContent;
    widget.domNode.dispatchEvent(new MouseEvent("mouseleave"));
    widget.headerContainer.dispatchEvent(new MouseEvent("mouseenter"));
    assert.deepStrictEqual(
      { openedWhileOnRow, display: panel.style.display, text: panel.textContent },
      { openedWhileOnRow: "Auto routes based on your task", display: "none", text: "" }
    );
  }));
  test('header renders a "Learn more" link to the given uri', () => {
    const widget = createActionListWidget(disposables, {
      listOptions: { headerText: "Cache hint", headerLink: { label: "Learn more", uri: URI.parse("https://aka.ms/test") } }
    });
    const link = widget.headerContainer?.querySelector("a.monaco-link");
    assert.ok(link, 'a "Learn more" link should render in the header');
    assert.deepStrictEqual(
      { text: link.textContent, href: link.getAttribute("href") },
      { text: "Learn more", href: "https://aka.ms/test" }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FjdGlvbldpZGdldC90ZXN0L2Jyb3dzZXIvYWN0aW9uTGlzdC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IGFzIENvbW1vbkV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgTnVsbEhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2hvdmVyL3Rlc3QvYnJvd3Nlci9udWxsSG92ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IE1vY2tLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgTnVsbE9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9vcGVuZXIvdGVzdC9jb21tb24vbnVsbE9wZW5lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEFjdGlvbkxpc3QsIEFjdGlvbkxpc3RJdGVtS2luZCwgQWN0aW9uTGlzdFdpZGdldCwgSUFjdGlvbkxpc3RJdGVtLCBJQWN0aW9uTGlzdE9wdGlvbnMgfSBmcm9tICcuLi8uLi9icm93c2VyL2FjdGlvbkxpc3QuanMnO1xuaW1wb3J0IHsgQW5jaG9yUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXlvdXQuanMnO1xuXG5pbnRlcmZhY2UgSVRlc3RBY3Rpb25JdGVtIHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcbn1cblxuZnVuY3Rpb24gYWN0aW9uKGlkOiBzdHJpbmcpOiBJQWN0aW9uTGlzdEl0ZW08SVRlc3RBY3Rpb25JdGVtPiB7XG5cdHJldHVybiB7IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sIGxhYmVsOiBpZCwgaXRlbTogeyBpZCB9IH07XG59XG5cbmZ1bmN0aW9uIHNlcGFyYXRvcihsYWJlbD86IHN0cmluZyk6IElBY3Rpb25MaXN0SXRlbTxJVGVzdEFjdGlvbkl0ZW0+IHtcblx0cmV0dXJuIHsga2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLlNlcGFyYXRvciwgbGFiZWwgfTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlQWN0aW9uTGlzdFdpZGdldChkaXNwb3NhYmxlczogUmV0dXJuVHlwZTx0eXBlb2YgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlPiwgb3B0aW9uczoge1xuXHRyZWFkb25seSBpdGVtcz86IHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxJVGVzdEFjdGlvbkl0ZW0+W107XG5cdHJlYWRvbmx5IG9uRmlsdGVyPzogKGZpbHRlcjogc3RyaW5nLCBjYW5jZWxsYXRpb25Ub2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2U8cmVhZG9ubHkgSUFjdGlvbkxpc3RJdGVtPElUZXN0QWN0aW9uSXRlbT5bXT47XG5cdHJlYWRvbmx5IGxpc3RPcHRpb25zPzogUGFydGlhbDxJQWN0aW9uTGlzdE9wdGlvbnM+O1xufSk6IEFjdGlvbkxpc3RXaWRnZXQ8SVRlc3RBY3Rpb25JdGVtPiB7XG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJS2V5YmluZGluZ1NlcnZpY2UsIG5ldyBNb2NrS2V5YmluZGluZ1NlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJSG92ZXJTZXJ2aWNlLCBOdWxsSG92ZXJTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElPcGVuZXJTZXJ2aWNlLCBOdWxsT3BlbmVyU2VydmljZSk7XG5cdGNvbnN0IGRlbGVnYXRlID0gb3B0aW9ucy5vbkZpbHRlclxuXHRcdD8ge1xuXHRcdFx0b25IaWRlOiAoKSA9PiB7IH0sXG5cdFx0XHRvblNlbGVjdDogKCkgPT4geyB9LFxuXHRcdFx0b25GaWx0ZXI6IG9wdGlvbnMub25GaWx0ZXIsXG5cdFx0fVxuXHRcdDoge1xuXHRcdFx0b25IaWRlOiAoKSA9PiB7IH0sXG5cdFx0XHRvblNlbGVjdDogKCkgPT4geyB9LFxuXHRcdH07XG5cblx0Y29uc3Qgd2lkZ2V0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdEFjdGlvbkxpc3RXaWRnZXQ8SVRlc3RBY3Rpb25JdGVtPixcblx0XHQndGVzdEFjdGlvbkxpc3QnLFxuXHRcdGZhbHNlLFxuXHRcdG9wdGlvbnMuaXRlbXMgPz8gW2FjdGlvbignaW5pdGlhbCcpXSxcblx0XHRkZWxlZ2F0ZSxcblx0XHR1bmRlZmluZWQsXG5cdFx0eyBzaG93RmlsdGVyOiB0cnVlLCAuLi5vcHRpb25zLmxpc3RPcHRpb25zIH0sXG5cdCkpO1xuXG5cdGlmICh3aWRnZXQuZmlsdGVyQ29udGFpbmVyKSB7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZCh3aWRnZXQuZmlsdGVyQ29udGFpbmVyKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoeyBkaXNwb3NlOiAoKSA9PiB3aWRnZXQuZmlsdGVyQ29udGFpbmVyPy5yZW1vdmUoKSB9KTtcblx0fVxuXHQvLyBUaGUgaGVhZGVyIGJhbm5lciBpcyBhIHN0YW5kYWxvbmUgZWxlbWVudCB0aGUgY2FsbGVyIGF0dGFjaGVzIChsaWtlIHRoZVxuXHQvLyBmaWx0ZXIgY29udGFpbmVyKSwgc28gdGhlIHRlc3QgYXBwZW5kcyBpdCB0byBleGVyY2lzZSBoZWFkZXIgYmVoYXZpb3JzLlxuXHRjb25zdCBoZWFkZXJDb250YWluZXIgPSB3aWRnZXQuaGVhZGVyQ29udGFpbmVyO1xuXHRpZiAoaGVhZGVyQ29udGFpbmVyKSB7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChoZWFkZXJDb250YWluZXIpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IGhlYWRlckNvbnRhaW5lci5yZW1vdmUoKSB9KTtcblx0fVxuXHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHdpZGdldC5kb21Ob2RlKTtcblx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gd2lkZ2V0LmRvbU5vZGUucmVtb3ZlKCkgfSk7XG5cdHdpZGdldC5sYXlvdXQoMjAwLCAyMDApO1xuXG5cdHJldHVybiB3aWRnZXQ7XG59XG5cbmZ1bmN0aW9uIHR5cGVGaWx0ZXIod2lkZ2V0OiBBY3Rpb25MaXN0V2lkZ2V0PElUZXN0QWN0aW9uSXRlbT4sIHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcblx0YXNzZXJ0Lm9rKHdpZGdldC5maWx0ZXJJbnB1dCk7XG5cdHdpZGdldC5maWx0ZXJJbnB1dC52YWx1ZSA9IHZhbHVlO1xuXHR3aWRnZXQuZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2lucHV0JykpO1xufVxuXG5mdW5jdGlvbiBnZXRWaXNpYmxlUm93VGV4dCh3aWRnZXQ6IEFjdGlvbkxpc3RXaWRnZXQ8SVRlc3RBY3Rpb25JdGVtPik6IHN0cmluZ1tdIHtcblx0cmV0dXJuIEFycmF5LmZyb20od2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJy5tb25hY28tbGlzdC1yb3cnKSlcblx0XHQubWFwKHJvdyA9PiByb3cudGV4dENvbnRlbnQgPz8gJycpXG5cdFx0LmZpbHRlcih0ZXh0ID0+IHRleHQubGVuZ3RoID4gMCk7XG59XG5cbmZ1bmN0aW9uIHdpdGhXaW5kb3dJbm5lckhlaWdodDxUPihoZWlnaHQ6IG51bWJlciwgY2FsbGJhY2s6ICgpID0+IFQpOiBUIHtcblx0Y29uc3Qgb3JpZ2luYWxEZXNjcmlwdG9yID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihtYWluV2luZG93LCAnaW5uZXJIZWlnaHQnKTtcblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KG1haW5XaW5kb3csICdpbm5lckhlaWdodCcsIHsgY29uZmlndXJhYmxlOiB0cnVlLCB2YWx1ZTogaGVpZ2h0IH0pO1xuXHR0cnkge1xuXHRcdHJldHVybiBjYWxsYmFjaygpO1xuXHR9IGZpbmFsbHkge1xuXHRcdGlmIChvcmlnaW5hbERlc2NyaXB0b3IpIHtcblx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShtYWluV2luZG93LCAnaW5uZXJIZWlnaHQnLCBvcmlnaW5hbERlc2NyaXB0b3IpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRSZWZsZWN0LmRlbGV0ZVByb3BlcnR5KG1haW5XaW5kb3csICdpbm5lckhlaWdodCcpO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVBY3Rpb25MaXN0KGRpc3Bvc2FibGVzOiBSZXR1cm5UeXBlPHR5cGVvZiBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGU+LCBpdGVtczogcmVhZG9ubHkgSUFjdGlvbkxpc3RJdGVtPElUZXN0QWN0aW9uSXRlbT5bXSwgb3B0aW9ucz86IHtcblx0cmVhZG9ubHkgbGlzdE9wdGlvbnM/OiBQYXJ0aWFsPElBY3Rpb25MaXN0T3B0aW9ucz47XG5cdHJlYWRvbmx5IGFuY2hvcj86IHsgeDogbnVtYmVyOyB5OiBudW1iZXI7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH07XG59KTogQWN0aW9uTGlzdDxJVGVzdEFjdGlvbkl0ZW0+IHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElLZXliaW5kaW5nU2VydmljZSwgbmV3IE1vY2tLZXliaW5kaW5nU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElIb3ZlclNlcnZpY2UsIE51bGxIb3ZlclNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSU9wZW5lclNlcnZpY2UsIE51bGxPcGVuZXJTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dFZpZXdTZXJ2aWNlLCB7XG5cdFx0bGF5b3V0OiAoKSA9PiB7IH0sXG5cdFx0aGlkZUNvbnRleHRWaWV3OiAoKSA9PiB7IH0sXG5cdFx0Z2V0Q29udGV4dFZpZXdFbGVtZW50OiAoKSA9PiBkb2N1bWVudC5ib2R5LFxuXHR9IGFzIFBhcnRpYWw8SUNvbnRleHRWaWV3U2VydmljZT4gYXMgSUNvbnRleHRWaWV3U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxheW91dFNlcnZpY2UsIHtcblx0XHRnZXRDb250YWluZXI6ICgpID0+IGRvY3VtZW50LmJvZHksXG5cdFx0bWFpbkNvbnRhaW5lcjogZG9jdW1lbnQuYm9keSxcblx0XHRhY3RpdmVDb250YWluZXI6IGRvY3VtZW50LmJvZHksXG5cdFx0b25EaWRMYXlvdXRNYWluQ29udGFpbmVyOiBDb21tb25FdmVudC5Ob25lLFxuXHRcdG9uRGlkTGF5b3V0Q29udGFpbmVyOiBDb21tb25FdmVudC5Ob25lLFxuXHRcdG9uRGlkTGF5b3V0QWN0aXZlQ29udGFpbmVyOiBDb21tb25FdmVudC5Ob25lLFxuXHRcdG9uRGlkQWRkQ29udGFpbmVyOiBDb21tb25FdmVudC5Ob25lLFxuXHRcdG9uRGlkQ2hhbmdlQWN0aXZlQ29udGFpbmVyOiBDb21tb25FdmVudC5Ob25lLFxuXHR9IGFzIFBhcnRpYWw8SUxheW91dFNlcnZpY2U+IGFzIElMYXlvdXRTZXJ2aWNlKTtcblxuXHRjb25zdCBsaXN0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdEFjdGlvbkxpc3Q8SVRlc3RBY3Rpb25JdGVtPixcblx0XHQndGVzdEFjdGlvbkxpc3QnLFxuXHRcdGZhbHNlLFxuXHRcdGl0ZW1zLFxuXHRcdHtcblx0XHRcdG9uSGlkZTogKCkgPT4geyB9LFxuXHRcdFx0b25TZWxlY3Q6ICgpID0+IHsgfSxcblx0XHR9LFxuXHRcdHVuZGVmaW5lZCxcblx0XHR7IHNob3dGaWx0ZXI6IHRydWUsIC4uLm9wdGlvbnM/Lmxpc3RPcHRpb25zIH0sXG5cdFx0b3B0aW9ucz8uYW5jaG9yID8/IHsgeDogMTAsIHk6IDE1MCwgd2lkdGg6IDIwLCBoZWlnaHQ6IDIwIH0sXG5cdCkpO1xuXG5cdGNvbnN0IHdpZGdldCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHR3aWRnZXQuY2xhc3NMaXN0LmFkZCgnYWN0aW9uLXdpZGdldCcpO1xuXHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHdpZGdldCk7XG5cdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHdpZGdldC5yZW1vdmUoKSB9KTtcblx0aWYgKGxpc3QuZmlsdGVyQ29udGFpbmVyKSB7XG5cdFx0d2lkZ2V0LmFwcGVuZENoaWxkKGxpc3QuZmlsdGVyQ29udGFpbmVyKTtcblx0fVxuXHR3aWRnZXQuYXBwZW5kQ2hpbGQobGlzdC5kb21Ob2RlKTtcblxuXHRyZXR1cm4gbGlzdDtcbn1cblxuc3VpdGUoJ0FjdGlvbkxpc3RXaWRnZXQnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncnVucyBkeW5hbWljIGZpbHRlciB1cGRhdGVzIGltbWVkaWF0ZWx5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsdGVyczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVBY3Rpb25MaXN0V2lkZ2V0KGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRvbkZpbHRlcjogYXN5bmMgZmlsdGVyID0+IHtcblx0XHRcdFx0ZmlsdGVycy5wdXNoKGZpbHRlcik7XG5cdFx0XHRcdHJldHVybiBbYWN0aW9uKGBzZXJ2ZXItJHtmaWx0ZXIgPT09ICdtYScgPyAncmFua2VkJyA6IGZpbHRlcn0tcmVzdWx0YCldO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHR5cGVGaWx0ZXIod2lkZ2V0LCAnbScpO1xuXHRcdHR5cGVGaWx0ZXIod2lkZ2V0LCAnbWEnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbHRlcnMsIFsnbScsICdtYSddKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFzc2VydC5vayh3aWRnZXQuZG9tTm9kZS50ZXh0Q29udGVudD8uaW5jbHVkZXMoJ3NlcnZlci1yYW5rZWQtcmVzdWx0JykpO1xuXHR9KSk7XG5cblx0dGVzdCgnaWdub3JlcyBzdGFsZSBkeW5hbWljIGZpbHRlciByZXN1bHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0UmVzdWx0ID0gbmV3IERlZmVycmVkUHJvbWlzZTxyZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08SVRlc3RBY3Rpb25JdGVtPltdPigpO1xuXHRcdGNvbnN0IHNlY29uZFJlc3VsdCA9IG5ldyBEZWZlcnJlZFByb21pc2U8cmVhZG9ubHkgSUFjdGlvbkxpc3RJdGVtPElUZXN0QWN0aW9uSXRlbT5bXT4oKTtcblx0XHRjb25zdCBmaWx0ZXJzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZUFjdGlvbkxpc3RXaWRnZXQoZGlzcG9zYWJsZXMsIHtcblx0XHRcdG9uRmlsdGVyOiBmaWx0ZXIgPT4ge1xuXHRcdFx0XHRmaWx0ZXJzLnB1c2goZmlsdGVyKTtcblx0XHRcdFx0cmV0dXJuIGZpbHRlciA9PT0gJ20nID8gZmlyc3RSZXN1bHQucCA6IHNlY29uZFJlc3VsdC5wO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHR5cGVGaWx0ZXIod2lkZ2V0LCAnbScpO1xuXHRcdHR5cGVGaWx0ZXIod2lkZ2V0LCAnbWEnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbHRlcnMsIFsnbScsICdtYSddKTtcblxuXHRcdGZpcnN0UmVzdWx0LmNvbXBsZXRlKFthY3Rpb24oJ21hLXN0YWxlLXJlc3VsdCcpXSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQub2soIXdpZGdldC5kb21Ob2RlLnRleHRDb250ZW50Py5pbmNsdWRlcygnbWEtc3RhbGUtcmVzdWx0JykpO1xuXG5cdFx0c2Vjb25kUmVzdWx0LmNvbXBsZXRlKFthY3Rpb24oJ21hLWZyZXNoLXJlc3VsdCcpXSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQub2sod2lkZ2V0LmRvbU5vZGUudGV4dENvbnRlbnQ/LmluY2x1ZGVzKCdtYS1mcmVzaC1yZXN1bHQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGZpbHRlciB3aGlsZSBhbiBJTUUgY29tcG9zaXRpb24gaXMgaW4gcHJvZ3Jlc3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsdGVyczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVBY3Rpb25MaXN0V2lkZ2V0KGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRvbkZpbHRlcjogYXN5bmMgZmlsdGVyID0+IHtcblx0XHRcdFx0ZmlsdGVycy5wdXNoKGZpbHRlcik7XG5cdFx0XHRcdHJldHVybiBbYWN0aW9uKGByZXN1bHQtJHtmaWx0ZXJ9YCldO1xuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5vayh3aWRnZXQuZmlsdGVySW5wdXQpO1xuXHRcdHdpZGdldC5maWx0ZXJJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY29tcG9zaXRpb25zdGFydCcpKTtcblx0XHR0eXBlRmlsdGVyKHdpZGdldCwgJ2QnKTtcblx0XHR0eXBlRmlsdGVyKHdpZGdldCwgJ2RlZXBzZWVrJyk7XG5cdFx0d2lkZ2V0LmZpbHRlcklucHV0LnZhbHVlID0gJ0RlZXBTZWVrJztcblx0XHR3aWRnZXQuZmlsdGVySW5wdXQuZGlzcGF0Y2hFdmVudChuZXcgRXZlbnQoJ2NvbXBvc2l0aW9uZW5kJykpO1xuXHRcdC8vIENocm9taXVtIGZpcmVzIGEgdHJhaWxpbmcgYGlucHV0YCBmb3IgdGhlIGNvbW1pdHRlZCB0ZXh0LCB3aGljaCBtdXN0IG5vdCByZS1maWx0ZXIuXG5cdFx0dHlwZUZpbHRlcih3aWRnZXQsICdEZWVwU2VlaycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaWx0ZXJzLCBbJ0RlZXBTZWVrJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxzIGFuIGluLWZsaWdodCBkeW5hbWljIGZpbHRlciB3aGVuIGEgY29tcG9zaXRpb24gc3RhcnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBlbmRpbmcgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxJVGVzdEFjdGlvbkl0ZW0+W10+KCk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY3JlYXRlQWN0aW9uTGlzdFdpZGdldChkaXNwb3NhYmxlcywge1xuXHRcdFx0b25GaWx0ZXI6ICgpID0+IHBlbmRpbmcucCxcblx0XHR9KTtcblxuXHRcdHR5cGVGaWx0ZXIod2lkZ2V0LCAnZCcpO1xuXHRcdGFzc2VydC5vayh3aWRnZXQuZmlsdGVySW5wdXQpO1xuXHRcdHdpZGdldC5maWx0ZXJJbnB1dC5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgnY29tcG9zaXRpb25zdGFydCcpKTtcblxuXHRcdC8vIFJlc29sdmluZyBub3cgbXVzdCBub3Qgc3BsaWNlL3JlLWxheW91dCB0aGUgbGlzdCB1bmRlcm5lYXRoIHRoZSBJTUUgY2FuZGlkYXRlIHdpbmRvdy5cblx0XHRwZW5kaW5nLmNvbXBsZXRlKFthY3Rpb24oJ3N0YWxlLXJlc3VsdCcpXSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQub2soIXdpZGdldC5kb21Ob2RlLnRleHRDb250ZW50Py5pbmNsdWRlcygnc3RhbGUtcmVzdWx0JykpO1xuXHR9KTtcblxuXHR0ZXN0KCdiYXRjaGVzIHJvdyB3aWR0aCB3cml0ZXMgYmVmb3JlIHJlYWRpbmcgbGF5b3V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZUFjdGlvbkxpc3RXaWRnZXQoZGlzcG9zYWJsZXMsIHtcblx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdGFjdGlvbignZmlyc3QnKSxcblx0XHRcdFx0eyAuLi5hY3Rpb24oJ3NlY29uZCcpLCB0b29sYmFyQWN0aW9uczogW3RvQWN0aW9uKHsgaWQ6ICd0b29sYmFyJywgbGFiZWw6ICdUb29sYmFyJywgcnVuOiAoKSA9PiB7IH0gfSldIH0sXG5cdFx0XHRcdGFjdGlvbigndGhpcmQnKSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgcm93cyA9IEFycmF5LmZyb20od2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJy5tb25hY28tbGlzdC1yb3cnKSk7XG5cdFx0Y29uc3QgYWxsUm93c0F1dG9BdFJlYWQ6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGNvbnN0IG1lYXN1cmVkV2lkdGhzID0gWzEyMCwgMjQwLCAxODBdO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcm93cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0cm93c1tpXS5nZXRCb3VuZGluZ0NsaWVudFJlY3QgPSAoKSA9PiB7XG5cdFx0XHRcdGFsbFJvd3NBdXRvQXRSZWFkLnB1c2gocm93cy5ldmVyeShyb3cgPT4gcm93LnN0eWxlLndpZHRoID09PSAnYXV0bycpKTtcblx0XHRcdFx0cmV0dXJuIG5ldyBtYWluV2luZG93LkRPTVJlY3QoMCwgMCwgbWVhc3VyZWRXaWR0aHNbaV0sIDI0KTtcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2lkdGggPSB3aWRnZXQuY29tcHV0ZU1heFdpZHRoKDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3aWR0aCxcblx0XHRcdGFsbFJvd3NBdXRvQXRSZWFkLFxuXHRcdFx0cmVzdG9yZWRXaWR0aHM6IHJvd3MubWFwKHJvdyA9PiByb3cuc3R5bGUud2lkdGgpLFxuXHRcdH0sIHtcblx0XHRcdHdpZHRoOiAyNjgsXG5cdFx0XHRhbGxSb3dzQXV0b0F0UmVhZDogW3RydWUsIHRydWUsIHRydWVdLFxuXHRcdFx0cmVzdG9yZWRXaWR0aHM6IFsnJywgJycsICcnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgdGl0bGVkIHNlcGFyYXRvciBhYm92ZSBmaXJzdCBmaWx0ZXJlZCBtYXRjaCcsICgpID0+IHtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVBY3Rpb25MaXN0V2lkZ2V0KGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRpdGVtczogW1xuXHRcdFx0XHRzZXBhcmF0b3IoJ1Byb3ZpZGVyIEEnKSxcblx0XHRcdFx0YWN0aW9uKCdhbHBoYScpLFxuXHRcdFx0XHRzZXBhcmF0b3IoJ1Byb3ZpZGVyIEInKSxcblx0XHRcdFx0YWN0aW9uKCdiZXRhJyksXG5cdFx0XHRdLFxuXHRcdH0pO1xuXG5cdFx0dHlwZUZpbHRlcih3aWRnZXQsICdhbHBoYScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRWaXNpYmxlUm93VGV4dCh3aWRnZXQpLCBbJ1Byb3ZpZGVyIEEnLCAnYWxwaGEnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIG9ubHkgdGl0bGVkIHNlcGFyYXRvcnMgZm9yIHNlY3Rpb25zIHdpdGggZmlsdGVyZWQgbWF0Y2hlcycsICgpID0+IHtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVBY3Rpb25MaXN0V2lkZ2V0KGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRpdGVtczogW1xuXHRcdFx0XHRzZXBhcmF0b3IoJ1Byb3ZpZGVyIEEnKSxcblx0XHRcdFx0YWN0aW9uKCdhbHBoYScpLFxuXHRcdFx0XHRzZXBhcmF0b3IoJ1Byb3ZpZGVyIEInKSxcblx0XHRcdFx0YWN0aW9uKCdiZXRhJyksXG5cdFx0XHRcdHNlcGFyYXRvcignUHJvdmlkZXIgQycpLFxuXHRcdFx0XHRhY3Rpb24oJ2dhbW1hJyksXG5cdFx0XHRdLFxuXHRcdH0pO1xuXG5cdFx0dHlwZUZpbHRlcih3aWRnZXQsICdiZXRhJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFZpc2libGVSb3dUZXh0KHdpZGdldCksIFsnUHJvdmlkZXIgQicsICdiZXRhJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdsZWF2ZXMgcm9vbSBmb3IgYWN0aW9uIHdpZGdldCBjaHJvbWUgd2hlbiBjbGFtcGluZyBkeW5hbWljIGhlaWdodCcsICgpID0+IHdpdGhXaW5kb3dJbm5lckhlaWdodCgzMDAsICgpID0+IHtcblx0XHRjb25zdCBsaXN0ID0gY3JlYXRlQWN0aW9uTGlzdChkaXNwb3NhYmxlcywgQXJyYXkuZnJvbSh7IGxlbmd0aDogNTAgfSwgKF8sIGkpID0+IGFjdGlvbihgaXRlbS0ke2l9YCkpKTtcblxuXHRcdGxpc3QubGF5b3V0KDIwMCk7XG5cblx0XHRjb25zdCBmaWx0ZXJIZWlnaHQgPSAzNjtcblx0XHRjb25zdCB3aWRnZXQgPSBsaXN0LmRvbU5vZGUucGFyZW50RWxlbWVudCE7XG5cdFx0Y29uc3Qgc3R5bGUgPSBtYWluV2luZG93LmdldENvbXB1dGVkU3R5bGUod2lkZ2V0KTtcblx0XHRjb25zdCB0b1BpeGVscyA9ICh2YWx1ZTogc3RyaW5nKTogbnVtYmVyID0+IE51bWJlci5wYXJzZUZsb2F0KHZhbHVlKSB8fCAwO1xuXHRcdGNvbnN0IGFjdGlvbldpZGdldFZlcnRpY2FsQ2hyb21lSGVpZ2h0ID0gdG9QaXhlbHMoc3R5bGUucGFkZGluZ1RvcCkgKyB0b1BpeGVscyhzdHlsZS5wYWRkaW5nQm90dG9tKSArIHRvUGl4ZWxzKHN0eWxlLmJvcmRlclRvcFdpZHRoKSArIHRvUGl4ZWxzKHN0eWxlLmJvcmRlckJvdHRvbVdpZHRoKTtcblx0XHRjb25zdCBhdmFpbGFibGVTcGFjZUFib3ZlQW5jaG9yID0gMTUwO1xuXHRcdGNvbnN0IGxpc3RIZWlnaHQgPSBwYXJzZUZsb2F0KGxpc3QuZG9tTm9kZS5zdHlsZS5oZWlnaHQpO1xuXHRcdGFzc2VydC5vayhsaXN0SGVpZ2h0ICsgZmlsdGVySGVpZ2h0ICsgYWN0aW9uV2lkZ2V0VmVydGljYWxDaHJvbWVIZWlnaHQgPD0gYXZhaWxhYmxlU3BhY2VBYm92ZUFuY2hvcik7XG5cdH0pKTtcblxuXHR0ZXN0KCdmb3JjZWQgYWJvdmUgYW5jaG9yIHBvc2l0aW9uIGNhbiBjbGFtcCBkeW5hbWljIGhlaWdodCB3aXRob3V0IHRoZSBkZWZhdWx0IG1pbmltdW0gZmxvb3InLCAoKSA9PiB3aXRoV2luZG93SW5uZXJIZWlnaHQoMzAwLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGlzdCA9IGNyZWF0ZUFjdGlvbkxpc3QoZGlzcG9zYWJsZXMsIEFycmF5LmZyb20oeyBsZW5ndGg6IDUwIH0sIChfLCBpKSA9PiBhY3Rpb24oYGl0ZW0tJHtpfWApKSwge1xuXHRcdFx0bGlzdE9wdGlvbnM6IHsgYW5jaG9yUG9zaXRpb246IEFuY2hvclBvc2l0aW9uLkFCT1ZFIH0sXG5cdFx0XHRhbmNob3I6IHsgeDogMTAsIHk6IDIwLCB3aWR0aDogMjAsIGhlaWdodDogMjAgfSxcblx0XHR9KTtcblxuXHRcdGxpc3QubGF5b3V0KDIwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBhbmNob3JQb3NpdGlvbjogbGlzdC5hbmNob3JQb3NpdGlvbiwgbGlzdEhlaWdodDogcGFyc2VGbG9hdChsaXN0LmRvbU5vZGUuc3R5bGUuaGVpZ2h0KSB9LFxuXHRcdFx0eyBhbmNob3JQb3NpdGlvbjogQW5jaG9yUG9zaXRpb24uQUJPVkUsIGxpc3RIZWlnaHQ6IDAgfSxcblx0XHQpO1xuXHR9KSk7XG5cblx0dGVzdCgnaGVhZGVyIGRpc21pc3MgcmVtb3ZlcyB0aGUgYmFubmVyIGFuZCByZXF1ZXN0cyBhIHJlLWxheW91dCcsICgpID0+IHtcblx0XHRsZXQgZGlzbWlzc2VkID0gZmFsc2U7XG5cdFx0bGV0IGxheW91dFJlcXVlc3RlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZUFjdGlvbkxpc3RXaWRnZXQoZGlzcG9zYWJsZXMsIHtcblx0XHRcdGxpc3RPcHRpb25zOiB7IGhlYWRlclRleHQ6ICdDYWNoZSBoaW50JywgaGVhZGVyRGlzbWlzczogKCkgPT4geyBkaXNtaXNzZWQgPSB0cnVlOyB9IH0sXG5cdFx0fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHdpZGdldC5vbkRpZFJlcXVlc3RMYXlvdXQoKCkgPT4geyBsYXlvdXRSZXF1ZXN0ZWQgPSB0cnVlOyB9KSk7XG5cblx0XHRjb25zdCBoZWFkZXIgPSB3aWRnZXQuaGVhZGVyQ29udGFpbmVyO1xuXHRcdGFzc2VydC5vayhoZWFkZXIsICdoZWFkZXIgYmFubmVyIHNob3VsZCByZW5kZXIgd2hlbiBoZWFkZXJUZXh0ICsgaGVhZGVyRGlzbWlzcyBhcmUgc2V0Jyk7XG5cdFx0Y29uc3QgZGlzbWlzc0J1dHRvbiA9IGhlYWRlciEucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5hY3Rpb24tbGlzdC1oZWFkZXItZGlzbWlzcycpO1xuXHRcdGFzc2VydC5vayhkaXNtaXNzQnV0dG9uLCAnZGlzbWlzcyBidXR0b24gc2hvdWxkIHJlbmRlcicpO1xuXG5cdFx0ZGlzbWlzc0J1dHRvbiEuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2V1cCcsIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBkaXNtaXNzZWQsIGxheW91dFJlcXVlc3RlZCwgaGVhZGVyQ2xlYXJlZDogd2lkZ2V0LmhlYWRlckNvbnRhaW5lciA9PT0gdW5kZWZpbmVkLCBoZWFkZXJTdGlsbEluRG9tOiBoZWFkZXIhLmlzQ29ubmVjdGVkIH0sXG5cdFx0XHR7IGRpc21pc3NlZDogdHJ1ZSwgbGF5b3V0UmVxdWVzdGVkOiB0cnVlLCBoZWFkZXJDbGVhcmVkOiB0cnVlLCBoZWFkZXJTdGlsbEluRG9tOiBmYWxzZSB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3dzIGEgcm93IGhvdmVyIHBhbmVsIG9uY2UgdGhlIGhvdmVyIGRlbGF5IGVsYXBzZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVBY3Rpb25MaXN0V2lkZ2V0KGRpc3Bvc2FibGVzLCB7XG5cdFx0XHRpdGVtczogW3sgLi4uYWN0aW9uKCdhdXRvJyksIGhvdmVyOiB7IGNvbnRlbnQ6ICdBdXRvIHJvdXRlcyBiYXNlZCBvbiB5b3VyIHRhc2snIH0gfSwgYWN0aW9uKCdvdGhlcicpXSxcblx0XHRcdGxpc3RPcHRpb25zOiB7IGhlYWRlclRleHQ6ICdDYWNoZSBoaW50JyB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBhbmVsID0gd2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5hY3Rpb24tbGlzdC1zdWJtZW51LXBhbmVsJykhO1xuXG5cdFx0d2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5tb25hY28tbGlzdC1yb3cnKSEuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2VvdmVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblx0XHRhd2FpdCB0aW1lb3V0KDEwMDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGRpc3BsYXk6IHBhbmVsLnN0eWxlLmRpc3BsYXksIHRleHQ6IHBhbmVsLnRleHRDb250ZW50IH0sIHsgZGlzcGxheTogJycsIHRleHQ6ICdBdXRvIHJvdXRlcyBiYXNlZCBvbiB5b3VyIHRhc2snIH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgb3BlbiBhIHJvdyBob3ZlciBwYW5lbCBvbmNlIHRoZSBwb2ludGVyIGhhcyBsZWZ0IHRoZSBsaXN0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY3JlYXRlQWN0aW9uTGlzdFdpZGdldChkaXNwb3NhYmxlcywge1xuXHRcdFx0aXRlbXM6IFt7IC4uLmFjdGlvbignYXV0bycpLCBob3ZlcjogeyBjb250ZW50OiAnQXV0byByb3V0ZXMgYmFzZWQgb24geW91ciB0YXNrJyB9IH0sIGFjdGlvbignb3RoZXInKV0sXG5cdFx0XHRsaXN0T3B0aW9uczogeyBoZWFkZXJUZXh0OiAnQ2FjaGUgaGludCcgfSxcblx0XHR9KTtcblx0XHRjb25zdCBwYW5lbCA9IHdpZGdldC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuYWN0aW9uLWxpc3Qtc3VibWVudS1wYW5lbCcpITtcblxuXHRcdC8vIFRoZSBiYW5uZXIgaXMgYSBzaWJsaW5nIG9mIHRoZSBsaXN0LCBzbyByZWFjaGluZyBpdCBkcmFncyB0aGUgcG9pbnRlciBhY3Jvc3MgYSByb3cuXG5cdFx0d2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5tb25hY28tbGlzdC1yb3cnKSEuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2VvdmVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblx0XHR3aWRnZXQuZG9tTm9kZS5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWxlYXZlJykpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMTAwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgZGlzcGxheTogcGFuZWwuc3R5bGUuZGlzcGxheSwgdGV4dDogcGFuZWwudGV4dENvbnRlbnQgfSwgeyBkaXNwbGF5OiAnbm9uZScsIHRleHQ6ICcnIH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnZGlzbWlzc2VzIGFuIG9wZW4gcm93IGhvdmVyIHBhbmVsIHdoZW4gdGhlIHBvaW50ZXIgcmVhY2hlcyB0aGUgaGVhZGVyIGJhbm5lcicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZUFjdGlvbkxpc3RXaWRnZXQoZGlzcG9zYWJsZXMsIHtcblx0XHRcdGl0ZW1zOiBbeyAuLi5hY3Rpb24oJ2F1dG8nKSwgaG92ZXI6IHsgY29udGVudDogJ0F1dG8gcm91dGVzIGJhc2VkIG9uIHlvdXIgdGFzaycgfSB9LCBhY3Rpb24oJ290aGVyJyldLFxuXHRcdFx0bGlzdE9wdGlvbnM6IHsgaGVhZGVyVGV4dDogJ0NhY2hlIGhpbnQnIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgcGFuZWwgPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmFjdGlvbi1saXN0LXN1Ym1lbnUtcGFuZWwnKSE7XG5cblx0XHQvLyBEd2VsbGluZyBvbiB0aGUgcm93IGxvbmcgZW5vdWdoIGZvciB0aGUgcGFuZWwgdG8gb3BlbiwgdGhlbiBjb250aW51aW5nIHRvIHRoZSBiYW5uZXIuXG5cdFx0d2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5tb25hY28tbGlzdC1yb3cnKSEuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2VvdmVyJywgeyBidWJibGVzOiB0cnVlIH0pKTtcblx0XHRhd2FpdCB0aW1lb3V0KDYwMCk7XG5cdFx0Y29uc3Qgb3BlbmVkV2hpbGVPblJvdyA9IHBhbmVsLnRleHRDb250ZW50O1xuXG5cdFx0d2lkZ2V0LmRvbU5vZGUuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2VsZWF2ZScpKTtcblx0XHR3aWRnZXQuaGVhZGVyQ29udGFpbmVyIS5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWVudGVyJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgb3BlbmVkV2hpbGVPblJvdywgZGlzcGxheTogcGFuZWwuc3R5bGUuZGlzcGxheSwgdGV4dDogcGFuZWwudGV4dENvbnRlbnQgfSxcblx0XHRcdHsgb3BlbmVkV2hpbGVPblJvdzogJ0F1dG8gcm91dGVzIGJhc2VkIG9uIHlvdXIgdGFzaycsIGRpc3BsYXk6ICdub25lJywgdGV4dDogJycgfSxcblx0XHQpO1xuXHR9KSk7XG5cblx0dGVzdCgnaGVhZGVyIHJlbmRlcnMgYSBcIkxlYXJuIG1vcmVcIiBsaW5rIHRvIHRoZSBnaXZlbiB1cmknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY3JlYXRlQWN0aW9uTGlzdFdpZGdldChkaXNwb3NhYmxlcywge1xuXHRcdFx0bGlzdE9wdGlvbnM6IHsgaGVhZGVyVGV4dDogJ0NhY2hlIGhpbnQnLCBoZWFkZXJMaW5rOiB7IGxhYmVsOiAnTGVhcm4gbW9yZScsIHVyaTogVVJJLnBhcnNlKCdodHRwczovL2FrYS5tcy90ZXN0JykgfSB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbGluayA9IHdpZGdldC5oZWFkZXJDb250YWluZXI/LnF1ZXJ5U2VsZWN0b3I8SFRNTEFuY2hvckVsZW1lbnQ+KCdhLm1vbmFjby1saW5rJyk7XG5cdFx0YXNzZXJ0Lm9rKGxpbmssICdhIFwiTGVhcm4gbW9yZVwiIGxpbmsgc2hvdWxkIHJlbmRlciBpbiB0aGUgaGVhZGVyJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgdGV4dDogbGluayEudGV4dENvbnRlbnQsIGhyZWY6IGxpbmshLmdldEF0dHJpYnV0ZSgnaHJlZicpIH0sXG5cdFx0XHR7IHRleHQ6ICdMZWFybiBtb3JlJywgaHJlZjogJ2h0dHBzOi8vYWthLm1zL3Rlc3QnIH0sXG5cdFx0KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQixlQUFlO0FBRXpDLFNBQVMsU0FBUyxtQkFBbUI7QUFDckMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWSxvQkFBb0Isd0JBQTZEO0FBQ3RHLFNBQVMsc0JBQXNCO0FBTS9CLFNBQVMsT0FBTyxJQUE4QztBQUM3RCxTQUFPLEVBQUUsTUFBTSxtQkFBbUIsUUFBUSxPQUFPLElBQUksTUFBTSxFQUFFLEdBQUcsRUFBRTtBQUNuRTtBQUVBLFNBQVMsVUFBVSxPQUFrRDtBQUNwRSxTQUFPLEVBQUUsTUFBTSxtQkFBbUIsV0FBVyxNQUFNO0FBQ3BEO0FBRUEsU0FBUyx1QkFBdUIsYUFBeUUsU0FJbkU7QUFDckMsUUFBTSx1QkFBdUIsWUFBWSxJQUFJLElBQUkseUJBQXlC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
