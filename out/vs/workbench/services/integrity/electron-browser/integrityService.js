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
import Severity from "../../../../base/common/severity.js";
import { URI } from "../../../../base/common/uri.js";
import { IIntegrityService } from "../common/integrity.js";
import { ILifecycleService, LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { INotificationService, NotificationPriority } from "../../../../platform/notification/common/notification.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { FileAccess } from "../../../../base/common/network.js";
import { IChecksumService } from "../../../../platform/checksum/common/checksumService.js";
import { ILogService } from "../../../../platform/log/common/log.js";
const _IntegrityStorage = class _IntegrityStorage {
  constructor(storageService) {
    this.storageService = storageService;
    this.value = this._read();
  }
  _read() {
    const jsonValue = this.storageService.get(_IntegrityStorage.KEY, StorageScope.APPLICATION);
    if (!jsonValue) {
      return null;
    }
    try {
      return JSON.parse(jsonValue);
    } catch (err) {
      return null;
    }
  }
  get() {
    return this.value;
  }
  set(data) {
    this.value = data;
    this.storageService.store(_IntegrityStorage.KEY, JSON.stringify(this.value), StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
};
_IntegrityStorage.KEY = "integrityService";
let IntegrityStorage = _IntegrityStorage;
let IntegrityService = class {
  constructor(notificationService, storageService, lifecycleService, openerService, productService, checksumService, logService) {
    this.notificationService = notificationService;
    this.lifecycleService = lifecycleService;
    this.openerService = openerService;
    this.productService = productService;
    this.checksumService = checksumService;
    this.logService = logService;
    this.storage = new IntegrityStorage(storageService);
    this.isPurePromise = this._isPure();
    this._compute();
  }
  isPure() {
    return this.isPurePromise;
  }
  async _compute() {
    const { isPure } = await this.isPure();
    if (isPure) {
      return;
    }
    this.logService.warn(`

----------------------------------------------
***	Installation has been modified on disk ***
----------------------------------------------

`);
    const storedData = this.storage.get();
    if (storedData?.dontShowPrompt && storedData.commit === this.productService.commit) {
      return;
    }
    this._showNotification();
  }
  async _isPure() {
    const expectedChecksums = this.productService.checksums || {};
    await this.lifecycleService.when(LifecyclePhase.Eventually);
    const allResults = await Promise.all(Object.keys(expectedChecksums).map((filename) => this._resolve(filename, expectedChecksums[filename])));
    let isPure = true;
    for (let i = 0, len = allResults.length; i < len; i++) {
      if (!allResults[i].isPure) {
        isPure = false;
        break;
      }
    }
    return {
      isPure,
      proof: allResults
    };
  }
  async _resolve(filename, expected) {
    const fileUri = FileAccess.asFileUri(filename);
    try {
      const checksum = await this.checksumService.checksum(fileUri);
      return IntegrityService._createChecksumPair(fileUri, checksum, expected);
    } catch (error) {
      return IntegrityService._createChecksumPair(fileUri, "", expected);
    }
  }
  static _createChecksumPair(uri, actual, expected) {
    return {
      uri,
      actual,
      expected,
      isPure: actual === expected
    };
  }
  _showNotification() {
    const checksumFailMoreInfoUrl = this.productService.checksumFailMoreInfoUrl;
    const message = localize("integrity.prompt", "Your {0} installation appears to be corrupt. Please reinstall.", this.productService.nameShort);
    if (checksumFailMoreInfoUrl) {
      this.notificationService.prompt(
        Severity.Warning,
        message,
        [
          {
            label: localize("integrity.moreInformation", "More Information"),
            run: () => this.openerService.open(URI.parse(checksumFailMoreInfoUrl))
          },
          {
            label: localize("integrity.dontShowAgain", "Don't Show Again"),
            isSecondary: true,
            run: () => this.storage.set({ dontShowPrompt: true, commit: this.productService.commit })
          }
        ],
        {
          sticky: true,
          priority: NotificationPriority.URGENT
        }
      );
    } else {
      this.notificationService.notify({
        severity: Severity.Warning,
        message,
        sticky: true,
        priority: NotificationPriority.URGENT
      });
    }
  }
};
IntegrityService = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, ILifecycleService),
  __decorateParam(3, IOpenerService),
  __decorateParam(4, IProductService),
  __decorateParam(5, IChecksumService),
  __decorateParam(6, ILogService)
], IntegrityService);
registerSingleton(IIntegrityService, IntegrityService, InstantiationType.Delayed);
export {
  IntegrityService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9pbnRlZ3JpdHkvZWxlY3Ryb24tYnJvd3Nlci9pbnRlZ3JpdHlTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDaGVja3N1bVBhaXIsIElJbnRlZ3JpdHlTZXJ2aWNlLCBJbnRlZ3JpdHlUZXN0UmVzdWx0IH0gZnJvbSAnLi4vY29tbW9uL2ludGVncml0eS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgTm90aWZpY2F0aW9uUHJpb3JpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MsIEFwcFJlc291cmNlUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUNoZWNrc3VtU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NoZWNrc3VtL2NvbW1vbi9jaGVja3N1bVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmludGVyZmFjZSBJU3RvcmFnZURhdGEge1xuXHRyZWFkb25seSBkb250U2hvd1Byb21wdDogYm9vbGVhbjtcblx0cmVhZG9ubHkgY29tbWl0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmNsYXNzIEludGVncml0eVN0b3JhZ2Uge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IEtFWSA9ICdpbnRlZ3JpdHlTZXJ2aWNlJztcblxuXHRwcml2YXRlIHZhbHVlOiBJU3RvcmFnZURhdGEgfCBudWxsO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSkge1xuXHRcdHRoaXMudmFsdWUgPSB0aGlzLl9yZWFkKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWFkKCk6IElTdG9yYWdlRGF0YSB8IG51bGwge1xuXHRcdGNvbnN0IGpzb25WYWx1ZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KEludGVncml0eVN0b3JhZ2UuS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmICghanNvblZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIEpTT04ucGFyc2UoanNvblZhbHVlKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0fVxuXG5cdGdldCgpOiBJU3RvcmFnZURhdGEgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy52YWx1ZTtcblx0fVxuXG5cdHNldChkYXRhOiBJU3RvcmFnZURhdGEgfCBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy52YWx1ZSA9IGRhdGE7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShJbnRlZ3JpdHlTdG9yYWdlLktFWSwgSlNPTi5zdHJpbmdpZnkodGhpcy52YWx1ZSksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW50ZWdyaXR5U2VydmljZSBpbXBsZW1lbnRzIElJbnRlZ3JpdHlTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2U6IEludGVncml0eVN0b3JhZ2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpc1B1cmVQcm9taXNlOiBQcm9taXNlPEludGVncml0eVRlc3RSZXN1bHQ+O1xuXHRpc1B1cmUoKTogUHJvbWlzZTxJbnRlZ3JpdHlUZXN0UmVzdWx0PiB7IHJldHVybiB0aGlzLmlzUHVyZVByb21pc2U7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElDaGVja3N1bVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGVja3N1bVNlcnZpY2U6IElDaGVja3N1bVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5zdG9yYWdlID0gbmV3IEludGVncml0eVN0b3JhZ2Uoc3RvcmFnZVNlcnZpY2UpO1xuXHRcdHRoaXMuaXNQdXJlUHJvbWlzZSA9IHRoaXMuX2lzUHVyZSgpO1xuXG5cdFx0dGhpcy5fY29tcHV0ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29tcHV0ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB7IGlzUHVyZSB9ID0gYXdhaXQgdGhpcy5pc1B1cmUoKTtcblx0XHRpZiAoaXNQdXJlKSB7XG5cdFx0XHRyZXR1cm47IC8vIGFsbCBpcyBnb29kXG5cdFx0fVxuXG5cdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oYFxuXG4tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4qKipcdEluc3RhbGxhdGlvbiBoYXMgYmVlbiBtb2RpZmllZCBvbiBkaXNrICoqKlxuLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5gKTtcblxuXHRcdGNvbnN0IHN0b3JlZERhdGEgPSB0aGlzLnN0b3JhZ2UuZ2V0KCk7XG5cdFx0aWYgKHN0b3JlZERhdGE/LmRvbnRTaG93UHJvbXB0ICYmIHN0b3JlZERhdGEuY29tbWl0ID09PSB0aGlzLnByb2R1Y3RTZXJ2aWNlLmNvbW1pdCkge1xuXHRcdFx0cmV0dXJuOyAvLyBEbyBub3QgcHJvbXB0XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2hvd05vdGlmaWNhdGlvbigpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaXNQdXJlKCk6IFByb21pc2U8SW50ZWdyaXR5VGVzdFJlc3VsdD4ge1xuXHRcdGNvbnN0IGV4cGVjdGVkQ2hlY2tzdW1zID0gdGhpcy5wcm9kdWN0U2VydmljZS5jaGVja3N1bXMgfHwge307XG5cblx0XHRhd2FpdCB0aGlzLmxpZmVjeWNsZVNlcnZpY2Uud2hlbihMaWZlY3ljbGVQaGFzZS5FdmVudHVhbGx5KTtcblxuXHRcdGNvbnN0IGFsbFJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChPYmplY3Qua2V5cyhleHBlY3RlZENoZWNrc3VtcykubWFwKGZpbGVuYW1lID0+IHRoaXMuX3Jlc29sdmUoPEFwcFJlc291cmNlUGF0aD5maWxlbmFtZSwgZXhwZWN0ZWRDaGVja3N1bXNbZmlsZW5hbWVdKSkpO1xuXG5cdFx0bGV0IGlzUHVyZSA9IHRydWU7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IGFsbFJlc3VsdHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGlmICghYWxsUmVzdWx0c1tpXS5pc1B1cmUpIHtcblx0XHRcdFx0aXNQdXJlID0gZmFsc2U7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRpc1B1cmUsXG5cdFx0XHRwcm9vZjogYWxsUmVzdWx0c1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlKGZpbGVuYW1lOiBBcHBSZXNvdXJjZVBhdGgsIGV4cGVjdGVkOiBzdHJpbmcpOiBQcm9taXNlPENoZWNrc3VtUGFpcj4ge1xuXHRcdGNvbnN0IGZpbGVVcmkgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaShmaWxlbmFtZSk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY2hlY2tzdW0gPSBhd2FpdCB0aGlzLmNoZWNrc3VtU2VydmljZS5jaGVja3N1bShmaWxlVXJpKTtcblxuXHRcdFx0cmV0dXJuIEludGVncml0eVNlcnZpY2UuX2NyZWF0ZUNoZWNrc3VtUGFpcihmaWxlVXJpLCBjaGVja3N1bSwgZXhwZWN0ZWQpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRyZXR1cm4gSW50ZWdyaXR5U2VydmljZS5fY3JlYXRlQ2hlY2tzdW1QYWlyKGZpbGVVcmksICcnLCBleHBlY3RlZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NyZWF0ZUNoZWNrc3VtUGFpcih1cmk6IFVSSSwgYWN0dWFsOiBzdHJpbmcsIGV4cGVjdGVkOiBzdHJpbmcpOiBDaGVja3N1bVBhaXIge1xuXHRcdHJldHVybiB7XG5cdFx0XHR1cmk6IHVyaSxcblx0XHRcdGFjdHVhbDogYWN0dWFsLFxuXHRcdFx0ZXhwZWN0ZWQ6IGV4cGVjdGVkLFxuXHRcdFx0aXNQdXJlOiAoYWN0dWFsID09PSBleHBlY3RlZClcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd05vdGlmaWNhdGlvbigpOiB2b2lkIHtcblx0XHRjb25zdCBjaGVja3N1bUZhaWxNb3JlSW5mb1VybCA9IHRoaXMucHJvZHVjdFNlcnZpY2UuY2hlY2tzdW1GYWlsTW9yZUluZm9Vcmw7XG5cdFx0Y29uc3QgbWVzc2FnZSA9IGxvY2FsaXplKCdpbnRlZ3JpdHkucHJvbXB0JywgXCJZb3VyIHswfSBpbnN0YWxsYXRpb24gYXBwZWFycyB0byBiZSBjb3JydXB0LiBQbGVhc2UgcmVpbnN0YWxsLlwiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCk7XG5cdFx0aWYgKGNoZWNrc3VtRmFpbE1vcmVJbmZvVXJsKSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0XHRTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRtZXNzYWdlLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdpbnRlZ3JpdHkubW9yZUluZm9ybWF0aW9uJywgXCJNb3JlIEluZm9ybWF0aW9uXCIpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLm9wZW5lclNlcnZpY2Uub3BlbihVUkkucGFyc2UoY2hlY2tzdW1GYWlsTW9yZUluZm9VcmwpKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdpbnRlZ3JpdHkuZG9udFNob3dBZ2FpbicsIFwiRG9uJ3QgU2hvdyBBZ2FpblwiKSxcblx0XHRcdFx0XHRcdGlzU2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLnN0b3JhZ2Uuc2V0KHsgZG9udFNob3dQcm9tcHQ6IHRydWUsIGNvbW1pdDogdGhpcy5wcm9kdWN0U2VydmljZS5jb21taXQgfSlcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzdGlja3k6IHRydWUsXG5cdFx0XHRcdFx0cHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5LlVSR0VOVFxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2Uubm90aWZ5KHtcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdHN0aWNreTogdHJ1ZSxcblx0XHRcdFx0cHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5LlVSR0VOVFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElJbnRlZ3JpdHlTZXJ2aWNlLCBJbnRlZ3JpdHlTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsV0FBVztBQUNwQixTQUF1Qix5QkFBOEM7QUFDckUsU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQXNCLDRCQUE0QjtBQUMzRCxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFBbUM7QUFDNUMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQkFBbUI7QUFPNUIsTUFBTSxvQkFBTixNQUFNLGtCQUFpQjtBQUFBLEVBTXRCLFlBQTZCLGdCQUFpQztBQUFqQztBQUM1QixTQUFLLFFBQVEsS0FBSyxNQUFNO0FBQUEsRUFDekI7QUFBQSxFQUVRLFFBQTZCO0FBQ3BDLFVBQU0sWUFBWSxLQUFLLGVBQWUsSUFBSSxrQkFBaUIsS0FBSyxhQUFhLFdBQVc7QUFDeEYsUUFBSSxDQUFDLFdBQVc7QUFDZixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUk7QUFDSCxhQUFPLEtBQUssTUFBTSxTQUFTO0FBQUEsSUFDNUIsU0FBUyxLQUFLO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUEyQjtB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
