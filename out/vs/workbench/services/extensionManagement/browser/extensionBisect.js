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
import { IExtensionManagementService, IGlobalExtensionEnablementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ExtensionType, isResolverExtension } from "../../../../platform/extensions/common/extensions.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { INotificationService, NotificationPriority, Severity } from "../../../../platform/notification/common/notification.js";
import { IHostService } from "../../host/browser/host.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { LifecyclePhase } from "../../lifecycle/common/lifecycle.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions } from "../../../common/contributions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { areSameExtensions } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { IWorkbenchExtensionEnablementService } from "../common/extensionManagement.js";
const IExtensionBisectService = createDecorator("IExtensionBisectService");
class BisectState {
  constructor(extensions, low, high, mid = (low + high) / 2 | 0) {
    this.extensions = extensions;
    this.low = low;
    this.high = high;
    this.mid = mid;
  }
  static fromJSON(raw) {
    if (!raw) {
      return void 0;
    }
    try {
      const data = JSON.parse(raw);
      return new BisectState(data.extensions, data.low, data.high, data.mid);
    } catch {
      return void 0;
    }
  }
}
let ExtensionBisectService = class {
  constructor(logService, _storageService, _envService) {
    this._storageService = _storageService;
    this._envService = _envService;
    this._disabled = /* @__PURE__ */ new Map();
    const raw = _storageService.get(ExtensionBisectService._storageKey, StorageScope.APPLICATION);
    this._state = BisectState.fromJSON(raw);
    if (this._state) {
      const { mid, high } = this._state;
      for (let i = 0; i < this._state.extensions.length; i++) {
        const isDisabled = i >= mid && i < high;
        this._disabled.set(this._state.extensions[i], isDisabled);
      }
      logService.warn("extension BISECT active", [...this._disabled]);
    }
  }
  get isActive() {
    return !!this._state;
  }
  get disabledCount() {
    return this._state ? this._state.high - this._state.mid : -1;
  }
  isDisabledByBisect(extension) {
    if (!this._state) {
      return false;
    }
    if (isResolverExtension(extension.manifest, this._envService.remoteAuthority)) {
      return false;
    }
    if (this._isEnabledInEnv(extension)) {
      return false;
    }
    const disabled = this._disabled.get(extension.identifier.id);
    return disabled ?? false;
  }
  _isEnabledInEnv(extension) {
    return Array.isArray(this._envService.enableExtensions) && this._envService.enableExtensions.some((id) => areSameExtensions({ id }, extension.identifier));
  }
  async start(extensions) {
    if (this._state) {
      throw new Error("invalid state");
    }
    const extensionIds = extensions.map((ext) => ext.identifier.id);
    const newState = new BisectState(extensionIds, 0, extensionIds.length, 0);
    this._storageService.store(ExtensionBisectService._storageKey, JSON.stringify(newState), StorageScope.APPLICATION, StorageTarget.MACHINE);
    await this._storageService.flush();
  }
  async next(seeingBad) {
    if (!this._state) {
      throw new Error("invalid state");
    }
    if (seeingBad && this._state.mid === 0 && this._state.high === this._state.extensions.length) {
      return { bad: true, id: "" };
    }
    if (this._state.low === this._state.high - 1) {
      await this.reset();
      return { id: this._state.extensions[this._state.low], bad: seeingBad };
    }
    const nextState = new BisectState(
      this._state.extensions,
      seeingBad ? this._state.low : this._state.mid,
      seeingBad ? this._state.mid : this._state.high
    );
    this._storageService.store(ExtensionBisectService._storageKey, JSON.stringify(nextState), StorageScope.APPLICATION, StorageTarget.MACHINE);
    await this._storageService.flush();
    return void 0;
  }
  async reset() {
    this._storageService.remove(ExtensionBisectService._storageKey, StorageScope.APPLICATION);
    await this._storageService.flush();
  }
};
ExtensionBisectService._storageKey = "extensionBisectState";
ExtensionBisectService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IWorkbenchEnvironmentService)
], ExtensionBisectService);
registerSingleton(IExtensionBisectService, ExtensionBisectService, InstantiationType.Delayed);
let ExtensionBisectUi = class {
  constructor(contextKeyService, _extensionBisectService, _notificationService, _commandService) {
    this._extensionBisectService = _extensionBisectService;
    this._notificationService = _notificationService;
    this._commandService = _commandService;
    if (_extensionBisectService.isActive) {
      ExtensionBisectUi.ctxIsBisectActive.bindTo(contextKeyService).set(true);
      this._showBisectPrompt();
    }
  }
  _showBisectPrompt() {
    const goodPrompt = {
      label: localize("I cannot reproduce", "I can't reproduce"),
      run: () => this._commandService.executeCommand("extension.bisect.next", false)
    };
    const badPrompt = {
      label: localize("This is Bad", "I can reproduce"),
      run: () => this._commandService.executeCommand("extension.bisect.next", true)
    };
    const stop = {
      label: "Stop Bisect",
      run: () => this._commandService.executeCommand("extension.bisect.stop")
    };
    const message = this._extensionBisectService.disabledCount === 1 ? localize("bisect.singular", "Extension Bisect is active and has disabled 1 extension. Check if you can still reproduce the problem and proceed by selecting from these options.") : localize("bisect.plural", "Extension Bisect is active and has disabled {0} extensions. Check if you can still reproduce the problem and proceed by selecting from these options.", this._extensionBisectService.disabledCount);
    this._notificationService.prompt(
      Severity.Info,
      message,
      [goodPrompt, badPrompt, stop],
      { sticky: true, priority: NotificationPriority.URGENT }
    );
  }
};
ExtensionBisectUi.ctxIsBisectActive = new RawContextKey("isExtensionBisectActive", false);
ExtensionBisectUi = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IExtensionBisectService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, ICommandService)
], ExtensionBisectUi);
Registry.as(Extensions.Workbench).registerWorkbenchContribution(
  ExtensionBisectUi,
  LifecyclePhase.Restored
);
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "extension.bisect.start",
      title: localize2("title.start", "Start Extension Bisect"),
      category: Categories.Help,
      f1: true,
      precondition: ExtensionBisectUi.ctxIsBisectActive.negate(),
      menu: {
        id: MenuId.ViewContainerTitle,
        when: ContextKeyExpr.equals("viewContainer", "workbench.view.extensions"),
        group: "2_enablement",
        order: 4
      }
    });
  }
  async run(accessor) {
    const dialogService = accessor.get(IDialogService);
    const hostService = accessor.get(IHostService);
    const extensionManagement = accessor.get(IExtensionManagementService);
    const extensionEnablementService = accessor.get(IWorkbenchExtensionEnablementService);
    const extensionsBisect = accessor.get(IExtensionBisectService);
    const extensions = (await extensionManagement.getInstalled(ExtensionType.User)).filter((ext) => extensionEnablementService.isEnabled(ext));
    const res = await dialogService.confirm({
      message: localize("msg.start", "Extension Bisect"),
      detail: localize("detail.start", "Extension Bisect will use binary search to find an extension that causes a problem. During the process the window reloads repeatedly (~{0} times). Each time you must confirm if you are still seeing problems.", 2 + Math.log2(extensions.length) | 0),
      primaryButton: localize({ key: "msg2", comment: ["&& denotes a mnemonic"] }, "&&Start Extension Bisect")
    });
    if (res.confirmed) {
      await extensionsBisect.start(extensions);
      hostService.reload();
    }
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "extension.bisect.next",
      title: localize2("title.isBad", "Continue Extension Bisect"),
      category: Categories.Help,
      f1: true,
      precondition: ExtensionBisectUi.ctxIsBisectActive
    });
  }
  async run(accessor, seeingBad) {
    const dialogService = accessor.get(IDialogService);
    const hostService = accessor.get(IHostService);
    const bisectService = accessor.get(IExtensionBisectService);
    const productService = accessor.get(IProductService);
    const extensionEnablementService = accessor.get(IGlobalExtensionEnablementService);
    const commandService = accessor.get(ICommandService);
    if (!bisectService.isActive) {
      return;
    }
    if (seeingBad === void 0) {
      const goodBadStopCancel = await this._checkForBad(dialogService, bisectService);
      if (goodBadStopCancel === null) {
        return;
      }
      seeingBad = goodBadStopCancel;
    }
    if (seeingBad === void 0) {
      await bisectService.reset();
      hostService.reload();
      return;
    }
    const done = await bisectService.next(seeingBad);
    if (!done) {
      hostService.reload();
      return;
    }
    if (done.bad) {
      await dialogService.info(
        localize("done.msg", "Extension Bisect"),
        localize("done.detail2", "Extension Bisect is done but no extension has been identified. This might be a problem with {0}.", productService.nameShort)
      );
    } else {
      const res = await dialogService.confirm({
        type: Severity.Info,
        message: localize("done.msg", "Extension Bisect"),
        primaryButton: localize({ key: "report", comment: ["&& denotes a mnemonic"] }, "&&Report Issue & Continue"),
        cancelButton: localize("continue", "Continue"),
        detail: localize("done.detail", "Extension Bisect is done and has identified {0} as the extension causing the problem.", done.id),
        checkbox: { label: localize("done.disbale", "Keep this extension disabled"), checked: true }
      });
      if (res.checkboxChecked) {
        await extensionEnablementService.disableExtension({ id: done.id }, void 0);
      }
      if (res.confirmed) {
        await commandService.executeCommand("workbench.action.openIssueReporter", done.id);
      }
    }
    await bisectService.reset();
    hostService.reload();
  }
  async _checkForBad(dialogService, bisectService) {
    const { result } = await dialogService.prompt({
      type: Severity.Info,
      message: localize("msg.next", "Extension Bisect"),
      detail: localize("bisect", "Extension Bisect is active and has disabled {0} extensions. Check if you can still reproduce the problem and proceed by selecting from these options.", bisectService.disabledCount),
      buttons: [
        {
          label: localize({ key: "next.good", comment: ["&& denotes a mnemonic"] }, "I ca&&n't reproduce"),
          run: () => false
          // good now
        },
        {
          label: localize({ key: "next.bad", comment: ["&& denotes a mnemonic"] }, "I can &&reproduce"),
          run: () => true
          // bad
        },
        {
          label: localize({ key: "next.stop", comment: ["&& denotes a mnemonic"] }, "&&Stop Bisect"),
          run: () => void 0
          // stop
        }
      ],
      cancelButton: {
        label: localize({ key: "next.cancel", comment: ["&& denotes a mnemonic"] }, "&&Cancel Bisect"),
        run: () => null
        // cancel
      }
    });
    return result;
  }
});
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "extension.bisect.stop",
      title: localize2("title.stop", "Stop Extension Bisect"),
      category: Categories.Help,
      f1: true,
      precondition: ExtensionBisectUi.ctxIsBisectActive
    });
  }
  async run(accessor) {
    const extensionsBisect = accessor.get(IExtensionBisectService);
    const hostService = accessor.get(IHostService);
    await extensionsBisect.reset();
    hostService.reload();
  }
});
export {
  IExtensionBisectService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2Jyb3dzZXIvZXh0ZW5zaW9uQmlzZWN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUsIGxvY2FsaXplMiB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIElHbG9iYWxFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSwgSUxvY2FsRXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uVHlwZSwgSUV4dGVuc2lvbiwgaXNSZXNvbHZlckV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgSVByb21wdENob2ljZSwgTm90aWZpY2F0aW9uUHJpb3JpdHksIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFyZVNhbWVFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudFV0aWwuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5cbi8vIC0tLSBiaXNlY3Qgc2VydmljZVxuXG5leHBvcnQgY29uc3QgSUV4dGVuc2lvbkJpc2VjdFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUV4dGVuc2lvbkJpc2VjdFNlcnZpY2U+KCdJRXh0ZW5zaW9uQmlzZWN0U2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25CaXNlY3RTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0aXNEaXNhYmxlZEJ5QmlzZWN0KGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IGJvb2xlYW47XG5cdGlzQWN0aXZlOiBib29sZWFuO1xuXHRkaXNhYmxlZENvdW50OiBudW1iZXI7XG5cdHN0YXJ0KGV4dGVuc2lvbnM6IElMb2NhbEV4dGVuc2lvbltdKTogUHJvbWlzZTx2b2lkPjtcblx0bmV4dChzZWVpbmdCYWQ6IGJvb2xlYW4pOiBQcm9taXNlPHsgaWQ6IHN0cmluZzsgYmFkOiBib29sZWFuIH0gfCB1bmRlZmluZWQ+O1xuXHRyZXNldCgpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5jbGFzcyBCaXNlY3RTdGF0ZSB7XG5cblx0c3RhdGljIGZyb21KU09OKHJhdzogc3RyaW5nIHwgdW5kZWZpbmVkKTogQmlzZWN0U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGlmICghcmF3KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0aW50ZXJmYWNlIFJhdyBleHRlbmRzIEJpc2VjdFN0YXRlIHsgfVxuXHRcdFx0Y29uc3QgZGF0YTogUmF3ID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0cmV0dXJuIG5ldyBCaXNlY3RTdGF0ZShkYXRhLmV4dGVuc2lvbnMsIGRhdGEubG93LCBkYXRhLmhpZ2gsIGRhdGEubWlkKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgZXh0ZW5zaW9uczogc3RyaW5nW10sXG5cdFx0cmVhZG9ubHkgbG93OiBudW1iZXIsXG5cdFx0cmVhZG9ubHkgaGlnaDogbnVtYmVyLFxuXHRcdHJlYWRvbmx5IG1pZDogbnVtYmVyID0gKChsb3cgKyBoaWdoKSAvIDIpIHwgMFxuXHQpIHsgfVxufVxuXG5jbGFzcyBFeHRlbnNpb25CaXNlY3RTZXJ2aWNlIGltcGxlbWVudHMgSUV4dGVuc2lvbkJpc2VjdFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9zdG9yYWdlS2V5ID0gJ2V4dGVuc2lvbkJpc2VjdFN0YXRlJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZTogQmlzZWN0U3RhdGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc2FibGVkID0gbmV3IE1hcDxzdHJpbmcsIGJvb2xlYW4+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlXG5cdCkge1xuXHRcdGNvbnN0IHJhdyA9IF9zdG9yYWdlU2VydmljZS5nZXQoRXh0ZW5zaW9uQmlzZWN0U2VydmljZS5fc3RvcmFnZUtleSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHR0aGlzLl9zdGF0ZSA9IEJpc2VjdFN0YXRlLmZyb21KU09OKHJhdyk7XG5cblx0XHRpZiAodGhpcy5fc3RhdGUpIHtcblx0XHRcdGNvbnN0IHsgbWlkLCBoaWdoIH0gPSB0aGlzLl9zdGF0ZTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fc3RhdGUuZXh0ZW5zaW9ucy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBpc0Rpc2FibGVkID0gaSA+PSBtaWQgJiYgaSA8IGhpZ2g7XG5cdFx0XHRcdHRoaXMuX2Rpc2FibGVkLnNldCh0aGlzLl9zdGF0ZS5leHRlbnNpb25zW2ldLCBpc0Rpc2FibGVkKTtcblx0XHRcdH1cblx0XHRcdGxvZ1NlcnZpY2Uud2FybignZXh0ZW5zaW9uIEJJU0VDVCBhY3RpdmUnLCBbLi4udGhpcy5fZGlzYWJsZWRdKTtcblx0XHR9XG5cdH1cblxuXHRnZXQgaXNBY3RpdmUoKSB7XG5cdFx0cmV0dXJuICEhdGhpcy5fc3RhdGU7XG5cdH1cblxuXHRnZXQgZGlzYWJsZWRDb3VudCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RhdGUgPyB0aGlzLl9zdGF0ZS5oaWdoIC0gdGhpcy5fc3RhdGUubWlkIDogLTE7XG5cdH1cblxuXHRpc0Rpc2FibGVkQnlCaXNlY3QoZXh0ZW5zaW9uOiBJRXh0ZW5zaW9uKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLl9zdGF0ZSkge1xuXHRcdFx0Ly8gYmlzZWN0IGlzbid0IGFjdGl2ZVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoaXNSZXNvbHZlckV4dGVuc2lvbihleHRlbnNpb24ubWFuaWZlc3QsIHRoaXMuX2VudlNlcnZpY2UucmVtb3RlQXV0aG9yaXR5KSkge1xuXHRcdFx0Ly8gdGhlIGN1cnJlbnQgcmVtb3RlIHJlc29sdmVyIGV4dGVuc2lvbiBjYW5ub3QgYmUgZGlzYWJsZWRcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2lzRW5hYmxlZEluRW52KGV4dGVuc2lvbikpIHtcblx0XHRcdC8vIEV4dGVuc2lvbiBlbmFibGVkIGluIGVudiBjYW5ub3QgYmUgZGlzYWJsZWRcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgZGlzYWJsZWQgPSB0aGlzLl9kaXNhYmxlZC5nZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQpO1xuXHRcdHJldHVybiBkaXNhYmxlZCA/PyBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2lzRW5hYmxlZEluRW52KGV4dGVuc2lvbjogSUV4dGVuc2lvbik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBBcnJheS5pc0FycmF5KHRoaXMuX2VudlNlcnZpY2UuZW5hYmxlRXh0ZW5zaW9ucykgJiYgdGhpcy5fZW52U2VydmljZS5lbmFibGVFeHRlbnNpb25zLnNvbWUoaWQgPT4gYXJlU2FtZUV4dGVuc2lvbnMoeyBpZCB9LCBleHRlbnNpb24uaWRlbnRpZmllcikpO1xuXHR9XG5cblx0YXN5bmMgc3RhcnQoZXh0ZW5zaW9uczogSUxvY2FsRXh0ZW5zaW9uW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5fc3RhdGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignaW52YWxpZCBzdGF0ZScpO1xuXHRcdH1cblx0XHRjb25zdCBleHRlbnNpb25JZHMgPSBleHRlbnNpb25zLm1hcChleHQgPT4gZXh0LmlkZW50aWZpZXIuaWQpO1xuXHRcdGNvbnN0IG5ld1N0YXRlID0gbmV3IEJpc2VjdFN0YXRlKGV4dGVuc2lvbklkcywgMCwgZXh0ZW5zaW9uSWRzLmxlbmd0aCwgMCk7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoRXh0ZW5zaW9uQmlzZWN0U2VydmljZS5fc3RvcmFnZUtleSwgSlNPTi5zdHJpbmdpZnkobmV3U3RhdGUpLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0YXdhaXQgdGhpcy5fc3RvcmFnZVNlcnZpY2UuZmx1c2goKTtcblx0fVxuXG5cdGFzeW5jIG5leHQoc2VlaW5nQmFkOiBib29sZWFuKTogUHJvbWlzZTx7IGlkOiBzdHJpbmc7IGJhZDogYm9vbGVhbiB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLl9zdGF0ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdpbnZhbGlkIHN0YXRlJyk7XG5cdFx0fVxuXHRcdC8vIGNoZWNrIGlmIGJhZCB3aGVuIGFsbCBleHRlbnNpb25zIGFyZSBkaXNhYmxlZFxuXHRcdGlmIChzZWVpbmdCYWQgJiYgdGhpcy5fc3RhdGUubWlkID09PSAwICYmIHRoaXMuX3N0YXRlLmhpZ2ggPT09IHRoaXMuX3N0YXRlLmV4dGVuc2lvbnMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4geyBiYWQ6IHRydWUsIGlkOiAnJyB9O1xuXHRcdH1cblx0XHQvLyBjaGVjayBpZiB0aGVyZSBpcyBvbmx5IG9uZSBsZWZ0XG5cdFx0aWYgKHRoaXMuX3N0YXRlLmxvdyA9PT0gdGhpcy5fc3RhdGUuaGlnaCAtIDEpIHtcblx0XHRcdGF3YWl0IHRoaXMucmVzZXQoKTtcblx0XHRcdHJldHVybiB7IGlkOiB0aGlzLl9zdGF0ZS5leHRlbnNpb25zW3RoaXMuX3N0YXRlLmxvd10sIGJhZDogc2VlaW5nQmFkIH07XG5cdFx0fVxuXHRcdC8vIHRoZSBzZWNvbmQgaGFsZiBpcyBkaXNhYmxlZCBzbyBpZiB0aGVyZSBpcyBzdGlsbCBiYWQgaXQgbXVzdCBiZVxuXHRcdC8vIGluIHRoZSBmaXJzdCBoYWxmXG5cdFx0Y29uc3QgbmV4dFN0YXRlID0gbmV3IEJpc2VjdFN0YXRlKFxuXHRcdFx0dGhpcy5fc3RhdGUuZXh0ZW5zaW9ucyxcblx0XHRcdHNlZWluZ0JhZCA/IHRoaXMuX3N0YXRlLmxvdyA6IHRoaXMuX3N0YXRlLm1pZCxcblx0XHRcdHNlZWluZ0JhZCA/IHRoaXMuX3N0YXRlLm1pZCA6IHRoaXMuX3N0YXRlLmhpZ2gsXG5cdFx0KTtcblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZShFeHRlbnNpb25CaXNlY3RTZXJ2aWNlLl9zdG9yYWdlS2V5LCBKU09OLnN0cmluZ2lmeShuZXh0U3RhdGUpLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0YXdhaXQgdGhpcy5fc3RvcmFnZVNlcnZpY2UuZmx1c2goKTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgcmVzZXQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKEV4dGVuc2lvbkJpc2VjdFNlcnZpY2UuX3N0b3JhZ2VLZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0YXdhaXQgdGhpcy5fc3RvcmFnZVNlcnZpY2UuZmx1c2goKTtcblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJRXh0ZW5zaW9uQmlzZWN0U2VydmljZSwgRXh0ZW5zaW9uQmlzZWN0U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5cbi8vIC0tLSBiaXNlY3QgVUlcblxuY2xhc3MgRXh0ZW5zaW9uQmlzZWN0VWkge1xuXG5cdHN0YXRpYyBjdHhJc0Jpc2VjdEFjdGl2ZSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdpc0V4dGVuc2lvbkJpc2VjdEFjdGl2ZScsIGZhbHNlKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25CaXNlY3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbkJpc2VjdFNlcnZpY2U6IElFeHRlbnNpb25CaXNlY3RTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdCkge1xuXHRcdGlmIChfZXh0ZW5zaW9uQmlzZWN0U2VydmljZS5pc0FjdGl2ZSkge1xuXHRcdFx0RXh0ZW5zaW9uQmlzZWN0VWkuY3R4SXNCaXNlY3RBY3RpdmUuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKS5zZXQodHJ1ZSk7XG5cdFx0XHR0aGlzLl9zaG93QmlzZWN0UHJvbXB0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd0Jpc2VjdFByb21wdCgpOiB2b2lkIHtcblxuXHRcdGNvbnN0IGdvb2RQcm9tcHQ6IElQcm9tcHRDaG9pY2UgPSB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ0kgY2Fubm90IHJlcHJvZHVjZScsIFwiSSBjYW4ndCByZXByb2R1Y2VcIiksXG5cdFx0XHRydW46ICgpID0+IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdleHRlbnNpb24uYmlzZWN0Lm5leHQnLCBmYWxzZSlcblx0XHR9O1xuXHRcdGNvbnN0IGJhZFByb21wdDogSVByb21wdENob2ljZSA9IHtcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnVGhpcyBpcyBCYWQnLCBcIkkgY2FuIHJlcHJvZHVjZVwiKSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2V4dGVuc2lvbi5iaXNlY3QubmV4dCcsIHRydWUpXG5cdFx0fTtcblx0XHRjb25zdCBzdG9wOiBJUHJvbXB0Q2hvaWNlID0ge1xuXHRcdFx0bGFiZWw6ICdTdG9wIEJpc2VjdCcsXG5cdFx0XHRydW46ICgpID0+IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdleHRlbnNpb24uYmlzZWN0LnN0b3AnKVxuXHRcdH07XG5cblx0XHRjb25zdCBtZXNzYWdlID0gdGhpcy5fZXh0ZW5zaW9uQmlzZWN0U2VydmljZS5kaXNhYmxlZENvdW50ID09PSAxXG5cdFx0XHQ/IGxvY2FsaXplKCdiaXNlY3Quc2luZ3VsYXInLCBcIkV4dGVuc2lvbiBCaXNlY3QgaXMgYWN0aXZlIGFuZCBoYXMgZGlzYWJsZWQgMSBleHRlbnNpb24uIENoZWNrIGlmIHlvdSBjYW4gc3RpbGwgcmVwcm9kdWNlIHRoZSBwcm9ibGVtIGFuZCBwcm9jZWVkIGJ5IHNlbGVjdGluZyBmcm9tIHRoZXNlIG9wdGlvbnMuXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdiaXNlY3QucGx1cmFsJywgXCJFeHRlbnNpb24gQmlzZWN0IGlzIGFjdGl2ZSBhbmQgaGFzIGRpc2FibGVkIHswfSBleHRlbnNpb25zLiBDaGVjayBpZiB5b3UgY2FuIHN0aWxsIHJlcHJvZHVjZSB0aGUgcHJvYmxlbSBhbmQgcHJvY2VlZCBieSBzZWxlY3RpbmcgZnJvbSB0aGVzZSBvcHRpb25zLlwiLCB0aGlzLl9leHRlbnNpb25CaXNlY3RTZXJ2aWNlLmRpc2FibGVkQ291bnQpO1xuXG5cdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRTZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZSxcblx0XHRcdFtnb29kUHJvbXB0LCBiYWRQcm9tcHQsIHN0b3BdLFxuXHRcdFx0eyBzdGlja3k6IHRydWUsIHByaW9yaXR5OiBOb3RpZmljYXRpb25Qcmlvcml0eS5VUkdFTlQgfVxuXHRcdCk7XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpLnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKFxuXHRFeHRlbnNpb25CaXNlY3RVaSxcblx0TGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWRcbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2V4dGVuc2lvbi5iaXNlY3Quc3RhcnQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGl0bGUuc3RhcnQnLCAnU3RhcnQgRXh0ZW5zaW9uIEJpc2VjdCcpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuSGVscCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFeHRlbnNpb25CaXNlY3RVaS5jdHhJc0Jpc2VjdEFjdGl2ZS5uZWdhdGUoKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3Q29udGFpbmVyVGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlld0NvbnRhaW5lcicsICd3b3JrYmVuY2gudmlldy5leHRlbnNpb25zJyksXG5cdFx0XHRcdGdyb3VwOiAnMl9lbmFibGVtZW50Jyxcblx0XHRcdFx0b3JkZXI6IDRcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRpYWxvZ1NlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSURpYWxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IGhvc3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElIb3N0U2VydmljZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uTWFuYWdlbWVudCA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hFeHRlbnNpb25FbmFibGVtZW50U2VydmljZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc0Jpc2VjdCA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uQmlzZWN0U2VydmljZSk7XG5cblx0XHRjb25zdCBleHRlbnNpb25zID0gKGF3YWl0IGV4dGVuc2lvbk1hbmFnZW1lbnQuZ2V0SW5zdGFsbGVkKEV4dGVuc2lvblR5cGUuVXNlcikpLmZpbHRlcihleHQgPT4gZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UuaXNFbmFibGVkKGV4dCkpO1xuXG5cdFx0Y29uc3QgcmVzID0gYXdhaXQgZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdtc2cuc3RhcnQnLCBcIkV4dGVuc2lvbiBCaXNlY3RcIiksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdkZXRhaWwuc3RhcnQnLCBcIkV4dGVuc2lvbiBCaXNlY3Qgd2lsbCB1c2UgYmluYXJ5IHNlYXJjaCB0byBmaW5kIGFuIGV4dGVuc2lvbiB0aGF0IGNhdXNlcyBhIHByb2JsZW0uIER1cmluZyB0aGUgcHJvY2VzcyB0aGUgd2luZG93IHJlbG9hZHMgcmVwZWF0ZWRseSAofnswfSB0aW1lcykuIEVhY2ggdGltZSB5b3UgbXVzdCBjb25maXJtIGlmIHlvdSBhcmUgc3RpbGwgc2VlaW5nIHByb2JsZW1zLlwiLCAyICsgTWF0aC5sb2cyKGV4dGVuc2lvbnMubGVuZ3RoKSB8IDApLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdtc2cyJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmU3RhcnQgRXh0ZW5zaW9uIEJpc2VjdFwiKVxuXHRcdH0pO1xuXG5cdFx0aWYgKHJlcy5jb25maXJtZWQpIHtcblx0XHRcdGF3YWl0IGV4dGVuc2lvbnNCaXNlY3Quc3RhcnQoZXh0ZW5zaW9ucyk7XG5cdFx0XHRob3N0U2VydmljZS5yZWxvYWQoKTtcblx0XHR9XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdleHRlbnNpb24uYmlzZWN0Lm5leHQnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGl0bGUuaXNCYWQnLCAnQ29udGludWUgRXh0ZW5zaW9uIEJpc2VjdCcpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuSGVscCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFeHRlbnNpb25CaXNlY3RVaS5jdHhJc0Jpc2VjdEFjdGl2ZVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBzZWVpbmdCYWQ6IGJvb2xlYW4gfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkaWFsb2dTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElEaWFsb2dTZXJ2aWNlKTtcblx0XHRjb25zdCBob3N0U2VydmljZSA9IGFjY2Vzc29yLmdldChJSG9zdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGJpc2VjdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUV4dGVuc2lvbkJpc2VjdFNlcnZpY2UpO1xuXHRcdGNvbnN0IHByb2R1Y3RTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcm9kdWN0U2VydmljZSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uRW5hYmxlbWVudFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUdsb2JhbEV4dGVuc2lvbkVuYWJsZW1lbnRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29tbWFuZFNlcnZpY2UpO1xuXG5cdFx0aWYgKCFiaXNlY3RTZXJ2aWNlLmlzQWN0aXZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChzZWVpbmdCYWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgZ29vZEJhZFN0b3BDYW5jZWwgPSBhd2FpdCB0aGlzLl9jaGVja0ZvckJhZChkaWFsb2dTZXJ2aWNlLCBiaXNlY3RTZXJ2aWNlKTtcblx0XHRcdGlmIChnb29kQmFkU3RvcENhbmNlbCA9PT0gbnVsbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRzZWVpbmdCYWQgPSBnb29kQmFkU3RvcENhbmNlbDtcblx0XHR9XG5cdFx0aWYgKHNlZWluZ0JhZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRhd2FpdCBiaXNlY3RTZXJ2aWNlLnJlc2V0KCk7XG5cdFx0XHRob3N0U2VydmljZS5yZWxvYWQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZG9uZSA9IGF3YWl0IGJpc2VjdFNlcnZpY2UubmV4dChzZWVpbmdCYWQpO1xuXHRcdGlmICghZG9uZSkge1xuXHRcdFx0aG9zdFNlcnZpY2UucmVsb2FkKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGRvbmUuYmFkKSB7XG5cdFx0XHQvLyBET05FIGJ1dCBub3RoaW5nIGZvdW5kXG5cdFx0XHRhd2FpdCBkaWFsb2dTZXJ2aWNlLmluZm8oXG5cdFx0XHRcdGxvY2FsaXplKCdkb25lLm1zZycsIFwiRXh0ZW5zaW9uIEJpc2VjdFwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2RvbmUuZGV0YWlsMicsIFwiRXh0ZW5zaW9uIEJpc2VjdCBpcyBkb25lIGJ1dCBubyBleHRlbnNpb24gaGFzIGJlZW4gaWRlbnRpZmllZC4gVGhpcyBtaWdodCBiZSBhIHByb2JsZW0gd2l0aCB7MH0uXCIsIHByb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydClcblx0XHRcdCk7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gRE9ORSBhbmQgaWRlbnRpZmllZCBleHRlbnNpb25cblx0XHRcdGNvbnN0IHJlcyA9IGF3YWl0IGRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdkb25lLm1zZycsIFwiRXh0ZW5zaW9uIEJpc2VjdFwiKSxcblx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdyZXBvcnQnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZSZXBvcnQgSXNzdWUgJiBDb250aW51ZVwiKSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiBsb2NhbGl6ZSgnY29udGludWUnLCBcIkNvbnRpbnVlXCIpLFxuXHRcdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdkb25lLmRldGFpbCcsIFwiRXh0ZW5zaW9uIEJpc2VjdCBpcyBkb25lIGFuZCBoYXMgaWRlbnRpZmllZCB7MH0gYXMgdGhlIGV4dGVuc2lvbiBjYXVzaW5nIHRoZSBwcm9ibGVtLlwiLCBkb25lLmlkKSxcblx0XHRcdFx0Y2hlY2tib3g6IHsgbGFiZWw6IGxvY2FsaXplKCdkb25lLmRpc2JhbGUnLCBcIktlZXAgdGhpcyBleHRlbnNpb24gZGlzYWJsZWRcIiksIGNoZWNrZWQ6IHRydWUgfVxuXHRcdFx0fSk7XG5cdFx0XHRpZiAocmVzLmNoZWNrYm94Q2hlY2tlZCkge1xuXHRcdFx0XHRhd2FpdCBleHRlbnNpb25FbmFibGVtZW50U2VydmljZS5kaXNhYmxlRXh0ZW5zaW9uKHsgaWQ6IGRvbmUuaWQgfSwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXMuY29uZmlybWVkKSB7XG5cdFx0XHRcdGF3YWl0IGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5Jc3N1ZVJlcG9ydGVyJywgZG9uZS5pZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGF3YWl0IGJpc2VjdFNlcnZpY2UucmVzZXQoKTtcblx0XHRob3N0U2VydmljZS5yZWxvYWQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NoZWNrRm9yQmFkKGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLCBiaXNlY3RTZXJ2aWNlOiBJRXh0ZW5zaW9uQmlzZWN0U2VydmljZSk6IFByb21pc2U8Ym9vbGVhbiB8IHVuZGVmaW5lZCB8IG51bGw+IHtcblx0XHRjb25zdCB7IHJlc3VsdCB9ID0gYXdhaXQgZGlhbG9nU2VydmljZS5wcm9tcHQ8Ym9vbGVhbiB8IHVuZGVmaW5lZCB8IG51bGw+KHtcblx0XHRcdHR5cGU6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgnbXNnLm5leHQnLCBcIkV4dGVuc2lvbiBCaXNlY3RcIiksXG5cdFx0XHRkZXRhaWw6IGxvY2FsaXplKCdiaXNlY3QnLCBcIkV4dGVuc2lvbiBCaXNlY3QgaXMgYWN0aXZlIGFuZCBoYXMgZGlzYWJsZWQgezB9IGV4dGVuc2lvbnMuIENoZWNrIGlmIHlvdSBjYW4gc3RpbGwgcmVwcm9kdWNlIHRoZSBwcm9ibGVtIGFuZCBwcm9jZWVkIGJ5IHNlbGVjdGluZyBmcm9tIHRoZXNlIG9wdGlvbnMuXCIsIGJpc2VjdFNlcnZpY2UuZGlzYWJsZWRDb3VudCksXG5cdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICduZXh0Lmdvb2QnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiSSBjYSYmbid0IHJlcHJvZHVjZVwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IGZhbHNlIC8vIGdvb2Qgbm93XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICduZXh0LmJhZCcsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCJJIGNhbiAmJnJlcHJvZHVjZVwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHRydWUgLy8gYmFkXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoeyBrZXk6ICduZXh0LnN0b3AnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZTdG9wIEJpc2VjdFwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHVuZGVmaW5lZCAvLyBzdG9wXG5cdFx0XHRcdH1cblx0XHRcdF0sXG5cdFx0XHRjYW5jZWxCdXR0b246IHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAnbmV4dC5jYW5jZWwnLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sIFwiJiZDYW5jZWwgQmlzZWN0XCIpLFxuXHRcdFx0XHRydW46ICgpID0+IG51bGwgLy8gY2FuY2VsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2V4dGVuc2lvbi5iaXNlY3Quc3RvcCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0aXRsZS5zdG9wJywgJ1N0b3AgRXh0ZW5zaW9uIEJpc2VjdCcpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuSGVscCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBFeHRlbnNpb25CaXNlY3RVaS5jdHhJc0Jpc2VjdEFjdGl2ZVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uc0Jpc2VjdCA9IGFjY2Vzc29yLmdldChJRXh0ZW5zaW9uQmlzZWN0U2VydmljZSk7XG5cdFx0Y29uc3QgaG9zdFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUhvc3RTZXJ2aWNlKTtcblx0XHRhd2FpdCBleHRlbnNpb25zQmlzZWN0LnJlc2V0KCk7XG5cdFx0aG9zdFNlcnZpY2UucmVsb2FkKCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsNkJBQTZCLHlDQUEwRDtBQUNoRyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLGVBQTJCLDJCQUEyQjtBQUMvRCxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyxzQkFBcUMsc0JBQXNCLGdCQUFnQjtBQUNwRixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHVCQUF5QztBQUNsRCxTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUyxnQkFBZ0Isb0JBQW9CLHFCQUFxQjtBQUNsRSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFtRDtBQUM1RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLDRDQUE0QztBQUk5QyxNQUFNLDBC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
