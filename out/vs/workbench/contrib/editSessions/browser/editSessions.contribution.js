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
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ILifecycleService, LifecyclePhase, ShutdownReason } from "../../../services/lifecycle/common/lifecycle.js";
import { Action2, MenuId, MenuRegistry, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { localize, localize2 } from "../../../../nls.js";
import { IEditSessionsStorageService, ChangeType, FileType, EDIT_SESSION_SYNC_CATEGORY, EDIT_SESSIONS_CONTAINER_ID, EditSessionSchemaVersion, IEditSessionsLogService, EDIT_SESSIONS_VIEW_ICON, EDIT_SESSIONS_TITLE, EDIT_SESSIONS_SHOW_VIEW, EDIT_SESSIONS_DATA_VIEW_ID, decodeEditSessionFileContent, hashedEditSessionId, editSessionsLogId, EDIT_SESSIONS_PENDING } from "../common/editSessions.js";
import { ISCMService } from "../../scm/common/scm.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { URI } from "../../../../base/common/uri.js";
import { basename, joinPath, relativePath } from "../../../../base/common/resources.js";
import { encodeBase64 } from "../../../../base/common/buffer.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { EditSessionsWorkbenchService } from "./editSessionsStorageService.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { UserDataSyncErrorCode, UserDataSyncStoreError } from "../../../../platform/userDataSync/common/userDataSync.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { getFileNamesMessage, IDialogService, IFileDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { workbenchConfigurationNodeBase } from "../../../common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { getVirtualWorkspaceLocation } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { Schemas } from "../../../../base/common/network.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { IExtensionService, isProposedApiEnabled } from "../../../services/extensions/common/extensions.js";
import { EditSessionsLogService } from "../common/editSessionsLogService.js";
import { Extensions as ViewExtensions, ViewContainerLocation } from "../../../common/views.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { ViewPaneContainer } from "../../../browser/parts/views/viewPaneContainer.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { EditSessionsDataViews } from "./editSessionsViews.js";
import { EditSessionsFileSystemProvider } from "./editSessionsFileSystemProvider.js";
import { isNative, isWeb } from "../../../../base/common/platform.js";
import { VirtualWorkspaceContext, WorkspaceFolderCountContext } from "../../../common/contextkeys.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { equals } from "../../../../base/common/objects.js";
import { EditSessionIdentityMatch, IEditSessionIdentityService } from "../../../../platform/workspace/common/editSessions.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IOutputService } from "../../../services/output/common/output.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IActivityService, NumberBadge } from "../../../services/activity/common/activity.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { WorkspaceStateSynchroniser } from "../common/workspaceStateSync.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IRequestService } from "../../../../platform/request/common/request.js";
import { EditSessionsStoreClient } from "../common/editSessionsStorageClient.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceIdentityService } from "../../../services/workspaces/common/workspaceIdentityService.js";
import { hashAsync } from "../../../../base/common/hash.js";
import { ResourceSet } from "../../../../base/common/map.js";
registerSingleton(IEditSessionsLogService, EditSessionsLogService, InstantiationType.Delayed);
registerSingleton(IEditSessionsStorageService, EditSessionsWorkbenchService, InstantiationType.Delayed);
const continueWorkingOnCommand = {
  id: "_workbench.editSessions.actions.continueEditSession",
  title: localize2("continue working on", "Continue Working On..."),
  precondition: WorkspaceFolderCountContext.notEqualsTo("0"),
  f1: true
};
const openLocalFolderCommand = {
  id: "_workbench.editSessions.actions.continueEditSession.openLocalFolder",
  title: localize2("continue edit session in local folder", "Open In Local Folder"),
  category: EDIT_SESSION_SYNC_CATEGORY,
  precondition: ContextKeyExpr.and(IsWebContext.toNegated(), VirtualWorkspaceContext)
};
const showOutputChannelCommand = {
  id: "workbench.editSessions.actions.showOutputChannel",
  title: localize2("show log", "Show Log"),
  category: EDIT_SESSION_SYNC_CATEGORY
};
const installAdditionalContinueOnOptionsCommand = {
  id: "workbench.action.continueOn.extensions",
  title: localize("continueOn.installAdditional", "Install additional development environment options")
};
registerAction2(class extends Action2 {
  constructor() {
    super({ ...installAdditionalContinueOnOptionsCommand, f1: false });
  }
  async run(accessor) {
    return accessor.get(IExtensionsWorkbenchService).openSearch("@tag:continueOn");
  }
});
const resumeProgressOptionsTitle = `[${localize("resuming working changes window", "Resuming working changes...")}](command:${showOutputChannelCommand.id})`;
const resumeProgressOptions = {
  location: ProgressLocation.Window,
  type: "syncing"
};
const queryParamName = "editSessionId";
const useEditSessionsWithContinueOn = "workbench.editSessions.continueOn";
let EditSessionsContribution = class extends Disposable {
  constructor(editSessionsStorageService, fileService, progressService, openerService, telemetryService, scmService, notificationService, dialogService, logService, environmentService, instantiationService, productService, configurationService, contextService, editSessionIdentityService, quickInputService, commandService, contextKeyService, fileDialogService, lifecycleService, storageService, activityService, editorService, remoteAgentService, extensionService, requestService, userDataProfilesService, uriIdentityService, workspaceIdentityService) {
    super();
    this.editSessionsStorageService = editSessionsStorageService;
    this.fileService = fileService;
    this.progressService = progressService;
    this.openerService = openerService;
    this.telemetryService = telemetryService;
    this.scmService = scmService;
    this.notificationService = notificationService;
    this.dialogService = dialogService;
    this.logService = logService;
    this.environmentService = environmentService;
    this.instantiationService = instantiationService;
    this.productService = productService;
    this.configurationService = configurationService;
    this.contextService = contextService;
    this.editSessionIdentityService = editSessionIdentityService;
    this.quickInputService = quickInputService;
    this.commandService = commandService;
    this.contextKeyService = contextKeyService;
    this.fileDialogService = fileDialogService;
    this.lifecycleService = lifecycleService;
    this.storageService = storageService;
    this.activityService = activityService;
    this.editorService = editorService;
    this.remoteAgentService = remoteAgentService;
    this.extensionService = extensionService;
    this.requestService = requestService;
    this.userDataProfilesService = userDataProfilesService;
    this.uriIdentityService = uriIdentityService;
    this.workspaceIdentityService = workspaceIdentityService;
    this.continueEditSessionOptions = [];
    this.accountsMenuBadgeDisposable = this._register(new MutableDisposable());
    this.registeredCommands = /* @__PURE__ */ new Set();
    this.shouldShowViewsContext = EDIT_SESSIONS_SHOW_VIEW.bindTo(this.contextKeyService);
    this.pendingEditSessionsContext = EDIT_SESSIONS_PENDING.bindTo(this.contextKeyService);
    this.pendingEditSessionsContext.set(false);
    if (!this.productService["editSessions.store"]?.url) {
      return;
    }
    this.editSessionsStorageClient = new EditSessionsStoreClient(URI.parse(this.productService["editSessions.store"].url), this.productService, this.requestService, this.logService, this.environmentService, this.fileService, this.storageService);
    this.editSessionsStorageService.storeClient = this.editSessionsStorageClient;
    this.workspaceStateSynchronizer = new WorkspaceStateSynchroniser(this.userDataProfilesService.defaultProfile, void 0, this.editSessionsStorageClient, this.logService, this.fileService, this.environmentService, this.telemetryService, this.configurationService, this.storageService, this.uriIdentityService, this.workspaceIdentityService, this.editSessionsStorageService);
    this.autoResumeEditSession();
    this.registerActions();
    this.registerViews();
    this.registerContributedEditSessionOptions();
    this._register(this.fileService.registerProvider(EditSessionsFileSystemProvider.SCHEMA, new EditSessionsFileSystemProvider(this.editSessionsStorageService)));
    this._register(this.lifecycleService.onWillShutdown((e) => {
      if (e.reason !== ShutdownReason.RELOAD && this.editSessionsStorageService.isSignedIn && this.configurationService.getValue("workbench.experimental.cloudChanges.autoStore") === "onShutdown" && !isWeb) {
        e.join(this.autoStoreEditSession(), { id: "autoStoreWorkingChanges", label: localize("autoStoreWorkingChanges", "Storing current working changes...") });
      }
    }));
    this._register(this.editSessionsStorageService.onDidSignIn(() => this.updateAccountsMenuBadge()));
    this._register(this.editSessionsStorageService.onDidSignOut(() => this.updateAccountsMenuBadge()));
  }
  async autoResumeEditSession() {
    const shouldAutoResumeOnReload = this.configurationService.getValue("workbench.cloudChanges.autoResume") === "onReload";
    if (this.environmentService.editSessionId !== void 0) {
      this.logService.info(`Resuming cloud changes, reason: found editSessionId ${this.environmentService.editSessionId} in environment service...`);
      await this.progressService.withProgress(resumeProgressOptions, async (progress) => await this.resumeEditSession(this.environmentService.editSessionId, void 0, void 0, void 0, progress).finally(() => this.environmentService.editSessionId = void 0));
    } else if (shouldAutoResumeOnReload && this.editSessionsStorageService.isSignedIn) {
      this.logService.info("Resuming cloud changes, reason: cloud changes enabled...");
      await this.progressService.withProgress(resumeProgressOptions, async (progress) => await this.resumeEditSession(void 0, true, void 0, void 0, progress));
    } else if (shouldAutoResumeOnReload) {
      const hasApplicationLaunchedFromContinueOnFlow = this.storageService.getBoolean(EditSessionsContribution.APPLICATION_LAUNCHED_VIA_CONTINUE_ON_STORAGE_KEY, StorageScope.APPLICATION, false);
      this.logService.info(`Prompting to enable cloud changes, has application previously launched from Continue On flow: ${hasApplicationLaunchedFromContinueOnFlow}`);
      const handlePendingEditSessions = () => {
        this.logService.info("Showing badge to enable cloud changes in accounts menu...");
        this.updateAccountsMenuBadge();
        this.pendingEditSessionsContext.set(true);
        const disposable = this.editSessionsStorageService.onDidSignIn(async () => {
          disposable.dispose();
          this.logService.info("Showing badge to enable cloud changes in accounts menu succeeded, resuming cloud changes...");
          await this.progressService.withProgress(resumeProgressOptions, async (progress) => await this.resumeEditSession(void 0, true, void 0, void 0, progress));
          this.storageService.remove(EditSessionsContribution.APPLICATION_LAUNCHED_VIA_CONTINUE_ON_STORAGE_KEY, StorageScope.APPLICATION);
          this.environmentService.continueOn = void 0;
        });
      };
      if (this.environmentService.continueOn !== void 0 && !this.editSessionsStorageService.isSignedIn && // and user has not yet been prompted to sign in on this machine
      hasApplicationLaunchedFromContinueOnFlow === false) {
        this.storageService.store(EditSessionsContribution.APPLICATION_LAUNCHED_VIA_CONTINUE_ON_STORAGE_KEY, true, StorageScope.APPLICATION, StorageTarget.MACHINE);
        this.logService.info("Prompting to enable cloud changes...");
        await this.editSessionsStorageService.initialize("read");
        if (this.editSessionsStorageService.isSignedIn) {
          this.logService.info("Prompting to enable cloud changes succeeded, resuming cloud changes...");
          await this.progressService.withProgress(resumeProgressOptions, async (progress) => await this.resumeEditSession(void 0, true, void 0, void 0, progress));
        } else {
          handlePendingEditSessions();
        }
      } else if (!this.editSessionsStorageService.isSignedIn && // and user has been prompted to sign in on this machine
      hasApplicationLaunchedFromContinueOnFlow === true) {
        handlePendingEditSessions();
      }
    } else {
      this.logService.debug("Auto resuming cloud changes disabled.");
    }
  }
  updateAccountsMenuBadge() {
    if (this.editSessionsStorageService.isSignedIn) {
      return this.accountsMenuBadgeDisposable.clear();
    }
    const badge = new NumberBadge(1, () => localize("check for pending cloud changes", "Check for pending cloud changes"));
    this.accountsMenuBadgeDisposable.value = this.activityService.showAccountsActivity({ badge });
  }
  async autoStoreEditSession() {
    const cancellationTokenSource = new CancellationTokenSource();
    await this.progressService.withProgress({
      location: ProgressLocation.Window,
      type: "syncing",
      title: localize("store working changes", "Storing working changes...")
    }, async () => this.storeEditSession(false, cancellationTokenSource.token), () => {
      cancellationTokenSource.cancel();
      cancellationTokenSource.dispose();
    });
  }
  registerViews() {
    const container = Registry.as(ViewExtensions.ViewContainersRegistry).registerViewContainer(
      {
        id: EDIT_SESSIONS_CONTAINER_ID,
        title: EDIT_SESSIONS_TITLE,
        ctorDescriptor: new SyncDescriptor(
          ViewPaneContainer,
          [EDIT_SESSIONS_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]
        ),
        icon: EDIT_SESSIONS_VIEW_ICON,
        hideIfEmpty: true
      },
      ViewContainerLocation.Sidebar,
      { doNotRegisterOpenCommand: true }
    );
    this._register(this.instantiationService.createInstance(EditSessionsDataViews, container));
  }
  registerActions() {
    this.registerContinueEditSessionAction();
    this.registerResumeLatestEditSessionAction();
    this.registerStoreLatestEditSessionAction();
    this.registerContinueInLocalFolderAction();
    this.registerShowEditSessionViewAction();
    this.registerShowEditSessionOutputChannelAction();
  }
  registerShowEditSessionOutputChannelAction() {
    this._register(registerAction2(class ShowEditSessionOutput extends Action2 {
      constructor() {
        super(showOutputChannelCommand);
      }
      run(accessor, ...args) {
        const outputChannel = accessor.get(IOutputService);
        void outputChannel.showChannel(editSessionsLogId);
      }
    }));
  }
  registerShowEditSessionViewAction() {
    const that = this;
    this._register(registerAction2(class ShowEditSessionView extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.showEditSessions",
          title: localize2("show cloud changes", "Show Cloud Changes"),
          category: EDIT_SESSION_SYNC_CATEGORY,
          f1: true
        });
      }
      async run(accessor) {
        that.shouldShowViewsContext.set(true);
        const viewsService = accessor.get(IViewsService);
        await viewsService.openView(EDIT_SESSIONS_DATA_VIEW_ID);
      }
    }));
  }
  registerContinueEditSessionAction() {
    const that = this;
    this._register(registerAction2(class ContinueEditSessionAction extends Action2 {
      constructor() {
        super(continueWorkingOnCommand);
      }
      async run(accessor, workspaceUri, destination) {
        let uri = workspaceUri;
        if (!destination && !uri) {
          destination = await that.pickContinueEditSessionDestination();
          if (!destination) {
            that.telemetryService.publicLog2("continueOn.editSessions.pick.outcome", { outcome: "noSelection" });
            return;
          }
        }
        const shouldStoreEditSession = await that.shouldContinueOnWithEditSession();
        let ref;
        if (shouldStoreEditSession) {
          that.telemetryService.publicLog2("continueOn.editSessions.store");
          const cancellationTokenSource = new CancellationTokenSource();
          try {
            ref = await that.progressService.withProgress({
              location: ProgressLocation.Notification,
              cancellable: true,
              type: "syncing",
              title: localize("store your working changes", "Storing your working changes...")
            }, async () => {
              const ref2 = await that.storeEditSession(false, cancellationTokenSource.token);
              if (ref2 !== void 0) {
                that.telemetryService.publicLog2("continueOn.editSessions.store.outcome", { outcome: "storeSucceeded", hashedId: hashedEditSessionId(ref2) });
              } else {
                that.telemetryService.publicLog2("continueOn.editSessions.store.outcome", { outcome: "storeSkipped" });
              }
              return ref2;
            }, () => {
              cancellationTokenSource.cancel();
              cancellationTokenSource.dispose();
              that.telemetryService.publicLog2("continueOn.editSessions.store.outcome", { outcome: "storeCancelledByUser" });
            });
          } catch (ex) {
            that.telemetryService.publicLog2("continueOn.editSessions.store.outcome", { outcome: "storeFailed" });
            throw ex;
          }
        }
        uri = destination ? await that.resolveDestination(destination) : uri;
        if (uri === void 0) {
          return;
        }
        if (ref !== void 0 && uri !== "noDestinationUri") {
          const encodedRef = encodeURIComponent(ref);
          uri = uri.with({
            query: uri.query.length > 0 ? uri.query + `&${queryParamName}=${encodedRef}&continueOn=1` : `${queryParamName}=${encodedRef}&continueOn=1`
          });
          that.logService.info(`Opening ${uri.toString()}`);
          await that.openerService.open(uri, { openExternal: true });
        } else if ((!shouldStoreEditSession || ref === void 0) && uri !== "noDestinationUri") {
          that.logService.info(`Opening ${uri.toString()}`);
          await that.openerService.open(uri, { openExternal: true });
        } else if (ref === void 0 && shouldStoreEditSession) {
          that.logService.warn(`Failed to store working changes when invoking ${continueWorkingOnCommand.id}.`);
        }
      }
    }));
  }
  registerResumeLatestEditSessionAction() {
    const that = this;
    this._register(registerAction2(class ResumeLatestEditSessionAction extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.resumeLatest",
          title: localize2("resume latest cloud changes", "Resume Latest Changes from Cloud"),
          category: EDIT_SESSION_SYNC_CATEGORY,
          f1: true
        });
      }
      async run(accessor, editSessionId, forceApplyUnrelatedChange) {
        await that.progressService.withProgress({ ...resumeProgressOptions, title: resumeProgressOptionsTitle }, async () => await that.resumeEditSession(editSessionId, void 0, forceApplyUnrelatedChange));
      }
    }));
    this._register(registerAction2(class ResumeLatestEditSessionAction extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.resumeFromSerializedPayload",
          title: localize2("resume cloud changes", "Resume Changes from Serialized Data"),
          category: "Developer",
          f1: true
        });
      }
      async run(accessor, editSessionId) {
        const data = await that.quickInputService.input({ prompt: "Enter serialized data" });
        if (data) {
          that.editSessionsStorageService.lastReadResources.set("editSessions", { content: data, ref: "" });
        }
        await that.progressService.withProgress({ ...resumeProgressOptions, title: resumeProgressOptionsTitle }, async () => await that.resumeEditSession(editSessionId, void 0, void 0, void 0, void 0, data));
      }
    }));
  }
  registerStoreLatestEditSessionAction() {
    const that = this;
    this._register(registerAction2(class StoreLatestEditSessionAction extends Action2 {
      constructor() {
        super({
          id: "workbench.editSessions.actions.storeCurrent",
          title: localize2("store working changes in cloud", "Store Working Changes in Cloud"),
          category: EDIT_SESSION_SYNC_CATEGORY,
          f1: true
        });
      }
      async run(accessor) {
        const cancellationTokenSource = new CancellationTokenSource();
        await that.progressService.withProgress({
          location: ProgressLocation.Notification,
          title: localize("storing working changes", "Storing working changes...")
        }, async () => {
          that.telemetryService.publicLog2("editSessions.store");
          await that.storeEditSession(true, cancellationTokenSource.token);
        }, () => {
          cancellationTokenSource.cancel();
          cancellationTokenSource.dispose();
        });
      }
    }));
  }
  async resumeEditSession(ref, silent, forceApplyUnrelatedChange, applyPartialMatch, progress, serializedData) {
    await this.remoteAgentService.getEnvironment();
    if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
      return;
    }
    this.logService.info(ref !== void 0 ? `Resuming changes from cloud with ref ${ref}...` : "Checking for pending cloud changes...");
    if (silent && !await this.editSessionsStorageService.initialize("read", true)) {
      return;
    }
    this.telemetryService.publicLog2("editSessions.resume");
    performance.mark("code/willResumeEditSessionFromIdentifier");
    progress?.report({ message: localize("checkingForWorkingChanges", "Checking for pending cloud changes...") });
    const data = serializedData ? { content: serializedData, ref: "" } : await this.editSessionsStorageService.read("editSessions", ref);
    if (!data) {
      if (ref === void 0 && !silent) {
        this.notificationService.info(localize("no cloud changes", "There are no changes to resume from the cloud."));
      } else if (ref !== void 0) {
        this.notificationService.warn(localize("no cloud changes for ref", "Could not resume changes from the cloud for ID {0}.", ref));
      }
      this.logService.info(ref !== void 0 ? `Aborting resuming changes from cloud as no edit session content is available to be applied from ref ${ref}.` : `Aborting resuming edit session as no edit session content is available to be applied`);
      return;
    }
    progress?.report({ message: resumeProgressOptionsTitle });
    const editSession = JSON.parse(data.content);
    ref = data.ref;
    if (editSession.version > EditSessionSchemaVersion) {
      this.notificationService.error(localize("client too old", "Please upgrade to a newer version of {0} to resume your working changes from the cloud.", this.productService.nameLong));
      this.telemetryService.publicLog2("editSessions.resume.outcome", { hashedId: hashedEditSessionId(ref), outcome: "clientUpdateNeeded" });
      return;
    }
    try {
      const { changes, conflictingChanges } = await this.generateChanges(editSession, ref, forceApplyUnrelatedChange, applyPartialMatch);
      if (changes.length === 0) {
        return;
      }
      if (conflictingChanges.length > 0) {
        const { confirmed } = await this.dialogService.confirm({
          type: Severity.Warning,
          message: conflictingChanges.length > 1 ? localize("resume edit session warning many", "Resuming your working changes from the cloud will overwrite the following {0} files. Do you want to proceed?", conflictingChanges.length) : localize("resume edit session warning 1", "Resuming your working changes from the cloud will overwrite {0}. Do you want to proceed?", basename(conflictingChanges[0].uri)),
          detail: conflictingChanges.length > 1 ? getFileNamesMessage(conflictingChanges.map((c) => c.uri)) : void 0
        });
        if (!confirmed) {
          return;
        }
      }
      for (const { uri, type, contents } of changes) {
        if (type === ChangeType.Addition) {
          await this.fileService.writeFile(uri, decodeEditSessionFileContent(editSession.version, contents));
        } else if (type === ChangeType.Deletion && await this.fileService.exists(uri)) {
          await this.fileService.del(uri);
        }
      }
      await this.workspaceStateSynchronizer?.apply();
      this.logService.info(`Deleting edit session with ref ${ref} after successfully applying it to current workspace...`);
      await this.editSessionsStorageService.delete("editSessions", ref);
      this.logService.info(`Deleted edit session with ref ${ref}.`);
      this.telemetryService.publicLog2("editSessions.resume.outcome", { hashedId: hashedEditSessionId(ref), outcome: "resumeSucceeded" });
    } catch (ex) {
      this.logService.error("Failed to resume edit session, reason: ", ex.toString());
      this.notificationService.error(localize("resume failed", "Failed to resume your working changes from the cloud."));
    }
    performance.mark("code/didResumeEditSessionFromIdentifier");
  }
  async generateChanges(editSession, ref, forceApplyUnrelatedChange = false, applyPartialMatch = false) {
    const changes = [];
    const conflictingChanges = [];
    const workspaceFolders = this.contextService.getWorkspace().folders;
    const cancellationTokenSource = new CancellationTokenSource();
    for (const folder of editSession.folders) {
      let folderRoot;
      if (folder.canonicalIdentity) {
        for (const f of workspaceFolders) {
          const identity = await this.editSessionIdentityService.getEditSessionIdentifier(f, cancellationTokenSource.token);
          this.logService.info(`Matching identity ${identity} against edit session folder identity ${folder.canonicalIdentity}...`);
          if (equals(identity, folder.canonicalIdentity) || forceApplyUnrelatedChange) {
            folderRoot = f;
            break;
          }
          if (identity !== void 0) {
            const match = await this.editSessionIdentityService.provideEditSessionIdentityMatch(f, identity, folder.canonicalIdentity, cancellationTokenSource.token);
            if (match === EditSessionIdentityMatch.Complete) {
              folderRoot = f;
              break;
            } else if (match === EditSessionIdentityMatch.Partial && this.configurationService.getValue("workbench.experimental.cloudChanges.partialMatches.enabled") === true) {
              if (!applyPartialMatch) {
                this.notificationService.prompt(
                  Severity.Info,
                  localize("editSessionPartialMatch", "You have pending working changes in the cloud for this workspace. Would you like to resume them?"),
                  [{ label: localize("resume", "Resume"), run: () => this.resumeEditSession(ref, false, void 0, true) }]
                );
              } else {
                folderRoot = f;
                break;
              }
            }
          }
        }
      } else {
        folderRoot = workspaceFolders.find((f) => f.name === folder.name);
      }
      if (!folderRoot) {
        this.logService.info(`Skipping applying ${folder.workingChanges.length} changes from edit session with ref ${ref} as no matching workspace folder was found.`);
        return { changes: [], conflictingChanges: [], contributedStateHandlers: [] };
      }
      const localChanges = /* @__PURE__ */ new Set();
      for (const repository of this.scmService.repositories) {
        if (repository.provider.rootUri !== void 0 && this.contextService.getWorkspaceFolder(repository.provider.rootUri)?.name === folder.name) {
          const repositoryChanges = this.getChangedResources(repository);
          repositoryChanges.forEach((change) => localChanges.add(change.toString()));
        }
      }
      for (const change of folder.workingChanges) {
        const uri = joinPath(folderRoot.uri, change.relativeFilePath);
        if (!this.uriIdentityService.extUri.isEqualOrParent(uri, folderRoot.uri) || this.uriIdentityService.extUri.isEqual(uri, folderRoot.uri)) {
          this.logService.warn(`Skipping change outside workspace folder: ${change.relativeFilePath}`);
          continue;
        }
        changes.push({ uri, type: change.type, contents: change.contents });
        if (await this.willChangeLocalContents(localChanges, uri, change)) {
          conflictingChanges.push({ uri, type: change.type, contents: change.contents });
        }
      }
    }
    return { changes, conflictingChanges };
  }
  async willChangeLocalContents(localChanges, uriWithIncomingChanges, incomingChange) {
    if (!localChanges.has(uriWithIncomingChanges.toString())) {
      return false;
    }
    const { contents, type } = incomingChange;
    switch (type) {
      case ChangeType.Addition: {
        const [originalContents, incomingContents] = await Promise.all([
          hashAsync(contents),
          hashAsync(encodeBase64((await this.fileService.readFile(uriWithIncomingChanges)).value))
        ]);
        return originalContents !== incomingContents;
      }
      case ChangeType.Deletion: {
        return await this.fileService.exists(uriWithIncomingChanges);
      }
      default:
        throw new Error("Unhandled change type.");
    }
  }
  async storeEditSession(fromStoreCommand, cancellationToken) {
    const folders = [];
    let editSessionSize = 0;
    let hasEdits = false;
    await this.editorService.saveAll();
    const createdEditSessionIdentities = new ResourceSet();
    for (const repository of this.scmService.repositories) {
      const changedResources = this.getChangedResources(repository);
      if (!changedResources.size) {
        continue;
      }
      for (const uri of changedResources) {
        const workspaceFolder = this.contextService.getWorkspaceFolder(uri);
        if (!workspaceFolder || createdEditSessionIdentities.has(uri)) {
          continue;
        }
        createdEditSessionIdentities.add(uri);
        await this.editSessionIdentityService.onWillCreateEditSessionIdentity(workspaceFolder, cancellationToken);
      }
    }
    for (const repository of this.scmService.repositories) {
      const trackedUris = this.getChangedResources(repository);
      const workingChanges = [];
      const { rootUri } = repository.provider;
      const workspaceFolder = rootUri ? this.contextService.getWorkspaceFolder(rootUri) : void 0;
      let name = workspaceFolder?.name;
      for (const uri of trackedUris) {
        const workspaceFolder2 = this.contextService.getWorkspaceFolder(uri);
        if (!workspaceFolder2) {
          this.logService.info(`Skipping working change ${uri.toString()} as no associated workspace folder was found.`);
          continue;
        }
        name = name ?? workspaceFolder2.name;
        const relativeFilePath = relativePath(workspaceFolder2.uri, uri) ?? uri.path;
        try {
          if (!(await this.fileService.stat(uri)).isFile) {
            continue;
          }
        } catch {
        }
        hasEdits = true;
        if (await this.fileService.exists(uri)) {
          const contents = encodeBase64((await this.fileService.readFile(uri)).value);
          editSessionSize += contents.length;
          if (editSessionSize > this.editSessionsStorageService.SIZE_LIMIT) {
            this.notificationService.error(localize("payload too large", "Your working changes exceed the size limit and cannot be stored."));
            return void 0;
          }
          workingChanges.push({ type: ChangeType.Addition, fileType: FileType.File, contents, relativeFilePath });
        } else {
          workingChanges.push({ type: ChangeType.Deletion, fileType: FileType.File, contents: void 0, relativeFilePath });
        }
      }
      let canonicalIdentity = void 0;
      if (workspaceFolder !== null && workspaceFolder !== void 0) {
        canonicalIdentity = await this.editSessionIdentityService.getEditSessionIdentifier(workspaceFolder, cancellationToken);
      }
      folders.push({ workingChanges, name: name ?? "", canonicalIdentity: canonicalIdentity ?? void 0, absoluteUri: workspaceFolder?.uri.toString() });
    }
    await this.workspaceStateSynchronizer?.sync();
    if (!hasEdits) {
      this.logService.info("Skipped storing working changes in the cloud as there are no edits to store.");
      if (fromStoreCommand) {
        this.notificationService.info(localize("no working changes to store", "Skipped storing working changes in the cloud as there are no edits to store."));
      }
      return void 0;
    }
    const data = { folders, version: 2, workspaceStateId: this.editSessionsStorageService.lastWrittenResources.get("workspaceState")?.ref };
    try {
      this.logService.info(`Storing edit session...`);
      const ref = await this.editSessionsStorageService.write("editSessions", data);
      this.logService.info(`Stored edit session with ref ${ref}.`);
      return ref;
    } catch (ex) {
      this.logService.error(`Failed to store edit session, reason: `, ex.toString());
      if (ex instanceof UserDataSyncStoreError) {
        switch (ex.code) {
          case UserDataSyncErrorCode.TooLarge:
            this.telemetryService.publicLog2("editSessions.upload.failed", { reason: "TooLarge" });
            this.notificationService.error(localize("payload too large", "Your working changes exceed the size limit and cannot be stored."));
            break;
          default:
            this.telemetryService.publicLog2("editSessions.upload.failed", { reason: "unknown" });
            this.notificationService.error(localize("payload failed", "Your working changes cannot be stored."));
            break;
        }
      }
    }
    return void 0;
  }
  getChangedResources(repository) {
    return repository.provider.groups.reduce((resources, resourceGroups) => {
      resourceGroups.resources.forEach((resource) => resources.add(resource.sourceUri));
      return resources;
    }, /* @__PURE__ */ new Set());
  }
  hasEditSession() {
    for (const repository of this.scmService.repositories) {
      if (this.getChangedResources(repository).size > 0) {
        return true;
      }
    }
    return false;
  }
  async shouldContinueOnWithEditSession() {
    if (this.editSessionsStorageService.isSignedIn) {
      return this.hasEditSession();
    }
    if (this.configurationService.getValue(useEditSessionsWithContinueOn) === "off") {
      this.telemetryService.publicLog2("continueOn.editSessions.canStore.outcome", { outcome: "disabledEditSessionsViaSetting" });
      return false;
    }
    if (this.hasEditSession()) {
      const disposables = new DisposableStore();
      const quickpick = disposables.add(this.quickInputService.createQuickPick());
      quickpick.placeholder = localize("continue with cloud changes", "Select whether to bring your working changes with you");
      quickpick.ok = false;
      quickpick.ignoreFocusOut = true;
      const withCloudChanges = { label: localize("with cloud changes", "Yes, continue with my working changes") };
      const withoutCloudChanges = { label: localize("without cloud changes", "No, continue without my working changes") };
      quickpick.items = [withCloudChanges, withoutCloudChanges];
      const continueWithCloudChanges = await new Promise((resolve, reject) => {
        disposables.add(quickpick.onDidAccept(() => {
          resolve(quickpick.selectedItems[0] === withCloudChanges);
          disposables.dispose();
        }));
        disposables.add(quickpick.onDidHide(() => {
          reject(new CancellationError());
          disposables.dispose();
        }));
        quickpick.show();
      });
      if (!continueWithCloudChanges) {
        this.telemetryService.publicLog2("continueOn.editSessions.canStore.outcome", { outcome: "didNotEnableEditSessionsWhenPrompted" });
        return continueWithCloudChanges;
      }
      const initialized = await this.editSessionsStorageService.initialize("write");
      if (!initialized) {
        this.telemetryService.publicLog2("continueOn.editSessions.canStore.outcome", { outcome: "didNotEnableEditSessionsWhenPrompted" });
      }
      return initialized;
    }
    return false;
  }
  //#region Continue Edit Session extension contribution point
  registerContributedEditSessionOptions() {
    continueEditSessionExtPoint.setHandler((extensions) => {
      const continueEditSessionOptions = [];
      for (const extension of extensions) {
        if (!isProposedApiEnabled(extension.description, "contribEditSessions")) {
          continue;
        }
        if (!Array.isArray(extension.value)) {
          continue;
        }
        for (const contribution of extension.value) {
          const command = MenuRegistry.getCommand(contribution.command);
          if (!command) {
            return;
          }
          const icon = command.icon;
          const title = typeof command.title === "string" ? command.title : command.title.value;
          const when = ContextKeyExpr.deserialize(contribution.when);
          continueEditSessionOptions.push(new ContinueEditSessionItem(
            ThemeIcon.isThemeIcon(icon) ? `$(${icon.id}) ${title}` : title,
            command.id,
            command.source?.title,
            when,
            contribution.documentation
          ));
          if (contribution.qualifiedName) {
            this.generateStandaloneOptionCommand(command.id, contribution.qualifiedName, contribution.category ?? command.category, when, contribution.remoteGroup);
          }
        }
      }
      this.continueEditSessionOptions = continueEditSessionOptions;
    });
  }
  generateStandaloneOptionCommand(commandId, qualifiedName, category, when, remoteGroup) {
    const command = {
      id: `${continueWorkingOnCommand.id}.${commandId}`,
      title: { original: qualifiedName, value: qualifiedName },
      category: typeof category === "string" ? { original: category, value: category } : category,
      precondition: when,
      f1: true
    };
    if (!this.registeredCommands.has(command.id)) {
      this.registeredCommands.add(command.id);
      this._register(registerAction2(class StandaloneContinueOnOption extends Action2 {
        constructor() {
          super(command);
        }
        async run(accessor) {
          return accessor.get(ICommandService).executeCommand(continueWorkingOnCommand.id, void 0, commandId);
        }
      }));
      if (remoteGroup !== void 0) {
        MenuRegistry.appendMenuItem(MenuId.StatusBarRemoteIndicatorMenu, {
          group: remoteGroup,
          command,
          when: command.precondition
        });
      }
    }
  }
  registerContinueInLocalFolderAction() {
    const that = this;
    this._register(registerAction2(class ContinueInLocalFolderAction extends Action2 {
      constructor() {
        super(openLocalFolderCommand);
      }
      async run(accessor) {
        const selection = await that.fileDialogService.showOpenDialog({
          title: localize("continueEditSession.openLocalFolder.title.v2", "Select a local folder to continue working in"),
          canSelectFolders: true,
          canSelectMany: false,
          canSelectFiles: false,
          availableFileSystems: [Schemas.file]
        });
        return selection?.length !== 1 ? void 0 : URI.from({
          scheme: that.productService.urlProtocol,
          authority: Schemas.file,
          path: selection[0].path
        });
      }
    }));
    if (getVirtualWorkspaceLocation(this.contextService.getWorkspace()) !== void 0 && isNative) {
      this.generateStandaloneOptionCommand(openLocalFolderCommand.id, localize("continueWorkingOn.existingLocalFolder", "Continue Working in Existing Local Folder"), void 0, openLocalFolderCommand.precondition, void 0);
    }
  }
  async pickContinueEditSessionDestination() {
    const disposables = new DisposableStore();
    const quickPick = disposables.add(this.quickInputService.createQuickPick({ useSeparators: true }));
    const workspaceContext = this.contextService.getWorkbenchState() === WorkbenchState.FOLDER ? this.contextService.getWorkspace().folders[0].name : this.contextService.getWorkspace().folders.map((folder) => folder.name).join(", ");
    quickPick.placeholder = localize("continueEditSessionPick.title.v2", "Select a development environment to continue working on {0} in", `'${workspaceContext}'`);
    quickPick.items = this.createPickItems();
    disposables.add(this.extensionService.onDidChangeExtensions(() => {
      quickPick.items = this.createPickItems();
    }));
    const command = await new Promise((resolve, reject) => {
      disposables.add(quickPick.onDidHide(() => {
        disposables.dispose();
        resolve(void 0);
      }));
      disposables.add(quickPick.onDidAccept((e) => {
        const selection = quickPick.activeItems[0].command;
        if (selection === installAdditionalContinueOnOptionsCommand.id) {
          void this.commandService.executeCommand(installAdditionalContinueOnOptionsCommand.id);
        } else {
          resolve(selection);
          quickPick.hide();
        }
      }));
      quickPick.show();
      disposables.add(quickPick.onDidTriggerItemButton(async (e) => {
        if (e.item.documentation !== void 0) {
          const uri = URI.isUri(e.item.documentation) ? URI.parse(e.item.documentation) : await this.commandService.executeCommand(e.item.documentation);
          if (uri) {
            void this.openerService.open(uri, { openExternal: true });
          }
        }
      }));
    });
    quickPick.dispose();
    return command;
  }
  async resolveDestination(command) {
    try {
      const uri = await this.commandService.executeCommand(command);
      if (uri === void 0) {
        this.telemetryService.publicLog2("continueOn.openDestination.outcome", { selection: command, outcome: "noDestinationUri" });
        return "noDestinationUri";
      }
      if (URI.isUri(uri)) {
        this.telemetryService.publicLog2("continueOn.openDestination.outcome", { selection: command, outcome: "resolvedUri" });
        return uri;
      }
      this.telemetryService.publicLog2("continueOn.openDestination.outcome", { selection: command, outcome: "invalidDestination" });
      return void 0;
    } catch (ex) {
      if (ex instanceof CancellationError) {
        this.telemetryService.publicLog2("continueOn.openDestination.outcome", { selection: command, outcome: "cancelled" });
      } else {
        this.telemetryService.publicLog2("continueOn.openDestination.outcome", { selection: command, outcome: "unknownError" });
      }
      return void 0;
    }
  }
  createPickItems() {
    const items = [...this.continueEditSessionOptions].filter((option) => option.when === void 0 || this.contextKeyService.contextMatchesRules(option.when));
    if (getVirtualWorkspaceLocation(this.contextService.getWorkspace()) !== void 0 && isNative) {
      items.push(new ContinueEditSessionItem(
        "$(folder) " + localize("continueEditSessionItem.openInLocalFolder.v2", "Open in Local Folder"),
        openLocalFolderCommand.id,
        localize("continueEditSessionItem.builtin", "Built-in")
      ));
    }
    const sortedItems = items.sort((item1, item2) => item1.label.localeCompare(item2.label));
    return sortedItems.concat({ type: "separator" }, new ContinueEditSessionItem(installAdditionalContinueOnOptionsCommand.title, installAdditionalContinueOnOptionsCommand.id));
  }
};
EditSessionsContribution.APPLICATION_LAUNCHED_VIA_CONTINUE_ON_STORAGE_KEY = "applicationLaunchedViaContinueOn";
EditSessionsContribution = __decorateClass([
  __decorateParam(0, IEditSessionsStorageService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IProgressService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, ISCMService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IDialogService),
  __decorateParam(8, IEditSessionsLogService),
  __decorateParam(9, IEnvironmentService),
  __decorateParam(10, IInstantiationService),
  __decorateParam(11, IProductService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, IWorkspaceContextService),
  __decorateParam(14, IEditSessionIdentityService),
  __decorateParam(15, IQuickInputService),
  __decorateParam(16, ICommandService),
  __decorateParam(17, IContextKeyService),
  __decorateParam(18, IFileDialogService),
  __decorateParam(19, ILifecycleService),
  __decorateParam(20, IStorageService),
  __decorateParam(21, IActivityService),
  __decorateParam(22, IEditorService),
  __decorateParam(23, IRemoteAgentService),
  __decorateParam(24, IExtensionService),
  __decorateParam(25, IRequestService),
  __decorateParam(26, IUserDataProfilesService),
  __decorateParam(27, IUriIdentityService),
  __decorateParam(28, IWorkspaceIdentityService)
], EditSessionsContribution);
const infoButtonClass = ThemeIcon.asClassName(Codicon.info);
class ContinueEditSessionItem {
  constructor(label, command, description, when, documentation) {
    this.label = label;
    this.command = command;
    this.description = description;
    this.when = when;
    this.documentation = documentation;
    if (documentation !== void 0) {
      this.buttons = [{
        iconClass: infoButtonClass,
        tooltip: localize("learnMoreTooltip", "Learn More")
      }];
    }
  }
}
const continueEditSessionExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "continueEditSession",
  jsonSchema: {
    description: localize("continueEditSessionExtPoint", "Contributes options for continuing the current edit session in a different environment"),
    type: "array",
    items: {
      type: "object",
      properties: {
        command: {
          description: localize("continueEditSessionExtPoint.command", "Identifier of the command to execute. The command must be declared in the 'commands'-section and return a URI representing a different environment where the current edit session can be continued."),
          type: "string"
        },
        group: {
          description: localize("continueEditSessionExtPoint.group", "Group into which this item belongs."),
          type: "string"
        },
        qualifiedName: {
          description: localize("continueEditSessionExtPoint.qualifiedName", "A fully qualified name for this item which is used for display in menus."),
          type: "string"
        },
        description: {
          description: localize("continueEditSessionExtPoint.description", "The url, or a command that returns the url, to the option's documentation page."),
          type: "string"
        },
        remoteGroup: {
          description: localize("continueEditSessionExtPoint.remoteGroup", "Group into which this item belongs in the remote indicator."),
          type: "string"
        },
        when: {
          description: localize("continueEditSessionExtPoint.when", "Condition which must be true to show this item."),
          type: "string"
        }
      },
      required: ["command"]
    }
  }
});
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(EditSessionsContribution, LifecyclePhase.Restored);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  ...workbenchConfigurationNodeBase,
  "properties": {
    "workbench.experimental.cloudChanges.autoStore": {
      enum: ["onShutdown", "off"],
      enumDescriptions: [
        localize("autoStoreWorkingChanges.onShutdown", "Automatically store current working changes in the cloud on window close."),
        localize("autoStoreWorkingChanges.off", "Never attempt to automatically store working changes in the cloud.")
      ],
      "type": "string",
      "tags": ["experimental", "usesOnlineServices"],
      "default": "off",
      "markdownDescription": localize("autoStoreWorkingChangesDescription", "Controls whether to automatically store available working changes in the cloud for the current workspace. This setting has no effect in the web.")
    },
    "workbench.cloudChanges.autoResume": {
      enum: ["onReload", "off"],
      enumDescriptions: [
        localize("autoResumeWorkingChanges.onReload", "Automatically resume available working changes from the cloud on window reload."),
        localize("autoResumeWorkingChanges.off", "Never attempt to resume working changes from the cloud.")
      ],
      "type": "string",
      "tags": ["usesOnlineServices"],
      "default": "onReload",
      "markdownDescription": localize("autoResumeWorkingChanges", "Controls whether to automatically resume available working changes stored in the cloud for the current workspace.")
    },
    "workbench.cloudChanges.continueOn": {
      enum: ["prompt", "off"],
      enumDescriptions: [
        localize("continueOnCloudChanges.promptForAuth", "Prompt the user to sign in to store working changes in the cloud with Continue Working On."),
        localize("continueOnCloudChanges.off", "Do not store working changes in the cloud with Continue Working On unless the user has already turned on Cloud Changes.")
      ],
      type: "string",
      tags: ["usesOnlineServices"],
      default: "prompt",
      markdownDescription: localize("continueOnCloudChanges", "Controls whether to prompt the user to store working changes in the cloud when using Continue Working On.")
    },
    "workbench.experimental.cloudChanges.partialMatches.enabled": {
      "type": "boolean",
      "tags": ["experimental", "usesOnlineServices"],
      "default": false,
      "markdownDescription": localize("cloudChangesPartialMatchesEnabled", "Controls whether to surface cloud changes which partially match the current session.")
    }
  }
});
export {
  EditSessionsContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRTZXNzaW9ucy9icm93c2VyL2VkaXRTZXNzaW9ucy5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucywgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlLCBMaWZlY3ljbGVQaGFzZSwgU2h1dGRvd25SZWFzb24gfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBJQWN0aW9uMk9wdGlvbnMsIE1lbnVJZCwgTWVudVJlZ2lzdHJ5LCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLCBDaGFuZ2UsIENoYW5nZVR5cGUsIEZvbGRlciwgRWRpdFNlc3Npb24sIEZpbGVUeXBlLCBFRElUX1NFU1NJT05fU1lOQ19DQVRFR09SWSwgRURJVF9TRVNTSU9OU19DT05UQUlORVJfSUQsIEVkaXRTZXNzaW9uU2NoZW1hVmVyc2lvbiwgSUVkaXRTZXNzaW9uc0xvZ1NlcnZpY2UsIEVESVRfU0VTU0lPTlNfVklFV19JQ09OLCBFRElUX1NFU1NJT05TX1RJVExFLCBFRElUX1NFU1NJT05TX1NIT1dfVklFVywgRURJVF9TRVNTSU9OU19EQVRBX1ZJRVdfSUQsIGRlY29kZUVkaXRTZXNzaW9uRmlsZUNvbnRlbnQsIGhhc2hlZEVkaXRTZXNzaW9uSWQsIGVkaXRTZXNzaW9uc0xvZ0lkLCBFRElUX1NFU1NJT05TX1BFTkRJTkcgfSBmcm9tICcuLi9jb21tb24vZWRpdFNlc3Npb25zLmpzJztcbmltcG9ydCB7IElTQ01SZXBvc2l0b3J5LCBJU0NNU2VydmljZSB9IGZyb20gJy4uLy4uL3NjbS9jb21tb24vc2NtLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElXb3Jrc3BhY2VGb2xkZXIsIFdvcmtiZW5jaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBqb2luUGF0aCwgcmVsYXRpdmVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGVuY29kZUJhc2U2NCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElQcm9ncmVzcywgSVByb2dyZXNzU2VydmljZSwgSVByb2dyZXNzU3RlcCwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBFZGl0U2Vzc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi9lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFVzZXJEYXRhU3luY0Vycm9yQ29kZSwgVXNlckRhdGFTeW5jU3RvcmVFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgZ2V0RmlsZU5hbWVzTWVzc2FnZSwgSURpYWxvZ1NlcnZpY2UsIElGaWxlRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaENvbmZpZ3VyYXRpb25Ob2RlQmFzZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRCdXR0b24sIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgQ29udGV4dEtleUV4cHJlc3Npb24sIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBnZXRWaXJ0dWFsV29ya3NwYWNlTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3ZpcnR1YWxXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSXNXZWJDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UsIGlzUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0U2Vzc2lvbnNMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2VkaXRTZXNzaW9uc0xvZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVZpZXdDb250YWluZXJzUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgVmlld0V4dGVuc2lvbnMsIFZpZXdDb250YWluZXJMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdmlld3MvY29tbW9uL3ZpZXdzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IFZpZXdQYW5lQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZUNvbnRhaW5lci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEVkaXRTZXNzaW9uc0RhdGFWaWV3cyB9IGZyb20gJy4vZWRpdFNlc3Npb25zVmlld3MuanMnO1xuaW1wb3J0IHsgRWRpdFNlc3Npb25zRmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi9lZGl0U2Vzc2lvbnNGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgaXNOYXRpdmUsIGlzV2ViIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVmlydHVhbFdvcmtzcGFjZUNvbnRleHQsIFdvcmtzcGFjZUZvbGRlckNvdW50Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBFZGl0U2Vzc2lvbklkZW50aXR5TWF0Y2gsIElFZGl0U2Vzc2lvbklkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vZWRpdFNlc3Npb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJT3V0cHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL291dHB1dC9jb21tb24vb3V0cHV0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJQWN0aXZpdHlTZXJ2aWNlLCBOdW1iZXJCYWRnZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2FjdGl2aXR5L2NvbW1vbi9hY3Rpdml0eS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9jYWxpemVkU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZVN0YXRlU3luY2hyb25pc2VyIH0gZnJvbSAnLi4vY29tbW9uL3dvcmtzcGFjZVN0YXRlU3luYy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJUmVxdWVzdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZXF1ZXN0L2NvbW1vbi9yZXF1ZXN0LmpzJztcbmltcG9ydCB7IEVkaXRTZXNzaW9uc1N0b3JlQ2xpZW50IH0gZnJvbSAnLi4vY29tbW9uL2VkaXRTZXNzaW9uc1N0b3JhZ2VDbGllbnQuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlSWRlbnRpdHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGhhc2hBc3luYyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hhc2guanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VTZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuXG5yZWdpc3RlclNpbmdsZXRvbihJRWRpdFNlc3Npb25zTG9nU2VydmljZSwgRWRpdFNlc3Npb25zTG9nU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5yZWdpc3RlclNpbmdsZXRvbihJRWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UsIEVkaXRTZXNzaW9uc1dvcmtiZW5jaFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuXG5cbmNvbnN0IGNvbnRpbnVlV29ya2luZ09uQ29tbWFuZDogSUFjdGlvbjJPcHRpb25zID0ge1xuXHRpZDogJ193b3JrYmVuY2guZWRpdFNlc3Npb25zLmFjdGlvbnMuY29udGludWVFZGl0U2Vzc2lvbicsXG5cdHRpdGxlOiBsb2NhbGl6ZTIoJ2NvbnRpbnVlIHdvcmtpbmcgb24nLCAnQ29udGludWUgV29ya2luZyBPbi4uLicpLFxuXHRwcmVjb25kaXRpb246IFdvcmtzcGFjZUZvbGRlckNvdW50Q29udGV4dC5ub3RFcXVhbHNUbygnMCcpLFxuXHRmMTogdHJ1ZVxufTtcbmNvbnN0IG9wZW5Mb2NhbEZvbGRlckNvbW1hbmQ6IElBY3Rpb24yT3B0aW9ucyA9IHtcblx0aWQ6ICdfd29ya2JlbmNoLmVkaXRTZXNzaW9ucy5hY3Rpb25zLmNvbnRpbnVlRWRpdFNlc3Npb24ub3BlbkxvY2FsRm9sZGVyJyxcblx0dGl0bGU6IGxvY2FsaXplMignY29udGludWUgZWRpdCBzZXNzaW9uIGluIGxvY2FsIGZvbGRlcicsICdPcGVuIEluIExvY2FsIEZvbGRlcicpLFxuXHRjYXRlZ29yeTogRURJVF9TRVNTSU9OX1NZTkNfQ0FURUdPUlksXG5cdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKElzV2ViQ29udGV4dC50b05lZ2F0ZWQoKSwgVmlydHVhbFdvcmtzcGFjZUNvbnRleHQpXG59O1xuY29uc3Qgc2hvd091dHB1dENoYW5uZWxDb21tYW5kOiBJQWN0aW9uMk9wdGlvbnMgPSB7XG5cdGlkOiAnd29ya2JlbmNoLmVkaXRTZXNzaW9ucy5hY3Rpb25zLnNob3dPdXRwdXRDaGFubmVsJyxcblx0dGl0bGU6IGxvY2FsaXplMignc2hvdyBsb2cnLCBcIlNob3cgTG9nXCIpLFxuXHRjYXRlZ29yeTogRURJVF9TRVNTSU9OX1NZTkNfQ0FURUdPUllcbn07XG5jb25zdCBpbnN0YWxsQWRkaXRpb25hbENvbnRpbnVlT25PcHRpb25zQ29tbWFuZCA9IHtcblx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNvbnRpbnVlT24uZXh0ZW5zaW9ucycsXG5cdHRpdGxlOiBsb2NhbGl6ZSgnY29udGludWVPbi5pbnN0YWxsQWRkaXRpb25hbCcsICdJbnN0YWxsIGFkZGl0aW9uYWwgZGV2ZWxvcG1lbnQgZW52aXJvbm1lbnQgb3B0aW9ucycpLFxufTtcbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7IC4uLmluc3RhbGxBZGRpdGlvbmFsQ29udGludWVPbk9wdGlvbnNDb21tYW5kLCBmMTogZmFsc2UgfSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSkub3BlblNlYXJjaCgnQHRhZzpjb250aW51ZU9uJyk7XG5cdH1cbn0pO1xuXG5jb25zdCByZXN1bWVQcm9ncmVzc09wdGlvbnNUaXRsZSA9IGBbJHtsb2NhbGl6ZSgncmVzdW1pbmcgd29ya2luZyBjaGFuZ2VzIHdpbmRvdycsICdSZXN1bWluZyB3b3JraW5nIGNoYW5nZXMuLi4nKX1dKGNvbW1hbmQ6JHtzaG93T3V0cHV0Q2hhbm5lbENvbW1hbmQuaWR9KWA7XG5jb25zdCByZXN1bWVQcm9ncmVzc09wdGlvbnMgPSB7XG5cdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdyxcblx0dHlwZTogJ3N5bmNpbmcnLFxufTtcbmNvbnN0IHF1ZXJ5UGFyYW1OYW1lID0gJ2VkaXRTZXNzaW9uSWQnO1xuXG5jb25zdCB1c2VFZGl0U2Vzc2lvbnNXaXRoQ29udGludWVPbiA9ICd3b3JrYmVuY2guZWRpdFNlc3Npb25zLmNvbnRpbnVlT24nO1xuZXhwb3J0IGNsYXNzIEVkaXRTZXNzaW9uc0NvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIGNvbnRpbnVlRWRpdFNlc3Npb25PcHRpb25zOiBDb250aW51ZUVkaXRTZXNzaW9uSXRlbVtdID0gW107XG5cblx0cHJpdmF0ZSByZWFkb25seSBzaG91bGRTaG93Vmlld3NDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBwZW5kaW5nRWRpdFNlc3Npb25zQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSBzdGF0aWMgQVBQTElDQVRJT05fTEFVTkNIRURfVklBX0NPTlRJTlVFX09OX1NUT1JBR0VfS0VZID0gJ2FwcGxpY2F0aW9uTGF1bmNoZWRWaWFDb250aW51ZU9uJztcblx0cHJpdmF0ZSByZWFkb25seSBhY2NvdW50c01lbnVCYWRnZURpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSByZWdpc3RlcmVkQ29tbWFuZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHdvcmtzcGFjZVN0YXRlU3luY2hyb25pemVyOiBXb3Jrc3BhY2VTdGF0ZVN5bmNocm9uaXNlciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBlZGl0U2Vzc2lvbnNTdG9yYWdlQ2xpZW50OiBFZGl0U2Vzc2lvbnNTdG9yZUNsaWVudCB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2U6IElFZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2dyZXNzU2VydmljZTogSVByb2dyZXNzU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBvcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVNDTVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzY21TZXJ2aWNlOiBJU0NNU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUVkaXRTZXNzaW9uc0xvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJRWRpdFNlc3Npb25zTG9nU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUVkaXRTZXNzaW9uSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdFNlc3Npb25JZGVudGl0eVNlcnZpY2U6IElFZGl0U2Vzc2lvbklkZW50aXR5U2VydmljZSxcblx0XHRASVF1aWNrSW5wdXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUFjdGl2aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGl2aXR5U2VydmljZTogSUFjdGl2aXR5U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVJlbW90ZUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASVdvcmtzcGFjZUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUlkZW50aXR5U2VydmljZTogSVdvcmtzcGFjZUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuc2hvdWxkU2hvd1ZpZXdzQ29udGV4dCA9IEVESVRfU0VTU0lPTlNfU0hPV19WSUVXLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnBlbmRpbmdFZGl0U2Vzc2lvbnNDb250ZXh0ID0gRURJVF9TRVNTSU9OU19QRU5ESU5HLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnBlbmRpbmdFZGl0U2Vzc2lvbnNDb250ZXh0LnNldChmYWxzZSk7XG5cblx0XHRpZiAoIXRoaXMucHJvZHVjdFNlcnZpY2VbJ2VkaXRTZXNzaW9ucy5zdG9yZSddPy51cmwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VDbGllbnQgPSBuZXcgRWRpdFNlc3Npb25zU3RvcmVDbGllbnQoVVJJLnBhcnNlKHRoaXMucHJvZHVjdFNlcnZpY2VbJ2VkaXRTZXNzaW9ucy5zdG9yZSddLnVybCksIHRoaXMucHJvZHVjdFNlcnZpY2UsIHRoaXMucmVxdWVzdFNlcnZpY2UsIHRoaXMubG9nU2VydmljZSwgdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UsIHRoaXMuZmlsZVNlcnZpY2UsIHRoaXMuc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2Uuc3RvcmVDbGllbnQgPSB0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VDbGllbnQ7XG5cdFx0dGhpcy53b3Jrc3BhY2VTdGF0ZVN5bmNocm9uaXplciA9IG5ldyBXb3Jrc3BhY2VTdGF0ZVN5bmNocm9uaXNlcih0aGlzLnVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLmRlZmF1bHRQcm9maWxlLCB1bmRlZmluZWQsIHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZUNsaWVudCwgdGhpcy5sb2dTZXJ2aWNlLCB0aGlzLmZpbGVTZXJ2aWNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZSwgdGhpcy50ZWxlbWV0cnlTZXJ2aWNlLCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLnN0b3JhZ2VTZXJ2aWNlLCB0aGlzLnVyaUlkZW50aXR5U2VydmljZSwgdGhpcy53b3Jrc3BhY2VJZGVudGl0eVNlcnZpY2UsIHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UpO1xuXG5cdFx0dGhpcy5hdXRvUmVzdW1lRWRpdFNlc3Npb24oKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJBY3Rpb25zKCk7XG5cdFx0dGhpcy5yZWdpc3RlclZpZXdzKCk7XG5cdFx0dGhpcy5yZWdpc3RlckNvbnRyaWJ1dGVkRWRpdFNlc3Npb25PcHRpb25zKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoRWRpdFNlc3Npb25zRmlsZVN5c3RlbVByb3ZpZGVyLlNDSEVNQSwgbmV3IEVkaXRTZXNzaW9uc0ZpbGVTeXN0ZW1Qcm92aWRlcih0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubGlmZWN5Y2xlU2VydmljZS5vbldpbGxTaHV0ZG93bigoZSkgPT4ge1xuXHRcdFx0aWYgKGUucmVhc29uICE9PSBTaHV0ZG93blJlYXNvbi5SRUxPQUQgJiYgdGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS5pc1NpZ25lZEluICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3dvcmtiZW5jaC5leHBlcmltZW50YWwuY2xvdWRDaGFuZ2VzLmF1dG9TdG9yZScpID09PSAnb25TaHV0ZG93bicgJiYgIWlzV2ViKSB7XG5cdFx0XHRcdGUuam9pbih0aGlzLmF1dG9TdG9yZUVkaXRTZXNzaW9uKCksIHsgaWQ6ICdhdXRvU3RvcmVXb3JraW5nQ2hhbmdlcycsIGxhYmVsOiBsb2NhbGl6ZSgnYXV0b1N0b3JlV29ya2luZ0NoYW5nZXMnLCAnU3RvcmluZyBjdXJyZW50IHdvcmtpbmcgY2hhbmdlcy4uLicpIH0pO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLm9uRGlkU2lnbkluKCgpID0+IHRoaXMudXBkYXRlQWNjb3VudHNNZW51QmFkZ2UoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2Uub25EaWRTaWduT3V0KCgpID0+IHRoaXMudXBkYXRlQWNjb3VudHNNZW51QmFkZ2UoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhdXRvUmVzdW1lRWRpdFNlc3Npb24oKSB7XG5cdFx0Y29uc3Qgc2hvdWxkQXV0b1Jlc3VtZU9uUmVsb2FkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnd29ya2JlbmNoLmNsb3VkQ2hhbmdlcy5hdXRvUmVzdW1lJykgPT09ICdvblJlbG9hZCc7XG5cblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZWRpdFNlc3Npb25JZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgUmVzdW1pbmcgY2xvdWQgY2hhbmdlcywgcmVhc29uOiBmb3VuZCBlZGl0U2Vzc2lvbklkICR7dGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZWRpdFNlc3Npb25JZH0gaW4gZW52aXJvbm1lbnQgc2VydmljZS4uLmApO1xuXHRcdFx0YXdhaXQgdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHJlc3VtZVByb2dyZXNzT3B0aW9ucywgYXN5bmMgKHByb2dyZXNzKSA9PiBhd2FpdCB0aGlzLnJlc3VtZUVkaXRTZXNzaW9uKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmVkaXRTZXNzaW9uSWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHByb2dyZXNzKS5maW5hbGx5KCgpID0+IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmVkaXRTZXNzaW9uSWQgPSB1bmRlZmluZWQpKTtcblx0XHR9IGVsc2UgaWYgKHNob3VsZEF1dG9SZXN1bWVPblJlbG9hZCAmJiB0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLmlzU2lnbmVkSW4pIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdSZXN1bWluZyBjbG91ZCBjaGFuZ2VzLCByZWFzb246IGNsb3VkIGNoYW5nZXMgZW5hYmxlZC4uLicpO1xuXHRcdFx0Ly8gQXR0ZW1wdCB0byByZXN1bWUgZWRpdCBzZXNzaW9uIGJhc2VkIG9uIGVkaXQgd29ya3NwYWNlIGlkZW50aWZpZXJcblx0XHRcdC8vIE5vdGU6IGF0IHRoaXMgcG9pbnQgaWYgdGhlIHVzZXIgaXMgbm90IHNpZ25lZCBpbnRvIGVkaXQgc2Vzc2lvbnMsXG5cdFx0XHQvLyB3ZSBkb24ndCB3YW50IHRoZW0gdG8gYmUgcHJvbXB0ZWQgdG8gc2lnbiBpbiBhbmQgc2hvdWxkIGp1c3QgcmV0dXJuIGVhcmx5XG5cdFx0XHRhd2FpdCB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MocmVzdW1lUHJvZ3Jlc3NPcHRpb25zLCBhc3luYyAocHJvZ3Jlc3MpID0+IGF3YWl0IHRoaXMucmVzdW1lRWRpdFNlc3Npb24odW5kZWZpbmVkLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgcHJvZ3Jlc3MpKTtcblx0XHR9IGVsc2UgaWYgKHNob3VsZEF1dG9SZXN1bWVPblJlbG9hZCkge1xuXHRcdFx0Ly8gVGhlIGFwcGxpY2F0aW9uIGhhcyBwcmV2aW91c2x5IGxhdW5jaGVkIHZpYSBhIHByb3RvY29sIFVSTCBDb250aW51ZSBPbiBmbG93XG5cdFx0XHRjb25zdCBoYXNBcHBsaWNhdGlvbkxhdW5jaGVkRnJvbUNvbnRpbnVlT25GbG93ID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXRCb29sZWFuKEVkaXRTZXNzaW9uc0NvbnRyaWJ1dGlvbi5BUFBMSUNBVElPTl9MQVVOQ0hFRF9WSUFfQ09OVElOVUVfT05fU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgZmFsc2UpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFByb21wdGluZyB0byBlbmFibGUgY2xvdWQgY2hhbmdlcywgaGFzIGFwcGxpY2F0aW9uIHByZXZpb3VzbHkgbGF1bmNoZWQgZnJvbSBDb250aW51ZSBPbiBmbG93OiAke2hhc0FwcGxpY2F0aW9uTGF1bmNoZWRGcm9tQ29udGludWVPbkZsb3d9YCk7XG5cblx0XHRcdGNvbnN0IGhhbmRsZVBlbmRpbmdFZGl0U2Vzc2lvbnMgPSAoKSA9PiB7XG5cdFx0XHRcdC8vIGRpc3BsYXkgYSBiYWRnZSBpbiB0aGUgYWNjb3VudHMgbWVudSBidXQgZG8gbm90IHByb21wdCB0aGUgdXNlciB0byBzaWduIGluIGFnYWluXG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdTaG93aW5nIGJhZGdlIHRvIGVuYWJsZSBjbG91ZCBjaGFuZ2VzIGluIGFjY291bnRzIG1lbnUuLi4nKTtcblx0XHRcdFx0dGhpcy51cGRhdGVBY2NvdW50c01lbnVCYWRnZSgpO1xuXHRcdFx0XHR0aGlzLnBlbmRpbmdFZGl0U2Vzc2lvbnNDb250ZXh0LnNldCh0cnVlKTtcblx0XHRcdFx0Ly8gYXR0ZW1wdCBhIHJlc3VtZSBpZiB3ZSBhcmUgaW4gYSBwZW5kaW5nIHN0YXRlIGFuZCB0aGUgdXNlciBqdXN0IHNpZ25lZCBpblxuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gdGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS5vbkRpZFNpZ25Jbihhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1Nob3dpbmcgYmFkZ2UgdG8gZW5hYmxlIGNsb3VkIGNoYW5nZXMgaW4gYWNjb3VudHMgbWVudSBzdWNjZWVkZWQsIHJlc3VtaW5nIGNsb3VkIGNoYW5nZXMuLi4nKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnByb2dyZXNzU2VydmljZS53aXRoUHJvZ3Jlc3MocmVzdW1lUHJvZ3Jlc3NPcHRpb25zLCBhc3luYyAocHJvZ3Jlc3MpID0+IGF3YWl0IHRoaXMucmVzdW1lRWRpdFNlc3Npb24odW5kZWZpbmVkLCB0cnVlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgcHJvZ3Jlc3MpKTtcblx0XHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnJlbW92ZShFZGl0U2Vzc2lvbnNDb250cmlidXRpb24uQVBQTElDQVRJT05fTEFVTkNIRURfVklBX0NPTlRJTlVFX09OX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdFx0XHRcdHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmNvbnRpbnVlT24gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fTtcblxuXHRcdFx0aWYgKCh0aGlzLmVudmlyb25tZW50U2VydmljZS5jb250aW51ZU9uICE9PSB1bmRlZmluZWQpICYmXG5cdFx0XHRcdCF0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLmlzU2lnbmVkSW4gJiZcblx0XHRcdFx0Ly8gYW5kIHVzZXIgaGFzIG5vdCB5ZXQgYmVlbiBwcm9tcHRlZCB0byBzaWduIGluIG9uIHRoaXMgbWFjaGluZVxuXHRcdFx0XHRoYXNBcHBsaWNhdGlvbkxhdW5jaGVkRnJvbUNvbnRpbnVlT25GbG93ID09PSBmYWxzZVxuXHRcdFx0KSB7XG5cdFx0XHRcdC8vIHN0b3JlIHRoZSBmYWN0IHRoYXQgd2UgcHJvbXB0ZWQgdGhlIHVzZXJcblx0XHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShFZGl0U2Vzc2lvbnNDb250cmlidXRpb24uQVBQTElDQVRJT05fTEFVTkNIRURfVklBX0NPTlRJTlVFX09OX1NUT1JBR0VfS0VZLCB0cnVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKCdQcm9tcHRpbmcgdG8gZW5hYmxlIGNsb3VkIGNoYW5nZXMuLi4nKTtcblx0XHRcdFx0YXdhaXQgdGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS5pbml0aWFsaXplKCdyZWFkJyk7XG5cdFx0XHRcdGlmICh0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLmlzU2lnbmVkSW4pIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbygnUHJvbXB0aW5nIHRvIGVuYWJsZSBjbG91ZCBjaGFuZ2VzIHN1Y2NlZWRlZCwgcmVzdW1pbmcgY2xvdWQgY2hhbmdlcy4uLicpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyhyZXN1bWVQcm9ncmVzc09wdGlvbnMsIGFzeW5jIChwcm9ncmVzcykgPT4gYXdhaXQgdGhpcy5yZXN1bWVFZGl0U2Vzc2lvbih1bmRlZmluZWQsIHRydWUsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBwcm9ncmVzcykpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGhhbmRsZVBlbmRpbmdFZGl0U2Vzc2lvbnMoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICghdGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS5pc1NpZ25lZEluICYmXG5cdFx0XHRcdC8vIGFuZCB1c2VyIGhhcyBiZWVuIHByb21wdGVkIHRvIHNpZ24gaW4gb24gdGhpcyBtYWNoaW5lXG5cdFx0XHRcdGhhc0FwcGxpY2F0aW9uTGF1bmNoZWRGcm9tQ29udGludWVPbkZsb3cgPT09IHRydWVcblx0XHRcdCkge1xuXHRcdFx0XHRoYW5kbGVQZW5kaW5nRWRpdFNlc3Npb25zKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnQXV0byByZXN1bWluZyBjbG91ZCBjaGFuZ2VzIGRpc2FibGVkLicpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQWNjb3VudHNNZW51QmFkZ2UoKSB7XG5cdFx0aWYgKHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UuaXNTaWduZWRJbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuYWNjb3VudHNNZW51QmFkZ2VEaXNwb3NhYmxlLmNsZWFyKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmFkZ2UgPSBuZXcgTnVtYmVyQmFkZ2UoMSwgKCkgPT4gbG9jYWxpemUoJ2NoZWNrIGZvciBwZW5kaW5nIGNsb3VkIGNoYW5nZXMnLCAnQ2hlY2sgZm9yIHBlbmRpbmcgY2xvdWQgY2hhbmdlcycpKTtcblx0XHR0aGlzLmFjY291bnRzTWVudUJhZGdlRGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMuYWN0aXZpdHlTZXJ2aWNlLnNob3dBY2NvdW50c0FjdGl2aXR5KHsgYmFkZ2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGF1dG9TdG9yZUVkaXRTZXNzaW9uKCkge1xuXHRcdGNvbnN0IGNhbmNlbGxhdGlvblRva2VuU291cmNlID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0YXdhaXQgdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLldpbmRvdyxcblx0XHRcdHR5cGU6ICdzeW5jaW5nJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc3RvcmUgd29ya2luZyBjaGFuZ2VzJywgJ1N0b3Jpbmcgd29ya2luZyBjaGFuZ2VzLi4uJylcblx0XHR9LCBhc3luYyAoKSA9PiB0aGlzLnN0b3JlRWRpdFNlc3Npb24oZmFsc2UsIGNhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuKSwgKCkgPT4ge1xuXHRcdFx0Y2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdFx0XHRjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyVmlld3MoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gUmVnaXN0cnkuYXM8SVZpZXdDb250YWluZXJzUmVnaXN0cnk+KFZpZXdFeHRlbnNpb25zLlZpZXdDb250YWluZXJzUmVnaXN0cnkpLnJlZ2lzdGVyVmlld0NvbnRhaW5lcihcblx0XHRcdHtcblx0XHRcdFx0aWQ6IEVESVRfU0VTU0lPTlNfQ09OVEFJTkVSX0lELFxuXHRcdFx0XHR0aXRsZTogRURJVF9TRVNTSU9OU19USVRMRSxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcihcblx0XHRcdFx0XHRWaWV3UGFuZUNvbnRhaW5lcixcblx0XHRcdFx0XHRbRURJVF9TRVNTSU9OU19DT05UQUlORVJfSUQsIHsgbWVyZ2VWaWV3V2l0aENvbnRhaW5lcldoZW5TaW5nbGVWaWV3OiB0cnVlIH1dXG5cdFx0XHRcdCksXG5cdFx0XHRcdGljb246IEVESVRfU0VTU0lPTlNfVklFV19JQ09OLFxuXHRcdFx0XHRoaWRlSWZFbXB0eTogdHJ1ZVxuXHRcdFx0fSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIsIHsgZG9Ob3RSZWdpc3Rlck9wZW5Db21tYW5kOiB0cnVlIH1cblx0XHQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdFNlc3Npb25zRGF0YVZpZXdzLCBjb250YWluZXIpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJBY3Rpb25zKCkge1xuXHRcdHRoaXMucmVnaXN0ZXJDb250aW51ZUVkaXRTZXNzaW9uQWN0aW9uKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyUmVzdW1lTGF0ZXN0RWRpdFNlc3Npb25BY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyU3RvcmVMYXRlc3RFZGl0U2Vzc2lvbkFjdGlvbigpO1xuXG5cdFx0dGhpcy5yZWdpc3RlckNvbnRpbnVlSW5Mb2NhbEZvbGRlckFjdGlvbigpO1xuXG5cdFx0dGhpcy5yZWdpc3RlclNob3dFZGl0U2Vzc2lvblZpZXdBY3Rpb24oKTtcblx0XHR0aGlzLnJlZ2lzdGVyU2hvd0VkaXRTZXNzaW9uT3V0cHV0Q2hhbm5lbEFjdGlvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclNob3dFZGl0U2Vzc2lvbk91dHB1dENoYW5uZWxBY3Rpb24oKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFNob3dFZGl0U2Vzc2lvbk91dHB1dCBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHNob3dPdXRwdXRDaGFubmVsQ29tbWFuZCk7XG5cdFx0XHR9XG5cblx0XHRcdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0XHRcdGNvbnN0IG91dHB1dENoYW5uZWwgPSBhY2Nlc3Nvci5nZXQoSU91dHB1dFNlcnZpY2UpO1xuXHRcdFx0XHR2b2lkIG91dHB1dENoYW5uZWwuc2hvd0NoYW5uZWwoZWRpdFNlc3Npb25zTG9nSWQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJTaG93RWRpdFNlc3Npb25WaWV3QWN0aW9uKCkge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBTaG93RWRpdFNlc3Npb25WaWV3IGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmVkaXRTZXNzaW9ucy5hY3Rpb25zLnNob3dFZGl0U2Vzc2lvbnMnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Nob3cgY2xvdWQgY2hhbmdlcycsICdTaG93IENsb3VkIENoYW5nZXMnKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogRURJVF9TRVNTSU9OX1NZTkNfQ0FURUdPUlksXG5cdFx0XHRcdFx0ZjE6IHRydWVcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcikge1xuXHRcdFx0XHR0aGF0LnNob3VsZFNob3dWaWV3c0NvbnRleHQuc2V0KHRydWUpO1xuXHRcdFx0XHRjb25zdCB2aWV3c1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVZpZXdzU2VydmljZSk7XG5cdFx0XHRcdGF3YWl0IHZpZXdzU2VydmljZS5vcGVuVmlldyhFRElUX1NFU1NJT05TX0RBVEFfVklFV19JRCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNvbnRpbnVlRWRpdFNlc3Npb25BY3Rpb24oKSB7XG5cdFx0Y29uc3QgdGhhdCA9IHRoaXM7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENvbnRpbnVlRWRpdFNlc3Npb25BY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdGNvbnN0cnVjdG9yKCkge1xuXHRcdFx0XHRzdXBlcihjb250aW51ZVdvcmtpbmdPbkNvbW1hbmQpO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHdvcmtzcGFjZVVyaTogVVJJIHwgdW5kZWZpbmVkLCBkZXN0aW5hdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHR5cGUgQ29udGludWVPbkV2ZW50T3V0Y29tZSA9IHsgb3V0Y29tZTogc3RyaW5nOyBoYXNoZWRJZD86IHN0cmluZyB9O1xuXHRcdFx0XHR0eXBlIENvbnRpbnVlT25DbGFzc2lmaWNhdGlvbk91dGNvbWUgPSB7XG5cdFx0XHRcdFx0b3duZXI6ICdqb3ljZWVyaGwnOyBjb21tZW50OiAnUmVwb3J0aW5nIHRoZSBvdXRjb21lIG9mIGludm9raW5nIHRoZSBDb250aW51ZSBPbiBhY3Rpb24uJztcblx0XHRcdFx0XHRvdXRjb21lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG91dGNvbWUgb2YgaW52b2tpbmcgY29udGludWUgZWRpdCBzZXNzaW9uLicgfTtcblx0XHRcdFx0XHRoYXNoZWRJZD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaGFzaCBvZiB0aGUgc3RvcmVkIGVkaXQgc2Vzc2lvbiBpZCwgZm9yIGNvcnJlbGF0aW5nIHN1Y2Nlc3Mgb2Ygc3RvcmVzIGFuZCByZXN1bWVzLicgfTtcblx0XHRcdFx0fTtcblxuXHRcdFx0XHQvLyBGaXJzdCBhc2sgdGhlIHVzZXIgdG8gcGljayBhIGRlc3RpbmF0aW9uLCBpZiBuZWNlc3Nhcnlcblx0XHRcdFx0bGV0IHVyaTogVVJJIHwgJ25vRGVzdGluYXRpb25VcmknIHwgdW5kZWZpbmVkID0gd29ya3NwYWNlVXJpO1xuXHRcdFx0XHRpZiAoIWRlc3RpbmF0aW9uICYmICF1cmkpIHtcblx0XHRcdFx0XHRkZXN0aW5hdGlvbiA9IGF3YWl0IHRoYXQucGlja0NvbnRpbnVlRWRpdFNlc3Npb25EZXN0aW5hdGlvbigpO1xuXHRcdFx0XHRcdGlmICghZGVzdGluYXRpb24pIHtcblx0XHRcdFx0XHRcdHRoYXQudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENvbnRpbnVlT25FdmVudE91dGNvbWUsIENvbnRpbnVlT25DbGFzc2lmaWNhdGlvbk91dGNvbWU+KCdjb250aW51ZU9uLmVkaXRTZXNzaW9ucy5waWNrLm91dGNvbWUnLCB7IG91dGNvbWU6ICdub1NlbGVjdGlvbicgfSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gRGV0ZXJtaW5lIGlmIHdlIG5lZWQgdG8gc3RvcmUgYW4gZWRpdCBzZXNzaW9uLCBhc2tpbmcgZm9yIGVkaXQgc2Vzc2lvbiBhdXRoIGlmIG5lY2Vzc2FyeVxuXHRcdFx0XHRjb25zdCBzaG91bGRTdG9yZUVkaXRTZXNzaW9uID0gYXdhaXQgdGhhdC5zaG91bGRDb250aW51ZU9uV2l0aEVkaXRTZXNzaW9uKCk7XG5cblx0XHRcdFx0Ly8gUnVuIHRoZSBzdG9yZSBhY3Rpb24gdG8gZ2V0IGJhY2sgYSByZWZcblx0XHRcdFx0bGV0IHJlZjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoc2hvdWxkU3RvcmVFZGl0U2Vzc2lvbikge1xuXHRcdFx0XHRcdHR5cGUgQ29udGludWVXaXRoRWRpdFNlc3Npb25FdmVudCA9IHt9O1xuXHRcdFx0XHRcdHR5cGUgQ29udGludWVXaXRoRWRpdFNlc3Npb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRcdG93bmVyOiAnam95Y2VlcmhsJzsgY29tbWVudDogJ1JlcG9ydGluZyB3aGVuIHN0b3JpbmcgYW4gZWRpdCBzZXNzaW9uIGFzIHBhcnQgb2YgdGhlIENvbnRpbnVlIE9uIGZsb3cuJztcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdHRoYXQudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENvbnRpbnVlV2l0aEVkaXRTZXNzaW9uRXZlbnQsIENvbnRpbnVlV2l0aEVkaXRTZXNzaW9uQ2xhc3NpZmljYXRpb24+KCdjb250aW51ZU9uLmVkaXRTZXNzaW9ucy5zdG9yZScpO1xuXG5cdFx0XHRcdFx0Y29uc3QgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0cmVmID0gYXdhaXQgdGhhdC5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdFx0XHRcdFx0bG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRcdFx0XHRjYW5jZWxsYWJsZTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N5bmNpbmcnLFxuXHRcdFx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ3N0b3JlIHlvdXIgd29ya2luZyBjaGFuZ2VzJywgJ1N0b3JpbmcgeW91ciB3b3JraW5nIGNoYW5nZXMuLi4nKVxuXHRcdFx0XHRcdFx0fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0XHRjb25zdCByZWYgPSBhd2FpdCB0aGF0LnN0b3JlRWRpdFNlc3Npb24oZmFsc2UsIGNhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuKTtcblx0XHRcdFx0XHRcdFx0aWYgKHJlZiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhhdC50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q29udGludWVPbkV2ZW50T3V0Y29tZSwgQ29udGludWVPbkNsYXNzaWZpY2F0aW9uT3V0Y29tZT4oJ2NvbnRpbnVlT24uZWRpdFNlc3Npb25zLnN0b3JlLm91dGNvbWUnLCB7IG91dGNvbWU6ICdzdG9yZVN1Y2NlZWRlZCcsIGhhc2hlZElkOiBoYXNoZWRFZGl0U2Vzc2lvbklkKHJlZikgfSk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhhdC50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q29udGludWVPbkV2ZW50T3V0Y29tZSwgQ29udGludWVPbkNsYXNzaWZpY2F0aW9uT3V0Y29tZT4oJ2NvbnRpbnVlT24uZWRpdFNlc3Npb25zLnN0b3JlLm91dGNvbWUnLCB7IG91dGNvbWU6ICdzdG9yZVNraXBwZWQnIH0pO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiByZWY7XG5cdFx0XHRcdFx0XHR9LCAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdGNhbmNlbGxhdGlvblRva2VuU291cmNlLmNhbmNlbCgpO1xuXHRcdFx0XHRcdFx0XHRjYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdHRoYXQudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENvbnRpbnVlT25FdmVudE91dGNvbWUsIENvbnRpbnVlT25DbGFzc2lmaWNhdGlvbk91dGNvbWU+KCdjb250aW51ZU9uLmVkaXRTZXNzaW9ucy5zdG9yZS5vdXRjb21lJywgeyBvdXRjb21lOiAnc3RvcmVDYW5jZWxsZWRCeVVzZXInIH0pO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXgpIHtcblx0XHRcdFx0XHRcdHRoYXQudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPENvbnRpbnVlT25FdmVudE91dGNvbWUsIENvbnRpbnVlT25DbGFzc2lmaWNhdGlvbk91dGNvbWU+KCdjb250aW51ZU9uLmVkaXRTZXNzaW9ucy5zdG9yZS5vdXRjb21lJywgeyBvdXRjb21lOiAnc3RvcmVGYWlsZWQnIH0pO1xuXHRcdFx0XHRcdFx0dGhyb3cgZXg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQXBwZW5kIHRoZSByZWYgdG8gdGhlIFVSSVxuXHRcdFx0XHR1cmkgPSBkZXN0aW5hdGlvbiA/IGF3YWl0IHRoYXQucmVzb2x2ZURlc3RpbmF0aW9uKGRlc3RpbmF0aW9uKSA6IHVyaTtcblx0XHRcdFx0aWYgKHVyaSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKHJlZiAhPT0gdW5kZWZpbmVkICYmIHVyaSAhPT0gJ25vRGVzdGluYXRpb25VcmknKSB7XG5cdFx0XHRcdFx0Y29uc3QgZW5jb2RlZFJlZiA9IGVuY29kZVVSSUNvbXBvbmVudChyZWYpO1xuXHRcdFx0XHRcdHVyaSA9IHVyaS53aXRoKHtcblx0XHRcdFx0XHRcdHF1ZXJ5OiB1cmkucXVlcnkubGVuZ3RoID4gMCA/ICh1cmkucXVlcnkgKyBgJiR7cXVlcnlQYXJhbU5hbWV9PSR7ZW5jb2RlZFJlZn0mY29udGludWVPbj0xYCkgOiBgJHtxdWVyeVBhcmFtTmFtZX09JHtlbmNvZGVkUmVmfSZjb250aW51ZU9uPTFgXG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHQvLyBPcGVuIHRoZSBVUklcblx0XHRcdFx0XHR0aGF0LmxvZ1NlcnZpY2UuaW5mbyhgT3BlbmluZyAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdFx0XHRcdGF3YWl0IHRoYXQub3BlbmVyU2VydmljZS5vcGVuKHVyaSwgeyBvcGVuRXh0ZXJuYWw6IHRydWUgfSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoKCFzaG91bGRTdG9yZUVkaXRTZXNzaW9uIHx8IHJlZiA9PT0gdW5kZWZpbmVkKSAmJiB1cmkgIT09ICdub0Rlc3RpbmF0aW9uVXJpJykge1xuXHRcdFx0XHRcdC8vIE9wZW4gdGhlIFVSSSB3aXRob3V0IGFuIGVkaXQgc2Vzc2lvbiByZWZcblx0XHRcdFx0XHR0aGF0LmxvZ1NlcnZpY2UuaW5mbyhgT3BlbmluZyAke3VyaS50b1N0cmluZygpfWApO1xuXHRcdFx0XHRcdGF3YWl0IHRoYXQub3BlbmVyU2VydmljZS5vcGVuKHVyaSwgeyBvcGVuRXh0ZXJuYWw6IHRydWUgfSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocmVmID09PSB1bmRlZmluZWQgJiYgc2hvdWxkU3RvcmVFZGl0U2Vzc2lvbikge1xuXHRcdFx0XHRcdHRoYXQubG9nU2VydmljZS53YXJuKGBGYWlsZWQgdG8gc3RvcmUgd29ya2luZyBjaGFuZ2VzIHdoZW4gaW52b2tpbmcgJHtjb250aW51ZVdvcmtpbmdPbkNvbW1hbmQuaWR9LmApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlclJlc3VtZUxhdGVzdEVkaXRTZXNzaW9uQWN0aW9uKCk6IHZvaWQge1xuXHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlZ2lzdGVyQWN0aW9uMihjbGFzcyBSZXN1bWVMYXRlc3RFZGl0U2Vzc2lvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5lZGl0U2Vzc2lvbnMuYWN0aW9ucy5yZXN1bWVMYXRlc3QnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Jlc3VtZSBsYXRlc3QgY2xvdWQgY2hhbmdlcycsICdSZXN1bWUgTGF0ZXN0IENoYW5nZXMgZnJvbSBDbG91ZCcpLFxuXHRcdFx0XHRcdGNhdGVnb3J5OiBFRElUX1NFU1NJT05fU1lOQ19DQVRFR09SWSxcblx0XHRcdFx0XHRmMTogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgZWRpdFNlc3Npb25JZD86IHN0cmluZywgZm9yY2VBcHBseVVucmVsYXRlZENoYW5nZT86IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0YXdhaXQgdGhhdC5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgLi4ucmVzdW1lUHJvZ3Jlc3NPcHRpb25zLCB0aXRsZTogcmVzdW1lUHJvZ3Jlc3NPcHRpb25zVGl0bGUgfSwgYXN5bmMgKCkgPT4gYXdhaXQgdGhhdC5yZXN1bWVFZGl0U2Vzc2lvbihlZGl0U2Vzc2lvbklkLCB1bmRlZmluZWQsIGZvcmNlQXBwbHlVbnJlbGF0ZWRDaGFuZ2UpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFJlc3VtZUxhdGVzdEVkaXRTZXNzaW9uQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIoe1xuXHRcdFx0XHRcdGlkOiAnd29ya2JlbmNoLmVkaXRTZXNzaW9ucy5hY3Rpb25zLnJlc3VtZUZyb21TZXJpYWxpemVkUGF5bG9hZCcsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMigncmVzdW1lIGNsb3VkIGNoYW5nZXMnLCAnUmVzdW1lIENoYW5nZXMgZnJvbSBTZXJpYWxpemVkIERhdGEnKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogJ0RldmVsb3BlcicsXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGVkaXRTZXNzaW9uSWQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3QgZGF0YSA9IGF3YWl0IHRoYXQucXVpY2tJbnB1dFNlcnZpY2UuaW5wdXQoeyBwcm9tcHQ6ICdFbnRlciBzZXJpYWxpemVkIGRhdGEnIH0pO1xuXHRcdFx0XHRpZiAoZGF0YSkge1xuXHRcdFx0XHRcdHRoYXQuZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UubGFzdFJlYWRSZXNvdXJjZXMuc2V0KCdlZGl0U2Vzc2lvbnMnLCB7IGNvbnRlbnQ6IGRhdGEsIHJlZjogJycgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGhhdC5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgLi4ucmVzdW1lUHJvZ3Jlc3NPcHRpb25zLCB0aXRsZTogcmVzdW1lUHJvZ3Jlc3NPcHRpb25zVGl0bGUgfSwgYXN5bmMgKCkgPT4gYXdhaXQgdGhhdC5yZXN1bWVFZGl0U2Vzc2lvbihlZGl0U2Vzc2lvbklkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGRhdGEpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyU3RvcmVMYXRlc3RFZGl0U2Vzc2lvbkFjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgU3RvcmVMYXRlc3RFZGl0U2Vzc2lvbkFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKHtcblx0XHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5lZGl0U2Vzc2lvbnMuYWN0aW9ucy5zdG9yZUN1cnJlbnQnLFxuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3N0b3JlIHdvcmtpbmcgY2hhbmdlcyBpbiBjbG91ZCcsICdTdG9yZSBXb3JraW5nIENoYW5nZXMgaW4gQ2xvdWQnKSxcblx0XHRcdFx0XHRjYXRlZ29yeTogRURJVF9TRVNTSU9OX1NZTkNfQ0FURUdPUlksXG5cdFx0XHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0Y29uc3QgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRcdFx0YXdhaXQgdGhhdC5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdFx0XHRsb2NhdGlvbjogUHJvZ3Jlc3NMb2NhdGlvbi5Ob3RpZmljYXRpb24sXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdzdG9yaW5nIHdvcmtpbmcgY2hhbmdlcycsICdTdG9yaW5nIHdvcmtpbmcgY2hhbmdlcy4uLicpXG5cdFx0XHRcdH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0eXBlIFN0b3JlRXZlbnQgPSB7fTtcblx0XHRcdFx0XHR0eXBlIFN0b3JlQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdFx0XHRvd25lcjogJ2pveWNlZXJobCc7IGNvbW1lbnQ6ICdSZXBvcnRpbmcgd2hlbiB0aGUgc3RvcmUgZWRpdCBzZXNzaW9uIGFjdGlvbiBpcyBpbnZva2VkLic7XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR0aGF0LnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxTdG9yZUV2ZW50LCBTdG9yZUNsYXNzaWZpY2F0aW9uPignZWRpdFNlc3Npb25zLnN0b3JlJyk7XG5cblx0XHRcdFx0XHRhd2FpdCB0aGF0LnN0b3JlRWRpdFNlc3Npb24odHJ1ZSwgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW4pO1xuXHRcdFx0XHR9LCAoKSA9PiB7XG5cdFx0XHRcdFx0Y2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UuY2FuY2VsKCk7XG5cdFx0XHRcdFx0Y2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UuZGlzcG9zZSgpO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyByZXN1bWVFZGl0U2Vzc2lvbihyZWY/OiBzdHJpbmcsIHNpbGVudD86IGJvb2xlYW4sIGZvcmNlQXBwbHlVbnJlbGF0ZWRDaGFuZ2U/OiBib29sZWFuLCBhcHBseVBhcnRpYWxNYXRjaD86IGJvb2xlYW4sIHByb2dyZXNzPzogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+LCBzZXJpYWxpemVkRGF0YT86IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFdhaXQgZm9yIHRoZSByZW1vdGUgZW52aXJvbm1lbnQgdG8gYmVjb21lIGF2YWlsYWJsZSwgaWYgYW55XG5cdFx0YXdhaXQgdGhpcy5yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKTtcblxuXHRcdC8vIEVkaXQgc2Vzc2lvbnMgYXJlIG5vdCBjdXJyZW50bHkgc3VwcG9ydGVkIGluIGVtcHR5IHdvcmtzcGFjZXNcblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTU5MjIwXG5cdFx0aWYgKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhyZWYgIT09IHVuZGVmaW5lZCA/IGBSZXN1bWluZyBjaGFuZ2VzIGZyb20gY2xvdWQgd2l0aCByZWYgJHtyZWZ9Li4uYCA6ICdDaGVja2luZyBmb3IgcGVuZGluZyBjbG91ZCBjaGFuZ2VzLi4uJyk7XG5cblx0XHRpZiAoc2lsZW50ICYmICEoYXdhaXQgdGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS5pbml0aWFsaXplKCdyZWFkJywgdHJ1ZSkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHlwZSBSZXN1bWVFdmVudCA9IHsgb3V0Y29tZTogc3RyaW5nOyBoYXNoZWRJZD86IHN0cmluZyB9O1xuXHRcdHR5cGUgUmVzdW1lQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2pveWNlZXJobCc7IGNvbW1lbnQ6ICdSZXBvcnRpbmcgd2hlbiBhbiBlZGl0IHNlc3Npb24gaXMgcmVzdW1lZCBmcm9tIGFuIGVkaXQgc2Vzc2lvbiBpZGVudGlmaWVyLic7XG5cdFx0XHRvdXRjb21lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG91dGNvbWUgb2YgcmVzdW1pbmcgdGhlIGVkaXQgc2Vzc2lvbi4nIH07XG5cdFx0XHRoYXNoZWRJZD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgaGFzaCBvZiB0aGUgc3RvcmVkIGVkaXQgc2Vzc2lvbiBpZCwgZm9yIGNvcnJlbGF0aW5nIHN1Y2Nlc3Mgb2Ygc3RvcmVzIGFuZCByZXN1bWVzLicgfTtcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFJlc3VtZUV2ZW50LCBSZXN1bWVDbGFzc2lmaWNhdGlvbj4oJ2VkaXRTZXNzaW9ucy5yZXN1bWUnKTtcblxuXHRcdHBlcmZvcm1hbmNlLm1hcmsoJ2NvZGUvd2lsbFJlc3VtZUVkaXRTZXNzaW9uRnJvbUlkZW50aWZpZXInKTtcblxuXHRcdHByb2dyZXNzPy5yZXBvcnQoeyBtZXNzYWdlOiBsb2NhbGl6ZSgnY2hlY2tpbmdGb3JXb3JraW5nQ2hhbmdlcycsICdDaGVja2luZyBmb3IgcGVuZGluZyBjbG91ZCBjaGFuZ2VzLi4uJykgfSk7XG5cdFx0Y29uc3QgZGF0YSA9IHNlcmlhbGl6ZWREYXRhID8geyBjb250ZW50OiBzZXJpYWxpemVkRGF0YSwgcmVmOiAnJyB9IDogYXdhaXQgdGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS5yZWFkKCdlZGl0U2Vzc2lvbnMnLCByZWYpO1xuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0aWYgKHJlZiA9PT0gdW5kZWZpbmVkICYmICFzaWxlbnQpIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmluZm8obG9jYWxpemUoJ25vIGNsb3VkIGNoYW5nZXMnLCAnVGhlcmUgYXJlIG5vIGNoYW5nZXMgdG8gcmVzdW1lIGZyb20gdGhlIGNsb3VkLicpKTtcblx0XHRcdH0gZWxzZSBpZiAocmVmICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLndhcm4obG9jYWxpemUoJ25vIGNsb3VkIGNoYW5nZXMgZm9yIHJlZicsICdDb3VsZCBub3QgcmVzdW1lIGNoYW5nZXMgZnJvbSB0aGUgY2xvdWQgZm9yIElEIHswfS4nLCByZWYpKTtcblx0XHRcdH1cblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKHJlZiAhPT0gdW5kZWZpbmVkID8gYEFib3J0aW5nIHJlc3VtaW5nIGNoYW5nZXMgZnJvbSBjbG91ZCBhcyBubyBlZGl0IHNlc3Npb24gY29udGVudCBpcyBhdmFpbGFibGUgdG8gYmUgYXBwbGllZCBmcm9tIHJlZiAke3JlZn0uYCA6IGBBYm9ydGluZyByZXN1bWluZyBlZGl0IHNlc3Npb24gYXMgbm8gZWRpdCBzZXNzaW9uIGNvbnRlbnQgaXMgYXZhaWxhYmxlIHRvIGJlIGFwcGxpZWRgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRwcm9ncmVzcz8ucmVwb3J0KHsgbWVzc2FnZTogcmVzdW1lUHJvZ3Jlc3NPcHRpb25zVGl0bGUgfSk7XG5cdFx0Y29uc3QgZWRpdFNlc3Npb24gPSBKU09OLnBhcnNlKGRhdGEuY29udGVudCk7XG5cdFx0cmVmID0gZGF0YS5yZWY7XG5cblx0XHRpZiAoZWRpdFNlc3Npb24udmVyc2lvbiA+IEVkaXRTZXNzaW9uU2NoZW1hVmVyc2lvbikge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGxvY2FsaXplKCdjbGllbnQgdG9vIG9sZCcsIFwiUGxlYXNlIHVwZ3JhZGUgdG8gYSBuZXdlciB2ZXJzaW9uIG9mIHswfSB0byByZXN1bWUgeW91ciB3b3JraW5nIGNoYW5nZXMgZnJvbSB0aGUgY2xvdWQuXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpKTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFJlc3VtZUV2ZW50LCBSZXN1bWVDbGFzc2lmaWNhdGlvbj4oJ2VkaXRTZXNzaW9ucy5yZXN1bWUub3V0Y29tZScsIHsgaGFzaGVkSWQ6IGhhc2hlZEVkaXRTZXNzaW9uSWQocmVmKSwgb3V0Y29tZTogJ2NsaWVudFVwZGF0ZU5lZWRlZCcgfSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHsgY2hhbmdlcywgY29uZmxpY3RpbmdDaGFuZ2VzIH0gPSBhd2FpdCB0aGlzLmdlbmVyYXRlQ2hhbmdlcyhlZGl0U2Vzc2lvbiwgcmVmLCBmb3JjZUFwcGx5VW5yZWxhdGVkQ2hhbmdlLCBhcHBseVBhcnRpYWxNYXRjaCk7XG5cdFx0XHRpZiAoY2hhbmdlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUT0RPQGpveWNlZXJobCBQcm92aWRlIHRoZSBvcHRpb24gdG8gZGlmZiBmaWxlcyB3aGljaCB3b3VsZCBiZSBvdmVyd3JpdHRlbiBieSBlZGl0IHNlc3Npb24gY29udGVudHNcblx0XHRcdGlmIChjb25mbGljdGluZ0NoYW5nZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHQvLyBBbGxvdyB0byBzaG93IGVkaXQgc2Vzc2lvbnNcblxuXHRcdFx0XHRjb25zdCB7IGNvbmZpcm1lZCB9ID0gYXdhaXQgdGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oe1xuXHRcdFx0XHRcdHR5cGU6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdFx0bWVzc2FnZTogY29uZmxpY3RpbmdDaGFuZ2VzLmxlbmd0aCA+IDEgP1xuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ3Jlc3VtZSBlZGl0IHNlc3Npb24gd2FybmluZyBtYW55JywgJ1Jlc3VtaW5nIHlvdXIgd29ya2luZyBjaGFuZ2VzIGZyb20gdGhlIGNsb3VkIHdpbGwgb3ZlcndyaXRlIHRoZSBmb2xsb3dpbmcgezB9IGZpbGVzLiBEbyB5b3Ugd2FudCB0byBwcm9jZWVkPycsIGNvbmZsaWN0aW5nQ2hhbmdlcy5sZW5ndGgpIDpcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdyZXN1bWUgZWRpdCBzZXNzaW9uIHdhcm5pbmcgMScsICdSZXN1bWluZyB5b3VyIHdvcmtpbmcgY2hhbmdlcyBmcm9tIHRoZSBjbG91ZCB3aWxsIG92ZXJ3cml0ZSB7MH0uIERvIHlvdSB3YW50IHRvIHByb2NlZWQ/JywgYmFzZW5hbWUoY29uZmxpY3RpbmdDaGFuZ2VzWzBdLnVyaSkpLFxuXHRcdFx0XHRcdGRldGFpbDogY29uZmxpY3RpbmdDaGFuZ2VzLmxlbmd0aCA+IDEgPyBnZXRGaWxlTmFtZXNNZXNzYWdlKGNvbmZsaWN0aW5nQ2hhbmdlcy5tYXAoKGMpID0+IGMudXJpKSkgOiB1bmRlZmluZWRcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCB7IHVyaSwgdHlwZSwgY29udGVudHMgfSBvZiBjaGFuZ2VzKSB7XG5cdFx0XHRcdGlmICh0eXBlID09PSBDaGFuZ2VUeXBlLkFkZGl0aW9uKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5maWxlU2VydmljZS53cml0ZUZpbGUodXJpLCBkZWNvZGVFZGl0U2Vzc2lvbkZpbGVDb250ZW50KGVkaXRTZXNzaW9uLnZlcnNpb24sIGNvbnRlbnRzISkpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHR5cGUgPT09IENoYW5nZVR5cGUuRGVsZXRpb24gJiYgYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHModXJpKSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHVyaSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VTdGF0ZVN5bmNocm9uaXplcj8uYXBwbHkoKTtcblxuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYERlbGV0aW5nIGVkaXQgc2Vzc2lvbiB3aXRoIHJlZiAke3JlZn0gYWZ0ZXIgc3VjY2Vzc2Z1bGx5IGFwcGx5aW5nIGl0IHRvIGN1cnJlbnQgd29ya3NwYWNlLi4uYCk7XG5cdFx0XHRhd2FpdCB0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLmRlbGV0ZSgnZWRpdFNlc3Npb25zJywgcmVmKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBEZWxldGVkIGVkaXQgc2Vzc2lvbiB3aXRoIHJlZiAke3JlZn0uYCk7XG5cblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFJlc3VtZUV2ZW50LCBSZXN1bWVDbGFzc2lmaWNhdGlvbj4oJ2VkaXRTZXNzaW9ucy5yZXN1bWUub3V0Y29tZScsIHsgaGFzaGVkSWQ6IGhhc2hlZEVkaXRTZXNzaW9uSWQocmVmKSwgb3V0Y29tZTogJ3Jlc3VtZVN1Y2NlZWRlZCcgfSk7XG5cdFx0fSBjYXRjaCAoZXgpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignRmFpbGVkIHRvIHJlc3VtZSBlZGl0IHNlc3Npb24sIHJlYXNvbjogJywgKGV4IGFzIEVycm9yKS50b1N0cmluZygpKTtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgncmVzdW1lIGZhaWxlZCcsIFwiRmFpbGVkIHRvIHJlc3VtZSB5b3VyIHdvcmtpbmcgY2hhbmdlcyBmcm9tIHRoZSBjbG91ZC5cIikpO1xuXHRcdH1cblxuXHRcdHBlcmZvcm1hbmNlLm1hcmsoJ2NvZGUvZGlkUmVzdW1lRWRpdFNlc3Npb25Gcm9tSWRlbnRpZmllcicpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZW5lcmF0ZUNoYW5nZXMoZWRpdFNlc3Npb246IEVkaXRTZXNzaW9uLCByZWY6IHN0cmluZywgZm9yY2VBcHBseVVucmVsYXRlZENoYW5nZSA9IGZhbHNlLCBhcHBseVBhcnRpYWxNYXRjaCA9IGZhbHNlKSB7XG5cdFx0Y29uc3QgY2hhbmdlczogKHsgdXJpOiBVUkk7IHR5cGU6IENoYW5nZVR5cGU7IGNvbnRlbnRzOiBzdHJpbmcgfCB1bmRlZmluZWQgfSlbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbmZsaWN0aW5nQ2hhbmdlcyA9IFtdO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlcnMgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0Y29uc3QgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdGZvciAoY29uc3QgZm9sZGVyIG9mIGVkaXRTZXNzaW9uLmZvbGRlcnMpIHtcblx0XHRcdGxldCBmb2xkZXJSb290OiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAoZm9sZGVyLmNhbm9uaWNhbElkZW50aXR5KSB7XG5cdFx0XHRcdC8vIExvb2sgZm9yIGFuIGVkaXQgc2Vzc2lvbiBpZGVudGlmaWVyIHRoYXQgd2UgY2FuIHVzZVxuXHRcdFx0XHRmb3IgKGNvbnN0IGYgb2Ygd29ya3NwYWNlRm9sZGVycykge1xuXHRcdFx0XHRcdGNvbnN0IGlkZW50aXR5ID0gYXdhaXQgdGhpcy5lZGl0U2Vzc2lvbklkZW50aXR5U2VydmljZS5nZXRFZGl0U2Vzc2lvbklkZW50aWZpZXIoZiwgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UudG9rZW4pO1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBNYXRjaGluZyBpZGVudGl0eSAke2lkZW50aXR5fSBhZ2FpbnN0IGVkaXQgc2Vzc2lvbiBmb2xkZXIgaWRlbnRpdHkgJHtmb2xkZXIuY2Fub25pY2FsSWRlbnRpdHl9Li4uYCk7XG5cblx0XHRcdFx0XHRpZiAoZXF1YWxzKGlkZW50aXR5LCBmb2xkZXIuY2Fub25pY2FsSWRlbnRpdHkpIHx8IGZvcmNlQXBwbHlVbnJlbGF0ZWRDaGFuZ2UpIHtcblx0XHRcdFx0XHRcdGZvbGRlclJvb3QgPSBmO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGlkZW50aXR5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1hdGNoID0gYXdhaXQgdGhpcy5lZGl0U2Vzc2lvbklkZW50aXR5U2VydmljZS5wcm92aWRlRWRpdFNlc3Npb25JZGVudGl0eU1hdGNoKGYsIGlkZW50aXR5LCBmb2xkZXIuY2Fub25pY2FsSWRlbnRpdHksIGNhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuKTtcblx0XHRcdFx0XHRcdGlmIChtYXRjaCA9PT0gRWRpdFNlc3Npb25JZGVudGl0eU1hdGNoLkNvbXBsZXRlKSB7XG5cdFx0XHRcdFx0XHRcdGZvbGRlclJvb3QgPSBmO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAobWF0Y2ggPT09IEVkaXRTZXNzaW9uSWRlbnRpdHlNYXRjaC5QYXJ0aWFsICYmXG5cdFx0XHRcdFx0XHRcdHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3dvcmtiZW5jaC5leHBlcmltZW50YWwuY2xvdWRDaGFuZ2VzLnBhcnRpYWxNYXRjaGVzLmVuYWJsZWQnKSA9PT0gdHJ1ZVxuXHRcdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRcdGlmICghYXBwbHlQYXJ0aWFsTWF0Y2gpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBTdXJmYWNlIHBhcnRpYWxseSBtYXRjaGluZyBlZGl0IHNlc3Npb25cblx0XHRcdFx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0XHRcdFx0XHRcdFx0U2V2ZXJpdHkuSW5mbyxcblx0XHRcdFx0XHRcdFx0XHRcdGxvY2FsaXplKCdlZGl0U2Vzc2lvblBhcnRpYWxNYXRjaCcsICdZb3UgaGF2ZSBwZW5kaW5nIHdvcmtpbmcgY2hhbmdlcyBpbiB0aGUgY2xvdWQgZm9yIHRoaXMgd29ya3NwYWNlLiBXb3VsZCB5b3UgbGlrZSB0byByZXN1bWUgdGhlbT8nKSxcblx0XHRcdFx0XHRcdFx0XHRcdFt7IGxhYmVsOiBsb2NhbGl6ZSgncmVzdW1lJywgJ1Jlc3VtZScpLCBydW46ICgpID0+IHRoaXMucmVzdW1lRWRpdFNlc3Npb24ocmVmLCBmYWxzZSwgdW5kZWZpbmVkLCB0cnVlKSB9XVxuXHRcdFx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0Zm9sZGVyUm9vdCA9IGY7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGZvbGRlclJvb3QgPSB3b3Jrc3BhY2VGb2xkZXJzLmZpbmQoKGYpID0+IGYubmFtZSA9PT0gZm9sZGVyLm5hbWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWZvbGRlclJvb3QpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFNraXBwaW5nIGFwcGx5aW5nICR7Zm9sZGVyLndvcmtpbmdDaGFuZ2VzLmxlbmd0aH0gY2hhbmdlcyBmcm9tIGVkaXQgc2Vzc2lvbiB3aXRoIHJlZiAke3JlZn0gYXMgbm8gbWF0Y2hpbmcgd29ya3NwYWNlIGZvbGRlciB3YXMgZm91bmQuYCk7XG5cdFx0XHRcdHJldHVybiB7IGNoYW5nZXM6IFtdLCBjb25mbGljdGluZ0NoYW5nZXM6IFtdLCBjb250cmlidXRlZFN0YXRlSGFuZGxlcnM6IFtdIH07XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxvY2FsQ2hhbmdlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdFx0Zm9yIChjb25zdCByZXBvc2l0b3J5IG9mIHRoaXMuc2NtU2VydmljZS5yZXBvc2l0b3JpZXMpIHtcblx0XHRcdFx0aWYgKHJlcG9zaXRvcnkucHJvdmlkZXIucm9vdFVyaSAhPT0gdW5kZWZpbmVkICYmXG5cdFx0XHRcdFx0dGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIocmVwb3NpdG9yeS5wcm92aWRlci5yb290VXJpKT8ubmFtZSA9PT0gZm9sZGVyLm5hbWVcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVwb3NpdG9yeUNoYW5nZXMgPSB0aGlzLmdldENoYW5nZWRSZXNvdXJjZXMocmVwb3NpdG9yeSk7XG5cdFx0XHRcdFx0cmVwb3NpdG9yeUNoYW5nZXMuZm9yRWFjaCgoY2hhbmdlKSA9PiBsb2NhbENoYW5nZXMuYWRkKGNoYW5nZS50b1N0cmluZygpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgZm9sZGVyLndvcmtpbmdDaGFuZ2VzKSB7XG5cdFx0XHRcdGNvbnN0IHVyaSA9IGpvaW5QYXRoKGZvbGRlclJvb3QudXJpLCBjaGFuZ2UucmVsYXRpdmVGaWxlUGF0aCk7XG5cdFx0XHRcdGlmICghdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWxPclBhcmVudCh1cmksIGZvbGRlclJvb3QudXJpKSB8fCB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbCh1cmksIGZvbGRlclJvb3QudXJpKSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBTa2lwcGluZyBjaGFuZ2Ugb3V0c2lkZSB3b3Jrc3BhY2UgZm9sZGVyOiAke2NoYW5nZS5yZWxhdGl2ZUZpbGVQYXRofWApO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y2hhbmdlcy5wdXNoKHsgdXJpLCB0eXBlOiBjaGFuZ2UudHlwZSwgY29udGVudHM6IGNoYW5nZS5jb250ZW50cyB9KTtcblx0XHRcdFx0aWYgKGF3YWl0IHRoaXMud2lsbENoYW5nZUxvY2FsQ29udGVudHMobG9jYWxDaGFuZ2VzLCB1cmksIGNoYW5nZSkpIHtcblx0XHRcdFx0XHRjb25mbGljdGluZ0NoYW5nZXMucHVzaCh7IHVyaSwgdHlwZTogY2hhbmdlLnR5cGUsIGNvbnRlbnRzOiBjaGFuZ2UuY29udGVudHMgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBjaGFuZ2VzLCBjb25mbGljdGluZ0NoYW5nZXMgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgd2lsbENoYW5nZUxvY2FsQ29udGVudHMobG9jYWxDaGFuZ2VzOiBTZXQ8c3RyaW5nPiwgdXJpV2l0aEluY29taW5nQ2hhbmdlczogVVJJLCBpbmNvbWluZ0NoYW5nZTogQ2hhbmdlKSB7XG5cdFx0aWYgKCFsb2NhbENoYW5nZXMuaGFzKHVyaVdpdGhJbmNvbWluZ0NoYW5nZXMudG9TdHJpbmcoKSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCB7IGNvbnRlbnRzLCB0eXBlIH0gPSBpbmNvbWluZ0NoYW5nZTtcblxuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSAoQ2hhbmdlVHlwZS5BZGRpdGlvbik6IHtcblx0XHRcdFx0Y29uc3QgW29yaWdpbmFsQ29udGVudHMsIGluY29taW5nQ29udGVudHNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdGhhc2hBc3luYyhjb250ZW50cyksXG5cdFx0XHRcdFx0aGFzaEFzeW5jKGVuY29kZUJhc2U2NCgoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh1cmlXaXRoSW5jb21pbmdDaGFuZ2VzKSkudmFsdWUpKVxuXHRcdFx0XHRdKTtcblx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsQ29udGVudHMgIT09IGluY29taW5nQ29udGVudHM7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIChDaGFuZ2VUeXBlLkRlbGV0aW9uKToge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHModXJpV2l0aEluY29taW5nQ2hhbmdlcyk7XG5cdFx0XHR9XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VuaGFuZGxlZCBjaGFuZ2UgdHlwZS4nKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBzdG9yZUVkaXRTZXNzaW9uKGZyb21TdG9yZUNvbW1hbmQ6IGJvb2xlYW4sIGNhbmNlbGxhdGlvblRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZm9sZGVyczogRm9sZGVyW10gPSBbXTtcblx0XHRsZXQgZWRpdFNlc3Npb25TaXplID0gMDtcblx0XHRsZXQgaGFzRWRpdHMgPSBmYWxzZTtcblxuXHRcdC8vIFNhdmUgYWxsIHNhdmVhYmxlIGVkaXRvcnMgYmVmb3JlIGJ1aWxkaW5nIGVkaXQgc2Vzc2lvbiBjb250ZW50c1xuXHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5zYXZlQWxsKCk7XG5cblx0XHQvLyBEbyBhIGZpcnN0IHBhc3Mgb3ZlciBhbGwgcmVwb3NpdG9yaWVzIHRvIGVuc3VyZSB0aGF0IHRoZSBlZGl0IHNlc3Npb24gaWRlbnRpdHkgaXMgY3JlYXRlZCBmb3IgZWFjaC5cblx0XHQvLyBUaGlzIG1heSBjaGFuZ2UgdGhlIHdvcmtpbmcgY2hhbmdlcyB0aGF0IG5lZWQgdG8gYmUgc3RvcmVkIGxhdGVyXG5cdFx0Y29uc3QgY3JlYXRlZEVkaXRTZXNzaW9uSWRlbnRpdGllcyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRcdGZvciAoY29uc3QgcmVwb3NpdG9yeSBvZiB0aGlzLnNjbVNlcnZpY2UucmVwb3NpdG9yaWVzKSB7XG5cdFx0XHRjb25zdCBjaGFuZ2VkUmVzb3VyY2VzID0gdGhpcy5nZXRDaGFuZ2VkUmVzb3VyY2VzKHJlcG9zaXRvcnkpO1xuXHRcdFx0aWYgKCFjaGFuZ2VkUmVzb3VyY2VzLnNpemUpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IHVyaSBvZiBjaGFuZ2VkUmVzb3VyY2VzKSB7XG5cdFx0XHRcdGNvbnN0IHdvcmtzcGFjZUZvbGRlciA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHVyaSk7XG5cdFx0XHRcdGlmICghd29ya3NwYWNlRm9sZGVyIHx8IGNyZWF0ZWRFZGl0U2Vzc2lvbklkZW50aXRpZXMuaGFzKHVyaSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjcmVhdGVkRWRpdFNlc3Npb25JZGVudGl0aWVzLmFkZCh1cmkpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmVkaXRTZXNzaW9uSWRlbnRpdHlTZXJ2aWNlLm9uV2lsbENyZWF0ZUVkaXRTZXNzaW9uSWRlbnRpdHkod29ya3NwYWNlRm9sZGVyLCBjYW5jZWxsYXRpb25Ub2tlbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCByZXBvc2l0b3J5IG9mIHRoaXMuc2NtU2VydmljZS5yZXBvc2l0b3JpZXMpIHtcblx0XHRcdC8vIExvb2sgdGhyb3VnaCBhbGwgcmVzb3VyY2UgZ3JvdXBzIGFuZCBjb21wdXRlIHdoaWNoIGZpbGVzIHdlcmUgYWRkZWQvbW9kaWZpZWQvZGVsZXRlZFxuXHRcdFx0Y29uc3QgdHJhY2tlZFVyaXMgPSB0aGlzLmdldENoYW5nZWRSZXNvdXJjZXMocmVwb3NpdG9yeSk7IC8vIEEgVVJJIG1pZ2h0IGFwcGVhciBpbiBtb3JlIHRoYW4gb25lIHJlc291cmNlIGdyb3VwXG5cblx0XHRcdGNvbnN0IHdvcmtpbmdDaGFuZ2VzOiBDaGFuZ2VbXSA9IFtdO1xuXG5cdFx0XHRjb25zdCB7IHJvb3RVcmkgfSA9IHJlcG9zaXRvcnkucHJvdmlkZXI7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSByb290VXJpID8gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIocm9vdFVyaSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgbmFtZSA9IHdvcmtzcGFjZUZvbGRlcj8ubmFtZTtcblxuXHRcdFx0Zm9yIChjb25zdCB1cmkgb2YgdHJhY2tlZFVyaXMpIHtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIodXJpKTtcblx0XHRcdFx0aWYgKCF3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgU2tpcHBpbmcgd29ya2luZyBjaGFuZ2UgJHt1cmkudG9TdHJpbmcoKX0gYXMgbm8gYXNzb2NpYXRlZCB3b3Jrc3BhY2UgZm9sZGVyIHdhcyBmb3VuZC5gKTtcblxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0bmFtZSA9IG5hbWUgPz8gd29ya3NwYWNlRm9sZGVyLm5hbWU7XG5cdFx0XHRcdGNvbnN0IHJlbGF0aXZlRmlsZVBhdGggPSByZWxhdGl2ZVBhdGgod29ya3NwYWNlRm9sZGVyLnVyaSwgdXJpKSA/PyB1cmkucGF0aDtcblxuXHRcdFx0XHQvLyBPbmx5IGRlYWwgd2l0aCBmaWxlIGNvbnRlbnRzIGZvciBub3dcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRpZiAoIShhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQodXJpKSkuaXNGaWxlKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gY2F0Y2ggeyB9XG5cblx0XHRcdFx0aGFzRWRpdHMgPSB0cnVlO1xuXG5cblx0XHRcdFx0aWYgKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKHVyaSkpIHtcblx0XHRcdFx0XHRjb25zdCBjb250ZW50cyA9IGVuY29kZUJhc2U2NCgoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZSh1cmkpKS52YWx1ZSk7XG5cdFx0XHRcdFx0ZWRpdFNlc3Npb25TaXplICs9IGNvbnRlbnRzLmxlbmd0aDtcblx0XHRcdFx0XHRpZiAoZWRpdFNlc3Npb25TaXplID4gdGhpcy5lZGl0U2Vzc2lvbnNTdG9yYWdlU2VydmljZS5TSVpFX0xJTUlUKSB7XG5cdFx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3BheWxvYWQgdG9vIGxhcmdlJywgJ1lvdXIgd29ya2luZyBjaGFuZ2VzIGV4Y2VlZCB0aGUgc2l6ZSBsaW1pdCBhbmQgY2Fubm90IGJlIHN0b3JlZC4nKSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHdvcmtpbmdDaGFuZ2VzLnB1c2goeyB0eXBlOiBDaGFuZ2VUeXBlLkFkZGl0aW9uLCBmaWxlVHlwZTogRmlsZVR5cGUuRmlsZSwgY29udGVudHM6IGNvbnRlbnRzLCByZWxhdGl2ZUZpbGVQYXRoOiByZWxhdGl2ZUZpbGVQYXRoIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIEFzc3VtZSBpdCdzIGEgZGVsZXRpb25cblx0XHRcdFx0XHR3b3JraW5nQ2hhbmdlcy5wdXNoKHsgdHlwZTogQ2hhbmdlVHlwZS5EZWxldGlvbiwgZmlsZVR5cGU6IEZpbGVUeXBlLkZpbGUsIGNvbnRlbnRzOiB1bmRlZmluZWQsIHJlbGF0aXZlRmlsZVBhdGg6IHJlbGF0aXZlRmlsZVBhdGggfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0bGV0IGNhbm9uaWNhbElkZW50aXR5ID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKHdvcmtzcGFjZUZvbGRlciAhPT0gbnVsbCAmJiB3b3Jrc3BhY2VGb2xkZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjYW5vbmljYWxJZGVudGl0eSA9IGF3YWl0IHRoaXMuZWRpdFNlc3Npb25JZGVudGl0eVNlcnZpY2UuZ2V0RWRpdFNlc3Npb25JZGVudGlmaWVyKHdvcmtzcGFjZUZvbGRlciwgY2FuY2VsbGF0aW9uVG9rZW4pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUT0RPQGpveWNlZXJobCBkZWJ0OiBkb24ndCBzdG9yZSB3b3JraW5nIGNoYW5nZXMgYXMgYSBjaGlsZCBvZiB0aGUgZm9sZGVyXG5cdFx0XHRmb2xkZXJzLnB1c2goeyB3b3JraW5nQ2hhbmdlcywgbmFtZTogbmFtZSA/PyAnJywgY2Fub25pY2FsSWRlbnRpdHk6IGNhbm9uaWNhbElkZW50aXR5ID8/IHVuZGVmaW5lZCwgYWJzb2x1dGVVcmk6IHdvcmtzcGFjZUZvbGRlcj8udXJpLnRvU3RyaW5nKCkgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gU3RvcmUgY29udHJpYnV0ZWQgd29ya3NwYWNlIHN0YXRlXG5cdFx0YXdhaXQgdGhpcy53b3Jrc3BhY2VTdGF0ZVN5bmNocm9uaXplcj8uc3luYygpO1xuXG5cdFx0aWYgKCFoYXNFZGl0cykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1NraXBwZWQgc3RvcmluZyB3b3JraW5nIGNoYW5nZXMgaW4gdGhlIGNsb3VkIGFzIHRoZXJlIGFyZSBubyBlZGl0cyB0byBzdG9yZS4nKTtcblx0XHRcdGlmIChmcm9tU3RvcmVDb21tYW5kKSB7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5pbmZvKGxvY2FsaXplKCdubyB3b3JraW5nIGNoYW5nZXMgdG8gc3RvcmUnLCAnU2tpcHBlZCBzdG9yaW5nIHdvcmtpbmcgY2hhbmdlcyBpbiB0aGUgY2xvdWQgYXMgdGhlcmUgYXJlIG5vIGVkaXRzIHRvIHN0b3JlLicpKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGF0YTogRWRpdFNlc3Npb24gPSB7IGZvbGRlcnMsIHZlcnNpb246IDIsIHdvcmtzcGFjZVN0YXRlSWQ6IHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UubGFzdFdyaXR0ZW5SZXNvdXJjZXMuZ2V0KCd3b3Jrc3BhY2VTdGF0ZScpPy5yZWYgfTtcblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgU3RvcmluZyBlZGl0IHNlc3Npb24uLi5gKTtcblx0XHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2Uud3JpdGUoJ2VkaXRTZXNzaW9ucycsIGRhdGEpO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFN0b3JlZCBlZGl0IHNlc3Npb24gd2l0aCByZWYgJHtyZWZ9LmApO1xuXHRcdFx0cmV0dXJuIHJlZjtcblx0XHR9IGNhdGNoIChleCkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBGYWlsZWQgdG8gc3RvcmUgZWRpdCBzZXNzaW9uLCByZWFzb246IGAsIChleCBhcyBFcnJvcikudG9TdHJpbmcoKSk7XG5cblx0XHRcdHR5cGUgVXBsb2FkRmFpbGVkRXZlbnQgPSB7IHJlYXNvbjogc3RyaW5nIH07XG5cdFx0XHR0eXBlIFVwbG9hZEZhaWxlZENsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRvd25lcjogJ2pveWNlZXJobCc7IGNvbW1lbnQ6ICdSZXBvcnRpbmcgd2hlbiBDb250aW51ZSBPbiBzZXJ2ZXIgcmVxdWVzdCBmYWlscy4nO1xuXHRcdFx0XHRyZWFzb24/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHJlYXNvbiB0aGF0IHRoZSBzZXJ2ZXIgcmVxdWVzdCBmYWlsZWQuJyB9O1xuXHRcdFx0fTtcblxuXHRcdFx0aWYgKGV4IGluc3RhbmNlb2YgVXNlckRhdGFTeW5jU3RvcmVFcnJvcikge1xuXHRcdFx0XHRzd2l0Y2ggKGV4LmNvZGUpIHtcblx0XHRcdFx0XHRjYXNlIFVzZXJEYXRhU3luY0Vycm9yQ29kZS5Ub29MYXJnZTpcblx0XHRcdFx0XHRcdC8vIFVwbG9hZGluZyBhIHBheWxvYWQgY2FuIGZhaWwgZHVlIHRvIHNlcnZlciBzaXplIGxpbWl0c1xuXHRcdFx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8VXBsb2FkRmFpbGVkRXZlbnQsIFVwbG9hZEZhaWxlZENsYXNzaWZpY2F0aW9uPignZWRpdFNlc3Npb25zLnVwbG9hZC5mYWlsZWQnLCB7IHJlYXNvbjogJ1Rvb0xhcmdlJyB9KTtcblx0XHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihsb2NhbGl6ZSgncGF5bG9hZCB0b28gbGFyZ2UnLCAnWW91ciB3b3JraW5nIGNoYW5nZXMgZXhjZWVkIHRoZSBzaXplIGxpbWl0IGFuZCBjYW5ub3QgYmUgc3RvcmVkLicpKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxVcGxvYWRGYWlsZWRFdmVudCwgVXBsb2FkRmFpbGVkQ2xhc3NpZmljYXRpb24+KCdlZGl0U2Vzc2lvbnMudXBsb2FkLmZhaWxlZCcsIHsgcmVhc29uOiAndW5rbm93bicgfSk7XG5cdFx0XHRcdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UuZXJyb3IobG9jYWxpemUoJ3BheWxvYWQgZmFpbGVkJywgJ1lvdXIgd29ya2luZyBjaGFuZ2VzIGNhbm5vdCBiZSBzdG9yZWQuJykpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDaGFuZ2VkUmVzb3VyY2VzKHJlcG9zaXRvcnk6IElTQ01SZXBvc2l0b3J5KSB7XG5cdFx0cmV0dXJuIHJlcG9zaXRvcnkucHJvdmlkZXIuZ3JvdXBzLnJlZHVjZSgocmVzb3VyY2VzLCByZXNvdXJjZUdyb3VwcykgPT4ge1xuXHRcdFx0cmVzb3VyY2VHcm91cHMucmVzb3VyY2VzLmZvckVhY2goKHJlc291cmNlKSA9PiByZXNvdXJjZXMuYWRkKHJlc291cmNlLnNvdXJjZVVyaSkpO1xuXHRcdFx0cmV0dXJuIHJlc291cmNlcztcblx0XHR9LCBuZXcgU2V0PFVSST4oKSk7IC8vIEEgVVJJIG1pZ2h0IGFwcGVhciBpbiBtb3JlIHRoYW4gb25lIHJlc291cmNlIGdyb3VwXG5cdH1cblxuXHRwcml2YXRlIGhhc0VkaXRTZXNzaW9uKCkge1xuXHRcdGZvciAoY29uc3QgcmVwb3NpdG9yeSBvZiB0aGlzLnNjbVNlcnZpY2UucmVwb3NpdG9yaWVzKSB7XG5cdFx0XHRpZiAodGhpcy5nZXRDaGFuZ2VkUmVzb3VyY2VzKHJlcG9zaXRvcnkpLnNpemUgPiAwKSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3VsZENvbnRpbnVlT25XaXRoRWRpdFNlc3Npb24oKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dHlwZSBFZGl0U2Vzc2lvbnNBdXRoQ2hlY2tFdmVudCA9IHsgb3V0Y29tZTogc3RyaW5nIH07XG5cdFx0dHlwZSBFZGl0U2Vzc2lvbnNBdXRoQ2hlY2tDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnam95Y2VlcmhsJzsgY29tbWVudDogJ1JlcG9ydGluZyB3aGV0aGVyIHdlIGNhbiBhbmQgc2hvdWxkIHN0b3JlIGVkaXQgc2Vzc2lvbiBhcyBwYXJ0IG9mIENvbnRpbnVlIE9uLic7XG5cdFx0XHRvdXRjb21lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG91dGNvbWUgb2YgY2hlY2tpbmcgd2hldGhlciB3ZSBjYW4gc3RvcmUgYW4gZWRpdCBzZXNzaW9uIGFzIHBhcnQgb2YgdGhlIENvbnRpbnVlIE9uIGZsb3cuJyB9O1xuXHRcdH07XG5cblx0XHQvLyBJZiB0aGUgdXNlciBpcyBhbHJlYWR5IHNpZ25lZCBpbiwgd2Ugc2hvdWxkIHN0b3JlIGVkaXQgc2Vzc2lvblxuXHRcdGlmICh0aGlzLmVkaXRTZXNzaW9uc1N0b3JhZ2VTZXJ2aWNlLmlzU2lnbmVkSW4pIHtcblx0XHRcdHJldHVybiB0aGlzLmhhc0VkaXRTZXNzaW9uKCk7XG5cdFx0fVxuXG5cdFx0Ly8gSWYgdGhlIHVzZXIgaGFzIGJlZW4gYXNrZWQgYmVmb3JlIGFuZCBzYWlkIG5vLCBkb24ndCB1c2UgZWRpdCBzZXNzaW9uc1xuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHVzZUVkaXRTZXNzaW9uc1dpdGhDb250aW51ZU9uKSA9PT0gJ29mZicpIHtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEVkaXRTZXNzaW9uc0F1dGhDaGVja0V2ZW50LCBFZGl0U2Vzc2lvbnNBdXRoQ2hlY2tDbGFzc2lmaWNhdGlvbj4oJ2NvbnRpbnVlT24uZWRpdFNlc3Npb25zLmNhblN0b3JlLm91dGNvbWUnLCB7IG91dGNvbWU6ICdkaXNhYmxlZEVkaXRTZXNzaW9uc1ZpYVNldHRpbmcnIH0pO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIFByb21wdCB0aGUgdXNlciB0byB1c2UgZWRpdCBzZXNzaW9ucyBpZiB0aGV5IGN1cnJlbnRseSBjb3VsZCBiZW5lZml0IGZyb20gdXNpbmcgaXRcblx0XHRpZiAodGhpcy5oYXNFZGl0U2Vzc2lvbigpKSB7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdGNvbnN0IHF1aWNrcGljayA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxJUXVpY2tQaWNrSXRlbT4oKSk7XG5cdFx0XHRxdWlja3BpY2sucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgnY29udGludWUgd2l0aCBjbG91ZCBjaGFuZ2VzJywgXCJTZWxlY3Qgd2hldGhlciB0byBicmluZyB5b3VyIHdvcmtpbmcgY2hhbmdlcyB3aXRoIHlvdVwiKTtcblx0XHRcdHF1aWNrcGljay5vayA9IGZhbHNlO1xuXHRcdFx0cXVpY2twaWNrLmlnbm9yZUZvY3VzT3V0ID0gdHJ1ZTtcblx0XHRcdGNvbnN0IHdpdGhDbG91ZENoYW5nZXMgPSB7IGxhYmVsOiBsb2NhbGl6ZSgnd2l0aCBjbG91ZCBjaGFuZ2VzJywgXCJZZXMsIGNvbnRpbnVlIHdpdGggbXkgd29ya2luZyBjaGFuZ2VzXCIpIH07XG5cdFx0XHRjb25zdCB3aXRob3V0Q2xvdWRDaGFuZ2VzID0geyBsYWJlbDogbG9jYWxpemUoJ3dpdGhvdXQgY2xvdWQgY2hhbmdlcycsIFwiTm8sIGNvbnRpbnVlIHdpdGhvdXQgbXkgd29ya2luZyBjaGFuZ2VzXCIpIH07XG5cdFx0XHRxdWlja3BpY2suaXRlbXMgPSBbd2l0aENsb3VkQ2hhbmdlcywgd2l0aG91dENsb3VkQ2hhbmdlc107XG5cblx0XHRcdGNvbnN0IGNvbnRpbnVlV2l0aENsb3VkQ2hhbmdlcyA9IGF3YWl0IG5ldyBQcm9taXNlPGJvb2xlYW4+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrcGljay5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdFx0cmVzb2x2ZShxdWlja3BpY2suc2VsZWN0ZWRJdGVtc1swXSA9PT0gd2l0aENsb3VkQ2hhbmdlcyk7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja3BpY2sub25EaWRIaWRlKCgpID0+IHtcblx0XHRcdFx0XHRyZWplY3QobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRxdWlja3BpY2suc2hvdygpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGlmICghY29udGludWVXaXRoQ2xvdWRDaGFuZ2VzKSB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEVkaXRTZXNzaW9uc0F1dGhDaGVja0V2ZW50LCBFZGl0U2Vzc2lvbnNBdXRoQ2hlY2tDbGFzc2lmaWNhdGlvbj4oJ2NvbnRpbnVlT24uZWRpdFNlc3Npb25zLmNhblN0b3JlLm91dGNvbWUnLCB7IG91dGNvbWU6ICdkaWROb3RFbmFibGVFZGl0U2Vzc2lvbnNXaGVuUHJvbXB0ZWQnIH0pO1xuXHRcdFx0XHRyZXR1cm4gY29udGludWVXaXRoQ2xvdWRDaGFuZ2VzO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBpbml0aWFsaXplZCA9IGF3YWl0IHRoaXMuZWRpdFNlc3Npb25zU3RvcmFnZVNlcnZpY2UuaW5pdGlhbGl6ZSgnd3JpdGUnKTtcblx0XHRcdGlmICghaW5pdGlhbGl6ZWQpIHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8RWRpdFNlc3Npb25zQXV0aENoZWNrRXZlbnQsIEVkaXRTZXNzaW9uc0F1dGhDaGVja0NsYXNzaWZpY2F0aW9uPignY29udGludWVPbi5lZGl0U2Vzc2lvbnMuY2FuU3RvcmUub3V0Y29tZScsIHsgb3V0Y29tZTogJ2RpZE5vdEVuYWJsZUVkaXRTZXNzaW9uc1doZW5Qcm9tcHRlZCcgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaW5pdGlhbGl6ZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Ly8jcmVnaW9uIENvbnRpbnVlIEVkaXQgU2Vzc2lvbiBleHRlbnNpb24gY29udHJpYnV0aW9uIHBvaW50XG5cblx0cHJpdmF0ZSByZWdpc3RlckNvbnRyaWJ1dGVkRWRpdFNlc3Npb25PcHRpb25zKCkge1xuXHRcdGNvbnRpbnVlRWRpdFNlc3Npb25FeHRQb2ludC5zZXRIYW5kbGVyKGV4dGVuc2lvbnMgPT4ge1xuXHRcdFx0Y29uc3QgY29udGludWVFZGl0U2Vzc2lvbk9wdGlvbnM6IENvbnRpbnVlRWRpdFNlc3Npb25JdGVtW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdFx0aWYgKCFpc1Byb3Bvc2VkQXBpRW5hYmxlZChleHRlbnNpb24uZGVzY3JpcHRpb24sICdjb250cmliRWRpdFNlc3Npb25zJykpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoZXh0ZW5zaW9uLnZhbHVlKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAoY29uc3QgY29udHJpYnV0aW9uIG9mIGV4dGVuc2lvbi52YWx1ZSkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbW1hbmQgPSBNZW51UmVnaXN0cnkuZ2V0Q29tbWFuZChjb250cmlidXRpb24uY29tbWFuZCk7XG5cdFx0XHRcdFx0aWYgKCFjb21tYW5kKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgaWNvbiA9IGNvbW1hbmQuaWNvbjtcblx0XHRcdFx0XHRjb25zdCB0aXRsZSA9IHR5cGVvZiBjb21tYW5kLnRpdGxlID09PSAnc3RyaW5nJyA/IGNvbW1hbmQudGl0bGUgOiBjb21tYW5kLnRpdGxlLnZhbHVlO1xuXHRcdFx0XHRcdGNvbnN0IHdoZW4gPSBDb250ZXh0S2V5RXhwci5kZXNlcmlhbGl6ZShjb250cmlidXRpb24ud2hlbik7XG5cblx0XHRcdFx0XHRjb250aW51ZUVkaXRTZXNzaW9uT3B0aW9ucy5wdXNoKG5ldyBDb250aW51ZUVkaXRTZXNzaW9uSXRlbShcblx0XHRcdFx0XHRcdFRoZW1lSWNvbi5pc1RoZW1lSWNvbihpY29uKSA/IGAkKCR7aWNvbi5pZH0pICR7dGl0bGV9YCA6IHRpdGxlLFxuXHRcdFx0XHRcdFx0Y29tbWFuZC5pZCxcblx0XHRcdFx0XHRcdGNvbW1hbmQuc291cmNlPy50aXRsZSxcblx0XHRcdFx0XHRcdHdoZW4sXG5cdFx0XHRcdFx0XHRjb250cmlidXRpb24uZG9jdW1lbnRhdGlvblxuXHRcdFx0XHRcdCkpO1xuXG5cdFx0XHRcdFx0aWYgKGNvbnRyaWJ1dGlvbi5xdWFsaWZpZWROYW1lKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmdlbmVyYXRlU3RhbmRhbG9uZU9wdGlvbkNvbW1hbmQoY29tbWFuZC5pZCwgY29udHJpYnV0aW9uLnF1YWxpZmllZE5hbWUsIGNvbnRyaWJ1dGlvbi5jYXRlZ29yeSA/PyBjb21tYW5kLmNhdGVnb3J5LCB3aGVuLCBjb250cmlidXRpb24ucmVtb3RlR3JvdXApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5jb250aW51ZUVkaXRTZXNzaW9uT3B0aW9ucyA9IGNvbnRpbnVlRWRpdFNlc3Npb25PcHRpb25zO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZW5lcmF0ZVN0YW5kYWxvbmVPcHRpb25Db21tYW5kKGNvbW1hbmRJZDogc3RyaW5nLCBxdWFsaWZpZWROYW1lOiBzdHJpbmcsIGNhdGVnb3J5OiBzdHJpbmcgfCBJTG9jYWxpemVkU3RyaW5nIHwgdW5kZWZpbmVkLCB3aGVuOiBDb250ZXh0S2V5RXhwcmVzc2lvbiB8IHVuZGVmaW5lZCwgcmVtb3RlR3JvdXA6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IGNvbW1hbmQ6IElBY3Rpb24yT3B0aW9ucyA9IHtcblx0XHRcdGlkOiBgJHtjb250aW51ZVdvcmtpbmdPbkNvbW1hbmQuaWR9LiR7Y29tbWFuZElkfWAsXG5cdFx0XHR0aXRsZTogeyBvcmlnaW5hbDogcXVhbGlmaWVkTmFtZSwgdmFsdWU6IHF1YWxpZmllZE5hbWUgfSxcblx0XHRcdGNhdGVnb3J5OiB0eXBlb2YgY2F0ZWdvcnkgPT09ICdzdHJpbmcnID8geyBvcmlnaW5hbDogY2F0ZWdvcnksIHZhbHVlOiBjYXRlZ29yeSB9IDogY2F0ZWdvcnksXG5cdFx0XHRwcmVjb25kaXRpb246IHdoZW4sXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH07XG5cblx0XHRpZiAoIXRoaXMucmVnaXN0ZXJlZENvbW1hbmRzLmhhcyhjb21tYW5kLmlkKSkge1xuXHRcdFx0dGhpcy5yZWdpc3RlcmVkQ29tbWFuZHMuYWRkKGNvbW1hbmQuaWQpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgU3RhbmRhbG9uZUNvbnRpbnVlT25PcHRpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdFx0c3VwZXIoY29tbWFuZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElDb21tYW5kU2VydmljZSkuZXhlY3V0ZUNvbW1hbmQoY29udGludWVXb3JraW5nT25Db21tYW5kLmlkLCB1bmRlZmluZWQsIGNvbW1hbmRJZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0aWYgKHJlbW90ZUdyb3VwICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0TWVudVJlZ2lzdHJ5LmFwcGVuZE1lbnVJdGVtKE1lbnVJZC5TdGF0dXNCYXJSZW1vdGVJbmRpY2F0b3JNZW51LCB7XG5cdFx0XHRcdFx0Z3JvdXA6IHJlbW90ZUdyb3VwLFxuXHRcdFx0XHRcdGNvbW1hbmQ6IGNvbW1hbmQsXG5cdFx0XHRcdFx0d2hlbjogY29tbWFuZC5wcmVjb25kaXRpb25cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckNvbnRpbnVlSW5Mb2NhbEZvbGRlckFjdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCB0aGF0ID0gdGhpcztcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3RlckFjdGlvbjIoY2xhc3MgQ29udGludWVJbkxvY2FsRm9sZGVyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHtcblx0XHRcdFx0c3VwZXIob3BlbkxvY2FsRm9sZGVyQ29tbWFuZCk7XG5cdFx0XHR9XG5cblx0XHRcdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IGF3YWl0IHRoYXQuZmlsZURpYWxvZ1NlcnZpY2Uuc2hvd09wZW5EaWFsb2coe1xuXHRcdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY29udGludWVFZGl0U2Vzc2lvbi5vcGVuTG9jYWxGb2xkZXIudGl0bGUudjInLCAnU2VsZWN0IGEgbG9jYWwgZm9sZGVyIHRvIGNvbnRpbnVlIHdvcmtpbmcgaW4nKSxcblx0XHRcdFx0XHRjYW5TZWxlY3RGb2xkZXJzOiB0cnVlLFxuXHRcdFx0XHRcdGNhblNlbGVjdE1hbnk6IGZhbHNlLFxuXHRcdFx0XHRcdGNhblNlbGVjdEZpbGVzOiBmYWxzZSxcblx0XHRcdFx0XHRhdmFpbGFibGVGaWxlU3lzdGVtczogW1NjaGVtYXMuZmlsZV1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cmV0dXJuIHNlbGVjdGlvbj8ubGVuZ3RoICE9PSAxID8gdW5kZWZpbmVkIDogVVJJLmZyb20oe1xuXHRcdFx0XHRcdHNjaGVtZTogdGhhdC5wcm9kdWN0U2VydmljZS51cmxQcm90b2NvbCxcblx0XHRcdFx0XHRhdXRob3JpdHk6IFNjaGVtYXMuZmlsZSxcblx0XHRcdFx0XHRwYXRoOiBzZWxlY3Rpb25bMF0ucGF0aFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoZ2V0VmlydHVhbFdvcmtzcGFjZUxvY2F0aW9uKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkpICE9PSB1bmRlZmluZWQgJiYgaXNOYXRpdmUpIHtcblx0XHRcdHRoaXMuZ2VuZXJhdGVTdGFuZGFsb25lT3B0aW9uQ29tbWFuZChvcGVuTG9jYWxGb2xkZXJDb21tYW5kLmlkLCBsb2NhbGl6ZSgnY29udGludWVXb3JraW5nT24uZXhpc3RpbmdMb2NhbEZvbGRlcicsICdDb250aW51ZSBXb3JraW5nIGluIEV4aXN0aW5nIExvY2FsIEZvbGRlcicpLCB1bmRlZmluZWQsIG9wZW5Mb2NhbEZvbGRlckNvbW1hbmQucHJlY29uZGl0aW9uLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcGlja0NvbnRpbnVlRWRpdFNlc3Npb25EZXN0aW5hdGlvbigpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHF1aWNrUGljayA9IGRpc3Bvc2FibGVzLmFkZCh0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljazxDb250aW51ZUVkaXRTZXNzaW9uSXRlbT4oeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZUNvbnRleHQgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkZPTERFUlxuXHRcdFx0PyB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnNbMF0ubmFtZVxuXHRcdFx0OiB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubWFwKChmb2xkZXIpID0+IGZvbGRlci5uYW1lKS5qb2luKCcsICcpO1xuXHRcdHF1aWNrUGljay5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCdjb250aW51ZUVkaXRTZXNzaW9uUGljay50aXRsZS52MicsIFwiU2VsZWN0IGEgZGV2ZWxvcG1lbnQgZW52aXJvbm1lbnQgdG8gY29udGludWUgd29ya2luZyBvbiB7MH0gaW5cIiwgYCcke3dvcmtzcGFjZUNvbnRleHR9J2ApO1xuXHRcdHF1aWNrUGljay5pdGVtcyA9IHRoaXMuY3JlYXRlUGlja0l0ZW1zKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRoaXMuZXh0ZW5zaW9uU2VydmljZS5vbkRpZENoYW5nZUV4dGVuc2lvbnMoKCkgPT4ge1xuXHRcdFx0cXVpY2tQaWNrLml0ZW1zID0gdGhpcy5jcmVhdGVQaWNrSXRlbXMoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBjb21tYW5kID0gYXdhaXQgbmV3IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkSGlkZSgoKSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkQWNjZXB0KChlKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHF1aWNrUGljay5hY3RpdmVJdGVtc1swXS5jb21tYW5kO1xuXG5cdFx0XHRcdGlmIChzZWxlY3Rpb24gPT09IGluc3RhbGxBZGRpdGlvbmFsQ29udGludWVPbk9wdGlvbnNDb21tYW5kLmlkKSB7XG5cdFx0XHRcdFx0dm9pZCB0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKGluc3RhbGxBZGRpdGlvbmFsQ29udGludWVPbk9wdGlvbnNDb21tYW5kLmlkKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRyZXNvbHZlKHNlbGVjdGlvbik7XG5cdFx0XHRcdFx0cXVpY2tQaWNrLmhpZGUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHRxdWlja1BpY2suc2hvdygpO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tQaWNrLm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oYXN5bmMgKGUpID0+IHtcblx0XHRcdFx0aWYgKGUuaXRlbS5kb2N1bWVudGF0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25zdCB1cmkgPSBVUkkuaXNVcmkoZS5pdGVtLmRvY3VtZW50YXRpb24pID8gVVJJLnBhcnNlKGUuaXRlbS5kb2N1bWVudGF0aW9uKSA6IGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8VVJJPihlLml0ZW0uZG9jdW1lbnRhdGlvbik7XG5cdFx0XHRcdFx0aWYgKHVyaSkge1xuXHRcdFx0XHRcdFx0dm9pZCB0aGlzLm9wZW5lclNlcnZpY2Uub3Blbih1cmksIHsgb3BlbkV4dGVybmFsOiB0cnVlIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH0pO1xuXG5cdFx0cXVpY2tQaWNrLmRpc3Bvc2UoKTtcblxuXHRcdHJldHVybiBjb21tYW5kO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlRGVzdGluYXRpb24oY29tbWFuZDogc3RyaW5nKTogUHJvbWlzZTxVUkkgfCAnbm9EZXN0aW5hdGlvblVyaScgfCB1bmRlZmluZWQ+IHtcblx0XHR0eXBlIEV2YWx1YXRlQ29udGludWVPbkRlc3RpbmF0aW9uRXZlbnQgPSB7IG91dGNvbWU6IHN0cmluZzsgc2VsZWN0aW9uOiBzdHJpbmcgfTtcblx0XHR0eXBlIEV2YWx1YXRlQ29udGludWVPbkRlc3RpbmF0aW9uQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2pveWNlZXJobCc7IGNvbW1lbnQ6ICdSZXBvcnRpbmcgdGhlIG91dGNvbWUgb2YgZXZhbHVhdGluZyBhIHNlbGVjdGVkIENvbnRpbnVlIE9uIGRlc3RpbmF0aW9uIG9wdGlvbi4nO1xuXHRcdFx0c2VsZWN0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHNlbGVjdGVkIENvbnRpbnVlIE9uIGRlc3RpbmF0aW9uIG9wdGlvbi4nIH07XG5cdFx0XHRvdXRjb21lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIG91dGNvbWUgb2YgZXZhbHVhdGluZyB0aGUgc2VsZWN0ZWQgQ29udGludWUgT24gZGVzdGluYXRpb24gb3B0aW9uLicgfTtcblx0XHR9O1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHVyaSA9IGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoY29tbWFuZCk7XG5cblx0XHRcdC8vIFNvbWUgY29udGludWUgb24gY29tbWFuZHMgZG8gbm90IHJldHVybiBhIFVSSVxuXHRcdFx0Ly8gdG8gc3VwcG9ydCBleHRlbnNpb25zIHdoaWNoIHdhbnQgdG8gYmUgaW4gY29udHJvbFxuXHRcdFx0Ly8gb2YgaG93IHRoZSBkZXN0aW5hdGlvbiBpcyBvcGVuZWRcblx0XHRcdGlmICh1cmkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxFdmFsdWF0ZUNvbnRpbnVlT25EZXN0aW5hdGlvbkV2ZW50LCBFdmFsdWF0ZUNvbnRpbnVlT25EZXN0aW5hdGlvbkNsYXNzaWZpY2F0aW9uPignY29udGludWVPbi5vcGVuRGVzdGluYXRpb24ub3V0Y29tZScsIHsgc2VsZWN0aW9uOiBjb21tYW5kLCBvdXRjb21lOiAnbm9EZXN0aW5hdGlvblVyaScgfSk7XG5cdFx0XHRcdHJldHVybiAnbm9EZXN0aW5hdGlvblVyaSc7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChVUkkuaXNVcmkodXJpKSkge1xuXHRcdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxFdmFsdWF0ZUNvbnRpbnVlT25EZXN0aW5hdGlvbkV2ZW50LCBFdmFsdWF0ZUNvbnRpbnVlT25EZXN0aW5hdGlvbkNsYXNzaWZpY2F0aW9uPignY29udGludWVPbi5vcGVuRGVzdGluYXRpb24ub3V0Y29tZScsIHsgc2VsZWN0aW9uOiBjb21tYW5kLCBvdXRjb21lOiAncmVzb2x2ZWRVcmknIH0pO1xuXHRcdFx0XHRyZXR1cm4gdXJpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxFdmFsdWF0ZUNvbnRpbnVlT25EZXN0aW5hdGlvbkV2ZW50LCBFdmFsdWF0ZUNvbnRpbnVlT25EZXN0aW5hdGlvbkNsYXNzaWZpY2F0aW9uPignY29udGludWVPbi5vcGVuRGVzdGluYXRpb24ub3V0Y29tZScsIHsgc2VsZWN0aW9uOiBjb21tYW5kLCBvdXRjb21lOiAnaW52YWxpZERlc3RpbmF0aW9uJyB9KTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSBjYXRjaCAoZXgpIHtcblx0XHRcdGlmIChleCBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKSB7XG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEV2YWx1YXRlQ29udGludWVPbkRlc3RpbmF0aW9uRXZlbnQsIEV2YWx1YXRlQ29udGludWVPbkRlc3RpbmF0aW9uQ2xhc3NpZmljYXRpb24+KCdjb250aW51ZU9uLm9wZW5EZXN0aW5hdGlvbi5vdXRjb21lJywgeyBzZWxlY3Rpb246IGNvbW1hbmQsIG91dGNvbWU6ICdjYW5jZWxsZWQnIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8RXZhbHVhdGVDb250aW51ZU9uRGVzdGluYXRpb25FdmVudCwgRXZhbHVhdGVDb250aW51ZU9uRGVzdGluYXRpb25DbGFzc2lmaWNhdGlvbj4oJ2NvbnRpbnVlT24ub3BlbkRlc3RpbmF0aW9uLm91dGNvbWUnLCB7IHNlbGVjdGlvbjogY29tbWFuZCwgb3V0Y29tZTogJ3Vua25vd25FcnJvcicgfSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUGlja0l0ZW1zKCk6IChDb250aW51ZUVkaXRTZXNzaW9uSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3IpW10ge1xuXHRcdGNvbnN0IGl0ZW1zID0gWy4uLnRoaXMuY29udGludWVFZGl0U2Vzc2lvbk9wdGlvbnNdLmZpbHRlcigob3B0aW9uKSA9PiBvcHRpb24ud2hlbiA9PT0gdW5kZWZpbmVkIHx8IHRoaXMuY29udGV4dEtleVNlcnZpY2UuY29udGV4dE1hdGNoZXNSdWxlcyhvcHRpb24ud2hlbikpO1xuXG5cdFx0aWYgKGdldFZpcnR1YWxXb3Jrc3BhY2VMb2NhdGlvbih0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKSAhPT0gdW5kZWZpbmVkICYmIGlzTmF0aXZlKSB7XG5cdFx0XHRpdGVtcy5wdXNoKG5ldyBDb250aW51ZUVkaXRTZXNzaW9uSXRlbShcblx0XHRcdFx0JyQoZm9sZGVyKSAnICsgbG9jYWxpemUoJ2NvbnRpbnVlRWRpdFNlc3Npb25JdGVtLm9wZW5JbkxvY2FsRm9sZGVyLnYyJywgJ09wZW4gaW4gTG9jYWwgRm9sZGVyJyksXG5cdFx0XHRcdG9wZW5Mb2NhbEZvbGRlckNvbW1hbmQuaWQsXG5cdFx0XHRcdGxvY2FsaXplKCdjb250aW51ZUVkaXRTZXNzaW9uSXRlbS5idWlsdGluJywgJ0J1aWx0LWluJylcblx0XHRcdCkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNvcnRlZEl0ZW1zOiAoQ29udGludWVFZGl0U2Vzc2lvbkl0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdID0gaXRlbXMuc29ydCgoaXRlbTEsIGl0ZW0yKSA9PiBpdGVtMS5sYWJlbC5sb2NhbGVDb21wYXJlKGl0ZW0yLmxhYmVsKSk7XG5cdFx0cmV0dXJuIHNvcnRlZEl0ZW1zLmNvbmNhdCh7IHR5cGU6ICdzZXBhcmF0b3InIH0sIG5ldyBDb250aW51ZUVkaXRTZXNzaW9uSXRlbShpbnN0YWxsQWRkaXRpb25hbENvbnRpbnVlT25PcHRpb25zQ29tbWFuZC50aXRsZSwgaW5zdGFsbEFkZGl0aW9uYWxDb250aW51ZU9uT3B0aW9uc0NvbW1hbmQuaWQpKTtcblx0fVxufVxuXG5jb25zdCBpbmZvQnV0dG9uQ2xhc3MgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5pbmZvKTtcbmNsYXNzIENvbnRpbnVlRWRpdFNlc3Npb25JdGVtIGltcGxlbWVudHMgSVF1aWNrUGlja0l0ZW0ge1xuXHRwdWJsaWMgcmVhZG9ubHkgYnV0dG9uczogSVF1aWNrSW5wdXRCdXR0b25bXSB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgbGFiZWw6IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgY29tbWFuZDogc3RyaW5nLFxuXHRcdHB1YmxpYyByZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZyxcblx0XHRwdWJsaWMgcmVhZG9ubHkgd2hlbj86IENvbnRleHRLZXlFeHByZXNzaW9uLFxuXHRcdHB1YmxpYyByZWFkb25seSBkb2N1bWVudGF0aW9uPzogc3RyaW5nLFxuXHQpIHtcblx0XHRpZiAoZG9jdW1lbnRhdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmJ1dHRvbnMgPSBbe1xuXHRcdFx0XHRpY29uQ2xhc3M6IGluZm9CdXR0b25DbGFzcyxcblx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2xlYXJuTW9yZVRvb2x0aXAnLCAnTGVhcm4gTW9yZScpLFxuXHRcdFx0fV07XG5cdFx0fVxuXHR9XG59XG5cbmludGVyZmFjZSBJQ29tbWFuZCB7XG5cdGNvbW1hbmQ6IHN0cmluZztcblx0Z3JvdXA6IHN0cmluZztcblx0d2hlbjogc3RyaW5nO1xuXHRkb2N1bWVudGF0aW9uPzogc3RyaW5nO1xuXHRxdWFsaWZpZWROYW1lPzogc3RyaW5nO1xuXHRjYXRlZ29yeT86IHN0cmluZztcblx0cmVtb3RlR3JvdXA/OiBzdHJpbmc7XG59XG5cbmNvbnN0IGNvbnRpbnVlRWRpdFNlc3Npb25FeHRQb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PElDb21tYW5kW10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdjb250aW51ZUVkaXRTZXNzaW9uJyxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29udGludWVFZGl0U2Vzc2lvbkV4dFBvaW50JywgJ0NvbnRyaWJ1dGVzIG9wdGlvbnMgZm9yIGNvbnRpbnVpbmcgdGhlIGN1cnJlbnQgZWRpdCBzZXNzaW9uIGluIGEgZGlmZmVyZW50IGVudmlyb25tZW50JyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRpdGVtczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGNvbW1hbmQ6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvbnRpbnVlRWRpdFNlc3Npb25FeHRQb2ludC5jb21tYW5kJywgJ0lkZW50aWZpZXIgb2YgdGhlIGNvbW1hbmQgdG8gZXhlY3V0ZS4gVGhlIGNvbW1hbmQgbXVzdCBiZSBkZWNsYXJlZCBpbiB0aGUgXFwnY29tbWFuZHNcXCctc2VjdGlvbiBhbmQgcmV0dXJuIGEgVVJJIHJlcHJlc2VudGluZyBhIGRpZmZlcmVudCBlbnZpcm9ubWVudCB3aGVyZSB0aGUgY3VycmVudCBlZGl0IHNlc3Npb24gY2FuIGJlIGNvbnRpbnVlZC4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRncm91cDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29udGludWVFZGl0U2Vzc2lvbkV4dFBvaW50Lmdyb3VwJywgJ0dyb3VwIGludG8gd2hpY2ggdGhpcyBpdGVtIGJlbG9uZ3MuJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0cXVhbGlmaWVkTmFtZToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29udGludWVFZGl0U2Vzc2lvbkV4dFBvaW50LnF1YWxpZmllZE5hbWUnLCAnQSBmdWxseSBxdWFsaWZpZWQgbmFtZSBmb3IgdGhpcyBpdGVtIHdoaWNoIGlzIHVzZWQgZm9yIGRpc3BsYXkgaW4gbWVudXMuJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvbnRpbnVlRWRpdFNlc3Npb25FeHRQb2ludC5kZXNjcmlwdGlvbicsIFwiVGhlIHVybCwgb3IgYSBjb21tYW5kIHRoYXQgcmV0dXJucyB0aGUgdXJsLCB0byB0aGUgb3B0aW9uJ3MgZG9jdW1lbnRhdGlvbiBwYWdlLlwiKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZW1vdGVHcm91cDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29udGludWVFZGl0U2Vzc2lvbkV4dFBvaW50LnJlbW90ZUdyb3VwJywgJ0dyb3VwIGludG8gd2hpY2ggdGhpcyBpdGVtIGJlbG9uZ3MgaW4gdGhlIHJlbW90ZSBpbmRpY2F0b3IuJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0d2hlbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY29udGludWVFZGl0U2Vzc2lvbkV4dFBvaW50LndoZW4nLCAnQ29uZGl0aW9uIHdoaWNoIG11c3QgYmUgdHJ1ZSB0byBzaG93IHRoaXMgaXRlbS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0cmVxdWlyZWQ6IFsnY29tbWFuZCddXG5cdFx0fVxuXHR9XG59KTtcblxuLy8jZW5kcmVnaW9uXG5cbmNvbnN0IHdvcmtiZW5jaFJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpO1xud29ya2JlbmNoUmVnaXN0cnkucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oRWRpdFNlc3Npb25zQ29udHJpYnV0aW9uLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdC4uLndvcmtiZW5jaENvbmZpZ3VyYXRpb25Ob2RlQmFzZSxcblx0J3Byb3BlcnRpZXMnOiB7XG5cdFx0J3dvcmtiZW5jaC5leHBlcmltZW50YWwuY2xvdWRDaGFuZ2VzLmF1dG9TdG9yZSc6IHtcblx0XHRcdGVudW06IFsnb25TaHV0ZG93bicsICdvZmYnXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ2F1dG9TdG9yZVdvcmtpbmdDaGFuZ2VzLm9uU2h1dGRvd24nLCBcIkF1dG9tYXRpY2FsbHkgc3RvcmUgY3VycmVudCB3b3JraW5nIGNoYW5nZXMgaW4gdGhlIGNsb3VkIG9uIHdpbmRvdyBjbG9zZS5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdhdXRvU3RvcmVXb3JraW5nQ2hhbmdlcy5vZmYnLCBcIk5ldmVyIGF0dGVtcHQgdG8gYXV0b21hdGljYWxseSBzdG9yZSB3b3JraW5nIGNoYW5nZXMgaW4gdGhlIGNsb3VkLlwiKVxuXHRcdFx0XSxcblx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHQndGFncyc6IFsnZXhwZXJpbWVudGFsJywgJ3VzZXNPbmxpbmVTZXJ2aWNlcyddLFxuXHRcdFx0J2RlZmF1bHQnOiAnb2ZmJyxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2F1dG9TdG9yZVdvcmtpbmdDaGFuZ2VzRGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gYXV0b21hdGljYWxseSBzdG9yZSBhdmFpbGFibGUgd29ya2luZyBjaGFuZ2VzIGluIHRoZSBjbG91ZCBmb3IgdGhlIGN1cnJlbnQgd29ya3NwYWNlLiBUaGlzIHNldHRpbmcgaGFzIG5vIGVmZmVjdCBpbiB0aGUgd2ViLlwiKSxcblx0XHR9LFxuXHRcdCd3b3JrYmVuY2guY2xvdWRDaGFuZ2VzLmF1dG9SZXN1bWUnOiB7XG5cdFx0XHRlbnVtOiBbJ29uUmVsb2FkJywgJ29mZiddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnYXV0b1Jlc3VtZVdvcmtpbmdDaGFuZ2VzLm9uUmVsb2FkJywgXCJBdXRvbWF0aWNhbGx5IHJlc3VtZSBhdmFpbGFibGUgd29ya2luZyBjaGFuZ2VzIGZyb20gdGhlIGNsb3VkIG9uIHdpbmRvdyByZWxvYWQuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnYXV0b1Jlc3VtZVdvcmtpbmdDaGFuZ2VzLm9mZicsIFwiTmV2ZXIgYXR0ZW1wdCB0byByZXN1bWUgd29ya2luZyBjaGFuZ2VzIGZyb20gdGhlIGNsb3VkLlwiKVxuXHRcdFx0XSxcblx0XHRcdCd0eXBlJzogJ3N0cmluZycsXG5cdFx0XHQndGFncyc6IFsndXNlc09ubGluZVNlcnZpY2VzJ10sXG5cdFx0XHQnZGVmYXVsdCc6ICdvblJlbG9hZCcsXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6IGxvY2FsaXplKCdhdXRvUmVzdW1lV29ya2luZ0NoYW5nZXMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgdG8gYXV0b21hdGljYWxseSByZXN1bWUgYXZhaWxhYmxlIHdvcmtpbmcgY2hhbmdlcyBzdG9yZWQgaW4gdGhlIGNsb3VkIGZvciB0aGUgY3VycmVudCB3b3Jrc3BhY2UuXCIpLFxuXHRcdH0sXG5cdFx0J3dvcmtiZW5jaC5jbG91ZENoYW5nZXMuY29udGludWVPbic6IHtcblx0XHRcdGVudW06IFsncHJvbXB0JywgJ29mZiddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnY29udGludWVPbkNsb3VkQ2hhbmdlcy5wcm9tcHRGb3JBdXRoJywgJ1Byb21wdCB0aGUgdXNlciB0byBzaWduIGluIHRvIHN0b3JlIHdvcmtpbmcgY2hhbmdlcyBpbiB0aGUgY2xvdWQgd2l0aCBDb250aW51ZSBXb3JraW5nIE9uLicpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnY29udGludWVPbkNsb3VkQ2hhbmdlcy5vZmYnLCAnRG8gbm90IHN0b3JlIHdvcmtpbmcgY2hhbmdlcyBpbiB0aGUgY2xvdWQgd2l0aCBDb250aW51ZSBXb3JraW5nIE9uIHVubGVzcyB0aGUgdXNlciBoYXMgYWxyZWFkeSB0dXJuZWQgb24gQ2xvdWQgQ2hhbmdlcy4nKVxuXHRcdFx0XSxcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0dGFnczogWyd1c2VzT25saW5lU2VydmljZXMnXSxcblx0XHRcdGRlZmF1bHQ6ICdwcm9tcHQnLFxuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbG9jYWxpemUoJ2NvbnRpbnVlT25DbG91ZENoYW5nZXMnLCAnQ29udHJvbHMgd2hldGhlciB0byBwcm9tcHQgdGhlIHVzZXIgdG8gc3RvcmUgd29ya2luZyBjaGFuZ2VzIGluIHRoZSBjbG91ZCB3aGVuIHVzaW5nIENvbnRpbnVlIFdvcmtpbmcgT24uJylcblx0XHR9LFxuXHRcdCd3b3JrYmVuY2guZXhwZXJpbWVudGFsLmNsb3VkQ2hhbmdlcy5wYXJ0aWFsTWF0Y2hlcy5lbmFibGVkJzoge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQndGFncyc6IFsnZXhwZXJpbWVudGFsJywgJ3VzZXNPbmxpbmVTZXJ2aWNlcyddLFxuXHRcdFx0J2RlZmF1bHQnOiBmYWxzZSxcblx0XHRcdCdtYXJrZG93bkRlc2NyaXB0aW9uJzogbG9jYWxpemUoJ2Nsb3VkQ2hhbmdlc1BhcnRpYWxNYXRjaGVzRW5hYmxlZCcsIFwiQ29udHJvbHMgd2hldGhlciB0byBzdXJmYWNlIGNsb3VkIGNoYW5nZXMgd2hpY2ggcGFydGlhbGx5IG1hdGNoIHRoZSBjdXJyZW50IHNlc3Npb24uXCIpXG5cdFx0fVxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLGlCQUFpQix5QkFBeUI7QUFDL0QsU0FBMEMsY0FBYywyQkFBbUQ7QUFDM0csU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUIsZ0JBQWdCLHNCQUFzQjtBQUNsRSxTQUFTLFNBQTBCLFFBQVEsY0FBYyx1QkFBdUI7QUFFaEYsU0FBUyxVQUFVLGlCQUFpQjtBQUNwQyxTQUFTLDZCQUFxQyxZQUFpQyxVQUFVLDRCQUE0Qiw0QkFBNEIsMEJBQTBCLHlCQUF5Qix5QkFBeUIscUJBQXFCLHlCQUF5Qiw0QkFBNEIsOEJBQThCLHFCQUFxQixtQkFBbUIsNkJBQTZCO0FBQzFZLFNBQXlCLG1CQUFtQjtBQUM1QyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDBCQUE0QyxzQkFBc0I7QUFDM0UsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsVUFBVSxVQUFVLG9CQUFvQjtBQUNqRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFvQixrQkFBaUMsd0JBQXdCO0FBQzdFLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLHVCQUF1Qiw4QkFBOEI7QUFDOUQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMscUJBQXFCLGdCQUFnQiwwQkFBMEI7QUFDeEUsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQ0FBc0M7QUFD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
