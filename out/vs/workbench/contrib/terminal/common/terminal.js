import { isLinux } from "../../../../base/common/platform.js";
import * as nls from "../../../../nls.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { AccessibilityCommandId } from "../../accessibility/common/accessibilityCommands.js";
import { defaultTerminalContribCommandsToSkipShell } from "../terminalContribExports.js";
const TERMINAL_VIEW_ID = "terminal";
const TERMINAL_CREATION_COMMANDS = ["workbench.action.terminal.toggleTerminal", "workbench.action.terminal.new", "workbench.action.togglePanel", "workbench.action.terminal.focus"];
const TERMINAL_CONFIG_SECTION = "terminal.integrated";
const DEFAULT_LETTER_SPACING = 0;
const MINIMUM_LETTER_SPACING = -5;
const DEFAULT_LINE_HEIGHT = isLinux ? 1.1 : 1;
const MINIMUM_FONT_WEIGHT = 1;
const MAXIMUM_FONT_WEIGHT = 1e3;
const DEFAULT_FONT_WEIGHT = "normal";
const DEFAULT_BOLD_FONT_WEIGHT = "bold";
const SUGGESTIONS_FONT_WEIGHT = ["normal", "bold", "100", "200", "300", "400", "500", "600", "700", "800", "900"];
const ITerminalProfileResolverService = createDecorator("terminalProfileResolverService");
const ITerminalProfileService = createDecorator("terminalProfileService");
const isTerminalProcessManager = (t) => typeof t.write === "function";
var ProcessState = /* @__PURE__ */ ((ProcessState2) => {
  ProcessState2[ProcessState2["Uninitialized"] = 1] = "Uninitialized";
  ProcessState2[ProcessState2["Launching"] = 2] = "Launching";
  ProcessState2[ProcessState2["Running"] = 3] = "Running";
  ProcessState2[ProcessState2["KilledDuringLaunch"] = 4] = "KilledDuringLaunch";
  ProcessState2[ProcessState2["KilledByUser"] = 5] = "KilledByUser";
  ProcessState2[ProcessState2["KilledByProcess"] = 6] = "KilledByProcess";
  return ProcessState2;
})(ProcessState || {});
const QUICK_LAUNCH_PROFILE_CHOICE = "workbench.action.terminal.profile.choice";
var TerminalCommandId = /* @__PURE__ */ ((TerminalCommandId2) => {
  TerminalCommandId2["Toggle"] = "workbench.action.terminal.toggleTerminal";
  TerminalCommandId2["Kill"] = "workbench.action.terminal.kill";
  TerminalCommandId2["KillViewOrEditor"] = "workbench.action.terminal.killViewOrEditor";
  TerminalCommandId2["KillEditor"] = "workbench.action.terminal.killEditor";
  TerminalCommandId2["KillActiveTab"] = "workbench.action.terminal.killActiveTab";
  TerminalCommandId2["KillAll"] = "workbench.action.terminal.killAll";
  TerminalCommandId2["QuickKill"] = "workbench.action.terminal.quickKill";
  TerminalCommandId2["ConfigureTerminalSettings"] = "workbench.action.terminal.openSettings";
  TerminalCommandId2["ShellIntegrationLearnMore"] = "workbench.action.terminal.learnMore";
  TerminalCommandId2["CopyLastCommand"] = "workbench.action.terminal.copyLastCommand";
  TerminalCommandId2["CopyLastCommandOutput"] = "workbench.action.terminal.copyLastCommandOutput";
  TerminalCommandId2["CopyLastCommandAndLastCommandOutput"] = "workbench.action.terminal.copyLastCommandAndLastCommandOutput";
  TerminalCommandId2["CopyAndClearSelection"] = "workbench.action.terminal.copyAndClearSelection";
  TerminalCommandId2["CopySelection"] = "workbench.action.terminal.copySelection";
  TerminalCommandId2["CopySelectionAsHtml"] = "workbench.action.terminal.copySelectionAsHtml";
  TerminalCommandId2["SelectAll"] = "workbench.action.terminal.selectAll";
  TerminalCommandId2["DeleteWordLeft"] = "workbench.action.terminal.deleteWordLeft";
  TerminalCommandId2["DeleteWordRight"] = "workbench.action.terminal.deleteWordRight";
  TerminalCommandId2["DeleteToLineStart"] = "workbench.action.terminal.deleteToLineStart";
  TerminalCommandId2["MoveToLineStart"] = "workbench.action.terminal.moveToLineStart";
  TerminalCommandId2["MoveToLineEnd"] = "workbench.action.terminal.moveToLineEnd";
  TerminalCommandId2["New"] = "workbench.action.terminal.new";
  TerminalCommandId2["NewWithCwd"] = "workbench.action.terminal.newWithCwd";
  TerminalCommandId2["NewLocal"] = "workbench.action.terminal.newLocal";
  TerminalCommandId2["NewInActiveWorkspace"] = "workbench.action.terminal.newInActiveWorkspace";
  TerminalCommandId2["NewWithProfile"] = "workbench.action.terminal.newWithProfile";
  TerminalCommandId2["Split"] = "workbench.action.terminal.split";
  TerminalCommandId2["SplitActiveTab"] = "workbench.action.terminal.splitActiveTab";
  TerminalCommandId2["SplitInActiveWorkspace"] = "workbench.action.terminal.splitInActiveWorkspace";
  TerminalCommandId2["Unsplit"] = "workbench.action.terminal.unsplit";
  TerminalCommandId2["JoinActiveTab"] = "workbench.action.terminal.joinActiveTab";
  TerminalCommandId2["Join"] = "workbench.action.terminal.join";
  TerminalCommandId2["Relaunch"] = "workbench.action.terminal.relaunch";
  TerminalCommandId2["FocusPreviousPane"] = "workbench.action.terminal.focusPreviousPane";
  TerminalCommandId2["CreateTerminalEditor"] = "workbench.action.createTerminalEditor";
  TerminalCommandId2["CreateTerminalEditorSameGroup"] = "workbench.action.createTerminalEditorSameGroup";
  TerminalCommandId2["CreateTerminalEditorSide"] = "workbench.action.createTerminalEditorSide";
  TerminalCommandId2["FocusTabs"] = "workbench.action.terminal.focusTabs";
  TerminalCommandId2["FocusNextPane"] = "workbench.action.terminal.focusNextPane";
  TerminalCommandId2["ResizePaneLeft"] = "workbench.action.terminal.resizePaneLeft";
  TerminalCommandId2["ResizePaneRight"] = "workbench.action.terminal.resizePaneRight";
  TerminalCommandId2["ResizePaneUp"] = "workbench.action.terminal.resizePaneUp";
  TerminalCommandId2["SizeToContentWidth"] = "workbench.action.terminal.sizeToContentWidth";
  TerminalCommandId2["SizeToContentWidthActiveTab"] = "workbench.action.terminal.sizeToContentWidthActiveTab";
  TerminalCommandId2["ResizePaneDown"] = "workbench.action.terminal.resizePaneDown";
  TerminalCommandId2["Focus"] = "workbench.action.terminal.focus";
  TerminalCommandId2["FocusInstance"] = "workbench.action.terminal.focusInstance";
  TerminalCommandId2["FocusNext"] = "workbench.action.terminal.focusNext";
  TerminalCommandId2["FocusPrevious"] = "workbench.action.terminal.focusPrevious";
  TerminalCommandId2["Paste"] = "workbench.action.terminal.paste";
  TerminalCommandId2["PastePwsh"] = "workbench.action.terminal.pastePwsh";
  TerminalCommandId2["PasteSelection"] = "workbench.action.terminal.pasteSelection";
  TerminalCommandId2["SelectDefaultProfile"] = "workbench.action.terminal.selectDefaultShell";
  TerminalCommandId2["RunSelectedText"] = "workbench.action.terminal.runSelectedText";
  TerminalCommandId2["RunActiveFile"] = "workbench.action.terminal.runActiveFile";
  TerminalCommandId2["SwitchTerminal"] = "workbench.action.terminal.switchTerminal";
  TerminalCommandId2["ScrollDownLine"] = "workbench.action.terminal.scrollDown";
  TerminalCommandId2["ScrollDownPage"] = "workbench.action.terminal.scrollDownPage";
  TerminalCommandId2["ScrollToBottom"] = "workbench.action.terminal.scrollToBottom";
  TerminalCommandId2["ScrollUpLine"] = "workbench.action.terminal.scrollUp";
  TerminalCommandId2["ScrollUpPage"] = "workbench.action.terminal.scrollUpPage";
  TerminalCommandId2["ScrollToTop"] = "workbench.action.terminal.scrollToTop";
  TerminalCommandId2["Clear"] = "workbench.action.terminal.clear";
  TerminalCommandId2["ClearSelection"] = "workbench.action.terminal.clearSelection";
  TerminalCommandId2["ChangeIcon"] = "workbench.action.terminal.changeIcon";
  TerminalCommandId2["ChangeIconActiveTab"] = "workbench.action.terminal.changeIconActiveTab";
  TerminalCommandId2["ChangeColor"] = "workbench.action.terminal.changeColor";
  TerminalCommandId2["ChangeColorActiveTab"] = "workbench.action.terminal.changeColorActiveTab";
  TerminalCommandId2["Rename"] = "workbench.action.terminal.rename";
  TerminalCommandId2["RenameActiveTab"] = "workbench.action.terminal.renameActiveTab";
  TerminalCommandId2["RenameWithArgs"] = "workbench.action.terminal.renameWithArg";
  TerminalCommandId2["ScrollToPreviousCommand"] = "workbench.action.terminal.scrollToPreviousCommand";
  TerminalCommandId2["ScrollToNextCommand"] = "workbench.action.terminal.scrollToNextCommand";
  TerminalCommandId2["SelectToPreviousCommand"] = "workbench.action.terminal.selectToPreviousCommand";
  TerminalCommandId2["SelectToNextCommand"] = "workbench.action.terminal.selectToNextCommand";
  TerminalCommandId2["SelectToPreviousLine"] = "workbench.action.terminal.selectToPreviousLine";
  TerminalCommandId2["SelectToNextLine"] = "workbench.action.terminal.selectToNextLine";
  TerminalCommandId2["SendSequence"] = "workbench.action.terminal.sendSequence";
  TerminalCommandId2["SendSignal"] = "workbench.action.terminal.sendSignal";
  TerminalCommandId2["AttachToSession"] = "workbench.action.terminal.attachToSession";
  TerminalCommandId2["DetachSession"] = "workbench.action.terminal.detachSession";
  TerminalCommandId2["MoveToEditor"] = "workbench.action.terminal.moveToEditor";
  TerminalCommandId2["MoveToTerminalPanel"] = "workbench.action.terminal.moveToTerminalPanel";
  TerminalCommandId2["MoveIntoNewWindow"] = "workbench.action.terminal.moveIntoNewWindow";
  TerminalCommandId2["NewInNewWindow"] = "workbench.action.terminal.newInNewWindow";
  TerminalCommandId2["SetDimensions"] = "workbench.action.terminal.setDimensions";
  TerminalCommandId2["FocusHover"] = "workbench.action.terminal.focusHover";
  TerminalCommandId2["ShowEnvironmentContributions"] = "workbench.action.terminal.showEnvironmentContributions";
  TerminalCommandId2["StartVoice"] = "workbench.action.terminal.startVoice";
  TerminalCommandId2["StopVoice"] = "workbench.action.terminal.stopVoice";
  TerminalCommandId2["RevealCommand"] = "workbench.action.terminal.revealCommand";
  return TerminalCommandId2;
})(TerminalCommandId || {});
const DEFAULT_COMMANDS_TO_SKIP_SHELL = [
  "workbench.action.terminal.clearSelection" /* ClearSelection */,
  "workbench.action.terminal.clear" /* Clear */,
  "workbench.action.terminal.copyAndClearSelection" /* CopyAndClearSelection */,
  "workbench.action.terminal.copySelection" /* CopySelection */,
  "workbench.action.terminal.copySelectionAsHtml" /* CopySelectionAsHtml */,
  "workbench.action.terminal.copyLastCommand" /* CopyLastCommand */,
  "workbench.action.terminal.copyLastCommandOutput" /* CopyLastCommandOutput */,
  "workbench.action.terminal.copyLastCommandAndLastCommandOutput" /* CopyLastCommandAndLastCommandOutput */,
  "workbench.action.terminal.deleteToLineStart" /* DeleteToLineStart */,
  "workbench.action.terminal.deleteWordLeft" /* DeleteWordLeft */,
  "workbench.action.terminal.deleteWordRight" /* DeleteWordRight */,
  "workbench.action.terminal.focusNextPane" /* FocusNextPane */,
  "workbench.action.terminal.focusNext" /* FocusNext */,
  "workbench.action.terminal.focusPreviousPane" /* FocusPreviousPane */,
  "workbench.action.terminal.focusPrevious" /* FocusPrevious */,
  "workbench.action.terminal.focus" /* Focus */,
  "workbench.action.terminal.sizeToContentWidth" /* SizeToContentWidth */,
  "workbench.action.terminal.kill" /* Kill */,
  "workbench.action.terminal.killEditor" /* KillEditor */,
  "workbench.action.terminal.moveToEditor" /* MoveToEditor */,
  "workbench.action.terminal.moveToLineEnd" /* MoveToLineEnd */,
  "workbench.action.terminal.moveToLineStart" /* MoveToLineStart */,
  "workbench.action.terminal.moveToTerminalPanel" /* MoveToTerminalPanel */,
  "workbench.action.terminal.newInActiveWorkspace" /* NewInActiveWorkspace */,
  "workbench.action.terminal.new" /* New */,
  "workbench.action.terminal.newInNewWindow" /* NewInNewWindow */,
  "workbench.action.terminal.paste" /* Paste */,
  "workbench.action.terminal.pastePwsh" /* PastePwsh */,
  "workbench.action.terminal.pasteSelection" /* PasteSelection */,
  "workbench.action.terminal.resizePaneDown" /* ResizePaneDown */,
  "workbench.action.terminal.resizePaneLeft" /* ResizePaneLeft */,
  "workbench.action.terminal.resizePaneRight" /* ResizePaneRight */,
  "workbench.action.terminal.resizePaneUp" /* ResizePaneUp */,
  "workbench.action.terminal.runActiveFile" /* RunActiveFile */,
  "workbench.action.terminal.runSelectedText" /* RunSelectedText */,
  "workbench.action.terminal.scrollDown" /* ScrollDownLine */,
  "workbench.action.terminal.scrollDownPage" /* ScrollDownPage */,
  "workbench.action.terminal.scrollToBottom" /* ScrollToBottom */,
  "workbench.action.terminal.scrollToNextCommand" /* ScrollToNextCommand */,
  "workbench.action.terminal.scrollToPreviousCommand" /* ScrollToPreviousCommand */,
  "workbench.action.terminal.scrollToTop" /* ScrollToTop */,
  "workbench.action.terminal.scrollUp" /* ScrollUpLine */,
  "workbench.action.terminal.scrollUpPage" /* ScrollUpPage */,
  "workbench.action.terminal.sendSequence" /* SendSequence */,
  "workbench.action.terminal.selectAll" /* SelectAll */,
  "workbench.action.terminal.selectToNextCommand" /* SelectToNextCommand */,
  "workbench.action.terminal.selectToNextLine" /* SelectToNextLine */,
  "workbench.action.terminal.selectToPreviousCommand" /* SelectToPreviousCommand */,
  "workbench.action.terminal.selectToPreviousLine" /* SelectToPreviousLine */,
  "workbench.action.terminal.splitInActiveWorkspace" /* SplitInActiveWorkspace */,
  "workbench.action.terminal.split" /* Split */,
  "workbench.action.terminal.toggleTerminal" /* Toggle */,
  "workbench.action.terminal.focusHover" /* FocusHover */,
  AccessibilityCommandId.OpenAccessibilityHelp,
  "workbench.action.terminal.stopVoice" /* StopVoice */,
  "workbench.action.terminal.sendSignal" /* SendSignal */,
  "workbench.action.tasks.rerunForActiveTerminal",
  "editor.action.toggleTabFocusMode",
  "notifications.hideList",
  "notifications.hideToasts",
  "workbench.action.closeQuickOpen",
  "workbench.action.quickOpen",
  "workbench.action.quickOpenPreviousEditor",
  "workbench.action.showCommands",
  "workbench.action.tasks.build",
  "workbench.action.tasks.restartTask",
  "workbench.action.tasks.runTask",
  "workbench.action.tasks.reRunTask",
  "workbench.action.tasks.showLog",
  "workbench.action.tasks.showTasks",
  "workbench.action.tasks.terminate",
  "workbench.action.tasks.test",
  "workbench.action.toggleFullScreen",
  "workbench.action.terminal.focusAtIndex1",
  "workbench.action.terminal.focusAtIndex2",
  "workbench.action.terminal.focusAtIndex3",
  "workbench.action.terminal.focusAtIndex4",
  "workbench.action.terminal.focusAtIndex5",
  "workbench.action.terminal.focusAtIndex6",
  "workbench.action.terminal.focusAtIndex7",
  "workbench.action.terminal.focusAtIndex8",
  "workbench.action.terminal.focusAtIndex9",
  "workbench.action.focusSecondEditorGroup",
  "workbench.action.focusThirdEditorGroup",
  "workbench.action.focusFourthEditorGroup",
  "workbench.action.focusFifthEditorGroup",
  "workbench.action.focusSixthEditorGroup",
  "workbench.action.focusSeventhEditorGroup",
  "workbench.action.focusEighthEditorGroup",
  "workbench.action.focusNextPart",
  "workbench.action.focusPreviousPart",
  "workbench.action.nextPanelView",
  "workbench.action.previousPanelView",
  "workbench.action.nextSideBarView",
  "workbench.action.previousSideBarView",
  "workbench.action.debug.disconnect",
  "workbench.action.debug.start",
  "workbench.action.debug.stop",
  "workbench.action.debug.run",
  "workbench.action.debug.restart",
  "workbench.action.debug.continue",
  "workbench.action.debug.pause",
  "workbench.action.debug.stepInto",
  "workbench.action.debug.stepOut",
  "workbench.action.debug.stepOver",
  "sessions.goBack",
  "sessions.goForward",
  "sessions.focusActiveSession",
  "sessions.focusSessionInGrid1",
  "sessions.focusSessionInGrid2",
  "sessions.focusSessionInGrid3",
  "sessions.focusSessionInGrid4",
  "sessions.focusSessionInGrid5",
  "sessions.focusSessionInGrid6",
  "sessions.focusSessionInGrid7",
  "sessions.focusSessionInGrid8",
  "sessions.focusSessionInGrid9",
  "sessionsViewPane.navigatePreviousSession",
  "sessionsViewPane.navigateNextSession",
  "workbench.action.nextEditor",
  "workbench.action.previousEditor",
  "workbench.action.nextEditorInGroup",
  "workbench.action.previousEditorInGroup",
  "workbench.action.openNextRecentlyUsedEditor",
  "workbench.action.openPreviousRecentlyUsedEditor",
  "workbench.action.openNextRecentlyUsedEditorInGroup",
  "workbench.action.openPreviousRecentlyUsedEditorInGroup",
  "workbench.action.quickOpenPreviousRecentlyUsedEditor",
  "workbench.action.quickOpenLeastRecentlyUsedEditor",
  "workbench.action.quickOpenPreviousRecentlyUsedEditorInGroup",
  "workbench.action.quickOpenLeastRecentlyUsedEditorInGroup",
  "workbench.action.focusActiveEditorGroup",
  "workbench.action.focusFirstEditorGroup",
  "workbench.action.focusLastEditorGroup",
  "workbench.action.firstEditorInGroup",
  "workbench.action.lastEditorInGroup",
  "workbench.action.navigateUp",
  "workbench.action.navigateDown",
  "workbench.action.navigateRight",
  "workbench.action.navigateLeft",
  "workbench.action.togglePanel",
  "workbench.action.quickOpenView",
  "workbench.action.toggleMaximizedPanel",
  "workbench.action.zoomIn",
  "workbench.action.zoomOut",
  "workbench.action.zoomReset",
  "notification.acceptPrimaryAction",
  "runCommands",
  "workbench.action.terminal.chat.start",
  "workbench.action.terminal.chat.close",
  "workbench.action.terminal.chat.discard",
  "workbench.action.terminal.chat.makeRequest",
  "workbench.action.terminal.chat.cancel",
  "workbench.action.terminal.chat.feedbackHelpful",
  "workbench.action.terminal.chat.feedbackUnhelpful",
  "workbench.action.terminal.chat.feedbackReportIssue",
  "workbench.action.terminal.chat.runCommand",
  "workbench.action.terminal.chat.insertCommand",
  "workbench.action.terminal.chat.viewInChat",
  ...defaultTerminalContribCommandsToSkipShell
];
const terminalContributionsDescriptor = {
  extensionPoint: "terminal",
  defaultExtensionKind: ["workspace"],
  activationEventsGenerator: function* (contribs) {
    for (const contrib of contribs) {
      for (const profileContrib of contrib.profiles ?? []) {
        yield `onTerminalProfile:${profileContrib.id}`;
      }
    }
  },
  jsonSchema: {
    description: nls.localize("vscode.extension.contributes.terminal", "Contributes terminal functionality."),
    type: "object",
    properties: {
      profiles: {
        type: "array",
        description: nls.localize("vscode.extension.contributes.terminal.profiles", "Defines additional terminal profiles that the user can create."),
        items: {
          type: "object",
          required: ["id", "title"],
          defaultSnippets: [{
            body: {
              id: "$1",
              title: "$2"
            }
          }],
          properties: {
            id: {
              description: nls.localize("vscode.extension.contributes.terminal.profiles.id", "The ID of the terminal profile provider."),
              type: "string"
            },
            title: {
              description: nls.localize("vscode.extension.contributes.terminal.profiles.title", "Title for this terminal profile."),
              type: "string"
            },
            icon: {
              description: nls.localize("vscode.extension.contributes.terminal.types.icon", "A codicon, URI, or light and dark URIs to associate with this terminal type."),
              anyOf: [
                {
                  type: "string"
                },
                {
                  type: "object",
                  properties: {
                    light: {
                      description: nls.localize("vscode.extension.contributes.terminal.types.icon.light", "Icon path when a light theme is used"),
                      type: "string"
                    },
                    dark: {
                      description: nls.localize("vscode.extension.contributes.terminal.types.icon.dark", "Icon path when a dark theme is used"),
                      type: "string"
                    }
                  }
                }
              ]
            },
            titleTemplate: {
              description: nls.localize("vscode.extension.contributes.terminal.profiles.titleTemplate", "A title template string for the terminal tab. Supports variables like ${sequence}, ${process}, ${cwd}, etc. Overrides the default terminal.integrated.tabs.title setting for terminals created with this profile."),
              type: "string"
            }
          }
        }
      },
      completionProviders: {
        type: "array",
        description: nls.localize("vscode.extension.contributes.terminal.completionProviders", "Defines terminal completion providers that will be registered when the extension activates."),
        items: {
          type: "object",
          required: ["id"],
          defaultSnippets: [{
            body: {
              id: "$1",
              description: "$2"
            }
          }],
          properties: {
            description: {
              description: nls.localize("vscode.extension.contributes.terminal.completionProviders.description", "A description of what the completion provider does. This will be shown in the settings UI."),
              type: "string"
            }
          }
        }
      }
    }
  }
};
export {
  DEFAULT_BOLD_FONT_WEIGHT,
  DEFAULT_COMMANDS_TO_SKIP_SHELL,
  DEFAULT_FONT_WEIGHT,
  DEFAULT_LETTER_SPACING,
  DEFAULT_LINE_HEIGHT,
  ITerminalProfileResolverService,
  ITerminalProfileService,
  MAXIMUM_FONT_WEIGHT,
  MINIMUM_FONT_WEIGHT,
  MINIMUM_LETTER_SPACING,
  ProcessState,
  QUICK_LAUNCH_PROFILE_CHOICE,
  SUGGESTIONS_FONT_WEIGHT,
  TERMINAL_CONFIG_SECTION,
  TERMINAL_CREATION_COMMANDS,
  TERMINAL_VIEW_ID,
  TerminalCommandId,
  isTerminalProcessManager,
  terminalContributionsDescriptor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWFyc2hhbGxlZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFyc2hhbGxpbmdJZHMuanMnO1xuaW1wb3J0IHsgSVByb2Nlc3NFbnZpcm9ubWVudCwgaXNMaW51eCwgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTZXJpYWxpemVkQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHksIElUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY2FwYWJpbGl0aWVzLmpzJztcbmltcG9ydCB7IElNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlLmpzJztcbmltcG9ydCB7IElDcmVhdGVDb250cmlidXRlZFRlcm1pbmFsUHJvZmlsZU9wdGlvbnMsIElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGUsIElGaXhlZFRlcm1pbmFsRGltZW5zaW9ucywgSVRlcm1pbmFsTGF1bmNoUmVzdWx0LCBJUHJvY2Vzc0RhdGFFdmVudCwgSVByb2Nlc3NQcm9wZXJ0eSwgSVByb2Nlc3NQcm9wZXJ0eU1hcCwgSVByb2Nlc3NSZWFkeUV2ZW50LCBJUHJvY2Vzc1JlYWR5V2luZG93c1B0eSwgSVNoZWxsTGF1bmNoQ29uZmlnLCBJVGVybWluYWxCYWNrZW5kLCBJVGVybWluYWxDb250cmlidXRpb25zLCBJVGVybWluYWxFbnZpcm9ubWVudCwgSVRlcm1pbmFsTGF1bmNoRXJyb3IsIElUZXJtaW5hbFByb2ZpbGUsIElUZXJtaW5hbFByb2ZpbGVPYmplY3QsIElUZXJtaW5hbFRhYkFjdGlvbiwgUHJvY2Vzc1Byb3BlcnR5VHlwZSwgVGVybWluYWxJY29uLCBUZXJtaW5hbExvY2F0aW9uQ29uZmlnVmFsdWUsIFRpdGxlRXZlbnRTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vdGVybWluYWwuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eUNvbW1hbmRJZCB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHlDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRWYXJpYWJsZUluZm8gfSBmcm9tICcuL2Vudmlyb25tZW50VmFyaWFibGUuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblBvaW50RGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0VGVybWluYWxDb250cmliQ29tbWFuZHNUb1NraXBTaGVsbCB9IGZyb20gJy4uL3Rlcm1pbmFsQ29udHJpYkV4cG9ydHMuanMnO1xuaW1wb3J0IHR5cGUgeyBTaW5nbGVPck1hbnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5cbmV4cG9ydCBjb25zdCBURVJNSU5BTF9WSUVXX0lEID0gJ3Rlcm1pbmFsJztcblxuZXhwb3J0IGNvbnN0IFRFUk1JTkFMX0NSRUFUSU9OX0NPTU1BTkRTID0gWyd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnRvZ2dsZVRlcm1pbmFsJywgJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwubmV3JywgJ3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlUGFuZWwnLCAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1cyddO1xuXG5leHBvcnQgY29uc3QgVEVSTUlOQUxfQ09ORklHX1NFQ1RJT04gPSAndGVybWluYWwuaW50ZWdyYXRlZCc7XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0xFVFRFUl9TUEFDSU5HID0gMDtcbmV4cG9ydCBjb25zdCBNSU5JTVVNX0xFVFRFUl9TUEFDSU5HID0gLTU7XG4vLyBIQUNLOiBPbiBMaW51eCBpdCdzIGNvbW1vbiBmb3IgZm9udHMgdG8gaW5jbHVkZSBhbiB1bmRlcmxpbmUgdGhhdCBpcyByZW5kZXJlZCBsb3dlciB0aGFuIHRoZVxuLy8gYm90dG9tIG9mIHRoZSBjZWxsIHdoaWNoIGNhdXNlcyBpdCB0byBiZSBjdXQgb2ZmIGR1ZSB0byBgb3ZlcmZsb3c6aGlkZGVuYCBpbiB0aGUgRE9NIHJlbmRlcmVyLlxuLy8gU2VlOlxuLy8gLSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjExOTMzXG4vLyAtIGh0dHBzOi8vZ2l0aHViLmNvbS94dGVybWpzL3h0ZXJtLmpzL2lzc3Vlcy80MDY3XG5leHBvcnQgY29uc3QgREVGQVVMVF9MSU5FX0hFSUdIVCA9IGlzTGludXggPyAxLjEgOiAxO1xuXG5leHBvcnQgY29uc3QgTUlOSU1VTV9GT05UX1dFSUdIVCA9IDE7XG5leHBvcnQgY29uc3QgTUFYSU1VTV9GT05UX1dFSUdIVCA9IDEwMDA7XG5leHBvcnQgY29uc3QgREVGQVVMVF9GT05UX1dFSUdIVCA9ICdub3JtYWwnO1xuZXhwb3J0IGNvbnN0IERFRkFVTFRfQk9MRF9GT05UX1dFSUdIVCA9ICdib2xkJztcbmV4cG9ydCBjb25zdCBTVUdHRVNUSU9OU19GT05UX1dFSUdIVCA9IFsnbm9ybWFsJywgJ2JvbGQnLCAnMTAwJywgJzIwMCcsICczMDAnLCAnNDAwJywgJzUwMCcsICc2MDAnLCAnNzAwJywgJzgwMCcsICc5MDAnXTtcblxuZXhwb3J0IGNvbnN0IElUZXJtaW5hbFByb2ZpbGVSZXNvbHZlclNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVRlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZT4oJ3Rlcm1pbmFsUHJvZmlsZVJlc29sdmVyU2VydmljZScpO1xuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxQcm9maWxlUmVzb2x2ZXJTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGRlZmF1bHRQcm9maWxlTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0aGUgaWNvbiBvZiBhIHNoZWxsIGxhdW5jaCBjb25maWcgaWYgdGhpcyB3aWxsIHVzZSB0aGUgZGVmYXVsdCBwcm9maWxlXG5cdCAqL1xuXHRyZXNvbHZlSWNvbihzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnLCBvczogT3BlcmF0aW5nU3lzdGVtKTogdm9pZDtcblx0cmVzb2x2ZVNoZWxsTGF1bmNoQ29uZmlnKHNoZWxsTGF1bmNoQ29uZmlnOiBJU2hlbGxMYXVuY2hDb25maWcsIG9wdGlvbnM6IElTaGVsbExhdW5jaENvbmZpZ1Jlc29sdmVPcHRpb25zKTogUHJvbWlzZTx2b2lkPjtcblx0Z2V0RGVmYXVsdFByb2ZpbGUob3B0aW9uczogSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPElUZXJtaW5hbFByb2ZpbGU+O1xuXHRnZXREZWZhdWx0U2hlbGwob3B0aW9uczogSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPHN0cmluZz47XG5cdGdldERlZmF1bHRTaGVsbEFyZ3Mob3B0aW9uczogSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMpOiBQcm9taXNlPFNpbmdsZU9yTWFueTxzdHJpbmc+Pjtcblx0Z2V0RGVmYXVsdEljb24oKTogVGVybWluYWxJY29uICYgVGhlbWVJY29uO1xuXHRnZXRFbnZpcm9ubWVudChyZW1vdGVBdXRob3JpdHk6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVByb2Nlc3NFbnZpcm9ubWVudD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlZ2lzdGVyQ29udHJpYnV0ZWRQcm9maWxlQXJncyB7XG5cdGV4dGVuc2lvbklkZW50aWZpZXI6IHN0cmluZzsgaWQ6IHN0cmluZzsgdGl0bGU6IHN0cmluZzsgb3B0aW9uczogSUNyZWF0ZUNvbnRyaWJ1dGVkVGVybWluYWxQcm9maWxlT3B0aW9uczsgdGl0bGVUZW1wbGF0ZT86IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElUZXJtaW5hbFByb2ZpbGVTZXJ2aWNlPigndGVybWluYWxQcm9maWxlU2VydmljZScpO1xuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxQcm9maWxlU2VydmljZSB7XG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgYXZhaWxhYmxlUHJvZmlsZXM6IElUZXJtaW5hbFByb2ZpbGVbXTtcblx0cmVhZG9ubHkgY29udHJpYnV0ZWRQcm9maWxlczogSUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZVtdO1xuXHRyZWFkb25seSBwcm9maWxlc1JlYWR5OiBQcm9taXNlPHZvaWQ+O1xuXHRnZXRQbGF0Zm9ybUtleSgpOiBQcm9taXNlPHN0cmluZz47XG5cdHJlZnJlc2hBdmFpbGFibGVQcm9maWxlcygpOiB2b2lkO1xuXHRnZXREZWZhdWx0UHJvZmlsZU5hbWUoKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXREZWZhdWx0UHJvZmlsZShvcz86IE9wZXJhdGluZ1N5c3RlbSk6IElUZXJtaW5hbFByb2ZpbGUgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXZhaWxhYmxlUHJvZmlsZXM6IEV2ZW50PElUZXJtaW5hbFByb2ZpbGVbXT47XG5cdGdldENvbnRyaWJ1dGVkRGVmYXVsdFByb2ZpbGUoc2hlbGxMYXVuY2hDb25maWc6IElTaGVsbExhdW5jaENvbmZpZyk6IFByb21pc2U8SUV4dGVuc2lvblRlcm1pbmFsUHJvZmlsZSB8IHVuZGVmaW5lZD47XG5cdHJlZ2lzdGVyQ29udHJpYnV0ZWRQcm9maWxlKGFyZ3M6IElSZWdpc3RlckNvbnRyaWJ1dGVkUHJvZmlsZUFyZ3MpOiBQcm9taXNlPHZvaWQ+O1xuXHRyZWdpc3RlckludGVybmFsQ29udHJpYnV0ZWRQcm9maWxlKHByb2ZpbGU6IElFeHRlbnNpb25UZXJtaW5hbFByb2ZpbGUpOiBJRGlzcG9zYWJsZTtcblx0Z2V0Q29udHJpYnV0ZWRQcm9maWxlUHJvdmlkZXIoZXh0ZW5zaW9uSWRlbnRpZmllcjogc3RyaW5nLCBpZDogc3RyaW5nKTogSVRlcm1pbmFsUHJvZmlsZVByb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHRyZWdpc3RlclRlcm1pbmFsUHJvZmlsZVByb3ZpZGVyKGV4dGVuc2lvbklkZW50aWZpZXI6IHN0cmluZywgaWQ6IHN0cmluZywgcHJvZmlsZVByb3ZpZGVyOiBJVGVybWluYWxQcm9maWxlUHJvdmlkZXIpOiBJRGlzcG9zYWJsZTtcblx0LyoqXG5cdCAqIE92ZXJyaWRlcyB0aGUgZGVmYXVsdCBjb250cmlidXRlZCB0ZXJtaW5hbCBwcm9maWxlLiBXaGVuIHNldCxcblx0ICoge0BsaW5rIGdldENvbnRyaWJ1dGVkRGVmYXVsdFByb2ZpbGV9IHJldHVybnMgdGhlIG1hdGNoaW5nIHByb2ZpbGVcblx0ICogcmVnYXJkbGVzcyBvZiB0aGUgdXNlcidzIGNvbmZpZ3VyYXRpb24uIERpc3Bvc2UgdGhlIHJldHVybmVkXG5cdCAqIGRpc3Bvc2FibGUgdG8gcmVtb3ZlIHRoZSBvdmVycmlkZS5cblx0ICovXG5cdG92ZXJyaWRlRGVmYXVsdFByb2ZpbGUoZXh0ZW5zaW9uSWRlbnRpZmllcjogc3RyaW5nLCBpZDogc3RyaW5nKTogSURpc3Bvc2FibGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlcm1pbmFsUHJvZmlsZVByb3ZpZGVyIHtcblx0Y3JlYXRlQ29udHJpYnV0ZWRUZXJtaW5hbFByb2ZpbGUob3B0aW9uczogSUNyZWF0ZUNvbnRyaWJ1dGVkVGVybWluYWxQcm9maWxlT3B0aW9ucyk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNoZWxsTGF1bmNoQ29uZmlnUmVzb2x2ZU9wdGlvbnMge1xuXHRyZW1vdGVBdXRob3JpdHk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0b3M6IE9wZXJhdGluZ1N5c3RlbTtcblx0YWxsb3dBdXRvbWF0aW9uU2hlbGw/OiBib29sZWFuO1xuXHRhbGxvd0FnZW50SG9zdFNoZWxsPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IHR5cGUgRm9udFdlaWdodCA9ICdub3JtYWwnIHwgJ2JvbGQnIHwgbnVtYmVyO1xuXG5leHBvcnQgaW50ZXJmYWNlIElUZXJtaW5hbFByb2ZpbGVzIHtcblx0bGludXg6IHsgW2tleTogc3RyaW5nXTogSVRlcm1pbmFsUHJvZmlsZU9iamVjdCB9O1xuXHRvc3g6IHsgW2tleTogc3RyaW5nXTogSVRlcm1pbmFsUHJvZmlsZU9iamVjdCB9O1xuXHR3aW5kb3dzOiB7IFtrZXk6IHN0cmluZ106IElUZXJtaW5hbFByb2ZpbGVPYmplY3QgfTtcbn1cblxuZXhwb3J0IHR5cGUgQ29uZmlybU9uS2lsbCA9ICduZXZlcicgfCAnYWx3YXlzJyB8ICdlZGl0b3InIHwgJ3BhbmVsJztcbmV4cG9ydCB0eXBlIENvbmZpcm1PbkV4aXQgPSAnbmV2ZXInIHwgJ2Fsd2F5cycgfCAnaGFzQ2hpbGRQcm9jZXNzZXMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDb21wbGV0ZVRlcm1pbmFsQ29uZmlndXJhdGlvbiB7XG5cdCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVudi53aW5kb3dzJzogSVRlcm1pbmFsRW52aXJvbm1lbnQ7XG5cdCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVudi5vc3gnOiBJVGVybWluYWxFbnZpcm9ubWVudDtcblx0J3Rlcm1pbmFsLmludGVncmF0ZWQuZW52LmxpbnV4JzogSVRlcm1pbmFsRW52aXJvbm1lbnQ7XG5cdCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmN3ZCc6IHN0cmluZztcblx0J3Rlcm1pbmFsLmludGVncmF0ZWQuZGV0ZWN0TG9jYWxlJzogJ2F1dG8nIHwgJ29mZicgfCAnb24nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUZXJtaW5hbENvbmZpZ3VyYXRpb24ge1xuXHRzaGVsbDoge1xuXHRcdGxpbnV4OiBzdHJpbmcgfCBudWxsO1xuXHRcdG9zeDogc3RyaW5nIHwgbnVsbDtcblx0XHR3aW5kb3dzOiBzdHJpbmcgfCBudWxsO1xuXHR9O1xuXHRhdXRvbWF0aW9uU2hlbGw6IHtcblx0XHRsaW51eDogc3RyaW5nIHwgbnVsbDtcblx0XHRvc3g6IHN0cmluZyB8IG51bGw7XG5cdFx0d2luZG93czogc3RyaW5nIHwgbnVsbDtcblx0fTtcblx0c2hlbGxBcmdzOiB7XG5cdFx0bGludXg6IHN0cmluZ1tdO1xuXHRcdG9zeDogc3RyaW5nW107XG5cdFx0d2luZG93czogc3RyaW5nW107XG5cdH07XG5cdHByb2ZpbGVzOiBJVGVybWluYWxQcm9maWxlcztcblx0ZGVmYXVsdFByb2ZpbGU6IHtcblx0XHRsaW51eDogc3RyaW5nIHwgbnVsbDtcblx0XHRvc3g6IHN0cmluZyB8IG51bGw7XG5cdFx0d2luZG93czogc3RyaW5nIHwgbnVsbDtcblx0fTtcblx0dXNlV3NsUHJvZmlsZXM6IGJvb2xlYW47XG5cdGFsdENsaWNrTW92ZXNDdXJzb3I6IGJvb2xlYW47XG5cdG1hY09wdGlvbklzTWV0YTogYm9vbGVhbjtcblx0bWFjT3B0aW9uQ2xpY2tGb3JjZXNTZWxlY3Rpb246IGJvb2xlYW47XG5cdGdwdUFjY2VsZXJhdGlvbjogJ2F1dG8nIHwgJ29uJyB8ICdvZmYnO1xuXHRyaWdodENsaWNrQmVoYXZpb3I6ICdkZWZhdWx0JyB8ICdjb3B5UGFzdGUnIHwgJ3Bhc3RlJyB8ICdzZWxlY3RXb3JkJyB8ICdub3RoaW5nJztcblx0bWlkZGxlQ2xpY2tCZWhhdmlvcjogJ2RlZmF1bHQnIHwgJ3Bhc3RlJztcblx0Y3Vyc29yQmxpbmtpbmc6IGJvb2xlYW47XG5cdHRleHRCbGlua2luZzogYm9vbGVhbjtcblx0Y3Vyc29yU3R5bGU6ICdibG9jaycgfCAndW5kZXJsaW5lJyB8ICdsaW5lJztcblx0Y3Vyc29yU3R5bGVJbmFjdGl2ZTogJ291dGxpbmUnIHwgJ2Jsb2NrJyB8ICd1bmRlcmxpbmUnIHwgJ2xpbmUnIHwgJ25vbmUnO1xuXHRjdXJzb3JXaWR0aDogbnVtYmVyO1xuXHRkcmF3Qm9sZFRleHRJbkJyaWdodENvbG9yczogYm9vbGVhbjtcblx0ZmFzdFNjcm9sbFNlbnNpdGl2aXR5OiBudW1iZXI7XG5cdGZvbnRGYW1pbHk6IHN0cmluZztcblx0Zm9udFdlaWdodDogRm9udFdlaWdodDtcblx0Zm9udFdlaWdodEJvbGQ6IEZvbnRXZWlnaHQ7XG5cdG1pbmltdW1Db250cmFzdFJhdGlvOiBudW1iZXI7XG5cdG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eTogbnVtYmVyO1xuXHR0YWJTdG9wV2lkdGg6IG51bWJlcjtcblx0c2VuZEtleWJpbmRpbmdzVG9TaGVsbDogYm9vbGVhbjtcblx0Zm9udFNpemU6IG51bWJlcjtcblx0bGV0dGVyU3BhY2luZzogbnVtYmVyO1xuXHRsaW5lSGVpZ2h0OiBudW1iZXI7XG5cdGRldGVjdExvY2FsZTogJ2F1dG8nIHwgJ29mZicgfCAnb24nO1xuXHRzY3JvbGxiYWNrOiBudW1iZXI7XG5cdGNvbW1hbmRzVG9Ta2lwU2hlbGw6IHN0cmluZ1tdO1xuXHRhbGxvd0Nob3JkczogYm9vbGVhbjtcblx0YWxsb3dNbmVtb25pY3M6IGJvb2xlYW47XG5cdGN3ZDogc3RyaW5nO1xuXHRjb25maXJtT25FeGl0OiBDb25maXJtT25FeGl0O1xuXHRjb25maXJtT25LaWxsOiBDb25maXJtT25LaWxsO1xuXHRlbmFibGVCZWxsOiBib29sZWFuO1xuXHRlbnY6IHtcblx0XHRsaW51eDogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfTtcblx0XHRvc3g6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH07XG5cdFx0d2luZG93czogeyBba2V5OiBzdHJpbmddOiBzdHJpbmcgfTtcblx0fTtcblx0ZW52aXJvbm1lbnRDaGFuZ2VzUmVsYXVuY2g6IGJvb2xlYW47XG5cdHNob3dFeGl0QWxlcnQ6IGJvb2xlYW47XG5cdHNwbGl0Q3dkOiAnd29ya3NwYWNlUm9vdCcgfCAnaW5pdGlhbCcgfCAnaW5oZXJpdGVkJztcblx0d2luZG93c1VzZUNvbnB0eURsbD86IGJvb2xlYW47XG5cdHdvcmRTZXBhcmF0b3JzOiBzdHJpbmc7XG5cdGVuYWJsZUZpbGVMaW5rczogJ29mZicgfCAnb24nIHwgJ25vdFJlbW90ZSc7XG5cdGFsbG93ZWRMaW5rU2NoZW1lczogc3RyaW5nW107XG5cdHVuaWNvZGVWZXJzaW9uOiAnNicgfCAnMTEnO1xuXHRlbmFibGVQZXJzaXN0ZW50U2Vzc2lvbnM6IGJvb2xlYW47XG5cdHRhYnM6IHtcblx0XHRlbmFibGVkOiBib29sZWFuO1xuXHRcdGhpZGVDb25kaXRpb246ICduZXZlcicgfCAnc2luZ2xlVGVybWluYWwnIHwgJ3NpbmdsZUdyb3VwJztcblx0XHRzaG93QWN0aXZlVGVybWluYWw6ICdhbHdheXMnIHwgJ3NpbmdsZVRlcm1pbmFsJyB8ICdzaW5nbGVUZXJtaW5hbE9yTmFycm93JyB8ICdzaW5nbGVHcm91cCcgfCAnbmV2ZXInO1xuXHRcdGxvY2F0aW9uOiAnbGVmdCcgfCAncmlnaHQnO1xuXHRcdGZvY3VzTW9kZTogJ3NpbmdsZUNsaWNrJyB8ICdkb3VibGVDbGljayc7XG5cdFx0dGl0bGU6IHN0cmluZztcblx0XHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRcdHNlcGFyYXRvcjogc3RyaW5nO1xuXHRcdGFsbG93QWdlbnRDbGlUaXRsZTogYm9vbGVhbjtcblx0fTtcblx0YmVsbER1cmF0aW9uOiBudW1iZXI7XG5cdGRlZmF1bHRMb2NhdGlvbjogVGVybWluYWxMb2NhdGlvbkNvbmZpZ1ZhbHVlO1xuXHRjdXN0b21HbHlwaHM6IGJvb2xlYW47XG5cdHBlcnNpc3RlbnRTZXNzaW9uUmV2aXZlUHJvY2VzczogJ29uRXhpdCcgfCAnb25FeGl0QW5kV2luZG93Q2xvc2UnIHwgJ25ldmVyJztcblx0aWdub3JlUHJvY2Vzc05hbWVzOiBzdHJpbmdbXTtcblx0c2hlbGxJbnRlZ3JhdGlvbj86IHtcblx0XHRlbmFibGVkOiBib29sZWFuO1xuXHRcdGRlY29yYXRpb25zRW5hYmxlZDogJ2JvdGgnIHwgJ2d1dHRlcicgfCAnb3ZlcnZpZXdSdWxlcicgfCAnbmV2ZXInO1xuXHR9O1xuXHRlbmFibGVJbWFnZXM6IGJvb2xlYW47XG5cdHNtb290aFNjcm9sbGluZzogYm9vbGVhbjtcblx0aWdub3JlQnJhY2tldGVkUGFzdGVNb2RlOiBib29sZWFuO1xuXHRyZXNjYWxlT3ZlcmxhcHBpbmdHbHlwaHM6IGJvb2xlYW47XG5cdGVuYWJsZUtpdHR5S2V5Ym9hcmRQcm90b2NvbDogYm9vbGVhbjtcblx0ZW5hYmxlV2luMzJJbnB1dE1vZGU6IGJvb2xlYW47XG5cdGZvbnRMaWdhdHVyZXM/OiB7XG5cdFx0ZW5hYmxlZDogYm9vbGVhbjtcblx0XHRmZWF0dXJlU2V0dGluZ3M6IHN0cmluZztcblx0XHRmYWxsYmFja0xpZ2F0dXJlczogc3RyaW5nW107XG5cdH07XG5cdGhpZGVPbkxhc3RDbG9zZWQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlcm1pbmFsRm9udCB7XG5cdGZvbnRGYW1pbHk6IHN0cmluZztcblx0Zm9udFNpemU6IG51bWJlcjtcblx0bGV0dGVyU3BhY2luZzogbnVtYmVyO1xuXHRsaW5lSGVpZ2h0OiBudW1iZXI7XG5cdGNoYXJXaWR0aD86IG51bWJlcjtcblx0Y2hhckhlaWdodD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVtb3RlVGVybWluYWxBdHRhY2hUYXJnZXQge1xuXHRpZDogbnVtYmVyO1xuXHRwaWQ6IG51bWJlcjtcblx0dGl0bGU6IHN0cmluZztcblx0dGl0bGVTb3VyY2U6IFRpdGxlRXZlbnRTb3VyY2U7XG5cdGN3ZDogc3RyaW5nO1xuXHR3b3Jrc3BhY2VJZDogc3RyaW5nO1xuXHR3b3Jrc3BhY2VOYW1lOiBzdHJpbmc7XG5cdGlzT3JwaGFuOiBib29sZWFuO1xuXHRpY29uOiBVUkkgfCB7IGxpZ2h0OiBVUkk7IGRhcms6IFVSSSB9IHwgeyBpZDogc3RyaW5nOyBjb2xvcj86IHsgaWQ6IHN0cmluZyB9IH0gfCB1bmRlZmluZWQ7XG5cdGNvbG9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGZpeGVkRGltZW5zaW9uczogSUZpeGVkVGVybWluYWxEaW1lbnNpb25zIHwgdW5kZWZpbmVkO1xuXHRzaGVsbEludGVncmF0aW9uTm9uY2U6IHN0cmluZztcblx0dGFiQWN0aW9ucz86IElUZXJtaW5hbFRhYkFjdGlvbltdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElCZWZvcmVQcm9jZXNzRGF0YUV2ZW50IHtcblx0LyoqXG5cdCAqIFRoZSBkYXRhIG9mIHRoZSBldmVudCwgdGhpcyBjYW4gYmUgbW9kaWZpZWQgYnkgdGhlIGV2ZW50IGxpc3RlbmVyIHRvIGNoYW5nZSB3aGF0IGdldHMgc2VudFxuXHQgKiB0byB0aGUgdGVybWluYWwuXG5cdCAqL1xuXHRkYXRhOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURlZmF1bHRTaGVsbEFuZEFyZ3NSZXF1ZXN0IHtcblx0dXNlQXV0b21hdGlvblNoZWxsOiBib29sZWFuO1xuXHRjYWxsYmFjazogKHNoZWxsOiBzdHJpbmcsIGFyZ3M6IHN0cmluZ1tdIHwgc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiB2b2lkO1xufVxuXG4vKiogUmVhZC1vbmx5IHByb2Nlc3MgaW5mb3JtYXRpb24gdGhhdCBjYW4gYXBwbHkgdG8gZGV0YWNoZWQgdGVybWluYWxzLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxQcm9jZXNzSW5mbyB7XG5cdHJlYWRvbmx5IHByb2Nlc3NTdGF0ZTogUHJvY2Vzc1N0YXRlO1xuXHRyZWFkb25seSBwdHlQcm9jZXNzUmVhZHk6IFByb21pc2U8dm9pZD47XG5cdHJlYWRvbmx5IHNoZWxsUHJvY2Vzc0lkOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHJlbW90ZUF1dGhvcml0eTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvczogT3BlcmF0aW5nU3lzdGVtIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSB1c2VySG9tZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBpbml0aWFsQ3dkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGVudmlyb25tZW50VmFyaWFibGVJbmZvOiBJRW52aXJvbm1lbnRWYXJpYWJsZUluZm8gfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHBlcnNpc3RlbnRQcm9jZXNzSWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc2hvdWxkUGVyc2lzdDogYm9vbGVhbjtcblx0cmVhZG9ubHkgaGFzV3JpdHRlbkRhdGE6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGhhc0NoaWxkUHJvY2Vzc2VzOiBib29sZWFuO1xuXHRyZWFkb25seSBiYWNrZW5kOiBJVGVybWluYWxCYWNrZW5kIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBjYXBhYmlsaXRpZXM6IElUZXJtaW5hbENhcGFiaWxpdHlTdG9yZTtcblx0cmVhZG9ubHkgc2hlbGxJbnRlZ3JhdGlvbk5vbmNlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV4dEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uOiBJTWVyZ2VkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24gfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBjb25zdCBpc1Rlcm1pbmFsUHJvY2Vzc01hbmFnZXIgPSAodDogSVRlcm1pbmFsUHJvY2Vzc0luZm8gfCBJVGVybWluYWxQcm9jZXNzTWFuYWdlcik6IHQgaXMgSVRlcm1pbmFsUHJvY2Vzc01hbmFnZXIgPT4gdHlwZW9mICh0IGFzIElUZXJtaW5hbFByb2Nlc3NNYW5hZ2VyKS53cml0ZSA9PT0gJ2Z1bmN0aW9uJztcblxuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxQcm9jZXNzTWFuYWdlciBleHRlbmRzIElEaXNwb3NhYmxlLCBJVGVybWluYWxQcm9jZXNzSW5mbyB7XG5cdHJlYWRvbmx5IHByb2Nlc3NUcmFpdHM6IElQcm9jZXNzUmVhZHlFdmVudCB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcHJvY2Vzc1JlYWR5VGltZXN0YW1wOiBudW1iZXI7XG5cblx0cmVhZG9ubHkgb25QdHlEaXNjb25uZWN0OiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25QdHlSZWNvbm5lY3Q6IEV2ZW50PHZvaWQ+O1xuXG5cdHJlYWRvbmx5IG9uUHJvY2Vzc1JlYWR5OiBFdmVudDxJUHJvY2Vzc1JlYWR5RXZlbnQ+O1xuXHRyZWFkb25seSBvbkJlZm9yZVByb2Nlc3NEYXRhOiBFdmVudDxJQmVmb3JlUHJvY2Vzc0RhdGFFdmVudD47XG5cdHJlYWRvbmx5IG9uUHJvY2Vzc0RhdGE6IEV2ZW50PElQcm9jZXNzRGF0YUV2ZW50Pjtcblx0cmVhZG9ubHkgb25Qcm9jZXNzUmVwbGF5Q29tcGxldGU6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvbkVudmlyb25tZW50VmFyaWFibGVJbmZvQ2hhbmdlZDogRXZlbnQ8SUVudmlyb25tZW50VmFyaWFibGVJbmZvPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQcm9wZXJ0eTogRXZlbnQ8SVByb2Nlc3NQcm9wZXJ0eT47XG5cdHJlYWRvbmx5IG9uUHJvY2Vzc0V4aXQ6IEV2ZW50PG51bWJlciB8IHVuZGVmaW5lZD47XG5cdHJlYWRvbmx5IG9uUmVzdG9yZUNvbW1hbmRzOiBFdmVudDxJU2VyaWFsaXplZENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5PjtcblxuXHRkaXNwb3NlKGltbWVkaWF0ZT86IGJvb2xlYW4pOiB2b2lkO1xuXHRkZXRhY2hGcm9tUHJvY2Vzcyhmb3JjZVBlcnNpc3Q/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPjtcblx0Y3JlYXRlUHJvY2VzcyhzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnLCBjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlcik6IFByb21pc2U8SVRlcm1pbmFsTGF1bmNoRXJyb3IgfCBJVGVybWluYWxMYXVuY2hSZXN1bHQgfCB1bmRlZmluZWQ+O1xuXHRyZWxhdW5jaChzaGVsbExhdW5jaENvbmZpZzogSVNoZWxsTGF1bmNoQ29uZmlnLCBjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlciwgcmVzZXQ6IGJvb2xlYW4pOiBQcm9taXNlPElUZXJtaW5hbExhdW5jaEVycm9yIHwgSVRlcm1pbmFsTGF1bmNoUmVzdWx0IHwgdW5kZWZpbmVkPjtcblx0d3JpdGUoZGF0YTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPjtcblx0c2VuZFNpZ25hbChzaWduYWw6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cdHNldERpbWVuc2lvbnMoY29sczogbnVtYmVyLCByb3dzOiBudW1iZXIsIHN5bmM/OiB1bmRlZmluZWQsIHBpeGVsV2lkdGg/OiBudW1iZXIsIHBpeGVsSGVpZ2h0PzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPjtcblx0c2V0RGltZW5zaW9ucyhjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlciwgc3luYzogZmFsc2UsIHBpeGVsV2lkdGg/OiBudW1iZXIsIHBpeGVsSGVpZ2h0PzogbnVtYmVyKTogUHJvbWlzZTx2b2lkPjtcblx0c2V0RGltZW5zaW9ucyhjb2xzOiBudW1iZXIsIHJvd3M6IG51bWJlciwgc3luYzogdHJ1ZSwgcGl4ZWxXaWR0aD86IG51bWJlciwgcGl4ZWxIZWlnaHQ/OiBudW1iZXIpOiB2b2lkO1xuXHRjbGVhckJ1ZmZlcigpOiBQcm9taXNlPHZvaWQ+O1xuXHRzZXRVbmljb2RlVmVyc2lvbih2ZXJzaW9uOiAnNicgfCAnMTEnKTogUHJvbWlzZTx2b2lkPjtcblx0c2V0TmV4dENvbW1hbmRJZChjb21tYW5kTGluZTogc3RyaW5nLCBjb21tYW5kSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG5cdGFja25vd2xlZGdlRGF0YUV2ZW50KGNoYXJDb3VudDogbnVtYmVyKTogdm9pZDtcblx0cHJvY2Vzc0JpbmFyeShkYXRhOiBzdHJpbmcpOiB2b2lkO1xuXG5cdHJlZnJlc2hQcm9wZXJ0eTxUIGV4dGVuZHMgUHJvY2Vzc1Byb3BlcnR5VHlwZT4odHlwZTogVCk6IFByb21pc2U8SVByb2Nlc3NQcm9wZXJ0eU1hcFtUXT47XG5cdHVwZGF0ZVByb3BlcnR5PFQgZXh0ZW5kcyBQcm9jZXNzUHJvcGVydHlUeXBlPihwcm9wZXJ0eTogVCwgdmFsdWU6IElQcm9jZXNzUHJvcGVydHlNYXBbVF0pOiBQcm9taXNlPHZvaWQ+O1xuXHRnZXRCYWNrZW5kT1MoKTogUHJvbWlzZTxPcGVyYXRpbmdTeXN0ZW0+O1xuXHRmcmVlUG9ydEtpbGxQcm9jZXNzKHBvcnQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD47XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFByb2Nlc3NTdGF0ZSB7XG5cdC8vIFRoZSBwcm9jZXNzIGhhcyBub3QgYmVlbiBpbml0aWFsaXplZCB5ZXQuXG5cdFVuaW5pdGlhbGl6ZWQgPSAxLFxuXHQvLyBUaGUgcHJvY2VzcyBpcyBjdXJyZW50bHkgbGF1bmNoaW5nLCB0aGUgcHJvY2VzcyBpcyBtYXJrZWQgYXMgbGF1bmNoaW5nXG5cdC8vIGZvciBhIHNob3J0IGR1cmF0aW9uIGFmdGVyIGJlaW5nIGNyZWF0ZWQgYW5kIGlzIGhlbHBmdWwgdG8gaW5kaWNhdGVcblx0Ly8gd2hldGhlciB0aGUgcHJvY2VzcyBkaWVkIGFzIGEgcmVzdWx0IG9mIGJhZCBzaGVsbCBhbmQgYXJncy5cblx0TGF1bmNoaW5nID0gMixcblx0Ly8gVGhlIHByb2Nlc3MgaXMgcnVubmluZyBub3JtYWxseS5cblx0UnVubmluZyA9IDMsXG5cdC8vIFRoZSBwcm9jZXNzIHdhcyBraWxsZWQgZHVyaW5nIGxhdW5jaCwgbGlrZWx5IGFzIGEgcmVzdWx0IG9mIGJhZCBzaGVsbCBhbmRcblx0Ly8gYXJncy5cblx0S2lsbGVkRHVyaW5nTGF1bmNoID0gNCxcblx0Ly8gVGhlIHByb2Nlc3Mgd2FzIGtpbGxlZCBieSB0aGUgdXNlciAodGhlIGV2ZW50IG9yaWdpbmF0ZWQgZnJvbSBWUyBDb2RlKS5cblx0S2lsbGVkQnlVc2VyID0gNSxcblx0Ly8gVGhlIHByb2Nlc3Mgd2FzIGtpbGxlZCBieSBpdHNlbGYsIGZvciBleGFtcGxlIHRoZSBzaGVsbCBjcmFzaGVkIG9yIGBleGl0YFxuXHQvLyB3YXMgcnVuLlxuXHRLaWxsZWRCeVByb2Nlc3MgPSA2XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlcm1pbmFsUHJvY2Vzc0V4dEhvc3RQcm94eSBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgaW5zdGFuY2VJZDogbnVtYmVyO1xuXG5cdGVtaXREYXRhKGRhdGE6IHN0cmluZyk6IHZvaWQ7XG5cdGVtaXRQcm9jZXNzUHJvcGVydHkocHJvcGVydHk6IElQcm9jZXNzUHJvcGVydHkpOiB2b2lkO1xuXHRlbWl0UmVhZHkocGlkOiBudW1iZXIsIGN3ZDogc3RyaW5nLCB3aW5kb3dzUHR5OiBJUHJvY2Vzc1JlYWR5V2luZG93c1B0eSB8IHVuZGVmaW5lZCk6IHZvaWQ7XG5cdGVtaXRFeGl0KGV4aXRDb2RlOiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkO1xuXG5cdHJlYWRvbmx5IG9uSW5wdXQ6IEV2ZW50PHN0cmluZz47XG5cdHJlYWRvbmx5IG9uQmluYXJ5OiBFdmVudDxzdHJpbmc+O1xuXHRyZWFkb25seSBvblJlc2l6ZTogRXZlbnQ8eyBjb2xzOiBudW1iZXI7IHJvd3M6IG51bWJlciB9Pjtcblx0cmVhZG9ubHkgb25BY2tub3dsZWRnZURhdGFFdmVudDogRXZlbnQ8bnVtYmVyPjtcblx0cmVhZG9ubHkgb25TaHV0ZG93bjogRXZlbnQ8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IG9uUmVxdWVzdEluaXRpYWxDd2Q6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvblJlcXVlc3RDd2Q6IEV2ZW50PHZvaWQ+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTdGFydEV4dGVuc2lvblRlcm1pbmFsUmVxdWVzdCB7XG5cdHByb3h5OiBJVGVybWluYWxQcm9jZXNzRXh0SG9zdFByb3h5O1xuXHRjb2xzOiBudW1iZXI7XG5cdHJvd3M6IG51bWJlcjtcblx0Y2FsbGJhY2s6IChlcnJvcjogSVRlcm1pbmFsTGF1bmNoRXJyb3IgfCB1bmRlZmluZWQpID0+IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRlcm1pbmFsU3RhdHVzIHtcblx0LyoqIEFuIGludGVybmFsIHN0cmluZyBJRCB1c2VkIHRvIGlkZW50aWZ5IHRoZSBzdGF0dXMuICovXG5cdGlkOiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBUaGUgc2V2ZXJpdHkgb2YgdGhlIHN0YXR1cywgdGhpcyBkZWZpbmVzIGJvdGggdGhlIGNvbG9yIGFuZCBob3cgbGlrZWx5IHRoZSBzdGF0dXMgaXMgdG8gYmVcblx0ICogdGhlIFwicHJpbWFyeSBzdGF0dXNcIi5cblx0ICovXG5cdHNldmVyaXR5OiBTZXZlcml0eTtcblx0LyoqXG5cdCAqIEFuIGljb24gcmVwcmVzZW50aW5nIHRoZSBzdGF0dXMsIGlmIHRoaXMgaXMgbm90IHNwZWNpZmllZCBpdCB3aWxsIG5vdCBzaG93IHVwIG9uIHRoZSB0ZXJtaW5hbFxuXHQgKiB0YWIgYW5kIHdpbGwgdXNlIHRoZSBnZW5lcmljIGBpbmZvYCBpY29uIHdoZW4gaG92ZXJpbmcuXG5cdCAqL1xuXHRpY29uPzogVGhlbWVJY29uO1xuXHQvKipcblx0ICogV2hhdCB0byBzaG93IGZvciB0aGlzIHN0YXR1cyBpbiB0aGUgdGVybWluYWwncyBob3Zlci5cblx0ICovXG5cdHRvb2x0aXA/OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBXaGF0IHRvIHNob3cgZm9yIHRoaXMgc3RhdHVzIGluIHRoZSB0ZXJtaW5hbCdzIGhvdmVyIHdoZW4gZGV0YWlscyBhcmUgdG9nZ2xlZC5cblx0ICovXG5cdGRldGFpbGVkVG9vbHRpcD86IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIEFjdGlvbnMgdG8gZXhwb3NlIG9uIGhvdmVyLlxuXHQgKi9cblx0aG92ZXJBY3Rpb25zPzogSVRlcm1pbmFsU3RhdHVzSG92ZXJBY3Rpb25bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVGVybWluYWxTdGF0dXNIb3ZlckFjdGlvbiB7XG5cdGxhYmVsOiBzdHJpbmc7XG5cdGNvbW1hbmRJZDogc3RyaW5nO1xuXHRydW46ICgpID0+IHZvaWQ7XG59XG5cbi8qKlxuICogQ29udGV4dCBmb3IgYWN0aW9ucyB0YWtlbiBvbiB0ZXJtaW5hbCBpbnN0YW5jZXMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlcmlhbGl6ZWRUZXJtaW5hbEluc3RhbmNlQ29udGV4dCB7XG5cdCRtaWQ6IE1hcnNoYWxsZWRJZC5UZXJtaW5hbENvbnRleHQ7XG5cdGluc3RhbmNlSWQ6IG51bWJlcjtcbn1cblxuZXhwb3J0IGNvbnN0IFFVSUNLX0xBVU5DSF9QUk9GSUxFX0NIT0lDRSA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnByb2ZpbGUuY2hvaWNlJztcblxuZXhwb3J0IGNvbnN0IGVudW0gVGVybWluYWxDb21tYW5kSWQge1xuXHRUb2dnbGUgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC50b2dnbGVUZXJtaW5hbCcsXG5cdEtpbGwgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5raWxsJyxcblx0S2lsbFZpZXdPckVkaXRvciA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmtpbGxWaWV3T3JFZGl0b3InLFxuXHRLaWxsRWRpdG9yID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwua2lsbEVkaXRvcicsXG5cdEtpbGxBY3RpdmVUYWIgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5raWxsQWN0aXZlVGFiJyxcblx0S2lsbEFsbCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmtpbGxBbGwnLFxuXHRRdWlja0tpbGwgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5xdWlja0tpbGwnLFxuXHRDb25maWd1cmVUZXJtaW5hbFNldHRpbmdzID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwub3BlblNldHRpbmdzJyxcblx0U2hlbGxJbnRlZ3JhdGlvbkxlYXJuTW9yZSA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmxlYXJuTW9yZScsXG5cdENvcHlMYXN0Q29tbWFuZCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNvcHlMYXN0Q29tbWFuZCcsXG5cdENvcHlMYXN0Q29tbWFuZE91dHB1dCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNvcHlMYXN0Q29tbWFuZE91dHB1dCcsXG5cdENvcHlMYXN0Q29tbWFuZEFuZExhc3RDb21tYW5kT3V0cHV0ID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY29weUxhc3RDb21tYW5kQW5kTGFzdENvbW1hbmRPdXRwdXQnLFxuXHRDb3B5QW5kQ2xlYXJTZWxlY3Rpb24gPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jb3B5QW5kQ2xlYXJTZWxlY3Rpb24nLFxuXHRDb3B5U2VsZWN0aW9uID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY29weVNlbGVjdGlvbicsXG5cdENvcHlTZWxlY3Rpb25Bc0h0bWwgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jb3B5U2VsZWN0aW9uQXNIdG1sJyxcblx0U2VsZWN0QWxsID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2VsZWN0QWxsJyxcblx0RGVsZXRlV29yZExlZnQgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5kZWxldGVXb3JkTGVmdCcsXG5cdERlbGV0ZVdvcmRSaWdodCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmRlbGV0ZVdvcmRSaWdodCcsXG5cdERlbGV0ZVRvTGluZVN0YXJ0ID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZGVsZXRlVG9MaW5lU3RhcnQnLFxuXHRNb3ZlVG9MaW5lU3RhcnQgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5tb3ZlVG9MaW5lU3RhcnQnLFxuXHRNb3ZlVG9MaW5lRW5kID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwubW92ZVRvTGluZUVuZCcsXG5cdE5ldyA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLm5ldycsXG5cdE5ld1dpdGhDd2QgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5uZXdXaXRoQ3dkJyxcblx0TmV3TG9jYWwgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5uZXdMb2NhbCcsXG5cdE5ld0luQWN0aXZlV29ya3NwYWNlID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwubmV3SW5BY3RpdmVXb3Jrc3BhY2UnLFxuXHROZXdXaXRoUHJvZmlsZSA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLm5ld1dpdGhQcm9maWxlJyxcblx0U3BsaXQgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zcGxpdCcsXG5cdFNwbGl0QWN0aXZlVGFiID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc3BsaXRBY3RpdmVUYWInLFxuXHRTcGxpdEluQWN0aXZlV29ya3NwYWNlID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc3BsaXRJbkFjdGl2ZVdvcmtzcGFjZScsXG5cdFVuc3BsaXQgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC51bnNwbGl0Jyxcblx0Sm9pbkFjdGl2ZVRhYiA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmpvaW5BY3RpdmVUYWInLFxuXHRKb2luID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuam9pbicsXG5cdFJlbGF1bmNoID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucmVsYXVuY2gnLFxuXHRGb2N1c1ByZXZpb3VzUGFuZSA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmZvY3VzUHJldmlvdXNQYW5lJyxcblx0Q3JlYXRlVGVybWluYWxFZGl0b3IgPSAnd29ya2JlbmNoLmFjdGlvbi5jcmVhdGVUZXJtaW5hbEVkaXRvcicsXG5cdENyZWF0ZVRlcm1pbmFsRWRpdG9yU2FtZUdyb3VwID0gJ3dvcmtiZW5jaC5hY3Rpb24uY3JlYXRlVGVybWluYWxFZGl0b3JTYW1lR3JvdXAnLFxuXHRDcmVhdGVUZXJtaW5hbEVkaXRvclNpZGUgPSAnd29ya2JlbmNoLmFjdGlvbi5jcmVhdGVUZXJtaW5hbEVkaXRvclNpZGUnLFxuXHRGb2N1c1RhYnMgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1c1RhYnMnLFxuXHRGb2N1c05leHRQYW5lID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZm9jdXNOZXh0UGFuZScsXG5cdFJlc2l6ZVBhbmVMZWZ0ID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucmVzaXplUGFuZUxlZnQnLFxuXHRSZXNpemVQYW5lUmlnaHQgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5yZXNpemVQYW5lUmlnaHQnLFxuXHRSZXNpemVQYW5lVXAgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5yZXNpemVQYW5lVXAnLFxuXHRTaXplVG9Db250ZW50V2lkdGggPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zaXplVG9Db250ZW50V2lkdGgnLFxuXHRTaXplVG9Db250ZW50V2lkdGhBY3RpdmVUYWIgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zaXplVG9Db250ZW50V2lkdGhBY3RpdmVUYWInLFxuXHRSZXNpemVQYW5lRG93biA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJlc2l6ZVBhbmVEb3duJyxcblx0Rm9jdXMgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1cycsXG5cdEZvY3VzSW5zdGFuY2UgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1c0luc3RhbmNlJyxcblx0Rm9jdXNOZXh0ID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZm9jdXNOZXh0Jyxcblx0Rm9jdXNQcmV2aW91cyA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmZvY3VzUHJldmlvdXMnLFxuXHRQYXN0ZSA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnBhc3RlJyxcblx0UGFzdGVQd3NoID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucGFzdGVQd3NoJyxcblx0UGFzdGVTZWxlY3Rpb24gPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5wYXN0ZVNlbGVjdGlvbicsXG5cdFNlbGVjdERlZmF1bHRQcm9maWxlID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2VsZWN0RGVmYXVsdFNoZWxsJyxcblx0UnVuU2VsZWN0ZWRUZXh0ID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucnVuU2VsZWN0ZWRUZXh0Jyxcblx0UnVuQWN0aXZlRmlsZSA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJ1bkFjdGl2ZUZpbGUnLFxuXHRTd2l0Y2hUZXJtaW5hbCA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnN3aXRjaFRlcm1pbmFsJyxcblx0U2Nyb2xsRG93bkxpbmUgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zY3JvbGxEb3duJyxcblx0U2Nyb2xsRG93blBhZ2UgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zY3JvbGxEb3duUGFnZScsXG5cdFNjcm9sbFRvQm90dG9tID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2Nyb2xsVG9Cb3R0b20nLFxuXHRTY3JvbGxVcExpbmUgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zY3JvbGxVcCcsXG5cdFNjcm9sbFVwUGFnZSA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNjcm9sbFVwUGFnZScsXG5cdFNjcm9sbFRvVG9wID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2Nyb2xsVG9Ub3AnLFxuXHRDbGVhciA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNsZWFyJyxcblx0Q2xlYXJTZWxlY3Rpb24gPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jbGVhclNlbGVjdGlvbicsXG5cdENoYW5nZUljb24gPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jaGFuZ2VJY29uJyxcblx0Q2hhbmdlSWNvbkFjdGl2ZVRhYiA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYW5nZUljb25BY3RpdmVUYWInLFxuXHRDaGFuZ2VDb2xvciA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYW5nZUNvbG9yJyxcblx0Q2hhbmdlQ29sb3JBY3RpdmVUYWIgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jaGFuZ2VDb2xvckFjdGl2ZVRhYicsXG5cdFJlbmFtZSA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJlbmFtZScsXG5cdFJlbmFtZUFjdGl2ZVRhYiA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnJlbmFtZUFjdGl2ZVRhYicsXG5cdFJlbmFtZVdpdGhBcmdzID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucmVuYW1lV2l0aEFyZycsXG5cdFNjcm9sbFRvUHJldmlvdXNDb21tYW5kID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2Nyb2xsVG9QcmV2aW91c0NvbW1hbmQnLFxuXHRTY3JvbGxUb05leHRDb21tYW5kID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2Nyb2xsVG9OZXh0Q29tbWFuZCcsXG5cdFNlbGVjdFRvUHJldmlvdXNDb21tYW5kID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2VsZWN0VG9QcmV2aW91c0NvbW1hbmQnLFxuXHRTZWxlY3RUb05leHRDb21tYW5kID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2VsZWN0VG9OZXh0Q29tbWFuZCcsXG5cdFNlbGVjdFRvUHJldmlvdXNMaW5lID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2VsZWN0VG9QcmV2aW91c0xpbmUnLFxuXHRTZWxlY3RUb05leHRMaW5lID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc2VsZWN0VG9OZXh0TGluZScsXG5cdFNlbmRTZXF1ZW5jZSA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNlbmRTZXF1ZW5jZScsXG5cdFNlbmRTaWduYWwgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zZW5kU2lnbmFsJyxcblx0QXR0YWNoVG9TZXNzaW9uID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuYXR0YWNoVG9TZXNzaW9uJyxcblx0RGV0YWNoU2Vzc2lvbiA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmRldGFjaFNlc3Npb24nLFxuXHRNb3ZlVG9FZGl0b3IgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5tb3ZlVG9FZGl0b3InLFxuXHRNb3ZlVG9UZXJtaW5hbFBhbmVsID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwubW92ZVRvVGVybWluYWxQYW5lbCcsXG5cdE1vdmVJbnRvTmV3V2luZG93ID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwubW92ZUludG9OZXdXaW5kb3cnLFxuXHROZXdJbk5ld1dpbmRvdyA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLm5ld0luTmV3V2luZG93Jyxcblx0U2V0RGltZW5zaW9ucyA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnNldERpbWVuc2lvbnMnLFxuXHRGb2N1c0hvdmVyID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZm9jdXNIb3ZlcicsXG5cdFNob3dFbnZpcm9ubWVudENvbnRyaWJ1dGlvbnMgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zaG93RW52aXJvbm1lbnRDb250cmlidXRpb25zJyxcblx0U3RhcnRWb2ljZSA9ICd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnN0YXJ0Vm9pY2UnLFxuXHRTdG9wVm9pY2UgPSAnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zdG9wVm9pY2UnLFxuXHRSZXZlYWxDb21tYW5kID0gJ3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwucmV2ZWFsQ29tbWFuZCcsXG59XG5cbmV4cG9ydCBjb25zdCBERUZBVUxUX0NPTU1BTkRTX1RPX1NLSVBfU0hFTEw6IHN0cmluZ1tdID0gW1xuXHRUZXJtaW5hbENvbW1hbmRJZC5DbGVhclNlbGVjdGlvbixcblx0VGVybWluYWxDb21tYW5kSWQuQ2xlYXIsXG5cdFRlcm1pbmFsQ29tbWFuZElkLkNvcHlBbmRDbGVhclNlbGVjdGlvbixcblx0VGVybWluYWxDb21tYW5kSWQuQ29weVNlbGVjdGlvbixcblx0VGVybWluYWxDb21tYW5kSWQuQ29weVNlbGVjdGlvbkFzSHRtbCxcblx0VGVybWluYWxDb21tYW5kSWQuQ29weUxhc3RDb21tYW5kLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5Db3B5TGFzdENvbW1hbmRPdXRwdXQsXG5cdFRlcm1pbmFsQ29tbWFuZElkLkNvcHlMYXN0Q29tbWFuZEFuZExhc3RDb21tYW5kT3V0cHV0LFxuXHRUZXJtaW5hbENvbW1hbmRJZC5EZWxldGVUb0xpbmVTdGFydCxcblx0VGVybWluYWxDb21tYW5kSWQuRGVsZXRlV29yZExlZnQsXG5cdFRlcm1pbmFsQ29tbWFuZElkLkRlbGV0ZVdvcmRSaWdodCxcblx0VGVybWluYWxDb21tYW5kSWQuRm9jdXNOZXh0UGFuZSxcblx0VGVybWluYWxDb21tYW5kSWQuRm9jdXNOZXh0LFxuXHRUZXJtaW5hbENvbW1hbmRJZC5Gb2N1c1ByZXZpb3VzUGFuZSxcblx0VGVybWluYWxDb21tYW5kSWQuRm9jdXNQcmV2aW91cyxcblx0VGVybWluYWxDb21tYW5kSWQuRm9jdXMsXG5cdFRlcm1pbmFsQ29tbWFuZElkLlNpemVUb0NvbnRlbnRXaWR0aCxcblx0VGVybWluYWxDb21tYW5kSWQuS2lsbCxcblx0VGVybWluYWxDb21tYW5kSWQuS2lsbEVkaXRvcixcblx0VGVybWluYWxDb21tYW5kSWQuTW92ZVRvRWRpdG9yLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5Nb3ZlVG9MaW5lRW5kLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5Nb3ZlVG9MaW5lU3RhcnQsXG5cdFRlcm1pbmFsQ29tbWFuZElkLk1vdmVUb1Rlcm1pbmFsUGFuZWwsXG5cdFRlcm1pbmFsQ29tbWFuZElkLk5ld0luQWN0aXZlV29ya3NwYWNlLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5OZXcsXG5cdFRlcm1pbmFsQ29tbWFuZElkLk5ld0luTmV3V2luZG93LFxuXHRUZXJtaW5hbENvbW1hbmRJZC5QYXN0ZSxcblx0VGVybWluYWxDb21tYW5kSWQuUGFzdGVQd3NoLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5QYXN0ZVNlbGVjdGlvbixcblx0VGVybWluYWxDb21tYW5kSWQuUmVzaXplUGFuZURvd24sXG5cdFRlcm1pbmFsQ29tbWFuZElkLlJlc2l6ZVBhbmVMZWZ0LFxuXHRUZXJtaW5hbENvbW1hbmRJZC5SZXNpemVQYW5lUmlnaHQsXG5cdFRlcm1pbmFsQ29tbWFuZElkLlJlc2l6ZVBhbmVVcCxcblx0VGVybWluYWxDb21tYW5kSWQuUnVuQWN0aXZlRmlsZSxcblx0VGVybWluYWxDb21tYW5kSWQuUnVuU2VsZWN0ZWRUZXh0LFxuXHRUZXJtaW5hbENvbW1hbmRJZC5TY3JvbGxEb3duTGluZSxcblx0VGVybWluYWxDb21tYW5kSWQuU2Nyb2xsRG93blBhZ2UsXG5cdFRlcm1pbmFsQ29tbWFuZElkLlNjcm9sbFRvQm90dG9tLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5TY3JvbGxUb05leHRDb21tYW5kLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5TY3JvbGxUb1ByZXZpb3VzQ29tbWFuZCxcblx0VGVybWluYWxDb21tYW5kSWQuU2Nyb2xsVG9Ub3AsXG5cdFRlcm1pbmFsQ29tbWFuZElkLlNjcm9sbFVwTGluZSxcblx0VGVybWluYWxDb21tYW5kSWQuU2Nyb2xsVXBQYWdlLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5TZW5kU2VxdWVuY2UsXG5cdFRlcm1pbmFsQ29tbWFuZElkLlNlbGVjdEFsbCxcblx0VGVybWluYWxDb21tYW5kSWQuU2VsZWN0VG9OZXh0Q29tbWFuZCxcblx0VGVybWluYWxDb21tYW5kSWQuU2VsZWN0VG9OZXh0TGluZSxcblx0VGVybWluYWxDb21tYW5kSWQuU2VsZWN0VG9QcmV2aW91c0NvbW1hbmQsXG5cdFRlcm1pbmFsQ29tbWFuZElkLlNlbGVjdFRvUHJldmlvdXNMaW5lLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5TcGxpdEluQWN0aXZlV29ya3NwYWNlLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5TcGxpdCxcblx0VGVybWluYWxDb21tYW5kSWQuVG9nZ2xlLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5Gb2N1c0hvdmVyLFxuXHRBY2Nlc3NpYmlsaXR5Q29tbWFuZElkLk9wZW5BY2Nlc3NpYmlsaXR5SGVscCxcblx0VGVybWluYWxDb21tYW5kSWQuU3RvcFZvaWNlLFxuXHRUZXJtaW5hbENvbW1hbmRJZC5TZW5kU2lnbmFsLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5yZXJ1bkZvckFjdGl2ZVRlcm1pbmFsJyxcblx0J2VkaXRvci5hY3Rpb24udG9nZ2xlVGFiRm9jdXNNb2RlJyxcblx0J25vdGlmaWNhdGlvbnMuaGlkZUxpc3QnLFxuXHQnbm90aWZpY2F0aW9ucy5oaWRlVG9hc3RzJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uY2xvc2VRdWlja09wZW4nLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5xdWlja09wZW4nLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5xdWlja09wZW5QcmV2aW91c0VkaXRvcicsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnNob3dDb21tYW5kcycsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLmJ1aWxkJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udGFza3MucmVzdGFydFRhc2snLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50YXNrcy5ydW5UYXNrJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udGFza3MucmVSdW5UYXNrJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udGFza3Muc2hvd0xvZycsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnNob3dUYXNrcycsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnRlcm1pbmF0ZScsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRhc2tzLnRlc3QnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50b2dnbGVGdWxsU2NyZWVuJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZm9jdXNBdEluZGV4MScsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmZvY3VzQXRJbmRleDInLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1c0F0SW5kZXgzJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZm9jdXNBdEluZGV4NCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmZvY3VzQXRJbmRleDUnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1c0F0SW5kZXg2Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuZm9jdXNBdEluZGV4NycsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmZvY3VzQXRJbmRleDgnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5mb2N1c0F0SW5kZXg5Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNTZWNvbmRFZGl0b3JHcm91cCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmZvY3VzVGhpcmRFZGl0b3JHcm91cCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmZvY3VzRm91cnRoRWRpdG9yR3JvdXAnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5mb2N1c0ZpZnRoRWRpdG9yR3JvdXAnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5mb2N1c1NpeHRoRWRpdG9yR3JvdXAnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5mb2N1c1NldmVudGhFZGl0b3JHcm91cCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmZvY3VzRWlnaHRoRWRpdG9yR3JvdXAnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5mb2N1c05leHRQYXJ0Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNQcmV2aW91c1BhcnQnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5uZXh0UGFuZWxWaWV3Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ucHJldmlvdXNQYW5lbFZpZXcnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5uZXh0U2lkZUJhclZpZXcnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5wcmV2aW91c1NpZGVCYXJWaWV3Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuZGlzY29ubmVjdCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLnN0YXJ0Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuc3RvcCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLnJ1bicsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLnJlc3RhcnQnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5jb250aW51ZScsXG5cdCd3b3JrYmVuY2guYWN0aW9uLmRlYnVnLnBhdXNlJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuc3RlcEludG8nLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5zdGVwT3V0Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uZGVidWcuc3RlcE92ZXInLFxuXHQnc2Vzc2lvbnMuZ29CYWNrJyxcblx0J3Nlc3Npb25zLmdvRm9yd2FyZCcsXG5cdCdzZXNzaW9ucy5mb2N1c0FjdGl2ZVNlc3Npb24nLFxuXHQnc2Vzc2lvbnMuZm9jdXNTZXNzaW9uSW5HcmlkMScsXG5cdCdzZXNzaW9ucy5mb2N1c1Nlc3Npb25JbkdyaWQyJyxcblx0J3Nlc3Npb25zLmZvY3VzU2Vzc2lvbkluR3JpZDMnLFxuXHQnc2Vzc2lvbnMuZm9jdXNTZXNzaW9uSW5HcmlkNCcsXG5cdCdzZXNzaW9ucy5mb2N1c1Nlc3Npb25JbkdyaWQ1Jyxcblx0J3Nlc3Npb25zLmZvY3VzU2Vzc2lvbkluR3JpZDYnLFxuXHQnc2Vzc2lvbnMuZm9jdXNTZXNzaW9uSW5HcmlkNycsXG5cdCdzZXNzaW9ucy5mb2N1c1Nlc3Npb25JbkdyaWQ4Jyxcblx0J3Nlc3Npb25zLmZvY3VzU2Vzc2lvbkluR3JpZDknLFxuXHQnc2Vzc2lvbnNWaWV3UGFuZS5uYXZpZ2F0ZVByZXZpb3VzU2Vzc2lvbicsXG5cdCdzZXNzaW9uc1ZpZXdQYW5lLm5hdmlnYXRlTmV4dFNlc3Npb24nLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5uZXh0RWRpdG9yJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ucHJldmlvdXNFZGl0b3InLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5uZXh0RWRpdG9ySW5Hcm91cCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnByZXZpb3VzRWRpdG9ySW5Hcm91cCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLm9wZW5OZXh0UmVjZW50bHlVc2VkRWRpdG9yJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ub3BlblByZXZpb3VzUmVjZW50bHlVc2VkRWRpdG9yJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ub3Blbk5leHRSZWNlbnRseVVzZWRFZGl0b3JJbkdyb3VwJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ub3BlblByZXZpb3VzUmVjZW50bHlVc2VkRWRpdG9ySW5Hcm91cCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnF1aWNrT3BlblByZXZpb3VzUmVjZW50bHlVc2VkRWRpdG9yJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ucXVpY2tPcGVuTGVhc3RSZWNlbnRseVVzZWRFZGl0b3InLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5xdWlja09wZW5QcmV2aW91c1JlY2VudGx5VXNlZEVkaXRvckluR3JvdXAnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5xdWlja09wZW5MZWFzdFJlY2VudGx5VXNlZEVkaXRvckluR3JvdXAnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5mb2N1c0FjdGl2ZUVkaXRvckdyb3VwJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNGaXJzdEVkaXRvckdyb3VwJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uZm9jdXNMYXN0RWRpdG9yR3JvdXAnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5maXJzdEVkaXRvckluR3JvdXAnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5sYXN0RWRpdG9ySW5Hcm91cCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLm5hdmlnYXRlVXAnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5uYXZpZ2F0ZURvd24nLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5uYXZpZ2F0ZVJpZ2h0Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24ubmF2aWdhdGVMZWZ0Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlUGFuZWwnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi5xdWlja09wZW5WaWV3Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udG9nZ2xlTWF4aW1pemVkUGFuZWwnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi56b29tSW4nLFxuXHQnd29ya2JlbmNoLmFjdGlvbi56b29tT3V0Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24uem9vbVJlc2V0Jyxcblx0J25vdGlmaWNhdGlvbi5hY2NlcHRQcmltYXJ5QWN0aW9uJyxcblx0J3J1bkNvbW1hbmRzJyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY2hhdC5zdGFydCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYXQuY2xvc2UnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jaGF0LmRpc2NhcmQnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jaGF0Lm1ha2VSZXF1ZXN0Jyxcblx0J3dvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuY2hhdC5jYW5jZWwnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jaGF0LmZlZWRiYWNrSGVscGZ1bCcsXG5cdCd3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLmNoYXQuZmVlZGJhY2tVbmhlbHBmdWwnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jaGF0LmZlZWRiYWNrUmVwb3J0SXNzdWUnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jaGF0LnJ1bkNvbW1hbmQnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jaGF0Lmluc2VydENvbW1hbmQnLFxuXHQnd29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5jaGF0LnZpZXdJbkNoYXQnLFxuXHQuLi5kZWZhdWx0VGVybWluYWxDb250cmliQ29tbWFuZHNUb1NraXBTaGVsbCxcbl07XG5cbmV4cG9ydCBjb25zdCB0ZXJtaW5hbENvbnRyaWJ1dGlvbnNEZXNjcmlwdG9yOiBJRXh0ZW5zaW9uUG9pbnREZXNjcmlwdG9yPElUZXJtaW5hbENvbnRyaWJ1dGlvbnM+ID0ge1xuXHRleHRlbnNpb25Qb2ludDogJ3Rlcm1pbmFsJyxcblx0ZGVmYXVsdEV4dGVuc2lvbktpbmQ6IFsnd29ya3NwYWNlJ10sXG5cdGFjdGl2YXRpb25FdmVudHNHZW5lcmF0b3I6IGZ1bmN0aW9uKiAoY29udHJpYnM6IHJlYWRvbmx5IElUZXJtaW5hbENvbnRyaWJ1dGlvbnNbXSkge1xuXHRcdGZvciAoY29uc3QgY29udHJpYiBvZiBjb250cmlicykge1xuXHRcdFx0Zm9yIChjb25zdCBwcm9maWxlQ29udHJpYiBvZiAoY29udHJpYi5wcm9maWxlcyA/PyBbXSkpIHtcblx0XHRcdFx0eWllbGQgYG9uVGVybWluYWxQcm9maWxlOiR7cHJvZmlsZUNvbnRyaWIuaWR9YDtcblx0XHRcdH1cblx0XHR9XG5cdH0sXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnRlcm1pbmFsJywgJ0NvbnRyaWJ1dGVzIHRlcm1pbmFsIGZ1bmN0aW9uYWxpdHkuJyksXG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0cHJvZmlsZXM6IHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy50ZXJtaW5hbC5wcm9maWxlcycsIFwiRGVmaW5lcyBhZGRpdGlvbmFsIHRlcm1pbmFsIHByb2ZpbGVzIHRoYXQgdGhlIHVzZXIgY2FuIGNyZWF0ZS5cIiksXG5cdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IFsnaWQnLCAndGl0bGUnXSxcblx0XHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7XG5cdFx0XHRcdFx0XHRib2R5OiB7XG5cdFx0XHRcdFx0XHRcdGlkOiAnJDEnLFxuXHRcdFx0XHRcdFx0XHR0aXRsZTogJyQyJ1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudGVybWluYWwucHJvZmlsZXMuaWQnLCBcIlRoZSBJRCBvZiB0aGUgdGVybWluYWwgcHJvZmlsZSBwcm92aWRlci5cIiksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHRpdGxlOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudGVybWluYWwucHJvZmlsZXMudGl0bGUnLCBcIlRpdGxlIGZvciB0aGlzIHRlcm1pbmFsIHByb2ZpbGUuXCIpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRpY29uOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudGVybWluYWwudHlwZXMuaWNvbicsIFwiQSBjb2RpY29uLCBVUkksIG9yIGxpZ2h0IGFuZCBkYXJrIFVSSXMgdG8gYXNzb2NpYXRlIHdpdGggdGhpcyB0ZXJtaW5hbCB0eXBlLlwiKSxcblx0XHRcdFx0XHRcdFx0YW55T2Y6IFt7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRsaWdodDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnRlcm1pbmFsLnR5cGVzLmljb24ubGlnaHQnLCAnSWNvbiBwYXRoIHdoZW4gYSBsaWdodCB0aGVtZSBpcyB1c2VkJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGFyazoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnRlcm1pbmFsLnR5cGVzLmljb24uZGFyaycsICdJY29uIHBhdGggd2hlbiBhIGRhcmsgdGhlbWUgaXMgdXNlZCcpLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR0aXRsZVRlbXBsYXRlOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudGVybWluYWwucHJvZmlsZXMudGl0bGVUZW1wbGF0ZScsIFwiQSB0aXRsZSB0ZW1wbGF0ZSBzdHJpbmcgZm9yIHRoZSB0ZXJtaW5hbCB0YWIuIFN1cHBvcnRzIHZhcmlhYmxlcyBsaWtlICRcXHtzZXF1ZW5jZX0sICRcXHtwcm9jZXNzfSwgJFxce2N3ZH0sIGV0Yy4gT3ZlcnJpZGVzIHRoZSBkZWZhdWx0IHRlcm1pbmFsLmludGVncmF0ZWQudGFicy50aXRsZSBzZXR0aW5nIGZvciB0ZXJtaW5hbHMgY3JlYXRlZCB3aXRoIHRoaXMgcHJvZmlsZS5cIiksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdGNvbXBsZXRpb25Qcm92aWRlcnM6IHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy50ZXJtaW5hbC5jb21wbGV0aW9uUHJvdmlkZXJzJywgXCJEZWZpbmVzIHRlcm1pbmFsIGNvbXBsZXRpb24gcHJvdmlkZXJzIHRoYXQgd2lsbCBiZSByZWdpc3RlcmVkIHdoZW4gdGhlIGV4dGVuc2lvbiBhY3RpdmF0ZXMuXCIpLFxuXHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2lkJ10sXG5cdFx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbe1xuXHRcdFx0XHRcdFx0Ym9keToge1xuXHRcdFx0XHRcdFx0XHRpZDogJyQxJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICckMidcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnRlcm1pbmFsLmNvbXBsZXRpb25Qcm92aWRlcnMuZGVzY3JpcHRpb24nLCBcIkEgZGVzY3JpcHRpb24gb2Ygd2hhdCB0aGUgY29tcGxldGlvbiBwcm92aWRlciBkb2VzLiBUaGlzIHdpbGwgYmUgc2hvd24gaW4gdGhlIHNldHRpbmdzIFVJLlwiKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdH0sXG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBUUEsU0FBOEIsZUFBZ0M7QUFJOUQsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsdUJBQXVCO0FBSWhDLFNBQVMsOEJBQThCO0FBR3ZDLFNBQVMsaURBQWlEO0FBR25ELE1BQU0sbUJBQW1CO0FBRXpCLE1BQU0sNkJBQTZCLENBQUMsNENBQTRDLGlDQUFpQyxnQ0FBZ0MsaUNBQWlDO0FBRWxMLE1BQU0sMEJBQTBCO0FBRWhDLE1BQU0seUJBQXlCO0FBQy9CLE1BQU0seUJBQXlCO0FBTS9CLE1BQU0sc0JBQXNCLFVBQVUsTUFBTTtBQUU1QyxNQUFNLHNCQUFzQjtBQUM1QixNQUFNLHNCQUFzQjtBQUM1QixNQUFNLHNCQUFzQjtBQUM1QixNQUFNLDJCQUEyQjtBQUNqQyxNQUFNLDBCQUEwQixDQUFDLFVBQVUsUUFBUSxPQUFPLE9BQU8sT0FBTyxPQUFPLE9BQU8sT0FBTyxPQUFPLE9BQU8sS0FBSztBQUVoSCxNQUFNLGtDQUFrQyxnQkFBaUQsZ0NBQWdDO0FBc0J6SCxNQUFNLDBCQUEwQixnQkFBeUMsd0JBQXdCO0FBd05qRyxNQUFNLDJCQUEyQixDQUFDLE1BQW9GLE9BQVEsRUFBOEIsVUFBVTtBQXVDdEssSUFBVyxlQUFYLGtCQUFXQSxrQkFBWDtBQUVOLEVBQUFBLDRCQUFBLG1CQUFnQixLQUFoQjtBQUlBLEVBQUFBLDRCQUFBLGVBQVksS0FBWjtBQUVBLEVBQUFBLDRCQUFBLGFBQVUsS0FBVjtBQUdBLEVBQUFBLDRCQUFBLHdCQUFxQixLQUFyQjtBQUVBLEVBQUFBLDRCQUFBLGtCQUFlLEtBQWY7QUFHQSxFQUFBQSw0QkFBQSxxQkFBa0IsS0FBbEI7QUFoQmlCLFNBQUFBO0FBQUEsR0FBQTtBQW9GWCxNQUFNLDhCQUE4QjtBQUVwQyxJQUFXLG9CQUFYLGtCQUFXQyx1QkFBWDtBQUNOLEVBQUFBLG1CQUFBLFlBQVM7QUFDVCxFQUFB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O0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQSx1QkFBdUI7QUFBQSxFQUN2QjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtB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
