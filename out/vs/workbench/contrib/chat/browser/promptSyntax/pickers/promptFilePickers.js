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
import { localize } from "../../../../../../nls.js";
import { URI } from "../../../../../../base/common/uri.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { AgentInstructionFileType, IPromptsService, PromptsStorage } from "../../../common/promptSyntax/service/promptsService.js";
import { basename, dirname, extUri, joinPath } from "../../../../../../base/common/resources.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { IOpenerService } from "../../../../../../platform/opener/common/opener.js";
import { IDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { getCleanPromptName, getSkillFolderName } from "../../../common/promptSyntax/config/promptFileLocations.js";
import { PromptsType, INSTRUCTIONS_DOCUMENTATION_URL, AGENT_DOCUMENTATION_URL, PROMPT_DOCUMENTATION_URL, SKILL_DOCUMENTATION_URL, HOOK_DOCUMENTATION_URL } from "../../../common/promptSyntax/promptTypes.js";
import { NEW_PROMPT_COMMAND_ID, NEW_INSTRUCTIONS_COMMAND_ID, NEW_AGENT_COMMAND_ID, NEW_SKILL_COMMAND_ID } from "../newPromptFileActions.js";
import { GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID, GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID, GENERATE_PROMPT_COMMAND_ID, GENERATE_SKILL_COMMAND_ID, GENERATE_AGENT_COMMAND_ID } from "../../actions/chatActions.js";
import { IQuickInputService } from "../../../../../../platform/quickinput/common/quickInput.js";
import { askForPromptFileName } from "./askForPromptName.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../../base/common/cancellation.js";
import { askForPromptSourceFolder } from "./askForPromptSourceFolder.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { IProductService } from "../../../../../../platform/product/common/productService.js";
import { PromptFileRewriter } from "../promptFileRewriter.js";
import { isOrganizationPromptFile } from "../../../common/promptSyntax/utils/promptsServiceUtils.js";
import { assertNever } from "../../../../../../base/common/assert.js";
function newHelpButton(type) {
  const iconClass = ThemeIcon.asClassName(Codicon.question);
  switch (type) {
    case PromptsType.prompt:
      return {
        tooltip: localize("help.prompt", "Show help on prompt files"),
        helpURI: URI.parse(PROMPT_DOCUMENTATION_URL),
        iconClass
      };
    case PromptsType.instructions:
      return {
        tooltip: localize("help.instructions", "Show help on instruction files"),
        helpURI: URI.parse(INSTRUCTIONS_DOCUMENTATION_URL),
        iconClass
      };
    case PromptsType.agent:
      return {
        tooltip: localize("help.agent", "Show help on custom agent files"),
        helpURI: URI.parse(AGENT_DOCUMENTATION_URL),
        iconClass
      };
    case PromptsType.skill:
      return {
        tooltip: localize("help.skill", "Show help on skill files"),
        helpURI: URI.parse(SKILL_DOCUMENTATION_URL),
        iconClass
      };
    case PromptsType.hook:
      return {
        tooltip: localize("help.hook", "Show help on hook files"),
        helpURI: URI.parse(HOOK_DOCUMENTATION_URL),
        iconClass
      };
  }
}
function isHelpButton(button) {
  return button.helpURI !== void 0;
}
function isPromptFileItem(item) {
  return item.type === "item" && !!item.promptFileUri;
}
function isExtensionPromptPath(prompt) {
  return prompt.storage === PromptsStorage.extension && !!prompt.extension;
}
const NEW_PROMPT_FILE_OPTION = {
  type: "item",
  label: `$(plus) ${localize(
    "commands.new-promptfile.select-dialog.label",
    "New prompt file..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.prompt)],
  commandId: NEW_PROMPT_COMMAND_ID
};
const NEW_INSTRUCTIONS_FILE_OPTION = {
  type: "item",
  label: `$(plus) ${localize(
    "commands.new-instructionsfile.select-dialog.label",
    "New instruction file..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.instructions)],
  commandId: NEW_INSTRUCTIONS_COMMAND_ID
};
const GENERATE_AGENT_INSTRUCTIONS_OPTION = {
  type: "item",
  label: `$(sparkle) ${localize(
    "commands.generate-agent-instructions.select-dialog.label",
    "Generate agent instructions..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.instructions)],
  commandId: GENERATE_AGENT_INSTRUCTIONS_COMMAND_ID
};
const GENERATE_ON_DEMAND_INSTRUCTIONS_OPTION = {
  type: "item",
  label: `$(sparkle) ${localize(
    "commands.generate-on-demand-instructions.select-dialog.label",
    "Generate on-demand instructions..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.instructions)],
  commandId: GENERATE_ON_DEMAND_INSTRUCTIONS_COMMAND_ID
};
const NEW_AGENT_FILE_OPTION = {
  type: "item",
  label: `$(plus) ${localize(
    "commands.new-agentfile.select-dialog.label",
    "Create new custom agent..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.agent)],
  commandId: NEW_AGENT_COMMAND_ID
};
const NEW_SKILL_FILE_OPTION = {
  type: "item",
  label: `$(plus) ${localize(
    "commands.new-skill.select-dialog.label",
    "New skill..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.skill)],
  commandId: NEW_SKILL_COMMAND_ID
};
const GENERATE_PROMPT_OPTION = {
  type: "item",
  label: `$(sparkle) ${localize(
    "commands.generate-prompt.select-dialog.label",
    "Generate prompt..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.prompt)],
  commandId: GENERATE_PROMPT_COMMAND_ID
};
const GENERATE_SKILL_OPTION = {
  type: "item",
  label: `$(sparkle) ${localize(
    "commands.generate-skill.select-dialog.label",
    "Generate skill..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.skill)],
  commandId: GENERATE_SKILL_COMMAND_ID
};
const GENERATE_AGENT_OPTION = {
  type: "item",
  label: `$(sparkle) ${localize(
    "commands.generate-agent.select-dialog.label",
    "Generate agent..."
  )}`,
  pickable: false,
  alwaysShow: true,
  buttons: [newHelpButton(PromptsType.agent)],
  commandId: GENERATE_AGENT_COMMAND_ID
};
const EDIT_BUTTON = {
  tooltip: localize("open", "Open in Editor"),
  iconClass: ThemeIcon.asClassName(Codicon.fileCode)
};
const DELETE_BUTTON = {
  tooltip: localize("delete", "Delete"),
  iconClass: ThemeIcon.asClassName(Codicon.trash)
};
const RENAME_BUTTON = {
  tooltip: localize("rename", "Move and/or Rename"),
  iconClass: ThemeIcon.asClassName(Codicon.replace)
};
const COPY_BUTTON = {
  tooltip: localize("makeACopy", "Make a Copy"),
  iconClass: ThemeIcon.asClassName(Codicon.copy)
};
const MAKE_VISIBLE_BUTTON = {
  tooltip: localize("makeVisible", "Hidden from chat view agent picker. Click to show."),
  iconClass: ThemeIcon.asClassName(Codicon.eyeClosed),
  alwaysVisible: true
};
const MAKE_INVISIBLE_BUTTON = {
  tooltip: localize("makeInvisible", "Shown in chat view agent picker. Click to hide."),
  iconClass: ThemeIcon.asClassName(Codicon.eye)
};
const RUN_IN_CHAT_BUTTON = {
  tooltip: localize("runInChat", "Run in Chat View"),
  iconClass: ThemeIcon.asClassName(Codicon.play)
};
let PromptFilePickers = class {
  constructor(_quickInputService, _openerService, _fileService, _dialogService, _commandService, _instaService, _promptsService, _labelService, _productService) {
    this._quickInputService = _quickInputService;
    this._openerService = _openerService;
    this._fileService = _fileService;
    this._dialogService = _dialogService;
    this._commandService = _commandService;
    this._instaService = _instaService;
    this._promptsService = _promptsService;
    this._labelService = _labelService;
    this._productService = _productService;
  }
  /**
   * Shows the prompt file selection dialog to the user that allows to run a prompt file(s).
   *
   * If {@link ISelectOptions.resource resource} is provided, the dialog will have
   * the resource pre-selected in the prompts list.
   */
  async selectPromptFile(options) {
    const cts = new CancellationTokenSource();
    const quickPick = this._quickInputService.createQuickPick({ useSeparators: true });
    quickPick.busy = true;
    quickPick.placeholder = localize("searching", "Searching file system...");
    try {
      const fileOptions = await this._createPromptPickItems(options, cts.token);
      const activeItem = options.resource && fileOptions.find((f) => f.type === "item" && extUri.isEqual(f.promptFileUri, options.resource));
      if (activeItem) {
        quickPick.activeItems = [activeItem];
      }
      quickPick.placeholder = options.placeholder;
      quickPick.matchOnDescription = true;
      quickPick.items = fileOptions;
    } finally {
      quickPick.busy = false;
    }
    return new Promise((resolve) => {
      const disposables = new DisposableStore();
      let isResolved = false;
      let isClosed = false;
      disposables.add(quickPick);
      disposables.add(cts);
      const refreshItems = async () => {
        const active = quickPick.activeItems;
        const newItems = await this._createPromptPickItems(options, CancellationToken.None);
        quickPick.items = newItems;
        quickPick.activeItems = active;
      };
      disposables.add(quickPick.onDidAccept(async () => {
        const { selectedItems } = quickPick;
        const { keyMods } = quickPick;
        const selectedItem = selectedItems[0];
        if (isPromptFileItem(selectedItem)) {
          resolve({ promptFile: selectedItem.promptFileUri, keyMods: { ...keyMods } });
          isResolved = true;
        } else {
          if (selectedItem.commandId) {
            await this._commandService.executeCommand(selectedItem.commandId);
            return;
          }
        }
        quickPick.hide();
      }));
      disposables.add(quickPick.onDidTriggerItemButton(async (e) => {
        const shouldRefresh = await this._handleButtonClick(quickPick, e, options);
        if (!isClosed && shouldRefresh) {
          await refreshItems();
        }
      }));
      disposables.add(quickPick.onDidHide(() => {
        if (!quickPick.ignoreFocusOut) {
          disposables.dispose();
          isClosed = true;
          if (!isResolved) {
            resolve(void 0);
            isResolved = true;
          }
        }
      }));
      quickPick.show();
    });
  }
  async _createPromptPickItems(options, token) {
    const buttons = [];
    if (options.type === PromptsType.prompt && options.optionRun !== false) {
      buttons.push(RUN_IN_CHAT_BUTTON);
    }
    if (options.optionEdit !== false) {
      buttons.push(EDIT_BUTTON);
    }
    if (options.optionCopy !== false) {
      buttons.push(COPY_BUTTON);
    }
    if (options.optionRename !== false) {
      buttons.push(RENAME_BUTTON);
    }
    if (options.optionDelete !== false) {
      buttons.push(DELETE_BUTTON);
    }
    const result = [];
    if (options.optionNew !== false) {
      result.push(...this._getNewItems(options.type));
    }
    let getVisibility = () => void 0;
    if (options.optionVisibility) {
      const disabled = this._promptsService.getDisabledPromptFiles(options.type);
      getVisibility = (p) => !disabled.has(p.uri);
    }
    const sortByLabel = (items) => items.sort((a, b) => a.label.localeCompare(b.label));
    const locals = await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.local, token);
    if (locals.length) {
      result.push({ type: "separator", label: localize("separator.workspace", "Workspace") });
      result.push(...sortByLabel(await Promise.all(locals.map((l) => this._createPromptPickItem(l, buttons, getVisibility(l), token)))));
    }
    let agentInstructionFiles = [];
    if (options.type === PromptsType.instructions) {
      const agentInstructionUris = await this._promptsService.listAgentInstructions(token);
      agentInstructionFiles = agentInstructionUris.map((agentInstructionFile) => {
        const folderName = this._labelService.getUriLabel(dirname(agentInstructionFile.uri), { relative: true });
        return {
          uri: agentInstructionFile.uri,
          description: agentInstructionFile.type !== AgentInstructionFileType.copilotInstructionsMd ? folderName : void 0,
          storage: PromptsStorage.local,
          type: options.type
        };
      });
    }
    if (agentInstructionFiles.length) {
      const agentButtons = buttons.filter((b) => b !== RENAME_BUTTON);
      result.push({ type: "separator", label: localize("separator.workspace-agent-instructions", "Agent Instructions") });
      result.push(...sortByLabel(await Promise.all(agentInstructionFiles.map((l) => this._createPromptPickItem(l, agentButtons, getVisibility(l), token)))));
    }
    const exts = (await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.extension, token)).filter(isExtensionPromptPath);
    if (exts.length) {
      const extButtons = [];
      if (options.type === PromptsType.prompt && options.optionRun !== false) {
        extButtons.push(RUN_IN_CHAT_BUTTON);
      }
      if (options.optionEdit !== false) {
        extButtons.push(EDIT_BUTTON);
      }
      if (options.optionCopy !== false) {
        extButtons.push(COPY_BUTTON);
      }
      const groupedExts = /* @__PURE__ */ new Map();
      for (const ext of exts) {
        const groupLabel = this._getExtensionGroupLabel(ext);
        if (!groupedExts.has(groupLabel)) {
          groupedExts.set(groupLabel, []);
        }
        groupedExts.get(groupLabel).push(ext);
      }
      const sortedGroupedExts = Array.from(groupedExts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
      for (const [groupLabel, groupExts] of sortedGroupedExts) {
        result.push({ type: "separator", label: groupLabel });
        result.push(...sortByLabel(await Promise.all(groupExts.map((e) => this._createPromptPickItem(e, extButtons, getVisibility(e), token)))));
      }
    }
    const users = await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.user, token);
    if (users.length) {
      result.push({ type: "separator", label: localize("separator.user", "User Data") });
      result.push(...sortByLabel(await Promise.all(users.map((u) => this._createPromptPickItem(u, buttons, getVisibility(u), token)))));
    }
    const plugins = await this._promptsService.listPromptFilesForStorage(options.type, PromptsStorage.plugin, token);
    if (plugins.length) {
      const pluginButtons = [];
      if (options.optionCopy !== false) {
        pluginButtons.push(COPY_BUTTON);
      }
      result.push({ type: "separator", label: localize("separator.plugins", "Plugins") });
      result.push(...sortByLabel(await Promise.all(plugins.map((p) => this._createPromptPickItem(p, pluginButtons, getVisibility(p), token)))));
    }
    return result;
  }
  _getExtensionGroupLabel(extPath) {
    if (isOrganizationPromptFile(extPath.uri, extPath.extension.identifier, this._productService)) {
      return localize("separator.organization", "Organization");
    }
    return localize("separator.extensions", "Extensions");
  }
  _getNewItems(type) {
    switch (type) {
      case PromptsType.prompt:
        return [NEW_PROMPT_FILE_OPTION, GENERATE_PROMPT_OPTION];
      case PromptsType.instructions:
        return [NEW_INSTRUCTIONS_FILE_OPTION, GENERATE_ON_DEMAND_INSTRUCTIONS_OPTION, GENERATE_AGENT_INSTRUCTIONS_OPTION];
      case PromptsType.agent:
        return [NEW_AGENT_FILE_OPTION, GENERATE_AGENT_OPTION];
      case PromptsType.skill:
        return [NEW_SKILL_FILE_OPTION, GENERATE_SKILL_OPTION];
      default:
        throw new Error(`Unknown prompt type '${type}'.`);
    }
  }
  async _createPromptPickItem(promptFile, buttons, visibility, token) {
    const parsedPromptFile = await this._promptsService.parseNew(promptFile.uri, token).catch(() => void 0);
    let promptName = (parsedPromptFile?.header?.name ?? promptFile.name) || (promptFile.type === PromptsType.skill ? getSkillFolderName(promptFile.uri) : getCleanPromptName(promptFile.uri));
    const promptDescription = parsedPromptFile?.header?.description ?? promptFile.description;
    let tooltip;
    switch (promptFile.storage) {
      case PromptsStorage.extension:
        tooltip = promptFile.extension.displayName ?? promptFile.extension.id;
        break;
      case PromptsStorage.local:
        tooltip = this._labelService.getUriLabel(dirname(promptFile.uri), { relative: true });
        break;
      case PromptsStorage.user:
        tooltip = void 0;
        break;
      case PromptsStorage.plugin:
        tooltip = promptFile.name;
        break;
      case PromptsStorage.builtIn:
        tooltip = void 0;
        break;
      default:
        assertNever(promptFile);
    }
    let iconClass;
    if (visibility === false) {
      buttons = (buttons ?? []).concat(MAKE_VISIBLE_BUTTON);
      promptName = localize("hiddenLabelInfo", "{0} (hidden)", promptName);
      tooltip = localize("hiddenInAgentPicker", "Hidden from chat view agent picker");
    } else if (visibility === true) {
      buttons = (buttons ?? []).concat(MAKE_INVISIBLE_BUTTON);
    }
    return {
      id: promptFile.uri.toString(),
      type: "item",
      label: promptName,
      description: promptDescription,
      iconClass,
      tooltip,
      promptFileUri: promptFile.uri,
      buttons
    };
  }
  async keepQuickPickOpen(quickPick, work) {
    const previousIgnoreFocusOut = quickPick.ignoreFocusOut;
    quickPick.ignoreFocusOut = true;
    try {
      return await work();
    } finally {
      quickPick.ignoreFocusOut = previousIgnoreFocusOut;
      quickPick.show();
    }
  }
  async _handleButtonClick(quickPick, context, options) {
    const { item, button } = context;
    if (!isPromptFileItem(item)) {
      if (isHelpButton(button)) {
        await this._openerService.open(button.helpURI);
        return false;
      }
      throw new Error(`Unknown button '${JSON.stringify(button)}'.`);
    }
    const value = item.promptFileUri;
    if (button === RUN_IN_CHAT_BUTTON) {
      const commandId = quickPick.keyMods.ctrlCmd === true ? "workbench.action.chat.run-in-new-chat.prompt.current" : "workbench.action.chat.run.prompt.current";
      await this._commandService.executeCommand(commandId, value);
      quickPick.hide();
      return false;
    }
    if (button === EDIT_BUTTON) {
      await this._openerService.open(value);
      return false;
    }
    if (button === RENAME_BUTTON || button === COPY_BUTTON) {
      return await this.keepQuickPickOpen(quickPick, async () => {
        const currentFolder = dirname(value);
        const isMove = button === RENAME_BUTTON && quickPick.keyMods.ctrlCmd;
        const newFolder = await this._instaService.invokeFunction(askForPromptSourceFolder, options.type, currentFolder, isMove);
        if (!newFolder) {
          return false;
        }
        const newName = await this._instaService.invokeFunction(askForPromptFileName, options.type, newFolder.uri, item.label);
        if (!newName) {
          return false;
        }
        const newFile = joinPath(newFolder.uri, newName);
        if (isMove) {
          await this._fileService.move(value, newFile);
        } else {
          await this._fileService.copy(value, newFile);
        }
        await this._openerService.open(newFile);
        await this._instaService.createInstance(PromptFileRewriter).openAndRewriteName(newFile, getCleanPromptName(newFile), CancellationToken.None);
        return true;
      });
    }
    if (button === DELETE_BUTTON) {
      return await this.keepQuickPickOpen(quickPick, async () => {
        const isSkill = options.type === PromptsType.skill;
        const filename = isSkill ? basename(dirname(value)) : item.label;
        const message = isSkill ? localize("commands.prompts.use.select-dialog.delete-skill.confirm.message", "Are you sure you want to delete skill '{0}' and its folder?", filename) : localize("commands.prompts.use.select-dialog.delete-prompt.confirm.message", "Are you sure you want to delete '{0}'?", filename);
        const { confirmed } = await this._dialogService.confirm({ message });
        if (!confirmed) {
          return false;
        }
        const deleteTarget = isSkill ? dirname(value) : value;
        await this._fileService.del(deleteTarget, { recursive: isSkill, useTrash: true });
        return true;
      });
    }
    if (button === MAKE_VISIBLE_BUTTON || button === MAKE_INVISIBLE_BUTTON) {
      const disabled = this._promptsService.getDisabledPromptFiles(options.type);
      if (button === MAKE_VISIBLE_BUTTON) {
        disabled.delete(value);
      } else {
        disabled.add(value);
      }
      this._promptsService.setDisabledPromptFiles(options.type, disabled);
      return true;
    }
    throw new Error(`Unknown button '${JSON.stringify(button)}'.`);
  }
  // --- Enablement Configuration -------------------------------------------------------
  /**
   * Shows a multi-select (checkbox) quick pick to configure which prompt files of the given
   * type are enabled. Currently only used for agent prompt files.
   */
  async managePromptFiles(type, placeholder) {
    const cts = new CancellationTokenSource();
    const quickPick = this._quickInputService.createQuickPick({ useSeparators: true });
    quickPick.placeholder = placeholder;
    quickPick.canSelectMany = true;
    quickPick.matchOnDescription = true;
    quickPick.sortByLabel = false;
    quickPick.busy = true;
    const options = {
      placeholder: "",
      type,
      optionNew: true,
      optionEdit: true,
      optionDelete: true,
      optionRename: true,
      optionCopy: true,
      optionVisibility: false,
      optionRun: false
    };
    try {
      const items = await this._createPromptPickItems(options, cts.token);
      quickPick.items = items;
    } finally {
      quickPick.busy = false;
    }
    return new Promise((resolve) => {
      const disposables = new DisposableStore();
      disposables.add(quickPick);
      disposables.add(cts);
      let isClosed = false;
      let isResolved = false;
      const refreshItems = async () => {
        const active = quickPick.activeItems;
        const newItems = await this._createPromptPickItems(options, CancellationToken.None);
        quickPick.items = newItems;
        quickPick.activeItems = active;
      };
      disposables.add(quickPick.onDidAccept(async () => {
        const clickedItem = quickPick.activeItems;
        if (clickedItem.length === 1 && clickedItem[0].commandId) {
          const commandId = clickedItem[0].commandId;
          await this.keepQuickPickOpen(quickPick, async () => {
            await this._commandService.executeCommand(commandId);
          });
          if (!isClosed) {
            await refreshItems();
          }
          return;
        }
        isResolved = true;
        resolve(true);
        quickPick.hide();
      }));
      disposables.add(quickPick.onDidTriggerItemButton(async (e) => {
        const shouldRefresh = await this._handleButtonClick(quickPick, e, options);
        if (!isClosed && shouldRefresh) {
          await refreshItems();
        }
      }));
      disposables.add(quickPick.onDidHide(() => {
        if (!quickPick.ignoreFocusOut) {
          disposables.dispose();
          isClosed = true;
          if (!isResolved) {
            resolve(false);
            isResolved = true;
          }
        }
      }));
      quickPick.show();
    });
  }
};
PromptFilePickers = __decorateClass([
  __decorateParam(0, IQuickInputService),
  __decorateParam(1, IOpenerService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IDialogService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IPromptsService),
  __decorateParam(7, ILabelService),
  __decorateParam(8, IProductService)
], PromptFilePickers);
export {
  PromptFilePickers
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9wcm9tcHRTeW50YXgvcGlja2Vycy9wcm9tcHRGaWxlUGlja2Vycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZSwgSUV4dGVuc2lvblByb21wdFBhdGgsIElQcm9tcHRQYXRoLCBJUHJvbXB0c1NlcnZpY2UsIFByb21wdHNTdG9yYWdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lLCBleHRVcmksIGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IGdldENsZWFuUHJvbXB0TmFtZSwgZ2V0U2tpbGxGb2xkZXJOYW1lIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9jb25maWcvcHJvbXB0RmlsZUxvY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRzVHlwZSwgSU5TVFJVQ1RJT05TX0RPQ1VNRU5UQVRJT05fVVJMLCBBR0VOVF9ET0NVTUVOVEFUSU9OX1VSTCwgUFJPTVBUX0RPQ1VNRU5UQVRJT05fVVJMLCBTS0lMTF9ET0NVTUVOVEFUSU9OX1VSTCwgSE9PS19ET0NVTUVOVEFUSU9OX1VSTCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgTkVXX1BST01QVF9DT01NQU5EX0lELCBORVdfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSUQsIE5FV19BR0VOVF9DT01NQU5EX0lELCBORVdfU0tJTExfQ09NTUFORF9JRCB9IGZyb20gJy4uL25ld1Byb21wdEZpbGVBY3Rpb25zLmpzJztcbmltcG9ydCB7IEdFTkVSQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19DT01NQU5EX0lELCBHRU5FUkFURV9PTl9ERU1BTkRfSU5TVFJVQ1RJT05TX0NPTU1BTkRfSUQsIEdFTkVSQVRFX1BST01QVF9DT01NQU5EX0lELCBHRU5FUkFURV9TS0lMTF9DT01NQU5EX0lELCBHRU5FUkFURV9BR0VOVF9DT01NQU5EX0lEIH0gZnJvbSAnLi4vLi4vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJS2V5TW9kcywgSVF1aWNrSW5wdXRCdXR0b24sIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGljaywgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tJdGVtQnV0dG9uRXZlbnQsIElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IGFza0ZvclByb21wdEZpbGVOYW1lIH0gZnJvbSAnLi9hc2tGb3JQcm9tcHROYW1lLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGFza0ZvclByb21wdFNvdXJjZUZvbGRlciB9IGZyb20gJy4vYXNrRm9yUHJvbXB0U291cmNlRm9sZGVyLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJvbXB0RmlsZVJld3JpdGVyIH0gZnJvbSAnLi4vcHJvbXB0RmlsZVJld3JpdGVyLmpzJztcbmltcG9ydCB7IGlzT3JnYW5pemF0aW9uUHJvbXB0RmlsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvdXRpbHMvcHJvbXB0c1NlcnZpY2VVdGlscy5qcyc7XG5pbXBvcnQgeyBhc3NlcnROZXZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5cbi8qKlxuICogT3B0aW9ucyBmb3IgdGhlIHtAbGluayBhc2tUb1NlbGVjdEluc3RydWN0aW9uc30gZnVuY3Rpb24uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlbGVjdE9wdGlvbnMge1xuXG5cdC8qKlxuXHQgKiBUaGUgdGV4dCBzaG93cyBhcyBwbGFjZWhvbGRlciBpbiB0aGUgc2VsZWN0aW9uIGRpYWxvZy5cblx0ICovXG5cdHJlYWRvbmx5IHBsYWNlaG9sZGVyOiBzdHJpbmc7XG5cblx0LyoqXG5cdCAqIFByb21wdCByZXNvdXJjZSBgVVJJYCB0byBhdHRhY2ggdG8gdGhlIGNoYXQgaW5wdXQsIGlmIGFueS5cblx0ICogSWYgcHJvdmlkZWQgdGhlIHJlc291cmNlIHdpbGwgYmUgcHJlLXNlbGVjdGVkIGluIHRoZSBwcm9tcHQgcGlja2VyIGRpYWxvZyxcblx0ICogb3RoZXJ3aXNlIHRoZSBkaWFsb2cgd2lsbCBzaG93IHRoZSBwcm9tcHRzIGxpc3Qgd2l0aG91dCBhbnkgcHJlLXNlbGVjdGlvbi5cblx0ICovXG5cdHJlYWRvbmx5IHJlc291cmNlPzogVVJJO1xuXG5cdHJlYWRvbmx5IHR5cGU6IFByb21wdHNUeXBlO1xuXG5cdHJlYWRvbmx5IG9wdGlvbk5ldz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG9wdGlvbkVkaXQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBvcHRpb25EZWxldGU/OiBib29sZWFuO1xuXHRyZWFkb25seSBvcHRpb25SZW5hbWU/OiBib29sZWFuO1xuXHRyZWFkb25seSBvcHRpb25Db3B5PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgb3B0aW9uVmlzaWJpbGl0eT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG9wdGlvblJ1bj86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNlbGVjdFByb21wdFJlc3VsdCB7XG5cdC8qKlxuXHQgKiBUaGUgc2VsZWN0ZWQgcHJvbXB0IGZpbGUuXG5cdCAqL1xuXHRyZWFkb25seSBwcm9tcHRGaWxlOiBVUkk7XG5cblx0LyoqXG5cdCAqIFRoZSBrZXkgbW9kaWZpZXJzIHRoYXQgd2VyZSBwcmVzc2VkIHdoZW4gdGhlIHByb21wdCB3YXMgc2VsZWN0ZWQuXG5cdCAqL1xuXHRyZWFkb25seSBrZXlNb2RzOiBJS2V5TW9kcztcbn1cblxuLyoqXG4gKiBCdXR0b24gdGhhdCBvcGVucyB0aGUgZG9jdW1lbnRhdGlvbi5cbiAqL1xuZnVuY3Rpb24gbmV3SGVscEJ1dHRvbih0eXBlOiBQcm9tcHRzVHlwZSk6IElRdWlja0lucHV0QnV0dG9uICYgeyBoZWxwVVJJOiBVUkkgfSB7XG5cdGNvbnN0IGljb25DbGFzcyA9IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnF1ZXN0aW9uKTtcblx0c3dpdGNoICh0eXBlKSB7XG5cdFx0Y2FzZSBQcm9tcHRzVHlwZS5wcm9tcHQ6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnaGVscC5wcm9tcHQnLCBcIlNob3cgaGVscCBvbiBwcm9tcHQgZmlsZXNcIiksXG5cdFx0XHRcdGhlbHBVUkk6IFVSSS5wYXJzZShQUk9NUFRfRE9DVU1FTlRBVElPTl9VUkwpLFxuXHRcdFx0XHRpY29uQ2xhc3Ncblx0XHRcdH07XG5cdFx0Y2FzZSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnM6XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnaGVscC5pbnN0cnVjdGlvbnMnLCBcIlNob3cgaGVscCBvbiBpbnN0cnVjdGlvbiBmaWxlc1wiKSxcblx0XHRcdFx0aGVscFVSSTogVVJJLnBhcnNlKElOU1RSVUNUSU9OU19ET0NVTUVOVEFUSU9OX1VSTCksXG5cdFx0XHRcdGljb25DbGFzc1xuXHRcdFx0fTtcblx0XHRjYXNlIFByb21wdHNUeXBlLmFnZW50OlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2hlbHAuYWdlbnQnLCBcIlNob3cgaGVscCBvbiBjdXN0b20gYWdlbnQgZmlsZXNcIiksXG5cdFx0XHRcdGhlbHBVUkk6IFVSSS5wYXJzZShBR0VOVF9ET0NVTUVOVEFUSU9OX1VSTCksXG5cdFx0XHRcdGljb25DbGFzc1xuXHRcdFx0fTtcblx0XHRjYXNlIFByb21wdHNUeXBlLnNraWxsOlxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2hlbHAuc2tpbGwnLCBcIlNob3cgaGVscCBvbiBza2lsbCBmaWxlc1wiKSxcblx0XHRcdFx0aGVscFVSSTogVVJJLnBhcnNlKFNLSUxMX0RPQ1VNRU5UQVRJT05fVVJMKSxcblx0XHRcdFx0aWNvbkNsYXNzXG5cdFx0XHR9O1xuXHRcdGNhc2UgUHJvbXB0c1R5cGUuaG9vazpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdoZWxwLmhvb2snLCBcIlNob3cgaGVscCBvbiBob29rIGZpbGVzXCIpLFxuXHRcdFx0XHRoZWxwVVJJOiBVUkkucGFyc2UoSE9PS19ET0NVTUVOVEFUSU9OX1VSTCksXG5cdFx0XHRcdGljb25DbGFzc1xuXHRcdFx0fTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc0hlbHBCdXR0b24oYnV0dG9uOiBJUXVpY2tJbnB1dEJ1dHRvbik6IGJ1dHRvbiBpcyBJUXVpY2tJbnB1dEJ1dHRvbiAmIHsgaGVscFVSSTogVVJJIH0ge1xuXHRyZXR1cm4gKDx7IGhlbHBVUkk6IFVSSSB9PmJ1dHRvbikuaGVscFVSSSAhPT0gdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgSVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cblx0dHlwZTogJ2l0ZW0nO1xuXG5cdC8qKlxuXHQgKiBUaGUgVVJJIG9mIHRoZSBwcm9tcHQgZmlsZS5cblx0ICovXG5cdHByb21wdEZpbGVVcmk/OiBVUkk7XG5cblx0LyoqXG5cdCAqIFRoZSBjb21tYW5kIElEIHRvIGV4ZWN1dGUgd2hlbiB0aGlzIGl0ZW0gaXMgc2VsZWN0ZWQuXG5cdCAqL1xuXHRjb21tYW5kSWQ/OiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGlzUHJvbXB0RmlsZUl0ZW0oaXRlbTogSVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKTogaXRlbSBpcyBJUHJvbXB0UGlja2VyUXVpY2tQaWNrSXRlbSAmIHsgcHJvbXB0RmlsZVVyaTogVVJJIH0ge1xuXHRyZXR1cm4gaXRlbS50eXBlID09PSAnaXRlbScgJiYgISFpdGVtLnByb21wdEZpbGVVcmk7XG59XG5cbi8qKlxuICogVHlwZSBndWFyZCBmb3IgZXh0ZW5zaW9uIHByb21wdCBwYXRocy5cbiAqL1xuZnVuY3Rpb24gaXNFeHRlbnNpb25Qcm9tcHRQYXRoKHByb21wdDogSVByb21wdFBhdGgpOiBwcm9tcHQgaXMgSUV4dGVuc2lvblByb21wdFBhdGgge1xuXHRyZXR1cm4gcHJvbXB0LnN0b3JhZ2UgPT09IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbiAmJiAhIXByb21wdC5leHRlbnNpb247XG59XG5cbnR5cGUgSVByb21wdFF1aWNrUGljayA9IElRdWlja1BpY2s8SVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9PjtcblxuLyoqXG4gKiBBIHF1aWNrIHBpY2sgaXRlbSB0aGF0IHN0YXJ0cyB0aGUgJ05ldyBQcm9tcHQgRmlsZScgY29tbWFuZC5cbiAqL1xuY29uc3QgTkVXX1BST01QVF9GSUxFX09QVElPTjogSVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW0gPSB7XG5cdHR5cGU6ICdpdGVtJyxcblx0bGFiZWw6IGAkKHBsdXMpICR7bG9jYWxpemUoXG5cdFx0J2NvbW1hbmRzLm5ldy1wcm9tcHRmaWxlLnNlbGVjdC1kaWFsb2cubGFiZWwnLFxuXHRcdCdOZXcgcHJvbXB0IGZpbGUuLi4nXG5cdCl9YCxcblx0cGlja2FibGU6IGZhbHNlLFxuXHRhbHdheXNTaG93OiB0cnVlLFxuXHRidXR0b25zOiBbbmV3SGVscEJ1dHRvbihQcm9tcHRzVHlwZS5wcm9tcHQpXSxcblx0Y29tbWFuZElkOiBORVdfUFJPTVBUX0NPTU1BTkRfSUQsXG59O1xuXG4vKipcbiAqIEEgcXVpY2sgcGljayBpdGVtIHRoYXQgc3RhcnRzIHRoZSAnTmV3IEluc3RydWN0aW9ucyBGaWxlJyBjb21tYW5kLlxuICovXG5jb25zdCBORVdfSU5TVFJVQ1RJT05TX0ZJTEVfT1BUSU9OOiBJUHJvbXB0UGlja2VyUXVpY2tQaWNrSXRlbSA9IHtcblx0dHlwZTogJ2l0ZW0nLFxuXHRsYWJlbDogYCQocGx1cykgJHtsb2NhbGl6ZShcblx0XHQnY29tbWFuZHMubmV3LWluc3RydWN0aW9uc2ZpbGUuc2VsZWN0LWRpYWxvZy5sYWJlbCcsXG5cdFx0J05ldyBpbnN0cnVjdGlvbiBmaWxlLi4uJyxcblx0KX1gLFxuXHRwaWNrYWJsZTogZmFsc2UsXG5cdGFsd2F5c1Nob3c6IHRydWUsXG5cdGJ1dHRvbnM6IFtuZXdIZWxwQnV0dG9uKFByb21wdHNUeXBlLmluc3RydWN0aW9ucyldLFxuXHRjb21tYW5kSWQ6IE5FV19JTlNUUlVDVElPTlNfQ09NTUFORF9JRCxcbn07XG5cbi8qKlxuICogQSBxdWljayBwaWNrIGl0ZW0gdGhhdCBzdGFydHMgdGhlICdHZW5lcmF0ZSBBZ2VudCBJbnN0cnVjdGlvbnMnIGNvbW1hbmQuXG4gKi9cbmNvbnN0IEdFTkVSQVRFX0FHRU5UX0lOU1RSVUNUSU9OU19PUFRJT046IElQcm9tcHRQaWNrZXJRdWlja1BpY2tJdGVtID0ge1xuXHR0eXBlOiAnaXRlbScsXG5cdGxhYmVsOiBgJChzcGFya2xlKSAke2xvY2FsaXplKFxuXHRcdCdjb21tYW5kcy5nZW5lcmF0ZS1hZ2VudC1pbnN0cnVjdGlvbnMuc2VsZWN0LWRpYWxvZy5sYWJlbCcsXG5cdFx0J0dlbmVyYXRlIGFnZW50IGluc3RydWN0aW9ucy4uLicsXG5cdCl9YCxcblx0cGlja2FibGU6IGZhbHNlLFxuXHRhbHdheXNTaG93OiB0cnVlLFxuXHRidXR0b25zOiBbbmV3SGVscEJ1dHRvbihQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpXSxcblx0Y29tbWFuZElkOiBHRU5FUkFURV9BR0VOVF9JTlNUUlVDVElPTlNfQ09NTUFORF9JRCxcbn07XG5cbi8qKlxuICogQSBxdWljayBwaWNrIGl0ZW0gdGhhdCBzdGFydHMgdGhlICdHZW5lcmF0ZSBPbi1kZW1hbmQgSW5zdHJ1Y3Rpb25zJyBjb21tYW5kLlxuICovXG5jb25zdCBHRU5FUkFURV9PTl9ERU1BTkRfSU5TVFJVQ1RJT05TX09QVElPTjogSVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW0gPSB7XG5cdHR5cGU6ICdpdGVtJyxcblx0bGFiZWw6IGAkKHNwYXJrbGUpICR7bG9jYWxpemUoXG5cdFx0J2NvbW1hbmRzLmdlbmVyYXRlLW9uLWRlbWFuZC1pbnN0cnVjdGlvbnMuc2VsZWN0LWRpYWxvZy5sYWJlbCcsXG5cdFx0J0dlbmVyYXRlIG9uLWRlbWFuZCBpbnN0cnVjdGlvbnMuLi4nLFxuXHQpfWAsXG5cdHBpY2thYmxlOiBmYWxzZSxcblx0YWx3YXlzU2hvdzogdHJ1ZSxcblx0YnV0dG9uczogW25ld0hlbHBCdXR0b24oUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKV0sXG5cdGNvbW1hbmRJZDogR0VORVJBVEVfT05fREVNQU5EX0lOU1RSVUNUSU9OU19DT01NQU5EX0lELFxufTtcblxuLyoqXG4gKiBBIHF1aWNrIHBpY2sgaXRlbSB0aGF0IHN0YXJ0cyB0aGUgJ05ldyBBZ2VudCBGaWxlJyBjb21tYW5kLlxuICovXG5jb25zdCBORVdfQUdFTlRfRklMRV9PUFRJT046IElQcm9tcHRQaWNrZXJRdWlja1BpY2tJdGVtID0ge1xuXHR0eXBlOiAnaXRlbScsXG5cdGxhYmVsOiBgJChwbHVzKSAke2xvY2FsaXplKFxuXHRcdCdjb21tYW5kcy5uZXctYWdlbnRmaWxlLnNlbGVjdC1kaWFsb2cubGFiZWwnLFxuXHRcdCdDcmVhdGUgbmV3IGN1c3RvbSBhZ2VudC4uLicsXG5cdCl9YCxcblx0cGlja2FibGU6IGZhbHNlLFxuXHRhbHdheXNTaG93OiB0cnVlLFxuXHRidXR0b25zOiBbbmV3SGVscEJ1dHRvbihQcm9tcHRzVHlwZS5hZ2VudCldLFxuXHRjb21tYW5kSWQ6IE5FV19BR0VOVF9DT01NQU5EX0lELFxufTtcblxuLyoqXG4gKiBBIHF1aWNrIHBpY2sgaXRlbSB0aGF0IHN0YXJ0cyB0aGUgJ05ldyBTa2lsbCcgY29tbWFuZC5cbiAqL1xuY29uc3QgTkVXX1NLSUxMX0ZJTEVfT1BUSU9OOiBJUHJvbXB0UGlja2VyUXVpY2tQaWNrSXRlbSA9IHtcblx0dHlwZTogJ2l0ZW0nLFxuXHRsYWJlbDogYCQocGx1cykgJHtsb2NhbGl6ZShcblx0XHQnY29tbWFuZHMubmV3LXNraWxsLnNlbGVjdC1kaWFsb2cubGFiZWwnLFxuXHRcdCdOZXcgc2tpbGwuLi4nLFxuXHQpfWAsXG5cdHBpY2thYmxlOiBmYWxzZSxcblx0YWx3YXlzU2hvdzogdHJ1ZSxcblx0YnV0dG9uczogW25ld0hlbHBCdXR0b24oUHJvbXB0c1R5cGUuc2tpbGwpXSxcblx0Y29tbWFuZElkOiBORVdfU0tJTExfQ09NTUFORF9JRCxcbn07XG5cbi8qKlxuICogQSBxdWljayBwaWNrIGl0ZW0gdGhhdCBnZW5lcmF0ZXMgYSBwcm9tcHQgZmlsZSB3aXRoIGFnZW50LlxuICovXG5jb25zdCBHRU5FUkFURV9QUk9NUFRfT1BUSU9OOiBJUHJvbXB0UGlja2VyUXVpY2tQaWNrSXRlbSA9IHtcblx0dHlwZTogJ2l0ZW0nLFxuXHRsYWJlbDogYCQoc3BhcmtsZSkgJHtsb2NhbGl6ZShcblx0XHQnY29tbWFuZHMuZ2VuZXJhdGUtcHJvbXB0LnNlbGVjdC1kaWFsb2cubGFiZWwnLFxuXHRcdCdHZW5lcmF0ZSBwcm9tcHQuLi4nLFxuXHQpfWAsXG5cdHBpY2thYmxlOiBmYWxzZSxcblx0YWx3YXlzU2hvdzogdHJ1ZSxcblx0YnV0dG9uczogW25ld0hlbHBCdXR0b24oUHJvbXB0c1R5cGUucHJvbXB0KV0sXG5cdGNvbW1hbmRJZDogR0VORVJBVEVfUFJPTVBUX0NPTU1BTkRfSUQsXG59O1xuXG4vKipcbiAqIEEgcXVpY2sgcGljayBpdGVtIHRoYXQgZ2VuZXJhdGVzIGEgc2tpbGwgd2l0aCBhZ2VudC5cbiAqL1xuY29uc3QgR0VORVJBVEVfU0tJTExfT1BUSU9OOiBJUHJvbXB0UGlja2VyUXVpY2tQaWNrSXRlbSA9IHtcblx0dHlwZTogJ2l0ZW0nLFxuXHRsYWJlbDogYCQoc3BhcmtsZSkgJHtsb2NhbGl6ZShcblx0XHQnY29tbWFuZHMuZ2VuZXJhdGUtc2tpbGwuc2VsZWN0LWRpYWxvZy5sYWJlbCcsXG5cdFx0J0dlbmVyYXRlIHNraWxsLi4uJyxcblx0KX1gLFxuXHRwaWNrYWJsZTogZmFsc2UsXG5cdGFsd2F5c1Nob3c6IHRydWUsXG5cdGJ1dHRvbnM6IFtuZXdIZWxwQnV0dG9uKFByb21wdHNUeXBlLnNraWxsKV0sXG5cdGNvbW1hbmRJZDogR0VORVJBVEVfU0tJTExfQ09NTUFORF9JRCxcbn07XG5cbi8qKlxuICogQSBxdWljayBwaWNrIGl0ZW0gdGhhdCBnZW5lcmF0ZXMgYSBjdXN0b20gYWdlbnQgd2l0aCBhZ2VudC5cbiAqL1xuY29uc3QgR0VORVJBVEVfQUdFTlRfT1BUSU9OOiBJUHJvbXB0UGlja2VyUXVpY2tQaWNrSXRlbSA9IHtcblx0dHlwZTogJ2l0ZW0nLFxuXHRsYWJlbDogYCQoc3BhcmtsZSkgJHtsb2NhbGl6ZShcblx0XHQnY29tbWFuZHMuZ2VuZXJhdGUtYWdlbnQuc2VsZWN0LWRpYWxvZy5sYWJlbCcsXG5cdFx0J0dlbmVyYXRlIGFnZW50Li4uJyxcblx0KX1gLFxuXHRwaWNrYWJsZTogZmFsc2UsXG5cdGFsd2F5c1Nob3c6IHRydWUsXG5cdGJ1dHRvbnM6IFtuZXdIZWxwQnV0dG9uKFByb21wdHNUeXBlLmFnZW50KV0sXG5cdGNvbW1hbmRJZDogR0VORVJBVEVfQUdFTlRfQ09NTUFORF9JRCxcbn07XG5cbi8qKlxuICogQnV0dG9uIHRoYXQgb3BlbnMgYSBwcm9tcHQgZmlsZSBpbiB0aGUgZWRpdG9yLlxuICovXG5jb25zdCBFRElUX0JVVFRPTjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdHRvb2x0aXA6IGxvY2FsaXplKCdvcGVuJywgXCJPcGVuIGluIEVkaXRvclwiKSxcblx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5maWxlQ29kZSksXG59O1xuXG4vKipcbiAqIEJ1dHRvbiB0aGF0IGRlbGV0ZXMgYSBwcm9tcHQgZmlsZS5cbiAqL1xuY29uc3QgREVMRVRFX0JVVFRPTjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdHRvb2x0aXA6IGxvY2FsaXplKCdkZWxldGUnLCBcIkRlbGV0ZVwiKSxcblx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi50cmFzaCksXG59O1xuXG4vKipcbiAqIEJ1dHRvbiB0aGF0IHJlbmFtZXMgYSBwcm9tcHQgZmlsZS5cbiAqL1xuY29uc3QgUkVOQU1FX0JVVFRPTjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdHRvb2x0aXA6IGxvY2FsaXplKCdyZW5hbWUnLCBcIk1vdmUgYW5kL29yIFJlbmFtZVwiKSxcblx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5yZXBsYWNlKSxcbn07XG5cbi8qKlxuICogQnV0dG9uIHRoYXQgY29waWVzIGEgcHJvbXB0IGZpbGUuXG4gKi9cbmNvbnN0IENPUFlfQlVUVE9OOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0dG9vbHRpcDogbG9jYWxpemUoJ21ha2VBQ29weScsIFwiTWFrZSBhIENvcHlcIiksXG5cdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY29weSksXG59O1xuXG4vKipcbiAqIEJ1dHRvbiB0aGF0IHNldHMgYSBwcm9tcHQgZmlsZSB0byBiZSB2aXNpYmxlLlxuICovXG5jb25zdCBNQUtFX1ZJU0lCTEVfQlVUVE9OOiBJUXVpY2tJbnB1dEJ1dHRvbiA9IHtcblx0dG9vbHRpcDogbG9jYWxpemUoJ21ha2VWaXNpYmxlJywgXCJIaWRkZW4gZnJvbSBjaGF0IHZpZXcgYWdlbnQgcGlja2VyLiBDbGljayB0byBzaG93LlwiKSxcblx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5leWVDbG9zZWQpLFxuXHRhbHdheXNWaXNpYmxlOiB0cnVlLFxufTtcblxuLyoqXG4gKiBCdXR0b24gdGhhdCBzZXRzIGEgcHJvbXB0IGZpbGUgdG8gYmUgaW52aXNpYmxlLlxuICovXG5jb25zdCBNQUtFX0lOVklTSUJMRV9CVVRUT046IElRdWlja0lucHV0QnV0dG9uID0ge1xuXHR0b29sdGlwOiBsb2NhbGl6ZSgnbWFrZUludmlzaWJsZScsIFwiU2hvd24gaW4gY2hhdCB2aWV3IGFnZW50IHBpY2tlci4gQ2xpY2sgdG8gaGlkZS5cIiksXG5cdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZXllKSxcbn07XG5cbmNvbnN0IFJVTl9JTl9DSEFUX0JVVFRPTjogSVF1aWNrSW5wdXRCdXR0b24gPSB7XG5cdHRvb2x0aXA6IGxvY2FsaXplKCdydW5JbkNoYXQnLCBcIlJ1biBpbiBDaGF0IFZpZXdcIiksXG5cdGljb25DbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24ucGxheSksXG59O1xuXG5leHBvcnQgY2xhc3MgUHJvbXB0RmlsZVBpY2tlcnMge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3F1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFTZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9tcHRzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0LyoqXG5cdCAqIFNob3dzIHRoZSBwcm9tcHQgZmlsZSBzZWxlY3Rpb24gZGlhbG9nIHRvIHRoZSB1c2VyIHRoYXQgYWxsb3dzIHRvIHJ1biBhIHByb21wdCBmaWxlKHMpLlxuXHQgKlxuXHQgKiBJZiB7QGxpbmsgSVNlbGVjdE9wdGlvbnMucmVzb3VyY2UgcmVzb3VyY2V9IGlzIHByb3ZpZGVkLCB0aGUgZGlhbG9nIHdpbGwgaGF2ZVxuXHQgKiB0aGUgcmVzb3VyY2UgcHJlLXNlbGVjdGVkIGluIHRoZSBwcm9tcHRzIGxpc3QuXG5cdCAqL1xuXHRhc3luYyBzZWxlY3RQcm9tcHRGaWxlKG9wdGlvbnM6IElTZWxlY3RPcHRpb25zKTogUHJvbWlzZTxJU2VsZWN0UHJvbXB0UmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjb25zdCBxdWlja1BpY2s6IElQcm9tcHRRdWlja1BpY2sgPSB0aGlzLl9xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW0+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KTtcblx0XHRxdWlja1BpY2suYnVzeSA9IHRydWU7XG5cdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3NlYXJjaGluZycsICdTZWFyY2hpbmcgZmlsZSBzeXN0ZW0uLi4nKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBmaWxlT3B0aW9ucyA9IGF3YWl0IHRoaXMuX2NyZWF0ZVByb21wdFBpY2tJdGVtcyhvcHRpb25zLCBjdHMudG9rZW4pO1xuXHRcdFx0Y29uc3QgYWN0aXZlSXRlbSA9IG9wdGlvbnMucmVzb3VyY2UgJiYgZmlsZU9wdGlvbnMuZmluZChmID0+IGYudHlwZSA9PT0gJ2l0ZW0nICYmIGV4dFVyaS5pc0VxdWFsKGYucHJvbXB0RmlsZVVyaSwgb3B0aW9ucy5yZXNvdXJjZSkpIGFzIElQcm9tcHRQaWNrZXJRdWlja1BpY2tJdGVtIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGFjdGl2ZUl0ZW0pIHtcblx0XHRcdFx0cXVpY2tQaWNrLmFjdGl2ZUl0ZW1zID0gW2FjdGl2ZUl0ZW1dO1xuXHRcdFx0fVxuXHRcdFx0cXVpY2tQaWNrLnBsYWNlaG9sZGVyID0gb3B0aW9ucy5wbGFjZWhvbGRlcjtcblx0XHRcdHF1aWNrUGljay5tYXRjaE9uRGVzY3JpcHRpb24gPSB0cnVlO1xuXHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gZmlsZU9wdGlvbnM7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHF1aWNrUGljay5idXN5ID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPElTZWxlY3RQcm9tcHRSZXN1bHQgfCB1bmRlZmluZWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdGxldCBpc1Jlc29sdmVkID0gZmFsc2U7XG5cdFx0XHRsZXQgaXNDbG9zZWQgPSBmYWxzZTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljayk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoY3RzKTtcblxuXHRcdFx0Y29uc3QgcmVmcmVzaEl0ZW1zID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBhY3RpdmUgPSBxdWlja1BpY2suYWN0aXZlSXRlbXM7XG5cdFx0XHRcdGNvbnN0IG5ld0l0ZW1zID0gYXdhaXQgdGhpcy5fY3JlYXRlUHJvbXB0UGlja0l0ZW1zKG9wdGlvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRxdWlja1BpY2suaXRlbXMgPSBuZXdJdGVtcztcblx0XHRcdFx0cXVpY2tQaWNrLmFjdGl2ZUl0ZW1zID0gYWN0aXZlO1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gaGFuZGxlIHRoZSBwcm9tcHQgYGFjY2VwdGAgZXZlbnRcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRBY2NlcHQoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB7IHNlbGVjdGVkSXRlbXMgfSA9IHF1aWNrUGljaztcblx0XHRcdFx0Y29uc3QgeyBrZXlNb2RzIH0gPSBxdWlja1BpY2s7XG5cblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRJdGVtID0gc2VsZWN0ZWRJdGVtc1swXTtcblx0XHRcdFx0aWYgKGlzUHJvbXB0RmlsZUl0ZW0oc2VsZWN0ZWRJdGVtKSkge1xuXHRcdFx0XHRcdHJlc29sdmUoeyBwcm9tcHRGaWxlOiBzZWxlY3RlZEl0ZW0ucHJvbXB0RmlsZVVyaSwga2V5TW9kczogeyAuLi5rZXlNb2RzIH0gfSk7XG5cdFx0XHRcdFx0aXNSZXNvbHZlZCA9IHRydWU7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKHNlbGVjdGVkSXRlbS5jb21tYW5kSWQpIHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKHNlbGVjdGVkSXRlbS5jb21tYW5kSWQpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHF1aWNrUGljay5oaWRlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIGhhbmRsZSB0aGUgYGJ1dHRvbiBjbGlja2AgZXZlbnQgb24gYSBsaXN0IGl0ZW0gKGVkaXQsIGRlbGV0ZSwgZXRjLilcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRUcmlnZ2VySXRlbUJ1dHRvbihhc3luYyBlID0+IHtcblx0XHRcdFx0Y29uc3Qgc2hvdWxkUmVmcmVzaCA9IGF3YWl0IHRoaXMuX2hhbmRsZUJ1dHRvbkNsaWNrKHF1aWNrUGljaywgZSwgb3B0aW9ucyk7XG5cdFx0XHRcdGlmICghaXNDbG9zZWQgJiYgc2hvdWxkUmVmcmVzaCkge1xuXHRcdFx0XHRcdGF3YWl0IHJlZnJlc2hJdGVtcygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2sub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0aWYgKCFxdWlja1BpY2suaWdub3JlRm9jdXNPdXQpIHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0aXNDbG9zZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGlmICghaXNSZXNvbHZlZCkge1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0aXNSZXNvbHZlZCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIGZpbmFsbHksIHJldmVhbCB0aGUgZGlhbG9nXG5cdFx0XHRxdWlja1BpY2suc2hvdygpO1xuXHRcdH0pO1xuXHR9XG5cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVQcm9tcHRQaWNrSXRlbXMob3B0aW9uczogSVNlbGVjdE9wdGlvbnMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8KElQcm9tcHRQaWNrZXJRdWlja1BpY2tJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcilbXT4ge1xuXHRcdGNvbnN0IGJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbXTtcblx0XHRpZiAob3B0aW9ucy50eXBlID09PSBQcm9tcHRzVHlwZS5wcm9tcHQgJiYgb3B0aW9ucy5vcHRpb25SdW4gIT09IGZhbHNlKSB7XG5cdFx0XHRidXR0b25zLnB1c2goUlVOX0lOX0NIQVRfQlVUVE9OKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMub3B0aW9uRWRpdCAhPT0gZmFsc2UpIHtcblx0XHRcdGJ1dHRvbnMucHVzaChFRElUX0JVVFRPTik7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLm9wdGlvbkNvcHkgIT09IGZhbHNlKSB7XG5cdFx0XHRidXR0b25zLnB1c2goQ09QWV9CVVRUT04pO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5vcHRpb25SZW5hbWUgIT09IGZhbHNlKSB7XG5cdFx0XHRidXR0b25zLnB1c2goUkVOQU1FX0JVVFRPTik7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zLm9wdGlvbkRlbGV0ZSAhPT0gZmFsc2UpIHtcblx0XHRcdGJ1dHRvbnMucHVzaChERUxFVEVfQlVUVE9OKTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0OiAoSVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdID0gW107XG5cdFx0aWYgKG9wdGlvbnMub3B0aW9uTmV3ICE9PSBmYWxzZSkge1xuXHRcdFx0cmVzdWx0LnB1c2goLi4udGhpcy5fZ2V0TmV3SXRlbXMob3B0aW9ucy50eXBlKSk7XG5cdFx0fVxuXG5cdFx0bGV0IGdldFZpc2liaWxpdHk6IChwOiBJUHJvbXB0UGF0aCkgPT4gYm9vbGVhbiB8IHVuZGVmaW5lZCA9ICgpID0+IHVuZGVmaW5lZDtcblx0XHRpZiAob3B0aW9ucy5vcHRpb25WaXNpYmlsaXR5KSB7XG5cdFx0XHRjb25zdCBkaXNhYmxlZCA9IHRoaXMuX3Byb21wdHNTZXJ2aWNlLmdldERpc2FibGVkUHJvbXB0RmlsZXMob3B0aW9ucy50eXBlKTtcblx0XHRcdGdldFZpc2liaWxpdHkgPSBwID0+ICFkaXNhYmxlZC5oYXMocC51cmkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNvcnRCeUxhYmVsID0gKGl0ZW1zOiBJUHJvbXB0UGlja2VyUXVpY2tQaWNrSXRlbVtdKTogSVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW1bXSA9PiBpdGVtcy5zb3J0KChhLCBiKSA9PiBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCkpO1xuXG5cdFx0Y29uc3QgbG9jYWxzID0gYXdhaXQgdGhpcy5fcHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZShvcHRpb25zLnR5cGUsIFByb21wdHNTdG9yYWdlLmxvY2FsLCB0b2tlbik7XG5cdFx0aWYgKGxvY2Fscy5sZW5ndGgpIHtcblx0XHRcdHJlc3VsdC5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnc2VwYXJhdG9yLndvcmtzcGFjZScsIFwiV29ya3NwYWNlXCIpIH0pO1xuXHRcdFx0cmVzdWx0LnB1c2goLi4uc29ydEJ5TGFiZWwoYXdhaXQgUHJvbWlzZS5hbGwobG9jYWxzLm1hcChsID0+IHRoaXMuX2NyZWF0ZVByb21wdFBpY2tJdGVtKGwsIGJ1dHRvbnMsIGdldFZpc2liaWxpdHkobCksIHRva2VuKSkpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQWdlbnQgaW5zdHJ1Y3Rpb24gZmlsZXMgKGNvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kIGFuZCBBR0VOVFMubWQpIGFyZSBhZGRlZCBoZXJlIGFuZCBub3QgaW5jbHVkZWQgaW4gdGhlIG91dHB1dCBvZlxuXHRcdC8vIGxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2UoKSBiZWNhdXNlIHRoYXQgZnVuY3Rpb24gb25seSBoYW5kbGVzICouaW5zdHJ1Y3Rpb25zLm1kIGZpbGVzICh1bmRlciBgLmdpdGh1Yi9pbnN0cnVjdGlvbnMvYCwgZXRjLilcblx0XHRsZXQgYWdlbnRJbnN0cnVjdGlvbkZpbGVzOiBJUHJvbXB0UGF0aFtdID0gW107XG5cdFx0aWYgKG9wdGlvbnMudHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKSB7XG5cdFx0XHRjb25zdCBhZ2VudEluc3RydWN0aW9uVXJpcyA9IGF3YWl0IHRoaXMuX3Byb21wdHNTZXJ2aWNlLmxpc3RBZ2VudEluc3RydWN0aW9ucyh0b2tlbik7XG5cdFx0XHRhZ2VudEluc3RydWN0aW9uRmlsZXMgPSBhZ2VudEluc3RydWN0aW9uVXJpcy5tYXAoYWdlbnRJbnN0cnVjdGlvbkZpbGUgPT4ge1xuXHRcdFx0XHRjb25zdCBmb2xkZXJOYW1lID0gdGhpcy5fbGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGRpcm5hbWUoYWdlbnRJbnN0cnVjdGlvbkZpbGUudXJpKSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRcdFx0Ly8gRG9uJ3Qgc2hvdyB0aGUgZm9sZGVyIHBhdGggZm9yIGZpbGVzIHVuZGVyIC5naXRodWIgZm9sZGVyIChuYW1lbHksIGNvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kKSBzaW5jZSB0aGF0IGlzIG9ubHkgZGVmaW5lZCBvbmNlIHBlciByZXBvLlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHVyaTogYWdlbnRJbnN0cnVjdGlvbkZpbGUudXJpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBhZ2VudEluc3RydWN0aW9uRmlsZS50eXBlICE9PSBBZ2VudEluc3RydWN0aW9uRmlsZVR5cGUuY29waWxvdEluc3RydWN0aW9uc01kID8gZm9sZGVyTmFtZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCxcblx0XHRcdFx0XHR0eXBlOiBvcHRpb25zLnR5cGVcblx0XHRcdFx0fSBzYXRpc2ZpZXMgSVByb21wdFBhdGg7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0aWYgKGFnZW50SW5zdHJ1Y3Rpb25GaWxlcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGFnZW50QnV0dG9ucyA9IGJ1dHRvbnMuZmlsdGVyKGIgPT4gYiAhPT0gUkVOQU1FX0JVVFRPTik7XG5cdFx0XHRyZXN1bHQucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ3NlcGFyYXRvci53b3Jrc3BhY2UtYWdlbnQtaW5zdHJ1Y3Rpb25zJywgXCJBZ2VudCBJbnN0cnVjdGlvbnNcIikgfSk7XG5cdFx0XHRyZXN1bHQucHVzaCguLi5zb3J0QnlMYWJlbChhd2FpdCBQcm9taXNlLmFsbChhZ2VudEluc3RydWN0aW9uRmlsZXMubWFwKGwgPT4gdGhpcy5fY3JlYXRlUHJvbXB0UGlja0l0ZW0obCwgYWdlbnRCdXR0b25zLCBnZXRWaXNpYmlsaXR5KGwpLCB0b2tlbikpKSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dHMgPSAoYXdhaXQgdGhpcy5fcHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZShvcHRpb25zLnR5cGUsIFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbiwgdG9rZW4pKS5maWx0ZXIoaXNFeHRlbnNpb25Qcm9tcHRQYXRoKTtcblx0XHRpZiAoZXh0cy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IGV4dEJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbXTtcblx0XHRcdGlmIChvcHRpb25zLnR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdCAmJiBvcHRpb25zLm9wdGlvblJ1biAhPT0gZmFsc2UpIHtcblx0XHRcdFx0ZXh0QnV0dG9ucy5wdXNoKFJVTl9JTl9DSEFUX0JVVFRPTik7XG5cdFx0XHR9XG5cdFx0XHRpZiAob3B0aW9ucy5vcHRpb25FZGl0ICE9PSBmYWxzZSkge1xuXHRcdFx0XHRleHRCdXR0b25zLnB1c2goRURJVF9CVVRUT04pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG9wdGlvbnMub3B0aW9uQ29weSAhPT0gZmFsc2UpIHtcblx0XHRcdFx0ZXh0QnV0dG9ucy5wdXNoKENPUFlfQlVUVE9OKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZ3JvdXBlZEV4dHMgPSBuZXcgTWFwPHN0cmluZywgSVByb21wdFBhdGhbXT4oKTtcblx0XHRcdGZvciAoY29uc3QgZXh0IG9mIGV4dHMpIHtcblx0XHRcdFx0Y29uc3QgZ3JvdXBMYWJlbCA9IHRoaXMuX2dldEV4dGVuc2lvbkdyb3VwTGFiZWwoZXh0KTtcblx0XHRcdFx0aWYgKCFncm91cGVkRXh0cy5oYXMoZ3JvdXBMYWJlbCkpIHtcblx0XHRcdFx0XHRncm91cGVkRXh0cy5zZXQoZ3JvdXBMYWJlbCwgW10pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGdyb3VwZWRFeHRzLmdldChncm91cExhYmVsKSEucHVzaChleHQpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzb3J0ZWRHcm91cGVkRXh0cyA9IEFycmF5LmZyb20oZ3JvdXBlZEV4dHMuZW50cmllcygpKS5zb3J0KChhLCBiKSA9PiBhWzBdLmxvY2FsZUNvbXBhcmUoYlswXSkpO1xuXHRcdFx0Zm9yIChjb25zdCBbZ3JvdXBMYWJlbCwgZ3JvdXBFeHRzXSBvZiBzb3J0ZWRHcm91cGVkRXh0cykge1xuXHRcdFx0XHRyZXN1bHQucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogZ3JvdXBMYWJlbCB9KTtcblx0XHRcdFx0cmVzdWx0LnB1c2goLi4uc29ydEJ5TGFiZWwoYXdhaXQgUHJvbWlzZS5hbGwoZ3JvdXBFeHRzLm1hcChlID0+IHRoaXMuX2NyZWF0ZVByb21wdFBpY2tJdGVtKGUsIGV4dEJ1dHRvbnMsIGdldFZpc2liaWxpdHkoZSksIHRva2VuKSkpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHVzZXJzID0gYXdhaXQgdGhpcy5fcHJvbXB0c1NlcnZpY2UubGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZShvcHRpb25zLnR5cGUsIFByb21wdHNTdG9yYWdlLnVzZXIsIHRva2VuKTtcblx0XHRpZiAodXNlcnMubGVuZ3RoKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ3NlcGFyYXRvci51c2VyJywgXCJVc2VyIERhdGFcIikgfSk7XG5cdFx0XHRyZXN1bHQucHVzaCguLi5zb3J0QnlMYWJlbChhd2FpdCBQcm9taXNlLmFsbCh1c2Vycy5tYXAodSA9PiB0aGlzLl9jcmVhdGVQcm9tcHRQaWNrSXRlbSh1LCBidXR0b25zLCBnZXRWaXNpYmlsaXR5KHUpLCB0b2tlbikpKSkpO1xuXHRcdH1cblxuXHRcdC8vIFBsdWdpbiBmaWxlcyBhcmUgcmVhZC1vbmx5IHNvIG9ubHkgY29weSBidXR0b24gaXMgYXZhaWxhYmxlXG5cdFx0Y29uc3QgcGx1Z2lucyA9IGF3YWl0IHRoaXMuX3Byb21wdHNTZXJ2aWNlLmxpc3RQcm9tcHRGaWxlc0ZvclN0b3JhZ2Uob3B0aW9ucy50eXBlLCBQcm9tcHRzU3RvcmFnZS5wbHVnaW4sIHRva2VuKTtcblx0XHRpZiAocGx1Z2lucy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHBsdWdpbkJ1dHRvbnM6IElRdWlja0lucHV0QnV0dG9uW10gPSBbXTtcblx0XHRcdGlmIChvcHRpb25zLm9wdGlvbkNvcHkgIT09IGZhbHNlKSB7XG5cdFx0XHRcdHBsdWdpbkJ1dHRvbnMucHVzaChDT1BZX0JVVFRPTik7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHQucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogbG9jYWxpemUoJ3NlcGFyYXRvci5wbHVnaW5zJywgXCJQbHVnaW5zXCIpIH0pO1xuXHRcdFx0cmVzdWx0LnB1c2goLi4uc29ydEJ5TGFiZWwoYXdhaXQgUHJvbWlzZS5hbGwocGx1Z2lucy5tYXAocCA9PiB0aGlzLl9jcmVhdGVQcm9tcHRQaWNrSXRlbShwLCBwbHVnaW5CdXR0b25zLCBnZXRWaXNpYmlsaXR5KHApLCB0b2tlbikpKSkpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRFeHRlbnNpb25Hcm91cExhYmVsKGV4dFBhdGg6IElFeHRlbnNpb25Qcm9tcHRQYXRoKTogc3RyaW5nIHtcblx0XHRpZiAoaXNPcmdhbml6YXRpb25Qcm9tcHRGaWxlKGV4dFBhdGgudXJpLCBleHRQYXRoLmV4dGVuc2lvbi5pZGVudGlmaWVyLCB0aGlzLl9wcm9kdWN0U2VydmljZSkpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2VwYXJhdG9yLm9yZ2FuaXphdGlvbicsIFwiT3JnYW5pemF0aW9uXCIpO1xuXHRcdH1cblxuXHRcdC8vIEJ5IGRlZmF1bHQsIGV4dGVuc2lvbiBwcm9tcHQgZmlsZXMgYXJlIGdyb3VwZWQgdW5kZXIgXCJFeHRlbnNpb25zXCJcblx0XHRyZXR1cm4gbG9jYWxpemUoJ3NlcGFyYXRvci5leHRlbnNpb25zJywgXCJFeHRlbnNpb25zXCIpO1xuXG5cdH1cblxuXHRwcml2YXRlIF9nZXROZXdJdGVtcyh0eXBlOiBQcm9tcHRzVHlwZSk6IElQcm9tcHRQaWNrZXJRdWlja1BpY2tJdGVtW10ge1xuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5wcm9tcHQ6XG5cdFx0XHRcdHJldHVybiBbTkVXX1BST01QVF9GSUxFX09QVElPTiwgR0VORVJBVEVfUFJPTVBUX09QVElPTl07XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLmluc3RydWN0aW9uczpcblx0XHRcdFx0cmV0dXJuIFtORVdfSU5TVFJVQ1RJT05TX0ZJTEVfT1BUSU9OLCBHRU5FUkFURV9PTl9ERU1BTkRfSU5TVFJVQ1RJT05TX09QVElPTiwgR0VORVJBVEVfQUdFTlRfSU5TVFJVQ1RJT05TX09QVElPTl07XG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLmFnZW50OlxuXHRcdFx0XHRyZXR1cm4gW05FV19BR0VOVF9GSUxFX09QVElPTiwgR0VORVJBVEVfQUdFTlRfT1BUSU9OXTtcblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuc2tpbGw6XG5cdFx0XHRcdHJldHVybiBbTkVXX1NLSUxMX0ZJTEVfT1BUSU9OLCBHRU5FUkFURV9TS0lMTF9PUFRJT05dO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBVbmtub3duIHByb21wdCB0eXBlICcke3R5cGV9Jy5gKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jcmVhdGVQcm9tcHRQaWNrSXRlbShwcm9tcHRGaWxlOiBJUHJvbXB0UGF0aCwgYnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSB8IHVuZGVmaW5lZCwgdmlzaWJpbGl0eTogYm9vbGVhbiB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJvbXB0UGlja2VyUXVpY2tQaWNrSXRlbT4ge1xuXHRcdGNvbnN0IHBhcnNlZFByb21wdEZpbGUgPSBhd2FpdCB0aGlzLl9wcm9tcHRzU2VydmljZS5wYXJzZU5ldyhwcm9tcHRGaWxlLnVyaSwgdG9rZW4pLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0bGV0IHByb21wdE5hbWUgPSAocGFyc2VkUHJvbXB0RmlsZT8uaGVhZGVyPy5uYW1lID8/IHByb21wdEZpbGUubmFtZSkgfHwgKHByb21wdEZpbGUudHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwgPyBnZXRTa2lsbEZvbGRlck5hbWUocHJvbXB0RmlsZS51cmkpIDogZ2V0Q2xlYW5Qcm9tcHROYW1lKHByb21wdEZpbGUudXJpKSk7XG5cdFx0Y29uc3QgcHJvbXB0RGVzY3JpcHRpb24gPSBwYXJzZWRQcm9tcHRGaWxlPy5oZWFkZXI/LmRlc2NyaXB0aW9uID8/IHByb21wdEZpbGUuZGVzY3JpcHRpb247XG5cblx0XHRsZXQgdG9vbHRpcDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0c3dpdGNoIChwcm9tcHRGaWxlLnN0b3JhZ2UpIHtcblx0XHRcdGNhc2UgUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uOlxuXHRcdFx0XHR0b29sdGlwID0gcHJvbXB0RmlsZS5leHRlbnNpb24uZGlzcGxheU5hbWUgPz8gcHJvbXB0RmlsZS5leHRlbnNpb24uaWQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzU3RvcmFnZS5sb2NhbDpcblx0XHRcdFx0dG9vbHRpcCA9IHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChkaXJuYW1lKHByb21wdEZpbGUudXJpKSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFByb21wdHNTdG9yYWdlLnVzZXI6XG5cdFx0XHRcdHRvb2x0aXAgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzU3RvcmFnZS5wbHVnaW46XG5cdFx0XHRcdHRvb2x0aXAgPSBwcm9tcHRGaWxlLm5hbWU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBQcm9tcHRzU3RvcmFnZS5idWlsdEluOlxuXHRcdFx0XHR0b29sdGlwID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGFzc2VydE5ldmVyKHByb21wdEZpbGUpO1xuXHRcdH1cblx0XHRsZXQgaWNvbkNsYXNzOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHZpc2liaWxpdHkgPT09IGZhbHNlKSB7XG5cdFx0XHRidXR0b25zID0gKGJ1dHRvbnMgPz8gW10pLmNvbmNhdChNQUtFX1ZJU0lCTEVfQlVUVE9OKTtcblx0XHRcdHByb21wdE5hbWUgPSBsb2NhbGl6ZSgnaGlkZGVuTGFiZWxJbmZvJywgXCJ7MH0gKGhpZGRlbilcIiwgcHJvbXB0TmFtZSk7XG5cdFx0XHR0b29sdGlwID0gbG9jYWxpemUoJ2hpZGRlbkluQWdlbnRQaWNrZXInLCBcIkhpZGRlbiBmcm9tIGNoYXQgdmlldyBhZ2VudCBwaWNrZXJcIik7XG5cdFx0fSBlbHNlIGlmICh2aXNpYmlsaXR5ID09PSB0cnVlKSB7XG5cdFx0XHRidXR0b25zID0gKGJ1dHRvbnMgPz8gW10pLmNvbmNhdChNQUtFX0lOVklTSUJMRV9CVVRUT04pO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHByb21wdEZpbGUudXJpLnRvU3RyaW5nKCksXG5cdFx0XHR0eXBlOiAnaXRlbScsXG5cdFx0XHRsYWJlbDogcHJvbXB0TmFtZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBwcm9tcHREZXNjcmlwdGlvbixcblx0XHRcdGljb25DbGFzcyxcblx0XHRcdHRvb2x0aXAsXG5cdFx0XHRwcm9tcHRGaWxlVXJpOiBwcm9tcHRGaWxlLnVyaSxcblx0XHRcdGJ1dHRvbnMsXG5cdFx0fSBzYXRpc2ZpZXMgSVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW07XG5cdH1cblxuXG5cdHByaXZhdGUgYXN5bmMga2VlcFF1aWNrUGlja09wZW48VD4ocXVpY2tQaWNrOiBJUHJvbXB0UXVpY2tQaWNrLCB3b3JrOiAoKSA9PiBQcm9taXNlPFQ+KTogUHJvbWlzZTxUPiB7XG5cdFx0Y29uc3QgcHJldmlvdXNJZ25vcmVGb2N1c091dCA9IHF1aWNrUGljay5pZ25vcmVGb2N1c091dDtcblx0XHRxdWlja1BpY2suaWdub3JlRm9jdXNPdXQgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgd29yaygpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRxdWlja1BpY2suaWdub3JlRm9jdXNPdXQgPSBwcmV2aW91c0lnbm9yZUZvY3VzT3V0O1xuXHRcdFx0cXVpY2tQaWNrLnNob3coKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9oYW5kbGVCdXR0b25DbGljayhxdWlja1BpY2s6IElQcm9tcHRRdWlja1BpY2ssIGNvbnRleHQ6IElRdWlja1BpY2tJdGVtQnV0dG9uRXZlbnQ8SVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW0+LCBvcHRpb25zOiBJU2VsZWN0T3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHsgaXRlbSwgYnV0dG9uIH0gPSBjb250ZXh0O1xuXHRcdGlmICghaXNQcm9tcHRGaWxlSXRlbShpdGVtKSkge1xuXHRcdFx0aWYgKGlzSGVscEJ1dHRvbihidXR0b24pKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX29wZW5lclNlcnZpY2Uub3BlbihidXR0b24uaGVscFVSSSk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBidXR0b24gJyR7SlNPTi5zdHJpbmdpZnkoYnV0dG9uKX0nLmApO1xuXHRcdH1cblx0XHRjb25zdCB2YWx1ZSA9IGl0ZW0ucHJvbXB0RmlsZVVyaTtcblxuXHRcdGlmIChidXR0b24gPT09IFJVTl9JTl9DSEFUX0JVVFRPTikge1xuXHRcdFx0Y29uc3QgY29tbWFuZElkID0gcXVpY2tQaWNrLmtleU1vZHMuY3RybENtZCA9PT0gdHJ1ZVxuXHRcdFx0XHQ/ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucnVuLWluLW5ldy1jaGF0LnByb21wdC5jdXJyZW50J1xuXHRcdFx0XHQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQucnVuLnByb21wdC5jdXJyZW50Jztcblx0XHRcdGF3YWl0IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGNvbW1hbmRJZCwgdmFsdWUpO1xuXHRcdFx0cXVpY2tQaWNrLmhpZGUoKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBgZWRpdGAgYnV0dG9uIHdhcyBwcmVzc2VkLCBvcGVuIHRoZSBwcm9tcHQgZmlsZSBpbiBlZGl0b3Jcblx0XHRpZiAoYnV0dG9uID09PSBFRElUX0JVVFRPTikge1xuXHRcdFx0YXdhaXQgdGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKHZhbHVlKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBgY29weWAgYnV0dG9uIHdhcyBwcmVzc2VkLCBtYWtlIGEgY29weSBvZiB0aGUgcHJvbXB0IGZpbGUsIG9wZW4gdGhlIGNvcHkgaW4gZWRpdG9yXG5cdFx0aWYgKGJ1dHRvbiA9PT0gUkVOQU1FX0JVVFRPTiB8fCBidXR0b24gPT09IENPUFlfQlVUVE9OKSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5rZWVwUXVpY2tQaWNrT3BlbihxdWlja1BpY2ssIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY3VycmVudEZvbGRlciA9IGRpcm5hbWUodmFsdWUpO1xuXHRcdFx0XHRjb25zdCBpc01vdmUgPSBidXR0b24gPT09IFJFTkFNRV9CVVRUT04gJiYgcXVpY2tQaWNrLmtleU1vZHMuY3RybENtZDtcblx0XHRcdFx0Y29uc3QgbmV3Rm9sZGVyID0gYXdhaXQgdGhpcy5faW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFza0ZvclByb21wdFNvdXJjZUZvbGRlciwgb3B0aW9ucy50eXBlLCBjdXJyZW50Rm9sZGVyLCBpc01vdmUpO1xuXHRcdFx0XHRpZiAoIW5ld0ZvbGRlcikge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBuZXdOYW1lID0gYXdhaXQgdGhpcy5faW5zdGFTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFza0ZvclByb21wdEZpbGVOYW1lLCBvcHRpb25zLnR5cGUsIG5ld0ZvbGRlci51cmksIGl0ZW0ubGFiZWwpO1xuXHRcdFx0XHRpZiAoIW5ld05hbWUpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbmV3RmlsZSA9IGpvaW5QYXRoKG5ld0ZvbGRlci51cmksIG5ld05hbWUpO1xuXHRcdFx0XHRpZiAoaXNNb3ZlKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UubW92ZSh2YWx1ZSwgbmV3RmlsZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY29weSh2YWx1ZSwgbmV3RmlsZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhd2FpdCB0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4obmV3RmlsZSk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2luc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRGaWxlUmV3cml0ZXIpLm9wZW5BbmRSZXdyaXRlTmFtZShuZXdGaWxlLCBnZXRDbGVhblByb21wdE5hbWUobmV3RmlsZSksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gYGRlbGV0ZWAgYnV0dG9uIHdhcyBwcmVzc2VkLCBkZWxldGUgdGhlIHByb21wdCBmaWxlXG5cdFx0aWYgKGJ1dHRvbiA9PT0gREVMRVRFX0JVVFRPTikge1xuXHRcdFx0Ly8gZG9uJ3QgY2xvc2UgdGhlIG1haW4gcHJvbXB0IHNlbGVjdGlvbiBkaWFsb2cgYnkgdGhlIGNvbmZpcm1hdGlvbiBkaWFsb2dcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmtlZXBRdWlja1BpY2tPcGVuKHF1aWNrUGljaywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRcdGNvbnN0IGlzU2tpbGwgPSBvcHRpb25zLnR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsO1xuXHRcdFx0XHQvLyBGb3Igc2tpbGxzLCB1c2UgdGhlIHBhcmVudCBmb2xkZXIgbmFtZSBhcyB0aGUgZGlzcGxheSBuYW1lXG5cdFx0XHRcdC8vIHNpbmNlIHNraWxscyBhcmUgc3RydWN0dXJlZCBhcyA8c2tpbGxuYW1lPi9TS0lMTC5tZC5cblx0XHRcdFx0Y29uc3QgZmlsZW5hbWUgPSBpc1NraWxsID8gYmFzZW5hbWUoZGlybmFtZSh2YWx1ZSkpIDogaXRlbS5sYWJlbDtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IGlzU2tpbGxcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjb21tYW5kcy5wcm9tcHRzLnVzZS5zZWxlY3QtZGlhbG9nLmRlbGV0ZS1za2lsbC5jb25maXJtLm1lc3NhZ2UnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBkZWxldGUgc2tpbGwgJ3swfScgYW5kIGl0cyBmb2xkZXI/XCIsIGZpbGVuYW1lKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2NvbW1hbmRzLnByb21wdHMudXNlLnNlbGVjdC1kaWFsb2cuZGVsZXRlLXByb21wdC5jb25maXJtLm1lc3NhZ2UnLCBcIkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBkZWxldGUgJ3swfSc/XCIsIGZpbGVuYW1lKTtcblx0XHRcdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IHRoaXMuX2RpYWxvZ1NlcnZpY2UuY29uZmlybSh7IG1lc3NhZ2UgfSk7XG5cdFx0XHRcdC8vIGlmIHByb21wdCBkZWxldGlvbiB3YXMgbm90IGNvbmZpcm1lZCwgbm90aGluZyB0byBkb1xuXHRcdFx0XHRpZiAoIWNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEZvciBza2lsbHMsIGRlbGV0ZSB0aGUgcGFyZW50IGZvbGRlciAoZS5nLiAuZ2l0aHViL3NraWxscy9teS1za2lsbC8pXG5cdFx0XHRcdC8vIHNpbmNlIGVhY2ggc2tpbGwgaXMgYSBmb2xkZXIgY29udGFpbmluZyBTS0lMTC5tZC5cblx0XHRcdFx0Y29uc3QgZGVsZXRlVGFyZ2V0ID0gaXNTa2lsbCA/IGRpcm5hbWUodmFsdWUpIDogdmFsdWU7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmRlbChkZWxldGVUYXJnZXQsIHsgcmVjdXJzaXZlOiBpc1NraWxsLCB1c2VUcmFzaDogdHJ1ZSB9KTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9KTtcblxuXHRcdH1cblxuXHRcdGlmIChidXR0b24gPT09IE1BS0VfVklTSUJMRV9CVVRUT04gfHwgYnV0dG9uID09PSBNQUtFX0lOVklTSUJMRV9CVVRUT04pIHtcblx0XHRcdGNvbnN0IGRpc2FibGVkID0gdGhpcy5fcHJvbXB0c1NlcnZpY2UuZ2V0RGlzYWJsZWRQcm9tcHRGaWxlcyhvcHRpb25zLnR5cGUpO1xuXHRcdFx0aWYgKGJ1dHRvbiA9PT0gTUFLRV9WSVNJQkxFX0JVVFRPTikge1xuXHRcdFx0XHRkaXNhYmxlZC5kZWxldGUodmFsdWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGlzYWJsZWQuYWRkKHZhbHVlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Byb21wdHNTZXJ2aWNlLnNldERpc2FibGVkUHJvbXB0RmlsZXMob3B0aW9ucy50eXBlLCBkaXNhYmxlZCk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gYnV0dG9uICcke0pTT04uc3RyaW5naWZ5KGJ1dHRvbil9Jy5gKTtcblx0fVxuXG5cdC8vIC0tLSBFbmFibGVtZW50IENvbmZpZ3VyYXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBTaG93cyBhIG11bHRpLXNlbGVjdCAoY2hlY2tib3gpIHF1aWNrIHBpY2sgdG8gY29uZmlndXJlIHdoaWNoIHByb21wdCBmaWxlcyBvZiB0aGUgZ2l2ZW5cblx0ICogdHlwZSBhcmUgZW5hYmxlZC4gQ3VycmVudGx5IG9ubHkgdXNlZCBmb3IgYWdlbnQgcHJvbXB0IGZpbGVzLlxuXHQgKi9cblx0YXN5bmMgbWFuYWdlUHJvbXB0RmlsZXModHlwZTogUHJvbXB0c1R5cGUsIHBsYWNlaG9sZGVyOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjb25zdCBxdWlja1BpY2s6IElQcm9tcHRRdWlja1BpY2sgPSB0aGlzLl9xdWlja0lucHV0U2VydmljZS5jcmVhdGVRdWlja1BpY2s8SVByb21wdFBpY2tlclF1aWNrUGlja0l0ZW0+KHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9KTtcblx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBwbGFjZWhvbGRlcjtcblx0XHRxdWlja1BpY2suY2FuU2VsZWN0TWFueSA9IHRydWU7XG5cdFx0cXVpY2tQaWNrLm1hdGNoT25EZXNjcmlwdGlvbiA9IHRydWU7XG5cdFx0cXVpY2tQaWNrLnNvcnRCeUxhYmVsID0gZmFsc2U7XG5cdFx0cXVpY2tQaWNrLmJ1c3kgPSB0cnVlO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogSVNlbGVjdE9wdGlvbnMgPSB7XG5cdFx0XHRwbGFjZWhvbGRlcjogJycsXG5cdFx0XHR0eXBlLFxuXHRcdFx0b3B0aW9uTmV3OiB0cnVlLFxuXHRcdFx0b3B0aW9uRWRpdDogdHJ1ZSxcblx0XHRcdG9wdGlvbkRlbGV0ZTogdHJ1ZSxcblx0XHRcdG9wdGlvblJlbmFtZTogdHJ1ZSxcblx0XHRcdG9wdGlvbkNvcHk6IHRydWUsXG5cdFx0XHRvcHRpb25WaXNpYmlsaXR5OiBmYWxzZSxcblx0XHRcdG9wdGlvblJ1bjogZmFsc2Vcblx0XHR9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgdGhpcy5fY3JlYXRlUHJvbXB0UGlja0l0ZW1zKG9wdGlvbnMsIGN0cy50b2tlbik7XG5cdFx0XHRxdWlja1BpY2suaXRlbXMgPSBpdGVtcztcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cXVpY2tQaWNrLmJ1c3kgPSBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3IFByb21pc2U8Ym9vbGVhbj4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja1BpY2spO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGN0cyk7XG5cblx0XHRcdGxldCBpc0Nsb3NlZCA9IGZhbHNlO1xuXHRcdFx0bGV0IGlzUmVzb2x2ZWQgPSBmYWxzZTtcblxuXHRcdFx0Y29uc3QgcmVmcmVzaEl0ZW1zID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBhY3RpdmUgPSBxdWlja1BpY2suYWN0aXZlSXRlbXM7XG5cdFx0XHRcdGNvbnN0IG5ld0l0ZW1zID0gYXdhaXQgdGhpcy5fY3JlYXRlUHJvbXB0UGlja0l0ZW1zKG9wdGlvbnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRxdWlja1BpY2suaXRlbXMgPSBuZXdJdGVtcztcblx0XHRcdFx0cXVpY2tQaWNrLmFjdGl2ZUl0ZW1zID0gYWN0aXZlO1xuXHRcdFx0fTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrUGljay5vbkRpZEFjY2VwdChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNsaWNrZWRJdGVtID0gcXVpY2tQaWNrLmFjdGl2ZUl0ZW1zO1xuXHRcdFx0XHRpZiAoY2xpY2tlZEl0ZW0ubGVuZ3RoID09PSAxICYmIGNsaWNrZWRJdGVtWzBdLmNvbW1hbmRJZCkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1hbmRJZCA9IGNsaWNrZWRJdGVtWzBdLmNvbW1hbmRJZDtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmtlZXBRdWlja1BpY2tPcGVuKHF1aWNrUGljaywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZElkKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRpZiAoIWlzQ2xvc2VkKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCByZWZyZXNoSXRlbXMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlzUmVzb2x2ZWQgPSB0cnVlO1xuXHRcdFx0XHRyZXNvbHZlKHRydWUpO1xuXHRcdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oYXN5bmMgZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNob3VsZFJlZnJlc2ggPSBhd2FpdCB0aGlzLl9oYW5kbGVCdXR0b25DbGljayhxdWlja1BpY2ssIGUsIG9wdGlvbnMpO1xuXHRcdFx0XHRpZiAoIWlzQ2xvc2VkICYmIHNob3VsZFJlZnJlc2gpIHtcblx0XHRcdFx0XHRhd2FpdCByZWZyZXNoSXRlbXMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdGlmICghcXVpY2tQaWNrLmlnbm9yZUZvY3VzT3V0KSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdGlzQ2xvc2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRpZiAoIWlzUmVzb2x2ZWQpIHtcblx0XHRcdFx0XHRcdHJlc29sdmUoZmFsc2UpO1xuXHRcdFx0XHRcdFx0aXNSZXNvbHZlZCA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdHF1aWNrUGljay5zaG93KCk7XG5cdFx0fSk7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsMEJBQTZELGlCQUFpQixzQkFBc0I7QUFDN0csU0FBUyxVQUFVLFNBQVMsUUFBUSxnQkFBZ0I7QUFDcEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FB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QUFxRTtBQUFBLEVBQzFFLE1BQU07QUFBQSxFQUNOLE9BQU8sY0FBYztBQUFBLElBQ3BCO0FBQUEsSUFDQTtBQUFBLEVBQ0QsQ0FBQztBQUFBLEVBQ0QsVUFBVTtBQUFBLEVBQ1YsWUFBWTtBQUFBLEVBQ1osU0FBUyxDQUFDLGNBQWMsWUFBWSxZQUFZLENBQUM7QUFBQSxFQUNqRCxXQUFXO0FBQ1o7QUFLQSxNQUFNLHdCQUFvRDtBQUFBLEVBQ3pELE1BQU07QUFBQSxFQUNOLE9BQU8sV0FBVztBQUFBLElBQ2pCO0FBQUEsSUFDQTtBQUFBLEVBQ0QsQ0FBQztBQUFBLEVBQ0QsVUFBVTtBQUFBLEVBQ1YsWUFBWTtBQUFBLEVBQ1osU0FBUyxDQUFDLGNBQWMsWUFBWSxLQUFLLENBQUM7QUFBQSxFQUMxQyxXQUFXO0FBQ1o7QUFLQSxNQUFNLHdCQUFvRDtBQUFBLEVBQ3pELE1BQU07QUFBQSxFQUNOLE9BQU8sV0FBVztBQUFBLElBQ2pCO0FBQUEsSUFDQTtBQUFBLEVBQ0QsQ0FBQztBQUFBLEVBQ0QsVUFBVTtBQUFBLEVBQ1YsWUFBWTtBQUFBLEVBQ1osU0FBUyxDQUFDLGNBQWMsWUFBWSxLQUFLLENBQUM7QUFBQSxFQUMxQyxXQUFXO0FBQ1o7QUFLQSxNQUFNLHlCQUFxRDtBQUFBLEVBQzFELE1BQU07QUFBQSxFQUNOLE9BQU8sY0FBYztBQUFBLElBQ3BCO0FBQUEsSUFDQTtBQUFBLEVBQ0QsQ0FBQztBQUFBLEVBQ0QsVUFBVTtBQUFBLEVBQ1YsWUFBWTtBQUFBLEVBQ1osU0FBUyxDQUFDLGNBQWMsWUFBWSxNQUFNLENBQUM7QUFBQSxFQUMzQyxXQUFXO0FBQ1o7QUFLQSxNQUFNLHdCQUFvRDtBQUFBLEVBQ3pELE1BQU07QUFBQSxFQUNOLE9BQU8sY0FBYztBQUFBLElBQ3BCO0FBQUEsSUFDQTtBQUFBLEVBQ0QsQ0FBQztBQUFBLEVBQ0QsVUFBVTtBQUFBLEVBQ1YsWUFBWTtBQUFBLEVBQ1osU0FBUyxDQUFDLGNBQWMsWUFBWSxLQUFLLENBQUM7QUFBQSxFQUMxQyxXQUFXO0FBQ1o7QUFLQSxNQUFNLHdC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
