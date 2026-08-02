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
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { localize } from "../../../../../../nls.js";
import { ILanguageModelsService } from "../../languageModels.js";
import { ILanguageModelToolsService, isToolSet } from "../../tools/languageModelToolsService.js";
import { IChatModeService, isBuiltinChatMode } from "../../chatModes.js";
import { getPromptsTypeForLanguageId, PromptsType, Target } from "../promptTypes.js";
import { IPromptsService } from "../service/promptsService.js";
import { parseCommaSeparatedList, PromptHeaderAttributes } from "../promptFileParser.js";
import { ClaudeHeaderAttributes, getAttributeDefinition, getTarget, isVSCodeOrDefaultTarget, knownClaudeModels, knownClaudeTools } from "./promptFileAttributes.js";
import { HOOKS_BY_TARGET, HOOK_METADATA } from "../hookTypes.js";
import { HOOK_COMMAND_FIELD_DESCRIPTIONS } from "../hookSchema.js";
let PromptHoverProvider = class {
  constructor(promptsService, languageModelToolsService, languageModelsService, chatModeService) {
    this.promptsService = promptsService;
    this.languageModelToolsService = languageModelToolsService;
    this.languageModelsService = languageModelsService;
    this.chatModeService = chatModeService;
    /**
     * Debug display name for this provider.
     */
    this._debugDisplayName = "PromptHoverProvider";
  }
  createHover(contents, range) {
    return {
      contents: [new MarkdownString(contents)],
      range
    };
  }
  async provideHover(model, position, token, _context) {
    const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
    if (!promptType) {
      return void 0;
    }
    const promptAST = this.promptsService.getParsedPromptFile(model);
    const target = getTarget(promptType, promptAST.header ?? model.uri);
    if (promptAST.header?.range.containsPosition(position)) {
      return this.provideHeaderHover(position, promptType, promptAST.header, target);
    }
    if (promptAST.body?.range.containsPosition(position)) {
      return this.provideBodyHover(position, promptAST.body, target);
    }
    return void 0;
  }
  async provideBodyHover(position, body, target) {
    for (const ref of body.variableReferences) {
      if (ref.range.containsPosition(position)) {
        const toolName = ref.name;
        return this.getToolHoverByName(toolName, ref.range, target);
      }
    }
    return void 0;
  }
  async provideHeaderHover(position, promptType, header, target) {
    for (const attribute of header.attributes) {
      if (attribute.range.containsPosition(position)) {
        const description = getAttributeDefinition(attribute.key, promptType, target)?.description;
        if (description) {
          switch (attribute.key) {
            case PromptHeaderAttributes.model:
              return this.getModelHover(attribute, position, description, target);
            case PromptHeaderAttributes.tools:
            case ClaudeHeaderAttributes.disallowedTools:
              return this.getToolHover(attribute, position, description, target);
            case PromptHeaderAttributes.agent:
            case PromptHeaderAttributes.mode:
              return this.getAgentHover(attribute, position, description);
            case PromptHeaderAttributes.handOffs:
              return this.getHandsOffHover(attribute, position, target);
            case PromptHeaderAttributes.hooks:
              return this.getHooksHover(attribute, position, description, target);
            case PromptHeaderAttributes.infer:
              return this.createHover(description + "\n\n" + localize("promptHeader.attribute.infer.hover", "Deprecated: Use `user-invocable` and `disable-model-invocation` instead."), attribute.range);
            default:
              return this.createHover(description, attribute.range);
          }
        }
      }
    }
    return void 0;
  }
  getToolHover(node, position, baseMessage, target) {
    let value = node.value;
    if (value.type === "scalar") {
      value = parseCommaSeparatedList(value);
    }
    if (value.type === "sequence") {
      for (const toolName of value.items) {
        if (toolName.type === "scalar" && toolName.range.containsPosition(position)) {
          const description = this.getToolHoverByName(toolName.value, toolName.range, target);
          if (description) {
            return description;
          }
        }
      }
    }
    return this.createHover(baseMessage, node.range);
  }
  getToolHoverByName(toolName, range, target) {
    if (target === Target.Claude) {
      const description = knownClaudeTools.find((tool2) => tool2.name === toolName)?.description;
      if (description) {
        return this.createHover(description, range);
      }
      return void 0;
    }
    const tool = this.languageModelToolsService.getToolByFullReferenceName(toolName);
    if (tool !== void 0) {
      if (isToolSet(tool)) {
        return this.getToolsetHover(tool, range);
      } else {
        return this.createHover(tool.userDescription ?? tool.modelDescription, range);
      }
    }
    return void 0;
  }
  getToolsetHover(toolSet, range) {
    const lines = [];
    lines.push(localize("toolSetName", "ToolSet: {0}\n\n", toolSet.referenceName));
    if (toolSet.description) {
      lines.push(toolSet.description);
    }
    for (const tool of toolSet.getTools()) {
      lines.push(`- ${tool.toolReferenceName ?? tool.displayName}`);
    }
    return this.createHover(lines.join("\n"), range);
  }
  getModelHover(node, position, baseMessage, target) {
    if (target === Target.GitHubCopilot) {
      return this.createHover(baseMessage + "\n\n" + localize("promptHeader.agent.model.githubCopilot", "Note: This attribute is not used when target is github-copilot."), node.range);
    }
    const modelHoverContent = (modelName) => {
      const lines = [];
      lines.push(baseMessage + "\n");
      if (target === Target.Claude) {
        const claudeModel = knownClaudeModels.find((model) => model.name === modelName);
        if (!claudeModel) {
          return this.createHover(lines.join("\n"), node.range);
        }
        if (claudeModel.modelEquivalent) {
          lines.push(localize("claudeModelEquivalent", "Claude model `{0}` maps to the following model:\n", modelName));
          modelName = claudeModel.modelEquivalent;
        } else {
          lines.push(claudeModel.description);
          return this.createHover(lines.join("\n"), node.range);
        }
      }
      const result = this.languageModelsService.lookupLanguageModelByQualifiedName(modelName);
      if (result) {
        const meta = result.metadata;
        lines.push(localize("modelName", "- Name: {0}", meta.name));
        lines.push(localize("modelFamily", "- Family: {0}", meta.family));
        lines.push(localize("modelVendor", "- Vendor: {0}", meta.vendor));
        if (meta.tooltip) {
          lines.push("", "", meta.tooltip);
        }
        return this.createHover(lines.join("\n"), node.range);
      }
      return void 0;
    };
    if (node.value.type === "scalar") {
      const hover = modelHoverContent(node.value.value);
      if (hover) {
        return hover;
      }
    } else if (node.value.type === "sequence") {
      for (const item of node.value.items) {
        if (item.type === "scalar" && item.range.containsPosition(position)) {
          const hover = modelHoverContent(item.value);
          if (hover) {
            return hover;
          }
        }
      }
    }
    return this.createHover(baseMessage, node.range);
  }
  async getAgentHover(agentAttribute, position, baseMessage) {
    const lines = [];
    const value = agentAttribute.value;
    if (value.type === "scalar" && value.range.containsPosition(position)) {
      const agent = (await this.chatModeService.getLocalModes()).findModeByName(value.value);
      if (agent) {
        const description = agent.description.get() || (isBuiltinChatMode(agent) ? localize("promptHeader.prompt.agent.builtInDesc", "Built-in agent") : localize("promptHeader.prompt.agent.customDesc", "Custom agent"));
        lines.push(`\`${agent.name.get()}\`: ${description}`);
      }
    } else {
      const agents = await this.chatModeService.getLocalModes();
      lines.push(baseMessage);
      lines.push("");
      lines.push(localize("promptHeader.prompt.agent.builtin", "**Built-in agents:**"));
      for (const agent of agents.builtin) {
        lines.push(`- \`${agent.name.get()}\`: ${agent.description.get() || agent.label.get()}`);
      }
      if (agents.custom.length > 0) {
        lines.push("");
        lines.push(localize("promptHeader.prompt.agent.custom", "**Custom agents:**"));
        for (const agent of agents.custom) {
          const description = agent.description.get();
          lines.push(`- \`${agent.name.get()}\`: ${description || localize("promptHeader.prompt.agent.customDesc", "Custom agent")}`);
        }
      }
    }
    return this.createHover(lines.join("\n"), agentAttribute.range);
  }
  getHooksHover(attribute, position, baseMessage, target) {
    const value = attribute.value;
    if (value.type === "map") {
      const hooksByTarget = HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined];
      for (const prop of value.properties) {
        if (prop.key.range.containsPosition(position)) {
          const hookType = hooksByTarget[prop.key.value];
          if (hookType) {
            const meta = HOOK_METADATA[hookType];
            return this.createHover(`**${meta.label}**

${meta.description}`, prop.key.range);
          }
        }
        if (prop.value.type === "sequence") {
          const hover = this.getHookCommandItemHover(prop.value, position);
          if (hover) {
            return hover;
          }
        }
      }
    }
    return this.createHover(baseMessage, attribute.range);
  }
  /**
   * Recursively searches hook command items for hover information.
   * Handles both direct command objects and nested matcher format
   * (e.g., `{ matcher: "...", hooks: [{ type: command, ... }] }`).
   */
  getHookCommandItemHover(sequence, position) {
    for (const item of sequence.items) {
      if (item.type !== "map" || !item.range.containsPosition(position)) {
        continue;
      }
      const nestedHooks = item.properties.find((p) => p.key.value === "hooks");
      if (nestedHooks && nestedHooks.value.type === "sequence") {
        const hover = this.getHookCommandItemHover(nestedHooks.value, position);
        if (hover) {
          return hover;
        }
      }
      for (const field of item.properties) {
        if (field.key.range.containsPosition(position) || field.value.range.containsPosition(position)) {
          const desc = HOOK_COMMAND_FIELD_DESCRIPTIONS[field.key.value];
          if (desc) {
            return this.createHover(desc, field.key.range);
          }
        }
      }
    }
    return void 0;
  }
  getHandsOffHover(attribute, position, target) {
    const handoffsBaseMessage = getAttributeDefinition(PromptHeaderAttributes.handOffs, PromptsType.agent, target)?.description;
    if (!isVSCodeOrDefaultTarget(target)) {
      return this.createHover(handoffsBaseMessage + "\n\n" + localize("promptHeader.agent.handoffs.githubCopilot", "Note: This attribute is not used in GitHub Copilot or Claude targets."), attribute.range);
    }
    return this.createHover(handoffsBaseMessage, attribute.range);
  }
};
PromptHoverProvider = __decorateClass([
  __decorateParam(0, IPromptsService),
  __decorateParam(1, ILanguageModelToolsService),
  __decorateParam(2, ILanguageModelsService),
  __decorateParam(3, IChatModeService)
], PromptHoverProvider);
export {
  PromptHoverProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRIb3ZlcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEhvdmVyLCBIb3ZlckNvbnRleHQsIEhvdmVyUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIGlzVG9vbFNldCwgSVRvb2xTZXQgfSBmcm9tICcuLi8uLi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZVNlcnZpY2UsIGlzQnVpbHRpbkNoYXRNb2RlIH0gZnJvbSAnLi4vLi4vY2hhdE1vZGVzLmpzJztcbmltcG9ydCB7IGdldFByb21wdHNUeXBlRm9yTGFuZ3VhZ2VJZCwgUHJvbXB0c1R5cGUsIFRhcmdldCB9IGZyb20gJy4uL3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSB9IGZyb20gJy4uL3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhlYWRlckF0dHJpYnV0ZSwgSVNlcXVlbmNlVmFsdWUsIHBhcnNlQ29tbWFTZXBhcmF0ZWRMaXN0LCBQcm9tcHRCb2R5LCBQcm9tcHRIZWFkZXIsIFByb21wdEhlYWRlckF0dHJpYnV0ZXMgfSBmcm9tICcuLi9wcm9tcHRGaWxlUGFyc2VyLmpzJztcbmltcG9ydCB7IENsYXVkZUhlYWRlckF0dHJpYnV0ZXMsIGdldEF0dHJpYnV0ZURlZmluaXRpb24sIGdldFRhcmdldCwgaXNWU0NvZGVPckRlZmF1bHRUYXJnZXQsIGtub3duQ2xhdWRlTW9kZWxzLCBrbm93bkNsYXVkZVRvb2xzIH0gZnJvbSAnLi9wcm9tcHRGaWxlQXR0cmlidXRlcy5qcyc7XG5pbXBvcnQgeyBIT09LU19CWV9UQVJHRVQsIEhPT0tfTUVUQURBVEEgfSBmcm9tICcuLi9ob29rVHlwZXMuanMnO1xuaW1wb3J0IHsgSE9PS19DT01NQU5EX0ZJRUxEX0RFU0NSSVBUSU9OUyB9IGZyb20gJy4uL2hvb2tTY2hlbWEuanMnO1xuXG5leHBvcnQgY2xhc3MgUHJvbXB0SG92ZXJQcm92aWRlciBpbXBsZW1lbnRzIEhvdmVyUHJvdmlkZXIge1xuXHQvKipcblx0ICogRGVidWcgZGlzcGxheSBuYW1lIGZvciB0aGlzIHByb3ZpZGVyLlxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IF9kZWJ1Z0Rpc3BsYXlOYW1lOiBzdHJpbmcgPSAnUHJvbXB0SG92ZXJQcm92aWRlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcm9tcHRzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb21wdHNTZXJ2aWNlOiBJUHJvbXB0c1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZTogSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElDaGF0TW9kZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0TW9kZVNlcnZpY2U6IElDaGF0TW9kZVNlcnZpY2UsXG5cdCkge1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVIb3Zlcihjb250ZW50czogc3RyaW5nLCByYW5nZTogUmFuZ2UpOiBIb3ZlciB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRlbnRzOiBbbmV3IE1hcmtkb3duU3RyaW5nKGNvbnRlbnRzKV0sXG5cdFx0XHRyYW5nZVxuXHRcdH07XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcHJvdmlkZUhvdmVyKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgX2NvbnRleHQ/OiBIb3ZlckNvbnRleHQpOiBQcm9taXNlPEhvdmVyIHwgdW5kZWZpbmVkPiB7XG5cblx0XHRjb25zdCBwcm9tcHRUeXBlID0gZ2V0UHJvbXB0c1R5cGVGb3JMYW5ndWFnZUlkKG1vZGVsLmdldExhbmd1YWdlSWQoKSk7XG5cdFx0aWYgKCFwcm9tcHRUeXBlKSB7XG5cdFx0XHQvLyBpZiB0aGUgbW9kZWwgaXMgbm90IGEgcHJvbXB0LCB3ZSBkb24ndCBwcm92aWRlIGFueSBob3ZlcnNcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvbXB0QVNUID0gdGhpcy5wcm9tcHRzU2VydmljZS5nZXRQYXJzZWRQcm9tcHRGaWxlKG1vZGVsKTtcblx0XHRjb25zdCB0YXJnZXQgPSBnZXRUYXJnZXQocHJvbXB0VHlwZSwgcHJvbXB0QVNULmhlYWRlciA/PyBtb2RlbC51cmkpO1xuXG5cdFx0aWYgKHByb21wdEFTVC5oZWFkZXI/LnJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wcm92aWRlSGVhZGVySG92ZXIocG9zaXRpb24sIHByb21wdFR5cGUsIHByb21wdEFTVC5oZWFkZXIsIHRhcmdldCk7XG5cdFx0fVxuXHRcdGlmIChwcm9tcHRBU1QuYm9keT8ucmFuZ2UuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbikpIHtcblx0XHRcdHJldHVybiB0aGlzLnByb3ZpZGVCb2R5SG92ZXIocG9zaXRpb24sIHByb21wdEFTVC5ib2R5LCB0YXJnZXQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwcm92aWRlQm9keUhvdmVyKHBvc2l0aW9uOiBQb3NpdGlvbiwgYm9keTogUHJvbXB0Qm9keSwgdGFyZ2V0OiBUYXJnZXQpOiBQcm9taXNlPEhvdmVyIHwgdW5kZWZpbmVkPiB7XG5cdFx0Zm9yIChjb25zdCByZWYgb2YgYm9keS52YXJpYWJsZVJlZmVyZW5jZXMpIHtcblx0XHRcdGlmIChyZWYucmFuZ2UuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbikpIHtcblx0XHRcdFx0Y29uc3QgdG9vbE5hbWUgPSByZWYubmFtZTtcblxuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRUb29sSG92ZXJCeU5hbWUodG9vbE5hbWUsIHJlZi5yYW5nZSwgdGFyZ2V0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcHJvdmlkZUhlYWRlckhvdmVyKHBvc2l0aW9uOiBQb3NpdGlvbiwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUsIGhlYWRlcjogUHJvbXB0SGVhZGVyLCB0YXJnZXQ6IFRhcmdldCk6IFByb21pc2U8SG92ZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRmb3IgKGNvbnN0IGF0dHJpYnV0ZSBvZiBoZWFkZXIuYXR0cmlidXRlcykge1xuXHRcdFx0aWYgKGF0dHJpYnV0ZS5yYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSkge1xuXHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGdldEF0dHJpYnV0ZURlZmluaXRpb24oYXR0cmlidXRlLmtleSwgcHJvbXB0VHlwZSwgdGFyZ2V0KT8uZGVzY3JpcHRpb247XG5cdFx0XHRcdGlmIChkZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdHN3aXRjaCAoYXR0cmlidXRlLmtleSkge1xuXHRcdFx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm1vZGVsOlxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRNb2RlbEhvdmVyKGF0dHJpYnV0ZSwgcG9zaXRpb24sIGRlc2NyaXB0aW9uLCB0YXJnZXQpO1xuXHRcdFx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnRvb2xzOlxuXHRcdFx0XHRcdFx0Y2FzZSBDbGF1ZGVIZWFkZXJBdHRyaWJ1dGVzLmRpc2FsbG93ZWRUb29sczpcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuZ2V0VG9vbEhvdmVyKGF0dHJpYnV0ZSwgcG9zaXRpb24sIGRlc2NyaXB0aW9uLCB0YXJnZXQpO1xuXHRcdFx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFnZW50OlxuXHRcdFx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm1vZGU6XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmdldEFnZW50SG92ZXIoYXR0cmlidXRlLCBwb3NpdGlvbiwgZGVzY3JpcHRpb24pO1xuXHRcdFx0XHRcdFx0Y2FzZSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmhhbmRPZmZzOlxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRIYW5kc09mZkhvdmVyKGF0dHJpYnV0ZSwgcG9zaXRpb24sIHRhcmdldCk7XG5cdFx0XHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaG9va3M6XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmdldEhvb2tzSG92ZXIoYXR0cmlidXRlLCBwb3NpdGlvbiwgZGVzY3JpcHRpb24sIHRhcmdldCk7XG5cdFx0XHRcdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaW5mZXI6XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUhvdmVyKGRlc2NyaXB0aW9uICsgJ1xcblxcbicgKyBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmF0dHJpYnV0ZS5pbmZlci5ob3ZlcicsICdEZXByZWNhdGVkOiBVc2UgYHVzZXItaW52b2NhYmxlYCBhbmQgYGRpc2FibGUtbW9kZWwtaW52b2NhdGlvbmAgaW5zdGVhZC4nKSwgYXR0cmlidXRlLnJhbmdlKTtcblx0XHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUhvdmVyKGRlc2NyaXB0aW9uLCBhdHRyaWJ1dGUucmFuZ2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRUb29sSG92ZXIobm9kZTogSUhlYWRlckF0dHJpYnV0ZSwgcG9zaXRpb246IFBvc2l0aW9uLCBiYXNlTWVzc2FnZTogc3RyaW5nLCB0YXJnZXQ6IFRhcmdldCk6IEhvdmVyIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgdmFsdWUgPSBub2RlLnZhbHVlO1xuXHRcdGlmICh2YWx1ZS50eXBlID09PSAnc2NhbGFyJykge1xuXHRcdFx0dmFsdWUgPSBwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdCh2YWx1ZSk7XG5cdFx0fVxuXHRcdGlmICh2YWx1ZS50eXBlID09PSAnc2VxdWVuY2UnKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHRvb2xOYW1lIG9mIHZhbHVlLml0ZW1zKSB7XG5cdFx0XHRcdGlmICh0b29sTmFtZS50eXBlID09PSAnc2NhbGFyJyAmJiB0b29sTmFtZS5yYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSkge1xuXHRcdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gdGhpcy5nZXRUb29sSG92ZXJCeU5hbWUodG9vbE5hbWUudmFsdWUsIHRvb2xOYW1lLnJhbmdlLCB0YXJnZXQpO1xuXHRcdFx0XHRcdGlmIChkZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGRlc2NyaXB0aW9uO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jcmVhdGVIb3ZlcihiYXNlTWVzc2FnZSwgbm9kZS5yYW5nZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldFRvb2xIb3ZlckJ5TmFtZSh0b29sTmFtZTogc3RyaW5nLCByYW5nZTogUmFuZ2UsIHRhcmdldDogVGFyZ2V0KTogSG92ZXIgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0YXJnZXQgPT09IFRhcmdldC5DbGF1ZGUpIHtcblx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0ga25vd25DbGF1ZGVUb29scy5maW5kKHRvb2wgPT4gdG9vbC5uYW1lID09PSB0b29sTmFtZSk/LmRlc2NyaXB0aW9uO1xuXHRcdFx0aWYgKGRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUhvdmVyKGRlc2NyaXB0aW9uLCByYW5nZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB0b29sID0gdGhpcy5sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmdldFRvb2xCeUZ1bGxSZWZlcmVuY2VOYW1lKHRvb2xOYW1lKTtcblx0XHRpZiAodG9vbCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAoaXNUb29sU2V0KHRvb2wpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmdldFRvb2xzZXRIb3Zlcih0b29sLCByYW5nZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVIb3Zlcih0b29sLnVzZXJEZXNjcmlwdGlvbiA/PyB0b29sLm1vZGVsRGVzY3JpcHRpb24sIHJhbmdlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0VG9vbHNldEhvdmVyKHRvb2xTZXQ6IElUb29sU2V0LCByYW5nZTogUmFuZ2UpOiBIb3ZlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0bGluZXMucHVzaChsb2NhbGl6ZSgndG9vbFNldE5hbWUnLCAnVG9vbFNldDogezB9XFxuXFxuJywgdG9vbFNldC5yZWZlcmVuY2VOYW1lKSk7XG5cdFx0aWYgKHRvb2xTZXQuZGVzY3JpcHRpb24pIHtcblx0XHRcdGxpbmVzLnB1c2godG9vbFNldC5kZXNjcmlwdGlvbik7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgdG9vbCBvZiB0b29sU2V0LmdldFRvb2xzKCkpIHtcblx0XHRcdGxpbmVzLnB1c2goYC0gJHt0b29sLnRvb2xSZWZlcmVuY2VOYW1lID8/IHRvb2wuZGlzcGxheU5hbWV9YCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNyZWF0ZUhvdmVyKGxpbmVzLmpvaW4oJ1xcbicpLCByYW5nZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldE1vZGVsSG92ZXIobm9kZTogSUhlYWRlckF0dHJpYnV0ZSwgcG9zaXRpb246IFBvc2l0aW9uLCBiYXNlTWVzc2FnZTogc3RyaW5nLCB0YXJnZXQ6IFRhcmdldCk6IEhvdmVyIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGFyZ2V0ID09PSBUYXJnZXQuR2l0SHViQ29waWxvdCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlSG92ZXIoYmFzZU1lc3NhZ2UgKyAnXFxuXFxuJyArIGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuYWdlbnQubW9kZWwuZ2l0aHViQ29waWxvdCcsICdOb3RlOiBUaGlzIGF0dHJpYnV0ZSBpcyBub3QgdXNlZCB3aGVuIHRhcmdldCBpcyBnaXRodWItY29waWxvdC4nKSwgbm9kZS5yYW5nZSk7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsSG92ZXJDb250ZW50ID0gKG1vZGVsTmFtZTogc3RyaW5nKTogSG92ZXIgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRsaW5lcy5wdXNoKGJhc2VNZXNzYWdlICsgJ1xcbicpO1xuXG5cdFx0XHRpZiAodGFyZ2V0ID09PSBUYXJnZXQuQ2xhdWRlKSB7XG5cdFx0XHRcdGNvbnN0IGNsYXVkZU1vZGVsID0ga25vd25DbGF1ZGVNb2RlbHMuZmluZChtb2RlbCA9PiBtb2RlbC5uYW1lID09PSBtb2RlbE5hbWUpO1xuXHRcdFx0XHRpZiAoIWNsYXVkZU1vZGVsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlSG92ZXIobGluZXMuam9pbignXFxuJyksIG5vZGUucmFuZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChjbGF1ZGVNb2RlbC5tb2RlbEVxdWl2YWxlbnQpIHtcblx0XHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdjbGF1ZGVNb2RlbEVxdWl2YWxlbnQnLCAnQ2xhdWRlIG1vZGVsIGB7MH1gIG1hcHMgdG8gdGhlIGZvbGxvd2luZyBtb2RlbDpcXG4nLCBtb2RlbE5hbWUpKTtcblx0XHRcdFx0XHRtb2RlbE5hbWUgPSBjbGF1ZGVNb2RlbC5tb2RlbEVxdWl2YWxlbnQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGluZXMucHVzaChjbGF1ZGVNb2RlbC5kZXNjcmlwdGlvbik7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlSG92ZXIobGluZXMuam9pbignXFxuJyksIG5vZGUucmFuZ2UpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLmxvb2t1cExhbmd1YWdlTW9kZWxCeVF1YWxpZmllZE5hbWUobW9kZWxOYW1lKTtcblx0XHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdFx0Y29uc3QgbWV0YSA9IHJlc3VsdC5tZXRhZGF0YTtcblx0XHRcdFx0bGluZXMucHVzaChsb2NhbGl6ZSgnbW9kZWxOYW1lJywgJy0gTmFtZTogezB9JywgbWV0YS5uYW1lKSk7XG5cdFx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ21vZGVsRmFtaWx5JywgJy0gRmFtaWx5OiB7MH0nLCBtZXRhLmZhbWlseSkpO1xuXHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdtb2RlbFZlbmRvcicsICctIFZlbmRvcjogezB9JywgbWV0YS52ZW5kb3IpKTtcblx0XHRcdFx0aWYgKG1ldGEudG9vbHRpcCkge1xuXHRcdFx0XHRcdGxpbmVzLnB1c2goJycsICcnLCBtZXRhLnRvb2x0aXApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUhvdmVyKGxpbmVzLmpvaW4oJ1xcbicpLCBub2RlLnJhbmdlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fTtcblx0XHRpZiAobm9kZS52YWx1ZS50eXBlID09PSAnc2NhbGFyJykge1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBtb2RlbEhvdmVyQ29udGVudChub2RlLnZhbHVlLnZhbHVlKTtcblx0XHRcdGlmIChob3Zlcikge1xuXHRcdFx0XHRyZXR1cm4gaG92ZXI7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChub2RlLnZhbHVlLnR5cGUgPT09ICdzZXF1ZW5jZScpIHtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBub2RlLnZhbHVlLml0ZW1zKSB7XG5cdFx0XHRcdGlmIChpdGVtLnR5cGUgPT09ICdzY2FsYXInICYmIGl0ZW0ucmFuZ2UuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbikpIHtcblx0XHRcdFx0XHRjb25zdCBob3ZlciA9IG1vZGVsSG92ZXJDb250ZW50KGl0ZW0udmFsdWUpO1xuXHRcdFx0XHRcdGlmIChob3Zlcikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGhvdmVyO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jcmVhdGVIb3ZlcihiYXNlTWVzc2FnZSwgbm9kZS5yYW5nZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEFnZW50SG92ZXIoYWdlbnRBdHRyaWJ1dGU6IElIZWFkZXJBdHRyaWJ1dGUsIHBvc2l0aW9uOiBQb3NpdGlvbiwgYmFzZU1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8SG92ZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBsaW5lczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCB2YWx1ZSA9IGFnZW50QXR0cmlidXRlLnZhbHVlO1xuXHRcdGlmICh2YWx1ZS50eXBlID09PSAnc2NhbGFyJyAmJiB2YWx1ZS5yYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSkge1xuXHRcdFx0Y29uc3QgYWdlbnQgPSAoYXdhaXQgdGhpcy5jaGF0TW9kZVNlcnZpY2UuZ2V0TG9jYWxNb2RlcygpKS5maW5kTW9kZUJ5TmFtZSh2YWx1ZS52YWx1ZSk7XG5cdFx0XHRpZiAoYWdlbnQpIHtcblx0XHRcdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBhZ2VudC5kZXNjcmlwdGlvbi5nZXQoKSB8fCAoaXNCdWlsdGluQ2hhdE1vZGUoYWdlbnQpID8gbG9jYWxpemUoJ3Byb21wdEhlYWRlci5wcm9tcHQuYWdlbnQuYnVpbHRJbkRlc2MnLCAnQnVpbHQtaW4gYWdlbnQnKSA6IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIucHJvbXB0LmFnZW50LmN1c3RvbURlc2MnLCAnQ3VzdG9tIGFnZW50JykpO1xuXHRcdFx0XHRsaW5lcy5wdXNoKGBcXGAke2FnZW50Lm5hbWUuZ2V0KCl9XFxgOiAke2Rlc2NyaXB0aW9ufWApO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBhZ2VudHMgPSBhd2FpdCB0aGlzLmNoYXRNb2RlU2VydmljZS5nZXRMb2NhbE1vZGVzKCk7XG5cdFx0XHRsaW5lcy5wdXNoKGJhc2VNZXNzYWdlKTtcblx0XHRcdGxpbmVzLnB1c2goJycpO1xuXG5cdFx0XHQvLyBCdWlsdC1pbiBhZ2VudHNcblx0XHRcdGxpbmVzLnB1c2gobG9jYWxpemUoJ3Byb21wdEhlYWRlci5wcm9tcHQuYWdlbnQuYnVpbHRpbicsICcqKkJ1aWx0LWluIGFnZW50czoqKicpKTtcblx0XHRcdGZvciAoY29uc3QgYWdlbnQgb2YgYWdlbnRzLmJ1aWx0aW4pIHtcblx0XHRcdFx0bGluZXMucHVzaChgLSBcXGAke2FnZW50Lm5hbWUuZ2V0KCl9XFxgOiAke2FnZW50LmRlc2NyaXB0aW9uLmdldCgpIHx8IGFnZW50LmxhYmVsLmdldCgpfWApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBDdXN0b20gYWdlbnRzXG5cdFx0XHRpZiAoYWdlbnRzLmN1c3RvbS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdGxpbmVzLnB1c2goJycpO1xuXHRcdFx0XHRsaW5lcy5wdXNoKGxvY2FsaXplKCdwcm9tcHRIZWFkZXIucHJvbXB0LmFnZW50LmN1c3RvbScsICcqKkN1c3RvbSBhZ2VudHM6KionKSk7XG5cdFx0XHRcdGZvciAoY29uc3QgYWdlbnQgb2YgYWdlbnRzLmN1c3RvbSkge1xuXHRcdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gYWdlbnQuZGVzY3JpcHRpb24uZ2V0KCk7XG5cdFx0XHRcdFx0bGluZXMucHVzaChgLSBcXGAke2FnZW50Lm5hbWUuZ2V0KCl9XFxgOiAke2Rlc2NyaXB0aW9uIHx8IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIucHJvbXB0LmFnZW50LmN1c3RvbURlc2MnLCAnQ3VzdG9tIGFnZW50Jyl9YCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY3JlYXRlSG92ZXIobGluZXMuam9pbignXFxuJyksIGFnZW50QXR0cmlidXRlLnJhbmdlKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SG9va3NIb3ZlcihhdHRyaWJ1dGU6IElIZWFkZXJBdHRyaWJ1dGUsIHBvc2l0aW9uOiBQb3NpdGlvbiwgYmFzZU1lc3NhZ2U6IHN0cmluZywgdGFyZ2V0OiBUYXJnZXQpOiBIb3ZlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdmFsdWUgPSBhdHRyaWJ1dGUudmFsdWU7XG5cdFx0aWYgKHZhbHVlLnR5cGUgPT09ICdtYXAnKSB7XG5cdFx0XHRjb25zdCBob29rc0J5VGFyZ2V0ID0gSE9PS1NfQllfVEFSR0VUW3RhcmdldF0gPz8gSE9PS1NfQllfVEFSR0VUW1RhcmdldC5VbmRlZmluZWRdO1xuXHRcdFx0Zm9yIChjb25zdCBwcm9wIG9mIHZhbHVlLnByb3BlcnRpZXMpIHtcblx0XHRcdFx0Ly8gSG92ZXIgb24gYSBob29rIGV2ZW50IG5hbWUga2V5IChlLmcuLCBTZXNzaW9uU3RhcnQsIFByZVRvb2xVc2UpXG5cdFx0XHRcdGlmIChwcm9wLmtleS5yYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKSkge1xuXHRcdFx0XHRcdGNvbnN0IGhvb2tUeXBlID0gaG9va3NCeVRhcmdldFtwcm9wLmtleS52YWx1ZV07XG5cdFx0XHRcdFx0aWYgKGhvb2tUeXBlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBtZXRhID0gSE9PS19NRVRBREFUQVtob29rVHlwZV07XG5cdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVIb3ZlcihgKioke21ldGEubGFiZWx9KipcXG5cXG4ke21ldGEuZGVzY3JpcHRpb259YCwgcHJvcC5rZXkucmFuZ2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBIb3ZlciBpbnNpZGUgaG9vayBjb21tYW5kIGVudHJpZXNcblx0XHRcdFx0aWYgKHByb3AudmFsdWUudHlwZSA9PT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0XHRcdGNvbnN0IGhvdmVyID0gdGhpcy5nZXRIb29rQ29tbWFuZEl0ZW1Ib3Zlcihwcm9wLnZhbHVlLCBwb3NpdGlvbik7XG5cdFx0XHRcdFx0aWYgKGhvdmVyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gaG92ZXI7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNyZWF0ZUhvdmVyKGJhc2VNZXNzYWdlLCBhdHRyaWJ1dGUucmFuZ2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlY3Vyc2l2ZWx5IHNlYXJjaGVzIGhvb2sgY29tbWFuZCBpdGVtcyBmb3IgaG92ZXIgaW5mb3JtYXRpb24uXG5cdCAqIEhhbmRsZXMgYm90aCBkaXJlY3QgY29tbWFuZCBvYmplY3RzIGFuZCBuZXN0ZWQgbWF0Y2hlciBmb3JtYXRcblx0ICogKGUuZy4sIGB7IG1hdGNoZXI6IFwiLi4uXCIsIGhvb2tzOiBbeyB0eXBlOiBjb21tYW5kLCAuLi4gfV0gfWApLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRIb29rQ29tbWFuZEl0ZW1Ib3ZlcihzZXF1ZW5jZTogSVNlcXVlbmNlVmFsdWUsIHBvc2l0aW9uOiBQb3NpdGlvbik6IEhvdmVyIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IGl0ZW0gb2Ygc2VxdWVuY2UuaXRlbXMpIHtcblx0XHRcdGlmIChpdGVtLnR5cGUgIT09ICdtYXAnIHx8ICFpdGVtLnJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gQ2hlY2sgZm9yIG5lc3RlZCBtYXRjaGVyIGZvcm1hdDogeyBob29rczogWy4uLl0gfVxuXHRcdFx0Y29uc3QgbmVzdGVkSG9va3MgPSBpdGVtLnByb3BlcnRpZXMuZmluZChwID0+IHAua2V5LnZhbHVlID09PSAnaG9va3MnKTtcblx0XHRcdGlmIChuZXN0ZWRIb29rcyAmJiBuZXN0ZWRIb29rcy52YWx1ZS50eXBlID09PSAnc2VxdWVuY2UnKSB7XG5cdFx0XHRcdGNvbnN0IGhvdmVyID0gdGhpcy5nZXRIb29rQ29tbWFuZEl0ZW1Ib3ZlcihuZXN0ZWRIb29rcy52YWx1ZSwgcG9zaXRpb24pO1xuXHRcdFx0XHRpZiAoaG92ZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gaG92ZXI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIENoZWNrIGZpZWxkcyBvZiB0aGUgY29tbWFuZCBvYmplY3QgaXRzZWxmXG5cdFx0XHRmb3IgKGNvbnN0IGZpZWxkIG9mIGl0ZW0ucHJvcGVydGllcykge1xuXHRcdFx0XHRpZiAoZmllbGQua2V5LnJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pIHx8IGZpZWxkLnZhbHVlLnJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHRcdFx0Y29uc3QgZGVzYyA9IEhPT0tfQ09NTUFORF9GSUVMRF9ERVNDUklQVElPTlNbZmllbGQua2V5LnZhbHVlXTtcblx0XHRcdFx0XHRpZiAoZGVzYykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlSG92ZXIoZGVzYywgZmllbGQua2V5LnJhbmdlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SGFuZHNPZmZIb3ZlcihhdHRyaWJ1dGU6IElIZWFkZXJBdHRyaWJ1dGUsIHBvc2l0aW9uOiBQb3NpdGlvbiwgdGFyZ2V0OiBUYXJnZXQpOiBIb3ZlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaGFuZG9mZnNCYXNlTWVzc2FnZSA9IGdldEF0dHJpYnV0ZURlZmluaXRpb24oUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5oYW5kT2ZmcywgUHJvbXB0c1R5cGUuYWdlbnQsIHRhcmdldCk/LmRlc2NyaXB0aW9uITtcblx0XHRpZiAoIWlzVlNDb2RlT3JEZWZhdWx0VGFyZ2V0KHRhcmdldCkpIHtcblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUhvdmVyKGhhbmRvZmZzQmFzZU1lc3NhZ2UgKyAnXFxuXFxuJyArIGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuYWdlbnQuaGFuZG9mZnMuZ2l0aHViQ29waWxvdCcsICdOb3RlOiBUaGlzIGF0dHJpYnV0ZSBpcyBub3QgdXNlZCBpbiBHaXRIdWIgQ29waWxvdCBvciBDbGF1ZGUgdGFyZ2V0cy4nKSwgYXR0cmlidXRlLnJhbmdlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY3JlYXRlSG92ZXIoaGFuZG9mZnNCYXNlTWVzc2FnZSwgYXR0cmlidXRlLnJhbmdlKTtcblxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsc0JBQXNCO0FBSy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNEJBQTRCLGlCQUEyQjtBQUNoRSxTQUFTLGtCQUFrQix5QkFBeUI7QUFDcEQsU0FBUyw2QkFBNkIsYUFBYSxjQUFjO0FBQ2pFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQTJDLHlCQUFtRCw4QkFBOEI7QUFDNUgsU0FBUyx3QkFBd0Isd0JBQXdCLFdBQVcseUJBQXlCLG1CQUFtQix3QkFBd0I7QUFDeEksU0FBUyxpQkFBaUIscUJBQXFCO0FBQy9DLFNBQVMsdUNBQXVDO0FB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RDtBQUVBLFlBQUksS0FBSyxNQUFNLFNBQVMsWUFBWTtBQUNuQyxnQkFBTSxRQUFRLEtBQUssd0JBQXdCLEtBQUssT0FBTyxRQUFRO0FBQy9ELGNBQUksT0FBTztBQUNWLG1CQUFPO0FBQUEsVUFDUjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU8sS0FBSyxZQUFZLGFBQWEsVUFBVSxLQUFLO0FBQUEsRUFDckQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSx3QkFBd0IsVUFBMEIsVUFBdUM7QUFDaEcsZUFBVyxRQUFRLFNBQVMsT0FBTztBQUNsQyxVQUFJLEtBQUssU0FBUyxTQUFTLENBQUMsS0FBSyxNQUFNLGlCQUFpQixRQUFRLEdBQUc7QUFDbEU7QUFBQSxNQUNEO0FBRUEsWUFBTSxjQUFjLEtBQUssV0FBVyxLQUFLLE9BQUssRUFBRSxJQUFJLFVBQVUsT0FBTztBQUNyRSxVQUFJLGVBQWUsWUFBWSxNQUFNLFNBQVMsWUFBWTtBQUN6RCxjQUFNLFFBQVEsS0FBSyx3QkFBd0IsWUFBWSxPQUFPLFFBQVE7QUFDdEUsWUFBSSxPQUFPO0FBQ1YsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUVBLGlCQUFXLFNBQVMsS0FBSyxZQUFZO0FBQ3BDLFlBQUksTUFBTSxJQUFJLE1BQU0saUJBQWlCLFFBQVEsS0FBSyxNQUFNLE1BQU0sTUFBTSxpQkFBaUIsUUFBUSxHQUFHO0FBQy9GLGdCQUFNLE9BQU8sZ0NBQWdDLE1BQU0sSUFBSSxLQUFLO0FBQzVELGNBQUksTUFBTTtBQUNULG1CQUFPLEtBQUssWUFBWSxNQUFNLE1BQU0sSUFBSSxLQUFLO0FBQUEsVUFDOUM7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsaUJBQWlCLFdBQTZCLFVBQW9CLFFBQW1DO0FBQzVHLFVBQU0sc0JBQXNCLHVCQUF1Qix1QkFBdUIsVUFBVSxZQUFZLE9BQU8sTUFBTSxHQUFHO0FBQ2hILFFBQUksQ0FBQyx3QkFBd0IsTUFBTSxHQUFHO0FBQ3JDLGFBQU8sS0FBSyxZQUFZLHNCQUFzQixTQUFTLFNBQVMsNkNBQTZDLHVFQUF1RSxHQUFHLFVBQVUsS0FBSztBQUFBLElBQ3ZNO0FBQ0EsV0FBTyxLQUFLLFlBQVkscUJBQXFCLFVBQVUsS0FBSztBQUFBLEVBRTdEO0FBQ0Q7QUF4UmEsc0JBQU47QUFBQSxFQU9KO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FWVTsiLAogICJuYW1lcyI6IFsidG9vbCJdCn0K
