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
import { localize } from "../../../../nls.js";
import { IWorkingCopyBackupService } from "../common/workingCopyBackup.js";
import { IFilesConfigurationService, AutoSaveMode } from "../../filesConfiguration/common/filesConfigurationService.js";
import { IWorkingCopyService } from "../common/workingCopyService.js";
import { WorkingCopyCapabilities } from "../common/workingCopy.js";
import { ILifecycleService, ShutdownReason } from "../../lifecycle/common/lifecycle.js";
import { ConfirmResult, IFileDialogService, IDialogService, getFileNamesMessage } from "../../../../platform/dialogs/common/dialogs.js";
import { WorkbenchState, IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { HotExitConfiguration } from "../../../../platform/files/common/files.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { WorkingCopyBackupTracker } from "../common/workingCopyBackupTracker.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { SaveReason } from "../../../common/editor.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { Promises, raceCancellation } from "../../../../base/common/async.js";
import { IWorkingCopyEditorService } from "../common/workingCopyEditorService.js";
let NativeWorkingCopyBackupTracker = class extends WorkingCopyBackupTracker {
  constructor(workingCopyBackupService, filesConfigurationService, workingCopyService, lifecycleService, fileDialogService, dialogService, contextService, nativeHostService, logService, environmentService, progressService, workingCopyEditorService, editorService) {
    super(workingCopyBackupService, workingCopyService, logService, lifecycleService, filesConfigurationService, workingCopyEditorService, editorService);
    this.fileDialogService = fileDialogService;
    this.dialogService = dialogService;
    this.contextService = contextService;
    this.nativeHostService = nativeHostService;
    this.environmentService = environmentService;
    this.progressService = progressService;
  }
  async onFinalBeforeShutdown(reason) {
    this.cancelBackupOperations();
    const { resume } = this.suspendBackupOperations();
    try {
      const modifiedWorkingCopies = this.workingCopyService.modifiedWorkingCopies;
      if (modifiedWorkingCopies.length) {
        return await this.onBeforeShutdownWithModified(reason, modifiedWorkingCopies);
      } else {
        return await this.onBeforeShutdownWithoutModified();
      }
    } finally {
      resume();
    }
  }
  async onBeforeShutdownWithModified(reason, modifiedWorkingCopies) {
    const workingCopiesToAutoSave = modifiedWorkingCopies.filter((wc) => !(wc.capabilities & WorkingCopyCapabilities.Untitled) && this.filesConfigurationService.getAutoSaveMode(wc.resource).mode !== AutoSaveMode.OFF);
    if (workingCopiesToAutoSave.length > 0) {
      try {
        await this.doSaveAllBeforeShutdown(workingCopiesToAutoSave, SaveReason.AUTO);
      } catch (error) {
        this.logService.error(`[backup tracker] error saving modified working copies: ${error}`);
      }
      const remainingModifiedWorkingCopies = this.workingCopyService.modifiedWorkingCopies;
      if (remainingModifiedWorkingCopies.length) {
        return this.handleModifiedBeforeShutdown(remainingModifiedWorkingCopies, reason);
      }
      return this.noVeto([...modifiedWorkingCopies]);
    }
    return this.handleModifiedBeforeShutdown(modifiedWorkingCopies, reason);
  }
  async handleModifiedBeforeShutdown(modifiedWorkingCopies, reason) {
    let backups = [];
    let backupError = void 0;
    const modifiedWorkingCopiesToBackup = await this.shouldBackupBeforeShutdown(reason, modifiedWorkingCopies);
    if (modifiedWorkingCopiesToBackup.length > 0) {
      try {
        const backupResult = await this.backupBeforeShutdown(modifiedWorkingCopiesToBackup);
        backups = backupResult.backups;
        backupError = backupResult.error;
        if (backups.length === modifiedWorkingCopies.length) {
          return false;
        }
      } catch (error) {
        backupError = error;
      }
    }
    const remainingModifiedWorkingCopies = modifiedWorkingCopies.filter((workingCopy) => !backups.includes(workingCopy));
    if (backupError) {
      if (this.environmentService.isExtensionDevelopment) {
        this.logService.error(`[backup tracker] error creating backups: ${backupError}`);
        return false;
      }
      return this.showErrorDialog(localize("backupTrackerBackupFailed", "The following editors with unsaved changes could not be saved to the backup location."), remainingModifiedWorkingCopies, backupError, reason);
    }
    try {
      return await this.confirmBeforeShutdown(remainingModifiedWorkingCopies);
    } catch (error) {
      if (this.environmentService.isExtensionDevelopment) {
        this.logService.error(`[backup tracker] error saving or reverting modified working copies: ${error}`);
        return false;
      }
      return this.showErrorDialog(localize("backupTrackerConfirmFailed", "The following editors with unsaved changes could not be saved or reverted."), remainingModifiedWorkingCopies, error, reason);
    }
  }
  async shouldBackupBeforeShutdown(reason, modifiedWorkingCopies) {
    if (!this.filesConfigurationService.isHotExitEnabled) {
      return [];
    }
    if (this.environmentService.isExtensionDevelopment) {
      return modifiedWorkingCopies;
    }
    switch (reason) {
      // Window Close
      case ShutdownReason.CLOSE:
        if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.filesConfigurationService.hotExitConfiguration === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
          return modifiedWorkingCopies;
        }
        if (isMacintosh || await this.nativeHostService.getWindowCount() > 1) {
          if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
            return modifiedWorkingCopies.filter((modifiedWorkingCopy) => modifiedWorkingCopy.capabilities & WorkingCopyCapabilities.Scratchpad);
          }
          return [];
        }
        return modifiedWorkingCopies;
      // backup if last window is closed on win/linux where the application quits right after
      // Application Quit
      case ShutdownReason.QUIT:
        return modifiedWorkingCopies;
      // backup because next start we restore all backups
      // Window Reload
      case ShutdownReason.RELOAD:
        return modifiedWorkingCopies;
      // backup because after window reload, backups restore
      // Workspace Change
      case ShutdownReason.LOAD:
        if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY) {
          if (this.filesConfigurationService.hotExitConfiguration === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
            return modifiedWorkingCopies;
          }
          return modifiedWorkingCopies.filter((modifiedWorkingCopy) => modifiedWorkingCopy.capabilities & WorkingCopyCapabilities.Scratchpad);
        }
        return [];
    }
  }
  async showErrorDialog(message, workingCopies, error, reason) {
    this.logService.error(`[backup tracker] ${message}: ${error}`);
    const modifiedWorkingCopies = workingCopies.filter((workingCopy) => workingCopy.isModified());
    const advice = localize("backupErrorDetails", "Try saving or reverting the editors with unsaved changes first and then try again.");
    const detail = modifiedWorkingCopies.length ? `${getFileNamesMessage(modifiedWorkingCopies.map((x) => x.name))}
${advice}` : advice;
    const { result } = await this.dialogService.prompt({
      type: "error",
      message,
      detail,
      buttons: [
        {
          label: localize({ key: "ok", comment: ["&& denotes a mnemonic"] }, "&&OK"),
          run: () => true
          // veto
        },
        {
          label: this.toForceShutdownLabel(reason),
          run: () => false
          // no veto
        }
      ]
    });
    return result ?? true;
  }
  toForceShutdownLabel(reason) {
    switch (reason) {
      case ShutdownReason.CLOSE:
      case ShutdownReason.LOAD:
        return localize("shutdownForceClose", "Close Anyway");
      case ShutdownReason.QUIT:
        return localize("shutdownForceQuit", "Quit Anyway");
      case ShutdownReason.RELOAD:
        return localize("shutdownForceReload", "Reload Anyway");
    }
  }
  async backupBeforeShutdown(modifiedWorkingCopies) {
    const backups = [];
    let error = void 0;
    await this.withProgressAndCancellation(
      async (token) => {
        try {
          await Promises.settled(modifiedWorkingCopies.map(async (workingCopy) => {
            const contentVersion = this.getContentVersion(workingCopy);
            if (this.workingCopyBackupService.hasBackupSync(workingCopy, contentVersion)) {
              backups.push(workingCopy);
            } else {
              const backup = await workingCopy.backup(token);
              if (token.isCancellationRequested) {
                return;
              }
              await this.workingCopyBackupService.backup(workingCopy, backup.content, contentVersion, backup.meta, token);
              if (token.isCancellationRequested) {
                return;
              }
              backups.push(workingCopy);
            }
          }));
        } catch (backupError) {
          error = backupError;
        }
      },
      localize("backupBeforeShutdownMessage", "Backing up editors with unsaved changes is taking a bit longer..."),
      localize("backupBeforeShutdownDetail", "Click 'Cancel' to stop waiting and to save or revert editors with unsaved changes.")
    );
    return { backups, error };
  }
  async confirmBeforeShutdown(modifiedWorkingCopies) {
    const confirm = await this.fileDialogService.showSaveConfirm(modifiedWorkingCopies.map((workingCopy) => workingCopy.name));
    if (confirm === ConfirmResult.SAVE) {
      const modifiedCountBeforeSave = this.workingCopyService.modifiedCount;
      try {
        await this.doSaveAllBeforeShutdown(modifiedWorkingCopies, SaveReason.EXPLICIT);
      } catch (error) {
        this.logService.error(`[backup tracker] error saving modified working copies: ${error}`);
      }
      const savedWorkingCopies = modifiedCountBeforeSave - this.workingCopyService.modifiedCount;
      if (savedWorkingCopies < modifiedWorkingCopies.length) {
        return true;
      }
      return this.noVeto(modifiedWorkingCopies);
    } else if (confirm === ConfirmResult.DONT_SAVE) {
      try {
        await this.doRevertAllBeforeShutdown(modifiedWorkingCopies);
      } catch (error) {
        this.logService.error(`[backup tracker] error reverting modified working copies: ${error}`);
      }
      return this.noVeto(modifiedWorkingCopies);
    }
    return true;
  }
  doSaveAllBeforeShutdown(workingCopies, reason) {
    return this.withProgressAndCancellation(
      async () => {
        const saveOptions = { skipSaveParticipants: true, reason };
        let result = void 0;
        if (workingCopies.length === this.workingCopyService.modifiedCount) {
          result = (await this.editorService.saveAll({
            includeUntitled: { includeScratchpad: true },
            ...saveOptions
          })).success;
        }
        if (result !== false) {
          await Promises.settled(workingCopies.map((workingCopy) => workingCopy.isModified() ? workingCopy.save(saveOptions) : Promise.resolve(true)));
        }
      },
      localize("saveBeforeShutdown", "Saving editors with unsaved changes is taking a bit longer..."),
      void 0,
      // Do not pick `Dialog` as location for reporting progress if it is likely
      // that the save operation will itself open a dialog for asking for the
      // location to save to for untitled or scratchpad working copies.
      // https://github.com/microsoft/vscode-internalbacklog/issues/4943
      workingCopies.some((workingCopy) => workingCopy.capabilities & WorkingCopyCapabilities.Untitled || workingCopy.capabilities & WorkingCopyCapabilities.Scratchpad) ? ProgressLocation.Window : ProgressLocation.Dialog
    );
  }
  doRevertAllBeforeShutdown(modifiedWorkingCopies) {
    return this.withProgressAndCancellation(async () => {
      const revertOptions = { soft: true };
      if (modifiedWorkingCopies.length === this.workingCopyService.modifiedCount) {
        await this.editorService.revertAll(revertOptions);
      }
      await Promises.settled(modifiedWorkingCopies.map((workingCopy) => workingCopy.isModified() ? workingCopy.revert(revertOptions) : Promise.resolve()));
    }, localize("revertBeforeShutdown", "Reverting editors with unsaved changes is taking a bit longer..."));
  }
  onBeforeShutdownWithoutModified() {
    return this.noVeto({ except: this.contextService.getWorkbenchState() === WorkbenchState.EMPTY ? [] : Array.from(this.unrestoredBackups) });
  }
  async noVeto(arg1) {
    await this.discardBackupsBeforeShutdown(arg1);
    return false;
  }
  async discardBackupsBeforeShutdown(arg1) {
    if (!this.isReady) {
      return;
    }
    await this.withProgressAndCancellation(async () => {
      try {
        if (Array.isArray(arg1)) {
          await Promises.settled(arg1.map((workingCopy) => this.workingCopyBackupService.discardBackup(workingCopy)));
        } else {
          await this.workingCopyBackupService.discardBackups(arg1);
        }
      } catch (error) {
        this.logService.error(`[backup tracker] error discarding backups: ${error}`);
      }
    }, localize("discardBackupsBeforeShutdown", "Discarding backups is taking a bit longer..."));
  }
  withProgressAndCancellation(promiseFactory, title, detail, location = ProgressLocation.Dialog) {
    const cts = new CancellationTokenSource();
    return this.progressService.withProgress({
      location,
      // by default use a dialog to prevent the user from making any more changes now (https://github.com/microsoft/vscode/issues/122774)
      cancellable: true,
      // allow to cancel (https://github.com/microsoft/vscode/issues/112278)
      delay: 800,
      // delay so that it only appears when operation takes a long time
      title,
      detail
    }, () => raceCancellation(promiseFactory(cts.token), cts.token), () => cts.dispose(true));
  }
};
NativeWorkingCopyBackupTracker.ID = "workbench.contrib.nativeWorkingCopyBackupTracker";
NativeWorkingCopyBackupTracker = __decorateClass([
  __decorateParam(0, IWorkingCopyBackupService),
  __decorateParam(1, IFilesConfigurationService),
  __decorateParam(2, IWorkingCopyService),
  __decorateParam(3, ILifecycleService),
  __decorateParam(4, IFileDialogService),
  __decorateParam(5, IDialogService),
  __decorateParam(6, IWorkspaceContextService),
  __decorateParam(7, INativeHostService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IEnvironmentService),
  __decorateParam(10, IProgressService),
  __decorateParam(11, IWorkingCopyEditorService),
  __decorateParam(12, IEditorService)
], NativeWorkingCopyBackupTracker);
export {
  NativeWorkingCopyBackupTracker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy93b3JraW5nQ29weS9lbGVjdHJvbi1icm93c2VyL3dvcmtpbmdDb3B5QmFja3VwVHJhY2tlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUJhY2t1cFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vd29ya2luZ0NvcHlCYWNrdXAuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBBdXRvU2F2ZU1vZGUgfSBmcm9tICcuLi8uLi9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi93b3JraW5nQ29weVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtpbmdDb3B5LCBJV29ya2luZ0NvcHlJZGVudGlmaWVyLCBXb3JraW5nQ29weUNhcGFiaWxpdGllcyB9IGZyb20gJy4uL2NvbW1vbi93b3JraW5nQ29weS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgU2h1dGRvd25SZWFzb24gfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDb25maXJtUmVzdWx0LCBJRmlsZURpYWxvZ1NlcnZpY2UsIElEaWFsb2dTZXJ2aWNlLCBnZXRGaWxlTmFtZXNNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hTdGF0ZSwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBIb3RFeGl0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBXb3JraW5nQ29weUJhY2t1cFRyYWNrZXIgfSBmcm9tICcuLi9jb21tb24vd29ya2luZ0NvcHlCYWNrdXBUcmFja2VyLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2F2ZVJlYXNvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzU2VydmljZSwgUHJvZ3Jlc3NMb2NhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcywgcmFjZUNhbmNlbGxhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElXb3JraW5nQ29weUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vd29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIE5hdGl2ZVdvcmtpbmdDb3B5QmFja3VwVHJhY2tlciBleHRlbmRzIFdvcmtpbmdDb3B5QmFja3VwVHJhY2tlciBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5uYXRpdmVXb3JraW5nQ29weUJhY2t1cFRyYWNrZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlIHdvcmtpbmdDb3B5QmFja3VwU2VydmljZTogSVdvcmtpbmdDb3B5QmFja3VwU2VydmljZSxcblx0XHRASUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weVNlcnZpY2Ugd29ya2luZ0NvcHlTZXJ2aWNlOiBJV29ya2luZ0NvcHlTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASUZpbGVEaWFsb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZURpYWxvZ1NlcnZpY2U6IElGaWxlRGlhbG9nU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weUVkaXRvclNlcnZpY2Ugd29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlOiBJV29ya2luZ0NvcHlFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIod29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLCB3b3JraW5nQ29weVNlcnZpY2UsIGxvZ1NlcnZpY2UsIGxpZmVjeWNsZVNlcnZpY2UsIGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsIHdvcmtpbmdDb3B5RWRpdG9yU2VydmljZSwgZWRpdG9yU2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgb25GaW5hbEJlZm9yZVNodXRkb3duKHJlYXNvbjogU2h1dGRvd25SZWFzb24pOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdC8vIEltcG9ydGFudDogd2UgYXJlIGFib3V0IHRvIHNodXRkb3duIGFuZCBoYW5kbGUgbW9kaWZpZWQgd29ya2luZyBjb3BpZXNcblx0XHQvLyBhbmQgYmFja3Vwcy4gV2UgZG8gbm90IHdhbnQgYW55IHBlbmRpbmcgYmFja3VwIG9wcyB0byBpbnRlcmZlciB3aXRoXG5cdFx0Ly8gdGhpcyBiZWNhdXNlIHRoZXJlIGlzIGEgcmlzayBvZiBhIGJhY2t1cCBiZWluZyBzY2hlZHVsZWQgYWZ0ZXIgd2UgaGF2ZVxuXHRcdC8vIGFja25vd2xlZGdlZCB0byBzaHV0ZG93biBhbmQgdGhlbiBtaWdodCBlbmQgdXAgd2l0aCBwYXJ0aWFsIGJhY2t1cHNcblx0XHQvLyB3cml0dGVuIHRvIGRpc2ssIG9yIGV2ZW4gZW1wdHkgYmFja3VwcyBvciBkZWxldGVzIGFmdGVyIHdyaXRlcy5cblx0XHQvLyAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEzODA1NSlcblxuXHRcdHRoaXMuY2FuY2VsQmFja3VwT3BlcmF0aW9ucygpO1xuXG5cdFx0Ly8gRm9yIHRoZSBkdXJhdGlvbiBvZiB0aGUgc2h1dGRvd24gaGFuZGxpbmcsIHN1c3BlbmQgYmFja3VwIG9wZXJhdGlvbnNcblx0XHQvLyBhbmQgb25seSByZXN1bWUgYWZ0ZXIgd2UgaGF2ZSBoYW5kbGVkIGJhY2t1cHMuIFNpbWlsYXIgdG8gYWJvdmUsIHdlXG5cdFx0Ly8gZG8gbm90IHdhbnQgdG8gdHJpZ2dlciBiYWNrdXAgdHJhY2tpbmcgZHVyaW5nIG91ciBzaHV0ZG93biBoYW5kbGluZ1xuXHRcdC8vIGJ1dCB3ZSBtdXN0IHJlc3VtZSwgaW4gY2FzZSBvZiBhIHZldG8gYWZ0ZXJ3YXJkcy5cblxuXHRcdGNvbnN0IHsgcmVzdW1lIH0gPSB0aGlzLnN1c3BlbmRCYWNrdXBPcGVyYXRpb25zKCk7XG5cblx0XHR0cnkge1xuXG5cdFx0XHQvLyBNb2RpZmllZCB3b3JraW5nIGNvcGllcyBuZWVkIHRyZWF0bWVudCBvbiBzaHV0ZG93blxuXHRcdFx0Y29uc3QgbW9kaWZpZWRXb3JraW5nQ29waWVzID0gdGhpcy53b3JraW5nQ29weVNlcnZpY2UubW9kaWZpZWRXb3JraW5nQ29waWVzO1xuXHRcdFx0aWYgKG1vZGlmaWVkV29ya2luZ0NvcGllcy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMub25CZWZvcmVTaHV0ZG93bldpdGhNb2RpZmllZChyZWFzb24sIG1vZGlmaWVkV29ya2luZ0NvcGllcyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE5vIG1vZGlmaWVkIHdvcmtpbmcgY29waWVzXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMub25CZWZvcmVTaHV0ZG93bldpdGhvdXRNb2RpZmllZCgpO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZXN1bWUoKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgb25CZWZvcmVTaHV0ZG93bldpdGhNb2RpZmllZChyZWFzb246IFNodXRkb3duUmVhc29uLCBtb2RpZmllZFdvcmtpbmdDb3BpZXM6IHJlYWRvbmx5IElXb3JraW5nQ29weVtdKTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHQvLyBJZiBhdXRvIHNhdmUgaXMgZW5hYmxlZCwgc2F2ZSBhbGwgbm9uLXVudGl0bGVkIHdvcmtpbmcgY29waWVzXG5cdFx0Ly8gYW5kIHRoZW4gY2hlY2sgYWdhaW4gZm9yIG1vZGlmaWVkIGNvcGllc1xuXG5cdFx0Y29uc3Qgd29ya2luZ0NvcGllc1RvQXV0b1NhdmUgPSBtb2RpZmllZFdvcmtpbmdDb3BpZXMuZmlsdGVyKHdjID0+ICEod2MuY2FwYWJpbGl0aWVzICYgV29ya2luZ0NvcHlDYXBhYmlsaXRpZXMuVW50aXRsZWQpICYmIHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5nZXRBdXRvU2F2ZU1vZGUod2MucmVzb3VyY2UpLm1vZGUgIT09IEF1dG9TYXZlTW9kZS5PRkYpO1xuXHRcdGlmICh3b3JraW5nQ29waWVzVG9BdXRvU2F2ZS5sZW5ndGggPiAwKSB7XG5cblx0XHRcdC8vIFNhdmUgYWxsIG1vZGlmaWVkIHdvcmtpbmcgY29waWVzIHRoYXQgY2FuIGJlIGF1dG8tc2F2ZWRcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZG9TYXZlQWxsQmVmb3JlU2h1dGRvd24od29ya2luZ0NvcGllc1RvQXV0b1NhdmUsIFNhdmVSZWFzb24uQVVUTyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtiYWNrdXAgdHJhY2tlcl0gZXJyb3Igc2F2aW5nIG1vZGlmaWVkIHdvcmtpbmcgY29waWVzOiAke2Vycm9yfWApOyAvLyBndWFyZCBhZ2FpbnN0IG1pc2JlaGF2aW5nIHNhdmVzLCB3ZSBoYW5kbGUgcmVtYWluaW5nIG1vZGlmaWVkIGJlbG93XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIHdlIHN0aWxsIGhhdmUgbW9kaWZpZWQgd29ya2luZyBjb3BpZXMsIHdlIGVpdGhlciBoYXZlIHVudGl0bGVkIG9uZXMgb3Igd29ya2luZyBjb3BpZXMgdGhhdCBjYW5ub3QgYmUgc2F2ZWRcblx0XHRcdGNvbnN0IHJlbWFpbmluZ01vZGlmaWVkV29ya2luZ0NvcGllcyA9IHRoaXMud29ya2luZ0NvcHlTZXJ2aWNlLm1vZGlmaWVkV29ya2luZ0NvcGllcztcblx0XHRcdGlmIChyZW1haW5pbmdNb2RpZmllZFdvcmtpbmdDb3BpZXMubGVuZ3RoKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmhhbmRsZU1vZGlmaWVkQmVmb3JlU2h1dGRvd24ocmVtYWluaW5nTW9kaWZpZWRXb3JraW5nQ29waWVzLCByZWFzb24pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5ub1ZldG8oWy4uLm1vZGlmaWVkV29ya2luZ0NvcGllc10pOyAvLyBubyB2ZXRvIChtb2RpZmllZCBhdXRvLXNhdmVkKVxuXHRcdH1cblxuXHRcdC8vIEF1dG8gc2F2ZSBpcyBub3QgZW5hYmxlZFxuXHRcdHJldHVybiB0aGlzLmhhbmRsZU1vZGlmaWVkQmVmb3JlU2h1dGRvd24obW9kaWZpZWRXb3JraW5nQ29waWVzLCByZWFzb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVNb2RpZmllZEJlZm9yZVNodXRkb3duKG1vZGlmaWVkV29ya2luZ0NvcGllczogcmVhZG9ubHkgSVdvcmtpbmdDb3B5W10sIHJlYXNvbjogU2h1dGRvd25SZWFzb24pOiBQcm9taXNlPGJvb2xlYW4+IHtcblxuXHRcdC8vIFRyaWdnZXIgYmFja3VwIGlmIGNvbmZpZ3VyZWQgYW5kIGVuYWJsZWQgZm9yIHNodXRkb3duIHJlYXNvblxuXHRcdGxldCBiYWNrdXBzOiBJV29ya2luZ0NvcHlbXSA9IFtdO1xuXHRcdGxldCBiYWNrdXBFcnJvcjogRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbW9kaWZpZWRXb3JraW5nQ29waWVzVG9CYWNrdXAgPSBhd2FpdCB0aGlzLnNob3VsZEJhY2t1cEJlZm9yZVNodXRkb3duKHJlYXNvbiwgbW9kaWZpZWRXb3JraW5nQ29waWVzKTtcblx0XHRpZiAobW9kaWZpZWRXb3JraW5nQ29waWVzVG9CYWNrdXAubGVuZ3RoID4gMCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgYmFja3VwUmVzdWx0ID0gYXdhaXQgdGhpcy5iYWNrdXBCZWZvcmVTaHV0ZG93bihtb2RpZmllZFdvcmtpbmdDb3BpZXNUb0JhY2t1cCk7XG5cdFx0XHRcdGJhY2t1cHMgPSBiYWNrdXBSZXN1bHQuYmFja3Vwcztcblx0XHRcdFx0YmFja3VwRXJyb3IgPSBiYWNrdXBSZXN1bHQuZXJyb3I7XG5cblx0XHRcdFx0aWYgKGJhY2t1cHMubGVuZ3RoID09PSBtb2RpZmllZFdvcmtpbmdDb3BpZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBubyB2ZXRvIChiYWNrdXAgd2FzIHN1Y2Nlc3NmdWwgZm9yIGFsbCB3b3JraW5nIGNvcGllcylcblx0XHRcdFx0fVxuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0YmFja3VwRXJyb3IgPSBlcnJvcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZW1haW5pbmdNb2RpZmllZFdvcmtpbmdDb3BpZXMgPSBtb2RpZmllZFdvcmtpbmdDb3BpZXMuZmlsdGVyKHdvcmtpbmdDb3B5ID0+ICFiYWNrdXBzLmluY2x1ZGVzKHdvcmtpbmdDb3B5KSk7XG5cblx0XHQvLyBXZSByYW4gYSBiYWNrdXAgYnV0IHJlY2VpdmVkIGFuIGVycm9yIHRoYXQgd2Ugc2hvdyB0byB0aGUgdXNlclxuXHRcdGlmIChiYWNrdXBFcnJvcikge1xuXHRcdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbYmFja3VwIHRyYWNrZXJdIGVycm9yIGNyZWF0aW5nIGJhY2t1cHM6ICR7YmFja3VwRXJyb3J9YCk7XG5cblx0XHRcdFx0cmV0dXJuIGZhbHNlOyAvLyBkbyBub3QgYmxvY2sgc2h1dGRvd24gZHVyaW5nIGV4dGVuc2lvbiBkZXZlbG9wbWVudCAoaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzExNTAyOClcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMuc2hvd0Vycm9yRGlhbG9nKGxvY2FsaXplKCdiYWNrdXBUcmFja2VyQmFja3VwRmFpbGVkJywgXCJUaGUgZm9sbG93aW5nIGVkaXRvcnMgd2l0aCB1bnNhdmVkIGNoYW5nZXMgY291bGQgbm90IGJlIHNhdmVkIHRvIHRoZSBiYWNrdXAgbG9jYXRpb24uXCIpLCByZW1haW5pbmdNb2RpZmllZFdvcmtpbmdDb3BpZXMsIGJhY2t1cEVycm9yLCByZWFzb24pO1xuXHRcdH1cblxuXHRcdC8vIFNpbmNlIGEgYmFja3VwIGRpZCBub3QgaGFwcGVuLCB3ZSBoYXZlIHRvIGNvbmZpcm0gZm9yXG5cdFx0Ly8gdGhlIHdvcmtpbmcgY29waWVzIHRoYXQgZGlkIG5vdCBzdWNjZXNzZnVsbHkgYmFja3VwXG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuY29uZmlybUJlZm9yZVNodXRkb3duKHJlbWFpbmluZ01vZGlmaWVkV29ya2luZ0NvcGllcyk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0V4dGVuc2lvbkRldmVsb3BtZW50KSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW2JhY2t1cCB0cmFja2VyXSBlcnJvciBzYXZpbmcgb3IgcmV2ZXJ0aW5nIG1vZGlmaWVkIHdvcmtpbmcgY29waWVzOiAke2Vycm9yfWApO1xuXG5cdFx0XHRcdHJldHVybiBmYWxzZTsgLy8gZG8gbm90IGJsb2NrIHNodXRkb3duIGR1cmluZyBleHRlbnNpb24gZGV2ZWxvcG1lbnQgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMTUwMjgpXG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB0aGlzLnNob3dFcnJvckRpYWxvZyhsb2NhbGl6ZSgnYmFja3VwVHJhY2tlckNvbmZpcm1GYWlsZWQnLCBcIlRoZSBmb2xsb3dpbmcgZWRpdG9ycyB3aXRoIHVuc2F2ZWQgY2hhbmdlcyBjb3VsZCBub3QgYmUgc2F2ZWQgb3IgcmV2ZXJ0ZWQuXCIpLCByZW1haW5pbmdNb2RpZmllZFdvcmtpbmdDb3BpZXMsIGVycm9yLCByZWFzb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvdWxkQmFja3VwQmVmb3JlU2h1dGRvd24ocmVhc29uOiBTaHV0ZG93blJlYXNvbiwgbW9kaWZpZWRXb3JraW5nQ29waWVzOiByZWFkb25seSBJV29ya2luZ0NvcHlbXSk6IFByb21pc2U8cmVhZG9ubHkgSVdvcmtpbmdDb3B5W10+IHtcblx0XHRpZiAoIXRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5pc0hvdEV4aXRFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm4gW107IC8vIG5ldmVyIGJhY2t1cCB3aGVuIGhvdCBleGl0IGlzIGRpc2FibGVkIHZpYSBzZXR0aW5nc1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0V4dGVuc2lvbkRldmVsb3BtZW50KSB7XG5cdFx0XHRyZXR1cm4gbW9kaWZpZWRXb3JraW5nQ29waWVzOyAvLyBhbHdheXMgYmFja3VwIGNsb3NpbmcgZXh0ZW5zaW9uIGRldmVsb3BtZW50IHdpbmRvdyB3aXRob3V0IGFza2luZyB0byBzcGVlZCB1cCBkZWJ1Z2dpbmdcblx0XHR9XG5cblx0XHRzd2l0Y2ggKHJlYXNvbikge1xuXG5cdFx0XHQvLyBXaW5kb3cgQ2xvc2Vcblx0XHRcdGNhc2UgU2h1dGRvd25SZWFzb24uQ0xPU0U6XG5cdFx0XHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZICYmIHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5ob3RFeGl0Q29uZmlndXJhdGlvbiA9PT0gSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVF9BTkRfV0lORE9XX0NMT1NFKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG1vZGlmaWVkV29ya2luZ0NvcGllczsgLy8gYmFja3VwIGlmIGEgd29ya3NwYWNlL2ZvbGRlciBpcyBvcGVuIGFuZCBvbkV4aXRBbmRXaW5kb3dDbG9zZSBpcyBjb25maWd1cmVkXG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoaXNNYWNpbnRvc2ggfHwgYXdhaXQgdGhpcy5uYXRpdmVIb3N0U2VydmljZS5nZXRXaW5kb3dDb3VudCgpID4gMSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbW9kaWZpZWRXb3JraW5nQ29waWVzLmZpbHRlcihtb2RpZmllZFdvcmtpbmdDb3B5ID0+IG1vZGlmaWVkV29ya2luZ0NvcHkuY2FwYWJpbGl0aWVzICYgV29ya2luZ0NvcHlDYXBhYmlsaXRpZXMuU2NyYXRjaHBhZCk7IC8vIGJhY2t1cCBzY3JhdGNocGFkcyBhdXRvbWF0aWNhbGx5IHRvIGF2b2lkIHVzZXIgY29uZmlybWF0aW9uXG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIFtdOyAvLyBkbyBub3QgYmFja3VwIGlmIGEgd2luZG93IGlzIGNsb3NlZCB0aGF0IGRvZXMgbm90IGNhdXNlIHF1aXR0aW5nIG9mIHRoZSBhcHBsaWNhdGlvblxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIG1vZGlmaWVkV29ya2luZ0NvcGllczsgLy8gYmFja3VwIGlmIGxhc3Qgd2luZG93IGlzIGNsb3NlZCBvbiB3aW4vbGludXggd2hlcmUgdGhlIGFwcGxpY2F0aW9uIHF1aXRzIHJpZ2h0IGFmdGVyXG5cblx0XHRcdC8vIEFwcGxpY2F0aW9uIFF1aXRcblx0XHRcdGNhc2UgU2h1dGRvd25SZWFzb24uUVVJVDpcblx0XHRcdFx0cmV0dXJuIG1vZGlmaWVkV29ya2luZ0NvcGllczsgLy8gYmFja3VwIGJlY2F1c2UgbmV4dCBzdGFydCB3ZSByZXN0b3JlIGFsbCBiYWNrdXBzXG5cblx0XHRcdC8vIFdpbmRvdyBSZWxvYWRcblx0XHRcdGNhc2UgU2h1dGRvd25SZWFzb24uUkVMT0FEOlxuXHRcdFx0XHRyZXR1cm4gbW9kaWZpZWRXb3JraW5nQ29waWVzOyAvLyBiYWNrdXAgYmVjYXVzZSBhZnRlciB3aW5kb3cgcmVsb2FkLCBiYWNrdXBzIHJlc3RvcmVcblxuXHRcdFx0Ly8gV29ya3NwYWNlIENoYW5nZVxuXHRcdFx0Y2FzZSBTaHV0ZG93blJlYXNvbi5MT0FEOlxuXHRcdFx0XHRpZiAodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpICE9PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLmZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuaG90RXhpdENvbmZpZ3VyYXRpb24gPT09IEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG1vZGlmaWVkV29ya2luZ0NvcGllczsgLy8gYmFja3VwIGlmIGEgd29ya3NwYWNlL2ZvbGRlciBpcyBvcGVuIGFuZCBvbkV4aXRBbmRXaW5kb3dDbG9zZSBpcyBjb25maWd1cmVkXG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIG1vZGlmaWVkV29ya2luZ0NvcGllcy5maWx0ZXIobW9kaWZpZWRXb3JraW5nQ29weSA9PiBtb2RpZmllZFdvcmtpbmdDb3B5LmNhcGFiaWxpdGllcyAmIFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzLlNjcmF0Y2hwYWQpOyAvLyBiYWNrdXAgc2NyYXRjaHBhZHMgYXV0b21hdGljYWxseSB0byBhdm9pZCB1c2VyIGNvbmZpcm1hdGlvblxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIFtdOyAvLyBkbyBub3QgYmFja3VwIGJlY2F1c2Ugd2UgYXJlIHN3aXRjaGluZyBjb250ZXh0cyB3aXRoIG5vIHdvcmtzcGFjZS9mb2xkZXIgb3BlblxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgc2hvd0Vycm9yRGlhbG9nKG1lc3NhZ2U6IHN0cmluZywgd29ya2luZ0NvcGllczogcmVhZG9ubHkgSVdvcmtpbmdDb3B5W10sIGVycm9yOiBFcnJvciwgcmVhc29uOiBTaHV0ZG93blJlYXNvbik6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW2JhY2t1cCB0cmFja2VyXSAke21lc3NhZ2V9OiAke2Vycm9yfWApO1xuXG5cdFx0Y29uc3QgbW9kaWZpZWRXb3JraW5nQ29waWVzID0gd29ya2luZ0NvcGllcy5maWx0ZXIod29ya2luZ0NvcHkgPT4gd29ya2luZ0NvcHkuaXNNb2RpZmllZCgpKTtcblxuXHRcdGNvbnN0IGFkdmljZSA9IGxvY2FsaXplKCdiYWNrdXBFcnJvckRldGFpbHMnLCBcIlRyeSBzYXZpbmcgb3IgcmV2ZXJ0aW5nIHRoZSBlZGl0b3JzIHdpdGggdW5zYXZlZCBjaGFuZ2VzIGZpcnN0IGFuZCB0aGVuIHRyeSBhZ2Fpbi5cIik7XG5cdFx0Y29uc3QgZGV0YWlsID0gbW9kaWZpZWRXb3JraW5nQ29waWVzLmxlbmd0aFxuXHRcdFx0PyBgJHtnZXRGaWxlTmFtZXNNZXNzYWdlKG1vZGlmaWVkV29ya2luZ0NvcGllcy5tYXAoeCA9PiB4Lm5hbWUpKX1cXG4ke2FkdmljZX1gXG5cdFx0XHQ6IGFkdmljZTtcblxuXHRcdGNvbnN0IHsgcmVzdWx0IH0gPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UucHJvbXB0KHtcblx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRtZXNzYWdlLFxuXHRcdFx0ZGV0YWlsLFxuXHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAnb2snLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZPS1wiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHRydWUgLy8gdmV0b1xuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IHRoaXMudG9Gb3JjZVNodXRkb3duTGFiZWwocmVhc29uKSxcblx0XHRcdFx0XHRydW46ICgpID0+IGZhbHNlIC8vIG5vIHZldG9cblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHR9KTtcblxuXHRcdHJldHVybiByZXN1bHQgPz8gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgdG9Gb3JjZVNodXRkb3duTGFiZWwocmVhc29uOiBTaHV0ZG93blJlYXNvbik6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChyZWFzb24pIHtcblx0XHRcdGNhc2UgU2h1dGRvd25SZWFzb24uQ0xPU0U6XG5cdFx0XHRjYXNlIFNodXRkb3duUmVhc29uLkxPQUQ6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2h1dGRvd25Gb3JjZUNsb3NlJywgXCJDbG9zZSBBbnl3YXlcIik7XG5cdFx0XHRjYXNlIFNodXRkb3duUmVhc29uLlFVSVQ6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2h1dGRvd25Gb3JjZVF1aXQnLCBcIlF1aXQgQW55d2F5XCIpO1xuXHRcdFx0Y2FzZSBTaHV0ZG93blJlYXNvbi5SRUxPQUQ6XG5cdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnc2h1dGRvd25Gb3JjZVJlbG9hZCcsIFwiUmVsb2FkIEFueXdheVwiKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGJhY2t1cEJlZm9yZVNodXRkb3duKG1vZGlmaWVkV29ya2luZ0NvcGllczogcmVhZG9ubHkgSVdvcmtpbmdDb3B5W10pOiBQcm9taXNlPHsgYmFja3VwczogSVdvcmtpbmdDb3B5W107IGVycm9yPzogRXJyb3IgfT4ge1xuXHRcdGNvbnN0IGJhY2t1cHM6IElXb3JraW5nQ29weVtdID0gW107XG5cdFx0bGV0IGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGF3YWl0IHRoaXMud2l0aFByb2dyZXNzQW5kQ2FuY2VsbGF0aW9uKGFzeW5jIHRva2VuID0+IHtcblxuXHRcdFx0Ly8gUGVyZm9ybSBhIGJhY2t1cCBvZiBhbGwgbW9kaWZpZWQgd29ya2luZyBjb3BpZXMgdW5sZXNzIGEgYmFja3VwIGFscmVhZHkgZXhpc3RzXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKG1vZGlmaWVkV29ya2luZ0NvcGllcy5tYXAoYXN5bmMgd29ya2luZ0NvcHkgPT4ge1xuXG5cdFx0XHRcdFx0Ly8gQmFja3VwIGV4aXN0c1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRlbnRWZXJzaW9uID0gdGhpcy5nZXRDb250ZW50VmVyc2lvbih3b3JraW5nQ29weSk7XG5cdFx0XHRcdFx0aWYgKHRoaXMud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmhhc0JhY2t1cFN5bmMod29ya2luZ0NvcHksIGNvbnRlbnRWZXJzaW9uKSkge1xuXHRcdFx0XHRcdFx0YmFja3Vwcy5wdXNoKHdvcmtpbmdDb3B5KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBCYWNrdXAgZG9lcyBub3QgZXhpc3Rcblx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IGJhY2t1cCA9IGF3YWl0IHdvcmtpbmdDb3B5LmJhY2t1cCh0b2tlbik7XG5cdFx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLndvcmtpbmdDb3B5QmFja3VwU2VydmljZS5iYWNrdXAod29ya2luZ0NvcHksIGJhY2t1cC5jb250ZW50LCBjb250ZW50VmVyc2lvbiwgYmFja3VwLm1ldGEsIHRva2VuKTtcblx0XHRcdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdGJhY2t1cHMucHVzaCh3b3JraW5nQ29weSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9IGNhdGNoIChiYWNrdXBFcnJvcikge1xuXHRcdFx0XHRlcnJvciA9IGJhY2t1cEVycm9yO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0XHRsb2NhbGl6ZSgnYmFja3VwQmVmb3JlU2h1dGRvd25NZXNzYWdlJywgXCJCYWNraW5nIHVwIGVkaXRvcnMgd2l0aCB1bnNhdmVkIGNoYW5nZXMgaXMgdGFraW5nIGEgYml0IGxvbmdlci4uLlwiKSxcblx0XHRcdGxvY2FsaXplKCdiYWNrdXBCZWZvcmVTaHV0ZG93bkRldGFpbCcsIFwiQ2xpY2sgJ0NhbmNlbCcgdG8gc3RvcCB3YWl0aW5nIGFuZCB0byBzYXZlIG9yIHJldmVydCBlZGl0b3JzIHdpdGggdW5zYXZlZCBjaGFuZ2VzLlwiKVxuXHRcdCk7XG5cblx0XHRyZXR1cm4geyBiYWNrdXBzLCBlcnJvciB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb25maXJtQmVmb3JlU2h1dGRvd24obW9kaWZpZWRXb3JraW5nQ29waWVzOiBJV29ya2luZ0NvcHlbXSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXG5cdFx0Ly8gU2F2ZVxuXHRcdGNvbnN0IGNvbmZpcm0gPSBhd2FpdCB0aGlzLmZpbGVEaWFsb2dTZXJ2aWNlLnNob3dTYXZlQ29uZmlybShtb2RpZmllZFdvcmtpbmdDb3BpZXMubWFwKHdvcmtpbmdDb3B5ID0+IHdvcmtpbmdDb3B5Lm5hbWUpKTtcblx0XHRpZiAoY29uZmlybSA9PT0gQ29uZmlybVJlc3VsdC5TQVZFKSB7XG5cdFx0XHRjb25zdCBtb2RpZmllZENvdW50QmVmb3JlU2F2ZSA9IHRoaXMud29ya2luZ0NvcHlTZXJ2aWNlLm1vZGlmaWVkQ291bnQ7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZG9TYXZlQWxsQmVmb3JlU2h1dGRvd24obW9kaWZpZWRXb3JraW5nQ29waWVzLCBTYXZlUmVhc29uLkVYUExJQ0lUKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW2JhY2t1cCB0cmFja2VyXSBlcnJvciBzYXZpbmcgbW9kaWZpZWQgd29ya2luZyBjb3BpZXM6ICR7ZXJyb3J9YCk7IC8vIGd1YXJkIGFnYWluc3QgbWlzYmVoYXZpbmcgc2F2ZXMsIHdlIGhhbmRsZSByZW1haW5pbmcgbW9kaWZpZWQgYmVsb3dcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2F2ZWRXb3JraW5nQ29waWVzID0gbW9kaWZpZWRDb3VudEJlZm9yZVNhdmUgLSB0aGlzLndvcmtpbmdDb3B5U2VydmljZS5tb2RpZmllZENvdW50O1xuXHRcdFx0aWYgKHNhdmVkV29ya2luZ0NvcGllcyA8IG1vZGlmaWVkV29ya2luZ0NvcGllcy5sZW5ndGgpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7IC8vIHZldG8gKHNhdmUgZmFpbGVkIG9yIHdhcyBjYW5jZWxlZClcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHRoaXMubm9WZXRvKG1vZGlmaWVkV29ya2luZ0NvcGllcyk7IC8vIG5vIHZldG8gKG1vZGlmaWVkIHNhdmVkKVxuXHRcdH1cblxuXHRcdC8vIERvbid0IFNhdmVcblx0XHRlbHNlIGlmIChjb25maXJtID09PSBDb25maXJtUmVzdWx0LkRPTlRfU0FWRSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5kb1JldmVydEFsbEJlZm9yZVNodXRkb3duKG1vZGlmaWVkV29ya2luZ0NvcGllcyk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtiYWNrdXAgdHJhY2tlcl0gZXJyb3IgcmV2ZXJ0aW5nIG1vZGlmaWVkIHdvcmtpbmcgY29waWVzOiAke2Vycm9yfWApOyAvLyBkbyBub3QgYmxvY2sgdGhlIHNodXRkb3duIG9uIGVycm9ycyBmcm9tIHJldmVydFxuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5ub1ZldG8obW9kaWZpZWRXb3JraW5nQ29waWVzKTsgLy8gbm8gdmV0byAobW9kaWZpZWQgcmV2ZXJ0ZWQpXG5cdFx0fVxuXG5cdFx0Ly8gQ2FuY2VsXG5cdFx0cmV0dXJuIHRydWU7IC8vIHZldG8gKHVzZXIgY2FuY2VsZWQpXG5cdH1cblxuXHRwcml2YXRlIGRvU2F2ZUFsbEJlZm9yZVNodXRkb3duKHdvcmtpbmdDb3BpZXM6IElXb3JraW5nQ29weVtdLCByZWFzb246IFNhdmVSZWFzb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy53aXRoUHJvZ3Jlc3NBbmRDYW5jZWxsYXRpb24oYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHQvLyBTa2lwIHNhdmUgcGFydGljaXBhbnRzIG9uIHNodXRkb3duIGZvciBwZXJmb3JtYW5jZSByZWFzb25zXG5cdFx0XHRjb25zdCBzYXZlT3B0aW9ucyA9IHsgc2tpcFNhdmVQYXJ0aWNpcGFudHM6IHRydWUsIHJlYXNvbiB9O1xuXG5cdFx0XHQvLyBGaXJzdCBzYXZlIHRocm91Z2ggdGhlIGVkaXRvciBzZXJ2aWNlIGlmIHdlIHNhdmUgYWxsIHRvIGJlbmVmaXRcblx0XHRcdC8vIGZyb20gc29tZSBleHRyYXMgbGlrZSBzd2l0Y2hpbmcgdG8gdW50aXRsZWQgbW9kaWZpZWQgZWRpdG9ycyBiZWZvcmUgc2F2aW5nLlxuXHRcdFx0bGV0IHJlc3VsdDogYm9vbGVhbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdGlmICh3b3JraW5nQ29waWVzLmxlbmd0aCA9PT0gdGhpcy53b3JraW5nQ29weVNlcnZpY2UubW9kaWZpZWRDb3VudCkge1xuXHRcdFx0XHRyZXN1bHQgPSAoYXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLnNhdmVBbGwoe1xuXHRcdFx0XHRcdGluY2x1ZGVVbnRpdGxlZDogeyBpbmNsdWRlU2NyYXRjaHBhZDogdHJ1ZSB9LFxuXHRcdFx0XHRcdC4uLnNhdmVPcHRpb25zXG5cdFx0XHRcdH0pKS5zdWNjZXNzO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB3ZSBzdGlsbCBoYXZlIG1vZGlmaWVkIHdvcmtpbmcgY29waWVzLCBzYXZlIHRob3NlIGRpcmVjdGx5XG5cdFx0XHQvLyB1bmxlc3MgdGhlIHNhdmUgd2FzIG5vdCBzdWNjZXNzZnVsIChlLmcuIGNhbmNlbGxlZClcblx0XHRcdGlmIChyZXN1bHQgIT09IGZhbHNlKSB7XG5cdFx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQod29ya2luZ0NvcGllcy5tYXAod29ya2luZ0NvcHkgPT4gd29ya2luZ0NvcHkuaXNNb2RpZmllZCgpID8gd29ya2luZ0NvcHkuc2F2ZShzYXZlT3B0aW9ucykgOiBQcm9taXNlLnJlc29sdmUodHJ1ZSkpKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdFx0bG9jYWxpemUoJ3NhdmVCZWZvcmVTaHV0ZG93bicsIFwiU2F2aW5nIGVkaXRvcnMgd2l0aCB1bnNhdmVkIGNoYW5nZXMgaXMgdGFraW5nIGEgYml0IGxvbmdlci4uLlwiKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdC8vIERvIG5vdCBwaWNrIGBEaWFsb2dgIGFzIGxvY2F0aW9uIGZvciByZXBvcnRpbmcgcHJvZ3Jlc3MgaWYgaXQgaXMgbGlrZWx5XG5cdFx0XHQvLyB0aGF0IHRoZSBzYXZlIG9wZXJhdGlvbiB3aWxsIGl0c2VsZiBvcGVuIGEgZGlhbG9nIGZvciBhc2tpbmcgZm9yIHRoZVxuXHRcdFx0Ly8gbG9jYXRpb24gdG8gc2F2ZSB0byBmb3IgdW50aXRsZWQgb3Igc2NyYXRjaHBhZCB3b3JraW5nIGNvcGllcy5cblx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLWludGVybmFsYmFja2xvZy9pc3N1ZXMvNDk0M1xuXHRcdFx0d29ya2luZ0NvcGllcy5zb21lKHdvcmtpbmdDb3B5ID0+IHdvcmtpbmdDb3B5LmNhcGFiaWxpdGllcyAmIFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzLlVudGl0bGVkIHx8IHdvcmtpbmdDb3B5LmNhcGFiaWxpdGllcyAmIFdvcmtpbmdDb3B5Q2FwYWJpbGl0aWVzLlNjcmF0Y2hwYWQpID8gUHJvZ3Jlc3NMb2NhdGlvbi5XaW5kb3cgOiBQcm9ncmVzc0xvY2F0aW9uLkRpYWxvZyk7XG5cdH1cblxuXHRwcml2YXRlIGRvUmV2ZXJ0QWxsQmVmb3JlU2h1dGRvd24obW9kaWZpZWRXb3JraW5nQ29waWVzOiBJV29ya2luZ0NvcHlbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLndpdGhQcm9ncmVzc0FuZENhbmNlbGxhdGlvbihhc3luYyAoKSA9PiB7XG5cblx0XHRcdC8vIFNvZnQgcmV2ZXJ0IGlzIGdvb2QgZW5vdWdoIG9uIHNodXRkb3duXG5cdFx0XHRjb25zdCByZXZlcnRPcHRpb25zID0geyBzb2Z0OiB0cnVlIH07XG5cblx0XHRcdC8vIEZpcnN0IHJldmVydCB0aHJvdWdoIHRoZSBlZGl0b3Igc2VydmljZSBpZiB3ZSByZXZlcnQgYWxsXG5cdFx0XHRpZiAobW9kaWZpZWRXb3JraW5nQ29waWVzLmxlbmd0aCA9PT0gdGhpcy53b3JraW5nQ29weVNlcnZpY2UubW9kaWZpZWRDb3VudCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2UucmV2ZXJ0QWxsKHJldmVydE9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB3ZSBzdGlsbCBoYXZlIG1vZGlmaWVkIHdvcmtpbmcgY29waWVzLCByZXZlcnQgdGhvc2UgZGlyZWN0bHlcblx0XHRcdGF3YWl0IFByb21pc2VzLnNldHRsZWQobW9kaWZpZWRXb3JraW5nQ29waWVzLm1hcCh3b3JraW5nQ29weSA9PiB3b3JraW5nQ29weS5pc01vZGlmaWVkKCkgPyB3b3JraW5nQ29weS5yZXZlcnQocmV2ZXJ0T3B0aW9ucykgOiBQcm9taXNlLnJlc29sdmUoKSkpO1xuXHRcdH0sIGxvY2FsaXplKCdyZXZlcnRCZWZvcmVTaHV0ZG93bicsIFwiUmV2ZXJ0aW5nIGVkaXRvcnMgd2l0aCB1bnNhdmVkIGNoYW5nZXMgaXMgdGFraW5nIGEgYml0IGxvbmdlci4uLlwiKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uQmVmb3JlU2h1dGRvd25XaXRob3V0TW9kaWZpZWQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHQvLyBXZSBhcmUgYWJvdXQgdG8gc2h1dGRvd24gd2l0aG91dCBtb2RpZmllZCBlZGl0b3JzXG5cdFx0Ly8gYW5kIHdpbGwgZGlzY2FyZCBhbnkgYmFja3VwcyB0aGF0IGFyZSBzdGlsbFxuXHRcdC8vIGFyb3VuZCB0aGF0IGhhdmUgbm90IGJlZW4gaGFuZGxlZCBkZXBlbmRpbmdcblx0XHQvLyBvbiB0aGUgd2luZG93IHN0YXRlLlxuXHRcdC8vXG5cdFx0Ly8gRW1wdHkgd2luZG93OiBkaXNjYXJkIGV2ZW4gdW5yZXN0b3JlZCBiYWNrdXBzIHRvXG5cdFx0Ly8gcHJldmVudCBlbXB0eSB3aW5kb3dzIGZyb20gcmVzdG9yaW5nIHRoYXQgY2Fubm90XG5cdFx0Ly8gYmUgY2xvc2VkICh3b3JrYXJvdW5kIGZvciBub3QgaGF2aW5nIGltcGxlbWVudGVkXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyNzE2M1xuXHRcdC8vIGFuZCBhIGZpeCBmb3Igd2hhdCB1c2VycyBoYXZlIHJlcG9ydGVkIGluIGlzc3VlXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzEyNjcyNSlcblx0XHQvL1xuXHRcdC8vIFdvcmtzcGFjZS9Gb2xkZXIgd2luZG93OiBkbyBub3QgZGlzY2FyZCB1bnJlc3RvcmVkXG5cdFx0Ly8gYmFja3VwcyB0byBnaXZlIGEgY2hhbmNlIHRvIHJlc3RvcmUgdGhlbSBpbiB0aGVcblx0XHQvLyBmdXR1cmUuIFNpbmNlIHdlIGRvIG5vdCByZXN0b3JlIHdvcmtzcGFjZS9mb2xkZXJcblx0XHQvLyB3aW5kb3dzIHdpdGggYmFja3VwcywgdGhpcyBpcyBmaW5lLlxuXG5cdFx0cmV0dXJuIHRoaXMubm9WZXRvKHsgZXhjZXB0OiB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZID8gW10gOiBBcnJheS5mcm9tKHRoaXMudW5yZXN0b3JlZEJhY2t1cHMpIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBub1ZldG8oYmFja3Vwc1RvRGlzY2FyZDogSVdvcmtpbmdDb3B5SWRlbnRpZmllcltdKTogUHJvbWlzZTxib29sZWFuPjtcblx0cHJpdmF0ZSBub1ZldG8oYmFja3Vwc1RvS2VlcDogeyBleGNlcHQ6IElXb3JraW5nQ29weUlkZW50aWZpZXJbXSB9KTogUHJvbWlzZTxib29sZWFuPjtcblx0cHJpdmF0ZSBhc3luYyBub1ZldG8oYXJnMTogSVdvcmtpbmdDb3B5SWRlbnRpZmllcltdIHwgeyBleGNlcHQ6IElXb3JraW5nQ29weUlkZW50aWZpZXJbXSB9KTogUHJvbWlzZTxib29sZWFuPiB7XG5cblx0XHQvLyBEaXNjYXJkIGJhY2t1cHMgZnJvbSB3b3JraW5nIGNvcGllcyB0aGVcblx0XHQvLyB1c2VyIGVpdGhlciBzYXZlZCBvciByZXZlcnRlZFxuXG5cdFx0YXdhaXQgdGhpcy5kaXNjYXJkQmFja3Vwc0JlZm9yZVNodXRkb3duKGFyZzEpO1xuXG5cdFx0cmV0dXJuIGZhbHNlOyAvLyBubyB2ZXRvIChubyBtb2RpZmllZClcblx0fVxuXG5cdHByaXZhdGUgZGlzY2FyZEJhY2t1cHNCZWZvcmVTaHV0ZG93bihiYWNrdXBzVG9EaXNjYXJkOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyW10pOiBQcm9taXNlPHZvaWQ+O1xuXHRwcml2YXRlIGRpc2NhcmRCYWNrdXBzQmVmb3JlU2h1dGRvd24oYmFja3Vwc1RvS2VlcDogeyBleGNlcHQ6IElXb3JraW5nQ29weUlkZW50aWZpZXJbXSB9KTogUHJvbWlzZTx2b2lkPjtcblx0cHJpdmF0ZSBkaXNjYXJkQmFja3Vwc0JlZm9yZVNodXRkb3duKGJhY2t1cHNUb0Rpc2NhcmRPcktlZXA6IElXb3JraW5nQ29weUlkZW50aWZpZXJbXSB8IHsgZXhjZXB0OiBJV29ya2luZ0NvcHlJZGVudGlmaWVyW10gfSk6IFByb21pc2U8dm9pZD47XG5cdHByaXZhdGUgYXN5bmMgZGlzY2FyZEJhY2t1cHNCZWZvcmVTaHV0ZG93bihhcmcxOiBJV29ya2luZ0NvcHlJZGVudGlmaWVyW10gfCB7IGV4Y2VwdDogSVdvcmtpbmdDb3B5SWRlbnRpZmllcltdIH0pOiBQcm9taXNlPHZvaWQ+IHtcblxuXHRcdC8vIFdlIG5ldmVyIGRpc2NhcmQgYW55IGJhY2t1cHMgYmVmb3JlIHdlIGFyZSByZWFkeVxuXHRcdC8vIGFuZCBoYXZlIHJlc29sdmVkIGFsbCBiYWNrdXBzIHRoYXQgZXhpc3QuIFRoaXNcblx0XHQvLyBpcyBpbXBvcnRhbnQgdG8gbm90IGxvb3NlIGJhY2t1cHMgdGhhdCBoYXZlIG5vdFxuXHRcdC8vIGJlZW4gaGFuZGxlZC5cblxuXHRcdGlmICghdGhpcy5pc1JlYWR5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy53aXRoUHJvZ3Jlc3NBbmRDYW5jZWxsYXRpb24oYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHQvLyBXaGVuIHdlIHNodXRkb3duIGVpdGhlciB3aXRoIG5vIG1vZGlmaWVkIHdvcmtpbmcgY29waWVzIGxlZnRcblx0XHRcdC8vIG9yIHdpdGggc29tZSBoYW5kbGVkLCB3ZSBzdGFydCB0byBkaXNjYXJkIHRoZXNlIGJhY2t1cHNcblx0XHRcdC8vIHRvIGZyZWUgdGhlbSB1cC4gVGhpcyBoZWxwcyB0byBnZXQgcmlkIG9mIHN0YWxlIGJhY2t1cHNcblx0XHRcdC8vIGFzIHJlcG9ydGVkIGluIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy85Mjk2MlxuXHRcdFx0Ly9cblx0XHRcdC8vIEhvd2V2ZXIsIHdlIG5ldmVyIHdhbnQgdG8gZGlzY2FyZCBiYWNrdXBzIHRoYXQgd2Uga25vd1xuXHRcdFx0Ly8gd2VyZSBub3QgcmVzdG9yZWQgaW4gdGhlIHNlc3Npb24uXG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmIChBcnJheS5pc0FycmF5KGFyZzEpKSB7XG5cdFx0XHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZChhcmcxLm1hcCh3b3JraW5nQ29weSA9PiB0aGlzLndvcmtpbmdDb3B5QmFja3VwU2VydmljZS5kaXNjYXJkQmFja3VwKHdvcmtpbmdDb3B5KSkpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMud29ya2luZ0NvcHlCYWNrdXBTZXJ2aWNlLmRpc2NhcmRCYWNrdXBzKGFyZzEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtiYWNrdXAgdHJhY2tlcl0gZXJyb3IgZGlzY2FyZGluZyBiYWNrdXBzOiAke2Vycm9yfWApO1xuXHRcdFx0fVxuXHRcdH0sIGxvY2FsaXplKCdkaXNjYXJkQmFja3Vwc0JlZm9yZVNodXRkb3duJywgXCJEaXNjYXJkaW5nIGJhY2t1cHMgaXMgdGFraW5nIGEgYml0IGxvbmdlci4uLlwiKSk7XG5cdH1cblxuXHRwcml2YXRlIHdpdGhQcm9ncmVzc0FuZENhbmNlbGxhdGlvbihwcm9taXNlRmFjdG9yeTogKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gUHJvbWlzZTx2b2lkPiwgdGl0bGU6IHN0cmluZywgZGV0YWlsPzogc3RyaW5nLCBsb2NhdGlvbiA9IFByb2dyZXNzTG9jYXRpb24uRGlhbG9nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cblx0XHRyZXR1cm4gdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdGxvY2F0aW9uLCBcdFx0XHQvLyBieSBkZWZhdWx0IHVzZSBhIGRpYWxvZyB0byBwcmV2ZW50IHRoZSB1c2VyIGZyb20gbWFraW5nIGFueSBtb3JlIGNoYW5nZXMgbm93IChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTIyNzc0KVxuXHRcdFx0Y2FuY2VsbGFibGU6IHRydWUsIFx0Ly8gYWxsb3cgdG8gY2FuY2VsIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTEyMjc4KVxuXHRcdFx0ZGVsYXk6IDgwMCwgXHRcdC8vIGRlbGF5IHNvIHRoYXQgaXQgb25seSBhcHBlYXJzIHdoZW4gb3BlcmF0aW9uIHRha2VzIGEgbG9uZyB0aW1lXG5cdFx0XHR0aXRsZSxcblx0XHRcdGRldGFpbFxuXHRcdH0sICgpID0+IHJhY2VDYW5jZWxsYXRpb24ocHJvbWlzZUZhY3RvcnkoY3RzLnRva2VuKSwgY3RzLnRva2VuKSwgKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUNBQWlDO0FBRTFDLFNBQVMsNEJBQTRCLG9CQUFvQjtBQUN6RCxTQUFTLDJCQUEyQjtBQUNwQyxTQUErQywrQkFBK0I7QUFDOUUsU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQVMsZUFBZSxvQkFBb0IsZ0JBQWdCLDJCQUEyQjtBQUN2RixTQUFTLGdCQUFnQixnQ0FBZ0M7QUFDekQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUywyQkFBMkI7QUFDcEMsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsa0JBQWtCLHdCQUF3QjtBQUNuRCxTQUFTLFVBQVUsd0JBQXdCO0FBQzNDLFNBQVMsaUNBQWlDO0FBRW5DLElBQU0saUNBQU4sY0FBNkMseUJBQTJEO0FBQUEsRUFJOUcsWUFDNEIsMEJBQ0MsMkJBQ1Asb0JBQ0Ysa0JBQ2tCLG1CQUNKLGVBQ1UsZ0JBQ04sbUJBQ3hCLFlBQ3lCLG9CQUNILGlCQUNSLDBCQUNYLGVBQ2Y7QUFDRCxVQUFNLDBCQUEwQixvQkFBb0IsWUFBWSxrQkFBa0IsMkJBQTJCLDBCQUEwQixhQUFhO0FBVi9HO0FBQ0o7QUFDVTtBQUNOO0FBRUM7QUFDSDtBQUFBLEVBS3BDO0FBQUEsRUFFQSxNQUFnQixzQkFBc0IsUUFBMEM7QUFTL0UsU0FBSyx1QkFBdUI7QUFPNUIsVUFBTSxFQUFFLE9BQU8sSUFBSSxLQUFLLHdCQUF3QjtB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
