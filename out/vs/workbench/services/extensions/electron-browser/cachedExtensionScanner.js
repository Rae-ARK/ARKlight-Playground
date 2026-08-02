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
import * as platform from "../../../../base/common/platform.js";
import { dedupExtensions } from "../common/extensionsUtil.js";
import { IExtensionsScannerService, toExtensionDescription as toExtensionDescriptionFromScannedExtension } from "../../../../platform/extensionManagement/common/extensionsScannerService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import Severity from "../../../../base/common/severity.js";
import { localize } from "../../../../nls.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IHostService } from "../../host/browser/host.js";
import { timeout } from "../../../../base/common/async.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { getErrorMessage } from "../../../../base/common/errors.js";
import { IWorkbenchExtensionManagementService } from "../../extensionManagement/common/extensionManagement.js";
import { toExtensionDescription } from "../common/extensions.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
let CachedExtensionScanner = class {
  constructor(_notificationService, _hostService, _extensionsScannerService, _userDataProfileService, _extensionManagementService, _environmentService, _logService) {
    this._notificationService = _notificationService;
    this._hostService = _hostService;
    this._extensionsScannerService = _extensionsScannerService;
    this._userDataProfileService = _userDataProfileService;
    this._extensionManagementService = _extensionManagementService;
    this._environmentService = _environmentService;
    this._logService = _logService;
    this.scannedExtensions = new Promise((resolve, reject) => {
      this._scannedExtensionsResolve = resolve;
      this._scannedExtensionsReject = reject;
    });
  }
  async startScanningExtensions() {
    try {
      const extensions = await this._scanInstalledExtensions();
      this._scannedExtensionsResolve(extensions);
    } catch (err) {
      this._scannedExtensionsReject(err);
    }
  }
  async _scanInstalledExtensions() {
    try {
      const language = platform.language;
      const result = await Promise.allSettled([
        this._extensionsScannerService.scanSystemExtensions({ language, checkControlFile: true }),
        this._extensionsScannerService.scanUserExtensions({ language, profileLocation: this._userDataProfileService.currentProfile.extensionsResource, useCache: true }),
        this._environmentService.remoteAuthority ? [] : this._extensionManagementService.getInstalledWorkspaceExtensions(false)
      ]);
      let hasErrors = false;
      let scannedSystemExtensions = [];
      if (result[0].status === "fulfilled") {
        scannedSystemExtensions = result[0].value;
      } else {
        hasErrors = true;
        this._logService.error(`Error scanning system extensions:`, getErrorMessage(result[0].reason));
      }
      let scannedUserExtensions = [];
      if (result[1].status === "fulfilled") {
        scannedUserExtensions = result[1].value;
      } else {
        hasErrors = true;
        this._logService.error(`Error scanning user extensions:`, getErrorMessage(result[1].reason));
      }
      let workspaceExtensions = [];
      if (result[2].status === "fulfilled") {
        workspaceExtensions = result[2].value;
      } else {
        hasErrors = true;
        this._logService.error(`Error scanning workspace extensions:`, getErrorMessage(result[2].reason));
      }
      const scannedDevelopedExtensions = [];
      try {
        const allScannedDevelopedExtensions = await this._extensionsScannerService.scanExtensionsUnderDevelopment([...scannedSystemExtensions, ...scannedUserExtensions], { language, includeInvalid: true });
        const invalidExtensions = [];
        for (const extensionUnderDevelopment of allScannedDevelopedExtensions) {
          if (extensionUnderDevelopment.isValid) {
            scannedDevelopedExtensions.push(extensionUnderDevelopment);
          } else {
            invalidExtensions.push(extensionUnderDevelopment);
          }
        }
        if (invalidExtensions.length > 0) {
          this._notificationService.prompt(
            Severity.Warning,
            invalidExtensions.length === 1 ? localize("extensionUnderDevelopment.invalid", "Failed loading extension '{0}' under development because it is invalid: {1}", invalidExtensions[0].location.fsPath, invalidExtensions[0].validations[0][1]) : localize("extensionsUnderDevelopment.invalid", "Failed loading extensions {0} under development because they are invalid: {1}", invalidExtensions.map((ext) => `'${ext.location.fsPath}'`).join(", "), invalidExtensions.map((ext) => `${ext.validations[0][1]}`).join(", ")),
            []
          );
        }
      } catch (error) {
        this._logService.error(error);
      }
      const system = scannedSystemExtensions.map((e) => toExtensionDescriptionFromScannedExtension(e, false));
      const user = scannedUserExtensions.map((e) => toExtensionDescriptionFromScannedExtension(e, false));
      const workspace = workspaceExtensions.map((e) => toExtensionDescription(e, false));
      const development = scannedDevelopedExtensions.map((e) => toExtensionDescriptionFromScannedExtension(e, true));
      const r = dedupExtensions(system, user, workspace, development, this._logService);
      if (!hasErrors) {
        const disposable = this._extensionsScannerService.onDidChangeCache(() => {
          disposable.dispose();
          this._notificationService.prompt(
            Severity.Error,
            localize("extensionCache.invalid", "Extensions have been modified on disk. Please reload the window."),
            [{
              label: localize("reloadWindow", "Reload Window"),
              run: () => this._hostService.reload()
            }]
          );
        });
        timeout(5e3).then(() => disposable.dispose());
      }
      return r;
    } catch (err) {
      this._logService.error(`Error scanning installed extensions:`);
      this._logService.error(err);
      return [];
    }
  }
};
CachedExtensionScanner = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, IHostService),
  __decorateParam(2, IExtensionsScannerService),
  __decorateParam(3, IUserDataProfileService),
  __decorateParam(4, IWorkbenchExtensionManagementService),
  __decorateParam(5, IWorkbenchEnvironmentService),
  __decorateParam(6, ILogService)
], CachedExtensionScanner);
export {
  CachedExtensionScanner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2VsZWN0cm9uLWJyb3dzZXIvY2FjaGVkRXh0ZW5zaW9uU2Nhbm5lci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgSUV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgZGVkdXBFeHRlbnNpb25zIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbnNVdGlsLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UsIElTY2FubmVkRXh0ZW5zaW9uLCB0b0V4dGVuc2lvbkRlc2NyaXB0aW9uIGFzIHRvRXh0ZW5zaW9uRGVzY3JpcHRpb25Gcm9tU2Nhbm5lZEV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbnNTY2FubmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IGdldEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBDYWNoZWRFeHRlbnNpb25TY2FubmVyIHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgc2Nhbm5lZEV4dGVuc2lvbnM6IFByb21pc2U8SUV4dGVuc2lvbkRlc2NyaXB0aW9uW10+O1xuXHRwcml2YXRlIF9zY2FubmVkRXh0ZW5zaW9uc1Jlc29sdmUhOiAocmVzdWx0OiBJRXh0ZW5zaW9uRGVzY3JpcHRpb25bXSkgPT4gdm9pZDtcblx0cHJpdmF0ZSBfc2Nhbm5lZEV4dGVuc2lvbnNSZWplY3QhOiAoZXJyOiB1bmtub3duKSA9PiB2b2lkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2hvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlOiBJRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF91c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5zY2FubmVkRXh0ZW5zaW9ucyA9IG5ldyBQcm9taXNlPElFeHRlbnNpb25EZXNjcmlwdGlvbltdPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHR0aGlzLl9zY2FubmVkRXh0ZW5zaW9uc1Jlc29sdmUgPSByZXNvbHZlO1xuXHRcdFx0dGhpcy5fc2Nhbm5lZEV4dGVuc2lvbnNSZWplY3QgPSByZWplY3Q7XG5cdFx0fSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgc3RhcnRTY2FubmluZ0V4dGVuc2lvbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLl9zY2FuSW5zdGFsbGVkRXh0ZW5zaW9ucygpO1xuXHRcdFx0dGhpcy5fc2Nhbm5lZEV4dGVuc2lvbnNSZXNvbHZlKGV4dGVuc2lvbnMpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fc2Nhbm5lZEV4dGVuc2lvbnNSZWplY3QoZXJyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zY2FuSW5zdGFsbGVkRXh0ZW5zaW9ucygpOiBQcm9taXNlPElFeHRlbnNpb25EZXNjcmlwdGlvbltdPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGxhbmd1YWdlID0gcGxhdGZvcm0ubGFuZ3VhZ2U7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoW1xuXHRcdFx0XHR0aGlzLl9leHRlbnNpb25zU2Nhbm5lclNlcnZpY2Uuc2NhblN5c3RlbUV4dGVuc2lvbnMoeyBsYW5ndWFnZSwgY2hlY2tDb250cm9sRmlsZTogdHJ1ZSB9KSxcblx0XHRcdFx0dGhpcy5fZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnNjYW5Vc2VyRXh0ZW5zaW9ucyh7IGxhbmd1YWdlLCBwcm9maWxlTG9jYXRpb246IHRoaXMuX3VzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuZXh0ZW5zaW9uc1Jlc291cmNlLCB1c2VDYWNoZTogdHJ1ZSB9KSxcblx0XHRcdFx0dGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSA/IFtdIDogdGhpcy5fZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkV29ya3NwYWNlRXh0ZW5zaW9ucyhmYWxzZSlcblx0XHRcdF0pO1xuXG5cdFx0XHRsZXQgaGFzRXJyb3JzID0gZmFsc2U7XG5cblx0XHRcdGxldCBzY2FubmVkU3lzdGVtRXh0ZW5zaW9uczogSVNjYW5uZWRFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0aWYgKHJlc3VsdFswXS5zdGF0dXMgPT09ICdmdWxmaWxsZWQnKSB7XG5cdFx0XHRcdHNjYW5uZWRTeXN0ZW1FeHRlbnNpb25zID0gcmVzdWx0WzBdLnZhbHVlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGFzRXJyb3JzID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgRXJyb3Igc2Nhbm5pbmcgc3lzdGVtIGV4dGVuc2lvbnM6YCwgZ2V0RXJyb3JNZXNzYWdlKHJlc3VsdFswXS5yZWFzb24pKTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IHNjYW5uZWRVc2VyRXh0ZW5zaW9uczogSVNjYW5uZWRFeHRlbnNpb25bXSA9IFtdO1xuXHRcdFx0aWYgKHJlc3VsdFsxXS5zdGF0dXMgPT09ICdmdWxmaWxsZWQnKSB7XG5cdFx0XHRcdHNjYW5uZWRVc2VyRXh0ZW5zaW9ucyA9IHJlc3VsdFsxXS52YWx1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhhc0Vycm9ycyA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHNjYW5uaW5nIHVzZXIgZXh0ZW5zaW9uczpgLCBnZXRFcnJvck1lc3NhZ2UocmVzdWx0WzFdLnJlYXNvbikpO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgd29ya3NwYWNlRXh0ZW5zaW9uczogSUV4dGVuc2lvbltdID0gW107XG5cdFx0XHRpZiAocmVzdWx0WzJdLnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcpIHtcblx0XHRcdFx0d29ya3NwYWNlRXh0ZW5zaW9ucyA9IHJlc3VsdFsyXS52YWx1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGhhc0Vycm9ycyA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEVycm9yIHNjYW5uaW5nIHdvcmtzcGFjZSBleHRlbnNpb25zOmAsIGdldEVycm9yTWVzc2FnZShyZXN1bHRbMl0ucmVhc29uKSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNjYW5uZWREZXZlbG9wZWRFeHRlbnNpb25zOiBJU2Nhbm5lZEV4dGVuc2lvbltdID0gW107XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBhbGxTY2FubmVkRGV2ZWxvcGVkRXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuX2V4dGVuc2lvbnNTY2FubmVyU2VydmljZS5zY2FuRXh0ZW5zaW9uc1VuZGVyRGV2ZWxvcG1lbnQoWy4uLnNjYW5uZWRTeXN0ZW1FeHRlbnNpb25zLCAuLi5zY2FubmVkVXNlckV4dGVuc2lvbnNdLCB7IGxhbmd1YWdlLCBpbmNsdWRlSW52YWxpZDogdHJ1ZSB9KTtcblx0XHRcdFx0Y29uc3QgaW52YWxpZEV4dGVuc2lvbnM6IElTY2FubmVkRXh0ZW5zaW9uW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb25VbmRlckRldmVsb3BtZW50IG9mIGFsbFNjYW5uZWREZXZlbG9wZWRFeHRlbnNpb25zKSB7XG5cdFx0XHRcdFx0aWYgKGV4dGVuc2lvblVuZGVyRGV2ZWxvcG1lbnQuaXNWYWxpZCkge1xuXHRcdFx0XHRcdFx0c2Nhbm5lZERldmVsb3BlZEV4dGVuc2lvbnMucHVzaChleHRlbnNpb25VbmRlckRldmVsb3BtZW50KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0aW52YWxpZEV4dGVuc2lvbnMucHVzaChleHRlbnNpb25VbmRlckRldmVsb3BtZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGludmFsaWRFeHRlbnNpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFx0XHRcdFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdFx0XHRpbnZhbGlkRXh0ZW5zaW9ucy5sZW5ndGggPT09IDFcblx0XHRcdFx0XHRcdFx0PyBsb2NhbGl6ZSgnZXh0ZW5zaW9uVW5kZXJEZXZlbG9wbWVudC5pbnZhbGlkJywgXCJGYWlsZWQgbG9hZGluZyBleHRlbnNpb24gJ3swfScgdW5kZXIgZGV2ZWxvcG1lbnQgYmVjYXVzZSBpdCBpcyBpbnZhbGlkOiB7MX1cIiwgaW52YWxpZEV4dGVuc2lvbnNbMF0ubG9jYXRpb24uZnNQYXRoLCBpbnZhbGlkRXh0ZW5zaW9uc1swXS52YWxpZGF0aW9uc1swXVsxXSlcblx0XHRcdFx0XHRcdFx0OiBsb2NhbGl6ZSgnZXh0ZW5zaW9uc1VuZGVyRGV2ZWxvcG1lbnQuaW52YWxpZCcsIFwiRmFpbGVkIGxvYWRpbmcgZXh0ZW5zaW9ucyB7MH0gdW5kZXIgZGV2ZWxvcG1lbnQgYmVjYXVzZSB0aGV5IGFyZSBpbnZhbGlkOiB7MX1cIiwgaW52YWxpZEV4dGVuc2lvbnMubWFwKGV4dCA9PiBgJyR7ZXh0LmxvY2F0aW9uLmZzUGF0aH0nYCkuam9pbignLCAnKSwgaW52YWxpZEV4dGVuc2lvbnMubWFwKGV4dCA9PiBgJHtleHQudmFsaWRhdGlvbnNbMF1bMV19YCkuam9pbignLCAnKSksXG5cdFx0XHRcdFx0XHRbXVxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzeXN0ZW0gPSBzY2FubmVkU3lzdGVtRXh0ZW5zaW9ucy5tYXAoZSA9PiB0b0V4dGVuc2lvbkRlc2NyaXB0aW9uRnJvbVNjYW5uZWRFeHRlbnNpb24oZSwgZmFsc2UpKTtcblx0XHRcdGNvbnN0IHVzZXIgPSBzY2FubmVkVXNlckV4dGVuc2lvbnMubWFwKGUgPT4gdG9FeHRlbnNpb25EZXNjcmlwdGlvbkZyb21TY2FubmVkRXh0ZW5zaW9uKGUsIGZhbHNlKSk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSB3b3Jrc3BhY2VFeHRlbnNpb25zLm1hcChlID0+IHRvRXh0ZW5zaW9uRGVzY3JpcHRpb24oZSwgZmFsc2UpKTtcblx0XHRcdGNvbnN0IGRldmVsb3BtZW50ID0gc2Nhbm5lZERldmVsb3BlZEV4dGVuc2lvbnMubWFwKGUgPT4gdG9FeHRlbnNpb25EZXNjcmlwdGlvbkZyb21TY2FubmVkRXh0ZW5zaW9uKGUsIHRydWUpKTtcblx0XHRcdGNvbnN0IHIgPSBkZWR1cEV4dGVuc2lvbnMoc3lzdGVtLCB1c2VyLCB3b3Jrc3BhY2UsIGRldmVsb3BtZW50LCB0aGlzLl9sb2dTZXJ2aWNlKTtcblxuXHRcdFx0aWYgKCFoYXNFcnJvcnMpIHtcblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRoaXMuX2V4dGVuc2lvbnNTY2FubmVyU2VydmljZS5vbkRpZENoYW5nZUNhY2hlKCgpID0+IHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFx0XHRcdFNldmVyaXR5LkVycm9yLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2V4dGVuc2lvbkNhY2hlLmludmFsaWQnLCBcIkV4dGVuc2lvbnMgaGF2ZSBiZWVuIG1vZGlmaWVkIG9uIGRpc2suIFBsZWFzZSByZWxvYWQgdGhlIHdpbmRvdy5cIiksXG5cdFx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3JlbG9hZFdpbmRvdycsIFwiUmVsb2FkIFdpbmRvd1wiKSxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLl9ob3N0U2VydmljZS5yZWxvYWQoKVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0dGltZW91dCg1MDAwKS50aGVuKCgpID0+IGRpc3Bvc2FibGUuZGlzcG9zZSgpKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHI7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBFcnJvciBzY2FubmluZyBpbnN0YWxsZWQgZXh0ZW5zaW9uczpgKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLGNBQWM7QUFFMUIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUywyQkFBOEMsMEJBQTBCLGtEQUFrRDtBQUNuSSxTQUFTLG1CQUFtQjtBQUM1QixPQUFPLGNBQWM7QUFDckIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNENBQTRDO0FBQ3JELFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsb0NBQW9DO0FBRXRDLElBQU0seUJBQU4sTUFBNkI7QUFBQSxFQU1uQyxZQUN3QyxzQkFDUixjQUNhLDJCQUNGLHlCQUNhLDZCQUNSLHFCQUNqQixhQUM3QjtBQVBzQztBQUNSO0FBQ2E7QUFDRjtBQUNhO0FBQ1I7QUFDakI7QUFFOUIsU0FBSyxvQkFBb0IsSUFBSSxRQUFpQyxDQUFDLFNBQVMsV0FBVztBQUNsRixXQUFLLDRCQUE0QjtBQUNqQyxXQUFLLDJCQUEyQjtBQUFBLElBQ2pDLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFhLDBCQUF5QztBQUNyRCxR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
