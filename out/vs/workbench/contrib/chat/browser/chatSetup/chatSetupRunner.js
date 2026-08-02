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
import "./media/chatSetup.css";
import { $ } from "../../../../../base/browser/dom.js";
import { Dialog, DialogContentsAlignment } from "../../../../../base/browser/ui/dialog/dialog.js";
import { coalesce } from "../../../../../base/common/arrays.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { localize } from "../../../../../nls.js";
import { createWorkbenchDialogOptions } from "../../../../browser/parts/dialogs/dialog.js";
import { IKeybindingService } from "../../../../../platform/keybinding/common/keybinding.js";
import { ILayoutService } from "../../../../../platform/layout/browser/layoutService.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import product from "../../../../../platform/product/common/product.js";
import { ITelemetryService, TelemetryLevel } from "../../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { ChatEntitlement, IChatEntitlementService, isProUser } from "../../../../services/chat/common/chatEntitlementService.js";
import { IChatWidgetService } from "../chat.js";
import { ChatSetupAnonymous, ChatSetupError, ChatSetupStrategy } from "./chatSetup.js";
import { GitHubPaths, IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IHostService } from "../../../../services/host/browser/host.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { ExtensionIdentifier } from "../../../../../platform/extensions/common/extensions.js";
import { raceTimeout } from "../../../../../base/common/async.js";
const defaultChat = {
  chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? "",
  publicCodeMatchesUrl: product.defaultChatAgent?.publicCodeMatchesUrl ?? "",
  provider: product.defaultChatAgent?.provider ?? { default: { id: "", name: "" }, enterprise: { id: "", name: "" }, apple: { id: "", name: "" }, google: { id: "", name: "" } },
  chatRefreshTokenCommand: product.defaultChatAgent?.chatRefreshTokenCommand ?? "",
  termsStatementUrl: product.defaultChatAgent?.termsStatementUrl ?? "",
  privacyStatementUrl: product.defaultChatAgent?.privacyStatementUrl ?? ""
};
let ChatSetup = class {
  constructor(context, controller, telemetryService, layoutService, keybindingService, chatEntitlementService, logService, widgetService, workspaceTrustRequestService, markdownRendererService, defaultAccountService, hostService, extensionService, workspaceTrustManagementService) {
    this.context = context;
    this.controller = controller;
    this.telemetryService = telemetryService;
    this.layoutService = layoutService;
    this.keybindingService = keybindingService;
    this.chatEntitlementService = chatEntitlementService;
    this.logService = logService;
    this.widgetService = widgetService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.markdownRendererService = markdownRendererService;
    this.defaultAccountService = defaultAccountService;
    this.hostService = hostService;
    this.extensionService = extensionService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.pendingRun = void 0;
    this.skipDialogOnce = false;
  }
  static getInstance(instantiationService, context, controller) {
    let instance = ChatSetup.instance;
    if (!instance) {
      instance = ChatSetup.instance = instantiationService.createInstance(ChatSetup, context, controller);
    }
    return instance;
  }
  skipDialog() {
    this.skipDialogOnce = true;
  }
  async run(options) {
    if (this.pendingRun) {
      return this.pendingRun;
    }
    this.pendingRun = this.doRun(options);
    try {
      return await this.pendingRun;
    } finally {
      this.pendingRun = void 0;
    }
  }
  async doRun(options) {
    this.context.update({ later: false });
    const dialogSkipped = this.skipDialogOnce;
    this.skipDialogOnce = false;
    const wasTrusted = this.workspaceTrustManagementService.isWorkspaceTrusted();
    const trusted = await this.workspaceTrustRequestService.requestWorkspaceTrust({
      message: localize("chatWorkspaceTrust", "AI features are currently only supported in trusted workspaces.")
    });
    if (!trusted) {
      this.context.update({ later: true });
      this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "failedNotTrusted", installDuration: 0, signUpErrorCode: void 0, provider: void 0 });
      return {
        dialogSkipped,
        success: void 0
        /* canceled */
      };
    }
    if (!wasTrusted) {
      await this.whenChatExtensionActivated();
    }
    let setupStrategy;
    if (options?.setupStrategy !== void 0) {
      setupStrategy = options.setupStrategy;
    } else if (!options?.forceSignInDialog && (dialogSkipped || isProUser(this.chatEntitlementService.entitlement) || this.chatEntitlementService.entitlement === ChatEntitlement.Free)) {
      setupStrategy = ChatSetupStrategy.DefaultSetup;
    } else if (options?.forceAnonymous === ChatSetupAnonymous.EnabledWithoutDialog) {
      setupStrategy = ChatSetupStrategy.DefaultSetup;
    } else {
      setupStrategy = await this.showDialog(options);
    }
    if (setupStrategy === ChatSetupStrategy.DefaultSetup && this.defaultAccountService.getDefaultAccountAuthenticationProvider().enterprise) {
      setupStrategy = ChatSetupStrategy.SetupWithEnterpriseProvider;
    }
    if (setupStrategy !== ChatSetupStrategy.Canceled) {
      options?.onSignInStarted?.();
    }
    if (setupStrategy !== ChatSetupStrategy.Canceled && !options?.disableChatViewReveal) {
      this.widgetService.revealWidget();
    }
    let success = void 0;
    let setupError;
    let errorAlreadyHandled = false;
    try {
      switch (setupStrategy) {
        case ChatSetupStrategy.SetupWithEnterpriseProvider:
          success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: true, useSocialProvider: void 0, additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous });
          break;
        case ChatSetupStrategy.SetupWithoutEnterpriseProvider:
          success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useSocialProvider: void 0, additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous });
          break;
        case ChatSetupStrategy.SetupWithAppleProvider:
          success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useSocialProvider: "apple", additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous });
          break;
        case ChatSetupStrategy.SetupWithGoogleProvider:
          success = await this.controller.value.setupWithProvider({ useEnterpriseProvider: false, useSocialProvider: "google", additionalScopes: options?.additionalScopes, forceAnonymous: options?.forceAnonymous });
          break;
        case ChatSetupStrategy.DefaultSetup:
          success = await this.controller.value.setup({ ...options, forceAnonymous: options?.forceAnonymous });
          break;
        case ChatSetupStrategy.Canceled:
          this.context.update({ later: true });
          this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "failedMaybeLater", installDuration: 0, signUpErrorCode: void 0, provider: void 0 });
          break;
      }
    } catch (error) {
      this.logService.error(`[chat setup] Error during setup: ${toErrorMessage(error)}`);
      success = false;
      if (error instanceof ChatSetupError) {
        setupError = error.originalError;
        errorAlreadyHandled = error.userNotified;
      } else {
        setupError = error instanceof Error ? error : new Error(toErrorMessage(error));
      }
    }
    if (success) {
      this.context.update({ completed: true });
    }
    return { success, dialogSkipped, error: setupError, errorAlreadyHandled };
  }
  /**
   * Whether the default chat extension has finished activating. `activationTimes`
   * is only set once activation completes, so `undefined` means "not yet active".
   */
  isChatExtensionActivated() {
    const status = this.extensionService.getExtensionsStatus();
    for (const id of Object.keys(status)) {
      if (ExtensionIdentifier.equals(id, defaultChat.chatExtensionId)) {
        return status[id].activationTimes !== void 0;
      }
    }
    return false;
  }
  /**
   * Resolves once the default chat extension has finished activating (bounded by
   * a timeout). Detection relies only on the extension lifecycle, so it never
   * touches the user's authentication session.
   */
  async whenChatExtensionActivated(timeoutMs = 1e4) {
    if (!defaultChat.chatExtensionId || this.isChatExtensionActivated()) {
      return;
    }
    const store = new DisposableStore();
    try {
      await raceTimeout(new Promise((resolve) => {
        const check = () => {
          if (this.isChatExtensionActivated()) {
            resolve();
          }
        };
        store.add(this.extensionService.onDidChangeExtensionsStatus(check));
        this.extensionService.whenInstalledExtensionsRegistered().then(check);
      }), timeoutMs);
    } finally {
      store.dispose();
    }
  }
  async showDialog(options) {
    const disposables = new DisposableStore();
    const buttons = this.getButtons(options);
    const dialog = disposables.add(new Dialog(
      this.layoutService.activeContainer,
      this.getDialogTitle(options),
      buttons.map((button2) => button2[0]),
      createWorkbenchDialogOptions({
        type: "none",
        extraClasses: ["chat-setup-dialog"],
        detail: " ",
        // workaround allowing us to render the message in large
        icon: options?.dialogIcon ?? Codicon.copilotLarge,
        alignment: DialogContentsAlignment.Vertical,
        cancelId: buttons.length,
        disableCloseButton: options?.disableCloseButton ?? false,
        renderFooter: (footer) => footer.appendChild(this.createDialogFooter(disposables, options)),
        buttonOptions: buttons.map((button2) => button2[2])
      }, this.keybindingService, this.layoutService, this.hostService)
    ));
    const { button } = await dialog.show();
    disposables.dispose();
    return buttons[button]?.[1] ?? ChatSetupStrategy.Canceled;
  }
  getButtons(options) {
    const styleButton = (...classes) => ({ styleButton: (button) => button.element.classList.add(...classes) });
    let buttons;
    if (!options?.forceAnonymous && (this.context.state.entitlement === ChatEntitlement.Unknown || options?.forceSignInDialog)) {
      const defaultProviderButton = [localize("continueWith", "Continue with {0}", defaultChat.provider.default.name), ChatSetupStrategy.SetupWithoutEnterpriseProvider, styleButton("continue-button", "default")];
      const defaultProviderLink = [defaultProviderButton[0], defaultProviderButton[1], styleButton("link-button")];
      const enterpriseProviderButton = [localize("continueWith", "Continue with {0}", defaultChat.provider.enterprise.name), ChatSetupStrategy.SetupWithEnterpriseProvider, styleButton("continue-button", "default")];
      const enterpriseProviderLink = [enterpriseProviderButton[0], enterpriseProviderButton[1], styleButton("link-button")];
      const googleProviderButton = [localize("continueWith", "Continue with {0}", defaultChat.provider.google.name), ChatSetupStrategy.SetupWithGoogleProvider, styleButton("continue-button", "google")];
      const appleProviderButton = [localize("continueWith", "Continue with {0}", defaultChat.provider.apple.name), ChatSetupStrategy.SetupWithAppleProvider, styleButton("continue-button", "apple")];
      if (!this.defaultAccountService.getDefaultAccountAuthenticationProvider().enterprise) {
        buttons = coalesce([
          defaultProviderButton,
          googleProviderButton,
          appleProviderButton,
          enterpriseProviderLink
        ]);
      } else {
        buttons = coalesce([
          enterpriseProviderButton,
          googleProviderButton,
          appleProviderButton,
          defaultProviderLink
        ]);
      }
    } else {
      buttons = [[localize("setupAIButton", "Use AI Features"), ChatSetupStrategy.DefaultSetup, void 0]];
    }
    return buttons;
  }
  getDialogTitle(options) {
    if (options?.dialogTitle) {
      return options.dialogTitle;
    }
    if (this.chatEntitlementService.anonymous) {
      if (options?.forceAnonymous) {
        return localize("startUsing", "Start using AI Features");
      } else {
        return localize("enableMore", "Enable more AI features");
      }
    }
    if (this.context.state.entitlement === ChatEntitlement.Unknown || options?.forceSignInDialog) {
      return localize("signIn", "Sign in to use GitHub Copilot");
    }
    return localize("startUsing", "Start using AI Features");
  }
  createDialogFooter(disposables, options) {
    const element = $(".chat-setup-dialog-footer");
    let footer;
    if (options?.forceAnonymous || this.telemetryService.telemetryLevel === TelemetryLevel.NONE) {
      footer = localize({ key: "settingsAnonymous", comment: ['{Locked="["}', '{Locked="]({1})"}', '{Locked="]({2})"}'] }, "By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}).", defaultChat.provider.default.name, defaultChat.termsStatementUrl, defaultChat.privacyStatementUrl);
    } else {
      footer = localize({ key: "settings", comment: ['{Locked="["}', '{Locked="]({1})"}', '{Locked="]({2})"}', '{Locked="]({4})"}', '{Locked="]({5})"}'] }, "By continuing, you agree to {0}'s [Terms]({1}) and [Privacy Statement]({2}). {3} Copilot may show [public code]({4}) suggestions and use your data to improve the product. You can change these [settings]({5}) anytime.", defaultChat.provider.default.name, defaultChat.termsStatementUrl, defaultChat.privacyStatementUrl, defaultChat.provider.default.name, defaultChat.publicCodeMatchesUrl, this.defaultAccountService.resolveGitHubUrl(GitHubPaths.copilotSettings));
    }
    element.appendChild($("p", void 0, disposables.add(this.markdownRendererService.render(new MarkdownString(footer, { isTrusted: true }))).element));
    return element;
  }
};
ChatSetup.instance = void 0;
ChatSetup = __decorateClass([
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, ILayoutService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IChatEntitlementService),
  __decorateParam(6, ILogService),
  __decorateParam(7, IChatWidgetService),
  __decorateParam(8, IWorkspaceTrustRequestService),
  __decorateParam(9, IMarkdownRendererService),
  __decorateParam(10, IDefaultAccountService),
  __decorateParam(11, IHostService),
  __decorateParam(12, IExtensionService),
  __decorateParam(13, IWorkspaceTrustManagementService)
], ChatSetup);
function refreshTokens(commandService) {
  commandService.executeCommand(defaultChat.chatRefreshTokenCommand);
}
export {
  ChatSetup,
  refreshTokens
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U2V0dXAvY2hhdFNldHVwUnVubmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL2NoYXRTZXR1cC5jc3MnO1xuaW1wb3J0IHsgJCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9idXR0b24vYnV0dG9uLmpzJztcbmltcG9ydCB7IERpYWxvZywgRGlhbG9nQ29udGVudHNBbGlnbm1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZGlhbG9nL2RpYWxvZy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Rvd24vYnJvd3Nlci9tYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVXb3JrYmVuY2hEaWFsb2dPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9kaWFsb2dzL2RpYWxvZy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHByb2R1Y3QgZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdC5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSwgVGVsZW1ldHJ5TGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSwgSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0RW50aXRsZW1lbnQsIENoYXRFbnRpdGxlbWVudENvbnRleHQsIENoYXRFbnRpdGxlbWVudFNlcnZpY2UsIElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLCBpc1Byb1VzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQ2hhdFNldHVwQ29udHJvbGxlciB9IGZyb20gJy4vY2hhdFNldHVwQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNldHVwUmVzdWx0LCBDaGF0U2V0dXBBbm9ueW1vdXMsIENoYXRTZXR1cEVycm9yLCBJbnN0YWxsQ2hhdEV2ZW50LCBJbnN0YWxsQ2hhdENsYXNzaWZpY2F0aW9uLCBDaGF0U2V0dXBTdHJhdGVneSwgQ2hhdFNldHVwUmVzdWx0VmFsdWUsIElDaGF0U2V0dXBSdW5PcHRpb25zIH0gZnJvbSAnLi9jaGF0U2V0dXAuanMnO1xuaW1wb3J0IHsgR2l0SHViUGF0aHMsIElEZWZhdWx0QWNjb3VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kZWZhdWx0QWNjb3VudC9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IHJhY2VUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuXG5jb25zdCBkZWZhdWx0Q2hhdCA9IHtcblx0Y2hhdEV4dGVuc2lvbklkOiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LmNoYXRFeHRlbnNpb25JZCA/PyAnJyxcblx0cHVibGljQ29kZU1hdGNoZXNVcmw6IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8ucHVibGljQ29kZU1hdGNoZXNVcmwgPz8gJycsXG5cdHByb3ZpZGVyOiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LnByb3ZpZGVyID8/IHsgZGVmYXVsdDogeyBpZDogJycsIG5hbWU6ICcnIH0sIGVudGVycHJpc2U6IHsgaWQ6ICcnLCBuYW1lOiAnJyB9LCBhcHBsZTogeyBpZDogJycsIG5hbWU6ICcnIH0sIGdvb2dsZTogeyBpZDogJycsIG5hbWU6ICcnIH0gfSxcblx0Y2hhdFJlZnJlc2hUb2tlbkNvbW1hbmQ6IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8uY2hhdFJlZnJlc2hUb2tlbkNvbW1hbmQgPz8gJycsXG5cdHRlcm1zU3RhdGVtZW50VXJsOiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LnRlcm1zU3RhdGVtZW50VXJsID8/ICcnLFxuXHRwcml2YWN5U3RhdGVtZW50VXJsOiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LnByaXZhY3lTdGF0ZW1lbnRVcmwgPz8gJydcbn07XG5cbmV4cG9ydCBjbGFzcyBDaGF0U2V0dXAge1xuXG5cdHByaXZhdGUgc3RhdGljIGluc3RhbmNlOiBDaGF0U2V0dXAgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHN0YXRpYyBnZXRJbnN0YW5jZShpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBjb250ZXh0OiBDaGF0RW50aXRsZW1lbnRDb250ZXh0LCBjb250cm9sbGVyOiBMYXp5PENoYXRTZXR1cENvbnRyb2xsZXI+KTogQ2hhdFNldHVwIHtcblx0XHRsZXQgaW5zdGFuY2UgPSBDaGF0U2V0dXAuaW5zdGFuY2U7XG5cdFx0aWYgKCFpbnN0YW5jZSkge1xuXHRcdFx0aW5zdGFuY2UgPSBDaGF0U2V0dXAuaW5zdGFuY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0U2V0dXAsIGNvbnRleHQsIGNvbnRyb2xsZXIpO1xuXHRcdH1cblxuXHRcdHJldHVybiBpbnN0YW5jZTtcblx0fVxuXG5cdHByaXZhdGUgcGVuZGluZ1J1bjogUHJvbWlzZTxJQ2hhdFNldHVwUmVzdWx0PiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHNraXBEaWFsb2dPbmNlID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0OiBDaGF0RW50aXRsZW1lbnRDb250ZXh0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udHJvbGxlcjogTGF6eTxDaGF0U2V0dXBDb250cm9sbGVyPixcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUxheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBDaGF0RW50aXRsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQ2hhdFdpZGdldFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3aWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZTogSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UsXG5cdFx0QElNYXJrZG93blJlbmRlcmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlOiBJTWFya2Rvd25SZW5kZXJlclNlcnZpY2UsXG5cdFx0QElEZWZhdWx0QWNjb3VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkZWZhdWx0QWNjb3VudFNlcnZpY2U6IElEZWZhdWx0QWNjb3VudFNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0c2tpcERpYWxvZygpOiB2b2lkIHtcblx0XHR0aGlzLnNraXBEaWFsb2dPbmNlID0gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIHJ1bihvcHRpb25zPzogSUNoYXRTZXR1cFJ1bk9wdGlvbnMpOiBQcm9taXNlPElDaGF0U2V0dXBSZXN1bHQ+IHtcblx0XHRpZiAodGhpcy5wZW5kaW5nUnVuKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5wZW5kaW5nUnVuO1xuXHRcdH1cblxuXHRcdHRoaXMucGVuZGluZ1J1biA9IHRoaXMuZG9SdW4ob3B0aW9ucyk7XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMucGVuZGluZ1J1bjtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5wZW5kaW5nUnVuID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9SdW4ob3B0aW9ucz86IElDaGF0U2V0dXBSdW5PcHRpb25zKTogUHJvbWlzZTxJQ2hhdFNldHVwUmVzdWx0PiB7XG5cdFx0dGhpcy5jb250ZXh0LnVwZGF0ZSh7IGxhdGVyOiBmYWxzZSB9KTtcblxuXHRcdGNvbnN0IGRpYWxvZ1NraXBwZWQgPSB0aGlzLnNraXBEaWFsb2dPbmNlO1xuXHRcdHRoaXMuc2tpcERpYWxvZ09uY2UgPSBmYWxzZTtcblxuXHRcdGNvbnN0IHdhc1RydXN0ZWQgPSB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCk7XG5cdFx0Y29uc3QgdHJ1c3RlZCA9IGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5yZXF1ZXN0V29ya3NwYWNlVHJ1c3Qoe1xuXHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ2NoYXRXb3Jrc3BhY2VUcnVzdCcsIFwiQUkgZmVhdHVyZXMgYXJlIGN1cnJlbnRseSBvbmx5IHN1cHBvcnRlZCBpbiB0cnVzdGVkIHdvcmtzcGFjZXMuXCIpXG5cdFx0fSk7XG5cdFx0aWYgKCF0cnVzdGVkKSB7XG5cdFx0XHR0aGlzLmNvbnRleHQudXBkYXRlKHsgbGF0ZXI6IHRydWUgfSk7XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJbnN0YWxsQ2hhdEV2ZW50LCBJbnN0YWxsQ2hhdENsYXNzaWZpY2F0aW9uPignY29tbWFuZENlbnRlci5jaGF0SW5zdGFsbCcsIHsgaW5zdGFsbFJlc3VsdDogJ2ZhaWxlZE5vdFRydXN0ZWQnLCBpbnN0YWxsRHVyYXRpb246IDAsIHNpZ25VcEVycm9yQ29kZTogdW5kZWZpbmVkLCBwcm92aWRlcjogdW5kZWZpbmVkIH0pO1xuXG5cdFx0XHRyZXR1cm4geyBkaWFsb2dTa2lwcGVkLCBzdWNjZXNzOiB1bmRlZmluZWQgLyogY2FuY2VsZWQgKi8gfTtcblx0XHR9XG5cblx0XHRpZiAoIXdhc1RydXN0ZWQpIHtcblx0XHRcdC8vIFRydXN0IHdhcyBqdXN0IGdyYW50ZWQ6IHRoZSBjaGF0IGV4dGVuc2lvbiBpcyAocmUpYWN0aXZhdGluZywgYW5kIHRoZVxuXHRcdFx0Ly8gZW50aXRsZW1lbnQgb25seSByZXNvbHZlcyBvbmNlIGl0IGlzIHVwLiBXYWl0IGZvciBhY3RpdmF0aW9uIHNvIHRoZVxuXHRcdFx0Ly8gZGlhbG9nIGRlY2lzaW9uIGJlbG93IGlzbid0IG1hZGUgZnJvbSBhIHN0YWxlIFwic2lnbmVkIG91dFwiIGVudGl0bGVtZW50XG5cdFx0XHQvLyAod2hpY2ggd291bGQgYnJpZWZseSBzaG93IHRoZSBzaWduLWluIGRpYWxvZyB0byBhbiBhbHJlYWR5LXNpZ25lZC1pblxuXHRcdFx0Ly8gdXNlcikuIEJvdW5kZWQsIHNvIGEgZ2VudWluZWx5IHNpZ25lZC1vdXQgLyBzbG93IGNhc2Ugc3RpbGwgcHJvY2VlZHMuXG5cdFx0XHRhd2FpdCB0aGlzLndoZW5DaGF0RXh0ZW5zaW9uQWN0aXZhdGVkKCk7XG5cdFx0fVxuXG5cdFx0bGV0IHNldHVwU3RyYXRlZ3k6IENoYXRTZXR1cFN0cmF0ZWd5O1xuXHRcdGlmIChvcHRpb25zPy5zZXR1cFN0cmF0ZWd5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHNldHVwU3RyYXRlZ3kgPSBvcHRpb25zLnNldHVwU3RyYXRlZ3k7IC8vIGNhbGxlciBwcm92aWRlZCBhIHNwZWNpZmljIHN0cmF0ZWd5LCBza2lwIGRpYWxvZ1xuXHRcdH0gZWxzZSBpZiAoIW9wdGlvbnM/LmZvcmNlU2lnbkluRGlhbG9nICYmIChkaWFsb2dTa2lwcGVkIHx8IGlzUHJvVXNlcih0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuZW50aXRsZW1lbnQpIHx8IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LkZyZWUpKSB7XG5cdFx0XHRzZXR1cFN0cmF0ZWd5ID0gQ2hhdFNldHVwU3RyYXRlZ3kuRGVmYXVsdFNldHVwOyAvLyBleGlzdGluZyBwcm8vZnJlZSB1c2VycyBzZXR1cCB3aXRob3V0IGEgZGlhbG9nXG5cdFx0fSBlbHNlIGlmIChvcHRpb25zPy5mb3JjZUFub255bW91cyA9PT0gQ2hhdFNldHVwQW5vbnltb3VzLkVuYWJsZWRXaXRob3V0RGlhbG9nKSB7XG5cdFx0XHRzZXR1cFN0cmF0ZWd5ID0gQ2hhdFNldHVwU3RyYXRlZ3kuRGVmYXVsdFNldHVwOyAvLyBhbm9ueW1vdXMgc2V0dXAgd2l0aG91dCBhIGRpYWxvZ1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzZXR1cFN0cmF0ZWd5ID0gYXdhaXQgdGhpcy5zaG93RGlhbG9nKG9wdGlvbnMpO1xuXHRcdH1cblxuXHRcdGlmIChzZXR1cFN0cmF0ZWd5ID09PSBDaGF0U2V0dXBTdHJhdGVneS5EZWZhdWx0U2V0dXAgJiYgdGhpcy5kZWZhdWx0QWNjb3VudFNlcnZpY2UuZ2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCkuZW50ZXJwcmlzZSkge1xuXHRcdFx0c2V0dXBTdHJhdGVneSA9IENoYXRTZXR1cFN0cmF0ZWd5LlNldHVwV2l0aEVudGVycHJpc2VQcm92aWRlcjsgLy8gdXNlcnMgd2l0aCBhIGNvbmZpZ3VyZWQgcHJvdmlkZXIgZ28gdGhyb3VnaCBwcm92aWRlciBzZXR1cFxuXHRcdH1cblxuXHRcdGlmIChzZXR1cFN0cmF0ZWd5ICE9PSBDaGF0U2V0dXBTdHJhdGVneS5DYW5jZWxlZCkge1xuXHRcdFx0b3B0aW9ucz8ub25TaWduSW5TdGFydGVkPy4oKTtcblx0XHR9XG5cblx0XHRpZiAoc2V0dXBTdHJhdGVneSAhPT0gQ2hhdFNldHVwU3RyYXRlZ3kuQ2FuY2VsZWQgJiYgIW9wdGlvbnM/LmRpc2FibGVDaGF0Vmlld1JldmVhbCkge1xuXHRcdFx0Ly8gU2hvdyB0aGUgY2hhdCB2aWV3IG5vdyB0byBiZXR0ZXIgaW5kaWNhdGUgcHJvZ3Jlc3Ncblx0XHRcdC8vIHdoaWxlIGluc3RhbGxpbmcgdGhlIGV4dGVuc2lvbiBvciByZXR1cm5pbmcgZnJvbSBzaWduIGluXG5cdFx0XHR0aGlzLndpZGdldFNlcnZpY2UucmV2ZWFsV2lkZ2V0KCk7XG5cdFx0fVxuXG5cdFx0bGV0IHN1Y2Nlc3M6IENoYXRTZXR1cFJlc3VsdFZhbHVlID0gdW5kZWZpbmVkO1xuXHRcdGxldCBzZXR1cEVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZXJyb3JBbHJlYWR5SGFuZGxlZCA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRzd2l0Y2ggKHNldHVwU3RyYXRlZ3kpIHtcblx0XHRcdFx0Y2FzZSBDaGF0U2V0dXBTdHJhdGVneS5TZXR1cFdpdGhFbnRlcnByaXNlUHJvdmlkZXI6XG5cdFx0XHRcdFx0c3VjY2VzcyA9IGF3YWl0IHRoaXMuY29udHJvbGxlci52YWx1ZS5zZXR1cFdpdGhQcm92aWRlcih7IHVzZUVudGVycHJpc2VQcm92aWRlcjogdHJ1ZSwgdXNlU29jaWFsUHJvdmlkZXI6IHVuZGVmaW5lZCwgYWRkaXRpb25hbFNjb3Blczogb3B0aW9ucz8uYWRkaXRpb25hbFNjb3BlcywgZm9yY2VBbm9ueW1vdXM6IG9wdGlvbnM/LmZvcmNlQW5vbnltb3VzIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYXRTZXR1cFN0cmF0ZWd5LlNldHVwV2l0aG91dEVudGVycHJpc2VQcm92aWRlcjpcblx0XHRcdFx0XHRzdWNjZXNzID0gYXdhaXQgdGhpcy5jb250cm9sbGVyLnZhbHVlLnNldHVwV2l0aFByb3ZpZGVyKHsgdXNlRW50ZXJwcmlzZVByb3ZpZGVyOiBmYWxzZSwgdXNlU29jaWFsUHJvdmlkZXI6IHVuZGVmaW5lZCwgYWRkaXRpb25hbFNjb3Blczogb3B0aW9ucz8uYWRkaXRpb25hbFNjb3BlcywgZm9yY2VBbm9ueW1vdXM6IG9wdGlvbnM/LmZvcmNlQW5vbnltb3VzIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYXRTZXR1cFN0cmF0ZWd5LlNldHVwV2l0aEFwcGxlUHJvdmlkZXI6XG5cdFx0XHRcdFx0c3VjY2VzcyA9IGF3YWl0IHRoaXMuY29udHJvbGxlci52YWx1ZS5zZXR1cFdpdGhQcm92aWRlcih7IHVzZUVudGVycHJpc2VQcm92aWRlcjogZmFsc2UsIHVzZVNvY2lhbFByb3ZpZGVyOiAnYXBwbGUnLCBhZGRpdGlvbmFsU2NvcGVzOiBvcHRpb25zPy5hZGRpdGlvbmFsU2NvcGVzLCBmb3JjZUFub255bW91czogb3B0aW9ucz8uZm9yY2VBbm9ueW1vdXMgfSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgQ2hhdFNldHVwU3RyYXRlZ3kuU2V0dXBXaXRoR29vZ2xlUHJvdmlkZXI6XG5cdFx0XHRcdFx0c3VjY2VzcyA9IGF3YWl0IHRoaXMuY29udHJvbGxlci52YWx1ZS5zZXR1cFdpdGhQcm92aWRlcih7IHVzZUVudGVycHJpc2VQcm92aWRlcjogZmFsc2UsIHVzZVNvY2lhbFByb3ZpZGVyOiAnZ29vZ2xlJywgYWRkaXRpb25hbFNjb3Blczogb3B0aW9ucz8uYWRkaXRpb25hbFNjb3BlcywgZm9yY2VBbm9ueW1vdXM6IG9wdGlvbnM/LmZvcmNlQW5vbnltb3VzIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYXRTZXR1cFN0cmF0ZWd5LkRlZmF1bHRTZXR1cDpcblx0XHRcdFx0XHRzdWNjZXNzID0gYXdhaXQgdGhpcy5jb250cm9sbGVyLnZhbHVlLnNldHVwKHsgLi4ub3B0aW9ucywgZm9yY2VBbm9ueW1vdXM6IG9wdGlvbnM/LmZvcmNlQW5vbnltb3VzIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYXRTZXR1cFN0cmF0ZWd5LkNhbmNlbGVkOlxuXHRcdFx0XHRcdHRoaXMuY29udGV4dC51cGRhdGUoeyBsYXRlcjogdHJ1ZSB9KTtcblx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxJbnN0YWxsQ2hhdEV2ZW50LCBJbnN0YWxsQ2hhdENsYXNzaWZpY2F0aW9uPignY29tbWFuZENlbnRlci5jaGF0SW5zdGFsbCcsIHsgaW5zdGFsbFJlc3VsdDogJ2ZhaWxlZE1heWJlTGF0ZXInLCBpbnN0YWxsRHVyYXRpb246IDAsIHNpZ25VcEVycm9yQ29kZTogdW5kZWZpbmVkLCBwcm92aWRlcjogdW5kZWZpbmVkIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtjaGF0IHNldHVwXSBFcnJvciBkdXJpbmcgc2V0dXA6ICR7dG9FcnJvck1lc3NhZ2UoZXJyb3IpfWApO1xuXHRcdFx0c3VjY2VzcyA9IGZhbHNlO1xuXHRcdFx0aWYgKGVycm9yIGluc3RhbmNlb2YgQ2hhdFNldHVwRXJyb3IpIHtcblx0XHRcdFx0c2V0dXBFcnJvciA9IGVycm9yLm9yaWdpbmFsRXJyb3I7XG5cdFx0XHRcdGVycm9yQWxyZWFkeUhhbmRsZWQgPSBlcnJvci51c2VyTm90aWZpZWQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRzZXR1cEVycm9yID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yIDogbmV3IEVycm9yKHRvRXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHN1Y2Nlc3MpIHtcblx0XHRcdHRoaXMuY29udGV4dC51cGRhdGUoeyBjb21wbGV0ZWQ6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgc3VjY2VzcywgZGlhbG9nU2tpcHBlZCwgZXJyb3I6IHNldHVwRXJyb3IsIGVycm9yQWxyZWFkeUhhbmRsZWQgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBkZWZhdWx0IGNoYXQgZXh0ZW5zaW9uIGhhcyBmaW5pc2hlZCBhY3RpdmF0aW5nLiBgYWN0aXZhdGlvblRpbWVzYFxuXHQgKiBpcyBvbmx5IHNldCBvbmNlIGFjdGl2YXRpb24gY29tcGxldGVzLCBzbyBgdW5kZWZpbmVkYCBtZWFucyBcIm5vdCB5ZXQgYWN0aXZlXCIuXG5cdCAqL1xuXHRwcml2YXRlIGlzQ2hhdEV4dGVuc2lvbkFjdGl2YXRlZCgpOiBib29sZWFuIHtcblx0XHRjb25zdCBzdGF0dXMgPSB0aGlzLmV4dGVuc2lvblNlcnZpY2UuZ2V0RXh0ZW5zaW9uc1N0YXR1cygpO1xuXHRcdGZvciAoY29uc3QgaWQgb2YgT2JqZWN0LmtleXMoc3RhdHVzKSkge1xuXHRcdFx0aWYgKEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKGlkLCBkZWZhdWx0Q2hhdC5jaGF0RXh0ZW5zaW9uSWQpKSB7XG5cdFx0XHRcdHJldHVybiBzdGF0dXNbaWRdLmFjdGl2YXRpb25UaW1lcyAhPT0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgb25jZSB0aGUgZGVmYXVsdCBjaGF0IGV4dGVuc2lvbiBoYXMgZmluaXNoZWQgYWN0aXZhdGluZyAoYm91bmRlZCBieVxuXHQgKiBhIHRpbWVvdXQpLiBEZXRlY3Rpb24gcmVsaWVzIG9ubHkgb24gdGhlIGV4dGVuc2lvbiBsaWZlY3ljbGUsIHNvIGl0IG5ldmVyXG5cdCAqIHRvdWNoZXMgdGhlIHVzZXIncyBhdXRoZW50aWNhdGlvbiBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyB3aGVuQ2hhdEV4dGVuc2lvbkFjdGl2YXRlZCh0aW1lb3V0TXMgPSAxMDAwMCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghZGVmYXVsdENoYXQuY2hhdEV4dGVuc2lvbklkIHx8IHRoaXMuaXNDaGF0RXh0ZW5zaW9uQWN0aXZhdGVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgcmFjZVRpbWVvdXQobmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNoZWNrID0gKCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0aGlzLmlzQ2hhdEV4dGVuc2lvbkFjdGl2YXRlZCgpKSB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRzdG9yZS5hZGQodGhpcy5leHRlbnNpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9uc1N0YXR1cyhjaGVjaykpO1xuXHRcdFx0XHR0aGlzLmV4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCkudGhlbihjaGVjayk7XG5cdFx0XHR9KSwgdGltZW91dE1zKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd0RpYWxvZyhvcHRpb25zPzogSUNoYXRTZXR1cFJ1bk9wdGlvbnMpOiBQcm9taXNlPENoYXRTZXR1cFN0cmF0ZWd5PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBidXR0b25zID0gdGhpcy5nZXRCdXR0b25zKG9wdGlvbnMpO1xuXG5cdFx0Y29uc3QgZGlhbG9nID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaWFsb2coXG5cdFx0XHR0aGlzLmxheW91dFNlcnZpY2UuYWN0aXZlQ29udGFpbmVyLFxuXHRcdFx0dGhpcy5nZXREaWFsb2dUaXRsZShvcHRpb25zKSxcblx0XHRcdGJ1dHRvbnMubWFwKGJ1dHRvbiA9PiBidXR0b25bMF0pLFxuXHRcdFx0Y3JlYXRlV29ya2JlbmNoRGlhbG9nT3B0aW9ucyh7XG5cdFx0XHRcdHR5cGU6ICdub25lJyxcblx0XHRcdFx0ZXh0cmFDbGFzc2VzOiBbJ2NoYXQtc2V0dXAtZGlhbG9nJ10sXG5cdFx0XHRcdGRldGFpbDogJyAnLCAvLyB3b3JrYXJvdW5kIGFsbG93aW5nIHVzIHRvIHJlbmRlciB0aGUgbWVzc2FnZSBpbiBsYXJnZVxuXHRcdFx0XHRpY29uOiBvcHRpb25zPy5kaWFsb2dJY29uID8/IENvZGljb24uY29waWxvdExhcmdlLFxuXHRcdFx0XHRhbGlnbm1lbnQ6IERpYWxvZ0NvbnRlbnRzQWxpZ25tZW50LlZlcnRpY2FsLFxuXHRcdFx0XHRjYW5jZWxJZDogYnV0dG9ucy5sZW5ndGgsXG5cdFx0XHRcdGRpc2FibGVDbG9zZUJ1dHRvbjogb3B0aW9ucz8uZGlzYWJsZUNsb3NlQnV0dG9uID8/IGZhbHNlLFxuXHRcdFx0XHRyZW5kZXJGb290ZXI6IGZvb3RlciA9PiBmb290ZXIuYXBwZW5kQ2hpbGQodGhpcy5jcmVhdGVEaWFsb2dGb290ZXIoZGlzcG9zYWJsZXMsIG9wdGlvbnMpKSxcblx0XHRcdFx0YnV0dG9uT3B0aW9uczogYnV0dG9ucy5tYXAoYnV0dG9uID0+IGJ1dHRvblsyXSlcblx0XHRcdH0sIHRoaXMua2V5YmluZGluZ1NlcnZpY2UsIHRoaXMubGF5b3V0U2VydmljZSwgdGhpcy5ob3N0U2VydmljZSlcblx0XHQpKTtcblxuXHRcdGNvbnN0IHsgYnV0dG9uIH0gPSBhd2FpdCBkaWFsb2cuc2hvdygpO1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblxuXHRcdHJldHVybiBidXR0b25zW2J1dHRvbl0/LlsxXSA/PyBDaGF0U2V0dXBTdHJhdGVneS5DYW5jZWxlZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0QnV0dG9ucyhvcHRpb25zPzogSUNoYXRTZXR1cFJ1bk9wdGlvbnMpOiBBcnJheTxbc3RyaW5nLCBDaGF0U2V0dXBTdHJhdGVneSwgeyBzdHlsZUJ1dHRvbj86IChidXR0b246IElCdXR0b24pID0+IHZvaWQgfSB8IHVuZGVmaW5lZF0+IHtcblx0XHR0eXBlIENvbnRpbnVlV2l0aEJ1dHRvbiA9IFtzdHJpbmcsIENoYXRTZXR1cFN0cmF0ZWd5LCB7IHN0eWxlQnV0dG9uPzogKGJ1dHRvbjogSUJ1dHRvbikgPT4gdm9pZCB9IHwgdW5kZWZpbmVkXTtcblx0XHRjb25zdCBzdHlsZUJ1dHRvbiA9ICguLi5jbGFzc2VzOiBzdHJpbmdbXSkgPT4gKHsgc3R5bGVCdXR0b246IChidXR0b246IElCdXR0b24pID0+IGJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoLi4uY2xhc3NlcykgfSk7XG5cblx0XHRsZXQgYnV0dG9uczogQXJyYXk8Q29udGludWVXaXRoQnV0dG9uPjtcblx0XHRpZiAoIW9wdGlvbnM/LmZvcmNlQW5vbnltb3VzICYmICh0aGlzLmNvbnRleHQuc3RhdGUuZW50aXRsZW1lbnQgPT09IENoYXRFbnRpdGxlbWVudC5Vbmtub3duIHx8IG9wdGlvbnM/LmZvcmNlU2lnbkluRGlhbG9nKSkge1xuXHRcdFx0Y29uc3QgZGVmYXVsdFByb3ZpZGVyQnV0dG9uOiBDb250aW51ZVdpdGhCdXR0b24gPSBbbG9jYWxpemUoJ2NvbnRpbnVlV2l0aCcsIFwiQ29udGludWUgd2l0aCB7MH1cIiwgZGVmYXVsdENoYXQucHJvdmlkZXIuZGVmYXVsdC5uYW1lKSwgQ2hhdFNldHVwU3RyYXRlZ3kuU2V0dXBXaXRob3V0RW50ZXJwcmlzZVByb3ZpZGVyLCBzdHlsZUJ1dHRvbignY29udGludWUtYnV0dG9uJywgJ2RlZmF1bHQnKV07XG5cdFx0XHRjb25zdCBkZWZhdWx0UHJvdmlkZXJMaW5rOiBDb250aW51ZVdpdGhCdXR0b24gPSBbZGVmYXVsdFByb3ZpZGVyQnV0dG9uWzBdLCBkZWZhdWx0UHJvdmlkZXJCdXR0b25bMV0sIHN0eWxlQnV0dG9uKCdsaW5rLWJ1dHRvbicpXTtcblxuXHRcdFx0Y29uc3QgZW50ZXJwcmlzZVByb3ZpZGVyQnV0dG9uOiBDb250aW51ZVdpdGhCdXR0b24gPSBbbG9jYWxpemUoJ2NvbnRpbnVlV2l0aCcsIFwiQ29udGludWUgd2l0aCB7MH1cIiwgZGVmYXVsdENoYXQucHJvdmlkZXIuZW50ZXJwcmlzZS5uYW1lKSwgQ2hhdFNldHVwU3RyYXRlZ3kuU2V0dXBXaXRoRW50ZXJwcmlzZVByb3ZpZGVyLCBzdHlsZUJ1dHRvbignY29udGludWUtYnV0dG9uJywgJ2RlZmF1bHQnKV07XG5cdFx0XHRjb25zdCBlbnRlcnByaXNlUHJvdmlkZXJMaW5rOiBDb250aW51ZVdpdGhCdXR0b24gPSBbZW50ZXJwcmlzZVByb3ZpZGVyQnV0dG9uWzBdLCBlbnRlcnByaXNlUHJvdmlkZXJCdXR0b25bMV0sIHN0eWxlQnV0dG9uKCdsaW5rLWJ1dHRvbicpXTtcblxuXHRcdFx0Y29uc3QgZ29vZ2xlUHJvdmlkZXJCdXR0b246IENvbnRpbnVlV2l0aEJ1dHRvbiA9IFtsb2NhbGl6ZSgnY29udGludWVXaXRoJywgXCJDb250aW51ZSB3aXRoIHswfVwiLCBkZWZhdWx0Q2hhdC5wcm92aWRlci5nb29nbGUubmFtZSksIENoYXRTZXR1cFN0cmF0ZWd5LlNldHVwV2l0aEdvb2dsZVByb3ZpZGVyLCBzdHlsZUJ1dHRvbignY29udGludWUtYnV0dG9uJywgJ2dvb2dsZScpXTtcblx0XHRcdGNvbnN0IGFwcGxlUHJvdmlkZXJCdXR0b246IENvbnRpbnVlV2l0aEJ1dHRvbiA9IFtsb2NhbGl6ZSgnY29udGludWVXaXRoJywgXCJDb250aW51ZSB3aXRoIHswfVwiLCBkZWZhdWx0Q2hhdC5wcm92aWRlci5hcHBsZS5uYW1lKSwgQ2hhdFNldHVwU3RyYXRlZ3kuU2V0dXBXaXRoQXBwbGVQcm92aWRlciwgc3R5bGVCdXR0b24oJ2NvbnRpbnVlLWJ1dHRvbicsICdhcHBsZScpXTtcblxuXHRcdFx0aWYgKCF0aGlzLmRlZmF1bHRBY2NvdW50U2VydmljZS5nZXREZWZhdWx0QWNjb3VudEF1dGhlbnRpY2F0aW9uUHJvdmlkZXIoKS5lbnRlcnByaXNlKSB7XG5cdFx0XHRcdGJ1dHRvbnMgPSBjb2FsZXNjZShbXG5cdFx0XHRcdFx0ZGVmYXVsdFByb3ZpZGVyQnV0dG9uLFxuXHRcdFx0XHRcdGdvb2dsZVByb3ZpZGVyQnV0dG9uLFxuXHRcdFx0XHRcdGFwcGxlUHJvdmlkZXJCdXR0b24sXG5cdFx0XHRcdFx0ZW50ZXJwcmlzZVByb3ZpZGVyTGlua1xuXHRcdFx0XHRdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGJ1dHRvbnMgPSBjb2FsZXNjZShbXG5cdFx0XHRcdFx0ZW50ZXJwcmlzZVByb3ZpZGVyQnV0dG9uLFxuXHRcdFx0XHRcdGdvb2dsZVByb3ZpZGVyQnV0dG9uLFxuXHRcdFx0XHRcdGFwcGxlUHJvdmlkZXJCdXR0b24sXG5cdFx0XHRcdFx0ZGVmYXVsdFByb3ZpZGVyTGlua1xuXHRcdFx0XHRdKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0YnV0dG9ucyA9IFtbbG9jYWxpemUoJ3NldHVwQUlCdXR0b24nLCBcIlVzZSBBSSBGZWF0dXJlc1wiKSwgQ2hhdFNldHVwU3RyYXRlZ3kuRGVmYXVsdFNldHVwLCB1bmRlZmluZWRdXTtcblx0XHR9XG5cblx0XHRyZXR1cm4gYnV0dG9ucztcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGlhbG9nVGl0bGUob3B0aW9ucz86IElDaGF0U2V0dXBSdW5PcHRpb25zKTogc3RyaW5nIHtcblx0XHRpZiAob3B0aW9ucz8uZGlhbG9nVGl0bGUpIHtcblx0XHRcdHJldHVybiBvcHRpb25zLmRpYWxvZ1RpdGxlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuYW5vbnltb3VzKSB7XG5cdFx0XHRpZiAob3B0aW9ucz8uZm9yY2VBbm9ueW1vdXMpIHtcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzdGFydFVzaW5nJywgXCJTdGFydCB1c2luZyBBSSBGZWF0dXJlc1wiKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnZW5hYmxlTW9yZScsIFwiRW5hYmxlIG1vcmUgQUkgZmVhdHVyZXNcIik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuY29udGV4dC5zdGF0ZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LlVua25vd24gfHwgb3B0aW9ucz8uZm9yY2VTaWduSW5EaWFsb2cpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2lnbkluJywgXCJTaWduIGluIHRvIHVzZSBHaXRIdWIgQ29waWxvdFwiKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbG9jYWxpemUoJ3N0YXJ0VXNpbmcnLCBcIlN0YXJ0IHVzaW5nIEFJIEZlYXR1cmVzXCIpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVEaWFsb2dGb290ZXIoZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgb3B0aW9ucz86IHsgZm9yY2VBbm9ueW1vdXM/OiBDaGF0U2V0dXBBbm9ueW1vdXMgfSk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCBlbGVtZW50ID0gJCgnLmNoYXQtc2V0dXAtZGlhbG9nLWZvb3RlcicpO1xuXG5cblx0XHRsZXQgZm9vdGVyOiBzdHJpbmc7XG5cdFx0aWYgKG9wdGlvbnM/LmZvcmNlQW5vbnltb3VzIHx8IHRoaXMudGVsZW1ldHJ5U2VydmljZS50ZWxlbWV0cnlMZXZlbCA9PT0gVGVsZW1ldHJ5TGV2ZWwuTk9ORSkge1xuXHRcdFx0Zm9vdGVyID0gbG9jYWxpemUoeyBrZXk6ICdzZXR0aW5nc0Fub255bW91cycsIGNvbW1lbnQ6IFsne0xvY2tlZD1cIltcIn0nLCAne0xvY2tlZD1cIl0oezF9KVwifScsICd7TG9ja2VkPVwiXSh7Mn0pXCJ9J10gfSwgXCJCeSBjb250aW51aW5nLCB5b3UgYWdyZWUgdG8gezB9J3MgW1Rlcm1zXSh7MX0pIGFuZCBbUHJpdmFjeSBTdGF0ZW1lbnRdKHsyfSkuXCIsIGRlZmF1bHRDaGF0LnByb3ZpZGVyLmRlZmF1bHQubmFtZSwgZGVmYXVsdENoYXQudGVybXNTdGF0ZW1lbnRVcmwsIGRlZmF1bHRDaGF0LnByaXZhY3lTdGF0ZW1lbnRVcmwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmb290ZXIgPSBsb2NhbGl6ZSh7IGtleTogJ3NldHRpbmdzJywgY29tbWVudDogWyd7TG9ja2VkPVwiW1wifScsICd7TG9ja2VkPVwiXSh7MX0pXCJ9JywgJ3tMb2NrZWQ9XCJdKHsyfSlcIn0nLCAne0xvY2tlZD1cIl0oezR9KVwifScsICd7TG9ja2VkPVwiXSh7NX0pXCJ9J10gfSwgXCJCeSBjb250aW51aW5nLCB5b3UgYWdyZWUgdG8gezB9J3MgW1Rlcm1zXSh7MX0pIGFuZCBbUHJpdmFjeSBTdGF0ZW1lbnRdKHsyfSkuIHszfSBDb3BpbG90IG1heSBzaG93IFtwdWJsaWMgY29kZV0oezR9KSBzdWdnZXN0aW9ucyBhbmQgdXNlIHlvdXIgZGF0YSB0byBpbXByb3ZlIHRoZSBwcm9kdWN0LiBZb3UgY2FuIGNoYW5nZSB0aGVzZSBbc2V0dGluZ3NdKHs1fSkgYW55dGltZS5cIiwgZGVmYXVsdENoYXQucHJvdmlkZXIuZGVmYXVsdC5uYW1lLCBkZWZhdWx0Q2hhdC50ZXJtc1N0YXRlbWVudFVybCwgZGVmYXVsdENoYXQucHJpdmFjeVN0YXRlbWVudFVybCwgZGVmYXVsdENoYXQucHJvdmlkZXIuZGVmYXVsdC5uYW1lLCBkZWZhdWx0Q2hhdC5wdWJsaWNDb2RlTWF0Y2hlc1VybCwgdGhpcy5kZWZhdWx0QWNjb3VudFNlcnZpY2UucmVzb2x2ZUdpdEh1YlVybChHaXRIdWJQYXRocy5jb3BpbG90U2V0dGluZ3MpKTtcblx0XHR9XG5cdFx0ZWxlbWVudC5hcHBlbmRDaGlsZCgkKCdwJywgdW5kZWZpbmVkLCBkaXNwb3NhYmxlcy5hZGQodGhpcy5tYXJrZG93blJlbmRlcmVyU2VydmljZS5yZW5kZXIobmV3IE1hcmtkb3duU3RyaW5nKGZvb3RlciwgeyBpc1RydXN0ZWQ6IHRydWUgfSkpKS5lbGVtZW50KSk7XG5cblx0XHRyZXR1cm4gZWxlbWVudDtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZnJlc2hUb2tlbnMoY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSk6IHZvaWQge1xuXHQvLyB1Z2x5LCBidXQgd2UgbmVlZCB0byBzaWduYWwgdG8gdGhlIGV4dGVuc2lvbiB0aGF0IGVudGl0bGVtZW50cyBjaGFuZ2VkXG5cdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGRlZmF1bHRDaGF0LmNoYXRSZWZyZXNoVG9rZW5Db21tYW5kKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsU0FBUztBQUVsQixTQUFTLFFBQVEsK0JBQStCO0FBQ2hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUUvQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLG9DQUFvQztBQUU3QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLG1CQUFtQjtBQUM1QixPQUFPLGFBQWE7QUFDcEIsU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQVMsa0NBQWtDLHFDQUFxQztBQUVoRixTQUFTLGlCQUFp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
