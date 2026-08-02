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
import { BrowserViewCommandId, BrowserViewStorageScope, ipcBrowserViewChannelName } from "../../../../platform/browserView/common/browserView.js";
import { BrowserViewModel } from "../common/browserView.js";
import { IMainProcessService } from "../../../../platform/ipc/common/mainProcessService.js";
import { ProxyChannel } from "../../../../base/parts/ipc/common/ipc.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { Emitter } from "../../../../base/common/event.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { process } from "../../../../base/parts/sandbox/electron-browser/globals.js";
import { ACTIVE_GROUP, AUX_WINDOW_GROUP, IEditorService, SIDE_GROUP, USE_MODAL_EDITOR_SETTING } from "../../../services/editor/common/editorService.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { BrowserEditorInput } from "../common/browserEditorInput.js";
import { IEditorGroupsService, preferredSideBySideGroupDirection } from "../../../services/editor/common/editorGroupsService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ChatContextKeys } from "../../chat/common/actions/chatContextKeys.js";
import { IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { ChatConfiguration } from "../../chat/common/constants.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { contrastBorder, descriptionForeground, focusBorder } from "../../../../platform/theme/common/colors/baseColors.js";
import { buttonForeground, buttonBackground, inputPlaceholderForeground } from "../../../../platform/theme/common/colors/inputColors.js";
import { editorWidgetBackground, editorWidgetBorder, editorWidgetForeground, toolbarHoverBackground, widgetShadow } from "../../../../platform/theme/common/colors/editorColors.js";
import { DEFAULT_FONT_FAMILY } from "../../../../base/browser/fonts.js";
import { findGroup } from "../../../services/editor/common/editorGroupFinder.js";
import { ChatEditorInput } from "../../chat/browser/widgetHosts/editor/chatEditorInput.js";
import { IChatWidgetService } from "../../chat/browser/chat.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { URI } from "../../../../base/common/uri.js";
import { isEqual } from "../../../../base/common/resources.js";
import { Schemas } from "../../../../base/common/network.js";
import { getCopilotRootPaths } from "../../../../platform/agentHost/common/copilotHome.js";
import { localChatSessionType } from "../../chat/common/chatSessionsService.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
const BrowserMaxHistoryEntriesSettingId = "workbench.browser.maxHistoryEntries";
const BrowserRemoteProxyEnabledSettingId = "workbench.browser.enableRemoteProxy";
const BrowserNewTabPlacementSettingId = "workbench.browser.newTabPlacement";
const browserViewContextMenuCommands = [
  BrowserViewCommandId.GoBack,
  BrowserViewCommandId.GoForward,
  BrowserViewCommandId.Reload
];
let BrowserViewWorkbenchService = class extends Disposable {
  constructor(mainProcessService, instantiationService, workspaceContextService, keybindingService, editorService, editorGroupsService, configurationService, workspaceTrustManagementService, workspaceTrustEnablementService, logService, contextKeyService, environmentService, themeService, chatWidgetService, accessibilityService) {
    super();
    this.instantiationService = instantiationService;
    this.workspaceContextService = workspaceContextService;
    this.keybindingService = keybindingService;
    this.editorService = editorService;
    this.editorGroupsService = editorGroupsService;
    this.configurationService = configurationService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.workspaceTrustEnablementService = workspaceTrustEnablementService;
    this.logService = logService;
    this.contextKeyService = contextKeyService;
    this.environmentService = environmentService;
    this.themeService = themeService;
    this.chatWidgetService = chatWidgetService;
    this.accessibilityService = accessibilityService;
    this._known = /* @__PURE__ */ new Map();
    this._contextualFilters = /* @__PURE__ */ new Set();
    this._openHandlers = /* @__PURE__ */ new Set();
    this._onDidChangeBrowserViews = this._register(new Emitter());
    this.onDidChangeBrowserViews = this._onDidChangeBrowserViews.event;
    this._isSharingAvailable = false;
    this._onDidChangeSharingAvailable = this._register(new Emitter());
    this.onDidChangeSharingAvailable = this._onDidChangeSharingAvailable.event;
    const channel = mainProcessService.getChannel(ipcBrowserViewChannelName);
    this._browserViewService = ProxyChannel.toService(channel);
    this._mainWindowId = mainWindow.vscodeWindowId;
    this._updateWindowConfiguration();
    const chatEnabledKeys = new Set(ChatContextKeys.enabled.keys());
    this._register(this.keybindingService.onDidUpdateKeybindings(() => this._updateWindowConfiguration()));
    this._register(this.themeService.onDidColorThemeChange(() => this._updateWindowConfiguration()));
    this._register(this.accessibilityService.onDidChangeReducedMotion(() => this._updateWindowConfiguration()));
    this._register(this.workspaceTrustManagementService.onDidChangeTrustedFolders(() => this._updateWindowConfiguration()));
    this._register(this.workspaceTrustManagementService.onDidChangeTrust(() => this._updateWindowConfiguration()));
    this._register(this.workspaceContextService.onDidChangeWorkspaceFolders(() => this._updateWindowConfiguration()));
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(chatEnabledKeys)) {
        this._updateWindowConfiguration();
      }
    }));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(BrowserMaxHistoryEntriesSettingId) || e.affectsConfiguration(BrowserRemoteProxyEnabledSettingId)) {
        this._updateWindowConfiguration();
      }
    }));
    this._isSharingAvailable = this.contextKeyService.contextMatchesRules(BrowserViewWorkbenchService._sharingAvailableContext);
    const sharingKeys = new Set(BrowserViewWorkbenchService._sharingAvailableContext.keys());
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(sharingKeys)) {
        const was = this._isSharingAvailable;
        this._isSharingAvailable = this.contextKeyService.contextMatchesRules(BrowserViewWorkbenchService._sharingAvailableContext);
        if (was !== this._isSharingAvailable) {
          this._onDidChangeSharingAvailable.fire(this._isSharingAvailable);
        }
      }
    }));
    void this._initializeExistingViews().catch((e) => {
      this.logService.error("[BrowserViewWorkbenchService] Failed to initialize existing browser views.", e);
    });
    this._register(this._browserViewService.onDidCreateBrowserView((e) => {
      if (e.info.owner.mainWindowId !== this._mainWindowId) {
        return;
      }
      this._createModel(e.info.id, e.info.owner, e.info.state);
      const editor = this._known.get(e.info.id);
      if (editor && e.openOptions) {
        void this._openEditorForCreatedView(editor, e.info.owner, e.openOptions).catch((error) => {
          this.logService.error("[BrowserViewWorkbenchService] Failed to open editor for created browser view.", error);
        });
      }
    }));
  }
  get isSharingAvailable() {
    return this._isSharingAvailable;
  }
  willUseRemoteProxy() {
    if (!this.environmentService.remoteAuthority) {
      return false;
    }
    if (!this.configurationService.getValue(BrowserRemoteProxyEnabledSettingId)) {
      return false;
    }
    return true;
  }
  setRemoteProxyInfo(info) {
    this._remoteProxyInfo = info;
    this._updateWindowConfiguration();
  }
  getKnownBrowserViews() {
    return this._known;
  }
  registerContextualFilter(filter) {
    this._contextualFilters.add(filter);
    const changeListener = filter.onDidChange?.(() => this._onDidChangeBrowserViews.fire());
    this._onDidChangeBrowserViews.fire();
    return toDisposable(() => {
      this._contextualFilters.delete(filter);
      changeListener?.dispose();
      this._onDidChangeBrowserViews.fire();
    });
  }
  getContextualBrowserViews(context) {
    if (this._contextualFilters.size === 0) {
      return this._known;
    }
    const filters = [...this._contextualFilters];
    const result = /* @__PURE__ */ new Map();
    for (const [id, input] of this._known) {
      if (filters.every((filter) => filter.include(input, { ...context }))) {
        result.set(id, input);
      }
    }
    return result;
  }
  async getPreferredGroup(preferredGroup) {
    if (preferredGroup === SIDE_GROUP) {
      return this._getOrCreateDedicatedGroup("sideGroup");
    }
    if (preferredGroup !== void 0 && preferredGroup !== ACTIVE_GROUP) {
      return preferredGroup;
    }
    const placement = this.configurationService.getValue(BrowserNewTabPlacementSettingId);
    if (placement === "sideGroup" || placement === "window") {
      return this._getOrCreateDedicatedGroup(placement);
    }
    if (this.configurationService.getValue(USE_MODAL_EDITOR_SETTING) === "all") {
      return this.editorGroupsService.mainPart.activeGroup;
    }
    return preferredGroup;
  }
  /**
   * Resolve the dedicated editor group for the given placement, reusing an
   * existing locked browser group if one is found (so it survives window
   * reloads) or creating and locking a new one otherwise. Side-group creation
   * is synchronous; window creation is asynchronous.
   */
  _getOrCreateDedicatedGroup(placement) {
    const existing = this._findDedicatedGroup(placement);
    if (existing) {
      return existing;
    }
    if (placement === "sideGroup") {
      const direction = preferredSideBySideGroupDirection(this.configurationService);
      const group = this.editorGroupsService.addGroup(this.editorGroupsService.activeGroup, direction);
      group.lock(true);
      return group;
    }
    if (!this._dedicatedWindowGroupPromise) {
      this._dedicatedWindowGroupPromise = this.editorGroupsService.createAuxiliaryEditorPart().then((part) => {
        part.activeGroup.lock(true);
        return part.activeGroup;
      }).finally(() => this._dedicatedWindowGroupPromise = void 0);
    }
    return this._dedicatedWindowGroupPromise;
  }
  /**
   * Find an existing dedicated browser group for the given placement. A group
   * qualifies when it is locked and contains a browser editor (or is empty),
   * which lets us rediscover the dedicated group after a window reload
   * without tracking it in memory. Side groups live in the main editor part;
   * window groups live in an auxiliary editor part.
   */
  _findDedicatedGroup(placement) {
    const mainPart = this.editorGroupsService.mainPart;
    for (const group of this.editorGroupsService.groups) {
      if (!group.isLocked) {
        continue;
      }
      if (group.editors.length > 0 && !group.editors.some((editor) => editor instanceof BrowserEditorInput)) {
        continue;
      }
      const inMainPart = this.editorGroupsService.getPart(group) === mainPart;
      const matchesPlacement = placement === "sideGroup" ? inMainPart : !inMainPart;
      if (matchesPlacement) {
        return group;
      }
    }
    return void 0;
  }
  registerOpenHandler(handler) {
    this._openHandlers.add(handler);
    return toDisposable(() => {
      this._openHandlers.delete(handler);
    });
  }
  getOrCreateLazy(id, initialState, model) {
    if (!this._known.has(id)) {
      const input = this.instantiationService.createInstance(BrowserEditorInput, { id, ...initialState }, async () => {
        const state = await this._browserViewService.getOrCreateBrowserView(
          id,
          {
            owner: this._getDefaultOwner(),
            sessionOptions: {
              scope: await this._resolveStorageScope()
            },
            initialState: {
              url: initialState?.url,
              title: initialState?.title,
              lastFavicon: initialState?.favicon
            }
          }
        );
        return this._createModel(id, this._getDefaultOwner(), state);
      });
      input.onWillDispose(() => {
        this._known.delete(id);
        this._onDidChangeBrowserViews.fire();
      });
      if (model) {
        input.model = model;
      }
      this._known.set(id, input);
      this._onDidChangeBrowserViews.fire();
    }
    return this._known.get(id);
  }
  async clearGlobalStorage() {
    return this._browserViewService.clearGlobalStorage();
  }
  async clearWorkspaceStorage() {
    const workspaceId = this.workspaceContextService.getWorkspace().id;
    return this._browserViewService.clearWorkspaceStorage(workspaceId);
  }
  _getDefaultOwner() {
    return { mainWindowId: this._mainWindowId };
  }
  async _resolveStorageScope() {
    let dataStorage = this.configurationService.getValue(
      "workbench.browser.dataStorage"
    ) ?? "default";
    await this.workspaceTrustManagementService.workspaceTrustInitialized;
    const isWorkspaceUntrusted = this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY && !this.workspaceTrustManagementService.isWorkspaceTrusted();
    if (isWorkspaceUntrusted) {
      dataStorage = BrowserViewStorageScope.Ephemeral;
    } else if (dataStorage === "default") {
      dataStorage = this.environmentService.remoteAuthority ? BrowserViewStorageScope.Workspace : BrowserViewStorageScope.Global;
    }
    return dataStorage;
  }
  /**
   * Fetch all views owned by this window from the main service and create
   * models for them so they are available synchronously.
   */
  async _initializeExistingViews() {
    const views = await this._browserViewService.getBrowserViews(this._mainWindowId);
    for (const info of views) {
      this._createModel(info.id, info.owner, info.state);
    }
  }
  _createModel(id, owner, state) {
    const existing = this._known.get(id)?.model;
    if (existing) {
      return existing;
    }
    const model = this.instantiationService.createInstance(BrowserViewModel, id, owner, state, this._browserViewService);
    this.getOrCreateLazy(id, {}, model).model = model;
    this._onDidChangeBrowserViews.fire();
    return model;
  }
  /**
   * Open an editor tab for a newly created browser view.
   */
  async _openEditorForCreatedView(view, owner, openOptions) {
    const opts = openOptions;
    for (const handler of this._openHandlers) {
      if (!handler.shouldOpenEditor(view, owner, opts)) {
        return;
      }
    }
    let targetGroup;
    if (opts.auxiliaryWindow) {
      targetGroup = AUX_WINDOW_GROUP;
    } else if (opts.parentViewId) {
      targetGroup = this._findEditorGroupForView(opts.parentViewId);
      if (targetGroup === void 0) {
        return;
      }
    } else {
      targetGroup = await this.getPreferredGroup();
    }
    const editorOptions = {
      inactive: opts.background,
      preserveFocus: opts.preserveFocus,
      pinned: opts.pinned,
      auxiliary: opts.auxiliaryWindow ? { bounds: opts.auxiliaryWindow, compact: true } : void 0
    };
    const [group] = await this.instantiationService.invokeFunction(findGroup, { editor: view, options: editorOptions }, targetGroup);
    if (owner.sessionId) {
      const sessionResource = URI.parse(owner.sessionId);
      const widget = this.chatWidgetService.getWidgetBySessionResource(sessionResource);
      const isWidgetVisible = !!widget && widget.domNode.offsetParent !== null;
      const activeIsSameSession = group.activeEditor instanceof ChatEditorInput && isEqual(group.activeEditor.sessionResource, sessionResource);
      if (!isWidgetVisible || activeIsSameSession) {
        editorOptions.inactive = true;
      }
    }
    void this.editorService.openEditor(view, editorOptions, group);
  }
  /**
   * Find the editor group that currently contains a browser view with the
   * given ID, or undefined if not open in any group.
   */
  _findEditorGroupForView(viewId) {
    for (const group of this.editorGroupsService.groups) {
      for (const editor of group.editors) {
        if (editor instanceof BrowserEditorInput && editor.id === viewId) {
          return group.id;
        }
      }
    }
    return void 0;
  }
  _updateWindowConfiguration() {
    void this._browserViewService.updateWindowConfiguration(this._mainWindowId, {
      theme: this._getTheme(),
      keybindings: this._getKeybindings(),
      aiFeaturesDisabled: !this.contextKeyService.contextMatchesRules(ChatContextKeys.enabled),
      maxHistoryEntries: this.configurationService.getValue(BrowserMaxHistoryEntriesSettingId),
      proxyInfo: this._remoteProxyInfo,
      trustedFileRoots: this._getTrustedFileRoots(),
      trustAllFiles: !this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()
    });
  }
  _getKeybindings() {
    const keybindings = /* @__PURE__ */ Object.create(null);
    for (const commandId of browserViewContextMenuCommands) {
      const binding = this.keybindingService.lookupKeybinding(commandId);
      const accelerator = binding?.getElectronAccelerator();
      if (accelerator) {
        keybindings[commandId] = accelerator;
      }
    }
    return keybindings;
  }
  _getTheme() {
    const theme = this.themeService.getColorTheme();
    return {
      focusBorder: theme.getColor(focusBorder)?.toString(),
      buttonBackground: theme.getColor(buttonBackground)?.toString(),
      buttonForeground: theme.getColor(buttonForeground)?.toString(),
      widgetBackground: theme.getColor(editorWidgetBackground)?.toString(),
      widgetForeground: theme.getColor(editorWidgetForeground)?.toString(),
      widgetBorder: theme.getColor(editorWidgetBorder)?.toString(),
      widgetShadow: theme.getColor(widgetShadow)?.toString(),
      contrastBorder: theme.getColor(contrastBorder)?.toString(),
      descriptionForeground: theme.getColor(descriptionForeground)?.toString(),
      inputPlaceholderForeground: theme.getColor(inputPlaceholderForeground)?.toString(),
      toolbarHoverBackground: theme.getColor(toolbarHoverBackground)?.toString(),
      font: DEFAULT_FONT_FAMILY,
      reducedMotion: this.accessibilityService.isMotionReduced()
    };
  }
  _getTrustedFileRoots() {
    const roots = new Set(getCopilotRootPaths(this.environmentService.userHome.fsPath, process.env));
    if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
      for (const folder of this.workspaceContextService.getWorkspace().folders) {
        if (folder.uri.scheme === Schemas.file) {
          roots.add(folder.uri.fsPath);
        }
      }
    }
    for (const uri of this.workspaceTrustManagementService.getTrustedUris()) {
      if (uri.scheme === Schemas.file) {
        roots.add(uri.fsPath);
      }
    }
    return [...roots];
  }
};
BrowserViewWorkbenchService._sharingAvailableContext = ContextKeyExpr.and(
  ChatContextKeys.enabled,
  ContextKeyExpr.has(`config.${ChatConfiguration.AgentEnabled}`),
  ContextKeyExpr.has(`config.workbench.browser.enableChatTools`),
  // If we're in Sessions Window, we require some additional conditions.
  ContextKeyExpr.or(
    IsSessionsWindowContext.negate(),
    ContextKeyExpr.or(
      ContextKeyExpr.equals("sessionType", localChatSessionType),
      ContextKeyExpr.equals("sessions.isAgentHostSession", true)
    )
  )
);
BrowserViewWorkbenchService = __decorateClass([
  __decorateParam(0, IMainProcessService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, IEditorGroupsService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, IWorkspaceTrustManagementService),
  __decorateParam(8, IWorkspaceTrustEnablementService),
  __decorateParam(9, ILogService),
  __decorateParam(10, IContextKeyService),
  __decorateParam(11, INativeWorkbenchEnvironmentService),
  __decorateParam(12, IThemeService),
  __decorateParam(13, IChatWidgetService),
  __decorateParam(14, IAccessibilityService)
], BrowserViewWorkbenchService);
export {
  BrowserMaxHistoryEntriesSettingId,
  BrowserNewTabPlacementSettingId,
  BrowserRemoteProxyEnabledSettingId,
  BrowserViewWorkbenchService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLWJyb3dzZXIvYnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQnJvd3NlclZpZXdDb21tYW5kSWQsIEJyb3dzZXJWaWV3U3RvcmFnZVNjb3BlLCBJQnJvd3NlclZpZXdPcGVuT3B0aW9ucywgSUJyb3dzZXJWaWV3T3duZXIsIElCcm93c2VyVmlld1NlcnZpY2UsIElCcm93c2VyVmlld1N0YXRlLCBJQnJvd3NlclZpZXdUaGVtZSwgaXBjQnJvd3NlclZpZXdDaGFubmVsTmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyVmlldy5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLCBJQnJvd3NlclZpZXdNb2RlbCwgQnJvd3NlclZpZXdNb2RlbCwgSUJyb3dzZXJFZGl0b3JWaWV3U3RhdGUsIElCcm93c2VyVmlld0NvbnRleHR1YWxGaWx0ZXIsIElCcm93c2VyVmlld0ZpbHRlckNvbnRleHQsIElCcm93c2VyVmlld09wZW5IYW5kbGVyIH0gZnJvbSAnLi4vY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IElNYWluUHJvY2Vzc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pcGMvY29tbW9uL21haW5Qcm9jZXNzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQcm94eUNoYW5uZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHByb2Nlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL3NhbmRib3gvZWxlY3Ryb24tYnJvd3Nlci9nbG9iYWxzLmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgQVVYX1dJTkRPV19HUk9VUCwgSUVkaXRvclNlcnZpY2UsIFByZWZlcnJlZEdyb3VwLCBTSURFX0dST1VQLCBVU0VfTU9EQUxfRURJVE9SX1NFVFRJTkcsIFVzZU1vZGFsRWRpdG9yTW9kZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlLCBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgQnJvd3NlckVkaXRvcklucHV0IH0gZnJvbSAnLi4vY29tbW9uL2Jyb3dzZXJFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cHNTZXJ2aWNlLCBwcmVmZXJyZWRTaWRlQnlTaWRlR3JvdXBEaXJlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29udGV4dEtleXMgfSBmcm9tICcuLi8uLi9jaGF0L2NvbW1vbi9hY3Rpb25zL2NoYXRDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBJc1Nlc3Npb25zV2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjb250cmFzdEJvcmRlciwgZGVzY3JpcHRpb25Gb3JlZ3JvdW5kLCBmb2N1c0JvcmRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvcnMvYmFzZUNvbG9ycy5qcyc7XG5pbXBvcnQgeyBidXR0b25Gb3JlZ3JvdW5kLCBidXR0b25CYWNrZ3JvdW5kLCBpbnB1dFBsYWNlaG9sZGVyRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvcnMvaW5wdXRDb2xvcnMuanMnO1xuaW1wb3J0IHsgZWRpdG9yV2lkZ2V0QmFja2dyb3VuZCwgZWRpdG9yV2lkZ2V0Qm9yZGVyLCBlZGl0b3JXaWRnZXRGb3JlZ3JvdW5kLCB0b29sYmFySG92ZXJCYWNrZ3JvdW5kLCB3aWRnZXRTaGFkb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JzL2VkaXRvckNvbG9ycy5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0ZPTlRfRkFNSUxZIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2ZvbnRzLmpzJztcbmltcG9ydCB7IGZpbmRHcm91cCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yR3JvdXBGaW5kZXIuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL3dpZGdldEhvc3RzL2VkaXRvci9jaGF0RWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBnZXRDb3BpbG90Um9vdFBhdGhzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9jb3BpbG90SG9tZS5qcyc7XG5pbXBvcnQgeyBsb2NhbENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2VsZWN0cm9uLWJyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUdW5uZWxQcm94eUluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90dW5uZWwvY29tbW9uL3R1bm5lbFByb3h5LmpzJztcblxuZXhwb3J0IGNvbnN0IEJyb3dzZXJNYXhIaXN0b3J5RW50cmllc1NldHRpbmdJZCA9ICd3b3JrYmVuY2guYnJvd3Nlci5tYXhIaXN0b3J5RW50cmllcyc7XG5leHBvcnQgY29uc3QgQnJvd3NlclJlbW90ZVByb3h5RW5hYmxlZFNldHRpbmdJZCA9ICd3b3JrYmVuY2guYnJvd3Nlci5lbmFibGVSZW1vdGVQcm94eSc7XG5leHBvcnQgY29uc3QgQnJvd3Nlck5ld1RhYlBsYWNlbWVudFNldHRpbmdJZCA9ICd3b3JrYmVuY2guYnJvd3Nlci5uZXdUYWJQbGFjZW1lbnQnO1xuXG4vKipcbiAqIFdoZXJlIG5ldyBpbnRlZ3JhdGVkIGJyb3dzZXIgdGFicyBhcmUgb3BlbmVkLlxuICogLSBgYWN0aXZlR3JvdXBgOiB0aGUgY3VycmVudGx5IGFjdGl2ZSBlZGl0b3IgZ3JvdXAgKGRlZmF1bHQpLlxuICogLSBgc2lkZUdyb3VwYDogYSBkZWRpY2F0ZWQgZWRpdG9yIGdyb3VwIHRvIHRoZSBzaWRlLCBsb2NrZWQgc28gdGhhdCBvdGhlciBlZGl0b3JzIGFyZSBub3Qgb3BlbmVkIGludG8gaXQuXG4gKiAtIGB3aW5kb3dgOiBhIGRlZGljYXRlZCBhdXhpbGlhcnkgd2luZG93LCBsb2NrZWQgc28gdGhhdCBvdGhlciBlZGl0b3JzIGFyZSBub3Qgb3BlbmVkIGludG8gaXQuXG4gKi9cbmV4cG9ydCB0eXBlIEJyb3dzZXJOZXdUYWJQbGFjZW1lbnQgPSAnYWN0aXZlR3JvdXAnIHwgJ3NpZGVHcm91cCcgfCAnd2luZG93JztcblxuLyoqIFRoZSBwbGFjZW1lbnQga2luZHMgdGhhdCByZXNvbHZlIHRvIGEgbmV3IGdyb3VwLiAqL1xudHlwZSBEZWRpY2F0ZWRHcm91cFBsYWNlbWVudCA9IEV4Y2x1ZGU8QnJvd3Nlck5ld1RhYlBsYWNlbWVudCwgJ2FjdGl2ZUdyb3VwJz47XG5cbi8qKiBDb21tYW5kIElEcyB3aG9zZSBhY2NlbGVyYXRvcnMgYXJlIHNob3duIGluIGJyb3dzZXIgdmlldyBjb250ZXh0IG1lbnVzLiAqL1xuY29uc3QgYnJvd3NlclZpZXdDb250ZXh0TWVudUNvbW1hbmRzID0gW1xuXHRCcm93c2VyVmlld0NvbW1hbmRJZC5Hb0JhY2ssXG5cdEJyb3dzZXJWaWV3Q29tbWFuZElkLkdvRm9yd2FyZCxcblx0QnJvd3NlclZpZXdDb21tYW5kSWQuUmVsb2FkLFxuXTtcblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYnJvd3NlclZpZXdTZXJ2aWNlOiBJQnJvd3NlclZpZXdTZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9rbm93biA9IG5ldyBNYXA8c3RyaW5nLCBCcm93c2VyRWRpdG9ySW5wdXQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHR1YWxGaWx0ZXJzID0gbmV3IFNldDxJQnJvd3NlclZpZXdDb250ZXh0dWFsRmlsdGVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcGVuSGFuZGxlcnMgPSBuZXcgU2V0PElCcm93c2VyVmlld09wZW5IYW5kbGVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tYWluV2luZG93SWQ6IG51bWJlcjtcblxuXHQvKiogTGF0ZXN0IHR1bm5lbC1wcm94eSBjcmVkZW50aWFscyBwdXNoZWQgZnJvbSB0aGUgbG9jYWwgZXh0ZW5zaW9uIGhvc3QuICovXG5cdHByaXZhdGUgX3JlbW90ZVByb3h5SW5mbzogSVR1bm5lbFByb3h5SW5mbyB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogSW4tZmxpZ2h0IGNyZWF0aW9uIG9mIHRoZSBkZWRpY2F0ZWQgYnJvd3NlciB3aW5kb3cgZ3JvdXAsIHVzZWQgdG8gY29hbGVzY2Vcblx0ICogY29uY3VycmVudCByZXF1ZXN0cyBzbyB3ZSBkb24ndCBzcGF3biBtdWx0aXBsZSBhdXhpbGlhcnkgd2luZG93cy4gVGhlIGdyb3VwXG5cdCAqIGl0c2VsZiBpcyBub3QgdHJhY2tlZCBpbiBtZW1vcnk6IGl0IGlzIHJlZGlzY292ZXJlZCBkeW5hbWljYWxseSB2aWFcblx0ICoge0BsaW5rIF9maW5kRGVkaWNhdGVkR3JvdXB9IHNvIHRoYXQgaXQgc3Vydml2ZXMgd2luZG93IHJlbG9hZHMuXG5cdCAqL1xuXHRwcml2YXRlIF9kZWRpY2F0ZWRXaW5kb3dHcm91cFByb21pc2U6IFByb21pc2U8SUVkaXRvckdyb3VwPiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUJyb3dzZXJWaWV3cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUJyb3dzZXJWaWV3czogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUJyb3dzZXJWaWV3cy5ldmVudDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfc2hhcmluZ0F2YWlsYWJsZUNvbnRleHQgPSBDb250ZXh0S2V5RXhwci5hbmQoXG5cdFx0Q2hhdENvbnRleHRLZXlzLmVuYWJsZWQsXG5cdFx0Q29udGV4dEtleUV4cHIuaGFzKGBjb25maWcuJHtDaGF0Q29uZmlndXJhdGlvbi5BZ2VudEVuYWJsZWR9YCksXG5cdFx0Q29udGV4dEtleUV4cHIuaGFzKGBjb25maWcud29ya2JlbmNoLmJyb3dzZXIuZW5hYmxlQ2hhdFRvb2xzYCksXG5cdFx0Ly8gSWYgd2UncmUgaW4gU2Vzc2lvbnMgV2luZG93LCB3ZSByZXF1aXJlIHNvbWUgYWRkaXRpb25hbCBjb25kaXRpb25zLlxuXHRcdENvbnRleHRLZXlFeHByLm9yKFxuXHRcdFx0SXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCksXG5cdFx0XHRDb250ZXh0S2V5RXhwci5vcihcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdzZXNzaW9uVHlwZScsIGxvY2FsQ2hhdFNlc3Npb25UeXBlKSxcblx0XHRcdFx0Q29udGV4dEtleUV4cHIuZXF1YWxzKCdzZXNzaW9ucy5pc0FnZW50SG9zdFNlc3Npb24nLCB0cnVlKSxcblx0XHRcdCksXG5cdFx0KSxcblx0KSE7XG5cblx0cHJpdmF0ZSBfaXNTaGFyaW5nQXZhaWxhYmxlOiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTaGFyaW5nQXZhaWxhYmxlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2hhcmluZ0F2YWlsYWJsZTogRXZlbnQ8Ym9vbGVhbj4gPSB0aGlzLl9vbkRpZENoYW5nZVNoYXJpbmdBdmFpbGFibGUuZXZlbnQ7XG5cblx0Z2V0IGlzU2hhcmluZ0F2YWlsYWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faXNTaGFyaW5nQXZhaWxhYmxlO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNYWluUHJvY2Vzc1NlcnZpY2UgbWFpblByb2Nlc3NTZXJ2aWNlOiBJTWFpblByb2Nlc3NTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3Vwc1NlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0V2lkZ2V0U2VydmljZTogSUNoYXRXaWRnZXRTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IGNoYW5uZWwgPSBtYWluUHJvY2Vzc1NlcnZpY2UuZ2V0Q2hhbm5lbChpcGNCcm93c2VyVmlld0NoYW5uZWxOYW1lKTtcblx0XHR0aGlzLl9icm93c2VyVmlld1NlcnZpY2UgPSBQcm94eUNoYW5uZWwudG9TZXJ2aWNlPElCcm93c2VyVmlld1NlcnZpY2U+KGNoYW5uZWwpO1xuXHRcdHRoaXMuX21haW5XaW5kb3dJZCA9IG1haW5XaW5kb3cudnNjb2RlV2luZG93SWQ7XG5cblx0XHQvLyBTZW5kIHRoZSBmdWxsIHBlci13aW5kb3cgY29uZmlndXJhdGlvbiBhcyBhIHNpbmdsZSB1bml0LCBhbmQgcmVzZW5kIGl0XG5cdFx0Ly8gd2hlbmV2ZXIgYW55IG9mIGl0cyBpbnB1dHMgY2hhbmdlLlxuXHRcdHRoaXMuX3VwZGF0ZVdpbmRvd0NvbmZpZ3VyYXRpb24oKTtcblx0XHRjb25zdCBjaGF0RW5hYmxlZEtleXMgPSBuZXcgU2V0KENoYXRDb250ZXh0S2V5cy5lbmFibGVkLmtleXMoKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5rZXliaW5kaW5nU2VydmljZS5vbkRpZFVwZGF0ZUtleWJpbmRpbmdzKCgpID0+IHRoaXMuX3VwZGF0ZVdpbmRvd0NvbmZpZ3VyYXRpb24oKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSgoKSA9PiB0aGlzLl91cGRhdGVXaW5kb3dDb25maWd1cmF0aW9uKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLm9uRGlkQ2hhbmdlUmVkdWNlZE1vdGlvbigoKSA9PiB0aGlzLl91cGRhdGVXaW5kb3dDb25maWd1cmF0aW9uKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VUcnVzdGVkRm9sZGVycygoKSA9PiB0aGlzLl91cGRhdGVXaW5kb3dDb25maWd1cmF0aW9uKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VUcnVzdCgoKSA9PiB0aGlzLl91cGRhdGVXaW5kb3dDb25maWd1cmF0aW9uKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycygoKSA9PiB0aGlzLl91cGRhdGVXaW5kb3dDb25maWd1cmF0aW9uKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKGNoYXRFbmFibGVkS2V5cykpIHtcblx0XHRcdFx0dGhpcy5fdXBkYXRlV2luZG93Q29uZmlndXJhdGlvbigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKEJyb3dzZXJNYXhIaXN0b3J5RW50cmllc1NldHRpbmdJZCkgfHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihCcm93c2VyUmVtb3RlUHJveHlFbmFibGVkU2V0dGluZ0lkKSkge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVXaW5kb3dDb25maWd1cmF0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gVHJhY2sgc2hhcmluZyBhdmFpbGFiaWxpdHkgZnJvbSBjb250ZXh0IGtleXNcblx0XHR0aGlzLl9pc1NoYXJpbmdBdmFpbGFibGUgPSB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNvbnRleHRNYXRjaGVzUnVsZXMoQnJvd3NlclZpZXdXb3JrYmVuY2hTZXJ2aWNlLl9zaGFyaW5nQXZhaWxhYmxlQ29udGV4dCk7XG5cdFx0Y29uc3Qgc2hhcmluZ0tleXMgPSBuZXcgU2V0KEJyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZS5fc2hhcmluZ0F2YWlsYWJsZUNvbnRleHQua2V5cygpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKHNoYXJpbmdLZXlzKSkge1xuXHRcdFx0XHRjb25zdCB3YXMgPSB0aGlzLl9pc1NoYXJpbmdBdmFpbGFibGU7XG5cdFx0XHRcdHRoaXMuX2lzU2hhcmluZ0F2YWlsYWJsZSA9IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UuX3NoYXJpbmdBdmFpbGFibGVDb250ZXh0KTtcblx0XHRcdFx0aWYgKHdhcyAhPT0gdGhpcy5faXNTaGFyaW5nQXZhaWxhYmxlKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTaGFyaW5nQXZhaWxhYmxlLmZpcmUodGhpcy5faXNTaGFyaW5nQXZhaWxhYmxlKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIFN0YXJ0IGFzeW5jaHJvbm91c2x5IGNyZWF0aW5nIG1vZGVscyBmb3IgYWxsIHZpZXdzIHdlIGFscmVhZHkgb3duLlxuXHRcdHZvaWQgdGhpcy5faW5pdGlhbGl6ZUV4aXN0aW5nVmlld3MoKS5jYXRjaChlID0+IHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0Jyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZV0gRmFpbGVkIHRvIGluaXRpYWxpemUgZXhpc3RpbmcgYnJvd3NlciB2aWV3cy4nLCBlKTtcblx0XHR9KTtcblxuXHRcdC8vIExpc3RlbiBmb3IgbmV3IGJyb3dzZXIgdmlld3Ncblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9icm93c2VyVmlld1NlcnZpY2Uub25EaWRDcmVhdGVCcm93c2VyVmlldyhlID0+IHtcblx0XHRcdGlmIChlLmluZm8ub3duZXIubWFpbldpbmRvd0lkICE9PSB0aGlzLl9tYWluV2luZG93SWQpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBOb3QgZm9yIHRoaXMgd2luZG93XG5cdFx0XHR9XG5cblx0XHRcdC8vIEVhZ2VybHkgY3JlYXRlIHRoZSBtb2RlbCBmcm9tIHRoZSBzdGF0ZSB3ZSBhbHJlYWR5IGhhdmVcblx0XHRcdHRoaXMuX2NyZWF0ZU1vZGVsKGUuaW5mby5pZCwgZS5pbmZvLm93bmVyLCBlLmluZm8uc3RhdGUpO1xuXG5cdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9rbm93bi5nZXQoZS5pbmZvLmlkKTtcblx0XHRcdGlmIChlZGl0b3IgJiYgZS5vcGVuT3B0aW9ucykge1xuXHRcdFx0XHR2b2lkIHRoaXMuX29wZW5FZGl0b3JGb3JDcmVhdGVkVmlldyhlZGl0b3IsIGUuaW5mby5vd25lciwgZS5vcGVuT3B0aW9ucykuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW0Jyb3dzZXJWaWV3V29ya2JlbmNoU2VydmljZV0gRmFpbGVkIHRvIG9wZW4gZWRpdG9yIGZvciBjcmVhdGVkIGJyb3dzZXIgdmlldy4nLCBlcnJvcik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHdpbGxVc2VSZW1vdGVQcm94eSgpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQnJvd3NlclJlbW90ZVByb3h5RW5hYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRzZXRSZW1vdGVQcm94eUluZm8oaW5mbzogSVR1bm5lbFByb3h5SW5mbyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlbW90ZVByb3h5SW5mbyA9IGluZm87XG5cdFx0dGhpcy5fdXBkYXRlV2luZG93Q29uZmlndXJhdGlvbigpO1xuXHR9XG5cblx0Z2V0S25vd25Ccm93c2VyVmlld3MoKTogTWFwPHN0cmluZywgQnJvd3NlckVkaXRvcklucHV0PiB7XG5cdFx0cmV0dXJuIHRoaXMuX2tub3duO1xuXHR9XG5cblx0cmVnaXN0ZXJDb250ZXh0dWFsRmlsdGVyKGZpbHRlcjogSUJyb3dzZXJWaWV3Q29udGV4dHVhbEZpbHRlcik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9jb250ZXh0dWFsRmlsdGVycy5hZGQoZmlsdGVyKTtcblx0XHRjb25zdCBjaGFuZ2VMaXN0ZW5lciA9IGZpbHRlci5vbkRpZENoYW5nZT8uKCgpID0+IHRoaXMuX29uRGlkQ2hhbmdlQnJvd3NlclZpZXdzLmZpcmUoKSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VCcm93c2VyVmlld3MuZmlyZSgpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fY29udGV4dHVhbEZpbHRlcnMuZGVsZXRlKGZpbHRlcik7XG5cdFx0XHRjaGFuZ2VMaXN0ZW5lcj8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VCcm93c2VyVmlld3MuZmlyZSgpO1xuXHRcdH0pO1xuXHR9XG5cblx0Z2V0Q29udGV4dHVhbEJyb3dzZXJWaWV3cyhjb250ZXh0PzogSUJyb3dzZXJWaWV3RmlsdGVyQ29udGV4dCk6IE1hcDxzdHJpbmcsIEJyb3dzZXJFZGl0b3JJbnB1dD4ge1xuXHRcdGlmICh0aGlzLl9jb250ZXh0dWFsRmlsdGVycy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fa25vd247XG5cdFx0fVxuXHRcdGNvbnN0IGZpbHRlcnMgPSBbLi4udGhpcy5fY29udGV4dHVhbEZpbHRlcnNdO1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBCcm93c2VyRWRpdG9ySW5wdXQ+KCk7XG5cdFx0Zm9yIChjb25zdCBbaWQsIGlucHV0XSBvZiB0aGlzLl9rbm93bikge1xuXHRcdFx0aWYgKGZpbHRlcnMuZXZlcnkoZmlsdGVyID0+IGZpbHRlci5pbmNsdWRlKGlucHV0LCB7IC4uLmNvbnRleHQgfSkpKSB7XG5cdFx0XHRcdHJlc3VsdC5zZXQoaWQsIGlucHV0KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIGdldFByZWZlcnJlZEdyb3VwKHByZWZlcnJlZEdyb3VwPzogUHJlZmVycmVkR3JvdXApOiBQcm9taXNlPFByZWZlcnJlZEdyb3VwIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gXCJPcGVuIHRvIHNpZGVcIiByZXF1ZXN0cyBhcmUgcm91dGVkIGludG8gdGhlIGRlZGljYXRlZCBzaWRlIGdyb3VwLlxuXHRcdGlmIChwcmVmZXJyZWRHcm91cCA9PT0gU0lERV9HUk9VUCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2dldE9yQ3JlYXRlRGVkaWNhdGVkR3JvdXAoJ3NpZGVHcm91cCcpO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyIGV4cGxpY2l0IHBsYWNlbWVudHMgYXJlIGFsd2F5cyBob25vcmVkIGFzLWlzLlxuXHRcdGlmIChwcmVmZXJyZWRHcm91cCAhPT0gdW5kZWZpbmVkICYmIHByZWZlcnJlZEdyb3VwICE9PSBBQ1RJVkVfR1JPVVApIHtcblx0XHRcdHJldHVybiBwcmVmZXJyZWRHcm91cDtcblx0XHR9XG5cblx0XHQvLyBIb25vciB0aGUgdXNlci1jb25maWd1cmVkIGRlZmF1bHQgZm9yIG5ldyBicm93c2VyIHRhYnMuXG5cdFx0Y29uc3QgcGxhY2VtZW50ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxCcm93c2VyTmV3VGFiUGxhY2VtZW50PihCcm93c2VyTmV3VGFiUGxhY2VtZW50U2V0dGluZ0lkKTtcblx0XHRpZiAocGxhY2VtZW50ID09PSAnc2lkZUdyb3VwJyB8fCBwbGFjZW1lbnQgPT09ICd3aW5kb3cnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZ2V0T3JDcmVhdGVEZWRpY2F0ZWRHcm91cChwbGFjZW1lbnQpO1xuXHRcdH1cblxuXHRcdC8vIFdoZW4gZWRpdG9ycyBhcmUgZm9yY2VkIG1vZGFsIHZpYSBgd29ya2JlbmNoLmVkaXRvci51c2VNb2RhbDogJ2FsbCdgLFxuXHRcdC8vIHJlZGlyZWN0IGFjdGl2ZS91bnNwZWNpZmllZCBicm93c2VyIG9wZW5zIHRvIHRoZSBtYWluIGVkaXRvciBhcmVhIHNvIHRoZVxuXHRcdC8vIGJyb3dzZXIgZG9ja3MgaW5zdGVhZCBvZiBvcGVuaW5nIGFzIGEgbW9kYWwgb3ZlcmxheS5cblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxVc2VNb2RhbEVkaXRvck1vZGU+KFVTRV9NT0RBTF9FRElUT1JfU0VUVElORykgPT09ICdhbGwnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLm1haW5QYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcmVmZXJyZWRHcm91cDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlIHRoZSBkZWRpY2F0ZWQgZWRpdG9yIGdyb3VwIGZvciB0aGUgZ2l2ZW4gcGxhY2VtZW50LCByZXVzaW5nIGFuXG5cdCAqIGV4aXN0aW5nIGxvY2tlZCBicm93c2VyIGdyb3VwIGlmIG9uZSBpcyBmb3VuZCAoc28gaXQgc3Vydml2ZXMgd2luZG93XG5cdCAqIHJlbG9hZHMpIG9yIGNyZWF0aW5nIGFuZCBsb2NraW5nIGEgbmV3IG9uZSBvdGhlcndpc2UuIFNpZGUtZ3JvdXAgY3JlYXRpb25cblx0ICogaXMgc3luY2hyb25vdXM7IHdpbmRvdyBjcmVhdGlvbiBpcyBhc3luY2hyb25vdXMuXG5cdCAqL1xuXHRwcml2YXRlIF9nZXRPckNyZWF0ZURlZGljYXRlZEdyb3VwKHBsYWNlbWVudDogRGVkaWNhdGVkR3JvdXBQbGFjZW1lbnQpOiBJRWRpdG9yR3JvdXAgfCBQcm9taXNlPElFZGl0b3JHcm91cD4ge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fZmluZERlZGljYXRlZEdyb3VwKHBsYWNlbWVudCk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXG5cdFx0aWYgKHBsYWNlbWVudCA9PT0gJ3NpZGVHcm91cCcpIHtcblx0XHRcdGNvbnN0IGRpcmVjdGlvbiA9IHByZWZlcnJlZFNpZGVCeVNpZGVHcm91cERpcmVjdGlvbih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLmFkZEdyb3VwKHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5hY3RpdmVHcm91cCwgZGlyZWN0aW9uKTtcblx0XHRcdC8vIExvY2sgdGhlIGdyb3VwIHNvIHRoYXQgb3RoZXIgKG5vbi1icm93c2VyKSBlZGl0b3JzIGFyZSBub3Qgb3BlbmVkXG5cdFx0XHQvLyBpbnRvIGl0LiBCcm93c2VyIHRhYnMgc3RpbGwgb3BlbiBoZXJlIGJlY2F1c2Ugd2UgdGFyZ2V0IGl0IGRpcmVjdGx5LlxuXHRcdFx0Z3JvdXAubG9jayh0cnVlKTtcblx0XHRcdHJldHVybiBncm91cDtcblx0XHR9XG5cblx0XHQvLyBBdXhpbGlhcnktd2luZG93IGNyZWF0aW9uIGlzIGFzeW5jOyBjb2FsZXNjZSBjb25jdXJyZW50IHJlcXVlc3RzIHNvIHdlIGRvbid0IHNwYXduIG11bHRpcGxlIHdpbmRvd3MuXG5cdFx0aWYgKCF0aGlzLl9kZWRpY2F0ZWRXaW5kb3dHcm91cFByb21pc2UpIHtcblx0XHRcdHRoaXMuX2RlZGljYXRlZFdpbmRvd0dyb3VwUHJvbWlzZSA9IHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5jcmVhdGVBdXhpbGlhcnlFZGl0b3JQYXJ0KClcblx0XHRcdFx0LnRoZW4ocGFydCA9PiB7XG5cdFx0XHRcdFx0cGFydC5hY3RpdmVHcm91cC5sb2NrKHRydWUpO1xuXHRcdFx0XHRcdHJldHVybiBwYXJ0LmFjdGl2ZUdyb3VwO1xuXHRcdFx0XHR9KVxuXHRcdFx0XHQuZmluYWxseSgoKSA9PiB0aGlzLl9kZWRpY2F0ZWRXaW5kb3dHcm91cFByb21pc2UgPSB1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZGVkaWNhdGVkV2luZG93R3JvdXBQcm9taXNlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpbmQgYW4gZXhpc3RpbmcgZGVkaWNhdGVkIGJyb3dzZXIgZ3JvdXAgZm9yIHRoZSBnaXZlbiBwbGFjZW1lbnQuIEEgZ3JvdXBcblx0ICogcXVhbGlmaWVzIHdoZW4gaXQgaXMgbG9ja2VkIGFuZCBjb250YWlucyBhIGJyb3dzZXIgZWRpdG9yIChvciBpcyBlbXB0eSksXG5cdCAqIHdoaWNoIGxldHMgdXMgcmVkaXNjb3ZlciB0aGUgZGVkaWNhdGVkIGdyb3VwIGFmdGVyIGEgd2luZG93IHJlbG9hZFxuXHQgKiB3aXRob3V0IHRyYWNraW5nIGl0IGluIG1lbW9yeS4gU2lkZSBncm91cHMgbGl2ZSBpbiB0aGUgbWFpbiBlZGl0b3IgcGFydDtcblx0ICogd2luZG93IGdyb3VwcyBsaXZlIGluIGFuIGF1eGlsaWFyeSBlZGl0b3IgcGFydC5cblx0ICovXG5cdHByaXZhdGUgX2ZpbmREZWRpY2F0ZWRHcm91cChwbGFjZW1lbnQ6IERlZGljYXRlZEdyb3VwUGxhY2VtZW50KTogSUVkaXRvckdyb3VwIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtYWluUGFydCA9IHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5tYWluUGFydDtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5ncm91cHMpIHtcblx0XHRcdGlmICghZ3JvdXAuaXNMb2NrZWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZ3JvdXAuZWRpdG9ycy5sZW5ndGggPiAwICYmICFncm91cC5lZGl0b3JzLnNvbWUoZWRpdG9yID0+IGVkaXRvciBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3JJbnB1dCkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpbk1haW5QYXJ0ID0gdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLmdldFBhcnQoZ3JvdXApID09PSBtYWluUGFydDtcblx0XHRcdGNvbnN0IG1hdGNoZXNQbGFjZW1lbnQgPSBwbGFjZW1lbnQgPT09ICdzaWRlR3JvdXAnID8gaW5NYWluUGFydCA6ICFpbk1haW5QYXJ0O1xuXHRcdFx0aWYgKG1hdGNoZXNQbGFjZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuIGdyb3VwO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmVnaXN0ZXJPcGVuSGFuZGxlcihoYW5kbGVyOiBJQnJvd3NlclZpZXdPcGVuSGFuZGxlcik6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLl9vcGVuSGFuZGxlcnMuYWRkKGhhbmRsZXIpO1xuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb3BlbkhhbmRsZXJzLmRlbGV0ZShoYW5kbGVyKTtcblx0XHR9KTtcblx0fVxuXG5cdGdldE9yQ3JlYXRlTGF6eShpZDogc3RyaW5nLCBpbml0aWFsU3RhdGU/OiBJQnJvd3NlckVkaXRvclZpZXdTdGF0ZSwgbW9kZWw/OiBJQnJvd3NlclZpZXdNb2RlbCk6IEJyb3dzZXJFZGl0b3JJbnB1dCB7XG5cdFx0aWYgKCF0aGlzLl9rbm93bi5oYXMoaWQpKSB7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnJvd3NlckVkaXRvcklucHV0LCB7IGlkLCAuLi5pbml0aWFsU3RhdGUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IGF3YWl0IHRoaXMuX2Jyb3dzZXJWaWV3U2VydmljZS5nZXRPckNyZWF0ZUJyb3dzZXJWaWV3KFxuXHRcdFx0XHRcdGlkLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdG93bmVyOiB0aGlzLl9nZXREZWZhdWx0T3duZXIoKSxcblx0XHRcdFx0XHRcdHNlc3Npb25PcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdHNjb3BlOiBhd2FpdCB0aGlzLl9yZXNvbHZlU3RvcmFnZVNjb3BlKClcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRpbml0aWFsU3RhdGU6IHtcblx0XHRcdFx0XHRcdFx0dXJsOiBpbml0aWFsU3RhdGU/LnVybCxcblx0XHRcdFx0XHRcdFx0dGl0bGU6IGluaXRpYWxTdGF0ZT8udGl0bGUsXG5cdFx0XHRcdFx0XHRcdGxhc3RGYXZpY29uOiBpbml0aWFsU3RhdGU/LmZhdmljb25cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVNb2RlbChpZCwgdGhpcy5fZ2V0RGVmYXVsdE93bmVyKCksIHN0YXRlKTtcblx0XHRcdH0pO1xuXHRcdFx0aW5wdXQub25XaWxsRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2tub3duLmRlbGV0ZShpZCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJvd3NlclZpZXdzLmZpcmUoKTtcblx0XHRcdH0pO1xuXHRcdFx0aWYgKG1vZGVsKSB7XG5cdFx0XHRcdGlucHV0Lm1vZGVsID0gbW9kZWw7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9rbm93bi5zZXQoaWQsIGlucHV0KTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJvd3NlclZpZXdzLmZpcmUoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5fa25vd24uZ2V0KGlkKSE7XG5cdH1cblxuXHRhc3luYyBjbGVhckdsb2JhbFN0b3JhZ2UoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2Jyb3dzZXJWaWV3U2VydmljZS5jbGVhckdsb2JhbFN0b3JhZ2UoKTtcblx0fVxuXG5cdGFzeW5jIGNsZWFyV29ya3NwYWNlU3RvcmFnZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VJZCA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuaWQ7XG5cdFx0cmV0dXJuIHRoaXMuX2Jyb3dzZXJWaWV3U2VydmljZS5jbGVhcldvcmtzcGFjZVN0b3JhZ2Uod29ya3NwYWNlSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RGVmYXVsdE93bmVyKCk6IElCcm93c2VyVmlld093bmVyIHtcblx0XHRyZXR1cm4geyBtYWluV2luZG93SWQ6IHRoaXMuX21haW5XaW5kb3dJZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVN0b3JhZ2VTY29wZSgpOiBQcm9taXNlPEJyb3dzZXJWaWV3U3RvcmFnZVNjb3BlPiB7XG5cdFx0bGV0IGRhdGFTdG9yYWdlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxCcm93c2VyVmlld1N0b3JhZ2VTY29wZSB8ICdkZWZhdWx0Jz4oXG5cdFx0XHQnd29ya2JlbmNoLmJyb3dzZXIuZGF0YVN0b3JhZ2UnXG5cdFx0KSA/PyAnZGVmYXVsdCc7XG5cblx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uud29ya3NwYWNlVHJ1c3RJbml0aWFsaXplZDtcblxuXHRcdGNvbnN0IGlzV29ya3NwYWNlVW50cnVzdGVkID1cblx0XHRcdHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFkgJiZcblx0XHRcdCF0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCk7XG5cblx0XHRpZiAoaXNXb3Jrc3BhY2VVbnRydXN0ZWQpIHtcblx0XHRcdC8vIEFsd2F5cyB1c2UgZXBoZW1lcmFsIHNlc3Npb25zIGZvciB1bnRydXN0ZWQgd29ya3NwYWNlc1xuXHRcdFx0ZGF0YVN0b3JhZ2UgPSBCcm93c2VyVmlld1N0b3JhZ2VTY29wZS5FcGhlbWVyYWw7XG5cdFx0fSBlbHNlIGlmIChkYXRhU3RvcmFnZSA9PT0gJ2RlZmF1bHQnKSB7XG5cdFx0XHQvLyBXb3Jrc3BhY2Utc2NvcGVkIGZvciByZW1vdGUgd29ya3NwYWNlcy5cblx0XHRcdGRhdGFTdG9yYWdlID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UucmVtb3RlQXV0aG9yaXR5XG5cdFx0XHRcdD8gQnJvd3NlclZpZXdTdG9yYWdlU2NvcGUuV29ya3NwYWNlXG5cdFx0XHRcdDogQnJvd3NlclZpZXdTdG9yYWdlU2NvcGUuR2xvYmFsO1xuXHRcdH1cblxuXHRcdHJldHVybiBkYXRhU3RvcmFnZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGZXRjaCBhbGwgdmlld3Mgb3duZWQgYnkgdGhpcyB3aW5kb3cgZnJvbSB0aGUgbWFpbiBzZXJ2aWNlIGFuZCBjcmVhdGVcblx0ICogbW9kZWxzIGZvciB0aGVtIHNvIHRoZXkgYXJlIGF2YWlsYWJsZSBzeW5jaHJvbm91c2x5LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfaW5pdGlhbGl6ZUV4aXN0aW5nVmlld3MoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgdmlld3MgPSBhd2FpdCB0aGlzLl9icm93c2VyVmlld1NlcnZpY2UuZ2V0QnJvd3NlclZpZXdzKHRoaXMuX21haW5XaW5kb3dJZCk7XG5cdFx0Zm9yIChjb25zdCBpbmZvIG9mIHZpZXdzKSB7XG5cdFx0XHR0aGlzLl9jcmVhdGVNb2RlbChpbmZvLmlkLCBpbmZvLm93bmVyLCBpbmZvLnN0YXRlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9jcmVhdGVNb2RlbChpZDogc3RyaW5nLCBvd25lcjogSUJyb3dzZXJWaWV3T3duZXIsIHN0YXRlOiBJQnJvd3NlclZpZXdTdGF0ZSk6IElCcm93c2VyVmlld01vZGVsIHtcblx0XHQvLyBEb24ndCBkb3VibGUtY3JlYXRlXG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9rbm93bi5nZXQoaWQpPy5tb2RlbDtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnJvd3NlclZpZXdNb2RlbCwgaWQsIG93bmVyLCBzdGF0ZSwgdGhpcy5fYnJvd3NlclZpZXdTZXJ2aWNlKTtcblxuXHRcdC8vIFNhbml0eTogYm90aCBwYXNzIGFuZCBhc3NpZ24gdGhlIG1vZGVsIHRvIGJlIHN1cmUuIEl0IHdpbGwgbm8tb3AgaWYgYWxyZWFkeSBzZXQuXG5cdFx0dGhpcy5nZXRPckNyZWF0ZUxhenkoaWQsIHt9LCBtb2RlbCkubW9kZWwgPSBtb2RlbDtcblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQnJvd3NlclZpZXdzLmZpcmUoKTtcblxuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdC8qKlxuXHQgKiBPcGVuIGFuIGVkaXRvciB0YWIgZm9yIGEgbmV3bHkgY3JlYXRlZCBicm93c2VyIHZpZXcuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9vcGVuRWRpdG9yRm9yQ3JlYXRlZFZpZXcodmlldzogQnJvd3NlckVkaXRvcklucHV0LCBvd25lcjogSUJyb3dzZXJWaWV3T3duZXIsIG9wZW5PcHRpb25zOiBJQnJvd3NlclZpZXdPcGVuT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG9wdHMgPSBvcGVuT3B0aW9ucztcblxuXHRcdC8vIEdpdmUgcmVnaXN0ZXJlZCBoYW5kbGVycyBhIGNoYW5jZSB0byBwcmV2ZW50IHRoZSBlZGl0b3IgZnJvbSBvcGVuaW5nLlxuXHRcdGZvciAoY29uc3QgaGFuZGxlciBvZiB0aGlzLl9vcGVuSGFuZGxlcnMpIHtcblx0XHRcdGlmICghaGFuZGxlci5zaG91bGRPcGVuRWRpdG9yKHZpZXcsIG93bmVyLCBvcHRzKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVzb2x2ZSB0YXJnZXQgZ3JvdXA6IGF1eGlsaWFyeSB3aW5kb3csIHBhcmVudCdzIGdyb3VwLCBvciBkZWZhdWx0XG5cdFx0bGV0IHRhcmdldEdyb3VwOiBQcmVmZXJyZWRHcm91cCB8IHVuZGVmaW5lZDtcblx0XHRpZiAob3B0cy5hdXhpbGlhcnlXaW5kb3cpIHtcblx0XHRcdHRhcmdldEdyb3VwID0gQVVYX1dJTkRPV19HUk9VUDtcblx0XHR9IGVsc2UgaWYgKG9wdHMucGFyZW50Vmlld0lkKSB7XG5cdFx0XHR0YXJnZXRHcm91cCA9IHRoaXMuX2ZpbmRFZGl0b3JHcm91cEZvclZpZXcob3B0cy5wYXJlbnRWaWV3SWQpO1xuXHRcdFx0aWYgKHRhcmdldEdyb3VwID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBJZiB0aGUgcGFyZW50IGlzbid0IG9wZW4sIGRvbid0IG9wZW4gdGhlIGNoaWxkIGVpdGhlclxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBLZWVwIHRoZSBicm93c2VyIGRvY2tlZCBpbiB0aGUgbWFpbiBlZGl0b3IgYXJlYSBldmVuIHdoZW4gZWRpdG9yc1xuXHRcdFx0Ly8gYXJlIGZvcmNlZCBtb2RhbCB2aWEgYHdvcmtiZW5jaC5lZGl0b3IudXNlTW9kYWw6ICdhbGwnYC5cblx0XHRcdHRhcmdldEdyb3VwID0gYXdhaXQgdGhpcy5nZXRQcmVmZXJyZWRHcm91cCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRvck9wdGlvbnMgPSB7XG5cdFx0XHRpbmFjdGl2ZTogb3B0cy5iYWNrZ3JvdW5kLFxuXHRcdFx0cHJlc2VydmVGb2N1czogb3B0cy5wcmVzZXJ2ZUZvY3VzLFxuXHRcdFx0cGlubmVkOiBvcHRzLnBpbm5lZCxcblx0XHRcdGF1eGlsaWFyeTogb3B0cy5hdXhpbGlhcnlXaW5kb3dcblx0XHRcdFx0PyB7IGJvdW5kczogb3B0cy5hdXhpbGlhcnlXaW5kb3csIGNvbXBhY3Q6IHRydWUgfVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHR9O1xuXG5cdFx0Ly8gSWYgdGhlIGJyb3dzZXIgaXMgb3BlbmVkIGJ5IGEgY2hhdCBzZXNzaW9uLFxuXHRcdC8vIG9ubHkgb3BlbiBpbiB0aGUgZm9yZWdyb3VuZCBpZiB0aGUgc2Vzc2lvbidzIHdpZGdldCBpcyBjdXJyZW50bHkgdmlzaWJsZVxuXHRcdC8vIGFuZCBub3QgdGhlIGFjdGl2ZSBlZGl0b3IgaW4gdGhlIHRhcmdldCBncm91cC5cblx0XHRjb25zdCBbZ3JvdXBdID0gYXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihmaW5kR3JvdXAsIHsgZWRpdG9yOiB2aWV3LCBvcHRpb25zOiBlZGl0b3JPcHRpb25zIH0sIHRhcmdldEdyb3VwKTtcblx0XHRpZiAob3duZXIuc2Vzc2lvbklkKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2Uob3duZXIuc2Vzc2lvbklkKTtcblx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2Uoc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGNvbnN0IGlzV2lkZ2V0VmlzaWJsZSA9ICEhd2lkZ2V0ICYmIHdpZGdldC5kb21Ob2RlLm9mZnNldFBhcmVudCAhPT0gbnVsbDtcblx0XHRcdGNvbnN0IGFjdGl2ZUlzU2FtZVNlc3Npb24gPSBncm91cC5hY3RpdmVFZGl0b3IgaW5zdGFuY2VvZiBDaGF0RWRpdG9ySW5wdXRcblx0XHRcdFx0JiYgaXNFcXVhbChncm91cC5hY3RpdmVFZGl0b3Iuc2Vzc2lvblJlc291cmNlLCBzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKCFpc1dpZGdldFZpc2libGUgfHwgYWN0aXZlSXNTYW1lU2Vzc2lvbikge1xuXHRcdFx0XHRlZGl0b3JPcHRpb25zLmluYWN0aXZlID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR2b2lkIHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHZpZXcsIGVkaXRvck9wdGlvbnMsIGdyb3VwKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaW5kIHRoZSBlZGl0b3IgZ3JvdXAgdGhhdCBjdXJyZW50bHkgY29udGFpbnMgYSBicm93c2VyIHZpZXcgd2l0aCB0aGVcblx0ICogZ2l2ZW4gSUQsIG9yIHVuZGVmaW5lZCBpZiBub3Qgb3BlbiBpbiBhbnkgZ3JvdXAuXG5cdCAqL1xuXHRwcml2YXRlIF9maW5kRWRpdG9yR3JvdXBGb3JWaWV3KHZpZXdJZDogc3RyaW5nKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuZWRpdG9yR3JvdXBzU2VydmljZS5ncm91cHMpIHtcblx0XHRcdGZvciAoY29uc3QgZWRpdG9yIG9mIGdyb3VwLmVkaXRvcnMpIHtcblx0XHRcdFx0aWYgKGVkaXRvciBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3JJbnB1dCAmJiBlZGl0b3IuaWQgPT09IHZpZXdJZCkge1xuXHRcdFx0XHRcdHJldHVybiBncm91cC5pZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlV2luZG93Q29uZmlndXJhdGlvbigpOiB2b2lkIHtcblx0XHR2b2lkIHRoaXMuX2Jyb3dzZXJWaWV3U2VydmljZS51cGRhdGVXaW5kb3dDb25maWd1cmF0aW9uKHRoaXMuX21haW5XaW5kb3dJZCwge1xuXHRcdFx0dGhlbWU6IHRoaXMuX2dldFRoZW1lKCksXG5cdFx0XHRrZXliaW5kaW5nczogdGhpcy5fZ2V0S2V5YmluZGluZ3MoKSxcblx0XHRcdGFpRmVhdHVyZXNEaXNhYmxlZDogIXRoaXMuY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhDaGF0Q29udGV4dEtleXMuZW5hYmxlZCksXG5cdFx0XHRtYXhIaXN0b3J5RW50cmllczogdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KEJyb3dzZXJNYXhIaXN0b3J5RW50cmllc1NldHRpbmdJZCksXG5cdFx0XHRwcm94eUluZm86IHRoaXMuX3JlbW90ZVByb3h5SW5mbyxcblx0XHRcdHRydXN0ZWRGaWxlUm9vdHM6IHRoaXMuX2dldFRydXN0ZWRGaWxlUm9vdHMoKSxcblx0XHRcdHRydXN0QWxsRmlsZXM6ICF0aGlzLndvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdEVuYWJsZWQoKSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEtleWJpbmRpbmdzKCk6IHsgW2NvbW1hbmRJZDogc3RyaW5nXTogc3RyaW5nIH0ge1xuXHRcdGNvbnN0IGtleWJpbmRpbmdzOiB7IFtjb21tYW5kSWQ6IHN0cmluZ106IHN0cmluZyB9ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRmb3IgKGNvbnN0IGNvbW1hbmRJZCBvZiBicm93c2VyVmlld0NvbnRleHRNZW51Q29tbWFuZHMpIHtcblx0XHRcdGNvbnN0IGJpbmRpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoY29tbWFuZElkKTtcblx0XHRcdGNvbnN0IGFjY2VsZXJhdG9yID0gYmluZGluZz8uZ2V0RWxlY3Ryb25BY2NlbGVyYXRvcigpO1xuXHRcdFx0aWYgKGFjY2VsZXJhdG9yKSB7XG5cdFx0XHRcdGtleWJpbmRpbmdzW2NvbW1hbmRJZF0gPSBhY2NlbGVyYXRvcjtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGtleWJpbmRpbmdzO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0VGhlbWUoKTogSUJyb3dzZXJWaWV3VGhlbWUge1xuXHRcdGNvbnN0IHRoZW1lID0gdGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRmb2N1c0JvcmRlcjogdGhlbWUuZ2V0Q29sb3IoZm9jdXNCb3JkZXIpPy50b1N0cmluZygpLFxuXHRcdFx0YnV0dG9uQmFja2dyb3VuZDogdGhlbWUuZ2V0Q29sb3IoYnV0dG9uQmFja2dyb3VuZCk/LnRvU3RyaW5nKCksXG5cdFx0XHRidXR0b25Gb3JlZ3JvdW5kOiB0aGVtZS5nZXRDb2xvcihidXR0b25Gb3JlZ3JvdW5kKT8udG9TdHJpbmcoKSxcblx0XHRcdHdpZGdldEJhY2tncm91bmQ6IHRoZW1lLmdldENvbG9yKGVkaXRvcldpZGdldEJhY2tncm91bmQpPy50b1N0cmluZygpLFxuXHRcdFx0d2lkZ2V0Rm9yZWdyb3VuZDogdGhlbWUuZ2V0Q29sb3IoZWRpdG9yV2lkZ2V0Rm9yZWdyb3VuZCk/LnRvU3RyaW5nKCksXG5cdFx0XHR3aWRnZXRCb3JkZXI6IHRoZW1lLmdldENvbG9yKGVkaXRvcldpZGdldEJvcmRlcik/LnRvU3RyaW5nKCksXG5cdFx0XHR3aWRnZXRTaGFkb3c6IHRoZW1lLmdldENvbG9yKHdpZGdldFNoYWRvdyk/LnRvU3RyaW5nKCksXG5cdFx0XHRjb250cmFzdEJvcmRlcjogdGhlbWUuZ2V0Q29sb3IoY29udHJhc3RCb3JkZXIpPy50b1N0cmluZygpLFxuXHRcdFx0ZGVzY3JpcHRpb25Gb3JlZ3JvdW5kOiB0aGVtZS5nZXRDb2xvcihkZXNjcmlwdGlvbkZvcmVncm91bmQpPy50b1N0cmluZygpLFxuXHRcdFx0aW5wdXRQbGFjZWhvbGRlckZvcmVncm91bmQ6IHRoZW1lLmdldENvbG9yKGlucHV0UGxhY2Vob2xkZXJGb3JlZ3JvdW5kKT8udG9TdHJpbmcoKSxcblx0XHRcdHRvb2xiYXJIb3ZlckJhY2tncm91bmQ6IHRoZW1lLmdldENvbG9yKHRvb2xiYXJIb3ZlckJhY2tncm91bmQpPy50b1N0cmluZygpLFxuXHRcdFx0Zm9udDogREVGQVVMVF9GT05UX0ZBTUlMWSxcblx0XHRcdHJlZHVjZWRNb3Rpb246IHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNNb3Rpb25SZWR1Y2VkKCksXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFRydXN0ZWRGaWxlUm9vdHMoKTogc3RyaW5nW10ge1xuXHRcdC8vIFRydXN0IENvcGlsb3Qgcm9vdHMgc28gYWdlbnRzIGNhbiBjcmVhdGUgSFRNTCBmaWxlcyBhbmQgb3BlbiB0aGVtIGluIHRoZSBicm93c2VyLlxuXHRcdGNvbnN0IHJvb3RzID0gbmV3IFNldChnZXRDb3BpbG90Um9vdFBhdGhzKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJIb21lLmZzUGF0aCwgcHJvY2Vzcy5lbnYpKTtcblx0XHRpZiAodGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGZvbGRlciBvZiB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMpIHtcblx0XHRcdFx0aWYgKGZvbGRlci51cmkuc2NoZW1lID09PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdFx0XHRyb290cy5hZGQoZm9sZGVyLnVyaS5mc1BhdGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgdXJpIG9mIHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5nZXRUcnVzdGVkVXJpcygpKSB7XG5cdFx0XHRpZiAodXJpLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdHJvb3RzLmFkZCh1cmkuZnNQYXRoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIFsuLi5yb290c107XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxzQkFBc0IseUJBQWdJLGlDQUFpQztBQUNoTSxTQUEwRCx3QkFBbUk7QUFDN0wsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywwQkFBMEIsc0JBQXNCO0FBQ3pELFNBQVMsZUFBc0I7QUFDL0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxZQUF5QixvQkFBb0I7QUFDdEQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsY0FBYyxrQkFBa0IsZ0JBQWdDLFlBQVksZ0NBQW9EO0FBQ3pJLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsa0NBQWtDLHdDQUF3QztBQUNuRixTQUFTLDBCQUEwQjtBQUNuQyxTQUF1QixzQkFBc0IseUNBQXlDO0FBQ3RGLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsZ0JBQWdCLDBCQUEwQjtBQUNuRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGdCQUFnQix1QkFBdUIsbUJBQW1CO0FBQ25FLFNBQVMsa0JBQWtCLGtCQUFrQixrQ0FBa0M7QUFDL0UsU0FBUyx3QkFBd0Isb0JBQW9CLHdCQUF3Qix3QkFBd0Isb0JBQW9CO0FBQ3pILFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsV0FBVztBQUNwQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMENBQTBDO0FBRzVDLE1BQU0sb0NBQW9DO0FBQzFDLE1BQU0scUNBQXFDO0FBQzNDLE1BQU0sa0NBQWtDO0FBYy9DLE1BQU0saUNBQWlDO0FBQUEsRUFDdEMscUJBQXFCO0FBQUEsRUFDckIscUJBQXFCO0FBQUEsRUFDckIscUJBQXFCO0FBQ3RCO0FBRU8sSUFBTSw4QkFBTixjQUEwQyxXQUFtRDtBQUFBLEVBOENuRyxZQUNzQixvQkFDbUIsc0JBQ0cseUJBQ04sbUJBQ0osZUFDTSxxQkFDQyxzQkFDVyxpQ0FDQSxpQ0FDckIsWUFDTyxtQkFDZ0Isb0JBQ3JCLGNBQ0ssbUJBQ0csc0JBQ3ZDO0FBQ0QsVUFBTTtBQWZrQztBQUNHO0FBQ047QUFDSjtBQUNNO0FBQ0M7QUFDVztBQUNBO0FBQ3JCO0FBQ087QUFDZ0I7QUFDckI7QUFDSztBQUNHO0FBekR6QyxTQUFpQixTQUFTLG9CQUFJLElBQWdDO0FBQzlELFNBQWlCLHFCQUFxQixvQkFBSSxJQUFrQztBQUM1RSxTQUFpQixnQkFBZ0Isb0JBQUksSUFBNkI7QUFjbEUsU0FBaUIsMkJBQTJCLEtBQUssVUFBVSxJQUFJLFFBQWMsQ0FBQztBQUM5RSxTQUFTLDBCQUF1QyxLQUFLLHlCQUF5QjtBQWdCOUUsU0FBUSxzQkFBK0I7QUFFdkMsU0FBaUIsK0JBQStCLEtBQUssVUFBVSxJQUFJLFFBQWlCLENBQUM7QUFDckYsU0FBUyw4QkFBOEMsS0FBSyw2QkFBNkI7QUF3QnhGLFVBQU0sVUFBVSxtQkFBbUIsV0FBVyx5QkFBeUI7QUFDdkUsU0FBSyxzQkFBc0IsYUFBYSxVQUErQixPQUFPO0FBQzlFLFNBQUssZ0JBQWdCLFdBQVc7QUFJaEMsU0FBSywyQkFBMkI7QUFDaEMsVUFBTSxrQkFBa0IsSUFBSSxJQUFJLGdCQUFnQixRQUFRLEtBQUssQ0FBQztBQUM5RCxTQUFLLFVBQVUsS0FBSyxrQkFBa0IsdUJBQXVCLE1BQU0sS0FBSywyQkFBMkIsQ0FBQyxDQUFDO0FBQ3JHLFNBQUssVUFBVSxLQUFLLGFBQWEsc0JBQXNCLE1BQU0sS0FBSywyQkFBMkIsQ0FBQyxDQUFDO0FBQy9GLFNBQUssVUFBVSxLQUFLLHFCQUFxQix5QkFBeUIsTUFBTSxLQUFLLDJCQUEyQixDQUFDLENBQUM7QUFDMUcsU0FBSyxVQUFVLEtBQUssZ0NBQWdDLDBCQUEwQixNQUFNLEtBQUssMkJBQTJCLENBQUMsQ0FBQztBQUN0SCxTQUFLLFVBQVUsS0FBSyxnQ0FBZ0MsaUJBQWlCLE1BQU0sS0FBSywyQkFBMkIsQ0FBQyxDQUFDO0FBQzdHLFNBQUssVUFBVSxLQUFLLHdCQUF3Qiw0QkFBNEIsTUFBTSxLQUFLLDJCQUEyQixDQUFDLENBQUM7QUFDaEgsU0FBSyxVQUFVLEtBQUssa0JBQWtCLG1CQUFtQixPQUFLO0FBQzdELFVBQUksRUFBRSxZQUFZLGVBQWUsR0FBRztBQUNuQyxhQUFLLDJCQUEyQjtBQUFBLE1BQ2pDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsS0FBSyxxQkFBcUIseUJBQXlCLE9BQUs7QUFDdEUsVUFBSSxFQUFFLHFCQUFxQixpQ0FBaUMsS0FBSyxFQUFFLHFCQUFxQixrQ0FBa0MsR0FBRztBQUM1SCxhQUFLLDJCQUEyQjtBQUFBLE1BQ2pDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFHRixTQUFLLHNCQUFzQixLQUFLLGtCQUFrQixvQkFBb0IsNEJBQTRCLHdCQUF3QjtBQUMxSCxVQUFNLGNBQWMsSUFBSSxJQUFJLDRCQUE0Qix5QkFBeUIsS0FBSyxDQUFDO0FBQ3ZGLFNBQUssVUFBVSxLQUFLLGtCQUFrQixtQkFBbUIsT0FBSztBQUM3RCxVQUFJLEVBQUUsWUFBWSxXQUFXLEdBQUc7QUFDL0IsY0FBTSxNQUFNLEtBQUs7QUFDakIsYUFBSyxzQkFBc0IsS0FBSyxrQkFBa0Isb0JBQW9CLDRCQUE0Qix3QkFBd0I7QUFDMUgsWUFBSSxRQUFRLEtBQUsscUJBQXFCO0FBQ3JDLGVBQUssNkJBQTZCLEtBQUssS0FBSyxtQkFBbUI7QUFBQSxRQUNoRTtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUdGLFNBQUssS0FBSyx5QkFBeUIsRUFBRSxNQUFNLE9BQUs7QUFDL0MsV0FBSyxXQUFXLE1BQU0sOEVBQThFLENBQUM7QUFBQSxJQUN0RyxDQUFDO0FBR0QsU0FBSyxVQUFVLEtBQUssb0JBQW9CLHVCQUF1QixPQUFLO0FBQ25FLFVBQUksRUFBRSxLQUFLLE1BQU0saUJBQWlCLEtBQUssZUFBZTtBQUNyRDtBQUFBLE1BQ0Q7QUFHQSxXQUFLLGFBQWEsRUFBRSxLQUFLLElBQUksRUFBRSxLQUFLLE9BQU8sRUFBRSxLQUFLLEtBQUs7QUFFdkQsWUFBTSxTQUFTLEtBQUssT0FBTyxJQUFJLEVBQUUsS0FBSyxFQUFFO0FBQ3hDLFVBQUksVUFBVSxFQUFFLGFBQWE7QUFDNUIsYUFBSyxLQUFLLDBCQUEwQixRQUFRLEVBQUUsS0FBSyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sV0FBUztBQUN2RixlQUFLLFdBQVcsTUFBTSxpRkFBaUYsS0FBSztBQUFBLFFBQzdHLENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFqRkEsSUFBSSxxQkFBOEI7QUFDakMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBaUZBLHFCQUE4QjtBQUM3QixRQUFJLENBQUMsS0FBSyxtQkFBbUIsaUJBQWlCO0FBQzdDLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxDQUFDLEtBQUsscUJBQXFCLFNBQWtCLGtDQUFrQyxHQUFHO0FBQ3JGLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLG1CQUFtQixNQUEwQztBQUM1RCxTQUFLLG1CQUFtQjtBQUN4QixTQUFLLDJCQUEyQjtBQUFBLEVBQ2pDO0FBQUEsRUFFQSx1QkFBd0Q7QUFDdkQsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEseUJBQXlCLFFBQW1EO0FBQzNFLFNBQUssbUJBQW1CLElBQUksTUFBTTtBQUNsQyxVQUFNLGlCQUFpQixPQUFPLGNBQWMsTUFBTSxLQUFLLHlCQUF5QixLQUFLLENBQUM7QUFDdEYsU0FBSyx5QkFBeUIsS0FBSztBQUNuQyxXQUFPLGFBQWEsTUFBTTtBQUN6QixXQUFLLG1CQUFtQixPQUFPLE1BQU07QUFDckMsc0JBQWdCLFFBQVE7QUFDeEIsV0FBSyx5QkFBeUIsS0FBSztBQUFBLElBQ3BDLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSwwQkFBMEIsU0FBc0U7QUFDL0YsUUFBSSxLQUFLLG1CQUFtQixTQUFTLEdBQUc7QUFDdkMsYUFBTyxLQUFLO0FBQUEsSUFDYjtBQUNBLFVBQU0sVUFBVSxDQUFDLEdBQUcsS0FBSyxrQkFBa0I7QUFDM0MsVUFBTSxTQUFTLG9CQUFJLElBQWdDO0FBQ25ELGVBQVcsQ0FBQyxJQUFJLEtBQUssS0FBSyxLQUFLLFFBQVE7QUFDdEMsVUFBSSxRQUFRLE1BQU0sWUFBVSxPQUFPLFFBQVEsT0FBTyxFQUFFLEdBQUcsUUFBUSxDQUFDLENBQUMsR0FBRztBQUNuRSxlQUFPLElBQUksSUFBSSxLQUFLO0FBQUEsTUFDckI7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQU0sa0JBQWtCLGdCQUFzRTtBQUU3RixRQUFJLG1CQUFtQixZQUFZO0FBQ2xDLGFBQU8sS0FBSywyQkFBMkIsV0FBVztBQUFBLElBQ25EO0FBR0EsUUFBSSxtQkFBbUIsVUFBYSxtQkFBbUIsY0FBYztBQUNwRSxhQUFPO0FBQUEsSUFDUjtBQUdBLFVBQU0sWUFBWSxLQUFLLHFCQUFxQixTQUFpQywrQkFBK0I7QUFDNUcsUUFBSSxjQUFjLGVBQWUsY0FBYyxVQUFVO0FBQ3hELGFBQU8sS0FBSywyQkFBMkIsU0FBUztBQUFBLElBQ2pEO0FBS0EsUUFBSSxLQUFLLHFCQUFxQixTQUE2Qix3QkFBd0IsTUFBTSxPQUFPO0FBQy9GLGFBQU8sS0FBSyxvQkFBb0IsU0FBUztBQUFBLElBQzFDO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFRLDJCQUEyQixXQUEwRTtBQUM1RyxVQUFNLFdBQVcsS0FBSyxvQkFBb0IsU0FBUztBQUNuRCxRQUFJLFVBQVU7QUFDYixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUksY0FBYyxhQUFhO0FBQzlCLFlBQU0sWUFBWSxrQ0FBa0MsS0FBSyxvQkFBb0I7QUFDN0UsWUFBTSxRQUFRLEtBQUssb0JBQW9CLFNBQVMsS0FBSyxvQkFBb0IsYUFBYSxTQUFTO0FBRy9GLFlBQU0sS0FBSyxJQUFJO0FBQ2YsYUFBTztBQUFBLElBQ1I7QUFHQSxRQUFJLENBQUMsS0FBSyw4QkFBOEI7QUFDdkMsV0FBSywrQkFBK0IsS0FBSyxvQkFBb0IsMEJBQTBCLEVBQ3JGLEtBQUssVUFBUTtBQUNiLGFBQUssWUFBWSxLQUFLLElBQUk7QUFDMUIsZUFBTyxLQUFLO0FBQUEsTUFDYixDQUFDLEVBQ0EsUUFBUSxNQUFNLEtBQUssK0JBQStCLE1BQVM7QUFBQSxJQUM5RDtBQUNBLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU1Esb0JBQW9CLFdBQThEO0FBQ3pGLFVBQU0sV0FBVyxLQUFLLG9CQUFvQjtBQUMxQyxlQUFXLFNBQVMsS0FBSyxvQkFBb0IsUUFBUTtBQUNwRCxVQUFJLENBQUMsTUFBTSxVQUFVO0FBQ3BCO0FBQUEsTUFDRDtBQUNBLFVBQUksTUFBTSxRQUFRLFNBQVMsS0FBSyxDQUFDLE1BQU0sUUFBUSxLQUFLLFlBQVUsa0JBQWtCLGtCQUFrQixHQUFHO0FBQ3BHO0FBQUEsTUFDRDtBQUNBLFlBQU0sYUFBYSxLQUFLLG9CQUFvQixRQUFRLEtBQUssTUFBTTtBQUMvRCxZQUFNLG1CQUFtQixjQUFjLGNBQWMsYUFBYSxDQUFDO0FBQ25FLFVBQUksa0JBQWtCO0FBQ3JCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxvQkFBb0IsU0FBK0M7QUFDbEUsU0FBSyxjQUFjLElBQUksT0FBTztBQUM5QixXQUFPLGFBQWEsTUFBTTtBQUN6QixXQUFLLGNBQWMsT0FBTyxPQUFPO0FBQUEsSUFDbEMsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLGdCQUFnQixJQUFZLGNBQXdDLE9BQStDO0FBQ2xILFFBQUksQ0FBQyxLQUFLLE9BQU8sSUFBSSxFQUFFLEdBQUc7QUFDekIsWUFBTSxRQUFRLEtBQUsscUJBQXFCLGVBQWUsb0JBQW9CLEVBQUUsSUFBSSxHQUFHLGFBQWEsR0FBRyxZQUFZO0FBQy9HLGNBQU0sUUFBUSxNQUFNLEtBQUssb0JBQW9CO0FBQUEsVUFDNUM7QUFBQSxVQUNBO0FBQUEsWUFDQyxPQUFPLEtBQUssaUJBQWlCO0FBQUEsWUFDN0IsZ0JBQWdCO0FBQUEsY0FDZixPQUFPLE1BQU0sS0FBSyxxQkFBcUI7QUFBQSxZQUN4QztBQUFBLFlBQ0EsY0FBYztBQUFBLGNBQ2IsS0FBSyxjQUFjO0FBQUEsY0FDbkIsT0FBTyxjQUFjO0FBQUEsY0FDckIsYUFBYSxjQUFjO0FBQUEsWUFDNUI7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUNBLGVBQU8sS0FBSyxhQUFhLElBQUksS0FBSyxpQkFBaUIsR0FBRyxLQUFLO0FBQUEsTUFDNUQsQ0FBQztBQUNELFlBQU0sY0FBYyxNQUFNO0FBQ3pCLGFBQUssT0FBTyxPQUFPLEVBQUU7QUFDckIsYUFBSyx5QkFBeUIsS0FBSztBQUFBLE1BQ3BDLENBQUM7QUFDRCxVQUFJLE9BQU87QUFDVixjQUFNLFFBQVE7QUFBQSxNQUNmO0FBQ0EsV0FBSyxPQUFPLElBQUksSUFBSSxLQUFLO0FBQ3pCLFdBQUsseUJBQXlCLEtBQUs7QUFBQSxJQUNwQztBQUVBLFdBQU8sS0FBSyxPQUFPLElBQUksRUFBRTtBQUFBLEVBQzFCO0FBQUEsRUFFQSxNQUFNLHFCQUFvQztBQUN6QyxXQUFPLEtBQUssb0JBQW9CLG1CQUFtQjtBQUFBLEVBQ3BEO0FBQUEsRUFFQSxNQUFNLHdCQUF1QztBQUM1QyxVQUFNLGNBQWMsS0FBSyx3QkFBd0IsYUFBYSxFQUFFO0FBQ2hFLFdBQU8sS0FBSyxvQkFBb0Isc0JBQXNCLFdBQVc7QUFBQSxFQUNsRTtBQUFBLEVBRVEsbUJBQXNDO0FBQzdDLFdBQU8sRUFBRSxjQUFjLEtBQUssY0FBYztBQUFBLEVBQzNDO0FBQUEsRUFFQSxNQUFjLHVCQUF5RDtBQUN0RSxRQUFJLGNBQWMsS0FBSyxxQkFBcUI7QUFBQSxNQUMzQztBQUFBLElBQ0QsS0FBSztBQUVMLFVBQU0sS0FBSyxnQ0FBZ0M7QUFFM0MsVUFBTSx1QkFDTCxLQUFLLHdCQUF3QixrQkFBa0IsTUFBTSxlQUFlLFNBQ3BFLENBQUMsS0FBSyxnQ0FBZ0MsbUJBQW1CO0FBRTFELFFBQUksc0JBQXNCO0FBRXpCLG9CQUFjLHdCQUF3QjtBQUFBLElBQ3ZDLFdBQVcsZ0JBQWdCLFdBQVc7QUFFckMsb0JBQWMsS0FBSyxtQkFBbUIsa0JBQ25DLHdCQUF3QixZQUN4Qix3QkFBd0I7QUFBQSxJQUM1QjtBQUVBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLE1BQWMsMkJBQTBDO0FBQ3ZELFVBQU0sUUFBUSxNQUFNLEtBQUssb0JBQW9CLGdCQUFnQixLQUFLLGFBQWE7QUFDL0UsZUFBVyxRQUFRLE9BQU87QUFDekIsV0FBSyxhQUFhLEtBQUssSUFBSSxLQUFLLE9BQU8sS0FBSyxLQUFLO0FBQUEsSUFDbEQ7QUFBQSxFQUNEO0FBQUEsRUFFUSxhQUFhLElBQVksT0FBMEIsT0FBNkM7QUFFdkcsVUFBTSxXQUFXLEtBQUssT0FBTyxJQUFJLEVBQUUsR0FBRztBQUN0QyxRQUFJLFVBQVU7QUFDYixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sUUFBUSxLQUFLLHFCQUFxQixlQUFlLGtCQUFrQixJQUFJLE9BQU8sT0FBTyxLQUFLLG1CQUFtQjtBQUduSCxTQUFLLGdCQUFnQixJQUFJLENBQUMsR0FBRyxLQUFLLEVBQUUsUUFBUTtBQUU1QyxTQUFLLHlCQUF5QixLQUFLO0FBRW5DLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxNQUFjLDBCQUEwQixNQUEwQixPQUEwQixhQUFxRDtBQUNoSixVQUFNLE9BQU87QUFHYixlQUFXLFdBQVcsS0FBSyxlQUFlO0FBQ3pDLFVBQUksQ0FBQyxRQUFRLGlCQUFpQixNQUFNLE9BQU8sSUFBSSxHQUFHO0FBQ2pEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFHQSxRQUFJO0FBQ0osUUFBSSxLQUFLLGlCQUFpQjtBQUN6QixvQkFBYztBQUFBLElBQ2YsV0FBVyxLQUFLLGNBQWM7QUFDN0Isb0JBQWMsS0FBSyx3QkFBd0IsS0FBSyxZQUFZO0FBQzVELFVBQUksZ0JBQWdCLFFBQVc7QUFDOUI7QUFBQSxNQUNEO0FBQUEsSUFDRCxPQUFPO0FBR04sb0JBQWMsTUFBTSxLQUFLLGtCQUFrQjtBQUFBLElBQzVDO0FBRUEsVUFBTSxnQkFBZ0I7QUFBQSxNQUNyQixVQUFVLEtBQUs7QUFBQSxNQUNmLGVBQWUsS0FBSztBQUFBLE1BQ3BCLFFBQVEsS0FBSztBQUFBLE1BQ2IsV0FBVyxLQUFLLGtCQUNiLEVBQUUsUUFBUSxLQUFLLGlCQUFpQixTQUFTLEtBQUssSUFDOUM7QUFBQSxJQUNKO0FBS0EsVUFBTSxDQUFDLEtBQUssSUFBSSxNQUFNLEtBQUsscUJBQXFCLGVBQWUsV0FBVyxFQUFFLFFBQVEsTUFBTSxTQUFTLGNBQWMsR0FBRyxXQUFXO0FBQy9ILFFBQUksTUFBTSxXQUFXO0FBQ3BCLFlBQU0sa0JBQWtCLElBQUksTUFBTSxNQUFNLFNBQVM7QUFDakQsWUFBTSxTQUFTLEtBQUssa0JBQWtCLDJCQUEyQixlQUFlO0FBQ2hGLFlBQU0sa0JBQWtCLENBQUMsQ0FBQyxVQUFVLE9BQU8sUUFBUSxpQkFBaUI7QUFDcEUsWUFBTSxzQkFBc0IsTUFBTSx3QkFBd0IsbUJBQ3RELFFBQVEsTUFBTSxhQUFhLGlCQUFpQixlQUFlO0FBQy9ELFVBQUksQ0FBQyxtQkFBbUIscUJBQXFCO0FBQzVDLHNCQUFjLFdBQVc7QUFBQSxNQUMxQjtBQUFBLElBQ0Q7QUFFQSxTQUFLLEtBQUssY0FBYyxXQUFXLE1BQU0sZUFBZSxLQUFLO0FBQUEsRUFDOUQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsd0JBQXdCLFFBQW9DO0FBQ25FLGVBQVcsU0FBUyxLQUFLLG9CQUFvQixRQUFRO0FBQ3BELGlCQUFXLFVBQVUsTUFBTSxTQUFTO0FBQ25DLFlBQUksa0JBQWtCLHNCQUFzQixPQUFPLE9BQU8sUUFBUTtBQUNqRSxpQkFBTyxNQUFNO0FBQUEsUUFDZDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVRLDZCQUFtQztBQUMxQyxTQUFLLEtBQUssb0JBQW9CLDBCQUEwQixLQUFLLGVBQWU7QUFBQSxNQUMzRSxPQUFPLEtBQUssVUFBVTtBQUFBLE1BQ3RCLGFBQWEsS0FBSyxnQkFBZ0I7QUFBQSxNQUNsQyxvQkFBb0IsQ0FBQyxLQUFLLGtCQUFrQixvQkFBb0IsZ0JBQWdCLE9BQU87QUFBQSxNQUN2RixtQkFBbUIsS0FBSyxxQkFBcUIsU0FBaUIsaUNBQWlDO0FBQUEsTUFDL0YsV0FBVyxLQUFLO0FBQUEsTUFDaEIsa0JBQWtCLEtBQUsscUJBQXFCO0FBQUEsTUFDNUMsZUFBZSxDQUFDLEtBQUssZ0NBQWdDLHdCQUF3QjtBQUFBLElBQzlFLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSxrQkFBbUQ7QUFDMUQsVUFBTSxjQUErQyx1QkFBTyxPQUFPLElBQUk7QUFDdkUsZUFBVyxhQUFhLGdDQUFnQztBQUN2RCxZQUFNLFVBQVUsS0FBSyxrQkFBa0IsaUJBQWlCLFNBQVM7QUFDakUsWUFBTSxjQUFjLFNBQVMsdUJBQXVCO0FBQ3BELFVBQUksYUFBYTtBQUNoQixvQkFBWSxTQUFTLElBQUk7QUFBQSxNQUMxQjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsWUFBK0I7QUFDdEMsVUFBTSxRQUFRLEtBQUssYUFBYSxjQUFjO0FBQzlDLFdBQU87QUFBQSxNQUNOLGFBQWEsTUFBTSxTQUFTLFdBQVcsR0FBRyxTQUFTO0FBQUEsTUFDbkQsa0JBQWtCLE1BQU0sU0FBUyxnQkFBZ0IsR0FBRyxTQUFTO0FBQUEsTUFDN0Qsa0JBQWtCLE1BQU0sU0FBUyxnQkFBZ0IsR0FBRyxTQUFTO0FBQUEsTUFDN0Qsa0JBQWtCLE1BQU0sU0FBUyxzQkFBc0IsR0FBRyxTQUFTO0FBQUEsTUFDbkUsa0JBQWtCLE1BQU0sU0FBUyxzQkFBc0IsR0FBRyxTQUFTO0FBQUEsTUFDbkUsY0FBYyxNQUFNLFNBQVMsa0JBQWtCLEdBQUcsU0FBUztBQUFBLE1BQzNELGNBQWMsTUFBTSxTQUFTLFlBQVksR0FBRyxTQUFTO0FBQUEsTUFDckQsZ0JBQWdCLE1BQU0sU0FBUyxjQUFjLEdBQUcsU0FBUztBQUFBLE1BQ3pELHVCQUF1QixNQUFNLFNBQVMscUJBQXFCLEdBQUcsU0FBUztBQUFBLE1BQ3ZFLDRCQUE0QixNQUFNLFNBQVMsMEJBQTBCLEdBQUcsU0FBUztBQUFBLE1BQ2pGLHdCQUF3QixNQUFNLFNBQVMsc0JBQXNCLEdBQUcsU0FBUztBQUFBLE1BQ3pFLE1BQU07QUFBQSxNQUNOLGVBQWUsS0FBSyxxQkFBcUIsZ0JBQWdCO0FBQUEsSUFDMUQ7QUFBQSxFQUNEO0FBQUEsRUFFUSx1QkFBaUM7QUFFeEMsVUFBTSxRQUFRLElBQUksSUFBSSxvQkFBb0IsS0FBSyxtQkFBbUIsU0FBUyxRQUFRLFFBQVEsR0FBRyxDQUFDO0FBQy9GLFFBQUksS0FBSyxnQ0FBZ0MsbUJBQW1CLEdBQUc7QUFDOUQsaUJBQVcsVUFBVSxLQUFLLHdCQUF3QixhQUFhLEVBQUUsU0FBUztBQUN6RSxZQUFJLE9BQU8sSUFBSSxXQUFXLFFBQVEsTUFBTTtBQUN2QyxnQkFBTSxJQUFJLE9BQU8sSUFBSSxNQUFNO0FBQUEsUUFDNUI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLGVBQVcsT0FBTyxLQUFLLGdDQUFnQyxlQUFlLEdBQUc7QUFDeEUsVUFBSSxJQUFJLFdBQVcsUUFBUSxNQUFNO0FBQ2hDLGNBQU0sSUFBSSxJQUFJLE1BQU07QUFBQSxNQUNyQjtBQUFBLElBQ0Q7QUFDQSxXQUFPLENBQUMsR0FBRyxLQUFLO0FBQUEsRUFDakI7QUFDRDtBQXplYSw0QkF1QlksMkJBQTJCLGVBQWU7QUFBQSxFQUNqRSxnQkFBZ0I7QUFBQSxFQUNoQixlQUFlLElBQUksVUFBVSxrQkFBa0IsWUFBWSxFQUFFO0FBQUEsRUFDN0QsZUFBZSxJQUFJLDBDQUEwQztBQUFBO0FBQUEsRUFFN0QsZUFBZTtBQUFBLElBQ2Qsd0JBQXdCLE9BQU87QUFBQSxJQUMvQixlQUFlO0FBQUEsTUFDZCxlQUFlLE9BQU8sZUFBZSxvQkFBb0I7QUFBQSxNQUN6RCxlQUFlLE9BQU8sK0JBQStCLElBQUk7QUFBQSxJQUMxRDtBQUFBLEVBQ0Q7QUFDRDtBQW5DWSw4QkFBTjtBQUFBLEVBK0NKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTdEVTsiLAogICJuYW1lcyI6IFtdCn0K
