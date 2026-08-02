import { Codicon } from "../../../../base/common/codicons.js";
import { isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { isString } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { ConfigurationScope, Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import product from "../../../../platform/product/common/product.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { AgentSandboxEnabledValue } from "../../../../platform/sandbox/common/settings.js";
import { TerminalLocationConfigValue, TerminalSettingId } from "../../../../platform/terminal/common/terminal.js";
import { terminalColorSchema, terminalIconSchema } from "../../../../platform/terminal/common/terminalPlatformConfiguration.js";
import { Extensions as WorkbenchExtensions } from "../../../common/configuration.js";
import { terminalContribConfiguration, TerminalContribSettingId } from "../terminalContribExports.js";
import { DEFAULT_COMMANDS_TO_SKIP_SHELL, DEFAULT_LETTER_SPACING, DEFAULT_LINE_HEIGHT, MAXIMUM_FONT_WEIGHT, MINIMUM_FONT_WEIGHT, SUGGESTIONS_FONT_WEIGHT } from "./terminal.js";
const terminalDescriptors = "\n- " + [
  "`${cwd}`: " + localize("cwd", "the terminal's current working directory."),
  "`${cwdFolder}`: " + localize("cwdFolder", "the terminal's current working directory, displayed for multi-root workspaces or in a single root workspace when the value differs from the initial working directory. On Windows, this will only be displayed when shell integration is enabled."),
  "`${workspaceFolder}`: " + localize("workspaceFolder", "the workspace in which the terminal was launched."),
  "`${workspaceFolderName}`: " + localize("workspaceFolderName", "the `name` of the workspace in which the terminal was launched."),
  "`${local}`: " + localize("local", "indicates a local terminal in a remote workspace."),
  "`${process}`: " + localize("process", "the name of the terminal process."),
  "`${progress}`: " + localize("progress", "the progress state as reported by the `OSC 9;4` sequence."),
  "`${separator}`: " + localize("separator", "a conditional separator {0} that only shows when it's surrounded by variables with values or static text.", "(` - `)"),
  "`${sequence}`: " + localize("sequence", "the name provided to the terminal by the process."),
  "`${task}`: " + localize("task", "indicates this terminal is associated with a task."),
  "`${shellType}`: " + localize("shellType", "the detected shell type."),
  "`${shellCommand}`: " + localize("shellCommand", "the command being executed according to shell integration. This also requires high confidence in the detected command line, which may not work in some prompt frameworks."),
  "`${shellPromptInput}`: " + localize("shellPromptInput", "the shell's full prompt input according to shell integration.")
].join("\n- ");
let terminalTitle = localize("terminalTitle", "Controls the terminal title. Variables are substituted based on the context:");
terminalTitle += terminalDescriptors;
let terminalDescription = localize("terminalDescription", "Controls the terminal description, which appears to the right of the title. Variables are substituted based on the context:");
terminalDescription += terminalDescriptors;
const defaultTerminalFontSize = isMacintosh ? 12 : 14;
const terminalConfiguration = {
  [TerminalSettingId.SendKeybindingsToShell]: {
    markdownDescription: localize("terminal.integrated.sendKeybindingsToShell", "Dispatches most keybindings to the terminal instead of the workbench, overriding {0}, which can be used alternatively for fine tuning.", "`#terminal.integrated.commandsToSkipShell#`"),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.TabsDefaultColor]: {
    description: localize("terminal.integrated.tabs.defaultColor", "A theme color ID to associate with terminal icons by default."),
    ...terminalColorSchema,
    scope: ConfigurationScope.RESOURCE
  },
  [TerminalSettingId.TabsDefaultIcon]: {
    description: localize("terminal.integrated.tabs.defaultIcon", "A codicon ID to associate with terminal icons by default."),
    ...terminalIconSchema,
    default: Codicon.terminal.id,
    scope: ConfigurationScope.RESOURCE
  },
  [TerminalSettingId.TabsEnabled]: {
    description: localize("terminal.integrated.tabs.enabled", "Controls whether terminal tabs display as a list to the side of the terminal. When this is disabled a dropdown will display instead."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.TabsEnableAnimation]: {
    description: localize("terminal.integrated.tabs.enableAnimation", "Controls whether terminal tab statuses support animation (eg. in progress tasks)."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.TabsHideCondition]: {
    description: localize("terminal.integrated.tabs.hideCondition", "Controls whether the terminal tabs view will hide under certain conditions."),
    type: "string",
    enum: ["never", "singleTerminal", "singleGroup"],
    enumDescriptions: [
      localize("terminal.integrated.tabs.hideCondition.never", "Never hide the terminal tabs view"),
      localize("terminal.integrated.tabs.hideCondition.singleTerminal", "Hide the terminal tabs view when there is only a single terminal opened"),
      localize("terminal.integrated.tabs.hideCondition.singleGroup", "Hide the terminal tabs view when there is only a single terminal group opened")
    ],
    default: "singleTerminal"
  },
  [TerminalSettingId.TabsShowActiveTerminal]: {
    description: localize("terminal.integrated.tabs.showActiveTerminal", "Shows the active terminal information in the view. This is particularly useful when the title within the tabs aren't visible."),
    type: "string",
    enum: ["always", "singleTerminal", "singleTerminalOrNarrow", "never"],
    enumDescriptions: [
      localize("terminal.integrated.tabs.showActiveTerminal.always", "Always show the active terminal"),
      localize("terminal.integrated.tabs.showActiveTerminal.singleTerminal", "Show the active terminal when it is the only terminal opened"),
      localize("terminal.integrated.tabs.showActiveTerminal.singleTerminalOrNarrow", "Show the active terminal when it is the only terminal opened or when the tabs view is in its narrow textless state"),
      localize("terminal.integrated.tabs.showActiveTerminal.never", "Never show the active terminal")
    ],
    default: "singleTerminalOrNarrow"
  },
  [TerminalSettingId.TabsShowActions]: {
    description: localize("terminal.integrated.tabs.showActions", "Controls whether terminal split and kill buttons are displays next to the new terminal button."),
    type: "string",
    enum: ["always", "singleTerminal", "singleTerminalOrNarrow", "never"],
    enumDescriptions: [
      localize("terminal.integrated.tabs.showActions.always", "Always show the actions"),
      localize("terminal.integrated.tabs.showActions.singleTerminal", "Show the actions when it is the only terminal opened"),
      localize("terminal.integrated.tabs.showActions.singleTerminalOrNarrow", "Show the actions when it is the only terminal opened or when the tabs view is in its narrow textless state"),
      localize("terminal.integrated.tabs.showActions.never", "Never show the actions")
    ],
    default: "singleTerminalOrNarrow"
  },
  [TerminalSettingId.TabsLocation]: {
    type: "string",
    enum: ["left", "right"],
    enumDescriptions: [
      localize("terminal.integrated.tabs.location.left", "Show the terminal tabs view to the left of the terminal"),
      localize("terminal.integrated.tabs.location.right", "Show the terminal tabs view to the right of the terminal")
    ],
    default: "right",
    description: localize("terminal.integrated.tabs.location", "Controls the location of the terminal tabs, either to the left or right of the actual terminal(s).")
  },
  [TerminalSettingId.DefaultLocation]: {
    type: "string",
    enum: [TerminalLocationConfigValue.Editor, TerminalLocationConfigValue.TerminalView],
    enumDescriptions: [
      localize("terminal.integrated.defaultLocation.editor", "Create terminals in the editor"),
      localize("terminal.integrated.defaultLocation.view", "Create terminals in the terminal view")
    ],
    default: "view",
    description: localize("terminal.integrated.defaultLocation", "Controls where newly created terminals will appear."),
    agentsWindow: { default: "view", readOnly: true }
  },
  [TerminalSettingId.TabsFocusMode]: {
    type: "string",
    enum: ["singleClick", "doubleClick"],
    enumDescriptions: [
      localize("terminal.integrated.tabs.focusMode.singleClick", "Focus the terminal when clicking a terminal tab"),
      localize("terminal.integrated.tabs.focusMode.doubleClick", "Focus the terminal when double-clicking a terminal tab")
    ],
    default: "doubleClick",
    description: localize("terminal.integrated.tabs.focusMode", "Controls whether focusing the terminal of a tab happens on double or single click.")
  },
  [TerminalSettingId.TabsAllowAgentCliTitle]: {
    description: localize("terminal.integrated.tabs.allowAgentCliTitle", "Controls whether agentic CLIs (such as Claude Code, Codex, Command Code, GitHub Copilot CLI, and Gemini CLI) are allowed to set the terminal tab title via escape sequences. When disabled, the configured tab title template is used instead."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.MacOptionIsMeta]: {
    description: localize("terminal.integrated.macOptionIsMeta", "Controls whether to treat the option key as the meta key in the terminal on macOS."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.MacOptionClickForcesSelection]: {
    description: localize("terminal.integrated.macOptionClickForcesSelection", "Controls whether to force selection when using Option+click on macOS. This will force a regular (line) selection and disallow the use of column selection mode. This enables copying and pasting using the regular terminal selection, for example, when mouse mode is enabled in tmux."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.AltClickMovesCursor]: {
    markdownDescription: localize("terminal.integrated.altClickMovesCursor", "If enabled, alt/option + click will reposition the prompt cursor to underneath the mouse when {0} is set to {1} (the default value). This may not work reliably depending on your shell.", "`#editor.multiCursorModifier#`", "`'alt'`"),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.CopyOnSelection]: {
    description: localize("terminal.integrated.copyOnSelection", "Controls whether text selected in the terminal will be copied to the clipboard."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.EnableMultiLinePasteWarning]: {
    markdownDescription: localize("terminal.integrated.enableMultiLinePasteWarning", "Controls whether to show a warning dialog when pasting multiple lines into the terminal."),
    type: "string",
    enum: ["auto", "always", "never"],
    markdownEnumDescriptions: [
      localize("terminal.integrated.enableMultiLinePasteWarning.auto", "Enable the warning but do not show it when:\n\n- Bracketed paste mode is enabled (the shell supports multi-line paste natively)\n- The paste is handled by the shell's readline (in the case of pwsh)"),
      localize("terminal.integrated.enableMultiLinePasteWarning.always", "Always show the warning if the text contains a new line."),
      localize("terminal.integrated.enableMultiLinePasteWarning.never", "Never show the warning.")
    ],
    default: "auto"
  },
  [TerminalSettingId.DrawBoldTextInBrightColors]: {
    description: localize("terminal.integrated.drawBoldTextInBrightColors", 'Controls whether bold text in the terminal will always use the "bright" ANSI color variant.'),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.FontFamily]: {
    markdownDescription: localize("terminal.integrated.fontFamily", "Controls the font family of the terminal. Defaults to {0}'s value.", "`#editor.fontFamily#`"),
    type: "string"
  },
  [TerminalSettingId.FontLigaturesEnabled]: {
    markdownDescription: localize("terminal.integrated.fontLigatures.enabled", "Controls whether font ligatures are enabled in the terminal. Ligatures will only work if the configured {0} supports them.", `\`#${TerminalSettingId.FontFamily}#\``),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.FontLigaturesFeatureSettings]: {
    markdownDescription: localize("terminal.integrated.fontLigatures.featureSettings", "Controls what font feature settings are used when ligatures are enabled, in the format of the `font-feature-settings` CSS property. Some examples which may be valid depending on the font:") + "\n\n- " + [
      `\`"calt" off, "ss03"\``,
      `\`"liga" on\``,
      `\`"calt" off, "dlig" on\``
    ].join("\n- "),
    type: "string",
    default: '"calt" on'
  },
  [TerminalSettingId.FontLigaturesFallbackLigatures]: {
    markdownDescription: localize("terminal.integrated.fontLigatures.fallbackLigatures", "When {0} is enabled and the particular {1} cannot be parsed, this is the set of character sequences that will always be drawn together. This allows the use of a fixed set of ligatures even when the font isn't supported.", `\`#${TerminalSettingId.GpuAcceleration}#\``, `\`#${TerminalSettingId.FontFamily}#\``),
    type: "array",
    items: [{ type: "string" }],
    default: [
      "<--",
      "<---",
      "<<-",
      "<-",
      "->",
      "->>",
      "-->",
      "--->",
      "<==",
      "<===",
      "<<=",
      "<=",
      "=>",
      "=>>",
      "==>",
      "===>",
      ">=",
      ">>=",
      "<->",
      "<-->",
      "<--->",
      "<---->",
      "<=>",
      "<==>",
      "<===>",
      "<====>",
      "::",
      ":::",
      "<~~",
      "</",
      "</>",
      "/>",
      "~~>",
      "==",
      "!=",
      "/=",
      "~=",
      "<>",
      "===",
      "!==",
      "!===",
      "<:",
      ":=",
      "*=",
      "*+",
      "<*",
      "<*>",
      "*>",
      "<|",
      "<|>",
      "|>",
      "+*",
      "=*",
      "=:",
      ":>",
      "/*",
      "*/",
      "+++",
      "<!--",
      "<!---"
    ]
  },
  [TerminalSettingId.FontSize]: {
    description: localize("terminal.integrated.fontSize", "Controls the font size in pixels of the terminal."),
    type: "number",
    default: defaultTerminalFontSize,
    minimum: 6,
    maximum: 100
  },
  [TerminalSettingId.LetterSpacing]: {
    description: localize("terminal.integrated.letterSpacing", "Controls the letter spacing of the terminal. This is an integer value which represents the number of additional pixels to add between characters."),
    type: "number",
    default: DEFAULT_LETTER_SPACING
  },
  [TerminalSettingId.LineHeight]: {
    description: localize("terminal.integrated.lineHeight", "Controls the line height of the terminal. This number is multiplied by the terminal font size to get the actual line-height in pixels."),
    type: "number",
    default: DEFAULT_LINE_HEIGHT
  },
  [TerminalSettingId.MinimumContrastRatio]: {
    markdownDescription: localize("terminal.integrated.minimumContrastRatio", "When set, the foreground color of each cell will change to try meet the contrast ratio specified. Note that this will not apply to `powerline` characters per #146406. Example values:\n\n- 1: Do nothing and use the standard theme colors.\n- 4.5: [WCAG AA compliance (minimum)](https://www.w3.org/TR/UNDERSTANDING-WCAG20/visual-audio-contrast-contrast.html) (default).\n- 7: [WCAG AAA compliance (enhanced)](https://www.w3.org/TR/UNDERSTANDING-WCAG20/visual-audio-contrast7.html).\n- 21: White on black or black on white."),
    type: "number",
    default: 4.5,
    tags: ["accessibility"]
  },
  [TerminalSettingId.TabStopWidth]: {
    markdownDescription: localize("terminal.integrated.tabStopWidth", "The number of cells in a tab stop."),
    type: "number",
    minimum: 1,
    default: 8
  },
  [TerminalSettingId.FastScrollSensitivity]: {
    markdownDescription: localize("terminal.integrated.fastScrollSensitivity", "Scrolling speed multiplier when pressing `Alt`."),
    type: "number",
    default: 5
  },
  [TerminalSettingId.MouseWheelScrollSensitivity]: {
    markdownDescription: localize("terminal.integrated.mouseWheelScrollSensitivity", "A multiplier to be used on the `deltaY` of mouse wheel scroll events."),
    type: "number",
    default: 1
  },
  [TerminalSettingId.BellDuration]: {
    markdownDescription: localize("terminal.integrated.bellDuration", "The number of milliseconds to show the bell within a terminal tab when triggered."),
    type: "number",
    default: 1e3
  },
  [TerminalSettingId.FontWeight]: {
    "anyOf": [
      {
        type: "number",
        minimum: MINIMUM_FONT_WEIGHT,
        maximum: MAXIMUM_FONT_WEIGHT,
        errorMessage: localize("terminal.integrated.fontWeightError", 'Only "normal" and "bold" keywords or numbers between 1 and 1000 are allowed.')
      },
      {
        type: "string",
        pattern: "^(normal|bold|1000|[1-9][0-9]{0,2})$"
      },
      {
        enum: SUGGESTIONS_FONT_WEIGHT
      }
    ],
    description: localize("terminal.integrated.fontWeight", 'The font weight to use within the terminal for non-bold text. Accepts "normal" and "bold" keywords or numbers between 1 and 1000.'),
    default: "normal"
  },
  [TerminalSettingId.FontWeightBold]: {
    "anyOf": [
      {
        type: "number",
        minimum: MINIMUM_FONT_WEIGHT,
        maximum: MAXIMUM_FONT_WEIGHT,
        errorMessage: localize("terminal.integrated.fontWeightError", 'Only "normal" and "bold" keywords or numbers between 1 and 1000 are allowed.')
      },
      {
        type: "string",
        pattern: "^(normal|bold|1000|[1-9][0-9]{0,2})$"
      },
      {
        enum: SUGGESTIONS_FONT_WEIGHT
      }
    ],
    description: localize("terminal.integrated.fontWeightBold", 'The font weight to use within the terminal for bold text. Accepts "normal" and "bold" keywords or numbers between 1 and 1000.'),
    default: "bold"
  },
  [TerminalSettingId.CursorBlinking]: {
    description: localize("terminal.integrated.cursorBlinking", "Controls whether the terminal cursor blinks."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.TextBlinking]: {
    description: localize("terminal.integrated.textBlinking", "Controls whether text blinking is enabled in the terminal."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.CursorStyle]: {
    description: localize("terminal.integrated.cursorStyle", "Controls the style of terminal cursor when the terminal is focused."),
    enum: ["block", "line", "underline"],
    default: "block"
  },
  [TerminalSettingId.CursorStyleInactive]: {
    description: localize("terminal.integrated.cursorStyleInactive", "Controls the style of terminal cursor when the terminal is not focused."),
    enum: ["outline", "block", "line", "underline", "none"],
    default: "outline"
  },
  [TerminalSettingId.CursorWidth]: {
    markdownDescription: localize("terminal.integrated.cursorWidth", "Controls the width of the cursor when {0} is set to {1}.", "`#terminal.integrated.cursorStyle#`", "`line`"),
    type: "number",
    default: 1
  },
  [TerminalSettingId.Scrollback]: {
    description: localize("terminal.integrated.scrollback", "Controls the maximum number of lines the terminal keeps in its buffer. We pre-allocate memory based on this value in order to ensure a smooth experience. As such, as the value increases, so will the amount of memory."),
    type: "number",
    default: 1e3
  },
  [TerminalSettingId.DetectLocale]: {
    markdownDescription: localize("terminal.integrated.detectLocale", "Controls whether to detect and set the `$LANG` environment variable to a UTF-8 compliant option since VS Code's terminal only supports UTF-8 encoded data coming from the shell."),
    type: "string",
    enum: ["auto", "off", "on"],
    markdownEnumDescriptions: [
      localize("terminal.integrated.detectLocale.auto", "Set the `$LANG` environment variable if the existing variable does not exist or it does not end in `'.UTF-8'`."),
      localize("terminal.integrated.detectLocale.off", "Do not set the `$LANG` environment variable."),
      localize("terminal.integrated.detectLocale.on", "Always set the `$LANG` environment variable.")
    ],
    default: "auto"
  },
  [TerminalSettingId.GpuAcceleration]: {
    type: "string",
    enum: ["auto", "on", "off"],
    markdownEnumDescriptions: [
      localize("terminal.integrated.gpuAcceleration.auto", "Let VS Code detect which renderer will give the best experience."),
      localize("terminal.integrated.gpuAcceleration.on", "Enable GPU acceleration within the terminal."),
      localize("terminal.integrated.gpuAcceleration.off", "Disable GPU acceleration within the terminal. The terminal will render much slower when GPU acceleration is off but it should reliably work on all systems.")
    ],
    default: "auto",
    description: localize("terminal.integrated.gpuAcceleration", "Controls whether the terminal will leverage the GPU to do its rendering.")
  },
  [TerminalSettingId.TerminalTitleSeparator]: {
    "type": "string",
    "default": " - ",
    "markdownDescription": localize("terminal.integrated.tabs.separator", "Separator used by {0} and {1}.", `\`#${TerminalSettingId.TerminalTitle}#\``, `\`#${TerminalSettingId.TerminalDescription}#\``)
  },
  [TerminalSettingId.TerminalTitle]: {
    "type": "string",
    "default": "${process}",
    "markdownDescription": terminalTitle
  },
  [TerminalSettingId.TerminalDescription]: {
    "type": "string",
    "default": "${task}${separator}${local}${separator}${cwdFolder}",
    "markdownDescription": terminalDescription
  },
  [TerminalSettingId.RightClickBehavior]: {
    type: "string",
    enum: ["default", "copyPaste", "paste", "selectWord", "nothing"],
    enumDescriptions: [
      localize("terminal.integrated.rightClickBehavior.default", "Show the context menu."),
      localize("terminal.integrated.rightClickBehavior.copyPaste", "Copy when there is a selection, otherwise paste."),
      localize("terminal.integrated.rightClickBehavior.paste", "Paste on right click."),
      localize("terminal.integrated.rightClickBehavior.selectWord", "Select the word under the cursor and show the context menu."),
      localize("terminal.integrated.rightClickBehavior.nothing", "Do nothing and pass event to terminal.")
    ],
    default: isMacintosh ? "selectWord" : isWindows ? "copyPaste" : "default",
    description: localize("terminal.integrated.rightClickBehavior", "Controls how terminal reacts to right click.")
  },
  [TerminalSettingId.MiddleClickBehavior]: {
    type: "string",
    enum: ["default", "paste"],
    enumDescriptions: [
      localize("terminal.integrated.middleClickBehavior.default", "The platform default to focus the terminal. On Linux this will also paste the selection."),
      localize("terminal.integrated.middleClickBehavior.paste", "Paste on middle click.")
    ],
    default: "default",
    description: localize("terminal.integrated.middleClickBehavior", "Controls how terminal reacts to middle click.")
  },
  [TerminalSettingId.Cwd]: {
    restricted: true,
    description: localize("terminal.integrated.cwd", "An explicit start path where the terminal will be launched, this is used as the current working directory (cwd) for the shell process. This may be particularly useful in workspace settings if the root directory is not a convenient cwd."),
    type: "string",
    default: void 0,
    scope: ConfigurationScope.RESOURCE
  },
  [TerminalSettingId.ConfirmOnExit]: {
    description: localize("terminal.integrated.confirmOnExit", "Controls whether to confirm when the window closes if there are active terminal sessions. Background terminals like those launched by some extensions will not trigger the confirmation."),
    type: "string",
    enum: ["never", "always", "hasChildProcesses"],
    enumDescriptions: [
      localize("terminal.integrated.confirmOnExit.never", "Never confirm."),
      localize("terminal.integrated.confirmOnExit.always", "Always confirm if there are terminals."),
      localize("terminal.integrated.confirmOnExit.hasChildProcesses", "Confirm if there are any terminals that have child processes.")
    ],
    default: "never"
  },
  [TerminalSettingId.ConfirmOnKill]: {
    description: localize("terminal.integrated.confirmOnKill", "Controls whether to confirm killing terminals when they have child processes. When set to editor, terminals in the editor area will be marked as changed when they have child processes. Note that child process detection may not work well for shells like Git Bash which don't run their processes as child processes of the shell. Background terminals like those launched by some extensions will not trigger the confirmation."),
    type: "string",
    enum: ["never", "editor", "panel", "always"],
    enumDescriptions: [
      localize("terminal.integrated.confirmOnKill.never", "Never confirm."),
      localize("terminal.integrated.confirmOnKill.editor", "Confirm if the terminal is in the editor."),
      localize("terminal.integrated.confirmOnKill.panel", "Confirm if the terminal is in the panel."),
      localize("terminal.integrated.confirmOnKill.always", "Confirm if the terminal is either in the editor or panel.")
    ],
    default: "editor"
  },
  [TerminalSettingId.EnableBell]: {
    markdownDeprecationMessage: localize("terminal.integrated.enableBell", "This is now deprecated. Instead use the `terminal.integrated.enableVisualBell` and `accessibility.signals.terminalBell` settings."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.EnableVisualBell]: {
    description: localize("terminal.integrated.enableVisualBell", "Controls whether the visual terminal bell is enabled. This shows up next to the terminal's name."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.CommandsToSkipShell]: {
    markdownDescription: localize(
      "terminal.integrated.commandsToSkipShell",
      "A set of command IDs whose keybindings will not be sent to the shell but instead always be handled by VS Code. This allows keybindings that would normally be consumed by the shell to act instead the same as when the terminal is not focused, for example `Ctrl+P` to launch Quick Open.\n\n&nbsp;\n\nMany commands are skipped by default. To override a default and pass that command's keybinding to the shell instead, add the command prefixed with the `-` character. For example add `-workbench.action.quickOpen` to allow `Ctrl+P` to reach the shell.\n\n&nbsp;\n\nThe following list of default skipped commands is truncated when viewed in Settings Editor. To see the full list, {1} and search for the first command from the list below.\n\n&nbsp;\n\nDefault Skipped Commands:\n\n{0}",
      DEFAULT_COMMANDS_TO_SKIP_SHELL.sort().map((command) => `- ${command}`).join("\n"),
      `[${localize("openDefaultSettingsJson", "open the default settings JSON")}](command:workbench.action.openRawDefaultSettings '${localize("openDefaultSettingsJson.capitalized", "Open Default Settings (JSON)")}')`
    ),
    type: "array",
    items: {
      type: "string"
    },
    default: []
  },
  [TerminalSettingId.AllowChords]: {
    markdownDescription: localize("terminal.integrated.allowChords", "Whether or not to allow chord keybindings in the terminal. Note that when this is true and the keystroke results in a chord it will bypass {0}, setting this to false is particularly useful when you want ctrl+k to go to your shell (not VS Code).", "`#terminal.integrated.commandsToSkipShell#`"),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.AllowMnemonics]: {
    markdownDescription: localize("terminal.integrated.allowMnemonics", "Whether to allow menubar mnemonics (for example Alt+F) to trigger the open of the menubar. Note that this will cause all alt keystrokes to skip the shell when true. This does nothing on macOS."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.EnvMacOs]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.env.osx", "Object with environment variables that will be added to the VS Code process to be used by the terminal on macOS. Set to `null` to delete the environment variable."),
    type: "object",
    additionalProperties: {
      type: ["string", "null"]
    },
    default: {}
  },
  [TerminalSettingId.EnvLinux]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.env.linux", "Object with environment variables that will be added to the VS Code process to be used by the terminal on Linux. Set to `null` to delete the environment variable."),
    type: "object",
    additionalProperties: {
      type: ["string", "null"]
    },
    default: {}
  },
  [TerminalSettingId.EnvWindows]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.env.windows", "Object with environment variables that will be added to the VS Code process to be used by the terminal on Windows. Set to `null` to delete the environment variable."),
    type: "object",
    additionalProperties: {
      type: ["string", "null"]
    },
    default: {}
  },
  [TerminalSettingId.EnvironmentChangesRelaunch]: {
    markdownDescription: localize("terminal.integrated.environmentChangesRelaunch", "Whether to relaunch terminals automatically if extensions want to contribute to their environment and have not been interacted with yet."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.ShowExitAlert]: {
    description: localize("terminal.integrated.showExitAlert", 'Controls whether to show the alert "The terminal process terminated with exit code" when exit code is non-zero.'),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.WindowsUseConptyDll]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.windowsUseConptyDll", "Whether to use the conpty.dll (v1.25.260303002) shipped with VS Code, instead of the one bundled with Windows."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.SplitCwd]: {
    description: localize("terminal.integrated.splitCwd", "Controls the working directory a split terminal starts with."),
    type: "string",
    enum: ["workspaceRoot", "initial", "inherited"],
    enumDescriptions: [
      localize("terminal.integrated.splitCwd.workspaceRoot", "A new split terminal will use the workspace root as the working directory. In a multi-root workspace a choice for which root folder to use is offered."),
      localize("terminal.integrated.splitCwd.initial", "A new split terminal will use the working directory that the parent terminal started with."),
      localize("terminal.integrated.splitCwd.inherited", "On macOS and Linux, a new split terminal will use the working directory of the parent terminal. On Windows, this behaves the same as initial.")
    ],
    default: "inherited"
  },
  [TerminalSettingId.WordSeparators]: {
    markdownDescription: localize("terminal.integrated.wordSeparators", "A string containing all characters to be considered word separators when double-clicking to select word and in the fallback 'word' link detection. Since this is used for link detection, including characters such as `:` that are used when detecting links will cause the line and column part of links like `file:10:5` to be ignored."),
    type: "string",
    // allow-any-unicode-next-line
    default: " ()[]{}',\"`\u2500\u2018\u2019\u201C\u201D|"
  },
  [TerminalSettingId.EnableFileLinks]: {
    description: localize("terminal.integrated.enableFileLinks", "Whether to enable file links in terminals. Links can be slow when working on a network drive in particular because each file link is verified against the file system. Changing this will take effect only in new terminals."),
    type: "string",
    enum: ["off", "on", "notRemote"],
    enumDescriptions: [
      localize("enableFileLinks.off", "Always off."),
      localize("enableFileLinks.on", "Always on."),
      localize("enableFileLinks.notRemote", "Enable only when not in a remote workspace.")
    ],
    default: "on"
  },
  [TerminalSettingId.AllowedLinkSchemes]: {
    description: localize("terminal.integrated.allowedLinkSchemes", "An array of strings containing the URI schemes that the terminal is allowed to open links for. By default, only a small subset of possible schemes are allowed for security reasons."),
    type: "array",
    items: {
      type: "string"
    },
    default: [
      "file",
      "http",
      "https",
      "mailto",
      "vscode",
      "vscode-insiders"
    ]
  },
  [TerminalSettingId.UnicodeVersion]: {
    type: "string",
    enum: ["6", "11"],
    enumDescriptions: [
      localize("terminal.integrated.unicodeVersion.six", "Version 6 of Unicode. This is an older version which should work better on older systems."),
      localize("terminal.integrated.unicodeVersion.eleven", "Version 11 of Unicode. This version provides better support on modern systems that use modern versions of Unicode.")
    ],
    default: "11",
    description: localize("terminal.integrated.unicodeVersion", "Controls what version of Unicode to use when evaluating the width of characters in the terminal. If you experience emoji or other wide characters not taking up the right amount of space or backspace either deleting too much or too little then you may want to try tweaking this setting.")
  },
  [TerminalSettingId.EnablePersistentSessions]: {
    description: localize("terminal.integrated.enablePersistentSessions", "Persist terminal sessions/history for the workspace across window reloads."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.PersistentSessionReviveProcess]: {
    markdownDescription: localize("terminal.integrated.persistentSessionReviveProcess", "When the terminal process must be shut down (for example on window or application close), this determines when the previous terminal session contents/history should be restored and processes be recreated when the workspace is next opened.\n\nCaveats:\n\n- Restoring of the process current working directory depends on whether it is supported by the shell.\n- Time to persist the session during shutdown is limited, so it may be aborted when using high-latency remote connections."),
    type: "string",
    enum: ["onExit", "onExitAndWindowClose", "never"],
    markdownEnumDescriptions: [
      localize("terminal.integrated.persistentSessionReviveProcess.onExit", "Revive the processes after the last window is closed on Windows/Linux or when the `workbench.action.quit` command is triggered (command palette, keybinding, menu)."),
      localize("terminal.integrated.persistentSessionReviveProcess.onExitAndWindowClose", "Revive the processes after the last window is closed on Windows/Linux or when the `workbench.action.quit` command is triggered (command palette, keybinding, menu), or when the window is closed."),
      localize("terminal.integrated.persistentSessionReviveProcess.never", "Never restore the terminal buffers or recreate the process.")
    ],
    default: "onExit"
  },
  [TerminalSettingId.HideOnStartup]: {
    description: localize("terminal.integrated.hideOnStartup", "Whether to hide the terminal view on startup, avoiding creating a terminal when there are no persistent sessions."),
    type: "string",
    enum: ["never", "whenEmpty", "always"],
    markdownEnumDescriptions: [
      localize("hideOnStartup.never", "Never hide the terminal view on startup."),
      localize("hideOnStartup.whenEmpty", "Only hide the terminal when there are no persistent sessions restored."),
      localize("hideOnStartup.always", "Always hide the terminal, even when there are persistent sessions restored.")
    ],
    default: "never"
  },
  [TerminalSettingId.HideOnLastClosed]: {
    description: localize("terminal.integrated.hideOnLastClosed", "Whether to hide the terminal view when the last terminal is closed. This will only happen when the terminal is the only visible view in the view container."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.CustomGlyphs]: {
    markdownDescription: localize("terminal.integrated.customGlyphs", "Whether to draw custom glyphs instead of using the font for the following unicode ranges:\n\n{0}\n\nThis will typically result in better rendering with continuous lines, even when line height and letter spacing is used. This feature only works when {1} is enabled.", [
      "- Box Drawing (U+2500-U+257F)",
      "- Block Elements (U+2580-U+259F)",
      "- Braille Patterns (U+2800-U+28FF)",
      "- Powerline Symbols (U+E0A0-U+E0D4, Private Use Area)",
      "- Progress Indicators (U+EE00-U+EE0B, Private Use Area)",
      "- Git Branch Symbols (U+F5D0-U+F60D, Private Use Area)",
      "- Symbols for Legacy Computing (U+1FB00-U+1FBFF)"
    ].join("\n"), `\`#${TerminalSettingId.GpuAcceleration}#\``),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.RescaleOverlappingGlyphs]: {
    markdownDescription: localize("terminal.integrated.rescaleOverlappingGlyphs", "Whether to rescale glyphs horizontally that are a single cell wide but have glyphs that would overlap following cell(s). This typically happens for ambiguous width characters (eg. the roman numeral characters U+2160+) which aren't featured in monospace fonts. Emoji glyphs are never rescaled."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.EnableKittyKeyboardProtocol]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.enableKittyKeyboardProtocol", "Whether to enable the kitty keyboard protocol, which allows a program in the terminal to request more detailed keyboard input reporting. This can, for example, enable `Shift+Enter` to be handled by the program."),
    type: "boolean",
    default: true,
    tags: ["advanced"]
  },
  [TerminalSettingId.EnableWin32InputMode]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.enableWin32InputMode", "Whether to enable the win32 input mode, which provides enhanced keyboard input support on Windows."),
    type: "boolean",
    default: false,
    tags: ["experimental", "advanced"],
    experiment: {
      mode: "auto"
    }
  },
  [TerminalSettingId.ShellIntegrationEnabled]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.shellIntegration.enabled", "Determines whether or not shell integration is auto-injected to support features like enhanced command tracking and current working directory detection. \n\nShell integration works by injecting the shell with a startup script. The script gives VS Code insight into what is happening within the terminal.\n\nSupported shells:\n\n- Linux/macOS: bash, fish, pwsh, zsh\n - Windows: pwsh, git bash\n\nThis setting applies only when terminals are created, so you will need to restart your terminals for it to take effect.\n\n Note that the script injection may not work if you have custom arguments defined in the terminal profile, have enabled {1}, have a [complex bash `PROMPT_COMMAND`](https://code.visualstudio.com/docs/editor/integrated-terminal#_complex-bash-promptcommand), or other unsupported setup. To disable decorations, see {0}", "`#terminal.integrated.shellIntegration.decorationsEnabled#`", "`#editor.accessibilitySupport#`"),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.ShellIntegrationDecorationsEnabled]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.shellIntegration.decorationsEnabled", "When shell integration is enabled, adds a decoration for each command."),
    type: "string",
    enum: ["both", "gutter", "overviewRuler", "never"],
    enumDescriptions: [
      localize("terminal.integrated.shellIntegration.decorationsEnabled.both", "Show decorations in the gutter (left) and overview ruler (right)"),
      localize("terminal.integrated.shellIntegration.decorationsEnabled.gutter", "Show gutter decorations to the left of the terminal"),
      localize("terminal.integrated.shellIntegration.decorationsEnabled.overviewRuler", "Show overview ruler decorations to the right of the terminal"),
      localize("terminal.integrated.shellIntegration.decorationsEnabled.never", "Do not show decorations")
    ],
    default: "both"
  },
  [TerminalSettingId.ShellIntegrationTimeout]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.shellIntegration.timeout", "Configures the duration in milliseconds to wait for shell integration after launch before declaring it's not there. The default value {0} uses a variable wait time based on whether shell integration injection is enabled and whether it's a remote window. Values between 1 and 499 are clamped to 500ms. Consider setting this to a large value if your shell starts very slowly.", "`-1`"),
    type: "integer",
    minimum: -1,
    maximum: 6e4,
    default: -1
  },
  [TerminalSettingId.ShellIntegrationQuickFixEnabled]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.shellIntegration.quickFixEnabled", "When shell integration is enabled, enables quick fixes for terminal commands that appear as a lightbulb or sparkle icon to the left of the prompt."),
    type: "boolean",
    default: true
  },
  [TerminalSettingId.ShellIntegrationEnvironmentReporting]: {
    markdownDescription: localize("terminal.integrated.shellIntegration.environmentReporting", "Controls whether to report the shell environment, enabling its use in features such as {0}. This may cause a slowdown when printing your shell's prompt.", `\`#${TerminalContribSettingId.SuggestEnabled}#\``),
    type: "boolean",
    default: product.quality !== "stable"
  },
  [TerminalSettingId.SmoothScrolling]: {
    markdownDescription: localize("terminal.integrated.smoothScrolling", "Controls whether the terminal will scroll using an animation."),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.IgnoreBracketedPasteMode]: {
    markdownDescription: localize("terminal.integrated.ignoreBracketedPasteMode", "Controls whether the terminal will ignore bracketed paste mode even if the terminal was put into the mode, omitting the {0} and {1} sequences when pasting. This is useful when the shell is not respecting the mode which can happen in sub-shells for example.", "`\\x1b[200~`", "`\\x1b[201~`"),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.EnableImages]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.enableImages", "Enables image support in the terminal, this will only work when {0} is enabled. Sixel and iTerm's inline image protocol are supported on Linux and macOS. The kitty graphics protocol is supported on all platforms. On Windows, all image protocols will only work for versions of ConPTY >= v2 which is shipped with Windows itself, see also {1}. Images will currently not be restored between window reloads/reconnects. When enabled, transparency mode is also turned on in the terminal.", `\`#${TerminalSettingId.GpuAcceleration}#\``, `\`#${TerminalSettingId.WindowsUseConptyDll}#\``),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.FocusAfterRun]: {
    markdownDescription: localize("terminal.integrated.focusAfterRun", "Controls whether the terminal, accessible buffer, or neither will be focused after `Terminal: Run Selected Text In Active Terminal` has been run."),
    enum: ["terminal", "accessible-buffer", "none"],
    default: "none",
    tags: ["accessibility"],
    markdownEnumDescriptions: [
      localize("terminal.integrated.focusAfterRun.terminal", "Always focus the terminal."),
      localize("terminal.integrated.focusAfterRun.accessible-buffer", "Always focus the accessible buffer."),
      localize("terminal.integrated.focusAfterRun.none", "Do nothing.")
    ]
  },
  [TerminalSettingId.AllowInUntrustedWorkspace]: {
    restricted: true,
    markdownDescription: localize("terminal.integrated.allowInUntrustedWorkspace", "Controls whether terminals can be created in an untrusted workspace.\n\n**This feature bypasses a security protection that prevents terminals from launching in untrusted workspaces. The reason this is a security risk is because shells are often set up to potentially execute code automatically based on the contents of the current working directory. This should be safe to use provided your shell is set up in such a way that code execution in the folder never happens.**"),
    type: "boolean",
    default: false
  },
  [TerminalSettingId.DeveloperPtyHostLatency]: {
    description: localize("terminal.integrated.developer.ptyHost.latency", "Simulated latency in milliseconds applied to all calls made to the pty host. This is useful for testing terminal behavior under high latency conditions."),
    type: "number",
    minimum: 0,
    default: 0,
    tags: ["advanced"]
  },
  [TerminalSettingId.DeveloperPtyHostStartupDelay]: {
    description: localize("terminal.integrated.developer.ptyHost.startupDelay", "Simulated startup delay in milliseconds for the pty host process. This is useful for testing terminal initialization under slow startup conditions."),
    type: "number",
    minimum: 0,
    default: 0,
    tags: ["advanced"]
  },
  [TerminalSettingId.DevMode]: {
    description: localize("terminal.integrated.developer.devMode", "Enable developer mode for the terminal. This shows additional debug information and visualizations for shell integration sequences."),
    type: "boolean",
    default: false,
    tags: ["advanced"]
  },
  ...terminalContribConfiguration
};
async function registerTerminalConfiguration(getFontSnippets) {
  const configurationRegistry = Registry.as(Extensions.Configuration);
  configurationRegistry.registerConfiguration({
    id: "terminal",
    order: 100,
    title: localize("terminalIntegratedConfigurationTitle", "Integrated Terminal"),
    type: "object",
    properties: terminalConfiguration
  });
  terminalConfiguration[TerminalSettingId.FontFamily].defaultSnippets = await getFontSnippets();
}
Registry.as(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: TerminalContribSettingId.AgentSandboxEnabled,
  migrateFn: (value, valueAccessor) => {
    if (value !== AgentSandboxEnabledValue.AllowNetwork) {
      return [];
    }
    const configurationKeyValuePairs = [[TerminalContribSettingId.AgentSandboxEnabled, { value: AgentSandboxEnabledValue.On }]];
    if (valueAccessor(TerminalContribSettingId.AgentSandboxAllowNetwork) === void 0) {
      configurationKeyValuePairs.push([TerminalContribSettingId.AgentSandboxAllowNetwork, { value: true }]);
    }
    return configurationKeyValuePairs;
  }
}, {
  key: TerminalContribSettingId.AgentSandboxWindowsEnabled,
  migrateFn: (value, valueAccessor) => {
    if (value !== AgentSandboxEnabledValue.AllowNetwork) {
      return [];
    }
    const configurationKeyValuePairs = [[TerminalContribSettingId.AgentSandboxWindowsEnabled, { value: AgentSandboxEnabledValue.On }]];
    if (valueAccessor(TerminalContribSettingId.AgentSandboxAllowNetwork) === void 0) {
      configurationKeyValuePairs.push([TerminalContribSettingId.AgentSandboxAllowNetwork, { value: true }]);
    }
    return configurationKeyValuePairs;
  }
}, {
  key: TerminalSettingId.EnableBell,
  migrateFn: (enableBell, accessor) => {
    const configurationKeyValuePairs = [];
    let announcement = accessor("accessibility.signals.terminalBell")?.announcement ?? accessor("accessibility.alert.terminalBell");
    if (announcement !== void 0 && !isString(announcement)) {
      announcement = announcement ? "auto" : "off";
    }
    configurationKeyValuePairs.push(["accessibility.signals.terminalBell", { value: { sound: enableBell ? "on" : "off", announcement } }]);
    configurationKeyValuePairs.push([TerminalSettingId.EnableBell, { value: void 0 }]);
    configurationKeyValuePairs.push([TerminalSettingId.EnableVisualBell, { value: enableBell }]);
    return configurationKeyValuePairs;
  }
}]);
export {
  defaultTerminalFontSize,
  registerTerminalConfiguration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbENvbmZpZ3VyYXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hU25pcHBldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblNjb3BlLCBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCB0eXBlIElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zYW5kYm94L2NvbW1vbi9zZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbExvY2F0aW9uQ29uZmlnVmFsdWUsIFRlcm1pbmFsU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IHRlcm1pbmFsQ29sb3JTY2hlbWEsIHRlcm1pbmFsSWNvblNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbFBsYXRmb3JtQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycywgSUNvbmZpZ3VyYXRpb25NaWdyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgdGVybWluYWxDb250cmliQ29uZmlndXJhdGlvbiwgVGVybWluYWxDb250cmliU2V0dGluZ0lkIH0gZnJvbSAnLi4vdGVybWluYWxDb250cmliRXhwb3J0cy5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0NPTU1BTkRTX1RPX1NLSVBfU0hFTEwsIERFRkFVTFRfTEVUVEVSX1NQQUNJTkcsIERFRkFVTFRfTElORV9IRUlHSFQsIE1BWElNVU1fRk9OVF9XRUlHSFQsIE1JTklNVU1fRk9OVF9XRUlHSFQsIFNVR0dFU1RJT05TX0ZPTlRfV0VJR0hUIH0gZnJvbSAnLi90ZXJtaW5hbC5qcyc7XG5cbmNvbnN0IHRlcm1pbmFsRGVzY3JpcHRvcnMgPSAnXFxuLSAnICsgW1xuXHQnYFxcJHtjd2R9YDogJyArIGxvY2FsaXplKFwiY3dkXCIsIFwidGhlIHRlcm1pbmFsJ3MgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeS5cIiksXG5cdCdgXFwke2N3ZEZvbGRlcn1gOiAnICsgbG9jYWxpemUoJ2N3ZEZvbGRlcicsIFwidGhlIHRlcm1pbmFsJ3MgY3VycmVudCB3b3JraW5nIGRpcmVjdG9yeSwgZGlzcGxheWVkIGZvciBtdWx0aS1yb290IHdvcmtzcGFjZXMgb3IgaW4gYSBzaW5nbGUgcm9vdCB3b3Jrc3BhY2Ugd2hlbiB0aGUgdmFsdWUgZGlmZmVycyBmcm9tIHRoZSBpbml0aWFsIHdvcmtpbmcgZGlyZWN0b3J5LiBPbiBXaW5kb3dzLCB0aGlzIHdpbGwgb25seSBiZSBkaXNwbGF5ZWQgd2hlbiBzaGVsbCBpbnRlZ3JhdGlvbiBpcyBlbmFibGVkLlwiKSxcblx0J2BcXCR7d29ya3NwYWNlRm9sZGVyfWA6ICcgKyBsb2NhbGl6ZSgnd29ya3NwYWNlRm9sZGVyJywgXCJ0aGUgd29ya3NwYWNlIGluIHdoaWNoIHRoZSB0ZXJtaW5hbCB3YXMgbGF1bmNoZWQuXCIpLFxuXHQnYFxcJHt3b3Jrc3BhY2VGb2xkZXJOYW1lfWA6ICcgKyBsb2NhbGl6ZSgnd29ya3NwYWNlRm9sZGVyTmFtZScsIFwidGhlIGBuYW1lYCBvZiB0aGUgd29ya3NwYWNlIGluIHdoaWNoIHRoZSB0ZXJtaW5hbCB3YXMgbGF1bmNoZWQuXCIpLFxuXHQnYFxcJHtsb2NhbH1gOiAnICsgbG9jYWxpemUoJ2xvY2FsJywgXCJpbmRpY2F0ZXMgYSBsb2NhbCB0ZXJtaW5hbCBpbiBhIHJlbW90ZSB3b3Jrc3BhY2UuXCIpLFxuXHQnYFxcJHtwcm9jZXNzfWA6ICcgKyBsb2NhbGl6ZSgncHJvY2VzcycsIFwidGhlIG5hbWUgb2YgdGhlIHRlcm1pbmFsIHByb2Nlc3MuXCIpLFxuXHQnYFxcJHtwcm9ncmVzc31gOiAnICsgbG9jYWxpemUoJ3Byb2dyZXNzJywgXCJ0aGUgcHJvZ3Jlc3Mgc3RhdGUgYXMgcmVwb3J0ZWQgYnkgdGhlIGBPU0MgOTs0YCBzZXF1ZW5jZS5cIiksXG5cdCdgXFwke3NlcGFyYXRvcn1gOiAnICsgbG9jYWxpemUoJ3NlcGFyYXRvcicsIFwiYSBjb25kaXRpb25hbCBzZXBhcmF0b3IgezB9IHRoYXQgb25seSBzaG93cyB3aGVuIGl0J3Mgc3Vycm91bmRlZCBieSB2YXJpYWJsZXMgd2l0aCB2YWx1ZXMgb3Igc3RhdGljIHRleHQuXCIsICcoYCAtIGApJyksXG5cdCdgXFwke3NlcXVlbmNlfWA6ICcgKyBsb2NhbGl6ZSgnc2VxdWVuY2UnLCBcInRoZSBuYW1lIHByb3ZpZGVkIHRvIHRoZSB0ZXJtaW5hbCBieSB0aGUgcHJvY2Vzcy5cIiksXG5cdCdgXFwke3Rhc2t9YDogJyArIGxvY2FsaXplKCd0YXNrJywgXCJpbmRpY2F0ZXMgdGhpcyB0ZXJtaW5hbCBpcyBhc3NvY2lhdGVkIHdpdGggYSB0YXNrLlwiKSxcblx0J2BcXCR7c2hlbGxUeXBlfWA6ICcgKyBsb2NhbGl6ZSgnc2hlbGxUeXBlJywgXCJ0aGUgZGV0ZWN0ZWQgc2hlbGwgdHlwZS5cIiksXG5cdCdgXFwke3NoZWxsQ29tbWFuZH1gOiAnICsgbG9jYWxpemUoJ3NoZWxsQ29tbWFuZCcsIFwidGhlIGNvbW1hbmQgYmVpbmcgZXhlY3V0ZWQgYWNjb3JkaW5nIHRvIHNoZWxsIGludGVncmF0aW9uLiBUaGlzIGFsc28gcmVxdWlyZXMgaGlnaCBjb25maWRlbmNlIGluIHRoZSBkZXRlY3RlZCBjb21tYW5kIGxpbmUsIHdoaWNoIG1heSBub3Qgd29yayBpbiBzb21lIHByb21wdCBmcmFtZXdvcmtzLlwiKSxcblx0J2BcXCR7c2hlbGxQcm9tcHRJbnB1dH1gOiAnICsgbG9jYWxpemUoJ3NoZWxsUHJvbXB0SW5wdXQnLCBcInRoZSBzaGVsbCdzIGZ1bGwgcHJvbXB0IGlucHV0IGFjY29yZGluZyB0byBzaGVsbCBpbnRlZ3JhdGlvbi5cIiksXG5dLmpvaW4oJ1xcbi0gJyk7IC8vIGludGVudGlvbmFsbHkgY29uY2F0ZW5hdGVkIHRvIG5vdCBwcm9kdWNlIGEgc3RyaW5nIHRoYXQgaXMgdG9vIGxvbmcgZm9yIHRyYW5zbGF0aW9uc1xuXG5sZXQgdGVybWluYWxUaXRsZSA9IGxvY2FsaXplKCd0ZXJtaW5hbFRpdGxlJywgXCJDb250cm9scyB0aGUgdGVybWluYWwgdGl0bGUuIFZhcmlhYmxlcyBhcmUgc3Vic3RpdHV0ZWQgYmFzZWQgb24gdGhlIGNvbnRleHQ6XCIpO1xudGVybWluYWxUaXRsZSArPSB0ZXJtaW5hbERlc2NyaXB0b3JzO1xuXG5sZXQgdGVybWluYWxEZXNjcmlwdGlvbiA9IGxvY2FsaXplKCd0ZXJtaW5hbERlc2NyaXB0aW9uJywgXCJDb250cm9scyB0aGUgdGVybWluYWwgZGVzY3JpcHRpb24sIHdoaWNoIGFwcGVhcnMgdG8gdGhlIHJpZ2h0IG9mIHRoZSB0aXRsZS4gVmFyaWFibGVzIGFyZSBzdWJzdGl0dXRlZCBiYXNlZCBvbiB0aGUgY29udGV4dDpcIik7XG50ZXJtaW5hbERlc2NyaXB0aW9uICs9IHRlcm1pbmFsRGVzY3JpcHRvcnM7XG5cbmV4cG9ydCBjb25zdCBkZWZhdWx0VGVybWluYWxGb250U2l6ZSA9IGlzTWFjaW50b3NoID8gMTIgOiAxNDtcblxuY29uc3QgdGVybWluYWxDb25maWd1cmF0aW9uOiBJU3RyaW5nRGljdGlvbmFyeTxJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPiA9IHtcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLlNlbmRLZXliaW5kaW5nc1RvU2hlbGxdOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuc2VuZEtleWJpbmRpbmdzVG9TaGVsbCcsIFwiRGlzcGF0Y2hlcyBtb3N0IGtleWJpbmRpbmdzIHRvIHRoZSB0ZXJtaW5hbCBpbnN0ZWFkIG9mIHRoZSB3b3JrYmVuY2gsIG92ZXJyaWRpbmcgezB9LCB3aGljaCBjYW4gYmUgdXNlZCBhbHRlcm5hdGl2ZWx5IGZvciBmaW5lIHR1bmluZy5cIiwgJ2AjdGVybWluYWwuaW50ZWdyYXRlZC5jb21tYW5kc1RvU2tpcFNoZWxsI2AnKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogZmFsc2Vcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLlRhYnNEZWZhdWx0Q29sb3JdOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuZGVmYXVsdENvbG9yJywgXCJBIHRoZW1lIGNvbG9yIElEIHRvIGFzc29jaWF0ZSB3aXRoIHRlcm1pbmFsIGljb25zIGJ5IGRlZmF1bHQuXCIpLFxuXHRcdC4uLnRlcm1pbmFsQ29sb3JTY2hlbWEsXG5cdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuVGFic0RlZmF1bHRJY29uXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50YWJzLmRlZmF1bHRJY29uJywgXCJBIGNvZGljb24gSUQgdG8gYXNzb2NpYXRlIHdpdGggdGVybWluYWwgaWNvbnMgYnkgZGVmYXVsdC5cIiksXG5cdFx0Li4udGVybWluYWxJY29uU2NoZW1hLFxuXHRcdGRlZmF1bHQ6IENvZGljb24udGVybWluYWwuaWQsXG5cdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuVGFic0VuYWJsZWRdOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuZW5hYmxlZCcsICdDb250cm9scyB3aGV0aGVyIHRlcm1pbmFsIHRhYnMgZGlzcGxheSBhcyBhIGxpc3QgdG8gdGhlIHNpZGUgb2YgdGhlIHRlcm1pbmFsLiBXaGVuIHRoaXMgaXMgZGlzYWJsZWQgYSBkcm9wZG93biB3aWxsIGRpc3BsYXkgaW5zdGVhZC4nKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogdHJ1ZSxcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLlRhYnNFbmFibGVBbmltYXRpb25dOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuZW5hYmxlQW5pbWF0aW9uJywgJ0NvbnRyb2xzIHdoZXRoZXIgdGVybWluYWwgdGFiIHN0YXR1c2VzIHN1cHBvcnQgYW5pbWF0aW9uIChlZy4gaW4gcHJvZ3Jlc3MgdGFza3MpLicpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlLFxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuVGFic0hpZGVDb25kaXRpb25dOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuaGlkZUNvbmRpdGlvbicsICdDb250cm9scyB3aGV0aGVyIHRoZSB0ZXJtaW5hbCB0YWJzIHZpZXcgd2lsbCBoaWRlIHVuZGVyIGNlcnRhaW4gY29uZGl0aW9ucy4nKSxcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbJ25ldmVyJywgJ3NpbmdsZVRlcm1pbmFsJywgJ3NpbmdsZUdyb3VwJ10sXG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudGFicy5oaWRlQ29uZGl0aW9uLm5ldmVyJywgXCJOZXZlciBoaWRlIHRoZSB0ZXJtaW5hbCB0YWJzIHZpZXdcIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50YWJzLmhpZGVDb25kaXRpb24uc2luZ2xlVGVybWluYWwnLCBcIkhpZGUgdGhlIHRlcm1pbmFsIHRhYnMgdmlldyB3aGVuIHRoZXJlIGlzIG9ubHkgYSBzaW5nbGUgdGVybWluYWwgb3BlbmVkXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudGFicy5oaWRlQ29uZGl0aW9uLnNpbmdsZUdyb3VwJywgXCJIaWRlIHRoZSB0ZXJtaW5hbCB0YWJzIHZpZXcgd2hlbiB0aGVyZSBpcyBvbmx5IGEgc2luZ2xlIHRlcm1pbmFsIGdyb3VwIG9wZW5lZFwiKSxcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdzaW5nbGVUZXJtaW5hbCcsXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5UYWJzU2hvd0FjdGl2ZVRlcm1pbmFsXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50YWJzLnNob3dBY3RpdmVUZXJtaW5hbCcsICdTaG93cyB0aGUgYWN0aXZlIHRlcm1pbmFsIGluZm9ybWF0aW9uIGluIHRoZSB2aWV3LiBUaGlzIGlzIHBhcnRpY3VsYXJseSB1c2VmdWwgd2hlbiB0aGUgdGl0bGUgd2l0aGluIHRoZSB0YWJzIGFyZW5cXCd0IHZpc2libGUuJyksXG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0ZW51bTogWydhbHdheXMnLCAnc2luZ2xlVGVybWluYWwnLCAnc2luZ2xlVGVybWluYWxPck5hcnJvdycsICduZXZlciddLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuc2hvd0FjdGl2ZVRlcm1pbmFsLmFsd2F5cycsIFwiQWx3YXlzIHNob3cgdGhlIGFjdGl2ZSB0ZXJtaW5hbFwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuc2hvd0FjdGl2ZVRlcm1pbmFsLnNpbmdsZVRlcm1pbmFsJywgXCJTaG93IHRoZSBhY3RpdmUgdGVybWluYWwgd2hlbiBpdCBpcyB0aGUgb25seSB0ZXJtaW5hbCBvcGVuZWRcIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50YWJzLnNob3dBY3RpdmVUZXJtaW5hbC5zaW5nbGVUZXJtaW5hbE9yTmFycm93JywgXCJTaG93IHRoZSBhY3RpdmUgdGVybWluYWwgd2hlbiBpdCBpcyB0aGUgb25seSB0ZXJtaW5hbCBvcGVuZWQgb3Igd2hlbiB0aGUgdGFicyB2aWV3IGlzIGluIGl0cyBuYXJyb3cgdGV4dGxlc3Mgc3RhdGVcIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50YWJzLnNob3dBY3RpdmVUZXJtaW5hbC5uZXZlcicsIFwiTmV2ZXIgc2hvdyB0aGUgYWN0aXZlIHRlcm1pbmFsXCIpLFxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ3NpbmdsZVRlcm1pbmFsT3JOYXJyb3cnLFxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuVGFic1Nob3dBY3Rpb25zXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50YWJzLnNob3dBY3Rpb25zJywgJ0NvbnRyb2xzIHdoZXRoZXIgdGVybWluYWwgc3BsaXQgYW5kIGtpbGwgYnV0dG9ucyBhcmUgZGlzcGxheXMgbmV4dCB0byB0aGUgbmV3IHRlcm1pbmFsIGJ1dHRvbi4nKSxcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbJ2Fsd2F5cycsICdzaW5nbGVUZXJtaW5hbCcsICdzaW5nbGVUZXJtaW5hbE9yTmFycm93JywgJ25ldmVyJ10sXG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudGFicy5zaG93QWN0aW9ucy5hbHdheXMnLCBcIkFsd2F5cyBzaG93IHRoZSBhY3Rpb25zXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudGFicy5zaG93QWN0aW9ucy5zaW5nbGVUZXJtaW5hbCcsIFwiU2hvdyB0aGUgYWN0aW9ucyB3aGVuIGl0IGlzIHRoZSBvbmx5IHRlcm1pbmFsIG9wZW5lZFwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuc2hvd0FjdGlvbnMuc2luZ2xlVGVybWluYWxPck5hcnJvdycsIFwiU2hvdyB0aGUgYWN0aW9ucyB3aGVuIGl0IGlzIHRoZSBvbmx5IHRlcm1pbmFsIG9wZW5lZCBvciB3aGVuIHRoZSB0YWJzIHZpZXcgaXMgaW4gaXRzIG5hcnJvdyB0ZXh0bGVzcyBzdGF0ZVwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMuc2hvd0FjdGlvbnMubmV2ZXInLCBcIk5ldmVyIHNob3cgdGhlIGFjdGlvbnNcIiksXG5cdFx0XSxcblx0XHRkZWZhdWx0OiAnc2luZ2xlVGVybWluYWxPck5hcnJvdycsXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5UYWJzTG9jYXRpb25dOiB7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0ZW51bTogWydsZWZ0JywgJ3JpZ2h0J10sXG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudGFicy5sb2NhdGlvbi5sZWZ0JywgXCJTaG93IHRoZSB0ZXJtaW5hbCB0YWJzIHZpZXcgdG8gdGhlIGxlZnQgb2YgdGhlIHRlcm1pbmFsXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudGFicy5sb2NhdGlvbi5yaWdodCcsIFwiU2hvdyB0aGUgdGVybWluYWwgdGFicyB2aWV3IHRvIHRoZSByaWdodCBvZiB0aGUgdGVybWluYWxcIilcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdyaWdodCcsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnRhYnMubG9jYXRpb24nLCBcIkNvbnRyb2xzIHRoZSBsb2NhdGlvbiBvZiB0aGUgdGVybWluYWwgdGFicywgZWl0aGVyIHRvIHRoZSBsZWZ0IG9yIHJpZ2h0IG9mIHRoZSBhY3R1YWwgdGVybWluYWwocykuXCIpXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5EZWZhdWx0TG9jYXRpb25dOiB7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0ZW51bTogW1Rlcm1pbmFsTG9jYXRpb25Db25maWdWYWx1ZS5FZGl0b3IsIFRlcm1pbmFsTG9jYXRpb25Db25maWdWYWx1ZS5UZXJtaW5hbFZpZXddLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmRlZmF1bHRMb2NhdGlvbi5lZGl0b3InLCBcIkNyZWF0ZSB0ZXJtaW5hbHMgaW4gdGhlIGVkaXRvclwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmRlZmF1bHRMb2NhdGlvbi52aWV3JywgXCJDcmVhdGUgdGVybWluYWxzIGluIHRoZSB0ZXJtaW5hbCB2aWV3XCIpXG5cdFx0XSxcblx0XHRkZWZhdWx0OiAndmlldycsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmRlZmF1bHRMb2NhdGlvbicsIFwiQ29udHJvbHMgd2hlcmUgbmV3bHkgY3JlYXRlZCB0ZXJtaW5hbHMgd2lsbCBhcHBlYXIuXCIpLFxuXHRcdGFnZW50c1dpbmRvdzogeyBkZWZhdWx0OiAndmlldycsIHJlYWRPbmx5OiB0cnVlIH0sXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5UYWJzRm9jdXNNb2RlXToge1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGVudW06IFsnc2luZ2xlQ2xpY2snLCAnZG91YmxlQ2xpY2snXSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50YWJzLmZvY3VzTW9kZS5zaW5nbGVDbGljaycsIFwiRm9jdXMgdGhlIHRlcm1pbmFsIHdoZW4gY2xpY2tpbmcgYSB0ZXJtaW5hbCB0YWJcIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50YWJzLmZvY3VzTW9kZS5kb3VibGVDbGljaycsIFwiRm9jdXMgdGhlIHRlcm1pbmFsIHdoZW4gZG91YmxlLWNsaWNraW5nIGEgdGVybWluYWwgdGFiXCIpXG5cdFx0XSxcblx0XHRkZWZhdWx0OiAnZG91YmxlQ2xpY2snLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50YWJzLmZvY3VzTW9kZScsIFwiQ29udHJvbHMgd2hldGhlciBmb2N1c2luZyB0aGUgdGVybWluYWwgb2YgYSB0YWIgaGFwcGVucyBvbiBkb3VibGUgb3Igc2luZ2xlIGNsaWNrLlwiKVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuVGFic0FsbG93QWdlbnRDbGlUaXRsZV06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudGFicy5hbGxvd0FnZW50Q2xpVGl0bGUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgYWdlbnRpYyBDTElzIChzdWNoIGFzIENsYXVkZSBDb2RlLCBDb2RleCwgQ29tbWFuZCBDb2RlLCBHaXRIdWIgQ29waWxvdCBDTEksIGFuZCBHZW1pbmkgQ0xJKSBhcmUgYWxsb3dlZCB0byBzZXQgdGhlIHRlcm1pbmFsIHRhYiB0aXRsZSB2aWEgZXNjYXBlIHNlcXVlbmNlcy4gV2hlbiBkaXNhYmxlZCwgdGhlIGNvbmZpZ3VyZWQgdGFiIHRpdGxlIHRlbXBsYXRlIGlzIHVzZWQgaW5zdGVhZC5cIiksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IHRydWUsXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5NYWNPcHRpb25Jc01ldGFdOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLm1hY09wdGlvbklzTWV0YScsIFwiQ29udHJvbHMgd2hldGhlciB0byB0cmVhdCB0aGUgb3B0aW9uIGtleSBhcyB0aGUgbWV0YSBrZXkgaW4gdGhlIHRlcm1pbmFsIG9uIG1hY09TLlwiKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogZmFsc2Vcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLk1hY09wdGlvbkNsaWNrRm9yY2VzU2VsZWN0aW9uXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5tYWNPcHRpb25DbGlja0ZvcmNlc1NlbGVjdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciB0byBmb3JjZSBzZWxlY3Rpb24gd2hlbiB1c2luZyBPcHRpb24rY2xpY2sgb24gbWFjT1MuIFRoaXMgd2lsbCBmb3JjZSBhIHJlZ3VsYXIgKGxpbmUpIHNlbGVjdGlvbiBhbmQgZGlzYWxsb3cgdGhlIHVzZSBvZiBjb2x1bW4gc2VsZWN0aW9uIG1vZGUuIFRoaXMgZW5hYmxlcyBjb3B5aW5nIGFuZCBwYXN0aW5nIHVzaW5nIHRoZSByZWd1bGFyIHRlcm1pbmFsIHNlbGVjdGlvbiwgZm9yIGV4YW1wbGUsIHdoZW4gbW91c2UgbW9kZSBpcyBlbmFibGVkIGluIHRtdXguXCIpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiBmYWxzZVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuQWx0Q2xpY2tNb3Zlc0N1cnNvcl06IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5hbHRDbGlja01vdmVzQ3Vyc29yJywgXCJJZiBlbmFibGVkLCBhbHQvb3B0aW9uICsgY2xpY2sgd2lsbCByZXBvc2l0aW9uIHRoZSBwcm9tcHQgY3Vyc29yIHRvIHVuZGVybmVhdGggdGhlIG1vdXNlIHdoZW4gezB9IGlzIHNldCB0byB7MX0gKHRoZSBkZWZhdWx0IHZhbHVlKS4gVGhpcyBtYXkgbm90IHdvcmsgcmVsaWFibHkgZGVwZW5kaW5nIG9uIHlvdXIgc2hlbGwuXCIsICdgI2VkaXRvci5tdWx0aUN1cnNvck1vZGlmaWVyI2AnLCAnYFxcJ2FsdFxcJ2AnKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogdHJ1ZVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuQ29weU9uU2VsZWN0aW9uXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5jb3B5T25TZWxlY3Rpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGV4dCBzZWxlY3RlZCBpbiB0aGUgdGVybWluYWwgd2lsbCBiZSBjb3BpZWQgdG8gdGhlIGNsaXBib2FyZC5cIiksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IGZhbHNlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5FbmFibGVNdWx0aUxpbmVQYXN0ZVdhcm5pbmddOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZW5hYmxlTXVsdGlMaW5lUGFzdGVXYXJuaW5nJywgXCJDb250cm9scyB3aGV0aGVyIHRvIHNob3cgYSB3YXJuaW5nIGRpYWxvZyB3aGVuIHBhc3RpbmcgbXVsdGlwbGUgbGluZXMgaW50byB0aGUgdGVybWluYWwuXCIpLFxuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGVudW06IFsnYXV0bycsICdhbHdheXMnLCAnbmV2ZXInXSxcblx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVuYWJsZU11bHRpTGluZVBhc3RlV2FybmluZy5hdXRvJywgXCJFbmFibGUgdGhlIHdhcm5pbmcgYnV0IGRvIG5vdCBzaG93IGl0IHdoZW46XFxuXFxuLSBCcmFja2V0ZWQgcGFzdGUgbW9kZSBpcyBlbmFibGVkICh0aGUgc2hlbGwgc3VwcG9ydHMgbXVsdGktbGluZSBwYXN0ZSBuYXRpdmVseSlcXG4tIFRoZSBwYXN0ZSBpcyBoYW5kbGVkIGJ5IHRoZSBzaGVsbCdzIHJlYWRsaW5lIChpbiB0aGUgY2FzZSBvZiBwd3NoKVwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVuYWJsZU11bHRpTGluZVBhc3RlV2FybmluZy5hbHdheXMnLCBcIkFsd2F5cyBzaG93IHRoZSB3YXJuaW5nIGlmIHRoZSB0ZXh0IGNvbnRhaW5zIGEgbmV3IGxpbmUuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZW5hYmxlTXVsdGlMaW5lUGFzdGVXYXJuaW5nLm5ldmVyJywgXCJOZXZlciBzaG93IHRoZSB3YXJuaW5nLlwiKVxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ2F1dG8nXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5EcmF3Qm9sZFRleHRJbkJyaWdodENvbG9yc106IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZHJhd0JvbGRUZXh0SW5CcmlnaHRDb2xvcnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgYm9sZCB0ZXh0IGluIHRoZSB0ZXJtaW5hbCB3aWxsIGFsd2F5cyB1c2UgdGhlIFxcXCJicmlnaHRcXFwiIEFOU0kgY29sb3IgdmFyaWFudC5cIiksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IHRydWVcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkZvbnRGYW1pbHldOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZm9udEZhbWlseScsIFwiQ29udHJvbHMgdGhlIGZvbnQgZmFtaWx5IG9mIHRoZSB0ZXJtaW5hbC4gRGVmYXVsdHMgdG8gezB9J3MgdmFsdWUuXCIsICdgI2VkaXRvci5mb250RmFtaWx5I2AnKSxcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkZvbnRMaWdhdHVyZXNFbmFibGVkXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmZvbnRMaWdhdHVyZXMuZW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciBmb250IGxpZ2F0dXJlcyBhcmUgZW5hYmxlZCBpbiB0aGUgdGVybWluYWwuIExpZ2F0dXJlcyB3aWxsIG9ubHkgd29yayBpZiB0aGUgY29uZmlndXJlZCB7MH0gc3VwcG9ydHMgdGhlbS5cIiwgYFxcYCMke1Rlcm1pbmFsU2V0dGluZ0lkLkZvbnRGYW1pbHl9I1xcYGApLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiBmYWxzZVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuRm9udExpZ2F0dXJlc0ZlYXR1cmVTZXR0aW5nc106IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5mb250TGlnYXR1cmVzLmZlYXR1cmVTZXR0aW5ncycsIFwiQ29udHJvbHMgd2hhdCBmb250IGZlYXR1cmUgc2V0dGluZ3MgYXJlIHVzZWQgd2hlbiBsaWdhdHVyZXMgYXJlIGVuYWJsZWQsIGluIHRoZSBmb3JtYXQgb2YgdGhlIGBmb250LWZlYXR1cmUtc2V0dGluZ3NgIENTUyBwcm9wZXJ0eS4gU29tZSBleGFtcGxlcyB3aGljaCBtYXkgYmUgdmFsaWQgZGVwZW5kaW5nIG9uIHRoZSBmb250OlwiKSArICdcXG5cXG4tICcgKyBbXG5cdFx0XHRgXFxgXCJjYWx0XCIgb2ZmLCBcInNzMDNcIlxcYGAsXG5cdFx0XHRgXFxgXCJsaWdhXCIgb25cXGBgLFxuXHRcdFx0YFxcYFwiY2FsdFwiIG9mZiwgXCJkbGlnXCIgb25cXGBgXG5cdFx0XS5qb2luKCdcXG4tICcpLFxuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGRlZmF1bHQ6ICdcImNhbHRcIiBvbidcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkZvbnRMaWdhdHVyZXNGYWxsYmFja0xpZ2F0dXJlc106IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5mb250TGlnYXR1cmVzLmZhbGxiYWNrTGlnYXR1cmVzJywgXCJXaGVuIHswfSBpcyBlbmFibGVkIGFuZCB0aGUgcGFydGljdWxhciB7MX0gY2Fubm90IGJlIHBhcnNlZCwgdGhpcyBpcyB0aGUgc2V0IG9mIGNoYXJhY3RlciBzZXF1ZW5jZXMgdGhhdCB3aWxsIGFsd2F5cyBiZSBkcmF3biB0b2dldGhlci4gVGhpcyBhbGxvd3MgdGhlIHVzZSBvZiBhIGZpeGVkIHNldCBvZiBsaWdhdHVyZXMgZXZlbiB3aGVuIHRoZSBmb250IGlzbid0IHN1cHBvcnRlZC5cIiwgYFxcYCMke1Rlcm1pbmFsU2V0dGluZ0lkLkdwdUFjY2VsZXJhdGlvbn0jXFxgYCwgYFxcYCMke1Rlcm1pbmFsU2V0dGluZ0lkLkZvbnRGYW1pbHl9I1xcYGApLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IFt7IHR5cGU6ICdzdHJpbmcnIH1dLFxuXHRcdGRlZmF1bHQ6IFtcblx0XHRcdCc8LS0nLCAnPC0tLScsICc8PC0nLCAnPC0nLCAnLT4nLCAnLT4+JywgJy0tPicsICctLS0+Jyxcblx0XHRcdCc8PT0nLCAnPD09PScsICc8PD0nLCAnPD0nLCAnPT4nLCAnPT4+JywgJz09PicsICc9PT0+JywgJz49JywgJz4+PScsXG5cdFx0XHQnPC0+JywgJzwtLT4nLCAnPC0tLT4nLCAnPC0tLS0+JywgJzw9PicsICc8PT0+JywgJzw9PT0+JywgJzw9PT09PicsICc6OicsICc6OjonLFxuXHRcdFx0Jzx+ficsICc8LycsICc8Lz4nLCAnLz4nLCAnfn4+JywgJz09JywgJyE9JywgJy89JywgJ349JywgJzw+JywgJz09PScsICchPT0nLCAnIT09PScsXG5cdFx0XHQnPDonLCAnOj0nLCAnKj0nLCAnKisnLCAnPConLCAnPCo+JywgJyo+JywgJzx8JywgJzx8PicsICd8PicsICcrKicsICc9KicsICc9OicsICc6PicsXG5cdFx0XHQnLyonLCAnKi8nLCAnKysrJywgJzwhLS0nLCAnPCEtLS0nXG5cdFx0XVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuRm9udFNpemVdOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmZvbnRTaXplJywgXCJDb250cm9scyB0aGUgZm9udCBzaXplIGluIHBpeGVscyBvZiB0aGUgdGVybWluYWwuXCIpLFxuXHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdGRlZmF1bHQ6IGRlZmF1bHRUZXJtaW5hbEZvbnRTaXplLFxuXHRcdG1pbmltdW06IDYsXG5cdFx0bWF4aW11bTogMTAwXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5MZXR0ZXJTcGFjaW5nXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5sZXR0ZXJTcGFjaW5nJywgXCJDb250cm9scyB0aGUgbGV0dGVyIHNwYWNpbmcgb2YgdGhlIHRlcm1pbmFsLiBUaGlzIGlzIGFuIGludGVnZXIgdmFsdWUgd2hpY2ggcmVwcmVzZW50cyB0aGUgbnVtYmVyIG9mIGFkZGl0aW9uYWwgcGl4ZWxzIHRvIGFkZCBiZXR3ZWVuIGNoYXJhY3RlcnMuXCIpLFxuXHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdGRlZmF1bHQ6IERFRkFVTFRfTEVUVEVSX1NQQUNJTkdcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkxpbmVIZWlnaHRdOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmxpbmVIZWlnaHQnLCBcIkNvbnRyb2xzIHRoZSBsaW5lIGhlaWdodCBvZiB0aGUgdGVybWluYWwuIFRoaXMgbnVtYmVyIGlzIG11bHRpcGxpZWQgYnkgdGhlIHRlcm1pbmFsIGZvbnQgc2l6ZSB0byBnZXQgdGhlIGFjdHVhbCBsaW5lLWhlaWdodCBpbiBwaXhlbHMuXCIpLFxuXHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdGRlZmF1bHQ6IERFRkFVTFRfTElORV9IRUlHSFRcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLk1pbmltdW1Db250cmFzdFJhdGlvXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLm1pbmltdW1Db250cmFzdFJhdGlvJywgXCJXaGVuIHNldCwgdGhlIGZvcmVncm91bmQgY29sb3Igb2YgZWFjaCBjZWxsIHdpbGwgY2hhbmdlIHRvIHRyeSBtZWV0IHRoZSBjb250cmFzdCByYXRpbyBzcGVjaWZpZWQuIE5vdGUgdGhhdCB0aGlzIHdpbGwgbm90IGFwcGx5IHRvIGBwb3dlcmxpbmVgIGNoYXJhY3RlcnMgcGVyICMxNDY0MDYuIEV4YW1wbGUgdmFsdWVzOlxcblxcbi0gMTogRG8gbm90aGluZyBhbmQgdXNlIHRoZSBzdGFuZGFyZCB0aGVtZSBjb2xvcnMuXFxuLSA0LjU6IFtXQ0FHIEFBIGNvbXBsaWFuY2UgKG1pbmltdW0pXShodHRwczovL3d3dy53My5vcmcvVFIvVU5ERVJTVEFORElORy1XQ0FHMjAvdmlzdWFsLWF1ZGlvLWNvbnRyYXN0LWNvbnRyYXN0Lmh0bWwpIChkZWZhdWx0KS5cXG4tIDc6IFtXQ0FHIEFBQSBjb21wbGlhbmNlIChlbmhhbmNlZCldKGh0dHBzOi8vd3d3LnczLm9yZy9UUi9VTkRFUlNUQU5ESU5HLVdDQUcyMC92aXN1YWwtYXVkaW8tY29udHJhc3Q3Lmh0bWwpLlxcbi0gMjE6IFdoaXRlIG9uIGJsYWNrIG9yIGJsYWNrIG9uIHdoaXRlLlwiKSxcblx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRkZWZhdWx0OiA0LjUsXG5cdFx0dGFnczogWydhY2Nlc3NpYmlsaXR5J11cblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLlRhYlN0b3BXaWR0aF06IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50YWJTdG9wV2lkdGgnLCBcIlRoZSBudW1iZXIgb2YgY2VsbHMgaW4gYSB0YWIgc3RvcC5cIiksXG5cdFx0dHlwZTogJ251bWJlcicsXG5cdFx0bWluaW11bTogMSxcblx0XHRkZWZhdWx0OiA4XG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5GYXN0U2Nyb2xsU2Vuc2l0aXZpdHldOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZmFzdFNjcm9sbFNlbnNpdGl2aXR5JywgXCJTY3JvbGxpbmcgc3BlZWQgbXVsdGlwbGllciB3aGVuIHByZXNzaW5nIGBBbHRgLlwiKSxcblx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRkZWZhdWx0OiA1XG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5Nb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHldOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQubW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5JywgXCJBIG11bHRpcGxpZXIgdG8gYmUgdXNlZCBvbiB0aGUgYGRlbHRhWWAgb2YgbW91c2Ugd2hlZWwgc2Nyb2xsIGV2ZW50cy5cIiksXG5cdFx0dHlwZTogJ251bWJlcicsXG5cdFx0ZGVmYXVsdDogMVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuQmVsbER1cmF0aW9uXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmJlbGxEdXJhdGlvbicsIFwiVGhlIG51bWJlciBvZiBtaWxsaXNlY29uZHMgdG8gc2hvdyB0aGUgYmVsbCB3aXRoaW4gYSB0ZXJtaW5hbCB0YWIgd2hlbiB0cmlnZ2VyZWQuXCIpLFxuXHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdGRlZmF1bHQ6IDEwMDBcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkZvbnRXZWlnaHRdOiB7XG5cdFx0J2FueU9mJzogW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0bWluaW11bTogTUlOSU1VTV9GT05UX1dFSUdIVCxcblx0XHRcdFx0bWF4aW11bTogTUFYSU1VTV9GT05UX1dFSUdIVCxcblx0XHRcdFx0ZXJyb3JNZXNzYWdlOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5mb250V2VpZ2h0RXJyb3InLCBcIk9ubHkgXFxcIm5vcm1hbFxcXCIgYW5kIFxcXCJib2xkXFxcIiBrZXl3b3JkcyBvciBudW1iZXJzIGJldHdlZW4gMSBhbmQgMTAwMCBhcmUgYWxsb3dlZC5cIilcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRwYXR0ZXJuOiAnXihub3JtYWx8Ym9sZHwxMDAwfFsxLTldWzAtOV17MCwyfSkkJ1xuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0ZW51bTogU1VHR0VTVElPTlNfRk9OVF9XRUlHSFQsXG5cdFx0XHR9XG5cdFx0XSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZm9udFdlaWdodCcsIFwiVGhlIGZvbnQgd2VpZ2h0IHRvIHVzZSB3aXRoaW4gdGhlIHRlcm1pbmFsIGZvciBub24tYm9sZCB0ZXh0LiBBY2NlcHRzIFxcXCJub3JtYWxcXFwiIGFuZCBcXFwiYm9sZFxcXCIga2V5d29yZHMgb3IgbnVtYmVycyBiZXR3ZWVuIDEgYW5kIDEwMDAuXCIpLFxuXHRcdGRlZmF1bHQ6ICdub3JtYWwnXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5Gb250V2VpZ2h0Qm9sZF06IHtcblx0XHQnYW55T2YnOiBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRtaW5pbXVtOiBNSU5JTVVNX0ZPTlRfV0VJR0hULFxuXHRcdFx0XHRtYXhpbXVtOiBNQVhJTVVNX0ZPTlRfV0VJR0hULFxuXHRcdFx0XHRlcnJvck1lc3NhZ2U6IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmZvbnRXZWlnaHRFcnJvcicsIFwiT25seSBcXFwibm9ybWFsXFxcIiBhbmQgXFxcImJvbGRcXFwiIGtleXdvcmRzIG9yIG51bWJlcnMgYmV0d2VlbiAxIGFuZCAxMDAwIGFyZSBhbGxvd2VkLlwiKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdHBhdHRlcm46ICdeKG5vcm1hbHxib2xkfDEwMDB8WzEtOV1bMC05XXswLDJ9KSQnXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRlbnVtOiBTVUdHRVNUSU9OU19GT05UX1dFSUdIVCxcblx0XHRcdH1cblx0XHRdLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5mb250V2VpZ2h0Qm9sZCcsIFwiVGhlIGZvbnQgd2VpZ2h0IHRvIHVzZSB3aXRoaW4gdGhlIHRlcm1pbmFsIGZvciBib2xkIHRleHQuIEFjY2VwdHMgXFxcIm5vcm1hbFxcXCIgYW5kIFxcXCJib2xkXFxcIiBrZXl3b3JkcyBvciBudW1iZXJzIGJldHdlZW4gMSBhbmQgMTAwMC5cIiksXG5cdFx0ZGVmYXVsdDogJ2JvbGQnXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5DdXJzb3JCbGlua2luZ106IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuY3Vyc29yQmxpbmtpbmcnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIHRlcm1pbmFsIGN1cnNvciBibGlua3MuXCIpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiBmYWxzZVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuVGV4dEJsaW5raW5nXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC50ZXh0QmxpbmtpbmcnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGV4dCBibGlua2luZyBpcyBlbmFibGVkIGluIHRoZSB0ZXJtaW5hbC5cIiksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IGZhbHNlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5DdXJzb3JTdHlsZV06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuY3Vyc29yU3R5bGUnLCBcIkNvbnRyb2xzIHRoZSBzdHlsZSBvZiB0ZXJtaW5hbCBjdXJzb3Igd2hlbiB0aGUgdGVybWluYWwgaXMgZm9jdXNlZC5cIiksXG5cdFx0ZW51bTogWydibG9jaycsICdsaW5lJywgJ3VuZGVybGluZSddLFxuXHRcdGRlZmF1bHQ6ICdibG9jaydcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkN1cnNvclN0eWxlSW5hY3RpdmVdOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmN1cnNvclN0eWxlSW5hY3RpdmUnLCBcIkNvbnRyb2xzIHRoZSBzdHlsZSBvZiB0ZXJtaW5hbCBjdXJzb3Igd2hlbiB0aGUgdGVybWluYWwgaXMgbm90IGZvY3VzZWQuXCIpLFxuXHRcdGVudW06IFsnb3V0bGluZScsICdibG9jaycsICdsaW5lJywgJ3VuZGVybGluZScsICdub25lJ10sXG5cdFx0ZGVmYXVsdDogJ291dGxpbmUnXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5DdXJzb3JXaWR0aF06IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5jdXJzb3JXaWR0aCcsIFwiQ29udHJvbHMgdGhlIHdpZHRoIG9mIHRoZSBjdXJzb3Igd2hlbiB7MH0gaXMgc2V0IHRvIHsxfS5cIiwgJ2AjdGVybWluYWwuaW50ZWdyYXRlZC5jdXJzb3JTdHlsZSNgJywgJ2BsaW5lYCcpLFxuXHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdGRlZmF1bHQ6IDFcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLlNjcm9sbGJhY2tdOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNjcm9sbGJhY2snLCBcIkNvbnRyb2xzIHRoZSBtYXhpbXVtIG51bWJlciBvZiBsaW5lcyB0aGUgdGVybWluYWwga2VlcHMgaW4gaXRzIGJ1ZmZlci4gV2UgcHJlLWFsbG9jYXRlIG1lbW9yeSBiYXNlZCBvbiB0aGlzIHZhbHVlIGluIG9yZGVyIHRvIGVuc3VyZSBhIHNtb290aCBleHBlcmllbmNlLiBBcyBzdWNoLCBhcyB0aGUgdmFsdWUgaW5jcmVhc2VzLCBzbyB3aWxsIHRoZSBhbW91bnQgb2YgbWVtb3J5LlwiKSxcblx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRkZWZhdWx0OiAxMDAwXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5EZXRlY3RMb2NhbGVdOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZGV0ZWN0TG9jYWxlJywgXCJDb250cm9scyB3aGV0aGVyIHRvIGRldGVjdCBhbmQgc2V0IHRoZSBgJExBTkdgIGVudmlyb25tZW50IHZhcmlhYmxlIHRvIGEgVVRGLTggY29tcGxpYW50IG9wdGlvbiBzaW5jZSBWUyBDb2RlJ3MgdGVybWluYWwgb25seSBzdXBwb3J0cyBVVEYtOCBlbmNvZGVkIGRhdGEgY29taW5nIGZyb20gdGhlIHNoZWxsLlwiKSxcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbJ2F1dG8nLCAnb2ZmJywgJ29uJ10sXG5cdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5kZXRlY3RMb2NhbGUuYXV0bycsIFwiU2V0IHRoZSBgJExBTkdgIGVudmlyb25tZW50IHZhcmlhYmxlIGlmIHRoZSBleGlzdGluZyB2YXJpYWJsZSBkb2VzIG5vdCBleGlzdCBvciBpdCBkb2VzIG5vdCBlbmQgaW4gYCcuVVRGLTgnYC5cIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5kZXRlY3RMb2NhbGUub2ZmJywgXCJEbyBub3Qgc2V0IHRoZSBgJExBTkdgIGVudmlyb25tZW50IHZhcmlhYmxlLlwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmRldGVjdExvY2FsZS5vbicsIFwiQWx3YXlzIHNldCB0aGUgYCRMQU5HYCBlbnZpcm9ubWVudCB2YXJpYWJsZS5cIilcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdhdXRvJ1xuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuR3B1QWNjZWxlcmF0aW9uXToge1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGVudW06IFsnYXV0bycsICdvbicsICdvZmYnXSxcblx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmdwdUFjY2VsZXJhdGlvbi5hdXRvJywgXCJMZXQgVlMgQ29kZSBkZXRlY3Qgd2hpY2ggcmVuZGVyZXIgd2lsbCBnaXZlIHRoZSBiZXN0IGV4cGVyaWVuY2UuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZ3B1QWNjZWxlcmF0aW9uLm9uJywgXCJFbmFibGUgR1BVIGFjY2VsZXJhdGlvbiB3aXRoaW4gdGhlIHRlcm1pbmFsLlwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmdwdUFjY2VsZXJhdGlvbi5vZmYnLCBcIkRpc2FibGUgR1BVIGFjY2VsZXJhdGlvbiB3aXRoaW4gdGhlIHRlcm1pbmFsLiBUaGUgdGVybWluYWwgd2lsbCByZW5kZXIgbXVjaCBzbG93ZXIgd2hlbiBHUFUgYWNjZWxlcmF0aW9uIGlzIG9mZiBidXQgaXQgc2hvdWxkIHJlbGlhYmx5IHdvcmsgb24gYWxsIHN5c3RlbXMuXCIpLFxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ2F1dG8nLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5ncHVBY2NlbGVyYXRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIHRlcm1pbmFsIHdpbGwgbGV2ZXJhZ2UgdGhlIEdQVSB0byBkbyBpdHMgcmVuZGVyaW5nLlwiKVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuVGVybWluYWxUaXRsZVNlcGFyYXRvcl06IHtcblx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdCdkZWZhdWx0JzogJyAtICcsXG5cdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBsb2NhbGl6ZShcInRlcm1pbmFsLmludGVncmF0ZWQudGFicy5zZXBhcmF0b3JcIiwgXCJTZXBhcmF0b3IgdXNlZCBieSB7MH0gYW5kIHsxfS5cIiwgYFxcYCMke1Rlcm1pbmFsU2V0dGluZ0lkLlRlcm1pbmFsVGl0bGV9I1xcYGAsIGBcXGAjJHtUZXJtaW5hbFNldHRpbmdJZC5UZXJtaW5hbERlc2NyaXB0aW9ufSNcXGBgKVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuVGVybWluYWxUaXRsZV06IHtcblx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdCdkZWZhdWx0JzogJyR7cHJvY2Vzc30nLFxuXHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogdGVybWluYWxUaXRsZVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuVGVybWluYWxEZXNjcmlwdGlvbl06IHtcblx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdCdkZWZhdWx0JzogJyR7dGFza30ke3NlcGFyYXRvcn0ke2xvY2FsfSR7c2VwYXJhdG9yfSR7Y3dkRm9sZGVyfScsXG5cdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiB0ZXJtaW5hbERlc2NyaXB0aW9uXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5SaWdodENsaWNrQmVoYXZpb3JdOiB7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0ZW51bTogWydkZWZhdWx0JywgJ2NvcHlQYXN0ZScsICdwYXN0ZScsICdzZWxlY3RXb3JkJywgJ25vdGhpbmcnXSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5yaWdodENsaWNrQmVoYXZpb3IuZGVmYXVsdCcsIFwiU2hvdyB0aGUgY29udGV4dCBtZW51LlwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnJpZ2h0Q2xpY2tCZWhhdmlvci5jb3B5UGFzdGUnLCBcIkNvcHkgd2hlbiB0aGVyZSBpcyBhIHNlbGVjdGlvbiwgb3RoZXJ3aXNlIHBhc3RlLlwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnJpZ2h0Q2xpY2tCZWhhdmlvci5wYXN0ZScsIFwiUGFzdGUgb24gcmlnaHQgY2xpY2suXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQucmlnaHRDbGlja0JlaGF2aW9yLnNlbGVjdFdvcmQnLCBcIlNlbGVjdCB0aGUgd29yZCB1bmRlciB0aGUgY3Vyc29yIGFuZCBzaG93IHRoZSBjb250ZXh0IG1lbnUuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQucmlnaHRDbGlja0JlaGF2aW9yLm5vdGhpbmcnLCBcIkRvIG5vdGhpbmcgYW5kIHBhc3MgZXZlbnQgdG8gdGVybWluYWwuXCIpXG5cdFx0XSxcblx0XHRkZWZhdWx0OiBpc01hY2ludG9zaCA/ICdzZWxlY3RXb3JkJyA6IGlzV2luZG93cyA/ICdjb3B5UGFzdGUnIDogJ2RlZmF1bHQnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5yaWdodENsaWNrQmVoYXZpb3InLCBcIkNvbnRyb2xzIGhvdyB0ZXJtaW5hbCByZWFjdHMgdG8gcmlnaHQgY2xpY2suXCIpXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5NaWRkbGVDbGlja0JlaGF2aW9yXToge1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGVudW06IFsnZGVmYXVsdCcsICdwYXN0ZSddLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLm1pZGRsZUNsaWNrQmVoYXZpb3IuZGVmYXVsdCcsIFwiVGhlIHBsYXRmb3JtIGRlZmF1bHQgdG8gZm9jdXMgdGhlIHRlcm1pbmFsLiBPbiBMaW51eCB0aGlzIHdpbGwgYWxzbyBwYXN0ZSB0aGUgc2VsZWN0aW9uLlwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLm1pZGRsZUNsaWNrQmVoYXZpb3IucGFzdGUnLCBcIlBhc3RlIG9uIG1pZGRsZSBjbGljay5cIiksXG5cdFx0XSxcblx0XHRkZWZhdWx0OiAnZGVmYXVsdCcsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLm1pZGRsZUNsaWNrQmVoYXZpb3InLCBcIkNvbnRyb2xzIGhvdyB0ZXJtaW5hbCByZWFjdHMgdG8gbWlkZGxlIGNsaWNrLlwiKVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuQ3dkXToge1xuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmN3ZCcsIFwiQW4gZXhwbGljaXQgc3RhcnQgcGF0aCB3aGVyZSB0aGUgdGVybWluYWwgd2lsbCBiZSBsYXVuY2hlZCwgdGhpcyBpcyB1c2VkIGFzIHRoZSBjdXJyZW50IHdvcmtpbmcgZGlyZWN0b3J5IChjd2QpIGZvciB0aGUgc2hlbGwgcHJvY2Vzcy4gVGhpcyBtYXkgYmUgcGFydGljdWxhcmx5IHVzZWZ1bCBpbiB3b3Jrc3BhY2Ugc2V0dGluZ3MgaWYgdGhlIHJvb3QgZGlyZWN0b3J5IGlzIG5vdCBhIGNvbnZlbmllbnQgY3dkLlwiKSxcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRkZWZhdWx0OiB1bmRlZmluZWQsXG5cdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuQ29uZmlybU9uRXhpdF06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuY29uZmlybU9uRXhpdCcsIFwiQ29udHJvbHMgd2hldGhlciB0byBjb25maXJtIHdoZW4gdGhlIHdpbmRvdyBjbG9zZXMgaWYgdGhlcmUgYXJlIGFjdGl2ZSB0ZXJtaW5hbCBzZXNzaW9ucy4gQmFja2dyb3VuZCB0ZXJtaW5hbHMgbGlrZSB0aG9zZSBsYXVuY2hlZCBieSBzb21lIGV4dGVuc2lvbnMgd2lsbCBub3QgdHJpZ2dlciB0aGUgY29uZmlybWF0aW9uLlwiKSxcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbJ25ldmVyJywgJ2Fsd2F5cycsICdoYXNDaGlsZFByb2Nlc3NlcyddLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmNvbmZpcm1PbkV4aXQubmV2ZXInLCBcIk5ldmVyIGNvbmZpcm0uXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuY29uZmlybU9uRXhpdC5hbHdheXMnLCBcIkFsd2F5cyBjb25maXJtIGlmIHRoZXJlIGFyZSB0ZXJtaW5hbHMuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuY29uZmlybU9uRXhpdC5oYXNDaGlsZFByb2Nlc3NlcycsIFwiQ29uZmlybSBpZiB0aGVyZSBhcmUgYW55IHRlcm1pbmFscyB0aGF0IGhhdmUgY2hpbGQgcHJvY2Vzc2VzLlwiKSxcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICduZXZlcidcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkNvbmZpcm1PbktpbGxdOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmNvbmZpcm1PbktpbGwnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gY29uZmlybSBraWxsaW5nIHRlcm1pbmFscyB3aGVuIHRoZXkgaGF2ZSBjaGlsZCBwcm9jZXNzZXMuIFdoZW4gc2V0IHRvIGVkaXRvciwgdGVybWluYWxzIGluIHRoZSBlZGl0b3IgYXJlYSB3aWxsIGJlIG1hcmtlZCBhcyBjaGFuZ2VkIHdoZW4gdGhleSBoYXZlIGNoaWxkIHByb2Nlc3Nlcy4gTm90ZSB0aGF0IGNoaWxkIHByb2Nlc3MgZGV0ZWN0aW9uIG1heSBub3Qgd29yayB3ZWxsIGZvciBzaGVsbHMgbGlrZSBHaXQgQmFzaCB3aGljaCBkb24ndCBydW4gdGhlaXIgcHJvY2Vzc2VzIGFzIGNoaWxkIHByb2Nlc3NlcyBvZiB0aGUgc2hlbGwuIEJhY2tncm91bmQgdGVybWluYWxzIGxpa2UgdGhvc2UgbGF1bmNoZWQgYnkgc29tZSBleHRlbnNpb25zIHdpbGwgbm90IHRyaWdnZXIgdGhlIGNvbmZpcm1hdGlvbi5cIiksXG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0ZW51bTogWyduZXZlcicsICdlZGl0b3InLCAncGFuZWwnLCAnYWx3YXlzJ10sXG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuY29uZmlybU9uS2lsbC5uZXZlcicsIFwiTmV2ZXIgY29uZmlybS5cIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5jb25maXJtT25LaWxsLmVkaXRvcicsIFwiQ29uZmlybSBpZiB0aGUgdGVybWluYWwgaXMgaW4gdGhlIGVkaXRvci5cIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5jb25maXJtT25LaWxsLnBhbmVsJywgXCJDb25maXJtIGlmIHRoZSB0ZXJtaW5hbCBpcyBpbiB0aGUgcGFuZWwuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuY29uZmlybU9uS2lsbC5hbHdheXMnLCBcIkNvbmZpcm0gaWYgdGhlIHRlcm1pbmFsIGlzIGVpdGhlciBpbiB0aGUgZWRpdG9yIG9yIHBhbmVsLlwiKSxcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdlZGl0b3InXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5FbmFibGVCZWxsXToge1xuXHRcdG1hcmtkb3duRGVwcmVjYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5lbmFibGVCZWxsJywgXCJUaGlzIGlzIG5vdyBkZXByZWNhdGVkLiBJbnN0ZWFkIHVzZSB0aGUgYHRlcm1pbmFsLmludGVncmF0ZWQuZW5hYmxlVmlzdWFsQmVsbGAgYW5kIGBhY2Nlc3NpYmlsaXR5LnNpZ25hbHMudGVybWluYWxCZWxsYCBzZXR0aW5ncy5cIiksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IGZhbHNlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5FbmFibGVWaXN1YWxCZWxsXToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5lbmFibGVWaXN1YWxCZWxsJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSB2aXN1YWwgdGVybWluYWwgYmVsbCBpcyBlbmFibGVkLiBUaGlzIHNob3dzIHVwIG5leHQgdG8gdGhlIHRlcm1pbmFsJ3MgbmFtZS5cIiksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IGZhbHNlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5Db21tYW5kc1RvU2tpcFNoZWxsXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKFxuXHRcdFx0J3Rlcm1pbmFsLmludGVncmF0ZWQuY29tbWFuZHNUb1NraXBTaGVsbCcsXG5cdFx0XHRcIkEgc2V0IG9mIGNvbW1hbmQgSURzIHdob3NlIGtleWJpbmRpbmdzIHdpbGwgbm90IGJlIHNlbnQgdG8gdGhlIHNoZWxsIGJ1dCBpbnN0ZWFkIGFsd2F5cyBiZSBoYW5kbGVkIGJ5IFZTIENvZGUuIFRoaXMgYWxsb3dzIGtleWJpbmRpbmdzIHRoYXQgd291bGQgbm9ybWFsbHkgYmUgY29uc3VtZWQgYnkgdGhlIHNoZWxsIHRvIGFjdCBpbnN0ZWFkIHRoZSBzYW1lIGFzIHdoZW4gdGhlIHRlcm1pbmFsIGlzIG5vdCBmb2N1c2VkLCBmb3IgZXhhbXBsZSBgQ3RybCtQYCB0byBsYXVuY2ggUXVpY2sgT3Blbi5cXG5cXG4mbmJzcDtcXG5cXG5NYW55IGNvbW1hbmRzIGFyZSBza2lwcGVkIGJ5IGRlZmF1bHQuIFRvIG92ZXJyaWRlIGEgZGVmYXVsdCBhbmQgcGFzcyB0aGF0IGNvbW1hbmQncyBrZXliaW5kaW5nIHRvIHRoZSBzaGVsbCBpbnN0ZWFkLCBhZGQgdGhlIGNvbW1hbmQgcHJlZml4ZWQgd2l0aCB0aGUgYC1gIGNoYXJhY3Rlci4gRm9yIGV4YW1wbGUgYWRkIGAtd29ya2JlbmNoLmFjdGlvbi5xdWlja09wZW5gIHRvIGFsbG93IGBDdHJsK1BgIHRvIHJlYWNoIHRoZSBzaGVsbC5cXG5cXG4mbmJzcDtcXG5cXG5UaGUgZm9sbG93aW5nIGxpc3Qgb2YgZGVmYXVsdCBza2lwcGVkIGNvbW1hbmRzIGlzIHRydW5jYXRlZCB3aGVuIHZpZXdlZCBpbiBTZXR0aW5ncyBFZGl0b3IuIFRvIHNlZSB0aGUgZnVsbCBsaXN0LCB7MX0gYW5kIHNlYXJjaCBmb3IgdGhlIGZpcnN0IGNvbW1hbmQgZnJvbSB0aGUgbGlzdCBiZWxvdy5cXG5cXG4mbmJzcDtcXG5cXG5EZWZhdWx0IFNraXBwZWQgQ29tbWFuZHM6XFxuXFxuezB9XCIsXG5cdFx0XHRERUZBVUxUX0NPTU1BTkRTX1RPX1NLSVBfU0hFTEwuc29ydCgpLm1hcChjb21tYW5kID0+IGAtICR7Y29tbWFuZH1gKS5qb2luKCdcXG4nKSxcblx0XHRcdGBbJHtsb2NhbGl6ZSgnb3BlbkRlZmF1bHRTZXR0aW5nc0pzb24nLCBcIm9wZW4gdGhlIGRlZmF1bHQgc2V0dGluZ3MgSlNPTlwiKX1dKGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5vcGVuUmF3RGVmYXVsdFNldHRpbmdzICcke2xvY2FsaXplKCdvcGVuRGVmYXVsdFNldHRpbmdzSnNvbi5jYXBpdGFsaXplZCcsIFwiT3BlbiBEZWZhdWx0IFNldHRpbmdzIChKU09OKVwiKX0nKWAsXG5cblx0XHQpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0fSxcblx0XHRkZWZhdWx0OiBbXVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuQWxsb3dDaG9yZHNdOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuYWxsb3dDaG9yZHMnLCBcIldoZXRoZXIgb3Igbm90IHRvIGFsbG93IGNob3JkIGtleWJpbmRpbmdzIGluIHRoZSB0ZXJtaW5hbC4gTm90ZSB0aGF0IHdoZW4gdGhpcyBpcyB0cnVlIGFuZCB0aGUga2V5c3Ryb2tlIHJlc3VsdHMgaW4gYSBjaG9yZCBpdCB3aWxsIGJ5cGFzcyB7MH0sIHNldHRpbmcgdGhpcyB0byBmYWxzZSBpcyBwYXJ0aWN1bGFybHkgdXNlZnVsIHdoZW4geW91IHdhbnQgY3RybCtrIHRvIGdvIHRvIHlvdXIgc2hlbGwgKG5vdCBWUyBDb2RlKS5cIiwgJ2AjdGVybWluYWwuaW50ZWdyYXRlZC5jb21tYW5kc1RvU2tpcFNoZWxsI2AnKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogdHJ1ZVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuQWxsb3dNbmVtb25pY3NdOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuYWxsb3dNbmVtb25pY3MnLCBcIldoZXRoZXIgdG8gYWxsb3cgbWVudWJhciBtbmVtb25pY3MgKGZvciBleGFtcGxlIEFsdCtGKSB0byB0cmlnZ2VyIHRoZSBvcGVuIG9mIHRoZSBtZW51YmFyLiBOb3RlIHRoYXQgdGhpcyB3aWxsIGNhdXNlIGFsbCBhbHQga2V5c3Ryb2tlcyB0byBza2lwIHRoZSBzaGVsbCB3aGVuIHRydWUuIFRoaXMgZG9lcyBub3RoaW5nIG9uIG1hY09TLlwiKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogZmFsc2Vcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkVudk1hY09zXToge1xuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZW52Lm9zeCcsIFwiT2JqZWN0IHdpdGggZW52aXJvbm1lbnQgdmFyaWFibGVzIHRoYXQgd2lsbCBiZSBhZGRlZCB0byB0aGUgVlMgQ29kZSBwcm9jZXNzIHRvIGJlIHVzZWQgYnkgdGhlIHRlcm1pbmFsIG9uIG1hY09TLiBTZXQgdG8gYG51bGxgIHRvIGRlbGV0ZSB0aGUgZW52aXJvbm1lbnQgdmFyaWFibGUuXCIpLFxuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHR0eXBlOiBbJ3N0cmluZycsICdudWxsJ11cblx0XHR9LFxuXHRcdGRlZmF1bHQ6IHt9XG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5FbnZMaW51eF06IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVudi5saW51eCcsIFwiT2JqZWN0IHdpdGggZW52aXJvbm1lbnQgdmFyaWFibGVzIHRoYXQgd2lsbCBiZSBhZGRlZCB0byB0aGUgVlMgQ29kZSBwcm9jZXNzIHRvIGJlIHVzZWQgYnkgdGhlIHRlcm1pbmFsIG9uIExpbnV4LiBTZXQgdG8gYG51bGxgIHRvIGRlbGV0ZSB0aGUgZW52aXJvbm1lbnQgdmFyaWFibGUuXCIpLFxuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHR0eXBlOiBbJ3N0cmluZycsICdudWxsJ11cblx0XHR9LFxuXHRcdGRlZmF1bHQ6IHt9XG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5FbnZXaW5kb3dzXToge1xuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZW52LndpbmRvd3MnLCBcIk9iamVjdCB3aXRoIGVudmlyb25tZW50IHZhcmlhYmxlcyB0aGF0IHdpbGwgYmUgYWRkZWQgdG8gdGhlIFZTIENvZGUgcHJvY2VzcyB0byBiZSB1c2VkIGJ5IHRoZSB0ZXJtaW5hbCBvbiBXaW5kb3dzLiBTZXQgdG8gYG51bGxgIHRvIGRlbGV0ZSB0aGUgZW52aXJvbm1lbnQgdmFyaWFibGUuXCIpLFxuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHR0eXBlOiBbJ3N0cmluZycsICdudWxsJ11cblx0XHR9LFxuXHRcdGRlZmF1bHQ6IHt9XG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5FbnZpcm9ubWVudENoYW5nZXNSZWxhdW5jaF06IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5lbnZpcm9ubWVudENoYW5nZXNSZWxhdW5jaCcsIFwiV2hldGhlciB0byByZWxhdW5jaCB0ZXJtaW5hbHMgYXV0b21hdGljYWxseSBpZiBleHRlbnNpb25zIHdhbnQgdG8gY29udHJpYnV0ZSB0byB0aGVpciBlbnZpcm9ubWVudCBhbmQgaGF2ZSBub3QgYmVlbiBpbnRlcmFjdGVkIHdpdGggeWV0LlwiKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogdHJ1ZVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuU2hvd0V4aXRBbGVydF06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuc2hvd0V4aXRBbGVydCcsIFwiQ29udHJvbHMgd2hldGhlciB0byBzaG93IHRoZSBhbGVydCBcXFwiVGhlIHRlcm1pbmFsIHByb2Nlc3MgdGVybWluYXRlZCB3aXRoIGV4aXQgY29kZVxcXCIgd2hlbiBleGl0IGNvZGUgaXMgbm9uLXplcm8uXCIpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5XaW5kb3dzVXNlQ29ucHR5RGxsXToge1xuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQud2luZG93c1VzZUNvbnB0eURsbCcsIFwiV2hldGhlciB0byB1c2UgdGhlIGNvbnB0eS5kbGwgKHYxLjI1LjI2MDMwMzAwMikgc2hpcHBlZCB3aXRoIFZTIENvZGUsIGluc3RlYWQgb2YgdGhlIG9uZSBidW5kbGVkIHdpdGggV2luZG93cy5cIiksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IHRydWUsXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5TcGxpdEN3ZF06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuc3BsaXRDd2QnLCBcIkNvbnRyb2xzIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBhIHNwbGl0IHRlcm1pbmFsIHN0YXJ0cyB3aXRoLlwiKSxcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbJ3dvcmtzcGFjZVJvb3QnLCAnaW5pdGlhbCcsICdpbmhlcml0ZWQnXSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5zcGxpdEN3ZC53b3Jrc3BhY2VSb290JywgXCJBIG5ldyBzcGxpdCB0ZXJtaW5hbCB3aWxsIHVzZSB0aGUgd29ya3NwYWNlIHJvb3QgYXMgdGhlIHdvcmtpbmcgZGlyZWN0b3J5LiBJbiBhIG11bHRpLXJvb3Qgd29ya3NwYWNlIGEgY2hvaWNlIGZvciB3aGljaCByb290IGZvbGRlciB0byB1c2UgaXMgb2ZmZXJlZC5cIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5zcGxpdEN3ZC5pbml0aWFsJywgXCJBIG5ldyBzcGxpdCB0ZXJtaW5hbCB3aWxsIHVzZSB0aGUgd29ya2luZyBkaXJlY3RvcnkgdGhhdCB0aGUgcGFyZW50IHRlcm1pbmFsIHN0YXJ0ZWQgd2l0aC5cIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5zcGxpdEN3ZC5pbmhlcml0ZWQnLCBcIk9uIG1hY09TIGFuZCBMaW51eCwgYSBuZXcgc3BsaXQgdGVybWluYWwgd2lsbCB1c2UgdGhlIHdvcmtpbmcgZGlyZWN0b3J5IG9mIHRoZSBwYXJlbnQgdGVybWluYWwuIE9uIFdpbmRvd3MsIHRoaXMgYmVoYXZlcyB0aGUgc2FtZSBhcyBpbml0aWFsLlwiKSxcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdpbmhlcml0ZWQnXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5Xb3JkU2VwYXJhdG9yc106IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC53b3JkU2VwYXJhdG9ycycsIFwiQSBzdHJpbmcgY29udGFpbmluZyBhbGwgY2hhcmFjdGVycyB0byBiZSBjb25zaWRlcmVkIHdvcmQgc2VwYXJhdG9ycyB3aGVuIGRvdWJsZS1jbGlja2luZyB0byBzZWxlY3Qgd29yZCBhbmQgaW4gdGhlIGZhbGxiYWNrICd3b3JkJyBsaW5rIGRldGVjdGlvbi4gU2luY2UgdGhpcyBpcyB1c2VkIGZvciBsaW5rIGRldGVjdGlvbiwgaW5jbHVkaW5nIGNoYXJhY3RlcnMgc3VjaCBhcyBgOmAgdGhhdCBhcmUgdXNlZCB3aGVuIGRldGVjdGluZyBsaW5rcyB3aWxsIGNhdXNlIHRoZSBsaW5lIGFuZCBjb2x1bW4gcGFydCBvZiBsaW5rcyBsaWtlIGBmaWxlOjEwOjVgIHRvIGJlIGlnbm9yZWQuXCIpLFxuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdC8vIGFsbG93LWFueS11bmljb2RlLW5leHQtbGluZVxuXHRcdGRlZmF1bHQ6ICcgKClbXXt9XFwnLFwiYFx1MjUwMFx1MjAxOFx1MjAxOVx1MjAxQ1x1MjAxRHwnXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5FbmFibGVGaWxlTGlua3NdOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVuYWJsZUZpbGVMaW5rcycsIFwiV2hldGhlciB0byBlbmFibGUgZmlsZSBsaW5rcyBpbiB0ZXJtaW5hbHMuIExpbmtzIGNhbiBiZSBzbG93IHdoZW4gd29ya2luZyBvbiBhIG5ldHdvcmsgZHJpdmUgaW4gcGFydGljdWxhciBiZWNhdXNlIGVhY2ggZmlsZSBsaW5rIGlzIHZlcmlmaWVkIGFnYWluc3QgdGhlIGZpbGUgc3lzdGVtLiBDaGFuZ2luZyB0aGlzIHdpbGwgdGFrZSBlZmZlY3Qgb25seSBpbiBuZXcgdGVybWluYWxzLlwiKSxcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbJ29mZicsICdvbicsICdub3RSZW1vdGUnXSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgnZW5hYmxlRmlsZUxpbmtzLm9mZicsIFwiQWx3YXlzIG9mZi5cIiksXG5cdFx0XHRsb2NhbGl6ZSgnZW5hYmxlRmlsZUxpbmtzLm9uJywgXCJBbHdheXMgb24uXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2VuYWJsZUZpbGVMaW5rcy5ub3RSZW1vdGUnLCBcIkVuYWJsZSBvbmx5IHdoZW4gbm90IGluIGEgcmVtb3RlIHdvcmtzcGFjZS5cIilcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdvbidcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkFsbG93ZWRMaW5rU2NoZW1lc106IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuYWxsb3dlZExpbmtTY2hlbWVzJywgXCJBbiBhcnJheSBvZiBzdHJpbmdzIGNvbnRhaW5pbmcgdGhlIFVSSSBzY2hlbWVzIHRoYXQgdGhlIHRlcm1pbmFsIGlzIGFsbG93ZWQgdG8gb3BlbiBsaW5rcyBmb3IuIEJ5IGRlZmF1bHQsIG9ubHkgYSBzbWFsbCBzdWJzZXQgb2YgcG9zc2libGUgc2NoZW1lcyBhcmUgYWxsb3dlZCBmb3Igc2VjdXJpdHkgcmVhc29ucy5cIiksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRpdGVtczoge1xuXHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHR9LFxuXHRcdGRlZmF1bHQ6IFtcblx0XHRcdCdmaWxlJyxcblx0XHRcdCdodHRwJyxcblx0XHRcdCdodHRwcycsXG5cdFx0XHQnbWFpbHRvJyxcblx0XHRcdCd2c2NvZGUnLFxuXHRcdFx0J3ZzY29kZS1pbnNpZGVycycsXG5cdFx0XVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuVW5pY29kZVZlcnNpb25dOiB7XG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0ZW51bTogWyc2JywgJzExJ10sXG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQudW5pY29kZVZlcnNpb24uc2l4JywgXCJWZXJzaW9uIDYgb2YgVW5pY29kZS4gVGhpcyBpcyBhbiBvbGRlciB2ZXJzaW9uIHdoaWNoIHNob3VsZCB3b3JrIGJldHRlciBvbiBvbGRlciBzeXN0ZW1zLlwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnVuaWNvZGVWZXJzaW9uLmVsZXZlbicsIFwiVmVyc2lvbiAxMSBvZiBVbmljb2RlLiBUaGlzIHZlcnNpb24gcHJvdmlkZXMgYmV0dGVyIHN1cHBvcnQgb24gbW9kZXJuIHN5c3RlbXMgdGhhdCB1c2UgbW9kZXJuIHZlcnNpb25zIG9mIFVuaWNvZGUuXCIpXG5cdFx0XSxcblx0XHRkZWZhdWx0OiAnMTEnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC51bmljb2RlVmVyc2lvbicsIFwiQ29udHJvbHMgd2hhdCB2ZXJzaW9uIG9mIFVuaWNvZGUgdG8gdXNlIHdoZW4gZXZhbHVhdGluZyB0aGUgd2lkdGggb2YgY2hhcmFjdGVycyBpbiB0aGUgdGVybWluYWwuIElmIHlvdSBleHBlcmllbmNlIGVtb2ppIG9yIG90aGVyIHdpZGUgY2hhcmFjdGVycyBub3QgdGFraW5nIHVwIHRoZSByaWdodCBhbW91bnQgb2Ygc3BhY2Ugb3IgYmFja3NwYWNlIGVpdGhlciBkZWxldGluZyB0b28gbXVjaCBvciB0b28gbGl0dGxlIHRoZW4geW91IG1heSB3YW50IHRvIHRyeSB0d2Vha2luZyB0aGlzIHNldHRpbmcuXCIpXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5FbmFibGVQZXJzaXN0ZW50U2Vzc2lvbnNdOiB7XG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVuYWJsZVBlcnNpc3RlbnRTZXNzaW9ucycsIFwiUGVyc2lzdCB0ZXJtaW5hbCBzZXNzaW9ucy9oaXN0b3J5IGZvciB0aGUgd29ya3NwYWNlIGFjcm9zcyB3aW5kb3cgcmVsb2Fkcy5cIiksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IHRydWVcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLlBlcnNpc3RlbnRTZXNzaW9uUmV2aXZlUHJvY2Vzc106IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5wZXJzaXN0ZW50U2Vzc2lvblJldml2ZVByb2Nlc3MnLCBcIldoZW4gdGhlIHRlcm1pbmFsIHByb2Nlc3MgbXVzdCBiZSBzaHV0IGRvd24gKGZvciBleGFtcGxlIG9uIHdpbmRvdyBvciBhcHBsaWNhdGlvbiBjbG9zZSksIHRoaXMgZGV0ZXJtaW5lcyB3aGVuIHRoZSBwcmV2aW91cyB0ZXJtaW5hbCBzZXNzaW9uIGNvbnRlbnRzL2hpc3Rvcnkgc2hvdWxkIGJlIHJlc3RvcmVkIGFuZCBwcm9jZXNzZXMgYmUgcmVjcmVhdGVkIHdoZW4gdGhlIHdvcmtzcGFjZSBpcyBuZXh0IG9wZW5lZC5cXG5cXG5DYXZlYXRzOlxcblxcbi0gUmVzdG9yaW5nIG9mIHRoZSBwcm9jZXNzIGN1cnJlbnQgd29ya2luZyBkaXJlY3RvcnkgZGVwZW5kcyBvbiB3aGV0aGVyIGl0IGlzIHN1cHBvcnRlZCBieSB0aGUgc2hlbGwuXFxuLSBUaW1lIHRvIHBlcnNpc3QgdGhlIHNlc3Npb24gZHVyaW5nIHNodXRkb3duIGlzIGxpbWl0ZWQsIHNvIGl0IG1heSBiZSBhYm9ydGVkIHdoZW4gdXNpbmcgaGlnaC1sYXRlbmN5IHJlbW90ZSBjb25uZWN0aW9ucy5cIiksXG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0ZW51bTogWydvbkV4aXQnLCAnb25FeGl0QW5kV2luZG93Q2xvc2UnLCAnbmV2ZXInXSxcblx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnBlcnNpc3RlbnRTZXNzaW9uUmV2aXZlUHJvY2Vzcy5vbkV4aXQnLCBcIlJldml2ZSB0aGUgcHJvY2Vzc2VzIGFmdGVyIHRoZSBsYXN0IHdpbmRvdyBpcyBjbG9zZWQgb24gV2luZG93cy9MaW51eCBvciB3aGVuIHRoZSBgd29ya2JlbmNoLmFjdGlvbi5xdWl0YCBjb21tYW5kIGlzIHRyaWdnZXJlZCAoY29tbWFuZCBwYWxldHRlLCBrZXliaW5kaW5nLCBtZW51KS5cIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5wZXJzaXN0ZW50U2Vzc2lvblJldml2ZVByb2Nlc3Mub25FeGl0QW5kV2luZG93Q2xvc2UnLCBcIlJldml2ZSB0aGUgcHJvY2Vzc2VzIGFmdGVyIHRoZSBsYXN0IHdpbmRvdyBpcyBjbG9zZWQgb24gV2luZG93cy9MaW51eCBvciB3aGVuIHRoZSBgd29ya2JlbmNoLmFjdGlvbi5xdWl0YCBjb21tYW5kIGlzIHRyaWdnZXJlZCAoY29tbWFuZCBwYWxldHRlLCBrZXliaW5kaW5nLCBtZW51KSwgb3Igd2hlbiB0aGUgd2luZG93IGlzIGNsb3NlZC5cIiksXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5wZXJzaXN0ZW50U2Vzc2lvblJldml2ZVByb2Nlc3MubmV2ZXInLCBcIk5ldmVyIHJlc3RvcmUgdGhlIHRlcm1pbmFsIGJ1ZmZlcnMgb3IgcmVjcmVhdGUgdGhlIHByb2Nlc3MuXCIpXG5cdFx0XSxcblx0XHRkZWZhdWx0OiAnb25FeGl0J1xuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuSGlkZU9uU3RhcnR1cF06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuaGlkZU9uU3RhcnR1cCcsIFwiV2hldGhlciB0byBoaWRlIHRoZSB0ZXJtaW5hbCB2aWV3IG9uIHN0YXJ0dXAsIGF2b2lkaW5nIGNyZWF0aW5nIGEgdGVybWluYWwgd2hlbiB0aGVyZSBhcmUgbm8gcGVyc2lzdGVudCBzZXNzaW9ucy5cIiksXG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0ZW51bTogWyduZXZlcicsICd3aGVuRW1wdHknLCAnYWx3YXlzJ10sXG5cdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgnaGlkZU9uU3RhcnR1cC5uZXZlcicsIFwiTmV2ZXIgaGlkZSB0aGUgdGVybWluYWwgdmlldyBvbiBzdGFydHVwLlwiKSxcblx0XHRcdGxvY2FsaXplKCdoaWRlT25TdGFydHVwLndoZW5FbXB0eScsIFwiT25seSBoaWRlIHRoZSB0ZXJtaW5hbCB3aGVuIHRoZXJlIGFyZSBubyBwZXJzaXN0ZW50IHNlc3Npb25zIHJlc3RvcmVkLlwiKSxcblx0XHRcdGxvY2FsaXplKCdoaWRlT25TdGFydHVwLmFsd2F5cycsIFwiQWx3YXlzIGhpZGUgdGhlIHRlcm1pbmFsLCBldmVuIHdoZW4gdGhlcmUgYXJlIHBlcnNpc3RlbnQgc2Vzc2lvbnMgcmVzdG9yZWQuXCIpXG5cdFx0XSxcblx0XHRkZWZhdWx0OiAnbmV2ZXInLFxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuSGlkZU9uTGFzdENsb3NlZF06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuaGlkZU9uTGFzdENsb3NlZCcsIFwiV2hldGhlciB0byBoaWRlIHRoZSB0ZXJtaW5hbCB2aWV3IHdoZW4gdGhlIGxhc3QgdGVybWluYWwgaXMgY2xvc2VkLiBUaGlzIHdpbGwgb25seSBoYXBwZW4gd2hlbiB0aGUgdGVybWluYWwgaXMgdGhlIG9ubHkgdmlzaWJsZSB2aWV3IGluIHRoZSB2aWV3IGNvbnRhaW5lci5cIiksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IHRydWVcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkN1c3RvbUdseXBoc106IHtcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5jdXN0b21HbHlwaHMnLCBcIldoZXRoZXIgdG8gZHJhdyBjdXN0b20gZ2x5cGhzIGluc3RlYWQgb2YgdXNpbmcgdGhlIGZvbnQgZm9yIHRoZSBmb2xsb3dpbmcgdW5pY29kZSByYW5nZXM6XFxuXFxuezB9XFxuXFxuVGhpcyB3aWxsIHR5cGljYWxseSByZXN1bHQgaW4gYmV0dGVyIHJlbmRlcmluZyB3aXRoIGNvbnRpbnVvdXMgbGluZXMsIGV2ZW4gd2hlbiBsaW5lIGhlaWdodCBhbmQgbGV0dGVyIHNwYWNpbmcgaXMgdXNlZC4gVGhpcyBmZWF0dXJlIG9ubHkgd29ya3Mgd2hlbiB7MX0gaXMgZW5hYmxlZC5cIiwgW1xuXHRcdFx0Jy0gQm94IERyYXdpbmcgKFUrMjUwMC1VKzI1N0YpJyxcblx0XHRcdCctIEJsb2NrIEVsZW1lbnRzIChVKzI1ODAtVSsyNTlGKScsXG5cdFx0XHQnLSBCcmFpbGxlIFBhdHRlcm5zIChVKzI4MDAtVSsyOEZGKScsXG5cdFx0XHQnLSBQb3dlcmxpbmUgU3ltYm9scyAoVStFMEEwLVUrRTBENCwgUHJpdmF0ZSBVc2UgQXJlYSknLFxuXHRcdFx0Jy0gUHJvZ3Jlc3MgSW5kaWNhdG9ycyAoVStFRTAwLVUrRUUwQiwgUHJpdmF0ZSBVc2UgQXJlYSknLFxuXHRcdFx0Jy0gR2l0IEJyYW5jaCBTeW1ib2xzIChVK0Y1RDAtVStGNjBELCBQcml2YXRlIFVzZSBBcmVhKScsXG5cdFx0XHQnLSBTeW1ib2xzIGZvciBMZWdhY3kgQ29tcHV0aW5nIChVKzFGQjAwLVUrMUZCRkYpJ1xuXHRcdF0uam9pbignXFxuJyksIGBcXGAjJHtUZXJtaW5hbFNldHRpbmdJZC5HcHVBY2NlbGVyYXRpb259I1xcYGApLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5SZXNjYWxlT3ZlcmxhcHBpbmdHbHlwaHNdOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQucmVzY2FsZU92ZXJsYXBwaW5nR2x5cGhzJywgXCJXaGV0aGVyIHRvIHJlc2NhbGUgZ2x5cGhzIGhvcml6b250YWxseSB0aGF0IGFyZSBhIHNpbmdsZSBjZWxsIHdpZGUgYnV0IGhhdmUgZ2x5cGhzIHRoYXQgd291bGQgb3ZlcmxhcCBmb2xsb3dpbmcgY2VsbChzKS4gVGhpcyB0eXBpY2FsbHkgaGFwcGVucyBmb3IgYW1iaWd1b3VzIHdpZHRoIGNoYXJhY3RlcnMgKGVnLiB0aGUgcm9tYW4gbnVtZXJhbCBjaGFyYWN0ZXJzIFUrMjE2MCspIHdoaWNoIGFyZW4ndCBmZWF0dXJlZCBpbiBtb25vc3BhY2UgZm9udHMuIEVtb2ppIGdseXBocyBhcmUgbmV2ZXIgcmVzY2FsZWQuXCIpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5FbmFibGVLaXR0eUtleWJvYXJkUHJvdG9jb2xdOiB7XG5cdFx0cmVzdHJpY3RlZDogdHJ1ZSxcblx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5lbmFibGVLaXR0eUtleWJvYXJkUHJvdG9jb2wnLCBcIldoZXRoZXIgdG8gZW5hYmxlIHRoZSBraXR0eSBrZXlib2FyZCBwcm90b2NvbCwgd2hpY2ggYWxsb3dzIGEgcHJvZ3JhbSBpbiB0aGUgdGVybWluYWwgdG8gcmVxdWVzdCBtb3JlIGRldGFpbGVkIGtleWJvYXJkIGlucHV0IHJlcG9ydGluZy4gVGhpcyBjYW4sIGZvciBleGFtcGxlLCBlbmFibGUgYFNoaWZ0K0VudGVyYCB0byBiZSBoYW5kbGVkIGJ5IHRoZSBwcm9ncmFtLlwiKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHR0YWdzOiBbJ2FkdmFuY2VkJ11cblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkVuYWJsZVdpbjMySW5wdXRNb2RlXToge1xuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZW5hYmxlV2luMzJJbnB1dE1vZGUnLCBcIldoZXRoZXIgdG8gZW5hYmxlIHRoZSB3aW4zMiBpbnB1dCBtb2RlLCB3aGljaCBwcm92aWRlcyBlbmhhbmNlZCBrZXlib2FyZCBpbnB1dCBzdXBwb3J0IG9uIFdpbmRvd3MuXCIpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHR0YWdzOiBbJ2V4cGVyaW1lbnRhbCcsICdhZHZhbmNlZCddLFxuXHRcdGV4cGVyaW1lbnQ6IHtcblx0XHRcdG1vZGU6ICdhdXRvJ1xuXHRcdH1cblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLlNoZWxsSW50ZWdyYXRpb25FbmFibGVkXToge1xuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuc2hlbGxJbnRlZ3JhdGlvbi5lbmFibGVkJywgXCJEZXRlcm1pbmVzIHdoZXRoZXIgb3Igbm90IHNoZWxsIGludGVncmF0aW9uIGlzIGF1dG8taW5qZWN0ZWQgdG8gc3VwcG9ydCBmZWF0dXJlcyBsaWtlIGVuaGFuY2VkIGNvbW1hbmQgdHJhY2tpbmcgYW5kIGN1cnJlbnQgd29ya2luZyBkaXJlY3RvcnkgZGV0ZWN0aW9uLiBcXG5cXG5TaGVsbCBpbnRlZ3JhdGlvbiB3b3JrcyBieSBpbmplY3RpbmcgdGhlIHNoZWxsIHdpdGggYSBzdGFydHVwIHNjcmlwdC4gVGhlIHNjcmlwdCBnaXZlcyBWUyBDb2RlIGluc2lnaHQgaW50byB3aGF0IGlzIGhhcHBlbmluZyB3aXRoaW4gdGhlIHRlcm1pbmFsLlxcblxcblN1cHBvcnRlZCBzaGVsbHM6XFxuXFxuLSBMaW51eC9tYWNPUzogYmFzaCwgZmlzaCwgcHdzaCwgenNoXFxuIC0gV2luZG93czogcHdzaCwgZ2l0IGJhc2hcXG5cXG5UaGlzIHNldHRpbmcgYXBwbGllcyBvbmx5IHdoZW4gdGVybWluYWxzIGFyZSBjcmVhdGVkLCBzbyB5b3Ugd2lsbCBuZWVkIHRvIHJlc3RhcnQgeW91ciB0ZXJtaW5hbHMgZm9yIGl0IHRvIHRha2UgZWZmZWN0LlxcblxcbiBOb3RlIHRoYXQgdGhlIHNjcmlwdCBpbmplY3Rpb24gbWF5IG5vdCB3b3JrIGlmIHlvdSBoYXZlIGN1c3RvbSBhcmd1bWVudHMgZGVmaW5lZCBpbiB0aGUgdGVybWluYWwgcHJvZmlsZSwgaGF2ZSBlbmFibGVkIHsxfSwgaGF2ZSBhIFtjb21wbGV4IGJhc2ggYFBST01QVF9DT01NQU5EYF0oaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9lZGl0b3IvaW50ZWdyYXRlZC10ZXJtaW5hbCNfY29tcGxleC1iYXNoLXByb21wdGNvbW1hbmQpLCBvciBvdGhlciB1bnN1cHBvcnRlZCBzZXR1cC4gVG8gZGlzYWJsZSBkZWNvcmF0aW9ucywgc2VlIHswfVwiLCAnYCN0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNoZWxsSW50ZWdyYXRpb24uZGVjb3JhdGlvbnNFbmFibGVkI2AnLCAnYCNlZGl0b3IuYWNjZXNzaWJpbGl0eVN1cHBvcnQjYCcpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiB0cnVlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5TaGVsbEludGVncmF0aW9uRGVjb3JhdGlvbnNFbmFibGVkXToge1xuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuc2hlbGxJbnRlZ3JhdGlvbi5kZWNvcmF0aW9uc0VuYWJsZWQnLCBcIldoZW4gc2hlbGwgaW50ZWdyYXRpb24gaXMgZW5hYmxlZCwgYWRkcyBhIGRlY29yYXRpb24gZm9yIGVhY2ggY29tbWFuZC5cIiksXG5cdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0ZW51bTogWydib3RoJywgJ2d1dHRlcicsICdvdmVydmlld1J1bGVyJywgJ25ldmVyJ10sXG5cdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuc2hlbGxJbnRlZ3JhdGlvbi5kZWNvcmF0aW9uc0VuYWJsZWQuYm90aCcsIFwiU2hvdyBkZWNvcmF0aW9ucyBpbiB0aGUgZ3V0dGVyIChsZWZ0KSBhbmQgb3ZlcnZpZXcgcnVsZXIgKHJpZ2h0KVwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNoZWxsSW50ZWdyYXRpb24uZGVjb3JhdGlvbnNFbmFibGVkLmd1dHRlcicsIFwiU2hvdyBndXR0ZXIgZGVjb3JhdGlvbnMgdG8gdGhlIGxlZnQgb2YgdGhlIHRlcm1pbmFsXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuc2hlbGxJbnRlZ3JhdGlvbi5kZWNvcmF0aW9uc0VuYWJsZWQub3ZlcnZpZXdSdWxlcicsIFwiU2hvdyBvdmVydmlldyBydWxlciBkZWNvcmF0aW9ucyB0byB0aGUgcmlnaHQgb2YgdGhlIHRlcm1pbmFsXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuc2hlbGxJbnRlZ3JhdGlvbi5kZWNvcmF0aW9uc0VuYWJsZWQubmV2ZXInLCBcIkRvIG5vdCBzaG93IGRlY29yYXRpb25zXCIpLFxuXHRcdF0sXG5cdFx0ZGVmYXVsdDogJ2JvdGgnXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5TaGVsbEludGVncmF0aW9uVGltZW91dF06IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNoZWxsSW50ZWdyYXRpb24udGltZW91dCcsIFwiQ29uZmlndXJlcyB0aGUgZHVyYXRpb24gaW4gbWlsbGlzZWNvbmRzIHRvIHdhaXQgZm9yIHNoZWxsIGludGVncmF0aW9uIGFmdGVyIGxhdW5jaCBiZWZvcmUgZGVjbGFyaW5nIGl0J3Mgbm90IHRoZXJlLiBUaGUgZGVmYXVsdCB2YWx1ZSB7MH0gdXNlcyBhIHZhcmlhYmxlIHdhaXQgdGltZSBiYXNlZCBvbiB3aGV0aGVyIHNoZWxsIGludGVncmF0aW9uIGluamVjdGlvbiBpcyBlbmFibGVkIGFuZCB3aGV0aGVyIGl0J3MgYSByZW1vdGUgd2luZG93LiBWYWx1ZXMgYmV0d2VlbiAxIGFuZCA0OTkgYXJlIGNsYW1wZWQgdG8gNTAwbXMuIENvbnNpZGVyIHNldHRpbmcgdGhpcyB0byBhIGxhcmdlIHZhbHVlIGlmIHlvdXIgc2hlbGwgc3RhcnRzIHZlcnkgc2xvd2x5LlwiLCAnYC0xYCcpLFxuXHRcdHR5cGU6ICdpbnRlZ2VyJyxcblx0XHRtaW5pbXVtOiAtMSxcblx0XHRtYXhpbXVtOiA2MDAwMCxcblx0XHRkZWZhdWx0OiAtMVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuU2hlbGxJbnRlZ3JhdGlvblF1aWNrRml4RW5hYmxlZF06IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNoZWxsSW50ZWdyYXRpb24ucXVpY2tGaXhFbmFibGVkJywgXCJXaGVuIHNoZWxsIGludGVncmF0aW9uIGlzIGVuYWJsZWQsIGVuYWJsZXMgcXVpY2sgZml4ZXMgZm9yIHRlcm1pbmFsIGNvbW1hbmRzIHRoYXQgYXBwZWFyIGFzIGEgbGlnaHRidWxiIG9yIHNwYXJrbGUgaWNvbiB0byB0aGUgbGVmdCBvZiB0aGUgcHJvbXB0LlwiKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogdHJ1ZVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuU2hlbGxJbnRlZ3JhdGlvbkVudmlyb25tZW50UmVwb3J0aW5nXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLnNoZWxsSW50ZWdyYXRpb24uZW52aXJvbm1lbnRSZXBvcnRpbmcnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gcmVwb3J0IHRoZSBzaGVsbCBlbnZpcm9ubWVudCwgZW5hYmxpbmcgaXRzIHVzZSBpbiBmZWF0dXJlcyBzdWNoIGFzIHswfS4gVGhpcyBtYXkgY2F1c2UgYSBzbG93ZG93biB3aGVuIHByaW50aW5nIHlvdXIgc2hlbGwncyBwcm9tcHQuXCIsIGBcXGAjJHtUZXJtaW5hbENvbnRyaWJTZXR0aW5nSWQuU3VnZ2VzdEVuYWJsZWR9I1xcYGApLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiBwcm9kdWN0LnF1YWxpdHkgIT09ICdzdGFibGUnXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5TbW9vdGhTY3JvbGxpbmddOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuc21vb3RoU2Nyb2xsaW5nJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSB0ZXJtaW5hbCB3aWxsIHNjcm9sbCB1c2luZyBhbiBhbmltYXRpb24uXCIpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiBmYWxzZVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuSWdub3JlQnJhY2tldGVkUGFzdGVNb2RlXToge1xuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmlnbm9yZUJyYWNrZXRlZFBhc3RlTW9kZScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgdGVybWluYWwgd2lsbCBpZ25vcmUgYnJhY2tldGVkIHBhc3RlIG1vZGUgZXZlbiBpZiB0aGUgdGVybWluYWwgd2FzIHB1dCBpbnRvIHRoZSBtb2RlLCBvbWl0dGluZyB0aGUgezB9IGFuZCB7MX0gc2VxdWVuY2VzIHdoZW4gcGFzdGluZy4gVGhpcyBpcyB1c2VmdWwgd2hlbiB0aGUgc2hlbGwgaXMgbm90IHJlc3BlY3RpbmcgdGhlIG1vZGUgd2hpY2ggY2FuIGhhcHBlbiBpbiBzdWItc2hlbGxzIGZvciBleGFtcGxlLlwiLCAnYFxcXFx4MWJbMjAwfmAnLCAnYFxcXFx4MWJbMjAxfmAnKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogZmFsc2Vcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkVuYWJsZUltYWdlc106IHtcblx0XHRyZXN0cmljdGVkOiB0cnVlLFxuXHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmVuYWJsZUltYWdlcycsIFwiRW5hYmxlcyBpbWFnZSBzdXBwb3J0IGluIHRoZSB0ZXJtaW5hbCwgdGhpcyB3aWxsIG9ubHkgd29yayB3aGVuIHswfSBpcyBlbmFibGVkLiBTaXhlbCBhbmQgaVRlcm0ncyBpbmxpbmUgaW1hZ2UgcHJvdG9jb2wgYXJlIHN1cHBvcnRlZCBvbiBMaW51eCBhbmQgbWFjT1MuIFRoZSBraXR0eSBncmFwaGljcyBwcm90b2NvbCBpcyBzdXBwb3J0ZWQgb24gYWxsIHBsYXRmb3Jtcy4gT24gV2luZG93cywgYWxsIGltYWdlIHByb3RvY29scyB3aWxsIG9ubHkgd29yayBmb3IgdmVyc2lvbnMgb2YgQ29uUFRZID49IHYyIHdoaWNoIGlzIHNoaXBwZWQgd2l0aCBXaW5kb3dzIGl0c2VsZiwgc2VlIGFsc28gezF9LiBJbWFnZXMgd2lsbCBjdXJyZW50bHkgbm90IGJlIHJlc3RvcmVkIGJldHdlZW4gd2luZG93IHJlbG9hZHMvcmVjb25uZWN0cy4gV2hlbiBlbmFibGVkLCB0cmFuc3BhcmVuY3kgbW9kZSBpcyBhbHNvIHR1cm5lZCBvbiBpbiB0aGUgdGVybWluYWwuXCIsIGBcXGAjJHtUZXJtaW5hbFNldHRpbmdJZC5HcHVBY2NlbGVyYXRpb259I1xcYGAsIGBcXGAjJHtUZXJtaW5hbFNldHRpbmdJZC5XaW5kb3dzVXNlQ29ucHR5RGxsfSNcXGBgKSxcblx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0ZGVmYXVsdDogZmFsc2Vcblx0fSxcblx0W1Rlcm1pbmFsU2V0dGluZ0lkLkZvY3VzQWZ0ZXJSdW5dOiB7XG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZm9jdXNBZnRlclJ1bicsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgdGVybWluYWwsIGFjY2Vzc2libGUgYnVmZmVyLCBvciBuZWl0aGVyIHdpbGwgYmUgZm9jdXNlZCBhZnRlciBgVGVybWluYWw6IFJ1biBTZWxlY3RlZCBUZXh0IEluIEFjdGl2ZSBUZXJtaW5hbGAgaGFzIGJlZW4gcnVuLlwiKSxcblx0XHRlbnVtOiBbJ3Rlcm1pbmFsJywgJ2FjY2Vzc2libGUtYnVmZmVyJywgJ25vbmUnXSxcblx0XHRkZWZhdWx0OiAnbm9uZScsXG5cdFx0dGFnczogWydhY2Nlc3NpYmlsaXR5J10sXG5cdFx0bWFya2Rvd25FbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRsb2NhbGl6ZSgndGVybWluYWwuaW50ZWdyYXRlZC5mb2N1c0FmdGVyUnVuLnRlcm1pbmFsJywgXCJBbHdheXMgZm9jdXMgdGhlIHRlcm1pbmFsLlwiKSxcblx0XHRcdGxvY2FsaXplKCd0ZXJtaW5hbC5pbnRlZ3JhdGVkLmZvY3VzQWZ0ZXJSdW4uYWNjZXNzaWJsZS1idWZmZXInLCBcIkFsd2F5cyBmb2N1cyB0aGUgYWNjZXNzaWJsZSBidWZmZXIuXCIpLFxuXHRcdFx0bG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZm9jdXNBZnRlclJ1bi5ub25lJywgXCJEbyBub3RoaW5nLlwiKSxcblx0XHRdXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5BbGxvd0luVW50cnVzdGVkV29ya3NwYWNlXToge1xuXHRcdHJlc3RyaWN0ZWQ6IHRydWUsXG5cdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuYWxsb3dJblVudHJ1c3RlZFdvcmtzcGFjZScsIFwiQ29udHJvbHMgd2hldGhlciB0ZXJtaW5hbHMgY2FuIGJlIGNyZWF0ZWQgaW4gYW4gdW50cnVzdGVkIHdvcmtzcGFjZS5cXG5cXG4qKlRoaXMgZmVhdHVyZSBieXBhc3NlcyBhIHNlY3VyaXR5IHByb3RlY3Rpb24gdGhhdCBwcmV2ZW50cyB0ZXJtaW5hbHMgZnJvbSBsYXVuY2hpbmcgaW4gdW50cnVzdGVkIHdvcmtzcGFjZXMuIFRoZSByZWFzb24gdGhpcyBpcyBhIHNlY3VyaXR5IHJpc2sgaXMgYmVjYXVzZSBzaGVsbHMgYXJlIG9mdGVuIHNldCB1cCB0byBwb3RlbnRpYWxseSBleGVjdXRlIGNvZGUgYXV0b21hdGljYWxseSBiYXNlZCBvbiB0aGUgY29udGVudHMgb2YgdGhlIGN1cnJlbnQgd29ya2luZyBkaXJlY3RvcnkuIFRoaXMgc2hvdWxkIGJlIHNhZmUgdG8gdXNlIHByb3ZpZGVkIHlvdXIgc2hlbGwgaXMgc2V0IHVwIGluIHN1Y2ggYSB3YXkgdGhhdCBjb2RlIGV4ZWN1dGlvbiBpbiB0aGUgZm9sZGVyIG5ldmVyIGhhcHBlbnMuKipcIiksXG5cdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdGRlZmF1bHQ6IGZhbHNlXG5cdH0sXG5cdFtUZXJtaW5hbFNldHRpbmdJZC5EZXZlbG9wZXJQdHlIb3N0TGF0ZW5jeV06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZGV2ZWxvcGVyLnB0eUhvc3QubGF0ZW5jeScsIFwiU2ltdWxhdGVkIGxhdGVuY3kgaW4gbWlsbGlzZWNvbmRzIGFwcGxpZWQgdG8gYWxsIGNhbGxzIG1hZGUgdG8gdGhlIHB0eSBob3N0LiBUaGlzIGlzIHVzZWZ1bCBmb3IgdGVzdGluZyB0ZXJtaW5hbCBiZWhhdmlvciB1bmRlciBoaWdoIGxhdGVuY3kgY29uZGl0aW9ucy5cIiksXG5cdFx0dHlwZTogJ251bWJlcicsXG5cdFx0bWluaW11bTogMCxcblx0XHRkZWZhdWx0OiAwLFxuXHRcdHRhZ3M6IFsnYWR2YW5jZWQnXVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuRGV2ZWxvcGVyUHR5SG9zdFN0YXJ0dXBEZWxheV06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZGV2ZWxvcGVyLnB0eUhvc3Quc3RhcnR1cERlbGF5JywgXCJTaW11bGF0ZWQgc3RhcnR1cCBkZWxheSBpbiBtaWxsaXNlY29uZHMgZm9yIHRoZSBwdHkgaG9zdCBwcm9jZXNzLiBUaGlzIGlzIHVzZWZ1bCBmb3IgdGVzdGluZyB0ZXJtaW5hbCBpbml0aWFsaXphdGlvbiB1bmRlciBzbG93IHN0YXJ0dXAgY29uZGl0aW9ucy5cIiksXG5cdFx0dHlwZTogJ251bWJlcicsXG5cdFx0bWluaW11bTogMCxcblx0XHRkZWZhdWx0OiAwLFxuXHRcdHRhZ3M6IFsnYWR2YW5jZWQnXVxuXHR9LFxuXHRbVGVybWluYWxTZXR0aW5nSWQuRGV2TW9kZV06IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlcm1pbmFsLmludGVncmF0ZWQuZGV2ZWxvcGVyLmRldk1vZGUnLCBcIkVuYWJsZSBkZXZlbG9wZXIgbW9kZSBmb3IgdGhlIHRlcm1pbmFsLiBUaGlzIHNob3dzIGFkZGl0aW9uYWwgZGVidWcgaW5mb3JtYXRpb24gYW5kIHZpc3VhbGl6YXRpb25zIGZvciBzaGVsbCBpbnRlZ3JhdGlvbiBzZXF1ZW5jZXMuXCIpLFxuXHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHR0YWdzOiBbJ2FkdmFuY2VkJ11cblx0fSxcblx0Li4udGVybWluYWxDb250cmliQ29uZmlndXJhdGlvbixcbn07XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiByZWdpc3RlclRlcm1pbmFsQ29uZmlndXJhdGlvbihnZXRGb250U25pcHBldHM6ICgpID0+IFByb21pc2U8SUpTT05TY2hlbWFTbmlwcGV0W10+KSB7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5cdGNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdGlkOiAndGVybWluYWwnLFxuXHRcdG9yZGVyOiAxMDAsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCd0ZXJtaW5hbEludGVncmF0ZWRDb25maWd1cmF0aW9uVGl0bGUnLCBcIkludGVncmF0ZWQgVGVybWluYWxcIiksXG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cHJvcGVydGllczogdGVybWluYWxDb25maWd1cmF0aW9uLFxuXHR9KTtcblx0dGVybWluYWxDb25maWd1cmF0aW9uW1Rlcm1pbmFsU2V0dGluZ0lkLkZvbnRGYW1pbHldLmRlZmF1bHRTbmlwcGV0cyA9IGF3YWl0IGdldEZvbnRTbmlwcGV0cygpO1xufVxuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb25NaWdyYXRpb24pXG5cdC5yZWdpc3RlckNvbmZpZ3VyYXRpb25NaWdyYXRpb25zKFt7XG5cdFx0a2V5OiBUZXJtaW5hbENvbnRyaWJTZXR0aW5nSWQuQWdlbnRTYW5kYm94RW5hYmxlZCxcblx0XHRtaWdyYXRlRm46ICh2YWx1ZTogdW5rbm93biwgdmFsdWVBY2Nlc3NvcikgPT4ge1xuXHRcdFx0aWYgKHZhbHVlICE9PSBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuQWxsb3dOZXR3b3JrKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzOiBDb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycyA9IFtbVGVybWluYWxDb250cmliU2V0dGluZ0lkLkFnZW50U2FuZGJveEVuYWJsZWQsIHsgdmFsdWU6IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiB9XV07XG5cdFx0XHRpZiAodmFsdWVBY2Nlc3NvcihUZXJtaW5hbENvbnRyaWJTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dOZXR3b3JrKSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzLnB1c2goW1Rlcm1pbmFsQ29udHJpYlNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd05ldHdvcmssIHsgdmFsdWU6IHRydWUgfV0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzO1xuXHRcdH1cblx0fSwge1xuXHRcdGtleTogVGVybWluYWxDb250cmliU2V0dGluZ0lkLkFnZW50U2FuZGJveFdpbmRvd3NFbmFibGVkLFxuXHRcdG1pZ3JhdGVGbjogKHZhbHVlOiB1bmtub3duLCB2YWx1ZUFjY2Vzc29yKSA9PiB7XG5cdFx0XHRpZiAodmFsdWUgIT09IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5BbGxvd05ldHdvcmspIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvbktleVZhbHVlUGFpcnM6IENvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzID0gW1tUZXJtaW5hbENvbnRyaWJTZXR0aW5nSWQuQWdlbnRTYW5kYm94V2luZG93c0VuYWJsZWQsIHsgdmFsdWU6IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiB9XV07XG5cdFx0XHRpZiAodmFsdWVBY2Nlc3NvcihUZXJtaW5hbENvbnRyaWJTZXR0aW5nSWQuQWdlbnRTYW5kYm94QWxsb3dOZXR3b3JrKSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGNvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzLnB1c2goW1Rlcm1pbmFsQ29udHJpYlNldHRpbmdJZC5BZ2VudFNhbmRib3hBbGxvd05ldHdvcmssIHsgdmFsdWU6IHRydWUgfV0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzO1xuXHRcdH1cblx0fSwge1xuXHRcdGtleTogVGVybWluYWxTZXR0aW5nSWQuRW5hYmxlQmVsbCxcblx0XHRtaWdyYXRlRm46IChlbmFibGVCZWxsLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvbktleVZhbHVlUGFpcnM6IENvbmZpZ3VyYXRpb25LZXlWYWx1ZVBhaXJzID0gW107XG5cdFx0XHRsZXQgYW5ub3VuY2VtZW50ID0gYWNjZXNzb3IoJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbEJlbGwnKT8uYW5ub3VuY2VtZW50ID8/IGFjY2Vzc29yKCdhY2Nlc3NpYmlsaXR5LmFsZXJ0LnRlcm1pbmFsQmVsbCcpO1xuXHRcdFx0aWYgKGFubm91bmNlbWVudCAhPT0gdW5kZWZpbmVkICYmICFpc1N0cmluZyhhbm5vdW5jZW1lbnQpKSB7XG5cdFx0XHRcdGFubm91bmNlbWVudCA9IGFubm91bmNlbWVudCA/ICdhdXRvJyA6ICdvZmYnO1xuXHRcdFx0fVxuXHRcdFx0Y29uZmlndXJhdGlvbktleVZhbHVlUGFpcnMucHVzaChbJ2FjY2Vzc2liaWxpdHkuc2lnbmFscy50ZXJtaW5hbEJlbGwnLCB7IHZhbHVlOiB7IHNvdW5kOiBlbmFibGVCZWxsID8gJ29uJyA6ICdvZmYnLCBhbm5vdW5jZW1lbnQgfSB9XSk7XG5cdFx0XHRjb25maWd1cmF0aW9uS2V5VmFsdWVQYWlycy5wdXNoKFtUZXJtaW5hbFNldHRpbmdJZC5FbmFibGVCZWxsLCB7IHZhbHVlOiB1bmRlZmluZWQgfV0pO1xuXHRcdFx0Y29uZmlndXJhdGlvbktleVZhbHVlUGFpcnMucHVzaChbVGVybWluYWxTZXR0aW5nSWQuRW5hYmxlVmlzdWFsQmVsbCwgeyB2YWx1ZTogZW5hYmxlQmVsbCB9XSk7XG5cdFx0XHRyZXR1cm4gY29uZmlndXJhdGlvbktleVZhbHVlUGFpcnM7XG5cdFx0fVxuXHR9XSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFHeEIsU0FBUyxhQUFhLGlCQUFpQjtBQUN2QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG9CQUFvQixrQkFBNkU7QUFDMUcsT0FBTyxhQUFhO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCLHlCQUF5QjtBQUMvRCxTQUFTLHFCQUFxQiwwQkFBMEI7QUFDeEQsU0FBc0UsY0FBYywyQkFBMkI7QUFDL0csU0FBUyw4QkFBOEIsZ0NBQWdDO0FBQ3ZFLFNBQVMsZ0NBQWdDLHdCQUF3QixxQkFBcUIscUJBQXFCLHFCQUFxQiwrQkFBK0I7QUFFL0osTUFBTSxzQkFBc0IsU0FBUztBQUFBLEVBQ3BDLGVBQWdCLFNBQVMsT0FBTywyQ0FBMkM7QUFBQSxFQUMzRSxxQkFBc0IsU0FBUyxhQUFhLG1QQUFtUDtBQUFBLEVBQy9SLDJCQUE0QixTQUFTLG1CQUFtQixtREFBbUQ7QUFBQSxFQUMzRywrQkFBZ0MsU0FBUyx1QkFBdUIsaUVBQWlFO0FBQUEsRUFDakksaUJBQWtCLFNBQVMsU0FBUyxtREFBbUQ7QUFBQSxFQUN2RixtQkFBb0IsU0FBUyxXQUFXLG1DQUFtQztBQUFBLEVBQzNFLG9CQUFxQixTQUFTLFlBQVksMkRBQTJEO0FBQUEsRUFDckcscUJBQXNCLFNBQVMsYUFBYSw2R0FBNkcsU0FBUztBQUFBLEVBQ2xLLG9CQUFxQixTQUFTLFlBQVksbURBQW1EO0FBQUEsRUFDN0YsZ0JBQWlCLFNBQVMsUUFBUSxvREFBb0Q7QUFBQSxFQUN0RixxQkFBc0IsU0FBUyxhQUFhLDBCQUEwQjtBQUFBLEVBQ3RFLHdCQUF5QixTQUFTLGdCQUFnQiwyS0FBMks7QUFBQSxFQUM3Tiw0QkFBNkIsU0FBUyxvQkFBb0IsK0RB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
