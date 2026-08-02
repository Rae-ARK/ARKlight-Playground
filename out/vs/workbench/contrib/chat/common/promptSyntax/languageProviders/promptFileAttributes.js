import { dirname } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { localize } from "../../../../../../nls.js";
import { SpecedToolAliases } from "../../tools/languageModelToolsService.js";
import { CLAUDE_AGENTS_SOURCE_FOLDER, isInClaudeRulesFolder } from "../config/promptFileLocations.js";
import { PromptHeaderAttributes } from "../promptFileParser.js";
import { PromptsType, Target } from "../promptTypes.js";
var GithubPromptHeaderAttributes;
((GithubPromptHeaderAttributes2) => {
  GithubPromptHeaderAttributes2.mcpServers = "mcp-servers";
  GithubPromptHeaderAttributes2.github = "github";
})(GithubPromptHeaderAttributes || (GithubPromptHeaderAttributes = {}));
var ClaudeHeaderAttributes;
((ClaudeHeaderAttributes2) => {
  ClaudeHeaderAttributes2.disallowedTools = "disallowedTools";
})(ClaudeHeaderAttributes || (ClaudeHeaderAttributes = {}));
function isTarget(value) {
  return value === Target.VSCode || value === Target.GitHubCopilot || value === Target.Claude || value === Target.Undefined;
}
const booleanAttributeEnumValues = [
  { name: "true" },
  { name: "false" }
];
const targetAttributeEnumValues = [
  { name: "vscode" },
  { name: "github-copilot" }
];
const promptFileAttributes = {
  [PromptHeaderAttributes.name]: {
    type: "scalar",
    description: localize("promptHeader.prompt.name", "The name of the prompt. This is also the name of the slash command that will run this prompt.")
  },
  [PromptHeaderAttributes.description]: {
    type: "scalar",
    description: localize("promptHeader.prompt.description", "The description of the reusable prompt, what it does and when to use it.")
  },
  [PromptHeaderAttributes.argumentHint]: {
    type: "scalar",
    description: localize("promptHeader.prompt.argumentHint", "The argument-hint describes what inputs the prompt expects or supports.")
  },
  [PromptHeaderAttributes.model]: {
    type: "scalar | sequence",
    description: localize("promptHeader.prompt.model", "The model to use in this prompt. Can also be a list of models. The first available model will be used.")
  },
  [PromptHeaderAttributes.tools]: {
    type: "scalar | sequence",
    description: localize("promptHeader.prompt.tools", "The tools to use in this prompt."),
    defaults: ["[]", "['search', 'edit', 'web']"]
  },
  [PromptHeaderAttributes.agent]: {
    type: "scalar",
    description: localize("promptHeader.prompt.agent.description", "The agent to use when running this prompt.")
  },
  [PromptHeaderAttributes.mode]: {
    type: "scalar",
    description: localize("promptHeader.prompt.agent.description", "The agent to use when running this prompt.")
  }
};
const instructionAttributes = {
  [PromptHeaderAttributes.name]: {
    type: "scalar",
    description: localize("promptHeader.instructions.name", "The name of the instruction file as shown in the UI. If not set, the name is derived from the file name.")
  },
  [PromptHeaderAttributes.description]: {
    type: "scalar",
    description: localize("promptHeader.instructions.description", "The description of the instruction file. It can be used to provide additional context or information about the instructions and is passed to the language model as part of the prompt.")
  },
  [PromptHeaderAttributes.applyTo]: {
    type: "scalar",
    description: localize("promptHeader.instructions.applyToRange", "One or more glob pattern (separated by comma) that describe for which files the instructions apply to. Based on these patterns, the file is automatically included in the prompt, when the context contains a file that matches one or more of these patterns. Use `**` when you want this file to always be added.\nExample: `**/*.ts`, `**/*.js`, `client/**`"),
    defaults: [
      "'**'",
      "'**/*.ts, **/*.js'",
      "'**/*.php'",
      "'**/*.py'"
    ]
  },
  [PromptHeaderAttributes.excludeAgent]: {
    type: "scalar | sequence",
    description: localize("promptHeader.instructions.excludeAgent", "One or more agents to exclude from using this instruction file.")
  }
};
const customAgentAttributes = {
  [PromptHeaderAttributes.name]: {
    type: "scalar",
    description: localize("promptHeader.agent.name", "The name of the agent as shown in the UI.")
  },
  [PromptHeaderAttributes.description]: {
    type: "scalar",
    description: localize("promptHeader.agent.description", "The description of the custom agent, what it does and when to use it.")
  },
  [PromptHeaderAttributes.argumentHint]: {
    type: "scalar",
    description: localize("promptHeader.agent.argumentHint", "The argument-hint describes what inputs the custom agent expects or supports.")
  },
  [PromptHeaderAttributes.model]: {
    type: "scalar | sequence",
    description: localize("promptHeader.agent.model", "Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.")
  },
  [PromptHeaderAttributes.tools]: {
    type: "scalar | sequence",
    description: localize("promptHeader.agent.tools", "The set of tools that the custom agent has access to."),
    defaults: ["[]", "[search, edit, web]"]
  },
  [PromptHeaderAttributes.handOffs]: {
    type: "sequence",
    description: localize("promptHeader.agent.handoffs", "Possible handoff actions when the agent has completed its task.")
  },
  [PromptHeaderAttributes.target]: {
    type: "scalar",
    description: localize("promptHeader.agent.target", "The target to which the header attributes like tools apply to. Possible values are `github-copilot` and `vscode`."),
    enums: targetAttributeEnumValues
  },
  [PromptHeaderAttributes.infer]: {
    type: "scalar",
    description: localize("promptHeader.agent.infer", "Controls visibility of the agent."),
    enums: booleanAttributeEnumValues
  },
  [PromptHeaderAttributes.agents]: {
    type: "sequence",
    description: localize("promptHeader.agent.agents", "One or more agents that this agent can use as subagents. Use '*' to specify all available agents."),
    defaults: ['["*"]']
  },
  [PromptHeaderAttributes.userInvocable]: {
    type: "scalar",
    description: localize("promptHeader.agent.userInvocable", "Whether the agent can be selected and invoked by users in the UI."),
    enums: booleanAttributeEnumValues
  },
  [PromptHeaderAttributes.disableModelInvocation]: {
    type: "scalar",
    description: localize("promptHeader.agent.disableModelInvocation", "If true, prevents the agent from being invoked as a subagent."),
    enums: booleanAttributeEnumValues
  },
  [PromptHeaderAttributes.advancedOptions]: {
    type: "map",
    description: localize("promptHeader.agent.advancedOptions", "Advanced options for custom agent behavior.")
  },
  [GithubPromptHeaderAttributes.github]: {
    type: "map",
    description: localize("promptHeader.agent.github", "GitHub-specific configuration for the agent, such as token permissions.")
  },
  [PromptHeaderAttributes.hooks]: {
    type: "map",
    description: localize("promptHeader.agent.hooks", "Lifecycle hooks scoped to this agent. Define hooks that run only while this agent is active.")
  }
};
const skillAttributes = {
  [PromptHeaderAttributes.name]: {
    type: "scalar",
    description: localize("promptHeader.skill.name", "The name of the skill.")
  },
  [PromptHeaderAttributes.description]: {
    type: "scalar",
    description: localize("promptHeader.skill.description", "The description of the skill. The description is added to every request and will be used by the agent to decide when to load the skill.")
  },
  [PromptHeaderAttributes.argumentHint]: {
    type: "scalar",
    description: localize("promptHeader.skill.argumentHint", "Hint shown during autocomplete to indicate expected arguments. Example: [issue-number] or [filename] [format]")
  },
  [PromptHeaderAttributes.userInvocable]: {
    type: "scalar",
    description: localize("promptHeader.skill.userInvocable", "Set to false to hide from the / menu. Use for background knowledge users should not invoke directly. Default: true."),
    enums: booleanAttributeEnumValues
  },
  [PromptHeaderAttributes.disableModelInvocation]: {
    type: "scalar",
    description: localize("promptHeader.skill.disableModelInvocation", "Set to true to prevent the agent from automatically loading this skill. Use for workflows you want to trigger manually with /name. Default: false."),
    enums: booleanAttributeEnumValues
  },
  [PromptHeaderAttributes.license]: {
    type: "scalar | map",
    description: localize("promptHeader.skill.license", "License information for the skill.")
  },
  [PromptHeaderAttributes.compatibility]: {
    type: "scalar | map",
    description: localize("promptHeader.skill.compatibility", "Compatibility metadata for environments or runtimes.")
  },
  [PromptHeaderAttributes.metadata]: {
    type: "map",
    description: localize("promptHeader.skill.metadata", "Additional metadata for the skill.")
  },
  [PromptHeaderAttributes.context]: {
    type: "scalar",
    description: localize("promptHeader.skill.context", "Controls how the skill is loaded. Set to 'fork' to spawn a subagent with the skill instructions instead of returning them inline."),
    enums: [{ name: "fork", description: localize("promptHeader.skill.context.fork", "Spawn a subagent with the skill instructions injected as system context.") }]
  }
};
const allAttributeNames = {
  [PromptsType.prompt]: Object.keys(promptFileAttributes),
  [PromptsType.instructions]: Object.keys(instructionAttributes),
  [PromptsType.agent]: Object.keys(customAgentAttributes),
  [PromptsType.skill]: Object.keys(skillAttributes),
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
function getAttributeDefinition(attributeName, promptType, target) {
  switch (promptType) {
    case PromptsType.instructions:
      if (target === Target.Claude) {
        return claudeRulesAttributes[attributeName];
      }
      return instructionAttributes[attributeName];
    case PromptsType.skill:
      return skillAttributes[attributeName];
    case PromptsType.agent:
      if (target === Target.Claude) {
        return claudeAgentAttributes[attributeName];
      }
      return customAgentAttributes[attributeName];
    case PromptsType.prompt:
      return promptFileAttributes[attributeName];
    default:
      return void 0;
  }
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
export {
  ClaudeHeaderAttributes,
  GithubPromptHeaderAttributes,
  claudeAgentAttributes,
  claudeRulesAttributes,
  customAgentAttributes,
  getAttributeDefinition,
  getTarget,
  getValidAttributeNames,
  instructionAttributes,
  isNonRecommendedAttribute,
  isTarget,
  isVSCodeOrDefaultTarget,
  knownClaudeModels,
  knownClaudeTools,
  knownGithubCopilotTools,
  mapClaudeModels,
  mapClaudeTools,
  promptFileAttributes,
  skillAttributes
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRGaWxlQXR0cmlidXRlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IFNwZWNlZFRvb2xBbGlhc2VzIH0gZnJvbSAnLi4vLi4vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDTEFVREVfQUdFTlRTX1NPVVJDRV9GT0xERVIsIGlzSW5DbGF1ZGVSdWxlc0ZvbGRlciB9IGZyb20gJy4uL2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IFByb21wdEhlYWRlciwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcyB9IGZyb20gJy4uL3Byb21wdEZpbGVQYXJzZXIuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUsIFRhcmdldCB9IGZyb20gJy4uL3Byb21wdFR5cGVzLmpzJztcblxuZXhwb3J0IG5hbWVzcGFjZSBHaXRodWJQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzIHtcblx0ZXhwb3J0IGNvbnN0IG1jcFNlcnZlcnMgPSAnbWNwLXNlcnZlcnMnO1xuXHRleHBvcnQgY29uc3QgZ2l0aHViID0gJ2dpdGh1Yic7XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgQ2xhdWRlSGVhZGVyQXR0cmlidXRlcyB7XG5cdGV4cG9ydCBjb25zdCBkaXNhbGxvd2VkVG9vbHMgPSAnZGlzYWxsb3dlZFRvb2xzJztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzVGFyZ2V0KHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgVGFyZ2V0IHtcblx0cmV0dXJuIHZhbHVlID09PSBUYXJnZXQuVlNDb2RlIHx8IHZhbHVlID09PSBUYXJnZXQuR2l0SHViQ29waWxvdCB8fCB2YWx1ZSA9PT0gVGFyZ2V0LkNsYXVkZSB8fCB2YWx1ZSA9PT0gVGFyZ2V0LlVuZGVmaW5lZDtcbn1cblxuXG5pbnRlcmZhY2UgSUF0dHJpYnV0ZURlZmluaXRpb24ge1xuXHRyZWFkb25seSB0eXBlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlZmF1bHRzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IGl0ZW1zPzogcmVhZG9ubHkgeyBuYW1lOiBzdHJpbmc7IGRlc2NyaXB0aW9uPzogc3RyaW5nIH1bXTtcblx0cmVhZG9ubHkgZW51bXM/OiByZWFkb25seSB7IG5hbWU6IHN0cmluZzsgZGVzY3JpcHRpb24/OiBzdHJpbmcgfVtdO1xufVxuXG5jb25zdCBib29sZWFuQXR0cmlidXRlRW51bVZhbHVlczogcmVhZG9ubHkgSVZhbHVlRW50cnlbXSA9IFtcblx0eyBuYW1lOiAndHJ1ZScgfSxcblx0eyBuYW1lOiAnZmFsc2UnIH1cbl07XG5cbmNvbnN0IHRhcmdldEF0dHJpYnV0ZUVudW1WYWx1ZXM6IHJlYWRvbmx5IElWYWx1ZUVudHJ5W10gPSBbXG5cdHsgbmFtZTogJ3ZzY29kZScgfSxcblx0eyBuYW1lOiAnZ2l0aHViLWNvcGlsb3QnIH0sXG5dO1xuXG4vLyBBdHRyaWJ1dGUgbWV0YWRhdGEgZm9yIHByb21wdCBmaWxlcyAoYCoucHJvbXB0Lm1kYCkuXG5leHBvcnQgY29uc3QgcHJvbXB0RmlsZUF0dHJpYnV0ZXM6IFJlY29yZDxzdHJpbmcsIElBdHRyaWJ1dGVEZWZpbml0aW9uPiA9IHtcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMubmFtZV06IHtcblx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5wcm9tcHQubmFtZScsICdUaGUgbmFtZSBvZiB0aGUgcHJvbXB0LiBUaGlzIGlzIGFsc28gdGhlIG5hbWUgb2YgdGhlIHNsYXNoIGNvbW1hbmQgdGhhdCB3aWxsIHJ1biB0aGlzIHByb21wdC4nKSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMuZGVzY3JpcHRpb25dOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIucHJvbXB0LmRlc2NyaXB0aW9uJywgJ1RoZSBkZXNjcmlwdGlvbiBvZiB0aGUgcmV1c2FibGUgcHJvbXB0LCB3aGF0IGl0IGRvZXMgYW5kIHdoZW4gdG8gdXNlIGl0LicpLFxuXHR9LFxuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hcmd1bWVudEhpbnRdOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIucHJvbXB0LmFyZ3VtZW50SGludCcsICdUaGUgYXJndW1lbnQtaGludCBkZXNjcmliZXMgd2hhdCBpbnB1dHMgdGhlIHByb21wdCBleHBlY3RzIG9yIHN1cHBvcnRzLicpLFxuXHR9LFxuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlbF06IHtcblx0XHR0eXBlOiAnc2NhbGFyIHwgc2VxdWVuY2UnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnByb21wdC5tb2RlbCcsICdUaGUgbW9kZWwgdG8gdXNlIGluIHRoaXMgcHJvbXB0LiBDYW4gYWxzbyBiZSBhIGxpc3Qgb2YgbW9kZWxzLiBUaGUgZmlyc3QgYXZhaWxhYmxlIG1vZGVsIHdpbGwgYmUgdXNlZC4nKSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMudG9vbHNdOiB7XG5cdFx0dHlwZTogJ3NjYWxhciB8IHNlcXVlbmNlJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5wcm9tcHQudG9vbHMnLCAnVGhlIHRvb2xzIHRvIHVzZSBpbiB0aGlzIHByb21wdC4nKSxcblx0XHRkZWZhdWx0czogWydbXScsICdbXFwnc2VhcmNoXFwnLCBcXCdlZGl0XFwnLCBcXCd3ZWJcXCddJ10sXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFnZW50XToge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnByb21wdC5hZ2VudC5kZXNjcmlwdGlvbicsICdUaGUgYWdlbnQgdG8gdXNlIHdoZW4gcnVubmluZyB0aGlzIHByb21wdC4nKSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMubW9kZV06IHtcblx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5wcm9tcHQuYWdlbnQuZGVzY3JpcHRpb24nLCAnVGhlIGFnZW50IHRvIHVzZSB3aGVuIHJ1bm5pbmcgdGhpcyBwcm9tcHQuJyksXG5cdH0sXG59O1xuXG4vLyBBdHRyaWJ1dGUgbWV0YWRhdGEgZm9yIGluc3RydWN0aW9ucyBmaWxlcyAoYCouaW5zdHJ1Y3Rpb25zLm1kYCkuXG5leHBvcnQgY29uc3QgaW5zdHJ1Y3Rpb25BdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCBJQXR0cmlidXRlRGVmaW5pdGlvbj4gPSB7XG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm5hbWVdOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuaW5zdHJ1Y3Rpb25zLm5hbWUnLCAnVGhlIG5hbWUgb2YgdGhlIGluc3RydWN0aW9uIGZpbGUgYXMgc2hvd24gaW4gdGhlIFVJLiBJZiBub3Qgc2V0LCB0aGUgbmFtZSBpcyBkZXJpdmVkIGZyb20gdGhlIGZpbGUgbmFtZS4nKSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMuZGVzY3JpcHRpb25dOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuaW5zdHJ1Y3Rpb25zLmRlc2NyaXB0aW9uJywgJ1RoZSBkZXNjcmlwdGlvbiBvZiB0aGUgaW5zdHJ1Y3Rpb24gZmlsZS4gSXQgY2FuIGJlIHVzZWQgdG8gcHJvdmlkZSBhZGRpdGlvbmFsIGNvbnRleHQgb3IgaW5mb3JtYXRpb24gYWJvdXQgdGhlIGluc3RydWN0aW9ucyBhbmQgaXMgcGFzc2VkIHRvIHRoZSBsYW5ndWFnZSBtb2RlbCBhcyBwYXJ0IG9mIHRoZSBwcm9tcHQuJyksXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFwcGx5VG9dOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuaW5zdHJ1Y3Rpb25zLmFwcGx5VG9SYW5nZScsICdPbmUgb3IgbW9yZSBnbG9iIHBhdHRlcm4gKHNlcGFyYXRlZCBieSBjb21tYSkgdGhhdCBkZXNjcmliZSBmb3Igd2hpY2ggZmlsZXMgdGhlIGluc3RydWN0aW9ucyBhcHBseSB0by4gQmFzZWQgb24gdGhlc2UgcGF0dGVybnMsIHRoZSBmaWxlIGlzIGF1dG9tYXRpY2FsbHkgaW5jbHVkZWQgaW4gdGhlIHByb21wdCwgd2hlbiB0aGUgY29udGV4dCBjb250YWlucyBhIGZpbGUgdGhhdCBtYXRjaGVzIG9uZSBvciBtb3JlIG9mIHRoZXNlIHBhdHRlcm5zLiBVc2UgYCoqYCB3aGVuIHlvdSB3YW50IHRoaXMgZmlsZSB0byBhbHdheXMgYmUgYWRkZWQuXFxuRXhhbXBsZTogYCoqLyoudHNgLCBgKiovKi5qc2AsIGBjbGllbnQvKipgJyksXG5cdFx0ZGVmYXVsdHM6IFtcblx0XHRcdCdcXCcqKlxcJycsXG5cdFx0XHQnXFwnKiovKi50cywgKiovKi5qc1xcJycsXG5cdFx0XHQnXFwnKiovKi5waHBcXCcnLFxuXHRcdFx0J1xcJyoqLyoucHlcXCcnXG5cdFx0XSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMuZXhjbHVkZUFnZW50XToge1xuXHRcdHR5cGU6ICdzY2FsYXIgfCBzZXF1ZW5jZScsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuaW5zdHJ1Y3Rpb25zLmV4Y2x1ZGVBZ2VudCcsICdPbmUgb3IgbW9yZSBhZ2VudHMgdG8gZXhjbHVkZSBmcm9tIHVzaW5nIHRoaXMgaW5zdHJ1Y3Rpb24gZmlsZS4nKSxcblx0fSxcbn07XG5cbi8vIEF0dHJpYnV0ZSBtZXRhZGF0YSBmb3IgY3VzdG9tIGFnZW50IGZpbGVzIChgKi5hZ2VudC5tZGApLlxuZXhwb3J0IGNvbnN0IGN1c3RvbUFnZW50QXR0cmlidXRlczogUmVjb3JkPHN0cmluZywgSUF0dHJpYnV0ZURlZmluaXRpb24+ID0ge1xuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5uYW1lXToge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50Lm5hbWUnLCAnVGhlIG5hbWUgb2YgdGhlIGFnZW50IGFzIHNob3duIGluIHRoZSBVSS4nKSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMuZGVzY3JpcHRpb25dOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuYWdlbnQuZGVzY3JpcHRpb24nLCAnVGhlIGRlc2NyaXB0aW9uIG9mIHRoZSBjdXN0b20gYWdlbnQsIHdoYXQgaXQgZG9lcyBhbmQgd2hlbiB0byB1c2UgaXQuJyksXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmFyZ3VtZW50SGludF06IHtcblx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC5hcmd1bWVudEhpbnQnLCAnVGhlIGFyZ3VtZW50LWhpbnQgZGVzY3JpYmVzIHdoYXQgaW5wdXRzIHRoZSBjdXN0b20gYWdlbnQgZXhwZWN0cyBvciBzdXBwb3J0cy4nKSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMubW9kZWxdOiB7XG5cdFx0dHlwZTogJ3NjYWxhciB8IHNlcXVlbmNlJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC5tb2RlbCcsICdTcGVjaWZ5IHRoZSBtb2RlbCB0aGF0IHJ1bnMgdGhpcyBjdXN0b20gYWdlbnQuIENhbiBhbHNvIGJlIGEgbGlzdCBvZiBtb2RlbHMuIFRoZSBmaXJzdCBhdmFpbGFibGUgbW9kZWwgd2lsbCBiZSB1c2VkLicpLFxuXHR9LFxuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy50b29sc106IHtcblx0XHR0eXBlOiAnc2NhbGFyIHwgc2VxdWVuY2UnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50LnRvb2xzJywgJ1RoZSBzZXQgb2YgdG9vbHMgdGhhdCB0aGUgY3VzdG9tIGFnZW50IGhhcyBhY2Nlc3MgdG8uJyksXG5cdFx0ZGVmYXVsdHM6IFsnW10nLCAnW3NlYXJjaCwgZWRpdCwgd2ViXSddLFxuXHR9LFxuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5oYW5kT2Zmc106IHtcblx0XHR0eXBlOiAnc2VxdWVuY2UnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50LmhhbmRvZmZzJywgJ1Bvc3NpYmxlIGhhbmRvZmYgYWN0aW9ucyB3aGVuIHRoZSBhZ2VudCBoYXMgY29tcGxldGVkIGl0cyB0YXNrLicpLFxuXHR9LFxuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy50YXJnZXRdOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuYWdlbnQudGFyZ2V0JywgJ1RoZSB0YXJnZXQgdG8gd2hpY2ggdGhlIGhlYWRlciBhdHRyaWJ1dGVzIGxpa2UgdG9vbHMgYXBwbHkgdG8uIFBvc3NpYmxlIHZhbHVlcyBhcmUgYGdpdGh1Yi1jb3BpbG90YCBhbmQgYHZzY29kZWAuJyksXG5cdFx0ZW51bXM6IHRhcmdldEF0dHJpYnV0ZUVudW1WYWx1ZXMsXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmluZmVyXToge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50LmluZmVyJywgJ0NvbnRyb2xzIHZpc2liaWxpdHkgb2YgdGhlIGFnZW50LicpLFxuXHRcdGVudW1zOiBib29sZWFuQXR0cmlidXRlRW51bVZhbHVlcyxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMuYWdlbnRzXToge1xuXHRcdHR5cGU6ICdzZXF1ZW5jZScsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuYWdlbnQuYWdlbnRzJywgJ09uZSBvciBtb3JlIGFnZW50cyB0aGF0IHRoaXMgYWdlbnQgY2FuIHVzZSBhcyBzdWJhZ2VudHMuIFVzZSBcXCcqXFwnIHRvIHNwZWNpZnkgYWxsIGF2YWlsYWJsZSBhZ2VudHMuJyksXG5cdFx0ZGVmYXVsdHM6IFsnW1wiKlwiXSddLFxuXHR9LFxuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy51c2VySW52b2NhYmxlXToge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50LnVzZXJJbnZvY2FibGUnLCAnV2hldGhlciB0aGUgYWdlbnQgY2FuIGJlIHNlbGVjdGVkIGFuZCBpbnZva2VkIGJ5IHVzZXJzIGluIHRoZSBVSS4nKSxcblx0XHRlbnVtczogYm9vbGVhbkF0dHJpYnV0ZUVudW1WYWx1ZXMsXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRpc2FibGVNb2RlbEludm9jYXRpb25dOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuYWdlbnQuZGlzYWJsZU1vZGVsSW52b2NhdGlvbicsICdJZiB0cnVlLCBwcmV2ZW50cyB0aGUgYWdlbnQgZnJvbSBiZWluZyBpbnZva2VkIGFzIGEgc3ViYWdlbnQuJyksXG5cdFx0ZW51bXM6IGJvb2xlYW5BdHRyaWJ1dGVFbnVtVmFsdWVzLFxuXHR9LFxuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hZHZhbmNlZE9wdGlvbnNdOiB7XG5cdFx0dHlwZTogJ21hcCcsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuYWdlbnQuYWR2YW5jZWRPcHRpb25zJywgJ0FkdmFuY2VkIG9wdGlvbnMgZm9yIGN1c3RvbSBhZ2VudCBiZWhhdmlvci4nKSxcblx0fSxcblx0W0dpdGh1YlByb21wdEhlYWRlckF0dHJpYnV0ZXMuZ2l0aHViXToge1xuXHRcdHR5cGU6ICdtYXAnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLmFnZW50LmdpdGh1YicsICdHaXRIdWItc3BlY2lmaWMgY29uZmlndXJhdGlvbiBmb3IgdGhlIGFnZW50LCBzdWNoIGFzIHRva2VuIHBlcm1pc3Npb25zLicpLFxuXHR9LFxuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5ob29rc106IHtcblx0XHR0eXBlOiAnbWFwJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5hZ2VudC5ob29rcycsICdMaWZlY3ljbGUgaG9va3Mgc2NvcGVkIHRvIHRoaXMgYWdlbnQuIERlZmluZSBob29rcyB0aGF0IHJ1biBvbmx5IHdoaWxlIHRoaXMgYWdlbnQgaXMgYWN0aXZlLicpLFxuXHR9LFxufTtcblxuLy8gQXR0cmlidXRlIG1ldGFkYXRhIGZvciBza2lsbCBmaWxlcyAoYFNLSUxMLm1kYCkuXG5leHBvcnQgY29uc3Qgc2tpbGxBdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCBJQXR0cmlidXRlRGVmaW5pdGlvbj4gPSB7XG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLm5hbWVdOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuc2tpbGwubmFtZScsICdUaGUgbmFtZSBvZiB0aGUgc2tpbGwuJyksXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRlc2NyaXB0aW9uXToge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnNraWxsLmRlc2NyaXB0aW9uJywgJ1RoZSBkZXNjcmlwdGlvbiBvZiB0aGUgc2tpbGwuIFRoZSBkZXNjcmlwdGlvbiBpcyBhZGRlZCB0byBldmVyeSByZXF1ZXN0IGFuZCB3aWxsIGJlIHVzZWQgYnkgdGhlIGFnZW50IHRvIGRlY2lkZSB3aGVuIHRvIGxvYWQgdGhlIHNraWxsLicpLFxuXHR9LFxuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hcmd1bWVudEhpbnRdOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuc2tpbGwuYXJndW1lbnRIaW50JywgJ0hpbnQgc2hvd24gZHVyaW5nIGF1dG9jb21wbGV0ZSB0byBpbmRpY2F0ZSBleHBlY3RlZCBhcmd1bWVudHMuIEV4YW1wbGU6IFtpc3N1ZS1udW1iZXJdIG9yIFtmaWxlbmFtZV0gW2Zvcm1hdF0nKSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMudXNlckludm9jYWJsZV06IHtcblx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5za2lsbC51c2VySW52b2NhYmxlJywgJ1NldCB0byBmYWxzZSB0byBoaWRlIGZyb20gdGhlIC8gbWVudS4gVXNlIGZvciBiYWNrZ3JvdW5kIGtub3dsZWRnZSB1c2VycyBzaG91bGQgbm90IGludm9rZSBkaXJlY3RseS4gRGVmYXVsdDogdHJ1ZS4nKSxcblx0XHRlbnVtczogYm9vbGVhbkF0dHJpYnV0ZUVudW1WYWx1ZXMsXG5cdH0sXG5cdFtQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRpc2FibGVNb2RlbEludm9jYXRpb25dOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuc2tpbGwuZGlzYWJsZU1vZGVsSW52b2NhdGlvbicsICdTZXQgdG8gdHJ1ZSB0byBwcmV2ZW50IHRoZSBhZ2VudCBmcm9tIGF1dG9tYXRpY2FsbHkgbG9hZGluZyB0aGlzIHNraWxsLiBVc2UgZm9yIHdvcmtmbG93cyB5b3Ugd2FudCB0byB0cmlnZ2VyIG1hbnVhbGx5IHdpdGggL25hbWUuIERlZmF1bHQ6IGZhbHNlLicpLFxuXHRcdGVudW1zOiBib29sZWFuQXR0cmlidXRlRW51bVZhbHVlcyxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMubGljZW5zZV06IHtcblx0XHR0eXBlOiAnc2NhbGFyIHwgbWFwJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5za2lsbC5saWNlbnNlJywgJ0xpY2Vuc2UgaW5mb3JtYXRpb24gZm9yIHRoZSBza2lsbC4nKSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMuY29tcGF0aWJpbGl0eV06IHtcblx0XHR0eXBlOiAnc2NhbGFyIHwgbWFwJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Byb21wdEhlYWRlci5za2lsbC5jb21wYXRpYmlsaXR5JywgJ0NvbXBhdGliaWxpdHkgbWV0YWRhdGEgZm9yIGVudmlyb25tZW50cyBvciBydW50aW1lcy4nKSxcblx0fSxcblx0W1Byb21wdEhlYWRlckF0dHJpYnV0ZXMubWV0YWRhdGFdOiB7XG5cdFx0dHlwZTogJ21hcCcsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdwcm9tcHRIZWFkZXIuc2tpbGwubWV0YWRhdGEnLCAnQWRkaXRpb25hbCBtZXRhZGF0YSBmb3IgdGhlIHNraWxsLicpLFxuXHR9LFxuXHRbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5jb250ZXh0XToge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnNraWxsLmNvbnRleHQnLCAnQ29udHJvbHMgaG93IHRoZSBza2lsbCBpcyBsb2FkZWQuIFNldCB0byBcXCdmb3JrXFwnIHRvIHNwYXduIGEgc3ViYWdlbnQgd2l0aCB0aGUgc2tpbGwgaW5zdHJ1Y3Rpb25zIGluc3RlYWQgb2YgcmV0dXJuaW5nIHRoZW0gaW5saW5lLicpLFxuXHRcdGVudW1zOiBbeyBuYW1lOiAnZm9yaycsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncHJvbXB0SGVhZGVyLnNraWxsLmNvbnRleHQuZm9yaycsICdTcGF3biBhIHN1YmFnZW50IHdpdGggdGhlIHNraWxsIGluc3RydWN0aW9ucyBpbmplY3RlZCBhcyBzeXN0ZW0gY29udGV4dC4nKSB9XSxcblx0fSxcbn07XG5cbmNvbnN0IGFsbEF0dHJpYnV0ZU5hbWVzOiBSZWNvcmQ8UHJvbXB0c1R5cGUsIHN0cmluZ1tdPiA9IHtcblx0W1Byb21wdHNUeXBlLnByb21wdF06IE9iamVjdC5rZXlzKHByb21wdEZpbGVBdHRyaWJ1dGVzKSxcblx0W1Byb21wdHNUeXBlLmluc3RydWN0aW9uc106IE9iamVjdC5rZXlzKGluc3RydWN0aW9uQXR0cmlidXRlcyksXG5cdFtQcm9tcHRzVHlwZS5hZ2VudF06IE9iamVjdC5rZXlzKGN1c3RvbUFnZW50QXR0cmlidXRlcyksXG5cdFtQcm9tcHRzVHlwZS5za2lsbF06IE9iamVjdC5rZXlzKHNraWxsQXR0cmlidXRlcyksXG5cdFtQcm9tcHRzVHlwZS5ob29rXTogW10sIC8vIGhvb2tzIGFyZSBKU09OIGZpbGVzLCBub3QgbWFya2Rvd24gd2l0aCBZQU1MIGZyb250bWF0dGVyXG59O1xuY29uc3QgZ2l0aHViQ29waWxvdEFnZW50QXR0cmlidXRlTmFtZXMgPSBbUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5uYW1lLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmRlc2NyaXB0aW9uLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnRvb2xzLCBQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLnRhcmdldCwgR2l0aHViUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tY3BTZXJ2ZXJzLCBHaXRodWJQcm9tcHRIZWFkZXJBdHRyaWJ1dGVzLmdpdGh1YiwgUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5pbmZlcl07XG5jb25zdCByZWNvbW1lbmRlZEF0dHJpYnV0ZU5hbWVzOiBSZWNvcmQ8UHJvbXB0c1R5cGUsIHN0cmluZ1tdPiA9IHtcblx0W1Byb21wdHNUeXBlLnByb21wdF06IGFsbEF0dHJpYnV0ZU5hbWVzW1Byb21wdHNUeXBlLnByb21wdF0uZmlsdGVyKG5hbWUgPT4gIWlzTm9uUmVjb21tZW5kZWRBdHRyaWJ1dGUobmFtZSkpLFxuXHRbUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zXTogYWxsQXR0cmlidXRlTmFtZXNbUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zXS5maWx0ZXIobmFtZSA9PiAhaXNOb25SZWNvbW1lbmRlZEF0dHJpYnV0ZShuYW1lKSksXG5cdFtQcm9tcHRzVHlwZS5hZ2VudF06IGFsbEF0dHJpYnV0ZU5hbWVzW1Byb21wdHNUeXBlLmFnZW50XS5maWx0ZXIobmFtZSA9PiAhaXNOb25SZWNvbW1lbmRlZEF0dHJpYnV0ZShuYW1lKSksXG5cdFtQcm9tcHRzVHlwZS5za2lsbF06IGFsbEF0dHJpYnV0ZU5hbWVzW1Byb21wdHNUeXBlLnNraWxsXS5maWx0ZXIobmFtZSA9PiAhaXNOb25SZWNvbW1lbmRlZEF0dHJpYnV0ZShuYW1lKSksXG5cdFtQcm9tcHRzVHlwZS5ob29rXTogW10sIC8vIGhvb2tzIGFyZSBKU09OIGZpbGVzLCBub3QgbWFya2Rvd24gd2l0aCBZQU1MIGZyb250bWF0dGVyXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VmFsaWRBdHRyaWJ1dGVOYW1lcyhwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSwgaW5jbHVkZU5vblJlY29tbWVuZGVkOiBib29sZWFuLCB0YXJnZXQ6IFRhcmdldCk6IHN0cmluZ1tdIHtcblx0aWYgKHRhcmdldCA9PT0gVGFyZ2V0LkNsYXVkZSkge1xuXHRcdGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpIHtcblx0XHRcdHJldHVybiBPYmplY3Qua2V5cyhjbGF1ZGVSdWxlc0F0dHJpYnV0ZXMpO1xuXHRcdH1cblx0XHRyZXR1cm4gT2JqZWN0LmtleXMoY2xhdWRlQWdlbnRBdHRyaWJ1dGVzKTtcblx0fSBlbHNlIGlmICh0YXJnZXQgPT09IFRhcmdldC5HaXRIdWJDb3BpbG90KSB7XG5cdFx0aWYgKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmFnZW50KSB7XG5cdFx0XHRyZXR1cm4gZ2l0aHViQ29waWxvdEFnZW50QXR0cmlidXRlTmFtZXM7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBpbmNsdWRlTm9uUmVjb21tZW5kZWQgPyBhbGxBdHRyaWJ1dGVOYW1lc1twcm9tcHRUeXBlXSA6IHJlY29tbWVuZGVkQXR0cmlidXRlTmFtZXNbcHJvbXB0VHlwZV07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc05vblJlY29tbWVuZGVkQXR0cmlidXRlKGF0dHJpYnV0ZU5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gYXR0cmlidXRlTmFtZSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5hZHZhbmNlZE9wdGlvbnMgfHwgYXR0cmlidXRlTmFtZSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5leGNsdWRlQWdlbnQgfHwgYXR0cmlidXRlTmFtZSA9PT0gUHJvbXB0SGVhZGVyQXR0cmlidXRlcy5tb2RlIHx8IGF0dHJpYnV0ZU5hbWUgPT09IFByb21wdEhlYWRlckF0dHJpYnV0ZXMuaW5mZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRBdHRyaWJ1dGVEZWZpbml0aW9uKGF0dHJpYnV0ZU5hbWU6IHN0cmluZywgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUsIHRhcmdldDogVGFyZ2V0KTogSUF0dHJpYnV0ZURlZmluaXRpb24gfCB1bmRlZmluZWQge1xuXHRzd2l0Y2ggKHByb21wdFR5cGUpIHtcblx0XHRjYXNlIFByb21wdHNUeXBlLmluc3RydWN0aW9uczpcblx0XHRcdGlmICh0YXJnZXQgPT09IFRhcmdldC5DbGF1ZGUpIHtcblx0XHRcdFx0cmV0dXJuIGNsYXVkZVJ1bGVzQXR0cmlidXRlc1thdHRyaWJ1dGVOYW1lXTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBpbnN0cnVjdGlvbkF0dHJpYnV0ZXNbYXR0cmlidXRlTmFtZV07XG5cdFx0Y2FzZSBQcm9tcHRzVHlwZS5za2lsbDpcblx0XHRcdHJldHVybiBza2lsbEF0dHJpYnV0ZXNbYXR0cmlidXRlTmFtZV07XG5cdFx0Y2FzZSBQcm9tcHRzVHlwZS5hZ2VudDpcblx0XHRcdGlmICh0YXJnZXQgPT09IFRhcmdldC5DbGF1ZGUpIHtcblx0XHRcdFx0cmV0dXJuIGNsYXVkZUFnZW50QXR0cmlidXRlc1thdHRyaWJ1dGVOYW1lXTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjdXN0b21BZ2VudEF0dHJpYnV0ZXNbYXR0cmlidXRlTmFtZV07XG5cdFx0Y2FzZSBQcm9tcHRzVHlwZS5wcm9tcHQ6XG5cdFx0XHRyZXR1cm4gcHJvbXB0RmlsZUF0dHJpYnV0ZXNbYXR0cmlidXRlTmFtZV07XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuLy8gVGhlIGxpc3Qgb2YgdG9vbHMga25vd24gdG8gYmUgdXNlZCBieSBHaXRIdWIgQ29waWxvdCBjdXN0b20gYWdlbnRzXG5leHBvcnQgY29uc3Qga25vd25HaXRodWJDb3BpbG90VG9vbHMgPSBbXG5cdHsgbmFtZTogU3BlY2VkVG9vbEFsaWFzZXMuZXhlY3V0ZSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdnaXRodWJDb3BpbG90LmV4ZWN1dGUnLCAnRXhlY3V0ZSBjb21tYW5kcycpIH0sXG5cdHsgbmFtZTogU3BlY2VkVG9vbEFsaWFzZXMucmVhZCwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdnaXRodWJDb3BpbG90LnJlYWQnLCAnUmVhZCBmaWxlcycpIH0sXG5cdHsgbmFtZTogU3BlY2VkVG9vbEFsaWFzZXMuZWRpdCwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdnaXRodWJDb3BpbG90LmVkaXQnLCAnRWRpdCBmaWxlcycpIH0sXG5cdHsgbmFtZTogU3BlY2VkVG9vbEFsaWFzZXMuc2VhcmNoLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2dpdGh1YkNvcGlsb3Quc2VhcmNoJywgJ1NlYXJjaCBmaWxlcycpIH0sXG5cdHsgbmFtZTogU3BlY2VkVG9vbEFsaWFzZXMuYWdlbnQsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZ2l0aHViQ29waWxvdC5hZ2VudCcsICdVc2Ugc3ViYWdlbnRzJykgfSxcbl07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVZhbHVlRW50cnkge1xuXHRyZWFkb25seSBuYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY29uc3Qga25vd25DbGF1ZGVUb29scyA9IFtcblx0eyBuYW1lOiAnQmFzaCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLmJhc2gnLCAnRXhlY3V0ZSBzaGVsbCBjb21tYW5kcycpLCB0b29sRXF1aXZhbGVudDogW1NwZWNlZFRvb2xBbGlhc2VzLmV4ZWN1dGVdIH0sXG5cdHsgbmFtZTogJ0VkaXQnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5lZGl0JywgJ01ha2UgdGFyZ2V0ZWQgZmlsZSBlZGl0cycpLCB0b29sRXF1aXZhbGVudDogWydlZGl0L2VkaXROb3RlYm9vaycsICdlZGl0L2VkaXRGaWxlcyddIH0sXG5cdHsgbmFtZTogJ0dsb2InLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5nbG9iJywgJ0ZpbmQgZmlsZXMgYnkgcGF0dGVybicpLCB0b29sRXF1aXZhbGVudDogWydzZWFyY2gvZmlsZVNlYXJjaCddIH0sXG5cdHsgbmFtZTogJ0dyZXAnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5ncmVwJywgJ1NlYXJjaCBmaWxlIGNvbnRlbnRzIHdpdGggcmVnZXgnKSwgdG9vbEVxdWl2YWxlbnQ6IFsnc2VhcmNoL3RleHRTZWFyY2gnXSB9LFxuXHR7IG5hbWU6ICdSZWFkJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUucmVhZCcsICdSZWFkIGZpbGUgY29udGVudHMnKSwgdG9vbEVxdWl2YWxlbnQ6IFsncmVhZC9yZWFkRmlsZScsICdyZWFkL2dldE5vdGVib29rU3VtbWFyeSddIH0sXG5cdHsgbmFtZTogJ1dyaXRlJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUud3JpdGUnLCAnQ3JlYXRlL292ZXJ3cml0ZSBmaWxlcycpLCB0b29sRXF1aXZhbGVudDogWydlZGl0L2NyZWF0ZURpcmVjdG9yeScsICdlZGl0L2NyZWF0ZUZpbGUnLCAnZWRpdC9jcmVhdGVKdXB5dGVyTm90ZWJvb2snXSB9LFxuXHR7IG5hbWU6ICdXZWJGZXRjaCcsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLndlYkZldGNoJywgJ0ZldGNoIFVSTCBjb250ZW50JyksIHRvb2xFcXVpdmFsZW50OiBbU3BlY2VkVG9vbEFsaWFzZXMud2ViXSB9LFxuXHR7IG5hbWU6ICdXZWJTZWFyY2gnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS53ZWJTZWFyY2gnLCAnUGVyZm9ybSB3ZWIgc2VhcmNoZXMnKSwgdG9vbEVxdWl2YWxlbnQ6IFtTcGVjZWRUb29sQWxpYXNlcy53ZWJdIH0sXG5cdHsgbmFtZTogJ1Rhc2snLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS50YXNrJywgJ1J1biBzdWJhZ2VudHMgZm9yIGNvbXBsZXggdGFza3MnKSwgdG9vbEVxdWl2YWxlbnQ6IFtTcGVjZWRUb29sQWxpYXNlcy5hZ2VudF0gfSxcblx0eyBuYW1lOiAnU2tpbGwnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5za2lsbCcsICdFeGVjdXRlIHNraWxscycpLCB0b29sRXF1aXZhbGVudDogW10gfSxcblx0eyBuYW1lOiAnTFNQJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUubHNwJywgJ0NvZGUgaW50ZWxsaWdlbmNlIChyZXF1aXJlcyBwbHVnaW4pJyksIHRvb2xFcXVpdmFsZW50OiBbXSB9LFxuXHR7IG5hbWU6ICdOb3RlYm9va0VkaXQnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5ub3RlYm9va0VkaXQnLCAnTW9kaWZ5IEp1cHl0ZXIgbm90ZWJvb2tzJyksIHRvb2xFcXVpdmFsZW50OiBbJ2VkaXQvZWRpdE5vdGVib29rJ10gfSxcblx0eyBuYW1lOiAnQXNrVXNlclF1ZXN0aW9uJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUuYXNrVXNlclF1ZXN0aW9uJywgJ0FzayBtdWx0aXBsZS1jaG9pY2UgcXVlc3Rpb25zJyksIHRvb2xFcXVpdmFsZW50OiBbJ3ZzY29kZS9hc2tRdWVzdGlvbnMnXSB9LFxuXHR7IG5hbWU6ICdNQ1BTZWFyY2gnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5tY3BTZWFyY2gnLCAnU2VhcmNoZXMgZm9yIE1DUCB0b29scyB3aGVuIHRvb2wgc2VhcmNoIGlzIGVuYWJsZWQnKSwgdG9vbEVxdWl2YWxlbnQ6IFtdIH1cbl07XG5cbmV4cG9ydCBjb25zdCBrbm93bkNsYXVkZU1vZGVscyA9IFtcblx0eyBuYW1lOiAnc29ubmV0JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUuc29ubmV0JywgJ0xhdGVzdCBDbGF1ZGUgU29ubmV0JyksIG1vZGVsRXF1aXZhbGVudDogJ0NsYXVkZSBTb25uZXQgNC41IChjb3BpbG90KScgfSxcblx0eyBuYW1lOiAnb3B1cycsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLm9wdXMnLCAnTGF0ZXN0IENsYXVkZSBPcHVzJyksIG1vZGVsRXF1aXZhbGVudDogJ0NsYXVkZSBPcHVzIDQuNiAoY29waWxvdCknIH0sXG5cdHsgbmFtZTogJ2hhaWt1JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUuaGFpa3UnLCAnTGF0ZXN0IENsYXVkZSBIYWlrdSwgZmFzdCBmb3Igc2ltcGxlIHRhc2tzJyksIG1vZGVsRXF1aXZhbGVudDogJ0NsYXVkZSBIYWlrdSA0LjUgKGNvcGlsb3QpJyB9LFxuXHR7IG5hbWU6ICdpbmhlcml0JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUuaW5oZXJpdCcsICdJbmhlcml0IG1vZGVsIGZyb20gcGFyZW50IGFnZW50IG9yIHByb21wdCcpLCBtb2RlbEVxdWl2YWxlbnQ6IHVuZGVmaW5lZCB9LFxuXTtcblxuZXhwb3J0IGZ1bmN0aW9uIG1hcENsYXVkZU1vZGVscyhjbGF1ZGVNb2RlbE5hbWVzOiByZWFkb25seSBzdHJpbmdbXSk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0Y29uc3QgcmVzdWx0ID0gW107XG5cdGZvciAoY29uc3QgbmFtZSBvZiBjbGF1ZGVNb2RlbE5hbWVzKSB7XG5cdFx0Y29uc3QgY2xhdWRlTW9kZWwgPSBrbm93bkNsYXVkZU1vZGVscy5maW5kKG1vZGVsID0+IG1vZGVsLm5hbWUgPT09IG5hbWUpO1xuXHRcdGlmIChjbGF1ZGVNb2RlbCAmJiBjbGF1ZGVNb2RlbC5tb2RlbEVxdWl2YWxlbnQpIHtcblx0XHRcdHJlc3VsdC5wdXNoKGNsYXVkZU1vZGVsLm1vZGVsRXF1aXZhbGVudCk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogTWFwcyBDbGF1ZGUgdG9vbCBuYW1lcyB0byB0aGVpciBWUyBDb2RlIHRvb2wgZXF1aXZhbGVudHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXBDbGF1ZGVUb29scyhjbGF1ZGVUb29sTmFtZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nW10ge1xuXHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdGZvciAoY29uc3QgbmFtZSBvZiBjbGF1ZGVUb29sTmFtZXMpIHtcblx0XHRjb25zdCBjbGF1ZGVUb29sID0ga25vd25DbGF1ZGVUb29scy5maW5kKHRvb2wgPT4gdG9vbC5uYW1lID09PSBuYW1lKTtcblx0XHRpZiAoY2xhdWRlVG9vbCkge1xuXHRcdFx0cmVzdWx0LnB1c2goLi4uY2xhdWRlVG9vbC50b29sRXF1aXZhbGVudCk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCBjb25zdCBjbGF1ZGVBZ2VudEF0dHJpYnV0ZXM6IFJlY29yZDxzdHJpbmcsIElBdHRyaWJ1dGVEZWZpbml0aW9uPiA9IHtcblx0J25hbWUnOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdHRyaWJ1dGUubmFtZScsIFwiVW5pcXVlIGlkZW50aWZpZXIgdXNpbmcgbG93ZXJjYXNlIGxldHRlcnMgYW5kIGh5cGhlbnMgKHJlcXVpcmVkKVwiKSxcblx0fSxcblx0J2Rlc2NyaXB0aW9uJzoge1xuXHRcdHR5cGU6ICdzY2FsYXInLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLmRlc2NyaXB0aW9uJywgXCJXaGVuIHRvIGRlbGVnYXRlIHRvIHRoaXMgc3ViYWdlbnQgKHJlcXVpcmVkKVwiKSxcblx0fSxcblx0J3Rvb2xzJzoge1xuXHRcdHR5cGU6ICdzZXF1ZW5jZScsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdHRyaWJ1dGUudG9vbHMnLCBcIkFycmF5IG9mIHRvb2xzIHRoZSBzdWJhZ2VudCBjYW4gdXNlLiBJbmhlcml0cyBhbGwgdG9vbHMgaWYgb21pdHRlZFwiKSxcblx0XHRkZWZhdWx0czogWydSZWFkLCBFZGl0LCBCYXNoJ10sXG5cdFx0aXRlbXM6IGtub3duQ2xhdWRlVG9vbHNcblx0fSxcblx0J2Rpc2FsbG93ZWRUb29scyc6IHtcblx0XHR0eXBlOiAnc2VxdWVuY2UnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLmRpc2FsbG93ZWRUb29scycsIFwiVG9vbHMgdG8gZGVueSwgcmVtb3ZlZCBmcm9tIGluaGVyaXRlZCBvciBzcGVjaWZpZWQgbGlzdFwiKSxcblx0XHRkZWZhdWx0czogWydXcml0ZSwgRWRpdCwgQmFzaCddLFxuXHRcdGl0ZW1zOiBrbm93bkNsYXVkZVRvb2xzXG5cdH0sXG5cdCdtb2RlbCc6IHtcblx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F0dHJpYnV0ZS5tb2RlbCcsIFwiTW9kZWwgdG8gdXNlOiBzb25uZXQsIG9wdXMsIGhhaWt1LCBvciBpbmhlcml0LiBEZWZhdWx0cyB0byBpbmhlcml0LlwiKSxcblx0XHRkZWZhdWx0czogWydzb25uZXQnLCAnb3B1cycsICdoYWlrdScsICdpbmhlcml0J10sXG5cdFx0ZW51bXM6IGtub3duQ2xhdWRlTW9kZWxzXG5cdH0sXG5cdCdwZXJtaXNzaW9uTW9kZSc6IHtcblx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F0dHJpYnV0ZS5wZXJtaXNzaW9uTW9kZScsIFwiUGVybWlzc2lvbiBtb2RlOiBkZWZhdWx0LCBhY2NlcHRFZGl0cywgZG9udEFzaywgYnlwYXNzUGVybWlzc2lvbnMsIG9yIHBsYW4uXCIpLFxuXHRcdGRlZmF1bHRzOiBbJ2RlZmF1bHQnLCAnYWNjZXB0RWRpdHMnLCAnZG9udEFzaycsICdieXBhc3NQZXJtaXNzaW9ucycsICdwbGFuJ10sXG5cdFx0ZW51bXM6IFtcblx0XHRcdHsgbmFtZTogJ2RlZmF1bHQnLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5wZXJtaXNzaW9uTW9kZS5kZWZhdWx0JywgJ1N0YW5kYXJkIGJlaGF2aW9yOiBwcm9tcHRzIGZvciBwZXJtaXNzaW9uIG9uIGZpcnN0IHVzZSBvZiBlYWNoIHRvb2wuJykgfSxcblx0XHRcdHsgbmFtZTogJ2FjY2VwdEVkaXRzJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUucGVybWlzc2lvbk1vZGUuYWNjZXB0RWRpdHMnLCAnQXV0b21hdGljYWxseSBhY2NlcHRzIGZpbGUgZWRpdCBwZXJtaXNzaW9ucyBmb3IgdGhlIHNlc3Npb24uJykgfSxcblx0XHRcdHsgbmFtZTogJ3BsYW4nLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5wZXJtaXNzaW9uTW9kZS5wbGFuJywgJ1BsYW4gTW9kZTogQ2xhdWRlIGNhbiBhbmFseXplIGJ1dCBub3QgbW9kaWZ5IGZpbGVzIG9yIGV4ZWN1dGUgY29tbWFuZHMuJykgfSxcblx0XHRcdHsgbmFtZTogJ2RlbGVnYXRlJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUucGVybWlzc2lvbk1vZGUuZGVsZWdhdGUnLCAnQ29vcmRpbmF0aW9uLW9ubHkgbW9kZSBmb3IgYWdlbnQgdGVhbSBsZWFkcy4gT25seSBhdmFpbGFibGUgd2hlbiBhbiBhZ2VudCB0ZWFtIGlzIGFjdGl2ZS4nKSB9LFxuXHRcdFx0eyBuYW1lOiAnZG9udEFzaycsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLnBlcm1pc3Npb25Nb2RlLmRvbnRBc2snLCAnQXV0by1kZW5pZXMgdG9vbHMgdW5sZXNzIHByZS1hcHByb3ZlZCB2aWEgL3Blcm1pc3Npb25zIG9yIHBlcm1pc3Npb25zLmFsbG93IHJ1bGVzLicpIH0sXG5cdFx0XHR7IG5hbWU6ICdieXBhc3NQZXJtaXNzaW9ucycsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xhdWRlLnBlcm1pc3Npb25Nb2RlLmJ5cGFzc1Blcm1pc3Npb25zJywgJ1NraXBzIGFsbCBwZXJtaXNzaW9uIHByb21wdHMgKHJlcXVpcmVzIHNhZmUgZW52aXJvbm1lbnQgbGlrZSBjb250YWluZXJzKS4nKSB9XG5cdFx0XVxuXHR9LFxuXHQnc2tpbGxzJzoge1xuXHRcdHR5cGU6ICdzZXF1ZW5jZScsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdHRyaWJ1dGUuc2tpbGxzJywgXCJTa2lsbHMgdG8gbG9hZCBpbnRvIHRoZSBzdWJhZ2VudCdzIGNvbnRleHQgYXQgc3RhcnR1cC5cIiksXG5cdH0sXG5cdCdtY3BTZXJ2ZXJzJzoge1xuXHRcdHR5cGU6ICdzZXF1ZW5jZScsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdHRyaWJ1dGUubWNwU2VydmVycycsIFwiTUNQIHNlcnZlcnMgYXZhaWxhYmxlIHRvIHRoaXMgc3ViYWdlbnQuXCIpLFxuXHR9LFxuXHQnaG9va3MnOiB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdHRyaWJ1dGUuaG9va3MnLCBcIkxpZmVjeWNsZSBob29rcyBzY29wZWQgdG8gdGhpcyBzdWJhZ2VudC5cIiksXG5cdH0sXG5cdCdtZW1vcnknOiB7XG5cdFx0dHlwZTogJ3NjYWxhcicsXG5cdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdHRyaWJ1dGUubWVtb3J5JywgXCJQZXJzaXN0ZW50IG1lbW9yeSBzY29wZTogdXNlciwgcHJvamVjdCwgb3IgbG9jYWwuIEVuYWJsZXMgY3Jvc3Mtc2Vzc2lvbiBsZWFybmluZy5cIiksXG5cdFx0ZGVmYXVsdHM6IFsndXNlcicsICdwcm9qZWN0JywgJ2xvY2FsJ10sXG5cdFx0ZW51bXM6IFtcblx0XHRcdHsgbmFtZTogJ3VzZXInLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NsYXVkZS5tZW1vcnkudXNlcicsIFwiUmVtZW1iZXIgbGVhcm5pbmdzIGFjcm9zcyBhbGwgcHJvamVjdHMuXCIpIH0sXG5cdFx0XHR7IG5hbWU6ICdwcm9qZWN0JywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUubWVtb3J5LnByb2plY3QnLCBcIlRoZSBzdWJhZ2VudCdzIGtub3dsZWRnZSBpcyBwcm9qZWN0LXNwZWNpZmljIGFuZCBzaGFyZWFibGUgdmlhIHZlcnNpb24gY29udHJvbC5cIikgfSxcblx0XHRcdHsgbmFtZTogJ2xvY2FsJywgZGVzY3JpcHRpb246IGxvY2FsaXplKCdjbGF1ZGUubWVtb3J5LmxvY2FsJywgXCJUaGUgc3ViYWdlbnQncyBrbm93bGVkZ2UgaXMgcHJvamVjdC1zcGVjaWZpYyBidXQgc2hvdWxkIG5vdCBiZSBjaGVja2VkIGludG8gdmVyc2lvbiBjb250cm9sLlwiKSB9XG5cdFx0XVxuXHR9XG59O1xuXG4vKipcbiAqIEF0dHJpYnV0ZXMgc3VwcG9ydGVkIGluIENsYXVkZSBydWxlcyBmaWxlcyAoYC5jbGF1ZGUvcnVsZXMvKi5tZGApLlxuICogQ2xhdWRlIHJ1bGVzIHVzZSBgcGF0aHNgIGluc3RlYWQgb2YgYGFwcGx5VG9gIGZvciBnbG9iIHBhdHRlcm5zLlxuICovXG5leHBvcnQgY29uc3QgY2xhdWRlUnVsZXNBdHRyaWJ1dGVzOiBSZWNvcmQ8c3RyaW5nLCBJQXR0cmlidXRlRGVmaW5pdGlvbj4gPSB7XG5cdCdkZXNjcmlwdGlvbic6IHtcblx0XHR0eXBlOiAnc2NhbGFyJyxcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2F0dHJpYnV0ZS5ydWxlcy5kZXNjcmlwdGlvbicsIFwiQSBkZXNjcmlwdGlvbiBvZiB3aGF0IHRoaXMgcnVsZSBjb3ZlcnMsIHVzZWQgdG8gcHJvdmlkZSBjb250ZXh0IGFib3V0IHdoZW4gaXQgYXBwbGllcy5cIiksXG5cdH0sXG5cdCdwYXRocyc6IHtcblx0XHR0eXBlOiAnc2VxdWVuY2UnLFxuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYXR0cmlidXRlLnJ1bGVzLnBhdGhzJywgXCJBcnJheSBvZiBnbG9iIHBhdHRlcm5zIHRoYXQgZGVzY3JpYmUgZm9yIHdoaWNoIGZpbGVzIHRoZSBydWxlIGFwcGxpZXMuIEJhc2VkIG9uIHRoZXNlIHBhdHRlcm5zLCB0aGUgZmlsZSBpcyBhdXRvbWF0aWNhbGx5IGluY2x1ZGVkIGluIHRoZSBwcm9tcHQgd2hlbiB0aGUgY29udGV4dCBjb250YWlucyBhIGZpbGUgdGhhdCBtYXRjaGVzLlxcbkV4YW1wbGU6IGBbJ3NyYy8qKi8qLnRzJywgJ3Rlc3QvKionXWBcIiksXG5cdH0sXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gaXNWU0NvZGVPckRlZmF1bHRUYXJnZXQodGFyZ2V0OiBUYXJnZXQpOiBib29sZWFuIHtcblx0cmV0dXJuIHRhcmdldCA9PT0gVGFyZ2V0LlZTQ29kZSB8fCB0YXJnZXQgPT09IFRhcmdldC5VbmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRUYXJnZXQocHJvbXB0VHlwZTogUHJvbXB0c1R5cGUsIGhlYWRlcjogUHJvbXB0SGVhZGVyIHwgVVJJKTogVGFyZ2V0IHtcblx0Y29uc3QgdXJpID0gaGVhZGVyIGluc3RhbmNlb2YgVVJJID8gaGVhZGVyIDogaGVhZGVyLnVyaTtcblx0aWYgKHByb21wdFR5cGUgPT09IFByb21wdHNUeXBlLmFnZW50KSB7XG5cdFx0Y29uc3QgcGFyZW50RGlyID0gZGlybmFtZSh1cmkpO1xuXHRcdGlmIChwYXJlbnREaXIucGF0aC5lbmRzV2l0aChgLyR7Q0xBVURFX0FHRU5UU19TT1VSQ0VfRk9MREVSfWApKSB7XG5cdFx0XHRyZXR1cm4gVGFyZ2V0LkNsYXVkZTtcblx0XHR9XG5cdFx0aWYgKCEoaGVhZGVyIGluc3RhbmNlb2YgVVJJKSkge1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gaGVhZGVyLnRhcmdldDtcblx0XHRcdGlmICh0YXJnZXQgPT09IFRhcmdldC5HaXRIdWJDb3BpbG90IHx8IHRhcmdldCA9PT0gVGFyZ2V0LlZTQ29kZSkge1xuXHRcdFx0XHRyZXR1cm4gdGFyZ2V0O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gVGFyZ2V0LlVuZGVmaW5lZDtcblx0fSBlbHNlIGlmIChwcm9tcHRUeXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpIHtcblx0XHRpZiAoaXNJbkNsYXVkZVJ1bGVzRm9sZGVyKHVyaSkpIHtcblx0XHRcdHJldHVybiBUYXJnZXQuQ2xhdWRlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gVGFyZ2V0LlVuZGVmaW5lZDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkIsNkJBQTZCO0FBQ25FLFNBQXVCLDhCQUE4QjtBQUNyRCxTQUFTLGFBQWEsY0FBYztBQUU3QixJQUFVO0FBQUEsQ0FBVixDQUFVQSxrQ0FBVjtBQUNDLEVBQU1BLDhCQUFBLGFBQWE7QUFDbkIsRUFBTUEsOEJBQUEsU0FBUztBQUFBLEdBRk47QUFLVixJQUFVO0FBQUEsQ0FBVixDQUFVQyw0QkFBVjtBQUNDLEVBQU1BLHdCQUFBLGtCQUFrQjtBQUFBLEdBRGY7QUFJVixTQUFTLFNBQVMsT0FBaUM7QUFDekQsU0FBTyxVQUFVLE9BQU8sVUFBVSxVQUFVLE9BQU8saUJBQWlCLFVBQVUsT0FBTyxVQUFVLFVBQVUsT0FBTztBQUNqSDtBQVdBLE1BQU0sNkJBQXFEO0FBQUEsRUFDMUQsRUFBRSxNQUFNLE9BQU87QUFBQSxFQUNmLEVBQUUsTUFBTSxRQUFRO0FBQ2pCO0FBRUEsTUFBTSw0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QUFBLEVBQzlJO0FBQUEsRUFDQSxTQUFTO0FBQUEsSUFDUixNQUFNO0FBQUEsSUFDTixhQUFhLFNBQVMseUJBQXlCLHdPQUF3TztBQUFBLEVBQ3hSO0FBQ0Q7QUFFTyxTQUFTLHdCQUF3QixRQUF5QjtBQUNoRSxTQUFPLFdBQVcsT0FBTyxVQUFVLFdBQVcsT0FBTztBQUN0RDtBQUVPLFNBQVMsVUFBVSxZQUF5QixRQUFvQztBQUN0RixRQUFNLE1BQU0sa0JBQWtCLE1BQU0sU0FBUyxPQUFPO0FBQ3BELE1BQUksZUFBZSxZQUFZLE9BQU87QUFDckMsVUFBTSxZQUFZLFFBQVEsR0FBRztBQUM3QixRQUFJLFVBQVUsS0FBSyxTQUFTLElBQUksMkJBQTJCLEVBQUUsR0FBRztBQUMvRCxhQUFPLE9BQU87QUFBQSxJQUNmO0FBQ0EsUUFBSSxFQUFFLGtCQUFrQixNQUFNO0FBQzdCLFlBQU0sU0FBUyxPQUFPO0FBQ3RCLFVBQUksV0FBVyxPQUFPLGlCQUFpQixXQUFXLE9BQU8sUUFBUTtBQUNoRSxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFDQSxXQUFPLE9BQU87QUFBQSxFQUNmLFdBQVcsZUFBZSxZQUFZLGNBQWM7QUFDbkQsUUFBSSxzQkFBc0IsR0FBRyxHQUFHO0FBQy9CLGFBQU8sT0FBTztBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBQ0EsU0FBTyxPQUFPO0FBQ2Y7IiwKICAibmFtZXMiOiBbIkdpdGh1YlByb21wdEhlYWRlckF0dHJpYnV0ZXMiLCAiQ2xhdWRlSGVhZGVyQXR0cmlidXRlcyJdCn0K
