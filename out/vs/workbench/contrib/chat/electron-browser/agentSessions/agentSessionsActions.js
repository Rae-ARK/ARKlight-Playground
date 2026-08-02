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
import "./media/openInAgents.css";
import { $, append } from "../../../../../base/browser/dom.js";
import { BaseActionViewItem } from "../../../../../base/browser/ui/actionbar/actionViewItems.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { localize, localize2 } from "../../../../../nls.js";
import { IActionViewItemService } from "../../../../../platform/actions/browser/actionViewItemService.js";
import { Action2, MenuId } from "../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from "../../../../../platform/accessibility/common/accessibility.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { KeyCode, KeyMod } from "../../../../../base/common/keyCodes.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { INativeHostService } from "../../../../../platform/native/common/native.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
import { Schemas } from "../../../../../base/common/network.js";
import { URI } from "../../../../../base/common/uri.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../../platform/workspace/common/workspace.js";
import { IsSessionsWindowContext } from "../../../../common/contextkeys.js";
import { ToggleTitleBarConfigAction } from "../../../../browser/parts/titlebar/titlebarActions.js";
import { CHAT_CATEGORY } from "../../browser/actions/chatActions.js";
import { IChatWidgetService } from "../../browser/chat.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { SessionType } from "../../common/chatSessionsService.js";
import { getChatSessionType, isUntitledChatSession } from "../../common/model/chatUri.js";
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService } from "../../browser/widget/input/chatInputNotificationService.js";
import { OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, OPEN_AGENTS_WINDOW_PRECONDITION, OPEN_AGENTS_WINDOW_COMMAND_ID, ChatConfiguration } from "../../common/constants.js";
import { CommandsRegistry, ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { AgentsWindowOpenSource, isAgentsWindowOpenSource } from "../../../../../platform/window/common/window.js";
const OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE = localize2("openWorkspaceInAgentsWindow", "Open in Agents");
const OPEN_WORKSPACE_IN_AGENTS_WINDOW_CHAT_TITLE_COMMAND_ID = "workbench.action.chat.openWorkspaceInAgentsWindow.chatTitle";
const OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE_BAR_COMMAND_ID = "workbench.action.chat.openWorkspaceInAgentsWindow.titleBar";
async function openCurrentWorkspaceInAgentsWindow(accessor, source) {
  const nativeHostService = accessor.get(INativeHostService);
  const workspaceContextService = accessor.get(IWorkspaceContextService);
  const folderUri = workspaceContextService.getWorkspace().folders[0]?.uri;
  await nativeHostService.openAgentsWindow({ folderUri: folderUri?.scheme === Schemas.file ? folderUri : void 0, source });
}
function isOpenChatSessionInAgentsWindowOptions(value) {
  return !!value && typeof value === "object" && isAgentsWindowOpenSource(value.agentsWindowOpenSource);
}
class OpenWorkspaceInAgentsWindowAction extends Action2 {
  constructor() {
    super({
      id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID,
      title: OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE,
      category: CHAT_CATEGORY,
      precondition: OPEN_AGENTS_WINDOW_PRECONDITION,
      f1: true
    });
  }
  async run(accessor, options) {
    await openCurrentWorkspaceInAgentsWindow(accessor, options?.source ?? AgentsWindowOpenSource.CommandPalette);
  }
}
class OpenWorkspaceInAgentsWindowChatTitleAction extends Action2 {
  constructor() {
    super({
      id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_CHAT_TITLE_COMMAND_ID,
      title: OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE,
      precondition: OPEN_AGENTS_WINDOW_PRECONDITION,
      f1: false,
      menu: {
        id: MenuId.ChatTitleBarMenu,
        group: "c_sessions",
        order: 1,
        when: OPEN_AGENTS_WINDOW_PRECONDITION
      }
    });
  }
  async run(accessor) {
    await accessor.get(ICommandService).executeCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, { source: AgentsWindowOpenSource.ChatTitleBar });
  }
}
class OpenWorkspaceInAgentsWindowTitleBarAction extends Action2 {
  constructor() {
    super({
      id: OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE_BAR_COMMAND_ID,
      title: OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE,
      precondition: OPEN_AGENTS_WINDOW_PRECONDITION,
      f1: false,
      menu: {
        id: MenuId.TitleBarAdjacentCenter,
        order: -1e3,
        when: ContextKeyExpr.and(
          OPEN_AGENTS_WINDOW_PRECONDITION,
          ContextKeyExpr.notEquals(`config.${ChatConfiguration.TitleBarOpenInAgentsWindowEnabled}`, false)
        )
      }
    });
  }
  async run(accessor) {
    await accessor.get(ICommandService).executeCommand(OPEN_WORKSPACE_IN_AGENTS_WINDOW_COMMAND_ID, { source: AgentsWindowOpenSource.TitleBar });
  }
}
class ToggleOpenInAgentsWindowTitleBarAction extends ToggleTitleBarConfigAction {
  constructor() {
    super(
      ChatConfiguration.TitleBarOpenInAgentsWindowEnabled,
      localize("toggle.openInAgentsWindow", "Open in Agents Window"),
      localize("toggle.openInAgentsWindowDescription", "Toggle visibility of the Open in Agents Window button in title bar"),
      6,
      OPEN_AGENTS_WINDOW_PRECONDITION
    );
  }
}
class OpenAgentsWindowAction extends Action2 {
  constructor() {
    super({
      id: OPEN_AGENTS_WINDOW_COMMAND_ID,
      title: localize2("openAgentsWindow", "Open Agents Window"),
      category: CHAT_CATEGORY,
      precondition: OPEN_AGENTS_WINDOW_PRECONDITION,
      f1: true,
      keybinding: [{
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyA,
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(IsSessionsWindowContext.toNegated(), CONTEXT_ACCESSIBILITY_MODE_ENABLED.toNegated()),
        args: { source: AgentsWindowOpenSource.KeyboardShortcut }
      }, {
        // In screen reader mode, Cmd/Ctrl+Shift+A conflicts with many screen reader keybindings,
        // so require an additional Alt modifier.
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyMod.Alt | KeyCode.KeyA,
        weight: KeybindingWeight.WorkbenchContrib,
        when: ContextKeyExpr.and(IsSessionsWindowContext.toNegated(), CONTEXT_ACCESSIBILITY_MODE_ENABLED),
        args: { source: AgentsWindowOpenSource.KeyboardShortcut }
      }]
    });
  }
  async run(accessor, args) {
    const nativeHostService = accessor.get(INativeHostService);
    await nativeHostService.openAgentsWindow({ ...args, source: args?.source ?? AgentsWindowOpenSource.CommandPalette });
  }
}
const _OpenChatSessionInAgentsWindowAction = class _OpenChatSessionInAgentsWindowAction extends Action2 {
  constructor() {
    super({
      id: _OpenChatSessionInAgentsWindowAction.ID,
      title: localize2("openSessionInAgentsWindow", "Open in Agents Window"),
      category: CHAT_CATEGORY,
      precondition: OPEN_AGENTS_WINDOW_PRECONDITION,
      f1: false,
      menu: [{
        id: MenuId.ChatTitleBarMenu,
        group: "c_sessions",
        order: 0,
        when: ContextKeyExpr.and(
          OPEN_AGENTS_WINDOW_PRECONDITION,
          ContextKeyExpr.or(
            ChatContextKeys.chatSessionType.isEqualTo(SessionType.CopilotCLI),
            ChatContextKeys.chatSessionType.isEqualTo(SessionType.AgentHostCopilot)
          )
        )
      }]
    });
  }
  async run(accessor, ...rest) {
    const chatWidgetService = accessor.get(IChatWidgetService);
    const nativeHostService = accessor.get(INativeHostService);
    const workspaceContextService = accessor.get(IWorkspaceContextService);
    const commandOptions = isOpenChatSessionInAgentsWindowOptions(rest[0]) ? rest[0] : void 0;
    const source = commandOptions?.agentsWindowOpenSource ?? AgentsWindowOpenSource.ChatTitleBar;
    const args = commandOptions ? rest.slice(1) : rest;
    let sessionResource;
    const arg = args[0];
    if (URI.isUri(arg)) {
      sessionResource = arg;
    } else if (arg && typeof arg === "object") {
      const ctx = arg;
      if (URI.isUri(ctx.sessionResource)) {
        sessionResource = ctx.sessionResource;
      }
    }
    if (!sessionResource) {
      sessionResource = chatWidgetService.lastFocusedWidget?.viewModel?.sessionResource;
    }
    const hasRealSession = sessionResource && !isUntitledChatSession(sessionResource);
    const folderUri = workspaceContextService.getWorkspace().folders[0]?.uri;
    await nativeHostService.openAgentsWindow({
      folderUri: !hasRealSession && folderUri?.scheme === Schemas.file ? folderUri.toJSON() : void 0,
      sessionResource: hasRealSession ? sessionResource?.toJSON() : void 0,
      source
    });
  }
};
_OpenChatSessionInAgentsWindowAction.ID = "workbench.action.chat.openSessionInAgentsWindow";
let OpenChatSessionInAgentsWindowAction = _OpenChatSessionInAgentsWindowAction;
let OpenWorkspaceInAgentsTitleBarWidget = class extends BaseActionViewItem {
  constructor(action, options, hoverService, keybindingService) {
    super(void 0, action, options);
    this.hoverService = hoverService;
    this.keybindingService = keybindingService;
  }
  render(container) {
    super.render(container);
    container.classList.add("open-in-agents-titlebar-widget");
    container.setAttribute("role", "button");
    const label = this.action.label;
    const hoverText = this.keybindingService.appendKeybinding(localize("openInAgentsHover", "Open in Agents Window"), OPEN_AGENTS_WINDOW_COMMAND_ID);
    container.setAttribute("aria-label", hoverText);
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), container, hoverText));
    const icon = append(container, $("span.open-in-agents-titlebar-widget-icon"));
    icon.setAttribute("aria-hidden", "true");
    const labelEl = append(container, $("span.open-in-agents-titlebar-widget-label"));
    labelEl.textContent = label;
  }
};
OpenWorkspaceInAgentsTitleBarWidget = __decorateClass([
  __decorateParam(2, IHoverService),
  __decorateParam(3, IKeybindingService)
], OpenWorkspaceInAgentsTitleBarWidget);
let OpenWorkspaceInAgentsContribution = class extends Disposable {
  constructor(actionViewItemService, instantiationService, contextKeyService, productService) {
    super();
    this._register(actionViewItemService.register(MenuId.TitleBarAdjacentCenter, OPEN_WORKSPACE_IN_AGENTS_WINDOW_TITLE_BAR_COMMAND_ID, (action, options) => {
      return instantiationService.createInstance(OpenWorkspaceInAgentsTitleBarWidget, action, options);
    }, void 0));
  }
};
OpenWorkspaceInAgentsContribution.ID = "workbench.contrib.openWorkspaceInAgents.desktop";
OpenWorkspaceInAgentsContribution = __decorateClass([
  __decorateParam(0, IActionViewItemService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IProductService)
], OpenWorkspaceInAgentsContribution);
var AgentsHandoffTipMode = /* @__PURE__ */ ((AgentsHandoffTipMode2) => {
  AgentsHandoffTipMode2["Hidden"] = "hidden";
  AgentsHandoffTipMode2["Default"] = "default";
  AgentsHandoffTipMode2["Custom"] = "custom";
  return AgentsHandoffTipMode2;
})(AgentsHandoffTipMode || {});
let AgentsHandoffInputTipContribution = class extends Disposable {
  constructor(_chatWidgetService, _notificationService, contextKeyService, _workspaceContextService, _telemetryService, _configurationService) {
    super();
    this._chatWidgetService = _chatWidgetService;
    this._notificationService = _notificationService;
    this._workspaceContextService = _workspaceContextService;
    this._telemetryService = _telemetryService;
    this._configurationService = _configurationService;
    /**
     * Set once the user dismisses (X) or opens the tip. Suppresses the tip for
     * the rest of this window's lifetime — intentionally in-memory only, so it
     * shows again the next time VS Code is reopened.
     */
    this._dismissedForWindow = false;
    this._register(CommandsRegistry.registerCommand(AgentsHandoffInputTipContribution.TIP_OPEN_COMMAND_ID, (accessor, ...args) => {
      this._logTipAction("open");
      this._dismissForWindow();
      return accessor.get(ICommandService).executeCommand(OpenChatSessionInAgentsWindowAction.ID, { agentsWindowOpenSource: AgentsWindowOpenSource.ChatHandoff }, ...args);
    }));
    this._register(CommandsRegistry.registerCommand(AgentsHandoffInputTipContribution.TIP_MUTE_COMMAND_ID, () => {
      this._logTipAction("mute");
      this._dismissForWindow();
      return this._configurationService.updateValue(ChatConfiguration.AgentsHandoffTipMode, "hidden" /* Hidden */);
    }));
    this._register(this._chatWidgetService.onDidChangeFocusedSession(() => this._update()));
    this._register(this._chatWidgetService.onDidAddWidget(() => this._update()));
    this._register(contextKeyService.onDidChangeContext(() => this._update()));
    this._register(this._workspaceContextService.onDidChangeWorkbenchState(() => this._update()));
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.AgentsHandoffTipMode)) {
        this._lastPostedFor = void 0;
        this._update();
      }
    }));
    this._register(this._notificationService.onDidDismiss((id) => {
      if (id !== AgentsHandoffInputTipContribution.NOTIFICATION_ID) {
        return;
      }
      this._logTipAction("dismiss");
      this._dismissForWindow();
    }));
    this._update();
  }
  /** Log a user interaction (open, dismiss, mute) with the handoff tip. */
  _logTipAction(action) {
    this._telemetryService.publicLog2("chat.agentsHandoffTip.action", {
      action,
      mode: this._getMode(),
      sessionType: this._lastPostedSessionType ?? ""
    });
  }
  _getMode() {
    const value = this._configurationService.getValue(ChatConfiguration.AgentsHandoffTipMode);
    switch (value) {
      case "hidden" /* Hidden */:
      case "custom" /* Custom */:
        return value;
      default:
        return "default" /* Default */;
    }
  }
  _update() {
    const mode = this._getMode();
    if (mode === "hidden" /* Hidden */ || this._dismissedForWindow) {
      if (this._lastPostedFor) {
        this._notificationService.deleteNotification(AgentsHandoffInputTipContribution.NOTIFICATION_ID);
        this._lastPostedFor = void 0;
      }
      return;
    }
    const widget = this._chatWidgetService.lastFocusedWidget;
    const sessionResource = widget?.viewModel?.sessionResource;
    const resourceSessionType = sessionResource ? getChatSessionType(sessionResource) : void 0;
    const preconditionMet = widget?.scopedContextKeyService.contextMatchesRules(OPEN_AGENTS_WINDOW_PRECONDITION) ?? false;
    const eligible = preconditionMet && !!sessionResource && !!resourceSessionType && AgentsHandoffInputTipContribution.ELIGIBLE_SESSION_TYPES.has(resourceSessionType) && !isUntitledChatSession(sessionResource);
    const widgetSessionType = widget?.scopedContextKeyService.getContextKeyValue(ChatContextKeys.chatSessionType.key);
    const isEmptyWorkspace = this._workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY;
    const emptyWorkspaceEligible = preconditionMet && isEmptyWorkspace && (!sessionResource || isUntitledChatSession(sessionResource)) && widgetSessionType === SessionType.AgentHostCopilot;
    if (!eligible && !emptyWorkspaceEligible) {
      if (this._lastPostedFor) {
        this._notificationService.deleteNotification(AgentsHandoffInputTipContribution.NOTIFICATION_ID);
        this._lastPostedFor = void 0;
      }
      return;
    }
    const key = eligible && sessionResource ? sessionResource.toString() : AgentsHandoffInputTipContribution.EMPTY_WORKSPACE_KEY;
    if (this._lastPostedFor === key) {
      return;
    }
    this._lastPostedFor = key;
    this._lastPostedSessionType = eligible ? resourceSessionType : widgetSessionType;
    const commandArgs = eligible && sessionResource ? [sessionResource] : [];
    const useEmptyWorkspaceCopy = emptyWorkspaceEligible && !eligible;
    const message = useEmptyWorkspaceCopy ? localize("chat.agentsHandoff.tip.emptyWorkspace.message", "Copilot CLI [Agent Host] isn't available without an open folder") : localize("chat.agentsHandoff.tip.message", "Continue this session in the Agents Window");
    const description = useEmptyWorkspaceCopy ? localize("chat.agentsHandoff.tip.emptyWorkspace.description", "Open the Agents Window to start a Copilot CLI session.") : mode === "custom" /* Custom */ ? localize("chat.agentsHandoff.tip.description.copilot", "Free with your Copilot plan \u2014 get a dedicated, multi-pane view alongside your workspace.") : localize("chat.agentsHandoff.tip.description", "Get a dedicated, multi-pane view alongside your workspace.");
    const actionLabel = useEmptyWorkspaceCopy ? localize("chat.agentsHandoff.tip.action", "Open in Agents Window") : mode === "custom" /* Custom */ ? localize("chat.agentsHandoff.tip.action.custom", "Give your agent more room?") : localize("chat.agentsHandoff.tip.action.default", "Continue in Agents Window");
    this._notificationService.setNotification({
      id: AgentsHandoffInputTipContribution.NOTIFICATION_ID,
      severity: ChatInputNotificationSeverity.Info,
      message,
      description,
      actions: [
        {
          kind: ChatInputNotificationActionKind.Command,
          label: actionLabel,
          commandId: AgentsHandoffInputTipContribution.TIP_OPEN_COMMAND_ID,
          commandArgs
        }
      ],
      dismissible: true,
      autoDismissOnMessage: false,
      mute: {
        commandId: AgentsHandoffInputTipContribution.TIP_MUTE_COMMAND_ID,
        tooltip: localize("chat.agentsHandoff.tip.mute", "Don't Show Again")
      },
      sessionTypes: useEmptyWorkspaceCopy ? [SessionType.AgentHostCopilot] : Array.from(AgentsHandoffInputTipContribution.ELIGIBLE_SESSION_TYPES)
    });
  }
  /**
   * Mark the tip as handled (dismissed or opened) for the rest of this
   * window's lifetime and tear down any currently posted notification.
   */
  _dismissForWindow() {
    if (this._dismissedForWindow) {
      return;
    }
    this._dismissedForWindow = true;
    this._update();
  }
};
AgentsHandoffInputTipContribution.ID = "workbench.contrib.agentsHandoffInputTip";
AgentsHandoffInputTipContribution.NOTIFICATION_ID = "chat.agentsHandoff.openInAgentsWindow";
/**
 * Dedicated command backing the tip's action button. Lets us attach
 * mode + harness telemetry to the exact tip click (the title-bar menu
 * entry runs {@link OpenChatSessionInAgentsWindowAction} directly and is
 * intentionally not tracked here).
 */
AgentsHandoffInputTipContribution.TIP_OPEN_COMMAND_ID = "workbench.action.chat.agentsHandoffTip.open";
/**
 * Dedicated command backing the tip's "Don't Show Again" button. Closes the
 * tip and flips {@link ChatConfiguration.AgentsHandoffTipMode} to `hidden`
 * so it never shows again.
 */
AgentsHandoffInputTipContribution.TIP_MUTE_COMMAND_ID = "workbench.action.chat.agentsHandoffTip.mute";
/** Session types eligible for the handoff tip — the same set the Agents window can render directly. */
AgentsHandoffInputTipContribution.ELIGIBLE_SESSION_TYPES = /* @__PURE__ */ new Set([SessionType.CopilotCLI, SessionType.AgentHostCopilot]);
/** Pseudo-key used as the {@link _lastPostedFor} value for the empty-workspace tip (no real session URI exists). */
AgentsHandoffInputTipContribution.EMPTY_WORKSPACE_KEY = "__empty-workspace__";
AgentsHandoffInputTipContribution = __decorateClass([
  __decorateParam(0, IChatWidgetService),
  __decorateParam(1, IChatInputNotificationService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IConfigurationService)
], AgentsHandoffInputTipContribution);
export {
  AgentsHandoffInputTipContribution,
  AgentsHandoffTipMode,
  OpenAgentsWindowAction,
  OpenChatSessionInAgentsWindowAction,
  OpenWorkspaceInAgentsContribution,
  OpenWorkspaceInAgentsWindowAction,
  OpenWorkspaceInAgentsWindowChatTitleAction,
  OpenWorkspaceInAgentsWindowTitleBarAction,
  ToggleOpenInAgentsWindowTitleBarAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvZWxlY3Ryb24tYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNBY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCAnLi9tZWRpYS9vcGVuSW5BZ2VudHMuY3NzJztcbmltcG9ydCB7ICQsIGFwcGVuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQmFzZUFjdGlvblZpZXdJdGVtLCBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL2FjdGlvblZpZXdJdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENPTlRFWFRfQUNDRVNTSUJJTElUWV9NT0RFX0VOQUJMRUQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nV2VpZ2h0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ3NSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IFRvZ2dsZVRpdGxlQmFyQ29uZmlnQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy90aXRsZWJhci90aXRsZWJhckFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IENIQVRfQ0FURUdPUlkgfSBmcm9tICcuLi8uLi9icm93c2VyL2FjdGlvbnMvY2hhdEFjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IENoYXRDb250ZXh0S2V5cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0Vmlld1RpdGxlQWN0aW9uQ29udGV4dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hY3Rpb25zL2NoYXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSwgaXNVbnRpdGxlZENoYXRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZCwgQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHksIElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBPUEVOX1dPUktTUEFDRV9JTl9BR0VOVFNfV0lORE9XX0NPTU1BTkRfSUQsIE9QRU5fQUdFTlRTX1dJTkRPV19QUkVDT05ESVRJT04sIE9QRU5fQUdFTlRTX1dJTkRPV19DT01NQU5EX0lELCBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBZ2VudHNXaW5kb3dPcGVuU291cmNlLCBpc0FnZW50c1dpbmRvd09wZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5cbmNvbnN0IE9QRU5fV09SS1NQQUNFX0lOX0FHRU5UU19XSU5ET1dfVElUTEUgPSBsb2NhbGl6ZTIoJ29wZW5Xb3Jrc3BhY2VJbkFnZW50c1dpbmRvdycsIFwiT3BlbiBpbiBBZ2VudHNcIik7XG5jb25zdCBPUEVOX1dPUktTUEFDRV9JTl9BR0VOVFNfV0lORE9XX0NIQVRfVElUTEVfQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQub3BlbldvcmtzcGFjZUluQWdlbnRzV2luZG93LmNoYXRUaXRsZSc7XG5jb25zdCBPUEVOX1dPUktTUEFDRV9JTl9BR0VOVFNfV0lORE9XX1RJVExFX0JBUl9DT01NQU5EX0lEID0gJ3dvcmtiZW5jaC5hY3Rpb24uY2hhdC5vcGVuV29ya3NwYWNlSW5BZ2VudHNXaW5kb3cudGl0bGVCYXInO1xuXG5hc3luYyBmdW5jdGlvbiBvcGVuQ3VycmVudFdvcmtzcGFjZUluQWdlbnRzV2luZG93KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzb3VyY2U6IEFnZW50c1dpbmRvd09wZW5Tb3VyY2UpOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgbmF0aXZlSG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSU5hdGl2ZUhvc3RTZXJ2aWNlKTtcblx0Y29uc3Qgd29ya3NwYWNlQ29udGV4dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0Y29uc3QgZm9sZGVyVXJpID0gd29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXT8udXJpO1xuXHRhd2FpdCBuYXRpdmVIb3N0U2VydmljZS5vcGVuQWdlbnRzV2luZG93KHsgZm9sZGVyVXJpOiBmb2xkZXJVcmk/LnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlID8gZm9sZGVyVXJpIDogdW5kZWZpbmVkLCBzb3VyY2UgfSk7XG59XG5cbmZ1bmN0aW9uIGlzT3BlbkNoYXRTZXNzaW9uSW5BZ2VudHNXaW5kb3dPcHRpb25zKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgeyByZWFkb25seSBhZ2VudHNXaW5kb3dPcGVuU291cmNlOiBBZ2VudHNXaW5kb3dPcGVuU291cmNlIH0ge1xuXHRyZXR1cm4gISF2YWx1ZVxuXHRcdCYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCdcblx0XHQmJiBpc0FnZW50c1dpbmRvd09wZW5Tb3VyY2UoKHZhbHVlIGFzIHsgcmVhZG9ubHkgYWdlbnRzV2luZG93T3BlblNvdXJjZT86IHVua25vd24gfSkuYWdlbnRzV2luZG93T3BlblNvdXJjZSk7XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuV29ya3NwYWNlSW5BZ2VudHNXaW5kb3dBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9QRU5fV09SS1NQQUNFX0lOX0FHRU5UU19XSU5ET1dfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBPUEVOX1dPUktTUEFDRV9JTl9BR0VOVFNfV0lORE9XX1RJVExFLFxuXHRcdFx0Y2F0ZWdvcnk6IENIQVRfQ0FURUdPUlksXG5cdFx0XHRwcmVjb25kaXRpb246IE9QRU5fQUdFTlRTX1dJTkRPV19QUkVDT05ESVRJT04sXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvciwgb3B0aW9ucz86IHsgcmVhZG9ubHkgc291cmNlPzogQWdlbnRzV2luZG93T3BlblNvdXJjZSB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgb3BlbkN1cnJlbnRXb3Jrc3BhY2VJbkFnZW50c1dpbmRvdyhhY2Nlc3Nvciwgb3B0aW9ucz8uc291cmNlID8/IEFnZW50c1dpbmRvd09wZW5Tb3VyY2UuQ29tbWFuZFBhbGV0dGUpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuV29ya3NwYWNlSW5BZ2VudHNXaW5kb3dDaGF0VGl0bGVBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9QRU5fV09SS1NQQUNFX0lOX0FHRU5UU19XSU5ET1dfQ0hBVF9USVRMRV9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IE9QRU5fV09SS1NQQUNFX0lOX0FHRU5UU19XSU5ET1dfVElUTEUsXG5cdFx0XHRwcmVjb25kaXRpb246IE9QRU5fQUdFTlRTX1dJTkRPV19QUkVDT05ESVRJT04sXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQ2hhdFRpdGxlQmFyTWVudSxcblx0XHRcdFx0Z3JvdXA6ICdjX3Nlc3Npb25zJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHRcdHdoZW46IE9QRU5fQUdFTlRTX1dJTkRPV19QUkVDT05ESVRJT04sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoT1BFTl9XT1JLU1BBQ0VfSU5fQUdFTlRTX1dJTkRPV19DT01NQU5EX0lELCB7IHNvdXJjZTogQWdlbnRzV2luZG93T3BlblNvdXJjZS5DaGF0VGl0bGVCYXIgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5Xb3Jrc3BhY2VJbkFnZW50c1dpbmRvd1RpdGxlQmFyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPUEVOX1dPUktTUEFDRV9JTl9BR0VOVFNfV0lORE9XX1RJVExFX0JBUl9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IE9QRU5fV09SS1NQQUNFX0lOX0FHRU5UU19XSU5ET1dfVElUTEUsXG5cdFx0XHRwcmVjb25kaXRpb246IE9QRU5fQUdFTlRTX1dJTkRPV19QUkVDT05ESVRJT04sXG5cdFx0XHRmMTogZmFsc2UsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVGl0bGVCYXJBZGphY2VudENlbnRlcixcblx0XHRcdFx0b3JkZXI6IC0xMDAwLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0XHRcdFx0T1BFTl9BR0VOVFNfV0lORE9XX1BSRUNPTkRJVElPTixcblx0XHRcdFx0XHRDb250ZXh0S2V5RXhwci5ub3RFcXVhbHMoYGNvbmZpZy4ke0NoYXRDb25maWd1cmF0aW9uLlRpdGxlQmFyT3BlbkluQWdlbnRzV2luZG93RW5hYmxlZH1gLCBmYWxzZSksXG5cdFx0XHRcdCksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoT1BFTl9XT1JLU1BBQ0VfSU5fQUdFTlRTX1dJTkRPV19DT01NQU5EX0lELCB7IHNvdXJjZTogQWdlbnRzV2luZG93T3BlblNvdXJjZS5UaXRsZUJhciB9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVG9nZ2xlT3BlbkluQWdlbnRzV2luZG93VGl0bGVCYXJBY3Rpb24gZXh0ZW5kcyBUb2dnbGVUaXRsZUJhckNvbmZpZ0FjdGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKFxuXHRcdFx0Q2hhdENvbmZpZ3VyYXRpb24uVGl0bGVCYXJPcGVuSW5BZ2VudHNXaW5kb3dFbmFibGVkLFxuXHRcdFx0bG9jYWxpemUoJ3RvZ2dsZS5vcGVuSW5BZ2VudHNXaW5kb3cnLCAnT3BlbiBpbiBBZ2VudHMgV2luZG93JyksXG5cdFx0XHRsb2NhbGl6ZSgndG9nZ2xlLm9wZW5JbkFnZW50c1dpbmRvd0Rlc2NyaXB0aW9uJywgXCJUb2dnbGUgdmlzaWJpbGl0eSBvZiB0aGUgT3BlbiBpbiBBZ2VudHMgV2luZG93IGJ1dHRvbiBpbiB0aXRsZSBiYXJcIiksXG5cdFx0XHQ2LFxuXHRcdFx0T1BFTl9BR0VOVFNfV0lORE9XX1BSRUNPTkRJVElPTixcblx0XHQpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBPcGVuQWdlbnRzV2luZG93QWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPUEVOX0FHRU5UU19XSU5ET1dfQ09NTUFORF9JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5BZ2VudHNXaW5kb3cnLCBcIk9wZW4gQWdlbnRzIFdpbmRvd1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBPUEVOX0FHRU5UU19XSU5ET1dfUFJFQ09ORElUSU9OLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRrZXliaW5kaW5nOiBbe1xuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuS2V5QSxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChJc1Nlc3Npb25zV2luZG93Q29udGV4dC50b05lZ2F0ZWQoKSwgQ09OVEVYVF9BQ0NFU1NJQklMSVRZX01PREVfRU5BQkxFRC50b05lZ2F0ZWQoKSksXG5cdFx0XHRcdGFyZ3M6IHsgc291cmNlOiBBZ2VudHNXaW5kb3dPcGVuU291cmNlLktleWJvYXJkU2hvcnRjdXQgfSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Ly8gSW4gc2NyZWVuIHJlYWRlciBtb2RlLCBDbWQvQ3RybCtTaGlmdCtBIGNvbmZsaWN0cyB3aXRoIG1hbnkgc2NyZWVuIHJlYWRlciBrZXliaW5kaW5ncyxcblx0XHRcdFx0Ly8gc28gcmVxdWlyZSBhbiBhZGRpdGlvbmFsIEFsdCBtb2RpZmllci5cblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlNb2QuQWx0IHwgS2V5Q29kZS5LZXlBLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LnRvTmVnYXRlZCgpLCBDT05URVhUX0FDQ0VTU0lCSUxJVFlfTU9ERV9FTkFCTEVEKSxcblx0XHRcdFx0YXJnczogeyBzb3VyY2U6IEFnZW50c1dpbmRvd09wZW5Tb3VyY2UuS2V5Ym9hcmRTaG9ydGN1dCB9LFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGFyZ3M/OiB7IGZvbGRlclVyaT86IFVyaUNvbXBvbmVudHM7IHNlc3Npb25SZXNvdXJjZT86IFVyaUNvbXBvbmVudHM7IHNvdXJjZT86IEFnZW50c1dpbmRvd09wZW5Tb3VyY2UgfSkge1xuXHRcdGNvbnN0IG5hdGl2ZUhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElOYXRpdmVIb3N0U2VydmljZSk7XG5cdFx0YXdhaXQgbmF0aXZlSG9zdFNlcnZpY2Uub3BlbkFnZW50c1dpbmRvdyh7IC4uLmFyZ3MsIHNvdXJjZTogYXJncz8uc291cmNlID8/IEFnZW50c1dpbmRvd09wZW5Tb3VyY2UuQ29tbWFuZFBhbGV0dGUgfSk7XG5cdH1cbn1cblxuLyoqXG4gKiBPcGVucyB0aGUgY3VycmVudCBjaGF0IHNlc3Npb24gaW5zaWRlIHRoZSBBZ2VudHMgd2luZG93LiBWaXNpYmxlIG9ubHkgd2hlblxuICogdGhlIGFjdGl2ZSBjaGF0IGlzIGEgZmlyc3QtcGFydHkgYWdlbnQtaG9zdCBzZXNzaW9uIChDb3BpbG90IENMSSB0b2RheSlcbiAqIHNpbmNlIHRob3NlIGFyZSB0aGUgc2Vzc2lvbiB0eXBlcyB0aGUgQWdlbnRzIHdpbmRvdyBjYW4gcmVuZGVyIGRpcmVjdGx5LlxuICovXG5leHBvcnQgY2xhc3MgT3BlbkNoYXRTZXNzaW9uSW5BZ2VudHNXaW5kb3dBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0Lm9wZW5TZXNzaW9uSW5BZ2VudHNXaW5kb3cnO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPcGVuQ2hhdFNlc3Npb25JbkFnZW50c1dpbmRvd0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ29wZW5TZXNzaW9uSW5BZ2VudHNXaW5kb3cnLCBcIk9wZW4gaW4gQWdlbnRzIFdpbmRvd1wiKSxcblx0XHRcdGNhdGVnb3J5OiBDSEFUX0NBVEVHT1JZLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBPUEVOX0FHRU5UU19XSU5ET1dfUFJFQ09ORElUSU9OLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudTogW3tcblx0XHRcdFx0aWQ6IE1lbnVJZC5DaGF0VGl0bGVCYXJNZW51LFxuXHRcdFx0XHRncm91cDogJ2Nfc2Vzc2lvbnMnLFxuXHRcdFx0XHRvcmRlcjogMCxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFxuXHRcdFx0XHRcdE9QRU5fQUdFTlRTX1dJTkRPV19QUkVDT05ESVRJT04sXG5cdFx0XHRcdFx0Q29udGV4dEtleUV4cHIub3IoXG5cdFx0XHRcdFx0XHRDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmlzRXF1YWxUbyhTZXNzaW9uVHlwZS5Db3BpbG90Q0xJKSxcblx0XHRcdFx0XHRcdENoYXRDb250ZXh0S2V5cy5jaGF0U2Vzc2lvblR5cGUuaXNFcXVhbFRvKFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpLFxuXHRcdFx0XHRcdCksXG5cdFx0XHRcdCksXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4ucmVzdDogdW5rbm93bltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNoYXRXaWRnZXRTZXJ2aWNlKTtcblx0XHRjb25zdCBuYXRpdmVIb3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJTmF0aXZlSG9zdFNlcnZpY2UpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSk7XG5cblx0XHRjb25zdCBjb21tYW5kT3B0aW9ucyA9IGlzT3BlbkNoYXRTZXNzaW9uSW5BZ2VudHNXaW5kb3dPcHRpb25zKHJlc3RbMF0pID8gcmVzdFswXSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzb3VyY2UgPSBjb21tYW5kT3B0aW9ucz8uYWdlbnRzV2luZG93T3BlblNvdXJjZSA/PyBBZ2VudHNXaW5kb3dPcGVuU291cmNlLkNoYXRUaXRsZUJhcjtcblx0XHRjb25zdCBhcmdzID0gY29tbWFuZE9wdGlvbnMgPyByZXN0LnNsaWNlKDEpIDogcmVzdDtcblx0XHRsZXQgc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYXJnID0gYXJnc1swXTtcblx0XHRpZiAoVVJJLmlzVXJpKGFyZykpIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZSA9IGFyZztcblx0XHR9IGVsc2UgaWYgKGFyZyAmJiB0eXBlb2YgYXJnID09PSAnb2JqZWN0Jykge1xuXHRcdFx0Y29uc3QgY3R4ID0gYXJnIGFzIElDaGF0Vmlld1RpdGxlQWN0aW9uQ29udGV4dDtcblx0XHRcdGlmIChVUkkuaXNVcmkoY3R4LnNlc3Npb25SZXNvdXJjZSkpIHtcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlID0gY3R4LnNlc3Npb25SZXNvdXJjZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKCFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZSA9IGNoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0Py52aWV3TW9kZWw/LnNlc3Npb25SZXNvdXJjZTtcblx0XHR9XG5cblx0XHQvLyBIYW5kIG9mZiBhIHJlYWwgKHBlcnNpc3RlZCwgbm9uLXVudGl0bGVkKSBzZXNzaW9uIHNvIHRoZSBhZ2VudHMgd2luZG93XG5cdFx0Ly8gb3BlbnMgdGhhdCBzYW1lIHNlc3Npb24gKGl0IGNhcnJpZXMgaXRzIG93biB3b3Jrc3BhY2UpLiBPdGhlcndpc2UgZmFsbFxuXHRcdC8vIGJhY2sgdG8gZm9yd2FyZGluZyB0aGUgd29ya3NwYWNlIGZvbGRlciBzbyB0aGUgYWdlbnRzIHdpbmRvdyBzY29wZXMgaXRzXG5cdFx0Ly8gbmV3LXNlc3Npb24gY29tcG9zZXIgdG8gaXQuXG5cdFx0Y29uc3QgaGFzUmVhbFNlc3Npb24gPSBzZXNzaW9uUmVzb3VyY2UgJiYgIWlzVW50aXRsZWRDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGZvbGRlclVyaSA9IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnNbMF0/LnVyaTtcblx0XHRhd2FpdCBuYXRpdmVIb3N0U2VydmljZS5vcGVuQWdlbnRzV2luZG93KHtcblx0XHRcdGZvbGRlclVyaTogIWhhc1JlYWxTZXNzaW9uICYmIGZvbGRlclVyaT8uc2NoZW1lID09PSBTY2hlbWFzLmZpbGUgPyBmb2xkZXJVcmkudG9KU09OKCkgOiB1bmRlZmluZWQsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGhhc1JlYWxTZXNzaW9uID8gc2Vzc2lvblJlc291cmNlPy50b0pTT04oKSA6IHVuZGVmaW5lZCxcblx0XHRcdHNvdXJjZSxcblx0XHR9KTtcblx0fVxufVxuXG4vKipcbiAqIFJlbmRlcnMgdGhlIFwiT3BlbiBpbiBBZ2VudHNcIiB0aXRsZWJhciBlbnRyeSBhcyBhbiBpY29uLW9ubHkgYnV0dG9uIHRoYXRcbiAqIGV4cGFuZHMgdG8gcmV2ZWFsIGEgbGFiZWwgb24gaG92ZXIgLyBrZXlib2FyZCBmb2N1cy5cbiAqL1xuY2xhc3MgT3BlbldvcmtzcGFjZUluQWdlbnRzVGl0bGVCYXJXaWRnZXQgZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRvcHRpb25zOiBJQmFzZUFjdGlvblZpZXdJdGVtT3B0aW9ucyB8IHVuZGVmaW5lZCxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIodW5kZWZpbmVkLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXIoY29udGFpbmVyKTtcblxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdvcGVuLWluLWFnZW50cy10aXRsZWJhci13aWRnZXQnKTtcblx0XHRjb250YWluZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmFjdGlvbi5sYWJlbDtcblx0XHRjb25zdCBob3ZlclRleHQgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcobG9jYWxpemUoJ29wZW5JbkFnZW50c0hvdmVyJywgXCJPcGVuIGluIEFnZW50cyBXaW5kb3dcIiksIE9QRU5fQUdFTlRTX1dJTkRPV19DT01NQU5EX0lEKTtcblx0XHRjb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgaG92ZXJUZXh0KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnZWxlbWVudCcpLCBjb250YWluZXIsIGhvdmVyVGV4dCkpO1xuXG5cdFx0Y29uc3QgaWNvbiA9IGFwcGVuZChjb250YWluZXIsICQoJ3NwYW4ub3Blbi1pbi1hZ2VudHMtdGl0bGViYXItd2lkZ2V0LWljb24nKSk7XG5cdFx0aWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblxuXHRcdGNvbnN0IGxhYmVsRWwgPSBhcHBlbmQoY29udGFpbmVyLCAkKCdzcGFuLm9wZW4taW4tYWdlbnRzLXRpdGxlYmFyLXdpZGdldC1sYWJlbCcpKTtcblx0XHRsYWJlbEVsLnRleHRDb250ZW50ID0gbGFiZWw7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE9wZW5Xb3Jrc3BhY2VJbkFnZW50c0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIub3BlbldvcmtzcGFjZUluQWdlbnRzLmRlc2t0b3AnO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWN0aW9uVmlld0l0ZW1TZXJ2aWNlIGFjdGlvblZpZXdJdGVtU2VydmljZTogSUFjdGlvblZpZXdJdGVtU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhY3Rpb25WaWV3SXRlbVNlcnZpY2UucmVnaXN0ZXIoTWVudUlkLlRpdGxlQmFyQWRqYWNlbnRDZW50ZXIsIE9QRU5fV09SS1NQQUNFX0lOX0FHRU5UU19XSU5ET1dfVElUTEVfQkFSX0NPTU1BTkRfSUQsIChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdHJldHVybiBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShPcGVuV29ya3NwYWNlSW5BZ2VudHNUaXRsZUJhcldpZGdldCwgYWN0aW9uLCBvcHRpb25zKTtcblx0XHR9LCB1bmRlZmluZWQpKTtcblx0fVxufVxuXG4vKipcbiAqIERpc3BsYXkgbW9kZXMgZm9yIHRoZSBhZ2VudHMtd2luZG93IGhhbmRvZmYgaW5wdXQgdGlwLCBleHBvc2VkIHZpYSB0aGVcbiAqIHtAbGluayBDaGF0Q29uZmlndXJhdGlvbi5BZ2VudHNIYW5kb2ZmVGlwTW9kZX0gc2V0dGluZy5cbiAqL1xuZXhwb3J0IGNvbnN0IGVudW0gQWdlbnRzSGFuZG9mZlRpcE1vZGUge1xuXHQvKiogRG9uJ3Qgc2hvdyB0aGUgdGlwLiAqL1xuXHRIaWRkZW4gPSAnaGlkZGVuJyxcblx0LyoqIFNob3cgdGhlIHRpcCB3aXRoIHRoZSBkZWZhdWx0IG1lc3NhZ2UgKyBkZXNjcmlwdGlvbi4gKi9cblx0RGVmYXVsdCA9ICdkZWZhdWx0Jyxcblx0LyoqIFNob3cgdGhlIHRpcCB3aXRoIHRoZSBhbHRlcm5hdGUgXCJGcmVlIHdpdGggeW91ciBDb3BpbG90XCIgZnJhbWluZy4gKi9cblx0Q3VzdG9tID0gJ2N1c3RvbScsXG59XG5cbnR5cGUgQWdlbnRzSGFuZG9mZlRpcEFjdGlvbkV2ZW50ID0ge1xuXHRhY3Rpb246IHN0cmluZztcblx0bW9kZTogc3RyaW5nO1xuXHRzZXNzaW9uVHlwZTogc3RyaW5nO1xufTtcblxudHlwZSBBZ2VudHNIYW5kb2ZmVGlwQWN0aW9uQ2xhc3NpZmljYXRpb24gPSB7XG5cdGFjdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1doaWNoIHRpcCBhZmZvcmRhbmNlIHRoZSB1c2VyIGFjdGl2YXRlZDogb3BlbiwgZGlzbWlzcywgb3IgbXV0ZS4nIH07XG5cdG1vZGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgY29uZmlndXJlZCB0aXAgbW9kZSBhY3RpdmUgd2hlbiB0aGUgdGlwIHdhcyBjbGlja2VkIChkZWZhdWx0LCBjdXN0b20pLicgfTtcblx0c2Vzc2lvblR5cGU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgY2hhdCBzZXNzaW9uIHR5cGUgLyBhZ2VudCBoYXJuZXNzIGJlaW5nIGhhbmRlZCBvZmYgKGUuZy4gY29waWxvdC1jbGksIGFnZW50LWhvc3QtY29waWxvdCkuJyB9O1xuXHRvd25lcjogJ2p1c3RzY2hlbic7XG5cdGNvbW1lbnQ6ICdUcmFja3MgdXNlciBpbnRlcmFjdGlvbnMgKG9wZW4sIGRpc21pc3MsIG11dGUpIHdpdGggdGhlIGFnZW50cy13aW5kb3cgaGFuZG9mZiBpbnB1dCB0aXAgdG8gbWVhc3VyZSBlbmdhZ2VtZW50IGFjcm9zcyB3b3JkaW5nIHZhcmlhbnRzLic7XG59O1xuXG4vKipcbiAqIFBvc3RzIGEgdGlwIG5vdGlmaWNhdGlvbiBhYm92ZSB0aGUgY2hhdCBpbnB1dCB3aGVuZXZlciB0aGUgZm9jdXNlZCBjaGF0XG4gKiB3aWRnZXQgaXMgc2hvd2luZyBhIGNvbnRyaWJ1dGVkIHNlc3Npb24gKENvcGlsb3QgQ0xJLCBDbG91ZCwgQ2xhdWRlLCBldGMuKVxuICogdGhhdCB0aGUgQWdlbnRzIFdpbmRvdyBjYW4gcmVuZGVyIGRpcmVjdGx5LiBUaGUgbm90aWZpY2F0aW9uIHByb3ZpZGVzIGFcbiAqIG9uZS1jbGljayBidXR0b24gdG8gaGFuZCBvZmYgdGhlIGN1cnJlbnQgc2Vzc2lvbiB0byB0aGUgQWdlbnRzIFdpbmRvdy5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50c0hhbmRvZmZJbnB1dFRpcENvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuYWdlbnRzSGFuZG9mZklucHV0VGlwJztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBOT1RJRklDQVRJT05fSUQgPSAnY2hhdC5hZ2VudHNIYW5kb2ZmLm9wZW5JbkFnZW50c1dpbmRvdyc7XG5cblx0LyoqXG5cdCAqIERlZGljYXRlZCBjb21tYW5kIGJhY2tpbmcgdGhlIHRpcCdzIGFjdGlvbiBidXR0b24uIExldHMgdXMgYXR0YWNoXG5cdCAqIG1vZGUgKyBoYXJuZXNzIHRlbGVtZXRyeSB0byB0aGUgZXhhY3QgdGlwIGNsaWNrICh0aGUgdGl0bGUtYmFyIG1lbnVcblx0ICogZW50cnkgcnVucyB7QGxpbmsgT3BlbkNoYXRTZXNzaW9uSW5BZ2VudHNXaW5kb3dBY3Rpb259IGRpcmVjdGx5IGFuZCBpc1xuXHQgKiBpbnRlbnRpb25hbGx5IG5vdCB0cmFja2VkIGhlcmUpLlxuXHQgKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVElQX09QRU5fQ09NTUFORF9JRCA9ICd3b3JrYmVuY2guYWN0aW9uLmNoYXQuYWdlbnRzSGFuZG9mZlRpcC5vcGVuJztcblxuXHQvKipcblx0ICogRGVkaWNhdGVkIGNvbW1hbmQgYmFja2luZyB0aGUgdGlwJ3MgXCJEb24ndCBTaG93IEFnYWluXCIgYnV0dG9uLiBDbG9zZXMgdGhlXG5cdCAqIHRpcCBhbmQgZmxpcHMge0BsaW5rIENoYXRDb25maWd1cmF0aW9uLkFnZW50c0hhbmRvZmZUaXBNb2RlfSB0byBgaGlkZGVuYFxuXHQgKiBzbyBpdCBuZXZlciBzaG93cyBhZ2Fpbi5cblx0ICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFRJUF9NVVRFX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLmFjdGlvbi5jaGF0LmFnZW50c0hhbmRvZmZUaXAubXV0ZSc7XG5cblx0LyoqIFNlc3Npb24gdHlwZXMgZWxpZ2libGUgZm9yIHRoZSBoYW5kb2ZmIHRpcCBcdTIwMTQgdGhlIHNhbWUgc2V0IHRoZSBBZ2VudHMgd2luZG93IGNhbiByZW5kZXIgZGlyZWN0bHkuICovXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVMSUdJQkxFX1NFU1NJT05fVFlQRVM6IFJlYWRvbmx5U2V0PHN0cmluZz4gPSBuZXcgU2V0KFtTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLCBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90XSk7XG5cblx0LyoqIFBzZXVkby1rZXkgdXNlZCBhcyB0aGUge0BsaW5rIF9sYXN0UG9zdGVkRm9yfSB2YWx1ZSBmb3IgdGhlIGVtcHR5LXdvcmtzcGFjZSB0aXAgKG5vIHJlYWwgc2Vzc2lvbiBVUkkgZXhpc3RzKS4gKi9cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRU1QVFlfV09SS1NQQUNFX0tFWSA9ICdfX2VtcHR5LXdvcmtzcGFjZV9fJztcblxuXHQvKiogVGhlIGtleSAoc2Vzc2lvbiBVUkkgb3Ige0BsaW5rIEVNUFRZX1dPUktTUEFDRV9LRVl9KSB3ZSBsYXN0IHBvc3RlZCBhIG5vdGlmaWNhdGlvbiBmb3IuIFVzZWQgdG8gYXZvaWQgcmVkdW5kYW50bHkgcmUtcG9zdGluZyB0aGUgdGlwIHdoZW4gdGhlIHNhbWUgc3RhdGUgaXMgcmUtZXZhbHVhdGVkLiAqL1xuXHRwcml2YXRlIF9sYXN0UG9zdGVkRm9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqIFRoZSBzZXNzaW9uIHR5cGUgKGFnZW50IGhhcm5lc3MpIG9mIHRoZSBjdXJyZW50bHkgcG9zdGVkIHRpcCwgZm9yIHRlbGVtZXRyeS4gKi9cblx0cHJpdmF0ZSBfbGFzdFBvc3RlZFNlc3Npb25UeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFNldCBvbmNlIHRoZSB1c2VyIGRpc21pc3NlcyAoWCkgb3Igb3BlbnMgdGhlIHRpcC4gU3VwcHJlc3NlcyB0aGUgdGlwIGZvclxuXHQgKiB0aGUgcmVzdCBvZiB0aGlzIHdpbmRvdydzIGxpZmV0aW1lIFx1MjAxNCBpbnRlbnRpb25hbGx5IGluLW1lbW9yeSBvbmx5LCBzbyBpdFxuXHQgKiBzaG93cyBhZ2FpbiB0aGUgbmV4dCB0aW1lIFZTIENvZGUgaXMgcmVvcGVuZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9kaXNtaXNzZWRGb3JXaW5kb3cgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKEFnZW50c0hhbmRvZmZJbnB1dFRpcENvbnRyaWJ1dGlvbi5USVBfT1BFTl9DT01NQU5EX0lELCAoYWNjZXNzb3IsIC4uLmFyZ3MpID0+IHtcblx0XHRcdHRoaXMuX2xvZ1RpcEFjdGlvbignb3BlbicpO1xuXHRcdFx0Ly8gT3BlbmluZyB0aGUgdGlwIGNvdW50cyBhcyBoYW5kbGluZyBpdDogZG9uJ3Qgc2hvdyBpdCBhZ2FpbiB0aGlzIHdpbmRvdy5cblx0XHRcdHRoaXMuX2Rpc21pc3NGb3JXaW5kb3coKTtcblx0XHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSUNvbW1hbmRTZXJ2aWNlKS5leGVjdXRlQ29tbWFuZChPcGVuQ2hhdFNlc3Npb25JbkFnZW50c1dpbmRvd0FjdGlvbi5JRCwgeyBhZ2VudHNXaW5kb3dPcGVuU291cmNlOiBBZ2VudHNXaW5kb3dPcGVuU291cmNlLkNoYXRIYW5kb2ZmIH0sIC4uLmFyZ3MpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKEFnZW50c0hhbmRvZmZJbnB1dFRpcENvbnRyaWJ1dGlvbi5USVBfTVVURV9DT01NQU5EX0lELCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9sb2dUaXBBY3Rpb24oJ211dGUnKTtcblx0XHRcdC8vIFRlYXIgZG93biB0aGUgdmlzaWJsZSB0aXAgZmlyc3QgKHVzZXMgdGhlIHN0aWxsLXZhbGlkIGBfbGFzdFBvc3RlZEZvcmApLFxuXHRcdFx0Ly8gdGhlbiBwZXJzaXN0IGBoaWRkZW5gIHNvIGl0IG5ldmVyIHNob3dzIGFnYWluLlxuXHRcdFx0dGhpcy5fZGlzbWlzc0ZvcldpbmRvdygpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKENoYXRDb25maWd1cmF0aW9uLkFnZW50c0hhbmRvZmZUaXBNb2RlLCBBZ2VudHNIYW5kb2ZmVGlwTW9kZS5IaWRkZW4pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9jdXNlZFNlc3Npb24oKCkgPT4gdGhpcy5fdXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0V2lkZ2V0U2VydmljZS5vbkRpZEFkZFdpZGdldCgoKSA9PiB0aGlzLl91cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dCgoKSA9PiB0aGlzLl91cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUoKCkgPT4gdGhpcy5fdXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5BZ2VudHNIYW5kb2ZmVGlwTW9kZSkpIHtcblx0XHRcdFx0Ly8gTW9kZSBjaGFuZ2VkOiBmb3JjZSBhIHJlLXBvc3Qgc28gdGhlIGRlc2NyaXB0aW9uIHN3YXBzIG9yIHRoZVxuXHRcdFx0XHQvLyB0aXAgYXBwZWFycy9kaXNhcHBlYXJzIGltbWVkaWF0ZWx5LlxuXHRcdFx0XHR0aGlzLl9sYXN0UG9zdGVkRm9yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl91cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5vbkRpZERpc21pc3MoaWQgPT4ge1xuXHRcdFx0aWYgKGlkICE9PSBBZ2VudHNIYW5kb2ZmSW5wdXRUaXBDb250cmlidXRpb24uTk9USUZJQ0FUSU9OX0lEKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2xvZ1RpcEFjdGlvbignZGlzbWlzcycpO1xuXHRcdFx0dGhpcy5fZGlzbWlzc0ZvcldpbmRvdygpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3VwZGF0ZSgpO1xuXHR9XG5cblx0LyoqIExvZyBhIHVzZXIgaW50ZXJhY3Rpb24gKG9wZW4sIGRpc21pc3MsIG11dGUpIHdpdGggdGhlIGhhbmRvZmYgdGlwLiAqL1xuXHRwcml2YXRlIF9sb2dUaXBBY3Rpb24oYWN0aW9uOiAnb3BlbicgfCAnZGlzbWlzcycgfCAnbXV0ZScpOiB2b2lkIHtcblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8QWdlbnRzSGFuZG9mZlRpcEFjdGlvbkV2ZW50LCBBZ2VudHNIYW5kb2ZmVGlwQWN0aW9uQ2xhc3NpZmljYXRpb24+KCdjaGF0LmFnZW50c0hhbmRvZmZUaXAuYWN0aW9uJywge1xuXHRcdFx0YWN0aW9uLFxuXHRcdFx0bW9kZTogdGhpcy5fZ2V0TW9kZSgpLFxuXHRcdFx0c2Vzc2lvblR5cGU6IHRoaXMuX2xhc3RQb3N0ZWRTZXNzaW9uVHlwZSA/PyAnJyxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldE1vZGUoKTogQWdlbnRzSGFuZG9mZlRpcE1vZGUge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihDaGF0Q29uZmlndXJhdGlvbi5BZ2VudHNIYW5kb2ZmVGlwTW9kZSk7XG5cdFx0c3dpdGNoICh2YWx1ZSkge1xuXHRcdFx0Y2FzZSBBZ2VudHNIYW5kb2ZmVGlwTW9kZS5IaWRkZW46XG5cdFx0XHRjYXNlIEFnZW50c0hhbmRvZmZUaXBNb2RlLkN1c3RvbTpcblx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIEFnZW50c0hhbmRvZmZUaXBNb2RlLkRlZmF1bHQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1vZGUgPSB0aGlzLl9nZXRNb2RlKCk7XG5cblx0XHQvLyBTdXBwcmVzcyB0aGUgdGlwIGVudGlyZWx5IHdoZW4gdGhlIG1vZGUgaGlkZXMgaXQsIG9yIG9uY2UgdGhlIHVzZXIgaGFzXG5cdFx0Ly8gZGlzbWlzc2VkL29wZW5lZCBpdCBmb3IgdGhpcyB3aW5kb3cuXG5cdFx0aWYgKG1vZGUgPT09IEFnZW50c0hhbmRvZmZUaXBNb2RlLkhpZGRlbiB8fCB0aGlzLl9kaXNtaXNzZWRGb3JXaW5kb3cpIHtcblx0XHRcdGlmICh0aGlzLl9sYXN0UG9zdGVkRm9yKSB7XG5cdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UuZGVsZXRlTm90aWZpY2F0aW9uKEFnZW50c0hhbmRvZmZJbnB1dFRpcENvbnRyaWJ1dGlvbi5OT1RJRklDQVRJT05fSUQpO1xuXHRcdFx0XHR0aGlzLl9sYXN0UG9zdGVkRm9yID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX2NoYXRXaWRnZXRTZXJ2aWNlLmxhc3RGb2N1c2VkV2lkZ2V0O1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IHdpZGdldD8udmlld01vZGVsPy5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0Y29uc3QgcmVzb3VyY2VTZXNzaW9uVHlwZSA9IHNlc3Npb25SZXNvdXJjZSA/IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHByZWNvbmRpdGlvbk1ldCA9IHdpZGdldD8uc2NvcGVkQ29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhPUEVOX0FHRU5UU19XSU5ET1dfUFJFQ09ORElUSU9OKSA/PyBmYWxzZTtcblxuXHRcdC8vIEV4aXN0aW5nLXNlc3Npb24gcGF0aDogZ2F0ZSBvbiB0aGUgVVJJLWRlcml2ZWQgc2Vzc2lvbiB0eXBlIHNvIHdlXG5cdFx0Ly8gZG9uJ3QgcG9zdCB0aGUgdGlwIGZvciBub24tZWxpZ2libGUgc2Vzc2lvbiBraW5kcyAoQ29waWxvdCBDbG91ZCxcblx0XHQvLyBsb2NhbCwgZXRjLikuIFRoZSBub3RpZmljYXRpb24gd2lkZ2V0IGFsc28gZmlsdGVycyBieVxuXHRcdC8vIGBzZXNzaW9uVHlwZXNgLCBidXQgd2Ugd2FudCB0byBhdm9pZCBldmVuIHBvc3Rpbmcgd2hlbiB0aGUgVVJJXG5cdFx0Ly8gYWxyZWFkeSB0ZWxscyB1cyB0aGlzIGlzbid0IGEgaGFuZG9mZiB0YXJnZXQuXG5cdFx0Y29uc3QgZWxpZ2libGUgPSBwcmVjb25kaXRpb25NZXRcblx0XHRcdCYmICEhc2Vzc2lvblJlc291cmNlXG5cdFx0XHQmJiAhIXJlc291cmNlU2Vzc2lvblR5cGVcblx0XHRcdCYmIEFnZW50c0hhbmRvZmZJbnB1dFRpcENvbnRyaWJ1dGlvbi5FTElHSUJMRV9TRVNTSU9OX1RZUEVTLmhhcyhyZXNvdXJjZVNlc3Npb25UeXBlKVxuXHRcdFx0JiYgIWlzVW50aXRsZWRDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpO1xuXG5cdFx0Ly8gRW1wdHktd29ya3NwYWNlIHBhdGg6IG5vIHVzYWJsZSBzZXNzaW9uIHlldCAoQ0xJIC8gYWdlbnQtaG9zdCBsb2NhbFxuXHRcdC8vIGNhbid0IHJ1biBoZXJlLCBhbmQgcGlja2luZyB0aGUgbW9kZSBvbmx5IGNyZWF0ZXMgYSBwbGFjZWhvbGRlclxuXHRcdC8vIHVudGl0bGVkIHNlc3Npb24gdGhhdCB3ZSBzaG91bGRuJ3QgdHJ5IHRvIGhhbmQgb2ZmKS4gR2F0ZSBvbiB0aGVcblx0XHQvLyB3aWRnZXQncyBjdXJyZW50IHNlc3Npb24gdHlwZSBzbyB3ZSBkb24ndCBjaHVybiBgX2xhc3RQb3N0ZWRGb3JgXG5cdFx0Ly8gd2hpbGUgdGhlIHVzZXIgaXMgb24gYSBub24tZWxpZ2libGUgbW9kZSAoQ2xhdWRlLCBDbG91ZCwgXHUyMDI2KSBcdTIwMTQgdGhlXG5cdFx0Ly8gbm90aWZpY2F0aW9uIHdpZGdldCdzIG93biBgc2Vzc2lvblR5cGVzYCBmaWx0ZXIgd291bGQgc3RpbGwgaGlkZVxuXHRcdC8vIHRoZSByZW5kZXJlZCBiYW5uZXIsIGJ1dCB3ZSBkb24ndCB3YW50IHRvIHBvc3QtdGhlbi1oaWRlLlxuXHRcdGNvbnN0IHdpZGdldFNlc3Npb25UeXBlID0gd2lkZ2V0Py5zY29wZWRDb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWU8c3RyaW5nPihDaGF0Q29udGV4dEtleXMuY2hhdFNlc3Npb25UeXBlLmtleSk7XG5cdFx0Y29uc3QgaXNFbXB0eVdvcmtzcGFjZSA9IHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZO1xuXHRcdGNvbnN0IGVtcHR5V29ya3NwYWNlRWxpZ2libGUgPSBwcmVjb25kaXRpb25NZXRcblx0XHRcdCYmIGlzRW1wdHlXb3Jrc3BhY2Vcblx0XHRcdCYmICghc2Vzc2lvblJlc291cmNlIHx8IGlzVW50aXRsZWRDaGF0U2Vzc2lvbihzZXNzaW9uUmVzb3VyY2UpKVxuXHRcdFx0JiYgd2lkZ2V0U2Vzc2lvblR5cGUgPT09IFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3Q7XG5cblx0XHRpZiAoIWVsaWdpYmxlICYmICFlbXB0eVdvcmtzcGFjZUVsaWdpYmxlKSB7XG5cdFx0XHRpZiAodGhpcy5fbGFzdFBvc3RlZEZvcikge1xuXHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLmRlbGV0ZU5vdGlmaWNhdGlvbihBZ2VudHNIYW5kb2ZmSW5wdXRUaXBDb250cmlidXRpb24uTk9USUZJQ0FUSU9OX0lEKTtcblx0XHRcdFx0dGhpcy5fbGFzdFBvc3RlZEZvciA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBrZXkgPSBlbGlnaWJsZSAmJiBzZXNzaW9uUmVzb3VyY2Vcblx0XHRcdD8gc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKClcblx0XHRcdDogQWdlbnRzSGFuZG9mZklucHV0VGlwQ29udHJpYnV0aW9uLkVNUFRZX1dPUktTUEFDRV9LRVk7XG5cblx0XHQvLyBPbmx5IGNhbGwgc2V0Tm90aWZpY2F0aW9uIHdoZW4gdGhlIHRhcmdldCBzZXNzaW9uIGNoYW5nZXMuIFJlLWNhbGxpbmdcblx0XHQvLyBzZXROb3RpZmljYXRpb24gY2xlYXJzIHRoZSB1c2VyJ3MgZGlzbWlzc2FsLCB3aGljaCB3b3VsZCBtYWtlIHRoZVxuXHRcdC8vIGRpc21pc3MgYnV0dG9uIGVmZmVjdGl2ZWx5IGEgbm8tb3Agd2hlbiB0aGUgY29udGV4dCBrZXkgc2VydmljZVxuXHRcdC8vIGZpcmVzIHJlcGVhdGVkIGNoYW5nZSBldmVudHMgZm9yIHRoZSBzYW1lIHNlc3Npb24uXG5cdFx0aWYgKHRoaXMuX2xhc3RQb3N0ZWRGb3IgPT09IGtleSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sYXN0UG9zdGVkRm9yID0ga2V5O1xuXG5cdFx0Ly8gUmVjb3JkIHRoZSBhZ2VudCBoYXJuZXNzIChzZXNzaW9uIHR5cGUpIG9mIHRoZSBwb3N0ZWQgdGlwIGZvciBjbGljayB0ZWxlbWV0cnkuXG5cdFx0dGhpcy5fbGFzdFBvc3RlZFNlc3Npb25UeXBlID0gZWxpZ2libGUgPyByZXNvdXJjZVNlc3Npb25UeXBlIDogd2lkZ2V0U2Vzc2lvblR5cGU7XG5cblx0XHQvLyBPbmx5IGZvcndhcmQgYSByZWFsIChub24tdW50aXRsZWQpIHNlc3Npb24gcmVzb3VyY2UuIEluIHRoZSBlbXB0eVxuXHRcdC8vIHdvcmtzcGFjZSBjYXNlIHRoZSBwaWNrZXIgbWF5IGhhdmUgY3JlYXRlZCBhIHBsYWNlaG9sZGVyIHVudGl0bGVkXG5cdFx0Ly8gc2Vzc2lvbiB0aGF0IHdlIHNob3VsZG4ndCB0cnkgdG8gcmVzdG9yZSBvbiB0aGUgb3RoZXIgc2lkZS5cblx0XHRjb25zdCBjb21tYW5kQXJnczogdW5rbm93bltdID0gZWxpZ2libGUgJiYgc2Vzc2lvblJlc291cmNlID8gW3Nlc3Npb25SZXNvdXJjZV0gOiBbXTtcblxuXHRcdC8vIEVtcHR5LXdvcmtzcGFjZSArIGxvY2FsIENvcGlsb3QgQ0xJOiB0aGUgbG9jYWwgYWdlbnQgaG9zdCBjYW4ndFxuXHRcdC8vIHJ1biB3aXRob3V0IGEgZm9sZGVyLCBzbyBmcmFtZSB0aGUgdGlwIGFzIHRoZSBwYXRoIGZvcndhcmQgcmF0aGVyXG5cdFx0Ly8gdGhhbiBhIGdlbmVyaWMgXCJjb250aW51ZSBpbiBhZ2VudHNcIiB1cHNlbGwuXG5cdFx0Y29uc3QgdXNlRW1wdHlXb3Jrc3BhY2VDb3B5ID0gZW1wdHlXb3Jrc3BhY2VFbGlnaWJsZSAmJiAhZWxpZ2libGU7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IHVzZUVtcHR5V29ya3NwYWNlQ29weVxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5hZ2VudHNIYW5kb2ZmLnRpcC5lbXB0eVdvcmtzcGFjZS5tZXNzYWdlJywgXCJDb3BpbG90IENMSSBbQWdlbnQgSG9zdF0gaXNuJ3QgYXZhaWxhYmxlIHdpdGhvdXQgYW4gb3BlbiBmb2xkZXJcIilcblx0XHRcdDogbG9jYWxpemUoJ2NoYXQuYWdlbnRzSGFuZG9mZi50aXAubWVzc2FnZScsIFwiQ29udGludWUgdGhpcyBzZXNzaW9uIGluIHRoZSBBZ2VudHMgV2luZG93XCIpO1xuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gdXNlRW1wdHlXb3Jrc3BhY2VDb3B5XG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LmFnZW50c0hhbmRvZmYudGlwLmVtcHR5V29ya3NwYWNlLmRlc2NyaXB0aW9uJywgXCJPcGVuIHRoZSBBZ2VudHMgV2luZG93IHRvIHN0YXJ0IGEgQ29waWxvdCBDTEkgc2Vzc2lvbi5cIilcblx0XHRcdDogbW9kZSA9PT0gQWdlbnRzSGFuZG9mZlRpcE1vZGUuQ3VzdG9tXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQuYWdlbnRzSGFuZG9mZi50aXAuZGVzY3JpcHRpb24uY29waWxvdCcsIFwiRnJlZSB3aXRoIHlvdXIgQ29waWxvdCBwbGFuIFx1MjAxNCBnZXQgYSBkZWRpY2F0ZWQsIG11bHRpLXBhbmUgdmlldyBhbG9uZ3NpZGUgeW91ciB3b3Jrc3BhY2UuXCIpXG5cdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQuYWdlbnRzSGFuZG9mZi50aXAuZGVzY3JpcHRpb24nLCBcIkdldCBhIGRlZGljYXRlZCwgbXVsdGktcGFuZSB2aWV3IGFsb25nc2lkZSB5b3VyIHdvcmtzcGFjZS5cIik7XG5cdFx0Y29uc3QgYWN0aW9uTGFiZWwgPSB1c2VFbXB0eVdvcmtzcGFjZUNvcHlcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXQuYWdlbnRzSGFuZG9mZi50aXAuYWN0aW9uJywgXCJPcGVuIGluIEFnZW50cyBXaW5kb3dcIilcblx0XHRcdDogbW9kZSA9PT0gQWdlbnRzSGFuZG9mZlRpcE1vZGUuQ3VzdG9tXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQuYWdlbnRzSGFuZG9mZi50aXAuYWN0aW9uLmN1c3RvbScsIFwiR2l2ZSB5b3VyIGFnZW50IG1vcmUgcm9vbT9cIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5hZ2VudHNIYW5kb2ZmLnRpcC5hY3Rpb24uZGVmYXVsdCcsIFwiQ29udGludWUgaW4gQWdlbnRzIFdpbmRvd1wiKTtcblxuXHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2Uuc2V0Tm90aWZpY2F0aW9uKHtcblx0XHRcdGlkOiBBZ2VudHNIYW5kb2ZmSW5wdXRUaXBDb250cmlidXRpb24uTk9USUZJQ0FUSU9OX0lELFxuXHRcdFx0c2V2ZXJpdHk6IENoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0ZGVzY3JpcHRpb24sXG5cdFx0XHRhY3Rpb25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRraW5kOiBDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLkNvbW1hbmQsXG5cdFx0XHRcdFx0bGFiZWw6IGFjdGlvbkxhYmVsLFxuXHRcdFx0XHRcdGNvbW1hbmRJZDogQWdlbnRzSGFuZG9mZklucHV0VGlwQ29udHJpYnV0aW9uLlRJUF9PUEVOX0NPTU1BTkRfSUQsXG5cdFx0XHRcdFx0Y29tbWFuZEFyZ3MsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0ZGlzbWlzc2libGU6IHRydWUsXG5cdFx0XHRhdXRvRGlzbWlzc09uTWVzc2FnZTogZmFsc2UsXG5cdFx0XHRtdXRlOiB7XG5cdFx0XHRcdGNvbW1hbmRJZDogQWdlbnRzSGFuZG9mZklucHV0VGlwQ29udHJpYnV0aW9uLlRJUF9NVVRFX0NPTU1BTkRfSUQsXG5cdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdjaGF0LmFnZW50c0hhbmRvZmYudGlwLm11dGUnLCBcIkRvbid0IFNob3cgQWdhaW5cIiksXG5cdFx0XHR9LFxuXHRcdFx0c2Vzc2lvblR5cGVzOiB1c2VFbXB0eVdvcmtzcGFjZUNvcHlcblx0XHRcdFx0PyBbU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdF1cblx0XHRcdFx0OiBBcnJheS5mcm9tKEFnZW50c0hhbmRvZmZJbnB1dFRpcENvbnRyaWJ1dGlvbi5FTElHSUJMRV9TRVNTSU9OX1RZUEVTKSxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNYXJrIHRoZSB0aXAgYXMgaGFuZGxlZCAoZGlzbWlzc2VkIG9yIG9wZW5lZCkgZm9yIHRoZSByZXN0IG9mIHRoaXNcblx0ICogd2luZG93J3MgbGlmZXRpbWUgYW5kIHRlYXIgZG93biBhbnkgY3VycmVudGx5IHBvc3RlZCBub3RpZmljYXRpb24uXG5cdCAqL1xuXHRwcml2YXRlIF9kaXNtaXNzRm9yV2luZG93KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaXNtaXNzZWRGb3JXaW5kb3cpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZGlzbWlzc2VkRm9yV2luZG93ID0gdHJ1ZTtcblx0XHR0aGlzLl91cGRhdGUoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFJQSxPQUFPO0FBQ1AsU0FBUyxHQUFHLGNBQWM7QUFDMUIsU0FBUywwQkFBc0Q7QUFDL0QsU0FBUywrQkFBK0I7QUFFeEMsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLGdCQUFnQiwwQkFBMEI7QUFDbkQsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBMEI7QUFDbkMsU0FBUywwQkFBMEIsc0JBQXNCO0FBQ3pELFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsa0NBQWtDO0FBRTNDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsb0JBQW9CLDZCQUE2QjtBQUMxRCxTQUFTLGlDQUFpQywrQkFBK0IscUNBQXFDO0FBQzlHLFNBQVMsNENBQTRDLGlDQUFpQywrQkFBK0IseUJBQXlCO0FBQzlJLFNBQVMsa0JBQWtCLHVCQUF1QjtBQUNsRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHdCQUF3QixnQ0FBZ0M7QUFFakUsTUFBTSx3Q0FBd0MsVUFBVSwrQkFBK0IsZ0JBQWdC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
