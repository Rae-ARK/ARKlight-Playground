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
import "./media/extensionActions.css";
import { localize, localize2 } from "../../../../nls.js";
import { Action, Separator, SubmenuAction } from "../../../../base/common/actions.js";
import { Delayer, Promises, Throttler } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import * as json from "../../../../base/common/json.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { disposeIfDisposable } from "../../../../base/common/lifecycle.js";
import { ExtensionState, IExtensionsWorkbenchService, TOGGLE_IGNORE_EXTENSION_ACTION_ID, SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID, THEME_ACTIONS_GROUP, INSTALL_ACTIONS_GROUP, UPDATE_ACTIONS_GROUP, ExtensionEditorTab, ExtensionRuntimeActionType, AutoUpdateConfigurationKey } from "../common/extensions.js";
import { ExtensionsConfigurationInitialContent } from "../common/extensionsFileTemplate.js";
import { IExtensionGalleryService, InstallOperation, ExtensionManagementErrorCode, IAllowedExtensionsService, shouldRequireRepositorySignatureFor } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IWorkbenchExtensionEnablementService, EnablementState, IExtensionManagementServerService, IWorkbenchExtensionManagementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { ExtensionRecommendationReason, IExtensionIgnoredRecommendationsService, IExtensionRecommendationsService } from "../../../services/extensionRecommendations/common/extensionRecommendations.js";
import { areSameExtensions, getExtensionId } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { ExtensionType, ExtensionIdentifier, isLanguagePackExtension, getWorkspaceSupportTypeMessage, TargetPlatform, isApplicationScopedExtension } from "../../../../platform/extensions/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IExtensionService, toExtension, toExtensionDescription } from "../../../services/extensions/common/extensions.js";
import { URI } from "../../../../base/common/uri.js";
import { CommandsRegistry, ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ChatAIDisabledSettingId } from "../../../../platform/chat/common/chatSettings.js";
import { registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { buttonBackground, buttonForeground, buttonHoverBackground, buttonSecondaryBackground, buttonSecondaryForeground, buttonSecondaryHoverBackground, registerColor, editorWarningForeground, editorInfoForeground, editorErrorForeground, buttonSeparator, buttonSecondaryBorder } from "../../../../platform/theme/common/colorRegistry.js";
import { IJSONEditingService } from "../../../services/configuration/common/jsonEditing.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { MenuId, IMenuService } from "../../../../platform/actions/common/actions.js";
import { PICK_WORKSPACE_FOLDER_COMMAND_ID } from "../../../browser/actions/workspaceCommands.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { IWorkbenchThemeService } from "../../../services/themes/common/workbenchThemeService.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { EXTENSIONS_CONFIG } from "../../../services/extensionRecommendations/common/workspaceExtensionsConfig.js";
import { getErrorMessage, isCancellationError } from "../../../../base/common/errors.js";
import { IUserDataSyncEnablementService } from "../../../../platform/userDataSync/common/userDataSync.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { errorIcon, infoIcon, manageExtensionIcon, syncEnabledIcon, syncIgnoredIcon, trustIcon, warningIcon } from "./extensionsIcons.js";
import { isIOS, isWeb, language } from "../../../../base/common/platform.js";
import { IExtensionManifestPropertiesService } from "../../../services/extensions/common/extensionManifestPropertiesService.js";
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { isVirtualWorkspace } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { createCommandUri, escapeMarkdownSyntaxTokens, MarkdownString } from "../../../../base/common/htmlContent.js";
import { fromNow } from "../../../../base/common/date.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { getLocale } from "../../../../platform/languagePacks/common/languagePacks.js";
import { ILocaleService } from "../../../services/localization/common/locale.js";
import { isString } from "../../../../base/common/types.js";
import { showWindowLogActionId } from "../../../services/log/common/logConstants.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { Extensions, IExtensionFeaturesManagementService } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IUpdateService } from "../../../../platform/update/common/update.js";
import { ActionWithDropdownActionViewItem } from "../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { IAuthenticationUsageService } from "../../../services/authentication/browser/authenticationUsageService.js";
import { IExtensionGalleryManifestService } from "../../../../platform/extensionManagement/common/extensionGalleryManifest.js";
import { IWorkbenchIssueService } from "../../issue/common/issue.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { getWorkbenchMenuMotionContextMenuOptions } from "../../../browser/actions/menuMotion.js";
let PromptExtensionInstallFailureAction = class extends Action {
  constructor(extension, options, version, installOperation, error, productService, openerService, notificationService, dialogService, commandService, logService, extensionManagementServerService, instantiationService, galleryService, extensionManifestPropertiesService, workbenchIssueService) {
    super("extension.promptExtensionInstallFailure");
    this.extension = extension;
    this.options = options;
    this.version = version;
    this.installOperation = installOperation;
    this.error = error;
    this.productService = productService;
    this.openerService = openerService;
    this.notificationService = notificationService;
    this.dialogService = dialogService;
    this.commandService = commandService;
    this.logService = logService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.instantiationService = instantiationService;
    this.galleryService = galleryService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.workbenchIssueService = workbenchIssueService;
  }
  async run() {
    if (isCancellationError(this.error)) {
      return;
    }
    this.logService.error(this.error);
    if (this.error.name === ExtensionManagementErrorCode.Unsupported) {
      const productName = isWeb ? localize("VS Code for Web", "{0} for the Web", this.productService.nameLong) : this.productService.nameLong;
      const message2 = localize("cannot be installed", "The '{0}' extension is not available in {1}. Click 'More Information' to learn more.", this.extension.displayName || this.extension.identifier.id, productName);
      const { confirmed } = await this.dialogService.confirm({
        type: Severity.Info,
        message: message2,
        primaryButton: localize({ key: "more information", comment: ["&& denotes a mnemonic"] }, "&&More Information"),
        cancelButton: localize("close", "Close")
      });
      if (confirmed) {
        this.openerService.open(isWeb ? URI.parse("https://aka.ms/vscode-web-extensions-guide") : URI.parse("https://aka.ms/vscode-remote"));
      }
      return;
    }
    if (ExtensionManagementErrorCode.ReleaseVersionNotFound === this.error.name) {
      await this.dialogService.prompt({
        type: "error",
        message: getErrorMessage(this.error),
        buttons: [{
          label: localize("install prerelease", "Install Pre-Release"),
          run: () => {
            const installAction = this.instantiationService.createInstance(InstallAction, { installPreReleaseVersion: true });
            installAction.extension = this.extension;
            return installAction.run();
          }
        }],
        cancelButton: localize("cancel", "Cancel")
      });
      return;
    }
    if ([ExtensionManagementErrorCode.Incompatible, ExtensionManagementErrorCode.IncompatibleApi, ExtensionManagementErrorCode.IncompatibleTargetPlatform, ExtensionManagementErrorCode.Malicious, ExtensionManagementErrorCode.Deprecated].includes(this.error.name)) {
      await this.dialogService.info(getErrorMessage(this.error));
      return;
    }
    if (ExtensionManagementErrorCode.PackageNotSigned === this.error.name) {
      await this.dialogService.prompt({
        type: "error",
        message: localize("not signed", "'{0}' is an extension from an unknown source. Are you sure you want to install?", this.extension.displayName),
        detail: getErrorMessage(this.error),
        buttons: [{
          label: localize("install anyway", "Install Anyway"),
          run: () => {
            const installAction = this.instantiationService.createInstance(InstallAction, { ...this.options, donotVerifySignature: true });
            installAction.extension = this.extension;
            return installAction.run();
          }
        }],
        cancelButton: true
      });
      return;
    }
    if (ExtensionManagementErrorCode.SignatureVerificationFailed === this.error.name) {
      await this.dialogService.prompt({
        type: "error",
        message: localize("verification failed", "Cannot install '{0}' extension because {1} cannot verify the extension signature", this.extension.displayName, this.productService.nameLong),
        detail: getErrorMessage(this.error),
        buttons: [{
          label: localize("learn more", "Learn More"),
          run: () => this.openerService.open("https://code.visualstudio.com/docs/editor/extension-marketplace#_the-extension-signature-cannot-be-verified-by-vs-code")
        }, {
          label: localize("install donot verify", "Install Anyway (Don't Verify Signature)"),
          run: () => {
            const installAction = this.instantiationService.createInstance(InstallAction, { ...this.options, donotVerifySignature: true });
            installAction.extension = this.extension;
            return installAction.run();
          }
        }],
        cancelButton: true
      });
      return;
    }
    if (ExtensionManagementErrorCode.SignatureVerificationInternal === this.error.name) {
      await this.dialogService.prompt({
        type: "error",
        message: localize("verification failed", "Cannot install '{0}' extension because {1} cannot verify the extension signature", this.extension.displayName, this.productService.nameLong),
        detail: getErrorMessage(this.error),
        buttons: [{
          label: localize("learn more", "Learn More"),
          run: () => this.openerService.open("https://code.visualstudio.com/docs/editor/extension-marketplace#_the-extension-signature-cannot-be-verified-by-vs-code")
        }, {
          label: localize("report issue", "Report Issue"),
          run: () => this.workbenchIssueService.openReporter({
            issueTitle: localize("report issue title", "Extension Signature Verification Failed: {0}", this.extension.displayName),
            issueBody: localize("report issue body", "Please include following log `F1 > Open View... > Shared` below.\n\n")
          })
        }, {
          label: localize("install donot verify", "Install Anyway (Don't Verify Signature)"),
          run: () => {
            const installAction = this.instantiationService.createInstance(InstallAction, { ...this.options, donotVerifySignature: true });
            installAction.extension = this.extension;
            return installAction.run();
          }
        }],
        cancelButton: true
      });
      return;
    }
    const operationMessage = this.installOperation === InstallOperation.Update ? localize("update operation", "Error while updating '{0}' extension.", this.extension.displayName || this.extension.identifier.id) : localize("install operation", "Error while installing '{0}' extension.", this.extension.displayName || this.extension.identifier.id);
    let additionalMessage;
    const promptChoices = [];
    const downloadUrl = await this.getDownloadUrl();
    if (downloadUrl) {
      additionalMessage = localize("check logs", "Please check the [log]({0}) for more details.", createCommandUri(showWindowLogActionId).toString());
      promptChoices.push({
        label: localize("download", "Try Downloading Manually..."),
        run: () => this.openerService.open(downloadUrl).then(() => {
          this.notificationService.prompt(
            Severity.Info,
            localize("install vsix", "Once downloaded, please manually install the downloaded VSIX of '{0}'.", this.extension.identifier.id),
            [{
              label: localize("installVSIX", "Install from VSIX..."),
              run: () => this.commandService.executeCommand(SELECT_INSTALL_VSIX_EXTENSION_COMMAND_ID)
            }]
          );
        })
      });
    }
    const message = `${operationMessage}${additionalMessage ? ` ${additionalMessage}` : ""}`;
    this.notificationService.prompt(Severity.Error, message, promptChoices);
  }
  async getDownloadUrl() {
    if (isIOS) {
      return void 0;
    }
    if (!this.extension.gallery) {
      return void 0;
    }
    if (!this.extensionManagementServerService.localExtensionManagementServer && !this.extensionManagementServerService.remoteExtensionManagementServer) {
      return void 0;
    }
    let targetPlatform = this.extension.gallery.properties.targetPlatform;
    if (targetPlatform !== TargetPlatform.UNIVERSAL && targetPlatform !== TargetPlatform.UNDEFINED && this.extensionManagementServerService.remoteExtensionManagementServer) {
      try {
        const manifest = await this.galleryService.getManifest(this.extension.gallery, CancellationToken.None);
        if (manifest && this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(manifest)) {
          targetPlatform = await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getTargetPlatform();
        }
      } catch (error) {
        this.logService.error(error);
        return void 0;
      }
    }
    if (targetPlatform === TargetPlatform.UNKNOWN) {
      return void 0;
    }
    const [extension] = await this.galleryService.getExtensions([{
      ...this.extension.identifier,
      version: this.version
    }], {
      targetPlatform
    }, CancellationToken.None);
    if (!extension) {
      return void 0;
    }
    return URI.parse(extension.assets.download.uri);
  }
};
PromptExtensionInstallFailureAction = __decorateClass([
  __decorateParam(5, IProductService),
  __decorateParam(6, IOpenerService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, IDialogService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, ILogService),
  __decorateParam(11, IExtensionManagementServerService),
  __decorateParam(12, IInstantiationService),
  __decorateParam(13, IExtensionGalleryService),
  __decorateParam(14, IExtensionManifestPropertiesService),
  __decorateParam(15, IWorkbenchIssueService)
], PromptExtensionInstallFailureAction);
const _ExtensionAction = class _ExtensionAction extends Action {
  constructor() {
    super(...arguments);
    this._onDidChange = this._register(new Emitter());
    this._extension = null;
    this._hidden = false;
    this.hideOnDisabled = true;
  }
  get onDidChange() {
    return this._onDidChange.event;
  }
  get extension() {
    return this._extension;
  }
  set extension(extension) {
    this._extension = extension;
    this.update();
  }
  get hidden() {
    return this._hidden;
  }
  set hidden(hidden) {
    if (this._hidden !== hidden) {
      this._hidden = hidden;
      this._onDidChange.fire({ hidden });
    }
  }
  _setEnabled(value) {
    super._setEnabled(value);
    if (this.hideOnDisabled) {
      this.hidden = !value;
    }
  }
};
_ExtensionAction.EXTENSION_ACTION_CLASS = "extension-action";
_ExtensionAction.TEXT_ACTION_CLASS = `${_ExtensionAction.EXTENSION_ACTION_CLASS} text`;
_ExtensionAction.LABEL_ACTION_CLASS = `${_ExtensionAction.EXTENSION_ACTION_CLASS} label`;
_ExtensionAction.ICON_ACTION_CLASS = `${_ExtensionAction.EXTENSION_ACTION_CLASS} icon`;
let ExtensionAction = _ExtensionAction;
class ButtonWithDropDownExtensionAction extends ExtensionAction {
  constructor(id, clazz, actionsGroups) {
    clazz = `${clazz} action-dropdown`;
    super(id, void 0, clazz);
    this.actionsGroups = actionsGroups;
    this.menuActionClassNames = [];
    this._menuActions = [];
    this.menuActionClassNames = clazz.split(" ");
    this.hideOnDisabled = false;
    this.extensionActions = actionsGroups.flat();
    this.update();
    this._register(Event.any(...this.extensionActions.map((a) => a.onDidChange))(() => this.update(true)));
    this.extensionActions.forEach((a) => this._register(a));
  }
  get menuActions() {
    return [...this._menuActions];
  }
  get extension() {
    return super.extension;
  }
  set extension(extension) {
    this.extensionActions.forEach((a) => a.extension = extension);
    super.extension = extension;
  }
  update(donotUpdateActions) {
    if (!donotUpdateActions) {
      this.extensionActions.forEach((a) => a.update());
    }
    const actionsGroups = this.actionsGroups.map((actionsGroup) => actionsGroup.filter((a) => !a.hidden));
    let actions = [];
    for (const visibleActions of actionsGroups) {
      if (visibleActions.length) {
        actions = [...actions, ...visibleActions, new Separator()];
      }
    }
    actions = actions.length ? actions.slice(0, actions.length - 1) : actions;
    this.primaryAction = actions[0];
    this._menuActions = actions.length > 1 ? actions : [];
    this._onDidChange.fire({ menuActions: this._menuActions });
    if (this.primaryAction) {
      this.hidden = false;
      this.enabled = this.primaryAction.enabled;
      this.label = this.getLabel(this.primaryAction);
      this.tooltip = this.primaryAction.tooltip;
    } else {
      this.hidden = true;
      this.enabled = false;
    }
  }
  async run() {
    if (this.enabled) {
      await this.primaryAction?.run();
    }
  }
  getLabel(action) {
    return action.label;
  }
}
class ButtonWithDropdownExtensionActionViewItem extends ActionWithDropdownActionViewItem {
  constructor(action, options, contextMenuProvider) {
    super(null, action, options, contextMenuProvider);
    this._register(action.onDidChange((e) => {
      if (e.hidden !== void 0 || e.menuActions !== void 0) {
        this.updateClass();
      }
    }));
  }
  render(container) {
    super.render(container);
    this.updateClass();
  }
  updateClass() {
    super.updateClass();
    if (this.element && this.dropdownMenuActionViewItem?.element) {
      this.element.classList.toggle("hide", this._action.hidden);
      const isMenuEmpty = this._action.menuActions.length === 0;
      this.element.classList.toggle("empty", isMenuEmpty);
      this.dropdownMenuActionViewItem.element.classList.toggle("hide", isMenuEmpty);
    }
  }
}
let InstallAction = class extends ExtensionAction {
  constructor(options, extensionsWorkbenchService, instantiationService, runtimeExtensionService, workbenchThemeService, labelService, dialogService, preferencesService, telemetryService, contextService, allowedExtensionsService, extensionGalleryManifestService) {
    super("extensions.install", localize("install", "Install"), InstallAction.CLASS, false);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.instantiationService = instantiationService;
    this.runtimeExtensionService = runtimeExtensionService;
    this.workbenchThemeService = workbenchThemeService;
    this.labelService = labelService;
    this.dialogService = dialogService;
    this.preferencesService = preferencesService;
    this.telemetryService = telemetryService;
    this.contextService = contextService;
    this.allowedExtensionsService = allowedExtensionsService;
    this.extensionGalleryManifestService = extensionGalleryManifestService;
    this._manifest = null;
    this.updateThrottler = this._register(new Throttler());
    this.hideOnDisabled = false;
    this.options = { isMachineScoped: false, ...options };
    this.update();
    this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this.update()));
    this._register(this.labelService.onDidChangeFormatters(() => this.updateLabel(), this));
  }
  set manifest(manifest) {
    this._manifest = manifest;
    this.updateLabel();
  }
  update() {
    this.updateThrottler.queue(() => this.computeAndUpdateEnablement());
  }
  async computeAndUpdateEnablement() {
    this.enabled = false;
    this.class = InstallAction.HIDE;
    this.hidden = true;
    if (!this.extension) {
      return;
    }
    if (this.extension.isBuiltin) {
      return;
    }
    if (this.extensionsWorkbenchService.canSetLanguage(this.extension)) {
      return;
    }
    if (this.extension.state !== ExtensionState.Uninstalled) {
      return;
    }
    if (this.options.installPreReleaseVersion && (!this.extension.hasPreReleaseVersion || this.allowedExtensionsService.isAllowed({ id: this.extension.identifier.id, publisherDisplayName: this.extension.publisherDisplayName, prerelease: true }) !== true)) {
      return;
    }
    if (!this.options.installPreReleaseVersion && !this.extension.hasReleaseVersion) {
      return;
    }
    this.hidden = false;
    this.class = InstallAction.CLASS;
    if (await this.extensionsWorkbenchService.canInstall(this.extension) === true) {
      this.enabled = true;
      this.updateLabel();
    }
  }
  async run() {
    if (!this.extension) {
      return;
    }
    if (this.extension.gallery && !this.extension.gallery.isSigned && shouldRequireRepositorySignatureFor(this.extension.private, await this.extensionGalleryManifestService.getExtensionGalleryManifest())) {
      const { result } = await this.dialogService.prompt({
        type: Severity.Warning,
        message: localize("not signed", "'{0}' is an extension from an unknown source. Are you sure you want to install?", this.extension.displayName),
        detail: localize("not signed detail", "Extension is not signed."),
        buttons: [
          {
            label: localize("install anyway", "Install Anyway"),
            run: () => {
              this.options.donotVerifySignature = true;
              return true;
            }
          }
        ],
        cancelButton: {
          run: () => false
        }
      });
      if (!result) {
        return;
      }
    }
    if (this.extension.deprecationInfo) {
      let detail = localize("deprecated message", "This extension is deprecated as it is no longer being maintained.");
      let DeprecationChoice;
      ((DeprecationChoice2) => {
        DeprecationChoice2[DeprecationChoice2["InstallAnyway"] = 0] = "InstallAnyway";
        DeprecationChoice2[DeprecationChoice2["ShowAlternateExtension"] = 1] = "ShowAlternateExtension";
        DeprecationChoice2[DeprecationChoice2["ConfigureSettings"] = 2] = "ConfigureSettings";
        DeprecationChoice2[DeprecationChoice2["Cancel"] = 3] = "Cancel";
      })(DeprecationChoice || (DeprecationChoice = {}));
      const buttons = [
        {
          label: localize("install anyway", "Install Anyway"),
          run: () => 0 /* InstallAnyway */
        }
      ];
      if (this.extension.deprecationInfo.extension) {
        detail = localize("deprecated with alternate extension message", "This extension is deprecated. Use the {0} extension instead.", this.extension.deprecationInfo.extension.displayName);
        const alternateExtension = this.extension.deprecationInfo.extension;
        buttons.push({
          label: localize({ key: "Show alternate extension", comment: ["&& denotes a mnemonic"] }, "&&Open {0}", this.extension.deprecationInfo.extension.displayName),
          run: async () => {
            const [extension2] = await this.extensionsWorkbenchService.getExtensions([{ id: alternateExtension.id, preRelease: alternateExtension.preRelease }], CancellationToken.None);
            await this.extensionsWorkbenchService.open(extension2);
            return 1 /* ShowAlternateExtension */;
          }
        });
      } else if (this.extension.deprecationInfo.settings) {
        detail = localize("deprecated with alternate settings message", "This extension is deprecated as this functionality is now built-in to VS Code.");
        const settings = this.extension.deprecationInfo.settings;
        buttons.push({
          label: localize({ key: "configure in settings", comment: ["&& denotes a mnemonic"] }, "&&Configure Settings"),
          run: async () => {
            await this.preferencesService.openSettings({ query: settings.map((setting) => `@id:${setting}`).join(" ") });
            return 2 /* ConfigureSettings */;
          }
        });
      } else if (this.extension.deprecationInfo.additionalInfo) {
        detail = new MarkdownString(`${detail} ${this.extension.deprecationInfo.additionalInfo}`);
      }
      const { result } = await this.dialogService.prompt({
        type: Severity.Warning,
        message: localize("install confirmation", "Are you sure you want to install '{0}'?", this.extension.displayName),
        detail: isString(detail) ? detail : void 0,
        custom: isString(detail) ? void 0 : {
          markdownDetails: [{
            markdown: detail
          }]
        },
        buttons,
        cancelButton: {
          run: () => 3 /* Cancel */
        }
      });
      if (result !== 0 /* InstallAnyway */) {
        return;
      }
    }
    this.extensionsWorkbenchService.open(this.extension, { showPreReleaseVersion: this.options.installPreReleaseVersion });
    alert(localize("installExtensionStart", "Installing extension {0} started. An editor is now open with more details on this extension", this.extension.displayName));
    this.telemetryService.publicLog("extensions:action:install", { ...this.extension.telemetryData, actionId: this.id });
    const extension = await this.install(this.extension);
    if (extension?.local) {
      alert(localize("installExtensionComplete", "Installing extension {0} is completed.", this.extension.displayName));
      const runningExtension = await this.getRunningExtension(extension.local);
      if (runningExtension && !(runningExtension.activationEvents && runningExtension.activationEvents.some((activationEent) => activationEent.startsWith("onLanguage")))) {
        const action = await this.getThemeAction(extension);
        if (action) {
          action.extension = extension;
          try {
            return action.run({ showCurrentTheme: true, ignoreFocusLost: true });
          } finally {
            action.dispose();
          }
        }
      }
    }
  }
  async getThemeAction(extension) {
    const colorThemes = await this.workbenchThemeService.getColorThemes();
    if (colorThemes.some((theme) => isThemeFromExtension(theme, extension))) {
      return this.instantiationService.createInstance(SetColorThemeAction);
    }
    const fileIconThemes = await this.workbenchThemeService.getFileIconThemes();
    if (fileIconThemes.some((theme) => isThemeFromExtension(theme, extension))) {
      return this.instantiationService.createInstance(SetFileIconThemeAction);
    }
    const productIconThemes = await this.workbenchThemeService.getProductIconThemes();
    if (productIconThemes.some((theme) => isThemeFromExtension(theme, extension))) {
      return this.instantiationService.createInstance(SetProductIconThemeAction);
    }
    return void 0;
  }
  async install(extension) {
    try {
      return await this.extensionsWorkbenchService.install(extension, this.options);
    } catch (error) {
      await this.instantiationService.createInstance(PromptExtensionInstallFailureAction, extension, this.options, extension.latestVersion, InstallOperation.Install, error).run();
      return void 0;
    }
  }
  async getRunningExtension(extension) {
    const runningExtension = await this.runtimeExtensionService.getExtension(extension.identifier.id);
    if (runningExtension) {
      return runningExtension;
    }
    if (this.runtimeExtensionService.canAddExtension(toExtensionDescription(extension))) {
      return new Promise((c, e) => {
        const disposable = this.runtimeExtensionService.onDidChangeExtensions(async () => {
          const runningExtension2 = await this.runtimeExtensionService.getExtension(extension.identifier.id);
          if (runningExtension2) {
            disposable.dispose();
            c(runningExtension2);
          }
        });
      });
    }
    return null;
  }
  updateLabel() {
    this.label = this.getLabel();
  }
  getLabel(primary) {
    if (this.extension?.isWorkspaceScoped && this.extension.resourceExtension && this.contextService.isInsideWorkspace(this.extension.resourceExtension.location)) {
      return localize("install workspace version", "Install Workspace Extension");
    }
    if (this.options.installPreReleaseVersion && this.extension?.hasPreReleaseVersion) {
      return primary ? localize("install pre-release", "Install Pre-Release") : localize("install pre-release version", "Install Pre-Release Version");
    }
    if (this.extension?.hasPreReleaseVersion) {
      return primary ? localize("install", "Install") : localize("install release version", "Install Release Version");
    }
    return localize("install", "Install");
  }
};
InstallAction.CLASS = `${InstallAction.LABEL_ACTION_CLASS} prominent install`;
InstallAction.HIDE = `${InstallAction.CLASS} hide`;
InstallAction = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IWorkbenchThemeService),
  __decorateParam(5, ILabelService),
  __decorateParam(6, IDialogService),
  __decorateParam(7, IPreferencesService),
  __decorateParam(8, ITelemetryService),
  __decorateParam(9, IWorkspaceContextService),
  __decorateParam(10, IAllowedExtensionsService),
  __decorateParam(11, IExtensionGalleryManifestService)
], InstallAction);
let InstallDropdownAction = class extends ButtonWithDropDownExtensionAction {
  set manifest(manifest) {
    this.extensionActions.forEach((a) => a.manifest = manifest);
    this.update();
  }
  constructor(instantiationService, extensionManagementService) {
    super(`extensions.installActions`, InstallAction.CLASS, [
      [
        instantiationService.createInstance(InstallAction, { installPreReleaseVersion: extensionManagementService.preferPreReleases }),
        instantiationService.createInstance(InstallAction, { installPreReleaseVersion: !extensionManagementService.preferPreReleases })
      ]
    ]);
  }
  getLabel(action) {
    return action.getLabel(true);
  }
};
InstallDropdownAction = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IWorkbenchExtensionManagementService)
], InstallDropdownAction);
const _InstallingLabelAction = class _InstallingLabelAction extends ExtensionAction {
  constructor() {
    super("extension.installing", _InstallingLabelAction.LABEL, _InstallingLabelAction.CLASS, false);
  }
  update() {
    this.class = `${_InstallingLabelAction.CLASS}${this.extension && this.extension.state === ExtensionState.Installing ? "" : " hide"}`;
  }
};
_InstallingLabelAction.LABEL = localize("installing", "Installing");
_InstallingLabelAction.CLASS = `${ExtensionAction.LABEL_ACTION_CLASS} install installing`;
let InstallingLabelAction = _InstallingLabelAction;
let InstallInOtherServerAction = class extends ExtensionAction {
  constructor(id, server, canInstallAnyWhere, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService) {
    super(id, InstallInOtherServerAction.INSTALL_LABEL, InstallInOtherServerAction.Class, false);
    this.server = server;
    this.canInstallAnyWhere = canInstallAnyWhere;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.updateWhenCounterExtensionChanges = true;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = InstallInOtherServerAction.Class;
    if (this.canInstall()) {
      const extensionInOtherServer = this.extensionsWorkbenchService.installed.filter((e) => areSameExtensions(e.identifier, this.extension.identifier) && e.server === this.server)[0];
      if (extensionInOtherServer) {
        if (extensionInOtherServer.state === ExtensionState.Installing && !extensionInOtherServer.local) {
          this.enabled = true;
          this.label = InstallInOtherServerAction.INSTALLING_LABEL;
          this.class = InstallInOtherServerAction.InstallingClass;
        }
      } else {
        this.enabled = true;
        this.label = this.getInstallLabel();
      }
    }
  }
  canInstall() {
    if (!this.extension || !this.server || !this.extension.local || this.extension.state !== ExtensionState.Installed || this.extension.type !== ExtensionType.User || this.extension.enablementState === EnablementState.DisabledByEnvironment || this.extension.enablementState === EnablementState.DisabledByTrustRequirement || this.extension.enablementState === EnablementState.DisabledByVirtualWorkspace) {
      return false;
    }
    if (isLanguagePackExtension(this.extension.local.manifest)) {
      return true;
    }
    if (this.server === this.extensionManagementServerService.localExtensionManagementServer && this.extensionManifestPropertiesService.prefersExecuteOnUI(this.extension.local.manifest)) {
      return true;
    }
    if (this.server === this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(this.extension.local.manifest)) {
      return true;
    }
    if (this.server === this.extensionManagementServerService.webExtensionManagementServer && this.extensionManifestPropertiesService.prefersExecuteOnWeb(this.extension.local.manifest)) {
      return true;
    }
    if (this.canInstallAnyWhere) {
      if (this.server === this.extensionManagementServerService.localExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnUI(this.extension.local.manifest)) {
        return true;
      }
      if (this.server === this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnWorkspace(this.extension.local.manifest)) {
        return true;
      }
    }
    return false;
  }
  async run() {
    if (!this.extension?.local) {
      return;
    }
    if (!this.extension?.server) {
      return;
    }
    if (!this.server) {
      return;
    }
    this.extensionsWorkbenchService.open(this.extension);
    alert(localize("installExtensionStart", "Installing extension {0} started. An editor is now open with more details on this extension", this.extension.displayName));
    return this.extensionsWorkbenchService.installInServer(this.extension, this.server);
  }
};
InstallInOtherServerAction.INSTALL_LABEL = localize("install", "Install");
InstallInOtherServerAction.INSTALLING_LABEL = localize("installing", "Installing");
InstallInOtherServerAction.Class = `${ExtensionAction.LABEL_ACTION_CLASS} prominent install-other-server`;
InstallInOtherServerAction.InstallingClass = `${ExtensionAction.LABEL_ACTION_CLASS} install-other-server installing`;
InstallInOtherServerAction = __decorateClass([
  __decorateParam(3, IExtensionsWorkbenchService),
  __decorateParam(4, IExtensionManagementServerService),
  __decorateParam(5, IExtensionManifestPropertiesService)
], InstallInOtherServerAction);
let RemoteInstallAction = class extends InstallInOtherServerAction {
  constructor(canInstallAnyWhere, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService) {
    super(`extensions.remoteinstall`, extensionManagementServerService.remoteExtensionManagementServer, canInstallAnyWhere, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService);
  }
  getInstallLabel() {
    return this.extensionManagementServerService.remoteExtensionManagementServer ? localize({ key: "install in remote", comment: ["This is the name of the action to install an extension in remote server. Placeholder is for the name of remote server."] }, "Install in {0}", this.extensionManagementServerService.remoteExtensionManagementServer.label) : InstallInOtherServerAction.INSTALL_LABEL;
  }
};
RemoteInstallAction = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IExtensionManagementServerService),
  __decorateParam(3, IExtensionManifestPropertiesService)
], RemoteInstallAction);
let LocalInstallAction = class extends InstallInOtherServerAction {
  constructor(extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService) {
    super(`extensions.localinstall`, extensionManagementServerService.localExtensionManagementServer, false, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService);
  }
  getInstallLabel() {
    return localize("install locally", "Install Locally");
  }
};
LocalInstallAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IExtensionManagementServerService),
  __decorateParam(2, IExtensionManifestPropertiesService)
], LocalInstallAction);
let WebInstallAction = class extends InstallInOtherServerAction {
  constructor(extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService) {
    super(`extensions.webInstall`, extensionManagementServerService.webExtensionManagementServer, false, extensionsWorkbenchService, extensionManagementServerService, extensionManifestPropertiesService);
  }
  getInstallLabel() {
    return localize("install browser", "Install in Browser");
  }
};
WebInstallAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IExtensionManagementServerService),
  __decorateParam(2, IExtensionManifestPropertiesService)
], WebInstallAction);
let UninstallAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService, userDataProfilesService, dialogService) {
    super("extensions.uninstall", UninstallAction.UninstallLabel, UninstallAction.UninstallClass, false);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.userDataProfilesService = userDataProfilesService;
    this.dialogService = dialogService;
    this.update();
  }
  update() {
    if (!this.extension) {
      this.enabled = false;
      return;
    }
    const state = this.extension.state;
    if (state === ExtensionState.Uninstalling) {
      this.label = UninstallAction.UninstallingLabel;
      this.class = UninstallAction.UnInstallingClass;
      this.enabled = false;
      return;
    }
    this.label = this.extension.local?.isApplicationScoped && this.userDataProfilesService.profiles.length > 1 ? localize("uninstallAll", "Uninstall (All Profiles)") : UninstallAction.UninstallLabel;
    this.class = UninstallAction.UninstallClass;
    this.tooltip = UninstallAction.UninstallLabel;
    if (state !== ExtensionState.Installed) {
      this.enabled = false;
      return;
    }
    if (this.extension.isBuiltin) {
      this.enabled = false;
      return;
    }
    this.enabled = true;
  }
  async run() {
    if (!this.extension) {
      return;
    }
    alert(localize("uninstallExtensionStart", "Uninstalling extension {0} started.", this.extension.displayName));
    try {
      await this.extensionsWorkbenchService.uninstall(this.extension);
      alert(localize("uninstallExtensionComplete", "Please reload Visual Studio Code to complete the uninstallation of the extension {0}.", this.extension.displayName));
    } catch (error) {
      if (!isCancellationError(error)) {
        this.dialogService.error(getErrorMessage(error));
      }
    }
  }
};
UninstallAction.UninstallLabel = localize("uninstallAction", "Uninstall");
UninstallAction.UninstallingLabel = localize("Uninstalling", "Uninstalling");
UninstallAction.UninstallClass = `${ExtensionAction.LABEL_ACTION_CLASS} uninstall`;
UninstallAction.UnInstallingClass = `${ExtensionAction.LABEL_ACTION_CLASS} uninstall uninstalling`;
UninstallAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IDialogService)
], UninstallAction);
let UpdateAction = class extends ExtensionAction {
  constructor(verbose, extensionsWorkbenchService, dialogService, openerService, instantiationService) {
    super(`extensions.update`, localize("update", "Update"), UpdateAction.DisabledClass, false);
    this.verbose = verbose;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.dialogService = dialogService;
    this.openerService = openerService;
    this.instantiationService = instantiationService;
    this.updateThrottler = this._register(new Throttler());
    this.update();
  }
  update() {
    this.updateThrottler.queue(() => this.computeAndUpdateEnablement());
    if (this.extension) {
      this.label = this.verbose ? localize("update to", "Update to v{0}", this.extension.latestVersion) : localize("update", "Update");
    }
  }
  async computeAndUpdateEnablement() {
    this.enabled = false;
    this.class = UpdateAction.DisabledClass;
    if (!this.extension) {
      return;
    }
    if (this.extension.deprecationInfo) {
      return;
    }
    const canInstall = await this.extensionsWorkbenchService.canInstall(this.extension);
    const isInstalled = this.extension.state === ExtensionState.Installed;
    this.enabled = canInstall === true && isInstalled && this.extension.outdated;
    this.class = this.enabled ? UpdateAction.EnabledClass : UpdateAction.DisabledClass;
  }
  async run() {
    if (!this.extension) {
      return;
    }
    const consent = await this.extensionsWorkbenchService.shouldRequireConsentToUpdate(this.extension);
    if (consent) {
      const { result } = await this.dialogService.prompt({
        type: "warning",
        title: localize("updateExtensionConsentTitle", "Update {0} Extension", this.extension.displayName),
        message: localize("updateExtensionConsent", "{0}\n\nWould you like to update the extension?", consent),
        buttons: [{
          label: localize("update", "Update"),
          run: () => "update"
        }, {
          label: localize("review", "Review"),
          run: () => "review"
        }, {
          label: localize("cancel", "Cancel"),
          run: () => "cancel"
        }]
      });
      if (result === "cancel") {
        return;
      }
      if (result === "review") {
        if (this.extension.hasChangelog()) {
          return this.extensionsWorkbenchService.open(this.extension, { tab: ExtensionEditorTab.Changelog });
        }
        if (this.extension.repository) {
          return this.openerService.open(this.extension.repository);
        }
        return this.extensionsWorkbenchService.open(this.extension);
      }
    }
    const installOptions = {};
    if (this.extension.local?.source === "vsix" && this.extension.local.pinned) {
      installOptions.pinned = false;
    }
    if (this.extension.local?.preRelease) {
      installOptions.installPreReleaseVersion = true;
    }
    try {
      alert(localize("updateExtensionStart", "Updating extension {0} to version {1} started.", this.extension.displayName, this.extension.latestVersion));
      await this.extensionsWorkbenchService.install(this.extension, installOptions);
      alert(localize("updateExtensionComplete", "Updating extension {0} to version {1} completed.", this.extension.displayName, this.extension.latestVersion));
    } catch (err) {
      this.instantiationService.createInstance(PromptExtensionInstallFailureAction, this.extension, installOptions, this.extension.latestVersion, InstallOperation.Update, err).run();
    }
  }
};
UpdateAction.EnabledClass = `${UpdateAction.LABEL_ACTION_CLASS} update`;
UpdateAction.DisabledClass = `${UpdateAction.EnabledClass} disabled`;
UpdateAction = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, IInstantiationService)
], UpdateAction);
let ToggleAutoUpdateForExtensionAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService, extensionEnablementService, allowedExtensionsService, configurationService) {
    super(ToggleAutoUpdateForExtensionAction.ID, ToggleAutoUpdateForExtensionAction.LABEL.value, ToggleAutoUpdateForExtensionAction.DisabledClass);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.allowedExtensionsService = allowedExtensionsService;
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AutoUpdateConfigurationKey)) {
        this.update();
      }
    }));
    this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue((e) => this.update()));
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = ToggleAutoUpdateForExtensionAction.DisabledClass;
    if (!this.extension) {
      return;
    }
    if (this.extension.isBuiltin) {
      return;
    }
    if (this.extension.deprecationInfo?.disallowInstall) {
      return;
    }
    const extension = this.extension.local ?? this.extension.gallery;
    if (extension && this.allowedExtensionsService.isAllowed(extension) !== true) {
      return;
    }
    if (this.extensionsWorkbenchService.getAutoUpdateValue() === "on" && !this.extensionEnablementService.isEnabledEnablementState(this.extension.enablementState)) {
      return;
    }
    this.enabled = true;
    this.class = ToggleAutoUpdateForExtensionAction.EnabledClass;
    this.checked = this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension);
  }
  async run() {
    if (!this.extension) {
      return;
    }
    const enableAutoUpdate = !this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension);
    await this.extensionsWorkbenchService.updateAutoUpdateEnablementFor(this.extension, enableAutoUpdate);
    if (enableAutoUpdate) {
      alert(localize("enableAutoUpdate", "Enabled auto updates for", this.extension.displayName));
    } else {
      alert(localize("disableAutoUpdate", "Disabled auto updates for", this.extension.displayName));
    }
  }
};
ToggleAutoUpdateForExtensionAction.ID = "workbench.extensions.action.toggleAutoUpdateForExtension";
ToggleAutoUpdateForExtensionAction.LABEL = localize2("enableAutoUpdateLabel", "Auto Update");
ToggleAutoUpdateForExtensionAction.EnabledClass = `${ExtensionAction.EXTENSION_ACTION_CLASS} auto-update`;
ToggleAutoUpdateForExtensionAction.DisabledClass = `${ToggleAutoUpdateForExtensionAction.EnabledClass} hide`;
ToggleAutoUpdateForExtensionAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IWorkbenchExtensionEnablementService),
  __decorateParam(2, IAllowedExtensionsService),
  __decorateParam(3, IConfigurationService)
], ToggleAutoUpdateForExtensionAction);
let ToggleAutoUpdatesForPublisherAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService) {
    super(ToggleAutoUpdatesForPublisherAction.ID, ToggleAutoUpdatesForPublisherAction.LABEL);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
  }
  update() {
  }
  async run() {
    if (!this.extension) {
      return;
    }
    alert(localize("ignoreExtensionUpdatePublisher", "Ignoring updates published by {0}.", this.extension.publisherDisplayName));
    const enableAutoUpdate = !this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension.publisher);
    await this.extensionsWorkbenchService.updateAutoUpdateEnablementFor(this.extension.publisher, enableAutoUpdate);
    if (enableAutoUpdate) {
      alert(localize("enableAutoUpdate", "Enabled auto updates for", this.extension.displayName));
    } else {
      alert(localize("disableAutoUpdate", "Disabled auto updates for", this.extension.displayName));
    }
  }
};
ToggleAutoUpdatesForPublisherAction.ID = "workbench.extensions.action.toggleAutoUpdatesForPublisher";
ToggleAutoUpdatesForPublisherAction.LABEL = localize("toggleAutoUpdatesForPublisherLabel", "Auto Update All (From Publisher)");
ToggleAutoUpdatesForPublisherAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService)
], ToggleAutoUpdatesForPublisherAction);
let MigrateDeprecatedExtensionAction = class extends ExtensionAction {
  constructor(small, extensionsWorkbenchService) {
    super("extensionsAction.migrateDeprecatedExtension", localize("migrateExtension", "Migrate"), MigrateDeprecatedExtensionAction.DisabledClass, false);
    this.small = small;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = MigrateDeprecatedExtensionAction.DisabledClass;
    if (!this.extension?.local) {
      return;
    }
    if (this.extension.state !== ExtensionState.Installed) {
      return;
    }
    if (!this.extension.deprecationInfo?.extension) {
      return;
    }
    const id = this.extension.deprecationInfo.extension.id;
    if (this.extensionsWorkbenchService.local.some((e) => areSameExtensions(e.identifier, { id }))) {
      return;
    }
    this.enabled = true;
    this.class = MigrateDeprecatedExtensionAction.EnabledClass;
    this.tooltip = localize("migrate to", "Migrate to {0}", this.extension.deprecationInfo.extension.displayName);
    this.label = this.small ? localize("migrate", "Migrate") : this.tooltip;
  }
  async run() {
    if (!this.extension?.deprecationInfo?.extension) {
      return;
    }
    const local = this.extension.local;
    await this.extensionsWorkbenchService.uninstall(this.extension);
    const [extension] = await this.extensionsWorkbenchService.getExtensions([{ id: this.extension.deprecationInfo.extension.id, preRelease: this.extension.deprecationInfo?.extension?.preRelease }], CancellationToken.None);
    await this.extensionsWorkbenchService.install(extension, { isMachineScoped: local?.isMachineScoped });
  }
};
MigrateDeprecatedExtensionAction.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} migrate`;
MigrateDeprecatedExtensionAction.DisabledClass = `${MigrateDeprecatedExtensionAction.EnabledClass} disabled`;
MigrateDeprecatedExtensionAction = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService)
], MigrateDeprecatedExtensionAction);
let DropDownExtensionAction = class extends ExtensionAction {
  constructor(id, label, cssClass, enabled, instantiationService) {
    super(id, label, cssClass, enabled);
    this.instantiationService = instantiationService;
    this._actionViewItem = null;
  }
  createActionViewItem(options) {
    this._actionViewItem = this.instantiationService.createInstance(DropDownExtensionActionViewItem, this, options);
    return this._actionViewItem;
  }
  run(actionGroups) {
    this._actionViewItem?.showMenu(actionGroups);
    return Promise.resolve();
  }
};
DropDownExtensionAction = __decorateClass([
  __decorateParam(4, IInstantiationService)
], DropDownExtensionAction);
let DropDownExtensionActionViewItem = class extends ActionViewItem {
  constructor(action, options, contextMenuService) {
    super(null, action, { ...options, icon: true, label: true });
    this.contextMenuService = contextMenuService;
  }
  showMenu(menuActionGroups) {
    if (this.element) {
      const actions = this.getActions(menuActionGroups);
      this.contextMenuService.showContextMenu({
        ...getWorkbenchMenuMotionContextMenuOptions(this.element),
        getActions: () => actions,
        actionRunner: this.actionRunner,
        onHide: () => disposeIfDisposable(actions)
      });
    }
  }
  getActions(menuActionGroups) {
    let actions = [];
    for (const menuActions of menuActionGroups) {
      actions = [...actions, ...menuActions, new Separator()];
    }
    return actions.length ? actions.slice(0, actions.length - 1) : actions;
  }
};
DropDownExtensionActionViewItem = __decorateClass([
  __decorateParam(2, IContextMenuService)
], DropDownExtensionActionViewItem);
async function getContextMenuActionsGroups(extension, contextKeyService, instantiationService) {
  return instantiationService.invokeFunction(async (accessor) => {
    const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
    const extensionEnablementService = accessor.get(IWorkbenchExtensionEnablementService);
    const menuService = accessor.get(IMenuService);
    const extensionRecommendationsService = accessor.get(IExtensionRecommendationsService);
    const extensionIgnoredRecommendationsService = accessor.get(IExtensionIgnoredRecommendationsService);
    const workbenchThemeService = accessor.get(IWorkbenchThemeService);
    const authenticationUsageService = accessor.get(IAuthenticationUsageService);
    const allowedExtensionsService = accessor.get(IAllowedExtensionsService);
    const cksOverlay = [];
    if (extension) {
      cksOverlay.push(["extension", extension.identifier.id]);
      cksOverlay.push(["isBuiltinExtension", extension.isBuiltin]);
      cksOverlay.push(["isDefaultApplicationScopedExtension", extension.local && isApplicationScopedExtension(extension.local.manifest)]);
      cksOverlay.push(["isApplicationScopedExtension", extension.local && extension.local.isApplicationScoped]);
      cksOverlay.push(["isWorkspaceScopedExtension", extension.isWorkspaceScoped]);
      cksOverlay.push(["isGalleryExtension", !!extension.identifier.uuid]);
      if (extension.local) {
        cksOverlay.push(["extensionSource", extension.local.source]);
      }
      cksOverlay.push(["extensionHasConfiguration", extension.local && !!extension.local.manifest.contributes && !!extension.local.manifest.contributes.configuration]);
      cksOverlay.push(["extensionHasKeybindings", extension.local && !!extension.local.manifest.contributes && !!extension.local.manifest.contributes.keybindings]);
      cksOverlay.push(["extensionHasCommands", extension.local && !!extension.local.manifest.contributes && !!extension.local.manifest.contributes?.commands]);
      cksOverlay.push(["isExtensionRecommended", !!extensionRecommendationsService.getAllRecommendationsWithReason()[extension.identifier.id.toLowerCase()]]);
      cksOverlay.push(["isExtensionWorkspaceRecommended", extensionRecommendationsService.getAllRecommendationsWithReason()[extension.identifier.id.toLowerCase()]?.reasonId === ExtensionRecommendationReason.Workspace]);
      cksOverlay.push(["isUserIgnoredRecommendation", extensionIgnoredRecommendationsService.globalIgnoredRecommendations.some((e) => e === extension.identifier.id.toLowerCase())]);
      cksOverlay.push(["isExtensionPinned", extension.pinned]);
      cksOverlay.push(["isExtensionEnabled", extensionEnablementService.isEnabledEnablementState(extension.enablementState)]);
      switch (extension.state) {
        case ExtensionState.Installing:
          cksOverlay.push(["extensionStatus", "installing"]);
          break;
        case ExtensionState.Installed:
          cksOverlay.push(["extensionStatus", "installed"]);
          break;
        case ExtensionState.Uninstalling:
          cksOverlay.push(["extensionStatus", "uninstalling"]);
          break;
        case ExtensionState.Uninstalled:
          cksOverlay.push(["extensionStatus", "uninstalled"]);
          break;
      }
      cksOverlay.push(["installedExtensionIsPreReleaseVersion", !!extension.local?.isPreReleaseVersion]);
      cksOverlay.push(["installedExtensionIsOptedToPreRelease", !!extension.local?.preRelease]);
      cksOverlay.push(["galleryExtensionIsPreReleaseVersion", !!extension.gallery?.properties.isPreReleaseVersion]);
      cksOverlay.push(["galleryExtensionHasPreReleaseVersion", extension.gallery?.hasPreReleaseVersion]);
      cksOverlay.push(["extensionHasPreReleaseVersion", extension.hasPreReleaseVersion]);
      cksOverlay.push(["extensionHasReleaseVersion", extension.hasReleaseVersion]);
      cksOverlay.push(["extensionDisallowInstall", extension.isMalicious || extension.deprecationInfo?.disallowInstall]);
      cksOverlay.push(["isExtensionAllowed", allowedExtensionsService.isAllowed({ id: extension.identifier.id, publisherDisplayName: extension.publisherDisplayName }) === true]);
      cksOverlay.push(["isPreReleaseExtensionAllowed", allowedExtensionsService.isAllowed({ id: extension.identifier.id, publisherDisplayName: extension.publisherDisplayName, prerelease: true }) === true]);
      cksOverlay.push(["extensionIsUnsigned", extension.gallery && !extension.gallery.isSigned]);
      cksOverlay.push(["extensionIsPrivate", extension.gallery?.private]);
      const [colorThemes, fileIconThemes, productIconThemes, extensionUsesAuth] = await Promise.all([workbenchThemeService.getColorThemes(), workbenchThemeService.getFileIconThemes(), workbenchThemeService.getProductIconThemes(), authenticationUsageService.extensionUsesAuth(extension.identifier.id.toLowerCase())]);
      cksOverlay.push(["extensionHasColorThemes", colorThemes.some((theme) => isThemeFromExtension(theme, extension))]);
      cksOverlay.push(["extensionHasFileIconThemes", fileIconThemes.some((theme) => isThemeFromExtension(theme, extension))]);
      cksOverlay.push(["extensionHasProductIconThemes", productIconThemes.some((theme) => isThemeFromExtension(theme, extension))]);
      cksOverlay.push(["extensionHasAccountPreferences", extensionUsesAuth]);
      cksOverlay.push(["canSetLanguage", extensionsWorkbenchService.canSetLanguage(extension)]);
      cksOverlay.push(["isActiveLanguagePackExtension", extension.gallery && language === getLocale(extension.gallery)]);
    }
    const actionsGroups = menuService.getMenuActions(MenuId.ExtensionContext, contextKeyService.createOverlay(cksOverlay), { shouldForwardArgs: true });
    return actionsGroups;
  });
}
function toActions(actionsGroups, instantiationService) {
  const result = [];
  for (const [, actions] of actionsGroups) {
    result.push(actions.map((action) => {
      if (action instanceof SubmenuAction) {
        return action;
      }
      return instantiationService.createInstance(MenuItemExtensionAction, action);
    }));
  }
  return result;
}
async function getContextMenuActions(extension, contextKeyService, instantiationService) {
  const actionsGroups = await getContextMenuActionsGroups(extension, contextKeyService, instantiationService);
  return toActions(actionsGroups, instantiationService);
}
let ManageExtensionAction = class extends DropDownExtensionAction {
  constructor(instantiationService, extensionService, contextKeyService, productService) {
    super(ManageExtensionAction.ID, "", "", true, instantiationService);
    this.extensionService = extensionService;
    this.contextKeyService = contextKeyService;
    this.productService = productService;
    this.tooltip = localize("manage", "Manage");
    this.update();
  }
  async getActionGroups() {
    const groups = [];
    const contextMenuActionsGroups = await getContextMenuActionsGroups(this.extension, this.contextKeyService, this.instantiationService);
    const themeActions = [], installActions = [], updateActions = [], otherActionGroups = [];
    for (const [group, actions] of contextMenuActionsGroups) {
      if (group === INSTALL_ACTIONS_GROUP) {
        installActions.push(...toActions([[group, actions]], this.instantiationService)[0]);
      } else if (group === UPDATE_ACTIONS_GROUP) {
        updateActions.push(...toActions([[group, actions]], this.instantiationService)[0]);
      } else if (group === THEME_ACTIONS_GROUP) {
        themeActions.push(...toActions([[group, actions]], this.instantiationService)[0]);
      } else {
        otherActionGroups.push(...toActions([[group, actions]], this.instantiationService));
      }
    }
    if (themeActions.length) {
      groups.push(themeActions);
    }
    const isChatExtension = this.extension && ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId);
    if (isChatExtension) {
      groups.push([
        this.instantiationService.createInstance(EnableAIFeaturesGloballyAction),
        this.instantiationService.createInstance(EnableAIFeaturesInWorkspaceAction)
      ]);
      groups.push([
        this.instantiationService.createInstance(DisableAIFeaturesGloballyAction),
        this.instantiationService.createInstance(DisableAIFeaturesInWorkspaceAction)
      ]);
    } else {
      groups.push([
        this.instantiationService.createInstance(EnableGloballyAction),
        this.instantiationService.createInstance(EnableForWorkspaceAction)
      ]);
      groups.push([
        this.instantiationService.createInstance(DisableGloballyAction),
        this.instantiationService.createInstance(DisableForWorkspaceAction)
      ]);
    }
    if (updateActions.length) {
      groups.push(updateActions);
    }
    groups.push([
      ...installActions.length ? installActions : [],
      this.instantiationService.createInstance(InstallAnotherVersionAction, this.extension, false),
      this.instantiationService.createInstance(UninstallAction)
    ]);
    otherActionGroups.forEach((actions) => groups.push(actions));
    groups.forEach((group) => group.forEach((extensionAction) => {
      if (extensionAction instanceof ExtensionAction) {
        extensionAction.extension = this.extension;
      }
    }));
    return groups;
  }
  async run() {
    await this.extensionService.whenInstalledExtensionsRegistered();
    return super.run(await this.getActionGroups());
  }
  update() {
    this.class = ManageExtensionAction.HideManageExtensionClass;
    this.enabled = false;
    if (this.extension) {
      const state = this.extension.state;
      this.enabled = state === ExtensionState.Installed;
      this.class = this.enabled || state === ExtensionState.Uninstalling ? ManageExtensionAction.Class : ManageExtensionAction.HideManageExtensionClass;
    }
  }
};
ManageExtensionAction.ID = "extensions.manage";
ManageExtensionAction.Class = `${ExtensionAction.ICON_ACTION_CLASS} manage ` + ThemeIcon.asClassName(manageExtensionIcon);
ManageExtensionAction.HideManageExtensionClass = `${ManageExtensionAction.Class} hide`;
ManageExtensionAction = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IExtensionService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IProductService)
], ManageExtensionAction);
class ExtensionEditorManageExtensionAction extends DropDownExtensionAction {
  constructor(contextKeyService, instantiationService) {
    super("extensionEditor.manageExtension", "", `${ExtensionAction.ICON_ACTION_CLASS} manage ${ThemeIcon.asClassName(manageExtensionIcon)}`, true, instantiationService);
    this.contextKeyService = contextKeyService;
    this.tooltip = localize("manage", "Manage");
  }
  update() {
  }
  async run() {
    const actionGroups = [];
    (await getContextMenuActions(this.extension, this.contextKeyService, this.instantiationService)).forEach((actions) => actionGroups.push(actions));
    actionGroups.forEach((group) => group.forEach((extensionAction) => {
      if (extensionAction instanceof ExtensionAction) {
        extensionAction.extension = this.extension;
      }
    }));
    return super.run(actionGroups);
  }
}
let MenuItemExtensionAction = class extends ExtensionAction {
  constructor(action, extensionsWorkbenchService) {
    super(action.id, action.label);
    this.action = action;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
  }
  get enabled() {
    return this.action.enabled;
  }
  set enabled(value) {
    this.action.enabled = value;
  }
  update() {
    if (!this.extension) {
      return;
    }
    if (this.action.id === TOGGLE_IGNORE_EXTENSION_ACTION_ID) {
      this.checked = !this.extensionsWorkbenchService.isExtensionIgnoredToSync(this.extension);
    } else if (this.action.id === ToggleAutoUpdateForExtensionAction.ID) {
      this.checked = this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension);
    } else if (this.action.id === ToggleAutoUpdatesForPublisherAction.ID) {
      this.checked = this.extensionsWorkbenchService.isAutoUpdateEnabledFor(this.extension.publisher);
    } else {
      this.checked = this.action.checked;
    }
  }
  async run() {
    if (this.extension) {
      const id = this.extension.local ? getExtensionId(this.extension.local.manifest.publisher, this.extension.local.manifest.name) : this.extension.gallery ? getExtensionId(this.extension.gallery.publisher, this.extension.gallery.name) : this.extension.identifier.id;
      const extensionArg = {
        id: this.extension.identifier.id,
        version: this.extension.version,
        location: this.extension.local?.location,
        galleryLink: this.extension.url
      };
      await this.action.run(id, extensionArg);
    }
  }
};
MenuItemExtensionAction = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService)
], MenuItemExtensionAction);
let TogglePreReleaseExtensionAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService, allowedExtensionsService) {
    super(TogglePreReleaseExtensionAction.ID, TogglePreReleaseExtensionAction.LABEL, TogglePreReleaseExtensionAction.DisabledClass);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.allowedExtensionsService = allowedExtensionsService;
    this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this.update()));
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = TogglePreReleaseExtensionAction.DisabledClass;
    if (!this.extension) {
      return;
    }
    if (this.extension.isBuiltin) {
      return;
    }
    if (this.extension.state !== ExtensionState.Installed) {
      return;
    }
    if (!this.extension.hasPreReleaseVersion) {
      return;
    }
    if (!this.extension.gallery) {
      return;
    }
    if (this.extension.preRelease) {
      if (!this.extension.isPreReleaseVersion) {
        return;
      }
      if (this.allowedExtensionsService.isAllowed({ id: this.extension.identifier.id, publisherDisplayName: this.extension.publisherDisplayName }) !== true) {
        return;
      }
    }
    if (!this.extension.preRelease) {
      if (!this.extension.gallery.hasPreReleaseVersion) {
        return;
      }
      if (this.allowedExtensionsService.isAllowed(this.extension.gallery) !== true) {
        return;
      }
    }
    this.enabled = true;
    this.class = TogglePreReleaseExtensionAction.EnabledClass;
    if (this.extension.preRelease) {
      this.label = localize("togglePreRleaseDisableLabel", "Switch to Release Version");
      this.tooltip = localize("togglePreRleaseDisableTooltip", "This will switch and enable updates to release versions");
    } else {
      this.label = localize("switchToPreReleaseLabel", "Switch to Pre-Release Version");
      this.tooltip = localize("switchToPreReleaseTooltip", "This will switch to pre-release version and enable updates to latest version always");
    }
  }
  async run() {
    if (!this.extension) {
      return;
    }
    this.extensionsWorkbenchService.open(this.extension, { showPreReleaseVersion: !this.extension.preRelease });
    await this.extensionsWorkbenchService.togglePreRelease(this.extension);
  }
};
TogglePreReleaseExtensionAction.ID = "workbench.extensions.action.togglePreRlease";
TogglePreReleaseExtensionAction.LABEL = localize("togglePreRleaseLabel", "Pre-Release");
TogglePreReleaseExtensionAction.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} prominent pre-release`;
TogglePreReleaseExtensionAction.DisabledClass = `${TogglePreReleaseExtensionAction.EnabledClass} hide`;
TogglePreReleaseExtensionAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IAllowedExtensionsService)
], TogglePreReleaseExtensionAction);
let InstallAnotherVersionAction = class extends ExtensionAction {
  constructor(extension, whenInstalled, extensionsWorkbenchService, extensionManagementService, extensionGalleryService, quickInputService, instantiationService, dialogService, allowedExtensionsService) {
    super(InstallAnotherVersionAction.ID, InstallAnotherVersionAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.whenInstalled = whenInstalled;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionManagementService = extensionManagementService;
    this.extensionGalleryService = extensionGalleryService;
    this.quickInputService = quickInputService;
    this.instantiationService = instantiationService;
    this.dialogService = dialogService;
    this.allowedExtensionsService = allowedExtensionsService;
    this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this.update()));
    this.extension = extension;
    this.update();
  }
  update() {
    this.enabled = !!this.extension && !this.extension.isBuiltin && !!this.extension.identifier.uuid && !this.extension.deprecationInfo && this.allowedExtensionsService.isAllowed({ id: this.extension.identifier.id, publisherDisplayName: this.extension.publisherDisplayName }) === true;
    if (this.enabled && this.whenInstalled) {
      this.enabled = !!this.extension?.local && !!this.extension.server && this.extension.state === ExtensionState.Installed;
    }
  }
  async run() {
    if (!this.enabled) {
      return;
    }
    if (!this.extension) {
      return;
    }
    const targetPlatform = this.extension.server ? await this.extension.server.extensionManagementService.getTargetPlatform() : await this.extensionManagementService.getTargetPlatform();
    const allVersions = await this.extensionGalleryService.getAllCompatibleVersions(this.extension.identifier, this.extension.local?.preRelease ?? this.extension.gallery?.properties.isPreReleaseVersion ?? false, targetPlatform);
    if (!allVersions.length) {
      await this.dialogService.info(localize("no versions", "This extension has no other versions."));
      return;
    }
    const picks = allVersions.map((v, i) => {
      return {
        id: v.version,
        label: v.version,
        description: `${fromNow(new Date(Date.parse(v.date)), true)}${v.isPreReleaseVersion ? ` (${localize("pre-release", "pre-release")})` : ""}${v.version === this.extension?.local?.manifest.version ? ` (${localize("current", "current")})` : ""}`,
        ariaLabel: `${v.isPreReleaseVersion ? "Pre-Release version" : "Release version"} ${v.version}`,
        isPreReleaseVersion: v.isPreReleaseVersion
      };
    });
    const pick = await this.quickInputService.pick(
      picks,
      {
        placeHolder: localize("selectVersion", "Select Version to Install"),
        matchOnDetail: true
      }
    );
    if (pick) {
      if (this.extension.local?.manifest.version === pick.id) {
        return;
      }
      const options = { installPreReleaseVersion: pick.isPreReleaseVersion, version: pick.id };
      try {
        await this.extensionsWorkbenchService.install(this.extension, options);
      } catch (error) {
        this.instantiationService.createInstance(PromptExtensionInstallFailureAction, this.extension, options, pick.id, InstallOperation.Install, error).run();
      }
    }
    return null;
  }
};
InstallAnotherVersionAction.ID = "workbench.extensions.action.install.anotherVersion";
InstallAnotherVersionAction.LABEL = localize("install another version", "Install Specific Version...");
InstallAnotherVersionAction = __decorateClass([
  __decorateParam(2, IExtensionsWorkbenchService),
  __decorateParam(3, IWorkbenchExtensionManagementService),
  __decorateParam(4, IExtensionGalleryService),
  __decorateParam(5, IQuickInputService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IDialogService),
  __decorateParam(8, IAllowedExtensionsService)
], InstallAnotherVersionAction);
let EnableForWorkspaceAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService, extensionEnablementService, productService) {
    super(EnableForWorkspaceAction.ID, EnableForWorkspaceAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.productService = productService;
    this.tooltip = localize("enableForWorkspaceActionToolTip", "Enable this extension only in this workspace");
    this.update();
  }
  update() {
    this.enabled = false;
    if (this.extension && this.extension.local && !this.extension.isWorkspaceScoped) {
      if (ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId)) {
        return;
      }
      this.enabled = this.extension.state === ExtensionState.Installed && !this.extensionEnablementService.isEnabled(this.extension.local) && this.extensionEnablementService.canChangeWorkspaceEnablement(this.extension.local);
    }
  }
  async run() {
    if (!this.extension) {
      return;
    }
    return this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.EnabledWorkspace);
  }
};
EnableForWorkspaceAction.ID = "extensions.enableForWorkspace";
EnableForWorkspaceAction.LABEL = localize("enableForWorkspaceAction", "Enable (Workspace)");
EnableForWorkspaceAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IWorkbenchExtensionEnablementService),
  __decorateParam(2, IProductService)
], EnableForWorkspaceAction);
let EnableGloballyAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService, extensionEnablementService, productService) {
    super(EnableGloballyAction.ID, EnableGloballyAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.productService = productService;
    this.tooltip = localize("enableGloballyActionToolTip", "Enable this extension");
    this.update();
  }
  update() {
    this.enabled = false;
    if (this.extension && this.extension.local && !this.extension.isWorkspaceScoped) {
      if (ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId)) {
        return;
      }
      this.enabled = this.extension.state === ExtensionState.Installed && this.extensionEnablementService.isDisabledGlobally(this.extension.local) && this.extensionEnablementService.canChangeEnablement(this.extension.local);
    }
  }
  async run() {
    if (!this.extension) {
      return;
    }
    return this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.EnabledGlobally);
  }
};
EnableGloballyAction.ID = "extensions.enableGlobally";
EnableGloballyAction.LABEL = localize("enableGloballyAction", "Enable");
EnableGloballyAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IWorkbenchExtensionEnablementService),
  __decorateParam(2, IProductService)
], EnableGloballyAction);
let DisableForWorkspaceAction = class extends ExtensionAction {
  constructor(workspaceContextService, extensionsWorkbenchService, extensionEnablementService, extensionService, productService) {
    super(DisableForWorkspaceAction.ID, DisableForWorkspaceAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.workspaceContextService = workspaceContextService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.extensionService = extensionService;
    this.productService = productService;
    this.tooltip = localize("disableForWorkspaceActionToolTip", "Disable this extension only in this workspace");
    this.update();
    this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
  }
  update() {
    this.enabled = false;
    if (this.extension && this.extension.local && !this.extension.isWorkspaceScoped && this.extensionService.extensions.some((e) => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier) && this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY)) {
      if (ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId)) {
        return;
      }
      this.enabled = this.extension.state === ExtensionState.Installed && (this.extension.enablementState === EnablementState.EnabledGlobally || this.extension.enablementState === EnablementState.EnabledWorkspace) && this.extensionEnablementService.canChangeWorkspaceEnablement(this.extension.local);
    }
  }
  async run() {
    if (!this.extension) {
      return;
    }
    return this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.DisabledWorkspace);
  }
};
DisableForWorkspaceAction.ID = "extensions.disableForWorkspace";
DisableForWorkspaceAction.LABEL = localize("disableForWorkspaceAction", "Disable (Workspace)");
DisableForWorkspaceAction = __decorateClass([
  __decorateParam(0, IWorkspaceContextService),
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IWorkbenchExtensionEnablementService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IProductService)
], DisableForWorkspaceAction);
let DisableGloballyAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService, extensionEnablementService, extensionService, productService) {
    super(DisableGloballyAction.ID, DisableGloballyAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.extensionService = extensionService;
    this.productService = productService;
    this.tooltip = localize("disableGloballyActionToolTip", "Disable this extension");
    this.update();
    this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
  }
  update() {
    this.enabled = false;
    if (this.extension && this.extension.local && !this.extension.isWorkspaceScoped && this.extensionService.extensions.some((e) => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier))) {
      if (ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId)) {
        return;
      }
      this.enabled = this.extension.state === ExtensionState.Installed && (this.extension.enablementState === EnablementState.EnabledGlobally || this.extension.enablementState === EnablementState.EnabledWorkspace) && this.extensionEnablementService.canChangeEnablement(this.extension.local);
    }
  }
  async run() {
    if (!this.extension) {
      return;
    }
    return this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.DisabledGlobally);
  }
};
DisableGloballyAction.ID = "extensions.disableGlobally";
DisableGloballyAction.LABEL = localize("disableGloballyAction", "Disable");
DisableGloballyAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IWorkbenchExtensionEnablementService),
  __decorateParam(2, IExtensionService),
  __decorateParam(3, IProductService)
], DisableGloballyAction);
let EnableAIFeaturesGloballyAction = class extends ExtensionAction {
  constructor(productService, configurationService) {
    super(EnableAIFeaturesGloballyAction.ID, EnableAIFeaturesGloballyAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.productService = productService;
    this.configurationService = configurationService;
    this.tooltip = localize("enableAIGloballyActionToolTip", "Enable AI features");
    this.update();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatAIDisabledSettingId)) {
        this.update();
      }
    }));
  }
  update() {
    this.enabled = false;
    if (!this.extension?.local) {
      return;
    }
    if (!ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId)) {
      return;
    }
    if (this.extension.enablementState === EnablementState.DisabledWorkspace) {
      return;
    }
    if (this.extension.enablementState === EnablementState.EnabledWorkspace) {
      return;
    }
    const inspect = this.configurationService.inspect(ChatAIDisabledSettingId);
    if (inspect?.workspaceValue === true) {
      return;
    }
    this.enabled = inspect.value === true;
  }
  async run() {
    await this.configurationService.updateValue(ChatAIDisabledSettingId, false);
  }
};
EnableAIFeaturesGloballyAction.ID = "extensions.enableAIGlobally";
EnableAIFeaturesGloballyAction.LABEL = localize("enableAIGloballyAction", "Enable AI Features");
EnableAIFeaturesGloballyAction = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IConfigurationService)
], EnableAIFeaturesGloballyAction);
let EnableAIFeaturesInWorkspaceAction = class extends ExtensionAction {
  constructor(productService, extensionsWorkbenchService, configurationService, extensionEnablementService) {
    super(EnableAIFeaturesInWorkspaceAction.ID, EnableAIFeaturesInWorkspaceAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.productService = productService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.configurationService = configurationService;
    this.extensionEnablementService = extensionEnablementService;
    this.tooltip = localize("enableAIInWorkspaceActionToolTip", "Enable AI features in this workspace");
    this.update();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatAIDisabledSettingId)) {
        this.update();
      }
    }));
  }
  update() {
    this.enabled = false;
    if (!this.extension?.local) {
      return;
    }
    if (!ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId)) {
      return;
    }
    if (!this.extensionEnablementService.canChangeWorkspaceEnablement(this.extension.local)) {
      return;
    }
    const inspect = this.configurationService.inspect(ChatAIDisabledSettingId);
    if (inspect.value === false) {
      return;
    }
    if (inspect?.workspaceValue === true) {
      this.enabled = true;
      return;
    }
    if (this.extension.enablementState === EnablementState.EnabledWorkspace) {
      return;
    }
    this.enabled = true;
    return;
  }
  async run() {
    if (!this.extension) {
      return;
    }
    await this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.EnabledWorkspace);
    if (this.configurationService.getValue(ChatAIDisabledSettingId) === true) {
      await this.configurationService.updateValue(ChatAIDisabledSettingId, false, ConfigurationTarget.WORKSPACE);
    }
  }
};
EnableAIFeaturesInWorkspaceAction.ID = "extensions.enableAIInWorkspace";
EnableAIFeaturesInWorkspaceAction.LABEL = localize("enableAIInWorkspaceAction", "Enable AI Features (Workspace)");
EnableAIFeaturesInWorkspaceAction = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IWorkbenchExtensionEnablementService)
], EnableAIFeaturesInWorkspaceAction);
let DisableAIFeaturesGloballyAction = class extends ExtensionAction {
  constructor(productService, configurationService) {
    super(DisableAIFeaturesGloballyAction.ID, DisableAIFeaturesGloballyAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.productService = productService;
    this.configurationService = configurationService;
    this.tooltip = localize("disableAIGloballyActionToolTip", "Disable AI features");
    this.update();
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatAIDisabledSettingId)) {
        this.update();
      }
    }));
  }
  update() {
    this.enabled = false;
    if (this.extension && ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId)) {
      this.enabled = this.extension.state === ExtensionState.Installed && this.configurationService.getValue(ChatAIDisabledSettingId) !== true && this.extension.enablementState !== EnablementState.DisabledWorkspace;
    }
  }
  async run() {
    await this.configurationService.updateValue(ChatAIDisabledSettingId, true);
  }
};
DisableAIFeaturesGloballyAction.ID = "extensions.disableAIGlobally";
DisableAIFeaturesGloballyAction.LABEL = localize("disableAIGloballyAction", "Disable AI Features");
DisableAIFeaturesGloballyAction = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IConfigurationService)
], DisableAIFeaturesGloballyAction);
let DisableAIFeaturesInWorkspaceAction = class extends ExtensionAction {
  constructor(productService, extensionsWorkbenchService, extensionEnablementService, extensionService) {
    super(DisableAIFeaturesInWorkspaceAction.ID, DisableAIFeaturesInWorkspaceAction.LABEL, ExtensionAction.LABEL_ACTION_CLASS);
    this.productService = productService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionEnablementService = extensionEnablementService;
    this.extensionService = extensionService;
    this.tooltip = localize("disableAIInWorkspaceActionToolTip", "Disable AI features in this workspace");
    this.update();
    this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
  }
  update() {
    this.enabled = false;
    if (this.extension && this.extension.local && ExtensionIdentifier.equals(this.extension.identifier.id, this.productService.defaultChatAgent?.chatExtensionId)) {
      this.enabled = this.extension.state === ExtensionState.Installed && (this.extension.enablementState === EnablementState.EnabledGlobally || this.extension.enablementState === EnablementState.EnabledWorkspace) && this.extensionEnablementService.canChangeWorkspaceEnablement(this.extension.local);
    }
  }
  async run() {
    if (!this.extension) {
      return;
    }
    await this.extensionsWorkbenchService.setEnablement(this.extension, EnablementState.DisabledWorkspace);
    await this.extensionsWorkbenchService.updateRunningExtensions(localize("restartExtensionHost.reason.disable", "Disabling AI features"));
  }
};
DisableAIFeaturesInWorkspaceAction.ID = "extensions.disableAIInWorkspace";
DisableAIFeaturesInWorkspaceAction.LABEL = localize("disableAIInWorkspaceAction", "Disable AI Features (Workspace)");
DisableAIFeaturesInWorkspaceAction = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IWorkbenchExtensionEnablementService),
  __decorateParam(3, IExtensionService)
], DisableAIFeaturesInWorkspaceAction);
let EnableDropDownAction = class extends ButtonWithDropDownExtensionAction {
  constructor(instantiationService) {
    super("extensions.enable", ExtensionAction.LABEL_ACTION_CLASS, [
      [
        instantiationService.createInstance(EnableGloballyAction),
        instantiationService.createInstance(EnableForWorkspaceAction)
      ],
      [
        instantiationService.createInstance(EnableAIFeaturesGloballyAction),
        instantiationService.createInstance(EnableAIFeaturesInWorkspaceAction)
      ]
    ]);
  }
};
EnableDropDownAction = __decorateClass([
  __decorateParam(0, IInstantiationService)
], EnableDropDownAction);
let DisableDropDownAction = class extends ButtonWithDropDownExtensionAction {
  constructor(instantiationService) {
    super("extensions.disable", ExtensionAction.LABEL_ACTION_CLASS, [
      [
        instantiationService.createInstance(DisableGloballyAction),
        instantiationService.createInstance(DisableForWorkspaceAction)
      ],
      [
        instantiationService.createInstance(DisableAIFeaturesGloballyAction),
        instantiationService.createInstance(DisableAIFeaturesInWorkspaceAction)
      ]
    ]);
  }
};
DisableDropDownAction = __decorateClass([
  __decorateParam(0, IInstantiationService)
], DisableDropDownAction);
let ExtensionRuntimeStateAction = class extends ExtensionAction {
  constructor(hostService, extensionsWorkbenchService, updateService, extensionService, productService, telemetryService) {
    super("extensions.runtimeState", "", ExtensionRuntimeStateAction.DisabledClass, false);
    this.hostService = hostService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.updateService = updateService;
    this.extensionService = extensionService;
    this.productService = productService;
    this.telemetryService = telemetryService;
    this.updateWhenCounterExtensionChanges = true;
    this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
    this.update();
  }
  update() {
    this.enabled = false;
    this.tooltip = "";
    this.class = ExtensionRuntimeStateAction.DisabledClass;
    if (!this.extension) {
      return;
    }
    const state = this.extension.state;
    if (state === ExtensionState.Installing || state === ExtensionState.Uninstalling) {
      return;
    }
    if (this.extension.local && this.extension.local.manifest && this.extension.local.manifest.contributes && this.extension.local.manifest.contributes.localizations && this.extension.local.manifest.contributes.localizations.length > 0) {
      return;
    }
    const runtimeState = this.extension.runtimeState;
    if (!runtimeState) {
      return;
    }
    this.enabled = true;
    this.class = ExtensionRuntimeStateAction.EnabledClass;
    this.tooltip = runtimeState.reason;
    this.label = runtimeState.action === ExtensionRuntimeActionType.ReloadWindow ? localize("reload window", "Reload Window") : runtimeState.action === ExtensionRuntimeActionType.RestartExtensions ? localize("restart extensions", "Restart Extensions") : runtimeState.action === ExtensionRuntimeActionType.QuitAndInstall ? localize("restart product", "Restart to Update") : runtimeState.action === ExtensionRuntimeActionType.ApplyUpdate || runtimeState.action === ExtensionRuntimeActionType.DownloadUpdate ? localize("update product", "Update {0}", this.productService.nameShort) : "";
  }
  async run() {
    const runtimeState = this.extension?.runtimeState;
    if (!runtimeState?.action) {
      return;
    }
    this.telemetryService.publicLog2("extensions:runtimestate:action", {
      action: runtimeState.action
    });
    if (runtimeState?.action === ExtensionRuntimeActionType.ReloadWindow) {
      return this.hostService.reload();
    } else if (runtimeState?.action === ExtensionRuntimeActionType.RestartExtensions) {
      return this.extensionsWorkbenchService.updateRunningExtensions();
    } else if (runtimeState?.action === ExtensionRuntimeActionType.DownloadUpdate) {
      return this.updateService.downloadUpdate(true);
    } else if (runtimeState?.action === ExtensionRuntimeActionType.ApplyUpdate) {
      return this.updateService.applyUpdate();
    } else if (runtimeState?.action === ExtensionRuntimeActionType.QuitAndInstall) {
      return this.updateService.quitAndInstall();
    }
  }
};
ExtensionRuntimeStateAction.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} prominent reload`;
ExtensionRuntimeStateAction.DisabledClass = `${ExtensionRuntimeStateAction.EnabledClass} disabled`;
ExtensionRuntimeStateAction = __decorateClass([
  __decorateParam(0, IHostService),
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IUpdateService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IProductService),
  __decorateParam(5, ITelemetryService)
], ExtensionRuntimeStateAction);
function isThemeFromExtension(theme, extension) {
  return !!(extension && theme.extensionData && ExtensionIdentifier.equals(theme.extensionData.extensionId, extension.identifier.id));
}
function getQuickPickEntries(themes, currentTheme, extension, showCurrentTheme) {
  const picks = [];
  for (const theme of themes) {
    if (isThemeFromExtension(theme, extension) && !(showCurrentTheme && theme === currentTheme)) {
      picks.push({ label: theme.label, id: theme.id });
    }
  }
  if (showCurrentTheme) {
    picks.push({ type: "separator", label: localize("current", "current") });
    picks.push({ label: currentTheme.label, id: currentTheme.id });
  }
  return picks;
}
let SetColorThemeAction = class extends ExtensionAction {
  constructor(extensionService, workbenchThemeService, quickInputService, extensionEnablementService) {
    super(SetColorThemeAction.ID, SetColorThemeAction.TITLE.value, SetColorThemeAction.DisabledClass, false);
    this.workbenchThemeService = workbenchThemeService;
    this.quickInputService = quickInputService;
    this.extensionEnablementService = extensionEnablementService;
    this._register(Event.any(extensionService.onDidChangeExtensions, workbenchThemeService.onDidColorThemeChange)(() => this.update(), this));
    this.update();
  }
  update() {
    this.workbenchThemeService.getColorThemes().then((colorThemes) => {
      this.enabled = this.computeEnablement(colorThemes);
      this.class = this.enabled ? SetColorThemeAction.EnabledClass : SetColorThemeAction.DisabledClass;
    });
  }
  computeEnablement(colorThemes) {
    return !!this.extension && this.extension.state === ExtensionState.Installed && this.extensionEnablementService.isEnabledEnablementState(this.extension.enablementState) && colorThemes.some((th) => isThemeFromExtension(th, this.extension));
  }
  async run({ showCurrentTheme, ignoreFocusLost } = { showCurrentTheme: false, ignoreFocusLost: false }) {
    const colorThemes = await this.workbenchThemeService.getColorThemes();
    if (!this.computeEnablement(colorThemes)) {
      return;
    }
    const currentTheme = this.workbenchThemeService.getColorTheme();
    const delayer = new Delayer(100);
    const picks = getQuickPickEntries(colorThemes, currentTheme, this.extension, showCurrentTheme);
    const pickedTheme = await this.quickInputService.pick(
      picks,
      {
        placeHolder: localize("select color theme", "Select Color Theme"),
        onDidFocus: (item) => delayer.trigger(() => this.workbenchThemeService.setColorTheme(item.id, void 0)),
        ignoreFocusLost
      }
    );
    return this.workbenchThemeService.setColorTheme(pickedTheme ? pickedTheme.id : currentTheme.id, "auto");
  }
};
SetColorThemeAction.ID = "workbench.extensions.action.setColorTheme";
SetColorThemeAction.TITLE = localize2("workbench.extensions.action.setColorTheme", "Set Color Theme");
SetColorThemeAction.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} theme`;
SetColorThemeAction.DisabledClass = `${SetColorThemeAction.EnabledClass} disabled`;
SetColorThemeAction = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IWorkbenchThemeService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, IWorkbenchExtensionEnablementService)
], SetColorThemeAction);
let SetFileIconThemeAction = class extends ExtensionAction {
  constructor(extensionService, workbenchThemeService, quickInputService, extensionEnablementService) {
    super(SetFileIconThemeAction.ID, SetFileIconThemeAction.TITLE.value, SetFileIconThemeAction.DisabledClass, false);
    this.workbenchThemeService = workbenchThemeService;
    this.quickInputService = quickInputService;
    this.extensionEnablementService = extensionEnablementService;
    this._register(Event.any(extensionService.onDidChangeExtensions, workbenchThemeService.onDidFileIconThemeChange)(() => this.update(), this));
    this.update();
  }
  update() {
    this.workbenchThemeService.getFileIconThemes().then((fileIconThemes) => {
      this.enabled = this.computeEnablement(fileIconThemes);
      this.class = this.enabled ? SetFileIconThemeAction.EnabledClass : SetFileIconThemeAction.DisabledClass;
    });
  }
  computeEnablement(colorThemfileIconThemess) {
    return !!this.extension && this.extension.state === ExtensionState.Installed && this.extensionEnablementService.isEnabledEnablementState(this.extension.enablementState) && colorThemfileIconThemess.some((th) => isThemeFromExtension(th, this.extension));
  }
  async run({ showCurrentTheme, ignoreFocusLost } = { showCurrentTheme: false, ignoreFocusLost: false }) {
    const fileIconThemes = await this.workbenchThemeService.getFileIconThemes();
    if (!this.computeEnablement(fileIconThemes)) {
      return;
    }
    const currentTheme = this.workbenchThemeService.getFileIconTheme();
    const delayer = new Delayer(100);
    const picks = getQuickPickEntries(fileIconThemes, currentTheme, this.extension, showCurrentTheme);
    const pickedTheme = await this.quickInputService.pick(
      picks,
      {
        placeHolder: localize("select file icon theme", "Select File Icon Theme"),
        onDidFocus: (item) => delayer.trigger(() => this.workbenchThemeService.setFileIconTheme(item.id, void 0)),
        ignoreFocusLost
      }
    );
    return this.workbenchThemeService.setFileIconTheme(pickedTheme ? pickedTheme.id : currentTheme.id, "auto");
  }
};
SetFileIconThemeAction.ID = "workbench.extensions.action.setFileIconTheme";
SetFileIconThemeAction.TITLE = localize2("workbench.extensions.action.setFileIconTheme", "Set File Icon Theme");
SetFileIconThemeAction.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} theme`;
SetFileIconThemeAction.DisabledClass = `${SetFileIconThemeAction.EnabledClass} disabled`;
SetFileIconThemeAction = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IWorkbenchThemeService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, IWorkbenchExtensionEnablementService)
], SetFileIconThemeAction);
let SetProductIconThemeAction = class extends ExtensionAction {
  constructor(extensionService, workbenchThemeService, quickInputService, extensionEnablementService) {
    super(SetProductIconThemeAction.ID, SetProductIconThemeAction.TITLE.value, SetProductIconThemeAction.DisabledClass, false);
    this.workbenchThemeService = workbenchThemeService;
    this.quickInputService = quickInputService;
    this.extensionEnablementService = extensionEnablementService;
    this._register(Event.any(extensionService.onDidChangeExtensions, workbenchThemeService.onDidProductIconThemeChange)(() => this.update(), this));
    this.update();
  }
  update() {
    this.workbenchThemeService.getProductIconThemes().then((productIconThemes) => {
      this.enabled = this.computeEnablement(productIconThemes);
      this.class = this.enabled ? SetProductIconThemeAction.EnabledClass : SetProductIconThemeAction.DisabledClass;
    });
  }
  computeEnablement(productIconThemes) {
    return !!this.extension && this.extension.state === ExtensionState.Installed && this.extensionEnablementService.isEnabledEnablementState(this.extension.enablementState) && productIconThemes.some((th) => isThemeFromExtension(th, this.extension));
  }
  async run({ showCurrentTheme, ignoreFocusLost } = { showCurrentTheme: false, ignoreFocusLost: false }) {
    const productIconThemes = await this.workbenchThemeService.getProductIconThemes();
    if (!this.computeEnablement(productIconThemes)) {
      return;
    }
    const currentTheme = this.workbenchThemeService.getProductIconTheme();
    const delayer = new Delayer(100);
    const picks = getQuickPickEntries(productIconThemes, currentTheme, this.extension, showCurrentTheme);
    const pickedTheme = await this.quickInputService.pick(
      picks,
      {
        placeHolder: localize("select product icon theme", "Select Product Icon Theme"),
        onDidFocus: (item) => delayer.trigger(() => this.workbenchThemeService.setProductIconTheme(item.id, void 0)),
        ignoreFocusLost
      }
    );
    return this.workbenchThemeService.setProductIconTheme(pickedTheme ? pickedTheme.id : currentTheme.id, "auto");
  }
};
SetProductIconThemeAction.ID = "workbench.extensions.action.setProductIconTheme";
SetProductIconThemeAction.TITLE = localize2("workbench.extensions.action.setProductIconTheme", "Set Product Icon Theme");
SetProductIconThemeAction.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} theme`;
SetProductIconThemeAction.DisabledClass = `${SetProductIconThemeAction.EnabledClass} disabled`;
SetProductIconThemeAction = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IWorkbenchThemeService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, IWorkbenchExtensionEnablementService)
], SetProductIconThemeAction);
let SetLanguageAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService) {
    super(SetLanguageAction.ID, SetLanguageAction.TITLE.value, SetLanguageAction.DisabledClass, false);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = SetLanguageAction.DisabledClass;
    if (!this.extension) {
      return;
    }
    if (!this.extensionsWorkbenchService.canSetLanguage(this.extension)) {
      return;
    }
    if (this.extension.gallery && language === getLocale(this.extension.gallery)) {
      return;
    }
    this.enabled = true;
    this.class = SetLanguageAction.EnabledClass;
  }
  async run() {
    return this.extension && this.extensionsWorkbenchService.setLanguage(this.extension);
  }
};
SetLanguageAction.ID = "workbench.extensions.action.setDisplayLanguage";
SetLanguageAction.TITLE = localize2("workbench.extensions.action.setDisplayLanguage", "Set Display Language");
SetLanguageAction.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} language`;
SetLanguageAction.DisabledClass = `${SetLanguageAction.EnabledClass} disabled`;
SetLanguageAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService)
], SetLanguageAction);
let ClearLanguageAction = class extends ExtensionAction {
  constructor(extensionsWorkbenchService, localeService) {
    super(ClearLanguageAction.ID, ClearLanguageAction.TITLE.value, ClearLanguageAction.DisabledClass, false);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.localeService = localeService;
    this.update();
  }
  update() {
    this.enabled = false;
    this.class = ClearLanguageAction.DisabledClass;
    if (!this.extension) {
      return;
    }
    if (!this.extensionsWorkbenchService.canSetLanguage(this.extension)) {
      return;
    }
    if (this.extension.gallery && language !== getLocale(this.extension.gallery)) {
      return;
    }
    this.enabled = true;
    this.class = ClearLanguageAction.EnabledClass;
  }
  async run() {
    return this.extension && this.localeService.clearLocalePreference();
  }
};
ClearLanguageAction.ID = "workbench.extensions.action.clearLanguage";
ClearLanguageAction.TITLE = localize2("workbench.extensions.action.clearLanguage", "Clear Display Language");
ClearLanguageAction.EnabledClass = `${ExtensionAction.LABEL_ACTION_CLASS} language`;
ClearLanguageAction.DisabledClass = `${ClearLanguageAction.EnabledClass} disabled`;
ClearLanguageAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, ILocaleService)
], ClearLanguageAction);
let ShowRecommendedExtensionAction = class extends Action {
  constructor(extensionId, extensionWorkbenchService) {
    super(ShowRecommendedExtensionAction.ID, ShowRecommendedExtensionAction.LABEL, void 0, false);
    this.extensionWorkbenchService = extensionWorkbenchService;
    this.extensionId = extensionId;
  }
  async run() {
    await this.extensionWorkbenchService.openSearch(`@id:${this.extensionId}`);
    const [extension] = await this.extensionWorkbenchService.getExtensions([{ id: this.extensionId }], { source: "install-recommendation" }, CancellationToken.None);
    if (extension) {
      return this.extensionWorkbenchService.open(extension);
    }
    return null;
  }
};
ShowRecommendedExtensionAction.ID = "workbench.extensions.action.showRecommendedExtension";
ShowRecommendedExtensionAction.LABEL = localize("showRecommendedExtension", "Show Recommended Extension");
ShowRecommendedExtensionAction = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService)
], ShowRecommendedExtensionAction);
let InstallRecommendedExtensionAction = class extends Action {
  constructor(extensionId, instantiationService, extensionWorkbenchService) {
    super(InstallRecommendedExtensionAction.ID, InstallRecommendedExtensionAction.LABEL, void 0, false);
    this.instantiationService = instantiationService;
    this.extensionWorkbenchService = extensionWorkbenchService;
    this.extensionId = extensionId;
  }
  async run() {
    await this.extensionWorkbenchService.openSearch(`@id:${this.extensionId}`);
    const [extension] = await this.extensionWorkbenchService.getExtensions([{ id: this.extensionId }], { source: "install-recommendation" }, CancellationToken.None);
    if (extension) {
      await this.extensionWorkbenchService.open(extension);
      try {
        await this.extensionWorkbenchService.install(extension);
      } catch (err) {
        this.instantiationService.createInstance(PromptExtensionInstallFailureAction, extension, void 0, extension.latestVersion, InstallOperation.Install, err).run();
      }
    }
  }
};
InstallRecommendedExtensionAction.ID = "workbench.extensions.action.installRecommendedExtension";
InstallRecommendedExtensionAction.LABEL = localize("installRecommendedExtension", "Install Recommended Extension");
InstallRecommendedExtensionAction = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IExtensionsWorkbenchService)
], InstallRecommendedExtensionAction);
let IgnoreExtensionRecommendationAction = class extends Action {
  constructor(extension, extensionRecommendationsManagementService) {
    super(IgnoreExtensionRecommendationAction.ID, "Ignore Recommendation");
    this.extension = extension;
    this.extensionRecommendationsManagementService = extensionRecommendationsManagementService;
    this.class = IgnoreExtensionRecommendationAction.Class;
    this.tooltip = localize("ignoreExtensionRecommendation", "Do not recommend this extension again");
    this.enabled = true;
  }
  run() {
    this.extensionRecommendationsManagementService.toggleGlobalIgnoredRecommendation(this.extension.identifier.id, true);
    return Promise.resolve();
  }
};
IgnoreExtensionRecommendationAction.ID = "extensions.ignore";
IgnoreExtensionRecommendationAction.Class = `${ExtensionAction.LABEL_ACTION_CLASS} ignore`;
IgnoreExtensionRecommendationAction = __decorateClass([
  __decorateParam(1, IExtensionIgnoredRecommendationsService)
], IgnoreExtensionRecommendationAction);
let UndoIgnoreExtensionRecommendationAction = class extends Action {
  constructor(extension, extensionRecommendationsManagementService) {
    super(UndoIgnoreExtensionRecommendationAction.ID, "Undo");
    this.extension = extension;
    this.extensionRecommendationsManagementService = extensionRecommendationsManagementService;
    this.class = UndoIgnoreExtensionRecommendationAction.Class;
    this.tooltip = localize("undo", "Undo");
    this.enabled = true;
  }
  run() {
    this.extensionRecommendationsManagementService.toggleGlobalIgnoredRecommendation(this.extension.identifier.id, false);
    return Promise.resolve();
  }
};
UndoIgnoreExtensionRecommendationAction.ID = "extensions.ignore";
UndoIgnoreExtensionRecommendationAction.Class = `${ExtensionAction.LABEL_ACTION_CLASS} undo-ignore`;
UndoIgnoreExtensionRecommendationAction = __decorateClass([
  __decorateParam(1, IExtensionIgnoredRecommendationsService)
], UndoIgnoreExtensionRecommendationAction);
let AbstractConfigureRecommendedExtensionsAction = class extends Action {
  constructor(id, label, contextService, fileService, textFileService, editorService, jsonEditingService, textModelResolverService) {
    super(id, label);
    this.contextService = contextService;
    this.fileService = fileService;
    this.textFileService = textFileService;
    this.editorService = editorService;
    this.jsonEditingService = jsonEditingService;
    this.textModelResolverService = textModelResolverService;
  }
  openExtensionsFile(extensionsFileResource) {
    return this.getOrCreateExtensionsFile(extensionsFileResource).then(
      ({ created, content }) => this.getSelectionPosition(content, extensionsFileResource, ["recommendations"]).then((selection) => this.editorService.openEditor({
        resource: extensionsFileResource,
        options: {
          pinned: created,
          selection
        }
      })),
      (error) => Promise.reject(new Error(localize("OpenExtensionsFile.failed", "Unable to create 'extensions.json' file inside the '.vscode' folder ({0}).", error)))
    );
  }
  openWorkspaceConfigurationFile(workspaceConfigurationFile) {
    return this.getOrUpdateWorkspaceConfigurationFile(workspaceConfigurationFile).then((content) => this.getSelectionPosition(content.value.toString(), content.resource, ["extensions", "recommendations"])).then((selection) => this.editorService.openEditor({
      resource: workspaceConfigurationFile,
      options: {
        selection,
        forceReload: true
        // because content has changed
      }
    }));
  }
  getOrUpdateWorkspaceConfigurationFile(workspaceConfigurationFile) {
    return Promise.resolve(this.fileService.readFile(workspaceConfigurationFile)).then((content) => {
      const workspaceRecommendations = json.parse(content.value.toString())["extensions"];
      if (!workspaceRecommendations || !workspaceRecommendations.recommendations) {
        return this.jsonEditingService.write(workspaceConfigurationFile, [{ path: ["extensions"], value: { recommendations: [] } }], true).then(() => this.fileService.readFile(workspaceConfigurationFile));
      }
      return content;
    });
  }
  getSelectionPosition(content, resource, path) {
    const tree = json.parseTree(content);
    const node = json.findNodeAtLocation(tree, path);
    if (node && node.parent && node.parent.children) {
      const recommendationsValueNode = node.parent.children[1];
      const lastExtensionNode = recommendationsValueNode.children && recommendationsValueNode.children.length ? recommendationsValueNode.children[recommendationsValueNode.children.length - 1] : null;
      const offset = lastExtensionNode ? lastExtensionNode.offset + lastExtensionNode.length : recommendationsValueNode.offset + 1;
      return Promise.resolve(this.textModelResolverService.createModelReference(resource)).then((reference) => {
        const position = reference.object.textEditorModel.getPositionAt(offset);
        reference.dispose();
        return {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        };
      });
    }
    return Promise.resolve(void 0);
  }
  getOrCreateExtensionsFile(extensionsFileResource) {
    return Promise.resolve(this.fileService.readFile(extensionsFileResource)).then((content) => {
      return { created: false, extensionsFileResource, content: content.value.toString() };
    }, (err) => {
      return this.textFileService.write(extensionsFileResource, ExtensionsConfigurationInitialContent).then(() => {
        return { created: true, extensionsFileResource, content: ExtensionsConfigurationInitialContent };
      });
    });
  }
};
AbstractConfigureRecommendedExtensionsAction = __decorateClass([
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IFileService),
  __decorateParam(4, ITextFileService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IJSONEditingService),
  __decorateParam(7, ITextModelService)
], AbstractConfigureRecommendedExtensionsAction);
let ConfigureWorkspaceRecommendedExtensionsAction = class extends AbstractConfigureRecommendedExtensionsAction {
  constructor(id, label, fileService, textFileService, contextService, editorService, jsonEditingService, textModelResolverService) {
    super(id, label, contextService, fileService, textFileService, editorService, jsonEditingService, textModelResolverService);
    this._register(this.contextService.onDidChangeWorkbenchState(() => this.update(), this));
    this.update();
  }
  update() {
    this.enabled = this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY;
  }
  run() {
    switch (this.contextService.getWorkbenchState()) {
      case WorkbenchState.FOLDER:
        return this.openExtensionsFile(this.contextService.getWorkspace().folders[0].toResource(EXTENSIONS_CONFIG));
      case WorkbenchState.WORKSPACE:
        return this.openWorkspaceConfigurationFile(this.contextService.getWorkspace().configuration);
    }
    return Promise.resolve();
  }
};
ConfigureWorkspaceRecommendedExtensionsAction.ID = "workbench.extensions.action.configureWorkspaceRecommendedExtensions";
ConfigureWorkspaceRecommendedExtensionsAction.LABEL = localize("configureWorkspaceRecommendedExtensions", "Configure Recommended Extensions (Workspace)");
ConfigureWorkspaceRecommendedExtensionsAction = __decorateClass([
  __decorateParam(2, IFileService),
  __decorateParam(3, ITextFileService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IJSONEditingService),
  __decorateParam(7, ITextModelService)
], ConfigureWorkspaceRecommendedExtensionsAction);
let ConfigureWorkspaceFolderRecommendedExtensionsAction = class extends AbstractConfigureRecommendedExtensionsAction {
  constructor(id, label, fileService, textFileService, contextService, editorService, jsonEditingService, textModelResolverService, commandService) {
    super(id, label, contextService, fileService, textFileService, editorService, jsonEditingService, textModelResolverService);
    this.commandService = commandService;
  }
  run() {
    const folderCount = this.contextService.getWorkspace().folders.length;
    const pickFolderPromise = folderCount === 1 ? Promise.resolve(this.contextService.getWorkspace().folders[0]) : this.commandService.executeCommand(PICK_WORKSPACE_FOLDER_COMMAND_ID);
    return Promise.resolve(pickFolderPromise).then((workspaceFolder) => {
      if (workspaceFolder) {
        return this.openExtensionsFile(workspaceFolder.toResource(EXTENSIONS_CONFIG));
      }
      return null;
    });
  }
};
ConfigureWorkspaceFolderRecommendedExtensionsAction.ID = "workbench.extensions.action.configureWorkspaceFolderRecommendedExtensions";
ConfigureWorkspaceFolderRecommendedExtensionsAction.LABEL = localize("configureWorkspaceFolderRecommendedExtensions", "Configure Recommended Extensions (Workspace Folder)");
ConfigureWorkspaceFolderRecommendedExtensionsAction = __decorateClass([
  __decorateParam(2, IFileService),
  __decorateParam(3, ITextFileService),
  __decorateParam(4, IWorkspaceContextService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IJSONEditingService),
  __decorateParam(7, ITextModelService),
  __decorateParam(8, ICommandService)
], ConfigureWorkspaceFolderRecommendedExtensionsAction);
let ExtensionStatusLabelAction = class extends Action {
  constructor(extensionService, extensionManagementServerService, extensionEnablementService) {
    super("extensions.action.statusLabel", "", ExtensionStatusLabelAction.DISABLED_CLASS, false);
    this.extensionService = extensionService;
    this.extensionManagementServerService = extensionManagementServerService;
    this.extensionEnablementService = extensionEnablementService;
    this.initialStatus = null;
    this.status = null;
    this.version = null;
    this.enablementState = null;
    this._extension = null;
  }
  get extension() {
    return this._extension;
  }
  set extension(extension) {
    if (!(this._extension && extension && areSameExtensions(this._extension.identifier, extension.identifier))) {
      this.initialStatus = null;
      this.status = null;
      this.enablementState = null;
    }
    this._extension = extension;
    this.update();
  }
  update() {
    const label = this.computeLabel();
    this.label = label || "";
    this.class = label ? ExtensionStatusLabelAction.ENABLED_CLASS : ExtensionStatusLabelAction.DISABLED_CLASS;
  }
  computeLabel() {
    if (!this.extension) {
      return null;
    }
    const currentStatus = this.status;
    const currentVersion = this.version;
    const currentEnablementState = this.enablementState;
    this.status = this.extension.state;
    this.version = this.extension.version;
    if (this.initialStatus === null) {
      this.initialStatus = this.status;
    }
    this.enablementState = this.extension.enablementState;
    const canAddExtension = () => {
      const runningExtension = this.extensionService.extensions.filter((e) => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier))[0];
      if (this.extension.local) {
        if (runningExtension && this.extension.version === runningExtension.version) {
          return true;
        }
        return this.extensionService.canAddExtension(toExtensionDescription(this.extension.local));
      }
      return false;
    };
    const canRemoveExtension = () => {
      if (this.extension.local) {
        if (this.extensionService.extensions.every((e) => !(areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier) && this.extension.server === this.extensionManagementServerService.getExtensionManagementServer(toExtension(e))))) {
          return true;
        }
        return this.extensionService.canRemoveExtension(toExtensionDescription(this.extension.local));
      }
      return false;
    };
    if (currentStatus !== null) {
      if (currentStatus === ExtensionState.Installing && this.status === ExtensionState.Installed) {
        if (this.initialStatus === ExtensionState.Uninstalled && canAddExtension()) {
          return localize("installed", "Installed");
        }
        if (this.initialStatus === ExtensionState.Installed && this.version !== currentVersion && canAddExtension()) {
          return localize("updated", "Updated");
        }
        return null;
      }
      if (currentStatus === ExtensionState.Uninstalling && this.status === ExtensionState.Uninstalled) {
        this.initialStatus = this.status;
        return canRemoveExtension() ? localize("uninstalled", "Uninstalled") : null;
      }
    }
    if (currentEnablementState !== null) {
      const currentlyEnabled = this.extensionEnablementService.isEnabledEnablementState(currentEnablementState);
      const enabled = this.extensionEnablementService.isEnabledEnablementState(this.enablementState);
      if (!currentlyEnabled && enabled) {
        return canAddExtension() ? localize("enabled", "Enabled") : null;
      }
      if (currentlyEnabled && !enabled) {
        return canRemoveExtension() ? localize("disabled", "Disabled") : null;
      }
    }
    return null;
  }
  run() {
    return Promise.resolve();
  }
};
ExtensionStatusLabelAction.ENABLED_CLASS = `${ExtensionAction.TEXT_ACTION_CLASS} extension-status-label`;
ExtensionStatusLabelAction.DISABLED_CLASS = `${ExtensionStatusLabelAction.ENABLED_CLASS} hide`;
ExtensionStatusLabelAction = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IExtensionManagementServerService),
  __decorateParam(2, IWorkbenchExtensionEnablementService)
], ExtensionStatusLabelAction);
let ToggleSyncExtensionAction = class extends DropDownExtensionAction {
  constructor(configurationService, extensionsWorkbenchService, userDataSyncEnablementService, instantiationService) {
    super("extensions.sync", "", ToggleSyncExtensionAction.SYNC_CLASS, false, instantiationService);
    this.configurationService = configurationService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this._register(Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.affectsConfiguration("settingsSync.ignoredExtensions"))(() => this.update()));
    this._register(userDataSyncEnablementService.onDidChangeEnablement(() => this.update()));
    this.update();
  }
  update() {
    this.enabled = !!this.extension && this.userDataSyncEnablementService.isEnabled() && this.extension.state === ExtensionState.Installed;
    if (this.extension) {
      const isIgnored = this.extensionsWorkbenchService.isExtensionIgnoredToSync(this.extension);
      this.class = isIgnored ? ToggleSyncExtensionAction.IGNORED_SYNC_CLASS : ToggleSyncExtensionAction.SYNC_CLASS;
      this.tooltip = isIgnored ? localize("ignored", "This extension is ignored during sync") : localize("synced", "This extension is synced");
    }
  }
  async run() {
    return super.run([
      [
        new Action(
          "extensions.syncignore",
          this.extensionsWorkbenchService.isExtensionIgnoredToSync(this.extension) ? localize("sync", "Sync this extension") : localize("do not sync", "Do not sync this extension"),
          void 0,
          true,
          () => this.extensionsWorkbenchService.toggleExtensionIgnoredToSync(this.extension)
        )
      ]
    ]);
  }
};
ToggleSyncExtensionAction.IGNORED_SYNC_CLASS = `${ExtensionAction.ICON_ACTION_CLASS} extension-sync ${ThemeIcon.asClassName(syncIgnoredIcon)}`;
ToggleSyncExtensionAction.SYNC_CLASS = `${ToggleSyncExtensionAction.ICON_ACTION_CLASS} extension-sync ${ThemeIcon.asClassName(syncEnabledIcon)}`;
ToggleSyncExtensionAction = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IUserDataSyncEnablementService),
  __decorateParam(3, IInstantiationService)
], ToggleSyncExtensionAction);
let ExtensionStatusAction = class extends ExtensionAction {
  constructor(extensionManagementServerService, labelService, commandService, workspaceTrustEnablementService, workspaceTrustService, extensionsWorkbenchService, extensionService, extensionManifestPropertiesService, contextService, productService, allowedExtensionsService, workbenchExtensionEnablementService, extensionFeaturesManagementService, extensionGalleryManifestService, configurationService) {
    super("extensions.status", "", `${ExtensionStatusAction.CLASS} hide`, false);
    this.extensionManagementServerService = extensionManagementServerService;
    this.labelService = labelService;
    this.commandService = commandService;
    this.workspaceTrustEnablementService = workspaceTrustEnablementService;
    this.workspaceTrustService = workspaceTrustService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.extensionService = extensionService;
    this.extensionManifestPropertiesService = extensionManifestPropertiesService;
    this.contextService = contextService;
    this.productService = productService;
    this.allowedExtensionsService = allowedExtensionsService;
    this.workbenchExtensionEnablementService = workbenchExtensionEnablementService;
    this.extensionFeaturesManagementService = extensionFeaturesManagementService;
    this.extensionGalleryManifestService = extensionGalleryManifestService;
    this.configurationService = configurationService;
    this.updateWhenCounterExtensionChanges = true;
    this._status = [];
    this._onDidChangeStatus = this._register(new Emitter());
    this.onDidChangeStatus = this._onDidChangeStatus.event;
    this.updateThrottler = this._register(new Throttler());
    this._register(this.labelService.onDidChangeFormatters(() => this.update(), this));
    this._register(this.extensionService.onDidChangeExtensions(() => this.update()));
    this._register(this.extensionFeaturesManagementService.onDidChangeAccessData(() => this.update()));
    this._register(allowedExtensionsService.onDidChangeAllowedExtensionsConfigValue(() => this.update()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AutoUpdateConfigurationKey)) {
        this.update();
      }
    }));
    this.update();
  }
  get status() {
    return this._status;
  }
  update() {
    this.recomputeStatus();
  }
  /**
   * Recomputes the status and returns a promise that resolves when the
   * computation is done. Use this when callers need to await time-sensitive
   * status content (e.g. the delayed auto-update message) before reading it.
   */
  recomputeStatus() {
    return this.updateThrottler.queue(() => this.computeAndUpdateStatus());
  }
  async computeAndUpdateStatus() {
    this.updateStatus(void 0, true);
    this.enabled = false;
    if (!this.extension) {
      return;
    }
    if (this.extension.isMalicious) {
      this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize("malicious tooltip", "This extension was reported to be problematic.")) }, true);
      return;
    }
    if (this.extension.state === ExtensionState.Uninstalled && this.extension.gallery && !this.extension.gallery.isSigned && shouldRequireRepositorySignatureFor(this.extension.private, await this.extensionGalleryManifestService.getExtensionGalleryManifest())) {
      this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize("not signed tooltip", "This extension is not signed by the Extension Marketplace.")) }, true);
      return;
    }
    if (this.extension.deprecationInfo) {
      if (this.extension.deprecationInfo.extension) {
        const link = `[${this.extension.deprecationInfo.extension.displayName}](${createCommandUri("extension.open", this.extension.deprecationInfo.extension.id)})`;
        this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize("deprecated with alternate extension tooltip", "This extension is deprecated. Use the {0} extension instead.", link)) }, true);
      } else if (this.extension.deprecationInfo.settings) {
        const link = `[${localize("settings", "settings")}](${createCommandUri("workbench.action.openSettings", this.extension.deprecationInfo.settings.map((setting) => `@id:${setting}`).join(" "))}})`;
        this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize("deprecated with alternate settings tooltip", "This extension is deprecated as this functionality is now built-in to VS Code. Configure these {0} to use this functionality.", link)) }, true);
      } else {
        const message = new MarkdownString(localize("deprecated tooltip", "This extension is deprecated as it is no longer being maintained."));
        if (this.extension.deprecationInfo.additionalInfo) {
          message.appendMarkdown(` ${this.extension.deprecationInfo.additionalInfo}`);
        }
        this.updateStatus({ icon: warningIcon, message }, true);
      }
      return;
    }
    if (this.extension.missingFromGallery) {
      this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize("missing from gallery tooltip", "This extension is no longer available on the Extension Marketplace.")) }, true);
      return;
    }
    if (this.extensionsWorkbenchService.canSetLanguage(this.extension)) {
      return;
    }
    if (this.extension.outdated) {
      let hasConsentWarning = false;
      const message = await this.extensionsWorkbenchService.shouldRequireConsentToUpdate(this.extension);
      if (message) {
        hasConsentWarning = true;
        const markdown = new MarkdownString();
        markdown.appendMarkdown(`${message} `);
        markdown.appendMarkdown(
          localize(
            "auto update message",
            "Please [review the extension]({0}) and update it manually.",
            this.extension.hasChangelog() ? createCommandUri("extension.open", this.extension.identifier.id, ExtensionEditorTab.Changelog).toString() : this.extension.repository ? this.extension.repository : createCommandUri("extension.open", this.extension.identifier.id).toString()
          )
        );
        this.updateStatus({ icon: warningIcon, message: markdown }, true);
      }
      if (this.extensionsWorkbenchService.isAutoUpdateDelayed(this.extension)) {
        const delay = fromNow(Date.now() - this.extensionsWorkbenchService.getAutoUpdateDelay(), false, true);
        const updateAt = fromNow(Date.now() + this.extensionsWorkbenchService.getAutoUpdateDelayRemaining(this.extension), false, true);
        this.updateStatus({ icon: infoIcon, message: new MarkdownString(localize("autoUpdateDelayed", "This extension is not updated yet because new versions are auto updated {0} after they are published. It will be auto updated {1}.", delay, updateAt)) }, !hasConsentWarning);
      }
    }
    if (this.extension.gallery && this.extension.state === ExtensionState.Uninstalled) {
      const result = await this.extensionsWorkbenchService.canInstall(this.extension);
      if (result !== true) {
        this.updateStatus({ icon: warningIcon, message: result }, true);
        return;
      }
    }
    if (!this.extension.local || !this.extension.server || this.extension.state !== ExtensionState.Installed) {
      return;
    }
    if (this.extension.enablementState === EnablementState.DisabledByAllowlist) {
      const result = this.allowedExtensionsService.isAllowed(this.extension.local);
      if (result !== true) {
        this.updateStatus({ icon: warningIcon, message: new MarkdownString(localize("disabled - not allowed", "This extension is disabled because {0}", result.value)) }, true);
        return;
      }
    }
    if (this.extension.enablementState === EnablementState.DisabledByEnvironment) {
      this.updateStatus({ message: new MarkdownString(localize("disabled by environment", "This extension is disabled by the environment.")) }, true);
      return;
    }
    if (this.extension.enablementState === EnablementState.EnabledByEnvironment) {
      this.updateStatus({ message: new MarkdownString(localize("enabled by environment", "This extension is enabled because it is required in the current environment.")) }, true);
      return;
    }
    if (this.extension.enablementState === EnablementState.DisabledByVirtualWorkspace) {
      const details = getWorkspaceSupportTypeMessage(this.extension.local.manifest.capabilities?.virtualWorkspaces);
      this.updateStatus({ icon: infoIcon, message: new MarkdownString(details ? escapeMarkdownSyntaxTokens(details) : localize("disabled because of virtual workspace", "This extension has been disabled because it does not support virtual workspaces.")) }, true);
      return;
    }
    if (isVirtualWorkspace(this.contextService.getWorkspace())) {
      const virtualSupportType = this.extensionManifestPropertiesService.getExtensionVirtualWorkspaceSupportType(this.extension.local.manifest);
      const details = getWorkspaceSupportTypeMessage(this.extension.local.manifest.capabilities?.virtualWorkspaces);
      if (virtualSupportType === "limited" || details) {
        this.updateStatus({ icon: warningIcon, message: new MarkdownString(details ? escapeMarkdownSyntaxTokens(details) : localize("extension limited because of virtual workspace", "This extension has limited features because the current workspace is virtual.")) }, true);
        return;
      }
    }
    if (this.extension.enablementState === EnablementState.DisabledByUnification) {
      this.updateStatus({ icon: infoIcon, message: new MarkdownString(localize("extension disabled because of unification", "All GitHub Copilot functionality is now being served from the GitHub Copilot Chat extension. To temporarily opt out of this extension unification, toggle the {0} setting.", "`chat.extensionUnification.enabled`")) }, true);
      return;
    }
    if (!this.workspaceTrustService.isWorkspaceTrusted() && // Extension is disabled by untrusted workspace
    (this.extension.enablementState === EnablementState.DisabledByTrustRequirement || // All disabled dependencies of the extension are disabled by untrusted workspace
    this.extension.enablementState === EnablementState.DisabledByExtensionDependency && this.workbenchExtensionEnablementService.getDependenciesEnablementStates(this.extension.local).every(([, enablementState]) => this.workbenchExtensionEnablementService.isEnabledEnablementState(enablementState) || enablementState === EnablementState.DisabledByTrustRequirement))) {
      this.enabled = true;
      const untrustedDetails = getWorkspaceSupportTypeMessage(this.extension.local.manifest.capabilities?.untrustedWorkspaces);
      this.updateStatus({ icon: trustIcon, message: new MarkdownString(untrustedDetails ? escapeMarkdownSyntaxTokens(untrustedDetails) : localize("extension disabled because of trust requirement", "This extension has been disabled because the current workspace is not trusted.")) }, true);
      return;
    }
    if (this.workspaceTrustEnablementService.isWorkspaceTrustEnabled() && !this.workspaceTrustService.isWorkspaceTrusted()) {
      const untrustedSupportType = this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(this.extension.local.manifest);
      const untrustedDetails = getWorkspaceSupportTypeMessage(this.extension.local.manifest.capabilities?.untrustedWorkspaces);
      if (untrustedSupportType === "limited" || untrustedDetails) {
        this.enabled = true;
        this.updateStatus({ icon: trustIcon, message: new MarkdownString(untrustedDetails ? escapeMarkdownSyntaxTokens(untrustedDetails) : localize("extension limited because of trust requirement", "This extension has limited features because the current workspace is not trusted.")) }, true);
        return;
      }
    }
    if (this.extension.enablementState === EnablementState.DisabledByExtensionKind) {
      if (!this.extensionsWorkbenchService.installed.some((e) => areSameExtensions(e.identifier, this.extension.identifier) && e.server !== this.extension.server)) {
        let message;
        if (this.extensionManagementServerService.localExtensionManagementServer === this.extension.server) {
          if (this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(this.extension.local.manifest)) {
            if (this.extensionManagementServerService.remoteExtensionManagementServer) {
              message = new MarkdownString(`${localize("Install in remote server to enable", "This extension is disabled in this workspace because it is defined to run in the Remote Extension Host. Please install the extension in '{0}' to enable.", this.extensionManagementServerService.remoteExtensionManagementServer.label)} [${localize("learn more", "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`);
            }
          }
        } else if (this.extensionManagementServerService.remoteExtensionManagementServer === this.extension.server) {
          if (this.extensionManifestPropertiesService.prefersExecuteOnUI(this.extension.local.manifest)) {
            if (this.extensionManagementServerService.localExtensionManagementServer) {
              message = new MarkdownString(`${localize("Install in local server to enable", "This extension is disabled in this workspace because it is defined to run in the Local Extension Host. Please install the extension locally to enable.", this.extensionManagementServerService.remoteExtensionManagementServer.label)} [${localize("learn more", "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`);
            } else if (isWeb) {
              message = new MarkdownString(`${localize("Defined to run in desktop", "This extension is disabled because it is defined to run only in {0} for the Desktop.", this.productService.nameLong)} [${localize("learn more", "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`);
            }
          }
        } else if (this.extensionManagementServerService.webExtensionManagementServer === this.extension.server) {
          message = new MarkdownString(`${localize("Cannot be enabled", "This extension is disabled because it is not supported in {0} for the Web.", this.productService.nameLong)} [${localize("learn more", "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`);
        }
        if (message) {
          this.updateStatus({ icon: warningIcon, message }, true);
        }
        return;
      }
    }
    const extensionId = new ExtensionIdentifier(this.extension.identifier.id);
    const features = Registry.as(Extensions.ExtensionFeaturesRegistry).getExtensionFeatures();
    for (const feature of features) {
      const status = this.extensionFeaturesManagementService.getAccessData(extensionId, feature.id)?.current?.status;
      const manageAccessLink = `[${localize("manage access", "Manage Access")}](${createCommandUri("extension.open", this.extension.identifier.id, ExtensionEditorTab.Features, false, feature.id)})`;
      if (status?.severity === Severity.Error) {
        this.updateStatus({ icon: errorIcon, message: new MarkdownString().appendText(status.message).appendMarkdown(` ${manageAccessLink}`) }, true);
        return;
      }
      if (status?.severity === Severity.Warning) {
        this.updateStatus({ icon: warningIcon, message: new MarkdownString().appendText(status.message).appendMarkdown(` ${manageAccessLink}`) }, true);
        return;
      }
    }
    if (this.extensionManagementServerService.remoteExtensionManagementServer) {
      if (isLanguagePackExtension(this.extension.local.manifest)) {
        if (!this.extensionsWorkbenchService.installed.some((e) => areSameExtensions(e.identifier, this.extension.identifier) && e.server !== this.extension.server)) {
          const message = this.extension.server === this.extensionManagementServerService.localExtensionManagementServer ? new MarkdownString(localize("Install language pack also in remote server", "Install the language pack extension on '{0}' to enable it there also.", this.extensionManagementServerService.remoteExtensionManagementServer.label)) : new MarkdownString(localize("Install language pack also locally", "Install the language pack extension locally to enable it there also."));
          this.updateStatus({ icon: infoIcon, message }, true);
        }
        return;
      }
      const runningExtension = this.extensionService.extensions.filter((e) => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier))[0];
      const runningExtensionServer = runningExtension ? this.extensionManagementServerService.getExtensionManagementServer(toExtension(runningExtension)) : null;
      if (this.extension.server === this.extensionManagementServerService.localExtensionManagementServer && runningExtensionServer === this.extensionManagementServerService.remoteExtensionManagementServer) {
        if (this.extensionManifestPropertiesService.prefersExecuteOnWorkspace(this.extension.local.manifest)) {
          this.updateStatus({ icon: infoIcon, message: new MarkdownString(`${localize("enabled remotely", "This extension is enabled in the Remote Extension Host because it prefers to run there.")} [${localize("learn more", "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`) }, true);
        }
        return;
      }
      if (this.extension.server === this.extensionManagementServerService.remoteExtensionManagementServer && runningExtensionServer === this.extensionManagementServerService.localExtensionManagementServer) {
        if (this.extensionManifestPropertiesService.prefersExecuteOnUI(this.extension.local.manifest)) {
          this.updateStatus({ icon: infoIcon, message: new MarkdownString(`${localize("enabled locally", "This extension is enabled in the Local Extension Host because it prefers to run there.")} [${localize("learn more", "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`) }, true);
        }
        return;
      }
      if (this.extension.server === this.extensionManagementServerService.remoteExtensionManagementServer && runningExtensionServer === this.extensionManagementServerService.webExtensionManagementServer) {
        if (this.extensionManifestPropertiesService.canExecuteOnWeb(this.extension.local.manifest)) {
          this.updateStatus({ icon: infoIcon, message: new MarkdownString(`${localize("enabled in web worker", "This extension is enabled in the Web Worker Extension Host because it prefers to run there.")} [${localize("learn more", "Learn More")}](https://code.visualstudio.com/api/advanced-topics/remote-extensions#architecture-and-extension-kinds)`) }, true);
        }
        return;
      }
    }
    if (this.extension.enablementState === EnablementState.DisabledByExtensionDependency) {
      this.updateStatus({
        icon: warningIcon,
        message: new MarkdownString(localize("extension disabled because of dependency", "This extension depends on an extension that is disabled.")).appendMarkdown(`&nbsp;[${localize("dependencies", "Show Dependencies")}](${createCommandUri("extension.open", this.extension.identifier.id, ExtensionEditorTab.Dependencies)})`)
      }, true);
      return;
    }
    if (!this.extension.local.isValid) {
      const errors = this.extension.local.validations.filter(([severity]) => severity === Severity.Error).map(([, message]) => message);
      this.updateStatus({ icon: warningIcon, message: new MarkdownString(errors.join(" ").trim()) }, true);
      return;
    }
    const isEnabled = this.workbenchExtensionEnablementService.isEnabled(this.extension.local);
    const isRunning = this.extensionService.extensions.some((e) => areSameExtensions({ id: e.identifier.value, uuid: e.uuid }, this.extension.identifier));
    if (!this.extension.isWorkspaceScoped && isEnabled && isRunning) {
      if (this.extension.enablementState === EnablementState.EnabledWorkspace) {
        this.updateStatus({ message: new MarkdownString(localize("workspace enabled", "This extension is enabled for this workspace by the user.")) }, true);
        return;
      }
      if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
        if (this.extension.server === this.extensionManagementServerService.remoteExtensionManagementServer) {
          this.updateStatus({ message: new MarkdownString(localize("extension enabled on remote", "Extension is enabled on '{0}'", this.extension.server.label)) }, true);
          return;
        }
      }
      if (this.extension.enablementState === EnablementState.EnabledGlobally) {
        return;
      }
    }
    if (!isEnabled && !isRunning) {
      if (this.extension.enablementState === EnablementState.DisabledGlobally) {
        this.updateStatus({ message: new MarkdownString(localize("globally disabled", "This extension is disabled globally by the user.")) }, true);
        return;
      }
      if (this.extension.enablementState === EnablementState.DisabledWorkspace) {
        this.updateStatus({ message: new MarkdownString(localize("workspace disabled", "This extension is disabled for this workspace by the user.")) }, true);
        return;
      }
    }
  }
  updateStatus(status, updateClass) {
    if (status) {
      if (this._status.some((s) => s.message.value === status.message.value && s.icon?.id === status.icon?.id)) {
        return;
      }
    } else {
      if (this._status.length === 0) {
        return;
      }
      this._status = [];
    }
    if (status) {
      this._status.push(status);
      this._status.sort(
        (a, b) => b.icon === trustIcon ? -1 : a.icon === trustIcon ? 1 : b.icon === errorIcon ? -1 : a.icon === errorIcon ? 1 : b.icon === warningIcon ? -1 : a.icon === warningIcon ? 1 : b.icon === infoIcon ? -1 : a.icon === infoIcon ? 1 : 0
      );
    }
    if (updateClass) {
      if (status?.icon === errorIcon) {
        this.class = `${ExtensionStatusAction.CLASS} extension-status-error ${ThemeIcon.asClassName(errorIcon)}`;
      } else if (status?.icon === warningIcon) {
        this.class = `${ExtensionStatusAction.CLASS} extension-status-warning ${ThemeIcon.asClassName(warningIcon)}`;
      } else if (status?.icon === infoIcon) {
        this.class = `${ExtensionStatusAction.CLASS} extension-status-info ${ThemeIcon.asClassName(infoIcon)}`;
      } else if (status?.icon === trustIcon) {
        this.class = `${ExtensionStatusAction.CLASS} ${ThemeIcon.asClassName(trustIcon)}`;
      } else {
        this.class = `${ExtensionStatusAction.CLASS} hide`;
      }
    }
    this._onDidChangeStatus.fire();
  }
  async run() {
    if (this._status[0]?.icon === trustIcon) {
      return this.commandService.executeCommand("workbench.trust.manage");
    }
  }
};
ExtensionStatusAction.CLASS = `${ExtensionAction.ICON_ACTION_CLASS} extension-status`;
ExtensionStatusAction = __decorateClass([
  __decorateParam(0, IExtensionManagementServerService),
  __decorateParam(1, ILabelService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IWorkspaceTrustEnablementService),
  __decorateParam(4, IWorkspaceTrustManagementService),
  __decorateParam(5, IExtensionsWorkbenchService),
  __decorateParam(6, IExtensionService),
  __decorateParam(7, IExtensionManifestPropertiesService),
  __decorateParam(8, IWorkspaceContextService),
  __decorateParam(9, IProductService),
  __decorateParam(10, IAllowedExtensionsService),
  __decorateParam(11, IWorkbenchExtensionEnablementService),
  __decorateParam(12, IExtensionFeaturesManagementService),
  __decorateParam(13, IExtensionGalleryManifestService),
  __decorateParam(14, IConfigurationService)
], ExtensionStatusAction);
let InstallSpecificVersionOfExtensionAction = class extends Action {
  constructor(id = InstallSpecificVersionOfExtensionAction.ID, label = InstallSpecificVersionOfExtensionAction.LABEL, extensionsWorkbenchService, quickInputService, instantiationService, extensionEnablementService) {
    super(id, label);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.quickInputService = quickInputService;
    this.instantiationService = instantiationService;
    this.extensionEnablementService = extensionEnablementService;
  }
  get enabled() {
    return this.extensionsWorkbenchService.local.some((l) => this.isEnabled(l));
  }
  async run() {
    const extensionPick = await this.quickInputService.pick(this.getExtensionEntries(), { placeHolder: localize("selectExtension", "Select Extension"), matchOnDetail: true });
    if (extensionPick && extensionPick.extension) {
      const action = this.instantiationService.createInstance(InstallAnotherVersionAction, extensionPick.extension, true);
      try {
        await action.run();
      } finally {
        action.dispose();
      }
      await this.extensionsWorkbenchService.openSearch(extensionPick.extension.identifier.id);
    }
  }
  isEnabled(extension) {
    const action = this.instantiationService.createInstance(InstallAnotherVersionAction, extension, true);
    try {
      return action.enabled && !!extension.local && this.extensionEnablementService.isEnabled(extension.local);
    } finally {
      action.dispose();
    }
  }
  async getExtensionEntries() {
    const installed = await this.extensionsWorkbenchService.queryLocal();
    const entries = [];
    for (const extension of installed) {
      if (this.isEnabled(extension)) {
        entries.push({
          id: extension.identifier.id,
          label: extension.displayName || extension.identifier.id,
          description: extension.identifier.id,
          extension
        });
      }
    }
    return entries.sort((e1, e2) => e1.extension.displayName.localeCompare(e2.extension.displayName));
  }
};
InstallSpecificVersionOfExtensionAction.ID = "workbench.extensions.action.install.specificVersion";
InstallSpecificVersionOfExtensionAction.LABEL = localize("install previous version", "Install Specific Version of Extension...");
InstallSpecificVersionOfExtensionAction = __decorateClass([
  __decorateParam(2, IExtensionsWorkbenchService),
  __decorateParam(3, IQuickInputService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IWorkbenchExtensionEnablementService)
], InstallSpecificVersionOfExtensionAction);
let AbstractInstallExtensionsInServerAction = class extends Action {
  constructor(id, extensionsWorkbenchService, quickInputService, notificationService, progressService) {
    super(id);
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.quickInputService = quickInputService;
    this.notificationService = notificationService;
    this.progressService = progressService;
    this.extensions = void 0;
    this.update();
    this.extensionsWorkbenchService.queryLocal().then(() => this.updateExtensions());
    this._register(this.extensionsWorkbenchService.onChange(() => {
      if (this.extensions) {
        this.updateExtensions();
      }
    }));
  }
  updateExtensions() {
    this.extensions = this.extensionsWorkbenchService.local;
    this.update();
  }
  update() {
    this.enabled = !!this.extensions && this.getExtensionsToInstall(this.extensions).length > 0;
    this.tooltip = this.label;
  }
  async run() {
    return this.selectAndInstallExtensions();
  }
  async queryExtensionsToInstall() {
    const local = await this.extensionsWorkbenchService.queryLocal();
    return this.getExtensionsToInstall(local);
  }
  async selectAndInstallExtensions() {
    const quickPick = this.quickInputService.createQuickPick();
    quickPick.busy = true;
    const disposable = quickPick.onDidAccept(() => {
      disposable.dispose();
      quickPick.hide();
      quickPick.dispose();
      this.onDidAccept(quickPick.selectedItems);
    });
    quickPick.show();
    const localExtensionsToInstall = await this.queryExtensionsToInstall();
    quickPick.busy = false;
    if (localExtensionsToInstall.length) {
      quickPick.title = this.getQuickPickTitle();
      quickPick.placeholder = localize("select extensions to install", "Select extensions to install");
      quickPick.canSelectMany = true;
      localExtensionsToInstall.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName));
      quickPick.items = localExtensionsToInstall.map((extension) => ({ extension, label: extension.displayName, description: extension.version }));
    } else {
      quickPick.hide();
      quickPick.dispose();
      this.notificationService.notify({
        severity: Severity.Info,
        message: localize("no local extensions", "There are no extensions to install.")
      });
    }
  }
  async onDidAccept(selectedItems) {
    if (selectedItems.length) {
      const localExtensionsToInstall = selectedItems.filter((r) => !!r.extension).map((r) => r.extension);
      if (localExtensionsToInstall.length) {
        await this.progressService.withProgress(
          {
            location: ProgressLocation.Notification,
            title: localize("installing extensions", "Installing Extensions...")
          },
          () => this.installExtensions(localExtensionsToInstall)
        );
        this.notificationService.info(localize("finished installing", "Successfully installed extensions."));
      }
    }
  }
};
AbstractInstallExtensionsInServerAction = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IProgressService)
], AbstractInstallExtensionsInServerAction);
let InstallLocalExtensionsInRemoteAction = class extends AbstractInstallExtensionsInServerAction {
  constructor(extensionsWorkbenchService, quickInputService, progressService, notificationService, extensionManagementServerService, extensionGalleryService, instantiationService, fileService, logService) {
    super("workbench.extensions.actions.installLocalExtensionsInRemote", extensionsWorkbenchService, quickInputService, notificationService, progressService);
    this.extensionManagementServerService = extensionManagementServerService;
    this.extensionGalleryService = extensionGalleryService;
    this.instantiationService = instantiationService;
    this.fileService = fileService;
    this.logService = logService;
  }
  get label() {
    if (this.extensionManagementServerService && this.extensionManagementServerService.remoteExtensionManagementServer) {
      return localize("select and install local extensions", "Install Local Extensions in '{0}'...", this.extensionManagementServerService.remoteExtensionManagementServer.label);
    }
    return "";
  }
  getQuickPickTitle() {
    return localize("install local extensions title", "Install Local Extensions in '{0}'", this.extensionManagementServerService.remoteExtensionManagementServer.label);
  }
  getExtensionsToInstall(local) {
    return local.filter((extension) => {
      const action = this.instantiationService.createInstance(RemoteInstallAction, true);
      action.extension = extension;
      return action.enabled;
    });
  }
  async installExtensions(localExtensionsToInstall) {
    const galleryExtensions = [];
    const vsixs = [];
    const targetPlatform = await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getTargetPlatform();
    await Promises.settled(localExtensionsToInstall.map(async (extension) => {
      if (this.extensionGalleryService.isEnabled()) {
        const gallery = (await this.extensionGalleryService.getExtensions([{ ...extension.identifier, preRelease: !!extension.local?.preRelease }], { targetPlatform, compatible: true }, CancellationToken.None))[0];
        if (gallery) {
          galleryExtensions.push(gallery);
          return;
        }
      }
      const vsix = await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.zip(extension.local);
      vsixs.push(vsix);
    }));
    await Promises.settled(galleryExtensions.map((gallery) => this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.installFromGallery(gallery)));
    try {
      await Promises.settled(vsixs.map((vsix) => this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.install(vsix)));
    } finally {
      try {
        await Promise.allSettled(vsixs.map((vsix) => this.fileService.del(vsix)));
      } catch (error) {
        this.logService.error(error);
      }
    }
  }
};
InstallLocalExtensionsInRemoteAction = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IQuickInputService),
  __decorateParam(2, IProgressService),
  __decorateParam(3, INotificationService),
  __decorateParam(4, IExtensionManagementServerService),
  __decorateParam(5, IExtensionGalleryService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IFileService),
  __decorateParam(8, ILogService)
], InstallLocalExtensionsInRemoteAction);
let InstallRemoteExtensionsInLocalAction = class extends AbstractInstallExtensionsInServerAction {
  constructor(id, extensionsWorkbenchService, quickInputService, progressService, notificationService, extensionManagementServerService, extensionGalleryService, fileService, logService) {
    super(id, extensionsWorkbenchService, quickInputService, notificationService, progressService);
    this.extensionManagementServerService = extensionManagementServerService;
    this.extensionGalleryService = extensionGalleryService;
    this.fileService = fileService;
    this.logService = logService;
  }
  get label() {
    return localize("select and install remote extensions", "Install Remote Extensions Locally...");
  }
  getQuickPickTitle() {
    return localize("install remote extensions", "Install Remote Extensions Locally");
  }
  getExtensionsToInstall(local) {
    return local.filter((extension) => extension.type === ExtensionType.User && extension.server !== this.extensionManagementServerService.localExtensionManagementServer && !this.extensionsWorkbenchService.installed.some((e) => e.server === this.extensionManagementServerService.localExtensionManagementServer && areSameExtensions(e.identifier, extension.identifier)));
  }
  async installExtensions(extensions) {
    const galleryExtensions = [];
    const vsixs = [];
    const targetPlatform = await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.getTargetPlatform();
    await Promises.settled(extensions.map(async (extension) => {
      if (this.extensionGalleryService.isEnabled()) {
        const gallery = (await this.extensionGalleryService.getExtensions([{ ...extension.identifier, preRelease: !!extension.local?.preRelease }], { targetPlatform, compatible: true }, CancellationToken.None))[0];
        if (gallery) {
          galleryExtensions.push(gallery);
          return;
        }
      }
      const vsix = await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.zip(extension.local);
      vsixs.push(vsix);
    }));
    await Promises.settled(galleryExtensions.map((gallery) => this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.installFromGallery(gallery)));
    try {
      await Promises.settled(vsixs.map((vsix) => this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.install(vsix)));
    } finally {
      try {
        await Promise.allSettled(vsixs.map((vsix) => this.fileService.del(vsix)));
      } catch (error) {
        this.logService.error(error);
      }
    }
  }
};
InstallRemoteExtensionsInLocalAction = __decorateClass([
  __decorateParam(1, IExtensionsWorkbenchService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, IProgressService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IExtensionManagementServerService),
  __decorateParam(6, IExtensionGalleryService),
  __decorateParam(7, IFileService),
  __decorateParam(8, ILogService)
], InstallRemoteExtensionsInLocalAction);
CommandsRegistry.registerCommand("workbench.extensions.action.showExtensionsForLanguage", function(accessor, fileExtension) {
  const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
  return extensionsWorkbenchService.openSearch(`ext:${fileExtension.replace(/^\./, "")}`);
});
const showExtensionsWithIdsCommandId = "workbench.extensions.action.showExtensionsWithIds";
CommandsRegistry.registerCommand(showExtensionsWithIdsCommandId, function(accessor, extensionIds) {
  const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
  return extensionsWorkbenchService.openSearch(extensionIds.map((id) => `@id:${id}`).join(" "));
});
registerColor("extensionButton.background", {
  dark: buttonSecondaryBackground,
  light: buttonSecondaryBackground,
  hcDark: null,
  hcLight: null
}, localize("extensionButtonBackground", "Button background color for extension actions."));
registerColor("extensionButton.foreground", {
  dark: buttonSecondaryForeground,
  light: buttonSecondaryForeground,
  hcDark: null,
  hcLight: null
}, localize("extensionButtonForeground", "Button foreground color for extension actions."));
registerColor("extensionButton.hoverBackground", {
  dark: buttonSecondaryHoverBackground,
  light: buttonSecondaryHoverBackground,
  hcDark: null,
  hcLight: null
}, localize("extensionButtonHoverBackground", "Button background hover color for extension actions."));
registerColor("extensionButton.border", {
  dark: buttonSecondaryBorder,
  light: buttonSecondaryBorder,
  hcDark: buttonSecondaryBorder,
  hcLight: buttonSecondaryBorder
}, localize("extensionButtonBorder", "Button border color for extension actions."));
registerColor("extensionButton.separator", buttonSeparator, localize("extensionButtonSeparator", "Button separator color for extension actions"));
const extensionButtonProminentBackground = registerColor("extensionButton.prominentBackground", {
  dark: buttonBackground,
  light: buttonBackground,
  hcDark: null,
  hcLight: null
}, localize("extensionButtonProminentBackground", "Button background color for extension actions that stand out (e.g. install button)."));
registerColor("extensionButton.prominentForeground", {
  dark: buttonForeground,
  light: buttonForeground,
  hcDark: null,
  hcLight: null
}, localize("extensionButtonProminentForeground", "Button foreground color for extension actions that stand out (e.g. install button)."));
registerColor("extensionButton.prominentHoverBackground", {
  dark: buttonHoverBackground,
  light: buttonHoverBackground,
  hcDark: null,
  hcLight: null
}, localize("extensionButtonProminentHoverBackground", "Button background hover color for extension actions that stand out (e.g. install button)."));
registerThemingParticipant((theme, collector) => {
  const errorColor = theme.getColor(editorErrorForeground);
  if (errorColor) {
    collector.addRule(`.extension-editor .header .actions-status-container > .status ${ThemeIcon.asCSSSelector(errorIcon)} { color: ${errorColor}; }`);
    collector.addRule(`.extension-editor .body .subcontent .runtime-status ${ThemeIcon.asCSSSelector(errorIcon)} { color: ${errorColor}; }`);
    collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(errorIcon)} { color: ${errorColor}; }`);
  }
  const warningColor = theme.getColor(editorWarningForeground);
  if (warningColor) {
    collector.addRule(`.extension-editor .header .actions-status-container > .status ${ThemeIcon.asCSSSelector(warningIcon)} { color: ${warningColor}; }`);
    collector.addRule(`.extension-editor .body .subcontent .runtime-status ${ThemeIcon.asCSSSelector(warningIcon)} { color: ${warningColor}; }`);
    collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(warningIcon)} { color: ${warningColor}; }`);
  }
  const infoColor = theme.getColor(editorInfoForeground);
  if (infoColor) {
    collector.addRule(`.extension-editor .header .actions-status-container > .status ${ThemeIcon.asCSSSelector(infoIcon)} { color: ${infoColor}; }`);
    collector.addRule(`.extension-editor .body .subcontent .runtime-status ${ThemeIcon.asCSSSelector(infoIcon)} { color: ${infoColor}; }`);
    collector.addRule(`.monaco-hover.extension-hover .markdown-hover .hover-contents ${ThemeIcon.asCSSSelector(infoIcon)} { color: ${infoColor}; }`);
  }
});
export {
  AbstractConfigureRecommendedExtensionsAction,
  AbstractInstallExtensionsInServerAction,
  ButtonWithDropDownExtensionAction,
  ButtonWithDropdownExtensionActionViewItem,
  ClearLanguageAction,
  ConfigureWorkspaceFolderRecommendedExtensionsAction,
  ConfigureWorkspaceRecommendedExtensionsAction,
  DisableDropDownAction,
  DisableForWorkspaceAction,
  DisableGloballyAction,
  DropDownExtensionAction,
  DropDownExtensionActionViewItem,
  EnableAIFeaturesInWorkspaceAction,
  EnableDropDownAction,
  EnableForWorkspaceAction,
  EnableGloballyAction,
  ExtensionAction,
  ExtensionEditorManageExtensionAction,
  ExtensionRuntimeStateAction,
  ExtensionStatusAction,
  ExtensionStatusLabelAction,
  IgnoreExtensionRecommendationAction,
  InstallAction,
  InstallAnotherVersionAction,
  InstallDropdownAction,
  InstallInOtherServerAction,
  InstallLocalExtensionsInRemoteAction,
  InstallRecommendedExtensionAction,
  InstallRemoteExtensionsInLocalAction,
  InstallSpecificVersionOfExtensionAction,
  InstallingLabelAction,
  LocalInstallAction,
  ManageExtensionAction,
  MenuItemExtensionAction,
  MigrateDeprecatedExtensionAction,
  PromptExtensionInstallFailureAction,
  RemoteInstallAction,
  SetColorThemeAction,
  SetFileIconThemeAction,
  SetLanguageAction,
  SetProductIconThemeAction,
  ShowRecommendedExtensionAction,
  ToggleAutoUpdateForExtensionAction,
  ToggleAutoUpdatesForPublisherAction,
  TogglePreReleaseExtensionAction,
  ToggleSyncExtensionAction,
  UndoIgnoreExtensionRecommendationAction,
  UninstallAction,
  UpdateAction,
  WebInstallAction,
  extensionButtonProminentBackground,
  getContextMenuActions,
  showExtensionsWithIdsCommandId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvYnJvd3Nlci9leHRlbnNpb25zQWN0aW9ucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9leHRlbnNpb25BY3Rpb25zLmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIEFjdGlvbiwgU2VwYXJhdG9yLCBTdWJtZW51QWN0aW9uLCBJQWN0aW9uQ2hhbmdlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IERlbGF5ZXIsIFByb21pc2VzLCBUaHJvdHRsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCAqIGFzIGpzb24gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBkaXNwb3NlSWZEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb24sIEV4dGVuc2lvblN0YXRlLCBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIElFeHRlbnNpb25Db250YWluZXIsIFRPR0dMRV9JR05PUkVfRVhURU5TSU9OX0FDVElPTl9JRCwgU0VMRUNUX0lOU1RBTExfVlNJWF9FWFRFTlNJT05fQ09NTUFORF9JRCwgVEhFTUVfQUNUSU9OU19HUk9VUCwgSU5TVEFMTF9BQ1RJT05TX0dST1VQLCBVUERBVEVfQUNUSU9OU19HUk9VUCwgRXh0ZW5zaW9uRWRpdG9yVGFiLCBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZSwgSUV4dGVuc2lvbkFyZywgQXV0b1VwZGF0ZUNvbmZpZ3VyYXRpb25LZXkgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zQ29uZmlndXJhdGlvbkluaXRpYWxDb250ZW50IH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnNGaWxlVGVtcGxhdGUuanMnO1xuaW1wb3J0IHsgSUdhbGxlcnlFeHRlbnNpb24sIElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSwgSUxvY2FsRXh0ZW5zaW9uLCBJbnN0YWxsT3B0aW9ucywgSW5zdGFsbE9wZXJhdGlvbiwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZSwgSUFsbG93ZWRFeHRlbnNpb25zU2VydmljZSwgc2hvdWxkUmVxdWlyZVJlcG9zaXRvcnlTaWduYXR1cmVGb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgRW5hYmxlbWVudFN0YXRlLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLCBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblJlY29tbWVuZGF0aW9uUmVhc29uLCBJRXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2UsIElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zL2NvbW1vbi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMuanMnO1xuaW1wb3J0IHsgYXJlU2FtZUV4dGVuc2lvbnMsIGdldEV4dGVuc2lvbklkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uVHlwZSwgRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBJRXh0ZW5zaW9uTWFuaWZlc3QsIGlzTGFuZ3VhZ2VQYWNrRXh0ZW5zaW9uLCBnZXRXb3Jrc3BhY2VTdXBwb3J0VHlwZU1lc3NhZ2UsIFRhcmdldFBsYXRmb3JtLCBpc0FwcGxpY2F0aW9uU2NvcGVkRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgSUZpbGVDb250ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUsIElXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSwgdG9FeHRlbnNpb24sIHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCwgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NoYXQvY29tbW9uL2NoYXRTZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyByZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCwgSUNvbG9yVGhlbWUsIElDc3NTdHlsZUNvbGxlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IGJ1dHRvbkJhY2tncm91bmQsIGJ1dHRvbkZvcmVncm91bmQsIGJ1dHRvbkhvdmVyQmFja2dyb3VuZCwgYnV0dG9uU2Vjb25kYXJ5QmFja2dyb3VuZCwgYnV0dG9uU2Vjb25kYXJ5Rm9yZWdyb3VuZCwgYnV0dG9uU2Vjb25kYXJ5SG92ZXJCYWNrZ3JvdW5kLCByZWdpc3RlckNvbG9yLCBlZGl0b3JXYXJuaW5nRm9yZWdyb3VuZCwgZWRpdG9ySW5mb0ZvcmVncm91bmQsIGVkaXRvckVycm9yRm9yZWdyb3VuZCwgYnV0dG9uU2VwYXJhdG9yLCBidXR0b25TZWNvbmRhcnlCb3JkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJSlNPTkVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvbi9jb21tb24vanNvbkVkaXRpbmcuanMnO1xuaW1wb3J0IHsgSVRleHRFZGl0b3JTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBJTWVudVNlcnZpY2UsIE1lbnVJdGVtQWN0aW9uLCBTdWJtZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgUElDS19XT1JLU1BBQ0VfRk9MREVSX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FjdGlvbnMvd29ya3NwYWNlQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIElQcm9tcHRDaG9pY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tQaWNrSXRlbSwgSVF1aWNrSW5wdXRTZXJ2aWNlLCBRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBhbGVydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaFRoZW1lU2VydmljZSwgSVdvcmtiZW5jaFRoZW1lLCBJV29ya2JlbmNoQ29sb3JUaGVtZSwgSVdvcmtiZW5jaEZpbGVJY29uVGhlbWUsIElXb3JrYmVuY2hQcm9kdWN0SWNvblRoZW1lIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGhlbWVzL2NvbW1vbi93b3JrYmVuY2hUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSwgSVByb21wdEJ1dHRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1PcHRpb25zLCBBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IEVYVEVOU0lPTlNfQ09ORklHLCBJRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMvY29tbW9uL3dvcmtzcGFjZUV4dGVuc2lvbnNDb25maWcuanMnO1xuaW1wb3J0IHsgZ2V0RXJyb3JNZXNzYWdlLCBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2NvbnRleHRtZW51LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgZXJyb3JJY29uLCBpbmZvSWNvbiwgbWFuYWdlRXh0ZW5zaW9uSWNvbiwgc3luY0VuYWJsZWRJY29uLCBzeW5jSWdub3JlZEljb24sIHRydXN0SWNvbiwgd2FybmluZ0ljb24gfSBmcm9tICcuL2V4dGVuc2lvbnNJY29ucy5qcyc7XG5pbXBvcnQgeyBpc0lPUywgaXNXZWIsIGxhbmd1YWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlLCBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgaXNWaXJ0dWFsV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi92aXJ0dWFsV29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvbW1hbmRVcmksIGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zLCBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgZnJvbU5vdyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBnZXRMb2NhbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYW5ndWFnZVBhY2tzL2NvbW1vbi9sYW5ndWFnZVBhY2tzLmpzJztcbmltcG9ydCB7IElMb2NhbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbG9jYWxpemF0aW9uL2NvbW1vbi9sb2NhbGUuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBzaG93V2luZG93TG9nQWN0aW9uSWQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sb2cvY29tbW9uL2xvZ0NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElFeHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlLCBJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkZlYXR1cmVzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElVcGRhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXBkYXRlL2NvbW1vbi91cGRhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uV2l0aERyb3Bkb3duQWN0aW9uVmlld0l0ZW0sIElBY3Rpb25XaXRoRHJvcGRvd25BY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZHJvcGRvd24vZHJvcGRvd25BY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25Vc2FnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9hdXRoZW50aWNhdGlvbi9icm93c2VyL2F1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0LmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hJc3N1ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9pc3N1ZS9jb21tb24vaXNzdWUuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgZ2V0V29ya2JlbmNoTWVudU1vdGlvbkNvbnRleHRNZW51T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy9tZW51TW90aW9uLmpzJztcblxuZXhwb3J0IGNsYXNzIFByb21wdEV4dGVuc2lvbkluc3RhbGxGYWlsdXJlQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbjogSUV4dGVuc2lvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IG9wdGlvbnM6IEluc3RhbGxPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmVyc2lvbjogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgaW5zdGFsbE9wZXJhdGlvbjogSW5zdGFsbE9wZXJhdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IGVycm9yOiBFcnJvcixcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZ2FsbGVyeVNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSxcblx0XHRASVdvcmtiZW5jaElzc3VlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtiZW5jaElzc3VlU2VydmljZTogSVdvcmtiZW5jaElzc3VlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbi5wcm9tcHRFeHRlbnNpb25JbnN0YWxsRmFpbHVyZScpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKHRoaXMuZXJyb3IpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKHRoaXMuZXJyb3IpO1xuXG5cdFx0aWYgKHRoaXMuZXJyb3IubmFtZSA9PT0gRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5VbnN1cHBvcnRlZCkge1xuXHRcdFx0Y29uc3QgcHJvZHVjdE5hbWUgPSBpc1dlYiA/IGxvY2FsaXplKCdWUyBDb2RlIGZvciBXZWInLCBcInswfSBmb3IgdGhlIFdlYlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKSA6IHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmc7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gbG9jYWxpemUoJ2Nhbm5vdCBiZSBpbnN0YWxsZWQnLCBcIlRoZSAnezB9JyBleHRlbnNpb24gaXMgbm90IGF2YWlsYWJsZSBpbiB7MX0uIENsaWNrICdNb3JlIEluZm9ybWF0aW9uJyB0byBsZWFybiBtb3JlLlwiLCB0aGlzLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSB8fCB0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBwcm9kdWN0TmFtZSk7XG5cdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSh7IGtleTogJ21vcmUgaW5mb3JtYXRpb24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZNb3JlIEluZm9ybWF0aW9uXCIpLFxuXHRcdFx0XHRjYW5jZWxCdXR0b246IGxvY2FsaXplKCdjbG9zZScsIFwiQ2xvc2VcIilcblx0XHRcdH0pO1xuXHRcdFx0aWYgKGNvbmZpcm1lZCkge1xuXHRcdFx0XHR0aGlzLm9wZW5lclNlcnZpY2Uub3Blbihpc1dlYiA/IFVSSS5wYXJzZSgnaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXdlYi1leHRlbnNpb25zLWd1aWRlJykgOiBVUkkucGFyc2UoJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS1yZW1vdGUnKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuUmVsZWFzZVZlcnNpb25Ob3RGb3VuZCA9PT0gKDxFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlPnRoaXMuZXJyb3IubmFtZSkpIHtcblx0XHRcdGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHR0eXBlOiAnZXJyb3InLFxuXHRcdFx0XHRtZXNzYWdlOiBnZXRFcnJvck1lc3NhZ2UodGhpcy5lcnJvciksXG5cdFx0XHRcdGJ1dHRvbnM6IFt7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdpbnN0YWxsIHByZXJlbGVhc2UnLCBcIkluc3RhbGwgUHJlLVJlbGVhc2VcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbnN0YWxsQWN0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsQWN0aW9uLCB7IGluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbjogdHJ1ZSB9KTtcblx0XHRcdFx0XHRcdGluc3RhbGxBY3Rpb24uZXh0ZW5zaW9uID0gdGhpcy5leHRlbnNpb247XG5cdFx0XHRcdFx0XHRyZXR1cm4gaW5zdGFsbEFjdGlvbi5ydW4oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRjYW5jZWxCdXR0b246IGxvY2FsaXplKCdjYW5jZWwnLCBcIkNhbmNlbFwiKVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKFtFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLkluY29tcGF0aWJsZSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5JbmNvbXBhdGlibGVBcGksIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuSW5jb21wYXRpYmxlVGFyZ2V0UGxhdGZvcm0sIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuTWFsaWNpb3VzLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLkRlcHJlY2F0ZWRdLmluY2x1ZGVzKDxFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlPnRoaXMuZXJyb3IubmFtZSkpIHtcblx0XHRcdGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5pbmZvKGdldEVycm9yTWVzc2FnZSh0aGlzLmVycm9yKSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuUGFja2FnZU5vdFNpZ25lZCA9PT0gKDxFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlPnRoaXMuZXJyb3IubmFtZSkpIHtcblx0XHRcdGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHR0eXBlOiAnZXJyb3InLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnbm90IHNpZ25lZCcsIFwiJ3swfScgaXMgYW4gZXh0ZW5zaW9uIGZyb20gYW4gdW5rbm93biBzb3VyY2UuIEFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBpbnN0YWxsP1wiLCB0aGlzLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSksXG5cdFx0XHRcdGRldGFpbDogZ2V0RXJyb3JNZXNzYWdlKHRoaXMuZXJyb3IpLFxuXHRcdFx0XHRidXR0b25zOiBbe1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaW5zdGFsbCBhbnl3YXknLCBcIkluc3RhbGwgQW55d2F5XCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgaW5zdGFsbEFjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbEFjdGlvbiwgeyAuLi50aGlzLm9wdGlvbnMsIGRvbm90VmVyaWZ5U2lnbmF0dXJlOiB0cnVlLCB9KTtcblx0XHRcdFx0XHRcdGluc3RhbGxBY3Rpb24uZXh0ZW5zaW9uID0gdGhpcy5leHRlbnNpb247XG5cdFx0XHRcdFx0XHRyZXR1cm4gaW5zdGFsbEFjdGlvbi5ydW4oKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRjYW5jZWxCdXR0b246IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLlNpZ25hdHVyZVZlcmlmaWNhdGlvbkZhaWxlZCA9PT0gKDxFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlPnRoaXMuZXJyb3IubmFtZSkpIHtcblx0XHRcdGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHR0eXBlOiAnZXJyb3InLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndmVyaWZpY2F0aW9uIGZhaWxlZCcsIFwiQ2Fubm90IGluc3RhbGwgJ3swfScgZXh0ZW5zaW9uIGJlY2F1c2UgezF9IGNhbm5vdCB2ZXJpZnkgdGhlIGV4dGVuc2lvbiBzaWduYXR1cmVcIiwgdGhpcy5leHRlbnNpb24uZGlzcGxheU5hbWUsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpLFxuXHRcdFx0XHRkZXRhaWw6IGdldEVycm9yTWVzc2FnZSh0aGlzLmVycm9yKSxcblx0XHRcdFx0YnV0dG9uczogW3tcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2xlYXJuIG1vcmUnLCBcIkxlYXJuIE1vcmVcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbignaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vZG9jcy9lZGl0b3IvZXh0ZW5zaW9uLW1hcmtldHBsYWNlI190aGUtZXh0ZW5zaW9uLXNpZ25hdHVyZS1jYW5ub3QtYmUtdmVyaWZpZWQtYnktdnMtY29kZScpXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2luc3RhbGwgZG9ub3QgdmVyaWZ5JywgXCJJbnN0YWxsIEFueXdheSAoRG9uJ3QgVmVyaWZ5IFNpZ25hdHVyZSlcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbnN0YWxsQWN0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsQWN0aW9uLCB7IC4uLnRoaXMub3B0aW9ucywgZG9ub3RWZXJpZnlTaWduYXR1cmU6IHRydWUsIH0pO1xuXHRcdFx0XHRcdFx0aW5zdGFsbEFjdGlvbi5leHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbjtcblx0XHRcdFx0XHRcdHJldHVybiBpbnN0YWxsQWN0aW9uLnJ1bigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV0sXG5cdFx0XHRcdGNhbmNlbEJ1dHRvbjogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuU2lnbmF0dXJlVmVyaWZpY2F0aW9uSW50ZXJuYWwgPT09ICg8RXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZT50aGlzLmVycm9yLm5hbWUpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3ZlcmlmaWNhdGlvbiBmYWlsZWQnLCBcIkNhbm5vdCBpbnN0YWxsICd7MH0nIGV4dGVuc2lvbiBiZWNhdXNlIHsxfSBjYW5ub3QgdmVyaWZ5IHRoZSBleHRlbnNpb24gc2lnbmF0dXJlXCIsIHRoaXMuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKSxcblx0XHRcdFx0ZGV0YWlsOiBnZXRFcnJvck1lc3NhZ2UodGhpcy5lcnJvciksXG5cdFx0XHRcdGJ1dHRvbnM6IFt7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdsZWFybiBtb3JlJywgXCJMZWFybiBNb3JlXCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oJ2h0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2RvY3MvZWRpdG9yL2V4dGVuc2lvbi1tYXJrZXRwbGFjZSNfdGhlLWV4dGVuc2lvbi1zaWduYXR1cmUtY2Fubm90LWJlLXZlcmlmaWVkLWJ5LXZzLWNvZGUnKVxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdyZXBvcnQgaXNzdWUnLCBcIlJlcG9ydCBJc3N1ZVwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMud29ya2JlbmNoSXNzdWVTZXJ2aWNlLm9wZW5SZXBvcnRlcih7XG5cdFx0XHRcdFx0XHRpc3N1ZVRpdGxlOiBsb2NhbGl6ZSgncmVwb3J0IGlzc3VlIHRpdGxlJywgXCJFeHRlbnNpb24gU2lnbmF0dXJlIFZlcmlmaWNhdGlvbiBGYWlsZWQ6IHswfVwiLCB0aGlzLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSksXG5cdFx0XHRcdFx0XHRpc3N1ZUJvZHk6IGxvY2FsaXplKCdyZXBvcnQgaXNzdWUgYm9keScsIFwiUGxlYXNlIGluY2x1ZGUgZm9sbG93aW5nIGxvZyBgRjEgPiBPcGVuIFZpZXcuLi4gPiBTaGFyZWRgIGJlbG93LlxcblxcblwiKVxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2luc3RhbGwgZG9ub3QgdmVyaWZ5JywgXCJJbnN0YWxsIEFueXdheSAoRG9uJ3QgVmVyaWZ5IFNpZ25hdHVyZSlcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbnN0YWxsQWN0aW9uID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsQWN0aW9uLCB7IC4uLnRoaXMub3B0aW9ucywgZG9ub3RWZXJpZnlTaWduYXR1cmU6IHRydWUsIH0pO1xuXHRcdFx0XHRcdFx0aW5zdGFsbEFjdGlvbi5leHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbjtcblx0XHRcdFx0XHRcdHJldHVybiBpbnN0YWxsQWN0aW9uLnJ1bigpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV0sXG5cdFx0XHRcdGNhbmNlbEJ1dHRvbjogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3BlcmF0aW9uTWVzc2FnZSA9IHRoaXMuaW5zdGFsbE9wZXJhdGlvbiA9PT0gSW5zdGFsbE9wZXJhdGlvbi5VcGRhdGUgPyBsb2NhbGl6ZSgndXBkYXRlIG9wZXJhdGlvbicsIFwiRXJyb3Igd2hpbGUgdXBkYXRpbmcgJ3swfScgZXh0ZW5zaW9uLlwiLCB0aGlzLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSB8fCB0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKVxuXHRcdFx0OiBsb2NhbGl6ZSgnaW5zdGFsbCBvcGVyYXRpb24nLCBcIkVycm9yIHdoaWxlIGluc3RhbGxpbmcgJ3swfScgZXh0ZW5zaW9uLlwiLCB0aGlzLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSB8fCB0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRsZXQgYWRkaXRpb25hbE1lc3NhZ2U7XG5cdFx0Y29uc3QgcHJvbXB0Q2hvaWNlczogSVByb21wdENob2ljZVtdID0gW107XG5cblx0XHRjb25zdCBkb3dubG9hZFVybCA9IGF3YWl0IHRoaXMuZ2V0RG93bmxvYWRVcmwoKTtcblx0XHRpZiAoZG93bmxvYWRVcmwpIHtcblx0XHRcdGFkZGl0aW9uYWxNZXNzYWdlID0gbG9jYWxpemUoJ2NoZWNrIGxvZ3MnLCBcIlBsZWFzZSBjaGVjayB0aGUgW2xvZ10oezB9KSBmb3IgbW9yZSBkZXRhaWxzLlwiLCBjcmVhdGVDb21tYW5kVXJpKHNob3dXaW5kb3dMb2dBY3Rpb25JZCkudG9TdHJpbmcoKSk7XG5cdFx0XHRwcm9tcHRDaG9pY2VzLnB1c2goe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2Rvd25sb2FkJywgXCJUcnkgRG93bmxvYWRpbmcgTWFudWFsbHkuLi5cIiksXG5cdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4oZG93bmxvYWRVcmwpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFx0XHRTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2luc3RhbGwgdnNpeCcsICdPbmNlIGRvd25sb2FkZWQsIHBsZWFzZSBtYW51YWxseSBpbnN0YWxsIHRoZSBkb3dubG9hZGVkIFZTSVggb2YgXFwnezB9XFwnLicsIHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpLFxuXHRcdFx0XHRcdFx0W3tcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdpbnN0YWxsVlNJWCcsIFwiSW5zdGFsbCBmcm9tIFZTSVguLi5cIiksXG5cdFx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChTRUxFQ1RfSU5TVEFMTF9WU0lYX0VYVEVOU0lPTl9DT01NQU5EX0lEKVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9KVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWVzc2FnZSA9IGAke29wZXJhdGlvbk1lc3NhZ2V9JHthZGRpdGlvbmFsTWVzc2FnZSA/IGAgJHthZGRpdGlvbmFsTWVzc2FnZX1gIDogJyd9YDtcblx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFNldmVyaXR5LkVycm9yLCBtZXNzYWdlLCBwcm9tcHRDaG9pY2VzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RG93bmxvYWRVcmwoKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoaXNJT1MpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghdGhpcy5leHRlbnNpb24uZ2FsbGVyeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciAmJiAhdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgdGFyZ2V0UGxhdGZvcm0gPSB0aGlzLmV4dGVuc2lvbi5nYWxsZXJ5LnByb3BlcnRpZXMudGFyZ2V0UGxhdGZvcm07XG5cdFx0aWYgKHRhcmdldFBsYXRmb3JtICE9PSBUYXJnZXRQbGF0Zm9ybS5VTklWRVJTQUwgJiYgdGFyZ2V0UGxhdGZvcm0gIT09IFRhcmdldFBsYXRmb3JtLlVOREVGSU5FRCAmJiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IG1hbmlmZXN0ID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5nZXRNYW5pZmVzdCh0aGlzLmV4dGVuc2lvbi5nYWxsZXJ5LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdFx0aWYgKG1hbmlmZXN0ICYmIHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5wcmVmZXJzRXhlY3V0ZU9uV29ya3NwYWNlKG1hbmlmZXN0KSkge1xuXHRcdFx0XHRcdHRhcmdldFBsYXRmb3JtID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldFRhcmdldFBsYXRmb3JtKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0YXJnZXRQbGF0Zm9ybSA9PT0gVGFyZ2V0UGxhdGZvcm0uVU5LTk9XTikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBbZXh0ZW5zaW9uXSA9IGF3YWl0IHRoaXMuZ2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbe1xuXHRcdFx0Li4udGhpcy5leHRlbnNpb24uaWRlbnRpZmllcixcblx0XHRcdHZlcnNpb246IHRoaXMudmVyc2lvblxuXHRcdH1dLCB7XG5cdFx0XHR0YXJnZXRQbGF0Zm9ybVxuXHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0aWYgKCFleHRlbnNpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBVUkkucGFyc2UoZXh0ZW5zaW9uLmFzc2V0cy5kb3dubG9hZC51cmkpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uQWN0aW9uQ2hhbmdlRXZlbnQgZXh0ZW5kcyBJQWN0aW9uQ2hhbmdlRXZlbnQge1xuXHRyZWFkb25seSBoaWRkZW4/OiBib29sZWFuO1xuXHRyZWFkb25seSBtZW51QWN0aW9ucz86IElBY3Rpb25bXTtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEV4dGVuc2lvbkFjdGlvbiBleHRlbmRzIEFjdGlvbiBpbXBsZW1lbnRzIElFeHRlbnNpb25Db250YWluZXIge1xuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfb25EaWRDaGFuZ2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJRXh0ZW5zaW9uQWN0aW9uQ2hhbmdlRXZlbnQ+KCkpO1xuXHRvdmVycmlkZSBnZXQgb25EaWRDaGFuZ2UoKSB7IHJldHVybiB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDsgfVxuXG5cdHN0YXRpYyByZWFkb25seSBFWFRFTlNJT05fQUNUSU9OX0NMQVNTID0gJ2V4dGVuc2lvbi1hY3Rpb24nO1xuXHRzdGF0aWMgcmVhZG9ubHkgVEVYVF9BQ1RJT05fQ0xBU1MgPSBgJHtFeHRlbnNpb25BY3Rpb24uRVhURU5TSU9OX0FDVElPTl9DTEFTU30gdGV4dGA7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTF9BQ1RJT05fQ0xBU1MgPSBgJHtFeHRlbnNpb25BY3Rpb24uRVhURU5TSU9OX0FDVElPTl9DTEFTU30gbGFiZWxgO1xuXHRzdGF0aWMgcmVhZG9ubHkgSUNPTl9BQ1RJT05fQ0xBU1MgPSBgJHtFeHRlbnNpb25BY3Rpb24uRVhURU5TSU9OX0FDVElPTl9DTEFTU30gaWNvbmA7XG5cblx0cHJpdmF0ZSBfZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uIHwgbnVsbCA9IG51bGw7XG5cdGdldCBleHRlbnNpb24oKTogSUV4dGVuc2lvbiB8IG51bGwgeyByZXR1cm4gdGhpcy5fZXh0ZW5zaW9uOyB9XG5cdHNldCBleHRlbnNpb24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uIHwgbnVsbCkgeyB0aGlzLl9leHRlbnNpb24gPSBleHRlbnNpb247IHRoaXMudXBkYXRlKCk7IH1cblxuXHRwcml2YXRlIF9oaWRkZW46IGJvb2xlYW4gPSBmYWxzZTtcblx0Z2V0IGhpZGRlbigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2hpZGRlbjsgfVxuXHRzZXQgaGlkZGVuKGhpZGRlbjogYm9vbGVhbikge1xuXHRcdGlmICh0aGlzLl9oaWRkZW4gIT09IGhpZGRlbikge1xuXHRcdFx0dGhpcy5faGlkZGVuID0gaGlkZGVuO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGhpZGRlbiB9KTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3NldEVuYWJsZWQodmFsdWU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRzdXBlci5fc2V0RW5hYmxlZCh2YWx1ZSk7XG5cdFx0aWYgKHRoaXMuaGlkZU9uRGlzYWJsZWQpIHtcblx0XHRcdHRoaXMuaGlkZGVuID0gIXZhbHVlO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBoaWRlT25EaXNhYmxlZDogYm9vbGVhbiA9IHRydWU7XG5cblx0YWJzdHJhY3QgdXBkYXRlKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBCdXR0b25XaXRoRHJvcERvd25FeHRlbnNpb25BY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHByaXZhdGUgcHJpbWFyeUFjdGlvbjogSUFjdGlvbiB8IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBtZW51QWN0aW9uQ2xhc3NOYW1lczogc3RyaW5nW10gPSBbXTtcblx0cHJpdmF0ZSBfbWVudUFjdGlvbnM6IElBY3Rpb25bXSA9IFtdO1xuXHRnZXQgbWVudUFjdGlvbnMoKTogSUFjdGlvbltdIHsgcmV0dXJuIFsuLi50aGlzLl9tZW51QWN0aW9uc107IH1cblxuXHRvdmVycmlkZSBnZXQgZXh0ZW5zaW9uKCk6IElFeHRlbnNpb24gfCBudWxsIHtcblx0XHRyZXR1cm4gc3VwZXIuZXh0ZW5zaW9uO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0IGV4dGVuc2lvbihleHRlbnNpb246IElFeHRlbnNpb24gfCBudWxsKSB7XG5cdFx0dGhpcy5leHRlbnNpb25BY3Rpb25zLmZvckVhY2goYSA9PiBhLmV4dGVuc2lvbiA9IGV4dGVuc2lvbik7XG5cdFx0c3VwZXIuZXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IGV4dGVuc2lvbkFjdGlvbnM6IEV4dGVuc2lvbkFjdGlvbltdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0Y2xheno6IHN0cmluZyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvbnNHcm91cHM6IEV4dGVuc2lvbkFjdGlvbltdW10sXG5cdCkge1xuXHRcdGNsYXp6ID0gYCR7Y2xhenp9IGFjdGlvbi1kcm9wZG93bmA7XG5cdFx0c3VwZXIoaWQsIHVuZGVmaW5lZCwgY2xhenopO1xuXHRcdHRoaXMubWVudUFjdGlvbkNsYXNzTmFtZXMgPSBjbGF6ei5zcGxpdCgnICcpO1xuXHRcdHRoaXMuaGlkZU9uRGlzYWJsZWQgPSBmYWxzZTtcblx0XHR0aGlzLmV4dGVuc2lvbkFjdGlvbnMgPSBhY3Rpb25zR3JvdXBzLmZsYXQoKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueSguLi50aGlzLmV4dGVuc2lvbkFjdGlvbnMubWFwKGEgPT4gYS5vbkRpZENoYW5nZSkpKCgpID0+IHRoaXMudXBkYXRlKHRydWUpKSk7XG5cdFx0dGhpcy5leHRlbnNpb25BY3Rpb25zLmZvckVhY2goYSA9PiB0aGlzLl9yZWdpc3RlcihhKSk7XG5cdH1cblxuXHR1cGRhdGUoZG9ub3RVcGRhdGVBY3Rpb25zPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICghZG9ub3RVcGRhdGVBY3Rpb25zKSB7XG5cdFx0XHR0aGlzLmV4dGVuc2lvbkFjdGlvbnMuZm9yRWFjaChhID0+IGEudXBkYXRlKCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGlvbnNHcm91cHMgPSB0aGlzLmFjdGlvbnNHcm91cHMubWFwKGFjdGlvbnNHcm91cCA9PiBhY3Rpb25zR3JvdXAuZmlsdGVyKGEgPT4gIWEuaGlkZGVuKSk7XG5cblx0XHRsZXQgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCB2aXNpYmxlQWN0aW9ucyBvZiBhY3Rpb25zR3JvdXBzKSB7XG5cdFx0XHRpZiAodmlzaWJsZUFjdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdGFjdGlvbnMgPSBbLi4uYWN0aW9ucywgLi4udmlzaWJsZUFjdGlvbnMsIG5ldyBTZXBhcmF0b3IoKV07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGFjdGlvbnMgPSBhY3Rpb25zLmxlbmd0aCA/IGFjdGlvbnMuc2xpY2UoMCwgYWN0aW9ucy5sZW5ndGggLSAxKSA6IGFjdGlvbnM7XG5cblx0XHR0aGlzLnByaW1hcnlBY3Rpb24gPSBhY3Rpb25zWzBdO1xuXHRcdHRoaXMuX21lbnVBY3Rpb25zID0gYWN0aW9ucy5sZW5ndGggPiAxID8gYWN0aW9ucyA6IFtdO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoeyBtZW51QWN0aW9uczogdGhpcy5fbWVudUFjdGlvbnMgfSk7XG5cblx0XHRpZiAodGhpcy5wcmltYXJ5QWN0aW9uKSB7XG5cdFx0XHR0aGlzLmhpZGRlbiA9IGZhbHNlO1xuXHRcdFx0dGhpcy5lbmFibGVkID0gdGhpcy5wcmltYXJ5QWN0aW9uLmVuYWJsZWQ7XG5cdFx0XHR0aGlzLmxhYmVsID0gdGhpcy5nZXRMYWJlbCh0aGlzLnByaW1hcnlBY3Rpb24gYXMgRXh0ZW5zaW9uQWN0aW9uKTtcblx0XHRcdHRoaXMudG9vbHRpcCA9IHRoaXMucHJpbWFyeUFjdGlvbi50b29sdGlwO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmhpZGRlbiA9IHRydWU7XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuZW5hYmxlZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5wcmltYXJ5QWN0aW9uPy5ydW4oKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0TGFiZWwoYWN0aW9uOiBFeHRlbnNpb25BY3Rpb24pOiBzdHJpbmcge1xuXHRcdHJldHVybiBhY3Rpb24ubGFiZWw7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEJ1dHRvbldpdGhEcm9wZG93bkV4dGVuc2lvbkFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQWN0aW9uV2l0aERyb3Bkb3duQWN0aW9uVmlld0l0ZW0ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogQnV0dG9uV2l0aERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uLFxuXHRcdG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgJiBJQWN0aW9uV2l0aERyb3Bkb3duQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHRcdGNvbnRleHRNZW51UHJvdmlkZXI6IElDb250ZXh0TWVudVByb3ZpZGVyXG5cdCkge1xuXHRcdHN1cGVyKG51bGwsIGFjdGlvbiwgb3B0aW9ucywgY29udGV4dE1lbnVQcm92aWRlcik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWN0aW9uLm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0aWYgKGUuaGlkZGVuICE9PSB1bmRlZmluZWQgfHwgZS5tZW51QWN0aW9ucyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQ2xhc3MoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcihjb250YWluZXIpO1xuXHRcdHRoaXMudXBkYXRlQ2xhc3MoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSB1cGRhdGVDbGFzcygpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVDbGFzcygpO1xuXHRcdGlmICh0aGlzLmVsZW1lbnQgJiYgdGhpcy5kcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbT8uZWxlbWVudCkge1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2hpZGUnLCAoPEJ1dHRvbldpdGhEcm9wRG93bkV4dGVuc2lvbkFjdGlvbj50aGlzLl9hY3Rpb24pLmhpZGRlbik7XG5cdFx0XHRjb25zdCBpc01lbnVFbXB0eSA9ICg8QnV0dG9uV2l0aERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uPnRoaXMuX2FjdGlvbikubWVudUFjdGlvbnMubGVuZ3RoID09PSAwO1xuXHRcdFx0dGhpcy5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2VtcHR5JywgaXNNZW51RW1wdHkpO1xuXHRcdFx0dGhpcy5kcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbS5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ2hpZGUnLCBpc01lbnVFbXB0eSk7XG5cdFx0fVxuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIEluc3RhbGxBY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBDTEFTUyA9IGAke3RoaXMuTEFCRUxfQUNUSU9OX0NMQVNTfSBwcm9taW5lbnQgaW5zdGFsbGA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEhJREUgPSBgJHt0aGlzLkNMQVNTfSBoaWRlYDtcblxuXHRwcm90ZWN0ZWQgX21hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QgfCBudWxsID0gbnVsbDtcblx0c2V0IG1hbmlmZXN0KG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QgfCBudWxsKSB7XG5cdFx0dGhpcy5fbWFuaWZlc3QgPSBtYW5pZmVzdDtcblx0XHR0aGlzLnVwZGF0ZUxhYmVsKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IHVwZGF0ZVRocm90dGxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZXIoKSk7XG5cdHB1YmxpYyByZWFkb25seSBvcHRpb25zOiBJbnN0YWxsT3B0aW9ucztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJbnN0YWxsT3B0aW9ucyxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBydW50aW1lRXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JrYmVuY2hUaGVtZVNlcnZpY2U6IElXb3JrYmVuY2hUaGVtZVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcmVmZXJlbmNlc1NlcnZpY2U6IElQcmVmZXJlbmNlc1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2U6IElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zLmluc3RhbGwnLCBsb2NhbGl6ZSgnaW5zdGFsbCcsIFwiSW5zdGFsbFwiKSwgSW5zdGFsbEFjdGlvbi5DTEFTUywgZmFsc2UpO1xuXHRcdHRoaXMuaGlkZU9uRGlzYWJsZWQgPSBmYWxzZTtcblx0XHR0aGlzLm9wdGlvbnMgPSB7IGlzTWFjaGluZVNjb3BlZDogZmFsc2UsIC4uLm9wdGlvbnMgfTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFsbG93ZWRFeHRlbnNpb25zU2VydmljZS5vbkRpZENoYW5nZUFsbG93ZWRFeHRlbnNpb25zQ29uZmlnVmFsdWUoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGFiZWxTZXJ2aWNlLm9uRGlkQ2hhbmdlRm9ybWF0dGVycygoKSA9PiB0aGlzLnVwZGF0ZUxhYmVsKCksIHRoaXMpKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZVRocm90dGxlci5xdWV1ZSgoKSA9PiB0aGlzLmNvbXB1dGVBbmRVcGRhdGVFbmFibGVtZW50KCkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGNvbXB1dGVBbmRVcGRhdGVFbmFibGVtZW50KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuY2xhc3MgPSBJbnN0YWxsQWN0aW9uLkhJREU7XG5cdFx0dGhpcy5oaWRkZW4gPSB0cnVlO1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmlzQnVpbHRpbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5jYW5TZXRMYW5ndWFnZSh0aGlzLmV4dGVuc2lvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnN0YXRlICE9PSBFeHRlbnNpb25TdGF0ZS5Vbmluc3RhbGxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5vcHRpb25zLmluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbiAmJiAoIXRoaXMuZXh0ZW5zaW9uLmhhc1ByZVJlbGVhc2VWZXJzaW9uIHx8IHRoaXMuYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLmlzQWxsb3dlZCh7IGlkOiB0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBwdWJsaXNoZXJEaXNwbGF5TmFtZTogdGhpcy5leHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWUsIHByZXJlbGVhc2U6IHRydWUgfSkgIT09IHRydWUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5vcHRpb25zLmluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbiAmJiAhdGhpcy5leHRlbnNpb24uaGFzUmVsZWFzZVZlcnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5oaWRkZW4gPSBmYWxzZTtcblx0XHR0aGlzLmNsYXNzID0gSW5zdGFsbEFjdGlvbi5DTEFTUztcblx0XHRpZiAoYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5jYW5JbnN0YWxsKHRoaXMuZXh0ZW5zaW9uKSA9PT0gdHJ1ZSkge1xuXHRcdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdHRoaXMudXBkYXRlTGFiZWwoKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmdhbGxlcnkgJiYgIXRoaXMuZXh0ZW5zaW9uLmdhbGxlcnkuaXNTaWduZWQgJiYgc2hvdWxkUmVxdWlyZVJlcG9zaXRvcnlTaWduYXR1cmVGb3IodGhpcy5leHRlbnNpb24ucHJpdmF0ZSwgYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlLmdldEV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdCgpKSkge1xuXHRcdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHR0eXBlOiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnbm90IHNpZ25lZCcsIFwiJ3swfScgaXMgYW4gZXh0ZW5zaW9uIGZyb20gYW4gdW5rbm93biBzb3VyY2UuIEFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBpbnN0YWxsP1wiLCB0aGlzLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSksXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ25vdCBzaWduZWQgZGV0YWlsJywgXCJFeHRlbnNpb24gaXMgbm90IHNpZ25lZC5cIiksXG5cdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2luc3RhbGwgYW55d2F5JywgXCJJbnN0YWxsIEFueXdheVwiKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLm9wdGlvbnMuZG9ub3RWZXJpZnlTaWduYXR1cmUgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdGNhbmNlbEJ1dHRvbjoge1xuXHRcdFx0XHRcdHJ1bjogKCkgPT4gZmFsc2Vcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mbykge1xuXHRcdFx0bGV0IGRldGFpbDogc3RyaW5nIHwgTWFya2Rvd25TdHJpbmcgPSBsb2NhbGl6ZSgnZGVwcmVjYXRlZCBtZXNzYWdlJywgXCJUaGlzIGV4dGVuc2lvbiBpcyBkZXByZWNhdGVkIGFzIGl0IGlzIG5vIGxvbmdlciBiZWluZyBtYWludGFpbmVkLlwiKTtcblx0XHRcdGVudW0gRGVwcmVjYXRpb25DaG9pY2Uge1xuXHRcdFx0XHRJbnN0YWxsQW55d2F5ID0gMCxcblx0XHRcdFx0U2hvd0FsdGVybmF0ZUV4dGVuc2lvbiA9IDEsXG5cdFx0XHRcdENvbmZpZ3VyZVNldHRpbmdzID0gMixcblx0XHRcdFx0Q2FuY2VsID0gM1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYnV0dG9uczogSVByb21wdEJ1dHRvbjxEZXByZWNhdGlvbkNob2ljZT5bXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnaW5zdGFsbCBhbnl3YXknLCBcIkluc3RhbGwgQW55d2F5XCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gRGVwcmVjYXRpb25DaG9pY2UuSW5zdGFsbEFueXdheVxuXHRcdFx0XHR9XG5cdFx0XHRdO1xuXG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvLmV4dGVuc2lvbikge1xuXHRcdFx0XHRkZXRhaWwgPSBsb2NhbGl6ZSgnZGVwcmVjYXRlZCB3aXRoIGFsdGVybmF0ZSBleHRlbnNpb24gbWVzc2FnZScsIFwiVGhpcyBleHRlbnNpb24gaXMgZGVwcmVjYXRlZC4gVXNlIHRoZSB7MH0gZXh0ZW5zaW9uIGluc3RlYWQuXCIsIHRoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mby5leHRlbnNpb24uZGlzcGxheU5hbWUpO1xuXG5cdFx0XHRcdGNvbnN0IGFsdGVybmF0ZUV4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mby5leHRlbnNpb247XG5cdFx0XHRcdGJ1dHRvbnMucHVzaCh7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAnU2hvdyBhbHRlcm5hdGUgZXh0ZW5zaW9uJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmT3BlbiB7MH1cIiwgdGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSksXG5cdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBbZXh0ZW5zaW9uXSA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyBpZDogYWx0ZXJuYXRlRXh0ZW5zaW9uLmlkLCBwcmVSZWxlYXNlOiBhbHRlcm5hdGVFeHRlbnNpb24ucHJlUmVsZWFzZSB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW4oZXh0ZW5zaW9uKTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuIERlcHJlY2F0aW9uQ2hvaWNlLlNob3dBbHRlcm5hdGVFeHRlbnNpb247XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvLnNldHRpbmdzKSB7XG5cdFx0XHRcdGRldGFpbCA9IGxvY2FsaXplKCdkZXByZWNhdGVkIHdpdGggYWx0ZXJuYXRlIHNldHRpbmdzIG1lc3NhZ2UnLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIGRlcHJlY2F0ZWQgYXMgdGhpcyBmdW5jdGlvbmFsaXR5IGlzIG5vdyBidWlsdC1pbiB0byBWUyBDb2RlLlwiKTtcblxuXHRcdFx0XHRjb25zdCBzZXR0aW5ncyA9IHRoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mby5zZXR0aW5ncztcblx0XHRcdFx0YnV0dG9ucy5wdXNoKHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICdjb25maWd1cmUgaW4gc2V0dGluZ3MnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZDb25maWd1cmUgU2V0dGluZ3NcIiksXG5cdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuU2V0dGluZ3MoeyBxdWVyeTogc2V0dGluZ3MubWFwKHNldHRpbmcgPT4gYEBpZDoke3NldHRpbmd9YCkuam9pbignICcpIH0pO1xuXG5cdFx0XHRcdFx0XHRyZXR1cm4gRGVwcmVjYXRpb25DaG9pY2UuQ29uZmlndXJlU2V0dGluZ3M7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSBpZiAodGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvLmFkZGl0aW9uYWxJbmZvKSB7XG5cdFx0XHRcdGRldGFpbCA9IG5ldyBNYXJrZG93blN0cmluZyhgJHtkZXRhaWx9ICR7dGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvLmFkZGl0aW9uYWxJbmZvfWApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB7IHJlc3VsdCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRcdHR5cGU6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdpbnN0YWxsIGNvbmZpcm1hdGlvbicsIFwiQXJlIHlvdSBzdXJlIHlvdSB3YW50IHRvIGluc3RhbGwgJ3swfSc/XCIsIHRoaXMuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKSxcblx0XHRcdFx0ZGV0YWlsOiBpc1N0cmluZyhkZXRhaWwpID8gZGV0YWlsIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjdXN0b206IGlzU3RyaW5nKGRldGFpbCkgPyB1bmRlZmluZWQgOiB7XG5cdFx0XHRcdFx0bWFya2Rvd25EZXRhaWxzOiBbe1xuXHRcdFx0XHRcdFx0bWFya2Rvd246IGRldGFpbFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGJ1dHRvbnMsXG5cdFx0XHRcdGNhbmNlbEJ1dHRvbjoge1xuXHRcdFx0XHRcdHJ1bjogKCkgPT4gRGVwcmVjYXRpb25DaG9pY2UuQ2FuY2VsXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0aWYgKHJlc3VsdCAhPT0gRGVwcmVjYXRpb25DaG9pY2UuSW5zdGFsbEFueXdheSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuKHRoaXMuZXh0ZW5zaW9uLCB7IHNob3dQcmVSZWxlYXNlVmVyc2lvbjogdGhpcy5vcHRpb25zLmluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbiB9KTtcblxuXHRcdGFsZXJ0KGxvY2FsaXplKCdpbnN0YWxsRXh0ZW5zaW9uU3RhcnQnLCBcIkluc3RhbGxpbmcgZXh0ZW5zaW9uIHswfSBzdGFydGVkLiBBbiBlZGl0b3IgaXMgbm93IG9wZW4gd2l0aCBtb3JlIGRldGFpbHMgb24gdGhpcyBleHRlbnNpb25cIiwgdGhpcy5leHRlbnNpb24uZGlzcGxheU5hbWUpKTtcblxuXHRcdC8qIF9fR0RQUl9fXG5cdFx0XHRcImV4dGVuc2lvbnM6YWN0aW9uOmluc3RhbGxcIiA6IHtcblx0XHRcdFx0XCJvd25lclwiOiBcInNhbmR5MDgxXCIsXG5cdFx0XHRcdFwiYWN0aW9uSWRcIiA6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIgfSxcblx0XHRcdFx0XCIke2luY2x1ZGV9XCI6IFtcblx0XHRcdFx0XHRcIiR7R2FsbGVyeUV4dGVuc2lvblRlbGVtZXRyeURhdGF9XCJcblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdCovXG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZygnZXh0ZW5zaW9uczphY3Rpb246aW5zdGFsbCcsIHsgLi4udGhpcy5leHRlbnNpb24udGVsZW1ldHJ5RGF0YSwgYWN0aW9uSWQ6IHRoaXMuaWQgfSk7XG5cblx0XHRjb25zdCBleHRlbnNpb24gPSBhd2FpdCB0aGlzLmluc3RhbGwodGhpcy5leHRlbnNpb24pO1xuXG5cdFx0aWYgKGV4dGVuc2lvbj8ubG9jYWwpIHtcblx0XHRcdGFsZXJ0KGxvY2FsaXplKCdpbnN0YWxsRXh0ZW5zaW9uQ29tcGxldGUnLCBcIkluc3RhbGxpbmcgZXh0ZW5zaW9uIHswfSBpcyBjb21wbGV0ZWQuXCIsIHRoaXMuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKSk7XG5cdFx0XHRjb25zdCBydW5uaW5nRXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5nZXRSdW5uaW5nRXh0ZW5zaW9uKGV4dGVuc2lvbi5sb2NhbCk7XG5cdFx0XHRpZiAocnVubmluZ0V4dGVuc2lvbiAmJiAhKHJ1bm5pbmdFeHRlbnNpb24uYWN0aXZhdGlvbkV2ZW50cyAmJiBydW5uaW5nRXh0ZW5zaW9uLmFjdGl2YXRpb25FdmVudHMuc29tZShhY3RpdmF0aW9uRWVudCA9PiBhY3RpdmF0aW9uRWVudC5zdGFydHNXaXRoKCdvbkxhbmd1YWdlJykpKSkge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBhd2FpdCB0aGlzLmdldFRoZW1lQWN0aW9uKGV4dGVuc2lvbik7XG5cdFx0XHRcdGlmIChhY3Rpb24pIHtcblx0XHRcdFx0XHRhY3Rpb24uZXh0ZW5zaW9uID0gZXh0ZW5zaW9uO1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gYWN0aW9uLnJ1bih7IHNob3dDdXJyZW50VGhlbWU6IHRydWUsIGlnbm9yZUZvY3VzTG9zdDogdHJ1ZSB9KTtcblx0XHRcdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRcdFx0YWN0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0VGhlbWVBY3Rpb24oZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogUHJvbWlzZTxFeHRlbnNpb25BY3Rpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjb2xvclRoZW1lcyA9IGF3YWl0IHRoaXMud29ya2JlbmNoVGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWVzKCk7XG5cdFx0aWYgKGNvbG9yVGhlbWVzLnNvbWUodGhlbWUgPT4gaXNUaGVtZUZyb21FeHRlbnNpb24odGhlbWUsIGV4dGVuc2lvbikpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXRDb2xvclRoZW1lQWN0aW9uKTtcblx0XHR9XG5cdFx0Y29uc3QgZmlsZUljb25UaGVtZXMgPSBhd2FpdCB0aGlzLndvcmtiZW5jaFRoZW1lU2VydmljZS5nZXRGaWxlSWNvblRoZW1lcygpO1xuXHRcdGlmIChmaWxlSWNvblRoZW1lcy5zb21lKHRoZW1lID0+IGlzVGhlbWVGcm9tRXh0ZW5zaW9uKHRoZW1lLCBleHRlbnNpb24pKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0RmlsZUljb25UaGVtZUFjdGlvbik7XG5cdFx0fVxuXHRcdGNvbnN0IHByb2R1Y3RJY29uVGhlbWVzID0gYXdhaXQgdGhpcy53b3JrYmVuY2hUaGVtZVNlcnZpY2UuZ2V0UHJvZHVjdEljb25UaGVtZXMoKTtcblx0XHRpZiAocHJvZHVjdEljb25UaGVtZXMuc29tZSh0aGVtZSA9PiBpc1RoZW1lRnJvbUV4dGVuc2lvbih0aGVtZSwgZXh0ZW5zaW9uKSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldFByb2R1Y3RJY29uVGhlbWVBY3Rpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpbnN0YWxsKGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IFByb21pc2U8SUV4dGVuc2lvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pbnN0YWxsKGV4dGVuc2lvbiwgdGhpcy5vcHRpb25zKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0YXdhaXQgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRFeHRlbnNpb25JbnN0YWxsRmFpbHVyZUFjdGlvbiwgZXh0ZW5zaW9uLCB0aGlzLm9wdGlvbnMsIGV4dGVuc2lvbi5sYXRlc3RWZXJzaW9uLCBJbnN0YWxsT3BlcmF0aW9uLkluc3RhbGwsIGVycm9yKS5ydW4oKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRSdW5uaW5nRXh0ZW5zaW9uKGV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uKTogUHJvbWlzZTxJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfCBudWxsPiB7XG5cdFx0Y29uc3QgcnVubmluZ0V4dGVuc2lvbiA9IGF3YWl0IHRoaXMucnVudGltZUV4dGVuc2lvblNlcnZpY2UuZ2V0RXh0ZW5zaW9uKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRpZiAocnVubmluZ0V4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuIHJ1bm5pbmdFeHRlbnNpb247XG5cdFx0fVxuXHRcdGlmICh0aGlzLnJ1bnRpbWVFeHRlbnNpb25TZXJ2aWNlLmNhbkFkZEV4dGVuc2lvbih0b0V4dGVuc2lvbkRlc2NyaXB0aW9uKGV4dGVuc2lvbikpKSB7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8SUV4dGVuc2lvbkRlc2NyaXB0aW9uIHwgbnVsbD4oKGMsIGUpID0+IHtcblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMucnVudGltZUV4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBydW5uaW5nRXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5ydW50aW1lRXh0ZW5zaW9uU2VydmljZS5nZXRFeHRlbnNpb24oZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0XHRcdGlmIChydW5uaW5nRXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdGMocnVubmluZ0V4dGVuc2lvbik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByb3RlY3RlZCB1cGRhdGVMYWJlbCgpOiB2b2lkIHtcblx0XHR0aGlzLmxhYmVsID0gdGhpcy5nZXRMYWJlbCgpO1xuXHR9XG5cblx0Z2V0TGFiZWwocHJpbWFyeT86IGJvb2xlYW4pOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbj8uaXNXb3Jrc3BhY2VTY29wZWQgJiYgdGhpcy5leHRlbnNpb24ucmVzb3VyY2VFeHRlbnNpb24gJiYgdGhpcy5jb250ZXh0U2VydmljZS5pc0luc2lkZVdvcmtzcGFjZSh0aGlzLmV4dGVuc2lvbi5yZXNvdXJjZUV4dGVuc2lvbi5sb2NhdGlvbikpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnaW5zdGFsbCB3b3Jrc3BhY2UgdmVyc2lvbicsIFwiSW5zdGFsbCBXb3Jrc3BhY2UgRXh0ZW5zaW9uXCIpO1xuXHRcdH1cblx0XHQvKiBpbnN0YWxsIHByZS1yZWxlYXNlIHZlcnNpb24gKi9cblx0XHRpZiAodGhpcy5vcHRpb25zLmluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbiAmJiB0aGlzLmV4dGVuc2lvbj8uaGFzUHJlUmVsZWFzZVZlcnNpb24pIHtcblx0XHRcdHJldHVybiBwcmltYXJ5ID8gbG9jYWxpemUoJ2luc3RhbGwgcHJlLXJlbGVhc2UnLCBcIkluc3RhbGwgUHJlLVJlbGVhc2VcIikgOiBsb2NhbGl6ZSgnaW5zdGFsbCBwcmUtcmVsZWFzZSB2ZXJzaW9uJywgXCJJbnN0YWxsIFByZS1SZWxlYXNlIFZlcnNpb25cIik7XG5cdFx0fVxuXHRcdC8qIGluc3RhbGwgcmVsZWFzZWQgdmVyc2lvbiB0aGF0IGhhcyBhIHByZSByZWxlYXNlIHZlcnNpb24gKi9cblx0XHRpZiAodGhpcy5leHRlbnNpb24/Lmhhc1ByZVJlbGVhc2VWZXJzaW9uKSB7XG5cdFx0XHRyZXR1cm4gcHJpbWFyeSA/IGxvY2FsaXplKCdpbnN0YWxsJywgXCJJbnN0YWxsXCIpIDogbG9jYWxpemUoJ2luc3RhbGwgcmVsZWFzZSB2ZXJzaW9uJywgXCJJbnN0YWxsIFJlbGVhc2UgVmVyc2lvblwiKTtcblx0XHR9XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdpbnN0YWxsJywgXCJJbnN0YWxsXCIpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIEluc3RhbGxEcm9wZG93bkFjdGlvbiBleHRlbmRzIEJ1dHRvbldpdGhEcm9wRG93bkV4dGVuc2lvbkFjdGlvbiB7XG5cblx0c2V0IG1hbmlmZXN0KG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QgfCBudWxsKSB7XG5cdFx0dGhpcy5leHRlbnNpb25BY3Rpb25zLmZvckVhY2goYSA9PiAoPEluc3RhbGxBY3Rpb24+YSkubWFuaWZlc3QgPSBtYW5pZmVzdCk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGBleHRlbnNpb25zLmluc3RhbGxBY3Rpb25zYCwgSW5zdGFsbEFjdGlvbi5DTEFTUywgW1xuXHRcdFx0W1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbnN0YWxsQWN0aW9uLCB7IGluc3RhbGxQcmVSZWxlYXNlVmVyc2lvbjogZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UucHJlZmVyUHJlUmVsZWFzZXMgfSksXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxBY3Rpb24sIHsgaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiAhZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UucHJlZmVyUHJlUmVsZWFzZXMgfSksXG5cdFx0XHRdXG5cdFx0XSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0TGFiZWwoYWN0aW9uOiBJbnN0YWxsQWN0aW9uKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYWN0aW9uLmdldExhYmVsKHRydWUpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIEluc3RhbGxpbmdMYWJlbEFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnaW5zdGFsbGluZycsIFwiSW5zdGFsbGluZ1wiKTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ0xBU1MgPSBgJHtFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTfSBpbnN0YWxsIGluc3RhbGxpbmdgO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb24uaW5zdGFsbGluZycsIEluc3RhbGxpbmdMYWJlbEFjdGlvbi5MQUJFTCwgSW5zdGFsbGluZ0xhYmVsQWN0aW9uLkNMQVNTLCBmYWxzZSk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5jbGFzcyA9IGAke0luc3RhbGxpbmdMYWJlbEFjdGlvbi5DTEFTU30ke3RoaXMuZXh0ZW5zaW9uICYmIHRoaXMuZXh0ZW5zaW9uLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsaW5nID8gJycgOiAnIGhpZGUnfWA7XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEluc3RhbGxJbk90aGVyU2VydmVyQWN0aW9uIGV4dGVuZHMgRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRwcm90ZWN0ZWQgc3RhdGljIHJlYWRvbmx5IElOU1RBTExfTEFCRUwgPSBsb2NhbGl6ZSgnaW5zdGFsbCcsIFwiSW5zdGFsbFwiKTtcblx0cHJvdGVjdGVkIHN0YXRpYyByZWFkb25seSBJTlNUQUxMSU5HX0xBQkVMID0gbG9jYWxpemUoJ2luc3RhbGxpbmcnLCBcIkluc3RhbGxpbmdcIik7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ2xhc3MgPSBgJHtFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTfSBwcm9taW5lbnQgaW5zdGFsbC1vdGhlci1zZXJ2ZXJgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBJbnN0YWxsaW5nQ2xhc3MgPSBgJHtFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTfSBpbnN0YWxsLW90aGVyLXNlcnZlciBpbnN0YWxsaW5nYDtcblxuXHR1cGRhdGVXaGVuQ291bnRlckV4dGVuc2lvbkNoYW5nZXM6IGJvb2xlYW4gPSB0cnVlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZXJ2ZXI6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyIHwgbnVsbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNhbkluc3RhbGxBbnlXaGVyZTogYm9vbGVhbixcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2U6IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihpZCwgSW5zdGFsbEluT3RoZXJTZXJ2ZXJBY3Rpb24uSU5TVEFMTF9MQUJFTCwgSW5zdGFsbEluT3RoZXJTZXJ2ZXJBY3Rpb24uQ2xhc3MsIGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuY2xhc3MgPSBJbnN0YWxsSW5PdGhlclNlcnZlckFjdGlvbi5DbGFzcztcblxuXHRcdGlmICh0aGlzLmNhbkluc3RhbGwoKSkge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uSW5PdGhlclNlcnZlciA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaW5zdGFsbGVkLmZpbHRlcihlID0+IGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgdGhpcy5leHRlbnNpb24hLmlkZW50aWZpZXIpICYmIGUuc2VydmVyID09PSB0aGlzLnNlcnZlcilbMF07XG5cdFx0XHRpZiAoZXh0ZW5zaW9uSW5PdGhlclNlcnZlcikge1xuXHRcdFx0XHQvLyBHZXR0aW5nIGluc3RhbGxlZCBpbiBvdGhlciBzZXJ2ZXJcblx0XHRcdFx0aWYgKGV4dGVuc2lvbkluT3RoZXJTZXJ2ZXIuc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxpbmcgJiYgIWV4dGVuc2lvbkluT3RoZXJTZXJ2ZXIubG9jYWwpIHtcblx0XHRcdFx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMubGFiZWwgPSBJbnN0YWxsSW5PdGhlclNlcnZlckFjdGlvbi5JTlNUQUxMSU5HX0xBQkVMO1xuXHRcdFx0XHRcdHRoaXMuY2xhc3MgPSBJbnN0YWxsSW5PdGhlclNlcnZlckFjdGlvbi5JbnN0YWxsaW5nQ2xhc3M7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIE5vdCBpbnN0YWxsZWQgaW4gb3RoZXIgc2VydmVyXG5cdFx0XHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMubGFiZWwgPSB0aGlzLmdldEluc3RhbGxMYWJlbCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBjYW5JbnN0YWxsKCk6IGJvb2xlYW4ge1xuXHRcdC8vIERpc2FibGUgaWYgZXh0ZW5zaW9uIGlzIG5vdCBpbnN0YWxsZWQgb3Igbm90IGFuIHVzZXIgZXh0ZW5zaW9uXG5cdFx0aWYgKFxuXHRcdFx0IXRoaXMuZXh0ZW5zaW9uXG5cdFx0XHR8fCAhdGhpcy5zZXJ2ZXJcblx0XHRcdHx8ICF0aGlzLmV4dGVuc2lvbi5sb2NhbFxuXHRcdFx0fHwgdGhpcy5leHRlbnNpb24uc3RhdGUgIT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZFxuXHRcdFx0fHwgdGhpcy5leHRlbnNpb24udHlwZSAhPT0gRXh0ZW5zaW9uVHlwZS5Vc2VyXG5cdFx0XHR8fCB0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5RW52aXJvbm1lbnQgfHwgdGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeVRydXN0UmVxdWlyZW1lbnQgfHwgdGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeVZpcnR1YWxXb3Jrc3BhY2Vcblx0XHQpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoaXNMYW5ndWFnZVBhY2tFeHRlbnNpb24odGhpcy5leHRlbnNpb24ubG9jYWwubWFuaWZlc3QpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBQcmVmZXJzIHRvIHJ1biBvbiBVSVxuXHRcdGlmICh0aGlzLnNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLnByZWZlcnNFeGVjdXRlT25VSSh0aGlzLmV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdCkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIFByZWZlcnMgdG8gcnVuIG9uIFdvcmtzcGFjZVxuXHRcdGlmICh0aGlzLnNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5wcmVmZXJzRXhlY3V0ZU9uV29ya3NwYWNlKHRoaXMuZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0KSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gUHJlZmVycyB0byBydW4gb24gV2ViXG5cdFx0aWYgKHRoaXMuc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLnByZWZlcnNFeGVjdXRlT25XZWIodGhpcy5leHRlbnNpb24ubG9jYWwubWFuaWZlc3QpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jYW5JbnN0YWxsQW55V2hlcmUpIHtcblx0XHRcdC8vIENhbiBydW4gb24gVUlcblx0XHRcdGlmICh0aGlzLnNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmNhbkV4ZWN1dGVPblVJKHRoaXMuZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0KSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2FuIHJ1biBvbiBXb3Jrc3BhY2Vcblx0XHRcdGlmICh0aGlzLnNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHRoaXMuZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZS5jYW5FeGVjdXRlT25Xb3Jrc3BhY2UodGhpcy5leHRlbnNpb24ubG9jYWwubWFuaWZlc3QpKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uPy5sb2NhbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uPy5zZXJ2ZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLnNlcnZlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW4odGhpcy5leHRlbnNpb24pO1xuXHRcdGFsZXJ0KGxvY2FsaXplKCdpbnN0YWxsRXh0ZW5zaW9uU3RhcnQnLCBcIkluc3RhbGxpbmcgZXh0ZW5zaW9uIHswfSBzdGFydGVkLiBBbiBlZGl0b3IgaXMgbm93IG9wZW4gd2l0aCBtb3JlIGRldGFpbHMgb24gdGhpcyBleHRlbnNpb25cIiwgdGhpcy5leHRlbnNpb24uZGlzcGxheU5hbWUpKTtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pbnN0YWxsSW5TZXJ2ZXIodGhpcy5leHRlbnNpb24sIHRoaXMuc2VydmVyKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXRJbnN0YWxsTGFiZWwoKTogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgUmVtb3RlSW5zdGFsbEFjdGlvbiBleHRlbmRzIEluc3RhbGxJbk90aGVyU2VydmVyQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjYW5JbnN0YWxsQW55V2hlcmU6IGJvb2xlYW4sXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2U6IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UgZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZTogSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGBleHRlbnNpb25zLnJlbW90ZWluc3RhbGxgLCBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyLCBjYW5JbnN0YWxsQW55V2hlcmUsIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSwgZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0SW5zdGFsbExhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclxuXHRcdFx0PyBsb2NhbGl6ZSh7IGtleTogJ2luc3RhbGwgaW4gcmVtb3RlJywgY29tbWVudDogWydUaGlzIGlzIHRoZSBuYW1lIG9mIHRoZSBhY3Rpb24gdG8gaW5zdGFsbCBhbiBleHRlbnNpb24gaW4gcmVtb3RlIHNlcnZlci4gUGxhY2Vob2xkZXIgaXMgZm9yIHRoZSBuYW1lIG9mIHJlbW90ZSBzZXJ2ZXIuJ10gfSwgXCJJbnN0YWxsIGluIHswfVwiLCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIubGFiZWwpXG5cdFx0XHQ6IEluc3RhbGxJbk90aGVyU2VydmVyQWN0aW9uLklOU1RBTExfTEFCRUw7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgTG9jYWxJbnN0YWxsQWN0aW9uIGV4dGVuZHMgSW5zdGFsbEluT3RoZXJTZXJ2ZXJBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIGV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2U6IElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihgZXh0ZW5zaW9ucy5sb2NhbGluc3RhbGxgLCBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIsIGZhbHNlLCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsIGV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldEluc3RhbGxMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnaW5zdGFsbCBsb2NhbGx5JywgXCJJbnN0YWxsIExvY2FsbHlcIik7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgV2ViSW5zdGFsbEFjdGlvbiBleHRlbmRzIEluc3RhbGxJbk90aGVyU2VydmVyQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSBleHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoYGV4dGVuc2lvbnMud2ViSW5zdGFsbGAsIGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIsIGZhbHNlLCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZSwgZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsIGV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldEluc3RhbGxMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnaW5zdGFsbCBicm93c2VyJywgXCJJbnN0YWxsIGluIEJyb3dzZXJcIik7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgVW5pbnN0YWxsQWN0aW9uIGV4dGVuZHMgRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVW5pbnN0YWxsTGFiZWwgPSBsb2NhbGl6ZSgndW5pbnN0YWxsQWN0aW9uJywgXCJVbmluc3RhbGxcIik7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFVuaW5zdGFsbGluZ0xhYmVsID0gbG9jYWxpemUoJ1VuaW5zdGFsbGluZycsIFwiVW5pbnN0YWxsaW5nXCIpO1xuXG5cdHN0YXRpYyByZWFkb25seSBVbmluc3RhbGxDbGFzcyA9IGAke0V4dGVuc2lvbkFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1N9IHVuaW5zdGFsbGA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFVuSW5zdGFsbGluZ0NsYXNzID0gYCR7RXh0ZW5zaW9uQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTU30gdW5pbnN0YWxsIHVuaW5zdGFsbGluZ2A7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbnMudW5pbnN0YWxsJywgVW5pbnN0YWxsQWN0aW9uLlVuaW5zdGFsbExhYmVsLCBVbmluc3RhbGxBY3Rpb24uVW5pbnN0YWxsQ2xhc3MsIGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5leHRlbnNpb24uc3RhdGU7XG5cblx0XHRpZiAoc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGluZykge1xuXHRcdFx0dGhpcy5sYWJlbCA9IFVuaW5zdGFsbEFjdGlvbi5Vbmluc3RhbGxpbmdMYWJlbDtcblx0XHRcdHRoaXMuY2xhc3MgPSBVbmluc3RhbGxBY3Rpb24uVW5JbnN0YWxsaW5nQ2xhc3M7XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxhYmVsID0gdGhpcy5leHRlbnNpb24ubG9jYWw/LmlzQXBwbGljYXRpb25TY29wZWQgJiYgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5sZW5ndGggPiAxID8gbG9jYWxpemUoJ3VuaW5zdGFsbEFsbCcsIFwiVW5pbnN0YWxsIChBbGwgUHJvZmlsZXMpXCIpIDogVW5pbnN0YWxsQWN0aW9uLlVuaW5zdGFsbExhYmVsO1xuXHRcdHRoaXMuY2xhc3MgPSBVbmluc3RhbGxBY3Rpb24uVW5pbnN0YWxsQ2xhc3M7XG5cdFx0dGhpcy50b29sdGlwID0gVW5pbnN0YWxsQWN0aW9uLlVuaW5zdGFsbExhYmVsO1xuXG5cdFx0aWYgKHN0YXRlICE9PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQpIHtcblx0XHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5pc0J1aWx0aW4pIHtcblx0XHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGFsZXJ0KGxvY2FsaXplKCd1bmluc3RhbGxFeHRlbnNpb25TdGFydCcsIFwiVW5pbnN0YWxsaW5nIGV4dGVuc2lvbiB7MH0gc3RhcnRlZC5cIiwgdGhpcy5leHRlbnNpb24uZGlzcGxheU5hbWUpKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnVuaW5zdGFsbCh0aGlzLmV4dGVuc2lvbik7XG5cdFx0XHRhbGVydChsb2NhbGl6ZSgndW5pbnN0YWxsRXh0ZW5zaW9uQ29tcGxldGUnLCBcIlBsZWFzZSByZWxvYWQgVmlzdWFsIFN0dWRpbyBDb2RlIHRvIGNvbXBsZXRlIHRoZSB1bmluc3RhbGxhdGlvbiBvZiB0aGUgZXh0ZW5zaW9uIHswfS5cIiwgdGhpcy5leHRlbnNpb24uZGlzcGxheU5hbWUpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHR0aGlzLmRpYWxvZ1NlcnZpY2UuZXJyb3IoZ2V0RXJyb3JNZXNzYWdlKGVycm9yKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBVcGRhdGVBY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVuYWJsZWRDbGFzcyA9IGAke3RoaXMuTEFCRUxfQUNUSU9OX0NMQVNTfSB1cGRhdGVgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBEaXNhYmxlZENsYXNzID0gYCR7dGhpcy5FbmFibGVkQ2xhc3N9IGRpc2FibGVkYDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHVwZGF0ZVRocm90dGxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZXIoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB2ZXJib3NlOiBib29sZWFuLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihgZXh0ZW5zaW9ucy51cGRhdGVgLCBsb2NhbGl6ZSgndXBkYXRlJywgXCJVcGRhdGVcIiksIFVwZGF0ZUFjdGlvbi5EaXNhYmxlZENsYXNzLCBmYWxzZSk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLnVwZGF0ZVRocm90dGxlci5xdWV1ZSgoKSA9PiB0aGlzLmNvbXB1dGVBbmRVcGRhdGVFbmFibGVtZW50KCkpO1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0dGhpcy5sYWJlbCA9IHRoaXMudmVyYm9zZSA/IGxvY2FsaXplKCd1cGRhdGUgdG8nLCBcIlVwZGF0ZSB0byB2ezB9XCIsIHRoaXMuZXh0ZW5zaW9uLmxhdGVzdFZlcnNpb24pIDogbG9jYWxpemUoJ3VwZGF0ZScsIFwiVXBkYXRlXCIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY29tcHV0ZUFuZFVwZGF0ZUVuYWJsZW1lbnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IFVwZGF0ZUFjdGlvbi5EaXNhYmxlZENsYXNzO1xuXG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjYW5JbnN0YWxsID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5jYW5JbnN0YWxsKHRoaXMuZXh0ZW5zaW9uKTtcblx0XHRjb25zdCBpc0luc3RhbGxlZCA9IHRoaXMuZXh0ZW5zaW9uLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQ7XG5cblx0XHR0aGlzLmVuYWJsZWQgPSBjYW5JbnN0YWxsID09PSB0cnVlICYmIGlzSW5zdGFsbGVkICYmIHRoaXMuZXh0ZW5zaW9uLm91dGRhdGVkO1xuXHRcdHRoaXMuY2xhc3MgPSB0aGlzLmVuYWJsZWQgPyBVcGRhdGVBY3Rpb24uRW5hYmxlZENsYXNzIDogVXBkYXRlQWN0aW9uLkRpc2FibGVkQ2xhc3M7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uc2VudCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uuc2hvdWxkUmVxdWlyZUNvbnNlbnRUb1VwZGF0ZSh0aGlzLmV4dGVuc2lvbik7XG5cdFx0aWYgKGNvbnNlbnQpIHtcblx0XHRcdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0PCd1cGRhdGUnIHwgJ3JldmlldycgfCAnY2FuY2VsJz4oe1xuXHRcdFx0XHR0eXBlOiAnd2FybmluZycsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgndXBkYXRlRXh0ZW5zaW9uQ29uc2VudFRpdGxlJywgXCJVcGRhdGUgezB9IEV4dGVuc2lvblwiLCB0aGlzLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSksXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd1cGRhdGVFeHRlbnNpb25Db25zZW50JywgXCJ7MH1cXG5cXG5Xb3VsZCB5b3UgbGlrZSB0byB1cGRhdGUgdGhlIGV4dGVuc2lvbj9cIiwgY29uc2VudCksXG5cdFx0XHRcdGJ1dHRvbnM6IFt7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd1cGRhdGUnLCBcIlVwZGF0ZVwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+ICd1cGRhdGUnXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3JldmlldycsIFwiUmV2aWV3XCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4gJ3Jldmlldydcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY2FuY2VsJywgXCJDYW5jZWxcIiksXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiAnY2FuY2VsJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAocmVzdWx0ID09PSAnY2FuY2VsJykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0ID09PSAncmV2aWV3Jykge1xuXHRcdFx0XHRpZiAodGhpcy5leHRlbnNpb24uaGFzQ2hhbmdlbG9nKCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuKHRoaXMuZXh0ZW5zaW9uLCB7IHRhYjogRXh0ZW5zaW9uRWRpdG9yVGFiLkNoYW5nZWxvZyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5leHRlbnNpb24ucmVwb3NpdG9yeSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLm9wZW5lclNlcnZpY2Uub3Blbih0aGlzLmV4dGVuc2lvbi5yZXBvc2l0b3J5KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuKHRoaXMuZXh0ZW5zaW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBpbnN0YWxsT3B0aW9uczogSW5zdGFsbE9wdGlvbnMgPSB7fTtcblx0XHRpZiAodGhpcy5leHRlbnNpb24ubG9jYWw/LnNvdXJjZSA9PT0gJ3ZzaXgnICYmIHRoaXMuZXh0ZW5zaW9uLmxvY2FsLnBpbm5lZCkge1xuXHRcdFx0aW5zdGFsbE9wdGlvbnMucGlubmVkID0gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5sb2NhbD8ucHJlUmVsZWFzZSkge1xuXHRcdFx0aW5zdGFsbE9wdGlvbnMuaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uID0gdHJ1ZTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGFsZXJ0KGxvY2FsaXplKCd1cGRhdGVFeHRlbnNpb25TdGFydCcsIFwiVXBkYXRpbmcgZXh0ZW5zaW9uIHswfSB0byB2ZXJzaW9uIHsxfSBzdGFydGVkLlwiLCB0aGlzLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSwgdGhpcy5leHRlbnNpb24ubGF0ZXN0VmVyc2lvbikpO1xuXHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pbnN0YWxsKHRoaXMuZXh0ZW5zaW9uLCBpbnN0YWxsT3B0aW9ucyk7XG5cdFx0XHRhbGVydChsb2NhbGl6ZSgndXBkYXRlRXh0ZW5zaW9uQ29tcGxldGUnLCBcIlVwZGF0aW5nIGV4dGVuc2lvbiB7MH0gdG8gdmVyc2lvbiB7MX0gY29tcGxldGVkLlwiLCB0aGlzLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSwgdGhpcy5leHRlbnNpb24ubGF0ZXN0VmVyc2lvbikpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcm9tcHRFeHRlbnNpb25JbnN0YWxsRmFpbHVyZUFjdGlvbiwgdGhpcy5leHRlbnNpb24sIGluc3RhbGxPcHRpb25zLCB0aGlzLmV4dGVuc2lvbi5sYXRlc3RWZXJzaW9uLCBJbnN0YWxsT3BlcmF0aW9uLlVwZGF0ZSwgZXJyKS5ydW4oKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRvZ2dsZUF1dG9VcGRhdGVGb3JFeHRlbnNpb25BY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24udG9nZ2xlQXV0b1VwZGF0ZUZvckV4dGVuc2lvbic7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplMignZW5hYmxlQXV0b1VwZGF0ZUxhYmVsJywgXCJBdXRvIFVwZGF0ZVwiKTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBFbmFibGVkQ2xhc3MgPSBgJHtFeHRlbnNpb25BY3Rpb24uRVhURU5TSU9OX0FDVElPTl9DTEFTU30gYXV0by11cGRhdGVgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBEaXNhYmxlZENsYXNzID0gYCR7dGhpcy5FbmFibGVkQ2xhc3N9IGhpZGVgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlOiBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoVG9nZ2xlQXV0b1VwZGF0ZUZvckV4dGVuc2lvbkFjdGlvbi5JRCwgVG9nZ2xlQXV0b1VwZGF0ZUZvckV4dGVuc2lvbkFjdGlvbi5MQUJFTC52YWx1ZSwgVG9nZ2xlQXV0b1VwZGF0ZUZvckV4dGVuc2lvbkFjdGlvbi5EaXNhYmxlZENsYXNzKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBdXRvVXBkYXRlQ29uZmlndXJhdGlvbktleSkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlQWxsb3dlZEV4dGVuc2lvbnNDb25maWdWYWx1ZShlID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlKCkge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuY2xhc3MgPSBUb2dnbGVBdXRvVXBkYXRlRm9yRXh0ZW5zaW9uQWN0aW9uLkRpc2FibGVkQ2xhc3M7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb24uaXNCdWlsdGluKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8/LmRpc2FsbG93SW5zdGFsbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uLmxvY2FsID8/IHRoaXMuZXh0ZW5zaW9uLmdhbGxlcnk7XG5cdFx0aWYgKGV4dGVuc2lvbiAmJiB0aGlzLmFsbG93ZWRFeHRlbnNpb25zU2VydmljZS5pc0FsbG93ZWQoZXh0ZW5zaW9uKSAhPT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRBdXRvVXBkYXRlVmFsdWUoKSA9PT0gJ29uJyAmJiAhdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWRFbmFibGVtZW50U3RhdGUodGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHRcdHRoaXMuY2xhc3MgPSBUb2dnbGVBdXRvVXBkYXRlRm9yRXh0ZW5zaW9uQWN0aW9uLkVuYWJsZWRDbGFzcztcblx0XHR0aGlzLmNoZWNrZWQgPSB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmlzQXV0b1VwZGF0ZUVuYWJsZWRGb3IodGhpcy5leHRlbnNpb24pO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVuYWJsZUF1dG9VcGRhdGUgPSAhdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pc0F1dG9VcGRhdGVFbmFibGVkRm9yKHRoaXMuZXh0ZW5zaW9uKTtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnVwZGF0ZUF1dG9VcGRhdGVFbmFibGVtZW50Rm9yKHRoaXMuZXh0ZW5zaW9uLCBlbmFibGVBdXRvVXBkYXRlKTtcblxuXHRcdGlmIChlbmFibGVBdXRvVXBkYXRlKSB7XG5cdFx0XHRhbGVydChsb2NhbGl6ZSgnZW5hYmxlQXV0b1VwZGF0ZScsIFwiRW5hYmxlZCBhdXRvIHVwZGF0ZXMgZm9yXCIsIHRoaXMuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFsZXJ0KGxvY2FsaXplKCdkaXNhYmxlQXV0b1VwZGF0ZScsIFwiRGlzYWJsZWQgYXV0byB1cGRhdGVzIGZvclwiLCB0aGlzLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSkpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVG9nZ2xlQXV0b1VwZGF0ZXNGb3JQdWJsaXNoZXJBY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24udG9nZ2xlQXV0b1VwZGF0ZXNGb3JQdWJsaXNoZXInO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgndG9nZ2xlQXV0b1VwZGF0ZXNGb3JQdWJsaXNoZXJMYWJlbCcsIFwiQXV0byBVcGRhdGUgQWxsIChGcm9tIFB1Ymxpc2hlcilcIik7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoVG9nZ2xlQXV0b1VwZGF0ZXNGb3JQdWJsaXNoZXJBY3Rpb24uSUQsIFRvZ2dsZUF1dG9VcGRhdGVzRm9yUHVibGlzaGVyQWN0aW9uLkxBQkVMKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZSgpIHsgfVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YWxlcnQobG9jYWxpemUoJ2lnbm9yZUV4dGVuc2lvblVwZGF0ZVB1Ymxpc2hlcicsIFwiSWdub3JpbmcgdXBkYXRlcyBwdWJsaXNoZWQgYnkgezB9LlwiLCB0aGlzLmV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZSkpO1xuXHRcdGNvbnN0IGVuYWJsZUF1dG9VcGRhdGUgPSAhdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pc0F1dG9VcGRhdGVFbmFibGVkRm9yKHRoaXMuZXh0ZW5zaW9uLnB1Ymxpc2hlcik7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS51cGRhdGVBdXRvVXBkYXRlRW5hYmxlbWVudEZvcih0aGlzLmV4dGVuc2lvbi5wdWJsaXNoZXIsIGVuYWJsZUF1dG9VcGRhdGUpO1xuXHRcdGlmIChlbmFibGVBdXRvVXBkYXRlKSB7XG5cdFx0XHRhbGVydChsb2NhbGl6ZSgnZW5hYmxlQXV0b1VwZGF0ZScsIFwiRW5hYmxlZCBhdXRvIHVwZGF0ZXMgZm9yXCIsIHRoaXMuZXh0ZW5zaW9uLmRpc3BsYXlOYW1lKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFsZXJ0KGxvY2FsaXplKCdkaXNhYmxlQXV0b1VwZGF0ZScsIFwiRGlzYWJsZWQgYXV0byB1cGRhdGVzIGZvclwiLCB0aGlzLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSkpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgTWlncmF0ZURlcHJlY2F0ZWRFeHRlbnNpb25BY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVuYWJsZWRDbGFzcyA9IGAke0V4dGVuc2lvbkFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1N9IG1pZ3JhdGVgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBEaXNhYmxlZENsYXNzID0gYCR7dGhpcy5FbmFibGVkQ2xhc3N9IGRpc2FibGVkYDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNtYWxsOiBib29sZWFuLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zQWN0aW9uLm1pZ3JhdGVEZXByZWNhdGVkRXh0ZW5zaW9uJywgbG9jYWxpemUoJ21pZ3JhdGVFeHRlbnNpb24nLCBcIk1pZ3JhdGVcIiksIE1pZ3JhdGVEZXByZWNhdGVkRXh0ZW5zaW9uQWN0aW9uLkRpc2FibGVkQ2xhc3MsIGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuY2xhc3MgPSBNaWdyYXRlRGVwcmVjYXRlZEV4dGVuc2lvbkFjdGlvbi5EaXNhYmxlZENsYXNzO1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24/LmxvY2FsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5zdGF0ZSAhPT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICghdGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvPy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaWQgPSB0aGlzLmV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8uZXh0ZW5zaW9uLmlkO1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmxvY2FsLnNvbWUoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHsgaWQgfSkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0dGhpcy5jbGFzcyA9IE1pZ3JhdGVEZXByZWNhdGVkRXh0ZW5zaW9uQWN0aW9uLkVuYWJsZWRDbGFzcztcblx0XHR0aGlzLnRvb2x0aXAgPSBsb2NhbGl6ZSgnbWlncmF0ZSB0bycsIFwiTWlncmF0ZSB0byB7MH1cIiwgdGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSk7XG5cdFx0dGhpcy5sYWJlbCA9IHRoaXMuc21hbGwgPyBsb2NhbGl6ZSgnbWlncmF0ZScsIFwiTWlncmF0ZVwiKSA6IHRoaXMudG9vbHRpcDtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24/LmRlcHJlY2F0aW9uSW5mbz8uZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGxvY2FsID0gdGhpcy5leHRlbnNpb24ubG9jYWw7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS51bmluc3RhbGwodGhpcy5leHRlbnNpb24pO1xuXHRcdGNvbnN0IFtleHRlbnNpb25dID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25zKFt7IGlkOiB0aGlzLmV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8uZXh0ZW5zaW9uLmlkLCBwcmVSZWxlYXNlOiB0aGlzLmV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8/LmV4dGVuc2lvbj8ucHJlUmVsZWFzZSB9XSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pbnN0YWxsKGV4dGVuc2lvbiwgeyBpc01hY2hpbmVTY29wZWQ6IGxvY2FsPy5pc01hY2hpbmVTY29wZWQgfSk7XG5cdH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uIGV4dGVuZHMgRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogc3RyaW5nLFxuXHRcdGxhYmVsOiBzdHJpbmcsXG5cdFx0Y3NzQ2xhc3M6IHN0cmluZyxcblx0XHRlbmFibGVkOiBib29sZWFuLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJvdGVjdGVkIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoaWQsIGxhYmVsLCBjc3NDbGFzcywgZW5hYmxlZCk7XG5cdH1cblxuXHRwcml2YXRlIF9hY3Rpb25WaWV3SXRlbTogRHJvcERvd25FeHRlbnNpb25BY3Rpb25WaWV3SXRlbSB8IG51bGwgPSBudWxsO1xuXHRjcmVhdGVBY3Rpb25WaWV3SXRlbShvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKTogRHJvcERvd25FeHRlbnNpb25BY3Rpb25WaWV3SXRlbSB7XG5cdFx0dGhpcy5fYWN0aW9uVmlld0l0ZW0gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uVmlld0l0ZW0sIHRoaXMsIG9wdGlvbnMpO1xuXHRcdHJldHVybiB0aGlzLl9hY3Rpb25WaWV3SXRlbTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBydW4oYWN0aW9uR3JvdXBzOiBJQWN0aW9uW11bXSk6IFByb21pc2U8YW55PiB7XG5cdFx0dGhpcy5fYWN0aW9uVmlld0l0ZW0/LnNob3dNZW51KGFjdGlvbkdyb3Vwcyk7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEcm9wRG93bkV4dGVuc2lvbkFjdGlvblZpZXdJdGVtIGV4dGVuZHMgQWN0aW9uVmlld0l0ZW0ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKG51bGwsIGFjdGlvbiwgeyAuLi5vcHRpb25zLCBpY29uOiB0cnVlLCBsYWJlbDogdHJ1ZSB9KTtcblx0fVxuXG5cdHB1YmxpYyBzaG93TWVudShtZW51QWN0aW9uR3JvdXBzOiBJQWN0aW9uW11bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSB0aGlzLmdldEFjdGlvbnMobWVudUFjdGlvbkdyb3Vwcyk7XG5cdFx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0XHQuLi5nZXRXb3JrYmVuY2hNZW51TW90aW9uQ29udGV4dE1lbnVPcHRpb25zKHRoaXMuZWxlbWVudCksXG5cdFx0XHRcdGdldEFjdGlvbnM6ICgpID0+IGFjdGlvbnMsXG5cdFx0XHRcdGFjdGlvblJ1bm5lcjogdGhpcy5hY3Rpb25SdW5uZXIsXG5cdFx0XHRcdG9uSGlkZTogKCkgPT4gZGlzcG9zZUlmRGlzcG9zYWJsZShhY3Rpb25zKVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3Rpb25zKG1lbnVBY3Rpb25Hcm91cHM6IElBY3Rpb25bXVtdKTogSUFjdGlvbltdIHtcblx0XHRsZXQgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0Zm9yIChjb25zdCBtZW51QWN0aW9ucyBvZiBtZW51QWN0aW9uR3JvdXBzKSB7XG5cdFx0XHRhY3Rpb25zID0gWy4uLmFjdGlvbnMsIC4uLm1lbnVBY3Rpb25zLCBuZXcgU2VwYXJhdG9yKCldO1xuXHRcdH1cblx0XHRyZXR1cm4gYWN0aW9ucy5sZW5ndGggPyBhY3Rpb25zLnNsaWNlKDAsIGFjdGlvbnMubGVuZ3RoIC0gMSkgOiBhY3Rpb25zO1xuXHR9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldENvbnRleHRNZW51QWN0aW9uc0dyb3VwcyhleHRlbnNpb246IElFeHRlbnNpb24gfCB1bmRlZmluZWQgfCBudWxsLCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogUHJvbWlzZTxbc3RyaW5nLCBBcnJheTxNZW51SXRlbUFjdGlvbiB8IFN1Ym1lbnVJdGVtQWN0aW9uPl1bXT4ge1xuXHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYXN5bmMgYWNjZXNzb3IgPT4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBtZW51U2VydmljZSA9IGFjY2Vzc29yLmdldChJTWVudVNlcnZpY2UpO1xuXHRcdGNvbnN0IGV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25JZ25vcmVkUmVjb21tZW5kYXRpb25zU2VydmljZSk7XG5cdFx0Y29uc3Qgd29ya2JlbmNoVGhlbWVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hUaGVtZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBdXRoZW50aWNhdGlvblVzYWdlU2VydmljZSk7XG5cdFx0Y29uc3QgYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGNrc092ZXJsYXk6IFtzdHJpbmcsIGFueV1bXSA9IFtdO1xuXG5cdFx0aWYgKGV4dGVuc2lvbikge1xuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnZXh0ZW5zaW9uJywgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWRdKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2lzQnVpbHRpbkV4dGVuc2lvbicsIGV4dGVuc2lvbi5pc0J1aWx0aW5dKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2lzRGVmYXVsdEFwcGxpY2F0aW9uU2NvcGVkRXh0ZW5zaW9uJywgZXh0ZW5zaW9uLmxvY2FsICYmIGlzQXBwbGljYXRpb25TY29wZWRFeHRlbnNpb24oZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0KV0pO1xuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnaXNBcHBsaWNhdGlvblNjb3BlZEV4dGVuc2lvbicsIGV4dGVuc2lvbi5sb2NhbCAmJiBleHRlbnNpb24ubG9jYWwuaXNBcHBsaWNhdGlvblNjb3BlZF0pO1xuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnaXNXb3Jrc3BhY2VTY29wZWRFeHRlbnNpb24nLCBleHRlbnNpb24uaXNXb3Jrc3BhY2VTY29wZWRdKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2lzR2FsbGVyeUV4dGVuc2lvbicsICEhZXh0ZW5zaW9uLmlkZW50aWZpZXIudXVpZF0pO1xuXHRcdFx0aWYgKGV4dGVuc2lvbi5sb2NhbCkge1xuXHRcdFx0XHRja3NPdmVybGF5LnB1c2goWydleHRlbnNpb25Tb3VyY2UnLCBleHRlbnNpb24ubG9jYWwuc291cmNlXSk7XG5cdFx0XHR9XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydleHRlbnNpb25IYXNDb25maWd1cmF0aW9uJywgZXh0ZW5zaW9uLmxvY2FsICYmICEhZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0LmNvbnRyaWJ1dGVzICYmICEhZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0LmNvbnRyaWJ1dGVzLmNvbmZpZ3VyYXRpb25dKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2V4dGVuc2lvbkhhc0tleWJpbmRpbmdzJywgZXh0ZW5zaW9uLmxvY2FsICYmICEhZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0LmNvbnRyaWJ1dGVzICYmICEhZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0LmNvbnRyaWJ1dGVzLmtleWJpbmRpbmdzXSk7XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydleHRlbnNpb25IYXNDb21tYW5kcycsIGV4dGVuc2lvbi5sb2NhbCAmJiAhIWV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdC5jb250cmlidXRlcyAmJiAhIWV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdC5jb250cmlidXRlcz8uY29tbWFuZHNdKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2lzRXh0ZW5zaW9uUmVjb21tZW5kZWQnLCAhIWV4dGVuc2lvblJlY29tbWVuZGF0aW9uc1NlcnZpY2UuZ2V0QWxsUmVjb21tZW5kYXRpb25zV2l0aFJlYXNvbigpW2V4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCldXSk7XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydpc0V4dGVuc2lvbldvcmtzcGFjZVJlY29tbWVuZGVkJywgZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zU2VydmljZS5nZXRBbGxSZWNvbW1lbmRhdGlvbnNXaXRoUmVhc29uKClbZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQudG9Mb3dlckNhc2UoKV0/LnJlYXNvbklkID09PSBFeHRlbnNpb25SZWNvbW1lbmRhdGlvblJlYXNvbi5Xb3Jrc3BhY2VdKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2lzVXNlcklnbm9yZWRSZWNvbW1lbmRhdGlvbicsIGV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLmdsb2JhbElnbm9yZWRSZWNvbW1lbmRhdGlvbnMuc29tZShlID0+IGUgPT09IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpXSk7XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydpc0V4dGVuc2lvblBpbm5lZCcsIGV4dGVuc2lvbi5waW5uZWRdKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2lzRXh0ZW5zaW9uRW5hYmxlZCcsIGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZEVuYWJsZW1lbnRTdGF0ZShleHRlbnNpb24uZW5hYmxlbWVudFN0YXRlKV0pO1xuXHRcdFx0c3dpdGNoIChleHRlbnNpb24uc3RhdGUpIHtcblx0XHRcdFx0Y2FzZSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsaW5nOlxuXHRcdFx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2V4dGVuc2lvblN0YXR1cycsICdpbnN0YWxsaW5nJ10pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZDpcblx0XHRcdFx0XHRja3NPdmVybGF5LnB1c2goWydleHRlbnNpb25TdGF0dXMnLCAnaW5zdGFsbGVkJ10pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGluZzpcblx0XHRcdFx0XHRja3NPdmVybGF5LnB1c2goWydleHRlbnNpb25TdGF0dXMnLCAndW5pbnN0YWxsaW5nJ10pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGVkOlxuXHRcdFx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2V4dGVuc2lvblN0YXR1cycsICd1bmluc3RhbGxlZCddKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2luc3RhbGxlZEV4dGVuc2lvbklzUHJlUmVsZWFzZVZlcnNpb24nLCAhIWV4dGVuc2lvbi5sb2NhbD8uaXNQcmVSZWxlYXNlVmVyc2lvbl0pO1xuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnaW5zdGFsbGVkRXh0ZW5zaW9uSXNPcHRlZFRvUHJlUmVsZWFzZScsICEhZXh0ZW5zaW9uLmxvY2FsPy5wcmVSZWxlYXNlXSk7XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydnYWxsZXJ5RXh0ZW5zaW9uSXNQcmVSZWxlYXNlVmVyc2lvbicsICEhZXh0ZW5zaW9uLmdhbGxlcnk/LnByb3BlcnRpZXMuaXNQcmVSZWxlYXNlVmVyc2lvbl0pO1xuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnZ2FsbGVyeUV4dGVuc2lvbkhhc1ByZVJlbGVhc2VWZXJzaW9uJywgZXh0ZW5zaW9uLmdhbGxlcnk/Lmhhc1ByZVJlbGVhc2VWZXJzaW9uXSk7XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydleHRlbnNpb25IYXNQcmVSZWxlYXNlVmVyc2lvbicsIGV4dGVuc2lvbi5oYXNQcmVSZWxlYXNlVmVyc2lvbl0pO1xuXHRcdFx0Y2tzT3ZlcmxheS5wdXNoKFsnZXh0ZW5zaW9uSGFzUmVsZWFzZVZlcnNpb24nLCBleHRlbnNpb24uaGFzUmVsZWFzZVZlcnNpb25dKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2V4dGVuc2lvbkRpc2FsbG93SW5zdGFsbCcsIGV4dGVuc2lvbi5pc01hbGljaW91cyB8fCBleHRlbnNpb24uZGVwcmVjYXRpb25JbmZvPy5kaXNhbGxvd0luc3RhbGxdKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2lzRXh0ZW5zaW9uQWxsb3dlZCcsIGFsbG93ZWRFeHRlbnNpb25zU2VydmljZS5pc0FsbG93ZWQoeyBpZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHB1Ymxpc2hlckRpc3BsYXlOYW1lOiBleHRlbnNpb24ucHVibGlzaGVyRGlzcGxheU5hbWUgfSkgPT09IHRydWVdKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2lzUHJlUmVsZWFzZUV4dGVuc2lvbkFsbG93ZWQnLCBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UuaXNBbGxvd2VkKHsgaWQ6IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBwdWJsaXNoZXJEaXNwbGF5TmFtZTogZXh0ZW5zaW9uLnB1Ymxpc2hlckRpc3BsYXlOYW1lLCBwcmVyZWxlYXNlOiB0cnVlIH0pID09PSB0cnVlXSk7XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydleHRlbnNpb25Jc1Vuc2lnbmVkJywgZXh0ZW5zaW9uLmdhbGxlcnkgJiYgIWV4dGVuc2lvbi5nYWxsZXJ5LmlzU2lnbmVkXSk7XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydleHRlbnNpb25Jc1ByaXZhdGUnLCBleHRlbnNpb24uZ2FsbGVyeT8ucHJpdmF0ZV0pO1xuXG5cdFx0XHRjb25zdCBbY29sb3JUaGVtZXMsIGZpbGVJY29uVGhlbWVzLCBwcm9kdWN0SWNvblRoZW1lcywgZXh0ZW5zaW9uVXNlc0F1dGhdID0gYXdhaXQgUHJvbWlzZS5hbGwoW3dvcmtiZW5jaFRoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lcygpLCB3b3JrYmVuY2hUaGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZXMoKSwgd29ya2JlbmNoVGhlbWVTZXJ2aWNlLmdldFByb2R1Y3RJY29uVGhlbWVzKCksIGF1dGhlbnRpY2F0aW9uVXNhZ2VTZXJ2aWNlLmV4dGVuc2lvblVzZXNBdXRoKGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpXSk7XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydleHRlbnNpb25IYXNDb2xvclRoZW1lcycsIGNvbG9yVGhlbWVzLnNvbWUodGhlbWUgPT4gaXNUaGVtZUZyb21FeHRlbnNpb24odGhlbWUsIGV4dGVuc2lvbikpXSk7XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydleHRlbnNpb25IYXNGaWxlSWNvblRoZW1lcycsIGZpbGVJY29uVGhlbWVzLnNvbWUodGhlbWUgPT4gaXNUaGVtZUZyb21FeHRlbnNpb24odGhlbWUsIGV4dGVuc2lvbikpXSk7XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydleHRlbnNpb25IYXNQcm9kdWN0SWNvblRoZW1lcycsIHByb2R1Y3RJY29uVGhlbWVzLnNvbWUodGhlbWUgPT4gaXNUaGVtZUZyb21FeHRlbnNpb24odGhlbWUsIGV4dGVuc2lvbikpXSk7XG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydleHRlbnNpb25IYXNBY2NvdW50UHJlZmVyZW5jZXMnLCBleHRlbnNpb25Vc2VzQXV0aF0pO1xuXG5cdFx0XHRja3NPdmVybGF5LnB1c2goWydjYW5TZXRMYW5ndWFnZScsIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmNhblNldExhbmd1YWdlKGV4dGVuc2lvbildKTtcblx0XHRcdGNrc092ZXJsYXkucHVzaChbJ2lzQWN0aXZlTGFuZ3VhZ2VQYWNrRXh0ZW5zaW9uJywgZXh0ZW5zaW9uLmdhbGxlcnkgJiYgbGFuZ3VhZ2UgPT09IGdldExvY2FsZShleHRlbnNpb24uZ2FsbGVyeSldKTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3Rpb25zR3JvdXBzID0gbWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLkV4dGVuc2lvbkNvbnRleHQsIGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZU92ZXJsYXkoY2tzT3ZlcmxheSksIHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfSk7XG5cdFx0cmV0dXJuIGFjdGlvbnNHcm91cHM7XG5cdH0pO1xufVxuXG5mdW5jdGlvbiB0b0FjdGlvbnMoYWN0aW9uc0dyb3VwczogW3N0cmluZywgQXJyYXk8TWVudUl0ZW1BY3Rpb24gfCBTdWJtZW51SXRlbUFjdGlvbj5dW10sIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBJQWN0aW9uW11bXSB7XG5cdGNvbnN0IHJlc3VsdDogSUFjdGlvbltdW10gPSBbXTtcblx0Zm9yIChjb25zdCBbLCBhY3Rpb25zXSBvZiBhY3Rpb25zR3JvdXBzKSB7XG5cdFx0cmVzdWx0LnB1c2goYWN0aW9ucy5tYXAoYWN0aW9uID0+IHtcblx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBTdWJtZW51QWN0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBhY3Rpb247XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudUl0ZW1FeHRlbnNpb25BY3Rpb24sIGFjdGlvbik7XG5cdFx0fSkpO1xuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldENvbnRleHRNZW51QWN0aW9ucyhleHRlbnNpb246IElFeHRlbnNpb24gfCB1bmRlZmluZWQgfCBudWxsLCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogUHJvbWlzZTxJQWN0aW9uW11bXT4ge1xuXHRjb25zdCBhY3Rpb25zR3JvdXBzID0gYXdhaXQgZ2V0Q29udGV4dE1lbnVBY3Rpb25zR3JvdXBzKGV4dGVuc2lvbiwgY29udGV4dEtleVNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0cmV0dXJuIHRvQWN0aW9ucyhhY3Rpb25zR3JvdXBzLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG59XG5cbmV4cG9ydCBjbGFzcyBNYW5hZ2VFeHRlbnNpb25BY3Rpb24gZXh0ZW5kcyBEcm9wRG93bkV4dGVuc2lvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2V4dGVuc2lvbnMubWFuYWdlJztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBDbGFzcyA9IGAke0V4dGVuc2lvbkFjdGlvbi5JQ09OX0FDVElPTl9DTEFTU30gbWFuYWdlIGAgKyBUaGVtZUljb24uYXNDbGFzc05hbWUobWFuYWdlRXh0ZW5zaW9uSWNvbik7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEhpZGVNYW5hZ2VFeHRlbnNpb25DbGFzcyA9IGAke3RoaXMuQ2xhc3N9IGhpZGVgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cblx0XHRzdXBlcihNYW5hZ2VFeHRlbnNpb25BY3Rpb24uSUQsICcnLCAnJywgdHJ1ZSwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy50b29sdGlwID0gbG9jYWxpemUoJ21hbmFnZScsIFwiTWFuYWdlXCIpO1xuXG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdGFzeW5jIGdldEFjdGlvbkdyb3VwcygpOiBQcm9taXNlPElBY3Rpb25bXVtdPiB7XG5cdFx0Y29uc3QgZ3JvdXBzOiBJQWN0aW9uW11bXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRleHRNZW51QWN0aW9uc0dyb3VwcyA9IGF3YWl0IGdldENvbnRleHRNZW51QWN0aW9uc0dyb3Vwcyh0aGlzLmV4dGVuc2lvbiwgdGhpcy5jb250ZXh0S2V5U2VydmljZSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgdGhlbWVBY3Rpb25zOiBJQWN0aW9uW10gPSBbXSwgaW5zdGFsbEFjdGlvbnM6IElBY3Rpb25bXSA9IFtdLCB1cGRhdGVBY3Rpb25zOiBJQWN0aW9uW10gPSBbXSwgb3RoZXJBY3Rpb25Hcm91cHM6IElBY3Rpb25bXVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbZ3JvdXAsIGFjdGlvbnNdIG9mIGNvbnRleHRNZW51QWN0aW9uc0dyb3Vwcykge1xuXHRcdFx0aWYgKGdyb3VwID09PSBJTlNUQUxMX0FDVElPTlNfR1JPVVApIHtcblx0XHRcdFx0aW5zdGFsbEFjdGlvbnMucHVzaCguLi50b0FjdGlvbnMoW1tncm91cCwgYWN0aW9uc11dLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKVswXSk7XG5cdFx0XHR9IGVsc2UgaWYgKGdyb3VwID09PSBVUERBVEVfQUNUSU9OU19HUk9VUCkge1xuXHRcdFx0XHR1cGRhdGVBY3Rpb25zLnB1c2goLi4udG9BY3Rpb25zKFtbZ3JvdXAsIGFjdGlvbnNdXSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSlbMF0pO1xuXHRcdFx0fSBlbHNlIGlmIChncm91cCA9PT0gVEhFTUVfQUNUSU9OU19HUk9VUCkge1xuXHRcdFx0XHR0aGVtZUFjdGlvbnMucHVzaCguLi50b0FjdGlvbnMoW1tncm91cCwgYWN0aW9uc11dLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKVswXSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRvdGhlckFjdGlvbkdyb3Vwcy5wdXNoKC4uLnRvQWN0aW9ucyhbW2dyb3VwLCBhY3Rpb25zXV0sIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhlbWVBY3Rpb25zLmxlbmd0aCkge1xuXHRcdFx0Z3JvdXBzLnB1c2godGhlbWVBY3Rpb25zKTtcblx0XHR9XG5cblx0XHRjb25zdCBpc0NoYXRFeHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbiAmJiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyh0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQ/LmNoYXRFeHRlbnNpb25JZCk7XG5cdFx0aWYgKGlzQ2hhdEV4dGVuc2lvbikge1xuXHRcdFx0Z3JvdXBzLnB1c2goW1xuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVuYWJsZUFJRmVhdHVyZXNHbG9iYWxseUFjdGlvbiksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW5hYmxlQUlGZWF0dXJlc0luV29ya3NwYWNlQWN0aW9uKVxuXHRcdFx0XSk7XG5cdFx0XHRncm91cHMucHVzaChbXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlzYWJsZUFJRmVhdHVyZXNHbG9iYWxseUFjdGlvbiksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlzYWJsZUFJRmVhdHVyZXNJbldvcmtzcGFjZUFjdGlvbilcblx0XHRcdF0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRncm91cHMucHVzaChbXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW5hYmxlR2xvYmFsbHlBY3Rpb24pLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEVuYWJsZUZvcldvcmtzcGFjZUFjdGlvbilcblx0XHRcdF0pO1xuXHRcdFx0Z3JvdXBzLnB1c2goW1xuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpc2FibGVHbG9iYWxseUFjdGlvbiksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlzYWJsZUZvcldvcmtzcGFjZUFjdGlvbilcblx0XHRcdF0pO1xuXHRcdH1cblx0XHRpZiAodXBkYXRlQWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdGdyb3Vwcy5wdXNoKHVwZGF0ZUFjdGlvbnMpO1xuXHRcdH1cblx0XHRncm91cHMucHVzaChbXG5cdFx0XHQuLi4oaW5zdGFsbEFjdGlvbnMubGVuZ3RoID8gaW5zdGFsbEFjdGlvbnMgOiBbXSksXG5cdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxBbm90aGVyVmVyc2lvbkFjdGlvbiwgdGhpcy5leHRlbnNpb24sIGZhbHNlKSxcblx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVW5pbnN0YWxsQWN0aW9uKSxcblx0XHRdKTtcblxuXHRcdG90aGVyQWN0aW9uR3JvdXBzLmZvckVhY2goYWN0aW9ucyA9PiBncm91cHMucHVzaChhY3Rpb25zKSk7XG5cblx0XHRncm91cHMuZm9yRWFjaChncm91cCA9PiBncm91cC5mb3JFYWNoKGV4dGVuc2lvbkFjdGlvbiA9PiB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uQWN0aW9uIGluc3RhbmNlb2YgRXh0ZW5zaW9uQWN0aW9uKSB7XG5cdFx0XHRcdGV4dGVuc2lvbkFjdGlvbi5leHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbjtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRyZXR1cm4gZ3JvdXBzO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLndoZW5JbnN0YWxsZWRFeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXHRcdHJldHVybiBzdXBlci5ydW4oYXdhaXQgdGhpcy5nZXRBY3Rpb25Hcm91cHMoKSk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5jbGFzcyA9IE1hbmFnZUV4dGVuc2lvbkFjdGlvbi5IaWRlTWFuYWdlRXh0ZW5zaW9uQ2xhc3M7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuZXh0ZW5zaW9uLnN0YXRlO1xuXHRcdFx0dGhpcy5lbmFibGVkID0gc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZDtcblx0XHRcdHRoaXMuY2xhc3MgPSB0aGlzLmVuYWJsZWQgfHwgc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGluZyA/IE1hbmFnZUV4dGVuc2lvbkFjdGlvbi5DbGFzcyA6IE1hbmFnZUV4dGVuc2lvbkFjdGlvbi5IaWRlTWFuYWdlRXh0ZW5zaW9uQ2xhc3M7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25FZGl0b3JNYW5hZ2VFeHRlbnNpb25BY3Rpb24gZXh0ZW5kcyBEcm9wRG93bkV4dGVuc2lvbkFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbkVkaXRvci5tYW5hZ2VFeHRlbnNpb24nLCAnJywgYCR7RXh0ZW5zaW9uQWN0aW9uLklDT05fQUNUSU9OX0NMQVNTfSBtYW5hZ2UgJHtUaGVtZUljb24uYXNDbGFzc05hbWUobWFuYWdlRXh0ZW5zaW9uSWNvbil9YCwgdHJ1ZSwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMudG9vbHRpcCA9IGxvY2FsaXplKCdtYW5hZ2UnLCBcIk1hbmFnZVwiKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHsgfVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdGNvbnN0IGFjdGlvbkdyb3VwczogSUFjdGlvbltdW10gPSBbXTtcblx0XHQoYXdhaXQgZ2V0Q29udGV4dE1lbnVBY3Rpb25zKHRoaXMuZXh0ZW5zaW9uLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlKSkuZm9yRWFjaChhY3Rpb25zID0+IGFjdGlvbkdyb3Vwcy5wdXNoKGFjdGlvbnMpKTtcblx0XHRhY3Rpb25Hcm91cHMuZm9yRWFjaChncm91cCA9PiBncm91cC5mb3JFYWNoKGV4dGVuc2lvbkFjdGlvbiA9PiB7XG5cdFx0XHRpZiAoZXh0ZW5zaW9uQWN0aW9uIGluc3RhbmNlb2YgRXh0ZW5zaW9uQWN0aW9uKSB7XG5cdFx0XHRcdGV4dGVuc2lvbkFjdGlvbi5leHRlbnNpb24gPSB0aGlzLmV4dGVuc2lvbjtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0cmV0dXJuIHN1cGVyLnJ1bihhY3Rpb25Hcm91cHMpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIE1lbnVJdGVtRXh0ZW5zaW9uQWN0aW9uIGV4dGVuZHMgRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGFjdGlvbjogSUFjdGlvbixcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoYWN0aW9uLmlkLCBhY3Rpb24ubGFiZWwpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuYWN0aW9uLmVuYWJsZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBzZXQgZW5hYmxlZCh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuYWN0aW9uLmVuYWJsZWQgPSB2YWx1ZTtcblx0fVxuXG5cdHVwZGF0ZSgpIHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmFjdGlvbi5pZCA9PT0gVE9HR0xFX0lHTk9SRV9FWFRFTlNJT05fQUNUSU9OX0lEKSB7XG5cdFx0XHR0aGlzLmNoZWNrZWQgPSAhdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5pc0V4dGVuc2lvbklnbm9yZWRUb1N5bmModGhpcy5leHRlbnNpb24pO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5hY3Rpb24uaWQgPT09IFRvZ2dsZUF1dG9VcGRhdGVGb3JFeHRlbnNpb25BY3Rpb24uSUQpIHtcblx0XHRcdHRoaXMuY2hlY2tlZCA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaXNBdXRvVXBkYXRlRW5hYmxlZEZvcih0aGlzLmV4dGVuc2lvbik7XG5cdFx0fSBlbHNlIGlmICh0aGlzLmFjdGlvbi5pZCA9PT0gVG9nZ2xlQXV0b1VwZGF0ZXNGb3JQdWJsaXNoZXJBY3Rpb24uSUQpIHtcblx0XHRcdHRoaXMuY2hlY2tlZCA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaXNBdXRvVXBkYXRlRW5hYmxlZEZvcih0aGlzLmV4dGVuc2lvbi5wdWJsaXNoZXIpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmNoZWNrZWQgPSB0aGlzLmFjdGlvbi5jaGVja2VkO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5leHRlbnNpb24pIHtcblx0XHRcdGNvbnN0IGlkID0gdGhpcy5leHRlbnNpb24ubG9jYWwgPyBnZXRFeHRlbnNpb25JZCh0aGlzLmV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdC5wdWJsaXNoZXIsIHRoaXMuZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0Lm5hbWUpXG5cdFx0XHRcdDogdGhpcy5leHRlbnNpb24uZ2FsbGVyeSA/IGdldEV4dGVuc2lvbklkKHRoaXMuZXh0ZW5zaW9uLmdhbGxlcnkucHVibGlzaGVyLCB0aGlzLmV4dGVuc2lvbi5nYWxsZXJ5Lm5hbWUpXG5cdFx0XHRcdFx0OiB0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uQXJnOiBJRXh0ZW5zaW9uQXJnID0ge1xuXHRcdFx0XHRpZDogdGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCxcblx0XHRcdFx0dmVyc2lvbjogdGhpcy5leHRlbnNpb24udmVyc2lvbixcblx0XHRcdFx0bG9jYXRpb246IHRoaXMuZXh0ZW5zaW9uLmxvY2FsPy5sb2NhdGlvbixcblx0XHRcdFx0Z2FsbGVyeUxpbms6IHRoaXMuZXh0ZW5zaW9uLnVybFxuXHRcdFx0fTtcblx0XHRcdGF3YWl0IHRoaXMuYWN0aW9uLnJ1bihpZCwgZXh0ZW5zaW9uQXJnKTtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRvZ2dsZVByZVJlbGVhc2VFeHRlbnNpb25BY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24udG9nZ2xlUHJlUmxlYXNlJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ3RvZ2dsZVByZVJsZWFzZUxhYmVsJywgXCJQcmUtUmVsZWFzZVwiKTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBFbmFibGVkQ2xhc3MgPSBgJHtFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTfSBwcm9taW5lbnQgcHJlLXJlbGVhc2VgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBEaXNhYmxlZENsYXNzID0gYCR7dGhpcy5FbmFibGVkQ2xhc3N9IGhpZGVgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlOiBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihUb2dnbGVQcmVSZWxlYXNlRXh0ZW5zaW9uQWN0aW9uLklELCBUb2dnbGVQcmVSZWxlYXNlRXh0ZW5zaW9uQWN0aW9uLkxBQkVMLCBUb2dnbGVQcmVSZWxlYXNlRXh0ZW5zaW9uQWN0aW9uLkRpc2FibGVkQ2xhc3MpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFsbG93ZWRFeHRlbnNpb25zU2VydmljZS5vbkRpZENoYW5nZUFsbG93ZWRFeHRlbnNpb25zQ29uZmlnVmFsdWUoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGUoKSB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0dGhpcy5jbGFzcyA9IFRvZ2dsZVByZVJlbGVhc2VFeHRlbnNpb25BY3Rpb24uRGlzYWJsZWRDbGFzcztcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5pc0J1aWx0aW4pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnN0YXRlICE9PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbi5oYXNQcmVSZWxlYXNlVmVyc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uLmdhbGxlcnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnByZVJlbGVhc2UpIHtcblx0XHRcdGlmICghdGhpcy5leHRlbnNpb24uaXNQcmVSZWxlYXNlVmVyc2lvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAodGhpcy5hbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UuaXNBbGxvd2VkKHsgaWQ6IHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHB1Ymxpc2hlckRpc3BsYXlOYW1lOiB0aGlzLmV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZSB9KSAhPT0gdHJ1ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICghdGhpcy5leHRlbnNpb24ucHJlUmVsZWFzZSkge1xuXHRcdFx0aWYgKCF0aGlzLmV4dGVuc2lvbi5nYWxsZXJ5Lmhhc1ByZVJlbGVhc2VWZXJzaW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmFsbG93ZWRFeHRlbnNpb25zU2VydmljZS5pc0FsbG93ZWQodGhpcy5leHRlbnNpb24uZ2FsbGVyeSkgIT09IHRydWUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHRcdHRoaXMuY2xhc3MgPSBUb2dnbGVQcmVSZWxlYXNlRXh0ZW5zaW9uQWN0aW9uLkVuYWJsZWRDbGFzcztcblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5wcmVSZWxlYXNlKSB7XG5cdFx0XHR0aGlzLmxhYmVsID0gbG9jYWxpemUoJ3RvZ2dsZVByZVJsZWFzZURpc2FibGVMYWJlbCcsIFwiU3dpdGNoIHRvIFJlbGVhc2UgVmVyc2lvblwiKTtcblx0XHRcdHRoaXMudG9vbHRpcCA9IGxvY2FsaXplKCd0b2dnbGVQcmVSbGVhc2VEaXNhYmxlVG9vbHRpcCcsIFwiVGhpcyB3aWxsIHN3aXRjaCBhbmQgZW5hYmxlIHVwZGF0ZXMgdG8gcmVsZWFzZSB2ZXJzaW9uc1wiKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5sYWJlbCA9IGxvY2FsaXplKCdzd2l0Y2hUb1ByZVJlbGVhc2VMYWJlbCcsIFwiU3dpdGNoIHRvIFByZS1SZWxlYXNlIFZlcnNpb25cIik7XG5cdFx0XHR0aGlzLnRvb2x0aXAgPSBsb2NhbGl6ZSgnc3dpdGNoVG9QcmVSZWxlYXNlVG9vbHRpcCcsIFwiVGhpcyB3aWxsIHN3aXRjaCB0byBwcmUtcmVsZWFzZSB2ZXJzaW9uIGFuZCBlbmFibGUgdXBkYXRlcyB0byBsYXRlc3QgdmVyc2lvbiBhbHdheXNcIik7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9wZW4odGhpcy5leHRlbnNpb24sIHsgc2hvd1ByZVJlbGVhc2VWZXJzaW9uOiAhdGhpcy5leHRlbnNpb24ucHJlUmVsZWFzZSB9KTtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnRvZ2dsZVByZVJlbGVhc2UodGhpcy5leHRlbnNpb24pO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbnN0YWxsQW5vdGhlclZlcnNpb25BY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uaW5zdGFsbC5hbm90aGVyVmVyc2lvbic7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCdpbnN0YWxsIGFub3RoZXIgdmVyc2lvbicsIFwiSW5zdGFsbCBTcGVjaWZpYyBWZXJzaW9uLi4uXCIpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGV4dGVuc2lvbjogSUV4dGVuc2lvbiB8IG51bGwsXG5cdFx0cHJpdmF0ZSByZWFkb25seSB3aGVuSW5zdGFsbGVkOiBib29sZWFuLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25HYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlOiBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihJbnN0YWxsQW5vdGhlclZlcnNpb25BY3Rpb24uSUQsIEluc3RhbGxBbm90aGVyVmVyc2lvbkFjdGlvbi5MQUJFTCwgRXh0ZW5zaW9uQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTUyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlQWxsb3dlZEV4dGVuc2lvbnNDb25maWdWYWx1ZSgoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0dGhpcy5leHRlbnNpb24gPSBleHRlbnNpb247XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSAhIXRoaXMuZXh0ZW5zaW9uICYmICF0aGlzLmV4dGVuc2lvbi5pc0J1aWx0aW4gJiYgISF0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLnV1aWQgJiYgIXRoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mb1xuXHRcdFx0JiYgdGhpcy5hbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UuaXNBbGxvd2VkKHsgaWQ6IHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHB1Ymxpc2hlckRpc3BsYXlOYW1lOiB0aGlzLmV4dGVuc2lvbi5wdWJsaXNoZXJEaXNwbGF5TmFtZSB9KSA9PT0gdHJ1ZTtcblx0XHRpZiAodGhpcy5lbmFibGVkICYmIHRoaXMud2hlbkluc3RhbGxlZCkge1xuXHRcdFx0dGhpcy5lbmFibGVkID0gISF0aGlzLmV4dGVuc2lvbj8ubG9jYWwgJiYgISF0aGlzLmV4dGVuc2lvbi5zZXJ2ZXIgJiYgdGhpcy5leHRlbnNpb24uc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZDtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHRpZiAoIXRoaXMuZW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHRhcmdldFBsYXRmb3JtID0gdGhpcy5leHRlbnNpb24uc2VydmVyID8gYXdhaXQgdGhpcy5leHRlbnNpb24uc2VydmVyLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldFRhcmdldFBsYXRmb3JtKCkgOiBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldFRhcmdldFBsYXRmb3JtKCk7XG5cdFx0Y29uc3QgYWxsVmVyc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldEFsbENvbXBhdGlibGVWZXJzaW9ucyh0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLCB0aGlzLmV4dGVuc2lvbi5sb2NhbD8ucHJlUmVsZWFzZSA/PyB0aGlzLmV4dGVuc2lvbi5nYWxsZXJ5Py5wcm9wZXJ0aWVzLmlzUHJlUmVsZWFzZVZlcnNpb24gPz8gZmFsc2UsIHRhcmdldFBsYXRmb3JtKTtcblx0XHRpZiAoIWFsbFZlcnNpb25zLmxlbmd0aCkge1xuXHRcdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmluZm8obG9jYWxpemUoJ25vIHZlcnNpb25zJywgXCJUaGlzIGV4dGVuc2lvbiBoYXMgbm8gb3RoZXIgdmVyc2lvbnMuXCIpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwaWNrcyA9IGFsbFZlcnNpb25zLm1hcCgodiwgaSkgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWQ6IHYudmVyc2lvbixcblx0XHRcdFx0bGFiZWw6IHYudmVyc2lvbixcblx0XHRcdFx0ZGVzY3JpcHRpb246IGAke2Zyb21Ob3cobmV3IERhdGUoRGF0ZS5wYXJzZSh2LmRhdGUpKSwgdHJ1ZSl9JHt2LmlzUHJlUmVsZWFzZVZlcnNpb24gPyBgICgke2xvY2FsaXplKCdwcmUtcmVsZWFzZScsIFwicHJlLXJlbGVhc2VcIil9KWAgOiAnJ30ke3YudmVyc2lvbiA9PT0gdGhpcy5leHRlbnNpb24/LmxvY2FsPy5tYW5pZmVzdC52ZXJzaW9uID8gYCAoJHtsb2NhbGl6ZSgnY3VycmVudCcsIFwiY3VycmVudFwiKX0pYCA6ICcnfWAsXG5cdFx0XHRcdGFyaWFMYWJlbDogYCR7di5pc1ByZVJlbGVhc2VWZXJzaW9uID8gJ1ByZS1SZWxlYXNlIHZlcnNpb24nIDogJ1JlbGVhc2UgdmVyc2lvbid9ICR7di52ZXJzaW9ufWAsXG5cdFx0XHRcdGlzUHJlUmVsZWFzZVZlcnNpb246IHYuaXNQcmVSZWxlYXNlVmVyc2lvblxuXHRcdFx0fTtcblx0XHR9KTtcblx0XHRjb25zdCBwaWNrID0gYXdhaXQgdGhpcy5xdWlja0lucHV0U2VydmljZS5waWNrKHBpY2tzLFxuXHRcdFx0e1xuXHRcdFx0XHRwbGFjZUhvbGRlcjogbG9jYWxpemUoJ3NlbGVjdFZlcnNpb24nLCBcIlNlbGVjdCBWZXJzaW9uIHRvIEluc3RhbGxcIiksXG5cdFx0XHRcdG1hdGNoT25EZXRhaWw6IHRydWVcblx0XHRcdH0pO1xuXHRcdGlmIChwaWNrKSB7XG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb24ubG9jYWw/Lm1hbmlmZXN0LnZlcnNpb24gPT09IHBpY2suaWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHsgaW5zdGFsbFByZVJlbGVhc2VWZXJzaW9uOiBwaWNrLmlzUHJlUmVsZWFzZVZlcnNpb24sIHZlcnNpb246IHBpY2suaWQgfTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaW5zdGFsbCh0aGlzLmV4dGVuc2lvbiwgb3B0aW9ucyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEV4dGVuc2lvbkluc3RhbGxGYWlsdXJlQWN0aW9uLCB0aGlzLmV4dGVuc2lvbiwgb3B0aW9ucywgcGljay5pZCwgSW5zdGFsbE9wZXJhdGlvbi5JbnN0YWxsLCBlcnJvcikucnVuKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIEVuYWJsZUZvcldvcmtzcGFjZUFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ2V4dGVuc2lvbnMuZW5hYmxlRm9yV29ya3NwYWNlJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2VuYWJsZUZvcldvcmtzcGFjZUFjdGlvbicsIFwiRW5hYmxlIChXb3Jrc3BhY2UpXCIpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihFbmFibGVGb3JXb3Jrc3BhY2VBY3Rpb24uSUQsIEVuYWJsZUZvcldvcmtzcGFjZUFjdGlvbi5MQUJFTCwgRXh0ZW5zaW9uQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTUyk7XG5cdFx0dGhpcy50b29sdGlwID0gbG9jYWxpemUoJ2VuYWJsZUZvcldvcmtzcGFjZUFjdGlvblRvb2xUaXAnLCBcIkVuYWJsZSB0aGlzIGV4dGVuc2lvbiBvbmx5IGluIHRoaXMgd29ya3NwYWNlXCIpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uICYmIHRoaXMuZXh0ZW5zaW9uLmxvY2FsICYmICF0aGlzLmV4dGVuc2lvbi5pc1dvcmtzcGFjZVNjb3BlZCkge1xuXHRcdFx0aWYgKEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSB0aGlzLmV4dGVuc2lvbi5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkXG5cdFx0XHRcdCYmICF0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCh0aGlzLmV4dGVuc2lvbi5sb2NhbClcblx0XHRcdFx0JiYgdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5jYW5DaGFuZ2VXb3Jrc3BhY2VFbmFibGVtZW50KHRoaXMuZXh0ZW5zaW9uLmxvY2FsKTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnNldEVuYWJsZW1lbnQodGhpcy5leHRlbnNpb24sIEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRW5hYmxlR2xvYmFsbHlBY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdleHRlbnNpb25zLmVuYWJsZUdsb2JhbGx5Jztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2VuYWJsZUdsb2JhbGx5QWN0aW9uJywgXCJFbmFibGVcIik7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKEVuYWJsZUdsb2JhbGx5QWN0aW9uLklELCBFbmFibGVHbG9iYWxseUFjdGlvbi5MQUJFTCwgRXh0ZW5zaW9uQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTUyk7XG5cdFx0dGhpcy50b29sdGlwID0gbG9jYWxpemUoJ2VuYWJsZUdsb2JhbGx5QWN0aW9uVG9vbFRpcCcsIFwiRW5hYmxlIHRoaXMgZXh0ZW5zaW9uXCIpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uICYmIHRoaXMuZXh0ZW5zaW9uLmxvY2FsICYmICF0aGlzLmV4dGVuc2lvbi5pc1dvcmtzcGFjZVNjb3BlZCkge1xuXHRcdFx0aWYgKEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbklkKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmVuYWJsZWQgPSB0aGlzLmV4dGVuc2lvbi5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkXG5cdFx0XHRcdCYmIHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNEaXNhYmxlZEdsb2JhbGx5KHRoaXMuZXh0ZW5zaW9uLmxvY2FsKVxuXHRcdFx0XHQmJiB0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmNhbkNoYW5nZUVuYWJsZW1lbnQodGhpcy5leHRlbnNpb24ubG9jYWwpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uuc2V0RW5hYmxlbWVudCh0aGlzLmV4dGVuc2lvbiwgRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRHbG9iYWxseSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERpc2FibGVGb3JXb3Jrc3BhY2VBY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdleHRlbnNpb25zLmRpc2FibGVGb3JXb3Jrc3BhY2UnO1xuXHRzdGF0aWMgcmVhZG9ubHkgTEFCRUwgPSBsb2NhbGl6ZSgnZGlzYWJsZUZvcldvcmtzcGFjZUFjdGlvbicsIFwiRGlzYWJsZSAoV29ya3NwYWNlKVwiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoRGlzYWJsZUZvcldvcmtzcGFjZUFjdGlvbi5JRCwgRGlzYWJsZUZvcldvcmtzcGFjZUFjdGlvbi5MQUJFTCwgRXh0ZW5zaW9uQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTUyk7XG5cdFx0dGhpcy50b29sdGlwID0gbG9jYWxpemUoJ2Rpc2FibGVGb3JXb3Jrc3BhY2VBY3Rpb25Ub29sVGlwJywgXCJEaXNhYmxlIHRoaXMgZXh0ZW5zaW9uIG9ubHkgaW4gdGhpcyB3b3Jrc3BhY2VcIik7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRpZiAodGhpcy5leHRlbnNpb24gJiYgdGhpcy5leHRlbnNpb24ubG9jYWwgJiYgIXRoaXMuZXh0ZW5zaW9uLmlzV29ya3NwYWNlU2NvcGVkICYmIHRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLnNvbWUoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyh7IGlkOiBlLmlkZW50aWZpZXIudmFsdWUsIHV1aWQ6IGUudXVpZCB9LCB0aGlzLmV4dGVuc2lvbiEuaWRlbnRpZmllcikgJiYgdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpICE9PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSkpIHtcblx0XHRcdGlmIChFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyh0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQ/LmNoYXRFeHRlbnNpb25JZCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5lbmFibGVkID0gdGhpcy5leHRlbnNpb24uc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZFxuXHRcdFx0XHQmJiAodGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEdsb2JhbGx5IHx8IHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UpXG5cdFx0XHRcdCYmIHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuY2FuQ2hhbmdlV29ya3NwYWNlRW5hYmxlbWVudCh0aGlzLmV4dGVuc2lvbi5sb2NhbCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5zZXRFbmFibGVtZW50KHRoaXMuZXh0ZW5zaW9uLCBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2UpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBEaXNhYmxlR2xvYmFsbHlBY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdleHRlbnNpb25zLmRpc2FibGVHbG9iYWxseSc7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCdkaXNhYmxlR2xvYmFsbHlBY3Rpb24nLCBcIkRpc2FibGVcIik7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKERpc2FibGVHbG9iYWxseUFjdGlvbi5JRCwgRGlzYWJsZUdsb2JhbGx5QWN0aW9uLkxBQkVMLCBFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTKTtcblx0XHR0aGlzLnRvb2x0aXAgPSBsb2NhbGl6ZSgnZGlzYWJsZUdsb2JhbGx5QWN0aW9uVG9vbFRpcCcsIFwiRGlzYWJsZSB0aGlzIGV4dGVuc2lvblwiKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnMoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbiAmJiB0aGlzLmV4dGVuc2lvbi5sb2NhbCAmJiAhdGhpcy5leHRlbnNpb24uaXNXb3Jrc3BhY2VTY29wZWQgJiYgdGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMuc29tZShlID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQ6IGUuaWRlbnRpZmllci52YWx1ZSwgdXVpZDogZS51dWlkIH0sIHRoaXMuZXh0ZW5zaW9uIS5pZGVudGlmaWVyKSkpIHtcblx0XHRcdGlmIChFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyh0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQ/LmNoYXRFeHRlbnNpb25JZCkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5lbmFibGVkID0gdGhpcy5leHRlbnNpb24uc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZFxuXHRcdFx0XHQmJiAodGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEdsb2JhbGx5IHx8IHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UpXG5cdFx0XHRcdCYmIHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuY2FuQ2hhbmdlRW5hYmxlbWVudCh0aGlzLmV4dGVuc2lvbi5sb2NhbCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5zZXRFbmFibGVtZW50KHRoaXMuZXh0ZW5zaW9uLCBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRHbG9iYWxseSk7XG5cdH1cbn1cblxuY2xhc3MgRW5hYmxlQUlGZWF0dXJlc0dsb2JhbGx5QWN0aW9uIGV4dGVuZHMgRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZXh0ZW5zaW9ucy5lbmFibGVBSUdsb2JhbGx5Jztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2VuYWJsZUFJR2xvYmFsbHlBY3Rpb24nLCBcIkVuYWJsZSBBSSBGZWF0dXJlc1wiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoRW5hYmxlQUlGZWF0dXJlc0dsb2JhbGx5QWN0aW9uLklELCBFbmFibGVBSUZlYXR1cmVzR2xvYmFsbHlBY3Rpb24uTEFCRUwsIEV4dGVuc2lvbkFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1MpO1xuXHRcdHRoaXMudG9vbHRpcCA9IGxvY2FsaXplKCdlbmFibGVBSUdsb2JhbGx5QWN0aW9uVG9vbFRpcCcsIFwiRW5hYmxlIEFJIGZlYXR1cmVzXCIpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbj8ubG9jYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyh0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQ/LmNoYXRFeHRlbnNpb25JZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGluc3BlY3QgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3QoQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQpO1xuXHRcdGlmIChpbnNwZWN0Py53b3Jrc3BhY2VWYWx1ZSA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmVuYWJsZWQgPSBpbnNwZWN0LnZhbHVlID09PSB0cnVlO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQsIGZhbHNlKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRW5hYmxlQUlGZWF0dXJlc0luV29ya3NwYWNlQWN0aW9uIGV4dGVuZHMgRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZXh0ZW5zaW9ucy5lbmFibGVBSUluV29ya3NwYWNlJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2VuYWJsZUFJSW5Xb3Jrc3BhY2VBY3Rpb24nLCBcIkVuYWJsZSBBSSBGZWF0dXJlcyAoV29ya3NwYWNlKVwiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2U6IElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoRW5hYmxlQUlGZWF0dXJlc0luV29ya3NwYWNlQWN0aW9uLklELCBFbmFibGVBSUZlYXR1cmVzSW5Xb3Jrc3BhY2VBY3Rpb24uTEFCRUwsIEV4dGVuc2lvbkFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1MpO1xuXHRcdHRoaXMudG9vbHRpcCA9IGxvY2FsaXplKCdlbmFibGVBSUluV29ya3NwYWNlQWN0aW9uVG9vbFRpcCcsIFwiRW5hYmxlIEFJIGZlYXR1cmVzIGluIHRoaXMgd29ya3NwYWNlXCIpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCkpIHtcblx0XHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbj8ubG9jYWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCFFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyh0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQ/LmNoYXRFeHRlbnNpb25JZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmNhbkNoYW5nZVdvcmtzcGFjZUVuYWJsZW1lbnQodGhpcy5leHRlbnNpb24ubG9jYWwpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGluc3BlY3QgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3QoQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQpO1xuXHRcdGlmIChpbnNwZWN0LnZhbHVlID09PSBmYWxzZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoaW5zcGVjdD8ud29ya3NwYWNlVmFsdWUgPT09IHRydWUpIHtcblx0XHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5zZXRFbmFibGVtZW50KHRoaXMuZXh0ZW5zaW9uLCBFbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZSk7XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQpID09PSB0cnVlKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKENoYXRBSURpc2FibGVkU2V0dGluZ0lkLCBmYWxzZSwgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBEaXNhYmxlQUlGZWF0dXJlc0dsb2JhbGx5QWN0aW9uIGV4dGVuZHMgRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZXh0ZW5zaW9ucy5kaXNhYmxlQUlHbG9iYWxseSc7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCdkaXNhYmxlQUlHbG9iYWxseUFjdGlvbicsIFwiRGlzYWJsZSBBSSBGZWF0dXJlc1wiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoRGlzYWJsZUFJRmVhdHVyZXNHbG9iYWxseUFjdGlvbi5JRCwgRGlzYWJsZUFJRmVhdHVyZXNHbG9iYWxseUFjdGlvbi5MQUJFTCwgRXh0ZW5zaW9uQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTUyk7XG5cdFx0dGhpcy50b29sdGlwID0gbG9jYWxpemUoJ2Rpc2FibGVBSUdsb2JhbGx5QWN0aW9uVG9vbFRpcCcsIFwiRGlzYWJsZSBBSSBmZWF0dXJlc1wiKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbiAmJiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyh0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLmRlZmF1bHRDaGF0QWdlbnQ/LmNoYXRFeHRlbnNpb25JZCkpIHtcblx0XHRcdHRoaXMuZW5hYmxlZCA9IHRoaXMuZXh0ZW5zaW9uLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWRcblx0XHRcdFx0JiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0QUlEaXNhYmxlZFNldHRpbmdJZCkgIT09IHRydWVcblx0XHRcdFx0JiYgdGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlICE9PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2U7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoQ2hhdEFJRGlzYWJsZWRTZXR0aW5nSWQsIHRydWUpO1xuXHR9XG59XG5cbmNsYXNzIERpc2FibGVBSUZlYXR1cmVzSW5Xb3Jrc3BhY2VBY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdleHRlbnNpb25zLmRpc2FibGVBSUluV29ya3NwYWNlJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2Rpc2FibGVBSUluV29ya3NwYWNlQWN0aW9uJywgXCJEaXNhYmxlIEFJIEZlYXR1cmVzIChXb3Jrc3BhY2UpXCIpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihEaXNhYmxlQUlGZWF0dXJlc0luV29ya3NwYWNlQWN0aW9uLklELCBEaXNhYmxlQUlGZWF0dXJlc0luV29ya3NwYWNlQWN0aW9uLkxBQkVMLCBFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTKTtcblx0XHR0aGlzLnRvb2x0aXAgPSBsb2NhbGl6ZSgnZGlzYWJsZUFJSW5Xb3Jrc3BhY2VBY3Rpb25Ub29sVGlwJywgXCJEaXNhYmxlIEFJIGZlYXR1cmVzIGluIHRoaXMgd29ya3NwYWNlXCIpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5leHRlbnNpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9ucygoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5lbmFibGVkID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uICYmIHRoaXMuZXh0ZW5zaW9uLmxvY2FsICYmIEV4dGVuc2lvbklkZW50aWZpZXIuZXF1YWxzKHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHRoaXMucHJvZHVjdFNlcnZpY2UuZGVmYXVsdENoYXRBZ2VudD8uY2hhdEV4dGVuc2lvbklkKSkge1xuXHRcdFx0dGhpcy5lbmFibGVkID0gdGhpcy5leHRlbnNpb24uc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZFxuXHRcdFx0XHQmJiAodGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRW5hYmxlZEdsb2JhbGx5IHx8IHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRXb3Jrc3BhY2UpXG5cdFx0XHRcdCYmIHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuY2FuQ2hhbmdlV29ya3NwYWNlRW5hYmxlbWVudCh0aGlzLmV4dGVuc2lvbi5sb2NhbCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5zZXRFbmFibGVtZW50KHRoaXMuZXh0ZW5zaW9uLCBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRXb3Jrc3BhY2UpO1xuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UudXBkYXRlUnVubmluZ0V4dGVuc2lvbnMobG9jYWxpemUoJ3Jlc3RhcnRFeHRlbnNpb25Ib3N0LnJlYXNvbi5kaXNhYmxlJywgXCJEaXNhYmxpbmcgQUkgZmVhdHVyZXNcIikpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFbmFibGVEcm9wRG93bkFjdGlvbiBleHRlbmRzIEJ1dHRvbldpdGhEcm9wRG93bkV4dGVuc2lvbkFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zLmVuYWJsZScsIEV4dGVuc2lvbkFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1MsIFtcblx0XHRcdFtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRW5hYmxlR2xvYmFsbHlBY3Rpb24pLFxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbmFibGVGb3JXb3Jrc3BhY2VBY3Rpb24pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbmFibGVBSUZlYXR1cmVzR2xvYmFsbHlBY3Rpb24pLFxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFbmFibGVBSUZlYXR1cmVzSW5Xb3Jrc3BhY2VBY3Rpb24pXG5cdFx0XHRdXG5cdFx0XSk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIERpc2FibGVEcm9wRG93bkFjdGlvbiBleHRlbmRzIEJ1dHRvbldpdGhEcm9wRG93bkV4dGVuc2lvbkFjdGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zLmRpc2FibGUnLCBFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTLCBbXG5cdFx0XHRbXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpc2FibGVHbG9iYWxseUFjdGlvbiksXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpc2FibGVGb3JXb3Jrc3BhY2VBY3Rpb24pXG5cdFx0XHRdLFxuXHRcdFx0W1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaXNhYmxlQUlGZWF0dXJlc0dsb2JhbGx5QWN0aW9uKSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlzYWJsZUFJRmVhdHVyZXNJbldvcmtzcGFjZUFjdGlvbilcblx0XHRcdF1cblx0XHRdKTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25SdW50aW1lU3RhdGVBY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVuYWJsZWRDbGFzcyA9IGAke0V4dGVuc2lvbkFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1N9IHByb21pbmVudCByZWxvYWRgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBEaXNhYmxlZENsYXNzID0gYCR7dGhpcy5FbmFibGVkQ2xhc3N9IGRpc2FibGVkYDtcblxuXHR1cGRhdGVXaGVuQ291bnRlckV4dGVuc2lvbkNoYW5nZXM6IGJvb2xlYW4gPSB0cnVlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJVXBkYXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVwZGF0ZVNlcnZpY2U6IElVcGRhdGVTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcignZXh0ZW5zaW9ucy5ydW50aW1lU3RhdGUnLCAnJywgRXh0ZW5zaW9uUnVudGltZVN0YXRlQWN0aW9uLkRpc2FibGVkQ2xhc3MsIGZhbHNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMudG9vbHRpcCA9ICcnO1xuXHRcdHRoaXMuY2xhc3MgPSBFeHRlbnNpb25SdW50aW1lU3RhdGVBY3Rpb24uRGlzYWJsZWRDbGFzcztcblxuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuZXh0ZW5zaW9uLnN0YXRlO1xuXHRcdGlmIChzdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGluZyB8fCBzdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuVW5pbnN0YWxsaW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmxvY2FsICYmIHRoaXMuZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0ICYmIHRoaXMuZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0LmNvbnRyaWJ1dGVzICYmIHRoaXMuZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0LmNvbnRyaWJ1dGVzLmxvY2FsaXphdGlvbnMgJiYgdGhpcy5leHRlbnNpb24ubG9jYWwubWFuaWZlc3QuY29udHJpYnV0ZXMubG9jYWxpemF0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcnVudGltZVN0YXRlID0gdGhpcy5leHRlbnNpb24ucnVudGltZVN0YXRlO1xuXHRcdGlmICghcnVudGltZVN0YXRlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHR0aGlzLmNsYXNzID0gRXh0ZW5zaW9uUnVudGltZVN0YXRlQWN0aW9uLkVuYWJsZWRDbGFzcztcblx0XHR0aGlzLnRvb2x0aXAgPSBydW50aW1lU3RhdGUucmVhc29uO1xuXHRcdHRoaXMubGFiZWwgPSBydW50aW1lU3RhdGUuYWN0aW9uID09PSBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5SZWxvYWRXaW5kb3cgPyBsb2NhbGl6ZSgncmVsb2FkIHdpbmRvdycsICdSZWxvYWQgV2luZG93Jylcblx0XHRcdDogcnVudGltZVN0YXRlLmFjdGlvbiA9PT0gRXh0ZW5zaW9uUnVudGltZUFjdGlvblR5cGUuUmVzdGFydEV4dGVuc2lvbnMgPyBsb2NhbGl6ZSgncmVzdGFydCBleHRlbnNpb25zJywgJ1Jlc3RhcnQgRXh0ZW5zaW9ucycpXG5cdFx0XHRcdDogcnVudGltZVN0YXRlLmFjdGlvbiA9PT0gRXh0ZW5zaW9uUnVudGltZUFjdGlvblR5cGUuUXVpdEFuZEluc3RhbGwgPyBsb2NhbGl6ZSgncmVzdGFydCBwcm9kdWN0JywgJ1Jlc3RhcnQgdG8gVXBkYXRlJylcblx0XHRcdFx0XHQ6IHJ1bnRpbWVTdGF0ZS5hY3Rpb24gPT09IEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLkFwcGx5VXBkYXRlIHx8IHJ1bnRpbWVTdGF0ZS5hY3Rpb24gPT09IEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLkRvd25sb2FkVXBkYXRlID8gbG9jYWxpemUoJ3VwZGF0ZSBwcm9kdWN0JywgJ1VwZGF0ZSB7MH0nLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCkgOiAnJztcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdGNvbnN0IHJ1bnRpbWVTdGF0ZSA9IHRoaXMuZXh0ZW5zaW9uPy5ydW50aW1lU3RhdGU7XG5cdFx0aWYgKCFydW50aW1lU3RhdGU/LmFjdGlvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHR5cGUgRXh0ZW5zaW9uUnVudGltZVN0YXRlQWN0aW9uQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ3NhbmR5MDgxJztcblx0XHRcdGNvbW1lbnQ6ICdFeHRlbnNpb24gcnVudGltZSBzdGF0ZSBhY3Rpb24gZXZlbnQnO1xuXHRcdFx0YWN0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRXhlY3V0ZWQgYWN0aW9uJyB9O1xuXHRcdH07XG5cdFx0dHlwZSBFeHRlbnNpb25SdW50aW1lU3RhdGVBY3Rpb25FdmVudCA9IHtcblx0XHRcdGFjdGlvbjogc3RyaW5nO1xuXHRcdH07XG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8RXh0ZW5zaW9uUnVudGltZVN0YXRlQWN0aW9uRXZlbnQsIEV4dGVuc2lvblJ1bnRpbWVTdGF0ZUFjdGlvbkNsYXNzaWZpY2F0aW9uPignZXh0ZW5zaW9uczpydW50aW1lc3RhdGU6YWN0aW9uJywge1xuXHRcdFx0YWN0aW9uOiBydW50aW1lU3RhdGUuYWN0aW9uXG5cdFx0fSk7XG5cblx0XHRpZiAocnVudGltZVN0YXRlPy5hY3Rpb24gPT09IEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLlJlbG9hZFdpbmRvdykge1xuXHRcdFx0cmV0dXJuIHRoaXMuaG9zdFNlcnZpY2UucmVsb2FkKCk7XG5cdFx0fVxuXG5cdFx0ZWxzZSBpZiAocnVudGltZVN0YXRlPy5hY3Rpb24gPT09IEV4dGVuc2lvblJ1bnRpbWVBY3Rpb25UeXBlLlJlc3RhcnRFeHRlbnNpb25zKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS51cGRhdGVSdW5uaW5nRXh0ZW5zaW9ucygpO1xuXHRcdH1cblxuXHRcdGVsc2UgaWYgKHJ1bnRpbWVTdGF0ZT8uYWN0aW9uID09PSBFeHRlbnNpb25SdW50aW1lQWN0aW9uVHlwZS5Eb3dubG9hZFVwZGF0ZSkge1xuXHRcdFx0cmV0dXJuIHRoaXMudXBkYXRlU2VydmljZS5kb3dubG9hZFVwZGF0ZSh0cnVlKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChydW50aW1lU3RhdGU/LmFjdGlvbiA9PT0gRXh0ZW5zaW9uUnVudGltZUFjdGlvblR5cGUuQXBwbHlVcGRhdGUpIHtcblx0XHRcdHJldHVybiB0aGlzLnVwZGF0ZVNlcnZpY2UuYXBwbHlVcGRhdGUoKTtcblx0XHR9XG5cblx0XHRlbHNlIGlmIChydW50aW1lU3RhdGU/LmFjdGlvbiA9PT0gRXh0ZW5zaW9uUnVudGltZUFjdGlvblR5cGUuUXVpdEFuZEluc3RhbGwpIHtcblx0XHRcdHJldHVybiB0aGlzLnVwZGF0ZVNlcnZpY2UucXVpdEFuZEluc3RhbGwoKTtcblx0XHR9XG5cblx0fVxufVxuXG5mdW5jdGlvbiBpc1RoZW1lRnJvbUV4dGVuc2lvbih0aGVtZTogSVdvcmtiZW5jaFRoZW1lLCBleHRlbnNpb246IElFeHRlbnNpb24gfCB1bmRlZmluZWQgfCBudWxsKTogYm9vbGVhbiB7XG5cdHJldHVybiAhIShleHRlbnNpb24gJiYgdGhlbWUuZXh0ZW5zaW9uRGF0YSAmJiBFeHRlbnNpb25JZGVudGlmaWVyLmVxdWFscyh0aGVtZS5leHRlbnNpb25EYXRhLmV4dGVuc2lvbklkLCBleHRlbnNpb24uaWRlbnRpZmllci5pZCkpO1xufVxuXG5mdW5jdGlvbiBnZXRRdWlja1BpY2tFbnRyaWVzKHRoZW1lczogSVdvcmtiZW5jaFRoZW1lW10sIGN1cnJlbnRUaGVtZTogSVdvcmtiZW5jaFRoZW1lLCBleHRlbnNpb246IElFeHRlbnNpb24gfCBudWxsIHwgdW5kZWZpbmVkLCBzaG93Q3VycmVudFRoZW1lOiBib29sZWFuKTogUXVpY2tQaWNrSXRlbVtdIHtcblx0Y29uc3QgcGlja3M6IFF1aWNrUGlja0l0ZW1bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IHRoZW1lIG9mIHRoZW1lcykge1xuXHRcdGlmIChpc1RoZW1lRnJvbUV4dGVuc2lvbih0aGVtZSwgZXh0ZW5zaW9uKSAmJiAhKHNob3dDdXJyZW50VGhlbWUgJiYgdGhlbWUgPT09IGN1cnJlbnRUaGVtZSkpIHtcblx0XHRcdHBpY2tzLnB1c2goeyBsYWJlbDogdGhlbWUubGFiZWwsIGlkOiB0aGVtZS5pZCB9KTtcblx0XHR9XG5cdH1cblx0aWYgKHNob3dDdXJyZW50VGhlbWUpIHtcblx0XHRwaWNrcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgnY3VycmVudCcsIFwiY3VycmVudFwiKSB9KTtcblx0XHRwaWNrcy5wdXNoKHsgbGFiZWw6IGN1cnJlbnRUaGVtZS5sYWJlbCwgaWQ6IGN1cnJlbnRUaGVtZS5pZCB9KTtcblx0fVxuXHRyZXR1cm4gcGlja3M7XG59XG5cbmV4cG9ydCBjbGFzcyBTZXRDb2xvclRoZW1lQWN0aW9uIGV4dGVuZHMgRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNldENvbG9yVGhlbWUnO1xuXHRzdGF0aWMgcmVhZG9ubHkgVElUTEUgPSBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zZXRDb2xvclRoZW1lJywgJ1NldCBDb2xvciBUaGVtZScpO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVuYWJsZWRDbGFzcyA9IGAke0V4dGVuc2lvbkFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1N9IHRoZW1lYDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRGlzYWJsZWRDbGFzcyA9IGAke3RoaXMuRW5hYmxlZENsYXNzfSBkaXNhYmxlZGA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2JlbmNoVGhlbWVTZXJ2aWNlOiBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihTZXRDb2xvclRoZW1lQWN0aW9uLklELCBTZXRDb2xvclRoZW1lQWN0aW9uLlRJVExFLnZhbHVlLCBTZXRDb2xvclRoZW1lQWN0aW9uLkRpc2FibGVkQ2xhc3MsIGZhbHNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnk8YW55PihleHRlbnNpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9ucywgd29ya2JlbmNoVGhlbWVTZXJ2aWNlLm9uRGlkQ29sb3JUaGVtZUNoYW5nZSkoKCkgPT4gdGhpcy51cGRhdGUoKSwgdGhpcykpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy53b3JrYmVuY2hUaGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZXMoKS50aGVuKGNvbG9yVGhlbWVzID0+IHtcblx0XHRcdHRoaXMuZW5hYmxlZCA9IHRoaXMuY29tcHV0ZUVuYWJsZW1lbnQoY29sb3JUaGVtZXMpO1xuXHRcdFx0dGhpcy5jbGFzcyA9IHRoaXMuZW5hYmxlZCA/IFNldENvbG9yVGhlbWVBY3Rpb24uRW5hYmxlZENsYXNzIDogU2V0Q29sb3JUaGVtZUFjdGlvbi5EaXNhYmxlZENsYXNzO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlRW5hYmxlbWVudChjb2xvclRoZW1lczogSVdvcmtiZW5jaENvbG9yVGhlbWVbXSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuZXh0ZW5zaW9uICYmIHRoaXMuZXh0ZW5zaW9uLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQgJiYgdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWRFbmFibGVtZW50U3RhdGUodGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlKSAmJiBjb2xvclRoZW1lcy5zb21lKHRoID0+IGlzVGhlbWVGcm9tRXh0ZW5zaW9uKHRoLCB0aGlzLmV4dGVuc2lvbikpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKHsgc2hvd0N1cnJlbnRUaGVtZSwgaWdub3JlRm9jdXNMb3N0IH06IHsgc2hvd0N1cnJlbnRUaGVtZTogYm9vbGVhbjsgaWdub3JlRm9jdXNMb3N0OiBib29sZWFuIH0gPSB7IHNob3dDdXJyZW50VGhlbWU6IGZhbHNlLCBpZ25vcmVGb2N1c0xvc3Q6IGZhbHNlIH0pOiBQcm9taXNlPGFueT4ge1xuXHRcdGNvbnN0IGNvbG9yVGhlbWVzID0gYXdhaXQgdGhpcy53b3JrYmVuY2hUaGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZXMoKTtcblxuXHRcdGlmICghdGhpcy5jb21wdXRlRW5hYmxlbWVudChjb2xvclRoZW1lcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgY3VycmVudFRoZW1lID0gdGhpcy53b3JrYmVuY2hUaGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpO1xuXG5cdFx0Y29uc3QgZGVsYXllciA9IG5ldyBEZWxheWVyPGFueT4oMTAwKTtcblx0XHRjb25zdCBwaWNrcyA9IGdldFF1aWNrUGlja0VudHJpZXMoY29sb3JUaGVtZXMsIGN1cnJlbnRUaGVtZSwgdGhpcy5leHRlbnNpb24sIHNob3dDdXJyZW50VGhlbWUpO1xuXHRcdGNvbnN0IHBpY2tlZFRoZW1lID0gYXdhaXQgdGhpcy5xdWlja0lucHV0U2VydmljZS5waWNrKFxuXHRcdFx0cGlja3MsXG5cdFx0XHR7XG5cdFx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnc2VsZWN0IGNvbG9yIHRoZW1lJywgXCJTZWxlY3QgQ29sb3IgVGhlbWVcIiksXG5cdFx0XHRcdG9uRGlkRm9jdXM6IGl0ZW0gPT4gZGVsYXllci50cmlnZ2VyKCgpID0+IHRoaXMud29ya2JlbmNoVGhlbWVTZXJ2aWNlLnNldENvbG9yVGhlbWUoaXRlbS5pZCwgdW5kZWZpbmVkKSksXG5cdFx0XHRcdGlnbm9yZUZvY3VzTG9zdFxuXHRcdFx0fSk7XG5cdFx0cmV0dXJuIHRoaXMud29ya2JlbmNoVGhlbWVTZXJ2aWNlLnNldENvbG9yVGhlbWUocGlja2VkVGhlbWUgPyBwaWNrZWRUaGVtZS5pZCA6IGN1cnJlbnRUaGVtZS5pZCwgJ2F1dG8nKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2V0RmlsZUljb25UaGVtZUFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zZXRGaWxlSWNvblRoZW1lJztcblx0c3RhdGljIHJlYWRvbmx5IFRJVExFID0gbG9jYWxpemUyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2V0RmlsZUljb25UaGVtZScsICdTZXQgRmlsZSBJY29uIFRoZW1lJyk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRW5hYmxlZENsYXNzID0gYCR7RXh0ZW5zaW9uQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTU30gdGhlbWVgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBEaXNhYmxlZENsYXNzID0gYCR7dGhpcy5FbmFibGVkQ2xhc3N9IGRpc2FibGVkYDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JrYmVuY2hUaGVtZVNlcnZpY2U6IElXb3JrYmVuY2hUaGVtZVNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFNldEZpbGVJY29uVGhlbWVBY3Rpb24uSUQsIFNldEZpbGVJY29uVGhlbWVBY3Rpb24uVElUTEUudmFsdWUsIFNldEZpbGVJY29uVGhlbWVBY3Rpb24uRGlzYWJsZWRDbGFzcywgZmFsc2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueTxhbnk+KGV4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zLCB3b3JrYmVuY2hUaGVtZVNlcnZpY2Uub25EaWRGaWxlSWNvblRoZW1lQ2hhbmdlKSgoKSA9PiB0aGlzLnVwZGF0ZSgpLCB0aGlzKSk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLndvcmtiZW5jaFRoZW1lU2VydmljZS5nZXRGaWxlSWNvblRoZW1lcygpLnRoZW4oZmlsZUljb25UaGVtZXMgPT4ge1xuXHRcdFx0dGhpcy5lbmFibGVkID0gdGhpcy5jb21wdXRlRW5hYmxlbWVudChmaWxlSWNvblRoZW1lcyk7XG5cdFx0XHR0aGlzLmNsYXNzID0gdGhpcy5lbmFibGVkID8gU2V0RmlsZUljb25UaGVtZUFjdGlvbi5FbmFibGVkQ2xhc3MgOiBTZXRGaWxlSWNvblRoZW1lQWN0aW9uLkRpc2FibGVkQ2xhc3M7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVFbmFibGVtZW50KGNvbG9yVGhlbWZpbGVJY29uVGhlbWVzczogSVdvcmtiZW5jaEZpbGVJY29uVGhlbWVbXSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuZXh0ZW5zaW9uICYmIHRoaXMuZXh0ZW5zaW9uLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQgJiYgdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWRFbmFibGVtZW50U3RhdGUodGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlKSAmJiBjb2xvclRoZW1maWxlSWNvblRoZW1lc3Muc29tZSh0aCA9PiBpc1RoZW1lRnJvbUV4dGVuc2lvbih0aCwgdGhpcy5leHRlbnNpb24pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bih7IHNob3dDdXJyZW50VGhlbWUsIGlnbm9yZUZvY3VzTG9zdCB9OiB7IHNob3dDdXJyZW50VGhlbWU6IGJvb2xlYW47IGlnbm9yZUZvY3VzTG9zdDogYm9vbGVhbiB9ID0geyBzaG93Q3VycmVudFRoZW1lOiBmYWxzZSwgaWdub3JlRm9jdXNMb3N0OiBmYWxzZSB9KTogUHJvbWlzZTxhbnk+IHtcblx0XHRjb25zdCBmaWxlSWNvblRoZW1lcyA9IGF3YWl0IHRoaXMud29ya2JlbmNoVGhlbWVTZXJ2aWNlLmdldEZpbGVJY29uVGhlbWVzKCk7XG5cdFx0aWYgKCF0aGlzLmNvbXB1dGVFbmFibGVtZW50KGZpbGVJY29uVGhlbWVzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBjdXJyZW50VGhlbWUgPSB0aGlzLndvcmtiZW5jaFRoZW1lU2VydmljZS5nZXRGaWxlSWNvblRoZW1lKCk7XG5cblx0XHRjb25zdCBkZWxheWVyID0gbmV3IERlbGF5ZXI8YW55PigxMDApO1xuXHRcdGNvbnN0IHBpY2tzID0gZ2V0UXVpY2tQaWNrRW50cmllcyhmaWxlSWNvblRoZW1lcywgY3VycmVudFRoZW1lLCB0aGlzLmV4dGVuc2lvbiwgc2hvd0N1cnJlbnRUaGVtZSk7XG5cdFx0Y29uc3QgcGlja2VkVGhlbWUgPSBhd2FpdCB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soXG5cdFx0XHRwaWNrcyxcblx0XHRcdHtcblx0XHRcdFx0cGxhY2VIb2xkZXI6IGxvY2FsaXplKCdzZWxlY3QgZmlsZSBpY29uIHRoZW1lJywgXCJTZWxlY3QgRmlsZSBJY29uIFRoZW1lXCIpLFxuXHRcdFx0XHRvbkRpZEZvY3VzOiBpdGVtID0+IGRlbGF5ZXIudHJpZ2dlcigoKSA9PiB0aGlzLndvcmtiZW5jaFRoZW1lU2VydmljZS5zZXRGaWxlSWNvblRoZW1lKGl0ZW0uaWQsIHVuZGVmaW5lZCkpLFxuXHRcdFx0XHRpZ25vcmVGb2N1c0xvc3Rcblx0XHRcdH0pO1xuXHRcdHJldHVybiB0aGlzLndvcmtiZW5jaFRoZW1lU2VydmljZS5zZXRGaWxlSWNvblRoZW1lKHBpY2tlZFRoZW1lID8gcGlja2VkVGhlbWUuaWQgOiBjdXJyZW50VGhlbWUuaWQsICdhdXRvJyk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNldFByb2R1Y3RJY29uVGhlbWVBY3Rpb24gZXh0ZW5kcyBFeHRlbnNpb25BY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uc2V0UHJvZHVjdEljb25UaGVtZSc7XG5cdHN0YXRpYyByZWFkb25seSBUSVRMRSA9IGxvY2FsaXplMignd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNldFByb2R1Y3RJY29uVGhlbWUnLCAnU2V0IFByb2R1Y3QgSWNvbiBUaGVtZScpO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEVuYWJsZWRDbGFzcyA9IGAke0V4dGVuc2lvbkFjdGlvbi5MQUJFTF9BQ1RJT05fQ0xBU1N9IHRoZW1lYDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRGlzYWJsZWRDbGFzcyA9IGAke3RoaXMuRW5hYmxlZENsYXNzfSBkaXNhYmxlZGA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya2JlbmNoVGhlbWVTZXJ2aWNlOiBJV29ya2JlbmNoVGhlbWVTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihTZXRQcm9kdWN0SWNvblRoZW1lQWN0aW9uLklELCBTZXRQcm9kdWN0SWNvblRoZW1lQWN0aW9uLlRJVExFLnZhbHVlLCBTZXRQcm9kdWN0SWNvblRoZW1lQWN0aW9uLkRpc2FibGVkQ2xhc3MsIGZhbHNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5hbnk8YW55PihleHRlbnNpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlRXh0ZW5zaW9ucywgd29ya2JlbmNoVGhlbWVTZXJ2aWNlLm9uRGlkUHJvZHVjdEljb25UaGVtZUNoYW5nZSkoKCkgPT4gdGhpcy51cGRhdGUoKSwgdGhpcykpO1xuXHRcdHRoaXMudXBkYXRlKCk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy53b3JrYmVuY2hUaGVtZVNlcnZpY2UuZ2V0UHJvZHVjdEljb25UaGVtZXMoKS50aGVuKHByb2R1Y3RJY29uVGhlbWVzID0+IHtcblx0XHRcdHRoaXMuZW5hYmxlZCA9IHRoaXMuY29tcHV0ZUVuYWJsZW1lbnQocHJvZHVjdEljb25UaGVtZXMpO1xuXHRcdFx0dGhpcy5jbGFzcyA9IHRoaXMuZW5hYmxlZCA/IFNldFByb2R1Y3RJY29uVGhlbWVBY3Rpb24uRW5hYmxlZENsYXNzIDogU2V0UHJvZHVjdEljb25UaGVtZUFjdGlvbi5EaXNhYmxlZENsYXNzO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlRW5hYmxlbWVudChwcm9kdWN0SWNvblRoZW1lczogSVdvcmtiZW5jaFByb2R1Y3RJY29uVGhlbWVbXSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuZXh0ZW5zaW9uICYmIHRoaXMuZXh0ZW5zaW9uLnN0YXRlID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQgJiYgdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWRFbmFibGVtZW50U3RhdGUodGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlKSAmJiBwcm9kdWN0SWNvblRoZW1lcy5zb21lKHRoID0+IGlzVGhlbWVGcm9tRXh0ZW5zaW9uKHRoLCB0aGlzLmV4dGVuc2lvbikpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKHsgc2hvd0N1cnJlbnRUaGVtZSwgaWdub3JlRm9jdXNMb3N0IH06IHsgc2hvd0N1cnJlbnRUaGVtZTogYm9vbGVhbjsgaWdub3JlRm9jdXNMb3N0OiBib29sZWFuIH0gPSB7IHNob3dDdXJyZW50VGhlbWU6IGZhbHNlLCBpZ25vcmVGb2N1c0xvc3Q6IGZhbHNlIH0pOiBQcm9taXNlPGFueT4ge1xuXHRcdGNvbnN0IHByb2R1Y3RJY29uVGhlbWVzID0gYXdhaXQgdGhpcy53b3JrYmVuY2hUaGVtZVNlcnZpY2UuZ2V0UHJvZHVjdEljb25UaGVtZXMoKTtcblx0XHRpZiAoIXRoaXMuY29tcHV0ZUVuYWJsZW1lbnQocHJvZHVjdEljb25UaGVtZXMpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudFRoZW1lID0gdGhpcy53b3JrYmVuY2hUaGVtZVNlcnZpY2UuZ2V0UHJvZHVjdEljb25UaGVtZSgpO1xuXG5cdFx0Y29uc3QgZGVsYXllciA9IG5ldyBEZWxheWVyPGFueT4oMTAwKTtcblx0XHRjb25zdCBwaWNrcyA9IGdldFF1aWNrUGlja0VudHJpZXMocHJvZHVjdEljb25UaGVtZXMsIGN1cnJlbnRUaGVtZSwgdGhpcy5leHRlbnNpb24sIHNob3dDdXJyZW50VGhlbWUpO1xuXHRcdGNvbnN0IHBpY2tlZFRoZW1lID0gYXdhaXQgdGhpcy5xdWlja0lucHV0U2VydmljZS5waWNrKFxuXHRcdFx0cGlja3MsXG5cdFx0XHR7XG5cdFx0XHRcdHBsYWNlSG9sZGVyOiBsb2NhbGl6ZSgnc2VsZWN0IHByb2R1Y3QgaWNvbiB0aGVtZScsIFwiU2VsZWN0IFByb2R1Y3QgSWNvbiBUaGVtZVwiKSxcblx0XHRcdFx0b25EaWRGb2N1czogaXRlbSA9PiBkZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy53b3JrYmVuY2hUaGVtZVNlcnZpY2Uuc2V0UHJvZHVjdEljb25UaGVtZShpdGVtLmlkLCB1bmRlZmluZWQpKSxcblx0XHRcdFx0aWdub3JlRm9jdXNMb3N0XG5cdFx0XHR9KTtcblx0XHRyZXR1cm4gdGhpcy53b3JrYmVuY2hUaGVtZVNlcnZpY2Uuc2V0UHJvZHVjdEljb25UaGVtZShwaWNrZWRUaGVtZSA/IHBpY2tlZFRoZW1lLmlkIDogY3VycmVudFRoZW1lLmlkLCAnYXV0bycpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBTZXRMYW5ndWFnZUFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zZXREaXNwbGF5TGFuZ3VhZ2UnO1xuXHRzdGF0aWMgcmVhZG9ubHkgVElUTEUgPSBsb2NhbGl6ZTIoJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5zZXREaXNwbGF5TGFuZ3VhZ2UnLCAnU2V0IERpc3BsYXkgTGFuZ3VhZ2UnKTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBFbmFibGVkQ2xhc3MgPSBgJHtFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTfSBsYW5ndWFnZWA7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERpc2FibGVkQ2xhc3MgPSBgJHt0aGlzLkVuYWJsZWRDbGFzc30gZGlzYWJsZWRgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihTZXRMYW5ndWFnZUFjdGlvbi5JRCwgU2V0TGFuZ3VhZ2VBY3Rpb24uVElUTEUudmFsdWUsIFNldExhbmd1YWdlQWN0aW9uLkRpc2FibGVkQ2xhc3MsIGZhbHNlKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMuY2xhc3MgPSBTZXRMYW5ndWFnZUFjdGlvbi5EaXNhYmxlZENsYXNzO1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmNhblNldExhbmd1YWdlKHRoaXMuZXh0ZW5zaW9uKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb24uZ2FsbGVyeSAmJiBsYW5ndWFnZSA9PT0gZ2V0TG9jYWxlKHRoaXMuZXh0ZW5zaW9uLmdhbGxlcnkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0dGhpcy5jbGFzcyA9IFNldExhbmd1YWdlQWN0aW9uLkVuYWJsZWRDbGFzcztcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbiAmJiB0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnNldExhbmd1YWdlKHRoaXMuZXh0ZW5zaW9uKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2xlYXJMYW5ndWFnZUFjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5jbGVhckxhbmd1YWdlJztcblx0c3RhdGljIHJlYWRvbmx5IFRJVExFID0gbG9jYWxpemUyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uY2xlYXJMYW5ndWFnZScsICdDbGVhciBEaXNwbGF5IExhbmd1YWdlJyk7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRW5hYmxlZENsYXNzID0gYCR7RXh0ZW5zaW9uQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTU30gbGFuZ3VhZ2VgO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBEaXNhYmxlZENsYXNzID0gYCR7dGhpcy5FbmFibGVkQ2xhc3N9IGRpc2FibGVkYDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASUxvY2FsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2NhbGVTZXJ2aWNlOiBJTG9jYWxlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoQ2xlYXJMYW5ndWFnZUFjdGlvbi5JRCwgQ2xlYXJMYW5ndWFnZUFjdGlvbi5USVRMRS52YWx1ZSwgQ2xlYXJMYW5ndWFnZUFjdGlvbi5EaXNhYmxlZENsYXNzLCBmYWxzZSk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblx0XHR0aGlzLmNsYXNzID0gQ2xlYXJMYW5ndWFnZUFjdGlvbi5EaXNhYmxlZENsYXNzO1xuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmNhblNldExhbmd1YWdlKHRoaXMuZXh0ZW5zaW9uKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAodGhpcy5leHRlbnNpb24uZ2FsbGVyeSAmJiBsYW5ndWFnZSAhPT0gZ2V0TG9jYWxlKHRoaXMuZXh0ZW5zaW9uLmdhbGxlcnkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdFx0dGhpcy5jbGFzcyA9IENsZWFyTGFuZ3VhZ2VBY3Rpb24uRW5hYmxlZENsYXNzO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uICYmIHRoaXMubG9jYWxlU2VydmljZS5jbGVhckxvY2FsZVByZWZlcmVuY2UoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgU2hvd1JlY29tbWVuZGVkRXh0ZW5zaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNob3dSZWNvbW1lbmRlZEV4dGVuc2lvbic7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCdzaG93UmVjb21tZW5kZWRFeHRlbnNpb24nLCBcIlNob3cgUmVjb21tZW5kZWQgRXh0ZW5zaW9uXCIpO1xuXG5cdHByaXZhdGUgZXh0ZW5zaW9uSWQ6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRleHRlbnNpb25JZDogc3RyaW5nLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKFNob3dSZWNvbW1lbmRlZEV4dGVuc2lvbkFjdGlvbi5JRCwgU2hvd1JlY29tbWVuZGVkRXh0ZW5zaW9uQWN0aW9uLkxBQkVMLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHR0aGlzLmV4dGVuc2lvbklkID0gZXh0ZW5zaW9uSWQ7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaChgQGlkOiR7dGhpcy5leHRlbnNpb25JZH1gKTtcblx0XHRjb25zdCBbZXh0ZW5zaW9uXSA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25zKFt7IGlkOiB0aGlzLmV4dGVuc2lvbklkIH1dLCB7IHNvdXJjZTogJ2luc3RhbGwtcmVjb21tZW5kYXRpb24nIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2Uub3BlbihleHRlbnNpb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5zdGFsbFJlY29tbWVuZGVkRXh0ZW5zaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmluc3RhbGxSZWNvbW1lbmRlZEV4dGVuc2lvbic7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCdpbnN0YWxsUmVjb21tZW5kZWRFeHRlbnNpb24nLCBcIkluc3RhbGwgUmVjb21tZW5kZWQgRXh0ZW5zaW9uXCIpO1xuXG5cdHByaXZhdGUgZXh0ZW5zaW9uSWQ6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRleHRlbnNpb25JZDogc3RyaW5nLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25Xb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKEluc3RhbGxSZWNvbW1lbmRlZEV4dGVuc2lvbkFjdGlvbi5JRCwgSW5zdGFsbFJlY29tbWVuZGVkRXh0ZW5zaW9uQWN0aW9uLkxBQkVMLCB1bmRlZmluZWQsIGZhbHNlKTtcblx0XHR0aGlzLmV4dGVuc2lvbklkID0gZXh0ZW5zaW9uSWQ7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaChgQGlkOiR7dGhpcy5leHRlbnNpb25JZH1gKTtcblx0XHRjb25zdCBbZXh0ZW5zaW9uXSA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5nZXRFeHRlbnNpb25zKFt7IGlkOiB0aGlzLmV4dGVuc2lvbklkIH1dLCB7IHNvdXJjZTogJ2luc3RhbGwtcmVjb21tZW5kYXRpb24nIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmIChleHRlbnNpb24pIHtcblx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uV29ya2JlbmNoU2VydmljZS5vcGVuKGV4dGVuc2lvbik7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbldvcmtiZW5jaFNlcnZpY2UuaW5zdGFsbChleHRlbnNpb24pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0RXh0ZW5zaW9uSW5zdGFsbEZhaWx1cmVBY3Rpb24sIGV4dGVuc2lvbiwgdW5kZWZpbmVkLCBleHRlbnNpb24ubGF0ZXN0VmVyc2lvbiwgSW5zdGFsbE9wZXJhdGlvbi5JbnN0YWxsLCBlcnIpLnJ1bigpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSWdub3JlRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdleHRlbnNpb25zLmlnbm9yZSc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ2xhc3MgPSBgJHtFeHRlbnNpb25BY3Rpb24uTEFCRUxfQUNUSU9OX0NMQVNTfSBpZ25vcmVgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLFxuXHRcdEBJRXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25SZWNvbW1lbmRhdGlvbnNNYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihJZ25vcmVFeHRlbnNpb25SZWNvbW1lbmRhdGlvbkFjdGlvbi5JRCwgJ0lnbm9yZSBSZWNvbW1lbmRhdGlvbicpO1xuXG5cdFx0dGhpcy5jbGFzcyA9IElnbm9yZUV4dGVuc2lvblJlY29tbWVuZGF0aW9uQWN0aW9uLkNsYXNzO1xuXHRcdHRoaXMudG9vbHRpcCA9IGxvY2FsaXplKCdpZ25vcmVFeHRlbnNpb25SZWNvbW1lbmRhdGlvbicsIFwiRG8gbm90IHJlY29tbWVuZCB0aGlzIGV4dGVuc2lvbiBhZ2FpblwiKTtcblx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdHRoaXMuZXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zTWFuYWdlbWVudFNlcnZpY2UudG9nZ2xlR2xvYmFsSWdub3JlZFJlY29tbWVuZGF0aW9uKHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIHRydWUpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgVW5kb0lnbm9yZUV4dGVuc2lvblJlY29tbWVuZGF0aW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZXh0ZW5zaW9ucy5pZ25vcmUnO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IENsYXNzID0gYCR7RXh0ZW5zaW9uQWN0aW9uLkxBQkVMX0FDVElPTl9DTEFTU30gdW5kby1pZ25vcmVgO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uLFxuXHRcdEBJRXh0ZW5zaW9uSWdub3JlZFJlY29tbWVuZGF0aW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25SZWNvbW1lbmRhdGlvbnNNYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbklnbm9yZWRSZWNvbW1lbmRhdGlvbnNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihVbmRvSWdub3JlRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25BY3Rpb24uSUQsICdVbmRvJyk7XG5cblx0XHR0aGlzLmNsYXNzID0gVW5kb0lnbm9yZUV4dGVuc2lvblJlY29tbWVuZGF0aW9uQWN0aW9uLkNsYXNzO1xuXHRcdHRoaXMudG9vbHRpcCA9IGxvY2FsaXplKCd1bmRvJywgXCJVbmRvXCIpO1xuXHRcdHRoaXMuZW5hYmxlZCA9IHRydWU7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0dGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbnNNYW5hZ2VtZW50U2VydmljZS50b2dnbGVHbG9iYWxJZ25vcmVkUmVjb21tZW5kYXRpb24odGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCwgZmFsc2UpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RDb25maWd1cmVSZWNvbW1lbmRlZEV4dGVuc2lvbnNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0bGFiZWw6IHN0cmluZyxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByb3RlY3RlZCBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcm90ZWN0ZWQgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElKU09ORWRpdGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBqc29uRWRpdGluZ1NlcnZpY2U6IElKU09ORWRpdGluZ1NlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihpZCwgbGFiZWwpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG9wZW5FeHRlbnNpb25zRmlsZShleHRlbnNpb25zRmlsZVJlc291cmNlOiBVUkkpOiBQcm9taXNlPGFueT4ge1xuXHRcdHJldHVybiB0aGlzLmdldE9yQ3JlYXRlRXh0ZW5zaW9uc0ZpbGUoZXh0ZW5zaW9uc0ZpbGVSZXNvdXJjZSlcblx0XHRcdC50aGVuKCh7IGNyZWF0ZWQsIGNvbnRlbnQgfSkgPT5cblx0XHRcdFx0dGhpcy5nZXRTZWxlY3Rpb25Qb3NpdGlvbihjb250ZW50LCBleHRlbnNpb25zRmlsZVJlc291cmNlLCBbJ3JlY29tbWVuZGF0aW9ucyddKVxuXHRcdFx0XHRcdC50aGVuKHNlbGVjdGlvbiA9PiB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdFx0XHRyZXNvdXJjZTogZXh0ZW5zaW9uc0ZpbGVSZXNvdXJjZSxcblx0XHRcdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0cGlubmVkOiBjcmVhdGVkLFxuXHRcdFx0XHRcdFx0XHRzZWxlY3Rpb25cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdGVycm9yID0+IFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihsb2NhbGl6ZSgnT3BlbkV4dGVuc2lvbnNGaWxlLmZhaWxlZCcsIFwiVW5hYmxlIHRvIGNyZWF0ZSAnZXh0ZW5zaW9ucy5qc29uJyBmaWxlIGluc2lkZSB0aGUgJy52c2NvZGUnIGZvbGRlciAoezB9KS5cIiwgZXJyb3IpKSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG9wZW5Xb3Jrc3BhY2VDb25maWd1cmF0aW9uRmlsZSh3b3Jrc3BhY2VDb25maWd1cmF0aW9uRmlsZTogVVJJKTogUHJvbWlzZTxhbnk+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRPclVwZGF0ZVdvcmtzcGFjZUNvbmZpZ3VyYXRpb25GaWxlKHdvcmtzcGFjZUNvbmZpZ3VyYXRpb25GaWxlKVxuXHRcdFx0LnRoZW4oY29udGVudCA9PiB0aGlzLmdldFNlbGVjdGlvblBvc2l0aW9uKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgY29udGVudC5yZXNvdXJjZSwgWydleHRlbnNpb25zJywgJ3JlY29tbWVuZGF0aW9ucyddKSlcblx0XHRcdC50aGVuKHNlbGVjdGlvbiA9PiB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlOiB3b3Jrc3BhY2VDb25maWd1cmF0aW9uRmlsZSxcblx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdHNlbGVjdGlvbixcblx0XHRcdFx0XHRmb3JjZVJlbG9hZDogdHJ1ZSAvLyBiZWNhdXNlIGNvbnRlbnQgaGFzIGNoYW5nZWRcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRPclVwZGF0ZVdvcmtzcGFjZUNvbmZpZ3VyYXRpb25GaWxlKHdvcmtzcGFjZUNvbmZpZ3VyYXRpb25GaWxlOiBVUkkpOiBQcm9taXNlPElGaWxlQ29udGVudD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh3b3Jrc3BhY2VDb25maWd1cmF0aW9uRmlsZSkpXG5cdFx0XHQudGhlbihjb250ZW50ID0+IHtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlUmVjb21tZW5kYXRpb25zID0gPElFeHRlbnNpb25zQ29uZmlnQ29udGVudD5qc29uLnBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSlbJ2V4dGVuc2lvbnMnXTtcblx0XHRcdFx0aWYgKCF3b3Jrc3BhY2VSZWNvbW1lbmRhdGlvbnMgfHwgIXdvcmtzcGFjZVJlY29tbWVuZGF0aW9ucy5yZWNvbW1lbmRhdGlvbnMpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5qc29uRWRpdGluZ1NlcnZpY2Uud3JpdGUod29ya3NwYWNlQ29uZmlndXJhdGlvbkZpbGUsIFt7IHBhdGg6IFsnZXh0ZW5zaW9ucyddLCB2YWx1ZTogeyByZWNvbW1lbmRhdGlvbnM6IFtdIH0gfV0sIHRydWUpXG5cdFx0XHRcdFx0XHQudGhlbigoKSA9PiB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHdvcmtzcGFjZUNvbmZpZ3VyYXRpb25GaWxlKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGNvbnRlbnQ7XG5cdFx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U2VsZWN0aW9uUG9zaXRpb24oY29udGVudDogc3RyaW5nLCByZXNvdXJjZTogVVJJLCBwYXRoOiBqc29uLkpTT05QYXRoKTogUHJvbWlzZTxJVGV4dEVkaXRvclNlbGVjdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHRyZWUgPSBqc29uLnBhcnNlVHJlZShjb250ZW50KTtcblx0XHRjb25zdCBub2RlID0ganNvbi5maW5kTm9kZUF0TG9jYXRpb24odHJlZSwgcGF0aCk7XG5cdFx0aWYgKG5vZGUgJiYgbm9kZS5wYXJlbnQgJiYgbm9kZS5wYXJlbnQuY2hpbGRyZW4pIHtcblx0XHRcdGNvbnN0IHJlY29tbWVuZGF0aW9uc1ZhbHVlTm9kZSA9IG5vZGUucGFyZW50LmNoaWxkcmVuWzFdO1xuXHRcdFx0Y29uc3QgbGFzdEV4dGVuc2lvbk5vZGUgPSByZWNvbW1lbmRhdGlvbnNWYWx1ZU5vZGUuY2hpbGRyZW4gJiYgcmVjb21tZW5kYXRpb25zVmFsdWVOb2RlLmNoaWxkcmVuLmxlbmd0aCA/IHJlY29tbWVuZGF0aW9uc1ZhbHVlTm9kZS5jaGlsZHJlbltyZWNvbW1lbmRhdGlvbnNWYWx1ZU5vZGUuY2hpbGRyZW4ubGVuZ3RoIC0gMV0gOiBudWxsO1xuXHRcdFx0Y29uc3Qgb2Zmc2V0ID0gbGFzdEV4dGVuc2lvbk5vZGUgPyBsYXN0RXh0ZW5zaW9uTm9kZS5vZmZzZXQgKyBsYXN0RXh0ZW5zaW9uTm9kZS5sZW5ndGggOiByZWNvbW1lbmRhdGlvbnNWYWx1ZU5vZGUub2Zmc2V0ICsgMTtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy50ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UocmVzb3VyY2UpKVxuXHRcdFx0XHQudGhlbihyZWZlcmVuY2UgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHBvc2l0aW9uID0gcmVmZXJlbmNlLm9iamVjdC50ZXh0RWRpdG9yTW9kZWwuZ2V0UG9zaXRpb25BdChvZmZzZXQpO1xuXHRcdFx0XHRcdHJlZmVyZW5jZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiBwb3NpdGlvbi5jb2x1bW4sXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiBwb3NpdGlvbi5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiBwb3NpdGlvbi5jb2x1bW4sXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0T3JDcmVhdGVFeHRlbnNpb25zRmlsZShleHRlbnNpb25zRmlsZVJlc291cmNlOiBVUkkpOiBQcm9taXNlPHsgY3JlYXRlZDogYm9vbGVhbjsgZXh0ZW5zaW9uc0ZpbGVSZXNvdXJjZTogVVJJOyBjb250ZW50OiBzdHJpbmcgfT4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShleHRlbnNpb25zRmlsZVJlc291cmNlKSkudGhlbihjb250ZW50ID0+IHtcblx0XHRcdHJldHVybiB7IGNyZWF0ZWQ6IGZhbHNlLCBleHRlbnNpb25zRmlsZVJlc291cmNlLCBjb250ZW50OiBjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkgfTtcblx0XHR9LCBlcnIgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMudGV4dEZpbGVTZXJ2aWNlLndyaXRlKGV4dGVuc2lvbnNGaWxlUmVzb3VyY2UsIEV4dGVuc2lvbnNDb25maWd1cmF0aW9uSW5pdGlhbENvbnRlbnQpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4geyBjcmVhdGVkOiB0cnVlLCBleHRlbnNpb25zRmlsZVJlc291cmNlLCBjb250ZW50OiBFeHRlbnNpb25zQ29uZmlndXJhdGlvbkluaXRpYWxDb250ZW50IH07XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ29uZmlndXJlV29ya3NwYWNlUmVjb21tZW5kZWRFeHRlbnNpb25zQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RDb25maWd1cmVSZWNvbW1lbmRlZEV4dGVuc2lvbnNBY3Rpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb24uY29uZmlndXJlV29ya3NwYWNlUmVjb21tZW5kZWRFeHRlbnNpb25zJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2NvbmZpZ3VyZVdvcmtzcGFjZVJlY29tbWVuZGVkRXh0ZW5zaW9ucycsIFwiQ29uZmlndXJlIFJlY29tbWVuZGVkIEV4dGVuc2lvbnMgKFdvcmtzcGFjZSlcIik7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRsYWJlbDogc3RyaW5nLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVRleHRGaWxlU2VydmljZSB0ZXh0RmlsZVNlcnZpY2U6IElUZXh0RmlsZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUpTT05FZGl0aW5nU2VydmljZSBqc29uRWRpdGluZ1NlcnZpY2U6IElKU09ORWRpdGluZ1NlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHRleHRNb2RlbFJlc29sdmVyU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoaWQsIGxhYmVsLCBjb250ZXh0U2VydmljZSwgZmlsZVNlcnZpY2UsIHRleHRGaWxlU2VydmljZSwgZWRpdG9yU2VydmljZSwganNvbkVkaXRpbmdTZXJ2aWNlLCB0ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3JrYmVuY2hTdGF0ZSgoKSA9PiB0aGlzLnVwZGF0ZSgpLCB0aGlzKSk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHN3aXRjaCAodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpKSB7XG5cdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLkZPTERFUjpcblx0XHRcdFx0cmV0dXJuIHRoaXMub3BlbkV4dGVuc2lvbnNGaWxlKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVyc1swXS50b1Jlc291cmNlKEVYVEVOU0lPTlNfQ09ORklHKSk7XG5cdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRTpcblx0XHRcdFx0cmV0dXJuIHRoaXMub3BlbldvcmtzcGFjZUNvbmZpZ3VyYXRpb25GaWxlKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuY29uZmlndXJhdGlvbiEpO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpZ3VyZVdvcmtzcGFjZUZvbGRlclJlY29tbWVuZGVkRXh0ZW5zaW9uc0FjdGlvbiBleHRlbmRzIEFic3RyYWN0Q29uZmlndXJlUmVjb21tZW5kZWRFeHRlbnNpb25zQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmNvbmZpZ3VyZVdvcmtzcGFjZUZvbGRlclJlY29tbWVuZGVkRXh0ZW5zaW9ucyc7XG5cdHN0YXRpYyByZWFkb25seSBMQUJFTCA9IGxvY2FsaXplKCdjb25maWd1cmVXb3Jrc3BhY2VGb2xkZXJSZWNvbW1lbmRlZEV4dGVuc2lvbnMnLCBcIkNvbmZpZ3VyZSBSZWNvbW1lbmRlZCBFeHRlbnNpb25zIChXb3Jrc3BhY2UgRm9sZGVyKVwiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogc3RyaW5nLFxuXHRcdGxhYmVsOiBzdHJpbmcsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHRleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJSlNPTkVkaXRpbmdTZXJ2aWNlIGpzb25FZGl0aW5nU2VydmljZTogSUpTT05FZGl0aW5nU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgdGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlOiBJVGV4dE1vZGVsU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihpZCwgbGFiZWwsIGNvbnRleHRTZXJ2aWNlLCBmaWxlU2VydmljZSwgdGV4dEZpbGVTZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlLCBqc29uRWRpdGluZ1NlcnZpY2UsIHRleHRNb2RlbFJlc29sdmVyU2VydmljZSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgZm9sZGVyQ291bnQgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubGVuZ3RoO1xuXHRcdGNvbnN0IHBpY2tGb2xkZXJQcm9taXNlID0gZm9sZGVyQ291bnQgPT09IDEgPyBQcm9taXNlLnJlc29sdmUodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdKSA6IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8SVdvcmtzcGFjZUZvbGRlcj4oUElDS19XT1JLU1BBQ0VfRk9MREVSX0NPTU1BTkRfSUQpO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUocGlja0ZvbGRlclByb21pc2UpXG5cdFx0XHQudGhlbih3b3Jrc3BhY2VGb2xkZXIgPT4ge1xuXHRcdFx0XHRpZiAod29ya3NwYWNlRm9sZGVyKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMub3BlbkV4dGVuc2lvbnNGaWxlKHdvcmtzcGFjZUZvbGRlci50b1Jlc291cmNlKEVYVEVOU0lPTlNfQ09ORklHKSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9KTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRXh0ZW5zaW9uU3RhdHVzTGFiZWxBY3Rpb24gZXh0ZW5kcyBBY3Rpb24gaW1wbGVtZW50cyBJRXh0ZW5zaW9uQ29udGFpbmVyIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBFTkFCTEVEX0NMQVNTID0gYCR7RXh0ZW5zaW9uQWN0aW9uLlRFWFRfQUNUSU9OX0NMQVNTfSBleHRlbnNpb24tc3RhdHVzLWxhYmVsYDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgRElTQUJMRURfQ0xBU1MgPSBgJHt0aGlzLkVOQUJMRURfQ0xBU1N9IGhpZGVgO1xuXG5cdHByaXZhdGUgaW5pdGlhbFN0YXR1czogRXh0ZW5zaW9uU3RhdGUgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBzdGF0dXM6IEV4dGVuc2lvblN0YXRlIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgdmVyc2lvbjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgZW5hYmxlbWVudFN0YXRlOiBFbmFibGVtZW50U3RhdGUgfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIF9leHRlbnNpb246IElFeHRlbnNpb24gfCBudWxsID0gbnVsbDtcblx0Z2V0IGV4dGVuc2lvbigpOiBJRXh0ZW5zaW9uIHwgbnVsbCB7IHJldHVybiB0aGlzLl9leHRlbnNpb247IH1cblx0c2V0IGV4dGVuc2lvbihleHRlbnNpb246IElFeHRlbnNpb24gfCBudWxsKSB7XG5cdFx0aWYgKCEodGhpcy5fZXh0ZW5zaW9uICYmIGV4dGVuc2lvbiAmJiBhcmVTYW1lRXh0ZW5zaW9ucyh0aGlzLl9leHRlbnNpb24uaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKSkge1xuXHRcdFx0Ly8gRGlmZmVyZW50IGV4dGVuc2lvbi4gUmVzZXRcblx0XHRcdHRoaXMuaW5pdGlhbFN0YXR1cyA9IG51bGw7XG5cdFx0XHR0aGlzLnN0YXR1cyA9IG51bGw7XG5cdFx0XHR0aGlzLmVuYWJsZW1lbnRTdGF0ZSA9IG51bGw7XG5cdFx0fVxuXHRcdHRoaXMuX2V4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoJ2V4dGVuc2lvbnMuYWN0aW9uLnN0YXR1c0xhYmVsJywgJycsIEV4dGVuc2lvblN0YXR1c0xhYmVsQWN0aW9uLkRJU0FCTEVEX0NMQVNTLCBmYWxzZSk7XG5cdH1cblxuXHR1cGRhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLmNvbXB1dGVMYWJlbCgpO1xuXHRcdHRoaXMubGFiZWwgPSBsYWJlbCB8fCAnJztcblx0XHR0aGlzLmNsYXNzID0gbGFiZWwgPyBFeHRlbnNpb25TdGF0dXNMYWJlbEFjdGlvbi5FTkFCTEVEX0NMQVNTIDogRXh0ZW5zaW9uU3RhdHVzTGFiZWxBY3Rpb24uRElTQUJMRURfQ0xBU1M7XG5cdH1cblxuXHRwcml2YXRlIGNvbXB1dGVMYWJlbCgpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50U3RhdHVzID0gdGhpcy5zdGF0dXM7XG5cdFx0Y29uc3QgY3VycmVudFZlcnNpb24gPSB0aGlzLnZlcnNpb247XG5cdFx0Y29uc3QgY3VycmVudEVuYWJsZW1lbnRTdGF0ZSA9IHRoaXMuZW5hYmxlbWVudFN0YXRlO1xuXHRcdHRoaXMuc3RhdHVzID0gdGhpcy5leHRlbnNpb24uc3RhdGU7XG5cdFx0dGhpcy52ZXJzaW9uID0gdGhpcy5leHRlbnNpb24udmVyc2lvbjtcblx0XHRpZiAodGhpcy5pbml0aWFsU3RhdHVzID09PSBudWxsKSB7XG5cdFx0XHR0aGlzLmluaXRpYWxTdGF0dXMgPSB0aGlzLnN0YXR1cztcblx0XHR9XG5cdFx0dGhpcy5lbmFibGVtZW50U3RhdGUgPSB0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGU7XG5cblx0XHRjb25zdCBjYW5BZGRFeHRlbnNpb24gPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBydW5uaW5nRXh0ZW5zaW9uID0gdGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMuZmlsdGVyKGUgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZDogZS5pZGVudGlmaWVyLnZhbHVlLCB1dWlkOiBlLnV1aWQgfSwgdGhpcy5leHRlbnNpb24hLmlkZW50aWZpZXIpKVswXTtcblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbiEubG9jYWwpIHtcblx0XHRcdFx0aWYgKHJ1bm5pbmdFeHRlbnNpb24gJiYgdGhpcy5leHRlbnNpb24hLnZlcnNpb24gPT09IHJ1bm5pbmdFeHRlbnNpb24udmVyc2lvbikge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvblNlcnZpY2UuY2FuQWRkRXh0ZW5zaW9uKHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24odGhpcy5leHRlbnNpb24hLmxvY2FsKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fTtcblx0XHRjb25zdCBjYW5SZW1vdmVFeHRlbnNpb24gPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb24hLmxvY2FsKSB7XG5cdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvblNlcnZpY2UuZXh0ZW5zaW9ucy5ldmVyeShlID0+ICEoYXJlU2FtZUV4dGVuc2lvbnMoeyBpZDogZS5pZGVudGlmaWVyLnZhbHVlLCB1dWlkOiBlLnV1aWQgfSwgdGhpcy5leHRlbnNpb24hLmlkZW50aWZpZXIpICYmIHRoaXMuZXh0ZW5zaW9uIS5zZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UuZ2V0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcih0b0V4dGVuc2lvbihlKSkpKSkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLmV4dGVuc2lvblNlcnZpY2UuY2FuUmVtb3ZlRXh0ZW5zaW9uKHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24odGhpcy5leHRlbnNpb24hLmxvY2FsKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fTtcblxuXHRcdGlmIChjdXJyZW50U3RhdHVzICE9PSBudWxsKSB7XG5cdFx0XHRpZiAoY3VycmVudFN0YXR1cyA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGluZyAmJiB0aGlzLnN0YXR1cyA9PT0gRXh0ZW5zaW9uU3RhdGUuSW5zdGFsbGVkKSB7XG5cdFx0XHRcdGlmICh0aGlzLmluaXRpYWxTdGF0dXMgPT09IEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGVkICYmIGNhbkFkZEV4dGVuc2lvbigpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdpbnN0YWxsZWQnLCBcIkluc3RhbGxlZFwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5pbml0aWFsU3RhdHVzID09PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWQgJiYgdGhpcy52ZXJzaW9uICE9PSBjdXJyZW50VmVyc2lvbiAmJiBjYW5BZGRFeHRlbnNpb24oKSkge1xuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgndXBkYXRlZCcsIFwiVXBkYXRlZFwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblx0XHRcdGlmIChjdXJyZW50U3RhdHVzID09PSBFeHRlbnNpb25TdGF0ZS5Vbmluc3RhbGxpbmcgJiYgdGhpcy5zdGF0dXMgPT09IEV4dGVuc2lvblN0YXRlLlVuaW5zdGFsbGVkKSB7XG5cdFx0XHRcdHRoaXMuaW5pdGlhbFN0YXR1cyA9IHRoaXMuc3RhdHVzO1xuXHRcdFx0XHRyZXR1cm4gY2FuUmVtb3ZlRXh0ZW5zaW9uKCkgPyBsb2NhbGl6ZSgndW5pbnN0YWxsZWQnLCBcIlVuaW5zdGFsbGVkXCIpIDogbnVsbDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoY3VycmVudEVuYWJsZW1lbnRTdGF0ZSAhPT0gbnVsbCkge1xuXHRcdFx0Y29uc3QgY3VycmVudGx5RW5hYmxlZCA9IHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkRW5hYmxlbWVudFN0YXRlKGN1cnJlbnRFbmFibGVtZW50U3RhdGUpO1xuXHRcdFx0Y29uc3QgZW5hYmxlZCA9IHRoaXMuZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkRW5hYmxlbWVudFN0YXRlKHRoaXMuZW5hYmxlbWVudFN0YXRlKTtcblx0XHRcdGlmICghY3VycmVudGx5RW5hYmxlZCAmJiBlbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybiBjYW5BZGRFeHRlbnNpb24oKSA/IGxvY2FsaXplKCdlbmFibGVkJywgXCJFbmFibGVkXCIpIDogbnVsbDtcblx0XHRcdH1cblx0XHRcdGlmIChjdXJyZW50bHlFbmFibGVkICYmICFlbmFibGVkKSB7XG5cdFx0XHRcdHJldHVybiBjYW5SZW1vdmVFeHRlbnNpb24oKSA/IGxvY2FsaXplKCdkaXNhYmxlZCcsIFwiRGlzYWJsZWRcIikgOiBudWxsO1xuXHRcdFx0fVxuXG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRvdmVycmlkZSBydW4oKTogUHJvbWlzZTxhbnk+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxufVxuXG5leHBvcnQgY2xhc3MgVG9nZ2xlU3luY0V4dGVuc2lvbkFjdGlvbiBleHRlbmRzIERyb3BEb3duRXh0ZW5zaW9uQWN0aW9uIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBJR05PUkVEX1NZTkNfQ0xBU1MgPSBgJHtFeHRlbnNpb25BY3Rpb24uSUNPTl9BQ1RJT05fQ0xBU1N9IGV4dGVuc2lvbi1zeW5jICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKHN5bmNJZ25vcmVkSWNvbil9YDtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU1lOQ19DTEFTUyA9IGAke3RoaXMuSUNPTl9BQ1RJT05fQ0xBU1N9IGV4dGVuc2lvbi1zeW5jICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKHN5bmNFbmFibGVkSWNvbil9YDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2U6IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2U6IElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zLnN5bmMnLCAnJywgVG9nZ2xlU3luY0V4dGVuc2lvbkFjdGlvbi5TWU5DX0NMQVNTLCBmYWxzZSwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiBlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdzZXR0aW5nc1N5bmMuaWdub3JlZEV4dGVuc2lvbnMnKSkoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlRW5hYmxlbWVudCgoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVuYWJsZWQgPSAhIXRoaXMuZXh0ZW5zaW9uICYmIHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKCkgJiYgdGhpcy5leHRlbnNpb24uc3RhdGUgPT09IEV4dGVuc2lvblN0YXRlLkluc3RhbGxlZDtcblx0XHRpZiAodGhpcy5leHRlbnNpb24pIHtcblx0XHRcdGNvbnN0IGlzSWdub3JlZCA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaXNFeHRlbnNpb25JZ25vcmVkVG9TeW5jKHRoaXMuZXh0ZW5zaW9uKTtcblx0XHRcdHRoaXMuY2xhc3MgPSBpc0lnbm9yZWQgPyBUb2dnbGVTeW5jRXh0ZW5zaW9uQWN0aW9uLklHTk9SRURfU1lOQ19DTEFTUyA6IFRvZ2dsZVN5bmNFeHRlbnNpb25BY3Rpb24uU1lOQ19DTEFTUztcblx0XHRcdHRoaXMudG9vbHRpcCA9IGlzSWdub3JlZCA/IGxvY2FsaXplKCdpZ25vcmVkJywgXCJUaGlzIGV4dGVuc2lvbiBpcyBpZ25vcmVkIGR1cmluZyBzeW5jXCIpIDogbG9jYWxpemUoJ3N5bmNlZCcsIFwiVGhpcyBleHRlbnNpb24gaXMgc3luY2VkXCIpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdHJldHVybiBzdXBlci5ydW4oW1xuXHRcdFx0W1xuXHRcdFx0XHRuZXcgQWN0aW9uKFxuXHRcdFx0XHRcdCdleHRlbnNpb25zLnN5bmNpZ25vcmUnLFxuXHRcdFx0XHRcdHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaXNFeHRlbnNpb25JZ25vcmVkVG9TeW5jKHRoaXMuZXh0ZW5zaW9uISkgPyBsb2NhbGl6ZSgnc3luYycsIFwiU3luYyB0aGlzIGV4dGVuc2lvblwiKSA6IGxvY2FsaXplKCdkbyBub3Qgc3luYycsIFwiRG8gbm90IHN5bmMgdGhpcyBleHRlbnNpb25cIilcblx0XHRcdFx0XHQsIHVuZGVmaW5lZCwgdHJ1ZSwgKCkgPT4gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS50b2dnbGVFeHRlbnNpb25JZ25vcmVkVG9TeW5jKHRoaXMuZXh0ZW5zaW9uISkpXG5cdFx0XHRdXG5cdFx0XSk7XG5cdH1cbn1cblxuZXhwb3J0IHR5cGUgRXh0ZW5zaW9uU3RhdHVzID0geyByZWFkb25seSBtZXNzYWdlOiBJTWFya2Rvd25TdHJpbmc7IHJlYWRvbmx5IGljb24/OiBUaGVtZUljb24gfTtcblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvblN0YXR1c0FjdGlvbiBleHRlbmRzIEV4dGVuc2lvbkFjdGlvbiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgQ0xBU1MgPSBgJHtFeHRlbnNpb25BY3Rpb24uSUNPTl9BQ1RJT05fQ0xBU1N9IGV4dGVuc2lvbi1zdGF0dXNgO1xuXG5cdHVwZGF0ZVdoZW5Db3VudGVyRXh0ZW5zaW9uQ2hhbmdlczogYm9vbGVhbiA9IHRydWU7XG5cblx0cHJpdmF0ZSBfc3RhdHVzOiBFeHRlbnNpb25TdGF0dXNbXSA9IFtdO1xuXHRnZXQgc3RhdHVzKCk6IEV4dGVuc2lvblN0YXR1c1tdIHsgcmV0dXJuIHRoaXMuX3N0YXR1czsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU3RhdHVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3RhdHVzID0gdGhpcy5fb25EaWRDaGFuZ2VTdGF0dXMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSB1cGRhdGVUaHJvdHRsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVyKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZTogSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2U6IElBbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25GZWF0dXJlc01hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uRmVhdHVyZXNNYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCdleHRlbnNpb25zLnN0YXR1cycsICcnLCBgJHtFeHRlbnNpb25TdGF0dXNBY3Rpb24uQ0xBU1N9IGhpZGVgLCBmYWxzZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5sYWJlbFNlcnZpY2Uub25EaWRDaGFuZ2VGb3JtYXR0ZXJzKCgpID0+IHRoaXMudXBkYXRlKCksIHRoaXMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvblNlcnZpY2Uub25EaWRDaGFuZ2VFeHRlbnNpb25zKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2Uub25EaWRDaGFuZ2VBY2Nlc3NEYXRhKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhbGxvd2VkRXh0ZW5zaW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VBbGxvd2VkRXh0ZW5zaW9uc0NvbmZpZ1ZhbHVlKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKEF1dG9VcGRhdGVDb25maWd1cmF0aW9uS2V5KSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0dXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMucmVjb21wdXRlU3RhdHVzKCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVjb21wdXRlcyB0aGUgc3RhdHVzIGFuZCByZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdoZW4gdGhlXG5cdCAqIGNvbXB1dGF0aW9uIGlzIGRvbmUuIFVzZSB0aGlzIHdoZW4gY2FsbGVycyBuZWVkIHRvIGF3YWl0IHRpbWUtc2Vuc2l0aXZlXG5cdCAqIHN0YXR1cyBjb250ZW50IChlLmcuIHRoZSBkZWxheWVkIGF1dG8tdXBkYXRlIG1lc3NhZ2UpIGJlZm9yZSByZWFkaW5nIGl0LlxuXHQgKi9cblx0cmVjb21wdXRlU3RhdHVzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnVwZGF0ZVRocm90dGxlci5xdWV1ZSgoKSA9PiB0aGlzLmNvbXB1dGVBbmRVcGRhdGVTdGF0dXMoKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbXB1dGVBbmRVcGRhdGVTdGF0dXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy51cGRhdGVTdGF0dXModW5kZWZpbmVkLCB0cnVlKTtcblx0XHR0aGlzLmVuYWJsZWQgPSBmYWxzZTtcblxuXHRcdGlmICghdGhpcy5leHRlbnNpb24pIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb24uaXNNYWxpY2lvdXMpIHtcblx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogd2FybmluZ0ljb24sIG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnbWFsaWNpb3VzIHRvb2x0aXAnLCBcIlRoaXMgZXh0ZW5zaW9uIHdhcyByZXBvcnRlZCB0byBiZSBwcm9ibGVtYXRpYy5cIikpIH0sIHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuVW5pbnN0YWxsZWQgJiYgdGhpcy5leHRlbnNpb24uZ2FsbGVyeSAmJiAhdGhpcy5leHRlbnNpb24uZ2FsbGVyeS5pc1NpZ25lZCAmJiBzaG91bGRSZXF1aXJlUmVwb3NpdG9yeVNpZ25hdHVyZUZvcih0aGlzLmV4dGVuc2lvbi5wcml2YXRlLCBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlNYW5pZmVzdFNlcnZpY2UuZ2V0RXh0ZW5zaW9uR2FsbGVyeU1hbmlmZXN0KCkpKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IGljb246IHdhcm5pbmdJY29uLCBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ25vdCBzaWduZWQgdG9vbHRpcCcsIFwiVGhpcyBleHRlbnNpb24gaXMgbm90IHNpZ25lZCBieSB0aGUgRXh0ZW5zaW9uIE1hcmtldHBsYWNlLlwiKSkgfSwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mbykge1xuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mby5leHRlbnNpb24pIHtcblx0XHRcdFx0Y29uc3QgbGluayA9IGBbJHt0aGlzLmV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8uZXh0ZW5zaW9uLmRpc3BsYXlOYW1lfV0oJHtjcmVhdGVDb21tYW5kVXJpKCdleHRlbnNpb24ub3BlbicsIHRoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mby5leHRlbnNpb24uaWQpfSlgO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IGljb246IHdhcm5pbmdJY29uLCBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2RlcHJlY2F0ZWQgd2l0aCBhbHRlcm5hdGUgZXh0ZW5zaW9uIHRvb2x0aXAnLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIGRlcHJlY2F0ZWQuIFVzZSB0aGUgezB9IGV4dGVuc2lvbiBpbnN0ZWFkLlwiLCBsaW5rKSkgfSwgdHJ1ZSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuZXh0ZW5zaW9uLmRlcHJlY2F0aW9uSW5mby5zZXR0aW5ncykge1xuXHRcdFx0XHRjb25zdCBsaW5rID0gYFske2xvY2FsaXplKCdzZXR0aW5ncycsIFwic2V0dGluZ3NcIil9XSgke2NyZWF0ZUNvbW1hbmRVcmkoJ3dvcmtiZW5jaC5hY3Rpb24ub3BlblNldHRpbmdzJywgdGhpcy5leHRlbnNpb24uZGVwcmVjYXRpb25JbmZvLnNldHRpbmdzLm1hcChzZXR0aW5nID0+IGBAaWQ6JHtzZXR0aW5nfWApLmpvaW4oJyAnKSl9fSlgO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IGljb246IHdhcm5pbmdJY29uLCBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2RlcHJlY2F0ZWQgd2l0aCBhbHRlcm5hdGUgc2V0dGluZ3MgdG9vbHRpcCcsIFwiVGhpcyBleHRlbnNpb24gaXMgZGVwcmVjYXRlZCBhcyB0aGlzIGZ1bmN0aW9uYWxpdHkgaXMgbm93IGJ1aWx0LWluIHRvIFZTIENvZGUuIENvbmZpZ3VyZSB0aGVzZSB7MH0gdG8gdXNlIHRoaXMgZnVuY3Rpb25hbGl0eS5cIiwgbGluaykpIH0sIHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnZGVwcmVjYXRlZCB0b29sdGlwJywgXCJUaGlzIGV4dGVuc2lvbiBpcyBkZXByZWNhdGVkIGFzIGl0IGlzIG5vIGxvbmdlciBiZWluZyBtYWludGFpbmVkLlwiKSk7XG5cdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8uYWRkaXRpb25hbEluZm8pIHtcblx0XHRcdFx0XHRtZXNzYWdlLmFwcGVuZE1hcmtkb3duKGAgJHt0aGlzLmV4dGVuc2lvbi5kZXByZWNhdGlvbkluZm8uYWRkaXRpb25hbEluZm99YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBpY29uOiB3YXJuaW5nSWNvbiwgbWVzc2FnZSB9LCB0cnVlKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb24ubWlzc2luZ0Zyb21HYWxsZXJ5KSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IGljb246IHdhcm5pbmdJY29uLCBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ21pc3NpbmcgZnJvbSBnYWxsZXJ5IHRvb2x0aXAnLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIG5vIGxvbmdlciBhdmFpbGFibGUgb24gdGhlIEV4dGVuc2lvbiBNYXJrZXRwbGFjZS5cIikpIH0sIHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmNhblNldExhbmd1YWdlKHRoaXMuZXh0ZW5zaW9uKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5vdXRkYXRlZCkge1xuXHRcdFx0bGV0IGhhc0NvbnNlbnRXYXJuaW5nID0gZmFsc2U7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gYXdhaXQgdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5zaG91bGRSZXF1aXJlQ29uc2VudFRvVXBkYXRlKHRoaXMuZXh0ZW5zaW9uKTtcblx0XHRcdGlmIChtZXNzYWdlKSB7XG5cdFx0XHRcdGhhc0NvbnNlbnRXYXJuaW5nID0gdHJ1ZTtcblx0XHRcdFx0Y29uc3QgbWFya2Rvd24gPSBuZXcgTWFya2Rvd25TdHJpbmcoKTtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCR7bWVzc2FnZX0gYCk7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKFxuXHRcdFx0XHRcdGxvY2FsaXplKCdhdXRvIHVwZGF0ZSBtZXNzYWdlJywgXCJQbGVhc2UgW3JldmlldyB0aGUgZXh0ZW5zaW9uXSh7MH0pIGFuZCB1cGRhdGUgaXQgbWFudWFsbHkuXCIsXG5cdFx0XHRcdFx0XHR0aGlzLmV4dGVuc2lvbi5oYXNDaGFuZ2Vsb2coKVxuXHRcdFx0XHRcdFx0XHQ/IGNyZWF0ZUNvbW1hbmRVcmkoJ2V4dGVuc2lvbi5vcGVuJywgdGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCwgRXh0ZW5zaW9uRWRpdG9yVGFiLkNoYW5nZWxvZykudG9TdHJpbmcoKVxuXHRcdFx0XHRcdFx0XHQ6IHRoaXMuZXh0ZW5zaW9uLnJlcG9zaXRvcnlcblx0XHRcdFx0XHRcdFx0XHQ/IHRoaXMuZXh0ZW5zaW9uLnJlcG9zaXRvcnlcblx0XHRcdFx0XHRcdFx0XHQ6IGNyZWF0ZUNvbW1hbmRVcmkoJ2V4dGVuc2lvbi5vcGVuJywgdGhpcy5leHRlbnNpb24uaWRlbnRpZmllci5pZCkudG9TdHJpbmcoKVxuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IGljb246IHdhcm5pbmdJY29uLCBtZXNzYWdlOiBtYXJrZG93biB9LCB0cnVlKTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmlzQXV0b1VwZGF0ZURlbGF5ZWQodGhpcy5leHRlbnNpb24pKSB7XG5cdFx0XHRcdGNvbnN0IGRlbGF5ID0gZnJvbU5vdyhEYXRlLm5vdygpIC0gdGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5nZXRBdXRvVXBkYXRlRGVsYXkoKSwgZmFsc2UsIHRydWUpO1xuXHRcdFx0XHRjb25zdCB1cGRhdGVBdCA9IGZyb21Ob3coRGF0ZS5ub3coKSArIHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuZ2V0QXV0b1VwZGF0ZURlbGF5UmVtYWluaW5nKHRoaXMuZXh0ZW5zaW9uKSwgZmFsc2UsIHRydWUpO1xuXHRcdFx0XHQvLyBEbyBub3Qgb3ZlcnJpZGUgdGhlIGhpZ2hlci1wcmlvcml0eSB3YXJuaW5nIGNsYXNzIHdpdGggdGhlIGluZm8gY2xhc3MuXG5cdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogaW5mb0ljb24sIG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYXV0b1VwZGF0ZURlbGF5ZWQnLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIG5vdCB1cGRhdGVkIHlldCBiZWNhdXNlIG5ldyB2ZXJzaW9ucyBhcmUgYXV0byB1cGRhdGVkIHswfSBhZnRlciB0aGV5IGFyZSBwdWJsaXNoZWQuIEl0IHdpbGwgYmUgYXV0byB1cGRhdGVkIHsxfS5cIiwgZGVsYXksIHVwZGF0ZUF0KSkgfSwgIWhhc0NvbnNlbnRXYXJuaW5nKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5leHRlbnNpb24uZ2FsbGVyeSAmJiB0aGlzLmV4dGVuc2lvbi5zdGF0ZSA9PT0gRXh0ZW5zaW9uU3RhdGUuVW5pbnN0YWxsZWQpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuY2FuSW5zdGFsbCh0aGlzLmV4dGVuc2lvbik7XG5cdFx0XHRpZiAocmVzdWx0ICE9PSB0cnVlKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogd2FybmluZ0ljb24sIG1lc3NhZ2U6IHJlc3VsdCB9LCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGhpcy5leHRlbnNpb24ubG9jYWwgfHxcblx0XHRcdCF0aGlzLmV4dGVuc2lvbi5zZXJ2ZXIgfHxcblx0XHRcdHRoaXMuZXh0ZW5zaW9uLnN0YXRlICE9PSBFeHRlbnNpb25TdGF0ZS5JbnN0YWxsZWRcblx0XHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBFeHRlbnNpb24gaXMgZGlzYWJsZWQgYnkgYWxsb3dlZCBsaXN0XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlBbGxvd2xpc3QpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLmlzQWxsb3dlZCh0aGlzLmV4dGVuc2lvbi5sb2NhbCk7XG5cdFx0XHRpZiAocmVzdWx0ICE9PSB0cnVlKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogd2FybmluZ0ljb24sIG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnZGlzYWJsZWQgLSBub3QgYWxsb3dlZCcsIFwiVGhpcyBleHRlbnNpb24gaXMgZGlzYWJsZWQgYmVjYXVzZSB7MH1cIiwgcmVzdWx0LnZhbHVlKSkgfSwgdHJ1ZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBFeHRlbnNpb24gaXMgZGlzYWJsZWQgYnkgZW52aXJvbm1lbnRcblx0XHRpZiAodGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUVudmlyb25tZW50KSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnZGlzYWJsZWQgYnkgZW52aXJvbm1lbnQnLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIGRpc2FibGVkIGJ5IHRoZSBlbnZpcm9ubWVudC5cIikpIH0sIHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEV4dGVuc2lvbiBpcyBlbmFibGVkIGJ5IGVudmlyb25tZW50XG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRCeUVudmlyb25tZW50KSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnZW5hYmxlZCBieSBlbnZpcm9ubWVudCcsIFwiVGhpcyBleHRlbnNpb24gaXMgZW5hYmxlZCBiZWNhdXNlIGl0IGlzIHJlcXVpcmVkIGluIHRoZSBjdXJyZW50IGVudmlyb25tZW50LlwiKSkgfSwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRXh0ZW5zaW9uIGlzIGRpc2FibGVkIGJ5IHZpcnR1YWwgd29ya3NwYWNlXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlWaXJ0dWFsV29ya3NwYWNlKSB7XG5cdFx0XHRjb25zdCBkZXRhaWxzID0gZ2V0V29ya3NwYWNlU3VwcG9ydFR5cGVNZXNzYWdlKHRoaXMuZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0LmNhcGFiaWxpdGllcz8udmlydHVhbFdvcmtzcGFjZXMpO1xuXHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBpY29uOiBpbmZvSWNvbiwgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGRldGFpbHMgPyBlc2NhcGVNYXJrZG93blN5bnRheFRva2VucyhkZXRhaWxzKSA6IGxvY2FsaXplKCdkaXNhYmxlZCBiZWNhdXNlIG9mIHZpcnR1YWwgd29ya3NwYWNlJywgXCJUaGlzIGV4dGVuc2lvbiBoYXMgYmVlbiBkaXNhYmxlZCBiZWNhdXNlIGl0IGRvZXMgbm90IHN1cHBvcnQgdmlydHVhbCB3b3Jrc3BhY2VzLlwiKSkgfSwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gTGltaXRlZCBzdXBwb3J0IGluIFZpcnR1YWwgV29ya3NwYWNlXG5cdFx0aWYgKGlzVmlydHVhbFdvcmtzcGFjZSh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKSkge1xuXHRcdFx0Y29uc3QgdmlydHVhbFN1cHBvcnRUeXBlID0gdGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmdldEV4dGVuc2lvblZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0VHlwZSh0aGlzLmV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdCk7XG5cdFx0XHRjb25zdCBkZXRhaWxzID0gZ2V0V29ya3NwYWNlU3VwcG9ydFR5cGVNZXNzYWdlKHRoaXMuZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0LmNhcGFiaWxpdGllcz8udmlydHVhbFdvcmtzcGFjZXMpO1xuXHRcdFx0aWYgKHZpcnR1YWxTdXBwb3J0VHlwZSA9PT0gJ2xpbWl0ZWQnIHx8IGRldGFpbHMpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBpY29uOiB3YXJuaW5nSWNvbiwgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGRldGFpbHMgPyBlc2NhcGVNYXJrZG93blN5bnRheFRva2VucyhkZXRhaWxzKSA6IGxvY2FsaXplKCdleHRlbnNpb24gbGltaXRlZCBiZWNhdXNlIG9mIHZpcnR1YWwgd29ya3NwYWNlJywgXCJUaGlzIGV4dGVuc2lvbiBoYXMgbGltaXRlZCBmZWF0dXJlcyBiZWNhdXNlIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBpcyB2aXJ0dWFsLlwiKSkgfSwgdHJ1ZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBVbmlmaWNhdGlvblxuXHRcdGlmICh0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5VW5pZmljYXRpb24pIHtcblx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogaW5mb0ljb24sIG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnZXh0ZW5zaW9uIGRpc2FibGVkIGJlY2F1c2Ugb2YgdW5pZmljYXRpb24nLCBcIkFsbCBHaXRIdWIgQ29waWxvdCBmdW5jdGlvbmFsaXR5IGlzIG5vdyBiZWluZyBzZXJ2ZWQgZnJvbSB0aGUgR2l0SHViIENvcGlsb3QgQ2hhdCBleHRlbnNpb24uIFRvIHRlbXBvcmFyaWx5IG9wdCBvdXQgb2YgdGhpcyBleHRlbnNpb24gdW5pZmljYXRpb24sIHRvZ2dsZSB0aGUgezB9IHNldHRpbmcuXCIsICdgY2hhdC5leHRlbnNpb25VbmlmaWNhdGlvbi5lbmFibGVkYCcpKSB9LCB0cnVlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMud29ya3NwYWNlVHJ1c3RTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpICYmXG5cdFx0XHQvLyBFeHRlbnNpb24gaXMgZGlzYWJsZWQgYnkgdW50cnVzdGVkIHdvcmtzcGFjZVxuXHRcdFx0KHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlUcnVzdFJlcXVpcmVtZW50IHx8XG5cdFx0XHRcdC8vIEFsbCBkaXNhYmxlZCBkZXBlbmRlbmNpZXMgb2YgdGhlIGV4dGVuc2lvbiBhcmUgZGlzYWJsZWQgYnkgdW50cnVzdGVkIHdvcmtzcGFjZVxuXHRcdFx0XHQodGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUV4dGVuc2lvbkRlcGVuZGVuY3kgJiYgdGhpcy53b3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZS5nZXREZXBlbmRlbmNpZXNFbmFibGVtZW50U3RhdGVzKHRoaXMuZXh0ZW5zaW9uLmxvY2FsKS5ldmVyeSgoWywgZW5hYmxlbWVudFN0YXRlXSkgPT4gdGhpcy53b3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWRFbmFibGVtZW50U3RhdGUoZW5hYmxlbWVudFN0YXRlKSB8fCBlbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEJ5VHJ1c3RSZXF1aXJlbWVudCkpKSkge1xuXHRcdFx0dGhpcy5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHVudHJ1c3RlZERldGFpbHMgPSBnZXRXb3Jrc3BhY2VTdXBwb3J0VHlwZU1lc3NhZ2UodGhpcy5leHRlbnNpb24ubG9jYWwubWFuaWZlc3QuY2FwYWJpbGl0aWVzPy51bnRydXN0ZWRXb3Jrc3BhY2VzKTtcblx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogdHJ1c3RJY29uLCBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcodW50cnVzdGVkRGV0YWlscyA/IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKHVudHJ1c3RlZERldGFpbHMpIDogbG9jYWxpemUoJ2V4dGVuc2lvbiBkaXNhYmxlZCBiZWNhdXNlIG9mIHRydXN0IHJlcXVpcmVtZW50JywgXCJUaGlzIGV4dGVuc2lvbiBoYXMgYmVlbiBkaXNhYmxlZCBiZWNhdXNlIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBpcyBub3QgdHJ1c3RlZC5cIikpIH0sIHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIExpbWl0ZWQgc3VwcG9ydCBpbiBVbnRydXN0ZWQgV29ya3NwYWNlXG5cdFx0aWYgKHRoaXMud29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0RW5hYmxlZCgpICYmICF0aGlzLndvcmtzcGFjZVRydXN0U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSkge1xuXHRcdFx0Y29uc3QgdW50cnVzdGVkU3VwcG9ydFR5cGUgPSB0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UuZ2V0RXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydFR5cGUodGhpcy5leHRlbnNpb24ubG9jYWwubWFuaWZlc3QpO1xuXHRcdFx0Y29uc3QgdW50cnVzdGVkRGV0YWlscyA9IGdldFdvcmtzcGFjZVN1cHBvcnRUeXBlTWVzc2FnZSh0aGlzLmV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdC5jYXBhYmlsaXRpZXM/LnVudHJ1c3RlZFdvcmtzcGFjZXMpO1xuXHRcdFx0aWYgKHVudHJ1c3RlZFN1cHBvcnRUeXBlID09PSAnbGltaXRlZCcgfHwgdW50cnVzdGVkRGV0YWlscykge1xuXHRcdFx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IGljb246IHRydXN0SWNvbiwgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKHVudHJ1c3RlZERldGFpbHMgPyBlc2NhcGVNYXJrZG93blN5bnRheFRva2Vucyh1bnRydXN0ZWREZXRhaWxzKSA6IGxvY2FsaXplKCdleHRlbnNpb24gbGltaXRlZCBiZWNhdXNlIG9mIHRydXN0IHJlcXVpcmVtZW50JywgXCJUaGlzIGV4dGVuc2lvbiBoYXMgbGltaXRlZCBmZWF0dXJlcyBiZWNhdXNlIHRoZSBjdXJyZW50IHdvcmtzcGFjZSBpcyBub3QgdHJ1c3RlZC5cIikpIH0sIHRydWUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gRXh0ZW5zaW9uIGlzIGRpc2FibGVkIGJ5IGV4dGVuc2lvbiBraW5kXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkQnlFeHRlbnNpb25LaW5kKSB7XG5cdFx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaW5zdGFsbGVkLnNvbWUoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHRoaXMuZXh0ZW5zaW9uIS5pZGVudGlmaWVyKSAmJiBlLnNlcnZlciAhPT0gdGhpcy5leHRlbnNpb24hLnNlcnZlcikpIHtcblx0XHRcdFx0bGV0IG1lc3NhZ2U7XG5cdFx0XHRcdC8vIEV4dGVuc2lvbiBvbiBMb2NhbCBTZXJ2ZXJcblx0XHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyID09PSB0aGlzLmV4dGVuc2lvbi5zZXJ2ZXIpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLnByZWZlcnNFeGVjdXRlT25Xb3Jrc3BhY2UodGhpcy5leHRlbnNpb24ubG9jYWwubWFuaWZlc3QpKSB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcoYCR7bG9jYWxpemUoJ0luc3RhbGwgaW4gcmVtb3RlIHNlcnZlciB0byBlbmFibGUnLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIGRpc2FibGVkIGluIHRoaXMgd29ya3NwYWNlIGJlY2F1c2UgaXQgaXMgZGVmaW5lZCB0byBydW4gaW4gdGhlIFJlbW90ZSBFeHRlbnNpb24gSG9zdC4gUGxlYXNlIGluc3RhbGwgdGhlIGV4dGVuc2lvbiBpbiAnezB9JyB0byBlbmFibGUuXCIsIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5sYWJlbCl9IFske2xvY2FsaXplKCdsZWFybiBtb3JlJywgXCJMZWFybiBNb3JlXCIpfV0oaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vYXBpL2FkdmFuY2VkLXRvcGljcy9yZW1vdGUtZXh0ZW5zaW9ucyNhcmNoaXRlY3R1cmUtYW5kLWV4dGVuc2lvbi1raW5kcylgKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gRXh0ZW5zaW9uIG9uIFJlbW90ZSBTZXJ2ZXJcblx0XHRcdFx0ZWxzZSBpZiAodGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyID09PSB0aGlzLmV4dGVuc2lvbi5zZXJ2ZXIpIHtcblx0XHRcdFx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLnByZWZlcnNFeGVjdXRlT25VSSh0aGlzLmV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdCkpIHtcblx0XHRcdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0XHRcdFx0XHRtZXNzYWdlID0gbmV3IE1hcmtkb3duU3RyaW5nKGAke2xvY2FsaXplKCdJbnN0YWxsIGluIGxvY2FsIHNlcnZlciB0byBlbmFibGUnLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIGRpc2FibGVkIGluIHRoaXMgd29ya3NwYWNlIGJlY2F1c2UgaXQgaXMgZGVmaW5lZCB0byBydW4gaW4gdGhlIExvY2FsIEV4dGVuc2lvbiBIb3N0LiBQbGVhc2UgaW5zdGFsbCB0aGUgZXh0ZW5zaW9uIGxvY2FsbHkgdG8gZW5hYmxlLlwiLCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIubGFiZWwpfSBbJHtsb2NhbGl6ZSgnbGVhcm4gbW9yZScsIFwiTGVhcm4gTW9yZVwiKX1dKGh0dHBzOi8vY29kZS52aXN1YWxzdHVkaW8uY29tL2FwaS9hZHZhbmNlZC10b3BpY3MvcmVtb3RlLWV4dGVuc2lvbnMjYXJjaGl0ZWN0dXJlLWFuZC1leHRlbnNpb24ta2luZHMpYCk7XG5cdFx0XHRcdFx0XHR9IGVsc2UgaWYgKGlzV2ViKSB7XG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcoYCR7bG9jYWxpemUoJ0RlZmluZWQgdG8gcnVuIGluIGRlc2t0b3AnLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIGRpc2FibGVkIGJlY2F1c2UgaXQgaXMgZGVmaW5lZCB0byBydW4gb25seSBpbiB7MH0gZm9yIHRoZSBEZXNrdG9wLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKX0gWyR7bG9jYWxpemUoJ2xlYXJuIG1vcmUnLCBcIkxlYXJuIE1vcmVcIil9XShodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9hcGkvYWR2YW5jZWQtdG9waWNzL3JlbW90ZS1leHRlbnNpb25zI2FyY2hpdGVjdHVyZS1hbmQtZXh0ZW5zaW9uLWtpbmRzKWApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBFeHRlbnNpb24gb24gV2ViIFNlcnZlclxuXHRcdFx0XHRlbHNlIGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLndlYkV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uLnNlcnZlcikge1xuXHRcdFx0XHRcdG1lc3NhZ2UgPSBuZXcgTWFya2Rvd25TdHJpbmcoYCR7bG9jYWxpemUoJ0Nhbm5vdCBiZSBlbmFibGVkJywgXCJUaGlzIGV4dGVuc2lvbiBpcyBkaXNhYmxlZCBiZWNhdXNlIGl0IGlzIG5vdCBzdXBwb3J0ZWQgaW4gezB9IGZvciB0aGUgV2ViLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKX0gWyR7bG9jYWxpemUoJ2xlYXJuIG1vcmUnLCBcIkxlYXJuIE1vcmVcIil9XShodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9hcGkvYWR2YW5jZWQtdG9waWNzL3JlbW90ZS1leHRlbnNpb25zI2FyY2hpdGVjdHVyZS1hbmQtZXh0ZW5zaW9uLWtpbmRzKWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChtZXNzYWdlKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBpY29uOiB3YXJuaW5nSWNvbiwgbWVzc2FnZSB9LCB0cnVlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcih0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHRjb25zdCBmZWF0dXJlcyA9IFJlZ2lzdHJ5LmFzPElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5PihFeHRlbnNpb25zLkV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnkpLmdldEV4dGVuc2lvbkZlYXR1cmVzKCk7XG5cdFx0Zm9yIChjb25zdCBmZWF0dXJlIG9mIGZlYXR1cmVzKSB7XG5cdFx0XHRjb25zdCBzdGF0dXMgPSB0aGlzLmV4dGVuc2lvbkZlYXR1cmVzTWFuYWdlbWVudFNlcnZpY2UuZ2V0QWNjZXNzRGF0YShleHRlbnNpb25JZCwgZmVhdHVyZS5pZCk/LmN1cnJlbnQ/LnN0YXR1cztcblx0XHRcdGNvbnN0IG1hbmFnZUFjY2Vzc0xpbmsgPSBgWyR7bG9jYWxpemUoJ21hbmFnZSBhY2Nlc3MnLCAnTWFuYWdlIEFjY2VzcycpfV0oJHtjcmVhdGVDb21tYW5kVXJpKCdleHRlbnNpb24ub3BlbicsIHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsIEV4dGVuc2lvbkVkaXRvclRhYi5GZWF0dXJlcywgZmFsc2UsIGZlYXR1cmUuaWQpfSlgO1xuXHRcdFx0aWYgKHN0YXR1cz8uc2V2ZXJpdHkgPT09IFNldmVyaXR5LkVycm9yKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogZXJyb3JJY29uLCBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KHN0YXR1cy5tZXNzYWdlKS5hcHBlbmRNYXJrZG93bihgICR7bWFuYWdlQWNjZXNzTGlua31gKSB9LCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHN0YXR1cz8uc2V2ZXJpdHkgPT09IFNldmVyaXR5Lldhcm5pbmcpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBpY29uOiB3YXJuaW5nSWNvbiwgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kVGV4dChzdGF0dXMubWVzc2FnZSkuYXBwZW5kTWFya2Rvd24oYCAke21hbmFnZUFjY2Vzc0xpbmt9YCkgfSwgdHJ1ZSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBSZW1vdGUgV29ya3NwYWNlXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0aWYgKGlzTGFuZ3VhZ2VQYWNrRXh0ZW5zaW9uKHRoaXMuZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0KSkge1xuXHRcdFx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UuaW5zdGFsbGVkLnNvbWUoZSA9PiBhcmVTYW1lRXh0ZW5zaW9ucyhlLmlkZW50aWZpZXIsIHRoaXMuZXh0ZW5zaW9uIS5pZGVudGlmaWVyKSAmJiBlLnNlcnZlciAhPT0gdGhpcy5leHRlbnNpb24hLnNlcnZlcikpIHtcblx0XHRcdFx0XHRjb25zdCBtZXNzYWdlID0gdGhpcy5leHRlbnNpb24uc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclxuXHRcdFx0XHRcdFx0PyBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ0luc3RhbGwgbGFuZ3VhZ2UgcGFjayBhbHNvIGluIHJlbW90ZSBzZXJ2ZXInLCBcIkluc3RhbGwgdGhlIGxhbmd1YWdlIHBhY2sgZXh0ZW5zaW9uIG9uICd7MH0nIHRvIGVuYWJsZSBpdCB0aGVyZSBhbHNvLlwiLCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIubGFiZWwpKVxuXHRcdFx0XHRcdFx0OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ0luc3RhbGwgbGFuZ3VhZ2UgcGFjayBhbHNvIGxvY2FsbHknLCBcIkluc3RhbGwgdGhlIGxhbmd1YWdlIHBhY2sgZXh0ZW5zaW9uIGxvY2FsbHkgdG8gZW5hYmxlIGl0IHRoZXJlIGFsc28uXCIpKTtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IGljb246IGluZm9JY29uLCBtZXNzYWdlIH0sIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcnVubmluZ0V4dGVuc2lvbiA9IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5leHRlbnNpb25zLmZpbHRlcihlID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQ6IGUuaWRlbnRpZmllci52YWx1ZSwgdXVpZDogZS51dWlkIH0sIHRoaXMuZXh0ZW5zaW9uIS5pZGVudGlmaWVyKSlbMF07XG5cdFx0XHRjb25zdCBydW5uaW5nRXh0ZW5zaW9uU2VydmVyID0gcnVubmluZ0V4dGVuc2lvbiA/IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UuZ2V0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcih0b0V4dGVuc2lvbihydW5uaW5nRXh0ZW5zaW9uKSkgOiBudWxsO1xuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIgJiYgcnVubmluZ0V4dGVuc2lvblNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UucHJlZmVyc0V4ZWN1dGVPbldvcmtzcGFjZSh0aGlzLmV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdCkpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IGljb246IGluZm9JY29uLCBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoYCR7bG9jYWxpemUoJ2VuYWJsZWQgcmVtb3RlbHknLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIGVuYWJsZWQgaW4gdGhlIFJlbW90ZSBFeHRlbnNpb24gSG9zdCBiZWNhdXNlIGl0IHByZWZlcnMgdG8gcnVuIHRoZXJlLlwiKX0gWyR7bG9jYWxpemUoJ2xlYXJuIG1vcmUnLCBcIkxlYXJuIE1vcmVcIil9XShodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9hcGkvYWR2YW5jZWQtdG9waWNzL3JlbW90ZS1leHRlbnNpb25zI2FyY2hpdGVjdHVyZS1hbmQtZXh0ZW5zaW9uLWtpbmRzKWApIH0sIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHJ1bm5pbmdFeHRlbnNpb25TZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyKSB7XG5cdFx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UucHJlZmVyc0V4ZWN1dGVPblVJKHRoaXMuZXh0ZW5zaW9uLmxvY2FsLm1hbmlmZXN0KSkge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgaWNvbjogaW5mb0ljb24sIG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhgJHtsb2NhbGl6ZSgnZW5hYmxlZCBsb2NhbGx5JywgXCJUaGlzIGV4dGVuc2lvbiBpcyBlbmFibGVkIGluIHRoZSBMb2NhbCBFeHRlbnNpb24gSG9zdCBiZWNhdXNlIGl0IHByZWZlcnMgdG8gcnVuIHRoZXJlLlwiKX0gWyR7bG9jYWxpemUoJ2xlYXJuIG1vcmUnLCBcIkxlYXJuIE1vcmVcIil9XShodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9hcGkvYWR2YW5jZWQtdG9waWNzL3JlbW90ZS1leHRlbnNpb25zI2FyY2hpdGVjdHVyZS1hbmQtZXh0ZW5zaW9uLWtpbmRzKWApIH0sIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLnNlcnZlciA9PT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHJ1bm5pbmdFeHRlbnNpb25TZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2Uud2ViRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0XHRpZiAodGhpcy5leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLmNhbkV4ZWN1dGVPbldlYih0aGlzLmV4dGVuc2lvbi5sb2NhbC5tYW5pZmVzdCkpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IGljb246IGluZm9JY29uLCBtZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcoYCR7bG9jYWxpemUoJ2VuYWJsZWQgaW4gd2ViIHdvcmtlcicsIFwiVGhpcyBleHRlbnNpb24gaXMgZW5hYmxlZCBpbiB0aGUgV2ViIFdvcmtlciBFeHRlbnNpb24gSG9zdCBiZWNhdXNlIGl0IHByZWZlcnMgdG8gcnVuIHRoZXJlLlwiKX0gWyR7bG9jYWxpemUoJ2xlYXJuIG1vcmUnLCBcIkxlYXJuIE1vcmVcIil9XShodHRwczovL2NvZGUudmlzdWFsc3R1ZGlvLmNvbS9hcGkvYWR2YW5jZWQtdG9waWNzL3JlbW90ZS1leHRlbnNpb25zI2FyY2hpdGVjdHVyZS1hbmQtZXh0ZW5zaW9uLWtpbmRzKWApIH0sIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBFeHRlbnNpb24gaXMgZGlzYWJsZWQgYnkgaXRzIGRlcGVuZGVuY3lcblx0XHRpZiAodGhpcy5leHRlbnNpb24uZW5hYmxlbWVudFN0YXRlID09PSBFbmFibGVtZW50U3RhdGUuRGlzYWJsZWRCeUV4dGVuc2lvbkRlcGVuZGVuY3kpIHtcblx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHtcblx0XHRcdFx0aWNvbjogd2FybmluZ0ljb24sXG5cdFx0XHRcdG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnZXh0ZW5zaW9uIGRpc2FibGVkIGJlY2F1c2Ugb2YgZGVwZW5kZW5jeScsIFwiVGhpcyBleHRlbnNpb24gZGVwZW5kcyBvbiBhbiBleHRlbnNpb24gdGhhdCBpcyBkaXNhYmxlZC5cIikpXG5cdFx0XHRcdFx0LmFwcGVuZE1hcmtkb3duKGAmbmJzcDtbJHtsb2NhbGl6ZSgnZGVwZW5kZW5jaWVzJywgXCJTaG93IERlcGVuZGVuY2llc1wiKX1dKCR7Y3JlYXRlQ29tbWFuZFVyaSgnZXh0ZW5zaW9uLm9wZW4nLCB0aGlzLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBFeHRlbnNpb25FZGl0b3JUYWIuRGVwZW5kZW5jaWVzKX0pYClcblx0XHRcdH0sIHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5leHRlbnNpb24ubG9jYWwuaXNWYWxpZCkge1xuXHRcdFx0Y29uc3QgZXJyb3JzID0gdGhpcy5leHRlbnNpb24ubG9jYWwudmFsaWRhdGlvbnMuZmlsdGVyKChbc2V2ZXJpdHldKSA9PiBzZXZlcml0eSA9PT0gU2V2ZXJpdHkuRXJyb3IpLm1hcCgoWywgbWVzc2FnZV0pID0+IG1lc3NhZ2UpO1xuXHRcdFx0dGhpcy51cGRhdGVTdGF0dXMoeyBpY29uOiB3YXJuaW5nSWNvbiwgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGVycm9ycy5qb2luKCcgJykudHJpbSgpKSB9LCB0cnVlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc0VuYWJsZWQgPSB0aGlzLndvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCh0aGlzLmV4dGVuc2lvbi5sb2NhbCk7XG5cdFx0Y29uc3QgaXNSdW5uaW5nID0gdGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMuc29tZShlID0+IGFyZVNhbWVFeHRlbnNpb25zKHsgaWQ6IGUuaWRlbnRpZmllci52YWx1ZSwgdXVpZDogZS51dWlkIH0sIHRoaXMuZXh0ZW5zaW9uIS5pZGVudGlmaWVyKSk7XG5cblx0XHRpZiAoIXRoaXMuZXh0ZW5zaW9uLmlzV29ya3NwYWNlU2NvcGVkICYmIGlzRW5hYmxlZCAmJiBpc1J1bm5pbmcpIHtcblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkV29ya3NwYWNlKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCd3b3Jrc3BhY2UgZW5hYmxlZCcsIFwiVGhpcyBleHRlbnNpb24gaXMgZW5hYmxlZCBmb3IgdGhpcyB3b3Jrc3BhY2UgYnkgdGhlIHVzZXIuXCIpKSB9LCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0XHRpZiAodGhpcy5leHRlbnNpb24uc2VydmVyID09PSB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVN0YXR1cyh7IG1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnZXh0ZW5zaW9uIGVuYWJsZWQgb24gcmVtb3RlJywgXCJFeHRlbnNpb24gaXMgZW5hYmxlZCBvbiAnezB9J1wiLCB0aGlzLmV4dGVuc2lvbi5zZXJ2ZXIubGFiZWwpKSB9LCB0cnVlKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkR2xvYmFsbHkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghaXNFbmFibGVkICYmICFpc1J1bm5pbmcpIHtcblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbi5lbmFibGVtZW50U3RhdGUgPT09IEVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZEdsb2JhbGx5KSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdnbG9iYWxseSBkaXNhYmxlZCcsIFwiVGhpcyBleHRlbnNpb24gaXMgZGlzYWJsZWQgZ2xvYmFsbHkgYnkgdGhlIHVzZXIuXCIpKSB9LCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRoaXMuZXh0ZW5zaW9uLmVuYWJsZW1lbnRTdGF0ZSA9PT0gRW5hYmxlbWVudFN0YXRlLkRpc2FibGVkV29ya3NwYWNlKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlU3RhdHVzKHsgbWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCd3b3Jrc3BhY2UgZGlzYWJsZWQnLCBcIlRoaXMgZXh0ZW5zaW9uIGlzIGRpc2FibGVkIGZvciB0aGlzIHdvcmtzcGFjZSBieSB0aGUgdXNlci5cIikpIH0sIHRydWUpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTdGF0dXMoc3RhdHVzOiBFeHRlbnNpb25TdGF0dXMgfCB1bmRlZmluZWQsIHVwZGF0ZUNsYXNzOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHN0YXR1cykge1xuXHRcdFx0aWYgKHRoaXMuX3N0YXR1cy5zb21lKHMgPT4gcy5tZXNzYWdlLnZhbHVlID09PSBzdGF0dXMubWVzc2FnZS52YWx1ZSAmJiBzLmljb24/LmlkID09PSBzdGF0dXMuaWNvbj8uaWQpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMuX3N0YXR1cy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc3RhdHVzID0gW107XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXR1cykge1xuXHRcdFx0dGhpcy5fc3RhdHVzLnB1c2goc3RhdHVzKTtcblx0XHRcdHRoaXMuX3N0YXR1cy5zb3J0KChhLCBiKSA9PlxuXHRcdFx0XHRiLmljb24gPT09IHRydXN0SWNvbiA/IC0xIDpcblx0XHRcdFx0XHRhLmljb24gPT09IHRydXN0SWNvbiA/IDEgOlxuXHRcdFx0XHRcdFx0Yi5pY29uID09PSBlcnJvckljb24gPyAtMSA6XG5cdFx0XHRcdFx0XHRcdGEuaWNvbiA9PT0gZXJyb3JJY29uID8gMSA6XG5cdFx0XHRcdFx0XHRcdFx0Yi5pY29uID09PSB3YXJuaW5nSWNvbiA/IC0xIDpcblx0XHRcdFx0XHRcdFx0XHRcdGEuaWNvbiA9PT0gd2FybmluZ0ljb24gPyAxIDpcblx0XHRcdFx0XHRcdFx0XHRcdFx0Yi5pY29uID09PSBpbmZvSWNvbiA/IC0xIDpcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhLmljb24gPT09IGluZm9JY29uID8gMSA6XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQwXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdGlmICh1cGRhdGVDbGFzcykge1xuXHRcdFx0aWYgKHN0YXR1cz8uaWNvbiA9PT0gZXJyb3JJY29uKSB7XG5cdFx0XHRcdHRoaXMuY2xhc3MgPSBgJHtFeHRlbnNpb25TdGF0dXNBY3Rpb24uQ0xBU1N9IGV4dGVuc2lvbi1zdGF0dXMtZXJyb3IgJHtUaGVtZUljb24uYXNDbGFzc05hbWUoZXJyb3JJY29uKX1gO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSBpZiAoc3RhdHVzPy5pY29uID09PSB3YXJuaW5nSWNvbikge1xuXHRcdFx0XHR0aGlzLmNsYXNzID0gYCR7RXh0ZW5zaW9uU3RhdHVzQWN0aW9uLkNMQVNTfSBleHRlbnNpb24tc3RhdHVzLXdhcm5pbmcgJHtUaGVtZUljb24uYXNDbGFzc05hbWUod2FybmluZ0ljb24pfWA7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmIChzdGF0dXM/Lmljb24gPT09IGluZm9JY29uKSB7XG5cdFx0XHRcdHRoaXMuY2xhc3MgPSBgJHtFeHRlbnNpb25TdGF0dXNBY3Rpb24uQ0xBU1N9IGV4dGVuc2lvbi1zdGF0dXMtaW5mbyAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShpbmZvSWNvbil9YDtcblx0XHRcdH1cblx0XHRcdGVsc2UgaWYgKHN0YXR1cz8uaWNvbiA9PT0gdHJ1c3RJY29uKSB7XG5cdFx0XHRcdHRoaXMuY2xhc3MgPSBgJHtFeHRlbnNpb25TdGF0dXNBY3Rpb24uQ0xBU1N9ICR7VGhlbWVJY29uLmFzQ2xhc3NOYW1lKHRydXN0SWNvbil9YDtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHR0aGlzLmNsYXNzID0gYCR7RXh0ZW5zaW9uU3RhdHVzQWN0aW9uLkNMQVNTfSBoaWRlYDtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0dXMuZmlyZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8YW55PiB7XG5cdFx0aWYgKHRoaXMuX3N0YXR1c1swXT8uaWNvbiA9PT0gdHJ1c3RJY29uKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLnRydXN0Lm1hbmFnZScpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5zdGFsbFNwZWNpZmljVmVyc2lvbk9mRXh0ZW5zaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLmluc3RhbGwuc3BlY2lmaWNWZXJzaW9uJztcblx0c3RhdGljIHJlYWRvbmx5IExBQkVMID0gbG9jYWxpemUoJ2luc3RhbGwgcHJldmlvdXMgdmVyc2lvbicsIFwiSW5zdGFsbCBTcGVjaWZpYyBWZXJzaW9uIG9mIEV4dGVuc2lvbi4uLlwiKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpZDogc3RyaW5nID0gSW5zdGFsbFNwZWNpZmljVmVyc2lvbk9mRXh0ZW5zaW9uQWN0aW9uLklELCBsYWJlbDogc3RyaW5nID0gSW5zdGFsbFNwZWNpZmljVmVyc2lvbk9mRXh0ZW5zaW9uQWN0aW9uLkxBQkVMLFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihpZCwgbGFiZWwpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGVuYWJsZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWwuc29tZShsID0+IHRoaXMuaXNFbmFibGVkKGwpKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPGFueT4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvblBpY2sgPSBhd2FpdCB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLnBpY2sodGhpcy5nZXRFeHRlbnNpb25FbnRyaWVzKCksIHsgcGxhY2VIb2xkZXI6IGxvY2FsaXplKCdzZWxlY3RFeHRlbnNpb24nLCBcIlNlbGVjdCBFeHRlbnNpb25cIiksIG1hdGNoT25EZXRhaWw6IHRydWUgfSk7XG5cdFx0aWYgKGV4dGVuc2lvblBpY2sgJiYgZXh0ZW5zaW9uUGljay5leHRlbnNpb24pIHtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5zdGFsbEFub3RoZXJWZXJzaW9uQWN0aW9uLCBleHRlbnNpb25QaWNrLmV4dGVuc2lvbiwgdHJ1ZSk7XG5cdFx0XHQvLyBUT0RPOiByZXBsYWNlIHdpdGggYHVzaW5nYCBvbmNlIGF2YWlsYWJsZVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgYWN0aW9uLnJ1bigpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YWN0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaChleHRlbnNpb25QaWNrLmV4dGVuc2lvbi5pZGVudGlmaWVyLmlkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGlzRW5hYmxlZChleHRlbnNpb246IElFeHRlbnNpb24pOiBib29sZWFuIHtcblx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluc3RhbGxBbm90aGVyVmVyc2lvbkFjdGlvbiwgZXh0ZW5zaW9uLCB0cnVlKTtcblx0XHQvLyBUT0RPOiByZXBsYWNlIHdpdGggYHVzaW5nYCBvbmNlIGF2YWlsYWJsZVxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYWN0aW9uLmVuYWJsZWQgJiYgISFleHRlbnNpb24ubG9jYWwgJiYgdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoZXh0ZW5zaW9uLmxvY2FsKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YWN0aW9uLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEV4dGVuc2lvbkVudHJpZXMoKTogUHJvbWlzZTxJRXh0ZW5zaW9uUGlja0l0ZW1bXT4ge1xuXHRcdGNvbnN0IGluc3RhbGxlZCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UucXVlcnlMb2NhbCgpO1xuXHRcdGNvbnN0IGVudHJpZXM6IElFeHRlbnNpb25QaWNrSXRlbVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgaW5zdGFsbGVkKSB7XG5cdFx0XHRpZiAodGhpcy5pc0VuYWJsZWQoZXh0ZW5zaW9uKSkge1xuXHRcdFx0XHRlbnRyaWVzLnB1c2goe1xuXHRcdFx0XHRcdGlkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCxcblx0XHRcdFx0XHRsYWJlbDogZXh0ZW5zaW9uLmRpc3BsYXlOYW1lIHx8IGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCxcblx0XHRcdFx0XHRleHRlbnNpb24sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZW50cmllcy5zb3J0KChlMSwgZTIpID0+IGUxLmV4dGVuc2lvbi5kaXNwbGF5TmFtZS5sb2NhbGVDb21wYXJlKGUyLmV4dGVuc2lvbi5kaXNwbGF5TmFtZSkpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJRXh0ZW5zaW9uUGlja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdGV4dGVuc2lvbjogSUV4dGVuc2lvbjtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0SW5zdGFsbEV4dGVuc2lvbnNJblNlcnZlckFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0cHJpdmF0ZSBleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihpZCk7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0XHR0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLnF1ZXJ5TG9jYWwoKS50aGVuKCgpID0+IHRoaXMudXBkYXRlRXh0ZW5zaW9ucygpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbnMpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVFeHRlbnNpb25zKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFeHRlbnNpb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuZXh0ZW5zaW9ucyA9IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UubG9jYWw7XG5cdFx0dGhpcy51cGRhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9ICEhdGhpcy5leHRlbnNpb25zICYmIHRoaXMuZ2V0RXh0ZW5zaW9uc1RvSW5zdGFsbCh0aGlzLmV4dGVuc2lvbnMpLmxlbmd0aCA+IDA7XG5cdFx0dGhpcy50b29sdGlwID0gdGhpcy5sYWJlbDtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5zZWxlY3RBbmRJbnN0YWxsRXh0ZW5zaW9ucygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBxdWVyeUV4dGVuc2lvbnNUb0luc3RhbGwoKTogUHJvbWlzZTxJRXh0ZW5zaW9uW10+IHtcblx0XHRjb25zdCBsb2NhbCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UucXVlcnlMb2NhbCgpO1xuXHRcdHJldHVybiB0aGlzLmdldEV4dGVuc2lvbnNUb0luc3RhbGwobG9jYWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZWxlY3RBbmRJbnN0YWxsRXh0ZW5zaW9ucygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBxdWlja1BpY2sgPSB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxJRXh0ZW5zaW9uUGlja0l0ZW0+KCk7XG5cdFx0cXVpY2tQaWNrLmJ1c3kgPSB0cnVlO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBxdWlja1BpY2sub25EaWRBY2NlcHQoKCkgPT4ge1xuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0cXVpY2tQaWNrLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMub25EaWRBY2NlcHQocXVpY2tQaWNrLnNlbGVjdGVkSXRlbXMpO1xuXHRcdH0pO1xuXHRcdHF1aWNrUGljay5zaG93KCk7XG5cdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zVG9JbnN0YWxsID0gYXdhaXQgdGhpcy5xdWVyeUV4dGVuc2lvbnNUb0luc3RhbGwoKTtcblx0XHRxdWlja1BpY2suYnVzeSA9IGZhbHNlO1xuXHRcdGlmIChsb2NhbEV4dGVuc2lvbnNUb0luc3RhbGwubGVuZ3RoKSB7XG5cdFx0XHRxdWlja1BpY2sudGl0bGUgPSB0aGlzLmdldFF1aWNrUGlja1RpdGxlKCk7XG5cdFx0XHRxdWlja1BpY2sucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnc2VsZWN0IGV4dGVuc2lvbnMgdG8gaW5zdGFsbCcsIFwiU2VsZWN0IGV4dGVuc2lvbnMgdG8gaW5zdGFsbFwiKTtcblx0XHRcdHF1aWNrUGljay5jYW5TZWxlY3RNYW55ID0gdHJ1ZTtcblx0XHRcdGxvY2FsRXh0ZW5zaW9uc1RvSW5zdGFsbC5zb3J0KChlMSwgZTIpID0+IGUxLmRpc3BsYXlOYW1lLmxvY2FsZUNvbXBhcmUoZTIuZGlzcGxheU5hbWUpKTtcblx0XHRcdHF1aWNrUGljay5pdGVtcyA9IGxvY2FsRXh0ZW5zaW9uc1RvSW5zdGFsbC5tYXA8SUV4dGVuc2lvblBpY2tJdGVtPihleHRlbnNpb24gPT4gKHsgZXh0ZW5zaW9uLCBsYWJlbDogZXh0ZW5zaW9uLmRpc3BsYXlOYW1lLCBkZXNjcmlwdGlvbjogZXh0ZW5zaW9uLnZlcnNpb24gfSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRxdWlja1BpY2suaGlkZSgpO1xuXHRcdFx0cXVpY2tQaWNrLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5ub3RpZnkoe1xuXHRcdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ25vIGxvY2FsIGV4dGVuc2lvbnMnLCBcIlRoZXJlIGFyZSBubyBleHRlbnNpb25zIHRvIGluc3RhbGwuXCIpXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkQWNjZXB0KHNlbGVjdGVkSXRlbXM6IFJlYWRvbmx5QXJyYXk8SUV4dGVuc2lvblBpY2tJdGVtPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChzZWxlY3RlZEl0ZW1zLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgbG9jYWxFeHRlbnNpb25zVG9JbnN0YWxsID0gc2VsZWN0ZWRJdGVtcy5maWx0ZXIociA9PiAhIXIuZXh0ZW5zaW9uKS5tYXAociA9PiByLmV4dGVuc2lvbik7XG5cdFx0XHRpZiAobG9jYWxFeHRlbnNpb25zVG9JbnN0YWxsLmxlbmd0aCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MoXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdpbnN0YWxsaW5nIGV4dGVuc2lvbnMnLCBcIkluc3RhbGxpbmcgRXh0ZW5zaW9ucy4uLlwiKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0KCkgPT4gdGhpcy5pbnN0YWxsRXh0ZW5zaW9ucyhsb2NhbEV4dGVuc2lvbnNUb0luc3RhbGwpKTtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obG9jYWxpemUoJ2ZpbmlzaGVkIGluc3RhbGxpbmcnLCBcIlN1Y2Nlc3NmdWxseSBpbnN0YWxsZWQgZXh0ZW5zaW9ucy5cIikpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXRRdWlja1BpY2tUaXRsZSgpOiBzdHJpbmc7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXRFeHRlbnNpb25zVG9JbnN0YWxsKGxvY2FsOiBJRXh0ZW5zaW9uW10pOiBJRXh0ZW5zaW9uW107XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBpbnN0YWxsRXh0ZW5zaW9ucyhleHRlbnNpb25zOiBJRXh0ZW5zaW9uW10pOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgY2xhc3MgSW5zdGFsbExvY2FsRXh0ZW5zaW9uc0luUmVtb3RlQWN0aW9uIGV4dGVuZHMgQWJzdHJhY3RJbnN0YWxsRXh0ZW5zaW9uc0luU2VydmVyQWN0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2Ugbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCd3b3JrYmVuY2guZXh0ZW5zaW9ucy5hY3Rpb25zLmluc3RhbGxMb2NhbEV4dGVuc2lvbnNJblJlbW90ZScsIGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLCBxdWlja0lucHV0U2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSwgcHJvZ3Jlc3NTZXJ2aWNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBsYWJlbCgpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlICYmIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlcikge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdzZWxlY3QgYW5kIGluc3RhbGwgbG9jYWwgZXh0ZW5zaW9ucycsIFwiSW5zdGFsbCBMb2NhbCBFeHRlbnNpb25zIGluICd7MH0nLi4uXCIsIHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlci5sYWJlbCk7XG5cdFx0fVxuXHRcdHJldHVybiAnJztcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRRdWlja1BpY2tUaXRsZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnaW5zdGFsbCBsb2NhbCBleHRlbnNpb25zIHRpdGxlJywgXCJJbnN0YWxsIExvY2FsIEV4dGVuc2lvbnMgaW4gJ3swfSdcIiwgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5yZW1vdGVFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyIS5sYWJlbCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0RXh0ZW5zaW9uc1RvSW5zdGFsbChsb2NhbDogSUV4dGVuc2lvbltdKTogSUV4dGVuc2lvbltdIHtcblx0XHRyZXR1cm4gbG9jYWwuZmlsdGVyKGV4dGVuc2lvbiA9PiB7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlbW90ZUluc3RhbGxBY3Rpb24sIHRydWUpO1xuXHRcdFx0YWN0aW9uLmV4dGVuc2lvbiA9IGV4dGVuc2lvbjtcblx0XHRcdHJldHVybiBhY3Rpb24uZW5hYmxlZDtcblx0XHR9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBpbnN0YWxsRXh0ZW5zaW9ucyhsb2NhbEV4dGVuc2lvbnNUb0luc3RhbGw6IElFeHRlbnNpb25bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGdhbGxlcnlFeHRlbnNpb25zOiBJR2FsbGVyeUV4dGVuc2lvbltdID0gW107XG5cdFx0Y29uc3QgdnNpeHM6IFVSSVtdID0gW107XG5cdFx0Y29uc3QgdGFyZ2V0UGxhdGZvcm0gPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIhLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldFRhcmdldFBsYXRmb3JtKCk7XG5cdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChsb2NhbEV4dGVuc2lvbnNUb0luc3RhbGwubWFwKGFzeW5jIGV4dGVuc2lvbiA9PiB7XG5cdFx0XHRpZiAodGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRjb25zdCBnYWxsZXJ5ID0gKGF3YWl0IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZ2V0RXh0ZW5zaW9ucyhbeyAuLi5leHRlbnNpb24uaWRlbnRpZmllciwgcHJlUmVsZWFzZTogISFleHRlbnNpb24ubG9jYWw/LnByZVJlbGVhc2UgfV0sIHsgdGFyZ2V0UGxhdGZvcm0sIGNvbXBhdGlibGU6IHRydWUgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpWzBdO1xuXHRcdFx0XHRpZiAoZ2FsbGVyeSkge1xuXHRcdFx0XHRcdGdhbGxlcnlFeHRlbnNpb25zLnB1c2goZ2FsbGVyeSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB2c2l4ID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIhLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnppcChleHRlbnNpb24ubG9jYWwhKTtcblx0XHRcdHZzaXhzLnB1c2godnNpeCk7XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChnYWxsZXJ5RXh0ZW5zaW9ucy5tYXAoZ2FsbGVyeSA9PiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIhLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGxGcm9tR2FsbGVyeShnYWxsZXJ5KSkpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKHZzaXhzLm1hcCh2c2l4ID0+IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UucmVtb3RlRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciEuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbCh2c2l4KSkpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQodnNpeHMubWFwKHZzaXggPT4gdGhpcy5maWxlU2VydmljZS5kZWwodnNpeCkpKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBJbnN0YWxsUmVtb3RlRXh0ZW5zaW9uc0luTG9jYWxBY3Rpb24gZXh0ZW5kcyBBYnN0cmFjdEluc3RhbGxFeHRlbnNpb25zSW5TZXJ2ZXJBY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25HYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihpZCwgZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsIHF1aWNrSW5wdXRTZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlLCBwcm9ncmVzc1NlcnZpY2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IGxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdzZWxlY3QgYW5kIGluc3RhbGwgcmVtb3RlIGV4dGVuc2lvbnMnLCBcIkluc3RhbGwgUmVtb3RlIEV4dGVuc2lvbnMgTG9jYWxseS4uLlwiKTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRRdWlja1BpY2tUaXRsZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnaW5zdGFsbCByZW1vdGUgZXh0ZW5zaW9ucycsIFwiSW5zdGFsbCBSZW1vdGUgRXh0ZW5zaW9ucyBMb2NhbGx5XCIpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldEV4dGVuc2lvbnNUb0luc3RhbGwobG9jYWw6IElFeHRlbnNpb25bXSk6IElFeHRlbnNpb25bXSB7XG5cdFx0cmV0dXJuIGxvY2FsLmZpbHRlcihleHRlbnNpb24gPT5cblx0XHRcdGV4dGVuc2lvbi50eXBlID09PSBFeHRlbnNpb25UeXBlLlVzZXIgJiYgZXh0ZW5zaW9uLnNlcnZlciAhPT0gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJcblx0XHRcdCYmICF0aGlzLmV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLmluc3RhbGxlZC5zb21lKGUgPT4gZS5zZXJ2ZXIgPT09IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyICYmIGFyZVNhbWVFeHRlbnNpb25zKGUuaWRlbnRpZmllciwgZXh0ZW5zaW9uLmlkZW50aWZpZXIpKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgaW5zdGFsbEV4dGVuc2lvbnMoZXh0ZW5zaW9uczogSUV4dGVuc2lvbltdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZ2FsbGVyeUV4dGVuc2lvbnM6IElHYWxsZXJ5RXh0ZW5zaW9uW10gPSBbXTtcblx0XHRjb25zdCB2c2l4czogVVJJW10gPSBbXTtcblx0XHRjb25zdCB0YXJnZXRQbGF0Zm9ybSA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlclNlcnZpY2UubG9jYWxFeHRlbnNpb25NYW5hZ2VtZW50U2VydmVyIS5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRUYXJnZXRQbGF0Zm9ybSgpO1xuXHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQoZXh0ZW5zaW9ucy5tYXAoYXN5bmMgZXh0ZW5zaW9uID0+IHtcblx0XHRcdGlmICh0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdGNvbnN0IGdhbGxlcnkgPSAoYXdhaXQgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZS5nZXRFeHRlbnNpb25zKFt7IC4uLmV4dGVuc2lvbi5pZGVudGlmaWVyLCBwcmVSZWxlYXNlOiAhIWV4dGVuc2lvbi5sb2NhbD8ucHJlUmVsZWFzZSB9XSwgeyB0YXJnZXRQbGF0Zm9ybSwgY29tcGF0aWJsZTogdHJ1ZSB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSlbMF07XG5cdFx0XHRcdGlmIChnYWxsZXJ5KSB7XG5cdFx0XHRcdFx0Z2FsbGVyeUV4dGVuc2lvbnMucHVzaChnYWxsZXJ5KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNvbnN0IHZzaXggPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLnJlbW90ZUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIhLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLnppcChleHRlbnNpb24ubG9jYWwhKTtcblx0XHRcdHZzaXhzLnB1c2godnNpeCk7XG5cdFx0fSkpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChnYWxsZXJ5RXh0ZW5zaW9ucy5tYXAoZ2FsbGVyeSA9PiB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXJTZXJ2aWNlLmxvY2FsRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZlciEuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuaW5zdGFsbEZyb21HYWxsZXJ5KGdhbGxlcnkpKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQodnNpeHMubWFwKHZzaXggPT4gdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmVyU2VydmljZS5sb2NhbEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2ZXIhLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGwodnNpeCkpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKHZzaXhzLm1hcCh2c2l4ID0+IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHZzaXgpKSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZCgnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNob3dFeHRlbnNpb25zRm9yTGFuZ3VhZ2UnLCBmdW5jdGlvbiAoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGZpbGVFeHRlbnNpb246IHN0cmluZykge1xuXHRjb25zdCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRyZXR1cm4gZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaChgZXh0OiR7ZmlsZUV4dGVuc2lvbi5yZXBsYWNlKC9eXFwuLywgJycpfWApO1xufSk7XG5cbmV4cG9ydCBjb25zdCBzaG93RXh0ZW5zaW9uc1dpdGhJZHNDb21tYW5kSWQgPSAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnNob3dFeHRlbnNpb25zV2l0aElkcyc7XG5Db21tYW5kc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZChzaG93RXh0ZW5zaW9uc1dpdGhJZHNDb21tYW5kSWQsIGZ1bmN0aW9uIChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZXh0ZW5zaW9uSWRzOiBzdHJpbmdbXSkge1xuXHRjb25zdCBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZSA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UpO1xuXHRyZXR1cm4gZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaChleHRlbnNpb25JZHMubWFwKGlkID0+IGBAaWQ6JHtpZH1gKS5qb2luKCcgJykpO1xufSk7XG5cbnJlZ2lzdGVyQ29sb3IoJ2V4dGVuc2lvbkJ1dHRvbi5iYWNrZ3JvdW5kJywge1xuXHRkYXJrOiBidXR0b25TZWNvbmRhcnlCYWNrZ3JvdW5kLFxuXHRsaWdodDogYnV0dG9uU2Vjb25kYXJ5QmFja2dyb3VuZCxcblx0aGNEYXJrOiBudWxsLFxuXHRoY0xpZ2h0OiBudWxsXG59LCBsb2NhbGl6ZSgnZXh0ZW5zaW9uQnV0dG9uQmFja2dyb3VuZCcsIFwiQnV0dG9uIGJhY2tncm91bmQgY29sb3IgZm9yIGV4dGVuc2lvbiBhY3Rpb25zLlwiKSk7XG5cbnJlZ2lzdGVyQ29sb3IoJ2V4dGVuc2lvbkJ1dHRvbi5mb3JlZ3JvdW5kJywge1xuXHRkYXJrOiBidXR0b25TZWNvbmRhcnlGb3JlZ3JvdW5kLFxuXHRsaWdodDogYnV0dG9uU2Vjb25kYXJ5Rm9yZWdyb3VuZCxcblx0aGNEYXJrOiBudWxsLFxuXHRoY0xpZ2h0OiBudWxsXG59LCBsb2NhbGl6ZSgnZXh0ZW5zaW9uQnV0dG9uRm9yZWdyb3VuZCcsIFwiQnV0dG9uIGZvcmVncm91bmQgY29sb3IgZm9yIGV4dGVuc2lvbiBhY3Rpb25zLlwiKSk7XG5cbnJlZ2lzdGVyQ29sb3IoJ2V4dGVuc2lvbkJ1dHRvbi5ob3ZlckJhY2tncm91bmQnLCB7XG5cdGRhcms6IGJ1dHRvblNlY29uZGFyeUhvdmVyQmFja2dyb3VuZCxcblx0bGlnaHQ6IGJ1dHRvblNlY29uZGFyeUhvdmVyQmFja2dyb3VuZCxcblx0aGNEYXJrOiBudWxsLFxuXHRoY0xpZ2h0OiBudWxsXG59LCBsb2NhbGl6ZSgnZXh0ZW5zaW9uQnV0dG9uSG92ZXJCYWNrZ3JvdW5kJywgXCJCdXR0b24gYmFja2dyb3VuZCBob3ZlciBjb2xvciBmb3IgZXh0ZW5zaW9uIGFjdGlvbnMuXCIpKTtcblxucmVnaXN0ZXJDb2xvcignZXh0ZW5zaW9uQnV0dG9uLmJvcmRlcicsIHtcblx0ZGFyazogYnV0dG9uU2Vjb25kYXJ5Qm9yZGVyLFxuXHRsaWdodDogYnV0dG9uU2Vjb25kYXJ5Qm9yZGVyLFxuXHRoY0Rhcms6IGJ1dHRvblNlY29uZGFyeUJvcmRlcixcblx0aGNMaWdodDogYnV0dG9uU2Vjb25kYXJ5Qm9yZGVyXG59LCBsb2NhbGl6ZSgnZXh0ZW5zaW9uQnV0dG9uQm9yZGVyJywgXCJCdXR0b24gYm9yZGVyIGNvbG9yIGZvciBleHRlbnNpb24gYWN0aW9ucy5cIikpO1xuXG5yZWdpc3RlckNvbG9yKCdleHRlbnNpb25CdXR0b24uc2VwYXJhdG9yJywgYnV0dG9uU2VwYXJhdG9yLCBsb2NhbGl6ZSgnZXh0ZW5zaW9uQnV0dG9uU2VwYXJhdG9yJywgXCJCdXR0b24gc2VwYXJhdG9yIGNvbG9yIGZvciBleHRlbnNpb24gYWN0aW9uc1wiKSk7XG5cbmV4cG9ydCBjb25zdCBleHRlbnNpb25CdXR0b25Qcm9taW5lbnRCYWNrZ3JvdW5kID0gcmVnaXN0ZXJDb2xvcignZXh0ZW5zaW9uQnV0dG9uLnByb21pbmVudEJhY2tncm91bmQnLCB7XG5cdGRhcms6IGJ1dHRvbkJhY2tncm91bmQsXG5cdGxpZ2h0OiBidXR0b25CYWNrZ3JvdW5kLFxuXHRoY0Rhcms6IG51bGwsXG5cdGhjTGlnaHQ6IG51bGxcbn0sIGxvY2FsaXplKCdleHRlbnNpb25CdXR0b25Qcm9taW5lbnRCYWNrZ3JvdW5kJywgXCJCdXR0b24gYmFja2dyb3VuZCBjb2xvciBmb3IgZXh0ZW5zaW9uIGFjdGlvbnMgdGhhdCBzdGFuZCBvdXQgKGUuZy4gaW5zdGFsbCBidXR0b24pLlwiKSk7XG5cbnJlZ2lzdGVyQ29sb3IoJ2V4dGVuc2lvbkJ1dHRvbi5wcm9taW5lbnRGb3JlZ3JvdW5kJywge1xuXHRkYXJrOiBidXR0b25Gb3JlZ3JvdW5kLFxuXHRsaWdodDogYnV0dG9uRm9yZWdyb3VuZCxcblx0aGNEYXJrOiBudWxsLFxuXHRoY0xpZ2h0OiBudWxsXG59LCBsb2NhbGl6ZSgnZXh0ZW5zaW9uQnV0dG9uUHJvbWluZW50Rm9yZWdyb3VuZCcsIFwiQnV0dG9uIGZvcmVncm91bmQgY29sb3IgZm9yIGV4dGVuc2lvbiBhY3Rpb25zIHRoYXQgc3RhbmQgb3V0IChlLmcuIGluc3RhbGwgYnV0dG9uKS5cIikpO1xuXG5yZWdpc3RlckNvbG9yKCdleHRlbnNpb25CdXR0b24ucHJvbWluZW50SG92ZXJCYWNrZ3JvdW5kJywge1xuXHRkYXJrOiBidXR0b25Ib3ZlckJhY2tncm91bmQsXG5cdGxpZ2h0OiBidXR0b25Ib3ZlckJhY2tncm91bmQsXG5cdGhjRGFyazogbnVsbCxcblx0aGNMaWdodDogbnVsbFxufSwgbG9jYWxpemUoJ2V4dGVuc2lvbkJ1dHRvblByb21pbmVudEhvdmVyQmFja2dyb3VuZCcsIFwiQnV0dG9uIGJhY2tncm91bmQgaG92ZXIgY29sb3IgZm9yIGV4dGVuc2lvbiBhY3Rpb25zIHRoYXQgc3RhbmQgb3V0IChlLmcuIGluc3RhbGwgYnV0dG9uKS5cIikpO1xuXG5yZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCgodGhlbWU6IElDb2xvclRoZW1lLCBjb2xsZWN0b3I6IElDc3NTdHlsZUNvbGxlY3RvcikgPT4ge1xuXG5cdGNvbnN0IGVycm9yQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JFcnJvckZvcmVncm91bmQpO1xuXHRpZiAoZXJyb3JDb2xvcikge1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAuZXh0ZW5zaW9uLWVkaXRvciAuaGVhZGVyIC5hY3Rpb25zLXN0YXR1cy1jb250YWluZXIgPiAuc3RhdHVzICR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoZXJyb3JJY29uKX0geyBjb2xvcjogJHtlcnJvckNvbG9yfTsgfWApO1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAuZXh0ZW5zaW9uLWVkaXRvciAuYm9keSAuc3ViY29udGVudCAucnVudGltZS1zdGF0dXMgJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihlcnJvckljb24pfSB7IGNvbG9yOiAke2Vycm9yQ29sb3J9OyB9YCk7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28taG92ZXIuZXh0ZW5zaW9uLWhvdmVyIC5tYXJrZG93bi1ob3ZlciAuaG92ZXItY29udGVudHMgJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihlcnJvckljb24pfSB7IGNvbG9yOiAke2Vycm9yQ29sb3J9OyB9YCk7XG5cdH1cblxuXHRjb25zdCB3YXJuaW5nQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihlZGl0b3JXYXJuaW5nRm9yZWdyb3VuZCk7XG5cdGlmICh3YXJuaW5nQ29sb3IpIHtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLmV4dGVuc2lvbi1lZGl0b3IgLmhlYWRlciAuYWN0aW9ucy1zdGF0dXMtY29udGFpbmVyID4gLnN0YXR1cyAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHdhcm5pbmdJY29uKX0geyBjb2xvcjogJHt3YXJuaW5nQ29sb3J9OyB9YCk7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5leHRlbnNpb24tZWRpdG9yIC5ib2R5IC5zdWJjb250ZW50IC5ydW50aW1lLXN0YXR1cyAke1RoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKHdhcm5pbmdJY29uKX0geyBjb2xvcjogJHt3YXJuaW5nQ29sb3J9OyB9YCk7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5tb25hY28taG92ZXIuZXh0ZW5zaW9uLWhvdmVyIC5tYXJrZG93bi1ob3ZlciAuaG92ZXItY29udGVudHMgJHtUaGVtZUljb24uYXNDU1NTZWxlY3Rvcih3YXJuaW5nSWNvbil9IHsgY29sb3I6ICR7d2FybmluZ0NvbG9yfTsgfWApO1xuXHR9XG5cblx0Y29uc3QgaW5mb0NvbG9yID0gdGhlbWUuZ2V0Q29sb3IoZWRpdG9ySW5mb0ZvcmVncm91bmQpO1xuXHRpZiAoaW5mb0NvbG9yKSB7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5leHRlbnNpb24tZWRpdG9yIC5oZWFkZXIgLmFjdGlvbnMtc3RhdHVzLWNvbnRhaW5lciA+IC5zdGF0dXMgJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpbmZvSWNvbil9IHsgY29sb3I6ICR7aW5mb0NvbG9yfTsgfWApO1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAuZXh0ZW5zaW9uLWVkaXRvciAuYm9keSAuc3ViY29udGVudCAucnVudGltZS1zdGF0dXMgJHtUaGVtZUljb24uYXNDU1NTZWxlY3RvcihpbmZvSWNvbil9IHsgY29sb3I6ICR7aW5mb0NvbG9yfTsgfWApO1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAubW9uYWNvLWhvdmVyLmV4dGVuc2lvbi1ob3ZlciAubWFya2Rvd24taG92ZXIgLmhvdmVyLWNvbnRlbnRzICR7VGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaW5mb0ljb24pfSB7IGNvbG9yOiAke2luZm9Db2xvcn07IH1gKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQWtCLFFBQVEsV0FBVyxxQkFBeUM7QUFDOUUsU0FBUyxTQUFTLFVBQVUsaUJBQWlCO0FBQzdDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFlBQVksVUFBVTtBQUN0QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFxQixnQkFBZ0IsNkJBQWtELG1DQUFtQywwQ0FBMEMscUJBQXFCLHVCQUF1QixzQkFBc0Isb0JBQW9CLDRCQUEyQyxrQ0FBa0M7QUFDdlUsU0FBUyw2Q0FBNkM7QUFDdEQsU0FBNEIsMEJBQTJELGtCQUFrQiw4QkFBOEIsMkJBQTJCLDJDQUEyQztBQUM3TSxTQUFTLHNDQUFzQyxpQkFBaUIsbUNBQStELDRDQUE0QztBQUMzSyxTQUFTLCtCQUErQix5Q0FBeUMsd0NBQXdDO0FBQ3pILFNBQVMsbUJBQW1CLHNCQUFzQjtBQUNsRCxTQUFTLGVBQWUscUJBQWdFLHlCQUF5QixnQ0FBZ0MsZ0JBQWdCLG9DQUFvQztBQUNyTSxTQUFTLDZCQUErQztBQUN4RCxTQUFTLG9CQUFrQztBQUMzQyxTQUFTLDBCQUEwQixzQkFBd0M7QUFDM0UsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUIsYUFBYSw4QkFBOEI7QUFDdkUsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsa0JBQWtCLHVCQUF1QjtBQUNsRCxTQUFTLHFC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LEVBQ1AsUUFBUTtBQUFBLEVBQ1IsU0FBUztBQUNWLEdBQUcsU0FBUyx5QkFBeUIsNENBQTRDLENBQUM7QUFFbEYsY0FBYyw2QkFBNkIsaUJBQWlCLFNBQVMsNEJBQTRCLDhDQUE4QyxDQUFDO0FBRXpJLE1BQU0scUNBQXFDLGNBQWMsdUNBQXVDO0FBQUEsRUFDdEcsTUFBTTtBQUFBLEVBQ04sT0FBTztBQUFBLEVBQ1AsUUFBUTtBQUFBLEVBQ1IsU0FBUztBQUNWLEdBQUcsU0FBUyxzQ0FBc0MscUZBQXFGLENBQUM7QUFFeEksY0FBYyx1Q0FBdUM7QUFBQSxFQUNwRCxNQUFNO0FBQUEsRUFDTixPQUFPO0FBQUEsRUFDUCxRQUFRO0FBQUEsRUFDUixTQUFTO0FBQ1YsR0FBRyxTQUFTLHNDQUFzQyxxRkFBcUYsQ0FBQztBQUV4SSxjQUFjLDRDQUE0QztBQUFBLEVBQ3pELE1BQU07QUFBQSxFQUNOLE9BQU87QUFBQSxFQUNQLFFBQVE7QUFBQSxFQUNSLFNBQVM7QUFDVixHQUFHLFNBQVMsMkNBQTJDLDJGQUEyRixDQUFDO0FBRW5KLDJCQUEyQixDQUFDLE9BQW9CLGNBQWtDO0FBRWpGLFFBQU0sYUFBYSxNQUFNLFNBQVMscUJBQXFCO0FBQ3ZELE1BQUksWUFBWTtBQUNmLGNBQVUsUUFBUSxpRUFBaUUsVUFBVSxjQUFjLFNBQVMsQ0FBQyxhQUFhLFVBQVUsS0FBSztBQUNqSixjQUFVLFFBQVEsdURBQXVELFVBQVUsY0FBYyxTQUFTLENBQUMsYUFBYSxVQUFVLEtBQUs7QUFDdkksY0FBVSxRQUFRLGlFQUFpRSxVQUFVLGNBQWMsU0FBUyxDQUFDLGFBQWEsVUFBVSxLQUFLO0FBQUEsRUFDbEo7QUFFQSxRQUFNLGVBQWUsTUFBTSxTQUFTLHVCQUF1QjtBQUMzRCxNQUFJLGNBQWM7QUFDakIsY0FBVSxRQUFRLGlFQUFpRSxVQUFVLGNBQWMsV0FBVyxDQUFDLGFBQWEsWUFBWSxLQUFLO0FBQ3JKLGNBQVUsUUFBUSx1REFBdUQsVUFBVSxjQUFjLFdBQVcsQ0FBQyxhQUFhLFlBQVksS0FBSztBQUMzSSxjQUFVLFFBQVEsaUVBQWlFLFVBQVUsY0FBYyxXQUFXLENBQUMsYUFBYSxZQUFZLEtBQUs7QUFBQSxFQUN0SjtBQUVBLFFBQU0sWUFBWSxNQUFNLFNBQVMsb0JBQW9CO0FBQ3JELE1BQUksV0FBVztBQUNkLGNBQVUsUUFBUSxpRUFBaUUsVUFBVSxjQUFjLFFBQVEsQ0FBQyxhQUFhLFNBQVMsS0FBSztBQUMvSSxjQUFVLFFBQVEsdURBQXVELFVBQVUsY0FBYyxRQUFRLENBQUMsYUFBYSxTQUFTLEtBQUs7QUFDckksY0FBVSxRQUFRLGlFQUFpRSxVQUFVLGNBQWMsUUFBUSxDQUFDLGFBQWEsU0FBUyxLQUFLO0FBQUEsRUFDaEo7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogWyJtZXNzYWdlIiwgIkRlcHJlY2F0aW9uQ2hvaWNlIiwgImV4dGVuc2lvbiIsICJydW5uaW5nRXh0ZW5zaW9uIl0KfQo=
