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
import { localize } from "../../../../nls.js";
import { ConfigurationScope, Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { workbenchConfigurationNodeBase, Extensions as WorkbenchExtensions } from "../../../common/configuration.js";
import { AccessibilitySignal } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { AccessibilityVoiceSettingId, ISpeechService, SPEECH_LANGUAGES } from "../../speech/common/speechService.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Event } from "../../../../base/common/event.js";
import { isDefined } from "../../../../base/common/types.js";
const accessibilityHelpIsShown = new RawContextKey("accessibilityHelpIsShown", false, true);
const accessibleViewIsShown = new RawContextKey("accessibleViewIsShown", false, true);
const accessibleViewSupportsNavigation = new RawContextKey("accessibleViewSupportsNavigation", false, true);
const accessibleViewVerbosityEnabled = new RawContextKey("accessibleViewVerbosityEnabled", false, true);
const accessibleViewGoToSymbolSupported = new RawContextKey("accessibleViewGoToSymbolSupported", false, true);
const accessibleViewOnLastLine = new RawContextKey("accessibleViewOnLastLine", false, true);
const accessibleViewCurrentProviderId = new RawContextKey("accessibleViewCurrentProviderId", void 0, void 0);
const accessibleViewInCodeBlock = new RawContextKey("accessibleViewInCodeBlock", void 0, void 0);
const accessibleViewContainsCodeBlocks = new RawContextKey("accessibleViewContainsCodeBlocks", void 0, void 0);
const accessibleViewHasUnassignedKeybindings = new RawContextKey("accessibleViewHasUnassignedKeybindings", void 0, void 0);
const accessibleViewHasAssignedKeybindings = new RawContextKey("accessibleViewHasAssignedKeybindings", void 0, void 0);
var AccessibilityWorkbenchSettingId = /* @__PURE__ */ ((AccessibilityWorkbenchSettingId2) => {
  AccessibilityWorkbenchSettingId2["DimUnfocusedEnabled"] = "accessibility.dimUnfocused.enabled";
  AccessibilityWorkbenchSettingId2["DimUnfocusedOpacity"] = "accessibility.dimUnfocused.opacity";
  AccessibilityWorkbenchSettingId2["HideAccessibleView"] = "accessibility.hideAccessibleView";
  AccessibilityWorkbenchSettingId2["AccessibleViewCloseOnKeyPress"] = "accessibility.accessibleView.closeOnKeyPress";
  AccessibilityWorkbenchSettingId2["VerboseChatProgressUpdates"] = "accessibility.verboseChatProgressUpdates";
  AccessibilityWorkbenchSettingId2["ShowChatCheckmarks"] = "accessibility.chat.showCheckmarks";
  return AccessibilityWorkbenchSettingId2;
})(AccessibilityWorkbenchSettingId || {});
var ViewDimUnfocusedOpacityProperties = /* @__PURE__ */ ((ViewDimUnfocusedOpacityProperties2) => {
  ViewDimUnfocusedOpacityProperties2[ViewDimUnfocusedOpacityProperties2["Default"] = 0.75] = "Default";
  ViewDimUnfocusedOpacityProperties2[ViewDimUnfocusedOpacityProperties2["Minimum"] = 0.2] = "Minimum";
  ViewDimUnfocusedOpacityProperties2[ViewDimUnfocusedOpacityProperties2["Maximum"] = 1] = "Maximum";
  return ViewDimUnfocusedOpacityProperties2;
})(ViewDimUnfocusedOpacityProperties || {});
var AccessibilityVerbositySettingId = /* @__PURE__ */ ((AccessibilityVerbositySettingId2) => {
  AccessibilityVerbositySettingId2["Terminal"] = "accessibility.verbosity.terminal";
  AccessibilityVerbositySettingId2["DiffEditor"] = "accessibility.verbosity.diffEditor";
  AccessibilityVerbositySettingId2["MergeEditor"] = "accessibility.verbosity.mergeEditor";
  AccessibilityVerbositySettingId2["Chat"] = "accessibility.verbosity.panelChat";
  AccessibilityVerbositySettingId2["InlineChat"] = "accessibility.verbosity.inlineChat";
  AccessibilityVerbositySettingId2["TerminalInlineChat"] = "accessibility.verbosity.terminalChat";
  AccessibilityVerbositySettingId2["TerminalChatOutput"] = "accessibility.verbosity.terminalChatOutput";
  AccessibilityVerbositySettingId2["InlineCompletions"] = "accessibility.verbosity.inlineCompletions";
  AccessibilityVerbositySettingId2["KeybindingsEditor"] = "accessibility.verbosity.keybindingsEditor";
  AccessibilityVerbositySettingId2["Notebook"] = "accessibility.verbosity.notebook";
  AccessibilityVerbositySettingId2["Editor"] = "accessibility.verbosity.editor";
  AccessibilityVerbositySettingId2["Hover"] = "accessibility.verbosity.hover";
  AccessibilityVerbositySettingId2["Notification"] = "accessibility.verbosity.notification";
  AccessibilityVerbositySettingId2["EmptyEditorHint"] = "accessibility.verbosity.emptyEditorHint";
  AccessibilityVerbositySettingId2["ReplEditor"] = "accessibility.verbosity.replEditor";
  AccessibilityVerbositySettingId2["Comments"] = "accessibility.verbosity.comments";
  AccessibilityVerbositySettingId2["DiffEditorActive"] = "accessibility.verbosity.diffEditorActive";
  AccessibilityVerbositySettingId2["Debug"] = "accessibility.verbosity.debug";
  AccessibilityVerbositySettingId2["Walkthrough"] = "accessibility.verbosity.walkthrough";
  AccessibilityVerbositySettingId2["SourceControl"] = "accessibility.verbosity.sourceControl";
  AccessibilityVerbositySettingId2["Find"] = "accessibility.verbosity.find";
  AccessibilityVerbositySettingId2["SessionsChat"] = "accessibility.verbosity.sessionsChat";
  AccessibilityVerbositySettingId2["SessionsChanges"] = "accessibility.verbosity.sessionsChanges";
  AccessibilityVerbositySettingId2["ChatQuestionCarousel"] = "accessibility.verbosity.chatQuestionCarousel";
  AccessibilityVerbositySettingId2["Survey"] = "accessibility.verbosity.survey";
  AccessibilityVerbositySettingId2["Automations"] = "accessibility.verbosity.automations";
  AccessibilityVerbositySettingId2["BrowserElementCommenting"] = "accessibility.verbosity.browserElementCommenting";
  return AccessibilityVerbositySettingId2;
})(AccessibilityVerbositySettingId || {});
const baseVerbosityProperty = {
  type: "boolean",
  default: true,
  tags: ["accessibility"]
};
const accessibilityConfigurationNodeBase = Object.freeze({
  id: "accessibility",
  title: localize("accessibilityConfigurationTitle", "Accessibility"),
  type: "object"
});
const soundFeatureBase = {
  "type": "string",
  "enum": ["auto", "on", "off"],
  "default": "auto",
  "enumDescriptions": [
    localize("sound.enabled.auto", "Enable sound when a screen reader is attached."),
    localize("sound.enabled.on", "Enable sound."),
    localize("sound.enabled.off", "Disable sound.")
  ],
  tags: ["accessibility"]
};
const signalFeatureBase = {
  "type": "object",
  "tags": ["accessibility"],
  additionalProperties: false,
  default: {
    sound: "auto",
    announcement: "auto"
  }
};
const announcementFeatureBase = {
  "type": "string",
  "enum": ["auto", "off"],
  "default": "auto",
  "enumDescriptions": [
    localize("announcement.enabled.auto", "Enable announcement, will only play when in screen reader optimized mode."),
    localize("announcement.enabled.off", "Disable announcement.")
  ],
  tags: ["accessibility"]
};
const defaultNoAnnouncement = {
  "type": "object",
  "tags": ["accessibility"],
  additionalProperties: false,
  "default": {
    "sound": "auto"
  }
};
const configuration = {
  ...accessibilityConfigurationNodeBase,
  scope: ConfigurationScope.RESOURCE,
  properties: {
    ["accessibility.verbosity.terminal" /* Terminal */]: {
      description: localize("verbosity.terminal.description", "Provide information about how to access the terminal accessibility help menu when the terminal is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.diffEditor" /* DiffEditor */]: {
      description: localize("verbosity.diffEditor.description", "Provide information about how to navigate changes in the diff editor when it is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.panelChat" /* Chat */]: {
      description: localize("verbosity.chat.description", "Provide information about how to access the chat help menu when the chat input is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.inlineChat" /* InlineChat */]: {
      description: localize("verbosity.interactiveEditor.description", "Provide information about how to access the inline editor chat accessibility help menu and alert with hints that describe how to use the feature when the input is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.terminalChatOutput" /* TerminalChatOutput */]: {
      description: localize("verbosity.terminalChatOutput.description", "Provide information about how to open the chat terminal output in the Accessible View."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.inlineCompletions" /* InlineCompletions */]: {
      description: localize("verbosity.inlineCompletions.description", "Provide information about how to access the inline completions hover and Accessible View."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.keybindingsEditor" /* KeybindingsEditor */]: {
      description: localize("verbosity.keybindingsEditor.description", "Provide information about how to change a keybinding in the keybindings editor when a row is focused and how to navigate to the results table."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.notebook" /* Notebook */]: {
      description: localize("verbosity.notebook", "Provide information about how to focus the cell container or inner editor when a notebook cell is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.hover" /* Hover */]: {
      description: localize("verbosity.hover", "Provide information about how to open the hover in an Accessible View."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.notification" /* Notification */]: {
      description: localize("verbosity.notification", "Provide information about how to open the notification in an Accessible View."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.emptyEditorHint" /* EmptyEditorHint */]: {
      description: localize("verbosity.emptyEditorHint", "Provide information about relevant actions in an empty text editor."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.replEditor" /* ReplEditor */]: {
      description: localize("verbosity.replEditor.description", "Provide information about how to access the REPL editor accessibility help menu when the REPL editor is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.comments" /* Comments */]: {
      description: localize("verbosity.comments", "Provide information about actions that can be taken in the comment widget or in a file which contains comments."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.diffEditorActive" /* DiffEditorActive */]: {
      description: localize("verbosity.diffEditorActive", "Indicate when a diff editor becomes the active editor."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.debug" /* Debug */]: {
      description: localize("verbosity.debug", "Provide information about how to access the debug console accessibility help dialog when the debug console or run and debug viewlet is focused. Note that a reload of the window is required for this to take effect."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.walkthrough" /* Walkthrough */]: {
      description: localize("verbosity.walkthrough", "Provide information about how to open the walkthrough in an Accessible View."),
      ...baseVerbosityProperty
    },
    ["accessibility.accessibleView.closeOnKeyPress" /* AccessibleViewCloseOnKeyPress */]: {
      markdownDescription: localize("terminal.integrated.accessibleView.closeOnKeyPress", "On keypress, close the Accessible View and focus the element from which it was invoked."),
      type: "boolean",
      default: true
    },
    ["accessibility.verbosity.sourceControl" /* SourceControl */]: {
      description: localize("verbosity.scm", "Provide information about how to access the source control accessibility help menu when the input is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.find" /* Find */]: {
      description: localize("verbosity.find", "Provide information about how to access the find accessibility help menu when the find input is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.sessionsChat" /* SessionsChat */]: {
      description: localize("verbosity.sessionsChat", "Provide information about how to access the Agents window accessibility help menu when the chat input is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.sessionsChanges" /* SessionsChanges */]: {
      description: localize("verbosity.sessionsChanges", "Provide information about how to access the Changes view accessibility help menu when the Changes view is focused."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.chatQuestionCarousel" /* ChatQuestionCarousel */]: {
      description: localize("verbosity.chatQuestionCarousel", "Provide information about how to navigate and interact with the chat question carousel, including how to focus the terminal when applicable."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.survey" /* Survey */]: {
      description: localize("verbosity.survey", "Provide information about how to navigate and interact with the survey editor pane."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.automations" /* Automations */]: {
      description: localize("verbosity.automations", "Provide information about how to use Automations management views, including keyboard navigation and how to inspect scheduled runs."),
      ...baseVerbosityProperty
    },
    ["accessibility.verbosity.browserElementCommenting" /* BrowserElementCommenting */]: {
      description: localize("verbosity.browserElementCommenting", "Provide information about how to access element commenting accessibility help in the Integrated Browser."),
      ...baseVerbosityProperty
    },
    "accessibility.signalOptions.volume": {
      "description": localize("accessibility.signalOptions.volume", "The volume of the sounds in percent (0-100)."),
      "type": "number",
      "minimum": 0,
      "maximum": 100,
      "default": 70,
      "tags": ["accessibility"]
    },
    "accessibility.signalOptions.debouncePositionChanges": {
      "description": localize("accessibility.signalOptions.debouncePositionChanges", "Whether or not position changes should be debounced"),
      "type": "boolean",
      "default": false,
      "tags": ["accessibility"]
    },
    "accessibility.signalOptions.experimental.delays.general": {
      "type": "object",
      "description": "Delays for all signals besides error and warning at position",
      "additionalProperties": false,
      "properties": {
        "announcement": {
          "description": localize("accessibility.signalOptions.delays.general.announcement", "The delay in milliseconds before an announcement is made."),
          "type": "number",
          "minimum": 0,
          "default": 3e3
        },
        "sound": {
          "description": localize("accessibility.signalOptions.delays.general.sound", "The delay in milliseconds before a sound is played."),
          "type": "number",
          "minimum": 0,
          "default": 400
        }
      },
      "tags": ["accessibility"]
    },
    "accessibility.signalOptions.experimental.delays.warningAtPosition": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "announcement": {
          "description": localize("accessibility.signalOptions.delays.warningAtPosition.announcement", "The delay in milliseconds before an announcement is made when there's a warning at the position."),
          "type": "number",
          "minimum": 0,
          "default": 3e3
        },
        "sound": {
          "description": localize("accessibility.signalOptions.delays.warningAtPosition.sound", "The delay in milliseconds before a sound is played when there's a warning at the position."),
          "type": "number",
          "minimum": 0,
          "default": 1e3
        }
      },
      "tags": ["accessibility"]
    },
    "accessibility.signalOptions.experimental.delays.errorAtPosition": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "announcement": {
          "description": localize("accessibility.signalOptions.delays.errorAtPosition.announcement", "The delay in milliseconds before an announcement is made when there's an error at the position."),
          "type": "number",
          "minimum": 0,
          "default": 3e3
        },
        "sound": {
          "description": localize("accessibility.signalOptions.delays.errorAtPosition.sound", "The delay in milliseconds before a sound is played when there's an error at the position."),
          "type": "number",
          "minimum": 0,
          "default": 1e3
        }
      },
      "tags": ["accessibility"]
    },
    "accessibility.signals.lineHasBreakpoint": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.lineHasBreakpoint", "Plays a signal - sound (audio cue) and/or announcement (alert) - when the active line has a breakpoint."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.lineHasBreakpoint.sound", "Plays a sound when the active line has a breakpoint."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.lineHasBreakpoint.announcement", "Announces when the active line has a breakpoint."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.lineHasInlineSuggestion": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.lineHasInlineSuggestion", "Plays a sound / audio cue when the active line has an inline suggestion."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.lineHasInlineSuggestion.sound", "Plays a sound when the active line has an inline suggestion."),
          ...soundFeatureBase,
          "default": "off"
        }
      }
    },
    "accessibility.signals.nextEditSuggestion": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.nextEditSuggestion", "Plays a signal - sound / audio cue and/or announcement (alert) when there is a next edit suggestion."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.nextEditSuggestion.sound", "Plays a sound when there is a next edit suggestion."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.nextEditSuggestion.announcement", "Announces when there is a next edit suggestion."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.lineHasError": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.lineHasError", "Plays a signal - sound (audio cue) and/or announcement (alert) - when the active line has an error."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.lineHasError.sound", "Plays a sound when the active line has an error."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.lineHasError.announcement", "Announces when the active line has an error."),
          ...announcementFeatureBase,
          default: "off"
        }
      }
    },
    "accessibility.signals.lineHasFoldedArea": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.lineHasFoldedArea", "Plays a signal - sound (audio cue) and/or announcement (alert) - the active line has a folded area that can be unfolded."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.lineHasFoldedArea.sound", "Plays a sound when the active line has a folded area that can be unfolded."),
          ...soundFeatureBase,
          default: "off"
        },
        "announcement": {
          "description": localize("accessibility.signals.lineHasFoldedArea.announcement", "Announces when the active line has a folded area that can be unfolded."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.lineHasWarning": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.lineHasWarning", "Plays a signal - sound (audio cue) and/or announcement (alert) - when the active line has a warning."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.lineHasWarning.sound", "Plays a sound when the active line has a warning."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.lineHasWarning.announcement", "Announces when the active line has a warning."),
          ...announcementFeatureBase,
          default: "off"
        }
      }
    },
    "accessibility.signals.positionHasError": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.positionHasError", "Plays a signal - sound (audio cue) and/or announcement (alert) - when the active line has a warning."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.positionHasError.sound", "Plays a sound when the active line has a warning."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.positionHasError.announcement", "Announces when the active line has a warning."),
          ...announcementFeatureBase,
          default: "on"
        }
      }
    },
    "accessibility.signals.positionHasWarning": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.positionHasWarning", "Plays a signal - sound (audio cue) and/or announcement (alert) - when the active line has a warning."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.positionHasWarning.sound", "Plays a sound when the active line has a warning."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.positionHasWarning.announcement", "Announces when the active line has a warning."),
          ...announcementFeatureBase,
          default: "on"
        }
      }
    },
    "accessibility.signals.onDebugBreak": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.onDebugBreak", "Plays a signal - sound (audio cue) and/or announcement (alert) - when the debugger stopped on a breakpoint."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.onDebugBreak.sound", "Plays a sound when the debugger stopped on a breakpoint."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.onDebugBreak.announcement", "Announces when the debugger stopped on a breakpoint."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.noInlayHints": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.noInlayHints", "Plays a signal - sound (audio cue) and/or announcement (alert) - when trying to read a line with inlay hints that has no inlay hints."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.noInlayHints.sound", "Plays a sound when trying to read a line with inlay hints that has no inlay hints."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.noInlayHints.announcement", "Announces when trying to read a line with inlay hints that has no inlay hints."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.taskCompleted": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.taskCompleted", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a task is completed."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.taskCompleted.sound", "Plays a sound when a task is completed."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.taskCompleted.announcement", "Announces when a task is completed."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.taskFailed": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.taskFailed", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a task fails (non-zero exit code)."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.taskFailed.sound", "Plays a sound when a task fails (non-zero exit code)."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.taskFailed.announcement", "Announces when a task fails (non-zero exit code)."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.terminalCommandFailed": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.terminalCommandFailed", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a terminal command fails (non-zero exit code) or when a command with such an exit code is navigated to in the accessible view."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.terminalCommandFailed.sound", "Plays a sound when a terminal command fails (non-zero exit code) or when a command with such an exit code is navigated to in the accessible view."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.terminalCommandFailed.announcement", "Announces when a terminal command fails (non-zero exit code) or when a command with such an exit code is navigated to in the accessible view."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.terminalCommandSucceeded": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.terminalCommandSucceeded", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a terminal command succeeds (zero exit code) or when a command with such an exit code is navigated to in the accessible view."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.terminalCommandSucceeded.sound", "Plays a sound when a terminal command succeeds (zero exit code) or when a command with such an exit code is navigated to in the accessible view."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.terminalCommandSucceeded.announcement", "Announces when a terminal command succeeds (zero exit code) or when a command with such an exit code is navigated to in the accessible view."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.terminalQuickFix": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.terminalQuickFix", "Plays a signal - sound (audio cue) and/or announcement (alert) - when terminal Quick Fixes are available."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.terminalQuickFix.sound", "Plays a sound when terminal Quick Fixes are available."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.terminalQuickFix.announcement", "Announces when terminal Quick Fixes are available."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.terminalBell": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.terminalBell", "Plays a signal - sound (audio cue) and/or announcement (alert) - when the terminal bell is ringing."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.terminalBell.sound", "Plays a sound when the terminal bell is ringing."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.terminalBell.announcement", "Announces when the terminal bell is ringing."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.diffLineInserted": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.diffLineInserted", "Plays a sound / audio cue when the focus moves to an inserted line in Accessible Diff Viewer mode or to the next/previous change."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.sound", "Plays a sound when the focus moves to an inserted line in Accessible Diff Viewer mode or to the next/previous change."),
          ...soundFeatureBase
        }
      }
    },
    "accessibility.signals.diffLineModified": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.diffLineModified", "Plays a sound / audio cue when the focus moves to an modified line in Accessible Diff Viewer mode or to the next/previous change."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.diffLineModified.sound", "Plays a sound when the focus moves to a modified line in Accessible Diff Viewer mode or to the next/previous change."),
          ...soundFeatureBase
        }
      }
    },
    "accessibility.signals.diffLineDeleted": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.diffLineDeleted", "Plays a sound / audio cue when the focus moves to an deleted line in Accessible Diff Viewer mode or to the next/previous change."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.diffLineDeleted.sound", "Plays a sound when the focus moves to an deleted line in Accessible Diff Viewer mode or to the next/previous change."),
          ...soundFeatureBase
        }
      }
    },
    "accessibility.signals.chatEditModifiedFile": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.chatEditModifiedFile", "Plays a sound / audio cue when revealing a file with changes from chat edits"),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.chatEditModifiedFile.sound", "Plays a sound when revealing a file with changes from chat edits"),
          ...soundFeatureBase
        }
      }
    },
    "accessibility.signals.notebookCellCompleted": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.notebookCellCompleted", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a notebook cell execution is successfully completed."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.notebookCellCompleted.sound", "Plays a sound when a notebook cell execution is successfully completed."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.notebookCellCompleted.announcement", "Announces when a notebook cell execution is successfully completed."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.notebookCellFailed": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.notebookCellFailed", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a notebook cell execution fails."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.notebookCellFailed.sound", "Plays a sound when a notebook cell execution fails."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.notebookCellFailed.announcement", "Announces when a notebook cell execution fails."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.progress": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.progress", "Plays a signal - sound (audio cue) and/or announcement (alert) - on loop while progress is occurring."),
      "default": {
        "sound": "auto",
        "announcement": "off"
      },
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.progress.sound", "Plays a sound on loop while progress is occurring."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.progress.announcement", "Alerts on loop while progress is occurring."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.chatRequestSent": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.chatRequestSent", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a chat request is made."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.chatRequestSent.sound", "Plays a sound when a chat request is made."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.chatRequestSent.announcement", "Announces when a chat request is made."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.chatResponseReceived": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.chatResponseReceived", "Plays a sound / audio cue when the response has been received."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.chatResponseReceived.sound", "Plays a sound on when the response has been received."),
          ...soundFeatureBase
        }
      }
    },
    "accessibility.signals.codeActionTriggered": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.codeActionTriggered", "Plays a sound / audio cue - when a code action has been triggered."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.codeActionTriggered.sound", "Plays a sound when a code action has been triggered."),
          ...soundFeatureBase
        }
      }
    },
    "accessibility.signals.codeActionApplied": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.codeActionApplied", "Plays a sound / audio cue when the code action has been applied."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.codeActionApplied.sound", "Plays a sound when the code action has been applied."),
          ...soundFeatureBase
        }
      }
    },
    "accessibility.signals.voiceRecordingStarted": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.voiceRecordingStarted", "Plays a sound / audio cue when the voice recording has started."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.voiceRecordingStarted.sound", "Plays a sound when the voice recording has started."),
          ...soundFeatureBase
        }
      },
      "default": {
        "sound": "on"
      }
    },
    "accessibility.signals.voiceModeStarted": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.voiceModeStarted", "Plays a signal - sound (audio cue) and/or announcement (alert) - when voice mode has started."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.voiceModeStarted.sound", "Plays a sound when voice mode has started."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.voiceModeStarted.announcement", "Announces when voice mode has started."),
          ...announcementFeatureBase
        }
      },
      "default": {
        "sound": "on",
        "announcement": "auto"
      }
    },
    "accessibility.signals.voiceRecordingStopped": {
      ...defaultNoAnnouncement,
      "description": localize("accessibility.signals.voiceRecordingStopped", "Plays a sound / audio cue when the voice recording has stopped."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.voiceRecordingStopped.sound", "Plays a sound when the voice recording has stopped."),
          ...soundFeatureBase
        }
      },
      "default": {
        "sound": "on"
      }
    },
    "accessibility.signals.voiceModeStopped": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.voiceModeStopped", "Plays a signal - sound (audio cue) and/or announcement (alert) - when voice mode has stopped."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.voiceModeStopped.sound", "Plays a sound when voice mode has stopped."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.voiceModeStopped.announcement", "Announces when voice mode has stopped."),
          ...announcementFeatureBase
        }
      },
      "default": {
        "sound": "on",
        "announcement": "auto"
      }
    },
    "accessibility.signals.clear": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.clear", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a feature is cleared (for example, the terminal, Debug Console, or Output channel)."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.clear.sound", "Plays a sound when a feature is cleared."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.clear.announcement", "Announces when a feature is cleared."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.editsUndone": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.editsUndone", "Plays a signal - sound (audio cue) and/or announcement (alert) - when edits have been undone."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.editsUndone.sound", "Plays a sound when edits have been undone."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.editsUndone.announcement", "Announces when edits have been undone."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.editsKept": {
      ...signalFeatureBase,
      "description": localize("accessibility.signals.editsKept", "Plays a signal - sound (audio cue) and/or announcement (alert) - when edits are kept."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.editsKept.sound", "Plays a sound when edits are kept."),
          ...soundFeatureBase
        },
        "announcement": {
          "description": localize("accessibility.signals.editsKept.announcement", "Announces when edits are kept."),
          ...announcementFeatureBase
        }
      }
    },
    "accessibility.signals.save": {
      "type": "object",
      "tags": ["accessibility"],
      additionalProperties: false,
      "markdownDescription": localize("accessibility.signals.save", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a file is saved."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.save.sound", "Plays a sound when a file is saved."),
          "type": "string",
          "enum": ["userGesture", "always", "never"],
          "default": "never",
          "enumDescriptions": [
            localize("accessibility.signals.save.sound.userGesture", "Plays the sound when a user explicitly saves a file."),
            localize("accessibility.signals.save.sound.always", "Plays the sound whenever a file is saved, including auto save."),
            localize("accessibility.signals.save.sound.never", "Never plays the sound.")
          ]
        },
        "announcement": {
          "description": localize("accessibility.signals.save.announcement", "Announces when a file is saved."),
          "type": "string",
          "enum": ["userGesture", "always", "never"],
          "default": "never",
          "enumDescriptions": [
            localize("accessibility.signals.save.announcement.userGesture", "Announces when a user explicitly saves a file."),
            localize("accessibility.signals.save.announcement.always", "Announces whenever a file is saved, including auto save."),
            localize("accessibility.signals.save.announcement.never", "Never plays the announcement.")
          ]
        }
      },
      default: {
        "sound": "never",
        "announcement": "never"
      }
    },
    "accessibility.signals.format": {
      "type": "object",
      "tags": ["accessibility"],
      additionalProperties: false,
      "markdownDescription": localize("accessibility.signals.format", "Plays a signal - sound (audio cue) and/or announcement (alert) - when a file or notebook is formatted."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.format.sound", "Plays a sound when a file or notebook is formatted."),
          "type": "string",
          "enum": ["userGesture", "always", "never"],
          "default": "never",
          "enumDescriptions": [
            localize("accessibility.signals.format.userGesture", "Plays the sound when a user explicitly formats a file."),
            localize("accessibility.signals.format.always", "Plays the sound whenever a file is formatted, including if it is set to format on save, type, or, paste, or run of a cell."),
            localize("accessibility.signals.format.never", "Never plays the sound.")
          ]
        },
        "announcement": {
          "description": localize("accessibility.signals.format.announcement", "Announces when a file or notebook is formatted."),
          "type": "string",
          "enum": ["userGesture", "always", "never"],
          "default": "never",
          "enumDescriptions": [
            localize("accessibility.signals.format.announcement.userGesture", "Announces when a user explicitly formats a file."),
            localize("accessibility.signals.format.announcement.always", "Announces whenever a file is formatted, including if it is set to format on save, type, or, paste, or run of a cell."),
            localize("accessibility.signals.format.announcement.never", "Never announces.")
          ]
        }
      },
      default: {
        "sound": "never",
        "announcement": "never"
      }
    },
    "accessibility.signals.chatUserActionRequired": {
      ...signalFeatureBase,
      "markdownDescription": localize("accessibility.signals.chatUserActionRequired", "Plays a signal - sound (audio cue) and/or announcement (alert) - when user action is required in the chat."),
      "properties": {
        "sound": {
          "description": localize("accessibility.signals.chatUserActionRequired.sound", "Plays a sound when user action is required in the chat."),
          "type": "string",
          "enum": ["auto", "on", "off"],
          "enumDescriptions": [
            localize("sound.enabled.autoWindow", "Enable sound when a screen reader is attached."),
            localize("sound.enabled.on", "Enable sound."),
            localize("sound.enabled.off", "Disable sound.")
          ]
        },
        "announcement": {
          "description": localize("accessibility.signals.chatUserActionRequired.announcement", "Announces when a user action is required in the chat - including information about the action and how to take it."),
          ...announcementFeatureBase
        }
      },
      default: {
        "sound": "auto",
        "announcement": "auto"
      },
      tags: ["accessibility"]
    },
    "accessibility.underlineLinks": {
      "type": "boolean",
      "description": localize("accessibility.underlineLinks", "Controls whether links should be underlined in the workbench."),
      "default": false
    },
    "accessibility.debugWatchVariableAnnouncements": {
      "type": "boolean",
      "description": localize("accessibility.debugWatchVariableAnnouncements", "Controls whether variable changes should be announced in the debug watch view."),
      "default": true
    },
    "accessibility.replEditor.readLastExecutionOutput": {
      "type": "boolean",
      "description": localize("accessibility.replEditor.readLastExecutedOutput", "Controls whether the output from an execution in the native REPL will be announced."),
      "default": true
    },
    "accessibility.replEditor.autoFocusReplExecution": {
      type: "string",
      enum: ["none", "input", "lastExecution"],
      default: "input",
      description: localize("replEditor.autoFocusAppendedCell", "Control whether focus should automatically be sent to the REPL when code is executed.")
    },
    "accessibility.windowTitleOptimized": {
      "type": "boolean",
      "default": true,
      "markdownDescription": localize("accessibility.windowTitleOptimized", "Controls whether the {0} should be optimized for screen readers when in screen reader mode. When enabled, the window title will have {1} appended to the end.", "`#window.title#`", "`activeEditorState`")
    },
    "accessibility.openChatEditedFiles": {
      "type": "boolean",
      "default": false,
      "markdownDescription": localize("accessibility.openChatEditedFiles", "Controls whether files should be opened when the chat agent has applied edits to them.")
    },
    "accessibility.verboseChatProgressUpdates": {
      "type": "boolean",
      "default": true,
      "markdownDescription": localize("accessibility.verboseChatProgressUpdates", "Controls whether verbose progress announcements should be made when a chat request is in progress, including information like searched text for <search term> with X results, created file <file_name>, or read file <file path>.")
    }
  }
};
function registerAccessibilityConfiguration() {
  const registry = Registry.as(Extensions.Configuration);
  registry.registerConfiguration(configuration);
  registry.registerConfiguration({
    ...workbenchConfigurationNodeBase,
    properties: {
      ["accessibility.dimUnfocused.enabled" /* DimUnfocusedEnabled */]: {
        description: localize("dimUnfocusedEnabled", "Whether to dim unfocused editors and terminals, which makes it more clear where typed input will go to. This works with the majority of editors with the notable exceptions of those that utilize iframes like notebooks and extension webview editors."),
        type: "boolean",
        default: false,
        tags: ["accessibility"],
        scope: ConfigurationScope.APPLICATION
      },
      ["accessibility.dimUnfocused.opacity" /* DimUnfocusedOpacity */]: {
        markdownDescription: localize("dimUnfocusedOpacity", "The opacity fraction (0.2 to 1.0) to use for unfocused editors and terminals. This will only take effect when {0} is enabled.", `\`#${"accessibility.dimUnfocused.enabled" /* DimUnfocusedEnabled */}#\``),
        type: "number",
        minimum: 0.2 /* Minimum */,
        maximum: 1 /* Maximum */,
        default: 0.75 /* Default */,
        tags: ["accessibility"],
        scope: ConfigurationScope.APPLICATION
      },
      ["accessibility.hideAccessibleView" /* HideAccessibleView */]: {
        description: localize("accessibility.hideAccessibleView", "Controls whether the Accessible View is hidden."),
        type: "boolean",
        default: false,
        tags: ["accessibility"]
      },
      ["accessibility.verboseChatProgressUpdates" /* VerboseChatProgressUpdates */]: {
        "type": "boolean",
        "default": true,
        "markdownDescription": localize("accessibility.verboseChatProgressUpdates", "Controls whether verbose progress announcements should be made when a chat request is in progress, including information like searched text for <search term> with X results, created file <file_name>, or read file <file path>.")
      },
      ["accessibility.chat.showCheckmarks" /* ShowChatCheckmarks */]: {
        "type": "boolean",
        "default": false,
        "tags": ["accessibility"],
        "markdownDescription": localize("accessibility.chat.showCheckmarks", "Controls whether checkmark icons are shown on completed tool calls and other collapsible items in chat responses.")
      }
    }
  });
}
const SpeechTimeoutDefault = 0;
let DynamicSpeechAccessibilityConfiguration = class extends Disposable {
  constructor(speechService) {
    super();
    this.speechService = speechService;
    this._register(Event.runAndSubscribe(speechService.onDidChangeHasSpeechProvider, () => this.updateConfiguration()));
  }
  updateConfiguration() {
    if (!this.speechService.hasSpeechProvider) {
      return;
    }
    const languages = this.getLanguages();
    const languagesSorted = Object.keys(languages).sort((langA, langB) => {
      return languages[langA].name.localeCompare(languages[langB].name);
    });
    const registry = Registry.as(Extensions.Configuration);
    registry.registerConfiguration({
      ...accessibilityConfigurationNodeBase,
      properties: {
        [AccessibilityVoiceSettingId.SpeechTimeout]: {
          "markdownDescription": localize("voice.speechTimeout", "The duration in milliseconds that voice speech recognition remains active after you stop speaking. For example in a chat session, the transcribed text is submitted automatically after the timeout is met. Set to `0` to disable this feature."),
          "type": "number",
          "default": SpeechTimeoutDefault,
          "minimum": 0,
          "tags": ["accessibility"]
        },
        [AccessibilityVoiceSettingId.IgnoreCodeBlocks]: {
          "markdownDescription": localize("voice.ignoreCodeBlocks", "Whether to ignore code snippets in text-to-speech synthesis."),
          "type": "boolean",
          "default": false,
          "tags": ["accessibility"]
        },
        [AccessibilityVoiceSettingId.SpeechLanguage]: {
          "markdownDescription": localize("voice.speechLanguage", "The language that text-to-speech and speech-to-text should use. Select `auto` to use the configured display language if possible. Note that not all display languages maybe supported by speech recognition and synthesizers."),
          "type": "string",
          "enum": languagesSorted,
          "default": "auto",
          "tags": ["accessibility"],
          "enumDescriptions": languagesSorted.map((key) => languages[key].name),
          "enumItemLabels": languagesSorted.map((key) => languages[key].name)
        },
        [AccessibilityVoiceSettingId.AutoSynthesize]: {
          "type": "string",
          "enum": ["on", "off"],
          "enumDescriptions": [
            localize("accessibility.voice.autoSynthesize.on", "Enable the feature. When a screen reader is enabled, note that this will disable aria updates."),
            localize("accessibility.voice.autoSynthesize.off", "Disable the feature.")
          ],
          "markdownDescription": localize("autoSynthesize", "Whether a textual response should automatically be read out aloud when speech was used as input. For example in a chat session, a response is automatically synthesized when voice was used as chat request."),
          "default": "off",
          "tags": ["accessibility"]
        }
      }
    });
  }
  getLanguages() {
    return {
      ["auto"]: {
        name: localize("speechLanguage.auto", "Auto (Use Display Language)")
      },
      ...SPEECH_LANGUAGES
    };
  }
};
DynamicSpeechAccessibilityConfiguration.ID = "workbench.contrib.dynamicSpeechAccessibilityConfiguration";
DynamicSpeechAccessibilityConfiguration = __decorateClass([
  __decorateParam(0, ISpeechService)
], DynamicSpeechAccessibilityConfiguration);
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "audioCues.volume",
  migrateFn: (value, accessor) => {
    return [
      ["accessibility.signalOptions.volume", { value }],
      ["audioCues.volume", { value: void 0 }]
    ];
  }
}]);
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "audioCues.debouncePositionChanges",
  migrateFn: (value) => {
    return [
      ["accessibility.signalOptions.debouncePositionChanges", { value }],
      ["audioCues.debouncePositionChanges", { value: void 0 }]
    ];
  }
}]);
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "accessibility.signalOptions",
  migrateFn: (value, accessor) => {
    const delayGeneral = getDelaysFromConfig(accessor, "general");
    const delayError = getDelaysFromConfig(accessor, "errorAtPosition");
    const delayWarning = getDelaysFromConfig(accessor, "warningAtPosition");
    const volume = getVolumeFromConfig(accessor);
    const debouncePositionChanges = getDebouncePositionChangesFromConfig(accessor);
    const result = [];
    if (!!volume) {
      result.push(["accessibility.signalOptions.volume", { value: volume }]);
    }
    if (!!delayGeneral) {
      result.push(["accessibility.signalOptions.experimental.delays.general", { value: delayGeneral }]);
    }
    if (!!delayError) {
      result.push(["accessibility.signalOptions.experimental.delays.errorAtPosition", { value: delayError }]);
    }
    if (!!delayWarning) {
      result.push(["accessibility.signalOptions.experimental.delays.warningAtPosition", { value: delayWarning }]);
    }
    if (!!debouncePositionChanges) {
      result.push(["accessibility.signalOptions.debouncePositionChanges", { value: debouncePositionChanges }]);
    }
    result.push(["accessibility.signalOptions", { value: void 0 }]);
    return result;
  }
}]);
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "accessibility.signals.sounds.volume",
  migrateFn: (value) => {
    return [
      ["accessibility.signalOptions.volume", { value }],
      ["accessibility.signals.sounds.volume", { value: void 0 }]
    ];
  }
}]);
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "accessibility.signals.debouncePositionChanges",
  migrateFn: (value) => {
    return [
      ["accessibility.signalOptions.debouncePositionChanges", { value }],
      ["accessibility.signals.debouncePositionChanges", { value: void 0 }]
    ];
  }
}]);
function getDelaysFromConfig(accessor, type) {
  return accessor(`accessibility.signalOptions.experimental.delays.${type}`) || accessor("accessibility.signalOptions")?.["experimental.delays"]?.[`${type}`] || accessor("accessibility.signalOptions")?.["delays"]?.[`${type}`];
}
function getVolumeFromConfig(accessor) {
  return accessor("accessibility.signalOptions.volume") || accessor("accessibility.signalOptions")?.volume || accessor("accessibility.signals.sounds.volume") || accessor("audioCues.volume");
}
function getDebouncePositionChangesFromConfig(accessor) {
  return accessor("accessibility.signalOptions.debouncePositionChanges") || accessor("accessibility.signalOptions")?.debouncePositionChanges || accessor("accessibility.signals.debouncePositionChanges") || accessor("audioCues.debouncePositionChanges");
}
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: AccessibilityVoiceSettingId.AutoSynthesize,
  migrateFn: (value) => {
    let newValue;
    if (value === true) {
      newValue = "on";
    } else if (value === false) {
      newValue = "off";
    } else {
      return [];
    }
    return [
      [AccessibilityVoiceSettingId.AutoSynthesize, { value: newValue }]
    ];
  }
}]);
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "accessibility.signals.chatResponsePending",
  migrateFn: (value, accessor) => {
    return [
      ["accessibility.signals.progress", { value }],
      ["accessibility.signals.chatResponsePending", { value: void 0 }]
    ];
  }
}]);
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations(AccessibilitySignal.allAccessibilitySignals.map((item) => item.legacySoundSettingsKey ? {
  key: item.legacySoundSettingsKey,
  migrateFn: (sound, accessor) => {
    const configurationKeyValuePairs = [];
    const legacyAnnouncementSettingsKey = item.legacyAnnouncementSettingsKey;
    let announcement;
    if (legacyAnnouncementSettingsKey) {
      announcement = accessor(legacyAnnouncementSettingsKey) ?? void 0;
      if (announcement !== void 0 && typeof announcement !== "string") {
        announcement = announcement ? "auto" : "off";
      }
    }
    configurationKeyValuePairs.push([`${item.legacySoundSettingsKey}`, { value: void 0 }]);
    configurationKeyValuePairs.push([`${item.settingsKey}`, { value: announcement !== void 0 ? { announcement, sound } : { sound } }]);
    return configurationKeyValuePairs;
  }
} : void 0).filter(isDefined));
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations(AccessibilitySignal.allAccessibilitySignals.filter((i) => !!i.legacyAnnouncementSettingsKey && !!i.legacySoundSettingsKey).map((item) => ({
  key: item.legacyAnnouncementSettingsKey,
  migrateFn: (announcement, accessor) => {
    const configurationKeyValuePairs = [];
    const sound = accessor(item.settingsKey)?.sound || accessor(item.legacySoundSettingsKey);
    if (announcement !== void 0 && typeof announcement !== "string") {
      announcement = announcement ? "auto" : "off";
    }
    configurationKeyValuePairs.push([`${item.settingsKey}`, { value: announcement !== void 0 ? { announcement, sound } : { sound } }]);
    configurationKeyValuePairs.push([`${item.legacyAnnouncementSettingsKey}`, { value: void 0 }]);
    configurationKeyValuePairs.push([`${item.legacySoundSettingsKey}`, { value: void 0 }]);
    return configurationKeyValuePairs;
  }
})));
export {
  AccessibilityVerbositySettingId,
  AccessibilityVoiceSettingId,
  AccessibilityWorkbenchSettingId,
  DynamicSpeechAccessibilityConfiguration,
  SpeechTimeoutDefault,
  ViewDimUnfocusedOpacityProperties,
  accessibilityConfigurationNodeBase,
  accessibilityHelpIsShown,
  accessibleViewContainsCodeBlocks,
  accessibleViewCurrentProviderId,
  accessibleViewGoToSymbolSupported,
  accessibleViewHasAssignedKeybindings,
  accessibleViewHasUnassignedKeybindings,
  accessibleViewInCodeBlock,
  accessibleViewIsShown,
  accessibleViewOnLastLine,
  accessibleViewSupportsNavigation,
  accessibleViewVerbosityEnabled,
  announcementFeatureBase,
  registerAccessibilityConfiguration,
  soundFeatureBase
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25Ob2RlLCBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaENvbmZpZ3VyYXRpb25Ob2RlQmFzZSwgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5LCBDb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycywgQ29uZmlndXJhdGlvbk1pZ3JhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFjY2Vzc2liaWxpdHlTaWduYWwgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVZvaWNlU2V0dGluZ0lkLCBJU3BlZWNoU2VydmljZSwgU1BFRUNIX0xBTkdVQUdFUyB9IGZyb20gJy4uLy4uL3NwZWVjaC9jb21tb24vc3BlZWNoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGlzRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuZXhwb3J0IGNvbnN0IGFjY2Vzc2liaWxpdHlIZWxwSXNTaG93biA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdhY2Nlc3NpYmlsaXR5SGVscElzU2hvd24nLCBmYWxzZSwgdHJ1ZSk7XG5leHBvcnQgY29uc3QgYWNjZXNzaWJsZVZpZXdJc1Nob3duID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2FjY2Vzc2libGVWaWV3SXNTaG93bicsIGZhbHNlLCB0cnVlKTtcbmV4cG9ydCBjb25zdCBhY2Nlc3NpYmxlVmlld1N1cHBvcnRzTmF2aWdhdGlvbiA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdhY2Nlc3NpYmxlVmlld1N1cHBvcnRzTmF2aWdhdGlvbicsIGZhbHNlLCB0cnVlKTtcbmV4cG9ydCBjb25zdCBhY2Nlc3NpYmxlVmlld1ZlcmJvc2l0eUVuYWJsZWQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYWNjZXNzaWJsZVZpZXdWZXJib3NpdHlFbmFibGVkJywgZmFsc2UsIHRydWUpO1xuZXhwb3J0IGNvbnN0IGFjY2Vzc2libGVWaWV3R29Ub1N5bWJvbFN1cHBvcnRlZCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdhY2Nlc3NpYmxlVmlld0dvVG9TeW1ib2xTdXBwb3J0ZWQnLCBmYWxzZSwgdHJ1ZSk7XG5leHBvcnQgY29uc3QgYWNjZXNzaWJsZVZpZXdPbkxhc3RMaW5lID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2FjY2Vzc2libGVWaWV3T25MYXN0TGluZScsIGZhbHNlLCB0cnVlKTtcbmV4cG9ydCBjb25zdCBhY2Nlc3NpYmxlVmlld0N1cnJlbnRQcm92aWRlcklkID0gbmV3IFJhd0NvbnRleHRLZXk8c3RyaW5nPignYWNjZXNzaWJsZVZpZXdDdXJyZW50UHJvdmlkZXJJZCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcbmV4cG9ydCBjb25zdCBhY2Nlc3NpYmxlVmlld0luQ29kZUJsb2NrID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2FjY2Vzc2libGVWaWV3SW5Db2RlQmxvY2snLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5leHBvcnQgY29uc3QgYWNjZXNzaWJsZVZpZXdDb250YWluc0NvZGVCbG9ja3MgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYWNjZXNzaWJsZVZpZXdDb250YWluc0NvZGVCbG9ja3MnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5leHBvcnQgY29uc3QgYWNjZXNzaWJsZVZpZXdIYXNVbmFzc2lnbmVkS2V5YmluZGluZ3MgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYWNjZXNzaWJsZVZpZXdIYXNVbmFzc2lnbmVkS2V5YmluZGluZ3MnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5leHBvcnQgY29uc3QgYWNjZXNzaWJsZVZpZXdIYXNBc3NpZ25lZEtleWJpbmRpbmdzID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2FjY2Vzc2libGVWaWV3SGFzQXNzaWduZWRLZXliaW5kaW5ncycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblxuLyoqXG4gKiBNaXNjZWxsYW5lb3VzIHNldHRpbmdzIHRhZ2dlZCB3aXRoIGFjY2Vzc2liaWxpdHkgYW5kIGltcGxlbWVudGVkIGluIHRoZSBhY2Nlc3NpYmlsaXR5IGNvbnRyaWIgYnV0XG4gKiB3ZXJlIGJldHRlciB0byBsaXZlIHVuZGVyIHdvcmtiZW5jaCBmb3IgZGlzY292ZXJhYmlsaXR5LlxuICovXG5leHBvcnQgY29uc3QgZW51bSBBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkIHtcblx0RGltVW5mb2N1c2VkRW5hYmxlZCA9ICdhY2Nlc3NpYmlsaXR5LmRpbVVuZm9jdXNlZC5lbmFibGVkJyxcblx0RGltVW5mb2N1c2VkT3BhY2l0eSA9ICdhY2Nlc3NpYmlsaXR5LmRpbVVuZm9jdXNlZC5vcGFjaXR5Jyxcblx0SGlkZUFjY2Vzc2libGVWaWV3ID0gJ2FjY2Vzc2liaWxpdHkuaGlkZUFjY2Vzc2libGVWaWV3Jyxcblx0QWNjZXNzaWJsZVZpZXdDbG9zZU9uS2V5UHJlc3MgPSAnYWNjZXNzaWJpbGl0eS5hY2Nlc3NpYmxlVmlldy5jbG9zZU9uS2V5UHJlc3MnLFxuXHRWZXJib3NlQ2hhdFByb2dyZXNzVXBkYXRlcyA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2VDaGF0UHJvZ3Jlc3NVcGRhdGVzJyxcblx0U2hvd0NoYXRDaGVja21hcmtzID0gJ2FjY2Vzc2liaWxpdHkuY2hhdC5zaG93Q2hlY2ttYXJrcydcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gVmlld0RpbVVuZm9jdXNlZE9wYWNpdHlQcm9wZXJ0aWVzIHtcblx0RGVmYXVsdCA9IDAuNzUsXG5cdE1pbmltdW0gPSAwLjIsXG5cdE1heGltdW0gPSAxXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQge1xuXHRUZXJtaW5hbCA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS50ZXJtaW5hbCcsXG5cdERpZmZFZGl0b3IgPSAnYWNjZXNzaWJpbGl0eS52ZXJib3NpdHkuZGlmZkVkaXRvcicsXG5cdE1lcmdlRWRpdG9yID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5Lm1lcmdlRWRpdG9yJyxcblx0Q2hhdCA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5wYW5lbENoYXQnLFxuXHRJbmxpbmVDaGF0ID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LmlubGluZUNoYXQnLFxuXHRUZXJtaW5hbElubGluZUNoYXQgPSAnYWNjZXNzaWJpbGl0eS52ZXJib3NpdHkudGVybWluYWxDaGF0Jyxcblx0VGVybWluYWxDaGF0T3V0cHV0ID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LnRlcm1pbmFsQ2hhdE91dHB1dCcsXG5cdElubGluZUNvbXBsZXRpb25zID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LmlubGluZUNvbXBsZXRpb25zJyxcblx0S2V5YmluZGluZ3NFZGl0b3IgPSAnYWNjZXNzaWJpbGl0eS52ZXJib3NpdHkua2V5YmluZGluZ3NFZGl0b3InLFxuXHROb3RlYm9vayA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5ub3RlYm9vaycsXG5cdEVkaXRvciA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5lZGl0b3InLFxuXHRIb3ZlciA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5ob3ZlcicsXG5cdE5vdGlmaWNhdGlvbiA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5ub3RpZmljYXRpb24nLFxuXHRFbXB0eUVkaXRvckhpbnQgPSAnYWNjZXNzaWJpbGl0eS52ZXJib3NpdHkuZW1wdHlFZGl0b3JIaW50Jyxcblx0UmVwbEVkaXRvciA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5yZXBsRWRpdG9yJyxcblx0Q29tbWVudHMgPSAnYWNjZXNzaWJpbGl0eS52ZXJib3NpdHkuY29tbWVudHMnLFxuXHREaWZmRWRpdG9yQWN0aXZlID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LmRpZmZFZGl0b3JBY3RpdmUnLFxuXHREZWJ1ZyA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5kZWJ1ZycsXG5cdFdhbGt0aHJvdWdoID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LndhbGt0aHJvdWdoJyxcblx0U291cmNlQ29udHJvbCA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5zb3VyY2VDb250cm9sJyxcblx0RmluZCA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5maW5kJyxcblx0U2Vzc2lvbnNDaGF0ID0gJ2FjY2Vzc2liaWxpdHkudmVyYm9zaXR5LnNlc3Npb25zQ2hhdCcsXG5cdFNlc3Npb25zQ2hhbmdlcyA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5zZXNzaW9uc0NoYW5nZXMnLFxuXHRDaGF0UXVlc3Rpb25DYXJvdXNlbCA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5jaGF0UXVlc3Rpb25DYXJvdXNlbCcsXG5cdFN1cnZleSA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5zdXJ2ZXknLFxuXHRBdXRvbWF0aW9ucyA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5hdXRvbWF0aW9ucycsXG5cdEJyb3dzZXJFbGVtZW50Q29tbWVudGluZyA9ICdhY2Nlc3NpYmlsaXR5LnZlcmJvc2l0eS5icm93c2VyRWxlbWVudENvbW1lbnRpbmcnXG59XG5cbmNvbnN0IGJhc2VWZXJib3NpdHlQcm9wZXJ0eTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSA9IHtcblx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRkZWZhdWx0OiB0cnVlLFxuXHR0YWdzOiBbJ2FjY2Vzc2liaWxpdHknXVxufTtcblxuZXhwb3J0IGNvbnN0IGFjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uTm9kZUJhc2UgPSBPYmplY3QuZnJlZXplPElDb25maWd1cmF0aW9uTm9kZT4oe1xuXHRpZDogJ2FjY2Vzc2liaWxpdHknLFxuXHR0aXRsZTogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uVGl0bGUnLCBcIkFjY2Vzc2liaWxpdHlcIiksXG5cdHR5cGU6ICdvYmplY3QnXG59KTtcblxuZXhwb3J0IGNvbnN0IHNvdW5kRmVhdHVyZUJhc2U6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgPSB7XG5cdCd0eXBlJzogJ3N0cmluZycsXG5cdCdlbnVtJzogWydhdXRvJywgJ29uJywgJ29mZiddLFxuXHQnZGVmYXVsdCc6ICdhdXRvJyxcblx0J2VudW1EZXNjcmlwdGlvbnMnOiBbXG5cdFx0bG9jYWxpemUoJ3NvdW5kLmVuYWJsZWQuYXV0bycsIFwiRW5hYmxlIHNvdW5kIHdoZW4gYSBzY3JlZW4gcmVhZGVyIGlzIGF0dGFjaGVkLlwiKSxcblx0XHRsb2NhbGl6ZSgnc291bmQuZW5hYmxlZC5vbicsIFwiRW5hYmxlIHNvdW5kLlwiKSxcblx0XHRsb2NhbGl6ZSgnc291bmQuZW5hYmxlZC5vZmYnLCBcIkRpc2FibGUgc291bmQuXCIpXG5cdF0sXG5cdHRhZ3M6IFsnYWNjZXNzaWJpbGl0eSddLFxufTtcblxuY29uc3Qgc2lnbmFsRmVhdHVyZUJhc2U6IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgPSB7XG5cdCd0eXBlJzogJ29iamVjdCcsXG5cdCd0YWdzJzogWydhY2Nlc3NpYmlsaXR5J10sXG5cdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0ZGVmYXVsdDoge1xuXHRcdHNvdW5kOiAnYXV0bycsXG5cdFx0YW5ub3VuY2VtZW50OiAnYXV0bydcblx0fVxufTtcblxuZXhwb3J0IGNvbnN0IGFubm91bmNlbWVudEZlYXR1cmVCYXNlOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hID0ge1xuXHQndHlwZSc6ICdzdHJpbmcnLFxuXHQnZW51bSc6IFsnYXV0bycsICdvZmYnXSxcblx0J2RlZmF1bHQnOiAnYXV0bycsXG5cdCdlbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdGxvY2FsaXplKCdhbm5vdW5jZW1lbnQuZW5hYmxlZC5hdXRvJywgXCJFbmFibGUgYW5ub3VuY2VtZW50LCB3aWxsIG9ubHkgcGxheSB3aGVuIGluIHNjcmVlbiByZWFkZXIgb3B0aW1pemVkIG1vZGUuXCIpLFxuXHRcdGxvY2FsaXplKCdhbm5vdW5jZW1lbnQuZW5hYmxlZC5vZmYnLCBcIkRpc2FibGUgYW5ub3VuY2VtZW50LlwiKVxuXHRdLFxuXHR0YWdzOiBbJ2FjY2Vzc2liaWxpdHknXSxcbn07XG5cbmNvbnN0IGRlZmF1bHROb0Fubm91bmNlbWVudDogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSA9IHtcblx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0J3RhZ3MnOiBbJ2FjY2Vzc2liaWxpdHknXSxcblx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHQnZGVmYXVsdCc6IHtcblx0XHQnc291bmQnOiAnYXV0bycsXG5cdH1cbn07XG5cbmNvbnN0IGNvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0Li4uYWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb25Ob2RlQmFzZSxcblx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRSxcblx0cHJvcGVydGllczoge1xuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLlRlcm1pbmFsXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkudGVybWluYWwuZGVzY3JpcHRpb24nLCAnUHJvdmlkZSBpbmZvcm1hdGlvbiBhYm91dCBob3cgdG8gYWNjZXNzIHRoZSB0ZXJtaW5hbCBhY2Nlc3NpYmlsaXR5IGhlbHAgbWVudSB3aGVuIHRoZSB0ZXJtaW5hbCBpcyBmb2N1c2VkLicpLFxuXHRcdFx0Li4uYmFzZVZlcmJvc2l0eVByb3BlcnR5XG5cdFx0fSxcblx0XHRbQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5EaWZmRWRpdG9yXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkuZGlmZkVkaXRvci5kZXNjcmlwdGlvbicsICdQcm92aWRlIGluZm9ybWF0aW9uIGFib3V0IGhvdyB0byBuYXZpZ2F0ZSBjaGFuZ2VzIGluIHRoZSBkaWZmIGVkaXRvciB3aGVuIGl0IGlzIGZvY3VzZWQuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkNoYXRdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZlcmJvc2l0eS5jaGF0LmRlc2NyaXB0aW9uJywgJ1Byb3ZpZGUgaW5mb3JtYXRpb24gYWJvdXQgaG93IHRvIGFjY2VzcyB0aGUgY2hhdCBoZWxwIG1lbnUgd2hlbiB0aGUgY2hhdCBpbnB1dCBpcyBmb2N1c2VkLicpLFxuXHRcdFx0Li4uYmFzZVZlcmJvc2l0eVByb3BlcnR5XG5cdFx0fSxcblx0XHRbQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5JbmxpbmVDaGF0XToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkuaW50ZXJhY3RpdmVFZGl0b3IuZGVzY3JpcHRpb24nLCAnUHJvdmlkZSBpbmZvcm1hdGlvbiBhYm91dCBob3cgdG8gYWNjZXNzIHRoZSBpbmxpbmUgZWRpdG9yIGNoYXQgYWNjZXNzaWJpbGl0eSBoZWxwIG1lbnUgYW5kIGFsZXJ0IHdpdGggaGludHMgdGhhdCBkZXNjcmliZSBob3cgdG8gdXNlIHRoZSBmZWF0dXJlIHdoZW4gdGhlIGlucHV0IGlzIGZvY3VzZWQuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLlRlcm1pbmFsQ2hhdE91dHB1dF06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyYm9zaXR5LnRlcm1pbmFsQ2hhdE91dHB1dC5kZXNjcmlwdGlvbicsICdQcm92aWRlIGluZm9ybWF0aW9uIGFib3V0IGhvdyB0byBvcGVuIHRoZSBjaGF0IHRlcm1pbmFsIG91dHB1dCBpbiB0aGUgQWNjZXNzaWJsZSBWaWV3LicpLFxuXHRcdFx0Li4uYmFzZVZlcmJvc2l0eVByb3BlcnR5XG5cdFx0fSxcblx0XHRbQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5JbmxpbmVDb21wbGV0aW9uc106IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyYm9zaXR5LmlubGluZUNvbXBsZXRpb25zLmRlc2NyaXB0aW9uJywgJ1Byb3ZpZGUgaW5mb3JtYXRpb24gYWJvdXQgaG93IHRvIGFjY2VzcyB0aGUgaW5saW5lIGNvbXBsZXRpb25zIGhvdmVyIGFuZCBBY2Nlc3NpYmxlIFZpZXcuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLktleWJpbmRpbmdzRWRpdG9yXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkua2V5YmluZGluZ3NFZGl0b3IuZGVzY3JpcHRpb24nLCAnUHJvdmlkZSBpbmZvcm1hdGlvbiBhYm91dCBob3cgdG8gY2hhbmdlIGEga2V5YmluZGluZyBpbiB0aGUga2V5YmluZGluZ3MgZWRpdG9yIHdoZW4gYSByb3cgaXMgZm9jdXNlZCBhbmQgaG93IHRvIG5hdmlnYXRlIHRvIHRoZSByZXN1bHRzIHRhYmxlLicpLFxuXHRcdFx0Li4uYmFzZVZlcmJvc2l0eVByb3BlcnR5XG5cdFx0fSxcblx0XHRbQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5Ob3RlYm9va106IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyYm9zaXR5Lm5vdGVib29rJywgJ1Byb3ZpZGUgaW5mb3JtYXRpb24gYWJvdXQgaG93IHRvIGZvY3VzIHRoZSBjZWxsIGNvbnRhaW5lciBvciBpbm5lciBlZGl0b3Igd2hlbiBhIG5vdGVib29rIGNlbGwgaXMgZm9jdXNlZC4nKSxcblx0XHRcdC4uLmJhc2VWZXJib3NpdHlQcm9wZXJ0eVxuXHRcdH0sXG5cdFx0W0FjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuSG92ZXJdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZlcmJvc2l0eS5ob3ZlcicsICdQcm92aWRlIGluZm9ybWF0aW9uIGFib3V0IGhvdyB0byBvcGVuIHRoZSBob3ZlciBpbiBhbiBBY2Nlc3NpYmxlIFZpZXcuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLk5vdGlmaWNhdGlvbl06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyYm9zaXR5Lm5vdGlmaWNhdGlvbicsICdQcm92aWRlIGluZm9ybWF0aW9uIGFib3V0IGhvdyB0byBvcGVuIHRoZSBub3RpZmljYXRpb24gaW4gYW4gQWNjZXNzaWJsZSBWaWV3LicpLFxuXHRcdFx0Li4uYmFzZVZlcmJvc2l0eVByb3BlcnR5XG5cdFx0fSxcblx0XHRbQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5FbXB0eUVkaXRvckhpbnRdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZlcmJvc2l0eS5lbXB0eUVkaXRvckhpbnQnLCAnUHJvdmlkZSBpbmZvcm1hdGlvbiBhYm91dCByZWxldmFudCBhY3Rpb25zIGluIGFuIGVtcHR5IHRleHQgZWRpdG9yLicpLFxuXHRcdFx0Li4uYmFzZVZlcmJvc2l0eVByb3BlcnR5XG5cdFx0fSxcblx0XHRbQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5SZXBsRWRpdG9yXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkucmVwbEVkaXRvci5kZXNjcmlwdGlvbicsICdQcm92aWRlIGluZm9ybWF0aW9uIGFib3V0IGhvdyB0byBhY2Nlc3MgdGhlIFJFUEwgZWRpdG9yIGFjY2Vzc2liaWxpdHkgaGVscCBtZW51IHdoZW4gdGhlIFJFUEwgZWRpdG9yIGlzIGZvY3VzZWQuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkNvbW1lbnRzXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkuY29tbWVudHMnLCAnUHJvdmlkZSBpbmZvcm1hdGlvbiBhYm91dCBhY3Rpb25zIHRoYXQgY2FuIGJlIHRha2VuIGluIHRoZSBjb21tZW50IHdpZGdldCBvciBpbiBhIGZpbGUgd2hpY2ggY29udGFpbnMgY29tbWVudHMuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkRpZmZFZGl0b3JBY3RpdmVdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZlcmJvc2l0eS5kaWZmRWRpdG9yQWN0aXZlJywgJ0luZGljYXRlIHdoZW4gYSBkaWZmIGVkaXRvciBiZWNvbWVzIHRoZSBhY3RpdmUgZWRpdG9yLicpLFxuXHRcdFx0Li4uYmFzZVZlcmJvc2l0eVByb3BlcnR5XG5cdFx0fSxcblx0XHRbQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5EZWJ1Z106IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyYm9zaXR5LmRlYnVnJywgJ1Byb3ZpZGUgaW5mb3JtYXRpb24gYWJvdXQgaG93IHRvIGFjY2VzcyB0aGUgZGVidWcgY29uc29sZSBhY2Nlc3NpYmlsaXR5IGhlbHAgZGlhbG9nIHdoZW4gdGhlIGRlYnVnIGNvbnNvbGUgb3IgcnVuIGFuZCBkZWJ1ZyB2aWV3bGV0IGlzIGZvY3VzZWQuIE5vdGUgdGhhdCBhIHJlbG9hZCBvZiB0aGUgd2luZG93IGlzIHJlcXVpcmVkIGZvciB0aGlzIHRvIHRha2UgZWZmZWN0LicpLFxuXHRcdFx0Li4uYmFzZVZlcmJvc2l0eVByb3BlcnR5XG5cdFx0fSxcblx0XHRbQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5XYWxrdGhyb3VnaF06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyYm9zaXR5LndhbGt0aHJvdWdoJywgJ1Byb3ZpZGUgaW5mb3JtYXRpb24gYWJvdXQgaG93IHRvIG9wZW4gdGhlIHdhbGt0aHJvdWdoIGluIGFuIEFjY2Vzc2libGUgVmlldy4nKSxcblx0XHRcdC4uLmJhc2VWZXJib3NpdHlQcm9wZXJ0eVxuXHRcdH0sXG5cdFx0W0FjY2Vzc2liaWxpdHlXb3JrYmVuY2hTZXR0aW5nSWQuQWNjZXNzaWJsZVZpZXdDbG9zZU9uS2V5UHJlc3NdOiB7XG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5hY2Nlc3NpYmxlVmlldy5jbG9zZU9uS2V5UHJlc3MnLCBcIk9uIGtleXByZXNzLCBjbG9zZSB0aGUgQWNjZXNzaWJsZSBWaWV3IGFuZCBmb2N1cyB0aGUgZWxlbWVudCBmcm9tIHdoaWNoIGl0IHdhcyBpbnZva2VkLlwiKSxcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWVcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLlNvdXJjZUNvbnRyb2xdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZlcmJvc2l0eS5zY20nLCAnUHJvdmlkZSBpbmZvcm1hdGlvbiBhYm91dCBob3cgdG8gYWNjZXNzIHRoZSBzb3VyY2UgY29udHJvbCBhY2Nlc3NpYmlsaXR5IGhlbHAgbWVudSB3aGVuIHRoZSBpbnB1dCBpcyBmb2N1c2VkLicpLFxuXHRcdFx0Li4uYmFzZVZlcmJvc2l0eVByb3BlcnR5XG5cdFx0fSxcblx0XHRbQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5GaW5kXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkuZmluZCcsICdQcm92aWRlIGluZm9ybWF0aW9uIGFib3V0IGhvdyB0byBhY2Nlc3MgdGhlIGZpbmQgYWNjZXNzaWJpbGl0eSBoZWxwIG1lbnUgd2hlbiB0aGUgZmluZCBpbnB1dCBpcyBmb2N1c2VkLicpLFxuXHRcdFx0Li4uYmFzZVZlcmJvc2l0eVByb3BlcnR5XG5cdFx0fSxcblx0XHRbQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5TZXNzaW9uc0NoYXRdOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZlcmJvc2l0eS5zZXNzaW9uc0NoYXQnLCAnUHJvdmlkZSBpbmZvcm1hdGlvbiBhYm91dCBob3cgdG8gYWNjZXNzIHRoZSBBZ2VudHMgd2luZG93IGFjY2Vzc2liaWxpdHkgaGVscCBtZW51IHdoZW4gdGhlIGNoYXQgaW5wdXQgaXMgZm9jdXNlZC4nKSxcblx0XHRcdC4uLmJhc2VWZXJib3NpdHlQcm9wZXJ0eVxuXHRcdH0sXG5cdFx0W0FjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuU2Vzc2lvbnNDaGFuZ2VzXToge1xuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2ZXJib3NpdHkuc2Vzc2lvbnNDaGFuZ2VzJywgJ1Byb3ZpZGUgaW5mb3JtYXRpb24gYWJvdXQgaG93IHRvIGFjY2VzcyB0aGUgQ2hhbmdlcyB2aWV3IGFjY2Vzc2liaWxpdHkgaGVscCBtZW51IHdoZW4gdGhlIENoYW5nZXMgdmlldyBpcyBmb2N1c2VkLicpLFxuXHRcdFx0Li4uYmFzZVZlcmJvc2l0eVByb3BlcnR5XG5cdFx0fSxcblx0XHRbQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5DaGF0UXVlc3Rpb25DYXJvdXNlbF06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyYm9zaXR5LmNoYXRRdWVzdGlvbkNhcm91c2VsJywgJ1Byb3ZpZGUgaW5mb3JtYXRpb24gYWJvdXQgaG93IHRvIG5hdmlnYXRlIGFuZCBpbnRlcmFjdCB3aXRoIHRoZSBjaGF0IHF1ZXN0aW9uIGNhcm91c2VsLCBpbmNsdWRpbmcgaG93IHRvIGZvY3VzIHRoZSB0ZXJtaW5hbCB3aGVuIGFwcGxpY2FibGUuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLlN1cnZleV06IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyYm9zaXR5LnN1cnZleScsICdQcm92aWRlIGluZm9ybWF0aW9uIGFib3V0IGhvdyB0byBuYXZpZ2F0ZSBhbmQgaW50ZXJhY3Qgd2l0aCB0aGUgc3VydmV5IGVkaXRvciBwYW5lLicpLFxuXHRcdFx0Li4uYmFzZVZlcmJvc2l0eVByb3BlcnR5XG5cdFx0fSxcblx0XHRbQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5BdXRvbWF0aW9uc106IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyYm9zaXR5LmF1dG9tYXRpb25zJywgJ1Byb3ZpZGUgaW5mb3JtYXRpb24gYWJvdXQgaG93IHRvIHVzZSBBdXRvbWF0aW9ucyBtYW5hZ2VtZW50IHZpZXdzLCBpbmNsdWRpbmcga2V5Ym9hcmQgbmF2aWdhdGlvbiBhbmQgaG93IHRvIGluc3BlY3Qgc2NoZWR1bGVkIHJ1bnMuJyksXG5cdFx0XHQuLi5iYXNlVmVyYm9zaXR5UHJvcGVydHlcblx0XHR9LFxuXHRcdFtBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkLkJyb3dzZXJFbGVtZW50Q29tbWVudGluZ106IHtcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndmVyYm9zaXR5LmJyb3dzZXJFbGVtZW50Q29tbWVudGluZycsICdQcm92aWRlIGluZm9ybWF0aW9uIGFib3V0IGhvdyB0byBhY2Nlc3MgZWxlbWVudCBjb21tZW50aW5nIGFjY2Vzc2liaWxpdHkgaGVscCBpbiB0aGUgSW50ZWdyYXRlZCBCcm93c2VyLicpLFxuXHRcdFx0Li4uYmFzZVZlcmJvc2l0eVByb3BlcnR5XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLnZvbHVtZSc6IHtcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMudm9sdW1lJywgXCJUaGUgdm9sdW1lIG9mIHRoZSBzb3VuZHMgaW4gcGVyY2VudCAoMC0xMDApLlwiKSxcblx0XHRcdCd0eXBlJzogJ251bWJlcicsXG5cdFx0XHQnbWluaW11bSc6IDAsXG5cdFx0XHQnbWF4aW11bSc6IDEwMCxcblx0XHRcdCdkZWZhdWx0JzogNzAsXG5cdFx0XHQndGFncyc6IFsnYWNjZXNzaWJpbGl0eSddXG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLmRlYm91bmNlUG9zaXRpb25DaGFuZ2VzJzoge1xuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5kZWJvdW5jZVBvc2l0aW9uQ2hhbmdlcycsIFwiV2hldGhlciBvciBub3QgcG9zaXRpb24gY2hhbmdlcyBzaG91bGQgYmUgZGVib3VuY2VkXCIpLFxuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVmYXVsdCc6IGZhbHNlLFxuXHRcdFx0J3RhZ3MnOiBbJ2FjY2Vzc2liaWxpdHknXVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5leHBlcmltZW50YWwuZGVsYXlzLmdlbmVyYWwnOiB7XG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogJ0RlbGF5cyBmb3IgYWxsIHNpZ25hbHMgYmVzaWRlcyBlcnJvciBhbmQgd2FybmluZyBhdCBwb3NpdGlvbicsXG5cdFx0XHQnYWRkaXRpb25hbFByb3BlcnRpZXMnOiBmYWxzZSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMuZGVsYXlzLmdlbmVyYWwuYW5ub3VuY2VtZW50JywgXCJUaGUgZGVsYXkgaW4gbWlsbGlzZWNvbmRzIGJlZm9yZSBhbiBhbm5vdW5jZW1lbnQgaXMgbWFkZS5cIiksXG5cdFx0XHRcdFx0J3R5cGUnOiAnbnVtYmVyJyxcblx0XHRcdFx0XHQnbWluaW11bSc6IDAsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiAzMDAwXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLmRlbGF5cy5nZW5lcmFsLnNvdW5kJywgXCJUaGUgZGVsYXkgaW4gbWlsbGlzZWNvbmRzIGJlZm9yZSBhIHNvdW5kIGlzIHBsYXllZC5cIiksXG5cdFx0XHRcdFx0J3R5cGUnOiAnbnVtYmVyJyxcblx0XHRcdFx0XHQnbWluaW11bSc6IDAsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiA0MDBcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCd0YWdzJzogWydhY2Nlc3NpYmlsaXR5J11cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMuZXhwZXJpbWVudGFsLmRlbGF5cy53YXJuaW5nQXRQb3NpdGlvbic6IHtcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQnYWRkaXRpb25hbFByb3BlcnRpZXMnOiBmYWxzZSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMuZGVsYXlzLndhcm5pbmdBdFBvc2l0aW9uLmFubm91bmNlbWVudCcsIFwiVGhlIGRlbGF5IGluIG1pbGxpc2Vjb25kcyBiZWZvcmUgYW4gYW5ub3VuY2VtZW50IGlzIG1hZGUgd2hlbiB0aGVyZSdzIGEgd2FybmluZyBhdCB0aGUgcG9zaXRpb24uXCIpLFxuXHRcdFx0XHRcdCd0eXBlJzogJ251bWJlcicsXG5cdFx0XHRcdFx0J21pbmltdW0nOiAwLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogMzAwMFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5kZWxheXMud2FybmluZ0F0UG9zaXRpb24uc291bmQnLCBcIlRoZSBkZWxheSBpbiBtaWxsaXNlY29uZHMgYmVmb3JlIGEgc291bmQgaXMgcGxheWVkIHdoZW4gdGhlcmUncyBhIHdhcm5pbmcgYXQgdGhlIHBvc2l0aW9uLlwiKSxcblx0XHRcdFx0XHQndHlwZSc6ICdudW1iZXInLFxuXHRcdFx0XHRcdCdtaW5pbXVtJzogMCxcblx0XHRcdFx0XHQnZGVmYXVsdCc6IDEwMDBcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdCd0YWdzJzogWydhY2Nlc3NpYmlsaXR5J11cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMuZXhwZXJpbWVudGFsLmRlbGF5cy5lcnJvckF0UG9zaXRpb24nOiB7XG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J2FkZGl0aW9uYWxQcm9wZXJ0aWVzJzogZmFsc2UsXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLmRlbGF5cy5lcnJvckF0UG9zaXRpb24uYW5ub3VuY2VtZW50JywgXCJUaGUgZGVsYXkgaW4gbWlsbGlzZWNvbmRzIGJlZm9yZSBhbiBhbm5vdW5jZW1lbnQgaXMgbWFkZSB3aGVuIHRoZXJlJ3MgYW4gZXJyb3IgYXQgdGhlIHBvc2l0aW9uLlwiKSxcblx0XHRcdFx0XHQndHlwZSc6ICdudW1iZXInLFxuXHRcdFx0XHRcdCdtaW5pbXVtJzogMCxcblx0XHRcdFx0XHQnZGVmYXVsdCc6IDMwMDBcblx0XHRcdFx0fSxcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMuZGVsYXlzLmVycm9yQXRQb3NpdGlvbi5zb3VuZCcsIFwiVGhlIGRlbGF5IGluIG1pbGxpc2Vjb25kcyBiZWZvcmUgYSBzb3VuZCBpcyBwbGF5ZWQgd2hlbiB0aGVyZSdzIGFuIGVycm9yIGF0IHRoZSBwb3NpdGlvbi5cIiksXG5cdFx0XHRcdFx0J3R5cGUnOiAnbnVtYmVyJyxcblx0XHRcdFx0XHQnbWluaW11bSc6IDAsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiAxMDAwXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQndGFncyc6IFsnYWNjZXNzaWJpbGl0eSddXG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNCcmVha3BvaW50Jzoge1xuXHRcdFx0Li4uc2lnbmFsRmVhdHVyZUJhc2UsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNCcmVha3BvaW50JywgXCJQbGF5cyBhIHNpZ25hbCAtIHNvdW5kIChhdWRpbyBjdWUpIGFuZC9vciBhbm5vdW5jZW1lbnQgKGFsZXJ0KSAtIHdoZW4gdGhlIGFjdGl2ZSBsaW5lIGhhcyBhIGJyZWFrcG9pbnQuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNCcmVha3BvaW50LnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gdGhlIGFjdGl2ZSBsaW5lIGhhcyBhIGJyZWFrcG9pbnQuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNCcmVha3BvaW50LmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gdGhlIGFjdGl2ZSBsaW5lIGhhcyBhIGJyZWFrcG9pbnQuXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5saW5lSGFzSW5saW5lU3VnZ2VzdGlvbic6IHtcblx0XHRcdC4uLmRlZmF1bHROb0Fubm91bmNlbWVudCxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0lubGluZVN1Z2dlc3Rpb24nLCBcIlBsYXlzIGEgc291bmQgLyBhdWRpbyBjdWUgd2hlbiB0aGUgYWN0aXZlIGxpbmUgaGFzIGFuIGlubGluZSBzdWdnZXN0aW9uLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5saW5lSGFzSW5saW5lU3VnZ2VzdGlvbi5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIHRoZSBhY3RpdmUgbGluZSBoYXMgYW4gaW5saW5lIHN1Z2dlc3Rpb24uXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2UsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiAnb2ZmJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm5leHRFZGl0U3VnZ2VzdGlvbic6IHtcblx0XHRcdC4uLnNpZ25hbEZlYXR1cmVCYXNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5uZXh0RWRpdFN1Z2dlc3Rpb24nLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgLyBhdWRpbyBjdWUgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIHdoZW4gdGhlcmUgaXMgYSBuZXh0IGVkaXQgc3VnZ2VzdGlvbi5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubmV4dEVkaXRTdWdnZXN0aW9uLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gdGhlcmUgaXMgYSBuZXh0IGVkaXQgc3VnZ2VzdGlvbi5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm5leHRFZGl0U3VnZ2VzdGlvbi5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIHRoZXJlIGlzIGEgbmV4dCBlZGl0IHN1Z2dlc3Rpb24uXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5saW5lSGFzRXJyb3InOiB7XG5cdFx0XHQuLi5zaWduYWxGZWF0dXJlQmFzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0Vycm9yJywgXCJQbGF5cyBhIHNpZ25hbCAtIHNvdW5kIChhdWRpbyBjdWUpIGFuZC9vciBhbm5vdW5jZW1lbnQgKGFsZXJ0KSAtIHdoZW4gdGhlIGFjdGl2ZSBsaW5lIGhhcyBhbiBlcnJvci5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0Vycm9yLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gdGhlIGFjdGl2ZSBsaW5lIGhhcyBhbiBlcnJvci5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0Vycm9yLmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gdGhlIGFjdGl2ZSBsaW5lIGhhcyBhbiBlcnJvci5cIiksXG5cdFx0XHRcdFx0Li4uYW5ub3VuY2VtZW50RmVhdHVyZUJhc2UsXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ29mZidcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNGb2xkZWRBcmVhJzoge1xuXHRcdFx0Li4uc2lnbmFsRmVhdHVyZUJhc2UsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNGb2xkZWRBcmVhJywgXCJQbGF5cyBhIHNpZ25hbCAtIHNvdW5kIChhdWRpbyBjdWUpIGFuZC9vciBhbm5vdW5jZW1lbnQgKGFsZXJ0KSAtIHRoZSBhY3RpdmUgbGluZSBoYXMgYSBmb2xkZWQgYXJlYSB0aGF0IGNhbiBiZSB1bmZvbGRlZC5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubGluZUhhc0ZvbGRlZEFyZWEuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiB0aGUgYWN0aXZlIGxpbmUgaGFzIGEgZm9sZGVkIGFyZWEgdGhhdCBjYW4gYmUgdW5mb2xkZWQuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2UsXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ29mZidcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmxpbmVIYXNGb2xkZWRBcmVhLmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gdGhlIGFjdGl2ZSBsaW5lIGhhcyBhIGZvbGRlZCBhcmVhIHRoYXQgY2FuIGJlIHVuZm9sZGVkLlwiKSxcblx0XHRcdFx0XHQuLi5hbm5vdW5jZW1lbnRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5saW5lSGFzV2FybmluZyc6IHtcblx0XHRcdC4uLnNpZ25hbEZlYXR1cmVCYXNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5saW5lSGFzV2FybmluZycsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIHRoZSBhY3RpdmUgbGluZSBoYXMgYSB3YXJuaW5nLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5saW5lSGFzV2FybmluZy5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIHRoZSBhY3RpdmUgbGluZSBoYXMgYSB3YXJuaW5nLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5saW5lSGFzV2FybmluZy5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIHRoZSBhY3RpdmUgbGluZSBoYXMgYSB3YXJuaW5nLlwiKSxcblx0XHRcdFx0XHQuLi5hbm5vdW5jZW1lbnRGZWF0dXJlQmFzZSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnb2ZmJ1xuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMucG9zaXRpb25IYXNFcnJvcic6IHtcblx0XHRcdC4uLnNpZ25hbEZlYXR1cmVCYXNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5wb3NpdGlvbkhhc0Vycm9yJywgXCJQbGF5cyBhIHNpZ25hbCAtIHNvdW5kIChhdWRpbyBjdWUpIGFuZC9vciBhbm5vdW5jZW1lbnQgKGFsZXJ0KSAtIHdoZW4gdGhlIGFjdGl2ZSBsaW5lIGhhcyBhIHdhcm5pbmcuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnBvc2l0aW9uSGFzRXJyb3Iuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiB0aGUgYWN0aXZlIGxpbmUgaGFzIGEgd2FybmluZy5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMucG9zaXRpb25IYXNFcnJvci5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIHRoZSBhY3RpdmUgbGluZSBoYXMgYSB3YXJuaW5nLlwiKSxcblx0XHRcdFx0XHQuLi5hbm5vdW5jZW1lbnRGZWF0dXJlQmFzZSxcblx0XHRcdFx0XHRkZWZhdWx0OiAnb24nXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5wb3NpdGlvbkhhc1dhcm5pbmcnOiB7XG5cdFx0XHQuLi5zaWduYWxGZWF0dXJlQmFzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMucG9zaXRpb25IYXNXYXJuaW5nJywgXCJQbGF5cyBhIHNpZ25hbCAtIHNvdW5kIChhdWRpbyBjdWUpIGFuZC9vciBhbm5vdW5jZW1lbnQgKGFsZXJ0KSAtIHdoZW4gdGhlIGFjdGl2ZSBsaW5lIGhhcyBhIHdhcm5pbmcuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnBvc2l0aW9uSGFzV2FybmluZy5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIHRoZSBhY3RpdmUgbGluZSBoYXMgYSB3YXJuaW5nLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5wb3NpdGlvbkhhc1dhcm5pbmcuYW5ub3VuY2VtZW50JywgXCJBbm5vdW5jZXMgd2hlbiB0aGUgYWN0aXZlIGxpbmUgaGFzIGEgd2FybmluZy5cIiksXG5cdFx0XHRcdFx0Li4uYW5ub3VuY2VtZW50RmVhdHVyZUJhc2UsXG5cdFx0XHRcdFx0ZGVmYXVsdDogJ29uJ1xuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMub25EZWJ1Z0JyZWFrJzoge1xuXHRcdFx0Li4uc2lnbmFsRmVhdHVyZUJhc2UsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm9uRGVidWdCcmVhaycsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIHRoZSBkZWJ1Z2dlciBzdG9wcGVkIG9uIGEgYnJlYWtwb2ludC5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMub25EZWJ1Z0JyZWFrLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gdGhlIGRlYnVnZ2VyIHN0b3BwZWQgb24gYSBicmVha3BvaW50LlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5vbkRlYnVnQnJlYWsuYW5ub3VuY2VtZW50JywgXCJBbm5vdW5jZXMgd2hlbiB0aGUgZGVidWdnZXIgc3RvcHBlZCBvbiBhIGJyZWFrcG9pbnQuXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm5vSW5sYXlIaW50cyc6IHtcblx0XHRcdC4uLnNpZ25hbEZlYXR1cmVCYXNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5ub0lubGF5SGludHMnLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gd2hlbiB0cnlpbmcgdG8gcmVhZCBhIGxpbmUgd2l0aCBpbmxheSBoaW50cyB0aGF0IGhhcyBubyBpbmxheSBoaW50cy5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubm9JbmxheUhpbnRzLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gdHJ5aW5nIHRvIHJlYWQgYSBsaW5lIHdpdGggaW5sYXkgaGludHMgdGhhdCBoYXMgbm8gaW5sYXkgaGludHMuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm5vSW5sYXlIaW50cy5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIHRyeWluZyB0byByZWFkIGEgbGluZSB3aXRoIGlubGF5IGhpbnRzIHRoYXQgaGFzIG5vIGlubGF5IGhpbnRzLlwiKSxcblx0XHRcdFx0XHQuLi5hbm5vdW5jZW1lbnRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy50YXNrQ29tcGxldGVkJzoge1xuXHRcdFx0Li4uc2lnbmFsRmVhdHVyZUJhc2UsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRhc2tDb21wbGV0ZWQnLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gd2hlbiBhIHRhc2sgaXMgY29tcGxldGVkLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50YXNrQ29tcGxldGVkLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gYSB0YXNrIGlzIGNvbXBsZXRlZC5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGFza0NvbXBsZXRlZC5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIGEgdGFzayBpcyBjb21wbGV0ZWQuXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRhc2tGYWlsZWQnOiB7XG5cdFx0XHQuLi5zaWduYWxGZWF0dXJlQmFzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGFza0ZhaWxlZCcsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIGEgdGFzayBmYWlscyAobm9uLXplcm8gZXhpdCBjb2RlKS5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGFza0ZhaWxlZC5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIGEgdGFzayBmYWlscyAobm9uLXplcm8gZXhpdCBjb2RlKS5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGFza0ZhaWxlZC5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIGEgdGFzayBmYWlscyAobm9uLXplcm8gZXhpdCBjb2RlKS5cIiksXG5cdFx0XHRcdFx0Li4uYW5ub3VuY2VtZW50RmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGVybWluYWxDb21tYW5kRmFpbGVkJzoge1xuXHRcdFx0Li4uc2lnbmFsRmVhdHVyZUJhc2UsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRlcm1pbmFsQ29tbWFuZEZhaWxlZCcsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIGEgdGVybWluYWwgY29tbWFuZCBmYWlscyAobm9uLXplcm8gZXhpdCBjb2RlKSBvciB3aGVuIGEgY29tbWFuZCB3aXRoIHN1Y2ggYW4gZXhpdCBjb2RlIGlzIG5hdmlnYXRlZCB0byBpbiB0aGUgYWNjZXNzaWJsZSB2aWV3LlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbENvbW1hbmRGYWlsZWQuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiBhIHRlcm1pbmFsIGNvbW1hbmQgZmFpbHMgKG5vbi16ZXJvIGV4aXQgY29kZSkgb3Igd2hlbiBhIGNvbW1hbmQgd2l0aCBzdWNoIGFuIGV4aXQgY29kZSBpcyBuYXZpZ2F0ZWQgdG8gaW4gdGhlIGFjY2Vzc2libGUgdmlldy5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGVybWluYWxDb21tYW5kRmFpbGVkLmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gYSB0ZXJtaW5hbCBjb21tYW5kIGZhaWxzIChub24temVybyBleGl0IGNvZGUpIG9yIHdoZW4gYSBjb21tYW5kIHdpdGggc3VjaCBhbiBleGl0IGNvZGUgaXMgbmF2aWdhdGVkIHRvIGluIHRoZSBhY2Nlc3NpYmxlIHZpZXcuXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRlcm1pbmFsQ29tbWFuZFN1Y2NlZWRlZCc6IHtcblx0XHRcdC4uLnNpZ25hbEZlYXR1cmVCYXNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbENvbW1hbmRTdWNjZWVkZWQnLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gd2hlbiBhIHRlcm1pbmFsIGNvbW1hbmQgc3VjY2VlZHMgKHplcm8gZXhpdCBjb2RlKSBvciB3aGVuIGEgY29tbWFuZCB3aXRoIHN1Y2ggYW4gZXhpdCBjb2RlIGlzIG5hdmlnYXRlZCB0byBpbiB0aGUgYWNjZXNzaWJsZSB2aWV3LlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbENvbW1hbmRTdWNjZWVkZWQuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiBhIHRlcm1pbmFsIGNvbW1hbmQgc3VjY2VlZHMgKHplcm8gZXhpdCBjb2RlKSBvciB3aGVuIGEgY29tbWFuZCB3aXRoIHN1Y2ggYW4gZXhpdCBjb2RlIGlzIG5hdmlnYXRlZCB0byBpbiB0aGUgYWNjZXNzaWJsZSB2aWV3LlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbENvbW1hbmRTdWNjZWVkZWQuYW5ub3VuY2VtZW50JywgXCJBbm5vdW5jZXMgd2hlbiBhIHRlcm1pbmFsIGNvbW1hbmQgc3VjY2VlZHMgKHplcm8gZXhpdCBjb2RlKSBvciB3aGVuIGEgY29tbWFuZCB3aXRoIHN1Y2ggYW4gZXhpdCBjb2RlIGlzIG5hdmlnYXRlZCB0byBpbiB0aGUgYWNjZXNzaWJsZSB2aWV3LlwiKSxcblx0XHRcdFx0XHQuLi5hbm5vdW5jZW1lbnRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbFF1aWNrRml4Jzoge1xuXHRcdFx0Li4uc2lnbmFsRmVhdHVyZUJhc2UsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRlcm1pbmFsUXVpY2tGaXgnLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gd2hlbiB0ZXJtaW5hbCBRdWljayBGaXhlcyBhcmUgYXZhaWxhYmxlLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbFF1aWNrRml4LnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gdGVybWluYWwgUXVpY2sgRml4ZXMgYXJlIGF2YWlsYWJsZS5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGVybWluYWxRdWlja0ZpeC5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIHRlcm1pbmFsIFF1aWNrIEZpeGVzIGFyZSBhdmFpbGFibGUuXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnRlcm1pbmFsQmVsbCc6IHtcblx0XHRcdC4uLnNpZ25hbEZlYXR1cmVCYXNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbEJlbGwnLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gd2hlbiB0aGUgdGVybWluYWwgYmVsbCBpcyByaW5naW5nLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbEJlbGwuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiB0aGUgdGVybWluYWwgYmVsbCBpcyByaW5naW5nLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbEJlbGwuYW5ub3VuY2VtZW50JywgXCJBbm5vdW5jZXMgd2hlbiB0aGUgdGVybWluYWwgYmVsbCBpcyByaW5naW5nLlwiKSxcblx0XHRcdFx0XHQuLi5hbm5vdW5jZW1lbnRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5kaWZmTGluZUluc2VydGVkJzoge1xuXHRcdFx0Li4uZGVmYXVsdE5vQW5ub3VuY2VtZW50LFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5kaWZmTGluZUluc2VydGVkJywgXCJQbGF5cyBhIHNvdW5kIC8gYXVkaW8gY3VlIHdoZW4gdGhlIGZvY3VzIG1vdmVzIHRvIGFuIGluc2VydGVkIGxpbmUgaW4gQWNjZXNzaWJsZSBEaWZmIFZpZXdlciBtb2RlIG9yIHRvIHRoZSBuZXh0L3ByZXZpb3VzIGNoYW5nZS5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiB0aGUgZm9jdXMgbW92ZXMgdG8gYW4gaW5zZXJ0ZWQgbGluZSBpbiBBY2Nlc3NpYmxlIERpZmYgVmlld2VyIG1vZGUgb3IgdG8gdGhlIG5leHQvcHJldmlvdXMgY2hhbmdlLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZGlmZkxpbmVNb2RpZmllZCc6IHtcblx0XHRcdC4uLmRlZmF1bHROb0Fubm91bmNlbWVudCxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZGlmZkxpbmVNb2RpZmllZCcsIFwiUGxheXMgYSBzb3VuZCAvIGF1ZGlvIGN1ZSB3aGVuIHRoZSBmb2N1cyBtb3ZlcyB0byBhbiBtb2RpZmllZCBsaW5lIGluIEFjY2Vzc2libGUgRGlmZiBWaWV3ZXIgbW9kZSBvciB0byB0aGUgbmV4dC9wcmV2aW91cyBjaGFuZ2UuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmRpZmZMaW5lTW9kaWZpZWQuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiB0aGUgZm9jdXMgbW92ZXMgdG8gYSBtb2RpZmllZCBsaW5lIGluIEFjY2Vzc2libGUgRGlmZiBWaWV3ZXIgbW9kZSBvciB0byB0aGUgbmV4dC9wcmV2aW91cyBjaGFuZ2UuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5kaWZmTGluZURlbGV0ZWQnOiB7XG5cdFx0XHQuLi5kZWZhdWx0Tm9Bbm5vdW5jZW1lbnQsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmRpZmZMaW5lRGVsZXRlZCcsIFwiUGxheXMgYSBzb3VuZCAvIGF1ZGlvIGN1ZSB3aGVuIHRoZSBmb2N1cyBtb3ZlcyB0byBhbiBkZWxldGVkIGxpbmUgaW4gQWNjZXNzaWJsZSBEaWZmIFZpZXdlciBtb2RlIG9yIHRvIHRoZSBuZXh0L3ByZXZpb3VzIGNoYW5nZS5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZGlmZkxpbmVEZWxldGVkLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gdGhlIGZvY3VzIG1vdmVzIHRvIGFuIGRlbGV0ZWQgbGluZSBpbiBBY2Nlc3NpYmxlIERpZmYgVmlld2VyIG1vZGUgb3IgdG8gdGhlIG5leHQvcHJldmlvdXMgY2hhbmdlLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdEVkaXRNb2RpZmllZEZpbGUnOiB7XG5cdFx0XHQuLi5kZWZhdWx0Tm9Bbm5vdW5jZW1lbnQsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNoYXRFZGl0TW9kaWZpZWRGaWxlJywgXCJQbGF5cyBhIHNvdW5kIC8gYXVkaW8gY3VlIHdoZW4gcmV2ZWFsaW5nIGEgZmlsZSB3aXRoIGNoYW5nZXMgZnJvbSBjaGF0IGVkaXRzXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNoYXRFZGl0TW9kaWZpZWRGaWxlLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gcmV2ZWFsaW5nIGEgZmlsZSB3aXRoIGNoYW5nZXMgZnJvbSBjaGF0IGVkaXRzXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5ub3RlYm9va0NlbGxDb21wbGV0ZWQnOiB7XG5cdFx0XHQuLi5zaWduYWxGZWF0dXJlQmFzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubm90ZWJvb2tDZWxsQ29tcGxldGVkJywgXCJQbGF5cyBhIHNpZ25hbCAtIHNvdW5kIChhdWRpbyBjdWUpIGFuZC9vciBhbm5vdW5jZW1lbnQgKGFsZXJ0KSAtIHdoZW4gYSBub3RlYm9vayBjZWxsIGV4ZWN1dGlvbiBpcyBzdWNjZXNzZnVsbHkgY29tcGxldGVkLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5ub3RlYm9va0NlbGxDb21wbGV0ZWQuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiBhIG5vdGVib29rIGNlbGwgZXhlY3V0aW9uIGlzIHN1Y2Nlc3NmdWxseSBjb21wbGV0ZWQuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm5vdGVib29rQ2VsbENvbXBsZXRlZC5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIGEgbm90ZWJvb2sgY2VsbCBleGVjdXRpb24gaXMgc3VjY2Vzc2Z1bGx5IGNvbXBsZXRlZC5cIiksXG5cdFx0XHRcdFx0Li4uYW5ub3VuY2VtZW50RmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMubm90ZWJvb2tDZWxsRmFpbGVkJzoge1xuXHRcdFx0Li4uc2lnbmFsRmVhdHVyZUJhc2UsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm5vdGVib29rQ2VsbEZhaWxlZCcsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIGEgbm90ZWJvb2sgY2VsbCBleGVjdXRpb24gZmFpbHMuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm5vdGVib29rQ2VsbEZhaWxlZC5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIGEgbm90ZWJvb2sgY2VsbCBleGVjdXRpb24gZmFpbHMuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLm5vdGVib29rQ2VsbEZhaWxlZC5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIGEgbm90ZWJvb2sgY2VsbCBleGVjdXRpb24gZmFpbHMuXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnByb2dyZXNzJzoge1xuXHRcdFx0Li4uc2lnbmFsRmVhdHVyZUJhc2UsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnByb2dyZXNzJywgXCJQbGF5cyBhIHNpZ25hbCAtIHNvdW5kIChhdWRpbyBjdWUpIGFuZC9vciBhbm5vdW5jZW1lbnQgKGFsZXJ0KSAtIG9uIGxvb3Agd2hpbGUgcHJvZ3Jlc3MgaXMgb2NjdXJyaW5nLlwiKSxcblx0XHRcdCdkZWZhdWx0Jzoge1xuXHRcdFx0XHQnc291bmQnOiAnYXV0bycsXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiAnb2ZmJ1xuXHRcdFx0fSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5wcm9ncmVzcy5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCBvbiBsb29wIHdoaWxlIHByb2dyZXNzIGlzIG9jY3VycmluZy5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMucHJvZ3Jlc3MuYW5ub3VuY2VtZW50JywgXCJBbGVydHMgb24gbG9vcCB3aGlsZSBwcm9ncmVzcyBpcyBvY2N1cnJpbmcuXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0UmVxdWVzdFNlbnQnOiB7XG5cdFx0XHQuLi5zaWduYWxGZWF0dXJlQmFzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFJlcXVlc3RTZW50JywgXCJQbGF5cyBhIHNpZ25hbCAtIHNvdW5kIChhdWRpbyBjdWUpIGFuZC9vciBhbm5vdW5jZW1lbnQgKGFsZXJ0KSAtIHdoZW4gYSBjaGF0IHJlcXVlc3QgaXMgbWFkZS5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFJlcXVlc3RTZW50LnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gYSBjaGF0IHJlcXVlc3QgaXMgbWFkZS5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFJlcXVlc3RTZW50LmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gYSBjaGF0IHJlcXVlc3QgaXMgbWFkZS5cIiksXG5cdFx0XHRcdFx0Li4uYW5ub3VuY2VtZW50RmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFJlc3BvbnNlUmVjZWl2ZWQnOiB7XG5cdFx0XHQuLi5kZWZhdWx0Tm9Bbm5vdW5jZW1lbnQsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNoYXRSZXNwb25zZVJlY2VpdmVkJywgXCJQbGF5cyBhIHNvdW5kIC8gYXVkaW8gY3VlIHdoZW4gdGhlIHJlc3BvbnNlIGhhcyBiZWVuIHJlY2VpdmVkLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0UmVzcG9uc2VSZWNlaXZlZC5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCBvbiB3aGVuIHRoZSByZXNwb25zZSBoYXMgYmVlbiByZWNlaXZlZC5cIiksXG5cdFx0XHRcdFx0Li4uc291bmRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jb2RlQWN0aW9uVHJpZ2dlcmVkJzoge1xuXHRcdFx0Li4uZGVmYXVsdE5vQW5ub3VuY2VtZW50LFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jb2RlQWN0aW9uVHJpZ2dlcmVkJywgXCJQbGF5cyBhIHNvdW5kIC8gYXVkaW8gY3VlIC0gd2hlbiBhIGNvZGUgYWN0aW9uIGhhcyBiZWVuIHRyaWdnZXJlZC5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY29kZUFjdGlvblRyaWdnZXJlZC5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIGEgY29kZSBhY3Rpb24gaGFzIGJlZW4gdHJpZ2dlcmVkLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY29kZUFjdGlvbkFwcGxpZWQnOiB7XG5cdFx0XHQuLi5kZWZhdWx0Tm9Bbm5vdW5jZW1lbnQsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNvZGVBY3Rpb25BcHBsaWVkJywgXCJQbGF5cyBhIHNvdW5kIC8gYXVkaW8gY3VlIHdoZW4gdGhlIGNvZGUgYWN0aW9uIGhhcyBiZWVuIGFwcGxpZWQuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNvZGVBY3Rpb25BcHBsaWVkLnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gdGhlIGNvZGUgYWN0aW9uIGhhcyBiZWVuIGFwcGxpZWQuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudm9pY2VSZWNvcmRpbmdTdGFydGVkJzoge1xuXHRcdFx0Li4uZGVmYXVsdE5vQW5ub3VuY2VtZW50LFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy52b2ljZVJlY29yZGluZ1N0YXJ0ZWQnLCBcIlBsYXlzIGEgc291bmQgLyBhdWRpbyBjdWUgd2hlbiB0aGUgdm9pY2UgcmVjb3JkaW5nIGhhcyBzdGFydGVkLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy52b2ljZVJlY29yZGluZ1N0YXJ0ZWQuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiB0aGUgdm9pY2UgcmVjb3JkaW5nIGhhcyBzdGFydGVkLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdCdkZWZhdWx0Jzoge1xuXHRcdFx0XHQnc291bmQnOiAnb24nXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnZvaWNlTW9kZVN0YXJ0ZWQnOiB7XG5cdFx0XHQuLi5zaWduYWxGZWF0dXJlQmFzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudm9pY2VNb2RlU3RhcnRlZCcsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIHZvaWNlIG1vZGUgaGFzIHN0YXJ0ZWQuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnZvaWNlTW9kZVN0YXJ0ZWQuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiB2b2ljZSBtb2RlIGhhcyBzdGFydGVkLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudm9pY2VNb2RlU3RhcnRlZC5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIHZvaWNlIG1vZGUgaGFzIHN0YXJ0ZWQuXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J2RlZmF1bHQnOiB7XG5cdFx0XHRcdCdzb3VuZCc6ICdvbicsXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiAnYXV0bydcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudm9pY2VSZWNvcmRpbmdTdG9wcGVkJzoge1xuXHRcdFx0Li4uZGVmYXVsdE5vQW5ub3VuY2VtZW50LFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy52b2ljZVJlY29yZGluZ1N0b3BwZWQnLCBcIlBsYXlzIGEgc291bmQgLyBhdWRpbyBjdWUgd2hlbiB0aGUgdm9pY2UgcmVjb3JkaW5nIGhhcyBzdG9wcGVkLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy52b2ljZVJlY29yZGluZ1N0b3BwZWQuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiB0aGUgdm9pY2UgcmVjb3JkaW5nIGhhcyBzdG9wcGVkLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdCdkZWZhdWx0Jzoge1xuXHRcdFx0XHQnc291bmQnOiAnb24nXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnZvaWNlTW9kZVN0b3BwZWQnOiB7XG5cdFx0XHQuLi5zaWduYWxGZWF0dXJlQmFzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudm9pY2VNb2RlU3RvcHBlZCcsIFwiUGxheXMgYSBzaWduYWwgLSBzb3VuZCAoYXVkaW8gY3VlKSBhbmQvb3IgYW5ub3VuY2VtZW50IChhbGVydCkgLSB3aGVuIHZvaWNlIG1vZGUgaGFzIHN0b3BwZWQuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnZvaWNlTW9kZVN0b3BwZWQuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiB2b2ljZSBtb2RlIGhhcyBzdG9wcGVkLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50Jzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudm9pY2VNb2RlU3RvcHBlZC5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIHZvaWNlIG1vZGUgaGFzIHN0b3BwZWQuXCIpLFxuXHRcdFx0XHRcdC4uLmFubm91bmNlbWVudEZlYXR1cmVCYXNlLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0J2RlZmF1bHQnOiB7XG5cdFx0XHRcdCdzb3VuZCc6ICdvbicsXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiAnYXV0bydcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2xlYXInOiB7XG5cdFx0XHQuLi5zaWduYWxGZWF0dXJlQmFzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2xlYXInLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gd2hlbiBhIGZlYXR1cmUgaXMgY2xlYXJlZCAoZm9yIGV4YW1wbGUsIHRoZSB0ZXJtaW5hbCwgRGVidWcgQ29uc29sZSwgb3IgT3V0cHV0IGNoYW5uZWwpLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jbGVhci5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIGEgZmVhdHVyZSBpcyBjbGVhcmVkLlwiKSxcblx0XHRcdFx0XHQuLi5zb3VuZEZlYXR1cmVCYXNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jbGVhci5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIGEgZmVhdHVyZSBpcyBjbGVhcmVkLlwiKSxcblx0XHRcdFx0XHQuLi5hbm5vdW5jZW1lbnRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZWRpdHNVbmRvbmUnOiB7XG5cdFx0XHQuLi5zaWduYWxGZWF0dXJlQmFzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZWRpdHNVbmRvbmUnLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gd2hlbiBlZGl0cyBoYXZlIGJlZW4gdW5kb25lLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5lZGl0c1VuZG9uZS5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIGVkaXRzIGhhdmUgYmVlbiB1bmRvbmUuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmVkaXRzVW5kb25lLmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gZWRpdHMgaGF2ZSBiZWVuIHVuZG9uZS5cIiksXG5cdFx0XHRcdFx0Li4uYW5ub3VuY2VtZW50RmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmVkaXRzS2VwdCc6IHtcblx0XHRcdC4uLnNpZ25hbEZlYXR1cmVCYXNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5lZGl0c0tlcHQnLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gd2hlbiBlZGl0cyBhcmUga2VwdC5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZWRpdHNLZXB0LnNvdW5kJywgXCJQbGF5cyBhIHNvdW5kIHdoZW4gZWRpdHMgYXJlIGtlcHQuXCIpLFxuXHRcdFx0XHRcdC4uLnNvdW5kRmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmVkaXRzS2VwdC5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIGVkaXRzIGFyZSBrZXB0LlwiKSxcblx0XHRcdFx0XHQuLi5hbm5vdW5jZW1lbnRGZWF0dXJlQmFzZVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuc2F2ZSc6IHtcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHQndGFncyc6IFsnYWNjZXNzaWJpbGl0eSddLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnNhdmUnLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gd2hlbiBhIGZpbGUgaXMgc2F2ZWQuXCIpLFxuXHRcdFx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdzb3VuZCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnNhdmUuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiBhIGZpbGUgaXMgc2F2ZWQuXCIpLFxuXHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0J2VudW0nOiBbJ3VzZXJHZXN0dXJlJywgJ2Fsd2F5cycsICduZXZlciddLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogJ25ldmVyJyxcblx0XHRcdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuc2F2ZS5zb3VuZC51c2VyR2VzdHVyZScsIFwiUGxheXMgdGhlIHNvdW5kIHdoZW4gYSB1c2VyIGV4cGxpY2l0bHkgc2F2ZXMgYSBmaWxlLlwiKSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuc2F2ZS5zb3VuZC5hbHdheXMnLCBcIlBsYXlzIHRoZSBzb3VuZCB3aGVuZXZlciBhIGZpbGUgaXMgc2F2ZWQsIGluY2x1ZGluZyBhdXRvIHNhdmUuXCIpLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5zYXZlLnNvdW5kLm5ldmVyJywgXCJOZXZlciBwbGF5cyB0aGUgc291bmQuXCIpXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnNhdmUuYW5ub3VuY2VtZW50JywgXCJBbm5vdW5jZXMgd2hlbiBhIGZpbGUgaXMgc2F2ZWQuXCIpLFxuXHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0J2VudW0nOiBbJ3VzZXJHZXN0dXJlJywgJ2Fsd2F5cycsICduZXZlciddLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogJ25ldmVyJyxcblx0XHRcdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuc2F2ZS5hbm5vdW5jZW1lbnQudXNlckdlc3R1cmUnLCBcIkFubm91bmNlcyB3aGVuIGEgdXNlciBleHBsaWNpdGx5IHNhdmVzIGEgZmlsZS5cIiksXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnNhdmUuYW5ub3VuY2VtZW50LmFsd2F5cycsIFwiQW5ub3VuY2VzIHdoZW5ldmVyIGEgZmlsZSBpcyBzYXZlZCwgaW5jbHVkaW5nIGF1dG8gc2F2ZS5cIiksXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnNhdmUuYW5ub3VuY2VtZW50Lm5ldmVyJywgXCJOZXZlciBwbGF5cyB0aGUgYW5ub3VuY2VtZW50LlwiKVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0ZGVmYXVsdDoge1xuXHRcdFx0XHQnc291bmQnOiAnbmV2ZXInLFxuXHRcdFx0XHQnYW5ub3VuY2VtZW50JzogJ25ldmVyJ1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuc2lnbmFscy5mb3JtYXQnOiB7XG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3RhZ3MnOiBbJ2FjY2Vzc2liaWxpdHknXSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5mb3JtYXQnLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gd2hlbiBhIGZpbGUgb3Igbm90ZWJvb2sgaXMgZm9ybWF0dGVkLlwiKSxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnc291bmQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5mb3JtYXQuc291bmQnLCBcIlBsYXlzIGEgc291bmQgd2hlbiBhIGZpbGUgb3Igbm90ZWJvb2sgaXMgZm9ybWF0dGVkLlwiKSxcblx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdCdlbnVtJzogWyd1c2VyR2VzdHVyZScsICdhbHdheXMnLCAnbmV2ZXInXSxcblx0XHRcdFx0XHQnZGVmYXVsdCc6ICduZXZlcicsXG5cdFx0XHRcdFx0J2VudW1EZXNjcmlwdGlvbnMnOiBbXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmZvcm1hdC51c2VyR2VzdHVyZScsIFwiUGxheXMgdGhlIHNvdW5kIHdoZW4gYSB1c2VyIGV4cGxpY2l0bHkgZm9ybWF0cyBhIGZpbGUuXCIpLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5mb3JtYXQuYWx3YXlzJywgXCJQbGF5cyB0aGUgc291bmQgd2hlbmV2ZXIgYSBmaWxlIGlzIGZvcm1hdHRlZCwgaW5jbHVkaW5nIGlmIGl0IGlzIHNldCB0byBmb3JtYXQgb24gc2F2ZSwgdHlwZSwgb3IsIHBhc3RlLCBvciBydW4gb2YgYSBjZWxsLlwiKSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZm9ybWF0Lm5ldmVyJywgXCJOZXZlciBwbGF5cyB0aGUgc291bmQuXCIpXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6IHtcblx0XHRcdFx0XHQnZGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmZvcm1hdC5hbm5vdW5jZW1lbnQnLCBcIkFubm91bmNlcyB3aGVuIGEgZmlsZSBvciBub3RlYm9vayBpcyBmb3JtYXR0ZWQuXCIpLFxuXHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0J2VudW0nOiBbJ3VzZXJHZXN0dXJlJywgJ2Fsd2F5cycsICduZXZlciddLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogJ25ldmVyJyxcblx0XHRcdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuZm9ybWF0LmFubm91bmNlbWVudC51c2VyR2VzdHVyZScsIFwiQW5ub3VuY2VzIHdoZW4gYSB1c2VyIGV4cGxpY2l0bHkgZm9ybWF0cyBhIGZpbGUuXCIpLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5mb3JtYXQuYW5ub3VuY2VtZW50LmFsd2F5cycsIFwiQW5ub3VuY2VzIHdoZW5ldmVyIGEgZmlsZSBpcyBmb3JtYXR0ZWQsIGluY2x1ZGluZyBpZiBpdCBpcyBzZXQgdG8gZm9ybWF0IG9uIHNhdmUsIHR5cGUsIG9yLCBwYXN0ZSwgb3IgcnVuIG9mIGEgY2VsbC5cIiksXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmZvcm1hdC5hbm5vdW5jZW1lbnQubmV2ZXInLCBcIk5ldmVyIGFubm91bmNlcy5cIilcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0J3NvdW5kJzogJ25ldmVyJyxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6ICduZXZlcidcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFVzZXJBY3Rpb25SZXF1aXJlZCc6IHtcblx0XHRcdC4uLnNpZ25hbEZlYXR1cmVCYXNlLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNoYXRVc2VyQWN0aW9uUmVxdWlyZWQnLCBcIlBsYXlzIGEgc2lnbmFsIC0gc291bmQgKGF1ZGlvIGN1ZSkgYW5kL29yIGFubm91bmNlbWVudCAoYWxlcnQpIC0gd2hlbiB1c2VyIGFjdGlvbiBpcyByZXF1aXJlZCBpbiB0aGUgY2hhdC5cIiksXG5cdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0J3NvdW5kJzoge1xuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFVzZXJBY3Rpb25SZXF1aXJlZC5zb3VuZCcsIFwiUGxheXMgYSBzb3VuZCB3aGVuIHVzZXIgYWN0aW9uIGlzIHJlcXVpcmVkIGluIHRoZSBjaGF0LlwiKSxcblx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdCdlbnVtJzogWydhdXRvJywgJ29uJywgJ29mZiddLFxuXHRcdFx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3NvdW5kLmVuYWJsZWQuYXV0b1dpbmRvdycsIFwiRW5hYmxlIHNvdW5kIHdoZW4gYSBzY3JlZW4gcmVhZGVyIGlzIGF0dGFjaGVkLlwiKSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdzb3VuZC5lbmFibGVkLm9uJywgXCJFbmFibGUgc291bmQuXCIpLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3NvdW5kLmVuYWJsZWQub2ZmJywgXCJEaXNhYmxlIHNvdW5kLlwiKVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdCdhbm5vdW5jZW1lbnQnOiB7XG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5jaGF0VXNlckFjdGlvblJlcXVpcmVkLmFubm91bmNlbWVudCcsIFwiQW5ub3VuY2VzIHdoZW4gYSB1c2VyIGFjdGlvbiBpcyByZXF1aXJlZCBpbiB0aGUgY2hhdCAtIGluY2x1ZGluZyBpbmZvcm1hdGlvbiBhYm91dCB0aGUgYWN0aW9uIGFuZCBob3cgdG8gdGFrZSBpdC5cIiksXG5cdFx0XHRcdFx0Li4uYW5ub3VuY2VtZW50RmVhdHVyZUJhc2Vcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdCdzb3VuZCc6ICdhdXRvJyxcblx0XHRcdFx0J2Fubm91bmNlbWVudCc6ICdhdXRvJ1xuXHRcdFx0fSxcblx0XHRcdHRhZ3M6IFsnYWNjZXNzaWJpbGl0eSddXG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS51bmRlcmxpbmVMaW5rcyc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkudW5kZXJsaW5lTGlua3MnLCBcIkNvbnRyb2xzIHdoZXRoZXIgbGlua3Mgc2hvdWxkIGJlIHVuZGVybGluZWQgaW4gdGhlIHdvcmtiZW5jaC5cIiksXG5cdFx0XHQnZGVmYXVsdCc6IGZhbHNlLFxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkuZGVidWdXYXRjaFZhcmlhYmxlQW5ub3VuY2VtZW50cyc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkuZGVidWdXYXRjaFZhcmlhYmxlQW5ub3VuY2VtZW50cycsIFwiQ29udHJvbHMgd2hldGhlciB2YXJpYWJsZSBjaGFuZ2VzIHNob3VsZCBiZSBhbm5vdW5jZWQgaW4gdGhlIGRlYnVnIHdhdGNoIHZpZXcuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkucmVwbEVkaXRvci5yZWFkTGFzdEV4ZWN1dGlvbk91dHB1dCc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkucmVwbEVkaXRvci5yZWFkTGFzdEV4ZWN1dGVkT3V0cHV0JywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBvdXRwdXQgZnJvbSBhbiBleGVjdXRpb24gaW4gdGhlIG5hdGl2ZSBSRVBMIHdpbGwgYmUgYW5ub3VuY2VkLlwiKSxcblx0XHRcdCdkZWZhdWx0JzogdHJ1ZSxcblx0XHR9LFxuXHRcdCdhY2Nlc3NpYmlsaXR5LnJlcGxFZGl0b3IuYXV0b0ZvY3VzUmVwbEV4ZWN1dGlvbic6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydub25lJywgJ2lucHV0JywgJ2xhc3RFeGVjdXRpb24nXSxcblx0XHRcdGRlZmF1bHQ6ICdpbnB1dCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3JlcGxFZGl0b3IuYXV0b0ZvY3VzQXBwZW5kZWRDZWxsJywgXCJDb250cm9sIHdoZXRoZXIgZm9jdXMgc2hvdWxkIGF1dG9tYXRpY2FsbHkgYmUgc2VudCB0byB0aGUgUkVQTCB3aGVuIGNvZGUgaXMgZXhlY3V0ZWQuXCIpLFxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkud2luZG93VGl0bGVPcHRpbWl6ZWQnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZWZhdWx0JzogdHJ1ZSxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkud2luZG93VGl0bGVPcHRpbWl6ZWQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIHswfSBzaG91bGQgYmUgb3B0aW1pemVkIGZvciBzY3JlZW4gcmVhZGVycyB3aGVuIGluIHNjcmVlbiByZWFkZXIgbW9kZS4gV2hlbiBlbmFibGVkLCB0aGUgd2luZG93IHRpdGxlIHdpbGwgaGF2ZSB7MX0gYXBwZW5kZWQgdG8gdGhlIGVuZC5cIiwgJ2Ajd2luZG93LnRpdGxlI2AnLCAnYGFjdGl2ZUVkaXRvclN0YXRlYCcpXG5cdFx0fSxcblx0XHQnYWNjZXNzaWJpbGl0eS5vcGVuQ2hhdEVkaXRlZEZpbGVzJzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVmYXVsdCc6IGZhbHNlLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5vcGVuQ2hhdEVkaXRlZEZpbGVzJywgXCJDb250cm9scyB3aGV0aGVyIGZpbGVzIHNob3VsZCBiZSBvcGVuZWQgd2hlbiB0aGUgY2hhdCBhZ2VudCBoYXMgYXBwbGllZCBlZGl0cyB0byB0aGVtLlwiKVxuXHRcdH0sXG5cdFx0J2FjY2Vzc2liaWxpdHkudmVyYm9zZUNoYXRQcm9ncmVzc1VwZGF0ZXMnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZWZhdWx0JzogdHJ1ZSxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2FjY2Vzc2liaWxpdHkudmVyYm9zZUNoYXRQcm9ncmVzc1VwZGF0ZXMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdmVyYm9zZSBwcm9ncmVzcyBhbm5vdW5jZW1lbnRzIHNob3VsZCBiZSBtYWRlIHdoZW4gYSBjaGF0IHJlcXVlc3QgaXMgaW4gcHJvZ3Jlc3MsIGluY2x1ZGluZyBpbmZvcm1hdGlvbiBsaWtlIHNlYXJjaGVkIHRleHQgZm9yIDxzZWFyY2ggdGVybT4gd2l0aCBYIHJlc3VsdHMsIGNyZWF0ZWQgZmlsZSA8ZmlsZV9uYW1lPiwgb3IgcmVhZCBmaWxlIDxmaWxlIHBhdGg+LlwiKVxuXHRcdH1cblx0fVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24oKSB7XG5cdGNvbnN0IHJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0cmVnaXN0cnkucmVnaXN0ZXJDb25maWd1cmF0aW9uKGNvbmZpZ3VyYXRpb24pO1xuXG5cdHJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0Li4ud29ya2JlbmNoQ29uZmlndXJhdGlvbk5vZGVCYXNlLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFtBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkLkRpbVVuZm9jdXNlZEVuYWJsZWRdOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZGltVW5mb2N1c2VkRW5hYmxlZCcsICdXaGV0aGVyIHRvIGRpbSB1bmZvY3VzZWQgZWRpdG9ycyBhbmQgdGVybWluYWxzLCB3aGljaCBtYWtlcyBpdCBtb3JlIGNsZWFyIHdoZXJlIHR5cGVkIGlucHV0IHdpbGwgZ28gdG8uIFRoaXMgd29ya3Mgd2l0aCB0aGUgbWFqb3JpdHkgb2YgZWRpdG9ycyB3aXRoIHRoZSBub3RhYmxlIGV4Y2VwdGlvbnMgb2YgdGhvc2UgdGhhdCB1dGlsaXplIGlmcmFtZXMgbGlrZSBub3RlYm9va3MgYW5kIGV4dGVuc2lvbiB3ZWJ2aWV3IGVkaXRvcnMuJyksXG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRcdHRhZ3M6IFsnYWNjZXNzaWJpbGl0eSddLFxuXHRcdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0fSxcblx0XHRcdFtBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkLkRpbVVuZm9jdXNlZE9wYWNpdHldOiB7XG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdkaW1VbmZvY3VzZWRPcGFjaXR5JywgJ1RoZSBvcGFjaXR5IGZyYWN0aW9uICgwLjIgdG8gMS4wKSB0byB1c2UgZm9yIHVuZm9jdXNlZCBlZGl0b3JzIGFuZCB0ZXJtaW5hbHMuIFRoaXMgd2lsbCBvbmx5IHRha2UgZWZmZWN0IHdoZW4gezB9IGlzIGVuYWJsZWQuJywgYFxcYCMke0FjY2Vzc2liaWxpdHlXb3JrYmVuY2hTZXR0aW5nSWQuRGltVW5mb2N1c2VkRW5hYmxlZH0jXFxgYCksXG5cdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRtaW5pbXVtOiBWaWV3RGltVW5mb2N1c2VkT3BhY2l0eVByb3BlcnRpZXMuTWluaW11bSxcblx0XHRcdFx0bWF4aW11bTogVmlld0RpbVVuZm9jdXNlZE9wYWNpdHlQcm9wZXJ0aWVzLk1heGltdW0sXG5cdFx0XHRcdGRlZmF1bHQ6IFZpZXdEaW1VbmZvY3VzZWRPcGFjaXR5UHJvcGVydGllcy5EZWZhdWx0LFxuXHRcdFx0XHR0YWdzOiBbJ2FjY2Vzc2liaWxpdHknXSxcblx0XHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdH0sXG5cdFx0XHRbQWNjZXNzaWJpbGl0eVdvcmtiZW5jaFNldHRpbmdJZC5IaWRlQWNjZXNzaWJsZVZpZXddOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS5oaWRlQWNjZXNzaWJsZVZpZXcnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIEFjY2Vzc2libGUgVmlldyBpcyBoaWRkZW4uXCIpLFxuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0XHR0YWdzOiBbJ2FjY2Vzc2liaWxpdHknXVxuXHRcdFx0fSxcblx0XHRcdFtBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkLlZlcmJvc2VDaGF0UHJvZ3Jlc3NVcGRhdGVzXToge1xuXHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnZlcmJvc2VDaGF0UHJvZ3Jlc3NVcGRhdGVzJywgXCJDb250cm9scyB3aGV0aGVyIHZlcmJvc2UgcHJvZ3Jlc3MgYW5ub3VuY2VtZW50cyBzaG91bGQgYmUgbWFkZSB3aGVuIGEgY2hhdCByZXF1ZXN0IGlzIGluIHByb2dyZXNzLCBpbmNsdWRpbmcgaW5mb3JtYXRpb24gbGlrZSBzZWFyY2hlZCB0ZXh0IGZvciA8c2VhcmNoIHRlcm0+IHdpdGggWCByZXN1bHRzLCBjcmVhdGVkIGZpbGUgPGZpbGVfbmFtZT4sIG9yIHJlYWQgZmlsZSA8ZmlsZSBwYXRoPi5cIilcblx0XHRcdH0sXG5cdFx0XHRbQWNjZXNzaWJpbGl0eVdvcmtiZW5jaFNldHRpbmdJZC5TaG93Q2hhdENoZWNrbWFya3NdOiB7XG5cdFx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0XHQnZGVmYXVsdCc6IGZhbHNlLFxuXHRcdFx0XHQndGFncyc6IFsnYWNjZXNzaWJpbGl0eSddLFxuXHRcdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LmNoYXQuc2hvd0NoZWNrbWFya3MnLCBcIkNvbnRyb2xzIHdoZXRoZXIgY2hlY2ttYXJrIGljb25zIGFyZSBzaG93biBvbiBjb21wbGV0ZWQgdG9vbCBjYWxscyBhbmQgb3RoZXIgY29sbGFwc2libGUgaXRlbXMgaW4gY2hhdCByZXNwb25zZXMuXCIpXG5cdFx0XHR9XG5cdFx0fVxuXHR9KTtcbn1cblxuZXhwb3J0IHsgQWNjZXNzaWJpbGl0eVZvaWNlU2V0dGluZ0lkIH07XG5cbmV4cG9ydCBjb25zdCBTcGVlY2hUaW1lb3V0RGVmYXVsdCA9IDA7XG5cbmV4cG9ydCBjbGFzcyBEeW5hbWljU3BlZWNoQWNjZXNzaWJpbGl0eUNvbmZpZ3VyYXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmR5bmFtaWNTcGVlY2hBY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTcGVlY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3BlZWNoU2VydmljZTogSVNwZWVjaFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LnJ1bkFuZFN1YnNjcmliZShzcGVlY2hTZXJ2aWNlLm9uRGlkQ2hhbmdlSGFzU3BlZWNoUHJvdmlkZXIsICgpID0+IHRoaXMudXBkYXRlQ29uZmlndXJhdGlvbigpKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbmZpZ3VyYXRpb24oKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnNwZWVjaFNlcnZpY2UuaGFzU3BlZWNoUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybjsgLy8gdGhlc2Ugc2V0dGluZ3MgcmVxdWlyZSBhIHNwZWVjaCBwcm92aWRlclxuXHRcdH1cblxuXHRcdGNvbnN0IGxhbmd1YWdlcyA9IHRoaXMuZ2V0TGFuZ3VhZ2VzKCk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VzU29ydGVkID0gT2JqZWN0LmtleXMobGFuZ3VhZ2VzKS5zb3J0KChsYW5nQSwgbGFuZ0IpID0+IHtcblx0XHRcdHJldHVybiBsYW5ndWFnZXNbbGFuZ0FdLm5hbWUubG9jYWxlQ29tcGFyZShsYW5ndWFnZXNbbGFuZ0JdLm5hbWUpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRcdHJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdFx0XHQuLi5hY2Nlc3NpYmlsaXR5Q29uZmlndXJhdGlvbk5vZGVCYXNlLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRbQWNjZXNzaWJpbGl0eVZvaWNlU2V0dGluZ0lkLlNwZWVjaFRpbWVvdXRdOiB7XG5cdFx0XHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgndm9pY2Uuc3BlZWNoVGltZW91dCcsIFwiVGhlIGR1cmF0aW9uIGluIG1pbGxpc2Vjb25kcyB0aGF0IHZvaWNlIHNwZWVjaCByZWNvZ25pdGlvbiByZW1haW5zIGFjdGl2ZSBhZnRlciB5b3Ugc3RvcCBzcGVha2luZy4gRm9yIGV4YW1wbGUgaW4gYSBjaGF0IHNlc3Npb24sIHRoZSB0cmFuc2NyaWJlZCB0ZXh0IGlzIHN1Ym1pdHRlZCBhdXRvbWF0aWNhbGx5IGFmdGVyIHRoZSB0aW1lb3V0IGlzIG1ldC4gU2V0IHRvIGAwYCB0byBkaXNhYmxlIHRoaXMgZmVhdHVyZS5cIiksXG5cdFx0XHRcdFx0J3R5cGUnOiAnbnVtYmVyJyxcblx0XHRcdFx0XHQnZGVmYXVsdCc6IFNwZWVjaFRpbWVvdXREZWZhdWx0LFxuXHRcdFx0XHRcdCdtaW5pbXVtJzogMCxcblx0XHRcdFx0XHQndGFncyc6IFsnYWNjZXNzaWJpbGl0eSddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdFtBY2Nlc3NpYmlsaXR5Vm9pY2VTZXR0aW5nSWQuSWdub3JlQ29kZUJsb2Nrc106IHtcblx0XHRcdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IGxvY2FsaXplKCd2b2ljZS5pZ25vcmVDb2RlQmxvY2tzJywgXCJXaGV0aGVyIHRvIGlnbm9yZSBjb2RlIHNuaXBwZXRzIGluIHRleHQtdG8tc3BlZWNoIHN5bnRoZXNpcy5cIiksXG5cdFx0XHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHRcdFx0XHQndGFncyc6IFsnYWNjZXNzaWJpbGl0eSddXG5cdFx0XHRcdH0sXG5cdFx0XHRcdFtBY2Nlc3NpYmlsaXR5Vm9pY2VTZXR0aW5nSWQuU3BlZWNoTGFuZ3VhZ2VdOiB7XG5cdFx0XHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgndm9pY2Uuc3BlZWNoTGFuZ3VhZ2UnLCBcIlRoZSBsYW5ndWFnZSB0aGF0IHRleHQtdG8tc3BlZWNoIGFuZCBzcGVlY2gtdG8tdGV4dCBzaG91bGQgdXNlLiBTZWxlY3QgYGF1dG9gIHRvIHVzZSB0aGUgY29uZmlndXJlZCBkaXNwbGF5IGxhbmd1YWdlIGlmIHBvc3NpYmxlLiBOb3RlIHRoYXQgbm90IGFsbCBkaXNwbGF5IGxhbmd1YWdlcyBtYXliZSBzdXBwb3J0ZWQgYnkgc3BlZWNoIHJlY29nbml0aW9uIGFuZCBzeW50aGVzaXplcnMuXCIpLFxuXHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHRcdFx0J2VudW0nOiBsYW5ndWFnZXNTb3J0ZWQsXG5cdFx0XHRcdFx0J2RlZmF1bHQnOiAnYXV0bycsXG5cdFx0XHRcdFx0J3RhZ3MnOiBbJ2FjY2Vzc2liaWxpdHknXSxcblx0XHRcdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IGxhbmd1YWdlc1NvcnRlZC5tYXAoa2V5ID0+IGxhbmd1YWdlc1trZXldLm5hbWUpLFxuXHRcdFx0XHRcdCdlbnVtSXRlbUxhYmVscyc6IGxhbmd1YWdlc1NvcnRlZC5tYXAoa2V5ID0+IGxhbmd1YWdlc1trZXldLm5hbWUpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdFtBY2Nlc3NpYmlsaXR5Vm9pY2VTZXR0aW5nSWQuQXV0b1N5bnRoZXNpemVdOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdFx0XHQnZW51bSc6IFsnb24nLCAnb2ZmJ10sXG5cdFx0XHRcdFx0J2VudW1EZXNjcmlwdGlvbnMnOiBbXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnYWNjZXNzaWJpbGl0eS52b2ljZS5hdXRvU3ludGhlc2l6ZS5vbicsIFwiRW5hYmxlIHRoZSBmZWF0dXJlLiBXaGVuIGEgc2NyZWVuIHJlYWRlciBpcyBlbmFibGVkLCBub3RlIHRoYXQgdGhpcyB3aWxsIGRpc2FibGUgYXJpYSB1cGRhdGVzLlwiKSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdhY2Nlc3NpYmlsaXR5LnZvaWNlLmF1dG9TeW50aGVzaXplLm9mZicsIFwiRGlzYWJsZSB0aGUgZmVhdHVyZS5cIiksXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhdXRvU3ludGhlc2l6ZScsIFwiV2hldGhlciBhIHRleHR1YWwgcmVzcG9uc2Ugc2hvdWxkIGF1dG9tYXRpY2FsbHkgYmUgcmVhZCBvdXQgYWxvdWQgd2hlbiBzcGVlY2ggd2FzIHVzZWQgYXMgaW5wdXQuIEZvciBleGFtcGxlIGluIGEgY2hhdCBzZXNzaW9uLCBhIHJlc3BvbnNlIGlzIGF1dG9tYXRpY2FsbHkgc3ludGhlc2l6ZWQgd2hlbiB2b2ljZSB3YXMgdXNlZCBhcyBjaGF0IHJlcXVlc3QuXCIpLFxuXHRcdFx0XHRcdCdkZWZhdWx0JzogJ29mZicsXG5cdFx0XHRcdFx0J3RhZ3MnOiBbJ2FjY2Vzc2liaWxpdHknXVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdldExhbmd1YWdlcygpOiB7IFtsb2NhbGU6IHN0cmluZ106IHsgbmFtZTogc3RyaW5nIH0gfSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdFsnYXV0byddOiB7XG5cdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdzcGVlY2hMYW5ndWFnZS5hdXRvJywgXCJBdXRvIChVc2UgRGlzcGxheSBMYW5ndWFnZSlcIilcblx0XHRcdH0sXG5cdFx0XHQuLi5TUEVFQ0hfTEFOR1VBR0VTXG5cdFx0fTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb25NaWdyYXRpb24pXG5cdC5yZWdpc3RlckNvbmZpZ3VyYXRpb25NaWdyYXRpb25zKFt7XG5cdFx0a2V5OiAnYXVkaW9DdWVzLnZvbHVtZScsXG5cdFx0bWlncmF0ZUZuOiAodmFsdWUsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRbJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy52b2x1bWUnLCB7IHZhbHVlIH1dLFxuXHRcdFx0XHRbJ2F1ZGlvQ3Vlcy52b2x1bWUnLCB7IHZhbHVlOiB1bmRlZmluZWQgfV1cblx0XHRcdF07XG5cdFx0fVxuXHR9XSk7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbk1pZ3JhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbk1pZ3JhdGlvbnMoW3tcblx0XHRrZXk6ICdhdWRpb0N1ZXMuZGVib3VuY2VQb3NpdGlvbkNoYW5nZXMnLFxuXHRcdG1pZ3JhdGVGbjogKHZhbHVlKSA9PiB7XG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRbJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5kZWJvdW5jZVBvc2l0aW9uQ2hhbmdlcycsIHsgdmFsdWUgfV0sXG5cdFx0XHRcdFsnYXVkaW9DdWVzLmRlYm91bmNlUG9zaXRpb25DaGFuZ2VzJywgeyB2YWx1ZTogdW5kZWZpbmVkIH1dXG5cdFx0XHRdO1xuXHRcdH1cblx0fV0pO1xuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb25NaWdyYXRpb24pXG5cdC5yZWdpc3RlckNvbmZpZ3VyYXRpb25NaWdyYXRpb25zKFt7XG5cdFx0a2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zJyxcblx0XHRtaWdyYXRlRm46ICh2YWx1ZSwgYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGRlbGF5R2VuZXJhbCA9IGdldERlbGF5c0Zyb21Db25maWcoYWNjZXNzb3IsICdnZW5lcmFsJyk7XG5cdFx0XHRjb25zdCBkZWxheUVycm9yID0gZ2V0RGVsYXlzRnJvbUNvbmZpZyhhY2Nlc3NvciwgJ2Vycm9yQXRQb3NpdGlvbicpO1xuXHRcdFx0Y29uc3QgZGVsYXlXYXJuaW5nID0gZ2V0RGVsYXlzRnJvbUNvbmZpZyhhY2Nlc3NvciwgJ3dhcm5pbmdBdFBvc2l0aW9uJyk7XG5cdFx0XHRjb25zdCB2b2x1bWUgPSBnZXRWb2x1bWVGcm9tQ29uZmlnKGFjY2Vzc29yKTtcblx0XHRcdGNvbnN0IGRlYm91bmNlUG9zaXRpb25DaGFuZ2VzID0gZ2V0RGVib3VuY2VQb3NpdGlvbkNoYW5nZXNGcm9tQ29uZmlnKGFjY2Vzc29yKTtcblx0XHRcdGNvbnN0IHJlc3VsdDogW2tleTogc3RyaW5nLCB7IHZhbHVlOiBhbnkgfV1bXSA9IFtdO1xuXHRcdFx0aWYgKCEhdm9sdW1lKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKFsnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLnZvbHVtZScsIHsgdmFsdWU6IHZvbHVtZSB9XSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoISFkZWxheUdlbmVyYWwpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goWydhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMuZXhwZXJpbWVudGFsLmRlbGF5cy5nZW5lcmFsJywgeyB2YWx1ZTogZGVsYXlHZW5lcmFsIH1dKTtcblx0XHRcdH1cblx0XHRcdGlmICghIWRlbGF5RXJyb3IpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goWydhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMuZXhwZXJpbWVudGFsLmRlbGF5cy5lcnJvckF0UG9zaXRpb24nLCB7IHZhbHVlOiBkZWxheUVycm9yIH1dKTtcblx0XHRcdH1cblx0XHRcdGlmICghIWRlbGF5V2FybmluZykge1xuXHRcdFx0XHRyZXN1bHQucHVzaChbJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy5leHBlcmltZW50YWwuZGVsYXlzLndhcm5pbmdBdFBvc2l0aW9uJywgeyB2YWx1ZTogZGVsYXlXYXJuaW5nIH1dKTtcblx0XHRcdH1cblx0XHRcdGlmICghIWRlYm91bmNlUG9zaXRpb25DaGFuZ2VzKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKFsnYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLmRlYm91bmNlUG9zaXRpb25DaGFuZ2VzJywgeyB2YWx1ZTogZGVib3VuY2VQb3NpdGlvbkNoYW5nZXMgfV0pO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnB1c2goWydhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMnLCB7IHZhbHVlOiB1bmRlZmluZWQgfV0pO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdH1dKTtcblxuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb25NaWdyYXRpb24pXG5cdC5yZWdpc3RlckNvbmZpZ3VyYXRpb25NaWdyYXRpb25zKFt7XG5cdFx0a2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLnNvdW5kcy52b2x1bWUnLFxuXHRcdG1pZ3JhdGVGbjogKHZhbHVlKSA9PiB7XG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRbJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucy52b2x1bWUnLCB7IHZhbHVlIH1dLFxuXHRcdFx0XHRbJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5zb3VuZHMudm9sdW1lJywgeyB2YWx1ZTogdW5kZWZpbmVkIH1dXG5cdFx0XHRdO1xuXHRcdH1cblx0fV0pO1xuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb25NaWdyYXRpb24pXG5cdC5yZWdpc3RlckNvbmZpZ3VyYXRpb25NaWdyYXRpb25zKFt7XG5cdFx0a2V5OiAnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmRlYm91bmNlUG9zaXRpb25DaGFuZ2VzJyxcblx0XHRtaWdyYXRlRm46ICh2YWx1ZSkgPT4ge1xuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0WydhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMuZGVib3VuY2VQb3NpdGlvbkNoYW5nZXMnLCB7IHZhbHVlIH1dLFxuXHRcdFx0XHRbJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5kZWJvdW5jZVBvc2l0aW9uQ2hhbmdlcycsIHsgdmFsdWU6IHVuZGVmaW5lZCB9XVxuXHRcdFx0XTtcblx0XHR9XG5cdH1dKTtcblxuZnVuY3Rpb24gZ2V0RGVsYXlzRnJvbUNvbmZpZyhhY2Nlc3NvcjogKGtleTogc3RyaW5nKSA9PiBhbnksIHR5cGU6ICdnZW5lcmFsJyB8ICdlcnJvckF0UG9zaXRpb24nIHwgJ3dhcm5pbmdBdFBvc2l0aW9uJyk6IHsgYW5ub3VuY2VtZW50OiBudW1iZXI7IHNvdW5kOiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBhY2Nlc3NvcihgYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLmV4cGVyaW1lbnRhbC5kZWxheXMuJHt0eXBlfWApIHx8IGFjY2Vzc29yKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMnKT8uWydleHBlcmltZW50YWwuZGVsYXlzJ10/LltgJHt0eXBlfWBdIHx8IGFjY2Vzc29yKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMnKT8uWydkZWxheXMnXT8uW2Ake3R5cGV9YF07XG59XG5cbmZ1bmN0aW9uIGdldFZvbHVtZUZyb21Db25maWcoYWNjZXNzb3I6IChrZXk6IHN0cmluZykgPT4gYW55KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGFjY2Vzc29yKCdhY2Nlc3NpYmlsaXR5LnNpZ25hbE9wdGlvbnMudm9sdW1lJykgfHwgYWNjZXNzb3IoJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucycpPy52b2x1bWUgfHwgYWNjZXNzb3IoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5zb3VuZHMudm9sdW1lJykgfHwgYWNjZXNzb3IoJ2F1ZGlvQ3Vlcy52b2x1bWUnKTtcbn1cblxuZnVuY3Rpb24gZ2V0RGVib3VuY2VQb3NpdGlvbkNoYW5nZXNGcm9tQ29uZmlnKGFjY2Vzc29yOiAoa2V5OiBzdHJpbmcpID0+IGFueSk6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBhY2Nlc3NvcignYWNjZXNzaWJpbGl0eS5zaWduYWxPcHRpb25zLmRlYm91bmNlUG9zaXRpb25DaGFuZ2VzJykgfHwgYWNjZXNzb3IoJ2FjY2Vzc2liaWxpdHkuc2lnbmFsT3B0aW9ucycpPy5kZWJvdW5jZVBvc2l0aW9uQ2hhbmdlcyB8fCBhY2Nlc3NvcignYWNjZXNzaWJpbGl0eS5zaWduYWxzLmRlYm91bmNlUG9zaXRpb25DaGFuZ2VzJykgfHwgYWNjZXNzb3IoJ2F1ZGlvQ3Vlcy5kZWJvdW5jZVBvc2l0aW9uQ2hhbmdlcycpO1xufVxuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb25NaWdyYXRpb24pXG5cdC5yZWdpc3RlckNvbmZpZ3VyYXRpb25NaWdyYXRpb25zKFt7XG5cdFx0a2V5OiBBY2Nlc3NpYmlsaXR5Vm9pY2VTZXR0aW5nSWQuQXV0b1N5bnRoZXNpemUsXG5cdFx0bWlncmF0ZUZuOiAodmFsdWU6IGJvb2xlYW4pID0+IHtcblx0XHRcdGxldCBuZXdWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHZhbHVlID09PSB0cnVlKSB7XG5cdFx0XHRcdG5ld1ZhbHVlID0gJ29uJztcblx0XHRcdH0gZWxzZSBpZiAodmFsdWUgPT09IGZhbHNlKSB7XG5cdFx0XHRcdG5ld1ZhbHVlID0gJ29mZic7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRbQWNjZXNzaWJpbGl0eVZvaWNlU2V0dGluZ0lkLkF1dG9TeW50aGVzaXplLCB7IHZhbHVlOiBuZXdWYWx1ZSB9XSxcblx0XHRcdF07XG5cdFx0fVxuXHR9XSk7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbk1pZ3JhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbk1pZ3JhdGlvbnMoW3tcblx0XHRrZXk6ICdhY2Nlc3NpYmlsaXR5LnNpZ25hbHMuY2hhdFJlc3BvbnNlUGVuZGluZycsXG5cdFx0bWlncmF0ZUZuOiAodmFsdWUsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRbJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy5wcm9ncmVzcycsIHsgdmFsdWUgfV0sXG5cdFx0XHRcdFsnYWNjZXNzaWJpbGl0eS5zaWduYWxzLmNoYXRSZXNwb25zZVBlbmRpbmcnLCB7IHZhbHVlOiB1bmRlZmluZWQgfV0sXG5cdFx0XHRdO1xuXHRcdH1cblx0fV0pO1xuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb25NaWdyYXRpb24pXG5cdC5yZWdpc3RlckNvbmZpZ3VyYXRpb25NaWdyYXRpb25zKEFjY2Vzc2liaWxpdHlTaWduYWwuYWxsQWNjZXNzaWJpbGl0eVNpZ25hbHMubWFwPENvbmZpZ3VyYXRpb25NaWdyYXRpb24gfCB1bmRlZmluZWQ+KGl0ZW0gPT4gaXRlbS5sZWdhY3lTb3VuZFNldHRpbmdzS2V5ID8gKHtcblx0XHRrZXk6IGl0ZW0ubGVnYWN5U291bmRTZXR0aW5nc0tleSxcblx0XHRtaWdyYXRlRm46IChzb3VuZCwgYWNjZXNzb3IpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzOiBDb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycyA9IFtdO1xuXHRcdFx0Y29uc3QgbGVnYWN5QW5ub3VuY2VtZW50U2V0dGluZ3NLZXkgPSBpdGVtLmxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5O1xuXHRcdFx0bGV0IGFubm91bmNlbWVudDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5KSB7XG5cdFx0XHRcdGFubm91bmNlbWVudCA9IGFjY2Vzc29yKGxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5KSA/PyB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChhbm5vdW5jZW1lbnQgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgYW5ub3VuY2VtZW50ICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdGFubm91bmNlbWVudCA9IGFubm91bmNlbWVudCA/ICdhdXRvJyA6ICdvZmYnO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycy5wdXNoKFtgJHtpdGVtLmxlZ2FjeVNvdW5kU2V0dGluZ3NLZXl9YCwgeyB2YWx1ZTogdW5kZWZpbmVkIH1dKTtcblx0XHRcdGNvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzLnB1c2goW2Ake2l0ZW0uc2V0dGluZ3NLZXl9YCwgeyB2YWx1ZTogYW5ub3VuY2VtZW50ICE9PSB1bmRlZmluZWQgPyB7IGFubm91bmNlbWVudCwgc291bmQgfSA6IHsgc291bmQgfSB9XSk7XG5cdFx0XHRyZXR1cm4gY29uZmlndXJhdGlvbktleVZhbHVlUGFpcnM7XG5cdFx0fVxuXHR9KSA6IHVuZGVmaW5lZCkuZmlsdGVyKGlzRGVmaW5lZCkpO1xuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb25NaWdyYXRpb24pXG5cdC5yZWdpc3RlckNvbmZpZ3VyYXRpb25NaWdyYXRpb25zKEFjY2Vzc2liaWxpdHlTaWduYWwuYWxsQWNjZXNzaWJpbGl0eVNpZ25hbHMuZmlsdGVyKGkgPT4gISFpLmxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5ICYmICEhaS5sZWdhY3lTb3VuZFNldHRpbmdzS2V5KS5tYXAoaXRlbSA9PiAoe1xuXHRcdGtleTogaXRlbS5sZWdhY3lBbm5vdW5jZW1lbnRTZXR0aW5nc0tleSEsXG5cdFx0bWlncmF0ZUZuOiAoYW5ub3VuY2VtZW50LCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvbktleVZhbHVlUGFpcnM6IENvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzID0gW107XG5cdFx0XHRjb25zdCBzb3VuZCA9IGFjY2Vzc29yKGl0ZW0uc2V0dGluZ3NLZXkpPy5zb3VuZCB8fCBhY2Nlc3NvcihpdGVtLmxlZ2FjeVNvdW5kU2V0dGluZ3NLZXkhKTtcblx0XHRcdGlmIChhbm5vdW5jZW1lbnQgIT09IHVuZGVmaW5lZCAmJiB0eXBlb2YgYW5ub3VuY2VtZW50ICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRhbm5vdW5jZW1lbnQgPSBhbm5vdW5jZW1lbnQgPyAnYXV0bycgOiAnb2ZmJztcblx0XHRcdH1cblx0XHRcdGNvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzLnB1c2goW2Ake2l0ZW0uc2V0dGluZ3NLZXl9YCwgeyB2YWx1ZTogYW5ub3VuY2VtZW50ICE9PSB1bmRlZmluZWQgPyB7IGFubm91bmNlbWVudCwgc291bmQgfSA6IHsgc291bmQgfSB9XSk7XG5cdFx0XHRjb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycy5wdXNoKFtgJHtpdGVtLmxlZ2FjeUFubm91bmNlbWVudFNldHRpbmdzS2V5fWAsIHsgdmFsdWU6IHVuZGVmaW5lZCB9XSk7XG5cdFx0XHRjb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycy5wdXNoKFtgJHtpdGVtLmxlZ2FjeVNvdW5kU2V0dGluZ3NLZXl9YCwgeyB2YWx1ZTogdW5kZWZpbmVkIH1dKTtcblx0XHRcdHJldHVybiBjb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycztcblx0XHR9XG5cdH0pKSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CLGtCQUE0RjtBQUN6SCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdDQUFnQyxjQUFjLDJCQUFnSDtBQUN2SyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QixnQkFBZ0Isd0JBQXdCO0FBQzlFLFNBQVMs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LEVBQ1YsV0FBVyxDQUFDLGNBQWMsYUFBYTtBQUN0QyxVQUFNLDZCQUF5RCxDQUFDO0FBQ2hFLFVBQU0sUUFBUSxTQUFTLEtBQUssV0FBVyxHQUFHLFNBQVMsU0FBUyxLQUFLLHNCQUF1QjtBQUN4RixRQUFJLGlCQUFpQixVQUFhLE9BQU8saUJBQWlCLFVBQVU7QUFDbkUscUJBQWUsZUFBZSxTQUFTO0FBQUEsSUFDeEM7QUFDQSwrQkFBMkIsS0FBSyxDQUFDLEdBQUcsS0FBSyxXQUFXLElBQUksRUFBRSxPQUFPLGlCQUFpQixTQUFZLEVBQUUsY0FBYyxNQUFNLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0FBQ3BJLCtCQUEyQixLQUFLLENBQUMsR0FBRyxLQUFLLDZCQUE2QixJQUFJLEVBQUUsT0FBTyxPQUFVLENBQUMsQ0FBQztBQUMvRiwrQkFBMkIsS0FBSyxDQUFDLEdBQUcsS0FBSyxzQkFBc0IsSUFBSSxFQUFFLE9BQU8sT0FBVSxDQUFDLENBQUM7QUFDeEYsV0FBTztBQUFBLEVBQ1I7QUFDRCxFQUFFLENBQUM7IiwKICAibmFtZXMiOiBbIkFjY2Vzc2liaWxpdHlXb3JrYmVuY2hTZXR0aW5nSWQiLCAiVmlld0RpbVVuZm9jdXNlZE9wYWNpdHlQcm9wZXJ0aWVzIiwgIkFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQiXQp9Cg==
