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
import { coalesce } from "../../../../../../../base/common/arrays.js";
import { decodeBase64 } from "../../../../../../../base/common/buffer.js";
import { CancellationTokenSource } from "../../../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../../../base/common/codicons.js";
import { StopWatch } from "../../../../../../../base/common/stopwatch.js";
import { isPatternInWord } from "../../../../../../../base/common/filters.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { ResourceSet } from "../../../../../../../base/common/map.js";
import { Schemas } from "../../../../../../../base/common/network.js";
import { basename } from "../../../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../../../base/common/themables.js";
import { assertType } from "../../../../../../../base/common/types.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../../base/common/uuid.js";
import { getCodeEditor, isCodeEditor } from "../../../../../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../../../../../editor/browser/services/codeEditorService.js";
import { CompletionItemKind, SymbolKinds } from "../../../../../../../editor/common/languages.js";
import { ILanguageFeaturesService } from "../../../../../../../editor/common/services/languageFeatures.js";
import { IOutlineModelService } from "../../../../../../../editor/contrib/documentSymbols/browser/outlineModel.js";
import { localize } from "../../../../../../../nls.js";
import { Action2, registerAction2 } from "../../../../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { FileKind, IFileService } from "../../../../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../../../platform/label/common/label.js";
import { INotificationService } from "../../../../../../../platform/notification/common/notification.js";
import { Registry } from "../../../../../../../platform/registry/common/platform.js";
import { IWorkspaceContextService } from "../../../../../../../platform/workspace/common/workspace.js";
import { Extensions as WorkbenchExtensions } from "../../../../../../common/contributions.js";
import { EditorsOrder, isDiffEditorInput } from "../../../../../../common/editor.js";
import { IEditorService } from "../../../../../../services/editor/common/editorService.js";
import { IHistoryService } from "../../../../../../services/history/common/history.js";
import { LifecyclePhase } from "../../../../../../services/lifecycle/common/lifecycle.js";
import { ISearchService } from "../../../../../../services/search/common/search.js";
import { McpPromptArgumentPick } from "../../../../../mcp/browser/mcpPromptArgumentPick.js";
import { IMcpService, McpResourceURI } from "../../../../../mcp/common/mcpTypes.js";
import { searchFilesAndFolders } from "../../../../../search/browser/searchChatContext.js";
import { IChatAgentNameService, IChatAgentService, getFullyQualifiedId } from "../../../../common/participants/chatAgents.js";
import { getAttachableImageExtension } from "../../../../common/model/chatModel.js";
import { ChatRequestAgentPart, ChatRequestAgentSubcommandPart, ChatRequestSlashPromptPart, ChatRequestTextPart, ChatRequestToolPart, ChatRequestToolSetPart, chatAgentLeader, chatSubcommandLeader, chatVariableLeader } from "../../../../common/requestParser/chatParserTypes.js";
import { IChatSlashCommandService } from "../../../../common/participants/chatSlashCommands.js";
import { toAttachedContextDynamicVariable } from "../../../../common/attachments/chatVariables.js";
import { ChatAgentLocation, ChatModeKind, isSupportedChatFileScheme } from "../../../../common/constants.js";
import { isToolSet } from "../../../../common/tools/languageModelToolsService.js";
import { IChatSessionsService, isAgentHostTarget } from "../../../../common/chatSessionsService.js";
import { ICustomizationHarnessService } from "../../../../common/customizationHarnessService.js";
import { matchesSessionType } from "../../../../common/promptSyntax/service/promptsService.js";
import { ChatSubmitAction } from "../../../actions/chatExecuteActions.js";
import { IChatWidgetService } from "../../../chat.js";
import { resizeImage } from "../../../chatImageUtils.js";
import { ChatDynamicVariableModel } from "../../../attachments/chatDynamicVariables.js";
import { IChatService } from "../../../../common/chatService/chatService.js";
import { getChatSessionType } from "../../../../common/model/chatUri.js";
import { attachedContextCompletionSortText, computeCompletionRanges, escapeForCharClass, getAttachedContextCompletionFilterText, isEmptyUpToCompletionWord } from "./chatInputCompletionUtils.js";
import { getAgentSessionProviderIcon, AgentSessionProviders } from "../../../agentSessions/agentSessions.js";
const SlashCommandWord = /\/[\p{L}0-9_.:-]*/gu;
const AgentOrSlashCommandWord = /(@|\/)[\p{L}0-9_.:-]*/gu;
function isAgentHostBackedWidget(widget) {
  const sessionResource = widget.viewModel?.model.sessionResource;
  return !!sessionResource && isAgentHostTarget(getChatSessionType(sessionResource));
}
let SlashCommandCompletions = class extends Disposable {
  constructor(languageFeaturesService, chatWidgetService, chatSlashCommandService, harnessService, chatService, chatSessionsService, mcpService) {
    super();
    this.languageFeaturesService = languageFeaturesService;
    this.chatWidgetService = chatWidgetService;
    this.chatSlashCommandService = chatSlashCommandService;
    this.harnessService = harnessService;
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "globalSlashCommands",
      triggerCharacters: [chatSubcommandLeader],
      provideCompletionItems: async (model, position, _context, _token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget || !widget.viewModel) {
          return null;
        }
        const range = computeCompletionRanges(model, position, SlashCommandWord);
        if (!range) {
          return null;
        }
        if (!isEmptyUpToCompletionWord(model, range)) {
          return;
        }
        const parsedRequest = widget.parsedInput.parts;
        const usedAgent = parsedRequest.find((p) => p instanceof ChatRequestAgentPart);
        if (usedAgent) {
          return;
        }
        const slashCommands = this.chatSlashCommandService.getCommands(widget.location, widget.input.currentModeKind);
        if (!slashCommands) {
          return null;
        }
        const sessionType = getChatSessionType(widget.viewModel.model.sessionResource);
        return {
          suggestions: slashCommands.filter((c) => {
            if (!c.silent && !widget.attachmentCapabilities.supportsPromptAttachments) {
              return false;
            }
            if (c.when && !widget.scopedContextKeyService.contextMatchesRules(c.when)) {
              return false;
            }
            if (!matchesSessionType(c.sessionTypes, sessionType)) {
              return false;
            }
            if (!widget.lockedAgentId) {
              return true;
            }
            if (c.modes && c.modes.length && !c.modes.includes(ChatModeKind.Agent)) {
              return false;
            }
            return true;
          }).map((c, i) => {
            const withSlash = `/${c.command}`;
            return {
              label: { label: withSlash, description: c.detail },
              insertText: c.executeImmediately ? "" : `${withSlash} `,
              documentation: c.detail,
              range,
              sortText: c.sortText ?? "a".repeat(i + 1),
              kind: CompletionItemKind.Text,
              // The icons are disabled here anyway,
              command: c.executeImmediately ? { id: ChatSubmitAction.ID, title: withSlash, arguments: [{ widget, inputValue: `${withSlash} ` }] } : void 0
            };
          })
        };
      }
    }));
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "globalSlashCommandsAt",
      triggerCharacters: [chatAgentLeader],
      provideCompletionItems: async (model, position, _context, _token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget || !widget.viewModel) {
          return null;
        }
        const range = computeCompletionRanges(model, position, /@\w*/g);
        if (!range) {
          return null;
        }
        if (!isEmptyUpToCompletionWord(model, range)) {
          return;
        }
        const slashCommands = this.chatSlashCommandService.getCommands(widget.location, widget.input.currentModeKind);
        if (!slashCommands) {
          return null;
        }
        if (widget.lockedAgentId) {
          return null;
        }
        const currentSessionType = getChatSessionType(widget.viewModel.model.sessionResource);
        return {
          suggestions: slashCommands.filter((c) => !c.when || widget.scopedContextKeyService.contextMatchesRules(c.when)).filter((c) => matchesSessionType(c.sessionTypes, currentSessionType)).map((c, i) => {
            const withSlash = `${chatSubcommandLeader}${c.command}`;
            return {
              label: { label: withSlash, description: c.detail },
              insertText: c.executeImmediately ? "" : `${withSlash} `,
              documentation: c.detail,
              range,
              filterText: `${chatAgentLeader}${c.command}`,
              sortText: c.sortText ?? "z".repeat(i + 1),
              kind: CompletionItemKind.Text,
              // The icons are disabled here anyway,
              command: c.executeImmediately ? { id: ChatSubmitAction.ID, title: withSlash, arguments: [{ widget, inputValue: `${withSlash} ` }] } : void 0
            };
          })
        };
      }
    }));
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "promptSlashCommands",
      triggerCharacters: [chatSubcommandLeader],
      provideCompletionItems: async (model, position, _context, token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget || !widget.viewModel) {
          return null;
        }
        if (isAgentHostBackedWidget(widget)) {
          return;
        }
        const range = computeCompletionRanges(model, position, SlashCommandWord);
        if (!range) {
          return null;
        }
        if (!isEmptyUpToCompletionWord(model, range)) {
          return;
        }
        const parsedRequest = widget.parsedInput.parts;
        const usedAgent = parsedRequest.find((p) => p instanceof ChatRequestAgentPart);
        if (usedAgent) {
          return;
        }
        const currentSessionType = getChatSessionType(widget.viewModel.model.sessionResource);
        const promptCommands = await this.harnessService.getSlashCommands(widget.viewModel.model.sessionResource, token);
        if (promptCommands.length === 0) {
          return null;
        }
        if (widget.lockedAgentId && !widget.attachmentCapabilities.supportsPromptAttachments) {
          return null;
        }
        const userInvocableCommands = promptCommands.filter((c) => c.userInvocable).filter((c) => matchesSessionType(c.sessionTypes, currentSessionType));
        if (userInvocableCommands.length === 0) {
          return null;
        }
        return {
          suggestions: userInvocableCommands.map((c, i) => {
            const colonLabel = `/${c.name}`;
            const hasSubcommand = c.name.includes(":");
            const displayLabel = hasSubcommand ? `/${c.name.replace(/:/g, " ")}` : colonLabel;
            const description = c.description;
            return {
              label: { label: displayLabel, description },
              insertText: `${displayLabel} `,
              documentation: c.description,
              range,
              // Allow matching by either the space form (what the user sees) or the
              // colon form (so legacy `/chronicle:tips` typing still filters).
              filterText: hasSubcommand ? `${colonLabel} ${displayLabel}` : void 0,
              sortText: "a".repeat(i + 1),
              kind: CompletionItemKind.Text
              // The icons are disabled here anyway,
            };
          })
        };
      }
    }));
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "mcpPromptSlashCommands",
      triggerCharacters: [chatSubcommandLeader],
      provideCompletionItems: async (model, position, _context, _token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget || !widget.viewModel) {
          return null;
        }
        if (isAgentHostBackedWidget(widget)) {
          return;
        }
        const range = computeCompletionRanges(model, position, /\/[\p{L}0-9_.-]*/gu);
        if (!range) {
          return null;
        }
        if (!isEmptyUpToCompletionWord(model, range)) {
          return;
        }
        if (widget.lockedAgentId) {
          return null;
        }
        return {
          suggestions: mcpService.servers.get().flatMap((server) => server.prompts.get().map((prompt) => {
            const label = `/mcp.${prompt.id}`;
            return {
              label: { label, description: prompt.description },
              command: {
                id: StartParameterizedPromptAction.ID,
                title: prompt.name,
                arguments: [model, server, prompt, `${label} `]
              },
              insertText: `${label} `,
              range,
              kind: CompletionItemKind.Text
            };
          }))
        };
      }
    }));
  }
};
SlashCommandCompletions = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService),
  __decorateParam(1, IChatWidgetService),
  __decorateParam(2, IChatSlashCommandService),
  __decorateParam(3, ICustomizationHarnessService),
  __decorateParam(4, IChatService),
  __decorateParam(5, IChatSessionsService),
  __decorateParam(6, IMcpService)
], SlashCommandCompletions);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(SlashCommandCompletions, LifecyclePhase.Eventually);
let AgentCompletions = class extends Disposable {
  constructor(languageFeaturesService, chatWidgetService, chatAgentService, chatAgentNameService, chatSessionsService) {
    super();
    this.languageFeaturesService = languageFeaturesService;
    this.chatWidgetService = chatWidgetService;
    this.chatAgentService = chatAgentService;
    this.chatAgentNameService = chatAgentNameService;
    this.chatSessionsService = chatSessionsService;
    const subCommandProvider = {
      _debugDisplayName: "chatAgentSubcommand",
      triggerCharacters: [chatSubcommandLeader],
      provideCompletionItems: async (model, position, _context, token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget || !widget.viewModel) {
          return;
        }
        if (isAgentHostBackedWidget(widget)) {
          return;
        }
        const range = computeCompletionRanges(model, position, SlashCommandWord);
        if (!range) {
          return;
        }
        const usedAgent = this.getCurrentAgentForWidget(widget);
        if (!usedAgent || usedAgent.command) {
          return;
        }
        return {
          suggestions: usedAgent.agent.slashCommands.map((c, i) => {
            const withSlash = `/${c.name}`;
            return {
              label: withSlash,
              insertText: `${withSlash} `,
              documentation: c.description,
              range,
              kind: CompletionItemKind.Text
              // The icons are disabled here anyway
            };
          })
        };
      }
    };
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, subCommandProvider));
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "chatAgentAndSubcommand",
      triggerCharacters: [chatAgentLeader],
      provideCompletionItems: async (model, position, _context, token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        const viewModel = widget?.viewModel;
        if (!widget || !viewModel) {
          return;
        }
        if (isAgentHostBackedWidget(widget)) {
          return;
        }
        if (widget.lockedAgentId) {
          return null;
        }
        const range = computeCompletionRanges(model, position, AgentOrSlashCommandWord);
        if (!range) {
          return null;
        }
        if (!isEmptyUpToCompletionWord(model, range)) {
          return;
        }
        const agents = this.chatAgentService.getAgents().filter((a) => a.locations.includes(widget.location));
        const chatSessionContributions = this.chatSessionsService.getAllChatSessionContributions();
        const chatSessionAgentIds = new Set(chatSessionContributions.map((contribution) => contribution.type));
        const agentsForSlashCommands = agents.filter((a) => !chatSessionAgentIds.has(a.id));
        const getFilterText = (agent, command) => {
          const dummyPrefix = agent.id === "github.copilot.terminalPanel" ? `0000` : ``;
          return `${chatAgentLeader}${dummyPrefix}${agent.name}.${command}`;
        };
        const justAgents = agents.filter((a) => !a.isDefault).filter((a) => !chatSessionAgentIds.has(a.id)).map((agent) => {
          const { label: agentLabel, isDupe } = this.getAgentCompletionDetails(agent);
          const detail = agent.description;
          return {
            label: isDupe ? { label: agentLabel, description: agent.description, detail: ` (${agent.publisherDisplayName})` } : agentLabel,
            documentation: detail,
            filterText: `${chatAgentLeader}${agent.name}`,
            insertText: `${agentLabel} `,
            range,
            kind: CompletionItemKind.Text,
            sortText: `${chatAgentLeader}${agent.name}`,
            command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent, widget }] }
          };
        });
        return {
          suggestions: justAgents.concat(
            coalesce(agentsForSlashCommands.flatMap((agent) => agent.slashCommands.map((c, i) => {
              if (agent.isDefault && this.chatAgentService.getDefaultAgent(widget.location, widget.input.currentModeKind)?.id !== agent.id) {
                return;
              }
              const { label: agentLabel, isDupe } = this.getAgentCompletionDetails(agent);
              const label = `${agentLabel} ${chatSubcommandLeader}${c.name}`;
              const item = {
                label: isDupe ? { label, description: c.description, detail: isDupe ? ` (${agent.publisherDisplayName})` : void 0 } : label,
                documentation: c.description,
                filterText: getFilterText(agent, c.name),
                commitCharacters: [" "],
                insertText: label + " ",
                range,
                kind: CompletionItemKind.Text,
                // The icons are disabled here anyway
                sortText: `x${chatAgentLeader}${agent.name}${c.name}`,
                command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent, widget }] }
              };
              if (agent.isDefault) {
                const label2 = `${chatSubcommandLeader}${c.name}`;
                item.label = label2;
                item.insertText = `${label2} `;
                item.documentation = c.description;
              }
              return item;
            })))
          )
        };
      }
    }));
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "chatAgentAndSubcommand",
      triggerCharacters: [chatSubcommandLeader],
      provideCompletionItems: async (model, position, _context, token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        const viewModel = widget?.viewModel;
        if (!widget || !viewModel) {
          return;
        }
        if (isAgentHostBackedWidget(widget)) {
          return;
        }
        if (widget.lockedAgentId) {
          return null;
        }
        const range = computeCompletionRanges(model, position, AgentOrSlashCommandWord);
        if (!range) {
          return null;
        }
        if (!isEmptyUpToCompletionWord(model, range)) {
          return;
        }
        const agents = this.chatAgentService.getAgents().filter((a) => a.locations.includes(widget.location) && a.modes.includes(widget.input.currentModeKind)).filter((a) => !this.chatSessionsService.getChatSessionContribution(a.id));
        return {
          suggestions: coalesce(agents.flatMap((agent) => agent.slashCommands.map((c, i) => {
            if (agent.isDefault && this.chatAgentService.getDefaultAgent(widget.location, widget.input.currentModeKind)?.id !== agent.id) {
              return;
            }
            const { label: agentLabel, isDupe } = this.getAgentCompletionDetails(agent);
            const withSlash = `${chatSubcommandLeader}${c.name}`;
            const extraSortText = agent.id === "github.copilot.terminalPanel" ? `z` : ``;
            const sortText = `${chatSubcommandLeader}${extraSortText}${agent.name}${c.name}`;
            const item = {
              label: { label: withSlash, description: agentLabel, detail: isDupe ? ` (${agent.publisherDisplayName})` : void 0 },
              commitCharacters: [" "],
              insertText: `${agentLabel} ${withSlash} `,
              documentation: `(${agentLabel}) ${c.description ?? ""}`,
              range,
              kind: CompletionItemKind.Text,
              // The icons are disabled here anyway
              sortText,
              command: { id: AssignSelectedAgentAction.ID, title: AssignSelectedAgentAction.ID, arguments: [{ agent, widget }] }
            };
            if (agent.isDefault) {
              const label = `${chatSubcommandLeader}${c.name}`;
              item.label = label;
              item.insertText = `${label} `;
              item.documentation = c.description;
            }
            return item;
          })))
        };
      }
    }));
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "installChatExtensions",
      triggerCharacters: [chatAgentLeader],
      provideCompletionItems: async (model, position, _context, token) => {
        if (!model.getLineContent(1).startsWith(chatAgentLeader)) {
          return;
        }
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (widget?.location !== ChatAgentLocation.Chat || widget.input.currentModeKind !== ChatModeKind.Ask) {
          return;
        }
        if (isAgentHostBackedWidget(widget)) {
          return;
        }
        if (widget.lockedAgentId) {
          return null;
        }
        const range = computeCompletionRanges(model, position, AgentOrSlashCommandWord);
        if (!range) {
          return;
        }
        if (!isEmptyUpToCompletionWord(model, range)) {
          return;
        }
        const label = localize("installLabel", "Install Chat Extensions...");
        const item = {
          label,
          insertText: "",
          range,
          kind: CompletionItemKind.Text,
          // The icons are disabled here anyway
          command: { id: "workbench.extensions.search", title: "", arguments: ["@tag:chat-participant"] },
          filterText: chatAgentLeader + label,
          sortText: "zzz"
        };
        return {
          suggestions: [item]
        };
      }
    }));
  }
  getCurrentAgentForWidget(widget) {
    if (widget.lockedAgentId) {
      const usedAgent2 = this.chatAgentService.getAgent(widget.lockedAgentId);
      return usedAgent2 && { agent: usedAgent2 };
    }
    const parsedRequest = widget.parsedInput.parts;
    const usedAgentIdx = parsedRequest.findIndex((p) => p instanceof ChatRequestAgentPart);
    if (usedAgentIdx < 0) {
      return;
    }
    const usedAgent = parsedRequest[usedAgentIdx];
    const usedOtherCommand = parsedRequest.find((p) => p instanceof ChatRequestAgentSubcommandPart || p instanceof ChatRequestSlashPromptPart);
    if (usedOtherCommand) {
      return {
        agent: usedAgent.agent,
        command: usedOtherCommand instanceof ChatRequestAgentSubcommandPart ? usedOtherCommand.command.name : void 0
      };
    }
    for (const partAfterAgent of parsedRequest.slice(usedAgentIdx + 1)) {
      if (!(partAfterAgent instanceof ChatRequestTextPart) || !partAfterAgent.text.trim().match(/^(\/[\p{L}0-9_.:-]*)?$/u)) {
        return;
      }
    }
    return { agent: usedAgent.agent };
  }
  getAgentCompletionDetails(agent) {
    const isAllowed = this.chatAgentNameService.getAgentNameRestriction(agent);
    const agentLabel = `${chatAgentLeader}${isAllowed ? agent.name : getFullyQualifiedId(agent)}`;
    const isDupe = isAllowed && this.chatAgentService.agentHasDupeName(agent.id);
    return { label: agentLabel, isDupe };
  }
};
AgentCompletions = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService),
  __decorateParam(1, IChatWidgetService),
  __decorateParam(2, IChatAgentService),
  __decorateParam(3, IChatAgentNameService),
  __decorateParam(4, IChatSessionsService)
], AgentCompletions);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(AgentCompletions, LifecyclePhase.Eventually);
const _AssignSelectedAgentAction = class _AssignSelectedAgentAction extends Action2 {
  constructor() {
    super({
      id: _AssignSelectedAgentAction.ID,
      title: ""
      // not displayed
    });
  }
  async run(accessor, ...args) {
    const arg = args[0];
    if (!arg || !arg.widget || !arg.agent) {
      return;
    }
    if (!arg.agent.modes.includes(arg.widget.input.currentModeKind)) {
      arg.widget.input.setChatMode(arg.agent.modes[0]);
    }
    arg.widget.lastSelectedAgent = arg.agent;
  }
};
_AssignSelectedAgentAction.ID = "workbench.action.chat.assignSelectedAgent";
let AssignSelectedAgentAction = _AssignSelectedAgentAction;
registerAction2(AssignSelectedAgentAction);
const _StartParameterizedPromptAction = class _StartParameterizedPromptAction extends Action2 {
  constructor() {
    super({
      id: _StartParameterizedPromptAction.ID,
      title: ""
      // not displayed
    });
  }
  async run(accessor, model, server, prompt, textToReplace) {
    if (!model || !prompt) {
      return;
    }
    const instantiationService = accessor.get(IInstantiationService);
    const notificationService = accessor.get(INotificationService);
    const widgetService = accessor.get(IChatWidgetService);
    const fileService = accessor.get(IFileService);
    const chatWidget = await widgetService.revealWidget(true);
    if (!chatWidget) {
      return;
    }
    const lastPosition = model.getFullModelRange().collapseToEnd();
    const getPromptIndex = () => model.findMatches(textToReplace, true, false, true, null, false)[0];
    const replaceTextWith = (value) => model.applyEdits([{
      range: getPromptIndex()?.range || lastPosition,
      text: value
    }]);
    const store = new DisposableStore();
    const cts = store.add(new CancellationTokenSource());
    store.add(chatWidget.input.startGenerating());
    store.add(model.onDidChangeContent(() => {
      if (getPromptIndex()) {
        cts.cancel();
      }
    }));
    model.changeDecorations((accessor2) => {
      const id = accessor2.addDecoration(lastPosition, {
        description: "mcp-prompt-spinner",
        showIfCollapsed: true,
        after: {
          content: " ",
          inlineClassNameAffectsLetterSpacing: true,
          inlineClassName: ThemeIcon.asClassName(ThemeIcon.modify(Codicon.loading, "spin")) + " chat-prompt-spinner"
        }
      });
      store.add(toDisposable(() => {
        model.changeDecorations((a) => a.removeDecoration(id));
      }));
    });
    const pick = store.add(instantiationService.createInstance(McpPromptArgumentPick, prompt));
    try {
      await server.start();
      const args = await pick.createArgs();
      if (!args) {
        replaceTextWith("");
        return;
      }
      let messages;
      try {
        messages = await prompt.resolve(args, cts.token);
      } catch (e) {
        if (!cts.token.isCancellationRequested) {
          notificationService.error(localize("mcp.prompt.error", "Error resolving prompt: {0}", String(e)));
        }
        replaceTextWith("");
        return;
      }
      const toAttach = [];
      const attachBlob = async (mimeType, contents, uriStr, isText = false) => {
        let validURI;
        if (uriStr) {
          for (const uri of [URI.parse(uriStr), McpResourceURI.fromServer(server.definition, uriStr)]) {
            try {
              validURI ||= await fileService.exists(uri) ? uri : void 0;
            } catch {
            }
          }
        }
        if (isText) {
          if (validURI) {
            toAttach.push({
              id: generateUuid(),
              kind: "file",
              value: validURI,
              name: basename(validURI)
            });
          } else {
            toAttach.push({
              id: generateUuid(),
              kind: "generic",
              value: contents,
              name: localize("mcp.prompt.resource", "Prompt Resource")
            });
          }
        } else if (mimeType && getAttachableImageExtension(mimeType)) {
          const resized = await resizeImage(contents).catch(() => decodeBase64(contents).buffer);
          chatWidget.attachmentModel.addContext({
            id: generateUuid(),
            name: localize("mcp.prompt.image", "Prompt Image"),
            fullName: localize("mcp.prompt.image", "Prompt Image"),
            value: resized,
            kind: "image",
            references: validURI && [{ reference: validURI, kind: "reference" }]
          });
        } else if (validURI) {
          toAttach.push({
            id: generateUuid(),
            kind: "file",
            value: validURI,
            name: basename(validURI)
          });
        } else {
        }
      };
      const hasMultipleRoles = messages.some((m) => m.role !== messages[0].role);
      let input = "";
      for (const message of messages) {
        switch (message.content.type) {
          case "text":
            if (input) {
              input += "\n\n";
            }
            if (hasMultipleRoles) {
              input += `--${message.role.toUpperCase()}
`;
            }
            input += message.content.text;
            break;
          case "resource":
            if ("text" in message.content.resource) {
              await attachBlob(message.content.resource.mimeType, message.content.resource.text, message.content.resource.uri, true);
            } else {
              await attachBlob(message.content.resource.mimeType, message.content.resource.blob, message.content.resource.uri);
            }
            break;
          case "image":
          case "audio":
            await attachBlob(message.content.mimeType, message.content.data);
            break;
        }
      }
      if (toAttach.length) {
        chatWidget.attachmentModel.addContext(...toAttach);
      }
      replaceTextWith(input);
    } finally {
      store.dispose();
    }
  }
};
_StartParameterizedPromptAction.ID = "workbench.action.chat.startParameterizedPrompt";
let StartParameterizedPromptAction = _StartParameterizedPromptAction;
registerAction2(StartParameterizedPromptAction);
class ReferenceArgument {
  constructor(widget, variable) {
    this.widget = widget;
    this.variable = variable;
  }
}
let BuiltinDynamicCompletions = class extends Disposable {
  // MUST be using `g`-flag
  constructor(historyService, workspaceContextService, searchService, labelService, languageFeaturesService, chatWidgetService, outlineService, editorService, configurationService, codeEditorService, chatAgentService, instantiationService, chatSessionsService) {
    super();
    this.historyService = historyService;
    this.workspaceContextService = workspaceContextService;
    this.searchService = searchService;
    this.labelService = labelService;
    this.languageFeaturesService = languageFeaturesService;
    this.chatWidgetService = chatWidgetService;
    this.outlineService = outlineService;
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.codeEditorService = codeEditorService;
    this.chatAgentService = chatAgentService;
    this.instantiationService = instantiationService;
    this.chatSessionsService = chatSessionsService;
    this.registerVariableCompletions("attachedContexts", ({ widget, range }) => {
      if (!widget.supportsFileReferences) {
        return;
      }
      const typedLeader = range.varWord?.word?.charAt(0) === chatAgentLeader ? chatAgentLeader : chatVariableLeader;
      const suggestions = widget.attachmentModel.attachments.filter((attachment) => !attachment.range).map((attachment) => {
        const text = `${typedLeader}attachment:${attachment.name}`;
        const referenceRange = {
          startLineNumber: range.replace.startLineNumber,
          startColumn: range.replace.startColumn,
          endLineNumber: range.replace.endLineNumber,
          endColumn: range.replace.startColumn + text.length
        };
        return {
          label: { label: attachment.name, description: localize("attachedContext", "Attached context") },
          filterText: getAttachedContextCompletionFilterText(typedLeader, attachment.name, attachment.kind),
          insertText: range.varWord?.endColumn === range.replace.endColumn ? `${text} ` : text,
          range,
          kind: attachment.kind === "directory" ? CompletionItemKind.Folder : attachment.kind === "file" || attachment.kind === "image" ? CompletionItemKind.File : CompletionItemKind.Reference,
          sortText: attachedContextCompletionSortText,
          command: {
            id: BuiltinDynamicCompletions.addReferenceCommand,
            title: "",
            arguments: [new ReferenceArgument(widget, toAttachedContextDynamicVariable(attachment, referenceRange))]
          }
        };
      });
      return { suggestions };
    }, BuiltinDynamicCompletions.VariableNameDef, true);
    const fileWordPattern = new RegExp(`[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}][^\\s]*`, "g");
    this.registerVariableCompletions("fileAndFolder", async ({ widget, range }, token) => {
      if (!widget.supportsFileReferences) {
        return;
      }
      const result = { suggestions: [] };
      if (widget.lockedAgentId) {
        const agent = this.chatAgentService.getAgent(widget.lockedAgentId);
        if (agent && !agent.capabilities?.supportsFileAttachments) {
          return result;
        }
      }
      await this.addFileAndFolderEntries(widget, result, range, token);
      return result;
    }, fileWordPattern);
    this.registerVariableCompletions("selection", ({ widget, range }, token) => {
      if (!widget.supportsFileReferences) {
        return;
      }
      if (widget.location === ChatAgentLocation.EditorInline) {
        return;
      }
      const active = this.findActiveCodeEditor();
      if (!isCodeEditor(active)) {
        return;
      }
      const currentResource = active.getModel()?.uri;
      const currentSelection = active.getSelection();
      if (!currentSelection || !currentResource || currentSelection.isEmpty()) {
        return;
      }
      const typedLeader = range.varWord?.word?.charAt(0) === chatAgentLeader ? chatAgentLeader : chatVariableLeader;
      const basename2 = this.labelService.getUriBasenameLabel(currentResource);
      const text = `${typedLeader}file:${basename2}:${currentSelection.startLineNumber}-${currentSelection.endLineNumber}`;
      const fullRangeText = `:${currentSelection.startLineNumber}:${currentSelection.startColumn}-${currentSelection.endLineNumber}:${currentSelection.endColumn}`;
      const description = this.labelService.getUriLabel(currentResource, { relative: true }) + fullRangeText;
      const result = { suggestions: [] };
      result.suggestions.push({
        label: { label: `${typedLeader}selection`, description },
        filterText: `${typedLeader}selection`,
        insertText: range.varWord?.endColumn === range.replace.endColumn ? `${text} ` : text,
        range,
        kind: CompletionItemKind.Text,
        sortText: "z",
        command: {
          id: BuiltinDynamicCompletions.addReferenceCommand,
          title: "",
          arguments: [new ReferenceArgument(widget, {
            id: "vscode.selection",
            isFile: true,
            range: { startLineNumber: range.replace.startLineNumber, startColumn: range.replace.startColumn, endLineNumber: range.replace.endLineNumber, endColumn: range.replace.startColumn + text.length },
            data: { range: currentSelection, uri: currentResource }
          })]
        }
      });
      return result;
    });
    this.registerVariableCompletions("symbol", ({ widget, range, position, model }, token) => {
      if (!widget.supportsFileReferences) {
        return null;
      }
      const result = { suggestions: [] };
      const range2 = computeCompletionRanges(model, position, new RegExp(`[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}][^\\s]*`, "g"), true);
      if (range2) {
        this.addSymbolEntries(widget, result, range2, token);
      }
      return result;
    });
    const sessionWordPattern = new RegExp(`${chatVariableLeader}[^\\s]*`, "g");
    this.registerVariableCompletions("sessionReference", async ({ widget, range }, token) => {
      if (widget.location !== ChatAgentLocation.Chat) {
        return;
      }
      const typedWord = range.varWord?.word ?? "";
      const sessionPrefix = `${chatVariableLeader}session`;
      const result = { suggestions: [] };
      if (typedWord.toLowerCase().startsWith(`${sessionPrefix}:`)) {
        const allSessions = [];
        const sessionProviderFilter = [AgentSessionProviders.Local, AgentSessionProviders.Background, AgentSessionProviders.Claude, AgentSessionProviders.AgentHostCopilot];
        for await (const group of this.chatSessionsService.getChatSessionItems(sessionProviderFilter, token)) {
          if (token.isCancellationRequested) {
            return;
          }
          const providerIcon = getAgentSessionProviderIcon(group.chatSessionType);
          for (const item of group.items) {
            allSessions.push({
              title: item.label,
              sessionResource: item.resource,
              lastMessageDate: item.timing.lastRequestEnded ?? item.timing.created,
              icon: item.iconPath ?? providerIcon
            });
          }
        }
        const currentSessionResource = widget.viewModel?.sessionResource;
        const filteredSessions = allSessions.filter((s) => !currentSessionResource || s.sessionResource.toString() !== currentSessionResource.toString()).sort((a, b) => b.lastMessageDate - a.lastMessageDate);
        for (const session of filteredSessions) {
          const text = `${sessionPrefix}:${session.title}`;
          const dateStr = new Date(session.lastMessageDate).toLocaleString();
          result.suggestions.push({
            label: { label: session.title, description: dateStr },
            filterText: `${sessionPrefix}:${session.title}`,
            insertText: range.varWord?.endColumn === range.replace.endColumn ? `${text} ` : text,
            range,
            kind: CompletionItemKind.Text,
            sortText: `z${String(Number.MAX_SAFE_INTEGER - session.lastMessageDate).padStart(20, "0")}`,
            command: {
              id: BuiltinDynamicCompletions.addReferenceCommand,
              title: "",
              arguments: [new ReferenceArgument(widget, {
                id: session.sessionResource.toString(),
                icon: session.icon,
                range: { startLineNumber: range.replace.startLineNumber, startColumn: range.replace.startColumn, endLineNumber: range.replace.endLineNumber, endColumn: range.replace.startColumn + text.length },
                data: session.sessionResource
              })]
            }
          });
        }
      } else {
        result.suggestions.push({
          label: { label: sessionPrefix, description: localize("session.description", "Attach a chat session") },
          filterText: sessionPrefix,
          insertText: `${sessionPrefix}:`,
          range,
          kind: CompletionItemKind.Text,
          sortText: "z",
          command: { id: "editor.action.triggerSuggest", title: "" }
        });
      }
      return result;
    }, sessionWordPattern);
    this._register(CommandsRegistry.registerCommand(BuiltinDynamicCompletions.addReferenceCommand, (_services, arg) => {
      assertType(arg instanceof ReferenceArgument);
      return this.cmdAddReference(arg);
    }));
  }
  findActiveCodeEditor() {
    const codeEditor = this.codeEditorService.getActiveCodeEditor();
    if (codeEditor) {
      const model = codeEditor.getModel();
      if (model?.uri.scheme === Schemas.vscodeNotebookCell) {
        return void 0;
      }
      if (model) {
        return codeEditor;
      }
    }
    for (const codeOrDiffEditor of this.editorService.getVisibleTextEditorControls(EditorsOrder.MOST_RECENTLY_ACTIVE)) {
      const codeEditor2 = getCodeEditor(codeOrDiffEditor);
      if (!codeEditor2) {
        continue;
      }
      const model = codeEditor2.getModel();
      if (model) {
        return codeEditor2;
      }
    }
    return void 0;
  }
  registerVariableCompletions(debugName, provider, wordPattern = BuiltinDynamicCompletions.VariableNameDef, includeAgentHost = false) {
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: `chatVarCompletions-${debugName}`,
      triggerCharacters: [chatVariableLeader, chatAgentLeader],
      provideCompletionItems: async (model, position, context, token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget) {
          return;
        }
        if (!includeAgentHost && isAgentHostBackedWidget(widget)) {
          return;
        }
        const range = computeCompletionRanges(model, position, wordPattern, true);
        if (range) {
          return provider({ model, position, widget, range, context }, token);
        }
        return;
      }
    }));
  }
  async addFileAndFolderEntries(widget, result, info, token) {
    const typedLeader = info.varWord?.word?.charAt(0) === chatAgentLeader ? chatAgentLeader : chatVariableLeader;
    const makeCompletionItem = (resource, kind, description, boostPriority) => {
      const basename2 = this.labelService.getUriBasenameLabel(resource);
      const text = `${typedLeader}file:${basename2}`;
      const uriLabel = this.labelService.getUriLabel(resource, { relative: true });
      const labelDescription = description ? localize("fileEntryDescription", "{0} ({1})", uriLabel, description) : uriLabel;
      const sortText = boostPriority ? " " : "!";
      return {
        label: { label: basename2, description: labelDescription },
        filterText: `${basename2} ${typedLeader}${basename2} ${uriLabel}`,
        insertText: info.varWord?.endColumn === info.replace.endColumn ? `${text} ` : text,
        range: info,
        kind: kind === FileKind.FILE ? CompletionItemKind.File : CompletionItemKind.Folder,
        sortText,
        command: {
          id: BuiltinDynamicCompletions.addReferenceCommand,
          title: "",
          arguments: [new ReferenceArgument(widget, {
            id: resource.toString(),
            isFile: kind === FileKind.FILE,
            isDirectory: kind === FileKind.FOLDER,
            range: { startLineNumber: info.replace.startLineNumber, startColumn: info.replace.startColumn, endLineNumber: info.replace.endLineNumber, endColumn: info.replace.startColumn + text.length },
            data: resource
          })]
        }
      };
    };
    let pattern;
    if (info.varWord?.word && (info.varWord.word.startsWith(chatVariableLeader) || info.varWord.word.startsWith(chatAgentLeader))) {
      pattern = info.varWord.word.toLowerCase().slice(1);
    }
    const seen = new ResourceSet();
    const len = result.suggestions.length;
    for (const [i, item] of this.historyService.getHistory().entries()) {
      const resource = isDiffEditorInput(item) ? item.modified.resource : item.resource;
      if (!resource || seen.has(resource) || !this.instantiationService.invokeFunction((accessor) => isSupportedChatFileScheme(accessor, resource.scheme))) {
        continue;
      }
      if (pattern) {
        const uriLabel = this.labelService.getUriLabel(resource, { relative: true }).toLowerCase();
        const basename2 = this.labelService.getUriBasenameLabel(resource).toLowerCase();
        const combined = `${basename2} ${uriLabel}`;
        if (!isPatternInWord(pattern, 0, pattern.length, combined, 0, combined.length)) {
          continue;
        }
      }
      seen.add(resource);
      const newLen = result.suggestions.push(makeCompletionItem(resource, FileKind.FILE, i === 0 ? localize("activeFile", "Active file") : void 0, i === 0));
      if (newLen - len >= 5) {
        break;
      }
    }
    if (pattern) {
      const cacheKey = this.updateCacheKey();
      const workspaces = this.workspaceContextService.getWorkspace().folders.map((folder) => folder.uri);
      for (const workspace of workspaces) {
        const { folders, files } = await searchFilesAndFolders(workspace, pattern, true, token, cacheKey.key, this.configurationService, this.searchService);
        for (const file of files) {
          if (!seen.has(file)) {
            result.suggestions.push(makeCompletionItem(file, FileKind.FILE));
            seen.add(file);
          }
        }
        for (const folder of folders) {
          if (!seen.has(folder)) {
            result.suggestions.push(makeCompletionItem(folder, FileKind.FOLDER));
            seen.add(folder);
          }
        }
      }
    }
    result.incomplete = true;
  }
  addSymbolEntries(widget, result, info, token) {
    const timeoutMs = 100;
    const stopwatch = new StopWatch();
    const typedLeader = info.varWord?.word?.charAt(0) === chatAgentLeader ? chatAgentLeader : chatVariableLeader;
    const makeSymbolCompletionItem = (symbolItem, pattern2) => {
      const text = `${typedLeader}sym:${symbolItem.name}`;
      const resource = symbolItem.location.uri;
      const uriLabel = this.labelService.getUriLabel(resource, { relative: true });
      const sortText = pattern2 ? "{" : "|";
      return {
        label: { label: symbolItem.name, description: uriLabel },
        filterText: `${typedLeader}${symbolItem.name}`,
        insertText: info.varWord?.endColumn === info.replace.endColumn ? `${text} ` : text,
        range: info,
        kind: SymbolKinds.toCompletionKind(symbolItem.kind),
        sortText,
        command: {
          id: BuiltinDynamicCompletions.addReferenceCommand,
          title: "",
          arguments: [new ReferenceArgument(widget, {
            id: `vscode.symbol/${JSON.stringify(symbolItem.location)}`,
            fullName: symbolItem.name,
            range: { startLineNumber: info.replace.startLineNumber, startColumn: info.replace.startColumn, endLineNumber: info.replace.endLineNumber, endColumn: info.replace.startColumn + text.length },
            data: symbolItem.location,
            icon: SymbolKinds.toIcon(symbolItem.kind)
          })]
        }
      };
    };
    let pattern;
    if (info.varWord?.word && (info.varWord.word.startsWith(chatVariableLeader) || info.varWord.word.startsWith(chatAgentLeader))) {
      pattern = info.varWord.word.toLowerCase().slice(1);
    }
    const symbolsToAdd = [];
    for (const outlineModel of this.outlineService.getCachedModels()) {
      const symbols = outlineModel.asListOfDocumentSymbols();
      for (const symbol of symbols) {
        symbolsToAdd.push({ symbol, uri: outlineModel.uri });
      }
    }
    let timedOut = false;
    for (const symbol of symbolsToAdd) {
      if (stopwatch.elapsed() > timeoutMs || token.isCancellationRequested) {
        timedOut = true;
        break;
      }
      result.suggestions.push(makeSymbolCompletionItem({ ...symbol.symbol, location: { uri: symbol.uri, range: symbol.symbol.range } }, pattern ?? ""));
    }
    result.incomplete = !!pattern || timedOut;
  }
  updateCacheKey() {
    if (this.cacheKey && Date.now() - this.cacheKey.time > 6e4) {
      this.searchService.clearCache(this.cacheKey.key);
      this.cacheKey = void 0;
    }
    if (!this.cacheKey) {
      this.cacheKey = {
        key: generateUuid(),
        time: Date.now()
      };
    }
    this.cacheKey.time = Date.now();
    return this.cacheKey;
  }
  cmdAddReference(arg) {
    arg.widget.getContrib(ChatDynamicVariableModel.ID)?.addReference(arg.variable);
  }
};
BuiltinDynamicCompletions.addReferenceCommand = "_addReferenceCmd";
BuiltinDynamicCompletions.VariableNameDef = new RegExp(`[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}][\\w:-]*`, "g");
BuiltinDynamicCompletions = __decorateClass([
  __decorateParam(0, IHistoryService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, ISearchService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, ILanguageFeaturesService),
  __decorateParam(5, IChatWidgetService),
  __decorateParam(6, IOutlineModelService),
  __decorateParam(7, IEditorService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, ICodeEditorService),
  __decorateParam(10, IChatAgentService),
  __decorateParam(11, IInstantiationService),
  __decorateParam(12, IChatSessionsService)
], BuiltinDynamicCompletions);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(BuiltinDynamicCompletions, LifecyclePhase.Eventually);
let ToolCompletions = class extends Disposable {
  // MUST be using `g`-flag
  constructor(languageFeaturesService, chatWidgetService, chatAgentService) {
    super();
    this.languageFeaturesService = languageFeaturesService;
    this.chatWidgetService = chatWidgetService;
    this.chatAgentService = chatAgentService;
    this._register(this.languageFeaturesService.completionProvider.register({ scheme: Schemas.vscodeChatInput, hasAccessToAllModels: true }, {
      _debugDisplayName: "chatVariables",
      triggerCharacters: [chatVariableLeader, chatAgentLeader],
      provideCompletionItems: async (model, position, _context, _token) => {
        const widget = this.chatWidgetService.getWidgetByInputUri(model.uri);
        if (!widget) {
          return null;
        }
        if (isAgentHostBackedWidget(widget)) {
          return null;
        }
        if (widget.lockedAgentId) {
          const agent = this.chatAgentService.getAgent(widget.lockedAgentId);
          if (agent && !agent.capabilities?.supportsToolAttachments) {
            return null;
          }
        }
        const range = computeCompletionRanges(model, position, ToolCompletions.VariableNameDef, true);
        if (!range) {
          return null;
        }
        const usedNames = /* @__PURE__ */ new Set();
        for (const part of widget.parsedInput.parts) {
          if (part instanceof ChatRequestToolPart) {
            usedNames.add(part.toolName);
          } else if (part instanceof ChatRequestToolSetPart) {
            usedNames.add(part.name);
          }
        }
        const typedLeader = range.varWord?.word?.charAt(0) === chatAgentLeader ? chatAgentLeader : chatVariableLeader;
        const pattern = range.varWord?.word ? range.varWord.word.toLowerCase().slice(1) : "";
        const suggestions = [];
        const iter = widget.input.selectedToolsModel.entriesMap.get();
        for (const [item, enabled] of iter) {
          if (!enabled) {
            continue;
          }
          let detail;
          let documentation;
          let name;
          if (isToolSet(item)) {
            detail = item.description;
            name = item.referenceName;
          } else {
            const source = item.source;
            detail = localize("tool_source_completion", "{0}: {1}", source.label, item.displayName);
            name = item.toolReferenceName ?? item.displayName;
            documentation = item.userDescription ?? item.modelDescription;
          }
          if (usedNames.has(name)) {
            continue;
          }
          if (pattern) {
            const lowerName = name.toLowerCase();
            if (!isPatternInWord(pattern, 0, pattern.length, lowerName, 0, lowerName.length)) {
              continue;
            }
          }
          const withLeader = `${typedLeader}${name}`;
          suggestions.push({
            label: withLeader,
            range,
            detail,
            documentation,
            filterText: `${typedLeader}${name}`,
            insertText: withLeader + " ",
            kind: CompletionItemKind.Tool
          });
        }
        return { suggestions };
      }
    }));
  }
};
ToolCompletions.VariableNameDef = new RegExp(`(?<=^|\\s)[${escapeForCharClass(chatVariableLeader)}${escapeForCharClass(chatAgentLeader)}]\\w*`, "g");
ToolCompletions = __decorateClass([
  __decorateParam(0, ILanguageFeaturesService),
  __decorateParam(1, IChatWidgetService),
  __decorateParam(2, IChatAgentService)
], ToolCompletions);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(ToolCompletions, LifecyclePhase.Eventually);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvZWRpdG9yL2NoYXRJbnB1dENvbXBsZXRpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgY29hbGVzY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgZGVjb2RlQmFzZTY0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IGlzUGF0dGVybkluV29yZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGFzc2VydFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgZ2V0Q29kZUVkaXRvciwgaXNDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJV29yZEF0UG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvd29yZEhlbHBlci5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uQ29udGV4dCwgQ29tcGxldGlvbkl0ZW0sIENvbXBsZXRpb25JdGVtS2luZCwgQ29tcGxldGlvbkl0ZW1Qcm92aWRlciwgQ29tcGxldGlvbkxpc3QsIERvY3VtZW50U3ltYm9sLCBMb2NhdGlvbiwgUHJvdmlkZXJSZXN1bHQsIFN5bWJvbEtpbmQsIFN5bWJvbEtpbmRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IElPdXRsaW5lTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZG9jdW1lbnRTeW1ib2xzL2Jyb3dzZXIvb3V0bGluZU1vZGVsLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEZpbGVLaW5kLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBXb3JrYmVuY2hFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgRWRpdG9yc09yZGVyLCBpc0RpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvaGlzdG9yeS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElTZWFyY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgTWNwUHJvbXB0QXJndW1lbnRQaWNrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbWNwL2Jyb3dzZXIvbWNwUHJvbXB0QXJndW1lbnRQaWNrLmpzJztcbmltcG9ydCB7IElNY3BQcm9tcHQsIElNY3BQcm9tcHRNZXNzYWdlLCBJTWNwU2VydmVyLCBJTWNwU2VydmljZSwgTWNwUmVzb3VyY2VVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9tY3AvY29tbW9uL21jcFR5cGVzLmpzJztcbmltcG9ydCB7IHNlYXJjaEZpbGVzQW5kRm9sZGVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlYXJjaC9icm93c2VyL3NlYXJjaENoYXRDb250ZXh0LmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnREYXRhLCBJQ2hhdEFnZW50TmFtZVNlcnZpY2UsIElDaGF0QWdlbnRTZXJ2aWNlLCBnZXRGdWxseVF1YWxpZmllZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IGdldEF0dGFjaGFibGVJbWFnZUV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RBZ2VudFBhcnQsIENoYXRSZXF1ZXN0QWdlbnRTdWJjb21tYW5kUGFydCwgQ2hhdFJlcXVlc3RTbGFzaFByb21wdFBhcnQsIENoYXRSZXF1ZXN0VGV4dFBhcnQsIENoYXRSZXF1ZXN0VG9vbFBhcnQsIENoYXRSZXF1ZXN0VG9vbFNldFBhcnQsIGNoYXRBZ2VudExlYWRlciwgY2hhdFN1YmNvbW1hbmRMZWFkZXIsIGNoYXRWYXJpYWJsZUxlYWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9yZXF1ZXN0UGFyc2VyL2NoYXRQYXJzZXJUeXBlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRTbGFzaENvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBJRHluYW1pY1ZhcmlhYmxlLCB0b0F0dGFjaGVkQ29udGV4dER5bmFtaWNWYXJpYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0TW9kZUtpbmQsIGlzU3VwcG9ydGVkQ2hhdEZpbGVTY2hlbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IGlzVG9vbFNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBpc0FnZW50SG9zdFRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IG1hdGNoZXNTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0U3VibWl0QWN0aW9uLCBJQ2hhdEV4ZWN1dGVBY3Rpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vYWN0aW9ucy9jaGF0RXhlY3V0ZUFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgcmVzaXplSW1hZ2UgfSBmcm9tICcuLi8uLi8uLi9jaGF0SW1hZ2VVdGlscy5qcyc7XG5pbXBvcnQgeyBDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9hdHRhY2htZW50cy9jaGF0RHluYW1pY1ZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgYXR0YWNoZWRDb250ZXh0Q29tcGxldGlvblNvcnRUZXh0LCBjb21wdXRlQ29tcGxldGlvblJhbmdlcywgZXNjYXBlRm9yQ2hhckNsYXNzLCBnZXRBdHRhY2hlZENvbnRleHRDb21wbGV0aW9uRmlsdGVyVGV4dCwgSUNoYXRDb21wbGV0aW9uUmFuZ2VSZXN1bHQsIGlzRW1wdHlVcFRvQ29tcGxldGlvbldvcmQgfSBmcm9tICcuL2NoYXRJbnB1dENvbXBsZXRpb25VdGlscy5qcyc7XG5pbXBvcnQgeyBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24sIEFnZW50U2Vzc2lvblByb3ZpZGVycyB9IGZyb20gJy4uLy4uLy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9ucy5qcyc7XG5cbi8qKlxuICogUmVnZXggbWF0Y2hpbmcgYSBzbGFzaCBjb21tYW5kIHdvcmQgKGUuZy4gYC9mb29gKS4gVXNlcyBgXFxwe0x9YCBmb3IgVW5pY29kZVxuICogbGV0dGVyIG1hdGNoaW5nLCBjb25zaXN0ZW50IHdpdGggYGlzVmFsaWRTbGFzaENvbW1hbmROYW1lYC5cbiAqL1xuY29uc3QgU2xhc2hDb21tYW5kV29yZCA9IC9cXC9bXFxwe0x9MC05Xy46LV0qL2d1O1xuXG4vKipcbiAqIFJlZ2V4IG1hdGNoaW5nIGFuIGFnZW50LW9yLXNsYXNoIGNvbW1hbmQgd29yZCAoZS5nLiBgQGFnZW50YCBvciBgL2NtZGApLlxuICovXG5jb25zdCBBZ2VudE9yU2xhc2hDb21tYW5kV29yZCA9IC8oQHxcXC8pW1xccHtMfTAtOV8uOi1dKi9ndTtcblxuLyoqXG4gKiBSZXR1cm5zIGB0cnVlYCB3aGVuIHRoZSB3aWRnZXQncyBjaGF0IHNlc3Npb24gaXMgYmFja2VkIGJ5IGFuIGFnZW50XG4gKiBob3N0IChsb2NhbCBvciByZW1vdGUpLiBGb3IgdGhlc2Ugc2Vzc2lvbnMsIGNvbXBsZXRpb25zIGFyZSBkZWxlZ2F0ZWRcbiAqIHRvIHRoZSBhZ2VudCBob3N0IHZpYSBgQWdlbnRIb3N0SW5wdXRDb21wbGV0aW9uc2AsIGFuZCB0aGUgd29ya2JlbmNoJ3NcbiAqIGRlZmF1bHQgaW4tcHJvY2VzcyBwcm92aWRlcnMgKGZpbGUvc3ltYm9sL3Rvb2wvYWdlbnQpIHNob3J0LWNpcmN1aXQuXG4gKi9cbmZ1bmN0aW9uIGlzQWdlbnRIb3N0QmFja2VkV2lkZ2V0KHdpZGdldDogSUNoYXRXaWRnZXQpOiBib29sZWFuIHtcblx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gd2lkZ2V0LnZpZXdNb2RlbD8ubW9kZWwuc2Vzc2lvblJlc291cmNlO1xuXHRyZXR1cm4gISFzZXNzaW9uUmVzb3VyY2UgJiYgaXNBZ2VudEhvc3RUYXJnZXQoZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkpO1xufVxuXG5jbGFzcyBTbGFzaENvbW1hbmRDb21wbGV0aW9ucyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNsYXNoQ29tbWFuZFNlcnZpY2U6IElDaGF0U2xhc2hDb21tYW5kU2VydmljZSxcblx0XHRASUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhhcm5lc3NTZXJ2aWNlOiBJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlcnZpY2UgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElNY3BTZXJ2aWNlIG1jcFNlcnZpY2U6IElNY3BTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlQ2hhdElucHV0LCBoYXNBY2Nlc3NUb0FsbE1vZGVsczogdHJ1ZSB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ2dsb2JhbFNsYXNoQ29tbWFuZHMnLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFtjaGF0U3ViY29tbWFuZExlYWRlcl0sXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zOiBhc3luYyAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgX2NvbnRleHQ6IENvbXBsZXRpb25Db250ZXh0LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlJbnB1dFVyaShtb2RlbC51cmkpO1xuXHRcdFx0XHRpZiAoIXdpZGdldCB8fCAhd2lkZ2V0LnZpZXdNb2RlbCkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgcG9zaXRpb24sIFNsYXNoQ29tbWFuZFdvcmQpO1xuXHRcdFx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWlzRW1wdHlVcFRvQ29tcGxldGlvbldvcmQobW9kZWwsIHJhbmdlKSkge1xuXHRcdFx0XHRcdC8vIE5vIHRleHQgYWxsb3dlZCBiZWZvcmUgdGhlIGNvbXBsZXRpb25cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBwYXJzZWRSZXF1ZXN0ID0gd2lkZ2V0LnBhcnNlZElucHV0LnBhcnRzO1xuXHRcdFx0XHRjb25zdCB1c2VkQWdlbnQgPSBwYXJzZWRSZXF1ZXN0LmZpbmQocCA9PiBwIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RBZ2VudFBhcnQpO1xuXHRcdFx0XHRpZiAodXNlZEFnZW50KSB7XG5cdFx0XHRcdFx0Ly8gTm8gKGNsYXNzaWMpIGdsb2JhbCBzbGFzaCBjb21tYW5kcyB3aGVuIGFuIGFnZW50IGlzIHVzZWRcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gdGhpcy5jaGF0U2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcyh3aWRnZXQubG9jYXRpb24sIHdpZGdldC5pbnB1dC5jdXJyZW50TW9kZUtpbmQpO1xuXHRcdFx0XHRpZiAoIXNsYXNoQ29tbWFuZHMpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25UeXBlID0gZ2V0Q2hhdFNlc3Npb25UeXBlKHdpZGdldC52aWV3TW9kZWwubW9kZWwuc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBzbGFzaENvbW1hbmRzXG5cdFx0XHRcdFx0XHQuZmlsdGVyKGMgPT4ge1xuXHRcdFx0XHRcdFx0XHQvLyBzaWxlbnQgY29tbWFuZHMgYXJlIGNsaWVudC1zaWRlIG9ubHkuLi4gc28gdGhleSdyZSBub3QgXCJhdHRhY2hpbmcgYW55dGhpbmdcIlxuXHRcdFx0XHRcdFx0XHQvLyBzbyB0aGlzIGNoZWNrIGNhbiBiZSBzY29wZWQgdG8gd2hlbiB0aGUgY29tbWFuZCBfZG9lc18gYXR0YWNoIHNvbWV0aGluZyBiZWZvcmVcblx0XHRcdFx0XHRcdFx0Ly8gY2hlY2tpbmcgaWYgdGhlIHdpZGdldCBzdXBwb3J0cyBhdHRhY2htZW50cyBhdCBhbGxcblx0XHRcdFx0XHRcdFx0aWYgKCFjLnNpbGVudCAmJiAhd2lkZ2V0LmF0dGFjaG1lbnRDYXBhYmlsaXRpZXMuc3VwcG9ydHNQcm9tcHRBdHRhY2htZW50cykge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRpZiAoYy53aGVuICYmICF3aWRnZXQuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhjLndoZW4pKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmICghbWF0Y2hlc1Nlc3Npb25UeXBlKGMuc2Vzc2lvblR5cGVzLCBzZXNzaW9uVHlwZSkpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0aWYgKCF3aWRnZXQubG9ja2VkQWdlbnRJZCkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmIChjLm1vZGVzICYmIGMubW9kZXMubGVuZ3RoICYmICFjLm1vZGVzLmluY2x1ZGVzKENoYXRNb2RlS2luZC5BZ2VudCkpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdFx0Lm1hcCgoYywgaSk6IENvbXBsZXRpb25JdGVtID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgd2l0aFNsYXNoID0gYC8ke2MuY29tbWFuZH1gO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiB3aXRoU2xhc2gsIGRlc2NyaXB0aW9uOiBjLmRldGFpbCB9LFxuXHRcdFx0XHRcdFx0XHRcdGluc2VydFRleHQ6IGMuZXhlY3V0ZUltbWVkaWF0ZWx5ID8gJycgOiBgJHt3aXRoU2xhc2h9IGAsXG5cdFx0XHRcdFx0XHRcdFx0ZG9jdW1lbnRhdGlvbjogYy5kZXRhaWwsXG5cdFx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdFx0c29ydFRleHQ6IGMuc29ydFRleHQgPz8gJ2EnLnJlcGVhdChpICsgMSksXG5cdFx0XHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsIC8vIFRoZSBpY29ucyBhcmUgZGlzYWJsZWQgaGVyZSBhbnl3YXksXG5cdFx0XHRcdFx0XHRcdFx0Y29tbWFuZDogYy5leGVjdXRlSW1tZWRpYXRlbHkgPyB7IGlkOiBDaGF0U3VibWl0QWN0aW9uLklELCB0aXRsZTogd2l0aFNsYXNoLCBhcmd1bWVudHM6IFt7IHdpZGdldCwgaW5wdXRWYWx1ZTogYCR7d2l0aFNsYXNofSBgIH0gc2F0aXNmaWVzIElDaGF0RXhlY3V0ZUFjdGlvbkNvbnRleHRdIH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVDaGF0SW5wdXQsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiAnZ2xvYmFsU2xhc2hDb21tYW5kc0F0Jyxcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzOiBbY2hhdEFnZW50TGVhZGVyXSxcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXM6IGFzeW5jIChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCBfY29udGV4dDogQ29tcGxldGlvbkNvbnRleHQsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeUlucHV0VXJpKG1vZGVsLnVyaSk7XG5cdFx0XHRcdGlmICghd2lkZ2V0IHx8ICF3aWRnZXQudmlld01vZGVsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByYW5nZSA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBwb3NpdGlvbiwgL0BcXHcqL2cpO1xuXHRcdFx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIWlzRW1wdHlVcFRvQ29tcGxldGlvbldvcmQobW9kZWwsIHJhbmdlKSkge1xuXHRcdFx0XHRcdC8vIE5vIHRleHQgYWxsb3dlZCBiZWZvcmUgdGhlIGNvbXBsZXRpb25cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzbGFzaENvbW1hbmRzID0gdGhpcy5jaGF0U2xhc2hDb21tYW5kU2VydmljZS5nZXRDb21tYW5kcyh3aWRnZXQubG9jYXRpb24sIHdpZGdldC5pbnB1dC5jdXJyZW50TW9kZUtpbmQpO1xuXHRcdFx0XHRpZiAoIXNsYXNoQ29tbWFuZHMpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh3aWRnZXQubG9ja2VkQWdlbnRJZCkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgY3VycmVudFNlc3Npb25UeXBlID0gZ2V0Q2hhdFNlc3Npb25UeXBlKHdpZGdldC52aWV3TW9kZWwubW9kZWwuc2Vzc2lvblJlc291cmNlKTtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBzbGFzaENvbW1hbmRzXG5cdFx0XHRcdFx0XHQuZmlsdGVyKGMgPT4gIWMud2hlbiB8fCB3aWRnZXQuc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhjLndoZW4pKVxuXHRcdFx0XHRcdFx0LmZpbHRlcihjID0+IG1hdGNoZXNTZXNzaW9uVHlwZShjLnNlc3Npb25UeXBlcywgY3VycmVudFNlc3Npb25UeXBlKSlcblx0XHRcdFx0XHRcdC5tYXAoKGMsIGkpOiBDb21wbGV0aW9uSXRlbSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHdpdGhTbGFzaCA9IGAke2NoYXRTdWJjb21tYW5kTGVhZGVyfSR7Yy5jb21tYW5kfWA7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IHdpdGhTbGFzaCwgZGVzY3JpcHRpb246IGMuZGV0YWlsIH0sXG5cdFx0XHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogYy5leGVjdXRlSW1tZWRpYXRlbHkgPyAnJyA6IGAke3dpdGhTbGFzaH0gYCxcblx0XHRcdFx0XHRcdFx0XHRkb2N1bWVudGF0aW9uOiBjLmRldGFpbCxcblx0XHRcdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdFx0XHRmaWx0ZXJUZXh0OiBgJHtjaGF0QWdlbnRMZWFkZXJ9JHtjLmNvbW1hbmR9YCxcblx0XHRcdFx0XHRcdFx0XHRzb3J0VGV4dDogYy5zb3J0VGV4dCA/PyAneicucmVwZWF0KGkgKyAxKSxcblx0XHRcdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCwgLy8gVGhlIGljb25zIGFyZSBkaXNhYmxlZCBoZXJlIGFueXdheSxcblx0XHRcdFx0XHRcdFx0XHRjb21tYW5kOiBjLmV4ZWN1dGVJbW1lZGlhdGVseSA/IHsgaWQ6IENoYXRTdWJtaXRBY3Rpb24uSUQsIHRpdGxlOiB3aXRoU2xhc2gsIGFyZ3VtZW50czogW3sgd2lkZ2V0LCBpbnB1dFZhbHVlOiBgJHt3aXRoU2xhc2h9IGAgfSBzYXRpc2ZpZXMgSUNoYXRFeGVjdXRlQWN0aW9uQ29udGV4dF0gfSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLnJlZ2lzdGVyKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZUNoYXRJbnB1dCwgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICdwcm9tcHRTbGFzaENvbW1hbmRzJyxcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzOiBbY2hhdFN1YmNvbW1hbmRMZWFkZXJdLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtczogYXN5bmMgKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIF9jb250ZXh0OiBDb21wbGV0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlJbnB1dFVyaShtb2RlbC51cmkpO1xuXHRcdFx0XHRpZiAoIXdpZGdldCB8fCAhd2lkZ2V0LnZpZXdNb2RlbCkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGlzQWdlbnRIb3N0QmFja2VkV2lkZ2V0KHdpZGdldCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByYW5nZSA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBwb3NpdGlvbiwgU2xhc2hDb21tYW5kV29yZCk7XG5cdFx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghaXNFbXB0eVVwVG9Db21wbGV0aW9uV29yZChtb2RlbCwgcmFuZ2UpKSB7XG5cdFx0XHRcdFx0Ly8gTm8gdGV4dCBhbGxvd2VkIGJlZm9yZSB0aGUgY29tcGxldGlvblxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHBhcnNlZFJlcXVlc3QgPSB3aWRnZXQucGFyc2VkSW5wdXQucGFydHM7XG5cdFx0XHRcdGNvbnN0IHVzZWRBZ2VudCA9IHBhcnNlZFJlcXVlc3QuZmluZChwID0+IHAgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdEFnZW50UGFydCk7XG5cdFx0XHRcdGlmICh1c2VkQWdlbnQpIHtcblx0XHRcdFx0XHQvLyBObyAoY2xhc3NpYykgZ2xvYmFsIHNsYXNoIGNvbW1hbmRzIHdoZW4gYW4gYWdlbnQgaXMgdXNlZFxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uVHlwZSA9IGdldENoYXRTZXNzaW9uVHlwZSh3aWRnZXQudmlld01vZGVsLm1vZGVsLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGNvbnN0IHByb21wdENvbW1hbmRzID0gYXdhaXQgdGhpcy5oYXJuZXNzU2VydmljZS5nZXRTbGFzaENvbW1hbmRzKHdpZGdldC52aWV3TW9kZWwubW9kZWwuc2Vzc2lvblJlc291cmNlLCB0b2tlbik7XG5cdFx0XHRcdGlmIChwcm9tcHRDb21tYW5kcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh3aWRnZXQubG9ja2VkQWdlbnRJZCAmJiAhd2lkZ2V0LmF0dGFjaG1lbnRDYXBhYmlsaXRpZXMuc3VwcG9ydHNQcm9tcHRBdHRhY2htZW50cykge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgdXNlckludm9jYWJsZUNvbW1hbmRzID0gcHJvbXB0Q29tbWFuZHNcblx0XHRcdFx0XHQuZmlsdGVyKGMgPT4gYy51c2VySW52b2NhYmxlKVxuXHRcdFx0XHRcdC5maWx0ZXIoYyA9PiBtYXRjaGVzU2Vzc2lvblR5cGUoYy5zZXNzaW9uVHlwZXMsIGN1cnJlbnRTZXNzaW9uVHlwZSkpO1xuXHRcdFx0XHRpZiAodXNlckludm9jYWJsZUNvbW1hbmRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdWdnZXN0aW9uczogdXNlckludm9jYWJsZUNvbW1hbmRzLm1hcCgoYywgaSk6IENvbXBsZXRpb25JdGVtID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbG9uTGFiZWwgPSBgLyR7Yy5uYW1lfWA7XG5cdFx0XHRcdFx0XHRjb25zdCBoYXNTdWJjb21tYW5kID0gYy5uYW1lLmluY2x1ZGVzKCc6Jyk7XG5cdFx0XHRcdFx0XHRjb25zdCBkaXNwbGF5TGFiZWwgPSBoYXNTdWJjb21tYW5kID8gYC8ke2MubmFtZS5yZXBsYWNlKC86L2csICcgJyl9YCA6IGNvbG9uTGFiZWw7XG5cdFx0XHRcdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IGMuZGVzY3JpcHRpb247XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbDogZGlzcGxheUxhYmVsLCBkZXNjcmlwdGlvbiB9LFxuXHRcdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiBgJHtkaXNwbGF5TGFiZWx9IGAsXG5cdFx0XHRcdFx0XHRcdGRvY3VtZW50YXRpb246IGMuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHQvLyBBbGxvdyBtYXRjaGluZyBieSBlaXRoZXIgdGhlIHNwYWNlIGZvcm0gKHdoYXQgdGhlIHVzZXIgc2Vlcykgb3IgdGhlXG5cdFx0XHRcdFx0XHRcdC8vIGNvbG9uIGZvcm0gKHNvIGxlZ2FjeSBgL2Nocm9uaWNsZTp0aXBzYCB0eXBpbmcgc3RpbGwgZmlsdGVycykuXG5cdFx0XHRcdFx0XHRcdGZpbHRlclRleHQ6IGhhc1N1YmNvbW1hbmQgPyBgJHtjb2xvbkxhYmVsfSAke2Rpc3BsYXlMYWJlbH1gIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRzb3J0VGV4dDogJ2EnLnJlcGVhdChpICsgMSksXG5cdFx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LCAvLyBUaGUgaWNvbnMgYXJlIGRpc2FibGVkIGhlcmUgYW55d2F5LFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLnJlZ2lzdGVyKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZUNoYXRJbnB1dCwgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICdtY3BQcm9tcHRTbGFzaENvbW1hbmRzJyxcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzOiBbY2hhdFN1YmNvbW1hbmRMZWFkZXJdLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtczogYXN5bmMgKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIF9jb250ZXh0OiBDb21wbGV0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5SW5wdXRVcmkobW9kZWwudXJpKTtcblx0XHRcdFx0aWYgKCF3aWRnZXQgfHwgIXdpZGdldC52aWV3TW9kZWwpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc0FnZW50SG9zdEJhY2tlZFdpZGdldCh3aWRnZXQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gcmVnZXggaXMgdGhlIG9wcG9zaXRlIG9mIGBtY3BQcm9tcHRSZXBsYWNlU3BlY2lhbENoYXJzYCBmb3VuZCBpbiBgbWNwVHlwZXMudHNgXG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIHBvc2l0aW9uLCAvXFwvW1xccHtMfTAtOV8uLV0qL2d1KTtcblx0XHRcdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFpc0VtcHR5VXBUb0NvbXBsZXRpb25Xb3JkKG1vZGVsLCByYW5nZSkpIHtcblx0XHRcdFx0XHQvLyBObyB0ZXh0IGFsbG93ZWQgYmVmb3JlIHRoZSBjb21wbGV0aW9uXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHdpZGdldC5sb2NrZWRBZ2VudElkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBtY3BTZXJ2aWNlLnNlcnZlcnMuZ2V0KCkuZmxhdE1hcChzZXJ2ZXIgPT4gc2VydmVyLnByb21wdHMuZ2V0KCkubWFwKChwcm9tcHQpOiBDb21wbGV0aW9uSXRlbSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IGAvbWNwLiR7cHJvbXB0LmlkfWA7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbCwgZGVzY3JpcHRpb246IHByb21wdC5kZXNjcmlwdGlvbiB9LFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IFN0YXJ0UGFyYW1ldGVyaXplZFByb21wdEFjdGlvbi5JRCxcblx0XHRcdFx0XHRcdFx0XHR0aXRsZTogcHJvbXB0Lm5hbWUsXG5cdFx0XHRcdFx0XHRcdFx0YXJndW1lbnRzOiBbbW9kZWwsIHNlcnZlciwgcHJvbXB0LCBgJHtsYWJlbH0gYF0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGluc2VydFRleHQ6IGAke2xhYmVsfSBgLFxuXHRcdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0pKVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oU2xhc2hDb21tYW5kQ29tcGxldGlvbnMsIExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpO1xuXG5jbGFzcyBBZ2VudENvbXBsZXRpb25zIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50TmFtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0QWdlbnROYW1lU2VydmljZTogSUNoYXRBZ2VudE5hbWVTZXJ2aWNlLFxuXHRcdEBJQ2hhdFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXNzaW9uc1NlcnZpY2U6IElDaGF0U2Vzc2lvbnNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cblx0XHRjb25zdCBzdWJDb21tYW5kUHJvdmlkZXI6IENvbXBsZXRpb25JdGVtUHJvdmlkZXIgPSB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ2NoYXRBZ2VudFN1YmNvbW1hbmQnLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFtjaGF0U3ViY29tbWFuZExlYWRlcl0sXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zOiBhc3luYyAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgX2NvbnRleHQ6IENvbXBsZXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeUlucHV0VXJpKG1vZGVsLnVyaSk7XG5cdFx0XHRcdGlmICghd2lkZ2V0IHx8ICF3aWRnZXQudmlld01vZGVsKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGlzQWdlbnRIb3N0QmFja2VkV2lkZ2V0KHdpZGdldCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByYW5nZSA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBwb3NpdGlvbiwgU2xhc2hDb21tYW5kV29yZCk7XG5cdFx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB1c2VkQWdlbnQgPSB0aGlzLmdldEN1cnJlbnRBZ2VudEZvcldpZGdldCh3aWRnZXQpO1xuXHRcdFx0XHRpZiAoIXVzZWRBZ2VudCB8fCB1c2VkQWdlbnQuY29tbWFuZCkge1xuXHRcdFx0XHRcdC8vIE9ubHkgb25lIGFsbG93ZWRcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiB1c2VkQWdlbnQuYWdlbnQuc2xhc2hDb21tYW5kcy5tYXAoKGMsIGkpOiBDb21wbGV0aW9uSXRlbSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCB3aXRoU2xhc2ggPSBgLyR7Yy5uYW1lfWA7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogd2l0aFNsYXNoLFxuXHRcdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiBgJHt3aXRoU2xhc2h9IGAsXG5cdFx0XHRcdFx0XHRcdGRvY3VtZW50YXRpb246IGMuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCwgLy8gVGhlIGljb25zIGFyZSBkaXNhYmxlZCBoZXJlIGFueXdheVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlQ2hhdElucHV0LCBoYXNBY2Nlc3NUb0FsbE1vZGVsczogdHJ1ZSB9LCBzdWJDb21tYW5kUHJvdmlkZXIpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLnJlZ2lzdGVyKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZUNoYXRJbnB1dCwgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICdjaGF0QWdlbnRBbmRTdWJjb21tYW5kJyxcblx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzOiBbY2hhdEFnZW50TGVhZGVyXSxcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXM6IGFzeW5jIChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCBfY29udGV4dDogQ29tcGxldGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5SW5wdXRVcmkobW9kZWwudXJpKTtcblx0XHRcdFx0Y29uc3Qgdmlld01vZGVsID0gd2lkZ2V0Py52aWV3TW9kZWw7XG5cdFx0XHRcdGlmICghd2lkZ2V0IHx8ICF2aWV3TW9kZWwpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXNBZ2VudEhvc3RCYWNrZWRXaWRnZXQod2lkZ2V0KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh3aWRnZXQubG9ja2VkQWdlbnRJZCkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgcG9zaXRpb24sIEFnZW50T3JTbGFzaENvbW1hbmRXb3JkKTtcblx0XHRcdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFpc0VtcHR5VXBUb0NvbXBsZXRpb25Xb3JkKG1vZGVsLCByYW5nZSkpIHtcblx0XHRcdFx0XHQvLyBObyB0ZXh0IGFsbG93ZWQgYmVmb3JlIHRoZSBjb21wbGV0aW9uXG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYWdlbnRzID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50cygpXG5cdFx0XHRcdFx0LmZpbHRlcihhID0+IGEubG9jYXRpb25zLmluY2x1ZGVzKHdpZGdldC5sb2NhdGlvbikpO1xuXG5cdFx0XHRcdC8vIEZpbHRlciBvdXQgY2hhdFNlc3Npb25zIGNvbnRyaWJ1dGlvbnMgZm9yIHNsYXNoIGNvbW1hbmQgY29tcGxldGlvbnNcblx0XHRcdFx0Y29uc3QgY2hhdFNlc3Npb25Db250cmlidXRpb25zID0gdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldEFsbENoYXRTZXNzaW9uQ29udHJpYnV0aW9ucygpO1xuXHRcdFx0XHRjb25zdCBjaGF0U2Vzc2lvbkFnZW50SWRzID0gbmV3IFNldChjaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbnMubWFwKGNvbnRyaWJ1dGlvbiA9PiBjb250cmlidXRpb24udHlwZSkpO1xuXHRcdFx0XHRjb25zdCBhZ2VudHNGb3JTbGFzaENvbW1hbmRzID0gYWdlbnRzLmZpbHRlcihhID0+ICFjaGF0U2Vzc2lvbkFnZW50SWRzLmhhcyhhLmlkKSk7XG5cblx0XHRcdFx0Ly8gV2hlbiB0aGUgaW5wdXQgaXMgb25seSBgL2AsIGl0ZW1zIGFyZSBzb3J0ZWQgYnkgc29ydFRleHQuXG5cdFx0XHRcdC8vIFdoZW4gdHlwaW5nLCBmaWx0ZXJUZXh0IGlzIHVzZWQgdG8gc2NvcmUgYW5kIHNvcnQuXG5cdFx0XHRcdC8vIFRoZSBzYW1lIGxpc3QgaXMgcmVmaWx0ZXJlZC9yYW5rZWQgd2hpbGUgdHlwaW5nLlxuXHRcdFx0XHRjb25zdCBnZXRGaWx0ZXJUZXh0ID0gKGFnZW50OiBJQ2hhdEFnZW50RGF0YSwgY29tbWFuZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0Ly8gVGhpcyBpcyBoYWNraW5nIHRoZSBmaWx0ZXIgYWxnb3JpdGhtIHRvIG1ha2UgQHRlcm1pbmFsIC9leHBsYWluIG1hdGNoIHdvcnNlIHRoYW4gQHdvcmtzcGFjZSAvZXhwbGFpbiBieSBtYWtpbmcgaXRzIG1hdGNoIGluZGV4IGxhdGVyIGluIHRoZSBzdHJpbmcuXG5cdFx0XHRcdFx0Ly8gV2hlbiBJIHR5cGUgYC9leHBgLCB0aGUgd29ya3NwYWNlIG9uZSBzaG91bGQgYmUgc29ydGVkIG92ZXIgdGhlIHRlcm1pbmFsIG9uZS5cblx0XHRcdFx0XHRjb25zdCBkdW1teVByZWZpeCA9IGFnZW50LmlkID09PSAnZ2l0aHViLmNvcGlsb3QudGVybWluYWxQYW5lbCcgPyBgMDAwMGAgOiBgYDtcblx0XHRcdFx0XHRyZXR1cm4gYCR7Y2hhdEFnZW50TGVhZGVyfSR7ZHVtbXlQcmVmaXh9JHthZ2VudC5uYW1lfS4ke2NvbW1hbmR9YDtcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCBqdXN0QWdlbnRzOiBDb21wbGV0aW9uSXRlbVtdID0gYWdlbnRzXG5cdFx0XHRcdFx0LmZpbHRlcihhID0+ICFhLmlzRGVmYXVsdClcblx0XHRcdFx0XHQuZmlsdGVyKGEgPT4gIWNoYXRTZXNzaW9uQWdlbnRJZHMuaGFzKGEuaWQpKVxuXHRcdFx0XHRcdC5tYXAoYWdlbnQgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgeyBsYWJlbDogYWdlbnRMYWJlbCwgaXNEdXBlIH0gPSB0aGlzLmdldEFnZW50Q29tcGxldGlvbkRldGFpbHMoYWdlbnQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZGV0YWlsID0gYWdlbnQuZGVzY3JpcHRpb247XG5cblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBpc0R1cGUgP1xuXHRcdFx0XHRcdFx0XHRcdHsgbGFiZWw6IGFnZW50TGFiZWwsIGRlc2NyaXB0aW9uOiBhZ2VudC5kZXNjcmlwdGlvbiwgZGV0YWlsOiBgICgke2FnZW50LnB1Ymxpc2hlckRpc3BsYXlOYW1lfSlgIH0gOlxuXHRcdFx0XHRcdFx0XHRcdGFnZW50TGFiZWwsXG5cdFx0XHRcdFx0XHRcdGRvY3VtZW50YXRpb246IGRldGFpbCxcblx0XHRcdFx0XHRcdFx0ZmlsdGVyVGV4dDogYCR7Y2hhdEFnZW50TGVhZGVyfSR7YWdlbnQubmFtZX1gLFxuXHRcdFx0XHRcdFx0XHRpbnNlcnRUZXh0OiBgJHthZ2VudExhYmVsfSBgLFxuXHRcdFx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdFx0XHRcdHNvcnRUZXh0OiBgJHtjaGF0QWdlbnRMZWFkZXJ9JHthZ2VudC5uYW1lfWAsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6IHsgaWQ6IEFzc2lnblNlbGVjdGVkQWdlbnRBY3Rpb24uSUQsIHRpdGxlOiBBc3NpZ25TZWxlY3RlZEFnZW50QWN0aW9uLklELCBhcmd1bWVudHM6IFt7IGFnZW50LCB3aWRnZXQgfSBzYXRpc2ZpZXMgQXNzaWduU2VsZWN0ZWRBZ2VudEFjdGlvbkFyZ3NdIH0sXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnM6IGp1c3RBZ2VudHMuY29uY2F0KFxuXHRcdFx0XHRcdFx0Y29hbGVzY2UoYWdlbnRzRm9yU2xhc2hDb21tYW5kcy5mbGF0TWFwKGFnZW50ID0+IGFnZW50LnNsYXNoQ29tbWFuZHMubWFwKChjLCBpKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGlmIChhZ2VudC5pc0RlZmF1bHQgJiYgdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldERlZmF1bHRBZ2VudCh3aWRnZXQubG9jYXRpb24sIHdpZGdldC5pbnB1dC5jdXJyZW50TW9kZUtpbmQpPy5pZCAhPT0gYWdlbnQuaWQpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRjb25zdCB7IGxhYmVsOiBhZ2VudExhYmVsLCBpc0R1cGUgfSA9IHRoaXMuZ2V0QWdlbnRDb21wbGV0aW9uRGV0YWlscyhhZ2VudCk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gYCR7YWdlbnRMYWJlbH0gJHtjaGF0U3ViY29tbWFuZExlYWRlcn0ke2MubmFtZX1gO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBpdGVtOiBDb21wbGV0aW9uSXRlbSA9IHtcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogaXNEdXBlID9cblx0XHRcdFx0XHRcdFx0XHRcdHsgbGFiZWwsIGRlc2NyaXB0aW9uOiBjLmRlc2NyaXB0aW9uLCBkZXRhaWw6IGlzRHVwZSA/IGAgKCR7YWdlbnQucHVibGlzaGVyRGlzcGxheU5hbWV9KWAgOiB1bmRlZmluZWQgfSA6XG5cdFx0XHRcdFx0XHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0XHRcdFx0XHRkb2N1bWVudGF0aW9uOiBjLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdFx0XHRcdGZpbHRlclRleHQ6IGdldEZpbHRlclRleHQoYWdlbnQsIGMubmFtZSksXG5cdFx0XHRcdFx0XHRcdFx0Y29tbWl0Q2hhcmFjdGVyczogWycgJ10sXG5cdFx0XHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogbGFiZWwgKyAnICcsXG5cdFx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsIC8vIFRoZSBpY29ucyBhcmUgZGlzYWJsZWQgaGVyZSBhbnl3YXlcblx0XHRcdFx0XHRcdFx0XHRzb3J0VGV4dDogYHgke2NoYXRBZ2VudExlYWRlcn0ke2FnZW50Lm5hbWV9JHtjLm5hbWV9YCxcblx0XHRcdFx0XHRcdFx0XHRjb21tYW5kOiB7IGlkOiBBc3NpZ25TZWxlY3RlZEFnZW50QWN0aW9uLklELCB0aXRsZTogQXNzaWduU2VsZWN0ZWRBZ2VudEFjdGlvbi5JRCwgYXJndW1lbnRzOiBbeyBhZ2VudCwgd2lkZ2V0IH0gc2F0aXNmaWVzIEFzc2lnblNlbGVjdGVkQWdlbnRBY3Rpb25BcmdzXSB9LFxuXHRcdFx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0XHRcdGlmIChhZ2VudC5pc0RlZmF1bHQpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBkZWZhdWx0IGFnZW50IGlzbid0IG1lbnRpb25lZCBub3IgaW5zZXJ0ZWRcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IGAke2NoYXRTdWJjb21tYW5kTGVhZGVyfSR7Yy5uYW1lfWA7XG5cdFx0XHRcdFx0XHRcdFx0aXRlbS5sYWJlbCA9IGxhYmVsO1xuXHRcdFx0XHRcdFx0XHRcdGl0ZW0uaW5zZXJ0VGV4dCA9IGAke2xhYmVsfSBgO1xuXHRcdFx0XHRcdFx0XHRcdGl0ZW0uZG9jdW1lbnRhdGlvbiA9IGMuZGVzY3JpcHRpb247XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gaXRlbTtcblx0XHRcdFx0XHRcdH0pKSkpXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlQ2hhdElucHV0LCBoYXNBY2Nlc3NUb0FsbE1vZGVsczogdHJ1ZSB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ2NoYXRBZ2VudEFuZFN1YmNvbW1hbmQnLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFtjaGF0U3ViY29tbWFuZExlYWRlcl0sXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zOiBhc3luYyAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgX2NvbnRleHQ6IENvbXBsZXRpb25Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IHtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeUlucHV0VXJpKG1vZGVsLnVyaSk7XG5cdFx0XHRcdGNvbnN0IHZpZXdNb2RlbCA9IHdpZGdldD8udmlld01vZGVsO1xuXHRcdFx0XHRpZiAoIXdpZGdldCB8fCAhdmlld01vZGVsKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGlzQWdlbnRIb3N0QmFja2VkV2lkZ2V0KHdpZGdldCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAod2lkZ2V0LmxvY2tlZEFnZW50SWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gY29tcHV0ZUNvbXBsZXRpb25SYW5nZXMobW9kZWwsIHBvc2l0aW9uLCBBZ2VudE9yU2xhc2hDb21tYW5kV29yZCk7XG5cdFx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghaXNFbXB0eVVwVG9Db21wbGV0aW9uV29yZChtb2RlbCwgcmFuZ2UpKSB7XG5cdFx0XHRcdFx0Ly8gTm8gdGV4dCBhbGxvd2VkIGJlZm9yZSB0aGUgY29tcGxldGlvblxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGFnZW50cyA9IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXRBZ2VudHMoKVxuXHRcdFx0XHRcdC5maWx0ZXIoYSA9PiBhLmxvY2F0aW9ucy5pbmNsdWRlcyh3aWRnZXQubG9jYXRpb24pICYmIGEubW9kZXMuaW5jbHVkZXMod2lkZ2V0LmlucHV0LmN1cnJlbnRNb2RlS2luZCkpXG5cdFx0XHRcdFx0Ly8gRmlsdGVyIG91dCBjaGF0U2Vzc2lvbnMgY29udHJpYnV0aW9ucyBmb3Igc2xhc2ggY29tbWFuZCBjb21wbGV0aW9uc1xuXHRcdFx0XHRcdC5maWx0ZXIoYSA9PiAhdGhpcy5jaGF0U2Vzc2lvbnNTZXJ2aWNlLmdldENoYXRTZXNzaW9uQ29udHJpYnV0aW9uKGEuaWQpKTtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN1Z2dlc3Rpb25zOiBjb2FsZXNjZShhZ2VudHMuZmxhdE1hcChhZ2VudCA9PiBhZ2VudC5zbGFzaENvbW1hbmRzLm1hcCgoYywgaSkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGFnZW50LmlzRGVmYXVsdCAmJiB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0RGVmYXVsdEFnZW50KHdpZGdldC5sb2NhdGlvbiwgd2lkZ2V0LmlucHV0LmN1cnJlbnRNb2RlS2luZCk/LmlkICE9PSBhZ2VudC5pZCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGNvbnN0IHsgbGFiZWw6IGFnZW50TGFiZWwsIGlzRHVwZSB9ID0gdGhpcy5nZXRBZ2VudENvbXBsZXRpb25EZXRhaWxzKGFnZW50KTtcblx0XHRcdFx0XHRcdGNvbnN0IHdpdGhTbGFzaCA9IGAke2NoYXRTdWJjb21tYW5kTGVhZGVyfSR7Yy5uYW1lfWA7XG5cdFx0XHRcdFx0XHRjb25zdCBleHRyYVNvcnRUZXh0ID0gYWdlbnQuaWQgPT09ICdnaXRodWIuY29waWxvdC50ZXJtaW5hbFBhbmVsJyA/IGB6YCA6IGBgO1xuXHRcdFx0XHRcdFx0Y29uc3Qgc29ydFRleHQgPSBgJHtjaGF0U3ViY29tbWFuZExlYWRlcn0ke2V4dHJhU29ydFRleHR9JHthZ2VudC5uYW1lfSR7Yy5uYW1lfWA7XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiBDb21wbGV0aW9uSXRlbSA9IHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IHdpdGhTbGFzaCwgZGVzY3JpcHRpb246IGFnZW50TGFiZWwsIGRldGFpbDogaXNEdXBlID8gYCAoJHthZ2VudC5wdWJsaXNoZXJEaXNwbGF5TmFtZX0pYCA6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdFx0XHRjb21taXRDaGFyYWN0ZXJzOiBbJyAnXSxcblx0XHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogYCR7YWdlbnRMYWJlbH0gJHt3aXRoU2xhc2h9IGAsXG5cdFx0XHRcdFx0XHRcdGRvY3VtZW50YXRpb246IGAoJHthZ2VudExhYmVsfSkgJHtjLmRlc2NyaXB0aW9uID8/ICcnfWAsXG5cdFx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCwgLy8gVGhlIGljb25zIGFyZSBkaXNhYmxlZCBoZXJlIGFueXdheVxuXHRcdFx0XHRcdFx0XHRzb3J0VGV4dCxcblx0XHRcdFx0XHRcdFx0Y29tbWFuZDogeyBpZDogQXNzaWduU2VsZWN0ZWRBZ2VudEFjdGlvbi5JRCwgdGl0bGU6IEFzc2lnblNlbGVjdGVkQWdlbnRBY3Rpb24uSUQsIGFyZ3VtZW50czogW3sgYWdlbnQsIHdpZGdldCB9IHNhdGlzZmllcyBBc3NpZ25TZWxlY3RlZEFnZW50QWN0aW9uQXJnc10gfSxcblx0XHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRcdGlmIChhZ2VudC5pc0RlZmF1bHQpIHtcblx0XHRcdFx0XHRcdFx0Ly8gZGVmYXVsdCBhZ2VudCBpc24ndCBtZW50aW9uZWQgbm9yIGluc2VydGVkXG5cdFx0XHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gYCR7Y2hhdFN1YmNvbW1hbmRMZWFkZXJ9JHtjLm5hbWV9YDtcblx0XHRcdFx0XHRcdFx0aXRlbS5sYWJlbCA9IGxhYmVsO1xuXHRcdFx0XHRcdFx0XHRpdGVtLmluc2VydFRleHQgPSBgJHtsYWJlbH0gYDtcblx0XHRcdFx0XHRcdFx0aXRlbS5kb2N1bWVudGF0aW9uID0gYy5kZXNjcmlwdGlvbjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0cmV0dXJuIGl0ZW07XG5cdFx0XHRcdFx0fSkpKVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29tcGxldGlvblByb3ZpZGVyLnJlZ2lzdGVyKHsgc2NoZW1lOiBTY2hlbWFzLnZzY29kZUNoYXRJbnB1dCwgaGFzQWNjZXNzVG9BbGxNb2RlbHM6IHRydWUgfSwge1xuXHRcdFx0X2RlYnVnRGlzcGxheU5hbWU6ICdpbnN0YWxsQ2hhdEV4dGVuc2lvbnMnLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFtjaGF0QWdlbnRMZWFkZXJdLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtczogYXN5bmMgKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogUG9zaXRpb24sIF9jb250ZXh0OiBDb21wbGV0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdGlmICghbW9kZWwuZ2V0TGluZUNvbnRlbnQoMSkuc3RhcnRzV2l0aChjaGF0QWdlbnRMZWFkZXIpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5nZXRXaWRnZXRCeUlucHV0VXJpKG1vZGVsLnVyaSk7XG5cdFx0XHRcdGlmICh3aWRnZXQ/LmxvY2F0aW9uICE9PSBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0IHx8IHdpZGdldC5pbnB1dC5jdXJyZW50TW9kZUtpbmQgIT09IENoYXRNb2RlS2luZC5Bc2spIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXNBZ2VudEhvc3RCYWNrZWRXaWRnZXQod2lkZ2V0KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh3aWRnZXQubG9ja2VkQWdlbnRJZCkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgcG9zaXRpb24sIEFnZW50T3JTbGFzaENvbW1hbmRXb3JkKTtcblx0XHRcdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghaXNFbXB0eVVwVG9Db21wbGV0aW9uV29yZChtb2RlbCwgcmFuZ2UpKSB7XG5cdFx0XHRcdFx0Ly8gTm8gdGV4dCBhbGxvd2VkIGJlZm9yZSB0aGUgY29tcGxldGlvblxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGxhYmVsID0gbG9jYWxpemUoJ2luc3RhbGxMYWJlbCcsIFwiSW5zdGFsbCBDaGF0IEV4dGVuc2lvbnMuLi5cIik7XG5cdFx0XHRcdGNvbnN0IGl0ZW06IENvbXBsZXRpb25JdGVtID0ge1xuXHRcdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRcdGluc2VydFRleHQ6ICcnLFxuXHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5UZXh0LCAvLyBUaGUgaWNvbnMgYXJlIGRpc2FibGVkIGhlcmUgYW55d2F5XG5cdFx0XHRcdFx0Y29tbWFuZDogeyBpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLnNlYXJjaCcsIHRpdGxlOiAnJywgYXJndW1lbnRzOiBbJ0B0YWc6Y2hhdC1wYXJ0aWNpcGFudCddIH0sXG5cdFx0XHRcdFx0ZmlsdGVyVGV4dDogY2hhdEFnZW50TGVhZGVyICsgbGFiZWwsXG5cdFx0XHRcdFx0c29ydFRleHQ6ICd6enonXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzdWdnZXN0aW9uczogW2l0ZW1dXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDdXJyZW50QWdlbnRGb3JXaWRnZXQod2lkZ2V0OiBJQ2hhdFdpZGdldCk6IHsgYWdlbnQ6IElDaGF0QWdlbnREYXRhOyBjb21tYW5kPzogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRcdGlmICh3aWRnZXQubG9ja2VkQWdlbnRJZCkge1xuXHRcdFx0Y29uc3QgdXNlZEFnZW50ID0gdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmdldEFnZW50KHdpZGdldC5sb2NrZWRBZ2VudElkKTtcblx0XHRcdHJldHVybiB1c2VkQWdlbnQgJiYgeyBhZ2VudDogdXNlZEFnZW50IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFyc2VkUmVxdWVzdCA9IHdpZGdldC5wYXJzZWRJbnB1dC5wYXJ0cztcblx0XHRjb25zdCB1c2VkQWdlbnRJZHggPSBwYXJzZWRSZXF1ZXN0LmZpbmRJbmRleCgocCk6IHAgaXMgQ2hhdFJlcXVlc3RBZ2VudFBhcnQgPT4gcCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0QWdlbnRQYXJ0KTtcblx0XHRpZiAodXNlZEFnZW50SWR4IDwgMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVzZWRBZ2VudCA9IHBhcnNlZFJlcXVlc3RbdXNlZEFnZW50SWR4XSBhcyBDaGF0UmVxdWVzdEFnZW50UGFydDtcblxuXHRcdGNvbnN0IHVzZWRPdGhlckNvbW1hbmQgPSBwYXJzZWRSZXF1ZXN0LmZpbmQocCA9PiBwIGluc3RhbmNlb2YgQ2hhdFJlcXVlc3RBZ2VudFN1YmNvbW1hbmRQYXJ0IHx8IHAgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFNsYXNoUHJvbXB0UGFydCk7XG5cdFx0aWYgKHVzZWRPdGhlckNvbW1hbmQpIHtcblx0XHRcdC8vIE9ubHkgb25lIGFsbG93ZWRcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGFnZW50OiB1c2VkQWdlbnQuYWdlbnQsXG5cdFx0XHRcdGNvbW1hbmQ6IHVzZWRPdGhlckNvbW1hbmQgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdEFnZW50U3ViY29tbWFuZFBhcnQgPyB1c2VkT3RoZXJDb21tYW5kLmNvbW1hbmQubmFtZSA6IHVuZGVmaW5lZFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IHBhcnRBZnRlckFnZW50IG9mIHBhcnNlZFJlcXVlc3Quc2xpY2UodXNlZEFnZW50SWR4ICsgMSkpIHtcblx0XHRcdC8vIENvdWxkIGFsbG93IHRleHQgYWZ0ZXIgJ3Bvc2l0aW9uJ1xuXHRcdFx0aWYgKCEocGFydEFmdGVyQWdlbnQgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFRleHRQYXJ0KSB8fCAhcGFydEFmdGVyQWdlbnQudGV4dC50cmltKCkubWF0Y2goL14oXFwvW1xccHtMfTAtOV8uOi1dKik/JC91KSkge1xuXHRcdFx0XHQvLyBObyB0ZXh0IGFsbG93ZWQgYmV0d2VlbiBhZ2VudCBhbmQgc3ViY29tbWFuZFxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgYWdlbnQ6IHVzZWRBZ2VudC5hZ2VudCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBZ2VudENvbXBsZXRpb25EZXRhaWxzKGFnZW50OiBJQ2hhdEFnZW50RGF0YSk6IHsgbGFiZWw6IHN0cmluZzsgaXNEdXBlOiBib29sZWFuIH0ge1xuXHRcdGNvbnN0IGlzQWxsb3dlZCA9IHRoaXMuY2hhdEFnZW50TmFtZVNlcnZpY2UuZ2V0QWdlbnROYW1lUmVzdHJpY3Rpb24oYWdlbnQpO1xuXHRcdGNvbnN0IGFnZW50TGFiZWwgPSBgJHtjaGF0QWdlbnRMZWFkZXJ9JHtpc0FsbG93ZWQgPyBhZ2VudC5uYW1lIDogZ2V0RnVsbHlRdWFsaWZpZWRJZChhZ2VudCl9YDtcblx0XHRjb25zdCBpc0R1cGUgPSBpc0FsbG93ZWQgJiYgdGhpcy5jaGF0QWdlbnRTZXJ2aWNlLmFnZW50SGFzRHVwZU5hbWUoYWdlbnQuaWQpO1xuXHRcdHJldHVybiB7IGxhYmVsOiBhZ2VudExhYmVsLCBpc0R1cGUgfTtcblx0fVxufVxuUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpLnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKEFnZW50Q29tcGxldGlvbnMsIExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpO1xuXG5pbnRlcmZhY2UgQXNzaWduU2VsZWN0ZWRBZ2VudEFjdGlvbkFyZ3Mge1xuXHRhZ2VudDogSUNoYXRBZ2VudERhdGE7XG5cdHdpZGdldDogSUNoYXRXaWRnZXQ7XG59XG5cbmNsYXNzIEFzc2lnblNlbGVjdGVkQWdlbnRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5hc3NpZ25TZWxlY3RlZEFnZW50JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogQXNzaWduU2VsZWN0ZWRBZ2VudEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiAnJyAvLyBub3QgZGlzcGxheWVkXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGNvbnN0IGFyZyA9IGFyZ3NbMF0gYXMgQXNzaWduU2VsZWN0ZWRBZ2VudEFjdGlvbkFyZ3MgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCFhcmcgfHwgIWFyZy53aWRnZXQgfHwgIWFyZy5hZ2VudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghYXJnLmFnZW50Lm1vZGVzLmluY2x1ZGVzKGFyZy53aWRnZXQuaW5wdXQuY3VycmVudE1vZGVLaW5kKSkge1xuXHRcdFx0YXJnLndpZGdldC5pbnB1dC5zZXRDaGF0TW9kZShhcmcuYWdlbnQubW9kZXNbMF0pO1xuXHRcdH1cblxuXHRcdGFyZy53aWRnZXQubGFzdFNlbGVjdGVkQWdlbnQgPSBhcmcuYWdlbnQ7XG5cdH1cbn1cbnJlZ2lzdGVyQWN0aW9uMihBc3NpZ25TZWxlY3RlZEFnZW50QWN0aW9uKTtcblxuY2xhc3MgU3RhcnRQYXJhbWV0ZXJpemVkUHJvbXB0QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc3RhcnRQYXJhbWV0ZXJpemVkUHJvbXB0JztcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogU3RhcnRQYXJhbWV0ZXJpemVkUHJvbXB0QWN0aW9uLklELFxuXHRcdFx0dGl0bGU6ICcnIC8vIG5vdCBkaXNwbGF5ZWRcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgbW9kZWw6IElUZXh0TW9kZWwsIHNlcnZlcjogSU1jcFNlcnZlciwgcHJvbXB0OiBJTWNwUHJvbXB0LCB0ZXh0VG9SZXBsYWNlOiBzdHJpbmcpIHtcblx0XHRpZiAoIW1vZGVsIHx8ICFwcm9tcHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IGFjY2Vzc29yLmdldChJRmlsZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgY2hhdFdpZGdldCA9IGF3YWl0IHdpZGdldFNlcnZpY2UucmV2ZWFsV2lkZ2V0KHRydWUpO1xuXHRcdGlmICghY2hhdFdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhc3RQb3NpdGlvbiA9IG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCkuY29sbGFwc2VUb0VuZCgpO1xuXHRcdGNvbnN0IGdldFByb21wdEluZGV4ID0gKCkgPT4gbW9kZWwuZmluZE1hdGNoZXModGV4dFRvUmVwbGFjZSwgdHJ1ZSwgZmFsc2UsIHRydWUsIG51bGwsIGZhbHNlKVswXTtcblx0XHRjb25zdCByZXBsYWNlVGV4dFdpdGggPSAodmFsdWU6IHN0cmluZykgPT4gbW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0cmFuZ2U6IGdldFByb21wdEluZGV4KCk/LnJhbmdlIHx8IGxhc3RQb3NpdGlvbixcblx0XHRcdHRleHQ6IHZhbHVlLFxuXHRcdH1dKTtcblxuXHRcdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGN0cyA9IHN0b3JlLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0c3RvcmUuYWRkKGNoYXRXaWRnZXQuaW5wdXQuc3RhcnRHZW5lcmF0aW5nKCkpO1xuXG5cdFx0c3RvcmUuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB7XG5cdFx0XHRpZiAoZ2V0UHJvbXB0SW5kZXgoKSkge1xuXHRcdFx0XHRjdHMuY2FuY2VsKCk7IC8vIGNhbmNlbCBpZiB0aGUgdXNlciBkZWxldGVzIHRoZWlyIHByb21wdFxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdG1vZGVsLmNoYW5nZURlY29yYXRpb25zKGFjY2Vzc29yID0+IHtcblx0XHRcdGNvbnN0IGlkID0gYWNjZXNzb3IuYWRkRGVjb3JhdGlvbihsYXN0UG9zaXRpb24sIHtcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdtY3AtcHJvbXB0LXNwaW5uZXInLFxuXHRcdFx0XHRzaG93SWZDb2xsYXBzZWQ6IHRydWUsXG5cdFx0XHRcdGFmdGVyOiB7XG5cdFx0XHRcdFx0Y29udGVudDogJyAnLFxuXHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZUFmZmVjdHNMZXR0ZXJTcGFjaW5nOiB0cnVlLFxuXHRcdFx0XHRcdGlubGluZUNsYXNzTmFtZTogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKFRoZW1lSWNvbi5tb2RpZnkoQ29kaWNvbi5sb2FkaW5nLCAnc3BpbicpKSArICcgY2hhdC1wcm9tcHQtc3Bpbm5lcicsXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdG1vZGVsLmNoYW5nZURlY29yYXRpb25zKGEgPT4gYS5yZW1vdmVEZWNvcmF0aW9uKGlkKSk7XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBwaWNrID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1jcFByb21wdEFyZ3VtZW50UGljaywgcHJvbXB0KSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Ly8gc3RhcnQgdGhlIHNlcnZlciBpZiBub3QgYWxyZWFkeSBydW5uaW5nIHNvIHRoYXQgaXQncyByZWFkeSB0byByZXNvbHZlXG5cdFx0XHQvLyB0aGUgcHJvbXB0IGluc3RhbnRseSB3aGVuIHRoZSB1c2VyIGZpbmlzaGVzIHBpY2tpbmcgYXJndW1lbnRzLlxuXHRcdFx0YXdhaXQgc2VydmVyLnN0YXJ0KCk7XG5cblx0XHRcdGNvbnN0IGFyZ3MgPSBhd2FpdCBwaWNrLmNyZWF0ZUFyZ3MoKTtcblx0XHRcdGlmICghYXJncykge1xuXHRcdFx0XHRyZXBsYWNlVGV4dFdpdGgoJycpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGxldCBtZXNzYWdlczogSU1jcFByb21wdE1lc3NhZ2VbXTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdG1lc3NhZ2VzID0gYXdhaXQgcHJvbXB0LnJlc29sdmUoYXJncywgY3RzLnRva2VuKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0aWYgKCFjdHMudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdtY3AucHJvbXB0LmVycm9yJywgXCJFcnJvciByZXNvbHZpbmcgcHJvbXB0OiB7MH1cIiwgU3RyaW5nKGUpKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVwbGFjZVRleHRXaXRoKCcnKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB0b0F0dGFjaDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW107XG5cdFx0XHRjb25zdCBhdHRhY2hCbG9iID0gYXN5bmMgKG1pbWVUeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNvbnRlbnRzOiBzdHJpbmcsIHVyaVN0cj86IHN0cmluZywgaXNUZXh0ID0gZmFsc2UpID0+IHtcblx0XHRcdFx0bGV0IHZhbGlkVVJJOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICh1cmlTdHIpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHVyaSBvZiBbVVJJLnBhcnNlKHVyaVN0ciksIE1jcFJlc291cmNlVVJJLmZyb21TZXJ2ZXIoc2VydmVyLmRlZmluaXRpb24sIHVyaVN0cildKSB7XG5cdFx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0XHR2YWxpZFVSSSB8fD0gYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKHVyaSkgPyB1cmkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdFx0Ly8gaWdub3JlZFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc1RleHQpIHtcblx0XHRcdFx0XHRpZiAodmFsaWRVUkkpIHtcblx0XHRcdFx0XHRcdHRvQXR0YWNoLnB1c2goe1xuXHRcdFx0XHRcdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRcdFx0XHRcdGtpbmQ6ICdmaWxlJyxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IHZhbGlkVVJJLFxuXHRcdFx0XHRcdFx0XHRuYW1lOiBiYXNlbmFtZSh2YWxpZFVSSSksXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dG9BdHRhY2gucHVzaCh7XG5cdFx0XHRcdFx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZTogY29udGVudHMsXG5cdFx0XHRcdFx0XHRcdG5hbWU6IGxvY2FsaXplKCdtY3AucHJvbXB0LnJlc291cmNlJywgJ1Byb21wdCBSZXNvdXJjZScpLFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKG1pbWVUeXBlICYmIGdldEF0dGFjaGFibGVJbWFnZUV4dGVuc2lvbihtaW1lVHlwZSkpIHtcblx0XHRcdFx0XHRjb25zdCByZXNpemVkID0gYXdhaXQgcmVzaXplSW1hZ2UoY29udGVudHMpXG5cdFx0XHRcdFx0XHQuY2F0Y2goKCkgPT4gZGVjb2RlQmFzZTY0KGNvbnRlbnRzKS5idWZmZXIpO1xuXHRcdFx0XHRcdGNoYXRXaWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQoe1xuXHRcdFx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRcdFx0bmFtZTogbG9jYWxpemUoJ21jcC5wcm9tcHQuaW1hZ2UnLCAnUHJvbXB0IEltYWdlJyksXG5cdFx0XHRcdFx0XHRmdWxsTmFtZTogbG9jYWxpemUoJ21jcC5wcm9tcHQuaW1hZ2UnLCAnUHJvbXB0IEltYWdlJyksXG5cdFx0XHRcdFx0XHR2YWx1ZTogcmVzaXplZCxcblx0XHRcdFx0XHRcdGtpbmQ6ICdpbWFnZScsXG5cdFx0XHRcdFx0XHRyZWZlcmVuY2VzOiB2YWxpZFVSSSAmJiBbeyByZWZlcmVuY2U6IHZhbGlkVVJJLCBraW5kOiAncmVmZXJlbmNlJyB9XSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIGlmICh2YWxpZFVSSSkge1xuXHRcdFx0XHRcdHRvQXR0YWNoLnB1c2goe1xuXHRcdFx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRcdFx0a2luZDogJ2ZpbGUnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHZhbGlkVVJJLFxuXHRcdFx0XHRcdFx0bmFtZTogYmFzZW5hbWUodmFsaWRVUkkpLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIG5vdCBhIHZhbGlkIHJlc291cmNlL3Jlc291cmNlIFVSSVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBoYXNNdWx0aXBsZVJvbGVzID0gbWVzc2FnZXMuc29tZShtID0+IG0ucm9sZSAhPT0gbWVzc2FnZXNbMF0ucm9sZSk7XG5cdFx0XHRsZXQgaW5wdXQgPSAnJztcblx0XHRcdGZvciAoY29uc3QgbWVzc2FnZSBvZiBtZXNzYWdlcykge1xuXHRcdFx0XHRzd2l0Y2ggKG1lc3NhZ2UuY29udGVudC50eXBlKSB7XG5cdFx0XHRcdFx0Y2FzZSAndGV4dCc6XG5cdFx0XHRcdFx0XHRpZiAoaW5wdXQpIHtcblx0XHRcdFx0XHRcdFx0aW5wdXQgKz0gJ1xcblxcbic7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoaGFzTXVsdGlwbGVSb2xlcykge1xuXHRcdFx0XHRcdFx0XHRpbnB1dCArPSBgLS0ke21lc3NhZ2Uucm9sZS50b1VwcGVyQ2FzZSgpfVxcbmA7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGlucHV0ICs9IG1lc3NhZ2UuY29udGVudC50ZXh0O1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0Y2FzZSAncmVzb3VyY2UnOlxuXHRcdFx0XHRcdFx0aWYgKCd0ZXh0JyBpbiBtZXNzYWdlLmNvbnRlbnQucmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgYXR0YWNoQmxvYihtZXNzYWdlLmNvbnRlbnQucmVzb3VyY2UubWltZVR5cGUsIG1lc3NhZ2UuY29udGVudC5yZXNvdXJjZS50ZXh0LCBtZXNzYWdlLmNvbnRlbnQucmVzb3VyY2UudXJpLCB0cnVlKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IGF0dGFjaEJsb2IobWVzc2FnZS5jb250ZW50LnJlc291cmNlLm1pbWVUeXBlLCBtZXNzYWdlLmNvbnRlbnQucmVzb3VyY2UuYmxvYiwgbWVzc2FnZS5jb250ZW50LnJlc291cmNlLnVyaSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdpbWFnZSc6XG5cdFx0XHRcdFx0Y2FzZSAnYXVkaW8nOlxuXHRcdFx0XHRcdFx0YXdhaXQgYXR0YWNoQmxvYihtZXNzYWdlLmNvbnRlbnQubWltZVR5cGUsIG1lc3NhZ2UuY29udGVudC5kYXRhKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0b0F0dGFjaC5sZW5ndGgpIHtcblx0XHRcdFx0Y2hhdFdpZGdldC5hdHRhY2htZW50TW9kZWwuYWRkQ29udGV4dCguLi50b0F0dGFjaCk7XG5cdFx0XHR9XG5cdFx0XHRyZXBsYWNlVGV4dFdpdGgoaW5wdXQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRzdG9yZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5yZWdpc3RlckFjdGlvbjIoU3RhcnRQYXJhbWV0ZXJpemVkUHJvbXB0QWN0aW9uKTtcblxuXG5jbGFzcyBSZWZlcmVuY2VBcmd1bWVudCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHdpZGdldDogSUNoYXRXaWRnZXQsXG5cdFx0cmVhZG9ubHkgdmFyaWFibGU6IElEeW5hbWljVmFyaWFibGVcblx0KSB7IH1cbn1cblxuaW50ZXJmYWNlIElWYXJpYWJsZUNvbXBsZXRpb25zRGV0YWlscyB7XG5cdG1vZGVsOiBJVGV4dE1vZGVsO1xuXHRwb3NpdGlvbjogUG9zaXRpb247XG5cdGNvbnRleHQ6IENvbXBsZXRpb25Db250ZXh0O1xuXHR3aWRnZXQ6IElDaGF0V2lkZ2V0O1xuXHRyYW5nZTogSUNoYXRDb21wbGV0aW9uUmFuZ2VSZXN1bHQ7XG59XG5cbmNsYXNzIEJ1aWx0aW5EeW5hbWljQ29tcGxldGlvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgYWRkUmVmZXJlbmNlQ29tbWFuZCA9ICdfYWRkUmVmZXJlbmNlQ21kJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVmFyaWFibGVOYW1lRGVmID0gbmV3IFJlZ0V4cChgWyR7ZXNjYXBlRm9yQ2hhckNsYXNzKGNoYXRWYXJpYWJsZUxlYWRlcil9JHtlc2NhcGVGb3JDaGFyQ2xhc3MoY2hhdEFnZW50TGVhZGVyKX1dW1xcXFx3Oi1dKmAsICdnJyk7IC8vIE1VU1QgYmUgdXNpbmcgYGdgLWZsYWdcblxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSGlzdG9yeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBoaXN0b3J5U2VydmljZTogSUhpc3RvcnlTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJU2VhcmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlYXJjaFNlcnZpY2U6IElTZWFyY2hTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJT3V0bGluZU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG91dGxpbmVTZXJ2aWNlOiBJT3V0bGluZU1vZGVsU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvZGVFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASUNoYXRBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0QWdlbnRTZXJ2aWNlOiBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNoYXRTZXNzaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0U2Vzc2lvbnNTZXJ2aWNlOiBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJWYXJpYWJsZUNvbXBsZXRpb25zKCdhdHRhY2hlZENvbnRleHRzJywgKHsgd2lkZ2V0LCByYW5nZSB9KSA9PiB7XG5cdFx0XHRpZiAoIXdpZGdldC5zdXBwb3J0c0ZpbGVSZWZlcmVuY2VzKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdHlwZWRMZWFkZXIgPSByYW5nZS52YXJXb3JkPy53b3JkPy5jaGFyQXQoMCkgPT09IGNoYXRBZ2VudExlYWRlciA/IGNoYXRBZ2VudExlYWRlciA6IGNoYXRWYXJpYWJsZUxlYWRlcjtcblx0XHRcdGNvbnN0IHN1Z2dlc3Rpb25zID0gd2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hdHRhY2htZW50c1xuXHRcdFx0XHQuZmlsdGVyKGF0dGFjaG1lbnQgPT4gIWF0dGFjaG1lbnQucmFuZ2UpXG5cdFx0XHRcdC5tYXAoKGF0dGFjaG1lbnQpOiBDb21wbGV0aW9uSXRlbSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgdGV4dCA9IGAke3R5cGVkTGVhZGVyfWF0dGFjaG1lbnQ6JHthdHRhY2htZW50Lm5hbWV9YDtcblx0XHRcdFx0XHRjb25zdCByZWZlcmVuY2VSYW5nZSA9IHtcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogcmFuZ2UucmVwbGFjZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogcmFuZ2UucmVwbGFjZS5zdGFydENvbHVtbixcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHJhbmdlLnJlcGxhY2UuZW5kTGluZU51bWJlcixcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogcmFuZ2UucmVwbGFjZS5zdGFydENvbHVtbiArIHRleHQubGVuZ3RoXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IGF0dGFjaG1lbnQubmFtZSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCdhdHRhY2hlZENvbnRleHQnLCAnQXR0YWNoZWQgY29udGV4dCcpIH0sXG5cdFx0XHRcdFx0XHRmaWx0ZXJUZXh0OiBnZXRBdHRhY2hlZENvbnRleHRDb21wbGV0aW9uRmlsdGVyVGV4dCh0eXBlZExlYWRlciwgYXR0YWNobWVudC5uYW1lLCBhdHRhY2htZW50LmtpbmQpLFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogcmFuZ2UudmFyV29yZD8uZW5kQ29sdW1uID09PSByYW5nZS5yZXBsYWNlLmVuZENvbHVtbiA/IGAke3RleHR9IGAgOiB0ZXh0LFxuXHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRraW5kOiBhdHRhY2htZW50LmtpbmQgPT09ICdkaXJlY3RvcnknXG5cdFx0XHRcdFx0XHRcdD8gQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlclxuXHRcdFx0XHRcdFx0XHQ6IGF0dGFjaG1lbnQua2luZCA9PT0gJ2ZpbGUnIHx8IGF0dGFjaG1lbnQua2luZCA9PT0gJ2ltYWdlJ1xuXHRcdFx0XHRcdFx0XHRcdD8gQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGVcblx0XHRcdFx0XHRcdFx0XHQ6IENvbXBsZXRpb25JdGVtS2luZC5SZWZlcmVuY2UsXG5cdFx0XHRcdFx0XHRzb3J0VGV4dDogYXR0YWNoZWRDb250ZXh0Q29tcGxldGlvblNvcnRUZXh0LFxuXHRcdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0XHRpZDogQnVpbHRpbkR5bmFtaWNDb21wbGV0aW9ucy5hZGRSZWZlcmVuY2VDb21tYW5kLFxuXHRcdFx0XHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdFx0XHRcdGFyZ3VtZW50czogW25ldyBSZWZlcmVuY2VBcmd1bWVudCh3aWRnZXQsIHRvQXR0YWNoZWRDb250ZXh0RHluYW1pY1ZhcmlhYmxlKGF0dGFjaG1lbnQsIHJlZmVyZW5jZVJhbmdlKSldXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiB7IHN1Z2dlc3Rpb25zIH07XG5cdFx0fSwgQnVpbHRpbkR5bmFtaWNDb21wbGV0aW9ucy5WYXJpYWJsZU5hbWVEZWYsIHRydWUpO1xuXG5cdFx0Ly8gRmlsZS9Gb2xkZXIgY29tcGxldGlvbnMgaW4gb25lIGdvIGFuZCBtXG5cdFx0Y29uc3QgZmlsZVdvcmRQYXR0ZXJuID0gbmV3IFJlZ0V4cChgWyR7ZXNjYXBlRm9yQ2hhckNsYXNzKGNoYXRWYXJpYWJsZUxlYWRlcil9JHtlc2NhcGVGb3JDaGFyQ2xhc3MoY2hhdEFnZW50TGVhZGVyKX1dW15cXFxcc10qYCwgJ2cnKTtcblx0XHR0aGlzLnJlZ2lzdGVyVmFyaWFibGVDb21wbGV0aW9ucygnZmlsZUFuZEZvbGRlcicsIGFzeW5jICh7IHdpZGdldCwgcmFuZ2UgfSwgdG9rZW4pID0+IHtcblx0XHRcdGlmICghd2lkZ2V0LnN1cHBvcnRzRmlsZVJlZmVyZW5jZXMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQ6IENvbXBsZXRpb25MaXN0ID0geyBzdWdnZXN0aW9uczogW10gfTtcblxuXHRcdFx0Ly8gSWYgbG9ja2VkIHRvIGFuIGFnZW50IHRoYXQgZG9lc24ndCBzdXBwb3J0IGZpbGUgYXR0YWNobWVudHMsIHNraXBcblx0XHRcdGlmICh3aWRnZXQubG9ja2VkQWdlbnRJZCkge1xuXHRcdFx0XHRjb25zdCBhZ2VudCA9IHRoaXMuY2hhdEFnZW50U2VydmljZS5nZXRBZ2VudCh3aWRnZXQubG9ja2VkQWdlbnRJZCk7XG5cdFx0XHRcdGlmIChhZ2VudCAmJiAhYWdlbnQuY2FwYWJpbGl0aWVzPy5zdXBwb3J0c0ZpbGVBdHRhY2htZW50cykge1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuYWRkRmlsZUFuZEZvbGRlckVudHJpZXMod2lkZ2V0LCByZXN1bHQsIHJhbmdlLCB0b2tlbik7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXG5cdFx0fSwgZmlsZVdvcmRQYXR0ZXJuKTtcblxuXHRcdC8vIFNlbGVjdGlvbiBjb21wbGV0aW9uXG5cdFx0dGhpcy5yZWdpc3RlclZhcmlhYmxlQ29tcGxldGlvbnMoJ3NlbGVjdGlvbicsICh7IHdpZGdldCwgcmFuZ2UgfSwgdG9rZW4pID0+IHtcblx0XHRcdGlmICghd2lkZ2V0LnN1cHBvcnRzRmlsZVJlZmVyZW5jZXMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAod2lkZ2V0LmxvY2F0aW9uID09PSBDaGF0QWdlbnRMb2NhdGlvbi5FZGl0b3JJbmxpbmUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhY3RpdmUgPSB0aGlzLmZpbmRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0XHRpZiAoIWlzQ29kZUVkaXRvcihhY3RpdmUpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY3VycmVudFJlc291cmNlID0gYWN0aXZlLmdldE1vZGVsKCk/LnVyaTtcblx0XHRcdGNvbnN0IGN1cnJlbnRTZWxlY3Rpb24gPSBhY3RpdmUuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRpZiAoIWN1cnJlbnRTZWxlY3Rpb24gfHwgIWN1cnJlbnRSZXNvdXJjZSB8fCBjdXJyZW50U2VsZWN0aW9uLmlzRW1wdHkoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHR5cGVkTGVhZGVyID0gcmFuZ2UudmFyV29yZD8ud29yZD8uY2hhckF0KDApID09PSBjaGF0QWdlbnRMZWFkZXIgPyBjaGF0QWdlbnRMZWFkZXIgOiBjaGF0VmFyaWFibGVMZWFkZXI7XG5cdFx0XHRjb25zdCBiYXNlbmFtZSA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUJhc2VuYW1lTGFiZWwoY3VycmVudFJlc291cmNlKTtcblx0XHRcdGNvbnN0IHRleHQgPSBgJHt0eXBlZExlYWRlcn1maWxlOiR7YmFzZW5hbWV9OiR7Y3VycmVudFNlbGVjdGlvbi5zdGFydExpbmVOdW1iZXJ9LSR7Y3VycmVudFNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyfWA7XG5cdFx0XHRjb25zdCBmdWxsUmFuZ2VUZXh0ID0gYDoke2N1cnJlbnRTZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyfToke2N1cnJlbnRTZWxlY3Rpb24uc3RhcnRDb2x1bW59LSR7Y3VycmVudFNlbGVjdGlvbi5lbmRMaW5lTnVtYmVyfToke2N1cnJlbnRTZWxlY3Rpb24uZW5kQ29sdW1ufWA7XG5cdFx0XHRjb25zdCBkZXNjcmlwdGlvbiA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGN1cnJlbnRSZXNvdXJjZSwgeyByZWxhdGl2ZTogdHJ1ZSB9KSArIGZ1bGxSYW5nZVRleHQ7XG5cblx0XHRcdGNvbnN0IHJlc3VsdDogQ29tcGxldGlvbkxpc3QgPSB7IHN1Z2dlc3Rpb25zOiBbXSB9O1xuXHRcdFx0cmVzdWx0LnN1Z2dlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogeyBsYWJlbDogYCR7dHlwZWRMZWFkZXJ9c2VsZWN0aW9uYCwgZGVzY3JpcHRpb24gfSxcblx0XHRcdFx0ZmlsdGVyVGV4dDogYCR7dHlwZWRMZWFkZXJ9c2VsZWN0aW9uYCxcblx0XHRcdFx0aW5zZXJ0VGV4dDogcmFuZ2UudmFyV29yZD8uZW5kQ29sdW1uID09PSByYW5nZS5yZXBsYWNlLmVuZENvbHVtbiA/IGAke3RleHR9IGAgOiB0ZXh0LFxuXHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdHNvcnRUZXh0OiAneicsXG5cdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRpZDogQnVpbHRpbkR5bmFtaWNDb21wbGV0aW9ucy5hZGRSZWZlcmVuY2VDb21tYW5kLCB0aXRsZTogJycsIGFyZ3VtZW50czogW25ldyBSZWZlcmVuY2VBcmd1bWVudCh3aWRnZXQsIHtcblx0XHRcdFx0XHRcdGlkOiAndnNjb2RlLnNlbGVjdGlvbicsXG5cdFx0XHRcdFx0XHRpc0ZpbGU6IHRydWUsXG5cdFx0XHRcdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IHJhbmdlLnJlcGxhY2Uuc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbjogcmFuZ2UucmVwbGFjZS5zdGFydENvbHVtbiwgZW5kTGluZU51bWJlcjogcmFuZ2UucmVwbGFjZS5lbmRMaW5lTnVtYmVyLCBlbmRDb2x1bW46IHJhbmdlLnJlcGxhY2Uuc3RhcnRDb2x1bW4gKyB0ZXh0Lmxlbmd0aCB9LFxuXHRcdFx0XHRcdFx0ZGF0YTogeyByYW5nZTogY3VycmVudFNlbGVjdGlvbiwgdXJpOiBjdXJyZW50UmVzb3VyY2UgfSBzYXRpc2ZpZXMgTG9jYXRpb25cblx0XHRcdFx0XHR9KV1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pO1xuXG5cdFx0Ly8gU3ltYm9sIGNvbXBsZXRpb25zXG5cdFx0dGhpcy5yZWdpc3RlclZhcmlhYmxlQ29tcGxldGlvbnMoJ3N5bWJvbCcsICh7IHdpZGdldCwgcmFuZ2UsIHBvc2l0aW9uLCBtb2RlbCB9LCB0b2tlbikgPT4ge1xuXHRcdFx0aWYgKCF3aWRnZXQuc3VwcG9ydHNGaWxlUmVmZXJlbmNlcykge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmVzdWx0OiBDb21wbGV0aW9uTGlzdCA9IHsgc3VnZ2VzdGlvbnM6IFtdIH07XG5cdFx0XHRjb25zdCByYW5nZTIgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgcG9zaXRpb24sIG5ldyBSZWdFeHAoYFske2VzY2FwZUZvckNoYXJDbGFzcyhjaGF0VmFyaWFibGVMZWFkZXIpfSR7ZXNjYXBlRm9yQ2hhckNsYXNzKGNoYXRBZ2VudExlYWRlcil9XVteXFxcXHNdKmAsICdnJyksIHRydWUpO1xuXHRcdFx0aWYgKHJhbmdlMikge1xuXHRcdFx0XHR0aGlzLmFkZFN5bWJvbEVudHJpZXMod2lkZ2V0LCByZXN1bHQsIHJhbmdlMiwgdG9rZW4pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pO1xuXG5cdFx0Ly8gU2Vzc2lvbiBSZWZlcmVuY2UgY29tcGxldGlvblxuXHRcdGNvbnN0IHNlc3Npb25Xb3JkUGF0dGVybiA9IG5ldyBSZWdFeHAoYCR7Y2hhdFZhcmlhYmxlTGVhZGVyfVteXFxcXHNdKmAsICdnJyk7XG5cdFx0dGhpcy5yZWdpc3RlclZhcmlhYmxlQ29tcGxldGlvbnMoJ3Nlc3Npb25SZWZlcmVuY2UnLCBhc3luYyAoeyB3aWRnZXQsIHJhbmdlIH0sIHRva2VuKSA9PiB7XG5cdFx0XHRpZiAod2lkZ2V0LmxvY2F0aW9uICE9PSBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdHlwZWRXb3JkID0gcmFuZ2UudmFyV29yZD8ud29yZCA/PyAnJztcblx0XHRcdGNvbnN0IHNlc3Npb25QcmVmaXggPSBgJHtjaGF0VmFyaWFibGVMZWFkZXJ9c2Vzc2lvbmA7XG5cdFx0XHRjb25zdCByZXN1bHQ6IENvbXBsZXRpb25MaXN0ID0geyBzdWdnZXN0aW9uczogW10gfTtcblxuXHRcdFx0aWYgKHR5cGVkV29yZC50b0xvd2VyQ2FzZSgpLnN0YXJ0c1dpdGgoYCR7c2Vzc2lvblByZWZpeH06YCkpIHtcblx0XHRcdFx0Ly8gVXNlciBoYXMgdHlwZWQgI3Nlc3Npb246IFx1MjAxNCBmZXRjaCBhbGwgc2Vzc2lvbnMgYW5kIHNob3cgdGhlbSBpbmxpbmVcblx0XHRcdFx0Y29uc3QgYWxsU2Vzc2lvbnM6IHsgdGl0bGU6IHN0cmluZzsgc2Vzc2lvblJlc291cmNlOiBVUkk7IGxhc3RNZXNzYWdlRGF0ZTogbnVtYmVyOyBpY29uOiBUaGVtZUljb24gfVtdID0gW107XG5cblx0XHRcdFx0Y29uc3Qgc2Vzc2lvblByb3ZpZGVyRmlsdGVyID0gW0FnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCwgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbGF1ZGUsIEFnZW50U2Vzc2lvblByb3ZpZGVycy5BZ2VudEhvc3RDb3BpbG90XTtcblx0XHRcdFx0Zm9yIGF3YWl0IChjb25zdCBncm91cCBvZiB0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UuZ2V0Q2hhdFNlc3Npb25JdGVtcyhzZXNzaW9uUHJvdmlkZXJGaWx0ZXIsIHRva2VuKSkge1xuXHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBwcm92aWRlckljb24gPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlckljb24oZ3JvdXAuY2hhdFNlc3Npb25UeXBlKTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgZ3JvdXAuaXRlbXMpIHtcblx0XHRcdFx0XHRcdGFsbFNlc3Npb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0XHR0aXRsZTogaXRlbS5sYWJlbCxcblx0XHRcdFx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBpdGVtLnJlc291cmNlLFxuXHRcdFx0XHRcdFx0XHRsYXN0TWVzc2FnZURhdGU6IGl0ZW0udGltaW5nLmxhc3RSZXF1ZXN0RW5kZWQgPz8gaXRlbS50aW1pbmcuY3JlYXRlZCxcblx0XHRcdFx0XHRcdFx0aWNvbjogaXRlbS5pY29uUGF0aCA/PyBwcm92aWRlckljb24sXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBjdXJyZW50U2Vzc2lvblJlc291cmNlID0gd2lkZ2V0LnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlO1xuXHRcdFx0XHRjb25zdCBmaWx0ZXJlZFNlc3Npb25zID0gYWxsU2Vzc2lvbnNcblx0XHRcdFx0XHQuZmlsdGVyKHMgPT4gIWN1cnJlbnRTZXNzaW9uUmVzb3VyY2UgfHwgcy5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSAhPT0gY3VycmVudFNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpKVxuXHRcdFx0XHRcdC5zb3J0KChhLCBiKSA9PiBiLmxhc3RNZXNzYWdlRGF0ZSAtIGEubGFzdE1lc3NhZ2VEYXRlKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgZmlsdGVyZWRTZXNzaW9ucykge1xuXHRcdFx0XHRcdGNvbnN0IHRleHQgPSBgJHtzZXNzaW9uUHJlZml4fToke3Nlc3Npb24udGl0bGV9YDtcblx0XHRcdFx0XHRjb25zdCBkYXRlU3RyID0gbmV3IERhdGUoc2Vzc2lvbi5sYXN0TWVzc2FnZURhdGUpLnRvTG9jYWxlU3RyaW5nKCk7XG5cdFx0XHRcdFx0cmVzdWx0LnN1Z2dlc3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IHNlc3Npb24udGl0bGUsIGRlc2NyaXB0aW9uOiBkYXRlU3RyIH0sXG5cdFx0XHRcdFx0XHRmaWx0ZXJUZXh0OiBgJHtzZXNzaW9uUHJlZml4fToke3Nlc3Npb24udGl0bGV9YCxcblx0XHRcdFx0XHRcdGluc2VydFRleHQ6IHJhbmdlLnZhcldvcmQ/LmVuZENvbHVtbiA9PT0gcmFuZ2UucmVwbGFjZS5lbmRDb2x1bW4gPyBgJHt0ZXh0fSBgIDogdGV4dCxcblx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0a2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlRleHQsXG5cdFx0XHRcdFx0XHRzb3J0VGV4dDogYHoke1N0cmluZyhOdW1iZXIuTUFYX1NBRkVfSU5URUdFUiAtIHNlc3Npb24ubGFzdE1lc3NhZ2VEYXRlKS5wYWRTdGFydCgyMCwgJzAnKX1gLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdFx0XHRpZDogQnVpbHRpbkR5bmFtaWNDb21wbGV0aW9ucy5hZGRSZWZlcmVuY2VDb21tYW5kLCB0aXRsZTogJycsIGFyZ3VtZW50czogW25ldyBSZWZlcmVuY2VBcmd1bWVudCh3aWRnZXQsIHtcblx0XHRcdFx0XHRcdFx0XHRpZDogc2Vzc2lvbi5zZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdFx0XHRpY29uOiBzZXNzaW9uLmljb24sXG5cdFx0XHRcdFx0XHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiByYW5nZS5yZXBsYWNlLnN0YXJ0TGluZU51bWJlciwgc3RhcnRDb2x1bW46IHJhbmdlLnJlcGxhY2Uuc3RhcnRDb2x1bW4sIGVuZExpbmVOdW1iZXI6IHJhbmdlLnJlcGxhY2UuZW5kTGluZU51bWJlciwgZW5kQ29sdW1uOiByYW5nZS5yZXBsYWNlLnN0YXJ0Q29sdW1uICsgdGV4dC5sZW5ndGggfSxcblx0XHRcdFx0XHRcdFx0XHRkYXRhOiBzZXNzaW9uLnNlc3Npb25SZXNvdXJjZVxuXHRcdFx0XHRcdFx0XHR9KV1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gVXNlciB0eXBlZCAjIG9yICNzIGV0YyBcdTIwMTQgc2hvdyBzaW5nbGUgI3Nlc3Npb24gZW50cnkgdGhhdCBpbnNlcnRzICNzZXNzaW9uOiBhbmQgcmUtdHJpZ2dlcnMgc3VnZ2VzdFxuXHRcdFx0XHRyZXN1bHQuc3VnZ2VzdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IHNlc3Npb25QcmVmaXgsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc2Vzc2lvbi5kZXNjcmlwdGlvbicsICdBdHRhY2ggYSBjaGF0IHNlc3Npb24nKSB9LFxuXHRcdFx0XHRcdGZpbHRlclRleHQ6IHNlc3Npb25QcmVmaXgsXG5cdFx0XHRcdFx0aW5zZXJ0VGV4dDogYCR7c2Vzc2lvblByZWZpeH06YCxcblx0XHRcdFx0XHRyYW5nZSxcblx0XHRcdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuVGV4dCxcblx0XHRcdFx0XHRzb3J0VGV4dDogJ3onLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IHsgaWQ6ICdlZGl0b3IuYWN0aW9uLnRyaWdnZXJTdWdnZXN0JywgdGl0bGU6ICcnIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9LCBzZXNzaW9uV29yZFBhdHRlcm4pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoQnVpbHRpbkR5bmFtaWNDb21wbGV0aW9ucy5hZGRSZWZlcmVuY2VDb21tYW5kLCAoX3NlcnZpY2VzLCBhcmcpID0+IHtcblx0XHRcdGFzc2VydFR5cGUoYXJnIGluc3RhbmNlb2YgUmVmZXJlbmNlQXJndW1lbnQpO1xuXHRcdFx0cmV0dXJuIHRoaXMuY21kQWRkUmVmZXJlbmNlKGFyZyk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5kQWN0aXZlQ29kZUVkaXRvcigpOiBJQ29kZUVkaXRvciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29kZUVkaXRvciA9IHRoaXMuY29kZUVkaXRvclNlcnZpY2UuZ2V0QWN0aXZlQ29kZUVkaXRvcigpO1xuXHRcdGlmIChjb2RlRWRpdG9yKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGNvZGVFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRcdGlmIChtb2RlbD8udXJpLnNjaGVtZSA9PT0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGwpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdHJldHVybiBjb2RlRWRpdG9yO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGNvZGVPckRpZmZFZGl0b3Igb2YgdGhpcy5lZGl0b3JTZXJ2aWNlLmdldFZpc2libGVUZXh0RWRpdG9yQ29udHJvbHMoRWRpdG9yc09yZGVyLk1PU1RfUkVDRU5UTFlfQUNUSVZFKSkge1xuXHRcdFx0Y29uc3QgY29kZUVkaXRvciA9IGdldENvZGVFZGl0b3IoY29kZU9yRGlmZkVkaXRvcik7XG5cdFx0XHRpZiAoIWNvZGVFZGl0b3IpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gY29kZUVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdHJldHVybiBjb2RlRWRpdG9yO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclZhcmlhYmxlQ29tcGxldGlvbnMoZGVidWdOYW1lOiBzdHJpbmcsIHByb3ZpZGVyOiAoZGV0YWlsczogSVZhcmlhYmxlQ29tcGxldGlvbnNEZXRhaWxzLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb3ZpZGVyUmVzdWx0PENvbXBsZXRpb25MaXN0Piwgd29yZFBhdHRlcm46IFJlZ0V4cCA9IEJ1aWx0aW5EeW5hbWljQ29tcGxldGlvbnMuVmFyaWFibGVOYW1lRGVmLCBpbmNsdWRlQWdlbnRIb3N0ID0gZmFsc2UpIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvbXBsZXRpb25Qcm92aWRlci5yZWdpc3Rlcih7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVDaGF0SW5wdXQsIGhhc0FjY2Vzc1RvQWxsTW9kZWxzOiB0cnVlIH0sIHtcblx0XHRcdF9kZWJ1Z0Rpc3BsYXlOYW1lOiBgY2hhdFZhckNvbXBsZXRpb25zLSR7ZGVidWdOYW1lfWAsXG5cdFx0XHR0cmlnZ2VyQ2hhcmFjdGVyczogW2NoYXRWYXJpYWJsZUxlYWRlciwgY2hhdEFnZW50TGVhZGVyXSxcblx0XHRcdHByb3ZpZGVDb21wbGV0aW9uSXRlbXM6IGFzeW5jIChtb2RlbDogSVRleHRNb2RlbCwgcG9zaXRpb246IFBvc2l0aW9uLCBjb250ZXh0OiBDb21wbGV0aW9uQ29udGV4dCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlJbnB1dFVyaShtb2RlbC51cmkpO1xuXHRcdFx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghaW5jbHVkZUFnZW50SG9zdCAmJiBpc0FnZW50SG9zdEJhY2tlZFdpZGdldCh3aWRnZXQpKSB7XG5cdFx0XHRcdFx0Ly8gQWdlbnQtaG9zdCBzZXNzaW9ucyBkZWxlZ2F0ZSBjb21wbGV0aW9ucyB0byB0aGUgaG9zdFxuXHRcdFx0XHRcdC8vIHByb2Nlc3MgdmlhIGBBZ2VudEhvc3RJbnB1dENvbXBsZXRpb25zYC5cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCByYW5nZSA9IGNvbXB1dGVDb21wbGV0aW9uUmFuZ2VzKG1vZGVsLCBwb3NpdGlvbiwgd29yZFBhdHRlcm4sIHRydWUpO1xuXHRcdFx0XHRpZiAocmFuZ2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gcHJvdmlkZXIoeyBtb2RlbCwgcG9zaXRpb24sIHdpZGdldCwgcmFuZ2UsIGNvbnRleHQgfSwgdG9rZW4pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgY2FjaGVLZXk/OiB7IGtleTogc3RyaW5nOyB0aW1lOiBudW1iZXIgfTtcblxuXHRwcml2YXRlIGFzeW5jIGFkZEZpbGVBbmRGb2xkZXJFbnRyaWVzKHdpZGdldDogSUNoYXRXaWRnZXQsIHJlc3VsdDogQ29tcGxldGlvbkxpc3QsIGluZm86IHsgaW5zZXJ0OiBSYW5nZTsgcmVwbGFjZTogUmFuZ2U7IHZhcldvcmQ6IElXb3JkQXRQb3NpdGlvbiB8IG51bGwgfSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSB7XG5cblx0XHRjb25zdCB0eXBlZExlYWRlciA9IGluZm8udmFyV29yZD8ud29yZD8uY2hhckF0KDApID09PSBjaGF0QWdlbnRMZWFkZXIgPyBjaGF0QWdlbnRMZWFkZXIgOiBjaGF0VmFyaWFibGVMZWFkZXI7XG5cblx0XHRjb25zdCBtYWtlQ29tcGxldGlvbkl0ZW0gPSAocmVzb3VyY2U6IFVSSSwga2luZDogRmlsZUtpbmQsIGRlc2NyaXB0aW9uPzogc3RyaW5nLCBib29zdFByaW9yaXR5PzogYm9vbGVhbik6IENvbXBsZXRpb25JdGVtID0+IHtcblx0XHRcdGNvbnN0IGJhc2VuYW1lID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpQmFzZW5hbWVMYWJlbChyZXNvdXJjZSk7XG5cdFx0XHRjb25zdCB0ZXh0ID0gYCR7dHlwZWRMZWFkZXJ9ZmlsZToke2Jhc2VuYW1lfWA7XG5cdFx0XHRjb25zdCB1cmlMYWJlbCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHJlc291cmNlLCB7IHJlbGF0aXZlOiB0cnVlIH0pO1xuXHRcdFx0Y29uc3QgbGFiZWxEZXNjcmlwdGlvbiA9IGRlc2NyaXB0aW9uXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2ZpbGVFbnRyeURlc2NyaXB0aW9uJywgJ3swfSAoezF9KScsIHVyaUxhYmVsLCBkZXNjcmlwdGlvbilcblx0XHRcdFx0OiB1cmlMYWJlbDtcblx0XHRcdC8vIGtlZXAgZmlsZXMgYWJvdmUgb3RoZXIgY29tcGxldGlvbnNcblx0XHRcdGNvbnN0IHNvcnRUZXh0ID0gYm9vc3RQcmlvcml0eSA/ICcgJyA6ICchJztcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6IGJhc2VuYW1lLCBkZXNjcmlwdGlvbjogbGFiZWxEZXNjcmlwdGlvbiB9LFxuXHRcdFx0XHRmaWx0ZXJUZXh0OiBgJHtiYXNlbmFtZX0gJHt0eXBlZExlYWRlcn0ke2Jhc2VuYW1lfSAke3VyaUxhYmVsfWAsXG5cdFx0XHRcdGluc2VydFRleHQ6IGluZm8udmFyV29yZD8uZW5kQ29sdW1uID09PSBpbmZvLnJlcGxhY2UuZW5kQ29sdW1uID8gYCR7dGV4dH0gYCA6IHRleHQsXG5cdFx0XHRcdHJhbmdlOiBpbmZvLFxuXHRcdFx0XHRraW5kOiBraW5kID09PSBGaWxlS2luZC5GSUxFID8gQ29tcGxldGlvbkl0ZW1LaW5kLkZpbGUgOiBDb21wbGV0aW9uSXRlbUtpbmQuRm9sZGVyLFxuXHRcdFx0XHRzb3J0VGV4dCxcblx0XHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRcdGlkOiBCdWlsdGluRHluYW1pY0NvbXBsZXRpb25zLmFkZFJlZmVyZW5jZUNvbW1hbmQsIHRpdGxlOiAnJywgYXJndW1lbnRzOiBbbmV3IFJlZmVyZW5jZUFyZ3VtZW50KHdpZGdldCwge1xuXHRcdFx0XHRcdFx0aWQ6IHJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRpc0ZpbGU6IGtpbmQgPT09IEZpbGVLaW5kLkZJTEUsXG5cdFx0XHRcdFx0XHRpc0RpcmVjdG9yeToga2luZCA9PT0gRmlsZUtpbmQuRk9MREVSLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiBpbmZvLnJlcGxhY2Uuc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbjogaW5mby5yZXBsYWNlLnN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyOiBpbmZvLnJlcGxhY2UuZW5kTGluZU51bWJlciwgZW5kQ29sdW1uOiBpbmZvLnJlcGxhY2Uuc3RhcnRDb2x1bW4gKyB0ZXh0Lmxlbmd0aCB9LFxuXHRcdFx0XHRcdFx0ZGF0YTogcmVzb3VyY2Vcblx0XHRcdFx0XHR9KV1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0bGV0IHBhdHRlcm46IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAoaW5mby52YXJXb3JkPy53b3JkICYmIChpbmZvLnZhcldvcmQud29yZC5zdGFydHNXaXRoKGNoYXRWYXJpYWJsZUxlYWRlcikgfHwgaW5mby52YXJXb3JkLndvcmQuc3RhcnRzV2l0aChjaGF0QWdlbnRMZWFkZXIpKSkge1xuXHRcdFx0cGF0dGVybiA9IGluZm8udmFyV29yZC53b3JkLnRvTG93ZXJDYXNlKCkuc2xpY2UoMSk7IC8vIHJlbW92ZSBsZWFkaW5nICMgb3IgQFxuXHRcdH1cblxuXHRcdGNvbnN0IHNlZW4gPSBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRjb25zdCBsZW4gPSByZXN1bHQuc3VnZ2VzdGlvbnMubGVuZ3RoO1xuXG5cdFx0Ly8gSElTVE9SWVxuXHRcdC8vIGFsd2F5cyB0YWtlIHRoZSBsYXN0IE4gaXRlbXNcblx0XHRmb3IgKGNvbnN0IFtpLCBpdGVtXSBvZiB0aGlzLmhpc3RvcnlTZXJ2aWNlLmdldEhpc3RvcnkoKS5lbnRyaWVzKCkpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gaXNEaWZmRWRpdG9ySW5wdXQoaXRlbSkgPyBpdGVtLm1vZGlmaWVkLnJlc291cmNlIDogaXRlbS5yZXNvdXJjZTtcblx0XHRcdGlmICghcmVzb3VyY2UgfHwgc2Vlbi5oYXMocmVzb3VyY2UpIHx8ICF0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGlzU3VwcG9ydGVkQ2hhdEZpbGVTY2hlbWUoYWNjZXNzb3IsIHJlc291cmNlLnNjaGVtZSkpKSB7XG5cdFx0XHRcdC8vIGlnbm9yZSBlZGl0b3JzIHdpdGhvdXQgYSByZXNvdXJjZVxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHBhdHRlcm4pIHtcblx0XHRcdFx0Ly8gdXNlIHBhdHRlcm4gaWYgYXZhaWxhYmxlXG5cdFx0XHRcdGNvbnN0IHVyaUxhYmVsID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwocmVzb3VyY2UsIHsgcmVsYXRpdmU6IHRydWUgfSkudG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0Y29uc3QgYmFzZW5hbWUgPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlCYXNlbmFtZUxhYmVsKHJlc291cmNlKS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRjb25zdCBjb21iaW5lZCA9IGAke2Jhc2VuYW1lfSAke3VyaUxhYmVsfWA7XG5cdFx0XHRcdGlmICghaXNQYXR0ZXJuSW5Xb3JkKHBhdHRlcm4sIDAsIHBhdHRlcm4ubGVuZ3RoLCBjb21iaW5lZCwgMCwgY29tYmluZWQubGVuZ3RoKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHNlZW4uYWRkKHJlc291cmNlKTtcblx0XHRcdGNvbnN0IG5ld0xlbiA9IHJlc3VsdC5zdWdnZXN0aW9ucy5wdXNoKG1ha2VDb21wbGV0aW9uSXRlbShyZXNvdXJjZSwgRmlsZUtpbmQuRklMRSwgaSA9PT0gMCA/IGxvY2FsaXplKCdhY3RpdmVGaWxlJywgJ0FjdGl2ZSBmaWxlJykgOiB1bmRlZmluZWQsIGkgPT09IDApKTtcblx0XHRcdGlmIChuZXdMZW4gLSBsZW4gPj0gNSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBTRUFSQ0hcblx0XHQvLyB1c2UgZmlsZSBzZWFyY2ggd2hlbiBoYXZpbmcgYSBwYXR0ZXJuXG5cdFx0aWYgKHBhdHRlcm4pIHtcblxuXHRcdFx0Y29uc3QgY2FjaGVLZXkgPSB0aGlzLnVwZGF0ZUNhY2hlS2V5KCk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VzID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLm1hcChmb2xkZXIgPT4gZm9sZGVyLnVyaSk7XG5cblx0XHRcdGZvciAoY29uc3Qgd29ya3NwYWNlIG9mIHdvcmtzcGFjZXMpIHtcblx0XHRcdFx0Y29uc3QgeyBmb2xkZXJzLCBmaWxlcyB9ID0gYXdhaXQgc2VhcmNoRmlsZXNBbmRGb2xkZXJzKHdvcmtzcGFjZSwgcGF0dGVybiwgdHJ1ZSwgdG9rZW4sIGNhY2hlS2V5LmtleSwgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZSwgdGhpcy5zZWFyY2hTZXJ2aWNlKTtcblx0XHRcdFx0Zm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG5cdFx0XHRcdFx0aWYgKCFzZWVuLmhhcyhmaWxlKSkge1xuXHRcdFx0XHRcdFx0cmVzdWx0LnN1Z2dlc3Rpb25zLnB1c2gobWFrZUNvbXBsZXRpb25JdGVtKGZpbGUsIEZpbGVLaW5kLkZJTEUpKTtcblx0XHRcdFx0XHRcdHNlZW4uYWRkKGZpbGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiBmb2xkZXJzKSB7XG5cdFx0XHRcdFx0aWYgKCFzZWVuLmhhcyhmb2xkZXIpKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQuc3VnZ2VzdGlvbnMucHVzaChtYWtlQ29tcGxldGlvbkl0ZW0oZm9sZGVyLCBGaWxlS2luZC5GT0xERVIpKTtcblx0XHRcdFx0XHRcdHNlZW4uYWRkKGZvbGRlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gbWFyayByZXN1bHRzIGFzIGluY29tcGxldGUgYmVjYXVzZSBmdXJ0aGVyIHR5cGluZyBtaWdodCB5aWVsZFxuXHRcdC8vIGluIG1vcmUgc2VhcmNoIHJlc3VsdHNcblx0XHRyZXN1bHQuaW5jb21wbGV0ZSA9IHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFkZFN5bWJvbEVudHJpZXMod2lkZ2V0OiBJQ2hhdFdpZGdldCwgcmVzdWx0OiBDb21wbGV0aW9uTGlzdCwgaW5mbzogeyBpbnNlcnQ6IFJhbmdlOyByZXBsYWNlOiBSYW5nZTsgdmFyV29yZDogSVdvcmRBdFBvc2l0aW9uIHwgbnVsbCB9LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRjb25zdCB0aW1lb3V0TXMgPSAxMDA7XG5cdFx0Y29uc3Qgc3RvcHdhdGNoID0gbmV3IFN0b3BXYXRjaCgpO1xuXG5cdFx0Y29uc3QgdHlwZWRMZWFkZXIgPSBpbmZvLnZhcldvcmQ/LndvcmQ/LmNoYXJBdCgwKSA9PT0gY2hhdEFnZW50TGVhZGVyID8gY2hhdEFnZW50TGVhZGVyIDogY2hhdFZhcmlhYmxlTGVhZGVyO1xuXG5cdFx0Y29uc3QgbWFrZVN5bWJvbENvbXBsZXRpb25JdGVtID0gKHN5bWJvbEl0ZW06IHsgbmFtZTogc3RyaW5nOyBsb2NhdGlvbjogTG9jYXRpb247IGtpbmQ6IFN5bWJvbEtpbmQgfSwgcGF0dGVybjogc3RyaW5nKTogQ29tcGxldGlvbkl0ZW0gPT4ge1xuXHRcdFx0Y29uc3QgdGV4dCA9IGAke3R5cGVkTGVhZGVyfXN5bToke3N5bWJvbEl0ZW0ubmFtZX1gO1xuXHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBzeW1ib2xJdGVtLmxvY2F0aW9uLnVyaTtcblx0XHRcdGNvbnN0IHVyaUxhYmVsID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwocmVzb3VyY2UsIHsgcmVsYXRpdmU6IHRydWUgfSk7XG5cdFx0XHRjb25zdCBzb3J0VGV4dCA9IHBhdHRlcm4gPyAneycgLyogYWZ0ZXIgeiAqLyA6ICd8JyAvKiBhZnRlciB7ICovO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRsYWJlbDogeyBsYWJlbDogc3ltYm9sSXRlbS5uYW1lLCBkZXNjcmlwdGlvbjogdXJpTGFiZWwgfSxcblx0XHRcdFx0ZmlsdGVyVGV4dDogYCR7dHlwZWRMZWFkZXJ9JHtzeW1ib2xJdGVtLm5hbWV9YCxcblx0XHRcdFx0aW5zZXJ0VGV4dDogaW5mby52YXJXb3JkPy5lbmRDb2x1bW4gPT09IGluZm8ucmVwbGFjZS5lbmRDb2x1bW4gPyBgJHt0ZXh0fSBgIDogdGV4dCxcblx0XHRcdFx0cmFuZ2U6IGluZm8sXG5cdFx0XHRcdGtpbmQ6IFN5bWJvbEtpbmRzLnRvQ29tcGxldGlvbktpbmQoc3ltYm9sSXRlbS5raW5kKSxcblx0XHRcdFx0c29ydFRleHQsXG5cdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRpZDogQnVpbHRpbkR5bmFtaWNDb21wbGV0aW9ucy5hZGRSZWZlcmVuY2VDb21tYW5kLCB0aXRsZTogJycsIGFyZ3VtZW50czogW25ldyBSZWZlcmVuY2VBcmd1bWVudCh3aWRnZXQsIHtcblx0XHRcdFx0XHRcdGlkOiBgdnNjb2RlLnN5bWJvbC8ke0pTT04uc3RyaW5naWZ5KHN5bWJvbEl0ZW0ubG9jYXRpb24pfWAsXG5cdFx0XHRcdFx0XHRmdWxsTmFtZTogc3ltYm9sSXRlbS5uYW1lLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiBpbmZvLnJlcGxhY2Uuc3RhcnRMaW5lTnVtYmVyLCBzdGFydENvbHVtbjogaW5mby5yZXBsYWNlLnN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyOiBpbmZvLnJlcGxhY2UuZW5kTGluZU51bWJlciwgZW5kQ29sdW1uOiBpbmZvLnJlcGxhY2Uuc3RhcnRDb2x1bW4gKyB0ZXh0Lmxlbmd0aCB9LFxuXHRcdFx0XHRcdFx0ZGF0YTogc3ltYm9sSXRlbS5sb2NhdGlvbixcblx0XHRcdFx0XHRcdGljb246IFN5bWJvbEtpbmRzLnRvSWNvbihzeW1ib2xJdGVtLmtpbmQpXG5cdFx0XHRcdFx0fSldXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGxldCBwYXR0ZXJuOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGluZm8udmFyV29yZD8ud29yZCAmJiAoaW5mby52YXJXb3JkLndvcmQuc3RhcnRzV2l0aChjaGF0VmFyaWFibGVMZWFkZXIpIHx8IGluZm8udmFyV29yZC53b3JkLnN0YXJ0c1dpdGgoY2hhdEFnZW50TGVhZGVyKSkpIHtcblx0XHRcdHBhdHRlcm4gPSBpbmZvLnZhcldvcmQud29yZC50b0xvd2VyQ2FzZSgpLnNsaWNlKDEpOyAvLyByZW1vdmUgbGVhZGluZyAjIG9yIEBcblx0XHR9XG5cblx0XHRjb25zdCBzeW1ib2xzVG9BZGQ6IHsgc3ltYm9sOiBEb2N1bWVudFN5bWJvbDsgdXJpOiBVUkkgfVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBvdXRsaW5lTW9kZWwgb2YgdGhpcy5vdXRsaW5lU2VydmljZS5nZXRDYWNoZWRNb2RlbHMoKSkge1xuXHRcdFx0Y29uc3Qgc3ltYm9scyA9IG91dGxpbmVNb2RlbC5hc0xpc3RPZkRvY3VtZW50U3ltYm9scygpO1xuXHRcdFx0Zm9yIChjb25zdCBzeW1ib2wgb2Ygc3ltYm9scykge1xuXHRcdFx0XHRzeW1ib2xzVG9BZGQucHVzaCh7IHN5bWJvbCwgdXJpOiBvdXRsaW5lTW9kZWwudXJpIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCB0aW1lZE91dCA9IGZhbHNlO1xuXG5cdFx0Zm9yIChjb25zdCBzeW1ib2wgb2Ygc3ltYm9sc1RvQWRkKSB7XG5cdFx0XHRpZiAoc3RvcHdhdGNoLmVsYXBzZWQoKSA+IHRpbWVvdXRNcyB8fCB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHR0aW1lZE91dCA9IHRydWU7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0cmVzdWx0LnN1Z2dlc3Rpb25zLnB1c2gobWFrZVN5bWJvbENvbXBsZXRpb25JdGVtKHsgLi4uc3ltYm9sLnN5bWJvbCwgbG9jYXRpb246IHsgdXJpOiBzeW1ib2wudXJpLCByYW5nZTogc3ltYm9sLnN5bWJvbC5yYW5nZSB9IH0sIHBhdHRlcm4gPz8gJycpKTtcblx0XHR9XG5cblx0XHRyZXN1bHQuaW5jb21wbGV0ZSA9ICEhcGF0dGVybiB8fCB0aW1lZE91dDtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ2FjaGVLZXkoKSB7XG5cdFx0aWYgKHRoaXMuY2FjaGVLZXkgJiYgRGF0ZS5ub3coKSAtIHRoaXMuY2FjaGVLZXkudGltZSA+IDYwMDAwKSB7XG5cdFx0XHR0aGlzLnNlYXJjaFNlcnZpY2UuY2xlYXJDYWNoZSh0aGlzLmNhY2hlS2V5LmtleSk7XG5cdFx0XHR0aGlzLmNhY2hlS2V5ID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5jYWNoZUtleSkge1xuXHRcdFx0dGhpcy5jYWNoZUtleSA9IHtcblx0XHRcdFx0a2V5OiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0dGltZTogRGF0ZS5ub3coKVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0aGlzLmNhY2hlS2V5LnRpbWUgPSBEYXRlLm5vdygpO1xuXG5cdFx0cmV0dXJuIHRoaXMuY2FjaGVLZXk7XG5cdH1cblxuXHRwcml2YXRlIGNtZEFkZFJlZmVyZW5jZShhcmc6IFJlZmVyZW5jZUFyZ3VtZW50KSB7XG5cdFx0Ly8gaW52b2tlZCB2aWEgdGhlIGNvbXBsZXRpb24gY29tbWFuZFxuXHRcdGFyZy53aWRnZXQuZ2V0Q29udHJpYjxDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWw+KENoYXREeW5hbWljVmFyaWFibGVNb2RlbC5JRCk/LmFkZFJlZmVyZW5jZShhcmcudmFyaWFibGUpO1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihCdWlsdGluRHluYW1pY0NvbXBsZXRpb25zLCBMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KTtcblxuY2xhc3MgVG9vbENvbXBsZXRpb25zIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVmFyaWFibGVOYW1lRGVmID0gbmV3IFJlZ0V4cChgKD88PV58XFxcXHMpWyR7ZXNjYXBlRm9yQ2hhckNsYXNzKGNoYXRWYXJpYWJsZUxlYWRlcil9JHtlc2NhcGVGb3JDaGFyQ2xhc3MoY2hhdEFnZW50TGVhZGVyKX1dXFxcXHcqYCwgJ2cnKTsgLy8gTVVTVCBiZSB1c2luZyBgZ2AtZmxhZ1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQ2hhdEFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYW5ndWFnZUZlYXR1cmVzU2VydmljZS5jb21wbGV0aW9uUHJvdmlkZXIucmVnaXN0ZXIoeyBzY2hlbWU6IFNjaGVtYXMudnNjb2RlQ2hhdElucHV0LCBoYXNBY2Nlc3NUb0FsbE1vZGVsczogdHJ1ZSB9LCB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ2NoYXRWYXJpYWJsZXMnLFxuXHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFtjaGF0VmFyaWFibGVMZWFkZXIsIGNoYXRBZ2VudExlYWRlcl0sXG5cdFx0XHRwcm92aWRlQ29tcGxldGlvbkl0ZW1zOiBhc3luYyAobW9kZWw6IElUZXh0TW9kZWwsIHBvc2l0aW9uOiBQb3NpdGlvbiwgX2NvbnRleHQ6IENvbXBsZXRpb25Db250ZXh0LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlJbnB1dFVyaShtb2RlbC51cmkpO1xuXHRcdFx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGlzQWdlbnRIb3N0QmFja2VkV2lkZ2V0KHdpZGdldCkpIHtcblx0XHRcdFx0XHQvLyBBZ2VudC1ob3N0IHNlc3Npb25zIGRlbGVnYXRlIGNvbXBsZXRpb25zIHRvIHRoZSBob3N0XG5cdFx0XHRcdFx0Ly8gcHJvY2VzcyB2aWEgYEFnZW50SG9zdElucHV0Q29tcGxldGlvbnNgLlxuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gSWYgbG9ja2VkIHRvIGFuIGFnZW50IHRoYXQgZG9lc24ndCBzdXBwb3J0IHRvb2wgYXR0YWNobWVudHMsIHNraXBcblx0XHRcdFx0aWYgKHdpZGdldC5sb2NrZWRBZ2VudElkKSB7XG5cdFx0XHRcdFx0Y29uc3QgYWdlbnQgPSB0aGlzLmNoYXRBZ2VudFNlcnZpY2UuZ2V0QWdlbnQod2lkZ2V0LmxvY2tlZEFnZW50SWQpO1xuXHRcdFx0XHRcdGlmIChhZ2VudCAmJiAhYWdlbnQuY2FwYWJpbGl0aWVzPy5zdXBwb3J0c1Rvb2xBdHRhY2htZW50cykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBjb21wdXRlQ29tcGxldGlvblJhbmdlcyhtb2RlbCwgcG9zaXRpb24sIFRvb2xDb21wbGV0aW9ucy5WYXJpYWJsZU5hbWVEZWYsIHRydWUpO1xuXHRcdFx0XHRpZiAoIXJhbmdlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH1cblxuXG5cdFx0XHRcdGNvbnN0IHVzZWROYW1lcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IHBhcnQgb2Ygd2lkZ2V0LnBhcnNlZElucHV0LnBhcnRzKSB7XG5cdFx0XHRcdFx0aWYgKHBhcnQgaW5zdGFuY2VvZiBDaGF0UmVxdWVzdFRvb2xQYXJ0KSB7XG5cdFx0XHRcdFx0XHR1c2VkTmFtZXMuYWRkKHBhcnQudG9vbE5hbWUpO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAocGFydCBpbnN0YW5jZW9mIENoYXRSZXF1ZXN0VG9vbFNldFBhcnQpIHtcblx0XHRcdFx0XHRcdHVzZWROYW1lcy5hZGQocGFydC5uYW1lKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB0eXBlZExlYWRlciA9IHJhbmdlLnZhcldvcmQ/LndvcmQ/LmNoYXJBdCgwKSA9PT0gY2hhdEFnZW50TGVhZGVyID8gY2hhdEFnZW50TGVhZGVyIDogY2hhdFZhcmlhYmxlTGVhZGVyO1xuXHRcdFx0XHRjb25zdCBwYXR0ZXJuID0gcmFuZ2UudmFyV29yZD8ud29yZCA/IHJhbmdlLnZhcldvcmQud29yZC50b0xvd2VyQ2FzZSgpLnNsaWNlKDEpIDogJyc7XG5cdFx0XHRcdGNvbnN0IHN1Z2dlc3Rpb25zOiBDb21wbGV0aW9uSXRlbVtdID0gW107XG5cblxuXHRcdFx0XHRjb25zdCBpdGVyID0gd2lkZ2V0LmlucHV0LnNlbGVjdGVkVG9vbHNNb2RlbC5lbnRyaWVzTWFwLmdldCgpO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgW2l0ZW0sIGVuYWJsZWRdIG9mIGl0ZXIpIHtcblx0XHRcdFx0XHRpZiAoIWVuYWJsZWQpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGxldCBkZXRhaWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRsZXQgZG9jdW1lbnRhdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRcdFx0bGV0IG5hbWU6IHN0cmluZztcblx0XHRcdFx0XHRpZiAoaXNUb29sU2V0KGl0ZW0pKSB7XG5cdFx0XHRcdFx0XHRkZXRhaWwgPSBpdGVtLmRlc2NyaXB0aW9uO1xuXHRcdFx0XHRcdFx0bmFtZSA9IGl0ZW0ucmVmZXJlbmNlTmFtZTtcblxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzb3VyY2UgPSBpdGVtLnNvdXJjZTtcblx0XHRcdFx0XHRcdGRldGFpbCA9IGxvY2FsaXplKCd0b29sX3NvdXJjZV9jb21wbGV0aW9uJywgXCJ7MH06IHsxfVwiLCBzb3VyY2UubGFiZWwsIGl0ZW0uZGlzcGxheU5hbWUpO1xuXHRcdFx0XHRcdFx0bmFtZSA9IGl0ZW0udG9vbFJlZmVyZW5jZU5hbWUgPz8gaXRlbS5kaXNwbGF5TmFtZTtcblx0XHRcdFx0XHRcdGRvY3VtZW50YXRpb24gPSBpdGVtLnVzZXJEZXNjcmlwdGlvbiA/PyBpdGVtLm1vZGVsRGVzY3JpcHRpb247XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKHVzZWROYW1lcy5oYXMobmFtZSkpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChwYXR0ZXJuKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBsb3dlck5hbWUgPSBuYW1lLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0XHRpZiAoIWlzUGF0dGVybkluV29yZChwYXR0ZXJuLCAwLCBwYXR0ZXJuLmxlbmd0aCwgbG93ZXJOYW1lLCAwLCBsb3dlck5hbWUubGVuZ3RoKSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCB3aXRoTGVhZGVyID0gYCR7dHlwZWRMZWFkZXJ9JHtuYW1lfWA7XG5cdFx0XHRcdFx0c3VnZ2VzdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0XHRsYWJlbDogd2l0aExlYWRlcixcblx0XHRcdFx0XHRcdHJhbmdlLFxuXHRcdFx0XHRcdFx0ZGV0YWlsLFxuXHRcdFx0XHRcdFx0ZG9jdW1lbnRhdGlvbixcblx0XHRcdFx0XHRcdGZpbHRlclRleHQ6IGAke3R5cGVkTGVhZGVyfSR7bmFtZX1gLFxuXHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogd2l0aExlYWRlciArICcgJyxcblx0XHRcdFx0XHRcdGtpbmQ6IENvbXBsZXRpb25JdGVtS2luZC5Ub29sLFxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4geyBzdWdnZXN0aW9ucyB9O1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oVG9vbENvbXBsZXRpb25zLCBMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVksaUJBQWlCLG9CQUFvQjtBQUMxRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQXNCLGVBQWUsb0JBQW9CO0FBQ3pELFNBQVMsMEJBQTBCO0FBSW5DLFNBQTRDLG9CQUFrSCxtQkFBbUI7QUFFakwsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw0QkFB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QU8sTUFBTSxRQUFRLEtBQUssWUFBWSxFQUFFLE1BQU0sQ0FBQyxJQUFJO0FBQ2xGLGNBQU0sY0FBZ0MsQ0FBQztBQUd2QyxjQUFNLE9BQU8sT0FBTyxNQUFNLG1CQUFtQixXQUFXLElBQUk7QUFFNUQsbUJBQVcsQ0FBQyxNQUFNLE9BQU8sS0FBSyxNQUFNO0FBQ25DLGNBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxVQUNEO0FBRUEsY0FBSTtBQUNKLGNBQUk7QUFFSixjQUFJO0FBQ0osY0FBSSxVQUFVLElBQUksR0FBRztBQUNwQixxQkFBUyxLQUFLO0FBQ2QsbUJBQU8sS0FBSztBQUFBLFVBRWIsT0FBTztBQUNOLGtCQUFNLFNBQVMsS0FBSztBQUNwQixxQkFBUyxTQUFTLDBCQUEwQixZQUFZLE9BQU8sT0FBTyxLQUFLLFdBQVc7QUFDdEYsbUJBQU8sS0FBSyxxQkFBcUIsS0FBSztBQUN0Qyw0QkFBZ0IsS0FBSyxtQkFBbUIsS0FBSztBQUFBLFVBQzlDO0FBRUEsY0FBSSxVQUFVLElBQUksSUFBSSxHQUFHO0FBQ3hCO0FBQUEsVUFDRDtBQUVBLGNBQUksU0FBUztBQUNaLGtCQUFNLFlBQVksS0FBSyxZQUFZO0FBQ25DLGdCQUFJLENBQUMsZ0JBQWdCLFNBQVMsR0FBRyxRQUFRLFFBQVEsV0FBVyxHQUFHLFVBQVUsTUFBTSxHQUFHO0FBQ2pGO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFFQSxnQkFBTSxhQUFhLEdBQUcsV0FBVyxHQUFHLElBQUk7QUFDeEMsc0JBQVksS0FBSztBQUFBLFlBQ2hCLE9BQU87QUFBQSxZQUNQO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFBQSxZQUNBLFlBQVksR0FBRyxXQUFXLEdBQUcsSUFBSTtBQUFBLFlBQ2pDLFlBQVksYUFBYTtBQUFBLFlBQ3pCLE1BQU0sbUJBQW1CO0FBQUEsVUFDMUIsQ0FBQztBQUFBLFFBRUY7QUFFQSxlQUFPLEVBQUUsWUFBWTtBQUFBLE1BQ3RCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQ0Q7QUF4R00sZ0JBRW1CLGtCQUFrQixJQUFJLE9BQU8sY0FBYyxtQkFBbUIsa0JBQWtCLENBQUMsR0FBRyxtQkFBbUIsZUFBZSxDQUFDLFNBQVMsR0FBRztBQUZ0SixrQkFBTjtBQUFBLEVBS0c7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUEc7QUEwR04sU0FBUyxHQUFvQyxvQkFBb0IsU0FBUyxFQUFFLDhCQUE4QixpQkFBaUIsZUFBZSxVQUFVOyIsCiAgIm5hbWVzIjogWyJsYWJlbCIsICJ1c2VkQWdlbnQiLCAiYWNjZXNzb3IiLCAiYmFzZW5hbWUiLCAiY29kZUVkaXRvciIsICJwYXR0ZXJuIl0KfQo=
