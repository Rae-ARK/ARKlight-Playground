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
import { Promises } from "../../../base/common/async.js";
import { getErrorMessage } from "../../../base/common/errors.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { joinPath } from "../../../base/common/resources.js";
import * as semver from "../../../base/common/semver/semver.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { Promises as FSPromises } from "../../../base/node/pfs.js";
import { buffer, CorruptZipMessage } from "../../../base/node/zip.js";
import { INativeEnvironmentService } from "../../environment/common/environment.js";
import { toExtensionManagementError } from "../common/abstractExtensionManagementService.js";
import { ExtensionManagementError, ExtensionManagementErrorCode, ExtensionSignatureVerificationCode, IExtensionGalleryService } from "../common/extensionManagement.js";
import { ExtensionKey, groupByExtension } from "../common/extensionManagementUtil.js";
import { fromExtractError } from "./extensionManagementUtil.js";
import { IExtensionSignatureVerificationService } from "./extensionSignatureVerificationService.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../uriIdentity/common/uriIdentity.js";
let ExtensionsDownloader = class extends Disposable {
  constructor(environmentService, fileService, extensionGalleryService, extensionSignatureVerificationService, telemetryService, uriIdentityService, logService) {
    super();
    this.fileService = fileService;
    this.extensionGalleryService = extensionGalleryService;
    this.extensionSignatureVerificationService = extensionSignatureVerificationService;
    this.telemetryService = telemetryService;
    this.uriIdentityService = uriIdentityService;
    this.logService = logService;
    this.extensionsDownloadDir = environmentService.extensionsDownloadLocation;
    this.extensionsTrashDir = uriIdentityService.extUri.joinPath(environmentService.extensionsDownloadLocation, `.trash`);
    this.cache = 20;
    this.cleanUpPromise = this.cleanUp();
  }
  async download(extension, operation, verifySignature, clientTargetPlatform) {
    await this.cleanUpPromise;
    const location = await this.downloadVSIX(extension, operation);
    if (!verifySignature) {
      return { location, verificationStatus: void 0 };
    }
    if (!extension.isSigned) {
      return { location, verificationStatus: ExtensionSignatureVerificationCode.NotSigned };
    }
    let signatureArchiveLocation;
    try {
      signatureArchiveLocation = await this.downloadSignatureArchive(extension);
      const verificationStatus = (await this.extensionSignatureVerificationService.verify(extension.identifier.id, extension.version, location.fsPath, signatureArchiveLocation.fsPath, clientTargetPlatform))?.code;
      if (verificationStatus === ExtensionSignatureVerificationCode.PackageIsInvalidZip || verificationStatus === ExtensionSignatureVerificationCode.SignatureArchiveIsInvalidZip) {
        try {
          await this.delete(location);
        } catch (error) {
          this.logService.error(error);
        }
        throw new ExtensionManagementError(CorruptZipMessage, ExtensionManagementErrorCode.CorruptZip);
      }
      return { location, verificationStatus };
    } catch (error) {
      try {
        await this.delete(location);
      } catch (error2) {
        this.logService.error(error2);
      }
      throw error;
    } finally {
      if (signatureArchiveLocation) {
        try {
          await this.delete(signatureArchiveLocation);
        } catch (error) {
          this.logService.error(error);
        }
      }
    }
  }
  async downloadVSIX(extension, operation) {
    try {
      const location = joinPath(this.extensionsDownloadDir, this.getName(extension));
      const attempts = await this.doDownload(extension, "vsix", async () => {
        await this.downloadFile(extension, location, (location2) => this.extensionGalleryService.download(extension, location2, operation));
        try {
          await this.validate(location.fsPath, "extension/package.json");
        } catch (error) {
          try {
            await this.fileService.del(location);
          } catch (e) {
            this.logService.warn(`Error while deleting: ${location.path}`, getErrorMessage(e));
          }
          throw error;
        }
      }, 2);
      if (attempts > 1) {
        this.telemetryService.publicLog2("extensiongallery:downloadvsix:retry", {
          extensionId: extension.identifier.id,
          attempts
        });
      }
      return location;
    } catch (e) {
      throw toExtensionManagementError(e, ExtensionManagementErrorCode.Download);
    }
  }
  async downloadSignatureArchive(extension) {
    try {
      const location = joinPath(this.extensionsDownloadDir, `${this.getName(extension)}${ExtensionsDownloader.SignatureArchiveExtension}`);
      const attempts = await this.doDownload(extension, "sigzip", async () => {
        await this.extensionGalleryService.downloadSignatureArchive(extension, location);
        try {
          await this.validate(location.fsPath, ".signature.p7s");
        } catch (error) {
          try {
            await this.fileService.del(location);
          } catch (e) {
            this.logService.warn(`Error while deleting: ${location.path}`, getErrorMessage(e));
          }
          throw error;
        }
      }, 2);
      if (attempts > 1) {
        this.telemetryService.publicLog2("extensiongallery:downloadsigzip:retry", {
          extensionId: extension.identifier.id,
          attempts
        });
      }
      return location;
    } catch (e) {
      throw toExtensionManagementError(e, ExtensionManagementErrorCode.DownloadSignature);
    }
  }
  async downloadFile(extension, location, downloadFn) {
    if (await this.fileService.exists(location)) {
      return;
    }
    if (location.scheme !== Schemas.file) {
      await downloadFn(location);
      return;
    }
    const tempLocation = joinPath(this.extensionsDownloadDir, `.${generateUuid()}`);
    try {
      await downloadFn(tempLocation);
    } catch (error) {
      try {
        await this.fileService.del(tempLocation);
      } catch (e) {
      }
      throw error;
    }
    try {
      await FSPromises.rename(
        tempLocation.fsPath,
        location.fsPath,
        2 * 60 * 1e3
        /* Retry for 2 minutes */
      );
    } catch (error) {
      try {
        await this.fileService.del(tempLocation);
      } catch (e) {
      }
      let exists = false;
      try {
        exists = await this.fileService.exists(location);
      } catch (e) {
      }
      if (exists) {
        this.logService.info(`Rename failed because the file was downloaded by another source. So ignoring renaming.`, extension.identifier.id, location.path);
      } else {
        this.logService.info(`Rename failed because of ${getErrorMessage(error)}. Deleted the file from downloaded location`, tempLocation.path);
        throw error;
      }
    }
  }
  async doDownload(extension, name, downloadFn, retries) {
    let attempts = 1;
    while (true) {
      try {
        await downloadFn();
        return attempts;
      } catch (e) {
        if (attempts++ > retries) {
          throw e;
        }
        this.logService.warn(`Failed downloading ${name}. ${getErrorMessage(e)}. Retry again...`, extension.identifier.id);
      }
    }
  }
  async validate(zipPath, filePath) {
    try {
      await buffer(zipPath, filePath);
    } catch (e) {
      throw fromExtractError(e);
    }
  }
  async delete(location) {
    await this.cleanUpPromise;
    const trashRelativePath = this.uriIdentityService.extUri.relativePath(this.extensionsDownloadDir, location);
    if (trashRelativePath) {
      await this.fileService.move(location, this.uriIdentityService.extUri.joinPath(this.extensionsTrashDir, trashRelativePath), true);
    } else {
      await this.fileService.del(location);
    }
  }
  async cleanUp() {
    try {
      if (!await this.fileService.exists(this.extensionsDownloadDir)) {
        this.logService.trace("Extension VSIX downloads cache dir does not exist");
        return;
      }
      try {
        await this.fileService.del(this.extensionsTrashDir, { recursive: true });
      } catch (error) {
        if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
          this.logService.error(error);
        }
      }
      const folderStat = await this.fileService.resolve(this.extensionsDownloadDir, { resolveMetadata: true });
      if (folderStat.children) {
        const toDelete = [];
        const vsixs = [];
        const signatureArchives = [];
        for (const stat of folderStat.children) {
          if (stat.name.endsWith(ExtensionsDownloader.SignatureArchiveExtension)) {
            signatureArchives.push(stat.resource);
          } else {
            const extension = ExtensionKey.parse(stat.name);
            if (extension) {
              vsixs.push([extension, stat]);
            }
          }
        }
        const byExtension = groupByExtension(vsixs, ([extension]) => extension);
        const distinct = [];
        for (const p of byExtension) {
          p.sort((a, b) => semver.rcompare(a[0].version, b[0].version));
          toDelete.push(...p.slice(1).map((e) => e[1].resource));
          distinct.push(p[0][1]);
        }
        distinct.sort((a, b) => a.mtime - b.mtime);
        toDelete.push(...distinct.slice(0, Math.max(0, distinct.length - this.cache)).map((s) => s.resource));
        toDelete.push(...signatureArchives);
        await Promises.settled(toDelete.map((resource) => {
          this.logService.trace("Deleting from cache", resource.path);
          return this.fileService.del(resource);
        }));
      }
    } catch (e) {
      this.logService.error(e);
    }
  }
  getName(extension) {
    return ExtensionKey.create(extension).toString().toLowerCase();
  }
};
ExtensionsDownloader.SignatureArchiveExtension = ".sigzip";
ExtensionsDownloader = __decorateClass([
  __decorateParam(0, INativeEnvironmentService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IExtensionGalleryService),
  __decorateParam(3, IExtensionSignatureVerificationService),
  __decorateParam(4, ITelemetryService),
  __decorateParam(5, IUriIdentityService),
  __decorateParam(6, ILogService)
], ExtensionsDownloader);
export {
  ExtensionsDownloader
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvbm9kZS9leHRlbnNpb25Eb3dubG9hZGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBnZXRFcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgKiBhcyBzZW12ZXIgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc2VtdmVyL3NlbXZlci5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcyBhcyBGU1Byb21pc2VzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3Bmcy5qcyc7XG5pbXBvcnQgeyBidWZmZXIsIENvcnJ1cHRaaXBNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3ppcC5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yIH0gZnJvbSAnLi4vY29tbW9uL2Fic3RyYWN0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLCBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlLCBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIElHYWxsZXJ5RXh0ZW5zaW9uLCBJbnN0YWxsT3BlcmF0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uS2V5LCBncm91cEJ5RXh0ZW5zaW9uIH0gZnJvbSAnLi4vY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IGZyb21FeHRyYWN0RXJyb3IgfSBmcm9tICcuL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi9leHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRhcmdldFBsYXRmb3JtIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UsIElGaWxlU3RhdFdpdGhNZXRhZGF0YSwgdG9GaWxlT3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcblxudHlwZSBSZXRyeURvd25sb2FkQ2xhc3NpZmljYXRpb24gPSB7XG5cdG93bmVyOiAnc2FuZHkwODEnO1xuXHRjb21tZW50OiAnRXZlbnQgcmVwb3J0aW5nIHRoZSByZXRyeSBvZiBkb3dubG9hZGluZyc7XG5cdGV4dGVuc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRXh0ZW5zaW9uIElkJyB9O1xuXHRhdHRlbXB0czogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ051bWJlciBvZiBBdHRlbXB0cycgfTtcbn07XG50eXBlIFJldHJ5RG93bmxvYWRFdmVudCA9IHtcblx0ZXh0ZW5zaW9uSWQ6IHN0cmluZztcblx0YXR0ZW1wdHM6IG51bWJlcjtcbn07XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25zRG93bmxvYWRlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IFNpZ25hdHVyZUFyY2hpdmVFeHRlbnNpb24gPSAnLnNpZ3ppcCc7XG5cblx0cmVhZG9ubHkgZXh0ZW5zaW9uc0Rvd25sb2FkRGlyOiBVUkk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uc1RyYXNoRGlyOiBVUkk7XG5cdHByaXZhdGUgcmVhZG9ubHkgY2FjaGU6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBjbGVhblVwUHJvbWlzZTogUHJvbWlzZTx2b2lkPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU5hdGl2ZUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uU2VydmljZTogSUV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5leHRlbnNpb25zRG93bmxvYWREaXIgPSBlbnZpcm9ubWVudFNlcnZpY2UuZXh0ZW5zaW9uc0Rvd25sb2FkTG9jYXRpb247XG5cdFx0dGhpcy5leHRlbnNpb25zVHJhc2hEaXIgPSB1cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKGVudmlyb25tZW50U2VydmljZS5leHRlbnNpb25zRG93bmxvYWRMb2NhdGlvbiwgYC50cmFzaGApO1xuXHRcdHRoaXMuY2FjaGUgPSAyMDsgLy8gQ2FjaGUgMjAgZG93bmxvYWRlZCBWU0lYIGZpbGVzXG5cdFx0dGhpcy5jbGVhblVwUHJvbWlzZSA9IHRoaXMuY2xlYW5VcCgpO1xuXHR9XG5cblx0YXN5bmMgZG93bmxvYWQoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgb3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uLCB2ZXJpZnlTaWduYXR1cmU6IGJvb2xlYW4sIGNsaWVudFRhcmdldFBsYXRmb3JtPzogVGFyZ2V0UGxhdGZvcm0pOiBQcm9taXNlPHsgcmVhZG9ubHkgbG9jYXRpb246IFVSSTsgcmVhZG9ubHkgdmVyaWZpY2F0aW9uU3RhdHVzOiBFeHRlbnNpb25TaWduYXR1cmVWZXJpZmljYXRpb25Db2RlIHwgdW5kZWZpbmVkIH0+IHtcblx0XHRhd2FpdCB0aGlzLmNsZWFuVXBQcm9taXNlO1xuXG5cdFx0Y29uc3QgbG9jYXRpb24gPSBhd2FpdCB0aGlzLmRvd25sb2FkVlNJWChleHRlbnNpb24sIG9wZXJhdGlvbik7XG5cblx0XHRpZiAoIXZlcmlmeVNpZ25hdHVyZSkge1xuXHRcdFx0cmV0dXJuIHsgbG9jYXRpb24sIHZlcmlmaWNhdGlvblN0YXR1czogdW5kZWZpbmVkIH07XG5cdFx0fVxuXG5cdFx0aWYgKCFleHRlbnNpb24uaXNTaWduZWQpIHtcblx0XHRcdHJldHVybiB7IGxvY2F0aW9uLCB2ZXJpZmljYXRpb25TdGF0dXM6IEV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvbkNvZGUuTm90U2lnbmVkIH07XG5cdFx0fVxuXG5cdFx0bGV0IHNpZ25hdHVyZUFyY2hpdmVMb2NhdGlvbjtcblx0XHR0cnkge1xuXHRcdFx0c2lnbmF0dXJlQXJjaGl2ZUxvY2F0aW9uID0gYXdhaXQgdGhpcy5kb3dubG9hZFNpZ25hdHVyZUFyY2hpdmUoZXh0ZW5zaW9uKTtcblx0XHRcdGNvbnN0IHZlcmlmaWNhdGlvblN0YXR1cyA9IChhd2FpdCB0aGlzLmV4dGVuc2lvblNpZ25hdHVyZVZlcmlmaWNhdGlvblNlcnZpY2UudmVyaWZ5KGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBleHRlbnNpb24udmVyc2lvbiwgbG9jYXRpb24uZnNQYXRoLCBzaWduYXR1cmVBcmNoaXZlTG9jYXRpb24uZnNQYXRoLCBjbGllbnRUYXJnZXRQbGF0Zm9ybSkpPy5jb2RlO1xuXHRcdFx0aWYgKHZlcmlmaWNhdGlvblN0YXR1cyA9PT0gRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZS5QYWNrYWdlSXNJbnZhbGlkWmlwIHx8IHZlcmlmaWNhdGlvblN0YXR1cyA9PT0gRXh0ZW5zaW9uU2lnbmF0dXJlVmVyaWZpY2F0aW9uQ29kZS5TaWduYXR1cmVBcmNoaXZlSXNJbnZhbGlkWmlwKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Ly8gRGVsZXRlIHRoZSBkb3dubG9hZGVkIHZzaXggaWYgVlNJWCBvciBzaWduYXR1cmUgYXJjaGl2ZSBpcyBpbnZhbGlkXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5kZWxldGUobG9jYXRpb24pO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihDb3JydXB0WmlwTWVzc2FnZSwgRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yQ29kZS5Db3JydXB0WmlwKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGxvY2F0aW9uLCB2ZXJpZmljYXRpb25TdGF0dXMgfTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Ly8gRGVsZXRlIHRoZSBkb3dubG9hZGVkIFZTSVggaWYgc2lnbmF0dXJlIGFyY2hpdmUgZG93bmxvYWQgZmFpbHNcblx0XHRcdFx0YXdhaXQgdGhpcy5kZWxldGUobG9jYXRpb24pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAoc2lnbmF0dXJlQXJjaGl2ZUxvY2F0aW9uKSB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0Ly8gRGVsZXRlIHNpZ25hdHVyZSBhcmNoaXZlIGFsd2F5c1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuZGVsZXRlKHNpZ25hdHVyZUFyY2hpdmVMb2NhdGlvbik7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG93bmxvYWRWU0lYKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIG9wZXJhdGlvbjogSW5zdGFsbE9wZXJhdGlvbik6IFByb21pc2U8VVJJPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGxvY2F0aW9uID0gam9pblBhdGgodGhpcy5leHRlbnNpb25zRG93bmxvYWREaXIsIHRoaXMuZ2V0TmFtZShleHRlbnNpb24pKTtcblx0XHRcdGNvbnN0IGF0dGVtcHRzID0gYXdhaXQgdGhpcy5kb0Rvd25sb2FkKGV4dGVuc2lvbiwgJ3ZzaXgnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZG93bmxvYWRGaWxlKGV4dGVuc2lvbiwgbG9jYXRpb24sIGxvY2F0aW9uID0+IHRoaXMuZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UuZG93bmxvYWQoZXh0ZW5zaW9uLCBsb2NhdGlvbiwgb3BlcmF0aW9uKSk7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy52YWxpZGF0ZShsb2NhdGlvbi5mc1BhdGgsICdleHRlbnNpb24vcGFja2FnZS5qc29uJyk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKGxvY2F0aW9uKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgRXJyb3Igd2hpbGUgZGVsZXRpbmc6ICR7bG9jYXRpb24ucGF0aH1gLCBnZXRFcnJvck1lc3NhZ2UoZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0fSwgMik7XG5cblx0XHRcdGlmIChhdHRlbXB0cyA+IDEpIHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8UmV0cnlEb3dubG9hZEV2ZW50LCBSZXRyeURvd25sb2FkQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25nYWxsZXJ5OmRvd25sb2FkdnNpeDpyZXRyeScsIHtcblx0XHRcdFx0XHRleHRlbnNpb25JZDogZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQsXG5cdFx0XHRcdFx0YXR0ZW1wdHNcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBsb2NhdGlvbjtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aHJvdyB0b0V4dGVuc2lvbk1hbmFnZW1lbnRFcnJvcihlLCBFeHRlbnNpb25NYW5hZ2VtZW50RXJyb3JDb2RlLkRvd25sb2FkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvd25sb2FkU2lnbmF0dXJlQXJjaGl2ZShleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uKTogUHJvbWlzZTxVUkk+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgbG9jYXRpb24gPSBqb2luUGF0aCh0aGlzLmV4dGVuc2lvbnNEb3dubG9hZERpciwgYCR7dGhpcy5nZXROYW1lKGV4dGVuc2lvbil9JHtFeHRlbnNpb25zRG93bmxvYWRlci5TaWduYXR1cmVBcmNoaXZlRXh0ZW5zaW9ufWApO1xuXHRcdFx0Y29uc3QgYXR0ZW1wdHMgPSBhd2FpdCB0aGlzLmRvRG93bmxvYWQoZXh0ZW5zaW9uLCAnc2lnemlwJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmRvd25sb2FkU2lnbmF0dXJlQXJjaGl2ZShleHRlbnNpb24sIGxvY2F0aW9uKTtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnZhbGlkYXRlKGxvY2F0aW9uLmZzUGF0aCwgJy5zaWduYXR1cmUucDdzJyk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKGxvY2F0aW9uKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgRXJyb3Igd2hpbGUgZGVsZXRpbmc6ICR7bG9jYXRpb24ucGF0aH1gLCBnZXRFcnJvck1lc3NhZ2UoZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0fSwgMik7XG5cblx0XHRcdGlmIChhdHRlbXB0cyA+IDEpIHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8UmV0cnlEb3dubG9hZEV2ZW50LCBSZXRyeURvd25sb2FkQ2xhc3NpZmljYXRpb24+KCdleHRlbnNpb25nYWxsZXJ5OmRvd25sb2Fkc2lnemlwOnJldHJ5Jywge1xuXHRcdFx0XHRcdGV4dGVuc2lvbklkOiBleHRlbnNpb24uaWRlbnRpZmllci5pZCxcblx0XHRcdFx0XHRhdHRlbXB0c1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGxvY2F0aW9uO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRocm93IHRvRXh0ZW5zaW9uTWFuYWdlbWVudEVycm9yKGUsIEV4dGVuc2lvbk1hbmFnZW1lbnRFcnJvckNvZGUuRG93bmxvYWRTaWduYXR1cmUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG93bmxvYWRGaWxlKGV4dGVuc2lvbjogSUdhbGxlcnlFeHRlbnNpb24sIGxvY2F0aW9uOiBVUkksIGRvd25sb2FkRm46IChsb2NhdGlvbjogVVJJKSA9PiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gRG8gbm90IGRvd25sb2FkIGlmIGV4aXN0c1xuXHRcdGlmIChhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyhsb2NhdGlvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEb3dubG9hZCBkaXJlY3RseSBpZiBsb2NhaXRvbiBpcyBub3QgZmlsZSBzY2hlbWVcblx0XHRpZiAobG9jYXRpb24uc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUpIHtcblx0XHRcdGF3YWl0IGRvd25sb2FkRm4obG9jYXRpb24pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIERvd25sb2FkIHRvIHRlbXBvcmFyeSBsb2NhdGlvbiBmaXJzdCBvbmx5IGlmIGZpbGUgZG9lcyBub3QgZXhpc3Rcblx0XHRjb25zdCB0ZW1wTG9jYXRpb24gPSBqb2luUGF0aCh0aGlzLmV4dGVuc2lvbnNEb3dubG9hZERpciwgYC4ke2dlbmVyYXRlVXVpZCgpfWApO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBkb3dubG9hZEZuKHRlbXBMb2NhdGlvbik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHRlbXBMb2NhdGlvbik7XG5cdFx0XHR9IGNhdGNoIChlKSB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Ly8gUmVuYW1lIHRlbXAgbG9jYXRpb24gdG8gb3JpZ2luYWxcblx0XHRcdGF3YWl0IEZTUHJvbWlzZXMucmVuYW1lKHRlbXBMb2NhdGlvbi5mc1BhdGgsIGxvY2F0aW9uLmZzUGF0aCwgMiAqIDYwICogMTAwMCAvKiBSZXRyeSBmb3IgMiBtaW51dGVzICovKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dHJ5IHsgYXdhaXQgdGhpcy5maWxlU2VydmljZS5kZWwodGVtcExvY2F0aW9uKTsgfSBjYXRjaCAoZSkgeyAvKiBpZ25vcmUgKi8gfVxuXHRcdFx0bGV0IGV4aXN0cyA9IGZhbHNlO1xuXHRcdFx0dHJ5IHsgZXhpc3RzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMobG9jYXRpb24pOyB9IGNhdGNoIChlKSB7IC8qIGlnbm9yZSAqLyB9XG5cdFx0XHRpZiAoZXhpc3RzKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBSZW5hbWUgZmFpbGVkIGJlY2F1c2UgdGhlIGZpbGUgd2FzIGRvd25sb2FkZWQgYnkgYW5vdGhlciBzb3VyY2UuIFNvIGlnbm9yaW5nIHJlbmFtaW5nLmAsIGV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLCBsb2NhdGlvbi5wYXRoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBSZW5hbWUgZmFpbGVkIGJlY2F1c2Ugb2YgJHtnZXRFcnJvck1lc3NhZ2UoZXJyb3IpfS4gRGVsZXRlZCB0aGUgZmlsZSBmcm9tIGRvd25sb2FkZWQgbG9jYXRpb25gLCB0ZW1wTG9jYXRpb24ucGF0aCk7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9Eb3dubG9hZChleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBuYW1lOiBzdHJpbmcsIGRvd25sb2FkRm46ICgpID0+IFByb21pc2U8dm9pZD4sIHJldHJpZXM6IG51bWJlcik6IFByb21pc2U8bnVtYmVyPiB7XG5cdFx0bGV0IGF0dGVtcHRzID0gMTtcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZG93bmxvYWRGbigpO1xuXHRcdFx0XHRyZXR1cm4gYXR0ZW1wdHM7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGlmIChhdHRlbXB0cysrID4gcmV0cmllcykge1xuXHRcdFx0XHRcdHRocm93IGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYEZhaWxlZCBkb3dubG9hZGluZyAke25hbWV9LiAke2dldEVycm9yTWVzc2FnZShlKX0uIFJldHJ5IGFnYWluLi4uYCwgZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyB2YWxpZGF0ZSh6aXBQYXRoOiBzdHJpbmcsIGZpbGVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYnVmZmVyKHppcFBhdGgsIGZpbGVQYXRoKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aHJvdyBmcm9tRXh0cmFjdEVycm9yKGUpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGRlbGV0ZShsb2NhdGlvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5jbGVhblVwUHJvbWlzZTtcblx0XHRjb25zdCB0cmFzaFJlbGF0aXZlUGF0aCA9IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5yZWxhdGl2ZVBhdGgodGhpcy5leHRlbnNpb25zRG93bmxvYWREaXIsIGxvY2F0aW9uKTtcblx0XHRpZiAodHJhc2hSZWxhdGl2ZVBhdGgpIHtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UubW92ZShsb2NhdGlvbiwgdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmpvaW5QYXRoKHRoaXMuZXh0ZW5zaW9uc1RyYXNoRGlyLCB0cmFzaFJlbGF0aXZlUGF0aCksIHRydWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbChsb2NhdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjbGVhblVwKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIShhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyh0aGlzLmV4dGVuc2lvbnNEb3dubG9hZERpcikpKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXh0ZW5zaW9uIFZTSVggZG93bmxvYWRzIGNhY2hlIGRpciBkb2VzIG5vdCBleGlzdCcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZGVsKHRoaXMuZXh0ZW5zaW9uc1RyYXNoRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZXJyb3IpICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBmb2xkZXJTdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKHRoaXMuZXh0ZW5zaW9uc0Rvd25sb2FkRGlyLCB7IHJlc29sdmVNZXRhZGF0YTogdHJ1ZSB9KTtcblx0XHRcdGlmIChmb2xkZXJTdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdGNvbnN0IHRvRGVsZXRlOiBVUklbXSA9IFtdO1xuXHRcdFx0XHRjb25zdCB2c2l4czogW0V4dGVuc2lvbktleSwgSUZpbGVTdGF0V2l0aE1ldGFkYXRhXVtdID0gW107XG5cdFx0XHRcdGNvbnN0IHNpZ25hdHVyZUFyY2hpdmVzOiBVUklbXSA9IFtdO1xuXG5cdFx0XHRcdGZvciAoY29uc3Qgc3RhdCBvZiBmb2xkZXJTdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0aWYgKHN0YXQubmFtZS5lbmRzV2l0aChFeHRlbnNpb25zRG93bmxvYWRlci5TaWduYXR1cmVBcmNoaXZlRXh0ZW5zaW9uKSkge1xuXHRcdFx0XHRcdFx0c2lnbmF0dXJlQXJjaGl2ZXMucHVzaChzdGF0LnJlc291cmNlKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gRXh0ZW5zaW9uS2V5LnBhcnNlKHN0YXQubmFtZSk7XG5cdFx0XHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0XHRcdHZzaXhzLnB1c2goW2V4dGVuc2lvbiwgc3RhdF0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGJ5RXh0ZW5zaW9uID0gZ3JvdXBCeUV4dGVuc2lvbih2c2l4cywgKFtleHRlbnNpb25dKSA9PiBleHRlbnNpb24pO1xuXHRcdFx0XHRjb25zdCBkaXN0aW5jdDogSUZpbGVTdGF0V2l0aE1ldGFkYXRhW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBwIG9mIGJ5RXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0cC5zb3J0KChhLCBiKSA9PiBzZW12ZXIucmNvbXBhcmUoYVswXS52ZXJzaW9uLCBiWzBdLnZlcnNpb24pKTtcblx0XHRcdFx0XHR0b0RlbGV0ZS5wdXNoKC4uLnAuc2xpY2UoMSkubWFwKGUgPT4gZVsxXS5yZXNvdXJjZSkpOyAvLyBEZWxldGUgb3V0ZGF0ZWQgZXh0ZW5zaW9uc1xuXHRcdFx0XHRcdGRpc3RpbmN0LnB1c2gocFswXVsxXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGlzdGluY3Quc29ydCgoYSwgYikgPT4gYS5tdGltZSAtIGIubXRpbWUpOyAvLyBzb3J0IGJ5IG1vZGlmaWVkIHRpbWVcblx0XHRcdFx0dG9EZWxldGUucHVzaCguLi5kaXN0aW5jdC5zbGljZSgwLCBNYXRoLm1heCgwLCBkaXN0aW5jdC5sZW5ndGggLSB0aGlzLmNhY2hlKSkubWFwKHMgPT4gcy5yZXNvdXJjZSkpOyAvLyBSZXRhaW4gbWluaW11bSBjYWNoZVNpemUgYW5kIGRlbGV0ZSB0aGUgcmVzdFxuXHRcdFx0XHR0b0RlbGV0ZS5wdXNoKC4uLnNpZ25hdHVyZUFyY2hpdmVzKTsgLy8gRGVsZXRlIGFsbCBzaWduYXR1cmUgYXJjaGl2ZXNcblxuXHRcdFx0XHRhd2FpdCBQcm9taXNlcy5zZXR0bGVkKHRvRGVsZXRlLm1hcChyZXNvdXJjZSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdEZWxldGluZyBmcm9tIGNhY2hlJywgcmVzb3VyY2UucGF0aCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZmlsZVNlcnZpY2UuZGVsKHJlc291cmNlKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldE5hbWUoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIEV4dGVuc2lvbktleS5jcmVhdGUoZXh0ZW5zaW9uKS50b1N0cmluZygpLnRvTG93ZXJDYXNlKCk7XG5cdH1cblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsWUFBWSxZQUFZO0FBRXhCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsWUFBWSxrQkFBa0I7QUFDdkMsU0FBUyxRQUFR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QSxNQUNEO0FBRUEsWUFBTSxhQUFhLE1BQU0sS0FBSyxZQUFZLFFBQVEsS0FBSyx1QkFBdUIsRUFBRSxpQkFBaUIsS0FBSyxDQUFDO0FBQ3ZHLFVBQUksV0FBVyxVQUFVO0FBQ3hCLGNBQU0sV0FBa0IsQ0FBQztBQUN6QixjQUFNLFFBQWlELENBQUM7QUFDeEQsY0FBTSxvQkFBMkIsQ0FBQztBQUVsQyxtQkFBVyxRQUFRLFdBQVcsVUFBVTtBQUN2QyxjQUFJLEtBQUssS0FBSyxTQUFTLHFCQUFxQix5QkFBeUIsR0FBRztBQUN2RSw4QkFBa0IsS0FBSyxLQUFLLFFBQVE7QUFBQSxVQUNyQyxPQUFPO0FBQ04sa0JBQU0sWUFBWSxhQUFhLE1BQU0sS0FBSyxJQUFJO0FBQzlDLGdCQUFJLFdBQVc7QUFDZCxvQkFBTSxLQUFLLENBQUMsV0FBVyxJQUFJLENBQUM7QUFBQSxZQUM3QjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBRUEsY0FBTSxjQUFjLGlCQUFpQixPQUFPLENBQUMsQ0FBQyxTQUFTLE1BQU0sU0FBUztBQUN0RSxjQUFNLFdBQW9DLENBQUM7QUFDM0MsbUJBQVcsS0FBSyxhQUFhO0FBQzVCLFlBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTSxPQUFPLFNBQVMsRUFBRSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsRUFBRSxPQUFPLENBQUM7QUFDNUQsbUJBQVMsS0FBSyxHQUFHLEVBQUUsTUFBTSxDQUFDLEVBQUUsSUFBSSxPQUFLLEVBQUUsQ0FBQyxFQUFFLFFBQVEsQ0FBQztBQUNuRCxtQkFBUyxLQUFLLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUFBLFFBQ3RCO0FBQ0EsaUJBQVMsS0FBSyxDQUFDLEdBQUcsTUFBTSxFQUFFLFFBQVEsRUFBRSxLQUFLO0FBQ3pDLGlCQUFTLEtBQUssR0FBRyxTQUFTLE1BQU0sR0FBRyxLQUFLLElBQUksR0FBRyxTQUFTLFNBQVMsS0FBSyxLQUFLLENBQUMsRUFBRSxJQUFJLE9BQUssRUFBRSxRQUFRLENBQUM7QUFDbEcsaUJBQVMsS0FBSyxHQUFHLGlCQUFpQjtBQUVsQyxjQUFNLFNBQVMsUUFBUSxTQUFTLElBQUksY0FBWTtBQUMvQyxlQUFLLFdBQVcsTUFBTSx1QkFBdUIsU0FBUyxJQUFJO0FBQzFELGlCQUFPLEtBQUssWUFBWSxJQUFJLFFBQVE7QUFBQSxRQUNyQyxDQUFDLENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRCxTQUFTLEdBQUc7QUFDWCxXQUFLLFdBQVcsTUFBTSxDQUFDO0FBQUEsSUFDeEI7QUFBQSxFQUNEO0FBQUEsRUFFUSxRQUFRLFdBQXNDO0FBQ3JELFdBQU8sYUFBYSxPQUFPLFNBQVMsRUFBRSxTQUFTLEVBQUUsWUFBWTtBQUFBLEVBQzlEO0FBRUQ7QUFyUWEscUJBRVksNEJBQTRCO0FBRnhDLHVCQUFOO0FBQUEsRUFVSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBaEJVOyIsCiAgIm5hbWVzIjogWyJlcnJvciIsICJsb2NhdGlvbiJdCn0K
