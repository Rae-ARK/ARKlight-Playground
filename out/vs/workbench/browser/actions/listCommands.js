import { KeyMod, KeyCode, KeyChord } from "../../../base/common/keyCodes.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../platform/keybinding/common/keybindingsRegistry.js";
import { List } from "../../../base/browser/ui/list/listWidget.js";
import { WorkbenchListFocusContextKey, IListService, WorkbenchListSupportsMultiSelectContextKey, WorkbenchListHasSelectionOrFocus, getSelectionKeyboardEvent, WorkbenchListSelectionNavigation, WorkbenchTreeElementCanCollapse, WorkbenchTreeElementHasParent, WorkbenchTreeElementHasChild, WorkbenchTreeElementCanExpand, RawWorkbenchListFocusContextKey, WorkbenchTreeFindOpen, WorkbenchListSupportsFind, WorkbenchListScrollAtBottomContextKey, WorkbenchListScrollAtTopContextKey, WorkbenchTreeStickyScrollFocused } from "../../../platform/list/browser/listService.js";
import { PagedList } from "../../../base/browser/ui/list/listPaging.js";
import { equals, range } from "../../../base/common/arrays.js";
import { ContextKeyExpr } from "../../../platform/contextkey/common/contextkey.js";
import { ObjectTree } from "../../../base/browser/ui/tree/objectTree.js";
import { AsyncDataTree } from "../../../base/browser/ui/tree/asyncDataTree.js";
import { DataTree } from "../../../base/browser/ui/tree/dataTree.js";
import { CommandsRegistry } from "../../../platform/commands/common/commands.js";
import { Table } from "../../../base/browser/ui/table/tableWidget.js";
import { AbstractTree, TreeFindMatchType, TreeFindMode } from "../../../base/browser/ui/tree/abstractTree.js";
import { isActiveElement } from "../../../base/browser/dom.js";
import { Action2, registerAction2 } from "../../../platform/actions/common/actions.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { localize, localize2 } from "../../../nls.js";
import { IHoverService } from "../../../platform/hover/browser/hover.js";
function ensureDOMFocus(widget) {
  const element = widget?.getHTMLElement();
  if (element && !isActiveElement(element)) {
    widget?.domFocus();
  }
}
async function updateFocus(widget, updateFocusFn) {
  if (!WorkbenchListSelectionNavigation.getValue(widget.contextKeyService)) {
    return updateFocusFn(widget);
  }
  const focus = widget.getFocus();
  const selection = widget.getSelection();
  await updateFocusFn(widget);
  const newFocus = widget.getFocus();
  if (selection.length > 1 || !equals(focus, selection) || equals(focus, newFocus)) {
    return;
  }
  const fakeKeyboardEvent = new KeyboardEvent("keydown");
  widget.setSelection(newFocus, fakeKeyboardEvent);
}
async function navigate(widget, updateFocusFn) {
  if (!widget) {
    return;
  }
  await updateFocus(widget, updateFocusFn);
  const listFocus = widget.getFocus();
  if (listFocus.length) {
    widget.reveal(listFocus[0]);
  }
  widget.setAnchor(listFocus[0]);
  ensureDOMFocus(widget);
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusDown",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyCode.DownArrow,
  mac: {
    primary: KeyCode.DownArrow,
    secondary: [KeyMod.WinCtrl | KeyCode.KeyN]
  },
  handler: (accessor, arg2) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown");
      await widget.focusNext(typeof arg2 === "number" ? arg2 : 1, false, fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusUp",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyCode.UpArrow,
  mac: {
    primary: KeyCode.UpArrow,
    secondary: [KeyMod.WinCtrl | KeyCode.KeyP]
  },
  handler: (accessor, arg2) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown");
      await widget.focusPrevious(typeof arg2 === "number" ? arg2 : 1, false, fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusAnyDown",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyMod.Alt | KeyCode.DownArrow,
  mac: {
    primary: KeyMod.Alt | KeyCode.DownArrow,
    secondary: [KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyN]
  },
  handler: (accessor, arg2) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown", { altKey: true });
      await widget.focusNext(typeof arg2 === "number" ? arg2 : 1, false, fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusAnyUp",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyMod.Alt | KeyCode.UpArrow,
  mac: {
    primary: KeyMod.Alt | KeyCode.UpArrow,
    secondary: [KeyMod.WinCtrl | KeyMod.Alt | KeyCode.KeyP]
  },
  handler: (accessor, arg2) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown", { altKey: true });
      await widget.focusPrevious(typeof arg2 === "number" ? arg2 : 1, false, fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusPageDown",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyCode.PageDown,
  handler: (accessor) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown");
      await widget.focusNextPage(fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusPageUp",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyCode.PageUp,
  handler: (accessor) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown");
      await widget.focusPreviousPage(fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusFirst",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyCode.Home,
  handler: (accessor) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown");
      await widget.focusFirst(fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusLast",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyCode.End,
  handler: (accessor) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown");
      await widget.focusLast(fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusAnyFirst",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyMod.Alt | KeyCode.Home,
  handler: (accessor) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown", { altKey: true });
      await widget.focusFirst(fakeKeyboardEvent);
    });
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusAnyLast",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyMod.Alt | KeyCode.End,
  handler: (accessor) => {
    navigate(accessor.get(IListService).lastFocusedList, async (widget) => {
      const fakeKeyboardEvent = new KeyboardEvent("keydown", { altKey: true });
      await widget.focusLast(fakeKeyboardEvent);
    });
  }
});
function expandMultiSelection(focused, previousFocus) {
  if (focused instanceof List || focused instanceof PagedList || focused instanceof Table) {
    const list = focused;
    const focus = list.getFocus() ? list.getFocus()[0] : void 0;
    const selection = list.getSelection();
    if (selection && typeof focus === "number" && selection.indexOf(focus) >= 0) {
      list.setSelection(selection.filter((s) => s !== previousFocus));
    } else {
      if (typeof focus === "number") {
        list.setSelection(selection.concat(focus));
      }
    }
  } else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
    const list = focused;
    const focus = list.getFocus() ? list.getFocus()[0] : void 0;
    if (previousFocus === focus) {
      return;
    }
    const selection = list.getSelection();
    const fakeKeyboardEvent = new KeyboardEvent("keydown", { shiftKey: true });
    if (selection && selection.indexOf(focus) >= 0) {
      list.setSelection(selection.filter((s) => s !== previousFocus), fakeKeyboardEvent);
    } else {
      list.setSelection(selection.concat(focus), fakeKeyboardEvent);
    }
  }
}
function revealFocusedStickyScroll(tree, postRevealAction) {
  const focus = tree.getStickyScrollFocus();
  if (focus.length === 0) {
    throw new Error(`StickyScroll has no focus`);
  }
  if (focus.length > 1) {
    throw new Error(`StickyScroll can only have a single focused item`);
  }
  tree.reveal(focus[0]);
  tree.getHTMLElement().focus();
  tree.setFocus(focus);
  postRevealAction?.(focus[0]);
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.expandSelectionDown",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListSupportsMultiSelectContextKey),
  primary: KeyMod.Shift | KeyCode.DownArrow,
  handler: (accessor, arg2) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget) {
      return;
    }
    const previousFocus = widget.getFocus() ? widget.getFocus()[0] : void 0;
    const fakeKeyboardEvent = new KeyboardEvent("keydown");
    widget.focusNext(typeof arg2 === "number" ? arg2 : 1, false, fakeKeyboardEvent);
    expandMultiSelection(widget, previousFocus);
    const focus = widget.getFocus();
    if (focus.length) {
      widget.reveal(focus[0]);
    }
    ensureDOMFocus(widget);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.expandSelectionUp",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListSupportsMultiSelectContextKey),
  primary: KeyMod.Shift | KeyCode.UpArrow,
  handler: (accessor, arg2) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget) {
      return;
    }
    const previousFocus = widget.getFocus() ? widget.getFocus()[0] : void 0;
    const fakeKeyboardEvent = new KeyboardEvent("keydown");
    widget.focusPrevious(typeof arg2 === "number" ? arg2 : 1, false, fakeKeyboardEvent);
    expandMultiSelection(widget, previousFocus);
    const focus = widget.getFocus();
    if (focus.length) {
      widget.reveal(focus[0]);
    }
    ensureDOMFocus(widget);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.collapse",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(WorkbenchListFocusContextKey, ContextKeyExpr.or(WorkbenchTreeElementCanCollapse, WorkbenchTreeElementHasParent)),
  primary: KeyCode.LeftArrow,
  mac: {
    primary: KeyCode.LeftArrow,
    secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow]
  },
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget || !(widget instanceof ObjectTree || widget instanceof DataTree || widget instanceof AsyncDataTree)) {
      return;
    }
    const tree = widget;
    const focusedElements = tree.getFocus();
    if (focusedElements.length === 0) {
      return;
    }
    const focus = focusedElements[0];
    if (!tree.collapse(focus)) {
      const parent = tree.getParentElement(focus);
      if (parent) {
        navigate(widget, (widget2) => {
          const fakeKeyboardEvent = new KeyboardEvent("keydown");
          widget2.setFocus([parent], fakeKeyboardEvent);
        });
      }
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.stickyScroll.collapse",
  weight: KeybindingWeight.WorkbenchContrib + 50,
  when: WorkbenchTreeStickyScrollFocused,
  primary: KeyCode.LeftArrow,
  mac: {
    primary: KeyCode.LeftArrow,
    secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow]
  },
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget || !(widget instanceof ObjectTree || widget instanceof DataTree || widget instanceof AsyncDataTree)) {
      return;
    }
    revealFocusedStickyScroll(widget, (focus) => widget.collapse(focus));
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.collapseAll",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyMod.CtrlCmd | KeyCode.LeftArrow,
  mac: {
    primary: KeyMod.CtrlCmd | KeyCode.LeftArrow,
    secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.UpArrow]
  },
  handler: (accessor) => {
    const focused = accessor.get(IListService).lastFocusedList;
    if (focused && !(focused instanceof List || focused instanceof PagedList || focused instanceof Table)) {
      focused.collapseAll();
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.collapseAllToFocus",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  handler: (accessor) => {
    const focused = accessor.get(IListService).lastFocusedList;
    const fakeKeyboardEvent = getSelectionKeyboardEvent("keydown", true);
    if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
      const tree = focused;
      const focus = tree.getFocus();
      if (focus.length > 0) {
        tree.collapse(focus[0], true);
      }
      tree.setSelection(focus, fakeKeyboardEvent);
      tree.setAnchor(focus[0]);
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.focusParent",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget || !(widget instanceof ObjectTree || widget instanceof DataTree || widget instanceof AsyncDataTree)) {
      return;
    }
    const tree = widget;
    const focusedElements = tree.getFocus();
    if (focusedElements.length === 0) {
      return;
    }
    const focus = focusedElements[0];
    const parent = tree.getParentElement(focus);
    if (parent) {
      navigate(widget, (widget2) => {
        const fakeKeyboardEvent = new KeyboardEvent("keydown");
        widget2.setFocus([parent], fakeKeyboardEvent);
      });
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.expand",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(WorkbenchListFocusContextKey, ContextKeyExpr.or(WorkbenchTreeElementCanExpand, WorkbenchTreeElementHasChild)),
  primary: KeyCode.RightArrow,
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget) {
      return;
    }
    if (widget instanceof ObjectTree || widget instanceof DataTree) {
      const focusedElements = widget.getFocus();
      if (focusedElements.length === 0) {
        return;
      }
      const focus = focusedElements[0];
      if (!widget.expand(focus)) {
        const child = widget.getFirstElementChild(focus);
        if (child) {
          const node = widget.getNode(child);
          if (node.visible) {
            navigate(widget, (widget2) => {
              const fakeKeyboardEvent = new KeyboardEvent("keydown");
              widget2.setFocus([child], fakeKeyboardEvent);
            });
          }
        }
      }
    } else if (widget instanceof AsyncDataTree) {
      const focusedElements = widget.getFocus();
      if (focusedElements.length === 0) {
        return;
      }
      const focus = focusedElements[0];
      widget.expand(focus).then((didExpand) => {
        if (focus && !didExpand) {
          const child = widget.getFirstElementChild(focus);
          if (child) {
            const node = widget.getNode(child);
            if (node.visible) {
              navigate(widget, (widget2) => {
                const fakeKeyboardEvent = new KeyboardEvent("keydown");
                widget2.setFocus([child], fakeKeyboardEvent);
              });
            }
          }
        }
      });
    }
  }
});
function selectElement(accessor, retainCurrentFocus) {
  const focused = accessor.get(IListService).lastFocusedList;
  const fakeKeyboardEvent = getSelectionKeyboardEvent("keydown", retainCurrentFocus);
  if (focused instanceof List || focused instanceof PagedList || focused instanceof Table) {
    const list = focused;
    list.setAnchor(list.getFocus()[0]);
    list.setSelection(list.getFocus(), fakeKeyboardEvent);
  } else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
    const tree = focused;
    const focus = tree.getFocus();
    if (focus.length > 0) {
      let toggleCollapsed = true;
      if (tree.expandOnlyOnTwistieClick === true) {
        toggleCollapsed = false;
      } else if (typeof tree.expandOnlyOnTwistieClick !== "boolean" && tree.expandOnlyOnTwistieClick(focus[0])) {
        toggleCollapsed = false;
      }
      if (toggleCollapsed) {
        tree.toggleCollapsed(focus[0]);
      }
    }
    tree.setAnchor(focus[0]);
    tree.setSelection(focus, fakeKeyboardEvent);
  }
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.select",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyCode.Enter,
  mac: {
    primary: KeyCode.Enter,
    secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow]
  },
  handler: (accessor) => {
    selectElement(accessor, false);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.stickyScrollselect",
  weight: KeybindingWeight.WorkbenchContrib + 50,
  // priorities over file explorer
  when: WorkbenchTreeStickyScrollFocused,
  primary: KeyCode.Enter,
  mac: {
    primary: KeyCode.Enter,
    secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow]
  },
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget || !(widget instanceof ObjectTree || widget instanceof DataTree || widget instanceof AsyncDataTree)) {
      return;
    }
    revealFocusedStickyScroll(widget, (focus) => widget.setSelection([focus]));
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.selectAndPreserveFocus",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  handler: (accessor) => {
    selectElement(accessor, true);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.selectAll",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListSupportsMultiSelectContextKey),
  primary: KeyMod.CtrlCmd | KeyCode.KeyA,
  handler: (accessor) => {
    const focused = accessor.get(IListService).lastFocusedList;
    if (focused instanceof List || focused instanceof PagedList || focused instanceof Table) {
      const list = focused;
      const fakeKeyboardEvent = new KeyboardEvent("keydown");
      list.setSelection(range(list.length), fakeKeyboardEvent);
    } else if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
      const tree = focused;
      const focus = tree.getFocus();
      const selection = tree.getSelection();
      let start = void 0;
      if (focus.length > 0 && (selection.length === 0 || !selection.includes(focus[0]))) {
        start = focus[0];
      }
      if (!start && selection.length > 0) {
        start = selection[0];
      }
      let scope = void 0;
      if (!start) {
        scope = void 0;
      } else {
        scope = tree.getParentElement(start);
      }
      const newSelection = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (child.visible) {
            newSelection.push(child.element);
            if (!child.collapsed) {
              visit(child);
            }
          }
        }
      };
      visit(tree.getNode(scope));
      if (scope && selection.length === newSelection.length) {
        newSelection.unshift(scope);
      }
      const fakeKeyboardEvent = new KeyboardEvent("keydown");
      tree.setSelection(newSelection, fakeKeyboardEvent);
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.toggleSelection",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Enter,
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget) {
      return;
    }
    const focus = widget.getFocus();
    if (focus.length === 0) {
      return;
    }
    const selection = widget.getSelection();
    const index = selection.indexOf(focus[0]);
    if (index > -1) {
      widget.setSelection([...selection.slice(0, index), ...selection.slice(index + 1)]);
    } else {
      widget.setSelection([...selection, focus[0]]);
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.showHover",
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
  when: WorkbenchListFocusContextKey,
  handler: async (accessor) => {
    const listService = accessor.get(IListService);
    const lastFocusedList = listService.lastFocusedList;
    if (!lastFocusedList) {
      return;
    }
    const focus = lastFocusedList.getFocus();
    if (!focus || focus.length === 0) {
      return;
    }
    const treeDOM = lastFocusedList.getHTMLElement();
    const scrollableElement = treeDOM.querySelector(".monaco-scrollable-element");
    const listRows = scrollableElement?.querySelector(".monaco-list-rows");
    const focusedElement = listRows?.querySelector(".focused");
    if (!focusedElement) {
      return;
    }
    const elementWithHover = getCustomHoverForElement(focusedElement);
    if (elementWithHover) {
      accessor.get(IHoverService).showManagedHover(elementWithHover);
    }
  }
});
function getCustomHoverForElement(element) {
  if (element.matches('[custom-hover="true"]')) {
    return element;
  }
  const noneFocusableElementWithHover = element.querySelector('[custom-hover="true"]:not([tabindex]):not(.action-item)');
  if (noneFocusableElementWithHover) {
    return noneFocusableElementWithHover;
  }
  return void 0;
}
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.toggleExpand",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  primary: KeyCode.Space,
  handler: (accessor) => {
    const focused = accessor.get(IListService).lastFocusedList;
    if (focused instanceof ObjectTree || focused instanceof DataTree || focused instanceof AsyncDataTree) {
      const tree = focused;
      const focus = tree.getFocus();
      if (!tree.options.disableExpandOnSpacebar && focus.length > 0 && tree.isCollapsible(focus[0])) {
        tree.toggleCollapsed(focus[0]);
        return;
      }
    }
    selectElement(accessor, true);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.stickyScrolltoggleExpand",
  weight: KeybindingWeight.WorkbenchContrib + 50,
  // priorities over file explorer
  when: WorkbenchTreeStickyScrollFocused,
  primary: KeyCode.Space,
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget || !(widget instanceof ObjectTree || widget instanceof DataTree || widget instanceof AsyncDataTree)) {
      return;
    }
    revealFocusedStickyScroll(widget);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.clear",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(WorkbenchListFocusContextKey, WorkbenchListHasSelectionOrFocus),
  primary: KeyCode.Escape,
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (!widget) {
      return;
    }
    const selection = widget.getSelection();
    const fakeKeyboardEvent = new KeyboardEvent("keydown");
    if (selection.length > 1) {
      const useSelectionNavigation = WorkbenchListSelectionNavigation.getValue(widget.contextKeyService);
      if (useSelectionNavigation) {
        const focus = widget.getFocus();
        widget.setSelection([focus[0]], fakeKeyboardEvent);
      } else {
        widget.setSelection([], fakeKeyboardEvent);
      }
    } else {
      widget.setSelection([], fakeKeyboardEvent);
      widget.setFocus([], fakeKeyboardEvent);
    }
    widget.setAnchor(void 0);
  }
});
CommandsRegistry.registerCommand({
  id: "list.triggerTypeNavigation",
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    widget?.triggerTypeNavigation();
  }
});
CommandsRegistry.registerCommand({
  id: "list.toggleFindMode",
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (widget instanceof AbstractTree || widget instanceof AsyncDataTree) {
      const tree = widget;
      tree.findMode = tree.findMode === TreeFindMode.Filter ? TreeFindMode.Highlight : TreeFindMode.Filter;
    }
  }
});
CommandsRegistry.registerCommand({
  id: "list.toggleFindMatchType",
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (widget instanceof AbstractTree || widget instanceof AsyncDataTree) {
      const tree = widget;
      tree.findMatchType = tree.findMatchType === TreeFindMatchType.Contiguous ? TreeFindMatchType.Fuzzy : TreeFindMatchType.Contiguous;
    }
  }
});
CommandsRegistry.registerCommandAlias("list.toggleKeyboardNavigation", "list.triggerTypeNavigation");
CommandsRegistry.registerCommandAlias("list.toggleFilterOnType", "list.toggleFindMode");
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.find",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(RawWorkbenchListFocusContextKey, WorkbenchListSupportsFind),
  primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyF,
  secondary: [KeyCode.F3],
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (widget instanceof List || widget instanceof PagedList || widget instanceof Table) {
    } else if (widget instanceof AbstractTree || widget instanceof AsyncDataTree) {
      const tree = widget;
      tree.openFind();
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.closeFind",
  weight: KeybindingWeight.WorkbenchContrib,
  when: ContextKeyExpr.and(RawWorkbenchListFocusContextKey, WorkbenchTreeFindOpen),
  primary: KeyCode.Escape,
  handler: (accessor) => {
    const widget = accessor.get(IListService).lastFocusedList;
    if (widget instanceof AbstractTree || widget instanceof AsyncDataTree) {
      const tree = widget;
      tree.closeFind();
    }
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.scrollUp",
  weight: KeybindingWeight.WorkbenchContrib,
  // Since the default keybindings for list.scrollUp and widgetNavigation.focusPrevious
  // are both Ctrl+UpArrow, we disable this command when the scrollbar is at
  // top-most position. This will give chance for widgetNavigation.focusPrevious to execute
  when: ContextKeyExpr.and(
    WorkbenchListFocusContextKey,
    WorkbenchListScrollAtTopContextKey?.negate()
  ),
  primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
  handler: (accessor) => {
    const focused = accessor.get(IListService).lastFocusedList;
    if (!focused) {
      return;
    }
    focused.scrollTop -= 10;
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.scrollDown",
  weight: KeybindingWeight.WorkbenchContrib,
  // same as above
  when: ContextKeyExpr.and(
    WorkbenchListFocusContextKey,
    WorkbenchListScrollAtBottomContextKey?.negate()
  ),
  primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
  handler: (accessor) => {
    const focused = accessor.get(IListService).lastFocusedList;
    if (!focused) {
      return;
    }
    focused.scrollTop += 10;
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.scrollLeft",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  handler: (accessor) => {
    const focused = accessor.get(IListService).lastFocusedList;
    if (!focused) {
      return;
    }
    focused.scrollLeft -= 10;
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "list.scrollRight",
  weight: KeybindingWeight.WorkbenchContrib,
  when: WorkbenchListFocusContextKey,
  handler: (accessor) => {
    const focused = accessor.get(IListService).lastFocusedList;
    if (!focused) {
      return;
    }
    focused.scrollLeft += 10;
  }
});
registerAction2(class ToggleStickyScroll extends Action2 {
  constructor() {
    super({
      id: "tree.toggleStickyScroll",
      title: {
        ...localize2("toggleTreeStickyScroll", "Toggle Tree Sticky Scroll"),
        mnemonicTitle: localize({ key: "mitoggleTreeStickyScroll", comment: ["&& denotes a mnemonic"] }, "&&Toggle Tree Sticky Scroll")
      },
      category: "View",
      metadata: { description: localize("toggleTreeStickyScrollDescription", "Toggles Sticky Scroll widget at the top of tree structures such as the File Explorer and Debug variables View.") },
      f1: true
    });
  }
  run(accessor) {
    const configurationService = accessor.get(IConfigurationService);
    const newValue = !configurationService.getValue("workbench.tree.enableStickyScroll");
    configurationService.updateValue("workbench.tree.enableStickyScroll", newValue);
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL2FjdGlvbnMvbGlzdENvbW1hbmRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgS2V5TW9kLCBLZXlDb2RlLCBLZXlDaG9yZCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVnaXN0cnksIEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IExpc3QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksIElMaXN0U2VydmljZSwgV29ya2JlbmNoTGlzdFN1cHBvcnRzTXVsdGlTZWxlY3RDb250ZXh0S2V5LCBMaXN0V2lkZ2V0LCBXb3JrYmVuY2hMaXN0SGFzU2VsZWN0aW9uT3JGb2N1cywgZ2V0U2VsZWN0aW9uS2V5Ym9hcmRFdmVudCwgV29ya2JlbmNoTGlzdFdpZGdldCwgV29ya2JlbmNoTGlzdFNlbGVjdGlvbk5hdmlnYXRpb24sIFdvcmtiZW5jaFRyZWVFbGVtZW50Q2FuQ29sbGFwc2UsIFdvcmtiZW5jaFRyZWVFbGVtZW50SGFzUGFyZW50LCBXb3JrYmVuY2hUcmVlRWxlbWVudEhhc0NoaWxkLCBXb3JrYmVuY2hUcmVlRWxlbWVudENhbkV4cGFuZCwgUmF3V29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSwgV29ya2JlbmNoVHJlZUZpbmRPcGVuLCBXb3JrYmVuY2hMaXN0U3VwcG9ydHNGaW5kLCBXb3JrYmVuY2hMaXN0U2Nyb2xsQXRCb3R0b21Db250ZXh0S2V5LCBXb3JrYmVuY2hMaXN0U2Nyb2xsQXRUb3BDb250ZXh0S2V5LCBXb3JrYmVuY2hUcmVlU3RpY2t5U2Nyb2xsRm9jdXNlZCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBQYWdlZExpc3QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0UGFnaW5nLmpzJztcbmltcG9ydCB7IGVxdWFscywgcmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IE9iamVjdFRyZWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9vYmplY3RUcmVlLmpzJztcbmltcG9ydCB7IEFzeW5jRGF0YVRyZWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hc3luY0RhdGFUcmVlLmpzJztcbmltcG9ydCB7IERhdGFUcmVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvZGF0YVRyZWUuanMnO1xuaW1wb3J0IHsgSVRyZWVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IFRhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RhYmxlL3RhYmxlV2lkZ2V0LmpzJztcbmltcG9ydCB7IEFic3RyYWN0VHJlZSwgVHJlZUZpbmRNYXRjaFR5cGUsIFRyZWVGaW5kTW9kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2Fic3RyYWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBpc0FjdGl2ZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcblxuZnVuY3Rpb24gZW5zdXJlRE9NRm9jdXMod2lkZ2V0OiBMaXN0V2lkZ2V0IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdC8vIGl0IGNhbiBoYXBwZW4gdGhhdCBvbmUgb2YgdGhlIGNvbW1hbmRzIGlzIGV4ZWN1dGVkIHdoaWxlXG5cdC8vIERPTSBmb2N1cyBpcyB3aXRoaW4gYW5vdGhlciBmb2N1c2FibGUgY29udHJvbCB3aXRoaW4gdGhlXG5cdC8vIGxpc3QvdHJlZSBpdGVtLiB0aGVyZWZvciB3ZSBzaG91bGQgZW5zdXJlIHRoYXQgdGhlXG5cdC8vIGxpc3QvdHJlZSBoYXMgRE9NIGZvY3VzIGFnYWluIGFmdGVyIHRoZSBjb21tYW5kIHJhbi5cblx0Y29uc3QgZWxlbWVudCA9IHdpZGdldD8uZ2V0SFRNTEVsZW1lbnQoKTtcblx0aWYgKGVsZW1lbnQgJiYgIWlzQWN0aXZlRWxlbWVudChlbGVtZW50KSkge1xuXHRcdHdpZGdldD8uZG9tRm9jdXMoKTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiB1cGRhdGVGb2N1cyh3aWRnZXQ6IFdvcmtiZW5jaExpc3RXaWRnZXQsIHVwZGF0ZUZvY3VzRm46ICh3aWRnZXQ6IFdvcmtiZW5jaExpc3RXaWRnZXQpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdGlmICghV29ya2JlbmNoTGlzdFNlbGVjdGlvbk5hdmlnYXRpb24uZ2V0VmFsdWUod2lkZ2V0LmNvbnRleHRLZXlTZXJ2aWNlKSkge1xuXHRcdHJldHVybiB1cGRhdGVGb2N1c0ZuKHdpZGdldCk7XG5cdH1cblxuXHRjb25zdCBmb2N1cyA9IHdpZGdldC5nZXRGb2N1cygpO1xuXHRjb25zdCBzZWxlY3Rpb24gPSB3aWRnZXQuZ2V0U2VsZWN0aW9uKCk7XG5cblx0YXdhaXQgdXBkYXRlRm9jdXNGbih3aWRnZXQpO1xuXG5cdGNvbnN0IG5ld0ZvY3VzID0gd2lkZ2V0LmdldEZvY3VzKCk7XG5cblx0aWYgKHNlbGVjdGlvbi5sZW5ndGggPiAxIHx8ICFlcXVhbHMoZm9jdXMsIHNlbGVjdGlvbikgfHwgZXF1YWxzKGZvY3VzLCBuZXdGb2N1cykpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRjb25zdCBmYWtlS2V5Ym9hcmRFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJyk7XG5cdHdpZGdldC5zZXRTZWxlY3Rpb24obmV3Rm9jdXMsIGZha2VLZXlib2FyZEV2ZW50KTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gbmF2aWdhdGUod2lkZ2V0OiBXb3JrYmVuY2hMaXN0V2lkZ2V0IHwgdW5kZWZpbmVkLCB1cGRhdGVGb2N1c0ZuOiAod2lkZ2V0OiBXb3JrYmVuY2hMaXN0V2lkZ2V0KSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRpZiAoIXdpZGdldCkge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdGF3YWl0IHVwZGF0ZUZvY3VzKHdpZGdldCwgdXBkYXRlRm9jdXNGbik7XG5cblx0Y29uc3QgbGlzdEZvY3VzID0gd2lkZ2V0LmdldEZvY3VzKCk7XG5cblx0aWYgKGxpc3RGb2N1cy5sZW5ndGgpIHtcblx0XHR3aWRnZXQucmV2ZWFsKGxpc3RGb2N1c1swXSk7XG5cdH1cblxuXHR3aWRnZXQuc2V0QW5jaG9yKGxpc3RGb2N1c1swXSk7XG5cdGVuc3VyZURPTUZvY3VzKHdpZGdldCk7XG59XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3QuZm9jdXNEb3duJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksXG5cdHByaW1hcnk6IEtleUNvZGUuRG93bkFycm93LFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuS2V5Tl1cblx0fSxcblx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmcyKSA9PiB7XG5cdFx0bmF2aWdhdGUoYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0LCBhc3luYyB3aWRnZXQgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZUtleWJvYXJkRXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicpO1xuXHRcdFx0YXdhaXQgd2lkZ2V0LmZvY3VzTmV4dCh0eXBlb2YgYXJnMiA9PT0gJ251bWJlcicgPyBhcmcyIDogMSwgZmFsc2UsIGZha2VLZXlib2FyZEV2ZW50KTtcblx0XHR9KTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3QuZm9jdXNVcCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LFxuXHRwcmltYXJ5OiBLZXlDb2RlLlVwQXJyb3csXG5cdG1hYzoge1xuXHRcdHByaW1hcnk6IEtleUNvZGUuVXBBcnJvdyxcblx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuV2luQ3RybCB8IEtleUNvZGUuS2V5UF1cblx0fSxcblx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmcyKSA9PiB7XG5cdFx0bmF2aWdhdGUoYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0LCBhc3luYyB3aWRnZXQgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZUtleWJvYXJkRXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicpO1xuXHRcdFx0YXdhaXQgd2lkZ2V0LmZvY3VzUHJldmlvdXModHlwZW9mIGFyZzIgPT09ICdudW1iZXInID8gYXJnMiA6IDEsIGZhbHNlLCBmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LmZvY3VzQW55RG93bicsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LFxuXHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5Eb3duQXJyb3csXG5cdG1hYzoge1xuXHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleU5dXG5cdH0sXG5cdGhhbmRsZXI6IChhY2Nlc3NvciwgYXJnMikgPT4ge1xuXHRcdG5hdmlnYXRlKGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdCwgYXN5bmMgd2lkZ2V0ID0+IHtcblx0XHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGFsdEtleTogdHJ1ZSB9KTtcblx0XHRcdGF3YWl0IHdpZGdldC5mb2N1c05leHQodHlwZW9mIGFyZzIgPT09ICdudW1iZXInID8gYXJnMiA6IDEsIGZhbHNlLCBmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LmZvY3VzQW55VXAnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSxcblx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuVXBBcnJvdyxcblx0bWFjOiB7XG5cdFx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuVXBBcnJvdyxcblx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuV2luQ3RybCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleVBdXG5cdH0sXG5cdGhhbmRsZXI6IChhY2Nlc3NvciwgYXJnMikgPT4ge1xuXHRcdG5hdmlnYXRlKGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdCwgYXN5bmMgd2lkZ2V0ID0+IHtcblx0XHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGFsdEtleTogdHJ1ZSB9KTtcblx0XHRcdGF3YWl0IHdpZGdldC5mb2N1c1ByZXZpb3VzKHR5cGVvZiBhcmcyID09PSAnbnVtYmVyJyA/IGFyZzIgOiAxLCBmYWxzZSwgZmFrZUtleWJvYXJkRXZlbnQpO1xuXHRcdH0pO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5mb2N1c1BhZ2VEb3duJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksXG5cdHByaW1hcnk6IEtleUNvZGUuUGFnZURvd24sXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdG5hdmlnYXRlKGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdCwgYXN5bmMgd2lkZ2V0ID0+IHtcblx0XHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nKTtcblx0XHRcdGF3YWl0IHdpZGdldC5mb2N1c05leHRQYWdlKGZha2VLZXlib2FyZEV2ZW50KTtcblx0XHR9KTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3QuZm9jdXNQYWdlVXAnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSxcblx0cHJpbWFyeTogS2V5Q29kZS5QYWdlVXAsXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdG5hdmlnYXRlKGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdCwgYXN5bmMgd2lkZ2V0ID0+IHtcblx0XHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nKTtcblx0XHRcdGF3YWl0IHdpZGdldC5mb2N1c1ByZXZpb3VzUGFnZShmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LmZvY3VzRmlyc3QnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSxcblx0cHJpbWFyeTogS2V5Q29kZS5Ib21lLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRuYXZpZ2F0ZShhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3QsIGFzeW5jIHdpZGdldCA9PiB7XG5cdFx0XHRjb25zdCBmYWtlS2V5Ym9hcmRFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJyk7XG5cdFx0XHRhd2FpdCB3aWRnZXQuZm9jdXNGaXJzdChmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LmZvY3VzTGFzdCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LFxuXHRwcmltYXJ5OiBLZXlDb2RlLkVuZCxcblx0aGFuZGxlcjogKGFjY2Vzc29yKSA9PiB7XG5cdFx0bmF2aWdhdGUoYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0LCBhc3luYyB3aWRnZXQgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZUtleWJvYXJkRXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicpO1xuXHRcdFx0YXdhaXQgd2lkZ2V0LmZvY3VzTGFzdChmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0fSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LmZvY3VzQW55Rmlyc3QnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSxcblx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuSG9tZSxcblx0aGFuZGxlcjogKGFjY2Vzc29yKSA9PiB7XG5cdFx0bmF2aWdhdGUoYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0LCBhc3luYyB3aWRnZXQgPT4ge1xuXHRcdFx0Y29uc3QgZmFrZUtleWJvYXJkRXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHsgYWx0S2V5OiB0cnVlIH0pO1xuXHRcdFx0YXdhaXQgd2lkZ2V0LmZvY3VzRmlyc3QoZmFrZUtleWJvYXJkRXZlbnQpO1xuXHRcdH0pO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5mb2N1c0FueUxhc3QnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSxcblx0cHJpbWFyeTogS2V5TW9kLkFsdCB8IEtleUNvZGUuRW5kLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRuYXZpZ2F0ZShhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3QsIGFzeW5jIHdpZGdldCA9PiB7XG5cdFx0XHRjb25zdCBmYWtlS2V5Ym9hcmRFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJywgeyBhbHRLZXk6IHRydWUgfSk7XG5cdFx0XHRhd2FpdCB3aWRnZXQuZm9jdXNMYXN0KGZha2VLZXlib2FyZEV2ZW50KTtcblx0XHR9KTtcblx0fVxufSk7XG5cbmZ1bmN0aW9uIGV4cGFuZE11bHRpU2VsZWN0aW9uKGZvY3VzZWQ6IFdvcmtiZW5jaExpc3RXaWRnZXQsIHByZXZpb3VzRm9jdXM6IHVua25vd24pOiB2b2lkIHtcblxuXHQvLyBMaXN0XG5cdGlmIChmb2N1c2VkIGluc3RhbmNlb2YgTGlzdCB8fCBmb2N1c2VkIGluc3RhbmNlb2YgUGFnZWRMaXN0IHx8IGZvY3VzZWQgaW5zdGFuY2VvZiBUYWJsZSkge1xuXHRcdGNvbnN0IGxpc3QgPSBmb2N1c2VkO1xuXG5cdFx0Y29uc3QgZm9jdXMgPSBsaXN0LmdldEZvY3VzKCkgPyBsaXN0LmdldEZvY3VzKClbMF0gOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gbGlzdC5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoc2VsZWN0aW9uICYmIHR5cGVvZiBmb2N1cyA9PT0gJ251bWJlcicgJiYgc2VsZWN0aW9uLmluZGV4T2YoZm9jdXMpID49IDApIHtcblx0XHRcdGxpc3Quc2V0U2VsZWN0aW9uKHNlbGVjdGlvbi5maWx0ZXIocyA9PiBzICE9PSBwcmV2aW91c0ZvY3VzKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0eXBlb2YgZm9jdXMgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdGxpc3Quc2V0U2VsZWN0aW9uKHNlbGVjdGlvbi5jb25jYXQoZm9jdXMpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyBUcmVlXG5cdGVsc2UgaWYgKGZvY3VzZWQgaW5zdGFuY2VvZiBPYmplY3RUcmVlIHx8IGZvY3VzZWQgaW5zdGFuY2VvZiBEYXRhVHJlZSB8fCBmb2N1c2VkIGluc3RhbmNlb2YgQXN5bmNEYXRhVHJlZSkge1xuXHRcdGNvbnN0IGxpc3QgPSBmb2N1c2VkO1xuXG5cdFx0Y29uc3QgZm9jdXMgPSBsaXN0LmdldEZvY3VzKCkgPyBsaXN0LmdldEZvY3VzKClbMF0gOiB1bmRlZmluZWQ7XG5cblx0XHRpZiAocHJldmlvdXNGb2N1cyA9PT0gZm9jdXMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb24gPSBsaXN0LmdldFNlbGVjdGlvbigpO1xuXHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IHNoaWZ0S2V5OiB0cnVlIH0pO1xuXG5cdFx0aWYgKHNlbGVjdGlvbiAmJiBzZWxlY3Rpb24uaW5kZXhPZihmb2N1cykgPj0gMCkge1xuXHRcdFx0bGlzdC5zZXRTZWxlY3Rpb24oc2VsZWN0aW9uLmZpbHRlcihzID0+IHMgIT09IHByZXZpb3VzRm9jdXMpLCBmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxpc3Quc2V0U2VsZWN0aW9uKHNlbGVjdGlvbi5jb25jYXQoZm9jdXMpLCBmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0fVxuXHR9XG59XG5cbmZ1bmN0aW9uIHJldmVhbEZvY3VzZWRTdGlja3lTY3JvbGwodHJlZTogT2JqZWN0VHJlZTx1bmtub3duLCB1bmtub3duPiB8IERhdGFUcmVlPHVua25vd24sIHVua25vd24+IHwgQXN5bmNEYXRhVHJlZTx1bmtub3duLCB1bmtub3duPiwgcG9zdFJldmVhbEFjdGlvbj86IChmb2N1czogdW5rbm93bikgPT4gdm9pZCk6IHZvaWQge1xuXHRjb25zdCBmb2N1cyA9IHRyZWUuZ2V0U3RpY2t5U2Nyb2xsRm9jdXMoKTtcblxuXHRpZiAoZm9jdXMubGVuZ3RoID09PSAwKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBTdGlja3lTY3JvbGwgaGFzIG5vIGZvY3VzYCk7XG5cdH1cblx0aWYgKGZvY3VzLmxlbmd0aCA+IDEpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoYFN0aWNreVNjcm9sbCBjYW4gb25seSBoYXZlIGEgc2luZ2xlIGZvY3VzZWQgaXRlbWApO1xuXHR9XG5cblx0dHJlZS5yZXZlYWwoZm9jdXNbMF0pO1xuXHR0cmVlLmdldEhUTUxFbGVtZW50KCkuZm9jdXMoKTsgLy8gZG9tZm9jdXMoKSB3b3VsZCBmb2N1cyBzdGlreSBzY3JvbGwgZG9tIGFuZCBub3QgdGhlIHRyZWUgdG9kb0BiZW5pYmVualxuXHR0cmVlLnNldEZvY3VzKGZvY3VzKTtcblx0cG9zdFJldmVhbEFjdGlvbj8uKGZvY3VzWzBdKTtcbn1cblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5leHBhbmRTZWxlY3Rpb25Eb3duJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LCBXb3JrYmVuY2hMaXN0U3VwcG9ydHNNdWx0aVNlbGVjdENvbnRleHRLZXkpLFxuXHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLkRvd25BcnJvdyxcblx0aGFuZGxlcjogKGFjY2Vzc29yLCBhcmcyKSA9PiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0O1xuXG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBGb2N1cyBkb3duIGZpcnN0XG5cdFx0Y29uc3QgcHJldmlvdXNGb2N1cyA9IHdpZGdldC5nZXRGb2N1cygpID8gd2lkZ2V0LmdldEZvY3VzKClbMF0gOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZmFrZUtleWJvYXJkRXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicpO1xuXHRcdHdpZGdldC5mb2N1c05leHQodHlwZW9mIGFyZzIgPT09ICdudW1iZXInID8gYXJnMiA6IDEsIGZhbHNlLCBmYWtlS2V5Ym9hcmRFdmVudCk7XG5cblx0XHQvLyBUaGVuIGFkanVzdCBzZWxlY3Rpb25cblx0XHRleHBhbmRNdWx0aVNlbGVjdGlvbih3aWRnZXQsIHByZXZpb3VzRm9jdXMpO1xuXG5cdFx0Y29uc3QgZm9jdXMgPSB3aWRnZXQuZ2V0Rm9jdXMoKTtcblxuXHRcdGlmIChmb2N1cy5sZW5ndGgpIHtcblx0XHRcdHdpZGdldC5yZXZlYWwoZm9jdXNbMF0pO1xuXHRcdH1cblxuXHRcdGVuc3VyZURPTUZvY3VzKHdpZGdldCk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LmV4cGFuZFNlbGVjdGlvblVwJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LCBXb3JrYmVuY2hMaXN0U3VwcG9ydHNNdWx0aVNlbGVjdENvbnRleHRLZXkpLFxuXHRwcmltYXJ5OiBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlVwQXJyb3csXG5cdGhhbmRsZXI6IChhY2Nlc3NvciwgYXJnMikgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblxuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRm9jdXMgdXAgZmlyc3Rcblx0XHRjb25zdCBwcmV2aW91c0ZvY3VzID0gd2lkZ2V0LmdldEZvY3VzKCkgPyB3aWRnZXQuZ2V0Rm9jdXMoKVswXSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBmYWtlS2V5Ym9hcmRFdmVudCA9IG5ldyBLZXlib2FyZEV2ZW50KCdrZXlkb3duJyk7XG5cdFx0d2lkZ2V0LmZvY3VzUHJldmlvdXModHlwZW9mIGFyZzIgPT09ICdudW1iZXInID8gYXJnMiA6IDEsIGZhbHNlLCBmYWtlS2V5Ym9hcmRFdmVudCk7XG5cblx0XHQvLyBUaGVuIGFkanVzdCBzZWxlY3Rpb25cblx0XHRleHBhbmRNdWx0aVNlbGVjdGlvbih3aWRnZXQsIHByZXZpb3VzRm9jdXMpO1xuXG5cdFx0Y29uc3QgZm9jdXMgPSB3aWRnZXQuZ2V0Rm9jdXMoKTtcblxuXHRcdGlmIChmb2N1cy5sZW5ndGgpIHtcblx0XHRcdHdpZGdldC5yZXZlYWwoZm9jdXNbMF0pO1xuXHRcdH1cblxuXHRcdGVuc3VyZURPTUZvY3VzKHdpZGdldCk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LmNvbGxhcHNlJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LCBDb250ZXh0S2V5RXhwci5vcihXb3JrYmVuY2hUcmVlRWxlbWVudENhbkNvbGxhcHNlLCBXb3JrYmVuY2hUcmVlRWxlbWVudEhhc1BhcmVudCkpLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkxlZnRBcnJvdyxcblx0bWFjOiB7XG5cdFx0cHJpbWFyeTogS2V5Q29kZS5MZWZ0QXJyb3csXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3ddXG5cdH0sXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblxuXHRcdGlmICghd2lkZ2V0IHx8ICEod2lkZ2V0IGluc3RhbmNlb2YgT2JqZWN0VHJlZSB8fCB3aWRnZXQgaW5zdGFuY2VvZiBEYXRhVHJlZSB8fCB3aWRnZXQgaW5zdGFuY2VvZiBBc3luY0RhdGFUcmVlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRyZWUgPSB3aWRnZXQ7XG5cdFx0Y29uc3QgZm9jdXNlZEVsZW1lbnRzID0gdHJlZS5nZXRGb2N1cygpO1xuXG5cdFx0aWYgKGZvY3VzZWRFbGVtZW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmb2N1cyA9IGZvY3VzZWRFbGVtZW50c1swXTtcblxuXHRcdGlmICghdHJlZS5jb2xsYXBzZShmb2N1cykpIHtcblx0XHRcdGNvbnN0IHBhcmVudCA9IHRyZWUuZ2V0UGFyZW50RWxlbWVudChmb2N1cyk7XG5cblx0XHRcdGlmIChwYXJlbnQpIHtcblx0XHRcdFx0bmF2aWdhdGUod2lkZ2V0LCB3aWRnZXQgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nKTtcblx0XHRcdFx0XHR3aWRnZXQuc2V0Rm9jdXMoW3BhcmVudF0sIGZha2VLZXlib2FyZEV2ZW50KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5zdGlja3lTY3JvbGwuY29sbGFwc2UnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDUwLFxuXHR3aGVuOiBXb3JrYmVuY2hUcmVlU3RpY2t5U2Nyb2xsRm9jdXNlZCxcblx0cHJpbWFyeTogS2V5Q29kZS5MZWZ0QXJyb3csXG5cdG1hYzoge1xuXHRcdHByaW1hcnk6IEtleUNvZGUuTGVmdEFycm93LFxuXHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93XVxuXHR9LFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCB3aWRnZXQgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHRpZiAoIXdpZGdldCB8fCAhKHdpZGdldCBpbnN0YW5jZW9mIE9iamVjdFRyZWUgfHwgd2lkZ2V0IGluc3RhbmNlb2YgRGF0YVRyZWUgfHwgd2lkZ2V0IGluc3RhbmNlb2YgQXN5bmNEYXRhVHJlZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRyZXZlYWxGb2N1c2VkU3RpY2t5U2Nyb2xsKHdpZGdldCwgZm9jdXMgPT4gd2lkZ2V0LmNvbGxhcHNlKGZvY3VzKSk7XG5cdH1cbn0pO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LmNvbGxhcHNlQWxsJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5MZWZ0QXJyb3csXG5cdG1hYzoge1xuXHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5MZWZ0QXJyb3csXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlVwQXJyb3ddXG5cdH0sXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHRpZiAoZm9jdXNlZCAmJiAhKGZvY3VzZWQgaW5zdGFuY2VvZiBMaXN0IHx8IGZvY3VzZWQgaW5zdGFuY2VvZiBQYWdlZExpc3QgfHwgZm9jdXNlZCBpbnN0YW5jZW9mIFRhYmxlKSkge1xuXHRcdFx0Zm9jdXNlZC5jb2xsYXBzZUFsbCgpO1xuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3QuY29sbGFwc2VBbGxUb0ZvY3VzJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksXG5cdGhhbmRsZXI6IGFjY2Vzc29yID0+IHtcblx0XHRjb25zdCBmb2N1c2VkID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0O1xuXHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gZ2V0U2VsZWN0aW9uS2V5Ym9hcmRFdmVudCgna2V5ZG93bicsIHRydWUpO1xuXHRcdC8vIFRyZWVzXG5cdFx0aWYgKGZvY3VzZWQgaW5zdGFuY2VvZiBPYmplY3RUcmVlIHx8IGZvY3VzZWQgaW5zdGFuY2VvZiBEYXRhVHJlZSB8fCBmb2N1c2VkIGluc3RhbmNlb2YgQXN5bmNEYXRhVHJlZSkge1xuXHRcdFx0Y29uc3QgdHJlZSA9IGZvY3VzZWQ7XG5cdFx0XHRjb25zdCBmb2N1cyA9IHRyZWUuZ2V0Rm9jdXMoKTtcblxuXHRcdFx0aWYgKGZvY3VzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dHJlZS5jb2xsYXBzZShmb2N1c1swXSwgdHJ1ZSk7XG5cdFx0XHR9XG5cdFx0XHR0cmVlLnNldFNlbGVjdGlvbihmb2N1cywgZmFrZUtleWJvYXJkRXZlbnQpO1xuXHRcdFx0dHJlZS5zZXRBbmNob3IoZm9jdXNbMF0pO1xuXHRcdH1cblx0fVxufSk7XG5cblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5mb2N1c1BhcmVudCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCB3aWRnZXQgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHRpZiAoIXdpZGdldCB8fCAhKHdpZGdldCBpbnN0YW5jZW9mIE9iamVjdFRyZWUgfHwgd2lkZ2V0IGluc3RhbmNlb2YgRGF0YVRyZWUgfHwgd2lkZ2V0IGluc3RhbmNlb2YgQXN5bmNEYXRhVHJlZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0cmVlID0gd2lkZ2V0O1xuXHRcdGNvbnN0IGZvY3VzZWRFbGVtZW50cyA9IHRyZWUuZ2V0Rm9jdXMoKTtcblx0XHRpZiAoZm9jdXNlZEVsZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBmb2N1cyA9IGZvY3VzZWRFbGVtZW50c1swXTtcblx0XHRjb25zdCBwYXJlbnQgPSB0cmVlLmdldFBhcmVudEVsZW1lbnQoZm9jdXMpO1xuXHRcdGlmIChwYXJlbnQpIHtcblx0XHRcdG5hdmlnYXRlKHdpZGdldCwgd2lkZ2V0ID0+IHtcblx0XHRcdFx0Y29uc3QgZmFrZUtleWJvYXJkRXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicpO1xuXHRcdFx0XHR3aWRnZXQuc2V0Rm9jdXMoW3BhcmVudF0sIGZha2VLZXlib2FyZEV2ZW50KTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3QuZXhwYW5kJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LCBDb250ZXh0S2V5RXhwci5vcihXb3JrYmVuY2hUcmVlRWxlbWVudENhbkV4cGFuZCwgV29ya2JlbmNoVHJlZUVsZW1lbnRIYXNDaGlsZCkpLFxuXHRwcmltYXJ5OiBLZXlDb2RlLlJpZ2h0QXJyb3csXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblxuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHdpZGdldCBpbnN0YW5jZW9mIE9iamVjdFRyZWUgfHwgd2lkZ2V0IGluc3RhbmNlb2YgRGF0YVRyZWUpIHtcblx0XHRcdC8vIFRPRE9ASm9hbzogaW5zdGVhZCBvZiBkb2luZyB0aGlzIGhlcmUsIGp1c3QgZGVsZWdhdGUgdG8gYSB0cmVlIG1ldGhvZFxuXHRcdFx0Y29uc3QgZm9jdXNlZEVsZW1lbnRzID0gd2lkZ2V0LmdldEZvY3VzKCk7XG5cblx0XHRcdGlmIChmb2N1c2VkRWxlbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZm9jdXMgPSBmb2N1c2VkRWxlbWVudHNbMF07XG5cblx0XHRcdGlmICghd2lkZ2V0LmV4cGFuZChmb2N1cykpIHtcblx0XHRcdFx0Y29uc3QgY2hpbGQgPSB3aWRnZXQuZ2V0Rmlyc3RFbGVtZW50Q2hpbGQoZm9jdXMpO1xuXG5cdFx0XHRcdGlmIChjaGlsZCkge1xuXHRcdFx0XHRcdGNvbnN0IG5vZGUgPSB3aWRnZXQuZ2V0Tm9kZShjaGlsZCk7XG5cblx0XHRcdFx0XHRpZiAobm9kZS52aXNpYmxlKSB7XG5cdFx0XHRcdFx0XHRuYXZpZ2F0ZSh3aWRnZXQsIHdpZGdldCA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nKTtcblx0XHRcdFx0XHRcdFx0d2lkZ2V0LnNldEZvY3VzKFtjaGlsZF0sIGZha2VLZXlib2FyZEV2ZW50KTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAod2lkZ2V0IGluc3RhbmNlb2YgQXN5bmNEYXRhVHJlZSkge1xuXHRcdFx0Ly8gVE9ET0BKb2FvOiBpbnN0ZWFkIG9mIGRvaW5nIHRoaXMgaGVyZSwganVzdCBkZWxlZ2F0ZSB0byBhIHRyZWUgbWV0aG9kXG5cdFx0XHRjb25zdCBmb2N1c2VkRWxlbWVudHMgPSB3aWRnZXQuZ2V0Rm9jdXMoKTtcblxuXHRcdFx0aWYgKGZvY3VzZWRFbGVtZW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmb2N1cyA9IGZvY3VzZWRFbGVtZW50c1swXTtcblx0XHRcdHdpZGdldC5leHBhbmQoZm9jdXMpLnRoZW4oZGlkRXhwYW5kID0+IHtcblx0XHRcdFx0aWYgKGZvY3VzICYmICFkaWRFeHBhbmQpIHtcblx0XHRcdFx0XHRjb25zdCBjaGlsZCA9IHdpZGdldC5nZXRGaXJzdEVsZW1lbnRDaGlsZChmb2N1cyk7XG5cblx0XHRcdFx0XHRpZiAoY2hpbGQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG5vZGUgPSB3aWRnZXQuZ2V0Tm9kZShjaGlsZCk7XG5cblx0XHRcdFx0XHRcdGlmIChub2RlLnZpc2libGUpIHtcblx0XHRcdFx0XHRcdFx0bmF2aWdhdGUod2lkZ2V0LCB3aWRnZXQgPT4ge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nKTtcblx0XHRcdFx0XHRcdFx0XHR3aWRnZXQuc2V0Rm9jdXMoW2NoaWxkXSwgZmFrZUtleWJvYXJkRXZlbnQpO1xuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblx0fVxufSk7XG5cbmZ1bmN0aW9uIHNlbGVjdEVsZW1lbnQoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHJldGFpbkN1cnJlbnRGb2N1czogYm9vbGVhbik6IHZvaWQge1xuXHRjb25zdCBmb2N1c2VkID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0O1xuXHRjb25zdCBmYWtlS2V5Ym9hcmRFdmVudCA9IGdldFNlbGVjdGlvbktleWJvYXJkRXZlbnQoJ2tleWRvd24nLCByZXRhaW5DdXJyZW50Rm9jdXMpO1xuXHQvLyBMaXN0XG5cdGlmIChmb2N1c2VkIGluc3RhbmNlb2YgTGlzdCB8fCBmb2N1c2VkIGluc3RhbmNlb2YgUGFnZWRMaXN0IHx8IGZvY3VzZWQgaW5zdGFuY2VvZiBUYWJsZSkge1xuXHRcdGNvbnN0IGxpc3QgPSBmb2N1c2VkO1xuXHRcdGxpc3Quc2V0QW5jaG9yKGxpc3QuZ2V0Rm9jdXMoKVswXSk7XG5cdFx0bGlzdC5zZXRTZWxlY3Rpb24obGlzdC5nZXRGb2N1cygpLCBmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdH1cblxuXHQvLyBUcmVlc1xuXHRlbHNlIGlmIChmb2N1c2VkIGluc3RhbmNlb2YgT2JqZWN0VHJlZSB8fCBmb2N1c2VkIGluc3RhbmNlb2YgRGF0YVRyZWUgfHwgZm9jdXNlZCBpbnN0YW5jZW9mIEFzeW5jRGF0YVRyZWUpIHtcblx0XHRjb25zdCB0cmVlID0gZm9jdXNlZDtcblx0XHRjb25zdCBmb2N1cyA9IHRyZWUuZ2V0Rm9jdXMoKTtcblxuXHRcdGlmIChmb2N1cy5sZW5ndGggPiAwKSB7XG5cdFx0XHRsZXQgdG9nZ2xlQ29sbGFwc2VkID0gdHJ1ZTtcblxuXHRcdFx0aWYgKHRyZWUuZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrID09PSB0cnVlKSB7XG5cdFx0XHRcdHRvZ2dsZUNvbGxhcHNlZCA9IGZhbHNlO1xuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgdHJlZS5leHBhbmRPbmx5T25Ud2lzdGllQ2xpY2sgIT09ICdib29sZWFuJyAmJiB0cmVlLmV4cGFuZE9ubHlPblR3aXN0aWVDbGljayhmb2N1c1swXSkpIHtcblx0XHRcdFx0dG9nZ2xlQ29sbGFwc2VkID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0b2dnbGVDb2xsYXBzZWQpIHtcblx0XHRcdFx0dHJlZS50b2dnbGVDb2xsYXBzZWQoZm9jdXNbMF0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0cmVlLnNldEFuY2hvcihmb2N1c1swXSk7XG5cdFx0dHJlZS5zZXRTZWxlY3Rpb24oZm9jdXMsIGZha2VLZXlib2FyZEV2ZW50KTtcblx0fVxufVxuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LnNlbGVjdCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LFxuXHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlDb2RlLkVudGVyLFxuXHRcdHNlY29uZGFyeTogW0tleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5Eb3duQXJyb3ddXG5cdH0sXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdHNlbGVjdEVsZW1lbnQoYWNjZXNzb3IsIGZhbHNlKTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3Quc3RpY2t5U2Nyb2xsc2VsZWN0Jyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyA1MCwgLy8gcHJpb3JpdGllcyBvdmVyIGZpbGUgZXhwbG9yZXJcblx0d2hlbjogV29ya2JlbmNoVHJlZVN0aWNreVNjcm9sbEZvY3VzZWQsXG5cdHByaW1hcnk6IEtleUNvZGUuRW50ZXIsXG5cdG1hYzoge1xuXHRcdHByaW1hcnk6IEtleUNvZGUuRW50ZXIsXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvd11cblx0fSxcblx0aGFuZGxlcjogKGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0O1xuXG5cdFx0aWYgKCF3aWRnZXQgfHwgISh3aWRnZXQgaW5zdGFuY2VvZiBPYmplY3RUcmVlIHx8IHdpZGdldCBpbnN0YW5jZW9mIERhdGFUcmVlIHx8IHdpZGdldCBpbnN0YW5jZW9mIEFzeW5jRGF0YVRyZWUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV2ZWFsRm9jdXNlZFN0aWNreVNjcm9sbCh3aWRnZXQsIGZvY3VzID0+IHdpZGdldC5zZXRTZWxlY3Rpb24oW2ZvY3VzXSkpO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5zZWxlY3RBbmRQcmVzZXJ2ZUZvY3VzJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksXG5cdGhhbmRsZXI6IGFjY2Vzc29yID0+IHtcblx0XHRzZWxlY3RFbGVtZW50KGFjY2Vzc29yLCB0cnVlKTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3Quc2VsZWN0QWxsJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LCBXb3JrYmVuY2hMaXN0U3VwcG9ydHNNdWx0aVNlbGVjdENvbnRleHRLZXkpLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5QSxcblx0aGFuZGxlcjogKGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblxuXHRcdC8vIExpc3Rcblx0XHRpZiAoZm9jdXNlZCBpbnN0YW5jZW9mIExpc3QgfHwgZm9jdXNlZCBpbnN0YW5jZW9mIFBhZ2VkTGlzdCB8fCBmb2N1c2VkIGluc3RhbmNlb2YgVGFibGUpIHtcblx0XHRcdGNvbnN0IGxpc3QgPSBmb2N1c2VkO1xuXHRcdFx0Y29uc3QgZmFrZUtleWJvYXJkRXZlbnQgPSBuZXcgS2V5Ym9hcmRFdmVudCgna2V5ZG93bicpO1xuXHRcdFx0bGlzdC5zZXRTZWxlY3Rpb24ocmFuZ2UobGlzdC5sZW5ndGgpLCBmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0fVxuXG5cdFx0Ly8gVHJlZXNcblx0XHRlbHNlIGlmIChmb2N1c2VkIGluc3RhbmNlb2YgT2JqZWN0VHJlZSB8fCBmb2N1c2VkIGluc3RhbmNlb2YgRGF0YVRyZWUgfHwgZm9jdXNlZCBpbnN0YW5jZW9mIEFzeW5jRGF0YVRyZWUpIHtcblx0XHRcdGNvbnN0IHRyZWUgPSBmb2N1c2VkO1xuXHRcdFx0Y29uc3QgZm9jdXMgPSB0cmVlLmdldEZvY3VzKCk7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0cmVlLmdldFNlbGVjdGlvbigpO1xuXG5cdFx0XHQvLyBXaGljaCBlbGVtZW50IHNob3VsZCBiZSBjb25zaWRlcmVkIHRvIHN0YXJ0IHNlbGVjdGluZyBhbGw/XG5cdFx0XHRsZXQgc3RhcnQ6IHVua25vd24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRcdGlmIChmb2N1cy5sZW5ndGggPiAwICYmIChzZWxlY3Rpb24ubGVuZ3RoID09PSAwIHx8ICFzZWxlY3Rpb24uaW5jbHVkZXMoZm9jdXNbMF0pKSkge1xuXHRcdFx0XHRzdGFydCA9IGZvY3VzWzBdO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXN0YXJ0ICYmIHNlbGVjdGlvbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHN0YXJ0ID0gc2VsZWN0aW9uWzBdO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBXaGF0IGlzIHRoZSBzY29wZSBvZiBzZWxlY3QgYWxsP1xuXHRcdFx0bGV0IHNjb3BlOiB1bmtub3duIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAoIXN0YXJ0KSB7XG5cdFx0XHRcdHNjb3BlID0gdW5kZWZpbmVkO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2NvcGUgPSB0cmVlLmdldFBhcmVudEVsZW1lbnQoc3RhcnQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBuZXdTZWxlY3Rpb246IHVua25vd25bXSA9IFtdO1xuXHRcdFx0Y29uc3QgdmlzaXQgPSAobm9kZTogSVRyZWVOb2RlPHVua25vd24sIHVua25vd24+KSA9PiB7XG5cdFx0XHRcdGZvciAoY29uc3QgY2hpbGQgb2Ygbm9kZS5jaGlsZHJlbikge1xuXHRcdFx0XHRcdGlmIChjaGlsZC52aXNpYmxlKSB7XG5cdFx0XHRcdFx0XHRuZXdTZWxlY3Rpb24ucHVzaChjaGlsZC5lbGVtZW50KTtcblxuXHRcdFx0XHRcdFx0aWYgKCFjaGlsZC5jb2xsYXBzZWQpIHtcblx0XHRcdFx0XHRcdFx0dmlzaXQoY2hpbGQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gQWRkIHRoZSB3aG9sZSBzY29wZSBzdWJ0cmVlIHRvIHRoZSBuZXcgc2VsZWN0aW9uXG5cdFx0XHR2aXNpdCh0cmVlLmdldE5vZGUoc2NvcGUpKTtcblxuXHRcdFx0Ly8gSWYgdGhlIHNjb3BlIGlzbid0IHRoZSB0cmVlIHJvb3QsIGl0IHNob3VsZCBiZSBwYXJ0IG9mIHRoZSBuZXcgc2VsZWN0aW9uXG5cdFx0XHRpZiAoc2NvcGUgJiYgc2VsZWN0aW9uLmxlbmd0aCA9PT0gbmV3U2VsZWN0aW9uLmxlbmd0aCkge1xuXHRcdFx0XHRuZXdTZWxlY3Rpb24udW5zaGlmdChzY29wZSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nKTtcblx0XHRcdHRyZWUuc2V0U2VsZWN0aW9uKG5ld1NlbGVjdGlvbiwgZmFrZUtleWJvYXJkRXZlbnQpO1xuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3QudG9nZ2xlU2VsZWN0aW9uJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5FbnRlcixcblx0aGFuZGxlcjogKGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0O1xuXG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmb2N1cyA9IHdpZGdldC5nZXRGb2N1cygpO1xuXG5cdFx0aWYgKGZvY3VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHdpZGdldC5nZXRTZWxlY3Rpb24oKTtcblx0XHRjb25zdCBpbmRleCA9IHNlbGVjdGlvbi5pbmRleE9mKGZvY3VzWzBdKTtcblxuXHRcdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0XHR3aWRnZXQuc2V0U2VsZWN0aW9uKFsuLi5zZWxlY3Rpb24uc2xpY2UoMCwgaW5kZXgpLCAuLi5zZWxlY3Rpb24uc2xpY2UoaW5kZXggKyAxKV0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR3aWRnZXQuc2V0U2VsZWN0aW9uKFsuLi5zZWxlY3Rpb24sIGZvY3VzWzBdXSk7XG5cdFx0fVxuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5zaG93SG92ZXInLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0cHJpbWFyeTogS2V5Q2hvcmQoS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUssIEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5LZXlJKSxcblx0d2hlbjogV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSxcblx0aGFuZGxlcjogYXN5bmMgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgbGlzdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKTtcblx0XHRjb25zdCBsYXN0Rm9jdXNlZExpc3QgPSBsaXN0U2VydmljZS5sYXN0Rm9jdXNlZExpc3Q7XG5cdFx0aWYgKCFsYXN0Rm9jdXNlZExpc3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBpZiBhIHRyZWUgZWxlbWVudCBpcyBmb2N1c2VkXG5cdFx0Y29uc3QgZm9jdXMgPSBsYXN0Rm9jdXNlZExpc3QuZ2V0Rm9jdXMoKTtcblx0XHRpZiAoIWZvY3VzIHx8IChmb2N1cy5sZW5ndGggPT09IDApKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQXMgdGhlIHRyZWUgZG9lcyBub3Qga25vdyBhbnl0aGluZyBhYm91dCB0aGUgcmVuZGVyZWQgRE9NIGVsZW1lbnRzXG5cdFx0Ly8gd2UgaGF2ZSB0byB0cmF2ZXJzZSB0aGUgZG9tIHRvIGZpbmQgdGhlIEhUTUxFbGVtZW50c1xuXHRcdGNvbnN0IHRyZWVET00gPSBsYXN0Rm9jdXNlZExpc3QuZ2V0SFRNTEVsZW1lbnQoKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBzY3JvbGxhYmxlRWxlbWVudCA9IHRyZWVET00ucXVlcnlTZWxlY3RvcignLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQnKTtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBsaXN0Um93cyA9IHNjcm9sbGFibGVFbGVtZW50Py5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWxpc3Qtcm93cycpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGZvY3VzZWRFbGVtZW50ID0gbGlzdFJvd3M/LnF1ZXJ5U2VsZWN0b3IoJy5mb2N1c2VkJyk7XG5cdFx0aWYgKCFmb2N1c2VkRWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVsZW1lbnRXaXRoSG92ZXIgPSBnZXRDdXN0b21Ib3ZlckZvckVsZW1lbnQoZm9jdXNlZEVsZW1lbnQgYXMgSFRNTEVsZW1lbnQpO1xuXHRcdGlmIChlbGVtZW50V2l0aEhvdmVyKSB7XG5cdFx0XHRhY2Nlc3Nvci5nZXQoSUhvdmVyU2VydmljZSkuc2hvd01hbmFnZWRIb3ZlcihlbGVtZW50V2l0aEhvdmVyKTtcblx0XHR9XG5cdH0sXG59KTtcblxuZnVuY3Rpb24gZ2V0Q3VzdG9tSG92ZXJGb3JFbGVtZW50KGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHQvLyBDaGVjayBpZiB0aGUgZWxlbWVudCBpdHNlbGYgaGFzIGEgaG92ZXJcblx0aWYgKGVsZW1lbnQubWF0Y2hlcygnW2N1c3RvbS1ob3Zlcj1cInRydWVcIl0nKSkge1xuXHRcdHJldHVybiBlbGVtZW50O1xuXHR9XG5cblx0Ly8gT25seSBjb25zaWRlciBjaGlsZHJlbiB0aGF0IGFyZSBub3QgYWN0aW9uIGl0ZW1zIG9yIGhhdmUgYSB0YWJpbmRleFxuXHQvLyBhcyB0aGVzZSBlbGVtZW50IGFyZSBmb2N1c2FibGUgYW5kIHRoZSB1c2VyIGlzIGFibGUgdG8gdHJpZ2dlciB0aGVtIGFscmVhZHlcblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdGNvbnN0IG5vbmVGb2N1c2FibGVFbGVtZW50V2l0aEhvdmVyID0gZWxlbWVudC5xdWVyeVNlbGVjdG9yKCdbY3VzdG9tLWhvdmVyPVwidHJ1ZVwiXTpub3QoW3RhYmluZGV4XSk6bm90KC5hY3Rpb24taXRlbSknKTtcblx0aWYgKG5vbmVGb2N1c2FibGVFbGVtZW50V2l0aEhvdmVyKSB7XG5cdFx0cmV0dXJuIG5vbmVGb2N1c2FibGVFbGVtZW50V2l0aEhvdmVyIGFzIEhUTUxFbGVtZW50O1xuXHR9XG5cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC50b2dnbGVFeHBhbmQnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSxcblx0cHJpbWFyeTogS2V5Q29kZS5TcGFjZSxcblx0aGFuZGxlcjogKGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblxuXHRcdC8vIFRyZWUgb25seVxuXHRcdGlmIChmb2N1c2VkIGluc3RhbmNlb2YgT2JqZWN0VHJlZSB8fCBmb2N1c2VkIGluc3RhbmNlb2YgRGF0YVRyZWUgfHwgZm9jdXNlZCBpbnN0YW5jZW9mIEFzeW5jRGF0YVRyZWUpIHtcblx0XHRcdGNvbnN0IHRyZWUgPSBmb2N1c2VkO1xuXHRcdFx0Y29uc3QgZm9jdXMgPSB0cmVlLmdldEZvY3VzKCk7XG5cblx0XHRcdGlmICghdHJlZS5vcHRpb25zLmRpc2FibGVFeHBhbmRPblNwYWNlYmFyICYmIGZvY3VzLmxlbmd0aCA+IDAgJiYgdHJlZS5pc0NvbGxhcHNpYmxlKGZvY3VzWzBdKSkge1xuXHRcdFx0XHR0cmVlLnRvZ2dsZUNvbGxhcHNlZChmb2N1c1swXSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzZWxlY3RFbGVtZW50KGFjY2Vzc29yLCB0cnVlKTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3Quc3RpY2t5U2Nyb2xsdG9nZ2xlRXhwYW5kJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyA1MCwgLy8gcHJpb3JpdGllcyBvdmVyIGZpbGUgZXhwbG9yZXJcblx0d2hlbjogV29ya2JlbmNoVHJlZVN0aWNreVNjcm9sbEZvY3VzZWQsXG5cdHByaW1hcnk6IEtleUNvZGUuU3BhY2UsXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblxuXHRcdGlmICghd2lkZ2V0IHx8ICEod2lkZ2V0IGluc3RhbmNlb2YgT2JqZWN0VHJlZSB8fCB3aWRnZXQgaW5zdGFuY2VvZiBEYXRhVHJlZSB8fCB3aWRnZXQgaW5zdGFuY2VvZiBBc3luY0RhdGFUcmVlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHJldmVhbEZvY3VzZWRTdGlja3lTY3JvbGwod2lkZ2V0KTtcblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3QuY2xlYXInLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksIFdvcmtiZW5jaExpc3RIYXNTZWxlY3Rpb25PckZvY3VzKSxcblx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblxuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gd2lkZ2V0LmdldFNlbGVjdGlvbigpO1xuXHRcdGNvbnN0IGZha2VLZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nKTtcblxuXHRcdGlmIChzZWxlY3Rpb24ubGVuZ3RoID4gMSkge1xuXHRcdFx0Y29uc3QgdXNlU2VsZWN0aW9uTmF2aWdhdGlvbiA9IFdvcmtiZW5jaExpc3RTZWxlY3Rpb25OYXZpZ2F0aW9uLmdldFZhbHVlKHdpZGdldC5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRpZiAodXNlU2VsZWN0aW9uTmF2aWdhdGlvbikge1xuXHRcdFx0XHRjb25zdCBmb2N1cyA9IHdpZGdldC5nZXRGb2N1cygpO1xuXHRcdFx0XHR3aWRnZXQuc2V0U2VsZWN0aW9uKFtmb2N1c1swXV0sIGZha2VLZXlib2FyZEV2ZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHdpZGdldC5zZXRTZWxlY3Rpb24oW10sIGZha2VLZXlib2FyZEV2ZW50KTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0d2lkZ2V0LnNldFNlbGVjdGlvbihbXSwgZmFrZUtleWJvYXJkRXZlbnQpO1xuXHRcdFx0d2lkZ2V0LnNldEZvY3VzKFtdLCBmYWtlS2V5Ym9hcmRFdmVudCk7XG5cdFx0fVxuXG5cdFx0d2lkZ2V0LnNldEFuY2hvcih1bmRlZmluZWQpO1xuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogJ2xpc3QudHJpZ2dlclR5cGVOYXZpZ2F0aW9uJyxcblx0aGFuZGxlcjogKGFjY2Vzc29yKSA9PiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0O1xuXHRcdHdpZGdldD8udHJpZ2dlclR5cGVOYXZpZ2F0aW9uKCk7XG5cdH1cbn0pO1xuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCh7XG5cdGlkOiAnbGlzdC50b2dnbGVGaW5kTW9kZScsXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblxuXHRcdGlmICh3aWRnZXQgaW5zdGFuY2VvZiBBYnN0cmFjdFRyZWUgfHwgd2lkZ2V0IGluc3RhbmNlb2YgQXN5bmNEYXRhVHJlZSkge1xuXHRcdFx0Y29uc3QgdHJlZSA9IHdpZGdldDtcblx0XHRcdHRyZWUuZmluZE1vZGUgPSB0cmVlLmZpbmRNb2RlID09PSBUcmVlRmluZE1vZGUuRmlsdGVyID8gVHJlZUZpbmRNb2RlLkhpZ2hsaWdodCA6IFRyZWVGaW5kTW9kZS5GaWx0ZXI7XG5cdFx0fVxuXHR9XG59KTtcblxuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRpZDogJ2xpc3QudG9nZ2xlRmluZE1hdGNoVHlwZScsXG5cdGhhbmRsZXI6IChhY2Nlc3NvcikgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblxuXHRcdGlmICh3aWRnZXQgaW5zdGFuY2VvZiBBYnN0cmFjdFRyZWUgfHwgd2lkZ2V0IGluc3RhbmNlb2YgQXN5bmNEYXRhVHJlZSkge1xuXHRcdFx0Y29uc3QgdHJlZSA9IHdpZGdldDtcblx0XHRcdHRyZWUuZmluZE1hdGNoVHlwZSA9IHRyZWUuZmluZE1hdGNoVHlwZSA9PT0gVHJlZUZpbmRNYXRjaFR5cGUuQ29udGlndW91cyA/IFRyZWVGaW5kTWF0Y2hUeXBlLkZ1enp5IDogVHJlZUZpbmRNYXRjaFR5cGUuQ29udGlndW91cztcblx0XHR9XG5cdH1cbn0pO1xuXG4vLyBEZXByZWNhdGVkIGNvbW1hbmRzXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFsaWFzKCdsaXN0LnRvZ2dsZUtleWJvYXJkTmF2aWdhdGlvbicsICdsaXN0LnRyaWdnZXJUeXBlTmF2aWdhdGlvbicpO1xuQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbGlhcygnbGlzdC50b2dnbGVGaWx0ZXJPblR5cGUnLCAnbGlzdC50b2dnbGVGaW5kTW9kZScpO1xuXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdsaXN0LmZpbmQnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFJhd1dvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksIFdvcmtiZW5jaExpc3RTdXBwb3J0c0ZpbmQpLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5BbHQgfCBLZXlDb2RlLktleUYsXG5cdHNlY29uZGFyeTogW0tleUNvZGUuRjNdLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCB3aWRnZXQgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHQvLyBMaXN0XG5cdFx0aWYgKHdpZGdldCBpbnN0YW5jZW9mIExpc3QgfHwgd2lkZ2V0IGluc3RhbmNlb2YgUGFnZWRMaXN0IHx8IHdpZGdldCBpbnN0YW5jZW9mIFRhYmxlKSB7XG5cdFx0XHQvLyBUT0RPQGpvYW9cblx0XHR9XG5cblx0XHQvLyBUcmVlXG5cdFx0ZWxzZSBpZiAod2lkZ2V0IGluc3RhbmNlb2YgQWJzdHJhY3RUcmVlIHx8IHdpZGdldCBpbnN0YW5jZW9mIEFzeW5jRGF0YVRyZWUpIHtcblx0XHRcdGNvbnN0IHRyZWUgPSB3aWRnZXQ7XG5cdFx0XHR0cmVlLm9wZW5GaW5kKCk7XG5cdFx0fVxuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5jbG9zZUZpbmQnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFJhd1dvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksIFdvcmtiZW5jaFRyZWVGaW5kT3BlbiksXG5cdHByaW1hcnk6IEtleUNvZGUuRXNjYXBlLFxuXHRoYW5kbGVyOiAoYWNjZXNzb3IpID0+IHtcblx0XHRjb25zdCB3aWRnZXQgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKS5sYXN0Rm9jdXNlZExpc3Q7XG5cblx0XHRpZiAod2lkZ2V0IGluc3RhbmNlb2YgQWJzdHJhY3RUcmVlIHx8IHdpZGdldCBpbnN0YW5jZW9mIEFzeW5jRGF0YVRyZWUpIHtcblx0XHRcdGNvbnN0IHRyZWUgPSB3aWRnZXQ7XG5cdFx0XHR0cmVlLmNsb3NlRmluZCgpO1xuXHRcdH1cblx0fVxufSk7XG5cbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2xpc3Quc2Nyb2xsVXAnLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0Ly8gU2luY2UgdGhlIGRlZmF1bHQga2V5YmluZGluZ3MgZm9yIGxpc3Quc2Nyb2xsVXAgYW5kIHdpZGdldE5hdmlnYXRpb24uZm9jdXNQcmV2aW91c1xuXHQvLyBhcmUgYm90aCBDdHJsK1VwQXJyb3csIHdlIGRpc2FibGUgdGhpcyBjb21tYW5kIHdoZW4gdGhlIHNjcm9sbGJhciBpcyBhdFxuXHQvLyB0b3AtbW9zdCBwb3NpdGlvbi4gVGhpcyB3aWxsIGdpdmUgY2hhbmNlIGZvciB3aWRnZXROYXZpZ2F0aW9uLmZvY3VzUHJldmlvdXMgdG8gZXhlY3V0ZVxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0V29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSxcblx0XHRXb3JrYmVuY2hMaXN0U2Nyb2xsQXRUb3BDb250ZXh0S2V5Py5uZWdhdGUoKSksXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5VcEFycm93LFxuXHRoYW5kbGVyOiBhY2Nlc3NvciA9PiB7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblxuXHRcdGlmICghZm9jdXNlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvY3VzZWQuc2Nyb2xsVG9wIC09IDEwO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5zY3JvbGxEb3duJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdC8vIHNhbWUgYXMgYWJvdmVcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksXG5cdFx0V29ya2JlbmNoTGlzdFNjcm9sbEF0Qm90dG9tQ29udGV4dEtleT8ubmVnYXRlKCkpLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRG93bkFycm93LFxuXHRoYW5kbGVyOiBhY2Nlc3NvciA9PiB7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblxuXHRcdGlmICghZm9jdXNlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvY3VzZWQuc2Nyb2xsVG9wICs9IDEwO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5zY3JvbGxMZWZ0Jyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHdoZW46IFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXksXG5cdGhhbmRsZXI6IGFjY2Vzc29yID0+IHtcblx0XHRjb25zdCBmb2N1c2VkID0gYWNjZXNzb3IuZ2V0KElMaXN0U2VydmljZSkubGFzdEZvY3VzZWRMaXN0O1xuXG5cdFx0aWYgKCFmb2N1c2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9jdXNlZC5zY3JvbGxMZWZ0IC09IDEwO1xuXHR9XG59KTtcblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnbGlzdC5zY3JvbGxSaWdodCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHR3aGVuOiBXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5LFxuXHRoYW5kbGVyOiBhY2Nlc3NvciA9PiB7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IGFjY2Vzc29yLmdldChJTGlzdFNlcnZpY2UpLmxhc3RGb2N1c2VkTGlzdDtcblxuXHRcdGlmICghZm9jdXNlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvY3VzZWQuc2Nyb2xsTGVmdCArPSAxMDtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVTdGlja3lTY3JvbGwgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICd0cmVlLnRvZ2dsZVN0aWNreVNjcm9sbCcsXG5cdFx0XHR0aXRsZToge1xuXHRcdFx0XHQuLi5sb2NhbGl6ZTIoJ3RvZ2dsZVRyZWVTdGlja3lTY3JvbGwnLCBcIlRvZ2dsZSBUcmVlIFN0aWNreSBTY3JvbGxcIiksXG5cdFx0XHRcdG1uZW1vbmljVGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWl0b2dnbGVUcmVlU3RpY2t5U2Nyb2xsJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmVG9nZ2xlIFRyZWUgU3RpY2t5IFNjcm9sbFwiKSxcblx0XHRcdH0sXG5cdFx0XHRjYXRlZ29yeTogJ1ZpZXcnLFxuXHRcdFx0bWV0YWRhdGE6IHsgZGVzY3JpcHRpb246IGxvY2FsaXplKCd0b2dnbGVUcmVlU3RpY2t5U2Nyb2xsRGVzY3JpcHRpb24nLCBcIlRvZ2dsZXMgU3RpY2t5IFNjcm9sbCB3aWRnZXQgYXQgdGhlIHRvcCBvZiB0cmVlIHN0cnVjdHVyZXMgc3VjaCBhcyB0aGUgRmlsZSBFeHBsb3JlciBhbmQgRGVidWcgdmFyaWFibGVzIFZpZXcuXCIpIH0sXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBuZXdWYWx1ZSA9ICFjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPignd29ya2JlbmNoLnRyZWUuZW5hYmxlU3RpY2t5U2Nyb2xsJyk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ3dvcmtiZW5jaC50cmVlLmVuYWJsZVN0aWNreVNjcm9sbCcsIG5ld1ZhbHVlKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFFBQVEsU0FBUyxnQkFBZ0I7QUFFMUMsU0FBUyxxQkFBcUIsd0JBQXdCO0FBQ3RELFNBQVMsWUFBWTtBQUNyQixTQUFTLDhCQUE4QixjQUFjLDRDQUF3RCxrQ0FBa0MsMkJBQWdELGtDQUFr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
