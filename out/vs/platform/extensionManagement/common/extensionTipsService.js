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
import { isNonEmptyArray } from "../../../base/common/arrays.js";
import { Disposable, MutableDisposable } from "../../../base/common/lifecycle.js";
import { joinPath } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { IFileService } from "../../files/common/files.js";
import { IProductService } from "../../product/common/productService.js";
import { disposableTimeout } from "../../../base/common/async.js";
import { Event } from "../../../base/common/event.js";
import { join } from "../../../base/common/path.js";
import { isWindows } from "../../../base/common/platform.js";
import { env } from "../../../base/common/process.js";
import { areSameExtensions } from "./extensionManagementUtil.js";
import { RecommendationsNotificationResult, RecommendationSource } from "../../extensionRecommendations/common/extensionRecommendations.js";
import { ExtensionType } from "../../extensions/common/extensions.js";
import { StorageScope, StorageTarget } from "../../storage/common/storage.js";
let ExtensionTipsService = class extends Disposable {
  constructor(fileService, productService) {
    super();
    this.fileService = fileService;
    this.productService = productService;
    this.allConfigBasedTips = /* @__PURE__ */ new Map();
    if (this.productService.configBasedExtensionTips) {
      Object.entries(this.productService.configBasedExtensionTips).forEach(([, value]) => this.allConfigBasedTips.set(value.configPath, value));
    }
  }
  getConfigBasedTips(folder) {
    return this.getValidConfigBasedTips(folder);
  }
  async getImportantExecutableBasedTips() {
    return [];
  }
  async getOtherExecutableBasedTips() {
    return [];
  }
  async getValidConfigBasedTips(folder) {
    const result = [];
    for (const [configPath, tip] of this.allConfigBasedTips) {
      if (tip.configScheme && tip.configScheme !== folder.scheme) {
        continue;
      }
      try {
        const content = (await this.fileService.readFile(joinPath(folder, configPath))).value.toString();
        for (const [key, value] of Object.entries(tip.recommendations)) {
          if (!value.contentPattern || new RegExp(value.contentPattern, "mig").test(content)) {
            result.push({
              extensionId: key,
              extensionName: value.name,
              configName: tip.configName,
              important: !!value.important,
              isExtensionPack: !!value.isExtensionPack,
              whenNotInstalled: value.whenNotInstalled
            });
          }
        }
      } catch (error) {
      }
    }
    return result;
  }
};
ExtensionTipsService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IProductService)
], ExtensionTipsService);
const promptedExecutableTipsStorageKey = "extensionTips/promptedExecutableTips";
const lastPromptedMediumImpExeTimeStorageKey = "extensionTips/lastPromptedMediumImpExeTime";
class AbstractNativeExtensionTipsService extends ExtensionTipsService {
  constructor(userHome, windowEvents, telemetryService, extensionManagementService, storageService, extensionRecommendationNotificationService, fileService, productService) {
    super(fileService, productService);
    this.userHome = userHome;
    this.windowEvents = windowEvents;
    this.telemetryService = telemetryService;
    this.extensionManagementService = extensionManagementService;
    this.storageService = storageService;
    this.extensionRecommendationNotificationService = extensionRecommendationNotificationService;
    this.highImportanceExecutableTips = /* @__PURE__ */ new Map();
    this.mediumImportanceExecutableTips = /* @__PURE__ */ new Map();
    this.allOtherExecutableTips = /* @__PURE__ */ new Map();
    this.highImportanceTipsByExe = /* @__PURE__ */ new Map();
    this.mediumImportanceTipsByExe = /* @__PURE__ */ new Map();
    if (productService.exeBasedExtensionTips) {
      Object.entries(productService.exeBasedExtensionTips).forEach(([key, exeBasedExtensionTip]) => {
        const highImportanceRecommendations = [];
        const mediumImportanceRecommendations = [];
        const otherRecommendations = [];
        Object.entries(exeBasedExtensionTip.recommendations).forEach(([extensionId, value]) => {
          if (value.important) {
            if (exeBasedExtensionTip.important) {
              highImportanceRecommendations.push({ extensionId, extensionName: value.name, isExtensionPack: !!value.isExtensionPack });
            } else {
              mediumImportanceRecommendations.push({ extensionId, extensionName: value.name, isExtensionPack: !!value.isExtensionPack });
            }
          } else {
            otherRecommendations.push({ extensionId, extensionName: value.name, isExtensionPack: !!value.isExtensionPack });
          }
        });
        if (highImportanceRecommendations.length) {
          this.highImportanceExecutableTips.set(key, { exeFriendlyName: exeBasedExtensionTip.friendlyName, windowsPath: exeBasedExtensionTip.windowsPath, recommendations: highImportanceRecommendations });
        }
        if (mediumImportanceRecommendations.length) {
          this.mediumImportanceExecutableTips.set(key, { exeFriendlyName: exeBasedExtensionTip.friendlyName, windowsPath: exeBasedExtensionTip.windowsPath, recommendations: mediumImportanceRecommendations });
        }
        if (otherRecommendations.length) {
          this.allOtherExecutableTips.set(key, { exeFriendlyName: exeBasedExtensionTip.friendlyName, windowsPath: exeBasedExtensionTip.windowsPath, recommendations: otherRecommendations });
        }
      });
    }
    disposableTimeout(async () => {
      await this.collectTips();
      this.promptHighImportanceExeBasedTip();
      this.promptMediumImportanceExeBasedTip();
    }, 3e3, this._store);
  }
  async getImportantExecutableBasedTips() {
    const highImportanceExeTips = await this.getValidExecutableBasedExtensionTips(this.highImportanceExecutableTips);
    const mediumImportanceExeTips = await this.getValidExecutableBasedExtensionTips(this.mediumImportanceExecutableTips);
    return [...highImportanceExeTips, ...mediumImportanceExeTips];
  }
  getOtherExecutableBasedTips() {
    return this.getValidExecutableBasedExtensionTips(this.allOtherExecutableTips);
  }
  async collectTips() {
    const highImportanceExeTips = await this.getValidExecutableBasedExtensionTips(this.highImportanceExecutableTips);
    const mediumImportanceExeTips = await this.getValidExecutableBasedExtensionTips(this.mediumImportanceExecutableTips);
    const local = await this.extensionManagementService.getInstalled();
    this.highImportanceTipsByExe = this.groupImportantTipsByExe(highImportanceExeTips, local);
    this.mediumImportanceTipsByExe = this.groupImportantTipsByExe(mediumImportanceExeTips, local);
  }
  groupImportantTipsByExe(importantExeBasedTips, local) {
    const importantExeBasedRecommendations = /* @__PURE__ */ new Map();
    importantExeBasedTips.forEach((tip) => importantExeBasedRecommendations.set(tip.extensionId.toLowerCase(), tip));
    const { installed, uninstalled: recommendations } = this.groupByInstalled([...importantExeBasedRecommendations.keys()], local);
    for (const extensionId of installed) {
      const tip = importantExeBasedRecommendations.get(extensionId);
      if (tip) {
        this.telemetryService.publicLog2("exeExtensionRecommendations:alreadyInstalled", { extensionId, exeName: tip.exeName });
      }
    }
    for (const extensionId of recommendations) {
      const tip = importantExeBasedRecommendations.get(extensionId);
      if (tip) {
        this.telemetryService.publicLog2("exeExtensionRecommendations:notInstalled", { extensionId, exeName: tip.exeName });
      }
    }
    const promptedExecutableTips = this.getPromptedExecutableTips();
    const tipsByExe = /* @__PURE__ */ new Map();
    for (const extensionId of recommendations) {
      const tip = importantExeBasedRecommendations.get(extensionId);
      if (tip && (!promptedExecutableTips[tip.exeName] || !promptedExecutableTips[tip.exeName].includes(tip.extensionId))) {
        let tips = tipsByExe.get(tip.exeName);
        if (!tips) {
          tips = [];
          tipsByExe.set(tip.exeName, tips);
        }
        tips.push(tip);
      }
    }
    return tipsByExe;
  }
  /**
   * High importance tips are prompted once per restart session
   */
  promptHighImportanceExeBasedTip() {
    if (this.highImportanceTipsByExe.size === 0) {
      return;
    }
    const [exeName, tips] = [...this.highImportanceTipsByExe.entries()][0];
    this.promptExeRecommendations(tips).then((result) => {
      switch (result) {
        case RecommendationsNotificationResult.Accepted:
          this.addToRecommendedExecutables(tips[0].exeName, tips);
          break;
        case RecommendationsNotificationResult.Ignored:
          this.highImportanceTipsByExe.delete(exeName);
          break;
        case RecommendationsNotificationResult.IncompatibleWindow: {
          const onActiveWindowChange = Event.once(Event.latch(Event.any(this.windowEvents.onDidOpenMainWindow, this.windowEvents.onDidFocusMainWindow)));
          this._register(onActiveWindowChange(() => this.promptHighImportanceExeBasedTip()));
          break;
        }
        case RecommendationsNotificationResult.TooMany: {
          const disposable = this._register(new MutableDisposable());
          disposable.value = disposableTimeout(
            () => {
              disposable.dispose();
              this.promptHighImportanceExeBasedTip();
            },
            60 * 60 * 1e3
            /* 1 hour */
          );
          break;
        }
      }
    });
  }
  /**
   * Medium importance tips are prompted once per 7 days
   */
  promptMediumImportanceExeBasedTip() {
    if (this.mediumImportanceTipsByExe.size === 0) {
      return;
    }
    const lastPromptedMediumExeTime = this.getLastPromptedMediumExeTime();
    const timeSinceLastPrompt = Date.now() - lastPromptedMediumExeTime;
    const promptInterval = 7 * 24 * 60 * 60 * 1e3;
    if (timeSinceLastPrompt < promptInterval) {
      const disposable = this._register(new MutableDisposable());
      disposable.value = disposableTimeout(() => {
        disposable.dispose();
        this.promptMediumImportanceExeBasedTip();
      }, promptInterval - timeSinceLastPrompt);
      return;
    }
    const [exeName, tips] = [...this.mediumImportanceTipsByExe.entries()][0];
    this.promptExeRecommendations(tips).then((result) => {
      switch (result) {
        case RecommendationsNotificationResult.Accepted: {
          this.updateLastPromptedMediumExeTime(Date.now());
          this.mediumImportanceTipsByExe.delete(exeName);
          this.addToRecommendedExecutables(tips[0].exeName, tips);
          const disposable1 = this._register(new MutableDisposable());
          disposable1.value = disposableTimeout(() => {
            disposable1.dispose();
            this.promptMediumImportanceExeBasedTip();
          }, promptInterval);
          break;
        }
        case RecommendationsNotificationResult.Ignored:
          this.mediumImportanceTipsByExe.delete(exeName);
          this.promptMediumImportanceExeBasedTip();
          break;
        case RecommendationsNotificationResult.IncompatibleWindow: {
          const onActiveWindowChange = Event.once(Event.latch(Event.any(this.windowEvents.onDidOpenMainWindow, this.windowEvents.onDidFocusMainWindow)));
          this._register(onActiveWindowChange(() => this.promptMediumImportanceExeBasedTip()));
          break;
        }
        case RecommendationsNotificationResult.TooMany: {
          const disposable2 = this._register(new MutableDisposable());
          disposable2.value = disposableTimeout(
            () => {
              disposable2.dispose();
              this.promptMediumImportanceExeBasedTip();
            },
            60 * 60 * 1e3
            /* 1 hour */
          );
          break;
        }
      }
    });
  }
  async promptExeRecommendations(tips) {
    const installed = await this.extensionManagementService.getInstalled(ExtensionType.User);
    const extensions = tips.filter((tip) => !tip.whenNotInstalled || tip.whenNotInstalled.every((id) => installed.every((local) => !areSameExtensions(local.identifier, { id })))).map(({ extensionId }) => extensionId.toLowerCase());
    return this.extensionRecommendationNotificationService.promptImportantExtensionsInstallNotification({ extensions, source: RecommendationSource.EXE, name: tips[0].exeFriendlyName, searchValue: `@exe:"${tips[0].exeName}"` });
  }
  getLastPromptedMediumExeTime() {
    let value = this.storageService.getNumber(lastPromptedMediumImpExeTimeStorageKey, StorageScope.APPLICATION);
    if (!value) {
      value = Date.now();
      this.updateLastPromptedMediumExeTime(value);
    }
    return value;
  }
  updateLastPromptedMediumExeTime(value) {
    this.storageService.store(lastPromptedMediumImpExeTimeStorageKey, value, StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
  getPromptedExecutableTips() {
    return JSON.parse(this.storageService.get(promptedExecutableTipsStorageKey, StorageScope.APPLICATION, "{}"));
  }
  addToRecommendedExecutables(exeName, tips) {
    const promptedExecutableTips = this.getPromptedExecutableTips();
    promptedExecutableTips[exeName] = tips.map(({ extensionId }) => extensionId.toLowerCase());
    this.storageService.store(promptedExecutableTipsStorageKey, JSON.stringify(promptedExecutableTips), StorageScope.APPLICATION, StorageTarget.USER);
  }
  groupByInstalled(recommendationsToSuggest, local) {
    const installed = [], uninstalled = [];
    const installedExtensionsIds = local.reduce((result, i) => {
      result.add(i.identifier.id.toLowerCase());
      return result;
    }, /* @__PURE__ */ new Set());
    recommendationsToSuggest.forEach((id) => {
      if (installedExtensionsIds.has(id.toLowerCase())) {
        installed.push(id);
      } else {
        uninstalled.push(id);
      }
    });
    return { installed, uninstalled };
  }
  async getValidExecutableBasedExtensionTips(executableTips) {
    const result = [];
    const checkedExecutables = /* @__PURE__ */ new Map();
    for (const exeName of executableTips.keys()) {
      const extensionTip = executableTips.get(exeName);
      if (!extensionTip || !isNonEmptyArray(extensionTip.recommendations)) {
        continue;
      }
      const exePaths = [];
      if (isWindows) {
        if (extensionTip.windowsPath) {
          exePaths.push(extensionTip.windowsPath.replace("%USERPROFILE%", () => env["USERPROFILE"]).replace("%ProgramFiles(x86)%", () => env["ProgramFiles(x86)"]).replace("%ProgramFiles%", () => env["ProgramFiles"]).replace("%APPDATA%", () => env["APPDATA"]).replace("%WINDIR%", () => env["WINDIR"]));
        }
      } else {
        exePaths.push(join("/usr/local/bin", exeName));
        exePaths.push(join("/usr/bin", exeName));
        exePaths.push(join(this.userHome.fsPath, exeName));
      }
      for (const exePath of exePaths) {
        let exists = checkedExecutables.get(exePath);
        if (exists === void 0) {
          exists = await this.fileService.exists(URI.file(exePath));
          checkedExecutables.set(exePath, exists);
        }
        if (exists) {
          for (const { extensionId, extensionName, isExtensionPack, whenNotInstalled } of extensionTip.recommendations) {
            result.push({
              extensionId,
              extensionName,
              isExtensionPack,
              exeName,
              exeFriendlyName: extensionTip.exeFriendlyName,
              windowsPath: extensionTip.windowsPath,
              whenNotInstalled
            });
          }
        }
      }
    }
    return result;
  }
}
export {
  AbstractNativeExtensionTipsService,
  ExtensionTipsService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvblRpcHNTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgaXNOb25FbXB0eUFycmF5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb25maWdCYXNlZEV4dGVuc2lvblRpcCBhcyBJUmF3Q29uZmlnQmFzZWRFeHRlbnNpb25UaXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IGpvaW5QYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlnQmFzZWRFeHRlbnNpb25UaXAsIElFeGVjdXRhYmxlQmFzZWRFeHRlbnNpb25UaXAsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgSUV4dGVuc2lvblRpcHNTZXJ2aWNlLCBJTG9jYWxFeHRlbnNpb24gfSBmcm9tICcuL2V4dGVuc2lvbk1hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVudiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Byb2Nlc3MuanMnO1xuaW1wb3J0IHsgYXJlU2FtZUV4dGVuc2lvbnMgfSBmcm9tICcuL2V4dGVuc2lvbk1hbmFnZW1lbnRVdGlsLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25SZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvblNlcnZpY2UsIFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdCwgUmVjb21tZW5kYXRpb25Tb3VyY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMvY29tbW9uL2V4dGVuc2lvblJlY29tbWVuZGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25UeXBlIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5cbi8vI3JlZ2lvbiBCYXNlIEV4dGVuc2lvbiBUaXBzIFNlcnZpY2VcblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvblRpcHNTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25UaXBzU2VydmljZSB7XG5cblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYWxsQ29uZmlnQmFzZWRUaXBzOiBNYXA8c3RyaW5nLCBJUmF3Q29uZmlnQmFzZWRFeHRlbnNpb25UaXA+ID0gbmV3IE1hcDxzdHJpbmcsIElSYXdDb25maWdCYXNlZEV4dGVuc2lvblRpcD4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGlmICh0aGlzLnByb2R1Y3RTZXJ2aWNlLmNvbmZpZ0Jhc2VkRXh0ZW5zaW9uVGlwcykge1xuXHRcdFx0T2JqZWN0LmVudHJpZXModGhpcy5wcm9kdWN0U2VydmljZS5jb25maWdCYXNlZEV4dGVuc2lvblRpcHMpLmZvckVhY2goKFssIHZhbHVlXSkgPT4gdGhpcy5hbGxDb25maWdCYXNlZFRpcHMuc2V0KHZhbHVlLmNvbmZpZ1BhdGgsIHZhbHVlKSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0Q29uZmlnQmFzZWRUaXBzKGZvbGRlcjogVVJJKTogUHJvbWlzZTxJQ29uZmlnQmFzZWRFeHRlbnNpb25UaXBbXT4ge1xuXHRcdHJldHVybiB0aGlzLmdldFZhbGlkQ29uZmlnQmFzZWRUaXBzKGZvbGRlcik7XG5cdH1cblxuXHRhc3luYyBnZXRJbXBvcnRhbnRFeGVjdXRhYmxlQmFzZWRUaXBzKCk6IFByb21pc2U8SUV4ZWN1dGFibGVCYXNlZEV4dGVuc2lvblRpcFtdPiB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0YXN5bmMgZ2V0T3RoZXJFeGVjdXRhYmxlQmFzZWRUaXBzKCk6IFByb21pc2U8SUV4ZWN1dGFibGVCYXNlZEV4dGVuc2lvblRpcFtdPiB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRWYWxpZENvbmZpZ0Jhc2VkVGlwcyhmb2xkZXI6IFVSSSk6IFByb21pc2U8SUNvbmZpZ0Jhc2VkRXh0ZW5zaW9uVGlwW10+IHtcblx0XHRjb25zdCByZXN1bHQ6IElDb25maWdCYXNlZEV4dGVuc2lvblRpcFtdID0gW107XG5cdFx0Zm9yIChjb25zdCBbY29uZmlnUGF0aCwgdGlwXSBvZiB0aGlzLmFsbENvbmZpZ0Jhc2VkVGlwcykge1xuXHRcdFx0aWYgKHRpcC5jb25maWdTY2hlbWUgJiYgdGlwLmNvbmZpZ1NjaGVtZSAhPT0gZm9sZGVyLnNjaGVtZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSAoYXdhaXQgdGhpcy5maWxlU2VydmljZS5yZWFkRmlsZShqb2luUGF0aChmb2xkZXIsIGNvbmZpZ1BhdGgpKSkudmFsdWUudG9TdHJpbmcoKTtcblx0XHRcdFx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXModGlwLnJlY29tbWVuZGF0aW9ucykpIHtcblx0XHRcdFx0XHRpZiAoIXZhbHVlLmNvbnRlbnRQYXR0ZXJuIHx8IG5ldyBSZWdFeHAodmFsdWUuY29udGVudFBhdHRlcm4sICdtaWcnKS50ZXN0KGNvbnRlbnQpKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbklkOiBrZXksXG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbk5hbWU6IHZhbHVlLm5hbWUsXG5cdFx0XHRcdFx0XHRcdGNvbmZpZ05hbWU6IHRpcC5jb25maWdOYW1lLFxuXHRcdFx0XHRcdFx0XHRpbXBvcnRhbnQ6ICEhdmFsdWUuaW1wb3J0YW50LFxuXHRcdFx0XHRcdFx0XHRpc0V4dGVuc2lvblBhY2s6ICEhdmFsdWUuaXNFeHRlbnNpb25QYWNrLFxuXHRcdFx0XHRcdFx0XHR3aGVuTm90SW5zdGFsbGVkOiB2YWx1ZS53aGVuTm90SW5zdGFsbGVkXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7IC8qIElnbm9yZSAqLyB9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuLy8jZW5kcmVnaW9uXG5cbi8vI3JlZ2lvbiBOYXRpdmUgRXh0ZW5zaW9uIFRpcHMgU2VydmljZSAoZW5hYmxlcyB1bml0IHRlc3RpbmcgaGF2aW5nIGl0IGhlcmUgaW4gXCJjb21tb25cIilcblxudHlwZSBFeGVFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnNDbGFzc2lmaWNhdGlvbiA9IHtcblx0b3duZXI6ICdzYW5keTA4MSc7XG5cdGNvbW1lbnQ6ICdJbmZvcm1hdGlvbiBhYm91dCBleGVjdXRhYmxlIGJhc2VkIGV4dGVuc2lvbiByZWNvbW1lbmRhdGlvbic7XG5cdGV4dGVuc2lvbklkOiB7IGNsYXNzaWZpY2F0aW9uOiAnUHVibGljTm9uUGVyc29uYWxEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ2lkIG9mIHRoZSByZWNvbW1lbmRlZCBleHRlbnNpb24nIH07XG5cdGV4ZU5hbWU6IHsgY2xhc3NpZmljYXRpb246ICdQdWJsaWNOb25QZXJzb25hbERhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnbmFtZSBvZiB0aGUgZXhlY3V0YWJsZSBmb3Igd2hpY2ggZXh0ZW5zaW9uIGlzIGJlaW5nIHJlY29tbWVuZGVkJyB9O1xufTtcblxudHlwZSBJRXhlQmFzZWRFeHRlbnNpb25UaXBzID0ge1xuXHRyZWFkb25seSBleGVGcmllbmRseU5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgd2luZG93c1BhdGg/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlY29tbWVuZGF0aW9uczogeyBleHRlbnNpb25JZDogc3RyaW5nOyBleHRlbnNpb25OYW1lOiBzdHJpbmc7IGlzRXh0ZW5zaW9uUGFjazogYm9vbGVhbjsgd2hlbk5vdEluc3RhbGxlZD86IHN0cmluZ1tdIH1bXTtcbn07XG5cbmNvbnN0IHByb21wdGVkRXhlY3V0YWJsZVRpcHNTdG9yYWdlS2V5ID0gJ2V4dGVuc2lvblRpcHMvcHJvbXB0ZWRFeGVjdXRhYmxlVGlwcyc7XG5jb25zdCBsYXN0UHJvbXB0ZWRNZWRpdW1JbXBFeGVUaW1lU3RvcmFnZUtleSA9ICdleHRlbnNpb25UaXBzL2xhc3RQcm9tcHRlZE1lZGl1bUltcEV4ZVRpbWUnO1xuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3ROYXRpdmVFeHRlbnNpb25UaXBzU2VydmljZSBleHRlbmRzIEV4dGVuc2lvblRpcHNTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGhpZ2hJbXBvcnRhbmNlRXhlY3V0YWJsZVRpcHM6IE1hcDxzdHJpbmcsIElFeGVCYXNlZEV4dGVuc2lvblRpcHM+ID0gbmV3IE1hcDxzdHJpbmcsIElFeGVCYXNlZEV4dGVuc2lvblRpcHM+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWVkaXVtSW1wb3J0YW5jZUV4ZWN1dGFibGVUaXBzOiBNYXA8c3RyaW5nLCBJRXhlQmFzZWRFeHRlbnNpb25UaXBzPiA9IG5ldyBNYXA8c3RyaW5nLCBJRXhlQmFzZWRFeHRlbnNpb25UaXBzPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGFsbE90aGVyRXhlY3V0YWJsZVRpcHM6IE1hcDxzdHJpbmcsIElFeGVCYXNlZEV4dGVuc2lvblRpcHM+ID0gbmV3IE1hcDxzdHJpbmcsIElFeGVCYXNlZEV4dGVuc2lvblRpcHM+KCk7XG5cblx0cHJpdmF0ZSBoaWdoSW1wb3J0YW5jZVRpcHNCeUV4ZSA9IG5ldyBNYXA8c3RyaW5nLCBJRXhlY3V0YWJsZUJhc2VkRXh0ZW5zaW9uVGlwW10+KCk7XG5cdHByaXZhdGUgbWVkaXVtSW1wb3J0YW5jZVRpcHNCeUV4ZSA9IG5ldyBNYXA8c3RyaW5nLCBJRXhlY3V0YWJsZUJhc2VkRXh0ZW5zaW9uVGlwW10+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSB1c2VySG9tZTogVVJJLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgd2luZG93RXZlbnRzOiB7XG5cdFx0XHRyZWFkb25seSBvbkRpZE9wZW5NYWluV2luZG93OiBFdmVudDx1bmtub3duPjtcblx0XHRcdHJlYWRvbmx5IG9uRGlkRm9jdXNNYWluV2luZG93OiBFdmVudDx1bmtub3duPjtcblx0XHR9LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9uU2VydmljZTogSUV4dGVuc2lvblJlY29tbWVuZGF0aW9uTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoZmlsZVNlcnZpY2UsIHByb2R1Y3RTZXJ2aWNlKTtcblx0XHRpZiAocHJvZHVjdFNlcnZpY2UuZXhlQmFzZWRFeHRlbnNpb25UaXBzKSB7XG5cdFx0XHRPYmplY3QuZW50cmllcyhwcm9kdWN0U2VydmljZS5leGVCYXNlZEV4dGVuc2lvblRpcHMpLmZvckVhY2goKFtrZXksIGV4ZUJhc2VkRXh0ZW5zaW9uVGlwXSkgPT4ge1xuXHRcdFx0XHRjb25zdCBoaWdoSW1wb3J0YW5jZVJlY29tbWVuZGF0aW9uczogeyBleHRlbnNpb25JZDogc3RyaW5nOyBleHRlbnNpb25OYW1lOiBzdHJpbmc7IGlzRXh0ZW5zaW9uUGFjazogYm9vbGVhbiB9W10gPSBbXTtcblx0XHRcdFx0Y29uc3QgbWVkaXVtSW1wb3J0YW5jZVJlY29tbWVuZGF0aW9uczogeyBleHRlbnNpb25JZDogc3RyaW5nOyBleHRlbnNpb25OYW1lOiBzdHJpbmc7IGlzRXh0ZW5zaW9uUGFjazogYm9vbGVhbiB9W10gPSBbXTtcblx0XHRcdFx0Y29uc3Qgb3RoZXJSZWNvbW1lbmRhdGlvbnM6IHsgZXh0ZW5zaW9uSWQ6IHN0cmluZzsgZXh0ZW5zaW9uTmFtZTogc3RyaW5nOyBpc0V4dGVuc2lvblBhY2s6IGJvb2xlYW4gfVtdID0gW107XG5cdFx0XHRcdE9iamVjdC5lbnRyaWVzKGV4ZUJhc2VkRXh0ZW5zaW9uVGlwLnJlY29tbWVuZGF0aW9ucykuZm9yRWFjaCgoW2V4dGVuc2lvbklkLCB2YWx1ZV0pID0+IHtcblx0XHRcdFx0XHRpZiAodmFsdWUuaW1wb3J0YW50KSB7XG5cdFx0XHRcdFx0XHRpZiAoZXhlQmFzZWRFeHRlbnNpb25UaXAuaW1wb3J0YW50KSB7XG5cdFx0XHRcdFx0XHRcdGhpZ2hJbXBvcnRhbmNlUmVjb21tZW5kYXRpb25zLnB1c2goeyBleHRlbnNpb25JZCwgZXh0ZW5zaW9uTmFtZTogdmFsdWUubmFtZSwgaXNFeHRlbnNpb25QYWNrOiAhIXZhbHVlLmlzRXh0ZW5zaW9uUGFjayB9KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdG1lZGl1bUltcG9ydGFuY2VSZWNvbW1lbmRhdGlvbnMucHVzaCh7IGV4dGVuc2lvbklkLCBleHRlbnNpb25OYW1lOiB2YWx1ZS5uYW1lLCBpc0V4dGVuc2lvblBhY2s6ICEhdmFsdWUuaXNFeHRlbnNpb25QYWNrIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRvdGhlclJlY29tbWVuZGF0aW9ucy5wdXNoKHsgZXh0ZW5zaW9uSWQsIGV4dGVuc2lvbk5hbWU6IHZhbHVlLm5hbWUsIGlzRXh0ZW5zaW9uUGFjazogISF2YWx1ZS5pc0V4dGVuc2lvblBhY2sgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKGhpZ2hJbXBvcnRhbmNlUmVjb21tZW5kYXRpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMuaGlnaEltcG9ydGFuY2VFeGVjdXRhYmxlVGlwcy5zZXQoa2V5LCB7IGV4ZUZyaWVuZGx5TmFtZTogZXhlQmFzZWRFeHRlbnNpb25UaXAuZnJpZW5kbHlOYW1lLCB3aW5kb3dzUGF0aDogZXhlQmFzZWRFeHRlbnNpb25UaXAud2luZG93c1BhdGgsIHJlY29tbWVuZGF0aW9uczogaGlnaEltcG9ydGFuY2VSZWNvbW1lbmRhdGlvbnMgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG1lZGl1bUltcG9ydGFuY2VSZWNvbW1lbmRhdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5tZWRpdW1JbXBvcnRhbmNlRXhlY3V0YWJsZVRpcHMuc2V0KGtleSwgeyBleGVGcmllbmRseU5hbWU6IGV4ZUJhc2VkRXh0ZW5zaW9uVGlwLmZyaWVuZGx5TmFtZSwgd2luZG93c1BhdGg6IGV4ZUJhc2VkRXh0ZW5zaW9uVGlwLndpbmRvd3NQYXRoLCByZWNvbW1lbmRhdGlvbnM6IG1lZGl1bUltcG9ydGFuY2VSZWNvbW1lbmRhdGlvbnMgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG90aGVyUmVjb21tZW5kYXRpb25zLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMuYWxsT3RoZXJFeGVjdXRhYmxlVGlwcy5zZXQoa2V5LCB7IGV4ZUZyaWVuZGx5TmFtZTogZXhlQmFzZWRFeHRlbnNpb25UaXAuZnJpZW5kbHlOYW1lLCB3aW5kb3dzUGF0aDogZXhlQmFzZWRFeHRlbnNpb25UaXAud2luZG93c1BhdGgsIHJlY29tbWVuZGF0aW9uczogb3RoZXJSZWNvbW1lbmRhdGlvbnMgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8qXG5cdFx0XHQzcyBoYXMgY29tZSBvdXQgdG8gYmUgdGhlIGdvb2QgbnVtYmVyIHRvIGZldGNoIGFuZCBwcm9tcHQgaW1wb3J0YW50IGV4ZSBiYXNlZCByZWNvbW1lbmRhdGlvbnNcblx0XHRcdEFsc28gZmV0Y2ggaW1wb3J0YW50IGV4ZSBiYXNlZCByZWNvbW1lbmRhdGlvbnMgZm9yIHJlcG9ydGluZyB0ZWxlbWV0cnlcblx0XHQqL1xuXHRcdGRpc3Bvc2FibGVUaW1lb3V0KGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuY29sbGVjdFRpcHMoKTtcblx0XHRcdHRoaXMucHJvbXB0SGlnaEltcG9ydGFuY2VFeGVCYXNlZFRpcCgpO1xuXHRcdFx0dGhpcy5wcm9tcHRNZWRpdW1JbXBvcnRhbmNlRXhlQmFzZWRUaXAoKTtcblx0XHR9LCAzMDAwLCB0aGlzLl9zdG9yZSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBnZXRJbXBvcnRhbnRFeGVjdXRhYmxlQmFzZWRUaXBzKCk6IFByb21pc2U8SUV4ZWN1dGFibGVCYXNlZEV4dGVuc2lvblRpcFtdPiB7XG5cdFx0Y29uc3QgaGlnaEltcG9ydGFuY2VFeGVUaXBzID0gYXdhaXQgdGhpcy5nZXRWYWxpZEV4ZWN1dGFibGVCYXNlZEV4dGVuc2lvblRpcHModGhpcy5oaWdoSW1wb3J0YW5jZUV4ZWN1dGFibGVUaXBzKTtcblx0XHRjb25zdCBtZWRpdW1JbXBvcnRhbmNlRXhlVGlwcyA9IGF3YWl0IHRoaXMuZ2V0VmFsaWRFeGVjdXRhYmxlQmFzZWRFeHRlbnNpb25UaXBzKHRoaXMubWVkaXVtSW1wb3J0YW5jZUV4ZWN1dGFibGVUaXBzKTtcblx0XHRyZXR1cm4gWy4uLmhpZ2hJbXBvcnRhbmNlRXhlVGlwcywgLi4ubWVkaXVtSW1wb3J0YW5jZUV4ZVRpcHNdO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0T3RoZXJFeGVjdXRhYmxlQmFzZWRUaXBzKCk6IFByb21pc2U8SUV4ZWN1dGFibGVCYXNlZEV4dGVuc2lvblRpcFtdPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0VmFsaWRFeGVjdXRhYmxlQmFzZWRFeHRlbnNpb25UaXBzKHRoaXMuYWxsT3RoZXJFeGVjdXRhYmxlVGlwcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbGxlY3RUaXBzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGhpZ2hJbXBvcnRhbmNlRXhlVGlwcyA9IGF3YWl0IHRoaXMuZ2V0VmFsaWRFeGVjdXRhYmxlQmFzZWRFeHRlbnNpb25UaXBzKHRoaXMuaGlnaEltcG9ydGFuY2VFeGVjdXRhYmxlVGlwcyk7XG5cdFx0Y29uc3QgbWVkaXVtSW1wb3J0YW5jZUV4ZVRpcHMgPSBhd2FpdCB0aGlzLmdldFZhbGlkRXhlY3V0YWJsZUJhc2VkRXh0ZW5zaW9uVGlwcyh0aGlzLm1lZGl1bUltcG9ydGFuY2VFeGVjdXRhYmxlVGlwcyk7XG5cdFx0Y29uc3QgbG9jYWwgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCgpO1xuXG5cdFx0dGhpcy5oaWdoSW1wb3J0YW5jZVRpcHNCeUV4ZSA9IHRoaXMuZ3JvdXBJbXBvcnRhbnRUaXBzQnlFeGUoaGlnaEltcG9ydGFuY2VFeGVUaXBzLCBsb2NhbCk7XG5cdFx0dGhpcy5tZWRpdW1JbXBvcnRhbmNlVGlwc0J5RXhlID0gdGhpcy5ncm91cEltcG9ydGFudFRpcHNCeUV4ZShtZWRpdW1JbXBvcnRhbmNlRXhlVGlwcywgbG9jYWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBncm91cEltcG9ydGFudFRpcHNCeUV4ZShpbXBvcnRhbnRFeGVCYXNlZFRpcHM6IElFeGVjdXRhYmxlQmFzZWRFeHRlbnNpb25UaXBbXSwgbG9jYWw6IElMb2NhbEV4dGVuc2lvbltdKTogTWFwPHN0cmluZywgSUV4ZWN1dGFibGVCYXNlZEV4dGVuc2lvblRpcFtdPiB7XG5cdFx0Y29uc3QgaW1wb3J0YW50RXhlQmFzZWRSZWNvbW1lbmRhdGlvbnMgPSBuZXcgTWFwPHN0cmluZywgSUV4ZWN1dGFibGVCYXNlZEV4dGVuc2lvblRpcD4oKTtcblx0XHRpbXBvcnRhbnRFeGVCYXNlZFRpcHMuZm9yRWFjaCh0aXAgPT4gaW1wb3J0YW50RXhlQmFzZWRSZWNvbW1lbmRhdGlvbnMuc2V0KHRpcC5leHRlbnNpb25JZC50b0xvd2VyQ2FzZSgpLCB0aXApKTtcblxuXHRcdGNvbnN0IHsgaW5zdGFsbGVkLCB1bmluc3RhbGxlZDogcmVjb21tZW5kYXRpb25zIH0gPSB0aGlzLmdyb3VwQnlJbnN0YWxsZWQoWy4uLmltcG9ydGFudEV4ZUJhc2VkUmVjb21tZW5kYXRpb25zLmtleXMoKV0sIGxvY2FsKTtcblxuXHRcdC8qIExvZyBpbnN0YWxsZWQgYW5kIHVuaW5zdGFsbGVkIGV4ZSBiYXNlZCByZWNvbW1lbmRhdGlvbnMgKi9cblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbklkIG9mIGluc3RhbGxlZCkge1xuXHRcdFx0Y29uc3QgdGlwID0gaW1wb3J0YW50RXhlQmFzZWRSZWNvbW1lbmRhdGlvbnMuZ2V0KGV4dGVuc2lvbklkKTtcblx0XHRcdGlmICh0aXApIHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8eyBleGVOYW1lOiBzdHJpbmc7IGV4dGVuc2lvbklkOiBzdHJpbmcgfSwgRXhlRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zQ2xhc3NpZmljYXRpb24+KCdleGVFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnM6YWxyZWFkeUluc3RhbGxlZCcsIHsgZXh0ZW5zaW9uSWQsIGV4ZU5hbWU6IHRpcC5leGVOYW1lIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbklkIG9mIHJlY29tbWVuZGF0aW9ucykge1xuXHRcdFx0Y29uc3QgdGlwID0gaW1wb3J0YW50RXhlQmFzZWRSZWNvbW1lbmRhdGlvbnMuZ2V0KGV4dGVuc2lvbklkKTtcblx0XHRcdGlmICh0aXApIHtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8eyBleGVOYW1lOiBzdHJpbmc7IGV4dGVuc2lvbklkOiBzdHJpbmcgfSwgRXhlRXh0ZW5zaW9uUmVjb21tZW5kYXRpb25zQ2xhc3NpZmljYXRpb24+KCdleGVFeHRlbnNpb25SZWNvbW1lbmRhdGlvbnM6bm90SW5zdGFsbGVkJywgeyBleHRlbnNpb25JZCwgZXhlTmFtZTogdGlwLmV4ZU5hbWUgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJvbXB0ZWRFeGVjdXRhYmxlVGlwcyA9IHRoaXMuZ2V0UHJvbXB0ZWRFeGVjdXRhYmxlVGlwcygpO1xuXHRcdGNvbnN0IHRpcHNCeUV4ZSA9IG5ldyBNYXA8c3RyaW5nLCBJRXhlY3V0YWJsZUJhc2VkRXh0ZW5zaW9uVGlwW10+KCk7XG5cdFx0Zm9yIChjb25zdCBleHRlbnNpb25JZCBvZiByZWNvbW1lbmRhdGlvbnMpIHtcblx0XHRcdGNvbnN0IHRpcCA9IGltcG9ydGFudEV4ZUJhc2VkUmVjb21tZW5kYXRpb25zLmdldChleHRlbnNpb25JZCk7XG5cdFx0XHRpZiAodGlwICYmICghcHJvbXB0ZWRFeGVjdXRhYmxlVGlwc1t0aXAuZXhlTmFtZV0gfHwgIXByb21wdGVkRXhlY3V0YWJsZVRpcHNbdGlwLmV4ZU5hbWVdLmluY2x1ZGVzKHRpcC5leHRlbnNpb25JZCkpKSB7XG5cdFx0XHRcdGxldCB0aXBzID0gdGlwc0J5RXhlLmdldCh0aXAuZXhlTmFtZSk7XG5cdFx0XHRcdGlmICghdGlwcykge1xuXHRcdFx0XHRcdHRpcHMgPSBbXTtcblx0XHRcdFx0XHR0aXBzQnlFeGUuc2V0KHRpcC5leGVOYW1lLCB0aXBzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aXBzLnB1c2godGlwKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGlwc0J5RXhlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEhpZ2ggaW1wb3J0YW5jZSB0aXBzIGFyZSBwcm9tcHRlZCBvbmNlIHBlciByZXN0YXJ0IHNlc3Npb25cblx0ICovXG5cdHByaXZhdGUgcHJvbXB0SGlnaEltcG9ydGFuY2VFeGVCYXNlZFRpcCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5oaWdoSW1wb3J0YW5jZVRpcHNCeUV4ZS5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgW2V4ZU5hbWUsIHRpcHNdID0gWy4uLnRoaXMuaGlnaEltcG9ydGFuY2VUaXBzQnlFeGUuZW50cmllcygpXVswXTtcblx0XHR0aGlzLnByb21wdEV4ZVJlY29tbWVuZGF0aW9ucyh0aXBzKVxuXHRcdFx0LnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0c3dpdGNoIChyZXN1bHQpIHtcblx0XHRcdFx0XHRjYXNlIFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdC5BY2NlcHRlZDpcblx0XHRcdFx0XHRcdHRoaXMuYWRkVG9SZWNvbW1lbmRlZEV4ZWN1dGFibGVzKHRpcHNbMF0uZXhlTmFtZSwgdGlwcyk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdC5JZ25vcmVkOlxuXHRcdFx0XHRcdFx0dGhpcy5oaWdoSW1wb3J0YW5jZVRpcHNCeUV4ZS5kZWxldGUoZXhlTmFtZSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlIFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdC5JbmNvbXBhdGlibGVXaW5kb3c6IHtcblx0XHRcdFx0XHRcdC8vIFJlY29tbWVuZGVkIGluIGluY29tcGF0aWJsZSB3aW5kb3cuIFNjaGVkdWxlIHRoZSBwcm9tcHQgYWZ0ZXIgYWN0aXZlIHdpbmRvdyBjaGFuZ2Vcblx0XHRcdFx0XHRcdGNvbnN0IG9uQWN0aXZlV2luZG93Q2hhbmdlID0gRXZlbnQub25jZShFdmVudC5sYXRjaChFdmVudC5hbnkodGhpcy53aW5kb3dFdmVudHMub25EaWRPcGVuTWFpbldpbmRvdywgdGhpcy53aW5kb3dFdmVudHMub25EaWRGb2N1c01haW5XaW5kb3cpKSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZWdpc3RlcihvbkFjdGl2ZVdpbmRvd0NoYW5nZSgoKSA9PiB0aGlzLnByb21wdEhpZ2hJbXBvcnRhbmNlRXhlQmFzZWRUaXAoKSkpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNhc2UgUmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uUmVzdWx0LlRvb01hbnk6IHtcblx0XHRcdFx0XHRcdC8vIFRvbyBtYW55IG5vdGlmaWNhdGlvbnMuIFNjaGVkdWxlIHRoZSBwcm9tcHQgYWZ0ZXIgb25lIGhvdXJcblx0XHRcdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlLnZhbHVlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4geyBkaXNwb3NhYmxlLmRpc3Bvc2UoKTsgdGhpcy5wcm9tcHRIaWdoSW1wb3J0YW5jZUV4ZUJhc2VkVGlwKCk7IH0sIDYwICogNjAgKiAxMDAwIC8qIDEgaG91ciAqLyk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIE1lZGl1bSBpbXBvcnRhbmNlIHRpcHMgYXJlIHByb21wdGVkIG9uY2UgcGVyIDcgZGF5c1xuXHQgKi9cblx0cHJpdmF0ZSBwcm9tcHRNZWRpdW1JbXBvcnRhbmNlRXhlQmFzZWRUaXAoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubWVkaXVtSW1wb3J0YW5jZVRpcHNCeUV4ZS5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFzdFByb21wdGVkTWVkaXVtRXhlVGltZSA9IHRoaXMuZ2V0TGFzdFByb21wdGVkTWVkaXVtRXhlVGltZSgpO1xuXHRcdGNvbnN0IHRpbWVTaW5jZUxhc3RQcm9tcHQgPSBEYXRlLm5vdygpIC0gbGFzdFByb21wdGVkTWVkaXVtRXhlVGltZTtcblx0XHRjb25zdCBwcm9tcHRJbnRlcnZhbCA9IDcgKiAyNCAqIDYwICogNjAgKiAxMDAwOyAvLyA3IERheXNcblx0XHRpZiAodGltZVNpbmNlTGFzdFByb21wdCA8IHByb21wdEludGVydmFsKSB7XG5cdFx0XHQvLyBXYWl0IHVudGlsIGludGVydmFsIGFuZCBwcm9tcHRcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0XHRkaXNwb3NhYmxlLnZhbHVlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4geyBkaXNwb3NhYmxlLmRpc3Bvc2UoKTsgdGhpcy5wcm9tcHRNZWRpdW1JbXBvcnRhbmNlRXhlQmFzZWRUaXAoKTsgfSwgcHJvbXB0SW50ZXJ2YWwgLSB0aW1lU2luY2VMYXN0UHJvbXB0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBbZXhlTmFtZSwgdGlwc10gPSBbLi4udGhpcy5tZWRpdW1JbXBvcnRhbmNlVGlwc0J5RXhlLmVudHJpZXMoKV1bMF07XG5cdFx0dGhpcy5wcm9tcHRFeGVSZWNvbW1lbmRhdGlvbnModGlwcylcblx0XHRcdC50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRcdHN3aXRjaCAocmVzdWx0KSB7XG5cdFx0XHRcdFx0Y2FzZSBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQuQWNjZXB0ZWQ6IHtcblx0XHRcdFx0XHRcdC8vIEFjY2VwdGVkOiBVcGRhdGUgdGhlIGxhc3QgcHJvbXB0ZWQgdGltZSBhbmQgY2FjaGVzLlxuXHRcdFx0XHRcdFx0dGhpcy51cGRhdGVMYXN0UHJvbXB0ZWRNZWRpdW1FeGVUaW1lKERhdGUubm93KCkpO1xuXHRcdFx0XHRcdFx0dGhpcy5tZWRpdW1JbXBvcnRhbmNlVGlwc0J5RXhlLmRlbGV0ZShleGVOYW1lKTtcblx0XHRcdFx0XHRcdHRoaXMuYWRkVG9SZWNvbW1lbmRlZEV4ZWN1dGFibGVzKHRpcHNbMF0uZXhlTmFtZSwgdGlwcyk7XG5cblx0XHRcdFx0XHRcdC8vIFNjaGVkdWxlIHRoZSBuZXh0IHJlY29tbWVuZGF0aW9uIGZvciBuZXh0IGludGVybnZhbFxuXHRcdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZTEgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlMS52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHsgZGlzcG9zYWJsZTEuZGlzcG9zZSgpOyB0aGlzLnByb21wdE1lZGl1bUltcG9ydGFuY2VFeGVCYXNlZFRpcCgpOyB9LCBwcm9tcHRJbnRlcnZhbCk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQuSWdub3JlZDpcblx0XHRcdFx0XHRcdC8vIElnbm9yZWQ6IFJlbW92ZSBmcm9tIHRoZSBjYWNoZSBhbmQgcHJvbXB0IG5leHQgcmVjb21tZW5kYXRpb25cblx0XHRcdFx0XHRcdHRoaXMubWVkaXVtSW1wb3J0YW5jZVRpcHNCeUV4ZS5kZWxldGUoZXhlTmFtZSk7XG5cdFx0XHRcdFx0XHR0aGlzLnByb21wdE1lZGl1bUltcG9ydGFuY2VFeGVCYXNlZFRpcCgpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cblx0XHRcdFx0XHRjYXNlIFJlY29tbWVuZGF0aW9uc05vdGlmaWNhdGlvblJlc3VsdC5JbmNvbXBhdGlibGVXaW5kb3c6IHtcblx0XHRcdFx0XHRcdC8vIFJlY29tbWVuZGVkIGluIGluY29tcGF0aWJsZSB3aW5kb3cuIFNjaGVkdWxlIHRoZSBwcm9tcHQgYWZ0ZXIgYWN0aXZlIHdpbmRvdyBjaGFuZ2Vcblx0XHRcdFx0XHRcdGNvbnN0IG9uQWN0aXZlV2luZG93Q2hhbmdlID0gRXZlbnQub25jZShFdmVudC5sYXRjaChFdmVudC5hbnkodGhpcy53aW5kb3dFdmVudHMub25EaWRPcGVuTWFpbldpbmRvdywgdGhpcy53aW5kb3dFdmVudHMub25EaWRGb2N1c01haW5XaW5kb3cpKSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9yZWdpc3RlcihvbkFjdGl2ZVdpbmRvd0NoYW5nZSgoKSA9PiB0aGlzLnByb21wdE1lZGl1bUltcG9ydGFuY2VFeGVCYXNlZFRpcCgpKSk7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y2FzZSBSZWNvbW1lbmRhdGlvbnNOb3RpZmljYXRpb25SZXN1bHQuVG9vTWFueToge1xuXHRcdFx0XHRcdFx0Ly8gVG9vIG1hbnkgbm90aWZpY2F0aW9ucy4gU2NoZWR1bGUgdGhlIHByb21wdCBhZnRlciBvbmUgaG91clxuXHRcdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZTIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlMi52YWx1ZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHsgZGlzcG9zYWJsZTIuZGlzcG9zZSgpOyB0aGlzLnByb21wdE1lZGl1bUltcG9ydGFuY2VFeGVCYXNlZFRpcCgpOyB9LCA2MCAqIDYwICogMTAwMCAvKiAxIGhvdXIgKi8pO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcHJvbXB0RXhlUmVjb21tZW5kYXRpb25zKHRpcHM6IElFeGVjdXRhYmxlQmFzZWRFeHRlbnNpb25UaXBbXSk6IFByb21pc2U8UmVjb21tZW5kYXRpb25zTm90aWZpY2F0aW9uUmVzdWx0PiB7XG5cdFx0Y29uc3QgaW5zdGFsbGVkID0gYXdhaXQgdGhpcy5leHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5nZXRJbnN0YWxsZWQoRXh0ZW5zaW9uVHlwZS5Vc2VyKTtcblx0XHRjb25zdCBleHRlbnNpb25zID0gdGlwc1xuXHRcdFx0LmZpbHRlcih0aXAgPT4gIXRpcC53aGVuTm90SW5zdGFsbGVkIHx8IHRpcC53aGVuTm90SW5zdGFsbGVkLmV2ZXJ5KGlkID0+IGluc3RhbGxlZC5ldmVyeShsb2NhbCA9PiAhYXJlU2FtZUV4dGVuc2lvbnMobG9jYWwuaWRlbnRpZmllciwgeyBpZCB9KSkpKVxuXHRcdFx0Lm1hcCgoeyBleHRlbnNpb25JZCB9KSA9PiBleHRlbnNpb25JZC50b0xvd2VyQ2FzZSgpKTtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25SZWNvbW1lbmRhdGlvbk5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0SW1wb3J0YW50RXh0ZW5zaW9uc0luc3RhbGxOb3RpZmljYXRpb24oeyBleHRlbnNpb25zLCBzb3VyY2U6IFJlY29tbWVuZGF0aW9uU291cmNlLkVYRSwgbmFtZTogdGlwc1swXS5leGVGcmllbmRseU5hbWUsIHNlYXJjaFZhbHVlOiBgQGV4ZTpcIiR7dGlwc1swXS5leGVOYW1lfVwiYCB9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TGFzdFByb21wdGVkTWVkaXVtRXhlVGltZSgpOiBudW1iZXIge1xuXHRcdGxldCB2YWx1ZSA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0TnVtYmVyKGxhc3RQcm9tcHRlZE1lZGl1bUltcEV4ZVRpbWVTdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGlmICghdmFsdWUpIHtcblx0XHRcdHZhbHVlID0gRGF0ZS5ub3coKTtcblx0XHRcdHRoaXMudXBkYXRlTGFzdFByb21wdGVkTWVkaXVtRXhlVGltZSh2YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiB2YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTGFzdFByb21wdGVkTWVkaXVtRXhlVGltZSh2YWx1ZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5zdG9yYWdlU2VydmljZS5zdG9yZShsYXN0UHJvbXB0ZWRNZWRpdW1JbXBFeGVUaW1lU3RvcmFnZUtleSwgdmFsdWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UHJvbXB0ZWRFeGVjdXRhYmxlVGlwcygpOiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmdbXT4ge1xuXHRcdHJldHVybiBKU09OLnBhcnNlKHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KHByb21wdGVkRXhlY3V0YWJsZVRpcHNTdG9yYWdlS2V5LCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sICd7fScpKTtcblx0fVxuXG5cdHByaXZhdGUgYWRkVG9SZWNvbW1lbmRlZEV4ZWN1dGFibGVzKGV4ZU5hbWU6IHN0cmluZywgdGlwczogSUV4ZWN1dGFibGVCYXNlZEV4dGVuc2lvblRpcFtdKSB7XG5cdFx0Y29uc3QgcHJvbXB0ZWRFeGVjdXRhYmxlVGlwcyA9IHRoaXMuZ2V0UHJvbXB0ZWRFeGVjdXRhYmxlVGlwcygpO1xuXHRcdHByb21wdGVkRXhlY3V0YWJsZVRpcHNbZXhlTmFtZV0gPSB0aXBzLm1hcCgoeyBleHRlbnNpb25JZCB9KSA9PiBleHRlbnNpb25JZC50b0xvd2VyQ2FzZSgpKTtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHByb21wdGVkRXhlY3V0YWJsZVRpcHNTdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShwcm9tcHRlZEV4ZWN1dGFibGVUaXBzKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0cHJpdmF0ZSBncm91cEJ5SW5zdGFsbGVkKHJlY29tbWVuZGF0aW9uc1RvU3VnZ2VzdDogc3RyaW5nW10sIGxvY2FsOiBJTG9jYWxFeHRlbnNpb25bXSk6IHsgaW5zdGFsbGVkOiBzdHJpbmdbXTsgdW5pbnN0YWxsZWQ6IHN0cmluZ1tdIH0ge1xuXHRcdGNvbnN0IGluc3RhbGxlZDogc3RyaW5nW10gPSBbXSwgdW5pbnN0YWxsZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgaW5zdGFsbGVkRXh0ZW5zaW9uc0lkcyA9IGxvY2FsLnJlZHVjZSgocmVzdWx0LCBpKSA9PiB7IHJlc3VsdC5hZGQoaS5pZGVudGlmaWVyLmlkLnRvTG93ZXJDYXNlKCkpOyByZXR1cm4gcmVzdWx0OyB9LCBuZXcgU2V0PHN0cmluZz4oKSk7XG5cdFx0cmVjb21tZW5kYXRpb25zVG9TdWdnZXN0LmZvckVhY2goaWQgPT4ge1xuXHRcdFx0aWYgKGluc3RhbGxlZEV4dGVuc2lvbnNJZHMuaGFzKGlkLnRvTG93ZXJDYXNlKCkpKSB7XG5cdFx0XHRcdGluc3RhbGxlZC5wdXNoKGlkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHVuaW5zdGFsbGVkLnB1c2goaWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHJldHVybiB7IGluc3RhbGxlZCwgdW5pbnN0YWxsZWQgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0VmFsaWRFeGVjdXRhYmxlQmFzZWRFeHRlbnNpb25UaXBzKGV4ZWN1dGFibGVUaXBzOiBNYXA8c3RyaW5nLCBJRXhlQmFzZWRFeHRlbnNpb25UaXBzPik6IFByb21pc2U8SUV4ZWN1dGFibGVCYXNlZEV4dGVuc2lvblRpcFtdPiB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJRXhlY3V0YWJsZUJhc2VkRXh0ZW5zaW9uVGlwW10gPSBbXTtcblxuXHRcdGNvbnN0IGNoZWNrZWRFeGVjdXRhYmxlczogTWFwPHN0cmluZywgYm9vbGVhbj4gPSBuZXcgTWFwPHN0cmluZywgYm9vbGVhbj4oKTtcblx0XHRmb3IgKGNvbnN0IGV4ZU5hbWUgb2YgZXhlY3V0YWJsZVRpcHMua2V5cygpKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25UaXAgPSBleGVjdXRhYmxlVGlwcy5nZXQoZXhlTmFtZSk7XG5cdFx0XHRpZiAoIWV4dGVuc2lvblRpcCB8fCAhaXNOb25FbXB0eUFycmF5KGV4dGVuc2lvblRpcC5yZWNvbW1lbmRhdGlvbnMpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBleGVQYXRoczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdFx0aWYgKGV4dGVuc2lvblRpcC53aW5kb3dzUGF0aCkge1xuXHRcdFx0XHRcdGV4ZVBhdGhzLnB1c2goZXh0ZW5zaW9uVGlwLndpbmRvd3NQYXRoLnJlcGxhY2UoJyVVU0VSUFJPRklMRSUnLCAoKSA9PiBlbnZbJ1VTRVJQUk9GSUxFJ10hKVxuXHRcdFx0XHRcdFx0LnJlcGxhY2UoJyVQcm9ncmFtRmlsZXMoeDg2KSUnLCAoKSA9PiBlbnZbJ1Byb2dyYW1GaWxlcyh4ODYpJ10hKVxuXHRcdFx0XHRcdFx0LnJlcGxhY2UoJyVQcm9ncmFtRmlsZXMlJywgKCkgPT4gZW52WydQcm9ncmFtRmlsZXMnXSEpXG5cdFx0XHRcdFx0XHQucmVwbGFjZSgnJUFQUERBVEElJywgKCkgPT4gZW52WydBUFBEQVRBJ10hKVxuXHRcdFx0XHRcdFx0LnJlcGxhY2UoJyVXSU5ESVIlJywgKCkgPT4gZW52WydXSU5ESVInXSEpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXhlUGF0aHMucHVzaChqb2luKCcvdXNyL2xvY2FsL2JpbicsIGV4ZU5hbWUpKTtcblx0XHRcdFx0ZXhlUGF0aHMucHVzaChqb2luKCcvdXNyL2JpbicsIGV4ZU5hbWUpKTtcblx0XHRcdFx0ZXhlUGF0aHMucHVzaChqb2luKHRoaXMudXNlckhvbWUuZnNQYXRoLCBleGVOYW1lKSk7XG5cdFx0XHR9XG5cblx0XHRcdGZvciAoY29uc3QgZXhlUGF0aCBvZiBleGVQYXRocykge1xuXHRcdFx0XHRsZXQgZXhpc3RzID0gY2hlY2tlZEV4ZWN1dGFibGVzLmdldChleGVQYXRoKTtcblx0XHRcdFx0aWYgKGV4aXN0cyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0ZXhpc3RzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHMoVVJJLmZpbGUoZXhlUGF0aCkpO1xuXHRcdFx0XHRcdGNoZWNrZWRFeGVjdXRhYmxlcy5zZXQoZXhlUGF0aCwgZXhpc3RzKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZXhpc3RzKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCB7IGV4dGVuc2lvbklkLCBleHRlbnNpb25OYW1lLCBpc0V4dGVuc2lvblBhY2ssIHdoZW5Ob3RJbnN0YWxsZWQgfSBvZiBleHRlbnNpb25UaXAucmVjb21tZW5kYXRpb25zKSB7XG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbklkLFxuXHRcdFx0XHRcdFx0XHRleHRlbnNpb25OYW1lLFxuXHRcdFx0XHRcdFx0XHRpc0V4dGVuc2lvblBhY2ssXG5cdFx0XHRcdFx0XHRcdGV4ZU5hbWUsXG5cdFx0XHRcdFx0XHRcdGV4ZUZyaWVuZGx5TmFtZTogZXh0ZW5zaW9uVGlwLmV4ZUZyaWVuZGx5TmFtZSxcblx0XHRcdFx0XHRcdFx0d2luZG93c1BhdGg6IGV4dGVuc2lvblRpcC53aW5kb3dzUGF0aCxcblx0XHRcdFx0XHRcdFx0d2hlbk5vdEluc3RhbGxlZDogd2hlbk5vdEluc3RhbGxlZFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxZQUFZLHlCQUF5QjtBQUU5QyxTQUFTLGdCQUFn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
