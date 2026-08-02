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
import { isEmptyPattern, parse, splitGlobAware } from "../../../../../../base/common/glob.js";
import { Iterable } from "../../../../../../base/common/iterator.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { localize } from "../../../../../../nls.js";
import { MarkerSeverity, MarkerTag } from "../../../../../../platform/markers/common/markers.js";
import { ChatMode, IChatModeService } from "../../chatModes.js";
import { ChatModeKind } from "../../constants.js";
import { ILanguageModelChatMetadata, ILanguageModelsService } from "../../languageModels.js";
import { ILanguageModelToolsService, SpecedToolAliases } from "../../tools/languageModelToolsService.js";
import { PromptsType, Target } from "../promptTypes.js";
import { parseCommaSeparatedList, PromptHeaderAttributes } from "../promptFileParser.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IPromptsService } from "../service/promptsService.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { AGENTS_SOURCE_FOLDER, CLAUDE_AGENTS_SOURCE_FOLDER, isInClaudeRulesFolder, isSkillFilename, LEGACY_MODE_FILE_EXTENSION, VALID_SKILL_NAME_REGEX } from "../config/promptFileLocations.js";
import { Lazy } from "../../../../../../base/common/lazy.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { dirname } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { HOOKS_BY_TARGET } from "../hookTypes.js";
import { GithubPromptHeaderAttributes } from "./promptFileAttributes.js";
import { ILogService } from "../../../../../../platform/log/common/log.js";
const MARKERS_OWNER_ID = "prompts-diagnostics-provider";
var PromptValidatorMarkerCode = /* @__PURE__ */ ((PromptValidatorMarkerCode2) => {
  PromptValidatorMarkerCode2["MissingGithubMcpServer"] = "promptValidator.missingGithubMcpServer";
  PromptValidatorMarkerCode2["MissingPlaywrightMcpServer"] = "promptValidator.missingPlaywrightMcpServer";
  PromptValidatorMarkerCode2["UnknownExtensionReference"] = "promptValidator.unknownExtensionReference";
  PromptValidatorMarkerCode2["UnknownMcpServerReference"] = "promptValidator.unknownMcpServerReference";
  PromptValidatorMarkerCode2["UnknownExtensionOrMcpServerReference"] = "promptValidator.unknownExtensionOrMcpServerReference";
  return PromptValidatorMarkerCode2;
})(PromptValidatorMarkerCode || {});
let PromptValidator = class {
  constructor(languageModelsService, languageModelToolsService, chatModeService, fileService, labelService, promptsService, logger, configurationService) {
    this.languageModelsService = languageModelsService;
    this.languageModelToolsService = languageModelToolsService;
    this.chatModeService = chatModeService;
    this.fileService = fileService;
    this.labelService = labelService;
    this.promptsService = promptsService;
    this.logger = logger;
    this.configurationService = configurationService;
  }
  async validate(promptAST, promptType, report) {
    promptAST.header?.errors.forEach((error) => report(toMarker(error.message, error.range, MarkerSeverity.Error)));
    const target = getTarget(promptType, promptAST.header ?? promptAST.uri);
    await this.validateHeader(promptAST, promptType, target, report);
    await this.validateBody(promptAST, target, report);
    await this.validateFileName(promptAST, promptType, report);
    await this.validateSkillAttributes(promptAST, promptType, report);
  }
  async validateFileName(promptAST, promptType, report) {
    if (promptType === PromptsType.agent && promptAST.uri.path.endsWith(LEGACY_MODE_FILE_EXTENSION)) {
      const location = this.promptsService.getAgentFileURIFromModeFile(promptAST.uri);
      if (location && await this.fileService.canCreateFile(location)) {
        report(toMarker(localize("promptValidator.chatModesRenamedToAgents", "Chat modes have been renamed to agents. Please move this file to {0}", location.toString()), new Range(1, 1, 1, 4), MarkerSeverity.Warning));
      } else {
        report(toMarker(localize("promptValidator.chatModesRenamedToAgentsNoMove", "Chat modes have been renamed to agents. Please move the file to {0}", AGENTS_SOURCE_FOLDER), new Range(1, 1, 1, 4), MarkerSeverity.Warning));
      }
    }
  }
  async validateSkillAttributes(promptAST, promptType, report) {
    if (promptType !== PromptsType.skill || !promptAST.header) {
      return;
    }
    const nameAttribute = promptAST.header.getAttribute(PromptHeaderAttributes.name);
    if (!nameAttribute) {
      report(toMarker(
        localize("promptValidator.skillNameMissing", "Skill should provide a name."),
        new Range(1, 1, 1, 4),
        MarkerSeverity.Warning
      ));
    } else if (nameAttribute.value.type === "scalar") {
      const skillName = nameAttribute.value.value.trim();
      if (skillName.length > 0) {
        if (!VALID_SKILL_NAME_REGEX.test(skillName)) {
          report(toMarker(
            localize("promptValidator.skillNameInvalidChars", "Skill name may only contain lowercase letters, numbers, and hyphens."),
            nameAttribute.value.range,
            MarkerSeverity.Error
          ));
        }
        const pathParts = promptAST.uri.path.split("/");
        const skillIndex = pathParts.findIndex((part) => isSkillFilename(part));
        if (skillIndex > 0) {
          const folderName = pathParts[skillIndex - 1];
          if (folderName && skillName !== folderName) {
            report(toMarker(
              localize("promptValidator.skillNameFolderMismatch", "The skill name '{0}' should match the folder name '{1}'.", skillName, folderName),
              nameAttribute.value.range,
              MarkerSeverity.Warning
            ));
          }
        }
      }
    }
    const descriptionAttribute = promptAST.header.getAttribute(PromptHeaderAttributes.description);
    if (!descriptionAttribute) {
      report(toMarker(
        localize("promptValidator.skillDescriptionMissing", "Skill should provide a description."),
        new Range(1, 1, 1, 4),
        MarkerSeverity.Warning
      ));
      if (promptAST.header.userInvocable === false) {
        const userInvocableAttr = promptAST.header.getAttribute(PromptHeaderAttributes.userInvocable);
        if (userInvocableAttr) {
          report(toMarker(
            localize("promptValidator.skillUserInvocableRequiresDescription", "A description is required when user-invocable is false, because the model needs a description to decide when to load the skill."),
            userInvocableAttr.value.range,
            MarkerSeverity.Error
          ));
        }
      }
      if (promptAST.header.disableModelInvocation === false) {
        const disableModelInvocationAttr = promptAST.header.getAttribute(PromptHeaderAttributes.disableModelInvocation);
        if (disableModelInvocationAttr) {
          report(toMarker(
            localize("promptValidator.skillModelInvocationRequiresDescription", "A description is required when model invocation is enabled, because the model needs a description to decide when to load the skill."),
            disableModelInvocationAttr.value.range,
            MarkerSeverity.Error
          ));
        }
      }
    }
    const contextAttribute = promptAST.header?.getAttribute(PromptHeaderAttributes.context);
    if (contextAttribute && contextAttribute.value.type === "scalar" && contextAttribute.value.value.trim() === "fork") {
      const skillToolEnabled = this.configurationService.getValue("github.copilot.chat.skillTool.enabled");
      if (!skillToolEnabled) {
        report(toMarker(
          localize("promptValidator.contextForkNotSupported", "The 'context: fork' attribute requires the skill tool to be enabled (github.copilot.chat.skillTool.enabled)."),
          contextAttribute.value.range,
          MarkerSeverity.Warning
        ));
      }
    }
  }
  async validateBody(promptAST, target, report) {
    const body = promptAST.body;
    if (!body) {
      return;
    }
    const fileReferenceChecks = [];
    for (const ref of body.fileReferences) {
      const resolved = body.resolveFilePath(ref.content);
      if (!resolved) {
        report(toMarker(localize("promptValidator.invalidFileReference", "Invalid file reference '{0}'.", ref.content), ref.range, MarkerSeverity.Warning));
        continue;
      }
      if (promptAST.uri.scheme === resolved.scheme) {
        fileReferenceChecks.push((async () => {
          try {
            const exists = await this.fileService.exists(resolved);
            if (!exists) {
              const loc = this.labelService.getUriLabel(resolved);
              report(toMarker(localize("promptValidator.fileNotFound", "File '{0}' not found at '{1}'.", ref.content, loc), ref.range, MarkerSeverity.Warning));
            }
          } catch (e) {
            this.logger.warn(`Error checking existence of file reference '${ref.content}' resolved to '${resolved.toString()}' in prompt file '${promptAST.uri.toString()}': ${e.message}`);
          }
        })());
      }
    }
    if (body.variableReferences.length && isVSCodeOrDefaultTarget(target)) {
      const headerTools = promptAST.header?.tools;
      const headerToolsMap = headerTools ? this.languageModelToolsService.toToolAndToolSetEnablementMap(headerTools, void 0) : void 0;
      const available = new Set(this.languageModelToolsService.getFullReferenceNames());
      const deprecatedNames = this.languageModelToolsService.getDeprecatedFullReferenceNames();
      for (const variable of body.variableReferences) {
        if (!available.has(variable.name)) {
          if (deprecatedNames.has(variable.name)) {
            const currentNames = deprecatedNames.get(variable.name);
            if (currentNames && currentNames.size > 0) {
              if (currentNames.size === 1) {
                const newName = Array.from(currentNames)[0];
                report(toMarker(localize("promptValidator.deprecatedVariableReference", "Tool or toolset '{0}' has been renamed, use '{1}' instead.", variable.name, newName), variable.range, MarkerSeverity.Info));
              } else {
                const newNames = Array.from(currentNames).sort((a, b) => a.localeCompare(b)).join(", ");
                report(toMarker(localize("promptValidator.deprecatedVariableReferenceMultipleNames", "Tool or toolset '{0}' has been renamed, use the following tools instead: {1}", variable.name, newNames), variable.range, MarkerSeverity.Info));
              }
            }
          } else {
            const missingGithubServerMarker = this.getMissingGithubMcpServerMarker(variable.name, variable.range);
            if (missingGithubServerMarker) {
              report(missingGithubServerMarker);
            } else {
              const missingPlaywrightServerMarker = this.getMissingPlaywrightMcpServerMarker(variable.name, variable.range);
              if (missingPlaywrightServerMarker) {
                report(missingPlaywrightServerMarker);
              } else {
                report(this.getUnknownToolMarker(variable.name, variable.range, true));
              }
            }
          }
        } else if (headerToolsMap) {
          const tool = this.languageModelToolsService.getToolByFullReferenceName(variable.name);
          if (tool && headerToolsMap.get(tool) === false) {
            report(toMarker(localize("promptValidator.disabledTool", "Tool or toolset '{0}' also needs to be enabled in the header.", variable.name), variable.range, MarkerSeverity.Warning));
          }
        }
      }
    }
    await Promise.all(fileReferenceChecks);
  }
  async validateHeader(promptAST, promptType, target, report) {
    const header = promptAST.header;
    if (!header) {
      return;
    }
    const attributes = header.attributes;
    this.checkForInvalidArguments(attributes, promptType, target, report);
    this.validateName(attributes, report);
    this.validateDescription(attributes, report);
    this.validateArgumentHint(attributes, report);
    switch (promptType) {
      case PromptsType.prompt: {
        const agent = await this.validateAgent(attributes, report);
        this.validateTools(attributes, agent?.kind ?? ChatModeKind.Agent, target, report);
        this.validateModel(attributes, agent?.kind ?? ChatModeKind.Agent, report);
        break;
      }
      case PromptsType.instructions:
        if (target === Target.Claude) {
          this.validatePaths(attributes, report);
        } else {
          this.validateApplyTo(attributes, report);
        }
        this.validateExcludeAgent(attributes, report);
        break;
      case PromptsType.agent: {
        this.validateTarget(attributes, report);
        this.validateInfer(attributes, report);
        this.validateUserInvocable(attributes, report);
        this.validateDisableModelInvocation(attributes, report);
        this.validateTools(attributes, ChatModeKind.Agent, target, report);
        this.validateHooks(attributes, target, report);
        if (isVSCodeOrDefaultTarget(target)) {
          this.validateModel(attributes, ChatModeKind.Agent, report);
          this.validateHandoffs(attributes, report);
          await this.validateAgentsAttribute(attributes, header, report);
          this.validateGithubPermissions(attributes, report);
        } else if (target === Target.Claude) {
          this.validateClaudeAttributes(attributes, report);
        } else if (target === Target.GitHubCopilot) {
          this.validateGithubPermissions(attributes, report);
        }
        break;
      }
      case PromptsType.skill:
        this.validateUserInvocable(attributes, report);
        this.validateDisableModelInvocation(attributes, report);
        break;
    }
  }
  checkForInvalidArguments(attributes, promptType, target, report) {
    const validAttributeNames = getValidAttributeNames(promptType, true, target);
    const validGithubCopilotAttributeNames = new Lazy(() => new Set(getValidAttributeNames(promptType, false, Target.GitHubCopilot)));
    for (const attribute of attributes) {
      if (!validAttributeNames.includes(attribute.key)) {
        const supportedNames = new Lazy(() => {
          const names = getValidAttributeNames(promptType, false, target);
          return names.sort().join(", ");
        });
        switch (promptType) {
          case PromptsType.prompt:
            report(toMarker(localize("promptValidator.unknownAttribute.prompt", "Attribute '{0}' is not supported in prompt files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
            break;
          case PromptsType.agent:
            if (target === Target.GitHubCopilot) {
              report(toMarker(localize("promptValidator.unknownAttribute.github-agent", "Attribute '{0}' is not supported in custom GitHub Copilot agent files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
            } else if (target === Target.Claude) {
            } else {
              if (validGithubCopilotAttributeNames.value.has(attribute.key)) {
                report(toMarker(localize("promptValidator.ignoredAttribute.vscode-agent", "Attribute '{0}' is ignored when running locally in VS Code.", attribute.key), attribute.range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
              } else {
                report(toMarker(localize("promptValidator.unknownAttribute.vscode-agent", "Attribute '{0}' is not supported in VS Code agent files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
              }
            }
            break;
          case PromptsType.instructions:
            if (target === Target.Claude) {
              report(toMarker(localize("promptValidator.unknownAttribute.rules", "Attribute '{0}' is not supported in rules files by VS Code agents. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
            } else {
              report(toMarker(localize("promptValidator.unknownAttribute.instructions", "Attribute '{0}' is not supported in instructions files. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
            }
            break;
          case PromptsType.skill:
            report(toMarker(localize("promptValidator.unknownAttribute.skill", "Attribute '{0}' is not supported by VS Code agents. Supported: {1}.", attribute.key, supportedNames.value), attribute.range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
            break;
        }
      }
    }
  }
  validateName(attributes, report) {
    const nameAttribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.name);
    if (!nameAttribute) {
      return;
    }
    if (nameAttribute.value.type !== "scalar") {
      report(toMarker(localize("promptValidator.nameMustBeString", "The 'name' attribute must be a string."), nameAttribute.range, MarkerSeverity.Error));
      return;
    }
    if (nameAttribute.value.value.trim().length === 0) {
      report(toMarker(localize("promptValidator.nameShouldNotBeEmpty", "The 'name' attribute must not be empty."), nameAttribute.value.range, MarkerSeverity.Error));
      return;
    }
  }
  validateDescription(attributes, report) {
    const descriptionAttribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.description);
    if (!descriptionAttribute) {
      return;
    }
    if (descriptionAttribute.value.type !== "scalar") {
      report(toMarker(localize("promptValidator.descriptionMustBeString", "The 'description' attribute must be a string."), descriptionAttribute.range, MarkerSeverity.Error));
      return;
    }
    if (descriptionAttribute.value.value.trim().length === 0) {
      report(toMarker(localize("promptValidator.descriptionShouldNotBeEmpty", "The 'description' attribute should not be empty."), descriptionAttribute.value.range, MarkerSeverity.Error));
      return;
    }
  }
  validateArgumentHint(attributes, report) {
    const argumentHintAttribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.argumentHint);
    if (!argumentHintAttribute) {
      return;
    }
    if (argumentHintAttribute.value.type !== "scalar") {
      report(toMarker(localize("promptValidator.argumentHintMustBeString", "The 'argument-hint' attribute must be a string."), argumentHintAttribute.range, MarkerSeverity.Error));
      return;
    }
    if (argumentHintAttribute.value.value.trim().length === 0) {
      report(toMarker(localize("promptValidator.argumentHintShouldNotBeEmpty", "The 'argument-hint' attribute should not be empty."), argumentHintAttribute.value.range, MarkerSeverity.Warning));
      return;
    }
  }
  validateModel(attributes, agentKind, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.model);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "scalar" && attribute.value.type !== "sequence") {
      report(toMarker(localize("promptValidator.modelMustBeStringOrArray", "The 'model' attribute must be a string or an array of strings."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    const modelNames = [];
    if (attribute.value.type === "scalar") {
      const modelName = attribute.value.value.trim();
      if (modelName.length === 0) {
        report(toMarker(localize("promptValidator.modelMustBeNonEmpty", "The 'model' attribute must be a non-empty string."), attribute.value.range, MarkerSeverity.Error));
        return;
      }
      modelNames.push([modelName, attribute.value.range]);
    } else if (attribute.value.type === "sequence") {
      if (attribute.value.items.length === 0) {
        report(toMarker(localize("promptValidator.modelArrayMustNotBeEmpty", "The 'model' array must not be empty."), attribute.value.range, MarkerSeverity.Error));
        return;
      }
      for (const item of attribute.value.items) {
        if (item.type !== "scalar") {
          report(toMarker(localize("promptValidator.modelArrayMustContainStrings", "The 'model' array must contain only strings."), item.range, MarkerSeverity.Error));
          return;
        }
        const modelName = item.value.trim();
        if (modelName.length === 0) {
          report(toMarker(localize("promptValidator.modelArrayItemMustBeNonEmpty", "Model names in the array must be non-empty strings."), item.range, MarkerSeverity.Error));
          return;
        }
        modelNames.push([modelName, item.range]);
      }
    }
    const languageModels = this.languageModelsService.getLanguageModelIds();
    if (languageModels.length === 0) {
      return;
    }
    for (const [modelName, range] of modelNames) {
      const modelMetadata = this.findModelByName(modelName);
      if (!modelMetadata) {
        report(toMarker(localize("promptValidator.modelNotFound", "Unknown model '{0}' will be ignored.", modelName), range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
      } else if (agentKind === ChatModeKind.Agent && !ILanguageModelChatMetadata.suitableForAgentMode(modelMetadata)) {
        report(toMarker(localize("promptValidator.modelNotSuited", "Model '{0}' is not suited for agent mode.", modelName), range, MarkerSeverity.Warning));
      }
    }
  }
  validateClaudeAttributes(attributes, report) {
    for (const claudeAttributeName in claudeAgentAttributes) {
      const claudeAttribute = claudeAgentAttributes[claudeAttributeName];
      const enumValues = claudeAttribute.enums;
      if (enumValues) {
        const attribute = attributes.find((attr) => attr.key === claudeAttributeName);
        if (!attribute) {
          continue;
        }
        if (attribute.value.type !== "scalar") {
          report(toMarker(localize("promptValidator.claude.attributeMustBeString", "The '{0}' attribute must be a string.", claudeAttributeName), attribute.value.range, MarkerSeverity.Error));
          continue;
        } else {
          const modelName = attribute.value.value.trim();
          if (enumValues.every((model) => model.name !== modelName)) {
            const validValues = enumValues.map((model) => model.name).join(", ");
            report(toMarker(localize("promptValidator.claude.attributeNotFound", "Unknown value '{0}', valid: {1}.", modelName, validValues), attribute.value.range, MarkerSeverity.Warning));
          }
        }
      }
    }
  }
  findModelByName(modelName) {
    const metadataAndId = this.languageModelsService.lookupLanguageModelByQualifiedName(modelName);
    if (metadataAndId && metadataAndId.metadata.isUserSelectable !== false) {
      return metadataAndId.metadata;
    }
    return void 0;
  }
  async validateAgent(attributes, report) {
    const agentAttribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.agent);
    const modeAttribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.mode);
    if (modeAttribute) {
      if (agentAttribute) {
        report(toMarker(localize("promptValidator.modeDeprecated", "The 'mode' attribute has been deprecated. The 'agent' attribute is used instead."), modeAttribute.range, MarkerSeverity.Warning, [MarkerTag.Deprecated]));
      } else {
        report(toMarker(localize("promptValidator.modeDeprecated.useAgent", "The 'mode' attribute has been deprecated. Please rename it to 'agent'."), modeAttribute.range, MarkerSeverity.Warning, [MarkerTag.Deprecated]));
      }
    }
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.agent) ?? modeAttribute;
    if (!attribute) {
      return void 0;
    }
    if (attribute.value.type !== "scalar") {
      report(toMarker(localize("promptValidator.attributeMustBeString", "The '{0}' attribute must be a string.", attribute.key), attribute.value.range, MarkerSeverity.Error));
      return void 0;
    }
    const agentValue = attribute.value.value;
    if (agentValue.trim().length === 0) {
      report(toMarker(localize("promptValidator.attributeMustBeNonEmpty", "The '{0}' attribute must be a non-empty string.", attribute.key), attribute.value.range, MarkerSeverity.Error));
      return void 0;
    }
    return await this.validateAgentValue(attribute.value, report);
  }
  async validateAgentValue(value, report) {
    const agents = await this.chatModeService.getLocalModes();
    const availableAgents = [];
    for (const agent of Iterable.concat(agents.builtin, agents.custom)) {
      if (agent.name.get() === value.value) {
        return agent;
      }
      availableAgents.push(agent.name.get());
    }
    const errorMessage = localize("promptValidator.agentNotFound", "Unknown agent '{0}'. Available agents: {1}.", value.value, availableAgents.join(", "));
    report(toMarker(errorMessage, value.range, MarkerSeverity.Warning));
    return void 0;
  }
  validateTools(attributes, agentKind, target, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.tools);
    if (!attribute) {
      return;
    }
    if (agentKind !== ChatModeKind.Agent) {
      report(toMarker(localize("promptValidator.toolsOnlyInAgent", "The 'tools' attribute is only supported when using agents. Attribute will be ignored."), attribute.range, MarkerSeverity.Warning));
    }
    let value = attribute.value;
    if (value.type === "scalar") {
      value = parseCommaSeparatedList(value);
    }
    if (value.type !== "sequence") {
      report(toMarker(localize("promptValidator.toolsMustBeArrayOrMap", "The 'tools' attribute must be an array or a comma separated string."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    if (target === Target.GitHubCopilot || target === Target.Claude) {
    } else {
      this.validateVSCodeTools(value, report);
    }
  }
  validateVSCodeTools(valueItem, report) {
    if (valueItem.items.length > 0) {
      const available = new Set(this.languageModelToolsService.getFullReferenceNames());
      const deprecatedNames = this.languageModelToolsService.getDeprecatedFullReferenceNames();
      for (const item of valueItem.items) {
        if (item.type !== "scalar") {
          report(toMarker(localize("promptValidator.eachToolMustBeString", "Each tool name in the 'tools' attribute must be a string."), item.range, MarkerSeverity.Error));
        } else if (item.value) {
          if (!available.has(item.value)) {
            const currentNames = deprecatedNames.get(item.value);
            if (currentNames) {
              if (currentNames?.size === 1) {
                const newName = Array.from(currentNames)[0];
                report(toMarker(localize("promptValidator.toolDeprecated", "Tool or toolset '{0}' has been renamed, use '{1}' instead.", item.value, newName), item.range, MarkerSeverity.Info, [MarkerTag.Deprecated]));
              } else {
                const newNames = Array.from(currentNames).sort((a, b) => a.localeCompare(b)).join(", ");
                report(toMarker(localize("promptValidator.toolDeprecatedMultipleNames", "Tool or toolset '{0}' has been renamed, use the following tools instead: {1}", item.value, newNames), item.range, MarkerSeverity.Info, [MarkerTag.Deprecated]));
              }
            } else {
              const missingGithubServerMarker = this.getMissingGithubMcpServerMarker(item.value, item.range);
              if (missingGithubServerMarker) {
                report(missingGithubServerMarker);
              } else {
                const missingPlaywrightServerMarker = this.getMissingPlaywrightMcpServerMarker(item.value, item.range);
                if (missingPlaywrightServerMarker) {
                  report(missingPlaywrightServerMarker);
                } else {
                  report(this.getUnknownToolMarker(item.value, item.range, false));
                }
              }
            }
          }
        }
      }
    }
  }
  getUnknownToolMarker(toolReferenceName, range, isVariableReference) {
    const splitBySlash = toolReferenceName.split("/");
    const slashCount = splitBySlash.length - 1;
    const hasExtensionLikeName = splitBySlash[0].includes(".");
    if (slashCount >= 2) {
      return toMarker(
        localize(
          "promptValidator.unknownMcpServerReference",
          "Unknown tool '{0}'. It is likely to be a missing MCP server, please ensure it is installed and enabled.",
          toolReferenceName
        ),
        range,
        MarkerSeverity.Hint,
        [MarkerTag.Unnecessary],
        "promptValidator.unknownMcpServerReference" /* UnknownMcpServerReference */
      );
    }
    if (hasExtensionLikeName) {
      return toMarker(
        localize(
          "promptValidator.unknownExtensionReference",
          "Unknown extension tool '{0}'. It is likely to be a missing extension, please ensure it is installed and enabled.",
          toolReferenceName
        ),
        range,
        MarkerSeverity.Hint,
        [MarkerTag.Unnecessary],
        "promptValidator.unknownExtensionReference" /* UnknownExtensionReference */
      );
    }
    if (isVariableReference) {
      return toMarker(
        localize(
          "promptValidator.unknownVariableReference",
          "Unknown tool or toolset '{0}'.",
          toolReferenceName
        ),
        range,
        MarkerSeverity.Hint,
        [MarkerTag.Unnecessary],
        "promptValidator.unknownExtensionOrMcpServerReference" /* UnknownExtensionOrMcpServerReference */
      );
    } else {
      return toMarker(
        localize(
          "promptValidator.unknownToolReference",
          "Unknown tool '{0}' will be ignored.",
          toolReferenceName
        ),
        range,
        MarkerSeverity.Hint,
        [MarkerTag.Unnecessary],
        "promptValidator.unknownExtensionOrMcpServerReference" /* UnknownExtensionOrMcpServerReference */
      );
    }
  }
  getMissingGithubMcpServerMarker(toolReferenceName, range) {
    if (toolReferenceName !== "github/*") {
      return void 0;
    }
    return toMarker(
      localize(
        "promptValidator.missingGithubMcpServer",
        "Tool alias '{0}' requires the GitHub MCP server. Enable the built-in server with setting 'github.copilot.chat.githubMcpServer.enabled' or install extension 'io.github.github/github-mcp-server' from Extensions (`@mcp github`).",
        toolReferenceName
      ),
      range,
      MarkerSeverity.Hint,
      [MarkerTag.Unnecessary],
      "promptValidator.missingGithubMcpServer" /* MissingGithubMcpServer */
    );
  }
  getMissingPlaywrightMcpServerMarker(toolReferenceName, range) {
    if (toolReferenceName !== "playwright/*") {
      return void 0;
    }
    return toMarker(
      localize(
        "promptValidator.missingPlaywrightMcpServer",
        "Tool alias '{0}' requires the Playwright MCP server. Install it from Extensions (`@mcp playwright`).",
        toolReferenceName
      ),
      range,
      MarkerSeverity.Hint,
      [MarkerTag.Unnecessary],
      "promptValidator.missingPlaywrightMcpServer" /* MissingPlaywrightMcpServer */
    );
  }
  validateApplyTo(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.applyTo);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "scalar") {
      report(toMarker(localize("promptValidator.applyToMustBeString", "The 'applyTo' attribute must be a string."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    const pattern = attribute.value.value;
    try {
      const patterns = splitGlobAware(pattern, ",");
      if (patterns.length === 0) {
        report(toMarker(localize("promptValidator.applyToMustBeValidGlob", "The 'applyTo' attribute must be a valid glob pattern."), attribute.value.range, MarkerSeverity.Error));
        return;
      }
      for (const pattern2 of patterns) {
        const globPattern = parse(pattern2);
        if (isEmptyPattern(globPattern)) {
          report(toMarker(localize("promptValidator.applyToMustBeValidGlob", "The 'applyTo' attribute must be a valid glob pattern."), attribute.value.range, MarkerSeverity.Error));
          return;
        }
      }
    } catch (_error) {
      report(toMarker(localize("promptValidator.applyToMustBeValidGlob", "The 'applyTo' attribute must be a valid glob pattern."), attribute.value.range, MarkerSeverity.Error));
    }
  }
  validatePaths(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.paths);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "sequence") {
      report(toMarker(localize("promptValidator.pathsMustBeArray", "The 'paths' attribute must be an array of glob patterns."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    for (const item of attribute.value.items) {
      if (item.type !== "scalar") {
        report(toMarker(localize("promptValidator.eachPathMustBeString", "Each entry in the 'paths' attribute must be a string."), item.range, MarkerSeverity.Error));
        continue;
      }
      const pattern = item.value.trim();
      if (pattern.length === 0) {
        report(toMarker(localize("promptValidator.pathMustBeNonEmpty", "Path entries must be non-empty glob patterns."), item.range, MarkerSeverity.Error));
        continue;
      }
      try {
        const globPattern = parse(pattern);
        if (isEmptyPattern(globPattern)) {
          report(toMarker(localize("promptValidator.pathMustBeValidGlob", "'{0}' is not a valid glob pattern.", pattern), item.range, MarkerSeverity.Error));
        }
      } catch (_error) {
        report(toMarker(localize("promptValidator.pathMustBeValidGlob", "'{0}' is not a valid glob pattern.", pattern), item.range, MarkerSeverity.Error));
      }
    }
  }
  validateExcludeAgent(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.excludeAgent);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "sequence" && attribute.value.type !== "scalar") {
      report(toMarker(localize("promptValidator.excludeAgentMustBeArray", "The 'excludeAgent' attribute must be an string or array."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
  }
  validateHooks(attributes, target, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.hooks);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "map") {
      report(toMarker(localize("promptValidator.hooksMustBeMap", "The 'hooks' attribute must be a map of hook event types to command arrays."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    const validHookNames = new Set(Object.keys(HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined]));
    for (const prop of attribute.value.properties) {
      if (!validHookNames.has(prop.key.value)) {
        report(toMarker(localize("promptValidator.unknownHookType", "Unknown hook event type '{0}'. Supported: {1}.", prop.key.value, Array.from(validHookNames).join(", ")), prop.key.range, MarkerSeverity.Warning));
      }
      if (prop.value.type !== "sequence") {
        report(toMarker(localize("promptValidator.hookValueMustBeArray", "Hook event '{0}' must have an array of command objects as its value.", prop.key.value), prop.value.range, MarkerSeverity.Error));
        continue;
      }
      for (const item of prop.value.items) {
        this.validateHookCommand(item, target, report);
      }
    }
  }
  validateHookCommand(item, target, report) {
    if (item.type !== "map") {
      report(toMarker(localize("promptValidator.hookCommandMustBeObject", "Each hook command must be an object."), item.range, MarkerSeverity.Error));
      return;
    }
    const hooksProperty = item.properties.find((p) => p.key.value === "hooks");
    if (hooksProperty) {
      for (const prop of item.properties) {
        if (prop.key.value !== "hooks" && prop.key.value !== "matcher") {
          report(toMarker(localize("promptValidator.unknownMatcherProperty", "Unknown property '{0}' in hook matcher.", prop.key.value), prop.key.range, MarkerSeverity.Warning));
        }
      }
      if (hooksProperty.value.type !== "sequence") {
        report(toMarker(localize("promptValidator.nestedHooksMustBeArray", "The 'hooks' property in a matcher must be an array of command objects."), hooksProperty.value.range, MarkerSeverity.Error));
        return;
      }
      for (const nestedItem of hooksProperty.value.items) {
        this.validateHookCommand(nestedItem, target, report);
      }
      return;
    }
    const isCopilotCli = target === Target.GitHubCopilot;
    const validCommandFields = isCopilotCli ? /* @__PURE__ */ new Set(["bash", "powershell"]) : /* @__PURE__ */ new Set(["command", "windows", "linux", "osx", "bash", "powershell"]);
    const validProperties = isCopilotCli ? /* @__PURE__ */ new Set(["type", "bash", "powershell", "cwd", "env", "timeoutSec"]) : /* @__PURE__ */ new Set(["type", "command", "windows", "linux", "osx", "bash", "powershell", "cwd", "env", "timeout"]);
    let hasType = false;
    let hasCommandField = false;
    for (const prop of item.properties) {
      const key = prop.key.value;
      if (!validProperties.has(key)) {
        report(toMarker(localize("promptValidator.unknownHookProperty", "Unknown property '{0}' in hook command.", key), prop.key.range, MarkerSeverity.Warning));
      }
      if (key === "type") {
        hasType = true;
        if (prop.value.type !== "scalar" || prop.value.value !== "command") {
          report(toMarker(localize("promptValidator.hookTypeMustBeCommand", "The 'type' property in a hook command must be 'command'."), prop.value.range, MarkerSeverity.Error));
        }
      } else if (validCommandFields.has(key)) {
        hasCommandField = true;
        if (prop.value.type !== "scalar" || prop.value.value.trim().length === 0) {
          report(toMarker(localize("promptValidator.hookCommandFieldMustBeNonEmptyString", "The '{0}' property in a hook command must be a non-empty string.", key), prop.value.range, MarkerSeverity.Error));
        }
      } else if (key === "cwd") {
        if (prop.value.type !== "scalar") {
          report(toMarker(localize("promptValidator.hookCwdMustBeString", "The 'cwd' property in a hook command must be a string."), prop.value.range, MarkerSeverity.Error));
        }
      } else if (key === "env") {
        if (prop.value.type !== "map") {
          report(toMarker(localize("promptValidator.hookEnvMustBeMap", "The 'env' property in a hook command must be a map of string values."), prop.value.range, MarkerSeverity.Error));
        } else {
          for (const envProp of prop.value.properties) {
            if (envProp.value.type !== "scalar") {
              report(toMarker(localize("promptValidator.hookEnvValueMustBeString", "Environment variable '{0}' must have a string value.", envProp.key.value), envProp.value.range, MarkerSeverity.Error));
            }
          }
        }
      } else if (key === "timeout" || key === "timeoutSec") {
        if (prop.value.type !== "scalar" || isNaN(Number(prop.value.value))) {
          report(toMarker(localize("promptValidator.hookTimeoutMustBeNumber", "The '{0}' property in a hook command must be a number.", key), prop.value.range, MarkerSeverity.Error));
        }
      }
    }
    if (!hasType) {
      report(toMarker(localize("promptValidator.hookMissingType", "Hook command is missing required property 'type'."), item.range, MarkerSeverity.Error));
    }
    if (!hasCommandField) {
      if (isCopilotCli) {
        report(toMarker(localize("promptValidator.hookMissingCopilotCommand", "Hook command must specify at least one of 'bash' or 'powershell'."), item.range, MarkerSeverity.Error));
      } else {
        report(toMarker(localize("promptValidator.hookMissingCommand", "Hook command must specify at least one of 'command', 'windows', 'linux', or 'osx'."), item.range, MarkerSeverity.Error));
      }
    }
  }
  validateHandoffs(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.handOffs);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "sequence") {
      report(toMarker(localize("promptValidator.handoffsMustBeArray", "The 'handoffs' attribute must be an array."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    const seenLabels = /* @__PURE__ */ new Map();
    for (const item of attribute.value.items) {
      if (item.type !== "map") {
        report(toMarker(localize("promptValidator.eachHandoffMustBeObject", "Each handoff in the 'handoffs' attribute must be an object with 'label', 'agent', 'prompt' and optional 'send'."), item.range, MarkerSeverity.Error));
        continue;
      }
      const required = /* @__PURE__ */ new Set(["label", "agent", "prompt"]);
      for (const prop of item.properties) {
        switch (prop.key.value) {
          case "label":
            if (prop.value.type !== "scalar" || prop.value.value.trim().length === 0) {
              report(toMarker(localize("promptValidator.handoffLabelMustBeNonEmptyString", "The 'label' property in a handoff must be a non-empty string."), prop.value.range, MarkerSeverity.Error));
            } else if (!/[a-zA-Z0-9]/.test(prop.value.value)) {
              report(toMarker(localize("promptValidator.handoffLabelMustContainAlphanumeric", "The 'label' property in a handoff must contain at least one alphanumeric character."), prop.value.range, MarkerSeverity.Error));
            }
            break;
          case "agent":
            if (prop.value.type !== "scalar" || prop.value.value.trim().length === 0) {
              report(toMarker(localize("promptValidator.handoffAgentMustBeNonEmptyString", "The 'agent' property in a handoff must be a non-empty string."), prop.value.range, MarkerSeverity.Error));
            } else {
              this.validateAgentValue(prop.value, report);
            }
            break;
          case "prompt":
            if (prop.value.type !== "scalar") {
              report(toMarker(localize("promptValidator.handoffPromptMustBeString", "The 'prompt' property in a handoff must be a string."), prop.value.range, MarkerSeverity.Error));
            }
            break;
          case "send":
            if (!isTrueOrFalse(prop.value)) {
              report(toMarker(localize("promptValidator.handoffSendMustBeBoolean", "The 'send' property in a handoff must be a boolean."), prop.value.range, MarkerSeverity.Error));
            }
            break;
          case "showContinueOn":
            if (!isTrueOrFalse(prop.value)) {
              report(toMarker(localize("promptValidator.handoffShowContinueOnMustBeBoolean", "The 'showContinueOn' property in a handoff must be a boolean."), prop.value.range, MarkerSeverity.Error));
            }
            break;
          case "model":
            if (prop.value.type !== "scalar") {
              report(toMarker(localize("promptValidator.handoffModelMustBeString", "The 'model' property in a handoff must be a string."), prop.value.range, MarkerSeverity.Error));
            }
            break;
          default:
            report(toMarker(localize("promptValidator.unknownHandoffProperty", "Unknown property '{0}' in handoff object. Supported properties are 'label', 'agent', 'prompt' and optional 'send', 'showContinueOn', 'model'.", prop.key.value), prop.value.range, MarkerSeverity.Warning));
        }
        required.delete(prop.key.value);
      }
      if (required.size > 0) {
        report(toMarker(localize("promptValidator.missingHandoffProperties", "Missing required properties {0} in handoff object.", Array.from(required).map((s) => `'${s}'`).join(", ")), item.range, MarkerSeverity.Error));
      }
      const labelProp = item.properties.find((p) => p.key.value === "label");
      if (labelProp?.value.type === "scalar") {
        const normalizedLabel = labelProp.value.value.toLowerCase();
        if (normalizedLabel && seenLabels.has(normalizedLabel)) {
          report(toMarker(localize("promptValidator.duplicateHandoffLabel", "Duplicate handoff label '{0}'. Each handoff must have a unique label.", labelProp.value.value), labelProp.value.range, MarkerSeverity.Error));
        } else if (normalizedLabel) {
          seenLabels.set(normalizedLabel, labelProp.value.range);
        }
      }
    }
  }
  validateInfer(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.infer);
    if (!attribute) {
      return;
    }
    report(toMarker(localize("promptValidator.inferDeprecated", "The 'infer' attribute is deprecated in favour of 'user-invocable' and 'disable-model-invocation'."), attribute.value.range, MarkerSeverity.Error));
  }
  validateTarget(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.target);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "scalar") {
      report(toMarker(localize("promptValidator.targetMustBeString", "The 'target' attribute must be a string."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    const targetValue = attribute.value.value.trim();
    if (targetValue.length === 0) {
      report(toMarker(localize("promptValidator.targetMustBeNonEmpty", "The 'target' attribute must be a non-empty string."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    const validTargets = ["github-copilot", "vscode"];
    if (!validTargets.includes(targetValue)) {
      report(toMarker(localize("promptValidator.targetInvalidValue", "The 'target' attribute must be one of: {0}.", validTargets.join(", ")), attribute.value.range, MarkerSeverity.Error));
    }
  }
  validateUserInvocable(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.userInvocable);
    if (!attribute) {
      return;
    }
    if (!isTrueOrFalse(attribute.value)) {
      report(toMarker(localize("promptValidator.userInvocableMustBeBoolean", "The 'user-invocable' attribute must be 'true' or 'false'."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
  }
  validateDisableModelInvocation(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.disableModelInvocation);
    if (!attribute) {
      return;
    }
    if (!isTrueOrFalse(attribute.value)) {
      report(toMarker(localize("promptValidator.disableModelInvocationMustBeBoolean", "The 'disable-model-invocation' attribute must be 'true' or 'false'."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
  }
  async validateAgentsAttribute(attributes, header, report) {
    const attribute = attributes.find((attr) => attr.key === PromptHeaderAttributes.agents);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "sequence") {
      report(toMarker(localize("promptValidator.agentsMustBeArray", "The 'agents' attribute must be an array."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    const agents = (await this.promptsService.getCustomAgents(CancellationToken.None)).filter((a) => a.enabled);
    const availableAgentNames = new Set(agents.map((agent) => agent.name));
    availableAgentNames.add(ChatMode.Agent.name.get());
    const agentNames = [];
    for (const item of attribute.value.items) {
      if (item.type !== "scalar") {
        report(toMarker(localize("promptValidator.eachAgentMustBeString", "Each agent name in the 'agents' attribute must be a string."), item.range, MarkerSeverity.Error));
      } else if (item.value) {
        agentNames.push(item.value);
        if (item.value !== "*" && !availableAgentNames.has(item.value)) {
          report(toMarker(localize("promptValidator.agentInAgentsNotFound", "Unknown agent '{0}' will be ignored. Available agents: {1}.", item.value, Array.from(availableAgentNames).join(", ")), item.range, MarkerSeverity.Hint, [MarkerTag.Unnecessary]));
        }
      }
    }
    if (agentNames.length > 0) {
      const tools = header.tools;
      if (tools && !tools.includes(SpecedToolAliases.agent)) {
        report(toMarker(localize("promptValidator.agentsRequiresAgentTool", "When 'agents' and 'tools' are specified, the 'agent' tool must be included in the 'tools' attribute."), attribute.value.range, MarkerSeverity.Warning));
      }
    }
  }
  validateGithubPermissions(attributes, report) {
    const attribute = attributes.find((attr) => attr.key === GithubPromptHeaderAttributes.github);
    if (!attribute) {
      return;
    }
    if (attribute.value.type !== "map") {
      report(toMarker(localize("promptValidator.githubMustBeMap", "The 'github' attribute must be an object."), attribute.value.range, MarkerSeverity.Error));
      return;
    }
    for (const prop of attribute.value.properties) {
      if (prop.key.value !== "permissions") {
        report(toMarker(localize("promptValidator.unknownGithubProperty", "Unknown property '{0}' in 'github' object. Supported: 'permissions'.", prop.key.value), prop.key.range, MarkerSeverity.Warning));
        continue;
      }
      if (prop.value.type !== "map") {
        report(toMarker(localize("promptValidator.permissionsMustBeMap", "The 'permissions' property must be an object."), prop.value.range, MarkerSeverity.Error));
        continue;
      }
      for (const permProp of prop.value.properties) {
        const scope = permProp.key.value;
        const scopeInfo = githubPermissionScopes[scope];
        if (!scopeInfo) {
          const validScopes = Object.keys(githubPermissionScopes).sort().join(", ");
          report(toMarker(localize("promptValidator.unknownPermissionScope", "Unknown permission scope '{0}'. Valid scopes: {1}.", scope, validScopes), permProp.key.range, MarkerSeverity.Warning));
          continue;
        }
        if (permProp.value.type !== "scalar") {
          report(toMarker(localize("promptValidator.permissionValueMustBeString", "The permission value for '{0}' must be a string.", scope), permProp.value.range, MarkerSeverity.Error));
          continue;
        }
        const value = permProp.value.value;
        if (!scopeInfo.allowedValues.includes(value)) {
          report(toMarker(localize("promptValidator.invalidPermissionValue", "Invalid permission value '{0}' for scope '{1}'. Allowed values: {2}.", value, scope, scopeInfo.allowedValues.join(", ")), permProp.value.range, MarkerSeverity.Error));
        }
      }
    }
  }
};
PromptValidator = __decorateClass([
  __decorateParam(0, ILanguageModelsService),
  __decorateParam(1, ILanguageModelToolsService),
  __decorateParam(2, IChatModeService),
  __decorateParam(3, IFileService),
  __decorateParam(4, ILabelService),
  __decorateParam(5, IPromptsService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IConfigurationService)
], PromptValidator);
const githubPermissionScopes = {
  "actions": { allowedValues: ["read", "write", "none"], description: localize("githubPermission.actions", "Access to GitHub Actions workflows and runs") },
  "checks": { allowedValues: ["read", "none"], description: localize("githubPermission.checks", "Access to check runs and statuses") },
  "contents": { allowedValues: ["read", "write", "none"], description: localize("githubPermission.contents", "Access to repository contents (files, commits, branches)") },
  "discussions": { allowedValues: ["read", "write", "none"], description: localize("githubPermission.discussions", "Access to discussions") },
  "issues": { allowedValues: ["read", "write", "none"], description: localize("githubPermission.issues", "Access to issues (read, create, update, comment)") },
  "metadata": { allowedValues: ["read"], description: localize("githubPermission.metadata", "Repository metadata (always read-only)") },
  "pull-requests": { allowedValues: ["read", "write", "none"], description: localize("githubPermission.pullRequests", "Access to pull requests (read, create, update, review)") },
  "security-events": { allowedValues: ["read", "none"], description: localize("githubPermission.securityEvents", "Access to security-related events") },
  "workflows": { allowedValues: ["write", "none"], description: localize("githubPermission.workflows", "Access to modify workflow files") }
};
function isTrueOrFalse(value) {
  if (value.type === "scalar") {
    return (value.value === "true" || value.value === "false") && value.format === "none";
  }
  return false;
}
const allAttributeNames = {
  [PromptsType.prompt]: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.model, PromptHeaderAttributes.tools, PromptHeaderAttributes.mode, PromptHeaderAttributes.agent, PromptHeaderAttributes.argumentHint],
  [PromptsType.instructions]: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.applyTo, PromptHeaderAttributes.excludeAgent],
  [PromptsType.agent]: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.model, PromptHeaderAttributes.tools, PromptHeaderAttributes.advancedOptions, PromptHeaderAttributes.handOffs, PromptHeaderAttributes.argumentHint, PromptHeaderAttributes.target, PromptHeaderAttributes.infer, PromptHeaderAttributes.agents, PromptHeaderAttributes.hooks, PromptHeaderAttributes.userInvocable, PromptHeaderAttributes.disableModelInvocation, GithubPromptHeaderAttributes.github],
  [PromptsType.skill]: [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.license, PromptHeaderAttributes.compatibility, PromptHeaderAttributes.metadata, PromptHeaderAttributes.argumentHint, PromptHeaderAttributes.userInvocable, PromptHeaderAttributes.disableModelInvocation, PromptHeaderAttributes.context],
  [PromptsType.hook]: []
  // hooks are JSON files, not markdown with YAML frontmatter
};
const githubCopilotAgentAttributeNames = [PromptHeaderAttributes.name, PromptHeaderAttributes.description, PromptHeaderAttributes.tools, PromptHeaderAttributes.target, GithubPromptHeaderAttributes.mcpServers, GithubPromptHeaderAttributes.github, PromptHeaderAttributes.infer];
const recommendedAttributeNames = {
  [PromptsType.prompt]: allAttributeNames[PromptsType.prompt].filter((name) => !isNonRecommendedAttribute(name)),
  [PromptsType.instructions]: allAttributeNames[PromptsType.instructions].filter((name) => !isNonRecommendedAttribute(name)),
  [PromptsType.agent]: allAttributeNames[PromptsType.agent].filter((name) => !isNonRecommendedAttribute(name)),
  [PromptsType.skill]: allAttributeNames[PromptsType.skill].filter((name) => !isNonRecommendedAttribute(name)),
  [PromptsType.hook]: []
  // hooks are JSON files, not markdown with YAML frontmatter
};
function getValidAttributeNames(promptType, includeNonRecommended, target) {
  if (target === Target.Claude) {
    if (promptType === PromptsType.instructions) {
      return Object.keys(claudeRulesAttributes);
    }
    return Object.keys(claudeAgentAttributes);
  } else if (target === Target.GitHubCopilot) {
    if (promptType === PromptsType.agent) {
      return githubCopilotAgentAttributeNames;
    }
  }
  return includeNonRecommended ? allAttributeNames[promptType] : recommendedAttributeNames[promptType];
}
function isNonRecommendedAttribute(attributeName) {
  return attributeName === PromptHeaderAttributes.advancedOptions || attributeName === PromptHeaderAttributes.excludeAgent || attributeName === PromptHeaderAttributes.mode || attributeName === PromptHeaderAttributes.infer;
}
function getAttributeDescription(attributeName, promptType, target) {
  if (target === Target.Claude) {
    if (promptType === PromptsType.agent) {
      return claudeAgentAttributes[attributeName]?.description;
    }
    if (promptType === PromptsType.instructions) {
      return claudeRulesAttributes[attributeName]?.description;
    }
  }
  switch (promptType) {
    case PromptsType.instructions:
      switch (attributeName) {
        case PromptHeaderAttributes.name:
          return localize("promptHeader.instructions.name", "The name of the instruction file as shown in the UI. If not set, the name is derived from the file name.");
        case PromptHeaderAttributes.description:
          return localize("promptHeader.instructions.description", "The description of the instruction file. It can be used to provide additional context or information about the instructions and is passed to the language model as part of the prompt.");
        case PromptHeaderAttributes.applyTo:
          return localize("promptHeader.instructions.applyToRange", "One or more glob pattern (separated by comma) that describe for which files the instructions apply to. Based on these patterns, the file is automatically included in the prompt, when the context contains a file that matches one or more of these patterns. Use `**` when you want this file to always be added.\nExample: `**/*.ts`, `**/*.js`, `client/**`");
      }
      break;
    case PromptsType.skill:
      switch (attributeName) {
        case PromptHeaderAttributes.name:
          return localize("promptHeader.skill.name", "The name of the skill.");
        case PromptHeaderAttributes.description:
          return localize("promptHeader.skill.description", "The description of the skill. The description is added to every request and will be used by the agent to decide when to load the skill.");
        case PromptHeaderAttributes.argumentHint:
          return localize("promptHeader.skill.argumentHint", "Hint shown during autocomplete to indicate expected arguments. Example: [issue-number] or [filename] [format]");
        case PromptHeaderAttributes.userInvocable:
          return localize("promptHeader.skill.userInvocable", "Set to false to hide from the / menu. Use for background knowledge users should not invoke directly. Default: true.");
        case PromptHeaderAttributes.disableModelInvocation:
          return localize("promptHeader.skill.disableModelInvocation", "Set to true to prevent the agent from automatically loading this skill. Use for workflows you want to trigger manually with /name. Default: false.");
      }
      break;
    case PromptsType.agent:
      switch (attributeName) {
        case PromptHeaderAttributes.name:
          return localize("promptHeader.agent.name", "The name of the agent as shown in the UI.");
        case PromptHeaderAttributes.description:
          return localize("promptHeader.agent.description", "The description of the custom agent, what it does and when to use it.");
        case PromptHeaderAttributes.argumentHint:
          return localize("promptHeader.agent.argumentHint", "The argument-hint describes what inputs the custom agent expects or supports.");
        case PromptHeaderAttributes.model:
          return localize("promptHeader.agent.model", "Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.");
        case PromptHeaderAttributes.tools:
          return localize("promptHeader.agent.tools", "The set of tools that the custom agent has access to.");
        case PromptHeaderAttributes.handOffs:
          return localize("promptHeader.agent.handoffs", "Possible handoff actions when the agent has completed its task.");
        case PromptHeaderAttributes.target:
          return localize("promptHeader.agent.target", "The target to which the header attributes like tools apply to. Possible values are `github-copilot` and `vscode`.");
        case PromptHeaderAttributes.infer:
          return localize("promptHeader.agent.infer", "Controls visibility of the agent.");
        case PromptHeaderAttributes.agents:
          return localize("promptHeader.agent.agents", "One or more agents that this agent can use as subagents. Use '*' to specify all available agents.");
        case PromptHeaderAttributes.hooks:
          return localize("promptHeader.agent.hooks", "Lifecycle hooks scoped to this agent. Define hooks that run only while this agent is active.");
        case PromptHeaderAttributes.userInvocable:
          return localize("promptHeader.agent.userInvocable", "Whether the agent can be selected and invoked by users in the UI.");
        case PromptHeaderAttributes.disableModelInvocation:
          return localize("promptHeader.agent.disableModelInvocation", "If true, prevents the agent from being invoked as a subagent.");
        case GithubPromptHeaderAttributes.github:
          return localize("promptHeader.agent.github", "GitHub-specific configuration for the agent, such as token permissions.");
      }
      break;
    case PromptsType.prompt:
      switch (attributeName) {
        case PromptHeaderAttributes.name:
          return localize("promptHeader.prompt.name", "The name of the prompt. This is also the name of the slash command that will run this prompt.");
        case PromptHeaderAttributes.description:
          return localize("promptHeader.prompt.description", "The description of the reusable prompt, what it does and when to use it.");
        case PromptHeaderAttributes.argumentHint:
          return localize("promptHeader.prompt.argumentHint", "The argument-hint describes what inputs the prompt expects or supports.");
        case PromptHeaderAttributes.model:
          return localize("promptHeader.prompt.model", "The model to use in this prompt. Can also be a list of models. The first available model will be used.");
        case PromptHeaderAttributes.tools:
          return localize("promptHeader.prompt.tools", "The tools to use in this prompt.");
        case PromptHeaderAttributes.agent:
        case PromptHeaderAttributes.mode:
          return localize("promptHeader.prompt.agent.description", "The agent to use when running this prompt.");
      }
      break;
  }
  return void 0;
}
const knownGithubCopilotTools = [
  { name: SpecedToolAliases.execute, description: localize("githubCopilot.execute", "Execute commands") },
  { name: SpecedToolAliases.read, description: localize("githubCopilot.read", "Read files") },
  { name: SpecedToolAliases.edit, description: localize("githubCopilot.edit", "Edit files") },
  { name: SpecedToolAliases.search, description: localize("githubCopilot.search", "Search files") },
  { name: SpecedToolAliases.agent, description: localize("githubCopilot.agent", "Use subagents") }
];
const knownClaudeTools = [
  { name: "Bash", description: localize("claude.bash", "Execute shell commands"), toolEquivalent: [SpecedToolAliases.execute] },
  { name: "Edit", description: localize("claude.edit", "Make targeted file edits"), toolEquivalent: ["edit/editNotebook", "edit/editFiles"] },
  { name: "Glob", description: localize("claude.glob", "Find files by pattern"), toolEquivalent: ["search/fileSearch"] },
  { name: "Grep", description: localize("claude.grep", "Search file contents with regex"), toolEquivalent: ["search/textSearch"] },
  { name: "Read", description: localize("claude.read", "Read file contents"), toolEquivalent: ["read/readFile", "read/getNotebookSummary"] },
  { name: "Write", description: localize("claude.write", "Create/overwrite files"), toolEquivalent: ["edit/createDirectory", "edit/createFile", "edit/createJupyterNotebook"] },
  { name: "WebFetch", description: localize("claude.webFetch", "Fetch URL content"), toolEquivalent: [SpecedToolAliases.web] },
  { name: "WebSearch", description: localize("claude.webSearch", "Perform web searches"), toolEquivalent: [SpecedToolAliases.web] },
  { name: "Task", description: localize("claude.task", "Run subagents for complex tasks"), toolEquivalent: [SpecedToolAliases.agent] },
  { name: "Skill", description: localize("claude.skill", "Execute skills"), toolEquivalent: [] },
  { name: "LSP", description: localize("claude.lsp", "Code intelligence (requires plugin)"), toolEquivalent: [] },
  { name: "NotebookEdit", description: localize("claude.notebookEdit", "Modify Jupyter notebooks"), toolEquivalent: ["edit/editNotebook"] },
  { name: "AskUserQuestion", description: localize("claude.askUserQuestion", "Ask multiple-choice questions"), toolEquivalent: ["vscode/askQuestions"] },
  { name: "MCPSearch", description: localize("claude.mcpSearch", "Searches for MCP tools when tool search is enabled"), toolEquivalent: [] }
];
const knownClaudeModels = [
  { name: "sonnet", description: localize("claude.sonnet", "Latest Claude Sonnet"), modelEquivalent: "Claude Sonnet 4.5 (copilot)" },
  { name: "opus", description: localize("claude.opus", "Latest Claude Opus"), modelEquivalent: "Claude Opus 4.6 (copilot)" },
  { name: "haiku", description: localize("claude.haiku", "Latest Claude Haiku, fast for simple tasks"), modelEquivalent: "Claude Haiku 4.5 (copilot)" },
  { name: "inherit", description: localize("claude.inherit", "Inherit model from parent agent or prompt"), modelEquivalent: void 0 }
];
function mapClaudeModels(claudeModelNames) {
  const result = [];
  for (const name of claudeModelNames) {
    const claudeModel = knownClaudeModels.find((model) => model.name === name);
    if (claudeModel && claudeModel.modelEquivalent) {
      result.push(claudeModel.modelEquivalent);
    }
  }
  return result;
}
function mapClaudeTools(claudeToolNames) {
  const result = [];
  for (const name of claudeToolNames) {
    const claudeTool = knownClaudeTools.find((tool) => tool.name === name);
    if (claudeTool) {
      result.push(...claudeTool.toolEquivalent);
    }
  }
  return result;
}
const claudeAgentAttributes = {
  "name": {
    type: "scalar",
    description: localize("attribute.name", "Unique identifier using lowercase letters and hyphens (required)")
  },
  "description": {
    type: "scalar",
    description: localize("attribute.description", "When to delegate to this subagent (required)")
  },
  "tools": {
    type: "sequence",
    description: localize("attribute.tools", "Array of tools the subagent can use. Inherits all tools if omitted"),
    defaults: ["Read, Edit, Bash"],
    items: knownClaudeTools
  },
  "disallowedTools": {
    type: "sequence",
    description: localize("attribute.disallowedTools", "Tools to deny, removed from inherited or specified list"),
    defaults: ["Write, Edit, Bash"],
    items: knownClaudeTools
  },
  "model": {
    type: "scalar",
    description: localize("attribute.model", "Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit."),
    defaults: ["sonnet", "opus", "haiku", "inherit"],
    enums: knownClaudeModels
  },
  "permissionMode": {
    type: "scalar",
    description: localize("attribute.permissionMode", "Permission mode: default, acceptEdits, dontAsk, bypassPermissions, or plan."),
    defaults: ["default", "acceptEdits", "dontAsk", "bypassPermissions", "plan"],
    enums: [
      { name: "default", description: localize("claude.permissionMode.default", "Standard behavior: prompts for permission on first use of each tool.") },
      { name: "acceptEdits", description: localize("claude.permissionMode.acceptEdits", "Automatically accepts file edit permissions for the session.") },
      { name: "plan", description: localize("claude.permissionMode.plan", "Plan Mode: Claude can analyze but not modify files or execute commands.") },
      { name: "delegate", description: localize("claude.permissionMode.delegate", "Coordination-only mode for agent team leads. Only available when an agent team is active.") },
      { name: "dontAsk", description: localize("claude.permissionMode.dontAsk", "Auto-denies tools unless pre-approved via /permissions or permissions.allow rules.") },
      { name: "bypassPermissions", description: localize("claude.permissionMode.bypassPermissions", "Skips all permission prompts (requires safe environment like containers).") }
    ]
  },
  "skills": {
    type: "sequence",
    description: localize("attribute.skills", "Skills to load into the subagent's context at startup.")
  },
  "mcpServers": {
    type: "sequence",
    description: localize("attribute.mcpServers", "MCP servers available to this subagent.")
  },
  "hooks": {
    type: "object",
    description: localize("attribute.hooks", "Lifecycle hooks scoped to this subagent.")
  },
  "memory": {
    type: "scalar",
    description: localize("attribute.memory", "Persistent memory scope: user, project, or local. Enables cross-session learning."),
    defaults: ["user", "project", "local"],
    enums: [
      { name: "user", description: localize("claude.memory.user", "Remember learnings across all projects.") },
      { name: "project", description: localize("claude.memory.project", "The subagent's knowledge is project-specific and shareable via version control.") },
      { name: "local", description: localize("claude.memory.local", "The subagent's knowledge is project-specific but should not be checked into version control.") }
    ]
  }
};
const claudeRulesAttributes = {
  "description": {
    type: "scalar",
    description: localize("attribute.rules.description", "A description of what this rule covers, used to provide context about when it applies.")
  },
  "paths": {
    type: "sequence",
    description: localize("attribute.rules.paths", "Array of glob patterns that describe for which files the rule applies. Based on these patterns, the file is automatically included in the prompt when the context contains a file that matches.\nExample: `['src/**/*.ts', 'test/**']`")
  }
};
function isVSCodeOrDefaultTarget(target) {
  return target === Target.VSCode || target === Target.Undefined;
}
function getTarget(promptType, header) {
  const uri = header instanceof URI ? header : header.uri;
  if (promptType === PromptsType.agent) {
    const parentDir = dirname(uri);
    if (parentDir.path.endsWith(`/${CLAUDE_AGENTS_SOURCE_FOLDER}`)) {
      return Target.Claude;
    }
    if (!(header instanceof URI)) {
      const target = header.target;
      if (target === Target.GitHubCopilot || target === Target.VSCode) {
        return target;
      }
    }
    return Target.Undefined;
  } else if (promptType === PromptsType.instructions) {
    if (isInClaudeRulesFolder(uri)) {
      return Target.Claude;
    }
  }
  return Target.Undefined;
}
function toMarker(message, range, severity = MarkerSeverity.Error, tags, code) {
  return { severity, message, ...tags ? { tags } : {}, ...code ? { code } : {}, ...range };
}
export {
  MARKERS_OWNER_ID,
  PromptValidator,
  PromptValidatorMarkerCode,
  claudeAgentAttributes,
  claudeRulesAttributes,
  getAttributeDescription,
  getTarget,
  getValidAttributeNames,
  githubPermissionScopes,
  isNonRecommendedAttribute,
  isVSCodeOrDefaultTarget,
  knownClaudeModels,
  knownClaudeTools,
  knownGithubCopilotTools,
  mapClaudeModels,
  mapClaudeTools
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRWYWxpZGF0b3IudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc0VtcHR5UGF0dGVybiwgcGFyc2UsIHNwbGl0R2xvYkF3YXJlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElNYXJrZXJEYXRhLCBNYXJrZXJTZXZlcml0eSwgTWFya2VyVGFnIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2Vycy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZSwgSUNoYXRNb2RlLCBJQ2hhdE1vZGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdE1vZGVzLmpzJztcbmltcG9ydCB7IENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBTcGVjZWRUb29sQWxpYXNlcyB9IGZyb20gJy4uLy4uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUsIFRhcmdldCB9IGZyb20gJy4uL3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IElTZXF1ZW5jZVZhbHVlLCBJSGVhZGVyQXR0cmlidXRlLCBJU2NhbGFyVmFsdWUsIHBhcnNlQ29tbWFTZXBhcmF0ZWRMaXN0LCBQYXJzZWRQcm9tcHRGaWxlLCBQcm9tcHRIZWFkZXIsIElWYWx1ZSwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcyB9IGZyb20gJy4uL3Byb21wdEZpbGVQYXJzZXIuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlIH0gZnJvbSAnLi4vc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IEFHRU5UU19TT1VSQ0VfRk9MREVSLCBDTEFVREVfQUdFTlRTX1NPVVJDRV9GT0xERVIsIGlzSW5DbGF1ZGVSdWxlc0ZvbGRlciwgaXNTa2lsbEZpbGVuYW1lLCBMRUdBQ1lfTU9ERV9GSUxFX0VYVEVOU0lPTiwgVkFMSURfU0tJTExfTkFNRV9SRUdFWCB9IGZyb20gJy4uL2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEhPT0tTX0JZX1RBUkdFVCB9IGZyb20gJy4uL2hvb2tUeXBlcy5qcyc7XG5pbXBvcnQgeyBHaXRodWJQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzIH0gZnJvbSAnLi9wcm9tcHRGaWxlQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcblxuZXhwb3J0IGNvbnN0IE1BUktFUlNfT1dORVJfSUQgPSAncHJvbXB0cy1kaWFnbm9zdGljcy1wcm92aWRlcic7XG5cbmV4cG9ydCBjb25zdCBlbnVtIFByb21wdFZhbGlkYXRvck1hcmtlckNvZGUge1xuXHRNaXNzaW5nR2l0aHViTWNwU2VydmVyID0gJ3Byb21wdFZhbGlkYXRvci5taXNzaW5nR2l0aHViTWNwU2VydmVyJyxcblx0TWlzc2luZ1BsYXl3cmlnaHRNY3BTZXJ2ZXIgPSAncHJvbXB0VmFsaWRhdG9yLm1pc3NpbmdQbGF5d3JpZ2h0TWNwU2VydmVyJyxcblx0VW5rbm93bkV4dGVuc2lvblJlZmVyZW5jZSA9ICdwcm9tcHRWYWxpZGF0b3IudW5rbm93bkV4dGVuc2lvblJlZmVyZW5jZScsXG5cdFVua25vd25NY3BTZXJ2ZXJSZWZlcmVuY2UgPSAncHJvbXB0VmFsaWRhdG9yLnVua25vd25NY3BTZXJ2ZXJSZWZlcmVuY2UnLFxuXHRVbmtub3duRXh0ZW5zaW9uT3JNY3BTZXJ2ZXJSZWZlcmVuY2UgPSAncHJvbXB0VmFsaWRhdG9yLnVua25vd25FeHRlbnNpb25Pck1jcFNlcnZlclJlZmVyZW5jZSdcbn1cblxuZXhwb3J0IGNsYXNzIFByb21wdFZhbGlkYXRvciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHRcdEBJQ2hhdE1vZGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdE1vZGVTZXJ2aWNlOiBJQ2hhdE1vZGVTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJUHJvbXB0c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ2dlcjogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cHVibGljIGFzeW5jIHZhbGlkYXRlKHByb21wdEFTVDogUGFyc2VkUHJvbXB0RmlsZSwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUsIHJlcG9ydDogKG1hcmtlcnM6IElNYXJrZXJEYXRhKSA9PiB2b2lkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cHJvbXB0QVNULmhlYWRlcj8uZXJyb3JzLmZvckVhY2goZXJyb3IgPT4gcmVwb3J0KHRvTWFya2VyKGVycm9yLm1lc3NhZ2UsIGVycm9yLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpKTtcblx0XHRjb25zdCB0YXJnZXQgPSBnZXRUYXJnZXQocHJvbXB0VHlwZSwgcHJvbXB0QVNULmhlYWRlciA/PyBwcm9tcHRBU1QudXJpKTtcblx0XHRhd2FpdCB0aGlzLnZhbGlkYXRlSGVhZGVyKHByb21wdEFTVCwgcHJvbXB0VHlwZSwgdGFyZ2V0LCByZXBvcnQpO1xuXHRcdGF3YWl0IHRoaXMudmFsaWRhdGVCb2R5KHByb21wdEFTVCwgdGFyZ2V0LCByZXBvcnQpO1xuXHRcdGF3YWl0IHRoaXMudmFsaWRhdGVGaWxlTmFtZShwcm9tcHRBU1QsIHByb21wdFR5cGUsIHJlcG9ydCk7XG5cdFx0YXdhaXQgdGhpcy52YWxpZGF0ZVNraWxsQXR0cmlidXRlcyhwcm9tcHRBU1QsIHByb21wdFR5cGUsIHJlcG9ydCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHZhbGlkYXRlRmlsZU5hbWUocHJvbXB0QVNUOiBQYXJzZWRQcm9tcHRGaWxlLCBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQgJiYgcHJvbXB0QVNULnVyaS5wYXRoLmVuZHNXaXRoKExFR0FDWV9NT0RFX0ZJTEVfRVhURU5TSU9OKSkge1xuXHRcdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLnByb21wdHNTZXJ2aWNlLmdldEFnZW50RmlsZVVSSUZyb21Nb2RlRmlsZShwcm9tcHRBU1QudXJpKTtcblx0XHRcdGlmIChsb2NhdGlvbiAmJiBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmNhbkNyZWF0ZUZpbGUobG9jYXRpb24pKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmNoYXRNb2Rlc1JlbmFtZWRUb0FnZW50cycsIFwiQ2hhdCBtb2RlcyBoYXZlIGJlZW4gcmVuYW1lZCB0byBhZ2VudHMuIFBsZWFzZSBtb3ZlIHRoaXMgZmlsZSB0byB7MH1cIiwgbG9jYXRpb24udG9TdHJpbmcoKSksIG5ldyBSYW5nZSgxLCAxLCAxLCA0KSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZykpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuY2hhdE1vZGVzUmVuYW1lZFRvQWdlbnRzTm9Nb3ZlJywgXCJDaGF0IG1vZGVzIGhhdmUgYmVlbiByZW5hbWVkIHRvIGFnZW50cy4gUGxlYXNlIG1vdmUgdGhlIGZpbGUgdG8gezB9XCIsIEFHRU5UU19TT1VSQ0VfRk9MREVSKSwgbmV3IFJhbmdlKDEsIDEsIDEsIDQpLCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB2YWxpZGF0ZVNraWxsQXR0cmlidXRlcyhwcm9tcHRBU1Q6IFBhcnNlZFByb21wdEZpbGUsIHByb21wdFR5cGU6IFByb21wdHNUeXBlLCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChwcm9tcHRUeXBlICE9PSBQcm9tcHRzVHlwZS5za2lsbCB8fCAhcHJvbXB0QVNULmhlYWRlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5hbWVBdHRyaWJ1dGUgPSBwcm9tcHRBU1QuaGVhZGVyLmdldEF0dHJpYnV0ZShQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm5hbWUpO1xuXHRcdGlmICghbmFtZUF0dHJpYnV0ZSkge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKFxuXHRcdFx0XHRsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnNraWxsTmFtZU1pc3NpbmcnLCBcIlNraWxsIHNob3VsZCBwcm92aWRlIGEgbmFtZS5cIiksXG5cdFx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCA0KSxcblx0XHRcdFx0TWFya2VyU2V2ZXJpdHkuV2FybmluZ1xuXHRcdFx0KSk7XG5cdFx0fSBlbHNlIGlmIChuYW1lQXR0cmlidXRlLnZhbHVlLnR5cGUgPT09ICdzY2FsYXInKSB7XG5cdFx0XHRjb25zdCBza2lsbE5hbWUgPSBuYW1lQXR0cmlidXRlLnZhbHVlLnZhbHVlLnRyaW0oKTtcblx0XHRcdGlmIChza2lsbE5hbWUubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRpZiAoIVZBTElEX1NLSUxMX05BTUVfUkVHRVgudGVzdChza2lsbE5hbWUpKSB7XG5cdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5za2lsbE5hbWVJbnZhbGlkQ2hhcnMnLCBcIlNraWxsIG5hbWUgbWF5IG9ubHkgY29udGFpbiBsb3dlcmNhc2UgbGV0dGVycywgbnVtYmVycywgYW5kIGh5cGhlbnMuXCIpLFxuXHRcdFx0XHRcdFx0bmFtZUF0dHJpYnV0ZS52YWx1ZS5yYW5nZSxcblx0XHRcdFx0XHRcdE1hcmtlclNldmVyaXR5LkVycm9yXG5cdFx0XHRcdFx0KSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBFeHRyYWN0IGZvbGRlciBuYW1lIGZyb20gcGF0aCAoZS5nLiwgLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQgLT4gbXktc2tpbGwpXG5cdFx0XHRcdGNvbnN0IHBhdGhQYXJ0cyA9IHByb21wdEFTVC51cmkucGF0aC5zcGxpdCgnLycpO1xuXHRcdFx0XHRjb25zdCBza2lsbEluZGV4ID0gcGF0aFBhcnRzLmZpbmRJbmRleChwYXJ0ID0+IGlzU2tpbGxGaWxlbmFtZShwYXJ0KSk7XG5cdFx0XHRcdGlmIChza2lsbEluZGV4ID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGZvbGRlck5hbWUgPSBwYXRoUGFydHNbc2tpbGxJbmRleCAtIDFdO1xuXHRcdFx0XHRcdGlmIChmb2xkZXJOYW1lICYmIHNraWxsTmFtZSAhPT0gZm9sZGVyTmFtZSkge1xuXHRcdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKFxuXHRcdFx0XHRcdFx0XHRsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnNraWxsTmFtZUZvbGRlck1pc21hdGNoJywgXCJUaGUgc2tpbGwgbmFtZSAnezB9JyBzaG91bGQgbWF0Y2ggdGhlIGZvbGRlciBuYW1lICd7MX0nLlwiLCBza2lsbE5hbWUsIGZvbGRlck5hbWUpLFxuXHRcdFx0XHRcdFx0XHRuYW1lQXR0cmlidXRlLnZhbHVlLnJhbmdlLFxuXHRcdFx0XHRcdFx0XHRNYXJrZXJTZXZlcml0eS5XYXJuaW5nXG5cdFx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBkZXNjcmlwdGlvbkF0dHJpYnV0ZSA9IHByb21wdEFTVC5oZWFkZXIuZ2V0QXR0cmlidXRlKFByb21wdEhlYWRlckF0dHJpYnV0ZXMuZGVzY3JpcHRpb24pO1xuXHRcdGlmICghZGVzY3JpcHRpb25BdHRyaWJ1dGUpIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihcblx0XHRcdFx0bG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5za2lsbERlc2NyaXB0aW9uTWlzc2luZycsIFwiU2tpbGwgc2hvdWxkIHByb3ZpZGUgYSBkZXNjcmlwdGlvbi5cIiksXG5cdFx0XHRcdG5ldyBSYW5nZSgxLCAxLCAxLCA0KSxcblx0XHRcdFx0TWFya2VyU2V2ZXJpdHkuV2FybmluZ1xuXHRcdFx0KSk7XG5cblx0XHRcdC8vIFdpdGhvdXQgYSBkZXNjcmlwdGlvbiwgdXNlci1pbnZvY2FibGU6IGZhbHNlIGlzIGludmFsaWQgYmVjYXVzZSB0aGUgc2tpbGxcblx0XHRcdC8vIHdvdWxkIGJlIG1vZGVsLW9ubHkgYnV0IGhhcyBubyBkZXNjcmlwdGlvbiBmb3IgdGhlIG1vZGVsIHRvIGRlY2lkZSB3aGVuIHRvIHVzZSBpdC5cblx0XHRcdGlmIChwcm9tcHRBU1QuaGVhZGVyLnVzZXJJbnZvY2FibGUgPT09IGZhbHNlKSB7XG5cdFx0XHRcdGNvbnN0IHVzZXJJbnZvY2FibGVBdHRyID0gcHJvbXB0QVNULmhlYWRlci5nZXRBdHRyaWJ1dGUoUHJvbXB0SGVhZGVyQXR0cmlidXRlcy51c2VySW52b2NhYmxlKTtcblx0XHRcdFx0aWYgKHVzZXJJbnZvY2FibGVBdHRyKSB7XG5cdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5za2lsbFVzZXJJbnZvY2FibGVSZXF1aXJlc0Rlc2NyaXB0aW9uJywgXCJBIGRlc2NyaXB0aW9uIGlzIHJlcXVpcmVkIHdoZW4gdXNlci1pbnZvY2FibGUgaXMgZmFsc2UsIGJlY2F1c2UgdGhlIG1vZGVsIG5lZWRzIGEgZGVzY3JpcHRpb24gdG8gZGVjaWRlIHdoZW4gdG8gbG9hZCB0aGUgc2tpbGwuXCIpLFxuXHRcdFx0XHRcdFx0dXNlckludm9jYWJsZUF0dHIudmFsdWUucmFuZ2UsXG5cdFx0XHRcdFx0XHRNYXJrZXJTZXZlcml0eS5FcnJvclxuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFdpdGhvdXQgYSBkZXNjcmlwdGlvbiwgZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiBmYWxzZSAobW9kZWwgaW52b2NhdGlvbiBlbmFibGVkKVxuXHRcdFx0Ly8gaXMgdGhlIGRlZmF1bHQgYnV0IGlmIGV4cGxpY2l0bHkgc2V0LCByZXBvcnQgYW4gZXJyb3IgdGhhdCBhIGRlc2NyaXB0aW9uIGlzIG5lZWRlZC5cblx0XHRcdGlmIChwcm9tcHRBU1QuaGVhZGVyLmRpc2FibGVNb2RlbEludm9jYXRpb24gPT09IGZhbHNlKSB7XG5cdFx0XHRcdGNvbnN0IGRpc2FibGVNb2RlbEludm9jYXRpb25BdHRyID0gcHJvbXB0QVNULmhlYWRlci5nZXRBdHRyaWJ1dGUoUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5kaXNhYmxlTW9kZWxJbnZvY2F0aW9uKTtcblx0XHRcdFx0aWYgKGRpc2FibGVNb2RlbEludm9jYXRpb25BdHRyKSB7XG5cdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5za2lsbE1vZGVsSW52b2NhdGlvblJlcXVpcmVzRGVzY3JpcHRpb24nLCBcIkEgZGVzY3JpcHRpb24gaXMgcmVxdWlyZWQgd2hlbiBtb2RlbCBpbnZvY2F0aW9uIGlzIGVuYWJsZWQsIGJlY2F1c2UgdGhlIG1vZGVsIG5lZWRzIGEgZGVzY3JpcHRpb24gdG8gZGVjaWRlIHdoZW4gdG8gbG9hZCB0aGUgc2tpbGwuXCIpLFxuXHRcdFx0XHRcdFx0ZGlzYWJsZU1vZGVsSW52b2NhdGlvbkF0dHIudmFsdWUucmFuZ2UsXG5cdFx0XHRcdFx0XHRNYXJrZXJTZXZlcml0eS5FcnJvclxuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVmFsaWRhdGUgY29udGV4dDogZm9yayBcdTIwMTQgcmVxdWlyZXMgdGhlIHNraWxsIHRvb2wgdG8gYmUgZW5hYmxlZFxuXHRcdGNvbnN0IGNvbnRleHRBdHRyaWJ1dGUgPSBwcm9tcHRBU1QuaGVhZGVyPy5nZXRBdHRyaWJ1dGUoUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5jb250ZXh0KTtcblx0XHRpZiAoY29udGV4dEF0dHJpYnV0ZSAmJiBjb250ZXh0QXR0cmlidXRlLnZhbHVlLnR5cGUgPT09ICdzY2FsYXInICYmIGNvbnRleHRBdHRyaWJ1dGUudmFsdWUudmFsdWUudHJpbSgpID09PSAnZm9yaycpIHtcblx0XHRcdGNvbnN0IHNraWxsVG9vbEVuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KCdnaXRodWIuY29waWxvdC5jaGF0LnNraWxsVG9vbC5lbmFibGVkJyk7XG5cdFx0XHRpZiAoIXNraWxsVG9vbEVuYWJsZWQpIHtcblx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKFxuXHRcdFx0XHRcdGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuY29udGV4dEZvcmtOb3RTdXBwb3J0ZWQnLCBcIlRoZSAnY29udGV4dDogZm9yaycgYXR0cmlidXRlIHJlcXVpcmVzIHRoZSBza2lsbCB0b29sIHRvIGJlIGVuYWJsZWQgKGdpdGh1Yi5jb3BpbG90LmNoYXQuc2tpbGxUb29sLmVuYWJsZWQpLlwiKSxcblx0XHRcdFx0XHRjb250ZXh0QXR0cmlidXRlLnZhbHVlLnJhbmdlLFxuXHRcdFx0XHRcdE1hcmtlclNldmVyaXR5Lldhcm5pbmdcblx0XHRcdFx0KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB2YWxpZGF0ZUJvZHkocHJvbXB0QVNUOiBQYXJzZWRQcm9tcHRGaWxlLCB0YXJnZXQ6IFRhcmdldCwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBib2R5ID0gcHJvbXB0QVNULmJvZHk7XG5cdFx0aWYgKCFib2R5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVmFsaWRhdGUgZmlsZSByZWZlcmVuY2VzXG5cdFx0Y29uc3QgZmlsZVJlZmVyZW5jZUNoZWNrczogUHJvbWlzZTx2b2lkPltdID0gW107XG5cdFx0Zm9yIChjb25zdCByZWYgb2YgYm9keS5maWxlUmVmZXJlbmNlcykge1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWQgPSBib2R5LnJlc29sdmVGaWxlUGF0aChyZWYuY29udGVudCk7XG5cdFx0XHRpZiAoIXJlc29sdmVkKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmludmFsaWRGaWxlUmVmZXJlbmNlJywgXCJJbnZhbGlkIGZpbGUgcmVmZXJlbmNlICd7MH0nLlwiLCByZWYuY29udGVudCksIHJlZi5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZykpO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChwcm9tcHRBU1QudXJpLnNjaGVtZSA9PT0gcmVzb2x2ZWQuc2NoZW1lKSB7XG5cdFx0XHRcdC8vIG9ubHkgdmFsaWRhdGUgaWYgdGhlIGxpbmsgaXMgaW4gdGhlIGZpbGUgc3lzdGVtIG9mIHRoZSBwcm9tcHQgZmlsZVxuXHRcdFx0XHRmaWxlUmVmZXJlbmNlQ2hlY2tzLnB1c2goKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMocmVzb2x2ZWQpO1xuXHRcdFx0XHRcdFx0aWYgKCFleGlzdHMpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbG9jID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwocmVzb2x2ZWQpO1xuXHRcdFx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5maWxlTm90Rm91bmQnLCBcIkZpbGUgJ3swfScgbm90IGZvdW5kIGF0ICd7MX0nLlwiLCByZWYuY29udGVudCwgbG9jKSwgcmVmLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dnZXIud2FybihgRXJyb3IgY2hlY2tpbmcgZXhpc3RlbmNlIG9mIGZpbGUgcmVmZXJlbmNlICcke3JlZi5jb250ZW50fScgcmVzb2x2ZWQgdG8gJyR7cmVzb2x2ZWQudG9TdHJpbmcoKX0nIGluIHByb21wdCBmaWxlICcke3Byb21wdEFTVC51cmkudG9TdHJpbmcoKX0nOiAke2UubWVzc2FnZX1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFZhbGlkYXRlIHZhcmlhYmxlIHJlZmVyZW5jZXMgKHRvb2wgb3IgdG9vbHNldCBuYW1lcylcblx0XHRpZiAoYm9keS52YXJpYWJsZVJlZmVyZW5jZXMubGVuZ3RoICYmIGlzVlNDb2RlT3JEZWZhdWx0VGFyZ2V0KHRhcmdldCkpIHtcblx0XHRcdGNvbnN0IGhlYWRlclRvb2xzID0gcHJvbXB0QVNULmhlYWRlcj8udG9vbHM7XG5cdFx0XHRjb25zdCBoZWFkZXJUb29sc01hcCA9IGhlYWRlclRvb2xzID8gdGhpcy5sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLnRvVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwKGhlYWRlclRvb2xzLCB1bmRlZmluZWQpIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRjb25zdCBhdmFpbGFibGUgPSBuZXcgU2V0PHN0cmluZz4odGhpcy5sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmdldEZ1bGxSZWZlcmVuY2VOYW1lcygpKTtcblx0XHRcdGNvbnN0IGRlcHJlY2F0ZWROYW1lcyA9IHRoaXMubGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5nZXREZXByZWNhdGVkRnVsbFJlZmVyZW5jZU5hbWVzKCk7XG5cdFx0XHRmb3IgKGNvbnN0IHZhcmlhYmxlIG9mIGJvZHkudmFyaWFibGVSZWZlcmVuY2VzKSB7XG5cdFx0XHRcdGlmICghYXZhaWxhYmxlLmhhcyh2YXJpYWJsZS5uYW1lKSkge1xuXHRcdFx0XHRcdGlmIChkZXByZWNhdGVkTmFtZXMuaGFzKHZhcmlhYmxlLm5hbWUpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjdXJyZW50TmFtZXMgPSBkZXByZWNhdGVkTmFtZXMuZ2V0KHZhcmlhYmxlLm5hbWUpO1xuXHRcdFx0XHRcdFx0aWYgKGN1cnJlbnROYW1lcyAmJiBjdXJyZW50TmFtZXMuc2l6ZSA+IDApIHtcblx0XHRcdFx0XHRcdFx0aWYgKGN1cnJlbnROYW1lcy5zaXplID09PSAxKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgbmV3TmFtZSA9IEFycmF5LmZyb20oY3VycmVudE5hbWVzKVswXTtcblx0XHRcdFx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5kZXByZWNhdGVkVmFyaWFibGVSZWZlcmVuY2UnLCBcIlRvb2wgb3IgdG9vbHNldCAnezB9JyBoYXMgYmVlbiByZW5hbWVkLCB1c2UgJ3sxfScgaW5zdGVhZC5cIiwgdmFyaWFibGUubmFtZSwgbmV3TmFtZSksIHZhcmlhYmxlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5JbmZvKSk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgbmV3TmFtZXMgPSBBcnJheS5mcm9tKGN1cnJlbnROYW1lcykuc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKS5qb2luKCcsICcpO1xuXHRcdFx0XHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmRlcHJlY2F0ZWRWYXJpYWJsZVJlZmVyZW5jZU11bHRpcGxlTmFtZXMnLCBcIlRvb2wgb3IgdG9vbHNldCAnezB9JyBoYXMgYmVlbiByZW5hbWVkLCB1c2UgdGhlIGZvbGxvd2luZyB0b29scyBpbnN0ZWFkOiB7MX1cIiwgdmFyaWFibGUubmFtZSwgbmV3TmFtZXMpLCB2YXJpYWJsZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuSW5mbykpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1pc3NpbmdHaXRodWJTZXJ2ZXJNYXJrZXIgPSB0aGlzLmdldE1pc3NpbmdHaXRodWJNY3BTZXJ2ZXJNYXJrZXIodmFyaWFibGUubmFtZSwgdmFyaWFibGUucmFuZ2UpO1xuXHRcdFx0XHRcdFx0aWYgKG1pc3NpbmdHaXRodWJTZXJ2ZXJNYXJrZXIpIHtcblx0XHRcdFx0XHRcdFx0cmVwb3J0KG1pc3NpbmdHaXRodWJTZXJ2ZXJNYXJrZXIpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgbWlzc2luZ1BsYXl3cmlnaHRTZXJ2ZXJNYXJrZXIgPSB0aGlzLmdldE1pc3NpbmdQbGF5d3JpZ2h0TWNwU2VydmVyTWFya2VyKHZhcmlhYmxlLm5hbWUsIHZhcmlhYmxlLnJhbmdlKTtcblx0XHRcdFx0XHRcdFx0aWYgKG1pc3NpbmdQbGF5d3JpZ2h0U2VydmVyTWFya2VyKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVwb3J0KG1pc3NpbmdQbGF5d3JpZ2h0U2VydmVyTWFya2VyKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRyZXBvcnQodGhpcy5nZXRVbmtub3duVG9vbE1hcmtlcih2YXJpYWJsZS5uYW1lLCB2YXJpYWJsZS5yYW5nZSwgdHJ1ZSkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKGhlYWRlclRvb2xzTWFwKSB7XG5cdFx0XHRcdFx0Y29uc3QgdG9vbCA9IHRoaXMubGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5nZXRUb29sQnlGdWxsUmVmZXJlbmNlTmFtZSh2YXJpYWJsZS5uYW1lKTtcblx0XHRcdFx0XHRpZiAodG9vbCAmJiBoZWFkZXJUb29sc01hcC5nZXQodG9vbCkgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5kaXNhYmxlZFRvb2wnLCBcIlRvb2wgb3IgdG9vbHNldCAnezB9JyBhbHNvIG5lZWRzIHRvIGJlIGVuYWJsZWQgaW4gdGhlIGhlYWRlci5cIiwgdmFyaWFibGUubmFtZSksIHZhcmlhYmxlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoZmlsZVJlZmVyZW5jZUNoZWNrcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHZhbGlkYXRlSGVhZGVyKHByb21wdEFTVDogUGFyc2VkUHJvbXB0RmlsZSwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUsIHRhcmdldDogVGFyZ2V0LCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGhlYWRlciA9IHByb21wdEFTVC5oZWFkZXI7XG5cdFx0aWYgKCFoZWFkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYXR0cmlidXRlcyA9IGhlYWRlci5hdHRyaWJ1dGVzO1xuXHRcdHRoaXMuY2hlY2tGb3JJbnZhbGlkQXJndW1lbnRzKGF0dHJpYnV0ZXMsIHByb21wdFR5cGUsIHRhcmdldCwgcmVwb3J0KTtcblxuXHRcdHRoaXMudmFsaWRhdGVOYW1lKGF0dHJpYnV0ZXMsIHJlcG9ydCk7XG5cdFx0dGhpcy52YWxpZGF0ZURlc2NyaXB0aW9uKGF0dHJpYnV0ZXMsIHJlcG9ydCk7XG5cdFx0dGhpcy52YWxpZGF0ZUFyZ3VtZW50SGludChhdHRyaWJ1dGVzLCByZXBvcnQpO1xuXHRcdHN3aXRjaCAocHJvbXB0VHlwZSkge1xuXHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5wcm9tcHQ6IHtcblx0XHRcdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCB0aGlzLnZhbGlkYXRlQWdlbnQoYXR0cmlidXRlcywgcmVwb3J0KTtcblx0XHRcdFx0dGhpcy52YWxpZGF0ZVRvb2xzKGF0dHJpYnV0ZXMsIGFnZW50Py5raW5kID8/IENoYXRNb2RlS2luZC5BZ2VudCwgdGFyZ2V0LCByZXBvcnQpO1xuXHRcdFx0XHR0aGlzLnZhbGlkYXRlTW9kZWwoYXR0cmlidXRlcywgYWdlbnQ/LmtpbmQgPz8gQ2hhdE1vZGVLaW5kLkFnZW50LCByZXBvcnQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zOlxuXHRcdFx0XHRpZiAodGFyZ2V0ID09PSBUYXJnZXQuQ2xhdWRlKSB7XG5cdFx0XHRcdFx0dGhpcy52YWxpZGF0ZVBhdGhzKGF0dHJpYnV0ZXMsIHJlcG9ydCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy52YWxpZGF0ZUFwcGx5VG8oYXR0cmlidXRlcywgcmVwb3J0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnZhbGlkYXRlRXhjbHVkZUFnZW50KGF0dHJpYnV0ZXMsIHJlcG9ydCk7XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLmFnZW50OiB7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGVUYXJnZXQoYXR0cmlidXRlcywgcmVwb3J0KTtcblx0XHRcdFx0dGhpcy52YWxpZGF0ZUluZmVyKGF0dHJpYnV0ZXMsIHJlcG9ydCk7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGVVc2VySW52b2NhYmxlKGF0dHJpYnV0ZXMsIHJlcG9ydCk7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGVEaXNhYmxlTW9kZWxJbnZvY2F0aW9uKGF0dHJpYnV0ZXMsIHJlcG9ydCk7XG5cdFx0XHRcdHRoaXMudmFsaWRhdGVUb29scyhhdHRyaWJ1dGVzLCBDaGF0TW9kZUtpbmQuQWdlbnQsIHRhcmdldCwgcmVwb3J0KTtcblx0XHRcdFx0dGhpcy52YWxpZGF0ZUhvb2tzKGF0dHJpYnV0ZXMsIHRhcmdldCwgcmVwb3J0KTtcblx0XHRcdFx0aWYgKGlzVlNDb2RlT3JEZWZhdWx0VGFyZ2V0KHRhcmdldCkpIHtcblx0XHRcdFx0XHR0aGlzLnZhbGlkYXRlTW9kZWwoYXR0cmlidXRlcywgQ2hhdE1vZGVLaW5kLkFnZW50LCByZXBvcnQpO1xuXHRcdFx0XHRcdHRoaXMudmFsaWRhdGVIYW5kb2ZmcyhhdHRyaWJ1dGVzLCByZXBvcnQpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMudmFsaWRhdGVBZ2VudHNBdHRyaWJ1dGUoYXR0cmlidXRlcywgaGVhZGVyLCByZXBvcnQpO1xuXHRcdFx0XHRcdHRoaXMudmFsaWRhdGVHaXRodWJQZXJtaXNzaW9ucyhhdHRyaWJ1dGVzLCByZXBvcnQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRhcmdldCA9PT0gVGFyZ2V0LkNsYXVkZSkge1xuXHRcdFx0XHRcdHRoaXMudmFsaWRhdGVDbGF1ZGVBdHRyaWJ1dGVzKGF0dHJpYnV0ZXMsIHJlcG9ydCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGFyZ2V0ID09PSBUYXJnZXQuR2l0SHViQ29waWxvdCkge1xuXHRcdFx0XHRcdHRoaXMudmFsaWRhdGVHaXRodWJQZXJtaXNzaW9ucyhhdHRyaWJ1dGVzLCByZXBvcnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjYXNlIFByb21wdHNUeXBlLnNraWxsOlxuXHRcdFx0XHR0aGlzLnZhbGlkYXRlVXNlckludm9jYWJsZShhdHRyaWJ1dGVzLCByZXBvcnQpO1xuXHRcdFx0XHR0aGlzLnZhbGlkYXRlRGlzYWJsZU1vZGVsSW52b2NhdGlvbihhdHRyaWJ1dGVzLCByZXBvcnQpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNoZWNrRm9ySW52YWxpZEFyZ3VtZW50cyhhdHRyaWJ1dGVzOiBJSGVhZGVyQXR0cmlidXRlW10sIHByb21wdFR5cGU6IFByb21wdHNUeXBlLCB0YXJnZXQ6IFRhcmdldCwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCB2YWxpZEF0dHJpYnV0ZU5hbWVzID0gZ2V0VmFsaWRBdHRyaWJ1dGVOYW1lcyhwcm9tcHRUeXBlLCB0cnVlLCB0YXJnZXQpO1xuXHRcdGNvbnN0IHZhbGlkR2l0aHViQ29waWxvdEF0dHJpYnV0ZU5hbWVzID0gbmV3IExhenkoKCkgPT4gbmV3IFNldChnZXRWYWxpZEF0dHJpYnV0ZU5hbWVzKHByb21wdFR5cGUsIGZhbHNlLCBUYXJnZXQuR2l0SHViQ29waWxvdCkpKTtcblx0XHRmb3IgKGNvbnN0IGF0dHJpYnV0ZSBvZiBhdHRyaWJ1dGVzKSB7XG5cdFx0XHRpZiAoIXZhbGlkQXR0cmlidXRlTmFtZXMuaW5jbHVkZXMoYXR0cmlidXRlLmtleSkpIHtcblx0XHRcdFx0Y29uc3Qgc3VwcG9ydGVkTmFtZXMgPSBuZXcgTGF6eSgoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbmFtZXMgPSBnZXRWYWxpZEF0dHJpYnV0ZU5hbWVzKHByb21wdFR5cGUsIGZhbHNlLCB0YXJnZXQpO1xuXHRcdFx0XHRcdHJldHVybiBuYW1lcy5zb3J0KCkuam9pbignLCAnKTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHN3aXRjaCAocHJvbXB0VHlwZSkge1xuXHRcdFx0XHRcdGNhc2UgUHJvbXB0c1R5cGUucHJvbXB0OlxuXHRcdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IudW5rbm93bkF0dHJpYnV0ZS5wcm9tcHQnLCBcIkF0dHJpYnV0ZSAnezB9JyBpcyBub3Qgc3VwcG9ydGVkIGluIHByb21wdCBmaWxlcy4gU3VwcG9ydGVkOiB7MX0uXCIsIGF0dHJpYnV0ZS5rZXksIHN1cHBvcnRlZE5hbWVzLnZhbHVlKSwgYXR0cmlidXRlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5IaW50LCBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSkpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSBQcm9tcHRzVHlwZS5hZ2VudDpcblx0XHRcdFx0XHRcdGlmICh0YXJnZXQgPT09IFRhcmdldC5HaXRIdWJDb3BpbG90KSB7XG5cdFx0XHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnVua25vd25BdHRyaWJ1dGUuZ2l0aHViLWFnZW50JywgXCJBdHRyaWJ1dGUgJ3swfScgaXMgbm90IHN1cHBvcnRlZCBpbiBjdXN0b20gR2l0SHViIENvcGlsb3QgYWdlbnQgZmlsZXMuIFN1cHBvcnRlZDogezF9LlwiLCBhdHRyaWJ1dGUua2V5LCBzdXBwb3J0ZWROYW1lcy52YWx1ZSksIGF0dHJpYnV0ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuSGludCwgW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0pKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAodGFyZ2V0ID09PSBUYXJnZXQuQ2xhdWRlKSB7XG5cdFx0XHRcdFx0XHRcdC8vIGlnbm9yZSBmb3Igbm93IGFzIHdlIGRvbid0IGhhdmUgYSBmdWxsIGxpc3Qgb2Ygc3VwcG9ydGVkIGF0dHJpYnV0ZXMgZm9yIGNsYXVkZSB0YXJnZXRcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGlmICh2YWxpZEdpdGh1YkNvcGlsb3RBdHRyaWJ1dGVOYW1lcy52YWx1ZS5oYXMoYXR0cmlidXRlLmtleSkpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5pZ25vcmVkQXR0cmlidXRlLnZzY29kZS1hZ2VudCcsIFwiQXR0cmlidXRlICd7MH0nIGlzIGlnbm9yZWQgd2hlbiBydW5uaW5nIGxvY2FsbHkgaW4gVlMgQ29kZS5cIiwgYXR0cmlidXRlLmtleSksIGF0dHJpYnV0ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuSGludCwgW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0pKTtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci51bmtub3duQXR0cmlidXRlLnZzY29kZS1hZ2VudCcsIFwiQXR0cmlidXRlICd7MH0nIGlzIG5vdCBzdXBwb3J0ZWQgaW4gVlMgQ29kZSBhZ2VudCBmaWxlcy4gU3VwcG9ydGVkOiB7MX0uXCIsIGF0dHJpYnV0ZS5rZXksIHN1cHBvcnRlZE5hbWVzLnZhbHVlKSwgYXR0cmlidXRlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5IaW50LCBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIFByb21wdHNUeXBlLmluc3RydWN0aW9uczpcblx0XHRcdFx0XHRcdGlmICh0YXJnZXQgPT09IFRhcmdldC5DbGF1ZGUpIHtcblx0XHRcdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IudW5rbm93bkF0dHJpYnV0ZS5ydWxlcycsIFwiQXR0cmlidXRlICd7MH0nIGlzIG5vdCBzdXBwb3J0ZWQgaW4gcnVsZXMgZmlsZXMgYnkgVlMgQ29kZSBhZ2VudHMuIFN1cHBvcnRlZDogezF9LlwiLCBhdHRyaWJ1dGUua2V5LCBzdXBwb3J0ZWROYW1lcy52YWx1ZSksIGF0dHJpYnV0ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuSGludCwgW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0pKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnVua25vd25BdHRyaWJ1dGUuaW5zdHJ1Y3Rpb25zJywgXCJBdHRyaWJ1dGUgJ3swfScgaXMgbm90IHN1cHBvcnRlZCBpbiBpbnN0cnVjdGlvbnMgZmlsZXMuIFN1cHBvcnRlZDogezF9LlwiLCBhdHRyaWJ1dGUua2V5LCBzdXBwb3J0ZWROYW1lcy52YWx1ZSksIGF0dHJpYnV0ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuSGludCwgW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0pKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgUHJvbXB0c1R5cGUuc2tpbGw6XG5cdFx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci51bmtub3duQXR0cmlidXRlLnNraWxsJywgXCJBdHRyaWJ1dGUgJ3swfScgaXMgbm90IHN1cHBvcnRlZCBieSBWUyBDb2RlIGFnZW50cy4gU3VwcG9ydGVkOiB7MX0uXCIsIGF0dHJpYnV0ZS5rZXksIHN1cHBvcnRlZE5hbWVzLnZhbHVlKSwgYXR0cmlidXRlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5IaW50LCBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSkpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXG5cblx0cHJpdmF0ZSB2YWxpZGF0ZU5hbWUoYXR0cmlidXRlczogSUhlYWRlckF0dHJpYnV0ZVtdLCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IG5hbWVBdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBhdHRyLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5uYW1lKTtcblx0XHRpZiAoIW5hbWVBdHRyaWJ1dGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKG5hbWVBdHRyaWJ1dGUudmFsdWUudHlwZSAhPT0gJ3NjYWxhcicpIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLm5hbWVNdXN0QmVTdHJpbmcnLCBcIlRoZSAnbmFtZScgYXR0cmlidXRlIG11c3QgYmUgYSBzdHJpbmcuXCIpLCBuYW1lQXR0cmlidXRlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAobmFtZUF0dHJpYnV0ZS52YWx1ZS52YWx1ZS50cmltKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5uYW1lU2hvdWxkTm90QmVFbXB0eScsIFwiVGhlICduYW1lJyBhdHRyaWJ1dGUgbXVzdCBub3QgYmUgZW1wdHkuXCIpLCBuYW1lQXR0cmlidXRlLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVEZXNjcmlwdGlvbihhdHRyaWJ1dGVzOiBJSGVhZGVyQXR0cmlidXRlW10sIHJlcG9ydDogKG1hcmtlcnM6IElNYXJrZXJEYXRhKSA9PiB2b2lkKTogdm9pZCB7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb25BdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBhdHRyLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5kZXNjcmlwdGlvbik7XG5cdFx0aWYgKCFkZXNjcmlwdGlvbkF0dHJpYnV0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZGVzY3JpcHRpb25BdHRyaWJ1dGUudmFsdWUudHlwZSAhPT0gJ3NjYWxhcicpIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmRlc2NyaXB0aW9uTXVzdEJlU3RyaW5nJywgXCJUaGUgJ2Rlc2NyaXB0aW9uJyBhdHRyaWJ1dGUgbXVzdCBiZSBhIHN0cmluZy5cIiksIGRlc2NyaXB0aW9uQXR0cmlidXRlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoZGVzY3JpcHRpb25BdHRyaWJ1dGUudmFsdWUudmFsdWUudHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuZGVzY3JpcHRpb25TaG91bGROb3RCZUVtcHR5JywgXCJUaGUgJ2Rlc2NyaXB0aW9uJyBhdHRyaWJ1dGUgc2hvdWxkIG5vdCBiZSBlbXB0eS5cIiksIGRlc2NyaXB0aW9uQXR0cmlidXRlLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVBcmd1bWVudEhpbnQoYXR0cmlidXRlczogSUhlYWRlckF0dHJpYnV0ZVtdLCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdGNvbnN0IGFyZ3VtZW50SGludEF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXMuZmluZChhdHRyID0+IGF0dHIua2V5ID09PSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFyZ3VtZW50SGludCk7XG5cdFx0aWYgKCFhcmd1bWVudEhpbnRBdHRyaWJ1dGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGFyZ3VtZW50SGludEF0dHJpYnV0ZS52YWx1ZS50eXBlICE9PSAnc2NhbGFyJykge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuYXJndW1lbnRIaW50TXVzdEJlU3RyaW5nJywgXCJUaGUgJ2FyZ3VtZW50LWhpbnQnIGF0dHJpYnV0ZSBtdXN0IGJlIGEgc3RyaW5nLlwiKSwgYXJndW1lbnRIaW50QXR0cmlidXRlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoYXJndW1lbnRIaW50QXR0cmlidXRlLnZhbHVlLnZhbHVlLnRyaW0oKS5sZW5ndGggPT09IDApIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmFyZ3VtZW50SGludFNob3VsZE5vdEJlRW1wdHknLCBcIlRoZSAnYXJndW1lbnQtaGludCcgYXR0cmlidXRlIHNob3VsZCBub3QgYmUgZW1wdHkuXCIpLCBhcmd1bWVudEhpbnRBdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlTW9kZWwoYXR0cmlidXRlczogSUhlYWRlckF0dHJpYnV0ZVtdLCBhZ2VudEtpbmQ6IENoYXRNb2RlS2luZCwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBhdHRyLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlbCk7XG5cdFx0aWYgKCFhdHRyaWJ1dGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGF0dHJpYnV0ZS52YWx1ZS50eXBlICE9PSAnc2NhbGFyJyAmJiBhdHRyaWJ1dGUudmFsdWUudHlwZSAhPT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IubW9kZWxNdXN0QmVTdHJpbmdPckFycmF5JywgXCJUaGUgJ21vZGVsJyBhdHRyaWJ1dGUgbXVzdCBiZSBhIHN0cmluZyBvciBhbiBhcnJheSBvZiBzdHJpbmdzLlwiKSwgYXR0cmlidXRlLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsTmFtZXM6IFtzdHJpbmcsIFJhbmdlXVtdID0gW107XG5cdFx0aWYgKGF0dHJpYnV0ZS52YWx1ZS50eXBlID09PSAnc2NhbGFyJykge1xuXHRcdFx0Y29uc3QgbW9kZWxOYW1lID0gYXR0cmlidXRlLnZhbHVlLnZhbHVlLnRyaW0oKTtcblx0XHRcdGlmIChtb2RlbE5hbWUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLm1vZGVsTXVzdEJlTm9uRW1wdHknLCBcIlRoZSAnbW9kZWwnIGF0dHJpYnV0ZSBtdXN0IGJlIGEgbm9uLWVtcHR5IHN0cmluZy5cIiksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bW9kZWxOYW1lcy5wdXNoKFttb2RlbE5hbWUsIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZV0pO1xuXHRcdH0gZWxzZSBpZiAoYXR0cmlidXRlLnZhbHVlLnR5cGUgPT09ICdzZXF1ZW5jZScpIHtcblx0XHRcdGlmIChhdHRyaWJ1dGUudmFsdWUuaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLm1vZGVsQXJyYXlNdXN0Tm90QmVFbXB0eScsIFwiVGhlICdtb2RlbCcgYXJyYXkgbXVzdCBub3QgYmUgZW1wdHkuXCIpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBhdHRyaWJ1dGUudmFsdWUuaXRlbXMpIHtcblx0XHRcdFx0aWYgKGl0ZW0udHlwZSAhPT0gJ3NjYWxhcicpIHtcblx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5tb2RlbEFycmF5TXVzdENvbnRhaW5TdHJpbmdzJywgXCJUaGUgJ21vZGVsJyBhcnJheSBtdXN0IGNvbnRhaW4gb25seSBzdHJpbmdzLlwiKSwgaXRlbS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbW9kZWxOYW1lID0gaXRlbS52YWx1ZS50cmltKCk7XG5cdFx0XHRcdGlmIChtb2RlbE5hbWUubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IubW9kZWxBcnJheUl0ZW1NdXN0QmVOb25FbXB0eScsIFwiTW9kZWwgbmFtZXMgaW4gdGhlIGFycmF5IG11c3QgYmUgbm9uLWVtcHR5IHN0cmluZ3MuXCIpLCBpdGVtLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRtb2RlbE5hbWVzLnB1c2goW21vZGVsTmFtZSwgaXRlbS5yYW5nZV0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxzID0gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbElkcygpO1xuXHRcdGlmIChsYW5ndWFnZU1vZGVscy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIGxpa2VseSB0aGUgc2VydmljZSBpcyBub3QgaW5pdGlhbGl6ZWQgeWV0XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBbbW9kZWxOYW1lLCByYW5nZV0gb2YgbW9kZWxOYW1lcykge1xuXHRcdFx0Y29uc3QgbW9kZWxNZXRhZGF0YSA9IHRoaXMuZmluZE1vZGVsQnlOYW1lKG1vZGVsTmFtZSk7XG5cdFx0XHRpZiAoIW1vZGVsTWV0YWRhdGEpIHtcblx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IubW9kZWxOb3RGb3VuZCcsIFwiVW5rbm93biBtb2RlbCAnezB9JyB3aWxsIGJlIGlnbm9yZWQuXCIsIG1vZGVsTmFtZSksIHJhbmdlLCBNYXJrZXJTZXZlcml0eS5IaW50LCBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSkpO1xuXHRcdFx0fSBlbHNlIGlmIChhZ2VudEtpbmQgPT09IENoYXRNb2RlS2luZC5BZ2VudCAmJiAhSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEuc3VpdGFibGVGb3JBZ2VudE1vZGUobW9kZWxNZXRhZGF0YSkpIHtcblx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IubW9kZWxOb3RTdWl0ZWQnLCBcIk1vZGVsICd7MH0nIGlzIG5vdCBzdWl0ZWQgZm9yIGFnZW50IG1vZGUuXCIsIG1vZGVsTmFtZSksIHJhbmdlLCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZUNsYXVkZUF0dHJpYnV0ZXMoYXR0cmlidXRlczogSUhlYWRlckF0dHJpYnV0ZVtdLCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdC8vIHZhaWRhdGUgYWxsIGNsYXVkZS1zcGVjaWZpYyBhdHRyaWJ1dGVzIHRoYXQgaGF2ZSBlbnVtIHZhbHVlc1xuXHRcdGZvciAoY29uc3QgY2xhdWRlQXR0cmlidXRlTmFtZSBpbiBjbGF1ZGVBZ2VudEF0dHJpYnV0ZXMpIHtcblx0XHRcdGNvbnN0IGNsYXVkZUF0dHJpYnV0ZSA9IGNsYXVkZUFnZW50QXR0cmlidXRlc1tjbGF1ZGVBdHRyaWJ1dGVOYW1lXTtcblx0XHRcdGNvbnN0IGVudW1WYWx1ZXMgPSBjbGF1ZGVBdHRyaWJ1dGUuZW51bXM7XG5cdFx0XHRpZiAoZW51bVZhbHVlcykge1xuXHRcdFx0XHRjb25zdCBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBhdHRyLmtleSA9PT0gY2xhdWRlQXR0cmlidXRlTmFtZSk7XG5cdFx0XHRcdGlmICghYXR0cmlidXRlKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGF0dHJpYnV0ZS52YWx1ZS50eXBlICE9PSAnc2NhbGFyJykge1xuXHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmNsYXVkZS5hdHRyaWJ1dGVNdXN0QmVTdHJpbmcnLCBcIlRoZSAnezB9JyBhdHRyaWJ1dGUgbXVzdCBiZSBhIHN0cmluZy5cIiwgY2xhdWRlQXR0cmlidXRlTmFtZSksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBtb2RlbE5hbWUgPSBhdHRyaWJ1dGUudmFsdWUudmFsdWUudHJpbSgpO1xuXHRcdFx0XHRcdGlmIChlbnVtVmFsdWVzLmV2ZXJ5KG1vZGVsID0+IG1vZGVsLm5hbWUgIT09IG1vZGVsTmFtZSkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHZhbGlkVmFsdWVzID0gZW51bVZhbHVlcy5tYXAobW9kZWwgPT4gbW9kZWwubmFtZSkuam9pbignLCAnKTtcblx0XHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmNsYXVkZS5hdHRyaWJ1dGVOb3RGb3VuZCcsIFwiVW5rbm93biB2YWx1ZSAnezB9JywgdmFsaWQ6IHsxfS5cIiwgbW9kZWxOYW1lLCB2YWxpZFZhbHVlcyksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZmluZE1vZGVsQnlOYW1lKG1vZGVsTmFtZTogc3RyaW5nKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1ldGFkYXRhQW5kSWQgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsQnlRdWFsaWZpZWROYW1lKG1vZGVsTmFtZSk7XG5cdFx0aWYgKG1ldGFkYXRhQW5kSWQgJiYgbWV0YWRhdGFBbmRJZC5tZXRhZGF0YS5pc1VzZXJTZWxlY3RhYmxlICE9PSBmYWxzZSkge1xuXHRcdFx0cmV0dXJuIG1ldGFkYXRhQW5kSWQubWV0YWRhdGE7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHZhbGlkYXRlQWdlbnQoYXR0cmlidXRlczogSUhlYWRlckF0dHJpYnV0ZVtdLCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IFByb21pc2U8SUNoYXRNb2RlIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYWdlbnRBdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBhdHRyLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hZ2VudCk7XG5cdFx0Y29uc3QgbW9kZUF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXMuZmluZChhdHRyID0+IGF0dHIua2V5ID09PSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm1vZGUpO1xuXHRcdGlmIChtb2RlQXR0cmlidXRlKSB7XG5cdFx0XHRpZiAoYWdlbnRBdHRyaWJ1dGUpIHtcblx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IubW9kZURlcHJlY2F0ZWQnLCBcIlRoZSAnbW9kZScgYXR0cmlidXRlIGhhcyBiZWVuIGRlcHJlY2F0ZWQuIFRoZSAnYWdlbnQnIGF0dHJpYnV0ZSBpcyB1c2VkIGluc3RlYWQuXCIpLCBtb2RlQXR0cmlidXRlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nLCBbTWFya2VyVGFnLkRlcHJlY2F0ZWRdKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5tb2RlRGVwcmVjYXRlZC51c2VBZ2VudCcsIFwiVGhlICdtb2RlJyBhdHRyaWJ1dGUgaGFzIGJlZW4gZGVwcmVjYXRlZC4gUGxlYXNlIHJlbmFtZSBpdCB0byAnYWdlbnQnLlwiKSwgbW9kZUF0dHJpYnV0ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZywgW01hcmtlclRhZy5EZXByZWNhdGVkXSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXMuZmluZChhdHRyID0+IGF0dHIua2V5ID09PSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFnZW50KSA/PyBtb2RlQXR0cmlidXRlO1xuXHRcdGlmICghYXR0cmlidXRlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkOyAvLyBkZWZhdWx0IGFnZW50IGZvciBwcm9tcHRzIGlzIEFnZW50XG5cdFx0fVxuXHRcdGlmIChhdHRyaWJ1dGUudmFsdWUudHlwZSAhPT0gJ3NjYWxhcicpIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmF0dHJpYnV0ZU11c3RCZVN0cmluZycsIFwiVGhlICd7MH0nIGF0dHJpYnV0ZSBtdXN0IGJlIGEgc3RyaW5nLlwiLCBhdHRyaWJ1dGUua2V5KSwgYXR0cmlidXRlLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgYWdlbnRWYWx1ZSA9IGF0dHJpYnV0ZS52YWx1ZS52YWx1ZTtcblx0XHRpZiAoYWdlbnRWYWx1ZS50cmltKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5hdHRyaWJ1dGVNdXN0QmVOb25FbXB0eScsIFwiVGhlICd7MH0nIGF0dHJpYnV0ZSBtdXN0IGJlIGEgbm9uLWVtcHR5IHN0cmluZy5cIiwgYXR0cmlidXRlLmtleSksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBhd2FpdCB0aGlzLnZhbGlkYXRlQWdlbnRWYWx1ZShhdHRyaWJ1dGUudmFsdWUsIHJlcG9ydCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHZhbGlkYXRlQWdlbnRWYWx1ZSh2YWx1ZTogSVNjYWxhclZhbHVlLCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IFByb21pc2U8SUNoYXRNb2RlIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgYWdlbnRzID0gYXdhaXQgdGhpcy5jaGF0TW9kZVNlcnZpY2UuZ2V0TG9jYWxNb2RlcygpO1xuXHRcdGNvbnN0IGF2YWlsYWJsZUFnZW50cyA9IFtdO1xuXG5cdFx0Ly8gQ2hlY2sgaWYgYWdlbnQgZXhpc3RzIGluIGJ1aWx0aW4gb3IgY3VzdG9tIGFnZW50c1xuXHRcdGZvciAoY29uc3QgYWdlbnQgb2YgSXRlcmFibGUuY29uY2F0KGFnZW50cy5idWlsdGluLCBhZ2VudHMuY3VzdG9tKSkge1xuXHRcdFx0aWYgKGFnZW50Lm5hbWUuZ2V0KCkgPT09IHZhbHVlLnZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiBhZ2VudDtcblx0XHRcdH1cblx0XHRcdGF2YWlsYWJsZUFnZW50cy5wdXNoKGFnZW50Lm5hbWUuZ2V0KCkpOyAvLyBjb2xsZWN0IGFsbCBhdmFpbGFibGUgYWdlbnQgbmFtZXNcblx0XHR9XG5cblx0XHRjb25zdCBlcnJvck1lc3NhZ2UgPSBsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmFnZW50Tm90Rm91bmQnLCBcIlVua25vd24gYWdlbnQgJ3swfScuIEF2YWlsYWJsZSBhZ2VudHM6IHsxfS5cIiwgdmFsdWUudmFsdWUsIGF2YWlsYWJsZUFnZW50cy5qb2luKCcsICcpKTtcblx0XHRyZXBvcnQodG9NYXJrZXIoZXJyb3JNZXNzYWdlLCB2YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZykpO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlVG9vbHMoYXR0cmlidXRlczogSUhlYWRlckF0dHJpYnV0ZVtdLCBhZ2VudEtpbmQ6IENoYXRNb2RlS2luZCwgdGFyZ2V0OiBUYXJnZXQsIHJlcG9ydDogKG1hcmtlcnM6IElNYXJrZXJEYXRhKSA9PiB2b2lkKTogdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBhdHRyLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy50b29scyk7XG5cdFx0aWYgKCFhdHRyaWJ1dGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGFnZW50S2luZCAhPT0gQ2hhdE1vZGVLaW5kLkFnZW50KSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci50b29sc09ubHlJbkFnZW50JywgXCJUaGUgJ3Rvb2xzJyBhdHRyaWJ1dGUgaXMgb25seSBzdXBwb3J0ZWQgd2hlbiB1c2luZyBhZ2VudHMuIEF0dHJpYnV0ZSB3aWxsIGJlIGlnbm9yZWQuXCIpLCBhdHRyaWJ1dGUucmFuZ2UsIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpKTtcblx0XHR9XG5cdFx0bGV0IHZhbHVlID0gYXR0cmlidXRlLnZhbHVlO1xuXHRcdGlmICh2YWx1ZS50eXBlID09PSAnc2NhbGFyJykge1xuXHRcdFx0dmFsdWUgPSBwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdCh2YWx1ZSk7XG5cdFx0fVxuXHRcdGlmICh2YWx1ZS50eXBlICE9PSAnc2VxdWVuY2UnKSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci50b29sc011c3RCZUFycmF5T3JNYXAnLCBcIlRoZSAndG9vbHMnIGF0dHJpYnV0ZSBtdXN0IGJlIGFuIGFycmF5IG9yIGEgY29tbWEgc2VwYXJhdGVkIHN0cmluZy5cIiksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRhcmdldCA9PT0gVGFyZ2V0LkdpdEh1YkNvcGlsb3QgfHwgdGFyZ2V0ID09PSBUYXJnZXQuQ2xhdWRlKSB7XG5cdFx0XHQvLyBubyB2YWxpZGF0aW9uIGZvciBnaXRodWItY29waWxvdCB0YXJnZXQgYW5kIGNsYXVkZVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnZhbGlkYXRlVlNDb2RlVG9vbHModmFsdWUsIHJlcG9ydCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZVZTQ29kZVRvb2xzKHZhbHVlSXRlbTogSVNlcXVlbmNlVmFsdWUsIHJlcG9ydDogKG1hcmtlcnM6IElNYXJrZXJEYXRhKSA9PiB2b2lkKSB7XG5cdFx0aWYgKHZhbHVlSXRlbS5pdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBhdmFpbGFibGUgPSBuZXcgU2V0PHN0cmluZz4odGhpcy5sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmdldEZ1bGxSZWZlcmVuY2VOYW1lcygpKTtcblx0XHRcdGNvbnN0IGRlcHJlY2F0ZWROYW1lcyA9IHRoaXMubGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5nZXREZXByZWNhdGVkRnVsbFJlZmVyZW5jZU5hbWVzKCk7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdmFsdWVJdGVtLml0ZW1zKSB7XG5cdFx0XHRcdGlmIChpdGVtLnR5cGUgIT09ICdzY2FsYXInKSB7XG5cdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuZWFjaFRvb2xNdXN0QmVTdHJpbmcnLCBcIkVhY2ggdG9vbCBuYW1lIGluIHRoZSAndG9vbHMnIGF0dHJpYnV0ZSBtdXN0IGJlIGEgc3RyaW5nLlwiKSwgaXRlbS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0fSBlbHNlIGlmIChpdGVtLnZhbHVlKSB7XG5cdFx0XHRcdFx0aWYgKCFhdmFpbGFibGUuaGFzKGl0ZW0udmFsdWUpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjdXJyZW50TmFtZXMgPSBkZXByZWNhdGVkTmFtZXMuZ2V0KGl0ZW0udmFsdWUpO1xuXHRcdFx0XHRcdFx0aWYgKGN1cnJlbnROYW1lcykge1xuXHRcdFx0XHRcdFx0XHRpZiAoY3VycmVudE5hbWVzPy5zaXplID09PSAxKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgbmV3TmFtZSA9IEFycmF5LmZyb20oY3VycmVudE5hbWVzKVswXTtcblx0XHRcdFx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci50b29sRGVwcmVjYXRlZCcsIFwiVG9vbCBvciB0b29sc2V0ICd7MH0nIGhhcyBiZWVuIHJlbmFtZWQsIHVzZSAnezF9JyBpbnN0ZWFkLlwiLCBpdGVtLnZhbHVlLCBuZXdOYW1lKSwgaXRlbS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuSW5mbywgW01hcmtlclRhZy5EZXByZWNhdGVkXSkpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IG5ld05hbWVzID0gQXJyYXkuZnJvbShjdXJyZW50TmFtZXMpLnNvcnQoKGEsIGIpID0+IGEubG9jYWxlQ29tcGFyZShiKSkuam9pbignLCAnKTtcblx0XHRcdFx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci50b29sRGVwcmVjYXRlZE11bHRpcGxlTmFtZXMnLCBcIlRvb2wgb3IgdG9vbHNldCAnezB9JyBoYXMgYmVlbiByZW5hbWVkLCB1c2UgdGhlIGZvbGxvd2luZyB0b29scyBpbnN0ZWFkOiB7MX1cIiwgaXRlbS52YWx1ZSwgbmV3TmFtZXMpLCBpdGVtLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5JbmZvLCBbTWFya2VyVGFnLkRlcHJlY2F0ZWRdKSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG1pc3NpbmdHaXRodWJTZXJ2ZXJNYXJrZXIgPSB0aGlzLmdldE1pc3NpbmdHaXRodWJNY3BTZXJ2ZXJNYXJrZXIoaXRlbS52YWx1ZSwgaXRlbS5yYW5nZSk7XG5cdFx0XHRcdFx0XHRcdGlmIChtaXNzaW5nR2l0aHViU2VydmVyTWFya2VyKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVwb3J0KG1pc3NpbmdHaXRodWJTZXJ2ZXJNYXJrZXIpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdGNvbnN0IG1pc3NpbmdQbGF5d3JpZ2h0U2VydmVyTWFya2VyID0gdGhpcy5nZXRNaXNzaW5nUGxheXdyaWdodE1jcFNlcnZlck1hcmtlcihpdGVtLnZhbHVlLCBpdGVtLnJhbmdlKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAobWlzc2luZ1BsYXl3cmlnaHRTZXJ2ZXJNYXJrZXIpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJlcG9ydChtaXNzaW5nUGxheXdyaWdodFNlcnZlck1hcmtlcik7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdHJlcG9ydCh0aGlzLmdldFVua25vd25Ub29sTWFya2VyKGl0ZW0udmFsdWUsIGl0ZW0ucmFuZ2UsIGZhbHNlKSk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRVbmtub3duVG9vbE1hcmtlcih0b29sUmVmZXJlbmNlTmFtZTogc3RyaW5nLCByYW5nZTogUmFuZ2UsIGlzVmFyaWFibGVSZWZlcmVuY2U6IGJvb2xlYW4pOiBJTWFya2VyRGF0YSB7XG5cdFx0Y29uc3Qgc3BsaXRCeVNsYXNoID0gdG9vbFJlZmVyZW5jZU5hbWUuc3BsaXQoJy8nKTtcblx0XHRjb25zdCBzbGFzaENvdW50ID0gc3BsaXRCeVNsYXNoLmxlbmd0aCAtIDE7XG5cdFx0Y29uc3QgaGFzRXh0ZW5zaW9uTGlrZU5hbWUgPSBzcGxpdEJ5U2xhc2hbMF0uaW5jbHVkZXMoJy4nKTtcblx0XHRpZiAoc2xhc2hDb3VudCA+PSAyKSB7XG5cdFx0XHRyZXR1cm4gdG9NYXJrZXIoXG5cdFx0XHRcdGxvY2FsaXplKFxuXHRcdFx0XHRcdCdwcm9tcHRWYWxpZGF0b3IudW5rbm93bk1jcFNlcnZlclJlZmVyZW5jZScsXG5cdFx0XHRcdFx0XCJVbmtub3duIHRvb2wgJ3swfScuIEl0IGlzIGxpa2VseSB0byBiZSBhIG1pc3NpbmcgTUNQIHNlcnZlciwgcGxlYXNlIGVuc3VyZSBpdCBpcyBpbnN0YWxsZWQgYW5kIGVuYWJsZWQuXCIsXG5cdFx0XHRcdFx0dG9vbFJlZmVyZW5jZU5hbWVcblx0XHRcdFx0KSxcblx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdE1hcmtlclNldmVyaXR5LkhpbnQsXG5cdFx0XHRcdFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldLFxuXHRcdFx0XHRQcm9tcHRWYWxpZGF0b3JNYXJrZXJDb2RlLlVua25vd25NY3BTZXJ2ZXJSZWZlcmVuY2Vcblx0XHRcdCk7XG5cdFx0fVxuXHRcdGlmIChoYXNFeHRlbnNpb25MaWtlTmFtZSkge1xuXHRcdFx0cmV0dXJuIHRvTWFya2VyKFxuXHRcdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0XHQncHJvbXB0VmFsaWRhdG9yLnVua25vd25FeHRlbnNpb25SZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFwiVW5rbm93biBleHRlbnNpb24gdG9vbCAnezB9Jy4gSXQgaXMgbGlrZWx5IHRvIGJlIGEgbWlzc2luZyBleHRlbnNpb24sIHBsZWFzZSBlbnN1cmUgaXQgaXMgaW5zdGFsbGVkIGFuZCBlbmFibGVkLlwiLFxuXHRcdFx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lXG5cdFx0XHRcdCksXG5cdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRNYXJrZXJTZXZlcml0eS5IaW50LFxuXHRcdFx0XHRbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSxcblx0XHRcdFx0UHJvbXB0VmFsaWRhdG9yTWFya2VyQ29kZS5Vbmtub3duRXh0ZW5zaW9uUmVmZXJlbmNlXG5cdFx0XHQpO1xuXHRcdH1cblx0XHRpZiAoaXNWYXJpYWJsZVJlZmVyZW5jZSkge1xuXHRcdFx0cmV0dXJuIHRvTWFya2VyKFxuXHRcdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0XHQncHJvbXB0VmFsaWRhdG9yLnVua25vd25WYXJpYWJsZVJlZmVyZW5jZScsXG5cdFx0XHRcdFx0XCJVbmtub3duIHRvb2wgb3IgdG9vbHNldCAnezB9Jy5cIixcblx0XHRcdFx0XHR0b29sUmVmZXJlbmNlTmFtZVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0TWFya2VyU2V2ZXJpdHkuSGludCxcblx0XHRcdFx0W01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0sXG5cdFx0XHRcdFByb21wdFZhbGlkYXRvck1hcmtlckNvZGUuVW5rbm93bkV4dGVuc2lvbk9yTWNwU2VydmVyUmVmZXJlbmNlXG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdG9NYXJrZXIoXG5cdFx0XHRcdGxvY2FsaXplKFxuXHRcdFx0XHRcdCdwcm9tcHRWYWxpZGF0b3IudW5rbm93blRvb2xSZWZlcmVuY2UnLFxuXHRcdFx0XHRcdFwiVW5rbm93biB0b29sICd7MH0nIHdpbGwgYmUgaWdub3JlZC5cIixcblx0XHRcdFx0XHR0b29sUmVmZXJlbmNlTmFtZVxuXHRcdFx0XHQpLFxuXHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0TWFya2VyU2V2ZXJpdHkuSGludCxcblx0XHRcdFx0W01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0sXG5cdFx0XHRcdFByb21wdFZhbGlkYXRvck1hcmtlckNvZGUuVW5rbm93bkV4dGVuc2lvbk9yTWNwU2VydmVyUmVmZXJlbmNlXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0TWlzc2luZ0dpdGh1Yk1jcFNlcnZlck1hcmtlcih0b29sUmVmZXJlbmNlTmFtZTogc3RyaW5nLCByYW5nZTogUmFuZ2UpOiBJTWFya2VyRGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRvb2xSZWZlcmVuY2VOYW1lICE9PSAnZ2l0aHViLyonKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdG9NYXJrZXIoXG5cdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0J3Byb21wdFZhbGlkYXRvci5taXNzaW5nR2l0aHViTWNwU2VydmVyJyxcblx0XHRcdFx0XCJUb29sIGFsaWFzICd7MH0nIHJlcXVpcmVzIHRoZSBHaXRIdWIgTUNQIHNlcnZlci4gRW5hYmxlIHRoZSBidWlsdC1pbiBzZXJ2ZXIgd2l0aCBzZXR0aW5nICdnaXRodWIuY29waWxvdC5jaGF0LmdpdGh1Yk1jcFNlcnZlci5lbmFibGVkJyBvciBpbnN0YWxsIGV4dGVuc2lvbiAnaW8uZ2l0aHViLmdpdGh1Yi9naXRodWItbWNwLXNlcnZlcicgZnJvbSBFeHRlbnNpb25zIChgQG1jcCBnaXRodWJgKS5cIixcblx0XHRcdFx0dG9vbFJlZmVyZW5jZU5hbWVcblx0XHRcdCksXG5cdFx0XHRyYW5nZSxcblx0XHRcdE1hcmtlclNldmVyaXR5LkhpbnQsXG5cdFx0XHRbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSxcblx0XHRcdFByb21wdFZhbGlkYXRvck1hcmtlckNvZGUuTWlzc2luZ0dpdGh1Yk1jcFNlcnZlclxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGdldE1pc3NpbmdQbGF5d3JpZ2h0TWNwU2VydmVyTWFya2VyKHRvb2xSZWZlcmVuY2VOYW1lOiBzdHJpbmcsIHJhbmdlOiBSYW5nZSk6IElNYXJrZXJEYXRhIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodG9vbFJlZmVyZW5jZU5hbWUgIT09ICdwbGF5d3JpZ2h0LyonKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdG9NYXJrZXIoXG5cdFx0XHRsb2NhbGl6ZShcblx0XHRcdFx0J3Byb21wdFZhbGlkYXRvci5taXNzaW5nUGxheXdyaWdodE1jcFNlcnZlcicsXG5cdFx0XHRcdFwiVG9vbCBhbGlhcyAnezB9JyByZXF1aXJlcyB0aGUgUGxheXdyaWdodCBNQ1Agc2VydmVyLiBJbnN0YWxsIGl0IGZyb20gRXh0ZW5zaW9ucyAoYEBtY3AgcGxheXdyaWdodGApLlwiLFxuXHRcdFx0XHR0b29sUmVmZXJlbmNlTmFtZVxuXHRcdFx0KSxcblx0XHRcdHJhbmdlLFxuXHRcdFx0TWFya2VyU2V2ZXJpdHkuSGludCxcblx0XHRcdFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldLFxuXHRcdFx0UHJvbXB0VmFsaWRhdG9yTWFya2VyQ29kZS5NaXNzaW5nUGxheXdyaWdodE1jcFNlcnZlclxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlQXBwbHlUbyhhdHRyaWJ1dGVzOiBJSGVhZGVyQXR0cmlidXRlW10sIHJlcG9ydDogKG1hcmtlcnM6IElNYXJrZXJEYXRhKSA9PiB2b2lkKTogdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBhdHRyLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hcHBseVRvKTtcblx0XHRpZiAoIWF0dHJpYnV0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoYXR0cmlidXRlLnZhbHVlLnR5cGUgIT09ICdzY2FsYXInKSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5hcHBseVRvTXVzdEJlU3RyaW5nJywgXCJUaGUgJ2FwcGx5VG8nIGF0dHJpYnV0ZSBtdXN0IGJlIGEgc3RyaW5nLlwiKSwgYXR0cmlidXRlLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwYXR0ZXJuID0gYXR0cmlidXRlLnZhbHVlLnZhbHVlO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXR0ZXJucyA9IHNwbGl0R2xvYkF3YXJlKHBhdHRlcm4sICcsJyk7XG5cdFx0XHRpZiAocGF0dGVybnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmFwcGx5VG9NdXN0QmVWYWxpZEdsb2InLCBcIlRoZSAnYXBwbHlUbycgYXR0cmlidXRlIG11c3QgYmUgYSB2YWxpZCBnbG9iIHBhdHRlcm4uXCIpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgcGF0dGVybiBvZiBwYXR0ZXJucykge1xuXHRcdFx0XHRjb25zdCBnbG9iUGF0dGVybiA9IHBhcnNlKHBhdHRlcm4pO1xuXHRcdFx0XHRpZiAoaXNFbXB0eVBhdHRlcm4oZ2xvYlBhdHRlcm4pKSB7XG5cdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuYXBwbHlUb011c3RCZVZhbGlkR2xvYicsIFwiVGhlICdhcHBseVRvJyBhdHRyaWJ1dGUgbXVzdCBiZSBhIHZhbGlkIGdsb2IgcGF0dGVybi5cIiksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChfZXJyb3IpIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmFwcGx5VG9NdXN0QmVWYWxpZEdsb2InLCBcIlRoZSAnYXBwbHlUbycgYXR0cmlidXRlIG11c3QgYmUgYSB2YWxpZCBnbG9iIHBhdHRlcm4uXCIpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZVBhdGhzKGF0dHJpYnV0ZXM6IElIZWFkZXJBdHRyaWJ1dGVbXSwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXMuZmluZChhdHRyID0+IGF0dHIua2V5ID09PSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnBhdGhzKTtcblx0XHRpZiAoIWF0dHJpYnV0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoYXR0cmlidXRlLnZhbHVlLnR5cGUgIT09ICdzZXF1ZW5jZScpIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnBhdGhzTXVzdEJlQXJyYXknLCBcIlRoZSAncGF0aHMnIGF0dHJpYnV0ZSBtdXN0IGJlIGFuIGFycmF5IG9mIGdsb2IgcGF0dGVybnMuXCIpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgaXRlbSBvZiBhdHRyaWJ1dGUudmFsdWUuaXRlbXMpIHtcblx0XHRcdGlmIChpdGVtLnR5cGUgIT09ICdzY2FsYXInKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmVhY2hQYXRoTXVzdEJlU3RyaW5nJywgXCJFYWNoIGVudHJ5IGluIHRoZSAncGF0aHMnIGF0dHJpYnV0ZSBtdXN0IGJlIGEgc3RyaW5nLlwiKSwgaXRlbS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBwYXR0ZXJuID0gaXRlbS52YWx1ZS50cmltKCk7XG5cdFx0XHRpZiAocGF0dGVybi5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IucGF0aE11c3RCZU5vbkVtcHR5JywgXCJQYXRoIGVudHJpZXMgbXVzdCBiZSBub24tZW1wdHkgZ2xvYiBwYXR0ZXJucy5cIiksIGl0ZW0ucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgZ2xvYlBhdHRlcm4gPSBwYXJzZShwYXR0ZXJuKTtcblx0XHRcdFx0aWYgKGlzRW1wdHlQYXR0ZXJuKGdsb2JQYXR0ZXJuKSkge1xuXHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnBhdGhNdXN0QmVWYWxpZEdsb2InLCBcIid7MH0nIGlzIG5vdCBhIHZhbGlkIGdsb2IgcGF0dGVybi5cIiwgcGF0dGVybiksIGl0ZW0ucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKF9lcnJvcikge1xuXHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5wYXRoTXVzdEJlVmFsaWRHbG9iJywgXCInezB9JyBpcyBub3QgYSB2YWxpZCBnbG9iIHBhdHRlcm4uXCIsIHBhdHRlcm4pLCBpdGVtLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdmFsaWRhdGVFeGNsdWRlQWdlbnQoYXR0cmlidXRlczogSUhlYWRlckF0dHJpYnV0ZVtdLCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYXR0cmlidXRlID0gYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuZXhjbHVkZUFnZW50KTtcblx0XHRpZiAoIWF0dHJpYnV0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoYXR0cmlidXRlLnZhbHVlLnR5cGUgIT09ICdzZXF1ZW5jZScgJiYgYXR0cmlidXRlLnZhbHVlLnR5cGUgIT09ICdzY2FsYXInKSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5leGNsdWRlQWdlbnRNdXN0QmVBcnJheScsIFwiVGhlICdleGNsdWRlQWdlbnQnIGF0dHJpYnV0ZSBtdXN0IGJlIGFuIHN0cmluZyBvciBhcnJheS5cIiksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlSG9va3MoYXR0cmlidXRlczogSUhlYWRlckF0dHJpYnV0ZVtdLCB0YXJnZXQ6IFRhcmdldCwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGF0dHJpYnV0ZSA9IGF0dHJpYnV0ZXMuZmluZChhdHRyID0+IGF0dHIua2V5ID09PSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmhvb2tzKTtcblx0XHRpZiAoIWF0dHJpYnV0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoYXR0cmlidXRlLnZhbHVlLnR5cGUgIT09ICdtYXAnKSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5ob29rc011c3RCZU1hcCcsIFwiVGhlICdob29rcycgYXR0cmlidXRlIG11c3QgYmUgYSBtYXAgb2YgaG9vayBldmVudCB0eXBlcyB0byBjb21tYW5kIGFycmF5cy5cIiksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdmFsaWRIb29rTmFtZXMgPSBuZXcgU2V0KE9iamVjdC5rZXlzKEhPT0tTX0JZX1RBUkdFVFt0YXJnZXRdID8/IEhPT0tTX0JZX1RBUkdFVFtUYXJnZXQuVW5kZWZpbmVkXSkpO1xuXHRcdGZvciAoY29uc3QgcHJvcCBvZiBhdHRyaWJ1dGUudmFsdWUucHJvcGVydGllcykge1xuXHRcdFx0aWYgKCF2YWxpZEhvb2tOYW1lcy5oYXMocHJvcC5rZXkudmFsdWUpKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnVua25vd25Ib29rVHlwZScsIFwiVW5rbm93biBob29rIGV2ZW50IHR5cGUgJ3swfScuIFN1cHBvcnRlZDogezF9LlwiLCBwcm9wLmtleS52YWx1ZSwgQXJyYXkuZnJvbSh2YWxpZEhvb2tOYW1lcykuam9pbignLCAnKSksIHByb3Aua2V5LnJhbmdlLCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocHJvcC52YWx1ZS50eXBlICE9PSAnc2VxdWVuY2UnKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmhvb2tWYWx1ZU11c3RCZUFycmF5JywgXCJIb29rIGV2ZW50ICd7MH0nIG11c3QgaGF2ZSBhbiBhcnJheSBvZiBjb21tYW5kIG9iamVjdHMgYXMgaXRzIHZhbHVlLlwiLCBwcm9wLmtleS52YWx1ZSksIHByb3AudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHByb3AudmFsdWUuaXRlbXMpIHtcblx0XHRcdFx0dGhpcy52YWxpZGF0ZUhvb2tDb21tYW5kKGl0ZW0sIHRhcmdldCwgcmVwb3J0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlSG9va0NvbW1hbmQoaXRlbTogSVZhbHVlLCB0YXJnZXQ6IFRhcmdldCwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRpZiAoaXRlbS50eXBlICE9PSAnbWFwJykge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuaG9va0NvbW1hbmRNdXN0QmVPYmplY3QnLCBcIkVhY2ggaG9vayBjb21tYW5kIG11c3QgYmUgYW4gb2JqZWN0LlwiKSwgaXRlbS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEZXRlY3QgbmVzdGVkIG1hdGNoZXIgZm9ybWF0OiB7IG1hdGNoZXI/OiBcIi4uLlwiLCBob29rczogW3sgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnLi4uJyB9XSB9XG5cdFx0Y29uc3QgaG9va3NQcm9wZXJ0eSA9IGl0ZW0ucHJvcGVydGllcy5maW5kKHAgPT4gcC5rZXkudmFsdWUgPT09ICdob29rcycpO1xuXHRcdGlmIChob29rc1Byb3BlcnR5KSB7XG5cdFx0XHQvLyBWYWxpZGF0ZSB0aGF0IG9ubHkga25vd24gbWF0Y2hlciBwcm9wZXJ0aWVzIGFyZSBwcmVzZW50XG5cdFx0XHRmb3IgKGNvbnN0IHByb3Agb2YgaXRlbS5wcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdGlmIChwcm9wLmtleS52YWx1ZSAhPT0gJ2hvb2tzJyAmJiBwcm9wLmtleS52YWx1ZSAhPT0gJ21hdGNoZXInKSB7XG5cdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IudW5rbm93bk1hdGNoZXJQcm9wZXJ0eScsIFwiVW5rbm93biBwcm9wZXJ0eSAnezB9JyBpbiBob29rIG1hdGNoZXIuXCIsIHByb3Aua2V5LnZhbHVlKSwgcHJvcC5rZXkucmFuZ2UsIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGhvb2tzUHJvcGVydHkudmFsdWUudHlwZSAhPT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5uZXN0ZWRIb29rc011c3RCZUFycmF5JywgXCJUaGUgJ2hvb2tzJyBwcm9wZXJ0eSBpbiBhIG1hdGNoZXIgbXVzdCBiZSBhbiBhcnJheSBvZiBjb21tYW5kIG9iamVjdHMuXCIpLCBob29rc1Byb3BlcnR5LnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IG5lc3RlZEl0ZW0gb2YgaG9va3NQcm9wZXJ0eS52YWx1ZS5pdGVtcykge1xuXHRcdFx0XHR0aGlzLnZhbGlkYXRlSG9va0NvbW1hbmQobmVzdGVkSXRlbSwgdGFyZ2V0LCByZXBvcnQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzQ29waWxvdENsaSA9IHRhcmdldCA9PT0gVGFyZ2V0LkdpdEh1YkNvcGlsb3Q7XG5cblx0XHQvLyBEZXRlcm1pbmUgdmFsaWQgYW5kIGNvbW1hbmQtcHJvdmlkaW5nIHByb3BlcnRpZXMgYmFzZWQgb24gdGFyZ2V0XG5cdFx0Y29uc3QgdmFsaWRDb21tYW5kRmllbGRzID0gaXNDb3BpbG90Q2xpXG5cdFx0XHQ/IG5ldyBTZXQoWydiYXNoJywgJ3Bvd2Vyc2hlbGwnXSlcblx0XHRcdDogbmV3IFNldChbJ2NvbW1hbmQnLCAnd2luZG93cycsICdsaW51eCcsICdvc3gnLCAnYmFzaCcsICdwb3dlcnNoZWxsJ10pO1xuXG5cdFx0Y29uc3QgdmFsaWRQcm9wZXJ0aWVzID0gaXNDb3BpbG90Q2xpXG5cdFx0XHQ/IG5ldyBTZXQoWyd0eXBlJywgJ2Jhc2gnLCAncG93ZXJzaGVsbCcsICdjd2QnLCAnZW52JywgJ3RpbWVvdXRTZWMnXSlcblx0XHRcdDogbmV3IFNldChbJ3R5cGUnLCAnY29tbWFuZCcsICd3aW5kb3dzJywgJ2xpbnV4JywgJ29zeCcsICdiYXNoJywgJ3Bvd2Vyc2hlbGwnLCAnY3dkJywgJ2VudicsICd0aW1lb3V0J10pO1xuXG5cdFx0bGV0IGhhc1R5cGUgPSBmYWxzZTtcblx0XHRsZXQgaGFzQ29tbWFuZEZpZWxkID0gZmFsc2U7XG5cblx0XHRmb3IgKGNvbnN0IHByb3Agb2YgaXRlbS5wcm9wZXJ0aWVzKSB7XG5cdFx0XHRjb25zdCBrZXkgPSBwcm9wLmtleS52YWx1ZTtcblxuXHRcdFx0aWYgKCF2YWxpZFByb3BlcnRpZXMuaGFzKGtleSkpIHtcblx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IudW5rbm93bkhvb2tQcm9wZXJ0eScsIFwiVW5rbm93biBwcm9wZXJ0eSAnezB9JyBpbiBob29rIGNvbW1hbmQuXCIsIGtleSksIHByb3Aua2V5LnJhbmdlLCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChrZXkgPT09ICd0eXBlJykge1xuXHRcdFx0XHRoYXNUeXBlID0gdHJ1ZTtcblx0XHRcdFx0aWYgKHByb3AudmFsdWUudHlwZSAhPT0gJ3NjYWxhcicgfHwgcHJvcC52YWx1ZS52YWx1ZSAhPT0gJ2NvbW1hbmQnKSB7XG5cdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuaG9va1R5cGVNdXN0QmVDb21tYW5kJywgXCJUaGUgJ3R5cGUnIHByb3BlcnR5IGluIGEgaG9vayBjb21tYW5kIG11c3QgYmUgJ2NvbW1hbmQnLlwiKSwgcHJvcC52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICh2YWxpZENvbW1hbmRGaWVsZHMuaGFzKGtleSkpIHtcblx0XHRcdFx0aGFzQ29tbWFuZEZpZWxkID0gdHJ1ZTtcblx0XHRcdFx0aWYgKHByb3AudmFsdWUudHlwZSAhPT0gJ3NjYWxhcicgfHwgcHJvcC52YWx1ZS52YWx1ZS50cmltKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuaG9va0NvbW1hbmRGaWVsZE11c3RCZU5vbkVtcHR5U3RyaW5nJywgXCJUaGUgJ3swfScgcHJvcGVydHkgaW4gYSBob29rIGNvbW1hbmQgbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuXCIsIGtleSksIHByb3AudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoa2V5ID09PSAnY3dkJykge1xuXHRcdFx0XHRpZiAocHJvcC52YWx1ZS50eXBlICE9PSAnc2NhbGFyJykge1xuXHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmhvb2tDd2RNdXN0QmVTdHJpbmcnLCBcIlRoZSAnY3dkJyBwcm9wZXJ0eSBpbiBhIGhvb2sgY29tbWFuZCBtdXN0IGJlIGEgc3RyaW5nLlwiKSwgcHJvcC52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChrZXkgPT09ICdlbnYnKSB7XG5cdFx0XHRcdGlmIChwcm9wLnZhbHVlLnR5cGUgIT09ICdtYXAnKSB7XG5cdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuaG9va0Vudk11c3RCZU1hcCcsIFwiVGhlICdlbnYnIHByb3BlcnR5IGluIGEgaG9vayBjb21tYW5kIG11c3QgYmUgYSBtYXAgb2Ygc3RyaW5nIHZhbHVlcy5cIiksIHByb3AudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBlbnZQcm9wIG9mIHByb3AudmFsdWUucHJvcGVydGllcykge1xuXHRcdFx0XHRcdFx0aWYgKGVudlByb3AudmFsdWUudHlwZSAhPT0gJ3NjYWxhcicpIHtcblx0XHRcdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuaG9va0VudlZhbHVlTXVzdEJlU3RyaW5nJywgXCJFbnZpcm9ubWVudCB2YXJpYWJsZSAnezB9JyBtdXN0IGhhdmUgYSBzdHJpbmcgdmFsdWUuXCIsIGVudlByb3Aua2V5LnZhbHVlKSwgZW52UHJvcC52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoa2V5ID09PSAndGltZW91dCcgfHwga2V5ID09PSAndGltZW91dFNlYycpIHtcblx0XHRcdFx0aWYgKHByb3AudmFsdWUudHlwZSAhPT0gJ3NjYWxhcicgfHwgaXNOYU4oTnVtYmVyKHByb3AudmFsdWUudmFsdWUpKSkge1xuXHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmhvb2tUaW1lb3V0TXVzdEJlTnVtYmVyJywgXCJUaGUgJ3swfScgcHJvcGVydHkgaW4gYSBob29rIGNvbW1hbmQgbXVzdCBiZSBhIG51bWJlci5cIiwga2V5KSwgcHJvcC52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghaGFzVHlwZSkge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuaG9va01pc3NpbmdUeXBlJywgXCJIb29rIGNvbW1hbmQgaXMgbWlzc2luZyByZXF1aXJlZCBwcm9wZXJ0eSAndHlwZScuXCIpLCBpdGVtLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdH1cblx0XHRpZiAoIWhhc0NvbW1hbmRGaWVsZCkge1xuXHRcdFx0aWYgKGlzQ29waWxvdENsaSkge1xuXHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5ob29rTWlzc2luZ0NvcGlsb3RDb21tYW5kJywgXCJIb29rIGNvbW1hbmQgbXVzdCBzcGVjaWZ5IGF0IGxlYXN0IG9uZSBvZiAnYmFzaCcgb3IgJ3Bvd2Vyc2hlbGwnLlwiKSwgaXRlbS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmhvb2tNaXNzaW5nQ29tbWFuZCcsIFwiSG9vayBjb21tYW5kIG11c3Qgc3BlY2lmeSBhdCBsZWFzdCBvbmUgb2YgJ2NvbW1hbmQnLCAnd2luZG93cycsICdsaW51eCcsIG9yICdvc3gnLlwiKSwgaXRlbS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlSGFuZG9mZnMoYXR0cmlidXRlczogSUhlYWRlckF0dHJpYnV0ZVtdLCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYXR0cmlidXRlID0gYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaGFuZE9mZnMpO1xuXHRcdGlmICghYXR0cmlidXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChhdHRyaWJ1dGUudmFsdWUudHlwZSAhPT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuaGFuZG9mZnNNdXN0QmVBcnJheScsIFwiVGhlICdoYW5kb2ZmcycgYXR0cmlidXRlIG11c3QgYmUgYW4gYXJyYXkuXCIpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlZW5MYWJlbHMgPSBuZXcgTWFwPHN0cmluZywgUmFuZ2U+KCk7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGF0dHJpYnV0ZS52YWx1ZS5pdGVtcykge1xuXHRcdFx0aWYgKGl0ZW0udHlwZSAhPT0gJ21hcCcpIHtcblx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuZWFjaEhhbmRvZmZNdXN0QmVPYmplY3QnLCBcIkVhY2ggaGFuZG9mZiBpbiB0aGUgJ2hhbmRvZmZzJyBhdHRyaWJ1dGUgbXVzdCBiZSBhbiBvYmplY3Qgd2l0aCAnbGFiZWwnLCAnYWdlbnQnLCAncHJvbXB0JyBhbmQgb3B0aW9uYWwgJ3NlbmQnLlwiKSwgaXRlbS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZXF1aXJlZCA9IG5ldyBTZXQoWydsYWJlbCcsICdhZ2VudCcsICdwcm9tcHQnXSk7XG5cdFx0XHRmb3IgKGNvbnN0IHByb3Agb2YgaXRlbS5wcm9wZXJ0aWVzKSB7XG5cdFx0XHRcdHN3aXRjaCAocHJvcC5rZXkudmFsdWUpIHtcblx0XHRcdFx0XHRjYXNlICdsYWJlbCc6XG5cdFx0XHRcdFx0XHRpZiAocHJvcC52YWx1ZS50eXBlICE9PSAnc2NhbGFyJyB8fCBwcm9wLnZhbHVlLnZhbHVlLnRyaW0oKS5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuaGFuZG9mZkxhYmVsTXVzdEJlTm9uRW1wdHlTdHJpbmcnLCBcIlRoZSAnbGFiZWwnIHByb3BlcnR5IGluIGEgaGFuZG9mZiBtdXN0IGJlIGEgbm9uLWVtcHR5IHN0cmluZy5cIiksIHByb3AudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKCEvW2EtekEtWjAtOV0vLnRlc3QocHJvcC52YWx1ZS52YWx1ZSkpIHtcblx0XHRcdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuaGFuZG9mZkxhYmVsTXVzdENvbnRhaW5BbHBoYW51bWVyaWMnLCBcIlRoZSAnbGFiZWwnIHByb3BlcnR5IGluIGEgaGFuZG9mZiBtdXN0IGNvbnRhaW4gYXQgbGVhc3Qgb25lIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXIuXCIpLCBwcm9wLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnYWdlbnQnOlxuXHRcdFx0XHRcdFx0aWYgKHByb3AudmFsdWUudHlwZSAhPT0gJ3NjYWxhcicgfHwgcHJvcC52YWx1ZS52YWx1ZS50cmltKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmhhbmRvZmZBZ2VudE11c3RCZU5vbkVtcHR5U3RyaW5nJywgXCJUaGUgJ2FnZW50JyBwcm9wZXJ0eSBpbiBhIGhhbmRvZmYgbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuXCIpLCBwcm9wLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0dGhpcy52YWxpZGF0ZUFnZW50VmFsdWUocHJvcC52YWx1ZSwgcmVwb3J0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ3Byb21wdCc6XG5cdFx0XHRcdFx0XHRpZiAocHJvcC52YWx1ZS50eXBlICE9PSAnc2NhbGFyJykge1xuXHRcdFx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5oYW5kb2ZmUHJvbXB0TXVzdEJlU3RyaW5nJywgXCJUaGUgJ3Byb21wdCcgcHJvcGVydHkgaW4gYSBoYW5kb2ZmIG11c3QgYmUgYSBzdHJpbmcuXCIpLCBwcm9wLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAnc2VuZCc6XG5cdFx0XHRcdFx0XHRpZiAoIWlzVHJ1ZU9yRmFsc2UocHJvcC52YWx1ZSkpIHtcblx0XHRcdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuaGFuZG9mZlNlbmRNdXN0QmVCb29sZWFuJywgXCJUaGUgJ3NlbmQnIHByb3BlcnR5IGluIGEgaGFuZG9mZiBtdXN0IGJlIGEgYm9vbGVhbi5cIiksIHByb3AudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdzaG93Q29udGludWVPbic6XG5cdFx0XHRcdFx0XHRpZiAoIWlzVHJ1ZU9yRmFsc2UocHJvcC52YWx1ZSkpIHtcblx0XHRcdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuaGFuZG9mZlNob3dDb250aW51ZU9uTXVzdEJlQm9vbGVhbicsIFwiVGhlICdzaG93Q29udGludWVPbicgcHJvcGVydHkgaW4gYSBoYW5kb2ZmIG11c3QgYmUgYSBib29sZWFuLlwiKSwgcHJvcC52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ21vZGVsJzpcblx0XHRcdFx0XHRcdGlmIChwcm9wLnZhbHVlLnR5cGUgIT09ICdzY2FsYXInKSB7XG5cdFx0XHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmhhbmRvZmZNb2RlbE11c3RCZVN0cmluZycsIFwiVGhlICdtb2RlbCcgcHJvcGVydHkgaW4gYSBoYW5kb2ZmIG11c3QgYmUgYSBzdHJpbmcuXCIpLCBwcm9wLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnVua25vd25IYW5kb2ZmUHJvcGVydHknLCBcIlVua25vd24gcHJvcGVydHkgJ3swfScgaW4gaGFuZG9mZiBvYmplY3QuIFN1cHBvcnRlZCBwcm9wZXJ0aWVzIGFyZSAnbGFiZWwnLCAnYWdlbnQnLCAncHJvbXB0JyBhbmQgb3B0aW9uYWwgJ3NlbmQnLCAnc2hvd0NvbnRpbnVlT24nLCAnbW9kZWwnLlwiLCBwcm9wLmtleS52YWx1ZSksIHByb3AudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXF1aXJlZC5kZWxldGUocHJvcC5rZXkudmFsdWUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlcXVpcmVkLnNpemUgPiAwKSB7XG5cdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLm1pc3NpbmdIYW5kb2ZmUHJvcGVydGllcycsIFwiTWlzc2luZyByZXF1aXJlZCBwcm9wZXJ0aWVzIHswfSBpbiBoYW5kb2ZmIG9iamVjdC5cIiwgQXJyYXkuZnJvbShyZXF1aXJlZCkubWFwKHMgPT4gYCcke3N9J2ApLmpvaW4oJywgJykpLCBpdGVtLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEZXRlY3QgZHVwbGljYXRlIGxhYmVscyAoY2FzZS1pbnNlbnNpdGl2ZSwgY29uc2lzdGVudCB3aXRoIEV4ZWN1dGVIYW5kb2ZmQWN0aW9uIGxvb2t1cClcblx0XHRcdGNvbnN0IGxhYmVsUHJvcCA9IGl0ZW0ucHJvcGVydGllcy5maW5kKHAgPT4gcC5rZXkudmFsdWUgPT09ICdsYWJlbCcpO1xuXHRcdFx0aWYgKGxhYmVsUHJvcD8udmFsdWUudHlwZSA9PT0gJ3NjYWxhcicpIHtcblx0XHRcdFx0Y29uc3Qgbm9ybWFsaXplZExhYmVsID0gbGFiZWxQcm9wLnZhbHVlLnZhbHVlLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGlmIChub3JtYWxpemVkTGFiZWwgJiYgc2VlbkxhYmVscy5oYXMobm9ybWFsaXplZExhYmVsKSkge1xuXHRcdFx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmR1cGxpY2F0ZUhhbmRvZmZMYWJlbCcsIFwiRHVwbGljYXRlIGhhbmRvZmYgbGFiZWwgJ3swfScuIEVhY2ggaGFuZG9mZiBtdXN0IGhhdmUgYSB1bmlxdWUgbGFiZWwuXCIsIGxhYmVsUHJvcC52YWx1ZS52YWx1ZSksIGxhYmVsUHJvcC52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0fSBlbHNlIGlmIChub3JtYWxpemVkTGFiZWwpIHtcblx0XHRcdFx0XHRzZWVuTGFiZWxzLnNldChub3JtYWxpemVkTGFiZWwsIGxhYmVsUHJvcC52YWx1ZS5yYW5nZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlSW5mZXIoYXR0cmlidXRlczogSUhlYWRlckF0dHJpYnV0ZVtdLCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYXR0cmlidXRlID0gYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaW5mZXIpO1xuXHRcdGlmICghYXR0cmlidXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmluZmVyRGVwcmVjYXRlZCcsIFwiVGhlICdpbmZlcicgYXR0cmlidXRlIGlzIGRlcHJlY2F0ZWQgaW4gZmF2b3VyIG9mICd1c2VyLWludm9jYWJsZScgYW5kICdkaXNhYmxlLW1vZGVsLWludm9jYXRpb24nLlwiKSwgYXR0cmlidXRlLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZVRhcmdldChhdHRyaWJ1dGVzOiBJSGVhZGVyQXR0cmlidXRlW10sIHJlcG9ydDogKG1hcmtlcnM6IElNYXJrZXJEYXRhKSA9PiB2b2lkKTogdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBhdHRyLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy50YXJnZXQpO1xuXHRcdGlmICghYXR0cmlidXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChhdHRyaWJ1dGUudmFsdWUudHlwZSAhPT0gJ3NjYWxhcicpIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnRhcmdldE11c3RCZVN0cmluZycsIFwiVGhlICd0YXJnZXQnIGF0dHJpYnV0ZSBtdXN0IGJlIGEgc3RyaW5nLlwiKSwgYXR0cmlidXRlLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCB0YXJnZXRWYWx1ZSA9IGF0dHJpYnV0ZS52YWx1ZS52YWx1ZS50cmltKCk7XG5cdFx0aWYgKHRhcmdldFZhbHVlLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IudGFyZ2V0TXVzdEJlTm9uRW1wdHknLCBcIlRoZSAndGFyZ2V0JyBhdHRyaWJ1dGUgbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuXCIpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHZhbGlkVGFyZ2V0cyA9IFsnZ2l0aHViLWNvcGlsb3QnLCAndnNjb2RlJ107XG5cdFx0aWYgKCF2YWxpZFRhcmdldHMuaW5jbHVkZXModGFyZ2V0VmFsdWUpKSB7XG5cdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci50YXJnZXRJbnZhbGlkVmFsdWUnLCBcIlRoZSAndGFyZ2V0JyBhdHRyaWJ1dGUgbXVzdCBiZSBvbmUgb2Y6IHswfS5cIiwgdmFsaWRUYXJnZXRzLmpvaW4oJywgJykpLCBhdHRyaWJ1dGUudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZVVzZXJJbnZvY2FibGUoYXR0cmlidXRlczogSUhlYWRlckF0dHJpYnV0ZVtdLCByZXBvcnQ6IChtYXJrZXJzOiBJTWFya2VyRGF0YSkgPT4gdm9pZCk6IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYXR0cmlidXRlID0gYXR0cmlidXRlcy5maW5kKGF0dHIgPT4gYXR0ci5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMudXNlckludm9jYWJsZSk7XG5cdFx0aWYgKCFhdHRyaWJ1dGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFpc1RydWVPckZhbHNlKGF0dHJpYnV0ZS52YWx1ZSkpIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLnVzZXJJbnZvY2FibGVNdXN0QmVCb29sZWFuJywgXCJUaGUgJ3VzZXItaW52b2NhYmxlJyBhdHRyaWJ1dGUgbXVzdCBiZSAndHJ1ZScgb3IgJ2ZhbHNlJy5cIiksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHZhbGlkYXRlRGlzYWJsZU1vZGVsSW52b2NhdGlvbihhdHRyaWJ1dGVzOiBJSGVhZGVyQXR0cmlidXRlW10sIHJlcG9ydDogKG1hcmtlcnM6IElNYXJrZXJEYXRhKSA9PiB2b2lkKTogdW5kZWZpbmVkIHtcblx0XHRjb25zdCBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBhdHRyLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5kaXNhYmxlTW9kZWxJbnZvY2F0aW9uKTtcblx0XHRpZiAoIWF0dHJpYnV0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIWlzVHJ1ZU9yRmFsc2UoYXR0cmlidXRlLnZhbHVlKSkge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuZGlzYWJsZU1vZGVsSW52b2NhdGlvbk11c3RCZUJvb2xlYW4nLCBcIlRoZSAnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uJyBhdHRyaWJ1dGUgbXVzdCBiZSAndHJ1ZScgb3IgJ2ZhbHNlJy5cIiksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHZhbGlkYXRlQWdlbnRzQXR0cmlidXRlKGF0dHJpYnV0ZXM6IElIZWFkZXJBdHRyaWJ1dGVbXSwgaGVhZGVyOiBQcm9tcHRIZWFkZXIsIHJlcG9ydDogKG1hcmtlcnM6IElNYXJrZXJEYXRhKSA9PiB2b2lkKTogUHJvbWlzZTx1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBhdHRyLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hZ2VudHMpO1xuXHRcdGlmICghYXR0cmlidXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChhdHRyaWJ1dGUudmFsdWUudHlwZSAhPT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuYWdlbnRzTXVzdEJlQXJyYXknLCBcIlRoZSAnYWdlbnRzJyBhdHRyaWJ1dGUgbXVzdCBiZSBhbiBhcnJheS5cIiksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDb2xsZWN0IGF2YWlsYWJsZSBhZ2VudCBuYW1lc1xuXHRcdGNvbnN0IGFnZW50cyA9IChhd2FpdCB0aGlzLnByb21wdHNTZXJ2aWNlLmdldEN1c3RvbUFnZW50cyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkuZmlsdGVyKGEgPT4gYS5lbmFibGVkKTtcblx0XHRjb25zdCBhdmFpbGFibGVBZ2VudE5hbWVzID0gbmV3IFNldDxzdHJpbmc+KGFnZW50cy5tYXAoYWdlbnQgPT4gYWdlbnQubmFtZSkpO1xuXHRcdGF2YWlsYWJsZUFnZW50TmFtZXMuYWRkKENoYXRNb2RlLkFnZW50Lm5hbWUuZ2V0KCkpOyAvLyBpbmNsdWRlIGRlZmF1bHQgYWdlbnRcblxuXHRcdC8vIENoZWNrIGVhY2ggaXRlbSBpcyBhIHN0cmluZyBhbmQgYWdlbnQgZXhpc3RzXG5cdFx0Y29uc3QgYWdlbnROYW1lczogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgYXR0cmlidXRlLnZhbHVlLml0ZW1zKSB7XG5cdFx0XHRpZiAoaXRlbS50eXBlICE9PSAnc2NhbGFyJykge1xuXHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5lYWNoQWdlbnRNdXN0QmVTdHJpbmcnLCBcIkVhY2ggYWdlbnQgbmFtZSBpbiB0aGUgJ2FnZW50cycgYXR0cmlidXRlIG11c3QgYmUgYSBzdHJpbmcuXCIpLCBpdGVtLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0fSBlbHNlIGlmIChpdGVtLnZhbHVlKSB7XG5cdFx0XHRcdGFnZW50TmFtZXMucHVzaChpdGVtLnZhbHVlKTtcblx0XHRcdFx0aWYgKGl0ZW0udmFsdWUgIT09ICcqJyAmJiAhYXZhaWxhYmxlQWdlbnROYW1lcy5oYXMoaXRlbS52YWx1ZSkpIHtcblx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5hZ2VudEluQWdlbnRzTm90Rm91bmQnLCBcIlVua25vd24gYWdlbnQgJ3swfScgd2lsbCBiZSBpZ25vcmVkLiBBdmFpbGFibGUgYWdlbnRzOiB7MX0uXCIsIGl0ZW0udmFsdWUsIEFycmF5LmZyb20oYXZhaWxhYmxlQWdlbnROYW1lcykuam9pbignLCAnKSksIGl0ZW0ucmFuZ2UsIE1hcmtlclNldmVyaXR5LkhpbnQsIFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBJZiBub3Qgd2lsZGNhcmQgYW5kIG5vdCBlbXB0eSwgY2hlY2sgdGhhdCAnYWdlbnQnIHRvb2wgaXMgYXZhaWxhYmxlXG5cdFx0aWYgKGFnZW50TmFtZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgdG9vbHMgPSBoZWFkZXIudG9vbHM7XG5cdFx0XHRpZiAodG9vbHMgJiYgIXRvb2xzLmluY2x1ZGVzKFNwZWNlZFRvb2xBbGlhc2VzLmFnZW50KSkge1xuXHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5hZ2VudHNSZXF1aXJlc0FnZW50VG9vbCcsIFwiV2hlbiAnYWdlbnRzJyBhbmQgJ3Rvb2xzJyBhcmUgc3BlY2lmaWVkLCB0aGUgJ2FnZW50JyB0b29sIG11c3QgYmUgaW5jbHVkZWQgaW4gdGhlICd0b29scycgYXR0cmlidXRlLlwiKSwgYXR0cmlidXRlLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZUdpdGh1YlBlcm1pc3Npb25zKGF0dHJpYnV0ZXM6IElIZWFkZXJBdHRyaWJ1dGVbXSwgcmVwb3J0OiAobWFya2VyczogSU1hcmtlckRhdGEpID0+IHZvaWQpOiB2b2lkIHtcblx0XHRjb25zdCBhdHRyaWJ1dGUgPSBhdHRyaWJ1dGVzLmZpbmQoYXR0ciA9PiBhdHRyLmtleSA9PT0gR2l0aHViUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5naXRodWIpO1xuXHRcdGlmICghYXR0cmlidXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChhdHRyaWJ1dGUudmFsdWUudHlwZSAhPT0gJ21hcCcpIHtcblx0XHRcdHJlcG9ydCh0b01hcmtlcihsb2NhbGl6ZSgncHJvbXB0VmFsaWRhdG9yLmdpdGh1Yk11c3RCZU1hcCcsIFwiVGhlICdnaXRodWInIGF0dHJpYnV0ZSBtdXN0IGJlIGFuIG9iamVjdC5cIiksIGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwcm9wIG9mIGF0dHJpYnV0ZS52YWx1ZS5wcm9wZXJ0aWVzKSB7XG5cdFx0XHRpZiAocHJvcC5rZXkudmFsdWUgIT09ICdwZXJtaXNzaW9ucycpIHtcblx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IudW5rbm93bkdpdGh1YlByb3BlcnR5JywgXCJVbmtub3duIHByb3BlcnR5ICd7MH0nIGluICdnaXRodWInIG9iamVjdC4gU3VwcG9ydGVkOiAncGVybWlzc2lvbnMnLlwiLCBwcm9wLmtleS52YWx1ZSksIHByb3Aua2V5LnJhbmdlLCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHByb3AudmFsdWUudHlwZSAhPT0gJ21hcCcpIHtcblx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IucGVybWlzc2lvbnNNdXN0QmVNYXAnLCBcIlRoZSAncGVybWlzc2lvbnMnIHByb3BlcnR5IG11c3QgYmUgYW4gb2JqZWN0LlwiKSwgcHJvcC52YWx1ZS5yYW5nZSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpKTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHBlcm1Qcm9wIG9mIHByb3AudmFsdWUucHJvcGVydGllcykge1xuXHRcdFx0XHRjb25zdCBzY29wZSA9IHBlcm1Qcm9wLmtleS52YWx1ZTtcblx0XHRcdFx0Y29uc3Qgc2NvcGVJbmZvID0gZ2l0aHViUGVybWlzc2lvblNjb3Blc1tzY29wZV07XG5cdFx0XHRcdGlmICghc2NvcGVJbmZvKSB7XG5cdFx0XHRcdFx0Y29uc3QgdmFsaWRTY29wZXMgPSBPYmplY3Qua2V5cyhnaXRodWJQZXJtaXNzaW9uU2NvcGVzKS5zb3J0KCkuam9pbignLCAnKTtcblx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci51bmtub3duUGVybWlzc2lvblNjb3BlJywgXCJVbmtub3duIHBlcm1pc3Npb24gc2NvcGUgJ3swfScuIFZhbGlkIHNjb3BlczogezF9LlwiLCBzY29wZSwgdmFsaWRTY29wZXMpLCBwZXJtUHJvcC5rZXkucmFuZ2UsIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocGVybVByb3AudmFsdWUudHlwZSAhPT0gJ3NjYWxhcicpIHtcblx0XHRcdFx0XHRyZXBvcnQodG9NYXJrZXIobG9jYWxpemUoJ3Byb21wdFZhbGlkYXRvci5wZXJtaXNzaW9uVmFsdWVNdXN0QmVTdHJpbmcnLCBcIlRoZSBwZXJtaXNzaW9uIHZhbHVlIGZvciAnezB9JyBtdXN0IGJlIGEgc3RyaW5nLlwiLCBzY29wZSksIHBlcm1Qcm9wLnZhbHVlLnJhbmdlLCBNYXJrZXJTZXZlcml0eS5FcnJvcikpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gcGVybVByb3AudmFsdWUudmFsdWU7XG5cdFx0XHRcdGlmICghc2NvcGVJbmZvLmFsbG93ZWRWYWx1ZXMuaW5jbHVkZXModmFsdWUpKSB7XG5cdFx0XHRcdFx0cmVwb3J0KHRvTWFya2VyKGxvY2FsaXplKCdwcm9tcHRWYWxpZGF0b3IuaW52YWxpZFBlcm1pc3Npb25WYWx1ZScsIFwiSW52YWxpZCBwZXJtaXNzaW9uIHZhbHVlICd7MH0nIGZvciBzY29wZSAnezF9Jy4gQWxsb3dlZCB2YWx1ZXM6IHsyfS5cIiwgdmFsdWUsIHNjb3BlLCBzY29wZUluZm8uYWxsb3dlZFZhbHVlcy5qb2luKCcsICcpKSwgcGVybVByb3AudmFsdWUucmFuZ2UsIE1hcmtlclNldmVyaXR5LkVycm9yKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGdpdGh1YlBlcm1pc3Npb25TY29wZXM6IFJlY29yZDxzdHJpbmcsIHsgYWxsb3dlZFZhbHVlczogc3RyaW5nW107IGRlc2NyaXB0aW9uOiBzdHJpbmcgfT4gPSB7XG5cdCdhY3Rpb25zJzogeyBhbGxvd2VkVmFsdWVzOiBbJ3JlYWQnLCAnd3JpdGUnLCAnbm9uZSddLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dpdGh1YlBlcm1pc3Npb24uYWN0aW9ucycsIFwiQWNjZXNzIHRvIEdpdEh1YiBBY3Rpb25zIHdvcmtmbG93cyBhbmQgcnVuc1wiKSB9LFxuXHQnY2hlY2tzJzogeyBhbGxvd2VkVmFsdWVzOiBbJ3JlYWQnLCAnbm9uZSddLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dpdGh1YlBlcm1pc3Npb24uY2hlY2tzJywgXCJBY2Nlc3MgdG8gY2hlY2sgcnVucyBhbmQgc3RhdHVzZXNcIikgfSxcblx0J2NvbnRlbnRzJzogeyBhbGxvd2VkVmFsdWVzOiBbJ3JlYWQnLCAnd3JpdGUnLCAnbm9uZSddLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dpdGh1YlBlcm1pc3Npb24uY29udGVudHMnLCBcIkFjY2VzcyB0byByZXBvc2l0b3J5IGNvbnRlbnRzIChmaWxlcywgY29tbWl0cywgYnJhbmNoZXMpXCIpIH0sXG5cdCdkaXNjdXNzaW9ucyc6IHsgYWxsb3dlZFZhbHVlczogWydyZWFkJywgJ3dyaXRlJywgJ25vbmUnXSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdnaXRodWJQZXJtaXNzaW9uLmRpc2N1c3Npb25zJywgXCJBY2Nlc3MgdG8gZGlzY3Vzc2lvbnNcIikgfSxcblx0J2lzc3Vlcyc6IHsgYWxsb3dlZFZhbHVlczogWydyZWFkJywgJ3dyaXRlJywgJ25vbmUnXSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdnaXRodWJQZXJtaXNzaW9uLmlzc3VlcycsIFwiQWNjZXNzIHRvIGlzc3VlcyAocmVhZCwgY3JlYXRlLCB1cGRhdGUsIGNvbW1lbnQpXCIpIH0sXG5cdCdtZXRhZGF0YSc6IHsgYWxsb3dlZFZhbHVlczogWydyZWFkJ10sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2l0aHViUGVybWlzc2lvbi5tZXRhZGF0YScsIFwiUmVwb3NpdG9yeSBtZXRhZGF0YSAoYWx3YXlzIHJlYWQtb25seSlcIikgfSxcblx0J3B1bGwtcmVxdWVzdHMnOiB7IGFsbG93ZWRWYWx1ZXM6IFsncmVhZCcsICd3cml0ZScsICdub25lJ10sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2l0aHViUGVybWlzc2lvbi5wdWxsUmVxdWVzdHMnLCBcIkFjY2VzcyB0byBwdWxsIHJlcXVlc3RzIChyZWFkLCBjcmVhdGUsIHVwZGF0ZSwgcmV2aWV3KVwiKSB9LFxuXHQnc2VjdXJpdHktZXZlbnRzJzogeyBhbGxvd2VkVmFsdWVzOiBbJ3JlYWQnLCAnbm9uZSddLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dpdGh1YlBlcm1pc3Npb24uc2VjdXJpdHlFdmVudHMnLCBcIkFjY2VzcyB0byBzZWN1cml0eS1yZWxhdGVkIGV2ZW50c1wiKSB9LFxuXHQnd29ya2Zsb3dzJzogeyBhbGxvd2VkVmFsdWVzOiBbJ3dyaXRlJywgJ25vbmUnXSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdnaXRodWJQZXJtaXNzaW9uLndvcmtmbG93cycsIFwiQWNjZXNzIHRvIG1vZGlmeSB3b3JrZmxvdyBmaWxlc1wiKSB9LFxufTtcblxuZnVuY3Rpb24gaXNUcnVlT3JGYWxzZSh2YWx1ZTogSVZhbHVlKTogYm9vbGVhbiB7XG5cdGlmICh2YWx1ZS50eXBlID09PSAnc2NhbGFyJykge1xuXHRcdHJldHVybiAodmFsdWUudmFsdWUgPT09ICd0cnVlJyB8fCB2YWx1ZS52YWx1ZSA9PT0gJ2ZhbHNlJykgJiYgdmFsdWUuZm9ybWF0ID09PSAnbm9uZSc7XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5jb25zdCBhbGxBdHRyaWJ1dGVOYW1lczogUmVjb3JkPFByb21wdHNUeXBlLCBzdHJpbmdbXT4gPSB7XG5cdFtQcm9tcHRzVHlwZS5wcm9tcHRdOiBbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5uYW1lLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRlc2NyaXB0aW9uLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm1vZGVsLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnRvb2xzLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm1vZGUsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYWdlbnQsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYXJndW1lbnRIaW50XSxcblx0W1Byb21wdHNUeXBlLmluc3RydWN0aW9uc106IFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm5hbWUsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuZGVzY3JpcHRpb24sIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYXBwbHlUbywgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5leGNsdWRlQWdlbnRdLFxuXHRbUHJvbXB0c1R5cGUuYWdlbnRdOiBbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5uYW1lLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRlc2NyaXB0aW9uLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm1vZGVsLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnRvb2xzLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFkdmFuY2VkT3B0aW9ucywgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5oYW5kT2ZmcywgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hcmd1bWVudEhpbnQsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMudGFyZ2V0LCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmluZmVyLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFnZW50cywgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5ob29rcywgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy51c2VySW52b2NhYmxlLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRpc2FibGVNb2RlbEludm9jYXRpb24sIEdpdGh1YlByb21wdEhlYWRlckF0dHJpYnV0ZXMuZ2l0aHViXSxcblx0W1Byb21wdHNUeXBlLnNraWxsXTogW1Byb21wdEhlYWRlckF0dHJpYnV0ZXMubmFtZSwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5kZXNjcmlwdGlvbiwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5saWNlbnNlLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmNvbXBhdGliaWxpdHksIFByb21wdEhlYWRlckF0dHJpYnV0ZXMubWV0YWRhdGEsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYXJndW1lbnRIaW50LCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnVzZXJJbnZvY2FibGUsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuZGlzYWJsZU1vZGVsSW52b2NhdGlvbiwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5jb250ZXh0XSxcblx0W1Byb21wdHNUeXBlLmhvb2tdOiBbXSwgLy8gaG9va3MgYXJlIEpTT04gZmlsZXMsIG5vdCBtYXJrZG93biB3aXRoIFlBTUwgZnJvbnRtYXR0ZXJcbn07XG5jb25zdCBnaXRodWJDb3BpbG90QWdlbnRBdHRyaWJ1dGVOYW1lcyA9IFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm5hbWUsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuZGVzY3JpcHRpb24sIFByb21wdEhlYWRlckF0dHJpYnV0ZXMudG9vbHMsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMudGFyZ2V0LCBHaXRodWJQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm1jcFNlcnZlcnMsIEdpdGh1YlByb21wdEhlYWRlckF0dHJpYnV0ZXMuZ2l0aHViLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmluZmVyXTtcbmNvbnN0IHJlY29tbWVuZGVkQXR0cmlidXRlTmFtZXM6IFJlY29yZDxQcm9tcHRzVHlwZSwgc3RyaW5nW10+ID0ge1xuXHRbUHJvbXB0c1R5cGUucHJvbXB0XTogYWxsQXR0cmlidXRlTmFtZXNbUHJvbXB0c1R5cGUucHJvbXB0XS5maWx0ZXIobmFtZSA9PiAhaXNOb25SZWNvbW1lbmRlZEF0dHJpYnV0ZShuYW1lKSksXG5cdFtQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnNdOiBhbGxBdHRyaWJ1dGVOYW1lc1tQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnNdLmZpbHRlcihuYW1lID0+ICFpc05vblJlY29tbWVuZGVkQXR0cmlidXRlKG5hbWUpKSxcblx0W1Byb21wdHNUeXBlLmFnZW50XTogYWxsQXR0cmlidXRlTmFtZXNbUHJvbXB0c1R5cGUuYWdlbnRdLmZpbHRlcihuYW1lID0+ICFpc05vblJlY29tbWVuZGVkQXR0cmlidXRlKG5hbWUpKSxcblx0W1Byb21wdHNUeXBlLnNraWxsXTogYWxsQXR0cmlidXRlTmFtZXNbUHJvbXB0c1R5cGUuc2tpbGxdLmZpbHRlcihuYW1lID0+ICFpc05vblJlY29tbWVuZGVkQXR0cmlidXRlKG5hbWUpKSxcblx0W1Byb21wdHNUeXBlLmhvb2tdOiBbXSwgLy8gaG9va3MgYXJlIEpTT04gZmlsZXMsIG5vdCBtYXJrZG93biB3aXRoIFlBTUwgZnJvbnRtYXR0ZXJcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRWYWxpZEF0dHJpYnV0ZU5hbWVzKHByb21wdFR5cGU6IFByb21wdHNUeXBlLCBpbmNsdWRlTm9uUmVjb21tZW5kZWQ6IGJvb2xlYW4sIHRhcmdldDogVGFyZ2V0KTogc3RyaW5nW10ge1xuXHRpZiAodGFyZ2V0ID09PSBUYXJnZXQuQ2xhdWRlKSB7XG5cdFx0aWYgKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9ucykge1xuXHRcdFx0cmV0dXJuIE9iamVjdC5rZXlzKGNsYXVkZVJ1bGVzQXR0cmlidXRlcyk7XG5cdFx0fVxuXHRcdHJldHVybiBPYmplY3Qua2V5cyhjbGF1ZGVBZ2VudEF0dHJpYnV0ZXMpO1xuXHR9IGVsc2UgaWYgKHRhcmdldCA9PT0gVGFyZ2V0LkdpdEh1YkNvcGlsb3QpIHtcblx0XHRpZiAocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQpIHtcblx0XHRcdHJldHVybiBnaXRodWJDb3BpbG90QWdlbnRBdHRyaWJ1dGVOYW1lcztcblx0XHR9XG5cdH1cblx0cmV0dXJuIGluY2x1ZGVOb25SZWNvbW1lbmRlZCA/IGFsbEF0dHJpYnV0ZU5hbWVzW3Byb21wdFR5cGVdIDogcmVjb21tZW5kZWRBdHRyaWJ1dGVOYW1lc1twcm9tcHRUeXBlXTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzTm9uUmVjb21tZW5kZWRBdHRyaWJ1dGUoYXR0cmlidXRlTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBhdHRyaWJ1dGVOYW1lID09PSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFkdmFuY2VkT3B0aW9ucyB8fCBhdHRyaWJ1dGVOYW1lID09PSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmV4Y2x1ZGVBZ2VudCB8fCBhdHRyaWJ1dGVOYW1lID09PSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm1vZGUgfHwgYXR0cmlidXRlTmFtZSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5pbmZlcjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEF0dHJpYnV0ZURlc2NyaXB0aW9uKGF0dHJpYnV0ZU5hbWU6IHN0cmluZywgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUsIHRhcmdldDogVGFyZ2V0KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKHRhcmdldCA9PT0gVGFyZ2V0LkNsYXVkZSkge1xuXHRcdGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCkge1xuXHRcdFx0cmV0dXJuIGNsYXVkZUFnZW50QXR0cmlidXRlc1thdHRyaWJ1dGVOYW1lXT8uZGVzY3JpcHRpb247XG5cdFx0fVxuXHRcdGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpIHtcblx0XHRcdHJldHVybiBjbGF1ZGVSdWxlc0F0dHJpYnV0ZXNbYXR0cmlidXRlTmFtZV0/LmRlc2NyaXB0aW9uO1xuXHRcdH1cblx0fVxuXHRzd2l0Y2ggKHByb21wdFR5cGUpIHtcblx0XHRjYXNlIFByb21wdHNUeXBlLmluc3RydWN0aW9uczpcblx0XHRcdHN3aXRjaCAoYXR0cmlidXRlTmFtZSkge1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMubmFtZTpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5pbnN0cnVjdGlvbnMubmFtZScsICdUaGUgbmFtZSBvZiB0aGUgaW5zdHJ1Y3Rpb24gZmlsZSBhcyBzaG93biBpbiB0aGUgVUkuIElmIG5vdCBzZXQsIHRoZSBuYW1lIGlzIGRlcml2ZWQgZnJvbSB0aGUgZmlsZSBuYW1lLicpO1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuZGVzY3JpcHRpb246XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuaW5zdHJ1Y3Rpb25zLmRlc2NyaXB0aW9uJywgJ1RoZSBkZXNjcmlwdGlvbiBvZiB0aGUgaW5zdHJ1Y3Rpb24gZmlsZS4gSXQgY2FuIGJlIHVzZWQgdG8gcHJvdmlkZSBhZGRpdGlvbmFsIGNvbnRleHQgb3IgaW5mb3JtYXRpb24gYWJvdXQgdGhlIGluc3RydWN0aW9ucyBhbmQgaXMgcGFzc2VkIHRvIHRoZSBsYW5ndWFnZSBtb2RlbCBhcyBwYXJ0IG9mIHRoZSBwcm9tcHQuJyk7XG5cdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hcHBseVRvOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmluc3RydWN0aW9ucy5hcHBseVRvUmFuZ2UnLCAnT25lIG9yIG1vcmUgZ2xvYiBwYXR0ZXJuIChzZXBhcmF0ZWQgYnkgY29tbWEpIHRoYXQgZGVzY3JpYmUgZm9yIHdoaWNoIGZpbGVzIHRoZSBpbnN0cnVjdGlvbnMgYXBwbHkgdG8uIEJhc2VkIG9uIHRoZXNlIHBhdHRlcm5zLCB0aGUgZmlsZSBpcyBhdXRvbWF0aWNhbGx5IGluY2x1ZGVkIGluIHRoZSBwcm9tcHQsIHdoZW4gdGhlIGNvbnRleHQgY29udGFpbnMgYSBmaWxlIHRoYXQgbWF0Y2hlcyBvbmUgb3IgbW9yZSBvZiB0aGVzZSBwYXR0ZXJucy4gVXNlIGAqKmAgd2hlbiB5b3Ugd2FudCB0aGlzIGZpbGUgdG8gYWx3YXlzIGJlIGFkZGVkLlxcbkV4YW1wbGU6IGAqKi8qLnRzYCwgYCoqLyouanNgLCBgY2xpZW50LyoqYCcpO1xuXHRcdFx0fVxuXHRcdFx0YnJlYWs7XG5cdFx0Y2FzZSBQcm9tcHRzVHlwZS5za2lsbDpcblx0XHRcdHN3aXRjaCAoYXR0cmlidXRlTmFtZSkge1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMubmFtZTpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5za2lsbC5uYW1lJywgJ1RoZSBuYW1lIG9mIHRoZSBza2lsbC4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRlc2NyaXB0aW9uOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnNraWxsLmRlc2NyaXB0aW9uJywgJ1RoZSBkZXNjcmlwdGlvbiBvZiB0aGUgc2tpbGwuIFRoZSBkZXNjcmlwdGlvbiBpcyBhZGRlZCB0byBldmVyeSByZXF1ZXN0IGFuZCB3aWxsIGJlIHVzZWQgYnkgdGhlIGFnZW50IHRvIGRlY2lkZSB3aGVuIHRvIGxvYWQgdGhlIHNraWxsLicpO1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYXJndW1lbnRIaW50OlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnNraWxsLmFyZ3VtZW50SGludCcsICdIaW50IHNob3duIGR1cmluZyBhdXRvY29tcGxldGUgdG8gaW5kaWNhdGUgZXhwZWN0ZWQgYXJndW1lbnRzLiBFeGFtcGxlOiBbaXNzdWUtbnVtYmVyXSBvciBbZmlsZW5hbWVdIFtmb3JtYXRdJyk7XG5cdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy51c2VySW52b2NhYmxlOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnNraWxsLnVzZXJJbnZvY2FibGUnLCAnU2V0IHRvIGZhbHNlIHRvIGhpZGUgZnJvbSB0aGUgLyBtZW51LiBVc2UgZm9yIGJhY2tncm91bmQga25vd2xlZGdlIHVzZXJzIHNob3VsZCBub3QgaW52b2tlIGRpcmVjdGx5LiBEZWZhdWx0OiB0cnVlLicpO1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuZGlzYWJsZU1vZGVsSW52b2NhdGlvbjpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5za2lsbC5kaXNhYmxlTW9kZWxJbnZvY2F0aW9uJywgJ1NldCB0byB0cnVlIHRvIHByZXZlbnQgdGhlIGFnZW50IGZyb20gYXV0b21hdGljYWxseSBsb2FkaW5nIHRoaXMgc2tpbGwuIFVzZSBmb3Igd29ya2Zsb3dzIHlvdSB3YW50IHRvIHRyaWdnZXIgbWFudWFsbHkgd2l0aCAvbmFtZS4gRGVmYXVsdDogZmFsc2UuJyk7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0XHRjYXNlIFByb21wdHNUeXBlLmFnZW50OlxuXHRcdFx0c3dpdGNoIChhdHRyaWJ1dGVOYW1lKSB7XG5cdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5uYW1lOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50Lm5hbWUnLCAnVGhlIG5hbWUgb2YgdGhlIGFnZW50IGFzIHNob3duIGluIHRoZSBVSS4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRlc2NyaXB0aW9uOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50LmRlc2NyaXB0aW9uJywgJ1RoZSBkZXNjcmlwdGlvbiBvZiB0aGUgY3VzdG9tIGFnZW50LCB3aGF0IGl0IGRvZXMgYW5kIHdoZW4gdG8gdXNlIGl0LicpO1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYXJndW1lbnRIaW50OlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50LmFyZ3VtZW50SGludCcsICdUaGUgYXJndW1lbnQtaGludCBkZXNjcmliZXMgd2hhdCBpbnB1dHMgdGhlIGN1c3RvbSBhZ2VudCBleHBlY3RzIG9yIHN1cHBvcnRzLicpO1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMubW9kZWw6XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuYWdlbnQubW9kZWwnLCAnU3BlY2lmeSB0aGUgbW9kZWwgdGhhdCBydW5zIHRoaXMgY3VzdG9tIGFnZW50LiBDYW4gYWxzbyBiZSBhIGxpc3Qgb2YgbW9kZWxzLiBUaGUgZmlyc3QgYXZhaWxhYmxlIG1vZGVsIHdpbGwgYmUgdXNlZC4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnRvb2xzOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50LnRvb2xzJywgJ1RoZSBzZXQgb2YgdG9vbHMgdGhhdCB0aGUgY3VzdG9tIGFnZW50IGhhcyBhY2Nlc3MgdG8uJyk7XG5cdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5oYW5kT2Zmczpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC5oYW5kb2ZmcycsICdQb3NzaWJsZSBoYW5kb2ZmIGFjdGlvbnMgd2hlbiB0aGUgYWdlbnQgaGFzIGNvbXBsZXRlZCBpdHMgdGFzay4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnRhcmdldDpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC50YXJnZXQnLCAnVGhlIHRhcmdldCB0byB3aGljaCB0aGUgaGVhZGVyIGF0dHJpYnV0ZXMgbGlrZSB0b29scyBhcHBseSB0by4gUG9zc2libGUgdmFsdWVzIGFyZSBgZ2l0aHViLWNvcGlsb3RgIGFuZCBgdnNjb2RlYC4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmluZmVyOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50LmluZmVyJywgJ0NvbnRyb2xzIHZpc2liaWxpdHkgb2YgdGhlIGFnZW50LicpO1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYWdlbnRzOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50LmFnZW50cycsICdPbmUgb3IgbW9yZSBhZ2VudHMgdGhhdCB0aGlzIGFnZW50IGNhbiB1c2UgYXMgc3ViYWdlbnRzLiBVc2UgXFwnKlxcJyB0byBzcGVjaWZ5IGFsbCBhdmFpbGFibGUgYWdlbnRzLicpO1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaG9va3M6XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuYWdlbnQuaG9va3MnLCAnTGlmZWN5Y2xlIGhvb2tzIHNjb3BlZCB0byB0aGlzIGFnZW50LiBEZWZpbmUgaG9va3MgdGhhdCBydW4gb25seSB3aGlsZSB0aGlzIGFnZW50IGlzIGFjdGl2ZS4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnVzZXJJbnZvY2FibGU6XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuYWdlbnQudXNlckludm9jYWJsZScsICdXaGV0aGVyIHRoZSBhZ2VudCBjYW4gYmUgc2VsZWN0ZWQgYW5kIGludm9rZWQgYnkgdXNlcnMgaW4gdGhlIFVJLicpO1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuZGlzYWJsZU1vZGVsSW52b2NhdGlvbjpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC5kaXNhYmxlTW9kZWxJbnZvY2F0aW9uJywgJ0lmIHRydWUsIHByZXZlbnRzIHRoZSBhZ2VudCBmcm9tIGJlaW5nIGludm9rZWQgYXMgYSBzdWJhZ2VudC4nKTtcblx0XHRcdFx0Y2FzZSBHaXRodWJQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmdpdGh1Yjpcblx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC5naXRodWInLCAnR2l0SHViLXNwZWNpZmljIGNvbmZpZ3VyYXRpb24gZm9yIHRoZSBhZ2VudCwgc3VjaCBhcyB0b2tlbiBwZXJtaXNzaW9ucy4nKTtcblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXHRcdGNhc2UgUHJvbXB0c1R5cGUucHJvbXB0OlxuXHRcdFx0c3dpdGNoIChhdHRyaWJ1dGVOYW1lKSB7XG5cdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5uYW1lOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnByb21wdC5uYW1lJywgJ1RoZSBuYW1lIG9mIHRoZSBwcm9tcHQuIFRoaXMgaXMgYWxzbyB0aGUgbmFtZSBvZiB0aGUgc2xhc2ggY29tbWFuZCB0aGF0IHdpbGwgcnVuIHRoaXMgcHJvbXB0LicpO1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuZGVzY3JpcHRpb246XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdwcm9tcHRIZWFkZXIucHJvbXB0LmRlc2NyaXB0aW9uJywgJ1RoZSBkZXNjcmlwdGlvbiBvZiB0aGUgcmV1c2FibGUgcHJvbXB0LCB3aGF0IGl0IGRvZXMgYW5kIHdoZW4gdG8gdXNlIGl0LicpO1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYXJndW1lbnRIaW50OlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnByb21wdC5hcmd1bWVudEhpbnQnLCAnVGhlIGFyZ3VtZW50LWhpbnQgZGVzY3JpYmVzIHdoYXQgaW5wdXRzIHRoZSBwcm9tcHQgZXhwZWN0cyBvciBzdXBwb3J0cy4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm1vZGVsOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnByb21wdC5tb2RlbCcsICdUaGUgbW9kZWwgdG8gdXNlIGluIHRoaXMgcHJvbXB0LiBDYW4gYWxzbyBiZSBhIGxpc3Qgb2YgbW9kZWxzLiBUaGUgZmlyc3QgYXZhaWxhYmxlIG1vZGVsIHdpbGwgYmUgdXNlZC4nKTtcblx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnRvb2xzOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnByb21wdC50b29scycsICdUaGUgdG9vbHMgdG8gdXNlIGluIHRoaXMgcHJvbXB0LicpO1xuXHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYWdlbnQ6XG5cdFx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnByb21wdC5hZ2VudC5kZXNjcmlwdGlvbicsICdUaGUgYWdlbnQgdG8gdXNlIHdoZW4gcnVubmluZyB0aGlzIHByb21wdC4nKTtcblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8vIFRoZSBsaXN0IG9mIHRvb2xzIGtub3duIHRvIGJlIHVzZWQgYnkgR2l0SHViIENvcGlsb3QgY3VzdG9tIGFnZW50c1xuZXhwb3J0IGNvbnN0IGtub3duR2l0aHViQ29waWxvdFRvb2xzID0gW1xuXHR7IG5hbWU6IFNwZWNlZFRvb2xBbGlhc2VzLmV4ZWN1dGUsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2l0aHViQ29waWxvdC5leGVjdXRlJywgJ0V4ZWN1dGUgY29tbWFuZHMnKSB9LFxuXHR7IG5hbWU6IFNwZWNlZFRvb2xBbGlhc2VzLnJlYWQsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2l0aHViQ29waWxvdC5yZWFkJywgJ1JlYWQgZmlsZXMnKSB9LFxuXHR7IG5hbWU6IFNwZWNlZFRvb2xBbGlhc2VzLmVkaXQsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2l0aHViQ29waWxvdC5lZGl0JywgJ0VkaXQgZmlsZXMnKSB9LFxuXHR7IG5hbWU6IFNwZWNlZFRvb2xBbGlhc2VzLnNlYXJjaCwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdnaXRodWJDb3BpbG90LnNlYXJjaCcsICdTZWFyY2ggZmlsZXMnKSB9LFxuXHR7IG5hbWU6IFNwZWNlZFRvb2xBbGlhc2VzLmFnZW50LCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dpdGh1YkNvcGlsb3QuYWdlbnQnLCAnVXNlIHN1YmFnZW50cycpIH0sXG5dO1xuXG5leHBvcnQgaW50ZXJmYWNlIElWYWx1ZUVudHJ5IHtcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcbn1cblxuZXhwb3J0IGNvbnN0IGtub3duQ2xhdWRlVG9vbHMgPSBbXG5cdHsgbmFtZTogJ0Jhc2gnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5iYXNoJywgJ0V4ZWN1dGUgc2hlbGwgY29tbWFuZHMnKSwgdG9vbEVxdWl2YWxlbnQ6IFtTcGVjZWRUb29sQWxpYXNlcy5leGVjdXRlXSB9LFxuXHR7IG5hbWU6ICdFZGl0JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUuZWRpdCcsICdNYWtlIHRhcmdldGVkIGZpbGUgZWRpdHMnKSwgdG9vbEVxdWl2YWxlbnQ6IFsnZWRpdC9lZGl0Tm90ZWJvb2snLCAnZWRpdC9lZGl0RmlsZXMnXSB9LFxuXHR7IG5hbWU6ICdHbG9iJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUuZ2xvYicsICdGaW5kIGZpbGVzIGJ5IHBhdHRlcm4nKSwgdG9vbEVxdWl2YWxlbnQ6IFsnc2VhcmNoL2ZpbGVTZWFyY2gnXSB9LFxuXHR7IG5hbWU6ICdHcmVwJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUuZ3JlcCcsICdTZWFyY2ggZmlsZSBjb250ZW50cyB3aXRoIHJlZ2V4JyksIHRvb2xFcXVpdmFsZW50OiBbJ3NlYXJjaC90ZXh0U2VhcmNoJ10gfSxcblx0eyBuYW1lOiAnUmVhZCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLnJlYWQnLCAnUmVhZCBmaWxlIGNvbnRlbnRzJyksIHRvb2xFcXVpdmFsZW50OiBbJ3JlYWQvcmVhZEZpbGUnLCAncmVhZC9nZXROb3RlYm9va1N1bW1hcnknXSB9LFxuXHR7IG5hbWU6ICdXcml0ZScsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLndyaXRlJywgJ0NyZWF0ZS9vdmVyd3JpdGUgZmlsZXMnKSwgdG9vbEVxdWl2YWxlbnQ6IFsnZWRpdC9jcmVhdGVEaXJlY3RvcnknLCAnZWRpdC9jcmVhdGVGaWxlJywgJ2VkaXQvY3JlYXRlSnVweXRlck5vdGVib29rJ10gfSxcblx0eyBuYW1lOiAnV2ViRmV0Y2gnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS53ZWJGZXRjaCcsICdGZXRjaCBVUkwgY29udGVudCcpLCB0b29sRXF1aXZhbGVudDogW1NwZWNlZFRvb2xBbGlhc2VzLndlYl0gfSxcblx0eyBuYW1lOiAnV2ViU2VhcmNoJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUud2ViU2VhcmNoJywgJ1BlcmZvcm0gd2ViIHNlYXJjaGVzJyksIHRvb2xFcXVpdmFsZW50OiBbU3BlY2VkVG9vbEFsaWFzZXMud2ViXSB9LFxuXHR7IG5hbWU6ICdUYXNrJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUudGFzaycsICdSdW4gc3ViYWdlbnRzIGZvciBjb21wbGV4IHRhc2tzJyksIHRvb2xFcXVpdmFsZW50OiBbU3BlY2VkVG9vbEFsaWFzZXMuYWdlbnRdIH0sXG5cdHsgbmFtZTogJ1NraWxsJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUuc2tpbGwnLCAnRXhlY3V0ZSBza2lsbHMnKSwgdG9vbEVxdWl2YWxlbnQ6IFtdIH0sXG5cdHsgbmFtZTogJ0xTUCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLmxzcCcsICdDb2RlIGludGVsbGlnZW5jZSAocmVxdWlyZXMgcGx1Z2luKScpLCB0b29sRXF1aXZhbGVudDogW10gfSxcblx0eyBuYW1lOiAnTm90ZWJvb2tFZGl0JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUubm90ZWJvb2tFZGl0JywgJ01vZGlmeSBKdXB5dGVyIG5vdGVib29rcycpLCB0b29sRXF1aXZhbGVudDogWydlZGl0L2VkaXROb3RlYm9vayddIH0sXG5cdHsgbmFtZTogJ0Fza1VzZXJRdWVzdGlvbicsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLmFza1VzZXJRdWVzdGlvbicsICdBc2sgbXVsdGlwbGUtY2hvaWNlIHF1ZXN0aW9ucycpLCB0b29sRXF1aXZhbGVudDogWyd2c2NvZGUvYXNrUXVlc3Rpb25zJ10gfSxcblx0eyBuYW1lOiAnTUNQU2VhcmNoJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUubWNwU2VhcmNoJywgJ1NlYXJjaGVzIGZvciBNQ1AgdG9vbHMgd2hlbiB0b29sIHNlYXJjaCBpcyBlbmFibGVkJyksIHRvb2xFcXVpdmFsZW50OiBbXSB9XG5dO1xuXG5leHBvcnQgY29uc3Qga25vd25DbGF1ZGVNb2RlbHMgPSBbXG5cdHsgbmFtZTogJ3Nvbm5ldCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLnNvbm5ldCcsICdMYXRlc3QgQ2xhdWRlIFNvbm5ldCcpLCBtb2RlbEVxdWl2YWxlbnQ6ICdDbGF1ZGUgU29ubmV0IDQuNSAoY29waWxvdCknIH0sXG5cdHsgbmFtZTogJ29wdXMnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5vcHVzJywgJ0xhdGVzdCBDbGF1ZGUgT3B1cycpLCBtb2RlbEVxdWl2YWxlbnQ6ICdDbGF1ZGUgT3B1cyA0LjYgKGNvcGlsb3QpJyB9LFxuXHR7IG5hbWU6ICdoYWlrdScsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLmhhaWt1JywgJ0xhdGVzdCBDbGF1ZGUgSGFpa3UsIGZhc3QgZm9yIHNpbXBsZSB0YXNrcycpLCBtb2RlbEVxdWl2YWxlbnQ6ICdDbGF1ZGUgSGFpa3UgNC41IChjb3BpbG90KScgfSxcblx0eyBuYW1lOiAnaW5oZXJpdCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLmluaGVyaXQnLCAnSW5oZXJpdCBtb2RlbCBmcm9tIHBhcmVudCBhZ2VudCBvciBwcm9tcHQnKSwgbW9kZWxFcXVpdmFsZW50OiB1bmRlZmluZWQgfSxcbl07XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXBDbGF1ZGVNb2RlbHMoY2xhdWRlTW9kZWxOYW1lczogcmVhZG9ubHkgc3RyaW5nW10pOiByZWFkb25seSBzdHJpbmdbXSB7XG5cdGNvbnN0IHJlc3VsdCA9IFtdO1xuXHRmb3IgKGNvbnN0IG5hbWUgb2YgY2xhdWRlTW9kZWxOYW1lcykge1xuXHRcdGNvbnN0IGNsYXVkZU1vZGVsID0ga25vd25DbGF1ZGVNb2RlbHMuZmluZChtb2RlbCA9PiBtb2RlbC5uYW1lID09PSBuYW1lKTtcblx0XHRpZiAoY2xhdWRlTW9kZWwgJiYgY2xhdWRlTW9kZWwubW9kZWxFcXVpdmFsZW50KSB7XG5cdFx0XHRyZXN1bHQucHVzaChjbGF1ZGVNb2RlbC5tb2RlbEVxdWl2YWxlbnQpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIE1hcHMgQ2xhdWRlIHRvb2wgbmFtZXMgdG8gdGhlaXIgVlMgQ29kZSB0b29sIGVxdWl2YWxlbnRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWFwQ2xhdWRlVG9vbHMoY2xhdWRlVG9vbE5hbWVzOiByZWFkb25seSBzdHJpbmdbXSk6IHN0cmluZ1tdIHtcblx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IG5hbWUgb2YgY2xhdWRlVG9vbE5hbWVzKSB7XG5cdFx0Y29uc3QgY2xhdWRlVG9vbCA9IGtub3duQ2xhdWRlVG9vbHMuZmluZCh0b29sID0+IHRvb2wubmFtZSA9PT0gbmFtZSk7XG5cdFx0aWYgKGNsYXVkZVRvb2wpIHtcblx0XHRcdHJlc3VsdC5wdXNoKC4uLmNsYXVkZVRvb2wudG9vbEVxdWl2YWxlbnQpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgY29uc3QgY2xhdWRlQWdlbnRBdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCB7IHR5cGU6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZzsgZGVmYXVsdHM/OiBzdHJpbmdbXTsgaXRlbXM/OiBJVmFsdWVFbnRyeVtdOyBlbnVtcz86IElWYWx1ZUVudHJ5W10gfT4gPSB7XG5cdCduYW1lJzoge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLm5hbWUnLCBcIlVuaXF1ZSBpZGVudGlmaWVyIHVzaW5nIGxvd2VyY2FzZSBsZXR0ZXJzIGFuZCBoeXBoZW5zIChyZXF1aXJlZClcIiksXG5cdH0sXG5cdCdkZXNjcmlwdGlvbic6IHtcblx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F0dHJpYnV0ZS5kZXNjcmlwdGlvbicsIFwiV2hlbiB0byBkZWxlZ2F0ZSB0byB0aGlzIHN1YmFnZW50IChyZXF1aXJlZClcIiksXG5cdH0sXG5cdCd0b29scyc6IHtcblx0XHR0eXBlOiAnc2VxdWVuY2UnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLnRvb2xzJywgXCJBcnJheSBvZiB0b29scyB0aGUgc3ViYWdlbnQgY2FuIHVzZS4gSW5oZXJpdHMgYWxsIHRvb2xzIGlmIG9taXR0ZWRcIiksXG5cdFx0ZGVmYXVsdHM6IFsnUmVhZCwgRWRpdCwgQmFzaCddLFxuXHRcdGl0ZW1zOiBrbm93bkNsYXVkZVRvb2xzXG5cdH0sXG5cdCdkaXNhbGxvd2VkVG9vbHMnOiB7XG5cdFx0dHlwZTogJ3NlcXVlbmNlJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F0dHJpYnV0ZS5kaXNhbGxvd2VkVG9vbHMnLCBcIlRvb2xzIHRvIGRlbnksIHJlbW92ZWQgZnJvbSBpbmhlcml0ZWQgb3Igc3BlY2lmaWVkIGxpc3RcIiksXG5cdFx0ZGVmYXVsdHM6IFsnV3JpdGUsIEVkaXQsIEJhc2gnXSxcblx0XHRpdGVtczoga25vd25DbGF1ZGVUb29sc1xuXHR9LFxuXHQnbW9kZWwnOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdHRyaWJ1dGUubW9kZWwnLCBcIk1vZGVsIHRvIHVzZTogc29ubmV0LCBvcHVzLCBoYWlrdSwgb3IgaW5oZXJpdC4gRGVmYXVsdHMgdG8gaW5oZXJpdC5cIiksXG5cdFx0ZGVmYXVsdHM6IFsnc29ubmV0JywgJ29wdXMnLCAnaGFpa3UnLCAnaW5oZXJpdCddLFxuXHRcdGVudW1zOiBrbm93bkNsYXVkZU1vZGVsc1xuXHR9LFxuXHQncGVybWlzc2lvbk1vZGUnOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdHRyaWJ1dGUucGVybWlzc2lvbk1vZGUnLCBcIlBlcm1pc3Npb24gbW9kZTogZGVmYXVsdCwgYWNjZXB0RWRpdHMsIGRvbnRBc2ssIGJ5cGFzc1Blcm1pc3Npb25zLCBvciBwbGFuLlwiKSxcblx0XHRkZWZhdWx0czogWydkZWZhdWx0JywgJ2FjY2VwdEVkaXRzJywgJ2RvbnRBc2snLCAnYnlwYXNzUGVybWlzc2lvbnMnLCAncGxhbiddLFxuXHRcdGVudW1zOiBbXG5cdFx0XHR7IG5hbWU6ICdkZWZhdWx0JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUucGVybWlzc2lvbk1vZGUuZGVmYXVsdCcsICdTdGFuZGFyZCBiZWhhdmlvcjogcHJvbXB0cyBmb3IgcGVybWlzc2lvbiBvbiBmaXJzdCB1c2Ugb2YgZWFjaCB0b29sLicpIH0sXG5cdFx0XHR7IG5hbWU6ICdhY2NlcHRFZGl0cycsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLnBlcm1pc3Npb25Nb2RlLmFjY2VwdEVkaXRzJywgJ0F1dG9tYXRpY2FsbHkgYWNjZXB0cyBmaWxlIGVkaXQgcGVybWlzc2lvbnMgZm9yIHRoZSBzZXNzaW9uLicpIH0sXG5cdFx0XHR7IG5hbWU6ICdwbGFuJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUucGVybWlzc2lvbk1vZGUucGxhbicsICdQbGFuIE1vZGU6IENsYXVkZSBjYW4gYW5hbHl6ZSBidXQgbm90IG1vZGlmeSBmaWxlcyBvciBleGVjdXRlIGNvbW1hbmRzLicpIH0sXG5cdFx0XHR7IG5hbWU6ICdkZWxlZ2F0ZScsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLnBlcm1pc3Npb25Nb2RlLmRlbGVnYXRlJywgJ0Nvb3JkaW5hdGlvbi1vbmx5IG1vZGUgZm9yIGFnZW50IHRlYW0gbGVhZHMuIE9ubHkgYXZhaWxhYmxlIHdoZW4gYW4gYWdlbnQgdGVhbSBpcyBhY3RpdmUuJykgfSxcblx0XHRcdHsgbmFtZTogJ2RvbnRBc2snLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5wZXJtaXNzaW9uTW9kZS5kb250QXNrJywgJ0F1dG8tZGVuaWVzIHRvb2xzIHVubGVzcyBwcmUtYXBwcm92ZWQgdmlhIC9wZXJtaXNzaW9ucyBvciBwZXJtaXNzaW9ucy5hbGxvdyBydWxlcy4nKSB9LFxuXHRcdFx0eyBuYW1lOiAnYnlwYXNzUGVybWlzc2lvbnMnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5wZXJtaXNzaW9uTW9kZS5ieXBhc3NQZXJtaXNzaW9ucycsICdTa2lwcyBhbGwgcGVybWlzc2lvbiBwcm9tcHRzIChyZXF1aXJlcyBzYWZlIGVudmlyb25tZW50IGxpa2UgY29udGFpbmVycykuJykgfVxuXHRcdF1cblx0fSxcblx0J3NraWxscyc6IHtcblx0XHR0eXBlOiAnc2VxdWVuY2UnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLnNraWxscycsIFwiU2tpbGxzIHRvIGxvYWQgaW50byB0aGUgc3ViYWdlbnQncyBjb250ZXh0IGF0IHN0YXJ0dXAuXCIpLFxuXHR9LFxuXHQnbWNwU2VydmVycyc6IHtcblx0XHR0eXBlOiAnc2VxdWVuY2UnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLm1jcFNlcnZlcnMnLCBcIk1DUCBzZXJ2ZXJzIGF2YWlsYWJsZSB0byB0aGlzIHN1YmFnZW50LlwiKSxcblx0fSxcblx0J2hvb2tzJzoge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLmhvb2tzJywgXCJMaWZlY3ljbGUgaG9va3Mgc2NvcGVkIHRvIHRoaXMgc3ViYWdlbnQuXCIpLFxuXHR9LFxuXHQnbWVtb3J5Jzoge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLm1lbW9yeScsIFwiUGVyc2lzdGVudCBtZW1vcnkgc2NvcGU6IHVzZXIsIHByb2plY3QsIG9yIGxvY2FsLiBFbmFibGVzIGNyb3NzLXNlc3Npb24gbGVhcm5pbmcuXCIpLFxuXHRcdGRlZmF1bHRzOiBbJ3VzZXInLCAncHJvamVjdCcsICdsb2NhbCddLFxuXHRcdGVudW1zOiBbXG5cdFx0XHR7IG5hbWU6ICd1c2VyJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUubWVtb3J5LnVzZXInLCBcIlJlbWVtYmVyIGxlYXJuaW5ncyBhY3Jvc3MgYWxsIHByb2plY3RzLlwiKSB9LFxuXHRcdFx0eyBuYW1lOiAncHJvamVjdCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLm1lbW9yeS5wcm9qZWN0JywgXCJUaGUgc3ViYWdlbnQncyBrbm93bGVkZ2UgaXMgcHJvamVjdC1zcGVjaWZpYyBhbmQgc2hhcmVhYmxlIHZpYSB2ZXJzaW9uIGNvbnRyb2wuXCIpIH0sXG5cdFx0XHR7IG5hbWU6ICdsb2NhbCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLm1lbW9yeS5sb2NhbCcsIFwiVGhlIHN1YmFnZW50J3Mga25vd2xlZGdlIGlzIHByb2plY3Qtc3BlY2lmaWMgYnV0IHNob3VsZCBub3QgYmUgY2hlY2tlZCBpbnRvIHZlcnNpb24gY29udHJvbC5cIikgfVxuXHRcdF1cblx0fVxufTtcblxuLyoqXG4gKiBBdHRyaWJ1dGVzIHN1cHBvcnRlZCBpbiBDbGF1ZGUgcnVsZXMgZmlsZXMgKGAuY2xhdWRlL3J1bGVzLyoubWRgKS5cbiAqIENsYXVkZSBydWxlcyB1c2UgYHBhdGhzYCBpbnN0ZWFkIG9mIGBhcHBseVRvYCBmb3IgZ2xvYiBwYXR0ZXJucy5cbiAqL1xuZXhwb3J0IGNvbnN0IGNsYXVkZVJ1bGVzQXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgeyB0eXBlOiBzdHJpbmc7IGRlc2NyaXB0aW9uOiBzdHJpbmc7IGRlZmF1bHRzPzogc3RyaW5nW107IGl0ZW1zPzogSVZhbHVlRW50cnlbXTsgZW51bXM/OiBJVmFsdWVFbnRyeVtdIH0+ID0ge1xuXHQnZGVzY3JpcHRpb24nOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdHRyaWJ1dGUucnVsZXMuZGVzY3JpcHRpb24nLCBcIkEgZGVzY3JpcHRpb24gb2Ygd2hhdCB0aGlzIHJ1bGUgY292ZXJzLCB1c2VkIHRvIHByb3ZpZGUgY29udGV4dCBhYm91dCB3aGVuIGl0IGFwcGxpZXMuXCIpLFxuXHR9LFxuXHQncGF0aHMnOiB7XG5cdFx0dHlwZTogJ3NlcXVlbmNlJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F0dHJpYnV0ZS5ydWxlcy5wYXRocycsIFwiQXJyYXkgb2YgZ2xvYiBwYXR0ZXJucyB0aGF0IGRlc2NyaWJlIGZvciB3aGljaCBmaWxlcyB0aGUgcnVsZSBhcHBsaWVzLiBCYXNlZCBvbiB0aGVzZSBwYXR0ZXJucywgdGhlIGZpbGUgaXMgYXV0b21hdGljYWxseSBpbmNsdWRlZCBpbiB0aGUgcHJvbXB0IHdoZW4gdGhlIGNvbnRleHQgY29udGFpbnMgYSBmaWxlIHRoYXQgbWF0Y2hlcy5cXG5FeGFtcGxlOiBgWydzcmMvKiovKi50cycsICd0ZXN0LyoqJ11gXCIpLFxuXHR9LFxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGlzVlNDb2RlT3JEZWZhdWx0VGFyZ2V0KHRhcmdldDogVGFyZ2V0KTogYm9vbGVhbiB7XG5cdHJldHVybiB0YXJnZXQgPT09IFRhcmdldC5WU0NvZGUgfHwgdGFyZ2V0ID09PSBUYXJnZXQuVW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VGFyZ2V0KHByb21wdFR5cGU6IFByb21wdHNUeXBlLCBoZWFkZXI6IFByb21wdEhlYWRlciB8IFVSSSk6IFRhcmdldCB7XG5cdGNvbnN0IHVyaSA9IGhlYWRlciBpbnN0YW5jZW9mIFVSSSA/IGhlYWRlciA6IGhlYWRlci51cmk7XG5cdGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCkge1xuXHRcdGNvbnN0IHBhcmVudERpciA9IGRpcm5hbWUodXJpKTtcblx0XHRpZiAocGFyZW50RGlyLnBhdGguZW5kc1dpdGgoYC8ke0NMQVVERV9BR0VOVFNfU09VUkNFX0ZPTERFUn1gKSkge1xuXHRcdFx0cmV0dXJuIFRhcmdldC5DbGF1ZGU7XG5cdFx0fVxuXHRcdGlmICghKGhlYWRlciBpbnN0YW5jZW9mIFVSSSkpIHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGhlYWRlci50YXJnZXQ7XG5cdFx0XHRpZiAodGFyZ2V0ID09PSBUYXJnZXQuR2l0SHViQ29waWxvdCB8fCB0YXJnZXQgPT09IFRhcmdldC5WU0NvZGUpIHtcblx0XHRcdFx0cmV0dXJuIHRhcmdldDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFRhcmdldC5VbmRlZmluZWQ7XG5cdH0gZWxzZSBpZiAocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKSB7XG5cdFx0aWYgKGlzSW5DbGF1ZGVSdWxlc0ZvbGRlcih1cmkpKSB7XG5cdFx0XHRyZXR1cm4gVGFyZ2V0LkNsYXVkZTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIFRhcmdldC5VbmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHRvTWFya2VyKG1lc3NhZ2U6IHN0cmluZywgcmFuZ2U6IFJhbmdlLCBzZXZlcml0eSA9IE1hcmtlclNldmVyaXR5LkVycm9yLCB0YWdzPzogTWFya2VyVGFnW10sIGNvZGU/OiBzdHJpbmcpOiBJTWFya2VyRGF0YSB7XG5cdHJldHVybiB7IHNldmVyaXR5LCBtZXNzYWdlLCAuLi4odGFncyA/IHsgdGFncyB9IDoge30pLCAuLi4oY29kZSA/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
