import themePickerContent from "./media/theme_picker.js";
import themePickerSmallContent from "./media/theme_picker_small.js";
import notebookProfileContent from "./media/notebookProfile.js";
import { localize } from "../../../../nls.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { NotebookSetting } from "../../notebook/common/notebookCommon.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../platform/accessibility/common/accessibility.js";
import product from "../../../../platform/product/common/product.js";
const defaultChat = {
  documentationUrl: product.defaultChatAgent?.documentationUrl ?? "",
  provider: product.defaultChatAgent?.provider ?? { default: { name: "" } },
  publicCodeMatchesUrl: product.defaultChatAgent?.publicCodeMatchesUrl ?? "",
  termsStatementUrl: product.defaultChatAgent?.termsStatementUrl ?? "",
  privacyStatementUrl: product.defaultChatAgent?.privacyStatementUrl ?? ""
};
function copilotSettingsMessage(manageSettingsUrl) {
  return localize({ key: "settings", comment: ['{Locked="["}', '{Locked="]({0})"}', '{Locked="]({1})"}'] }, "{0} Copilot may show [public code]({1}) suggestions and use your data to improve the product. You can change these [settings]({2}) anytime.", defaultChat.provider.default.name, defaultChat.publicCodeMatchesUrl, manageSettingsUrl);
}
class GettingStartedContentProviderRegistry {
  constructor() {
    this.providers = /* @__PURE__ */ new Map();
  }
  registerProvider(moduleId, provider) {
    this.providers.set(moduleId, provider);
  }
  getProvider(moduleId) {
    return this.providers.get(moduleId);
  }
}
const gettingStartedContentRegistry = new GettingStartedContentProviderRegistry();
async function moduleToContent(resource) {
  if (!resource.query) {
    throw new Error("Getting Started: invalid resource");
  }
  const query = JSON.parse(resource.query);
  if (!query.moduleId) {
    throw new Error("Getting Started: invalid resource");
  }
  const provider = gettingStartedContentRegistry.getProvider(query.moduleId);
  if (!provider) {
    throw new Error(`Getting Started: no provider registered for ${query.moduleId}`);
  }
  return provider();
}
gettingStartedContentRegistry.registerProvider("vs/workbench/contrib/welcomeGettingStarted/common/media/theme_picker", themePickerContent);
gettingStartedContentRegistry.registerProvider("vs/workbench/contrib/welcomeGettingStarted/common/media/theme_picker_small", themePickerSmallContent);
gettingStartedContentRegistry.registerProvider("vs/workbench/contrib/welcomeGettingStarted/common/media/notebookProfile", notebookProfileContent);
gettingStartedContentRegistry.registerProvider("vs/workbench/contrib/welcomeGettingStarted/common/media/empty", () => "");
const setupIcon = registerIcon("getting-started-setup", Codicon.zap, localize("getting-started-setup-icon", "Icon used for the setup category of welcome page"));
const beginnerIcon = registerIcon("getting-started-beginner", Codicon.lightbulb, localize("getting-started-beginner-icon", "Icon used for the beginner category of welcome page"));
const startEntries = [
  {
    id: "welcome.showNewFileEntries",
    title: localize("gettingStarted.newFile.title", "New File..."),
    description: localize("gettingStarted.newFile.description", "Open a new untitled text file, notebook, or custom editor."),
    icon: Codicon.newFile,
    content: {
      type: "startEntry",
      command: "command:welcome.showNewFileEntries"
    }
  },
  {
    id: "topLevelOpenMac",
    title: localize("gettingStarted.openMac.title", "Open..."),
    description: localize("gettingStarted.openMac.description", "Open a file or folder to start working"),
    icon: Codicon.folderOpened,
    when: "!isWeb && isMac",
    content: {
      type: "startEntry",
      command: "command:workbench.action.files.openFileFolder"
    }
  },
  {
    id: "topLevelOpenFile",
    title: localize("gettingStarted.openFile.title", "Open File..."),
    description: localize("gettingStarted.openFile.description", "Open a file to start working"),
    icon: Codicon.goToFile,
    when: "isWeb || !isMac",
    content: {
      type: "startEntry",
      command: "command:workbench.action.files.openFile"
    }
  },
  {
    id: "topLevelOpenFolder",
    title: localize("gettingStarted.openFolder.title", "Open Folder..."),
    description: localize("gettingStarted.openFolder.description", "Open a folder to start working"),
    icon: Codicon.folderOpened,
    when: "!isWeb && !isMac",
    content: {
      type: "startEntry",
      command: "command:workbench.action.files.openFolder"
    }
  },
  {
    id: "topLevelOpenFolderWeb",
    title: localize("gettingStarted.openFolder.title", "Open Folder..."),
    description: localize("gettingStarted.openFolder.description", "Open a folder to start working"),
    icon: Codicon.folderOpened,
    when: "!openFolderWorkspaceSupport && workbenchState == 'workspace'",
    content: {
      type: "startEntry",
      command: "command:workbench.action.files.openFolderViaWorkspace"
    }
  },
  {
    id: "topLevelGitClone",
    title: localize("gettingStarted.topLevelGitClone.title", "Clone Git Repository..."),
    description: localize("gettingStarted.topLevelGitClone.description", "Clone a remote repository to a local folder"),
    when: "config.git.enabled && !git.missing",
    icon: Codicon.sourceControl,
    content: {
      type: "startEntry",
      command: "command:git.clone"
    }
  },
  {
    id: "topLevelGitOpen",
    title: localize("gettingStarted.topLevelGitOpen.title", "Open Repository..."),
    description: localize("gettingStarted.topLevelGitOpen.description", "Connect to a remote repository or pull request to browse, search, edit, and commit"),
    when: "workspacePlatform == 'webworker'",
    icon: Codicon.sourceControl,
    content: {
      type: "startEntry",
      command: "command:remoteHub.openRepository"
    }
  },
  {
    id: "topLevelRemoteOpen",
    title: localize("gettingStarted.topLevelRemoteOpen.title", "Connect to..."),
    description: localize("gettingStarted.topLevelRemoteOpen.description", "Connect to remote development workspaces."),
    when: "!isWeb",
    icon: Codicon.remote,
    content: {
      type: "startEntry",
      command: "command:workbench.action.remote.showMenu"
    }
  },
  {
    id: "topLevelOpenTunnel",
    title: localize("gettingStarted.topLevelOpenTunnel.title", "Open Tunnel..."),
    description: localize("gettingStarted.topLevelOpenTunnel.description", "Connect to a remote machine through a Tunnel"),
    when: "isWeb && showRemoteStartEntryInWeb",
    icon: Codicon.remote,
    content: {
      type: "startEntry",
      command: "command:workbench.action.remote.showWebStartEntryActions"
    }
  },
  {
    id: "topLevelNewWorkspaceChat",
    title: localize("gettingStarted.newWorkspaceChat.title", "Generate New Workspace..."),
    description: localize("gettingStarted.newWorkspaceChat.description", "Chat to create a new workspace"),
    icon: Codicon.chatSparkle,
    when: "!isWeb && !chatSetupHidden && !chatSetupDisabledInWorkspace",
    content: {
      type: "startEntry",
      command: "command:welcome.newWorkspaceChat"
    }
  }
];
const Button = (title, href) => `[${title}](${href})`;
const CopilotStepTitle = localize("gettingStarted.copilotSetup.title", "Use AI features with Copilot for free");
const CopilotDescription = localize({ key: "gettingStarted.copilotSetup.description", comment: ['{Locked="["}', '{Locked="]({0})"}'] }, "You can use [Copilot]({0}) to generate code across multiple files, fix errors, ask questions about your code, and much more using natural language.", defaultChat.documentationUrl ?? "");
const CopilotTermsString = localize({ key: "gettingStarted.copilotSetup.terms", comment: ['{Locked="]({2})"}', '{Locked="]({3})"}'] }, "By continuing with {0} Copilot, you agree to {1}'s [Terms]({2}) and [Privacy Statement]({3})", defaultChat.provider.default.name, defaultChat.provider.default.name, defaultChat.termsStatementUrl, defaultChat.privacyStatementUrl);
const CopilotAnonymousButton = Button(localize("setupCopilotButton.setup", "Use AI Features"), `command:workbench.action.chat.triggerSetupAnonymousWithoutDialog`);
const CopilotSignedOutButton = Button(localize("setupCopilotButton.setup", "Use AI Features"), `command:workbench.action.chat.triggerSetup`);
const CopilotSignedInButton = Button(localize("setupCopilotButton.setup", "Use AI Features"), `command:workbench.action.chat.triggerSetup`);
const CopilotCompleteButton = Button(localize("setupCopilotButton.chatWithCopilot", "Start to Chat"), "command:workbench.action.chat.open");
function createCopilotSetupStep(id, button, when, includeTerms) {
  const description = includeTerms ? `${CopilotDescription}
${CopilotTermsString}
${button}` : `${CopilotDescription}
${button}`;
  return {
    id,
    title: CopilotStepTitle,
    description,
    when: `${when} && !chatSetupHidden && !chatSetupDisabledInWorkspace`,
    media: {
      type: "svg",
      altText: "VS Code Copilot multi file edits",
      path: "multi-file-edits.svg"
    }
  };
}
const walkthroughs = [
  {
    id: "Setup",
    title: localize("gettingStarted.setup.title", "Get started with VS Code"),
    description: localize("gettingStarted.setup.description", "Customize your editor, learn the basics, and start coding"),
    isFeatured: true,
    icon: setupIcon,
    when: "!isWeb",
    walkthroughPageTitle: localize("gettingStarted.setup.walkthroughPageTitle", "Setup VS Code"),
    next: "Beginner",
    content: {
      type: "steps",
      steps: [
        createCopilotSetupStep("CopilotSetupAnonymous", CopilotAnonymousButton, "chatAnonymous && !chatSetupCompleted", true),
        createCopilotSetupStep("CopilotSetupSignedOut", CopilotSignedOutButton, "chatEntitlementSignedOut && !chatAnonymous && !github.copilot.hasByokModels", false),
        createCopilotSetupStep("CopilotSetupComplete", CopilotCompleteButton, "chatSetupCompleted && !chatSetupDisabled && (chatAnonymous || chatPlanPro || chatPlanProPlus || chatPlanMax || chatPlanBusiness || chatPlanEnterprise || chatPlanFree)", false),
        createCopilotSetupStep("CopilotSetupSignedIn", CopilotSignedInButton, "!chatEntitlementSignedOut && (!chatSetupCompleted || chatSetupDisabled || chatPlanCanSignUp)", false),
        {
          id: "pickColorTheme",
          title: localize("gettingStarted.pickColor.title", "Choose your theme"),
          description: localize("gettingStarted.pickColor.description.interpolated", "The right theme helps you focus on your code, is easy on your eyes, and is simply more fun to use.\n{0}", Button(localize("titleID", "Browse Color Themes"), "command:workbench.action.selectTheme")),
          completionEvents: [
            "onSettingChanged:workbench.colorTheme",
            "onCommand:workbench.action.selectTheme"
          ],
          media: { type: "markdown", path: "theme_picker" }
        },
        {
          id: "videoTutorial",
          title: localize("gettingStarted.videoTutorial.title", "Watch video tutorials"),
          description: localize("gettingStarted.videoTutorial.description.interpolated", "Watch the first in a series of short & practical video tutorials for VS Code's key features.\n{0}", Button(localize("watch", "Watch Tutorial"), "https://aka.ms/vscode-getting-started-video")),
          media: { type: "svg", altText: "VS Code Settings", path: "learn.svg" }
        }
      ]
    }
  },
  {
    id: "SetupWeb",
    title: localize("gettingStarted.setupWeb.title", "Get Started with VS Code for the Web"),
    description: localize("gettingStarted.setupWeb.description", "Customize your editor, learn the basics, and start coding"),
    isFeatured: true,
    icon: setupIcon,
    when: "isWeb",
    next: "Beginner",
    walkthroughPageTitle: localize("gettingStarted.setupWeb.walkthroughPageTitle", "Setup VS Code Web"),
    content: {
      type: "steps",
      steps: [
        {
          id: "pickColorThemeWeb",
          title: localize("gettingStarted.pickColor.title", "Choose your theme"),
          description: localize("gettingStarted.pickColor.description.interpolated", "The right theme helps you focus on your code, is easy on your eyes, and is simply more fun to use.\n{0}", Button(localize("titleID", "Browse Color Themes"), "command:workbench.action.selectTheme")),
          completionEvents: [
            "onSettingChanged:workbench.colorTheme",
            "onCommand:workbench.action.selectTheme"
          ],
          media: { type: "markdown", path: "theme_picker" }
        },
        {
          id: "menuBarWeb",
          title: localize("gettingStarted.menuBar.title", "Just the right amount of UI"),
          description: localize("gettingStarted.menuBar.description.interpolated", "The full menu bar is available in the dropdown menu to make room for your code. Toggle its appearance for faster access. \n{0}", Button(localize("toggleMenuBar", "Toggle Menu Bar"), "command:workbench.action.toggleMenuBar")),
          when: "isWeb",
          media: {
            type: "svg",
            altText: "Comparing menu dropdown with the visible menu bar.",
            path: "menuBar.svg"
          }
        },
        {
          id: "extensionsWebWeb",
          title: localize("gettingStarted.extensions.title", "Code with extensions"),
          description: localize("gettingStarted.extensionsWeb.description.interpolated", "Extensions are VS Code's power-ups. A growing number are becoming available in the web.\n{0}", Button(localize("browsePopularWeb", "Browse Popular Web Extensions"), "command:workbench.extensions.action.showPopularExtensions")),
          when: "workspacePlatform == 'webworker'",
          media: {
            type: "svg",
            altText: "VS Code extension marketplace with featured language extensions",
            path: "extensions-web.svg"
          }
        },
        {
          id: "findLanguageExtensionsWeb",
          title: localize("gettingStarted.findLanguageExts.title", "Rich support for all your languages"),
          description: localize("gettingStarted.findLanguageExts.description.interpolated", "Code smarter with syntax highlighting, inline suggestions, linting and debugging. While many languages are built-in, many more can be added as extensions.\n{0}", Button(localize("browseLangExts", "Browse Language Extensions"), "command:workbench.extensions.action.showLanguageExtensions")),
          when: "workspacePlatform != 'webworker'",
          media: {
            type: "svg",
            altText: "Language extensions",
            path: "languages.svg"
          }
        },
        {
          id: "settingsSyncWeb",
          title: localize("gettingStarted.settingsSync.title", "Sync settings across devices"),
          description: localize("gettingStarted.settingsSync.description.interpolated", "Keep your essential customizations backed up and updated across all your devices.\n{0}", Button(localize("enableSync", "Backup and Sync Settings"), "command:workbench.userDataSync.actions.turnOn")),
          when: "syncStatus != uninitialized",
          completionEvents: ["onEvent:sync-enabled"],
          media: {
            type: "svg",
            altText: 'The "Turn on Sync" entry in the settings gear menu.',
            path: "settingsSync.svg"
          }
        },
        {
          id: "commandPaletteTaskWeb",
          title: localize("gettingStarted.commandPalette.title", "Unlock productivity with the Command Palette "),
          description: localize("gettingStarted.commandPalette.description.interpolated", "Run commands without reaching for your mouse to accomplish any task in VS Code.\n{0}", Button(localize("commandPalette", "Open Command Palette"), "command:workbench.action.showCommands")),
          media: { type: "svg", altText: "Command Palette overlay for searching and executing commands.", path: "commandPalette.svg" }
        },
        {
          id: "pickAFolderTask-WebWeb",
          title: localize("gettingStarted.setup.OpenFolder.title", "Open up your code"),
          description: localize("gettingStarted.setup.OpenFolderWeb.description.interpolated", "You're all set to start coding. You can open a local project or a remote repository to get your files into VS Code.\n{0}\n{1}", Button(localize("openFolder", "Open Folder"), "command:workbench.action.addRootFolder"), Button(localize("openRepository", "Open Repository"), "command:remoteHub.openRepository")),
          when: "workspaceFolderCount == 0",
          media: {
            type: "svg",
            altText: "Explorer view showing buttons for opening folder and cloning repository.",
            path: "openFolder.svg"
          }
        },
        {
          id: "quickOpenWeb",
          title: localize("gettingStarted.quickOpen.title", "Quickly navigate between your files"),
          description: localize("gettingStarted.quickOpen.description.interpolated", "Navigate between files in an instant with one keystroke. Tip: Open multiple files by pressing the right arrow key.\n{0}", Button(localize("quickOpen", "Quick Open a File"), "command:toSide:workbench.action.quickOpen")),
          when: "workspaceFolderCount != 0",
          media: {
            type: "svg",
            altText: "Go to file in quick search.",
            path: "search.svg"
          }
        }
      ]
    }
  },
  {
    id: "SetupAccessibility",
    title: localize("gettingStarted.setupAccessibility.title", "Get Started with Accessibility Features"),
    description: localize("gettingStarted.setupAccessibility.description", "Learn the tools and shortcuts that make VS Code accessible. Note that some actions are not actionable from within the context of the walkthrough."),
    isFeatured: true,
    icon: setupIcon,
    when: CONTEXT_ACCESSIBILITY_MODE_ENABLED.key,
    next: "Setup",
    walkthroughPageTitle: localize("gettingStarted.setupAccessibility.walkthroughPageTitle", "Setup VS Code Accessibility"),
    content: {
      type: "steps",
      steps: [
        {
          id: "accessibilityHelp",
          title: localize("gettingStarted.accessibilityHelp.title", "Use the accessibility help dialog to learn about features"),
          description: localize("gettingStarted.accessibilityHelp.description.interpolated", "The accessibility help dialog provides information about what to expect from a feature and the commands/keybindings to operate them.\n With focus in an editor, terminal, notebook, chat response, comment, or debug console, the relevant dialog can be opened with the Open Accessibility Help command.\n{0}", Button(localize("openAccessibilityHelp", "Open Accessibility Help"), "command:editor.action.accessibilityHelp")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "accessibleView",
          title: localize("gettingStarted.accessibleView.title", "Screen reader users can inspect content line by line, character by character in the accessible view."),
          description: localize("gettingStarted.accessibleView.description.interpolated", "The accessible view is available for the terminal, hovers, notifications, comments, notebook output, chat responses, inline completions, and debug console output.\n With focus in any of those features, it can be opened with the Open Accessible View command.\n{0}", Button(localize("openAccessibleView", "Open Accessible View"), "command:editor.action.accessibleView")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "verbositySettings",
          title: localize("gettingStarted.verbositySettings.title", "Control the verbosity of aria labels"),
          description: localize("gettingStarted.verbositySettings.description.interpolated", "Screen reader verbosity settings exist for features around the workbench so that once a user is familiar with a feature, they can avoid hearing hints about how to operate it. For example, features for which an accessibility help dialog exists will indicate how to open the dialog until the verbosity setting for that feature has been disabled.\n These and other accessibility settings can be configured by running the Open Accessibility Settings command.\n{0}", Button(localize("openVerbositySettings", "Open Accessibility Settings"), "command:workbench.action.openAccessibilitySettings")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "commandPaletteTaskAccessibility",
          title: localize("gettingStarted.commandPaletteAccessibility.title", "Unlock productivity with the Command Palette "),
          description: localize("gettingStarted.commandPaletteAccessibility.description.interpolated", "Run commands without reaching for your mouse to accomplish any task in VS Code.\n{0}", Button(localize("commandPalette", "Open Command Palette"), "command:workbench.action.showCommands")),
          media: { type: "markdown", path: "empty" }
        },
        {
          id: "keybindingsAccessibility",
          title: localize("gettingStarted.keyboardShortcuts.title", "Customize your keyboard shortcuts"),
          description: localize("gettingStarted.keyboardShortcuts.description.interpolated", "Once you have discovered your favorite commands, create custom keyboard shortcuts for instant access.\n{0}", Button(localize("keyboardShortcuts", "Keyboard Shortcuts"), "command:toSide:workbench.action.openGlobalKeybindings")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "accessibilitySignals",
          title: localize("gettingStarted.accessibilitySignals.title", "Fine tune which accessibility signals you want to receive via audio or a braille device"),
          description: localize("gettingStarted.accessibilitySignals.description.interpolated", "Accessibility sounds and announcements are played around the workbench for different events.\n These can be discovered and configured using the List Signal Sounds and List Signal Announcements commands.\n{0}\n{1}", Button(localize("listSignalSounds", "List Signal Sounds"), "command:signals.sounds.help"), Button(localize("listSignalAnnouncements", "List Signal Announcements"), "command:accessibility.announcement.help")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "hover",
          title: localize("gettingStarted.hover.title", "Access the hover in the editor to get more information on a variable or symbol"),
          description: localize("gettingStarted.hover.description.interpolated", "While focus is in the editor on a variable or symbol, a hover can be focused with the Show or Open Hover command.\n{0}", Button(localize("showOrFocusHover", "Show or Focus Hover"), "command:editor.action.showHover")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "goToSymbol",
          title: localize("gettingStarted.goToSymbol.title", "Navigate to symbols in a file"),
          description: localize("gettingStarted.goToSymbol.description.interpolated", "The Go to Symbol command is useful for navigating between important landmarks in a document.\n{0}", Button(localize("openGoToSymbol", "Go to Symbol"), "command:editor.action.goToSymbol")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "codeFolding",
          title: localize("gettingStarted.codeFolding.title", "Use code folding to collapse blocks of code and focus on the code you're interested in."),
          description: localize("gettingStarted.codeFolding.description.interpolated", "Fold or unfold a code section with the Toggle Fold command.\n{0}\n Fold or unfold recursively with the Toggle Fold Recursively Command\n{1}\n", Button(localize("toggleFold", "Toggle Fold"), "command:editor.toggleFold"), Button(localize("toggleFoldRecursively", "Toggle Fold Recursively"), "command:editor.toggleFoldRecursively")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "intellisense",
          title: localize("gettingStarted.intellisense.title", "Use Intellisense to improve coding efficiency"),
          description: localize("gettingStarted.intellisense.description.interpolated", "Intellisense suggestions can be opened with the Trigger Intellisense command.\n{0}\n Inline intellisense suggestions can be triggered with Trigger Inline Suggestion\n{1}\n Useful settings include editor.inlineCompletionsAccessibilityVerbose and editor.screenReaderAnnounceInlineSuggestion.", Button(localize("triggerIntellisense", "Trigger Intellisense"), "command:editor.action.triggerSuggest"), Button(localize("triggerInlineSuggestion", "Trigger Inline Suggestion"), "command:editor.action.inlineSuggest.trigger")),
          media: {
            type: "markdown",
            path: "empty"
          }
        },
        {
          id: "accessibilitySettings",
          title: localize("gettingStarted.accessibilitySettings.title", "Configure accessibility settings"),
          description: localize("gettingStarted.accessibilitySettings.description.interpolated", "Accessibility settings can be configured by running the Open Accessibility Settings command.\n{0}", Button(localize("openAccessibilitySettings", "Open Accessibility Settings"), "command:workbench.action.openAccessibilitySettings")),
          media: { type: "markdown", path: "empty" }
        },
        {
          id: "dictation",
          title: localize("gettingStarted.dictation.title", "Use dictation to write code and text in the editor and terminal"),
          description: localize("gettingStarted.dictation.description.interpolated", "Dictation allows you to write code and text using your voice. It can be activated with the Voice: Start Dictation in Editor command.\n{0}\n For dictation in the terminal, use the Voice: Start Dictation in Terminal and Voice: Stop Dictation in Terminal commands.\n{1}\n{2}", Button(localize("toggleDictation", "Voice: Start Dictation in Editor"), "command:workbench.action.editorDictation.start"), Button(localize("terminalStartDictation", "Terminal: Start Dictation in Terminal"), "command:workbench.action.terminal.startVoice"), Button(localize("terminalStopDictation", "Terminal: Stop Dictation in Terminal"), "command:workbench.action.terminal.stopVoice")),
          when: "hasSpeechProvider",
          media: { type: "markdown", path: "empty" }
        }
      ]
    }
  },
  {
    id: "Beginner",
    isFeatured: false,
    title: localize("gettingStarted.beginner.title", "Learn the Fundamentals"),
    icon: beginnerIcon,
    description: localize("gettingStarted.beginner.description", "Get an overview of the most essential features"),
    walkthroughPageTitle: localize("gettingStarted.beginner.walkthroughPageTitle", "Essential Features"),
    content: {
      type: "steps",
      steps: [
        {
          id: "settingsAndSync",
          title: localize("gettingStarted.settings.title", "Tune your settings"),
          description: localize("gettingStarted.settingsAndSync.description.interpolated", "Customize every aspect of VS Code and [sync](command:workbench.userDataSync.actions.turnOn) customizations across devices.\n{0}", Button(localize("tweakSettings", "Open Settings"), "command:toSide:workbench.action.openSettings")),
          when: "workspacePlatform != 'webworker' && syncStatus != uninitialized",
          completionEvents: ["onEvent:sync-enabled"],
          media: {
            type: "svg",
            altText: "VS Code Settings",
            path: "settings.svg"
          }
        },
        {
          id: "extensions",
          title: localize("gettingStarted.extensions.title", "Code with extensions"),
          description: localize("gettingStarted.extensions.description.interpolated", "Extensions are VS Code's power-ups. They range from handy productivity hacks, expanding out-of-the-box features, to adding completely new capabilities.\n{0}", Button(localize("browsePopular", "Browse Popular Extensions"), "command:workbench.extensions.action.showPopularExtensions")),
          when: "workspacePlatform != 'webworker'",
          media: {
            type: "svg",
            altText: "VS Code extension marketplace with featured language extensions",
            path: "extensions.svg"
          }
        },
        {
          id: "terminal",
          title: localize("gettingStarted.terminal.title", "Built-in terminal"),
          description: localize("gettingStarted.terminal.description.interpolated", "Quickly run shell commands and monitor build output, right next to your code.\n{0}", Button(localize("showTerminal", "Open Terminal"), "command:workbench.action.terminal.toggleTerminal")),
          when: "workspacePlatform != 'webworker' && remoteName != codespaces && !terminalIsOpen",
          media: {
            type: "svg",
            altText: "Integrated terminal running a few npm commands",
            path: "terminal.svg"
          }
        },
        {
          id: "debugging",
          title: localize("gettingStarted.debug.title", "Watch your code in action"),
          description: localize("gettingStarted.debug.description.interpolated", "Accelerate your edit, build, test, and debug loop by setting up a launch configuration.\n{0}", Button(localize("runProject", "Run your Project"), "command:workbench.action.debug.selectandstart")),
          when: "workspacePlatform != 'webworker' && workspaceFolderCount != 0",
          media: {
            type: "svg",
            altText: "Run and debug view.",
            path: "debug.svg"
          }
        },
        {
          id: "scmClone",
          title: localize("gettingStarted.scm.title", "Track your code with Git"),
          description: localize("gettingStarted.scmClone.description.interpolated", "Set up the built-in version control for your project to track your changes and collaborate with others.\n{0}", Button(localize("cloneRepo", "Clone Repository"), "command:git.clone")),
          when: "config.git.enabled && !git.missing && workspaceFolderCount == 0",
          media: {
            type: "svg",
            altText: "Source Control view.",
            path: "git.svg"
          }
        },
        {
          id: "scmSetup",
          title: localize("gettingStarted.scm.title", "Track your code with Git"),
          description: localize("gettingStarted.scmSetup.description.interpolated", "Set up the built-in version control for your project to track your changes and collaborate with others.\n{0}", Button(localize("initRepo", "Initialize Git Repository"), "command:git.init")),
          when: "config.git.enabled && !git.missing && workspaceFolderCount != 0 && gitOpenRepositoryCount == 0",
          media: {
            type: "svg",
            altText: "Source Control view.",
            path: "git.svg"
          }
        },
        {
          id: "scm",
          title: localize("gettingStarted.scm.title", "Track your code with Git"),
          description: localize("gettingStarted.scm.description.interpolated", "No more looking up Git commands! Git and GitHub workflows are seamlessly integrated.\n{0}", Button(localize("openSCM", "Open Source Control"), "command:workbench.view.scm")),
          when: "config.git.enabled && !git.missing && workspaceFolderCount != 0 && gitOpenRepositoryCount != 0 && activeViewlet != 'workbench.view.scm'",
          media: {
            type: "svg",
            altText: "Source Control view.",
            path: "git.svg"
          }
        },
        {
          id: "installGit",
          title: localize("gettingStarted.installGit.title", "Install Git"),
          description: localize({ key: "gettingStarted.installGit.description.interpolated", comment: ["The placeholders are command link items should not be translated"] }, "Install Git to track changes in your projects.\n{0}\n{1}Reload window{2} after installation to complete Git setup.", Button(localize("installGit", "Install Git"), "https://aka.ms/vscode-install-git"), "[", "](command:workbench.action.reloadWindow)"),
          when: "git.missing",
          media: {
            type: "svg",
            altText: "Install Git.",
            path: "git.svg"
          },
          completionEvents: [
            "onContext:git.state == initialized"
          ]
        },
        {
          id: "tasks",
          title: localize("gettingStarted.tasks.title", "Automate your project tasks"),
          when: "workspaceFolderCount != 0 && workspacePlatform != 'webworker'",
          description: localize("gettingStarted.tasks.description.interpolated", "Create tasks for your common workflows and enjoy the integrated experience of running scripts and automatically checking results.\n{0}", Button(localize("runTasks", "Run Auto-detected Tasks"), "command:workbench.action.tasks.runTask")),
          media: {
            type: "svg",
            altText: "Task runner.",
            path: "runTask.svg"
          }
        },
        {
          id: "shortcuts",
          title: localize("gettingStarted.shortcuts.title", "Customize your shortcuts"),
          description: localize("gettingStarted.shortcuts.description.interpolated", "Once you have discovered your favorite commands, create custom keyboard shortcuts for instant access.\n{0}", Button(localize("keyboardShortcuts", "Keyboard Shortcuts"), "command:toSide:workbench.action.openGlobalKeybindings")),
          media: {
            type: "svg",
            altText: "Interactive shortcuts.",
            path: "shortcuts.svg"
          }
        },
        {
          id: "workspaceTrust",
          title: localize("gettingStarted.workspaceTrust.title", "Safely browse and edit code"),
          description: localize("gettingStarted.workspaceTrust.description.interpolated", "{0} lets you decide whether your project folders should **allow or restrict** automatic code execution __(required for extensions, debugging, etc)__.\nOpening a file/folder will prompt to grant trust. You can always {1} later.", Button(localize("workspaceTrust", "Workspace Trust"), "https://code.visualstudio.com/docs/editor/workspace-trust"), Button(localize("enableTrust", "enable trust"), "command:toSide:workbench.trust.manage")),
          when: "workspacePlatform != 'webworker' && !isWorkspaceTrusted && workspaceFolderCount == 0",
          media: {
            type: "svg",
            altText: "Workspace Trust editor in Restricted mode and a primary button for switching to Trusted mode.",
            path: "workspaceTrust.svg"
          }
        }
      ]
    }
  },
  {
    id: "notebooks",
    title: localize("gettingStarted.notebook.title", "Customize Notebooks"),
    description: "",
    icon: setupIcon,
    isFeatured: false,
    when: `config.${NotebookSetting.openGettingStarted} && userHasOpenedNotebook`,
    walkthroughPageTitle: localize("gettingStarted.notebook.walkthroughPageTitle", "Notebooks"),
    content: {
      type: "steps",
      steps: [
        {
          completionEvents: ["onCommand:notebook.setProfile"],
          id: "notebookProfile",
          title: localize("gettingStarted.notebookProfile.title", "Select the layout for your notebooks"),
          description: localize("gettingStarted.notebookProfile.description", "Get notebooks to feel just the way you prefer"),
          when: "userHasOpenedNotebook",
          media: {
            type: "markdown",
            path: "notebookProfile"
          }
        }
      ]
    }
  }
];
export {
  copilotSettingsMessage,
  gettingStartedContentRegistry,
  moduleToContent,
  startEntries,
  walkthroughs
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9jb21tb24vZ2V0dGluZ1N0YXJ0ZWRDb250ZW50LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHRoZW1lUGlja2VyQ29udGVudCBmcm9tICcuL21lZGlhL3RoZW1lX3BpY2tlci5qcyc7XG5pbXBvcnQgdGhlbWVQaWNrZXJTbWFsbENvbnRlbnQgZnJvbSAnLi9tZWRpYS90aGVtZV9waWNrZXJfc21hbGwuanMnO1xuaW1wb3J0IG5vdGVib29rUHJvZmlsZUNvbnRlbnQgZnJvbSAnLi9tZWRpYS9ub3RlYm9va1Byb2ZpbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IE5vdGVib29rU2V0dGluZyB9IGZyb20gJy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVEIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5cbmludGVyZmFjZSBJR2V0dGluZ1N0YXJ0ZWRDb250ZW50UHJvdmlkZXIge1xuXHQoKTogc3RyaW5nO1xufVxuXG5jb25zdCBkZWZhdWx0Q2hhdCA9IHtcblx0ZG9jdW1lbnRhdGlvblVybDogcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5kb2N1bWVudGF0aW9uVXJsID8/ICcnLFxuXHRwcm92aWRlcjogcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5wcm92aWRlciA/PyB7IGRlZmF1bHQ6IHsgbmFtZTogJycgfSB9LFxuXHRwdWJsaWNDb2RlTWF0Y2hlc1VybDogcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5wdWJsaWNDb2RlTWF0Y2hlc1VybCA/PyAnJyxcblx0dGVybXNTdGF0ZW1lbnRVcmw6IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8udGVybXNTdGF0ZW1lbnRVcmwgPz8gJycsXG5cdHByaXZhY3lTdGF0ZW1lbnRVcmw6IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8ucHJpdmFjeVN0YXRlbWVudFVybCA/PyAnJ1xufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGNvcGlsb3RTZXR0aW5nc01lc3NhZ2UobWFuYWdlU2V0dGluZ3NVcmw6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBsb2NhbGl6ZSh7IGtleTogJ3NldHRpbmdzJywgY29tbWVudDogWyd7TG9ja2VkPVwiW1wifScsICd7TG9ja2VkPVwiXSh7MH0pXCJ9JywgJ3tMb2NrZWQ9XCJdKHsxfSlcIn0nXSB9LCBcInswfSBDb3BpbG90IG1heSBzaG93IFtwdWJsaWMgY29kZV0oezF9KSBzdWdnZXN0aW9ucyBhbmQgdXNlIHlvdXIgZGF0YSB0byBpbXByb3ZlIHRoZSBwcm9kdWN0LiBZb3UgY2FuIGNoYW5nZSB0aGVzZSBbc2V0dGluZ3NdKHsyfSkgYW55dGltZS5cIiwgZGVmYXVsdENoYXQucHJvdmlkZXIuZGVmYXVsdC5uYW1lLCBkZWZhdWx0Q2hhdC5wdWJsaWNDb2RlTWF0Y2hlc1VybCwgbWFuYWdlU2V0dGluZ3NVcmwpO1xufVxuXG5jbGFzcyBHZXR0aW5nU3RhcnRlZENvbnRlbnRQcm92aWRlclJlZ2lzdHJ5IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHByb3ZpZGVycyA9IG5ldyBNYXA8c3RyaW5nLCBJR2V0dGluZ1N0YXJ0ZWRDb250ZW50UHJvdmlkZXI+KCk7XG5cblx0cmVnaXN0ZXJQcm92aWRlcihtb2R1bGVJZDogc3RyaW5nLCBwcm92aWRlcjogSUdldHRpbmdTdGFydGVkQ29udGVudFByb3ZpZGVyKTogdm9pZCB7XG5cdFx0dGhpcy5wcm92aWRlcnMuc2V0KG1vZHVsZUlkLCBwcm92aWRlcik7XG5cdH1cblxuXHRnZXRQcm92aWRlcihtb2R1bGVJZDogc3RyaW5nKTogSUdldHRpbmdTdGFydGVkQ29udGVudFByb3ZpZGVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5wcm92aWRlcnMuZ2V0KG1vZHVsZUlkKTtcblx0fVxufVxuZXhwb3J0IGNvbnN0IGdldHRpbmdTdGFydGVkQ29udGVudFJlZ2lzdHJ5ID0gbmV3IEdldHRpbmdTdGFydGVkQ29udGVudFByb3ZpZGVyUmVnaXN0cnkoKTtcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1vZHVsZVRvQ29udGVudChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0aWYgKCFyZXNvdXJjZS5xdWVyeSkge1xuXHRcdHRocm93IG5ldyBFcnJvcignR2V0dGluZyBTdGFydGVkOiBpbnZhbGlkIHJlc291cmNlJyk7XG5cdH1cblxuXHRjb25zdCBxdWVyeSA9IEpTT04ucGFyc2UocmVzb3VyY2UucXVlcnkpO1xuXHRpZiAoIXF1ZXJ5Lm1vZHVsZUlkKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdHZXR0aW5nIFN0YXJ0ZWQ6IGludmFsaWQgcmVzb3VyY2UnKTtcblx0fVxuXG5cdGNvbnN0IHByb3ZpZGVyID0gZ2V0dGluZ1N0YXJ0ZWRDb250ZW50UmVnaXN0cnkuZ2V0UHJvdmlkZXIocXVlcnkubW9kdWxlSWQpO1xuXHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBHZXR0aW5nIFN0YXJ0ZWQ6IG5vIHByb3ZpZGVyIHJlZ2lzdGVyZWQgZm9yICR7cXVlcnkubW9kdWxlSWR9YCk7XG5cdH1cblxuXHRyZXR1cm4gcHJvdmlkZXIoKTtcbn1cblxuZ2V0dGluZ1N0YXJ0ZWRDb250ZW50UmVnaXN0cnkucmVnaXN0ZXJQcm92aWRlcigndnMvd29ya2JlbmNoL2NvbnRyaWIvd2VsY29tZUdldHRpbmdTdGFydGVkL2NvbW1vbi9tZWRpYS90aGVtZV9waWNrZXInLCB0aGVtZVBpY2tlckNvbnRlbnQpO1xuZ2V0dGluZ1N0YXJ0ZWRDb250ZW50UmVnaXN0cnkucmVnaXN0ZXJQcm92aWRlcigndnMvd29ya2JlbmNoL2NvbnRyaWIvd2VsY29tZUdldHRpbmdTdGFydGVkL2NvbW1vbi9tZWRpYS90aGVtZV9waWNrZXJfc21hbGwnLCB0aGVtZVBpY2tlclNtYWxsQ29udGVudCk7XG5nZXR0aW5nU3RhcnRlZENvbnRlbnRSZWdpc3RyeS5yZWdpc3RlclByb3ZpZGVyKCd2cy93b3JrYmVuY2gvY29udHJpYi93ZWxjb21lR2V0dGluZ1N0YXJ0ZWQvY29tbW9uL21lZGlhL25vdGVib29rUHJvZmlsZScsIG5vdGVib29rUHJvZmlsZUNvbnRlbnQpO1xuLy8gUmVnaXN0ZXIgZW1wdHkgbWVkaWEgZm9yIGFjY2Vzc2liaWxpdHkgd2Fsa3Rocm91Z2hcbmdldHRpbmdTdGFydGVkQ29udGVudFJlZ2lzdHJ5LnJlZ2lzdGVyUHJvdmlkZXIoJ3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVHZXR0aW5nU3RhcnRlZC9jb21tb24vbWVkaWEvZW1wdHknLCAoKSA9PiAnJyk7XG5cbmNvbnN0IHNldHVwSWNvbiA9IHJlZ2lzdGVySWNvbignZ2V0dGluZy1zdGFydGVkLXNldHVwJywgQ29kaWNvbi56YXAsIGxvY2FsaXplKCdnZXR0aW5nLXN0YXJ0ZWQtc2V0dXAtaWNvbicsIFwiSWNvbiB1c2VkIGZvciB0aGUgc2V0dXAgY2F0ZWdvcnkgb2Ygd2VsY29tZSBwYWdlXCIpKTtcbmNvbnN0IGJlZ2lubmVySWNvbiA9IHJlZ2lzdGVySWNvbignZ2V0dGluZy1zdGFydGVkLWJlZ2lubmVyJywgQ29kaWNvbi5saWdodGJ1bGIsIGxvY2FsaXplKCdnZXR0aW5nLXN0YXJ0ZWQtYmVnaW5uZXItaWNvbicsIFwiSWNvbiB1c2VkIGZvciB0aGUgYmVnaW5uZXIgY2F0ZWdvcnkgb2Ygd2VsY29tZSBwYWdlXCIpKTtcblxuZXhwb3J0IHR5cGUgQnVpbHRpbkdldHRpbmdTdGFydGVkU3RlcCA9IHtcblx0aWQ6IHN0cmluZztcblx0dGl0bGU6IHN0cmluZztcblx0ZGVzY3JpcHRpb246IHN0cmluZztcblx0Y29tcGxldGlvbkV2ZW50cz86IHN0cmluZ1tdO1xuXHR3aGVuPzogc3RyaW5nO1xuXHRtZWRpYTpcblx0fCB7IHR5cGU6ICdpbWFnZSc7IHBhdGg6IHN0cmluZyB8IHsgaGM6IHN0cmluZzsgaGNMaWdodD86IHN0cmluZzsgbGlnaHQ6IHN0cmluZzsgZGFyazogc3RyaW5nIH07IGFsdFRleHQ6IHN0cmluZyB9XG5cdHwgeyB0eXBlOiAnc3ZnJzsgcGF0aDogc3RyaW5nOyBhbHRUZXh0OiBzdHJpbmcgfVxuXHR8IHsgdHlwZTogJ21hcmtkb3duJzsgcGF0aDogc3RyaW5nIH1cblx0fCB7IHR5cGU6ICd2aWRlbyc7IHBhdGg6IHN0cmluZyB8IHsgaGM6IHN0cmluZzsgaGNMaWdodD86IHN0cmluZzsgbGlnaHQ6IHN0cmluZzsgZGFyazogc3RyaW5nIH07IHBvc3Rlcj86IHN0cmluZyB8IHsgaGM6IHN0cmluZzsgaGNMaWdodD86IHN0cmluZzsgbGlnaHQ6IHN0cmluZzsgZGFyazogc3RyaW5nIH07IGFsdFRleHQ6IHN0cmluZyB9O1xufTtcblxuZXhwb3J0IHR5cGUgQnVpbHRpbkdldHRpbmdTdGFydGVkQ2F0ZWdvcnkgPSB7XG5cdGlkOiBzdHJpbmc7XG5cdHRpdGxlOiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdGlzRmVhdHVyZWQ6IGJvb2xlYW47XG5cdG5leHQ/OiBzdHJpbmc7XG5cdGljb246IFRoZW1lSWNvbjtcblx0d2hlbj86IHN0cmluZztcblx0Y29udGVudDpcblx0fCB7IHR5cGU6ICdzdGVwcyc7IHN0ZXBzOiBCdWlsdGluR2V0dGluZ1N0YXJ0ZWRTdGVwW10gfTtcblx0d2Fsa3Rocm91Z2hQYWdlVGl0bGU6IHN0cmluZztcbn07XG5cbmV4cG9ydCB0eXBlIEJ1aWx0aW5HZXR0aW5nU3RhcnRlZFN0YXJ0RW50cnkgPSB7XG5cdGlkOiBzdHJpbmc7XG5cdHRpdGxlOiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdGljb246IFRoZW1lSWNvbjtcblx0d2hlbj86IHN0cmluZztcblx0Y29udGVudDpcblx0fCB7IHR5cGU6ICdzdGFydEVudHJ5JzsgY29tbWFuZDogc3RyaW5nIH07XG59O1xuXG50eXBlIEdldHRpbmdTdGFydGVkV2Fsa3Rocm91Z2hDb250ZW50ID0gQnVpbHRpbkdldHRpbmdTdGFydGVkQ2F0ZWdvcnlbXTtcbnR5cGUgR2V0dGluZ1N0YXJ0ZWRTdGFydEVudHJ5Q29udGVudCA9IEJ1aWx0aW5HZXR0aW5nU3RhcnRlZFN0YXJ0RW50cnlbXTtcblxuZXhwb3J0IGNvbnN0IHN0YXJ0RW50cmllczogR2V0dGluZ1N0YXJ0ZWRTdGFydEVudHJ5Q29udGVudCA9IFtcblx0e1xuXHRcdGlkOiAnd2VsY29tZS5zaG93TmV3RmlsZUVudHJpZXMnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQubmV3RmlsZS50aXRsZScsIFwiTmV3IEZpbGUuLi5cIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5uZXdGaWxlLmRlc2NyaXB0aW9uJywgXCJPcGVuIGEgbmV3IHVudGl0bGVkIHRleHQgZmlsZSwgbm90ZWJvb2ssIG9yIGN1c3RvbSBlZGl0b3IuXCIpLFxuXHRcdGljb246IENvZGljb24ubmV3RmlsZSxcblx0XHRjb250ZW50OiB7XG5cdFx0XHR0eXBlOiAnc3RhcnRFbnRyeScsXG5cdFx0XHRjb21tYW5kOiAnY29tbWFuZDp3ZWxjb21lLnNob3dOZXdGaWxlRW50cmllcycsXG5cdFx0fVxuXHR9LFxuXHR7XG5cdFx0aWQ6ICd0b3BMZXZlbE9wZW5NYWMnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQub3Blbk1hYy50aXRsZScsIFwiT3Blbi4uLlwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLm9wZW5NYWMuZGVzY3JpcHRpb24nLCBcIk9wZW4gYSBmaWxlIG9yIGZvbGRlciB0byBzdGFydCB3b3JraW5nXCIpLFxuXHRcdGljb246IENvZGljb24uZm9sZGVyT3BlbmVkLFxuXHRcdHdoZW46ICchaXNXZWIgJiYgaXNNYWMnLFxuXHRcdGNvbnRlbnQ6IHtcblx0XHRcdHR5cGU6ICdzdGFydEVudHJ5Jyxcblx0XHRcdGNvbW1hbmQ6ICdjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24uZmlsZXMub3BlbkZpbGVGb2xkZXInLFxuXHRcdH1cblx0fSxcblx0e1xuXHRcdGlkOiAndG9wTGV2ZWxPcGVuRmlsZScsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5vcGVuRmlsZS50aXRsZScsIFwiT3BlbiBGaWxlLi4uXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQub3BlbkZpbGUuZGVzY3JpcHRpb24nLCBcIk9wZW4gYSBmaWxlIHRvIHN0YXJ0IHdvcmtpbmdcIiksXG5cdFx0aWNvbjogQ29kaWNvbi5nb1RvRmlsZSxcblx0XHR3aGVuOiAnaXNXZWIgfHwgIWlzTWFjJyxcblx0XHRjb250ZW50OiB7XG5cdFx0XHR0eXBlOiAnc3RhcnRFbnRyeScsXG5cdFx0XHRjb21tYW5kOiAnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLmZpbGVzLm9wZW5GaWxlJyxcblx0XHR9XG5cdH0sXG5cdHtcblx0XHRpZDogJ3RvcExldmVsT3BlbkZvbGRlcicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5vcGVuRm9sZGVyLnRpdGxlJywgXCJPcGVuIEZvbGRlci4uLlwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLm9wZW5Gb2xkZXIuZGVzY3JpcHRpb24nLCBcIk9wZW4gYSBmb2xkZXIgdG8gc3RhcnQgd29ya2luZ1wiKSxcblx0XHRpY29uOiBDb2RpY29uLmZvbGRlck9wZW5lZCxcblx0XHR3aGVuOiAnIWlzV2ViICYmICFpc01hYycsXG5cdFx0Y29udGVudDoge1xuXHRcdFx0dHlwZTogJ3N0YXJ0RW50cnknLFxuXHRcdFx0Y29tbWFuZDogJ2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5maWxlcy5vcGVuRm9sZGVyJyxcblx0XHR9XG5cdH0sXG5cdHtcblx0XHRpZDogJ3RvcExldmVsT3BlbkZvbGRlcldlYicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5vcGVuRm9sZGVyLnRpdGxlJywgXCJPcGVuIEZvbGRlci4uLlwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLm9wZW5Gb2xkZXIuZGVzY3JpcHRpb24nLCBcIk9wZW4gYSBmb2xkZXIgdG8gc3RhcnQgd29ya2luZ1wiKSxcblx0XHRpY29uOiBDb2RpY29uLmZvbGRlck9wZW5lZCxcblx0XHR3aGVuOiAnIW9wZW5Gb2xkZXJXb3Jrc3BhY2VTdXBwb3J0ICYmIHdvcmtiZW5jaFN0YXRlID09IFxcJ3dvcmtzcGFjZVxcJycsXG5cdFx0Y29udGVudDoge1xuXHRcdFx0dHlwZTogJ3N0YXJ0RW50cnknLFxuXHRcdFx0Y29tbWFuZDogJ2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5maWxlcy5vcGVuRm9sZGVyVmlhV29ya3NwYWNlJyxcblx0XHR9XG5cdH0sXG5cdHtcblx0XHRpZDogJ3RvcExldmVsR2l0Q2xvbmUnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQudG9wTGV2ZWxHaXRDbG9uZS50aXRsZScsIFwiQ2xvbmUgR2l0IFJlcG9zaXRvcnkuLi5cIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC50b3BMZXZlbEdpdENsb25lLmRlc2NyaXB0aW9uJywgXCJDbG9uZSBhIHJlbW90ZSByZXBvc2l0b3J5IHRvIGEgbG9jYWwgZm9sZGVyXCIpLFxuXHRcdHdoZW46ICdjb25maWcuZ2l0LmVuYWJsZWQgJiYgIWdpdC5taXNzaW5nJyxcblx0XHRpY29uOiBDb2RpY29uLnNvdXJjZUNvbnRyb2wsXG5cdFx0Y29udGVudDoge1xuXHRcdFx0dHlwZTogJ3N0YXJ0RW50cnknLFxuXHRcdFx0Y29tbWFuZDogJ2NvbW1hbmQ6Z2l0LmNsb25lJyxcblx0XHR9XG5cdH0sXG5cdHtcblx0XHRpZDogJ3RvcExldmVsR2l0T3BlbicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC50b3BMZXZlbEdpdE9wZW4udGl0bGUnLCBcIk9wZW4gUmVwb3NpdG9yeS4uLlwiKSxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnRvcExldmVsR2l0T3Blbi5kZXNjcmlwdGlvbicsIFwiQ29ubmVjdCB0byBhIHJlbW90ZSByZXBvc2l0b3J5IG9yIHB1bGwgcmVxdWVzdCB0byBicm93c2UsIHNlYXJjaCwgZWRpdCwgYW5kIGNvbW1pdFwiKSxcblx0XHR3aGVuOiAnd29ya3NwYWNlUGxhdGZvcm0gPT0gXFwnd2Vid29ya2VyXFwnJyxcblx0XHRpY29uOiBDb2RpY29uLnNvdXJjZUNvbnRyb2wsXG5cdFx0Y29udGVudDoge1xuXHRcdFx0dHlwZTogJ3N0YXJ0RW50cnknLFxuXHRcdFx0Y29tbWFuZDogJ2NvbW1hbmQ6cmVtb3RlSHViLm9wZW5SZXBvc2l0b3J5Jyxcblx0XHR9XG5cdH0sXG5cdHtcblx0XHRpZDogJ3RvcExldmVsUmVtb3RlT3BlbicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC50b3BMZXZlbFJlbW90ZU9wZW4udGl0bGUnLCBcIkNvbm5lY3QgdG8uLi5cIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC50b3BMZXZlbFJlbW90ZU9wZW4uZGVzY3JpcHRpb24nLCBcIkNvbm5lY3QgdG8gcmVtb3RlIGRldmVsb3BtZW50IHdvcmtzcGFjZXMuXCIpLFxuXHRcdHdoZW46ICchaXNXZWInLFxuXHRcdGljb246IENvZGljb24ucmVtb3RlLFxuXHRcdGNvbnRlbnQ6IHtcblx0XHRcdHR5cGU6ICdzdGFydEVudHJ5Jyxcblx0XHRcdGNvbW1hbmQ6ICdjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24ucmVtb3RlLnNob3dNZW51Jyxcblx0XHR9XG5cdH0sXG5cdHtcblx0XHRpZDogJ3RvcExldmVsT3BlblR1bm5lbCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC50b3BMZXZlbE9wZW5UdW5uZWwudGl0bGUnLCBcIk9wZW4gVHVubmVsLi4uXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQudG9wTGV2ZWxPcGVuVHVubmVsLmRlc2NyaXB0aW9uJywgXCJDb25uZWN0IHRvIGEgcmVtb3RlIG1hY2hpbmUgdGhyb3VnaCBhIFR1bm5lbFwiKSxcblx0XHR3aGVuOiAnaXNXZWIgJiYgc2hvd1JlbW90ZVN0YXJ0RW50cnlJbldlYicsXG5cdFx0aWNvbjogQ29kaWNvbi5yZW1vdGUsXG5cdFx0Y29udGVudDoge1xuXHRcdFx0dHlwZTogJ3N0YXJ0RW50cnknLFxuXHRcdFx0Y29tbWFuZDogJ2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5yZW1vdGUuc2hvd1dlYlN0YXJ0RW50cnlBY3Rpb25zJyxcblx0XHR9XG5cdH0sXG5cdHtcblx0XHRpZDogJ3RvcExldmVsTmV3V29ya3NwYWNlQ2hhdCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5uZXdXb3Jrc3BhY2VDaGF0LnRpdGxlJywgXCJHZW5lcmF0ZSBOZXcgV29ya3NwYWNlLi4uXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQubmV3V29ya3NwYWNlQ2hhdC5kZXNjcmlwdGlvbicsIFwiQ2hhdCB0byBjcmVhdGUgYSBuZXcgd29ya3NwYWNlXCIpLFxuXHRcdGljb246IENvZGljb24uY2hhdFNwYXJrbGUsXG5cdFx0d2hlbjogJyFpc1dlYiAmJiAhY2hhdFNldHVwSGlkZGVuICYmICFjaGF0U2V0dXBEaXNhYmxlZEluV29ya3NwYWNlJyxcblx0XHRjb250ZW50OiB7XG5cdFx0XHR0eXBlOiAnc3RhcnRFbnRyeScsXG5cdFx0XHRjb21tYW5kOiAnY29tbWFuZDp3ZWxjb21lLm5ld1dvcmtzcGFjZUNoYXQnLFxuXHRcdH1cblx0fSxcbl07XG5cbmNvbnN0IEJ1dHRvbiA9ICh0aXRsZTogc3RyaW5nLCBocmVmOiBzdHJpbmcpID0+IGBbJHt0aXRsZX1dKCR7aHJlZn0pYDtcblxuY29uc3QgQ29waWxvdFN0ZXBUaXRsZSA9IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5jb3BpbG90U2V0dXAudGl0bGUnLCBcIlVzZSBBSSBmZWF0dXJlcyB3aXRoIENvcGlsb3QgZm9yIGZyZWVcIik7XG5jb25zdCBDb3BpbG90RGVzY3JpcHRpb24gPSBsb2NhbGl6ZSh7IGtleTogJ2dldHRpbmdTdGFydGVkLmNvcGlsb3RTZXR1cC5kZXNjcmlwdGlvbicsIGNvbW1lbnQ6IFsne0xvY2tlZD1cIltcIn0nLCAne0xvY2tlZD1cIl0oezB9KVwifSddIH0sIFwiWW91IGNhbiB1c2UgW0NvcGlsb3RdKHswfSkgdG8gZ2VuZXJhdGUgY29kZSBhY3Jvc3MgbXVsdGlwbGUgZmlsZXMsIGZpeCBlcnJvcnMsIGFzayBxdWVzdGlvbnMgYWJvdXQgeW91ciBjb2RlLCBhbmQgbXVjaCBtb3JlIHVzaW5nIG5hdHVyYWwgbGFuZ3VhZ2UuXCIsIGRlZmF1bHRDaGF0LmRvY3VtZW50YXRpb25VcmwgPz8gJycpO1xuY29uc3QgQ29waWxvdFRlcm1zU3RyaW5nID0gbG9jYWxpemUoeyBrZXk6ICdnZXR0aW5nU3RhcnRlZC5jb3BpbG90U2V0dXAudGVybXMnLCBjb21tZW50OiBbJ3tMb2NrZWQ9XCJdKHsyfSlcIn0nLCAne0xvY2tlZD1cIl0oezN9KVwifSddIH0sIFwiQnkgY29udGludWluZyB3aXRoIHswfSBDb3BpbG90LCB5b3UgYWdyZWUgdG8gezF9J3MgW1Rlcm1zXSh7Mn0pIGFuZCBbUHJpdmFjeSBTdGF0ZW1lbnRdKHszfSlcIiwgZGVmYXVsdENoYXQucHJvdmlkZXIuZGVmYXVsdC5uYW1lLCBkZWZhdWx0Q2hhdC5wcm92aWRlci5kZWZhdWx0Lm5hbWUsIGRlZmF1bHRDaGF0LnRlcm1zU3RhdGVtZW50VXJsLCBkZWZhdWx0Q2hhdC5wcml2YWN5U3RhdGVtZW50VXJsKTtcbmNvbnN0IENvcGlsb3RBbm9ueW1vdXNCdXR0b24gPSBCdXR0b24obG9jYWxpemUoJ3NldHVwQ29waWxvdEJ1dHRvbi5zZXR1cCcsIFwiVXNlIEFJIEZlYXR1cmVzXCIpLCBgY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLmNoYXQudHJpZ2dlclNldHVwQW5vbnltb3VzV2l0aG91dERpYWxvZ2ApO1xuY29uc3QgQ29waWxvdFNpZ25lZE91dEJ1dHRvbiA9IEJ1dHRvbihsb2NhbGl6ZSgnc2V0dXBDb3BpbG90QnV0dG9uLnNldHVwJywgXCJVc2UgQUkgRmVhdHVyZXNcIiksIGBjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24uY2hhdC50cmlnZ2VyU2V0dXBgKTtcbmNvbnN0IENvcGlsb3RTaWduZWRJbkJ1dHRvbiA9IEJ1dHRvbihsb2NhbGl6ZSgnc2V0dXBDb3BpbG90QnV0dG9uLnNldHVwJywgXCJVc2UgQUkgRmVhdHVyZXNcIiksIGBjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24uY2hhdC50cmlnZ2VyU2V0dXBgKTtcbmNvbnN0IENvcGlsb3RDb21wbGV0ZUJ1dHRvbiA9IEJ1dHRvbihsb2NhbGl6ZSgnc2V0dXBDb3BpbG90QnV0dG9uLmNoYXRXaXRoQ29waWxvdCcsIFwiU3RhcnQgdG8gQ2hhdFwiKSwgJ2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW4nKTtcblxuZnVuY3Rpb24gY3JlYXRlQ29waWxvdFNldHVwU3RlcChpZDogc3RyaW5nLCBidXR0b246IHN0cmluZywgd2hlbjogc3RyaW5nLCBpbmNsdWRlVGVybXM6IGJvb2xlYW4pOiBCdWlsdGluR2V0dGluZ1N0YXJ0ZWRTdGVwIHtcblx0Y29uc3QgZGVzY3JpcHRpb24gPSBpbmNsdWRlVGVybXMgP1xuXHRcdGAke0NvcGlsb3REZXNjcmlwdGlvbn1cXG4ke0NvcGlsb3RUZXJtc1N0cmluZ31cXG4ke2J1dHRvbn1gIDpcblx0XHRgJHtDb3BpbG90RGVzY3JpcHRpb259XFxuJHtidXR0b259YDtcblxuXHRyZXR1cm4ge1xuXHRcdGlkLFxuXHRcdHRpdGxlOiBDb3BpbG90U3RlcFRpdGxlLFxuXHRcdGRlc2NyaXB0aW9uLFxuXHRcdHdoZW46IGAke3doZW59ICYmICFjaGF0U2V0dXBIaWRkZW4gJiYgIWNoYXRTZXR1cERpc2FibGVkSW5Xb3Jrc3BhY2VgLFxuXHRcdG1lZGlhOiB7XG5cdFx0XHR0eXBlOiAnc3ZnJywgYWx0VGV4dDogJ1ZTIENvZGUgQ29waWxvdCBtdWx0aSBmaWxlIGVkaXRzJywgcGF0aDogJ211bHRpLWZpbGUtZWRpdHMuc3ZnJ1xuXHRcdH0sXG5cdH07XG59XG5cbmV4cG9ydCBjb25zdCB3YWxrdGhyb3VnaHM6IEdldHRpbmdTdGFydGVkV2Fsa3Rocm91Z2hDb250ZW50ID0gW1xuXHR7XG5cdFx0aWQ6ICdTZXR1cCcsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zZXR1cC50aXRsZScsIFwiR2V0IHN0YXJ0ZWQgd2l0aCBWUyBDb2RlXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuc2V0dXAuZGVzY3JpcHRpb24nLCBcIkN1c3RvbWl6ZSB5b3VyIGVkaXRvciwgbGVhcm4gdGhlIGJhc2ljcywgYW5kIHN0YXJ0IGNvZGluZ1wiKSxcblx0XHRpc0ZlYXR1cmVkOiB0cnVlLFxuXHRcdGljb246IHNldHVwSWNvbixcblx0XHR3aGVuOiAnIWlzV2ViJyxcblx0XHR3YWxrdGhyb3VnaFBhZ2VUaXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnNldHVwLndhbGt0aHJvdWdoUGFnZVRpdGxlJywgJ1NldHVwIFZTIENvZGUnKSxcblx0XHRuZXh0OiAnQmVnaW5uZXInLFxuXHRcdGNvbnRlbnQ6IHtcblx0XHRcdHR5cGU6ICdzdGVwcycsXG5cdFx0XHRzdGVwczogW1xuXHRcdFx0XHRjcmVhdGVDb3BpbG90U2V0dXBTdGVwKCdDb3BpbG90U2V0dXBBbm9ueW1vdXMnLCBDb3BpbG90QW5vbnltb3VzQnV0dG9uLCAnY2hhdEFub255bW91cyAmJiAhY2hhdFNldHVwQ29tcGxldGVkJywgdHJ1ZSksXG5cdFx0XHRcdGNyZWF0ZUNvcGlsb3RTZXR1cFN0ZXAoJ0NvcGlsb3RTZXR1cFNpZ25lZE91dCcsIENvcGlsb3RTaWduZWRPdXRCdXR0b24sICdjaGF0RW50aXRsZW1lbnRTaWduZWRPdXQgJiYgIWNoYXRBbm9ueW1vdXMgJiYgIWdpdGh1Yi5jb3BpbG90Lmhhc0J5b2tNb2RlbHMnLCBmYWxzZSksXG5cdFx0XHRcdGNyZWF0ZUNvcGlsb3RTZXR1cFN0ZXAoJ0NvcGlsb3RTZXR1cENvbXBsZXRlJywgQ29waWxvdENvbXBsZXRlQnV0dG9uLCAnY2hhdFNldHVwQ29tcGxldGVkICYmICFjaGF0U2V0dXBEaXNhYmxlZCAmJiAoY2hhdEFub255bW91cyB8fCBjaGF0UGxhblBybyB8fCBjaGF0UGxhblByb1BsdXMgfHwgY2hhdFBsYW5NYXggfHwgY2hhdFBsYW5CdXNpbmVzcyB8fCBjaGF0UGxhbkVudGVycHJpc2UgfHwgY2hhdFBsYW5GcmVlKScsIGZhbHNlKSxcblx0XHRcdFx0Y3JlYXRlQ29waWxvdFNldHVwU3RlcCgnQ29waWxvdFNldHVwU2lnbmVkSW4nLCBDb3BpbG90U2lnbmVkSW5CdXR0b24sICchY2hhdEVudGl0bGVtZW50U2lnbmVkT3V0ICYmICghY2hhdFNldHVwQ29tcGxldGVkIHx8IGNoYXRTZXR1cERpc2FibGVkIHx8IGNoYXRQbGFuQ2FuU2lnblVwKScsIGZhbHNlKSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAncGlja0NvbG9yVGhlbWUnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQucGlja0NvbG9yLnRpdGxlJywgXCJDaG9vc2UgeW91ciB0aGVtZVwiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnBpY2tDb2xvci5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIlRoZSByaWdodCB0aGVtZSBoZWxwcyB5b3UgZm9jdXMgb24geW91ciBjb2RlLCBpcyBlYXN5IG9uIHlvdXIgZXllcywgYW5kIGlzIHNpbXBseSBtb3JlIGZ1biB0byB1c2UuXFxuezB9XCIsIEJ1dHRvbihsb2NhbGl6ZSgndGl0bGVJRCcsIFwiQnJvd3NlIENvbG9yIFRoZW1lc1wiKSwgJ2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5zZWxlY3RUaGVtZScpKSxcblx0XHRcdFx0XHRjb21wbGV0aW9uRXZlbnRzOiBbXG5cdFx0XHRcdFx0XHQnb25TZXR0aW5nQ2hhbmdlZDp3b3JrYmVuY2guY29sb3JUaGVtZScsXG5cdFx0XHRcdFx0XHQnb25Db21tYW5kOndvcmtiZW5jaC5hY3Rpb24uc2VsZWN0VGhlbWUnXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRtZWRpYTogeyB0eXBlOiAnbWFya2Rvd24nLCBwYXRoOiAndGhlbWVfcGlja2VyJywgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICd2aWRlb1R1dG9yaWFsJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnZpZGVvVHV0b3JpYWwudGl0bGUnLCBcIldhdGNoIHZpZGVvIHR1dG9yaWFsc1wiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnZpZGVvVHV0b3JpYWwuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJXYXRjaCB0aGUgZmlyc3QgaW4gYSBzZXJpZXMgb2Ygc2hvcnQgJiBwcmFjdGljYWwgdmlkZW8gdHV0b3JpYWxzIGZvciBWUyBDb2RlJ3Mga2V5IGZlYXR1cmVzLlxcbnswfVwiLCBCdXR0b24obG9jYWxpemUoJ3dhdGNoJywgXCJXYXRjaCBUdXRvcmlhbFwiKSwgJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS1nZXR0aW5nLXN0YXJ0ZWQtdmlkZW8nKSksXG5cdFx0XHRcdFx0bWVkaWE6IHsgdHlwZTogJ3N2ZycsIGFsdFRleHQ6ICdWUyBDb2RlIFNldHRpbmdzJywgcGF0aDogJ2xlYXJuLnN2ZycgfSxcblx0XHRcdFx0fVxuXHRcdFx0XVxuXHRcdH1cblx0fSxcblxuXHR7XG5cdFx0aWQ6ICdTZXR1cFdlYicsXG5cdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zZXR1cFdlYi50aXRsZScsIFwiR2V0IFN0YXJ0ZWQgd2l0aCBWUyBDb2RlIGZvciB0aGUgV2ViXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuc2V0dXBXZWIuZGVzY3JpcHRpb24nLCBcIkN1c3RvbWl6ZSB5b3VyIGVkaXRvciwgbGVhcm4gdGhlIGJhc2ljcywgYW5kIHN0YXJ0IGNvZGluZ1wiKSxcblx0XHRpc0ZlYXR1cmVkOiB0cnVlLFxuXHRcdGljb246IHNldHVwSWNvbixcblx0XHR3aGVuOiAnaXNXZWInLFxuXHRcdG5leHQ6ICdCZWdpbm5lcicsXG5cdFx0d2Fsa3Rocm91Z2hQYWdlVGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zZXR1cFdlYi53YWxrdGhyb3VnaFBhZ2VUaXRsZScsICdTZXR1cCBWUyBDb2RlIFdlYicpLFxuXHRcdGNvbnRlbnQ6IHtcblx0XHRcdHR5cGU6ICdzdGVwcycsXG5cdFx0XHRzdGVwczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdwaWNrQ29sb3JUaGVtZVdlYicsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5waWNrQ29sb3IudGl0bGUnLCBcIkNob29zZSB5b3VyIHRoZW1lXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQucGlja0NvbG9yLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiVGhlIHJpZ2h0IHRoZW1lIGhlbHBzIHlvdSBmb2N1cyBvbiB5b3VyIGNvZGUsIGlzIGVhc3kgb24geW91ciBleWVzLCBhbmQgaXMgc2ltcGx5IG1vcmUgZnVuIHRvIHVzZS5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCd0aXRsZUlEJywgXCJCcm93c2UgQ29sb3IgVGhlbWVzXCIpLCAnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLnNlbGVjdFRoZW1lJykpLFxuXHRcdFx0XHRcdGNvbXBsZXRpb25FdmVudHM6IFtcblx0XHRcdFx0XHRcdCdvblNldHRpbmdDaGFuZ2VkOndvcmtiZW5jaC5jb2xvclRoZW1lJyxcblx0XHRcdFx0XHRcdCdvbkNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5zZWxlY3RUaGVtZSdcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdG1lZGlhOiB7IHR5cGU6ICdtYXJrZG93bicsIHBhdGg6ICd0aGVtZV9waWNrZXInLCB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ21lbnVCYXJXZWInLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQubWVudUJhci50aXRsZScsIFwiSnVzdCB0aGUgcmlnaHQgYW1vdW50IG9mIFVJXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQubWVudUJhci5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIlRoZSBmdWxsIG1lbnUgYmFyIGlzIGF2YWlsYWJsZSBpbiB0aGUgZHJvcGRvd24gbWVudSB0byBtYWtlIHJvb20gZm9yIHlvdXIgY29kZS4gVG9nZ2xlIGl0cyBhcHBlYXJhbmNlIGZvciBmYXN0ZXIgYWNjZXNzLiBcXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCd0b2dnbGVNZW51QmFyJywgXCJUb2dnbGUgTWVudSBCYXJcIiksICdjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24udG9nZ2xlTWVudUJhcicpKSxcblx0XHRcdFx0XHR3aGVuOiAnaXNXZWInLFxuXHRcdFx0XHRcdG1lZGlhOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3ZnJywgYWx0VGV4dDogJ0NvbXBhcmluZyBtZW51IGRyb3Bkb3duIHdpdGggdGhlIHZpc2libGUgbWVudSBiYXIuJywgcGF0aDogJ21lbnVCYXIuc3ZnJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2V4dGVuc2lvbnNXZWJXZWInLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuZXh0ZW5zaW9ucy50aXRsZScsIFwiQ29kZSB3aXRoIGV4dGVuc2lvbnNcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5leHRlbnNpb25zV2ViLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiRXh0ZW5zaW9ucyBhcmUgVlMgQ29kZSdzIHBvd2VyLXVwcy4gQSBncm93aW5nIG51bWJlciBhcmUgYmVjb21pbmcgYXZhaWxhYmxlIGluIHRoZSB3ZWIuXFxuezB9XCIsIEJ1dHRvbihsb2NhbGl6ZSgnYnJvd3NlUG9wdWxhcldlYicsIFwiQnJvd3NlIFBvcHVsYXIgV2ViIEV4dGVuc2lvbnNcIiksICdjb21tYW5kOndvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zaG93UG9wdWxhckV4dGVuc2lvbnMnKSksXG5cdFx0XHRcdFx0d2hlbjogJ3dvcmtzcGFjZVBsYXRmb3JtID09IFxcJ3dlYndvcmtlclxcJycsXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdmcnLCBhbHRUZXh0OiAnVlMgQ29kZSBleHRlbnNpb24gbWFya2V0cGxhY2Ugd2l0aCBmZWF0dXJlZCBsYW5ndWFnZSBleHRlbnNpb25zJywgcGF0aDogJ2V4dGVuc2lvbnMtd2ViLnN2Zydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdmaW5kTGFuZ3VhZ2VFeHRlbnNpb25zV2ViJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmZpbmRMYW5ndWFnZUV4dHMudGl0bGUnLCBcIlJpY2ggc3VwcG9ydCBmb3IgYWxsIHlvdXIgbGFuZ3VhZ2VzXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuZmluZExhbmd1YWdlRXh0cy5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIkNvZGUgc21hcnRlciB3aXRoIHN5bnRheCBoaWdobGlnaHRpbmcsIGlubGluZSBzdWdnZXN0aW9ucywgbGludGluZyBhbmQgZGVidWdnaW5nLiBXaGlsZSBtYW55IGxhbmd1YWdlcyBhcmUgYnVpbHQtaW4sIG1hbnkgbW9yZSBjYW4gYmUgYWRkZWQgYXMgZXh0ZW5zaW9ucy5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCdicm93c2VMYW5nRXh0cycsIFwiQnJvd3NlIExhbmd1YWdlIEV4dGVuc2lvbnNcIiksICdjb21tYW5kOndvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zaG93TGFuZ3VhZ2VFeHRlbnNpb25zJykpLFxuXHRcdFx0XHRcdHdoZW46ICd3b3Jrc3BhY2VQbGF0Zm9ybSAhPSBcXCd3ZWJ3b3JrZXJcXCcnLFxuXHRcdFx0XHRcdG1lZGlhOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3ZnJywgYWx0VGV4dDogJ0xhbmd1YWdlIGV4dGVuc2lvbnMnLCBwYXRoOiAnbGFuZ3VhZ2VzLnN2Zydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdzZXR0aW5nc1N5bmNXZWInLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuc2V0dGluZ3NTeW5jLnRpdGxlJywgXCJTeW5jIHNldHRpbmdzIGFjcm9zcyBkZXZpY2VzXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuc2V0dGluZ3NTeW5jLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiS2VlcCB5b3VyIGVzc2VudGlhbCBjdXN0b21pemF0aW9ucyBiYWNrZWQgdXAgYW5kIHVwZGF0ZWQgYWNyb3NzIGFsbCB5b3VyIGRldmljZXMuXFxuezB9XCIsIEJ1dHRvbihsb2NhbGl6ZSgnZW5hYmxlU3luYycsIFwiQmFja3VwIGFuZCBTeW5jIFNldHRpbmdzXCIpLCAnY29tbWFuZDp3b3JrYmVuY2gudXNlckRhdGFTeW5jLmFjdGlvbnMudHVybk9uJykpLFxuXHRcdFx0XHRcdHdoZW46ICdzeW5jU3RhdHVzICE9IHVuaW5pdGlhbGl6ZWQnLFxuXHRcdFx0XHRcdGNvbXBsZXRpb25FdmVudHM6IFsnb25FdmVudDpzeW5jLWVuYWJsZWQnXSxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N2ZycsIGFsdFRleHQ6ICdUaGUgXCJUdXJuIG9uIFN5bmNcIiBlbnRyeSBpbiB0aGUgc2V0dGluZ3MgZ2VhciBtZW51LicsIHBhdGg6ICdzZXR0aW5nc1N5bmMuc3ZnJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2NvbW1hbmRQYWxldHRlVGFza1dlYicsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5jb21tYW5kUGFsZXR0ZS50aXRsZScsIFwiVW5sb2NrIHByb2R1Y3Rpdml0eSB3aXRoIHRoZSBDb21tYW5kIFBhbGV0dGUgXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuY29tbWFuZFBhbGV0dGUuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJSdW4gY29tbWFuZHMgd2l0aG91dCByZWFjaGluZyBmb3IgeW91ciBtb3VzZSB0byBhY2NvbXBsaXNoIGFueSB0YXNrIGluIFZTIENvZGUuXFxuezB9XCIsIEJ1dHRvbihsb2NhbGl6ZSgnY29tbWFuZFBhbGV0dGUnLCBcIk9wZW4gQ29tbWFuZCBQYWxldHRlXCIpLCAnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLnNob3dDb21tYW5kcycpKSxcblx0XHRcdFx0XHRtZWRpYTogeyB0eXBlOiAnc3ZnJywgYWx0VGV4dDogJ0NvbW1hbmQgUGFsZXR0ZSBvdmVybGF5IGZvciBzZWFyY2hpbmcgYW5kIGV4ZWN1dGluZyBjb21tYW5kcy4nLCBwYXRoOiAnY29tbWFuZFBhbGV0dGUuc3ZnJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdwaWNrQUZvbGRlclRhc2stV2ViV2ViJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnNldHVwLk9wZW5Gb2xkZXIudGl0bGUnLCBcIk9wZW4gdXAgeW91ciBjb2RlXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuc2V0dXAuT3BlbkZvbGRlcldlYi5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIllvdSdyZSBhbGwgc2V0IHRvIHN0YXJ0IGNvZGluZy4gWW91IGNhbiBvcGVuIGEgbG9jYWwgcHJvamVjdCBvciBhIHJlbW90ZSByZXBvc2l0b3J5IHRvIGdldCB5b3VyIGZpbGVzIGludG8gVlMgQ29kZS5cXG57MH1cXG57MX1cIiwgQnV0dG9uKGxvY2FsaXplKCdvcGVuRm9sZGVyJywgXCJPcGVuIEZvbGRlclwiKSwgJ2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5hZGRSb290Rm9sZGVyJyksIEJ1dHRvbihsb2NhbGl6ZSgnb3BlblJlcG9zaXRvcnknLCBcIk9wZW4gUmVwb3NpdG9yeVwiKSwgJ2NvbW1hbmQ6cmVtb3RlSHViLm9wZW5SZXBvc2l0b3J5JykpLFxuXHRcdFx0XHRcdHdoZW46ICd3b3Jrc3BhY2VGb2xkZXJDb3VudCA9PSAwJyxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N2ZycsIGFsdFRleHQ6ICdFeHBsb3JlciB2aWV3IHNob3dpbmcgYnV0dG9ucyBmb3Igb3BlbmluZyBmb2xkZXIgYW5kIGNsb25pbmcgcmVwb3NpdG9yeS4nLCBwYXRoOiAnb3BlbkZvbGRlci5zdmcnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdxdWlja09wZW5XZWInLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQucXVpY2tPcGVuLnRpdGxlJywgXCJRdWlja2x5IG5hdmlnYXRlIGJldHdlZW4geW91ciBmaWxlc1wiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnF1aWNrT3Blbi5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIk5hdmlnYXRlIGJldHdlZW4gZmlsZXMgaW4gYW4gaW5zdGFudCB3aXRoIG9uZSBrZXlzdHJva2UuIFRpcDogT3BlbiBtdWx0aXBsZSBmaWxlcyBieSBwcmVzc2luZyB0aGUgcmlnaHQgYXJyb3cga2V5LlxcbnswfVwiLCBCdXR0b24obG9jYWxpemUoJ3F1aWNrT3BlbicsIFwiUXVpY2sgT3BlbiBhIEZpbGVcIiksICdjb21tYW5kOnRvU2lkZTp3b3JrYmVuY2guYWN0aW9uLnF1aWNrT3BlbicpKSxcblx0XHRcdFx0XHR3aGVuOiAnd29ya3NwYWNlRm9sZGVyQ291bnQgIT0gMCcsXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdmcnLCBhbHRUZXh0OiAnR28gdG8gZmlsZSBpbiBxdWljayBzZWFyY2guJywgcGF0aDogJ3NlYXJjaC5zdmcnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fVxuXHR9LFxuXHR7XG5cdFx0aWQ6ICdTZXR1cEFjY2Vzc2liaWxpdHknLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuc2V0dXBBY2Nlc3NpYmlsaXR5LnRpdGxlJywgXCJHZXQgU3RhcnRlZCB3aXRoIEFjY2Vzc2liaWxpdHkgRmVhdHVyZXNcIiksXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zZXR1cEFjY2Vzc2liaWxpdHkuZGVzY3JpcHRpb24nLCBcIkxlYXJuIHRoZSB0b29scyBhbmQgc2hvcnRjdXRzIHRoYXQgbWFrZSBWUyBDb2RlIGFjY2Vzc2libGUuIE5vdGUgdGhhdCBzb21lIGFjdGlvbnMgYXJlIG5vdCBhY3Rpb25hYmxlIGZyb20gd2l0aGluIHRoZSBjb250ZXh0IG9mIHRoZSB3YWxrdGhyb3VnaC5cIiksXG5cdFx0aXNGZWF0dXJlZDogdHJ1ZSxcblx0XHRpY29uOiBzZXR1cEljb24sXG5cdFx0d2hlbjogQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRC5rZXksXG5cdFx0bmV4dDogJ1NldHVwJyxcblx0XHR3YWxrdGhyb3VnaFBhZ2VUaXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnNldHVwQWNjZXNzaWJpbGl0eS53YWxrdGhyb3VnaFBhZ2VUaXRsZScsICdTZXR1cCBWUyBDb2RlIEFjY2Vzc2liaWxpdHknKSxcblx0XHRjb250ZW50OiB7XG5cdFx0XHR0eXBlOiAnc3RlcHMnLFxuXHRcdFx0c3RlcHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnYWNjZXNzaWJpbGl0eUhlbHAnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuYWNjZXNzaWJpbGl0eUhlbHAudGl0bGUnLCBcIlVzZSB0aGUgYWNjZXNzaWJpbGl0eSBoZWxwIGRpYWxvZyB0byBsZWFybiBhYm91dCBmZWF0dXJlc1wiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmFjY2Vzc2liaWxpdHlIZWxwLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiVGhlIGFjY2Vzc2liaWxpdHkgaGVscCBkaWFsb2cgcHJvdmlkZXMgaW5mb3JtYXRpb24gYWJvdXQgd2hhdCB0byBleHBlY3QgZnJvbSBhIGZlYXR1cmUgYW5kIHRoZSBjb21tYW5kcy9rZXliaW5kaW5ncyB0byBvcGVyYXRlIHRoZW0uXFxuIFdpdGggZm9jdXMgaW4gYW4gZWRpdG9yLCB0ZXJtaW5hbCwgbm90ZWJvb2ssIGNoYXQgcmVzcG9uc2UsIGNvbW1lbnQsIG9yIGRlYnVnIGNvbnNvbGUsIHRoZSByZWxldmFudCBkaWFsb2cgY2FuIGJlIG9wZW5lZCB3aXRoIHRoZSBPcGVuIEFjY2Vzc2liaWxpdHkgSGVscCBjb21tYW5kLlxcbnswfVwiLCBCdXR0b24obG9jYWxpemUoJ29wZW5BY2Nlc3NpYmlsaXR5SGVscCcsIFwiT3BlbiBBY2Nlc3NpYmlsaXR5IEhlbHBcIiksICdjb21tYW5kOmVkaXRvci5hY3Rpb24uYWNjZXNzaWJpbGl0eUhlbHAnKSksXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdtYXJrZG93bicsIHBhdGg6ICdlbXB0eSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2FjY2Vzc2libGVWaWV3Jyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmFjY2Vzc2libGVWaWV3LnRpdGxlJywgXCJTY3JlZW4gcmVhZGVyIHVzZXJzIGNhbiBpbnNwZWN0IGNvbnRlbnQgbGluZSBieSBsaW5lLCBjaGFyYWN0ZXIgYnkgY2hhcmFjdGVyIGluIHRoZSBhY2Nlc3NpYmxlIHZpZXcuXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuYWNjZXNzaWJsZVZpZXcuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJUaGUgYWNjZXNzaWJsZSB2aWV3IGlzIGF2YWlsYWJsZSBmb3IgdGhlIHRlcm1pbmFsLCBob3ZlcnMsIG5vdGlmaWNhdGlvbnMsIGNvbW1lbnRzLCBub3RlYm9vayBvdXRwdXQsIGNoYXQgcmVzcG9uc2VzLCBpbmxpbmUgY29tcGxldGlvbnMsIGFuZCBkZWJ1ZyBjb25zb2xlIG91dHB1dC5cXG4gV2l0aCBmb2N1cyBpbiBhbnkgb2YgdGhvc2UgZmVhdHVyZXMsIGl0IGNhbiBiZSBvcGVuZWQgd2l0aCB0aGUgT3BlbiBBY2Nlc3NpYmxlIFZpZXcgY29tbWFuZC5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCdvcGVuQWNjZXNzaWJsZVZpZXcnLCBcIk9wZW4gQWNjZXNzaWJsZSBWaWV3XCIpLCAnY29tbWFuZDplZGl0b3IuYWN0aW9uLmFjY2Vzc2libGVWaWV3JykpLFxuXHRcdFx0XHRcdG1lZGlhOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnbWFya2Rvd24nLCBwYXRoOiAnZW1wdHknXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICd2ZXJib3NpdHlTZXR0aW5ncycsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC52ZXJib3NpdHlTZXR0aW5ncy50aXRsZScsIFwiQ29udHJvbCB0aGUgdmVyYm9zaXR5IG9mIGFyaWEgbGFiZWxzXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQudmVyYm9zaXR5U2V0dGluZ3MuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJTY3JlZW4gcmVhZGVyIHZlcmJvc2l0eSBzZXR0aW5ncyBleGlzdCBmb3IgZmVhdHVyZXMgYXJvdW5kIHRoZSB3b3JrYmVuY2ggc28gdGhhdCBvbmNlIGEgdXNlciBpcyBmYW1pbGlhciB3aXRoIGEgZmVhdHVyZSwgdGhleSBjYW4gYXZvaWQgaGVhcmluZyBoaW50cyBhYm91dCBob3cgdG8gb3BlcmF0ZSBpdC4gRm9yIGV4YW1wbGUsIGZlYXR1cmVzIGZvciB3aGljaCBhbiBhY2Nlc3NpYmlsaXR5IGhlbHAgZGlhbG9nIGV4aXN0cyB3aWxsIGluZGljYXRlIGhvdyB0byBvcGVuIHRoZSBkaWFsb2cgdW50aWwgdGhlIHZlcmJvc2l0eSBzZXR0aW5nIGZvciB0aGF0IGZlYXR1cmUgaGFzIGJlZW4gZGlzYWJsZWQuXFxuIFRoZXNlIGFuZCBvdGhlciBhY2Nlc3NpYmlsaXR5IHNldHRpbmdzIGNhbiBiZSBjb25maWd1cmVkIGJ5IHJ1bm5pbmcgdGhlIE9wZW4gQWNjZXNzaWJpbGl0eSBTZXR0aW5ncyBjb21tYW5kLlxcbnswfVwiLCBCdXR0b24obG9jYWxpemUoJ29wZW5WZXJib3NpdHlTZXR0aW5ncycsIFwiT3BlbiBBY2Nlc3NpYmlsaXR5IFNldHRpbmdzXCIpLCAnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLm9wZW5BY2Nlc3NpYmlsaXR5U2V0dGluZ3MnKSksXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdtYXJrZG93bicsIHBhdGg6ICdlbXB0eSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2NvbW1hbmRQYWxldHRlVGFza0FjY2Vzc2liaWxpdHknLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuY29tbWFuZFBhbGV0dGVBY2Nlc3NpYmlsaXR5LnRpdGxlJywgXCJVbmxvY2sgcHJvZHVjdGl2aXR5IHdpdGggdGhlIENvbW1hbmQgUGFsZXR0ZSBcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5jb21tYW5kUGFsZXR0ZUFjY2Vzc2liaWxpdHkuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJSdW4gY29tbWFuZHMgd2l0aG91dCByZWFjaGluZyBmb3IgeW91ciBtb3VzZSB0byBhY2NvbXBsaXNoIGFueSB0YXNrIGluIFZTIENvZGUuXFxuezB9XCIsIEJ1dHRvbihsb2NhbGl6ZSgnY29tbWFuZFBhbGV0dGUnLCBcIk9wZW4gQ29tbWFuZCBQYWxldHRlXCIpLCAnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLnNob3dDb21tYW5kcycpKSxcblx0XHRcdFx0XHRtZWRpYTogeyB0eXBlOiAnbWFya2Rvd24nLCBwYXRoOiAnZW1wdHknIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2tleWJpbmRpbmdzQWNjZXNzaWJpbGl0eScsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5rZXlib2FyZFNob3J0Y3V0cy50aXRsZScsIFwiQ3VzdG9taXplIHlvdXIga2V5Ym9hcmQgc2hvcnRjdXRzXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQua2V5Ym9hcmRTaG9ydGN1dHMuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJPbmNlIHlvdSBoYXZlIGRpc2NvdmVyZWQgeW91ciBmYXZvcml0ZSBjb21tYW5kcywgY3JlYXRlIGN1c3RvbSBrZXlib2FyZCBzaG9ydGN1dHMgZm9yIGluc3RhbnQgYWNjZXNzLlxcbnswfVwiLCBCdXR0b24obG9jYWxpemUoJ2tleWJvYXJkU2hvcnRjdXRzJywgXCJLZXlib2FyZCBTaG9ydGN1dHNcIiksICdjb21tYW5kOnRvU2lkZTp3b3JrYmVuY2guYWN0aW9uLm9wZW5HbG9iYWxLZXliaW5kaW5ncycpKSxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ21hcmtkb3duJywgcGF0aDogJ2VtcHR5Jyxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2FjY2Vzc2liaWxpdHlTaWduYWxzJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmFjY2Vzc2liaWxpdHlTaWduYWxzLnRpdGxlJywgXCJGaW5lIHR1bmUgd2hpY2ggYWNjZXNzaWJpbGl0eSBzaWduYWxzIHlvdSB3YW50IHRvIHJlY2VpdmUgdmlhIGF1ZGlvIG9yIGEgYnJhaWxsZSBkZXZpY2VcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5hY2Nlc3NpYmlsaXR5U2lnbmFscy5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIkFjY2Vzc2liaWxpdHkgc291bmRzIGFuZCBhbm5vdW5jZW1lbnRzIGFyZSBwbGF5ZWQgYXJvdW5kIHRoZSB3b3JrYmVuY2ggZm9yIGRpZmZlcmVudCBldmVudHMuXFxuIFRoZXNlIGNhbiBiZSBkaXNjb3ZlcmVkIGFuZCBjb25maWd1cmVkIHVzaW5nIHRoZSBMaXN0IFNpZ25hbCBTb3VuZHMgYW5kIExpc3QgU2lnbmFsIEFubm91bmNlbWVudHMgY29tbWFuZHMuXFxuezB9XFxuezF9XCIsIEJ1dHRvbihsb2NhbGl6ZSgnbGlzdFNpZ25hbFNvdW5kcycsIFwiTGlzdCBTaWduYWwgU291bmRzXCIpLCAnY29tbWFuZDpzaWduYWxzLnNvdW5kcy5oZWxwJyksIEJ1dHRvbihsb2NhbGl6ZSgnbGlzdFNpZ25hbEFubm91bmNlbWVudHMnLCBcIkxpc3QgU2lnbmFsIEFubm91bmNlbWVudHNcIiksICdjb21tYW5kOmFjY2Vzc2liaWxpdHkuYW5ub3VuY2VtZW50LmhlbHAnKSksXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdtYXJrZG93bicsIHBhdGg6ICdlbXB0eSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2hvdmVyJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmhvdmVyLnRpdGxlJywgXCJBY2Nlc3MgdGhlIGhvdmVyIGluIHRoZSBlZGl0b3IgdG8gZ2V0IG1vcmUgaW5mb3JtYXRpb24gb24gYSB2YXJpYWJsZSBvciBzeW1ib2xcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5ob3Zlci5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIldoaWxlIGZvY3VzIGlzIGluIHRoZSBlZGl0b3Igb24gYSB2YXJpYWJsZSBvciBzeW1ib2wsIGEgaG92ZXIgY2FuIGJlIGZvY3VzZWQgd2l0aCB0aGUgU2hvdyBvciBPcGVuIEhvdmVyIGNvbW1hbmQuXFxuezB9XCIsIEJ1dHRvbihsb2NhbGl6ZSgnc2hvd09yRm9jdXNIb3ZlcicsIFwiU2hvdyBvciBGb2N1cyBIb3ZlclwiKSwgJ2NvbW1hbmQ6ZWRpdG9yLmFjdGlvbi5zaG93SG92ZXInKSksXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdtYXJrZG93bicsIHBhdGg6ICdlbXB0eSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2dvVG9TeW1ib2wnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuZ29Ub1N5bWJvbC50aXRsZScsIFwiTmF2aWdhdGUgdG8gc3ltYm9scyBpbiBhIGZpbGVcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5nb1RvU3ltYm9sLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiVGhlIEdvIHRvIFN5bWJvbCBjb21tYW5kIGlzIHVzZWZ1bCBmb3IgbmF2aWdhdGluZyBiZXR3ZWVuIGltcG9ydGFudCBsYW5kbWFya3MgaW4gYSBkb2N1bWVudC5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCdvcGVuR29Ub1N5bWJvbCcsIFwiR28gdG8gU3ltYm9sXCIpLCAnY29tbWFuZDplZGl0b3IuYWN0aW9uLmdvVG9TeW1ib2wnKSksXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdtYXJrZG93bicsIHBhdGg6ICdlbXB0eSdcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ2NvZGVGb2xkaW5nJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmNvZGVGb2xkaW5nLnRpdGxlJywgXCJVc2UgY29kZSBmb2xkaW5nIHRvIGNvbGxhcHNlIGJsb2NrcyBvZiBjb2RlIGFuZCBmb2N1cyBvbiB0aGUgY29kZSB5b3UncmUgaW50ZXJlc3RlZCBpbi5cIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5jb2RlRm9sZGluZy5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIkZvbGQgb3IgdW5mb2xkIGEgY29kZSBzZWN0aW9uIHdpdGggdGhlIFRvZ2dsZSBGb2xkIGNvbW1hbmQuXFxuezB9XFxuIEZvbGQgb3IgdW5mb2xkIHJlY3Vyc2l2ZWx5IHdpdGggdGhlIFRvZ2dsZSBGb2xkIFJlY3Vyc2l2ZWx5IENvbW1hbmRcXG57MX1cXG5cIiwgQnV0dG9uKGxvY2FsaXplKCd0b2dnbGVGb2xkJywgXCJUb2dnbGUgRm9sZFwiKSwgJ2NvbW1hbmQ6ZWRpdG9yLnRvZ2dsZUZvbGQnKSwgQnV0dG9uKGxvY2FsaXplKCd0b2dnbGVGb2xkUmVjdXJzaXZlbHknLCBcIlRvZ2dsZSBGb2xkIFJlY3Vyc2l2ZWx5XCIpLCAnY29tbWFuZDplZGl0b3IudG9nZ2xlRm9sZFJlY3Vyc2l2ZWx5JykpLFxuXHRcdFx0XHRcdG1lZGlhOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnbWFya2Rvd24nLCBwYXRoOiAnZW1wdHknXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdpbnRlbGxpc2Vuc2UnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuaW50ZWxsaXNlbnNlLnRpdGxlJywgXCJVc2UgSW50ZWxsaXNlbnNlIHRvIGltcHJvdmUgY29kaW5nIGVmZmljaWVuY3lcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5pbnRlbGxpc2Vuc2UuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJJbnRlbGxpc2Vuc2Ugc3VnZ2VzdGlvbnMgY2FuIGJlIG9wZW5lZCB3aXRoIHRoZSBUcmlnZ2VyIEludGVsbGlzZW5zZSBjb21tYW5kLlxcbnswfVxcbiBJbmxpbmUgaW50ZWxsaXNlbnNlIHN1Z2dlc3Rpb25zIGNhbiBiZSB0cmlnZ2VyZWQgd2l0aCBUcmlnZ2VyIElubGluZSBTdWdnZXN0aW9uXFxuezF9XFxuIFVzZWZ1bCBzZXR0aW5ncyBpbmNsdWRlIGVkaXRvci5pbmxpbmVDb21wbGV0aW9uc0FjY2Vzc2liaWxpdHlWZXJib3NlIGFuZCBlZGl0b3Iuc2NyZWVuUmVhZGVyQW5ub3VuY2VJbmxpbmVTdWdnZXN0aW9uLlwiLCBCdXR0b24obG9jYWxpemUoJ3RyaWdnZXJJbnRlbGxpc2Vuc2UnLCBcIlRyaWdnZXIgSW50ZWxsaXNlbnNlXCIpLCAnY29tbWFuZDplZGl0b3IuYWN0aW9uLnRyaWdnZXJTdWdnZXN0JyksIEJ1dHRvbihsb2NhbGl6ZSgndHJpZ2dlcklubGluZVN1Z2dlc3Rpb24nLCAnVHJpZ2dlciBJbmxpbmUgU3VnZ2VzdGlvbicpLCAnY29tbWFuZDplZGl0b3IuYWN0aW9uLmlubGluZVN1Z2dlc3QudHJpZ2dlcicpKSxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ21hcmtkb3duJywgcGF0aDogJ2VtcHR5J1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnYWNjZXNzaWJpbGl0eVNldHRpbmdzJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmFjY2Vzc2liaWxpdHlTZXR0aW5ncy50aXRsZScsIFwiQ29uZmlndXJlIGFjY2Vzc2liaWxpdHkgc2V0dGluZ3NcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5hY2Nlc3NpYmlsaXR5U2V0dGluZ3MuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJBY2Nlc3NpYmlsaXR5IHNldHRpbmdzIGNhbiBiZSBjb25maWd1cmVkIGJ5IHJ1bm5pbmcgdGhlIE9wZW4gQWNjZXNzaWJpbGl0eSBTZXR0aW5ncyBjb21tYW5kLlxcbnswfVwiLCBCdXR0b24obG9jYWxpemUoJ29wZW5BY2Nlc3NpYmlsaXR5U2V0dGluZ3MnLCBcIk9wZW4gQWNjZXNzaWJpbGl0eSBTZXR0aW5nc1wiKSwgJ2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5vcGVuQWNjZXNzaWJpbGl0eVNldHRpbmdzJykpLFxuXHRcdFx0XHRcdG1lZGlhOiB7IHR5cGU6ICdtYXJrZG93bicsIHBhdGg6ICdlbXB0eScgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdkaWN0YXRpb24nLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuZGljdGF0aW9uLnRpdGxlJywgXCJVc2UgZGljdGF0aW9uIHRvIHdyaXRlIGNvZGUgYW5kIHRleHQgaW4gdGhlIGVkaXRvciBhbmQgdGVybWluYWxcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5kaWN0YXRpb24uZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJEaWN0YXRpb24gYWxsb3dzIHlvdSB0byB3cml0ZSBjb2RlIGFuZCB0ZXh0IHVzaW5nIHlvdXIgdm9pY2UuIEl0IGNhbiBiZSBhY3RpdmF0ZWQgd2l0aCB0aGUgVm9pY2U6IFN0YXJ0IERpY3RhdGlvbiBpbiBFZGl0b3IgY29tbWFuZC5cXG57MH1cXG4gRm9yIGRpY3RhdGlvbiBpbiB0aGUgdGVybWluYWwsIHVzZSB0aGUgVm9pY2U6IFN0YXJ0IERpY3RhdGlvbiBpbiBUZXJtaW5hbCBhbmQgVm9pY2U6IFN0b3AgRGljdGF0aW9uIGluIFRlcm1pbmFsIGNvbW1hbmRzLlxcbnsxfVxcbnsyfVwiLCBCdXR0b24obG9jYWxpemUoJ3RvZ2dsZURpY3RhdGlvbicsIFwiVm9pY2U6IFN0YXJ0IERpY3RhdGlvbiBpbiBFZGl0b3JcIiksICdjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24uZWRpdG9yRGljdGF0aW9uLnN0YXJ0JyksIEJ1dHRvbihsb2NhbGl6ZSgndGVybWluYWxTdGFydERpY3RhdGlvbicsIFwiVGVybWluYWw6IFN0YXJ0IERpY3RhdGlvbiBpbiBUZXJtaW5hbFwiKSwgJ2NvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5zdGFydFZvaWNlJyksIEJ1dHRvbihsb2NhbGl6ZSgndGVybWluYWxTdG9wRGljdGF0aW9uJywgXCJUZXJtaW5hbDogU3RvcCBEaWN0YXRpb24gaW4gVGVybWluYWxcIiksICdjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24udGVybWluYWwuc3RvcFZvaWNlJykpLFxuXHRcdFx0XHRcdHdoZW46ICdoYXNTcGVlY2hQcm92aWRlcicsXG5cdFx0XHRcdFx0bWVkaWE6IHsgdHlwZTogJ21hcmtkb3duJywgcGF0aDogJ2VtcHR5JyB9XG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9XG5cdH0sXG5cdHtcblx0XHRpZDogJ0JlZ2lubmVyJyxcblx0XHRpc0ZlYXR1cmVkOiBmYWxzZSxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmJlZ2lubmVyLnRpdGxlJywgXCJMZWFybiB0aGUgRnVuZGFtZW50YWxzXCIpLFxuXHRcdGljb246IGJlZ2lubmVySWNvbixcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmJlZ2lubmVyLmRlc2NyaXB0aW9uJywgXCJHZXQgYW4gb3ZlcnZpZXcgb2YgdGhlIG1vc3QgZXNzZW50aWFsIGZlYXR1cmVzXCIpLFxuXHRcdHdhbGt0aHJvdWdoUGFnZVRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuYmVnaW5uZXIud2Fsa3Rocm91Z2hQYWdlVGl0bGUnLCAnRXNzZW50aWFsIEZlYXR1cmVzJyksXG5cdFx0Y29udGVudDoge1xuXHRcdFx0dHlwZTogJ3N0ZXBzJyxcblx0XHRcdHN0ZXBzOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3NldHRpbmdzQW5kU3luYycsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zZXR0aW5ncy50aXRsZScsIFwiVHVuZSB5b3VyIHNldHRpbmdzXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuc2V0dGluZ3NBbmRTeW5jLmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIFwiQ3VzdG9taXplIGV2ZXJ5IGFzcGVjdCBvZiBWUyBDb2RlIGFuZCBbc3luY10oY29tbWFuZDp3b3JrYmVuY2gudXNlckRhdGFTeW5jLmFjdGlvbnMudHVybk9uKSBjdXN0b21pemF0aW9ucyBhY3Jvc3MgZGV2aWNlcy5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCd0d2Vha1NldHRpbmdzJywgXCJPcGVuIFNldHRpbmdzXCIpLCAnY29tbWFuZDp0b1NpZGU6d29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3MnKSksXG5cdFx0XHRcdFx0d2hlbjogJ3dvcmtzcGFjZVBsYXRmb3JtICE9IFxcJ3dlYndvcmtlclxcJyAmJiBzeW5jU3RhdHVzICE9IHVuaW5pdGlhbGl6ZWQnLFxuXHRcdFx0XHRcdGNvbXBsZXRpb25FdmVudHM6IFsnb25FdmVudDpzeW5jLWVuYWJsZWQnXSxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N2ZycsIGFsdFRleHQ6ICdWUyBDb2RlIFNldHRpbmdzJywgcGF0aDogJ3NldHRpbmdzLnN2Zydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdleHRlbnNpb25zJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmV4dGVuc2lvbnMudGl0bGUnLCBcIkNvZGUgd2l0aCBleHRlbnNpb25zXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuZXh0ZW5zaW9ucy5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIkV4dGVuc2lvbnMgYXJlIFZTIENvZGUncyBwb3dlci11cHMuIFRoZXkgcmFuZ2UgZnJvbSBoYW5keSBwcm9kdWN0aXZpdHkgaGFja3MsIGV4cGFuZGluZyBvdXQtb2YtdGhlLWJveCBmZWF0dXJlcywgdG8gYWRkaW5nIGNvbXBsZXRlbHkgbmV3IGNhcGFiaWxpdGllcy5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCdicm93c2VQb3B1bGFyJywgXCJCcm93c2UgUG9wdWxhciBFeHRlbnNpb25zXCIpLCAnY29tbWFuZDp3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2hvd1BvcHVsYXJFeHRlbnNpb25zJykpLFxuXHRcdFx0XHRcdHdoZW46ICd3b3Jrc3BhY2VQbGF0Zm9ybSAhPSBcXCd3ZWJ3b3JrZXJcXCcnLFxuXHRcdFx0XHRcdG1lZGlhOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3ZnJywgYWx0VGV4dDogJ1ZTIENvZGUgZXh0ZW5zaW9uIG1hcmtldHBsYWNlIHdpdGggZmVhdHVyZWQgbGFuZ3VhZ2UgZXh0ZW5zaW9ucycsIHBhdGg6ICdleHRlbnNpb25zLnN2Zydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC50ZXJtaW5hbC50aXRsZScsIFwiQnVpbHQtaW4gdGVybWluYWxcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC50ZXJtaW5hbC5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIlF1aWNrbHkgcnVuIHNoZWxsIGNvbW1hbmRzIGFuZCBtb25pdG9yIGJ1aWxkIG91dHB1dCwgcmlnaHQgbmV4dCB0byB5b3VyIGNvZGUuXFxuezB9XCIsIEJ1dHRvbihsb2NhbGl6ZSgnc2hvd1Rlcm1pbmFsJywgXCJPcGVuIFRlcm1pbmFsXCIpLCAnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLnRlcm1pbmFsLnRvZ2dsZVRlcm1pbmFsJykpLFxuXHRcdFx0XHRcdHdoZW46ICd3b3Jrc3BhY2VQbGF0Zm9ybSAhPSBcXCd3ZWJ3b3JrZXJcXCcgJiYgcmVtb3RlTmFtZSAhPSBjb2Rlc3BhY2VzICYmICF0ZXJtaW5hbElzT3BlbicsXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdmcnLCBhbHRUZXh0OiAnSW50ZWdyYXRlZCB0ZXJtaW5hbCBydW5uaW5nIGEgZmV3IG5wbSBjb21tYW5kcycsIHBhdGg6ICd0ZXJtaW5hbC5zdmcnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnZGVidWdnaW5nJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLmRlYnVnLnRpdGxlJywgXCJXYXRjaCB5b3VyIGNvZGUgaW4gYWN0aW9uXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuZGVidWcuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJBY2NlbGVyYXRlIHlvdXIgZWRpdCwgYnVpbGQsIHRlc3QsIGFuZCBkZWJ1ZyBsb29wIGJ5IHNldHRpbmcgdXAgYSBsYXVuY2ggY29uZmlndXJhdGlvbi5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCdydW5Qcm9qZWN0JywgXCJSdW4geW91ciBQcm9qZWN0XCIpLCAnY29tbWFuZDp3b3JrYmVuY2guYWN0aW9uLmRlYnVnLnNlbGVjdGFuZHN0YXJ0JykpLFxuXHRcdFx0XHRcdHdoZW46ICd3b3Jrc3BhY2VQbGF0Zm9ybSAhPSBcXCd3ZWJ3b3JrZXJcXCcgJiYgd29ya3NwYWNlRm9sZGVyQ291bnQgIT0gMCcsXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdmcnLCBhbHRUZXh0OiAnUnVuIGFuZCBkZWJ1ZyB2aWV3LicsIHBhdGg6ICdkZWJ1Zy5zdmcnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3NjbUNsb25lJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnNjbS50aXRsZScsIFwiVHJhY2sgeW91ciBjb2RlIHdpdGggR2l0XCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuc2NtQ2xvbmUuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJTZXQgdXAgdGhlIGJ1aWx0LWluIHZlcnNpb24gY29udHJvbCBmb3IgeW91ciBwcm9qZWN0IHRvIHRyYWNrIHlvdXIgY2hhbmdlcyBhbmQgY29sbGFib3JhdGUgd2l0aCBvdGhlcnMuXFxuezB9XCIsIEJ1dHRvbihsb2NhbGl6ZSgnY2xvbmVSZXBvJywgXCJDbG9uZSBSZXBvc2l0b3J5XCIpLCAnY29tbWFuZDpnaXQuY2xvbmUnKSksXG5cdFx0XHRcdFx0d2hlbjogJ2NvbmZpZy5naXQuZW5hYmxlZCAmJiAhZ2l0Lm1pc3NpbmcgJiYgd29ya3NwYWNlRm9sZGVyQ291bnQgPT0gMCcsXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdmcnLCBhbHRUZXh0OiAnU291cmNlIENvbnRyb2wgdmlldy4nLCBwYXRoOiAnZ2l0LnN2ZycsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnc2NtU2V0dXAnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQuc2NtLnRpdGxlJywgXCJUcmFjayB5b3VyIGNvZGUgd2l0aCBHaXRcIiksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zY21TZXR1cC5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIlNldCB1cCB0aGUgYnVpbHQtaW4gdmVyc2lvbiBjb250cm9sIGZvciB5b3VyIHByb2plY3QgdG8gdHJhY2sgeW91ciBjaGFuZ2VzIGFuZCBjb2xsYWJvcmF0ZSB3aXRoIG90aGVycy5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCdpbml0UmVwbycsIFwiSW5pdGlhbGl6ZSBHaXQgUmVwb3NpdG9yeVwiKSwgJ2NvbW1hbmQ6Z2l0LmluaXQnKSksXG5cdFx0XHRcdFx0d2hlbjogJ2NvbmZpZy5naXQuZW5hYmxlZCAmJiAhZ2l0Lm1pc3NpbmcgJiYgd29ya3NwYWNlRm9sZGVyQ291bnQgIT0gMCAmJiBnaXRPcGVuUmVwb3NpdG9yeUNvdW50ID09IDAnLFxuXHRcdFx0XHRcdG1lZGlhOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3ZnJywgYWx0VGV4dDogJ1NvdXJjZSBDb250cm9sIHZpZXcuJywgcGF0aDogJ2dpdC5zdmcnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3NjbScsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zY20udGl0bGUnLCBcIlRyYWNrIHlvdXIgY29kZSB3aXRoIEdpdFwiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnNjbS5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIk5vIG1vcmUgbG9va2luZyB1cCBHaXQgY29tbWFuZHMhIEdpdCBhbmQgR2l0SHViIHdvcmtmbG93cyBhcmUgc2VhbWxlc3NseSBpbnRlZ3JhdGVkLlxcbnswfVwiLCBCdXR0b24obG9jYWxpemUoJ29wZW5TQ00nLCBcIk9wZW4gU291cmNlIENvbnRyb2xcIiksICdjb21tYW5kOndvcmtiZW5jaC52aWV3LnNjbScpKSxcblx0XHRcdFx0XHR3aGVuOiAnY29uZmlnLmdpdC5lbmFibGVkICYmICFnaXQubWlzc2luZyAmJiB3b3Jrc3BhY2VGb2xkZXJDb3VudCAhPSAwICYmIGdpdE9wZW5SZXBvc2l0b3J5Q291bnQgIT0gMCAmJiBhY3RpdmVWaWV3bGV0ICE9IFxcJ3dvcmtiZW5jaC52aWV3LnNjbVxcJycsXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdmcnLCBhbHRUZXh0OiAnU291cmNlIENvbnRyb2wgdmlldy4nLCBwYXRoOiAnZ2l0LnN2ZycsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAnaW5zdGFsbEdpdCcsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5pbnN0YWxsR2l0LnRpdGxlJywgXCJJbnN0YWxsIEdpdFwiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoeyBrZXk6ICdnZXR0aW5nU3RhcnRlZC5pbnN0YWxsR2l0LmRlc2NyaXB0aW9uLmludGVycG9sYXRlZCcsIGNvbW1lbnQ6IFsnVGhlIHBsYWNlaG9sZGVycyBhcmUgY29tbWFuZCBsaW5rIGl0ZW1zIHNob3VsZCBub3QgYmUgdHJhbnNsYXRlZCddIH0sIFwiSW5zdGFsbCBHaXQgdG8gdHJhY2sgY2hhbmdlcyBpbiB5b3VyIHByb2plY3RzLlxcbnswfVxcbnsxfVJlbG9hZCB3aW5kb3d7Mn0gYWZ0ZXIgaW5zdGFsbGF0aW9uIHRvIGNvbXBsZXRlIEdpdCBzZXR1cC5cIiwgQnV0dG9uKGxvY2FsaXplKCdpbnN0YWxsR2l0JywgXCJJbnN0YWxsIEdpdFwiKSwgJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS1pbnN0YWxsLWdpdCcpLCAnWycsICddKGNvbW1hbmQ6d29ya2JlbmNoLmFjdGlvbi5yZWxvYWRXaW5kb3cpJyksXG5cdFx0XHRcdFx0d2hlbjogJ2dpdC5taXNzaW5nJyxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N2ZycsIGFsdFRleHQ6ICdJbnN0YWxsIEdpdC4nLCBwYXRoOiAnZ2l0LnN2ZycsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjb21wbGV0aW9uRXZlbnRzOiBbXG5cdFx0XHRcdFx0XHQnb25Db250ZXh0OmdpdC5zdGF0ZSA9PSBpbml0aWFsaXplZCdcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAndGFza3MnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQudGFza3MudGl0bGUnLCBcIkF1dG9tYXRlIHlvdXIgcHJvamVjdCB0YXNrc1wiKSxcblx0XHRcdFx0XHR3aGVuOiAnd29ya3NwYWNlRm9sZGVyQ291bnQgIT0gMCAmJiB3b3Jrc3BhY2VQbGF0Zm9ybSAhPSBcXCd3ZWJ3b3JrZXJcXCcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQudGFza3MuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJDcmVhdGUgdGFza3MgZm9yIHlvdXIgY29tbW9uIHdvcmtmbG93cyBhbmQgZW5qb3kgdGhlIGludGVncmF0ZWQgZXhwZXJpZW5jZSBvZiBydW5uaW5nIHNjcmlwdHMgYW5kIGF1dG9tYXRpY2FsbHkgY2hlY2tpbmcgcmVzdWx0cy5cXG57MH1cIiwgQnV0dG9uKGxvY2FsaXplKCdydW5UYXNrcycsIFwiUnVuIEF1dG8tZGV0ZWN0ZWQgVGFza3NcIiksICdjb21tYW5kOndvcmtiZW5jaC5hY3Rpb24udGFza3MucnVuVGFzaycpKSxcblx0XHRcdFx0XHRtZWRpYToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N2ZycsIGFsdFRleHQ6ICdUYXNrIHJ1bm5lci4nLCBwYXRoOiAncnVuVGFzay5zdmcnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3Nob3J0Y3V0cycsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5zaG9ydGN1dHMudGl0bGUnLCBcIkN1c3RvbWl6ZSB5b3VyIHNob3J0Y3V0c1wiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLnNob3J0Y3V0cy5kZXNjcmlwdGlvbi5pbnRlcnBvbGF0ZWQnLCBcIk9uY2UgeW91IGhhdmUgZGlzY292ZXJlZCB5b3VyIGZhdm9yaXRlIGNvbW1hbmRzLCBjcmVhdGUgY3VzdG9tIGtleWJvYXJkIHNob3J0Y3V0cyBmb3IgaW5zdGFudCBhY2Nlc3MuXFxuezB9XCIsIEJ1dHRvbihsb2NhbGl6ZSgna2V5Ym9hcmRTaG9ydGN1dHMnLCBcIktleWJvYXJkIFNob3J0Y3V0c1wiKSwgJ2NvbW1hbmQ6dG9TaWRlOndvcmtiZW5jaC5hY3Rpb24ub3Blbkdsb2JhbEtleWJpbmRpbmdzJykpLFxuXHRcdFx0XHRcdG1lZGlhOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3ZnJywgYWx0VGV4dDogJ0ludGVyYWN0aXZlIHNob3J0Y3V0cy4nLCBwYXRoOiAnc2hvcnRjdXRzLnN2ZycsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICd3b3Jrc3BhY2VUcnVzdCcsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC53b3Jrc3BhY2VUcnVzdC50aXRsZScsIFwiU2FmZWx5IGJyb3dzZSBhbmQgZWRpdCBjb2RlXCIpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2V0dGluZ1N0YXJ0ZWQud29ya3NwYWNlVHJ1c3QuZGVzY3JpcHRpb24uaW50ZXJwb2xhdGVkJywgXCJ7MH0gbGV0cyB5b3UgZGVjaWRlIHdoZXRoZXIgeW91ciBwcm9qZWN0IGZvbGRlcnMgc2hvdWxkICoqYWxsb3cgb3IgcmVzdHJpY3QqKiBhdXRvbWF0aWMgY29kZSBleGVjdXRpb24gX18ocmVxdWlyZWQgZm9yIGV4dGVuc2lvbnMsIGRlYnVnZ2luZywgZXRjKV9fLlxcbk9wZW5pbmcgYSBmaWxlL2ZvbGRlciB3aWxsIHByb21wdCB0byBncmFudCB0cnVzdC4gWW91IGNhbiBhbHdheXMgezF9IGxhdGVyLlwiLCBCdXR0b24obG9jYWxpemUoJ3dvcmtzcGFjZVRydXN0JywgXCJXb3Jrc3BhY2UgVHJ1c3RcIiksICdodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2VkaXRvci93b3Jrc3BhY2UtdHJ1c3QnKSwgQnV0dG9uKGxvY2FsaXplKCdlbmFibGVUcnVzdCcsIFwiZW5hYmxlIHRydXN0XCIpLCAnY29tbWFuZDp0b1NpZGU6d29ya2JlbmNoLnRydXN0Lm1hbmFnZScpKSxcblx0XHRcdFx0XHR3aGVuOiAnd29ya3NwYWNlUGxhdGZvcm0gIT0gXFwnd2Vid29ya2VyXFwnICYmICFpc1dvcmtzcGFjZVRydXN0ZWQgJiYgd29ya3NwYWNlRm9sZGVyQ291bnQgPT0gMCcsXG5cdFx0XHRcdFx0bWVkaWE6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdmcnLCBhbHRUZXh0OiAnV29ya3NwYWNlIFRydXN0IGVkaXRvciBpbiBSZXN0cmljdGVkIG1vZGUgYW5kIGEgcHJpbWFyeSBidXR0b24gZm9yIHN3aXRjaGluZyB0byBUcnVzdGVkIG1vZGUuJywgcGF0aDogJ3dvcmtzcGFjZVRydXN0LnN2Zydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XVxuXHRcdH1cblx0fSxcblx0e1xuXHRcdGlkOiAnbm90ZWJvb2tzJyxcblx0XHR0aXRsZTogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLm5vdGVib29rLnRpdGxlJywgXCJDdXN0b21pemUgTm90ZWJvb2tzXCIpLFxuXHRcdGRlc2NyaXB0aW9uOiAnJyxcblx0XHRpY29uOiBzZXR1cEljb24sXG5cdFx0aXNGZWF0dXJlZDogZmFsc2UsXG5cdFx0d2hlbjogYGNvbmZpZy4ke05vdGVib29rU2V0dGluZy5vcGVuR2V0dGluZ1N0YXJ0ZWR9ICYmIHVzZXJIYXNPcGVuZWROb3RlYm9va2AsXG5cdFx0d2Fsa3Rocm91Z2hQYWdlVGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5ub3RlYm9vay53YWxrdGhyb3VnaFBhZ2VUaXRsZScsICdOb3RlYm9va3MnKSxcblx0XHRjb250ZW50OiB7XG5cdFx0XHR0eXBlOiAnc3RlcHMnLFxuXHRcdFx0c3RlcHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbXBsZXRpb25FdmVudHM6IFsnb25Db21tYW5kOm5vdGVib29rLnNldFByb2ZpbGUnXSxcblx0XHRcdFx0XHRpZDogJ25vdGVib29rUHJvZmlsZScsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdnZXR0aW5nU3RhcnRlZC5ub3RlYm9va1Byb2ZpbGUudGl0bGUnLCBcIlNlbGVjdCB0aGUgbGF5b3V0IGZvciB5b3VyIG5vdGVib29rc1wiKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dldHRpbmdTdGFydGVkLm5vdGVib29rUHJvZmlsZS5kZXNjcmlwdGlvbicsIFwiR2V0IG5vdGVib29rcyB0byBmZWVsIGp1c3QgdGhlIHdheSB5b3UgcHJlZmVyXCIpLFxuXHRcdFx0XHRcdHdoZW46ICd1c2VySGFzT3BlbmVkTm90ZWJvb2snLFxuXHRcdFx0XHRcdG1lZGlhOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnbWFya2Rvd24nLCBwYXRoOiAnbm90ZWJvb2tQcm9maWxlJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdF1cblx0XHR9XG5cdH1cbl07XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLHdCQUF3QjtBQUMvQixPQUFPLDZCQUE2QjtBQUNwQyxPQUFPLDRCQUE0QjtBQUNuQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFFeEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywwQ0FBMEM7QUFFbkQsT0FBTyxhQUFhO0FBTXBCLE1BQU0sY0FBYztBQUFBLEVBQ25CLGtCQUFrQixRQUFRLGtCQUFrQixvQkFBb0I7QUFBQSxFQUNoRSxVQUFVLFFBQVEsa0JBQWtCLFlBQVksRUFBRSxTQUFTLEVBQUUsTUFBTSxHQUFHLEVBQUU7QUFBQSxFQUN4RSxzQkFBc0IsUUFBUSxrQkFBa0Isd0JBQXdCO0FBQUEsRUFDeEUsbUJBQW1CLFFBQVEsa0JBQWtCLHFCQUFxQjtBQUFBLEVBQ2xFLHFCQUFxQixRQUFRLGtCQUFrQix1QkFBdUI7QUFDdkU7QUFFTyxTQUFTLHVCQUF1QixtQkFBbUM7QUFDekUsU0FBTyxTQUFTLEVBQUUsS0FBSyxZQUFZLFNBQVMsQ0FBQyxnQkFBZ0IscUJBQXFCLG1CQUFtQixFQUFFLEdBQUcsK0lBQStJLFlBQVksU0FBUyxRQUFRLE1BQU0sWUFBWSxzQkFBc0IsaUJBQWlCO0FBQ2hWO0FBRUEsTUFBTSxzQ0FBc0M7QUFBQSxFQUE1QztBQUVDLFNBQWlCLFlBQVksb0JBQUksSUFBNEM7QUFBQTtBQUFBLEVBRTdFLGlCQUFpQixVQUFrQixVQUFnRDtBQUNsRixTQUFLLFVBQVUsSUFBSSxVQUFVLFFBQVE7QUFBQSxFQUN0QztBQUFBLEVBRUEsWUFBWSxVQUE4RDtBQUN6RSxXQUFPLEtBQUssVUFBVSxJQUFJLFFBQVE7QUFBQSxFQUNuQztBQUNEO0FBQ08sTUFBTSxnQ0FBZ0MsSUFBSSxzQ0FBc0M7QUFFdkYsZUFBc0IsZ0JBQWdCLFVBQWdDO0FBQ3JFLE1BQUksQ0FBQyxTQUFTLE9BQU87QUFDcEIsVUFB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
