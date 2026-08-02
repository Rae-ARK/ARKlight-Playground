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
import "./media/workspaceTrustEditor.css";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ConfigurationScope, Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Severity } from "../../../../platform/notification/common/notification.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService, IWorkspaceTrustRequestService, WorkspaceTrustUriResponse } from "../../../../platform/workspace/common/workspaceTrust.js";
import { Extensions as WorkbenchExtensions, WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IStatusbarService, StatusbarAlignment } from "../../../services/statusbar/browser/statusbar.js";
import { EditorPaneDescriptor } from "../../../browser/editor.js";
import { shieldIcon, WorkspaceTrustEditor } from "./workspaceTrustEditor.js";
import { WorkspaceTrustEditorInput } from "../../../services/workspaces/browser/workspaceTrustEditorInput.js";
import { WORKSPACE_TRUST_BANNER, WORKSPACE_TRUST_EMPTY_WINDOW, WORKSPACE_TRUST_ENABLED, WORKSPACE_TRUST_STARTUP_PROMPT, WORKSPACE_TRUST_UNTRUSTED_FILES } from "../../../services/workspaces/common/workspaceTrust.js";
import { EditorExtensions } from "../../../common/editor.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { isEmptyWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, IWorkspaceContextService, toWorkspaceIdentifier, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { dirname, resolve } from "../../../../base/common/path.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IBannerService } from "../../../services/banner/browser/bannerService.js";
import { isVirtualWorkspace } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID } from "../../extensions/common/extensions.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { WORKSPACE_TRUST_SETTING_TAG } from "../../preferences/common/preferences.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { ILabelService, Verbosity } from "../../../../platform/label/common/label.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { MANAGE_TRUST_COMMAND_ID, WorkspaceTrustContext } from "../common/workspace.js";
import { isWeb } from "../../../../base/common/platform.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { securityConfigurationNodeBase } from "../../../common/configuration.js";
import { basename, dirname as uriDirname } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { IFileService } from "../../../../platform/files/common/files.js";
const BANNER_RESTRICTED_MODE = "workbench.banner.restrictedMode";
const STARTUP_PROMPT_SHOWN_KEY = "workspace.trust.startupPrompt.shown";
const BANNER_RESTRICTED_MODE_DISMISSED_KEY = "workbench.banner.restrictedMode.dismissed";
function getSessionsWindowTrustNote(environmentService, productService, isWorkspace) {
  if (!environmentService.isSessionsWindow) {
    return void 0;
  }
  if (isWorkspace) {
    return localize("sessionsWindowWorkspaceTrustNote", "Trusting this workspace will also mark it as trusted in {0}.", productService.nameLong);
  }
  return localize("sessionsWindowFolderTrustNote", "Trusting this folder will also mark it as trusted in {0}.", productService.nameLong);
}
let WorkspaceTrustContextKeys = class extends Disposable {
  constructor(contextKeyService, workspaceTrustEnablementService, workspaceTrustManagementService) {
    super();
    this._ctxWorkspaceTrustEnabled = WorkspaceTrustContext.IsEnabled.bindTo(contextKeyService);
    this._ctxWorkspaceTrustEnabled.set(workspaceTrustEnablementService.isWorkspaceTrustEnabled());
    this._ctxWorkspaceTrustState = WorkspaceTrustContext.IsTrusted.bindTo(contextKeyService);
    this._ctxWorkspaceTrustState.set(workspaceTrustManagementService.isWorkspaceTrusted());
    this._register(workspaceTrustManagementService.onDidChangeTrust((trusted) => this._ctxWorkspaceTrustState.set(trusted)));
  }
};
WorkspaceTrustContextKeys = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IWorkspaceTrustEnablementService),
  __decorateParam(2, IWorkspaceTrustManagementService)
], WorkspaceTrustContextKeys);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceTrustContextKeys, LifecyclePhase.Restored);
let WorkspaceTrustRequestHandler = class extends Disposable {
  constructor(dialogService, commandService, labelService, workspaceContextService, workspaceTrustManagementService, workspaceTrustRequestService, environmentService, productService) {
    super();
    this.dialogService = dialogService;
    this.commandService = commandService;
    this.labelService = labelService;
    this.workspaceContextService = workspaceContextService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.environmentService = environmentService;
    this.productService = productService;
    this.registerListeners();
  }
  get useWorkspaceLanguage() {
    return !isSingleFolderWorkspaceIdentifier(toWorkspaceIdentifier(this.workspaceContextService.getWorkspace()));
  }
  registerListeners() {
    this._register(this.workspaceTrustRequestService.onDidInitiateOpenFilesTrustRequest(async () => {
      await this.workspaceTrustManagementService.workspaceResolved;
      const markdownDetails = [
        this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY ? localize("openLooseFileWorkspaceDetails", "You are trying to open untrusted files in a workspace which is trusted.") : localize("openLooseFileWindowDetails", "You are trying to open untrusted files in a window which is trusted."),
        localize("openLooseFileLearnMore", "If you don't want to open untrusted files, we recommend to open them in Restricted Mode in a new window as the files may be malicious. See [our docs](https://aka.ms/vscode-workspace-trust) to learn more.")
      ];
      await this.dialogService.prompt({
        type: Severity.Info,
        message: this.workspaceContextService.getWorkbenchState() !== WorkbenchState.EMPTY ? localize("openLooseFileWorkspaceMesssage", "Do you want to allow untrusted files in this workspace?") : localize("openLooseFileWindowMesssage", "Do you want to allow untrusted files in this window?"),
        buttons: [
          {
            label: localize({ key: "open", comment: ["&& denotes a mnemonic"] }, "&&Open"),
            run: ({ checkboxChecked }) => this.workspaceTrustRequestService.completeOpenFilesTrustRequest(WorkspaceTrustUriResponse.Open, !!checkboxChecked)
          },
          {
            label: localize({ key: "newWindow", comment: ["&& denotes a mnemonic"] }, "Open in &&Restricted Mode"),
            run: ({ checkboxChecked }) => this.workspaceTrustRequestService.completeOpenFilesTrustRequest(WorkspaceTrustUriResponse.OpenInNewWindow, !!checkboxChecked)
          }
        ],
        cancelButton: {
          run: () => this.workspaceTrustRequestService.completeOpenFilesTrustRequest(WorkspaceTrustUriResponse.Cancel)
        },
        checkbox: {
          label: localize("openLooseFileWorkspaceCheckbox", "Remember my decision for all workspaces"),
          checked: false
        },
        custom: {
          icon: Codicon.shield,
          markdownDetails: markdownDetails.map((md) => {
            return { markdown: new MarkdownString(md) };
          })
        }
      });
    }));
    this._register(this.workspaceTrustRequestService.onDidInitiateResourcesTrustRequest(async (options) => {
      await this.workspaceTrustManagementService.workspaceResolved;
      const markdownDetails = [
        options?.message ?? localize("resourcesTrustDetails", "You are trying to open an untrusted folder. Do you trust the authors of this content?"),
        localize("resourcesTrustLearnMore", "If you don't trust the authors of these files, we recommend not continuing as the files may be malicious. See [our docs](https://aka.ms/vscode-workspace-trust) to learn more."),
        `\`${this.labelService.getUriLabel(options.uri)}\``
      ];
      const sessionsTrustNote = getSessionsWindowTrustNote(this.environmentService, this.productService, false);
      if (sessionsTrustNote) {
        markdownDetails.push(sessionsTrustNote);
      }
      await this.dialogService.prompt({
        type: Severity.Info,
        message: localize("resourcesTrustMessage", "Do you trust the authors of the files in this folder?"),
        buttons: [
          {
            label: localize({ key: "trustResources", comment: ["&& denotes a mnemonic"] }, "&&Trust Folder & Continue"),
            run: () => this.workspaceTrustRequestService.completeResourcesTrustRequest(options.uri, WorkspaceTrustUriResponse.Open)
          }
        ],
        cancelButton: {
          run: () => this.workspaceTrustRequestService.completeResourcesTrustRequest(options.uri, WorkspaceTrustUriResponse.Cancel)
        },
        custom: {
          icon: Codicon.shield,
          markdownDetails: markdownDetails.map((md) => {
            return { markdown: new MarkdownString(md) };
          })
        }
      });
    }));
    this._register(this.workspaceTrustRequestService.onDidInitiateWorkspaceTrustRequest(async (requestOptions) => {
      await this.workspaceTrustManagementService.workspaceResolved;
      const message = this.useWorkspaceLanguage ? localize("workspaceTrust", "Do you trust the authors of the files in this workspace?") : localize("folderTrust", "Do you trust the authors of the files in this folder?");
      const defaultDetails = localize("immediateTrustRequestMessage", "A feature you are trying to use may be a security risk if you do not trust the source of the files or folders you currently have open.");
      const details = requestOptions?.message ?? defaultDetails;
      const buttons = requestOptions?.buttons ?? [
        { label: this.useWorkspaceLanguage ? localize({ key: "grantWorkspaceTrustButton", comment: ["&& denotes a mnemonic"] }, "&&Trust Workspace & Continue") : localize({ key: "grantFolderTrustButton", comment: ["&& denotes a mnemonic"] }, "&&Trust Folder & Continue"), type: "ContinueWithTrust" },
        { label: localize({ key: "manageWorkspaceTrustButton", comment: ["&& denotes a mnemonic"] }, "&&Manage"), type: "Manage" }
      ];
      if (!buttons.some((b) => b.type === "Cancel")) {
        buttons.push({ label: localize("cancelWorkspaceTrustButton", "Cancel"), type: "Cancel" });
      }
      const markdownDetails = [
        { markdown: new MarkdownString(details) },
        { markdown: new MarkdownString(localize("immediateTrustRequestLearnMore", "If you don't trust the authors of these files, we do not recommend continuing as the files may be malicious. See [our docs](https://aka.ms/vscode-workspace-trust) to learn more.")) }
      ];
      const sessionsTrustNote = getSessionsWindowTrustNote(this.environmentService, this.productService, this.useWorkspaceLanguage);
      if (sessionsTrustNote) {
        markdownDetails.push({ markdown: new MarkdownString(sessionsTrustNote) });
      }
      const { result } = await this.dialogService.prompt({
        type: Severity.Info,
        message,
        custom: {
          icon: Codicon.shield,
          markdownDetails
        },
        buttons: buttons.filter((b) => b.type !== "Cancel").map((button) => {
          return {
            label: button.label,
            run: () => button.type
          };
        }),
        cancelButton: (() => {
          const cancelButton = buttons.find((b) => b.type === "Cancel");
          if (!cancelButton) {
            return void 0;
          }
          return {
            label: cancelButton.label,
            run: () => cancelButton.type
          };
        })()
      });
      switch (result) {
        case "ContinueWithTrust":
          await this.workspaceTrustRequestService.completeWorkspaceTrustRequest(true);
          break;
        case "ContinueWithoutTrust":
          await this.workspaceTrustRequestService.completeWorkspaceTrustRequest(void 0);
          break;
        case "Manage":
          this.workspaceTrustRequestService.cancelWorkspaceTrustRequest();
          await this.commandService.executeCommand(MANAGE_TRUST_COMMAND_ID);
          break;
        case "Cancel":
          this.workspaceTrustRequestService.cancelWorkspaceTrustRequest();
          break;
      }
    }));
  }
};
WorkspaceTrustRequestHandler.ID = "workbench.contrib.workspaceTrustRequestHandler";
WorkspaceTrustRequestHandler = __decorateClass([
  __decorateParam(0, IDialogService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, ILabelService),
  __decorateParam(3, IWorkspaceContextService),
  __decorateParam(4, IWorkspaceTrustManagementService),
  __decorateParam(5, IWorkspaceTrustRequestService),
  __decorateParam(6, IWorkbenchEnvironmentService),
  __decorateParam(7, IProductService)
], WorkspaceTrustRequestHandler);
let WorkspaceTrustUXHandler = class extends Disposable {
  constructor(dialogService, workspaceContextService, workspaceTrustEnablementService, workspaceTrustManagementService, configurationService, statusbarService, storageService, workspaceTrustRequestService, bannerService, labelService, hostService, productService, remoteAgentService, environmentService, fileService) {
    super();
    this.dialogService = dialogService;
    this.workspaceContextService = workspaceContextService;
    this.workspaceTrustEnablementService = workspaceTrustEnablementService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.configurationService = configurationService;
    this.statusbarService = statusbarService;
    this.storageService = storageService;
    this.workspaceTrustRequestService = workspaceTrustRequestService;
    this.bannerService = bannerService;
    this.labelService = labelService;
    this.hostService = hostService;
    this.productService = productService;
    this.remoteAgentService = remoteAgentService;
    this.environmentService = environmentService;
    this.fileService = fileService;
    this.entryId = `status.workspaceTrust`;
    this.statusbarEntryAccessor = this._register(new MutableDisposable());
    (async () => {
      await this.workspaceTrustManagementService.workspaceTrustInitialized;
      if (this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
        this.registerListeners();
        this.updateStatusbarEntry(this.workspaceTrustManagementService.isWorkspaceTrusted());
        if (this.hostService.hasFocus) {
          this.showModalOnStart();
        } else {
          const focusDisposable = this.hostService.onDidChangeFocus((focused) => {
            if (focused) {
              focusDisposable.dispose();
              this.showModalOnStart();
            }
          });
        }
      }
    })();
  }
  registerListeners() {
    this._register(this.workspaceContextService.onWillChangeWorkspaceFolders((e) => {
      if (e.fromCache) {
        return;
      }
      if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
        return;
      }
      const addWorkspaceFolder = async (e2) => {
        const trusted = this.workspaceTrustManagementService.isWorkspaceTrusted();
        if (trusted && (e2.changes.added.length || e2.changes.changed.length)) {
          const addedFoldersTrustInfo = await Promise.all(e2.changes.added.map((folder) => this.workspaceTrustManagementService.getUriTrustInfo(folder.uri)));
          if (!addedFoldersTrustInfo.map((info) => info.trusted).every((trusted2) => trusted2)) {
            let detail = localize("addWorkspaceFolderDetail", "You are adding files that are not currently trusted to a trusted workspace. Do you trust the authors of these new files?");
            const sessionsTrustNote = getSessionsWindowTrustNote(this.environmentService, this.productService, false);
            if (sessionsTrustNote) {
              detail += "\n\n" + sessionsTrustNote;
            }
            const { confirmed } = await this.dialogService.confirm({
              type: Severity.Info,
              message: localize("addWorkspaceFolderMessage", "Do you trust the authors of the files in this folder?"),
              detail,
              cancelButton: localize("no", "No"),
              custom: { icon: Codicon.shield }
            });
            await this.workspaceTrustManagementService.setUrisTrust(addedFoldersTrustInfo.map((i) => i.uri), confirmed);
          }
        }
      };
      return e.join(addWorkspaceFolder(e));
    }));
    this._register(this.workspaceTrustManagementService.onDidChangeTrust((trusted) => {
      this.updateWorkbenchIndicators(trusted);
    }));
    this._register(this.workspaceTrustRequestService.onDidInitiateWorkspaceTrustRequestOnStartup(async () => {
      let titleString;
      let learnMoreString;
      let trustOption;
      let dontTrustOption;
      const isAiGeneratedWorkspace = await this.isAiGeneratedWorkspace();
      if (isAiGeneratedWorkspace && this.productService.aiGeneratedWorkspaceTrust) {
        titleString = this.productService.aiGeneratedWorkspaceTrust.title;
        learnMoreString = this.productService.aiGeneratedWorkspaceTrust.startupTrustRequestLearnMore;
        trustOption = this.productService.aiGeneratedWorkspaceTrust.trustOption;
        dontTrustOption = this.productService.aiGeneratedWorkspaceTrust.dontTrustOption;
      } else {
        console.warn("AI generated workspace trust dialog contents not available.");
      }
      const title = titleString ?? (this.useWorkspaceLanguage ? localize("workspaceTrust", "Do you trust the authors of the files in this workspace?") : localize("folderTrust", "Do you trust the authors of the files in this folder?"));
      let checkboxText;
      const workspaceIdentifier = toWorkspaceIdentifier(this.workspaceContextService.getWorkspace());
      const isSingleFolderWorkspace = isSingleFolderWorkspaceIdentifier(workspaceIdentifier);
      const isEmptyWindow = isEmptyWorkspaceIdentifier(workspaceIdentifier);
      if (!isAiGeneratedWorkspace && this.workspaceTrustManagementService.canSetParentFolderTrust()) {
        const name = basename(uriDirname(workspaceIdentifier.uri));
        checkboxText = localize("checkboxString", "Trust the authors of all files in the parent folder '{0}'", name);
      }
      const markdownStrings = [
        !isSingleFolderWorkspace ? localize("workspaceStartupTrustDetails", "{0} provides features that may automatically execute files in this workspace.", this.productService.nameShort) : localize("folderStartupTrustDetails", "{0} provides features that may automatically execute files in this folder.", this.productService.nameShort),
        learnMoreString ?? localize("startupTrustRequestLearnMore", "If you don't trust the authors of these files, we recommend to continue in restricted mode as the files may be malicious. See [our docs](https://aka.ms/vscode-workspace-trust) to learn more."),
        !isEmptyWindow ? `\`${this.labelService.getWorkspaceLabel(workspaceIdentifier, { verbose: Verbosity.LONG })}\`` : ""
      ];
      const sessionsTrustNote = getSessionsWindowTrustNote(this.environmentService, this.productService, !isSingleFolderWorkspace);
      if (sessionsTrustNote) {
        markdownStrings.push(sessionsTrustNote);
      }
      this.doShowModal(
        title,
        { label: trustOption ?? localize({ key: "trustOption", comment: ["&& denotes a mnemonic"] }, "&&Yes, I trust the authors"), sublabel: isSingleFolderWorkspace ? localize("trustFolderOptionDescription", "Trust folder and enable all features") : localize("trustWorkspaceOptionDescription", "Trust workspace and enable all features") },
        { label: dontTrustOption ?? localize({ key: "dontTrustOption", comment: ["&& denotes a mnemonic"] }, "&&No, I don't trust the authors"), sublabel: isSingleFolderWorkspace ? localize("dontTrustFolderOptionDescription", "Open folder in restricted mode") : localize("dontTrustWorkspaceOptionDescription", "Open workspace in restricted mode") },
        markdownStrings,
        checkboxText
      );
    }));
  }
  updateWorkbenchIndicators(trusted) {
    const bannerItem = this.getBannerItem(!trusted);
    this.updateStatusbarEntry(trusted);
    if (bannerItem) {
      if (!trusted) {
        this.bannerService.show(bannerItem);
      } else {
        this.bannerService.hide(BANNER_RESTRICTED_MODE);
      }
    }
  }
  //#region Dialog
  async doShowModal(question, trustedOption, untrustedOption, markdownStrings, trustParentString) {
    await this.dialogService.prompt({
      type: Severity.Info,
      message: question,
      checkbox: trustParentString ? {
        label: trustParentString
      } : void 0,
      buttons: [
        {
          label: trustedOption.label,
          run: async ({ checkboxChecked }) => {
            if (checkboxChecked) {
              await this.workspaceTrustManagementService.setParentFolderTrust(true);
            } else {
              await this.workspaceTrustRequestService.completeWorkspaceTrustRequest(true);
            }
          }
        },
        {
          label: untrustedOption.label,
          run: () => {
            this.updateWorkbenchIndicators(false);
            this.workspaceTrustRequestService.cancelWorkspaceTrustRequest();
          }
        }
      ],
      custom: {
        buttonDetails: [
          trustedOption.sublabel,
          untrustedOption.sublabel
        ],
        disableCloseAction: true,
        icon: Codicon.shield,
        markdownDetails: markdownStrings.map((md) => {
          return { markdown: new MarkdownString(md) };
        })
      }
    });
    this.storageService.store(STARTUP_PROMPT_SHOWN_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  async showModalOnStart() {
    if (this.workspaceTrustManagementService.isWorkspaceTrusted()) {
      this.updateWorkbenchIndicators(true);
      return;
    }
    if (!this.workspaceTrustManagementService.canSetWorkspaceTrust()) {
      return;
    }
    if (isVirtualWorkspace(this.workspaceContextService.getWorkspace())) {
      this.updateWorkbenchIndicators(false);
      return;
    }
    if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.EMPTY) {
      this.updateWorkbenchIndicators(false);
      return;
    }
    if (this.startupPromptSetting === "never") {
      this.updateWorkbenchIndicators(false);
      return;
    }
    if (this.startupPromptSetting === "once" && this.storageService.getBoolean(STARTUP_PROMPT_SHOWN_KEY, StorageScope.WORKSPACE, false)) {
      this.updateWorkbenchIndicators(false);
      return;
    }
    this.workspaceTrustRequestService.requestWorkspaceTrustOnStartup();
  }
  get startupPromptSetting() {
    return this.configurationService.getValue(WORKSPACE_TRUST_STARTUP_PROMPT);
  }
  get useWorkspaceLanguage() {
    return !isSingleFolderWorkspaceIdentifier(toWorkspaceIdentifier(this.workspaceContextService.getWorkspace()));
  }
  async isAiGeneratedWorkspace() {
    const aiGeneratedWorkspaces = URI.joinPath(this.environmentService.workspaceStorageHome, "aiGeneratedWorkspaces.json");
    return await this.fileService.exists(aiGeneratedWorkspaces).then(async (result) => {
      if (result) {
        try {
          const content = await this.fileService.readFile(aiGeneratedWorkspaces);
          const workspaces = JSON.parse(content.value.toString());
          if (workspaces.indexOf(this.workspaceContextService.getWorkspace().folders[0].uri.toString()) > -1) {
            return true;
          }
        } catch (e) {
        }
      }
      return false;
    });
  }
  //#endregion
  //#region Banner
  getBannerItem(restrictedMode) {
    const dismissedRestricted = this.storageService.getBoolean(BANNER_RESTRICTED_MODE_DISMISSED_KEY, StorageScope.WORKSPACE, false);
    if (this.bannerSetting === "never") {
      return void 0;
    }
    if (this.bannerSetting === "untilDismissed" && dismissedRestricted) {
      return void 0;
    }
    const actions = [
      {
        label: localize("restrictedModeBannerManage", "Manage"),
        href: "command:" + MANAGE_TRUST_COMMAND_ID
      },
      {
        label: localize("restrictedModeBannerLearnMore", "Learn More"),
        href: "https://aka.ms/vscode-workspace-trust"
      }
    ];
    return {
      id: BANNER_RESTRICTED_MODE,
      icon: shieldIcon,
      ariaLabel: this.getBannerItemAriaLabels(),
      message: this.getBannerItemMessages(),
      actions,
      onClose: () => {
        if (restrictedMode) {
          this.storageService.store(BANNER_RESTRICTED_MODE_DISMISSED_KEY, true, StorageScope.WORKSPACE, StorageTarget.MACHINE);
        }
      }
    };
  }
  getBannerItemAriaLabels() {
    switch (this.workspaceContextService.getWorkbenchState()) {
      case WorkbenchState.EMPTY:
        return localize("restrictedModeBannerAriaLabelWindow", "Restricted Mode is intended for safe code browsing. Trust this window to enable all features. Use navigation keys to access banner actions.");
      case WorkbenchState.FOLDER:
        return localize("restrictedModeBannerAriaLabelFolder", "Restricted Mode is intended for safe code browsing. Trust this folder to enable all features. Use navigation keys to access banner actions.");
      case WorkbenchState.WORKSPACE:
        return localize("restrictedModeBannerAriaLabelWorkspace", "Restricted Mode is intended for safe code browsing. Trust this workspace to enable all features. Use navigation keys to access banner actions.");
    }
  }
  getBannerItemMessages() {
    switch (this.workspaceContextService.getWorkbenchState()) {
      case WorkbenchState.EMPTY:
        return localize("restrictedModeBannerMessageWindow", "Restricted Mode is intended for safe code browsing. Trust this window to enable all features.");
      case WorkbenchState.FOLDER:
        return localize("restrictedModeBannerMessageFolder", "Restricted Mode is intended for safe code browsing. Trust this folder to enable all features.");
      case WorkbenchState.WORKSPACE:
        return localize("restrictedModeBannerMessageWorkspace", "Restricted Mode is intended for safe code browsing. Trust this workspace to enable all features.");
    }
  }
  get bannerSetting() {
    const result = this.configurationService.getValue(WORKSPACE_TRUST_BANNER);
    if (result !== "always" && isWeb && !this.remoteAgentService.getConnection()?.remoteAuthority) {
      return "never";
    }
    return result;
  }
  //#endregion
  //#region Statusbar
  getRestrictedModeStatusbarEntry() {
    let ariaLabel = "";
    let toolTip;
    switch (this.workspaceContextService.getWorkbenchState()) {
      case WorkbenchState.EMPTY: {
        ariaLabel = localize("status.ariaUntrustedWindow", "Restricted Mode: Some features are disabled because this window is not trusted.");
        toolTip = {
          value: localize(
            { key: "status.tooltipUntrustedWindow2", comment: ["[abc]({n}) are links.  Only translate `features are disabled` and `window is not trusted`. Do not change brackets and parentheses or {n}"] },
            "Running in Restricted Mode\n\nSome [features are disabled]({0}) because this [window is not trusted]({1}).",
            `command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`,
            `command:${MANAGE_TRUST_COMMAND_ID}`
          ),
          isTrusted: true,
          supportThemeIcons: true
        };
        break;
      }
      case WorkbenchState.FOLDER: {
        ariaLabel = localize("status.ariaUntrustedFolder", "Restricted Mode: Some features are disabled because this folder is not trusted.");
        toolTip = {
          value: localize(
            { key: "status.tooltipUntrustedFolder2", comment: ["[abc]({n}) are links.  Only translate `features are disabled` and `folder is not trusted`. Do not change brackets and parentheses or {n}"] },
            "Running in Restricted Mode\n\nSome [features are disabled]({0}) because this [folder is not trusted]({1}).",
            `command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`,
            `command:${MANAGE_TRUST_COMMAND_ID}`
          ),
          isTrusted: true,
          supportThemeIcons: true
        };
        break;
      }
      case WorkbenchState.WORKSPACE: {
        ariaLabel = localize("status.ariaUntrustedWorkspace", "Restricted Mode: Some features are disabled because this workspace is not trusted.");
        toolTip = {
          value: localize(
            { key: "status.tooltipUntrustedWorkspace2", comment: ["[abc]({n}) are links. Only translate `features are disabled` and `workspace is not trusted`. Do not change brackets and parentheses or {n}"] },
            "Running in Restricted Mode\n\nSome [features are disabled]({0}) because this [workspace is not trusted]({1}).",
            `command:${LIST_WORKSPACE_UNSUPPORTED_EXTENSIONS_COMMAND_ID}`,
            `command:${MANAGE_TRUST_COMMAND_ID}`
          ),
          isTrusted: true,
          supportThemeIcons: true
        };
        break;
      }
    }
    return {
      name: localize("status.WorkspaceTrust", "Workspace Trust"),
      text: `$(shield) ${localize("untrusted", "Restricted Mode")}`,
      ariaLabel,
      tooltip: toolTip,
      command: MANAGE_TRUST_COMMAND_ID,
      kind: "prominent"
    };
  }
  updateStatusbarEntry(trusted) {
    if (trusted && this.statusbarEntryAccessor.value) {
      this.statusbarEntryAccessor.clear();
      return;
    }
    if (!trusted && !this.statusbarEntryAccessor.value) {
      const entry = this.getRestrictedModeStatusbarEntry();
      this.statusbarEntryAccessor.value = this.statusbarService.addEntry(entry, this.entryId, StatusbarAlignment.LEFT, { location: { id: "status.host", priority: Number.POSITIVE_INFINITY }, alignment: StatusbarAlignment.RIGHT });
    }
  }
  //#endregion
};
WorkspaceTrustUXHandler = __decorateClass([
  __decorateParam(0, IDialogService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, IWorkspaceTrustEnablementService),
  __decorateParam(3, IWorkspaceTrustManagementService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IStatusbarService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IWorkspaceTrustRequestService),
  __decorateParam(8, IBannerService),
  __decorateParam(9, ILabelService),
  __decorateParam(10, IHostService),
  __decorateParam(11, IProductService),
  __decorateParam(12, IRemoteAgentService),
  __decorateParam(13, IWorkbenchEnvironmentService),
  __decorateParam(14, IFileService)
], WorkspaceTrustUXHandler);
registerWorkbenchContribution2(WorkspaceTrustRequestHandler.ID, WorkspaceTrustRequestHandler, WorkbenchPhase.BlockRestore);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceTrustUXHandler, LifecyclePhase.Restored);
class WorkspaceTrustEditorInputSerializer {
  canSerialize(editorInput) {
    return true;
  }
  serialize(input) {
    return "";
  }
  deserialize(instantiationService) {
    return instantiationService.createInstance(WorkspaceTrustEditorInput);
  }
}
Registry.as(EditorExtensions.EditorFactory).registerEditorSerializer(WorkspaceTrustEditorInput.ID, WorkspaceTrustEditorInputSerializer);
Registry.as(EditorExtensions.EditorPane).registerEditorPane(
  EditorPaneDescriptor.create(
    WorkspaceTrustEditor,
    WorkspaceTrustEditor.ID,
    localize("workspaceTrustEditor", "Workspace Trust Editor")
  ),
  [
    new SyncDescriptor(WorkspaceTrustEditorInput)
  ]
);
const CONFIGURE_TRUST_COMMAND_ID = "workbench.trust.configure";
const WORKSPACES_CATEGORY = localize2("workspacesCategory", "Workspaces");
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: CONFIGURE_TRUST_COMMAND_ID,
      title: localize2("configureWorkspaceTrustSettings", "Configure Workspace Trust Settings"),
      precondition: ContextKeyExpr.and(WorkspaceTrustContext.IsEnabled, ContextKeyExpr.equals(`config.${WORKSPACE_TRUST_ENABLED}`, true)),
      category: WORKSPACES_CATEGORY,
      f1: true
    });
  }
  run(accessor) {
    accessor.get(IPreferencesService).openUserSettings({ jsonEditor: false, query: `@tag:${WORKSPACE_TRUST_SETTING_TAG}` });
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: MANAGE_TRUST_COMMAND_ID,
      title: localize2("manageWorkspaceTrust", "Manage Workspace Trust"),
      precondition: ContextKeyExpr.and(WorkspaceTrustContext.IsEnabled, ContextKeyExpr.equals(`config.${WORKSPACE_TRUST_ENABLED}`, true)),
      category: WORKSPACES_CATEGORY,
      f1: true
    });
  }
  run(accessor) {
    const editorService = accessor.get(IEditorService);
    const instantiationService = accessor.get(IInstantiationService);
    const input = instantiationService.createInstance(WorkspaceTrustEditorInput);
    editorService.openEditor(input, { pinned: true });
    return;
  }
});
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  ...securityConfigurationNodeBase,
  properties: {
    [WORKSPACE_TRUST_ENABLED]: {
      type: "boolean",
      default: true,
      description: localize("workspace.trust.description", "Controls whether or not Workspace Trust is enabled within VS Code."),
      tags: [WORKSPACE_TRUST_SETTING_TAG],
      scope: ConfigurationScope.APPLICATION
    },
    [WORKSPACE_TRUST_STARTUP_PROMPT]: {
      type: "string",
      default: "never",
      description: localize("workspace.trust.startupPrompt.description", "Controls when the startup prompt to trust a workspace is shown."),
      tags: [WORKSPACE_TRUST_SETTING_TAG],
      scope: ConfigurationScope.APPLICATION,
      enum: ["always", "once", "never"],
      enumDescriptions: [
        localize("workspace.trust.startupPrompt.always", "Ask for trust every time an untrusted workspace is opened."),
        localize("workspace.trust.startupPrompt.once", "Ask for trust the first time an untrusted workspace is opened."),
        localize("workspace.trust.startupPrompt.never", "Do not ask for trust when an untrusted workspace is opened.")
      ]
    },
    [WORKSPACE_TRUST_BANNER]: {
      type: "string",
      default: "untilDismissed",
      description: localize("workspace.trust.banner.description", "Controls when the restricted mode banner is shown."),
      tags: [WORKSPACE_TRUST_SETTING_TAG],
      scope: ConfigurationScope.APPLICATION,
      enum: ["always", "untilDismissed", "never"],
      enumDescriptions: [
        localize("workspace.trust.banner.always", "Show the banner every time an untrusted workspace is open."),
        localize("workspace.trust.banner.untilDismissed", "Show the banner when an untrusted workspace is opened until dismissed."),
        localize("workspace.trust.banner.never", "Do not show the banner when an untrusted workspace is open.")
      ]
    },
    [WORKSPACE_TRUST_UNTRUSTED_FILES]: {
      type: "string",
      default: "prompt",
      markdownDescription: localize("workspace.trust.untrustedFiles.description", "Controls how to handle opening untrusted files in a trusted workspace. This setting also applies to opening files in an empty window which is trusted via `#{0}#`.", WORKSPACE_TRUST_EMPTY_WINDOW),
      tags: [WORKSPACE_TRUST_SETTING_TAG],
      scope: ConfigurationScope.APPLICATION,
      enum: ["prompt", "open", "newWindow"],
      enumDescriptions: [
        localize("workspace.trust.untrustedFiles.prompt", "Ask how to handle untrusted files for each workspace. Once untrusted files are introduced to a trusted workspace, you will not be prompted again."),
        localize("workspace.trust.untrustedFiles.open", "Always allow untrusted files to be introduced to a trusted workspace without prompting."),
        localize("workspace.trust.untrustedFiles.newWindow", "Always open untrusted files in a separate window in restricted mode without prompting.")
      ]
    },
    [WORKSPACE_TRUST_EMPTY_WINDOW]: {
      type: "boolean",
      default: true,
      markdownDescription: localize("workspace.trust.emptyWindow.description", "Controls whether or not the empty window is trusted by default within VS Code. When used with `#{0}#`, you can enable the full functionality of VS Code without prompting in an empty window.", WORKSPACE_TRUST_UNTRUSTED_FILES),
      tags: [WORKSPACE_TRUST_SETTING_TAG],
      scope: ConfigurationScope.APPLICATION
    }
  }
});
let WorkspaceTrustTelemetryContribution = class extends Disposable {
  constructor(environmentService, telemetryService, workspaceContextService, workspaceTrustEnablementService, workspaceTrustManagementService) {
    super();
    this.environmentService = environmentService;
    this.telemetryService = telemetryService;
    this.workspaceContextService = workspaceContextService;
    this.workspaceTrustEnablementService = workspaceTrustEnablementService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.workspaceTrustManagementService.workspaceTrustInitialized.then(() => {
      this.logInitialWorkspaceTrustInfo();
      this.logWorkspaceTrust(this.workspaceTrustManagementService.isWorkspaceTrusted());
      this._register(this.workspaceTrustManagementService.onDidChangeTrust((isTrusted) => this.logWorkspaceTrust(isTrusted)));
    });
  }
  logInitialWorkspaceTrustInfo() {
    if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
      const disabledByCliFlag = this.environmentService.disableWorkspaceTrust;
      this.telemetryService.publicLog2("workspaceTrustDisabled", {
        reason: disabledByCliFlag ? "cli" : "setting"
      });
      return;
    }
    this.telemetryService.publicLog2("workspaceTrustFolderCounts", {
      trustedFoldersCount: this.workspaceTrustManagementService.getTrustedUris().length
    });
  }
  async logWorkspaceTrust(isTrusted) {
    if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled()) {
      return;
    }
    this.telemetryService.publicLog2("workspaceTrustStateChanged", {
      workspaceId: this.workspaceContextService.getWorkspace().id,
      isTrusted
    });
    if (isTrusted) {
      const getDepth = (folder) => {
        let resolvedPath = resolve(folder);
        let depth = 0;
        while (dirname(resolvedPath) !== resolvedPath && depth < 100) {
          resolvedPath = dirname(resolvedPath);
          depth++;
        }
        return depth;
      };
      for (const folder of this.workspaceContextService.getWorkspace().folders) {
        const { trusted, uri } = await this.workspaceTrustManagementService.getUriTrustInfo(folder.uri);
        if (!trusted) {
          continue;
        }
        const workspaceFolderDepth = getDepth(folder.uri.fsPath);
        const trustedFolderDepth = getDepth(uri.fsPath);
        const delta = workspaceFolderDepth - trustedFolderDepth;
        this.telemetryService.publicLog2("workspaceFolderDepthBelowTrustedFolder", { workspaceFolderDepth, trustedFolderDepth, delta });
      }
    }
  }
};
WorkspaceTrustTelemetryContribution = __decorateClass([
  __decorateParam(0, IWorkbenchEnvironmentService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IWorkspaceTrustEnablementService),
  __decorateParam(4, IWorkspaceTrustManagementService)
], WorkspaceTrustTelemetryContribution);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(WorkspaceTrustTelemetryContribution, LifecyclePhase.Restored);
export {
  WorkspaceTrustContextKeys,
  WorkspaceTrustRequestHandler,
  WorkspaceTrustUXHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3dvcmtzcGFjZS9icm93c2VyL3dvcmtzcGFjZS5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvd29ya3NwYWNlVHJ1c3RFZGl0b3IuY3NzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlLCBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSwgSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UsIFdvcmtzcGFjZVRydXN0VXJpUmVzcG9uc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucywgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSwgV29ya2JlbmNoUGhhc2UsIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleSwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSVN0YXR1c2JhckVudHJ5LCBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciwgSVN0YXR1c2JhclNlcnZpY2UsIFN0YXR1c2JhckFsaWdubWVudCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUGFuZVJlZ2lzdHJ5LCBFZGl0b3JQYW5lRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yLmpzJztcbmltcG9ydCB7IHNoaWVsZEljb24sIFdvcmtzcGFjZVRydXN0RWRpdG9yIH0gZnJvbSAnLi93b3Jrc3BhY2VUcnVzdEVkaXRvci5qcyc7XG5pbXBvcnQgeyBXb3Jrc3BhY2VUcnVzdEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya3NwYWNlcy9icm93c2VyL3dvcmtzcGFjZVRydXN0RWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgV09SS1NQQUNFX1RSVVNUX0JBTk5FUiwgV09SS1NQQUNFX1RSVVNUX0VNUFRZX1dJTkRPVywgV09SS1NQQUNFX1RSVVNUX0VOQUJMRUQsIFdPUktTUEFDRV9UUlVTVF9TVEFSVFVQX1BST01QVCwgV09SS1NQQUNFX1RSVVNUX1VOVFJVU1RFRF9GSUxFUyB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJpYWxpemVyLCBJRWRpdG9yRmFjdG9yeVJlZ2lzdHJ5LCBFZGl0b3JFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBpc0VtcHR5V29ya3NwYWNlSWRlbnRpZmllciwgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIsIGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBJV29ya3NwYWNlRm9sZGVyc1dpbGxDaGFuZ2VFdmVudCwgdG9Xb3Jrc3BhY2VJZGVudGlmaWVyLCBXb3JrYmVuY2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGRpcm5hbWUsIHJlc29sdmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBJQmFubmVySXRlbSwgSUJhbm5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9iYW5uZXIvYnJvd3Nlci9iYW5uZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzVmlydHVhbFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vdmlydHVhbFdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBMSVNUX1dPUktTUEFDRV9VTlNVUFBPUlRFRF9FWFRFTlNJT05TX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFdPUktTUEFDRV9UUlVTVF9TRVRUSU5HX1RBRyB9IGZyb20gJy4uLy4uL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UsIFZlcmJvc2l0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBNQU5BR0VfVFJVU1RfQ09NTUFORF9JRCwgV29ya3NwYWNlVHJ1c3RDb250ZXh0IH0gZnJvbSAnLi4vY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBzZWN1cml0eUNvbmZpZ3VyYXRpb25Ob2RlQmFzZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lIGFzIHVyaURpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5cbmNvbnN0IEJBTk5FUl9SRVNUUklDVEVEX01PREUgPSAnd29ya2JlbmNoLmJhbm5lci5yZXN0cmljdGVkTW9kZSc7XG5jb25zdCBTVEFSVFVQX1BST01QVF9TSE9XTl9LRVkgPSAnd29ya3NwYWNlLnRydXN0LnN0YXJ0dXBQcm9tcHQuc2hvd24nO1xuY29uc3QgQkFOTkVSX1JFU1RSSUNURURfTU9ERV9ESVNNSVNTRURfS0VZID0gJ3dvcmtiZW5jaC5iYW5uZXIucmVzdHJpY3RlZE1vZGUuZGlzbWlzc2VkJztcblxuLyoqXG4gKiBSZXR1cm5zIGEgdHJ1c3Qgbm90ZSBzdHJpbmcgZm9yIHRoZSBzZXNzaW9ucyB3aW5kb3cgZXhwbGFpbmluZyB0aGF0IHRydXN0aW5nXG4gKiBhIGZvbGRlci93b3Jrc3BhY2UgYWxzbyBwZXJzaXN0cyB0cnVzdCB0byB0aGUgcGFyZW50IFZTIENvZGUgaW5zdGFsbC5cbiAqIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiBub3QgcnVubmluZyBpbiB0aGUgc2Vzc2lvbnMgd2luZG93LlxuICovXG5mdW5jdGlvbiBnZXRTZXNzaW9uc1dpbmRvd1RydXN0Tm90ZShlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsIGlzV29ya3NwYWNlOiBib29sZWFuKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFlbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKGlzV29ya3NwYWNlKSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdzZXNzaW9uc1dpbmRvd1dvcmtzcGFjZVRydXN0Tm90ZScsIFwiVHJ1c3RpbmcgdGhpcyB3b3Jrc3BhY2Ugd2lsbCBhbHNvIG1hcmsgaXQgYXMgdHJ1c3RlZCBpbiB7MH0uXCIsIHByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKTtcblx0fVxuXHRyZXR1cm4gbG9jYWxpemUoJ3Nlc3Npb25zV2luZG93Rm9sZGVyVHJ1c3ROb3RlJywgXCJUcnVzdGluZyB0aGlzIGZvbGRlciB3aWxsIGFsc28gbWFyayBpdCBhcyB0cnVzdGVkIGluIHswfS5cIiwgcHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpO1xufVxuXG5leHBvcnQgY2xhc3MgV29ya3NwYWNlVHJ1c3RDb250ZXh0S2V5cyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHhXb3Jrc3BhY2VUcnVzdEVuYWJsZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jdHhXb3Jrc3BhY2VUcnVzdFN0YXRlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlIHdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fY3R4V29ya3NwYWNlVHJ1c3RFbmFibGVkID0gV29ya3NwYWNlVHJ1c3RDb250ZXh0LklzRW5hYmxlZC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuX2N0eFdvcmtzcGFjZVRydXN0RW5hYmxlZC5zZXQod29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0RW5hYmxlZCgpKTtcblxuXHRcdHRoaXMuX2N0eFdvcmtzcGFjZVRydXN0U3RhdGUgPSBXb3Jrc3BhY2VUcnVzdENvbnRleHQuSXNUcnVzdGVkLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY3R4V29ya3NwYWNlVHJ1c3RTdGF0ZS5zZXQod29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3QodHJ1c3RlZCA9PiB0aGlzLl9jdHhXb3Jrc3BhY2VUcnVzdFN0YXRlLnNldCh0cnVzdGVkKSkpO1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihXb3Jrc3BhY2VUcnVzdENvbnRleHRLZXlzLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG5cblxuLypcbiAqIFRydXN0IFJlcXVlc3QgdmlhIFNlcnZpY2UgVVggaGFuZGxlclxuICovXG5cbmV4cG9ydCBjbGFzcyBXb3Jrc3BhY2VUcnVzdFJlcXVlc3RIYW5kbGVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi53b3Jrc3BhY2VUcnVzdFJlcXVlc3RIYW5kbGVyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldCB1c2VXb3Jrc3BhY2VMYW5ndWFnZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIWlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcih0b1dvcmtzcGFjZUlkZW50aWZpZXIodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblxuXHRcdC8vIE9wZW4gZmlsZXMgdHJ1c3QgcmVxdWVzdFxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5vbkRpZEluaXRpYXRlT3BlbkZpbGVzVHJ1c3RSZXF1ZXN0KGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS53b3Jrc3BhY2VSZXNvbHZlZDtcblxuXHRcdFx0Ly8gRGV0YWlsc1xuXHRcdFx0Y29uc3QgbWFya2Rvd25EZXRhaWxzID0gW1xuXHRcdFx0XHR0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZID9cblx0XHRcdFx0XHRsb2NhbGl6ZSgnb3Blbkxvb3NlRmlsZVdvcmtzcGFjZURldGFpbHMnLCBcIllvdSBhcmUgdHJ5aW5nIHRvIG9wZW4gdW50cnVzdGVkIGZpbGVzIGluIGEgd29ya3NwYWNlIHdoaWNoIGlzIHRydXN0ZWQuXCIpIDpcblx0XHRcdFx0XHRsb2NhbGl6ZSgnb3Blbkxvb3NlRmlsZVdpbmRvd0RldGFpbHMnLCBcIllvdSBhcmUgdHJ5aW5nIHRvIG9wZW4gdW50cnVzdGVkIGZpbGVzIGluIGEgd2luZG93IHdoaWNoIGlzIHRydXN0ZWQuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnb3Blbkxvb3NlRmlsZUxlYXJuTW9yZScsIFwiSWYgeW91IGRvbid0IHdhbnQgdG8gb3BlbiB1bnRydXN0ZWQgZmlsZXMsIHdlIHJlY29tbWVuZCB0byBvcGVuIHRoZW0gaW4gUmVzdHJpY3RlZCBNb2RlIGluIGEgbmV3IHdpbmRvdyBhcyB0aGUgZmlsZXMgbWF5IGJlIG1hbGljaW91cy4gU2VlIFtvdXIgZG9jc10oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXdvcmtzcGFjZS10cnVzdCkgdG8gbGVhcm4gbW9yZS5cIilcblx0XHRcdF07XG5cblx0XHRcdC8vIERpYWxvZ1xuXHRcdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdDx2b2lkPih7XG5cdFx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdG1lc3NhZ2U6IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFkgP1xuXHRcdFx0XHRcdGxvY2FsaXplKCdvcGVuTG9vc2VGaWxlV29ya3NwYWNlTWVzc3NhZ2UnLCBcIkRvIHlvdSB3YW50IHRvIGFsbG93IHVudHJ1c3RlZCBmaWxlcyBpbiB0aGlzIHdvcmtzcGFjZT9cIikgOlxuXHRcdFx0XHRcdGxvY2FsaXplKCdvcGVuTG9vc2VGaWxlV2luZG93TWVzc3NhZ2UnLCBcIkRvIHlvdSB3YW50IHRvIGFsbG93IHVudHJ1c3RlZCBmaWxlcyBpbiB0aGlzIHdpbmRvdz9cIiksXG5cdFx0XHRcdGJ1dHRvbnM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICdvcGVuJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmT3BlblwiKSxcblx0XHRcdFx0XHRcdHJ1bjogKHsgY2hlY2tib3hDaGVja2VkIH0pID0+IHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5jb21wbGV0ZU9wZW5GaWxlc1RydXN0UmVxdWVzdChXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLk9wZW4sICEhY2hlY2tib3hDaGVja2VkKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAnbmV3V2luZG93JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIk9wZW4gaW4gJiZSZXN0cmljdGVkIE1vZGVcIiksXG5cdFx0XHRcdFx0XHRydW46ICh7IGNoZWNrYm94Q2hlY2tlZCB9KSA9PiB0aGlzLndvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UuY29tcGxldGVPcGVuRmlsZXNUcnVzdFJlcXVlc3QoV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZS5PcGVuSW5OZXdXaW5kb3csICEhY2hlY2tib3hDaGVja2VkKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB7XG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLndvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UuY29tcGxldGVPcGVuRmlsZXNUcnVzdFJlcXVlc3QoV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZS5DYW5jZWwpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNoZWNrYm94OiB7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdvcGVuTG9vc2VGaWxlV29ya3NwYWNlQ2hlY2tib3gnLCBcIlJlbWVtYmVyIG15IGRlY2lzaW9uIGZvciBhbGwgd29ya3NwYWNlc1wiKSxcblx0XHRcdFx0XHRjaGVja2VkOiBmYWxzZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjdXN0b206IHtcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnNoaWVsZCxcblx0XHRcdFx0XHRtYXJrZG93bkRldGFpbHM6IG1hcmtkb3duRGV0YWlscy5tYXAobWQgPT4geyByZXR1cm4geyBtYXJrZG93bjogbmV3IE1hcmtkb3duU3RyaW5nKG1kKSB9OyB9KVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHQvLyBSZXNvdXJjZXMgdHJ1c3QgcmVxdWVzdFxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5vbkRpZEluaXRpYXRlUmVzb3VyY2VzVHJ1c3RSZXF1ZXN0KGFzeW5jIChvcHRpb25zKSA9PiB7XG5cdFx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uud29ya3NwYWNlUmVzb2x2ZWQ7XG5cblx0XHRcdC8vIERldGFpbHNcblx0XHRcdGNvbnN0IG1hcmtkb3duRGV0YWlscyA9IFtcblx0XHRcdFx0b3B0aW9ucz8ubWVzc2FnZSA/PyBsb2NhbGl6ZSgncmVzb3VyY2VzVHJ1c3REZXRhaWxzJywgXCJZb3UgYXJlIHRyeWluZyB0byBvcGVuIGFuIHVudHJ1c3RlZCBmb2xkZXIuIERvIHlvdSB0cnVzdCB0aGUgYXV0aG9ycyBvZiB0aGlzIGNvbnRlbnQ/XCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgncmVzb3VyY2VzVHJ1c3RMZWFybk1vcmUnLCBcIklmIHlvdSBkb24ndCB0cnVzdCB0aGUgYXV0aG9ycyBvZiB0aGVzZSBmaWxlcywgd2UgcmVjb21tZW5kIG5vdCBjb250aW51aW5nIGFzIHRoZSBmaWxlcyBtYXkgYmUgbWFsaWNpb3VzLiBTZWUgW291ciBkb2NzXShodHRwczovL2FrYS5tcy92c2NvZGUtd29ya3NwYWNlLXRydXN0KSB0byBsZWFybiBtb3JlLlwiKSxcblx0XHRcdFx0YFxcYCR7dGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwob3B0aW9ucy51cmkpfVxcYGBcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHNlc3Npb25zVHJ1c3ROb3RlID0gZ2V0U2Vzc2lvbnNXaW5kb3dUcnVzdE5vdGUodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMucHJvZHVjdFNlcnZpY2UsIGZhbHNlKTtcblx0XHRcdGlmIChzZXNzaW9uc1RydXN0Tm90ZSkge1xuXHRcdFx0XHRtYXJrZG93bkRldGFpbHMucHVzaChzZXNzaW9uc1RydXN0Tm90ZSk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIERpYWxvZ1xuXHRcdFx0YXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLnByb21wdDx2b2lkPih7XG5cdFx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdyZXNvdXJjZXNUcnVzdE1lc3NhZ2UnLCBcIkRvIHlvdSB0cnVzdCB0aGUgYXV0aG9ycyBvZiB0aGUgZmlsZXMgaW4gdGhpcyBmb2xkZXI/XCIpLFxuXHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAndHJ1c3RSZXNvdXJjZXMnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZUcnVzdCBGb2xkZXIgJiBDb250aW51ZVwiKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLmNvbXBsZXRlUmVzb3VyY2VzVHJ1c3RSZXF1ZXN0KG9wdGlvbnMudXJpLCBXb3Jrc3BhY2VUcnVzdFVyaVJlc3BvbnNlLk9wZW4pXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRjYW5jZWxCdXR0b246IHtcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5jb21wbGV0ZVJlc291cmNlc1RydXN0UmVxdWVzdChvcHRpb25zLnVyaSwgV29ya3NwYWNlVHJ1c3RVcmlSZXNwb25zZS5DYW5jZWwpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGN1c3RvbToge1xuXHRcdFx0XHRcdGljb246IENvZGljb24uc2hpZWxkLFxuXHRcdFx0XHRcdG1hcmtkb3duRGV0YWlsczogbWFya2Rvd25EZXRhaWxzLm1hcChtZCA9PiB7IHJldHVybiB7IG1hcmtkb3duOiBuZXcgTWFya2Rvd25TdHJpbmcobWQpIH07IH0pXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdC8vIFdvcmtzcGFjZSB0cnVzdCByZXF1ZXN0XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLm9uRGlkSW5pdGlhdGVXb3Jrc3BhY2VUcnVzdFJlcXVlc3QoYXN5bmMgcmVxdWVzdE9wdGlvbnMgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLndvcmtzcGFjZVJlc29sdmVkO1xuXG5cdFx0XHQvLyBUaXRsZVxuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IHRoaXMudXNlV29ya3NwYWNlTGFuZ3VhZ2UgP1xuXHRcdFx0XHRsb2NhbGl6ZSgnd29ya3NwYWNlVHJ1c3QnLCBcIkRvIHlvdSB0cnVzdCB0aGUgYXV0aG9ycyBvZiB0aGUgZmlsZXMgaW4gdGhpcyB3b3Jrc3BhY2U/XCIpIDpcblx0XHRcdFx0bG9jYWxpemUoJ2ZvbGRlclRydXN0JywgXCJEbyB5b3UgdHJ1c3QgdGhlIGF1dGhvcnMgb2YgdGhlIGZpbGVzIGluIHRoaXMgZm9sZGVyP1wiKTtcblxuXHRcdFx0Ly8gTWVzc2FnZVxuXHRcdFx0Y29uc3QgZGVmYXVsdERldGFpbHMgPSBsb2NhbGl6ZSgnaW1tZWRpYXRlVHJ1c3RSZXF1ZXN0TWVzc2FnZScsIFwiQSBmZWF0dXJlIHlvdSBhcmUgdHJ5aW5nIHRvIHVzZSBtYXkgYmUgYSBzZWN1cml0eSByaXNrIGlmIHlvdSBkbyBub3QgdHJ1c3QgdGhlIHNvdXJjZSBvZiB0aGUgZmlsZXMgb3IgZm9sZGVycyB5b3UgY3VycmVudGx5IGhhdmUgb3Blbi5cIik7XG5cdFx0XHRjb25zdCBkZXRhaWxzID0gcmVxdWVzdE9wdGlvbnM/Lm1lc3NhZ2UgPz8gZGVmYXVsdERldGFpbHM7XG5cblx0XHRcdC8vIEJ1dHRvbnNcblx0XHRcdGNvbnN0IGJ1dHRvbnMgPSByZXF1ZXN0T3B0aW9ucz8uYnV0dG9ucyA/PyBbXG5cdFx0XHRcdHsgbGFiZWw6IHRoaXMudXNlV29ya3NwYWNlTGFuZ3VhZ2UgPyBsb2NhbGl6ZSh7IGtleTogJ2dyYW50V29ya3NwYWNlVHJ1c3RCdXR0b24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZUcnVzdCBXb3Jrc3BhY2UgJiBDb250aW51ZVwiKSA6IGxvY2FsaXplKHsga2V5OiAnZ3JhbnRGb2xkZXJUcnVzdEJ1dHRvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlRydXN0IEZvbGRlciAmIENvbnRpbnVlXCIpLCB0eXBlOiAnQ29udGludWVXaXRoVHJ1c3QnIH0sXG5cdFx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKHsga2V5OiAnbWFuYWdlV29ya3NwYWNlVHJ1c3RCdXR0b24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZNYW5hZ2VcIiksIHR5cGU6ICdNYW5hZ2UnIH1cblx0XHRcdF07XG5cblx0XHRcdC8vIEFkZCBDYW5jZWwgYnV0dG9uIGlmIG5vdCBwcm92aWRlZFxuXHRcdFx0aWYgKCFidXR0b25zLnNvbWUoYiA9PiBiLnR5cGUgPT09ICdDYW5jZWwnKSkge1xuXHRcdFx0XHRidXR0b25zLnB1c2goeyBsYWJlbDogbG9jYWxpemUoJ2NhbmNlbFdvcmtzcGFjZVRydXN0QnV0dG9uJywgXCJDYW5jZWxcIiksIHR5cGU6ICdDYW5jZWwnIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBEaWFsb2dcblx0XHRcdGNvbnN0IG1hcmtkb3duRGV0YWlscyA9IFtcblx0XHRcdFx0eyBtYXJrZG93bjogbmV3IE1hcmtkb3duU3RyaW5nKGRldGFpbHMpIH0sXG5cdFx0XHRcdHsgbWFya2Rvd246IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnaW1tZWRpYXRlVHJ1c3RSZXF1ZXN0TGVhcm5Nb3JlJywgXCJJZiB5b3UgZG9uJ3QgdHJ1c3QgdGhlIGF1dGhvcnMgb2YgdGhlc2UgZmlsZXMsIHdlIGRvIG5vdCByZWNvbW1lbmQgY29udGludWluZyBhcyB0aGUgZmlsZXMgbWF5IGJlIG1hbGljaW91cy4gU2VlIFtvdXIgZG9jc10oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXdvcmtzcGFjZS10cnVzdCkgdG8gbGVhcm4gbW9yZS5cIikpIH1cblx0XHRcdF07XG5cdFx0XHRjb25zdCBzZXNzaW9uc1RydXN0Tm90ZSA9IGdldFNlc3Npb25zV2luZG93VHJ1c3ROb3RlKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLCB0aGlzLnVzZVdvcmtzcGFjZUxhbmd1YWdlKTtcblx0XHRcdGlmIChzZXNzaW9uc1RydXN0Tm90ZSkge1xuXHRcdFx0XHRtYXJrZG93bkRldGFpbHMucHVzaCh7IG1hcmtkb3duOiBuZXcgTWFya2Rvd25TdHJpbmcoc2Vzc2lvbnNUcnVzdE5vdGUpIH0pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgeyByZXN1bHQgfSA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRjdXN0b206IHtcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLnNoaWVsZCxcblx0XHRcdFx0XHRtYXJrZG93bkRldGFpbHNcblx0XHRcdFx0fSxcblx0XHRcdFx0YnV0dG9uczogYnV0dG9ucy5maWx0ZXIoYiA9PiBiLnR5cGUgIT09ICdDYW5jZWwnKS5tYXAoYnV0dG9uID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0bGFiZWw6IGJ1dHRvbi5sYWJlbCxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gYnV0dG9uLnR5cGVcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9KSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiAoKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNhbmNlbEJ1dHRvbiA9IGJ1dHRvbnMuZmluZChiID0+IGIudHlwZSA9PT0gJ0NhbmNlbCcpO1xuXHRcdFx0XHRcdGlmICghY2FuY2VsQnV0dG9uKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRsYWJlbDogY2FuY2VsQnV0dG9uLmxhYmVsLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiBjYW5jZWxCdXR0b24udHlwZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pKClcblx0XHRcdH0pO1xuXG5cblx0XHRcdC8vIERpYWxvZyByZXN1bHRcblx0XHRcdHN3aXRjaCAocmVzdWx0KSB7XG5cdFx0XHRcdGNhc2UgJ0NvbnRpbnVlV2l0aFRydXN0Jzpcblx0XHRcdFx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UuY29tcGxldGVXb3Jrc3BhY2VUcnVzdFJlcXVlc3QodHJ1ZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ0NvbnRpbnVlV2l0aG91dFRydXN0Jzpcblx0XHRcdFx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UuY29tcGxldGVXb3Jrc3BhY2VUcnVzdFJlcXVlc3QodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnTWFuYWdlJzpcblx0XHRcdFx0XHR0aGlzLndvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UuY2FuY2VsV29ya3NwYWNlVHJ1c3RSZXF1ZXN0KCk7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChNQU5BR0VfVFJVU1RfQ09NTUFORF9JRCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgJ0NhbmNlbCc6XG5cdFx0XHRcdFx0dGhpcy53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLmNhbmNlbFdvcmtzcGFjZVRydXN0UmVxdWVzdCgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufVxuXG5cbi8qXG4gKiBUcnVzdCBVWCBhbmQgU3RhcnR1cCBIYW5kbGVyXG4gKi9cbmV4cG9ydCBjbGFzcyBXb3Jrc3BhY2VUcnVzdFVYSGFuZGxlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVudHJ5SWQgPSBgc3RhdHVzLndvcmtzcGFjZVRydXN0YDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHN0YXR1c2JhckVudHJ5QWNjZXNzb3I6IE11dGFibGVEaXNwb3NhYmxlPElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVN0YXR1c2JhclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdGF0dXNiYXJTZXJ2aWNlOiBJU3RhdHVzYmFyU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSxcblx0XHRASUJhbm5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBiYW5uZXJTZXJ2aWNlOiBJQmFubmVyU2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuc3RhdHVzYmFyRW50cnlBY2Nlc3NvciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJU3RhdHVzYmFyRW50cnlBY2Nlc3Nvcj4oKSk7XG5cblx0XHQoYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uud29ya3NwYWNlVHJ1c3RJbml0aWFsaXplZDtcblxuXHRcdFx0aWYgKHRoaXMud29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0RW5hYmxlZCgpKSB7XG5cdFx0XHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0XHRcdFx0dGhpcy51cGRhdGVTdGF0dXNiYXJFbnRyeSh0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkpO1xuXG5cdFx0XHRcdC8vIFNob3cgbW9kYWwgZGlhbG9nXG5cdFx0XHRcdGlmICh0aGlzLmhvc3RTZXJ2aWNlLmhhc0ZvY3VzKSB7XG5cdFx0XHRcdFx0dGhpcy5zaG93TW9kYWxPblN0YXJ0KCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgZm9jdXNEaXNwb3NhYmxlID0gdGhpcy5ob3N0U2VydmljZS5vbkRpZENoYW5nZUZvY3VzKGZvY3VzZWQgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGZvY3VzZWQpIHtcblx0XHRcdFx0XHRcdFx0Zm9jdXNEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdFx0dGhpcy5zaG93TW9kYWxPblN0YXJ0KCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSgpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3Rlckxpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLm9uV2lsbENoYW5nZVdvcmtzcGFjZUZvbGRlcnMoZSA9PiB7XG5cdFx0XHRpZiAoZS5mcm9tQ2FjaGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCF0aGlzLndvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdEVuYWJsZWQoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFkZFdvcmtzcGFjZUZvbGRlciA9IGFzeW5jIChlOiBJV29ya3NwYWNlRm9sZGVyc1dpbGxDaGFuZ2VFdmVudCk6IFByb21pc2U8dm9pZD4gPT4ge1xuXHRcdFx0XHRjb25zdCB0cnVzdGVkID0gdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpO1xuXG5cdFx0XHRcdC8vIFdvcmtzcGFjZSBpcyB0cnVzdGVkIGFuZCB0aGVyZSBhcmUgYWRkZWQvY2hhbmdlZCBmb2xkZXJzXG5cdFx0XHRcdGlmICh0cnVzdGVkICYmIChlLmNoYW5nZXMuYWRkZWQubGVuZ3RoIHx8IGUuY2hhbmdlcy5jaGFuZ2VkLmxlbmd0aCkpIHtcblx0XHRcdFx0XHRjb25zdCBhZGRlZEZvbGRlcnNUcnVzdEluZm8gPSBhd2FpdCBQcm9taXNlLmFsbChlLmNoYW5nZXMuYWRkZWQubWFwKGZvbGRlciA9PiB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuZ2V0VXJpVHJ1c3RJbmZvKGZvbGRlci51cmkpKSk7XG5cblx0XHRcdFx0XHRpZiAoIWFkZGVkRm9sZGVyc1RydXN0SW5mby5tYXAoaW5mbyA9PiBpbmZvLnRydXN0ZWQpLmV2ZXJ5KHRydXN0ZWQgPT4gdHJ1c3RlZCkpIHtcblx0XHRcdFx0XHRcdGxldCBkZXRhaWwgPSBsb2NhbGl6ZSgnYWRkV29ya3NwYWNlRm9sZGVyRGV0YWlsJywgXCJZb3UgYXJlIGFkZGluZyBmaWxlcyB0aGF0IGFyZSBub3QgY3VycmVudGx5IHRydXN0ZWQgdG8gYSB0cnVzdGVkIHdvcmtzcGFjZS4gRG8geW91IHRydXN0IHRoZSBhdXRob3JzIG9mIHRoZXNlIG5ldyBmaWxlcz9cIik7XG5cdFx0XHRcdFx0XHRjb25zdCBzZXNzaW9uc1RydXN0Tm90ZSA9IGdldFNlc3Npb25zV2luZG93VHJ1c3ROb3RlKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLCBmYWxzZSk7XG5cdFx0XHRcdFx0XHRpZiAoc2Vzc2lvbnNUcnVzdE5vdGUpIHtcblx0XHRcdFx0XHRcdFx0ZGV0YWlsICs9ICdcXG5cXG4nICsgc2Vzc2lvbnNUcnVzdE5vdGU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnYWRkV29ya3NwYWNlRm9sZGVyTWVzc2FnZScsIFwiRG8geW91IHRydXN0IHRoZSBhdXRob3JzIG9mIHRoZSBmaWxlcyBpbiB0aGlzIGZvbGRlcj9cIiksXG5cdFx0XHRcdFx0XHRcdGRldGFpbCxcblx0XHRcdFx0XHRcdFx0Y2FuY2VsQnV0dG9uOiBsb2NhbGl6ZSgnbm8nLCAnTm8nKSxcblx0XHRcdFx0XHRcdFx0Y3VzdG9tOiB7IGljb246IENvZGljb24uc2hpZWxkIH1cblx0XHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0XHQvLyBNYXJrIGFkZGVkL2NoYW5nZWQgZm9sZGVycyBhcyB0cnVzdGVkXG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uuc2V0VXJpc1RydXN0KGFkZGVkRm9sZGVyc1RydXN0SW5mby5tYXAoaSA9PiBpLnVyaSksIGNvbmZpcm1lZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRyZXR1cm4gZS5qb2luKGFkZFdvcmtzcGFjZUZvbGRlcihlKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLm9uRGlkQ2hhbmdlVHJ1c3QodHJ1c3RlZCA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZVdvcmtiZW5jaEluZGljYXRvcnModHJ1c3RlZCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53b3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLm9uRGlkSW5pdGlhdGVXb3Jrc3BhY2VUcnVzdFJlcXVlc3RPblN0YXJ0dXAoYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRsZXQgdGl0bGVTdHJpbmc6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBsZWFybk1vcmVTdHJpbmc6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCB0cnVzdE9wdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGRvbnRUcnVzdE9wdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgaXNBaUdlbmVyYXRlZFdvcmtzcGFjZSA9IGF3YWl0IHRoaXMuaXNBaUdlbmVyYXRlZFdvcmtzcGFjZSgpO1xuXHRcdFx0aWYgKGlzQWlHZW5lcmF0ZWRXb3Jrc3BhY2UgJiYgdGhpcy5wcm9kdWN0U2VydmljZS5haUdlbmVyYXRlZFdvcmtzcGFjZVRydXN0KSB7XG5cdFx0XHRcdHRpdGxlU3RyaW5nID0gdGhpcy5wcm9kdWN0U2VydmljZS5haUdlbmVyYXRlZFdvcmtzcGFjZVRydXN0LnRpdGxlO1xuXHRcdFx0XHRsZWFybk1vcmVTdHJpbmcgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLmFpR2VuZXJhdGVkV29ya3NwYWNlVHJ1c3Quc3RhcnR1cFRydXN0UmVxdWVzdExlYXJuTW9yZTtcblx0XHRcdFx0dHJ1c3RPcHRpb24gPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLmFpR2VuZXJhdGVkV29ya3NwYWNlVHJ1c3QudHJ1c3RPcHRpb247XG5cdFx0XHRcdGRvbnRUcnVzdE9wdGlvbiA9IHRoaXMucHJvZHVjdFNlcnZpY2UuYWlHZW5lcmF0ZWRXb3Jrc3BhY2VUcnVzdC5kb250VHJ1c3RPcHRpb247XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oJ0FJIGdlbmVyYXRlZCB3b3Jrc3BhY2UgdHJ1c3QgZGlhbG9nIGNvbnRlbnRzIG5vdCBhdmFpbGFibGUuJyk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRpdGxlID0gdGl0bGVTdHJpbmcgPz8gKHRoaXMudXNlV29ya3NwYWNlTGFuZ3VhZ2UgP1xuXHRcdFx0XHRsb2NhbGl6ZSgnd29ya3NwYWNlVHJ1c3QnLCBcIkRvIHlvdSB0cnVzdCB0aGUgYXV0aG9ycyBvZiB0aGUgZmlsZXMgaW4gdGhpcyB3b3Jrc3BhY2U/XCIpIDpcblx0XHRcdFx0bG9jYWxpemUoJ2ZvbGRlclRydXN0JywgXCJEbyB5b3UgdHJ1c3QgdGhlIGF1dGhvcnMgb2YgdGhlIGZpbGVzIGluIHRoaXMgZm9sZGVyP1wiKSk7XG5cblx0XHRcdGxldCBjaGVja2JveFRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZUlkZW50aWZpZXIgPSB0b1dvcmtzcGFjZUlkZW50aWZpZXIodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSk7XG5cdFx0XHRjb25zdCBpc1NpbmdsZUZvbGRlcldvcmtzcGFjZSA9IGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcih3b3Jrc3BhY2VJZGVudGlmaWVyKTtcblx0XHRcdGNvbnN0IGlzRW1wdHlXaW5kb3cgPSBpc0VtcHR5V29ya3NwYWNlSWRlbnRpZmllcih3b3Jrc3BhY2VJZGVudGlmaWVyKTtcblx0XHRcdGlmICghaXNBaUdlbmVyYXRlZFdvcmtzcGFjZSAmJiB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuY2FuU2V0UGFyZW50Rm9sZGVyVHJ1c3QoKSkge1xuXHRcdFx0XHRjb25zdCBuYW1lID0gYmFzZW5hbWUodXJpRGlybmFtZSgod29ya3NwYWNlSWRlbnRpZmllciBhcyBJU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcikudXJpKSk7XG5cdFx0XHRcdGNoZWNrYm94VGV4dCA9IGxvY2FsaXplKCdjaGVja2JveFN0cmluZycsIFwiVHJ1c3QgdGhlIGF1dGhvcnMgb2YgYWxsIGZpbGVzIGluIHRoZSBwYXJlbnQgZm9sZGVyICd7MH0nXCIsIG5hbWUpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTaG93IFdvcmtzcGFjZSBUcnVzdCBTdGFydCBEaWFsb2dcblx0XHRcdGNvbnN0IG1hcmtkb3duU3RyaW5ncyA9IFtcblx0XHRcdFx0IWlzU2luZ2xlRm9sZGVyV29ya3NwYWNlID9cblx0XHRcdFx0XHRsb2NhbGl6ZSgnd29ya3NwYWNlU3RhcnR1cFRydXN0RGV0YWlscycsIFwiezB9IHByb3ZpZGVzIGZlYXR1cmVzIHRoYXQgbWF5IGF1dG9tYXRpY2FsbHkgZXhlY3V0ZSBmaWxlcyBpbiB0aGlzIHdvcmtzcGFjZS5cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lU2hvcnQpIDpcblx0XHRcdFx0XHRsb2NhbGl6ZSgnZm9sZGVyU3RhcnR1cFRydXN0RGV0YWlscycsIFwiezB9IHByb3ZpZGVzIGZlYXR1cmVzIHRoYXQgbWF5IGF1dG9tYXRpY2FsbHkgZXhlY3V0ZSBmaWxlcyBpbiB0aGlzIGZvbGRlci5cIiwgdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lU2hvcnQpLFxuXHRcdFx0XHRsZWFybk1vcmVTdHJpbmcgPz8gbG9jYWxpemUoJ3N0YXJ0dXBUcnVzdFJlcXVlc3RMZWFybk1vcmUnLCBcIklmIHlvdSBkb24ndCB0cnVzdCB0aGUgYXV0aG9ycyBvZiB0aGVzZSBmaWxlcywgd2UgcmVjb21tZW5kIHRvIGNvbnRpbnVlIGluIHJlc3RyaWN0ZWQgbW9kZSBhcyB0aGUgZmlsZXMgbWF5IGJlIG1hbGljaW91cy4gU2VlIFtvdXIgZG9jc10oaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXdvcmtzcGFjZS10cnVzdCkgdG8gbGVhcm4gbW9yZS5cIiksXG5cdFx0XHRcdCFpc0VtcHR5V2luZG93ID9cblx0XHRcdFx0XHRgXFxgJHt0aGlzLmxhYmVsU2VydmljZS5nZXRXb3Jrc3BhY2VMYWJlbCh3b3Jrc3BhY2VJZGVudGlmaWVyLCB7IHZlcmJvc2U6IFZlcmJvc2l0eS5MT05HIH0pfVxcYGAgOiAnJyxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBzZXNzaW9uc1RydXN0Tm90ZSA9IGdldFNlc3Npb25zV2luZG93VHJ1c3ROb3RlKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLCAhaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2UpO1xuXHRcdFx0aWYgKHNlc3Npb25zVHJ1c3ROb3RlKSB7XG5cdFx0XHRcdG1hcmtkb3duU3RyaW5ncy5wdXNoKHNlc3Npb25zVHJ1c3ROb3RlKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuZG9TaG93TW9kYWwoXG5cdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHR7IGxhYmVsOiB0cnVzdE9wdGlvbiA/PyBsb2NhbGl6ZSh7IGtleTogJ3RydXN0T3B0aW9uJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmWWVzLCBJIHRydXN0IHRoZSBhdXRob3JzXCIpLCBzdWJsYWJlbDogaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2UgPyBsb2NhbGl6ZSgndHJ1c3RGb2xkZXJPcHRpb25EZXNjcmlwdGlvbicsIFwiVHJ1c3QgZm9sZGVyIGFuZCBlbmFibGUgYWxsIGZlYXR1cmVzXCIpIDogbG9jYWxpemUoJ3RydXN0V29ya3NwYWNlT3B0aW9uRGVzY3JpcHRpb24nLCBcIlRydXN0IHdvcmtzcGFjZSBhbmQgZW5hYmxlIGFsbCBmZWF0dXJlc1wiKSB9LFxuXHRcdFx0XHR7IGxhYmVsOiBkb250VHJ1c3RPcHRpb24gPz8gbG9jYWxpemUoeyBrZXk6ICdkb250VHJ1c3RPcHRpb24nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZObywgSSBkb24ndCB0cnVzdCB0aGUgYXV0aG9yc1wiKSwgc3VibGFiZWw6IGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlID8gbG9jYWxpemUoJ2RvbnRUcnVzdEZvbGRlck9wdGlvbkRlc2NyaXB0aW9uJywgXCJPcGVuIGZvbGRlciBpbiByZXN0cmljdGVkIG1vZGVcIikgOiBsb2NhbGl6ZSgnZG9udFRydXN0V29ya3NwYWNlT3B0aW9uRGVzY3JpcHRpb24nLCBcIk9wZW4gd29ya3NwYWNlIGluIHJlc3RyaWN0ZWQgbW9kZVwiKSB9LFxuXHRcdFx0XHRtYXJrZG93blN0cmluZ3MsXG5cdFx0XHRcdGNoZWNrYm94VGV4dFxuXHRcdFx0KTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVdvcmtiZW5jaEluZGljYXRvcnModHJ1c3RlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGJhbm5lckl0ZW0gPSB0aGlzLmdldEJhbm5lckl0ZW0oIXRydXN0ZWQpO1xuXG5cdFx0dGhpcy51cGRhdGVTdGF0dXNiYXJFbnRyeSh0cnVzdGVkKTtcblxuXHRcdGlmIChiYW5uZXJJdGVtKSB7XG5cdFx0XHRpZiAoIXRydXN0ZWQpIHtcblx0XHRcdFx0dGhpcy5iYW5uZXJTZXJ2aWNlLnNob3coYmFubmVySXRlbSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmJhbm5lclNlcnZpY2UuaGlkZShCQU5ORVJfUkVTVFJJQ1RFRF9NT0RFKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvLyNyZWdpb24gRGlhbG9nXG5cblx0cHJpdmF0ZSBhc3luYyBkb1Nob3dNb2RhbChxdWVzdGlvbjogc3RyaW5nLCB0cnVzdGVkT3B0aW9uOiB7IGxhYmVsOiBzdHJpbmc7IHN1YmxhYmVsOiBzdHJpbmcgfSwgdW50cnVzdGVkT3B0aW9uOiB7IGxhYmVsOiBzdHJpbmc7IHN1YmxhYmVsOiBzdHJpbmcgfSwgbWFya2Rvd25TdHJpbmdzOiBzdHJpbmdbXSwgdHJ1c3RQYXJlbnRTdHJpbmc/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlOiBxdWVzdGlvbixcblx0XHRcdGNoZWNrYm94OiB0cnVzdFBhcmVudFN0cmluZyA/IHtcblx0XHRcdFx0bGFiZWw6IHRydXN0UGFyZW50U3RyaW5nXG5cdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IHRydXN0ZWRPcHRpb24ubGFiZWwsXG5cdFx0XHRcdFx0cnVuOiBhc3luYyAoeyBjaGVja2JveENoZWNrZWQgfSkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGNoZWNrYm94Q2hlY2tlZCkge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uuc2V0UGFyZW50Rm9sZGVyVHJ1c3QodHJ1ZSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRhd2FpdCB0aGlzLndvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UuY29tcGxldGVXb3Jrc3BhY2VUcnVzdFJlcXVlc3QodHJ1ZSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IHVudHJ1c3RlZE9wdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMudXBkYXRlV29ya2JlbmNoSW5kaWNhdG9ycyhmYWxzZSk7XG5cdFx0XHRcdFx0XHR0aGlzLndvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UuY2FuY2VsV29ya3NwYWNlVHJ1c3RSZXF1ZXN0KCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdLFxuXHRcdFx0Y3VzdG9tOiB7XG5cdFx0XHRcdGJ1dHRvbkRldGFpbHM6IFtcblx0XHRcdFx0XHR0cnVzdGVkT3B0aW9uLnN1YmxhYmVsLFxuXHRcdFx0XHRcdHVudHJ1c3RlZE9wdGlvbi5zdWJsYWJlbFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRkaXNhYmxlQ2xvc2VBY3Rpb246IHRydWUsXG5cdFx0XHRcdGljb246IENvZGljb24uc2hpZWxkLFxuXHRcdFx0XHRtYXJrZG93bkRldGFpbHM6IG1hcmtkb3duU3RyaW5ncy5tYXAobWQgPT4geyByZXR1cm4geyBtYXJrZG93bjogbmV3IE1hcmtkb3duU3RyaW5nKG1kKSB9OyB9KVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShTVEFSVFVQX1BST01QVF9TSE9XTl9LRVksIHRydWUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3dNb2RhbE9uU3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSkge1xuXHRcdFx0dGhpcy51cGRhdGVXb3JrYmVuY2hJbmRpY2F0b3JzKHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERvbid0IHNob3cgbW9kYWwgcHJvbXB0IGlmIHdvcmtzcGFjZSB0cnVzdCBjYW5ub3QgYmUgY2hhbmdlZFxuXHRcdGlmICghKHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5jYW5TZXRXb3Jrc3BhY2VUcnVzdCgpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERvbid0IHNob3cgbW9kYWwgcHJvbXB0IGZvciB2aXJ0dWFsIHdvcmtzcGFjZXMgYnkgZGVmYXVsdFxuXHRcdGlmIChpc1ZpcnR1YWxXb3Jrc3BhY2UodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSkpIHtcblx0XHRcdHRoaXMudXBkYXRlV29ya2JlbmNoSW5kaWNhdG9ycyhmYWxzZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gRG9uJ3Qgc2hvdyBtb2RhbCBwcm9tcHQgZm9yIGVtcHR5IHdvcmtzcGFjZXMgYnkgZGVmYXVsdFxuXHRcdGlmICh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVdvcmtiZW5jaEluZGljYXRvcnMoZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnN0YXJ0dXBQcm9tcHRTZXR0aW5nID09PSAnbmV2ZXInKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVdvcmtiZW5jaEluZGljYXRvcnMoZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnN0YXJ0dXBQcm9tcHRTZXR0aW5nID09PSAnb25jZScgJiYgdGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKFNUQVJUVVBfUFJPTVBUX1NIT1dOX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgZmFsc2UpKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZVdvcmtiZW5jaEluZGljYXRvcnMoZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFVzZSB0aGUgd29ya3NwYWNlIHRydXN0IHJlcXVlc3Qgc2VydmljZSB0byBzaG93IG1vZGFsIGRpYWxvZ1xuXHRcdHRoaXMud29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZS5yZXF1ZXN0V29ya3NwYWNlVHJ1c3RPblN0YXJ0dXAoKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IHN0YXJ0dXBQcm9tcHRTZXR0aW5nKCk6ICdhbHdheXMnIHwgJ29uY2UnIHwgJ25ldmVyJyB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoV09SS1NQQUNFX1RSVVNUX1NUQVJUVVBfUFJPTVBUKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IHVzZVdvcmtzcGFjZUxhbmd1YWdlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKHRvV29ya3NwYWNlSWRlbnRpZmllcih0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGlzQWlHZW5lcmF0ZWRXb3Jrc3BhY2UoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgYWlHZW5lcmF0ZWRXb3Jrc3BhY2VzID0gVVJJLmpvaW5QYXRoKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLndvcmtzcGFjZVN0b3JhZ2VIb21lLCAnYWlHZW5lcmF0ZWRXb3Jrc3BhY2VzLmpzb24nKTtcblx0XHRyZXR1cm4gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMoYWlHZW5lcmF0ZWRXb3Jrc3BhY2VzKS50aGVuKGFzeW5jIHJlc3VsdCA9PiB7XG5cdFx0XHRpZiAocmVzdWx0KSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoYWlHZW5lcmF0ZWRXb3Jrc3BhY2VzKTtcblx0XHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VzID0gSlNPTi5wYXJzZShjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpIGFzIHN0cmluZ1tdO1xuXHRcdFx0XHRcdGlmICh3b3Jrc3BhY2VzLmluZGV4T2YodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzWzBdLnVyaS50b1N0cmluZygpKSA+IC0xKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHQvLyBJZ25vcmUgZXJyb3JzIHdoZW4gcmVzb2x2aW5nIGZpbGUgY29udGVudHNcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIEJhbm5lclxuXG5cdHByaXZhdGUgZ2V0QmFubmVySXRlbShyZXN0cmljdGVkTW9kZTogYm9vbGVhbik6IElCYW5uZXJJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBkaXNtaXNzZWRSZXN0cmljdGVkID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKEJBTk5FUl9SRVNUUklDVEVEX01PREVfRElTTUlTU0VEX0tFWSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgZmFsc2UpO1xuXG5cdFx0Ly8gbmV2ZXIgc2hvdyB0aGUgYmFubmVyXG5cdFx0aWYgKHRoaXMuYmFubmVyU2V0dGluZyA9PT0gJ25ldmVyJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBpbmZvIGhhcyBiZWVuIGRpc21pc3NlZFxuXHRcdGlmICh0aGlzLmJhbm5lclNldHRpbmcgPT09ICd1bnRpbERpc21pc3NlZCcgJiYgZGlzbWlzc2VkUmVzdHJpY3RlZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBhY3Rpb25zID1cblx0XHRcdFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVzdHJpY3RlZE1vZGVCYW5uZXJNYW5hZ2UnLCBcIk1hbmFnZVwiKSxcblx0XHRcdFx0XHRocmVmOiAnY29tbWFuZDonICsgTUFOQUdFX1RSVVNUX0NPTU1BTkRfSURcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVzdHJpY3RlZE1vZGVCYW5uZXJMZWFybk1vcmUnLCBcIkxlYXJuIE1vcmVcIiksXG5cdFx0XHRcdFx0aHJlZjogJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS13b3Jrc3BhY2UtdHJ1c3QnXG5cdFx0XHRcdH1cblx0XHRcdF07XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IEJBTk5FUl9SRVNUUklDVEVEX01PREUsXG5cdFx0XHRpY29uOiBzaGllbGRJY29uLFxuXHRcdFx0YXJpYUxhYmVsOiB0aGlzLmdldEJhbm5lckl0ZW1BcmlhTGFiZWxzKCksXG5cdFx0XHRtZXNzYWdlOiB0aGlzLmdldEJhbm5lckl0ZW1NZXNzYWdlcygpLFxuXHRcdFx0YWN0aW9ucyxcblx0XHRcdG9uQ2xvc2U6ICgpID0+IHtcblx0XHRcdFx0aWYgKHJlc3RyaWN0ZWRNb2RlKSB7XG5cdFx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShCQU5ORVJfUkVTVFJJQ1RFRF9NT0RFX0RJU01JU1NFRF9LRVksIHRydWUsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRCYW5uZXJJdGVtQXJpYUxhYmVscygpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpKSB7XG5cdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLkVNUFRZOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Jlc3RyaWN0ZWRNb2RlQmFubmVyQXJpYUxhYmVsV2luZG93JywgXCJSZXN0cmljdGVkIE1vZGUgaXMgaW50ZW5kZWQgZm9yIHNhZmUgY29kZSBicm93c2luZy4gVHJ1c3QgdGhpcyB3aW5kb3cgdG8gZW5hYmxlIGFsbCBmZWF0dXJlcy4gVXNlIG5hdmlnYXRpb24ga2V5cyB0byBhY2Nlc3MgYmFubmVyIGFjdGlvbnMuXCIpO1xuXHRcdFx0Y2FzZSBXb3JrYmVuY2hTdGF0ZS5GT0xERVI6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncmVzdHJpY3RlZE1vZGVCYW5uZXJBcmlhTGFiZWxGb2xkZXInLCBcIlJlc3RyaWN0ZWQgTW9kZSBpcyBpbnRlbmRlZCBmb3Igc2FmZSBjb2RlIGJyb3dzaW5nLiBUcnVzdCB0aGlzIGZvbGRlciB0byBlbmFibGUgYWxsIGZlYXR1cmVzLiBVc2UgbmF2aWdhdGlvbiBrZXlzIHRvIGFjY2VzcyBiYW5uZXIgYWN0aW9ucy5cIik7XG5cdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRTpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdyZXN0cmljdGVkTW9kZUJhbm5lckFyaWFMYWJlbFdvcmtzcGFjZScsIFwiUmVzdHJpY3RlZCBNb2RlIGlzIGludGVuZGVkIGZvciBzYWZlIGNvZGUgYnJvd3NpbmcuIFRydXN0IHRoaXMgd29ya3NwYWNlIHRvIGVuYWJsZSBhbGwgZmVhdHVyZXMuIFVzZSBuYXZpZ2F0aW9uIGtleXMgdG8gYWNjZXNzIGJhbm5lciBhY3Rpb25zLlwiKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEJhbm5lckl0ZW1NZXNzYWdlcygpOiBzdHJpbmcge1xuXHRcdHN3aXRjaCAodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpKSB7XG5cdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLkVNUFRZOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Jlc3RyaWN0ZWRNb2RlQmFubmVyTWVzc2FnZVdpbmRvdycsIFwiUmVzdHJpY3RlZCBNb2RlIGlzIGludGVuZGVkIGZvciBzYWZlIGNvZGUgYnJvd3NpbmcuIFRydXN0IHRoaXMgd2luZG93IHRvIGVuYWJsZSBhbGwgZmVhdHVyZXMuXCIpO1xuXHRcdFx0Y2FzZSBXb3JrYmVuY2hTdGF0ZS5GT0xERVI6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgncmVzdHJpY3RlZE1vZGVCYW5uZXJNZXNzYWdlRm9sZGVyJywgXCJSZXN0cmljdGVkIE1vZGUgaXMgaW50ZW5kZWQgZm9yIHNhZmUgY29kZSBicm93c2luZy4gVHJ1c3QgdGhpcyBmb2xkZXIgdG8gZW5hYmxlIGFsbCBmZWF0dXJlcy5cIik7XG5cdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRTpcblx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdyZXN0cmljdGVkTW9kZUJhbm5lck1lc3NhZ2VXb3Jrc3BhY2UnLCBcIlJlc3RyaWN0ZWQgTW9kZSBpcyBpbnRlbmRlZCBmb3Igc2FmZSBjb2RlIGJyb3dzaW5nLiBUcnVzdCB0aGlzIHdvcmtzcGFjZSB0byBlbmFibGUgYWxsIGZlYXR1cmVzLlwiKTtcblx0XHR9XG5cdH1cblxuXG5cdHByaXZhdGUgZ2V0IGJhbm5lclNldHRpbmcoKTogJ2Fsd2F5cycgfCAndW50aWxEaXNtaXNzZWQnIHwgJ25ldmVyJyB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnYWx3YXlzJyB8ICd1bnRpbERpc21pc3NlZCcgfCAnbmV2ZXInPihXT1JLU1BBQ0VfVFJVU1RfQkFOTkVSKTtcblxuXHRcdC8vIEluIHNlcnZlcmxlc3MgZW52aXJvbm1lbnRzLCB3ZSBkb24ndCBuZWVkIHRvIGFnZ3Jlc3NpdmVseSBzaG93IHRoZSBiYW5uZXJcblx0XHRpZiAocmVzdWx0ICE9PSAnYWx3YXlzJyAmJiBpc1dlYiAmJiAhdGhpcy5yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0Q29ubmVjdGlvbigpPy5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRcdHJldHVybiAnbmV2ZXInO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gU3RhdHVzYmFyXG5cblx0cHJpdmF0ZSBnZXRSZXN0cmljdGVkTW9kZVN0YXR1c2JhckVudHJ5KCk6IElTdGF0dXNiYXJFbnRyeSB7XG5cdFx0bGV0IGFyaWFMYWJlbCA9ICcnO1xuXHRcdGxldCB0b29sVGlwOiBJTWFya2Rvd25TdHJpbmcgfCBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0c3dpdGNoICh0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkpIHtcblx0XHRcdGNhc2UgV29ya2JlbmNoU3RhdGUuRU1QVFk6IHtcblx0XHRcdFx0YXJpYUxhYmVsID0gbG9jYWxpemUoJ3N0YXR1cy5hcmlhVW50cnVzdGVkV2luZG93JywgXCJSZXN0cmljdGVkIE1vZGU6IFNvbWUgZmVhdHVyZXMgYXJlIGRpc2FibGVkIGJlY2F1c2UgdGhpcyB3aW5kb3cgaXMgbm90IHRydXN0ZWQuXCIpO1xuXHRcdFx0XHR0b29sVGlwID0ge1xuXHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZShcblx0XHRcdFx0XHRcdHsga2V5OiAnc3RhdHVzLnRvb2x0aXBVbnRydXN0ZWRXaW5kb3cyJywgY29tbWVudDogWydbYWJjXSh7bn0pIGFyZSBsaW5rcy4gIE9ubHkgdHJhbnNsYXRlIGBmZWF0dXJlcyBhcmUgZGlzYWJsZWRgIGFuZCBgd2luZG93IGlzIG5vdCB0cnVzdGVkYC4gRG8gbm90IGNoYW5nZSBicmFja2V0cyBhbmQgcGFyZW50aGVzZXMgb3Ige259J10gfSxcblx0XHRcdFx0XHRcdFwiUnVubmluZyBpbiBSZXN0cmljdGVkIE1vZGVcXG5cXG5Tb21lIFtmZWF0dXJlcyBhcmUgZGlzYWJsZWRdKHswfSkgYmVjYXVzZSB0aGlzIFt3aW5kb3cgaXMgbm90IHRydXN0ZWRdKHsxfSkuXCIsXG5cdFx0XHRcdFx0XHRgY29tbWFuZDoke0xJU1RfV09SS1NQQUNFX1VOU1VQUE9SVEVEX0VYVEVOU0lPTlNfQ09NTUFORF9JRH1gLFxuXHRcdFx0XHRcdFx0YGNvbW1hbmQ6JHtNQU5BR0VfVFJVU1RfQ09NTUFORF9JRH1gXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRpc1RydXN0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0c3VwcG9ydFRoZW1lSWNvbnM6IHRydWVcblx0XHRcdFx0fTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFdvcmtiZW5jaFN0YXRlLkZPTERFUjoge1xuXHRcdFx0XHRhcmlhTGFiZWwgPSBsb2NhbGl6ZSgnc3RhdHVzLmFyaWFVbnRydXN0ZWRGb2xkZXInLCBcIlJlc3RyaWN0ZWQgTW9kZTogU29tZSBmZWF0dXJlcyBhcmUgZGlzYWJsZWQgYmVjYXVzZSB0aGlzIGZvbGRlciBpcyBub3QgdHJ1c3RlZC5cIik7XG5cdFx0XHRcdHRvb2xUaXAgPSB7XG5cdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKFxuXHRcdFx0XHRcdFx0eyBrZXk6ICdzdGF0dXMudG9vbHRpcFVudHJ1c3RlZEZvbGRlcjInLCBjb21tZW50OiBbJ1thYmNdKHtufSkgYXJlIGxpbmtzLiAgT25seSB0cmFuc2xhdGUgYGZlYXR1cmVzIGFyZSBkaXNhYmxlZGAgYW5kIGBmb2xkZXIgaXMgbm90IHRydXN0ZWRgLiBEbyBub3QgY2hhbmdlIGJyYWNrZXRzIGFuZCBwYXJlbnRoZXNlcyBvciB7bn0nXSB9LFxuXHRcdFx0XHRcdFx0XCJSdW5uaW5nIGluIFJlc3RyaWN0ZWQgTW9kZVxcblxcblNvbWUgW2ZlYXR1cmVzIGFyZSBkaXNhYmxlZF0oezB9KSBiZWNhdXNlIHRoaXMgW2ZvbGRlciBpcyBub3QgdHJ1c3RlZF0oezF9KS5cIixcblx0XHRcdFx0XHRcdGBjb21tYW5kOiR7TElTVF9XT1JLU1BBQ0VfVU5TVVBQT1JURURfRVhURU5TSU9OU19DT01NQU5EX0lEfWAsXG5cdFx0XHRcdFx0XHRgY29tbWFuZDoke01BTkFHRV9UUlVTVF9DT01NQU5EX0lEfWBcblx0XHRcdFx0XHQpLFxuXHRcdFx0XHRcdGlzVHJ1c3RlZDogdHJ1ZSxcblx0XHRcdFx0XHRzdXBwb3J0VGhlbWVJY29uczogdHJ1ZVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFOiB7XG5cdFx0XHRcdGFyaWFMYWJlbCA9IGxvY2FsaXplKCdzdGF0dXMuYXJpYVVudHJ1c3RlZFdvcmtzcGFjZScsIFwiUmVzdHJpY3RlZCBNb2RlOiBTb21lIGZlYXR1cmVzIGFyZSBkaXNhYmxlZCBiZWNhdXNlIHRoaXMgd29ya3NwYWNlIGlzIG5vdCB0cnVzdGVkLlwiKTtcblx0XHRcdFx0dG9vbFRpcCA9IHtcblx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoXG5cdFx0XHRcdFx0XHR7IGtleTogJ3N0YXR1cy50b29sdGlwVW50cnVzdGVkV29ya3NwYWNlMicsIGNvbW1lbnQ6IFsnW2FiY10oe259KSBhcmUgbGlua3MuIE9ubHkgdHJhbnNsYXRlIGBmZWF0dXJlcyBhcmUgZGlzYWJsZWRgIGFuZCBgd29ya3NwYWNlIGlzIG5vdCB0cnVzdGVkYC4gRG8gbm90IGNoYW5nZSBicmFja2V0cyBhbmQgcGFyZW50aGVzZXMgb3Ige259J10gfSxcblx0XHRcdFx0XHRcdFwiUnVubmluZyBpbiBSZXN0cmljdGVkIE1vZGVcXG5cXG5Tb21lIFtmZWF0dXJlcyBhcmUgZGlzYWJsZWRdKHswfSkgYmVjYXVzZSB0aGlzIFt3b3Jrc3BhY2UgaXMgbm90IHRydXN0ZWRdKHsxfSkuXCIsXG5cdFx0XHRcdFx0XHRgY29tbWFuZDoke0xJU1RfV09SS1NQQUNFX1VOU1VQUE9SVEVEX0VYVEVOU0lPTlNfQ09NTUFORF9JRH1gLFxuXHRcdFx0XHRcdFx0YGNvbW1hbmQ6JHtNQU5BR0VfVFJVU1RfQ09NTUFORF9JRH1gXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRpc1RydXN0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0c3VwcG9ydFRoZW1lSWNvbnM6IHRydWVcblx0XHRcdFx0fTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IGxvY2FsaXplKCdzdGF0dXMuV29ya3NwYWNlVHJ1c3QnLCBcIldvcmtzcGFjZSBUcnVzdFwiKSxcblx0XHRcdHRleHQ6IGAkKHNoaWVsZCkgJHtsb2NhbGl6ZSgndW50cnVzdGVkJywgXCJSZXN0cmljdGVkIE1vZGVcIil9YCxcblx0XHRcdGFyaWFMYWJlbDogYXJpYUxhYmVsLFxuXHRcdFx0dG9vbHRpcDogdG9vbFRpcCxcblx0XHRcdGNvbW1hbmQ6IE1BTkFHRV9UUlVTVF9DT01NQU5EX0lELFxuXHRcdFx0a2luZDogJ3Byb21pbmVudCdcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTdGF0dXNiYXJFbnRyeSh0cnVzdGVkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRydXN0ZWQgJiYgdGhpcy5zdGF0dXNiYXJFbnRyeUFjY2Vzc29yLnZhbHVlKSB7XG5cdFx0XHR0aGlzLnN0YXR1c2JhckVudHJ5QWNjZXNzb3IuY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRydXN0ZWQgJiYgIXRoaXMuc3RhdHVzYmFyRW50cnlBY2Nlc3Nvci52YWx1ZSkge1xuXHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLmdldFJlc3RyaWN0ZWRNb2RlU3RhdHVzYmFyRW50cnkoKTtcblx0XHRcdHRoaXMuc3RhdHVzYmFyRW50cnlBY2Nlc3Nvci52YWx1ZSA9IHRoaXMuc3RhdHVzYmFyU2VydmljZS5hZGRFbnRyeShlbnRyeSwgdGhpcy5lbnRyeUlkLCBTdGF0dXNiYXJBbGlnbm1lbnQuTEVGVCwgeyBsb2NhdGlvbjogeyBpZDogJ3N0YXR1cy5ob3N0JywgcHJpb3JpdHk6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSB9LCBhbGlnbm1lbnQ6IFN0YXR1c2JhckFsaWdubWVudC5SSUdIVCB9KTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFdvcmtzcGFjZVRydXN0UmVxdWVzdEhhbmRsZXIuSUQsIFdvcmtzcGFjZVRydXN0UmVxdWVzdEhhbmRsZXIsIFdvcmtiZW5jaFBoYXNlLkJsb2NrUmVzdG9yZSk7XG5SZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oV29ya3NwYWNlVHJ1c3RVWEhhbmRsZXIsIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcblxuXG4vKipcbiAqIFRydXN0ZWQgV29ya3NwYWNlIEdVSSBFZGl0b3JcbiAqL1xuY2xhc3MgV29ya3NwYWNlVHJ1c3RFZGl0b3JJbnB1dFNlcmlhbGl6ZXIgaW1wbGVtZW50cyBJRWRpdG9yU2VyaWFsaXplciB7XG5cblx0Y2FuU2VyaWFsaXplKGVkaXRvcklucHV0OiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0c2VyaWFsaXplKGlucHV0OiBXb3Jrc3BhY2VUcnVzdEVkaXRvcklucHV0KTogc3RyaW5nIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRkZXNlcmlhbGl6ZShpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogV29ya3NwYWNlVHJ1c3RFZGl0b3JJbnB1dCB7XG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtzcGFjZVRydXN0RWRpdG9ySW5wdXQpO1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JGYWN0b3J5UmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yRmFjdG9yeSlcblx0LnJlZ2lzdGVyRWRpdG9yU2VyaWFsaXplcihXb3Jrc3BhY2VUcnVzdEVkaXRvcklucHV0LklELCBXb3Jrc3BhY2VUcnVzdEVkaXRvcklucHV0U2VyaWFsaXplcik7XG5cblJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSkucmVnaXN0ZXJFZGl0b3JQYW5lKFxuXHRFZGl0b3JQYW5lRGVzY3JpcHRvci5jcmVhdGUoXG5cdFx0V29ya3NwYWNlVHJ1c3RFZGl0b3IsXG5cdFx0V29ya3NwYWNlVHJ1c3RFZGl0b3IuSUQsXG5cdFx0bG9jYWxpemUoJ3dvcmtzcGFjZVRydXN0RWRpdG9yJywgXCJXb3Jrc3BhY2UgVHJ1c3QgRWRpdG9yXCIpXG5cdCksXG5cdFtcblx0XHRuZXcgU3luY0Rlc2NyaXB0b3IoV29ya3NwYWNlVHJ1c3RFZGl0b3JJbnB1dClcblx0XVxuKTtcblxuXG4vKlxuICogQWN0aW9uc1xuICovXG5cbi8vIENvbmZpZ3VyZSBXb3Jrc3BhY2UgVHJ1c3QgU2V0dGluZ3NcblxuY29uc3QgQ09ORklHVVJFX1RSVVNUX0NPTU1BTkRfSUQgPSAnd29ya2JlbmNoLnRydXN0LmNvbmZpZ3VyZSc7XG5jb25zdCBXT1JLU1BBQ0VTX0NBVEVHT1JZID0gbG9jYWxpemUyKCd3b3Jrc3BhY2VzQ2F0ZWdvcnknLCAnV29ya3NwYWNlcycpO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IENPTkZJR1VSRV9UUlVTVF9DT01NQU5EX0lELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY29uZmlndXJlV29ya3NwYWNlVHJ1c3RTZXR0aW5ncycsIFwiQ29uZmlndXJlIFdvcmtzcGFjZSBUcnVzdCBTZXR0aW5nc1wiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFdvcmtzcGFjZVRydXN0Q29udGV4dC5Jc0VuYWJsZWQsIENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7V09SS1NQQUNFX1RSVVNUX0VOQUJMRUR9YCwgdHJ1ZSkpLFxuXHRcdFx0Y2F0ZWdvcnk6IFdPUktTUEFDRVNfQ0FURUdPUlksXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKSB7XG5cdFx0YWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpLm9wZW5Vc2VyU2V0dGluZ3MoeyBqc29uRWRpdG9yOiBmYWxzZSwgcXVlcnk6IGBAdGFnOiR7V09SS1NQQUNFX1RSVVNUX1NFVFRJTkdfVEFHfWAgfSk7XG5cdH1cbn0pO1xuXG4vLyBNYW5hZ2UgV29ya3NwYWNlIFRydXN0XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogTUFOQUdFX1RSVVNUX0NPTU1BTkRfSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtYW5hZ2VXb3Jrc3BhY2VUcnVzdCcsIFwiTWFuYWdlIFdvcmtzcGFjZSBUcnVzdFwiKSxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKFdvcmtzcGFjZVRydXN0Q29udGV4dC5Jc0VuYWJsZWQsIENvbnRleHRLZXlFeHByLmVxdWFscyhgY29uZmlnLiR7V09SS1NQQUNFX1RSVVNUX0VOQUJMRUR9YCwgdHJ1ZSkpLFxuXHRcdFx0Y2F0ZWdvcnk6IFdPUktTUEFDRVNfQ0FURUdPUlksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGVkaXRvclNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElJbnN0YW50aWF0aW9uU2VydmljZSk7XG5cblx0XHRjb25zdCBpbnB1dCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtzcGFjZVRydXN0RWRpdG9ySW5wdXQpO1xuXG5cdFx0ZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKGlucHV0LCB7IHBpbm5lZDogdHJ1ZSB9KTtcblx0XHRyZXR1cm47XG5cdH1cbn0pO1xuXG5cbi8qXG4gKiBDb25maWd1cmF0aW9uXG4gKi9cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pXG5cdC5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRcdC4uLnNlY3VyaXR5Q29uZmlndXJhdGlvbk5vZGVCYXNlLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFtXT1JLU1BBQ0VfVFJVU1RfRU5BQkxFRF06IHtcblx0XHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dvcmtzcGFjZS50cnVzdC5kZXNjcmlwdGlvbicsIFwiQ29udHJvbHMgd2hldGhlciBvciBub3QgV29ya3NwYWNlIFRydXN0IGlzIGVuYWJsZWQgd2l0aGluIFZTIENvZGUuXCIpLFxuXHRcdFx0XHR0YWdzOiBbV09SS1NQQUNFX1RSVVNUX1NFVFRJTkdfVEFHXSxcblx0XHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdH0sXG5cdFx0XHRbV09SS1NQQUNFX1RSVVNUX1NUQVJUVVBfUFJPTVBUXToge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVmYXVsdDogJ25ldmVyJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3b3Jrc3BhY2UudHJ1c3Quc3RhcnR1cFByb21wdC5kZXNjcmlwdGlvbicsIFwiQ29udHJvbHMgd2hlbiB0aGUgc3RhcnR1cCBwcm9tcHQgdG8gdHJ1c3QgYSB3b3Jrc3BhY2UgaXMgc2hvd24uXCIpLFxuXHRcdFx0XHR0YWdzOiBbV09SS1NQQUNFX1RSVVNUX1NFVFRJTkdfVEFHXSxcblx0XHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdFx0ZW51bTogWydhbHdheXMnLCAnb25jZScsICduZXZlciddLFxuXHRcdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3dvcmtzcGFjZS50cnVzdC5zdGFydHVwUHJvbXB0LmFsd2F5cycsIFwiQXNrIGZvciB0cnVzdCBldmVyeSB0aW1lIGFuIHVudHJ1c3RlZCB3b3Jrc3BhY2UgaXMgb3BlbmVkLlwiKSxcblx0XHRcdFx0XHRsb2NhbGl6ZSgnd29ya3NwYWNlLnRydXN0LnN0YXJ0dXBQcm9tcHQub25jZScsIFwiQXNrIGZvciB0cnVzdCB0aGUgZmlyc3QgdGltZSBhbiB1bnRydXN0ZWQgd29ya3NwYWNlIGlzIG9wZW5lZC5cIiksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3dvcmtzcGFjZS50cnVzdC5zdGFydHVwUHJvbXB0Lm5ldmVyJywgXCJEbyBub3QgYXNrIGZvciB0cnVzdCB3aGVuIGFuIHVudHJ1c3RlZCB3b3Jrc3BhY2UgaXMgb3BlbmVkLlwiKSxcblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdFtXT1JLU1BBQ0VfVFJVU1RfQkFOTkVSXToge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVmYXVsdDogJ3VudGlsRGlzbWlzc2VkJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3b3Jrc3BhY2UudHJ1c3QuYmFubmVyLmRlc2NyaXB0aW9uJywgXCJDb250cm9scyB3aGVuIHRoZSByZXN0cmljdGVkIG1vZGUgYmFubmVyIGlzIHNob3duLlwiKSxcblx0XHRcdFx0dGFnczogW1dPUktTUEFDRV9UUlVTVF9TRVRUSU5HX1RBR10sXG5cdFx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT04sXG5cdFx0XHRcdGVudW06IFsnYWx3YXlzJywgJ3VudGlsRGlzbWlzc2VkJywgJ25ldmVyJ10sXG5cdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRsb2NhbGl6ZSgnd29ya3NwYWNlLnRydXN0LmJhbm5lci5hbHdheXMnLCBcIlNob3cgdGhlIGJhbm5lciBldmVyeSB0aW1lIGFuIHVudHJ1c3RlZCB3b3Jrc3BhY2UgaXMgb3Blbi5cIiksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3dvcmtzcGFjZS50cnVzdC5iYW5uZXIudW50aWxEaXNtaXNzZWQnLCBcIlNob3cgdGhlIGJhbm5lciB3aGVuIGFuIHVudHJ1c3RlZCB3b3Jrc3BhY2UgaXMgb3BlbmVkIHVudGlsIGRpc21pc3NlZC5cIiksXG5cdFx0XHRcdFx0bG9jYWxpemUoJ3dvcmtzcGFjZS50cnVzdC5iYW5uZXIubmV2ZXInLCBcIkRvIG5vdCBzaG93IHRoZSBiYW5uZXIgd2hlbiBhbiB1bnRydXN0ZWQgd29ya3NwYWNlIGlzIG9wZW4uXCIpLFxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0W1dPUktTUEFDRV9UUlVTVF9VTlRSVVNURURfRklMRVNdOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZWZhdWx0OiAncHJvbXB0Jyxcblx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ3dvcmtzcGFjZS50cnVzdC51bnRydXN0ZWRGaWxlcy5kZXNjcmlwdGlvbicsIFwiQ29udHJvbHMgaG93IHRvIGhhbmRsZSBvcGVuaW5nIHVudHJ1c3RlZCBmaWxlcyBpbiBhIHRydXN0ZWQgd29ya3NwYWNlLiBUaGlzIHNldHRpbmcgYWxzbyBhcHBsaWVzIHRvIG9wZW5pbmcgZmlsZXMgaW4gYW4gZW1wdHkgd2luZG93IHdoaWNoIGlzIHRydXN0ZWQgdmlhIGAjezB9I2AuXCIsIFdPUktTUEFDRV9UUlVTVF9FTVBUWV9XSU5ET1cpLFxuXHRcdFx0XHR0YWdzOiBbV09SS1NQQUNFX1RSVVNUX1NFVFRJTkdfVEFHXSxcblx0XHRcdFx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5BUFBMSUNBVElPTixcblx0XHRcdFx0ZW51bTogWydwcm9tcHQnLCAnb3BlbicsICduZXdXaW5kb3cnXSxcblx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdGxvY2FsaXplKCd3b3Jrc3BhY2UudHJ1c3QudW50cnVzdGVkRmlsZXMucHJvbXB0JywgXCJBc2sgaG93IHRvIGhhbmRsZSB1bnRydXN0ZWQgZmlsZXMgZm9yIGVhY2ggd29ya3NwYWNlLiBPbmNlIHVudHJ1c3RlZCBmaWxlcyBhcmUgaW50cm9kdWNlZCB0byBhIHRydXN0ZWQgd29ya3NwYWNlLCB5b3Ugd2lsbCBub3QgYmUgcHJvbXB0ZWQgYWdhaW4uXCIpLFxuXHRcdFx0XHRcdGxvY2FsaXplKCd3b3Jrc3BhY2UudHJ1c3QudW50cnVzdGVkRmlsZXMub3BlbicsIFwiQWx3YXlzIGFsbG93IHVudHJ1c3RlZCBmaWxlcyB0byBiZSBpbnRyb2R1Y2VkIHRvIGEgdHJ1c3RlZCB3b3Jrc3BhY2Ugd2l0aG91dCBwcm9tcHRpbmcuXCIpLFxuXHRcdFx0XHRcdGxvY2FsaXplKCd3b3Jrc3BhY2UudHJ1c3QudW50cnVzdGVkRmlsZXMubmV3V2luZG93JywgXCJBbHdheXMgb3BlbiB1bnRydXN0ZWQgZmlsZXMgaW4gYSBzZXBhcmF0ZSB3aW5kb3cgaW4gcmVzdHJpY3RlZCBtb2RlIHdpdGhvdXQgcHJvbXB0aW5nLlwiKSxcblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdFtXT1JLU1BBQ0VfVFJVU1RfRU1QVFlfV0lORE9XXToge1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd3b3Jrc3BhY2UudHJ1c3QuZW1wdHlXaW5kb3cuZGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgb3Igbm90IHRoZSBlbXB0eSB3aW5kb3cgaXMgdHJ1c3RlZCBieSBkZWZhdWx0IHdpdGhpbiBWUyBDb2RlLiBXaGVuIHVzZWQgd2l0aCBgI3swfSNgLCB5b3UgY2FuIGVuYWJsZSB0aGUgZnVsbCBmdW5jdGlvbmFsaXR5IG9mIFZTIENvZGUgd2l0aG91dCBwcm9tcHRpbmcgaW4gYW4gZW1wdHkgd2luZG93LlwiLCBXT1JLU1BBQ0VfVFJVU1RfVU5UUlVTVEVEX0ZJTEVTKSxcblx0XHRcdFx0dGFnczogW1dPUktTUEFDRV9UUlVTVF9TRVRUSU5HX1RBR10sXG5cdFx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuQVBQTElDQVRJT05cblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5jbGFzcyBXb3Jrc3BhY2VUcnVzdFRlbGVtZXRyeUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Uud29ya3NwYWNlVHJ1c3RJbml0aWFsaXplZFxuXHRcdFx0LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ0luaXRpYWxXb3Jrc3BhY2VUcnVzdEluZm8oKTtcblx0XHRcdFx0dGhpcy5sb2dXb3Jrc3BhY2VUcnVzdCh0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkpO1xuXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVRydXN0KGlzVHJ1c3RlZCA9PiB0aGlzLmxvZ1dvcmtzcGFjZVRydXN0KGlzVHJ1c3RlZCkpKTtcblx0XHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBsb2dJbml0aWFsV29ya3NwYWNlVHJ1c3RJbmZvKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy53b3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RFbmFibGVkKCkpIHtcblx0XHRcdGNvbnN0IGRpc2FibGVkQnlDbGlGbGFnID0gdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZGlzYWJsZVdvcmtzcGFjZVRydXN0O1xuXG5cdFx0XHR0eXBlIFdvcmtzcGFjZVRydXN0RGlzYWJsZWRFdmVudENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRvd25lcjogJ3NiYXR0ZW4nO1xuXHRcdFx0XHRjb21tZW50OiAnTG9nZ2VkIHdoZW4gd29ya3NwYWNlIHRydXN0IGlzIGRpc2FibGVkJztcblx0XHRcdFx0cmVhc29uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHJlYXNvbiB3b3Jrc3BhY2UgdHJ1c3QgaXMgZGlzYWJsZWQuIGUuZy4gY2xpIG9yIHNldHRpbmcnIH07XG5cdFx0XHR9O1xuXG5cdFx0XHR0eXBlIFdvcmtzcGFjZVRydXN0RGlzYWJsZWRFdmVudCA9IHtcblx0XHRcdFx0cmVhc29uOiAnc2V0dGluZycgfCAnY2xpJztcblx0XHRcdH07XG5cblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtzcGFjZVRydXN0RGlzYWJsZWRFdmVudCwgV29ya3NwYWNlVHJ1c3REaXNhYmxlZEV2ZW50Q2xhc3NpZmljYXRpb24+KCd3b3Jrc3BhY2VUcnVzdERpc2FibGVkJywge1xuXHRcdFx0XHRyZWFzb246IGRpc2FibGVkQnlDbGlGbGFnID8gJ2NsaScgOiAnc2V0dGluZydcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHR5cGUgV29ya3NwYWNlVHJ1c3RJbmZvRXZlbnRDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnc2JhdHRlbic7XG5cdFx0XHRjb21tZW50OiAnSW5mb3JtYXRpb24gYWJvdXQgdGhlIHdvcmtzcGFjZXMgdHJ1c3RlZCBvbiB0aGUgbWFjaGluZSc7XG5cdFx0XHR0cnVzdGVkRm9sZGVyc0NvdW50OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG51bWJlciBvZiB0cnVzdGVkIGZvbGRlcnMgb24gdGhlIG1hY2hpbmUnIH07XG5cdFx0fTtcblxuXHRcdHR5cGUgV29ya3NwYWNlVHJ1c3RJbmZvRXZlbnQgPSB7XG5cdFx0XHR0cnVzdGVkRm9sZGVyc0NvdW50OiBudW1iZXI7XG5cdFx0fTtcblxuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtzcGFjZVRydXN0SW5mb0V2ZW50LCBXb3Jrc3BhY2VUcnVzdEluZm9FdmVudENsYXNzaWZpY2F0aW9uPignd29ya3NwYWNlVHJ1c3RGb2xkZXJDb3VudHMnLCB7XG5cdFx0XHR0cnVzdGVkRm9sZGVyc0NvdW50OiB0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuZ2V0VHJ1c3RlZFVyaXMoKS5sZW5ndGgsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGxvZ1dvcmtzcGFjZVRydXN0KGlzVHJ1c3RlZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy53b3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RFbmFibGVkKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0eXBlIFdvcmtzcGFjZVRydXN0U3RhdGVDaGFuZ2VkRXZlbnQgPSB7XG5cdFx0XHR3b3Jrc3BhY2VJZDogc3RyaW5nO1xuXHRcdFx0aXNUcnVzdGVkOiBib29sZWFuO1xuXHRcdH07XG5cblx0XHR0eXBlIFdvcmtzcGFjZVRydXN0U3RhdGVDaGFuZ2VkRXZlbnRDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnc2JhdHRlbic7XG5cdFx0XHRjb21tZW50OiAnTG9nZ2VkIHdoZW4gdGhlIHdvcmtzcGFjZSB0cmFuc2l0aW9ucyBiZXR3ZWVuIHRydXN0ZWQgYW5kIHJlc3RyaWN0ZWQgbW9kZXMnO1xuXHRcdFx0d29ya3NwYWNlSWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdBbiBpZCBvZiB0aGUgd29ya3NwYWNlJyB9O1xuXHRcdFx0aXNUcnVzdGVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAndHJ1ZSBpZiB0aGUgd29ya3NwYWNlIGlzIHRydXN0ZWQnIH07XG5cdFx0fTtcblxuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFdvcmtzcGFjZVRydXN0U3RhdGVDaGFuZ2VkRXZlbnQsIFdvcmtzcGFjZVRydXN0U3RhdGVDaGFuZ2VkRXZlbnRDbGFzc2lmaWNhdGlvbj4oJ3dvcmtzcGFjZVRydXN0U3RhdGVDaGFuZ2VkJywge1xuXHRcdFx0d29ya3NwYWNlSWQ6IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuaWQsXG5cdFx0XHRpc1RydXN0ZWQ6IGlzVHJ1c3RlZFxuXHRcdH0pO1xuXG5cdFx0aWYgKGlzVHJ1c3RlZCkge1xuXHRcdFx0dHlwZSBXb3Jrc3BhY2VUcnVzdEZvbGRlckluZm9FdmVudENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRvd25lcjogJ3NiYXR0ZW4nO1xuXHRcdFx0XHRjb21tZW50OiAnU29tZSBtZXRyaWNzIG9uIHRoZSB0cnVzdGVkIHdvcmtzcGFjZXMgZm9sZGVyIHN0cnVjdHVyZSc7XG5cdFx0XHRcdHRydXN0ZWRGb2xkZXJEZXB0aDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBudW1iZXIgb2YgZGlyZWN0b3JpZXMgZGVlcCBvZiB0aGUgdHJ1c3RlZCBwYXRoJyB9O1xuXHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXJEZXB0aDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBudW1iZXIgb2YgZGlyZWN0b3JpZXMgZGVlcCBvZiB0aGUgd29ya3NwYWNlIHBhdGgnIH07XG5cdFx0XHRcdGRlbHRhOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGRpZmZlcmVuY2UgYmV0d2VlbiB0aGUgdHJ1c3RlZCBwYXRoIGFuZCB0aGUgd29ya3NwYWNlIHBhdGggZGlyZWN0b3JpZXMgZGVwdGgnIH07XG5cdFx0XHR9O1xuXG5cdFx0XHR0eXBlIFdvcmtzcGFjZVRydXN0Rm9sZGVySW5mb0V2ZW50ID0ge1xuXHRcdFx0XHR0cnVzdGVkRm9sZGVyRGVwdGg6IG51bWJlcjtcblx0XHRcdFx0d29ya3NwYWNlRm9sZGVyRGVwdGg6IG51bWJlcjtcblx0XHRcdFx0ZGVsdGE6IG51bWJlcjtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGdldERlcHRoID0gKGZvbGRlcjogc3RyaW5nKTogbnVtYmVyID0+IHtcblx0XHRcdFx0bGV0IHJlc29sdmVkUGF0aCA9IHJlc29sdmUoZm9sZGVyKTtcblxuXHRcdFx0XHRsZXQgZGVwdGggPSAwO1xuXHRcdFx0XHR3aGlsZSAoZGlybmFtZShyZXNvbHZlZFBhdGgpICE9PSByZXNvbHZlZFBhdGggJiYgZGVwdGggPCAxMDApIHtcblx0XHRcdFx0XHRyZXNvbHZlZFBhdGggPSBkaXJuYW1lKHJlc29sdmVkUGF0aCk7XG5cdFx0XHRcdFx0ZGVwdGgrKztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBkZXB0aDtcblx0XHRcdH07XG5cblx0XHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycykge1xuXHRcdFx0XHRjb25zdCB7IHRydXN0ZWQsIHVyaSB9ID0gYXdhaXQgdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmdldFVyaVRydXN0SW5mbyhmb2xkZXIudXJpKTtcblx0XHRcdFx0aWYgKCF0cnVzdGVkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJEZXB0aCA9IGdldERlcHRoKGZvbGRlci51cmkuZnNQYXRoKTtcblx0XHRcdFx0Y29uc3QgdHJ1c3RlZEZvbGRlckRlcHRoID0gZ2V0RGVwdGgodXJpLmZzUGF0aCk7XG5cdFx0XHRcdGNvbnN0IGRlbHRhID0gd29ya3NwYWNlRm9sZGVyRGVwdGggLSB0cnVzdGVkRm9sZGVyRGVwdGg7XG5cblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8V29ya3NwYWNlVHJ1c3RGb2xkZXJJbmZvRXZlbnQsIFdvcmtzcGFjZVRydXN0Rm9sZGVySW5mb0V2ZW50Q2xhc3NpZmljYXRpb24+KCd3b3Jrc3BhY2VGb2xkZXJEZXB0aEJlbG93VHJ1c3RlZEZvbGRlcicsIHsgd29ya3NwYWNlRm9sZGVyRGVwdGgsIHRydXN0ZWRGb2xkZXJEZXB0aCwgZGVsdGEgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKVxuXHQucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oV29ya3NwYWNlVHJ1c3RUZWxlbWV0cnlDb250cmlidXRpb24sIExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTztBQUNQLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBWSx5QkFBeUI7QUFDOUMsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLFNBQVMsdUJBQXVCO0FBQ3pDLFNBQVMsb0JBQW9CLGNBQWMsK0JBQXVEO0FBQ2xHLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQStDO0FBQ3hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0NBQWtDLGtDQUFrQywrQkFBK0IsaUNBQWlDO0FBQzdJLFNBQVMsY0FBYyxxQkFBOEUsZ0JBQWdCLHNDQUFzQztBQUMzSixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBNkIsMEJBQTBCO0FBQ2hFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQW1ELG1CQUFtQiwwQkFBMEI7QUFDaEcsU0FBOEIsNEJBQTRCO0FBQzFELFNBQVMsWUFBWSw0QkFBNEI7QUFDakQsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx3QkFBd0IsOEJBQThCLHlCQUF5QixnQ0FBZ0MsdUNBQXVDO0FBQy9KLFNBQW9ELHdCQUF3QjtBQUU1RSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE4RCxtQ0FBbUMsMEJBQTRELHVCQUF1QixzQkFBc0I7QUFDbk4sU0FBUyxTQUFTLGVBQWU7QUFDakMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBMEIsc0JBQXNCO0FBQ2hELFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsb0JBQW9CO0FBQzdCLFNBQXNCLHNCQUFzQjtBQUM1QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHdEQUF3RDtBQUNq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
