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
import { VSBuffer } from "../../../base/common/buffer.js";
import { toLocalISOString } from "../../../base/common/date.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { joinPath } from "../../../base/common/resources.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../files/common/files.js";
import { IUserDataProfilesService } from "../../userDataProfile/common/userDataProfile.js";
import { ALL_SYNC_RESOURCES, IUserDataSyncLogService } from "./userDataSync.js";
let UserDataSyncLocalStoreService = class extends Disposable {
  constructor(environmentService, fileService, configurationService, logService, userDataProfilesService) {
    super();
    this.environmentService = environmentService;
    this.fileService = fileService;
    this.configurationService = configurationService;
    this.logService = logService;
    this.userDataProfilesService = userDataProfilesService;
    this.cleanUp();
  }
  async cleanUp() {
    for (const profile of this.userDataProfilesService.profiles) {
      for (const resource of ALL_SYNC_RESOURCES) {
        try {
          await this.cleanUpBackup(this.getResourceBackupHome(resource, profile.isDefault ? void 0 : profile.id));
        } catch (error) {
          this.logService.error(error);
        }
      }
    }
    let stat;
    try {
      stat = await this.fileService.resolve(this.environmentService.userDataSyncHome);
    } catch (error) {
      if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
        this.logService.error(error);
      }
      return;
    }
    if (stat.children) {
      for (const child of stat.children) {
        if (child.isDirectory && !ALL_SYNC_RESOURCES.includes(child.name) && !this.userDataProfilesService.profiles.some((profile) => profile.id === child.name)) {
          try {
            this.logService.info("Deleting non existing profile from backup", child.resource.path);
            await this.fileService.del(child.resource, { recursive: true });
          } catch (error) {
            this.logService.error(error);
          }
        }
      }
    }
  }
  async getAllResourceRefs(resource, collection, root) {
    const folder = this.getResourceBackupHome(resource, collection, root);
    try {
      const stat = await this.fileService.resolve(folder);
      if (stat.children) {
        const all = stat.children.filter((stat2) => stat2.isFile && !stat2.name.startsWith("lastSync")).sort().reverse();
        return all.map((stat2) => ({
          ref: stat2.name,
          created: this.getCreationTime(stat2)
        }));
      }
    } catch (error) {
      if (toFileOperationResult(error) !== FileOperationResult.FILE_NOT_FOUND) {
        throw error;
      }
    }
    return [];
  }
  async resolveResourceContent(resourceKey, ref, collection, root) {
    const folder = this.getResourceBackupHome(resourceKey, collection, root);
    const file = joinPath(folder, ref);
    try {
      const content = await this.fileService.readFile(file);
      return content.value.toString();
    } catch (error) {
      this.logService.error(error);
      return null;
    }
  }
  async writeResource(resourceKey, content, cTime, collection, root) {
    const folder = this.getResourceBackupHome(resourceKey, collection, root);
    const resource = joinPath(folder, `${toLocalISOString(cTime).replace(/-|:|\.\d+Z$/g, "")}.json`);
    try {
      await this.fileService.writeFile(resource, VSBuffer.fromString(content));
    } catch (e) {
      this.logService.error(e);
    }
  }
  getResourceBackupHome(resource, collection, root = this.environmentService.userDataSyncHome) {
    return joinPath(root, ...collection ? [collection, resource] : [resource]);
  }
  async cleanUpBackup(folder) {
    try {
      try {
        if (!await this.fileService.exists(folder)) {
          return;
        }
      } catch (e) {
        return;
      }
      const stat = await this.fileService.resolve(folder);
      if (stat.children) {
        const all = stat.children.filter((stat2) => stat2.isFile && /^\d{8}T\d{6}(\.json)?$/.test(stat2.name)).sort();
        const backUpMaxAge = 1e3 * 60 * 60 * 24 * (this.configurationService.getValue("sync.localBackupDuration") || 30);
        let toDelete = all.filter((stat2) => Date.now() - this.getCreationTime(stat2) > backUpMaxAge);
        const remaining = all.length - toDelete.length;
        if (remaining < 10) {
          toDelete = toDelete.slice(10 - remaining);
        }
        await Promises.settled(toDelete.map(async (stat2) => {
          this.logService.info("Deleting from backup", stat2.resource.path);
          await this.fileService.del(stat2.resource);
        }));
      }
    } catch (e) {
      this.logService.error(e);
    }
  }
  getCreationTime(stat) {
    return new Date(
      parseInt(stat.name.substring(0, 4)),
      parseInt(stat.name.substring(4, 6)) - 1,
      parseInt(stat.name.substring(6, 8)),
      parseInt(stat.name.substring(9, 11)),
      parseInt(stat.name.substring(11, 13)),
      parseInt(stat.name.substring(13, 15))
    ).getTime();
  }
};
UserDataSyncLocalStoreService = __decorateClass([
  __decorateParam(0, IEnvironmentService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IUserDataSyncLogService),
  __decorateParam(4, IUserDataProfilesService)
], UserDataSyncLocalStoreService);
export {
  UserDataSyncLocalStoreService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3VzZXJEYXRhU3luYy9jb21tb24vdXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IHRvTG9jYWxJU09TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UsIElGaWxlU3RhdCwgdG9GaWxlT3BlcmF0aW9uUmVzdWx0IH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IEFMTF9TWU5DX1JFU09VUkNFUywgSVJlc291cmNlUmVmSGFuZGxlLCBJVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2UsIElVc2VyRGF0YVN5bmNMb2dTZXJ2aWNlLCBTeW5jUmVzb3VyY2UgfSBmcm9tICcuL3VzZXJEYXRhU3luYy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBVc2VyRGF0YVN5bmNMb2NhbFN0b3JlU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJVXNlckRhdGFTeW5jTG9jYWxTdG9yZVNlcnZpY2Uge1xuXG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVVzZXJEYXRhU3luY0xvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJVXNlckRhdGFTeW5jTG9nU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmNsZWFuVXAoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2xlYW5VcCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRmb3IgKGNvbnN0IHByb2ZpbGUgb2YgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcykge1xuXHRcdFx0Zm9yIChjb25zdCByZXNvdXJjZSBvZiBBTExfU1lOQ19SRVNPVVJDRVMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmNsZWFuVXBCYWNrdXAodGhpcy5nZXRSZXNvdXJjZUJhY2t1cEhvbWUocmVzb3VyY2UsIHByb2ZpbGUuaXNEZWZhdWx0ID8gdW5kZWZpbmVkIDogcHJvZmlsZS5pZCkpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgc3RhdDogSUZpbGVTdGF0O1xuXHRcdHRyeSB7XG5cdFx0XHRzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAodG9GaWxlT3BlcmF0aW9uUmVzdWx0KGVycm9yKSAhPT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX05PVF9GT1VORCkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChzdGF0LmNoaWxkcmVuKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNoaWxkIG9mIHN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0aWYgKGNoaWxkLmlzRGlyZWN0b3J5ICYmICFBTExfU1lOQ19SRVNPVVJDRVMuaW5jbHVkZXMoPFN5bmNSZXNvdXJjZT5jaGlsZC5uYW1lKSAmJiAhdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5wcm9maWxlcy5zb21lKHByb2ZpbGUgPT4gcHJvZmlsZS5pZCA9PT0gY2hpbGQubmFtZSkpIHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0RlbGV0aW5nIG5vbiBleGlzdGluZyBwcm9maWxlIGZyb20gYmFja3VwJywgY2hpbGQucmVzb3VyY2UucGF0aCk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbChjaGlsZC5yZXNvdXJjZSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZ2V0QWxsUmVzb3VyY2VSZWZzKHJlc291cmNlOiBTeW5jUmVzb3VyY2UsIGNvbGxlY3Rpb24/OiBzdHJpbmcsIHJvb3Q/OiBVUkkpOiBQcm9taXNlPElSZXNvdXJjZVJlZkhhbmRsZVtdPiB7XG5cdFx0Y29uc3QgZm9sZGVyID0gdGhpcy5nZXRSZXNvdXJjZUJhY2t1cEhvbWUocmVzb3VyY2UsIGNvbGxlY3Rpb24sIHJvb3QpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZXNvbHZlKGZvbGRlcik7XG5cdFx0XHRpZiAoc3RhdC5jaGlsZHJlbikge1xuXHRcdFx0XHRjb25zdCBhbGwgPSBzdGF0LmNoaWxkcmVuLmZpbHRlcihzdGF0ID0+IHN0YXQuaXNGaWxlICYmICFzdGF0Lm5hbWUuc3RhcnRzV2l0aCgnbGFzdFN5bmMnKSkuc29ydCgpLnJldmVyc2UoKTtcblx0XHRcdFx0cmV0dXJuIGFsbC5tYXAoc3RhdCA9PiAoe1xuXHRcdFx0XHRcdHJlZjogc3RhdC5uYW1lLFxuXHRcdFx0XHRcdGNyZWF0ZWQ6IHRoaXMuZ2V0Q3JlYXRpb25UaW1lKHN0YXQpXG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKHRvRmlsZU9wZXJhdGlvblJlc3VsdChlcnJvcikgIT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVSZXNvdXJjZUNvbnRlbnQocmVzb3VyY2VLZXk6IFN5bmNSZXNvdXJjZSwgcmVmOiBzdHJpbmcsIGNvbGxlY3Rpb24/OiBzdHJpbmcsIHJvb3Q/OiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IG51bGw+IHtcblx0XHRjb25zdCBmb2xkZXIgPSB0aGlzLmdldFJlc291cmNlQmFja3VwSG9tZShyZXNvdXJjZUtleSwgY29sbGVjdGlvbiwgcm9vdCk7XG5cdFx0Y29uc3QgZmlsZSA9IGpvaW5QYXRoKGZvbGRlciwgcmVmKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUoZmlsZSk7XG5cdFx0XHRyZXR1cm4gY29udGVudC52YWx1ZS50b1N0cmluZygpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgd3JpdGVSZXNvdXJjZShyZXNvdXJjZUtleTogU3luY1Jlc291cmNlLCBjb250ZW50OiBzdHJpbmcsIGNUaW1lOiBEYXRlLCBjb2xsZWN0aW9uPzogc3RyaW5nLCByb290PzogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZm9sZGVyID0gdGhpcy5nZXRSZXNvdXJjZUJhY2t1cEhvbWUocmVzb3VyY2VLZXksIGNvbGxlY3Rpb24sIHJvb3QpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gam9pblBhdGgoZm9sZGVyLCBgJHt0b0xvY2FsSVNPU3RyaW5nKGNUaW1lKS5yZXBsYWNlKC8tfDp8XFwuXFxkK1okL2csICcnKX0uanNvbmApO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLndyaXRlRmlsZShyZXNvdXJjZSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0UmVzb3VyY2VCYWNrdXBIb21lKHJlc291cmNlOiBTeW5jUmVzb3VyY2UsIGNvbGxlY3Rpb24/OiBzdHJpbmcsIHJvb3Q6IFVSSSA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhU3luY0hvbWUpOiBVUkkge1xuXHRcdHJldHVybiBqb2luUGF0aChyb290LCAuLi4oY29sbGVjdGlvbiA/IFtjb2xsZWN0aW9uLCByZXNvdXJjZV0gOiBbcmVzb3VyY2VdKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNsZWFuVXBCYWNrdXAoZm9sZGVyOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0aWYgKCEoYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMoZm9sZGVyKSkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZShmb2xkZXIpO1xuXHRcdFx0aWYgKHN0YXQuY2hpbGRyZW4pIHtcblx0XHRcdFx0Y29uc3QgYWxsID0gc3RhdC5jaGlsZHJlbi5maWx0ZXIoc3RhdCA9PiBzdGF0LmlzRmlsZSAmJiAvXlxcZHs4fVRcXGR7Nn0oXFwuanNvbik/JC8udGVzdChzdGF0Lm5hbWUpKS5zb3J0KCk7XG5cdFx0XHRcdGNvbnN0IGJhY2tVcE1heEFnZSA9IDEwMDAgKiA2MCAqIDYwICogMjQgKiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KCdzeW5jLmxvY2FsQmFja3VwRHVyYXRpb24nKSB8fCAzMCAvKiBEZWZhdWx0IDMwIGRheXMgKi8pO1xuXHRcdFx0XHRsZXQgdG9EZWxldGUgPSBhbGwuZmlsdGVyKHN0YXQgPT4gRGF0ZS5ub3coKSAtIHRoaXMuZ2V0Q3JlYXRpb25UaW1lKHN0YXQpID4gYmFja1VwTWF4QWdlKTtcblx0XHRcdFx0Y29uc3QgcmVtYWluaW5nID0gYWxsLmxlbmd0aCAtIHRvRGVsZXRlLmxlbmd0aDtcblx0XHRcdFx0aWYgKHJlbWFpbmluZyA8IDEwKSB7XG5cdFx0XHRcdFx0dG9EZWxldGUgPSB0b0RlbGV0ZS5zbGljZSgxMCAtIHJlbWFpbmluZyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgUHJvbWlzZXMuc2V0dGxlZCh0b0RlbGV0ZS5tYXAoYXN5bmMgc3RhdCA9PiB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ0RlbGV0aW5nIGZyb20gYmFja3VwJywgc3RhdC5yZXNvdXJjZS5wYXRoKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLmRlbChzdGF0LnJlc291cmNlKTtcblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldENyZWF0aW9uVGltZShzdGF0OiBJRmlsZVN0YXQpIHtcblx0XHRyZXR1cm4gbmV3IERhdGUoXG5cdFx0XHRwYXJzZUludChzdGF0Lm5hbWUuc3Vic3RyaW5nKDAsIDQpKSxcblx0XHRcdHBhcnNlSW50KHN0YXQubmFtZS5zdWJzdHJpbmcoNCwgNikpIC0gMSxcblx0XHRcdHBhcnNlSW50KHN0YXQubmFtZS5zdWJzdHJpbmcoNiwgOCkpLFxuXHRcdFx0cGFyc2VJbnQoc3RhdC5uYW1lLnN1YnN0cmluZyg5LCAxMSkpLFxuXHRcdFx0cGFyc2VJbnQoc3RhdC5uYW1lLnN1YnN0cmluZygxMSwgMTMpKSxcblx0XHRcdHBhcnNlSW50KHN0YXQubmFtZS5zdWJzdHJpbmcoMTMsIDE1KSlcblx0XHQpLmdldFRpbWUoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFCQUFxQixjQUF5Qiw2QkFBNkI7QUFDcEYsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxvQkFBd0UsK0JBQTZDO0FBRXZILElBQU0sZ0NBQU4sY0FBNEMsV0FBcUQ7QUFBQSxFQUl2RyxZQUN1QyxvQkFDUCxhQUNTLHNCQUNFLFlBQ0MseUJBQzFDO0FBQ0QsVUFBTTtBQU5nQztBQUNQO0FBQ1M7QUFDRTtBQUNDO0FBRzNDLFNBQUssUUFBUTtBQUFBLEVBQ2Q7QUFBQSxFQUVBLE1BQWMsVUFBeUI7QUFDdEMsZUFBVyxXQUFXLEtBQUssd0JBQXdCLFVBQVU7QUFDNUQsaUJBQVcsWUFBWSxvQkFBb0I7QUFDMUMsWUFBSTtBQUNILGdCQUFNLEtBQUssY0FBYyxLQUFLLHNCQUFzQixVQUFVLFFBQVEsWUFBWSxTQUFZLFFB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
