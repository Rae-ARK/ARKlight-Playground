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
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { isCancellationError } from "../../../../../base/common/errors.js";
import { Emitter } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import Severity from "../../../../../base/common/severity.js";
import { StopWatch } from "../../../../../base/common/stopwatch.js";
import { isObject, isUndefined } from "../../../../../base/common/types.js";
import { localize } from "../../../../../nls.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../../../../platform/configuration/common/configurationRegistry.js";
import { IDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import product from "../../../../../platform/product/common/product.js";
import { IProgressService, ProgressLocation } from "../../../../../platform/progress/common/progress.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IActivityService, ProgressBadge } from "../../../../services/activity/common/activity.js";
import { ILifecycleService } from "../../../../services/lifecycle/common/lifecycle.js";
import { IExtensionsWorkbenchService } from "../../../extensions/common/extensions.js";
import { ChatEntitlement, isProUser } from "../../../../services/chat/common/chatEntitlementService.js";
import { CHAT_OPEN_ACTION_ID } from "../actions/chatActions.js";
import { ChatViewContainerId, ChatViewId } from "../chat.js";
import { ChatSetupError, ChatSetupStep, refreshTokens, maybeEnableAuthExtension } from "./chatSetup.js";
import { IDefaultAccountService } from "../../../../../platform/defaultAccount/common/defaultAccount.js";
import { IProductService } from "../../../../../platform/product/common/productService.js";
const defaultChat = {
  chatExtensionId: product.defaultChatAgent?.chatExtensionId ?? "",
  provider: product.defaultChatAgent?.provider ?? { default: { id: "", name: "" }, enterprise: { id: "", name: "" }, apple: { id: "", name: "" }, google: { id: "", name: "" } },
  providerUriSetting: product.defaultChatAgent?.providerUriSetting ?? "",
  completionsAdvancedSetting: product.defaultChatAgent?.completionsAdvancedSetting ?? ""
};
let ChatSetupController = class extends Disposable {
  constructor(context, requests, telemetryService, extensionsWorkbenchService, logService, progressService, activityService, commandService, dialogService, configurationService, lifecycleService, quickInputService, defaultAccountService, productService) {
    super();
    this.context = context;
    this.requests = requests;
    this.telemetryService = telemetryService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.logService = logService;
    this.progressService = progressService;
    this.activityService = activityService;
    this.commandService = commandService;
    this.dialogService = dialogService;
    this.configurationService = configurationService;
    this.lifecycleService = lifecycleService;
    this.quickInputService = quickInputService;
    this.defaultAccountService = defaultAccountService;
    this.productService = productService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._step = ChatSetupStep.Initial;
    this.registerListeners();
  }
  get step() {
    return this._step;
  }
  registerListeners() {
    this._register(this.context.onDidChange(() => this._onDidChange.fire()));
  }
  setStep(step) {
    if (this._step === step) {
      return;
    }
    this._step = step;
    this._onDidChange.fire();
  }
  async setup(options = {}) {
    const watch = new StopWatch(false);
    const title = localize("setupChatProgress", "Getting chat ready...");
    const badge = this.activityService.showViewContainerActivity(ChatViewContainerId, {
      badge: new ProgressBadge(() => title)
    });
    try {
      return await this.progressService.withProgress({
        location: ProgressLocation.Window,
        command: CHAT_OPEN_ACTION_ID,
        title
      }, () => this.doSetup(options, watch));
    } finally {
      badge.dispose();
    }
  }
  async doSetup(options, watch) {
    this.context.suspend();
    let success = false;
    try {
      let entitlement;
      let signIn;
      if (options.forceSignIn) {
        signIn = true;
      } else if (this.context.state.entitlement === ChatEntitlement.Unknown) {
        if (options.forceAnonymous) {
          signIn = false;
        } else {
          signIn = true;
        }
      } else {
        signIn = false;
      }
      if (signIn) {
        this.setStep(ChatSetupStep.SigningIn);
        const result = await this.signIn(options);
        if (!result.defaultAccount) {
          const provider = options.useSocialProvider ?? (options.useEnterpriseProvider ? defaultChat.provider.enterprise.id : defaultChat.provider.default.id);
          this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "failedNotSignedIn", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
          return void 0;
        }
        entitlement = result.entitlement;
      }
      this.setStep(ChatSetupStep.Installing);
      success = await this.install(entitlement ?? this.context.state.entitlement, watch, options);
    } finally {
      this.setStep(ChatSetupStep.Initial);
      this.context.resume();
    }
    return success;
  }
  async signIn(options) {
    const authExtensionReEnabled = await maybeEnableAuthExtension(this.extensionsWorkbenchService, this.logService);
    if (authExtensionReEnabled) {
      refreshTokens(this.commandService);
    }
    let entitlements;
    let defaultAccount;
    let signInError;
    try {
      ({ defaultAccount, entitlements } = await this.requests.signIn(options));
    } catch (e) {
      this.logService.error(`[chat setup] signIn: error ${e}`);
      signInError = e instanceof Error ? e : new Error(String(e));
    }
    if (!defaultAccount && !this.lifecycleService.willShutdown) {
      const { confirmed } = await this.dialogService.confirm({
        type: Severity.Error,
        message: localize("unknownSignInError", "Failed to sign in to {0}. Would you like to try again?", this.defaultAccountService.getDefaultAccountAuthenticationProvider().name),
        detail: localize("unknownSignInErrorDetail", "You must be signed in to use AI features."),
        primaryButton: localize("retry", "Retry")
      });
      if (confirmed) {
        return this.signIn(options);
      }
    }
    if (signInError) {
      throw new ChatSetupError(signInError, true);
    }
    return { defaultAccount, entitlement: entitlements?.entitlement };
  }
  async install(entitlement, watch, options) {
    const wasRunning = this.context.state.completed && !this.context.state.disabled;
    let signUpResult = void 0;
    let provider;
    if (options.forceAnonymous && entitlement === ChatEntitlement.Unknown) {
      provider = "anonymous";
    } else {
      provider = options.useSocialProvider ?? (options.useEnterpriseProvider ? defaultChat.provider.enterprise.id : defaultChat.provider.default.id);
    }
    try {
      if (!options.forceAnonymous && // User is not asking for anonymous access
      entitlement !== ChatEntitlement.Free && // User is not signed up to Copilot Free
      !isProUser(entitlement) && // User is not signed up for a Copilot subscription
      entitlement !== ChatEntitlement.Unavailable) {
        signUpResult = await this.requests.signUpFree();
        if (isUndefined(signUpResult)) {
          this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "failedNoSession", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
          return false;
        }
        if (typeof signUpResult !== "boolean") {
          this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "failedSignUp", installDuration: watch.elapsed(), signUpErrorCode: signUpResult.errorCode, provider });
        }
      }
      await this.doInstallWithRetry();
    } catch (error) {
      this.logService.error(`[chat setup] install: error ${error}`);
      this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: isCancellationError(error) ? "cancelled" : "failedInstall", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
      return false;
    }
    if (typeof signUpResult === "boolean" || typeof signUpResult === "undefined") {
      this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: wasRunning && !signUpResult ? "alreadyInstalled" : "installed", installDuration: watch.elapsed(), signUpErrorCode: void 0, provider });
    }
    if (wasRunning) {
      refreshTokens(this.commandService);
    }
    return true;
  }
  async doInstallWithRetry() {
    let error;
    try {
      await this.doInstall();
    } catch (e) {
      this.logService.error(`[chat setup] install: error ${error}`);
      error = e;
    }
    if (error) {
      if (!this.lifecycleService.willShutdown) {
        const { confirmed } = await this.dialogService.confirm({
          type: Severity.Error,
          message: localize("unknownSetupError", "An error occurred while setting up chat. Would you like to try again?"),
          detail: error && !isCancellationError(error) ? toErrorMessage(error) : void 0,
          primaryButton: localize("retry", "Retry")
        });
        if (confirmed) {
          return this.doInstallWithRetry();
        }
      }
      throw error;
    }
  }
  async doInstall() {
    await this.extensionsWorkbenchService.install(defaultChat.chatExtensionId, {
      enable: true,
      isApplicationScoped: true,
      // install into all profiles
      isMachineScoped: false,
      // do not ask to sync
      installEverywhere: true,
      // install in local and remote
      installPreReleaseVersion: this.productService.quality !== "stable"
    }, ChatViewId);
  }
  async setupWithProvider(options) {
    const registry = Registry.as(ConfigurationExtensions.Configuration);
    registry.registerConfiguration({
      "id": "copilot.setup",
      "type": "object",
      "properties": {
        [defaultChat.completionsAdvancedSetting]: {
          "type": "object",
          "properties": {
            "authProvider": {
              "type": "string"
            }
          }
        },
        [defaultChat.providerUriSetting]: {
          "type": "string"
        }
      }
    });
    if (options.useEnterpriseProvider) {
      const success = await this.handleEnterpriseInstance();
      if (!success) {
        this.telemetryService.publicLog2("commandCenter.chatInstall", { installResult: "failedEnterpriseSetup", installDuration: 0, signUpErrorCode: void 0, provider: void 0 });
        return success;
      }
    }
    let existingAdvancedSetting = this.configurationService.inspect(defaultChat.completionsAdvancedSetting).user?.value;
    if (!isObject(existingAdvancedSetting)) {
      existingAdvancedSetting = {};
    }
    if (options.useEnterpriseProvider) {
      await this.configurationService.updateValue(`${defaultChat.completionsAdvancedSetting}`, {
        ...existingAdvancedSetting,
        "authProvider": defaultChat.provider.enterprise.id
      }, ConfigurationTarget.USER);
    } else {
      await this.configurationService.updateValue(`${defaultChat.completionsAdvancedSetting}`, Object.keys(existingAdvancedSetting).length > 0 ? {
        ...existingAdvancedSetting,
        "authProvider": void 0
      } : void 0, ConfigurationTarget.USER);
    }
    return this.setup({ ...options, forceSignIn: true });
  }
  async handleEnterpriseInstance() {
    const domainRegEx = /^[a-zA-Z\-_]+$/;
    const fullUriRegEx = /^(https:\/\/)?([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.ghe\.com\/?$/;
    const uri = this.configurationService.getValue(defaultChat.providerUriSetting);
    if (typeof uri === "string" && fullUriRegEx.test(uri)) {
      return true;
    }
    let isSingleWord = false;
    const result = await this.quickInputService.input({
      prompt: localize("enterpriseInstance", "What is your {0} instance?", defaultChat.provider.enterprise.name),
      placeHolder: localize("enterpriseInstancePlaceholder", 'i.e. "octocat" or "https://octocat.ghe.com"...'),
      ignoreFocusLost: true,
      value: uri,
      validateInput: async (value) => {
        isSingleWord = false;
        if (!value) {
          return void 0;
        }
        if (domainRegEx.test(value)) {
          isSingleWord = true;
          return {
            content: localize("willResolveTo", "Will resolve to {0}", `https://${value}.ghe.com`),
            severity: Severity.Info
          };
        }
        if (!fullUriRegEx.test(value)) {
          return {
            content: localize("invalidEnterpriseInstance", 'You must enter a valid {0} instance (i.e. "octocat" or "https://octocat.ghe.com")', defaultChat.provider.enterprise.name),
            severity: Severity.Error
          };
        }
        return void 0;
      }
    });
    if (!result) {
      return void 0;
    }
    let resolvedUri = result;
    if (isSingleWord) {
      resolvedUri = `https://${resolvedUri}.ghe.com`;
    } else {
      const normalizedUri = result.toLowerCase();
      const hasHttps = normalizedUri.startsWith("https://");
      if (!hasHttps) {
        resolvedUri = `https://${result}`;
      }
    }
    await this.configurationService.updateValue(defaultChat.providerUriSetting, resolvedUri, ConfigurationTarget.USER);
    return true;
  }
};
ChatSetupController = __decorateClass([
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IExtensionsWorkbenchService),
  __decorateParam(4, ILogService),
  __decorateParam(5, IProgressService),
  __decorateParam(6, IActivityService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, ILifecycleService),
  __decorateParam(11, IQuickInputService),
  __decorateParam(12, IDefaultAccountService),
  __decorateParam(13, IProductService)
], ChatSetupController);
export {
  ChatSetupController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0U2V0dXAvY2hhdFNldHVwQ29udHJvbGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBpc09iamVjdCwgaXNVbmRlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUFjdGl2aXR5U2VydmljZSwgUHJvZ3Jlc3NCYWRnZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2FjdGl2aXR5L2NvbW1vbi9hY3Rpdml0eS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgQ2hhdEVudGl0bGVtZW50LCBDaGF0RW50aXRsZW1lbnRDb250ZXh0LCBDaGF0RW50aXRsZW1lbnRSZXF1ZXN0cywgaXNQcm9Vc2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDSEFUX09QRU5fQUNUSU9OX0lEIH0gZnJvbSAnLi4vYWN0aW9ucy9jaGF0QWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld0NvbnRhaW5lcklkLCBDaGF0Vmlld0lkIH0gZnJvbSAnLi4vY2hhdC5qcyc7XG5pbXBvcnQgeyBDaGF0U2V0dXBBbm9ueW1vdXMsIENoYXRTZXR1cEVycm9yLCBDaGF0U2V0dXBTdGVwLCBDaGF0U2V0dXBSZXN1bHRWYWx1ZSwgSW5zdGFsbENoYXRFdmVudCwgSW5zdGFsbENoYXRDbGFzc2lmaWNhdGlvbiwgcmVmcmVzaFRva2VucywgbWF5YmVFbmFibGVBdXRoRXh0ZW5zaW9uIH0gZnJvbSAnLi9jaGF0U2V0dXAuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGVmYXVsdEFjY291bnQuanMnO1xuaW1wb3J0IHsgSURlZmF1bHRBY2NvdW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RlZmF1bHRBY2NvdW50L2NvbW1vbi9kZWZhdWx0QWNjb3VudC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5cbmNvbnN0IGRlZmF1bHRDaGF0ID0ge1xuXHRjaGF0RXh0ZW5zaW9uSWQ6IHByb2R1Y3QuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbklkID8/ICcnLFxuXHRwcm92aWRlcjogcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5wcm92aWRlciA/PyB7IGRlZmF1bHQ6IHsgaWQ6ICcnLCBuYW1lOiAnJyB9LCBlbnRlcnByaXNlOiB7IGlkOiAnJywgbmFtZTogJycgfSwgYXBwbGU6IHsgaWQ6ICcnLCBuYW1lOiAnJyB9LCBnb29nbGU6IHsgaWQ6ICcnLCBuYW1lOiAnJyB9IH0sXG5cdHByb3ZpZGVyVXJpU2V0dGluZzogcHJvZHVjdC5kZWZhdWx0Q2hhdEFnZW50Py5wcm92aWRlclVyaVNldHRpbmcgPz8gJycsXG5cdGNvbXBsZXRpb25zQWR2YW5jZWRTZXR0aW5nOiBwcm9kdWN0LmRlZmF1bHRDaGF0QWdlbnQ/LmNvbXBsZXRpb25zQWR2YW5jZWRTZXR0aW5nID8/ICcnLFxufTtcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFNldHVwQ29udHJvbGxlck9wdGlvbnMge1xuXHRyZWFkb25seSBmb3JjZVNpZ25Jbj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHVzZVNvY2lhbFByb3ZpZGVyPzogc3RyaW5nO1xuXHRyZWFkb25seSB1c2VFbnRlcnByaXNlUHJvdmlkZXI/OiBib29sZWFuO1xuXHRyZWFkb25seSBhZGRpdGlvbmFsU2NvcGVzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IGZvcmNlQW5vbnltb3VzPzogQ2hhdFNldHVwQW5vbnltb3VzO1xufVxuXG5leHBvcnQgY2xhc3MgQ2hhdFNldHVwQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfc3RlcCA9IENoYXRTZXR1cFN0ZXAuSW5pdGlhbDtcblx0Z2V0IHN0ZXAoKTogQ2hhdFNldHVwU3RlcCB7IHJldHVybiB0aGlzLl9zdGVwOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0OiBDaGF0RW50aXRsZW1lbnRDb250ZXh0LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVxdWVzdHM6IENoYXRFbnRpdGxlbWVudFJlcXVlc3RzLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJQWN0aXZpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWN0aXZpdHlTZXJ2aWNlOiBJQWN0aXZpdHlTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZVNlcnZpY2U6IElMaWZlY3ljbGVTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJRGVmYXVsdEFjY291bnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdEFjY291bnRTZXJ2aWNlOiBJRGVmYXVsdEFjY291bnRTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHQub25EaWRDaGFuZ2UoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIHNldFN0ZXAoc3RlcDogQ2hhdFNldHVwU3RlcCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdGVwID09PSBzdGVwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RlcCA9IHN0ZXA7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSgpO1xuXHR9XG5cblx0YXN5bmMgc2V0dXAob3B0aW9uczogSUNoYXRTZXR1cENvbnRyb2xsZXJPcHRpb25zID0ge30pOiBQcm9taXNlPENoYXRTZXR1cFJlc3VsdFZhbHVlPiB7XG5cdFx0Y29uc3Qgd2F0Y2ggPSBuZXcgU3RvcFdhdGNoKGZhbHNlKTtcblx0XHRjb25zdCB0aXRsZSA9IGxvY2FsaXplKCdzZXR1cENoYXRQcm9ncmVzcycsIFwiR2V0dGluZyBjaGF0IHJlYWR5Li4uXCIpO1xuXHRcdGNvbnN0IGJhZGdlID0gdGhpcy5hY3Rpdml0eVNlcnZpY2Uuc2hvd1ZpZXdDb250YWluZXJBY3Rpdml0eShDaGF0Vmlld0NvbnRhaW5lcklkLCB7XG5cdFx0XHRiYWRnZTogbmV3IFByb2dyZXNzQmFkZ2UoKCkgPT4gdGl0bGUpLFxuXHRcdH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3Moe1xuXHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3csXG5cdFx0XHRcdGNvbW1hbmQ6IENIQVRfT1BFTl9BQ1RJT05fSUQsXG5cdFx0XHRcdHRpdGxlLFxuXHRcdFx0fSwgKCkgPT4gdGhpcy5kb1NldHVwKG9wdGlvbnMsIHdhdGNoKSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGJhZGdlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvU2V0dXAob3B0aW9uczogSUNoYXRTZXR1cENvbnRyb2xsZXJPcHRpb25zLCB3YXRjaDogU3RvcFdhdGNoKTogUHJvbWlzZTxDaGF0U2V0dXBSZXN1bHRWYWx1ZT4ge1xuXHRcdHRoaXMuY29udGV4dC5zdXNwZW5kKCk7ICAvLyByZWR1Y2VzIGZsaWNrZXJcblxuXHRcdGxldCBzdWNjZXNzOiBDaGF0U2V0dXBSZXN1bHRWYWx1ZSA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRsZXQgZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRcdFx0bGV0IHNpZ25JbjogYm9vbGVhbjtcblx0XHRcdGlmIChvcHRpb25zLmZvcmNlU2lnbkluKSB7XG5cdFx0XHRcdHNpZ25JbiA9IHRydWU7IC8vIGZvcmNlZCB0byBzaWduIGluXG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuY29udGV4dC5zdGF0ZS5lbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LlVua25vd24pIHtcblx0XHRcdFx0aWYgKG9wdGlvbnMuZm9yY2VBbm9ueW1vdXMpIHtcblx0XHRcdFx0XHRzaWduSW4gPSBmYWxzZTsgLy8gZm9yY2VkIHRvIGFub255bW91cyB3aXRob3V0IHNpZ24gaW5cblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzaWduSW4gPSB0cnVlOyAvLyBzaWduIGluIHNpbmNlIHdlIGFyZSBzaWduZWQgb3V0XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNpZ25JbiA9IGZhbHNlOyAvLyBhbHJlYWR5IHNpZ25lZCBpblxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoc2lnbkluKSB7XG5cdFx0XHRcdHRoaXMuc2V0U3RlcChDaGF0U2V0dXBTdGVwLlNpZ25pbmdJbik7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuc2lnbkluKG9wdGlvbnMpO1xuXHRcdFx0XHRpZiAoIXJlc3VsdC5kZWZhdWx0QWNjb3VudCkge1xuXHRcdFx0XHRcdGNvbnN0IHByb3ZpZGVyID0gb3B0aW9ucy51c2VTb2NpYWxQcm92aWRlciA/PyAob3B0aW9ucy51c2VFbnRlcnByaXNlUHJvdmlkZXIgPyBkZWZhdWx0Q2hhdC5wcm92aWRlci5lbnRlcnByaXNlLmlkIDogZGVmYXVsdENoYXQucHJvdmlkZXIuZGVmYXVsdC5pZCk7XG5cdFx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8SW5zdGFsbENoYXRFdmVudCwgSW5zdGFsbENoYXRDbGFzc2lmaWNhdGlvbj4oJ2NvbW1hbmRDZW50ZXIuY2hhdEluc3RhbGwnLCB7IGluc3RhbGxSZXN1bHQ6ICdmYWlsZWROb3RTaWduZWRJbicsIGluc3RhbGxEdXJhdGlvbjogd2F0Y2guZWxhcHNlZCgpLCBzaWduVXBFcnJvckNvZGU6IHVuZGVmaW5lZCwgcHJvdmlkZXIgfSk7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gdHJlYXQgYXMgY2FuY2VsbGVkIGJlY2F1c2Ugc2lnbmluZyBpbiBhbHJlYWR5IHRyaWdnZXJzIGFuIGVycm9yIGRpYWxvZ1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZW50aXRsZW1lbnQgPSByZXN1bHQuZW50aXRsZW1lbnQ7XG5cdFx0XHR9XG5cblx0XHRcdC8vIEF3YWl0IEluc3RhbGxcblx0XHRcdHRoaXMuc2V0U3RlcChDaGF0U2V0dXBTdGVwLkluc3RhbGxpbmcpO1xuXHRcdFx0c3VjY2VzcyA9IGF3YWl0IHRoaXMuaW5zdGFsbChlbnRpdGxlbWVudCA/PyB0aGlzLmNvbnRleHQuc3RhdGUuZW50aXRsZW1lbnQsIHdhdGNoLCBvcHRpb25zKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5zZXRTdGVwKENoYXRTZXR1cFN0ZXAuSW5pdGlhbCk7XG5cdFx0XHR0aGlzLmNvbnRleHQucmVzdW1lKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1Y2Nlc3M7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNpZ25JbihvcHRpb25zOiBJQ2hhdFNldHVwQ29udHJvbGxlck9wdGlvbnMpOiBQcm9taXNlPHsgZGVmYXVsdEFjY291bnQ6IElEZWZhdWx0QWNjb3VudCB8IHVuZGVmaW5lZDsgZW50aXRsZW1lbnQ6IENoYXRFbnRpdGxlbWVudCB8IHVuZGVmaW5lZCB9PiB7XG5cdFx0Y29uc3QgYXV0aEV4dGVuc2lvblJlRW5hYmxlZCA9IGF3YWl0IG1heWJlRW5hYmxlQXV0aEV4dGVuc2lvbih0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdGlmIChhdXRoRXh0ZW5zaW9uUmVFbmFibGVkKSB7XG5cdFx0XHRyZWZyZXNoVG9rZW5zKHRoaXMuY29tbWFuZFNlcnZpY2UpO1xuXHRcdH1cblxuXHRcdGxldCBlbnRpdGxlbWVudHM7XG5cdFx0bGV0IGRlZmF1bHRBY2NvdW50O1xuXHRcdGxldCBzaWduSW5FcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdCh7IGRlZmF1bHRBY2NvdW50LCBlbnRpdGxlbWVudHMgfSA9IGF3YWl0IHRoaXMucmVxdWVzdHMuc2lnbkluKG9wdGlvbnMpKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtjaGF0IHNldHVwXSBzaWduSW46IGVycm9yICR7ZX1gKTtcblx0XHRcdHNpZ25JbkVycm9yID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZSA6IG5ldyBFcnJvcihTdHJpbmcoZSkpO1xuXHRcdH1cblxuXHRcdGlmICghZGVmYXVsdEFjY291bnQgJiYgIXRoaXMubGlmZWN5Y2xlU2VydmljZS53aWxsU2h1dGRvd24pIHtcblx0XHRcdGNvbnN0IHsgY29uZmlybWVkIH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdHR5cGU6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndW5rbm93blNpZ25JbkVycm9yJywgXCJGYWlsZWQgdG8gc2lnbiBpbiB0byB7MH0uIFdvdWxkIHlvdSBsaWtlIHRvIHRyeSBhZ2Fpbj9cIiwgdGhpcy5kZWZhdWx0QWNjb3VudFNlcnZpY2UuZ2V0RGVmYXVsdEFjY291bnRBdXRoZW50aWNhdGlvblByb3ZpZGVyKCkubmFtZSksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3Vua25vd25TaWduSW5FcnJvckRldGFpbCcsIFwiWW91IG11c3QgYmUgc2lnbmVkIGluIHRvIHVzZSBBSSBmZWF0dXJlcy5cIiksXG5cdFx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdyZXRyeScsIFwiUmV0cnlcIilcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoY29uZmlybWVkKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNpZ25JbihvcHRpb25zKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHNpZ25JbkVycm9yKSB7XG5cdFx0XHR0aHJvdyBuZXcgQ2hhdFNldHVwRXJyb3Ioc2lnbkluRXJyb3IsIHRydWUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGRlZmF1bHRBY2NvdW50LCBlbnRpdGxlbWVudDogZW50aXRsZW1lbnRzPy5lbnRpdGxlbWVudCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbnN0YWxsKGVudGl0bGVtZW50OiBDaGF0RW50aXRsZW1lbnQsIHdhdGNoOiBTdG9wV2F0Y2gsIG9wdGlvbnM6IElDaGF0U2V0dXBDb250cm9sbGVyT3B0aW9ucyk6IFByb21pc2U8Q2hhdFNldHVwUmVzdWx0VmFsdWU+IHtcblx0XHRjb25zdCB3YXNSdW5uaW5nID0gdGhpcy5jb250ZXh0LnN0YXRlLmNvbXBsZXRlZCAmJiAhdGhpcy5jb250ZXh0LnN0YXRlLmRpc2FibGVkO1xuXHRcdGxldCBzaWduVXBSZXN1bHQ6IGJvb2xlYW4gfCB7IGVycm9yQ29kZTogbnVtYmVyIH0gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRsZXQgcHJvdmlkZXI6IHN0cmluZztcblx0XHRpZiAob3B0aW9ucy5mb3JjZUFub255bW91cyAmJiBlbnRpdGxlbWVudCA9PT0gQ2hhdEVudGl0bGVtZW50LlVua25vd24pIHtcblx0XHRcdHByb3ZpZGVyID0gJ2Fub255bW91cyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHByb3ZpZGVyID0gb3B0aW9ucy51c2VTb2NpYWxQcm92aWRlciA/PyAob3B0aW9ucy51c2VFbnRlcnByaXNlUHJvdmlkZXIgPyBkZWZhdWx0Q2hhdC5wcm92aWRlci5lbnRlcnByaXNlLmlkIDogZGVmYXVsdENoYXQucHJvdmlkZXIuZGVmYXVsdC5pZCk7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGlmIChcblx0XHRcdFx0IW9wdGlvbnMuZm9yY2VBbm9ueW1vdXMgJiZcdFx0XHRcdFx0XHQvLyBVc2VyIGlzIG5vdCBhc2tpbmcgZm9yIGFub255bW91cyBhY2Nlc3Ncblx0XHRcdFx0ZW50aXRsZW1lbnQgIT09IENoYXRFbnRpdGxlbWVudC5GcmVlICYmXHRcdFx0Ly8gVXNlciBpcyBub3Qgc2lnbmVkIHVwIHRvIENvcGlsb3QgRnJlZVxuXHRcdFx0XHQhaXNQcm9Vc2VyKGVudGl0bGVtZW50KSAmJlx0XHRcdFx0XHRcdC8vIFVzZXIgaXMgbm90IHNpZ25lZCB1cCBmb3IgYSBDb3BpbG90IHN1YnNjcmlwdGlvblxuXHRcdFx0XHRlbnRpdGxlbWVudCAhPT0gQ2hhdEVudGl0bGVtZW50LlVuYXZhaWxhYmxlXHRcdC8vIFVzZXIgaXMgZWxpZ2libGUgZm9yIENvcGlsb3QgRnJlZVxuXHRcdFx0KSB7XG5cdFx0XHRcdHNpZ25VcFJlc3VsdCA9IGF3YWl0IHRoaXMucmVxdWVzdHMuc2lnblVwRnJlZSgpO1xuXG5cdFx0XHRcdGlmIChpc1VuZGVmaW5lZChzaWduVXBSZXN1bHQpKSB7XG5cdFx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8SW5zdGFsbENoYXRFdmVudCwgSW5zdGFsbENoYXRDbGFzc2lmaWNhdGlvbj4oJ2NvbW1hbmRDZW50ZXIuY2hhdEluc3RhbGwnLCB7IGluc3RhbGxSZXN1bHQ6ICdmYWlsZWROb1Nlc3Npb24nLCBpbnN0YWxsRHVyYXRpb246IHdhdGNoLmVsYXBzZWQoKSwgc2lnblVwRXJyb3JDb2RlOiB1bmRlZmluZWQsIHByb3ZpZGVyIH0pO1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gdW5leHBlY3RlZFxuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHR5cGVvZiBzaWduVXBSZXN1bHQgIT09ICdib29sZWFuJyAvKiBlcnJvciAqLykge1xuXHRcdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEluc3RhbGxDaGF0RXZlbnQsIEluc3RhbGxDaGF0Q2xhc3NpZmljYXRpb24+KCdjb21tYW5kQ2VudGVyLmNoYXRJbnN0YWxsJywgeyBpbnN0YWxsUmVzdWx0OiAnZmFpbGVkU2lnblVwJywgaW5zdGFsbER1cmF0aW9uOiB3YXRjaC5lbGFwc2VkKCksIHNpZ25VcEVycm9yQ29kZTogc2lnblVwUmVzdWx0LmVycm9yQ29kZSwgcHJvdmlkZXIgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy5kb0luc3RhbGxXaXRoUmV0cnkoKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbY2hhdCBzZXR1cF0gaW5zdGFsbDogZXJyb3IgJHtlcnJvcn1gKTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEluc3RhbGxDaGF0RXZlbnQsIEluc3RhbGxDaGF0Q2xhc3NpZmljYXRpb24+KCdjb21tYW5kQ2VudGVyLmNoYXRJbnN0YWxsJywgeyBpbnN0YWxsUmVzdWx0OiBpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSA/ICdjYW5jZWxsZWQnIDogJ2ZhaWxlZEluc3RhbGwnLCBpbnN0YWxsRHVyYXRpb246IHdhdGNoLmVsYXBzZWQoKSwgc2lnblVwRXJyb3JDb2RlOiB1bmRlZmluZWQsIHByb3ZpZGVyIH0pO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2Ygc2lnblVwUmVzdWx0ID09PSAnYm9vbGVhbicgLyogbm90IGFuIGVycm9yIGNhc2UgKi8gfHwgdHlwZW9mIHNpZ25VcFJlc3VsdCA9PT0gJ3VuZGVmaW5lZCcgLyogYWxyZWFkeSBzaWduZWQgdXAgKi8pIHtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEluc3RhbGxDaGF0RXZlbnQsIEluc3RhbGxDaGF0Q2xhc3NpZmljYXRpb24+KCdjb21tYW5kQ2VudGVyLmNoYXRJbnN0YWxsJywgeyBpbnN0YWxsUmVzdWx0OiB3YXNSdW5uaW5nICYmICFzaWduVXBSZXN1bHQgPyAnYWxyZWFkeUluc3RhbGxlZCcgOiAnaW5zdGFsbGVkJywgaW5zdGFsbER1cmF0aW9uOiB3YXRjaC5lbGFwc2VkKCksIHNpZ25VcEVycm9yQ29kZTogdW5kZWZpbmVkLCBwcm92aWRlciB9KTtcblx0XHR9XG5cblx0XHRpZiAod2FzUnVubmluZykge1xuXHRcdFx0Ly8gV2UgYWx3YXlzIHRyaWdnZXIgcmVmcmVzaCBvZiB0b2tlbnMgdG8gaGVscCB0aGUgdXNlclxuXHRcdFx0Ly8gZ2V0IG91dCBvZiBhdXRoZW50aWNhdGlvbiBpc3N1ZXMgdGhhdCBjYW4gaGFwcGVuIHdoZW5cblx0XHRcdC8vIGZvciBleGFtcGxlIHRoZSBzaWduLXVwIHJhbiBhZnRlciB0aGUgZXh0ZW5zaW9uIHRyaWVkXG5cdFx0XHQvLyB0byB1c2UgdGhlIGF1dGhlbnRpY2F0aW9uIGluZm9ybWF0aW9uIHRvIG1pbnQgYSB0b2tlblxuXHRcdFx0cmVmcmVzaFRva2Vucyh0aGlzLmNvbW1hbmRTZXJ2aWNlKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9JbnN0YWxsV2l0aFJldHJ5KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBlcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuZG9JbnN0YWxsKCk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbY2hhdCBzZXR1cF0gaW5zdGFsbDogZXJyb3IgJHtlcnJvcn1gKTtcblx0XHRcdGVycm9yID0gZTtcblx0XHR9XG5cblx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdGlmICghdGhpcy5saWZlY3ljbGVTZXJ2aWNlLndpbGxTaHV0ZG93bikge1xuXHRcdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdHR5cGU6IFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd1bmtub3duU2V0dXBFcnJvcicsIFwiQW4gZXJyb3Igb2NjdXJyZWQgd2hpbGUgc2V0dGluZyB1cCBjaGF0LiBXb3VsZCB5b3UgbGlrZSB0byB0cnkgYWdhaW4/XCIpLFxuXHRcdFx0XHRcdGRldGFpbDogZXJyb3IgJiYgIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpID8gdG9FcnJvck1lc3NhZ2UoZXJyb3IpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKCdyZXRyeScsIFwiUmV0cnlcIilcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKGNvbmZpcm1lZCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmRvSW5zdGFsbFdpdGhSZXRyeSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9JbnN0YWxsKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaW5zdGFsbChkZWZhdWx0Q2hhdC5jaGF0RXh0ZW5zaW9uSWQsIHtcblx0XHRcdGVuYWJsZTogdHJ1ZSxcblx0XHRcdGlzQXBwbGljYXRpb25TY29wZWQ6IHRydWUsIFx0Ly8gaW5zdGFsbCBpbnRvIGFsbCBwcm9maWxlc1xuXHRcdFx0aXNNYWNoaW5lU2NvcGVkOiBmYWxzZSxcdFx0Ly8gZG8gbm90IGFzayB0byBzeW5jXG5cdFx0XHRpbnN0YWxsRXZlcnl3aGVyZTogdHJ1ZSxcdC8vIGluc3RhbGwgaW4gbG9jYWwgYW5kIHJlbW90ZVxuXHRcdFx0aW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgIT09ICdzdGFibGUnXG5cdFx0fSwgQ2hhdFZpZXdJZCk7XG5cdH1cblxuXHRhc3luYyBzZXR1cFdpdGhQcm92aWRlcihvcHRpb25zOiBJQ2hhdFNldHVwQ29udHJvbGxlck9wdGlvbnMpOiBQcm9taXNlPENoYXRTZXR1cFJlc3VsdFZhbHVlPiB7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblx0XHRyZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0J2lkJzogJ2NvcGlsb3Quc2V0dXAnLFxuXHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFx0XHRbZGVmYXVsdENoYXQuY29tcGxldGlvbnNBZHZhbmNlZFNldHRpbmddOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHQncHJvcGVydGllcyc6IHtcblx0XHRcdFx0XHRcdCdhdXRoUHJvdmlkZXInOiB7XG5cdFx0XHRcdFx0XHRcdCd0eXBlJzogJ3N0cmluZydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdFtkZWZhdWx0Q2hhdC5wcm92aWRlclVyaVNldHRpbmddOiB7XG5cdFx0XHRcdFx0J3R5cGUnOiAnc3RyaW5nJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAob3B0aW9ucy51c2VFbnRlcnByaXNlUHJvdmlkZXIpIHtcblx0XHRcdGNvbnN0IHN1Y2Nlc3MgPSBhd2FpdCB0aGlzLmhhbmRsZUVudGVycHJpc2VJbnN0YW5jZSgpO1xuXHRcdFx0aWYgKCFzdWNjZXNzKSB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEluc3RhbGxDaGF0RXZlbnQsIEluc3RhbGxDaGF0Q2xhc3NpZmljYXRpb24+KCdjb21tYW5kQ2VudGVyLmNoYXRJbnN0YWxsJywgeyBpbnN0YWxsUmVzdWx0OiAnZmFpbGVkRW50ZXJwcmlzZVNldHVwJywgaW5zdGFsbER1cmF0aW9uOiAwLCBzaWduVXBFcnJvckNvZGU6IHVuZGVmaW5lZCwgcHJvdmlkZXI6IHVuZGVmaW5lZCB9KTtcblx0XHRcdFx0cmV0dXJuIHN1Y2Nlc3M7IC8vIG5vdCBwcm9wZXJseSBjb25maWd1cmVkLCBhYm9ydFxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBleGlzdGluZ0FkdmFuY2VkU2V0dGluZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdChkZWZhdWx0Q2hhdC5jb21wbGV0aW9uc0FkdmFuY2VkU2V0dGluZykudXNlcj8udmFsdWU7XG5cdFx0aWYgKCFpc09iamVjdChleGlzdGluZ0FkdmFuY2VkU2V0dGluZykpIHtcblx0XHRcdGV4aXN0aW5nQWR2YW5jZWRTZXR0aW5nID0ge307XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMudXNlRW50ZXJwcmlzZVByb3ZpZGVyKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKGAke2RlZmF1bHRDaGF0LmNvbXBsZXRpb25zQWR2YW5jZWRTZXR0aW5nfWAsIHtcblx0XHRcdFx0Li4uZXhpc3RpbmdBZHZhbmNlZFNldHRpbmcsXG5cdFx0XHRcdCdhdXRoUHJvdmlkZXInOiBkZWZhdWx0Q2hhdC5wcm92aWRlci5lbnRlcnByaXNlLmlkXG5cdFx0XHR9LCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKGAke2RlZmF1bHRDaGF0LmNvbXBsZXRpb25zQWR2YW5jZWRTZXR0aW5nfWAsIE9iamVjdC5rZXlzKGV4aXN0aW5nQWR2YW5jZWRTZXR0aW5nKS5sZW5ndGggPiAwID8ge1xuXHRcdFx0XHQuLi5leGlzdGluZ0FkdmFuY2VkU2V0dGluZyxcblx0XHRcdFx0J2F1dGhQcm92aWRlcic6IHVuZGVmaW5lZFxuXHRcdFx0fSA6IHVuZGVmaW5lZCwgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5zZXR1cCh7IC4uLm9wdGlvbnMsIGZvcmNlU2lnbkluOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVFbnRlcnByaXNlSW5zdGFuY2UoKTogUHJvbWlzZTxDaGF0U2V0dXBSZXN1bHRWYWx1ZT4ge1xuXHRcdGNvbnN0IGRvbWFpblJlZ0V4ID0gL15bYS16QS1aXFwtX10rJC87XG5cdFx0Y29uc3QgZnVsbFVyaVJlZ0V4ID0gL14oaHR0cHM6XFwvXFwvKT8oW2EtekEtWjAtOS1dK1xcLikqW2EtekEtWjAtOS1dK1xcLmdoZVxcLmNvbVxcLz8kLztcblxuXHRcdGNvbnN0IHVyaSA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihkZWZhdWx0Q2hhdC5wcm92aWRlclVyaVNldHRpbmcpO1xuXHRcdGlmICh0eXBlb2YgdXJpID09PSAnc3RyaW5nJyAmJiBmdWxsVXJpUmVnRXgudGVzdCh1cmkpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gYWxyZWFkeSBzZXR1cCB3aXRoIGEgdmFsaWQgVVJJXG5cdFx0fVxuXG5cdFx0bGV0IGlzU2luZ2xlV29yZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoe1xuXHRcdFx0cHJvbXB0OiBsb2NhbGl6ZSgnZW50ZXJwcmlzZUluc3RhbmNlJywgXCJXaGF0IGlzIHlvdXIgezB9IGluc3RhbmNlP1wiLCBkZWZhdWx0Q2hhdC5wcm92aWRlci5lbnRlcnByaXNlLm5hbWUpLFxuXHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdlbnRlcnByaXNlSW5zdGFuY2VQbGFjZWhvbGRlcicsICdpLmUuIFwib2N0b2NhdFwiIG9yIFwiaHR0cHM6Ly9vY3RvY2F0LmdoZS5jb21cIi4uLicpLFxuXHRcdFx0aWdub3JlRm9jdXNMb3N0OiB0cnVlLFxuXHRcdFx0dmFsdWU6IHVyaSxcblx0XHRcdHZhbGlkYXRlSW5wdXQ6IGFzeW5jIHZhbHVlID0+IHtcblx0XHRcdFx0aXNTaW5nbGVXb3JkID0gZmFsc2U7XG5cdFx0XHRcdGlmICghdmFsdWUpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGRvbWFpblJlZ0V4LnRlc3QodmFsdWUpKSB7XG5cdFx0XHRcdFx0aXNTaW5nbGVXb3JkID0gdHJ1ZTtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Y29udGVudDogbG9jYWxpemUoJ3dpbGxSZXNvbHZlVG8nLCBcIldpbGwgcmVzb2x2ZSB0byB7MH1cIiwgYGh0dHBzOi8vJHt2YWx1ZX0uZ2hlLmNvbWApLFxuXHRcdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm9cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9IGlmICghZnVsbFVyaVJlZ0V4LnRlc3QodmFsdWUpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IGxvY2FsaXplKCdpbnZhbGlkRW50ZXJwcmlzZUluc3RhbmNlJywgJ1lvdSBtdXN0IGVudGVyIGEgdmFsaWQgezB9IGluc3RhbmNlIChpLmUuIFwib2N0b2NhdFwiIG9yIFwiaHR0cHM6Ly9vY3RvY2F0LmdoZS5jb21cIiknLCBkZWZhdWx0Q2hhdC5wcm92aWRlci5lbnRlcnByaXNlLm5hbWUpLFxuXHRcdFx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkVycm9yXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gY2FuY2VsZWRcblx0XHR9XG5cblx0XHRsZXQgcmVzb2x2ZWRVcmkgPSByZXN1bHQ7XG5cdFx0aWYgKGlzU2luZ2xlV29yZCkge1xuXHRcdFx0cmVzb2x2ZWRVcmkgPSBgaHR0cHM6Ly8ke3Jlc29sdmVkVXJpfS5naGUuY29tYDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZFVyaSA9IHJlc3VsdC50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0Y29uc3QgaGFzSHR0cHMgPSBub3JtYWxpemVkVXJpLnN0YXJ0c1dpdGgoJ2h0dHBzOi8vJyk7XG5cdFx0XHRpZiAoIWhhc0h0dHBzKSB7XG5cdFx0XHRcdHJlc29sdmVkVXJpID0gYGh0dHBzOi8vJHtyZXN1bHR9YDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKGRlZmF1bHRDaGF0LnByb3ZpZGVyVXJpU2V0dGluZywgcmVzb2x2ZWRVcmksIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxrQkFBa0I7QUFDM0IsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsVUFBVSxtQkFBbUI7QUFDdEMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMsY0FBYywrQkFBdUQ7QUFDOUUsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUI7QUFDNUIsT0FBTyxhQUFhO0FBQ3BCLFNBQVMsa0JBQWtCLHdCQUF3QjtBQUNuRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQixxQkFB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
