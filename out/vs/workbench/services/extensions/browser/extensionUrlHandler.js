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
import { combinedDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IURLService } from "../../../../platform/url/common/url.js";
import { IHostService } from "../../host/browser/host.js";
import { ActivationKind, IExtensionService } from "../common/extensions.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IsWebContext } from "../../../../platform/contextkey/common/contextkeys.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { disposableWindowInterval } from "../../../../base/browser/dom.js";
import { mainWindow } from "../../../../base/browser/window.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { equalsIgnoreCase } from "../../../../base/common/strings.js";
const FIVE_MINUTES = 5 * 60 * 1e3;
const THIRTY_SECONDS = 30 * 1e3;
const URL_TO_HANDLE = "extensionUrlHandler.urlToHandle";
const USER_TRUSTED_EXTENSIONS_CONFIGURATION_KEY = "extensions.confirmedUriHandlerExtensionIds";
const USER_TRUSTED_EXTENSIONS_STORAGE_KEY = "extensionUrlHandler.confirmedExtensions";
function isExtensionId(value) {
  return /^[a-z0-9][a-z0-9\-]*\.[a-z0-9][a-z0-9\-]*$/i.test(value);
}
class UserTrustedExtensionIdStorage {
  constructor(storageService) {
    this.storageService = storageService;
  }
  get extensions() {
    const userTrustedExtensionIdsJson = this.storageService.get(USER_TRUSTED_EXTENSIONS_STORAGE_KEY, StorageScope.PROFILE, "[]");
    try {
      return JSON.parse(userTrustedExtensionIdsJson);
    } catch {
      return [];
    }
  }
  has(id) {
    return this.extensions.indexOf(id) > -1;
  }
  add(id) {
    this.set([...this.extensions, id]);
  }
  set(ids) {
    this.storageService.store(USER_TRUSTED_EXTENSIONS_STORAGE_KEY, JSON.stringify(ids), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
}
const IExtensionUrlHandler = createDecorator("extensionUrlHandler");
class ExtensionUrlHandlerOverrideRegistry {
  static registerHandler(handler) {
    this.handlers.add(handler);
    return toDisposable(() => this.handlers.delete(handler));
  }
  static getHandler(uri) {
    for (const handler of this.handlers) {
      if (handler.canHandleURL(uri)) {
        return handler;
      }
    }
    return void 0;
  }
}
ExtensionUrlHandlerOverrideRegistry.handlers = /* @__PURE__ */ new Set();
let ExtensionUrlHandler = class {
  constructor(urlService, extensionService, dialogService, commandService, hostService, storageService, configurationService, notificationService, productService) {
    this.extensionService = extensionService;
    this.dialogService = dialogService;
    this.commandService = commandService;
    this.hostService = hostService;
    this.storageService = storageService;
    this.configurationService = configurationService;
    this.notificationService = notificationService;
    this.productService = productService;
    this.extensionHandlers = /* @__PURE__ */ new Map();
    this.uriBuffer = /* @__PURE__ */ new Map();
    this.userTrustedExtensionsStorage = new UserTrustedExtensionIdStorage(storageService);
    const interval = disposableWindowInterval(mainWindow, () => this.garbageCollect(), THIRTY_SECONDS);
    const urlToHandleValue = this.storageService.get(URL_TO_HANDLE, StorageScope.WORKSPACE);
    if (urlToHandleValue) {
      this.storageService.remove(URL_TO_HANDLE, StorageScope.WORKSPACE);
      this.handleURL(URI.revive(JSON.parse(urlToHandleValue)), { trusted: true });
    }
    const cache = ExtensionUrlBootstrapHandler.cache;
    const drainTimeout = setTimeout(() => cache.forEach(([uri, option]) => this.handleURL(uri, option)));
    this.disposable = combinedDisposable(
      urlService.registerHandler(this),
      interval,
      toDisposable(() => clearTimeout(drainTimeout))
    );
  }
  async handleURL(uri, options) {
    if (!isExtensionId(uri.authority)) {
      return false;
    }
    const overrideHandler = ExtensionUrlHandlerOverrideRegistry.getHandler(uri);
    if (overrideHandler) {
      const handled = await overrideHandler.handleURL(uri);
      if (handled) {
        return handled;
      }
    }
    const extensionId = uri.authority;
    const initialHandler = this.extensionHandlers.get(ExtensionIdentifier.toKey(extensionId));
    let extensionDisplayName;
    if (!initialHandler) {
      const extension = await this.extensionService.getExtension(extensionId);
      if (!extension) {
        await this.handleUnhandledURL(uri, extensionId, options);
        return true;
      } else {
        extensionDisplayName = extension.displayName ?? "";
      }
    } else {
      extensionDisplayName = initialHandler.extensionDisplayName;
    }
    const trusted = options?.trusted || this.productService.trustedExtensionProtocolHandlers?.some((value) => equalsIgnoreCase(value, extensionId)) || this.didUserTrustExtension(ExtensionIdentifier.toKey(extensionId));
    if (!trusted) {
      const uriString = uri.toString(false);
      let uriLabel = uriString;
      if (uriLabel.length > 40) {
        uriLabel = `${uriLabel.substring(0, 30)}...${uriLabel.substring(uriLabel.length - 5)}`;
      }
      const result = await this.dialogService.confirm({
        message: localize("confirmUrl", "Allow '{0}' extension to open this URI?", extensionDisplayName),
        checkbox: {
          label: localize("rememberConfirmUrl", "Do not ask me again for this extension")
        },
        primaryButton: localize({ key: "open", comment: ["&& denotes a mnemonic"] }, "&&Open"),
        custom: {
          markdownDetails: [{
            markdown: new MarkdownString(`<div title="${uriString}" aria-label='${uriString}'>${uriLabel}</div>`, { supportHtml: true })
          }]
        }
      });
      if (!result.confirmed) {
        return true;
      }
      if (result.checkboxChecked) {
        this.userTrustedExtensionsStorage.add(ExtensionIdentifier.toKey(extensionId));
      }
    }
    const handler = this.extensionHandlers.get(ExtensionIdentifier.toKey(extensionId));
    if (handler) {
      if (!initialHandler) {
        return await this.handleURLByExtension(extensionId, handler, uri, options);
      }
      return false;
    }
    const timestamp = (/* @__PURE__ */ new Date()).getTime();
    let uris = this.uriBuffer.get(ExtensionIdentifier.toKey(extensionId));
    if (!uris) {
      uris = [];
      this.uriBuffer.set(ExtensionIdentifier.toKey(extensionId), uris);
    }
    uris.push({ timestamp, uri });
    await this.extensionService.activateByEvent(`onUri:${ExtensionIdentifier.toKey(extensionId)}`, ActivationKind.Immediate);
    return true;
  }
  registerExtensionHandler(extensionId, handler) {
    this.extensionHandlers.set(ExtensionIdentifier.toKey(extensionId), handler);
    const uris = this.uriBuffer.get(ExtensionIdentifier.toKey(extensionId)) || [];
    for (const { uri } of uris) {
      this.handleURLByExtension(extensionId, handler, uri);
    }
    this.uriBuffer.delete(ExtensionIdentifier.toKey(extensionId));
  }
  unregisterExtensionHandler(extensionId) {
    this.extensionHandlers.delete(ExtensionIdentifier.toKey(extensionId));
  }
  async handleURLByExtension(extensionId, handler, uri, options) {
    return await handler.handleURL(uri, options);
  }
  async handleUnhandledURL(uri, extensionId, options) {
    try {
      await this.commandService.executeCommand("workbench.extensions.installExtension", extensionId, {
        justification: {
          reason: `${localize("installDetail", "This extension wants to open a URI:")}
${uri.toString()}`,
          action: localize("openUri", "Open URI")
        },
        enable: true,
        installPreReleaseVersion: this.productService.quality !== "stable"
      });
    } catch (error) {
      if (!isCancellationError(error)) {
        this.notificationService.error(error);
      }
      return;
    }
    const extension = await this.extensionService.getExtension(extensionId);
    if (extension) {
      await this.handleURL(uri, { ...options, trusted: true });
    } else {
      const result = await this.dialogService.confirm({
        message: localize("reloadAndHandle", "Extension '{0}' is not loaded. Would you like to reload the window to load the extension and open the URL?", extensionId),
        primaryButton: localize({ key: "reloadAndOpen", comment: ["&& denotes a mnemonic"] }, "&&Reload Window and Open")
      });
      if (!result.confirmed) {
        return;
      }
      this.storageService.store(URL_TO_HANDLE, JSON.stringify(uri.toJSON()), StorageScope.WORKSPACE, StorageTarget.MACHINE);
      await this.hostService.reload();
    }
  }
  // forget about all uris buffered more than 5 minutes ago
  garbageCollect() {
    const now = (/* @__PURE__ */ new Date()).getTime();
    const uriBuffer = /* @__PURE__ */ new Map();
    this.uriBuffer.forEach((uris, extensionId) => {
      uris = uris.filter(({ timestamp }) => now - timestamp < FIVE_MINUTES);
      if (uris.length > 0) {
        uriBuffer.set(extensionId, uris);
      }
    });
    this.uriBuffer = uriBuffer;
  }
  didUserTrustExtension(id) {
    if (this.userTrustedExtensionsStorage.has(id)) {
      return true;
    }
    return this.getConfirmedTrustedExtensionIdsFromConfiguration().indexOf(id) > -1;
  }
  getConfirmedTrustedExtensionIdsFromConfiguration() {
    const trustedExtensionIds = this.configurationService.getValue(USER_TRUSTED_EXTENSIONS_CONFIGURATION_KEY);
    if (!Array.isArray(trustedExtensionIds)) {
      return [];
    }
    return trustedExtensionIds;
  }
  dispose() {
    this.disposable.dispose();
    this.extensionHandlers.clear();
    this.uriBuffer.clear();
  }
};
ExtensionUrlHandler = __decorateClass([
  __decorateParam(0, IURLService),
  __decorateParam(1, IExtensionService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, ICommandService),
  __decorateParam(4, IHostService),
  __decorateParam(5, IStorageService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, IProductService)
], ExtensionUrlHandler);
registerSingleton(IExtensionUrlHandler, ExtensionUrlHandler, InstantiationType.Eager);
let ExtensionUrlBootstrapHandler = class {
  static get cache() {
    ExtensionUrlBootstrapHandler.disposable.dispose();
    const result = ExtensionUrlBootstrapHandler._cache;
    ExtensionUrlBootstrapHandler._cache = [];
    return result;
  }
  constructor(urlService) {
    ExtensionUrlBootstrapHandler.disposable = urlService.registerHandler(this);
  }
  async handleURL(uri, options) {
    if (!isExtensionId(uri.authority)) {
      return false;
    }
    ExtensionUrlBootstrapHandler._cache.push([uri, options]);
    return true;
  }
};
ExtensionUrlBootstrapHandler.ID = "workbench.contrib.extensionUrlBootstrapHandler";
ExtensionUrlBootstrapHandler._cache = [];
ExtensionUrlBootstrapHandler = __decorateClass([
  __decorateParam(0, IURLService)
], ExtensionUrlBootstrapHandler);
registerWorkbenchContribution2(
  ExtensionUrlBootstrapHandler.ID,
  ExtensionUrlBootstrapHandler,
  WorkbenchPhase.BlockRestore
  /* registration only */
);
class ManageAuthorizedExtensionURIsAction extends Action2 {
  constructor() {
    super({
      id: "workbench.extensions.action.manageAuthorizedExtensionURIs",
      title: localize2("manage", "Manage Authorized Extension URIs..."),
      category: localize2("extensions", "Extensions"),
      menu: {
        id: MenuId.CommandPalette,
        when: IsWebContext.toNegated()
      }
    });
  }
  async run(accessor) {
    const storageService = accessor.get(IStorageService);
    const quickInputService = accessor.get(IQuickInputService);
    const storage = new UserTrustedExtensionIdStorage(storageService);
    const items = storage.extensions.map((label) => ({ label, picked: true }));
    if (items.length === 0) {
      await quickInputService.pick([{ label: localize("no", "There are currently no authorized extension URIs.") }]);
      return;
    }
    const result = await quickInputService.pick(items, { canPickMany: true });
    if (!result) {
      return;
    }
    storage.set(result.map((item) => item.label));
  }
}
registerAction2(ManageAuthorizedExtensionURIsAction);
export {
  ExtensionUrlHandlerOverrideRegistry,
  IExtensionUrlHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2Jyb3dzZXIvZXh0ZW5zaW9uVXJsSGFuZGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIGNvbWJpbmVkRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVVJMSGFuZGxlciwgSVVSTFNlcnZpY2UsIElPcGVuVVJMT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VybC9jb21tb24vdXJsLmpzJztcbmltcG9ydCB7IElIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uL2hvc3QvYnJvd3Nlci9ob3N0LmpzJztcbmltcG9ydCB7IEFjdGl2YXRpb25LaW5kLCBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiwgV29ya2JlbmNoUGhhc2UsIHJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uMiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJc1dlYkNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlV2luZG93SW50ZXJ2YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBlcXVhbHNJZ25vcmVDYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5cbmNvbnN0IEZJVkVfTUlOVVRFUyA9IDUgKiA2MCAqIDEwMDA7XG5jb25zdCBUSElSVFlfU0VDT05EUyA9IDMwICogMTAwMDtcbmNvbnN0IFVSTF9UT19IQU5ETEUgPSAnZXh0ZW5zaW9uVXJsSGFuZGxlci51cmxUb0hhbmRsZSc7XG5jb25zdCBVU0VSX1RSVVNURURfRVhURU5TSU9OU19DT05GSUdVUkFUSU9OX0tFWSA9ICdleHRlbnNpb25zLmNvbmZpcm1lZFVyaUhhbmRsZXJFeHRlbnNpb25JZHMnO1xuY29uc3QgVVNFUl9UUlVTVEVEX0VYVEVOU0lPTlNfU1RPUkFHRV9LRVkgPSAnZXh0ZW5zaW9uVXJsSGFuZGxlci5jb25maXJtZWRFeHRlbnNpb25zJztcblxuZnVuY3Rpb24gaXNFeHRlbnNpb25JZCh2YWx1ZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAvXlthLXowLTldW2EtejAtOVxcLV0qXFwuW2EtejAtOV1bYS16MC05XFwtXSokL2kudGVzdCh2YWx1ZSk7XG59XG5cbmNsYXNzIFVzZXJUcnVzdGVkRXh0ZW5zaW9uSWRTdG9yYWdlIHtcblxuXHRnZXQgZXh0ZW5zaW9ucygpOiBzdHJpbmdbXSB7XG5cdFx0Y29uc3QgdXNlclRydXN0ZWRFeHRlbnNpb25JZHNKc29uID0gdGhpcy5zdG9yYWdlU2VydmljZS5nZXQoVVNFUl9UUlVTVEVEX0VYVEVOU0lPTlNfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCAnW10nKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gSlNPTi5wYXJzZSh1c2VyVHJ1c3RlZEV4dGVuc2lvbklkc0pzb24pO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSkgeyB9XG5cblx0aGFzKGlkOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5leHRlbnNpb25zLmluZGV4T2YoaWQpID4gLTE7XG5cdH1cblxuXHRhZGQoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuc2V0KFsuLi50aGlzLmV4dGVuc2lvbnMsIGlkXSk7XG5cdH1cblxuXHRzZXQoaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoVVNFUl9UUlVTVEVEX0VYVEVOU0lPTlNfU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KGlkcyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBJRXh0ZW5zaW9uVXJsSGFuZGxlciA9IGNyZWF0ZURlY29yYXRvcjxJRXh0ZW5zaW9uVXJsSGFuZGxlcj4oJ2V4dGVuc2lvblVybEhhbmRsZXInKTtcblxuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uQ29udHJpYnV0ZWRVUkxIYW5kbGVyIGV4dGVuZHMgSVVSTEhhbmRsZXIge1xuXHRleHRlbnNpb25EaXNwbGF5TmFtZTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElFeHRlbnNpb25VcmxIYW5kbGVyIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWdpc3RlckV4dGVuc2lvbkhhbmRsZXIoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIGhhbmRsZXI6IElFeHRlbnNpb25Db250cmlidXRlZFVSTEhhbmRsZXIpOiB2b2lkO1xuXHR1bnJlZ2lzdGVyRXh0ZW5zaW9uSGFuZGxlcihleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcik6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvblVybEhhbmRsZXJPdmVycmlkZSB7XG5cdGNhbkhhbmRsZVVSTCh1cmk6IFVSSSk6IGJvb2xlYW47XG5cdGhhbmRsZVVSTCh1cmk6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj47XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25VcmxIYW5kbGVyT3ZlcnJpZGVSZWdpc3RyeSB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgaGFuZGxlcnMgPSBuZXcgU2V0PElFeHRlbnNpb25VcmxIYW5kbGVyT3ZlcnJpZGU+KCk7XG5cblx0c3RhdGljIHJlZ2lzdGVySGFuZGxlcihoYW5kbGVyOiBJRXh0ZW5zaW9uVXJsSGFuZGxlck92ZXJyaWRlKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuaGFuZGxlcnMuYWRkKGhhbmRsZXIpO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmhhbmRsZXJzLmRlbGV0ZShoYW5kbGVyKSk7XG5cdH1cblxuXHRzdGF0aWMgZ2V0SGFuZGxlcih1cmk6IFVSSSk6IElFeHRlbnNpb25VcmxIYW5kbGVyT3ZlcnJpZGUgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgaGFuZGxlciBvZiB0aGlzLmhhbmRsZXJzKSB7XG5cdFx0XHRpZiAoaGFuZGxlci5jYW5IYW5kbGVVUkwodXJpKSkge1xuXHRcdFx0XHRyZXR1cm4gaGFuZGxlcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogVGhpcyBjbGFzcyBoYW5kbGVzIFVSTHMgd2hpY2ggYXJlIGRpcmVjdGVkIHRvd2FyZHMgZXh0ZW5zaW9ucy5cbiAqIElmIGEgVVJMIGlzIGRpcmVjdGVkIHRvd2FyZHMgYW4gaW5hY3RpdmUgZXh0ZW5zaW9uLCBpdCBidWZmZXJzIGl0LFxuICogYWN0aXZhdGVzIHRoZSBleHRlbnNpb24gYW5kIHJlLW9wZW5zIHRoZSBVUkwgb25jZSB0aGUgZXh0ZW5zaW9uIHJlZ2lzdGVyc1xuICogYSBVUkwgaGFuZGxlci4gSWYgdGhlIGV4dGVuc2lvbiBuZXZlciByZWdpc3RlcnMgYSBVUkwgaGFuZGxlciwgdGhlIHVybHNcbiAqIHdpbGwgZXZlbnR1YWxseSBiZSBnYXJiYWdlIGNvbGxlY3RlZC5cbiAqXG4gKiBJdCBhbHNvIG1ha2VzIHN1cmUgdGhlIHVzZXIgY29uZmlybXMgb3BlbmluZyBVUkxzIGRpcmVjdGVkIHRvd2FyZHMgZXh0ZW5zaW9ucy5cbiAqL1xuY2xhc3MgRXh0ZW5zaW9uVXJsSGFuZGxlciBpbXBsZW1lbnRzIElFeHRlbnNpb25VcmxIYW5kbGVyLCBJVVJMSGFuZGxlciB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgZXh0ZW5zaW9uSGFuZGxlcnMgPSBuZXcgTWFwPHN0cmluZywgSUV4dGVuc2lvbkNvbnRyaWJ1dGVkVVJMSGFuZGxlcj4oKTtcblx0cHJpdmF0ZSB1cmlCdWZmZXIgPSBuZXcgTWFwPHN0cmluZywgeyB0aW1lc3RhbXA6IG51bWJlcjsgdXJpOiBVUkkgfVtdPigpO1xuXHRwcml2YXRlIHVzZXJUcnVzdGVkRXh0ZW5zaW9uc1N0b3JhZ2U6IFVzZXJUcnVzdGVkRXh0ZW5zaW9uSWRTdG9yYWdlO1xuXHRwcml2YXRlIGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJVVJMU2VydmljZSB1cmxTZXJ2aWNlOiBJVVJMU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25TZXJ2aWNlOiBJRXh0ZW5zaW9uU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG9zdFNlcnZpY2U6IElIb3N0U2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy51c2VyVHJ1c3RlZEV4dGVuc2lvbnNTdG9yYWdlID0gbmV3IFVzZXJUcnVzdGVkRXh0ZW5zaW9uSWRTdG9yYWdlKHN0b3JhZ2VTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGludGVydmFsID0gZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsKG1haW5XaW5kb3csICgpID0+IHRoaXMuZ2FyYmFnZUNvbGxlY3QoKSwgVEhJUlRZX1NFQ09ORFMpO1xuXHRcdGNvbnN0IHVybFRvSGFuZGxlVmFsdWUgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChVUkxfVE9fSEFORExFLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRpZiAodXJsVG9IYW5kbGVWYWx1ZSkge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUoVVJMX1RPX0hBTkRMRSwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0XHR0aGlzLmhhbmRsZVVSTChVUkkucmV2aXZlKEpTT04ucGFyc2UodXJsVG9IYW5kbGVWYWx1ZSkpLCB7IHRydXN0ZWQ6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FjaGUgPSBFeHRlbnNpb25VcmxCb290c3RyYXBIYW5kbGVyLmNhY2hlO1xuXHRcdGNvbnN0IGRyYWluVGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4gY2FjaGUuZm9yRWFjaCgoW3VyaSwgb3B0aW9uXSkgPT4gdGhpcy5oYW5kbGVVUkwodXJpLCBvcHRpb24pKSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGUgPSBjb21iaW5lZERpc3Bvc2FibGUoXG5cdFx0XHR1cmxTZXJ2aWNlLnJlZ2lzdGVySGFuZGxlcih0aGlzKSxcblx0XHRcdGludGVydmFsLFxuXHRcdFx0dG9EaXNwb3NhYmxlKCgpID0+IGNsZWFyVGltZW91dChkcmFpblRpbWVvdXQpKVxuXHRcdCk7XG5cdH1cblxuXHRhc3luYyBoYW5kbGVVUkwodXJpOiBVUkksIG9wdGlvbnM/OiBJT3BlblVSTE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoIWlzRXh0ZW5zaW9uSWQodXJpLmF1dGhvcml0eSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBvdmVycmlkZUhhbmRsZXIgPSBFeHRlbnNpb25VcmxIYW5kbGVyT3ZlcnJpZGVSZWdpc3RyeS5nZXRIYW5kbGVyKHVyaSk7XG5cdFx0aWYgKG92ZXJyaWRlSGFuZGxlcikge1xuXHRcdFx0Y29uc3QgaGFuZGxlZCA9IGF3YWl0IG92ZXJyaWRlSGFuZGxlci5oYW5kbGVVUkwodXJpKTtcblx0XHRcdGlmIChoYW5kbGVkKSB7XG5cdFx0XHRcdHJldHVybiBoYW5kbGVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbklkID0gdXJpLmF1dGhvcml0eTtcblxuXHRcdGNvbnN0IGluaXRpYWxIYW5kbGVyID0gdGhpcy5leHRlbnNpb25IYW5kbGVycy5nZXQoRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRlbnNpb25JZCkpO1xuXHRcdGxldCBleHRlbnNpb25EaXNwbGF5TmFtZTogc3RyaW5nO1xuXG5cdFx0aWYgKCFpbml0aWFsSGFuZGxlcikge1xuXHRcdFx0Ly8gVGhlIGV4dGVuc2lvbiBpcyBub3QgeWV0IGFjdGl2YXRlZCwgc28gbGV0J3MgY2hlY2sgaWYgaXQgaXMgaW5zdGFsbGVkIGFuZCBlbmFibGVkXG5cdFx0XHRjb25zdCBleHRlbnNpb24gPSBhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2UuZ2V0RXh0ZW5zaW9uKGV4dGVuc2lvbklkKTtcblx0XHRcdGlmICghZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuaGFuZGxlVW5oYW5kbGVkVVJMKHVyaSwgZXh0ZW5zaW9uSWQsIG9wdGlvbnMpO1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGV4dGVuc2lvbkRpc3BsYXlOYW1lID0gZXh0ZW5zaW9uLmRpc3BsYXlOYW1lID8/ICcnO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRleHRlbnNpb25EaXNwbGF5TmFtZSA9IGluaXRpYWxIYW5kbGVyLmV4dGVuc2lvbkRpc3BsYXlOYW1lO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRydXN0ZWQgPSBvcHRpb25zPy50cnVzdGVkXG5cdFx0XHR8fCB0aGlzLnByb2R1Y3RTZXJ2aWNlLnRydXN0ZWRFeHRlbnNpb25Qcm90b2NvbEhhbmRsZXJzPy5zb21lKHZhbHVlID0+IGVxdWFsc0lnbm9yZUNhc2UodmFsdWUsIGV4dGVuc2lvbklkKSlcblx0XHRcdHx8IHRoaXMuZGlkVXNlclRydXN0RXh0ZW5zaW9uKEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uSWQpKTtcblxuXHRcdGlmICghdHJ1c3RlZCkge1xuXHRcdFx0Y29uc3QgdXJpU3RyaW5nID0gdXJpLnRvU3RyaW5nKGZhbHNlKTtcblx0XHRcdGxldCB1cmlMYWJlbCA9IHVyaVN0cmluZztcblxuXHRcdFx0aWYgKHVyaUxhYmVsLmxlbmd0aCA+IDQwKSB7XG5cdFx0XHRcdHVyaUxhYmVsID0gYCR7dXJpTGFiZWwuc3Vic3RyaW5nKDAsIDMwKX0uLi4ke3VyaUxhYmVsLnN1YnN0cmluZyh1cmlMYWJlbC5sZW5ndGggLSA1KX1gO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRpYWxvZ1NlcnZpY2UuY29uZmlybSh7XG5cdFx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdjb25maXJtVXJsJywgXCJBbGxvdyAnezB9JyBleHRlbnNpb24gdG8gb3BlbiB0aGlzIFVSST9cIiwgZXh0ZW5zaW9uRGlzcGxheU5hbWUpLFxuXHRcdFx0XHRjaGVja2JveDoge1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVtZW1iZXJDb25maXJtVXJsJywgXCJEbyBub3QgYXNrIG1lIGFnYWluIGZvciB0aGlzIGV4dGVuc2lvblwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cHJpbWFyeUJ1dHRvbjogbG9jYWxpemUoeyBrZXk6ICdvcGVuJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmT3BlblwiKSxcblx0XHRcdFx0Y3VzdG9tOiB7XG5cdFx0XHRcdFx0bWFya2Rvd25EZXRhaWxzOiBbe1xuXHRcdFx0XHRcdFx0bWFya2Rvd246IG5ldyBNYXJrZG93blN0cmluZyhgPGRpdiB0aXRsZT1cIiR7dXJpU3RyaW5nfVwiIGFyaWEtbGFiZWw9JyR7dXJpU3RyaW5nfSc+JHt1cmlMYWJlbH08L2Rpdj5gLCB7IHN1cHBvcnRIdG1sOiB0cnVlIH0pLFxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoIXJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXN1bHQuY2hlY2tib3hDaGVja2VkKSB7XG5cdFx0XHRcdHRoaXMudXNlclRydXN0ZWRFeHRlbnNpb25zU3RvcmFnZS5hZGQoRXh0ZW5zaW9uSWRlbnRpZmllci50b0tleShleHRlbnNpb25JZCkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGhhbmRsZXIgPSB0aGlzLmV4dGVuc2lvbkhhbmRsZXJzLmdldChFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGV4dGVuc2lvbklkKSk7XG5cblx0XHRpZiAoaGFuZGxlcikge1xuXHRcdFx0aWYgKCFpbml0aWFsSGFuZGxlcikge1xuXHRcdFx0XHQvLyBmb3J3YXJkIGl0IGRpcmVjdGx5XG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmhhbmRsZVVSTEJ5RXh0ZW5zaW9uKGV4dGVuc2lvbklkLCBoYW5kbGVyLCB1cmksIG9wdGlvbnMpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBsZXQgdGhlIEV4dGVuc2lvblVybEhhbmRsZXIgaW5zdGFuY2UgaGFuZGxlIHRoaXNcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBjb2xsZWN0IFVSSSBmb3IgZXZlbnR1YWwgZXh0ZW5zaW9uIGFjdGl2YXRpb25cblx0XHRjb25zdCB0aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLmdldFRpbWUoKTtcblx0XHRsZXQgdXJpcyA9IHRoaXMudXJpQnVmZmVyLmdldChFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGV4dGVuc2lvbklkKSk7XG5cblx0XHRpZiAoIXVyaXMpIHtcblx0XHRcdHVyaXMgPSBbXTtcblx0XHRcdHRoaXMudXJpQnVmZmVyLnNldChFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGV4dGVuc2lvbklkKSwgdXJpcyk7XG5cdFx0fVxuXG5cdFx0dXJpcy5wdXNoKHsgdGltZXN0YW1wLCB1cmkgfSk7XG5cblx0XHQvLyBhY3RpdmF0ZSB0aGUgZXh0ZW5zaW9uIHVzaW5nIEFjdGl2YXRpb25LaW5kLkltbWVkaWF0ZSBiZWNhdXNlIFVSSSBoYW5kbGluZyBtaWdodCBiZSBwYXJ0XG5cdFx0Ly8gb2YgcmVzb2x2aW5nIGF1dGhvcml0aWVzICh2aWEgYXV0aGVudGljYXRpb24gZXh0ZW5zaW9ucylcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KGBvblVyaToke0V4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uSWQpfWAsIEFjdGl2YXRpb25LaW5kLkltbWVkaWF0ZSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRyZWdpc3RlckV4dGVuc2lvbkhhbmRsZXIoZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIsIGhhbmRsZXI6IElFeHRlbnNpb25Db250cmlidXRlZFVSTEhhbmRsZXIpOiB2b2lkIHtcblx0XHR0aGlzLmV4dGVuc2lvbkhhbmRsZXJzLnNldChFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGV4dGVuc2lvbklkKSwgaGFuZGxlcik7XG5cblx0XHRjb25zdCB1cmlzID0gdGhpcy51cmlCdWZmZXIuZ2V0KEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uSWQpKSB8fCBbXTtcblxuXHRcdGZvciAoY29uc3QgeyB1cmkgfSBvZiB1cmlzKSB7XG5cdFx0XHR0aGlzLmhhbmRsZVVSTEJ5RXh0ZW5zaW9uKGV4dGVuc2lvbklkLCBoYW5kbGVyLCB1cmkpO1xuXHRcdH1cblxuXHRcdHRoaXMudXJpQnVmZmVyLmRlbGV0ZShFeHRlbnNpb25JZGVudGlmaWVyLnRvS2V5KGV4dGVuc2lvbklkKSk7XG5cdH1cblxuXHR1bnJlZ2lzdGVyRXh0ZW5zaW9uSGFuZGxlcihleHRlbnNpb25JZDogRXh0ZW5zaW9uSWRlbnRpZmllcik6IHZvaWQge1xuXHRcdHRoaXMuZXh0ZW5zaW9uSGFuZGxlcnMuZGVsZXRlKEV4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uSWQpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgaGFuZGxlVVJMQnlFeHRlbnNpb24oZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXIgfCBzdHJpbmcsIGhhbmRsZXI6IElVUkxIYW5kbGVyLCB1cmk6IFVSSSwgb3B0aW9ucz86IElPcGVuVVJMT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHJldHVybiBhd2FpdCBoYW5kbGVyLmhhbmRsZVVSTCh1cmksIG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBoYW5kbGVVbmhhbmRsZWRVUkwodXJpOiBVUkksIGV4dGVuc2lvbklkOiBzdHJpbmcsIG9wdGlvbnM/OiBJT3BlblVSTE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLmV4dGVuc2lvbnMuaW5zdGFsbEV4dGVuc2lvbicsIGV4dGVuc2lvbklkLCB7XG5cdFx0XHRcdGp1c3RpZmljYXRpb246IHtcblx0XHRcdFx0XHRyZWFzb246IGAke2xvY2FsaXplKCdpbnN0YWxsRGV0YWlsJywgXCJUaGlzIGV4dGVuc2lvbiB3YW50cyB0byBvcGVuIGEgVVJJOlwiKX1cXG4ke3VyaS50b1N0cmluZygpfWAsXG5cdFx0XHRcdFx0YWN0aW9uOiBsb2NhbGl6ZSgnb3BlblVyaScsIFwiT3BlbiBVUklcIilcblx0XHRcdFx0fSxcblx0XHRcdFx0ZW5hYmxlOiB0cnVlLFxuXHRcdFx0XHRpbnN0YWxsUHJlUmVsZWFzZVZlcnNpb246IHRoaXMucHJvZHVjdFNlcnZpY2UucXVhbGl0eSAhPT0gJ3N0YWJsZSdcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZXh0ZW5zaW9uID0gYXdhaXQgdGhpcy5leHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvbihleHRlbnNpb25JZCk7XG5cblx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRhd2FpdCB0aGlzLmhhbmRsZVVSTCh1cmksIHsgLi4ub3B0aW9ucywgdHJ1c3RlZDogdHJ1ZSB9KTtcblx0XHR9XG5cblx0XHQvKiBFeHRlbnNpb24gY2Fubm90IGJlIGFkZGVkIGFuZCByZXF1aXJlIHdpbmRvdyByZWxvYWQgKi9cblx0XHRlbHNlIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5jb25maXJtKHtcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ3JlbG9hZEFuZEhhbmRsZScsIFwiRXh0ZW5zaW9uICd7MH0nIGlzIG5vdCBsb2FkZWQuIFdvdWxkIHlvdSBsaWtlIHRvIHJlbG9hZCB0aGUgd2luZG93IHRvIGxvYWQgdGhlIGV4dGVuc2lvbiBhbmQgb3BlbiB0aGUgVVJMP1wiLCBleHRlbnNpb25JZCksXG5cdFx0XHRcdHByaW1hcnlCdXR0b246IGxvY2FsaXplKHsga2V5OiAncmVsb2FkQW5kT3BlbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlbG9hZCBXaW5kb3cgYW5kIE9wZW5cIilcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoIXJlc3VsdC5jb25maXJtZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFVSTF9UT19IQU5ETEUsIEpTT04uc3RyaW5naWZ5KHVyaS50b0pTT04oKSksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0XHRhd2FpdCB0aGlzLmhvc3RTZXJ2aWNlLnJlbG9hZCgpO1xuXHRcdH1cblx0fVxuXG5cdC8vIGZvcmdldCBhYm91dCBhbGwgdXJpcyBidWZmZXJlZCBtb3JlIHRoYW4gNSBtaW51dGVzIGFnb1xuXHRwcml2YXRlIGdhcmJhZ2VDb2xsZWN0KCk6IHZvaWQge1xuXHRcdGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkuZ2V0VGltZSgpO1xuXHRcdGNvbnN0IHVyaUJ1ZmZlciA9IG5ldyBNYXA8c3RyaW5nLCB7IHRpbWVzdGFtcDogbnVtYmVyOyB1cmk6IFVSSSB9W10+KCk7XG5cblx0XHR0aGlzLnVyaUJ1ZmZlci5mb3JFYWNoKCh1cmlzLCBleHRlbnNpb25JZCkgPT4ge1xuXHRcdFx0dXJpcyA9IHVyaXMuZmlsdGVyKCh7IHRpbWVzdGFtcCB9KSA9PiBub3cgLSB0aW1lc3RhbXAgPCBGSVZFX01JTlVURVMpO1xuXG5cdFx0XHRpZiAodXJpcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHVyaUJ1ZmZlci5zZXQoZXh0ZW5zaW9uSWQsIHVyaXMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpcy51cmlCdWZmZXIgPSB1cmlCdWZmZXI7XG5cdH1cblxuXHRwcml2YXRlIGRpZFVzZXJUcnVzdEV4dGVuc2lvbihpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMudXNlclRydXN0ZWRFeHRlbnNpb25zU3RvcmFnZS5oYXMoaWQpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5nZXRDb25maXJtZWRUcnVzdGVkRXh0ZW5zaW9uSWRzRnJvbUNvbmZpZ3VyYXRpb24oKS5pbmRleE9mKGlkKSA+IC0xO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb25maXJtZWRUcnVzdGVkRXh0ZW5zaW9uSWRzRnJvbUNvbmZpZ3VyYXRpb24oKTogQXJyYXk8c3RyaW5nPiB7XG5cdFx0Y29uc3QgdHJ1c3RlZEV4dGVuc2lvbklkcyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoVVNFUl9UUlVTVEVEX0VYVEVOU0lPTlNfQ09ORklHVVJBVElPTl9LRVkpO1xuXG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHRydXN0ZWRFeHRlbnNpb25JZHMpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydXN0ZWRFeHRlbnNpb25JZHM7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5leHRlbnNpb25IYW5kbGVycy5jbGVhcigpO1xuXHRcdHRoaXMudXJpQnVmZmVyLmNsZWFyKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUV4dGVuc2lvblVybEhhbmRsZXIsIEV4dGVuc2lvblVybEhhbmRsZXIsIEluc3RhbnRpYXRpb25UeXBlLkVhZ2VyKTtcblxuLyoqXG4gKiBUaGlzIGNsYXNzIGhhbmRsZXMgVVJMcyBiZWZvcmUgYEV4dGVuc2lvblVybEhhbmRsZXJgIGlzIGluc3RhbnRpYXRlZC5cbiAqIE1vcmUgaW5mbzogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzczMTAxXG4gKi9cbmNsYXNzIEV4dGVuc2lvblVybEJvb3RzdHJhcEhhbmRsZXIgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBJVVJMSGFuZGxlciB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmV4dGVuc2lvblVybEJvb3RzdHJhcEhhbmRsZXInO1xuXG5cdHByaXZhdGUgc3RhdGljIF9jYWNoZTogW1VSSSwgSU9wZW5VUkxPcHRpb25zIHwgdW5kZWZpbmVkXVtdID0gW107XG5cdHByaXZhdGUgc3RhdGljIGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlO1xuXG5cdHN0YXRpYyBnZXQgY2FjaGUoKTogW1VSSSwgSU9wZW5VUkxPcHRpb25zIHwgdW5kZWZpbmVkXVtdIHtcblx0XHRFeHRlbnNpb25VcmxCb290c3RyYXBIYW5kbGVyLmRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gRXh0ZW5zaW9uVXJsQm9vdHN0cmFwSGFuZGxlci5fY2FjaGU7XG5cdFx0RXh0ZW5zaW9uVXJsQm9vdHN0cmFwSGFuZGxlci5fY2FjaGUgPSBbXTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Y29uc3RydWN0b3IoQElVUkxTZXJ2aWNlIHVybFNlcnZpY2U6IElVUkxTZXJ2aWNlKSB7XG5cdFx0RXh0ZW5zaW9uVXJsQm9vdHN0cmFwSGFuZGxlci5kaXNwb3NhYmxlID0gdXJsU2VydmljZS5yZWdpc3RlckhhbmRsZXIodGhpcyk7XG5cdH1cblxuXHRhc3luYyBoYW5kbGVVUkwodXJpOiBVUkksIG9wdGlvbnM/OiBJT3BlblVSTE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoIWlzRXh0ZW5zaW9uSWQodXJpLmF1dGhvcml0eSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRFeHRlbnNpb25VcmxCb290c3RyYXBIYW5kbGVyLl9jYWNoZS5wdXNoKFt1cmksIG9wdGlvbnNdKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoRXh0ZW5zaW9uVXJsQm9vdHN0cmFwSGFuZGxlci5JRCwgRXh0ZW5zaW9uVXJsQm9vdHN0cmFwSGFuZGxlciwgV29ya2JlbmNoUGhhc2UuQmxvY2tSZXN0b3JlIC8qIHJlZ2lzdHJhdGlvbiBvbmx5ICovKTtcblxuY2xhc3MgTWFuYWdlQXV0aG9yaXplZEV4dGVuc2lvblVSSXNBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5tYW5hZ2VBdXRob3JpemVkRXh0ZW5zaW9uVVJJcycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdtYW5hZ2UnLCAnTWFuYWdlIEF1dGhvcml6ZWQgRXh0ZW5zaW9uIFVSSXMuLi4nKSxcblx0XHRcdGNhdGVnb3J5OiBsb2NhbGl6ZTIoJ2V4dGVuc2lvbnMnLCAnRXh0ZW5zaW9ucycpLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLFxuXHRcdFx0XHR3aGVuOiBJc1dlYkNvbnRleHQudG9OZWdhdGVkKClcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBzdG9yYWdlID0gbmV3IFVzZXJUcnVzdGVkRXh0ZW5zaW9uSWRTdG9yYWdlKHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBpdGVtcyA9IHN0b3JhZ2UuZXh0ZW5zaW9ucy5tYXAoKGxhYmVsKTogSVF1aWNrUGlja0l0ZW0gPT4gKHsgbGFiZWwsIHBpY2tlZDogdHJ1ZSB9KSk7XG5cblx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKFt7IGxhYmVsOiBsb2NhbGl6ZSgnbm8nLCAnVGhlcmUgYXJlIGN1cnJlbnRseSBubyBhdXRob3JpemVkIGV4dGVuc2lvbiBVUklzLicpIH1dKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBxdWlja0lucHV0U2VydmljZS5waWNrKGl0ZW1zLCB7IGNhblBpY2tNYW55OiB0cnVlIH0pO1xuXG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRzdG9yYWdlLnNldChyZXN1bHQubWFwKGl0ZW0gPT4gaXRlbS5sYWJlbCkpO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihNYW5hZ2VBdXRob3JpemVkRXh0ZW5zaW9uVVJJc0FjdGlvbik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsVUFBVSxpQkFBaUI7QUFDcEMsU0FBc0Isb0JBQW9CLG9CQUFvQjtBQUM5RCxTQUFTLFdBQVc7QUFDcEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBeUM7QUFDbEQsU0FBUyxpQkFBaUIsY0FBYyxxQkFBcUI7QUFDN0QsU0FBc0IsbUJBQW9DO0FBQzFELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZ0JBQWdCLHlCQUF5QjtBQUNsRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBaUMsZ0JBQWdCLHNDQUFzQztBQUN2RixTQUFTLFNBQVMsUUFBUSx1QkFBdUI7QUFDakQsU0FBUywwQkFBMEM7QUFDbkQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FB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
