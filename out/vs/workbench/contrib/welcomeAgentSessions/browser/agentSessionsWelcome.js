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
import "./media/agentSessionsWelcome.css";
import { $, addDisposableListener, append, clearNode, getWindow, scheduleAtNextAnimationFrame } from "../../../../base/browser/dom.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { DomScrollableElement } from "../../../../base/browser/ui/scrollbar/scrollableElement.js";
import { Toggle } from "../../../../base/browser/ui/toggle/toggle.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { basename } from "../../../../base/common/resources.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { editorBackground } from "../../../../platform/theme/common/colorRegistry.js";
import { getListStyles, getToggleStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { SIDE_BAR_FOREGROUND } from "../../../common/theme.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IWorkbenchLayoutService } from "../../../services/layout/browser/layoutService.js";
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../../chat/common/constants.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { ChatWidget } from "../../chat/browser/widget/chatWidget.js";
import { IAgentSessionsService } from "../../chat/browser/agentSessions/agentSessionsService.js";
import { AgentSessionProviders } from "../../chat/browser/agentSessions/agentSessions.js";
import { AgentSessionsWelcomeInput } from "./agentSessionsWelcomeInput.js";
import { IChatService } from "../../chat/common/chatService/chatService.js";
import { ChatViewId, IChatWidgetService } from "../../chat/browser/chat.js";
import { ChatSessionPosition, getResourceForNewChatSession } from "../../chat/browser/chatSessions/chatSessions.contribution.js";
import { IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { AgentSessionsControl } from "../../chat/browser/agentSessions/agentSessionsControl.js";
import { AgentSessionsFilter } from "../../chat/browser/agentSessions/agentSessionsFilter.js";
import { AgentSessionsListDelegate } from "../../chat/browser/agentSessions/agentSessionsViewer.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { IWalkthroughsService } from "../../welcomeGettingStarted/browser/gettingStartedService.js";
import { GettingStartedInput } from "../../welcomeGettingStarted/browser/gettingStartedInput.js";
import { IMarkdownRendererService } from "../../../../platform/markdown/browser/markdownRenderer.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspacesService, isRecentFolder, isRecentWorkspace } from "../../../../platform/workspaces/common/workspaces.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../common/views.js";
import { toErrorMessage } from "../../../../base/common/errorMessage.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { canShowAgentsBanner, createAgentsBanner } from "../../chat/browser/agentSessions/agentSessionsBanner.js";
const configurationKey = "workbench.startupEditor";
const MAX_SESSIONS = 6;
const MAX_REPO_PICKS = 10;
const MAX_WALKTHROUGHS = 10;
const WELCOME_CHAT_INPUT_LAYOUT_HEIGHT = 150;
const WELCOME_CHAT_INPUT_RESERVED_LIST_HEIGHT = 50;
const WELCOME_CHAT_INPUT_RESERVED_CHROME_HEIGHT = 72;
const WELCOME_COMPACT_HEIGHT = 800;
const WELCOME_CHAT_INPUT_MAX_HEIGHT_OVERRIDE = WELCOME_CHAT_INPUT_LAYOUT_HEIGHT + WELCOME_CHAT_INPUT_RESERVED_LIST_HEIGHT + WELCOME_CHAT_INPUT_RESERVED_CHROME_HEIGHT;
let AgentSessionsWelcomePage = class extends EditorPane {
  constructor(group, telemetryService, themeService, storageService, instantiationService, contextKeyService, layoutService, commandService, editorService, agentSessionsService, configurationService, productService, walkthroughsService, chatService, chatEntitlementService, markdownRendererService, workspaceContextService, workspacesService, hostService, workspaceTrustManagementService, viewDescriptorService, chatWidgetService, logService) {
    super(AgentSessionsWelcomePage.ID, group, telemetryService, themeService, storageService);
    this.storageService = storageService;
    this.instantiationService = instantiationService;
    this.layoutService = layoutService;
    this.commandService = commandService;
    this.editorService = editorService;
    this.agentSessionsService = agentSessionsService;
    this.configurationService = configurationService;
    this.productService = productService;
    this.walkthroughsService = walkthroughsService;
    this.chatService = chatService;
    this.chatEntitlementService = chatEntitlementService;
    this.markdownRendererService = markdownRendererService;
    this.workspaceContextService = workspaceContextService;
    this.workspacesService = workspacesService;
    this.hostService = hostService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.viewDescriptorService = viewDescriptorService;
    this.chatWidgetService = chatWidgetService;
    this.logService = logService;
    this.sessionsControlDisposables = this._register(new DisposableStore());
    this.contentDisposables = this._register(new DisposableStore());
    this.walkthroughs = [];
    this._selectedSessionProvider = AgentSessionProviders.Local;
    this._recentTrustedWorkspaces = [];
    this._isEmptyWorkspace = false;
    this._workspaceKind = "empty";
    // Telemetry tracking
    this._openedAt = 0;
    this.container = $(".agentSessionsWelcome", {
      role: "document",
      tabindex: 0,
      "aria-label": localize("agentSessionsWelcomeAriaLabel", "Overview of agent sessions and how to get started.")
    });
    this.contextService = this._register(contextKeyService.createScoped(this.container));
    ChatContextKeys.inAgentSessionsWelcome.bindTo(this.contextService).set(true);
    this._register(this.chatEntitlementService.onDidChangeSentiment(() => {
      const input = this.input || this._storedInput;
      if (this.chatEntitlementService.sentiment.hidden && input) {
        this._closedBy = "chatHidden";
        this.group.closeEditor(input);
      }
    }));
  }
  createEditor(parent) {
    parent.appendChild(this.container);
    this.contentContainer = $(".agentSessionsWelcome-content");
    this.scrollableElement = this._register(new DomScrollableElement(this.contentContainer, {
      className: "agentSessionsWelcome-scrollable",
      vertical: ScrollbarVisibility.Auto
    }));
    this.container.appendChild(this.scrollableElement.getDomNode());
  }
  async setInput(input, options, context, token) {
    this._storedInput = input;
    this._openedAt = Date.now();
    await super.setInput(input, options, context, token);
    this._workspaceKind = input.workspaceKind ?? "empty";
    await this.buildContent();
  }
  clearInput() {
    if (this._openedAt > 0) {
      const visibleDurationMs = Date.now() - this._openedAt;
      this.telemetryService.publicLog2(
        "agentSessionsWelcome.closed",
        {
          visibleDurationMs,
          closedBy: this._closedBy ?? "disposed"
        }
      );
      this._openedAt = 0;
      this._closedBy = void 0;
    }
    super.clearInput();
  }
  async buildContent() {
    this.contentDisposables.clear();
    this.sessionsControlDisposables.clear();
    this.sessionsControl = void 0;
    clearNode(this.contentContainer);
    this._isEmptyWorkspace = this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY;
    if (this._isEmptyWorkspace) {
      const recentlyOpened = await this.getRecentlyOpenedWorkspaces(true);
      this._recentTrustedWorkspaces = recentlyOpened.slice(0, MAX_REPO_PICKS);
    }
    this.walkthroughs = this.walkthroughsService.getWalkthroughs();
    const header = append(this.contentContainer, $(".agentSessionsWelcome-header"));
    append(header, $("h1.product-name", {}, this.productService.nameLong));
    const startEntries = append(header, $(".agentSessionsWelcome-startEntries"));
    await this.buildStartEntries(startEntries);
    const chatSection = append(this.contentContainer, $(".agentSessionsWelcome-chatSection"));
    this.buildChatWidget(chatSection);
    const sessionsSection = append(this.contentContainer, $(".agentSessionsWelcome-sessionsSection"));
    this.buildSessionsOrPrompts(sessionsSection);
    const footer = append(this.contentContainer, $(".agentSessionsWelcome-footer"));
    this.buildFooter(footer);
    let originalSessions = this.agentSessionsService.model.sessions.length > 0;
    this.contentDisposables.add(this.agentSessionsService.model.onDidChangeSessions(() => {
      const hasSessions = this.agentSessionsService.model.sessions.length > 0;
      if (hasSessions !== originalSessions) {
        originalSessions = hasSessions;
        clearNode(sessionsSection);
        this.buildSessionsOrPrompts(sessionsSection);
      }
      this.layoutSessionsControl();
    }));
    this.scrollableElement?.scanDomNode();
  }
  async buildStartEntries(container) {
    const workspaces = await this.getRecentlyOpenedWorkspaces(false);
    const openEntry = workspaces.length > 0 ? { icon: Codicon.folderOpened, label: localize("openRecent", "Open Recent..."), command: "workbench.action.openRecent" } : { icon: Codicon.folderOpened, label: localize("openFolder", "Open Folder..."), command: "workbench.action.files.openFolder" };
    const entries = [
      openEntry,
      { icon: Codicon.newFile, label: localize("newFile", "New file..."), command: "welcome.showNewFileEntries" },
      { icon: Codicon.repoClone, label: localize("cloneRepo", "Clone Git Repository..."), command: "git.clone" }
    ];
    for (const entry of entries) {
      const button = append(container, $("button.agentSessionsWelcome-startEntry"));
      button.appendChild(renderIcon(entry.icon));
      button.appendChild(document.createTextNode(entry.label));
      button.onclick = () => {
        this.telemetryService.publicLog2(
          "agentSessionsWelcome.ActionExecuted",
          { welcomeKind: "agentSessionsWelcomePage", action: "executeCommand", actionId: entry.command }
        );
        this.commandService.executeCommand(entry.command);
      };
    }
  }
  buildChatWidget(container) {
    const chatWidgetContainer = append(container, $(".agentSessionsWelcome-chatWidget"));
    const editorOverflowWidgetsDomNode = this.layoutService.getContainer(getWindow(chatWidgetContainer)).appendChild($(".chat-editor-overflow.monaco-editor"));
    this.contentDisposables.add(toDisposable(() => editorOverflowWidgetsDomNode.remove()));
    const scopedContextKeyService = this.contentDisposables.add(this.contextService.createScoped(chatWidgetContainer));
    const scopedInstantiationService = this.contentDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService])));
    const onDidChangeActiveSessionProvider = this.contentDisposables.add(new Emitter());
    const recreateSessionForProvider = async (provider) => {
      if (this.chatWidget && this.chatModelRef) {
        this.chatWidget.setModel(void 0);
        this.chatModelRef.dispose();
        const newResource = getResourceForNewChatSession({
          type: provider,
          position: ChatSessionPosition.Sidebar,
          displayName: ""
        });
        const ref = await this.chatService.acquireOrLoadSession(newResource, ChatAgentLocation.Chat, CancellationToken.None);
        this.chatModelRef = ref ?? this.chatService.startNewLocalSession(ChatAgentLocation.Chat);
        this.contentDisposables.add(this.chatModelRef);
        if (this.chatModelRef.object) {
          this.chatWidget.setModel(this.chatModelRef.object);
        }
      }
    };
    const sessionTypePickerDelegate = {
      getActiveSessionProvider: () => this._selectedSessionProvider,
      setActiveSessionProvider: (provider) => {
        this._selectedSessionProvider = provider;
        onDidChangeActiveSessionProvider.fire(provider);
        try {
          recreateSessionForProvider(provider);
        } catch {
        }
      },
      onDidChangeActiveSessionProvider: onDidChangeActiveSessionProvider.event
    };
    const onDidChangeSelectedWorkspace = this.contentDisposables.add(new Emitter());
    const onDidChangeWorkspaces = this.contentDisposables.add(new Emitter());
    const workspacePickerDelegate = this._isEmptyWorkspace ? {
      getWorkspaces: () => this._recentTrustedWorkspaces.map((w) => ({
        uri: this.getWorkspaceUri(w),
        label: this.getWorkspaceLabel(w),
        isFolder: isRecentFolder(w)
      })),
      getSelectedWorkspace: () => this._selectedWorkspace,
      setSelectedWorkspace: (workspace) => {
        this._selectedWorkspace = workspace;
        onDidChangeSelectedWorkspace.fire(workspace);
      },
      onDidChangeSelectedWorkspace: onDidChangeSelectedWorkspace.event,
      onDidChangeWorkspaces: onDidChangeWorkspaces.event,
      openFolderCommand: "workbench.action.files.openFolder"
    } : void 0;
    this.chatWidget = this.contentDisposables.add(scopedInstantiationService.createInstance(
      ChatWidget,
      ChatAgentLocation.Chat,
      // TODO: @osortega should we have a completely different ID and check that context instead in chatInputPart?
      {},
      // Empty resource view context
      {
        autoScroll: (mode) => mode !== ChatModeKind.Ask,
        renderFollowups: false,
        supportsFileReferences: true,
        renderInputOnTop: true,
        rendererOptions: {
          renderTextEditsAsSummary: () => true,
          referencesExpandedWhenEmptyResponse: false,
          progressMessageAtBottomOfResponse: (mode) => mode !== ChatModeKind.Ask
        },
        editorOverflowWidgetsDomNode,
        enableImplicitContext: true,
        enableWorkingSet: "explicit",
        supportsChangingModes: true,
        sessionTypePickerDelegate,
        workspacePickerDelegate,
        submitHandler: this._isEmptyWorkspace ? (query, mode) => this.handleWorkspaceSubmission(query, mode) : void 0
      },
      {
        listForeground: SIDE_BAR_FOREGROUND,
        listBackground: editorBackground,
        overlayBackground: editorBackground,
        inputEditorBackground: editorBackground,
        resultEditorBackground: editorBackground
      }
    ));
    this.chatWidget.render(chatWidgetContainer);
    this.chatWidget.setVisible(true);
    this.contentDisposables.add(scheduleAtNextAnimationFrame(getWindow(chatWidgetContainer), () => {
      this.layoutChatWidget();
    }));
    this.chatModelRef = this.chatService.startNewLocalSession(ChatAgentLocation.Chat);
    this.contentDisposables.add(this.chatModelRef);
    if (this.chatModelRef.object) {
      this.chatWidget.setModel(this.chatModelRef.object);
    }
    this.contentDisposables.add(addDisposableListener(chatWidgetContainer, "mousedown", () => {
      this.chatWidget?.focusInput();
    }));
    this.contentDisposables.add(this.chatService.onDidSubmitRequest(({ chatSessionResource }) => {
      if (this.chatModelRef?.object?.sessionResource.toString() === chatSessionResource.toString()) {
        const mode = this.chatWidget?.input.currentModeObs.get().name.get() || "unknown";
        this.telemetryService.publicLog2(
          "agentSessionsWelcome.chatSubmitted",
          {
            mode,
            provider: this._selectedSessionProvider,
            workspaceKind: this._workspaceKind,
            selectedRecentWorkspace: this._selectedWorkspace !== void 0
          }
        );
        this._closedBy = "chatSubmission";
        this.openSessionInChat(chatSessionResource);
      }
    }));
    this.applyPrefillData();
  }
  getWorkspaceLabel(workspace) {
    if (isRecentFolder(workspace)) {
      return workspace.label || basename(workspace.folderUri);
    } else if (isRecentWorkspace(workspace)) {
      return workspace.label || basename(workspace.workspace.configPath);
    }
    return "";
  }
  getWorkspaceUri(workspace) {
    if (isRecentFolder(workspace)) {
      return workspace.folderUri;
    } else if (isRecentWorkspace(workspace)) {
      return workspace.workspace.configPath;
    }
    throw new Error("Invalid workspace type");
  }
  async handleWorkspaceSubmission(query, mode) {
    if (!this._selectedWorkspace) {
      return false;
    }
    if (!query.trim()) {
      return false;
    }
    const prefillData = {
      query,
      mode,
      timestamp: Date.now()
    };
    this.storageService.store(
      "chat.welcomeViewPrefill",
      JSON.stringify(prefillData),
      StorageScope.APPLICATION,
      StorageTarget.MACHINE
    );
    const workspace = this._recentTrustedWorkspaces.find((w) => this.getWorkspaceUri(w).toString() === this._selectedWorkspace?.uri.toString());
    if (workspace) {
      try {
        if (isRecentFolder(workspace)) {
          await this.hostService.openWindow([{ folderUri: workspace.folderUri }]);
        } else if (isRecentWorkspace(workspace)) {
          await this.hostService.openWindow([{ workspaceUri: workspace.workspace.configPath }]);
        }
        return true;
      } catch (e) {
      }
    }
    this.storageService.remove("chat.welcomeViewPrefill", StorageScope.APPLICATION);
    return false;
  }
  /**
   * Reads and applies prefill data from storage (used when transferring chat input from another workspace).
   * This is called after the chat widget is created to populate it with any pending prefill data.
   */
  applyPrefillData() {
    const prefillData = this.storageService.get("chat.welcomeViewPrefill", StorageScope.APPLICATION);
    if (prefillData) {
      this.storageService.remove("chat.welcomeViewPrefill", StorageScope.APPLICATION);
      try {
        const { query, mode, timestamp } = JSON.parse(prefillData);
        if (timestamp && Date.now() - timestamp > 60 * 1e3) {
          return;
        }
        if (query && this.chatWidget) {
          this.chatWidget.setInput(query);
        }
        if (mode !== void 0 && this.chatWidget) {
          this.chatWidget.input.setChatMode(mode, false);
        }
        this.chatWidget?.focusInput();
      } catch {
      }
    }
  }
  buildSessionsOrPrompts(container) {
    this.sessionsControlDisposables.clear();
    this.sessionsControl = void 0;
    const sessions = this.agentSessionsService.model.sessions.filter((s) => !s.isArchived());
    if (sessions.length > 0) {
      this.buildSessionsGrid(container, sessions);
    } else {
      this.buildWalkthroughs(container);
    }
  }
  buildSessionsGrid(container, _sessions) {
    this.sessionsControlContainer = append(container, $(".agentSessionsWelcome-sessionsGrid"));
    const options = {
      overrideStyles: getListStyles({
        listBackground: editorBackground
      }),
      filter: this.sessionsControlDisposables.add(this.instantiationService.createInstance(AgentSessionsFilter, {
        limitResults: () => MAX_SESSIONS,
        overrideExclude: (session) => session.isArchived() ? true : void 0
      })),
      getHoverPosition: () => HoverPosition.BELOW,
      trackActiveEditorSession: () => false,
      source: "welcomeView",
      itemHeight: AgentSessionsListDelegate.ITEM_HEIGHT,
      sectionHeight: AgentSessionsListDelegate.SECTION_HEIGHT,
      notifySessionOpened: () => {
        const isProjectionEnabled = this.configurationService.getValue(ChatConfiguration.AgentSessionProjectionEnabled);
        if (!isProjectionEnabled) {
          this._closedBy = "sessionClicked";
          this.revealMaximizedChat();
        }
      }
    };
    this.sessionsControl = this.sessionsControlDisposables.add(this.instantiationService.createInstance(
      AgentSessionsControl,
      this.sessionsControlContainer,
      options
    ));
    this.sessionsControlDisposables.add(this.agentSessionsService.model.onDidResolve(() => {
      this.layoutSessionsControl();
    }));
    if (this.agentSessionsService.model.resolved) {
      this.layoutSessionsControl();
    }
    this.sessionsControlDisposables.add(scheduleAtNextAnimationFrame(getWindow(this.sessionsControlContainer), () => {
      this.layoutSessionsControl();
    }));
    if (canShowAgentsBanner(this.chatEntitlementService)) {
      const agentsBanner = createAgentsBanner(
        {
          cssClass: "agentSessionsWelcome-agentsBanner",
          source: "agentSessionsWelcome",
          label: localize("viewAllSessions", "View All Sessions"),
          onButtonClick: () => {
            this._closedBy = "viewAllSessions";
          }
        },
        this.commandService,
        this.telemetryService
      );
      this.sessionsControlDisposables.add(agentsBanner.disposables);
      append(container, agentsBanner.element);
    }
  }
  buildWalkthroughs(container) {
    const activeWalkthroughs = this.walkthroughs.filter(
      (w) => !w.when || this.contextService.contextMatchesRules(w.when)
    ).slice(0, MAX_WALKTHROUGHS);
    if (activeWalkthroughs.length === 0) {
      return;
    }
    let currentIndex = 0;
    const card = append(container, $(".agentSessionsWelcome-walkthroughCard"));
    const iconContainer = append(card, $(".agentSessionsWelcome-walkthroughCard-icon"));
    const content = append(card, $(".agentSessionsWelcome-walkthroughCard-content"));
    const title = append(content, $(".agentSessionsWelcome-walkthroughCard-title"));
    const desc = append(content, $(".agentSessionsWelcome-walkthroughCard-description"));
    const navContainer = append(card, $(".agentSessionsWelcome-walkthroughCard-nav"));
    const prevButton = append(navContainer, $("button.nav-button"));
    prevButton.appendChild(renderIcon(Codicon.chevronLeft));
    prevButton.title = localize("previousWalkthrough", "Previous");
    const nextButton = append(navContainer, $("button.nav-button"));
    nextButton.appendChild(renderIcon(Codicon.chevronRight));
    nextButton.title = localize("nextWalkthrough", "Next");
    const updateContent = () => {
      const walkthrough = activeWalkthroughs[currentIndex];
      clearNode(iconContainer);
      if (walkthrough.icon.type === "icon") {
        iconContainer.appendChild(renderIcon(walkthrough.icon.icon));
      }
      title.textContent = walkthrough.title;
      desc.textContent = walkthrough.description || "";
      prevButton.disabled = currentIndex === 0;
      nextButton.disabled = currentIndex === activeWalkthroughs.length - 1;
    };
    updateContent();
    card.onclick = () => {
      const walkthrough = activeWalkthroughs[currentIndex];
      this.telemetryService.publicLog2(
        "agentSessionsWelcome.ActionExecuted",
        { welcomeKind: "agentSessionsWelcomePage", action: "openWalkthrough", actionId: walkthrough.id }
      );
      const options = {
        selectedCategory: walkthrough.id,
        returnToCommand: AgentSessionsWelcomePage.COMMAND_ID
      };
      this.editorService.openEditor({
        resource: GettingStartedInput.RESOURCE,
        options
      });
    };
    prevButton.onclick = (e) => {
      e.stopPropagation();
      if (currentIndex > 0) {
        currentIndex--;
        updateContent();
      }
    };
    nextButton.onclick = (e) => {
      e.stopPropagation();
      if (currentIndex < activeWalkthroughs.length - 1) {
        currentIndex++;
        updateContent();
      }
    };
  }
  buildPrivacyNotice(container) {
    if (!this.chatEntitlementService.anonymous) {
      return;
    }
    if (this.storageService.getBoolean(AgentSessionsWelcomePage.PRIVACY_NOTICE_DISMISSED_KEY, StorageScope.APPLICATION, false)) {
      return;
    }
    const providers = this.productService.defaultChatAgent?.provider;
    if (!providers || !providers.default || !this.productService.defaultChatAgent?.termsStatementUrl || !this.productService.defaultChatAgent?.privacyStatementUrl) {
      return;
    }
    const tosCard = append(container, $(".agentSessionsWelcome-walkthroughCard.agentSessionsWelcome-tosCard"));
    const dismissNotice = () => {
      this.storageService.store(AgentSessionsWelcomePage.PRIVACY_NOTICE_DISMISSED_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);
      tosCard.remove();
    };
    this.contentDisposables.add(this.chatService.onDidSubmitRequest(() => dismissNotice()));
    const iconContainer = append(tosCard, $(".agentSessionsWelcome-walkthroughCard-icon"));
    iconContainer.appendChild(renderIcon(Codicon.chatSparkle));
    const content = append(tosCard, $(".agentSessionsWelcome-walkthroughCard-content"));
    const title = append(content, $(".agentSessionsWelcome-walkthroughCard-title"));
    title.textContent = localize("tosTitle", "Try GitHub Copilot for free, no sign-in required!");
    const desc = append(content, $(".agentSessionsWelcome-walkthroughCard-description"));
    const descriptionMarkdown = new MarkdownString(
      localize(
        { key: "tosDescription", comment: ['{Locked="]({1})"}', '{Locked="]({2})"}'] },
        "By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}).",
        providers.default.name,
        this.productService.defaultChatAgent.termsStatementUrl,
        this.productService.defaultChatAgent.privacyStatementUrl
      ),
      { isTrusted: true }
    );
    const renderedMarkdown = this.markdownRendererService.render(descriptionMarkdown);
    desc.appendChild(renderedMarkdown.element);
    const dismissButton = append(tosCard, $("button.agentSessionsWelcome-tosCard-dismiss"));
    dismissButton.appendChild(renderIcon(Codicon.close));
    dismissButton.title = localize("dismissPrivacyNotice", "Dismiss");
    dismissButton.onclick = (e) => {
      e.stopPropagation();
      dismissNotice();
    };
  }
  buildFooter(container) {
    this.buildPrivacyNotice(container);
    const showOnStartupContainer = append(container, $(".agentSessionsWelcome-showOnStartup"));
    const showOnStartupCheckbox = this.contentDisposables.add(new Toggle({
      icon: Codicon.check,
      actionClassName: "agentSessionsWelcome-checkbox",
      isChecked: this.configurationService.getValue(configurationKey) === "agentSessionsWelcomePage",
      title: localize("checkboxTitle", "When checked, this page will be shown on startup."),
      ...getToggleStyles({
        inputActiveOptionBackground: "var(--vscode-descriptionForeground)",
        inputActiveOptionForeground: "var(--vscode-editor-background)",
        inputActiveOptionBorder: "var(--vscode-descriptionForeground)"
      })
    }));
    showOnStartupCheckbox.domNode.id = "showOnStartup";
    const showOnStartupLabel = $("label.caption", { for: "showOnStartup" }, localize("showOnStartup", "Show welcome page on startup"));
    const onShowOnStartupChanged = () => {
      if (showOnStartupCheckbox.checked) {
        this.configurationService.updateValue(configurationKey, "agentSessionsWelcomePage");
      } else {
        this.configurationService.updateValue(configurationKey, "none");
      }
    };
    this.contentDisposables.add(showOnStartupCheckbox.onChange(() => onShowOnStartupChanged()));
    this.contentDisposables.add(addDisposableListener(showOnStartupLabel, "click", () => {
      showOnStartupCheckbox.checked = !showOnStartupCheckbox.checked;
      onShowOnStartupChanged();
    }));
    showOnStartupContainer.appendChild(showOnStartupCheckbox.domNode);
    showOnStartupContainer.appendChild(showOnStartupLabel);
  }
  layout(dimension) {
    this.lastDimension = dimension;
    this.container.style.height = `${dimension.height}px`;
    this.container.style.width = `${dimension.width}px`;
    this.container.classList.toggle("height-constrained", dimension.height <= WELCOME_COMPACT_HEIGHT);
    this.layoutChatWidget();
    this.layoutSessionsControl();
    this.scrollableElement?.scanDomNode();
  }
  layoutChatWidget() {
    if (!this.chatWidget || !this.lastDimension) {
      return;
    }
    const chatWidth = Math.min(800, this.lastDimension.width - 80);
    this.chatWidget.setInputPartMaxHeightOverride(WELCOME_CHAT_INPUT_MAX_HEIGHT_OVERRIDE);
    this.chatWidget.layout(WELCOME_CHAT_INPUT_LAYOUT_HEIGHT, chatWidth);
  }
  layoutSessionsControl() {
    if (!this.sessionsControl || !this.sessionsControlContainer || !this.lastDimension) {
      return;
    }
    const sessionsWidth = Math.min(800, this.lastDimension.width - 80);
    const visibleSessions = Math.min(
      this.agentSessionsService.model.sessions.filter((s) => !s.isArchived()).length,
      MAX_SESSIONS
    );
    const sessionsHeight = visibleSessions * AgentSessionsListDelegate.ITEM_HEIGHT;
    this.sessionsControl.layout(sessionsHeight, sessionsWidth);
    const marginOffset = Math.floor(visibleSessions / 2) * AgentSessionsListDelegate.ITEM_HEIGHT;
    this.sessionsControl.element.style.marginBottom = `-${marginOffset}px`;
  }
  focus() {
    super.focus();
    this.chatWidget?.focusInput();
  }
  async revealMaximizedChat() {
    try {
      await this.closeEditorAndMaximizeAuxiliaryBar();
    } catch (error) {
      this.logService.error("Failed to open maximized chat: {0}", toErrorMessage(error));
    }
  }
  async openSessionInChat(sessionResource) {
    try {
      await this.closeEditorAndMaximizeAuxiliaryBar(sessionResource);
    } catch (error) {
      this.logService.error("Failed to open agent session: {0}", toErrorMessage(error));
    }
  }
  async closeEditorAndMaximizeAuxiliaryBar(sessionResource) {
    const editorToClose = this.input || this._storedInput;
    if (editorToClose && this.group.contains(editorToClose)) {
      await new Promise((resolve) => {
        const disposable = this.group.onDidActiveEditorChange((e) => {
          disposable.dispose();
          resolve();
        });
        this.group.closeEditor(editorToClose);
      });
    }
    if (sessionResource) {
      await this.chatWidgetService.openSession(sessionResource);
    } else {
      await this.commandService.executeCommand("workbench.action.chat.open");
    }
    const chatViewLocation = this.viewDescriptorService.getViewLocationById(ChatViewId);
    if (chatViewLocation === ViewContainerLocation.AuxiliaryBar) {
      this.layoutService.setAuxiliaryBarMaximized(true);
    }
  }
  async getRecentlyOpenedWorkspaces(onlyTrusted = false) {
    const workspaces = await this.workspacesService.getRecentlyOpened();
    const trustInfoPromises = workspaces.workspaces.map(async (ws) => {
      const uri = isRecentWorkspace(ws) ? ws.workspace.configPath : ws.folderUri;
      const trustInfo = await this.workspaceTrustManagementService.getUriTrustInfo(uri);
      return { workspace: ws, trusted: trustInfo.trusted };
    });
    const trustInfoResults = await Promise.all(trustInfoPromises);
    const filteredWorkspaces = trustInfoResults.filter((result) => onlyTrusted ? result.trusted : true).map((result) => result.workspace);
    return filteredWorkspaces;
  }
};
AgentSessionsWelcomePage.ID = "agentSessionsWelcomePage";
AgentSessionsWelcomePage.COMMAND_ID = "workbench.action.openAgentSessionsWelcome";
AgentSessionsWelcomePage.PRIVACY_NOTICE_DISMISSED_KEY = "agentSessionsWelcome.privacyNoticeDismissed";
AgentSessionsWelcomePage = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IWorkbenchLayoutService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IEditorService),
  __decorateParam(9, IAgentSessionsService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IProductService),
  __decorateParam(12, IWalkthroughsService),
  __decorateParam(13, IChatService),
  __decorateParam(14, IChatEntitlementService),
  __decorateParam(15, IMarkdownRendererService),
  __decorateParam(16, IWorkspaceContextService),
  __decorateParam(17, IWorkspacesService),
  __decorateParam(18, IHostService),
  __decorateParam(19, IWorkspaceTrustManagementService),
  __decorateParam(20, IViewDescriptorService),
  __decorateParam(21, IChatWidgetService),
  __decorateParam(22, ILogService)
], AgentSessionsWelcomePage);
class AgentSessionsWelcomeInputSerializer {
  canSerialize(editorInput) {
    return true;
  }
  serialize(editorInput) {
    return JSON.stringify({});
  }
  deserialize(instantiationService, serializedEditorInput) {
    return new AgentSessionsWelcomeInput({});
  }
}
export {
  AgentSessionsWelcomeInputSerializer,
  AgentSessionsWelcomePage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVBZ2VudFNlc3Npb25zL2Jyb3dzZXIvYWdlbnRTZXNzaW9uc1dlbGNvbWUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvYWdlbnRTZXNzaW9uc1dlbGNvbWUuY3NzJztcbmltcG9ydCB7ICQsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgYXBwZW5kLCBjbGVhck5vZGUsIERpbWVuc2lvbiwgZ2V0V2luZG93LCBzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IERvbVNjcm9sbGFibGVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudC5qcyc7XG5pbXBvcnQgeyBUb2dnbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJUmVmZXJlbmNlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IFNjcm9sbGJhclZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBlZGl0b3JCYWNrZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgZ2V0TGlzdFN0eWxlcywgZ2V0VG9nZ2xlU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcGVuQ29udGV4dCwgSUVkaXRvclNlcmlhbGl6ZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IFNJREVfQkFSX0ZPUkVHUk9VTkQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDaGF0V2lkZ2V0IH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL3dpZGdldC9jaGF0V2lkZ2V0LmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvblByb3ZpZGVycywgQWdlbnRTZXNzaW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9ucy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc01vZGVsLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbnNXZWxjb21lRWRpdG9yT3B0aW9ucywgQWdlbnRTZXNzaW9uc1dlbGNvbWVJbnB1dCwgQWdlbnRTZXNzaW9uc1dlbGNvbWVXb3Jrc3BhY2VLaW5kIH0gZnJvbSAnLi9hZ2VudFNlc3Npb25zV2VsY29tZUlucHV0LmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0TW9kZWwgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ2hhdFZpZXdJZCwgSUNoYXRXaWRnZXRTZXJ2aWNlLCBJU2Vzc2lvblR5cGVQaWNrZXJEZWxlZ2F0ZSwgSVdvcmtzcGFjZVBpY2tlckRlbGVnYXRlLCBJV29ya3NwYWNlUGlja2VySXRlbSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uUG9zaXRpb24sIGdldFJlc291cmNlRm9yTmV3Q2hhdFNlc3Npb24gfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdFNlc3Npb25zL2NoYXRTZXNzaW9ucy5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbnNDb250cm9sLCBJQWdlbnRTZXNzaW9uc0NvbnRyb2xPcHRpb25zIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc0NvbnRyb2wuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uc0ZpbHRlciB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNGaWx0ZXIuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uc0xpc3REZWxlZ2F0ZSB9IGZyb20gJy4uLy4uL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNWaWV3ZXIuanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRXYWxrdGhyb3VnaCwgSVdhbGt0aHJvdWdoc1NlcnZpY2UgfSBmcm9tICcuLi8uLi93ZWxjb21lR2V0dGluZ1N0YXJ0ZWQvYnJvd3Nlci9nZXR0aW5nU3RhcnRlZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2V0dGluZ1N0YXJ0ZWRFZGl0b3JPcHRpb25zLCBHZXR0aW5nU3RhcnRlZElucHV0IH0gZnJvbSAnLi4vLi4vd2VsY29tZUdldHRpbmdTdGFydGVkL2Jyb3dzZXIvZ2V0dGluZ1N0YXJ0ZWRJbnB1dC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZG93bi9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIFdvcmtiZW5jaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZXNTZXJ2aWNlLCBJUmVjZW50Rm9sZGVyLCBJUmVjZW50V29ya3NwYWNlLCBpc1JlY2VudEZvbGRlciwgaXNSZWNlbnRXb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2VzL2NvbW1vbi93b3Jrc3BhY2VzLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBjYW5TaG93QWdlbnRzQmFubmVyLCBjcmVhdGVBZ2VudHNCYW5uZXIgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudFNlc3Npb25zQmFubmVyLmpzJztcblxuY29uc3QgY29uZmlndXJhdGlvbktleSA9ICd3b3JrYmVuY2guc3RhcnR1cEVkaXRvcic7XG5jb25zdCBNQVhfU0VTU0lPTlMgPSA2O1xuY29uc3QgTUFYX1JFUE9fUElDS1MgPSAxMDtcbmNvbnN0IE1BWF9XQUxLVEhST1VHSFMgPSAxMDtcbmNvbnN0IFdFTENPTUVfQ0hBVF9JTlBVVF9MQVlPVVRfSEVJR0hUID0gMTUwO1xuY29uc3QgV0VMQ09NRV9DSEFUX0lOUFVUX1JFU0VSVkVEX0xJU1RfSEVJR0hUID0gNTA7XG5jb25zdCBXRUxDT01FX0NIQVRfSU5QVVRfUkVTRVJWRURfQ0hST01FX0hFSUdIVCA9IDcyO1xuY29uc3QgV0VMQ09NRV9DT01QQUNUX0hFSUdIVCA9IDgwMDtcbi8vIE1pcnJvciBDaGF0V2lkZ2V0J3MgY29tcGFjdC1zdXJmYWNlIHNpemluZyBzbyB0aGUgaGlkZGVuIGxpc3QgcmVzZXJ2YXRpb24gYW5kIGlucHV0IGNocm9tZSBkbyBub3QgY29sbGFwc2UgdGhlIGVkaXRvci5cbmNvbnN0IFdFTENPTUVfQ0hBVF9JTlBVVF9NQVhfSEVJR0hUX09WRVJSSURFID0gV0VMQ09NRV9DSEFUX0lOUFVUX0xBWU9VVF9IRUlHSFQgKyBXRUxDT01FX0NIQVRfSU5QVVRfUkVTRVJWRURfTElTVF9IRUlHSFQgKyBXRUxDT01FX0NIQVRfSU5QVVRfUkVTRVJWRURfQ0hST01FX0hFSUdIVDtcblxuLyoqXG4gKiAtIHZpc2libGVEdXJhdGlvbk1zOiBEbyB0aGV5IGNsb3NlIGl0IHJpZ2h0IGF3YXkgb3IgbGVhdmUgaXQgb3BlbiAoIzMpXG4gKiAtIGNsb3NlZEJ5OiBUcmFjayB3aGF0IGFjdGlvbiBjYXVzZWQgdGhlIGNsb3NlICh2aWV3QWxsU2Vzc2lvbnMsIGNoYXRTdWJtaXNzaW9uLCBzZXNzaW9uQ2xpY2tlZCwgZXRjLikgKCM1KVxuICovXG50eXBlIEFnZW50U2Vzc2lvbnNXZWxjb21lQ2xvc2VkQ2xhc3NpZmljYXRpb24gPSB7XG5cdHZpc2libGVEdXJhdGlvbk1zOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBpc01lYXN1cmVtZW50OiB0cnVlOyBjb21tZW50OiAnSG93IGxvbmcgdGhlIHdlbGNvbWUgcGFnZSB3YXMgdmlzaWJsZSBpbiBtaWxsaXNlY29uZHMuJyB9O1xuXHRjbG9zZWRCeTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doYXQgYWN0aW9uIGNhdXNlZCB0aGUgd2VsY29tZSBwYWdlIHRvIGNsb3NlLicgfTtcblx0b3duZXI6ICdvc29ydGVnYSc7XG5cdGNvbW1lbnQ6ICdUcmFja3Mgd2hlbiB0aGUgYWdlbnQgc2Vzc2lvbnMgd2VsY29tZSBwYWdlIGlzIGNsb3NlZCB0byB1bmRlcnN0YW5kIGVuZ2FnZW1lbnQuJztcbn07XG5cbnR5cGUgQWdlbnRTZXNzaW9uc1dlbGNvbWVDbG9zZWRFdmVudCA9IHtcblx0dmlzaWJsZUR1cmF0aW9uTXM6IG51bWJlcjtcblx0Y2xvc2VkQnk6IHN0cmluZztcbn07XG5cbi8qKlxuICogLSBtb2RlL3Byb3ZpZGVyL3dvcmtzcGFjZUtpbmQ6IFRyYWNrIGFnZW50IHR5cGUsIHNlc3Npb24gcHJvdmlkZXIsIGFuZCB3b3Jrc3BhY2Ugc3RhdGUgKCM0KVxuICogLSBzZWxlY3RlZFJlY2VudFdvcmtzcGFjZTogRG8gdXNlcnMgc2VsZWN0IGEgcmVjZW50IHdvcmtzcGFjZSBiZWZvcmUgc3VibWl0dGluZyBjaGF0ICgjOClcbiAqL1xudHlwZSBBZ2VudFNlc3Npb25zV2VsY29tZUNoYXRTdWJtaXR0ZWRDbGFzc2lmaWNhdGlvbiA9IHtcblx0bW9kZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBjaGF0IG1vZGUgdXNlZCAoYXNrLCBhZ2VudCwgZWRpdCkuJyB9O1xuXHRwcm92aWRlcjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBzZXNzaW9uIHByb3ZpZGVyIChsb2NhbCwgY2xvdWQpLicgfTtcblx0d29ya3NwYWNlS2luZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB0eXBlIG9mIHdvcmtzcGFjZSAtIGVtcHR5LCBmb2xkZXIsIG9yIHdvcmtzcGFjZS4nIH07XG5cdHNlbGVjdGVkUmVjZW50V29ya3NwYWNlOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciBhIHJlY2VudCB3b3Jrc3BhY2Ugd2FzIHNlbGVjdGVkIGJlZm9yZSBzdWJtaXR0aW5nLicgfTtcblx0b3duZXI6ICdvc29ydGVnYSc7XG5cdGNvbW1lbnQ6ICdUcmFja3MgY2hhdCBzdWJtaXNzaW9ucyBmcm9tIHRoZSB3ZWxjb21lIHBhZ2UgdG8gdW5kZXJzdGFuZCBzZXNzaW9uIGNyZWF0aW9uIHBhdHRlcm5zLic7XG59O1xuXG50eXBlIEFnZW50U2Vzc2lvbnNXZWxjb21lQ2hhdFN1Ym1pdHRlZEV2ZW50ID0ge1xuXHRtb2RlOiBzdHJpbmc7XG5cdHByb3ZpZGVyOiBzdHJpbmc7XG5cdHdvcmtzcGFjZUtpbmQ6IEFnZW50U2Vzc2lvbnNXZWxjb21lV29ya3NwYWNlS2luZDtcblx0c2VsZWN0ZWRSZWNlbnRXb3Jrc3BhY2U6IGJvb2xlYW47XG59O1xuXG50eXBlIEFnZW50U2Vzc2lvbnNXZWxjb21lQWN0aW9uQ2xhc3NpZmljYXRpb24gPSB7XG5cdGFjdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1B1YmxpY05vblBlcnNvbmFsRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgYWN0aW9uIGJlaW5nIGV4ZWN1dGVkIG9uIHRoZSBhZ2VudCBzZXNzaW9ucyB3ZWxjb21lIHBhZ2UuJyB9O1xuXHRhY3Rpb25JZDogeyBjbGFzc2lmaWNhdGlvbjogJ1B1YmxpY05vblBlcnNvbmFsRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdJZGVudGlmaWVyIG9mIHRoZSBhY3Rpb24gYmVpbmcgZXhlY3V0ZWQsIHN1Y2ggYXMgY29tbWFuZCBJRCBvciB3YWxrdGhyb3VnaCBJRC4nIH07XG5cdHdlbGNvbWVLaW5kOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBraW5kIG9mIHdlbGNvbWUgcGFnZScgfTtcblx0b3duZXI6ICdvc29ydGVnYSc7XG5cdGNvbW1lbnQ6ICdIZWxwIHVuZGVyc3RhbmQgd2hhdCBhY3Rpb25zIGFyZSBtb3N0IGNvbW1vbmx5IHRha2VuIG9uIHRoZSBhZ2VudCBzZXNzaW9ucyB3ZWxjb21lIHBhZ2UnO1xufTtcblxudHlwZSBBZ2VudFNlc3Npb25zV2VsY29tZUFjdGlvbkV2ZW50ID0ge1xuXHRhY3Rpb246IHN0cmluZztcblx0d2VsY29tZUtpbmQ6ICdhZ2VudFNlc3Npb25zV2VsY29tZVBhZ2UnO1xuXHRhY3Rpb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xufTtcblxuZXhwb3J0IGNsYXNzIEFnZW50U2Vzc2lvbnNXZWxjb21lUGFnZSBleHRlbmRzIEVkaXRvclBhbmUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdhZ2VudFNlc3Npb25zV2VsY29tZVBhZ2UnO1xuXHRzdGF0aWMgcmVhZG9ubHkgQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5BZ2VudFNlc3Npb25zV2VsY29tZSc7XG5cblx0cHJpdmF0ZSBjb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBjb250ZW50Q29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc2Nyb2xsYWJsZUVsZW1lbnQ6IERvbVNjcm9sbGFibGVFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNoYXRXaWRnZXQ6IENoYXRXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgY2hhdE1vZGVsUmVmOiBJUmVmZXJlbmNlPElDaGF0TW9kZWw+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlc3Npb25zQ29udHJvbDogQWdlbnRTZXNzaW9uc0NvbnRyb2wgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2Vzc2lvbnNDb250cm9sQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uc0NvbnRyb2xEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29udGVudERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSBjb250ZXh0U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRwcml2YXRlIHdhbGt0aHJvdWdoczogSVJlc29sdmVkV2Fsa3Rocm91Z2hbXSA9IFtdO1xuXHRwcml2YXRlIF9zZWxlY3RlZFNlc3Npb25Qcm92aWRlcjogQWdlbnRTZXNzaW9uVGFyZ2V0ID0gQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsO1xuXHRwcml2YXRlIF9zZWxlY3RlZFdvcmtzcGFjZTogSVdvcmtzcGFjZVBpY2tlckl0ZW0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3JlY2VudFRydXN0ZWRXb3Jrc3BhY2VzOiBBcnJheTxJUmVjZW50V29ya3NwYWNlIHwgSVJlY2VudEZvbGRlcj4gPSBbXTtcblx0cHJpdmF0ZSBfaXNFbXB0eVdvcmtzcGFjZTogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIF93b3Jrc3BhY2VLaW5kOiBBZ2VudFNlc3Npb25zV2VsY29tZVdvcmtzcGFjZUtpbmQgPSAnZW1wdHknO1xuXG5cdC8vIFRlbGVtZXRyeSB0cmFja2luZ1xuXHRwcml2YXRlIF9vcGVuZWRBdDogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSBfY2xvc2VkQnk/OiBzdHJpbmc7XG5cdHByaXZhdGUgX3N0b3JlZElucHV0OiBBZ2VudFNlc3Npb25zV2VsY29tZUlucHV0IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGdyb3VwOiBJRWRpdG9yR3JvdXAsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElBZ2VudFNlc3Npb25zU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFnZW50U2Vzc2lvbnNTZXJ2aWNlOiBJQWdlbnRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElXYWxrdGhyb3VnaHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd2Fsa3Rocm91Z2hzU2VydmljZTogSVdhbGt0aHJvdWdoc1NlcnZpY2UsXG5cdFx0QElDaGF0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdEVudGl0bGVtZW50U2VydmljZTogSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZXNTZXJ2aWNlOiBJV29ya3NwYWNlc1NlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKEFnZW50U2Vzc2lvbnNXZWxjb21lUGFnZS5JRCwgZ3JvdXAsIHRlbGVtZXRyeVNlcnZpY2UsIHRoZW1lU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5jb250YWluZXIgPSAkKCcuYWdlbnRTZXNzaW9uc1dlbGNvbWUnLCB7XG5cdFx0XHRyb2xlOiAnZG9jdW1lbnQnLFxuXHRcdFx0dGFiaW5kZXg6IDAsXG5cdFx0XHQnYXJpYS1sYWJlbCc6IGxvY2FsaXplKCdhZ2VudFNlc3Npb25zV2VsY29tZUFyaWFMYWJlbCcsIFwiT3ZlcnZpZXcgb2YgYWdlbnQgc2Vzc2lvbnMgYW5kIGhvdyB0byBnZXQgc3RhcnRlZC5cIilcblx0XHR9KTtcblxuXHRcdHRoaXMuY29udGV4dFNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcihjb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQodGhpcy5jb250YWluZXIpKTtcblx0XHRDaGF0Q29udGV4dEtleXMuaW5BZ2VudFNlc3Npb25zV2VsY29tZS5iaW5kVG8odGhpcy5jb250ZXh0U2VydmljZSkuc2V0KHRydWUpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlU2VudGltZW50KCgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0ID0gdGhpcy5pbnB1dCB8fCB0aGlzLl9zdG9yZWRJbnB1dDtcblx0XHRcdGlmICh0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2Uuc2VudGltZW50LmhpZGRlbiAmJiBpbnB1dCkge1xuXHRcdFx0XHR0aGlzLl9jbG9zZWRCeSA9ICdjaGF0SGlkZGVuJztcblx0XHRcdFx0dGhpcy5ncm91cC5jbG9zZUVkaXRvcihpbnB1dCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUVkaXRvcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0cGFyZW50LmFwcGVuZENoaWxkKHRoaXMuY29udGFpbmVyKTtcblxuXHRcdC8vIENyZWF0ZSBzY3JvbGxhYmxlIGNvbnRlbnRcblx0XHR0aGlzLmNvbnRlbnRDb250YWluZXIgPSAkKCcuYWdlbnRTZXNzaW9uc1dlbGNvbWUtY29udGVudCcpO1xuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tU2Nyb2xsYWJsZUVsZW1lbnQodGhpcy5jb250ZW50Q29udGFpbmVyLCB7XG5cdFx0XHRjbGFzc05hbWU6ICdhZ2VudFNlc3Npb25zV2VsY29tZS1zY3JvbGxhYmxlJyxcblx0XHRcdHZlcnRpY2FsOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG9cblx0XHR9KSk7XG5cdFx0dGhpcy5jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5zY3JvbGxhYmxlRWxlbWVudC5nZXREb21Ob2RlKCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2V0SW5wdXQoaW5wdXQ6IEFnZW50U2Vzc2lvbnNXZWxjb21lSW5wdXQsIG9wdGlvbnM6IEFnZW50U2Vzc2lvbnNXZWxjb21lRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9zdG9yZWRJbnB1dCA9IGlucHV0O1xuXHRcdHRoaXMuX29wZW5lZEF0ID0gRGF0ZS5ub3coKTtcblx0XHRhd2FpdCBzdXBlci5zZXRJbnB1dChpbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pO1xuXHRcdHRoaXMuX3dvcmtzcGFjZUtpbmQgPSBpbnB1dC53b3Jrc3BhY2VLaW5kID8/ICdlbXB0eSc7XG5cdFx0YXdhaXQgdGhpcy5idWlsZENvbnRlbnQoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNsZWFySW5wdXQoKTogdm9pZCB7XG5cdFx0Ly8gU2VuZCBjbG9zZWQgdGVsZW1ldHJ5IHdoZW4gdGhlIGVkaXRvciBpcyBjbG9zZWRcblx0XHRpZiAodGhpcy5fb3BlbmVkQXQgPiAwKSB7XG5cdFx0XHRjb25zdCB2aXNpYmxlRHVyYXRpb25NcyA9IERhdGUubm93KCkgLSB0aGlzLl9vcGVuZWRBdDtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEFnZW50U2Vzc2lvbnNXZWxjb21lQ2xvc2VkRXZlbnQsIEFnZW50U2Vzc2lvbnNXZWxjb21lQ2xvc2VkQ2xhc3NpZmljYXRpb24+KFxuXHRcdFx0XHQnYWdlbnRTZXNzaW9uc1dlbGNvbWUuY2xvc2VkJyxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHZpc2libGVEdXJhdGlvbk1zLFxuXHRcdFx0XHRcdGNsb3NlZEJ5OiB0aGlzLl9jbG9zZWRCeSA/PyAnZGlzcG9zZWQnXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0XHR0aGlzLl9vcGVuZWRBdCA9IDA7XG5cdFx0XHR0aGlzLl9jbG9zZWRCeSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0c3VwZXIuY2xlYXJJbnB1dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBidWlsZENvbnRlbnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLnNlc3Npb25zQ29udHJvbERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2wgPSB1bmRlZmluZWQ7XG5cdFx0Y2xlYXJOb2RlKHRoaXMuY29udGVudENvbnRhaW5lcik7XG5cblx0XHQvLyBEZXRlY3QgZW1wdHkgd29ya3NwYWNlIGFuZCBmZXRjaCByZWNlbnQgd29ya3NwYWNlc1xuXHRcdHRoaXMuX2lzRW1wdHlXb3Jrc3BhY2UgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZO1xuXHRcdGlmICh0aGlzLl9pc0VtcHR5V29ya3NwYWNlKSB7XG5cdFx0XHRjb25zdCByZWNlbnRseU9wZW5lZCA9IGF3YWl0IHRoaXMuZ2V0UmVjZW50bHlPcGVuZWRXb3Jrc3BhY2VzKHRydWUpO1xuXHRcdFx0dGhpcy5fcmVjZW50VHJ1c3RlZFdvcmtzcGFjZXMgPSByZWNlbnRseU9wZW5lZC5zbGljZSgwLCBNQVhfUkVQT19QSUNLUyk7XG5cdFx0fVxuXG5cdFx0Ly8gR2V0IHdhbGt0aHJvdWdoc1xuXHRcdHRoaXMud2Fsa3Rocm91Z2hzID0gdGhpcy53YWxrdGhyb3VnaHNTZXJ2aWNlLmdldFdhbGt0aHJvdWdocygpO1xuXG5cdFx0Ly8gSGVhZGVyXG5cdFx0Y29uc3QgaGVhZGVyID0gYXBwZW5kKHRoaXMuY29udGVudENvbnRhaW5lciwgJCgnLmFnZW50U2Vzc2lvbnNXZWxjb21lLWhlYWRlcicpKTtcblx0XHRhcHBlbmQoaGVhZGVyLCAkKCdoMS5wcm9kdWN0LW5hbWUnLCB7fSwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZykpO1xuXG5cdFx0Y29uc3Qgc3RhcnRFbnRyaWVzID0gYXBwZW5kKGhlYWRlciwgJCgnLmFnZW50U2Vzc2lvbnNXZWxjb21lLXN0YXJ0RW50cmllcycpKTtcblx0XHRhd2FpdCB0aGlzLmJ1aWxkU3RhcnRFbnRyaWVzKHN0YXJ0RW50cmllcyk7XG5cblx0XHQvLyBDaGF0IGlucHV0IHNlY3Rpb25cblx0XHRjb25zdCBjaGF0U2VjdGlvbiA9IGFwcGVuZCh0aGlzLmNvbnRlbnRDb250YWluZXIsICQoJy5hZ2VudFNlc3Npb25zV2VsY29tZS1jaGF0U2VjdGlvbicpKTtcblx0XHR0aGlzLmJ1aWxkQ2hhdFdpZGdldChjaGF0U2VjdGlvbik7XG5cblx0XHQvLyBTZXNzaW9ucyBvciB3YWxrdGhyb3VnaHNcblx0XHRjb25zdCBzZXNzaW9uc1NlY3Rpb24gPSBhcHBlbmQodGhpcy5jb250ZW50Q29udGFpbmVyLCAkKCcuYWdlbnRTZXNzaW9uc1dlbGNvbWUtc2Vzc2lvbnNTZWN0aW9uJykpO1xuXHRcdHRoaXMuYnVpbGRTZXNzaW9uc09yUHJvbXB0cyhzZXNzaW9uc1NlY3Rpb24pO1xuXG5cdFx0Ly8gRm9vdGVyXG5cdFx0Y29uc3QgZm9vdGVyID0gYXBwZW5kKHRoaXMuY29udGVudENvbnRhaW5lciwgJCgnLmFnZW50U2Vzc2lvbnNXZWxjb21lLWZvb3RlcicpKTtcblx0XHR0aGlzLmJ1aWxkRm9vdGVyKGZvb3Rlcik7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIHNlc3Npb24gY2hhbmdlcyAtIHN0b3JlIHJlZmVyZW5jZSB0byBhdm9pZCBxdWVyeVNlbGVjdG9yXG5cdFx0bGV0IG9yaWdpbmFsU2Vzc2lvbnMgPSB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnNlc3Npb25zLmxlbmd0aCA+IDA7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwub25EaWRDaGFuZ2VTZXNzaW9ucygoKSA9PiB7XG5cdFx0XHRjb25zdCBoYXNTZXNzaW9ucyA9IHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwuc2Vzc2lvbnMubGVuZ3RoID4gMDtcblx0XHRcdC8vIE9ubHkgcmVidWlsZCBpZiB0aGUgYW1vdW50IG9mIHNlc3Npb25zIGNoYW5nZWQsIG90aGVyIHVwZGF0ZXMgc2hvdWxkIGJlIG1hbmFnZWQgYnkgdGhlIGNvbnRyb2xcblx0XHRcdGlmIChoYXNTZXNzaW9ucyAhPT0gb3JpZ2luYWxTZXNzaW9ucykge1xuXHRcdFx0XHRvcmlnaW5hbFNlc3Npb25zID0gaGFzU2Vzc2lvbnM7XG5cdFx0XHRcdGNsZWFyTm9kZShzZXNzaW9uc1NlY3Rpb24pO1xuXHRcdFx0XHR0aGlzLmJ1aWxkU2Vzc2lvbnNPclByb21wdHMoc2Vzc2lvbnNTZWN0aW9uKTtcblx0XHRcdH1cblx0XHRcdHRoaXMubGF5b3V0U2Vzc2lvbnNDb250cm9sKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5zY3JvbGxhYmxlRWxlbWVudD8uc2NhbkRvbU5vZGUoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYnVpbGRTdGFydEVudHJpZXMoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZXMgPSBhd2FpdCB0aGlzLmdldFJlY2VudGx5T3BlbmVkV29ya3NwYWNlcyhmYWxzZSk7XG5cdFx0Y29uc3Qgb3BlbkVudHJ5ID0gd29ya3NwYWNlcy5sZW5ndGggPiAwXG5cdFx0XHQ/IHsgaWNvbjogQ29kaWNvbi5mb2xkZXJPcGVuZWQsIGxhYmVsOiBsb2NhbGl6ZSgnb3BlblJlY2VudCcsIFwiT3BlbiBSZWNlbnQuLi5cIiksIGNvbW1hbmQ6ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5SZWNlbnQnIH1cblx0XHRcdDogeyBpY29uOiBDb2RpY29uLmZvbGRlck9wZW5lZCwgbGFiZWw6IGxvY2FsaXplKCdvcGVuRm9sZGVyJywgXCJPcGVuIEZvbGRlci4uLlwiKSwgY29tbWFuZDogJ3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMub3BlbkZvbGRlcicgfTtcblx0XHRjb25zdCBlbnRyaWVzID0gW1xuXHRcdFx0b3BlbkVudHJ5LFxuXHRcdFx0eyBpY29uOiBDb2RpY29uLm5ld0ZpbGUsIGxhYmVsOiBsb2NhbGl6ZSgnbmV3RmlsZScsIFwiTmV3IGZpbGUuLi5cIiksIGNvbW1hbmQ6ICd3ZWxjb21lLnNob3dOZXdGaWxlRW50cmllcycgfSxcblx0XHRcdHsgaWNvbjogQ29kaWNvbi5yZXBvQ2xvbmUsIGxhYmVsOiBsb2NhbGl6ZSgnY2xvbmVSZXBvJywgXCJDbG9uZSBHaXQgUmVwb3NpdG9yeS4uLlwiKSwgY29tbWFuZDogJ2dpdC5jbG9uZScgfSxcblx0XHRdO1xuXG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiBlbnRyaWVzKSB7XG5cdFx0XHRjb25zdCBidXR0b24gPSBhcHBlbmQoY29udGFpbmVyLCAkKCdidXR0b24uYWdlbnRTZXNzaW9uc1dlbGNvbWUtc3RhcnRFbnRyeScpKTtcblx0XHRcdGJ1dHRvbi5hcHBlbmRDaGlsZChyZW5kZXJJY29uKGVudHJ5Lmljb24pKTtcblx0XHRcdGJ1dHRvbi5hcHBlbmRDaGlsZChkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZShlbnRyeS5sYWJlbCkpO1xuXHRcdFx0YnV0dG9uLm9uY2xpY2sgPSAoKSA9PiB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEFnZW50U2Vzc2lvbnNXZWxjb21lQWN0aW9uRXZlbnQsIEFnZW50U2Vzc2lvbnNXZWxjb21lQWN0aW9uQ2xhc3NpZmljYXRpb24+KFxuXHRcdFx0XHRcdCdhZ2VudFNlc3Npb25zV2VsY29tZS5BY3Rpb25FeGVjdXRlZCcsXG5cdFx0XHRcdFx0eyB3ZWxjb21lS2luZDogJ2FnZW50U2Vzc2lvbnNXZWxjb21lUGFnZScsIGFjdGlvbjogJ2V4ZWN1dGVDb21tYW5kJywgYWN0aW9uSWQ6IGVudHJ5LmNvbW1hbmQgfVxuXHRcdFx0XHQpO1xuXHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGVudHJ5LmNvbW1hbmQpO1xuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGJ1aWxkQ2hhdFdpZGdldChjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhdFdpZGdldENvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5hZ2VudFNlc3Npb25zV2VsY29tZS1jaGF0V2lkZ2V0JykpO1xuXG5cdFx0Ly8gQ3JlYXRlIGVkaXRvciBvdmVyZmxvdyB3aWRnZXRzIGNvbnRhaW5lclxuXHRcdGNvbnN0IGVkaXRvck92ZXJmbG93V2lkZ2V0c0RvbU5vZGUgPSB0aGlzLmxheW91dFNlcnZpY2UuZ2V0Q29udGFpbmVyKGdldFdpbmRvdyhjaGF0V2lkZ2V0Q29udGFpbmVyKSkuYXBwZW5kQ2hpbGQoJCgnLmNoYXQtZWRpdG9yLW92ZXJmbG93Lm1vbmFjby1lZGl0b3InKSk7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBlZGl0b3JPdmVyZmxvd1dpZGdldHNEb21Ob2RlLnJlbW92ZSgpKSk7XG5cblx0XHQvLyBDcmVhdGUgQ2hhdFdpZGdldCB3aXRoIHNjb3BlZCBzZXJ2aWNlc1xuXHRcdGNvbnN0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dFNlcnZpY2UuY3JlYXRlU2NvcGVkKGNoYXRXaWRnZXRDb250YWluZXIpKTtcblx0XHRjb25zdCBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBzY29wZWRDb250ZXh0S2V5U2VydmljZV0pKSk7XG5cblx0XHQvLyBDcmVhdGUgYSBkZWxlZ2F0ZSBmb3IgdGhlIHNlc3Npb24gdGFyZ2V0IHBpY2tlciB3aXRoIGluZGVwZW5kZW50IGxvY2FsIHN0YXRlXG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VBY3RpdmVTZXNzaW9uUHJvdmlkZXIgPSB0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8QWdlbnRTZXNzaW9uVGFyZ2V0PigpKTtcblx0XHRjb25zdCByZWNyZWF0ZVNlc3Npb25Gb3JQcm92aWRlciA9IGFzeW5jIChwcm92aWRlcjogQWdlbnRTZXNzaW9uVGFyZ2V0KSA9PiB7XG5cdFx0XHRpZiAodGhpcy5jaGF0V2lkZ2V0ICYmIHRoaXMuY2hhdE1vZGVsUmVmKSB7XG5cdFx0XHRcdHRoaXMuY2hhdFdpZGdldC5zZXRNb2RlbCh1bmRlZmluZWQpO1xuXHRcdFx0XHR0aGlzLmNoYXRNb2RlbFJlZi5kaXNwb3NlKCk7XG5cdFx0XHRcdGNvbnN0IG5ld1Jlc291cmNlID0gZ2V0UmVzb3VyY2VGb3JOZXdDaGF0U2Vzc2lvbih7XG5cdFx0XHRcdFx0dHlwZTogcHJvdmlkZXIsXG5cdFx0XHRcdFx0cG9zaXRpb246IENoYXRTZXNzaW9uUG9zaXRpb24uU2lkZWJhcixcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogJydcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuY2hhdFNlcnZpY2UuYWNxdWlyZU9yTG9hZFNlc3Npb24obmV3UmVzb3VyY2UsIENoYXRBZ2VudExvY2F0aW9uLkNoYXQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHR0aGlzLmNoYXRNb2RlbFJlZiA9IHJlZiA/PyB0aGlzLmNoYXRTZXJ2aWNlLnN0YXJ0TmV3TG9jYWxTZXNzaW9uKENoYXRBZ2VudExvY2F0aW9uLkNoYXQpO1xuXHRcdFx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQodGhpcy5jaGF0TW9kZWxSZWYpO1xuXHRcdFx0XHRpZiAodGhpcy5jaGF0TW9kZWxSZWYub2JqZWN0KSB7XG5cdFx0XHRcdFx0dGhpcy5jaGF0V2lkZ2V0LnNldE1vZGVsKHRoaXMuY2hhdE1vZGVsUmVmLm9iamVjdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlUGlja2VyRGVsZWdhdGU6IElTZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlID0ge1xuXHRcdFx0Z2V0QWN0aXZlU2Vzc2lvblByb3ZpZGVyOiAoKSA9PiB0aGlzLl9zZWxlY3RlZFNlc3Npb25Qcm92aWRlcixcblx0XHRcdHNldEFjdGl2ZVNlc3Npb25Qcm92aWRlcjogKHByb3ZpZGVyOiBBZ2VudFNlc3Npb25UYXJnZXQpID0+IHtcblx0XHRcdFx0dGhpcy5fc2VsZWN0ZWRTZXNzaW9uUHJvdmlkZXIgPSBwcm92aWRlcjtcblx0XHRcdFx0b25EaWRDaGFuZ2VBY3RpdmVTZXNzaW9uUHJvdmlkZXIuZmlyZShwcm92aWRlcik7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0cmVjcmVhdGVTZXNzaW9uRm9yUHJvdmlkZXIocHJvdmlkZXIpO1xuXHRcdFx0XHR9IGNhdGNoIHsgLyogSWdub3JlIGVycm9ycyAqLyB9XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VBY3RpdmVTZXNzaW9uUHJvdmlkZXI6IG9uRGlkQ2hhbmdlQWN0aXZlU2Vzc2lvblByb3ZpZGVyLmV2ZW50XG5cdFx0fTtcblxuXHRcdC8vIENyZWF0ZSB3b3Jrc3BhY2UgcGlja2VyIGRlbGVnYXRlIGZvciBlbXB0eSB3b3Jrc3BhY2Ugc2NlbmFyaW9zXG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VTZWxlY3RlZFdvcmtzcGFjZSA9IHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJV29ya3NwYWNlUGlja2VySXRlbSB8IHVuZGVmaW5lZD4oKSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VXb3Jrc3BhY2VzID0gdGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVBpY2tlckRlbGVnYXRlOiBJV29ya3NwYWNlUGlja2VyRGVsZWdhdGUgfCB1bmRlZmluZWQgPSB0aGlzLl9pc0VtcHR5V29ya3NwYWNlID8ge1xuXHRcdFx0Z2V0V29ya3NwYWNlczogKCkgPT4gdGhpcy5fcmVjZW50VHJ1c3RlZFdvcmtzcGFjZXMubWFwKHcgPT4gKHtcblx0XHRcdFx0dXJpOiB0aGlzLmdldFdvcmtzcGFjZVVyaSh3KSxcblx0XHRcdFx0bGFiZWw6IHRoaXMuZ2V0V29ya3NwYWNlTGFiZWwodyksXG5cdFx0XHRcdGlzRm9sZGVyOiBpc1JlY2VudEZvbGRlcih3KSxcblx0XHRcdH0pKSxcblx0XHRcdGdldFNlbGVjdGVkV29ya3NwYWNlOiAoKSA9PiB0aGlzLl9zZWxlY3RlZFdvcmtzcGFjZSxcblx0XHRcdHNldFNlbGVjdGVkV29ya3NwYWNlOiAod29ya3NwYWNlOiBJV29ya3NwYWNlUGlja2VySXRlbSB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9zZWxlY3RlZFdvcmtzcGFjZSA9IHdvcmtzcGFjZTtcblx0XHRcdFx0b25EaWRDaGFuZ2VTZWxlY3RlZFdvcmtzcGFjZS5maXJlKHdvcmtzcGFjZSk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VTZWxlY3RlZFdvcmtzcGFjZTogb25EaWRDaGFuZ2VTZWxlY3RlZFdvcmtzcGFjZS5ldmVudCxcblx0XHRcdG9uRGlkQ2hhbmdlV29ya3NwYWNlczogb25EaWRDaGFuZ2VXb3Jrc3BhY2VzLmV2ZW50LFxuXHRcdFx0b3BlbkZvbGRlckNvbW1hbmQ6ICd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLm9wZW5Gb2xkZXInLFxuXHRcdH0gOiB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLmNoYXRXaWRnZXQgPSB0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0V2lkZ2V0LFxuXHRcdFx0Q2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdC8vIFRPRE86IEBvc29ydGVnYSBzaG91bGQgd2UgaGF2ZSBhIGNvbXBsZXRlbHkgZGlmZmVyZW50IElEIGFuZCBjaGVjayB0aGF0IGNvbnRleHQgaW5zdGVhZCBpbiBjaGF0SW5wdXRQYXJ0P1xuXHRcdFx0e30sIC8vIEVtcHR5IHJlc291cmNlIHZpZXcgY29udGV4dFxuXHRcdFx0e1xuXHRcdFx0XHRhdXRvU2Nyb2xsOiBtb2RlID0+IG1vZGUgIT09IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdHJlbmRlckZvbGxvd3VwczogZmFsc2UsXG5cdFx0XHRcdHN1cHBvcnRzRmlsZVJlZmVyZW5jZXM6IHRydWUsXG5cdFx0XHRcdHJlbmRlcklucHV0T25Ub3A6IHRydWUsXG5cdFx0XHRcdHJlbmRlcmVyT3B0aW9uczoge1xuXHRcdFx0XHRcdHJlbmRlclRleHRFZGl0c0FzU3VtbWFyeTogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0XHRyZWZlcmVuY2VzRXhwYW5kZWRXaGVuRW1wdHlSZXNwb25zZTogZmFsc2UsXG5cdFx0XHRcdFx0cHJvZ3Jlc3NNZXNzYWdlQXRCb3R0b21PZlJlc3BvbnNlOiBtb2RlID0+IG1vZGUgIT09IENoYXRNb2RlS2luZC5Bc2ssXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVkaXRvck92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsXG5cdFx0XHRcdGVuYWJsZUltcGxpY2l0Q29udGV4dDogdHJ1ZSxcblx0XHRcdFx0ZW5hYmxlV29ya2luZ1NldDogJ2V4cGxpY2l0Jyxcblx0XHRcdFx0c3VwcG9ydHNDaGFuZ2luZ01vZGVzOiB0cnVlLFxuXHRcdFx0XHRzZXNzaW9uVHlwZVBpY2tlckRlbGVnYXRlLFxuXHRcdFx0XHR3b3Jrc3BhY2VQaWNrZXJEZWxlZ2F0ZSxcblx0XHRcdFx0c3VibWl0SGFuZGxlcjogdGhpcy5faXNFbXB0eVdvcmtzcGFjZSA/IChxdWVyeSwgbW9kZSkgPT4gdGhpcy5oYW5kbGVXb3Jrc3BhY2VTdWJtaXNzaW9uKHF1ZXJ5LCBtb2RlKSA6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGxpc3RGb3JlZ3JvdW5kOiBTSURFX0JBUl9GT1JFR1JPVU5ELFxuXHRcdFx0XHRsaXN0QmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdFx0b3ZlcmxheUJhY2tncm91bmQ6IGVkaXRvckJhY2tncm91bmQsXG5cdFx0XHRcdGlucHV0RWRpdG9yQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdFx0cmVzdWx0RWRpdG9yQmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdH1cblx0XHQpKTtcblxuXHRcdHRoaXMuY2hhdFdpZGdldC5yZW5kZXIoY2hhdFdpZGdldENvbnRhaW5lcik7XG5cdFx0dGhpcy5jaGF0V2lkZ2V0LnNldFZpc2libGUodHJ1ZSk7XG5cblx0XHQvLyBTY2hlZHVsZSBpbml0aWFsIGxheW91dCBhdCBuZXh0IGFuaW1hdGlvbiBmcmFtZSB0byBlbnN1cmUgcHJvcGVyIGlucHV0IHNpemluZ1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChzY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGdldFdpbmRvdyhjaGF0V2lkZ2V0Q29udGFpbmVyKSwgKCkgPT4ge1xuXHRcdFx0dGhpcy5sYXlvdXRDaGF0V2lkZ2V0KCk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU3RhcnQgYSBjaGF0IHNlc3Npb24gc28gdGhlIHdpZGdldCBoYXMgYSB2aWV3TW9kZWxcblx0XHQvLyBUaGlzIGlzIG5lY2Vzc2FyeSBmb3IgYWN0aW9ucyBsaWtlIG1vZGUgc3dpdGNoaW5nIHRvIHdvcmsgcHJvcGVybHlcblx0XHR0aGlzLmNoYXRNb2RlbFJlZiA9IHRoaXMuY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCk7XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuY2hhdE1vZGVsUmVmKTtcblx0XHRpZiAodGhpcy5jaGF0TW9kZWxSZWYub2JqZWN0KSB7XG5cdFx0XHR0aGlzLmNoYXRXaWRnZXQuc2V0TW9kZWwodGhpcy5jaGF0TW9kZWxSZWYub2JqZWN0KTtcblx0XHR9XG5cblx0XHQvLyBGb2N1cyB0aGUgaW5wdXQgd2hlbiBjbGlja2luZyBhbnl3aGVyZSBpbiB0aGUgY2hhdCB3aWRnZXQgYXJlYVxuXHRcdC8vIFRoaXMgZW5zdXJlcyBvdXIgd2lkZ2V0IGJlY29tZXMgbGFzdEZvY3VzZWRXaWRnZXQgZm9yIHRoZSBjaGF0V2lkZ2V0U2VydmljZVxuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoY2hhdFdpZGdldENvbnRhaW5lciwgJ21vdXNlZG93bicsICgpID0+IHtcblx0XHRcdHRoaXMuY2hhdFdpZGdldD8uZm9jdXNJbnB1dCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEF1dG9tYXRpY2FsbHkgb3BlbiB0aGUgY2hhdCB2aWV3IHdoZW4gYSByZXF1ZXN0IGlzIHN1Ym1pdHRlZCBmcm9tIHRoaXMgd2VsY29tZSB2aWV3XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuY2hhdFNlcnZpY2Uub25EaWRTdWJtaXRSZXF1ZXN0KCh7IGNoYXRTZXNzaW9uUmVzb3VyY2UgfSkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuY2hhdE1vZGVsUmVmPy5vYmplY3Q/LnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpID09PSBjaGF0U2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0Ly8gU2VuZCBjaGF0IHN1Ym1pdHRlZCB0ZWxlbWV0cnlcblx0XHRcdFx0Y29uc3QgbW9kZSA9IHRoaXMuY2hhdFdpZGdldD8uaW5wdXQuY3VycmVudE1vZGVPYnMuZ2V0KCkubmFtZS5nZXQoKSB8fCAndW5rbm93bic7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEFnZW50U2Vzc2lvbnNXZWxjb21lQ2hhdFN1Ym1pdHRlZEV2ZW50LCBBZ2VudFNlc3Npb25zV2VsY29tZUNoYXRTdWJtaXR0ZWRDbGFzc2lmaWNhdGlvbj4oXG5cdFx0XHRcdFx0J2FnZW50U2Vzc2lvbnNXZWxjb21lLmNoYXRTdWJtaXR0ZWQnLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG1vZGUsXG5cdFx0XHRcdFx0XHRwcm92aWRlcjogdGhpcy5fc2VsZWN0ZWRTZXNzaW9uUHJvdmlkZXIsXG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2VLaW5kOiB0aGlzLl93b3Jrc3BhY2VLaW5kLFxuXHRcdFx0XHRcdFx0c2VsZWN0ZWRSZWNlbnRXb3Jrc3BhY2U6IHRoaXMuX3NlbGVjdGVkV29ya3NwYWNlICE9PSB1bmRlZmluZWRcblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cblx0XHRcdFx0dGhpcy5fY2xvc2VkQnkgPSAnY2hhdFN1Ym1pc3Npb24nO1xuXHRcdFx0XHR0aGlzLm9wZW5TZXNzaW9uSW5DaGF0KGNoYXRTZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIENoZWNrIGZvciBwcmVmaWxsIGRhdGEgZnJvbSBhIHdvcmtzcGFjZSB0cmFuc2ZlclxuXHRcdHRoaXMuYXBwbHlQcmVmaWxsRGF0YSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRXb3Jrc3BhY2VMYWJlbCh3b3Jrc3BhY2U6IElSZWNlbnRXb3Jrc3BhY2UgfCBJUmVjZW50Rm9sZGVyKTogc3RyaW5nIHtcblx0XHRpZiAoaXNSZWNlbnRGb2xkZXIod29ya3NwYWNlKSkge1xuXHRcdFx0cmV0dXJuIHdvcmtzcGFjZS5sYWJlbCB8fCBiYXNlbmFtZSh3b3Jrc3BhY2UuZm9sZGVyVXJpKTtcblx0XHR9IGVsc2UgaWYgKGlzUmVjZW50V29ya3NwYWNlKHdvcmtzcGFjZSkpIHtcblx0XHRcdHJldHVybiB3b3Jrc3BhY2UubGFiZWwgfHwgYmFzZW5hbWUod29ya3NwYWNlLndvcmtzcGFjZS5jb25maWdQYXRoKTtcblx0XHR9XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRXb3Jrc3BhY2VVcmkod29ya3NwYWNlOiBJUmVjZW50V29ya3NwYWNlIHwgSVJlY2VudEZvbGRlcik6IFVSSSB7XG5cdFx0aWYgKGlzUmVjZW50Rm9sZGVyKHdvcmtzcGFjZSkpIHtcblx0XHRcdHJldHVybiB3b3Jrc3BhY2UuZm9sZGVyVXJpO1xuXHRcdH0gZWxzZSBpZiAoaXNSZWNlbnRXb3Jrc3BhY2Uod29ya3NwYWNlKSkge1xuXHRcdFx0cmV0dXJuIHdvcmtzcGFjZS53b3Jrc3BhY2UuY29uZmlnUGF0aDtcblx0XHR9XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHdvcmtzcGFjZSB0eXBlJyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGhhbmRsZVdvcmtzcGFjZVN1Ym1pc3Npb24ocXVlcnk6IHN0cmluZywgbW9kZTogQ2hhdE1vZGVLaW5kKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Ly8gT25seSBoYW5kbGUgaWYgYSB3b3Jrc3BhY2UgaXMgc2VsZWN0ZWRcblx0XHRpZiAoIXRoaXMuX3NlbGVjdGVkV29ya3NwYWNlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKCFxdWVyeS50cmltKCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBTdG9yZSB0aGUgcHJlZmlsbCBkYXRhIGZvciB0aGUgdGFyZ2V0IHdvcmtzcGFjZSB0byByZWFkIG9uIHN0YXJ0dXBcblx0XHRjb25zdCBwcmVmaWxsRGF0YSA9IHtcblx0XHRcdHF1ZXJ5LFxuXHRcdFx0bW9kZSxcblx0XHRcdHRpbWVzdGFtcDogRGF0ZS5ub3coKSxcblx0XHR9O1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoXG5cdFx0XHQnY2hhdC53ZWxjb21lVmlld1ByZWZpbGwnLFxuXHRcdFx0SlNPTi5zdHJpbmdpZnkocHJlZmlsbERhdGEpLFxuXHRcdFx0U3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0U3RvcmFnZVRhcmdldC5NQUNISU5FXG5cdFx0KTtcblxuXHRcdC8vIEZpbmQgdGhlIHdvcmtzcGFjZSB0byBkZXRlcm1pbmUgaWYgaXQncyBhIGZvbGRlciBvciB3b3Jrc3BhY2UgZmlsZVxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuX3JlY2VudFRydXN0ZWRXb3Jrc3BhY2VzLmZpbmQodyA9PlxuXHRcdFx0dGhpcy5nZXRXb3Jrc3BhY2VVcmkodykudG9TdHJpbmcoKSA9PT0gdGhpcy5fc2VsZWN0ZWRXb3Jrc3BhY2U/LnVyaS50b1N0cmluZygpKTtcblxuXHRcdGlmICh3b3Jrc3BhY2UpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmIChpc1JlY2VudEZvbGRlcih3b3Jrc3BhY2UpKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5ob3N0U2VydmljZS5vcGVuV2luZG93KFt7IGZvbGRlclVyaTogd29ya3NwYWNlLmZvbGRlclVyaSB9XSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXNSZWNlbnRXb3Jrc3BhY2Uod29ya3NwYWNlKSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuaG9zdFNlcnZpY2Uub3BlbldpbmRvdyhbeyB3b3Jrc3BhY2VVcmk6IHdvcmtzcGFjZS53b3Jrc3BhY2UuY29uZmlnUGF0aCB9XSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdC8vIElnbm9yZSBlcnJvcnNcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoJ2NoYXQud2VsY29tZVZpZXdQcmVmaWxsJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogUmVhZHMgYW5kIGFwcGxpZXMgcHJlZmlsbCBkYXRhIGZyb20gc3RvcmFnZSAodXNlZCB3aGVuIHRyYW5zZmVycmluZyBjaGF0IGlucHV0IGZyb20gYW5vdGhlciB3b3Jrc3BhY2UpLlxuXHQgKiBUaGlzIGlzIGNhbGxlZCBhZnRlciB0aGUgY2hhdCB3aWRnZXQgaXMgY3JlYXRlZCB0byBwb3B1bGF0ZSBpdCB3aXRoIGFueSBwZW5kaW5nIHByZWZpbGwgZGF0YS5cblx0ICovXG5cdHByaXZhdGUgYXBwbHlQcmVmaWxsRGF0YSgpOiB2b2lkIHtcblx0XHRjb25zdCBwcmVmaWxsRGF0YSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KCdjaGF0LndlbGNvbWVWaWV3UHJlZmlsbCcsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKHByZWZpbGxEYXRhKSB7XG5cdFx0XHQvLyBSZW1vdmUgaW1tZWRpYXRlbHkgdG8gcHJldmVudCByZS1hcHBsaWNhdGlvblxuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoJ2NoYXQud2VsY29tZVZpZXdQcmVmaWxsJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHsgcXVlcnksIG1vZGUsIHRpbWVzdGFtcCB9ID0gSlNPTi5wYXJzZShwcmVmaWxsRGF0YSk7XG5cdFx0XHRcdC8vIEludmFsaWRhdGUgZW50cmllcyBvbGRlciB0aGFuIDEgbWludXRlXG5cdFx0XHRcdGlmICh0aW1lc3RhbXAgJiYgRGF0ZS5ub3coKSAtIHRpbWVzdGFtcCA+IDYwICogMTAwMCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocXVlcnkgJiYgdGhpcy5jaGF0V2lkZ2V0KSB7XG5cdFx0XHRcdFx0dGhpcy5jaGF0V2lkZ2V0LnNldElucHV0KHF1ZXJ5KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobW9kZSAhPT0gdW5kZWZpbmVkICYmIHRoaXMuY2hhdFdpZGdldCkge1xuXHRcdFx0XHRcdHRoaXMuY2hhdFdpZGdldC5pbnB1dC5zZXRDaGF0TW9kZShtb2RlLCBmYWxzZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRm9jdXMgdGhlIGlucHV0IHRvIG1ha2UgaXQgY2xlYXIgd2UndmUgcHJlZmlsbGVkXG5cdFx0XHRcdHRoaXMuY2hhdFdpZGdldD8uZm9jdXNJbnB1dCgpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIElnbm9yZSBtYWxmb3JtZWQgcHJlZmlsbCBkYXRhXG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBidWlsZFNlc3Npb25zT3JQcm9tcHRzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHQvLyBDbGVhciBwcmV2aW91cyBzZXNzaW9ucyBjb250cm9sXG5cdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2xEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSB0aGlzLmFnZW50U2Vzc2lvbnNTZXJ2aWNlLm1vZGVsLnNlc3Npb25zLmZpbHRlcihzID0+ICFzLmlzQXJjaGl2ZWQoKSk7XG5cblx0XHRpZiAoc2Vzc2lvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5idWlsZFNlc3Npb25zR3JpZChjb250YWluZXIsIHNlc3Npb25zKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5idWlsZFdhbGt0aHJvdWdocyhjb250YWluZXIpO1xuXHRcdH1cblx0fVxuXG5cblx0cHJpdmF0ZSBidWlsZFNlc3Npb25zR3JpZChjb250YWluZXI6IEhUTUxFbGVtZW50LCBfc2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSk6IHZvaWQge1xuXHRcdC8vIFNob3cgY2FjaGVkIHNlc3Npb25zIGltbWVkaWF0ZWx5IGlmIGF2YWlsYWJsZSwgb3RoZXJ3aXNlIHNob3cgbG9hZGluZyBza2VsZXRvblxuXHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sQ29udGFpbmVyID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmFnZW50U2Vzc2lvbnNXZWxjb21lLXNlc3Npb25zR3JpZCcpKTtcblx0XHRjb25zdCBvcHRpb25zOiBJQWdlbnRTZXNzaW9uc0NvbnRyb2xPcHRpb25zID0ge1xuXHRcdFx0b3ZlcnJpZGVTdHlsZXM6IGdldExpc3RTdHlsZXMoe1xuXHRcdFx0XHRsaXN0QmFja2dyb3VuZDogZWRpdG9yQmFja2dyb3VuZCxcblx0XHRcdH0pLFxuXHRcdFx0ZmlsdGVyOiB0aGlzLnNlc3Npb25zQ29udHJvbERpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFnZW50U2Vzc2lvbnNGaWx0ZXIsIHtcblx0XHRcdFx0bGltaXRSZXN1bHRzOiAoKSA9PiBNQVhfU0VTU0lPTlMsXG5cdFx0XHRcdG92ZXJyaWRlRXhjbHVkZTogKHNlc3Npb24pID0+IHNlc3Npb24uaXNBcmNoaXZlZCgpID8gdHJ1ZSA6IHVuZGVmaW5lZCxcblx0XHRcdH0pKSxcblx0XHRcdGdldEhvdmVyUG9zaXRpb246ICgpID0+IEhvdmVyUG9zaXRpb24uQkVMT1csXG5cdFx0XHR0cmFja0FjdGl2ZUVkaXRvclNlc3Npb246ICgpID0+IGZhbHNlLFxuXHRcdFx0c291cmNlOiAnd2VsY29tZVZpZXcnLFxuXHRcdFx0aXRlbUhlaWdodDogQWdlbnRTZXNzaW9uc0xpc3REZWxlZ2F0ZS5JVEVNX0hFSUdIVCxcblx0XHRcdHNlY3Rpb25IZWlnaHQ6IEFnZW50U2Vzc2lvbnNMaXN0RGVsZWdhdGUuU0VDVElPTl9IRUlHSFQsXG5cdFx0XHRub3RpZnlTZXNzaW9uT3BlbmVkOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGlzUHJvamVjdGlvbkVuYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkFnZW50U2Vzc2lvblByb2plY3Rpb25FbmFibGVkKTtcblx0XHRcdFx0aWYgKCFpc1Byb2plY3Rpb25FbmFibGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fY2xvc2VkQnkgPSAnc2Vzc2lvbkNsaWNrZWQnO1xuXHRcdFx0XHRcdHRoaXMucmV2ZWFsTWF4aW1pemVkQ2hhdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sID0gdGhpcy5zZXNzaW9uc0NvbnRyb2xEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdEFnZW50U2Vzc2lvbnNDb250cm9sLFxuXHRcdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2xDb250YWluZXIsXG5cdFx0XHRvcHRpb25zXG5cdFx0KSk7XG5cblx0XHQvLyBMaXN0ZW4gZm9yIGxvYWRpbmcgc3RhdGUgY2hhbmdlcyB0byB0b2dnbGUgc2tlbGV0b24gdmlzaWJpbGl0eVxuXHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sRGlzcG9zYWJsZXMuYWRkKHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwub25EaWRSZXNvbHZlKCgpID0+IHtcblx0XHRcdHRoaXMubGF5b3V0U2Vzc2lvbnNDb250cm9sKCk7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHRoaXMuYWdlbnRTZXNzaW9uc1NlcnZpY2UubW9kZWwucmVzb2x2ZWQpIHtcblx0XHRcdHRoaXMubGF5b3V0U2Vzc2lvbnNDb250cm9sKCk7XG5cdFx0fVxuXG5cdFx0Ly8gU2NoZWR1bGUgbGF5b3V0IGF0IG5leHQgYW5pbWF0aW9uIGZyYW1lIHRvIGVuc3VyZSBwcm9wZXIgcmVuZGVyaW5nXG5cdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2xEaXNwb3NhYmxlcy5hZGQoc2NoZWR1bGVBdE5leHRBbmltYXRpb25GcmFtZShnZXRXaW5kb3codGhpcy5zZXNzaW9uc0NvbnRyb2xDb250YWluZXIpLCAoKSA9PiB7XG5cdFx0XHR0aGlzLmxheW91dFNlc3Npb25zQ29udHJvbCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFwiVHJ5IG91dCB0aGUgbmV3IEFnZW50cyBhcHBcIiBiYW5uZXJcblx0XHRpZiAoY2FuU2hvd0FnZW50c0Jhbm5lcih0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UpKSB7XG5cdFx0XHRjb25zdCBhZ2VudHNCYW5uZXIgPSBjcmVhdGVBZ2VudHNCYW5uZXIoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjc3NDbGFzczogJ2FnZW50U2Vzc2lvbnNXZWxjb21lLWFnZW50c0Jhbm5lcicsXG5cdFx0XHRcdFx0c291cmNlOiAnYWdlbnRTZXNzaW9uc1dlbGNvbWUnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndmlld0FsbFNlc3Npb25zJywgXCJWaWV3IEFsbCBTZXNzaW9uc1wiKSxcblx0XHRcdFx0XHRvbkJ1dHRvbkNsaWNrOiAoKSA9PiB7IHRoaXMuX2Nsb3NlZEJ5ID0gJ3ZpZXdBbGxTZXNzaW9ucyc7IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UsXG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdCk7XG5cdFx0XHR0aGlzLnNlc3Npb25zQ29udHJvbERpc3Bvc2FibGVzLmFkZChhZ2VudHNCYW5uZXIuZGlzcG9zYWJsZXMpO1xuXHRcdFx0YXBwZW5kKGNvbnRhaW5lciwgYWdlbnRzQmFubmVyLmVsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYnVpbGRXYWxrdGhyb3VnaHMoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZVdhbGt0aHJvdWdocyA9IHRoaXMud2Fsa3Rocm91Z2hzLmZpbHRlcih3ID0+XG5cdFx0XHQhdy53aGVuIHx8IHRoaXMuY29udGV4dFNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyh3LndoZW4pXG5cdFx0KS5zbGljZSgwLCBNQVhfV0FMS1RIUk9VR0hTKTtcblxuXHRcdGlmIChhY3RpdmVXYWxrdGhyb3VnaHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGN1cnJlbnRJbmRleCA9IDA7XG5cblx0XHRjb25zdCBjYXJkID0gYXBwZW5kKGNvbnRhaW5lciwgJCgnLmFnZW50U2Vzc2lvbnNXZWxjb21lLXdhbGt0aHJvdWdoQ2FyZCcpKTtcblxuXHRcdC8vIEljb25cblx0XHRjb25zdCBpY29uQ29udGFpbmVyID0gYXBwZW5kKGNhcmQsICQoJy5hZ2VudFNlc3Npb25zV2VsY29tZS13YWxrdGhyb3VnaENhcmQtaWNvbicpKTtcblxuXHRcdC8vIENvbnRlbnRcblx0XHRjb25zdCBjb250ZW50ID0gYXBwZW5kKGNhcmQsICQoJy5hZ2VudFNlc3Npb25zV2VsY29tZS13YWxrdGhyb3VnaENhcmQtY29udGVudCcpKTtcblx0XHRjb25zdCB0aXRsZSA9IGFwcGVuZChjb250ZW50LCAkKCcuYWdlbnRTZXNzaW9uc1dlbGNvbWUtd2Fsa3Rocm91Z2hDYXJkLXRpdGxlJykpO1xuXHRcdGNvbnN0IGRlc2MgPSBhcHBlbmQoY29udGVudCwgJCgnLmFnZW50U2Vzc2lvbnNXZWxjb21lLXdhbGt0aHJvdWdoQ2FyZC1kZXNjcmlwdGlvbicpKTtcblxuXHRcdC8vIE5hdmlnYXRpb24gYXJyb3dzIGNvbnRhaW5lclxuXHRcdGNvbnN0IG5hdkNvbnRhaW5lciA9IGFwcGVuZChjYXJkLCAkKCcuYWdlbnRTZXNzaW9uc1dlbGNvbWUtd2Fsa3Rocm91Z2hDYXJkLW5hdicpKTtcblx0XHRjb25zdCBwcmV2QnV0dG9uID0gYXBwZW5kKG5hdkNvbnRhaW5lciwgJCgnYnV0dG9uLm5hdi1idXR0b24nKSkgYXMgSFRNTEJ1dHRvbkVsZW1lbnQ7XG5cdFx0cHJldkJ1dHRvbi5hcHBlbmRDaGlsZChyZW5kZXJJY29uKENvZGljb24uY2hldnJvbkxlZnQpKTtcblx0XHRwcmV2QnV0dG9uLnRpdGxlID0gbG9jYWxpemUoJ3ByZXZpb3VzV2Fsa3Rocm91Z2gnLCBcIlByZXZpb3VzXCIpO1xuXG5cdFx0Y29uc3QgbmV4dEJ1dHRvbiA9IGFwcGVuZChuYXZDb250YWluZXIsICQoJ2J1dHRvbi5uYXYtYnV0dG9uJykpIGFzIEhUTUxCdXR0b25FbGVtZW50O1xuXHRcdG5leHRCdXR0b24uYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmNoZXZyb25SaWdodCkpO1xuXHRcdG5leHRCdXR0b24udGl0bGUgPSBsb2NhbGl6ZSgnbmV4dFdhbGt0aHJvdWdoJywgXCJOZXh0XCIpO1xuXG5cdFx0Y29uc3QgdXBkYXRlQ29udGVudCA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHdhbGt0aHJvdWdoID0gYWN0aXZlV2Fsa3Rocm91Z2hzW2N1cnJlbnRJbmRleF07XG5cblx0XHRcdC8vIFVwZGF0ZSBpY29uXG5cdFx0XHRjbGVhck5vZGUoaWNvbkNvbnRhaW5lcik7XG5cdFx0XHRpZiAod2Fsa3Rocm91Z2guaWNvbi50eXBlID09PSAnaWNvbicpIHtcblx0XHRcdFx0aWNvbkNvbnRhaW5lci5hcHBlbmRDaGlsZChyZW5kZXJJY29uKHdhbGt0aHJvdWdoLmljb24uaWNvbikpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBVcGRhdGUgY29udGVudFxuXHRcdFx0dGl0bGUudGV4dENvbnRlbnQgPSB3YWxrdGhyb3VnaC50aXRsZTtcblx0XHRcdGRlc2MudGV4dENvbnRlbnQgPSB3YWxrdGhyb3VnaC5kZXNjcmlwdGlvbiB8fCAnJztcblxuXHRcdFx0Ly8gVXBkYXRlIG5hdmlnYXRpb24gYnV0dG9uIHN0YXRlc1xuXHRcdFx0cHJldkJ1dHRvbi5kaXNhYmxlZCA9IGN1cnJlbnRJbmRleCA9PT0gMDtcblx0XHRcdG5leHRCdXR0b24uZGlzYWJsZWQgPSBjdXJyZW50SW5kZXggPT09IGFjdGl2ZVdhbGt0aHJvdWdocy5sZW5ndGggLSAxO1xuXHRcdH07XG5cblx0XHQvLyBJbml0aWFsaXplIGNvbnRlbnRcblx0XHR1cGRhdGVDb250ZW50KCk7XG5cblx0XHRjYXJkLm9uY2xpY2sgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCB3YWxrdGhyb3VnaCA9IGFjdGl2ZVdhbGt0aHJvdWdoc1tjdXJyZW50SW5kZXhdO1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8QWdlbnRTZXNzaW9uc1dlbGNvbWVBY3Rpb25FdmVudCwgQWdlbnRTZXNzaW9uc1dlbGNvbWVBY3Rpb25DbGFzc2lmaWNhdGlvbj4oXG5cdFx0XHRcdCdhZ2VudFNlc3Npb25zV2VsY29tZS5BY3Rpb25FeGVjdXRlZCcsXG5cdFx0XHRcdHsgd2VsY29tZUtpbmQ6ICdhZ2VudFNlc3Npb25zV2VsY29tZVBhZ2UnLCBhY3Rpb246ICdvcGVuV2Fsa3Rocm91Z2gnLCBhY3Rpb25JZDogd2Fsa3Rocm91Z2guaWQgfVxuXHRcdFx0KTtcblx0XHRcdC8vIE9wZW4gd2Fsa3Rocm91Z2ggd2l0aCByZXR1cm5Ub0NvbW1hbmQgc28gYmFjayBidXR0b24gcmV0dXJucyB0byBhZ2VudCBzZXNzaW9ucyB3ZWxjb21lXG5cdFx0XHRjb25zdCBvcHRpb25zOiBHZXR0aW5nU3RhcnRlZEVkaXRvck9wdGlvbnMgPSB7XG5cdFx0XHRcdHNlbGVjdGVkQ2F0ZWdvcnk6IHdhbGt0aHJvdWdoLmlkLFxuXHRcdFx0XHRyZXR1cm5Ub0NvbW1hbmQ6IEFnZW50U2Vzc2lvbnNXZWxjb21lUGFnZS5DT01NQU5EX0lELFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0cmVzb3VyY2U6IEdldHRpbmdTdGFydGVkSW5wdXQuUkVTT1VSQ0UsXG5cdFx0XHRcdG9wdGlvbnNcblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHRwcmV2QnV0dG9uLm9uY2xpY2sgPSAoZSkgPT4ge1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGlmIChjdXJyZW50SW5kZXggPiAwKSB7XG5cdFx0XHRcdGN1cnJlbnRJbmRleC0tO1xuXHRcdFx0XHR1cGRhdGVDb250ZW50KCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdG5leHRCdXR0b24ub25jbGljayA9IChlKSA9PiB7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0aWYgKGN1cnJlbnRJbmRleCA8IGFjdGl2ZVdhbGt0aHJvdWdocy5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdGN1cnJlbnRJbmRleCsrO1xuXHRcdFx0XHR1cGRhdGVDb250ZW50KCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFBSSVZBQ1lfTk9USUNFX0RJU01JU1NFRF9LRVkgPSAnYWdlbnRTZXNzaW9uc1dlbGNvbWUucHJpdmFjeU5vdGljZURpc21pc3NlZCc7XG5cblx0cHJpdmF0ZSBidWlsZFByaXZhY3lOb3RpY2UoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdC8vIFRPUy9Qcml2YWN5IG5vdGljZSBmb3IgdXNlcnMgd2hvIGFyZSBub3Qgc2lnbmVkIGluIC0gcmV1c2luZyB3YWxrdGhyb3VnaCBjYXJkIGRlc2lnblxuXHRcdGlmICghdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmFub255bW91cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHVzZXIgaGFzIGRpc21pc3NlZCB0aGUgbm90aWNlXG5cdFx0aWYgKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0Qm9vbGVhbihBZ2VudFNlc3Npb25zV2VsY29tZVBhZ2UuUFJJVkFDWV9OT1RJQ0VfRElTTUlTU0VEX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBmYWxzZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcm92aWRlcnMgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQ/LnByb3ZpZGVyO1xuXHRcdGlmICghcHJvdmlkZXJzIHx8ICFwcm92aWRlcnMuZGVmYXVsdCB8fCAhdGhpcy5wcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50Py50ZXJtc1N0YXRlbWVudFVybCB8fCAhdGhpcy5wcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50Py5wcml2YWN5U3RhdGVtZW50VXJsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9zQ2FyZCA9IGFwcGVuZChjb250YWluZXIsICQoJy5hZ2VudFNlc3Npb25zV2VsY29tZS13YWxrdGhyb3VnaENhcmQuYWdlbnRTZXNzaW9uc1dlbGNvbWUtdG9zQ2FyZCcpKTtcblxuXHRcdGNvbnN0IGRpc21pc3NOb3RpY2UgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKEFnZW50U2Vzc2lvbnNXZWxjb21lUGFnZS5QUklWQUNZX05PVElDRV9ESVNNSVNTRURfS0VZLCB0cnVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdFx0XHR0b3NDYXJkLnJlbW92ZSgpO1xuXHRcdH07XG5cblx0XHQvLyBEaXNtaXNzIHRoZSBub3RpY2Ugd2hlbiBhIGNoYXQgcmVxdWVzdCBpcyBzZW50XG5cdFx0dGhpcy5jb250ZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuY2hhdFNlcnZpY2Uub25EaWRTdWJtaXRSZXF1ZXN0KCgpID0+IGRpc21pc3NOb3RpY2UoKSkpO1xuXG5cdFx0Ly8gSWNvblxuXHRcdGNvbnN0IGljb25Db250YWluZXIgPSBhcHBlbmQodG9zQ2FyZCwgJCgnLmFnZW50U2Vzc2lvbnNXZWxjb21lLXdhbGt0aHJvdWdoQ2FyZC1pY29uJykpO1xuXHRcdGljb25Db250YWluZXIuYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmNoYXRTcGFya2xlKSk7XG5cblx0XHQvLyBDb250ZW50XG5cdFx0Y29uc3QgY29udGVudCA9IGFwcGVuZCh0b3NDYXJkLCAkKCcuYWdlbnRTZXNzaW9uc1dlbGNvbWUtd2Fsa3Rocm91Z2hDYXJkLWNvbnRlbnQnKSk7XG5cdFx0Y29uc3QgdGl0bGUgPSBhcHBlbmQoY29udGVudCwgJCgnLmFnZW50U2Vzc2lvbnNXZWxjb21lLXdhbGt0aHJvdWdoQ2FyZC10aXRsZScpKTtcblx0XHR0aXRsZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCd0b3NUaXRsZScsIFwiVHJ5IEdpdEh1YiBDb3BpbG90IGZvciBmcmVlLCBubyBzaWduLWluIHJlcXVpcmVkIVwiKTtcblxuXHRcdGNvbnN0IGRlc2MgPSBhcHBlbmQoY29udGVudCwgJCgnLmFnZW50U2Vzc2lvbnNXZWxjb21lLXdhbGt0aHJvdWdoQ2FyZC1kZXNjcmlwdGlvbicpKTtcblx0XHRjb25zdCBkZXNjcmlwdGlvbk1hcmtkb3duID0gbmV3IE1hcmtkb3duU3RyaW5nKFxuXHRcdFx0bG9jYWxpemUoXG5cdFx0XHRcdHsga2V5OiAndG9zRGVzY3JpcHRpb24nLCBjb21tZW50OiBbJ3tMb2NrZWQ9XCJdKHsxfSlcIn0nLCAne0xvY2tlZD1cIl0oezJ9KVwifSddIH0sXG5cdFx0XHRcdFwiQnkgY29udGludWluZywgeW91IGFncmVlIHRvIHswfSdzIFtUZXJtc10oezF9KSBhbmQgW1ByaXZhY3kgU3RhdGVtZW50XSh7Mn0pLlwiLFxuXHRcdFx0XHRwcm92aWRlcnMuZGVmYXVsdC5uYW1lLFxuXHRcdFx0XHR0aGlzLnByb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQudGVybXNTdGF0ZW1lbnRVcmwsXG5cdFx0XHRcdHRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudC5wcml2YWN5U3RhdGVtZW50VXJsXG5cdFx0XHQpLFxuXHRcdFx0eyBpc1RydXN0ZWQ6IHRydWUgfVxuXHRcdCk7XG5cdFx0Y29uc3QgcmVuZGVyZWRNYXJrZG93biA9IHRoaXMubWFya2Rvd25SZW5kZXJlclNlcnZpY2UucmVuZGVyKGRlc2NyaXB0aW9uTWFya2Rvd24pO1xuXHRcdGRlc2MuYXBwZW5kQ2hpbGQocmVuZGVyZWRNYXJrZG93bi5lbGVtZW50KTtcblxuXHRcdC8vIERpc21pc3MgYnV0dG9uXG5cdFx0Y29uc3QgZGlzbWlzc0J1dHRvbiA9IGFwcGVuZCh0b3NDYXJkLCAkKCdidXR0b24uYWdlbnRTZXNzaW9uc1dlbGNvbWUtdG9zQ2FyZC1kaXNtaXNzJykpO1xuXHRcdGRpc21pc3NCdXR0b24uYXBwZW5kQ2hpbGQocmVuZGVySWNvbihDb2RpY29uLmNsb3NlKSk7XG5cdFx0ZGlzbWlzc0J1dHRvbi50aXRsZSA9IGxvY2FsaXplKCdkaXNtaXNzUHJpdmFjeU5vdGljZScsIFwiRGlzbWlzc1wiKTtcblx0XHRkaXNtaXNzQnV0dG9uLm9uY2xpY2sgPSAoZSkgPT4ge1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGRpc21pc3NOb3RpY2UoKTtcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBidWlsZEZvb3Rlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Ly8gUHJpdmFjeSBub3RpY2Vcblx0XHR0aGlzLmJ1aWxkUHJpdmFjeU5vdGljZShjb250YWluZXIpO1xuXG5cdFx0Ly8gU2hvdyBvbiBzdGFydHVwIGNoZWNrYm94XG5cdFx0Y29uc3Qgc2hvd09uU3RhcnR1cENvbnRhaW5lciA9IGFwcGVuZChjb250YWluZXIsICQoJy5hZ2VudFNlc3Npb25zV2VsY29tZS1zaG93T25TdGFydHVwJykpO1xuXHRcdGNvbnN0IHNob3dPblN0YXJ0dXBDaGVja2JveCA9IHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChuZXcgVG9nZ2xlKHtcblx0XHRcdGljb246IENvZGljb24uY2hlY2ssXG5cdFx0XHRhY3Rpb25DbGFzc05hbWU6ICdhZ2VudFNlc3Npb25zV2VsY29tZS1jaGVja2JveCcsXG5cdFx0XHRpc0NoZWNrZWQ6IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoY29uZmlndXJhdGlvbktleSkgPT09ICdhZ2VudFNlc3Npb25zV2VsY29tZVBhZ2UnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdjaGVja2JveFRpdGxlJywgXCJXaGVuIGNoZWNrZWQsIHRoaXMgcGFnZSB3aWxsIGJlIHNob3duIG9uIHN0YXJ0dXAuXCIpLFxuXHRcdFx0Li4uZ2V0VG9nZ2xlU3R5bGVzKHtcblx0XHRcdFx0aW5wdXRBY3RpdmVPcHRpb25CYWNrZ3JvdW5kOiAndmFyKC0tdnNjb2RlLWRlc2NyaXB0aW9uRm9yZWdyb3VuZCknLFxuXHRcdFx0XHRpbnB1dEFjdGl2ZU9wdGlvbkZvcmVncm91bmQ6ICd2YXIoLS12c2NvZGUtZWRpdG9yLWJhY2tncm91bmQpJyxcblx0XHRcdFx0aW5wdXRBY3RpdmVPcHRpb25Cb3JkZXI6ICd2YXIoLS12c2NvZGUtZGVzY3JpcHRpb25Gb3JlZ3JvdW5kKScsXG5cdFx0XHR9KVxuXHRcdH0pKTtcblx0XHRzaG93T25TdGFydHVwQ2hlY2tib3guZG9tTm9kZS5pZCA9ICdzaG93T25TdGFydHVwJztcblx0XHRjb25zdCBzaG93T25TdGFydHVwTGFiZWwgPSAkKCdsYWJlbC5jYXB0aW9uJywgeyBmb3I6ICdzaG93T25TdGFydHVwJyB9LCBsb2NhbGl6ZSgnc2hvd09uU3RhcnR1cCcsIFwiU2hvdyB3ZWxjb21lIHBhZ2Ugb24gc3RhcnR1cFwiKSk7XG5cblx0XHRjb25zdCBvblNob3dPblN0YXJ0dXBDaGFuZ2VkID0gKCkgPT4ge1xuXHRcdFx0aWYgKHNob3dPblN0YXJ0dXBDaGVja2JveC5jaGVja2VkKSB7XG5cdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoY29uZmlndXJhdGlvbktleSwgJ2FnZW50U2Vzc2lvbnNXZWxjb21lUGFnZScpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShjb25maWd1cmF0aW9uS2V5LCAnbm9uZScpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHR0aGlzLmNvbnRlbnREaXNwb3NhYmxlcy5hZGQoc2hvd09uU3RhcnR1cENoZWNrYm94Lm9uQ2hhbmdlKCgpID0+IG9uU2hvd09uU3RhcnR1cENoYW5nZWQoKSkpO1xuXHRcdHRoaXMuY29udGVudERpc3Bvc2FibGVzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoc2hvd09uU3RhcnR1cExhYmVsLCAnY2xpY2snLCAoKSA9PiB7XG5cdFx0XHRzaG93T25TdGFydHVwQ2hlY2tib3guY2hlY2tlZCA9ICFzaG93T25TdGFydHVwQ2hlY2tib3guY2hlY2tlZDtcblx0XHRcdG9uU2hvd09uU3RhcnR1cENoYW5nZWQoKTtcblx0XHR9KSk7XG5cblx0XHRzaG93T25TdGFydHVwQ29udGFpbmVyLmFwcGVuZENoaWxkKHNob3dPblN0YXJ0dXBDaGVja2JveC5kb21Ob2RlKTtcblx0XHRzaG93T25TdGFydHVwQ29udGFpbmVyLmFwcGVuZENoaWxkKHNob3dPblN0YXJ0dXBMYWJlbCk7XG5cdH1cblxuXHRwcml2YXRlIGxhc3REaW1lbnNpb246IERpbWVuc2lvbiB8IHVuZGVmaW5lZDtcblxuXHRvdmVycmlkZSBsYXlvdXQoZGltZW5zaW9uOiBEaW1lbnNpb24pOiB2b2lkIHtcblx0XHR0aGlzLmxhc3REaW1lbnNpb24gPSBkaW1lbnNpb247XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7ZGltZW5zaW9uLmhlaWdodH1weGA7XG5cdFx0dGhpcy5jb250YWluZXIuc3R5bGUud2lkdGggPSBgJHtkaW1lbnNpb24ud2lkdGh9cHhgO1xuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hlaWdodC1jb25zdHJhaW5lZCcsIGRpbWVuc2lvbi5oZWlnaHQgPD0gV0VMQ09NRV9DT01QQUNUX0hFSUdIVCk7XG5cblx0XHQvLyBMYXlvdXQgY2hhdCB3aWRnZXRcblx0XHR0aGlzLmxheW91dENoYXRXaWRnZXQoKTtcblxuXHRcdC8vIExheW91dCBzZXNzaW9ucyBjb250cm9sXG5cdFx0dGhpcy5sYXlvdXRTZXNzaW9uc0NvbnRyb2woKTtcblxuXHRcdHRoaXMuc2Nyb2xsYWJsZUVsZW1lbnQ/LnNjYW5Eb21Ob2RlKCk7XG5cdH1cblxuXHRwcml2YXRlIGxheW91dENoYXRXaWRnZXQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmNoYXRXaWRnZXQgfHwgIXRoaXMubGFzdERpbWVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXRXaWR0aCA9IE1hdGgubWluKDgwMCwgdGhpcy5sYXN0RGltZW5zaW9uLndpZHRoIC0gODApO1xuXHRcdHRoaXMuY2hhdFdpZGdldC5zZXRJbnB1dFBhcnRNYXhIZWlnaHRPdmVycmlkZShXRUxDT01FX0NIQVRfSU5QVVRfTUFYX0hFSUdIVF9PVkVSUklERSk7XG5cdFx0dGhpcy5jaGF0V2lkZ2V0LmxheW91dChXRUxDT01FX0NIQVRfSU5QVVRfTEFZT1VUX0hFSUdIVCwgY2hhdFdpZHRoKTtcblx0fVxuXG5cdHByaXZhdGUgbGF5b3V0U2Vzc2lvbnNDb250cm9sKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zZXNzaW9uc0NvbnRyb2wgfHwgIXRoaXMuc2Vzc2lvbnNDb250cm9sQ29udGFpbmVyIHx8ICF0aGlzLmxhc3REaW1lbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUT0RPOiBAb3NvcnRlZ2EgdGhpcyBpcyBhIHdlaXJkIHdheSBvZiBkb2luZyB0aGlzLCBtYXliZSB3ZSBoYW5kbGUgdGhlIDItY29sdW0gbGF5b3V0IGluIHRoZSBjb250cm9sIGl0c2VsZj9cblx0XHRjb25zdCBzZXNzaW9uc1dpZHRoID0gTWF0aC5taW4oODAwLCB0aGlzLmxhc3REaW1lbnNpb24ud2lkdGggLSA4MCk7XG5cdFx0Ly8gQ2FsY3VsYXRlIGhlaWdodCBiYXNlZCBvbiBhY3R1YWwgdmlzaWJsZSBzZXNzaW9ucyAoY2FwcGVkIGF0IE1BWF9TRVNTSU9OUylcblx0XHQvLyBVc2UgSVRFTV9IRUlHSFQgcGVyIGl0ZW0gZnJvbSBBZ2VudFNlc3Npb25zTGlzdERlbGVnYXRlXG5cdFx0Ly8gR2l2ZSB0aGUgbGlzdCBGVUxMIGhlaWdodCBzbyB2aXJ0dWFsaXphdGlvbiByZW5kZXJzIGFsbCBpdGVtc1xuXHRcdC8vIENTUyB0cmFuc2Zvcm1zIGhhbmRsZSB0aGUgMi1jb2x1bW4gdmlzdWFsIGxheW91dFxuXHRcdGNvbnN0IHZpc2libGVTZXNzaW9ucyA9IE1hdGgubWluKFxuXHRcdFx0dGhpcy5hZ2VudFNlc3Npb25zU2VydmljZS5tb2RlbC5zZXNzaW9ucy5maWx0ZXIocyA9PiAhcy5pc0FyY2hpdmVkKCkpLmxlbmd0aCxcblx0XHRcdE1BWF9TRVNTSU9OU1xuXHRcdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNIZWlnaHQgPSB2aXNpYmxlU2Vzc2lvbnMgKiBBZ2VudFNlc3Npb25zTGlzdERlbGVnYXRlLklURU1fSEVJR0hUO1xuXHRcdHRoaXMuc2Vzc2lvbnNDb250cm9sLmxheW91dChzZXNzaW9uc0hlaWdodCwgc2Vzc2lvbnNXaWR0aCk7XG5cblx0XHQvLyBTZXQgbWFyZ2luIG9mZnNldCBmb3IgMi1jb2x1bW4gbGF5b3V0OiBhY3R1YWwgaGVpZ2h0IC0gdmlzdWFsIGhlaWdodFxuXHRcdC8vIFZpc3VhbCBoZWlnaHQgPSBjZWlsKG4vMikgKiBJVEVNX0hFSUdIVCwgc28gb2Zmc2V0ID0gZmxvb3Iobi8yKSAqIElURU1fSEVJR0hUXG5cdFx0Y29uc3QgbWFyZ2luT2Zmc2V0ID0gTWF0aC5mbG9vcih2aXNpYmxlU2Vzc2lvbnMgLyAyKSAqIEFnZW50U2Vzc2lvbnNMaXN0RGVsZWdhdGUuSVRFTV9IRUlHSFQ7XG5cdFx0dGhpcy5zZXNzaW9uc0NvbnRyb2wuZWxlbWVudCEuc3R5bGUubWFyZ2luQm90dG9tID0gYC0ke21hcmdpbk9mZnNldH1weGA7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXHRcdHRoaXMuY2hhdFdpZGdldD8uZm9jdXNJbnB1dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXZlYWxNYXhpbWl6ZWRDaGF0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNsb3NlRWRpdG9yQW5kTWF4aW1pemVBdXhpbGlhcnlCYXIoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdGYWlsZWQgdG8gb3BlbiBtYXhpbWl6ZWQgY2hhdDogezB9JywgdG9FcnJvck1lc3NhZ2UoZXJyb3IpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9wZW5TZXNzaW9uSW5DaGF0KHNlc3Npb25SZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuY2xvc2VFZGl0b3JBbmRNYXhpbWl6ZUF1eGlsaWFyeUJhcihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0ZhaWxlZCB0byBvcGVuIGFnZW50IHNlc3Npb246IHswfScsIHRvRXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjbG9zZUVkaXRvckFuZE1heGltaXplQXV4aWxpYXJ5QmFyKHNlc3Npb25SZXNvdXJjZT86IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGVkaXRvclRvQ2xvc2UgPSB0aGlzLmlucHV0IHx8IHRoaXMuX3N0b3JlZElucHV0O1xuXG5cdFx0aWYgKGVkaXRvclRvQ2xvc2UgJiYgdGhpcy5ncm91cC5jb250YWlucyhlZGl0b3JUb0Nsb3NlKSkge1xuXHRcdFx0Ly8gV2FpdCB1bnRpbCB0aGUgYWN0aXZlIGVkaXRvciBjaGFuZ2VkIHNvIHRoYXQgdGhlIGNoYXQgZG9lc24ndCB0b2dnbGUgYmFja1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLmdyb3VwLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0dGhpcy5ncm91cC5jbG9zZUVkaXRvcihlZGl0b3JUb0Nsb3NlKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHQvLyBOb3cgcHJvY2VlZCB3aXRoIG9wZW5pbmcgY2hhdCBhbmQgbWF4aW1pemluZ1xuXHRcdGlmIChzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdGF3YWl0IHRoaXMuY2hhdFdpZGdldFNlcnZpY2Uub3BlblNlc3Npb24oc2Vzc2lvblJlc291cmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW4nKTtcblx0XHR9XG5cdFx0Y29uc3QgY2hhdFZpZXdMb2NhdGlvbiA9IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdMb2NhdGlvbkJ5SWQoQ2hhdFZpZXdJZCk7XG5cdFx0aWYgKGNoYXRWaWV3TG9jYXRpb24gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpIHtcblx0XHRcdHRoaXMubGF5b3V0U2VydmljZS5zZXRBdXhpbGlhcnlCYXJNYXhpbWl6ZWQodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRSZWNlbnRseU9wZW5lZFdvcmtzcGFjZXMob25seVRydXN0ZWQ6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8QXJyYXk8SVJlY2VudFdvcmtzcGFjZSB8IElSZWNlbnRGb2xkZXI+PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlcyA9IGF3YWl0IHRoaXMud29ya3NwYWNlc1NlcnZpY2UuZ2V0UmVjZW50bHlPcGVuZWQoKTtcblx0XHRjb25zdCB0cnVzdEluZm9Qcm9taXNlcyA9IHdvcmtzcGFjZXMud29ya3NwYWNlcy5tYXAoYXN5bmMgd3MgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gaXNSZWNlbnRXb3Jrc3BhY2Uod3MpID8gd3Mud29ya3NwYWNlLmNvbmZpZ1BhdGggOiB3cy5mb2xkZXJVcmk7XG5cdFx0XHRjb25zdCB0cnVzdEluZm8gPSBhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuZ2V0VXJpVHJ1c3RJbmZvKHVyaSk7XG5cdFx0XHRyZXR1cm4geyB3b3Jrc3BhY2U6IHdzLCB0cnVzdGVkOiB0cnVzdEluZm8udHJ1c3RlZCB9O1xuXHRcdH0pO1xuXHRcdGNvbnN0IHRydXN0SW5mb1Jlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbCh0cnVzdEluZm9Qcm9taXNlcyk7XG5cdFx0Y29uc3QgZmlsdGVyZWRXb3Jrc3BhY2VzID0gdHJ1c3RJbmZvUmVzdWx0c1xuXHRcdFx0LmZpbHRlcihyZXN1bHQgPT4gb25seVRydXN0ZWQgPyByZXN1bHQudHJ1c3RlZCA6IHRydWUpXG5cdFx0XHQubWFwKHJlc3VsdCA9PiByZXN1bHQud29ya3NwYWNlKTtcblx0XHRyZXR1cm4gZmlsdGVyZWRXb3Jrc3BhY2VzO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBZ2VudFNlc3Npb25zV2VsY29tZUlucHV0U2VyaWFsaXplciBpbXBsZW1lbnRzIElFZGl0b3JTZXJpYWxpemVyIHtcblx0Y2FuU2VyaWFsaXplKGVkaXRvcklucHV0OiBBZ2VudFNlc3Npb25zV2VsY29tZUlucHV0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRzZXJpYWxpemUoZWRpdG9ySW5wdXQ6IEFnZW50U2Vzc2lvbnNXZWxjb21lSW5wdXQpOiBzdHJpbmcge1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh7fSk7XG5cdH1cblxuXHRkZXNlcmlhbGl6ZShpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJpYWxpemVkRWRpdG9ySW5wdXQ6IHN0cmluZyk6IEFnZW50U2Vzc2lvbnNXZWxjb21lSW5wdXQge1xuXHRcdHJldHVybiBuZXcgQWdlbnRTZXNzaW9uc1dlbGNvbWVJbnB1dCh7fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsR0FBRyx1QkFBdUIsUUFBUSxXQUFzQixXQUFXLG9DQUFvQztBQUNoSCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGNBQWM7QUFDdkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQTZCLG9CQUFvQjtBQUMxRCxTQUFTLGVBQWU7QUFDeEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxlQUFlLHVCQUF1QjtBQUMvQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG1CQUFtQixtQkFBbUIsb0JBQW9CO0FBQ25FLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQWlEO0FBRTFELFNBQTRDLGlDQUFvRTtBQUNoSCxTQUFTLG9CQUFvQjtBQUU3QixTQUFTLFlBQVksMEJBQXNHO0FBQzNILFNBQVMscUJBQXFCLG9DQUFvQztBQUNsRSxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDRCQUEwRDtBQUNuRSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHFCQUFxQjtBQUM5QixTQUErQiw0QkFBNEI7QUFDM0QsU0FBc0MsMkJBQTJCO0FBQ2pFLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMEJBQTBCLHNCQUFzQjtBQUN6RCxTQUFTLG9CQUFxRCxnQkFBZ0IseUJBQXlCO0FBQ3ZHLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsd0JBQXdCLDZCQUE2QjtBQUM5RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHFCQUFxQiwwQkFBMEI7QUFFeEQsTUFBTSxtQkFBbUI7QUFDekIsTUFBTSxlQUFlO0FBQ3JCLE1BQU0saUJBQWlCO0FBQ3ZCLE1BQU0sbUJBQW1CO0FBQ3pCLE1BQU0sbUNBQW1DO0FBQ3pDLE1BQU0sMENBQTBDO0FBQ2hELE1BQU0sNENBQTRDO0FBQ2xELE1BQU0seUJBQXlCO0FBRS9CLE1BQU0seUNBQXlDLG1DQUFtQywwQ0FBMEM7QUFvRHJILElBQU0sMkJBQU4sY0FBdUMsV0FBVztBQUFBLEVBMkJ4RCxZQUNDLE9BQ21CLGtCQUNKLGNBQ21CLGdCQUNNLHNCQUNwQixtQkFDc0IsZUFDUixnQkFDRCxlQUNPLHNCQUNBLHNCQUNOLGdCQUNLLHFCQUNSLGFBQ1csd0JBQ0MseUJBQ0EseUJBQ04sbUJBQ04sYUFDb0IsaUNBQ1YsdUJBQ0osbUJBQ1AsWUFDN0I7QUFDRCxVQUFNLHlCQUF5QixJQUFJLE9BQU8sa0JBQWtCLGNBQWMsY0FBYztBQXJCdEQ7QUFDTTtBQUVFO0FBQ1I7QUFDRDtBQUNPO0FBQ0E7QUFDTjtBQUNLO0FBQ1I7QUFDVztBQUNDO0FBQ0E7QUFDTjtBQUNOO0FBQ29CO0FBQ1Y7QUFDSjtBQUNQO0FBdEMvQixTQUFpQiw2QkFBNkIsS0FBSyxVQUFVLElBQUksZ0JBQWdCLENBQUM7QUFDbEYsU0FBaUIscUJBQXFCLEtBQUssVUFBVSxJQUFJLGdCQUFnQixDQUFDO0FBRTFFLFNBQVEsZUFBdUMsQ0FBQztBQUNoRCxTQUFRLDJCQUErQyxzQkFBc0I7QUFFN0UsU0FBUSwyQkFBb0UsQ0FBQztBQUM3RSxTQUFRLG9CQUE2QjtBQUNyQyxTQUFRLGlCQUFvRDtBQUc1RDtBQUFBLFNBQVEsWUFBb0I7QUErQjNCLFNBQUssWUFBWSxFQUFFLHlCQUF5QjtBQUFBLE1BQzNDLE1BQU07QUFBQSxNQUNOLFVBQVU7QUFBQSxNQUNWLGNBQWMsU0FBUyxpQ0FBaUMsb0RBQW9EO0FBQUEsSUFDN0csQ0FBQztBQUVELFNBQUssaUJBQWlCLEtBQUssVUFBVSxrQkFBa0IsYUFBYSxLQUFLLFNBQVMsQ0FBQztBQUNuRixvQkFBZ0IsdUJBQXVCLE9BQU8sS0FBSyxjQUFjLEVBQUUsSUFBSSxJQUFJO0FBRTNFLFNBQUssVUFBVSxLQUFLLHVCQUF1QixxQkFBcUIsTUFBTTtBQUNyRSxZQUFNLFFBQVEsS0FBSyxTQUFTLEtBQUs7QUFDakMsVUFBSSxLQUFLLHVCQUF1QixVQUFVLFVBQVUsT0FBTztBQUMxRCxhQUFLLFlBQVk7QUFDakIsYUFBSyxNQUFNLFlBQVksS0FBSztBQUFBLE1BQzdCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFVSxhQUFhLFFBQTJCO0FBQ2pELFdBQU8sWUFBWSxLQUFLLFNBQVM7QUFHakMsU0FBSyxtQkFBbUIsRUFBRSwrQkFBK0I7QUFDekQsU0FBSyxvQkFBb0IsS0FBSyxVQUFVLElBQUkscUJBQXFCLEtBQUssa0JBQWtCO0FBQUEsTUFDdkYsV0FBVztBQUFBLE1BQ1gsVUFBVSxvQkFBb0I7QUFBQSxJQUMvQixDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsWUFBWSxLQUFLLGtCQUFrQixXQUFXLENBQUM7QUFBQSxFQUMvRDtBQUFBLEVBRUEsTUFBZSxTQUFTLE9BQWtDLFNBQXdELFNBQTZCLE9BQXlDO0FBQ3ZMLFNBQUssZUFBZTtBQUNwQixTQUFLLFlBQVksS0FBSyxJQUFJO0FBQzFCLFVBQU0sTUFBTSxTQUFTLE9BQU8sU0FBUyxTQUFTLEtBQUs7QUFDbkQsU0FBSyxpQkFBaUIsTUFBTSxpQkFBaUI7QUFDN0MsVUFBTSxLQUFLLGFBQWE7QUFBQSxFQUN6QjtBQUFBLEVBRVMsYUFBbUI7QUFFM0IsUUFBSSxLQUFLLFlBQVksR0FBRztBQUN2QixZQUFNLG9CQUFvQixLQUFLLElBQUksSUFBSSxLQUFLO0FBQzVDLFdBQUssaUJBQWlCO0FBQUEsUUFDckI7QUFBQSxRQUNBO0FBQUEsVUFDQztBQUFBLFVBQ0EsVUFBVSxLQUFLLGFBQWE7QUFBQSxRQUM3QjtBQUFBLE1BQ0Q7QUFDQSxXQUFLLFlBQVk7QUFDakIsV0FBSyxZQUFZO0FBQUEsSUFDbEI7QUFDQSxVQUFNLFdBQVc7QUFBQSxFQUNsQjtBQUFBLEVBRUEsTUFBYyxlQUE4QjtBQUMzQyxTQUFLLG1CQUFtQixNQUFNO0FBQzlCLFNBQUssMkJBQTJCLE1BQU07QUFDdEMsU0FBSyxrQkFBa0I7QUFDdkIsY0FBVSxLQUFLLGdCQUFnQjtBQUcvQixTQUFLLG9CQUFvQixLQUFLLHdCQUF3QixrQkFBa0IsTUFBTSxlQUFlO0FBQzdGLFFBQUksS0FBSyxtQkFBbUI7QUFDM0IsWUFBTSxpQkFBaUIsTUFBTSxLQUFLLDRCQUE0QixJQUFJO0FBQ2xFLFdBQUssMkJBQTJCLGVBQWUsTUFBTSxHQUFHLGNBQWM7QUFBQSxJQUN2RTtBQUdBLFNBQUssZUFBZSxLQUFLLG9CQUFvQixnQkFBZ0I7QUFHN0QsVUFBTSxTQUFTLE9BQU8sS0FBSyxrQkFBa0IsRUFBRSw4QkFBOEIsQ0FBQztBQUM5RSxXQUFPLFFBQVEsRUFBRSxtQkFBbUIsQ0FBQyxHQUFHLEtBQUssZUFBZSxRQUFRLENBQUM7QUFFckUsVUFBTSxlQUFlLE9BQU8sUUFBUSxFQUFFLG9DQUFvQyxDQUFDO0FBQzNFLFVBQU0sS0FBSyxrQkFBa0IsWUFBWTtBQUd6QyxVQUFNLGNBQWMsT0FBTyxLQUFLLGtCQUFrQixFQUFFLG1DQUFtQyxDQUFDO0FBQ3hGLFNBQUssZ0JBQWdCLFdBQVc7QUFHaEMsVUFBTSxrQkFBa0IsT0FBTyxLQUFLLGtCQUFrQixFQUFFLHVDQUF1QyxDQUFDO0FBQ2hHLFNBQUssdUJBQXVCLGVBQWU7QUFHM0MsVUFBTSxTQUFTLE9BQU8sS0FBSyxrQkFBa0IsRUFBRSw4QkFBOEIsQ0FBQztBQUM5RSxTQUFLLFlBQVksTUFBTTtBQUd2QixRQUFJLG1CQUFtQixLQUFLLHFCQUFxQixNQUFNLFNBQVMsU0FBUztBQUN6RSxTQUFLLG1CQUFtQixJQUFJLEtBQUsscUJBQXFCLE1BQU0sb0JBQW9CLE1BQU07QUFDckYsWUFBTSxjQUFjLEtBQUsscUJBQXFCLE1BQU0sU0FBUyxTQUFTO0FBRXRFLFVBQUksZ0JBQWdCLGtCQUFrQjtBQUNyQywyQkFBbUI7QUFDbkIsa0JBQVUsZUFBZTtBQUN6QixhQUFLLHVCQUF1QixlQUFlO0FBQUEsTUFDNUM7QUFDQSxXQUFLLHNCQUFzQjtBQUFBLElBQzVCLENBQUMsQ0FBQztBQUVGLFNBQUssbUJBQW1CLFlBQVk7QUFBQSxFQUNyQztBQUFBLEVBRUEsTUFBYyxrQkFBa0IsV0FBdUM7QUFDdEUsVUFBTSxhQUFhLE1BQU0sS0FBSyw0QkFBNEIsS0FBSztBQUMvRCxVQUFNLFlBQVksV0FBVyxTQUFTLElBQ25DLEVBQUUsTUFBTSxRQUFRLGNBQWMsT0FBTyxTQUFTLGNBQWMsZ0JBQWdCLEdBQUcsU0FBUyw4QkFBOEIsSUFDdEgsRUFBRSxNQUFNLFFBQVEsY0FBYyxPQUFPLFNBQVMsY0FBYyxnQkFBZ0IsR0FBRyxTQUFTLG9DQUFvQztBQUMvSCxVQUFNLFVBQVU7QUFBQSxNQUNmO0FBQUEsTUFDQSxFQUFFLE1BQU0sUUFBUSxTQUFTLE9BQU8sU0FBUyxXQUFXLGFBQWEsR0FBRyxTQUFTLDZCQUE2QjtBQUFBLE1BQzFHLEVBQUUsTUFBTSxRQUFRLFdBQVcsT0FBTyxTQUFTLGFBQWEseUJBQXlCLEdBQUcsU0FBUyxZQUFZO0FBQUEsSUFDMUc7QUFFQSxlQUFXLFNBQVMsU0FBUztBQUM1QixZQUFNLFNBQVMsT0FBTyxXQUFXLEVBQUUsd0NBQXdDLENBQUM7QUFDNUUsYUFBTyxZQUFZLFdBQVcsTUFBTSxJQUFJLENBQUM7QUFDekMsYUFBTyxZQUFZLFNBQVMsZUFBZSxNQUFNLEtBQUssQ0FBQztBQUN2RCxhQUFPLFVBQVUsTUFBTTtBQUN0QixhQUFLLGlCQUFpQjtBQUFBLFVBQ3JCO0FBQUEsVUFDQSxFQUFFLGFBQWEsNEJBQTRCLFFBQVEsa0JBQWtCLFVBQVUsTUFBTSxRQUFRO0FBQUEsUUFDOUY7QUFDQSxhQUFLLGVBQWUsZUFBZSxNQUFNLE9BQU87QUFBQSxNQUNqRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxnQkFBZ0IsV0FBOEI7QUFDckQsVUFBTSxzQkFBc0IsT0FBTyxXQUFXLEVBQUUsa0NBQWtDLENBQUM7QUFHbkYsVUFBTSwrQkFBK0IsS0FBSyxjQUFjLGFBQWEsVUFBVSxtQkFBbUIsQ0FBQyxFQUFFLFlBQVksRUFBRSxxQ0FBcUMsQ0FBQztBQUN6SixTQUFLLG1CQUFtQixJQUFJLGFBQWEsTUFBTSw2QkFBNkIsT0FBTyxDQUFDLENBQUM7QUFHckYsVUFBTSwwQkFBMEIsS0FBSyxtQkFBbUIsSUFBSSxLQUFLLGVBQWUsYUFBYSxtQkFBbUIsQ0FBQztBQUNqSCxVQUFNLDZCQUE2QixLQUFLLG1CQUFtQixJQUFJLEtBQUsscUJBQXFCLFlBQVksSUFBSSxrQkFBa0IsQ0FBQyxvQkFBb0IsdUJBQXVCLENBQUMsQ0FBQyxDQUFDO0FBRzFLLFVBQU0sbUNBQW1DLEtBQUssbUJBQW1CLElBQUksSUFBSSxRQUE0QixDQUFDO0FBQ3RHLFVBQU0sNkJBQTZCLE9BQU8sYUFBaUM7QUFDMUUsVUFBSSxLQUFLLGNBQWMsS0FBSyxjQUFjO0FBQ3pDLGFBQUssV0FBVyxTQUFTLE1BQVM7QUFDbEMsYUFBSyxhQUFhLFFBQVE7QUFDMUIsY0FBTSxjQUFjLDZCQUE2QjtBQUFBLFVBQ2hELE1BQU07QUFBQSxVQUNOLFVBQVUsb0JBQW9CO0FBQUEsVUFDOUIsYUFBYTtBQUFBLFFBQ2QsQ0FBQztBQUNELGNBQU0sTUFBTSxNQUFNLEtBQUssWUFBWSxxQkFBcUIsYUFBYSxrQkFBa0IsTUFBTSxrQkFBa0IsSUFBSTtBQUNuSCxhQUFLLGVBQWUsT0FBTyxLQUFLLFlBQVkscUJBQXFCLGtCQUFrQixJQUFJO0FBQ3ZGLGFBQUssbUJBQW1CLElBQUksS0FBSyxZQUFZO0FBQzdDLFlBQUksS0FBSyxhQUFhLFFBQVE7QUFDN0IsZUFBSyxXQUFXLFNBQVMsS0FBSyxhQUFhLE1BQU07QUFBQSxRQUNsRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsVUFBTSw0QkFBd0Q7QUFBQSxNQUM3RCwwQkFBMEIsTUFBTSxLQUFLO0FBQUEsTUFDckMsMEJBQTBCLENBQUMsYUFBaUM7QUFDM0QsYUFBSywyQkFBMkI7QUFDaEMseUNBQWlDLEtBQUssUUFBUTtBQUM5QyxZQUFJO0FBQ0gscUNBQTJCLFFBQVE7QUFBQSxRQUNwQyxRQUFRO0FBQUEsUUFBc0I7QUFBQSxNQUMvQjtBQUFBLE1BQ0Esa0NBQWtDLGlDQUFpQztBQUFBLElBQ3BFO0FBR0EsVUFBTSwrQkFBK0IsS0FBSyxtQkFBbUIsSUFBSSxJQUFJLFFBQTBDLENBQUM7QUFDaEgsVUFBTSx3QkFBd0IsS0FBSyxtQkFBbUIsSUFBSSxJQUFJLFFBQWMsQ0FBQztBQUM3RSxVQUFNLDBCQUFnRSxLQUFLLG9CQUFvQjtBQUFBLE1BQzlGLGVBQWUsTUFBTSxLQUFLLHlCQUF5QixJQUFJLFFBQU07QUFBQSxRQUM1RCxLQUFLLEtBQUssZ0JBQWdCLENBQUM7QUFBQSxRQUMzQixPQUFPLEtBQUssa0JBQWtCLENBQUM7QUFBQSxRQUMvQixVQUFVLGVBQWUsQ0FBQztBQUFBLE1BQzNCLEVBQUU7QUFBQSxNQUNGLHNCQUFzQixNQUFNLEtBQUs7QUFBQSxNQUNqQyxzQkFBc0IsQ0FBQyxjQUFnRDtBQUN0RSxhQUFLLHFCQUFxQjtBQUMxQixxQ0FBNkIsS0FBSyxTQUFTO0FBQUEsTUFDNUM7QUFBQSxNQUNBLDhCQUE4Qiw2QkFBNkI7QUFBQSxNQUMzRCx1QkFBdUIsc0JBQXNCO0FBQUEsTUFDN0MsbUJBQW1CO0FBQUEsSUFDcEIsSUFBSTtBQUVKLFNBQUssYUFBYSxLQUFLLG1CQUFtQixJQUFJLDJCQUEyQjtBQUFBLE1BQ3hFO0FBQUEsTUFDQSxrQkFBa0I7QUFBQTtBQUFBLE1BRWxCLENBQUM7QUFBQTtBQUFBLE1BQ0Q7QUFBQSxRQUNDLFlBQVksVUFBUSxTQUFTLGFBQWE7QUFBQSxRQUMxQyxpQkFBaUI7QUFBQSxRQUNqQix3QkFBd0I7QUFBQSxRQUN4QixrQkFBa0I7QUFBQSxRQUNsQixpQkFBaUI7QUFBQSxVQUNoQiwwQkFBMEIsTUFBTTtBQUFBLFVBQ2hDLHFDQUFxQztBQUFBLFVBQ3JDLG1DQUFtQyxVQUFRLFNBQVMsYUFBYTtBQUFBLFFBQ2xFO0FBQUEsUUFDQTtBQUFBLFFBQ0EsdUJBQXVCO0FBQUEsUUFDdkIsa0JBQWtCO0FBQUEsUUFDbEIsdUJBQXVCO0FBQUEsUUFDdkI7QUFBQSxRQUNBO0FBQUEsUUFDQSxlQUFlLEtBQUssb0JBQW9CLENBQUMsT0FBTyxTQUFTLEtBQUssMEJBQTBCLE9BQU8sSUFBSSxJQUFJO0FBQUEsTUFDeEc7QUFBQSxNQUNBO0FBQUEsUUFDQyxnQkFBZ0I7QUFBQSxRQUNoQixnQkFBZ0I7QUFBQSxRQUNoQixtQkFBbUI7QUFBQSxRQUNuQix1QkFBdUI7QUFBQSxRQUN2Qix3QkFBd0I7QUFBQSxNQUN6QjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssV0FBVyxPQUFPLG1CQUFtQjtBQUMxQyxTQUFLLFdBQVcsV0FBVyxJQUFJO0FBRy9CLFNBQUssbUJBQW1CLElBQUksNkJBQTZCLFVBQVUsbUJBQW1CLEdBQUcsTUFBTTtBQUM5RixXQUFLLGlCQUFpQjtBQUFBLElBQ3ZCLENBQUMsQ0FBQztBQUlGLFNBQUssZUFBZSxLQUFLLFlBQVkscUJBQXFCLGtCQUFrQixJQUFJO0FBQ2hGLFNBQUssbUJBQW1CLElBQUksS0FBSyxZQUFZO0FBQzdDLFFBQUksS0FBSyxhQUFhLFFBQVE7QUFDN0IsV0FBSyxXQUFXLFNBQVMsS0FBSyxhQUFhLE1BQU07QUFBQSxJQUNsRDtBQUlBLFNBQUssbUJBQW1CLElBQUksc0JBQXNCLHFCQUFxQixhQUFhLE1BQU07QUFDekYsV0FBSyxZQUFZLFdBQVc7QUFBQSxJQUM3QixDQUFDLENBQUM7QUFHRixTQUFLLG1CQUFtQixJQUFJLEtBQUssWUFBWSxtQkFBbUIsQ0FBQyxFQUFFLG9CQUFvQixNQUFNO0FBQzVGLFVBQUksS0FBSyxjQUFjLFFBQVEsZ0JBQWdCLFNBQVMsTUFBTSxvQkFBb0IsU0FBUyxHQUFHO0FBRTdGLGNBQU0sT0FBTyxLQUFLLFlBQVksTUFBTSxlQUFlLElBQUksRUFBRSxLQUFLLElBQUksS0FBSztBQUN2RSxhQUFLLGlCQUFpQjtBQUFBLFVBQ3JCO0FBQUEsVUFDQTtBQUFBLFlBQ0M7QUFBQSxZQUNBLFVBQVUsS0FBSztBQUFBLFlBQ2YsZUFBZSxLQUFLO0FBQUEsWUFDcEIseUJBQXlCLEtBQUssdUJBQXVCO0FBQUEsVUFDdEQ7QUFBQSxRQUNEO0FBRUEsYUFBSyxZQUFZO0FBQ2pCLGFBQUssa0JBQWtCLG1CQUFtQjtBQUFBLE1BQzNDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFHRixTQUFLLGlCQUFpQjtBQUFBLEVBQ3ZCO0FBQUEsRUFFUSxrQkFBa0IsV0FBcUQ7QUFDOUUsUUFBSSxlQUFlLFNBQVMsR0FBRztBQUM5QixhQUFPLFVBQVUsU0FBUyxTQUFTLFVBQVUsU0FBUztBQUFBLElBQ3ZELFdBQVcsa0JBQWtCLFNBQVMsR0FBRztBQUN4QyxhQUFPLFVBQVUsU0FBUyxTQUFTLFVBQVUsVUFBVSxVQUFVO0FBQUEsSUFDbEU7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsZ0JBQWdCLFdBQWtEO0FBQ3pFLFFBQUksZUFBZSxTQUFTLEdBQUc7QUFDOUIsYUFBTyxVQUFVO0FBQUEsSUFDbEIsV0FBVyxrQkFBa0IsU0FBUyxHQUFHO0FBQ3hDLGFBQU8sVUFBVSxVQUFVO0FBQUEsSUFDNUI7QUFDQSxVQUFNLElBQUksTUFBTSx3QkFBd0I7QUFBQSxFQUN6QztBQUFBLEVBRUEsTUFBYywwQkFBMEIsT0FBZSxNQUFzQztBQUU1RixRQUFJLENBQUMsS0FBSyxvQkFBb0I7QUFDN0IsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLENBQUMsTUFBTSxLQUFLLEdBQUc7QUFDbEIsYUFBTztBQUFBLElBQ1I7QUFHQSxVQUFNLGNBQWM7QUFBQSxNQUNuQjtBQUFBLE1BQ0E7QUFBQSxNQUNBLFdBQVcsS0FBSyxJQUFJO0FBQUEsSUFDckI7QUFDQSxTQUFLLGVBQWU7QUFBQSxNQUNuQjtBQUFBLE1BQ0EsS0FBSyxVQUFVLFdBQVc7QUFBQSxNQUMxQixhQUFhO0FBQUEsTUFDYixjQUFjO0FBQUEsSUFDZjtBQUdBLFVBQU0sWUFBWSxLQUFLLHlCQUF5QixLQUFLLE9BQ3BELEtBQUssZ0JBQWdCLENBQUMsRUFBRSxTQUFTLE1BQU0sS0FBSyxvQkFBb0IsSUFBSSxTQUFTLENBQUM7QUFFL0UsUUFBSSxXQUFXO0FBQ2QsVUFBSTtBQUNILFlBQUksZUFBZSxTQUFTLEdBQUc7QUFDOUIsZ0JBQU0sS0FBSyxZQUFZLFdBQVcsQ0FBQyxFQUFFLFdBQVcsVUFBVSxVQUFVLENBQUMsQ0FBQztBQUFBLFFBQ3ZFLFdBQVcsa0JBQWtCLFNBQVMsR0FBRztBQUN4QyxnQkFBTSxLQUFLLFlBQVksV0FBVyxDQUFDLEVBQUUsY0FBYyxVQUFVLFVBQVUsV0FBVyxDQUFDLENBQUM7QUFBQSxRQUNyRjtBQUNBLGVBQU87QUFBQSxNQUNSLFNBQVMsR0FBRztBQUFBLE1BRVo7QUFBQSxJQUNEO0FBQ0EsU0FBSyxlQUFlLE9BQU8sMkJBQTJCLGFBQWEsV0FBVztBQUM5RSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSxtQkFBeUI7QUFDaEMsVUFBTSxjQUFjLEtBQUssZUFBZSxJQUFJLDJCQUEyQixhQUFhLFdBQVc7QUFDL0YsUUFBSSxhQUFhO0FBRWhCLFdBQUssZUFBZSxPQUFPLDJCQUEyQixhQUFhLFdBQVc7QUFDOUUsVUFBSTtBQUNILGNBQU0sRUFBRSxPQUFPLE1BQU0sVUFBVSxJQUFJLEtBQUssTUFBTSxXQUFXO0FBRXpELFlBQUksYUFBYSxLQUFLLElBQUksSUFBSSxZQUFZLEtBQUssS0FBTTtBQUNwRDtBQUFBLFFBQ0Q7QUFDQSxZQUFJLFNBQVMsS0FBSyxZQUFZO0FBQzdCLGVBQUssV0FBVyxTQUFTLEtBQUs7QUFBQSxRQUMvQjtBQUNBLFlBQUksU0FBUyxVQUFhLEtBQUssWUFBWTtBQUMxQyxlQUFLLFdBQVcsTUFBTSxZQUFZLE1BQU0sS0FBSztBQUFBLFFBQzlDO0FBRUEsYUFBSyxZQUFZLFdBQVc7QUFBQSxNQUM3QixRQUFRO0FBQUEsTUFFUjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSx1QkFBdUIsV0FBOEI7QUFFNUQsU0FBSywyQkFBMkIsTUFBTTtBQUN0QyxTQUFLLGtCQUFrQjtBQUV2QixVQUFNLFdBQVcsS0FBSyxxQkFBcUIsTUFBTSxTQUFTLE9BQU8sT0FBSyxDQUFDLEVBQUUsV0FBVyxDQUFDO0FBRXJGLFFBQUksU0FBUyxTQUFTLEdBQUc7QUFDeEIsV0FBSyxrQkFBa0IsV0FBVyxRQUFRO0FBQUEsSUFDM0MsT0FBTztBQUNOLFdBQUssa0JBQWtCLFNBQVM7QUFBQSxJQUNqQztBQUFBLEVBQ0Q7QUFBQSxFQUdRLGtCQUFrQixXQUF3QixXQUFrQztBQUVuRixTQUFLLDJCQUEyQixPQUFPLFdBQVcsRUFBRSxvQ0FBb0MsQ0FBQztBQUN6RixVQUFNLFVBQXdDO0FBQUEsTUFDN0MsZ0JBQWdCLGNBQWM7QUFBQSxRQUM3QixnQkFBZ0I7QUFBQSxNQUNqQixDQUFDO0FBQUEsTUFDRCxRQUFRLEtBQUssMkJBQTJCLElBQUksS0FBSyxxQkFBcUIsZUFBZSxxQkFBcUI7QUFBQSxRQUN6RyxjQUFjLE1BQU07QUFBQSxRQUNwQixpQkFBaUIsQ0FBQyxZQUFZLFFBQVEsV0FBVyxJQUFJLE9BQU87QUFBQSxNQUM3RCxDQUFDLENBQUM7QUFBQSxNQUNGLGtCQUFrQixNQUFNLGNBQWM7QUFBQSxNQUN0QywwQkFBMEIsTUFBTTtBQUFBLE1BQ2hDLFFBQVE7QUFBQSxNQUNSLFlBQVksMEJBQTBCO0FBQUEsTUFDdEMsZUFBZSwwQkFBMEI7QUFBQSxNQUN6QyxxQkFBcUIsTUFBTTtBQUMxQixjQUFNLHNCQUFzQixLQUFLLHFCQUFxQixTQUFrQixrQkFBa0IsNkJBQTZCO0FBQ3ZILFlBQUksQ0FBQyxxQkFBcUI7QUFDekIsZUFBSyxZQUFZO0FBQ2pCLGVBQUssb0JBQW9CO0FBQUEsUUFDMUI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUVBLFNBQUssa0JBQWtCLEtBQUssMkJBQTJCLElBQUksS0FBSyxxQkFBcUI7QUFBQSxNQUNwRjtBQUFBLE1BQ0EsS0FBSztBQUFBLE1BQ0w7QUFBQSxJQUNELENBQUM7QUFHRCxTQUFLLDJCQUEyQixJQUFJLEtBQUsscUJBQXFCLE1BQU0sYUFBYSxNQUFNO0FBQ3RGLFdBQUssc0JBQXNCO0FBQUEsSUFDNUIsQ0FBQyxDQUFDO0FBRUYsUUFBSSxLQUFLLHFCQUFxQixNQUFNLFVBQVU7QUFDN0MsV0FBSyxzQkFBc0I7QUFBQSxJQUM1QjtBQUdBLFNBQUssMkJBQTJCLElBQUksNkJBQTZCLFVBQVUsS0FBSyx3QkFBd0IsR0FBRyxNQUFNO0FBQ2hILFdBQUssc0JBQXNCO0FBQUEsSUFDNUIsQ0FBQyxDQUFDO0FBR0YsUUFBSSxvQkFBb0IsS0FBSyxzQkFBc0IsR0FBRztBQUNyRCxZQUFNLGVBQWU7QUFBQSxRQUNwQjtBQUFBLFVBQ0MsVUFBVTtBQUFBLFVBQ1YsUUFBUTtBQUFBLFVBQ1IsT0FBTyxTQUFTLG1CQUFtQixtQkFBbUI7QUFBQSxVQUN0RCxlQUFlLE1BQU07QUFBRSxpQkFBSyxZQUFZO0FBQUEsVUFBbUI7QUFBQSxRQUM1RDtBQUFBLFFBQ0EsS0FBSztBQUFBLFFBQ0wsS0FBSztBQUFBLE1BQ047QUFDQSxXQUFLLDJCQUEyQixJQUFJLGFBQWEsV0FBVztBQUM1RCxhQUFPLFdBQVcsYUFBYSxPQUFPO0FBQUEsSUFDdkM7QUFBQSxFQUNEO0FBQUEsRUFFUSxrQkFBa0IsV0FBOEI7QUFDdkQsVUFBTSxxQkFBcUIsS0FBSyxhQUFhO0FBQUEsTUFBTyxPQUNuRCxDQUFDLEVBQUUsUUFBUSxLQUFLLGVBQWUsb0JBQW9CLEVBQUUsSUFBSTtBQUFBLElBQzFELEVBQUUsTUFBTSxHQUFHLGdCQUFnQjtBQUUzQixRQUFJLG1CQUFtQixXQUFXLEdBQUc7QUFDcEM7QUFBQSxJQUNEO0FBRUEsUUFBSSxlQUFlO0FBRW5CLFVBQU0sT0FBTyxPQUFPLFdBQVcsRUFBRSx1Q0FBdUMsQ0FBQztBQUd6RSxVQUFNLGdCQUFnQixPQUFPLE1BQU0sRUFBRSw0Q0FBNEMsQ0FBQztBQUdsRixVQUFNLFVBQVUsT0FBTyxNQUFNLEVBQUUsK0NBQStDLENBQUM7QUFDL0UsVUFBTSxRQUFRLE9BQU8sU0FBUyxFQUFFLDZDQUE2QyxDQUFDO0FBQzlFLFVBQU0sT0FBTyxPQUFPLFNBQVMsRUFBRSxtREFBbUQsQ0FBQztBQUduRixVQUFNLGVBQWUsT0FBTyxNQUFNLEVBQUUsMkNBQTJDLENBQUM7QUFDaEYsVUFBTSxhQUFhLE9BQU8sY0FBYyxFQUFFLG1CQUFtQixDQUFDO0FBQzlELGVBQVcsWUFBWSxXQUFXLFFBQVEsV0FBVyxDQUFDO0FBQ3RELGVBQVcsUUFBUSxTQUFTLHVCQUF1QixVQUFVO0FBRTdELFVBQU0sYUFBYSxPQUFPLGNBQWMsRUFBRSxtQkFBbUIsQ0FBQztBQUM5RCxlQUFXLFlBQVksV0FBVyxRQUFRLFlBQVksQ0FBQztBQUN2RCxlQUFXLFFBQVEsU0FBUyxtQkFBbUIsTUFBTTtBQUVyRCxVQUFNLGdCQUFnQixNQUFNO0FBQzNCLFlBQU0sY0FBYyxtQkFBbUIsWUFBWTtBQUduRCxnQkFBVSxhQUFhO0FBQ3ZCLFVBQUksWUFBWSxLQUFLLFNBQVMsUUFBUTtBQUNyQyxzQkFBYyxZQUFZLFdBQVcsWUFBWSxLQUFLLElBQUksQ0FBQztBQUFBLE1BQzVEO0FBR0EsWUFBTSxjQUFjLFlBQVk7QUFDaEMsV0FBSyxjQUFjLFlBQVksZUFBZTtBQUc5QyxpQkFBVyxXQUFXLGlCQUFpQjtBQUN2QyxpQkFBVyxXQUFXLGlCQUFpQixtQkFBbUIsU0FBUztBQUFBLElBQ3BFO0FBR0Esa0JBQWM7QUFFZCxTQUFLLFVBQVUsTUFBTTtBQUNwQixZQUFNLGNBQWMsbUJBQW1CLFlBQVk7QUFDbkQsV0FBSyxpQkFBaUI7QUFBQSxRQUNyQjtBQUFBLFFBQ0EsRUFBRSxhQUFhLDRCQUE0QixRQUFRLG1CQUFtQixVQUFVLFlBQVksR0FBRztBQUFBLE1BQ2hHO0FBRUEsWUFBTSxVQUF1QztBQUFBLFFBQzVDLGtCQUFrQixZQUFZO0FBQUEsUUFDOUIsaUJBQWlCLHlCQUF5QjtBQUFBLE1BQzNDO0FBQ0EsV0FBSyxjQUFjLFdBQVc7QUFBQSxRQUM3QixVQUFVLG9CQUFvQjtBQUFBLFFBQzlCO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRjtBQUVBLGVBQVcsVUFBVSxDQUFDLE1BQU07QUFDM0IsUUFBRSxnQkFBZ0I7QUFDbEIsVUFBSSxlQUFlLEdBQUc7QUFDckI7QUFDQSxzQkFBYztBQUFBLE1BQ2Y7QUFBQSxJQUNEO0FBRUEsZUFBVyxVQUFVLENBQUMsTUFBTTtBQUMzQixRQUFFLGdCQUFnQjtBQUNsQixVQUFJLGVBQWUsbUJBQW1CLFNBQVMsR0FBRztBQUNqRDtBQUNBLHNCQUFjO0FBQUEsTUFDZjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFJUSxtQkFBbUIsV0FBOEI7QUFFeEQsUUFBSSxDQUFDLEtBQUssdUJBQXVCLFdBQVc7QUFDM0M7QUFBQSxJQUNEO0FBR0EsUUFBSSxLQUFLLGVBQWUsV0FBVyx5QkFBeUIsOEJBQThCLGFBQWEsYUFBYSxLQUFLLEdBQUc7QUFDM0g7QUFBQSxJQUNEO0FBRUEsVUFBTSxZQUFZLEtBQUssZUFBZSxrQkFBa0I7QUFDeEQsUUFBSSxDQUFDLGFBQWEsQ0FBQyxVQUFVLFdBQVcsQ0FBQyxLQUFLLGVBQWUsa0JBQWtCLHFCQUFxQixDQUFDLEtBQUssZUFBZSxrQkFBa0IscUJBQXFCO0FBQy9KO0FBQUEsSUFDRDtBQUVBLFVBQU0sVUFBVSxPQUFPLFdBQVcsRUFBRSxvRUFBb0UsQ0FBQztBQUV6RyxVQUFNLGdCQUFnQixNQUFNO0FBQzNCLFdBQUssZUFBZSxNQUFNLHlCQUF5Qiw4QkFBOEIsTUFBTSxhQUFhLGFBQWEsY0FBYyxJQUFJO0FBQ25JLGNBQVEsT0FBTztBQUFBLElBQ2hCO0FBR0EsU0FBSyxtQkFBbUIsSUFBSSxLQUFLLFlBQVksbUJBQW1CLE1BQU0sY0FBYyxDQUFDLENBQUM7QUFHdEYsVUFBTSxnQkFBZ0IsT0FBTyxTQUFTLEVBQUUsNENBQTRDLENBQUM7QUFDckYsa0JBQWMsWUFBWSxXQUFXLFFBQVEsV0FBVyxDQUFDO0FBR3pELFVBQU0sVUFBVSxPQUFPLFNBQVMsRUFBRSwrQ0FBK0MsQ0FBQztBQUNsRixVQUFNLFFBQVEsT0FBTyxTQUFTLEVBQUUsNkNBQTZDLENBQUM7QUFDOUUsVUFBTSxjQUFjLFNBQVMsWUFBWSxtREFBbUQ7QUFFNUYsVUFBTSxPQUFPLE9BQU8sU0FBUyxFQUFFLG1EQUFtRCxDQUFDO0FBQ25GLFVBQU0sc0JBQXNCLElBQUk7QUFBQSxNQUMvQjtBQUFBLFFBQ0MsRUFBRSxLQUFLLGtCQUFrQixTQUFTLENBQUMscUJBQXFCLG1CQUFtQixFQUFFO0FBQUEsUUFDN0U7QUFBQSxRQUNBLFVBQVUsUUFBUTtBQUFBLFFBQ2xCLEtBQUssZUFBZSxpQkFBaUI7QUFBQSxRQUNyQyxLQUFLLGVBQWUsaUJBQWlCO0FBQUEsTUFDdEM7QUFBQSxNQUNBLEVBQUUsV0FBVyxLQUFLO0FBQUEsSUFDbkI7QUFDQSxVQUFNLG1CQUFtQixLQUFLLHdCQUF3QixPQUFPLG1CQUFtQjtBQUNoRixTQUFLLFlBQVksaUJBQWlCLE9BQU87QUFHekMsVUFBTSxnQkFBZ0IsT0FBTyxTQUFTLEVBQUUsNkNBQTZDLENBQUM7QUFDdEYsa0JBQWMsWUFBWSxXQUFXLFFBQVEsS0FBSyxDQUFDO0FBQ25ELGtCQUFjLFFBQVEsU0FBUyx3QkFBd0IsU0FBUztBQUNoRSxrQkFBYyxVQUFVLENBQUMsTUFBTTtBQUM5QixRQUFFLGdCQUFnQjtBQUNsQixvQkFBYztBQUFBLElBQ2Y7QUFBQSxFQUNEO0FBQUEsRUFFUSxZQUFZLFdBQThCO0FBRWpELFNBQUssbUJBQW1CLFNBQVM7QUFHakMsVUFBTSx5QkFBeUIsT0FBTyxXQUFXLEVBQUUscUNBQXFDLENBQUM7QUFDekYsVUFBTSx3QkFBd0IsS0FBSyxtQkFBbUIsSUFBSSxJQUFJLE9BQU87QUFBQSxNQUNwRSxNQUFNLFFBQVE7QUFBQSxNQUNkLGlCQUFpQjtBQUFBLE1BQ2pCLFdBQVcsS0FBSyxxQkFBcUIsU0FBUyxnQkFBZ0IsTUFBTTtBQUFBLE1BQ3BFLE9BQU8sU0FBUyxpQkFBaUIsbURBQW1EO0FBQUEsTUFDcEYsR0FBRyxnQkFBZ0I7QUFBQSxRQUNsQiw2QkFBNkI7QUFBQSxRQUM3Qiw2QkFBNkI7QUFBQSxRQUM3Qix5QkFBeUI7QUFBQSxNQUMxQixDQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFDRiwwQkFBc0IsUUFBUSxLQUFLO0FBQ25DLFVBQU0scUJBQXFCLEVBQUUsaUJBQWlCLEVBQUUsS0FBSyxnQkFBZ0IsR0FBRyxTQUFTLGlCQUFpQiw4QkFBOEIsQ0FBQztBQUVqSSxVQUFNLHlCQUF5QixNQUFNO0FBQ3BDLFVBQUksc0JBQXNCLFNBQVM7QUFDbEMsYUFBSyxxQkFBcUIsWUFBWSxrQkFBa0IsMEJBQTBCO0FBQUEsTUFDbkYsT0FBTztBQUNOLGFBQUsscUJBQXFCLFlBQVksa0JBQWtCLE1BQU07QUFBQSxNQUMvRDtBQUFBLElBQ0Q7QUFFQSxTQUFLLG1CQUFtQixJQUFJLHNCQUFzQixTQUFTLE1BQU0sdUJBQXVCLENBQUMsQ0FBQztBQUMxRixTQUFLLG1CQUFtQixJQUFJLHNCQUFzQixvQkFBb0IsU0FBUyxNQUFNO0FBQ3BGLDRCQUFzQixVQUFVLENBQUMsc0JBQXNCO0FBQ3ZELDZCQUF1QjtBQUFBLElBQ3hCLENBQUMsQ0FBQztBQUVGLDJCQUF1QixZQUFZLHNCQUFzQixPQUFPO0FBQ2hFLDJCQUF1QixZQUFZLGtCQUFrQjtBQUFBLEVBQ3REO0FBQUEsRUFJUyxPQUFPLFdBQTRCO0FBQzNDLFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUssVUFBVSxNQUFNLFNBQVMsR0FBRyxVQUFVLE1BQU07QUFDakQsU0FBSyxVQUFVLE1BQU0sUUFBUSxHQUFHLFVBQVUsS0FBSztBQUMvQyxTQUFLLFVBQVUsVUFBVSxPQUFPLHNCQUFzQixVQUFVLFVBQVUsc0JBQXNCO0FBR2hHLFNBQUssaUJBQWlCO0FBR3RCLFNBQUssc0JBQXNCO0FBRTNCLFNBQUssbUJBQW1CLFlBQVk7QUFBQSxFQUNyQztBQUFBLEVBRVEsbUJBQXlCO0FBQ2hDLFFBQUksQ0FBQyxLQUFLLGNBQWMsQ0FBQyxLQUFLLGVBQWU7QUFDNUM7QUFBQSxJQUNEO0FBRUEsVUFBTSxZQUFZLEtBQUssSUFBSSxLQUFLLEtBQUssY0FBYyxRQUFRLEVBQUU7QUFDN0QsU0FBSyxXQUFXLDhCQUE4QixzQ0FBc0M7QUFDcEYsU0FBSyxXQUFXLE9BQU8sa0NBQWtDLFNBQVM7QUFBQSxFQUNuRTtBQUFBLEVBRVEsd0JBQThCO0FBQ3JDLFFBQUksQ0FBQyxLQUFLLG1CQUFtQixDQUFDLEtBQUssNEJBQTRCLENBQUMsS0FBSyxlQUFlO0FBQ25GO0FBQUEsSUFDRDtBQUdBLFVBQU0sZ0JBQWdCLEtBQUssSUFBSSxLQUFLLEtBQUssY0FBYyxRQUFRLEVBQUU7QUFLakUsVUFBTSxrQkFBa0IsS0FBSztBQUFBLE1BQzVCLEtBQUsscUJBQXFCLE1BQU0sU0FBUyxPQUFPLE9BQUssQ0FBQyxFQUFFLFdBQVcsQ0FBQyxFQUFFO0FBQUEsTUFDdEU7QUFBQSxJQUNEO0FBQ0EsVUFBTSxpQkFBaUIsa0JBQWtCLDBCQUEwQjtBQUNuRSxTQUFLLGdCQUFnQixPQUFPLGdCQUFnQixhQUFhO0FBSXpELFVBQU0sZUFBZSxLQUFLLE1BQU0sa0JBQWtCLENBQUMsSUFBSSwwQkFBMEI7QUFDakYsU0FBSyxnQkFBZ0IsUUFBUyxNQUFNLGVBQWUsSUFBSSxZQUFZO0FBQUEsRUFDcEU7QUFBQSxFQUVTLFFBQWM7QUFDdEIsVUFBTSxNQUFNO0FBQ1osU0FBSyxZQUFZLFdBQVc7QUFBQSxFQUM3QjtBQUFBLEVBRUEsTUFBYyxzQkFBcUM7QUFDbEQsUUFBSTtBQUNILFlBQU0sS0FBSyxtQ0FBbUM7QUFBQSxJQUMvQyxTQUFTLE9BQU87QUFDZixXQUFLLFdBQVcsTUFBTSxzQ0FBc0MsZUFBZSxLQUFLLENBQUM7QUFBQSxJQUNsRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsa0JBQWtCLGlCQUFxQztBQUNwRSxRQUFJO0FBQ0gsWUFBTSxLQUFLLG1DQUFtQyxlQUFlO0FBQUEsSUFDOUQsU0FBUyxPQUFPO0FBQ2YsV0FBSyxXQUFXLE1BQU0scUNBQXFDLGVBQWUsS0FBSyxDQUFDO0FBQUEsSUFDakY7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLG1DQUFtQyxpQkFBc0M7QUFDdEYsVUFBTSxnQkFBZ0IsS0FBSyxTQUFTLEtBQUs7QUFFekMsUUFBSSxpQkFBaUIsS0FBSyxNQUFNLFNBQVMsYUFBYSxHQUFHO0FBRXhELFlBQU0sSUFBSSxRQUFjLGFBQVc7QUFDbEMsY0FBTSxhQUFhLEtBQUssTUFBTSx3QkFBd0IsT0FBSztBQUMxRCxxQkFBVyxRQUFRO0FBQ25CLGtCQUFRO0FBQUEsUUFDVCxDQUFDO0FBRUQsYUFBSyxNQUFNLFlBQVksYUFBYTtBQUFBLE1BQ3JDLENBQUM7QUFBQSxJQUNGO0FBRUEsUUFBSSxpQkFBaUI7QUFDcEIsWUFBTSxLQUFLLGtCQUFrQixZQUFZLGVBQWU7QUFBQSxJQUN6RCxPQUFPO0FBQ04sWUFBTSxLQUFLLGVBQWUsZUFBZSw0QkFBNEI7QUFBQSxJQUN0RTtBQUNBLFVBQU0sbUJBQW1CLEtBQUssc0JBQXNCLG9CQUFvQixVQUFVO0FBQ2xGLFFBQUkscUJBQXFCLHNCQUFzQixjQUFjO0FBQzVELFdBQUssY0FBYyx5QkFBeUIsSUFBSTtBQUFBLElBQ2pEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyw0QkFBNEIsY0FBdUIsT0FBeUQ7QUFDekgsVUFBTSxhQUFhLE1BQU0sS0FBSyxrQkFBa0Isa0JBQWtCO0FBQ2xFLFVBQU0sb0JBQW9CLFdBQVcsV0FBVyxJQUFJLE9BQU0sT0FBTTtBQUMvRCxZQUFNLE1BQU0sa0JBQWtCLEVBQUUsSUFBSSxHQUFHLFVBQVUsYUFBYSxHQUFHO0FBQ2pFLFlBQU0sWUFBWSxNQUFNLEtBQUssZ0NBQWdDLGdCQUFnQixHQUFHO0FBQ2hGLGFBQU8sRUFBRSxXQUFXLElBQUksU0FBUyxVQUFVLFFBQVE7QUFBQSxJQUNwRCxDQUFDO0FBQ0QsVUFBTSxtQkFBbUIsTUFBTSxRQUFRLElBQUksaUJBQWlCO0FBQzVELFVBQU0scUJBQXFCLGlCQUN6QixPQUFPLFlBQVUsY0FBYyxPQUFPLFVBQVUsSUFBSSxFQUNwRCxJQUFJLFlBQVUsT0FBTyxTQUFTO0FBQ2hDLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFueEJhLHlCQUVJLEtBQUs7QUFGVCx5QkFHSSxhQUFhO0FBSGpCLHlCQWlrQlksK0JBQStCO0FBamtCM0MsMkJBQU47QUFBQSxFQTZCSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBbERVO0FBcXhCTixNQUFNLG9DQUFpRTtBQUFBLEVBQzdFLGFBQWEsYUFBaUQ7QUFDN0QsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFVBQVUsYUFBZ0Q7QUFDekQsV0FBTyxLQUFLLFVBQVUsQ0FBQyxDQUFDO0FBQUEsRUFDekI7QUFBQSxFQUVBLFlBQVksc0JBQTZDLHVCQUEwRDtBQUNsSCxXQUFPLElBQUksMEJBQTBCLENBQUMsQ0FBQztBQUFBLEVBQ3hDO0FBQ0Q7IiwKICAibmFtZXMiOiBbXQp9Cg==
