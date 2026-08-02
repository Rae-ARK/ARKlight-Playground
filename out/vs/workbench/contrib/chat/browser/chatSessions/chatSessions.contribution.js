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
import { sep } from "../../../../../base/common/path.js";
import { AsyncIterableProducer, DeferredPromise, raceCancellationError } from "../../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { combinedDisposable, Disposable, DisposableMap, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../../../base/common/map.js";
import { Schemas } from "../../../../../base/common/network.js";
import * as resources from "../../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize, localize2 } from "../../../../../nls.js";
import { Action2, IMenuService, MenuId, MenuItemAction, MenuRegistry, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IProgressService } from "../../../../../platform/progress/common/progress.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { isDark } from "../../../../../platform/theme/common/theme.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IExtensionService, isProposedApiEnabled } from "../../../../services/extensions/common/extensions.js";
import { ExtensionsRegistry } from "../../../../services/extensions/common/extensionsRegistry.js";
import { ChatEditorInput } from "../widgetHosts/editor/chatEditorInput.js";
import { IChatAgentService } from "../../common/participants/chatAgents.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { ChatSessionOptionsMap, ChatSessionStatus, ChatSessionsExtensions, IChatSessionsService, isSessionInProgressStatus, localChatSessionType, SessionType } from "../../common/chatSessionsService.js";
import { ChatAgentLocation, ChatModeKind } from "../../common/constants.js";
import { CHAT_CATEGORY } from "../actions/chatActions.js";
import { IChatService, ResponseModelState } from "../../common/chatService/chatService.js";
import { autorun, observableFromEvent } from "../../../../../base/common/observable.js";
import { PromptFileVariableKind, toPromptFileVariableEntry } from "../../common/attachments/chatVariableEntries.js";
import { IViewsService } from "../../../../services/views/common/viewsService.js";
import { ChatViewId } from "../chat.js";
import { AgentSessionProviders, getAgentSessionProvider, getAgentSessionProviderName } from "../agentSessions/agentSessions.js";
import { IAgentHostImportConversationStore } from "../agentSessions/agentHost/agentHostImportConversationStore.js";
import { BugIndicatingError, isCancellationError } from "../../../../../base/common/errors.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
import { getChatSessionType, isUntitledChatSession, LocalChatSessionUri } from "../../common/model/chatUri.js";
import { assertNever } from "../../../../../base/common/assert.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { Target } from "../../common/promptSyntax/promptTypes.js";
import { slashReg } from "../../common/requestParser/chatRequestParser.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { ILanguageModelToolsService } from "../../common/tools/languageModelToolsService.js";
import { ICustomizationHarnessService } from "../../common/customizationHarnessService.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { AGENT_HOST_ENABLED_CONTEXT_KEY } from "../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { AgentHostCodexAgentEnabledSettingId, CodexPreferAgentHostEditorSettingId } from "../../../../../platform/agentHost/common/agentService.js";
import { IsSessionsWindowContext } from "../../../../common/contextkeys.js";
const extensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "chatSessions",
  jsonSchema: {
    description: localize("chatSessionsExtPoint", "Contributes chat session integrations to the chat widget."),
    type: "array",
    items: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: {
          description: localize("chatSessionsExtPoint.chatSessionType", "Unique identifier for the type of chat session."),
          type: "string"
        },
        name: {
          description: localize("chatSessionsExtPoint.name", "Name of the dynamically registered chat participant (eg: @agent). Must not contain whitespace."),
          type: "string",
          pattern: "^[\\w-]+$"
        },
        displayName: {
          description: localize("chatSessionsExtPoint.displayName", "A longer name for this item which is used for display in menus."),
          type: "string"
        },
        description: {
          description: localize("chatSessionsExtPoint.description", "Description of the chat session for use in menus and tooltips."),
          type: "string"
        },
        when: {
          description: localize("chatSessionsExtPoint.when", "Condition which must be true to show this item."),
          type: "string"
        },
        icon: {
          description: localize("chatSessionsExtPoint.icon", 'Icon identifier (codicon ID) for the chat session editor tab. For example, "{0}" or "{1}".', "$(github)", "$(cloud)"),
          anyOf: [
            {
              type: "string"
            },
            {
              type: "object",
              properties: {
                light: {
                  description: localize("icon.light", "Icon path when a light theme is used"),
                  type: "string"
                },
                dark: {
                  description: localize("icon.dark", "Icon path when a dark theme is used"),
                  type: "string"
                }
              }
            }
          ]
        },
        order: {
          description: localize("chatSessionsExtPoint.order", "Order in which this item should be displayed."),
          type: "integer"
        },
        alternativeIds: {
          description: localize("chatSessionsExtPoint.alternativeIds", "Alternative identifiers for backward compatibility."),
          type: "array",
          items: {
            type: "string"
          }
        },
        welcomeTitle: {
          description: localize("chatSessionsExtPoint.welcomeTitle", "Title text to display in the chat welcome view for this session type."),
          type: "string"
        },
        welcomeMessage: {
          description: localize("chatSessionsExtPoint.welcomeMessage", "Message text (supports markdown) to display in the chat welcome view for this session type."),
          type: "string"
        },
        welcomeTips: {
          description: localize("chatSessionsExtPoint.welcomeTips", "Tips text (supports markdown and theme icons) to display in the chat welcome view for this session type."),
          type: "string"
        },
        inputPlaceholder: {
          description: localize("chatSessionsExtPoint.inputPlaceholder", "Placeholder text to display in the chat input box for this session type."),
          type: "string"
        },
        capabilities: {
          description: localize("chatSessionsExtPoint.capabilities", "Optional capabilities for this chat session."),
          type: "object",
          additionalProperties: false,
          properties: {
            supportsFileAttachments: {
              description: localize("chatSessionsExtPoint.supportsFileAttachments", "Whether this chat session supports attaching files or file references."),
              type: "boolean"
            },
            supportsToolAttachments: {
              description: localize("chatSessionsExtPoint.supportsToolAttachments", "Whether this chat session supports attaching tools or tool references."),
              type: "boolean"
            },
            supportsMCPAttachments: {
              description: localize("chatSessionsExtPoint.supportsMCPAttachments", "Whether this chat session supports attaching MCP resources."),
              type: "boolean"
            },
            supportsImageAttachments: {
              description: localize("chatSessionsExtPoint.supportsImageAttachments", "Whether this chat session supports attaching images."),
              type: "boolean"
            },
            supportsSearchResultAttachments: {
              description: localize("chatSessionsExtPoint.supportsSearchResultAttachments", "Whether this chat session supports attaching search results."),
              type: "boolean"
            },
            supportsInstructionAttachments: {
              description: localize("chatSessionsExtPoint.supportsInstructionAttachments", "Whether this chat session supports attaching instructions."),
              type: "boolean"
            },
            supportsSourceControlAttachments: {
              description: localize("chatSessionsExtPoint.supportsSourceControlAttachments", "Whether this chat session supports attaching source control changes."),
              type: "boolean"
            },
            supportsProblemAttachments: {
              description: localize("chatSessionsExtPoint.supportsProblemAttachments", "Whether this chat session supports attaching problems."),
              type: "boolean"
            },
            supportsSymbolAttachments: {
              description: localize("chatSessionsExtPoint.supportsSymbolAttachments", "Whether this chat session supports attaching symbols."),
              type: "boolean"
            },
            supportsPromptAttachments: {
              description: localize("chatSessionsExtPoint.supportsPromptAttachments", "Whether this chat session supports attaching prompts."),
              type: "boolean"
            },
            supportsHandOffs: {
              description: localize("chatSessionsExtPoint.supportsHandOffs", "Whether this chat session supports hand-off prompts."),
              type: "boolean"
            }
          }
        },
        commands: {
          markdownDescription: localize("chatCommandsDescription", "Commands available for this chat session, which the user can invoke with a `/`."),
          type: "array",
          items: {
            additionalProperties: false,
            type: "object",
            defaultSnippets: [{ body: { name: "", description: "" } }],
            required: ["name"],
            properties: {
              name: {
                description: localize("chatCommand", "A short name by which this command is referred to in the UI, e.g. `fix` or `explain` for commands that fix an issue or explain code. The name should be unique among the commands provided by this participant."),
                type: "string"
              },
              description: {
                description: localize("chatCommandDescription", "A description of this command."),
                type: "string"
              },
              when: {
                description: localize("chatCommandWhen", "A condition which must be true to enable this command."),
                type: "string"
              }
            }
          }
        },
        canDelegate: {
          description: localize("chatSessionsExtPoint.canDelegate", "Whether delegation is supported. Default is false. Note that enabling this is experimental and may not be respected at all times."),
          type: "boolean",
          default: false
        },
        customAgentTarget: {
          description: localize("chatSessionsExtPoint.customAgentTarget", "When set, the chat session will show a filtered mode picker that prefers custom agents whose target property matches this value. Custom agents without a target property are still shown in all session types. This enables the use of standard agent/mode with contributed sessions."),
          type: "string"
        },
        requiresCustomModels: {
          description: localize("chatSessionsExtPoint.requiresCustomModels", "When set, the chat session will show a filtered model picker that prefers custom models. This enables the use of standard model picker with contributed sessions."),
          type: "boolean",
          default: false
        },
        supportsAutoModel: {
          description: localize("chatSessionsExtPoint.supportsAutoModel", 'Whether the chat session supports the synthetic "Auto" model fallback. Defaults to false. When true and no models are available, the picker shows "Auto" instead of a "No models available" state.'),
          type: "boolean",
          default: false
        },
        requiresCopilotSignIn: {
          description: localize("chatSessionsExtPoint.requiresCopilotSignIn", "Whether the chat session relies on a GitHub Copilot account and so cannot be used until the user signs in. Defaults to false."),
          type: "boolean",
          default: false
        },
        autoAttachReferences: {
          description: localize("chatSessionsExtPoint.autoAttachReferences", "Whether to automatically attach instruction files to chat requests for this session type."),
          type: "boolean",
          default: false
        },
        useRequestToPopulateBuiltInPickers: {
          description: localize("chatSessionsExtPoint.useRequestToPopulateBuiltInPickers", "Whether to use ChatRequestTurn2 to populate built-in pickers such as the Agent and Model pickers."),
          type: "boolean",
          default: false
        }
      },
      required: ["type", "name", "displayName", "description"]
    }
  },
  activationEventsGenerator: function* (contribs) {
    for (const contrib of contribs) {
      yield `onChatSession:${contrib.type}`;
    }
  }
});
const codexExtensionHostAvailableWhen = ContextKeyExpr.and(
  IsSessionsWindowContext.negate(),
  ContextKeyExpr.or(
    AGENT_HOST_ENABLED_CONTEXT_KEY.negate(),
    ContextKeyExpr.not(`config.${AgentHostCodexAgentEnabledSettingId}`),
    ContextKeyExpr.not(`config.${CodexPreferAgentHostEditorSettingId}`)
  )
);
function applyCodexAgentHostPreference(contribution) {
  if (contribution.type !== SessionType.Codex) {
    return contribution;
  }
  const contributedWhen = contribution.when ? ContextKeyExpr.deserialize(contribution.when) : void 0;
  return {
    ...contribution,
    when: ContextKeyExpr.and(contributedWhen, codexExtensionHostAvailableWhen)?.serialize()
  };
}
class ContributedChatSessionData extends Disposable {
  constructor(session, chatSessionType, resource, options, onWillDispose) {
    super();
    this.session = session;
    this.chatSessionType = chatSessionType;
    this.resource = resource;
    this.options = options;
    this.onWillDispose = onWillDispose;
    this._optionsCache = new Map(options);
    this._register(this.session.onWillDispose(() => {
      this.onWillDispose(this.resource);
    }));
  }
  getOption(optionId) {
    return this._optionsCache.get(optionId);
  }
  getAllOptions() {
    return this._optionsCache.entries();
  }
  setOption(optionId, value) {
    this._optionsCache.set(optionId, value);
  }
}
let ChatSessionsService = class extends Disposable {
  constructor(_logService, _chatAgentService, _extensionService, _contextKeyService, _menuService, _themeService, _labelService, _instantiationService) {
    super();
    this._logService = _logService;
    this._chatAgentService = _chatAgentService;
    this._extensionService = _extensionService;
    this._contextKeyService = _contextKeyService;
    this._menuService = _menuService;
    this._themeService = _themeService;
    this._labelService = _labelService;
    this._instantiationService = _instantiationService;
    this._itemControllers = /* @__PURE__ */ new Map();
    this._asyncActivationRegistry = Registry.as(ChatSessionsExtensions.AsyncActivation);
    this._contributions = /* @__PURE__ */ new Map();
    this._contributionDisposables = this._register(new DisposableMap());
    this._contentProviders = /* @__PURE__ */ new Map();
    this._alternativeIdMap = /* @__PURE__ */ new Map();
    this._contextKeys = /* @__PURE__ */ new Set();
    this._onDidChangeItemsProviders = this._register(new Emitter());
    this.onDidChangeItemsProviders = this._onDidChangeItemsProviders.event;
    this._onDidChangeSessionItems = this._register(new Emitter());
    this.onDidChangeSessionItems = this._onDidChangeSessionItems.event;
    this._onDidCommitSession = this._register(new Emitter());
    this.onDidCommitSession = this._onDidCommitSession.event;
    this._onDidChangeAvailability = this._register(new Emitter());
    this.onDidChangeAvailability = this._onDidChangeAvailability.event;
    this._onDidChangeInProgress = this._register(new Emitter());
    this._onDidChangeContentProviderSchemes = this._register(new Emitter());
    this._onDidChangeSessionOptions = this._register(new Emitter());
    this._onDidChangeOptionGroups = this._register(new Emitter());
    this.inProgressMap = /* @__PURE__ */ new Map();
    this._sessionTypeOptions = /* @__PURE__ */ new Map();
    this._sessions = new ResourceMap();
    this._resourceAliases = new ResourceMap();
    // real resource -> untitled resource (kept for the workbench lifetime so option lookups for the real session resolve to the untitled entry)
    this._realResources = new ResourceMap();
    // untitled resource -> real resource (cleared when the session is disposed)
    this._customizationsProviders = /* @__PURE__ */ new Map();
    this._onDidChangeCustomizations = this._register(new Emitter());
    this.onDidChangeCustomizations = this._onDidChangeCustomizations.event;
    this._hasCanDelegateProvidersKey = ChatContextKeys.hasCanDelegateProviders.bindTo(this._contextKeyService);
    this._register(extensionPoint.setHandler((extensions) => {
      for (const ext of extensions) {
        if (!isProposedApiEnabled(ext.description, "chatSessionsProvider")) {
          continue;
        }
        if (!Array.isArray(ext.value)) {
          continue;
        }
        for (const contribution of ext.value) {
          this._register(this.registerContribution(contribution, ext.description));
        }
      }
    }));
    this._register(Event.filter(this._contextKeyService.onDidChangeContext, (e) => e.affectsSome(this._contextKeys))(() => {
      this._evaluateAvailability();
    }));
    const builtinSessionProviders = [AgentSessionProviders.Local];
    const contributedSessionProviders = observableFromEvent(
      this.onDidChangeAvailability,
      () => Array.from(this._contributions.keys()).filter((key) => this._contributionDisposables.has(key))
    ).recomputeInitiallyAndOnChange(this._store);
    this._register(autorun((reader) => {
      const activatedProviders = contributedSessionProviders.read(reader);
      for (const provider of builtinSessionProviders) {
        reader.store.add(registerNewSessionInPlaceAction(provider, getAgentSessionProviderName(provider)));
      }
      for (const type of activatedProviders) {
        const knownProvider = getAgentSessionProvider(type);
        if (knownProvider) {
          const label = getAgentSessionProviderName(knownProvider);
          reader.store.add(registerNewSessionInPlaceAction(type, label));
        } else {
          const contrib = this._contributions.get(type);
          if (contrib) {
            reader.store.add(registerNewSessionInPlaceAction(type, contrib.contribution.displayName ?? contrib.contribution.name ?? type));
          }
        }
      }
    }));
    this._register(this._labelService.registerFormatter({
      scheme: Schemas.copilotPr,
      formatting: {
        label: "${authority}${path}",
        separator: sep,
        stripPathStartingSeparator: true
      }
    }));
  }
  get onDidChangeInProgress() {
    return this._onDidChangeInProgress.event;
  }
  get onDidChangeContentProviderSchemes() {
    return this._onDidChangeContentProviderSchemes.event;
  }
  get onDidChangeSessionOptions() {
    return this._onDidChangeSessionOptions.event;
  }
  get onDidChangeOptionGroups() {
    return this._onDidChangeOptionGroups.event;
  }
  reportInProgress(chatSessionType, count) {
    if (!this._itemControllers.has(chatSessionType)) {
      this._logService.warn(`Attempted to report in-progress status for unknown chat session type '${chatSessionType}'`);
    }
    this.inProgressMap.set(chatSessionType, count);
    this._onDidChangeInProgress.fire();
  }
  getInProgress() {
    return Array.from(this.inProgressMap.entries()).map(([chatSessionType, count]) => ({ chatSessionType, count }));
  }
  async resolveChatSessionItem(chatSessionType, resource, token) {
    const entry = this._itemControllers.get(chatSessionType);
    if (!entry?.controller.resolveChatSessionItem) {
      return void 0;
    }
    return entry.controller.resolveChatSessionItem(resource, token);
  }
  canSetChatSessionItemArchived(sessionResource) {
    return typeof this._getChatSessionItemController(sessionResource)?.controller.setChatSessionItemArchived === "function";
  }
  setChatSessionItemArchived(sessionResource, archived) {
    const controller = this._getChatSessionItemController(sessionResource)?.controller;
    if (!controller?.setChatSessionItemArchived) {
      throw new Error(`Session ${sessionResource.toString()} does not support archiving`);
    }
    controller.setChatSessionItemArchived(sessionResource, archived);
  }
  canSetChatSessionItemRead(sessionResource) {
    return typeof this._getChatSessionItemController(sessionResource)?.controller.setChatSessionItemRead === "function";
  }
  setChatSessionItemRead(sessionResource, isRead) {
    const controller = this._getChatSessionItemController(sessionResource)?.controller;
    if (!controller?.setChatSessionItemRead) {
      throw new Error(`Session ${sessionResource.toString()} does not own read state`);
    }
    controller.setChatSessionItemRead(sessionResource, isRead);
  }
  async updateInProgressStatus(chatSessionType) {
    try {
      const items = [];
      for await (const result of this.getChatSessionItems([chatSessionType], CancellationToken.None)) {
        items.push(...result.items);
      }
      const inProgress = items.filter((item) => !item.archived && item.status && isSessionInProgressStatus(item.status));
      this.reportInProgress(chatSessionType, inProgress.length);
    } catch (error) {
      this._logService.warn(`Failed to update in-progress status for chat session type '${chatSessionType}':`, error);
    }
  }
  registerContribution(contribution, ext) {
    contribution = applyCodexAgentHostPreference(contribution);
    this._logService.trace(`[ChatSessionsService] registerContribution called for type='${contribution.type}', canDelegate=${contribution.canDelegate}, when='${contribution.when}', extension='${ext.identifier.value}'`);
    if (this._contributions.has(contribution.type)) {
      this._logService.trace(`[ChatSessionsService] registerContribution: type='${contribution.type}' already registered, skipping`);
      return Disposable.None;
    }
    if (contribution.when) {
      const whenExpr = ContextKeyExpr.deserialize(contribution.when);
      if (whenExpr) {
        for (const key of whenExpr.keys()) {
          this._contextKeys.add(key);
        }
      }
    }
    this._contributions.set(contribution.type, { contribution, extension: ext });
    if (contribution.alternativeIds) {
      for (const altId of contribution.alternativeIds) {
        if (this._alternativeIdMap.has(altId)) {
          this._logService.warn(`Alternative ID '${altId}' is already mapped to '${this._alternativeIdMap.get(altId)}'. Remapping to '${contribution.type}'.`);
        }
        this._alternativeIdMap.set(altId, contribution.type);
      }
    }
    this._evaluateAvailability();
    return {
      dispose: () => {
        this._contributions.delete(contribution.type);
        if (contribution.alternativeIds) {
          for (const altId of contribution.alternativeIds) {
            if (this._alternativeIdMap.get(altId) === contribution.type) {
              this._alternativeIdMap.delete(altId);
            }
          }
        }
        this._contributionDisposables.deleteAndDispose(contribution.type);
        this._updateHasCanDelegateProvidersContextKey();
      }
    };
  }
  _isContributionAvailable(contribution) {
    if (!contribution.when) {
      return true;
    }
    const whenExpr = ContextKeyExpr.deserialize(contribution.when);
    return !whenExpr || this._contextKeyService.contextMatchesRules(whenExpr);
  }
  /**
   * Type-keyed companion to {@link _isContributionAvailable}. Resolves the
   * session type (including alternative ids) to its contribution and reports
   * whether that contribution is currently enabled by its `when` clause.
   *
   * Session types with no contribution entry (e.g. the built-in `local`
   * provider, or item controllers registered without a matching contribution)
   * are treated as available, since there is no `when` clause gating them.
   */
  _isContributionAvailableForType(sessionType) {
    const primaryType = this._contributions.has(sessionType) ? sessionType : this._alternativeIdMap.get(sessionType);
    const contribution = primaryType ? this._contributions.get(primaryType)?.contribution : void 0;
    return !contribution || this._isContributionAvailable(contribution);
  }
  /**
   * Resolves a session type to its primary type, checking for alternative IDs.
   * @param sessionType The session type or alternative ID to resolve
   * @returns The primary session type, or undefined if not found or not available
   */
  _resolveToPrimaryType(sessionType) {
    const contribution = this._contributions.get(sessionType)?.contribution;
    if (contribution) {
      if (this._isContributionAvailable(contribution)) {
        return sessionType;
      }
    }
    const primaryType = this._alternativeIdMap.get(sessionType);
    if (primaryType) {
      const altContribution = this._contributions.get(primaryType)?.contribution;
      if (altContribution && this._isContributionAvailable(altContribution)) {
        return primaryType;
      }
    }
    return void 0;
  }
  _registerMenuItems(contribution, extensionDescription) {
    const disposables = new DisposableStore();
    if (!contribution.canDelegate) {
      disposables.add(registerNewSessionExternalAction(
        contribution.type,
        contribution.displayName,
        () => this._resolveCreateSubMenuCommandId(contribution.type)
      ));
    }
    const contextKeyService = this._contextKeyService.createOverlay([
      ["chatSessionType", contribution.type]
    ]);
    const rawMenuActions = this._menuService.getMenuActions(MenuId.AgentSessionsCreateSubMenu, contextKeyService);
    const menuActions = rawMenuActions.map((value) => value[1]).flat();
    const menuItemActions = menuActions.filter((action) => action instanceof MenuItemAction);
    const actionsToMirror = contribution.canDelegate ? menuItemActions : menuItemActions.slice(1);
    for (const action of actionsToMirror) {
      disposables.add(MenuRegistry.appendMenuItem(MenuId.ChatNewMenu, {
        command: action.item,
        group: "4_externally_contributed"
      }));
    }
    return {
      dispose: () => disposables.dispose()
    };
  }
  /**
   * Resolves the command id of the primary create action contributed to
   * {@link MenuId.AgentSessionsCreateSubMenu} for the given session type, or
   * `undefined` when no such action is contributed (yet). Read at execution
   * time so it is unaffected by the ordering of extension menu registration.
   */
  _resolveCreateSubMenuCommandId(type) {
    const contextKeyService = this._contextKeyService.createOverlay([
      ["chatSessionType", type]
    ]);
    const rawMenuActions = this._menuService.getMenuActions(MenuId.AgentSessionsCreateSubMenu, contextKeyService);
    const menuActions = rawMenuActions.map((value) => value[1]).flat();
    for (const action of menuActions) {
      if (action instanceof MenuItemAction) {
        return action.item.id;
      }
    }
    return void 0;
  }
  _registerCommands(contribution) {
    const isAvailableInSessionTypePicker = isAgentSessionProviderType(contribution.type);
    return combinedDisposable(
      registerAction2(class OpenChatSessionAction extends Action2 {
        constructor() {
          super({
            id: `workbench.action.chat.openSessionWithPrompt.${contribution.type}`,
            title: localize2("interactiveSession.openSessionWithPrompt", "New {0} with Prompt", contribution.displayName),
            category: CHAT_CATEGORY,
            icon: Codicon.plus,
            f1: false,
            precondition: ChatContextKeys.enabled
          });
        }
        async run(accessor, chatOptions) {
          const chatService = accessor.get(IChatService);
          const customizationHarnessService = accessor.get(ICustomizationHarnessService);
          const toolsService = accessor.get(ILanguageModelToolsService);
          const { type } = contribution;
          if (chatOptions) {
            let attachedContext = chatOptions.attachedContext;
            const sessionResource = URI.revive(chatOptions.resource);
            const ref = await chatService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None, "ChatSessionsContribution#sendPrompt");
            try {
              const promptFile = await resolvePromptSlashCommand(chatOptions.prompt, sessionResource, customizationHarnessService, toolsService);
              if (promptFile) {
                attachedContext = [promptFile, ...attachedContext ?? []];
              }
              const result = await chatService.sendRequest(sessionResource, chatOptions.prompt, { agentIdSilent: type, attachedContext });
              if (result.kind === "queued") {
                await result.deferred;
              } else if (result.kind === "sent") {
                await result.data.responseCompletePromise;
              }
            } finally {
              ref?.dispose();
            }
          }
        }
      }),
      // Creates a chat editor
      registerAction2(class OpenNewChatSessionEditorAction extends Action2 {
        constructor() {
          super({
            id: `workbench.action.chat.openNewSessionEditor.${contribution.type}`,
            title: localize2("interactiveSession.openNewSessionEditor", "New {0} Session", contribution.displayName),
            category: CHAT_CATEGORY,
            icon: Codicon.plus,
            f1: true,
            precondition: ChatContextKeys.enabled
          });
        }
        async run(accessor, chatOptions) {
          const { type, displayName } = contribution;
          await openChatSession(accessor, { type, displayName, position: "editor" /* Editor */ }, chatOptions);
        }
      }),
      // New chat in sidebar chat (+ button)
      registerAction2(class OpenNewChatSessionSidebarAction extends Action2 {
        constructor() {
          super({
            id: `workbench.action.chat.openNewSessionSidebar.${contribution.type}`,
            title: localize2("interactiveSession.openNewSessionSidebar", "New {0} Session", contribution.displayName),
            category: CHAT_CATEGORY,
            icon: Codicon.plus,
            f1: false,
            // Hide from Command Palette
            precondition: ChatContextKeys.enabled,
            menu: !isAvailableInSessionTypePicker ? {
              id: MenuId.ChatNewMenu,
              group: "3_new_special"
            } : void 0
          });
        }
        async run(accessor, chatOptions) {
          const { type, displayName } = contribution;
          await openChatSession(accessor, { type, displayName, position: "sidebar" /* Sidebar */ }, chatOptions);
        }
      })
    );
  }
  _evaluateAvailability() {
    const newlyEnabledChatSessionTypes = /* @__PURE__ */ new Set();
    const newlyDisabledChatSessionTypes = /* @__PURE__ */ new Set();
    const disposedChatSessions = new ResourceSet();
    for (const { contribution, extension } of this._contributions.values()) {
      const isCurrentlyRegistered = this._contributionDisposables.has(contribution.type);
      const shouldBeRegistered = this._isContributionAvailable(contribution);
      this._logService.trace(`[ChatSessionsService] _evaluateAvailability: type='${contribution.type}', isCurrentlyRegistered=${isCurrentlyRegistered}, shouldBeRegistered=${shouldBeRegistered}, when='${contribution.when}'`);
      if (isCurrentlyRegistered && !shouldBeRegistered) {
        this._contributionDisposables.deleteAndDispose(contribution.type);
        for (const sessionResource of this._disposeSessionsForContribution(contribution.type)) {
          disposedChatSessions.add(sessionResource);
        }
        newlyDisabledChatSessionTypes.add(contribution.type);
      } else if (!isCurrentlyRegistered && shouldBeRegistered) {
        if (extension) {
          this._enableContribution(contribution, extension);
        }
        newlyEnabledChatSessionTypes.add(contribution.type);
      }
    }
    if (newlyEnabledChatSessionTypes.size > 0 || newlyDisabledChatSessionTypes.size > 0) {
      this._onDidChangeAvailability.fire();
      for (const chatSessionType of [...newlyEnabledChatSessionTypes, ...newlyDisabledChatSessionTypes]) {
        this._onDidChangeItemsProviders.fire({ chatSessionType });
      }
      if (disposedChatSessions.size > 0) {
        this._onDidChangeSessionItems.fire({ removed: Array.from(disposedChatSessions) });
      }
    }
    this._updateHasCanDelegateProvidersContextKey();
  }
  _enableContribution(contribution, ext) {
    this._logService.trace(`[ChatSessionsService] _enableContribution: type='${contribution.type}', canDelegate=${contribution.canDelegate}`);
    const disposableStore = new DisposableStore();
    this._contributionDisposables.set(contribution.type, disposableStore);
    if (contribution.canDelegate) {
      disposableStore.add(this._registerAgent(contribution, ext));
      disposableStore.add(this._registerCommands(contribution));
    }
    disposableStore.add(this._registerMenuItems(contribution, ext));
  }
  /**
   * Disposes of all sessions that belong to a contribution
   *
   * @returns List of session resources that were disposed.
   */
  _disposeSessionsForContribution(contributionId) {
    const sessionsToDispose = [];
    for (const [sessionResource, sessionData] of this._sessions) {
      if (sessionData.chatSessionType === contributionId) {
        sessionsToDispose.push(sessionResource);
      }
    }
    if (sessionsToDispose.length > 0) {
      this._logService.info(`Disposing ${sessionsToDispose.length} cached sessions for contribution '${contributionId}' due to when clause change`);
    }
    for (const sessionKey of sessionsToDispose) {
      const sessionData = this._sessions.get(sessionKey);
      if (sessionData) {
        sessionData.dispose();
      }
    }
    return sessionsToDispose;
  }
  _registerAgent(contribution, ext) {
    const storedIcon = this.getContributionIcon(ext, contribution);
    const icons = ThemeIcon.isThemeIcon(storedIcon) ? { themeIcon: storedIcon, icon: void 0, iconDark: void 0 } : storedIcon ? { icon: storedIcon.light, iconDark: storedIcon.dark } : { themeIcon: Codicon.sendToRemoteAgent };
    const id = contribution.type;
    const agentData = {
      id,
      name: contribution.name,
      fullName: contribution.displayName,
      description: contribution.description,
      isDefault: false,
      isCore: false,
      isDynamic: true,
      slashCommands: contribution.commands ?? [],
      locations: [ChatAgentLocation.Chat],
      modes: [ChatModeKind.Agent, ChatModeKind.Ask],
      disambiguation: [],
      metadata: {
        ...icons
      },
      capabilities: contribution.capabilities,
      canAccessPreviousChatHistory: true,
      extensionId: ext.identifier,
      extensionVersion: ext.version,
      extensionDisplayName: ext.displayName || ext.name,
      extensionPublisherId: ext.publisher
    };
    return this._chatAgentService.registerAgent(id, agentData);
  }
  getAllChatSessionContributions() {
    return Array.from(this._contributions.values()).filter((entry) => this._isContributionAvailable(entry.contribution)).map((entry) => this.resolveChatSessionContribution(entry.extension, entry.contribution));
  }
  _updateHasCanDelegateProvidersContextKey() {
    const hasCanDelegate = this.getAllChatSessionContributions().filter((c) => c.canDelegate);
    const canDelegateEnabled = hasCanDelegate.length > 0;
    this._logService.trace(`[ChatSessionsService] hasCanDelegateProvidersAvailable=${canDelegateEnabled} (${hasCanDelegate.map((c) => c.type).join(", ")})`);
    this._hasCanDelegateProvidersKey.set(canDelegateEnabled);
  }
  getChatSessionContribution(chatSessionType) {
    const entry = this._contributions.get(chatSessionType);
    if (!entry) {
      return void 0;
    }
    if (!this._isContributionAvailable(entry.contribution)) {
      return void 0;
    }
    return this.resolveChatSessionContribution(entry.extension, entry.contribution);
  }
  resolveChatSessionContribution(ext, contribution) {
    return {
      ...contribution,
      icon: this.resolveIconForCurrentColorTheme(this.getContributionIcon(ext, contribution))
    };
  }
  getContributionIcon(ext, contribution) {
    if (!contribution.icon) {
      return void 0;
    }
    if (typeof contribution.icon === "string") {
      return contribution.icon.startsWith("$(") && contribution.icon.endsWith(")") ? ThemeIcon.fromString(contribution.icon) : ThemeIcon.fromId(contribution.icon);
    }
    return {
      dark: ext ? resources.joinPath(ext.extensionLocation, contribution.icon.dark) : URI.parse(contribution.icon.dark),
      light: ext ? resources.joinPath(ext.extensionLocation, contribution.icon.light) : URI.parse(contribution.icon.light)
    };
  }
  resolveIconForCurrentColorTheme(rawIcon) {
    if (!rawIcon) {
      return void 0;
    }
    if (ThemeIcon.isThemeIcon(rawIcon)) {
      return rawIcon;
    } else if (isDark(this._themeService.getColorTheme().type)) {
      return rawIcon.dark;
    } else {
      return rawIcon.light;
    }
  }
  registerChatSessionContribution(contribution) {
    if (this._contributions.has(contribution.type)) {
      return { dispose: () => {
      } };
    }
    this._contributions.set(contribution.type, { contribution, extension: void 0 });
    this._contributionDisposables.set(contribution.type, new DisposableStore());
    this._updateHasCanDelegateProvidersContextKey();
    this._onDidChangeAvailability.fire();
    return toDisposable(() => {
      this._contributions.delete(contribution.type);
      this._contributionDisposables.deleteAndDispose(contribution.type);
      this._updateHasCanDelegateProvidersContextKey();
      this._onDidChangeAvailability.fire();
    });
  }
  async activateChatSessionItemProvider(chatViewType) {
    await this.doActivateChatSessionItemController(chatViewType);
  }
  async doActivateChatSessionItemController(chatViewType) {
    await this._extensionService.whenInstalledExtensionsRegistered();
    const resolvedType = this._resolveToPrimaryType(chatViewType);
    if (resolvedType) {
      chatViewType = resolvedType;
    }
    if (!this._isContributionAvailableForType(chatViewType)) {
      return false;
    }
    if (this._itemControllers.has(chatViewType)) {
      return true;
    }
    await this._extensionService.activateByEvent(`onChatSession:${chatViewType}`);
    const controller = this._itemControllers.get(chatViewType);
    return !!controller;
  }
  async canResolveChatSession(sessionType) {
    await this._extensionService.whenInstalledExtensionsRegistered();
    if (!this._isContributionAvailableForType(sessionType)) {
      return false;
    }
    if (this._contentProviders.has(sessionType)) {
      return true;
    }
    const asyncActivators = this._asyncActivationRegistry.getActivators(sessionType);
    if (asyncActivators.length) {
      for (const activator of asyncActivators) {
        if (await this._instantiationService.invokeFunction((accessor) => activator.waitForActivation(accessor, sessionType))) {
          await this.waitForContentProvider(sessionType);
          if (this._contentProviders.has(sessionType)) {
            return true;
          }
        }
      }
      return false;
    }
    await this._extensionService.activateByEvent(`onChatSession:${sessionType}`);
    return this._contentProviders.has(sessionType);
  }
  async waitForContentProvider(sessionType) {
    if (this._contentProviders.has(sessionType)) {
      return;
    }
    await Event.toPromise(Event.filter(this.onDidChangeContentProviderSchemes, (e) => e.added.includes(sessionType)));
  }
  async provideChatInputCompletions(sessionResource, params, token) {
    const sessionType = getChatSessionType(sessionResource);
    const resolvedType = this._resolveToPrimaryType(sessionType) || sessionType;
    const provider = this._contentProviders.get(resolvedType);
    if (!provider?.provideChatInputCompletions) {
      return void 0;
    }
    return provider.provideChatInputCompletions(sessionResource, params, token);
  }
  resolveChatResponseUri(sessionResource, href, kind) {
    const sessionType = getChatSessionType(sessionResource);
    const resolvedType = this._resolveToPrimaryType(sessionType) || sessionType;
    return this._contentProviders.get(resolvedType)?.resolveChatResponseUri?.(sessionResource, href, kind) ?? href;
  }
  async getChatInputCompletionTriggerCharacters(sessionType) {
    const resolvedType = this._resolveToPrimaryType(sessionType) || sessionType;
    const provider = this._contentProviders.get(resolvedType);
    if (!provider) {
      return void 0;
    }
    if (!provider.provideChatInputCompletionTriggerCharacters) {
      return [];
    }
    return provider.provideChatInputCompletionTriggerCharacters();
  }
  async tryActivateControllers(providersToResolve) {
    await Promise.all(this.getAllChatSessionContributions().map(async (contrib) => {
      if (providersToResolve && !providersToResolve.includes(contrib.type)) {
        return;
      }
      if (!await this.doActivateChatSessionItemController(contrib.type)) {
        if (providersToResolve?.includes(contrib.type)) {
          this._logService.trace(`[ChatSessionsService] No enabled provider found for chat session type ${contrib.type}`);
        }
      }
    }));
  }
  getChatSessionItems(providersToResolve, token) {
    return new AsyncIterableProducer(async (writer) => {
      await raceCancellationError(this.tryActivateControllers(providersToResolve), token);
      await Promise.all(Array.from(this._itemControllers, async ([chatSessionType, controllerEntry]) => {
        const resolvedType = this._resolveToPrimaryType(chatSessionType) ?? chatSessionType;
        if (providersToResolve && !providersToResolve.includes(resolvedType)) {
          return;
        }
        if (!this._isContributionAvailableForType(chatSessionType)) {
          return;
        }
        try {
          await raceCancellationError(controllerEntry.initialRefresh, token);
          const providerSessions = controllerEntry.controller.items;
          this._logService.trace(`[ChatSessionsService] Resolved ${providerSessions.length} sessions for provider ${resolvedType}`);
          writer.emitOne({ chatSessionType: resolvedType, items: providerSessions });
        } catch (err) {
          if (!isCancellationError(err)) {
            this._logService.error(`[ChatSessionsService] Failed to resolve sessions for provider ${resolvedType}`, err);
          }
        }
      }));
    });
  }
  async refreshChatSessionItems(providersToResolve, token) {
    await this.tryActivateControllers(providersToResolve);
    await Promise.all(Array.from(this._itemControllers).map(async ([chatSessionType, controllerEntry]) => {
      const resolvedType = this._resolveToPrimaryType(chatSessionType) ?? chatSessionType;
      if (providersToResolve && !providersToResolve.includes(resolvedType)) {
        return;
      }
      try {
        await controllerEntry.controller.refresh(token);
      } catch (err) {
        if (!isCancellationError(err)) {
          this._logService.error(`[ChatSessionsService] Failed to resolve sessions for provider ${resolvedType}`, err);
        }
      }
    }));
  }
  getRegisteredChatSessionItemProviders() {
    return [...new Set(Array.from(this._itemControllers.keys()).map((key) => this._resolveToPrimaryType(key) ?? key))];
  }
  registerChatSessionItemController(chatSessionType, controller) {
    const disposables = new DisposableStore();
    const initialRefreshCts = disposables.add(new CancellationTokenSource());
    this._itemControllers.set(chatSessionType, { controller, initialRefresh: controller.refresh(initialRefreshCts.token) });
    this._onDidChangeItemsProviders.fire({ chatSessionType });
    disposables.add(controller.onDidChangeChatSessionItems((e) => {
      this._onDidChangeSessionItems.fire(e);
      this.updateInProgressStatus(chatSessionType);
    }));
    return {
      dispose: () => {
        initialRefreshCts.cancel();
        disposables.dispose();
        const controller2 = this._itemControllers.get(chatSessionType);
        if (controller2) {
          this._itemControllers.delete(chatSessionType);
          this._onDidChangeItemsProviders.fire({ chatSessionType });
        }
        this.updateInProgressStatus(chatSessionType);
      }
    };
  }
  registerChatSessionContentProvider(chatSessionType, provider) {
    if (this._contentProviders.has(chatSessionType)) {
      throw new Error(`Content provider for ${chatSessionType} is already registered.`);
    }
    this._contentProviders.set(chatSessionType, provider);
    this._onDidChangeContentProviderSchemes.fire({ added: [chatSessionType], removed: [] });
    return {
      dispose: () => {
        this._contentProviders.delete(chatSessionType);
        this._onDidChangeContentProviderSchemes.fire({ added: [], removed: [chatSessionType] });
        for (const [key, session] of this._sessions) {
          if (session.chatSessionType === chatSessionType) {
            session.dispose();
            this._sessions.delete(key);
          }
        }
      }
    };
  }
  registerCustomizationsProvider(chatSessionType, provider) {
    this._customizationsProviders.set(chatSessionType, provider);
    const onChangeDisposable = provider.onDidChangeCustomizations(() => {
      this._onDidChangeCustomizations.fire({ chatSessionType });
    });
    return toDisposable(() => {
      onChangeDisposable.dispose();
      if (this._customizationsProviders.get(chatSessionType) === provider) {
        this._customizationsProviders.delete(chatSessionType);
      }
    });
  }
  hasCustomizationsProvider(chatSessionType) {
    return this._customizationsProviders.has(chatSessionType);
  }
  async getCustomizations(chatSessionType, token) {
    const provider = this._customizationsProviders.get(chatSessionType);
    if (!provider) {
      return void 0;
    }
    return provider.provideCustomizations(token);
  }
  async createNewChatSessionItem(chatSessionType, request, token) {
    const controllerData = this._itemControllers.get(chatSessionType);
    if (!controllerData) {
      return void 0;
    }
    await controllerData.initialRefresh;
    return controllerData.controller.newChatSessionItem?.(request, token);
  }
  async deleteChatSessionItem(sessionResource, token) {
    const controllerData = this._getChatSessionItemController(sessionResource);
    if (!controllerData?.controller.deleteChatSessionItem) {
      throw new Error(`Session ${sessionResource.toString()} does not support deletion`);
    }
    await controllerData.initialRefresh;
    return controllerData.controller.deleteChatSessionItem(sessionResource, token);
  }
  _getChatSessionItemController(sessionResource) {
    const sessionType = getChatSessionType(sessionResource);
    const resolvedType = this._resolveToPrimaryType(sessionType) ?? sessionType;
    return this._itemControllers.get(resolvedType);
  }
  async getOrCreateChatSession(sessionResource, token) {
    {
      const existingSessionData = this._sessions.get(sessionResource);
      if (existingSessionData) {
        return existingSessionData.session;
      }
    }
    const sessionType = getChatSessionType(sessionResource);
    if (!await raceCancellationError(this.canResolveChatSession(sessionType), token)) {
      throw Error(`Cannot find provider '${sessionType}'`);
    }
    {
      const existingSessionData = this._sessions.get(sessionResource);
      if (existingSessionData) {
        return existingSessionData.session;
      }
    }
    const resolvedType = this._resolveToPrimaryType(sessionType) || sessionType;
    const provider = this._contentProviders.get(resolvedType);
    if (!provider) {
      throw Error(`Cannot find provider '${resolvedType}'`);
    }
    let session;
    const newSessionOptionGroups = isUntitledChatSession(sessionResource) ? await this.getNewChatSessionInputState(resolvedType, sessionResource) : void 0;
    if (isUntitledChatSession(sessionResource) && (newSessionOptionGroups || resolvedType.startsWith("agent-host-"))) {
      const options = /* @__PURE__ */ new Map();
      for (const group of newSessionOptionGroups ?? []) {
        const selected = group.selected ?? group.items.find((item) => item.default) ?? group.items[0];
        if (selected) {
          options.set(group.id, selected);
        }
      }
      session = {
        sessionResource,
        onWillDispose: Event.None,
        history: [],
        options: options.size > 0 ? options : void 0,
        dispose: () => {
        }
      };
    } else {
      session = await raceCancellationError(provider.provideChatSessionContent(sessionResource, token), token);
    }
    if (session.options) {
      for (const [optionId, value] of session.options) {
        this.setSessionOption(sessionResource, optionId, value);
      }
    }
    {
      const existingSessionData = this._sessions.get(sessionResource);
      if (existingSessionData) {
        return existingSessionData.session;
      }
    }
    const sessionData = new ContributedChatSessionData(session, sessionType, sessionResource, session.options, (resource) => {
      sessionData.dispose();
      this._sessions.delete(resource);
    });
    this._sessions.set(sessionResource, sessionData);
    if (session.options) {
      this._onDidChangeSessionOptions.fire({ sessionResource, updates: session.options });
    }
    return session;
  }
  hasAnySessionOptions(sessionResource) {
    const session = this._sessions.get(this._resolveResource(sessionResource));
    return !!session && !!session.options && session.options.size > 0;
  }
  getSessionOptions(sessionResource) {
    const session = this._sessions.get(this._resolveResource(sessionResource));
    if (!session) {
      return void 0;
    }
    const result = /* @__PURE__ */ new Map();
    for (const [key, value] of session.getAllOptions()) {
      result.set(key, typeof value === "string" ? value : value.id);
    }
    return result.size > 0 ? result : void 0;
  }
  getSessionOption(sessionResource, optionId) {
    const session = this._sessions.get(this._resolveResource(sessionResource));
    return session?.getOption(optionId);
  }
  setSessionOption(sessionResource, optionId, value) {
    return this.updateSessionOptions(sessionResource, /* @__PURE__ */ new Map([[optionId, value]]));
  }
  updateSessionOptions(sessionResource, updates) {
    const session = this._sessions.get(this._resolveResource(sessionResource));
    if (!session) {
      return false;
    }
    let didChange = false;
    for (const [optionId, value] of updates) {
      const existingValue = session.getOption(optionId);
      if (existingValue !== value) {
        session.setOption(optionId, value);
        didChange = true;
      }
    }
    if (didChange) {
      this._onDidChangeSessionOptions.fire({ sessionResource, updates });
    }
    return didChange;
  }
  /**
   * Resolve a resource through the alias map. If the resource is a real
   * resource that has been aliased to an untitled resource, return the
   * untitled resource (the canonical key in {@link _sessions}).
   */
  _resolveResource(resource) {
    return this._resourceAliases.get(resource) ?? resource;
  }
  registerSessionResourceAlias(untitledResource, realResource) {
    this._resourceAliases.set(realResource, untitledResource);
  }
  setMaterializedSessionResource(untitledResource, realResource) {
    this._realResources.set(untitledResource, realResource);
  }
  getMaterializedSessionResource(untitledResource) {
    return this._realResources.get(untitledResource);
  }
  clearMaterializedSessionResource(sessionResource) {
    this._realResources.delete(sessionResource);
    const untitled = this._resourceAliases.get(sessionResource);
    if (untitled) {
      this._realResources.delete(untitled);
    }
  }
  fireSessionCommitted(original, committed) {
    this._onDidCommitSession.fire({ original, committed });
  }
  /**
   * Store option groups for a session type
   */
  setOptionGroupsForSessionType(chatSessionType, handle, optionGroups) {
    if (optionGroups) {
      this._sessionTypeOptions.set(chatSessionType, optionGroups);
    } else {
      this._sessionTypeOptions.delete(chatSessionType);
    }
    this._onDidChangeOptionGroups.fire(chatSessionType);
  }
  /**
   * Get available option groups for a session type
   */
  getOptionGroupsForSessionType(chatSessionType) {
    return this._sessionTypeOptions.get(chatSessionType);
  }
  async getNewChatSessionInputState(chatSessionType, sessionResource) {
    const controllerData = this._itemControllers.get(chatSessionType);
    if (controllerData?.controller.getNewChatSessionInputState) {
      const groups2 = await controllerData.controller.getNewChatSessionInputState(sessionResource, CancellationToken.None);
      if (groups2?.length) {
        this._sessionTypeOptions.set(chatSessionType, [...groups2]);
        this._onDidChangeOptionGroups.fire(chatSessionType);
      }
      return groups2;
    }
    const groups = this._sessionTypeOptions.get(chatSessionType);
    if (!groups?.length) {
      return void 0;
    }
    return groups;
  }
  /**
   * Get the capabilities for a specific session type
   */
  getCapabilitiesForSessionType(chatSessionType) {
    const contribution = this._contributions.get(chatSessionType)?.contribution;
    return contribution?.capabilities;
  }
  /**
   * Get the customAgentTarget for a specific session type.
   * When set, the mode picker should show filtered custom agents matching this target.
   */
  getCustomAgentTargetForSessionType(chatSessionType) {
    const contribution = this._contributions.get(chatSessionType)?.contribution;
    return contribution?.customAgentTarget ?? Target.Undefined;
  }
  requiresCustomModelsForSessionType(chatSessionType) {
    const contribution = this._contributions.get(chatSessionType)?.contribution;
    return !!contribution?.requiresCustomModels;
  }
  supportsAutoModelForSessionType(chatSessionType) {
    if (chatSessionType === localChatSessionType) {
      return true;
    }
    const contribution = this._contributions.get(chatSessionType)?.contribution;
    return !!contribution?.supportsAutoModel;
  }
  supportsDelegationForSessionType(chatSessionType) {
    const contribution = this._contributions.get(chatSessionType)?.contribution;
    return contribution?.supportsDelegation !== false;
  }
  requiresCopilotSignInForSessionType(chatSessionType) {
    const contribution = this._contributions.get(chatSessionType)?.contribution;
    return !!contribution?.requiresCopilotSignIn;
  }
  sessionSupportsFork(sessionResource) {
    const session = this._sessions.get(sessionResource) ?? this._sessions.get(this._resolveResource(sessionResource));
    return !!session?.session.forkSession;
  }
  async forkChatSession(sessionResource, request, token) {
    const session = this._sessions.get(sessionResource) ?? this._sessions.get(this._resolveResource(sessionResource));
    if (!session?.session.forkSession) {
      throw new Error(`Session ${sessionResource.toString()} does not support forking`);
    }
    return session.session.forkSession(request, token);
  }
  sessionSupportsRename(sessionResource) {
    const session = this._sessions.get(sessionResource) ?? this._sessions.get(this._resolveResource(sessionResource));
    return !!session?.session.renameSession;
  }
  async renameChatSession(sessionResource, title, token) {
    const session = await this.getOrCreateChatSession(sessionResource, token);
    if (!session.renameSession) {
      throw new Error(`Session ${sessionResource.toString()} does not support renaming`);
    }
    return session.renameSession(title, token);
  }
  getContentProviderSchemes() {
    return Array.from(this._contentProviders.keys());
  }
};
ChatSessionsService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IChatAgentService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IMenuService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, IInstantiationService)
], ChatSessionsService);
registerSingleton(IChatSessionsService, ChatSessionsService, InstantiationType.Delayed);
function registerNewSessionInPlaceAction(type, displayName) {
  return registerAction2(class NewChatSessionInPlaceAction extends Action2 {
    constructor() {
      super({
        id: `workbench.action.chat.openNewChatSessionInPlace.${type}`,
        title: localize2("interactiveSession.openNewChatSessionInPlace", "New {0} Session", displayName),
        category: CHAT_CATEGORY,
        f1: false,
        precondition: ChatContextKeys.enabled
      });
    }
    // Expected args: [chatSessionPosition: 'sidebar' | 'editor']
    async run(accessor, ...args) {
      if (args.length === 0) {
        throw new BugIndicatingError("Expected chat session position argument");
      }
      const chatSessionPosition = args[0];
      if (chatSessionPosition !== "sidebar" /* Sidebar */ && chatSessionPosition !== "editor" /* Editor */) {
        throw new BugIndicatingError(`Invalid chat session position argument: ${chatSessionPosition}`);
      }
      const activeEditor = accessor.get(IEditorGroupsService).activeGroup.activeEditor;
      const replaceEditorForResource = activeEditor instanceof ChatEditorInput ? activeEditor.sessionResource : void 0;
      await openChatSession(accessor, { type, displayName: localize("chat", "Chat"), position: chatSessionPosition, replaceEditorForResource });
    }
  });
}
function registerNewSessionExternalAction(type, displayName, resolveCommandId) {
  return registerAction2(class NewChatSessionExternalAction extends Action2 {
    constructor() {
      super({
        id: `workbench.action.chat.openNewChatSessionExternal.${type}`,
        title: localize2("interactiveSession.openNewChatSessionExternal", "New {0} Session", displayName),
        category: CHAT_CATEGORY,
        f1: false,
        precondition: ChatContextKeys.enabled
      });
    }
    async run(accessor) {
      const commandService = accessor.get(ICommandService);
      const logService = accessor.get(ILogService);
      const commandId = resolveCommandId();
      if (!commandId) {
        logService.warn(`[ChatSessionsService] No create command contributed to '${MenuId.AgentSessionsCreateSubMenu.id}' for chat session type '${type}'; cannot open a new session.`);
        return;
      }
      await commandService.executeCommand(commandId);
    }
  });
}
var ChatSessionPosition = /* @__PURE__ */ ((ChatSessionPosition2) => {
  ChatSessionPosition2["Editor"] = "editor";
  ChatSessionPosition2["Sidebar"] = "sidebar";
  return ChatSessionPosition2;
})(ChatSessionPosition || {});
async function openChatSession(accessor, openOptions, chatSendOptions) {
  const viewsService = accessor.get(IViewsService);
  const chatService = accessor.get(IChatService);
  const chatSessionService = accessor.get(IChatSessionsService);
  const logService = accessor.get(ILogService);
  const editorGroupService = accessor.get(IEditorGroupsService);
  const editorService = accessor.get(IEditorService);
  const customizationHarnessService = accessor.get(ICustomizationHarnessService);
  const toolsService = accessor.get(ILanguageModelToolsService);
  const importConversationStore = accessor.get(IAgentHostImportConversationStore);
  const progressService = accessor.get(IProgressService);
  const sessionResource = getResourceForNewChatSession(openOptions);
  if (chatSendOptions?.importConversation && chatSendOptions.importConversation.turns.length > 0) {
    importConversationStore.set(sessionResource, chatSendOptions.importConversation);
  }
  let sessionsListSuppression;
  let transitionProgress;
  try {
    switch (openOptions.position) {
      case "sidebar" /* Sidebar */: {
        const view = await viewsService.openView(ChatViewId);
        if (chatSendOptions?.importConversation) {
          sessionsListSuppression = view.beginSessionsListSuppression();
          transitionProgress = new DeferredPromise();
          progressService.withProgress({ location: ChatViewId }, () => transitionProgress.p);
        }
        if (openOptions.type === AgentSessionProviders.Local) {
          await view.startNewLocalSession();
        } else {
          await view.loadSession(sessionResource);
        }
        view.focus();
        break;
      }
      case "editor" /* Editor */: {
        const options = {
          override: ChatEditorInput.EditorID,
          pinned: true,
          ...openOptions.type === AgentSessionProviders.Local ? { explicitSessionType: localChatSessionType } : {},
          title: {
            fallback: localize("chatEditorContributionName", "{0}", openOptions.displayName)
          }
        };
        if (openOptions.replaceEditorForResource) {
          const sourceResource = openOptions.replaceEditorForResource;
          let replaced = false;
          for (const group of editorGroupService.groups) {
            const editor = group.editors.find((e) => e instanceof ChatEditorInput && resources.isEqual(e.sessionResource, sourceResource));
            if (editor) {
              await editorService.replaceEditors([{ editor, replacement: { resource: sessionResource, options } }], group);
              replaced = true;
              break;
            }
          }
          if (!replaced) {
            await editorService.openEditor({ resource: sessionResource, options });
          }
        } else {
          await editorService.openEditor({ resource: sessionResource, options });
        }
        break;
      }
      default:
        assertNever(openOptions.position, `Unknown chat session position: ${openOptions.position}`);
    }
  } catch (e) {
    logService.error(`Failed to open '${openOptions.type}' chat session with openOptions: ${JSON.stringify(openOptions)}`, e);
    sessionsListSuppression?.dispose();
    transitionProgress?.complete();
    return;
  }
  if (chatSendOptions) {
    try {
      if (chatSendOptions.initialSessionOptions) {
        chatSessionService.updateSessionOptions(sessionResource, normalizeSessionOptions(chatSendOptions.initialSessionOptions));
      }
      let attachedContext = chatSendOptions.attachedContext;
      const promptFile = await resolvePromptSlashCommand(chatSendOptions.prompt, sessionResource, customizationHarnessService, toolsService);
      if (promptFile) {
        attachedContext = [promptFile, ...attachedContext ?? []];
      }
      const result = await chatService.sendRequest(sessionResource, chatSendOptions.prompt, { agentIdSilent: openOptions.type, attachedContext });
      const newSessionResource = result.kind === "sent" || result.kind === "rejected" ? result.newSessionResource : void 0;
      if (newSessionResource && !resources.isEqual(newSessionResource, sessionResource)) {
        switch (openOptions.position) {
          case "sidebar" /* Sidebar */: {
            const view = await viewsService.openView(ChatViewId);
            await view.loadSession(newSessionResource);
            break;
          }
          case "editor" /* Editor */: {
            for (const group of editorGroupService.groups) {
              const editor = group.editors.find((e) => e instanceof ChatEditorInput && resources.isEqual(e.sessionResource, sessionResource));
              if (editor) {
                await editorService.replaceEditors([{ editor, replacement: { resource: newSessionResource, options: { override: ChatEditorInput.EditorID, pinned: true } } }], group);
                break;
              }
            }
            break;
          }
          default:
            assertNever(openOptions.position, `Unknown chat session position: ${openOptions.position}`);
        }
      }
    } catch (e) {
      logService.error(`Failed to send initial request to '${openOptions.type}' chat session with contextOptions: ${JSON.stringify(chatSendOptions)}`, e);
    }
  }
  sessionsListSuppression?.dispose();
  transitionProgress?.complete();
}
function normalizeSessionOptions(options) {
  if (options instanceof Map) {
    return options;
  }
  if (Array.isArray(options)) {
    return new Map(options.map((o) => [o.optionId, o.value]));
  }
  return ChatSessionOptionsMap.fromRecord(options);
}
async function resolvePromptSlashCommand(prompt, sessionResource, customizationHarnessService, toolsService) {
  const slashMatch = prompt.match(slashReg);
  if (slashMatch) {
    const slashCommand = await customizationHarnessService.resolvePromptSlashCommand(slashMatch[1], sessionResource, CancellationToken.None);
    if (slashCommand) {
      const parseResult = slashCommand.parsedPromptFile;
      const refs = parseResult.body?.variableReferences.map(({ name, offset, fullLength }) => ({ name, range: new OffsetRange(offset, offset + fullLength) })) ?? [];
      const toolReferences = toolsService.toToolReferences(refs);
      return toPromptFileVariableEntry(parseResult.uri, PromptFileVariableKind.PromptFile, void 0, true, toolReferences);
    }
  }
  return void 0;
}
function getResourceForNewChatSession(options) {
  const isRemoteSession = options.type !== AgentSessionProviders.Local;
  if (isRemoteSession) {
    return URI.from({
      scheme: options.type,
      path: `/untitled-${generateUuid()}`
    });
  }
  const isEditorPosition = options.position === "editor" /* Editor */;
  if (isEditorPosition) {
    return ChatEditorInput.getNewEditorUri();
  }
  return LocalChatSessionUri.getNewSessionUri();
}
function isAgentSessionProviderType(type) {
  return Object.values(AgentSessionProviders).includes(type);
}
function getSessionStatusForModel(model) {
  if (model.requestInProgress.get()) {
    return ChatSessionStatus.InProgress;
  }
  const lastRequest = model.getRequests().at(-1);
  if (lastRequest?.response) {
    if (lastRequest.response.state === ResponseModelState.NeedsInput) {
      return ChatSessionStatus.NeedsInput;
    } else if (lastRequest.response.isCanceled || lastRequest.response.result?.errorDetails?.code === "canceled") {
      return ChatSessionStatus.Completed;
    } else if (lastRequest.response.result?.errorDetails) {
      return ChatSessionStatus.Failed;
    } else if (lastRequest.response.isComplete) {
      return ChatSessionStatus.Completed;
    } else {
      return ChatSessionStatus.InProgress;
    }
  }
  return void 0;
}
function chatResponseStateToSessionStatus(state) {
  switch (state) {
    case ResponseModelState.Cancelled:
    case ResponseModelState.Complete:
      return ChatSessionStatus.Completed;
    case ResponseModelState.Failed:
      return ChatSessionStatus.Failed;
    case ResponseModelState.Pending:
      return ChatSessionStatus.InProgress;
    case ResponseModelState.NeedsInput:
      return ChatSessionStatus.NeedsInput;
  }
}
export {
  ChatSessionPosition,
  ChatSessionsService,
  applyCodexAgentHostPreference,
  chatResponseStateToSessionStatus,
  getResourceForNewChatSession,
  getSessionStatusForModel,
  openChatSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U2Vzc2lvbnMvY2hhdFNlc3Npb25zLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHNlcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgQXN5bmNJdGVyYWJsZVByb2R1Y2VyLCBEZWZlcnJlZFByb21pc2UsIHJhY2VDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjb21iaW5lZERpc3Bvc2FibGUsIERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCwgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0ICogYXMgcmVzb3VyY2VzIGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgSU1lbnVTZXJ2aWNlLCBNZW51SWQsIE1lbnVJdGVtQWN0aW9uLCBNZW51UmVnaXN0cnksIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElSZWxheGVkRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBpc0RhcmsgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UsIGlzUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRvcklucHV0IH0gZnJvbSAnLi4vd2lkZ2V0SG9zdHMvZWRpdG9yL2NoYXRFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50QXR0YWNobWVudENhcGFiaWxpdGllcywgSUNoYXRBZ2VudERhdGEsIElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDaGF0U2Vzc2lvbk9wdGlvbnNNYXAsIENoYXRTZXNzaW9uU3RhdHVzLCBDaGF0U2Vzc2lvbnNFeHRlbnNpb25zLCBJQXN5bmNDaGF0U2Vzc2lvbkFjdGl2YXRpb25SZWdpc3RyeSwgSUNoYXROZXdTZXNzaW9uUmVxdWVzdCwgSUNoYXRTZXNzaW9uLCBJQ2hhdFNlc3Npb25Db21taXRFdmVudCwgSUNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyLCBJQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uSXRlbUdyb3VwLCBJQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uc1Byb3ZpZGVyLCBJQ2hhdFNlc3Npb25JdGVtLCBJQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlciwgSUNoYXRTZXNzaW9uSXRlbXNEZWx0YSwgSUNoYXRTZXNzaW9uT3B0aW9uc0NoYW5nZUV2ZW50LCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwLCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0sIElDaGF0U2Vzc2lvblJlcXVlc3RIaXN0b3J5SXRlbSwgSUNoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50LCBJQ2hhdFNlc3Npb25zU2VydmljZSwgSUNoYXRJbnB1dENvbXBsZXRpb25zUGFyYW1zLCBJQ2hhdElucHV0Q29tcGxldGlvbnNSZXN1bHQsIGlzU2Vzc2lvbkluUHJvZ3Jlc3NTdGF0dXMsIGxvY2FsQ2hhdFNlc3Npb25UeXBlLCBSZWFkb25seUNoYXRTZXNzaW9uT3B0aW9uc01hcCwgUmVzb2x2ZWRDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCwgU2Vzc2lvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDSEFUX0NBVEVHT1JZIH0gZnJvbSAnLi4vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi93aWRnZXRIb3N0cy9lZGl0b3IvY2hhdEVkaXRvci5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UsIFJlc3BvbnNlTW9kZWxTdGF0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBvYnNlcnZhYmxlRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBQcm9tcHRGaWxlVmFyaWFibGVLaW5kLCB0b1Byb21wdEZpbGVWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdJZCB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdQYW5lIH0gZnJvbSAnLi4vd2lkZ2V0SG9zdHMvdmlld1BhbmUvY2hhdFZpZXdQYW5lLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvblByb3ZpZGVycywgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXIsIGdldEFnZW50U2Vzc2lvblByb3ZpZGVyTmFtZSB9IGZyb20gJy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uU3RvcmUsIHR5cGUgSUFnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvbiB9IGZyb20gJy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEltcG9ydENvbnZlcnNhdGlvblN0b3JlLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciwgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXBzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUsIGlzVW50aXRsZWRDaGF0U2Vzc2lvbiwgTG9jYWxDaGF0U2Vzc2lvblVyaSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IGFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBUYXJnZXQgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IHNsYXNoUmVnIH0gZnJvbSAnLi4vLi4vY29tbW9uL3JlcXVlc3RQYXJzZXIvY2hhdFJlcXVlc3RQYXJzZXIuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2VzL29mZnNldFJhbmdlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX0VOQUJMRURfQ09OVEVYVF9LRVkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvZGV4QWdlbnRFbmFibGVkU2V0dGluZ0lkLCBDb2RleFByZWZlckFnZW50SG9zdEVkaXRvclNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcblxuY29uc3QgZXh0ZW5zaW9uUG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJQ2hhdFNlc3Npb25zRXh0ZW5zaW9uUG9pbnRbXT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ2NoYXRTZXNzaW9ucycsXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50JywgJ0NvbnRyaWJ1dGVzIGNoYXQgc2Vzc2lvbiBpbnRlZ3JhdGlvbnMgdG8gdGhlIGNoYXQgd2lkZ2V0LicpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC5jaGF0U2Vzc2lvblR5cGUnLCAnVW5pcXVlIGlkZW50aWZpZXIgZm9yIHRoZSB0eXBlIG9mIGNoYXQgc2Vzc2lvbi4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0bmFtZToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQubmFtZScsICdOYW1lIG9mIHRoZSBkeW5hbWljYWxseSByZWdpc3RlcmVkIGNoYXQgcGFydGljaXBhbnQgKGVnOiBAYWdlbnQpLiBNdXN0IG5vdCBjb250YWluIHdoaXRlc3BhY2UuJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0cGF0dGVybjogJ15bXFxcXHctXSskJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRkaXNwbGF5TmFtZToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQuZGlzcGxheU5hbWUnLCAnQSBsb25nZXIgbmFtZSBmb3IgdGhpcyBpdGVtIHdoaWNoIGlzIHVzZWQgZm9yIGRpc3BsYXkgaW4gbWVudXMuJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC5kZXNjcmlwdGlvbicsICdEZXNjcmlwdGlvbiBvZiB0aGUgY2hhdCBzZXNzaW9uIGZvciB1c2UgaW4gbWVudXMgYW5kIHRvb2x0aXBzLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHdoZW46IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LndoZW4nLCAnQ29uZGl0aW9uIHdoaWNoIG11c3QgYmUgdHJ1ZSB0byBzaG93IHRoaXMgaXRlbS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRpY29uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC5pY29uJywgJ0ljb24gaWRlbnRpZmllciAoY29kaWNvbiBJRCkgZm9yIHRoZSBjaGF0IHNlc3Npb24gZWRpdG9yIHRhYi4gRm9yIGV4YW1wbGUsIFwiezB9XCIgb3IgXCJ7MX1cIi4nLCAnJChnaXRodWIpJywgJyQoY2xvdWQpJyksXG5cdFx0XHRcdFx0YW55T2Y6IFt7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdGxpZ2h0OiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdpY29uLmxpZ2h0JywgJ0ljb24gcGF0aCB3aGVuIGEgbGlnaHQgdGhlbWUgaXMgdXNlZCcpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGRhcms6IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2ljb24uZGFyaycsICdJY29uIHBhdGggd2hlbiBhIGRhcmsgdGhlbWUgaXMgdXNlZCcpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRvcmRlcjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQub3JkZXInLCAnT3JkZXIgaW4gd2hpY2ggdGhpcyBpdGVtIHNob3VsZCBiZSBkaXNwbGF5ZWQuJyksXG5cdFx0XHRcdFx0dHlwZTogJ2ludGVnZXInXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFsdGVybmF0aXZlSWRzOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC5hbHRlcm5hdGl2ZUlkcycsICdBbHRlcm5hdGl2ZSBpZGVudGlmaWVycyBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0d2VsY29tZVRpdGxlOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC53ZWxjb21lVGl0bGUnLCAnVGl0bGUgdGV4dCB0byBkaXNwbGF5IGluIHRoZSBjaGF0IHdlbGNvbWUgdmlldyBmb3IgdGhpcyBzZXNzaW9uIHR5cGUuJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0d2VsY29tZU1lc3NhZ2U6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LndlbGNvbWVNZXNzYWdlJywgJ01lc3NhZ2UgdGV4dCAoc3VwcG9ydHMgbWFya2Rvd24pIHRvIGRpc3BsYXkgaW4gdGhlIGNoYXQgd2VsY29tZSB2aWV3IGZvciB0aGlzIHNlc3Npb24gdHlwZS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR3ZWxjb21lVGlwczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQud2VsY29tZVRpcHMnLCAnVGlwcyB0ZXh0IChzdXBwb3J0cyBtYXJrZG93biBhbmQgdGhlbWUgaWNvbnMpIHRvIGRpc3BsYXkgaW4gdGhlIGNoYXQgd2VsY29tZSB2aWV3IGZvciB0aGlzIHNlc3Npb24gdHlwZS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbnB1dFBsYWNlaG9sZGVyOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC5pbnB1dFBsYWNlaG9sZGVyJywgJ1BsYWNlaG9sZGVyIHRleHQgdG8gZGlzcGxheSBpbiB0aGUgY2hhdCBpbnB1dCBib3ggZm9yIHRoaXMgc2Vzc2lvbiB0eXBlLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNhcGFiaWxpdGllczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQuY2FwYWJpbGl0aWVzJywgJ09wdGlvbmFsIGNhcGFiaWxpdGllcyBmb3IgdGhpcyBjaGF0IHNlc3Npb24uJyksXG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdHN1cHBvcnRzRmlsZUF0dGFjaG1lbnRzOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQuc3VwcG9ydHNGaWxlQXR0YWNobWVudHMnLCAnV2hldGhlciB0aGlzIGNoYXQgc2Vzc2lvbiBzdXBwb3J0cyBhdHRhY2hpbmcgZmlsZXMgb3IgZmlsZSByZWZlcmVuY2VzLicpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbidcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRzdXBwb3J0c1Rvb2xBdHRhY2htZW50czoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LnN1cHBvcnRzVG9vbEF0dGFjaG1lbnRzJywgJ1doZXRoZXIgdGhpcyBjaGF0IHNlc3Npb24gc3VwcG9ydHMgYXR0YWNoaW5nIHRvb2xzIG9yIHRvb2wgcmVmZXJlbmNlcy4nKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0c3VwcG9ydHNNQ1BBdHRhY2htZW50czoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LnN1cHBvcnRzTUNQQXR0YWNobWVudHMnLCAnV2hldGhlciB0aGlzIGNoYXQgc2Vzc2lvbiBzdXBwb3J0cyBhdHRhY2hpbmcgTUNQIHJlc291cmNlcy4nKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0c3VwcG9ydHNJbWFnZUF0dGFjaG1lbnRzOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQuc3VwcG9ydHNJbWFnZUF0dGFjaG1lbnRzJywgJ1doZXRoZXIgdGhpcyBjaGF0IHNlc3Npb24gc3VwcG9ydHMgYXR0YWNoaW5nIGltYWdlcy4nKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0c3VwcG9ydHNTZWFyY2hSZXN1bHRBdHRhY2htZW50czoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LnN1cHBvcnRzU2VhcmNoUmVzdWx0QXR0YWNobWVudHMnLCAnV2hldGhlciB0aGlzIGNoYXQgc2Vzc2lvbiBzdXBwb3J0cyBhdHRhY2hpbmcgc2VhcmNoIHJlc3VsdHMuJyksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHN1cHBvcnRzSW5zdHJ1Y3Rpb25BdHRhY2htZW50czoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LnN1cHBvcnRzSW5zdHJ1Y3Rpb25BdHRhY2htZW50cycsICdXaGV0aGVyIHRoaXMgY2hhdCBzZXNzaW9uIHN1cHBvcnRzIGF0dGFjaGluZyBpbnN0cnVjdGlvbnMuJyksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHN1cHBvcnRzU291cmNlQ29udHJvbEF0dGFjaG1lbnRzOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQuc3VwcG9ydHNTb3VyY2VDb250cm9sQXR0YWNobWVudHMnLCAnV2hldGhlciB0aGlzIGNoYXQgc2Vzc2lvbiBzdXBwb3J0cyBhdHRhY2hpbmcgc291cmNlIGNvbnRyb2wgY2hhbmdlcy4nKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0c3VwcG9ydHNQcm9ibGVtQXR0YWNobWVudHM6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC5zdXBwb3J0c1Byb2JsZW1BdHRhY2htZW50cycsICdXaGV0aGVyIHRoaXMgY2hhdCBzZXNzaW9uIHN1cHBvcnRzIGF0dGFjaGluZyBwcm9ibGVtcy4nKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0c3VwcG9ydHNTeW1ib2xBdHRhY2htZW50czoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LnN1cHBvcnRzU3ltYm9sQXR0YWNobWVudHMnLCAnV2hldGhlciB0aGlzIGNoYXQgc2Vzc2lvbiBzdXBwb3J0cyBhdHRhY2hpbmcgc3ltYm9scy4nKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0c3VwcG9ydHNQcm9tcHRBdHRhY2htZW50czoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LnN1cHBvcnRzUHJvbXB0QXR0YWNobWVudHMnLCAnV2hldGhlciB0aGlzIGNoYXQgc2Vzc2lvbiBzdXBwb3J0cyBhdHRhY2hpbmcgcHJvbXB0cy4nKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0c3VwcG9ydHNIYW5kT2Zmczoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LnN1cHBvcnRzSGFuZE9mZnMnLCAnV2hldGhlciB0aGlzIGNoYXQgc2Vzc2lvbiBzdXBwb3J0cyBoYW5kLW9mZiBwcm9tcHRzLicpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbidcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNvbW1hbmRzOiB7XG5cdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRDb21tYW5kc0Rlc2NyaXB0aW9uJywgXCJDb21tYW5kcyBhdmFpbGFibGUgZm9yIHRoaXMgY2hhdCBzZXNzaW9uLCB3aGljaCB0aGUgdXNlciBjYW4gaW52b2tlIHdpdGggYSBgL2AuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IG5hbWU6ICcnLCBkZXNjcmlwdGlvbjogJycgfSB9XSxcblx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ25hbWUnXSxcblx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0bmFtZToge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdENvbW1hbmQnLCBcIkEgc2hvcnQgbmFtZSBieSB3aGljaCB0aGlzIGNvbW1hbmQgaXMgcmVmZXJyZWQgdG8gaW4gdGhlIFVJLCBlLmcuIGBmaXhgIG9yIGBleHBsYWluYCBmb3IgY29tbWFuZHMgdGhhdCBmaXggYW4gaXNzdWUgb3IgZXhwbGFpbiBjb2RlLiBUaGUgbmFtZSBzaG91bGQgYmUgdW5pcXVlIGFtb25nIHRoZSBjb21tYW5kcyBwcm92aWRlZCBieSB0aGlzIHBhcnRpY2lwYW50LlwiKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdENvbW1hbmREZXNjcmlwdGlvbicsIFwiQSBkZXNjcmlwdGlvbiBvZiB0aGlzIGNvbW1hbmQuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHdoZW46IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRDb21tYW5kV2hlbicsIFwiQSBjb25kaXRpb24gd2hpY2ggbXVzdCBiZSB0cnVlIHRvIGVuYWJsZSB0aGlzIGNvbW1hbmQuXCIpLFxuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjYW5EZWxlZ2F0ZToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQuY2FuRGVsZWdhdGUnLCAnV2hldGhlciBkZWxlZ2F0aW9uIGlzIHN1cHBvcnRlZC4gRGVmYXVsdCBpcyBmYWxzZS4gTm90ZSB0aGF0IGVuYWJsaW5nIHRoaXMgaXMgZXhwZXJpbWVudGFsIGFuZCBtYXkgbm90IGJlIHJlc3BlY3RlZCBhdCBhbGwgdGltZXMuJyksXG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGN1c3RvbUFnZW50VGFyZ2V0OiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC5jdXN0b21BZ2VudFRhcmdldCcsICdXaGVuIHNldCwgdGhlIGNoYXQgc2Vzc2lvbiB3aWxsIHNob3cgYSBmaWx0ZXJlZCBtb2RlIHBpY2tlciB0aGF0IHByZWZlcnMgY3VzdG9tIGFnZW50cyB3aG9zZSB0YXJnZXQgcHJvcGVydHkgbWF0Y2hlcyB0aGlzIHZhbHVlLiBDdXN0b20gYWdlbnRzIHdpdGhvdXQgYSB0YXJnZXQgcHJvcGVydHkgYXJlIHN0aWxsIHNob3duIGluIGFsbCBzZXNzaW9uIHR5cGVzLiBUaGlzIGVuYWJsZXMgdGhlIHVzZSBvZiBzdGFuZGFyZCBhZ2VudC9tb2RlIHdpdGggY29udHJpYnV0ZWQgc2Vzc2lvbnMuJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVxdWlyZXNDdXN0b21Nb2RlbHM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LnJlcXVpcmVzQ3VzdG9tTW9kZWxzJywgJ1doZW4gc2V0LCB0aGUgY2hhdCBzZXNzaW9uIHdpbGwgc2hvdyBhIGZpbHRlcmVkIG1vZGVsIHBpY2tlciB0aGF0IHByZWZlcnMgY3VzdG9tIG1vZGVscy4gVGhpcyBlbmFibGVzIHRoZSB1c2Ugb2Ygc3RhbmRhcmQgbW9kZWwgcGlja2VyIHdpdGggY29udHJpYnV0ZWQgc2Vzc2lvbnMuJyksXG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHN1cHBvcnRzQXV0b01vZGVsOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdjaGF0U2Vzc2lvbnNFeHRQb2ludC5zdXBwb3J0c0F1dG9Nb2RlbCcsICdXaGV0aGVyIHRoZSBjaGF0IHNlc3Npb24gc3VwcG9ydHMgdGhlIHN5bnRoZXRpYyBcIkF1dG9cIiBtb2RlbCBmYWxsYmFjay4gRGVmYXVsdHMgdG8gZmFsc2UuIFdoZW4gdHJ1ZSBhbmQgbm8gbW9kZWxzIGFyZSBhdmFpbGFibGUsIHRoZSBwaWNrZXIgc2hvd3MgXCJBdXRvXCIgaW5zdGVhZCBvZiBhIFwiTm8gbW9kZWxzIGF2YWlsYWJsZVwiIHN0YXRlLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXF1aXJlc0NvcGlsb3RTaWduSW46IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NoYXRTZXNzaW9uc0V4dFBvaW50LnJlcXVpcmVzQ29waWxvdFNpZ25JbicsICdXaGV0aGVyIHRoZSBjaGF0IHNlc3Npb24gcmVsaWVzIG9uIGEgR2l0SHViIENvcGlsb3QgYWNjb3VudCBhbmQgc28gY2Fubm90IGJlIHVzZWQgdW50aWwgdGhlIHVzZXIgc2lnbnMgaW4uIERlZmF1bHRzIHRvIGZhbHNlLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0XHRkZWZhdWx0OiBmYWxzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhdXRvQXR0YWNoUmVmZXJlbmNlczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQuYXV0b0F0dGFjaFJlZmVyZW5jZXMnLCAnV2hldGhlciB0byBhdXRvbWF0aWNhbGx5IGF0dGFjaCBpbnN0cnVjdGlvbiBmaWxlcyB0byBjaGF0IHJlcXVlc3RzIGZvciB0aGlzIHNlc3Npb24gdHlwZS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdFx0ZGVmYXVsdDogZmFsc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0dXNlUmVxdWVzdFRvUG9wdWxhdGVCdWlsdEluUGlja2Vyczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2hhdFNlc3Npb25zRXh0UG9pbnQudXNlUmVxdWVzdFRvUG9wdWxhdGVCdWlsdEluUGlja2VycycsICdXaGV0aGVyIHRvIHVzZSBDaGF0UmVxdWVzdFR1cm4yIHRvIHBvcHVsYXRlIGJ1aWx0LWluIHBpY2tlcnMgc3VjaCBhcyB0aGUgQWdlbnQgYW5kIE1vZGVsIHBpY2tlcnMuJyksXG5cdFx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRcdGRlZmF1bHQ6IGZhbHNlXG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRyZXF1aXJlZDogWyd0eXBlJywgJ25hbWUnLCAnZGlzcGxheU5hbWUnLCAnZGVzY3JpcHRpb24nXSxcblx0XHR9XG5cdH0sXG5cdGFjdGl2YXRpb25FdmVudHNHZW5lcmF0b3I6IGZ1bmN0aW9uKiAoY29udHJpYnMpIHtcblx0XHRmb3IgKGNvbnN0IGNvbnRyaWIgb2YgY29udHJpYnMpIHtcblx0XHRcdHlpZWxkIGBvbkNoYXRTZXNzaW9uOiR7Y29udHJpYi50eXBlfWA7XG5cdFx0fVxuXHR9XG59KTtcblxuY29uc3QgY29kZXhFeHRlbnNpb25Ib3N0QXZhaWxhYmxlV2hlbiA9IENvbnRleHRLZXlFeHByLmFuZChcblx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCksXG5cdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdEFHRU5UX0hPU1RfRU5BQkxFRF9DT05URVhUX0tFWS5uZWdhdGUoKSxcblx0XHRDb250ZXh0S2V5RXhwci5ub3QoYGNvbmZpZy4ke0FnZW50SG9zdENvZGV4QWdlbnRFbmFibGVkU2V0dGluZ0lkfWApLFxuXHRcdENvbnRleHRLZXlFeHByLm5vdChgY29uZmlnLiR7Q29kZXhQcmVmZXJBZ2VudEhvc3RFZGl0b3JTZXR0aW5nSWR9YCksXG5cdCksXG4pITtcblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5Q29kZXhBZ2VudEhvc3RQcmVmZXJlbmNlKGNvbnRyaWJ1dGlvbjogSUNoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50KTogSUNoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50IHtcblx0aWYgKGNvbnRyaWJ1dGlvbi50eXBlICE9PSBTZXNzaW9uVHlwZS5Db2RleCkge1xuXHRcdHJldHVybiBjb250cmlidXRpb247XG5cdH1cblxuXHRjb25zdCBjb250cmlidXRlZFdoZW4gPSBjb250cmlidXRpb24ud2hlbiA/IENvbnRleHRLZXlFeHByLmRlc2VyaWFsaXplKGNvbnRyaWJ1dGlvbi53aGVuKSA6IHVuZGVmaW5lZDtcblx0cmV0dXJuIHtcblx0XHQuLi5jb250cmlidXRpb24sXG5cdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKGNvbnRyaWJ1dGVkV2hlbiwgY29kZXhFeHRlbnNpb25Ib3N0QXZhaWxhYmxlV2hlbik/LnNlcmlhbGl6ZSgpLFxuXHR9O1xufVxuXG5jbGFzcyBDb250cmlidXRlZENoYXRTZXNzaW9uRGF0YSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnNDYWNoZTogQ2hhdFNlc3Npb25PcHRpb25zTWFwO1xuXHRwdWJsaWMgZ2V0T3B0aW9uKG9wdGlvbklkOiBzdHJpbmcpOiBzdHJpbmcgfCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9vcHRpb25zQ2FjaGUuZ2V0KG9wdGlvbklkKTtcblx0fVxuXHRwdWJsaWMgZ2V0QWxsT3B0aW9ucygpOiBJdGVyYWJsZUl0ZXJhdG9yPFtzdHJpbmcsIHN0cmluZyB8IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uSXRlbV0+IHtcblx0XHRyZXR1cm4gdGhpcy5fb3B0aW9uc0NhY2hlLmVudHJpZXMoKTtcblx0fVxuXHRwdWJsaWMgc2V0T3B0aW9uKG9wdGlvbklkOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcgfCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0pOiB2b2lkIHtcblx0XHR0aGlzLl9vcHRpb25zQ2FjaGUuc2V0KG9wdGlvbklkLCB2YWx1ZSk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBzZXNzaW9uOiBJQ2hhdFNlc3Npb24sXG5cdFx0cmVhZG9ubHkgY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcsXG5cdFx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSSxcblx0XHRyZWFkb25seSBvcHRpb25zOiBSZWFkb25seUNoYXRTZXNzaW9uT3B0aW9uc01hcCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9uV2lsbERpc3Bvc2U6IChyZXNvdXJjZTogVVJJKSA9PiB2b2lkXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9vcHRpb25zQ2FjaGUgPSBuZXcgTWFwKG9wdGlvbnMpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXNzaW9uLm9uV2lsbERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5vbldpbGxEaXNwb3NlKHRoaXMucmVzb3VyY2UpO1xuXHRcdH0pKTtcblx0fVxufVxuXG5cbmV4cG9ydCBjbGFzcyBDaGF0U2Vzc2lvbnNTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2l0ZW1Db250cm9sbGVycyA9IG5ldyBNYXA8LyogdHlwZSAqLyBzdHJpbmcsIHsgcmVhZG9ubHkgY29udHJvbGxlcjogSUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXI7IHJlYWRvbmx5IGluaXRpYWxSZWZyZXNoOiBQcm9taXNlPHZvaWQ+IH0+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FzeW5jQWN0aXZhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUFzeW5jQ2hhdFNlc3Npb25BY3RpdmF0aW9uUmVnaXN0cnk+KENoYXRTZXNzaW9uc0V4dGVuc2lvbnMuQXN5bmNBY3RpdmF0aW9uKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250cmlidXRpb25zOiBNYXA8LyogdHlwZSAqLyBzdHJpbmcsIHsgcmVhZG9ubHkgY29udHJpYnV0aW9uOiBJQ2hhdFNlc3Npb25zRXh0ZW5zaW9uUG9pbnQ7IHJlYWRvbmx5IGV4dGVuc2lvbjogSVJlbGF4ZWRFeHRlbnNpb25EZXNjcmlwdGlvbiB8IHVuZGVmaW5lZCB9PiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udHJpYnV0aW9uRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZU1hcDwvKiB0eXBlICovIHN0cmluZz4oKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udGVudFByb3ZpZGVyczogTWFwPC8qIHNjaGVtZSAqLyBzdHJpbmcsIElDaGF0U2Vzc2lvbkNvbnRlbnRQcm92aWRlcj4gPSBuZXcgTWFwKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FsdGVybmF0aXZlSWRNYXA6IE1hcDwvKiBhbHRlcm5hdGl2ZUlkICovIHN0cmluZywgLyogcHJpbWFyeVR5cGUgKi8gc3RyaW5nPiA9IG5ldyBNYXAoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUl0ZW1zUHJvdmlkZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZWFkb25seSBjaGF0U2Vzc2lvblR5cGU6IHN0cmluZyB9PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VJdGVtc1Byb3ZpZGVycyA9IHRoaXMuX29uRGlkQ2hhbmdlSXRlbXNQcm92aWRlcnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZXNzaW9uSXRlbXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2hhdFNlc3Npb25JdGVtc0RlbHRhPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9uSXRlbXMgPSB0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25JdGVtcy5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENvbW1pdFNlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2hhdFNlc3Npb25Db21taXRFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ29tbWl0U2Vzc2lvbiA9IHRoaXMuX29uRGlkQ29tbWl0U2Vzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUF2YWlsYWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUF2YWlsYWJpbGl0eTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUF2YWlsYWJpbGl0eS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUluUHJvZ3Jlc3MgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIGdldCBvbkRpZENoYW5nZUluUHJvZ3Jlc3MoKSB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZUluUHJvZ3Jlc3MuZXZlbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUNvbnRlbnRQcm92aWRlclNjaGVtZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGFkZGVkOiBzdHJpbmdbXTsgcmVhZG9ubHkgcmVtb3ZlZDogc3RyaW5nW10gfT4oKSk7XG5cdHB1YmxpYyBnZXQgb25EaWRDaGFuZ2VDb250ZW50UHJvdmlkZXJTY2hlbWVzKCkgeyByZXR1cm4gdGhpcy5fb25EaWRDaGFuZ2VDb250ZW50UHJvdmlkZXJTY2hlbWVzLmV2ZW50OyB9XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2Vzc2lvbk9wdGlvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQ2hhdFNlc3Npb25PcHRpb25zQ2hhbmdlRXZlbnQ+KCkpO1xuXHRwdWJsaWMgZ2V0IG9uRGlkQ2hhbmdlU2Vzc2lvbk9wdGlvbnMoKSB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25PcHRpb25zLmV2ZW50OyB9XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlT3B0aW9uR3JvdXBzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cHVibGljIGdldCBvbkRpZENoYW5nZU9wdGlvbkdyb3VwcygpIHsgcmV0dXJuIHRoaXMuX29uRGlkQ2hhbmdlT3B0aW9uR3JvdXBzLmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBpblByb2dyZXNzTWFwID0gbmV3IE1hcDwvKiBjaGF0U2Vzc2lvblR5cGUgKi8gc3RyaW5nLCBudW1iZXI+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25UeXBlT3B0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwW10+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnMgPSBuZXcgUmVzb3VyY2VNYXA8Q29udHJpYnV0ZWRDaGF0U2Vzc2lvbkRhdGE+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlQWxpYXNlcyA9IG5ldyBSZXNvdXJjZU1hcDxVUkk+KCk7IC8vIHJlYWwgcmVzb3VyY2UgLT4gdW50aXRsZWQgcmVzb3VyY2UgKGtlcHQgZm9yIHRoZSB3b3JrYmVuY2ggbGlmZXRpbWUgc28gb3B0aW9uIGxvb2t1cHMgZm9yIHRoZSByZWFsIHNlc3Npb24gcmVzb2x2ZSB0byB0aGUgdW50aXRsZWQgZW50cnkpXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlYWxSZXNvdXJjZXMgPSBuZXcgUmVzb3VyY2VNYXA8VVJJPigpOyAvLyB1bnRpdGxlZCByZXNvdXJjZSAtPiByZWFsIHJlc291cmNlIChjbGVhcmVkIHdoZW4gdGhlIHNlc3Npb24gaXMgZGlzcG9zZWQpXG5cblx0cHJpdmF0ZSByZWFkb25seSBfY3VzdG9taXphdGlvbnNQcm92aWRlcnMgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnNQcm92aWRlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ3VzdG9taXphdGlvbnMgPSB0aGlzLl9vbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hhc0NhbkRlbGVnYXRlUHJvdmlkZXJzS2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDaGF0QWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRBZ2VudFNlcnZpY2U6IElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9leHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5faGFzQ2FuRGVsZWdhdGVQcm92aWRlcnNLZXkgPSBDaGF0Q29udGV4dEtleXMuaGFzQ2FuRGVsZWdhdGVQcm92aWRlcnMuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGV4dGVuc2lvblBvaW50LnNldEhhbmRsZXIoZXh0ZW5zaW9ucyA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dCBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdGlmICghaXNQcm9wb3NlZEFwaUVuYWJsZWQoZXh0LmRlc2NyaXB0aW9uLCAnY2hhdFNlc3Npb25zUHJvdmlkZXInKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheShleHQudmFsdWUpKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBjb250cmlidXRpb24gb2YgZXh0LnZhbHVlKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5yZWdpc3RlckNvbnRyaWJ1dGlvbihjb250cmlidXRpb24sIGV4dC5kZXNjcmlwdGlvbikpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gTGlzdGVuIGZvciBjb250ZXh0IGNoYW5nZXMgYW5kIHJlLWV2YWx1YXRlIGNvbnRyaWJ1dGlvbnNcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5maWx0ZXIodGhpcy5fY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0LCBlID0+IGUuYWZmZWN0c1NvbWUodGhpcy5fY29udGV4dEtleXMpKSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9ldmFsdWF0ZUF2YWlsYWJpbGl0eSgpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGJ1aWx0aW5TZXNzaW9uUHJvdmlkZXJzID0gW0FnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbF07XG5cdFx0Y29uc3QgY29udHJpYnV0ZWRTZXNzaW9uUHJvdmlkZXJzID0gb2JzZXJ2YWJsZUZyb21FdmVudChcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VBdmFpbGFiaWxpdHksXG5cdFx0XHQoKSA9PiBBcnJheS5mcm9tKHRoaXMuX2NvbnRyaWJ1dGlvbnMua2V5cygpKS5maWx0ZXIoa2V5ID0+IHRoaXMuX2NvbnRyaWJ1dGlvbkRpc3Bvc2FibGVzLmhhcyhrZXkpKSxcblx0XHQpLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2YXRlZFByb3ZpZGVycyA9IGNvbnRyaWJ1dGVkU2Vzc2lvblByb3ZpZGVycy5yZWFkKHJlYWRlcik7XG5cblx0XHRcdC8vIFJlZ2lzdGVyIGluLXBsYWNlIGFjdGlvbnMgZm9yIGJ1aWx0LWluIGVudW0gcHJvdmlkZXJzXG5cdFx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIGJ1aWx0aW5TZXNzaW9uUHJvdmlkZXJzKSB7XG5cdFx0XHRcdHJlYWRlci5zdG9yZS5hZGQocmVnaXN0ZXJOZXdTZXNzaW9uSW5QbGFjZUFjdGlvbihwcm92aWRlciwgZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXJOYW1lKHByb3ZpZGVyKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHR5cGUgb2YgYWN0aXZhdGVkUHJvdmlkZXJzKSB7XG5cdFx0XHRcdC8vIFRPRE86IFJlbW92ZSBoYXJkY29kZWQgcHJvdmlkZXJzIGZyb20gY29yZVxuXHRcdFx0XHRjb25zdCBrbm93blByb3ZpZGVyID0gZ2V0QWdlbnRTZXNzaW9uUHJvdmlkZXIodHlwZSk7XG5cdFx0XHRcdGlmIChrbm93blByb3ZpZGVyKSB7XG5cdFx0XHRcdFx0Ly8gV2VsbC1rbm93biBwcm92aWRlciBcdTIwMTQgdXNlIGhhcmRjb2RlZCBuYW1lXG5cdFx0XHRcdFx0Y29uc3QgbGFiZWwgPSBnZXRBZ2VudFNlc3Npb25Qcm92aWRlck5hbWUoa25vd25Qcm92aWRlcik7XG5cdFx0XHRcdFx0cmVhZGVyLnN0b3JlLmFkZChyZWdpc3Rlck5ld1Nlc3Npb25JblBsYWNlQWN0aW9uKHR5cGUsIGxhYmVsKSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gRXh0ZW5zaW9uLWNvbnRyaWJ1dGVkIFx1MjAxNCB1c2UgY29udHJpYnV0aW9uIG1ldGFkYXRhXG5cdFx0XHRcdFx0Y29uc3QgY29udHJpYiA9IHRoaXMuX2NvbnRyaWJ1dGlvbnMuZ2V0KHR5cGUpO1xuXHRcdFx0XHRcdGlmIChjb250cmliKSB7XG5cdFx0XHRcdFx0XHRyZWFkZXIuc3RvcmUuYWRkKHJlZ2lzdGVyTmV3U2Vzc2lvbkluUGxhY2VBY3Rpb24odHlwZSwgY29udHJpYi5jb250cmlidXRpb24uZGlzcGxheU5hbWUgPz8gY29udHJpYi5jb250cmlidXRpb24ubmFtZSA/PyB0eXBlKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGFiZWxTZXJ2aWNlLnJlZ2lzdGVyRm9ybWF0dGVyKHtcblx0XHRcdHNjaGVtZTogU2NoZW1hcy5jb3BpbG90UHIsXG5cdFx0XHRmb3JtYXR0aW5nOiB7XG5cdFx0XHRcdGxhYmVsOiAnJHthdXRob3JpdHl9JHtwYXRofScsXG5cdFx0XHRcdHNlcGFyYXRvcjogc2VwLFxuXHRcdFx0XHRzdHJpcFBhdGhTdGFydGluZ1NlcGFyYXRvcjogdHJ1ZSxcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlcG9ydEluUHJvZ3Jlc3MoY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcsIGNvdW50OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2l0ZW1Db250cm9sbGVycy5oYXMoY2hhdFNlc3Npb25UeXBlKSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBBdHRlbXB0ZWQgdG8gcmVwb3J0IGluLXByb2dyZXNzIHN0YXR1cyBmb3IgdW5rbm93biBjaGF0IHNlc3Npb24gdHlwZSAnJHtjaGF0U2Vzc2lvblR5cGV9J2ApO1xuXHRcdH1cblxuXHRcdHRoaXMuaW5Qcm9ncmVzc01hcC5zZXQoY2hhdFNlc3Npb25UeXBlLCBjb3VudCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VJblByb2dyZXNzLmZpcmUoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRJblByb2dyZXNzKCk6IHsgY2hhdFNlc3Npb25UeXBlOiBzdHJpbmc7IGNvdW50OiBudW1iZXIgfVtdIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLmluUHJvZ3Jlc3NNYXAuZW50cmllcygpKS5tYXAoKFtjaGF0U2Vzc2lvblR5cGUsIGNvdW50XSkgPT4gKHsgY2hhdFNlc3Npb25UeXBlLCBjb3VudCB9KSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVzb2x2ZUNoYXRTZXNzaW9uSXRlbShjaGF0U2Vzc2lvblR5cGU6IHN0cmluZywgcmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdFNlc3Npb25JdGVtIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9pdGVtQ29udHJvbGxlcnMuZ2V0KGNoYXRTZXNzaW9uVHlwZSk7XG5cdFx0aWYgKCFlbnRyeT8uY29udHJvbGxlci5yZXNvbHZlQ2hhdFNlc3Npb25JdGVtKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBlbnRyeS5jb250cm9sbGVyLnJlc29sdmVDaGF0U2Vzc2lvbkl0ZW0ocmVzb3VyY2UsIHRva2VuKTtcblx0fVxuXG5cdGNhblNldENoYXRTZXNzaW9uSXRlbUFyY2hpdmVkKHNlc3Npb25SZXNvdXJjZTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHR5cGVvZiB0aGlzLl9nZXRDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKHNlc3Npb25SZXNvdXJjZSk/LmNvbnRyb2xsZXIuc2V0Q2hhdFNlc3Npb25JdGVtQXJjaGl2ZWQgPT09ICdmdW5jdGlvbic7XG5cdH1cblxuXHRzZXRDaGF0U2Vzc2lvbkl0ZW1BcmNoaXZlZChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgYXJjaGl2ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy5fZ2V0Q2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihzZXNzaW9uUmVzb3VyY2UpPy5jb250cm9sbGVyO1xuXHRcdGlmICghY29udHJvbGxlcj8uc2V0Q2hhdFNlc3Npb25JdGVtQXJjaGl2ZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfSBkb2VzIG5vdCBzdXBwb3J0IGFyY2hpdmluZ2ApO1xuXHRcdH1cblx0XHRjb250cm9sbGVyLnNldENoYXRTZXNzaW9uSXRlbUFyY2hpdmVkKHNlc3Npb25SZXNvdXJjZSwgYXJjaGl2ZWQpO1xuXHR9XG5cblx0Y2FuU2V0Q2hhdFNlc3Npb25JdGVtUmVhZChzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0eXBlb2YgdGhpcy5fZ2V0Q2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihzZXNzaW9uUmVzb3VyY2UpPy5jb250cm9sbGVyLnNldENoYXRTZXNzaW9uSXRlbVJlYWQgPT09ICdmdW5jdGlvbic7XG5cdH1cblxuXHRzZXRDaGF0U2Vzc2lvbkl0ZW1SZWFkKHNlc3Npb25SZXNvdXJjZTogVVJJLCBpc1JlYWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy5fZ2V0Q2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihzZXNzaW9uUmVzb3VyY2UpPy5jb250cm9sbGVyO1xuXHRcdGlmICghY29udHJvbGxlcj8uc2V0Q2hhdFNlc3Npb25JdGVtUmVhZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTZXNzaW9uICR7c2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCl9IGRvZXMgbm90IG93biByZWFkIHN0YXRlYCk7XG5cdFx0fVxuXHRcdGNvbnRyb2xsZXIuc2V0Q2hhdFNlc3Npb25JdGVtUmVhZChzZXNzaW9uUmVzb3VyY2UsIGlzUmVhZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUluUHJvZ3Jlc3NTdGF0dXMoY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaXRlbXM6IElDaGF0U2Vzc2lvbkl0ZW1bXSA9IFtdO1xuXHRcdFx0Zm9yIGF3YWl0IChjb25zdCByZXN1bHQgb2YgdGhpcy5nZXRDaGF0U2Vzc2lvbkl0ZW1zKFtjaGF0U2Vzc2lvblR5cGVdLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkge1xuXHRcdFx0XHRpdGVtcy5wdXNoKC4uLnJlc3VsdC5pdGVtcyk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpblByb2dyZXNzID0gaXRlbXMuZmlsdGVyKGl0ZW0gPT4gIWl0ZW0uYXJjaGl2ZWQgJiYgaXRlbS5zdGF0dXMgJiYgaXNTZXNzaW9uSW5Qcm9ncmVzc1N0YXR1cyhpdGVtLnN0YXR1cykpO1xuXHRcdFx0dGhpcy5yZXBvcnRJblByb2dyZXNzKGNoYXRTZXNzaW9uVHlwZSwgaW5Qcm9ncmVzcy5sZW5ndGgpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYEZhaWxlZCB0byB1cGRhdGUgaW4tcHJvZ3Jlc3Mgc3RhdHVzIGZvciBjaGF0IHNlc3Npb24gdHlwZSAnJHtjaGF0U2Vzc2lvblR5cGV9JzpgLCBlcnJvcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNvbnRyaWJ1dGlvbihjb250cmlidXRpb246IElDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCwgZXh0OiBJUmVsYXhlZEV4dGVuc2lvbkRlc2NyaXB0aW9uKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnRyaWJ1dGlvbiA9IGFwcGx5Q29kZXhBZ2VudEhvc3RQcmVmZXJlbmNlKGNvbnRyaWJ1dGlvbik7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NoYXRTZXNzaW9uc1NlcnZpY2VdIHJlZ2lzdGVyQ29udHJpYnV0aW9uIGNhbGxlZCBmb3IgdHlwZT0nJHtjb250cmlidXRpb24udHlwZX0nLCBjYW5EZWxlZ2F0ZT0ke2NvbnRyaWJ1dGlvbi5jYW5EZWxlZ2F0ZX0sIHdoZW49JyR7Y29udHJpYnV0aW9uLndoZW59JywgZXh0ZW5zaW9uPScke2V4dC5pZGVudGlmaWVyLnZhbHVlfSdgKTtcblx0XHRpZiAodGhpcy5fY29udHJpYnV0aW9ucy5oYXMoY29udHJpYnV0aW9uLnR5cGUpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ2hhdFNlc3Npb25zU2VydmljZV0gcmVnaXN0ZXJDb250cmlidXRpb246IHR5cGU9JyR7Y29udHJpYnV0aW9uLnR5cGV9JyBhbHJlYWR5IHJlZ2lzdGVyZWQsIHNraXBwaW5nYCk7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdH1cblxuXHRcdC8vIFRyYWNrIGNvbnRleHQga2V5cyBmcm9tIHRoZSB3aGVuIGNvbmRpdGlvblxuXHRcdGlmIChjb250cmlidXRpb24ud2hlbikge1xuXHRcdFx0Y29uc3Qgd2hlbkV4cHIgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShjb250cmlidXRpb24ud2hlbik7XG5cdFx0XHRpZiAod2hlbkV4cHIpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBrZXkgb2Ygd2hlbkV4cHIua2V5cygpKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29udGV4dEtleXMuYWRkKGtleSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9jb250cmlidXRpb25zLnNldChjb250cmlidXRpb24udHlwZSwgeyBjb250cmlidXRpb24sIGV4dGVuc2lvbjogZXh0IH0pO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgYWx0ZXJuYXRpdmUgSURzIGlmIHByb3ZpZGVkXG5cdFx0aWYgKGNvbnRyaWJ1dGlvbi5hbHRlcm5hdGl2ZUlkcykge1xuXHRcdFx0Zm9yIChjb25zdCBhbHRJZCBvZiBjb250cmlidXRpb24uYWx0ZXJuYXRpdmVJZHMpIHtcblx0XHRcdFx0aWYgKHRoaXMuX2FsdGVybmF0aXZlSWRNYXAuaGFzKGFsdElkKSkge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgQWx0ZXJuYXRpdmUgSUQgJyR7YWx0SWR9JyBpcyBhbHJlYWR5IG1hcHBlZCB0byAnJHt0aGlzLl9hbHRlcm5hdGl2ZUlkTWFwLmdldChhbHRJZCl9Jy4gUmVtYXBwaW5nIHRvICcke2NvbnRyaWJ1dGlvbi50eXBlfScuYCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fYWx0ZXJuYXRpdmVJZE1hcC5zZXQoYWx0SWQsIGNvbnRyaWJ1dGlvbi50eXBlKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9ldmFsdWF0ZUF2YWlsYWJpbGl0eSgpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fY29udHJpYnV0aW9ucy5kZWxldGUoY29udHJpYnV0aW9uLnR5cGUpO1xuXHRcdFx0XHQvLyBSZW1vdmUgYWx0ZXJuYXRpdmUgSUQgbWFwcGluZ3Ncblx0XHRcdFx0aWYgKGNvbnRyaWJ1dGlvbi5hbHRlcm5hdGl2ZUlkcykge1xuXHRcdFx0XHRcdGZvciAoY29uc3QgYWx0SWQgb2YgY29udHJpYnV0aW9uLmFsdGVybmF0aXZlSWRzKSB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fYWx0ZXJuYXRpdmVJZE1hcC5nZXQoYWx0SWQpID09PSBjb250cmlidXRpb24udHlwZSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9hbHRlcm5hdGl2ZUlkTWFwLmRlbGV0ZShhbHRJZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2NvbnRyaWJ1dGlvbkRpc3Bvc2FibGVzLmRlbGV0ZUFuZERpc3Bvc2UoY29udHJpYnV0aW9uLnR5cGUpO1xuXHRcdFx0XHR0aGlzLl91cGRhdGVIYXNDYW5EZWxlZ2F0ZVByb3ZpZGVyc0NvbnRleHRLZXkoKTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNDb250cmlidXRpb25BdmFpbGFibGUoY29udHJpYnV0aW9uOiBJQ2hhdFNlc3Npb25zRXh0ZW5zaW9uUG9pbnQpOiBib29sZWFuIHtcblx0XHRpZiAoIWNvbnRyaWJ1dGlvbi53aGVuKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3Qgd2hlbkV4cHIgPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShjb250cmlidXRpb24ud2hlbik7XG5cdFx0cmV0dXJuICF3aGVuRXhwciB8fCB0aGlzLl9jb250ZXh0S2V5U2VydmljZS5jb250ZXh0TWF0Y2hlc1J1bGVzKHdoZW5FeHByKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUeXBlLWtleWVkIGNvbXBhbmlvbiB0byB7QGxpbmsgX2lzQ29udHJpYnV0aW9uQXZhaWxhYmxlfS4gUmVzb2x2ZXMgdGhlXG5cdCAqIHNlc3Npb24gdHlwZSAoaW5jbHVkaW5nIGFsdGVybmF0aXZlIGlkcykgdG8gaXRzIGNvbnRyaWJ1dGlvbiBhbmQgcmVwb3J0c1xuXHQgKiB3aGV0aGVyIHRoYXQgY29udHJpYnV0aW9uIGlzIGN1cnJlbnRseSBlbmFibGVkIGJ5IGl0cyBgd2hlbmAgY2xhdXNlLlxuXHQgKlxuXHQgKiBTZXNzaW9uIHR5cGVzIHdpdGggbm8gY29udHJpYnV0aW9uIGVudHJ5IChlLmcuIHRoZSBidWlsdC1pbiBgbG9jYWxgXG5cdCAqIHByb3ZpZGVyLCBvciBpdGVtIGNvbnRyb2xsZXJzIHJlZ2lzdGVyZWQgd2l0aG91dCBhIG1hdGNoaW5nIGNvbnRyaWJ1dGlvbilcblx0ICogYXJlIHRyZWF0ZWQgYXMgYXZhaWxhYmxlLCBzaW5jZSB0aGVyZSBpcyBubyBgd2hlbmAgY2xhdXNlIGdhdGluZyB0aGVtLlxuXHQgKi9cblx0cHJpdmF0ZSBfaXNDb250cmlidXRpb25BdmFpbGFibGVGb3JUeXBlKHNlc3Npb25UeXBlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHQvLyBSZXNvbHZlIHRoZSBvd25pbmcgY29udHJpYnV0aW9uIGJ5IHByaW1hcnkgdHlwZSwgZmFsbGluZyBiYWNrIHRvIHRoZVxuXHRcdC8vIGFsdGVybmF0aXZlLWlkIG1hcC4gV2UgbXVzdCBOT1QgdXNlIGBfcmVzb2x2ZVRvUHJpbWFyeVR5cGVgIGhlcmU6IGl0XG5cdFx0Ly8gcmV0dXJucyBgdW5kZWZpbmVkYCBvbmNlIHRoZSBwcmltYXJ5IGNvbnRyaWJ1dGlvbiBpcyB1bmF2YWlsYWJsZSwgd2hpY2hcblx0XHQvLyB3b3VsZCBtYWtlIGEgZ2F0ZWQgY29udHJpYnV0aW9uIHJlYWNoZWQgdmlhIGFuIGFsdGVybmF0aXZlIGlkIHJlYWQgYXNcblx0XHQvLyBcIm5vIGNvbnRyaWJ1dGlvblwiIGFuZCB0aGVyZWZvcmUgYXZhaWxhYmxlLlxuXHRcdGNvbnN0IHByaW1hcnlUeXBlID0gdGhpcy5fY29udHJpYnV0aW9ucy5oYXMoc2Vzc2lvblR5cGUpID8gc2Vzc2lvblR5cGUgOiB0aGlzLl9hbHRlcm5hdGl2ZUlkTWFwLmdldChzZXNzaW9uVHlwZSk7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gcHJpbWFyeVR5cGUgPyB0aGlzLl9jb250cmlidXRpb25zLmdldChwcmltYXJ5VHlwZSk/LmNvbnRyaWJ1dGlvbiA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gIWNvbnRyaWJ1dGlvbiB8fCB0aGlzLl9pc0NvbnRyaWJ1dGlvbkF2YWlsYWJsZShjb250cmlidXRpb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIGEgc2Vzc2lvbiB0eXBlIHRvIGl0cyBwcmltYXJ5IHR5cGUsIGNoZWNraW5nIGZvciBhbHRlcm5hdGl2ZSBJRHMuXG5cdCAqIEBwYXJhbSBzZXNzaW9uVHlwZSBUaGUgc2Vzc2lvbiB0eXBlIG9yIGFsdGVybmF0aXZlIElEIHRvIHJlc29sdmVcblx0ICogQHJldHVybnMgVGhlIHByaW1hcnkgc2Vzc2lvbiB0eXBlLCBvciB1bmRlZmluZWQgaWYgbm90IGZvdW5kIG9yIG5vdCBhdmFpbGFibGVcblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVUb1ByaW1hcnlUeXBlKHNlc3Npb25UeXBlOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdC8vIFRyeSB0byBmaW5kIHRoZSBwcmltYXJ5IHR5cGUgZmlyc3Rcblx0XHRjb25zdCBjb250cmlidXRpb24gPSB0aGlzLl9jb250cmlidXRpb25zLmdldChzZXNzaW9uVHlwZSk/LmNvbnRyaWJ1dGlvbjtcblx0XHRpZiAoY29udHJpYnV0aW9uKSB7XG5cdFx0XHQvLyBJZiB0aGUgY29udHJpYnV0aW9uIGlzIGF2YWlsYWJsZSwgdXNlIGl0XG5cdFx0XHRpZiAodGhpcy5faXNDb250cmlidXRpb25BdmFpbGFibGUoY29udHJpYnV0aW9uKSkge1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvblR5cGU7XG5cdFx0XHR9XG5cdFx0XHQvLyBJZiBub3QgYXZhaWxhYmxlLCBmYWxsIHRocm91Z2ggdG8gY2hlY2sgZm9yIGFsdGVybmF0aXZlc1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoaXMgaXMgYW4gYWx0ZXJuYXRpdmUgSUQsIG9yIGlmIHRoZSBwcmltYXJ5IHR5cGUgaXMgbm90IGF2YWlsYWJsZVxuXHRcdGNvbnN0IHByaW1hcnlUeXBlID0gdGhpcy5fYWx0ZXJuYXRpdmVJZE1hcC5nZXQoc2Vzc2lvblR5cGUpO1xuXHRcdGlmIChwcmltYXJ5VHlwZSkge1xuXHRcdFx0Y29uc3QgYWx0Q29udHJpYnV0aW9uID0gdGhpcy5fY29udHJpYnV0aW9ucy5nZXQocHJpbWFyeVR5cGUpPy5jb250cmlidXRpb247XG5cdFx0XHRpZiAoYWx0Q29udHJpYnV0aW9uICYmIHRoaXMuX2lzQ29udHJpYnV0aW9uQXZhaWxhYmxlKGFsdENvbnRyaWJ1dGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIHByaW1hcnlUeXBlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3Rlck1lbnVJdGVtcyhjb250cmlidXRpb246IElDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCwgZXh0ZW5zaW9uRGVzY3JpcHRpb246IElSZWxheGVkRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHQvLyBBIG5vbi1kZWxlZ2F0aW5nIGNvbnRyaWJ1dGlvbiAoZS5nLiB0aGUgQ29kZXggZWRpdG9yIHNlc3Npb24pIGNyZWF0ZXNcblx0XHQvLyBhIG5ldyBzZXNzaW9uIHZpYSBgb3Blbk5ld0NoYXRTZXNzaW9uRXh0ZXJuYWwuPHR5cGU+YC4gUmVnaXN0ZXIgaXRcblx0XHQvLyBlYWdlcmx5IGFuZCByZXNvbHZlIHRoZSBjcmVhdGUgY29tbWFuZCBsYXppbHksIHNvIGl0IHN1cnZpdmVzIHRoZSByYWNlXG5cdFx0Ly8gd2hlcmUgdGhlIGV4dGVuc2lvbidzIGNyZWF0ZS1zdWJtZW51IGVudHJ5IGlzbid0IHJlZ2lzdGVyZWQgeWV0IGF0XG5cdFx0Ly8gZW5hYmxlIHRpbWUuXG5cdFx0aWYgKCFjb250cmlidXRpb24uY2FuRGVsZWdhdGUpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChyZWdpc3Rlck5ld1Nlc3Npb25FeHRlcm5hbEFjdGlvbihcblx0XHRcdFx0Y29udHJpYnV0aW9uLnR5cGUsXG5cdFx0XHRcdGNvbnRyaWJ1dGlvbi5kaXNwbGF5TmFtZSxcblx0XHRcdFx0KCkgPT4gdGhpcy5fcmVzb2x2ZUNyZWF0ZVN1Yk1lbnVDb21tYW5kSWQoY29udHJpYnV0aW9uLnR5cGUpLFxuXHRcdFx0KSk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgcHJvdmlkZXIgcmVnaXN0ZXJzIGFueXRoaW5nIGZvciB0aGUgY3JlYXRlIHN1Ym1lbnUsIGxldCBpdCBmdWxseSBjb250cm9sIHRoZSBjcmVhdGlvblxuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5fY29udGV4dEtleVNlcnZpY2UuY3JlYXRlT3ZlcmxheShbXG5cdFx0XHRbJ2NoYXRTZXNzaW9uVHlwZScsIGNvbnRyaWJ1dGlvbi50eXBlXVxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcmF3TWVudUFjdGlvbnMgPSB0aGlzLl9tZW51U2VydmljZS5nZXRNZW51QWN0aW9ucyhNZW51SWQuQWdlbnRTZXNzaW9uc0NyZWF0ZVN1Yk1lbnUsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRjb25zdCBtZW51QWN0aW9ucyA9IHJhd01lbnVBY3Rpb25zLm1hcCh2YWx1ZSA9PiB2YWx1ZVsxXSkuZmxhdCgpO1xuXG5cdFx0Ly8gTWlycm9yIGNyZWF0ZSBzdWJtZW51IGFjdGlvbnMgaW50byB0aGUgZ2xvYmFsIENoYXQgTmV3IG1lbnUuIEZvciBhXG5cdFx0Ly8gbm9uLWRlbGVnYXRpbmcgY29udHJpYnV0aW9uIHRoZSBmaXJzdCBhY3Rpb24gaXMgdGhlIHByaW1hcnkgY3JlYXRlXG5cdFx0Ly8gY29tbWFuZCwgYWxyZWFkeSBzdXJmYWNlZCB0aHJvdWdoIHRoZSBleHRlcm5hbCBhY3Rpb24gYWJvdmUsIHNvIHNraXAgaXQuXG5cdFx0Y29uc3QgbWVudUl0ZW1BY3Rpb25zID0gbWVudUFjdGlvbnMuZmlsdGVyKChhY3Rpb24pOiBhY3Rpb24gaXMgTWVudUl0ZW1BY3Rpb24gPT4gYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pO1xuXHRcdGNvbnN0IGFjdGlvbnNUb01pcnJvciA9IGNvbnRyaWJ1dGlvbi5jYW5EZWxlZ2F0ZSA/IG1lbnVJdGVtQWN0aW9ucyA6IG1lbnVJdGVtQWN0aW9ucy5zbGljZSgxKTtcblx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBhY3Rpb25zVG9NaXJyb3IpIHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNoYXROZXdNZW51LCB7XG5cdFx0XHRcdGNvbW1hbmQ6IGFjdGlvbi5pdGVtLFxuXHRcdFx0XHRncm91cDogJzRfZXh0ZXJuYWxseV9jb250cmlidXRlZCcsXG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKClcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBjb21tYW5kIGlkIG9mIHRoZSBwcmltYXJ5IGNyZWF0ZSBhY3Rpb24gY29udHJpYnV0ZWQgdG9cblx0ICoge0BsaW5rIE1lbnVJZC5BZ2VudFNlc3Npb25zQ3JlYXRlU3ViTWVudX0gZm9yIHRoZSBnaXZlbiBzZXNzaW9uIHR5cGUsIG9yXG5cdCAqIGB1bmRlZmluZWRgIHdoZW4gbm8gc3VjaCBhY3Rpb24gaXMgY29udHJpYnV0ZWQgKHlldCkuIFJlYWQgYXQgZXhlY3V0aW9uXG5cdCAqIHRpbWUgc28gaXQgaXMgdW5hZmZlY3RlZCBieSB0aGUgb3JkZXJpbmcgb2YgZXh0ZW5zaW9uIG1lbnUgcmVnaXN0cmF0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzb2x2ZUNyZWF0ZVN1Yk1lbnVDb21tYW5kSWQodHlwZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoW1xuXHRcdFx0WydjaGF0U2Vzc2lvblR5cGUnLCB0eXBlXVxuXHRcdF0pO1xuXHRcdGNvbnN0IHJhd01lbnVBY3Rpb25zID0gdGhpcy5fbWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLkFnZW50U2Vzc2lvbnNDcmVhdGVTdWJNZW51LCBjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Y29uc3QgbWVudUFjdGlvbnMgPSByYXdNZW51QWN0aW9ucy5tYXAodmFsdWUgPT4gdmFsdWVbMV0pLmZsYXQoKTtcblx0XHRmb3IgKGNvbnN0IGFjdGlvbiBvZiBtZW51QWN0aW9ucykge1xuXHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBhY3Rpb24uaXRlbS5pZDtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyQ29tbWFuZHMoY29udHJpYnV0aW9uOiBJQ2hhdFNlc3Npb25zRXh0ZW5zaW9uUG9pbnQpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgaXNBdmFpbGFibGVJblNlc3Npb25UeXBlUGlja2VyID0gaXNBZ2VudFNlc3Npb25Qcm92aWRlclR5cGUoY29udHJpYnV0aW9uLnR5cGUpO1xuXG5cdFx0cmV0dXJuIGNvbWJpbmVkRGlzcG9zYWJsZShcblx0XHRcdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBPcGVuQ2hhdFNlc3Npb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlblNlc3Npb25XaXRoUHJvbXB0LiR7Y29udHJpYnV0aW9uLnR5cGV9YCxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlU2Vzc2lvbi5vcGVuU2Vzc2lvbldpdGhQcm9tcHQnLCBcIk5ldyB7MH0gd2l0aCBQcm9tcHRcIiwgY29udHJpYnV0aW9uLmRpc3BsYXlOYW1lKSxcblx0XHRcdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5wbHVzLFxuXHRcdFx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDaGF0Q29udGV4dEtleXMuZW5hYmxlZFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjaGF0T3B0aW9ucz86IHsgcmVzb3VyY2U6IFVyaUNvbXBvbmVudHM7IHByb21wdDogc3RyaW5nOyBhdHRhY2hlZENvbnRleHQ/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdGNvbnN0IGNoYXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0U2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3QgY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHRvb2xzU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSk7XG5cdFx0XHRcdFx0Y29uc3QgeyB0eXBlIH0gPSBjb250cmlidXRpb247XG5cblx0XHRcdFx0XHRpZiAoY2hhdE9wdGlvbnMpIHtcblx0XHRcdFx0XHRcdGxldCBhdHRhY2hlZENvbnRleHQgPSBjaGF0T3B0aW9ucy5hdHRhY2hlZENvbnRleHQ7XG5cblx0XHRcdFx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5yZXZpdmUoY2hhdE9wdGlvbnMucmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVmID0gYXdhaXQgY2hhdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24oc2Vzc2lvblJlc291cmNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCAnQ2hhdFNlc3Npb25zQ29udHJpYnV0aW9uI3NlbmRQcm9tcHQnKTtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHByb21wdEZpbGUgPSBhd2FpdCByZXNvbHZlUHJvbXB0U2xhc2hDb21tYW5kKGNoYXRPcHRpb25zLnByb21wdCwgc2Vzc2lvblJlc291cmNlLCBjdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIHRvb2xzU2VydmljZSk7XG5cdFx0XHRcdFx0XHRcdGlmIChwcm9tcHRGaWxlKSB7XG5cdFx0XHRcdFx0XHRcdFx0YXR0YWNoZWRDb250ZXh0ID0gW3Byb21wdEZpbGUsIC4uLihhdHRhY2hlZENvbnRleHQgPz8gW10pXTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNoYXRTZXJ2aWNlLnNlbmRSZXF1ZXN0KHNlc3Npb25SZXNvdXJjZSwgY2hhdE9wdGlvbnMucHJvbXB0LCB7IGFnZW50SWRTaWxlbnQ6IHR5cGUsIGF0dGFjaGVkQ29udGV4dCB9KTtcblx0XHRcdFx0XHRcdFx0aWYgKHJlc3VsdC5raW5kID09PSAncXVldWVkJykge1xuXHRcdFx0XHRcdFx0XHRcdGF3YWl0IHJlc3VsdC5kZWZlcnJlZDtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIGlmIChyZXN1bHQua2luZCA9PT0gJ3NlbnQnKSB7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgcmVzdWx0LmRhdGEucmVzcG9uc2VDb21wbGV0ZVByb21pc2U7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdFx0XHRcdHJlZj8uZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0XHQvLyBDcmVhdGVzIGEgY2hhdCBlZGl0b3Jcblx0XHRcdHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBPcGVuTmV3Q2hhdFNlc3Npb25FZGl0b3JBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk5ld1Nlc3Npb25FZGl0b3IuJHtjb250cmlidXRpb24udHlwZX1gLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLm9wZW5OZXdTZXNzaW9uRWRpdG9yJywgXCJOZXcgezB9IFNlc3Npb25cIiwgY29udHJpYnV0aW9uLmRpc3BsYXlOYW1lKSxcblx0XHRcdFx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5wbHVzLFxuXHRcdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjaGF0T3B0aW9ucz86IHsgcHJvbXB0OiBzdHJpbmc7IGF0dGFjaGVkQ29udGV4dD86IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdFx0Y29uc3QgeyB0eXBlLCBkaXNwbGF5TmFtZSB9ID0gY29udHJpYnV0aW9uO1xuXHRcdFx0XHRcdGF3YWl0IG9wZW5DaGF0U2Vzc2lvbihhY2Nlc3NvciwgeyB0eXBlLCBkaXNwbGF5TmFtZSwgcG9zaXRpb246IENoYXRTZXNzaW9uUG9zaXRpb24uRWRpdG9yIH0sIGNoYXRPcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0XHQvLyBOZXcgY2hhdCBpbiBzaWRlYmFyIGNoYXQgKCsgYnV0dG9uKVxuXHRcdFx0cmVnaXN0ZXJBY3Rpb24yKGNsYXNzIE9wZW5OZXdDaGF0U2Vzc2lvblNpZGViYXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdFx0aWQ6IGB3b3JrYmVuY2guYWN0aW9uLmNoYXQub3Blbk5ld1Nlc3Npb25TaWRlYmFyLiR7Y29udHJpYnV0aW9uLnR5cGV9YCxcblx0XHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlU2Vzc2lvbi5vcGVuTmV3U2Vzc2lvblNpZGViYXInLCBcIk5ldyB7MH0gU2Vzc2lvblwiLCBjb250cmlidXRpb24uZGlzcGxheU5hbWUpLFxuXHRcdFx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnBsdXMsXG5cdFx0XHRcdFx0XHRmMTogZmFsc2UsIC8vIEhpZGUgZnJvbSBDb21tYW5kIFBhbGV0dGVcblx0XHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0XHRcdFx0XHRtZW51OiAhaXNBdmFpbGFibGVJblNlc3Npb25UeXBlUGlja2VyID8ge1xuXHRcdFx0XHRcdFx0XHRpZDogTWVudUlkLkNoYXROZXdNZW51LFxuXHRcdFx0XHRcdFx0XHRncm91cDogJzNfbmV3X3NwZWNpYWwnLFxuXHRcdFx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgY2hhdE9wdGlvbnM/OiB7IHByb21wdDogc3RyaW5nOyBhdHRhY2hlZENvbnRleHQ/OiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRcdGNvbnN0IHsgdHlwZSwgZGlzcGxheU5hbWUgfSA9IGNvbnRyaWJ1dGlvbjtcblx0XHRcdFx0XHRhd2FpdCBvcGVuQ2hhdFNlc3Npb24oYWNjZXNzb3IsIHsgdHlwZSwgZGlzcGxheU5hbWUsIHBvc2l0aW9uOiBDaGF0U2Vzc2lvblBvc2l0aW9uLlNpZGViYXIgfSwgY2hhdE9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIF9ldmFsdWF0ZUF2YWlsYWJpbGl0eSgpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdseUVuYWJsZWRDaGF0U2Vzc2lvblR5cGVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgbmV3bHlEaXNhYmxlZENoYXRTZXNzaW9uVHlwZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2VkQ2hhdFNlc3Npb25zID0gbmV3IFJlc291cmNlU2V0KCk7XG5cblx0XHRmb3IgKGNvbnN0IHsgY29udHJpYnV0aW9uLCBleHRlbnNpb24gfSBvZiB0aGlzLl9jb250cmlidXRpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRjb25zdCBpc0N1cnJlbnRseVJlZ2lzdGVyZWQgPSB0aGlzLl9jb250cmlidXRpb25EaXNwb3NhYmxlcy5oYXMoY29udHJpYnV0aW9uLnR5cGUpO1xuXHRcdFx0Y29uc3Qgc2hvdWxkQmVSZWdpc3RlcmVkID0gdGhpcy5faXNDb250cmlidXRpb25BdmFpbGFibGUoY29udHJpYnV0aW9uKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDaGF0U2Vzc2lvbnNTZXJ2aWNlXSBfZXZhbHVhdGVBdmFpbGFiaWxpdHk6IHR5cGU9JyR7Y29udHJpYnV0aW9uLnR5cGV9JywgaXNDdXJyZW50bHlSZWdpc3RlcmVkPSR7aXNDdXJyZW50bHlSZWdpc3RlcmVkfSwgc2hvdWxkQmVSZWdpc3RlcmVkPSR7c2hvdWxkQmVSZWdpc3RlcmVkfSwgd2hlbj0nJHtjb250cmlidXRpb24ud2hlbn0nYCk7XG5cdFx0XHRpZiAoaXNDdXJyZW50bHlSZWdpc3RlcmVkICYmICFzaG91bGRCZVJlZ2lzdGVyZWQpIHtcblx0XHRcdFx0Ly8gRGlzYWJsZSB0aGUgY29udHJpYnV0aW9uIGJ5IGRpc3Bvc2luZyBpdHMgZGlzcG9zYWJsZSBzdG9yZVxuXHRcdFx0XHR0aGlzLl9jb250cmlidXRpb25EaXNwb3NhYmxlcy5kZWxldGVBbmREaXNwb3NlKGNvbnRyaWJ1dGlvbi50eXBlKTtcblxuXHRcdFx0XHQvLyBBbHNvIGRpc3Bvc2UgYW55IGNhY2hlZCBzZXNzaW9ucyBmb3IgdGhpcyBjb250cmlidXRpb25cblx0XHRcdFx0Zm9yIChjb25zdCBzZXNzaW9uUmVzb3VyY2Ugb2YgdGhpcy5fZGlzcG9zZVNlc3Npb25zRm9yQ29udHJpYnV0aW9uKGNvbnRyaWJ1dGlvbi50eXBlKSkge1xuXHRcdFx0XHRcdGRpc3Bvc2VkQ2hhdFNlc3Npb25zLmFkZChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bmV3bHlEaXNhYmxlZENoYXRTZXNzaW9uVHlwZXMuYWRkKGNvbnRyaWJ1dGlvbi50eXBlKTtcblx0XHRcdH0gZWxzZSBpZiAoIWlzQ3VycmVudGx5UmVnaXN0ZXJlZCAmJiBzaG91bGRCZVJlZ2lzdGVyZWQpIHtcblx0XHRcdFx0Ly8gRW5hYmxlIHRoZSBjb250cmlidXRpb24gYnkgcmVnaXN0ZXJpbmcgaXRcblx0XHRcdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0XHRcdHRoaXMuX2VuYWJsZUNvbnRyaWJ1dGlvbihjb250cmlidXRpb24sIGV4dGVuc2lvbik7XG5cdFx0XHRcdH1cblx0XHRcdFx0bmV3bHlFbmFibGVkQ2hhdFNlc3Npb25UeXBlcy5hZGQoY29udHJpYnV0aW9uLnR5cGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAobmV3bHlFbmFibGVkQ2hhdFNlc3Npb25UeXBlcy5zaXplID4gMCB8fCBuZXdseURpc2FibGVkQ2hhdFNlc3Npb25UeXBlcy5zaXplID4gMCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBdmFpbGFiaWxpdHkuZmlyZSgpO1xuXHRcdFx0Zm9yIChjb25zdCBjaGF0U2Vzc2lvblR5cGUgb2YgWy4uLm5ld2x5RW5hYmxlZENoYXRTZXNzaW9uVHlwZXMsIC4uLm5ld2x5RGlzYWJsZWRDaGF0U2Vzc2lvblR5cGVzXSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1zUHJvdmlkZXJzLmZpcmUoeyBjaGF0U2Vzc2lvblR5cGUgfSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChkaXNwb3NlZENoYXRTZXNzaW9ucy5zaXplID4gMCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25JdGVtcy5maXJlKHsgcmVtb3ZlZDogQXJyYXkuZnJvbShkaXNwb3NlZENoYXRTZXNzaW9ucykgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3VwZGF0ZUhhc0NhbkRlbGVnYXRlUHJvdmlkZXJzQ29udGV4dEtleSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZW5hYmxlQ29udHJpYnV0aW9uKGNvbnRyaWJ1dGlvbjogSUNoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50LCBleHQ6IElSZWxheGVkRXh0ZW5zaW9uRGVzY3JpcHRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQ2hhdFNlc3Npb25zU2VydmljZV0gX2VuYWJsZUNvbnRyaWJ1dGlvbjogdHlwZT0nJHtjb250cmlidXRpb24udHlwZX0nLCBjYW5EZWxlZ2F0ZT0ke2NvbnRyaWJ1dGlvbi5jYW5EZWxlZ2F0ZX1gKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0dGhpcy5fY29udHJpYnV0aW9uRGlzcG9zYWJsZXMuc2V0KGNvbnRyaWJ1dGlvbi50eXBlLCBkaXNwb3NhYmxlU3RvcmUpO1xuXHRcdGlmIChjb250cmlidXRpb24uY2FuRGVsZWdhdGUpIHtcblx0XHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQodGhpcy5fcmVnaXN0ZXJBZ2VudChjb250cmlidXRpb24sIGV4dCkpO1xuXHRcdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0aGlzLl9yZWdpc3RlckNvbW1hbmRzKGNvbnRyaWJ1dGlvbikpO1xuXHRcdH1cblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHRoaXMuX3JlZ2lzdGVyTWVudUl0ZW1zKGNvbnRyaWJ1dGlvbiwgZXh0KSk7XG5cdH1cblxuXHQvKipcblx0ICogRGlzcG9zZXMgb2YgYWxsIHNlc3Npb25zIHRoYXQgYmVsb25nIHRvIGEgY29udHJpYnV0aW9uXG5cdCAqXG5cdCAqIEByZXR1cm5zIExpc3Qgb2Ygc2Vzc2lvbiByZXNvdXJjZXMgdGhhdCB3ZXJlIGRpc3Bvc2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBfZGlzcG9zZVNlc3Npb25zRm9yQ29udHJpYnV0aW9uKGNvbnRyaWJ1dGlvbklkOiBzdHJpbmcpOiBVUklbXSB7XG5cdFx0Ly8gRmluZCBhbmQgZGlzcG9zZSBhbGwgc2Vzc2lvbnMgdGhhdCBiZWxvbmcgdG8gdGhpcyBjb250cmlidXRpb25cblx0XHRjb25zdCBzZXNzaW9uc1RvRGlzcG9zZTogVVJJW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IFtzZXNzaW9uUmVzb3VyY2UsIHNlc3Npb25EYXRhXSBvZiB0aGlzLl9zZXNzaW9ucykge1xuXHRcdFx0aWYgKHNlc3Npb25EYXRhLmNoYXRTZXNzaW9uVHlwZSA9PT0gY29udHJpYnV0aW9uSWQpIHtcblx0XHRcdFx0c2Vzc2lvbnNUb0Rpc3Bvc2UucHVzaChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChzZXNzaW9uc1RvRGlzcG9zZS5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYERpc3Bvc2luZyAke3Nlc3Npb25zVG9EaXNwb3NlLmxlbmd0aH0gY2FjaGVkIHNlc3Npb25zIGZvciBjb250cmlidXRpb24gJyR7Y29udHJpYnV0aW9uSWR9JyBkdWUgdG8gd2hlbiBjbGF1c2UgY2hhbmdlYCk7XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBzZXNzaW9uS2V5IG9mIHNlc3Npb25zVG9EaXNwb3NlKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YSA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uS2V5KTtcblx0XHRcdGlmIChzZXNzaW9uRGF0YSkge1xuXHRcdFx0XHRzZXNzaW9uRGF0YS5kaXNwb3NlKCk7IC8vIFRoaXMgd2lsbCBjYWxsIF9vbldpbGxEaXNwb3NlU2Vzc2lvbiBhbmQgY2xlYW4gdXBcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHNlc3Npb25zVG9EaXNwb3NlO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJBZ2VudChjb250cmlidXRpb246IElDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCwgZXh0OiBJUmVsYXhlZEV4dGVuc2lvbkRlc2NyaXB0aW9uKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHN0b3JlZEljb24gPSB0aGlzLmdldENvbnRyaWJ1dGlvbkljb24oZXh0LCBjb250cmlidXRpb24pO1xuXHRcdGNvbnN0IGljb25zID0gVGhlbWVJY29uLmlzVGhlbWVJY29uKHN0b3JlZEljb24pXG5cdFx0XHQ/IHsgdGhlbWVJY29uOiBzdG9yZWRJY29uLCBpY29uOiB1bmRlZmluZWQsIGljb25EYXJrOiB1bmRlZmluZWQgfVxuXHRcdFx0OiBzdG9yZWRJY29uXG5cdFx0XHRcdD8geyBpY29uOiBzdG9yZWRJY29uLmxpZ2h0LCBpY29uRGFyazogc3RvcmVkSWNvbi5kYXJrIH1cblx0XHRcdFx0OiB7IHRoZW1lSWNvbjogQ29kaWNvbi5zZW5kVG9SZW1vdGVBZ2VudCB9O1xuXG5cdFx0Y29uc3QgaWQgPSBjb250cmlidXRpb24udHlwZTtcblx0XHRjb25zdCBhZ2VudERhdGE6IElDaGF0QWdlbnREYXRhID0ge1xuXHRcdFx0aWQsXG5cdFx0XHRuYW1lOiBjb250cmlidXRpb24ubmFtZSxcblx0XHRcdGZ1bGxOYW1lOiBjb250cmlidXRpb24uZGlzcGxheU5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogY29udHJpYnV0aW9uLmRlc2NyaXB0aW9uLFxuXHRcdFx0aXNEZWZhdWx0OiBmYWxzZSxcblx0XHRcdGlzQ29yZTogZmFsc2UsXG5cdFx0XHRpc0R5bmFtaWM6IHRydWUsXG5cdFx0XHRzbGFzaENvbW1hbmRzOiBjb250cmlidXRpb24uY29tbWFuZHMgPz8gW10sXG5cdFx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSxcblx0XHRcdG1vZGVzOiBbQ2hhdE1vZGVLaW5kLkFnZW50LCBDaGF0TW9kZUtpbmQuQXNrXSxcblx0XHRcdGRpc2FtYmlndWF0aW9uOiBbXSxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdC4uLmljb25zLFxuXHRcdFx0fSxcblx0XHRcdGNhcGFiaWxpdGllczogY29udHJpYnV0aW9uLmNhcGFiaWxpdGllcyxcblx0XHRcdGNhbkFjY2Vzc1ByZXZpb3VzQ2hhdEhpc3Rvcnk6IHRydWUsXG5cdFx0XHRleHRlbnNpb25JZDogZXh0LmlkZW50aWZpZXIsXG5cdFx0XHRleHRlbnNpb25WZXJzaW9uOiBleHQudmVyc2lvbixcblx0XHRcdGV4dGVuc2lvbkRpc3BsYXlOYW1lOiBleHQuZGlzcGxheU5hbWUgfHwgZXh0Lm5hbWUsXG5cdFx0XHRleHRlbnNpb25QdWJsaXNoZXJJZDogZXh0LnB1Ymxpc2hlcixcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHRoaXMuX2NoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudChpZCwgYWdlbnREYXRhKTtcblx0fVxuXG5cdGdldEFsbENoYXRTZXNzaW9uQ29udHJpYnV0aW9ucygpOiBSZXNvbHZlZENoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50W10ge1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHRoaXMuX2NvbnRyaWJ1dGlvbnMudmFsdWVzKCkpXG5cdFx0XHQuZmlsdGVyKGVudHJ5ID0+IHRoaXMuX2lzQ29udHJpYnV0aW9uQXZhaWxhYmxlKGVudHJ5LmNvbnRyaWJ1dGlvbikpXG5cdFx0XHQubWFwKGVudHJ5ID0+IHRoaXMucmVzb2x2ZUNoYXRTZXNzaW9uQ29udHJpYnV0aW9uKGVudHJ5LmV4dGVuc2lvbiwgZW50cnkuY29udHJpYnV0aW9uKSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVIYXNDYW5EZWxlZ2F0ZVByb3ZpZGVyc0NvbnRleHRLZXkoKTogdm9pZCB7XG5cdFx0Y29uc3QgaGFzQ2FuRGVsZWdhdGUgPSB0aGlzLmdldEFsbENoYXRTZXNzaW9uQ29udHJpYnV0aW9ucygpLmZpbHRlcihjID0+IGMuY2FuRGVsZWdhdGUpO1xuXHRcdGNvbnN0IGNhbkRlbGVnYXRlRW5hYmxlZCA9IGhhc0NhbkRlbGVnYXRlLmxlbmd0aCA+IDA7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NoYXRTZXNzaW9uc1NlcnZpY2VdIGhhc0NhbkRlbGVnYXRlUHJvdmlkZXJzQXZhaWxhYmxlPSR7Y2FuRGVsZWdhdGVFbmFibGVkfSAoJHtoYXNDYW5EZWxlZ2F0ZS5tYXAoYyA9PiBjLnR5cGUpLmpvaW4oJywgJyl9KWApO1xuXHRcdHRoaXMuX2hhc0NhbkRlbGVnYXRlUHJvdmlkZXJzS2V5LnNldChjYW5EZWxlZ2F0ZUVuYWJsZWQpO1xuXHR9XG5cblx0Z2V0Q2hhdFNlc3Npb25Db250cmlidXRpb24oY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcpOiBSZXNvbHZlZENoYXRTZXNzaW9uc0V4dGVuc2lvblBvaW50IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2NvbnRyaWJ1dGlvbnMuZ2V0KGNoYXRTZXNzaW9uVHlwZSk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2lzQ29udHJpYnV0aW9uQXZhaWxhYmxlKGVudHJ5LmNvbnRyaWJ1dGlvbikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucmVzb2x2ZUNoYXRTZXNzaW9uQ29udHJpYnV0aW9uKGVudHJ5LmV4dGVuc2lvbiwgZW50cnkuY29udHJpYnV0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZUNoYXRTZXNzaW9uQ29udHJpYnV0aW9uKGV4dDogSVJlbGF4ZWRFeHRlbnNpb25EZXNjcmlwdGlvbiB8IHVuZGVmaW5lZCwgY29udHJpYnV0aW9uOiBJQ2hhdFNlc3Npb25zRXh0ZW5zaW9uUG9pbnQpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uY29udHJpYnV0aW9uLFxuXHRcdFx0aWNvbjogdGhpcy5yZXNvbHZlSWNvbkZvckN1cnJlbnRDb2xvclRoZW1lKHRoaXMuZ2V0Q29udHJpYnV0aW9uSWNvbihleHQsIGNvbnRyaWJ1dGlvbikpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGdldENvbnRyaWJ1dGlvbkljb24oZXh0OiBJUmVsYXhlZEV4dGVuc2lvbkRlc2NyaXB0aW9uIHwgdW5kZWZpbmVkLCBjb250cmlidXRpb246IElDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCk6IFRoZW1lSWNvbiB8IHsgbGlnaHQ6IFVSSTsgZGFyazogVVJJIH0gfCB1bmRlZmluZWQge1xuXHRcdGlmICghY29udHJpYnV0aW9uLmljb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgY29udHJpYnV0aW9uLmljb24gPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gY29udHJpYnV0aW9uLmljb24uc3RhcnRzV2l0aCgnJCgnKSAmJiBjb250cmlidXRpb24uaWNvbi5lbmRzV2l0aCgnKScpXG5cdFx0XHRcdD8gVGhlbWVJY29uLmZyb21TdHJpbmcoY29udHJpYnV0aW9uLmljb24pXG5cdFx0XHRcdDogVGhlbWVJY29uLmZyb21JZChjb250cmlidXRpb24uaWNvbik7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRkYXJrOiBleHQgPyByZXNvdXJjZXMuam9pblBhdGgoZXh0LmV4dGVuc2lvbkxvY2F0aW9uLCBjb250cmlidXRpb24uaWNvbi5kYXJrKSA6IFVSSS5wYXJzZShjb250cmlidXRpb24uaWNvbi5kYXJrKSxcblx0XHRcdGxpZ2h0OiBleHQgPyByZXNvdXJjZXMuam9pblBhdGgoZXh0LmV4dGVuc2lvbkxvY2F0aW9uLCBjb250cmlidXRpb24uaWNvbi5saWdodCkgOiBVUkkucGFyc2UoY29udHJpYnV0aW9uLmljb24ubGlnaHQpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZUljb25Gb3JDdXJyZW50Q29sb3JUaGVtZShyYXdJY29uOiBUaGVtZUljb24gfCB7IGxpZ2h0OiBVUkk7IGRhcms6IFVSSSB9IHwgdW5kZWZpbmVkKSB7XG5cdFx0aWYgKCFyYXdJY29uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChUaGVtZUljb24uaXNUaGVtZUljb24ocmF3SWNvbikpIHtcblx0XHRcdHJldHVybiByYXdJY29uO1xuXHRcdH0gZWxzZSBpZiAoaXNEYXJrKHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkudHlwZSkpIHtcblx0XHRcdHJldHVybiByYXdJY29uLmRhcms7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiByYXdJY29uLmxpZ2h0O1xuXHRcdH1cblx0fVxuXG5cblx0cmVnaXN0ZXJDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbihjb250cmlidXRpb246IElDaGF0U2Vzc2lvbnNFeHRlbnNpb25Qb2ludCk6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5fY29udHJpYnV0aW9ucy5oYXMoY29udHJpYnV0aW9uLnR5cGUpKSB7XG5cdFx0XHRyZXR1cm4geyBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHR9XG5cblx0XHR0aGlzLl9jb250cmlidXRpb25zLnNldChjb250cmlidXRpb24udHlwZSwgeyBjb250cmlidXRpb24sIGV4dGVuc2lvbjogdW5kZWZpbmVkIH0pO1xuXHRcdC8vIFByb2dyYW1tYXRpY2FsbHktcmVnaXN0ZXJlZCBjb250cmlidXRpb25zIGFyZSBhbHdheXMgY29uc2lkZXJlZFxuXHRcdC8vIGF2YWlsYWJsZTsgbWFyayB0aGVtIGFzIHN1Y2ggc28gdGhlIGF1dG9ydW4gaW4gdGhlIGNvbnN0cnVjdG9yXG5cdFx0Ly8gcmVnaXN0ZXJzIHRoZSBpbi1wbGFjZSBcIk5ldyB7MH0gU2Vzc2lvblwiIGFjdGlvbiBmb3IgdGhlbS4gV2l0aG91dFxuXHRcdC8vIHRoaXMsIHR5cGVzIGxpa2UgYGFnZW50LWhvc3QtY29waWxvdGNsaWAgKHJlZ2lzdGVyZWQgYnkgdGhlIGxvY2FsXG5cdFx0Ly8gYWdlbnQgaG9zdCkgaGF2ZSBubyBgb3Blbk5ld0NoYXRTZXNzaW9uSW5QbGFjZS48dHlwZT5gIGNvbW1hbmQuXG5cdFx0dGhpcy5fY29udHJpYnV0aW9uRGlzcG9zYWJsZXMuc2V0KGNvbnRyaWJ1dGlvbi50eXBlLCBuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdHRoaXMuX3VwZGF0ZUhhc0NhbkRlbGVnYXRlUHJvdmlkZXJzQ29udGV4dEtleSgpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQXZhaWxhYmlsaXR5LmZpcmUoKTtcblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29udHJpYnV0aW9ucy5kZWxldGUoY29udHJpYnV0aW9uLnR5cGUpO1xuXHRcdFx0dGhpcy5fY29udHJpYnV0aW9uRGlzcG9zYWJsZXMuZGVsZXRlQW5kRGlzcG9zZShjb250cmlidXRpb24udHlwZSk7XG5cdFx0XHR0aGlzLl91cGRhdGVIYXNDYW5EZWxlZ2F0ZVByb3ZpZGVyc0NvbnRleHRLZXkoKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQXZhaWxhYmlsaXR5LmZpcmUoKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIGFjdGl2YXRlQ2hhdFNlc3Npb25JdGVtUHJvdmlkZXIoY2hhdFZpZXdUeXBlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmRvQWN0aXZhdGVDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRWaWV3VHlwZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvQWN0aXZhdGVDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRWaWV3VHlwZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0YXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRjb25zdCByZXNvbHZlZFR5cGUgPSB0aGlzLl9yZXNvbHZlVG9QcmltYXJ5VHlwZShjaGF0Vmlld1R5cGUpO1xuXHRcdGlmIChyZXNvbHZlZFR5cGUpIHtcblx0XHRcdGNoYXRWaWV3VHlwZSA9IHJlc29sdmVkVHlwZTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2lzQ29udHJpYnV0aW9uQXZhaWxhYmxlRm9yVHlwZShjaGF0Vmlld1R5cGUpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2l0ZW1Db250cm9sbGVycy5oYXMoY2hhdFZpZXdUeXBlKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoYG9uQ2hhdFNlc3Npb246JHtjaGF0Vmlld1R5cGV9YCk7XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gdGhpcy5faXRlbUNvbnRyb2xsZXJzLmdldChjaGF0Vmlld1R5cGUpITtcblx0XHRyZXR1cm4gISFjb250cm9sbGVyO1xuXHR9XG5cblx0YXN5bmMgY2FuUmVzb2x2ZUNoYXRTZXNzaW9uKHNlc3Npb25UeXBlOiBzdHJpbmcpIHtcblx0XHRhd2FpdCB0aGlzLl9leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXHRcdGlmICghdGhpcy5faXNDb250cmlidXRpb25BdmFpbGFibGVGb3JUeXBlKHNlc3Npb25UeXBlKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jb250ZW50UHJvdmlkZXJzLmhhcyhzZXNzaW9uVHlwZSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFzeW5jQWN0aXZhdG9ycyA9IHRoaXMuX2FzeW5jQWN0aXZhdGlvblJlZ2lzdHJ5LmdldEFjdGl2YXRvcnMoc2Vzc2lvblR5cGUpO1xuXHRcdGlmIChhc3luY0FjdGl2YXRvcnMubGVuZ3RoKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGFjdGl2YXRvciBvZiBhc3luY0FjdGl2YXRvcnMpIHtcblx0XHRcdFx0aWYgKGF3YWl0IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGFjdGl2YXRvci53YWl0Rm9yQWN0aXZhdGlvbihhY2Nlc3Nvciwgc2Vzc2lvblR5cGUpKSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMud2FpdEZvckNvbnRlbnRQcm92aWRlcihzZXNzaW9uVHlwZSk7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX2NvbnRlbnRQcm92aWRlcnMuaGFzKHNlc3Npb25UeXBlKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoYG9uQ2hhdFNlc3Npb246JHtzZXNzaW9uVHlwZX1gKTtcblx0XHRyZXR1cm4gdGhpcy5fY29udGVudFByb3ZpZGVycy5oYXMoc2Vzc2lvblR5cGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3YWl0Rm9yQ29udGVudFByb3ZpZGVyKHNlc3Npb25UeXBlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fY29udGVudFByb3ZpZGVycy5oYXMoc2Vzc2lvblR5cGUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcih0aGlzLm9uRGlkQ2hhbmdlQ29udGVudFByb3ZpZGVyU2NoZW1lcywgZSA9PiBlLmFkZGVkLmluY2x1ZGVzKHNlc3Npb25UeXBlKSkpO1xuXHR9XG5cblx0YXN5bmMgcHJvdmlkZUNoYXRJbnB1dENvbXBsZXRpb25zKHNlc3Npb25SZXNvdXJjZTogVVJJLCBwYXJhbXM6IElDaGF0SW5wdXRDb21wbGV0aW9uc1BhcmFtcywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdElucHV0Q29tcGxldGlvbnNSZXN1bHQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uVHlwZSA9IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IHJlc29sdmVkVHlwZSA9IHRoaXMuX3Jlc29sdmVUb1ByaW1hcnlUeXBlKHNlc3Npb25UeXBlKSB8fCBzZXNzaW9uVHlwZTtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2NvbnRlbnRQcm92aWRlcnMuZ2V0KHJlc29sdmVkVHlwZSk7XG5cdFx0aWYgKCFwcm92aWRlcj8ucHJvdmlkZUNoYXRJbnB1dENvbXBsZXRpb25zKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvdmlkZXIucHJvdmlkZUNoYXRJbnB1dENvbXBsZXRpb25zKHNlc3Npb25SZXNvdXJjZSwgcGFyYW1zLCB0b2tlbik7XG5cdH1cblxuXHRyZXNvbHZlQ2hhdFJlc3BvbnNlVXJpKHNlc3Npb25SZXNvdXJjZTogVVJJLCBocmVmOiBzdHJpbmcsIGtpbmQ6ICdsaW5rJyB8ICdpbWFnZScpOiBzdHJpbmcge1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgcmVzb2x2ZWRUeXBlID0gdGhpcy5fcmVzb2x2ZVRvUHJpbWFyeVR5cGUoc2Vzc2lvblR5cGUpIHx8IHNlc3Npb25UeXBlO1xuXHRcdHJldHVybiB0aGlzLl9jb250ZW50UHJvdmlkZXJzLmdldChyZXNvbHZlZFR5cGUpPy5yZXNvbHZlQ2hhdFJlc3BvbnNlVXJpPy4oc2Vzc2lvblJlc291cmNlLCBocmVmLCBraW5kKSA/PyBocmVmO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q2hhdElucHV0Q29tcGxldGlvblRyaWdnZXJDaGFyYWN0ZXJzKHNlc3Npb25UeXBlOiBzdHJpbmcpOiBQcm9taXNlPHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVzb2x2ZWRUeXBlID0gdGhpcy5fcmVzb2x2ZVRvUHJpbWFyeVR5cGUoc2Vzc2lvblR5cGUpIHx8IHNlc3Npb25UeXBlO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gdGhpcy5fY29udGVudFByb3ZpZGVycy5nZXQocmVzb2x2ZWRUeXBlKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoIXByb3ZpZGVyLnByb3ZpZGVDaGF0SW5wdXRDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIHByb3ZpZGVyLnByb3ZpZGVDaGF0SW5wdXRDb21wbGV0aW9uVHJpZ2dlckNoYXJhY3RlcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdHJ5QWN0aXZhdGVDb250cm9sbGVycyhwcm92aWRlcnNUb1Jlc29sdmU6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwodGhpcy5nZXRBbGxDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbnMoKS5tYXAoYXN5bmMgKGNvbnRyaWIpID0+IHtcblx0XHRcdGlmIChwcm92aWRlcnNUb1Jlc29sdmUgJiYgIXByb3ZpZGVyc1RvUmVzb2x2ZS5pbmNsdWRlcyhjb250cmliLnR5cGUpKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gc2tpcDogbm90IGNvbnNpZGVyZWQgZm9yIHJlc29sdmluZ1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWF3YWl0IHRoaXMuZG9BY3RpdmF0ZUNoYXRTZXNzaW9uSXRlbUNvbnRyb2xsZXIoY29udHJpYi50eXBlKSkge1xuXHRcdFx0XHQvLyBXZSByZXF1ZXN0ZWQgdGhpcyBwcm92aWRlciBidXQgaXQgaXMgbm90IGF2YWlsYWJsZVxuXHRcdFx0XHRpZiAocHJvdmlkZXJzVG9SZXNvbHZlPy5pbmNsdWRlcyhjb250cmliLnR5cGUpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0NoYXRTZXNzaW9uc1NlcnZpY2VdIE5vIGVuYWJsZWQgcHJvdmlkZXIgZm91bmQgZm9yIGNoYXQgc2Vzc2lvbiB0eXBlICR7Y29udHJpYi50eXBlfWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHVibGljIGdldENoYXRTZXNzaW9uSXRlbXMocHJvdmlkZXJzVG9SZXNvbHZlOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogQXN5bmNJdGVyYWJsZTx7IHJlYWRvbmx5IGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nOyByZWFkb25seSBpdGVtczogcmVhZG9ubHkgSUNoYXRTZXNzaW9uSXRlbVtdIH0+IHtcblx0XHRyZXR1cm4gbmV3IEFzeW5jSXRlcmFibGVQcm9kdWNlcihhc3luYyB3cml0ZXIgPT4ge1xuXHRcdFx0Ly8gRmlyc3QsIG1ha2Ugc3VyZSBjb250cmlidXRlZCBjb250cm9sbGVyIGFyZSBhY3RpdmVcblx0XHRcdGF3YWl0IHJhY2VDYW5jZWxsYXRpb25FcnJvcih0aGlzLnRyeUFjdGl2YXRlQ29udHJvbGxlcnMocHJvdmlkZXJzVG9SZXNvbHZlKSwgdG9rZW4pO1xuXG5cdFx0XHQvLyBUaGVuIGFjdHVhbGx5IHJlc29sdmUgaXRlbXMgZm9yIGFsbCBhY3RpdmUgY29udHJvbGxlcnNcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKEFycmF5LmZyb20odGhpcy5faXRlbUNvbnRyb2xsZXJzLCBhc3luYyAoW2NoYXRTZXNzaW9uVHlwZSwgY29udHJvbGxlckVudHJ5XSkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvbHZlZFR5cGUgPSB0aGlzLl9yZXNvbHZlVG9QcmltYXJ5VHlwZShjaGF0U2Vzc2lvblR5cGUpID8/IGNoYXRTZXNzaW9uVHlwZTtcblx0XHRcdFx0aWYgKHByb3ZpZGVyc1RvUmVzb2x2ZSAmJiAhcHJvdmlkZXJzVG9SZXNvbHZlLmluY2x1ZGVzKHJlc29sdmVkVHlwZSkpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIHNraXA6IG5vdCBjb25zaWRlcmVkIGZvciByZXNvbHZpbmdcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFNraXAgY29udHJvbGxlcnMgd2hvc2UgY29udHJpYnV0aW9uIGlzIGdhdGVkIG9mZiBieSBpdHMgYHdoZW5gXG5cdFx0XHRcdC8vIGNsYXVzZS4gVGhlIGl0ZW0gY29udHJvbGxlciBpcyByZWdpc3RlcmVkIGluZGVwZW5kZW50bHkgb2YgdGhlXG5cdFx0XHRcdC8vIGNvbnRyaWJ1dGlvbiAoZS5nLiBieSB0aGUgZXh0ZW5zaW9uIGhvc3QpLCBzbyB3aXRob3V0IHRoaXMgY2hlY2tcblx0XHRcdFx0Ly8gaXRzIHNlc3Npb25zIHdvdWxkIHN0aWxsIGJlIGxpc3RlZCBldmVuIHRob3VnaCB0aGV5IGNhbiBubyBsb25nZXJcblx0XHRcdFx0Ly8gYmUgcmVzb2x2ZWQvb3BlbmVkICh3aGljaCBvYmV5cyB0aGUgc2FtZSBgd2hlbmAgdmlhIGNhblJlc29sdmVDaGF0U2Vzc2lvbikuXG5cdFx0XHRcdGlmICghdGhpcy5faXNDb250cmlidXRpb25BdmFpbGFibGVGb3JUeXBlKGNoYXRTZXNzaW9uVHlwZSkpIHtcblx0XHRcdFx0XHRyZXR1cm47IC8vIHNraXA6IGNvbnRyaWJ1dGlvbiBkaXNhYmxlZCBieSBpdHMgYHdoZW5gIGNsYXVzZVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IoY29udHJvbGxlckVudHJ5LmluaXRpYWxSZWZyZXNoLCB0b2tlbik7IC8vIEVuc3VyZSBpbml0aWFsIHJlZnJlc2ggaXMgY29tcGxldGUgYmVmb3JlIGFjY2Vzc2luZyBpdGVtc1xuXG5cdFx0XHRcdFx0Y29uc3QgcHJvdmlkZXJTZXNzaW9ucyA9IGNvbnRyb2xsZXJFbnRyeS5jb250cm9sbGVyLml0ZW1zO1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtDaGF0U2Vzc2lvbnNTZXJ2aWNlXSBSZXNvbHZlZCAke3Byb3ZpZGVyU2Vzc2lvbnMubGVuZ3RofSBzZXNzaW9ucyBmb3IgcHJvdmlkZXIgJHtyZXNvbHZlZFR5cGV9YCk7XG5cdFx0XHRcdFx0d3JpdGVyLmVtaXRPbmUoeyBjaGF0U2Vzc2lvblR5cGU6IHJlc29sdmVkVHlwZSwgaXRlbXM6IHByb3ZpZGVyU2Vzc2lvbnMgfSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdFx0XHQvLyBMb2cgZXJyb3IgYnV0IGNvbnRpbnVlIHdpdGggb3RoZXIgcHJvdmlkZXJzXG5cdFx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQ2hhdFNlc3Npb25zU2VydmljZV0gRmFpbGVkIHRvIHJlc29sdmUgc2Vzc2lvbnMgZm9yIHByb3ZpZGVyICR7cmVzb2x2ZWRUeXBlfWAsIGVycik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVmcmVzaENoYXRTZXNzaW9uSXRlbXMocHJvdmlkZXJzVG9SZXNvbHZlOiByZWFkb25seSBzdHJpbmdbXSB8IHVuZGVmaW5lZCwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy50cnlBY3RpdmF0ZUNvbnRyb2xsZXJzKHByb3ZpZGVyc1RvUmVzb2x2ZSk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChBcnJheS5mcm9tKHRoaXMuX2l0ZW1Db250cm9sbGVycykubWFwKGFzeW5jIChbY2hhdFNlc3Npb25UeXBlLCBjb250cm9sbGVyRW50cnldKSA9PiB7XG5cdFx0XHRjb25zdCByZXNvbHZlZFR5cGUgPSB0aGlzLl9yZXNvbHZlVG9QcmltYXJ5VHlwZShjaGF0U2Vzc2lvblR5cGUpID8/IGNoYXRTZXNzaW9uVHlwZTtcblx0XHRcdGlmIChwcm92aWRlcnNUb1Jlc29sdmUgJiYgIXByb3ZpZGVyc1RvUmVzb2x2ZS5pbmNsdWRlcyhyZXNvbHZlZFR5cGUpKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gc2tpcDogbm90IGNvbnNpZGVyZWQgZm9yIHJlc29sdmluZ1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBjb250cm9sbGVyRW50cnkuY29udHJvbGxlci5yZWZyZXNoKHRva2VuKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSkge1xuXHRcdFx0XHRcdC8vIExvZyBlcnJvciBidXQgY29udGludWUgd2l0aCBvdGhlciBwcm92aWRlcnNcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQ2hhdFNlc3Npb25zU2VydmljZV0gRmFpbGVkIHRvIHJlc29sdmUgc2Vzc2lvbnMgZm9yIHByb3ZpZGVyICR7cmVzb2x2ZWRUeXBlfWAsIGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRnZXRSZWdpc3RlcmVkQ2hhdFNlc3Npb25JdGVtUHJvdmlkZXJzKCk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gWy4uLm5ldyBTZXQoQXJyYXkuZnJvbSh0aGlzLl9pdGVtQ29udHJvbGxlcnMua2V5cygpKS5tYXAoa2V5ID0+IHRoaXMuX3Jlc29sdmVUb1ByaW1hcnlUeXBlKGtleSkgPz8ga2V5KSldO1xuXHR9XG5cblx0cmVnaXN0ZXJDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nLCBjb250cm9sbGVyOiBJQ2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcik6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXG5cdFx0Ly8gUmVnaXN0ZXIgYW5kIHRyaWdnZXIgYW4gaW5pdGlhbCByZWZyZXNoIHRvIHBvcHVsYXRlIHRoZSBwcm92aWRlcidzIGl0ZW1zXG5cdFx0Y29uc3QgaW5pdGlhbFJlZnJlc2hDdHMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXHRcdHRoaXMuX2l0ZW1Db250cm9sbGVycy5zZXQoY2hhdFNlc3Npb25UeXBlLCB7IGNvbnRyb2xsZXIsIGluaXRpYWxSZWZyZXNoOiBjb250cm9sbGVyLnJlZnJlc2goaW5pdGlhbFJlZnJlc2hDdHMudG9rZW4pIH0pO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbXNQcm92aWRlcnMuZmlyZSh7IGNoYXRTZXNzaW9uVHlwZSB9KTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChjb250cm9sbGVyLm9uRGlkQ2hhbmdlQ2hhdFNlc3Npb25JdGVtcyhlID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbkl0ZW1zLmZpcmUoZSk7XG5cdFx0XHR0aGlzLnVwZGF0ZUluUHJvZ3Jlc3NTdGF0dXMoY2hhdFNlc3Npb25UeXBlKTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpbml0aWFsUmVmcmVzaEN0cy5jYW5jZWwoKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXG5cdFx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSB0aGlzLl9pdGVtQ29udHJvbGxlcnMuZ2V0KGNoYXRTZXNzaW9uVHlwZSk7XG5cdFx0XHRcdGlmIChjb250cm9sbGVyKSB7XG5cdFx0XHRcdFx0dGhpcy5faXRlbUNvbnRyb2xsZXJzLmRlbGV0ZShjaGF0U2Vzc2lvblR5cGUpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlSXRlbXNQcm92aWRlcnMuZmlyZSh7IGNoYXRTZXNzaW9uVHlwZSB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFJlbW92ZSBhbnkgaW4tcHJvZ3Jlc3MgdHJhY2tpbmcgZm9yIHRoaXMgcHJvdmlkZXIgc2luY2UgaXQncyBubyBsb25nZXIgYXZhaWxhYmxlXG5cdFx0XHRcdHRoaXMudXBkYXRlSW5Qcm9ncmVzc1N0YXR1cyhjaGF0U2Vzc2lvblR5cGUpO1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRyZWdpc3RlckNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nLCBwcm92aWRlcjogSUNoYXRTZXNzaW9uQ29udGVudFByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRcdGlmICh0aGlzLl9jb250ZW50UHJvdmlkZXJzLmhhcyhjaGF0U2Vzc2lvblR5cGUpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvbnRlbnQgcHJvdmlkZXIgZm9yICR7Y2hhdFNlc3Npb25UeXBlfSBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQuYCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29udGVudFByb3ZpZGVycy5zZXQoY2hhdFNlc3Npb25UeXBlLCBwcm92aWRlcik7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VDb250ZW50UHJvdmlkZXJTY2hlbWVzLmZpcmUoeyBhZGRlZDogW2NoYXRTZXNzaW9uVHlwZV0sIHJlbW92ZWQ6IFtdIH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5fY29udGVudFByb3ZpZGVycy5kZWxldGUoY2hhdFNlc3Npb25UeXBlKTtcblxuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRlbnRQcm92aWRlclNjaGVtZXMuZmlyZSh7IGFkZGVkOiBbXSwgcmVtb3ZlZDogW2NoYXRTZXNzaW9uVHlwZV0gfSk7XG5cblx0XHRcdFx0Ly8gUmVtb3ZlIGFsbCBzZXNzaW9ucyB0aGF0IHdlcmUgY3JlYXRlZCBieSB0aGlzIHByb3ZpZGVyXG5cdFx0XHRcdGZvciAoY29uc3QgW2tleSwgc2Vzc2lvbl0gb2YgdGhpcy5fc2Vzc2lvbnMpIHtcblx0XHRcdFx0XHRpZiAoc2Vzc2lvbi5jaGF0U2Vzc2lvblR5cGUgPT09IGNoYXRTZXNzaW9uVHlwZSkge1xuXHRcdFx0XHRcdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHR0aGlzLl9zZXNzaW9ucy5kZWxldGUoa2V5KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cmVnaXN0ZXJDdXN0b21pemF0aW9uc1Byb3ZpZGVyKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nLCBwcm92aWRlcjogSUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnNQcm92aWRlcik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9jdXN0b21pemF0aW9uc1Byb3ZpZGVycy5zZXQoY2hhdFNlc3Npb25UeXBlLCBwcm92aWRlcik7XG5cdFx0Y29uc3Qgb25DaGFuZ2VEaXNwb3NhYmxlID0gcHJvdmlkZXIub25EaWRDaGFuZ2VDdXN0b21pemF0aW9ucygoKSA9PiB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUN1c3RvbWl6YXRpb25zLmZpcmUoeyBjaGF0U2Vzc2lvblR5cGUgfSk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRvbkNoYW5nZURpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0aWYgKHRoaXMuX2N1c3RvbWl6YXRpb25zUHJvdmlkZXJzLmdldChjaGF0U2Vzc2lvblR5cGUpID09PSBwcm92aWRlcikge1xuXHRcdFx0XHR0aGlzLl9jdXN0b21pemF0aW9uc1Byb3ZpZGVycy5kZWxldGUoY2hhdFNlc3Npb25UeXBlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGhhc0N1c3RvbWl6YXRpb25zUHJvdmlkZXIoY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fY3VzdG9taXphdGlvbnNQcm92aWRlcnMuaGFzKGNoYXRTZXNzaW9uVHlwZSk7XG5cdH1cblxuXHRhc3luYyBnZXRDdXN0b21pemF0aW9ucyhjaGF0U2Vzc2lvblR5cGU6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uSXRlbUdyb3VwW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuX2N1c3RvbWl6YXRpb25zUHJvdmlkZXJzLmdldChjaGF0U2Vzc2lvblR5cGUpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBwcm92aWRlci5wcm92aWRlQ3VzdG9taXphdGlvbnModG9rZW4pO1xuXHR9XG5cblx0YXN5bmMgY3JlYXRlTmV3Q2hhdFNlc3Npb25JdGVtKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nLCByZXF1ZXN0OiBJQ2hhdE5ld1Nlc3Npb25SZXF1ZXN0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0U2Vzc2lvbkl0ZW0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjb250cm9sbGVyRGF0YSA9IHRoaXMuX2l0ZW1Db250cm9sbGVycy5nZXQoY2hhdFNlc3Npb25UeXBlKTtcblx0XHRpZiAoIWNvbnRyb2xsZXJEYXRhKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGF3YWl0IGNvbnRyb2xsZXJEYXRhLmluaXRpYWxSZWZyZXNoO1xuXHRcdHJldHVybiBjb250cm9sbGVyRGF0YS5jb250cm9sbGVyLm5ld0NoYXRTZXNzaW9uSXRlbT8uKHJlcXVlc3QsIHRva2VuKTtcblx0fVxuXG5cdGFzeW5jIGRlbGV0ZUNoYXRTZXNzaW9uSXRlbShzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29udHJvbGxlckRhdGEgPSB0aGlzLl9nZXRDaGF0U2Vzc2lvbkl0ZW1Db250cm9sbGVyKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCFjb250cm9sbGVyRGF0YT8uY29udHJvbGxlci5kZWxldGVDaGF0U2Vzc2lvbkl0ZW0pIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU2Vzc2lvbiAke3Nlc3Npb25SZXNvdXJjZS50b1N0cmluZygpfSBkb2VzIG5vdCBzdXBwb3J0IGRlbGV0aW9uYCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgY29udHJvbGxlckRhdGEuaW5pdGlhbFJlZnJlc2g7XG5cdFx0cmV0dXJuIGNvbnRyb2xsZXJEYXRhLmNvbnRyb2xsZXIuZGVsZXRlQ2hhdFNlc3Npb25JdGVtKHNlc3Npb25SZXNvdXJjZSwgdG9rZW4pO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Q2hhdFNlc3Npb25JdGVtQ29udHJvbGxlcihzZXNzaW9uUmVzb3VyY2U6IFVSSSkge1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgcmVzb2x2ZWRUeXBlID0gdGhpcy5fcmVzb2x2ZVRvUHJpbWFyeVR5cGUoc2Vzc2lvblR5cGUpID8/IHNlc3Npb25UeXBlO1xuXHRcdHJldHVybiB0aGlzLl9pdGVtQ29udHJvbGxlcnMuZ2V0KHJlc29sdmVkVHlwZSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0T3JDcmVhdGVDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJQ2hhdFNlc3Npb24+IHtcblx0XHR7XG5cdFx0XHRjb25zdCBleGlzdGluZ1Nlc3Npb25EYXRhID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoZXhpc3RpbmdTZXNzaW9uRGF0YSkge1xuXHRcdFx0XHRyZXR1cm4gZXhpc3RpbmdTZXNzaW9uRGF0YS5zZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb25UeXBlID0gZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKCEoYXdhaXQgcmFjZUNhbmNlbGxhdGlvbkVycm9yKHRoaXMuY2FuUmVzb2x2ZUNoYXRTZXNzaW9uKHNlc3Npb25UeXBlKSwgdG9rZW4pKSkge1xuXHRcdFx0dGhyb3cgRXJyb3IoYENhbm5vdCBmaW5kIHByb3ZpZGVyICcke3Nlc3Npb25UeXBlfSdgKTtcblx0XHR9XG5cblx0XHQvLyBDaGVjayBhZ2FpbiBhZnRlciBhc3luYyBwcm92aWRlciByZXNvbHV0aW9uXG5cdFx0e1xuXHRcdFx0Y29uc3QgZXhpc3RpbmdTZXNzaW9uRGF0YSA9IHRoaXMuX3Nlc3Npb25zLmdldChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKGV4aXN0aW5nU2Vzc2lvbkRhdGEpIHtcblx0XHRcdFx0cmV0dXJuIGV4aXN0aW5nU2Vzc2lvbkRhdGEuc2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZXNvbHZlZFR5cGUgPSB0aGlzLl9yZXNvbHZlVG9QcmltYXJ5VHlwZShzZXNzaW9uVHlwZSkgfHwgc2Vzc2lvblR5cGU7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLl9jb250ZW50UHJvdmlkZXJzLmdldChyZXNvbHZlZFR5cGUpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHRocm93IEVycm9yKGBDYW5ub3QgZmluZCBwcm92aWRlciAnJHtyZXNvbHZlZFR5cGV9J2ApO1xuXHRcdH1cblxuXHRcdGxldCBzZXNzaW9uOiBJQ2hhdFNlc3Npb247XG5cdFx0Y29uc3QgbmV3U2Vzc2lvbk9wdGlvbkdyb3VwcyA9IGlzVW50aXRsZWRDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpID8gYXdhaXQgdGhpcy5nZXROZXdDaGF0U2Vzc2lvbklucHV0U3RhdGUocmVzb2x2ZWRUeXBlLCBzZXNzaW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChpc1VudGl0bGVkQ2hhdFNlc3Npb24oc2Vzc2lvblJlc291cmNlKSAmJiAobmV3U2Vzc2lvbk9wdGlvbkdyb3VwcyB8fCByZXNvbHZlZFR5cGUuc3RhcnRzV2l0aCgnYWdlbnQtaG9zdC0nKSkpIHtcblx0XHRcdGNvbnN0IG9wdGlvbnM6IENoYXRTZXNzaW9uT3B0aW9uc01hcCA9IG5ldyBNYXAoKTtcblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgbmV3U2Vzc2lvbk9wdGlvbkdyb3VwcyA/PyBbXSkge1xuXHRcdFx0XHRjb25zdCBzZWxlY3RlZCA9IGdyb3VwLnNlbGVjdGVkID8/IGdyb3VwLml0ZW1zLmZpbmQoaXRlbSA9PiBpdGVtLmRlZmF1bHQpID8/IGdyb3VwLml0ZW1zWzBdO1xuXHRcdFx0XHRpZiAoc2VsZWN0ZWQpIHtcblx0XHRcdFx0XHRvcHRpb25zLnNldChncm91cC5pZCwgc2VsZWN0ZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRzZXNzaW9uID0ge1xuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0b25XaWxsRGlzcG9zZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0aGlzdG9yeTogW10sXG5cdFx0XHRcdG9wdGlvbnM6IG9wdGlvbnMuc2l6ZSA+IDAgPyBvcHRpb25zIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNlc3Npb24gPSBhd2FpdCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IocHJvdmlkZXIucHJvdmlkZUNoYXRTZXNzaW9uQ29udGVudChzZXNzaW9uUmVzb3VyY2UsIHRva2VuKSwgdG9rZW4pO1xuXHRcdH1cblxuXHRcdGlmIChzZXNzaW9uLm9wdGlvbnMpIHtcblx0XHRcdGZvciAoY29uc3QgW29wdGlvbklkLCB2YWx1ZV0gb2Ygc2Vzc2lvbi5vcHRpb25zKSB7XG5cdFx0XHRcdHRoaXMuc2V0U2Vzc2lvbk9wdGlvbihzZXNzaW9uUmVzb3VyY2UsIG9wdGlvbklkLCB2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gTWFrZSBzdXJlIGFub3RoZXIgc2Vzc2lvbiB3YXNuJ3QgY3JlYXRlZCB3aGlsZSB3ZSB3ZXJlIGF3YWl0aW5nIHRoZSBwcm92aWRlclxuXHRcdHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nU2Vzc2lvbkRhdGEgPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChleGlzdGluZ1Nlc3Npb25EYXRhKSB7XG5cdFx0XHRcdHJldHVybiBleGlzdGluZ1Nlc3Npb25EYXRhLnNlc3Npb247XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2Vzc2lvbkRhdGEgPSBuZXcgQ29udHJpYnV0ZWRDaGF0U2Vzc2lvbkRhdGEoc2Vzc2lvbiwgc2Vzc2lvblR5cGUsIHNlc3Npb25SZXNvdXJjZSwgc2Vzc2lvbi5vcHRpb25zLCByZXNvdXJjZSA9PiB7XG5cdFx0XHRzZXNzaW9uRGF0YS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9zZXNzaW9ucy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KHNlc3Npb25SZXNvdXJjZSwgc2Vzc2lvbkRhdGEpO1xuXG5cdFx0Ly8gTWFrZSBzdXJlIGFueSBsaXN0ZW5lcnMgYXJlIGF3YXJlIG9mIHRoZSBuZXcgc2Vzc2lvbiBhbmQgaXRzIG9wdGlvbnNcblx0XHRpZiAoc2Vzc2lvbi5vcHRpb25zKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25PcHRpb25zLmZpcmUoeyBzZXNzaW9uUmVzb3VyY2UsIHVwZGF0ZXM6IHNlc3Npb24ub3B0aW9ucyB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0fVxuXG5cdHB1YmxpYyBoYXNBbnlTZXNzaW9uT3B0aW9ucyhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQodGhpcy5fcmVzb2x2ZVJlc291cmNlKHNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdHJldHVybiAhIXNlc3Npb24gJiYgISFzZXNzaW9uLm9wdGlvbnMgJiYgc2Vzc2lvbi5vcHRpb25zLnNpemUgPiAwO1xuXHR9XG5cblx0cHVibGljIGdldFNlc3Npb25PcHRpb25zKHNlc3Npb25SZXNvdXJjZTogVVJJKTogTWFwPHN0cmluZywgc3RyaW5nPiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHRoaXMuX3Nlc3Npb25zLmdldCh0aGlzLl9yZXNvbHZlUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0aWYgKCFzZXNzaW9uKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIHNlc3Npb24uZ2V0QWxsT3B0aW9ucygpKSB7XG5cdFx0XHRyZXN1bHQuc2V0KGtleSwgdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlIDogdmFsdWUuaWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0LnNpemUgPiAwID8gcmVzdWx0IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGdldFNlc3Npb25PcHRpb24oc2Vzc2lvblJlc291cmNlOiBVUkksIG9wdGlvbklkOiBzdHJpbmcpOiBzdHJpbmcgfCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQodGhpcy5fcmVzb2x2ZVJlc291cmNlKHNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdHJldHVybiBzZXNzaW9uPy5nZXRPcHRpb24ob3B0aW9uSWQpO1xuXHR9XG5cblx0cHVibGljIHNldFNlc3Npb25PcHRpb24oc2Vzc2lvblJlc291cmNlOiBVUkksIG9wdGlvbklkOiBzdHJpbmcsIHZhbHVlOiBzdHJpbmcgfCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy51cGRhdGVTZXNzaW9uT3B0aW9ucyhzZXNzaW9uUmVzb3VyY2UsIG5ldyBNYXAoW1tvcHRpb25JZCwgdmFsdWVdXSkpO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZVNlc3Npb25PcHRpb25zKHNlc3Npb25SZXNvdXJjZTogVVJJLCB1cGRhdGVzOiBSZWFkb25seUNoYXRTZXNzaW9uT3B0aW9uc01hcCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQodGhpcy5fcmVzb2x2ZVJlc291cmNlKHNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGxldCBkaWRDaGFuZ2UgPSBmYWxzZTtcblx0XHRmb3IgKGNvbnN0IFtvcHRpb25JZCwgdmFsdWVdIG9mIHVwZGF0ZXMpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nVmFsdWUgPSBzZXNzaW9uLmdldE9wdGlvbihvcHRpb25JZCk7XG5cdFx0XHRpZiAoZXhpc3RpbmdWYWx1ZSAhPT0gdmFsdWUpIHtcblx0XHRcdFx0c2Vzc2lvbi5zZXRPcHRpb24ob3B0aW9uSWQsIHZhbHVlKTtcblx0XHRcdFx0ZGlkQ2hhbmdlID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZGlkQ2hhbmdlKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25PcHRpb25zLmZpcmUoeyBzZXNzaW9uUmVzb3VyY2UsIHVwZGF0ZXM6IHVwZGF0ZXMgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBkaWRDaGFuZ2U7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZSBhIHJlc291cmNlIHRocm91Z2ggdGhlIGFsaWFzIG1hcC4gSWYgdGhlIHJlc291cmNlIGlzIGEgcmVhbFxuXHQgKiByZXNvdXJjZSB0aGF0IGhhcyBiZWVuIGFsaWFzZWQgdG8gYW4gdW50aXRsZWQgcmVzb3VyY2UsIHJldHVybiB0aGVcblx0ICogdW50aXRsZWQgcmVzb3VyY2UgKHRoZSBjYW5vbmljYWwga2V5IGluIHtAbGluayBfc2Vzc2lvbnN9KS5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVSZXNvdXJjZShyZXNvdXJjZTogVVJJKTogVVJJIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVzb3VyY2VBbGlhc2VzLmdldChyZXNvdXJjZSkgPz8gcmVzb3VyY2U7XG5cdH1cblxuXHRwdWJsaWMgcmVnaXN0ZXJTZXNzaW9uUmVzb3VyY2VBbGlhcyh1bnRpdGxlZFJlc291cmNlOiBVUkksIHJlYWxSZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVzb3VyY2VBbGlhc2VzLnNldChyZWFsUmVzb3VyY2UsIHVudGl0bGVkUmVzb3VyY2UpO1xuXHR9XG5cblx0cHVibGljIHNldE1hdGVyaWFsaXplZFNlc3Npb25SZXNvdXJjZSh1bnRpdGxlZFJlc291cmNlOiBVUkksIHJlYWxSZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVhbFJlc291cmNlcy5zZXQodW50aXRsZWRSZXNvdXJjZSwgcmVhbFJlc291cmNlKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRNYXRlcmlhbGl6ZWRTZXNzaW9uUmVzb3VyY2UodW50aXRsZWRSZXNvdXJjZTogVVJJKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVhbFJlc291cmNlcy5nZXQodW50aXRsZWRSZXNvdXJjZSk7XG5cdH1cblxuXHRwdWJsaWMgY2xlYXJNYXRlcmlhbGl6ZWRTZXNzaW9uUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHQvLyBEcm9wIHRoZSBmb3J3YXJkIGB1bnRpdGxlZCBcdTIxOTIgcmVhbGAgbWFwcGluZyBmb3IgdGhlIGRpc3Bvc2VkIHNlc3Npb24sXG5cdFx0Ly8gd2hldGhlciBpdCB3YXMgcGFzc2VkIHRoZSB1bnRpdGxlZCBrZXkgb3IgdGhlIHJlYWwgdmFsdWUuIFRoZSBpbnZlcnNlXG5cdFx0Ly8gYHJlYWwgXHUyMTkyIHVudGl0bGVkYCBhbGlhcyBpcyBpbnRlbnRpb25hbGx5IGxlZnQgaW4gcGxhY2UgKHNlZVxuXHRcdC8vIGByZWdpc3RlclNlc3Npb25SZXNvdXJjZUFsaWFzYCksIHNvIHRoaXMgZG9lcyBub3QgdG91Y2ggYF9yZXNvdXJjZUFsaWFzZXNgLlxuXHRcdHRoaXMuX3JlYWxSZXNvdXJjZXMuZGVsZXRlKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0Y29uc3QgdW50aXRsZWQgPSB0aGlzLl9yZXNvdXJjZUFsaWFzZXMuZ2V0KHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0aWYgKHVudGl0bGVkKSB7XG5cdFx0XHR0aGlzLl9yZWFsUmVzb3VyY2VzLmRlbGV0ZSh1bnRpdGxlZCk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGZpcmVTZXNzaW9uQ29tbWl0dGVkKG9yaWdpbmFsOiBVUkksIGNvbW1pdHRlZDogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDb21taXRTZXNzaW9uLmZpcmUoeyBvcmlnaW5hbCwgY29tbWl0dGVkIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFN0b3JlIG9wdGlvbiBncm91cHMgZm9yIGEgc2Vzc2lvbiB0eXBlXG5cdCAqL1xuXHRwdWJsaWMgc2V0T3B0aW9uR3JvdXBzRm9yU2Vzc2lvblR5cGUoY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcsIGhhbmRsZTogbnVtYmVyLCBvcHRpb25Hcm91cHM/OiBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkdyb3VwW10pOiB2b2lkIHtcblx0XHRpZiAob3B0aW9uR3JvdXBzKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uVHlwZU9wdGlvbnMuc2V0KGNoYXRTZXNzaW9uVHlwZSwgb3B0aW9uR3JvdXBzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2Vzc2lvblR5cGVPcHRpb25zLmRlbGV0ZShjaGF0U2Vzc2lvblR5cGUpO1xuXHRcdH1cblx0XHR0aGlzLl9vbkRpZENoYW5nZU9wdGlvbkdyb3Vwcy5maXJlKGNoYXRTZXNzaW9uVHlwZSk7XG5cdH1cblxuXHQvKipcblx0ICogR2V0IGF2YWlsYWJsZSBvcHRpb24gZ3JvdXBzIGZvciBhIHNlc3Npb24gdHlwZVxuXHQgKi9cblx0cHVibGljIGdldE9wdGlvbkdyb3Vwc0ZvclNlc3Npb25UeXBlKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nKTogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvblR5cGVPcHRpb25zLmdldChjaGF0U2Vzc2lvblR5cGUpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGdldE5ld0NoYXRTZXNzaW9uSW5wdXRTdGF0ZShjaGF0U2Vzc2lvblR5cGU6IHN0cmluZywgc2Vzc2lvblJlc291cmNlOiBVUkkpOiBQcm9taXNlPHJlYWRvbmx5IElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXBbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNvbnRyb2xsZXJEYXRhID0gdGhpcy5faXRlbUNvbnRyb2xsZXJzLmdldChjaGF0U2Vzc2lvblR5cGUpO1xuXHRcdGlmIChjb250cm9sbGVyRGF0YT8uY29udHJvbGxlci5nZXROZXdDaGF0U2Vzc2lvbklucHV0U3RhdGUpIHtcblx0XHRcdGNvbnN0IGdyb3VwcyA9IGF3YWl0IGNvbnRyb2xsZXJEYXRhLmNvbnRyb2xsZXIuZ2V0TmV3Q2hhdFNlc3Npb25JbnB1dFN0YXRlKHNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRpZiAoZ3JvdXBzPy5sZW5ndGgpIHtcblx0XHRcdFx0dGhpcy5fc2Vzc2lvblR5cGVPcHRpb25zLnNldChjaGF0U2Vzc2lvblR5cGUsIFsuLi5ncm91cHNdKTtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VPcHRpb25Hcm91cHMuZmlyZShjaGF0U2Vzc2lvblR5cGUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGdyb3Vwcztcblx0XHR9XG5cblx0XHRjb25zdCBncm91cHMgPSB0aGlzLl9zZXNzaW9uVHlwZU9wdGlvbnMuZ2V0KGNoYXRTZXNzaW9uVHlwZSk7XG5cdFx0aWYgKCFncm91cHM/Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIGdyb3Vwcztcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgdGhlIGNhcGFiaWxpdGllcyBmb3IgYSBzcGVjaWZpYyBzZXNzaW9uIHR5cGVcblx0ICovXG5cdHB1YmxpYyBnZXRDYXBhYmlsaXRpZXNGb3JTZXNzaW9uVHlwZShjaGF0U2Vzc2lvblR5cGU6IHN0cmluZyk6IElDaGF0QWdlbnRBdHRhY2htZW50Q2FwYWJpbGl0aWVzIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBjb250cmlidXRpb24gPSB0aGlzLl9jb250cmlidXRpb25zLmdldChjaGF0U2Vzc2lvblR5cGUpPy5jb250cmlidXRpb247XG5cdFx0cmV0dXJuIGNvbnRyaWJ1dGlvbj8uY2FwYWJpbGl0aWVzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdldCB0aGUgY3VzdG9tQWdlbnRUYXJnZXQgZm9yIGEgc3BlY2lmaWMgc2Vzc2lvbiB0eXBlLlxuXHQgKiBXaGVuIHNldCwgdGhlIG1vZGUgcGlja2VyIHNob3VsZCBzaG93IGZpbHRlcmVkIGN1c3RvbSBhZ2VudHMgbWF0Y2hpbmcgdGhpcyB0YXJnZXQuXG5cdCAqL1xuXHRwdWJsaWMgZ2V0Q3VzdG9tQWdlbnRUYXJnZXRGb3JTZXNzaW9uVHlwZShjaGF0U2Vzc2lvblR5cGU6IHN0cmluZyk6IFRhcmdldCB7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gdGhpcy5fY29udHJpYnV0aW9ucy5nZXQoY2hhdFNlc3Npb25UeXBlKT8uY29udHJpYnV0aW9uO1xuXHRcdHJldHVybiBjb250cmlidXRpb24/LmN1c3RvbUFnZW50VGFyZ2V0ID8/IFRhcmdldC5VbmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgcmVxdWlyZXNDdXN0b21Nb2RlbHNGb3JTZXNzaW9uVHlwZShjaGF0U2Vzc2lvblR5cGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHRoaXMuX2NvbnRyaWJ1dGlvbnMuZ2V0KGNoYXRTZXNzaW9uVHlwZSk/LmNvbnRyaWJ1dGlvbjtcblx0XHRyZXR1cm4gISFjb250cmlidXRpb24/LnJlcXVpcmVzQ3VzdG9tTW9kZWxzO1xuXHR9XG5cblx0cHVibGljIHN1cHBvcnRzQXV0b01vZGVsRm9yU2Vzc2lvblR5cGUoY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHQvLyBUaGUgYnVpbHQtaW4gbG9jYWwgY2hhdCBpcyBub3QgYSByZWdpc3RlcmVkIGNvbnRyaWJ1dGlvbiBidXQgYWx3YXlzXG5cdFx0Ly8gc3VwcG9ydHMgdGhlIHN5bnRoZXRpYyBcIkF1dG9cIiBtb2RlbCBmYWxsYmFjay5cblx0XHRpZiAoY2hhdFNlc3Npb25UeXBlID09PSBsb2NhbENoYXRTZXNzaW9uVHlwZSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHRoaXMuX2NvbnRyaWJ1dGlvbnMuZ2V0KGNoYXRTZXNzaW9uVHlwZSk/LmNvbnRyaWJ1dGlvbjtcblx0XHRyZXR1cm4gISFjb250cmlidXRpb24/LnN1cHBvcnRzQXV0b01vZGVsO1xuXHR9XG5cblx0cHVibGljIHN1cHBvcnRzRGVsZWdhdGlvbkZvclNlc3Npb25UeXBlKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gdGhpcy5fY29udHJpYnV0aW9ucy5nZXQoY2hhdFNlc3Npb25UeXBlKT8uY29udHJpYnV0aW9uO1xuXHRcdHJldHVybiBjb250cmlidXRpb24/LnN1cHBvcnRzRGVsZWdhdGlvbiAhPT0gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgcmVxdWlyZXNDb3BpbG90U2lnbkluRm9yU2Vzc2lvblR5cGUoY2hhdFNlc3Npb25UeXBlOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBjb250cmlidXRpb24gPSB0aGlzLl9jb250cmlidXRpb25zLmdldChjaGF0U2Vzc2lvblR5cGUpPy5jb250cmlidXRpb247XG5cdFx0cmV0dXJuICEhY29udHJpYnV0aW9uPy5yZXF1aXJlc0NvcGlsb3RTaWduSW47XG5cdH1cblxuXHRwdWJsaWMgc2Vzc2lvblN1cHBvcnRzRm9yayhzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvblJlc291cmNlKVxuXHRcdFx0Ly8gVHJ5IHRvIHJlc29sdmUgaW4gY2FzZSBhbiBhbGlhcyB3YXMgdXNlZFxuXHRcdFx0Pz8gdGhpcy5fc2Vzc2lvbnMuZ2V0KHRoaXMuX3Jlc29sdmVSZXNvdXJjZShzZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRyZXR1cm4gISFzZXNzaW9uPy5zZXNzaW9uLmZvcmtTZXNzaW9uO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGZvcmtDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgcmVxdWVzdDogSUNoYXRTZXNzaW9uUmVxdWVzdEhpc3RvcnlJdGVtIHwgdW5kZWZpbmVkLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0U2Vzc2lvbkl0ZW0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHNlc3Npb25SZXNvdXJjZSlcblx0XHRcdC8vIFRyeSB0byByZXNvbHZlIGluIGNhc2UgYW4gYWxpYXMgd2FzIHVzZWRcblx0XHRcdD8/IHRoaXMuX3Nlc3Npb25zLmdldCh0aGlzLl9yZXNvbHZlUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKSk7XG5cdFx0aWYgKCFzZXNzaW9uPy5zZXNzaW9uLmZvcmtTZXNzaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0gZG9lcyBub3Qgc3VwcG9ydCBmb3JraW5nYCk7XG5cdFx0fVxuXHRcdHJldHVybiBzZXNzaW9uLnNlc3Npb24uZm9ya1Nlc3Npb24ocmVxdWVzdCwgdG9rZW4pO1xuXHR9XG5cblx0cHVibGljIHNlc3Npb25TdXBwb3J0c1JlbmFtZShzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQoc2Vzc2lvblJlc291cmNlKVxuXHRcdFx0Ly8gVHJ5IHRvIHJlc29sdmUgaW4gY2FzZSBhbiBhbGlhcyB3YXMgdXNlZFxuXHRcdFx0Pz8gdGhpcy5fc2Vzc2lvbnMuZ2V0KHRoaXMuX3Jlc29sdmVSZXNvdXJjZShzZXNzaW9uUmVzb3VyY2UpKTtcblx0XHRyZXR1cm4gISFzZXNzaW9uPy5zZXNzaW9uLnJlbmFtZVNlc3Npb247XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVuYW1lQ2hhdFNlc3Npb24oc2Vzc2lvblJlc291cmNlOiBVUkksIHRpdGxlOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFJlc29sdmUgdGhlIHNlc3Npb24gKGNyZWF0aW5nIGl0IGlmIG5lY2Vzc2FyeSkgc28gdGhhdCByZW5hbWUgd29ya3Ncblx0XHQvLyBldmVuIHdoZW4gdGhlIHNlc3Npb24gaXMgbm90IGN1cnJlbnRseSBvcGVuIGluIGFuIGVkaXRvci5cblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgdGhpcy5nZXRPckNyZWF0ZUNoYXRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSwgdG9rZW4pO1xuXHRcdGlmICghc2Vzc2lvbi5yZW5hbWVTZXNzaW9uKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFNlc3Npb24gJHtzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKX0gZG9lcyBub3Qgc3VwcG9ydCByZW5hbWluZ2ApO1xuXHRcdH1cblx0XHRyZXR1cm4gc2Vzc2lvbi5yZW5hbWVTZXNzaW9uKHRpdGxlLCB0b2tlbik7XG5cdH1cblxuXHRwdWJsaWMgZ2V0Q29udGVudFByb3ZpZGVyU2NoZW1lcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIEFycmF5LmZyb20odGhpcy5fY29udGVudFByb3ZpZGVycy5rZXlzKCkpO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcblxuZnVuY3Rpb24gcmVnaXN0ZXJOZXdTZXNzaW9uSW5QbGFjZUFjdGlvbih0eXBlOiBzdHJpbmcsIGRpc3BsYXlOYW1lOiBzdHJpbmcpOiBJRGlzcG9zYWJsZSB7XG5cdHJldHVybiByZWdpc3RlckFjdGlvbjIoY2xhc3MgTmV3Q2hhdFNlc3Npb25JblBsYWNlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRzdXBlcih7XG5cdFx0XHRcdGlkOiBgd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5OZXdDaGF0U2Vzc2lvbkluUGxhY2UuJHt0eXBlfWAsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2ludGVyYWN0aXZlU2Vzc2lvbi5vcGVuTmV3Q2hhdFNlc3Npb25JblBsYWNlJywgXCJOZXcgezB9IFNlc3Npb25cIiwgZGlzcGxheU5hbWUpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gRXhwZWN0ZWQgYXJnczogW2NoYXRTZXNzaW9uUG9zaXRpb246ICdzaWRlYmFyJyB8ICdlZGl0b3InXVxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRpZiAoYXJncy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignRXhwZWN0ZWQgY2hhdCBzZXNzaW9uIHBvc2l0aW9uIGFyZ3VtZW50Jyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNoYXRTZXNzaW9uUG9zaXRpb24gPSBhcmdzWzBdO1xuXHRcdFx0aWYgKGNoYXRTZXNzaW9uUG9zaXRpb24gIT09IENoYXRTZXNzaW9uUG9zaXRpb24uU2lkZWJhciAmJiBjaGF0U2Vzc2lvblBvc2l0aW9uICE9PSBDaGF0U2Vzc2lvblBvc2l0aW9uLkVkaXRvcikge1xuXHRcdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKGBJbnZhbGlkIGNoYXQgc2Vzc2lvbiBwb3NpdGlvbiBhcmd1bWVudDogJHtjaGF0U2Vzc2lvblBvc2l0aW9ufWApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZXNvbHZlIHRoZSBlZGl0b3IgdG8gcmVwbGFjZSB1cCBmcm9udCBmcm9tIHRoZSBjdXJyZW50bHkgYWN0aXZlXG5cdFx0XHQvLyBjaGF0IGVkaXRvciwgc28gdGhlIHJlcGxhY2VtZW50IHRhcmdldHMgdGhhdCBzcGVjaWZpYyB0YWIgcmF0aGVyXG5cdFx0XHQvLyB0aGFuIHdoYXRldmVyIGJlY29tZXMgYWN0aXZlIGR1cmluZyB0aGUgYXN5bmMgb3Blbi5cblx0XHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSkuYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yO1xuXHRcdFx0Y29uc3QgcmVwbGFjZUVkaXRvckZvclJlc291cmNlID0gYWN0aXZlRWRpdG9yIGluc3RhbmNlb2YgQ2hhdEVkaXRvcklucHV0ID8gYWN0aXZlRWRpdG9yLnNlc3Npb25SZXNvdXJjZSA6IHVuZGVmaW5lZDtcblx0XHRcdGF3YWl0IG9wZW5DaGF0U2Vzc2lvbihhY2Nlc3NvciwgeyB0eXBlOiB0eXBlLCBkaXNwbGF5TmFtZTogbG9jYWxpemUoJ2NoYXQnLCBcIkNoYXRcIiksIHBvc2l0aW9uOiBjaGF0U2Vzc2lvblBvc2l0aW9uLCByZXBsYWNlRWRpdG9yRm9yUmVzb3VyY2UgfSk7XG5cdFx0fVxuXHR9KTtcbn1cblxuZnVuY3Rpb24gcmVnaXN0ZXJOZXdTZXNzaW9uRXh0ZXJuYWxBY3Rpb24odHlwZTogc3RyaW5nLCBkaXNwbGF5TmFtZTogc3RyaW5nLCByZXNvbHZlQ29tbWFuZElkOiAoKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJRGlzcG9zYWJsZSB7XG5cdHJldHVybiByZWdpc3RlckFjdGlvbjIoY2xhc3MgTmV3Q2hhdFNlc3Npb25FeHRlcm5hbEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRpZDogYHdvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuTmV3Q2hhdFNlc3Npb25FeHRlcm5hbC4ke3R5cGV9YCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignaW50ZXJhY3RpdmVTZXNzaW9uLm9wZW5OZXdDaGF0U2Vzc2lvbkV4dGVybmFsJywgXCJOZXcgezB9IFNlc3Npb25cIiwgZGlzcGxheU5hbWUpLFxuXHRcdFx0XHRjYXRlZ29yeTogQ0hBVF9DQVRFR09SWSxcblx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRwcmVjb25kaXRpb246IENoYXRDb250ZXh0S2V5cy5lbmFibGVkLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRcdFx0Y29uc3QgY29tbWFuZElkID0gcmVzb2x2ZUNvbW1hbmRJZCgpO1xuXHRcdFx0aWYgKCFjb21tYW5kSWQpIHtcblx0XHRcdFx0bG9nU2VydmljZS53YXJuKGBbQ2hhdFNlc3Npb25zU2VydmljZV0gTm8gY3JlYXRlIGNvbW1hbmQgY29udHJpYnV0ZWQgdG8gJyR7TWVudUlkLkFnZW50U2Vzc2lvbnNDcmVhdGVTdWJNZW51LmlkfScgZm9yIGNoYXQgc2Vzc2lvbiB0eXBlICcke3R5cGV9JzsgY2Fubm90IG9wZW4gYSBuZXcgc2Vzc2lvbi5gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZElkKTtcblx0XHR9XG5cdH0pO1xufVxuXG5leHBvcnQgZW51bSBDaGF0U2Vzc2lvblBvc2l0aW9uIHtcblx0RWRpdG9yID0gJ2VkaXRvcicsXG5cdFNpZGViYXIgPSAnc2lkZWJhcidcbn1cblxudHlwZSBOZXdDaGF0U2Vzc2lvblNlbmRPcHRpb25zID0ge1xuXHRyZWFkb25seSBwcm9tcHQ6IHN0cmluZztcblx0cmVhZG9ubHkgYXR0YWNoZWRDb250ZXh0PzogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdO1xuXHRyZWFkb25seSBpbml0aWFsU2Vzc2lvbk9wdGlvbnM/OiBSZWFkb25seUNoYXRTZXNzaW9uT3B0aW9uc01hcDtcblx0LyoqXG5cdCAqIEEgcHJpb3IgY29udmVyc2F0aW9uIHRvIHNlZWQgaW50byB0aGUgbmV3IHNlc3Npb24gYXMgcmVhbCwgZWRpdGFibGUgdHVybnNcblx0ICogKFwiQ29udGludWUgaW5cdTIwMjZcIiBtaWdyYXRpb24pLiBDb25zdW1lZCBvbmNlIHdoZW4gdGhlIGJhY2tlbmQgc2Vzc2lvbiBpc1xuXHQgKiBjcmVhdGVkOyBzZWUge0BsaW5rIElBZ2VudEhvc3RJbXBvcnRDb252ZXJzYXRpb25TdG9yZX0uXG5cdCAqL1xuXHRyZWFkb25seSBpbXBvcnRDb252ZXJzYXRpb24/OiBJQWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uO1xufTtcblxuZXhwb3J0IHR5cGUgTmV3Q2hhdFNlc3Npb25PcGVuT3B0aW9ucyA9IHtcblx0cmVhZG9ubHkgdHlwZTogc3RyaW5nO1xuXHRyZWFkb25seSBwb3NpdGlvbjogQ2hhdFNlc3Npb25Qb3NpdGlvbjtcblx0cmVhZG9ubHkgZGlzcGxheU5hbWU6IHN0cmluZztcblx0LyoqXG5cdCAqIFdoZW4gc2V0LCB0aGUgZWRpdG9yIHNob3dpbmcgdGhpcyAoc291cmNlKSBzZXNzaW9uIHJlc291cmNlIGlzIHJlcGxhY2VkXG5cdCAqIGluIHBsYWNlIHdpdGggdGhlIG5ld2x5IG9wZW5lZCBzZXNzaW9uLiBUaGUgc291cmNlIHJlc291cmNlIGlzIHJlc29sdmVkXG5cdCAqIHRvIGl0cyBjb25jcmV0ZSBlZGl0b3IgYXQgcmVwbGFjZSB0aW1lLCBzbyB0aGUgY29ycmVjdCB0YWIgaXMgcmVwbGFjZWRcblx0ICogZXZlbiBpZiB0aGUgdXNlciBhY3RpdmF0ZWQgYSBkaWZmZXJlbnQgZWRpdG9yIGR1cmluZyB0aGUgYXN5bmMgc2V0dXAuXG5cdCAqL1xuXHRyZWFkb25seSByZXBsYWNlRWRpdG9yRm9yUmVzb3VyY2U/OiBVUkk7XG59O1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gb3BlbkNoYXRTZXNzaW9uKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBvcGVuT3B0aW9uczogTmV3Q2hhdFNlc3Npb25PcGVuT3B0aW9ucywgY2hhdFNlbmRPcHRpb25zPzogTmV3Q2hhdFNlc3Npb25TZW5kT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdGNvbnN0IGNoYXRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDaGF0U2VydmljZSk7XG5cdGNvbnN0IGNoYXRTZXNzaW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFNlc3Npb25zU2VydmljZSk7XG5cdGNvbnN0IGxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxvZ1NlcnZpY2UpO1xuXHRjb25zdCBlZGl0b3JHcm91cFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRjb25zdCBlZGl0b3JTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKTtcblx0Y29uc3QgY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UpO1xuXHRjb25zdCB0b29sc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpO1xuXHRjb25zdCBpbXBvcnRDb252ZXJzYXRpb25TdG9yZSA9IGFjY2Vzc29yLmdldChJQWdlbnRIb3N0SW1wb3J0Q29udmVyc2F0aW9uU3RvcmUpO1xuXHRjb25zdCBwcm9ncmVzc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByb2dyZXNzU2VydmljZSk7XG5cblx0Ly8gRGV0ZXJtaW5lIHJlc291cmNlIHRvIG9wZW5cblx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gZ2V0UmVzb3VyY2VGb3JOZXdDaGF0U2Vzc2lvbihvcGVuT3B0aW9ucyk7XG5cblx0Ly8gU3Rhc2ggYW55IGltcG9ydGVkIChcIkNvbnRpbnVlIGluXHUyMDI2XCIpIGNvbnZlcnNhdGlvbiBiZWZvcmUgdGhlIHNlc3Npb24gaXNcblx0Ly8gb3BlbmVkOiBvcGVuaW5nIGNhbiBlYWdlcmx5IHByZS1jcmVhdGUgdGhlIGJhY2tlbmQgc2Vzc2lvbiAodmlhIHRoZSBjaGF0XG5cdC8vIGlucHV0IHBpY2tlciksIHdoaWNoIGNvbnN1bWVzIHRoaXMgdG8gc2VlZCB0aGUgdHVybnMgYXMgZWRpdGFibGUgaGlzdG9yeS5cblx0aWYgKGNoYXRTZW5kT3B0aW9ucz8uaW1wb3J0Q29udmVyc2F0aW9uICYmIGNoYXRTZW5kT3B0aW9ucy5pbXBvcnRDb252ZXJzYXRpb24udHVybnMubGVuZ3RoID4gMCkge1xuXHRcdGltcG9ydENvbnZlcnNhdGlvblN0b3JlLnNldChzZXNzaW9uUmVzb3VyY2UsIGNoYXRTZW5kT3B0aW9ucy5pbXBvcnRDb252ZXJzYXRpb24pO1xuXHR9XG5cblx0Ly8gT3BlbiBjaGF0IHNlc3Npb24uIEZvciBhIHNpZGViYXIgXCJDb250aW51ZSBpblx1MjAyNlwiIG1pZ3JhdGlvbiB0aGUgdHJhbnNpdGlvblxuXHQvLyBzcGFucyBtdWx0aXBsZSBhc3luYyBwaGFzZXMgKGxvYWQgXHUyMTkyIG1hdGVyaWFsaXppbmcgc2VuZCBcdTIxOTIgdW50aXRsZWRcdTIxOTJyZWFsXG5cdC8vIHJlYmluZCksIGR1cmluZyB3aGljaCB0aGUgY2hhdCB3aWRnZXQgaXMgdHJhbnNpZW50bHkgZW1wdHkuIEhvbGQgdGhlXG5cdC8vIHNlc3Npb25zIGxpc3Qgc3VwcHJlc3NlZCBhY3Jvc3MgdGhlIHdob2xlIHRyYW5zaXRpb24gc28gaXQgbmV2ZXIgZmxhc2hlcy5cblx0bGV0IHNlc3Npb25zTGlzdFN1cHByZXNzaW9uOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0bGV0IHRyYW5zaXRpb25Qcm9ncmVzczogRGVmZXJyZWRQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHR0cnkge1xuXHRcdHN3aXRjaCAob3Blbk9wdGlvbnMucG9zaXRpb24pIHtcblx0XHRcdGNhc2UgQ2hhdFNlc3Npb25Qb3NpdGlvbi5TaWRlYmFyOiB7XG5cdFx0XHRcdGNvbnN0IHZpZXcgPSBhd2FpdCB2aWV3c1NlcnZpY2Uub3BlblZpZXcoQ2hhdFZpZXdJZCkgYXMgQ2hhdFZpZXdQYW5lO1xuXHRcdFx0XHRpZiAoY2hhdFNlbmRPcHRpb25zPy5pbXBvcnRDb252ZXJzYXRpb24pIHtcblx0XHRcdFx0XHRzZXNzaW9uc0xpc3RTdXBwcmVzc2lvbiA9IHZpZXcuYmVnaW5TZXNzaW9uc0xpc3RTdXBwcmVzc2lvbigpO1xuXHRcdFx0XHRcdC8vIFNob3cgdGhlIGNoYXQgdmlldydzIHdvcmtpbmcgaW5kaWNhdG9yIGZvciB0aGUgd2hvbGUgdHJhbnNpdGlvbiAodGhlXG5cdFx0XHRcdFx0Ly8gd2lkZ2V0IGlzIGJsYW5rIHdoaWxlIHRoZSBiYWNrZW5kIHNlc3Npb24gbWF0ZXJpYWxpemVzKSBzbyBpdCBkb2VzIG5vdFxuXHRcdFx0XHRcdC8vIGxvb2sgaHVuZy4gQ29tcGxldGVkIG9uY2UgdGhlIG1pZ3JhdGlvbiBmaW5pc2hlcyBiZWxvdy5cblx0XHRcdFx0XHR0cmFuc2l0aW9uUHJvZ3Jlc3MgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRcdFx0cHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7IGxvY2F0aW9uOiBDaGF0Vmlld0lkIH0sICgpID0+IHRyYW5zaXRpb25Qcm9ncmVzcyEucCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9wZW5PcHRpb25zLnR5cGUgPT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbCkge1xuXHRcdFx0XHRcdGF3YWl0IHZpZXcuc3RhcnROZXdMb2NhbFNlc3Npb24oKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRhd2FpdCB2aWV3LmxvYWRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dmlldy5mb2N1cygpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgQ2hhdFNlc3Npb25Qb3NpdGlvbi5FZGl0b3I6IHtcblx0XHRcdFx0Y29uc3Qgb3B0aW9uczogSUNoYXRFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0XHRcdG92ZXJyaWRlOiBDaGF0RWRpdG9ySW5wdXQuRWRpdG9ySUQsXG5cdFx0XHRcdFx0cGlubmVkOiB0cnVlLFxuXHRcdFx0XHRcdC4uLihvcGVuT3B0aW9ucy50eXBlID09PSBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwgPyB7IGV4cGxpY2l0U2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlIH0gOiB7fSksXG5cdFx0XHRcdFx0dGl0bGU6IHtcblx0XHRcdFx0XHRcdGZhbGxiYWNrOiBsb2NhbGl6ZSgnY2hhdEVkaXRvckNvbnRyaWJ1dGlvbk5hbWUnLCBcInswfVwiLCBvcGVuT3B0aW9ucy5kaXNwbGF5TmFtZSksXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRpZiAob3Blbk9wdGlvbnMucmVwbGFjZUVkaXRvckZvclJlc291cmNlKSB7XG5cdFx0XHRcdFx0Ly8gUmVwbGFjZSB0aGUgc3BlY2lmaWMgc291cmNlIGNoYXQgZWRpdG9yLCBpZGVudGlmaWVkIGJ5IGl0c1xuXHRcdFx0XHRcdC8vIHNlc3Npb24gcmVzb3VyY2UgXHUyMDE0IG5vdCB3aGF0ZXZlciBoYXBwZW5zIHRvIGJlIGFjdGl2ZSBub3cuIFRoZVxuXHRcdFx0XHRcdC8vIHJlcG9zaXRvcnkgZXh0cmFjdGlvbiBhbmQgb3RoZXIgYXdhaXRzIGFib3ZlIG1heSBoYXZlIHJ1biB3aGlsZVxuXHRcdFx0XHRcdC8vIHRoZSB1c2VyIGFjdGl2YXRlZCBhIGRpZmZlcmVudCBjaGF0IGVkaXRvciwgc28gY29uc3VsdGluZyB0aGVcblx0XHRcdFx0XHQvLyBhY3RpdmUgZWRpdG9yIGNvdWxkIHJlcGxhY2UgYW4gdW5yZWxhdGVkIHRhYi5cblx0XHRcdFx0XHRjb25zdCBzb3VyY2VSZXNvdXJjZSA9IG9wZW5PcHRpb25zLnJlcGxhY2VFZGl0b3JGb3JSZXNvdXJjZTtcblx0XHRcdFx0XHRsZXQgcmVwbGFjZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIGVkaXRvckdyb3VwU2VydmljZS5ncm91cHMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IGdyb3VwLmVkaXRvcnMuZmluZChlID0+IGUgaW5zdGFuY2VvZiBDaGF0RWRpdG9ySW5wdXQgJiYgcmVzb3VyY2VzLmlzRXF1YWwoZS5zZXNzaW9uUmVzb3VyY2UsIHNvdXJjZVJlc291cmNlKSk7XG5cdFx0XHRcdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2UucmVwbGFjZUVkaXRvcnMoW3sgZWRpdG9yLCByZXBsYWNlbWVudDogeyByZXNvdXJjZTogc2Vzc2lvblJlc291cmNlLCBvcHRpb25zIH0gfV0sIGdyb3VwKTtcblx0XHRcdFx0XHRcdFx0cmVwbGFjZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFyZXBsYWNlZCkge1xuXHRcdFx0XHRcdFx0Ly8gTm8gY2hhdCBlZGl0b3IgdG8gcmVwbGFjZSBpbiBwbGFjZSBcdTIwMTQgZmFsbCBiYWNrIHRvIG9wZW5pbmcgYVxuXHRcdFx0XHRcdFx0Ly8gbmV3IGVkaXRvciBzbyB0aGUgc2Vzc2lvbiAoYW5kIHRoZSB1c2VyJ3MgcGVuZGluZyBzZW5kKSBpc1xuXHRcdFx0XHRcdFx0Ly8gbmV2ZXIgbG9zdC5cblx0XHRcdFx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UsIG9wdGlvbnMgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UsIG9wdGlvbnMgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OiBhc3NlcnROZXZlcihvcGVuT3B0aW9ucy5wb3NpdGlvbiwgYFVua25vd24gY2hhdCBzZXNzaW9uIHBvc2l0aW9uOiAke29wZW5PcHRpb25zLnBvc2l0aW9ufWApO1xuXHRcdH1cblx0fSBjYXRjaCAoZSkge1xuXHRcdGxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byBvcGVuICcke29wZW5PcHRpb25zLnR5cGV9JyBjaGF0IHNlc3Npb24gd2l0aCBvcGVuT3B0aW9uczogJHtKU09OLnN0cmluZ2lmeShvcGVuT3B0aW9ucyl9YCwgZSk7XG5cdFx0c2Vzc2lvbnNMaXN0U3VwcHJlc3Npb24/LmRpc3Bvc2UoKTtcblx0XHR0cmFuc2l0aW9uUHJvZ3Jlc3M/LmNvbXBsZXRlKCk7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0Ly8gU2VuZCBpbml0aWFsIHByb21wdCBpZiBwcm92aWRlZFxuXHRpZiAoY2hhdFNlbmRPcHRpb25zKSB7XG5cdFx0dHJ5IHtcblx0XHRcdC8vIFNldCBpbml0aWFsIHNlc3Npb24gb3B0aW9ucyBvbiB0aGUgbW9kZWwgYmVmb3JlIHNlbmRpbmcgdGhlIHJlcXVlc3QsXG5cdFx0XHQvLyBzbyB0aGF0IHRoZSBjb250cmlidXRlZCBzZXNzaW9uIHByb3ZpZGVyIGNhbiByZWFkIHRoZW0uXG5cdFx0XHRpZiAoY2hhdFNlbmRPcHRpb25zLmluaXRpYWxTZXNzaW9uT3B0aW9ucykge1xuXHRcdFx0XHRjaGF0U2Vzc2lvblNlcnZpY2UudXBkYXRlU2Vzc2lvbk9wdGlvbnMoc2Vzc2lvblJlc291cmNlLCBub3JtYWxpemVTZXNzaW9uT3B0aW9ucyhjaGF0U2VuZE9wdGlvbnMuaW5pdGlhbFNlc3Npb25PcHRpb25zKSk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBhdHRhY2hlZENvbnRleHQgPSBjaGF0U2VuZE9wdGlvbnMuYXR0YWNoZWRDb250ZXh0O1xuXHRcdFx0Y29uc3QgcHJvbXB0RmlsZSA9IGF3YWl0IHJlc29sdmVQcm9tcHRTbGFzaENvbW1hbmQoY2hhdFNlbmRPcHRpb25zLnByb21wdCwgc2Vzc2lvblJlc291cmNlLCBjdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIHRvb2xzU2VydmljZSk7XG5cdFx0XHRpZiAocHJvbXB0RmlsZSkge1xuXHRcdFx0XHRhdHRhY2hlZENvbnRleHQgPSBbcHJvbXB0RmlsZSwgLi4uKGF0dGFjaGVkQ29udGV4dCA/PyBbXSldO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY2hhdFNlcnZpY2Uuc2VuZFJlcXVlc3Qoc2Vzc2lvblJlc291cmNlLCBjaGF0U2VuZE9wdGlvbnMucHJvbXB0LCB7IGFnZW50SWRTaWxlbnQ6IG9wZW5PcHRpb25zLnR5cGUsIGF0dGFjaGVkQ29udGV4dCB9KTtcblx0XHRcdGNvbnN0IG5ld1Nlc3Npb25SZXNvdXJjZSA9IHJlc3VsdC5raW5kID09PSAnc2VudCcgfHwgcmVzdWx0LmtpbmQgPT09ICdyZWplY3RlZCcgPyByZXN1bHQubmV3U2Vzc2lvblJlc291cmNlIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKG5ld1Nlc3Npb25SZXNvdXJjZSAmJiAhcmVzb3VyY2VzLmlzRXF1YWwobmV3U2Vzc2lvblJlc291cmNlLCBzZXNzaW9uUmVzb3VyY2UpKSB7XG5cdFx0XHRcdHN3aXRjaCAob3Blbk9wdGlvbnMucG9zaXRpb24pIHtcblx0XHRcdFx0XHRjYXNlIENoYXRTZXNzaW9uUG9zaXRpb24uU2lkZWJhcjoge1xuXHRcdFx0XHRcdFx0Y29uc3QgdmlldyA9IGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldyhDaGF0Vmlld0lkKSBhcyBDaGF0Vmlld1BhbmU7XG5cdFx0XHRcdFx0XHRhd2FpdCB2aWV3LmxvYWRTZXNzaW9uKG5ld1Nlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSBDaGF0U2Vzc2lvblBvc2l0aW9uLkVkaXRvcjoge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiBlZGl0b3JHcm91cFNlcnZpY2UuZ3JvdXBzKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGVkaXRvciA9IGdyb3VwLmVkaXRvcnMuZmluZChlID0+IGUgaW5zdGFuY2VvZiBDaGF0RWRpdG9ySW5wdXQgJiYgcmVzb3VyY2VzLmlzRXF1YWwoZS5zZXNzaW9uUmVzb3VyY2UsIHNlc3Npb25SZXNvdXJjZSkpO1xuXHRcdFx0XHRcdFx0XHRpZiAoZWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRcdFx0YXdhaXQgZWRpdG9yU2VydmljZS5yZXBsYWNlRWRpdG9ycyhbeyBlZGl0b3IsIHJlcGxhY2VtZW50OiB7IHJlc291cmNlOiBuZXdTZXNzaW9uUmVzb3VyY2UsIG9wdGlvbnM6IHsgb3ZlcnJpZGU6IENoYXRFZGl0b3JJbnB1dC5FZGl0b3JJRCwgcGlubmVkOiB0cnVlIH0gfSB9XSwgZ3JvdXApO1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZGVmYXVsdDogYXNzZXJ0TmV2ZXIob3Blbk9wdGlvbnMucG9zaXRpb24sIGBVbmtub3duIGNoYXQgc2Vzc2lvbiBwb3NpdGlvbjogJHtvcGVuT3B0aW9ucy5wb3NpdGlvbn1gKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGxvZ1NlcnZpY2UuZXJyb3IoYEZhaWxlZCB0byBzZW5kIGluaXRpYWwgcmVxdWVzdCB0byAnJHtvcGVuT3B0aW9ucy50eXBlfScgY2hhdCBzZXNzaW9uIHdpdGggY29udGV4dE9wdGlvbnM6ICR7SlNPTi5zdHJpbmdpZnkoY2hhdFNlbmRPcHRpb25zKX1gLCBlKTtcblx0XHR9XG5cdH1cblxuXHQvLyBUaGUgbWlncmF0aW9uIHRyYW5zaXRpb24gaXMgY29tcGxldGUgKHNlc3Npb24gbG9hZGVkLCByZXF1ZXN0IHNlbnQgYW5kIGFueVxuXHQvLyB1bnRpdGxlZFx1MjE5MnJlYWwgcmViaW5kIGRvbmUpOyBhbGxvdyB0aGUgc2Vzc2lvbnMgbGlzdCBhZ2FpbiBhbmQgc3RvcCB0aGVcblx0Ly8gd29ya2luZyBpbmRpY2F0b3IuXG5cdHNlc3Npb25zTGlzdFN1cHByZXNzaW9uPy5kaXNwb3NlKCk7XG5cdHRyYW5zaXRpb25Qcm9ncmVzcz8uY29tcGxldGUoKTtcbn1cblxuLyoqXG4gKiBOb3JtYWxpemVzIHNlc3Npb24gb3B0aW9ucyB0aGF0IG1heSBhcnJpdmUgaW4gb25lIG9mIHRocmVlIHJ1bnRpbWUgc2hhcGVzXG4gKiBpbnRvIGEgcHJvcGVyIGBSZWFkb25seUNoYXRTZXNzaW9uT3B0aW9uc01hcGA6XG4gKlxuICogLSAqKk1hcCoqIFx1MjAxNCByZXR1cm5lZCBhcy1pcy5cbiAqIC0gKipBcnJheSoqIG9mIGB7b3B0aW9uSWQsIHZhbHVlfWAgb2JqZWN0cyBcdTIwMTQgZS5nLiBmcm9tIGNvbW1hbmQgYXJndW1lbnRzXG4gKiAgIHRoYXQgYnlwYXNzIHN0YXRpYyB0eXBlIGNoZWNraW5nLlxuICogLSAqKlBsYWluIHJlY29yZCoqIChgUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtPmApXG4gKiAgIFx1MjAxNCBlLmcuIGZyb20gSlNPTiBkZXNlcmlhbGl6YXRpb24gYWNyb3NzIHByb2Nlc3MgYm91bmRhcmllcyB3aGVyZSBhIE1hcFxuICogICBsb3NlcyBpdHMgcHJvdG90eXBlLlxuICovXG5mdW5jdGlvbiBub3JtYWxpemVTZXNzaW9uT3B0aW9ucyhvcHRpb25zOiBSZWFkb25seUNoYXRTZXNzaW9uT3B0aW9uc01hcCB8IFJlYWRvbmx5QXJyYXk8eyBvcHRpb25JZDogc3RyaW5nOyB2YWx1ZTogc3RyaW5nIHwgSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25JdGVtIH0+KTogUmVhZG9ubHlDaGF0U2Vzc2lvbk9wdGlvbnNNYXAge1xuXHRpZiAob3B0aW9ucyBpbnN0YW5jZW9mIE1hcCkge1xuXHRcdHJldHVybiBvcHRpb25zO1xuXHR9XG5cdGlmIChBcnJheS5pc0FycmF5KG9wdGlvbnMpKSB7XG5cdFx0cmV0dXJuIG5ldyBNYXAob3B0aW9ucy5tYXAobyA9PiBbby5vcHRpb25JZCwgby52YWx1ZV0pKTtcblx0fVxuXHQvLyBQbGFpbiBvYmplY3QgZmFsbGJhY2sgKGUuZy4gZnJvbSBKU09OIGRlc2VyaWFsaXphdGlvbilcblx0cmV0dXJuIENoYXRTZXNzaW9uT3B0aW9uc01hcC5mcm9tUmVjb3JkKG9wdGlvbnMgYXMgdW5rbm93biBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBJQ2hhdFNlc3Npb25Qcm92aWRlck9wdGlvbkl0ZW0+KTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRoZSB2YXJpYWJsZSBlbnRyeSBmb3IgYSBzbGFzaCBjb21tYW5kIGlmIHRoZSBwcm9tcHQgc3RhcnRzIHdpdGggYSBzbGFzaCBjb21tYW5kIHRoYXQgY2FuIGJlIHJlc29sdmVkIHRvIGEgcHJvbXB0IGZpbGUsIG90aGVyd2lzZSByZXR1cm5zIHVuZGVmaW5lZC5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gcmVzb2x2ZVByb21wdFNsYXNoQ29tbWFuZChwcm9tcHQ6IHN0cmluZywgc2Vzc2lvblJlc291cmNlOiBVUkksIGN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZTogSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSwgdG9vbHNTZXJ2aWNlOiBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSk6IFByb21pc2U8SUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdCBzbGFzaE1hdGNoID0gcHJvbXB0Lm1hdGNoKHNsYXNoUmVnKTtcblx0Ly8gc3RhcnRzIHdpdGggYSBzbGFzaCBjb21tYW5kLCBhZGQgdGhlIGNvcnJlc3BvbmRpbmcgcHJvbXB0IGZpbGUgdG8gdGhlIGNvbnRleHQgaWYgaXQgZXhpc3RzXG5cdGlmIChzbGFzaE1hdGNoKSB7XG5cdFx0Ly8gbmVlZCB0byByZXNvbHZlIHRoZSBzbGFzaCBjb21tYW5kIHRvIGdldCB0aGUgcHJvbXB0IGZpbGVcblx0XHRjb25zdCBzbGFzaENvbW1hbmQgPSBhd2FpdCBjdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UucmVzb2x2ZVByb21wdFNsYXNoQ29tbWFuZChzbGFzaE1hdGNoWzFdLCBzZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmIChzbGFzaENvbW1hbmQpIHtcblx0XHRcdGNvbnN0IHBhcnNlUmVzdWx0ID0gc2xhc2hDb21tYW5kLnBhcnNlZFByb21wdEZpbGU7XG5cdFx0XHQvLyBhZGQgdGhlIHByb21wdCBmaWxlIHRvIHRoZSBjb250ZXh0XG5cdFx0XHRjb25zdCByZWZzID0gcGFyc2VSZXN1bHQuYm9keT8udmFyaWFibGVSZWZlcmVuY2VzLm1hcCgoeyBuYW1lLCBvZmZzZXQsIGZ1bGxMZW5ndGggfSkgPT4gKHsgbmFtZSwgcmFuZ2U6IG5ldyBPZmZzZXRSYW5nZShvZmZzZXQsIG9mZnNldCArIGZ1bGxMZW5ndGgpIH0pKSA/PyBbXTtcblx0XHRcdGNvbnN0IHRvb2xSZWZlcmVuY2VzID0gdG9vbHNTZXJ2aWNlLnRvVG9vbFJlZmVyZW5jZXMocmVmcyk7XG5cdFx0XHRyZXR1cm4gdG9Qcm9tcHRGaWxlVmFyaWFibGVFbnRyeShwYXJzZVJlc3VsdC51cmksIFByb21wdEZpbGVWYXJpYWJsZUtpbmQuUHJvbXB0RmlsZSwgdW5kZWZpbmVkLCB0cnVlLCB0b29sUmVmZXJlbmNlcyk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRSZXNvdXJjZUZvck5ld0NoYXRTZXNzaW9uKG9wdGlvbnM6IE5ld0NoYXRTZXNzaW9uT3Blbk9wdGlvbnMpOiBVUkkge1xuXHRjb25zdCBpc1JlbW90ZVNlc3Npb24gPSBvcHRpb25zLnR5cGUgIT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5Mb2NhbDtcblx0aWYgKGlzUmVtb3RlU2Vzc2lvbikge1xuXHRcdHJldHVybiBVUkkuZnJvbSh7XG5cdFx0XHRzY2hlbWU6IG9wdGlvbnMudHlwZSxcblx0XHRcdHBhdGg6IGAvdW50aXRsZWQtJHtnZW5lcmF0ZVV1aWQoKX1gLFxuXHRcdH0pO1xuXHR9XG5cblx0Y29uc3QgaXNFZGl0b3JQb3NpdGlvbiA9IG9wdGlvbnMucG9zaXRpb24gPT09IENoYXRTZXNzaW9uUG9zaXRpb24uRWRpdG9yO1xuXHRpZiAoaXNFZGl0b3JQb3NpdGlvbikge1xuXHRcdHJldHVybiBDaGF0RWRpdG9ySW5wdXQuZ2V0TmV3RWRpdG9yVXJpKCk7XG5cdH1cblxuXHRyZXR1cm4gTG9jYWxDaGF0U2Vzc2lvblVyaS5nZXROZXdTZXNzaW9uVXJpKCk7XG59XG5cbmZ1bmN0aW9uIGlzQWdlbnRTZXNzaW9uUHJvdmlkZXJUeXBlKHR5cGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gT2JqZWN0LnZhbHVlcyhBZ2VudFNlc3Npb25Qcm92aWRlcnMpLmluY2x1ZGVzKHR5cGUgYXMgQWdlbnRTZXNzaW9uUHJvdmlkZXJzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNlc3Npb25TdGF0dXNGb3JNb2RlbChtb2RlbDogSUNoYXRNb2RlbCk6IENoYXRTZXNzaW9uU3RhdHVzIHwgdW5kZWZpbmVkIHtcblx0aWYgKG1vZGVsLnJlcXVlc3RJblByb2dyZXNzLmdldCgpKSB7XG5cdFx0cmV0dXJuIENoYXRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3M7XG5cdH1cblxuXHRjb25zdCBsYXN0UmVxdWVzdCA9IG1vZGVsLmdldFJlcXVlc3RzKCkuYXQoLTEpO1xuXHRpZiAobGFzdFJlcXVlc3Q/LnJlc3BvbnNlKSB7XG5cdFx0aWYgKGxhc3RSZXF1ZXN0LnJlc3BvbnNlLnN0YXRlID09PSBSZXNwb25zZU1vZGVsU3RhdGUuTmVlZHNJbnB1dCkge1xuXHRcdFx0cmV0dXJuIENoYXRTZXNzaW9uU3RhdHVzLk5lZWRzSW5wdXQ7XG5cdFx0fSBlbHNlIGlmIChsYXN0UmVxdWVzdC5yZXNwb25zZS5pc0NhbmNlbGVkIHx8IGxhc3RSZXF1ZXN0LnJlc3BvbnNlLnJlc3VsdD8uZXJyb3JEZXRhaWxzPy5jb2RlID09PSAnY2FuY2VsZWQnKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkO1xuXHRcdH0gZWxzZSBpZiAobGFzdFJlcXVlc3QucmVzcG9uc2UucmVzdWx0Py5lcnJvckRldGFpbHMpIHtcblx0XHRcdHJldHVybiBDaGF0U2Vzc2lvblN0YXR1cy5GYWlsZWQ7XG5cdFx0fSBlbHNlIGlmIChsYXN0UmVxdWVzdC5yZXNwb25zZS5pc0NvbXBsZXRlKSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFNlc3Npb25TdGF0dXMuQ29tcGxldGVkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcztcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2hhdFJlc3BvbnNlU3RhdGVUb1Nlc3Npb25TdGF0dXMoc3RhdGU6IFJlc3BvbnNlTW9kZWxTdGF0ZSk6IENoYXRTZXNzaW9uU3RhdHVzIHtcblx0c3dpdGNoIChzdGF0ZSkge1xuXHRcdGNhc2UgUmVzcG9uc2VNb2RlbFN0YXRlLkNhbmNlbGxlZDpcblx0XHRjYXNlIFJlc3BvbnNlTW9kZWxTdGF0ZS5Db21wbGV0ZTpcblx0XHRcdHJldHVybiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQ7XG5cdFx0Y2FzZSBSZXNwb25zZU1vZGVsU3RhdGUuRmFpbGVkOlxuXHRcdFx0cmV0dXJuIENoYXRTZXNzaW9uU3RhdHVzLkZhaWxlZDtcblx0XHRjYXNlIFJlc3BvbnNlTW9kZWxTdGF0ZS5QZW5kaW5nOlxuXHRcdFx0cmV0dXJuIENoYXRTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3M7XG5cdFx0Y2FzZSBSZXNwb25zZU1vZGVsU3RhdGUuTmVlZHNJbnB1dDpcblx0XHRcdHJldHVybiBDaGF0U2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsV0FBVztBQUNwQixTQUFTLHVCQUF1QixpQkFBaUIsNkJBQTZCO0FBQzlFLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxvQkFBb0IsWUFBWSxlQUFlLGlCQUE4QixvQkFBb0I7QUFDMUcsU0FBUyxhQUFhLG1CQUFtQjtBQUN6QyxTQUFTLGVBQWU7QUFDeEIsWUFBWSxlQUFlO0FBQzNCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQVMsY0FBYyxRQUFRLGdCQUFnQixjQUFjLHVCQUF1QjtBQUM3RixTQUFTLGdCQUE2QiwwQkFBMEI7QUFFaEUsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsNkJBQStDO0FBQ3hELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYztBQUN2QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQiw0QkFBNEI7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBMkQseUJBQXlCO0FBQ3BGLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCLG1CQUFtQix3QkFBcWMsc0JBQWdGLDJCQUEyQixzQkFBeUYsbUJBQW1CO0FBQy9zQixTQUFTLG1CQUFtQixvQkFBb0I7QUFDaEQsU0FBUyxx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
