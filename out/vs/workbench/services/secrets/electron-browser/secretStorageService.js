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
import { createSingleCallFunction } from "../../../../base/common/functional.js";
import { isLinux } from "../../../../base/common/platform.js";
import Severity from "../../../../base/common/severity.js";
import { localize } from "../../../../nls.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IEncryptionService, KnownStorageProvider, PasswordStoreCLIOption, isGnome, isKwallet } from "../../../../platform/encryption/common/encryptionService.js";
import { INativeEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { BaseSecretStorageService, ISecretStorageService } from "../../../../platform/secrets/common/secrets.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { IJSONEditingService } from "../../configuration/common/jsonEditing.js";
let NativeSecretStorageService = class extends BaseSecretStorageService {
  constructor(_notificationService, _dialogService, _openerService, _jsonEditingService, _environmentService, storageService, encryptionService, logService) {
    super(
      !!_environmentService.useInMemorySecretStorage,
      storageService,
      encryptionService,
      logService
    );
    this._notificationService = _notificationService;
    this._dialogService = _dialogService;
    this._openerService = _openerService;
    this._jsonEditingService = _jsonEditingService;
    this._environmentService = _environmentService;
    this.notifyOfNoEncryptionOnce = createSingleCallFunction(() => this.notifyOfNoEncryption());
  }
  set(key, value) {
    this._sequencer.queue(key, async () => {
      await this.resolvedStorageService;
      if (this.type !== "persisted" && !this._environmentService.useInMemorySecretStorage) {
        this._logService.trace("[NativeSecretStorageService] Notifying user that secrets are not being stored on disk.");
        await this.notifyOfNoEncryptionOnce();
      }
    });
    return super.set(key, value);
  }
  async notifyOfNoEncryption() {
    const buttons = [];
    const troubleshootingButton = {
      label: localize("troubleshootingButton", "Open troubleshooting guide"),
      run: () => this._openerService.open("https://go.microsoft.com/fwlink/?linkid=2239490"),
      // doesn't close dialogs
      keepOpen: true
    };
    buttons.push(troubleshootingButton);
    let errorMessage = localize("encryptionNotAvailableJustTroubleshootingGuide", "An OS keyring couldn't be identified for storing the encryption related data in your current desktop environment.");
    if (!isLinux) {
      this._notificationService.prompt(Severity.Error, errorMessage, buttons);
      return;
    }
    const provider = await this._encryptionService.getKeyStorageProvider();
    if (provider === KnownStorageProvider.basicText) {
      const detail = localize("usePlainTextExtraSentence", "Open the troubleshooting guide to address this or you can use weaker encryption that doesn't use the OS keyring.");
      const usePlainTextButton = {
        label: localize("usePlainText", "Use weaker encryption"),
        run: async () => {
          await this._encryptionService.setUsePlainTextEncryption();
          await this._jsonEditingService.write(this._environmentService.argvResource, [{ path: ["password-store"], value: PasswordStoreCLIOption.basic }], true);
          this.reinitialize();
        }
      };
      buttons.unshift(usePlainTextButton);
      await this._dialogService.prompt({
        type: "error",
        buttons,
        message: errorMessage,
        detail
      });
      return;
    }
    if (isGnome(provider)) {
      errorMessage = localize("isGnome", "You're running in a GNOME environment but the OS keyring is not available for encryption. Ensure you have gnome-keyring or another libsecret compatible implementation installed and running.");
    } else if (isKwallet(provider)) {
      errorMessage = localize("isKwallet", "You're running in a KDE environment but the OS keyring is not available for encryption. Ensure you have kwallet running.");
    }
    this._notificationService.prompt(Severity.Error, errorMessage, buttons);
  }
};
NativeSecretStorageService = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, IDialogService),
  __decorateParam(2, IOpenerService),
  __decorateParam(3, IJSONEditingService),
  __decorateParam(4, INativeEnvironmentService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IEncryptionService),
  __decorateParam(7, ILogService)
], NativeSecretStorageService);
registerSingleton(ISecretStorageService, NativeSecretStorageService, InstantiationType.Delayed);
export {
  NativeSecretStorageService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWNyZXRzL2VsZWN0cm9uLWJyb3dzZXIvc2VjcmV0U3RvcmFnZVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9mdW5jdGlvbmFsLmpzJztcbmltcG9ydCB7IGlzTGludXggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElFbmNyeXB0aW9uU2VydmljZSwgS25vd25TdG9yYWdlUHJvdmlkZXIsIFBhc3N3b3JkU3RvcmVDTElPcHRpb24sIGlzR25vbWUsIGlzS3dhbGxldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VuY3J5cHRpb24vY29tbW9uL2VuY3J5cHRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBJUHJvbXB0Q2hvaWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBCYXNlU2VjcmV0U3RvcmFnZVNlcnZpY2UsIElTZWNyZXRTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3NlY3JldHMvY29tbW9uL3NlY3JldHMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJSlNPTkVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vanNvbkVkaXRpbmcuanMnO1xuXG5leHBvcnQgY2xhc3MgTmF0aXZlU2VjcmV0U3RvcmFnZVNlcnZpY2UgZXh0ZW5kcyBCYXNlU2VjcmV0U3RvcmFnZVNlcnZpY2Uge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJSlNPTkVkaXRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2pzb25FZGl0aW5nU2VydmljZTogSUpTT05FZGl0aW5nU2VydmljZSxcblx0XHRASU5hdGl2ZUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJRW5jcnlwdGlvblNlcnZpY2UgZW5jcnlwdGlvblNlcnZpY2U6IElFbmNyeXB0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoXG5cdFx0XHQhIV9lbnZpcm9ubWVudFNlcnZpY2UudXNlSW5NZW1vcnlTZWNyZXRTdG9yYWdlLFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UsXG5cdFx0XHRlbmNyeXB0aW9uU2VydmljZSxcblx0XHRcdGxvZ1NlcnZpY2Vcblx0XHQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0KGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fc2VxdWVuY2VyLnF1ZXVlKGtleSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgdGhpcy5yZXNvbHZlZFN0b3JhZ2VTZXJ2aWNlO1xuXG5cdFx0XHRpZiAodGhpcy50eXBlICE9PSAncGVyc2lzdGVkJyAmJiAhdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnVzZUluTWVtb3J5U2VjcmV0U3RvcmFnZSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKCdbTmF0aXZlU2VjcmV0U3RvcmFnZVNlcnZpY2VdIE5vdGlmeWluZyB1c2VyIHRoYXQgc2VjcmV0cyBhcmUgbm90IGJlaW5nIHN0b3JlZCBvbiBkaXNrLicpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLm5vdGlmeU9mTm9FbmNyeXB0aW9uT25jZSgpO1xuXHRcdFx0fVxuXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gc3VwZXIuc2V0KGtleSwgdmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBub3RpZnlPZk5vRW5jcnlwdGlvbk9uY2UgPSBjcmVhdGVTaW5nbGVDYWxsRnVuY3Rpb24oKCkgPT4gdGhpcy5ub3RpZnlPZk5vRW5jcnlwdGlvbigpKTtcblx0cHJpdmF0ZSBhc3luYyBub3RpZnlPZk5vRW5jcnlwdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBidXR0b25zOiBJUHJvbXB0Q2hvaWNlW10gPSBbXTtcblx0XHRjb25zdCB0cm91Ymxlc2hvb3RpbmdCdXR0b246IElQcm9tcHRDaG9pY2UgPSB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Ryb3VibGVzaG9vdGluZ0J1dHRvbicsIFwiT3BlbiB0cm91Ymxlc2hvb3RpbmcgZ3VpZGVcIiksXG5cdFx0XHRydW46ICgpID0+IHRoaXMuX29wZW5lclNlcnZpY2Uub3BlbignaHR0cHM6Ly9nby5taWNyb3NvZnQuY29tL2Z3bGluay8/bGlua2lkPTIyMzk0OTAnKSxcblx0XHRcdC8vIGRvZXNuJ3QgY2xvc2UgZGlhbG9nc1xuXHRcdFx0a2VlcE9wZW46IHRydWVcblx0XHR9O1xuXHRcdGJ1dHRvbnMucHVzaCh0cm91Ymxlc2hvb3RpbmdCdXR0b24pO1xuXG5cdFx0bGV0IGVycm9yTWVzc2FnZSA9IGxvY2FsaXplKCdlbmNyeXB0aW9uTm90QXZhaWxhYmxlSnVzdFRyb3VibGVzaG9vdGluZ0d1aWRlJywgXCJBbiBPUyBrZXlyaW5nIGNvdWxkbid0IGJlIGlkZW50aWZpZWQgZm9yIHN0b3JpbmcgdGhlIGVuY3J5cHRpb24gcmVsYXRlZCBkYXRhIGluIHlvdXIgY3VycmVudCBkZXNrdG9wIGVudmlyb25tZW50LlwiKTtcblxuXHRcdGlmICghaXNMaW51eCkge1xuXHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuRXJyb3IsIGVycm9yTWVzc2FnZSwgYnV0dG9ucyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBhd2FpdCB0aGlzLl9lbmNyeXB0aW9uU2VydmljZS5nZXRLZXlTdG9yYWdlUHJvdmlkZXIoKTtcblx0XHRpZiAocHJvdmlkZXIgPT09IEtub3duU3RvcmFnZVByb3ZpZGVyLmJhc2ljVGV4dCkge1xuXHRcdFx0Y29uc3QgZGV0YWlsID0gbG9jYWxpemUoJ3VzZVBsYWluVGV4dEV4dHJhU2VudGVuY2UnLCBcIk9wZW4gdGhlIHRyb3VibGVzaG9vdGluZyBndWlkZSB0byBhZGRyZXNzIHRoaXMgb3IgeW91IGNhbiB1c2Ugd2Vha2VyIGVuY3J5cHRpb24gdGhhdCBkb2Vzbid0IHVzZSB0aGUgT1Mga2V5cmluZy5cIik7XG5cdFx0XHRjb25zdCB1c2VQbGFpblRleHRCdXR0b246IElQcm9tcHRDaG9pY2UgPSB7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndXNlUGxhaW5UZXh0JywgXCJVc2Ugd2Vha2VyIGVuY3J5cHRpb25cIiksXG5cdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX2VuY3J5cHRpb25TZXJ2aWNlLnNldFVzZVBsYWluVGV4dEVuY3J5cHRpb24oKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9qc29uRWRpdGluZ1NlcnZpY2Uud3JpdGUodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3ZSZXNvdXJjZSwgW3sgcGF0aDogWydwYXNzd29yZC1zdG9yZSddLCB2YWx1ZTogUGFzc3dvcmRTdG9yZUNMSU9wdGlvbi5iYXNpYyB9XSwgdHJ1ZSk7XG5cdFx0XHRcdFx0dGhpcy5yZWluaXRpYWxpemUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGJ1dHRvbnMudW5zaGlmdCh1c2VQbGFpblRleHRCdXR0b24pO1xuXG5cdFx0XHRhd2FpdCB0aGlzLl9kaWFsb2dTZXJ2aWNlLnByb21wdCh7XG5cdFx0XHRcdHR5cGU6ICdlcnJvcicsXG5cdFx0XHRcdGJ1dHRvbnMsXG5cdFx0XHRcdG1lc3NhZ2U6IGVycm9yTWVzc2FnZSxcblx0XHRcdFx0ZGV0YWlsXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXNHbm9tZShwcm92aWRlcikpIHtcblx0XHRcdGVycm9yTWVzc2FnZSA9IGxvY2FsaXplKCdpc0dub21lJywgXCJZb3UncmUgcnVubmluZyBpbiBhIEdOT01FIGVudmlyb25tZW50IGJ1dCB0aGUgT1Mga2V5cmluZyBpcyBub3QgYXZhaWxhYmxlIGZvciBlbmNyeXB0aW9uLiBFbnN1cmUgeW91IGhhdmUgZ25vbWUta2V5cmluZyBvciBhbm90aGVyIGxpYnNlY3JldCBjb21wYXRpYmxlIGltcGxlbWVudGF0aW9uIGluc3RhbGxlZCBhbmQgcnVubmluZy5cIik7XG5cdFx0fSBlbHNlIGlmIChpc0t3YWxsZXQocHJvdmlkZXIpKSB7XG5cdFx0XHRlcnJvck1lc3NhZ2UgPSBsb2NhbGl6ZSgnaXNLd2FsbGV0JywgXCJZb3UncmUgcnVubmluZyBpbiBhIEtERSBlbnZpcm9ubWVudCBidXQgdGhlIE9TIGtleXJpbmcgaXMgbm90IGF2YWlsYWJsZSBmb3IgZW5jcnlwdGlvbi4gRW5zdXJlIHlvdSBoYXZlIGt3YWxsZXQgcnVubmluZy5cIik7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuRXJyb3IsIGVycm9yTWVzc2FnZSwgYnV0dG9ucyk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVNlY3JldFN0b3JhZ2VTZXJ2aWNlLCBOYXRpdmVTZWNyZXRTdG9yYWdlU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZUFBZTtBQUN4QixPQUFPLGNBQWM7QUFDckIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQkFBb0Isc0JBQXNCLHdCQUF3QixTQUFTLGlCQUFpQjtBQUNyRyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyw0QkFBMkM7QUFDcEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEIsNkJBQTZCO0FBQ2hFLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMkJBQTJCO0FBRTdCLElBQU0sNkJBQU4sY0FBeUMseUJBQXlCO0FBQUEsRUFFeEUsWUFDd0Msc0JBQ04sZ0JBQ0EsZ0JBQ0sscUJBQ00scUJBQzNCLGdCQUNHLG1CQUNQLFlBQ1o7QUFDRDtBQUFBLE1BQ0MsQ0FBQyxDQUFDLG9CQUFvQjtBQUFBLE1BQ3RCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNEO0FBZHVDO0FBQ047QUFDQTtBQUNLO0FBQ007QUEyQjdDLFNBQVEsMkJBQTJCLHlCQUF5QixNQUFNLEtBQUsscUJBQXFCLENBQUM7QUFBQSxFQWhCN0Y7QUFBQSxFQUVTLElBQUksS0FBYSxPQUE4QjtBQUN2RCxTQUFLLFdBQVcsTUFBTSxLQUFLLFlBQVk7QUFDdEMsWUFBTSxLQUFLO0FBRVgsVUFBSSxLQUFLLFNBQVMsZUFBZSxDQUFDLEtBQUssb0JBQW9CLDBCQUEwQjtBQUNwRixhQUFLLFlBQVksTUFBTSx3RkFBd0Y7QUFDL0csY0FBTSxLQUFLLHlCQUF5QjtBQUFBLE1BQ3JDO0FBQUEsSUFFRCxDQUFDO0FBRUQsV0FBTyxNQUFNLElBQUksS0FBSyxLQUFLO0FBQUEsRUFDNUI7QUFBQSxFQUdBLE1BQWMsdUJBQXNDO0FBQ25ELFVBQU0sVUFBMkIsQ0FBQztBQUNsQyxVQUFNLHdCQUF1QztBQUFBLE1BQzVDLE9BQU8sU0FBUyx5QkFBeUIsNEJBQTRCO0FBQUEsTUFDckUsS0FBSyxNQUFNLEtBQUssZUFBZSxLQUFLLGlEQUFpRDtBQUFBO0FBQUEsTUFFckYsVUFBVTtBQUFBLElBQ1g7QUFDQSxZQUFRLEtBQUsscUJBQXFCO0FBRWxDLFFBQUksZUFBZSxTQUFTLGtEQUFrRCxtSEFBbUg7QUFFak0sUUFBSSxDQUFDLFNBQVM7QUFDYixXQUFLLHFCQUFxQixPQUFPLFNBQVMsT0FBTyxjQUFjLE9BQU87QUFDdEU7QUFBQSxJQUNEO0FBRUEsVUFBTSxXQUFXLE1BQU0sS0FBSyxtQkFBbUIsc0JBQXNCO0FBQ3JFLFFBQUksYUFBYSxxQkFBcUIsV0FBVztBQUNoRCxZQUFNLFNBQVMsU0FBUyw2QkFBNkIsa0hBQWtIO0FBQ3ZLLFlBQU0scUJBQW9DO0FBQUEsUUFDekMsT0FBTyxTQUFTLGdCQUFnQix1QkFBdUI7QUFBQSxRQUN2RCxLQUFLLFlBQVk7QUFDaEIsZ0JBQU0sS0FBSyxtQkFBbUIsMEJBQTBCO0FBQ3hELGdCQUFNLEtBQUssb0JBQW9CLE1BQU0sS0FBSyxvQkFBb0IsY0FBYyxDQUFDLEVBQUUsTUFBTSxDQUFDLGdCQUFnQixHQUFHLE9BQU8sdUJBQXVCLE1BQU0sQ0FBQyxHQUFHLElBQUk7QUFDckosZUFBSyxhQUFhO0FBQUEsUUFDbkI7QUFBQSxNQUNEO0FBQ0EsY0FBUSxRQUFRLGtCQUFrQjtBQUVsQyxZQUFNLEtBQUssZUFBZSxPQUFPO0FBQUEsUUFDaEMsTUFBTTtBQUFBLFFBQ047QUFBQSxRQUNBLFNBQVM7QUFBQSxRQUNUO0FBQUEsTUFDRCxDQUFDO0FBQ0Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxRQUFRLFFBQVEsR0FBRztBQUN0QixxQkFBZSxTQUFTLFdBQVcsK0xBQStMO0FBQUEsSUFDbk8sV0FBVyxVQUFVLFFBQVEsR0FBRztBQUMvQixxQkFBZSxTQUFTLGFBQWEsMEhBQTBIO0FBQUEsSUFDaEs7QUFFQSxTQUFLLHFCQUFxQixPQUFPLFNBQVMsT0FBTyxjQUFjLE9BQU87QUFBQSxFQUN2RTtBQUNEO0FBbEZhLDZCQUFOO0FBQUEsRUFHSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVZVO0FBb0ZiLGtCQUFrQix1QkFBdUIsNEJBQTRCLGtCQUFrQixPQUFPOyIsCiAgIm5hbWVzIjogW10KfQo=
