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
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { CharCode } from "../../../../../../base/common/charCode.js";
import { Position } from "../../../../../../editor/common/core/position.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { CompletionItemInsertTextRule, CompletionItemKind } from "../../../../../../editor/common/languages.js";
import { ILanguageModelChatMetadata, ILanguageModelsService } from "../../languageModels.js";
import { ILanguageModelToolsService } from "../../tools/languageModelToolsService.js";
import { IChatModeService } from "../../chatModes.js";
import { getPromptsTypeForLanguageId, PromptsType, Target } from "../promptTypes.js";
import { IPromptsService } from "../service/promptsService.js";
import { Iterable } from "../../../../../../base/common/iterator.js";
import { parseCommaSeparatedList, PromptHeaderAttributes } from "../promptFileParser.js";
import { getAttributeDefinition, getTarget, getValidAttributeNames, knownClaudeTools, knownGithubCopilotTools, ClaudeHeaderAttributes } from "./promptFileAttributes.js";
import { localize } from "../../../../../../nls.js";
import { formatArrayValue, getQuotePreference } from "../utils/promptEditHelper.js";
import { HOOKS_BY_TARGET, HOOK_METADATA } from "../hookTypes.js";
import { HOOK_COMMAND_FIELD_DESCRIPTIONS } from "../hookSchema.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
let PromptHeaderAutocompletion = class {
  constructor(promptsService, languageModelsService, languageModelToolsService, chatModeService, environmentService) {
    this.promptsService = promptsService;
    this.languageModelsService = languageModelsService;
    this.languageModelToolsService = languageModelToolsService;
    this.chatModeService = chatModeService;
    this.environmentService = environmentService;
    /**
     * Debug display name for this provider.
     */
    this._debugDisplayName = "PromptHeaderAutocompletion";
    /**
     * List of trigger characters handled by this provider.
     */
    this.triggerCharacters = [":"];
  }
  /**
   * The main function of this provider that calculates
   * completion items based on the provided arguments.
   */
  async provideCompletionItems(model, position, context, token) {
    const promptType = getPromptsTypeForLanguageId(model.getLanguageId());
    if (!promptType) {
      return void 0;
    }
    if (/^\s*$/.test(model.getValue())) {
      return {
        suggestions: [{
          label: localize("promptHeaderAutocompletion.addHeader", "Add Prompt Header"),
          kind: CompletionItemKind.Snippet,
          insertText: [
            `---`,
            `description: $1`,
            `---`,
            `$0`
          ].join("\n"),
          insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
          range: model.getFullModelRange()
        }]
      };
    }
    const parsedAST = this.promptsService.getParsedPromptFile(model);
    const header = parsedAST.header;
    if (!header) {
      return void 0;
    }
    const headerRange = parsedAST.header.range;
    if (position.lineNumber < headerRange.startLineNumber || position.lineNumber >= headerRange.endLineNumber) {
      return void 0;
    }
    const lineText = model.getLineContent(position.lineNumber);
    const colonIndex = lineText.indexOf(":");
    const colonPosition = colonIndex !== -1 ? new Position(position.lineNumber, colonIndex + 1) : void 0;
    if (!colonPosition || position.isBeforeOrEqual(colonPosition)) {
      let containingAttribute = header.attributes.find(({ range }) => range.startLineNumber < position.lineNumber && position.lineNumber <= range.endLineNumber);
      if (!containingAttribute) {
        for (let i = header.attributes.length - 1; i >= 0; i--) {
          const attr = header.attributes[i];
          if (attr.range.endLineNumber < position.lineNumber && attr.value.type === "map") {
            const nextAttr = header.attributes[i + 1];
            const nextStartLine = nextAttr ? nextAttr.range.startLineNumber : headerRange.endLineNumber;
            if (position.lineNumber < nextStartLine) {
              containingAttribute = attr;
            }
            break;
          }
        }
      }
      if (containingAttribute) {
        const attrLineText = model.getLineContent(containingAttribute.range.startLineNumber);
        const attrColonIndex = attrLineText.indexOf(":");
        if (attrColonIndex !== -1) {
          return this.provideValueCompletions(model, position, header, new Position(containingAttribute.range.startLineNumber, attrColonIndex + 1), promptType, containingAttribute);
        }
      }
      return this.provideAttributeNameCompletions(model, position, header, colonPosition, promptType);
    } else if (colonPosition && colonPosition.isBefore(position)) {
      return this.provideValueCompletions(model, position, header, colonPosition, promptType);
    }
    return void 0;
  }
  async provideAttributeNameCompletions(model, position, header, colonPosition, promptType) {
    const suggestions = [];
    const target = getTarget(promptType, header);
    const attributesToPropose = new Set(getValidAttributeNames(promptType, false, target));
    for (const attr of header.attributes) {
      attributesToPropose.delete(attr.key);
    }
    const getInsertText = async (key) => {
      if (colonPosition) {
        return key;
      }
      if (key === PromptHeaderAttributes.hooks && promptType === PromptsType.agent && target !== Target.Claude) {
        const hookNames = Object.keys(HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined]);
        return `${key}:
  \${1|${hookNames.join(",")}|}:
    - type: command
      command: "$2"`;
      }
      const valueSuggestions = await this.getValueSuggestions(promptType, key, target);
      if (valueSuggestions.length > 0) {
        return `${key}: \${0:${valueSuggestions[0].name}}`;
      } else {
        return `${key}: $0`;
      }
    };
    for (const attribute of attributesToPropose) {
      const item = {
        label: attribute,
        documentation: getAttributeDefinition(attribute, promptType, target)?.description,
        kind: CompletionItemKind.Property,
        insertText: await getInsertText(attribute),
        insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
        range: new Range(position.lineNumber, 1, position.lineNumber, !colonPosition ? model.getLineMaxColumn(position.lineNumber) : colonPosition.column)
      };
      suggestions.push(item);
    }
    return { suggestions };
  }
  async provideValueCompletions(model, position, header, colonPosition, promptType, preFoundAttribute) {
    const suggestions = [];
    const posLineNumber = position.lineNumber;
    const attribute = preFoundAttribute ?? header.attributes.find(({ range }) => range.startLineNumber <= posLineNumber && posLineNumber <= range.endLineNumber);
    if (!attribute) {
      return void 0;
    }
    const target = getTarget(promptType, header);
    if (!getValidAttributeNames(promptType, true, target).includes(attribute.key)) {
      return void 0;
    }
    if (promptType === PromptsType.prompt || promptType === PromptsType.agent) {
      if (attribute.key === PromptHeaderAttributes.model) {
        if (attribute.value.type === "sequence") {
          const getValues = async () => {
            if (target === Target.Claude) {
              return knownClaudeTools;
            } else {
              return this.getModelNames(promptType === PromptsType.agent);
            }
          };
          return this.provideArrayCompletions(model, position, attribute.value, getValues);
        }
      }
      if (attribute.key === PromptHeaderAttributes.tools || attribute.key === ClaudeHeaderAttributes.disallowedTools) {
        let value = attribute.value;
        if (value.type === "scalar") {
          value = parseCommaSeparatedList(value);
        }
        if (value.type === "sequence") {
          const getValues = async () => {
            if (target === Target.GitHubCopilot || this.environmentService.isSessionsWindow) {
              return knownGithubCopilotTools;
            } else if (target === Target.Claude) {
              return knownClaudeTools;
            } else {
              return Array.from(this.languageModelToolsService.getFullReferenceNames()).map((name) => ({ name }));
            }
          };
          return this.provideArrayCompletions(model, position, value, getValues);
        }
      }
    }
    if (attribute.key === PromptHeaderAttributes.agents) {
      if (attribute.value.type === "sequence") {
        return this.provideArrayCompletions(model, position, attribute.value, async () => {
          return (await this.promptsService.getCustomAgents(CancellationToken.None)).filter((a) => a.enabled);
        });
      }
    }
    if (attribute.key === PromptHeaderAttributes.hooks) {
      if (attribute.value.type === "map") {
        return this.provideHookEventCompletions(model, position, attribute.value, target);
      }
      if (position.lineNumber !== attribute.range.startLineNumber) {
        const emptyMap = { type: "map", properties: [], range: attribute.value.range };
        return this.provideHookEventCompletions(model, position, emptyMap, target);
      }
    }
    const lineContent = model.getLineContent(attribute.range.startLineNumber);
    const whilespaceAfterColon = lineContent.substring(colonPosition.column).match(/^\s*/)?.[0].length ?? 0;
    const entries = await this.getValueSuggestions(promptType, attribute.key, target);
    for (const entry of entries) {
      const item = {
        label: entry.name,
        documentation: entry.description,
        kind: CompletionItemKind.Value,
        insertText: whilespaceAfterColon === 0 ? ` ${entry.name}` : entry.name,
        range: new Range(position.lineNumber, colonPosition.column + whilespaceAfterColon + 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber))
      };
      suggestions.push(item);
    }
    if (attribute.key === PromptHeaderAttributes.handOffs) {
      const value = [
        "",
        "  - label: Start Implementation",
        "    agent: agent",
        "    prompt: Implement the plan",
        "    send: true"
      ].join("\n");
      const item = {
        label: localize("promptHeaderAutocompletion.handoffsExample", "Handoff Example"),
        kind: CompletionItemKind.Value,
        insertText: whilespaceAfterColon === 0 ? ` ${value}` : value,
        range: new Range(position.lineNumber, colonPosition.column + whilespaceAfterColon + 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber))
      };
      suggestions.push(item);
    }
    if (attribute.key === PromptHeaderAttributes.hooks && promptType === PromptsType.agent) {
      const hookSnippet = [
        "",
        "  ${1|" + Object.keys(HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined]).join(",") + "|}:",
        "    - type: command",
        '      command: "$2"'
      ].join("\n");
      const item = {
        label: localize("promptHeaderAutocompletion.newHook", "New Hook"),
        kind: CompletionItemKind.Snippet,
        insertText: whilespaceAfterColon === 0 ? ` ${hookSnippet}` : hookSnippet,
        insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
        range: new Range(position.lineNumber, colonPosition.column + whilespaceAfterColon + 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber))
      };
      suggestions.push(item);
    }
    return { suggestions };
  }
  /**
   * Provides completions inside the `hooks:` map.
   * Determines what to suggest based on nesting depth:
   * - At hook event level: suggest event names (SessionStart, PreToolUse, etc.)
   * - Inside a command object: suggest command fields (type, command, timeout, etc.)
   */
  provideHookEventCompletions(model, position, hooksMap, target) {
    const hookEventOnLine = hooksMap.properties.find((p) => p.key.range.startLineNumber === position.lineNumber);
    if (hookEventOnLine) {
      const lineText2 = model.getLineContent(position.lineNumber);
      const colonIdx = lineText2.indexOf(":");
      if (colonIdx !== -1 && position.column > colonIdx + 1) {
        const whilespaceAfterColon = lineText2.substring(colonIdx + 1).match(/^\s*/)?.[0].length ?? 0;
        const commandSnippet = [
          "",
          "  - type: command",
          '    command: "$1"'
        ].join("\n");
        return {
          suggestions: [{
            label: localize("promptHeaderAutocompletion.newCommand", "New Command"),
            documentation: localize("promptHeaderAutocompletion.newCommand.description", "Add a new command entry to this hook."),
            kind: CompletionItemKind.Snippet,
            insertText: whilespaceAfterColon === 0 ? ` ${commandSnippet}` : commandSnippet,
            insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
            range: new Range(position.lineNumber, colonIdx + 1 + whilespaceAfterColon + 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber))
          }]
        };
      }
    }
    const commandFieldCompletions = this.provideHookCommandFieldCompletions(model, position, hooksMap, target);
    if (commandFieldCompletions) {
      return commandFieldCompletions;
    }
    const suggestions = [];
    const hooksByTarget = HOOKS_BY_TARGET[target] ?? HOOKS_BY_TARGET[Target.Undefined];
    const lineText = model.getLineContent(position.lineNumber);
    const firstNonWhitespace = lineText.search(/\S/);
    const isEmptyLine = firstNonWhitespace === -1;
    const rangeStartColumn = isEmptyLine ? position.column : firstNonWhitespace + 1;
    const existingKeys = new Set(
      hooksMap.properties.filter((p) => p.key.range.startLineNumber !== position.lineNumber).map((p) => p.key.value)
    );
    const expectedIndent = hooksMap.properties.length > 0 ? hooksMap.properties[0].key.range.startColumn - 1 : -1;
    if (expectedIndent >= 0) {
      const scanEnd = model.getLineCount();
      for (let lineNum = hooksMap.range.endLineNumber + 1; lineNum <= scanEnd; lineNum++) {
        if (lineNum === position.lineNumber) {
          continue;
        }
        const lt = model.getLineContent(lineNum);
        const lineIndent = lt.search(/\S/);
        if (lineIndent === -1) {
          continue;
        }
        if (lineIndent < expectedIndent) {
          break;
        }
        if (lineIndent === expectedIndent) {
          const match = lt.match(/^\s+(\S+)\s*:/);
          if (match) {
            existingKeys.add(match[1]);
          }
        }
      }
    }
    const lineHasColon = lineText.indexOf(":") !== -1;
    for (const [hookName, hookType] of Object.entries(hooksByTarget)) {
      if (existingKeys.has(hookName)) {
        continue;
      }
      const meta = HOOK_METADATA[hookType];
      let insertText;
      if (isEmptyLine) {
        insertText = [
          `${hookName}:`,
          `  - type: command`,
          `    command: "$1"`
        ].join("\n");
      } else if (lineHasColon) {
        insertText = `${hookName}:`;
      } else {
        insertText = hookName;
      }
      suggestions.push({
        label: hookName,
        documentation: meta?.description,
        kind: CompletionItemKind.Property,
        insertText,
        insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
        range: new Range(position.lineNumber, rangeStartColumn, position.lineNumber, model.getLineMaxColumn(position.lineNumber))
      });
    }
    return { suggestions };
  }
  /**
   * Provides completions for hook command fields (type, command, windows, etc.)
   * when the cursor is inside a command object within the hooks map.
   * Detects nesting by checking if the position falls within a sequence item
   * of a hook event's value.
   */
  provideHookCommandFieldCompletions(model, position, hooksMap, target) {
    const containingCommandMap = this.findContainingCommandMap(model, position, hooksMap);
    if (!containingCommandMap) {
      return void 0;
    }
    const isCopilotCli = target === Target.GitHubCopilot;
    const validFields = isCopilotCli ? ["type", "bash", "powershell", "cwd", "env", "timeoutSec"] : ["type", "command", "windows", "linux", "osx", "bash", "powershell", "cwd", "env", "timeout"];
    const existingFields = new Set(
      containingCommandMap.properties.filter((p) => p.key.range.startLineNumber !== position.lineNumber).map((p) => p.key.value)
    );
    const lineText = model.getLineContent(position.lineNumber);
    const firstNonWhitespace = lineText.search(/\S/);
    const isEmptyLine = firstNonWhitespace === -1;
    const dashPrefixMatch = lineText.match(/^(\s*-\s+)/);
    const fieldStart = dashPrefixMatch ? dashPrefixMatch[1].length : firstNonWhitespace;
    const rangeStartColumn = isEmptyLine ? position.column : fieldStart + 1;
    const colonIndex = lineText.indexOf(":");
    const suggestions = [];
    for (const fieldName of validFields) {
      if (existingFields.has(fieldName)) {
        continue;
      }
      const desc = HOOK_COMMAND_FIELD_DESCRIPTIONS[fieldName];
      const insertText = colonIndex !== -1 ? fieldName : `${fieldName}: $0`;
      suggestions.push({
        label: fieldName,
        documentation: desc,
        kind: CompletionItemKind.Property,
        insertText,
        insertTextRules: CompletionItemInsertTextRule.InsertAsSnippet,
        range: new Range(position.lineNumber, rangeStartColumn, position.lineNumber, colonIndex !== -1 ? colonIndex + 1 : model.getLineMaxColumn(position.lineNumber))
      });
    }
    return suggestions.length > 0 ? { suggestions } : void 0;
  }
  /**
   * Walks the hooks map AST to find the command map object containing the position.
   * Handles both direct command objects and nested matcher format.
   * Also handles trailing lines after the last parsed property of a command map.
   */
  findContainingCommandMap(model, position, hooksMap) {
    for (let i = 0; i < hooksMap.properties.length; i++) {
      const prop = hooksMap.properties[i];
      if (prop.value.type !== "sequence") {
        continue;
      }
      const seqRange = prop.value.range;
      const nextProp = hooksMap.properties[i + 1];
      const isInSeq = seqRange.containsPosition(position);
      const isTrailingSeq = !isInSeq && seqRange.endLineNumber < position.lineNumber && (!nextProp || nextProp.key.range.startLineNumber > position.lineNumber);
      if (isInSeq || isTrailingSeq) {
        if (isTrailingSeq) {
          const lineText = model.getLineContent(position.lineNumber);
          const firstNonWs = lineText.search(/\S/);
          const effectiveIndent = firstNonWs === -1 ? position.column - 1 : firstNonWs;
          const hookKeyIndent = prop.key.range.startColumn - 1;
          if (effectiveIndent <= hookKeyIndent) {
            continue;
          }
        }
        const result = this.findCommandMapInSequence(position, prop.value);
        if (result) {
          return result;
        }
      }
    }
    return void 0;
  }
  findCommandMapInSequence(position, sequence) {
    for (let i = 0; i < sequence.items.length; i++) {
      const item = sequence.items[i];
      if (item.type !== "map") {
        if (item.type === "scalar" && item.range.startLineNumber === position.lineNumber) {
          return { type: "map", properties: [], range: item.range };
        }
        continue;
      }
      const isInRange = item.range.containsPosition(position);
      const isTrailing = !isInRange && item.range.endLineNumber < position.lineNumber && (i + 1 >= sequence.items.length || sequence.items[i + 1].range.startLineNumber > position.lineNumber);
      if (!isInRange && !isTrailing) {
        continue;
      }
      const nestedHooks = item.properties.find((p) => p.key.value === "hooks");
      if (nestedHooks?.value.type === "sequence") {
        const result = this.findCommandMapInSequence(position, nestedHooks.value);
        if (result) {
          return result;
        }
      }
      return item;
    }
    return void 0;
  }
  async getValueSuggestions(promptType, attribute, target) {
    const attributeDesc = getAttributeDefinition(attribute, promptType, target);
    if (attributeDesc?.enums) {
      return attributeDesc.enums;
    }
    if (attributeDesc?.defaults) {
      return attributeDesc.defaults.map((value) => ({ name: value }));
    }
    switch (attribute) {
      case PromptHeaderAttributes.agent:
      case PromptHeaderAttributes.mode:
        if (promptType === PromptsType.prompt) {
          const agents = await this.chatModeService.getLocalModes();
          const suggestions = [];
          for (const agent of Iterable.concat(agents.builtin, agents.custom)) {
            suggestions.push({ name: agent.name.get(), description: agent.label.get() });
          }
          return suggestions;
        }
        break;
      case PromptHeaderAttributes.model:
        if (promptType === PromptsType.prompt || promptType === PromptsType.agent) {
          return this.getModelNames(promptType === PromptsType.agent);
        }
        break;
    }
    return [];
  }
  getModelNames(agentModeOnly) {
    const result = [];
    for (const model of this.languageModelsService.getLanguageModelIds()) {
      const metadata = this.languageModelsService.lookupLanguageModel(model);
      if (metadata && metadata.isUserSelectable !== false && !metadata.targetChatSessionType) {
        if (!agentModeOnly || ILanguageModelChatMetadata.suitableForAgentMode(metadata)) {
          result.push({
            name: ILanguageModelChatMetadata.asQualifiedName(metadata),
            description: metadata.tooltip
          });
        }
      }
    }
    return result;
  }
  async provideArrayCompletions(model, position, arrayValue, getValues) {
    const getSuggestions = async (toolRange, currentItem) => {
      const suggestions = [];
      const entries = await getValues();
      const quotePreference = getQuotePreference(arrayValue, model);
      const existingValues = new Set(arrayValue.items.filter((item) => item !== currentItem).filter((item) => item.type === "scalar").map((item) => item.value));
      for (const entry of entries) {
        const entryName = entry.name;
        if (existingValues.has(entryName)) {
          continue;
        }
        let insertText;
        if (!toolRange.isEmpty()) {
          const firstChar = model.getValueInRange(toolRange).charCodeAt(0);
          insertText = firstChar === CharCode.SingleQuote ? `'${entryName}'` : firstChar === CharCode.DoubleQuote ? `"${entryName}"` : entryName;
        } else {
          insertText = formatArrayValue(entryName, quotePreference);
        }
        suggestions.push({
          label: entryName,
          documentation: entry.description,
          kind: CompletionItemKind.Value,
          filterText: insertText,
          insertText,
          range: toolRange
        });
      }
      return { suggestions };
    };
    for (const item of arrayValue.items) {
      if (item.range.containsPosition(position)) {
        return await getSuggestions(item.range, item);
      }
    }
    const prefix = model.getValueInRange(new Range(position.lineNumber, 1, position.lineNumber, position.column));
    if (prefix.match(/[:,[]\s*$/)) {
      return await getSuggestions(new Range(position.lineNumber, position.column, position.lineNumber, position.column));
    }
    return void 0;
  }
};
PromptHeaderAutocompletion = __decorateClass([
  __decorateParam(0, IPromptsService),
  __decorateParam(1, ILanguageModelsService),
  __decorateParam(2, ILanguageModelToolsService),
  __decorateParam(3, IChatModeService),
  __decorateParam(4, IWorkbenchEnvironmentService)
], PromptHeaderAutocompletion);
export {
  PromptHeaderAutocompletion
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRIZWFkZXJBdXRvY29tcGxldGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENoYXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2hhckNvZGUuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkNvbnRleHQsIENvbXBsZXRpb25JdGVtLCBDb21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlLCBDb21wbGV0aW9uSXRlbUtpbmQsIENvbXBsZXRpb25JdGVtUHJvdmlkZXIsIENvbXBsZXRpb25MaXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uLy4uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBnZXRQcm9tcHRzVHlwZUZvckxhbmd1YWdlSWQsIFByb21wdHNUeXBlLCBUYXJnZXQgfSBmcm9tICcuLi9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgSU1hcFZhbHVlLCBJU2VxdWVuY2VWYWx1ZSwgSVZhbHVlLCBJSGVhZGVyQXR0cmlidXRlLCBwYXJzZUNvbW1hU2VwYXJhdGVkTGlzdCwgUHJvbXB0SGVhZGVyLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzIH0gZnJvbSAnLi4vcHJvbXB0RmlsZVBhcnNlci5qcyc7XG5pbXBvcnQgeyBnZXRBdHRyaWJ1dGVEZWZpbml0aW9uLCBnZXRUYXJnZXQsIGdldFZhbGlkQXR0cmlidXRlTmFtZXMsIGtub3duQ2xhdWRlVG9vbHMsIGtub3duR2l0aHViQ29waWxvdFRvb2xzLCBJVmFsdWVFbnRyeSwgQ2xhdWRlSGVhZGVyQXR0cmlidXRlcywgfSBmcm9tICcuL3Byb21wdEZpbGVBdHRyaWJ1dGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGZvcm1hdEFycmF5VmFsdWUsIGdldFF1b3RlUHJlZmVyZW5jZSB9IGZyb20gJy4uL3V0aWxzL3Byb21wdEVkaXRIZWxwZXIuanMnO1xuaW1wb3J0IHsgSE9PS1NfQllfVEFSR0VULCBIT09LX01FVEFEQVRBIH0gZnJvbSAnLi4vaG9va1R5cGVzLmpzJztcbmltcG9ydCB7IEhPT0tfQ09NTUFORF9GSUVMRF9ERVNDUklQVElPTlMgfSBmcm9tICcuLi9ob29rU2NoZW1hLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIFByb21wdEhlYWRlckF1dG9jb21wbGV0aW9uIGltcGxlbWVudHMgQ29tcGxldGlvbkl0ZW1Qcm92aWRlciB7XG5cdC8qKlxuXHQgKiBEZWJ1ZyBkaXNwbGF5IG5hbWUgZm9yIHRoaXMgcHJvdmlkZXIuXG5cdCAqL1xuXHRwdWJsaWMgcmVhZG9ubHkgX2RlYnVnRGlzcGxheU5hbWU6IHN0cmluZyA9ICdQcm9tcHRIZWFkZXJBdXRvY29tcGxldGlvbic7XG5cblx0LyoqXG5cdCAqIExpc3Qgb2YgdHJpZ2dlciBjaGFyYWN0ZXJzIGhhbmRsZWQgYnkgdGhpcyBwcm92aWRlci5cblx0ICovXG5cdHB1YmxpYyByZWFkb25seSB0cmlnZ2VyQ2hhcmFjdGVycyA9IFsnOiddO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvbXB0c1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLFxuXHRcdEBJQ2hhdE1vZGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdE1vZGVTZXJ2aWNlOiBJQ2hhdE1vZGVTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbWFpbiBmdW5jdGlvbiBvZiB0aGlzIHByb3ZpZGVyIHRoYXQgY2FsY3VsYXRlc1xuXHQgKiBjb21wbGV0aW9uIGl0ZW1zIGJhc2VkIG9uIHRoZSBwcm92aWRlZCBhcmd1bWVudHMuXG5cdCAqL1xuXHRwdWJsaWMgYXN5bmMgcHJvdmlkZUNvbXBsZXRpb25JdGVtcyhcblx0XHRtb2RlbDogSVRleHRNb2RlbCxcblx0XHRwb3NpdGlvbjogUG9zaXRpb24sXG5cdFx0Y29udGV4dDogQ29tcGxldGlvbkNvbnRleHQsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHQpOiBQcm9taXNlPENvbXBsZXRpb25MaXN0IHwgdW5kZWZpbmVkPiB7XG5cblx0XHRjb25zdCBwcm9tcHRUeXBlID0gZ2V0UHJvbXB0c1R5cGVGb3JMYW5ndWFnZUlkKG1vZGVsLmdldExhbmd1YWdlSWQoKSk7XG5cdFx0aWYgKCFwcm9tcHRUeXBlKSB7XG5cdFx0XHQvLyBpZiB0aGUgbW9kZWwgaXMgbm90IGEgcHJvbXB0LCB3ZSBkb24ndCBwcm92aWRlIGFueSBjb21wbGV0aW9uc1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoL15cXHMqJC8udGVzdChtb2RlbC5nZXRWYWx1ZSgpKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c3VnZ2VzdGlvbnM6IFt7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwcm9tcHRIZWFkZXJBdXRvY29tcGxldGlvbi5hZGRIZWFkZXInLCBcIkFkZCBQcm9tcHQgSGVhZGVyXCIpLFxuXHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5TbmlwcGV0LFxuXHRcdFx0XHRcdGluc2VydFRleHQ6IFtcblx0XHRcdFx0XHRcdGAtLS1gLFxuXHRcdFx0XHRcdFx0YGRlc2NyaXB0aW9uOiAkMWAsXG5cdFx0XHRcdFx0XHRgLS0tYCxcblx0XHRcdFx0XHRcdGAkMGBcblx0XHRcdFx0XHRdLmpvaW4oJ1xcbicpLFxuXHRcdFx0XHRcdGluc2VydFRleHRSdWxlczogQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZS5JbnNlcnRBc1NuaXBwZXQsXG5cdFx0XHRcdFx0cmFuZ2U6IG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCksXG5cdFx0XHRcdH1dXG5cdFx0XHR9O1xuXHRcdH1cblxuXG5cdFx0Y29uc3QgcGFyc2VkQVNUID0gdGhpcy5wcm9tcHRzU2VydmljZS5nZXRQYXJzZWRQcm9tcHRGaWxlKG1vZGVsKTtcblx0XHRjb25zdCBoZWFkZXIgPSBwYXJzZWRBU1QuaGVhZGVyO1xuXHRcdGlmICghaGVhZGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlclJhbmdlID0gcGFyc2VkQVNULmhlYWRlci5yYW5nZTtcblx0XHRpZiAocG9zaXRpb24ubGluZU51bWJlciA8IGhlYWRlclJhbmdlLnN0YXJ0TGluZU51bWJlciB8fCBwb3NpdGlvbi5saW5lTnVtYmVyID49IGhlYWRlclJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdC8vIGlmIHRoZSBwb3NpdGlvbiBpcyBub3QgaW5zaWRlIHRoZSBoZWFkZXIsIHdlIGRvbid0IHByb3ZpZGUgYW55IGNvbXBsZXRpb25zXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0Y29uc3QgY29sb25JbmRleCA9IGxpbmVUZXh0LmluZGV4T2YoJzonKTtcblx0XHRjb25zdCBjb2xvblBvc2l0aW9uID0gY29sb25JbmRleCAhPT0gLTEgPyBuZXcgUG9zaXRpb24ocG9zaXRpb24ubGluZU51bWJlciwgY29sb25JbmRleCArIDEpIDogdW5kZWZpbmVkO1xuXG5cdFx0aWYgKCFjb2xvblBvc2l0aW9uIHx8IHBvc2l0aW9uLmlzQmVmb3JlT3JFcXVhbChjb2xvblBvc2l0aW9uKSkge1xuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIHBvc2l0aW9uIGlzIGluc2lkZSBhIG11bHRpLWxpbmUgYXR0cmlidXRlIChlLmcuLCBob29rcyBtYXApLlxuXHRcdFx0Ly8gSW4gdGhhdCBjYXNlLCBwcm92aWRlIHZhbHVlIGNvbXBsZXRpb25zIGZvciB0aGF0IGF0dHJpYnV0ZSBpbnN0ZWFkIG9mIGF0dHJpYnV0ZSBuYW1lIGNvbXBsZXRpb25zLlxuXHRcdFx0bGV0IGNvbnRhaW5pbmdBdHRyaWJ1dGUgPSBoZWFkZXIuYXR0cmlidXRlcy5maW5kKCh7IHJhbmdlIH0pID0+XG5cdFx0XHRcdHJhbmdlLnN0YXJ0TGluZU51bWJlciA8IHBvc2l0aW9uLmxpbmVOdW1iZXIgJiYgcG9zaXRpb24ubGluZU51bWJlciA8PSByYW5nZS5lbmRMaW5lTnVtYmVyKTtcblx0XHRcdGlmICghY29udGFpbmluZ0F0dHJpYnV0ZSkge1xuXHRcdFx0XHQvLyBIYW5kbGUgdHJhaWxpbmcgZW1wdHkgbGluZXMgYWZ0ZXIgYSBtYXAtdmFsdWVkIGF0dHJpYnV0ZTpcblx0XHRcdFx0Ly8gVGhlIFlBTUwgcGFyc2VyJ3MgcmFuZ2UgZW5kcyBhdCB0aGUgbGFzdCBwYXJzZWQgY2hpbGQsIGJ1dCBsb2dpY2FsbHlcblx0XHRcdFx0Ly8gYW4gZW1wdHkgbGluZSBiZWZvcmUgdGhlIG5leHQgYXR0cmlidXRlIHN0aWxsIGJlbG9uZ3MgdG8gdGhlIG1hcC5cblx0XHRcdFx0Zm9yIChsZXQgaSA9IGhlYWRlci5hdHRyaWJ1dGVzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRcdFx0Y29uc3QgYXR0ciA9IGhlYWRlci5hdHRyaWJ1dGVzW2ldO1xuXHRcdFx0XHRcdGlmIChhdHRyLnJhbmdlLmVuZExpbmVOdW1iZXIgPCBwb3NpdGlvbi5saW5lTnVtYmVyICYmIGF0dHIudmFsdWUudHlwZSA9PT0gJ21hcCcpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG5leHRBdHRyID0gaGVhZGVyLmF0dHJpYnV0ZXNbaSArIDFdO1xuXHRcdFx0XHRcdFx0Y29uc3QgbmV4dFN0YXJ0TGluZSA9IG5leHRBdHRyID8gbmV4dEF0dHIucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIDogaGVhZGVyUmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHRcdFx0XHRcdGlmIChwb3NpdGlvbi5saW5lTnVtYmVyIDwgbmV4dFN0YXJ0TGluZSkge1xuXHRcdFx0XHRcdFx0XHRjb250YWluaW5nQXR0cmlidXRlID0gYXR0cjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGNvbnRhaW5pbmdBdHRyaWJ1dGUpIHtcblx0XHRcdFx0Y29uc3QgYXR0ckxpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoY29udGFpbmluZ0F0dHJpYnV0ZS5yYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdFx0XHRjb25zdCBhdHRyQ29sb25JbmRleCA9IGF0dHJMaW5lVGV4dC5pbmRleE9mKCc6Jyk7XG5cdFx0XHRcdGlmIChhdHRyQ29sb25JbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5wcm92aWRlVmFsdWVDb21wbGV0aW9ucyhtb2RlbCwgcG9zaXRpb24sIGhlYWRlciwgbmV3IFBvc2l0aW9uKGNvbnRhaW5pbmdBdHRyaWJ1dGUucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBhdHRyQ29sb25JbmRleCArIDEpLCBwcm9tcHRUeXBlLCBjb250YWluaW5nQXR0cmlidXRlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMucHJvdmlkZUF0dHJpYnV0ZU5hbWVDb21wbGV0aW9ucyhtb2RlbCwgcG9zaXRpb24sIGhlYWRlciwgY29sb25Qb3NpdGlvbiwgcHJvbXB0VHlwZSk7XG5cdFx0fSBlbHNlIGlmIChjb2xvblBvc2l0aW9uICYmIGNvbG9uUG9zaXRpb24uaXNCZWZvcmUocG9zaXRpb24pKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wcm92aWRlVmFsdWVDb21wbGV0aW9ucyhtb2RlbCwgcG9zaXRpb24sIGhlYWRlciwgY29sb25Qb3NpdGlvbiwgcHJvbXB0VHlwZSk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cHJpdmF0ZSBhc3luYyBwcm92aWRlQXR0cmlidXRlTmFtZUNvbXBsZXRpb25zKFxuXHRcdG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdHBvc2l0aW9uOiBQb3NpdGlvbixcblx0XHRoZWFkZXI6IFByb21wdEhlYWRlcixcblx0XHRjb2xvblBvc2l0aW9uOiBQb3NpdGlvbiB8IHVuZGVmaW5lZCxcblx0XHRwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSxcblx0KTogUHJvbWlzZTxDb21wbGV0aW9uTGlzdCB8IHVuZGVmaW5lZD4ge1xuXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbnM6IENvbXBsZXRpb25JdGVtW10gPSBbXTtcblxuXHRcdGNvbnN0IHRhcmdldCA9IGdldFRhcmdldChwcm9tcHRUeXBlLCBoZWFkZXIpO1xuXHRcdGNvbnN0IGF0dHJpYnV0ZXNUb1Byb3Bvc2UgPSBuZXcgU2V0KGdldFZhbGlkQXR0cmlidXRlTmFtZXMocHJvbXB0VHlwZSwgZmFsc2UsIHRhcmdldCkpO1xuXHRcdGZvciAoY29uc3QgYXR0ciBvZiBoZWFkZXIuYXR0cmlidXRlcykge1xuXHRcdFx0YXR0cmlidXRlc1RvUHJvcG9zZS5kZWxldGUoYXR0ci5rZXkpO1xuXHRcdH1cblx0XHRjb25zdCBnZXRJbnNlcnRUZXh0ID0gYXN5bmMgKGtleTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+ID0+IHtcblx0XHRcdGlmIChjb2xvblBvc2l0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBrZXk7XG5cdFx0XHR9XG5cdFx0XHQvLyBGb3IgbWFwLXZhbHVlZCBhdHRyaWJ1dGVzLCBpbnNlcnQgYSBzbmlwcGV0IHdpdGggdGhlIG5lc3RlZCBzdHJ1Y3R1cmVcblx0XHRcdGlmIChrZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaG9va3MgJiYgcHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQgJiYgdGFyZ2V0ICE9PSBUYXJnZXQuQ2xhdWRlKSB7XG5cdFx0XHRcdGNvbnN0IGhvb2tOYW1lcyA9IE9iamVjdC5rZXlzKEhPT0tTX0JZX1RBUkdFVFt0YXJnZXRdID8/IEhPT0tTX0JZX1RBUkdFVFtUYXJnZXQuVW5kZWZpbmVkXSk7XG5cdFx0XHRcdHJldHVybiBgJHtrZXl9OlxcbiAgXFwkezF8JHtob29rTmFtZXMuam9pbignLCcpfXx9OlxcbiAgICAtIHR5cGU6IGNvbW1hbmRcXG4gICAgICBjb21tYW5kOiBcIiQyXCJgO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdmFsdWVTdWdnZXN0aW9ucyA9IGF3YWl0IHRoaXMuZ2V0VmFsdWVTdWdnZXN0aW9ucyhwcm9tcHRUeXBlLCBrZXksIHRhcmdldCk7XG5cdFx0XHRpZiAodmFsdWVTdWdnZXN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHJldHVybiBgJHtrZXl9OiBcXCR7MDoke3ZhbHVlU3VnZ2VzdGlvbnNbMF0ubmFtZX19YDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBgJHtrZXl9OiBcXCQwYDtcblx0XHRcdH1cblx0XHR9O1xuXG5cblx0XHRmb3IgKGNvbnN0IGF0dHJpYnV0ZSBvZiBhdHRyaWJ1dGVzVG9Qcm9wb3NlKSB7XG5cdFx0XHRjb25zdCBpdGVtOiBDb21wbGV0aW9uSXRlbSA9IHtcblx0XHRcdFx0bGFiZWw6IGF0dHJpYnV0ZSxcblx0XHRcdFx0ZG9jdW1lbnRhdGlvbjogZ2V0QXR0cmlidXRlRGVmaW5pdGlvbihhdHRyaWJ1dGUsIHByb21wdFR5cGUsIHRhcmdldCk/LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuUHJvcGVydHksXG5cdFx0XHRcdGluc2VydFRleHQ6IGF3YWl0IGdldEluc2VydFRleHQoYXR0cmlidXRlKSxcblx0XHRcdFx0aW5zZXJ0VGV4dFJ1bGVzOiBDb21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlLkluc2VydEFzU25pcHBldCxcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCAxLCBwb3NpdGlvbi5saW5lTnVtYmVyLCAhY29sb25Qb3NpdGlvbiA/IG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocG9zaXRpb24ubGluZU51bWJlcikgOiBjb2xvblBvc2l0aW9uLmNvbHVtbiksXG5cdFx0XHR9O1xuXHRcdFx0c3VnZ2VzdGlvbnMucHVzaChpdGVtKTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBzdWdnZXN0aW9ucyB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwcm92aWRlVmFsdWVDb21wbGV0aW9ucyhcblx0XHRtb2RlbDogSVRleHRNb2RlbCxcblx0XHRwb3NpdGlvbjogUG9zaXRpb24sXG5cdFx0aGVhZGVyOiBQcm9tcHRIZWFkZXIsXG5cdFx0Y29sb25Qb3NpdGlvbjogUG9zaXRpb24sXG5cdFx0cHJvbXB0VHlwZTogUHJvbXB0c1R5cGUsXG5cdFx0cHJlRm91bmRBdHRyaWJ1dGU/OiBJSGVhZGVyQXR0cmlidXRlLFxuXHQpOiBQcm9taXNlPENvbXBsZXRpb25MaXN0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbnM6IENvbXBsZXRpb25JdGVtW10gPSBbXTtcblx0XHRjb25zdCBwb3NMaW5lTnVtYmVyID0gcG9zaXRpb24ubGluZU51bWJlcjtcblx0XHRjb25zdCBhdHRyaWJ1dGUgPSBwcmVGb3VuZEF0dHJpYnV0ZSA/PyBoZWFkZXIuYXR0cmlidXRlcy5maW5kKCh7IHJhbmdlIH0pID0+IHJhbmdlLnN0YXJ0TGluZU51bWJlciA8PSBwb3NMaW5lTnVtYmVyICYmIHBvc0xpbmVOdW1iZXIgPD0gcmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdFx0aWYgKCFhdHRyaWJ1dGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHRhcmdldCA9IGdldFRhcmdldChwcm9tcHRUeXBlLCBoZWFkZXIpO1xuXHRcdGlmICghZ2V0VmFsaWRBdHRyaWJ1dGVOYW1lcyhwcm9tcHRUeXBlLCB0cnVlLCB0YXJnZXQpLmluY2x1ZGVzKGF0dHJpYnV0ZS5rZXkpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5wcm9tcHQgfHwgcHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQpIHtcblx0XHRcdGlmIChhdHRyaWJ1dGUua2V5ID09PSBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm1vZGVsKSB7XG5cdFx0XHRcdGlmIChhdHRyaWJ1dGUudmFsdWUudHlwZSA9PT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0XHRcdC8vIGlmIHRoZSBwb3NpdGlvbiBpcyBpbnNpZGUgdGhlIHRvb2xzIG1ldGFkYXRhLCB3ZSBwcm92aWRlIHRvb2wgbmFtZSBjb21wbGV0aW9uc1xuXHRcdFx0XHRcdGNvbnN0IGdldFZhbHVlcyA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdGlmICh0YXJnZXQgPT09IFRhcmdldC5DbGF1ZGUpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGtub3duQ2xhdWRlVG9vbHM7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRNb2RlbE5hbWVzKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnByb3ZpZGVBcnJheUNvbXBsZXRpb25zKG1vZGVsLCBwb3NpdGlvbiwgYXR0cmlidXRlLnZhbHVlLCBnZXRWYWx1ZXMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoYXR0cmlidXRlLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy50b29scyB8fCBhdHRyaWJ1dGUua2V5ID09PSBDbGF1ZGVIZWFkZXJBdHRyaWJ1dGVzLmRpc2FsbG93ZWRUb29scykge1xuXHRcdFx0XHRsZXQgdmFsdWUgPSBhdHRyaWJ1dGUudmFsdWU7XG5cdFx0XHRcdGlmICh2YWx1ZS50eXBlID09PSAnc2NhbGFyJykge1xuXHRcdFx0XHRcdHZhbHVlID0gcGFyc2VDb21tYVNlcGFyYXRlZExpc3QodmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh2YWx1ZS50eXBlID09PSAnc2VxdWVuY2UnKSB7XG5cdFx0XHRcdFx0Ly8gaWYgdGhlIHBvc2l0aW9uIGlzIGluc2lkZSB0aGUgdG9vbHMgbWV0YWRhdGEsIHdlIHByb3ZpZGUgdG9vbCBuYW1lIGNvbXBsZXRpb25zXG5cdFx0XHRcdFx0Y29uc3QgZ2V0VmFsdWVzID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHRhcmdldCA9PT0gVGFyZ2V0LkdpdEh1YkNvcGlsb3QgfHwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdFx0XHRcdFx0XHQvLyBmb3IgR2l0SHViIENvcGlsb3QgdGFyZ2V0cyBhbmQgdGhlIFNlc3Npb25zIFdpbmRvdywgd2Ugb25seSBzdWdnZXN0IHRoZSBrbm93biBzZXQgb2YgdG9vbHMgdGhhdCBhcmUgc3VwcG9ydGVkIGJ5IEdpdEh1YiBDb3BpbG90LCBpbnN0ZWFkIG9mIGFsbCB0b29scyB0aGF0IHRoZSB1c2VyIGhhcyBkZWZpbmVkLCBiZWNhdXNlIG1hbnkgdG9vbHMgd29uJ3Qgd29yayBpbiB0aGVzZSBjb250ZXh0cyBhbmQgaXQgd291bGQgYmUgZnJ1c3RyYXRpbmcgZm9yIHVzZXJzIHRvIHNlbGVjdCBhIHRvb2wgdGhhdCBkb2Vzbid0IHdvcmtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGtub3duR2l0aHViQ29waWxvdFRvb2xzO1xuXHRcdFx0XHRcdFx0fSBlbHNlIGlmICh0YXJnZXQgPT09IFRhcmdldC5DbGF1ZGUpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGtub3duQ2xhdWRlVG9vbHM7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLmxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuZ2V0RnVsbFJlZmVyZW5jZU5hbWVzKCkpLm1hcChuYW1lID0+ICh7IG5hbWUgfSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMucHJvdmlkZUFycmF5Q29tcGxldGlvbnMobW9kZWwsIHBvc2l0aW9uLCB2YWx1ZSwgZ2V0VmFsdWVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoYXR0cmlidXRlLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hZ2VudHMpIHtcblx0XHRcdGlmIChhdHRyaWJ1dGUudmFsdWUudHlwZSA9PT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5wcm92aWRlQXJyYXlDb21wbGV0aW9ucyhtb2RlbCwgcG9zaXRpb24sIGF0dHJpYnV0ZS52YWx1ZSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiAoYXdhaXQgdGhpcy5wcm9tcHRzU2VydmljZS5nZXRDdXN0b21BZ2VudHMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLmZpbHRlcihhID0+IGEuZW5hYmxlZCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoYXR0cmlidXRlLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5ob29rcykge1xuXHRcdFx0aWYgKGF0dHJpYnV0ZS52YWx1ZS50eXBlID09PSAnbWFwJykge1xuXHRcdFx0XHQvLyBJbnNpZGUgdGhlIGhvb2tzIG1hcCBcdTIwMTQgc3VnZ2VzdCBob29rIGV2ZW50IHR5cGUgbmFtZXMgYXMgc3ViLWtleXNcblx0XHRcdFx0cmV0dXJuIHRoaXMucHJvdmlkZUhvb2tFdmVudENvbXBsZXRpb25zKG1vZGVsLCBwb3NpdGlvbiwgYXR0cmlidXRlLnZhbHVlLCB0YXJnZXQpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gV2hlbiBob29rcyB2YWx1ZSBpcyBub3QgeWV0IGEgbWFwIChlLmcuLCB1c2VyIGlzIG1pZC1lZGl0IG9uIGEgbmVzdGVkIGxpbmUpLFxuXHRcdFx0Ly8gc3RpbGwgcHJvdmlkZSBob29rIGV2ZW50IGNvbXBsZXRpb25zIHdpdGggbm8gZXhpc3Rpbmcga2V5cy5cblx0XHRcdGlmIChwb3NpdGlvbi5saW5lTnVtYmVyICE9PSBhdHRyaWJ1dGUucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdGNvbnN0IGVtcHR5TWFwOiBJTWFwVmFsdWUgPSB7IHR5cGU6ICdtYXAnLCBwcm9wZXJ0aWVzOiBbXSwgcmFuZ2U6IGF0dHJpYnV0ZS52YWx1ZS5yYW5nZSB9O1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5wcm92aWRlSG9va0V2ZW50Q29tcGxldGlvbnMobW9kZWwsIHBvc2l0aW9uLCBlbXB0eU1hcCwgdGFyZ2V0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChhdHRyaWJ1dGUucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRjb25zdCB3aGlsZXNwYWNlQWZ0ZXJDb2xvbiA9IChsaW5lQ29udGVudC5zdWJzdHJpbmcoY29sb25Qb3NpdGlvbi5jb2x1bW4pLm1hdGNoKC9eXFxzKi8pPy5bMF0ubGVuZ3RoKSA/PyAwO1xuXHRcdGNvbnN0IGVudHJpZXMgPSBhd2FpdCB0aGlzLmdldFZhbHVlU3VnZ2VzdGlvbnMocHJvbXB0VHlwZSwgYXR0cmlidXRlLmtleSwgdGFyZ2V0KTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdGNvbnN0IGl0ZW06IENvbXBsZXRpb25JdGVtID0ge1xuXHRcdFx0XHRsYWJlbDogZW50cnkubmFtZSxcblx0XHRcdFx0ZG9jdW1lbnRhdGlvbjogZW50cnkuZGVzY3JpcHRpb24sXG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5WYWx1ZSxcblx0XHRcdFx0aW5zZXJ0VGV4dDogd2hpbGVzcGFjZUFmdGVyQ29sb24gPT09IDAgPyBgICR7ZW50cnkubmFtZX1gIDogZW50cnkubmFtZSxcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCBjb2xvblBvc2l0aW9uLmNvbHVtbiArIHdoaWxlc3BhY2VBZnRlckNvbG9uICsgMSwgcG9zaXRpb24ubGluZU51bWJlciwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihwb3NpdGlvbi5saW5lTnVtYmVyKSksXG5cdFx0XHR9O1xuXHRcdFx0c3VnZ2VzdGlvbnMucHVzaChpdGVtKTtcblx0XHR9XG5cdFx0aWYgKGF0dHJpYnV0ZS5rZXkgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaGFuZE9mZnMpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gW1xuXHRcdFx0XHQnJyxcblx0XHRcdFx0JyAgLSBsYWJlbDogU3RhcnQgSW1wbGVtZW50YXRpb24nLFxuXHRcdFx0XHQnICAgIGFnZW50OiBhZ2VudCcsXG5cdFx0XHRcdCcgICAgcHJvbXB0OiBJbXBsZW1lbnQgdGhlIHBsYW4nLFxuXHRcdFx0XHQnICAgIHNlbmQ6IHRydWUnXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaXRlbTogQ29tcGxldGlvbkl0ZW0gPSB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyQXV0b2NvbXBsZXRpb24uaGFuZG9mZnNFeGFtcGxlJywgXCJIYW5kb2ZmIEV4YW1wbGVcIiksXG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5WYWx1ZSxcblx0XHRcdFx0aW5zZXJ0VGV4dDogd2hpbGVzcGFjZUFmdGVyQ29sb24gPT09IDAgPyBgICR7dmFsdWV9YCA6IHZhbHVlLFxuXHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIGNvbG9uUG9zaXRpb24uY29sdW1uICsgd2hpbGVzcGFjZUFmdGVyQ29sb24gKyAxLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHBvc2l0aW9uLmxpbmVOdW1iZXIpKSxcblx0XHRcdH07XG5cdFx0XHRzdWdnZXN0aW9ucy5wdXNoKGl0ZW0pO1xuXHRcdH1cblx0XHRpZiAoYXR0cmlidXRlLmtleSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5ob29rcyAmJiBwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCkge1xuXHRcdFx0Y29uc3QgaG9va1NuaXBwZXQgPSBbXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnICAkezF8JyArIE9iamVjdC5rZXlzKEhPT0tTX0JZX1RBUkdFVFt0YXJnZXRdID8/IEhPT0tTX0JZX1RBUkdFVFtUYXJnZXQuVW5kZWZpbmVkXSkuam9pbignLCcpICsgJ3x9OicsXG5cdFx0XHRcdCcgICAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0JyAgICAgIGNvbW1hbmQ6IFwiJDJcIidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBpdGVtOiBDb21wbGV0aW9uSXRlbSA9IHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdwcm9tcHRIZWFkZXJBdXRvY29tcGxldGlvbi5uZXdIb29rJywgXCJOZXcgSG9va1wiKSxcblx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlNuaXBwZXQsXG5cdFx0XHRcdGluc2VydFRleHQ6IHdoaWxlc3BhY2VBZnRlckNvbG9uID09PSAwID8gYCAke2hvb2tTbmlwcGV0fWAgOiBob29rU25pcHBldCxcblx0XHRcdFx0aW5zZXJ0VGV4dFJ1bGVzOiBDb21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlLkluc2VydEFzU25pcHBldCxcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCBjb2xvblBvc2l0aW9uLmNvbHVtbiArIHdoaWxlc3BhY2VBZnRlckNvbG9uICsgMSwgcG9zaXRpb24ubGluZU51bWJlciwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihwb3NpdGlvbi5saW5lTnVtYmVyKSksXG5cdFx0XHR9O1xuXHRcdFx0c3VnZ2VzdGlvbnMucHVzaChpdGVtKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgc3VnZ2VzdGlvbnMgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcm92aWRlcyBjb21wbGV0aW9ucyBpbnNpZGUgdGhlIGBob29rczpgIG1hcC5cblx0ICogRGV0ZXJtaW5lcyB3aGF0IHRvIHN1Z2dlc3QgYmFzZWQgb24gbmVzdGluZyBkZXB0aDpcblx0ICogLSBBdCBob29rIGV2ZW50IGxldmVsOiBzdWdnZXN0IGV2ZW50IG5hbWVzIChTZXNzaW9uU3RhcnQsIFByZVRvb2xVc2UsIGV0Yy4pXG5cdCAqIC0gSW5zaWRlIGEgY29tbWFuZCBvYmplY3Q6IHN1Z2dlc3QgY29tbWFuZCBmaWVsZHMgKHR5cGUsIGNvbW1hbmQsIHRpbWVvdXQsIGV0Yy4pXG5cdCAqL1xuXHRwcml2YXRlIHByb3ZpZGVIb29rRXZlbnRDb21wbGV0aW9ucyhcblx0XHRtb2RlbDogSVRleHRNb2RlbCxcblx0XHRwb3NpdGlvbjogUG9zaXRpb24sXG5cdFx0aG9va3NNYXA6IElNYXBWYWx1ZSxcblx0XHR0YXJnZXQ6IFRhcmdldCxcblx0KTogQ29tcGxldGlvbkxpc3QgfCB1bmRlZmluZWQge1xuXHRcdC8vIENoZWNrIGlmIHRoZSBjdXJzb3IgaXMgb24gdGhlIHZhbHVlIHNpZGUgb2YgYW4gZXhpc3RpbmcgaG9vayBldmVudCBrZXkgKGUuZy4sIFwiU2Vzc2lvbkVuZDp8XCIpXG5cdFx0Ly8gSW4gdGhhdCBjYXNlLCBvZmZlciBhIGNvbW1hbmQgZW50cnkgc25pcHBldCBpbnN0ZWFkIG9mIGV2ZW50IG5hbWUgY29tcGxldGlvbnMuXG5cdFx0Y29uc3QgaG9va0V2ZW50T25MaW5lID0gaG9va3NNYXAucHJvcGVydGllcy5maW5kKHAgPT4gcC5rZXkucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSBwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRpZiAoaG9va0V2ZW50T25MaW5lKSB7XG5cdFx0XHRjb25zdCBsaW5lVGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdFx0Y29uc3QgY29sb25JZHggPSBsaW5lVGV4dC5pbmRleE9mKCc6Jyk7XG5cdFx0XHRpZiAoY29sb25JZHggIT09IC0xICYmIHBvc2l0aW9uLmNvbHVtbiA+IGNvbG9uSWR4ICsgMSkge1xuXHRcdFx0XHRjb25zdCB3aGlsZXNwYWNlQWZ0ZXJDb2xvbiA9IChsaW5lVGV4dC5zdWJzdHJpbmcoY29sb25JZHggKyAxKS5tYXRjaCgvXlxccyovKT8uWzBdLmxlbmd0aCkgPz8gMDtcblx0XHRcdFx0Y29uc3QgY29tbWFuZFNuaXBwZXQgPSBbXG5cdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0JyAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0XHQnICAgIGNvbW1hbmQ6IFwiJDFcIicsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IFt7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Byb21wdEhlYWRlckF1dG9jb21wbGV0aW9uLm5ld0NvbW1hbmQnLCBcIk5ldyBDb21tYW5kXCIpLFxuXHRcdFx0XHRcdFx0ZG9jdW1lbnRhdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlckF1dG9jb21wbGV0aW9uLm5ld0NvbW1hbmQuZGVzY3JpcHRpb24nLCBcIkFkZCBhIG5ldyBjb21tYW5kIGVudHJ5IHRvIHRoaXMgaG9vay5cIiksXG5cdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuU25pcHBldCxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6IHdoaWxlc3BhY2VBZnRlckNvbG9uID09PSAwID8gYCAke2NvbW1hbmRTbmlwcGV0fWAgOiBjb21tYW5kU25pcHBldCxcblx0XHRcdFx0XHRcdGluc2VydFRleHRSdWxlczogQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZS5JbnNlcnRBc1NuaXBwZXQsXG5cdFx0XHRcdFx0XHRyYW5nZTogbmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIGNvbG9uSWR4ICsgMSArIHdoaWxlc3BhY2VBZnRlckNvbG9uICsgMSwgcG9zaXRpb24ubGluZU51bWJlciwgbW9kZWwuZ2V0TGluZU1heENvbHVtbihwb3NpdGlvbi5saW5lTnVtYmVyKSksXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBUcnkgdG8gcHJvdmlkZSBjb21tYW5kIGZpZWxkIGNvbXBsZXRpb25zIGlmIGN1cnNvciBpcyBpbnNpZGUgYSBjb21tYW5kIG9iamVjdFxuXHRcdGNvbnN0IGNvbW1hbmRGaWVsZENvbXBsZXRpb25zID0gdGhpcy5wcm92aWRlSG9va0NvbW1hbmRGaWVsZENvbXBsZXRpb25zKG1vZGVsLCBwb3NpdGlvbiwgaG9va3NNYXAsIHRhcmdldCk7XG5cdFx0aWYgKGNvbW1hbmRGaWVsZENvbXBsZXRpb25zKSB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZEZpZWxkQ29tcGxldGlvbnM7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIHByb3ZpZGUgaG9vayBldmVudCBuYW1lIGNvbXBsZXRpb25zXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbnM6IENvbXBsZXRpb25JdGVtW10gPSBbXTtcblx0XHRjb25zdCBob29rc0J5VGFyZ2V0ID0gSE9PS1NfQllfVEFSR0VUW3RhcmdldF0gPz8gSE9PS1NfQllfVEFSR0VUW1RhcmdldC5VbmRlZmluZWRdO1xuXG5cdFx0Y29uc3QgbGluZVRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRjb25zdCBmaXJzdE5vbldoaXRlc3BhY2UgPSBsaW5lVGV4dC5zZWFyY2goL1xcUy8pO1xuXHRcdGNvbnN0IGlzRW1wdHlMaW5lID0gZmlyc3ROb25XaGl0ZXNwYWNlID09PSAtMTtcblx0XHQvLyBTdGFydCB0aGUgcmFuZ2UgYWZ0ZXIgbGVhZGluZyB3aGl0ZXNwYWNlIHNvIFZTIENvZGUncyBjb21wbGV0aW9uXG5cdFx0Ly8gZmlsdGVyaW5nIG1hdGNoZXMgdGhlIGhvb2sgbmFtZSBwcmVmaXggdGhlIHVzZXIgaGFzIHR5cGVkLlxuXHRcdGNvbnN0IHJhbmdlU3RhcnRDb2x1bW4gPSBpc0VtcHR5TGluZSA/IHBvc2l0aW9uLmNvbHVtbiA6IGZpcnN0Tm9uV2hpdGVzcGFjZSArIDE7XG5cblx0XHQvLyBFeGNsdWRlIGhvb2sga2V5cyBvbiB0aGUgY3VycmVudCBsaW5lIHNvIHRoZSB1c2VyIHNlZXMgYWxsIG9wdGlvbnMgd2hpbGUgZWRpdGluZyBhIGtleVxuXHRcdGNvbnN0IGV4aXN0aW5nS2V5cyA9IG5ldyBTZXQoXG5cdFx0XHRob29rc01hcC5wcm9wZXJ0aWVzXG5cdFx0XHRcdC5maWx0ZXIocCA9PiBwLmtleS5yYW5nZS5zdGFydExpbmVOdW1iZXIgIT09IHBvc2l0aW9uLmxpbmVOdW1iZXIpXG5cdFx0XHRcdC5tYXAocCA9PiBwLmtleS52YWx1ZSlcblx0XHQpO1xuXG5cdFx0Ly8gU3VwcGxlbWVudCB3aXRoIHRleHQtYmFzZWQgc2Nhbm5pbmc6IHdoZW4gaW5jb21wbGV0ZSBZQU1MIGNhdXNlcyB0aGVcblx0XHQvLyBwYXJzZXIgdG8gZHJvcCBzdWJzZXF1ZW50IGtleXMsIHNjYW4gdGhlIG1vZGVsIGZvciBsaW5lcyB0aGF0IGxvb2tcblx0XHQvLyBsaWtlIGhvb2sgZXZlbnQgZW50cmllcyAoZS5nLiwgXCIgIFVzZXJQcm9tcHRTdWJtaXQ6XCIpIGF0IHRoZSBleHBlY3RlZFxuXHRcdC8vIGluZGVudGF0aW9uLlxuXHRcdGNvbnN0IGV4cGVjdGVkSW5kZW50ID0gaG9va3NNYXAucHJvcGVydGllcy5sZW5ndGggPiAwXG5cdFx0XHQ/IGhvb2tzTWFwLnByb3BlcnRpZXNbMF0ua2V5LnJhbmdlLnN0YXJ0Q29sdW1uIC0gMVxuXHRcdFx0OiAtMTtcblx0XHRpZiAoZXhwZWN0ZWRJbmRlbnQgPj0gMCkge1xuXHRcdFx0Y29uc3Qgc2NhbkVuZCA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdFx0Zm9yIChsZXQgbGluZU51bSA9IGhvb2tzTWFwLnJhbmdlLmVuZExpbmVOdW1iZXIgKyAxOyBsaW5lTnVtIDw9IHNjYW5FbmQ7IGxpbmVOdW0rKykge1xuXHRcdFx0XHRpZiAobGluZU51bSA9PT0gcG9zaXRpb24ubGluZU51bWJlcikge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGx0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZU51bSk7XG5cdFx0XHRcdGNvbnN0IGxpbmVJbmRlbnQgPSBsdC5zZWFyY2goL1xcUy8pO1xuXHRcdFx0XHRpZiAobGluZUluZGVudCA9PT0gLTEpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobGluZUluZGVudCA8IGV4cGVjdGVkSW5kZW50KSB7XG5cdFx0XHRcdFx0YnJlYWs7IC8vIExlZnQgdGhlIGhvb2tzIG1hcCBzY29wZVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChsaW5lSW5kZW50ID09PSBleHBlY3RlZEluZGVudCkge1xuXHRcdFx0XHRcdGNvbnN0IG1hdGNoID0gbHQubWF0Y2goL15cXHMrKFxcUyspXFxzKjovKTtcblx0XHRcdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0XHRcdGV4aXN0aW5nS2V5cy5hZGQobWF0Y2hbMV0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIHdoZXRoZXIgdGhlIGN1cnJlbnQgbGluZSBhbHJlYWR5IGhhcyBhIGNvbG9uIChlZGl0aW5nIGFuIGV4aXN0aW5nIGtleSlcblx0XHRjb25zdCBsaW5lSGFzQ29sb24gPSBsaW5lVGV4dC5pbmRleE9mKCc6JykgIT09IC0xO1xuXG5cdFx0Zm9yIChjb25zdCBbaG9va05hbWUsIGhvb2tUeXBlXSBvZiBPYmplY3QuZW50cmllcyhob29rc0J5VGFyZ2V0KSkge1xuXHRcdFx0aWYgKGV4aXN0aW5nS2V5cy5oYXMoaG9va05hbWUpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWV0YSA9IEhPT0tfTUVUQURBVEFbaG9va1R5cGVdO1xuXHRcdFx0bGV0IGluc2VydFRleHQ6IHN0cmluZztcblx0XHRcdGlmIChpc0VtcHR5TGluZSkge1xuXHRcdFx0XHQvLyBPbiBlbXB0eSBsaW5lcywgaW5zZXJ0IGEgZnVsbCBob29rIHNuaXBwZXQgd2l0aCBjb21tYW5kIHBsYWNlaG9sZGVyXG5cdFx0XHRcdGluc2VydFRleHQgPSBbXG5cdFx0XHRcdFx0YCR7aG9va05hbWV9OmAsXG5cdFx0XHRcdFx0YCAgLSB0eXBlOiBjb21tYW5kYCxcblx0XHRcdFx0XHRgICAgIGNvbW1hbmQ6IFwiJDFcImAsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHR9IGVsc2UgaWYgKGxpbmVIYXNDb2xvbikge1xuXHRcdFx0XHQvLyBPbiBleGlzdGluZyBrZXkgbGluZXMsIG9ubHkgcmVwbGFjZSB0aGUga2V5IG5hbWUgdG8gcHJlc2VydmUgbmVzdGVkIGNvbnRlbnRcblx0XHRcdFx0aW5zZXJ0VGV4dCA9IGAke2hvb2tOYW1lfTpgO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gVHlwaW5nIGEgbmV3IGV2ZW50IG5hbWUgXHUyMDE0IG9taXQgdGhlIGNvbG9uIHNvIHRoZSB1c2VyIGNhblxuXHRcdFx0XHQvLyB0cmlnZ2VyIHRoZSBuZXh0IGNvbXBsZXRpb24gKGUuZy4sIE5ldyBDb21tYW5kIHNuaXBwZXQpIGJ5IHR5cGluZyAnOidcblx0XHRcdFx0aW5zZXJ0VGV4dCA9IGhvb2tOYW1lO1xuXHRcdFx0fVxuXHRcdFx0c3VnZ2VzdGlvbnMucHVzaCh7XG5cdFx0XHRcdGxhYmVsOiBob29rTmFtZSxcblx0XHRcdFx0ZG9jdW1lbnRhdGlvbjogbWV0YT8uZGVzY3JpcHRpb24sXG5cdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Qcm9wZXJ0eSxcblx0XHRcdFx0aW5zZXJ0VGV4dCxcblx0XHRcdFx0aW5zZXJ0VGV4dFJ1bGVzOiBDb21wbGV0aW9uSXRlbUluc2VydFRleHRSdWxlLkluc2VydEFzU25pcHBldCxcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCByYW5nZVN0YXJ0Q29sdW1uLCBwb3NpdGlvbi5saW5lTnVtYmVyLCBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHBvc2l0aW9uLmxpbmVOdW1iZXIpKSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHN1Z2dlc3Rpb25zIH07XG5cdH1cblxuXHQvKipcblx0ICogUHJvdmlkZXMgY29tcGxldGlvbnMgZm9yIGhvb2sgY29tbWFuZCBmaWVsZHMgKHR5cGUsIGNvbW1hbmQsIHdpbmRvd3MsIGV0Yy4pXG5cdCAqIHdoZW4gdGhlIGN1cnNvciBpcyBpbnNpZGUgYSBjb21tYW5kIG9iamVjdCB3aXRoaW4gdGhlIGhvb2tzIG1hcC5cblx0ICogRGV0ZWN0cyBuZXN0aW5nIGJ5IGNoZWNraW5nIGlmIHRoZSBwb3NpdGlvbiBmYWxscyB3aXRoaW4gYSBzZXF1ZW5jZSBpdGVtXG5cdCAqIG9mIGEgaG9vayBldmVudCdzIHZhbHVlLlxuXHQgKi9cblx0cHJpdmF0ZSBwcm92aWRlSG9va0NvbW1hbmRGaWVsZENvbXBsZXRpb25zKFxuXHRcdG1vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdHBvc2l0aW9uOiBQb3NpdGlvbixcblx0XHRob29rc01hcDogSU1hcFZhbHVlLFxuXHRcdHRhcmdldDogVGFyZ2V0LFxuXHQpOiBDb21wbGV0aW9uTGlzdCB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gRmluZCB3aGljaCBob29rIGV2ZW50J3MgY29tbWFuZCBsaXN0IHRoZSBjdXJzb3IgaXMgaW5cblx0XHRjb25zdCBjb250YWluaW5nQ29tbWFuZE1hcCA9IHRoaXMuZmluZENvbnRhaW5pbmdDb21tYW5kTWFwKG1vZGVsLCBwb3NpdGlvbiwgaG9va3NNYXApO1xuXHRcdGlmICghY29udGFpbmluZ0NvbW1hbmRNYXApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNDb3BpbG90Q2xpID0gdGFyZ2V0ID09PSBUYXJnZXQuR2l0SHViQ29waWxvdDtcblx0XHRjb25zdCB2YWxpZEZpZWxkcyA9IGlzQ29waWxvdENsaVxuXHRcdFx0PyBbJ3R5cGUnLCAnYmFzaCcsICdwb3dlcnNoZWxsJywgJ2N3ZCcsICdlbnYnLCAndGltZW91dFNlYyddXG5cdFx0XHQ6IFsndHlwZScsICdjb21tYW5kJywgJ3dpbmRvd3MnLCAnbGludXgnLCAnb3N4JywgJ2Jhc2gnLCAncG93ZXJzaGVsbCcsICdjd2QnLCAnZW52JywgJ3RpbWVvdXQnXTtcblxuXHRcdGNvbnN0IGV4aXN0aW5nRmllbGRzID0gbmV3IFNldChcblx0XHRcdGNvbnRhaW5pbmdDb21tYW5kTWFwLnByb3BlcnRpZXNcblx0XHRcdFx0LmZpbHRlcihwID0+IHAua2V5LnJhbmdlLnN0YXJ0TGluZU51bWJlciAhPT0gcG9zaXRpb24ubGluZU51bWJlcilcblx0XHRcdFx0Lm1hcChwID0+IHAua2V5LnZhbHVlKVxuXHRcdCk7XG5cblx0XHRjb25zdCBsaW5lVGV4dCA9IG1vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGZpcnN0Tm9uV2hpdGVzcGFjZSA9IGxpbmVUZXh0LnNlYXJjaCgvXFxTLyk7XG5cdFx0Y29uc3QgaXNFbXB0eUxpbmUgPSBmaXJzdE5vbldoaXRlc3BhY2UgPT09IC0xO1xuXHRcdC8vIFNraXAgcGFzdCB0aGUgWUFNTCBzZXF1ZW5jZSBpbmRpY2F0b3IgYC0gYCBzbyB0aGUgcmFuZ2Ugc3RhcnRzIGF0IHRoZVxuXHRcdC8vIGFjdHVhbCBmaWVsZCBuYW1lOyBvdGhlcndpc2UgVlMgQ29kZSdzIGNvbXBsZXRpb24gZmlsdGVyIHdvdWxkIHNlZSB0aGVcblx0XHQvLyBgLSBgIHByZWZpeCBhbmQgcmVqZWN0IHZhbGlkIGZpZWxkIG5hbWVzLlxuXHRcdGNvbnN0IGRhc2hQcmVmaXhNYXRjaCA9IGxpbmVUZXh0Lm1hdGNoKC9eKFxccyotXFxzKykvKTtcblx0XHRjb25zdCBmaWVsZFN0YXJ0ID0gZGFzaFByZWZpeE1hdGNoID8gZGFzaFByZWZpeE1hdGNoWzFdLmxlbmd0aCA6IGZpcnN0Tm9uV2hpdGVzcGFjZTtcblx0XHRjb25zdCByYW5nZVN0YXJ0Q29sdW1uID0gaXNFbXB0eUxpbmUgPyBwb3NpdGlvbi5jb2x1bW4gOiBmaWVsZFN0YXJ0ICsgMTtcblx0XHRjb25zdCBjb2xvbkluZGV4ID0gbGluZVRleHQuaW5kZXhPZignOicpO1xuXG5cdFx0Y29uc3Qgc3VnZ2VzdGlvbnM6IENvbXBsZXRpb25JdGVtW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGZpZWxkTmFtZSBvZiB2YWxpZEZpZWxkcykge1xuXHRcdFx0aWYgKGV4aXN0aW5nRmllbGRzLmhhcyhmaWVsZE5hbWUpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGVzYyA9IEhPT0tfQ09NTUFORF9GSUVMRF9ERVNDUklQVElPTlNbZmllbGROYW1lXTtcblx0XHRcdGNvbnN0IGluc2VydFRleHQgPSBjb2xvbkluZGV4ICE9PSAtMSA/IGZpZWxkTmFtZSA6IGAke2ZpZWxkTmFtZX06ICQwYDtcblx0XHRcdHN1Z2dlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogZmllbGROYW1lLFxuXHRcdFx0XHRkb2N1bWVudGF0aW9uOiBkZXNjLFxuXHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuUHJvcGVydHksXG5cdFx0XHRcdGluc2VydFRleHQsXG5cdFx0XHRcdGluc2VydFRleHRSdWxlczogQ29tcGxldGlvbkl0ZW1JbnNlcnRUZXh0UnVsZS5JbnNlcnRBc1NuaXBwZXQsXG5cdFx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UocG9zaXRpb24ubGluZU51bWJlciwgcmFuZ2VTdGFydENvbHVtbiwgcG9zaXRpb24ubGluZU51bWJlciwgY29sb25JbmRleCAhPT0gLTEgPyBjb2xvbkluZGV4ICsgMSA6IG1vZGVsLmdldExpbmVNYXhDb2x1bW4ocG9zaXRpb24ubGluZU51bWJlcikpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1Z2dlc3Rpb25zLmxlbmd0aCA+IDAgPyB7IHN1Z2dlc3Rpb25zIH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogV2Fsa3MgdGhlIGhvb2tzIG1hcCBBU1QgdG8gZmluZCB0aGUgY29tbWFuZCBtYXAgb2JqZWN0IGNvbnRhaW5pbmcgdGhlIHBvc2l0aW9uLlxuXHQgKiBIYW5kbGVzIGJvdGggZGlyZWN0IGNvbW1hbmQgb2JqZWN0cyBhbmQgbmVzdGVkIG1hdGNoZXIgZm9ybWF0LlxuXHQgKiBBbHNvIGhhbmRsZXMgdHJhaWxpbmcgbGluZXMgYWZ0ZXIgdGhlIGxhc3QgcGFyc2VkIHByb3BlcnR5IG9mIGEgY29tbWFuZCBtYXAuXG5cdCAqL1xuXHRwcml2YXRlIGZpbmRDb250YWluaW5nQ29tbWFuZE1hcChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCBob29rc01hcDogSU1hcFZhbHVlKTogSU1hcFZhbHVlIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGhvb2tzTWFwLnByb3BlcnRpZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IHByb3AgPSBob29rc01hcC5wcm9wZXJ0aWVzW2ldO1xuXHRcdFx0aWYgKHByb3AudmFsdWUudHlwZSAhPT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIENoZWNrIGlmIGN1cnNvciBpcyB3aXRoaW4gdGhlIHNlcXVlbmNlJ3MgcmFuZ2UsIG9yIG9uIGEgdHJhaWxpbmcgbGluZSBhZnRlciBpdFxuXHRcdFx0Y29uc3Qgc2VxUmFuZ2UgPSBwcm9wLnZhbHVlLnJhbmdlO1xuXHRcdFx0Y29uc3QgbmV4dFByb3AgPSBob29rc01hcC5wcm9wZXJ0aWVzW2kgKyAxXTtcblx0XHRcdGNvbnN0IGlzSW5TZXEgPSBzZXFSYW5nZS5jb250YWluc1Bvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRcdGNvbnN0IGlzVHJhaWxpbmdTZXEgPSAhaXNJblNlcVxuXHRcdFx0XHQmJiBzZXFSYW5nZS5lbmRMaW5lTnVtYmVyIDwgcG9zaXRpb24ubGluZU51bWJlclxuXHRcdFx0XHQmJiAoIW5leHRQcm9wIHx8IG5leHRQcm9wLmtleS5yYW5nZS5zdGFydExpbmVOdW1iZXIgPiBwb3NpdGlvbi5saW5lTnVtYmVyKTtcblxuXHRcdFx0aWYgKGlzSW5TZXEgfHwgaXNUcmFpbGluZ1NlcSkge1xuXHRcdFx0XHQvLyBGb3IgdHJhaWxpbmcgbGluZXMsIHZlcmlmeSB0aGUgY3Vyc29yIGlzIGluZGVudGVkIGRlZXBlciB0aGFuXG5cdFx0XHRcdC8vIHRoZSBob29rIGV2ZW50IGtleSBcdTIwMTQgb3RoZXJ3aXNlIGl0IGJlbG9uZ3MgdG8gdGhlIHBhcmVudCBtYXAuXG5cdFx0XHRcdGlmIChpc1RyYWlsaW5nU2VxKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGluZVRleHQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRcdFx0XHRjb25zdCBmaXJzdE5vbldzID0gbGluZVRleHQuc2VhcmNoKC9cXFMvKTtcblx0XHRcdFx0XHRjb25zdCBlZmZlY3RpdmVJbmRlbnQgPSBmaXJzdE5vbldzID09PSAtMSA/IHBvc2l0aW9uLmNvbHVtbiAtIDEgOiBmaXJzdE5vbldzO1xuXHRcdFx0XHRcdGNvbnN0IGhvb2tLZXlJbmRlbnQgPSBwcm9wLmtleS5yYW5nZS5zdGFydENvbHVtbiAtIDE7XG5cdFx0XHRcdFx0aWYgKGVmZmVjdGl2ZUluZGVudCA8PSBob29rS2V5SW5kZW50KSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5maW5kQ29tbWFuZE1hcEluU2VxdWVuY2UocG9zaXRpb24sIHByb3AudmFsdWUpO1xuXHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5kQ29tbWFuZE1hcEluU2VxdWVuY2UocG9zaXRpb246IFBvc2l0aW9uLCBzZXF1ZW5jZTogSVNlcXVlbmNlVmFsdWUpOiBJTWFwVmFsdWUgfCB1bmRlZmluZWQge1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc2VxdWVuY2UuaXRlbXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSBzZXF1ZW5jZS5pdGVtc1tpXTtcblx0XHRcdGlmIChpdGVtLnR5cGUgIT09ICdtYXAnKSB7XG5cdFx0XHRcdC8vIEhhbmRsZSBwYXJ0aWFsIHR5cGluZzogYSBzY2FsYXIgb24gdGhlIGN1cnNvciBsaW5lIG1lYW5zIHRoZSB1c2VyXG5cdFx0XHRcdC8vIGlzIHN0YXJ0aW5nIHRvIHR5cGUgYSBjb21tYW5kIGVudHJ5IChlLmcuLCBcIi0gdFwiKS5cblx0XHRcdFx0aWYgKGl0ZW0udHlwZSA9PT0gJ3NjYWxhcicgJiYgaXRlbS5yYW5nZS5zdGFydExpbmVOdW1iZXIgPT09IHBvc2l0aW9uLmxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnbWFwJywgcHJvcGVydGllczogW10sIHJhbmdlOiBpdGVtLnJhbmdlIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGlmIHBvc2l0aW9uIGlzIHdpdGhpbiBvciBqdXN0IGFmdGVyIHRoaXMgbWFwIGl0ZW0ncyBwYXJzZWQgcmFuZ2UuXG5cdFx0XHQvLyBUaGUgcGFyc2VyJ3MgcmFuZ2UgbWF5IG5vdCBpbmNsdWRlIGEgdHJhaWxpbmcgbGluZSBiZWluZyB0eXBlZC5cblx0XHRcdGNvbnN0IGlzSW5SYW5nZSA9IGl0ZW0ucmFuZ2UuY29udGFpbnNQb3NpdGlvbihwb3NpdGlvbik7XG5cdFx0XHRjb25zdCBpc1RyYWlsaW5nID0gIWlzSW5SYW5nZVxuXHRcdFx0XHQmJiBpdGVtLnJhbmdlLmVuZExpbmVOdW1iZXIgPCBwb3NpdGlvbi5saW5lTnVtYmVyXG5cdFx0XHRcdCYmIChpICsgMSA+PSBzZXF1ZW5jZS5pdGVtcy5sZW5ndGggfHwgc2VxdWVuY2UuaXRlbXNbaSArIDFdLnJhbmdlLnN0YXJ0TGluZU51bWJlciA+IHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXG5cdFx0XHRpZiAoIWlzSW5SYW5nZSAmJiAhaXNUcmFpbGluZykge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2hlY2sgZm9yIG5lc3RlZCBtYXRjaGVyIGZvcm1hdDogeyBob29rczogWy4uLl0gfVxuXHRcdFx0Y29uc3QgbmVzdGVkSG9va3MgPSBpdGVtLnByb3BlcnRpZXMuZmluZChwID0+IHAua2V5LnZhbHVlID09PSAnaG9va3MnKTtcblx0XHRcdGlmIChuZXN0ZWRIb29rcz8udmFsdWUudHlwZSA9PT0gJ3NlcXVlbmNlJykge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmZpbmRDb21tYW5kTWFwSW5TZXF1ZW5jZShwb3NpdGlvbiwgbmVzdGVkSG9va3MudmFsdWUpO1xuXHRcdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGl0ZW07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFZhbHVlU3VnZ2VzdGlvbnMocHJvbXB0VHlwZTogUHJvbXB0c1R5cGUsIGF0dHJpYnV0ZTogc3RyaW5nLCB0YXJnZXQ6IFRhcmdldCk6IFByb21pc2U8cmVhZG9ubHkgSVZhbHVlRW50cnlbXT4ge1xuXHRcdGNvbnN0IGF0dHJpYnV0ZURlc2MgPSBnZXRBdHRyaWJ1dGVEZWZpbml0aW9uKGF0dHJpYnV0ZSwgcHJvbXB0VHlwZSwgdGFyZ2V0KTtcblx0XHRpZiAoYXR0cmlidXRlRGVzYz8uZW51bXMpIHtcblx0XHRcdHJldHVybiBhdHRyaWJ1dGVEZXNjLmVudW1zO1xuXHRcdH1cblx0XHRpZiAoYXR0cmlidXRlRGVzYz8uZGVmYXVsdHMpIHtcblx0XHRcdHJldHVybiBhdHRyaWJ1dGVEZXNjLmRlZmF1bHRzLm1hcCh2YWx1ZSA9PiAoeyBuYW1lOiB2YWx1ZSB9KSk7XG5cdFx0fVxuXHRcdHN3aXRjaCAoYXR0cmlidXRlKSB7XG5cdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMuYWdlbnQ6XG5cdFx0XHRjYXNlIFByb21wdEhlYWRlckF0dHJpYnV0ZXMubW9kZTpcblx0XHRcdFx0aWYgKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdCkge1xuXHRcdFx0XHRcdC8vIEdldCBhbGwgYXZhaWxhYmxlIGFnZW50cyAoYnVpbHRpbiArIGN1c3RvbSlcblx0XHRcdFx0XHRjb25zdCBhZ2VudHMgPSBhd2FpdCB0aGlzLmNoYXRNb2RlU2VydmljZS5nZXRMb2NhbE1vZGVzKCk7XG5cdFx0XHRcdFx0Y29uc3Qgc3VnZ2VzdGlvbnM6IElWYWx1ZUVudHJ5W10gPSBbXTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGFnZW50IG9mIEl0ZXJhYmxlLmNvbmNhdChhZ2VudHMuYnVpbHRpbiwgYWdlbnRzLmN1c3RvbSkpIHtcblx0XHRcdFx0XHRcdHN1Z2dlc3Rpb25zLnB1c2goeyBuYW1lOiBhZ2VudC5uYW1lLmdldCgpLCBkZXNjcmlwdGlvbjogYWdlbnQubGFiZWwuZ2V0KCkgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBzdWdnZXN0aW9ucztcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlbDpcblx0XHRcdFx0aWYgKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLnByb21wdCB8fCBwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmdldE1vZGVsTmFtZXMocHJvbXB0VHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TW9kZWxOYW1lcyhhZ2VudE1vZGVPbmx5OiBib29sZWFuKTogSVZhbHVlRW50cnlbXSB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gW107XG5cdFx0Zm9yIChjb25zdCBtb2RlbCBvZiB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5nZXRMYW5ndWFnZU1vZGVsSWRzKCkpIHtcblx0XHRcdGNvbnN0IG1ldGFkYXRhID0gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UubG9va3VwTGFuZ3VhZ2VNb2RlbChtb2RlbCk7XG5cdFx0XHRpZiAobWV0YWRhdGEgJiYgbWV0YWRhdGEuaXNVc2VyU2VsZWN0YWJsZSAhPT0gZmFsc2UgJiYgIW1ldGFkYXRhLnRhcmdldENoYXRTZXNzaW9uVHlwZSkge1xuXHRcdFx0XHRpZiAoIWFnZW50TW9kZU9ubHkgfHwgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEuc3VpdGFibGVGb3JBZ2VudE1vZGUobWV0YWRhdGEpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRcdFx0bmFtZTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEuYXNRdWFsaWZpZWROYW1lKG1ldGFkYXRhKSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBtZXRhZGF0YS50b29sdGlwXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcHJvdmlkZUFycmF5Q29tcGxldGlvbnMobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgYXJyYXlWYWx1ZTogSVNlcXVlbmNlVmFsdWUsIGdldFZhbHVlczogKCkgPT4gUHJvbWlzZTxSZWFkb25seUFycmF5PElWYWx1ZUVudHJ5Pj4pOiBQcm9taXNlPENvbXBsZXRpb25MaXN0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZ2V0U3VnZ2VzdGlvbnMgPSBhc3luYyAodG9vbFJhbmdlOiBSYW5nZSwgY3VycmVudEl0ZW0/OiBJVmFsdWUpID0+IHtcblx0XHRcdGNvbnN0IHN1Z2dlc3Rpb25zOiBDb21wbGV0aW9uSXRlbVtdID0gW107XG5cdFx0XHRjb25zdCBlbnRyaWVzID0gYXdhaXQgZ2V0VmFsdWVzKCk7XG5cdFx0XHRjb25zdCBxdW90ZVByZWZlcmVuY2UgPSBnZXRRdW90ZVByZWZlcmVuY2UoYXJyYXlWYWx1ZSwgbW9kZWwpO1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdWYWx1ZXMgPSBuZXcgU2V0PHN0cmluZz4oYXJyYXlWYWx1ZS5pdGVtcy5maWx0ZXIoaXRlbSA9PiBpdGVtICE9PSBjdXJyZW50SXRlbSkuZmlsdGVyKGl0ZW0gPT4gaXRlbS50eXBlID09PSAnc2NhbGFyJykubWFwKGl0ZW0gPT4gaXRlbS52YWx1ZSkpO1xuXHRcdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRcdGNvbnN0IGVudHJ5TmFtZSA9IGVudHJ5Lm5hbWU7XG5cdFx0XHRcdGlmIChleGlzdGluZ1ZhbHVlcy5oYXMoZW50cnlOYW1lKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGxldCBpbnNlcnRUZXh0OiBzdHJpbmc7XG5cdFx0XHRcdGlmICghdG9vbFJhbmdlLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRcdGNvbnN0IGZpcnN0Q2hhciA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZSh0b29sUmFuZ2UpLmNoYXJDb2RlQXQoMCk7XG5cdFx0XHRcdFx0aW5zZXJ0VGV4dCA9IGZpcnN0Q2hhciA9PT0gQ2hhckNvZGUuU2luZ2xlUXVvdGUgPyBgJyR7ZW50cnlOYW1lfSdgIDogZmlyc3RDaGFyID09PSBDaGFyQ29kZS5Eb3VibGVRdW90ZSA/IGBcIiR7ZW50cnlOYW1lfVwiYCA6IGVudHJ5TmFtZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRpbnNlcnRUZXh0ID0gZm9ybWF0QXJyYXlWYWx1ZShlbnRyeU5hbWUsIHF1b3RlUHJlZmVyZW5jZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3VnZ2VzdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IGVudHJ5TmFtZSxcblx0XHRcdFx0XHRkb2N1bWVudGF0aW9uOiBlbnRyeS5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVmFsdWUsXG5cdFx0XHRcdFx0ZmlsdGVyVGV4dDogaW5zZXJ0VGV4dCxcblx0XHRcdFx0XHRpbnNlcnRUZXh0OiBpbnNlcnRUZXh0LFxuXHRcdFx0XHRcdHJhbmdlOiB0b29sUmFuZ2UsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgc3VnZ2VzdGlvbnMgfTtcblx0XHR9O1xuXG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIGFycmF5VmFsdWUuaXRlbXMpIHtcblx0XHRcdGlmIChpdGVtLnJhbmdlLmNvbnRhaW5zUG9zaXRpb24ocG9zaXRpb24pKSB7XG5cdFx0XHRcdC8vIGlmIHRoZSBwb3NpdGlvbiBpcyBpbnNpZGUgYSBpdGVtIHJhbmdlLCB3ZSBwcm92aWRlIGl0ZW0gY29tcGxldGlvbnNcblx0XHRcdFx0cmV0dXJuIGF3YWl0IGdldFN1Z2dlc3Rpb25zKGl0ZW0ucmFuZ2UsIGl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjb25zdCBwcmVmaXggPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UobmV3IFJhbmdlKHBvc2l0aW9uLmxpbmVOdW1iZXIsIDEsIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbikpO1xuXHRcdGlmIChwcmVmaXgubWF0Y2goL1s6LFtdXFxzKiQvKSkge1xuXHRcdFx0Ly8gaWYgdGhlIHBvc2l0aW9uIGlzIGFmdGVyIGEgY29tbWEgb3IgYnJhY2tldFxuXHRcdFx0cmV0dXJuIGF3YWl0IGdldFN1Z2dlc3Rpb25zKG5ldyBSYW5nZShwb3NpdGlvbi5saW5lTnVtYmVyLCBwb3NpdGlvbi5jb2x1bW4sIHBvc2l0aW9uLmxpbmVOdW1iZXIsIHBvc2l0aW9uLmNvbHVtbikpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQTRDLDhCQUE4QiwwQkFBa0U7QUFFNUksU0FBUyw0QkFBNEIsOEJBQThCO0FBQ25FLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNkJBQTZCLGFBQWEsY0FBYztBQUNqRSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUE4RCx5QkFBdUMsOEJBQThCO0FBQ25JLFNBQVMsd0JBQXdCLFdBQVcsd0JBQXdCLGtCQUFrQix5QkFBc0MsOEJBQStC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
