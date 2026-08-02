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
import * as dom from "../../../../../base/browser/dom.js";
import { BaseActionViewItem } from "../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { Event } from "../../../../../base/common/event.js";
import { Lazy } from "../../../../../base/common/lazy.js";
import { Disposable, DisposableStore, markAsSingleton, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import Severity from "../../../../../base/common/severity.js";
import { equalsIgnoreCase } from "../../../../../base/common/strings.js";
import { URI } from "../../../../../base/common/uri.js";
import { ICodeEditorService } from "../../../../../editor/browser/services/codeEditorService.js";
import { EditorContextKeys } from "../../../../../editor/common/editorContextKeys.js";
import { localize, localize2 } from "../../../../../nls.js";
import { IActionViewItemService } from "../../../../../platform/actions/browser/actionViewItemService.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { CommandsRegistry, ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IsWebContext } from "../../../../../platform/contextkey/common/contextkeys.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { IMarkerService } from "../../../../../platform/markers/common/markers.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import product from "../../../../../platform/product/common/product.js";
import { GitHubPaths, IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { ToggleTitleBarConfigAction } from "../../../../browser/parts/titlebar/titlebarActions.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../common/views.js";
import { ChatEntitlement, ChatEntitlementContextKeys, IChatEntitlementService, isProUser } from "../../../../services/chat/common/chatEntitlementService.js";
import { EnablementState, IWorkbenchExtensionEnablementService } from "../../../../services/extensionManagement/common/extensionManagement.js";
import { ExtensionUrlHandlerOverrideRegistry } from "../../../../services/extensions/browser/extensionUrlHandler.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { CONTEXT_DEFAULT_ACCOUNT_STATE, DefaultAccountStatus } from "../../../../services/accounts/browser/defaultAccount.js";
import { IHostService } from "../../../../services/host/browser/host.js";
import { IWorkbenchLayoutService, Parts } from "../../../../services/layout/browser/layoutService.js";
import { InEditorZenModeContext } from "../../../../common/contextkeys.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
import { IExtensionsWorkbenchService } from "../../../extensions/common/extensions.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { IChatSessionsService } from "../../common/chatSessionsService.js";
import { ChatAIDisabledSettingId, ChatAgentLocation, ChatConfiguration, ChatModeKind } from "../../common/constants.js";
import { CHAT_CATEGORY, CHAT_SETUP_ACTION_ID, CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID } from "../actions/chatActions.js";
import { ChatViewContainerId, IChatWidgetService } from "../chat.js";
import { ChatInputNotificationSeverity, IChatInputNotificationService } from "../widget/input/chatInputNotificationService.js";
import { chatViewsWelcomeRegistry } from "../viewsWelcome/chatViewsWelcome.js";
import { buildUpgradeUrlWithRedirect, ChatSetupAnonymous, refreshTokens } from "./chatSetup.js";
import { ChatSetupController } from "./chatSetupController.js";
import { GrowthSessionController, registerGrowthSession } from "./chatSetupGrowthSession.js";
import { AICodeActionsHelper, AINewSymbolNamesProvider, ChatCodeActionsProvider, SetupAgent } from "./chatSetupProviders.js";
import { ChatSetup } from "./chatSetupRunner.js";
const defaultChat = {
  chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? ""
};
const SIGN_IN_TITLE_BAR_ACTION_ID = "workbench.action.chat.signInIndicator";
let ChatSetupContribution = class extends Disposable {
  constructor(actionViewItemService, instantiationService, chatEntitlementService, logService, contextKeyService, extensionEnablementService, extensionsWorkbenchService, extensionService, environmentService, chatSessionsService, configurationService) {
    super();
    this.instantiationService = instantiationService;
    this.logService = logService;
    this.contextKeyService = contextKeyService;
    this.extensionEnablementService = extensionEnablementService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionService = extensionService;
    this.environmentService = environmentService;
    this.chatSessionsService = chatSessionsService;
    this.configurationService = configurationService;
    const context = chatEntitlementService.context?.value;
    const requests = chatEntitlementService.requests?.value;
    if (!context || !requests) {
      return;
    }
    const controller = new Lazy(() => this._register(this.instantiationService.createInstance(ChatSetupController, context, requests)));
    this.registerSetupAgents(context, controller);
    this.registerGrowthSession(chatEntitlementService);
    this.registerActions(context, requests, controller);
    this.registerSignInTitleBarEntry(actionViewItemService);
    this.registerUrlLinkHandler();
    this.checkExtensionInstallation(context);
  }
  registerSetupAgents(context, controller) {
    const defaultAgentDisposables = markAsSingleton(new MutableDisposable());
    const vscodeAgentDisposables = markAsSingleton(new MutableDisposable());
    const renameProviderDisposables = markAsSingleton(new MutableDisposable());
    const codeActionsProviderDisposables = markAsSingleton(new MutableDisposable());
    const updateRegistration = () => {
      {
        if (!context.state.hidden && !context.state.disabledInWorkspace) {
          if (!defaultAgentDisposables.value) {
            const disposables = defaultAgentDisposables.value = new DisposableStore();
            const panelAgentDisposables = disposables.add(new DisposableStore());
            for (const mode of [ChatModeKind.Ask, ChatModeKind.Edit, ChatModeKind.Agent]) {
              const { agent, disposable } = SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Chat, mode, context, controller);
              panelAgentDisposables.add(disposable);
              panelAgentDisposables.add(agent.onUnresolvableError(() => {
                const panelAgentHasGuidance = chatViewsWelcomeRegistry.get().some((descriptor) => this.contextKeyService.contextMatchesRules(descriptor.when));
                if (panelAgentHasGuidance) {
                  this.logService.error("[chat setup] Unresolvable error from Chat agent registration, clearing registration.");
                  panelAgentDisposables.dispose();
                }
              }));
            }
            disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Terminal, ChatModeKind.Ask, context, controller).disposable);
            disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.Notebook, ChatModeKind.Ask, context, controller).disposable);
            disposables.add(SetupAgent.registerDefaultAgents(this.instantiationService, ChatAgentLocation.EditorInline, ChatModeKind.Ask, context, controller).disposable);
          }
          if ((!context.state.completed || context.state.entitlement === ChatEntitlement.Unknown || context.state.entitlement === ChatEntitlement.Unresolved) && !vscodeAgentDisposables.value) {
            const disposables = vscodeAgentDisposables.value = new DisposableStore();
            disposables.add(SetupAgent.registerBuiltInAgents(this.instantiationService, context, controller));
          }
        } else {
          defaultAgentDisposables.clear();
          vscodeAgentDisposables.clear();
        }
        if (context.state.completed) {
          vscodeAgentDisposables.clear();
        }
      }
      {
        if (!context.state.completed && !context.state.hidden && !context.state.disabledInWorkspace) {
          if (!renameProviderDisposables.value) {
            renameProviderDisposables.value = AINewSymbolNamesProvider.registerProvider(this.instantiationService, context, controller);
          }
        } else {
          renameProviderDisposables.clear();
        }
      }
      {
        if (!context.state.completed && !context.state.hidden && !context.state.disabledInWorkspace) {
          if (!codeActionsProviderDisposables.value) {
            codeActionsProviderDisposables.value = ChatCodeActionsProvider.registerProvider(this.instantiationService);
          }
        } else {
          codeActionsProviderDisposables.clear();
        }
      }
    };
    this._register(Event.runAndSubscribe(context.onDidChange, () => updateRegistration()));
  }
  registerGrowthSession(chatEntitlementService) {
    const growthSessionDisposables = markAsSingleton(new MutableDisposable());
    const updateGrowthSession = () => {
      const experimentEnabled = this.configurationService.getValue(ChatConfiguration.GrowthNotificationEnabled) === true;
      const shouldShow = experimentEnabled && !chatEntitlementService.sentiment.completed;
      if (shouldShow && !growthSessionDisposables.value) {
        const disposables = new DisposableStore();
        const controller = disposables.add(this.instantiationService.createInstance(GrowthSessionController));
        if (!controller.isDismissed) {
          disposables.add(registerGrowthSession(this.chatSessionsService, controller));
          disposables.add(controller.onDidDismiss(() => {
            growthSessionDisposables.clear();
          }));
          growthSessionDisposables.value = disposables;
        } else {
          disposables.dispose();
        }
      } else if (!shouldShow) {
        growthSessionDisposables.clear();
      }
    };
    this._register(chatEntitlementService.onDidChangeSentiment(() => updateGrowthSession()));
    updateGrowthSession();
  }
  registerActions(context, requests, controller) {
    const _ChatSetupTriggerAction = class _ChatSetupTriggerAction extends Action2 {
      constructor() {
        super({
          id: CHAT_SETUP_ACTION_ID,
          title: _ChatSetupTriggerAction.CHAT_SETUP_ACTION_LABEL,
          category: CHAT_CATEGORY,
          f1: true,
          precondition: ContextKeyExpr.or(
            ChatContextKeys.Setup.hidden,
            ChatContextKeys.Setup.disabledInWorkspace,
            ChatContextKeys.Setup.untrusted,
            ChatContextKeys.Setup.completed.negate(),
            ChatContextKeys.Entitlement.canSignUp
          )
        });
      }
      async run(accessor, mode, options) {
        const widgetService = accessor.get(IChatWidgetService);
        const instantiationService = accessor.get(IInstantiationService);
        const dialogService = accessor.get(IDialogService);
        const commandService = accessor.get(ICommandService);
        const lifecycleService = accessor.get(ILifecycleService);
        const configurationService = accessor.get(IConfigurationService);
        await context.update({ hidden: false });
        configurationService.updateValue(ChatAIDisabledSettingId, false);
        if (mode) {
          const chatWidget = await widgetService.revealWidget();
          if (chatWidget) {
            const resolvedMode = this.resolveAgentId(mode, chatWidget);
            if (resolvedMode) {
              chatWidget.input.setChatMode(resolvedMode);
            }
          }
        }
        if (options?.inputValue) {
          const chatWidget = await widgetService.revealWidget();
          chatWidget?.input.showScrollbarUntilAccept();
          chatWidget?.setInput(options.inputValue);
        }
        const setup = ChatSetup.getInstance(instantiationService, context, controller);
        const result = await setup.run(options);
        if (options?.returnResult) {
          return result;
        }
        const { success } = result;
        if (success === false && !result.errorAlreadyHandled && !lifecycleService.willShutdown) {
          const { confirmed } = await dialogService.confirm({
            type: Severity.Error,
            message: localize("setupErrorDialog", "Chat setup failed. Would you like to try again?"),
            primaryButton: localize("retry", "Retry")
          });
          if (confirmed) {
            return Boolean(await commandService.executeCommand(CHAT_SETUP_ACTION_ID, mode, options));
          }
        }
        return Boolean(success);
      }
      resolveAgentId(agentParam, chatWidget) {
        const modes = chatWidget.input.currentChatModesObs.get();
        const foundAgent = modes.findModeById(agentParam);
        if (foundAgent) {
          return foundAgent.id;
        }
        const allAgents = [...modes.builtin, ...modes.custom];
        const nameLower = agentParam.toLowerCase();
        const agentByName = allAgents.find((agent) => agent.name.get().toLowerCase() === nameLower);
        return agentByName?.id;
      }
    };
    _ChatSetupTriggerAction.CHAT_SETUP_ACTION_LABEL = localize2("triggerChatSetup", "Use AI Features with Copilot for free...");
    let ChatSetupTriggerAction = _ChatSetupTriggerAction;
    class ChatSetupTriggerSupportAnonymousAction extends Action2 {
      constructor() {
        super({
          id: CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID,
          title: ChatSetupTriggerAction.CHAT_SETUP_ACTION_LABEL
        });
      }
      async run(accessor, options) {
        const commandService = accessor.get(ICommandService);
        const telemetryService = accessor.get(ITelemetryService);
        const chatEntitlementService = accessor.get(IChatEntitlementService);
        telemetryService.publicLog2("workbenchActionExecuted", { id: CHAT_SETUP_ACTION_ID, from: "api" });
        return commandService.executeCommand(CHAT_SETUP_ACTION_ID, void 0, {
          forceAnonymous: chatEntitlementService.anonymous ? ChatSetupAnonymous.EnabledWithDialog : void 0,
          ...options
        });
      }
    }
    class ChatSetupTriggerForceSignInDialogAction extends Action2 {
      constructor() {
        super({
          id: "workbench.action.chat.triggerSetupForceSignIn",
          title: localize2("forceSignIn", "Sign in to use GitHub Copilot")
        });
      }
      async run(accessor) {
        const commandService = accessor.get(ICommandService);
        const telemetryService = accessor.get(ITelemetryService);
        telemetryService.publicLog2("workbenchActionExecuted", { id: CHAT_SETUP_ACTION_ID, from: "api" });
        return commandService.executeCommand(CHAT_SETUP_ACTION_ID, void 0, { forceSignInDialog: true });
      }
    }
    class ChatSetupTriggerAnonymousWithoutDialogAction extends Action2 {
      constructor() {
        super({
          id: "workbench.action.chat.triggerSetupAnonymousWithoutDialog",
          title: ChatSetupTriggerAction.CHAT_SETUP_ACTION_LABEL
        });
      }
      async run(accessor) {
        const commandService = accessor.get(ICommandService);
        const telemetryService = accessor.get(ITelemetryService);
        telemetryService.publicLog2("workbenchActionExecuted", { id: CHAT_SETUP_ACTION_ID, from: "api" });
        return commandService.executeCommand(CHAT_SETUP_ACTION_ID, void 0, { forceAnonymous: ChatSetupAnonymous.EnabledWithoutDialog });
      }
    }
    class ChatSetupFromAccountsAction extends Action2 {
      constructor() {
        super({
          id: "workbench.action.chat.triggerSetupFromAccounts",
          title: localize2("triggerChatSetupFromAccounts", "Sign in to use GitHub Copilot..."),
          menu: {
            id: MenuId.AccountsContext,
            group: "2_copilot",
            when: ContextKeyExpr.and(
              ChatContextKeys.Setup.hidden.negate(),
              ChatContextKeys.Setup.disabledInWorkspace.negate(),
              CONTEXT_DEFAULT_ACCOUNT_STATE.notEqualsTo(DefaultAccountStatus.Available),
              // hide only when signed in (a default GitHub account is present); still shown while signed out or before the account state resolves, incl. untrusted workspaces — no auth prompt
              ChatContextKeys.Setup.completed.negate(),
              ChatContextKeys.Entitlement.signedOut
            )
          }
        });
      }
      async run(accessor) {
        const commandService = accessor.get(ICommandService);
        const telemetryService = accessor.get(ITelemetryService);
        telemetryService.publicLog2("workbenchActionExecuted", { id: CHAT_SETUP_ACTION_ID, from: "accounts" });
        return commandService.executeCommand(CHAT_SETUP_ACTION_ID);
      }
    }
    const _ChatSetupSignInTitleBarAction = class _ChatSetupSignInTitleBarAction extends Action2 {
      constructor() {
        super({
          id: _ChatSetupSignInTitleBarAction.ID,
          title: localize("signInIndicatorTitleBarAction", "Sign In"),
          f1: false,
          menu: [{
            id: MenuId.TitleBarAdjacentCenter,
            order: 0,
            // same position as the update button
            when: ContextKeyExpr.and(
              IsWebContext.negate(),
              ChatContextKeys.Entitlement.signedOut,
              CONTEXT_DEFAULT_ACCOUNT_STATE.notEqualsTo(DefaultAccountStatus.Available),
              // hide only when signed in (a default GitHub account is present); still shown while signed out or before the account state resolves, incl. untrusted workspaces — no auth prompt
              ChatEntitlementContextKeys.hasByokModels.negate(),
              ChatContextKeys.Setup.hidden.negate(),
              ChatContextKeys.Setup.disabledInWorkspace.negate(),
              ContextKeyExpr.equals(`config.${ChatConfiguration.TitleBarSignInEnabled}`, true),
              ContextKeyExpr.has("updateTitleBar").negate(),
              InEditorZenModeContext.negate()
            )
          }]
        });
      }
      async run(accessor) {
        const commandService = accessor.get(ICommandService);
        const telemetryService = accessor.get(ITelemetryService);
        telemetryService.publicLog2("workbenchActionExecuted", { id: CHAT_SETUP_ACTION_ID, from: "titlebar" });
        return commandService.executeCommand(CHAT_SETUP_ACTION_ID);
      }
    };
    _ChatSetupSignInTitleBarAction.ID = SIGN_IN_TITLE_BAR_ACTION_ID;
    let ChatSetupSignInTitleBarAction = _ChatSetupSignInTitleBarAction;
    class ToggleSignInTitleBarAction extends ToggleTitleBarConfigAction {
      constructor() {
        super(
          ChatConfiguration.TitleBarSignInEnabled,
          localize("toggle.chatSignIn", "Copilot Sign In"),
          localize("toggle.chatSignInDescription", "Toggle visibility of the Copilot Sign In button in title bar"),
          3,
          ContextKeyExpr.and(
            IsWebContext.negate(),
            ChatContextKeys.Entitlement.signedOut,
            ChatContextKeys.Setup.hidden.negate(),
            ChatContextKeys.Setup.disabledInWorkspace.negate()
          )
        );
      }
    }
    const windowFocusListener = this._register(new MutableDisposable());
    class UpgradePlanAction extends Action2 {
      constructor() {
        super({
          id: "workbench.action.chat.upgradePlan",
          title: localize2("managePlan", "Upgrade to GitHub Copilot Pro"),
          category: localize2("chat.category", "Chat"),
          f1: true,
          precondition: ContextKeyExpr.and(
            ChatContextKeys.Setup.hidden.negate(),
            ChatContextKeys.Setup.disabledInWorkspace.negate(),
            ContextKeyExpr.or(
              ChatContextKeys.Entitlement.canSignUp,
              ChatContextKeys.Entitlement.planFree
            )
          ),
          menu: {
            id: MenuId.ChatTitleBarMenu,
            group: "a_first",
            order: 1,
            when: ContextKeyExpr.and(
              ChatContextKeys.Entitlement.planFree,
              ContextKeyExpr.or(
                ChatContextKeys.chatQuotaExceeded,
                ChatContextKeys.completionsQuotaExceeded
              )
            )
          }
        });
      }
      async run(accessor) {
        const openerService = accessor.get(IOpenerService);
        const hostService = accessor.get(IHostService);
        const commandService = accessor.get(ICommandService);
        const telemetryService = accessor.get(ITelemetryService);
        const defaultAccountService = accessor.get(IDefaultAccountService);
        const productService = accessor.get(IProductService);
        telemetryService.publicLog2("workbenchActionExecuted", { id: "workbench.action.chat.upgradePlan", from: "command" });
        const baseUrl = defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotUpgrade);
        const upgradeUrl = buildUpgradeUrlWithRedirect(baseUrl, productService.urlProtocol, productService.quality);
        openerService.open(upgradeUrl);
        const entitlement = context.state.entitlement;
        if (!isProUser(entitlement)) {
          windowFocusListener.value = hostService.onDidChangeFocus((focus) => this.onWindowFocus(focus, commandService));
        }
      }
      async onWindowFocus(focus, commandService) {
        if (focus) {
          windowFocusListener.clear();
          const entitlements = await requests.forceResolveEntitlement();
          if (entitlements?.entitlement && isProUser(entitlements?.entitlement)) {
            refreshTokens(commandService);
          }
        }
      }
    }
    class ManageAdditionalSpendAction extends Action2 {
      constructor() {
        super({
          id: "workbench.action.chat.manageAdditionalSpend",
          title: localize2("manageAdditionalSpend", "Manage GitHub Copilot Budget"),
          category: localize2("chat.category", "Chat"),
          f1: true,
          precondition: ContextKeyExpr.and(
            ChatContextKeys.Setup.hidden.negate(),
            ChatContextKeys.Setup.disabledInWorkspace.negate(),
            ContextKeyExpr.or(
              ChatContextKeys.Entitlement.planPro,
              ChatContextKeys.Entitlement.planProPlus,
              ChatContextKeys.Entitlement.planMax,
              ChatContextKeys.Entitlement.planEdu
            )
          ),
          menu: {
            id: MenuId.ChatTitleBarMenu,
            group: "a_first",
            order: 1,
            when: ContextKeyExpr.and(
              ContextKeyExpr.or(
                ChatContextKeys.Entitlement.planPro,
                ChatContextKeys.Entitlement.planProPlus,
                ChatContextKeys.Entitlement.planMax,
                ChatContextKeys.Entitlement.planEdu
              ),
              ContextKeyExpr.or(
                ChatContextKeys.chatQuotaExceeded,
                ChatContextKeys.completionsQuotaExceeded
              )
            )
          }
        });
      }
      async run(accessor) {
        const openerService = accessor.get(IOpenerService);
        const telemetryService = accessor.get(ITelemetryService);
        const defaultAccountService = accessor.get(IDefaultAccountService);
        telemetryService.publicLog2("workbenchActionExecuted", { id: "workbench.action.chat.manageAdditionalSpend", from: "command" });
        openerService.open(URI.parse(defaultAccountService.resolveGitHubUrl(GitHubPaths.billingBudgets)));
      }
    }
    registerAction2(ChatSetupTriggerAction);
    registerAction2(ChatSetupTriggerForceSignInDialogAction);
    registerAction2(ChatSetupFromAccountsAction);
    registerAction2(ChatSetupSignInTitleBarAction);
    registerAction2(ToggleSignInTitleBarAction);
    registerAction2(ChatSetupTriggerAnonymousWithoutDialogAction);
    registerAction2(ChatSetupTriggerSupportAnonymousAction);
    registerAction2(UpgradePlanAction);
    registerAction2(ManageAdditionalSpendAction);
    function registerGenerateCodeCommand(coreCommand, actualCommand) {
      CommandsRegistry.registerCommand(coreCommand, async (accessor, ...args) => {
        const commandService = accessor.get(ICommandService);
        const codeEditorService = accessor.get(ICodeEditorService);
        const markerService = accessor.get(IMarkerService);
        switch (coreCommand) {
          case "chat.internal.explain":
          case "chat.internal.fix": {
            const textEditor = codeEditorService.getActiveCodeEditor();
            const uri = textEditor?.getModel()?.uri;
            const range = textEditor?.getSelection();
            if (!uri || !range) {
              return;
            }
            const markers = AICodeActionsHelper.warningOrErrorMarkersAtRange(markerService, uri, range);
            const actualCommand2 = coreCommand === "chat.internal.explain" ? AICodeActionsHelper.explainMarkers(markers) : AICodeActionsHelper.fixMarkers(markers, range);
            await commandService.executeCommand(actualCommand2.id, ...actualCommand2.arguments ?? []);
            break;
          }
          case "chat.internal.review": {
            const result = await commandService.executeCommand(CHAT_SETUP_SUPPORT_ANONYMOUS_ACTION_ID);
            if (result) {
              await commandService.executeCommand(actualCommand);
            }
            break;
          }
        }
      });
    }
    registerGenerateCodeCommand("chat.internal.explain", "github.copilot.chat.explain");
    registerGenerateCodeCommand("chat.internal.fix", "github.copilot.chat.fix");
    registerGenerateCodeCommand("chat.internal.review", "github.copilot.chat.review");
    const internalGenerateCodeContext = ContextKeyExpr.and(
      ChatContextKeys.Setup.hidden.negate(),
      ChatContextKeys.Setup.disabledInWorkspace.negate(),
      ChatContextKeys.Setup.completed.negate()
    );
    MenuRegistry.appendMenuItem(MenuId.EditorContext, {
      command: {
        id: "chat.internal.explain",
        title: localize("explain", "Explain")
      },
      group: "1_chat",
      order: 4,
      when: internalGenerateCodeContext
    });
    MenuRegistry.appendMenuItem(MenuId.EditorContext, {
      command: {
        id: "chat.internal.fix",
        title: localize("fix", "Fix")
      },
      group: "1_chat",
      order: 5,
      when: ContextKeyExpr.and(
        internalGenerateCodeContext,
        EditorContextKeys.readOnly.negate()
      )
    });
    MenuRegistry.appendMenuItem(MenuId.EditorContext, {
      command: {
        id: "chat.internal.review",
        title: localize("review", "Code Review")
      },
      group: "1_chat",
      order: 6,
      when: internalGenerateCodeContext
    });
  }
  registerSignInTitleBarEntry(actionViewItemService) {
    this._register(actionViewItemService.register(
      MenuId.TitleBarAdjacentCenter,
      SIGN_IN_TITLE_BAR_ACTION_ID,
      (action, options) => new SignInTitleBarEntry(action, options)
    ));
  }
  registerUrlLinkHandler() {
    this._register(ExtensionUrlHandlerOverrideRegistry.registerHandler(this.instantiationService.createInstance(ChatSetupExtensionUrlHandler)));
  }
  async checkExtensionInstallation(context) {
    if (this.environmentService.isExtensionDevelopment) {
      await this.extensionService.whenInstalledExtensionsRegistered();
      if (this.extensionService.extensions.find((ext) => ExtensionIdentifier.equals(ext.identifier, defaultChat.chatExtensionId))) {
        context.update({ installed: true, disabled: false, untrusted: false, disabledInWorkspace: false });
        return;
      }
    }
    await this.extensionsWorkbenchService.queryLocal();
    this._register(Event.runAndSubscribe(this.extensionsWorkbenchService.onChange, (e) => {
      if (e && !ExtensionIdentifier.equals(e.identifier.id, defaultChat.chatExtensionId)) {
        return;
      }
      const defaultChatExtension = this.extensionsWorkbenchService.local.find((value) => ExtensionIdentifier.equals(value.identifier.id, defaultChat.chatExtensionId));
      const installed = !!defaultChatExtension?.local;
      let disabled;
      let untrusted = false;
      let disabledInWorkspace = false;
      if (installed) {
        disabled = !this.extensionEnablementService.isEnabled(defaultChatExtension.local);
        if (disabled) {
          const state = this.extensionEnablementService.getEnablementState(defaultChatExtension.local);
          if (state === EnablementState.DisabledByTrustRequirement) {
            disabled = false;
            untrusted = true;
          } else if (state === EnablementState.DisabledWorkspace) {
            disabledInWorkspace = true;
          }
        }
      } else {
        disabled = false;
      }
      context.update({ installed, disabled, untrusted, disabledInWorkspace });
    }));
  }
};
ChatSetupContribution.ID = "workbench.contrib.chatSetup";
ChatSetupContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IChatEntitlementService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IWorkbenchExtensionEnablementService),
  __decorateParam(6, IExtensionsWorkbenchService),
  __decorateParam(7, IExtensionService),
  __decorateParam(8, IEnvironmentService),
  __decorateParam(9, IChatSessionsService),
  __decorateParam(10, IConfigurationService)
], ChatSetupContribution);
let ChatSetupExtensionUrlHandler = class {
  constructor(productService, commandService, telemetryService, chatEntitlementService, chatInputNotificationService) {
    this.productService = productService;
    this.commandService = commandService;
    this.telemetryService = telemetryService;
    this.chatEntitlementService = chatEntitlementService;
    this.chatInputNotificationService = chatInputNotificationService;
  }
  canHandleURL(url) {
    return url.scheme === this.productService.urlProtocol && equalsIgnoreCase(url.authority, defaultChat.chatExtensionId);
  }
  async handleURL(url) {
    if (url.path === "/upgrade-success") {
      return this._handleUpgradeSuccess();
    }
    const params = new URLSearchParams(url.query);
    this.telemetryService.publicLog2("workbenchActionExecuted", { id: CHAT_SETUP_ACTION_ID, from: "url", detail: params.get("referrer") ?? void 0 });
    const agentParam = params.get("agent") ?? params.get("mode");
    const inputParam = params.get("prompt");
    if (!agentParam && !inputParam) {
      return false;
    }
    await this.commandService.executeCommand(CHAT_SETUP_ACTION_ID, agentParam, inputParam ? { inputValue: inputParam } : void 0);
    return true;
  }
  async _handleUpgradeSuccess() {
    this.telemetryService.publicLog2("workbenchActionExecuted", { id: "workbench.action.chat.upgradePlan", from: "redirect" });
    await this.chatEntitlementService.update(CancellationToken.None);
    refreshTokens(this.commandService);
    this.chatInputNotificationService.setNotification({
      id: ChatSetupExtensionUrlHandler.UPGRADE_SUCCESS_NOTIFICATION_ID,
      severity: ChatInputNotificationSeverity.Info,
      message: localize("upgradeSuccess", "Upgrade Successful"),
      description: localize("upgradeSuccessDescription", "Please wait up to 10 minutes for your new plan to apply."),
      actions: [],
      dismissible: true,
      autoDismissOnMessage: true
    });
    return true;
  }
};
ChatSetupExtensionUrlHandler.UPGRADE_SUCCESS_NOTIFICATION_ID = "copilot.upgradeSuccess";
ChatSetupExtensionUrlHandler = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IChatEntitlementService),
  __decorateParam(4, IChatInputNotificationService)
], ChatSetupExtensionUrlHandler);
let ChatTeardownContribution = class extends Disposable {
  constructor(chatEntitlementService, configurationService, extensionsWorkbenchService, extensionEnablementService, viewDescriptorService, layoutService) {
    super();
    this.configurationService = configurationService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.viewDescriptorService = viewDescriptorService;
    this.layoutService = layoutService;
    const context = chatEntitlementService.context?.value;
    if (!context) {
      return;
    }
    this.registerListeners();
    this.registerActions();
    this.handleChatDisabled(false);
  }
  handleChatDisabled(fromEvent) {
    const chatDisabled = this.configurationService.inspect(ChatAIDisabledSettingId);
    if (chatDisabled.value === true) {
      this.maybeEnableOrDisableExtension(typeof chatDisabled.workspaceValue === "boolean" ? EnablementState.DisabledWorkspace : EnablementState.DisabledGlobally);
      if (fromEvent) {
        this.maybeHideAuxiliaryBar();
      }
    } else if (chatDisabled.value === false && fromEvent) {
      this.maybeEnableOrDisableExtension(typeof chatDisabled.workspaceValue === "boolean" ? EnablementState.EnabledWorkspace : EnablementState.EnabledGlobally);
    }
  }
  async registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration(ChatAIDisabledSettingId)) {
        return;
      }
      this.handleChatDisabled(true);
    }));
    await this.extensionsWorkbenchService.queryLocal();
    this._register(this.extensionsWorkbenchService.onChange((e) => {
      if (e && !ExtensionIdentifier.equals(e.identifier.id, defaultChat.chatExtensionId)) {
        return;
      }
      const defaultChatExtension = this.extensionsWorkbenchService.local.find((value) => ExtensionIdentifier.equals(value.identifier.id, defaultChat.chatExtensionId));
      if (defaultChatExtension?.local && this.extensionEnablementService.isEnabled(defaultChatExtension.local)) {
        if (defaultChatExtension.enablementState === EnablementState.EnabledWorkspace) {
          if (this.configurationService.inspect(ChatAIDisabledSettingId).workspaceValue === true) {
            this.configurationService.updateValue(ChatAIDisabledSettingId, false, ConfigurationTarget.WORKSPACE);
          }
        } else {
          this.configurationService.updateValue(ChatAIDisabledSettingId, false);
        }
      }
    }));
  }
  async maybeEnableOrDisableExtension(state) {
    const defaultChatExtension = this.extensionsWorkbenchService.local.find((value) => ExtensionIdentifier.equals(value.identifier.id, defaultChat.chatExtensionId));
    if (!defaultChatExtension?.local) {
      return;
    }
    const workspace = state === EnablementState.EnabledWorkspace || state === EnablementState.DisabledWorkspace;
    const canChange = workspace ? this.extensionEnablementService.canChangeWorkspaceEnablement(defaultChatExtension.local) : this.extensionEnablementService.canChangeEnablement(defaultChatExtension.local);
    if (!canChange) {
      return;
    }
    await this.extensionsWorkbenchService.setEnablement([defaultChatExtension], state);
    await this.extensionsWorkbenchService.updateRunningExtensions(state === EnablementState.EnabledGlobally || state === EnablementState.EnabledWorkspace ? localize("restartExtensionHost.reason.enable", "Enabling AI features") : localize("restartExtensionHost.reason.disable", "Disabling AI features"));
  }
  maybeHideAuxiliaryBar() {
    const activeContainers = this.viewDescriptorService.getViewContainersByLocation(ViewContainerLocation.AuxiliaryBar).filter(
      (container) => this.viewDescriptorService.getViewContainerModel(container).activeViewDescriptors.length > 0
    );
    if (activeContainers.length === 0 || // chat view is already gone but we know it was there before
    activeContainers.length === 1 && activeContainers.at(0)?.id === ChatViewContainerId) {
      this.layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
    }
  }
  registerActions() {
    const _ChatSetupHideAction = class _ChatSetupHideAction extends Action2 {
      constructor() {
        super({
          id: _ChatSetupHideAction.ID,
          title: _ChatSetupHideAction.TITLE,
          f1: true,
          category: CHAT_CATEGORY,
          precondition: ContextKeyExpr.and(ChatContextKeys.Setup.hidden.negate(), ChatContextKeys.Setup.disabledInWorkspace.negate()),
          menu: {
            id: MenuId.ChatTitleBarMenu,
            group: "z_hide",
            order: 1,
            when: ChatContextKeys.Setup.completed.negate()
          }
        });
      }
      async run(accessor) {
        const preferencesService = accessor.get(IPreferencesService);
        preferencesService.openSettings({ jsonEditor: false, query: `@id:${ChatAIDisabledSettingId}` });
      }
    };
    _ChatSetupHideAction.ID = "workbench.action.chat.hideSetup";
    _ChatSetupHideAction.TITLE = localize2("hideChatSetup", "Learn How to Hide AI Features");
    let ChatSetupHideAction = _ChatSetupHideAction;
    registerAction2(ChatSetupHideAction);
  }
};
ChatTeardownContribution.ID = "workbench.contrib.chatTeardown";
ChatTeardownContribution = __decorateClass([
  __decorateParam(0, IChatEntitlementService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IExtensionsWorkbenchService),
  __decorateParam(3, IWorkbenchExtensionEnablementService),
  __decorateParam(4, IViewDescriptorService),
  __decorateParam(5, IWorkbenchLayoutService)
], ChatTeardownContribution);
class SignInTitleBarEntry extends BaseActionViewItem {
  constructor(action, options) {
    super(void 0, action, options);
  }
  render(container) {
    super.render(container);
    container.setAttribute("role", "button");
    container.setAttribute("aria-label", this.action.label);
    const content = dom.append(container, dom.$(".update-indicator.prominent"));
    this.label = dom.append(content, dom.$(".indicator-label"));
    this.label.textContent = this.action.label;
  }
  updateLabel() {
    if (this.label) {
      this.label.textContent = this.action.label;
    }
    if (this.element) {
      this.element.setAttribute("aria-label", this.action.label);
    }
  }
  updateEnabled() {
    if (this.element) {
      this.element.classList.toggle("disabled", !this.action.enabled);
    }
  }
}
export {
  ChatSetupContribution,
  ChatTeardownContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U2V0dXAvY2hhdFNldHVwQ29udHJpYnV0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEJhc2VBY3Rpb25WaWV3SXRlbSwgSUJhc2VBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uLCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgbWFya0FzU2luZ2xldG9uLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgZXF1YWxzSWdub3JlQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJc1dlYkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU1hcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBHaXRIdWJQYXRocywgSURlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RlZmF1bHRBY2NvdW50L2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IFRvZ2dsZVRpdGxlQmFyQ29uZmlnQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy90aXRsZWJhci90aXRsZWJhckFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQsIENoYXRFbnRpdGxlbWVudENvbnRleHQsIENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLCBDaGF0RW50aXRsZW1lbnRSZXF1ZXN0cywgQ2hhdEVudGl0bGVtZW50U2VydmljZSwgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UsIGlzUHJvVXNlciB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRW5hYmxlbWVudFN0YXRlLCBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblVybEhhbmRsZXJPdmVycmlkZVJlZ2lzdHJ5LCBJRXh0ZW5zaW9uVXJsSGFuZGxlck92ZXJyaWRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9icm93c2VyL2V4dGVuc2lvblVybEhhbmRsZXIuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENPTlRFWFRfREVGQVVMVF9BQ0NPVU5UX1NUQVRFLCBEZWZhdWx0QWNjb3VudFN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2FjY291bnRzL2Jyb3dzZXIvZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UsIFBhcnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbkVkaXRvclplbk1vZGVDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uLCBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRBSURpc2FibGVkU2V0dGluZ0lkLCBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRNb2RlS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ0hBVF9DQVRFR09SWSwgQ0hBVF9TRVRVUF9BQ1RJT05fSUQsIENIQVRfU0VUVVBfU1VQUE9SVF9BTk9OWU1PVVNfQUNUSU9OX0lEIH0gZnJvbSAnLi4vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld0NvbnRhaW5lcklkLCBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eSwgSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi93aWRnZXQvaW5wdXQvY2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjaGF0Vmlld3NXZWxjb21lUmVnaXN0cnkgfSBmcm9tICcuLi92aWV3c1dlbGNvbWUvY2hhdFZpZXdzV2VsY29tZS5qcyc7XG5pbXBvcnQgeyBidWlsZFVwZ3JhZGVVcmxXaXRoUmVkaXJlY3QsIENoYXRTZXR1cEFub255bW91cywgQ2hhdFNldHVwU3RyYXRlZ3ksIElDaGF0U2V0dXBDb21tYW5kT3B0aW9ucywgSUNoYXRTZXR1cFJlc3VsdCwgcmVmcmVzaFRva2VucyB9IGZyb20gJy4vY2hhdFNldHVwLmpzJztcbmltcG9ydCB7IENoYXRTZXR1cENvbnRyb2xsZXIgfSBmcm9tICcuL2NoYXRTZXR1cENvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgR3Jvd3RoU2Vzc2lvbkNvbnRyb2xsZXIsIHJlZ2lzdGVyR3Jvd3RoU2Vzc2lvbiB9IGZyb20gJy4vY2hhdFNldHVwR3Jvd3RoU2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBBSUNvZGVBY3Rpb25zSGVscGVyLCBBSU5ld1N5bWJvbE5hbWVzUHJvdmlkZXIsIENoYXRDb2RlQWN0aW9uc1Byb3ZpZGVyLCBTZXR1cEFnZW50IH0gZnJvbSAnLi9jaGF0U2V0dXBQcm92aWRlcnMuanMnO1xuaW1wb3J0IHsgQ2hhdFNldHVwIH0gZnJvbSAnLi9jaGF0U2V0dXBSdW5uZXIuanMnO1xuXG5jb25zdCBkZWZhdWx0Q2hhdCA9IHtcblx0Y2hhdEV4dGVuc2lvbklkOiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LmNoYXRFeHRlbnNpb25JZCA/PyAnJyxcbn07XG5cbmNvbnN0IFNJR05fSU5fVElUTEVfQkFSX0FDVElPTl9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuc2lnbkluSW5kaWNhdG9yJztcblxuZXhwb3J0IGNsYXNzIENoYXRTZXR1cENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhdFNldHVwJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFjdGlvblZpZXdJdGVtU2VydmljZSBhY3Rpb25WaWV3SXRlbVNlcnZpY2U6IElBY3Rpb25WaWV3SXRlbVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IENoYXRFbnRpdGxlbWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElDaGF0U2Vzc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlc3Npb25zU2VydmljZTogSUNoYXRTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBjb250ZXh0ID0gY2hhdEVudGl0bGVtZW50U2VydmljZS5jb250ZXh0Py52YWx1ZTtcblx0XHRjb25zdCByZXF1ZXN0cyA9IGNoYXRFbnRpdGxlbWVudFNlcnZpY2UucmVxdWVzdHM/LnZhbHVlO1xuXHRcdGlmICghY29udGV4dCB8fCAhcmVxdWVzdHMpIHtcblx0XHRcdHJldHVybjsgLy8gZGlzYWJsZWRcblx0XHR9XG5cblx0XHRjb25zdCBjb250cm9sbGVyID0gbmV3IExhenkoKCkgPT4gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0U2V0dXBDb250cm9sbGVyLCBjb250ZXh0LCByZXF1ZXN0cykpKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJTZXR1cEFnZW50cyhjb250ZXh0LCBjb250cm9sbGVyKTtcblx0XHR0aGlzLnJlZ2lzdGVyR3Jvd3RoU2Vzc2lvbihjaGF0RW50aXRsZW1lbnRTZXJ2aWNlKTtcblx0XHR0aGlzLnJlZ2lzdGVyQWN0aW9ucyhjb250ZXh0LCByZXF1ZXN0cywgY29udHJvbGxlcik7XG5cdFx0dGhpcy5yZWdpc3RlclNpZ25JblRpdGxlQmFyRW50cnkoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlKTtcblx0XHR0aGlzLnJlZ2lzdGVyVXJsTGlua0hhbmRsZXIoKTtcblx0XHR0aGlzLmNoZWNrRXh0ZW5zaW9uSW5zdGFsbGF0aW9uKGNvbnRleHQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNldHVwQWdlbnRzKGNvbnRleHQ6IENoYXRFbnRpdGxlbWVudENvbnRleHQsIGNvbnRyb2xsZXI6IExhenk8Q2hhdFNldHVwQ29udHJvbGxlcj4pOiB2b2lkIHtcblx0XHRjb25zdCBkZWZhdWx0QWdlbnREaXNwb3NhYmxlcyA9IG1hcmtBc1NpbmdsZXRvbihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7IC8vIHByZXZlbnRzIGZsaWNrZXIgb24gd2luZG93IHJlbG9hZFxuXHRcdGNvbnN0IHZzY29kZUFnZW50RGlzcG9zYWJsZXMgPSBtYXJrQXNTaW5nbGV0b24obmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXG5cdFx0Y29uc3QgcmVuYW1lUHJvdmlkZXJEaXNwb3NhYmxlcyA9IG1hcmtBc1NpbmdsZXRvbihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0Y29uc3QgY29kZUFjdGlvbnNQcm92aWRlckRpc3Bvc2FibGVzID0gbWFya0FzU2luZ2xldG9uKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRcdGNvbnN0IHVwZGF0ZVJlZ2lzdHJhdGlvbiA9ICgpID0+IHtcblxuXHRcdFx0Ly8gQWdlbnQgKyBUb29sc1xuXHRcdFx0e1xuXHRcdFx0XHRpZiAoIWNvbnRleHQuc3RhdGUuaGlkZGVuICYmICFjb250ZXh0LnN0YXRlLmRpc2FibGVkSW5Xb3Jrc3BhY2UpIHtcblxuXHRcdFx0XHRcdC8vIERlZmF1bHQgQWdlbnRzIChhbHdheXMsIGV2ZW4gaWYgaW5zdGFsbGVkIHRvIGFsbG93IGZvciBzcGVlZHkgcmVxdWVzdHMgcmlnaHQgb24gc3RhcnR1cClcblx0XHRcdFx0XHRpZiAoIWRlZmF1bHRBZ2VudERpc3Bvc2FibGVzLnZhbHVlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IGRlZmF1bHRBZ2VudERpc3Bvc2FibGVzLnZhbHVlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0XHRcdFx0XHQvLyBQYW5lbCBBZ2VudHNcblx0XHRcdFx0XHRcdGNvbnN0IHBhbmVsQWdlbnREaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBtb2RlIG9mIFtDaGF0TW9kZUtpbmQuQXNrLCBDaGF0TW9kZUtpbmQuRWRpdCwgQ2hhdE1vZGVLaW5kLkFnZW50XSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCB7IGFnZW50LCBkaXNwb3NhYmxlIH0gPSBTZXR1cEFnZW50LnJlZ2lzdGVyRGVmYXVsdEFnZW50cyh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LCBtb2RlLCBjb250ZXh0LCBjb250cm9sbGVyKTtcblx0XHRcdFx0XHRcdFx0cGFuZWxBZ2VudERpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlKTtcblx0XHRcdFx0XHRcdFx0cGFuZWxBZ2VudERpc3Bvc2FibGVzLmFkZChhZ2VudC5vblVucmVzb2x2YWJsZUVycm9yKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRjb25zdCBwYW5lbEFnZW50SGFzR3VpZGFuY2UgPSBjaGF0Vmlld3NXZWxjb21lUmVnaXN0cnkuZ2V0KCkuc29tZShkZXNjcmlwdG9yID0+IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhkZXNjcmlwdG9yLndoZW4pKTtcblx0XHRcdFx0XHRcdFx0XHRpZiAocGFuZWxBZ2VudEhhc0d1aWRhbmNlKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHQvLyBBbiB1bnJlc29sdmFibGUgZXJyb3IgZnJvbSBvdXIgYWdlbnQgcmVnaXN0cmF0aW9ucyBtZWFucyB0aGF0XG5cdFx0XHRcdFx0XHRcdFx0XHQvLyBDaGF0IGlzIHVuaGVhbHRoeSBmb3Igc29tZSByZWFzb24uIFdlIGNsZWFyIG91ciBwYW5lbFxuXHRcdFx0XHRcdFx0XHRcdFx0Ly8gcmVnaXN0cmF0aW9uIHRvIGdpdmUgQ2hhdCBhIGNoYW5jZSB0byBzaG93IGEgY3VzdG9tIG1lc3NhZ2Vcblx0XHRcdFx0XHRcdFx0XHRcdC8vIHRvIHRoZSB1c2VyIGZyb20gdGhlIHZpZXdzIGFuZCBzdG9wIHByZXRlbmRpbmcgYXMgaWYgdGhlcmUgd2FzXG5cdFx0XHRcdFx0XHRcdFx0XHQvLyBhIGZ1bmN0aW9uYWwgYWdlbnQuXG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tjaGF0IHNldHVwXSBVbnJlc29sdmFibGUgZXJyb3IgZnJvbSBDaGF0IGFnZW50IHJlZ2lzdHJhdGlvbiwgY2xlYXJpbmcgcmVnaXN0cmF0aW9uLicpO1xuXHRcdFx0XHRcdFx0XHRcdFx0cGFuZWxBZ2VudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gSW5saW5lIEFnZW50c1xuXHRcdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKFNldHVwQWdlbnQucmVnaXN0ZXJEZWZhdWx0QWdlbnRzKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIENoYXRBZ2VudExvY2F0aW9uLlRlcm1pbmFsLCBDaGF0TW9kZUtpbmQuQXNrLCBjb250ZXh0LCBjb250cm9sbGVyKS5kaXNwb3NhYmxlKTtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChTZXR1cEFnZW50LnJlZ2lzdGVyRGVmYXVsdEFnZW50cyh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBDaGF0QWdlbnRMb2NhdGlvbi5Ob3RlYm9vaywgQ2hhdE1vZGVLaW5kLkFzaywgY29udGV4dCwgY29udHJvbGxlcikuZGlzcG9zYWJsZSk7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoU2V0dXBBZ2VudC5yZWdpc3RlckRlZmF1bHRBZ2VudHModGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lLCBDaGF0TW9kZUtpbmQuQXNrLCBjb250ZXh0LCBjb250cm9sbGVyKS5kaXNwb3NhYmxlKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBCdWlsdC1JbiBBZ2VudCArIFRvb2wgKHVubGVzcyBjb21wbGV0ZWQsIHNpZ25lZC1pbiBhbmQgZW5hYmxlZClcblx0XHRcdFx0XHRpZiAoKCFjb250ZXh0LnN0YXRlLmNvbXBsZXRlZCB8fCBjb250ZXh0LnN0YXRlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuVW5rbm93biB8fCBjb250ZXh0LnN0YXRlLmVudGl0bGVtZW50ID09PSBDaGF0RW50aXRsZW1lbnQuVW5yZXNvbHZlZCkgJiYgIXZzY29kZUFnZW50RGlzcG9zYWJsZXMudmFsdWUpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gdnNjb2RlQWdlbnREaXNwb3NhYmxlcy52YWx1ZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChTZXR1cEFnZW50LnJlZ2lzdGVyQnVpbHRJbkFnZW50cyh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250ZXh0LCBjb250cm9sbGVyKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRlZmF1bHRBZ2VudERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdFx0dnNjb2RlQWdlbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGNvbnRleHQuc3RhdGUuY29tcGxldGVkKSB7XG5cdFx0XHRcdFx0dnNjb2RlQWdlbnREaXNwb3NhYmxlcy5jbGVhcigpOyAvLyB3ZSBuZWVkIHRvIGRvIHRoaXMgdG8gcHJldmVudCBzaG93aW5nIGR1cGxpY2F0ZSBhZ2VudC90b29sIGVudHJpZXMgaW4gdGhlIGxpc3Rcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZW5hbWUgUHJvdmlkZXJcblx0XHRcdHtcblx0XHRcdFx0aWYgKCFjb250ZXh0LnN0YXRlLmNvbXBsZXRlZCAmJiAhY29udGV4dC5zdGF0ZS5oaWRkZW4gJiYgIWNvbnRleHQuc3RhdGUuZGlzYWJsZWRJbldvcmtzcGFjZSkge1xuXHRcdFx0XHRcdGlmICghcmVuYW1lUHJvdmlkZXJEaXNwb3NhYmxlcy52YWx1ZSkge1xuXHRcdFx0XHRcdFx0cmVuYW1lUHJvdmlkZXJEaXNwb3NhYmxlcy52YWx1ZSA9IEFJTmV3U3ltYm9sTmFtZXNQcm92aWRlci5yZWdpc3RlclByb3ZpZGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UsIGNvbnRleHQsIGNvbnRyb2xsZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZW5hbWVQcm92aWRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQ29kZSBBY3Rpb25zIFByb3ZpZGVyXG5cdFx0XHR7XG5cdFx0XHRcdGlmICghY29udGV4dC5zdGF0ZS5jb21wbGV0ZWQgJiYgIWNvbnRleHQuc3RhdGUuaGlkZGVuICYmICFjb250ZXh0LnN0YXRlLmRpc2FibGVkSW5Xb3Jrc3BhY2UpIHtcblx0XHRcdFx0XHRpZiAoIWNvZGVBY3Rpb25zUHJvdmlkZXJEaXNwb3NhYmxlcy52YWx1ZSkge1xuXHRcdFx0XHRcdFx0Y29kZUFjdGlvbnNQcm92aWRlckRpc3Bvc2FibGVzLnZhbHVlID0gQ2hhdENvZGVBY3Rpb25zUHJvdmlkZXIucmVnaXN0ZXJQcm92aWRlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29kZUFjdGlvbnNQcm92aWRlckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKGNvbnRleHQub25EaWRDaGFuZ2UsICgpID0+IHVwZGF0ZVJlZ2lzdHJhdGlvbigpKSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyR3Jvd3RoU2Vzc2lvbihjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBDaGF0RW50aXRsZW1lbnRTZXJ2aWNlKTogdm9pZCB7XG5cdFx0Y29uc3QgZ3Jvd3RoU2Vzc2lvbkRpc3Bvc2FibGVzID0gbWFya0FzU2luZ2xldG9uKG5ldyBNdXRhYmxlRGlzcG9zYWJsZSgpKTtcblxuXHRcdGNvbnN0IHVwZGF0ZUdyb3d0aFNlc3Npb24gPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBleHBlcmltZW50RW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uR3Jvd3RoTm90aWZpY2F0aW9uRW5hYmxlZCkgPT09IHRydWU7XG5cdFx0XHQvLyBTaG93IGZvciB1c2VycyB3aG8gZG9uJ3QgaGF2ZSBjb21wbGV0ZWQgdGhlIENoYXQgc2V0dXAgeWV0LlxuXHRcdFx0Ly8gQWRkaXRpb25hbCBjb25kaXRpb25zIChlLmcuLCBhbm9ueW1vdXMsIGVudGl0bGVtZW50KSBjYW4gYmUgbGF5ZXJlZCBoZXJlLlxuXHRcdFx0Y29uc3Qgc2hvdWxkU2hvdyA9IGV4cGVyaW1lbnRFbmFibGVkICYmICFjaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnNlbnRpbWVudC5jb21wbGV0ZWQ7XG5cdFx0XHRpZiAoc2hvdWxkU2hvdyAmJiAhZ3Jvd3RoU2Vzc2lvbkRpc3Bvc2FibGVzLnZhbHVlKSB7XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRjb25zdCBjb250cm9sbGVyID0gZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoR3Jvd3RoU2Vzc2lvbkNvbnRyb2xsZXIpKTtcblx0XHRcdFx0aWYgKCFjb250cm9sbGVyLmlzRGlzbWlzc2VkKSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHJlZ2lzdGVyR3Jvd3RoU2Vzc2lvbih0aGlzLmNoYXRTZXNzaW9uc1NlcnZpY2UsIGNvbnRyb2xsZXIpKTtcblx0XHRcdFx0XHQvLyBGdWxseSB1bnJlZ2lzdGVyIHdoZW4gZGlzbWlzc2VkIHRvIHByZXZlbnQgY2FjaGVkIHNlc3Npb24gZnJvbVxuXHRcdFx0XHRcdC8vIGFwcGVhcmluZyBkdXJpbmcgZmlsdGVyZWQgbW9kZWwgdXBkYXRlcyBmcm9tIG90aGVyIHByb3ZpZGVycy5cblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQoY29udHJvbGxlci5vbkRpZERpc21pc3MoKCkgPT4ge1xuXHRcdFx0XHRcdFx0Z3Jvd3RoU2Vzc2lvbkRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdGdyb3d0aFNlc3Npb25EaXNwb3NhYmxlcy52YWx1ZSA9IGRpc3Bvc2FibGVzO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICghc2hvdWxkU2hvdykge1xuXHRcdFx0XHRncm93dGhTZXNzaW9uRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVNlbnRpbWVudCgoKSA9PiB1cGRhdGVHcm93dGhTZXNzaW9uKCkpKTtcblx0XHR1cGRhdGVHcm93dGhTZXNzaW9uKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyQWN0aW9ucyhjb250ZXh0OiBDaGF0RW50aXRsZW1lbnRDb250ZXh0LCByZXF1ZXN0czogQ2hhdEVudGl0bGVtZW50UmVxdWVzdHMsIGNvbnRyb2xsZXI6IExhenk8Q2hhdFNldHVwQ29udHJvbGxlcj4pOiB2b2lkIHtcblxuXHRcdC8vI3JlZ2lvbiBHbG9iYWwgQ2hhdCBTZXR1cCBBY3Rpb25zXG5cblx0XHRjbGFzcyBDaGF0U2V0dXBUcmlnZ2VyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0XHRcdHN0YXRpYyBDSEFUX1NFVFVQX0FDVElPTl9MQUJFTCA9IGxvY2FsaXplMigndHJpZ2dlckNoYXRTZXR1cCcsIFwiVXNlIEFJIEZlYXR1cmVzIHdpdGggQ29waWxvdCBmb3IgZnJlZS4uLlwiKTtcblxuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogQ0hBVF9TRVRVUF9BQ1RJT05fSUQsXG5cdFx0XHRcdFx0dGl0bGU6IENoYXRTZXR1cFRyaWdnZXJBY3Rpb24uQ0hBVF9TRVRVUF9BQ1RJT05fTEFCRUwsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4sXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuZGlzYWJsZWRJbldvcmtzcGFjZSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5TZXR1cC51bnRydXN0ZWQsXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuY29tcGxldGVkLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLkVudGl0bGVtZW50LmNhblNpZ25VcFxuXHRcdFx0XHRcdClcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgbW9kZT86IENoYXRNb2RlS2luZCB8IHN0cmluZywgb3B0aW9ucz86IElDaGF0U2V0dXBDb21tYW5kT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbiB8IElDaGF0U2V0dXBSZXN1bHQ+IHtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgbGlmZWN5Y2xlU2VydmljZSA9IGFjY2Vzc29yLmdldChJTGlmZWN5Y2xlU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHRcdFx0YXdhaXQgY29udGV4dC51cGRhdGUoeyBoaWRkZW46IGZhbHNlIH0pO1xuXHRcdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCwgZmFsc2UpO1xuXG5cdFx0XHRcdGlmIChtb2RlKSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hhdFdpZGdldCA9IGF3YWl0IHdpZGdldFNlcnZpY2UucmV2ZWFsV2lkZ2V0KCk7XG5cdFx0XHRcdFx0aWYgKGNoYXRXaWRnZXQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHJlc29sdmVkTW9kZSA9IHRoaXMucmVzb2x2ZUFnZW50SWQobW9kZSwgY2hhdFdpZGdldCk7XG5cdFx0XHRcdFx0XHRpZiAocmVzb2x2ZWRNb2RlKSB7XG5cdFx0XHRcdFx0XHRcdGNoYXRXaWRnZXQuaW5wdXQuc2V0Q2hhdE1vZGUocmVzb2x2ZWRNb2RlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAob3B0aW9ucz8uaW5wdXRWYWx1ZSkge1xuXHRcdFx0XHRcdGNvbnN0IGNoYXRXaWRnZXQgPSBhd2FpdCB3aWRnZXRTZXJ2aWNlLnJldmVhbFdpZGdldCgpO1xuXHRcdFx0XHRcdGNoYXRXaWRnZXQ/LmlucHV0LnNob3dTY3JvbGxiYXJVbnRpbEFjY2VwdCgpO1xuXHRcdFx0XHRcdGNoYXRXaWRnZXQ/LnNldElucHV0KG9wdGlvbnMuaW5wdXRWYWx1ZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzZXR1cCA9IENoYXRTZXR1cC5nZXRJbnN0YW5jZShpbnN0YW50aWF0aW9uU2VydmljZSwgY29udGV4dCwgY29udHJvbGxlcik7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNldHVwLnJ1bihvcHRpb25zKTtcblx0XHRcdFx0aWYgKG9wdGlvbnM/LnJldHVyblJlc3VsdCkge1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgeyBzdWNjZXNzIH0gPSByZXN1bHQ7XG5cdFx0XHRcdGlmIChzdWNjZXNzID09PSBmYWxzZSAmJiAhcmVzdWx0LmVycm9yQWxyZWFkeUhhbmRsZWQgJiYgIWxpZmVjeWNsZVNlcnZpY2Uud2lsbFNodXRkb3duKSB7XG5cdFx0XHRcdFx0Y29uc3QgeyBjb25maXJtZWQgfSA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdFx0XHR0eXBlOiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdzZXR1cEVycm9yRGlhbG9nJywgXCJDaGF0IHNldHVwIGZhaWxlZC4gV291bGQgeW91IGxpa2UgdG8gdHJ5IGFnYWluP1wiKSxcblx0XHRcdFx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdyZXRyeScsIFwiUmV0cnlcIiksXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRpZiAoY29uZmlybWVkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gQm9vbGVhbihhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChDSEFUX1NFVFVQX0FDVElPTl9JRCwgbW9kZSwgb3B0aW9ucykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBCb29sZWFuKHN1Y2Nlc3MpO1xuXHRcdFx0fVxuXG5cdFx0XHRwcml2YXRlIHJlc29sdmVBZ2VudElkKGFnZW50UGFyYW06IHN0cmluZywgY2hhdFdpZGdldDogSUNoYXRXaWRnZXQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdFx0XHRjb25zdCBtb2RlcyA9IGNoYXRXaWRnZXQuaW5wdXQuY3VycmVudENoYXRNb2Rlc09icy5nZXQoKTtcblx0XHRcdFx0Y29uc3QgZm91bmRBZ2VudCA9IG1vZGVzLmZpbmRNb2RlQnlJZChhZ2VudFBhcmFtKTtcblx0XHRcdFx0aWYgKGZvdW5kQWdlbnQpIHtcblx0XHRcdFx0XHRyZXR1cm4gZm91bmRBZ2VudC5pZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBhbGxBZ2VudHMgPSBbLi4ubW9kZXMuYnVpbHRpbiwgLi4ubW9kZXMuY3VzdG9tXTtcblx0XHRcdFx0Y29uc3QgbmFtZUxvd2VyID0gYWdlbnRQYXJhbS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRjb25zdCBhZ2VudEJ5TmFtZSA9IGFsbEFnZW50cy5maW5kKGFnZW50ID0+IGFnZW50Lm5hbWUuZ2V0KCkudG9Mb3dlckNhc2UoKSA9PT0gbmFtZUxvd2VyKTtcblx0XHRcdFx0cmV0dXJuIGFnZW50QnlOYW1lPy5pZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjbGFzcyBDaGF0U2V0dXBUcmlnZ2VyU3VwcG9ydEFub255bW91c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiBDSEFUX1NFVFVQX1NVUFBPUlRfQU5PTllNT1VTX0FDVElPTl9JRCxcblx0XHRcdFx0XHR0aXRsZTogQ2hhdFNldHVwVHJpZ2dlckFjdGlvbi5DSEFUX1NFVFVQX0FDVElPTl9MQUJFTFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBvcHRpb25zPzogeyBkaWFsb2dJY29uPzogVGhlbWVJY29uOyBkaWFsb2dUaXRsZT86IHN0cmluZzsgc2V0dXBTdHJhdGVneT86IENoYXRTZXR1cFN0cmF0ZWd5IH0pOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGNoYXRFbnRpdGxlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UpO1xuXG5cdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiBDSEFUX1NFVFVQX0FDVElPTl9JRCwgZnJvbTogJ2FwaScgfSk7XG5cblx0XHRcdFx0cmV0dXJuIGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKENIQVRfU0VUVVBfQUNUSU9OX0lELCB1bmRlZmluZWQsIHtcblx0XHRcdFx0XHRmb3JjZUFub255bW91czogY2hhdEVudGl0bGVtZW50U2VydmljZS5hbm9ueW1vdXMgPyBDaGF0U2V0dXBBbm9ueW1vdXMuRW5hYmxlZFdpdGhEaWFsb2cgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Li4ub3B0aW9uc1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjbGFzcyBDaGF0U2V0dXBUcmlnZ2VyRm9yY2VTaWduSW5EaWFsb2dBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC50cmlnZ2VyU2V0dXBGb3JjZVNpZ25JbicsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignZm9yY2VTaWduSW4nLCBcIlNpZ24gaW4gdG8gdXNlIEdpdEh1YiBDb3BpbG90XCIpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHsgaWQ6IENIQVRfU0VUVVBfQUNUSU9OX0lELCBmcm9tOiAnYXBpJyB9KTtcblxuXHRcdFx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9TRVRVUF9BQ1RJT05fSUQsIHVuZGVmaW5lZCwgeyBmb3JjZVNpZ25JbkRpYWxvZzogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjbGFzcyBDaGF0U2V0dXBUcmlnZ2VyQW5vbnltb3VzV2l0aG91dERpYWxvZ0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRyaWdnZXJTZXR1cEFub255bW91c1dpdGhvdXREaWFsb2cnLFxuXHRcdFx0XHRcdHRpdGxlOiBDaGF0U2V0dXBUcmlnZ2VyQWN0aW9uLkNIQVRfU0VUVVBfQUNUSU9OX0xBQkVMXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3QgdGVsZW1ldHJ5U2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHsgaWQ6IENIQVRfU0VUVVBfQUNUSU9OX0lELCBmcm9tOiAnYXBpJyB9KTtcblxuXHRcdFx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9TRVRVUF9BQ1RJT05fSUQsIHVuZGVmaW5lZCwgeyBmb3JjZUFub255bW91czogQ2hhdFNldHVwQW5vbnltb3VzLkVuYWJsZWRXaXRob3V0RGlhbG9nIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNsYXNzIENoYXRTZXR1cEZyb21BY2NvdW50c0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LnRyaWdnZXJTZXR1cEZyb21BY2NvdW50cycsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMigndHJpZ2dlckNoYXRTZXR1cEZyb21BY2NvdW50cycsIFwiU2lnbiBpbiB0byB1c2UgR2l0SHViIENvcGlsb3QuLi5cIiksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5BY2NvdW50c0NvbnRleHQsXG5cdFx0XHRcdFx0XHRncm91cDogJzJfY29waWxvdCcsXG5cdFx0XHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZEluV29ya3NwYWNlLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0XHRDT05URVhUX0RFRkFVTFRfQUNDT1VOVF9TVEFURS5ub3RFcXVhbHNUbyhEZWZhdWx0QWNjb3VudFN0YXR1cy5BdmFpbGFibGUpLCAvLyBoaWRlIG9ubHkgd2hlbiBzaWduZWQgaW4gKGEgZGVmYXVsdCBHaXRIdWIgYWNjb3VudCBpcyBwcmVzZW50KTsgc3RpbGwgc2hvd24gd2hpbGUgc2lnbmVkIG91dCBvciBiZWZvcmUgdGhlIGFjY291bnQgc3RhdGUgcmVzb2x2ZXMsIGluY2wuIHVudHJ1c3RlZCB3b3Jrc3BhY2VzIFx1MjAxNCBubyBhdXRoIHByb21wdFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuY29tcGxldGVkLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuRW50aXRsZW1lbnQuc2lnbmVkT3V0XG5cdFx0XHRcdFx0XHQpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiBDSEFUX1NFVFVQX0FDVElPTl9JRCwgZnJvbTogJ2FjY291bnRzJyB9KTtcblxuXHRcdFx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9TRVRVUF9BQ1RJT05fSUQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNsYXNzIENoYXRTZXR1cFNpZ25JblRpdGxlQmFyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0XHRcdHN0YXRpYyByZWFkb25seSBJRCA9IFNJR05fSU5fVElUTEVfQkFSX0FDVElPTl9JRDtcblxuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogQ2hhdFNldHVwU2lnbkluVGl0bGVCYXJBY3Rpb24uSUQsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzaWduSW5JbmRpY2F0b3JUaXRsZUJhckFjdGlvbicsICdTaWduIEluJyksXG5cdFx0XHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0XHRcdG1lbnU6IFt7XG5cdFx0XHRcdFx0XHRpZDogTWVudUlkLlRpdGxlQmFyQWRqYWNlbnRDZW50ZXIsXG5cdFx0XHRcdFx0XHRvcmRlcjogMCwgLy8gc2FtZSBwb3NpdGlvbiBhcyB0aGUgdXBkYXRlIGJ1dHRvblxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRJc1dlYkNvbnRleHQubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5zaWduZWRPdXQsXG5cdFx0XHRcdFx0XHRcdENPTlRFWFRfREVGQVVMVF9BQ0NPVU5UX1NUQVRFLm5vdEVxdWFsc1RvKERlZmF1bHRBY2NvdW50U3RhdHVzLkF2YWlsYWJsZSksIC8vIGhpZGUgb25seSB3aGVuIHNpZ25lZCBpbiAoYSBkZWZhdWx0IEdpdEh1YiBhY2NvdW50IGlzIHByZXNlbnQpOyBzdGlsbCBzaG93biB3aGlsZSBzaWduZWQgb3V0IG9yIGJlZm9yZSB0aGUgYWNjb3VudCBzdGF0ZSByZXNvbHZlcywgaW5jbC4gdW50cnVzdGVkIHdvcmtzcGFjZXMgXHUyMDE0IG5vIGF1dGggcHJvbXB0XG5cdFx0XHRcdFx0XHRcdENoYXRFbnRpdGxlbWVudENvbnRleHRLZXlzLmhhc0J5b2tNb2RlbHMubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5TZXR1cC5oaWRkZW4ubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZEluV29ya3NwYWNlLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5lcXVhbHMoYGNvbmZpZy4ke0NoYXRDb25maWd1cmF0aW9uLlRpdGxlQmFyU2lnbkluRW5hYmxlZH1gLCB0cnVlKSxcblx0XHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIuaGFzKCd1cGRhdGVUaXRsZUJhcicpLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0XHRJbkVkaXRvclplbk1vZGVDb250ZXh0Lm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiBDSEFUX1NFVFVQX0FDVElPTl9JRCwgZnJvbTogJ3RpdGxlYmFyJyB9KTtcblxuXHRcdFx0XHRyZXR1cm4gY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9TRVRVUF9BQ1RJT05fSUQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNsYXNzIFRvZ2dsZVNpZ25JblRpdGxlQmFyQWN0aW9uIGV4dGVuZHMgVG9nZ2xlVGl0bGVCYXJDb25maWdBY3Rpb24ge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKFxuXHRcdFx0XHRcdENoYXRDb25maWd1cmF0aW9uLlRpdGxlQmFyU2lnbkluRW5hYmxlZCxcblx0XHRcdFx0XHRsb2NhbGl6ZSgndG9nZ2xlLmNoYXRTaWduSW4nLCAnQ29waWxvdCBTaWduIEluJyksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3RvZ2dsZS5jaGF0U2lnbkluRGVzY3JpcHRpb24nLCBcIlRvZ2dsZSB2aXNpYmlsaXR5IG9mIHRoZSBDb3BpbG90IFNpZ24gSW4gYnV0dG9uIGluIHRpdGxlIGJhclwiKSxcblx0XHRcdFx0XHQzLFxuXHRcdFx0XHRcdENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0XHRcdElzV2ViQ29udGV4dC5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5zaWduZWRPdXQsXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCksXG5cdFx0XHRcdFx0KVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHdpbmRvd0ZvY3VzTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0Y2xhc3MgVXBncmFkZVBsYW5BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQudXBncmFkZVBsYW4nLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ21hbmFnZVBsYW4nLCBcIlVwZ3JhZGUgdG8gR2l0SHViIENvcGlsb3QgUHJvXCIpLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBsb2NhbGl6ZTIoJ2NoYXQuY2F0ZWdvcnknLCAnQ2hhdCcpLFxuXHRcdFx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5TZXR1cC5kaXNhYmxlZEluV29ya3NwYWNlLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5jYW5TaWduVXAsXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5wbGFuRnJlZVxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGl0bGVCYXJNZW51LFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICdhX2ZpcnN0Jyxcblx0XHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuRW50aXRsZW1lbnQucGxhbkZyZWUsXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0UXVvdGFFeGNlZWRlZCxcblx0XHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY29tcGxldGlvbnNRdW90YUV4Y2VlZGVkXG5cdFx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3Qgb3BlbmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJT3BlbmVyU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlZmF1bHRBY2NvdW50U2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcm9kdWN0U2VydmljZSk7XG5cblx0XHRcdFx0dGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkRXZlbnQsIFdvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkQ2xhc3NpZmljYXRpb24+KCd3b3JrYmVuY2hBY3Rpb25FeGVjdXRlZCcsIHsgaWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQudXBncmFkZVBsYW4nLCBmcm9tOiAnY29tbWFuZCcgfSk7XG5cblx0XHRcdFx0Y29uc3QgYmFzZVVybCA9IGRlZmF1bHRBY2NvdW50U2VydmljZS5yZXNvbHZlR2l0SHViVXJsKEdpdEh1YlBhdGhzLmNvcGlsb3RVcGdyYWRlKTtcblx0XHRcdFx0Y29uc3QgdXBncmFkZVVybCA9IGJ1aWxkVXBncmFkZVVybFdpdGhSZWRpcmVjdChiYXNlVXJsLCBwcm9kdWN0U2VydmljZS51cmxQcm90b2NvbCwgcHJvZHVjdFNlcnZpY2UucXVhbGl0eSk7XG5cdFx0XHRcdG9wZW5lclNlcnZpY2Uub3Blbih1cGdyYWRlVXJsKTtcblxuXHRcdFx0XHRjb25zdCBlbnRpdGxlbWVudCA9IGNvbnRleHQuc3RhdGUuZW50aXRsZW1lbnQ7XG5cdFx0XHRcdGlmICghaXNQcm9Vc2VyKGVudGl0bGVtZW50KSkge1xuXHRcdFx0XHRcdC8vIElmIHRoZSB1c2VyIGlzIG5vdCB5ZXQgUHJvLCB3ZSBsaXN0ZW4gdG8gd2luZG93IGZvY3VzIHRvIHJlZnJlc2ggdGhlIHRva2VuXG5cdFx0XHRcdFx0Ly8gd2hlbiB0aGUgdXNlciBoYXMgY29tZSBiYWNrIHRvIHRoZSB3aW5kb3cgYXNzdW1pbmcgdGhlIHVzZXIgc2lnbmVkIHVwLlxuXHRcdFx0XHRcdC8vIFRoaXMgc2VydmVzIGFzIGEgZmFsbGJhY2sgd2hlbiB0aGUgcmVkaXJlY3QgZG9lcyBub3QgZmlyZS5cblx0XHRcdFx0XHR3aW5kb3dGb2N1c0xpc3RlbmVyLnZhbHVlID0gaG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1cyhmb2N1cyA9PiB0aGlzLm9uV2luZG93Rm9jdXMoZm9jdXMsIGNvbW1hbmRTZXJ2aWNlKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cHJpdmF0ZSBhc3luYyBvbldpbmRvd0ZvY3VzKGZvY3VzOiBib29sZWFuLCBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGlmIChmb2N1cykge1xuXHRcdFx0XHRcdHdpbmRvd0ZvY3VzTGlzdGVuZXIuY2xlYXIoKTtcblxuXHRcdFx0XHRcdGNvbnN0IGVudGl0bGVtZW50cyA9IGF3YWl0IHJlcXVlc3RzLmZvcmNlUmVzb2x2ZUVudGl0bGVtZW50KCk7XG5cdFx0XHRcdFx0aWYgKGVudGl0bGVtZW50cz8uZW50aXRsZW1lbnQgJiYgaXNQcm9Vc2VyKGVudGl0bGVtZW50cz8uZW50aXRsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRyZWZyZXNoVG9rZW5zKGNvbW1hbmRTZXJ2aWNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjbGFzcyBNYW5hZ2VBZGRpdGlvbmFsU3BlbmRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQubWFuYWdlQWRkaXRpb25hbFNwZW5kJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtYW5hZ2VBZGRpdGlvbmFsU3BlbmQnLCBcIk1hbmFnZSBHaXRIdWIgQ29waWxvdCBCdWRnZXRcIiksXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IGxvY2FsaXplMignY2hhdC5jYXRlZ29yeScsICdDaGF0JyksXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLFxuXHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCksXG5cdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5Qcm8sXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5wbGFuUHJvUGx1cyxcblx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5NYXgsXG5cdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5FbnRpdGxlbWVudC5wbGFuRWR1LFxuXHRcdFx0XHRcdFx0KVxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0bWVudToge1xuXHRcdFx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGl0bGVCYXJNZW51LFxuXHRcdFx0XHRcdFx0Z3JvdXA6ICdhX2ZpcnN0Jyxcblx0XHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuRW50aXRsZW1lbnQucGxhblBybyxcblx0XHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuRW50aXRsZW1lbnQucGxhblByb1BsdXMsXG5cdFx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5NYXgsXG5cdFx0XHRcdFx0XHRcdFx0Q2hhdENvbnRleHRLZXlzLkVudGl0bGVtZW50LnBsYW5FZHUsXG5cdFx0XHRcdFx0XHRcdCksXG5cdFx0XHRcdFx0XHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0UXVvdGFFeGNlZWRlZCxcblx0XHRcdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY29tcGxldGlvbnNRdW90YUV4Y2VlZGVkXG5cdFx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHRcdClcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3Qgb3BlbmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJT3BlbmVyU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHRlbGVtZXRyeVNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBkZWZhdWx0QWNjb3VudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURlZmF1bHRBY2NvdW50U2VydmljZSk7XG5cdFx0XHRcdHRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZEV2ZW50LCBXb3JrYmVuY2hBY3Rpb25FeGVjdXRlZENsYXNzaWZpY2F0aW9uPignd29ya2JlbmNoQWN0aW9uRXhlY3V0ZWQnLCB7IGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm1hbmFnZUFkZGl0aW9uYWxTcGVuZCcsIGZyb206ICdjb21tYW5kJyB9KTtcblx0XHRcdFx0b3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZShkZWZhdWx0QWNjb3VudFNlcnZpY2UucmVzb2x2ZUdpdEh1YlVybChHaXRIdWJQYXRocy5iaWxsaW5nQnVkZ2V0cykpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZWdpc3RlckFjdGlvbjIoQ2hhdFNldHVwVHJpZ2dlckFjdGlvbik7XG5cdFx0cmVnaXN0ZXJBY3Rpb24yKENoYXRTZXR1cFRyaWdnZXJGb3JjZVNpZ25JbkRpYWxvZ0FjdGlvbik7XG5cdFx0cmVnaXN0ZXJBY3Rpb24yKENoYXRTZXR1cEZyb21BY2NvdW50c0FjdGlvbik7XG5cdFx0cmVnaXN0ZXJBY3Rpb24yKENoYXRTZXR1cFNpZ25JblRpdGxlQmFyQWN0aW9uKTtcblx0XHRyZWdpc3RlckFjdGlvbjIoVG9nZ2xlU2lnbkluVGl0bGVCYXJBY3Rpb24pO1xuXHRcdHJlZ2lzdGVyQWN0aW9uMihDaGF0U2V0dXBUcmlnZ2VyQW5vbnltb3VzV2l0aG91dERpYWxvZ0FjdGlvbik7XG5cdFx0cmVnaXN0ZXJBY3Rpb24yKENoYXRTZXR1cFRyaWdnZXJTdXBwb3J0QW5vbnltb3VzQWN0aW9uKTtcblx0XHRyZWdpc3RlckFjdGlvbjIoVXBncmFkZVBsYW5BY3Rpb24pO1xuXHRcdHJlZ2lzdGVyQWN0aW9uMihNYW5hZ2VBZGRpdGlvbmFsU3BlbmRBY3Rpb24pO1xuXG5cdFx0Ly8jZW5kcmVnaW9uXG5cblx0XHQvLyNyZWdpb24gRWRpdG9yIENvbnRleHQgTWVudVxuXG5cdFx0ZnVuY3Rpb24gcmVnaXN0ZXJHZW5lcmF0ZUNvZGVDb21tYW5kKGNvcmVDb21tYW5kOiAnY2hhdC5pbnRlcm5hbC5leHBsYWluJyB8ICdjaGF0LmludGVybmFsLmZpeCcgfCAnY2hhdC5pbnRlcm5hbC5yZXZpZXcnLCBhY3R1YWxDb21tYW5kOiBzdHJpbmcpOiB2b2lkIHtcblxuXHRcdFx0Q29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoY29yZUNvbW1hbmQsIGFzeW5jIChhY2Nlc3NvciwgLi4uYXJncykgPT4ge1xuXHRcdFx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBjb2RlRWRpdG9yU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29kZUVkaXRvclNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElNYXJrZXJTZXJ2aWNlKTtcblxuXHRcdFx0XHRzd2l0Y2ggKGNvcmVDb21tYW5kKSB7XG5cdFx0XHRcdFx0Y2FzZSAnY2hhdC5pbnRlcm5hbC5leHBsYWluJzpcblx0XHRcdFx0XHRjYXNlICdjaGF0LmludGVybmFsLmZpeCc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHRleHRFZGl0b3IgPSBjb2RlRWRpdG9yU2VydmljZS5nZXRBY3RpdmVDb2RlRWRpdG9yKCk7XG5cdFx0XHRcdFx0XHRjb25zdCB1cmkgPSB0ZXh0RWRpdG9yPy5nZXRNb2RlbCgpPy51cmk7XG5cdFx0XHRcdFx0XHRjb25zdCByYW5nZSA9IHRleHRFZGl0b3I/LmdldFNlbGVjdGlvbigpO1xuXHRcdFx0XHRcdFx0aWYgKCF1cmkgfHwgIXJhbmdlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Y29uc3QgbWFya2VycyA9IEFJQ29kZUFjdGlvbnNIZWxwZXIud2FybmluZ09yRXJyb3JNYXJrZXJzQXRSYW5nZShtYXJrZXJTZXJ2aWNlLCB1cmksIHJhbmdlKTtcblxuXHRcdFx0XHRcdFx0Y29uc3QgYWN0dWFsQ29tbWFuZCA9IGNvcmVDb21tYW5kID09PSAnY2hhdC5pbnRlcm5hbC5leHBsYWluJ1xuXHRcdFx0XHRcdFx0XHQ/IEFJQ29kZUFjdGlvbnNIZWxwZXIuZXhwbGFpbk1hcmtlcnMobWFya2Vycylcblx0XHRcdFx0XHRcdFx0OiBBSUNvZGVBY3Rpb25zSGVscGVyLmZpeE1hcmtlcnMobWFya2VycywgcmFuZ2UpO1xuXG5cdFx0XHRcdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChhY3R1YWxDb21tYW5kLmlkLCAuLi4oYWN0dWFsQ29tbWFuZC5hcmd1bWVudHMgPz8gW10pKTtcblxuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgJ2NoYXQuaW50ZXJuYWwucmV2aWV3Jzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9TRVRVUF9TVVBQT1JUX0FOT05ZTU9VU19BQ1RJT05fSUQpO1xuXHRcdFx0XHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCBjb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChhY3R1YWxDb21tYW5kKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJlZ2lzdGVyR2VuZXJhdGVDb2RlQ29tbWFuZCgnY2hhdC5pbnRlcm5hbC5leHBsYWluJywgJ2dpdGh1Yi5jb3BpbG90LmNoYXQuZXhwbGFpbicpO1xuXHRcdHJlZ2lzdGVyR2VuZXJhdGVDb2RlQ29tbWFuZCgnY2hhdC5pbnRlcm5hbC5maXgnLCAnZ2l0aHViLmNvcGlsb3QuY2hhdC5maXgnKTtcblx0XHRyZWdpc3RlckdlbmVyYXRlQ29kZUNvbW1hbmQoJ2NoYXQuaW50ZXJuYWwucmV2aWV3JywgJ2dpdGh1Yi5jb3BpbG90LmNoYXQucmV2aWV3Jyk7XG5cblx0XHRjb25zdCBpbnRlcm5hbEdlbmVyYXRlQ29kZUNvbnRleHQgPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuaGlkZGVuLm5lZ2F0ZSgpLFxuXHRcdFx0Q2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCksXG5cdFx0XHRDaGF0Q29udGV4dEtleXMuU2V0dXAuY29tcGxldGVkLm5lZ2F0ZSgpLFxuXHRcdCk7XG5cblx0XHRNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkVkaXRvckNvbnRleHQsIHtcblx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0aWQ6ICdjaGF0LmludGVybmFsLmV4cGxhaW4nLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2V4cGxhaW4nLCBcIkV4cGxhaW5cIiksXG5cdFx0XHR9LFxuXHRcdFx0Z3JvdXA6ICcxX2NoYXQnLFxuXHRcdFx0b3JkZXI6IDQsXG5cdFx0XHR3aGVuOiBpbnRlcm5hbEdlbmVyYXRlQ29kZUNvbnRleHRcblx0XHR9KTtcblxuXHRcdE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuRWRpdG9yQ29udGV4dCwge1xuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogJ2NoYXQuaW50ZXJuYWwuZml4Jyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdmaXgnLCBcIkZpeFwiKSxcblx0XHRcdH0sXG5cdFx0XHRncm91cDogJzFfY2hhdCcsXG5cdFx0XHRvcmRlcjogNSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChcblx0XHRcdFx0aW50ZXJuYWxHZW5lcmF0ZUNvZGVDb250ZXh0LFxuXHRcdFx0XHRFZGl0b3JDb250ZXh0S2V5cy5yZWFkT25seS5uZWdhdGUoKVxuXHRcdFx0KVxuXHRcdH0pO1xuXG5cdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5FZGl0b3JDb250ZXh0LCB7XG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiAnY2hhdC5pbnRlcm5hbC5yZXZpZXcnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3JldmlldycsIFwiQ29kZSBSZXZpZXdcIiksXG5cdFx0XHR9LFxuXHRcdFx0Z3JvdXA6ICcxX2NoYXQnLFxuXHRcdFx0b3JkZXI6IDYsXG5cdFx0XHR3aGVuOiBpbnRlcm5hbEdlbmVyYXRlQ29kZUNvbnRleHRcblx0XHR9KTtcblxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNpZ25JblRpdGxlQmFyRW50cnkoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlOiBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uVmlld0l0ZW1TZXJ2aWNlLnJlZ2lzdGVyKFxuXHRcdFx0TWVudUlkLlRpdGxlQmFyQWRqYWNlbnRDZW50ZXIsXG5cdFx0XHRTSUdOX0lOX1RJVExFX0JBUl9BQ1RJT05fSUQsXG5cdFx0XHQoYWN0aW9uLCBvcHRpb25zKSA9PiBuZXcgU2lnbkluVGl0bGVCYXJFbnRyeShhY3Rpb24sIG9wdGlvbnMpXG5cdFx0KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVXJsTGlua0hhbmRsZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXh0ZW5zaW9uVXJsSGFuZGxlck92ZXJyaWRlUmVnaXN0cnkucmVnaXN0ZXJIYW5kbGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFNldHVwRXh0ZW5zaW9uVXJsSGFuZGxlcikpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2hlY2tFeHRlbnNpb25JbnN0YWxsYXRpb24oY29udGV4dDogQ2hhdEVudGl0bGVtZW50Q29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gV2hlbiBkZXZlbG9waW5nIGV4dGVuc2lvbnMsIGF3YWl0IHJlZ2lzdHJhdGlvbiBhbmQgdGhlbiBjaGVja1xuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0V4dGVuc2lvbkRldmVsb3BtZW50KSB7XG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCk7XG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMuZmluZChleHQgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHMoZXh0LmlkZW50aWZpZXIsIGRlZmF1bHRDaGF0LmNoYXRFeHRlbnNpb25JZCkpKSB7XG5cdFx0XHRcdGNvbnRleHQudXBkYXRlKHsgaW5zdGFsbGVkOiB0cnVlLCBkaXNhYmxlZDogZmFsc2UsIHVudHJ1c3RlZDogZmFsc2UsIGRpc2FibGVkSW5Xb3Jrc3BhY2U6IGZhbHNlIH0pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQXdhaXQgZXh0ZW5zaW9ucyB0byBiZSByZWFkeSB0byBiZSBxdWVyaWVkXG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5xdWVyeUxvY2FsKCk7XG5cblx0XHQvLyBMaXN0ZW4gdG8gZXh0ZW5zaW9ucyBjaGFuZ2UgYW5kIHByb2Nlc3MgZXh0ZW5zaW9ucyBvbmNlXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlPElFeHRlbnNpb24gfCB1bmRlZmluZWQ+KHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub25DaGFuZ2UsIGUgPT4ge1xuXHRcdFx0aWYgKGUgJiYgIUV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGUuaWRlbnRpZmllci5pZCwgZGVmYXVsdENoYXQuY2hhdEV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIHVucmVsYXRlZCBldmVudFxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdEV4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmluZCh2YWx1ZSA9PiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyh2YWx1ZS5pZGVudGlmaWVyLmlkLCBkZWZhdWx0Q2hhdC5jaGF0RXh0ZW5zaW9uSWQpKTtcblx0XHRcdGNvbnN0IGluc3RhbGxlZCA9ICEhZGVmYXVsdENoYXRFeHRlbnNpb24/LmxvY2FsO1xuXG5cdFx0XHRsZXQgZGlzYWJsZWQ6IGJvb2xlYW47XG5cdFx0XHRsZXQgdW50cnVzdGVkID0gZmFsc2U7XG5cdFx0XHRsZXQgZGlzYWJsZWRJbldvcmtzcGFjZSA9IGZhbHNlO1xuXHRcdFx0aWYgKGluc3RhbGxlZCkge1xuXHRcdFx0XHRkaXNhYmxlZCA9ICF0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZChkZWZhdWx0Q2hhdEV4dGVuc2lvbi5sb2NhbCk7XG5cdFx0XHRcdGlmIChkaXNhYmxlZCkge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5nZXRFbmFibGVtZW50U3RhdGUoZGVmYXVsdENoYXRFeHRlbnNpb24ubG9jYWwpO1xuXHRcdFx0XHRcdGlmIChzdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlUcnVzdFJlcXVpcmVtZW50KSB7XG5cdFx0XHRcdFx0XHRkaXNhYmxlZCA9IGZhbHNlOyAvLyBub3QgZGlzYWJsZWQgYnkgdXNlciBjaG9pY2UgYnV0XG5cdFx0XHRcdFx0XHR1bnRydXN0ZWQgPSB0cnVlOyAvLyBieSBtaXNzaW5nIHdvcmtzcGFjZSB0cnVzdFxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoc3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZSkge1xuXHRcdFx0XHRcdFx0ZGlzYWJsZWRJbldvcmtzcGFjZSA9IHRydWU7IC8vIGRpc2FibGVkIGF0IHdvcmtzcGFjZSBsZXZlbFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGlzYWJsZWQgPSBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29udGV4dC51cGRhdGUoeyBpbnN0YWxsZWQsIGRpc2FibGVkLCB1bnRydXN0ZWQsIGRpc2FibGVkSW5Xb3Jrc3BhY2UgfSk7XG5cdFx0fSkpO1xuXHR9XG59XG5cbmNsYXNzIENoYXRTZXR1cEV4dGVuc2lvblVybEhhbmRsZXIgaW1wbGVtZW50cyBJRXh0ZW5zaW9uVXJsSGFuZGxlck92ZXJyaWRlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBVUEdSQURFX1NVQ0NFU1NfTk9USUZJQ0FUSU9OX0lEID0gJ2NvcGlsb3QudXBncmFkZVN1Y2Nlc3MnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVudGl0bGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRFbnRpdGxlbWVudFNlcnZpY2U6IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2U6IElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGNhbkhhbmRsZVVSTCh1cmw6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB1cmwuc2NoZW1lID09PSB0aGlzLnByb2R1Y3RTZXJ2aWNlLnVybFByb3RvY29sICYmIGVxdWFsc0lnbm9yZUNhc2UodXJsLmF1dGhvcml0eSwgZGVmYXVsdENoYXQuY2hhdEV4dGVuc2lvbklkKTtcblx0fVxuXG5cdGFzeW5jIGhhbmRsZVVSTCh1cmw6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICh1cmwucGF0aCA9PT0gJy91cGdyYWRlLXN1Y2Nlc3MnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faGFuZGxlVXBncmFkZVN1Y2Nlc3MoKTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKHVybC5xdWVyeSk7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogQ0hBVF9TRVRVUF9BQ1RJT05fSUQsIGZyb206ICd1cmwnLCBkZXRhaWw6IHBhcmFtcy5nZXQoJ3JlZmVycmVyJykgPz8gdW5kZWZpbmVkIH0pO1xuXG5cdFx0Y29uc3QgYWdlbnRQYXJhbSA9IHBhcmFtcy5nZXQoJ2FnZW50JykgPz8gcGFyYW1zLmdldCgnbW9kZScpO1xuXHRcdGNvbnN0IGlucHV0UGFyYW0gPSBwYXJhbXMuZ2V0KCdwcm9tcHQnKTtcblx0XHRpZiAoIWFnZW50UGFyYW0gJiYgIWlucHV0UGFyYW0pIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKENIQVRfU0VUVVBfQUNUSU9OX0lELCBhZ2VudFBhcmFtLCBpbnB1dFBhcmFtID8geyBpbnB1dFZhbHVlOiBpbnB1dFBhcmFtIH0gOiB1bmRlZmluZWQpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaGFuZGxlVXBncmFkZVN1Y2Nlc3MoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRFdmVudCwgV29ya2JlbmNoQWN0aW9uRXhlY3V0ZWRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtiZW5jaEFjdGlvbkV4ZWN1dGVkJywgeyBpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC51cGdyYWRlUGxhbicsIGZyb206ICdyZWRpcmVjdCcgfSk7XG5cblx0XHQvLyBSZWZyZXNoIGVudGl0bGVtZW50cyBhbmQgdG9rZW5zIHRvIHBpY2sgdXAgdGhlIG5ldyBwbGFuXG5cdFx0YXdhaXQgdGhpcy5jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLnVwZGF0ZShDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRyZWZyZXNoVG9rZW5zKHRoaXMuY29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0Ly8gU2hvdyBhIGNoYXQgaW5wdXQgbm90aWZpY2F0aW9uIGluZm9ybWluZyB0aGUgdXNlclxuXHRcdHRoaXMuY2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZS5zZXROb3RpZmljYXRpb24oe1xuXHRcdFx0aWQ6IENoYXRTZXR1cEV4dGVuc2lvblVybEhhbmRsZXIuVVBHUkFERV9TVUNDRVNTX05PVElGSUNBVElPTl9JRCxcblx0XHRcdHNldmVyaXR5OiBDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3VwZ3JhZGVTdWNjZXNzJywgXCJVcGdyYWRlIFN1Y2Nlc3NmdWxcIiksXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3VwZ3JhZGVTdWNjZXNzRGVzY3JpcHRpb24nLCBcIlBsZWFzZSB3YWl0IHVwIHRvIDEwIG1pbnV0ZXMgZm9yIHlvdXIgbmV3IHBsYW4gdG8gYXBwbHkuXCIpLFxuXHRcdFx0YWN0aW9uczogW10sXG5cdFx0XHRkaXNtaXNzaWJsZTogdHJ1ZSxcblx0XHRcdGF1dG9EaXNtaXNzT25NZXNzYWdlOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENoYXRUZWFyZG93bkNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhdFRlYXJkb3duJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgY2hhdEVudGl0bGVtZW50U2VydmljZTogQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASVdvcmtiZW5jaExheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGNoYXRFbnRpdGxlbWVudFNlcnZpY2UuY29udGV4dD8udmFsdWU7XG5cdFx0aWYgKCFjb250ZXh0KSB7XG5cdFx0XHRyZXR1cm47IC8vIGRpc2FibGVkXG5cdFx0fVxuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHRcdHRoaXMucmVnaXN0ZXJBY3Rpb25zKCk7XG5cblx0XHR0aGlzLmhhbmRsZUNoYXREaXNhYmxlZChmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUNoYXREaXNhYmxlZChmcm9tRXZlbnQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBjaGF0RGlzYWJsZWQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3QoQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQpO1xuXHRcdGlmIChjaGF0RGlzYWJsZWQudmFsdWUgPT09IHRydWUpIHtcblx0XHRcdHRoaXMubWF5YmVFbmFibGVPckRpc2FibGVFeHRlbnNpb24odHlwZW9mIGNoYXREaXNhYmxlZC53b3Jrc3BhY2VWYWx1ZSA9PT0gJ2Jvb2xlYW4nID8gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlIDogRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkR2xvYmFsbHkpO1xuXHRcdFx0aWYgKGZyb21FdmVudCkge1xuXHRcdFx0XHR0aGlzLm1heWJlSGlkZUF1eGlsaWFyeUJhcigpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoY2hhdERpc2FibGVkLnZhbHVlID09PSBmYWxzZSAmJiBmcm9tRXZlbnQgLyogZG8gbm90IGVuYWJsZSBleHRlbnNpb25zIHVubGVzcyBpdHMgYW4gZXhwbGljaXQgc2V0dGluZ3MgY2hhbmdlICovKSB7XG5cdFx0XHR0aGlzLm1heWJlRW5hYmxlT3JEaXNhYmxlRXh0ZW5zaW9uKHR5cGVvZiBjaGF0RGlzYWJsZWQud29ya3NwYWNlVmFsdWUgPT09ICdib29sZWFuJyA/IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlIDogRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWdpc3Rlckxpc3RlbmVycygpOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIENvbmZpZ3VyYXRpb24gY2hhbmdlc1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKCFlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRBSURpc2FibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuaGFuZGxlQ2hhdERpc2FibGVkKHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEV4dGVuc2lvbiBpbnN0YWxsYXRpb25cblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnF1ZXJ5TG9jYWwoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9uQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUgJiYgIUV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGUuaWRlbnRpZmllci5pZCwgZGVmYXVsdENoYXQuY2hhdEV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHRyZXR1cm47IC8vIHVucmVsYXRlZCBldmVudFxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdEV4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuZmluZCh2YWx1ZSA9PiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyh2YWx1ZS5pZGVudGlmaWVyLmlkLCBkZWZhdWx0Q2hhdC5jaGF0RXh0ZW5zaW9uSWQpKTtcblx0XHRcdGlmIChkZWZhdWx0Q2hhdEV4dGVuc2lvbj8ubG9jYWwgJiYgdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoZGVmYXVsdENoYXRFeHRlbnNpb24ubG9jYWwpKSB7XG5cdFx0XHRcdGlmIChkZWZhdWx0Q2hhdEV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlKSB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdChDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCkud29ya3NwYWNlVmFsdWUgPT09IHRydWUpIHtcblx0XHRcdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQsIGZhbHNlLCBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQsIGZhbHNlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgbWF5YmVFbmFibGVPckRpc2FibGVFeHRlbnNpb24oc3RhdGU6IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkR2xvYmFsbHkgfCBFbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZSB8IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEdsb2JhbGx5IHwgRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGVmYXVsdENoYXRFeHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLmZpbmQodmFsdWUgPT4gRXh0ZW5zaW9uSWRlbnRpZmllci5lcXVhbHModmFsdWUuaWRlbnRpZmllci5pZCwgZGVmYXVsdENoYXQuY2hhdEV4dGVuc2lvbklkKSk7XG5cdFx0aWYgKCFkZWZhdWx0Q2hhdEV4dGVuc2lvbj8ubG9jYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBzdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UgfHwgc3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFdvcmtzcGFjZTtcblx0XHRjb25zdCBjYW5DaGFuZ2UgPSB3b3Jrc3BhY2Vcblx0XHRcdD8gdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5jYW5DaGFuZ2VXb3Jrc3BhY2VFbmFibGVtZW50KGRlZmF1bHRDaGF0RXh0ZW5zaW9uLmxvY2FsKVxuXHRcdFx0OiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmNhbkNoYW5nZUVuYWJsZW1lbnQoZGVmYXVsdENoYXRFeHRlbnNpb24ubG9jYWwpO1xuXHRcdGlmICghY2FuQ2hhbmdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5zZXRFbmFibGVtZW50KFtkZWZhdWx0Q2hhdEV4dGVuc2lvbl0sIHN0YXRlKTtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnVwZGF0ZVJ1bm5pbmdFeHRlbnNpb25zKHN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEdsb2JhbGx5IHx8IHN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZSA/IGxvY2FsaXplKCdyZXN0YXJ0RXh0ZW5zaW9uSG9zdC5yZWFzb24uZW5hYmxlJywgXCJFbmFibGluZyBBSSBmZWF0dXJlc1wiKSA6IGxvY2FsaXplKCdyZXN0YXJ0RXh0ZW5zaW9uSG9zdC5yZWFzb24uZGlzYWJsZScsIFwiRGlzYWJsaW5nIEFJIGZlYXR1cmVzXCIpKTtcblx0fVxuXG5cdHByaXZhdGUgbWF5YmVIaWRlQXV4aWxpYXJ5QmFyKCk6IHZvaWQge1xuXHRcdGNvbnN0IGFjdGl2ZUNvbnRhaW5lcnMgPSB0aGlzLnZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyc0J5TG9jYXRpb24oVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcikuZmlsdGVyKFxuXHRcdFx0Y29udGFpbmVyID0+IHRoaXMudmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbChjb250YWluZXIpLmFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGggPiAwXG5cdFx0KTtcblx0XHRpZiAoXG5cdFx0XHQoYWN0aXZlQ29udGFpbmVycy5sZW5ndGggPT09IDApIHx8ICBcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdC8vIGNoYXQgdmlldyBpcyBhbHJlYWR5IGdvbmUgYnV0IHdlIGtub3cgaXQgd2FzIHRoZXJlIGJlZm9yZVxuXHRcdFx0KGFjdGl2ZUNvbnRhaW5lcnMubGVuZ3RoID09PSAxICYmIGFjdGl2ZUNvbnRhaW5lcnMuYXQoMCk/LmlkID09PSBDaGF0Vmlld0NvbnRhaW5lcklkKSBcdC8vIGNoYXQgdmlldyBpcyB0aGUgb25seSB2aWV3IHdoaWNoIGlzIGdvaW5nIHRvIGdvIGF3YXlcblx0XHQpIHtcblx0XHRcdHRoaXMubGF5b3V0U2VydmljZS5zZXRQYXJ0SGlkZGVuKHRydWUsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKTsgLy8gaGlkZSBpZiB0aGVyZSBhcmUgbm8gdmlld3MgaW4gdGhlIHNlY29uZGFyeSBzaWRlYmFyXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckFjdGlvbnMoKTogdm9pZCB7XG5cblx0XHRjbGFzcyBDaGF0U2V0dXBIaWRlQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cblx0XHRcdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuaGlkZVNldHVwJztcblx0XHRcdHN0YXRpYyByZWFkb25seSBUSVRMRSA9IGxvY2FsaXplMignaGlkZUNoYXRTZXR1cCcsIFwiTGVhcm4gSG93IHRvIEhpZGUgQUkgRmVhdHVyZXNcIik7XG5cblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcih7XG5cdFx0XHRcdFx0aWQ6IENoYXRTZXR1cEhpZGVBY3Rpb24uSUQsXG5cdFx0XHRcdFx0dGl0bGU6IENoYXRTZXR1cEhpZGVBY3Rpb24uVElUTEUsXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQ2hhdENvbnRleHRLZXlzLlNldHVwLmhpZGRlbi5uZWdhdGUoKSwgQ2hhdENvbnRleHRLZXlzLlNldHVwLmRpc2FibGVkSW5Xb3Jrc3BhY2UubmVnYXRlKCkpLFxuXHRcdFx0XHRcdG1lbnU6IHtcblx0XHRcdFx0XHRcdGlkOiBNZW51SWQuQ2hhdFRpdGxlQmFyTWVudSxcblx0XHRcdFx0XHRcdGdyb3VwOiAnel9oaWRlJyxcblx0XHRcdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRcdFx0d2hlbjogQ2hhdENvbnRleHRLZXlzLlNldHVwLmNvbXBsZXRlZC5uZWdhdGUoKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25zdCBwcmVmZXJlbmNlc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVByZWZlcmVuY2VzU2VydmljZSk7XG5cblx0XHRcdFx0cHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5TZXR0aW5ncyh7IGpzb25FZGl0b3I6IGZhbHNlLCBxdWVyeTogYEBpZDoke0NoYXRBSURpc2FibGVkU2V0dGluZ0lkfWAgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmVnaXN0ZXJBY3Rpb24yKENoYXRTZXR1cEhpZGVBY3Rpb24pO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG4vKipcbiAqIEN1c3RvbSBhY3Rpb24gdmlldyBpdGVtIHRoYXQgcmVuZGVycyBhIFwiU2lnbiBJblwiIGJ1dHRvblxuICogaW4gdGhlIHRpdGxlIGJhciB3aXRoIHByb21pbmVudCBidXR0b24gc3R5bGluZy5cbiAqL1xuY2xhc3MgU2lnbkluVGl0bGVCYXJFbnRyeSBleHRlbmRzIEJhc2VBY3Rpb25WaWV3SXRlbSB7XG5cblx0cHJpdmF0ZSBsYWJlbDogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBJQWN0aW9uLFxuXHRcdG9wdGlvbnM6IElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHQpIHtcblx0XHRzdXBlcih1bmRlZmluZWQsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblxuXHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuYWN0aW9uLmxhYmVsKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy51cGRhdGUtaW5kaWNhdG9yLnByb21pbmVudCcpKTtcblx0XHR0aGlzLmxhYmVsID0gZG9tLmFwcGVuZChjb250ZW50LCBkb20uJCgnLmluZGljYXRvci1sYWJlbCcpKTtcblx0XHR0aGlzLmxhYmVsLnRleHRDb250ZW50ID0gdGhpcy5hY3Rpb24ubGFiZWw7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlTGFiZWwoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubGFiZWwpIHtcblx0XHRcdHRoaXMubGFiZWwudGV4dENvbnRlbnQgPSB0aGlzLmFjdGlvbi5sYWJlbDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRoaXMuYWN0aW9uLmxhYmVsKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgdXBkYXRlRW5hYmxlZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCAhdGhpcy5hY3Rpb24uZW5hYmxlZCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDBCQUFzRDtBQUUvRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsWUFBWSxpQkFBaUIsaUJBQWlCLHlCQUF5QjtBQUNoRixPQUFPLGNBQWM7QUFDckIsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxXQUFXO0FBRXBCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxTQUFTLFFBQVEsY0FBYyx1QkFBdUI7QUFDL0QsU0FBUyxrQkFBa0IsdUJBQXVCO0FBQ2xELFNBQVMscUJBQXFCLDZCQUE2QjtBQUMzRCxTQUFTLGdCQUFnQiwwQkFBMEI7QUFDbkQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsT0FBTyxhQUFhO0FBQ3BCLFNBQVMsYUFBYSw4QkFBOEI7QUFDcEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxrQ0FBa0M7QUFFM0MsU0FBUyx3QkFBd0IsNkJBQTZCO0FBQzlELFNBQVMsaUJBQXlDLDRCQUE2RSx5QkFBeUIsaUJBQWlCO0FBQ3pLLFNBQVMsaUJBQWlCLDRDQUE0QztBQUN0RSxTQUFTLDJDQUF5RTtBQUNsRixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLCtCQUErQiw0QkFBNEI7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
