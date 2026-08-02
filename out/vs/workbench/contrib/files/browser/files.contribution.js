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
import * as nls from "../../../../nls.js";
import { sep } from "../../../../base/common/path.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope } from "../../../../platform/configuration/common/configurationRegistry.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { EditorExtensions } from "../../../common/editor.js";
import { AutoSaveConfiguration, HotExitConfiguration, FILES_EXCLUDE_CONFIG, FILES_ASSOCIATIONS_CONFIG, FILES_READONLY_INCLUDE_CONFIG, FILES_READONLY_EXCLUDE_CONFIG, FILES_READONLY_FROM_PERMISSIONS_CONFIG } from "../../../../platform/files/common/files.js";
import { SortOrder, LexicographicOptions, FILE_EDITOR_INPUT_ID, BINARY_TEXT_FILE_MODE, UndoConfirmLevel } from "../common/files.js";
import { TextFileEditorTracker } from "./editors/textFileEditorTracker.js";
import { TextFileSaveErrorHandler } from "./editors/textFileSaveErrorHandler.js";
import { FileEditorInput } from "./editors/fileEditorInput.js";
import { BinaryFileEditor } from "./editors/binaryFileEditor.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { isNative, isWeb, isWindows } from "../../../../base/common/platform.js";
import { ExplorerViewletViewsContribution } from "./explorerViewlet.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ExplorerService, UNDO_REDO_SOURCE } from "./explorerService.js";
import { GUESSABLE_ENCODINGS, SUPPORTED_ENCODINGS } from "../../../services/textfile/common/encoding.js";
import { Schemas } from "../../../../base/common/network.js";
import { WorkspaceWatcher } from "./workspaceWatcher.js";
import { editorConfigurationBaseNode } from "../../../../editor/common/config/editorConfigurationSchema.js";
import { DirtyFilesIndicator } from "../common/dirtyFilesIndicator.js";
import { UndoCommand, RedoCommand } from "../../../../editor/browser/editorExtensions.js";
import { IUndoRedoService } from "../../../../platform/undoRedo/common/undoRedo.js";
import { IExplorerService } from "./files.js";
import { FileEditorInputSerializer, FileEditorWorkingCopyEditorHandler } from "./editors/fileEditorHandler.js";
import { ModesRegistry } from "../../../../editor/common/languages/modesRegistry.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { TextFileEditor } from "./editors/textFileEditor.js";
let FileUriLabelContribution = class {
  constructor(labelService) {
    labelService.registerFormatter({
      scheme: Schemas.file,
      formatting: {
        label: "${authority}${path}",
        separator: sep,
        tildify: !isWindows,
        normalizeDriveLetter: isWindows,
        authorityPrefix: sep + sep,
        workspaceSuffix: ""
      }
    });
  }
};
FileUriLabelContribution.ID = "workbench.contrib.fileUriLabel";
FileUriLabelContribution = __decorateClass([
  __decorateParam(0, ILabelService)
], FileUriLabelContribution);
registerSingleton(IExplorerService, ExplorerService, InstantiationType.Delayed);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    TextFileEditor,
    TextFileEditor.ID,
    nls.localize("textFileEditor", "Text File Editor")
  ),
  [
    new SyncDescriptor(FileEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    BinaryFileEditor,
    BinaryFileEditor.ID,
    nls.localize("binaryFileEditor", "Binary File Editor")
  ),
  [
    new SyncDescriptor(FileEditorInput)
  ]
);
Registry.as(EditorExtensions.EditorFactory).registerFileEditorFactory({
  typeId: FILE_EDITOR_INPUT_ID,
  createFileEditor: (resource, preferredResource, preferredName, preferredDescription, preferredEncoding, preferredLanguageId, preferredContents, instantiationService) => {
    return instantiationService.createInstance(FileEditorInput, resource, preferredResource, preferredName, preferredDescription, preferredEncoding, preferredLanguageId, preferredContents);
  },
  isFileEditor: (obj) => {
    return obj instanceof FileEditorInput;
  }
});
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(FILE_EDITOR_INPUT_ID, FileEditorInputSerializer);
registerWorkbenchContribution2(FileEditorWorkingCopyEditorHandler.ID, FileEditorWorkingCopyEditorHandler, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(ExplorerViewletViewsContribution.ID, ExplorerViewletViewsContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(TextFileEditorTracker.ID, TextFileEditorTracker, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(TextFileSaveErrorHandler.ID, TextFileSaveErrorHandler, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(FileUriLabelContribution.ID, FileUriLabelContribution, WorkbenchPhase.BlockStartup);
registerWorkbenchContribution2(WorkspaceWatcher.ID, WorkspaceWatcher, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(DirtyFilesIndicator.ID, DirtyFilesIndicator, WorkbenchPhase.BlockStartup);
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
const hotExitConfiguration = isNative ? {
  "type": "string",
  "scope": ConfigurationScope.APPLICATION,
  "enum": [HotExitConfiguration.OFF, HotExitConfiguration.ON_EXIT, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE],
  "default": HotExitConfiguration.ON_EXIT,
  "markdownEnumDescriptions": [
    nls.localize("hotExit.off", "Disable hot exit. A prompt will show when attempting to close a window with editors that have unsaved changes."),
    nls.localize("hotExit.onExit", "Hot exit will be triggered when the last window is closed on Windows/Linux or when the `workbench.action.quit` command is triggered (command palette, keybinding, menu). All windows without folders opened will be restored upon next launch. A list of previously opened windows with unsaved files can be accessed via `File > Open Recent > More...`"),
    nls.localize("hotExit.onExitAndWindowClose", "Hot exit will be triggered when the last window is closed on Windows/Linux or when the `workbench.action.quit` command is triggered (command palette, keybinding, menu), and also for any window with a folder opened regardless of whether it's the last window. All windows without folders opened will be restored upon next launch. A list of previously opened windows with unsaved files can be accessed via `File > Open Recent > More...`")
  ],
  "markdownDescription": nls.localize("hotExit", "[Hot Exit](https://aka.ms/vscode-hot-exit) controls whether unsaved files are remembered between sessions, allowing the save prompt when exiting the editor to be skipped.", HotExitConfiguration.ON_EXIT, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE)
} : {
  "type": "string",
  "scope": ConfigurationScope.APPLICATION,
  "enum": [HotExitConfiguration.OFF, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE],
  "default": HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE,
  "markdownEnumDescriptions": [
    nls.localize("hotExit.off", "Disable hot exit. A prompt will show when attempting to close a window with editors that have unsaved changes."),
    nls.localize("hotExit.onExitAndWindowCloseBrowser", "Hot exit will be triggered when the browser quits or the window or tab is closed.")
  ],
  "markdownDescription": nls.localize("hotExit", "[Hot Exit](https://aka.ms/vscode-hot-exit) controls whether unsaved files are remembered between sessions, allowing the save prompt when exiting the editor to be skipped.", HotExitConfiguration.ON_EXIT, HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE)
};
configurationRegistry.registerConfiguration({
  "id": "files",
  "order": 9,
  "title": nls.localize("filesConfigurationTitle", "Files"),
  "type": "object",
  "properties": {
    [FILES_EXCLUDE_CONFIG]: {
      "type": "object",
      "markdownDescription": nls.localize("exclude", "Configure [glob patterns](https://aka.ms/vscode-glob-patterns) for excluding files and folders. For example, the File Explorer decides which files and folders to show or hide based on this setting. Refer to the `#search.exclude#` setting to define search-specific excludes. Refer to the `#explorer.excludeGitIgnore#` setting for ignoring files based on your `.gitignore`."),
      "default": {
        ...{ "**/.git": true, "**/.svn": true, "**/.hg": true, "**/.DS_Store": true, "**/Thumbs.db": true },
        ...isWeb ? {
          "**/*.crswap": true
          /* filter out swap files used for local file access */
        } : void 0
      },
      "scope": ConfigurationScope.RESOURCE,
      "additionalProperties": {
        "anyOf": [
          {
            "type": "boolean",
            "enum": [true, false],
            "enumDescriptions": [nls.localize("trueDescription", "Enable the pattern."), nls.localize("falseDescription", "Disable the pattern.")],
            "description": nls.localize("files.exclude.boolean", "The glob pattern to match file paths against. Set to true or false to enable or disable the pattern.")
          },
          {
            "type": "object",
            "properties": {
              "when": {
                "type": "string",
                // expression ({ "**/*.js": { "when": "$(basename).js" } })
                "pattern": "\\w*\\$\\(basename\\)\\w*",
                "default": "$(basename).ext",
                "markdownDescription": nls.localize({ key: "files.exclude.when", comment: ["\\$(basename) should not be translated"] }, "Additional check on the siblings of a matching file. Use \\$(basename) as variable for the matching file name.")
              }
            }
          }
        ]
      }
    },
    [FILES_ASSOCIATIONS_CONFIG]: {
      "type": "object",
      "markdownDescription": nls.localize("associations", 'Configure [glob patterns](https://aka.ms/vscode-glob-patterns) of file associations to languages (for example `"*.extension": "html"`). Patterns will match on the absolute path of a file if they contain a path separator and will match on the name of the file otherwise. These have precedence over the default associations of the languages installed.'),
      "additionalProperties": {
        "type": "string"
      }
    },
    "files.encoding": {
      "type": "string",
      "enum": Object.keys(SUPPORTED_ENCODINGS),
      "default": "utf8",
      "description": nls.localize("encoding", "The default character set encoding to use when reading and writing files. This setting can also be configured per language."),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE,
      "enumDescriptions": Object.keys(SUPPORTED_ENCODINGS).map((key) => SUPPORTED_ENCODINGS[key].labelLong),
      "enumItemLabels": Object.keys(SUPPORTED_ENCODINGS).map((key) => SUPPORTED_ENCODINGS[key].labelLong)
    },
    "files.autoGuessEncoding": {
      "type": "boolean",
      "default": false,
      "markdownDescription": nls.localize("autoGuessEncoding", "When enabled, the editor will attempt to guess the character set encoding when opening files. This setting can also be configured per language. Note, this setting is not respected by text search. Only {0} is respected.", "`#files.encoding#`"),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.candidateGuessEncodings": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": Object.keys(GUESSABLE_ENCODINGS),
        "enumDescriptions": Object.keys(GUESSABLE_ENCODINGS).map((key) => GUESSABLE_ENCODINGS[key].labelLong)
      },
      "default": [],
      "markdownDescription": nls.localize("candidateGuessEncodings", "List of character set encodings that the editor should attempt to guess in the order they are listed. In case it cannot be determined, {0} is respected", "`#files.encoding#`"),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.eol": {
      "type": "string",
      "enum": [
        "\n",
        "\r\n",
        "auto"
      ],
      "enumDescriptions": [
        nls.localize("eol.LF", "LF"),
        nls.localize("eol.CRLF", "CRLF"),
        nls.localize("eol.auto", "Uses operating system specific end of line character.")
      ],
      "default": "auto",
      "description": nls.localize("eol", "The default end of line character."),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.enableTrash": {
      "type": "boolean",
      "default": true,
      "description": nls.localize("useTrash", "Moves files/folders to the OS trash (recycle bin on Windows) when deleting. Disabling this will delete files/folders permanently.")
    },
    "files.trimTrailingWhitespace": {
      "type": "boolean",
      "default": false,
      "description": nls.localize("trimTrailingWhitespace", "When enabled, will trim trailing whitespace when saving a file."),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.trimTrailingWhitespaceInRegexAndStrings": {
      "type": "boolean",
      "default": true,
      "description": nls.localize("trimTrailingWhitespaceInRegexAndStrings", "When enabled, trailing whitespace will be removed from multiline strings and regexes on save or when executing 'editor.action.trimTrailingWhitespace'. This can cause whitespace to not be trimmed from lines when there isn't up-to-date token information."),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.insertFinalNewline": {
      "type": "boolean",
      "default": false,
      "description": nls.localize("insertFinalNewline", "When enabled, insert a final new line at the end of the file when saving it."),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.trimFinalNewlines": {
      "type": "boolean",
      "default": false,
      "description": nls.localize("trimFinalNewlines", "When enabled, will trim all new lines after the final new line at the end of the file when saving it."),
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.autoSave": {
      "type": "string",
      "enum": [AutoSaveConfiguration.OFF, AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, AutoSaveConfiguration.ON_WINDOW_CHANGE],
      "markdownEnumDescriptions": [
        nls.localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "files.autoSave.off" }, "An editor with changes is never automatically saved."),
        nls.localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "files.autoSave.afterDelay" }, "An editor with changes is automatically saved after the configured `#files.autoSaveDelay#`."),
        nls.localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "files.autoSave.onFocusChange" }, "An editor with changes is automatically saved when the editor loses focus."),
        nls.localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "files.autoSave.onWindowChange" }, "An editor with changes is automatically saved when the window loses focus.")
      ],
      "default": isWeb ? AutoSaveConfiguration.AFTER_DELAY : AutoSaveConfiguration.OFF,
      "markdownDescription": nls.localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "autoSave" }, "Controls [auto save](https://code.visualstudio.com/docs/editor/codebasics#_save-auto-save) of editors that have unsaved changes.", AutoSaveConfiguration.OFF, AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, AutoSaveConfiguration.ON_WINDOW_CHANGE, AutoSaveConfiguration.AFTER_DELAY),
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
      agentsWindow: { default: "afterDelay" }
    },
    "files.autoSaveDelay": {
      "type": "number",
      "default": 1e3,
      "minimum": 0,
      "markdownDescription": nls.localize({ comment: ["This is the description for a setting. Values surrounded by single quotes are not to be translated."], key: "autoSaveDelay" }, "Controls the delay in milliseconds after which an editor with unsaved changes is saved automatically. Only applies when `#files.autoSave#` is set to `{0}`.", AutoSaveConfiguration.AFTER_DELAY),
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.autoSaveWorkspaceFilesOnly": {
      "type": "boolean",
      "default": false,
      "markdownDescription": nls.localize("autoSaveWorkspaceFilesOnly", "When enabled, will limit [auto save](https://code.visualstudio.com/docs/editor/codebasics#_save-auto-save) of editors to files that are inside the opened workspace. Only applies when {0} is enabled.", "`#files.autoSave#`"),
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.autoSaveWhenNoErrors": {
      "type": "boolean",
      "default": false,
      "markdownDescription": nls.localize("autoSaveWhenNoErrors", "When enabled, will limit [auto save](https://code.visualstudio.com/docs/editor/codebasics#_save-auto-save) of editors to files that have no errors reported in them at the time the auto save is triggered. Only applies when {0} is enabled.", "`#files.autoSave#`"),
      scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.watcherExclude": {
      "type": "object",
      "patternProperties": {
        ".*": { "type": "boolean" }
      },
      "default": {
        // Avoiding a '**' pattern here which results in a very complex
        // RegExp that can slow things down significantly in large workspaces
        ".git/objects/**": true,
        ".git/subtree-cache/**": true,
        ".hg/store/**": true,
        "*/.git/objects/**": true,
        "*/.git/subtree-cache/**": true,
        "*/.hg/store/**": true
      },
      "markdownDescription": nls.localize("watcherExclude", "Configure paths or [glob patterns](https://aka.ms/vscode-glob-patterns) to exclude from file watching. Paths can either be relative to the watched folder or absolute. Glob patterns are matched relative from the watched folder. When you experience the file watcher process consuming a lot of CPU, make sure to exclude large folders that are of less interest (such as build output folders)."),
      "scope": ConfigurationScope.RESOURCE
    },
    "files.watcherInclude": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "default": [],
      "description": nls.localize("watcherInclude", "Configure extra paths to watch for changes inside the workspace. By default, all workspace folders will be watched recursively, except for folders that are symbolic links. You can explicitly add absolute or relative paths to support watching folders that are symbolic links. Relative paths will be resolved to an absolute path using the currently opened workspace."),
      "scope": ConfigurationScope.RESOURCE
    },
    "files.hotExit": hotExitConfiguration,
    "files.defaultLanguage": {
      "type": "string",
      "markdownDescription": nls.localize("defaultLanguage", "The default language identifier that is assigned to new files. If configured to `${activeEditorLanguage}`, will use the language identifier of the currently active text editor if any.")
    },
    [FILES_READONLY_INCLUDE_CONFIG]: {
      "type": "object",
      "patternProperties": {
        ".*": { "type": "boolean" }
      },
      "default": {},
      "markdownDescription": nls.localize("filesReadonlyInclude", "Configure paths or [glob patterns](https://aka.ms/vscode-glob-patterns) to mark as read-only. Glob patterns are always evaluated relative to the path of the workspace folder unless they are absolute paths. You can exclude matching paths via the `#files.readonlyExclude#` setting. Files from readonly file system providers will always be read-only independent of this setting."),
      "scope": ConfigurationScope.RESOURCE
    },
    [FILES_READONLY_EXCLUDE_CONFIG]: {
      "type": "object",
      "patternProperties": {
        ".*": { "type": "boolean" }
      },
      "default": {},
      "markdownDescription": nls.localize("filesReadonlyExclude", "Configure paths or [glob patterns](https://aka.ms/vscode-glob-patterns) to exclude from being marked as read-only if they match as a result of the `#files.readonlyInclude#` setting. Glob patterns are always evaluated relative to the path of the workspace folder unless they are absolute paths. Files from readonly file system providers will always be read-only independent of this setting."),
      "scope": ConfigurationScope.RESOURCE
    },
    [FILES_READONLY_FROM_PERMISSIONS_CONFIG]: {
      "type": "boolean",
      "markdownDescription": nls.localize("filesReadonlyFromPermissions", "Marks files as read-only when their file permissions indicate as such. This can be overridden via `#files.readonlyInclude#` and `#files.readonlyExclude#` settings."),
      "default": false
    },
    "files.restoreUndoStack": {
      "type": "boolean",
      "description": nls.localize("files.restoreUndoStack", "Restore the undo stack when a file is reopened."),
      "default": true
    },
    "files.saveConflictResolution": {
      "type": "string",
      "enum": [
        "askUser",
        "overwriteFileOnDisk"
      ],
      "enumDescriptions": [
        nls.localize("askUser", "Will refuse to save and ask for resolving the save conflict manually."),
        nls.localize("overwriteFileOnDisk", "Will resolve the save conflict by overwriting the file on disk with the changes in the editor.")
      ],
      "description": nls.localize("files.saveConflictResolution", "A save conflict can occur when a file is saved to disk that was changed by another program in the meantime. To prevent data loss, the user is asked to compare the changes in the editor with the version on disk. This setting should only be changed if you frequently encounter save conflict errors and may result in data loss if used without caution."),
      "default": "askUser",
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "files.dialog.defaultPath": {
      "type": "string",
      "pattern": "^((\\/|\\\\\\\\|[a-zA-Z]:\\\\).*)?$",
      // slash OR UNC-root OR drive-root OR undefined
      "patternErrorMessage": nls.localize("defaultPathErrorMessage", "Default path for file dialogs must be an absolute path (e.g. C:\\\\myFolder or /myFolder)."),
      "description": nls.localize("fileDialogDefaultPath", "Default path for file dialogs, overriding user's home path. Only used in the absence of a context-specific path, such as most recently opened file or folder."),
      "scope": ConfigurationScope.MACHINE
    },
    "files.simpleDialog.enable": {
      "type": "boolean",
      "description": nls.localize("files.simpleDialog.enable", "Enables the simple file dialog for opening and saving files and folders. The simple file dialog replaces the system file dialog when enabled."),
      "default": false
    },
    "files.participants.timeout": {
      type: "number",
      default: 6e4,
      markdownDescription: nls.localize("files.participants.timeout", "Timeout in milliseconds after which file participants for create, rename, and delete are cancelled. Use `0` to disable participants.")
    }
  }
});
configurationRegistry.registerConfiguration({
  ...editorConfigurationBaseNode,
  properties: {
    "editor.formatOnSave": {
      "type": "boolean",
      "markdownDescription": nls.localize("formatOnSave", "Format a file on save. A formatter must be available and the editor must not be shutting down. When {0} is set to `afterDelay`, the file will only be formatted when saved explicitly.", "`#files.autoSave#`"),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    },
    "editor.formatOnSaveMode": {
      "type": "string",
      "default": "file",
      "enum": [
        "file",
        "modifications",
        "modificationsIfAvailable"
      ],
      "enumDescriptions": [
        nls.localize({ key: "everything", comment: ["This is the description of an option"] }, "Format the whole file."),
        nls.localize({ key: "modification", comment: ["This is the description of an option"] }, "Format modifications. Requires source control and a formatter that supports 'Format Selection'."),
        nls.localize({ key: "modificationIfAvailable", comment: ["This is the description of an option"] }, "Will attempt to format modifications only (requires source control and a formatter that supports 'Format Selection'). If source control can't be used, then the whole file will be formatted.")
      ],
      "markdownDescription": nls.localize("formatOnSaveMode", "Controls if format on save formats the whole file or only modifications. Only applies when `#editor.formatOnSave#` is enabled."),
      "scope": ConfigurationScope.LANGUAGE_OVERRIDABLE
    }
  }
});
configurationRegistry.registerConfiguration({
  "id": "explorer",
  "order": 10,
  "title": nls.localize("explorerConfigurationTitle", "File Explorer"),
  "type": "object",
  "properties": {
    "explorer.openEditors.visible": {
      "type": "number",
      "description": nls.localize({ key: "openEditorsVisible", comment: ["Open is an adjective"] }, "The initial maximum number of editors shown in the Open Editors pane. Exceeding this limit will show a scroll bar and allow resizing the pane to display more items."),
      "default": 9,
      "minimum": 1
    },
    "explorer.openEditors.minVisible": {
      "type": "number",
      "description": nls.localize({ key: "openEditorsVisibleMin", comment: ["Open is an adjective"] }, "The minimum number of editor slots pre-allocated in the Open Editors pane. If set to 0 the Open Editors pane will dynamically resize based on the number of editors."),
      "default": 0,
      "minimum": 0
    },
    "explorer.openEditors.sortOrder": {
      "type": "string",
      "enum": ["editorOrder", "alphabetical", "fullPath"],
      "description": nls.localize({ key: "openEditorsSortOrder", comment: ["Open is an adjective"] }, "Controls the sorting order of editors in the Open Editors pane."),
      "enumDescriptions": [
        nls.localize("sortOrder.editorOrder", "Editors are ordered in the same order editor tabs are shown."),
        nls.localize("sortOrder.alphabetical", "Editors are ordered alphabetically by tab name inside each editor group."),
        nls.localize("sortOrder.fullPath", "Editors are ordered alphabetically by full path inside each editor group.")
      ],
      "default": "editorOrder"
    },
    "explorer.autoReveal": {
      "type": ["boolean", "string"],
      "enum": [true, false, "focusNoScroll"],
      "default": true,
      "enumDescriptions": [
        nls.localize("autoReveal.on", "Files will be revealed and selected."),
        nls.localize("autoReveal.off", "Files will not be revealed and selected."),
        nls.localize("autoReveal.focusNoScroll", "Files will not be scrolled into view, but will still be focused.")
      ],
      "description": nls.localize("autoReveal", "Controls whether the Explorer should automatically reveal and select files when opening them.")
    },
    "explorer.autoRevealExclude": {
      "type": "object",
      "markdownDescription": nls.localize("autoRevealExclude", "Configure paths or [glob patterns](https://aka.ms/vscode-glob-patterns) for excluding files and folders from being revealed and selected in the Explorer when they are opened. Glob patterns are always evaluated relative to the path of the workspace folder unless they are absolute paths."),
      "default": { "**/node_modules": true, "**/bower_components": true },
      "additionalProperties": {
        "anyOf": [
          {
            "type": "boolean",
            "description": nls.localize("explorer.autoRevealExclude.boolean", "The glob pattern to match file paths against. Set to true or false to enable or disable the pattern.")
          },
          {
            type: "object",
            properties: {
              when: {
                type: "string",
                // expression ({ "**/*.js": { "when": "$(basename).js" } })
                pattern: "\\w*\\$\\(basename\\)\\w*",
                default: "$(basename).ext",
                description: nls.localize("explorer.autoRevealExclude.when", "Additional check on the siblings of a matching file. Use {0} as variable for the matching file name.", "$(basename)")
              }
            }
          }
        ]
      }
    },
    "explorer.enableDragAndDrop": {
      "type": "boolean",
      "description": nls.localize("enableDragAndDrop", "Controls whether the Explorer should allow to move files and folders via drag and drop. This setting only effects drag and drop from inside the Explorer."),
      "default": true
    },
    "explorer.confirmDragAndDrop": {
      "type": "boolean",
      "description": nls.localize("confirmDragAndDrop", "Controls whether the Explorer should ask for confirmation to move files and folders via drag and drop."),
      "default": true
    },
    "explorer.confirmPasteNative": {
      "type": "boolean",
      "description": nls.localize("confirmPasteNative", "Controls whether the Explorer should ask for confirmation when pasting native files and folders."),
      "default": true
    },
    "explorer.confirmDelete": {
      "type": "boolean",
      "description": nls.localize("confirmDelete", "Controls whether the Explorer should ask for confirmation when deleting files and folders."),
      "default": true
    },
    "explorer.enableUndo": {
      "type": "boolean",
      "description": nls.localize("enableUndo", "Controls whether the Explorer should support undoing file and folder operations."),
      "default": true
    },
    "explorer.confirmUndo": {
      "type": "string",
      "enum": [UndoConfirmLevel.Verbose, UndoConfirmLevel.Default, UndoConfirmLevel.Light],
      "description": nls.localize("confirmUndo", "Controls whether the Explorer should ask for confirmation when undoing."),
      "default": UndoConfirmLevel.Default,
      "enumDescriptions": [
        nls.localize("enableUndo.verbose", "Explorer will prompt before all undo operations."),
        nls.localize("enableUndo.default", "Explorer will prompt before destructive undo operations."),
        nls.localize("enableUndo.light", "Explorer will not prompt before undo operations when focused.")
      ]
    },
    "explorer.expandSingleFolderWorkspaces": {
      "type": "boolean",
      "description": nls.localize("expandSingleFolderWorkspaces", "Controls whether the Explorer should expand multi-root workspaces containing only one folder during initialization"),
      "default": true
    },
    "explorer.sortOrder": {
      "type": "string",
      "enum": [SortOrder.Default, SortOrder.Mixed, SortOrder.FilesFirst, SortOrder.Type, SortOrder.Modified, SortOrder.FoldersNestsFiles],
      "default": SortOrder.Default,
      "enumDescriptions": [
        nls.localize("sortOrder.default", "Files and folders are sorted by their names. Folders are displayed before files."),
        nls.localize("sortOrder.mixed", "Files and folders are sorted by their names. Files are interwoven with folders."),
        nls.localize("sortOrder.filesFirst", "Files and folders are sorted by their names. Files are displayed before folders."),
        nls.localize("sortOrder.type", "Files and folders are grouped by extension type then sorted by their names. Folders are displayed before files."),
        nls.localize("sortOrder.modified", "Files and folders are sorted by last modified date in descending order. Folders are displayed before files."),
        nls.localize("sortOrder.foldersNestsFiles", "Files and folders are sorted by their names. Folders are displayed before files. Files with nested children are displayed before other files.")
      ],
      "markdownDescription": nls.localize("sortOrder", "Controls the property-based sorting of files and folders in the Explorer. When `#explorer.fileNesting.enabled#` is enabled, also controls sorting of nested files.")
    },
    "explorer.sortOrderLexicographicOptions": {
      "type": "string",
      "enum": [LexicographicOptions.Default, LexicographicOptions.Upper, LexicographicOptions.Lower, LexicographicOptions.Unicode],
      "default": LexicographicOptions.Default,
      "enumDescriptions": [
        nls.localize("sortOrderLexicographicOptions.default", "Uppercase and lowercase names are mixed together."),
        nls.localize("sortOrderLexicographicOptions.upper", "Uppercase names are grouped together before lowercase names."),
        nls.localize("sortOrderLexicographicOptions.lower", "Lowercase names are grouped together before uppercase names."),
        nls.localize("sortOrderLexicographicOptions.unicode", "Names are sorted in Unicode order.")
      ],
      "description": nls.localize("sortOrderLexicographicOptions", "Controls the lexicographic sorting of file and folder names in the Explorer.")
    },
    "explorer.sortOrderReverse": {
      "type": "boolean",
      "description": nls.localize("sortOrderReverse", "Controls whether the file and folder sort order, should be reversed."),
      "default": false
    },
    "explorer.decorations.colors": {
      type: "boolean",
      description: nls.localize("explorer.decorations.colors", "Controls whether file decorations should use colors."),
      default: true
    },
    "explorer.decorations.badges": {
      type: "boolean",
      description: nls.localize("explorer.decorations.badges", "Controls whether file decorations should use badges."),
      default: true
    },
    "explorer.incrementalNaming": {
      "type": "string",
      enum: ["simple", "smart", "disabled"],
      enumDescriptions: [
        nls.localize("simple", 'Appends the word "copy" at the end of the duplicated name potentially followed by a number.'),
        nls.localize("smart", "Adds a number at the end of the duplicated name. If some number is already part of the name, tries to increase that number."),
        nls.localize("disabled", "Disables incremental naming. If two files with the same name exist you will be prompted to overwrite the existing file.")
      ],
      description: nls.localize("explorer.incrementalNaming", "Controls which naming strategy to use when giving a new name to a duplicated Explorer item on paste."),
      default: "simple"
    },
    "explorer.autoOpenDroppedFile": {
      "type": "boolean",
      "description": nls.localize("autoOpenDroppedFile", "Controls whether the Explorer should automatically open a file when it is dropped into the explorer"),
      "default": true
    },
    "explorer.compactFolders": {
      "type": "boolean",
      "description": nls.localize("compressSingleChildFolders", "Controls whether the Explorer should render folders in a compact form. In such a form, single child folders will be compressed in a combined tree element. Useful for Java package structures, for example."),
      "default": true
    },
    "explorer.copyRelativePathSeparator": {
      "type": "string",
      "enum": [
        "/",
        "\\",
        "auto"
      ],
      "enumDescriptions": [
        nls.localize("copyRelativePathSeparator.slash", "Use slash as path separation character."),
        nls.localize("copyRelativePathSeparator.backslash", "Use backslash as path separation character."),
        nls.localize("copyRelativePathSeparator.auto", "Uses operating system specific path separation character.")
      ],
      "description": nls.localize("copyRelativePathSeparator", "The path separation character used when copying relative file paths."),
      "default": "auto"
    },
    "explorer.copyPathSeparator": {
      "type": "string",
      "enum": [
        "/",
        "\\",
        "auto"
      ],
      "enumDescriptions": [
        nls.localize("copyPathSeparator.slash", "Use slash as path separation character."),
        nls.localize("copyPathSeparator.backslash", "Use backslash as path separation character."),
        nls.localize("copyPathSeparator.auto", "Uses operating system specific path separation character.")
      ],
      "description": nls.localize("copyPathSeparator", "The path separation character used when copying file paths."),
      "default": "auto"
    },
    "explorer.excludeGitIgnore": {
      type: "boolean",
      markdownDescription: nls.localize("excludeGitignore", "Controls whether entries in .gitignore should be parsed and excluded from the Explorer. Similar to {0}.", "`#files.exclude#`"),
      default: false,
      scope: ConfigurationScope.RESOURCE
    },
    "explorer.fileNesting.enabled": {
      "type": "boolean",
      scope: ConfigurationScope.RESOURCE,
      "markdownDescription": nls.localize("fileNestingEnabled", "Controls whether file nesting is enabled in the Explorer. File nesting allows for related files in a directory to be visually grouped together under a single parent file."),
      "default": false
    },
    "explorer.fileNesting.expand": {
      "type": "boolean",
      "markdownDescription": nls.localize("fileNestingExpand", "Controls whether file nests are automatically expanded. {0} must be set for this to take effect.", "`#explorer.fileNesting.enabled#`"),
      "default": true
    },
    "explorer.fileNesting.patterns": {
      "type": "object",
      scope: ConfigurationScope.RESOURCE,
      "markdownDescription": nls.localize("fileNestingPatterns", "Controls nesting of files in the Explorer. {0} must be set for this to take effect. Each __Item__ represents a parent pattern and may contain a single `*` character that matches any string. Each __Value__ represents a comma separated list of the child patterns that should be shown nested under a given parent. Child patterns may contain several special tokens:\n- `${capture}`: Matches the resolved value of the `*` from the parent pattern\n- `${basename}`: Matches the parent file's basename, the `file` in `file.ts`\n- `${extname}`: Matches the parent file's extension, the `ts` in `file.ts`\n- `${dirname}`: Matches the parent file's directory name, the `src` in `src/file.ts`\n- `*`:  Matches any string, may only be used once per child pattern", "`#explorer.fileNesting.enabled#`"),
      patternProperties: {
        "^[^*]*\\*?[^*]*$": {
          markdownDescription: nls.localize("fileNesting.description", "Each key pattern may contain a single `*` character which will match any string."),
          type: "string",
          pattern: "^([^,*]*\\*?[^,*]*)(, ?[^,*]*\\*?[^,*]*)*$"
        }
      },
      additionalProperties: false,
      "default": {
        "*.ts": "${capture}.js",
        "*.js": "${capture}.js.map, ${capture}.min.js, ${capture}.d.ts",
        "*.jsx": "${capture}.js",
        "*.tsx": "${capture}.ts",
        "tsconfig.json": "tsconfig.*.json",
        "package.json": "package-lock.json, yarn.lock, pnpm-lock.yaml, bun.lockb, bun.lock"
      }
    }
  }
});
UndoCommand.addImplementation(110, "explorer", (accessor) => {
  const undoRedoService = accessor.get(IUndoRedoService);
  const explorerService = accessor.get(IExplorerService);
  const configurationService = accessor.get(IConfigurationService);
  const explorerCanUndo = configurationService.getValue().explorer.enableUndo;
  if (explorerService.hasViewFocus() && undoRedoService.canUndo(UNDO_REDO_SOURCE) && explorerCanUndo) {
    undoRedoService.undo(UNDO_REDO_SOURCE);
    return true;
  }
  return false;
});
RedoCommand.addImplementation(110, "explorer", (accessor) => {
  const undoRedoService = accessor.get(IUndoRedoService);
  const explorerService = accessor.get(IExplorerService);
  const configurationService = accessor.get(IConfigurationService);
  const explorerCanUndo = configurationService.getValue().explorer.enableUndo;
  if (explorerService.hasViewFocus() && undoRedoService.canRedo(UNDO_REDO_SOURCE) && explorerCanUndo) {
    undoRedoService.redo(UNDO_REDO_SOURCE);
    return true;
  }
  return false;
});
ModesRegistry.registerLanguage({
  id: BINARY_TEXT_FILE_MODE,
  aliases: ["Binary"],
  mimetypes: ["text/x-code-binary"]
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2ZpbGVzL2Jyb3dzZXIvZmlsZXMuY29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBzZXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIENvbmZpZ3VyYXRpb25TY29wZSwgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZSwgcmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSUZpbGVFZGl0b3JJbnB1dCwgSUVkaXRvckZhY3RvcnlSZWdpc3RyeSwgRWRpdG9yRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgQXV0b1NhdmVDb25maWd1cmF0aW9uLCBIb3RFeGl0Q29uZmlndXJhdGlvbiwgRklMRVNfRVhDTFVERV9DT05GSUcsIEZJTEVTX0FTU09DSUFUSU9OU19DT05GSUcsIEZJTEVTX1JFQURPTkxZX0lOQ0xVREVfQ09ORklHLCBGSUxFU19SRUFET05MWV9FWENMVURFX0NPTkZJRywgRklMRVNfUkVBRE9OTFlfRlJPTV9QRVJNSVNTSU9OU19DT05GSUcgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgU29ydE9yZGVyLCBMZXhpY29ncmFwaGljT3B0aW9ucywgRklMRV9FRElUT1JfSU5QVVRfSUQsIEJJTkFSWV9URVhUX0ZJTEVfTU9ERSwgVW5kb0NvbmZpcm1MZXZlbCwgSUZpbGVzQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBUZXh0RmlsZUVkaXRvclRyYWNrZXIgfSBmcm9tICcuL2VkaXRvcnMvdGV4dEZpbGVFZGl0b3JUcmFja2VyLmpzJztcbmltcG9ydCB7IFRleHRGaWxlU2F2ZUVycm9ySGFuZGxlciB9IGZyb20gJy4vZWRpdG9ycy90ZXh0RmlsZVNhdmVFcnJvckhhbmRsZXIuanMnO1xuaW1wb3J0IHsgRmlsZUVkaXRvcklucHV0IH0gZnJvbSAnLi9lZGl0b3JzL2ZpbGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBCaW5hcnlGaWxlRWRpdG9yIH0gZnJvbSAnLi9lZGl0b3JzL2JpbmFyeUZpbGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBpc05hdGl2ZSwgaXNXZWIsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEV4cGxvcmVyVmlld2xldFZpZXdzQ29udHJpYnV0aW9uIH0gZnJvbSAnLi9leHBsb3JlclZpZXdsZXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvclBhbmVSZWdpc3RyeSwgRWRpdG9yUGFuZURlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXhwbG9yZXJTZXJ2aWNlLCBVTkRPX1JFRE9fU09VUkNFIH0gZnJvbSAnLi9leHBsb3JlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR1VFU1NBQkxFX0VOQ09ESU5HUywgU1VQUE9SVEVEX0VOQ09ESU5HUyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi9lbmNvZGluZy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBXb3Jrc3BhY2VXYXRjaGVyIH0gZnJvbSAnLi93b3Jrc3BhY2VXYXRjaGVyLmpzJztcbmltcG9ydCB7IGVkaXRvckNvbmZpZ3VyYXRpb25CYXNlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgRGlydHlGaWxlc0luZGljYXRvciB9IGZyb20gJy4uL2NvbW1vbi9kaXJ0eUZpbGVzSW5kaWNhdG9yLmpzJztcbmltcG9ydCB7IFVuZG9Db21tYW5kLCBSZWRvQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVVuZG9SZWRvU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VuZG9SZWRvL2NvbW1vbi91bmRvUmVkby5qcyc7XG5pbXBvcnQgeyBJRXhwbG9yZXJTZXJ2aWNlIH0gZnJvbSAnLi9maWxlcy5qcyc7XG5pbXBvcnQgeyBGaWxlRWRpdG9ySW5wdXRTZXJpYWxpemVyLCBGaWxlRWRpdG9yV29ya2luZ0NvcHlFZGl0b3JIYW5kbGVyIH0gZnJvbSAnLi9lZGl0b3JzL2ZpbGVFZGl0b3JIYW5kbGVyLmpzJztcbmltcG9ydCB7IE1vZGVzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9tb2Rlc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGV4dEZpbGVFZGl0b3IgfSBmcm9tICcuL2VkaXRvcnMvdGV4dEZpbGVFZGl0b3IuanMnO1xuXG5jbGFzcyBGaWxlVXJpTGFiZWxDb250cmlidXRpb24gaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuZmlsZVVyaUxhYmVsJztcblxuXHRjb25zdHJ1Y3RvcihASUxhYmVsU2VydmljZSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UpIHtcblx0XHRsYWJlbFNlcnZpY2UucmVnaXN0ZXJGb3JtYXR0ZXIoe1xuXHRcdFx0c2NoZW1lOiBTY2hlbWFzLmZpbGUsXG5cdFx0XHRmb3JtYXR0aW5nOiB7XG5cdFx0XHRcdGxhYmVsOiAnJHthdXRob3JpdHl9JHtwYXRofScsXG5cdFx0XHRcdHNlcGFyYXRvcjogc2VwLFxuXHRcdFx0XHR0aWxkaWZ5OiAhaXNXaW5kb3dzLFxuXHRcdFx0XHRub3JtYWxpemVEcml2ZUxldHRlcjogaXNXaW5kb3dzLFxuXHRcdFx0XHRhdXRob3JpdHlQcmVmaXg6IHNlcCArIHNlcCxcblx0XHRcdFx0d29ya3NwYWNlU3VmZml4OiAnJ1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElFeHBsb3JlclNlcnZpY2UsIEV4cGxvcmVyU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5cbi8vIFJlZ2lzdGVyIGZpbGUgZWRpdG9yc1xuXG5SZWdpc3RyeS5hczxJRWRpdG9yUGFuZVJlZ2lzdHJ5PihFZGl0b3JFeHRlbnNpb25zLkVkaXRvclBhbmUpLnJlZ2lzdGVyRWRpdG9yUGFuZShcblx0RWRpdG9yUGFuZURlc2NyaXB0b3IuY3JlYXRlKFxuXHRcdFRleHRGaWxlRWRpdG9yLFxuXHRcdFRleHRGaWxlRWRpdG9yLklELFxuXHRcdG5scy5sb2NhbGl6ZSgndGV4dEZpbGVFZGl0b3InLCBcIlRleHQgRmlsZSBFZGl0b3JcIilcblx0KSxcblx0W1xuXHRcdG5ldyBTeW5jRGVzY3JpcHRvcihGaWxlRWRpdG9ySW5wdXQpXG5cdF1cbik7XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0QmluYXJ5RmlsZUVkaXRvcixcblx0XHRCaW5hcnlGaWxlRWRpdG9yLklELFxuXHRcdG5scy5sb2NhbGl6ZSgnYmluYXJ5RmlsZUVkaXRvcicsIFwiQmluYXJ5IEZpbGUgRWRpdG9yXCIpXG5cdCksXG5cdFtcblx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoRmlsZUVkaXRvcklucHV0KVxuXHRdXG4pO1xuXG4vLyBSZWdpc3RlciBkZWZhdWx0IGZpbGUgaW5wdXQgZmFjdG9yeVxuUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KS5yZWdpc3RlckZpbGVFZGl0b3JGYWN0b3J5KHtcblxuXHR0eXBlSWQ6IEZJTEVfRURJVE9SX0lOUFVUX0lELFxuXG5cdGNyZWF0ZUZpbGVFZGl0b3I6IChyZXNvdXJjZSwgcHJlZmVycmVkUmVzb3VyY2UsIHByZWZlcnJlZE5hbWUsIHByZWZlcnJlZERlc2NyaXB0aW9uLCBwcmVmZXJyZWRFbmNvZGluZywgcHJlZmVycmVkTGFuZ3VhZ2VJZCwgcHJlZmVycmVkQ29udGVudHMsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTogSUZpbGVFZGl0b3JJbnB1dCA9PiB7XG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZpbGVFZGl0b3JJbnB1dCwgcmVzb3VyY2UsIHByZWZlcnJlZFJlc291cmNlLCBwcmVmZXJyZWROYW1lLCBwcmVmZXJyZWREZXNjcmlwdGlvbiwgcHJlZmVycmVkRW5jb2RpbmcsIHByZWZlcnJlZExhbmd1YWdlSWQsIHByZWZlcnJlZENvbnRlbnRzKTtcblx0fSxcblxuXHRpc0ZpbGVFZGl0b3I6IChvYmopOiBvYmogaXMgSUZpbGVFZGl0b3JJbnB1dCA9PiB7XG5cdFx0cmV0dXJuIG9iaiBpbnN0YW5jZW9mIEZpbGVFZGl0b3JJbnB1dDtcblx0fVxufSk7XG5cbi8vIFJlZ2lzdGVyIEVkaXRvciBJbnB1dCBTZXJpYWxpemVyICYgSGFuZGxlclxuUmVnaXN0cnkuYXM8SUVkaXRvckZhY3RvcnlSZWdpc3RyeT4oRWRpdG9yRXh0ZW5zaW9ucy5FZGl0b3JGYWN0b3J5KS5yZWdpc3RlckVkaXRvclNlcmlhbGl6ZXIoRklMRV9FRElUT1JfSU5QVVRfSUQsIEZpbGVFZGl0b3JJbnB1dFNlcmlhbGl6ZXIpO1xucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKEZpbGVFZGl0b3JXb3JraW5nQ29weUVkaXRvckhhbmRsZXIuSUQsIEZpbGVFZGl0b3JXb3JraW5nQ29weUVkaXRvckhhbmRsZXIsIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5cbi8vIFJlZ2lzdGVyIEV4cGxvcmVyIHZpZXdzXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoRXhwbG9yZXJWaWV3bGV0Vmlld3NDb250cmlidXRpb24uSUQsIEV4cGxvcmVyVmlld2xldFZpZXdzQ29udHJpYnV0aW9uLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xuXG4vLyBSZWdpc3RlciBUZXh0IEZpbGUgRWRpdG9yIFRyYWNrZXJcbnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMihUZXh0RmlsZUVkaXRvclRyYWNrZXIuSUQsIFRleHRGaWxlRWRpdG9yVHJhY2tlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tTdGFydHVwKTtcblxuLy8gUmVnaXN0ZXIgVGV4dCBGaWxlIFNhdmUgRXJyb3IgSGFuZGxlclxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFRleHRGaWxlU2F2ZUVycm9ySGFuZGxlci5JRCwgVGV4dEZpbGVTYXZlRXJyb3JIYW5kbGVyLCBXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXApO1xuXG4vLyBSZWdpc3RlciB1cmkgZGlzcGxheSBmb3IgZmlsZSB1cmlzXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoRmlsZVVyaUxhYmVsQ29udHJpYnV0aW9uLklELCBGaWxlVXJpTGFiZWxDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5cbi8vIFJlZ2lzdGVyIFdvcmtzcGFjZSBXYXRjaGVyXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoV29ya3NwYWNlV2F0Y2hlci5JRCwgV29ya3NwYWNlV2F0Y2hlciwgV29ya2JlbmNoUGhhc2UuQWZ0ZXJSZXN0b3JlZCk7XG5cbi8vIFJlZ2lzdGVyIERpcnR5IEZpbGVzIEluZGljYXRvclxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKERpcnR5RmlsZXNJbmRpY2F0b3IuSUQsIERpcnR5RmlsZXNJbmRpY2F0b3IsIFdvcmtiZW5jaFBoYXNlLkJsb2NrU3RhcnR1cCk7XG5cbi8vIENvbmZpZ3VyYXRpb25cbmNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXG5jb25zdCBob3RFeGl0Q29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSA9IGlzTmF0aXZlID9cblx0e1xuXHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdCdlbnVtJzogW0hvdEV4aXRDb25maWd1cmF0aW9uLk9GRiwgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVCwgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFXSxcblx0XHQnZGVmYXVsdCc6IEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsXG5cdFx0J21hcmtkb3duRW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdG5scy5sb2NhbGl6ZSgnaG90RXhpdC5vZmYnLCAnRGlzYWJsZSBob3QgZXhpdC4gQSBwcm9tcHQgd2lsbCBzaG93IHdoZW4gYXR0ZW1wdGluZyB0byBjbG9zZSBhIHdpbmRvdyB3aXRoIGVkaXRvcnMgdGhhdCBoYXZlIHVuc2F2ZWQgY2hhbmdlcy4nKSxcblx0XHRcdG5scy5sb2NhbGl6ZSgnaG90RXhpdC5vbkV4aXQnLCAnSG90IGV4aXQgd2lsbCBiZSB0cmlnZ2VyZWQgd2hlbiB0aGUgbGFzdCB3aW5kb3cgaXMgY2xvc2VkIG9uIFdpbmRvd3MvTGludXggb3Igd2hlbiB0aGUgYHdvcmtiZW5jaC5hY3Rpb24ucXVpdGAgY29tbWFuZCBpcyB0cmlnZ2VyZWQgKGNvbW1hbmQgcGFsZXR0ZSwga2V5YmluZGluZywgbWVudSkuIEFsbCB3aW5kb3dzIHdpdGhvdXQgZm9sZGVycyBvcGVuZWQgd2lsbCBiZSByZXN0b3JlZCB1cG9uIG5leHQgbGF1bmNoLiBBIGxpc3Qgb2YgcHJldmlvdXNseSBvcGVuZWQgd2luZG93cyB3aXRoIHVuc2F2ZWQgZmlsZXMgY2FuIGJlIGFjY2Vzc2VkIHZpYSBgRmlsZSA+IE9wZW4gUmVjZW50ID4gTW9yZS4uLmAnKSxcblx0XHRcdG5scy5sb2NhbGl6ZSgnaG90RXhpdC5vbkV4aXRBbmRXaW5kb3dDbG9zZScsICdIb3QgZXhpdCB3aWxsIGJlIHRyaWdnZXJlZCB3aGVuIHRoZSBsYXN0IHdpbmRvdyBpcyBjbG9zZWQgb24gV2luZG93cy9MaW51eCBvciB3aGVuIHRoZSBgd29ya2JlbmNoLmFjdGlvbi5xdWl0YCBjb21tYW5kIGlzIHRyaWdnZXJlZCAoY29tbWFuZCBwYWxldHRlLCBrZXliaW5kaW5nLCBtZW51KSwgYW5kIGFsc28gZm9yIGFueSB3aW5kb3cgd2l0aCBhIGZvbGRlciBvcGVuZWQgcmVnYXJkbGVzcyBvZiB3aGV0aGVyIGl0XFwncyB0aGUgbGFzdCB3aW5kb3cuIEFsbCB3aW5kb3dzIHdpdGhvdXQgZm9sZGVycyBvcGVuZWQgd2lsbCBiZSByZXN0b3JlZCB1cG9uIG5leHQgbGF1bmNoLiBBIGxpc3Qgb2YgcHJldmlvdXNseSBvcGVuZWQgd2luZG93cyB3aXRoIHVuc2F2ZWQgZmlsZXMgY2FuIGJlIGFjY2Vzc2VkIHZpYSBgRmlsZSA+IE9wZW4gUmVjZW50ID4gTW9yZS4uLmAnKVxuXHRcdF0sXG5cdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2hvdEV4aXQnLCBcIltIb3QgRXhpdF0oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLWhvdC1leGl0KSBjb250cm9scyB3aGV0aGVyIHVuc2F2ZWQgZmlsZXMgYXJlIHJlbWVtYmVyZWQgYmV0d2VlbiBzZXNzaW9ucywgYWxsb3dpbmcgdGhlIHNhdmUgcHJvbXB0IHdoZW4gZXhpdGluZyB0aGUgZWRpdG9yIHRvIGJlIHNraXBwZWQuXCIsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVQsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSlcblx0fSA6IHtcblx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdCdzY29wZSc6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHQnZW51bSc6IFtIb3RFeGl0Q29uZmlndXJhdGlvbi5PRkYsIEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRV0sXG5cdFx0J2RlZmF1bHQnOiBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElUX0FORF9XSU5ET1dfQ0xPU0UsXG5cdFx0J21hcmtkb3duRW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdG5scy5sb2NhbGl6ZSgnaG90RXhpdC5vZmYnLCAnRGlzYWJsZSBob3QgZXhpdC4gQSBwcm9tcHQgd2lsbCBzaG93IHdoZW4gYXR0ZW1wdGluZyB0byBjbG9zZSBhIHdpbmRvdyB3aXRoIGVkaXRvcnMgdGhhdCBoYXZlIHVuc2F2ZWQgY2hhbmdlcy4nKSxcblx0XHRcdG5scy5sb2NhbGl6ZSgnaG90RXhpdC5vbkV4aXRBbmRXaW5kb3dDbG9zZUJyb3dzZXInLCAnSG90IGV4aXQgd2lsbCBiZSB0cmlnZ2VyZWQgd2hlbiB0aGUgYnJvd3NlciBxdWl0cyBvciB0aGUgd2luZG93IG9yIHRhYiBpcyBjbG9zZWQuJylcblx0XHRdLFxuXHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdob3RFeGl0JywgXCJbSG90IEV4aXRdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1ob3QtZXhpdCkgY29udHJvbHMgd2hldGhlciB1bnNhdmVkIGZpbGVzIGFyZSByZW1lbWJlcmVkIGJldHdlZW4gc2Vzc2lvbnMsIGFsbG93aW5nIHRoZSBzYXZlIHByb21wdCB3aGVuIGV4aXRpbmcgdGhlIGVkaXRvciB0byBiZSBza2lwcGVkLlwiLCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElULCBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElUX0FORF9XSU5ET1dfQ0xPU0UpXG5cdH07XG5cbmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHQnaWQnOiAnZmlsZXMnLFxuXHQnb3JkZXInOiA5LFxuXHQndGl0bGUnOiBubHMubG9jYWxpemUoJ2ZpbGVzQ29uZmlndXJhdGlvblRpdGxlJywgXCJGaWxlc1wiKSxcblx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0W0ZJTEVTX0VYQ0xVREVfQ09ORklHXToge1xuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdleGNsdWRlJywgXCJDb25maWd1cmUgW2dsb2IgcGF0dGVybnNdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1nbG9iLXBhdHRlcm5zKSBmb3IgZXhjbHVkaW5nIGZpbGVzIGFuZCBmb2xkZXJzLiBGb3IgZXhhbXBsZSwgdGhlIEZpbGUgRXhwbG9yZXIgZGVjaWRlcyB3aGljaCBmaWxlcyBhbmQgZm9sZGVycyB0byBzaG93IG9yIGhpZGUgYmFzZWQgb24gdGhpcyBzZXR0aW5nLiBSZWZlciB0byB0aGUgYCNzZWFyY2guZXhjbHVkZSNgIHNldHRpbmcgdG8gZGVmaW5lIHNlYXJjaC1zcGVjaWZpYyBleGNsdWRlcy4gUmVmZXIgdG8gdGhlIGAjZXhwbG9yZXIuZXhjbHVkZUdpdElnbm9yZSNgIHNldHRpbmcgZm9yIGlnbm9yaW5nIGZpbGVzIGJhc2VkIG9uIHlvdXIgYC5naXRpZ25vcmVgLlwiKSxcblx0XHRcdCdkZWZhdWx0Jzoge1xuXHRcdFx0XHQuLi57ICcqKi8uZ2l0JzogdHJ1ZSwgJyoqLy5zdm4nOiB0cnVlLCAnKiovLmhnJzogdHJ1ZSwgJyoqLy5EU19TdG9yZSc6IHRydWUsICcqKi9UaHVtYnMuZGInOiB0cnVlIH0sXG5cdFx0XHRcdC4uLihpc1dlYiA/IHsgJyoqLyouY3Jzd2FwJzogdHJ1ZSAvKiBmaWx0ZXIgb3V0IHN3YXAgZmlsZXMgdXNlZCBmb3IgbG9jYWwgZmlsZSBhY2Nlc3MgKi8gfSA6IHVuZGVmaW5lZClcblx0XHRcdH0sXG5cdFx0XHQnc2NvcGUnOiBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0UsXG5cdFx0XHQnYWRkaXRpb25hbFByb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdhbnlPZic6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdCdlbnVtJzogW3RydWUsIGZhbHNlXSxcblx0XHRcdFx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogW25scy5sb2NhbGl6ZSgndHJ1ZURlc2NyaXB0aW9uJywgXCJFbmFibGUgdGhlIHBhdHRlcm4uXCIpLCBubHMubG9jYWxpemUoJ2ZhbHNlRGVzY3JpcHRpb24nLCBcIkRpc2FibGUgdGhlIHBhdHRlcm4uXCIpXSxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnZmlsZXMuZXhjbHVkZS5ib29sZWFuJywgXCJUaGUgZ2xvYiBwYXR0ZXJuIHRvIG1hdGNoIGZpbGUgcGF0aHMgYWdhaW5zdC4gU2V0IHRvIHRydWUgb3IgZmFsc2UgdG8gZW5hYmxlIG9yIGRpc2FibGUgdGhlIHBhdHRlcm4uXCIpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHRcdFx0XHQnd2hlbic6IHtcblx0XHRcdFx0XHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLCAvLyBleHByZXNzaW9uICh7IFwiKiovKi5qc1wiOiB7IFwid2hlblwiOiBcIiQoYmFzZW5hbWUpLmpzXCIgfSB9KVxuXHRcdFx0XHRcdFx0XHRcdCdwYXR0ZXJuJzogJ1xcXFx3KlxcXFwkXFxcXChiYXNlbmFtZVxcXFwpXFxcXHcqJyxcblx0XHRcdFx0XHRcdFx0XHQnZGVmYXVsdCc6ICckKGJhc2VuYW1lKS5leHQnLFxuXHRcdFx0XHRcdFx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKHsga2V5OiAnZmlsZXMuZXhjbHVkZS53aGVuJywgY29tbWVudDogWydcXFxcJChiYXNlbmFtZSkgc2hvdWxkIG5vdCBiZSB0cmFuc2xhdGVkJ10gfSwgXCJBZGRpdGlvbmFsIGNoZWNrIG9uIHRoZSBzaWJsaW5ncyBvZiBhIG1hdGNoaW5nIGZpbGUuIFVzZSBcXFxcJChiYXNlbmFtZSkgYXMgdmFyaWFibGUgZm9yIHRoZSBtYXRjaGluZyBmaWxlIG5hbWUuXCIpXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHR9LFxuXHRcdFtGSUxFU19BU1NPQ0lBVElPTlNfQ09ORklHXToge1xuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdhc3NvY2lhdGlvbnMnLCBcIkNvbmZpZ3VyZSBbZ2xvYiBwYXR0ZXJuc10oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLWdsb2ItcGF0dGVybnMpIG9mIGZpbGUgYXNzb2NpYXRpb25zIHRvIGxhbmd1YWdlcyAoZm9yIGV4YW1wbGUgYFxcXCIqLmV4dGVuc2lvblxcXCI6IFxcXCJodG1sXFxcImApLiBQYXR0ZXJucyB3aWxsIG1hdGNoIG9uIHRoZSBhYnNvbHV0ZSBwYXRoIG9mIGEgZmlsZSBpZiB0aGV5IGNvbnRhaW4gYSBwYXRoIHNlcGFyYXRvciBhbmQgd2lsbCBtYXRjaCBvbiB0aGUgbmFtZSBvZiB0aGUgZmlsZSBvdGhlcndpc2UuIFRoZXNlIGhhdmUgcHJlY2VkZW5jZSBvdmVyIHRoZSBkZWZhdWx0IGFzc29jaWF0aW9ucyBvZiB0aGUgbGFuZ3VhZ2VzIGluc3RhbGxlZC5cIiksXG5cdFx0XHQnYWRkaXRpb25hbFByb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ3N0cmluZydcblx0XHRcdH1cblx0XHR9LFxuXHRcdCdmaWxlcy5lbmNvZGluZyc6IHtcblx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHQnZW51bSc6IE9iamVjdC5rZXlzKFNVUFBPUlRFRF9FTkNPRElOR1MpLFxuXHRcdFx0J2RlZmF1bHQnOiAndXRmOCcsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2VuY29kaW5nJywgXCJUaGUgZGVmYXVsdCBjaGFyYWN0ZXIgc2V0IGVuY29kaW5nIHRvIHVzZSB3aGVuIHJlYWRpbmcgYW5kIHdyaXRpbmcgZmlsZXMuIFRoaXMgc2V0dGluZyBjYW4gYWxzbyBiZSBjb25maWd1cmVkIHBlciBsYW5ndWFnZS5cIiksXG5cdFx0XHQnc2NvcGUnOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IE9iamVjdC5rZXlzKFNVUFBPUlRFRF9FTkNPRElOR1MpLm1hcChrZXkgPT4gU1VQUE9SVEVEX0VOQ09ESU5HU1trZXldLmxhYmVsTG9uZyksXG5cdFx0XHQnZW51bUl0ZW1MYWJlbHMnOiBPYmplY3Qua2V5cyhTVVBQT1JURURfRU5DT0RJTkdTKS5tYXAoa2V5ID0+IFNVUFBPUlRFRF9FTkNPRElOR1Nba2V5XS5sYWJlbExvbmcpXG5cdFx0fSxcblx0XHQnZmlsZXMuYXV0b0d1ZXNzRW5jb2RpbmcnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZWZhdWx0JzogZmFsc2UsXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnYXV0b0d1ZXNzRW5jb2RpbmcnLCBcIldoZW4gZW5hYmxlZCwgdGhlIGVkaXRvciB3aWxsIGF0dGVtcHQgdG8gZ3Vlc3MgdGhlIGNoYXJhY3RlciBzZXQgZW5jb2Rpbmcgd2hlbiBvcGVuaW5nIGZpbGVzLiBUaGlzIHNldHRpbmcgY2FuIGFsc28gYmUgY29uZmlndXJlZCBwZXIgbGFuZ3VhZ2UuIE5vdGUsIHRoaXMgc2V0dGluZyBpcyBub3QgcmVzcGVjdGVkIGJ5IHRleHQgc2VhcmNoLiBPbmx5IHswfSBpcyByZXNwZWN0ZWQuXCIsICdgI2ZpbGVzLmVuY29kaW5nI2AnKSxcblx0XHRcdCdzY29wZSc6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRVxuXHRcdH0sXG5cdFx0J2ZpbGVzLmNhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzJzoge1xuXHRcdFx0J3R5cGUnOiAnYXJyYXknLFxuXHRcdFx0J2l0ZW1zJzoge1xuXHRcdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0XHQnZW51bSc6IE9iamVjdC5rZXlzKEdVRVNTQUJMRV9FTkNPRElOR1MpLFxuXHRcdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IE9iamVjdC5rZXlzKEdVRVNTQUJMRV9FTkNPRElOR1MpLm1hcChrZXkgPT4gR1VFU1NBQkxFX0VOQ09ESU5HU1trZXldLmxhYmVsTG9uZylcblx0XHRcdH0sXG5cdFx0XHQnZGVmYXVsdCc6IFtdLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2NhbmRpZGF0ZUd1ZXNzRW5jb2RpbmdzJywgXCJMaXN0IG9mIGNoYXJhY3RlciBzZXQgZW5jb2RpbmdzIHRoYXQgdGhlIGVkaXRvciBzaG91bGQgYXR0ZW1wdCB0byBndWVzcyBpbiB0aGUgb3JkZXIgdGhleSBhcmUgbGlzdGVkLiBJbiBjYXNlIGl0IGNhbm5vdCBiZSBkZXRlcm1pbmVkLCB7MH0gaXMgcmVzcGVjdGVkXCIsICdgI2ZpbGVzLmVuY29kaW5nI2AnKSxcblx0XHRcdCdzY29wZSc6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRVxuXHRcdH0sXG5cdFx0J2ZpbGVzLmVvbCc6IHtcblx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHQnZW51bSc6IFtcblx0XHRcdFx0J1xcbicsXG5cdFx0XHRcdCdcXHJcXG4nLFxuXHRcdFx0XHQnYXV0bydcblx0XHRcdF0sXG5cdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlb2wuTEYnLCBcIkxGXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VvbC5DUkxGJywgXCJDUkxGXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2VvbC5hdXRvJywgXCJVc2VzIG9wZXJhdGluZyBzeXN0ZW0gc3BlY2lmaWMgZW5kIG9mIGxpbmUgY2hhcmFjdGVyLlwiKVxuXHRcdFx0XSxcblx0XHRcdCdkZWZhdWx0JzogJ2F1dG8nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdlb2wnLCBcIlRoZSBkZWZhdWx0IGVuZCBvZiBsaW5lIGNoYXJhY3Rlci5cIiksXG5cdFx0XHQnc2NvcGUnOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEVcblx0XHR9LFxuXHRcdCdmaWxlcy5lbmFibGVUcmFzaCc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCd1c2VUcmFzaCcsIFwiTW92ZXMgZmlsZXMvZm9sZGVycyB0byB0aGUgT1MgdHJhc2ggKHJlY3ljbGUgYmluIG9uIFdpbmRvd3MpIHdoZW4gZGVsZXRpbmcuIERpc2FibGluZyB0aGlzIHdpbGwgZGVsZXRlIGZpbGVzL2ZvbGRlcnMgcGVybWFuZW50bHkuXCIpXG5cdFx0fSxcblx0XHQnZmlsZXMudHJpbVRyYWlsaW5nV2hpdGVzcGFjZSc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgndHJpbVRyYWlsaW5nV2hpdGVzcGFjZScsIFwiV2hlbiBlbmFibGVkLCB3aWxsIHRyaW0gdHJhaWxpbmcgd2hpdGVzcGFjZSB3aGVuIHNhdmluZyBhIGZpbGUuXCIpLFxuXHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFXG5cdFx0fSxcblx0XHQnZmlsZXMudHJpbVRyYWlsaW5nV2hpdGVzcGFjZUluUmVnZXhBbmRTdHJpbmdzJzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVmYXVsdCc6IHRydWUsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ3RyaW1UcmFpbGluZ1doaXRlc3BhY2VJblJlZ2V4QW5kU3RyaW5ncycsIFwiV2hlbiBlbmFibGVkLCB0cmFpbGluZyB3aGl0ZXNwYWNlIHdpbGwgYmUgcmVtb3ZlZCBmcm9tIG11bHRpbGluZSBzdHJpbmdzIGFuZCByZWdleGVzIG9uIHNhdmUgb3Igd2hlbiBleGVjdXRpbmcgJ2VkaXRvci5hY3Rpb24udHJpbVRyYWlsaW5nV2hpdGVzcGFjZScuIFRoaXMgY2FuIGNhdXNlIHdoaXRlc3BhY2UgdG8gbm90IGJlIHRyaW1tZWQgZnJvbSBsaW5lcyB3aGVuIHRoZXJlIGlzbid0IHVwLXRvLWRhdGUgdG9rZW4gaW5mb3JtYXRpb24uXCIpLFxuXHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFXG5cdFx0fSxcblx0XHQnZmlsZXMuaW5zZXJ0RmluYWxOZXdsaW5lJzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVmYXVsdCc6IGZhbHNlLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdpbnNlcnRGaW5hbE5ld2xpbmUnLCBcIldoZW4gZW5hYmxlZCwgaW5zZXJ0IGEgZmluYWwgbmV3IGxpbmUgYXQgdGhlIGVuZCBvZiB0aGUgZmlsZSB3aGVuIHNhdmluZyBpdC5cIiksXG5cdFx0XHQnc2NvcGUnOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEVcblx0XHR9LFxuXHRcdCdmaWxlcy50cmltRmluYWxOZXdsaW5lcyc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgndHJpbUZpbmFsTmV3bGluZXMnLCBcIldoZW4gZW5hYmxlZCwgd2lsbCB0cmltIGFsbCBuZXcgbGluZXMgYWZ0ZXIgdGhlIGZpbmFsIG5ldyBsaW5lIGF0IHRoZSBlbmQgb2YgdGhlIGZpbGUgd2hlbiBzYXZpbmcgaXQuXCIpLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0XHR9LFxuXHRcdCdmaWxlcy5hdXRvU2F2ZSc6IHtcblx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHQnZW51bSc6IFtBdXRvU2F2ZUNvbmZpZ3VyYXRpb24uT0ZGLCBBdXRvU2F2ZUNvbmZpZ3VyYXRpb24uQUZURVJfREVMQVksIEF1dG9TYXZlQ29uZmlndXJhdGlvbi5PTl9GT0NVU19DSEFOR0UsIEF1dG9TYXZlQ29uZmlndXJhdGlvbi5PTl9XSU5ET1dfQ0hBTkdFXSxcblx0XHRcdCdtYXJrZG93bkVudW1EZXNjcmlwdGlvbnMnOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSh7IGNvbW1lbnQ6IFsnVGhpcyBpcyB0aGUgZGVzY3JpcHRpb24gZm9yIGEgc2V0dGluZy4gVmFsdWVzIHN1cnJvdW5kZWQgYnkgc2luZ2xlIHF1b3RlcyBhcmUgbm90IHRvIGJlIHRyYW5zbGF0ZWQuJ10sIGtleTogJ2ZpbGVzLmF1dG9TYXZlLm9mZicgfSwgXCJBbiBlZGl0b3Igd2l0aCBjaGFuZ2VzIGlzIG5ldmVyIGF1dG9tYXRpY2FsbHkgc2F2ZWQuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoeyBjb21tZW50OiBbJ1RoaXMgaXMgdGhlIGRlc2NyaXB0aW9uIGZvciBhIHNldHRpbmcuIFZhbHVlcyBzdXJyb3VuZGVkIGJ5IHNpbmdsZSBxdW90ZXMgYXJlIG5vdCB0byBiZSB0cmFuc2xhdGVkLiddLCBrZXk6ICdmaWxlcy5hdXRvU2F2ZS5hZnRlckRlbGF5JyB9LCBcIkFuIGVkaXRvciB3aXRoIGNoYW5nZXMgaXMgYXV0b21hdGljYWxseSBzYXZlZCBhZnRlciB0aGUgY29uZmlndXJlZCBgI2ZpbGVzLmF1dG9TYXZlRGVsYXkjYC5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSh7IGNvbW1lbnQ6IFsnVGhpcyBpcyB0aGUgZGVzY3JpcHRpb24gZm9yIGEgc2V0dGluZy4gVmFsdWVzIHN1cnJvdW5kZWQgYnkgc2luZ2xlIHF1b3RlcyBhcmUgbm90IHRvIGJlIHRyYW5zbGF0ZWQuJ10sIGtleTogJ2ZpbGVzLmF1dG9TYXZlLm9uRm9jdXNDaGFuZ2UnIH0sIFwiQW4gZWRpdG9yIHdpdGggY2hhbmdlcyBpcyBhdXRvbWF0aWNhbGx5IHNhdmVkIHdoZW4gdGhlIGVkaXRvciBsb3NlcyBmb2N1cy5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSh7IGNvbW1lbnQ6IFsnVGhpcyBpcyB0aGUgZGVzY3JpcHRpb24gZm9yIGEgc2V0dGluZy4gVmFsdWVzIHN1cnJvdW5kZWQgYnkgc2luZ2xlIHF1b3RlcyBhcmUgbm90IHRvIGJlIHRyYW5zbGF0ZWQuJ10sIGtleTogJ2ZpbGVzLmF1dG9TYXZlLm9uV2luZG93Q2hhbmdlJyB9LCBcIkFuIGVkaXRvciB3aXRoIGNoYW5nZXMgaXMgYXV0b21hdGljYWxseSBzYXZlZCB3aGVuIHRoZSB3aW5kb3cgbG9zZXMgZm9jdXMuXCIpXG5cdFx0XHRdLFxuXHRcdFx0J2RlZmF1bHQnOiBpc1dlYiA/IEF1dG9TYXZlQ29uZmlndXJhdGlvbi5BRlRFUl9ERUxBWSA6IEF1dG9TYXZlQ29uZmlndXJhdGlvbi5PRkYsXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSh7IGNvbW1lbnQ6IFsnVGhpcyBpcyB0aGUgZGVzY3JpcHRpb24gZm9yIGEgc2V0dGluZy4gVmFsdWVzIHN1cnJvdW5kZWQgYnkgc2luZ2xlIHF1b3RlcyBhcmUgbm90IHRvIGJlIHRyYW5zbGF0ZWQuJ10sIGtleTogJ2F1dG9TYXZlJyB9LCBcIkNvbnRyb2xzIFthdXRvIHNhdmVdKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvZWRpdG9yL2NvZGViYXNpY3MjX3NhdmUtYXV0by1zYXZlKSBvZiBlZGl0b3JzIHRoYXQgaGF2ZSB1bnNhdmVkIGNoYW5nZXMuXCIsIEF1dG9TYXZlQ29uZmlndXJhdGlvbi5PRkYsIEF1dG9TYXZlQ29uZmlndXJhdGlvbi5BRlRFUl9ERUxBWSwgQXV0b1NhdmVDb25maWd1cmF0aW9uLk9OX0ZPQ1VTX0NIQU5HRSwgQXV0b1NhdmVDb25maWd1cmF0aW9uLk9OX1dJTkRPV19DSEFOR0UsIEF1dG9TYXZlQ29uZmlndXJhdGlvbi5BRlRFUl9ERUxBWSksXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdFx0YWdlbnRzV2luZG93OiB7IGRlZmF1bHQ6ICdhZnRlckRlbGF5JyB9LFxuXHRcdH0sXG5cdFx0J2ZpbGVzLmF1dG9TYXZlRGVsYXknOiB7XG5cdFx0XHQndHlwZSc6ICdudW1iZXInLFxuXHRcdFx0J2RlZmF1bHQnOiAxMDAwLFxuXHRcdFx0J21pbmltdW0nOiAwLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoeyBjb21tZW50OiBbJ1RoaXMgaXMgdGhlIGRlc2NyaXB0aW9uIGZvciBhIHNldHRpbmcuIFZhbHVlcyBzdXJyb3VuZGVkIGJ5IHNpbmdsZSBxdW90ZXMgYXJlIG5vdCB0byBiZSB0cmFuc2xhdGVkLiddLCBrZXk6ICdhdXRvU2F2ZURlbGF5JyB9LCBcIkNvbnRyb2xzIHRoZSBkZWxheSBpbiBtaWxsaXNlY29uZHMgYWZ0ZXIgd2hpY2ggYW4gZWRpdG9yIHdpdGggdW5zYXZlZCBjaGFuZ2VzIGlzIHNhdmVkIGF1dG9tYXRpY2FsbHkuIE9ubHkgYXBwbGllcyB3aGVuIGAjZmlsZXMuYXV0b1NhdmUjYCBpcyBzZXQgdG8gYHswfWAuXCIsIEF1dG9TYXZlQ29uZmlndXJhdGlvbi5BRlRFUl9ERUxBWSksXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFXG5cdFx0fSxcblx0XHQnZmlsZXMuYXV0b1NhdmVXb3Jrc3BhY2VGaWxlc09ubHknOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZWZhdWx0JzogZmFsc2UsXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnYXV0b1NhdmVXb3Jrc3BhY2VGaWxlc09ubHknLCBcIldoZW4gZW5hYmxlZCwgd2lsbCBsaW1pdCBbYXV0byBzYXZlXShodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2VkaXRvci9jb2RlYmFzaWNzI19zYXZlLWF1dG8tc2F2ZSkgb2YgZWRpdG9ycyB0byBmaWxlcyB0aGF0IGFyZSBpbnNpZGUgdGhlIG9wZW5lZCB3b3Jrc3BhY2UuIE9ubHkgYXBwbGllcyB3aGVuIHswfSBpcyBlbmFibGVkLlwiLCAnYCNmaWxlcy5hdXRvU2F2ZSNgJyksXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFXG5cdFx0fSxcblx0XHQnZmlsZXMuYXV0b1NhdmVXaGVuTm9FcnJvcnMnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZWZhdWx0JzogZmFsc2UsXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnYXV0b1NhdmVXaGVuTm9FcnJvcnMnLCBcIldoZW4gZW5hYmxlZCwgd2lsbCBsaW1pdCBbYXV0byBzYXZlXShodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9kb2NzL2VkaXRvci9jb2RlYmFzaWNzI19zYXZlLWF1dG8tc2F2ZSkgb2YgZWRpdG9ycyB0byBmaWxlcyB0aGF0IGhhdmUgbm8gZXJyb3JzIHJlcG9ydGVkIGluIHRoZW0gYXQgdGhlIHRpbWUgdGhlIGF1dG8gc2F2ZSBpcyB0cmlnZ2VyZWQuIE9ubHkgYXBwbGllcyB3aGVuIHswfSBpcyBlbmFibGVkLlwiLCAnYCNmaWxlcy5hdXRvU2F2ZSNgJyksXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFXG5cdFx0fSxcblx0XHQnZmlsZXMud2F0Y2hlckV4Y2x1ZGUnOiB7XG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3BhdHRlcm5Qcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnLionOiB7ICd0eXBlJzogJ2Jvb2xlYW4nIH1cblx0XHRcdH0sXG5cdFx0XHQnZGVmYXVsdCc6IHtcblx0XHRcdFx0Ly8gQXZvaWRpbmcgYSAnKionIHBhdHRlcm4gaGVyZSB3aGljaCByZXN1bHRzIGluIGEgdmVyeSBjb21wbGV4XG5cdFx0XHRcdC8vIFJlZ0V4cCB0aGF0IGNhbiBzbG93IHRoaW5ncyBkb3duIHNpZ25pZmljYW50bHkgaW4gbGFyZ2Ugd29ya3NwYWNlc1xuXHRcdFx0XHQnLmdpdC9vYmplY3RzLyoqJzogdHJ1ZSxcblx0XHRcdFx0Jy5naXQvc3VidHJlZS1jYWNoZS8qKic6IHRydWUsXG5cdFx0XHRcdCcuaGcvc3RvcmUvKionOiB0cnVlLFxuXHRcdFx0XHQnKi8uZ2l0L29iamVjdHMvKionOiB0cnVlLFxuXHRcdFx0XHQnKi8uZ2l0L3N1YnRyZWUtY2FjaGUvKionOiB0cnVlLFxuXHRcdFx0XHQnKi8uaGcvc3RvcmUvKionOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ3dhdGNoZXJFeGNsdWRlJywgXCJDb25maWd1cmUgcGF0aHMgb3IgW2dsb2IgcGF0dGVybnNdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1nbG9iLXBhdHRlcm5zKSB0byBleGNsdWRlIGZyb20gZmlsZSB3YXRjaGluZy4gUGF0aHMgY2FuIGVpdGhlciBiZSByZWxhdGl2ZSB0byB0aGUgd2F0Y2hlZCBmb2xkZXIgb3IgYWJzb2x1dGUuIEdsb2IgcGF0dGVybnMgYXJlIG1hdGNoZWQgcmVsYXRpdmUgZnJvbSB0aGUgd2F0Y2hlZCBmb2xkZXIuIFdoZW4geW91IGV4cGVyaWVuY2UgdGhlIGZpbGUgd2F0Y2hlciBwcm9jZXNzIGNvbnN1bWluZyBhIGxvdCBvZiBDUFUsIG1ha2Ugc3VyZSB0byBleGNsdWRlIGxhcmdlIGZvbGRlcnMgdGhhdCBhcmUgb2YgbGVzcyBpbnRlcmVzdCAoc3VjaCBhcyBidWlsZCBvdXRwdXQgZm9sZGVycykuXCIpLFxuXHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFXG5cdFx0fSxcblx0XHQnZmlsZXMud2F0Y2hlckluY2x1ZGUnOiB7XG5cdFx0XHQndHlwZSc6ICdhcnJheScsXG5cdFx0XHQnaXRlbXMnOiB7XG5cdFx0XHRcdCd0eXBlJzogJ3N0cmluZydcblx0XHRcdH0sXG5cdFx0XHQnZGVmYXVsdCc6IFtdLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCd3YXRjaGVySW5jbHVkZScsIFwiQ29uZmlndXJlIGV4dHJhIHBhdGhzIHRvIHdhdGNoIGZvciBjaGFuZ2VzIGluc2lkZSB0aGUgd29ya3NwYWNlLiBCeSBkZWZhdWx0LCBhbGwgd29ya3NwYWNlIGZvbGRlcnMgd2lsbCBiZSB3YXRjaGVkIHJlY3Vyc2l2ZWx5LCBleGNlcHQgZm9yIGZvbGRlcnMgdGhhdCBhcmUgc3ltYm9saWMgbGlua3MuIFlvdSBjYW4gZXhwbGljaXRseSBhZGQgYWJzb2x1dGUgb3IgcmVsYXRpdmUgcGF0aHMgdG8gc3VwcG9ydCB3YXRjaGluZyBmb2xkZXJzIHRoYXQgYXJlIHN5bWJvbGljIGxpbmtzLiBSZWxhdGl2ZSBwYXRocyB3aWxsIGJlIHJlc29sdmVkIHRvIGFuIGFic29sdXRlIHBhdGggdXNpbmcgdGhlIGN1cnJlbnRseSBvcGVuZWQgd29ya3NwYWNlLlwiKSxcblx0XHRcdCdzY29wZSc6IENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRVxuXHRcdH0sXG5cdFx0J2ZpbGVzLmhvdEV4aXQnOiBob3RFeGl0Q29uZmlndXJhdGlvbixcblx0XHQnZmlsZXMuZGVmYXVsdExhbmd1YWdlJzoge1xuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdkZWZhdWx0TGFuZ3VhZ2UnLCBcIlRoZSBkZWZhdWx0IGxhbmd1YWdlIGlkZW50aWZpZXIgdGhhdCBpcyBhc3NpZ25lZCB0byBuZXcgZmlsZXMuIElmIGNvbmZpZ3VyZWQgdG8gYCR7YWN0aXZlRWRpdG9yTGFuZ3VhZ2V9YCwgd2lsbCB1c2UgdGhlIGxhbmd1YWdlIGlkZW50aWZpZXIgb2YgdGhlIGN1cnJlbnRseSBhY3RpdmUgdGV4dCBlZGl0b3IgaWYgYW55LlwiKVxuXHRcdH0sXG5cdFx0W0ZJTEVTX1JFQURPTkxZX0lOQ0xVREVfQ09ORklHXToge1xuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwYXR0ZXJuUHJvcGVydGllcyc6IHtcblx0XHRcdFx0Jy4qJzogeyAndHlwZSc6ICdib29sZWFuJyB9XG5cdFx0XHR9LFxuXHRcdFx0J2RlZmF1bHQnOiB7fSxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdmaWxlc1JlYWRvbmx5SW5jbHVkZScsIFwiQ29uZmlndXJlIHBhdGhzIG9yIFtnbG9iIHBhdHRlcm5zXShodHRwczovL2FrYS5tcy92c2NvZGUtZ2xvYi1wYXR0ZXJucykgdG8gbWFyayBhcyByZWFkLW9ubHkuIEdsb2IgcGF0dGVybnMgYXJlIGFsd2F5cyBldmFsdWF0ZWQgcmVsYXRpdmUgdG8gdGhlIHBhdGggb2YgdGhlIHdvcmtzcGFjZSBmb2xkZXIgdW5sZXNzIHRoZXkgYXJlIGFic29sdXRlIHBhdGhzLiBZb3UgY2FuIGV4Y2x1ZGUgbWF0Y2hpbmcgcGF0aHMgdmlhIHRoZSBgI2ZpbGVzLnJlYWRvbmx5RXhjbHVkZSNgIHNldHRpbmcuIEZpbGVzIGZyb20gcmVhZG9ubHkgZmlsZSBzeXN0ZW0gcHJvdmlkZXJzIHdpbGwgYWx3YXlzIGJlIHJlYWQtb25seSBpbmRlcGVuZGVudCBvZiB0aGlzIHNldHRpbmcuXCIpLFxuXHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFXG5cdFx0fSxcblx0XHRbRklMRVNfUkVBRE9OTFlfRVhDTFVERV9DT05GSUddOiB7XG5cdFx0XHQndHlwZSc6ICdvYmplY3QnLFxuXHRcdFx0J3BhdHRlcm5Qcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHQnLionOiB7ICd0eXBlJzogJ2Jvb2xlYW4nIH1cblx0XHRcdH0sXG5cdFx0XHQnZGVmYXVsdCc6IHt9LFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2ZpbGVzUmVhZG9ubHlFeGNsdWRlJywgXCJDb25maWd1cmUgcGF0aHMgb3IgW2dsb2IgcGF0dGVybnNdKGh0dHBzOi8vYWthLm1zL3ZzY29kZS1nbG9iLXBhdHRlcm5zKSB0byBleGNsdWRlIGZyb20gYmVpbmcgbWFya2VkIGFzIHJlYWQtb25seSBpZiB0aGV5IG1hdGNoIGFzIGEgcmVzdWx0IG9mIHRoZSBgI2ZpbGVzLnJlYWRvbmx5SW5jbHVkZSNgIHNldHRpbmcuIEdsb2IgcGF0dGVybnMgYXJlIGFsd2F5cyBldmFsdWF0ZWQgcmVsYXRpdmUgdG8gdGhlIHBhdGggb2YgdGhlIHdvcmtzcGFjZSBmb2xkZXIgdW5sZXNzIHRoZXkgYXJlIGFic29sdXRlIHBhdGhzLiBGaWxlcyBmcm9tIHJlYWRvbmx5IGZpbGUgc3lzdGVtIHByb3ZpZGVycyB3aWxsIGFsd2F5cyBiZSByZWFkLW9ubHkgaW5kZXBlbmRlbnQgb2YgdGhpcyBzZXR0aW5nLlwiKSxcblx0XHRcdCdzY29wZSc6IENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRVxuXHRcdH0sXG5cdFx0W0ZJTEVTX1JFQURPTkxZX0ZST01fUEVSTUlTU0lPTlNfQ09ORklHXToge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnZmlsZXNSZWFkb25seUZyb21QZXJtaXNzaW9ucycsIFwiTWFya3MgZmlsZXMgYXMgcmVhZC1vbmx5IHdoZW4gdGhlaXIgZmlsZSBwZXJtaXNzaW9ucyBpbmRpY2F0ZSBhcyBzdWNoLiBUaGlzIGNhbiBiZSBvdmVycmlkZGVuIHZpYSBgI2ZpbGVzLnJlYWRvbmx5SW5jbHVkZSNgIGFuZCBgI2ZpbGVzLnJlYWRvbmx5RXhjbHVkZSNgIHNldHRpbmdzLlwiKSxcblx0XHRcdCdkZWZhdWx0JzogZmFsc2Vcblx0XHR9LFxuXHRcdCdmaWxlcy5yZXN0b3JlVW5kb1N0YWNrJzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2ZpbGVzLnJlc3RvcmVVbmRvU3RhY2snLCBcIlJlc3RvcmUgdGhlIHVuZG8gc3RhY2sgd2hlbiBhIGZpbGUgaXMgcmVvcGVuZWQuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlXG5cdFx0fSxcblx0XHQnZmlsZXMuc2F2ZUNvbmZsaWN0UmVzb2x1dGlvbic6IHtcblx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHQnZW51bSc6IFtcblx0XHRcdFx0J2Fza1VzZXInLFxuXHRcdFx0XHQnb3ZlcndyaXRlRmlsZU9uRGlzaydcblx0XHRcdF0sXG5cdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdhc2tVc2VyJywgXCJXaWxsIHJlZnVzZSB0byBzYXZlIGFuZCBhc2sgZm9yIHJlc29sdmluZyB0aGUgc2F2ZSBjb25mbGljdCBtYW51YWxseS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnb3ZlcndyaXRlRmlsZU9uRGlzaycsIFwiV2lsbCByZXNvbHZlIHRoZSBzYXZlIGNvbmZsaWN0IGJ5IG92ZXJ3cml0aW5nIHRoZSBmaWxlIG9uIGRpc2sgd2l0aCB0aGUgY2hhbmdlcyBpbiB0aGUgZWRpdG9yLlwiKVxuXHRcdFx0XSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnZmlsZXMuc2F2ZUNvbmZsaWN0UmVzb2x1dGlvbicsIFwiQSBzYXZlIGNvbmZsaWN0IGNhbiBvY2N1ciB3aGVuIGEgZmlsZSBpcyBzYXZlZCB0byBkaXNrIHRoYXQgd2FzIGNoYW5nZWQgYnkgYW5vdGhlciBwcm9ncmFtIGluIHRoZSBtZWFudGltZS4gVG8gcHJldmVudCBkYXRhIGxvc3MsIHRoZSB1c2VyIGlzIGFza2VkIHRvIGNvbXBhcmUgdGhlIGNoYW5nZXMgaW4gdGhlIGVkaXRvciB3aXRoIHRoZSB2ZXJzaW9uIG9uIGRpc2suIFRoaXMgc2V0dGluZyBzaG91bGQgb25seSBiZSBjaGFuZ2VkIGlmIHlvdSBmcmVxdWVudGx5IGVuY291bnRlciBzYXZlIGNvbmZsaWN0IGVycm9ycyBhbmQgbWF5IHJlc3VsdCBpbiBkYXRhIGxvc3MgaWYgdXNlZCB3aXRob3V0IGNhdXRpb24uXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiAnYXNrVXNlcicsXG5cdFx0XHQnc2NvcGUnOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEVcblx0XHR9LFxuXHRcdCdmaWxlcy5kaWFsb2cuZGVmYXVsdFBhdGgnOiB7XG5cdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0J3BhdHRlcm4nOiAnXigoXFxcXC98XFxcXFxcXFxcXFxcXFxcXHxbYS16QS1aXTpcXFxcXFxcXCkuKik/JCcsIC8vIHNsYXNoIE9SIFVOQy1yb290IE9SIGRyaXZlLXJvb3QgT1IgdW5kZWZpbmVkXG5cdFx0XHQncGF0dGVybkVycm9yTWVzc2FnZSc6IG5scy5sb2NhbGl6ZSgnZGVmYXVsdFBhdGhFcnJvck1lc3NhZ2UnLCBcIkRlZmF1bHQgcGF0aCBmb3IgZmlsZSBkaWFsb2dzIG11c3QgYmUgYW4gYWJzb2x1dGUgcGF0aCAoZS5nLiBDOlxcXFxcXFxcbXlGb2xkZXIgb3IgL215Rm9sZGVyKS5cIiksXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2ZpbGVEaWFsb2dEZWZhdWx0UGF0aCcsIFwiRGVmYXVsdCBwYXRoIGZvciBmaWxlIGRpYWxvZ3MsIG92ZXJyaWRpbmcgdXNlcidzIGhvbWUgcGF0aC4gT25seSB1c2VkIGluIHRoZSBhYnNlbmNlIG9mIGEgY29udGV4dC1zcGVjaWZpYyBwYXRoLCBzdWNoIGFzIG1vc3QgcmVjZW50bHkgb3BlbmVkIGZpbGUgb3IgZm9sZGVyLlwiKSxcblx0XHRcdCdzY29wZSc6IENvbmZpZ3VyYXRpb25TY29wZS5NQUNISU5FXG5cdFx0fSxcblx0XHQnZmlsZXMuc2ltcGxlRGlhbG9nLmVuYWJsZSc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdmaWxlcy5zaW1wbGVEaWFsb2cuZW5hYmxlJywgXCJFbmFibGVzIHRoZSBzaW1wbGUgZmlsZSBkaWFsb2cgZm9yIG9wZW5pbmcgYW5kIHNhdmluZyBmaWxlcyBhbmQgZm9sZGVycy4gVGhlIHNpbXBsZSBmaWxlIGRpYWxvZyByZXBsYWNlcyB0aGUgc3lzdGVtIGZpbGUgZGlhbG9nIHdoZW4gZW5hYmxlZC5cIiksXG5cdFx0XHQnZGVmYXVsdCc6IGZhbHNlXG5cdFx0fSxcblx0XHQnZmlsZXMucGFydGljaXBhbnRzLnRpbWVvdXQnOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlZmF1bHQ6IDYwMDAwLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdmaWxlcy5wYXJ0aWNpcGFudHMudGltZW91dCcsIFwiVGltZW91dCBpbiBtaWxsaXNlY29uZHMgYWZ0ZXIgd2hpY2ggZmlsZSBwYXJ0aWNpcGFudHMgZm9yIGNyZWF0ZSwgcmVuYW1lLCBhbmQgZGVsZXRlIGFyZSBjYW5jZWxsZWQuIFVzZSBgMGAgdG8gZGlzYWJsZSBwYXJ0aWNpcGFudHMuXCIpLFxuXHRcdH1cblx0fVxufSk7XG5cbmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHQuLi5lZGl0b3JDb25maWd1cmF0aW9uQmFzZU5vZGUsXG5cdHByb3BlcnRpZXM6IHtcblx0XHQnZWRpdG9yLmZvcm1hdE9uU2F2ZSc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2Zvcm1hdE9uU2F2ZScsIFwiRm9ybWF0IGEgZmlsZSBvbiBzYXZlLiBBIGZvcm1hdHRlciBtdXN0IGJlIGF2YWlsYWJsZSBhbmQgdGhlIGVkaXRvciBtdXN0IG5vdCBiZSBzaHV0dGluZyBkb3duLiBXaGVuIHswfSBpcyBzZXQgdG8gYGFmdGVyRGVsYXlgLCB0aGUgZmlsZSB3aWxsIG9ubHkgYmUgZm9ybWF0dGVkIHdoZW4gc2F2ZWQgZXhwbGljaXRseS5cIiwgJ2AjZmlsZXMuYXV0b1NhdmUjYCcpLFxuXHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRcdH0sXG5cdFx0J2VkaXRvci5mb3JtYXRPblNhdmVNb2RlJzoge1xuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCdkZWZhdWx0JzogJ2ZpbGUnLFxuXHRcdFx0J2VudW0nOiBbXG5cdFx0XHRcdCdmaWxlJyxcblx0XHRcdFx0J21vZGlmaWNhdGlvbnMnLFxuXHRcdFx0XHQnbW9kaWZpY2F0aW9uc0lmQXZhaWxhYmxlJ1xuXHRcdFx0XSxcblx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoeyBrZXk6ICdldmVyeXRoaW5nJywgY29tbWVudDogWydUaGlzIGlzIHRoZSBkZXNjcmlwdGlvbiBvZiBhbiBvcHRpb24nXSB9LCBcIkZvcm1hdCB0aGUgd2hvbGUgZmlsZS5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSh7IGtleTogJ21vZGlmaWNhdGlvbicsIGNvbW1lbnQ6IFsnVGhpcyBpcyB0aGUgZGVzY3JpcHRpb24gb2YgYW4gb3B0aW9uJ10gfSwgXCJGb3JtYXQgbW9kaWZpY2F0aW9ucy4gUmVxdWlyZXMgc291cmNlIGNvbnRyb2wgYW5kIGEgZm9ybWF0dGVyIHRoYXQgc3VwcG9ydHMgJ0Zvcm1hdCBTZWxlY3Rpb24nLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKHsga2V5OiAnbW9kaWZpY2F0aW9uSWZBdmFpbGFibGUnLCBjb21tZW50OiBbJ1RoaXMgaXMgdGhlIGRlc2NyaXB0aW9uIG9mIGFuIG9wdGlvbiddIH0sIFwiV2lsbCBhdHRlbXB0IHRvIGZvcm1hdCBtb2RpZmljYXRpb25zIG9ubHkgKHJlcXVpcmVzIHNvdXJjZSBjb250cm9sIGFuZCBhIGZvcm1hdHRlciB0aGF0IHN1cHBvcnRzICdGb3JtYXQgU2VsZWN0aW9uJykuIElmIHNvdXJjZSBjb250cm9sIGNhbid0IGJlIHVzZWQsIHRoZW4gdGhlIHdob2xlIGZpbGUgd2lsbCBiZSBmb3JtYXR0ZWQuXCIpLFxuXHRcdFx0XSxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdmb3JtYXRPblNhdmVNb2RlJywgXCJDb250cm9scyBpZiBmb3JtYXQgb24gc2F2ZSBmb3JtYXRzIHRoZSB3aG9sZSBmaWxlIG9yIG9ubHkgbW9kaWZpY2F0aW9ucy4gT25seSBhcHBsaWVzIHdoZW4gYCNlZGl0b3IuZm9ybWF0T25TYXZlI2AgaXMgZW5hYmxlZC5cIiksXG5cdFx0XHQnc2NvcGUnOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG5cdFx0fSxcblx0fVxufSk7XG5cbmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHQnaWQnOiAnZXhwbG9yZXInLFxuXHQnb3JkZXInOiAxMCxcblx0J3RpdGxlJzogbmxzLmxvY2FsaXplKCdleHBsb3JlckNvbmZpZ3VyYXRpb25UaXRsZScsIFwiRmlsZSBFeHBsb3JlclwiKSxcblx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0J2V4cGxvcmVyLm9wZW5FZGl0b3JzLnZpc2libGUnOiB7XG5cdFx0XHQndHlwZSc6ICdudW1iZXInLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKHsga2V5OiAnb3BlbkVkaXRvcnNWaXNpYmxlJywgY29tbWVudDogWydPcGVuIGlzIGFuIGFkamVjdGl2ZSddIH0sIFwiVGhlIGluaXRpYWwgbWF4aW11bSBudW1iZXIgb2YgZWRpdG9ycyBzaG93biBpbiB0aGUgT3BlbiBFZGl0b3JzIHBhbmUuIEV4Y2VlZGluZyB0aGlzIGxpbWl0IHdpbGwgc2hvdyBhIHNjcm9sbCBiYXIgYW5kIGFsbG93IHJlc2l6aW5nIHRoZSBwYW5lIHRvIGRpc3BsYXkgbW9yZSBpdGVtcy5cIiksXG5cdFx0XHQnZGVmYXVsdCc6IDksXG5cdFx0XHQnbWluaW11bSc6IDFcblx0XHR9LFxuXHRcdCdleHBsb3Jlci5vcGVuRWRpdG9ycy5taW5WaXNpYmxlJzoge1xuXHRcdFx0J3R5cGUnOiAnbnVtYmVyJyxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSh7IGtleTogJ29wZW5FZGl0b3JzVmlzaWJsZU1pbicsIGNvbW1lbnQ6IFsnT3BlbiBpcyBhbiBhZGplY3RpdmUnXSB9LCBcIlRoZSBtaW5pbXVtIG51bWJlciBvZiBlZGl0b3Igc2xvdHMgcHJlLWFsbG9jYXRlZCBpbiB0aGUgT3BlbiBFZGl0b3JzIHBhbmUuIElmIHNldCB0byAwIHRoZSBPcGVuIEVkaXRvcnMgcGFuZSB3aWxsIGR5bmFtaWNhbGx5IHJlc2l6ZSBiYXNlZCBvbiB0aGUgbnVtYmVyIG9mIGVkaXRvcnMuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiAwLFxuXHRcdFx0J21pbmltdW0nOiAwXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIub3BlbkVkaXRvcnMuc29ydE9yZGVyJzoge1xuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCdlbnVtJzogWydlZGl0b3JPcmRlcicsICdhbHBoYWJldGljYWwnLCAnZnVsbFBhdGgnXSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSh7IGtleTogJ29wZW5FZGl0b3JzU29ydE9yZGVyJywgY29tbWVudDogWydPcGVuIGlzIGFuIGFkamVjdGl2ZSddIH0sIFwiQ29udHJvbHMgdGhlIHNvcnRpbmcgb3JkZXIgb2YgZWRpdG9ycyBpbiB0aGUgT3BlbiBFZGl0b3JzIHBhbmUuXCIpLFxuXHRcdFx0J2VudW1EZXNjcmlwdGlvbnMnOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc29ydE9yZGVyLmVkaXRvck9yZGVyJywgJ0VkaXRvcnMgYXJlIG9yZGVyZWQgaW4gdGhlIHNhbWUgb3JkZXIgZWRpdG9yIHRhYnMgYXJlIHNob3duLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NvcnRPcmRlci5hbHBoYWJldGljYWwnLCAnRWRpdG9ycyBhcmUgb3JkZXJlZCBhbHBoYWJldGljYWxseSBieSB0YWIgbmFtZSBpbnNpZGUgZWFjaCBlZGl0b3IgZ3JvdXAuJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc29ydE9yZGVyLmZ1bGxQYXRoJywgJ0VkaXRvcnMgYXJlIG9yZGVyZWQgYWxwaGFiZXRpY2FsbHkgYnkgZnVsbCBwYXRoIGluc2lkZSBlYWNoIGVkaXRvciBncm91cC4nKVxuXHRcdFx0XSxcblx0XHRcdCdkZWZhdWx0JzogJ2VkaXRvck9yZGVyJ1xuXHRcdH0sXG5cdFx0J2V4cGxvcmVyLmF1dG9SZXZlYWwnOiB7XG5cdFx0XHQndHlwZSc6IFsnYm9vbGVhbicsICdzdHJpbmcnXSxcblx0XHRcdCdlbnVtJzogW3RydWUsIGZhbHNlLCAnZm9jdXNOb1Njcm9sbCddLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlLFxuXHRcdFx0J2VudW1EZXNjcmlwdGlvbnMnOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnYXV0b1JldmVhbC5vbicsICdGaWxlcyB3aWxsIGJlIHJldmVhbGVkIGFuZCBzZWxlY3RlZC4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdhdXRvUmV2ZWFsLm9mZicsICdGaWxlcyB3aWxsIG5vdCBiZSByZXZlYWxlZCBhbmQgc2VsZWN0ZWQuJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnYXV0b1JldmVhbC5mb2N1c05vU2Nyb2xsJywgJ0ZpbGVzIHdpbGwgbm90IGJlIHNjcm9sbGVkIGludG8gdmlldywgYnV0IHdpbGwgc3RpbGwgYmUgZm9jdXNlZC4nKSxcblx0XHRcdF0sXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2F1dG9SZXZlYWwnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIEV4cGxvcmVyIHNob3VsZCBhdXRvbWF0aWNhbGx5IHJldmVhbCBhbmQgc2VsZWN0IGZpbGVzIHdoZW4gb3BlbmluZyB0aGVtLlwiKVxuXHRcdH0sXG5cdFx0J2V4cGxvcmVyLmF1dG9SZXZlYWxFeGNsdWRlJzoge1xuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdhdXRvUmV2ZWFsRXhjbHVkZScsIFwiQ29uZmlndXJlIHBhdGhzIG9yIFtnbG9iIHBhdHRlcm5zXShodHRwczovL2FrYS5tcy92c2NvZGUtZ2xvYi1wYXR0ZXJucykgZm9yIGV4Y2x1ZGluZyBmaWxlcyBhbmQgZm9sZGVycyBmcm9tIGJlaW5nIHJldmVhbGVkIGFuZCBzZWxlY3RlZCBpbiB0aGUgRXhwbG9yZXIgd2hlbiB0aGV5IGFyZSBvcGVuZWQuIEdsb2IgcGF0dGVybnMgYXJlIGFsd2F5cyBldmFsdWF0ZWQgcmVsYXRpdmUgdG8gdGhlIHBhdGggb2YgdGhlIHdvcmtzcGFjZSBmb2xkZXIgdW5sZXNzIHRoZXkgYXJlIGFic29sdXRlIHBhdGhzLlwiKSxcblx0XHRcdCdkZWZhdWx0JzogeyAnKiovbm9kZV9tb2R1bGVzJzogdHJ1ZSwgJyoqL2Jvd2VyX2NvbXBvbmVudHMnOiB0cnVlIH0sXG5cdFx0XHQnYWRkaXRpb25hbFByb3BlcnRpZXMnOiB7XG5cdFx0XHRcdCdhbnlPZic6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnZXhwbG9yZXIuYXV0b1JldmVhbEV4Y2x1ZGUuYm9vbGVhbicsIFwiVGhlIGdsb2IgcGF0dGVybiB0byBtYXRjaCBmaWxlIHBhdGhzIGFnYWluc3QuIFNldCB0byB0cnVlIG9yIGZhbHNlIHRvIGVuYWJsZSBvciBkaXNhYmxlIHRoZSBwYXR0ZXJuLlwiKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHR3aGVuOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsIC8vIGV4cHJlc3Npb24gKHsgXCIqKi8qLmpzXCI6IHsgXCJ3aGVuXCI6IFwiJChiYXNlbmFtZSkuanNcIiB9IH0pXG5cdFx0XHRcdFx0XHRcdFx0cGF0dGVybjogJ1xcXFx3KlxcXFwkXFxcXChiYXNlbmFtZVxcXFwpXFxcXHcqJyxcblx0XHRcdFx0XHRcdFx0XHRkZWZhdWx0OiAnJChiYXNlbmFtZSkuZXh0Jyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdleHBsb3Jlci5hdXRvUmV2ZWFsRXhjbHVkZS53aGVuJywgJ0FkZGl0aW9uYWwgY2hlY2sgb24gdGhlIHNpYmxpbmdzIG9mIGEgbWF0Y2hpbmcgZmlsZS4gVXNlIHswfSBhcyB2YXJpYWJsZSBmb3IgdGhlIG1hdGNoaW5nIGZpbGUgbmFtZS4nLCAnJChiYXNlbmFtZSknKVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuZW5hYmxlRHJhZ0FuZERyb3AnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnZW5hYmxlRHJhZ0FuZERyb3AnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIEV4cGxvcmVyIHNob3VsZCBhbGxvdyB0byBtb3ZlIGZpbGVzIGFuZCBmb2xkZXJzIHZpYSBkcmFnIGFuZCBkcm9wLiBUaGlzIHNldHRpbmcgb25seSBlZmZlY3RzIGRyYWcgYW5kIGRyb3AgZnJvbSBpbnNpZGUgdGhlIEV4cGxvcmVyLlwiKSxcblx0XHRcdCdkZWZhdWx0JzogdHJ1ZVxuXHRcdH0sXG5cdFx0J2V4cGxvcmVyLmNvbmZpcm1EcmFnQW5kRHJvcCc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdjb25maXJtRHJhZ0FuZERyb3AnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIEV4cGxvcmVyIHNob3VsZCBhc2sgZm9yIGNvbmZpcm1hdGlvbiB0byBtb3ZlIGZpbGVzIGFuZCBmb2xkZXJzIHZpYSBkcmFnIGFuZCBkcm9wLlwiKSxcblx0XHRcdCdkZWZhdWx0JzogdHJ1ZVxuXHRcdH0sXG5cdFx0J2V4cGxvcmVyLmNvbmZpcm1QYXN0ZU5hdGl2ZSc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdjb25maXJtUGFzdGVOYXRpdmUnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIEV4cGxvcmVyIHNob3VsZCBhc2sgZm9yIGNvbmZpcm1hdGlvbiB3aGVuIHBhc3RpbmcgbmF0aXZlIGZpbGVzIGFuZCBmb2xkZXJzLlwiKSxcblx0XHRcdCdkZWZhdWx0JzogdHJ1ZVxuXHRcdH0sXG5cdFx0J2V4cGxvcmVyLmNvbmZpcm1EZWxldGUnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnY29uZmlybURlbGV0ZScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgRXhwbG9yZXIgc2hvdWxkIGFzayBmb3IgY29uZmlybWF0aW9uIHdoZW4gZGVsZXRpbmcgZmlsZXMgYW5kIGZvbGRlcnMuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuZW5hYmxlVW5kbyc6IHtcblx0XHRcdCd0eXBlJzogJ2Jvb2xlYW4nLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdlbmFibGVVbmRvJywgXCJDb250cm9scyB3aGV0aGVyIHRoZSBFeHBsb3JlciBzaG91bGQgc3VwcG9ydCB1bmRvaW5nIGZpbGUgYW5kIGZvbGRlciBvcGVyYXRpb25zLlwiKSxcblx0XHRcdCdkZWZhdWx0JzogdHJ1ZVxuXHRcdH0sXG5cdFx0J2V4cGxvcmVyLmNvbmZpcm1VbmRvJzoge1xuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCdlbnVtJzogW1VuZG9Db25maXJtTGV2ZWwuVmVyYm9zZSwgVW5kb0NvbmZpcm1MZXZlbC5EZWZhdWx0LCBVbmRvQ29uZmlybUxldmVsLkxpZ2h0XSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnY29uZmlybVVuZG8nLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIEV4cGxvcmVyIHNob3VsZCBhc2sgZm9yIGNvbmZpcm1hdGlvbiB3aGVuIHVuZG9pbmcuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiBVbmRvQ29uZmlybUxldmVsLkRlZmF1bHQsXG5cdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdlbmFibGVVbmRvLnZlcmJvc2UnLCAnRXhwbG9yZXIgd2lsbCBwcm9tcHQgYmVmb3JlIGFsbCB1bmRvIG9wZXJhdGlvbnMuJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZW5hYmxlVW5kby5kZWZhdWx0JywgJ0V4cGxvcmVyIHdpbGwgcHJvbXB0IGJlZm9yZSBkZXN0cnVjdGl2ZSB1bmRvIG9wZXJhdGlvbnMuJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZW5hYmxlVW5kby5saWdodCcsICdFeHBsb3JlciB3aWxsIG5vdCBwcm9tcHQgYmVmb3JlIHVuZG8gb3BlcmF0aW9ucyB3aGVuIGZvY3VzZWQuJyksXG5cdFx0XHRdLFxuXHRcdH0sXG5cdFx0J2V4cGxvcmVyLmV4cGFuZFNpbmdsZUZvbGRlcldvcmtzcGFjZXMnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnZXhwYW5kU2luZ2xlRm9sZGVyV29ya3NwYWNlcycsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgRXhwbG9yZXIgc2hvdWxkIGV4cGFuZCBtdWx0aS1yb290IHdvcmtzcGFjZXMgY29udGFpbmluZyBvbmx5IG9uZSBmb2xkZXIgZHVyaW5nIGluaXRpYWxpemF0aW9uXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuc29ydE9yZGVyJzoge1xuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCdlbnVtJzogW1NvcnRPcmRlci5EZWZhdWx0LCBTb3J0T3JkZXIuTWl4ZWQsIFNvcnRPcmRlci5GaWxlc0ZpcnN0LCBTb3J0T3JkZXIuVHlwZSwgU29ydE9yZGVyLk1vZGlmaWVkLCBTb3J0T3JkZXIuRm9sZGVyc05lc3RzRmlsZXNdLFxuXHRcdFx0J2RlZmF1bHQnOiBTb3J0T3JkZXIuRGVmYXVsdCxcblx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NvcnRPcmRlci5kZWZhdWx0JywgJ0ZpbGVzIGFuZCBmb2xkZXJzIGFyZSBzb3J0ZWQgYnkgdGhlaXIgbmFtZXMuIEZvbGRlcnMgYXJlIGRpc3BsYXllZCBiZWZvcmUgZmlsZXMuJyksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc29ydE9yZGVyLm1peGVkJywgJ0ZpbGVzIGFuZCBmb2xkZXJzIGFyZSBzb3J0ZWQgYnkgdGhlaXIgbmFtZXMuIEZpbGVzIGFyZSBpbnRlcndvdmVuIHdpdGggZm9sZGVycy4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzb3J0T3JkZXIuZmlsZXNGaXJzdCcsICdGaWxlcyBhbmQgZm9sZGVycyBhcmUgc29ydGVkIGJ5IHRoZWlyIG5hbWVzLiBGaWxlcyBhcmUgZGlzcGxheWVkIGJlZm9yZSBmb2xkZXJzLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NvcnRPcmRlci50eXBlJywgJ0ZpbGVzIGFuZCBmb2xkZXJzIGFyZSBncm91cGVkIGJ5IGV4dGVuc2lvbiB0eXBlIHRoZW4gc29ydGVkIGJ5IHRoZWlyIG5hbWVzLiBGb2xkZXJzIGFyZSBkaXNwbGF5ZWQgYmVmb3JlIGZpbGVzLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NvcnRPcmRlci5tb2RpZmllZCcsICdGaWxlcyBhbmQgZm9sZGVycyBhcmUgc29ydGVkIGJ5IGxhc3QgbW9kaWZpZWQgZGF0ZSBpbiBkZXNjZW5kaW5nIG9yZGVyLiBGb2xkZXJzIGFyZSBkaXNwbGF5ZWQgYmVmb3JlIGZpbGVzLicpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NvcnRPcmRlci5mb2xkZXJzTmVzdHNGaWxlcycsICdGaWxlcyBhbmQgZm9sZGVycyBhcmUgc29ydGVkIGJ5IHRoZWlyIG5hbWVzLiBGb2xkZXJzIGFyZSBkaXNwbGF5ZWQgYmVmb3JlIGZpbGVzLiBGaWxlcyB3aXRoIG5lc3RlZCBjaGlsZHJlbiBhcmUgZGlzcGxheWVkIGJlZm9yZSBvdGhlciBmaWxlcy4nKVxuXHRcdFx0XSxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdzb3J0T3JkZXInLCBcIkNvbnRyb2xzIHRoZSBwcm9wZXJ0eS1iYXNlZCBzb3J0aW5nIG9mIGZpbGVzIGFuZCBmb2xkZXJzIGluIHRoZSBFeHBsb3Jlci4gV2hlbiBgI2V4cGxvcmVyLmZpbGVOZXN0aW5nLmVuYWJsZWQjYCBpcyBlbmFibGVkLCBhbHNvIGNvbnRyb2xzIHNvcnRpbmcgb2YgbmVzdGVkIGZpbGVzLlwiKVxuXHRcdH0sXG5cdFx0J2V4cGxvcmVyLnNvcnRPcmRlckxleGljb2dyYXBoaWNPcHRpb25zJzoge1xuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCdlbnVtJzogW0xleGljb2dyYXBoaWNPcHRpb25zLkRlZmF1bHQsIExleGljb2dyYXBoaWNPcHRpb25zLlVwcGVyLCBMZXhpY29ncmFwaGljT3B0aW9ucy5Mb3dlciwgTGV4aWNvZ3JhcGhpY09wdGlvbnMuVW5pY29kZV0sXG5cdFx0XHQnZGVmYXVsdCc6IExleGljb2dyYXBoaWNPcHRpb25zLkRlZmF1bHQsXG5cdFx0XHQnZW51bURlc2NyaXB0aW9ucyc6IFtcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzb3J0T3JkZXJMZXhpY29ncmFwaGljT3B0aW9ucy5kZWZhdWx0JywgJ1VwcGVyY2FzZSBhbmQgbG93ZXJjYXNlIG5hbWVzIGFyZSBtaXhlZCB0b2dldGhlci4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzb3J0T3JkZXJMZXhpY29ncmFwaGljT3B0aW9ucy51cHBlcicsICdVcHBlcmNhc2UgbmFtZXMgYXJlIGdyb3VwZWQgdG9nZXRoZXIgYmVmb3JlIGxvd2VyY2FzZSBuYW1lcy4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzb3J0T3JkZXJMZXhpY29ncmFwaGljT3B0aW9ucy5sb3dlcicsICdMb3dlcmNhc2UgbmFtZXMgYXJlIGdyb3VwZWQgdG9nZXRoZXIgYmVmb3JlIHVwcGVyY2FzZSBuYW1lcy4nKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdzb3J0T3JkZXJMZXhpY29ncmFwaGljT3B0aW9ucy51bmljb2RlJywgJ05hbWVzIGFyZSBzb3J0ZWQgaW4gVW5pY29kZSBvcmRlci4nKVxuXHRcdFx0XSxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnc29ydE9yZGVyTGV4aWNvZ3JhcGhpY09wdGlvbnMnLCBcIkNvbnRyb2xzIHRoZSBsZXhpY29ncmFwaGljIHNvcnRpbmcgb2YgZmlsZSBhbmQgZm9sZGVyIG5hbWVzIGluIHRoZSBFeHBsb3Jlci5cIilcblx0XHR9LFxuXHRcdCdleHBsb3Jlci5zb3J0T3JkZXJSZXZlcnNlJzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ3NvcnRPcmRlclJldmVyc2UnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIGZpbGUgYW5kIGZvbGRlciBzb3J0IG9yZGVyLCBzaG91bGQgYmUgcmV2ZXJzZWQuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHR9LFxuXHRcdCdleHBsb3Jlci5kZWNvcmF0aW9ucy5jb2xvcnMnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdleHBsb3Jlci5kZWNvcmF0aW9ucy5jb2xvcnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgZmlsZSBkZWNvcmF0aW9ucyBzaG91bGQgdXNlIGNvbG9ycy5cIiksXG5cdFx0XHRkZWZhdWx0OiB0cnVlXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuZGVjb3JhdGlvbnMuYmFkZ2VzJzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZXhwbG9yZXIuZGVjb3JhdGlvbnMuYmFkZ2VzJywgXCJDb250cm9scyB3aGV0aGVyIGZpbGUgZGVjb3JhdGlvbnMgc2hvdWxkIHVzZSBiYWRnZXMuXCIpLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZVxuXHRcdH0sXG5cdFx0J2V4cGxvcmVyLmluY3JlbWVudGFsTmFtaW5nJzoge1xuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnc2ltcGxlJywgJ3NtYXJ0JywgJ2Rpc2FibGVkJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnc2ltcGxlJywgXCJBcHBlbmRzIHRoZSB3b3JkIFxcXCJjb3B5XFxcIiBhdCB0aGUgZW5kIG9mIHRoZSBkdXBsaWNhdGVkIG5hbWUgcG90ZW50aWFsbHkgZm9sbG93ZWQgYnkgYSBudW1iZXIuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ3NtYXJ0JywgXCJBZGRzIGEgbnVtYmVyIGF0IHRoZSBlbmQgb2YgdGhlIGR1cGxpY2F0ZWQgbmFtZS4gSWYgc29tZSBudW1iZXIgaXMgYWxyZWFkeSBwYXJ0IG9mIHRoZSBuYW1lLCB0cmllcyB0byBpbmNyZWFzZSB0aGF0IG51bWJlci5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnZGlzYWJsZWQnLCBcIkRpc2FibGVzIGluY3JlbWVudGFsIG5hbWluZy4gSWYgdHdvIGZpbGVzIHdpdGggdGhlIHNhbWUgbmFtZSBleGlzdCB5b3Ugd2lsbCBiZSBwcm9tcHRlZCB0byBvdmVyd3JpdGUgdGhlIGV4aXN0aW5nIGZpbGUuXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZXhwbG9yZXIuaW5jcmVtZW50YWxOYW1pbmcnLCBcIkNvbnRyb2xzIHdoaWNoIG5hbWluZyBzdHJhdGVneSB0byB1c2Ugd2hlbiBnaXZpbmcgYSBuZXcgbmFtZSB0byBhIGR1cGxpY2F0ZWQgRXhwbG9yZXIgaXRlbSBvbiBwYXN0ZS5cIiksXG5cdFx0XHRkZWZhdWx0OiAnc2ltcGxlJ1xuXHRcdH0sXG5cdFx0J2V4cGxvcmVyLmF1dG9PcGVuRHJvcHBlZEZpbGUnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnYXV0b09wZW5Ecm9wcGVkRmlsZScsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgRXhwbG9yZXIgc2hvdWxkIGF1dG9tYXRpY2FsbHkgb3BlbiBhIGZpbGUgd2hlbiBpdCBpcyBkcm9wcGVkIGludG8gdGhlIGV4cGxvcmVyXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuY29tcGFjdEZvbGRlcnMnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnY29tcHJlc3NTaW5nbGVDaGlsZEZvbGRlcnMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdGhlIEV4cGxvcmVyIHNob3VsZCByZW5kZXIgZm9sZGVycyBpbiBhIGNvbXBhY3QgZm9ybS4gSW4gc3VjaCBhIGZvcm0sIHNpbmdsZSBjaGlsZCBmb2xkZXJzIHdpbGwgYmUgY29tcHJlc3NlZCBpbiBhIGNvbWJpbmVkIHRyZWUgZWxlbWVudC4gVXNlZnVsIGZvciBKYXZhIHBhY2thZ2Ugc3RydWN0dXJlcywgZm9yIGV4YW1wbGUuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiB0cnVlXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuY29weVJlbGF0aXZlUGF0aFNlcGFyYXRvcic6IHtcblx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHQnZW51bSc6IFtcblx0XHRcdFx0Jy8nLFxuXHRcdFx0XHQnXFxcXCcsXG5cdFx0XHRcdCdhdXRvJ1xuXHRcdFx0XSxcblx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NvcHlSZWxhdGl2ZVBhdGhTZXBhcmF0b3Iuc2xhc2gnLCBcIlVzZSBzbGFzaCBhcyBwYXRoIHNlcGFyYXRpb24gY2hhcmFjdGVyLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjb3B5UmVsYXRpdmVQYXRoU2VwYXJhdG9yLmJhY2tzbGFzaCcsIFwiVXNlIGJhY2tzbGFzaCBhcyBwYXRoIHNlcGFyYXRpb24gY2hhcmFjdGVyLlwiKSxcblx0XHRcdFx0bmxzLmxvY2FsaXplKCdjb3B5UmVsYXRpdmVQYXRoU2VwYXJhdG9yLmF1dG8nLCBcIlVzZXMgb3BlcmF0aW5nIHN5c3RlbSBzcGVjaWZpYyBwYXRoIHNlcGFyYXRpb24gY2hhcmFjdGVyLlwiKSxcblx0XHRcdF0sXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2NvcHlSZWxhdGl2ZVBhdGhTZXBhcmF0b3InLCBcIlRoZSBwYXRoIHNlcGFyYXRpb24gY2hhcmFjdGVyIHVzZWQgd2hlbiBjb3B5aW5nIHJlbGF0aXZlIGZpbGUgcGF0aHMuXCIpLFxuXHRcdFx0J2RlZmF1bHQnOiAnYXV0bydcblx0XHR9LFxuXHRcdCdleHBsb3Jlci5jb3B5UGF0aFNlcGFyYXRvcic6IHtcblx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHQnZW51bSc6IFtcblx0XHRcdFx0Jy8nLFxuXHRcdFx0XHQnXFxcXCcsXG5cdFx0XHRcdCdhdXRvJ1xuXHRcdFx0XSxcblx0XHRcdCdlbnVtRGVzY3JpcHRpb25zJzogW1xuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NvcHlQYXRoU2VwYXJhdG9yLnNsYXNoJywgXCJVc2Ugc2xhc2ggYXMgcGF0aCBzZXBhcmF0aW9uIGNoYXJhY3Rlci5cIiksXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnY29weVBhdGhTZXBhcmF0b3IuYmFja3NsYXNoJywgXCJVc2UgYmFja3NsYXNoIGFzIHBhdGggc2VwYXJhdGlvbiBjaGFyYWN0ZXIuXCIpLFxuXHRcdFx0XHRubHMubG9jYWxpemUoJ2NvcHlQYXRoU2VwYXJhdG9yLmF1dG8nLCBcIlVzZXMgb3BlcmF0aW5nIHN5c3RlbSBzcGVjaWZpYyBwYXRoIHNlcGFyYXRpb24gY2hhcmFjdGVyLlwiKSxcblx0XHRcdF0sXG5cdFx0XHQnZGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2NvcHlQYXRoU2VwYXJhdG9yJywgXCJUaGUgcGF0aCBzZXBhcmF0aW9uIGNoYXJhY3RlciB1c2VkIHdoZW4gY29weWluZyBmaWxlIHBhdGhzLlwiKSxcblx0XHRcdCdkZWZhdWx0JzogJ2F1dG8nXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuZXhjbHVkZUdpdElnbm9yZSc6IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZXhjbHVkZUdpdGlnbm9yZScsIFwiQ29udHJvbHMgd2hldGhlciBlbnRyaWVzIGluIC5naXRpZ25vcmUgc2hvdWxkIGJlIHBhcnNlZCBhbmQgZXhjbHVkZWQgZnJvbSB0aGUgRXhwbG9yZXIuIFNpbWlsYXIgdG8gezB9LlwiLCAnYCNmaWxlcy5leGNsdWRlI2AnKSxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5SRVNPVVJDRVxuXHRcdH0sXG5cdFx0J2V4cGxvcmVyLmZpbGVOZXN0aW5nLmVuYWJsZWQnOiB7XG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuUkVTT1VSQ0UsXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnZmlsZU5lc3RpbmdFbmFibGVkJywgXCJDb250cm9scyB3aGV0aGVyIGZpbGUgbmVzdGluZyBpcyBlbmFibGVkIGluIHRoZSBFeHBsb3Jlci4gRmlsZSBuZXN0aW5nIGFsbG93cyBmb3IgcmVsYXRlZCBmaWxlcyBpbiBhIGRpcmVjdG9yeSB0byBiZSB2aXN1YWxseSBncm91cGVkIHRvZ2V0aGVyIHVuZGVyIGEgc2luZ2xlIHBhcmVudCBmaWxlLlwiKSxcblx0XHRcdCdkZWZhdWx0JzogZmFsc2UsXG5cdFx0fSxcblx0XHQnZXhwbG9yZXIuZmlsZU5lc3RpbmcuZXhwYW5kJzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IG5scy5sb2NhbGl6ZSgnZmlsZU5lc3RpbmdFeHBhbmQnLCBcIkNvbnRyb2xzIHdoZXRoZXIgZmlsZSBuZXN0cyBhcmUgYXV0b21hdGljYWxseSBleHBhbmRlZC4gezB9IG11c3QgYmUgc2V0IGZvciB0aGlzIHRvIHRha2UgZWZmZWN0LlwiLCAnYCNleHBsb3Jlci5maWxlTmVzdGluZy5lbmFibGVkI2AnKSxcblx0XHRcdCdkZWZhdWx0JzogdHJ1ZSxcblx0XHR9LFxuXHRcdCdleHBsb3Jlci5maWxlTmVzdGluZy5wYXR0ZXJucyc6IHtcblx0XHRcdCd0eXBlJzogJ29iamVjdCcsXG5cdFx0XHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBubHMubG9jYWxpemUoJ2ZpbGVOZXN0aW5nUGF0dGVybnMnLCBcIkNvbnRyb2xzIG5lc3Rpbmcgb2YgZmlsZXMgaW4gdGhlIEV4cGxvcmVyLiB7MH0gbXVzdCBiZSBzZXQgZm9yIHRoaXMgdG8gdGFrZSBlZmZlY3QuIEVhY2ggX19JdGVtX18gcmVwcmVzZW50cyBhIHBhcmVudCBwYXR0ZXJuIGFuZCBtYXkgY29udGFpbiBhIHNpbmdsZSBgKmAgY2hhcmFjdGVyIHRoYXQgbWF0Y2hlcyBhbnkgc3RyaW5nLiBFYWNoIF9fVmFsdWVfXyByZXByZXNlbnRzIGEgY29tbWEgc2VwYXJhdGVkIGxpc3Qgb2YgdGhlIGNoaWxkIHBhdHRlcm5zIHRoYXQgc2hvdWxkIGJlIHNob3duIG5lc3RlZCB1bmRlciBhIGdpdmVuIHBhcmVudC4gQ2hpbGQgcGF0dGVybnMgbWF5IGNvbnRhaW4gc2V2ZXJhbCBzcGVjaWFsIHRva2VuczpcXG4tIGAke2NhcHR1cmV9YDogTWF0Y2hlcyB0aGUgcmVzb2x2ZWQgdmFsdWUgb2YgdGhlIGAqYCBmcm9tIHRoZSBwYXJlbnQgcGF0dGVyblxcbi0gYCR7YmFzZW5hbWV9YDogTWF0Y2hlcyB0aGUgcGFyZW50IGZpbGUncyBiYXNlbmFtZSwgdGhlIGBmaWxlYCBpbiBgZmlsZS50c2BcXG4tIGAke2V4dG5hbWV9YDogTWF0Y2hlcyB0aGUgcGFyZW50IGZpbGUncyBleHRlbnNpb24sIHRoZSBgdHNgIGluIGBmaWxlLnRzYFxcbi0gYCR7ZGlybmFtZX1gOiBNYXRjaGVzIHRoZSBwYXJlbnQgZmlsZSdzIGRpcmVjdG9yeSBuYW1lLCB0aGUgYHNyY2AgaW4gYHNyYy9maWxlLnRzYFxcbi0gYCpgOiAgTWF0Y2hlcyBhbnkgc3RyaW5nLCBtYXkgb25seSBiZSB1c2VkIG9uY2UgcGVyIGNoaWxkIHBhdHRlcm5cIiwgJ2AjZXhwbG9yZXIuZmlsZU5lc3RpbmcuZW5hYmxlZCNgJyksXG5cdFx0XHRwYXR0ZXJuUHJvcGVydGllczoge1xuXHRcdFx0XHQnXlteKl0qXFxcXCo/W14qXSokJzoge1xuXHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZmlsZU5lc3RpbmcuZGVzY3JpcHRpb24nLCBcIkVhY2gga2V5IHBhdHRlcm4gbWF5IGNvbnRhaW4gYSBzaW5nbGUgYCpgIGNoYXJhY3RlciB3aGljaCB3aWxsIG1hdGNoIGFueSBzdHJpbmcuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdHBhdHRlcm46ICdeKFteLCpdKlxcXFwqP1teLCpdKikoLCA/W14sKl0qXFxcXCo/W14sKl0qKSokJyxcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdCdkZWZhdWx0Jzoge1xuXHRcdFx0XHQnKi50cyc6ICcke2NhcHR1cmV9LmpzJyxcblx0XHRcdFx0JyouanMnOiAnJHtjYXB0dXJlfS5qcy5tYXAsICR7Y2FwdHVyZX0ubWluLmpzLCAke2NhcHR1cmV9LmQudHMnLFxuXHRcdFx0XHQnKi5qc3gnOiAnJHtjYXB0dXJlfS5qcycsXG5cdFx0XHRcdCcqLnRzeCc6ICcke2NhcHR1cmV9LnRzJyxcblx0XHRcdFx0J3RzY29uZmlnLmpzb24nOiAndHNjb25maWcuKi5qc29uJyxcblx0XHRcdFx0J3BhY2thZ2UuanNvbic6ICdwYWNrYWdlLWxvY2suanNvbiwgeWFybi5sb2NrLCBwbnBtLWxvY2sueWFtbCwgYnVuLmxvY2tiLCBidW4ubG9jaycsXG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuVW5kb0NvbW1hbmQuYWRkSW1wbGVtZW50YXRpb24oMTEwLCAnZXhwbG9yZXInLCAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpID0+IHtcblx0Y29uc3QgdW5kb1JlZG9TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElVbmRvUmVkb1NlcnZpY2UpO1xuXHRjb25zdCBleHBsb3JlclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4cGxvcmVyU2VydmljZSk7XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0Y29uc3QgZXhwbG9yZXJDYW5VbmRvID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUZpbGVzQ29uZmlndXJhdGlvbj4oKS5leHBsb3Jlci5lbmFibGVVbmRvO1xuXHRpZiAoZXhwbG9yZXJTZXJ2aWNlLmhhc1ZpZXdGb2N1cygpICYmIHVuZG9SZWRvU2VydmljZS5jYW5VbmRvKFVORE9fUkVET19TT1VSQ0UpICYmIGV4cGxvcmVyQ2FuVW5kbykge1xuXHRcdHVuZG9SZWRvU2VydmljZS51bmRvKFVORE9fUkVET19TT1VSQ0UpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cmV0dXJuIGZhbHNlO1xufSk7XG5cblJlZG9Db21tYW5kLmFkZEltcGxlbWVudGF0aW9uKDExMCwgJ2V4cGxvcmVyJywgKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSA9PiB7XG5cdGNvbnN0IHVuZG9SZWRvU2VydmljZSA9IGFjY2Vzc29yLmdldChJVW5kb1JlZG9TZXJ2aWNlKTtcblx0Y29uc3QgZXhwbG9yZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHBsb3JlclNlcnZpY2UpO1xuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdGNvbnN0IGV4cGxvcmVyQ2FuVW5kbyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElGaWxlc0NvbmZpZ3VyYXRpb24+KCkuZXhwbG9yZXIuZW5hYmxlVW5kbztcblx0aWYgKGV4cGxvcmVyU2VydmljZS5oYXNWaWV3Rm9jdXMoKSAmJiB1bmRvUmVkb1NlcnZpY2UuY2FuUmVkbyhVTkRPX1JFRE9fU09VUkNFKSAmJiBleHBsb3JlckNhblVuZG8pIHtcblx0XHR1bmRvUmVkb1NlcnZpY2UucmVkbyhVTkRPX1JFRE9fU09VUkNFKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn0pO1xuXG5Nb2Rlc1JlZ2lzdHJ5LnJlZ2lzdGVyTGFuZ3VhZ2Uoe1xuXHRpZDogQklOQVJZX1RFWFRfRklMRV9NT0RFLFxuXHRhbGlhc2VzOiBbJ0JpbmFyeSddLFxuXHRtaW1ldHlwZXM6IFsndGV4dC94LWNvZGUtYmluYXJ5J11cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQWlDLGNBQWMseUJBQXlCLDBCQUF3RDtBQUNoSSxTQUFpQyxnQkFBZ0Isc0NBQXNDO0FBQ3ZGLFNBQW1ELHdCQUF3QjtBQUMzRSxTQUFTLHVCQUF1QixzQkFBc0Isc0JBQXNCLDJCQUEyQiwrQkFBK0IsK0JBQStCLDhDQUE4QztBQUNuTixTQUFTLFdBQVcsc0JBQXNCLHNCQUFzQix1QkFBdUIsd0JBQTZDO0FBQ3BJLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsVUFBVSxPQUFPLGlCQUFpQjtBQUMzQyxTQUFTLHdDQUF3QztBQUNqRCxTQUE4Qiw0QkFBNEI7QUFDMUQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsaUJBQWlCLHdCQUF3QjtBQUNsRCxTQUFTLHFCQUFxQiwyQkFBMkI7QUFDekQs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
