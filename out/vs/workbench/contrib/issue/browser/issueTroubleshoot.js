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
import { localize, localize2 } from "../../../../nls.js";
import { IExtensionManagementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { ExtensionType } from "../../../../platform/extensions/common/extensions.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IWorkbenchIssueService } from "../common/issue.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Action2, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IExtensionBisectService } from "../../../services/extensionManagement/browser/extensionBisect.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { IWorkbenchExtensionEnablementService } from "../../../services/extensionManagement/common/extensionManagement.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions } from "../../../common/contributions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { URI } from "../../../../base/common/uri.js";
import { RemoteNameContext } from "../../../common/contextkeys.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
const ITroubleshootIssueService = createDecorator("ITroubleshootIssueService");
var TroubleshootStage = /* @__PURE__ */ ((TroubleshootStage2) => {
  TroubleshootStage2[TroubleshootStage2["EXTENSIONS"] = 1] = "EXTENSIONS";
  TroubleshootStage2[TroubleshootStage2["WORKBENCH"] = 2] = "WORKBENCH";
  return TroubleshootStage2;
})(TroubleshootStage || {});
class TroubleShootState {
  constructor(stage, profile) {
    this.stage = stage;
    this.profile = profile;
  }
  static fromJSON(raw) {
    if (!raw) {
      return void 0;
    }
    try {
      const data = JSON.parse(raw);
      if ((data.stage === 1 /* EXTENSIONS */ || data.stage === 2 /* WORKBENCH */) && typeof data.profile === "string") {
        return new TroubleShootState(data.stage, data.profile);
      }
    } catch {
    }
    return void 0;
  }
}
let TroubleshootIssueService = class extends Disposable {
  constructor(userDataProfileService, userDataProfilesService, userDataProfileManagementService, userDataProfileImportExportService, dialogService, extensionBisectService, notificationService, extensionManagementService, extensionEnablementService, issueService, productService, hostService, storageService, openerService) {
    super();
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.userDataProfileManagementService = userDataProfileManagementService;
    this.userDataProfileImportExportService = userDataProfileImportExportService;
    this.dialogService = dialogService;
    this.extensionBisectService = extensionBisectService;
    this.notificationService = notificationService;
    this.extensionManagementService = extensionManagementService;
    this.extensionEnablementService = extensionEnablementService;
    this.issueService = issueService;
    this.productService = productService;
    this.hostService = hostService;
    this.storageService = storageService;
    this.openerService = openerService;
  }
  isActive() {
    return this.state !== void 0;
  }
  async start() {
    if (this.isActive()) {
      throw new Error("invalid state");
    }
    const res = await this.dialogService.confirm({
      message: localize("troubleshoot issue", "Troubleshoot Issue"),
      detail: localize("detail.start", "Issue troubleshooting is a process to help you identify the cause for an issue. The cause for an issue can be a misconfiguration, due to an extension, or be {0} itself.\n\nDuring the process the window reloads repeatedly. Each time you must confirm if you are still seeing the issue.", this.productService.nameLong),
      primaryButton: localize({ key: "msg", comment: ["&& denotes a mnemonic"] }, "&&Troubleshoot Issue"),
      custom: true
    });
    if (!res.confirmed) {
      return;
    }
    const originalProfile = this.userDataProfileService.currentProfile;
    await this.userDataProfileImportExportService.createTroubleshootProfile();
    this.state = new TroubleShootState(1 /* EXTENSIONS */, originalProfile.id);
    await this.resume();
  }
  async resume() {
    if (!this.isActive()) {
      return;
    }
    if (this.state?.stage === 1 /* EXTENSIONS */ && !this.extensionBisectService.isActive) {
      await this.reproduceIssueWithExtensionsDisabled();
    }
    if (this.state?.stage === 2 /* WORKBENCH */) {
      await this.reproduceIssueWithEmptyProfile();
    }
    await this.stop();
  }
  async stop() {
    if (!this.isActive()) {
      return;
    }
    if (this.notificationHandle) {
      this.notificationHandle.close();
      this.notificationHandle = void 0;
    }
    if (this.extensionBisectService.isActive) {
      await this.extensionBisectService.reset();
    }
    const profile = this.userDataProfilesService.profiles.find((p) => p.id === this.state?.profile) ?? this.userDataProfilesService.defaultProfile;
    this.state = void 0;
    await this.userDataProfileManagementService.switchProfile(profile);
  }
  async reproduceIssueWithExtensionsDisabled() {
    if (!(await this.extensionManagementService.getInstalled(ExtensionType.User)).length) {
      this.state = new TroubleShootState(2 /* WORKBENCH */, this.state.profile);
      return;
    }
    const result = await this.askToReproduceIssue(localize("profile.extensions.disabled", "Issue troubleshooting is active and has temporarily disabled all installed extensions. Check if you can still reproduce the problem and proceed by selecting from these options."));
    if (result === "good") {
      const profile = this.userDataProfilesService.profiles.find((p) => p.id === this.state.profile) ?? this.userDataProfilesService.defaultProfile;
      await this.reproduceIssueWithExtensionsBisect(profile);
    }
    if (result === "bad") {
      this.state = new TroubleShootState(2 /* WORKBENCH */, this.state.profile);
    }
    if (result === "stop") {
      await this.stop();
    }
  }
  async reproduceIssueWithEmptyProfile() {
    await this.userDataProfileManagementService.createAndEnterTransientProfile();
    this.updateState(this.state);
    const result = await this.askToReproduceIssue(localize("empty.profile", "Issue troubleshooting is active and has temporarily reset your configurations to defaults. Check if you can still reproduce the problem and proceed by selecting from these options."));
    if (result === "stop") {
      await this.stop();
    }
    if (result === "good") {
      await this.askToReportIssue(localize("issue is with configuration", 'Issue troubleshooting has identified that the issue is caused by your configurations. Please report the issue by exporting your configurations using "Export Profile" command and share the file in the issue report.'));
    }
    if (result === "bad") {
      await this.askToReportIssue(localize("issue is in core", "Issue troubleshooting has identified that the issue is with {0}.", this.productService.nameLong));
    }
  }
  async reproduceIssueWithExtensionsBisect(profile) {
    await this.userDataProfileManagementService.switchProfile(profile);
    const extensions = (await this.extensionManagementService.getInstalled(ExtensionType.User)).filter((ext) => this.extensionEnablementService.isEnabled(ext));
    await this.extensionBisectService.start(extensions);
    await this.hostService.reload();
  }
  askToReproduceIssue(message) {
    return new Promise((c, e) => {
      const goodPrompt = {
        label: localize("I cannot reproduce", "I Can't Reproduce"),
        run: () => c("good")
      };
      const badPrompt = {
        label: localize("This is Bad", "I Can Reproduce"),
        run: () => c("bad")
      };
      const stop = {
        label: localize("Stop", "Stop"),
        run: () => c("stop")
      };
      this.notificationHandle = this.notificationService.prompt(
        Severity.Info,
        message,
        [goodPrompt, badPrompt, stop],
        { sticky: true, priority: NotificationPriority.URGENT }
      );
    });
  }
  async askToReportIssue(message) {
    let isCheckedInInsiders = false;
    if (this.productService.quality === "stable") {
      const res = await this.askToReproduceIssueWithInsiders();
      if (res === "good") {
        await this.dialogService.prompt({
          type: Severity.Info,
          message: localize("troubleshoot issue", "Troubleshoot Issue"),
          detail: localize("use insiders", "This likely means that the issue has been addressed already and will be available in an upcoming release. You can safely use {0} insiders until the new stable version is available.", this.productService.nameLong),
          custom: true
        });
        return;
      }
      if (res === "stop") {
        await this.stop();
        return;
      }
      if (res === "bad") {
        isCheckedInInsiders = true;
      }
    }
    await this.issueService.openReporter({
      issueBody: `> ${message} ${isCheckedInInsiders ? `It is confirmed that the issue exists in ${this.productService.nameLong} Insiders` : ""}`
    });
  }
  async askToReproduceIssueWithInsiders() {
    const confirmRes = await this.dialogService.confirm({
      type: "info",
      message: localize("troubleshoot issue", "Troubleshoot Issue"),
      primaryButton: localize("download insiders", "Download {0} Insiders", this.productService.nameLong),
      cancelButton: localize("report anyway", "Report Issue Anyway"),
      detail: localize("ask to download insiders", "Please try to download and reproduce the issue in {0} insiders.", this.productService.nameLong),
      custom: {
        disableCloseAction: true
      }
    });
    if (!confirmRes.confirmed) {
      return void 0;
    }
    const opened = await this.openerService.open(URI.parse("https://aka.ms/vscode-insiders"));
    if (!opened) {
      return void 0;
    }
    const res = await this.dialogService.prompt({
      type: "info",
      message: localize("troubleshoot issue", "Troubleshoot Issue"),
      buttons: [{
        label: localize("good", "I can't reproduce"),
        run: () => "good"
      }, {
        label: localize("bad", "I can reproduce"),
        run: () => "bad"
      }],
      cancelButton: {
        label: localize("stop", "Stop"),
        run: () => "stop"
      },
      detail: localize("ask to reproduce issue", "Please try to reproduce the issue in {0} insiders and confirm if the issue exists there.", this.productService.nameLong),
      custom: {
        disableCloseAction: true
      }
    });
    return res.result;
  }
  get state() {
    if (this._state === void 0) {
      const raw = this.storageService.get(TroubleshootIssueService.storageKey, StorageScope.PROFILE);
      this._state = TroubleShootState.fromJSON(raw);
    }
    return this._state || void 0;
  }
  set state(state) {
    this._state = state ?? null;
    this.updateState(state);
  }
  updateState(state) {
    if (state) {
      this.storageService.store(TroubleshootIssueService.storageKey, JSON.stringify(state), StorageScope.PROFILE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(TroubleshootIssueService.storageKey, StorageScope.PROFILE);
    }
  }
};
TroubleshootIssueService.storageKey = "issueTroubleshootState";
TroubleshootIssueService = __decorateClass([
  __decorateParam(0, IUserDataProfileService),
  __decorateParam(1, IUserDataProfilesService),
  __decorateParam(2, IUserDataProfileManagementService),
  __decorateParam(3, IUserDataProfileImportExportService),
  __decorateParam(4, IDialogService),
  __decorateParam(5, IExtensionBisectService),
  __decorateParam(6, INotificationService),
  __decorateParam(7, IExtensionManagementService),
  __decorateParam(8, IWorkbenchExtensionEnablementService),
  __decorateParam(9, IWorkbenchIssueService),
  __decorateParam(10, IProductService),
  __decorateParam(11, IHostService),
  __decorateParam(12, IStorageService),
  __decorateParam(13, IOpenerService)
], TroubleshootIssueService);
let IssueTroubleshootUi = class extends Disposable {
  constructor(contextKeyService, troubleshootIssueService, storageService) {
    super();
    this.contextKeyService = contextKeyService;
    this.troubleshootIssueService = troubleshootIssueService;
    this.updateContext();
    if (troubleshootIssueService.isActive()) {
      troubleshootIssueService.resume();
    }
    this._register(storageService.onDidChangeValue(StorageScope.PROFILE, TroubleshootIssueService.storageKey, this._store)(() => {
      this.updateContext();
    }));
  }
  updateContext() {
    IssueTroubleshootUi.ctxIsTroubleshootActive.bindTo(this.contextKeyService).set(this.troubleshootIssueService.isActive());
  }
};
IssueTroubleshootUi.ctxIsTroubleshootActive = new RawContextKey("isIssueTroubleshootActive", false);
IssueTroubleshootUi = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, ITroubleshootIssueService),
  __decorateParam(2, IStorageService)
], IssueTroubleshootUi);
Registry.as(Extensions.Workbench).registerWorkbenchContribution(IssueTroubleshootUi, LifecyclePhase.Restored);
registerAction2(class TroubleshootIssueAction extends Action2 {
  constructor() {
    super({
      id: "workbench.action.troubleshootIssue.start",
      title: localize2("troubleshootIssue", "Troubleshoot Issue..."),
      category: Categories.Help,
      f1: true,
      precondition: ContextKeyExpr.and(IssueTroubleshootUi.ctxIsTroubleshootActive.negate(), RemoteNameContext.isEqualTo(""), IsWebContext.negate())
    });
  }
  run(accessor) {
    return accessor.get(ITroubleshootIssueService).start();
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "workbench.action.troubleshootIssue.stop",
      title: localize2("title.stop", "Stop Troubleshoot Issue"),
      category: Categories.Help,
      f1: true,
      precondition: IssueTroubleshootUi.ctxIsTroubleshootActive
    });
  }
  async run(accessor) {
    return accessor.get(ITroubleshootIssueService).stop();
  }
});
registerSingleton(ITroubleshootIssueService, TroubleshootIssueService, InstantiationType.Delayed);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lzc3VlL2Jyb3dzZXIvaXNzdWVUcm91Ymxlc2hvb3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaElzc3VlU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9pc3N1ZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UsIElVc2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZSwgSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkJpc2VjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2Jyb3dzZXIvZXh0ZW5zaW9uQmlzZWN0LmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25IYW5kbGUsIElOb3RpZmljYXRpb25TZXJ2aWNlLCBJUHJvbXB0Q2hvaWNlLCBOb3RpZmljYXRpb25Qcmlvcml0eSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGUsIElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IFNlcnZpY2VzQWNjZXNzb3IsIGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBSZW1vdGVOYW1lQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJc1dlYkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5cbmNvbnN0IElUcm91Ymxlc2hvb3RJc3N1ZVNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SVRyb3VibGVzaG9vdElzc3VlU2VydmljZT4oJ0lUcm91Ymxlc2hvb3RJc3N1ZVNlcnZpY2UnKTtcblxuaW50ZXJmYWNlIElUcm91Ymxlc2hvb3RJc3N1ZVNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGlzQWN0aXZlKCk6IGJvb2xlYW47XG5cdHN0YXJ0KCk6IFByb21pc2U8dm9pZD47XG5cdHJlc3VtZSgpOiBQcm9taXNlPHZvaWQ+O1xuXHRzdG9wKCk6IFByb21pc2U8dm9pZD47XG59XG5cbmVudW0gVHJvdWJsZXNob290U3RhZ2Uge1xuXHRFWFRFTlNJT05TID0gMSxcblx0V09SS0JFTkNILFxufVxuXG50eXBlIFRyb3VibGVTaG9vdFJlc3VsdCA9ICdnb29kJyB8ICdiYWQnIHwgJ3N0b3AnO1xuXG5jbGFzcyBUcm91YmxlU2hvb3RTdGF0ZSB7XG5cblx0c3RhdGljIGZyb21KU09OKHJhdzogc3RyaW5nIHwgdW5kZWZpbmVkKTogVHJvdWJsZVNob290U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGlmICghcmF3KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0aW50ZXJmYWNlIFJhdyBleHRlbmRzIFRyb3VibGVTaG9vdFN0YXRlIHsgfVxuXHRcdFx0Y29uc3QgZGF0YTogUmF3ID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0aWYgKFxuXHRcdFx0XHQoZGF0YS5zdGFnZSA9PT0gVHJvdWJsZXNob290U3RhZ2UuRVhURU5TSU9OUyB8fCBkYXRhLnN0YWdlID09PSBUcm91Ymxlc2hvb3RTdGFnZS5XT1JLQkVOQ0gpXG5cdFx0XHRcdCYmIHR5cGVvZiBkYXRhLnByb2ZpbGUgPT09ICdzdHJpbmcnXG5cdFx0XHQpIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBUcm91YmxlU2hvb3RTdGF0ZShkYXRhLnN0YWdlLCBkYXRhLnByb2ZpbGUpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBzdGFnZTogVHJvdWJsZXNob290U3RhZ2UsXG5cdFx0cmVhZG9ubHkgcHJvZmlsZTogc3RyaW5nLFxuXHQpIHsgfVxufVxuXG5jbGFzcyBUcm91Ymxlc2hvb3RJc3N1ZVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRyb3VibGVzaG9vdElzc3VlU2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHN0YXRpYyByZWFkb25seSBzdG9yYWdlS2V5ID0gJ2lzc3VlVHJvdWJsZXNob290U3RhdGUnO1xuXG5cdHByaXZhdGUgbm90aWZpY2F0aW9uSGFuZGxlOiBJTm90aWZpY2F0aW9uSGFuZGxlIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVzU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZTogSVVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlSW1wb3J0RXhwb3J0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVJbXBvcnRFeHBvcnRTZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uQmlzZWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkJpc2VjdFNlcnZpY2U6IElFeHRlbnNpb25CaXNlY3RTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25FbmFibGVtZW50U2VydmljZTogSVdvcmtiZW5jaEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoSXNzdWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaXNzdWVTZXJ2aWNlOiBJV29ya2JlbmNoSXNzdWVTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0aXNBY3RpdmUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuc3RhdGUgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmlzQWN0aXZlKCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignaW52YWxpZCBzdGF0ZScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCd0cm91Ymxlc2hvb3QgaXNzdWUnLCBcIlRyb3VibGVzaG9vdCBJc3N1ZVwiKSxcblx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2RldGFpbC5zdGFydCcsIFwiSXNzdWUgdHJvdWJsZXNob290aW5nIGlzIGEgcHJvY2VzcyB0byBoZWxwIHlvdSBpZGVudGlmeSB0aGUgY2F1c2UgZm9yIGFuIGlzc3VlLiBUaGUgY2F1c2UgZm9yIGFuIGlzc3VlIGNhbiBiZSBhIG1pc2NvbmZpZ3VyYXRpb24sIGR1ZSB0byBhbiBleHRlbnNpb24sIG9yIGJlIHswfSBpdHNlbGYuXFxuXFxuRHVyaW5nIHRoZSBwcm9jZXNzIHRoZSB3aW5kb3cgcmVsb2FkcyByZXBlYXRlZGx5LiBFYWNoIHRpbWUgeW91IG11c3QgY29uZmlybSBpZiB5b3UgYXJlIHN0aWxsIHNlZWluZyB0aGUgaXNzdWUuXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdtc2cnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZUcm91Ymxlc2hvb3QgSXNzdWVcIiksXG5cdFx0XHRjdXN0b206IHRydWVcblx0XHR9KTtcblxuXHRcdGlmICghcmVzLmNvbmZpcm1lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWdpbmFsUHJvZmlsZSA9IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZTtcblx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZUltcG9ydEV4cG9ydFNlcnZpY2UuY3JlYXRlVHJvdWJsZXNob290UHJvZmlsZSgpO1xuXHRcdHRoaXMuc3RhdGUgPSBuZXcgVHJvdWJsZVNob290U3RhdGUoVHJvdWJsZXNob290U3RhZ2UuRVhURU5TSU9OUywgb3JpZ2luYWxQcm9maWxlLmlkKTtcblx0XHRhd2FpdCB0aGlzLnJlc3VtZSgpO1xuXHR9XG5cblx0YXN5bmMgcmVzdW1lKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pc0FjdGl2ZSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc3RhdGU/LnN0YWdlID09PSBUcm91Ymxlc2hvb3RTdGFnZS5FWFRFTlNJT05TICYmICF0aGlzLmV4dGVuc2lvbkJpc2VjdFNlcnZpY2UuaXNBY3RpdmUpIHtcblx0XHRcdGF3YWl0IHRoaXMucmVwcm9kdWNlSXNzdWVXaXRoRXh0ZW5zaW9uc0Rpc2FibGVkKCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc3RhdGU/LnN0YWdlID09PSBUcm91Ymxlc2hvb3RTdGFnZS5XT1JLQkVOQ0gpIHtcblx0XHRcdGF3YWl0IHRoaXMucmVwcm9kdWNlSXNzdWVXaXRoRW1wdHlQcm9maWxlKCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5zdG9wKCk7XG5cdH1cblxuXHRhc3luYyBzdG9wKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghdGhpcy5pc0FjdGl2ZSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMubm90aWZpY2F0aW9uSGFuZGxlKSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvbkhhbmRsZS5jbG9zZSgpO1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25IYW5kbGUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZXh0ZW5zaW9uQmlzZWN0U2VydmljZS5pc0FjdGl2ZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5leHRlbnNpb25CaXNlY3RTZXJ2aWNlLnJlc2V0KCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvZmlsZSA9IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuZmluZChwID0+IHAuaWQgPT09IHRoaXMuc3RhdGU/LnByb2ZpbGUpID8/IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGU7XG5cdFx0dGhpcy5zdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRhd2FpdCB0aGlzLnVzZXJEYXRhUHJvZmlsZU1hbmFnZW1lbnRTZXJ2aWNlLnN3aXRjaFByb2ZpbGUocHJvZmlsZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlcHJvZHVjZUlzc3VlV2l0aEV4dGVuc2lvbnNEaXNhYmxlZCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIShhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZChFeHRlbnNpb25UeXBlLlVzZXIpKS5sZW5ndGgpIHtcblx0XHRcdHRoaXMuc3RhdGUgPSBuZXcgVHJvdWJsZVNob290U3RhdGUoVHJvdWJsZXNob290U3RhZ2UuV09SS0JFTkNILCB0aGlzLnN0YXRlIS5wcm9maWxlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmFza1RvUmVwcm9kdWNlSXNzdWUobG9jYWxpemUoJ3Byb2ZpbGUuZXh0ZW5zaW9ucy5kaXNhYmxlZCcsIFwiSXNzdWUgdHJvdWJsZXNob290aW5nIGlzIGFjdGl2ZSBhbmQgaGFzIHRlbXBvcmFyaWx5IGRpc2FibGVkIGFsbCBpbnN0YWxsZWQgZXh0ZW5zaW9ucy4gQ2hlY2sgaWYgeW91IGNhbiBzdGlsbCByZXByb2R1Y2UgdGhlIHByb2JsZW0gYW5kIHByb2NlZWQgYnkgc2VsZWN0aW5nIGZyb20gdGhlc2Ugb3B0aW9ucy5cIikpO1xuXHRcdGlmIChyZXN1bHQgPT09ICdnb29kJykge1xuXHRcdFx0Y29uc3QgcHJvZmlsZSA9IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UucHJvZmlsZXMuZmluZChwID0+IHAuaWQgPT09IHRoaXMuc3RhdGUhLnByb2ZpbGUpID8/IHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGU7XG5cdFx0XHRhd2FpdCB0aGlzLnJlcHJvZHVjZUlzc3VlV2l0aEV4dGVuc2lvbnNCaXNlY3QocHJvZmlsZSk7XG5cdFx0fVxuXHRcdGlmIChyZXN1bHQgPT09ICdiYWQnKSB7XG5cdFx0XHR0aGlzLnN0YXRlID0gbmV3IFRyb3VibGVTaG9vdFN0YXRlKFRyb3VibGVzaG9vdFN0YWdlLldPUktCRU5DSCwgdGhpcy5zdGF0ZSEucHJvZmlsZSk7XG5cdFx0fVxuXHRcdGlmIChyZXN1bHQgPT09ICdzdG9wJykge1xuXHRcdFx0YXdhaXQgdGhpcy5zdG9wKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXByb2R1Y2VJc3N1ZVdpdGhFbXB0eVByb2ZpbGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy51c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50U2VydmljZS5jcmVhdGVBbmRFbnRlclRyYW5zaWVudFByb2ZpbGUoKTtcblx0XHR0aGlzLnVwZGF0ZVN0YXRlKHRoaXMuc3RhdGUpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuYXNrVG9SZXByb2R1Y2VJc3N1ZShsb2NhbGl6ZSgnZW1wdHkucHJvZmlsZScsIFwiSXNzdWUgdHJvdWJsZXNob290aW5nIGlzIGFjdGl2ZSBhbmQgaGFzIHRlbXBvcmFyaWx5IHJlc2V0IHlvdXIgY29uZmlndXJhdGlvbnMgdG8gZGVmYXVsdHMuIENoZWNrIGlmIHlvdSBjYW4gc3RpbGwgcmVwcm9kdWNlIHRoZSBwcm9ibGVtIGFuZCBwcm9jZWVkIGJ5IHNlbGVjdGluZyBmcm9tIHRoZXNlIG9wdGlvbnMuXCIpKTtcblx0XHRpZiAocmVzdWx0ID09PSAnc3RvcCcpIHtcblx0XHRcdGF3YWl0IHRoaXMuc3RvcCgpO1xuXHRcdH1cblx0XHRpZiAocmVzdWx0ID09PSAnZ29vZCcpIHtcblx0XHRcdGF3YWl0IHRoaXMuYXNrVG9SZXBvcnRJc3N1ZShsb2NhbGl6ZSgnaXNzdWUgaXMgd2l0aCBjb25maWd1cmF0aW9uJywgXCJJc3N1ZSB0cm91Ymxlc2hvb3RpbmcgaGFzIGlkZW50aWZpZWQgdGhhdCB0aGUgaXNzdWUgaXMgY2F1c2VkIGJ5IHlvdXIgY29uZmlndXJhdGlvbnMuIFBsZWFzZSByZXBvcnQgdGhlIGlzc3VlIGJ5IGV4cG9ydGluZyB5b3VyIGNvbmZpZ3VyYXRpb25zIHVzaW5nIFxcXCJFeHBvcnQgUHJvZmlsZVxcXCIgY29tbWFuZCBhbmQgc2hhcmUgdGhlIGZpbGUgaW4gdGhlIGlzc3VlIHJlcG9ydC5cIikpO1xuXHRcdH1cblx0XHRpZiAocmVzdWx0ID09PSAnYmFkJykge1xuXHRcdFx0YXdhaXQgdGhpcy5hc2tUb1JlcG9ydElzc3VlKGxvY2FsaXplKCdpc3N1ZSBpcyBpbiBjb3JlJywgXCJJc3N1ZSB0cm91Ymxlc2hvb3RpbmcgaGFzIGlkZW50aWZpZWQgdGhhdCB0aGUgaXNzdWUgaXMgd2l0aCB7MH0uXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlcHJvZHVjZUlzc3VlV2l0aEV4dGVuc2lvbnNCaXNlY3QocHJvZmlsZTogSVVzZXJEYXRhUHJvZmlsZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMudXNlckRhdGFQcm9maWxlTWFuYWdlbWVudFNlcnZpY2Uuc3dpdGNoUHJvZmlsZShwcm9maWxlKTtcblx0XHRjb25zdCBleHRlbnNpb25zID0gKGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKEV4dGVuc2lvblR5cGUuVXNlcikpLmZpbHRlcihleHQgPT4gdGhpcy5leHRlbnNpb25FbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoZXh0KSk7XG5cdFx0YXdhaXQgdGhpcy5leHRlbnNpb25CaXNlY3RTZXJ2aWNlLnN0YXJ0KGV4dGVuc2lvbnMpO1xuXHRcdGF3YWl0IHRoaXMuaG9zdFNlcnZpY2UucmVsb2FkKCk7XG5cdH1cblxuXHRwcml2YXRlIGFza1RvUmVwcm9kdWNlSXNzdWUobWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTxUcm91YmxlU2hvb3RSZXN1bHQ+IHtcblx0XHRyZXR1cm4gbmV3IFByb21pc2UoKGMsIGUpID0+IHtcblx0XHRcdGNvbnN0IGdvb2RQcm9tcHQ6IElQcm9tcHRDaG9pY2UgPSB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnSSBjYW5ub3QgcmVwcm9kdWNlJywgXCJJIENhbid0IFJlcHJvZHVjZVwiKSxcblx0XHRcdFx0cnVuOiAoKSA9PiBjKCdnb29kJylcblx0XHRcdH07XG5cdFx0XHRjb25zdCBiYWRQcm9tcHQ6IElQcm9tcHRDaG9pY2UgPSB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnVGhpcyBpcyBCYWQnLCBcIkkgQ2FuIFJlcHJvZHVjZVwiKSxcblx0XHRcdFx0cnVuOiAoKSA9PiBjKCdiYWQnKVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHN0b3A6IElQcm9tcHRDaG9pY2UgPSB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnU3RvcCcsIFwiU3RvcFwiKSxcblx0XHRcdFx0cnVuOiAoKSA9PiBjKCdzdG9wJylcblx0XHRcdH07XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvbkhhbmRsZSA9IHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdFtnb29kUHJvbXB0LCBiYWRQcm9tcHQsIHN0b3BdLFxuXHRcdFx0XHR7IHN0aWNreTogdHJ1ZSwgcHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5LlVSR0VOVCB9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhc2tUb1JlcG9ydElzc3VlKG1lc3NhZ2U6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBpc0NoZWNrZWRJbkluc2lkZXJzID0gZmFsc2U7XG5cdFx0aWYgKHRoaXMucHJvZHVjdFNlcnZpY2UucXVhbGl0eSA9PT0gJ3N0YWJsZScpIHtcblx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuYXNrVG9SZXByb2R1Y2VJc3N1ZVdpdGhJbnNpZGVycygpO1xuXHRcdFx0aWYgKHJlcyA9PT0gJ2dvb2QnKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3Ryb3VibGVzaG9vdCBpc3N1ZScsIFwiVHJvdWJsZXNob290IElzc3VlXCIpLFxuXHRcdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ3VzZSBpbnNpZGVycycsIFwiVGhpcyBsaWtlbHkgbWVhbnMgdGhhdCB0aGUgaXNzdWUgaGFzIGJlZW4gYWRkcmVzc2VkIGFscmVhZHkgYW5kIHdpbGwgYmUgYXZhaWxhYmxlIGluIGFuIHVwY29taW5nIHJlbGVhc2UuIFlvdSBjYW4gc2FmZWx5IHVzZSB7MH0gaW5zaWRlcnMgdW50aWwgdGhlIG5ldyBzdGFibGUgdmVyc2lvbiBpcyBhdmFpbGFibGUuXCIsIHRoaXMucHJvZHVjdFNlcnZpY2UubmFtZUxvbmcpLFxuXHRcdFx0XHRcdGN1c3RvbTogdHJ1ZVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlcyA9PT0gJ3N0b3AnKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc3RvcCgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzID09PSAnYmFkJykge1xuXHRcdFx0XHRpc0NoZWNrZWRJbkluc2lkZXJzID0gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmlzc3VlU2VydmljZS5vcGVuUmVwb3J0ZXIoe1xuXHRcdFx0aXNzdWVCb2R5OiBgPiAke21lc3NhZ2V9ICR7aXNDaGVja2VkSW5JbnNpZGVycyA/IGBJdCBpcyBjb25maXJtZWQgdGhhdCB0aGUgaXNzdWUgZXhpc3RzIGluICR7dGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZ30gSW5zaWRlcnNgIDogJyd9YCxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYXNrVG9SZXByb2R1Y2VJc3N1ZVdpdGhJbnNpZGVycygpOiBQcm9taXNlPFRyb3VibGVTaG9vdFJlc3VsdCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNvbmZpcm1SZXMgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHR0eXBlOiAnaW5mbycsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndHJvdWJsZXNob290IGlzc3VlJywgXCJUcm91Ymxlc2hvb3QgSXNzdWVcIiksXG5cdFx0XHRwcmltYXJ5QnV0dG9uOiBsb2NhbGl6ZSgnZG93bmxvYWQgaW5zaWRlcnMnLCBcIkRvd25sb2FkIHswfSBJbnNpZGVyc1wiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKSxcblx0XHRcdGNhbmNlbEJ1dHRvbjogbG9jYWxpemUoJ3JlcG9ydCBhbnl3YXknLCBcIlJlcG9ydCBJc3N1ZSBBbnl3YXlcIiksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdhc2sgdG8gZG93bmxvYWQgaW5zaWRlcnMnLCBcIlBsZWFzZSB0cnkgdG8gZG93bmxvYWQgYW5kIHJlcHJvZHVjZSB0aGUgaXNzdWUgaW4gezB9IGluc2lkZXJzLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKSxcblx0XHRcdGN1c3RvbToge1xuXHRcdFx0XHRkaXNhYmxlQ2xvc2VBY3Rpb246IHRydWUsXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoIWNvbmZpcm1SZXMuY29uZmlybWVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9wZW5lZCA9IGF3YWl0IHRoaXMub3BlbmVyU2VydmljZS5vcGVuKFVSSS5wYXJzZSgnaHR0cHM6Ly9ha2EubXMvdnNjb2RlLWluc2lkZXJzJykpO1xuXHRcdGlmICghb3BlbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQ8VHJvdWJsZVNob290UmVzdWx0Pih7XG5cdFx0XHR0eXBlOiAnaW5mbycsXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndHJvdWJsZXNob290IGlzc3VlJywgXCJUcm91Ymxlc2hvb3QgSXNzdWVcIiksXG5cdFx0XHRidXR0b25zOiBbe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2dvb2QnLCBcIkkgY2FuJ3QgcmVwcm9kdWNlXCIpLFxuXHRcdFx0XHRydW46ICgpID0+ICdnb29kJ1xuXHRcdFx0fSwge1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2JhZCcsIFwiSSBjYW4gcmVwcm9kdWNlXCIpLFxuXHRcdFx0XHRydW46ICgpID0+ICdiYWQnXG5cdFx0XHR9XSxcblx0XHRcdGNhbmNlbEJ1dHRvbjoge1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3N0b3AnLCBcIlN0b3BcIiksXG5cdFx0XHRcdHJ1bjogKCkgPT4gJ3N0b3AnXG5cdFx0XHR9LFxuXHRcdFx0ZGV0YWlsOiBsb2NhbGl6ZSgnYXNrIHRvIHJlcHJvZHVjZSBpc3N1ZScsIFwiUGxlYXNlIHRyeSB0byByZXByb2R1Y2UgdGhlIGlzc3VlIGluIHswfSBpbnNpZGVycyBhbmQgY29uZmlybSBpZiB0aGUgaXNzdWUgZXhpc3RzIHRoZXJlLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKSxcblx0XHRcdGN1c3RvbToge1xuXHRcdFx0XHRkaXNhYmxlQ2xvc2VBY3Rpb246IHRydWUsXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcmVzLnJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX3N0YXRlOiBUcm91YmxlU2hvb3RTdGF0ZSB8IHVuZGVmaW5lZCB8IG51bGw7XG5cdGdldCBzdGF0ZSgpOiBUcm91YmxlU2hvb3RTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHJhdyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KFRyb3VibGVzaG9vdElzc3VlU2VydmljZS5zdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0XHR0aGlzLl9zdGF0ZSA9IFRyb3VibGVTaG9vdFN0YXRlLmZyb21KU09OKHJhdyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9zdGF0ZSB8fCB1bmRlZmluZWQ7XG5cdH1cblxuXHRzZXQgc3RhdGUoc3RhdGU6IFRyb3VibGVTaG9vdFN0YXRlIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fc3RhdGUgPSBzdGF0ZSA/PyBudWxsO1xuXHRcdHRoaXMudXBkYXRlU3RhdGUoc3RhdGUpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTdGF0ZShzdGF0ZTogVHJvdWJsZVNob290U3RhdGUgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoVHJvdWJsZXNob290SXNzdWVTZXJ2aWNlLnN0b3JhZ2VLZXksIEpTT04uc3RyaW5naWZ5KHN0YXRlKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2UucmVtb3ZlKFRyb3VibGVzaG9vdElzc3VlU2VydmljZS5zdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuUFJPRklMRSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIElzc3VlVHJvdWJsZXNob290VWkgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRzdGF0aWMgY3R4SXNUcm91Ymxlc2hvb3RBY3RpdmUgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignaXNJc3N1ZVRyb3VibGVzaG9vdEFjdGl2ZScsIGZhbHNlKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVRyb3VibGVzaG9vdElzc3VlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRyb3VibGVzaG9vdElzc3VlU2VydmljZTogSVRyb3VibGVzaG9vdElzc3VlU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy51cGRhdGVDb250ZXh0KCk7XG5cdFx0aWYgKHRyb3VibGVzaG9vdElzc3VlU2VydmljZS5pc0FjdGl2ZSgpKSB7XG5cdFx0XHR0cm91Ymxlc2hvb3RJc3N1ZVNlcnZpY2UucmVzdW1lKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHN0b3JhZ2VTZXJ2aWNlLm9uRGlkQ2hhbmdlVmFsdWUoU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFRyb3VibGVzaG9vdElzc3VlU2VydmljZS5zdG9yYWdlS2V5LCB0aGlzLl9zdG9yZSkoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVDb250ZXh0KCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb250ZXh0KCk6IHZvaWQge1xuXHRcdElzc3VlVHJvdWJsZXNob290VWkuY3R4SXNUcm91Ymxlc2hvb3RBY3RpdmUuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpLnNldCh0aGlzLnRyb3VibGVzaG9vdElzc3VlU2VydmljZS5pc0FjdGl2ZSgpKTtcblx0fVxuXG59XG5cblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KEV4dGVuc2lvbnMuV29ya2JlbmNoKS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihJc3N1ZVRyb3VibGVzaG9vdFVpLCBMaWZlY3ljbGVQaGFzZS5SZXN0b3JlZCk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUcm91Ymxlc2hvb3RJc3N1ZUFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udHJvdWJsZXNob290SXNzdWUuc3RhcnQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndHJvdWJsZXNob290SXNzdWUnLCAnVHJvdWJsZXNob290IElzc3VlLi4uJyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5IZWxwLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChJc3N1ZVRyb3VibGVzaG9vdFVpLmN0eElzVHJvdWJsZXNob290QWN0aXZlLm5lZ2F0ZSgpLCBSZW1vdGVOYW1lQ29udGV4dC5pc0VxdWFsVG8oJycpLCBJc1dlYkNvbnRleHQubmVnYXRlKCkpLFxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVRyb3VibGVzaG9vdElzc3VlU2VydmljZSkuc3RhcnQoKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24udHJvdWJsZXNob290SXNzdWUuc3RvcCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0aXRsZS5zdG9wJywgJ1N0b3AgVHJvdWJsZXNob290IElzc3VlJyksXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5IZWxwLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IElzc3VlVHJvdWJsZXNob290VWkuY3R4SXNUcm91Ymxlc2hvb3RBY3RpdmVcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBhY2Nlc3Nvci5nZXQoSVRyb3VibGVzaG9vdElzc3VlU2VydmljZSkuc3RvcCgpO1xuXHR9XG59KTtcblxuXG5yZWdpc3RlclNpbmdsZXRvbihJVHJvdWJsZXNob290SXNzdWVTZXJ2aWNlLCBUcm91Ymxlc2hvb3RJc3N1ZVNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyx1QkFBdUI7QUFDekMsU0FBUyxxQ0FBcUMsbUNBQW1DLCtCQUErQjtBQUNoSCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtCQUErQjtBQUN4QyxTQUE4QixzQkFBcUMsc0JBQXNCLGdCQUFnQjtBQUN6RyxTQUFTLDRDQUE0QztBQUNyRCxTQUFTLG9CQUFvQjtBQUM3QixTQUEyQixnQ0FBZ0M7QUFDM0QsU0FBMkIsdUJBQXVCO0FBQ2xELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLGdCQUFnQixvQkFBb0IscUJBQXFCO0FBQ2xFLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0JBQW1EO0FBQzVELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsV0FBVztBQUNwQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG9CQUFvQjtBQUU3QixNQUFNLDRCQUE0QixnQkFBMkMsMkJBQTJCO0FBVXhHLElBQUssb0JBQUwsa0JBQUtBLHVCQUFMO0FBQ0MsRUFBQUEsc0NBQUEsZ0JBQWEsS0FBYjtBQUNBLEVBQUFBLHNDQUFBO0FBRkksU0FBQUE7QUFBQSxHQUFBO0FBT0wsTUFBTSxrQkFBa0I7QUFBQSxFQW1CdkIsWUFDVSxPQUNBLFNBQ1I7QUFGUTtBQUNBO0FBQUEsRUFDTjtBQUFBLEVBcEJKLE9BQU8sU0FBUyxLQUF3RDtBQUN2RSxRQUFJLENBQUMsS0FBSztBQUNULGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSTtBQUVILFlBQU0sT0FBWSxLQUFLLE1BQU0sR0FBRztBQUNoQyxXQUNFLEtBQUssVUFBVSxzQkFBZ0MsS0FBSyxVQUFVLHNCQUM1RCxPQUFPLEtBQUssWUFBWSxVQUMxQjtBQUNELGVBQU8sSUFBSSxrQkFBa0IsS0FBSyxPQUFPLEtBQUssT0FBTztBQUFBLE1BQ3REO0FBQUEsSUFDRCxRQUFRO0FBQUEsSUFBZTtBQUN2QixXQUFPO0FBQUEsRUFDUjtBQU1EO0FBRUEsSUFBTSwyQkFBTixjQUF1QyxXQUFnRDtBQUFBLEVBUXRGLFlBQzJDLHdCQUNDLHlCQUNTLGtDQUNFLG9DQUNyQixlQUNTLHdCQUNILHFCQUNPLDRCQUNTLDRCQUNkLGNBQ1AsZ0JBQ0gsYUFDRyxnQkFDRCxlQUNoQztBQUNELFVBQU07QUFmb0M7QUFDQztBQUNTO0FBQ0U7QUFDckI7QUFDUztBQUNIO0FBQ087QUFDUztBQUNkO0FBQ1A7QUFDSDtBQUNHO0FBQ0Q7QUFBQSxFQUdsQztBQUFBLEVBRUEsV0FBb0I7QUFDbkIsV0FBTyxLQUFLLFVBQVU7QUFBQSxFQUN2QjtBQUFBLEVBRUEsTUFBTSxRQUF1QjtBQUM1QixRQUFJLEtBQUssU0FBUyxHQUFHO0FBQ3BCLFlBQU0sSUFBSSxNQUFNLGVBQWU7QUFBQSxJQUNoQztBQUVBLFVBQU0sTUFBTSxNQUFNLEtBQUssY0FBYyxRQUFRO0FBQUEsTUFDNUMsU0FBUyxTQUFTLHNCQUFzQixvQkFBb0I7QUFBQSxNQUM1RCxRQUFRLFNBQVMsZ0JBQWdCLCtSQUErUixLQUFLLGVBQWUsUUFBUTtBQUFBLE1BQzVWLGVBQWUsU0FBUyxFQUFFLEtBQUssT0FBTyxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxzQkFBc0I7QUFBQSxNQUNsRyxRQUFRO0FBQUEsSUFDVCxDQUFDO0FBRUQsUUFBSSxDQUFDLElBQUksV0FBVztBQUNuQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGtCQUFrQixLQUFLLHVCQUF1QjtBQUNwRCxVQUFNLEtBQUssbUNBQW1DLDBCQUEwQjtBQUN4RSxTQUFLLFFBQVEsSUFBSSxrQkFBa0Isb0JBQThCLGdCQUFnQixFQUFFO0FBQ25GLFVBQU0sS0FBSyxPQUFPO0FBQUEsRUFDbkI7QUFBQSxFQUVBLE1BQU0sU0FBd0I7QUFDN0IsUUFBSSxDQUFDLEtBQUssU0FBUyxHQUFHO0FBQ3JCO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxPQUFPLFVBQVUsc0JBQWdDLENBQUMsS0FBSyx1QkFBdUIsVUFBVTtBQUNoRyxZQUFNLEtBQUsscUNBQXFDO0FBQUEsSUFDakQ7QUFFQSxRQUFJLEtBQUssT0FBTyxVQUFVLG1CQUE2QjtBQUN0RCxZQUFNLEtBQUssK0JBQStCO0FBQUEsSUFDM0M7QUFFQSxVQUFNLEtBQUssS0FBSztBQUFBLEVBQ2pCO0FBQUEsRUFFQSxNQUFNLE9BQXNCO0FBQzNCLFFBQUksQ0FBQyxLQUFLLFNBQVMsR0FBRztBQUNyQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssb0JBQW9CO0FBQzVCLFdBQUssbUJBQW1CLE1BQU07QUFDOUIsV0FBSyxxQkFBcUI7QUFBQSxJQUMzQjtBQUVBLFFBQUksS0FBSyx1QkFBdUIsVUFBVTtBQUN6QyxZQUFNLEtBQUssdUJBQXVCLE1BQU07QUFBQSxJQUN6QztBQUVBLFVBQU0sVUFBVSxLQUFLLHdCQUF3QixTQUFTLEtBQUssT0FBSyxFQUFFLE9BQU8sS0FBSyxPQUFPLE9BQU8sS0FBSyxLQUFLLHdCQUF3QjtBQUM5SCxTQUFLLFFBQVE7QUFDYixVQUFNLEtBQUssaUNBQWlDLGNBQWMsT0FBTztBQUFBLEVBQ2xFO0FBQUEsRUFFQSxNQUFjLHVDQUFzRDtBQUNuRSxRQUFJLEVBQUUsTUFBTSxLQUFLLDJCQUEyQixhQUFhLGNBQWMsSUFBSSxHQUFHLFFBQVE7QUFDckYsV0FBSyxRQUFRLElBQUksa0JBQWtCLG1CQUE2QixLQUFLLE1BQU8sT0FBTztBQUNuRjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFNBQVMsTUFBTSxLQUFLLG9CQUFvQixTQUFTLCtCQUErQixrTEFBa0wsQ0FBQztBQUN6USxRQUFJLFdBQVcsUUFBUTtBQUN0QixZQUFNLFVBQVUsS0FBSyx3QkFBd0IsU0FBUyxLQUFLLE9BQUssRUFBRSxPQUFPLEtBQUssTUFBTyxPQUFPLEtBQUssS0FBSyx3QkFBd0I7QUFDOUgsWUFBTSxLQUFLLG1DQUFtQyxPQUFPO0FBQUEsSUFDdEQ7QUFDQSxRQUFJLFdBQVcsT0FBTztBQUNyQixXQUFLLFFBQVEsSUFBSSxrQkFBa0IsbUJBQTZCLEtBQUssTUFBTyxPQUFPO0FBQUEsSUFDcEY7QUFDQSxRQUFJLFdBQVcsUUFBUTtBQUN0QixZQUFNLEtBQUssS0FBSztBQUFBLElBQ2pCO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxpQ0FBZ0Q7QUFDN0QsVUFBTSxLQUFLLGlDQUFpQywrQkFBK0I7QUFDM0UsU0FBSyxZQUFZLEtBQUssS0FBSztBQUMzQixVQUFNLFNBQVMsTUFBTSxLQUFLLG9CQUFvQixTQUFTLGlCQUFpQixzTEFBc0wsQ0FBQztBQUMvUCxRQUFJLFdBQVcsUUFBUTtBQUN0QixZQUFNLEtBQUssS0FBSztBQUFBLElBQ2pCO0FBQ0EsUUFBSSxXQUFXLFFBQVE7QUFDdEIsWUFBTSxLQUFLLGlCQUFpQixTQUFTLCtCQUErQix1TkFBeU4sQ0FBQztBQUFBLElBQy9SO0FBQ0EsUUFBSSxXQUFXLE9BQU87QUFDckIsWUFBTSxLQUFLLGlCQUFpQixTQUFTLG9CQUFvQixvRUFBb0UsS0FBSyxlQUFlLFFBQVEsQ0FBQztBQUFBLElBQzNKO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxtQ0FBbUMsU0FBMEM7QUFDMUYsVUFBTSxLQUFLLGlDQUFpQyxjQUFjLE9BQU87QUFDakUsVUFBTSxjQUFjLE1BQU0sS0FBSywyQkFBMkIsYUFBYSxjQUFjLElBQUksR0FBRyxPQUFPLFNBQU8sS0FBSywyQkFBMkIsVUFBVSxHQUFHLENBQUM7QUFDeEosVUFBTSxLQUFLLHVCQUF1QixNQUFNLFVBQVU7QUFDbEQsVUFBTSxLQUFLLFlBQVksT0FBTztBQUFBLEVBQy9CO0FBQUEsRUFFUSxvQkFBb0IsU0FBOEM7QUFDekUsV0FBTyxJQUFJLFFBQVEsQ0FBQyxHQUFHLE1BQU07QUFDNUIsWUFBTSxhQUE0QjtBQUFBLFFBQ2pDLE9BQU8sU0FBUyxzQkFBc0IsbUJBQW1CO0FBQUEsUUFDekQsS0FBSyxNQUFNLEVBQUUsTUFBTTtBQUFBLE1BQ3BCO0FBQ0EsWUFBTSxZQUEyQjtBQUFBLFFBQ2hDLE9BQU8sU0FBUyxlQUFlLGlCQUFpQjtBQUFBLFFBQ2hELEtBQUssTUFBTSxFQUFFLEtBQUs7QUFBQSxNQUNuQjtBQUNBLFlBQU0sT0FBc0I7QUFBQSxRQUMzQixPQUFPLFNBQVMsUUFBUSxNQUFNO0FBQUEsUUFDOUIsS0FBSyxNQUFNLEVBQUUsTUFBTTtBQUFBLE1BQ3BCO0FBQ0EsV0FBSyxxQkFBcUIsS0FBSyxvQkFBb0I7QUFBQSxRQUNsRCxTQUFTO0FBQUEsUUFDVDtBQUFBLFFBQ0EsQ0FBQyxZQUFZLFdBQVcsSUFBSTtBQUFBLFFBQzVCLEVBQUUsUUFBUSxNQUFNLFVBQVUscUJBQXFCLE9BQU87QUFBQSxNQUN2RDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsaUJBQWlCLFNBQWdDO0FBQzlELFFBQUksc0JBQXNCO0FBQzFCLFFBQUksS0FBSyxlQUFlLFlBQVksVUFBVTtBQUM3QyxZQUFNLE1BQU0sTUFBTSxLQUFLLGdDQUFnQztBQUN2RCxVQUFJLFFBQVEsUUFBUTtBQUNuQixjQUFNLEtBQUssY0FBYyxPQUFPO0FBQUEsVUFDL0IsTUFBTSxTQUFTO0FBQUEsVUFDZixTQUFTLFNBQVMsc0JBQXNCLG9CQUFvQjtBQUFBLFVBQzVELFFBQVEsU0FBUyxnQkFBZ0Isd0xBQXdMLEtBQUssZUFBZSxRQUFRO0FBQUEsVUFDclAsUUFBUTtBQUFBLFFBQ1QsQ0FBQztBQUNEO0FBQUEsTUFDRDtBQUNBLFVBQUksUUFBUSxRQUFRO0FBQ25CLGNBQU0sS0FBSyxLQUFLO0FBQ2hCO0FBQUEsTUFDRDtBQUNBLFVBQUksUUFBUSxPQUFPO0FBQ2xCLDhCQUFzQjtBQUFBLE1BQ3ZCO0FBQUEsSUFDRDtBQUVBLFVBQU0sS0FBSyxhQUFhLGFBQWE7QUFBQSxNQUNwQyxXQUFXLEtBQUssT0FBTyxJQUFJLHNCQUFzQiw0Q0FBNEMsS0FBSyxlQUFlLFFBQVEsY0FBYyxFQUFFO0FBQUEsSUFDMUksQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVBLE1BQWMsa0NBQTJFO0FBQ3hGLFVBQU0sYUFBYSxNQUFNLEtBQUssY0FBYyxRQUFRO0FBQUEsTUFDbkQsTUFBTTtBQUFBLE1BQ04sU0FBUyxTQUFTLHNCQUFzQixvQkFBb0I7QUFBQSxNQUM1RCxlQUFlLFNBQVMscUJBQXFCLHlCQUF5QixLQUFLLGVBQWUsUUFBUTtBQUFBLE1BQ2xHLGNBQWMsU0FBUyxpQkFBaUIscUJBQXFCO0FBQUEsTUFDN0QsUUFBUSxTQUFTLDRCQUE0QixtRUFBbUUsS0FBSyxlQUFlLFFBQVE7QUFBQSxNQUM1SSxRQUFRO0FBQUEsUUFDUCxvQkFBb0I7QUFBQSxNQUNyQjtBQUFBLElBQ0QsQ0FBQztBQUVELFFBQUksQ0FBQyxXQUFXLFdBQVc7QUFDMUIsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFNBQVMsTUFBTSxLQUFLLGNBQWMsS0FBSyxJQUFJLE1BQU0sZ0NBQWdDLENBQUM7QUFDeEYsUUFBSSxDQUFDLFFBQVE7QUFDWixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sTUFBTSxNQUFNLEtBQUssY0FBYyxPQUEyQjtBQUFBLE1BQy9ELE1BQU07QUFBQSxNQUNOLFNBQVMsU0FBUyxzQkFBc0Isb0JBQW9CO0FBQUEsTUFDNUQsU0FBUyxDQUFDO0FBQUEsUUFDVCxPQUFPLFNBQVMsUUFBUSxtQkFBbUI7QUFBQSxRQUMzQyxLQUFLLE1BQU07QUFBQSxNQUNaLEdBQUc7QUFBQSxRQUNGLE9BQU8sU0FBUyxPQUFPLGlCQUFpQjtBQUFBLFFBQ3hDLEtBQUssTUFBTTtBQUFBLE1BQ1osQ0FBQztBQUFBLE1BQ0QsY0FBYztBQUFBLFFBQ2IsT0FBTyxTQUFTLFFBQVEsTUFBTTtBQUFBLFFBQzlCLEtBQUssTUFBTTtBQUFBLE1BQ1o7QUFBQSxNQUNBLFFBQVEsU0FBUywwQkFBMEIsNEZBQTRGLEtBQUssZUFBZSxRQUFRO0FBQUEsTUFDbkssUUFBUTtBQUFBLFFBQ1Asb0JBQW9CO0FBQUEsTUFDckI7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPLElBQUk7QUFBQSxFQUNaO0FBQUEsRUFHQSxJQUFJLFFBQXVDO0FBQzFDLFFBQUksS0FBSyxXQUFXLFFBQVc7QUFDOUIsWUFBTSxNQUFNLEtBQUssZUFBZSxJQUFJLHlCQUF5QixZQUFZLGFBQWEsT0FBTztBQUM3RixXQUFLLFNBQVMsa0JBQWtCLFNBQVMsR0FBRztBQUFBLElBQzdDO0FBQ0EsV0FBTyxLQUFLLFVBQVU7QUFBQSxFQUN2QjtBQUFBLEVBRUEsSUFBSSxNQUFNLE9BQXNDO0FBQy9DLFNBQUssU0FBUyxTQUFTO0FBQ3ZCLFNBQUssWUFBWSxLQUFLO0FBQUEsRUFDdkI7QUFBQSxFQUVRLFlBQVksT0FBc0M7QUFDekQsUUFBSSxPQUFPO0FBQ1YsV0FBSyxlQUFlLE1BQU0seUJBQXlCLFlBQVksS0FBSyxVQUFVLEtBQUssR0FBRyxhQUFhLFNBQVMsY0FBYyxPQUFPO0FBQUEsSUFDbEksT0FBTztBQUNOLFdBQUssZUFBZSxPQUFPLHlCQUF5QixZQUFZLGFBQWEsT0FBTztBQUFBLElBQ3JGO0FBQUEsRUFDRDtBQUNEO0FBcFBNLHlCQUlXLGFBQWE7QUFKeEIsMkJBQU47QUFBQSxFQVNHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBdEJHO0FBc1BOLElBQU0sc0JBQU4sY0FBa0MsV0FBVztBQUFBLEVBSTVDLFlBQ3NDLG1CQUNPLDBCQUMzQixnQkFDaEI7QUFDRCxVQUFNO0FBSitCO0FBQ087QUFJNUMsU0FBSyxjQUFjO0FBQ25CLFFBQUkseUJBQXlCLFNBQVMsR0FBRztBQUN4QywrQkFBeUIsT0FBTztBQUFBLElBQ2pDO0FBQ0EsU0FBSyxVQUFVLGVBQWUsaUJBQWlCLGFBQWEsU0FBUyx5QkFBeUIsWUFBWSxLQUFLLE1BQU0sRUFBRSxNQUFNO0FBQzVILFdBQUssY0FBYztBQUFBLElBQ3BCLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLGdCQUFzQjtBQUM3Qix3QkFBb0Isd0JBQXdCLE9BQU8sS0FBSyxpQkFBaUIsRUFBRSxJQUFJLEtBQUsseUJBQXlCLFNBQVMsQ0FBQztBQUFBLEVBQ3hIO0FBRUQ7QUF2Qk0sb0JBRUUsMEJBQTBCLElBQUksY0FBdUIsNkJBQTZCLEtBQUs7QUFGekYsc0JBQU47QUFBQSxFQUtHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBHO0FBeUJOLFNBQVMsR0FBb0MsV0FBVyxTQUFTLEVBQUUsOEJBQThCLHFCQUFxQixlQUFlLFFBQVE7QUFFN0ksZ0JBQWdCLE1BQU0sZ0NBQWdDLFFBQVE7QUFBQSxFQUM3RCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLHFCQUFxQix1QkFBdUI7QUFBQSxNQUM3RCxVQUFVLFdBQVc7QUFBQSxNQUNyQixJQUFJO0FBQUEsTUFDSixjQUFjLGVBQWUsSUFBSSxvQkFBb0Isd0JBQXdCLE9BQU8sR0FBRyxrQkFBa0IsVUFBVSxFQUFFLEdBQUcsYUFBYSxPQUFPLENBQUM7QUFBQSxJQUM5SSxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBQ0EsSUFBSSxVQUEyQztBQUM5QyxXQUFPLFNBQVMsSUFBSSx5QkFBeUIsRUFBRSxNQUFNO0FBQUEsRUFDdEQ7QUFDRCxDQUFDO0FBRUQsZ0JBQWdCLGNBQWMsUUFBUTtBQUFBLEVBQ3JDLGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsY0FBYyx5QkFBeUI7QUFBQSxNQUN4RCxVQUFVLFdBQVc7QUFBQSxNQUNyQixJQUFJO0FBQUEsTUFDSixjQUFjLG9CQUFvQjtBQUFBLElBQ25DLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFNLElBQUksVUFBMkM7QUFDcEQsV0FBTyxTQUFTLElBQUkseUJBQXlCLEVBQUUsS0FBSztBQUFBLEVBQ3JEO0FBQ0QsQ0FBQztBQUdELGtCQUFrQiwyQkFBMkIsMEJBQTBCLGtCQUFrQixPQUFPOyIsCiAgIm5hbWVzIjogWyJUcm91Ymxlc2hvb3RTdGFnZSJdCn0K
