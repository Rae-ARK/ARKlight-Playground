import { DECREASE_HOVER_VERBOSITY_ACTION_ID, DECREASE_HOVER_VERBOSITY_ACTION_LABEL, GO_TO_BOTTOM_HOVER_ACTION_ID, GO_TO_TOP_HOVER_ACTION_ID, HIDE_HOVER_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_ID, INCREASE_HOVER_VERBOSITY_ACTION_LABEL, PAGE_DOWN_HOVER_ACTION_ID, PAGE_UP_HOVER_ACTION_ID, SCROLL_DOWN_HOVER_ACTION_ID, SCROLL_LEFT_HOVER_ACTION_ID, SCROLL_RIGHT_HOVER_ACTION_ID, SCROLL_UP_HOVER_ACTION_ID, SHOW_DEFINITION_PREVIEW_HOVER_ACTION_ID, SHOW_OR_FOCUS_HOVER_ACTION_ID } from "./hoverActionIds.js";
import { KeyChord, KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { EditorAction } from "../../../browser/editorExtensions.js";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { Range } from "../../../common/core/range.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { GotoDefinitionAtPositionEditorContribution } from "../../gotoSymbol/browser/link/goToDefinitionAtPosition.js";
import { HoverStartMode, HoverStartSource } from "./hoverOperation.js";
import { AccessibilitySupport } from "../../../../platform/accessibility/common/accessibility.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ContentHoverController } from "./contentHoverController.js";
import { HoverVerbosityAction } from "../../../common/languages.js";
import * as nls from "../../../../nls.js";
import "./hover.css";
var HoverFocusBehavior = /* @__PURE__ */ ((HoverFocusBehavior2) => {
  HoverFocusBehavior2["NoAutoFocus"] = "noAutoFocus";
  HoverFocusBehavior2["FocusIfVisible"] = "focusIfVisible";
  HoverFocusBehavior2["AutoFocusImmediately"] = "autoFocusImmediately";
  return HoverFocusBehavior2;
})(HoverFocusBehavior || {});
class ShowOrFocusHoverAction extends EditorAction {
  constructor() {
    super({
      id: SHOW_OR_FOCUS_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "showOrFocusHover",
        comment: [
          "Label for action that will trigger the showing/focusing of a hover in the editor.",
          "If the hover is not visible, it will show the hover.",
          "This allows for users to show the hover without using the mouse."
        ]
      }, "Show or Focus Hover"),
      metadata: {
        description: nls.localize2("showOrFocusHoverDescription", "Show or focus the editor hover which shows documentation, references, and other content for a symbol at the current cursor position."),
        args: [{
          name: "args",
          schema: {
            type: "object",
            properties: {
              "focus": {
                description: "Controls if and when the hover should take focus upon being triggered by this action.",
                enum: ["noAutoFocus" /* NoAutoFocus */, "focusIfVisible" /* FocusIfVisible */, "autoFocusImmediately" /* AutoFocusImmediately */],
                enumDescriptions: [
                  nls.localize("showOrFocusHover.focus.noAutoFocus", "The hover will not automatically take focus."),
                  nls.localize("showOrFocusHover.focus.focusIfVisible", "The hover will take focus only if it is already visible."),
                  nls.localize("showOrFocusHover.focus.autoFocusImmediately", "The hover will automatically take focus when it appears.")
                ],
                default: "focusIfVisible" /* FocusIfVisible */
              }
            }
          }
        }]
      },
      precondition: void 0,
      kbOpts: {
        kbExpr: EditorContextKeys.editorTextFocus,
        primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
        weight: KeybindingWeight.EditorContrib
      }
    });
  }
  run(accessor, editor, args) {
    if (!editor.hasModel()) {
      return;
    }
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    const focusArgument = args?.focus;
    let focusOption = "focusIfVisible" /* FocusIfVisible */;
    if (Object.values(HoverFocusBehavior).includes(focusArgument)) {
      focusOption = focusArgument;
    } else if (typeof focusArgument === "boolean" && focusArgument) {
      focusOption = "autoFocusImmediately" /* AutoFocusImmediately */;
    }
    const showContentHover = (focus) => {
      const position = editor.getPosition();
      const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
      controller.showContentHover(range, HoverStartMode.Immediate, HoverStartSource.Keyboard, focus);
    };
    const accessibilitySupportEnabled = editor.getOption(EditorOption.accessibilitySupport) === AccessibilitySupport.Enabled;
    if (controller.isHoverVisible) {
      if (focusOption !== "noAutoFocus" /* NoAutoFocus */) {
        controller.focus();
      } else {
        showContentHover(accessibilitySupportEnabled);
      }
    } else {
      showContentHover(accessibilitySupportEnabled || focusOption === "autoFocusImmediately" /* AutoFocusImmediately */);
    }
  }
}
class ShowDefinitionPreviewHoverAction extends EditorAction {
  constructor() {
    super({
      id: SHOW_DEFINITION_PREVIEW_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "showDefinitionPreviewHover",
        comment: [
          "Label for action that will trigger the showing of definition preview hover in the editor.",
          "This allows for users to show the definition preview hover without using the mouse."
        ]
      }, "Show Definition Preview Hover"),
      precondition: void 0,
      metadata: {
        description: nls.localize2("showDefinitionPreviewHoverDescription", "Show the definition preview hover in the editor.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    const position = editor.getPosition();
    if (!position) {
      return;
    }
    const range = new Range(position.lineNumber, position.column, position.lineNumber, position.column);
    const goto = GotoDefinitionAtPositionEditorContribution.get(editor);
    if (!goto) {
      return;
    }
    const promise = goto.startFindDefinitionFromCursor(position);
    promise.then(() => {
      controller.showContentHover(range, HoverStartMode.Immediate, HoverStartSource.Keyboard, true);
    });
  }
}
class HideContentHoverAction extends EditorAction {
  constructor() {
    super({
      id: HIDE_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "hideHover",
        comment: ["Label for action that will hide the hover in the editor."]
      }, "Hide Hover"),
      alias: "Hide Content Hover",
      precondition: void 0
    });
  }
  run(accessor, editor) {
    ContentHoverController.get(editor)?.hideContentHover();
  }
}
class ScrollUpHoverAction extends EditorAction {
  constructor() {
    super({
      id: SCROLL_UP_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "scrollUpHover",
        comment: [
          "Action that allows to scroll up in the hover widget with the up arrow when the hover widget is focused."
        ]
      }, "Scroll Up Hover"),
      precondition: EditorContextKeys.hoverFocused,
      kbOpts: {
        kbExpr: EditorContextKeys.hoverFocused,
        primary: KeyCode.UpArrow,
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: nls.localize2("scrollUpHoverDescription", "Scroll up the editor hover.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    controller.scrollUp();
  }
}
class ScrollDownHoverAction extends EditorAction {
  constructor() {
    super({
      id: SCROLL_DOWN_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "scrollDownHover",
        comment: [
          "Action that allows to scroll down in the hover widget with the up arrow when the hover widget is focused."
        ]
      }, "Scroll Down Hover"),
      precondition: EditorContextKeys.hoverFocused,
      kbOpts: {
        kbExpr: EditorContextKeys.hoverFocused,
        primary: KeyCode.DownArrow,
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: nls.localize2("scrollDownHoverDescription", "Scroll down the editor hover.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    controller.scrollDown();
  }
}
class ScrollLeftHoverAction extends EditorAction {
  constructor() {
    super({
      id: SCROLL_LEFT_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "scrollLeftHover",
        comment: [
          "Action that allows to scroll left in the hover widget with the left arrow when the hover widget is focused."
        ]
      }, "Scroll Left Hover"),
      precondition: EditorContextKeys.hoverFocused,
      kbOpts: {
        kbExpr: EditorContextKeys.hoverFocused,
        primary: KeyCode.LeftArrow,
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: nls.localize2("scrollLeftHoverDescription", "Scroll left the editor hover.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    controller.scrollLeft();
  }
}
class ScrollRightHoverAction extends EditorAction {
  constructor() {
    super({
      id: SCROLL_RIGHT_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "scrollRightHover",
        comment: [
          "Action that allows to scroll right in the hover widget with the right arrow when the hover widget is focused."
        ]
      }, "Scroll Right Hover"),
      precondition: EditorContextKeys.hoverFocused,
      kbOpts: {
        kbExpr: EditorContextKeys.hoverFocused,
        primary: KeyCode.RightArrow,
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: nls.localize2("scrollRightHoverDescription", "Scroll right the editor hover.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    controller.scrollRight();
  }
}
class PageUpHoverAction extends EditorAction {
  constructor() {
    super({
      id: PAGE_UP_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "pageUpHover",
        comment: [
          "Action that allows to page up in the hover widget with the page up command when the hover widget is focused."
        ]
      }, "Page Up Hover"),
      precondition: EditorContextKeys.hoverFocused,
      kbOpts: {
        kbExpr: EditorContextKeys.hoverFocused,
        primary: KeyCode.PageUp,
        secondary: [KeyMod.Alt | KeyCode.UpArrow],
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: nls.localize2("pageUpHoverDescription", "Page up the editor hover.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    controller.pageUp();
  }
}
class PageDownHoverAction extends EditorAction {
  constructor() {
    super({
      id: PAGE_DOWN_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "pageDownHover",
        comment: [
          "Action that allows to page down in the hover widget with the page down command when the hover widget is focused."
        ]
      }, "Page Down Hover"),
      precondition: EditorContextKeys.hoverFocused,
      kbOpts: {
        kbExpr: EditorContextKeys.hoverFocused,
        primary: KeyCode.PageDown,
        secondary: [KeyMod.Alt | KeyCode.DownArrow],
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: nls.localize2("pageDownHoverDescription", "Page down the editor hover.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    controller.pageDown();
  }
}
class GoToTopHoverAction extends EditorAction {
  constructor() {
    super({
      id: GO_TO_TOP_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "goToTopHover",
        comment: [
          "Action that allows to go to the top of the hover widget with the home command when the hover widget is focused."
        ]
      }, "Go To Top Hover"),
      precondition: EditorContextKeys.hoverFocused,
      kbOpts: {
        kbExpr: EditorContextKeys.hoverFocused,
        primary: KeyCode.Home,
        secondary: [KeyMod.CtrlCmd | KeyCode.UpArrow],
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: nls.localize2("goToTopHoverDescription", "Go to the top of the editor hover.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    controller.goToTop();
  }
}
class GoToBottomHoverAction extends EditorAction {
  constructor() {
    super({
      id: GO_TO_BOTTOM_HOVER_ACTION_ID,
      label: nls.localize2({
        key: "goToBottomHover",
        comment: [
          "Action that allows to go to the bottom in the hover widget with the end command when the hover widget is focused."
        ]
      }, "Go To Bottom Hover"),
      precondition: EditorContextKeys.hoverFocused,
      kbOpts: {
        kbExpr: EditorContextKeys.hoverFocused,
        primary: KeyCode.End,
        secondary: [KeyMod.CtrlCmd | KeyCode.DownArrow],
        weight: KeybindingWeight.EditorContrib
      },
      metadata: {
        description: nls.localize2("goToBottomHoverDescription", "Go to the bottom of the editor hover.")
      }
    });
  }
  run(accessor, editor) {
    const controller = ContentHoverController.get(editor);
    if (!controller) {
      return;
    }
    controller.goToBottom();
  }
}
class IncreaseHoverVerbosityLevel extends EditorAction {
  constructor() {
    super({
      id: INCREASE_HOVER_VERBOSITY_ACTION_ID,
      label: INCREASE_HOVER_VERBOSITY_ACTION_LABEL,
      alias: "Increase Hover Verbosity Level",
      precondition: EditorContextKeys.hoverVisible
    });
  }
  run(accessor, editor, args) {
    const hoverController = ContentHoverController.get(editor);
    if (!hoverController) {
      return;
    }
    const index = args?.index !== void 0 ? args.index : hoverController.focusedHoverPartIndex();
    hoverController.updateHoverVerbosityLevel(HoverVerbosityAction.Increase, index, args?.focus);
  }
}
class DecreaseHoverVerbosityLevel extends EditorAction {
  constructor() {
    super({
      id: DECREASE_HOVER_VERBOSITY_ACTION_ID,
      label: DECREASE_HOVER_VERBOSITY_ACTION_LABEL,
      alias: "Decrease Hover Verbosity Level",
      precondition: EditorContextKeys.hoverVisible
    });
  }
  run(accessor, editor, args) {
    const hoverController = ContentHoverController.get(editor);
    if (!hoverController) {
      return;
    }
    const index = args?.index !== void 0 ? args.index : hoverController.focusedHoverPartIndex();
    ContentHoverController.get(editor)?.updateHoverVerbosityLevel(HoverVerbosityAction.Decrease, index, args?.focus);
  }
}
export {
  DecreaseHoverVerbosityLevel,
  GoToBottomHoverAction,
  GoToTopHoverAction,
  HideContentHoverAction,
  IncreaseHoverVerbosityLevel,
  PageDownHoverAction,
  PageUpHoverAction,
  ScrollDownHoverAction,
  ScrollLeftHoverAction,
  ScrollRightHoverAction,
  ScrollUpHoverAction,
  ShowDefinitionPreviewHoverAction,
  ShowOrFocusHoverAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2hvdmVyL2Jyb3dzZXIvaG92ZXJBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgREVDUkVBU0VfSE9WRVJfVkVSQk9TSVRZX0FDVElPTl9JRCwgREVDUkVBU0VfSE9WRVJfVkVSQk9TSVRZX0FDVElPTl9MQUJFTCwgR09fVE9fQk9UVE9NX0hPVkVSX0FDVElPTl9JRCwgR09fVE9fVE9QX0hPVkVSX0FDVElPTl9JRCwgSElERV9IT1ZFUl9BQ1RJT05fSUQsIElOQ1JFQVNFX0hPVkVSX1ZFUkJPU0lUWV9BQ1RJT05fSUQsIElOQ1JFQVNFX0hPVkVSX1ZFUkJPU0lUWV9BQ1RJT05fTEFCRUwsIFBBR0VfRE9XTl9IT1ZFUl9BQ1RJT05fSUQsIFBBR0VfVVBfSE9WRVJfQUNUSU9OX0lELCBTQ1JPTExfRE9XTl9IT1ZFUl9BQ1RJT05fSUQsIFNDUk9MTF9MRUZUX0hPVkVSX0FDVElPTl9JRCwgU0NST0xMX1JJR0hUX0hPVkVSX0FDVElPTl9JRCwgU0NST0xMX1VQX0hPVkVSX0FDVElPTl9JRCwgU0hPV19ERUZJTklUSU9OX1BSRVZJRVdfSE9WRVJfQUNUSU9OX0lELCBTSE9XX09SX0ZPQ1VTX0hPVkVSX0FDVElPTl9JRCB9IGZyb20gJy4vaG92ZXJBY3Rpb25JZHMuanMnO1xuaW1wb3J0IHsgS2V5Q2hvcmQsIEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvckFjdGlvbiwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3JDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBHb3RvRGVmaW5pdGlvbkF0UG9zaXRpb25FZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi9nb3RvU3ltYm9sL2Jyb3dzZXIvbGluay9nb1RvRGVmaW5pdGlvbkF0UG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSG92ZXJTdGFydE1vZGUsIEhvdmVyU3RhcnRTb3VyY2UgfSBmcm9tICcuL2hvdmVyT3BlcmF0aW9uLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTdXBwb3J0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb250ZW50SG92ZXJDb250cm9sbGVyIH0gZnJvbSAnLi9jb250ZW50SG92ZXJDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IEhvdmVyVmVyYm9zaXR5QWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAnLi9ob3Zlci5jc3MnO1xuXG5lbnVtIEhvdmVyRm9jdXNCZWhhdmlvciB7XG5cdE5vQXV0b0ZvY3VzID0gJ25vQXV0b0ZvY3VzJyxcblx0Rm9jdXNJZlZpc2libGUgPSAnZm9jdXNJZlZpc2libGUnLFxuXHRBdXRvRm9jdXNJbW1lZGlhdGVseSA9ICdhdXRvRm9jdXNJbW1lZGlhdGVseSdcbn1cblxuZXhwb3J0IGNsYXNzIFNob3dPckZvY3VzSG92ZXJBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTSE9XX09SX0ZPQ1VTX0hPVkVSX0FDVElPTl9JRCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKHtcblx0XHRcdFx0a2V5OiAnc2hvd09yRm9jdXNIb3ZlcicsXG5cdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHQnTGFiZWwgZm9yIGFjdGlvbiB0aGF0IHdpbGwgdHJpZ2dlciB0aGUgc2hvd2luZy9mb2N1c2luZyBvZiBhIGhvdmVyIGluIHRoZSBlZGl0b3IuJyxcblx0XHRcdFx0XHQnSWYgdGhlIGhvdmVyIGlzIG5vdCB2aXNpYmxlLCBpdCB3aWxsIHNob3cgdGhlIGhvdmVyLicsXG5cdFx0XHRcdFx0J1RoaXMgYWxsb3dzIGZvciB1c2VycyB0byBzaG93IHRoZSBob3ZlciB3aXRob3V0IHVzaW5nIHRoZSBtb3VzZS4nXG5cdFx0XHRcdF1cblx0XHRcdH0sIFwiU2hvdyBvciBGb2N1cyBIb3ZlclwiKSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUyKCdzaG93T3JGb2N1c0hvdmVyRGVzY3JpcHRpb24nLCAnU2hvdyBvciBmb2N1cyB0aGUgZWRpdG9yIGhvdmVyIHdoaWNoIHNob3dzIGRvY3VtZW50YXRpb24sIHJlZmVyZW5jZXMsIGFuZCBvdGhlciBjb250ZW50IGZvciBhIHN5bWJvbCBhdCB0aGUgY3VycmVudCBjdXJzb3IgcG9zaXRpb24uJyksXG5cdFx0XHRcdGFyZ3M6IFt7XG5cdFx0XHRcdFx0bmFtZTogJ2FyZ3MnLFxuXHRcdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdCdmb2N1cyc6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0NvbnRyb2xzIGlmIGFuZCB3aGVuIHRoZSBob3ZlciBzaG91bGQgdGFrZSBmb2N1cyB1cG9uIGJlaW5nIHRyaWdnZXJlZCBieSB0aGlzIGFjdGlvbi4nLFxuXHRcdFx0XHRcdFx0XHRcdGVudW06IFtIb3ZlckZvY3VzQmVoYXZpb3IuTm9BdXRvRm9jdXMsIEhvdmVyRm9jdXNCZWhhdmlvci5Gb2N1c0lmVmlzaWJsZSwgSG92ZXJGb2N1c0JlaGF2aW9yLkF1dG9Gb2N1c0ltbWVkaWF0ZWx5XSxcblx0XHRcdFx0XHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ3Nob3dPckZvY3VzSG92ZXIuZm9jdXMubm9BdXRvRm9jdXMnLCAnVGhlIGhvdmVyIHdpbGwgbm90IGF1dG9tYXRpY2FsbHkgdGFrZSBmb2N1cy4nKSxcblx0XHRcdFx0XHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2hvd09yRm9jdXNIb3Zlci5mb2N1cy5mb2N1c0lmVmlzaWJsZScsICdUaGUgaG92ZXIgd2lsbCB0YWtlIGZvY3VzIG9ubHkgaWYgaXQgaXMgYWxyZWFkeSB2aXNpYmxlLicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdzaG93T3JGb2N1c0hvdmVyLmZvY3VzLmF1dG9Gb2N1c0ltbWVkaWF0ZWx5JywgJ1RoZSBob3ZlciB3aWxsIGF1dG9tYXRpY2FsbHkgdGFrZSBmb2N1cyB3aGVuIGl0IGFwcGVhcnMuJyksXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBIb3ZlckZvY3VzQmVoYXZpb3IuRm9jdXNJZlZpc2libGUsXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XVxuXHRcdFx0fSxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuZWRpdG9yVGV4dEZvY3VzLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDaG9yZChLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuS2V5SywgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUkpLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJnczogYW55KTogdm9pZCB7XG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBDb250ZW50SG92ZXJDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvY3VzQXJndW1lbnQgPSBhcmdzPy5mb2N1cztcblx0XHRsZXQgZm9jdXNPcHRpb24gPSBIb3ZlckZvY3VzQmVoYXZpb3IuRm9jdXNJZlZpc2libGU7XG5cdFx0aWYgKE9iamVjdC52YWx1ZXMoSG92ZXJGb2N1c0JlaGF2aW9yKS5pbmNsdWRlcyhmb2N1c0FyZ3VtZW50KSkge1xuXHRcdFx0Zm9jdXNPcHRpb24gPSBmb2N1c0FyZ3VtZW50O1xuXHRcdH0gZWxzZSBpZiAodHlwZW9mIGZvY3VzQXJndW1lbnQgPT09ICdib29sZWFuJyAmJiBmb2N1c0FyZ3VtZW50KSB7XG5cdFx0XHRmb2N1c09wdGlvbiA9IEhvdmVyRm9jdXNCZWhhdmlvci5BdXRvRm9jdXNJbW1lZGlhdGVseTtcblx0XHR9XG5cblx0XHRjb25zdCBzaG93Q29udGVudEhvdmVyID0gKGZvY3VzOiBib29sZWFuKSA9PiB7XG5cdFx0XHRjb25zdCBwb3NpdGlvbiA9IGVkaXRvci5nZXRQb3NpdGlvbigpO1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcG9zaXRpb24uY29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4pO1xuXHRcdFx0Y29udHJvbGxlci5zaG93Q29udGVudEhvdmVyKHJhbmdlLCBIb3ZlclN0YXJ0TW9kZS5JbW1lZGlhdGUsIEhvdmVyU3RhcnRTb3VyY2UuS2V5Ym9hcmQsIGZvY3VzKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgYWNjZXNzaWJpbGl0eVN1cHBvcnRFbmFibGVkID0gZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uYWNjZXNzaWJpbGl0eVN1cHBvcnQpID09PSBBY2Nlc3NpYmlsaXR5U3VwcG9ydC5FbmFibGVkO1xuXG5cdFx0aWYgKGNvbnRyb2xsZXIuaXNIb3ZlclZpc2libGUpIHtcblx0XHRcdGlmIChmb2N1c09wdGlvbiAhPT0gSG92ZXJGb2N1c0JlaGF2aW9yLk5vQXV0b0ZvY3VzKSB7XG5cdFx0XHRcdGNvbnRyb2xsZXIuZm9jdXMoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNob3dDb250ZW50SG92ZXIoYWNjZXNzaWJpbGl0eVN1cHBvcnRFbmFibGVkKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0c2hvd0NvbnRlbnRIb3ZlcihhY2Nlc3NpYmlsaXR5U3VwcG9ydEVuYWJsZWQgfHwgZm9jdXNPcHRpb24gPT09IEhvdmVyRm9jdXNCZWhhdmlvci5BdXRvRm9jdXNJbW1lZGlhdGVseSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTaG93RGVmaW5pdGlvblByZXZpZXdIb3ZlckFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNIT1dfREVGSU5JVElPTl9QUkVWSUVXX0hPVkVSX0FDVElPTl9JRCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKHtcblx0XHRcdFx0a2V5OiAnc2hvd0RlZmluaXRpb25QcmV2aWV3SG92ZXInLFxuXHRcdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdFx0J0xhYmVsIGZvciBhY3Rpb24gdGhhdCB3aWxsIHRyaWdnZXIgdGhlIHNob3dpbmcgb2YgZGVmaW5pdGlvbiBwcmV2aWV3IGhvdmVyIGluIHRoZSBlZGl0b3IuJyxcblx0XHRcdFx0XHQnVGhpcyBhbGxvd3MgZm9yIHVzZXJzIHRvIHNob3cgdGhlIGRlZmluaXRpb24gcHJldmlldyBob3ZlciB3aXRob3V0IHVzaW5nIHRoZSBtb3VzZS4nXG5cdFx0XHRcdF1cblx0XHRcdH0sIFwiU2hvdyBEZWZpbml0aW9uIFByZXZpZXcgSG92ZXJcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IHVuZGVmaW5lZCxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUyKCdzaG93RGVmaW5pdGlvblByZXZpZXdIb3ZlckRlc2NyaXB0aW9uJywgJ1Nob3cgdGhlIGRlZmluaXRpb24gcHJldmlldyBob3ZlciBpbiB0aGUgZWRpdG9yLicpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gQ29udGVudEhvdmVyQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBlZGl0b3IuZ2V0UG9zaXRpb24oKTtcblxuXHRcdGlmICghcG9zaXRpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByYW5nZSA9IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbik7XG5cdFx0Y29uc3QgZ290byA9IEdvdG9EZWZpbml0aW9uQXRQb3NpdGlvbkVkaXRvckNvbnRyaWJ1dGlvbi5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWdvdG8pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm9taXNlID0gZ290by5zdGFydEZpbmREZWZpbml0aW9uRnJvbUN1cnNvcihwb3NpdGlvbik7XG5cdFx0cHJvbWlzZS50aGVuKCgpID0+IHtcblx0XHRcdGNvbnRyb2xsZXIuc2hvd0NvbnRlbnRIb3ZlcihyYW5nZSwgSG92ZXJTdGFydE1vZGUuSW1tZWRpYXRlLCBIb3ZlclN0YXJ0U291cmNlLktleWJvYXJkLCB0cnVlKTtcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSGlkZUNvbnRlbnRIb3ZlckFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEhJREVfSE9WRVJfQUNUSU9OX0lELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoe1xuXHRcdFx0XHRrZXk6ICdoaWRlSG92ZXInLFxuXHRcdFx0XHRjb21tZW50OiBbJ0xhYmVsIGZvciBhY3Rpb24gdGhhdCB3aWxsIGhpZGUgdGhlIGhvdmVyIGluIHRoZSBlZGl0b3IuJ11cblx0XHRcdH0sIFwiSGlkZSBIb3ZlclwiKSxcblx0XHRcdGFsaWFzOiAnSGlkZSBDb250ZW50IEhvdmVyJyxcblx0XHRcdHByZWNvbmRpdGlvbjogdW5kZWZpbmVkXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Q29udGVudEhvdmVyQ29udHJvbGxlci5nZXQoZWRpdG9yKT8uaGlkZUNvbnRlbnRIb3ZlcigpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTY3JvbGxVcEhvdmVyQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU0NST0xMX1VQX0hPVkVSX0FDVElPTl9JRCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKHtcblx0XHRcdFx0a2V5OiAnc2Nyb2xsVXBIb3ZlcicsXG5cdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHQnQWN0aW9uIHRoYXQgYWxsb3dzIHRvIHNjcm9sbCB1cCBpbiB0aGUgaG92ZXIgd2lkZ2V0IHdpdGggdGhlIHVwIGFycm93IHdoZW4gdGhlIGhvdmVyIHdpZGdldCBpcyBmb2N1c2VkLidcblx0XHRcdFx0XVxuXHRcdFx0fSwgXCJTY3JvbGwgVXAgSG92ZXJcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLmhvdmVyRm9jdXNlZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmhvdmVyRm9jdXNlZCxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5VcEFycm93LFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUyKCdzY3JvbGxVcEhvdmVyRGVzY3JpcHRpb24nLCAnU2Nyb2xsIHVwIHRoZSBlZGl0b3IgaG92ZXIuJylcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbnRlbnRIb3ZlckNvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnRyb2xsZXIuc2Nyb2xsVXAoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2Nyb2xsRG93bkhvdmVyQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU0NST0xMX0RPV05fSE9WRVJfQUNUSU9OX0lELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoe1xuXHRcdFx0XHRrZXk6ICdzY3JvbGxEb3duSG92ZXInLFxuXHRcdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdFx0J0FjdGlvbiB0aGF0IGFsbG93cyB0byBzY3JvbGwgZG93biBpbiB0aGUgaG92ZXIgd2lkZ2V0IHdpdGggdGhlIHVwIGFycm93IHdoZW4gdGhlIGhvdmVyIHdpZGdldCBpcyBmb2N1c2VkLidcblx0XHRcdFx0XVxuXHRcdFx0fSwgXCJTY3JvbGwgRG93biBIb3ZlclwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMuaG92ZXJGb2N1c2VkLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuaG92ZXJGb2N1c2VkLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkRvd25BcnJvdyxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMignc2Nyb2xsRG93bkhvdmVyRGVzY3JpcHRpb24nLCAnU2Nyb2xsIGRvd24gdGhlIGVkaXRvciBob3Zlci4nKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbnRlbnRIb3ZlckNvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnRyb2xsZXIuc2Nyb2xsRG93bigpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTY3JvbGxMZWZ0SG92ZXJBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBTQ1JPTExfTEVGVF9IT1ZFUl9BQ1RJT05fSUQsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMih7XG5cdFx0XHRcdGtleTogJ3Njcm9sbExlZnRIb3ZlcicsXG5cdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHQnQWN0aW9uIHRoYXQgYWxsb3dzIHRvIHNjcm9sbCBsZWZ0IGluIHRoZSBob3ZlciB3aWRnZXQgd2l0aCB0aGUgbGVmdCBhcnJvdyB3aGVuIHRoZSBob3ZlciB3aWRnZXQgaXMgZm9jdXNlZC4nXG5cdFx0XHRcdF1cblx0XHRcdH0sIFwiU2Nyb2xsIExlZnQgSG92ZXJcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLmhvdmVyRm9jdXNlZCxcblx0XHRcdGtiT3B0czoge1xuXHRcdFx0XHRrYkV4cHI6IEVkaXRvckNvbnRleHRLZXlzLmhvdmVyRm9jdXNlZCxcblx0XHRcdFx0cHJpbWFyeTogS2V5Q29kZS5MZWZ0QXJyb3csXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ3Njcm9sbExlZnRIb3ZlckRlc2NyaXB0aW9uJywgJ1Njcm9sbCBsZWZ0IHRoZSBlZGl0b3IgaG92ZXIuJyksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBDb250ZW50SG92ZXJDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb250cm9sbGVyLnNjcm9sbExlZnQoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2Nyb2xsUmlnaHRIb3ZlckFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFNDUk9MTF9SSUdIVF9IT1ZFUl9BQ1RJT05fSUQsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMih7XG5cdFx0XHRcdGtleTogJ3Njcm9sbFJpZ2h0SG92ZXInLFxuXHRcdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdFx0J0FjdGlvbiB0aGF0IGFsbG93cyB0byBzY3JvbGwgcmlnaHQgaW4gdGhlIGhvdmVyIHdpZGdldCB3aXRoIHRoZSByaWdodCBhcnJvdyB3aGVuIHRoZSBob3ZlciB3aWRnZXQgaXMgZm9jdXNlZC4nXG5cdFx0XHRcdF1cblx0XHRcdH0sIFwiU2Nyb2xsIFJpZ2h0IEhvdmVyXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy5ob3ZlckZvY3VzZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5ob3ZlckZvY3VzZWQsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuUmlnaHRBcnJvdyxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LkVkaXRvckNvbnRyaWJcblx0XHRcdH0sXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplMignc2Nyb2xsUmlnaHRIb3ZlckRlc2NyaXB0aW9uJywgJ1Njcm9sbCByaWdodCB0aGUgZWRpdG9yIGhvdmVyLicpXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBDb250ZW50SG92ZXJDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb250cm9sbGVyLnNjcm9sbFJpZ2h0KCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFBhZ2VVcEhvdmVyQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogUEFHRV9VUF9IT1ZFUl9BQ1RJT05fSUQsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMih7XG5cdFx0XHRcdGtleTogJ3BhZ2VVcEhvdmVyJyxcblx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdCdBY3Rpb24gdGhhdCBhbGxvd3MgdG8gcGFnZSB1cCBpbiB0aGUgaG92ZXIgd2lkZ2V0IHdpdGggdGhlIHBhZ2UgdXAgY29tbWFuZCB3aGVuIHRoZSBob3ZlciB3aWRnZXQgaXMgZm9jdXNlZC4nXG5cdFx0XHRcdF1cblx0XHRcdH0sIFwiUGFnZSBVcCBIb3ZlclwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMuaG92ZXJGb2N1c2VkLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuaG92ZXJGb2N1c2VkLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLlBhZ2VVcCxcblx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkFsdCB8IEtleUNvZGUuVXBBcnJvd10sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ3BhZ2VVcEhvdmVyRGVzY3JpcHRpb24nLCAnUGFnZSB1cCB0aGUgZWRpdG9yIGhvdmVyLicpLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gQ29udGVudEhvdmVyQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29udHJvbGxlci5wYWdlVXAoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUGFnZURvd25Ib3ZlckFjdGlvbiBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFBBR0VfRE9XTl9IT1ZFUl9BQ1RJT05fSUQsXG5cdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplMih7XG5cdFx0XHRcdGtleTogJ3BhZ2VEb3duSG92ZXInLFxuXHRcdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdFx0J0FjdGlvbiB0aGF0IGFsbG93cyB0byBwYWdlIGRvd24gaW4gdGhlIGhvdmVyIHdpZGdldCB3aXRoIHRoZSBwYWdlIGRvd24gY29tbWFuZCB3aGVuIHRoZSBob3ZlciB3aWRnZXQgaXMgZm9jdXNlZC4nXG5cdFx0XHRcdF1cblx0XHRcdH0sIFwiUGFnZSBEb3duIEhvdmVyXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy5ob3ZlckZvY3VzZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5ob3ZlckZvY3VzZWQsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuUGFnZURvd24sXG5cdFx0XHRcdHNlY29uZGFyeTogW0tleU1vZC5BbHQgfCBLZXlDb2RlLkRvd25BcnJvd10sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ3BhZ2VEb3duSG92ZXJEZXNjcmlwdGlvbicsICdQYWdlIGRvd24gdGhlIGVkaXRvciBob3Zlci4nKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IENvbnRlbnRIb3ZlckNvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKCFjb250cm9sbGVyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnRyb2xsZXIucGFnZURvd24oKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgR29Ub1RvcEhvdmVyQWN0aW9uIGV4dGVuZHMgRWRpdG9yQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogR09fVE9fVE9QX0hPVkVSX0FDVElPTl9JRCxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUyKHtcblx0XHRcdFx0a2V5OiAnZ29Ub1RvcEhvdmVyJyxcblx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdCdBY3Rpb24gdGhhdCBhbGxvd3MgdG8gZ28gdG8gdGhlIHRvcCBvZiB0aGUgaG92ZXIgd2lkZ2V0IHdpdGggdGhlIGhvbWUgY29tbWFuZCB3aGVuIHRoZSBob3ZlciB3aWRnZXQgaXMgZm9jdXNlZC4nXG5cdFx0XHRcdF1cblx0XHRcdH0sIFwiR28gVG8gVG9wIEhvdmVyXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFZGl0b3JDb250ZXh0S2V5cy5ob3ZlckZvY3VzZWQsXG5cdFx0XHRrYk9wdHM6IHtcblx0XHRcdFx0a2JFeHByOiBFZGl0b3JDb250ZXh0S2V5cy5ob3ZlckZvY3VzZWQsXG5cdFx0XHRcdHByaW1hcnk6IEtleUNvZGUuSG9tZSxcblx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlVwQXJyb3ddLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuRWRpdG9yQ29udHJpYlxuXHRcdFx0fSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUyKCdnb1RvVG9wSG92ZXJEZXNjcmlwdGlvbicsICdHbyB0byB0aGUgdG9wIG9mIHRoZSBlZGl0b3IgaG92ZXIuJyksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBDb250ZW50SG92ZXJDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRcdGlmICghY29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb250cm9sbGVyLmdvVG9Ub3AoKTtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBHb1RvQm90dG9tSG92ZXJBY3Rpb24gZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBHT19UT19CT1RUT01fSE9WRVJfQUNUSU9OX0lELFxuXHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZTIoe1xuXHRcdFx0XHRrZXk6ICdnb1RvQm90dG9tSG92ZXInLFxuXHRcdFx0XHRjb21tZW50OiBbXG5cdFx0XHRcdFx0J0FjdGlvbiB0aGF0IGFsbG93cyB0byBnbyB0byB0aGUgYm90dG9tIGluIHRoZSBob3ZlciB3aWRnZXQgd2l0aCB0aGUgZW5kIGNvbW1hbmQgd2hlbiB0aGUgaG92ZXIgd2lkZ2V0IGlzIGZvY3VzZWQuJ1xuXHRcdFx0XHRdXG5cdFx0XHR9LCBcIkdvIFRvIEJvdHRvbSBIb3ZlclwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMuaG92ZXJGb2N1c2VkLFxuXHRcdFx0a2JPcHRzOiB7XG5cdFx0XHRcdGtiRXhwcjogRWRpdG9yQ29udGV4dEtleXMuaG92ZXJGb2N1c2VkLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlDb2RlLkVuZCxcblx0XHRcdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkRvd25BcnJvd10sXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5FZGl0b3JDb250cmliXG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZTIoJ2dvVG9Cb3R0b21Ib3ZlckRlc2NyaXB0aW9uJywgJ0dvIHRvIHRoZSBib3R0b20gb2YgdGhlIGVkaXRvciBob3Zlci4nKVxuXHRcdFx0fSxcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRvcjogSUNvZGVFZGl0b3IpOiB2b2lkIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gQ29udGVudEhvdmVyQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29udHJvbGxlci5nb1RvQm90dG9tKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEluY3JlYXNlSG92ZXJWZXJib3NpdHlMZXZlbCBleHRlbmRzIEVkaXRvckFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IElOQ1JFQVNFX0hPVkVSX1ZFUkJPU0lUWV9BQ1RJT05fSUQsXG5cdFx0XHRsYWJlbDogSU5DUkVBU0VfSE9WRVJfVkVSQk9TSVRZX0FDVElPTl9MQUJFTCxcblx0XHRcdGFsaWFzOiAnSW5jcmVhc2UgSG92ZXIgVmVyYm9zaXR5IExldmVsJyxcblx0XHRcdHByZWNvbmRpdGlvbjogRWRpdG9yQ29udGV4dEtleXMuaG92ZXJWaXNpYmxlXG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBlZGl0b3I6IElDb2RlRWRpdG9yLCBhcmdzPzogeyBpbmRleDogbnVtYmVyOyBmb2N1czogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0Y29uc3QgaG92ZXJDb250cm9sbGVyID0gQ29udGVudEhvdmVyQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0XHRpZiAoIWhvdmVyQ29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBpbmRleCA9IGFyZ3M/LmluZGV4ICE9PSB1bmRlZmluZWQgPyBhcmdzLmluZGV4IDogaG92ZXJDb250cm9sbGVyLmZvY3VzZWRIb3ZlclBhcnRJbmRleCgpO1xuXHRcdGhvdmVyQ29udHJvbGxlci51cGRhdGVIb3ZlclZlcmJvc2l0eUxldmVsKEhvdmVyVmVyYm9zaXR5QWN0aW9uLkluY3JlYXNlLCBpbmRleCwgYXJncz8uZm9jdXMpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWNyZWFzZUhvdmVyVmVyYm9zaXR5TGV2ZWwgZXh0ZW5kcyBFZGl0b3JBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBERUNSRUFTRV9IT1ZFUl9WRVJCT1NJVFlfQUNUSU9OX0lELFxuXHRcdFx0bGFiZWw6IERFQ1JFQVNFX0hPVkVSX1ZFUkJPU0lUWV9BQ1RJT05fTEFCRUwsXG5cdFx0XHRhbGlhczogJ0RlY3JlYXNlIEhvdmVyIFZlcmJvc2l0eSBMZXZlbCcsXG5cdFx0XHRwcmVjb25kaXRpb246IEVkaXRvckNvbnRleHRLZXlzLmhvdmVyVmlzaWJsZVxuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdG9yOiBJQ29kZUVkaXRvciwgYXJncz86IHsgaW5kZXg6IG51bWJlcjsgZm9jdXM6IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdGNvbnN0IGhvdmVyQ29udHJvbGxlciA9IENvbnRlbnRIb3ZlckNvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0aWYgKCFob3ZlckNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW5kZXggPSBhcmdzPy5pbmRleCAhPT0gdW5kZWZpbmVkID8gYXJncy5pbmRleCA6IGhvdmVyQ29udHJvbGxlci5mb2N1c2VkSG92ZXJQYXJ0SW5kZXgoKTtcblx0XHRDb250ZW50SG92ZXJDb250cm9sbGVyLmdldChlZGl0b3IpPy51cGRhdGVIb3ZlclZlcmJvc2l0eUxldmVsKEhvdmVyVmVyYm9zaXR5QWN0aW9uLkRlY3JlYXNlLCBpbmRleCwgYXJncz8uZm9jdXMpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLG9DQUFvQyx1Q0FBdUMsOEJBQThCLDJCQUEyQixzQkFBc0Isb0NBQW9DLHVDQUF1QywyQkFBMkIseUJBQXlCLDZCQUE2Qiw2QkFBNkIsOEJBQThCLDJCQUEyQix5Q0FBeUMscUNBQXFDO0FBQ25lLFNBQVMsVUFBVSxTQUFTLGNBQWM7QUFFMUMsU0FBUyxvQkFBc0M7QUFDL0MsU0FBUyxvQkFB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
