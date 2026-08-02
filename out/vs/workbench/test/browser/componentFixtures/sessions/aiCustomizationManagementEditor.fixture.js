import * as DOM from "../../../../../base/browser/dom.js";
import { Dimension } from "../../../../../base/browser/dom.js";
import { mainWindow } from "../../../../../base/browser/window.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { ResourceMap, ResourceSet } from "../../../../../base/common/map.js";
import { constObservable, derived, observableValue } from "../../../../../base/common/observable.js";
import { dirname as dirnameUri } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { PluginFormat } from "../../../../../platform/agentPlugins/common/pluginParsers.js";
import { IListService, ListService } from "../../../../../platform/list/browser/listService.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IRequestService } from "../../../../../platform/request/common/request.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../../platform/workspace/common/workspace.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { IViewsService } from "../../../../services/views/common/viewsService.js";
import { IChatWidgetService } from "../../../../contrib/chat/browser/chat.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { IPathService } from "../../../../services/path/common/pathService.js";
import { IOutputService } from "../../../../services/output/common/output.js";
import { IWorkingCopyService } from "../../../../services/workingCopy/common/workingCopyService.js";
import { IWebviewService } from "../../../../contrib/webview/browser/webview.js";
import { IAICustomizationWorkspaceService, AICustomizationManagementSection } from "../../../../contrib/chat/common/aiCustomizationWorkspaceService.js";
import { ICustomizationHarnessService, createVSCodeHarnessDescriptor } from "../../../../contrib/chat/common/customizationHarnessService.js";
import { IChatSessionsService } from "../../../../contrib/chat/common/chatSessionsService.js";
import { getChatSessionType, LocalChatSessionUri } from "../../../../contrib/chat/common/model/chatUri.js";
import { IPromptsService, AgentInstructionFileType, PromptsStorage } from "../../../../contrib/chat/common/promptSyntax/service/promptsService.js";
import { PromptFileParser } from "../../../../contrib/chat/common/promptSyntax/promptFileParser.js";
import { PromptFileSource, PromptsType } from "../../../../contrib/chat/common/promptSyntax/promptTypes.js";
import { IAgentPluginService } from "../../../../contrib/chat/common/plugins/agentPluginService.js";
import { IPluginMarketplaceService, MarketplaceType, PluginSourceKind } from "../../../../contrib/chat/common/plugins/pluginMarketplaceService.js";
import { MarketplaceReferenceKind } from "../../../../contrib/chat/common/plugins/marketplaceReference.js";
import { IPluginInstallService } from "../../../../contrib/chat/common/plugins/pluginInstallService.js";
import { AICustomizationManagementEditor } from "../../../../contrib/chat/browser/aiCustomization/aiCustomizationManagementEditor.js";
import { AICustomizationItemsModel, IAICustomizationItemsModel } from "../../../../contrib/chat/browser/aiCustomization/aiCustomizationItemsModel.js";
import { EmbeddedMcpServerDetail } from "../../../../contrib/chat/browser/aiCustomization/embeddedMcpServerDetail.js";
import { EmbeddedAgentPluginDetail } from "../../../../contrib/chat/browser/aiCustomization/embeddedAgentPluginDetail.js";
import { AgentPluginItemKind } from "../../../../contrib/chat/browser/agentPluginEditor/agentPluginItems.js";
import { ContributionEnablementState } from "../../../../contrib/chat/common/enablement.js";
import { AICustomizationManagementEditorInput } from "../../../../contrib/chat/browser/aiCustomization/aiCustomizationManagementEditorInput.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { mcpAccessConfig, McpAccessValue } from "../../../../../platform/mcp/common/mcpManagement.js";
import { McpServerType } from "../../../../../platform/mcp/common/mcpPlatformTypes.js";
import { ChatConfiguration } from "../../../../contrib/chat/common/constants.js";
import { IAutomationDialogService } from "../../../../contrib/chat/common/automations/automationDialogService.js";
import { IAutomationRunner } from "../../../../contrib/chat/common/automations/automationRunner.js";
import { IAutomationService } from "../../../../contrib/chat/common/automations/automationService.js";
import { CHAT_AUTOMATIONS_ENABLED_SETTING } from "../../../../contrib/chat/common/automations/automationsEnabled.js";
import { IMcpWorkbenchService, IMcpService, McpConnectionState, McpServerInstallState } from "../../../../contrib/mcp/common/mcpTypes.js";
import { IMcpRegistry } from "../../../../contrib/mcp/common/mcpRegistryTypes.js";
import { LocalMcpServerScope } from "../../../../services/mcp/common/mcpWorkbenchManagementService.js";
import { McpListWidget } from "../../../../contrib/chat/browser/aiCustomization/mcpListWidget.js";
import { PluginListWidget } from "../../../../contrib/chat/browser/aiCustomization/pluginListWidget.js";
import { IAgentHostCustomizationService } from "../../../../contrib/chat/browser/agentSessions/agentHost/agentHostCustomizationService.js";
import { McpAuthRequiredReason, McpServerStatus } from "../../../../../platform/agentHost/common/state/protocol/state.js";
import { IAgentFeedbackService } from "../../../../../sessions/contrib/agentFeedback/browser/agentFeedbackService.js";
import { ICodeReviewService } from "../../../../../sessions/contrib/codeReview/browser/codeReviewService.js";
import { createMockCodeReviewService } from "./mockCodeReviewService.js";
import { IChatEditingService } from "../../../../contrib/chat/common/editing/chatEditingService.js";
import { IAgentSessionsService } from "../../../../contrib/chat/browser/agentSessions/agentSessionsService.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../fixtureUtils.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import "../../../../../platform/theme/common/colors/inputColors.js";
import "../../../../../platform/theme/common/colors/listColors.js";
import "../../../../contrib/chat/browser/aiCustomization/media/aiCustomizationManagement.css";
const userHome = URI.file("/home/dev");
const BUILTIN_STORAGE = "builtin";
function createMockEditorGroup() {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.windowId = mainWindow.vscodeWindowId;
    }
  }();
}
function createMockAICustomizationItemsModel() {
  const itemSource = new class extends mock() {
    constructor() {
      super(...arguments);
      this.sessionResource = LocalChatSessionUri.getNewSessionUri();
      this.onDidAICustomizationItemsChange = Event.None;
    }
    async fetchProviderItems() {
      return [];
    }
    async fetchAICustomizationItems(_promptType) {
      return [];
    }
    async fetchSourceFolders(_promptType) {
      return [];
    }
  }();
  return new class extends mock() {
    getItems(_section) {
      return constObservable([]);
    }
    getActiveItemSource() {
      return itemSource;
    }
    getCount(_section) {
      return constObservable(0);
    }
    getPluginCount() {
      return constObservable(0);
    }
    async whenSectionLoaded(_section) {
    }
  }();
}
function mcpLifecycleNoop() {
  return Promise.resolve();
}
function createMockAgentHostCustomizationService(mcpServers = []) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeCustomAgents = Event.None;
      this.onDidChangeCustomizations = Event.None;
    }
    getCustomAgents() {
      return [];
    }
    getCustomizations() {
      return [];
    }
    getWorkingDirectory() {
      return void 0;
    }
    getWorkingDirectories() {
      return [];
    }
    getMcpServers() {
      return mcpServers;
    }
    addMcpServer() {
    }
    async authenticateMcpServer() {
      return true;
    }
  }();
}
function createFixtureAgentHostItemProvider(files) {
  return {
    onDidChange: Event.None,
    async provideChatSessionCustomizations() {
      return files.map((file) => ({
        uri: file.uri,
        type: file.type,
        name: file.name ?? "",
        description: file.description,
        source: file.storage,
        extensionId: file.extensionId,
        pluginUri: void 0
      }));
    }
  };
}
function toExtensionInfo(file) {
  if (!file.extensionId) {
    return void 0;
  }
  return {
    identifier: new ExtensionIdentifier(file.extensionId),
    displayName: file.extensionDisplayName
  };
}
function createFixtureFileContent(file) {
  if (file.type === PromptsType.hook) {
    return JSON.stringify({
      name: file.name,
      description: file.description,
      command: "npm test"
    }, null, 2);
  }
  const headerLines = [
    "---",
    `description: ${JSON.stringify(file.description ?? `${file.name ?? "Customization"} description`)}`
  ];
  if (file.type === PromptsType.instructions && file.applyTo) {
    headerLines.push(`applyTo: ${JSON.stringify(file.applyTo)}`);
  }
  if (file.type === PromptsType.agent) {
    headerLines.push("tools:");
    headerLines.push("  - read_file");
    headerLines.push("  - grep_search");
  }
  if (file.type === PromptsType.skill) {
    headerLines.push(`input: ${JSON.stringify("Code review findings")}`);
  }
  if (file.type === PromptsType.prompt) {
    headerLines.push(`argument-hint: ${JSON.stringify("Paste the failing stack trace")}`);
  }
  headerLines.push("---", "");
  return `${headerLines.join("\n")}## Overview

Use **${file.name ?? "this customization"}** when you need consistent AI guidance.

- Review the active change
- Preserve existing conventions
- Explain the reasoning clearly

\`\`\`ts
const ready = true;
\`\`\`
`;
}
function createInstructionFileContent(file) {
  return `---
description: ${JSON.stringify("Repository-level instructions")}
applyTo: ${JSON.stringify("**/*")}
---

## Overview

These instructions apply across the workspace.
`;
}
function createFixtureContentMap(files, instructions) {
  const contents = new ResourceMap();
  for (const file of files) {
    contents.set(file.uri, createFixtureFileContent(file));
  }
  for (const file of instructions) {
    contents.set(file.uri, createInstructionFileContent(file));
  }
  return contents;
}
function createFixtureFileContentStat(resource, value) {
  return {
    resource,
    name: "",
    mtime: 0,
    ctime: 0,
    etag: "",
    size: value.length,
    readonly: false,
    locked: false,
    executable: false,
    value: VSBuffer.fromString(value)
  };
}
function createFixtureFileStat(resource, size, isDirectory) {
  return {
    resource,
    name: "",
    mtime: 0,
    ctime: 0,
    etag: "",
    size,
    readonly: false,
    locked: false,
    executable: false,
    isFile: !isDirectory,
    isDirectory,
    isSymbolicLink: false,
    children: void 0
  };
}
function createMockPromptsService(files, agentInstructions2, contents, onDidChangeFiles) {
  const parser = new PromptFileParser();
  const skillSourceFolders = [
    { uri: URI.file("/workspace/.agents/skills"), searchRoot: URI.file("/workspace/.agents/skills"), filePattern: void 0, source: PromptFileSource.AgentsWorkspace, storage: PromptsStorage.local },
    { uri: URI.file("/workspace/.github/skills"), searchRoot: URI.file("/workspace/.github/skills"), filePattern: void 0, source: PromptFileSource.GitHubWorkspace, storage: PromptsStorage.local },
    { uri: URI.file("/workspace/.claude/skills"), searchRoot: URI.file("/workspace/.claude/skills"), filePattern: void 0, source: PromptFileSource.ClaudeWorkspace, storage: PromptsStorage.local },
    { uri: URI.file("/home/dev/.agents/skills"), searchRoot: URI.file("/home/dev/.agents/skills"), filePattern: void 0, source: PromptFileSource.AgentsPersonal, storage: PromptsStorage.user },
    { uri: URI.file("/home/dev/.copilot/skills"), searchRoot: URI.file("/home/dev/.copilot/skills"), filePattern: void 0, source: PromptFileSource.CopilotPersonal, storage: PromptsStorage.user },
    { uri: URI.file("/home/dev/.claude/skills"), searchRoot: URI.file("/home/dev/.claude/skills"), filePattern: void 0, source: PromptFileSource.ClaudePersonal, storage: PromptsStorage.user }
  ];
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeCustomAgents = Event.None;
      this.onDidChangeSlashCommands = onDidChangeFiles;
      this.onDidChangeSkills = onDidChangeFiles;
      this.onDidChangeInstructions = Event.None;
      this.onDidChangeAgentInstructions = Event.None;
      this.onDidChangeHooks = Event.None;
    }
    getDisabledPromptFiles() {
      return new ResourceSet();
    }
    getPromptLocationLabel() {
      return "";
    }
    async listPromptFiles(type, _token) {
      return files.filter((f) => f.type === type).map((f) => ({
        uri: f.uri,
        storage: f.storage,
        type: f.type,
        name: f.name,
        description: f.description,
        extension: toExtensionInfo(f)
      }));
    }
    async listAgentInstructions() {
      return agentInstructions2;
    }
    async listPromptFilesForStorage(type, storage, _token) {
      return files.filter((f) => f.type === type && f.storage === storage).map((f) => ({
        uri: f.uri,
        storage: f.storage,
        type: f.type,
        name: f.name,
        description: f.description,
        extension: toExtensionInfo(f)
      }));
    }
    async getCustomAgents() {
      return files.filter((f) => f.type === PromptsType.agent).map((a) => ({
        uri: a.uri,
        name: a.name ?? "agent",
        description: a.description,
        storage: a.storage,
        source: {
          storage: a.storage,
          extensionId: a.extensionId ? new ExtensionIdentifier(a.extensionId) : void 0
        },
        visibility: { userInvocable: true, agentInvocable: true }
      }));
    }
    async parseNew(uri, _token) {
      return parser.parse(uri, contents.get(uri) ?? "");
    }
    getParsedPromptFile(model) {
      return parser.parse(model.uri, model.getValue());
    }
    async getSourceFolders() {
      return [];
    }
    async getResolvedSourceFolders(type) {
      if (type === PromptsType.skill) {
        return skillSourceFolders;
      }
      return [];
    }
    async getInstructionFiles() {
      return files.filter((f) => f.type === PromptsType.instructions).map((f) => ({
        uri: f.uri,
        name: f.name ?? "",
        description: f.description,
        storage: f.storage,
        pattern: f.applyTo,
        extension: toExtensionInfo(f)
      }));
    }
    async findAgentSkills() {
      return files.filter((f) => f.type === PromptsType.skill).map((f) => ({
        uri: f.uri,
        storage: f.storage,
        name: f.name ?? "skill",
        description: f.description,
        disableModelInvocation: false,
        userInvocable: true
      }));
    }
    async getPromptSlashCommands() {
      const promptFiles = files.filter((f) => f.type === PromptsType.prompt);
      const commands = await Promise.all(promptFiles.map(async (f) => {
        return {
          uri: f.uri,
          userInvocable: true,
          name: f.name ?? "prompt",
          description: f.description,
          argumentHint: void 0,
          type: f.type,
          storage: f.storage,
          source: void 0,
          extension: toExtensionInfo(f)
        };
      }));
      return commands;
    }
  }();
}
function createMockHarnessService(sessionResource, descriptors) {
  const activeSessionResource = observableValue("activeSessionResource", sessionResource);
  const activeHarness = derived((reader) => getChatSessionType(activeSessionResource.read(reader)));
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.activeSessionResource = activeSessionResource;
      this.activeHarness = activeHarness;
      this.availableHarnesses = constObservable(descriptors);
    }
    findHarnessById(id) {
      return descriptors.find((h) => h.id === id);
    }
    getActiveDescriptor() {
      return descriptors.find((h) => h.id === activeHarness.get()) ?? descriptors[0];
    }
    setActiveSession(sessionResource2) {
      activeSessionResource.set(sessionResource2, void 0);
    }
    registerExternalHarness() {
      return { dispose() {
      } };
    }
  }();
}
function makeLocalMcpServer(id, label, scope, description, config) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.id = id;
      this.name = id;
      this.label = label;
      this.description = description ?? "";
      this.config = config;
      this.installState = McpServerInstallState.Installed;
      this.local = new class extends mock() {
        constructor() {
          super(...arguments);
          this.id = id;
          this.scope = scope;
        }
      }();
    }
  }();
}
function createMockAgentFeedbackService() {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeFeedback = Event.None;
      this.onDidChangeNavigation = Event.None;
      this.onDidChangeFeedbackScope = Event.None;
      this.onDidAddFeedback = Event.None;
      this.onDidConvertFeedback = Event.None;
      this.onDidAddReply = Event.None;
      this.onDidSubmitFeedback = Event.None;
    }
    getFeedback() {
      return [];
    }
    getSessionForFile() {
      return void 0;
    }
    getFeedbackSessionResource() {
      return void 0;
    }
    getMostRecentSessionForResource() {
      return void 0;
    }
    async revealFeedback() {
    }
    getNextFeedback() {
      return void 0;
    }
    getNavigationBearing() {
      return { activeIdx: -1, totalCount: 0 };
    }
    getNextNavigableItem() {
      return void 0;
    }
    setNavigationAnchor() {
    }
    clearFeedback() {
    }
    removeFeedback() {
    }
    async addFeedbackAndSubmit() {
    }
  }();
}
const allFiles = [
  // Instructions - extension (built-in + third-party)
  { uri: URI.file("/extensions/github.copilot-chat/instructions/coding.instructions.md"), storage: PromptsStorage.extension, type: PromptsType.instructions, name: "Copilot Coding", description: "Built-in coding guidance", extensionId: "GitHub.copilot-chat", extensionDisplayName: "GitHub Copilot Chat" },
  { uri: URI.file("/extensions/acme.tools/instructions/team.instructions.md"), storage: PromptsStorage.extension, type: PromptsType.instructions, name: "Team Conventions", description: "Third-party extension instructions", extensionId: "acme.tools", extensionDisplayName: "Acme Tools" },
  // Instructions — workspace
  { uri: URI.file("/workspace/.github/instructions/coding-standards.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Coding Standards", description: "Repository-wide coding standards" },
  { uri: URI.file("/workspace/.github/instructions/testing.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Testing", description: "Testing best practices", applyTo: "**/*.test.ts" },
  { uri: URI.file("/workspace/.github/instructions/security.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Security", description: "Security review checklist", applyTo: "src/auth/**" },
  { uri: URI.file("/workspace/.github/instructions/accessibility.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Accessibility", description: "WCAG compliance guidelines", applyTo: "**/*.tsx" },
  { uri: URI.file("/workspace/.github/instructions/api-design.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "API Design", description: "REST API design conventions" },
  { uri: URI.file("/workspace/.github/instructions/performance.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Performance", description: "Performance optimization rules", applyTo: "src/core/**" },
  { uri: URI.file("/workspace/.github/instructions/error-handling.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Error Handling", description: "Error handling patterns" },
  { uri: URI.file("/workspace/.github/instructions/database.instructions.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Database", description: "Database migration and query patterns", applyTo: "src/db/**" },
  // Instructions — user
  { uri: URI.file("/home/dev/.copilot/instructions/my-style.instructions.md"), storage: PromptsStorage.user, type: PromptsType.instructions, name: "My Style", description: "Personal coding style" },
  { uri: URI.file("/home/dev/.copilot/instructions/typescript-rules.instructions.md"), storage: PromptsStorage.user, type: PromptsType.instructions, name: "TypeScript Rules", description: "Strict TypeScript conventions" },
  { uri: URI.file("/home/dev/.copilot/instructions/commit-messages.instructions.md"), storage: PromptsStorage.user, type: PromptsType.instructions, name: "Commit Messages", description: "Conventional commit format" },
  // Instructions — Claude rules
  { uri: URI.file("/workspace/.claude/rules/code-style.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Code Style", description: "Claude code style rules" },
  { uri: URI.file("/workspace/.claude/rules/testing.md"), storage: PromptsStorage.local, type: PromptsType.instructions, name: "Testing", description: "Claude testing conventions" },
  { uri: URI.file("/home/dev/.claude/rules/personal.md"), storage: PromptsStorage.user, type: PromptsType.instructions, name: "Personal", description: "Personal rules" },
  // Agents — workspace
  { uri: URI.file("/workspace/.github/agents/reviewer.agent.md"), storage: PromptsStorage.local, type: PromptsType.agent, name: "Reviewer", description: "Code review agent" },
  { uri: URI.file("/workspace/.github/agents/documenter.agent.md"), storage: PromptsStorage.local, type: PromptsType.agent, name: "Documenter", description: "Documentation agent" },
  { uri: URI.file("/workspace/.github/agents/tester.agent.md"), storage: PromptsStorage.local, type: PromptsType.agent, name: "Tester", description: "Test generation and validation" },
  { uri: URI.file("/workspace/.github/agents/refactorer.agent.md"), storage: PromptsStorage.local, type: PromptsType.agent, name: "Refactorer", description: "Code refactoring specialist" },
  { uri: URI.file("/workspace/.github/agents/security-auditor.agent.md"), storage: PromptsStorage.local, type: PromptsType.agent, name: "Security Auditor", description: "Security vulnerability scanner" },
  { uri: URI.file("/workspace/.github/agents/api-designer.agent.md"), storage: PromptsStorage.local, type: PromptsType.agent, name: "API Designer", description: "REST and GraphQL API design" },
  { uri: URI.file("/workspace/.github/agents/performance-tuner.agent.md"), storage: PromptsStorage.local, type: PromptsType.agent, name: "Performance Tuner", description: "Performance profiling and optimization" },
  // Agents — user
  { uri: URI.file("/home/dev/.copilot/agents/planner.agent.md"), storage: PromptsStorage.user, type: PromptsType.agent, name: "Planner", description: "Project planning agent" },
  { uri: URI.file("/home/dev/.copilot/agents/debugger.agent.md"), storage: PromptsStorage.user, type: PromptsType.agent, name: "Debugger", description: "Interactive debugging assistant" },
  { uri: URI.file("/home/dev/.copilot/agents/nls-helper.agent.md"), storage: PromptsStorage.user, type: PromptsType.agent, name: "NLS Helper", description: "Natural language searching code for clarity" },
  // Agents - extension (built-in + third-party)
  { uri: URI.file("/extensions/github.copilot-chat/agents/workspace-guide.agent.md"), storage: PromptsStorage.extension, type: PromptsType.agent, name: "Workspace Guide", description: "Built-in workspace exploration agent", extensionId: "GitHub.copilot-chat", extensionDisplayName: "GitHub Copilot Chat" },
  { uri: URI.file("/extensions/acme.tools/agents/api-helper.agent.md"), storage: PromptsStorage.extension, type: PromptsType.agent, name: "API Helper", description: "Third-party API agent", extensionId: "acme.tools", extensionDisplayName: "Acme Tools" },
  // Skills — workspace
  { uri: URI.file("/workspace/.github/skills/deploy/SKILL.md"), storage: PromptsStorage.local, type: PromptsType.skill, name: "Deploy", description: "Deployment automation" },
  { uri: URI.file("/workspace/.github/skills/refactor/SKILL.md"), storage: PromptsStorage.local, type: PromptsType.skill, name: "Refactor", description: "Code refactoring patterns" },
  { uri: URI.file("/workspace/.github/skills/unit-tests/SKILL.md"), storage: PromptsStorage.local, type: PromptsType.skill, name: "Unit Tests", description: "Test generation and runner integration" },
  { uri: URI.file("/workspace/.github/skills/ci-fix/SKILL.md"), storage: PromptsStorage.local, type: PromptsType.skill, name: "CI Fix", description: "Diagnose and fix CI failures" },
  { uri: URI.file("/workspace/.github/skills/migration/SKILL.md"), storage: PromptsStorage.local, type: PromptsType.skill, name: "Migration", description: "Database migration generation" },
  { uri: URI.file("/workspace/.github/skills/accessibility/SKILL.md"), storage: PromptsStorage.local, type: PromptsType.skill, name: "Accessibility", description: "ARIA labels and keyboard navigation" },
  { uri: URI.file("/workspace/.github/skills/docker/SKILL.md"), storage: PromptsStorage.local, type: PromptsType.skill, name: "Docker", description: "Dockerfile and compose generation" },
  { uri: URI.file("/workspace/.github/skills/api-docs/SKILL.md"), storage: PromptsStorage.local, type: PromptsType.skill, name: "API Docs", description: "OpenAPI spec generation" },
  // Skills — user
  { uri: URI.file("/home/dev/.copilot/skills/git-workflow/SKILL.md"), storage: PromptsStorage.user, type: PromptsType.skill, name: "Git Workflow", description: "Branch and PR workflows" },
  { uri: URI.file("/home/dev/.copilot/skills/code-review/SKILL.md"), storage: PromptsStorage.user, type: PromptsType.skill, name: "Code Review", description: "Structured code review checklist" },
  // Skills - extension (built-in + third-party)
  { uri: URI.file("/extensions/github.copilot-chat/skills/workspace/SKILL.md"), storage: PromptsStorage.extension, type: PromptsType.skill, name: "Workspace Search", description: "Built-in workspace search skill", extensionId: "GitHub.copilot-chat", extensionDisplayName: "GitHub Copilot Chat" },
  { uri: URI.file("/extensions/acme.tools/skills/audit/SKILL.md"), storage: PromptsStorage.extension, type: PromptsType.skill, name: "Audit", description: "Third-party audit skill", extensionId: "acme.tools", extensionDisplayName: "Acme Tools" },
  // Skills - built-in (sessions bundled skills with UI integrations)
  { uri: URI.file("/app/skills/act-on-feedback/SKILL.md"), storage: BUILTIN_STORAGE, type: PromptsType.skill, name: "act-on-feedback", description: "Act on user feedback attached to the current session" },
  { uri: URI.file("/app/skills/generate-run-commands/SKILL.md"), storage: BUILTIN_STORAGE, type: PromptsType.skill, name: "generate-run-commands", description: "Generate or modify run commands for the current session" },
  { uri: URI.file("/app/skills/commit/SKILL.md"), storage: BUILTIN_STORAGE, type: PromptsType.skill, name: "commit", description: "Commit staged or unstaged changes with an AI-generated commit message" },
  { uri: URI.file("/app/skills/create-pr/SKILL.md"), storage: BUILTIN_STORAGE, type: PromptsType.skill, name: "create-pr", description: "Create a pull request for the current session" },
  // Prompts — workspace
  { uri: URI.file("/workspace/.github/prompts/explain.prompt.md"), storage: PromptsStorage.local, type: PromptsType.prompt, name: "Explain", description: "Explain selected code" },
  { uri: URI.file("/workspace/.github/prompts/review.prompt.md"), storage: PromptsStorage.local, type: PromptsType.prompt, name: "Review", description: "Review changes" },
  { uri: URI.file("/workspace/.github/prompts/fix-bug.prompt.md"), storage: PromptsStorage.local, type: PromptsType.prompt, name: "Fix Bug", description: "Diagnose and fix a bug from issue" },
  { uri: URI.file("/workspace/.github/prompts/write-tests.prompt.md"), storage: PromptsStorage.local, type: PromptsType.prompt, name: "Write Tests", description: "Generate unit tests for selection" },
  { uri: URI.file("/workspace/.github/prompts/add-docs.prompt.md"), storage: PromptsStorage.local, type: PromptsType.prompt, name: "Add Docs", description: "Add JSDoc comments to functions" },
  { uri: URI.file("/workspace/.github/prompts/optimize.prompt.md"), storage: PromptsStorage.local, type: PromptsType.prompt, name: "Optimize", description: "Optimize code for performance" },
  { uri: URI.file("/workspace/.github/prompts/convert-to-ts.prompt.md"), storage: PromptsStorage.local, type: PromptsType.prompt, name: "Convert to TS", description: "Convert JavaScript to TypeScript" },
  { uri: URI.file("/workspace/.github/prompts/summarize-pr.prompt.md"), storage: PromptsStorage.local, type: PromptsType.prompt, name: "Summarize PR", description: "Generate PR description from diff" },
  // Prompts — user
  { uri: URI.file("/home/dev/.copilot/prompts/translate.prompt.md"), storage: PromptsStorage.user, type: PromptsType.prompt, name: "Translate", description: "Translate strings for i18n" },
  { uri: URI.file("/home/dev/.copilot/prompts/commit-msg.prompt.md"), storage: PromptsStorage.user, type: PromptsType.prompt, name: "Commit Message", description: "Generate conventional commit" },
  // Prompts - extension (built-in + third-party)
  { uri: URI.file("/extensions/github.copilot-chat/prompts/trace.prompt.md"), storage: PromptsStorage.extension, type: PromptsType.prompt, name: "Trace", description: "Built-in tracing prompt", extensionId: "GitHub.copilot-chat", extensionDisplayName: "GitHub Copilot Chat" },
  { uri: URI.file("/extensions/acme.tools/prompts/lint.prompt.md"), storage: PromptsStorage.extension, type: PromptsType.prompt, name: "Lint", description: "Third-party lint prompt", extensionId: "acme.tools", extensionDisplayName: "Acme Tools" },
  // Hooks — workspace
  { uri: URI.file("/workspace/.github/hooks/pre-commit.json"), storage: PromptsStorage.local, type: PromptsType.hook, name: "Pre-Commit Lint", description: "Run linting before commit" },
  { uri: URI.file("/workspace/.github/hooks/post-save.json"), storage: PromptsStorage.local, type: PromptsType.hook, name: "Post-Save Format", description: "Auto-format on save" },
  { uri: URI.file("/workspace/.github/hooks/on-test-fail.json"), storage: PromptsStorage.local, type: PromptsType.hook, name: "On Test Failure", description: "Suggest fix when tests fail" },
  { uri: URI.file("/workspace/.github/hooks/pre-push.json"), storage: PromptsStorage.local, type: PromptsType.hook, name: "Pre-Push Check", description: "Run type-check before push" },
  { uri: URI.file("/workspace/.github/hooks/post-create.json"), storage: PromptsStorage.local, type: PromptsType.hook, name: "Post-Create", description: "Initialize boilerplate for new files" },
  { uri: URI.file("/workspace/.github/hooks/on-error.json"), storage: PromptsStorage.local, type: PromptsType.hook, name: "On Error", description: "Log and report unhandled errors" },
  { uri: URI.file("/workspace/.github/hooks/post-tool-call.json"), storage: PromptsStorage.local, type: PromptsType.hook, name: "Post Tool Call", description: "Echo confirmation after each tool call" },
  { uri: URI.file("/workspace/.github/hooks/on-build-fail.json"), storage: PromptsStorage.local, type: PromptsType.hook, name: "On Build Failure", description: "Auto-diagnose build errors" },
  // Hooks — user
  { uri: URI.file("/home/dev/.copilot/hooks/daily-summary.json"), storage: PromptsStorage.user, type: PromptsType.hook, name: "Daily Summary", description: "Generate daily work summary" },
  { uri: URI.file("/home/dev/.copilot/hooks/backup-changes.json"), storage: PromptsStorage.user, type: PromptsType.hook, name: "Backup Changes", description: "Auto-stash uncommitted changes" }
];
const agentInstructions = [
  { uri: URI.file("/workspace/AGENTS.md"), realPath: void 0, type: AgentInstructionFileType.agentsMd },
  { uri: URI.file("/workspace/CLAUDE.md"), realPath: void 0, type: AgentInstructionFileType.claudeMd },
  { uri: URI.file("/workspace/.github/copilot-instructions.md"), realPath: void 0, type: AgentInstructionFileType.copilotInstructionsMd }
];
const mcpWorkspaceServers = [
  makeLocalMcpServer(
    "component-explorer",
    "component-explorer",
    LocalMcpServerScope.Workspace,
    "Component fixtures and screenshot tooling",
    {
      type: McpServerType.LOCAL,
      command: "npm",
      args: ["exec", "--no", "--", "component-explorer", "mcp", "-p", "./test/componentFixtures/component-explorer.json", "--use-daemon", "-vv"]
    }
  ),
  makeLocalMcpServer("mcp-postgres", "PostgreSQL", LocalMcpServerScope.Workspace, "Database access"),
  makeLocalMcpServer("mcp-github", "GitHub", LocalMcpServerScope.Workspace, "GitHub API"),
  makeLocalMcpServer("mcp-redis", "Redis", LocalMcpServerScope.Workspace, "In-memory data store"),
  makeLocalMcpServer("mcp-docker", "Docker", LocalMcpServerScope.Workspace, "Container management"),
  makeLocalMcpServer("mcp-slack", "Slack", LocalMcpServerScope.Workspace, "Team messaging"),
  makeLocalMcpServer("mcp-jira", "Jira", LocalMcpServerScope.Workspace, "Issue tracking"),
  makeLocalMcpServer("mcp-aws", "AWS", LocalMcpServerScope.Workspace, "Amazon Web Services"),
  makeLocalMcpServer("mcp-graphql", "GraphQL", LocalMcpServerScope.Workspace, "GraphQL API gateway")
];
const mcpUserServers = [
  makeLocalMcpServer("mcp-web-search", "Web Search", LocalMcpServerScope.User, "Search the web"),
  makeLocalMcpServer("mcp-filesystem", "Filesystem", LocalMcpServerScope.User, "Local file operations"),
  makeLocalMcpServer("mcp-puppeteer", "Puppeteer", LocalMcpServerScope.User, "Browser automation")
];
const mcpRuntimeServers = [
  { definition: { id: "github-copilot-mcp", label: "GitHub Copilot" }, collection: { id: "ext.github.copilot/mcp", label: "ext.github.copilot/mcp" }, enablement: constObservable(ContributionEnablementState.EnabledProfile), connectionState: constObservable({ state: McpConnectionState.Kind.Starting }), showOutput() {
  } },
  { definition: { id: "mcp-postgres", label: "PostgreSQL" }, collection: { id: "workspace-mcp", label: "Workspace MCP" }, enablement: constObservable(ContributionEnablementState.EnabledProfile), connectionState: constObservable({ state: McpConnectionState.Kind.Error }), showOutput() {
  } },
  { definition: { id: "mcp-web-search", label: "Web Search" }, collection: { id: "user-mcp", label: "User MCP" }, enablement: constObservable(ContributionEnablementState.DisabledProfile), connectionState: constObservable({ state: McpConnectionState.Kind.Stopped }), showOutput() {
  } },
  { definition: { id: "mcp-filesystem", label: "Filesystem" }, collection: { id: "user-mcp", label: "User MCP" }, enablement: constObservable(ContributionEnablementState.EnabledProfile), connectionState: constObservable({ state: McpConnectionState.Kind.Stopped }), showOutput() {
  } }
];
const activeSessionMcpServers = [
  { id: "mcp-top-level:fixture:session:component-explorer", name: "component-explorer", enabled: true, status: McpServerStatus.Ready, state: { kind: McpServerStatus.Ready }, logOutputChannelId: "fixture-agent-host", start: mcpLifecycleNoop, stop: mcpLifecycleNoop, setEnabled() {
  } },
  { id: "mcp-top-level:fixture:session:Remote Browser", name: "Remote Browser", enabled: true, status: McpServerStatus.AuthRequired, state: { kind: McpServerStatus.AuthRequired, reason: McpAuthRequiredReason.Required, resource: { resource: "https://mcp.example.com" } }, logOutputChannelId: "fixture-agent-host", start: mcpLifecycleNoop, stop: mcpLifecycleNoop, setEnabled() {
  } },
  { id: "mcp-top-level:fixture:session:Remote Search", name: "Remote Search", enabled: true, status: McpServerStatus.Error, state: { kind: McpServerStatus.Error, error: { errorType: "fixture", message: "Fixture error" } }, logOutputChannelId: "fixture-agent-host", start: mcpLifecycleNoop, stop: mcpLifecycleNoop, setEnabled() {
  } }
];
function renderFixtureMarkdown(markdown) {
  const container = DOM.$("div.fixture-rendered-markdown");
  const lines = markdown.split(/\r?\n/);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trimEnd();
    if (!line.trim()) {
      index++;
      continue;
    }
    if (line.startsWith("## ")) {
      const heading = DOM.append(container, DOM.$("h2"));
      heading.textContent = line.slice(3);
      index++;
      continue;
    }
    if (line.startsWith("- ")) {
      const list = DOM.append(container, DOM.$("ul"));
      while (index < lines.length && lines[index].trimStart().startsWith("- ")) {
        DOM.append(list, DOM.$("li")).textContent = lines[index].trimStart().slice(2);
        index++;
      }
      continue;
    }
    if (line.startsWith("```")) {
      index++;
      const codeLines = [];
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index++;
      }
      const pre = DOM.append(container, DOM.$("pre"));
      DOM.append(pre, DOM.$("code")).textContent = codeLines.join("\n");
      index++;
      continue;
    }
    const paragraph = DOM.append(container, DOM.$("p"));
    paragraph.textContent = line.replace(/\*\*/g, "");
    index++;
  }
  return container;
}
async function renderEditor(ctx, options) {
  const width = options.width ?? 900;
  const height = options.height ?? 600;
  ctx.container.style.width = `${width}px`;
  ctx.container.style.height = `${height}px`;
  const isSessionsWindow = options.isSessionsWindow ?? false;
  const skillUIIntegrations = options.skillUIIntegrations ?? /* @__PURE__ */ new Map();
  const managementSections = options.managementSections ?? [
    AICustomizationManagementSection.Agents,
    AICustomizationManagementSection.Skills,
    AICustomizationManagementSection.Instructions,
    AICustomizationManagementSection.Hooks,
    AICustomizationManagementSection.Prompts,
    AICustomizationManagementSection.McpServers,
    AICustomizationManagementSection.Plugins
  ];
  const availableHarnesses = options.availableHarnesses ?? [
    createVSCodeHarnessDescriptor(),
    {
      id: "agent-host-copilotcli",
      label: "Copilot [Agent Host]",
      icon: ThemeIcon.fromId(Codicon.server.id),
      hiddenSections: [AICustomizationManagementSection.Prompts],
      hideGenerateButton: true,
      itemProvider: createFixtureAgentHostItemProvider(allFiles)
    }
  ];
  const allMcpServers = [...mcpWorkspaceServers, ...mcpUserServers];
  const fixtureFiles = allFiles.map((file) => ({ ...file }));
  const fileContents = createFixtureContentMap(fixtureFiles, agentInstructions);
  const promptFilesDidChangeEmitter = ctx.disposableStore.add(new Emitter());
  const createdFolders = new ResourceSet();
  const modelServiceRef = { value: void 0 };
  const languageServiceRef = { value: void 0 };
  const instantiationService = createEditorServices(ctx.disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      const harnessService = createMockHarnessService(options.sessionResource, availableHarnesses);
      const agentFeedbackService = createMockAgentFeedbackService();
      const codeReviewService = createMockCodeReviewService();
      registerWorkbenchServices(reg);
      reg.defineInstance(IConfigurationService, new TestConfigurationService({
        [ChatConfiguration.ChatCustomizationsStructuredPreviewEnabled]: true,
        [ChatConfiguration.ChatCustomizationsPromptMigrationEnabled]: true,
        [CHAT_AUTOMATIONS_ENABLED_SETTING]: options.automationsEnabled === true
      }));
      reg.define(IListService, ListService);
      reg.defineInstance(ITextModelService, new class extends mock() {
        async createModelReference(resource) {
          const modelService = modelServiceRef.value;
          const languageService = languageServiceRef.value;
          let model = modelService.getModel(resource);
          if (!model) {
            const languageId = languageService.guessLanguageIdByFilepathOrFirstLine(resource) ?? "plaintext";
            const languageSelection = languageService.createById(languageId);
            model = modelService.createModel("", languageSelection, resource);
          }
          const onWillDispose = new Emitter();
          const textEditorModel = {
            textEditorModel: model,
            onWillDispose: onWillDispose.event,
            isReadonly: () => false,
            isResolved: () => true,
            isDisposed: () => false,
            getLanguageId: () => model.getLanguageId(),
            createSnapshot: () => model.createSnapshot(),
            resolve: async () => {
            },
            dispose: () => onWillDispose.dispose()
          };
          return { object: textEditorModel, dispose: () => {
          } };
        }
        canHandleResource() {
          return true;
        }
        registerTextModelContentProvider() {
          return { dispose: () => {
          } };
        }
      }());
      reg.defineInstance(IAgentFeedbackService, agentFeedbackService);
      reg.defineInstance(ICodeReviewService, codeReviewService);
      reg.defineInstance(IChatEditingService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.editingSessionsObs = constObservable([]);
        }
      }());
      reg.defineInstance(IAgentSessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.model = new class extends mock() {
            constructor() {
              super(...arguments);
              this.sessions = [];
            }
          }();
        }
        getSession() {
          return void 0;
        }
      }());
      reg.defineInstance(IPromptsService, createMockPromptsService(fixtureFiles, agentInstructions, fileContents, promptFilesDidChangeEmitter.event));
      reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.isSessionsWindow = isSessionsWindow;
          this.welcomePageFeatures = {
            showGettingStartedBanner: true
          };
          this.activeProjectRoot = observableValue("root", URI.file("/workspace"));
          this.hasOverrideProjectRoot = observableValue("hasOverride", false);
          this.managementSections = managementSections;
        }
        getActiveProjectRoot() {
          return URI.file("/workspace");
        }
        clearOverrideProjectRoot() {
        }
        setOverrideProjectRoot() {
        }
        async generateCustomization() {
        }
        getSkillUIIntegrations() {
          return skillUIIntegrations;
        }
      }());
      reg.defineInstance(ICustomizationHarnessService, harnessService);
      reg.defineInstance(IAgentHostCustomizationService, createMockAgentHostCustomizationService(options.activeSessionMcpServers));
      reg.define(IAICustomizationItemsModel, AICustomizationItemsModel);
      reg.defineInstance(IChatSessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeCustomizations = Event.None;
        }
        async getCustomizations() {
          return void 0;
        }
        getRegisteredChatSessionItemProviders() {
          return [];
        }
        hasCustomizationsProvider() {
          return false;
        }
      }());
      reg.defineInstance(IAutomationService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.automations = constObservable([]);
          this.runs = constObservable([]);
        }
        runsFor() {
          return constObservable([]);
        }
      }());
      reg.defineInstance(IAutomationRunner, new class extends mock() {
      }());
      reg.defineInstance(IAutomationDialogService, new class extends mock() {
        async showAutomationDialog() {
          return void 0;
        }
      }());
      reg.defineInstance(IEditorService, new class extends mock() {
      }());
      reg.defineInstance(IEditorGroupsService, new class extends mock() {
      }());
      reg.defineInstance(IWorkspaceContextService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeWorkspaceFolders = Event.None;
        }
        getWorkspace() {
          return { id: "test", folders: [] };
        }
        getWorkbenchState() {
          return WorkbenchState.WORKSPACE;
        }
      }());
      reg.defineInstance(IFileService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidFilesChange = Event.None;
        }
        async exists(resource) {
          return fileContents.has(resource) || createdFolders.has(resource);
        }
        async readFile(resource) {
          const value = fileContents.get(resource) ?? "";
          return createFixtureFileContentStat(resource, value);
        }
        async createFolder(resource) {
          createdFolders.add(resource);
          return createFixtureFileStat(resource, 0, true);
        }
        async writeFile(resource, buffer) {
          fileContents.set(resource, buffer.toString());
          createdFolders.add(dirnameUri(resource));
          if (resource.path.endsWith("/SKILL.md") && !fixtureFiles.some((file) => file.uri.toString() === resource.toString())) {
            const skillName = resource.path.split("/").at(-2) ?? "migrated-skill";
            fixtureFiles.push({
              uri: resource,
              storage: resource.path.startsWith("/workspace/") ? PromptsStorage.local : PromptsStorage.user,
              type: PromptsType.skill,
              name: skillName,
              description: `Migrated from prompt ${skillName}`
            });
          }
          promptFilesDidChangeEmitter.fire();
          return createFixtureFileStat(resource, buffer.byteLength, false);
        }
        async del(resource) {
          fileContents.delete(resource);
          const fileIndex = fixtureFiles.findIndex((file) => file.uri.toString() === resource.toString());
          if (fileIndex >= 0) {
            fixtureFiles.splice(fileIndex, 1);
          }
          promptFilesDidChangeEmitter.fire();
        }
      }());
      reg.defineInstance(IPathService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.defaultUriScheme = "file";
        }
        userHome() {
          return userHome;
        }
      }());
      reg.defineInstance(ITextModelService, new class extends mock() {
        async createModelReference(resource) {
          const modelService = modelServiceRef.value;
          const languageService = languageServiceRef.value;
          let model = modelService.getModel(resource);
          if (!model) {
            const languageId = languageService.guessLanguageIdByFilepathOrFirstLine(resource) ?? "plaintext";
            const languageSelection = languageService.createById(languageId);
            model = modelService.createModel(fileContents.get(resource) ?? "", languageSelection, resource);
          }
          const onWillDispose = new Emitter();
          const textEditorModel = {
            textEditorModel: model,
            onWillDispose: onWillDispose.event,
            isReadonly: () => false,
            isResolved: () => true,
            isDisposed: () => false,
            getLanguageId: () => model.getLanguageId(),
            createSnapshot: () => model.createSnapshot(),
            resolve: async () => {
            },
            dispose: () => onWillDispose.dispose()
          };
          return { object: textEditorModel, dispose: () => {
          } };
        }
        canHandleResource() {
          return true;
        }
        registerTextModelContentProvider() {
          return { dispose: () => {
          } };
        }
      }());
      reg.defineInstance(IWorkingCopyService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeDirty = Event.None;
          this.onDidSave = Event.None;
        }
        isDirty(_resource) {
          return false;
        }
      }());
      reg.defineInstance(IExtensionService, new class extends mock() {
      }());
      reg.defineInstance(IQuickInputService, new class extends mock() {
      }());
      reg.defineInstance(IViewsService, new class extends mock() {
        async openView(_id, _focus) {
          return null;
        }
      }());
      reg.defineInstance(IOutputService, new class extends mock() {
        async showChannel() {
        }
      }());
      reg.defineInstance(IChatWidgetService, new class extends mock() {
        get lastFocusedWidget() {
          return void 0;
        }
        async reveal() {
          return false;
        }
      }());
      reg.defineInstance(IRequestService, new class extends mock() {
      }());
      reg.defineInstance(IMarkdownRendererService, new class extends mock() {
        render(markdown) {
          const rendered = {
            element: renderFixtureMarkdown(typeof markdown === "string" ? markdown : markdown.value),
            dispose() {
            }
          };
          return rendered;
        }
      }());
      reg.defineInstance(IWebviewService, new class extends mock() {
      }());
      reg.defineInstance(IMcpWorkbenchService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onChange = Event.None;
          this.onReset = Event.None;
          this.local = allMcpServers;
        }
        async queryLocal() {
          return allMcpServers;
        }
        canInstall() {
          return true;
        }
      }());
      reg.defineInstance(IMcpService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.servers = constObservable(mcpRuntimeServers);
        }
      }());
      reg.defineInstance(IMcpRegistry, new class extends mock() {
        constructor() {
          super(...arguments);
          this.collections = constObservable([]);
          this.delegates = constObservable([]);
          this.onDidChangeInputs = Event.None;
        }
      }());
      reg.defineInstance(IAgentPluginService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.plugins = constObservable(installedPlugins);
          this.enablementModel = void 0;
        }
      }());
      reg.defineInstance(IPluginMarketplaceService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.installedPlugins = constObservable([]);
          this.onDidChangeMarketplaces = Event.None;
        }
      }());
      reg.defineInstance(IPluginInstallService, new class extends mock() {
      }());
      reg.defineInstance(IProductService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.defaultChatAgent = new class extends mock() {
            constructor() {
              super(...arguments);
              this.chatExtensionId = "GitHub.copilot-chat";
            }
          }();
        }
      }());
    }
  });
  modelServiceRef.value = instantiationService.get(IModelService);
  languageServiceRef.value = instantiationService.get(ILanguageService);
  for (const [uri, content] of fileContents) {
    if (!modelServiceRef.value.getModel(uri)) {
      const model = modelServiceRef.value.createModel(content, null, uri, false);
      ctx.disposableStore.add({ dispose: () => model.dispose() });
    }
  }
  const editor = ctx.disposableStore.add(
    instantiationService.createInstance(AICustomizationManagementEditor, createMockEditorGroup())
  );
  editor.create(ctx.container);
  editor.layout(new Dimension(width, height));
  const editorInput = ctx.disposableStore.add(AICustomizationManagementEditorInput.getOrCreate());
  await editor.setInput(editorInput, void 0, {}, CancellationToken.None);
  if (options.selectedSection) {
    editor.selectSectionById(options.selectedSection);
  }
  if (options.scrollToBottom) {
    editor.revealLastItem();
  }
  if (options.showPromptMigrationPage) {
    editor.showPromptMigrationPage();
  }
  if (options.openFirstItem) {
    const visibleContent = [...ctx.container.querySelectorAll(".prompts-content-container, .mcp-content-container, .plugin-content-container")].find((node) => node instanceof HTMLElement && node.style.display !== "none");
    const openItemLabel = options.openItemLabel;
    const rowToOpen = openItemLabel ? [...visibleContent?.querySelectorAll(".monaco-list-row") ?? []].find((row) => row instanceof HTMLElement && row.textContent?.includes(openItemLabel)) : visibleContent?.querySelector(".monaco-list-row.ai-customization-list-item, .monaco-list-row.mcp-server-item");
    if (rowToOpen) {
      rowToOpen.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0 }));
      rowToOpen.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
      rowToOpen.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
      rowToOpen.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
      if (options.editorDisplayMode === "raw") {
        const modeButton = ctx.container.querySelector(".editor-mode-button");
        modeButton?.click();
      }
    }
  }
}
function makeGalleryServer(id, label, description, publisher) {
  const galleryStub = new class extends mock() {
  }();
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.id = id;
      this.name = id;
      this.label = label;
      this.description = description;
      this.publisherDisplayName = publisher;
      this.installState = McpServerInstallState.Uninstalled;
      this.gallery = galleryStub;
      this.local = void 0;
    }
  }();
}
const galleryServers = [
  makeGalleryServer("gallery-postgres", "PostgreSQL", "Access PostgreSQL databases with schema inspection and query tools", "Microsoft"),
  makeGalleryServer("gallery-github", "GitHub", "Repository management, issues, pull requests, and code search", "GitHub"),
  makeGalleryServer("gallery-slack", "Slack", "Send messages, manage channels, and search workspace history", "Slack Technologies"),
  makeGalleryServer("gallery-docker", "Docker", "Container lifecycle management and image operations", "Docker Inc"),
  makeGalleryServer("gallery-filesystem", "Filesystem", "Read, write, and navigate local files and directories", "Microsoft"),
  makeGalleryServer("gallery-brave", "Brave Search", "Web and local search powered by the Brave Search API", "Brave Software"),
  makeGalleryServer("gallery-puppeteer", "Puppeteer", "Browser automation with screenshots, navigation, and form filling", "Google"),
  makeGalleryServer("gallery-memory", "Memory", "Knowledge graph for persistent memory across conversations", "Microsoft"),
  makeGalleryServer("gallery-fetch", "Fetch", "Retrieve and convert web content to markdown for analysis", "Microsoft"),
  makeGalleryServer("gallery-sentry", "Sentry", "Error monitoring, issue tracking, and performance tracing", "Sentry"),
  makeGalleryServer("gallery-sqlite", "SQLite", "Query and manage SQLite databases with schema exploration", "Community"),
  makeGalleryServer("gallery-redis", "Redis", "In-memory data store operations and key management", "Redis Ltd")
];
async function renderMcpBrowseMode(ctx) {
  const width = 650;
  const height = 500;
  ctx.container.style.width = `${width}px`;
  ctx.container.style.height = `${height}px`;
  const instantiationService = createEditorServices(ctx.disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.define(IListService, ListService);
      reg.defineInstance(IMcpWorkbenchService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onChange = Event.None;
          this.onReset = Event.None;
          this.local = [];
        }
        async queryLocal() {
          return [];
        }
        canInstall() {
          return true;
        }
        async queryGallery() {
          return {
            firstPage: { items: galleryServers, hasMore: false },
            async getNextPage() {
              return { items: [], hasMore: false };
            }
          };
        }
      }());
      reg.defineInstance(IMcpService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.servers = constObservable([]);
        }
      }());
      reg.defineInstance(IMcpRegistry, new class extends mock() {
        constructor() {
          super(...arguments);
          this.collections = constObservable([]);
          this.delegates = constObservable([]);
          this.onDidChangeInputs = Event.None;
        }
      }());
      reg.defineInstance(IAgentPluginService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.plugins = constObservable([]);
        }
      }());
      reg.defineInstance(IDialogService, new class extends mock() {
      }());
      reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.isSessionsWindow = false;
          this.welcomePageFeatures = {
            showGettingStartedBanner: true
          };
          this.activeProjectRoot = observableValue("root", URI.file("/workspace"));
          this.hasOverrideProjectRoot = observableValue("hasOverride", false);
        }
        getActiveProjectRoot() {
          return URI.file("/workspace");
        }
      }());
      reg.defineInstance(ICustomizationHarnessService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeSessionResource = observableValue("activeSessionResource", LocalChatSessionUri.getNewSessionUri());
          this.activeHarness = derived((reader) => getChatSessionType(this.activeSessionResource.read(reader)));
        }
        getActiveDescriptor() {
          return createVSCodeHarnessDescriptor();
        }
        registerExternalHarness() {
          return { dispose() {
          } };
        }
      }());
      reg.defineInstance(IAgentHostCustomizationService, createMockAgentHostCustomizationService());
      reg.defineInstance(IOutputService, new class extends mock() {
        async showChannel() {
        }
      }());
    }
  });
  const widget = ctx.disposableStore.add(
    instantiationService.createInstance(McpListWidget)
  );
  ctx.container.appendChild(widget.element);
  widget.layout(height, width);
  const browseButton = widget.element.querySelector(".list-add-button");
  browseButton?.click();
  await new Promise((resolve) => setTimeout(resolve, 50));
}
function makeInstalledPlugin(name, uri, enabled) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.uri = uri;
      this.format = PluginFormat.Copilot;
      this.label = name;
      this.enablement = constObservable(enabled ? ContributionEnablementState.EnabledProfile : ContributionEnablementState.DisabledProfile);
      this.hooks = constObservable([]);
      this.commands = constObservable([]);
      this.skills = constObservable([]);
      this.agents = constObservable([]);
      this.instructions = constObservable([]);
      this.mcpServerDefinitions = constObservable([]);
    }
    remove() {
    }
  }();
}
const installedPlugins = [
  makeInstalledPlugin("Linear", URI.file("/workspace/.copilot/plugins/linear"), true),
  makeInstalledPlugin("Sentry", URI.file("/workspace/.copilot/plugins/sentry"), true),
  makeInstalledPlugin("Datadog", URI.file("/workspace/.copilot/plugins/datadog"), true),
  makeInstalledPlugin("Notion", URI.file("/workspace/.copilot/plugins/notion"), true),
  makeInstalledPlugin("Confluence", URI.file("/workspace/.copilot/plugins/confluence"), true),
  makeInstalledPlugin("PagerDuty", URI.file("/workspace/.copilot/plugins/pagerduty"), false),
  makeInstalledPlugin("LaunchDarkly", URI.file("/workspace/.copilot/plugins/launchdarkly"), true),
  makeInstalledPlugin("CircleCI", URI.file("/workspace/.copilot/plugins/circleci"), true),
  makeInstalledPlugin("Vercel", URI.file("/workspace/.copilot/plugins/vercel"), false),
  makeInstalledPlugin("Supabase", URI.file("/workspace/.copilot/plugins/supabase"), true)
];
function makeMarketplacePlugin(name, description, repo) {
  return {
    name,
    description,
    version: "1.0.0",
    source: repo,
    sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: `example/${repo}` },
    marketplace: "copilot",
    marketplaceReference: { rawValue: `example/${repo}`, displayLabel: repo, cloneUrl: `https://github.com/example/${repo}.git`, canonicalId: `github:example/${repo}`, cacheSegments: ["example", repo], kind: MarketplaceReferenceKind.GitHubShorthand },
    marketplaceType: MarketplaceType.Copilot
  };
}
const marketplacePlugins = [
  makeMarketplacePlugin("Linear", "Issue tracking and project management integration", "linear-plugin"),
  makeMarketplacePlugin("Sentry", "Error monitoring and performance tracing", "sentry-plugin"),
  makeMarketplacePlugin("Datadog", "Observability and monitoring dashboards", "datadog-plugin"),
  makeMarketplacePlugin("Notion", "Knowledge base and documentation management", "notion-plugin"),
  makeMarketplacePlugin("Figma", "Design system inspection and asset export", "figma-plugin"),
  makeMarketplacePlugin("Stripe", "Payment processing and billing management", "stripe-plugin"),
  makeMarketplacePlugin("Twilio", "Communication APIs for SMS and voice", "twilio-plugin"),
  makeMarketplacePlugin("Auth0", "Identity and access management", "auth0-plugin"),
  makeMarketplacePlugin("Algolia", "Search and discovery API integration", "algolia-plugin"),
  makeMarketplacePlugin("LaunchDarkly", "Feature flag management and experimentation", "launchdarkly-plugin"),
  makeMarketplacePlugin("PlanetScale", "Serverless MySQL database management", "planetscale-plugin"),
  makeMarketplacePlugin("Vercel", "Deployment and preview environments", "vercel-plugin")
];
async function renderPluginBrowseMode(ctx) {
  const width = 650;
  const height = 500;
  ctx.container.style.width = `${width}px`;
  ctx.container.style.height = `${height}px`;
  const browseInstalledPlugins = [
    makeInstalledPlugin("Linear", URI.file("/home/dev/.vscode/agent-plugins/example/linear-plugin"), true),
    makeInstalledPlugin("Sentry", URI.file("/home/dev/.vscode/agent-plugins/example/sentry-plugin"), true),
    makeInstalledPlugin("Datadog", URI.file("/home/dev/.vscode/agent-plugins/example/datadog-plugin"), false)
  ];
  const pluginInstallUris = /* @__PURE__ */ new Map([
    ["example/linear-plugin", URI.file("/home/dev/.vscode/agent-plugins/example/linear-plugin")],
    ["example/sentry-plugin", URI.file("/home/dev/.vscode/agent-plugins/example/sentry-plugin")],
    ["example/datadog-plugin", URI.file("/home/dev/.vscode/agent-plugins/example/datadog-plugin")]
  ]);
  const instantiationService = createEditorServices(ctx.disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.define(IListService, ListService);
      reg.defineInstance(ICustomizationHarnessService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeSessionResource = observableValue("activeSessionResource", LocalChatSessionUri.getNewSessionUri());
          this.activeHarness = derived((reader) => getChatSessionType(this.activeSessionResource.read(reader)));
        }
        getActiveDescriptor() {
          return createVSCodeHarnessDescriptor();
        }
        registerExternalHarness() {
          return { dispose() {
          } };
        }
      }());
      reg.defineInstance(IAgentPluginService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.plugins = constObservable(browseInstalledPlugins);
          this.enablementModel = void 0;
        }
      }());
      reg.defineInstance(IPluginMarketplaceService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.installedPlugins = constObservable([]);
          this.onDidChangeMarketplaces = Event.None;
        }
        async fetchMarketplacePlugins() {
          return marketplacePlugins;
        }
      }());
      reg.defineInstance(IPluginInstallService, new class extends mock() {
        getPluginInstallUri(plugin) {
          const repo = plugin.sourceDescriptor.kind === PluginSourceKind.GitHub ? plugin.sourceDescriptor.repo : void 0;
          return repo ? pluginInstallUris.get(repo) ?? URI.file("/dev/null") : URI.file("/dev/null");
        }
      }());
      reg.defineInstance(IAICustomizationItemsModel, createMockAICustomizationItemsModel());
    }
  });
  const widget = ctx.disposableStore.add(
    instantiationService.createInstance(PluginListWidget)
  );
  ctx.container.appendChild(widget.element);
  widget.layout(height, width);
  const browseButton = widget.element.querySelector(".list-add-button");
  browseButton?.click();
  await new Promise((resolve) => setTimeout(resolve, 100));
  widget.element.querySelector("input")?.blur();
  for (const scrollbar of widget.element.querySelectorAll(".scrollbar")) {
    scrollbar.style.visibility = "hidden";
  }
  await new Promise((resolve) => setTimeout(resolve, 200));
}
function createDisabledConfigService(key, disabledValue, byPolicy) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeConfiguration = Event.None;
    }
    getValue(arg1, _arg2) {
      const k = typeof arg1 === "string" ? arg1 : void 0;
      return k === key ? disabledValue : void 0;
    }
    inspect(k) {
      if (k !== key) {
        return { value: void 0, defaultValue: void 0 };
      }
      return {
        value: disabledValue,
        defaultValue: disabledValue,
        policyValue: byPolicy ? disabledValue : void 0
      };
    }
  }();
}
function renderMcpDisabled(ctx, byPolicy) {
  const width = 650;
  const height = 500;
  ctx.container.style.width = `${width}px`;
  ctx.container.style.height = `${height}px`;
  const instantiationService = createEditorServices(ctx.disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.define(IListService, ListService);
      reg.defineInstance(IConfigurationService, createDisabledConfigService(mcpAccessConfig, McpAccessValue.None, byPolicy));
      reg.defineInstance(IMcpWorkbenchService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onChange = Event.None;
          this.onReset = Event.None;
          this.local = [];
        }
      }());
      reg.defineInstance(IMcpService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.servers = constObservable([]);
        }
      }());
      reg.defineInstance(IMcpRegistry, new class extends mock() {
        constructor() {
          super(...arguments);
          this.collections = constObservable([]);
          this.delegates = constObservable([]);
          this.onDidChangeInputs = Event.None;
        }
      }());
      reg.defineInstance(IAgentPluginService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.plugins = constObservable([]);
        }
      }());
      reg.defineInstance(IDialogService, new class extends mock() {
      }());
      reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.isSessionsWindow = false;
          this.welcomePageFeatures = { showGettingStartedBanner: true };
          this.activeProjectRoot = observableValue("root", URI.file("/workspace"));
          this.hasOverrideProjectRoot = observableValue("hasOverride", false);
        }
        getActiveProjectRoot() {
          return URI.file("/workspace");
        }
      }());
      reg.defineInstance(ICustomizationHarnessService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeSessionResource = observableValue("activeSessionResource", LocalChatSessionUri.getNewSessionUri());
          this.activeHarness = derived((reader) => getChatSessionType(this.activeSessionResource.read(reader)));
        }
        getActiveDescriptor() {
          return createVSCodeHarnessDescriptor();
        }
        registerExternalHarness() {
          return { dispose() {
          } };
        }
      }());
      reg.defineInstance(IAgentHostCustomizationService, createMockAgentHostCustomizationService());
      reg.defineInstance(IOutputService, new class extends mock() {
        async showChannel() {
        }
      }());
    }
  });
  const widget = ctx.disposableStore.add(instantiationService.createInstance(McpListWidget));
  ctx.container.appendChild(widget.element);
  widget.layout(height, width);
}
function renderPluginDisabled(ctx, byPolicy) {
  const width = 650;
  const height = 500;
  ctx.container.style.width = `${width}px`;
  ctx.container.style.height = `${height}px`;
  const instantiationService = createEditorServices(ctx.disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.define(IListService, ListService);
      reg.defineInstance(IConfigurationService, createDisabledConfigService(ChatConfiguration.PluginsEnabled, false, byPolicy));
      reg.defineInstance(ICustomizationHarnessService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeSessionResource = observableValue("activeSessionResource", LocalChatSessionUri.getNewSessionUri());
          this.activeHarness = derived((reader) => getChatSessionType(this.activeSessionResource.read(reader)));
        }
        getActiveDescriptor() {
          return createVSCodeHarnessDescriptor();
        }
        registerExternalHarness() {
          return { dispose() {
          } };
        }
      }());
      reg.defineInstance(IAgentPluginService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.plugins = constObservable([]);
          this.enablementModel = void 0;
        }
      }());
      reg.defineInstance(IPluginMarketplaceService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.installedPlugins = constObservable([]);
          this.onDidChangeMarketplaces = Event.None;
        }
        async fetchMarketplacePlugins() {
          return [];
        }
      }());
      reg.defineInstance(IPluginInstallService, new class extends mock() {
      }());
      reg.defineInstance(IAICustomizationItemsModel, createMockAICustomizationItemsModel());
    }
  });
  const widget = ctx.disposableStore.add(instantiationService.createInstance(PluginListWidget));
  ctx.container.appendChild(widget.element);
  widget.layout(height, width);
}
function renderEmbeddedMcpDetail(ctx, server) {
  const width = 480;
  const height = 320;
  ctx.container.style.width = `${width}px`;
  ctx.container.style.height = `${height}px`;
  const instantiationService = createEditorServices(ctx.disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.defineInstance(IMcpWorkbenchService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onChange = Event.None;
          this.onReset = Event.None;
          this.local = server ? [server] : [];
        }
        async open() {
        }
      }());
    }
  });
  const host = DOM.append(ctx.container, DOM.$(".ai-customization-management-editor"));
  host.style.height = "100%";
  host.style.width = "100%";
  host.style.overflow = "auto";
  const detail = ctx.disposableStore.add(instantiationService.createInstance(EmbeddedMcpServerDetail, host));
  if (server) {
    detail.setInput(server);
  }
}
function renderEmbeddedPluginDetail(ctx, item) {
  const width = 480;
  const height = 320;
  ctx.container.style.width = `${width}px`;
  ctx.container.style.height = `${height}px`;
  const instantiationService = createEditorServices(ctx.disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
    }
  });
  const host = DOM.append(ctx.container, DOM.$(".ai-customization-management-editor"));
  host.style.height = "100%";
  host.style.width = "100%";
  host.style.overflow = "auto";
  const detail = ctx.disposableStore.add(instantiationService.createInstance(EmbeddedAgentPluginDetail, host));
  if (item) {
    detail.setInput(item);
  }
}
function makeInstalledPluginItem(name, description) {
  return {
    kind: AgentPluginItemKind.Installed,
    name,
    description,
    marketplace: "GitHub",
    plugin: makeInstalledPlugin(name, URI.file(`/workspace/.copilot/plugins/${name.toLowerCase()}`), true)
  };
}
function makeMarketplacePluginItem(name, description) {
  return {
    kind: AgentPluginItemKind.Marketplace,
    name,
    description,
    source: "GitHub",
    sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: `acme/${name.toLowerCase()}` },
    marketplace: "GitHub",
    marketplaceType: MarketplaceType.Copilot,
    marketplaceReference: {
      rawValue: `acme/${name.toLowerCase()}`,
      displayLabel: `acme/${name.toLowerCase()}`,
      cloneUrl: `https://github.com/acme/${name.toLowerCase()}`,
      canonicalId: `github:acme/${name.toLowerCase()}`,
      cacheSegments: ["github", "acme", name.toLowerCase()],
      kind: MarketplaceReferenceKind.GitHubShorthand,
      githubRepo: `acme/${name.toLowerCase()}`
    }
  };
}
const localSessionResource = LocalChatSessionUri.getNewSessionUri();
const agentHostCopilotSessionResource = URI.from({ scheme: "agent-host-copilotcli", path: "/fixture-session" });
var aiCustomizationManagementEditor_fixture_default = defineThemedFixtureGroup({ path: "chat/aiCustomizations/" }, {
  // Welcome page — default state with no section selected
  WelcomePage: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, { sessionResource: localSessionResource })
  }),
  // Full editor with Local (VS Code) harness — all sections visible, harness dropdown,
  // Generate buttons, AGENTS.md shortcut, all storage groups
  LocalHarness: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, { sessionResource: localSessionResource, selectedSection: AICustomizationManagementSection.Agents })
  }),
  // Agent-host welcome page variant that highlights local prompt files which
  // need to be migrated because the active harness only consumes skills.
  AgentHostPromptMigration: defineComponentFixture({
    labels: { kind: "screenshot", blocksCi: true },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: agentHostCopilotSessionResource
    })
  }),
  // Sessions-window variant of the full editor with workspace override UX
  // and sessions section ordering.
  Sessions: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      isSessionsWindow: true,
      selectedSection: AICustomizationManagementSection.Agents,
      availableHarnesses: [
        createVSCodeHarnessDescriptor()
      ],
      managementSections: [
        AICustomizationManagementSection.Agents,
        AICustomizationManagementSection.Skills,
        AICustomizationManagementSection.Instructions,
        AICustomizationManagementSection.Prompts,
        AICustomizationManagementSection.Hooks,
        AICustomizationManagementSection.McpServers,
        AICustomizationManagementSection.Plugins
      ]
    })
  }),
  AutomationsTab: defineComponentFixture({
    labels: { kind: "screenshot", blocksCi: true },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Automations,
      automationsEnabled: true,
      width: 1200,
      managementSections: [
        AICustomizationManagementSection.Agents,
        AICustomizationManagementSection.Skills,
        AICustomizationManagementSection.Instructions,
        AICustomizationManagementSection.Hooks,
        AICustomizationManagementSection.Prompts,
        AICustomizationManagementSection.Automations,
        AICustomizationManagementSection.McpServers,
        AICustomizationManagementSection.Plugins
      ]
    })
  }),
  // Sessions Skills tab showing UI Integration badges on built-in skills
  SessionsSkillsTab: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      isSessionsWindow: true,
      selectedSection: AICustomizationManagementSection.Skills,
      availableHarnesses: [
        createVSCodeHarnessDescriptor()
      ],
      managementSections: [
        AICustomizationManagementSection.Agents,
        AICustomizationManagementSection.Skills,
        AICustomizationManagementSection.Instructions,
        AICustomizationManagementSection.Prompts,
        AICustomizationManagementSection.Hooks,
        AICustomizationManagementSection.McpServers,
        AICustomizationManagementSection.Plugins
      ],
      skillUIIntegrations: /* @__PURE__ */ new Map([
        ["act-on-feedback", "Used by the Submit Feedback button in the Changes toolbar"],
        ["generate-run-commands", "Used by the Run button in the title bar"]
      ])
    })
  }),
  // MCP Servers tab with many servers to verify scrollable list layout
  McpServersTab: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.McpServers
    })
  }),
  McpServersTabActiveSession: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      isSessionsWindow: true,
      selectedSection: AICustomizationManagementSection.McpServers,
      activeSessionMcpServers
    })
  }),
  // Agents tab — workspace and user agents, scrollable
  AgentsTab: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Agents
    })
  }),
  // Skills tab — workspace and user skills, scrollable
  SkillsTab: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Skills
    })
  }),
  // Instructions tab — many instructions with applyTo patterns, scrollable
  InstructionsTab: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Instructions
    })
  }),
  // Hooks tab — workspace and user hooks, scrollable
  HooksTab: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Hooks
    })
  }),
  // Prompts tab — workspace and user prompts, scrollable
  PromptsTab: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Prompts
    })
  }),
  PromptMigration: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: agentHostCopilotSessionResource,
      showPromptMigrationPage: true
    })
  }),
  // Plugins tab
  PluginsTab: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Plugins
    })
  }),
  // MCP browse/marketplace mode — standalone widget with gallery results, scrollable
  // Verifies fix for https://github.com/microsoft/vscode/issues/304139
  McpBrowseMode: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderMcpBrowseMode
  }),
  // Plugin browse/marketplace mode — standalone widget with marketplace results, scrollable
  PluginBrowseMode: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderPluginBrowseMode
  }),
  // MCP disabled splash — chat.mcp.access set to 'none' by user
  McpDisabledByUser: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderMcpDisabled(ctx, false)
  }),
  // MCP disabled splash — chat.mcp.access locked to 'none' by enterprise policy
  McpDisabledByPolicy: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderMcpDisabled(ctx, true)
  }),
  // Plugins disabled splash — chat.plugins.enabled=false by user
  PluginsDisabledByUser: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderPluginDisabled(ctx, false)
  }),
  // Plugins disabled splash — chat.plugins.enabled locked to false by enterprise policy
  PluginsDisabledByPolicy: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderPluginDisabled(ctx, true)
  }),
  // Scrolled-to-bottom variants — verify last items are fully visible above footer
  PromptsTabScrolled: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Prompts,
      scrollToBottom: true
    })
  }),
  McpServersTabScrolled: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.McpServers,
      scrollToBottom: true
    })
  }),
  PluginsTabScrolled: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Plugins,
      scrollToBottom: true
    })
  }),
  // Narrow viewport — catches badge clipping and layout overflow at small sizes
  McpServersTabNarrow: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.McpServers,
      width: 550,
      height: 400
    })
  }),
  AgentsTabNarrow: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Agents,
      width: 550,
      height: 400
    })
  }),
  // Item-preview view (after clicking an agent) — verifies the structured front
  // matter preview and rendered markdown body.
  AgentsItemPreview: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Agents,
      openFirstItem: true
    })
  }),
  // Raw markdown editor view reached from the structured preview's Edit action.
  AgentsItemRaw: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Agents,
      openFirstItem: true,
      editorDisplayMode: "raw"
    })
  }),
  // Built-in skill preview view — verifies that built-in skills open in the
  // structured preview while still offering an editable raw override path.
  BuiltinSkillItemPreview: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Skills,
      openFirstItem: true,
      openItemLabel: "act-on-feedback"
    })
  }),
  // Built-in skill raw view reached from the structured preview's Edit action.
  BuiltinSkillItemRaw: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Skills,
      openFirstItem: true,
      openItemLabel: "act-on-feedback",
      editorDisplayMode: "raw"
    })
  }),
  // MCP server detail view — same alignment check for the detail back button.
  McpServerDetail: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.McpServers,
      openFirstItem: true
    })
  }),
  // MCP server detail view in a narrow viewport — catches embedded header overflow
  // and the single-tab configuration layout used by local workspace servers.
  McpServerDetailNarrow: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.McpServers,
      openFirstItem: true,
      width: 550,
      height: 400
    })
  }),
  // Plugin detail view — same alignment check for the detail back button.
  PluginDetail: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Plugins,
      openFirstItem: true
    })
  }),
  PluginDetailNarrow: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEditor(ctx, {
      sessionResource: localSessionResource,
      selectedSection: AICustomizationManagementSection.Plugins,
      openFirstItem: true,
      width: 550,
      height: 400
    })
  }),
  // Standalone embedded MCP detail widget (compact split-pane component).
  // Workspace-scope server with a description.
  EmbeddedMcpDetailWorkspace: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEmbeddedMcpDetail(ctx, makeLocalMcpServer("mcp-postgres", "PostgreSQL", LocalMcpServerScope.Workspace, "Database access for the active workspace"))
  }),
  // Standalone embedded MCP detail widget — user-scope server.
  EmbeddedMcpDetailUser: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEmbeddedMcpDetail(ctx, makeLocalMcpServer("mcp-web-search", "Web Search", LocalMcpServerScope.User, "Search the web from any session"))
  }),
  // Standalone embedded MCP detail widget — empty / no input state.
  EmbeddedMcpDetailEmpty: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEmbeddedMcpDetail(ctx, void 0)
  }),
  // Standalone embedded plugin detail widget — installed plugin.
  EmbeddedPluginDetailInstalled: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEmbeddedPluginDetail(ctx, makeInstalledPluginItem("Linear", "Issue tracking and project management integration"))
  }),
  // Standalone embedded plugin detail widget — marketplace plugin.
  EmbeddedPluginDetailMarketplace: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEmbeddedPluginDetail(ctx, makeMarketplacePluginItem("Sentry", "Error monitoring and performance tracing"))
  }),
  // Standalone embedded plugin detail widget — empty / no input state.
  EmbeddedPluginDetailEmpty: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderEmbeddedPluginDetail(ctx, void 0)
  })
});
export {
  aiCustomizationManagementEditor_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvc2Vzc2lvbnMvYWlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvci5maXh0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRGltZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgdHlwZSB7IElSZW5kZXJlZE1hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwLCBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIGRlcml2ZWQsIElPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGRpcm5hbWUgYXMgZGlybmFtZVVyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJRmlsZUNvbnRlbnQsIElGaWxlU2VydmljZSwgSUZpbGVTdGF0V2l0aE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFBsdWdpbkZvcm1hdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50UGx1Z2lucy9jb21tb24vcGx1Z2luUGFyc2Vycy5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIExpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZSwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElPdXRwdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvb3V0cHV0L2NvbW1vbi9vdXRwdXQuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtpbmdDb3B5L2NvbW1vbi93b3JraW5nQ29weVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdlYnZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi93ZWJ2aWV3L2Jyb3dzZXIvd2Vidmlldy5qcyc7XG5pbXBvcnQgeyBJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSwgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24sIEFJQ3VzdG9taXphdGlvblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vYWlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLCBJQ3VzdG9taXphdGlvbkl0ZW0sIElDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyLCBJSGFybmVzc0Rlc2NyaXB0b3IsIGNyZWF0ZVZTQ29kZUhhcm5lc3NEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlLCBMb2NhbENoYXRTZXNzaW9uVXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSwgQWdlbnRJbnN0cnVjdGlvbkZpbGVUeXBlLCBQcm9tcHRzU3RvcmFnZSwgSUFnZW50U2tpbGwsIElDaGF0UHJvbXB0U2xhc2hDb21tYW5kLCBJQWdlbnRJbnN0cnVjdGlvbkZpbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZXNvbHZlZFByb21wdFNvdXJjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IFBhcnNlZFByb21wdEZpbGUsIFByb21wdEZpbGVQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRGaWxlUGFyc2VyLmpzJztcbmltcG9ydCB7IFByb21wdEZpbGVTb3VyY2UsIFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luU2VydmljZSwgSUFnZW50UGx1Z2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wbHVnaW5zL2FnZW50UGx1Z2luU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLCBJTWFya2V0cGxhY2VQbHVnaW4sIE1hcmtldHBsYWNlVHlwZSwgUGx1Z2luU291cmNlS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcGx1Z2lucy9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9wbHVnaW5zL21hcmtldHBsYWNlUmVmZXJlbmNlLmpzJztcbmltcG9ydCB7IElQbHVnaW5JbnN0YWxsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vcGx1Z2lucy9wbHVnaW5JbnN0YWxsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50RWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUFJQ3VzdG9taXphdGlvbkl0ZW1Tb3VyY2UsIElBSUN1c3RvbWl6YXRpb25MaXN0SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25JdGVtU291cmNlLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwsIElBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsLCBJdGVtc01vZGVsU2VjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25JdGVtc01vZGVsLmpzJztcbmltcG9ydCB7IEVtYmVkZGVkTWNwU2VydmVyRGV0YWlsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2VtYmVkZGVkTWNwU2VydmVyRGV0YWlsLmpzJztcbmltcG9ydCB7IEVtYmVkZGVkQWdlbnRQbHVnaW5EZXRhaWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9haUN1c3RvbWl6YXRpb24vZW1iZWRkZWRBZ2VudFBsdWdpbkRldGFpbC5qcyc7XG5pbXBvcnQgeyBBZ2VudFBsdWdpbkl0ZW1LaW5kLCBJQWdlbnRQbHVnaW5JdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRQbHVnaW5FZGl0b3IvYWdlbnRQbHVnaW5JdGVtcy5qcyc7XG5pbXBvcnQgeyBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2VuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UsIElDb25maWd1cmF0aW9uVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IG1jcEFjY2Vzc0NvbmZpZywgTWNwQWNjZXNzVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tY3AvY29tbW9uL21jcE1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElBdXRvbWF0aW9uRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUF1dG9tYXRpb25SdW5uZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2F1dG9tYXRpb25zL2F1dG9tYXRpb25SdW5uZXIuanMnO1xuaW1wb3J0IHsgSUF1dG9tYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDSEFUX0FVVE9NQVRJT05TX0VOQUJMRURfU0VUVElORyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vYXV0b21hdGlvbnMvYXV0b21hdGlvbnNFbmFibGVkLmpzJztcbmltcG9ydCB7IElNY3BXb3JrYmVuY2hTZXJ2aWNlLCBJV29ya2JlbmNoTWNwU2VydmVyLCBJTWNwU2VydmljZSwgTWNwQ29ubmVjdGlvblN0YXRlLCBNY3BTZXJ2ZXJJbnN0YWxsU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL21jcC9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHsgSU1jcFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9tY3AvY29tbW9uL21jcFJlZ2lzdHJ5VHlwZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExvY2FsTWNwU2VydmVyLCBMb2NhbE1jcFNlcnZlclNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbWNwL2NvbW1vbi9tY3BXb3JrYmVuY2hNYW5hZ2VtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBNY3BMaXN0V2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL21jcExpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgUGx1Z2luTGlzdFdpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9wbHVnaW5MaXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElJdGVyYXRpdmVQYWdlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhZ2luZy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNY3BBdXRoUmVxdWlyZWRSZWFzb24sIE1jcFNlcnZlclN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBJQWdlbnRGZWVkYmFja1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb250cmliL2FnZW50RmVlZGJhY2svYnJvd3Nlci9hZ2VudEZlZWRiYWNrU2VydmljZS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IElDb2RlUmV2aWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Nlc3Npb25zL2NvbnRyaWIvY29kZVJldmlldy9icm93c2VyL2NvZGVSZXZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZU1vY2tDb2RlUmV2aWV3U2VydmljZSB9IGZyb20gJy4vbW9ja0NvZGVSZXZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0RWRpdGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2NoYXQvY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIGNyZWF0ZUVkaXRvclNlcnZpY2VzLCBkZWZpbmVDb21wb25lbnRGaXh0dXJlLCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAsIHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMgfSBmcm9tICcuLi9maXh0dXJlVXRpbHMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcblxuLy8gRW5zdXJlIHRoZW1lIGNvbG9ycyAmIHdpZGdldCBDU1MgYXJlIGxvYWRlZFxuaW1wb3J0ICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JzL2lucHV0Q29sb3JzLmpzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9ycy9saXN0Q29sb3JzLmpzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvYWlDdXN0b21pemF0aW9uL21lZGlhL2FpQ3VzdG9taXphdGlvbk1hbmFnZW1lbnQuY3NzJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gTW9jayBoZWxwZXJzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmNvbnN0IHVzZXJIb21lID0gVVJJLmZpbGUoJy9ob21lL2RldicpO1xuY29uc3QgQlVJTFRJTl9TVE9SQUdFID0gJ2J1aWx0aW4nO1xuXG5pbnRlcmZhY2UgSUZpeHR1cmVGaWxlIHtcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdHJlYWRvbmx5IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlO1xuXHRyZWFkb25seSB0eXBlOiBQcm9tcHRzVHlwZTtcblx0cmVhZG9ubHkgbmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFwcGx5VG8/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbklkPzogc3RyaW5nO1xuXHRyZWFkb25seSBleHRlbnNpb25EaXNwbGF5TmFtZT86IHN0cmluZztcbn1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja0VkaXRvckdyb3VwKCk6IElFZGl0b3JHcm91cCB7XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JHcm91cD4oKSB7XG5cdFx0b3ZlcnJpZGUgd2luZG93SWQgPSBtYWluV2luZG93LnZzY29kZVdpbmRvd0lkO1xuXHR9KCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsKCk6IElBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsIHtcblx0Y29uc3QgaXRlbVNvdXJjZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFJQ3VzdG9taXphdGlvbkl0ZW1Tb3VyY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZ2V0TmV3U2Vzc2lvblVyaSgpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQUlDdXN0b21pemF0aW9uSXRlbXNDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGFzeW5jIGZldGNoUHJvdmlkZXJJdGVtcygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgZmV0Y2hBSUN1c3RvbWl6YXRpb25JdGVtcyhfcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUpIHsgcmV0dXJuIFtdOyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgZmV0Y2hTb3VyY2VGb2xkZXJzKF9wcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSkgeyByZXR1cm4gW107IH1cblx0fSgpO1xuXG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsPigpIHtcblx0XHRvdmVycmlkZSBnZXRJdGVtcyhfc2VjdGlvbjogSXRlbXNNb2RlbFNlY3Rpb24pOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJQUlDdXN0b21pemF0aW9uTGlzdEl0ZW1bXT4geyByZXR1cm4gY29uc3RPYnNlcnZhYmxlKFtdKTsgfVxuXHRcdG92ZXJyaWRlIGdldEFjdGl2ZUl0ZW1Tb3VyY2UoKSB7IHJldHVybiBpdGVtU291cmNlOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0Q291bnQoX3NlY3Rpb246IEl0ZW1zTW9kZWxTZWN0aW9uKTogSU9ic2VydmFibGU8bnVtYmVyPiB7IHJldHVybiBjb25zdE9ic2VydmFibGUoMCk7IH1cblx0XHRvdmVycmlkZSBnZXRQbHVnaW5Db3VudCgpOiBJT2JzZXJ2YWJsZTxudW1iZXI+IHsgcmV0dXJuIGNvbnN0T2JzZXJ2YWJsZSgwKTsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIHdoZW5TZWN0aW9uTG9hZGVkKF9zZWN0aW9uOiBJdGVtc01vZGVsU2VjdGlvbik6IFByb21pc2U8dm9pZD4geyB9XG5cdH0oKTtcbn1cblxudHlwZSBGaXh0dXJlQWdlbnRIb3N0TWNwU2VydmVyID0gUmV0dXJuVHlwZTxJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2VbJ2dldE1jcFNlcnZlcnMnXT5bbnVtYmVyXTtcblxuZnVuY3Rpb24gbWNwTGlmZWN5Y2xlTm9vcCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UobWNwU2VydmVyczogcmVhZG9ubHkgRml4dHVyZUFnZW50SG9zdE1jcFNlcnZlcltdID0gW10pOiBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2Uge1xuXHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSBnZXRDdXN0b21BZ2VudHMoKSB7IHJldHVybiBbXTsgfVxuXHRcdG92ZXJyaWRlIGdldEN1c3RvbWl6YXRpb25zKCkgeyByZXR1cm4gW107IH1cblx0XHRvdmVycmlkZSBnZXRXb3JraW5nRGlyZWN0b3J5KCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0V29ya2luZ0RpcmVjdG9yaWVzKCkgeyByZXR1cm4gW107IH1cblx0XHRvdmVycmlkZSBnZXRNY3BTZXJ2ZXJzKCkgeyByZXR1cm4gbWNwU2VydmVyczsgfVxuXHRcdG92ZXJyaWRlIGFkZE1jcFNlcnZlcigpIHsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIGF1dGhlbnRpY2F0ZU1jcFNlcnZlcigpIHsgcmV0dXJuIHRydWU7IH1cblx0fSgpO1xufVxuXG4vLyBBZ2VudC1ob3N0IGhhcm5lc3NlcyBzdXBwbHkgdGhlaXIgY3VzdG9taXphdGlvbiBpdGVtcyBkaXJlY3RseSB0aHJvdWdoIGFuXG4vLyBpdGVtIHByb3ZpZGVyIChieXBhc3NpbmcgdGhlIHByb21wdHMtc2VydmljZSBkaXNjb3ZlcnkgdXNlZCBieSBsb2NhbFxuLy8gaGFybmVzc2VzKS4gUHJvdmlkZSBvbmUgYmFja2VkIGJ5IHRoZSBmaXh0dXJlIGZpbGVzIHNvIHRoZSBhZ2VudC1ob3N0XG4vLyBlZGl0b3IgZG9lcyBub3QgZmFsbCBiYWNrIHRvIGFuIGVtcHR5IHNvdXJjZSBhbmQgbG9nIGEgd2FybmluZy5cbmZ1bmN0aW9uIGNyZWF0ZUZpeHR1cmVBZ2VudEhvc3RJdGVtUHJvdmlkZXIoZmlsZXM6IHJlYWRvbmx5IElGaXh0dXJlRmlsZVtdKTogSUN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIge1xuXHRyZXR1cm4ge1xuXHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdGFzeW5jIHByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zKCk6IFByb21pc2U8SUN1c3RvbWl6YXRpb25JdGVtW10+IHtcblx0XHRcdHJldHVybiBmaWxlcy5tYXAoZmlsZSA9PiAoe1xuXHRcdFx0XHR1cmk6IGZpbGUudXJpLFxuXHRcdFx0XHR0eXBlOiBmaWxlLnR5cGUsXG5cdFx0XHRcdG5hbWU6IGZpbGUubmFtZSA/PyAnJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGZpbGUuZGVzY3JpcHRpb24sXG5cdFx0XHRcdHNvdXJjZTogZmlsZS5zdG9yYWdlIGFzIEFJQ3VzdG9taXphdGlvblNvdXJjZSxcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGZpbGUuZXh0ZW5zaW9uSWQsXG5cdFx0XHRcdHBsdWdpblVyaTogdW5kZWZpbmVkLFxuXHRcdFx0fSkpO1xuXHRcdH0sXG5cdH07XG59XG5cbmZ1bmN0aW9uIHRvRXh0ZW5zaW9uSW5mbyhmaWxlOiBJRml4dHVyZUZpbGUpOiB7IGlkZW50aWZpZXI6IEV4dGVuc2lvbklkZW50aWZpZXI7IGRpc3BsYXlOYW1lPzogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRpZiAoIWZpbGUuZXh0ZW5zaW9uSWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRpZGVudGlmaWVyOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcihmaWxlLmV4dGVuc2lvbklkKSxcblx0XHRkaXNwbGF5TmFtZTogZmlsZS5leHRlbnNpb25EaXNwbGF5TmFtZSxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRml4dHVyZUZpbGVDb250ZW50KGZpbGU6IElGaXh0dXJlRmlsZSk6IHN0cmluZyB7XG5cdGlmIChmaWxlLnR5cGUgPT09IFByb21wdHNUeXBlLmhvb2spIHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0bmFtZTogZmlsZS5uYW1lLFxuXHRcdFx0ZGVzY3JpcHRpb246IGZpbGUuZGVzY3JpcHRpb24sXG5cdFx0XHRjb21tYW5kOiAnbnBtIHRlc3QnLFxuXHRcdH0sIG51bGwsIDIpO1xuXHR9XG5cblx0Y29uc3QgaGVhZGVyTGluZXMgPSBbXG5cdFx0Jy0tLScsXG5cdFx0YGRlc2NyaXB0aW9uOiAke0pTT04uc3RyaW5naWZ5KGZpbGUuZGVzY3JpcHRpb24gPz8gYCR7ZmlsZS5uYW1lID8/ICdDdXN0b21pemF0aW9uJ30gZGVzY3JpcHRpb25gKX1gLFxuXHRdO1xuXG5cdGlmIChmaWxlLnR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyAmJiBmaWxlLmFwcGx5VG8pIHtcblx0XHRoZWFkZXJMaW5lcy5wdXNoKGBhcHBseVRvOiAke0pTT04uc3RyaW5naWZ5KGZpbGUuYXBwbHlUbyl9YCk7XG5cdH1cblxuXHRpZiAoZmlsZS50eXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCkge1xuXHRcdGhlYWRlckxpbmVzLnB1c2goJ3Rvb2xzOicpO1xuXHRcdGhlYWRlckxpbmVzLnB1c2goJyAgLSByZWFkX2ZpbGUnKTtcblx0XHRoZWFkZXJMaW5lcy5wdXNoKCcgIC0gZ3JlcF9zZWFyY2gnKTtcblx0fVxuXG5cdGlmIChmaWxlLnR5cGUgPT09IFByb21wdHNUeXBlLnNraWxsKSB7XG5cdFx0aGVhZGVyTGluZXMucHVzaChgaW5wdXQ6ICR7SlNPTi5zdHJpbmdpZnkoJ0NvZGUgcmV2aWV3IGZpbmRpbmdzJyl9YCk7XG5cdH1cblxuXHRpZiAoZmlsZS50eXBlID09PSBQcm9tcHRzVHlwZS5wcm9tcHQpIHtcblx0XHRoZWFkZXJMaW5lcy5wdXNoKGBhcmd1bWVudC1oaW50OiAke0pTT04uc3RyaW5naWZ5KCdQYXN0ZSB0aGUgZmFpbGluZyBzdGFjayB0cmFjZScpfWApO1xuXHR9XG5cblx0aGVhZGVyTGluZXMucHVzaCgnLS0tJywgJycpO1xuXG5cdHJldHVybiBgJHtoZWFkZXJMaW5lcy5qb2luKCdcXG4nKX0jIyBPdmVydmlld1xcblxcblVzZSAqKiR7ZmlsZS5uYW1lID8/ICd0aGlzIGN1c3RvbWl6YXRpb24nfSoqIHdoZW4geW91IG5lZWQgY29uc2lzdGVudCBBSSBndWlkYW5jZS5cXG5cXG4tIFJldmlldyB0aGUgYWN0aXZlIGNoYW5nZVxcbi0gUHJlc2VydmUgZXhpc3RpbmcgY29udmVudGlvbnNcXG4tIEV4cGxhaW4gdGhlIHJlYXNvbmluZyBjbGVhcmx5XFxuXFxuXFxgXFxgXFxgdHNcXG5jb25zdCByZWFkeSA9IHRydWU7XFxuXFxgXFxgXFxgXFxuYDtcbn1cblxuZnVuY3Rpb24gY3JlYXRlSW5zdHJ1Y3Rpb25GaWxlQ29udGVudChmaWxlOiBJQWdlbnRJbnN0cnVjdGlvbkZpbGUpOiBzdHJpbmcge1xuXHRyZXR1cm4gYC0tLVxcbmRlc2NyaXB0aW9uOiAke0pTT04uc3RyaW5naWZ5KCdSZXBvc2l0b3J5LWxldmVsIGluc3RydWN0aW9ucycpfVxcbmFwcGx5VG86ICR7SlNPTi5zdHJpbmdpZnkoJyoqLyonKX1cXG4tLS1cXG5cXG4jIyBPdmVydmlld1xcblxcblRoZXNlIGluc3RydWN0aW9ucyBhcHBseSBhY3Jvc3MgdGhlIHdvcmtzcGFjZS5cXG5gO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVGaXh0dXJlQ29udGVudE1hcChmaWxlczogSUZpeHR1cmVGaWxlW10sIGluc3RydWN0aW9uczogSUFnZW50SW5zdHJ1Y3Rpb25GaWxlW10pOiBSZXNvdXJjZU1hcDxzdHJpbmc+IHtcblx0Y29uc3QgY29udGVudHMgPSBuZXcgUmVzb3VyY2VNYXA8c3RyaW5nPigpO1xuXHRmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcblx0XHRjb250ZW50cy5zZXQoZmlsZS51cmksIGNyZWF0ZUZpeHR1cmVGaWxlQ29udGVudChmaWxlKSk7XG5cdH1cblx0Zm9yIChjb25zdCBmaWxlIG9mIGluc3RydWN0aW9ucykge1xuXHRcdGNvbnRlbnRzLnNldChmaWxlLnVyaSwgY3JlYXRlSW5zdHJ1Y3Rpb25GaWxlQ29udGVudChmaWxlKSk7XG5cdH1cblx0cmV0dXJuIGNvbnRlbnRzO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVGaXh0dXJlRmlsZUNvbnRlbnRTdGF0KHJlc291cmNlOiBVUkksIHZhbHVlOiBzdHJpbmcpOiBJRmlsZUNvbnRlbnQge1xuXHRyZXR1cm4ge1xuXHRcdHJlc291cmNlLFxuXHRcdG5hbWU6ICcnLFxuXHRcdG10aW1lOiAwLFxuXHRcdGN0aW1lOiAwLFxuXHRcdGV0YWc6ICcnLFxuXHRcdHNpemU6IHZhbHVlLmxlbmd0aCxcblx0XHRyZWFkb25seTogZmFsc2UsXG5cdFx0bG9ja2VkOiBmYWxzZSxcblx0XHRleGVjdXRhYmxlOiBmYWxzZSxcblx0XHR2YWx1ZTogVlNCdWZmZXIuZnJvbVN0cmluZyh2YWx1ZSksXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUZpeHR1cmVGaWxlU3RhdChyZXNvdXJjZTogVVJJLCBzaXplOiBudW1iZXIsIGlzRGlyZWN0b3J5OiBib29sZWFuKTogSUZpbGVTdGF0V2l0aE1ldGFkYXRhIHtcblx0cmV0dXJuIHtcblx0XHRyZXNvdXJjZSxcblx0XHRuYW1lOiAnJyxcblx0XHRtdGltZTogMCxcblx0XHRjdGltZTogMCxcblx0XHRldGFnOiAnJyxcblx0XHRzaXplLFxuXHRcdHJlYWRvbmx5OiBmYWxzZSxcblx0XHRsb2NrZWQ6IGZhbHNlLFxuXHRcdGV4ZWN1dGFibGU6IGZhbHNlLFxuXHRcdGlzRmlsZTogIWlzRGlyZWN0b3J5LFxuXHRcdGlzRGlyZWN0b3J5LFxuXHRcdGlzU3ltYm9saWNMaW5rOiBmYWxzZSxcblx0XHRjaGlsZHJlbjogdW5kZWZpbmVkLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrUHJvbXB0c1NlcnZpY2UoZmlsZXM6IElGaXh0dXJlRmlsZVtdLCBhZ2VudEluc3RydWN0aW9uczogSUFnZW50SW5zdHJ1Y3Rpb25GaWxlW10sIGNvbnRlbnRzOiBSZXNvdXJjZU1hcDxzdHJpbmc+LCBvbkRpZENoYW5nZUZpbGVzOiBFdmVudDx2b2lkPik6IElQcm9tcHRzU2VydmljZSB7XG5cdGNvbnN0IHBhcnNlciA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCk7XG5cdGNvbnN0IHNraWxsU291cmNlRm9sZGVyczogSVJlc29sdmVkUHJvbXB0U291cmNlRm9sZGVyW10gPSBbXG5cdFx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5hZ2VudHMvc2tpbGxzJyksIHNlYXJjaFJvb3Q6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5hZ2VudHMvc2tpbGxzJyksIGZpbGVQYXR0ZXJuOiB1bmRlZmluZWQsIHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5BZ2VudHNXb3Jrc3BhY2UsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0sXG5cdFx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzJyksIHNlYXJjaFJvb3Q6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzJyksIGZpbGVQYXR0ZXJuOiB1bmRlZmluZWQsIHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5HaXRIdWJXb3Jrc3BhY2UsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0sXG5cdFx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5jbGF1ZGUvc2tpbGxzJyksIHNlYXJjaFJvb3Q6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5jbGF1ZGUvc2tpbGxzJyksIGZpbGVQYXR0ZXJuOiB1bmRlZmluZWQsIHNvdXJjZTogUHJvbXB0RmlsZVNvdXJjZS5DbGF1ZGVXb3Jrc3BhY2UsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0sXG5cdFx0eyB1cmk6IFVSSS5maWxlKCcvaG9tZS9kZXYvLmFnZW50cy9za2lsbHMnKSwgc2VhcmNoUm9vdDogVVJJLmZpbGUoJy9ob21lL2Rldi8uYWdlbnRzL3NraWxscycpLCBmaWxlUGF0dGVybjogdW5kZWZpbmVkLCBzb3VyY2U6IFByb21wdEZpbGVTb3VyY2UuQWdlbnRzUGVyc29uYWwsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIgfSxcblx0XHR7IHVyaTogVVJJLmZpbGUoJy9ob21lL2Rldi8uY29waWxvdC9za2lsbHMnKSwgc2VhcmNoUm9vdDogVVJJLmZpbGUoJy9ob21lL2Rldi8uY29waWxvdC9za2lsbHMnKSwgZmlsZVBhdHRlcm46IHVuZGVmaW5lZCwgc291cmNlOiBQcm9tcHRGaWxlU291cmNlLkNvcGlsb3RQZXJzb25hbCwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciB9LFxuXHRcdHsgdXJpOiBVUkkuZmlsZSgnL2hvbWUvZGV2Ly5jbGF1ZGUvc2tpbGxzJyksIHNlYXJjaFJvb3Q6IFVSSS5maWxlKCcvaG9tZS9kZXYvLmNsYXVkZS9za2lsbHMnKSwgZmlsZVBhdHRlcm46IHVuZGVmaW5lZCwgc291cmNlOiBQcm9tcHRGaWxlU291cmNlLkNsYXVkZVBlcnNvbmFsLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyIH0sXG5cdF07XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQcm9tcHRzU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VDdXN0b21BZ2VudHMgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2xhc2hDb21tYW5kcyA9IG9uRGlkQ2hhbmdlRmlsZXM7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTa2lsbHMgPSBvbkRpZENoYW5nZUZpbGVzO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlSW5zdHJ1Y3Rpb25zID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUFnZW50SW5zdHJ1Y3Rpb25zID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUhvb2tzID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSBnZXREaXNhYmxlZFByb21wdEZpbGVzKCk6IFJlc291cmNlU2V0IHsgcmV0dXJuIG5ldyBSZXNvdXJjZVNldCgpOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0UHJvbXB0TG9jYXRpb25MYWJlbCgpIHsgcmV0dXJuICcnOyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgbGlzdFByb21wdEZpbGVzKHR5cGU6IFByb21wdHNUeXBlLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0XHRyZXR1cm4gZmlsZXMuZmlsdGVyKGYgPT4gZi50eXBlID09PSB0eXBlKS5tYXAoZiA9PiAoe1xuXHRcdFx0XHR1cmk6IGYudXJpLFxuXHRcdFx0XHRzdG9yYWdlOiBmLnN0b3JhZ2UgYXMgUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdHR5cGU6IGYudHlwZSxcblx0XHRcdFx0bmFtZTogZi5uYW1lLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZi5kZXNjcmlwdGlvbixcblx0XHRcdFx0ZXh0ZW5zaW9uOiB0b0V4dGVuc2lvbkluZm8oZikgYXMgbmV2ZXIsXG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGFzeW5jIGxpc3RBZ2VudEluc3RydWN0aW9ucygpIHsgcmV0dXJuIGFnZW50SW5zdHJ1Y3Rpb25zOyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgbGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZSh0eXBlOiBQcm9tcHRzVHlwZSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRcdHJldHVybiBmaWxlcy5maWx0ZXIoZiA9PiBmLnR5cGUgPT09IHR5cGUgJiYgZi5zdG9yYWdlID09PSBzdG9yYWdlKS5tYXAoZiA9PiAoe1xuXHRcdFx0XHR1cmk6IGYudXJpLFxuXHRcdFx0XHRzdG9yYWdlOiBmLnN0b3JhZ2UgYXMgUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdHR5cGU6IGYudHlwZSxcblx0XHRcdFx0bmFtZTogZi5uYW1lLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZi5kZXNjcmlwdGlvbixcblx0XHRcdFx0ZXh0ZW5zaW9uOiB0b0V4dGVuc2lvbkluZm8oZikgYXMgbmV2ZXIsXG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGFzeW5jIGdldEN1c3RvbUFnZW50cygpIHtcblx0XHRcdHJldHVybiBmaWxlcy5maWx0ZXIoZiA9PiBmLnR5cGUgPT09IFByb21wdHNUeXBlLmFnZW50KS5tYXAoYSA9PiAoe1xuXHRcdFx0XHR1cmk6IGEudXJpLCBuYW1lOiBhLm5hbWUgPz8gJ2FnZW50JywgZGVzY3JpcHRpb246IGEuZGVzY3JpcHRpb24sIHN0b3JhZ2U6IGEuc3RvcmFnZSxcblx0XHRcdFx0c291cmNlOiB7XG5cdFx0XHRcdFx0c3RvcmFnZTogYS5zdG9yYWdlLFxuXHRcdFx0XHRcdGV4dGVuc2lvbklkOiBhLmV4dGVuc2lvbklkID8gbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoYS5leHRlbnNpb25JZCkgOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdH0pKSBhcyBuZXZlcltdO1xuXHRcdH1cblx0XHRvdmVycmlkZSBhc3luYyBwYXJzZU5ldyh1cmk6IFVSSSwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UGFyc2VkUHJvbXB0RmlsZT4ge1xuXHRcdFx0cmV0dXJuIHBhcnNlci5wYXJzZSh1cmksIGNvbnRlbnRzLmdldCh1cmkpID8/ICcnKTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgZ2V0UGFyc2VkUHJvbXB0RmlsZShtb2RlbDogeyB1cmk6IFVSSTsgZ2V0VmFsdWUoKTogc3RyaW5nIH0pIHtcblx0XHRcdHJldHVybiBwYXJzZXIucGFyc2UobW9kZWwudXJpLCBtb2RlbC5nZXRWYWx1ZSgpKTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0U291cmNlRm9sZGVycygpIHsgcmV0dXJuIFtdIGFzIG5ldmVyW107IH1cblx0XHRvdmVycmlkZSBhc3luYyBnZXRSZXNvbHZlZFNvdXJjZUZvbGRlcnModHlwZTogUHJvbXB0c1R5cGUpIHtcblx0XHRcdGlmICh0eXBlID09PSBQcm9tcHRzVHlwZS5za2lsbCkge1xuXHRcdFx0XHRyZXR1cm4gc2tpbGxTb3VyY2VGb2xkZXJzO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGFzeW5jIGdldEluc3RydWN0aW9uRmlsZXMoKSB7XG5cdFx0XHRyZXR1cm4gZmlsZXMuZmlsdGVyKGYgPT4gZi50eXBlID09PSBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpLm1hcChmID0+ICh7XG5cdFx0XHRcdHVyaTogZi51cmksXG5cdFx0XHRcdG5hbWU6IGYubmFtZSA/PyAnJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGYuZGVzY3JpcHRpb24sXG5cdFx0XHRcdHN0b3JhZ2U6IGYuc3RvcmFnZSxcblx0XHRcdFx0cGF0dGVybjogZi5hcHBseVRvLFxuXHRcdFx0XHRleHRlbnNpb246IHRvRXh0ZW5zaW9uSW5mbyhmKSBhcyBuZXZlcixcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgZmluZEFnZW50U2tpbGxzKCk6IFByb21pc2U8SUFnZW50U2tpbGxbXT4ge1xuXHRcdFx0cmV0dXJuIGZpbGVzLmZpbHRlcihmID0+IGYudHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwpLm1hcChmID0+ICh7XG5cdFx0XHRcdHVyaTogZi51cmksXG5cdFx0XHRcdHN0b3JhZ2U6IGYuc3RvcmFnZSxcblx0XHRcdFx0bmFtZTogZi5uYW1lID8/ICdza2lsbCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBmLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRkaXNhYmxlTW9kZWxJbnZvY2F0aW9uOiBmYWxzZSxcblx0XHRcdFx0dXNlckludm9jYWJsZTogdHJ1ZSxcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0UHJvbXB0U2xhc2hDb21tYW5kcygpOiBQcm9taXNlPHJlYWRvbmx5IElDaGF0UHJvbXB0U2xhc2hDb21tYW5kW10+IHtcblx0XHRcdGNvbnN0IHByb21wdEZpbGVzID0gZmlsZXMuZmlsdGVyKGYgPT4gZi50eXBlID09PSBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0Y29uc3QgY29tbWFuZHMgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9tcHRGaWxlcy5tYXAoYXN5bmMgZiA9PiB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dXJpOiBmLnVyaSxcblx0XHRcdFx0XHR1c2VySW52b2NhYmxlOiB0cnVlLFxuXHRcdFx0XHRcdG5hbWU6IGYubmFtZSA/PyAncHJvbXB0Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZi5kZXNjcmlwdGlvbixcblx0XHRcdFx0XHRhcmd1bWVudEhpbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0eXBlOiBmLnR5cGUsXG5cdFx0XHRcdFx0c3RvcmFnZTogZi5zdG9yYWdlLFxuXHRcdFx0XHRcdHNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGV4dGVuc2lvbjogdG9FeHRlbnNpb25JbmZvKGYpIGFzIG5ldmVyLFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJQ2hhdFByb21wdFNsYXNoQ29tbWFuZDtcblx0XHRcdH0pKTtcblx0XHRcdHJldHVybiBjb21tYW5kcztcblx0XHR9XG5cdH0oKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja0hhcm5lc3NTZXJ2aWNlKHNlc3Npb25SZXNvdXJjZTogVVJJLCBkZXNjcmlwdG9yczogcmVhZG9ubHkgSUhhcm5lc3NEZXNjcmlwdG9yW10pOiBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlIHtcblx0Y29uc3QgYWN0aXZlU2Vzc2lvblJlc291cmNlID0gb2JzZXJ2YWJsZVZhbHVlPFVSST4oJ2FjdGl2ZVNlc3Npb25SZXNvdXJjZScsIHNlc3Npb25SZXNvdXJjZSk7XG5cdGNvbnN0IGFjdGl2ZUhhcm5lc3MgPSBkZXJpdmVkKHJlYWRlciA9PiBnZXRDaGF0U2Vzc2lvblR5cGUoYWN0aXZlU2Vzc2lvblJlc291cmNlLnJlYWQocmVhZGVyKSkpO1xuXHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uUmVzb3VyY2UgPSBhY3RpdmVTZXNzaW9uUmVzb3VyY2U7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlSGFybmVzcyA9IGFjdGl2ZUhhcm5lc3M7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYXZhaWxhYmxlSGFybmVzc2VzID0gY29uc3RPYnNlcnZhYmxlKGRlc2NyaXB0b3JzKTtcblx0XHRvdmVycmlkZSBmaW5kSGFybmVzc0J5SWQoaWQ6IHN0cmluZykge1xuXHRcdFx0cmV0dXJuIGRlc2NyaXB0b3JzLmZpbmQoaCA9PiBoLmlkID09PSBpZCk7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGdldEFjdGl2ZURlc2NyaXB0b3IoKSB7XG5cdFx0XHRyZXR1cm4gZGVzY3JpcHRvcnMuZmluZChoID0+IGguaWQgPT09IGFjdGl2ZUhhcm5lc3MuZ2V0KCkpID8/IGRlc2NyaXB0b3JzWzBdO1xuXHRcdH1cblx0XHRvdmVycmlkZSBzZXRBY3RpdmVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKSB7XG5cdFx0XHRhY3RpdmVTZXNzaW9uUmVzb3VyY2Uuc2V0KHNlc3Npb25SZXNvdXJjZSwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgcmVnaXN0ZXJFeHRlcm5hbEhhcm5lc3MoKSB7IHJldHVybiB7IGRpc3Bvc2UoKSB7IH0gfTsgfVxuXHR9KCk7XG59XG5cbmZ1bmN0aW9uIG1ha2VMb2NhbE1jcFNlcnZlcihpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBzY29wZTogTG9jYWxNY3BTZXJ2ZXJTY29wZSwgZGVzY3JpcHRpb24/OiBzdHJpbmcsIGNvbmZpZz86IElXb3JrYmVuY2hNY3BTZXJ2ZXJbJ2NvbmZpZyddKTogSVdvcmtiZW5jaE1jcFNlcnZlciB7XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3JrYmVuY2hNY3BTZXJ2ZXI+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gaWQ7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbmFtZSA9IGlkO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxhYmVsID0gbGFiZWw7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZGVzY3JpcHRpb24gPSBkZXNjcmlwdGlvbiA/PyAnJztcblx0XHRvdmVycmlkZSByZWFkb25seSBjb25maWcgPSBjb25maWc7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaW5zdGFsbFN0YXRlID0gTWNwU2VydmVySW5zdGFsbFN0YXRlLkluc3RhbGxlZDtcblx0XHRvdmVycmlkZSByZWFkb25seSBsb2NhbCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtiZW5jaExvY2FsTWNwU2VydmVyPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gaWQ7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBzY29wZSA9IHNjb3BlO1xuXHRcdH0oKTtcblx0fSgpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrQWdlbnRGZWVkYmFja1NlcnZpY2UoKTogSUFnZW50RmVlZGJhY2tTZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50RmVlZGJhY2tTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUZlZWRiYWNrID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZU5hdmlnYXRpb24gPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmVlZGJhY2tTY29wZSA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRBZGRGZWVkYmFjayA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDb252ZXJ0RmVlZGJhY2sgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQWRkUmVwbHkgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkU3VibWl0RmVlZGJhY2sgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIGdldEZlZWRiYWNrKCkgeyByZXR1cm4gW107IH1cblx0XHRvdmVycmlkZSBnZXRTZXNzaW9uRm9yRmlsZSgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdG92ZXJyaWRlIGdldEZlZWRiYWNrU2Vzc2lvblJlc291cmNlKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0TW9zdFJlY2VudFNlc3Npb25Gb3JSZXNvdXJjZSgpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIHJldmVhbEZlZWRiYWNrKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdFx0b3ZlcnJpZGUgZ2V0TmV4dEZlZWRiYWNrKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0TmF2aWdhdGlvbkJlYXJpbmcoKSB7IHJldHVybiB7IGFjdGl2ZUlkeDogLTEsIHRvdGFsQ291bnQ6IDAgfTsgfVxuXHRcdG92ZXJyaWRlIGdldE5leHROYXZpZ2FibGVJdGVtKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0b3ZlcnJpZGUgc2V0TmF2aWdhdGlvbkFuY2hvcigpOiB2b2lkIHsgfVxuXHRcdG92ZXJyaWRlIGNsZWFyRmVlZGJhY2soKTogdm9pZCB7IH1cblx0XHRvdmVycmlkZSByZW1vdmVGZWVkYmFjaygpOiB2b2lkIHsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIGFkZEZlZWRiYWNrQW5kU3VibWl0KCk6IFByb21pc2U8dm9pZD4geyB9XG5cdH0oKTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gUmVhbGlzdGljIHRlc3QgZGF0YSBcdTIwMTQgYSBwcm9qZWN0IHRoYXQgaGFzIENvcGlsb3QgKyBDbGF1ZGUgY3VzdG9taXphdGlvbnNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuY29uc3QgYWxsRmlsZXM6IElGaXh0dXJlRmlsZVtdID0gW1xuXHQvLyBJbnN0cnVjdGlvbnMgLSBleHRlbnNpb24gKGJ1aWx0LWluICsgdGhpcmQtcGFydHkpXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2V4dGVuc2lvbnMvZ2l0aHViLmNvcGlsb3QtY2hhdC9pbnN0cnVjdGlvbnMvY29kaW5nLmluc3RydWN0aW9ucy5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgbmFtZTogJ0NvcGlsb3QgQ29kaW5nJywgZGVzY3JpcHRpb246ICdCdWlsdC1pbiBjb2RpbmcgZ3VpZGFuY2UnLCBleHRlbnNpb25JZDogJ0dpdEh1Yi5jb3BpbG90LWNoYXQnLCBleHRlbnNpb25EaXNwbGF5TmFtZTogJ0dpdEh1YiBDb3BpbG90IENoYXQnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2V4dGVuc2lvbnMvYWNtZS50b29scy9pbnN0cnVjdGlvbnMvdGVhbS5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIG5hbWU6ICdUZWFtIENvbnZlbnRpb25zJywgZGVzY3JpcHRpb246ICdUaGlyZC1wYXJ0eSBleHRlbnNpb24gaW5zdHJ1Y3Rpb25zJywgZXh0ZW5zaW9uSWQ6ICdhY21lLnRvb2xzJywgZXh0ZW5zaW9uRGlzcGxheU5hbWU6ICdBY21lIFRvb2xzJyB9LFxuXHQvLyBJbnN0cnVjdGlvbnMgXHUyMDE0IHdvcmtzcGFjZVxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvY29kaW5nLXN0YW5kYXJkcy5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgbmFtZTogJ0NvZGluZyBTdGFuZGFyZHMnLCBkZXNjcmlwdGlvbjogJ1JlcG9zaXRvcnktd2lkZSBjb2Rpbmcgc3RhbmRhcmRzJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvdGVzdGluZy5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgbmFtZTogJ1Rlc3RpbmcnLCBkZXNjcmlwdGlvbjogJ1Rlc3RpbmcgYmVzdCBwcmFjdGljZXMnLCBhcHBseVRvOiAnKiovKi50ZXN0LnRzJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvc2VjdXJpdHkuaW5zdHJ1Y3Rpb25zLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIG5hbWU6ICdTZWN1cml0eScsIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgcmV2aWV3IGNoZWNrbGlzdCcsIGFwcGx5VG86ICdzcmMvYXV0aC8qKicgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL2FjY2Vzc2liaWxpdHkuaW5zdHJ1Y3Rpb25zLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIG5hbWU6ICdBY2Nlc3NpYmlsaXR5JywgZGVzY3JpcHRpb246ICdXQ0FHIGNvbXBsaWFuY2UgZ3VpZGVsaW5lcycsIGFwcGx5VG86ICcqKi8qLnRzeCcgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL2FwaS1kZXNpZ24uaW5zdHJ1Y3Rpb25zLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIG5hbWU6ICdBUEkgRGVzaWduJywgZGVzY3JpcHRpb246ICdSRVNUIEFQSSBkZXNpZ24gY29udmVudGlvbnMnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucy9wZXJmb3JtYW5jZS5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgbmFtZTogJ1BlcmZvcm1hbmNlJywgZGVzY3JpcHRpb246ICdQZXJmb3JtYW5jZSBvcHRpbWl6YXRpb24gcnVsZXMnLCBhcHBseVRvOiAnc3JjL2NvcmUvKionIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucy9lcnJvci1oYW5kbGluZy5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgbmFtZTogJ0Vycm9yIEhhbmRsaW5nJywgZGVzY3JpcHRpb246ICdFcnJvciBoYW5kbGluZyBwYXR0ZXJucycgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL2RhdGFiYXNlLmluc3RydWN0aW9ucy5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBuYW1lOiAnRGF0YWJhc2UnLCBkZXNjcmlwdGlvbjogJ0RhdGFiYXNlIG1pZ3JhdGlvbiBhbmQgcXVlcnkgcGF0dGVybnMnLCBhcHBseVRvOiAnc3JjL2RiLyoqJyB9LFxuXHQvLyBJbnN0cnVjdGlvbnMgXHUyMDE0IHVzZXJcblx0eyB1cmk6IFVSSS5maWxlKCcvaG9tZS9kZXYvLmNvcGlsb3QvaW5zdHJ1Y3Rpb25zL215LXN0eWxlLmluc3RydWN0aW9ucy5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIG5hbWU6ICdNeSBTdHlsZScsIGRlc2NyaXB0aW9uOiAnUGVyc29uYWwgY29kaW5nIHN0eWxlJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy9ob21lL2Rldi8uY29waWxvdC9pbnN0cnVjdGlvbnMvdHlwZXNjcmlwdC1ydWxlcy5pbnN0cnVjdGlvbnMubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBuYW1lOiAnVHlwZVNjcmlwdCBSdWxlcycsIGRlc2NyaXB0aW9uOiAnU3RyaWN0IFR5cGVTY3JpcHQgY29udmVudGlvbnMnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2hvbWUvZGV2Ly5jb3BpbG90L2luc3RydWN0aW9ucy9jb21taXQtbWVzc2FnZXMuaW5zdHJ1Y3Rpb25zLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgbmFtZTogJ0NvbW1pdCBNZXNzYWdlcycsIGRlc2NyaXB0aW9uOiAnQ29udmVudGlvbmFsIGNvbW1pdCBmb3JtYXQnIH0sXG5cdC8vIEluc3RydWN0aW9ucyBcdTIwMTQgQ2xhdWRlIHJ1bGVzXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY2xhdWRlL3J1bGVzL2NvZGUtc3R5bGUubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgbmFtZTogJ0NvZGUgU3R5bGUnLCBkZXNjcmlwdGlvbjogJ0NsYXVkZSBjb2RlIHN0eWxlIHJ1bGVzJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNsYXVkZS9ydWxlcy90ZXN0aW5nLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIG5hbWU6ICdUZXN0aW5nJywgZGVzY3JpcHRpb246ICdDbGF1ZGUgdGVzdGluZyBjb252ZW50aW9ucycgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvaG9tZS9kZXYvLmNsYXVkZS9ydWxlcy9wZXJzb25hbC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIG5hbWU6ICdQZXJzb25hbCcsIGRlc2NyaXB0aW9uOiAnUGVyc29uYWwgcnVsZXMnIH0sXG5cdC8vIEFnZW50cyBcdTIwMTQgd29ya3NwYWNlXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9yZXZpZXdlci5hZ2VudC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuYWdlbnQsIG5hbWU6ICdSZXZpZXdlcicsIGRlc2NyaXB0aW9uOiAnQ29kZSByZXZpZXcgYWdlbnQnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9kb2N1bWVudGVyLmFnZW50Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCwgbmFtZTogJ0RvY3VtZW50ZXInLCBkZXNjcmlwdGlvbjogJ0RvY3VtZW50YXRpb24gYWdlbnQnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy90ZXN0ZXIuYWdlbnQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmFnZW50LCBuYW1lOiAnVGVzdGVyJywgZGVzY3JpcHRpb246ICdUZXN0IGdlbmVyYXRpb24gYW5kIHZhbGlkYXRpb24nIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9yZWZhY3RvcmVyLmFnZW50Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCwgbmFtZTogJ1JlZmFjdG9yZXInLCBkZXNjcmlwdGlvbjogJ0NvZGUgcmVmYWN0b3Jpbmcgc3BlY2lhbGlzdCcgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL3NlY3VyaXR5LWF1ZGl0b3IuYWdlbnQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmFnZW50LCBuYW1lOiAnU2VjdXJpdHkgQXVkaXRvcicsIGRlc2NyaXB0aW9uOiAnU2VjdXJpdHkgdnVsbmVyYWJpbGl0eSBzY2FubmVyJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvYXBpLWRlc2lnbmVyLmFnZW50Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCwgbmFtZTogJ0FQSSBEZXNpZ25lcicsIGRlc2NyaXB0aW9uOiAnUkVTVCBhbmQgR3JhcGhRTCBBUEkgZGVzaWduJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvcGVyZm9ybWFuY2UtdHVuZXIuYWdlbnQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmFnZW50LCBuYW1lOiAnUGVyZm9ybWFuY2UgVHVuZXInLCBkZXNjcmlwdGlvbjogJ1BlcmZvcm1hbmNlIHByb2ZpbGluZyBhbmQgb3B0aW1pemF0aW9uJyB9LFxuXHQvLyBBZ2VudHMgXHUyMDE0IHVzZXJcblx0eyB1cmk6IFVSSS5maWxlKCcvaG9tZS9kZXYvLmNvcGlsb3QvYWdlbnRzL3BsYW5uZXIuYWdlbnQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgdHlwZTogUHJvbXB0c1R5cGUuYWdlbnQsIG5hbWU6ICdQbGFubmVyJywgZGVzY3JpcHRpb246ICdQcm9qZWN0IHBsYW5uaW5nIGFnZW50JyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy9ob21lL2Rldi8uY29waWxvdC9hZ2VudHMvZGVidWdnZXIuYWdlbnQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgdHlwZTogUHJvbXB0c1R5cGUuYWdlbnQsIG5hbWU6ICdEZWJ1Z2dlcicsIGRlc2NyaXB0aW9uOiAnSW50ZXJhY3RpdmUgZGVidWdnaW5nIGFzc2lzdGFudCcgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvaG9tZS9kZXYvLmNvcGlsb3QvYWdlbnRzL25scy1oZWxwZXIuYWdlbnQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgdHlwZTogUHJvbXB0c1R5cGUuYWdlbnQsIG5hbWU6ICdOTFMgSGVscGVyJywgZGVzY3JpcHRpb246ICdOYXR1cmFsIGxhbmd1YWdlIHNlYXJjaGluZyBjb2RlIGZvciBjbGFyaXR5JyB9LFxuXHQvLyBBZ2VudHMgLSBleHRlbnNpb24gKGJ1aWx0LWluICsgdGhpcmQtcGFydHkpXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2V4dGVuc2lvbnMvZ2l0aHViLmNvcGlsb3QtY2hhdC9hZ2VudHMvd29ya3NwYWNlLWd1aWRlLmFnZW50Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbiwgdHlwZTogUHJvbXB0c1R5cGUuYWdlbnQsIG5hbWU6ICdXb3Jrc3BhY2UgR3VpZGUnLCBkZXNjcmlwdGlvbjogJ0J1aWx0LWluIHdvcmtzcGFjZSBleHBsb3JhdGlvbiBhZ2VudCcsIGV4dGVuc2lvbklkOiAnR2l0SHViLmNvcGlsb3QtY2hhdCcsIGV4dGVuc2lvbkRpc3BsYXlOYW1lOiAnR2l0SHViIENvcGlsb3QgQ2hhdCcgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvZXh0ZW5zaW9ucy9hY21lLnRvb2xzL2FnZW50cy9hcGktaGVscGVyLmFnZW50Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbiwgdHlwZTogUHJvbXB0c1R5cGUuYWdlbnQsIG5hbWU6ICdBUEkgSGVscGVyJywgZGVzY3JpcHRpb246ICdUaGlyZC1wYXJ0eSBBUEkgYWdlbnQnLCBleHRlbnNpb25JZDogJ2FjbWUudG9vbHMnLCBleHRlbnNpb25EaXNwbGF5TmFtZTogJ0FjbWUgVG9vbHMnIH0sXG5cdC8vIFNraWxscyBcdTIwMTQgd29ya3NwYWNlXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy9kZXBsb3kvU0tJTEwubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBuYW1lOiAnRGVwbG95JywgZGVzY3JpcHRpb246ICdEZXBsb3ltZW50IGF1dG9tYXRpb24nIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy9yZWZhY3Rvci9TS0lMTC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsIG5hbWU6ICdSZWZhY3RvcicsIGRlc2NyaXB0aW9uOiAnQ29kZSByZWZhY3RvcmluZyBwYXR0ZXJucycgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL3VuaXQtdGVzdHMvU0tJTEwubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBuYW1lOiAnVW5pdCBUZXN0cycsIGRlc2NyaXB0aW9uOiAnVGVzdCBnZW5lcmF0aW9uIGFuZCBydW5uZXIgaW50ZWdyYXRpb24nIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy9jaS1maXgvU0tJTEwubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBuYW1lOiAnQ0kgRml4JywgZGVzY3JpcHRpb246ICdEaWFnbm9zZSBhbmQgZml4IENJIGZhaWx1cmVzJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvbWlncmF0aW9uL1NLSUxMLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgbmFtZTogJ01pZ3JhdGlvbicsIGRlc2NyaXB0aW9uOiAnRGF0YWJhc2UgbWlncmF0aW9uIGdlbmVyYXRpb24nIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy9hY2Nlc3NpYmlsaXR5L1NLSUxMLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgbmFtZTogJ0FjY2Vzc2liaWxpdHknLCBkZXNjcmlwdGlvbjogJ0FSSUEgbGFiZWxzIGFuZCBrZXlib2FyZCBuYXZpZ2F0aW9uJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvZG9ja2VyL1NLSUxMLm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgbmFtZTogJ0RvY2tlcicsIGRlc2NyaXB0aW9uOiAnRG9ja2VyZmlsZSBhbmQgY29tcG9zZSBnZW5lcmF0aW9uJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvYXBpLWRvY3MvU0tJTEwubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBuYW1lOiAnQVBJIERvY3MnLCBkZXNjcmlwdGlvbjogJ09wZW5BUEkgc3BlYyBnZW5lcmF0aW9uJyB9LFxuXHQvLyBTa2lsbHMgXHUyMDE0IHVzZXJcblx0eyB1cmk6IFVSSS5maWxlKCcvaG9tZS9kZXYvLmNvcGlsb3Qvc2tpbGxzL2dpdC13b3JrZmxvdy9TS0lMTC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgbmFtZTogJ0dpdCBXb3JrZmxvdycsIGRlc2NyaXB0aW9uOiAnQnJhbmNoIGFuZCBQUiB3b3JrZmxvd3MnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2hvbWUvZGV2Ly5jb3BpbG90L3NraWxscy9jb2RlLXJldmlldy9TS0lMTC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgbmFtZTogJ0NvZGUgUmV2aWV3JywgZGVzY3JpcHRpb246ICdTdHJ1Y3R1cmVkIGNvZGUgcmV2aWV3IGNoZWNrbGlzdCcgfSxcblx0Ly8gU2tpbGxzIC0gZXh0ZW5zaW9uIChidWlsdC1pbiArIHRoaXJkLXBhcnR5KVxuXHR7IHVyaTogVVJJLmZpbGUoJy9leHRlbnNpb25zL2dpdGh1Yi5jb3BpbG90LWNoYXQvc2tpbGxzL3dvcmtzcGFjZS9TS0lMTC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBuYW1lOiAnV29ya3NwYWNlIFNlYXJjaCcsIGRlc2NyaXB0aW9uOiAnQnVpbHQtaW4gd29ya3NwYWNlIHNlYXJjaCBza2lsbCcsIGV4dGVuc2lvbklkOiAnR2l0SHViLmNvcGlsb3QtY2hhdCcsIGV4dGVuc2lvbkRpc3BsYXlOYW1lOiAnR2l0SHViIENvcGlsb3QgQ2hhdCcgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvZXh0ZW5zaW9ucy9hY21lLnRvb2xzL3NraWxscy9hdWRpdC9TS0lMTC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBuYW1lOiAnQXVkaXQnLCBkZXNjcmlwdGlvbjogJ1RoaXJkLXBhcnR5IGF1ZGl0IHNraWxsJywgZXh0ZW5zaW9uSWQ6ICdhY21lLnRvb2xzJywgZXh0ZW5zaW9uRGlzcGxheU5hbWU6ICdBY21lIFRvb2xzJyB9LFxuXHQvLyBTa2lsbHMgLSBidWlsdC1pbiAoc2Vzc2lvbnMgYnVuZGxlZCBza2lsbHMgd2l0aCBVSSBpbnRlZ3JhdGlvbnMpXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2FwcC9za2lsbHMvYWN0LW9uLWZlZWRiYWNrL1NLSUxMLm1kJyksIHN0b3JhZ2U6IEJVSUxUSU5fU1RPUkFHRSBhcyBQcm9tcHRzU3RvcmFnZSwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsIG5hbWU6ICdhY3Qtb24tZmVlZGJhY2snLCBkZXNjcmlwdGlvbjogJ0FjdCBvbiB1c2VyIGZlZWRiYWNrIGF0dGFjaGVkIHRvIHRoZSBjdXJyZW50IHNlc3Npb24nIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2FwcC9za2lsbHMvZ2VuZXJhdGUtcnVuLWNvbW1hbmRzL1NLSUxMLm1kJyksIHN0b3JhZ2U6IEJVSUxUSU5fU1RPUkFHRSBhcyBQcm9tcHRzU3RvcmFnZSwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsIG5hbWU6ICdnZW5lcmF0ZS1ydW4tY29tbWFuZHMnLCBkZXNjcmlwdGlvbjogJ0dlbmVyYXRlIG9yIG1vZGlmeSBydW4gY29tbWFuZHMgZm9yIHRoZSBjdXJyZW50IHNlc3Npb24nIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2FwcC9za2lsbHMvY29tbWl0L1NLSUxMLm1kJyksIHN0b3JhZ2U6IEJVSUxUSU5fU1RPUkFHRSBhcyBQcm9tcHRzU3RvcmFnZSwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsIG5hbWU6ICdjb21taXQnLCBkZXNjcmlwdGlvbjogJ0NvbW1pdCBzdGFnZWQgb3IgdW5zdGFnZWQgY2hhbmdlcyB3aXRoIGFuIEFJLWdlbmVyYXRlZCBjb21taXQgbWVzc2FnZScgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvYXBwL3NraWxscy9jcmVhdGUtcHIvU0tJTEwubWQnKSwgc3RvcmFnZTogQlVJTFRJTl9TVE9SQUdFIGFzIFByb21wdHNTdG9yYWdlLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgbmFtZTogJ2NyZWF0ZS1wcicsIGRlc2NyaXB0aW9uOiAnQ3JlYXRlIGEgcHVsbCByZXF1ZXN0IGZvciB0aGUgY3VycmVudCBzZXNzaW9uJyB9LFxuXHQvLyBQcm9tcHRzIFx1MjAxNCB3b3Jrc3BhY2Vcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvcHJvbXB0cy9leHBsYWluLnByb21wdC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUucHJvbXB0LCBuYW1lOiAnRXhwbGFpbicsIGRlc2NyaXB0aW9uOiAnRXhwbGFpbiBzZWxlY3RlZCBjb2RlJyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9wcm9tcHRzL3Jldmlldy5wcm9tcHQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLnByb21wdCwgbmFtZTogJ1JldmlldycsIGRlc2NyaXB0aW9uOiAnUmV2aWV3IGNoYW5nZXMnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3Byb21wdHMvZml4LWJ1Zy5wcm9tcHQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLnByb21wdCwgbmFtZTogJ0ZpeCBCdWcnLCBkZXNjcmlwdGlvbjogJ0RpYWdub3NlIGFuZCBmaXggYSBidWcgZnJvbSBpc3N1ZScgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvcHJvbXB0cy93cml0ZS10ZXN0cy5wcm9tcHQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLnByb21wdCwgbmFtZTogJ1dyaXRlIFRlc3RzJywgZGVzY3JpcHRpb246ICdHZW5lcmF0ZSB1bml0IHRlc3RzIGZvciBzZWxlY3Rpb24nIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3Byb21wdHMvYWRkLWRvY3MucHJvbXB0Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsIG5hbWU6ICdBZGQgRG9jcycsIGRlc2NyaXB0aW9uOiAnQWRkIEpTRG9jIGNvbW1lbnRzIHRvIGZ1bmN0aW9ucycgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvcHJvbXB0cy9vcHRpbWl6ZS5wcm9tcHQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLnByb21wdCwgbmFtZTogJ09wdGltaXplJywgZGVzY3JpcHRpb246ICdPcHRpbWl6ZSBjb2RlIGZvciBwZXJmb3JtYW5jZScgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvcHJvbXB0cy9jb252ZXJ0LXRvLXRzLnByb21wdC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUucHJvbXB0LCBuYW1lOiAnQ29udmVydCB0byBUUycsIGRlc2NyaXB0aW9uOiAnQ29udmVydCBKYXZhU2NyaXB0IHRvIFR5cGVTY3JpcHQnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3Byb21wdHMvc3VtbWFyaXplLXByLnByb21wdC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUucHJvbXB0LCBuYW1lOiAnU3VtbWFyaXplIFBSJywgZGVzY3JpcHRpb246ICdHZW5lcmF0ZSBQUiBkZXNjcmlwdGlvbiBmcm9tIGRpZmYnIH0sXG5cdC8vIFByb21wdHMgXHUyMDE0IHVzZXJcblx0eyB1cmk6IFVSSS5maWxlKCcvaG9tZS9kZXYvLmNvcGlsb3QvcHJvbXB0cy90cmFuc2xhdGUucHJvbXB0Lm1kJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsIHR5cGU6IFByb21wdHNUeXBlLnByb21wdCwgbmFtZTogJ1RyYW5zbGF0ZScsIGRlc2NyaXB0aW9uOiAnVHJhbnNsYXRlIHN0cmluZ3MgZm9yIGkxOG4nIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2hvbWUvZGV2Ly5jb3BpbG90L3Byb21wdHMvY29tbWl0LW1zZy5wcm9tcHQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgdHlwZTogUHJvbXB0c1R5cGUucHJvbXB0LCBuYW1lOiAnQ29tbWl0IE1lc3NhZ2UnLCBkZXNjcmlwdGlvbjogJ0dlbmVyYXRlIGNvbnZlbnRpb25hbCBjb21taXQnIH0sXG5cdC8vIFByb21wdHMgLSBleHRlbnNpb24gKGJ1aWx0LWluICsgdGhpcmQtcGFydHkpXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2V4dGVuc2lvbnMvZ2l0aHViLmNvcGlsb3QtY2hhdC9wcm9tcHRzL3RyYWNlLnByb21wdC5tZCcpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5leHRlbnNpb24sIHR5cGU6IFByb21wdHNUeXBlLnByb21wdCwgbmFtZTogJ1RyYWNlJywgZGVzY3JpcHRpb246ICdCdWlsdC1pbiB0cmFjaW5nIHByb21wdCcsIGV4dGVuc2lvbklkOiAnR2l0SHViLmNvcGlsb3QtY2hhdCcsIGV4dGVuc2lvbkRpc3BsYXlOYW1lOiAnR2l0SHViIENvcGlsb3QgQ2hhdCcgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvZXh0ZW5zaW9ucy9hY21lLnRvb2xzL3Byb21wdHMvbGludC5wcm9tcHQubWQnKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UuZXh0ZW5zaW9uLCB0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsIG5hbWU6ICdMaW50JywgZGVzY3JpcHRpb246ICdUaGlyZC1wYXJ0eSBsaW50IHByb21wdCcsIGV4dGVuc2lvbklkOiAnYWNtZS50b29scycsIGV4dGVuc2lvbkRpc3BsYXlOYW1lOiAnQWNtZSBUb29scycgfSxcblx0Ly8gSG9va3MgXHUyMDE0IHdvcmtzcGFjZVxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcy9wcmUtY29tbWl0Lmpzb24nKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmhvb2ssIG5hbWU6ICdQcmUtQ29tbWl0IExpbnQnLCBkZXNjcmlwdGlvbjogJ1J1biBsaW50aW5nIGJlZm9yZSBjb21taXQnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL3Bvc3Qtc2F2ZS5qc29uJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5ob29rLCBuYW1lOiAnUG9zdC1TYXZlIEZvcm1hdCcsIGRlc2NyaXB0aW9uOiAnQXV0by1mb3JtYXQgb24gc2F2ZScgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3Mvb24tdGVzdC1mYWlsLmpzb24nKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmhvb2ssIG5hbWU6ICdPbiBUZXN0IEZhaWx1cmUnLCBkZXNjcmlwdGlvbjogJ1N1Z2dlc3QgZml4IHdoZW4gdGVzdHMgZmFpbCcgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MvcHJlLXB1c2guanNvbicpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuaG9vaywgbmFtZTogJ1ByZS1QdXNoIENoZWNrJywgZGVzY3JpcHRpb246ICdSdW4gdHlwZS1jaGVjayBiZWZvcmUgcHVzaCcgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MvcG9zdC1jcmVhdGUuanNvbicpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuaG9vaywgbmFtZTogJ1Bvc3QtQ3JlYXRlJywgZGVzY3JpcHRpb246ICdJbml0aWFsaXplIGJvaWxlcnBsYXRlIGZvciBuZXcgZmlsZXMnIH0sXG5cdHsgdXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL29uLWVycm9yLmpzb24nKSwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsIHR5cGU6IFByb21wdHNUeXBlLmhvb2ssIG5hbWU6ICdPbiBFcnJvcicsIGRlc2NyaXB0aW9uOiAnTG9nIGFuZCByZXBvcnQgdW5oYW5kbGVkIGVycm9ycycgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MvcG9zdC10b29sLWNhbGwuanNvbicpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCwgdHlwZTogUHJvbXB0c1R5cGUuaG9vaywgbmFtZTogJ1Bvc3QgVG9vbCBDYWxsJywgZGVzY3JpcHRpb246ICdFY2hvIGNvbmZpcm1hdGlvbiBhZnRlciBlYWNoIHRvb2wgY2FsbCcgfSxcblx0eyB1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3Mvb24tYnVpbGQtZmFpbC5qc29uJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB0eXBlOiBQcm9tcHRzVHlwZS5ob29rLCBuYW1lOiAnT24gQnVpbGQgRmFpbHVyZScsIGRlc2NyaXB0aW9uOiAnQXV0by1kaWFnbm9zZSBidWlsZCBlcnJvcnMnIH0sXG5cdC8vIEhvb2tzIFx1MjAxNCB1c2VyXG5cdHsgdXJpOiBVUkkuZmlsZSgnL2hvbWUvZGV2Ly5jb3BpbG90L2hvb2tzL2RhaWx5LXN1bW1hcnkuanNvbicpLCBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS51c2VyLCB0eXBlOiBQcm9tcHRzVHlwZS5ob29rLCBuYW1lOiAnRGFpbHkgU3VtbWFyeScsIGRlc2NyaXB0aW9uOiAnR2VuZXJhdGUgZGFpbHkgd29yayBzdW1tYXJ5JyB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy9ob21lL2Rldi8uY29waWxvdC9ob29rcy9iYWNrdXAtY2hhbmdlcy5qc29uJyksIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsIHR5cGU6IFByb21wdHNUeXBlLmhvb2ssIG5hbWU6ICdCYWNrdXAgQ2hhbmdlcycsIGRlc2NyaXB0aW9uOiAnQXV0by1zdGFzaCB1bmNvbW1pdHRlZCBjaGFuZ2VzJyB9LFxuXTtcblxuY29uc3QgYWdlbnRJbnN0cnVjdGlvbnM6IElBZ2VudEluc3RydWN0aW9uRmlsZVtdID0gW1xuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvQUdFTlRTLm1kJyksIHJlYWxQYXRoOiB1bmRlZmluZWQsIHR5cGU6IEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZS5hZ2VudHNNZCB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvQ0xBVURFLm1kJyksIHJlYWxQYXRoOiB1bmRlZmluZWQsIHR5cGU6IEFnZW50SW5zdHJ1Y3Rpb25GaWxlVHlwZS5jbGF1ZGVNZCB9LFxuXHR7IHVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcpLCByZWFsUGF0aDogdW5kZWZpbmVkLCB0eXBlOiBBZ2VudEluc3RydWN0aW9uRmlsZVR5cGUuY29waWxvdEluc3RydWN0aW9uc01kIH0sXG5dO1xuXG5jb25zdCBtY3BXb3Jrc3BhY2VTZXJ2ZXJzID0gW1xuXHRtYWtlTG9jYWxNY3BTZXJ2ZXIoXG5cdFx0J2NvbXBvbmVudC1leHBsb3JlcicsXG5cdFx0J2NvbXBvbmVudC1leHBsb3JlcicsXG5cdFx0TG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UsXG5cdFx0J0NvbXBvbmVudCBmaXh0dXJlcyBhbmQgc2NyZWVuc2hvdCB0b29saW5nJyxcblx0XHR7XG5cdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0Y29tbWFuZDogJ25wbScsXG5cdFx0XHRhcmdzOiBbJ2V4ZWMnLCAnLS1ubycsICctLScsICdjb21wb25lbnQtZXhwbG9yZXInLCAnbWNwJywgJy1wJywgJy4vdGVzdC9jb21wb25lbnRGaXh0dXJlcy9jb21wb25lbnQtZXhwbG9yZXIuanNvbicsICctLXVzZS1kYWVtb24nLCAnLXZ2J10sXG5cdFx0fVxuXHQpLFxuXHRtYWtlTG9jYWxNY3BTZXJ2ZXIoJ21jcC1wb3N0Z3JlcycsICdQb3N0Z3JlU1FMJywgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Xb3Jrc3BhY2UsICdEYXRhYmFzZSBhY2Nlc3MnKSxcblx0bWFrZUxvY2FsTWNwU2VydmVyKCdtY3AtZ2l0aHViJywgJ0dpdEh1YicsIExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlLCAnR2l0SHViIEFQSScpLFxuXHRtYWtlTG9jYWxNY3BTZXJ2ZXIoJ21jcC1yZWRpcycsICdSZWRpcycsIExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlLCAnSW4tbWVtb3J5IGRhdGEgc3RvcmUnKSxcblx0bWFrZUxvY2FsTWNwU2VydmVyKCdtY3AtZG9ja2VyJywgJ0RvY2tlcicsIExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlLCAnQ29udGFpbmVyIG1hbmFnZW1lbnQnKSxcblx0bWFrZUxvY2FsTWNwU2VydmVyKCdtY3Atc2xhY2snLCAnU2xhY2snLCBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSwgJ1RlYW0gbWVzc2FnaW5nJyksXG5cdG1ha2VMb2NhbE1jcFNlcnZlcignbWNwLWppcmEnLCAnSmlyYScsIExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlLCAnSXNzdWUgdHJhY2tpbmcnKSxcblx0bWFrZUxvY2FsTWNwU2VydmVyKCdtY3AtYXdzJywgJ0FXUycsIExvY2FsTWNwU2VydmVyU2NvcGUuV29ya3NwYWNlLCAnQW1hem9uIFdlYiBTZXJ2aWNlcycpLFxuXHRtYWtlTG9jYWxNY3BTZXJ2ZXIoJ21jcC1ncmFwaHFsJywgJ0dyYXBoUUwnLCBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSwgJ0dyYXBoUUwgQVBJIGdhdGV3YXknKSxcbl07XG5jb25zdCBtY3BVc2VyU2VydmVycyA9IFtcblx0bWFrZUxvY2FsTWNwU2VydmVyKCdtY3Atd2ViLXNlYXJjaCcsICdXZWIgU2VhcmNoJywgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Vc2VyLCAnU2VhcmNoIHRoZSB3ZWInKSxcblx0bWFrZUxvY2FsTWNwU2VydmVyKCdtY3AtZmlsZXN5c3RlbScsICdGaWxlc3lzdGVtJywgTG9jYWxNY3BTZXJ2ZXJTY29wZS5Vc2VyLCAnTG9jYWwgZmlsZSBvcGVyYXRpb25zJyksXG5cdG1ha2VMb2NhbE1jcFNlcnZlcignbWNwLXB1cHBldGVlcicsICdQdXBwZXRlZXInLCBMb2NhbE1jcFNlcnZlclNjb3BlLlVzZXIsICdCcm93c2VyIGF1dG9tYXRpb24nKSxcbl07XG5jb25zdCBtY3BSdW50aW1lU2VydmVycyA9IFtcblx0eyBkZWZpbml0aW9uOiB7IGlkOiAnZ2l0aHViLWNvcGlsb3QtbWNwJywgbGFiZWw6ICdHaXRIdWIgQ29waWxvdCcgfSwgY29sbGVjdGlvbjogeyBpZDogJ2V4dC5naXRodWIuY29waWxvdC9tY3AnLCBsYWJlbDogJ2V4dC5naXRodWIuY29waWxvdC9tY3AnIH0sIGVuYWJsZW1lbnQ6IGNvbnN0T2JzZXJ2YWJsZShDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUpLCBjb25uZWN0aW9uU3RhdGU6IGNvbnN0T2JzZXJ2YWJsZSh7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdGFydGluZyB9KSwgc2hvd091dHB1dCgpIHsgfSB9LFxuXHR7IGRlZmluaXRpb246IHsgaWQ6ICdtY3AtcG9zdGdyZXMnLCBsYWJlbDogJ1Bvc3RncmVTUUwnIH0sIGNvbGxlY3Rpb246IHsgaWQ6ICd3b3Jrc3BhY2UtbWNwJywgbGFiZWw6ICdXb3Jrc3BhY2UgTUNQJyB9LCBlbmFibGVtZW50OiBjb25zdE9ic2VydmFibGUoQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlKSwgY29ubmVjdGlvblN0YXRlOiBjb25zdE9ic2VydmFibGUoeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3IgfSksIHNob3dPdXRwdXQoKSB7IH0gfSxcblx0eyBkZWZpbml0aW9uOiB7IGlkOiAnbWNwLXdlYi1zZWFyY2gnLCBsYWJlbDogJ1dlYiBTZWFyY2gnIH0sIGNvbGxlY3Rpb246IHsgaWQ6ICd1c2VyLW1jcCcsIGxhYmVsOiAnVXNlciBNQ1AnIH0sIGVuYWJsZW1lbnQ6IGNvbnN0T2JzZXJ2YWJsZShDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRQcm9maWxlKSwgY29ubmVjdGlvblN0YXRlOiBjb25zdE9ic2VydmFibGUoeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZCB9KSwgc2hvd091dHB1dCgpIHsgfSB9LFxuXHR7IGRlZmluaXRpb246IHsgaWQ6ICdtY3AtZmlsZXN5c3RlbScsIGxhYmVsOiAnRmlsZXN5c3RlbScgfSwgY29sbGVjdGlvbjogeyBpZDogJ3VzZXItbWNwJywgbGFiZWw6ICdVc2VyIE1DUCcgfSwgZW5hYmxlbWVudDogY29uc3RPYnNlcnZhYmxlKENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSksIGNvbm5lY3Rpb25TdGF0ZTogY29uc3RPYnNlcnZhYmxlKHsgc3RhdGU6IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlN0b3BwZWQgfSksIHNob3dPdXRwdXQoKSB7IH0gfSxcbl07XG5cbmNvbnN0IGFjdGl2ZVNlc3Npb25NY3BTZXJ2ZXJzOiBGaXh0dXJlQWdlbnRIb3N0TWNwU2VydmVyW10gPSBbXG5cdHsgaWQ6ICdtY3AtdG9wLWxldmVsOmZpeHR1cmU6c2Vzc2lvbjpjb21wb25lbnQtZXhwbG9yZXInLCBuYW1lOiAnY29tcG9uZW50LWV4cGxvcmVyJywgZW5hYmxlZDogdHJ1ZSwgc3RhdHVzOiBNY3BTZXJ2ZXJTdGF0dXMuUmVhZHksIHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5SZWFkeSB9LCBsb2dPdXRwdXRDaGFubmVsSWQ6ICdmaXh0dXJlLWFnZW50LWhvc3QnLCBzdGFydDogbWNwTGlmZWN5Y2xlTm9vcCwgc3RvcDogbWNwTGlmZWN5Y2xlTm9vcCwgc2V0RW5hYmxlZCgpIHsgfSB9LFxuXHR7IGlkOiAnbWNwLXRvcC1sZXZlbDpmaXh0dXJlOnNlc3Npb246UmVtb3RlIEJyb3dzZXInLCBuYW1lOiAnUmVtb3RlIEJyb3dzZXInLCBlbmFibGVkOiB0cnVlLCBzdGF0dXM6IE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWQsIHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5BdXRoUmVxdWlyZWQsIHJlYXNvbjogTWNwQXV0aFJlcXVpcmVkUmVhc29uLlJlcXVpcmVkLCByZXNvdXJjZTogeyByZXNvdXJjZTogJ2h0dHBzOi8vbWNwLmV4YW1wbGUuY29tJyB9IH0sIGxvZ091dHB1dENoYW5uZWxJZDogJ2ZpeHR1cmUtYWdlbnQtaG9zdCcsIHN0YXJ0OiBtY3BMaWZlY3ljbGVOb29wLCBzdG9wOiBtY3BMaWZlY3ljbGVOb29wLCBzZXRFbmFibGVkKCkgeyB9IH0sXG5cdHsgaWQ6ICdtY3AtdG9wLWxldmVsOmZpeHR1cmU6c2Vzc2lvbjpSZW1vdGUgU2VhcmNoJywgbmFtZTogJ1JlbW90ZSBTZWFyY2gnLCBlbmFibGVkOiB0cnVlLCBzdGF0dXM6IE1jcFNlcnZlclN0YXR1cy5FcnJvciwgc3RhdGU6IHsga2luZDogTWNwU2VydmVyU3RhdHVzLkVycm9yLCBlcnJvcjogeyBlcnJvclR5cGU6ICdmaXh0dXJlJywgbWVzc2FnZTogJ0ZpeHR1cmUgZXJyb3InIH0gfSwgbG9nT3V0cHV0Q2hhbm5lbElkOiAnZml4dHVyZS1hZ2VudC1ob3N0Jywgc3RhcnQ6IG1jcExpZmVjeWNsZU5vb3AsIHN0b3A6IG1jcExpZmVjeWNsZU5vb3AsIHNldEVuYWJsZWQoKSB7IH0gfSxcbl07XG5cbmludGVyZmFjZSBJUmVuZGVyRWRpdG9yT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHNlc3Npb25SZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSBpc1Nlc3Npb25zV2luZG93PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbWFuYWdlbWVudFNlY3Rpb25zPzogcmVhZG9ubHkgQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb25bXTtcblx0cmVhZG9ubHkgYXZhaWxhYmxlSGFybmVzc2VzPzogcmVhZG9ubHkgSUhhcm5lc3NEZXNjcmlwdG9yW107XG5cdHJlYWRvbmx5IHNlbGVjdGVkU2VjdGlvbj86IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uO1xuXHRyZWFkb25seSBzY3JvbGxUb0JvdHRvbT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHdpZHRoPzogbnVtYmVyO1xuXHRyZWFkb25seSBoZWlnaHQ/OiBudW1iZXI7XG5cdHJlYWRvbmx5IHNraWxsVUlJbnRlZ3JhdGlvbnM/OiBSZWFkb25seU1hcDxzdHJpbmcsIHN0cmluZz47XG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25NY3BTZXJ2ZXJzPzogcmVhZG9ubHkgRml4dHVyZUFnZW50SG9zdE1jcFNlcnZlcltdO1xuXHQvKiogV2hlbiB0cnVlLCBzaW11bGF0ZXMgY2xpY2tpbmcgdGhlIGZpcnN0IGxpc3Qgcm93IHRvIGVudGVyIHRoZSBlbWJlZGRlZCBlZGl0b3IgLyBkZXRhaWwgdmlldy4gKi9cblx0cmVhZG9ubHkgb3BlbkZpcnN0SXRlbT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG9wZW5JdGVtTGFiZWw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGVkaXRvckRpc3BsYXlNb2RlPzogJ3ByZXZpZXcnIHwgJ3Jhdyc7XG5cdHJlYWRvbmx5IHNob3dQcm9tcHRNaWdyYXRpb25QYWdlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgYXV0b21hdGlvbnNFbmFibGVkPzogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gcmVuZGVyRml4dHVyZU1hcmtkb3duKG1hcmtkb3duOiBzdHJpbmcpOiBIVE1MRWxlbWVudCB7XG5cdGNvbnN0IGNvbnRhaW5lciA9IERPTS4kKCdkaXYuZml4dHVyZS1yZW5kZXJlZC1tYXJrZG93bicpO1xuXHRjb25zdCBsaW5lcyA9IG1hcmtkb3duLnNwbGl0KC9cXHI/XFxuLyk7XG5cdGxldCBpbmRleCA9IDA7XG5cblx0d2hpbGUgKGluZGV4IDwgbGluZXMubGVuZ3RoKSB7XG5cdFx0Y29uc3QgbGluZSA9IGxpbmVzW2luZGV4XS50cmltRW5kKCk7XG5cdFx0aWYgKCFsaW5lLnRyaW0oKSkge1xuXHRcdFx0aW5kZXgrKztcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmIChsaW5lLnN0YXJ0c1dpdGgoJyMjICcpKSB7XG5cdFx0XHRjb25zdCBoZWFkaW5nID0gRE9NLmFwcGVuZChjb250YWluZXIsIERPTS4kKCdoMicpKTtcblx0XHRcdGhlYWRpbmcudGV4dENvbnRlbnQgPSBsaW5lLnNsaWNlKDMpO1xuXHRcdFx0aW5kZXgrKztcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmIChsaW5lLnN0YXJ0c1dpdGgoJy0gJykpIHtcblx0XHRcdGNvbnN0IGxpc3QgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgRE9NLiQoJ3VsJykpO1xuXHRcdFx0d2hpbGUgKGluZGV4IDwgbGluZXMubGVuZ3RoICYmIGxpbmVzW2luZGV4XS50cmltU3RhcnQoKS5zdGFydHNXaXRoKCctICcpKSB7XG5cdFx0XHRcdERPTS5hcHBlbmQobGlzdCwgRE9NLiQoJ2xpJykpLnRleHRDb250ZW50ID0gbGluZXNbaW5kZXhdLnRyaW1TdGFydCgpLnNsaWNlKDIpO1xuXHRcdFx0XHRpbmRleCsrO1xuXHRcdFx0fVxuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0aWYgKGxpbmUuc3RhcnRzV2l0aCgnYGBgJykpIHtcblx0XHRcdGluZGV4Kys7XG5cdFx0XHRjb25zdCBjb2RlTGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHR3aGlsZSAoaW5kZXggPCBsaW5lcy5sZW5ndGggJiYgIWxpbmVzW2luZGV4XS5zdGFydHNXaXRoKCdgYGAnKSkge1xuXHRcdFx0XHRjb2RlTGluZXMucHVzaChsaW5lc1tpbmRleF0pO1xuXHRcdFx0XHRpbmRleCsrO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcHJlID0gRE9NLmFwcGVuZChjb250YWluZXIsIERPTS4kKCdwcmUnKSk7XG5cdFx0XHRET00uYXBwZW5kKHByZSwgRE9NLiQoJ2NvZGUnKSkudGV4dENvbnRlbnQgPSBjb2RlTGluZXMuam9pbignXFxuJyk7XG5cdFx0XHRpbmRleCsrO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyYWdyYXBoID0gRE9NLmFwcGVuZChjb250YWluZXIsIERPTS4kKCdwJykpO1xuXHRcdHBhcmFncmFwaC50ZXh0Q29udGVudCA9IGxpbmUucmVwbGFjZSgvXFwqXFwqL2csICcnKTtcblx0XHRpbmRleCsrO1xuXHR9XG5cblx0cmV0dXJuIGNvbnRhaW5lcjtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gUmVuZGVyIGhlbHBlciBcdTIwMTQgY3JlYXRlcyB0aGUgZnVsbCBtYW5hZ2VtZW50IGVkaXRvclxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5hc3luYyBmdW5jdGlvbiByZW5kZXJFZGl0b3IoY3R4OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgb3B0aW9uczogSVJlbmRlckVkaXRvck9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3Qgd2lkdGggPSBvcHRpb25zLndpZHRoID8/IDkwMDtcblx0Y29uc3QgaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHQgPz8gNjAwO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cblx0Y29uc3QgaXNTZXNzaW9uc1dpbmRvdyA9IG9wdGlvbnMuaXNTZXNzaW9uc1dpbmRvdyA/PyBmYWxzZTtcblx0Y29uc3Qgc2tpbGxVSUludGVncmF0aW9ucyA9IG9wdGlvbnMuc2tpbGxVSUludGVncmF0aW9ucyA/PyBuZXcgTWFwKCk7XG5cdGNvbnN0IG1hbmFnZW1lbnRTZWN0aW9ucyA9IG9wdGlvbnMubWFuYWdlbWVudFNlY3Rpb25zID8/IFtcblx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMsXG5cdFx0QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzLFxuXHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkluc3RydWN0aW9ucyxcblx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ib29rcyxcblx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Qcm9tcHRzLFxuXHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnMsXG5cdFx0QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUGx1Z2lucyxcblx0XTtcblx0Y29uc3QgYXZhaWxhYmxlSGFybmVzc2VzID0gb3B0aW9ucy5hdmFpbGFibGVIYXJuZXNzZXMgPz8gW1xuXHRcdGNyZWF0ZVZTQ29kZUhhcm5lc3NEZXNjcmlwdG9yKCksXG5cdFx0e1xuXHRcdFx0aWQ6ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLFxuXHRcdFx0bGFiZWw6ICdDb3BpbG90IFtBZ2VudCBIb3N0XScsXG5cdFx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uc2VydmVyLmlkKSxcblx0XHRcdGhpZGRlblNlY3Rpb25zOiBbQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUHJvbXB0c10sXG5cdFx0XHRoaWRlR2VuZXJhdGVCdXR0b246IHRydWUsXG5cdFx0XHRpdGVtUHJvdmlkZXI6IGNyZWF0ZUZpeHR1cmVBZ2VudEhvc3RJdGVtUHJvdmlkZXIoYWxsRmlsZXMpLFxuXHRcdH0sXG5cdF07XG5cblx0Y29uc3QgYWxsTWNwU2VydmVycyA9IFsuLi5tY3BXb3Jrc3BhY2VTZXJ2ZXJzLCAuLi5tY3BVc2VyU2VydmVyc107XG5cdGNvbnN0IGZpeHR1cmVGaWxlcyA9IGFsbEZpbGVzLm1hcChmaWxlID0+ICh7IC4uLmZpbGUgfSkpO1xuXHRjb25zdCBmaWxlQ29udGVudHMgPSBjcmVhdGVGaXh0dXJlQ29udGVudE1hcChmaXh0dXJlRmlsZXMsIGFnZW50SW5zdHJ1Y3Rpb25zKTtcblx0Y29uc3QgcHJvbXB0RmlsZXNEaWRDaGFuZ2VFbWl0dGVyID0gY3R4LmRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdGNvbnN0IGNyZWF0ZWRGb2xkZXJzID0gbmV3IFJlc291cmNlU2V0KCk7XG5cblx0Ly8gSG9sZHMgYSBsYXp5IHJlZmVyZW5jZSB0byB0aGUgbW9kZWwgc2VydmljZSBzbyB0aGUgSVRleHRNb2RlbFNlcnZpY2UgbW9ja1xuXHQvLyAocmVnaXN0ZXJlZCBiZWxvdykgY2FuIGNyZWF0ZSByZWFsIElUZXh0TW9kZWwgaW5zdGFuY2VzIG9uIGRlbWFuZC4gVGhlXG5cdC8vIG1hbmFnZW1lbnQgZWRpdG9yIGNhbGxzIGBjcmVhdGVNb2RlbFJlZmVyZW5jZWAgd2hlbiB0aGUgdXNlciBvcGVucyBhblxuXHQvLyBpdGVtIFx1MjAxNCBmaXh0dXJlVXRpbHMnIGRlZmF1bHQgbW9jayByZXR1cm5zIGB7IHRleHRFZGl0b3JNb2RlbDogbnVsbCB9YCxcblx0Ly8gd2hpY2ggY3Jhc2hlcyB0aGUgZWRpdG9yLiBXZSBwb3B1bGF0ZSB0aGlzIGFmdGVyIHRoZSBpbnN0YW50aWF0aW9uXG5cdC8vIHNlcnZpY2UgaXMgY3JlYXRlZC5cblx0Y29uc3QgbW9kZWxTZXJ2aWNlUmVmOiB7IHZhbHVlOiBJTW9kZWxTZXJ2aWNlIHwgdW5kZWZpbmVkIH0gPSB7IHZhbHVlOiB1bmRlZmluZWQgfTtcblx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlUmVmOiB7IHZhbHVlOiBJTGFuZ3VhZ2VTZXJ2aWNlIHwgdW5kZWZpbmVkIH0gPSB7IHZhbHVlOiB1bmRlZmluZWQgfTtcblxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUVkaXRvclNlcnZpY2VzKGN0eC5kaXNwb3NhYmxlU3RvcmUsIHtcblx0XHRjb2xvclRoZW1lOiBjdHgudGhlbWUsXG5cdFx0YWRkaXRpb25hbFNlcnZpY2VzOiAocmVnKSA9PiB7XG5cdFx0XHRjb25zdCBoYXJuZXNzU2VydmljZSA9IGNyZWF0ZU1vY2tIYXJuZXNzU2VydmljZShvcHRpb25zLnNlc3Npb25SZXNvdXJjZSwgYXZhaWxhYmxlSGFybmVzc2VzKTtcblx0XHRcdGNvbnN0IGFnZW50RmVlZGJhY2tTZXJ2aWNlID0gY3JlYXRlTW9ja0FnZW50RmVlZGJhY2tTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBjb2RlUmV2aWV3U2VydmljZSA9IGNyZWF0ZU1vY2tDb2RlUmV2aWV3U2VydmljZSgpO1xuXHRcdFx0cmVnaXN0ZXJXb3JrYmVuY2hTZXJ2aWNlcyhyZWcpO1xuXHRcdFx0Ly8gRW5hYmxlIHRoZSBzdHJ1Y3R1cmVkIGN1c3RvbWl6YXRpb24gcHJldmlldyBzZXR0aW5nIHNvIHRoZVxuXHRcdFx0Ly8gZWRpdG9yIGV4ZXJjaXNlcyB0aGUgcHJldmlldy1maXJzdCBiZWhhdmlvciBpbiBmaXh0dXJlcy5cblx0XHRcdC8vIEFsc28gZW5hYmxlIHByb21wdCBtaWdyYXRpb24gc28gbWlncmF0aW9uIGFmZm9yZGFuY2VzIHJlbmRlciBpblxuXHRcdFx0Ly8gc2NyZWVuc2hvdCBmaXh0dXJlcyB0aGF0IGRlcGVuZCBvbiBhZ2VudC1ob3N0IGhhcm5lc3Nlcy5cblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHRbQ2hhdENvbmZpZ3VyYXRpb24uQ2hhdEN1c3RvbWl6YXRpb25zU3RydWN0dXJlZFByZXZpZXdFbmFibGVkXTogdHJ1ZSxcblx0XHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLkNoYXRDdXN0b21pemF0aW9uc1Byb21wdE1pZ3JhdGlvbkVuYWJsZWRdOiB0cnVlLFxuXHRcdFx0XHRbQ0hBVF9BVVRPTUFUSU9OU19FTkFCTEVEX1NFVFRJTkddOiBvcHRpb25zLmF1dG9tYXRpb25zRW5hYmxlZCA9PT0gdHJ1ZSxcblx0XHRcdH0pKTtcblx0XHRcdHJlZy5kZWZpbmUoSUxpc3RTZXJ2aWNlLCBMaXN0U2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVRleHRNb2RlbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRNb2RlbFNlcnZpY2U+KCkge1xuXHRcdFx0XHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlTW9kZWxSZWZlcmVuY2UocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVJlZmVyZW5jZTxJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw+PiB7XG5cdFx0XHRcdFx0Y29uc3QgbW9kZWxTZXJ2aWNlID0gbW9kZWxTZXJ2aWNlUmVmLnZhbHVlITtcblx0XHRcdFx0XHRjb25zdCBsYW5ndWFnZVNlcnZpY2UgPSBsYW5ndWFnZVNlcnZpY2VSZWYudmFsdWUhO1xuXHRcdFx0XHRcdGxldCBtb2RlbCA9IG1vZGVsU2VydmljZS5nZXRNb2RlbChyZXNvdXJjZSk7XG5cdFx0XHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IGxhbmd1YWdlU2VydmljZS5ndWVzc0xhbmd1YWdlSWRCeUZpbGVwYXRoT3JGaXJzdExpbmUocmVzb3VyY2UpID8/ICdwbGFpbnRleHQnO1xuXHRcdFx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VTZWxlY3Rpb24gPSBsYW5ndWFnZVNlcnZpY2UuY3JlYXRlQnlJZChsYW5ndWFnZUlkKTtcblx0XHRcdFx0XHRcdG1vZGVsID0gbW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsKCcnLCBsYW5ndWFnZVNlbGVjdGlvbiwgcmVzb3VyY2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBvbldpbGxEaXNwb3NlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRcdFx0XHRjb25zdCB0ZXh0RWRpdG9yTW9kZWw6IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCA9IHtcblx0XHRcdFx0XHRcdHRleHRFZGl0b3JNb2RlbDogbW9kZWwsXG5cdFx0XHRcdFx0XHRvbldpbGxEaXNwb3NlOiBvbldpbGxEaXNwb3NlLmV2ZW50LFxuXHRcdFx0XHRcdFx0aXNSZWFkb25seTogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdFx0XHRpc1Jlc29sdmVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRcdFx0aXNEaXNwb3NlZDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdFx0XHRnZXRMYW5ndWFnZUlkOiAoKSA9PiBtb2RlbC5nZXRMYW5ndWFnZUlkKCksXG5cdFx0XHRcdFx0XHRjcmVhdGVTbmFwc2hvdDogKCkgPT4gbW9kZWwuY3JlYXRlU25hcHNob3QoKSxcblx0XHRcdFx0XHRcdHJlc29sdmU6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IG9uV2lsbERpc3Bvc2UuZGlzcG9zZSgpLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0cmV0dXJuIHsgb2JqZWN0OiB0ZXh0RWRpdG9yTW9kZWwsIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdG92ZXJyaWRlIGNhbkhhbmRsZVJlc291cmNlKCkgeyByZXR1cm4gdHJ1ZTsgfVxuXHRcdFx0XHRvdmVycmlkZSByZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlcigpIHsgcmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyB9IH07IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50RmVlZGJhY2tTZXJ2aWNlLCBhZ2VudEZlZWRiYWNrU2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNvZGVSZXZpZXdTZXJ2aWNlLCBjb2RlUmV2aWV3U2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRFZGl0aW5nU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEVkaXRpbmdTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZWRpdGluZ1Nlc3Npb25zT2JzID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50U2Vzc2lvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG1vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRTZXNzaW9uc1NlcnZpY2VbJ21vZGVsJ10+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25zID0gW107XG5cdFx0XHRcdH0oKTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbigpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJUHJvbXB0c1NlcnZpY2UsIGNyZWF0ZU1vY2tQcm9tcHRzU2VydmljZShmaXh0dXJlRmlsZXMsIGFnZW50SW5zdHJ1Y3Rpb25zLCBmaWxlQ29udGVudHMsIHByb21wdEZpbGVzRGlkQ2hhbmdlRW1pdHRlci5ldmVudCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNTZXNzaW9uc1dpbmRvdyA9IGlzU2Vzc2lvbnNXaW5kb3c7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHdlbGNvbWVQYWdlRmVhdHVyZXMgPSB7XG5cdFx0XHRcdFx0c2hvd0dldHRpbmdTdGFydGVkQmFubmVyOiB0cnVlLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVQcm9qZWN0Um9vdCA9IG9ic2VydmFibGVWYWx1ZSgncm9vdCcsIFVSSS5maWxlKCcvd29ya3NwYWNlJykpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBoYXNPdmVycmlkZVByb2plY3RSb290ID0gb2JzZXJ2YWJsZVZhbHVlKCdoYXNPdmVycmlkZScsIGZhbHNlKTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0QWN0aXZlUHJvamVjdFJvb3QoKSB7IHJldHVybiBVUkkuZmlsZSgnL3dvcmtzcGFjZScpOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGNsZWFyT3ZlcnJpZGVQcm9qZWN0Um9vdCgpIHsgfVxuXHRcdFx0XHRvdmVycmlkZSBzZXRPdmVycmlkZVByb2plY3RSb290KCkgeyB9XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG1hbmFnZW1lbnRTZWN0aW9ucyA9IG1hbmFnZW1lbnRTZWN0aW9ucztcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZ2VuZXJhdGVDdXN0b21pemF0aW9uKCkgeyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldFNraWxsVUlJbnRlZ3JhdGlvbnMoKSB7IHJldHVybiBza2lsbFVJSW50ZWdyYXRpb25zOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIGhhcm5lc3NTZXJ2aWNlKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UsIGNyZWF0ZU1vY2tBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZShvcHRpb25zLmFjdGl2ZVNlc3Npb25NY3BTZXJ2ZXJzKSk7XG5cdFx0XHQvLyBBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsIGlzIHRoZSBzaW5nbGUgc291cmNlIG9mIHRydXRoIGZvciBpdGVtc1xuXHRcdFx0Ly8gaW4gdGhlIGVkaXRvci4gUmVnaXN0ZXIgdGhlIHJlYWwgaW1wbGVtZW50YXRpb24gXHUyMDE0IGl0IHdpbGwgcmVzb2x2ZVxuXHRcdFx0Ly8gaXRlbXMgdmlhIHRoZSBtb2NrIHByb21wdHMgc2VydmljZSAvIGhhcm5lc3Mgc2VydmljZSBhYm92ZS5cblx0XHRcdHJlZy5kZWZpbmUoSUFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwsIEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0U2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGdldEN1c3RvbWl6YXRpb25zKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldFJlZ2lzdGVyZWRDaGF0U2Vzc2lvbkl0ZW1Qcm92aWRlcnMoKSB7IHJldHVybiBbXTsgfVxuXHRcdFx0XHRvdmVycmlkZSBoYXNDdXN0b21pemF0aW9uc1Byb3ZpZGVyKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUF1dG9tYXRpb25TZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBdXRvbWF0aW9uU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGF1dG9tYXRpb25zID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcnVucyA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJ1bnNGb3IoKSB7IHJldHVybiBjb25zdE9ic2VydmFibGUoW10pOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBdXRvbWF0aW9uUnVubmVyLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBdXRvbWF0aW9uUnVubmVyPigpIHsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQXV0b21hdGlvbkRpYWxvZ1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUF1dG9tYXRpb25EaWFsb2dTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgc2hvd0F1dG9tYXRpb25EaWFsb2coKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUVkaXRvclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvclNlcnZpY2U+KCkgeyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElFZGl0b3JHcm91cHNTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JHcm91cHNTZXJ2aWNlPigpIHsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0V29ya3NwYWNlKCk6IElXb3Jrc3BhY2UgeyByZXR1cm4geyBpZDogJ3Rlc3QnLCBmb2xkZXJzOiBbXSB9OyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldFdvcmtiZW5jaFN0YXRlKCk6IFdvcmtiZW5jaFN0YXRlIHsgcmV0dXJuIFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJRmlsZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUZpbGVTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRGaWxlc0NoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGV4aXN0cyhyZXNvdXJjZTogVVJJKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZpbGVDb250ZW50cy5oYXMocmVzb3VyY2UpIHx8IGNyZWF0ZWRGb2xkZXJzLmhhcyhyZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmVhZEZpbGUocmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gZmlsZUNvbnRlbnRzLmdldChyZXNvdXJjZSkgPz8gJyc7XG5cdFx0XHRcdFx0cmV0dXJuIGNyZWF0ZUZpeHR1cmVGaWxlQ29udGVudFN0YXQocmVzb3VyY2UsIHZhbHVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBjcmVhdGVGb2xkZXIocmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0XHRcdGNyZWF0ZWRGb2xkZXJzLmFkZChyZXNvdXJjZSk7XG5cdFx0XHRcdFx0cmV0dXJuIGNyZWF0ZUZpeHR1cmVGaWxlU3RhdChyZXNvdXJjZSwgMCwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgd3JpdGVGaWxlKHJlc291cmNlOiBVUkksIGJ1ZmZlcjogVlNCdWZmZXIpIHtcblx0XHRcdFx0XHRmaWxlQ29udGVudHMuc2V0KHJlc291cmNlLCBidWZmZXIudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0Y3JlYXRlZEZvbGRlcnMuYWRkKGRpcm5hbWVVcmkocmVzb3VyY2UpKTtcblx0XHRcdFx0XHRpZiAocmVzb3VyY2UucGF0aC5lbmRzV2l0aCgnL1NLSUxMLm1kJykgJiYgIWZpeHR1cmVGaWxlcy5zb21lKGZpbGUgPT4gZmlsZS51cmkudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKSkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHNraWxsTmFtZSA9IHJlc291cmNlLnBhdGguc3BsaXQoJy8nKS5hdCgtMikgPz8gJ21pZ3JhdGVkLXNraWxsJztcblx0XHRcdFx0XHRcdGZpeHR1cmVGaWxlcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0dXJpOiByZXNvdXJjZSxcblx0XHRcdFx0XHRcdFx0c3RvcmFnZTogcmVzb3VyY2UucGF0aC5zdGFydHNXaXRoKCcvd29ya3NwYWNlLycpID8gUHJvbXB0c1N0b3JhZ2UubG9jYWwgOiBQcm9tcHRzU3RvcmFnZS51c2VyLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCxcblx0XHRcdFx0XHRcdFx0bmFtZTogc2tpbGxOYW1lLFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogYE1pZ3JhdGVkIGZyb20gcHJvbXB0ICR7c2tpbGxOYW1lfWAsXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cHJvbXB0RmlsZXNEaWRDaGFuZ2VFbWl0dGVyLmZpcmUoKTtcblx0XHRcdFx0XHRyZXR1cm4gY3JlYXRlRml4dHVyZUZpbGVTdGF0KHJlc291cmNlLCBidWZmZXIuYnl0ZUxlbmd0aCwgZmFsc2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGRlbChyZXNvdXJjZTogVVJJKSB7XG5cdFx0XHRcdFx0ZmlsZUNvbnRlbnRzLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0XHRcdFx0Y29uc3QgZmlsZUluZGV4ID0gZml4dHVyZUZpbGVzLmZpbmRJbmRleChmaWxlID0+IGZpbGUudXJpLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdGlmIChmaWxlSW5kZXggPj0gMCkge1xuXHRcdFx0XHRcdFx0Zml4dHVyZUZpbGVzLnNwbGljZShmaWxlSW5kZXgsIDEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwcm9tcHRGaWxlc0RpZENoYW5nZUVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElQYXRoU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUGF0aFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBkZWZhdWx0VXJpU2NoZW1lID0gJ2ZpbGUnO1xuXHRcdFx0XHRvdmVycmlkZSB1c2VySG9tZSgpOiBVUkk7XG5cdFx0XHRcdG92ZXJyaWRlIHVzZXJIb21lKCk6IFByb21pc2U8VVJJPjtcblx0XHRcdFx0b3ZlcnJpZGUgdXNlckhvbWUoKTogVVJJIHwgUHJvbWlzZTxVUkk+IHsgcmV0dXJuIHVzZXJIb21lOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElUZXh0TW9kZWxTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUZXh0TW9kZWxTZXJ2aWNlPigpIHtcblx0XHRcdFx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZU1vZGVsUmVmZXJlbmNlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElSZWZlcmVuY2U8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPj4ge1xuXHRcdFx0XHRcdGNvbnN0IG1vZGVsU2VydmljZSA9IG1vZGVsU2VydmljZVJlZi52YWx1ZSE7XG5cdFx0XHRcdFx0Y29uc3QgbGFuZ3VhZ2VTZXJ2aWNlID0gbGFuZ3VhZ2VTZXJ2aWNlUmVmLnZhbHVlITtcblx0XHRcdFx0XHRsZXQgbW9kZWwgPSBtb2RlbFNlcnZpY2UuZ2V0TW9kZWwocmVzb3VyY2UpO1xuXHRcdFx0XHRcdGlmICghbW9kZWwpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGxhbmd1YWdlSWQgPSBsYW5ndWFnZVNlcnZpY2UuZ3Vlc3NMYW5ndWFnZUlkQnlGaWxlcGF0aE9yRmlyc3RMaW5lKHJlc291cmNlKSA/PyAncGxhaW50ZXh0Jztcblx0XHRcdFx0XHRcdGNvbnN0IGxhbmd1YWdlU2VsZWN0aW9uID0gbGFuZ3VhZ2VTZXJ2aWNlLmNyZWF0ZUJ5SWQobGFuZ3VhZ2VJZCk7XG5cdFx0XHRcdFx0XHRtb2RlbCA9IG1vZGVsU2VydmljZS5jcmVhdGVNb2RlbChmaWxlQ29udGVudHMuZ2V0KHJlc291cmNlKSA/PyAnJywgbGFuZ3VhZ2VTZWxlY3Rpb24sIHJlc291cmNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3Qgb25XaWxsRGlzcG9zZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHRcdFx0Y29uc3QgdGV4dEVkaXRvck1vZGVsOiBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwgPSB7XG5cdFx0XHRcdFx0XHR0ZXh0RWRpdG9yTW9kZWw6IG1vZGVsLFxuXHRcdFx0XHRcdFx0b25XaWxsRGlzcG9zZTogb25XaWxsRGlzcG9zZS5ldmVudCxcblx0XHRcdFx0XHRcdGlzUmVhZG9ubHk6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRcdFx0aXNSZXNvbHZlZDogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0XHRcdGlzRGlzcG9zZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRcdFx0Z2V0TGFuZ3VhZ2VJZDogKCkgPT4gbW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpLFxuXHRcdFx0XHRcdFx0Y3JlYXRlU25hcHNob3Q6ICgpID0+IG1vZGVsLmNyZWF0ZVNuYXBzaG90KCksXG5cdFx0XHRcdFx0XHRyZXNvbHZlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiBvbldpbGxEaXNwb3NlLmRpc3Bvc2UoKSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHJldHVybiB7IG9iamVjdDogdGV4dEVkaXRvck1vZGVsLCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRvdmVycmlkZSBjYW5IYW5kbGVSZXNvdXJjZSgpIHsgcmV0dXJuIHRydWU7IH1cblx0XHRcdFx0b3ZlcnJpZGUgcmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIoKSB7IHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IHsgfSB9OyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElXb3JraW5nQ29weVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtpbmdDb3B5U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRGlydHkgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFNhdmUgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBpc0RpcnR5KF9yZXNvdXJjZTogVVJJKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJRXh0ZW5zaW9uU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0ZW5zaW9uU2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVF1aWNrSW5wdXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElRdWlja0lucHV0U2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVZpZXdzU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVmlld3NTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgb3BlblZpZXc8VCBleHRlbmRzIHt9PihfaWQ6IHN0cmluZywgX2ZvY3VzPzogYm9vbGVhbikgeyByZXR1cm4gbnVsbCBhcyBUIHwgbnVsbDsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJT3V0cHV0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJT3V0cHV0U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHNob3dDaGFubmVsKCkgeyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFdpZGdldFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBnZXQgbGFzdEZvY3VzZWRXaWRnZXQoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgcmV2ZWFsKCkgeyByZXR1cm4gZmFsc2U7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVJlcXVlc3RTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElSZXF1ZXN0U2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNYXJrZG93blJlbmRlcmVyU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlbmRlcihtYXJrZG93bjogSU1hcmtkb3duU3RyaW5nIHwgc3RyaW5nKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVuZGVyZWQ6IElSZW5kZXJlZE1hcmtkb3duID0ge1xuXHRcdFx0XHRcdFx0ZWxlbWVudDogcmVuZGVyRml4dHVyZU1hcmtkb3duKHR5cGVvZiBtYXJrZG93biA9PT0gJ3N0cmluZycgPyBtYXJrZG93biA6IG1hcmtkb3duLnZhbHVlKSxcblx0XHRcdFx0XHRcdGRpc3Bvc2UoKSB7IH0sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRyZXR1cm4gcmVuZGVyZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVdlYnZpZXdTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXZWJ2aWV3U2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU1jcFdvcmtiZW5jaFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU1jcFdvcmtiZW5jaFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkNoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uUmVzZXQgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBsb2NhbCA9IGFsbE1jcFNlcnZlcnM7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHF1ZXJ5TG9jYWwoKSB7IHJldHVybiBhbGxNY3BTZXJ2ZXJzOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGNhbkluc3RhbGwoKSB7IHJldHVybiB0cnVlIGFzIGNvbnN0OyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElNY3BTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNY3BTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2VydmVycyA9IGNvbnN0T2JzZXJ2YWJsZShtY3BSdW50aW1lU2VydmVycyBhcyBuZXZlcltdKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU1jcFJlZ2lzdHJ5LCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNY3BSZWdpc3RyeT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNvbGxlY3Rpb25zID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZGVsZWdhdGVzID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VJbnB1dHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRQbHVnaW5TZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFBsdWdpblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBwbHVnaW5zID0gY29uc3RPYnNlcnZhYmxlKGluc3RhbGxlZFBsdWdpbnMpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBlbmFibGVtZW50TW9kZWwgPSB1bmRlZmluZWQgYXMgbmV2ZXI7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVBsdWdpbk1hcmtldHBsYWNlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGluc3RhbGxlZFBsdWdpbnMgPSBjb25zdE9ic2VydmFibGUoW10pO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZU1hcmtldHBsYWNlcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElQbHVnaW5JbnN0YWxsU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUGx1Z2luSW5zdGFsbFNlcnZpY2U+KCkgeyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElQcm9kdWN0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUHJvZHVjdFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBkZWZhdWx0Q2hhdEFnZW50ID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxOb25OdWxsYWJsZTxJUHJvZHVjdFNlcnZpY2VbJ2RlZmF1bHRDaGF0QWdlbnQnXT4+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNoYXRFeHRlbnNpb25JZCA9ICdHaXRIdWIuY29waWxvdC1jaGF0Jztcblx0XHRcdFx0fSgpO1xuXHRcdFx0fSgpKTtcblx0XHR9LFxuXHR9KTtcblxuXHRtb2RlbFNlcnZpY2VSZWYudmFsdWUgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSU1vZGVsU2VydmljZSk7XG5cdGxhbmd1YWdlU2VydmljZVJlZi52YWx1ZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJTGFuZ3VhZ2VTZXJ2aWNlKTtcblx0Zm9yIChjb25zdCBbdXJpLCBjb250ZW50XSBvZiBmaWxlQ29udGVudHMpIHtcblx0XHRpZiAoIW1vZGVsU2VydmljZVJlZi52YWx1ZS5nZXRNb2RlbCh1cmkpKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IG1vZGVsU2VydmljZVJlZi52YWx1ZS5jcmVhdGVNb2RlbChjb250ZW50LCBudWxsLCB1cmksIGZhbHNlKTtcblx0XHRcdGN0eC5kaXNwb3NhYmxlU3RvcmUuYWRkKHsgZGlzcG9zZTogKCkgPT4gbW9kZWwuZGlzcG9zZSgpIH0pO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IGVkaXRvciA9IGN0eC5kaXNwb3NhYmxlU3RvcmUuYWRkKFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRFZGl0b3IsIGNyZWF0ZU1vY2tFZGl0b3JHcm91cCgpKVxuXHQpO1xuXHRlZGl0b3IuY3JlYXRlKGN0eC5jb250YWluZXIpO1xuXHRlZGl0b3IubGF5b3V0KG5ldyBEaW1lbnNpb24od2lkdGgsIGhlaWdodCkpO1xuXG5cdGNvbnN0IGVkaXRvcklucHV0ID0gY3R4LmRpc3Bvc2FibGVTdG9yZS5hZGQoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudEVkaXRvcklucHV0LmdldE9yQ3JlYXRlKCkpO1xuXHRhd2FpdCBlZGl0b3Iuc2V0SW5wdXQoZWRpdG9ySW5wdXQsIHVuZGVmaW5lZCwge30sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdGlmIChvcHRpb25zLnNlbGVjdGVkU2VjdGlvbikge1xuXHRcdGVkaXRvci5zZWxlY3RTZWN0aW9uQnlJZChvcHRpb25zLnNlbGVjdGVkU2VjdGlvbik7XG5cdH1cblxuXHRpZiAob3B0aW9ucy5zY3JvbGxUb0JvdHRvbSkge1xuXHRcdGVkaXRvci5yZXZlYWxMYXN0SXRlbSgpO1xuXHR9XG5cblx0aWYgKG9wdGlvbnMuc2hvd1Byb21wdE1pZ3JhdGlvblBhZ2UpIHtcblx0XHRlZGl0b3Iuc2hvd1Byb21wdE1pZ3JhdGlvblBhZ2UoKTtcblx0fVxuXG5cdGlmIChvcHRpb25zLm9wZW5GaXJzdEl0ZW0pIHtcblx0XHRjb25zdCB2aXNpYmxlQ29udGVudCA9IFsuLi5jdHguY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5wcm9tcHRzLWNvbnRlbnQtY29udGFpbmVyLCAubWNwLWNvbnRlbnQtY29udGFpbmVyLCAucGx1Z2luLWNvbnRlbnQtY29udGFpbmVyJyldXG5cdFx0XHQuZmluZChub2RlID0+IG5vZGUgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCAmJiBub2RlLnN0eWxlLmRpc3BsYXkgIT09ICdub25lJykgYXMgSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgb3Blbkl0ZW1MYWJlbCA9IG9wdGlvbnMub3Blbkl0ZW1MYWJlbDtcblx0XHRjb25zdCByb3dUb09wZW4gPSBvcGVuSXRlbUxhYmVsXG5cdFx0XHQ/IFsuLi4odmlzaWJsZUNvbnRlbnQ/LnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb25hY28tbGlzdC1yb3cnKSA/PyBbXSldLmZpbmQoKHJvdyk6IHJvdyBpcyBIVE1MRWxlbWVudCA9PiByb3cgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCAmJiByb3cudGV4dENvbnRlbnQ/LmluY2x1ZGVzKG9wZW5JdGVtTGFiZWwpKVxuXHRcdFx0OiB2aXNpYmxlQ29udGVudD8ucXVlcnlTZWxlY3RvcignLm1vbmFjby1saXN0LXJvdy5haS1jdXN0b21pemF0aW9uLWxpc3QtaXRlbSwgLm1vbmFjby1saXN0LXJvdy5tY3Atc2VydmVyLWl0ZW0nKSBhcyBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRpZiAocm93VG9PcGVuKSB7XG5cdFx0XHRyb3dUb09wZW4uZGlzcGF0Y2hFdmVudChuZXcgUG9pbnRlckV2ZW50KCdwb2ludGVyZG93bicsIHsgYnViYmxlczogdHJ1ZSwgYnV0dG9uOiAwIH0pKTtcblx0XHRcdHJvd1RvT3Blbi5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdtb3VzZWRvd24nLCB7IGJ1YmJsZXM6IHRydWUsIGJ1dHRvbjogMCB9KSk7XG5cdFx0XHRyb3dUb09wZW4uZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2V1cCcsIHsgYnViYmxlczogdHJ1ZSwgYnV0dG9uOiAwIH0pKTtcblx0XHRcdHJvd1RvT3Blbi5kaXNwYXRjaEV2ZW50KG5ldyBNb3VzZUV2ZW50KCdjbGljaycsIHsgYnViYmxlczogdHJ1ZSwgYnV0dG9uOiAwIH0pKTtcblxuXHRcdFx0aWYgKG9wdGlvbnMuZWRpdG9yRGlzcGxheU1vZGUgPT09ICdyYXcnKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVCdXR0b24gPSBjdHguY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5lZGl0b3ItbW9kZS1idXR0b24nKSBhcyBIVE1MQnV0dG9uRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRcdFx0bW9kZUJ1dHRvbj8uY2xpY2soKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gTUNQIEJyb3dzZSBNb2RlIFx1MjAxNCBzdGFuZGFsb25lIHdpZGdldCB3aXRoIGdhbGxlcnkgcmVzdWx0c1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBtYWtlR2FsbGVyeVNlcnZlcihpZDogc3RyaW5nLCBsYWJlbDogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCBwdWJsaXNoZXI6IHN0cmluZyk6IElXb3JrYmVuY2hNY3BTZXJ2ZXIge1xuXHRjb25zdCBnYWxsZXJ5U3R1YiA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8Tm9uTnVsbGFibGU8SVdvcmtiZW5jaE1jcFNlcnZlclsnZ2FsbGVyeSddPj4oKSB7IH0oKTtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtiZW5jaE1jcFNlcnZlcj4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaWQgPSBpZDtcblx0XHRvdmVycmlkZSByZWFkb25seSBuYW1lID0gaWQ7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbGFiZWwgPSBsYWJlbDtcblx0XHRvdmVycmlkZSByZWFkb25seSBkZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHB1Ymxpc2hlckRpc3BsYXlOYW1lID0gcHVibGlzaGVyO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGluc3RhbGxTdGF0ZSA9IE1jcFNlcnZlckluc3RhbGxTdGF0ZS5Vbmluc3RhbGxlZDtcblx0XHRvdmVycmlkZSByZWFkb25seSBnYWxsZXJ5ID0gZ2FsbGVyeVN0dWI7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbG9jYWwgPSB1bmRlZmluZWQ7XG5cdH0oKTtcbn1cblxuY29uc3QgZ2FsbGVyeVNlcnZlcnMgPSBbXG5cdG1ha2VHYWxsZXJ5U2VydmVyKCdnYWxsZXJ5LXBvc3RncmVzJywgJ1Bvc3RncmVTUUwnLCAnQWNjZXNzIFBvc3RncmVTUUwgZGF0YWJhc2VzIHdpdGggc2NoZW1hIGluc3BlY3Rpb24gYW5kIHF1ZXJ5IHRvb2xzJywgJ01pY3Jvc29mdCcpLFxuXHRtYWtlR2FsbGVyeVNlcnZlcignZ2FsbGVyeS1naXRodWInLCAnR2l0SHViJywgJ1JlcG9zaXRvcnkgbWFuYWdlbWVudCwgaXNzdWVzLCBwdWxsIHJlcXVlc3RzLCBhbmQgY29kZSBzZWFyY2gnLCAnR2l0SHViJyksXG5cdG1ha2VHYWxsZXJ5U2VydmVyKCdnYWxsZXJ5LXNsYWNrJywgJ1NsYWNrJywgJ1NlbmQgbWVzc2FnZXMsIG1hbmFnZSBjaGFubmVscywgYW5kIHNlYXJjaCB3b3Jrc3BhY2UgaGlzdG9yeScsICdTbGFjayBUZWNobm9sb2dpZXMnKSxcblx0bWFrZUdhbGxlcnlTZXJ2ZXIoJ2dhbGxlcnktZG9ja2VyJywgJ0RvY2tlcicsICdDb250YWluZXIgbGlmZWN5Y2xlIG1hbmFnZW1lbnQgYW5kIGltYWdlIG9wZXJhdGlvbnMnLCAnRG9ja2VyIEluYycpLFxuXHRtYWtlR2FsbGVyeVNlcnZlcignZ2FsbGVyeS1maWxlc3lzdGVtJywgJ0ZpbGVzeXN0ZW0nLCAnUmVhZCwgd3JpdGUsIGFuZCBuYXZpZ2F0ZSBsb2NhbCBmaWxlcyBhbmQgZGlyZWN0b3JpZXMnLCAnTWljcm9zb2Z0JyksXG5cdG1ha2VHYWxsZXJ5U2VydmVyKCdnYWxsZXJ5LWJyYXZlJywgJ0JyYXZlIFNlYXJjaCcsICdXZWIgYW5kIGxvY2FsIHNlYXJjaCBwb3dlcmVkIGJ5IHRoZSBCcmF2ZSBTZWFyY2ggQVBJJywgJ0JyYXZlIFNvZnR3YXJlJyksXG5cdG1ha2VHYWxsZXJ5U2VydmVyKCdnYWxsZXJ5LXB1cHBldGVlcicsICdQdXBwZXRlZXInLCAnQnJvd3NlciBhdXRvbWF0aW9uIHdpdGggc2NyZWVuc2hvdHMsIG5hdmlnYXRpb24sIGFuZCBmb3JtIGZpbGxpbmcnLCAnR29vZ2xlJyksXG5cdG1ha2VHYWxsZXJ5U2VydmVyKCdnYWxsZXJ5LW1lbW9yeScsICdNZW1vcnknLCAnS25vd2xlZGdlIGdyYXBoIGZvciBwZXJzaXN0ZW50IG1lbW9yeSBhY3Jvc3MgY29udmVyc2F0aW9ucycsICdNaWNyb3NvZnQnKSxcblx0bWFrZUdhbGxlcnlTZXJ2ZXIoJ2dhbGxlcnktZmV0Y2gnLCAnRmV0Y2gnLCAnUmV0cmlldmUgYW5kIGNvbnZlcnQgd2ViIGNvbnRlbnQgdG8gbWFya2Rvd24gZm9yIGFuYWx5c2lzJywgJ01pY3Jvc29mdCcpLFxuXHRtYWtlR2FsbGVyeVNlcnZlcignZ2FsbGVyeS1zZW50cnknLCAnU2VudHJ5JywgJ0Vycm9yIG1vbml0b3JpbmcsIGlzc3VlIHRyYWNraW5nLCBhbmQgcGVyZm9ybWFuY2UgdHJhY2luZycsICdTZW50cnknKSxcblx0bWFrZUdhbGxlcnlTZXJ2ZXIoJ2dhbGxlcnktc3FsaXRlJywgJ1NRTGl0ZScsICdRdWVyeSBhbmQgbWFuYWdlIFNRTGl0ZSBkYXRhYmFzZXMgd2l0aCBzY2hlbWEgZXhwbG9yYXRpb24nLCAnQ29tbXVuaXR5JyksXG5cdG1ha2VHYWxsZXJ5U2VydmVyKCdnYWxsZXJ5LXJlZGlzJywgJ1JlZGlzJywgJ0luLW1lbW9yeSBkYXRhIHN0b3JlIG9wZXJhdGlvbnMgYW5kIGtleSBtYW5hZ2VtZW50JywgJ1JlZGlzIEx0ZCcpLFxuXTtcblxuYXN5bmMgZnVuY3Rpb24gcmVuZGVyTWNwQnJvd3NlTW9kZShjdHg6IENvbXBvbmVudEZpeHR1cmVDb250ZXh0KTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IHdpZHRoID0gNjUwO1xuXHRjb25zdCBoZWlnaHQgPSA1MDA7XG5cdGN0eC5jb250YWluZXIuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdGN0eC5jb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUVkaXRvclNlcnZpY2VzKGN0eC5kaXNwb3NhYmxlU3RvcmUsIHtcblx0XHRjb2xvclRoZW1lOiBjdHgudGhlbWUsXG5cdFx0YWRkaXRpb25hbFNlcnZpY2VzOiAocmVnKSA9PiB7XG5cdFx0XHRyZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzKHJlZyk7XG5cdFx0XHRyZWcuZGVmaW5lKElMaXN0U2VydmljZSwgTGlzdFNlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElNY3BXb3JrYmVuY2hTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNY3BXb3JrYmVuY2hTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25DaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvblJlc2V0ID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbG9jYWw6IElXb3JrYmVuY2hNY3BTZXJ2ZXJbXSA9IFtdO1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBxdWVyeUxvY2FsKCkgeyByZXR1cm4gW107IH1cblx0XHRcdFx0b3ZlcnJpZGUgY2FuSW5zdGFsbCgpIHsgcmV0dXJuIHRydWUgYXMgY29uc3Q7IH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgcXVlcnlHYWxsZXJ5KCk6IFByb21pc2U8SUl0ZXJhdGl2ZVBhZ2VyPElXb3JrYmVuY2hNY3BTZXJ2ZXI+PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGZpcnN0UGFnZTogeyBpdGVtczogZ2FsbGVyeVNlcnZlcnMsIGhhc01vcmU6IGZhbHNlIH0sXG5cdFx0XHRcdFx0XHRhc3luYyBnZXROZXh0UGFnZSgpIHsgcmV0dXJuIHsgaXRlbXM6IFtdLCBoYXNNb3JlOiBmYWxzZSB9OyB9LFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU1jcFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU1jcFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBzZXJ2ZXJzID0gY29uc3RPYnNlcnZhYmxlKFtdIGFzIG5ldmVyW10pO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJTWNwUmVnaXN0cnksIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU1jcFJlZ2lzdHJ5PigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgY29sbGVjdGlvbnMgPSBjb25zdE9ic2VydmFibGUoW10pO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBkZWxlZ2F0ZXMgPSBjb25zdE9ic2VydmFibGUoW10pO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUlucHV0cyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBZ2VudFBsdWdpblNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50UGx1Z2luU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHBsdWdpbnMgPSBjb25zdE9ic2VydmFibGUoW10pO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJRGlhbG9nU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRGlhbG9nU2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpc1Nlc3Npb25zV2luZG93ID0gZmFsc2U7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHdlbGNvbWVQYWdlRmVhdHVyZXMgPSB7XG5cdFx0XHRcdFx0c2hvd0dldHRpbmdTdGFydGVkQmFubmVyOiB0cnVlLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVQcm9qZWN0Um9vdCA9IG9ic2VydmFibGVWYWx1ZSgncm9vdCcsIFVSSS5maWxlKCcvd29ya3NwYWNlJykpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBoYXNPdmVycmlkZVByb2plY3RSb290ID0gb2JzZXJ2YWJsZVZhbHVlKCdoYXNPdmVycmlkZScsIGZhbHNlKTtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0QWN0aXZlUHJvamVjdFJvb3QoKSB7IHJldHVybiBVUkkuZmlsZSgnL3dvcmtzcGFjZScpOyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25SZXNvdXJjZSA9IG9ic2VydmFibGVWYWx1ZTxVUkk+KCdhY3RpdmVTZXNzaW9uUmVzb3VyY2UnLCBMb2NhbENoYXRTZXNzaW9uVXJpLmdldE5ld1Nlc3Npb25VcmkoKSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZUhhcm5lc3MgPSBkZXJpdmVkKHJlYWRlciA9PiBnZXRDaGF0U2Vzc2lvblR5cGUodGhpcy5hY3RpdmVTZXNzaW9uUmVzb3VyY2UucmVhZChyZWFkZXIpKSk7XG5cdFx0XHRcdG92ZXJyaWRlIGdldEFjdGl2ZURlc2NyaXB0b3IoKSB7IHJldHVybiBjcmVhdGVWU0NvZGVIYXJuZXNzRGVzY3JpcHRvcigpOyB9XG5cdFx0XHRcdG92ZXJyaWRlIHJlZ2lzdGVyRXh0ZXJuYWxIYXJuZXNzKCkgeyByZXR1cm4geyBkaXNwb3NlKCkgeyB9IH07IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLCBjcmVhdGVNb2NrQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UoKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU91dHB1dFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU91dHB1dFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBzaG93Q2hhbm5lbCgpIHsgfVxuXHRcdFx0fSgpKTtcblx0XHR9LFxuXHR9KTtcblxuXHRjb25zdCB3aWRnZXQgPSBjdHguZGlzcG9zYWJsZVN0b3JlLmFkZChcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNY3BMaXN0V2lkZ2V0KVxuXHQpO1xuXHRjdHguY29udGFpbmVyLmFwcGVuZENoaWxkKHdpZGdldC5lbGVtZW50KTtcblx0d2lkZ2V0LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblxuXHQvLyBDbGljayB0aGUgQnJvd3NlIE1hcmtldHBsYWNlIGJ1dHRvbiB0byBlbnRlciBicm93c2UgbW9kZVxuXHRjb25zdCBicm93c2VCdXR0b24gPSB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcubGlzdC1hZGQtYnV0dG9uJykgYXMgSFRNTEVsZW1lbnQ7XG5cdGJyb3dzZUJ1dHRvbj8uY2xpY2soKTtcblxuXHQvLyBXYWl0IGZvciB0aGUgZ2FsbGVyeSBxdWVyeSB0byByZXNvbHZlXG5cdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCA1MCkpO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBQbHVnaW4gQnJvd3NlIE1vZGUgXHUyMDE0IHN0YW5kYWxvbmUgd2lkZ2V0IHdpdGggbWFya2V0cGxhY2UgcmVzdWx0c1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiBtYWtlSW5zdGFsbGVkUGx1Z2luKG5hbWU6IHN0cmluZywgdXJpOiBVUkksIGVuYWJsZWQ6IGJvb2xlYW4pOiBJQWdlbnRQbHVnaW4ge1xuXHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRQbHVnaW4+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHVyaSA9IHVyaTtcblx0XHRvdmVycmlkZSByZWFkb25seSBmb3JtYXQgPSBQbHVnaW5Gb3JtYXQuQ29waWxvdDtcblx0XHRvdmVycmlkZSByZWFkb25seSBsYWJlbCA9IG5hbWU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZW5hYmxlbWVudCA9IGNvbnN0T2JzZXJ2YWJsZShlbmFibGVkID8gQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlIDogQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkUHJvZmlsZSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaG9va3MgPSBjb25zdE9ic2VydmFibGUoW10pO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNvbW1hbmRzID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBza2lsbHMgPSBjb25zdE9ic2VydmFibGUoW10pO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFnZW50cyA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaW5zdHJ1Y3Rpb25zID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBtY3BTZXJ2ZXJEZWZpbml0aW9ucyA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdFx0b3ZlcnJpZGUgcmVtb3ZlKCkgeyB9XG5cdH0oKTtcbn1cblxuY29uc3QgaW5zdGFsbGVkUGx1Z2luczogSUFnZW50UGx1Z2luW10gPSBbXG5cdG1ha2VJbnN0YWxsZWRQbHVnaW4oJ0xpbmVhcicsIFVSSS5maWxlKCcvd29ya3NwYWNlLy5jb3BpbG90L3BsdWdpbnMvbGluZWFyJyksIHRydWUpLFxuXHRtYWtlSW5zdGFsbGVkUGx1Z2luKCdTZW50cnknLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY29waWxvdC9wbHVnaW5zL3NlbnRyeScpLCB0cnVlKSxcblx0bWFrZUluc3RhbGxlZFBsdWdpbignRGF0YWRvZycsIFVSSS5maWxlKCcvd29ya3NwYWNlLy5jb3BpbG90L3BsdWdpbnMvZGF0YWRvZycpLCB0cnVlKSxcblx0bWFrZUluc3RhbGxlZFBsdWdpbignTm90aW9uJywgVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNvcGlsb3QvcGx1Z2lucy9ub3Rpb24nKSwgdHJ1ZSksXG5cdG1ha2VJbnN0YWxsZWRQbHVnaW4oJ0NvbmZsdWVuY2UnLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY29waWxvdC9wbHVnaW5zL2NvbmZsdWVuY2UnKSwgdHJ1ZSksXG5cdG1ha2VJbnN0YWxsZWRQbHVnaW4oJ1BhZ2VyRHV0eScsIFVSSS5maWxlKCcvd29ya3NwYWNlLy5jb3BpbG90L3BsdWdpbnMvcGFnZXJkdXR5JyksIGZhbHNlKSxcblx0bWFrZUluc3RhbGxlZFBsdWdpbignTGF1bmNoRGFya2x5JywgVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNvcGlsb3QvcGx1Z2lucy9sYXVuY2hkYXJrbHknKSwgdHJ1ZSksXG5cdG1ha2VJbnN0YWxsZWRQbHVnaW4oJ0NpcmNsZUNJJywgVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNvcGlsb3QvcGx1Z2lucy9jaXJjbGVjaScpLCB0cnVlKSxcblx0bWFrZUluc3RhbGxlZFBsdWdpbignVmVyY2VsJywgVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNvcGlsb3QvcGx1Z2lucy92ZXJjZWwnKSwgZmFsc2UpLFxuXHRtYWtlSW5zdGFsbGVkUGx1Z2luKCdTdXBhYmFzZScsIFVSSS5maWxlKCcvd29ya3NwYWNlLy5jb3BpbG90L3BsdWdpbnMvc3VwYWJhc2UnKSwgdHJ1ZSksXG5dO1xuXG5mdW5jdGlvbiBtYWtlTWFya2V0cGxhY2VQbHVnaW4obmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCByZXBvOiBzdHJpbmcpOiBJTWFya2V0cGxhY2VQbHVnaW4ge1xuXHRyZXR1cm4ge1xuXHRcdG5hbWUsXG5cdFx0ZGVzY3JpcHRpb24sXG5cdFx0dmVyc2lvbjogJzEuMC4wJyxcblx0XHRzb3VyY2U6IHJlcG8sXG5cdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogYGV4YW1wbGUvJHtyZXBvfWAgfSxcblx0XHRtYXJrZXRwbGFjZTogJ2NvcGlsb3QnLFxuXHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiB7IHJhd1ZhbHVlOiBgZXhhbXBsZS8ke3JlcG99YCwgZGlzcGxheUxhYmVsOiByZXBvLCBjbG9uZVVybDogYGh0dHBzOi8vZ2l0aHViLmNvbS9leGFtcGxlLyR7cmVwb30uZ2l0YCwgY2Fub25pY2FsSWQ6IGBnaXRodWI6ZXhhbXBsZS8ke3JlcG99YCwgY2FjaGVTZWdtZW50czogWydleGFtcGxlJywgcmVwb10sIGtpbmQ6IE1hcmtldHBsYWNlUmVmZXJlbmNlS2luZC5HaXRIdWJTaG9ydGhhbmQgfSxcblx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHR9O1xufVxuXG5jb25zdCBtYXJrZXRwbGFjZVBsdWdpbnM6IElNYXJrZXRwbGFjZVBsdWdpbltdID0gW1xuXHRtYWtlTWFya2V0cGxhY2VQbHVnaW4oJ0xpbmVhcicsICdJc3N1ZSB0cmFja2luZyBhbmQgcHJvamVjdCBtYW5hZ2VtZW50IGludGVncmF0aW9uJywgJ2xpbmVhci1wbHVnaW4nKSxcblx0bWFrZU1hcmtldHBsYWNlUGx1Z2luKCdTZW50cnknLCAnRXJyb3IgbW9uaXRvcmluZyBhbmQgcGVyZm9ybWFuY2UgdHJhY2luZycsICdzZW50cnktcGx1Z2luJyksXG5cdG1ha2VNYXJrZXRwbGFjZVBsdWdpbignRGF0YWRvZycsICdPYnNlcnZhYmlsaXR5IGFuZCBtb25pdG9yaW5nIGRhc2hib2FyZHMnLCAnZGF0YWRvZy1wbHVnaW4nKSxcblx0bWFrZU1hcmtldHBsYWNlUGx1Z2luKCdOb3Rpb24nLCAnS25vd2xlZGdlIGJhc2UgYW5kIGRvY3VtZW50YXRpb24gbWFuYWdlbWVudCcsICdub3Rpb24tcGx1Z2luJyksXG5cdG1ha2VNYXJrZXRwbGFjZVBsdWdpbignRmlnbWEnLCAnRGVzaWduIHN5c3RlbSBpbnNwZWN0aW9uIGFuZCBhc3NldCBleHBvcnQnLCAnZmlnbWEtcGx1Z2luJyksXG5cdG1ha2VNYXJrZXRwbGFjZVBsdWdpbignU3RyaXBlJywgJ1BheW1lbnQgcHJvY2Vzc2luZyBhbmQgYmlsbGluZyBtYW5hZ2VtZW50JywgJ3N0cmlwZS1wbHVnaW4nKSxcblx0bWFrZU1hcmtldHBsYWNlUGx1Z2luKCdUd2lsaW8nLCAnQ29tbXVuaWNhdGlvbiBBUElzIGZvciBTTVMgYW5kIHZvaWNlJywgJ3R3aWxpby1wbHVnaW4nKSxcblx0bWFrZU1hcmtldHBsYWNlUGx1Z2luKCdBdXRoMCcsICdJZGVudGl0eSBhbmQgYWNjZXNzIG1hbmFnZW1lbnQnLCAnYXV0aDAtcGx1Z2luJyksXG5cdG1ha2VNYXJrZXRwbGFjZVBsdWdpbignQWxnb2xpYScsICdTZWFyY2ggYW5kIGRpc2NvdmVyeSBBUEkgaW50ZWdyYXRpb24nLCAnYWxnb2xpYS1wbHVnaW4nKSxcblx0bWFrZU1hcmtldHBsYWNlUGx1Z2luKCdMYXVuY2hEYXJrbHknLCAnRmVhdHVyZSBmbGFnIG1hbmFnZW1lbnQgYW5kIGV4cGVyaW1lbnRhdGlvbicsICdsYXVuY2hkYXJrbHktcGx1Z2luJyksXG5cdG1ha2VNYXJrZXRwbGFjZVBsdWdpbignUGxhbmV0U2NhbGUnLCAnU2VydmVybGVzcyBNeVNRTCBkYXRhYmFzZSBtYW5hZ2VtZW50JywgJ3BsYW5ldHNjYWxlLXBsdWdpbicpLFxuXHRtYWtlTWFya2V0cGxhY2VQbHVnaW4oJ1ZlcmNlbCcsICdEZXBsb3ltZW50IGFuZCBwcmV2aWV3IGVudmlyb25tZW50cycsICd2ZXJjZWwtcGx1Z2luJyksXG5dO1xuXG5hc3luYyBmdW5jdGlvbiByZW5kZXJQbHVnaW5Ccm93c2VNb2RlKGN0eDogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3Qgd2lkdGggPSA2NTA7XG5cdGNvbnN0IGhlaWdodCA9IDUwMDtcblx0Y3R4LmNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0Y3R4LmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXG5cdC8vIFNvbWUgbWFya2V0cGxhY2UgcGx1Z2lucyBtYXRjaCBpbnN0YWxsZWQgcGx1Z2lucyBieSBVUkkgc28gdGhlIHJlbmRlcmVyXG5cdC8vIHNob3dzIHRoZW0gYXMgXCJJbnN0YWxsZWRcIiAoZXhlcmNpc2VzIHRoZSBpbnN0YWxsZWQtc3RhdGUgY2hlY2sgZnJvbSAjNzM3OSkuXG5cdGNvbnN0IGJyb3dzZUluc3RhbGxlZFBsdWdpbnMgPSBbXG5cdFx0bWFrZUluc3RhbGxlZFBsdWdpbignTGluZWFyJywgVVJJLmZpbGUoJy9ob21lL2Rldi8udnNjb2RlL2FnZW50LXBsdWdpbnMvZXhhbXBsZS9saW5lYXItcGx1Z2luJyksIHRydWUpLFxuXHRcdG1ha2VJbnN0YWxsZWRQbHVnaW4oJ1NlbnRyeScsIFVSSS5maWxlKCcvaG9tZS9kZXYvLnZzY29kZS9hZ2VudC1wbHVnaW5zL2V4YW1wbGUvc2VudHJ5LXBsdWdpbicpLCB0cnVlKSxcblx0XHRtYWtlSW5zdGFsbGVkUGx1Z2luKCdEYXRhZG9nJywgVVJJLmZpbGUoJy9ob21lL2Rldi8udnNjb2RlL2FnZW50LXBsdWdpbnMvZXhhbXBsZS9kYXRhZG9nLXBsdWdpbicpLCBmYWxzZSksXG5cdF07XG5cblx0Ly8gTWFwIHBsdWdpbiBzb3VyY2UgZGVzY3JpcHRvcnMgdG8gaW5zdGFsbCBVUklzLCBtYXRjaGluZyBpbnN0YWxsZWQgVVJJcyBhYm92ZVxuXHRjb25zdCBwbHVnaW5JbnN0YWxsVXJpcyA9IG5ldyBNYXA8c3RyaW5nLCBVUkk+KFtcblx0XHRbJ2V4YW1wbGUvbGluZWFyLXBsdWdpbicsIFVSSS5maWxlKCcvaG9tZS9kZXYvLnZzY29kZS9hZ2VudC1wbHVnaW5zL2V4YW1wbGUvbGluZWFyLXBsdWdpbicpXSxcblx0XHRbJ2V4YW1wbGUvc2VudHJ5LXBsdWdpbicsIFVSSS5maWxlKCcvaG9tZS9kZXYvLnZzY29kZS9hZ2VudC1wbHVnaW5zL2V4YW1wbGUvc2VudHJ5LXBsdWdpbicpXSxcblx0XHRbJ2V4YW1wbGUvZGF0YWRvZy1wbHVnaW4nLCBVUkkuZmlsZSgnL2hvbWUvZGV2Ly52c2NvZGUvYWdlbnQtcGx1Z2lucy9leGFtcGxlL2RhdGFkb2ctcGx1Z2luJyldLFxuXHRdKTtcblxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUVkaXRvclNlcnZpY2VzKGN0eC5kaXNwb3NhYmxlU3RvcmUsIHtcblx0XHRjb2xvclRoZW1lOiBjdHgudGhlbWUsXG5cdFx0YWRkaXRpb25hbFNlcnZpY2VzOiAocmVnKSA9PiB7XG5cdFx0XHRyZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzKHJlZyk7XG5cdFx0XHRyZWcuZGVmaW5lKElMaXN0U2VydmljZSwgTGlzdFNlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25SZXNvdXJjZSA9IG9ic2VydmFibGVWYWx1ZTxVUkk+KCdhY3RpdmVTZXNzaW9uUmVzb3VyY2UnLCBMb2NhbENoYXRTZXNzaW9uVXJpLmdldE5ld1Nlc3Npb25VcmkoKSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZUhhcm5lc3MgPSBkZXJpdmVkKHJlYWRlciA9PiBnZXRDaGF0U2Vzc2lvblR5cGUodGhpcy5hY3RpdmVTZXNzaW9uUmVzb3VyY2UucmVhZChyZWFkZXIpKSk7XG5cdFx0XHRcdG92ZXJyaWRlIGdldEFjdGl2ZURlc2NyaXB0b3IoKSB7IHJldHVybiBjcmVhdGVWU0NvZGVIYXJuZXNzRGVzY3JpcHRvcigpOyB9XG5cdFx0XHRcdG92ZXJyaWRlIHJlZ2lzdGVyRXh0ZXJuYWxIYXJuZXNzKCkgeyByZXR1cm4geyBkaXNwb3NlKCkgeyB9IH07IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50UGx1Z2luU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRQbHVnaW5TZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcGx1Z2lucyA9IGNvbnN0T2JzZXJ2YWJsZShicm93c2VJbnN0YWxsZWRQbHVnaW5zIGFzIHJlYWRvbmx5IElBZ2VudFBsdWdpbltdKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZW5hYmxlbWVudE1vZGVsID0gdW5kZWZpbmVkITtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVBsdWdpbk1hcmtldHBsYWNlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaW5zdGFsbGVkUGx1Z2lucyA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTWFya2V0cGxhY2VzID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgZmV0Y2hNYXJrZXRwbGFjZVBsdWdpbnMoKSB7IHJldHVybiBtYXJrZXRwbGFjZVBsdWdpbnM7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVBsdWdpbkluc3RhbGxTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQbHVnaW5JbnN0YWxsU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGdldFBsdWdpbkluc3RhbGxVcmkocGx1Z2luOiBJTWFya2V0cGxhY2VQbHVnaW4pIHtcblx0XHRcdFx0XHRjb25zdCByZXBvID0gcGx1Z2luLnNvdXJjZURlc2NyaXB0b3Iua2luZCA9PT0gUGx1Z2luU291cmNlS2luZC5HaXRIdWIgPyBwbHVnaW4uc291cmNlRGVzY3JpcHRvci5yZXBvIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHJldHVybiByZXBvID8gKHBsdWdpbkluc3RhbGxVcmlzLmdldChyZXBvKSA/PyBVUkkuZmlsZSgnL2Rldi9udWxsJykpIDogVVJJLmZpbGUoJy9kZXYvbnVsbCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsLCBjcmVhdGVNb2NrQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCgpKTtcblx0XHR9LFxuXHR9KTtcblxuXHRjb25zdCB3aWRnZXQgPSBjdHguZGlzcG9zYWJsZVN0b3JlLmFkZChcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQbHVnaW5MaXN0V2lkZ2V0KVxuXHQpO1xuXHRjdHguY29udGFpbmVyLmFwcGVuZENoaWxkKHdpZGdldC5lbGVtZW50KTtcblx0d2lkZ2V0LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblxuXHQvLyBDbGljayB0aGUgQnJvd3NlIE1hcmtldHBsYWNlIGJ1dHRvbiB0byBlbnRlciBicm93c2UgbW9kZVxuXHRjb25zdCBicm93c2VCdXR0b24gPSB3aWRnZXQuZWxlbWVudC5xdWVyeVNlbGVjdG9yKCcubGlzdC1hZGQtYnV0dG9uJykgYXMgSFRNTEVsZW1lbnQ7XG5cdGJyb3dzZUJ1dHRvbj8uY2xpY2soKTtcblxuXHQvLyBXYWl0IGZvciB0aGUgbWFya2V0cGxhY2UgcXVlcnkgdG8gcmVzb2x2ZSwgdGhlbiB3YWl0IGZvciBzY3JvbGxiYXIgZmFkZSB0cmFuc2l0aW9uXG5cdC8vICh2aXNpYmxlIFx1MjE5MiBpbnZpc2libGUgdGFrZXMgfjJzIGFmdGVyIHByb2dyYW1tYXRpYyBzY3JvbGwvbGlzdCBwb3B1bGF0ZSlcblx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDEwMCkpO1xuXHQvLyBCbHVyIHRoZSBzZWFyY2ggaW5wdXQgdG8gcHJldmVudCBjdXJzb3IgYmxpbmsgaW5zdGFiaWxpdHkgaW4gc2NyZWVuc2hvdHNcblx0KHdpZGdldC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2lucHV0JykgYXMgSFRNTEVsZW1lbnQpPy5ibHVyKCk7XG5cdC8vIEZvcmNlLWhpZGUgc2Nyb2xsYmFycyB0byBhdm9pZCBmYWRlLXRyYW5zaXRpb24gaW5zdGFiaWxpdHlcblx0Zm9yIChjb25zdCBzY3JvbGxiYXIgb2Ygd2lkZ2V0LmVsZW1lbnQucXVlcnlTZWxlY3RvckFsbDxIVE1MRWxlbWVudD4oJy5zY3JvbGxiYXInKSkge1xuXHRcdHNjcm9sbGJhci5zdHlsZS52aXNpYmlsaXR5ID0gJ2hpZGRlbic7XG5cdH1cblx0YXdhaXQgbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDIwMCkpO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBNQ1AgLyBQbHVnaW4gRGlzYWJsZWQgKGFjY2VzcyBibG9ja2VkKSBzcGxhc2hcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gY3JlYXRlRGlzYWJsZWRDb25maWdTZXJ2aWNlKGtleTogc3RyaW5nLCBkaXNhYmxlZFZhbHVlOiB1bmtub3duLCBieVBvbGljeTogYm9vbGVhbik6IElDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDb25maWd1cmF0aW9uU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VDb25maWd1cmF0aW9uID0gRXZlbnQuTm9uZTtcblx0XHRvdmVycmlkZSBnZXRWYWx1ZTxUPihhcmcxPzogc3RyaW5nIHwgb2JqZWN0LCBfYXJnMj86IG9iamVjdCk6IFQge1xuXHRcdFx0Y29uc3QgayA9IHR5cGVvZiBhcmcxID09PSAnc3RyaW5nJyA/IGFyZzEgOiB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4gKGsgPT09IGtleSA/IGRpc2FibGVkVmFsdWUgOiB1bmRlZmluZWQpIGFzIFQ7XG5cdFx0fVxuXHRcdG92ZXJyaWRlIGluc3BlY3Q8VD4oazogc3RyaW5nKTogSUNvbmZpZ3VyYXRpb25WYWx1ZTxUPiB7XG5cdFx0XHRpZiAoayAhPT0ga2V5KSB7XG5cdFx0XHRcdHJldHVybiB7IHZhbHVlOiB1bmRlZmluZWQsIGRlZmF1bHRWYWx1ZTogdW5kZWZpbmVkIH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR2YWx1ZTogZGlzYWJsZWRWYWx1ZSBhcyBULFxuXHRcdFx0XHRkZWZhdWx0VmFsdWU6IGRpc2FibGVkVmFsdWUgYXMgVCxcblx0XHRcdFx0cG9saWN5VmFsdWU6IGJ5UG9saWN5ID8gKGRpc2FibGVkVmFsdWUgYXMgVCkgOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH1cblx0fSgpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJNY3BEaXNhYmxlZChjdHg6IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBieVBvbGljeTogYm9vbGVhbik6IHZvaWQge1xuXHRjb25zdCB3aWR0aCA9IDY1MDtcblx0Y29uc3QgaGVpZ2h0ID0gNTAwO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhjdHguZGlzcG9zYWJsZVN0b3JlLCB7XG5cdFx0Y29sb3JUaGVtZTogY3R4LnRoZW1lLFxuXHRcdGFkZGl0aW9uYWxTZXJ2aWNlczogKHJlZykgPT4ge1xuXHRcdFx0cmVnaXN0ZXJXb3JrYmVuY2hTZXJ2aWNlcyhyZWcpO1xuXHRcdFx0cmVnLmRlZmluZShJTGlzdFNlcnZpY2UsIExpc3RTZXJ2aWNlKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNyZWF0ZURpc2FibGVkQ29uZmlnU2VydmljZShtY3BBY2Nlc3NDb25maWcsIE1jcEFjY2Vzc1ZhbHVlLk5vbmUsIGJ5UG9saWN5KSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU1jcFdvcmtiZW5jaFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU1jcFdvcmtiZW5jaFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkNoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uUmVzZXQgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBsb2NhbDogSVdvcmtiZW5jaE1jcFNlcnZlcltdID0gW107XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElNY3BTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNY3BTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2VydmVycyA9IGNvbnN0T2JzZXJ2YWJsZShbXSBhcyBuZXZlcltdKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU1jcFJlZ2lzdHJ5LCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNY3BSZWdpc3RyeT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNvbGxlY3Rpb25zID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZGVsZWdhdGVzID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VJbnB1dHMgPSBFdmVudC5Ob25lO1xuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQWdlbnRQbHVnaW5TZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBZ2VudFBsdWdpblNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBwbHVnaW5zID0gY29uc3RPYnNlcnZhYmxlKFtdKTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSURpYWxvZ1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SURpYWxvZ1NlcnZpY2U+KCkgeyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNTZXNzaW9uc1dpbmRvdyA9IGZhbHNlO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSB3ZWxjb21lUGFnZUZlYXR1cmVzID0geyBzaG93R2V0dGluZ1N0YXJ0ZWRCYW5uZXI6IHRydWUgfTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlUHJvamVjdFJvb3QgPSBvYnNlcnZhYmxlVmFsdWUoJ3Jvb3QnLCBVUkkuZmlsZSgnL3dvcmtzcGFjZScpKTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaGFzT3ZlcnJpZGVQcm9qZWN0Um9vdCA9IG9ic2VydmFibGVWYWx1ZSgnaGFzT3ZlcnJpZGUnLCBmYWxzZSk7XG5cdFx0XHRcdG92ZXJyaWRlIGdldEFjdGl2ZVByb2plY3RSb290KCkgeyByZXR1cm4gVVJJLmZpbGUoJy93b3Jrc3BhY2UnKTsgfVxuXHRcdFx0fSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uUmVzb3VyY2UgPSBvYnNlcnZhYmxlVmFsdWU8VVJJPignYWN0aXZlU2Vzc2lvblJlc291cmNlJywgTG9jYWxDaGF0U2Vzc2lvblVyaS5nZXROZXdTZXNzaW9uVXJpKCkpO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVIYXJuZXNzID0gZGVyaXZlZChyZWFkZXIgPT4gZ2V0Q2hhdFNlc3Npb25UeXBlKHRoaXMuYWN0aXZlU2Vzc2lvblJlc291cmNlLnJlYWQocmVhZGVyKSkpO1xuXHRcdFx0XHRvdmVycmlkZSBnZXRBY3RpdmVEZXNjcmlwdG9yKCkgeyByZXR1cm4gY3JlYXRlVlNDb2RlSGFybmVzc0Rlc2NyaXB0b3IoKTsgfVxuXHRcdFx0XHRvdmVycmlkZSByZWdpc3RlckV4dGVybmFsSGFybmVzcygpIHsgcmV0dXJuIHsgZGlzcG9zZSgpIHsgfSB9OyB9XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZSwgY3JlYXRlTW9ja0FnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElPdXRwdXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElPdXRwdXRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgc2hvd0NoYW5uZWwoKSB7IH1cblx0XHRcdH0oKSk7XG5cdFx0fSxcblx0fSk7XG5cblx0Y29uc3Qgd2lkZ2V0ID0gY3R4LmRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwTGlzdFdpZGdldCkpO1xuXHRjdHguY29udGFpbmVyLmFwcGVuZENoaWxkKHdpZGdldC5lbGVtZW50KTtcblx0d2lkZ2V0LmxheW91dChoZWlnaHQsIHdpZHRoKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyUGx1Z2luRGlzYWJsZWQoY3R4OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgYnlQb2xpY3k6IGJvb2xlYW4pOiB2b2lkIHtcblx0Y29uc3Qgd2lkdGggPSA2NTA7XG5cdGNvbnN0IGhlaWdodCA9IDUwMDtcblx0Y3R4LmNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0Y3R4LmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoY3R4LmRpc3Bvc2FibGVTdG9yZSwge1xuXHRcdGNvbG9yVGhlbWU6IGN0eC50aGVtZSxcblx0XHRhZGRpdGlvbmFsU2VydmljZXM6IChyZWcpID0+IHtcblx0XHRcdHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMocmVnKTtcblx0XHRcdHJlZy5kZWZpbmUoSUxpc3RTZXJ2aWNlLCBMaXN0U2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjcmVhdGVEaXNhYmxlZENvbmZpZ1NlcnZpY2UoQ2hhdENvbmZpZ3VyYXRpb24uUGx1Z2luc0VuYWJsZWQsIGZhbHNlLCBieVBvbGljeSkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25SZXNvdXJjZSA9IG9ic2VydmFibGVWYWx1ZTxVUkk+KCdhY3RpdmVTZXNzaW9uUmVzb3VyY2UnLCBMb2NhbENoYXRTZXNzaW9uVXJpLmdldE5ld1Nlc3Npb25VcmkoKSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZUhhcm5lc3MgPSBkZXJpdmVkKHJlYWRlciA9PiBnZXRDaGF0U2Vzc2lvblR5cGUodGhpcy5hY3RpdmVTZXNzaW9uUmVzb3VyY2UucmVhZChyZWFkZXIpKSk7XG5cdFx0XHRcdG92ZXJyaWRlIGdldEFjdGl2ZURlc2NyaXB0b3IoKSB7IHJldHVybiBjcmVhdGVWU0NvZGVIYXJuZXNzRGVzY3JpcHRvcigpOyB9XG5cdFx0XHRcdG92ZXJyaWRlIHJlZ2lzdGVyRXh0ZXJuYWxIYXJuZXNzKCkgeyByZXR1cm4geyBkaXNwb3NlKCkgeyB9IH07IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFnZW50UGx1Z2luU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRQbHVnaW5TZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcGx1Z2lucyA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGVuYWJsZW1lbnRNb2RlbCA9IHVuZGVmaW5lZCE7XG5cdFx0XHR9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVBsdWdpbk1hcmtldHBsYWNlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGluc3RhbGxlZFBsdWdpbnMgPSBjb25zdE9ic2VydmFibGUoW10pO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZU1hcmtldHBsYWNlcyA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGZldGNoTWFya2V0cGxhY2VQbHVnaW5zKCkgeyByZXR1cm4gW107IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVBsdWdpbkluc3RhbGxTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElQbHVnaW5JbnN0YWxsU2VydmljZT4oKSB7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwsIGNyZWF0ZU1vY2tBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsKCkpO1xuXHRcdH0sXG5cdH0pO1xuXG5cdGNvbnN0IHdpZGdldCA9IGN0eC5kaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFBsdWdpbkxpc3RXaWRnZXQpKTtcblx0Y3R4LmNvbnRhaW5lci5hcHBlbmRDaGlsZCh3aWRnZXQuZWxlbWVudCk7XG5cdHdpZGdldC5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEVtYmVkZGVkIGNvbXBhY3QgZGV0YWlsIHdpZGdldHMgXHUyMDE0IHN0YW5kYWxvbmUgKG5vIGhvc3QgZWRpdG9yKVxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiByZW5kZXJFbWJlZGRlZE1jcERldGFpbChjdHg6IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBzZXJ2ZXI6IElXb3JrYmVuY2hNY3BTZXJ2ZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0Y29uc3Qgd2lkdGggPSA0ODA7XG5cdGNvbnN0IGhlaWdodCA9IDMyMDtcblx0Y3R4LmNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0Y3R4LmNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHtoZWlnaHR9cHhgO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoY3R4LmRpc3Bvc2FibGVTdG9yZSwge1xuXHRcdGNvbG9yVGhlbWU6IGN0eC50aGVtZSxcblx0XHRhZGRpdGlvbmFsU2VydmljZXM6IChyZWcpID0+IHtcblx0XHRcdHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMocmVnKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJTWNwV29ya2JlbmNoU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTWNwV29ya2JlbmNoU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25SZXNldCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxvY2FsOiBJV29ya2JlbmNoTWNwU2VydmVyW10gPSBzZXJ2ZXIgPyBbc2VydmVyXSA6IFtdO1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBvcGVuKCkgeyAvKiBuby1vcCBpbiBmaXh0dXJlICovIH1cblx0XHRcdH0oKSk7XG5cdFx0fSxcblx0fSk7XG5cblx0Ly8gTWlycm9yIHRoZSBob3N0IGVkaXRvcidzIGNsYXNzIHNvIHRoZSBzY29wZWQgQ1NTIHNlbGVjdG9ycyBhcHBseS5cblx0Y29uc3QgaG9zdCA9IERPTS5hcHBlbmQoY3R4LmNvbnRhaW5lciwgRE9NLiQoJy5haS1jdXN0b21pemF0aW9uLW1hbmFnZW1lbnQtZWRpdG9yJykpO1xuXHRob3N0LnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblx0aG9zdC5zdHlsZS53aWR0aCA9ICcxMDAlJztcblx0aG9zdC5zdHlsZS5vdmVyZmxvdyA9ICdhdXRvJztcblxuXHRjb25zdCBkZXRhaWwgPSBjdHguZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbWJlZGRlZE1jcFNlcnZlckRldGFpbCwgaG9zdCkpO1xuXHRpZiAoc2VydmVyKSB7XG5cdFx0ZGV0YWlsLnNldElucHV0KHNlcnZlcik7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVuZGVyRW1iZWRkZWRQbHVnaW5EZXRhaWwoY3R4OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgaXRlbTogSUFnZW50UGx1Z2luSXRlbSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRjb25zdCB3aWR0aCA9IDQ4MDtcblx0Y29uc3QgaGVpZ2h0ID0gMzIwO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRjdHguY29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhjdHguZGlzcG9zYWJsZVN0b3JlLCB7XG5cdFx0Y29sb3JUaGVtZTogY3R4LnRoZW1lLFxuXHRcdGFkZGl0aW9uYWxTZXJ2aWNlczogKHJlZykgPT4ge1xuXHRcdFx0cmVnaXN0ZXJXb3JrYmVuY2hTZXJ2aWNlcyhyZWcpO1xuXHRcdH0sXG5cdH0pO1xuXG5cdGNvbnN0IGhvc3QgPSBET00uYXBwZW5kKGN0eC5jb250YWluZXIsIERPTS4kKCcuYWktY3VzdG9taXphdGlvbi1tYW5hZ2VtZW50LWVkaXRvcicpKTtcblx0aG9zdC5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cdGhvc3Quc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cdGhvc3Quc3R5bGUub3ZlcmZsb3cgPSAnYXV0byc7XG5cblx0Y29uc3QgZGV0YWlsID0gY3R4LmRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW1iZWRkZWRBZ2VudFBsdWdpbkRldGFpbCwgaG9zdCkpO1xuXHRpZiAoaXRlbSkge1xuXHRcdGRldGFpbC5zZXRJbnB1dChpdGVtKTtcblx0fVxufVxuXG5mdW5jdGlvbiBtYWtlSW5zdGFsbGVkUGx1Z2luSXRlbShuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcpOiBJQWdlbnRQbHVnaW5JdGVtIHtcblx0cmV0dXJuIHtcblx0XHRraW5kOiBBZ2VudFBsdWdpbkl0ZW1LaW5kLkluc3RhbGxlZCxcblx0XHRuYW1lLFxuXHRcdGRlc2NyaXB0aW9uLFxuXHRcdG1hcmtldHBsYWNlOiAnR2l0SHViJyxcblx0XHRwbHVnaW46IG1ha2VJbnN0YWxsZWRQbHVnaW4obmFtZSwgVVJJLmZpbGUoYC93b3Jrc3BhY2UvLmNvcGlsb3QvcGx1Z2lucy8ke25hbWUudG9Mb3dlckNhc2UoKX1gKSwgdHJ1ZSksXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VNYXJrZXRwbGFjZVBsdWdpbkl0ZW0obmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nKTogSUFnZW50UGx1Z2luSXRlbSB7XG5cdHJldHVybiB7XG5cdFx0a2luZDogQWdlbnRQbHVnaW5JdGVtS2luZC5NYXJrZXRwbGFjZSxcblx0XHRuYW1lLFxuXHRcdGRlc2NyaXB0aW9uLFxuXHRcdHNvdXJjZTogJ0dpdEh1YicsXG5cdFx0c291cmNlRGVzY3JpcHRvcjogeyBraW5kOiBQbHVnaW5Tb3VyY2VLaW5kLkdpdEh1YiwgcmVwbzogYGFjbWUvJHtuYW1lLnRvTG93ZXJDYXNlKCl9YCB9LFxuXHRcdG1hcmtldHBsYWNlOiAnR2l0SHViJyxcblx0XHRtYXJrZXRwbGFjZVR5cGU6IE1hcmtldHBsYWNlVHlwZS5Db3BpbG90LFxuXHRcdG1hcmtldHBsYWNlUmVmZXJlbmNlOiB7XG5cdFx0XHRyYXdWYWx1ZTogYGFjbWUvJHtuYW1lLnRvTG93ZXJDYXNlKCl9YCxcblx0XHRcdGRpc3BsYXlMYWJlbDogYGFjbWUvJHtuYW1lLnRvTG93ZXJDYXNlKCl9YCxcblx0XHRcdGNsb25lVXJsOiBgaHR0cHM6Ly9naXRodWIuY29tL2FjbWUvJHtuYW1lLnRvTG93ZXJDYXNlKCl9YCxcblx0XHRcdGNhbm9uaWNhbElkOiBgZ2l0aHViOmFjbWUvJHtuYW1lLnRvTG93ZXJDYXNlKCl9YCxcblx0XHRcdGNhY2hlU2VnbWVudHM6IFsnZ2l0aHViJywgJ2FjbWUnLCBuYW1lLnRvTG93ZXJDYXNlKCldLFxuXHRcdFx0a2luZDogTWFya2V0cGxhY2VSZWZlcmVuY2VLaW5kLkdpdEh1YlNob3J0aGFuZCxcblx0XHRcdGdpdGh1YlJlcG86IGBhY21lLyR7bmFtZS50b0xvd2VyQ2FzZSgpfWAsXG5cdFx0fSxcblx0fTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gRml4dHVyZXNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuY29uc3QgbG9jYWxTZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmdldE5ld1Nlc3Npb25VcmkoKTtcbmNvbnN0IGFnZW50SG9zdENvcGlsb3RTZXNzaW9uUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsIHBhdGg6ICcvZml4dHVyZS1zZXNzaW9uJyB9KTtcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHsgcGF0aDogJ2NoYXQvYWlDdXN0b21pemF0aW9ucy8nIH0sIHtcblxuXG5cblx0Ly8gV2VsY29tZSBwYWdlIFx1MjAxNCBkZWZhdWx0IHN0YXRlIHdpdGggbm8gc2VjdGlvbiBzZWxlY3RlZFxuXHRXZWxjb21lUGFnZTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHsgc2Vzc2lvblJlc291cmNlOiBsb2NhbFNlc3Npb25SZXNvdXJjZSB9KSxcblx0fSksXG5cblx0Ly8gRnVsbCBlZGl0b3Igd2l0aCBMb2NhbCAoVlMgQ29kZSkgaGFybmVzcyBcdTIwMTQgYWxsIHNlY3Rpb25zIHZpc2libGUsIGhhcm5lc3MgZHJvcGRvd24sXG5cdC8vIEdlbmVyYXRlIGJ1dHRvbnMsIEFHRU5UUy5tZCBzaG9ydGN1dCwgYWxsIHN0b3JhZ2UgZ3JvdXBzXG5cdExvY2FsSGFybmVzczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHsgc2Vzc2lvblJlc291cmNlOiBsb2NhbFNlc3Npb25SZXNvdXJjZSwgc2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMgfSksXG5cdH0pLFxuXG5cdC8vIEFnZW50LWhvc3Qgd2VsY29tZSBwYWdlIHZhcmlhbnQgdGhhdCBoaWdobGlnaHRzIGxvY2FsIHByb21wdCBmaWxlcyB3aGljaFxuXHQvLyBuZWVkIHRvIGJlIG1pZ3JhdGVkIGJlY2F1c2UgdGhlIGFjdGl2ZSBoYXJuZXNzIG9ubHkgY29uc3VtZXMgc2tpbGxzLlxuXHRBZ2VudEhvc3RQcm9tcHRNaWdyYXRpb246IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcsIGJsb2Nrc0NpOiB0cnVlIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyRWRpdG9yKGN0eCwge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBhZ2VudEhvc3RDb3BpbG90U2Vzc2lvblJlc291cmNlLFxuXHRcdH0pLFxuXHR9KSxcblxuXHQvLyBTZXNzaW9ucy13aW5kb3cgdmFyaWFudCBvZiB0aGUgZnVsbCBlZGl0b3Igd2l0aCB3b3Jrc3BhY2Ugb3ZlcnJpZGUgVVhcblx0Ly8gYW5kIHNlc3Npb25zIHNlY3Rpb24gb3JkZXJpbmcuXG5cdFNlc3Npb25zOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyRWRpdG9yKGN0eCwge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBsb2NhbFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdGlzU2Vzc2lvbnNXaW5kb3c6IHRydWUsXG5cdFx0XHRzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyxcblx0XHRcdGF2YWlsYWJsZUhhcm5lc3NlczogW1xuXHRcdFx0XHRjcmVhdGVWU0NvZGVIYXJuZXNzRGVzY3JpcHRvcigpLFxuXHRcdFx0XSxcblx0XHRcdG1hbmFnZW1lbnRTZWN0aW9uczogW1xuXHRcdFx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMsXG5cdFx0XHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyxcblx0XHRcdFx0QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Qcm9tcHRzLFxuXHRcdFx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ib29rcyxcblx0XHRcdFx0QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uTWNwU2VydmVycyxcblx0XHRcdFx0QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUGx1Z2lucyxcblx0XHRcdF0sXG5cdFx0fSksXG5cdH0pLFxuXG5cdEF1dG9tYXRpb25zVGFiOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnLCBibG9ja3NDaTogdHJ1ZSB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogbG9jYWxTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkF1dG9tYXRpb25zLFxuXHRcdFx0YXV0b21hdGlvbnNFbmFibGVkOiB0cnVlLFxuXHRcdFx0d2lkdGg6IDEyMDAsXG5cdFx0XHRtYW5hZ2VtZW50U2VjdGlvbnM6IFtcblx0XHRcdFx0QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzLFxuXHRcdFx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHMsXG5cdFx0XHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkluc3RydWN0aW9ucyxcblx0XHRcdFx0QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSG9va3MsXG5cdFx0XHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlByb21wdHMsXG5cdFx0XHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkF1dG9tYXRpb25zLFxuXHRcdFx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5NY3BTZXJ2ZXJzLFxuXHRcdFx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5QbHVnaW5zLFxuXHRcdFx0XSxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gU2Vzc2lvbnMgU2tpbGxzIHRhYiBzaG93aW5nIFVJIEludGVncmF0aW9uIGJhZGdlcyBvbiBidWlsdC1pbiBza2lsbHNcblx0U2Vzc2lvbnNTa2lsbHNUYWI6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0aXNTZXNzaW9uc1dpbmRvdzogdHJ1ZSxcblx0XHRcdHNlbGVjdGVkU2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzLFxuXHRcdFx0YXZhaWxhYmxlSGFybmVzc2VzOiBbXG5cdFx0XHRcdGNyZWF0ZVZTQ29kZUhhcm5lc3NEZXNjcmlwdG9yKCksXG5cdFx0XHRdLFxuXHRcdFx0bWFuYWdlbWVudFNlY3Rpb25zOiBbXG5cdFx0XHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyxcblx0XHRcdFx0QUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzLFxuXHRcdFx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5JbnN0cnVjdGlvbnMsXG5cdFx0XHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlByb21wdHMsXG5cdFx0XHRcdEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhvb2tzLFxuXHRcdFx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5NY3BTZXJ2ZXJzLFxuXHRcdFx0XHRBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5QbHVnaW5zLFxuXHRcdFx0XSxcblx0XHRcdHNraWxsVUlJbnRlZ3JhdGlvbnM6IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2FjdC1vbi1mZWVkYmFjaycsICdVc2VkIGJ5IHRoZSBTdWJtaXQgRmVlZGJhY2sgYnV0dG9uIGluIHRoZSBDaGFuZ2VzIHRvb2xiYXInXSxcblx0XHRcdFx0WydnZW5lcmF0ZS1ydW4tY29tbWFuZHMnLCAnVXNlZCBieSB0aGUgUnVuIGJ1dHRvbiBpbiB0aGUgdGl0bGUgYmFyJ10sXG5cdFx0XHRdKSxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gTUNQIFNlcnZlcnMgdGFiIHdpdGggbWFueSBzZXJ2ZXJzIHRvIHZlcmlmeSBzY3JvbGxhYmxlIGxpc3QgbGF5b3V0XG5cdE1jcFNlcnZlcnNUYWI6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5NY3BTZXJ2ZXJzLFxuXHRcdH0pLFxuXHR9KSxcblxuXHRNY3BTZXJ2ZXJzVGFiQWN0aXZlU2Vzc2lvbjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogbG9jYWxTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRpc1Nlc3Npb25zV2luZG93OiB0cnVlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5NY3BTZXJ2ZXJzLFxuXHRcdFx0YWN0aXZlU2Vzc2lvbk1jcFNlcnZlcnMsXG5cdFx0fSksXG5cdH0pLFxuXG5cdC8vIEFnZW50cyB0YWIgXHUyMDE0IHdvcmtzcGFjZSBhbmQgdXNlciBhZ2VudHMsIHNjcm9sbGFibGVcblx0QWdlbnRzVGFiOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyRWRpdG9yKGN0eCwge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBsb2NhbFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHNlbGVjdGVkU2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzLFxuXHRcdH0pLFxuXHR9KSxcblxuXHQvLyBTa2lsbHMgdGFiIFx1MjAxNCB3b3Jrc3BhY2UgYW5kIHVzZXIgc2tpbGxzLCBzY3JvbGxhYmxlXG5cdFNraWxsc1RhYjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogbG9jYWxTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gSW5zdHJ1Y3Rpb25zIHRhYiBcdTIwMTQgbWFueSBpbnN0cnVjdGlvbnMgd2l0aCBhcHBseVRvIHBhdHRlcm5zLCBzY3JvbGxhYmxlXG5cdEluc3RydWN0aW9uc1RhYjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogbG9jYWxTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkluc3RydWN0aW9ucyxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gSG9va3MgdGFiIFx1MjAxNCB3b3Jrc3BhY2UgYW5kIHVzZXIgaG9va3MsIHNjcm9sbGFibGVcblx0SG9va3NUYWI6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ib29rcyxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gUHJvbXB0cyB0YWIgXHUyMDE0IHdvcmtzcGFjZSBhbmQgdXNlciBwcm9tcHRzLCBzY3JvbGxhYmxlXG5cdFByb21wdHNUYWI6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Qcm9tcHRzLFxuXHRcdH0pLFxuXHR9KSxcblxuXHRQcm9tcHRNaWdyYXRpb246IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGFnZW50SG9zdENvcGlsb3RTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRzaG93UHJvbXB0TWlncmF0aW9uUGFnZTogdHJ1ZSxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gUGx1Z2lucyB0YWJcblx0UGx1Z2luc1RhYjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogbG9jYWxTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlBsdWdpbnMsXG5cdFx0fSksXG5cdH0pLFxuXG5cdC8vIE1DUCBicm93c2UvbWFya2V0cGxhY2UgbW9kZSBcdTIwMTQgc3RhbmRhbG9uZSB3aWRnZXQgd2l0aCBnYWxsZXJ5IHJlc3VsdHMsIHNjcm9sbGFibGVcblx0Ly8gVmVyaWZpZXMgZml4IGZvciBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMzA0MTM5XG5cdE1jcEJyb3dzZU1vZGU6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IHJlbmRlck1jcEJyb3dzZU1vZGUsXG5cdH0pLFxuXG5cdC8vIFBsdWdpbiBicm93c2UvbWFya2V0cGxhY2UgbW9kZSBcdTIwMTQgc3RhbmRhbG9uZSB3aWRnZXQgd2l0aCBtYXJrZXRwbGFjZSByZXN1bHRzLCBzY3JvbGxhYmxlXG5cdFBsdWdpbkJyb3dzZU1vZGU6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IHJlbmRlclBsdWdpbkJyb3dzZU1vZGUsXG5cdH0pLFxuXG5cdC8vIE1DUCBkaXNhYmxlZCBzcGxhc2ggXHUyMDE0IGNoYXQubWNwLmFjY2VzcyBzZXQgdG8gJ25vbmUnIGJ5IHVzZXJcblx0TWNwRGlzYWJsZWRCeVVzZXI6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJNY3BEaXNhYmxlZChjdHgsIGZhbHNlKSxcblx0fSksXG5cblx0Ly8gTUNQIGRpc2FibGVkIHNwbGFzaCBcdTIwMTQgY2hhdC5tY3AuYWNjZXNzIGxvY2tlZCB0byAnbm9uZScgYnkgZW50ZXJwcmlzZSBwb2xpY3lcblx0TWNwRGlzYWJsZWRCeVBvbGljeTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlck1jcERpc2FibGVkKGN0eCwgdHJ1ZSksXG5cdH0pLFxuXG5cdC8vIFBsdWdpbnMgZGlzYWJsZWQgc3BsYXNoIFx1MjAxNCBjaGF0LnBsdWdpbnMuZW5hYmxlZD1mYWxzZSBieSB1c2VyXG5cdFBsdWdpbnNEaXNhYmxlZEJ5VXNlcjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlclBsdWdpbkRpc2FibGVkKGN0eCwgZmFsc2UpLFxuXHR9KSxcblxuXHQvLyBQbHVnaW5zIGRpc2FibGVkIHNwbGFzaCBcdTIwMTQgY2hhdC5wbHVnaW5zLmVuYWJsZWQgbG9ja2VkIHRvIGZhbHNlIGJ5IGVudGVycHJpc2UgcG9saWN5XG5cdFBsdWdpbnNEaXNhYmxlZEJ5UG9saWN5OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyUGx1Z2luRGlzYWJsZWQoY3R4LCB0cnVlKSxcblx0fSksXG5cblx0Ly8gU2Nyb2xsZWQtdG8tYm90dG9tIHZhcmlhbnRzIFx1MjAxNCB2ZXJpZnkgbGFzdCBpdGVtcyBhcmUgZnVsbHkgdmlzaWJsZSBhYm92ZSBmb290ZXJcblx0UHJvbXB0c1RhYlNjcm9sbGVkOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyRWRpdG9yKGN0eCwge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBsb2NhbFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHNlbGVjdGVkU2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUHJvbXB0cyxcblx0XHRcdHNjcm9sbFRvQm90dG9tOiB0cnVlLFxuXHRcdH0pLFxuXHR9KSxcblxuXHRNY3BTZXJ2ZXJzVGFiU2Nyb2xsZWQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5NY3BTZXJ2ZXJzLFxuXHRcdFx0c2Nyb2xsVG9Cb3R0b206IHRydWUsXG5cdFx0fSksXG5cdH0pLFxuXG5cdFBsdWdpbnNUYWJTY3JvbGxlZDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogbG9jYWxTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlBsdWdpbnMsXG5cdFx0XHRzY3JvbGxUb0JvdHRvbTogdHJ1ZSxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gTmFycm93IHZpZXdwb3J0IFx1MjAxNCBjYXRjaGVzIGJhZGdlIGNsaXBwaW5nIGFuZCBsYXlvdXQgb3ZlcmZsb3cgYXQgc21hbGwgc2l6ZXNcblx0TWNwU2VydmVyc1RhYk5hcnJvdzogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogbG9jYWxTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnMsXG5cdFx0XHR3aWR0aDogNTUwLFxuXHRcdFx0aGVpZ2h0OiA0MDAsXG5cdFx0fSksXG5cdH0pLFxuXG5cdEFnZW50c1RhYk5hcnJvdzogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogbG9jYWxTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyxcblx0XHRcdHdpZHRoOiA1NTAsXG5cdFx0XHRoZWlnaHQ6IDQwMCxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gSXRlbS1wcmV2aWV3IHZpZXcgKGFmdGVyIGNsaWNraW5nIGFuIGFnZW50KSBcdTIwMTQgdmVyaWZpZXMgdGhlIHN0cnVjdHVyZWQgZnJvbnRcblx0Ly8gbWF0dGVyIHByZXZpZXcgYW5kIHJlbmRlcmVkIG1hcmtkb3duIGJvZHkuXG5cdEFnZW50c0l0ZW1QcmV2aWV3OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyRWRpdG9yKGN0eCwge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBsb2NhbFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHNlbGVjdGVkU2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzLFxuXHRcdFx0b3BlbkZpcnN0SXRlbTogdHJ1ZSxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gUmF3IG1hcmtkb3duIGVkaXRvciB2aWV3IHJlYWNoZWQgZnJvbSB0aGUgc3RydWN0dXJlZCBwcmV2aWV3J3MgRWRpdCBhY3Rpb24uXG5cdEFnZW50c0l0ZW1SYXc6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMsXG5cdFx0XHRvcGVuRmlyc3RJdGVtOiB0cnVlLFxuXHRcdFx0ZWRpdG9yRGlzcGxheU1vZGU6ICdyYXcnLFxuXHRcdH0pLFxuXHR9KSxcblxuXHQvLyBCdWlsdC1pbiBza2lsbCBwcmV2aWV3IHZpZXcgXHUyMDE0IHZlcmlmaWVzIHRoYXQgYnVpbHQtaW4gc2tpbGxzIG9wZW4gaW4gdGhlXG5cdC8vIHN0cnVjdHVyZWQgcHJldmlldyB3aGlsZSBzdGlsbCBvZmZlcmluZyBhbiBlZGl0YWJsZSByYXcgb3ZlcnJpZGUgcGF0aC5cblx0QnVpbHRpblNraWxsSXRlbVByZXZpZXc6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHMsXG5cdFx0XHRvcGVuRmlyc3RJdGVtOiB0cnVlLFxuXHRcdFx0b3Blbkl0ZW1MYWJlbDogJ2FjdC1vbi1mZWVkYmFjaycsXG5cdFx0fSksXG5cdH0pLFxuXG5cdC8vIEJ1aWx0LWluIHNraWxsIHJhdyB2aWV3IHJlYWNoZWQgZnJvbSB0aGUgc3RydWN0dXJlZCBwcmV2aWV3J3MgRWRpdCBhY3Rpb24uXG5cdEJ1aWx0aW5Ta2lsbEl0ZW1SYXc6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHMsXG5cdFx0XHRvcGVuRmlyc3RJdGVtOiB0cnVlLFxuXHRcdFx0b3Blbkl0ZW1MYWJlbDogJ2FjdC1vbi1mZWVkYmFjaycsXG5cdFx0XHRlZGl0b3JEaXNwbGF5TW9kZTogJ3JhdycsXG5cdFx0fSksXG5cdH0pLFxuXG5cdC8vIE1DUCBzZXJ2ZXIgZGV0YWlsIHZpZXcgXHUyMDE0IHNhbWUgYWxpZ25tZW50IGNoZWNrIGZvciB0aGUgZGV0YWlsIGJhY2sgYnV0dG9uLlxuXHRNY3BTZXJ2ZXJEZXRhaWw6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5NY3BTZXJ2ZXJzLFxuXHRcdFx0b3BlbkZpcnN0SXRlbTogdHJ1ZSxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gTUNQIHNlcnZlciBkZXRhaWwgdmlldyBpbiBhIG5hcnJvdyB2aWV3cG9ydCBcdTIwMTQgY2F0Y2hlcyBlbWJlZGRlZCBoZWFkZXIgb3ZlcmZsb3dcblx0Ly8gYW5kIHRoZSBzaW5nbGUtdGFiIGNvbmZpZ3VyYXRpb24gbGF5b3V0IHVzZWQgYnkgbG9jYWwgd29ya3NwYWNlIHNlcnZlcnMuXG5cdE1jcFNlcnZlckRldGFpbE5hcnJvdzogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVkaXRvcihjdHgsIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogbG9jYWxTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRzZWxlY3RlZFNlY3Rpb246IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLk1jcFNlcnZlcnMsXG5cdFx0XHRvcGVuRmlyc3RJdGVtOiB0cnVlLFxuXHRcdFx0d2lkdGg6IDU1MCxcblx0XHRcdGhlaWdodDogNDAwLFxuXHRcdH0pLFxuXHR9KSxcblxuXHQvLyBQbHVnaW4gZGV0YWlsIHZpZXcgXHUyMDE0IHNhbWUgYWxpZ25tZW50IGNoZWNrIGZvciB0aGUgZGV0YWlsIGJhY2sgYnV0dG9uLlxuXHRQbHVnaW5EZXRhaWw6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFZGl0b3IoY3R4LCB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGxvY2FsU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0c2VsZWN0ZWRTZWN0aW9uOiBBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5QbHVnaW5zLFxuXHRcdFx0b3BlbkZpcnN0SXRlbTogdHJ1ZSxcblx0XHR9KSxcblx0fSksXG5cblx0UGx1Z2luRGV0YWlsTmFycm93OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyRWRpdG9yKGN0eCwge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBsb2NhbFNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHNlbGVjdGVkU2VjdGlvbjogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUGx1Z2lucyxcblx0XHRcdG9wZW5GaXJzdEl0ZW06IHRydWUsXG5cdFx0XHR3aWR0aDogNTUwLFxuXHRcdFx0aGVpZ2h0OiA0MDAsXG5cdFx0fSksXG5cdH0pLFxuXG5cdC8vIFN0YW5kYWxvbmUgZW1iZWRkZWQgTUNQIGRldGFpbCB3aWRnZXQgKGNvbXBhY3Qgc3BsaXQtcGFuZSBjb21wb25lbnQpLlxuXHQvLyBXb3Jrc3BhY2Utc2NvcGUgc2VydmVyIHdpdGggYSBkZXNjcmlwdGlvbi5cblx0RW1iZWRkZWRNY3BEZXRhaWxXb3Jrc3BhY2U6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFbWJlZGRlZE1jcERldGFpbChjdHgsIG1ha2VMb2NhbE1jcFNlcnZlcignbWNwLXBvc3RncmVzJywgJ1Bvc3RncmVTUUwnLCBMb2NhbE1jcFNlcnZlclNjb3BlLldvcmtzcGFjZSwgJ0RhdGFiYXNlIGFjY2VzcyBmb3IgdGhlIGFjdGl2ZSB3b3Jrc3BhY2UnKSksXG5cdH0pLFxuXG5cdC8vIFN0YW5kYWxvbmUgZW1iZWRkZWQgTUNQIGRldGFpbCB3aWRnZXQgXHUyMDE0IHVzZXItc2NvcGUgc2VydmVyLlxuXHRFbWJlZGRlZE1jcERldGFpbFVzZXI6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFbWJlZGRlZE1jcERldGFpbChjdHgsIG1ha2VMb2NhbE1jcFNlcnZlcignbWNwLXdlYi1zZWFyY2gnLCAnV2ViIFNlYXJjaCcsIExvY2FsTWNwU2VydmVyU2NvcGUuVXNlciwgJ1NlYXJjaCB0aGUgd2ViIGZyb20gYW55IHNlc3Npb24nKSksXG5cdH0pLFxuXG5cdC8vIFN0YW5kYWxvbmUgZW1iZWRkZWQgTUNQIGRldGFpbCB3aWRnZXQgXHUyMDE0IGVtcHR5IC8gbm8gaW5wdXQgc3RhdGUuXG5cdEVtYmVkZGVkTWNwRGV0YWlsRW1wdHk6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFbWJlZGRlZE1jcERldGFpbChjdHgsIHVuZGVmaW5lZCksXG5cdH0pLFxuXG5cdC8vIFN0YW5kYWxvbmUgZW1iZWRkZWQgcGx1Z2luIGRldGFpbCB3aWRnZXQgXHUyMDE0IGluc3RhbGxlZCBwbHVnaW4uXG5cdEVtYmVkZGVkUGx1Z2luRGV0YWlsSW5zdGFsbGVkOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyRW1iZWRkZWRQbHVnaW5EZXRhaWwoY3R4LCBtYWtlSW5zdGFsbGVkUGx1Z2luSXRlbSgnTGluZWFyJywgJ0lzc3VlIHRyYWNraW5nIGFuZCBwcm9qZWN0IG1hbmFnZW1lbnQgaW50ZWdyYXRpb24nKSksXG5cdH0pLFxuXG5cdC8vIFN0YW5kYWxvbmUgZW1iZWRkZWQgcGx1Z2luIGRldGFpbCB3aWRnZXQgXHUyMDE0IG1hcmtldHBsYWNlIHBsdWdpbi5cblx0RW1iZWRkZWRQbHVnaW5EZXRhaWxNYXJrZXRwbGFjZTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckVtYmVkZGVkUGx1Z2luRGV0YWlsKGN0eCwgbWFrZU1hcmtldHBsYWNlUGx1Z2luSXRlbSgnU2VudHJ5JywgJ0Vycm9yIG1vbml0b3JpbmcgYW5kIHBlcmZvcm1hbmNlIHRyYWNpbmcnKSksXG5cdH0pLFxuXG5cdC8vIFN0YW5kYWxvbmUgZW1iZWRkZWQgcGx1Z2luIGRldGFpbCB3aWRnZXQgXHUyMDE0IGVtcHR5IC8gbm8gaW5wdXQgc3RhdGUuXG5cdEVtYmVkZGVkUGx1Z2luRGV0YWlsRW1wdHk6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJFbWJlZGRlZFBsdWdpbkRldGFpbChjdHgsIHVuZGVmaW5lZCksXG5cdH0pLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxpQkFBaUI7QUFFMUIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxTQUFTLGFBQWE7QUFHL0IsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLGlCQUFpQixTQUFzQix1QkFBdUI7QUFDdkUsU0FBUyxXQUFXLGtCQUFrQjtBQUN0QyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQW1DLHlCQUF5QjtBQUM1RCxTQUFTLHNCQUFzQjtBQUMvQixTQUF1QixvQkFBMkM7QUFDbEUsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxjQUFjLG1CQUFtQjtBQUMxQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFx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QUEsRUFHRCxjQUFjLHVCQUF1QjtBQUFBLElBQ3BDLFFBQVEsRUFBRSxNQUFNLGFBQWE7QUFBQSxJQUM3QixRQUFRLFNBQU8sYUFBYSxLQUFLO0FBQUEsTUFDaEMsaUJBQWlCO0FBQUEsTUFDakIsaUJBQWlCLGlDQUFpQztBQUFBLE1BQ2xELGVBQWU7QUFBQSxJQUNoQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQUEsRUFFRCxvQkFBb0IsdUJBQXVCO0FBQUEsSUFDMUMsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTyxhQUFhLEtBQUs7QUFBQSxNQUNoQyxpQkFBaUI7QUFBQSxNQUNqQixpQkFBaUIsaUNBQWlDO0FBQUEsTUFDbEQsZUFBZTtBQUFBLE1BQ2YsT0FBTztBQUFBLE1BQ1AsUUFBUTtBQUFBLElBQ1QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUFBO0FBQUE7QUFBQSxFQUlELDRCQUE0Qix1QkFBdUI7QUFBQSxJQUNsRCxRQUFRLEVBQUUsTUFBTSxhQUFhO0FBQUEsSUFDN0IsUUFBUSxTQUFPLHdCQUF3QixLQUFLLG1CQUFtQixnQkFBZ0IsY0FBYyxvQkFBb0IsV0FBVywwQ0FBMEMsQ0FBQztBQUFBLEVBQ3hLLENBQUM7QUFBQTtBQUFBLEVBR0QsdUJBQXVCLHVCQUF1QjtBQUFBLElBQzdDLFFBQVEsRUFBRSxNQUFNLGFBQWE7QUFBQSxJQUM3QixRQUFRLFNBQU8sd0JBQXdCLEtBQUssbUJBQW1CLGtCQUFrQixjQUFjLG9CQUFvQixNQUFNLGlDQUFpQyxDQUFDO0FBQUEsRUFDNUosQ0FBQztBQUFBO0FBQUEsRUFHRCx3QkFBd0IsdUJBQXVCO0FBQUEsSUFDOUMsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTyx3QkFBd0IsS0FBSyxNQUFTO0FBQUEsRUFDdEQsQ0FBQztBQUFBO0FBQUEsRUFHRCwrQkFBK0IsdUJBQXVCO0FBQUEsSUFDckQsUUFBUSxFQUFFLE1BQU0sYUFBYTtBQUFBLElBQzdCLFFBQVEsU0FBTywyQkFBMkIsS0FBSyx3QkFBd0IsVUFBVSxtREFBbUQsQ0FBQztBQUFBLEVBQ3RJLENBQUM7QUFBQTtBQUFBLEVBR0QsaUNBQWlDLHVCQUF1QjtBQUFBLElBQ3ZELFFBQVEsRUFBRSxNQUFNLGFBQWE7QUFBQSxJQUM3QixRQUFRLFNBQU8sMkJBQTJCLEtBQUssMEJBQTBCLFVBQVUsMENBQTBDLENBQUM7QUFBQSxFQUMvSCxDQUFDO0FBQUE7QUFBQSxFQUdELDJCQUEyQix1QkFBdUI7QUFBQSxJQUNqRCxRQUFRLEVBQUUsTUFBTSxhQUFhO0FBQUEsSUFDN0IsUUFBUSxTQUFPLDJCQUEyQixLQUFLLE1BQVM7QUFBQSxFQUN6RCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFsiYWdlbnRJbnN0cnVjdGlvbnMiLCAic2Vzc2lvblJlc291cmNlIl0KfQo=
