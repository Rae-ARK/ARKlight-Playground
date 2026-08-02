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
import { Action } from "../../../base/common/actions.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Schemas } from "../../../base/common/network.js";
import { localize } from "../../../nls.js";
import { INotificationService, Severity } from "../../../platform/notification/common/notification.js";
import { IOpenerService } from "../../../platform/opener/common/opener.js";
import { IStorageService } from "../../../platform/storage/common/storage.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { defaultExternalUriOpenerId } from "../../contrib/externalUriOpener/common/configuration.js";
import { ContributedExternalUriOpenersStore } from "../../contrib/externalUriOpener/common/contributedOpeners.js";
import { IExternalUriOpenerService } from "../../contrib/externalUriOpener/common/externalUriOpenerService.js";
import { IExtensionService } from "../../services/extensions/common/extensions.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
let MainThreadUriOpeners = class extends Disposable {
  constructor(context, storageService, externalUriOpenerService, extensionService, openerService, notificationService) {
    super();
    this.extensionService = extensionService;
    this.openerService = openerService;
    this.notificationService = notificationService;
    this._registeredOpeners = /* @__PURE__ */ new Map();
    this.proxy = context.getProxy(ExtHostContext.ExtHostUriOpeners);
    this._register(externalUriOpenerService.registerExternalOpenerProvider(this));
    this._contributedExternalUriOpenersStore = this._register(new ContributedExternalUriOpenersStore(storageService, extensionService));
  }
  async *getOpeners(targetUri) {
    if (targetUri.scheme !== Schemas.http && targetUri.scheme !== Schemas.https) {
      return;
    }
    await this.extensionService.activateByEvent(`onOpenExternalUri:${targetUri.scheme}`);
    for (const [id, openerMetadata] of this._registeredOpeners) {
      if (openerMetadata.schemes.has(targetUri.scheme)) {
        yield this.createOpener(id, openerMetadata);
      }
    }
  }
  createOpener(id, metadata) {
    return {
      id,
      label: metadata.label,
      canOpen: (uri, token) => {
        return this.proxy.$canOpenUri(id, uri, token);
      },
      openExternalUri: async (uri, ctx, token) => {
        try {
          await this.proxy.$openUri(id, { resolvedUri: uri, sourceUri: ctx.sourceUri }, token);
        } catch (e) {
          if (!isCancellationError(e)) {
            const openDefaultAction = new Action("default", localize("openerFailedUseDefault", "Open using default opener"), void 0, void 0, async () => {
              await this.openerService.open(uri, {
                allowTunneling: false,
                allowContributedOpeners: defaultExternalUriOpenerId
              });
            });
            openDefaultAction.tooltip = uri.toString();
            this.notificationService.notify({
              severity: Severity.Error,
              message: localize({
                key: "openerFailedMessage",
                comment: ["{0} is the id of the opener. {1} is the url being opened."]
              }, "Could not open uri with '{0}': {1}", id, e.toString()),
              actions: {
                primary: [
                  openDefaultAction
                ]
              }
            });
          }
        }
        return true;
      }
    };
  }
  async $registerUriOpener(id, schemes, extensionId, label) {
    if (this._registeredOpeners.has(id)) {
      throw new Error(`Opener with id '${id}' already registered`);
    }
    this._registeredOpeners.set(id, {
      schemes: new Set(schemes),
      label,
      extensionId
    });
    this._contributedExternalUriOpenersStore.didRegisterOpener(id, extensionId.value);
  }
  async $unregisterUriOpener(id) {
    this._registeredOpeners.delete(id);
    this._contributedExternalUriOpenersStore.delete(id);
  }
  dispose() {
    super.dispose();
    this._registeredOpeners.clear();
  }
};
MainThreadUriOpeners = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadUriOpeners),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IExternalUriOpenerService),
  __decorateParam(3, IExtensionService),
  __decorateParam(4, IOpenerService),
  __decorateParam(5, INotificationService)
], MainThreadUriOpeners);
export {
  MainThreadUriOpeners
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkVXJpT3BlbmVycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgRXh0SG9zdENvbnRleHQsIEV4dEhvc3RVcmlPcGVuZXJzU2hhcGUsIE1haW5Db250ZXh0LCBNYWluVGhyZWFkVXJpT3BlbmVyc1NoYXBlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgZGVmYXVsdEV4dGVybmFsVXJpT3BlbmVySWQgfSBmcm9tICcuLi8uLi9jb250cmliL2V4dGVybmFsVXJpT3BlbmVyL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRyaWJ1dGVkRXh0ZXJuYWxVcmlPcGVuZXJzU3RvcmUgfSBmcm9tICcuLi8uLi9jb250cmliL2V4dGVybmFsVXJpT3BlbmVyL2NvbW1vbi9jb250cmlidXRlZE9wZW5lcnMuanMnO1xuaW1wb3J0IHsgSUV4dGVybmFsT3BlbmVyUHJvdmlkZXIsIElFeHRlcm5hbFVyaU9wZW5lciwgSUV4dGVybmFsVXJpT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvZXh0ZXJuYWxVcmlPcGVuZXIvY29tbW9uL2V4dGVybmFsVXJpT3BlbmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgZXh0SG9zdE5hbWVkQ3VzdG9tZXIsIElFeHRIb3N0Q29udGV4dCB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dEhvc3RDdXN0b21lcnMuanMnO1xuXG5pbnRlcmZhY2UgUmVnaXN0ZXJlZE9wZW5lck1ldGFkYXRhIHtcblx0cmVhZG9ubHkgc2NoZW1lczogUmVhZG9ubHlTZXQ8c3RyaW5nPjtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXI7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG59XG5cbkBleHRIb3N0TmFtZWRDdXN0b21lcihNYWluQ29udGV4dC5NYWluVGhyZWFkVXJpT3BlbmVycylcbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkVXJpT3BlbmVycyBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBNYWluVGhyZWFkVXJpT3BlbmVyc1NoYXBlLCBJRXh0ZXJuYWxPcGVuZXJQcm92aWRlciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcm94eTogRXh0SG9zdFVyaU9wZW5lcnNTaGFwZTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVnaXN0ZXJlZE9wZW5lcnMgPSBuZXcgTWFwPHN0cmluZywgUmVnaXN0ZXJlZE9wZW5lck1ldGFkYXRhPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250cmlidXRlZEV4dGVybmFsVXJpT3BlbmVyc1N0b3JlOiBDb250cmlidXRlZEV4dGVybmFsVXJpT3BlbmVyc1N0b3JlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElFeHRlcm5hbFVyaU9wZW5lclNlcnZpY2UgZXh0ZXJuYWxVcmlPcGVuZXJTZXJ2aWNlOiBJRXh0ZXJuYWxVcmlPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMucHJveHkgPSBjb250ZXh0LmdldFByb3h5KEV4dEhvc3RDb250ZXh0LkV4dEhvc3RVcmlPcGVuZXJzKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGV4dGVybmFsVXJpT3BlbmVyU2VydmljZS5yZWdpc3RlckV4dGVybmFsT3BlbmVyUHJvdmlkZXIodGhpcykpO1xuXG5cdFx0dGhpcy5fY29udHJpYnV0ZWRFeHRlcm5hbFVyaU9wZW5lcnNTdG9yZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBDb250cmlidXRlZEV4dGVybmFsVXJpT3BlbmVyc1N0b3JlKHN0b3JhZ2VTZXJ2aWNlLCBleHRlbnNpb25TZXJ2aWNlKSk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgKmdldE9wZW5lcnModGFyZ2V0VXJpOiBVUkkpOiBBc3luY0l0ZXJhYmxlPElFeHRlcm5hbFVyaU9wZW5lcj4ge1xuXG5cdFx0Ly8gQ3VycmVudGx5IHdlIG9ubHkgYWxsb3cgb3BlbmVycyBmb3IgaHR0cCBhbmQgaHR0cHMgdXJsc1xuXHRcdGlmICh0YXJnZXRVcmkuc2NoZW1lICE9PSBTY2hlbWFzLmh0dHAgJiYgdGFyZ2V0VXJpLnNjaGVtZSAhPT0gU2NoZW1hcy5odHRwcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS5hY3RpdmF0ZUJ5RXZlbnQoYG9uT3BlbkV4dGVybmFsVXJpOiR7dGFyZ2V0VXJpLnNjaGVtZX1gKTtcblxuXHRcdGZvciAoY29uc3QgW2lkLCBvcGVuZXJNZXRhZGF0YV0gb2YgdGhpcy5fcmVnaXN0ZXJlZE9wZW5lcnMpIHtcblx0XHRcdGlmIChvcGVuZXJNZXRhZGF0YS5zY2hlbWVzLmhhcyh0YXJnZXRVcmkuc2NoZW1lKSkge1xuXHRcdFx0XHR5aWVsZCB0aGlzLmNyZWF0ZU9wZW5lcihpZCwgb3BlbmVyTWV0YWRhdGEpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlT3BlbmVyKGlkOiBzdHJpbmcsIG1ldGFkYXRhOiBSZWdpc3RlcmVkT3BlbmVyTWV0YWRhdGEpOiBJRXh0ZXJuYWxVcmlPcGVuZXIge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogaWQsXG5cdFx0XHRsYWJlbDogbWV0YWRhdGEubGFiZWwsXG5cdFx0XHRjYW5PcGVuOiAodXJpLCB0b2tlbikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5wcm94eS4kY2FuT3BlblVyaShpZCwgdXJpLCB0b2tlbik7XG5cdFx0XHR9LFxuXHRcdFx0b3BlbkV4dGVybmFsVXJpOiBhc3luYyAodXJpLCBjdHgsIHRva2VuKSA9PiB7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5wcm94eS4kb3BlblVyaShpZCwgeyByZXNvbHZlZFVyaTogdXJpLCBzb3VyY2VVcmk6IGN0eC5zb3VyY2VVcmkgfSwgdG9rZW4pO1xuXHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGUpKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBvcGVuRGVmYXVsdEFjdGlvbiA9IG5ldyBBY3Rpb24oJ2RlZmF1bHQnLCBsb2NhbGl6ZSgnb3BlbmVyRmFpbGVkVXNlRGVmYXVsdCcsIFwiT3BlbiB1c2luZyBkZWZhdWx0IG9wZW5lclwiKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0YXdhaXQgdGhpcy5vcGVuZXJTZXJ2aWNlLm9wZW4odXJpLCB7XG5cdFx0XHRcdFx0XHRcdFx0YWxsb3dUdW5uZWxpbmc6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdGFsbG93Q29udHJpYnV0ZWRPcGVuZXJzOiBkZWZhdWx0RXh0ZXJuYWxVcmlPcGVuZXJJZCxcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdG9wZW5EZWZhdWx0QWN0aW9uLnRvb2x0aXAgPSB1cmkudG9TdHJpbmcoKTtcblxuXHRcdFx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoe1xuXHRcdFx0XHRcdFx0XHRcdGtleTogJ29wZW5lckZhaWxlZE1lc3NhZ2UnLFxuXHRcdFx0XHRcdFx0XHRcdGNvbW1lbnQ6IFsnezB9IGlzIHRoZSBpZCBvZiB0aGUgb3BlbmVyLiB7MX0gaXMgdGhlIHVybCBiZWluZyBvcGVuZWQuJ10sXG5cdFx0XHRcdFx0XHRcdH0sICdDb3VsZCBub3Qgb3BlbiB1cmkgd2l0aCBcXCd7MH1cXCc6IHsxfScsIGlkLCBlLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRcdFx0XHRhY3Rpb25zOiB7XG5cdFx0XHRcdFx0XHRcdFx0cHJpbWFyeTogW1xuXHRcdFx0XHRcdFx0XHRcdFx0b3BlbkRlZmF1bHRBY3Rpb25cblx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jICRyZWdpc3RlclVyaU9wZW5lcihcblx0XHRpZDogc3RyaW5nLFxuXHRcdHNjaGVtZXM6IHJlYWRvbmx5IHN0cmluZ1tdLFxuXHRcdGV4dGVuc2lvbklkOiBFeHRlbnNpb25JZGVudGlmaWVyLFxuXHRcdGxhYmVsOiBzdHJpbmcsXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9yZWdpc3RlcmVkT3BlbmVycy5oYXMoaWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE9wZW5lciB3aXRoIGlkICcke2lkfScgYWxyZWFkeSByZWdpc3RlcmVkYCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXJlZE9wZW5lcnMuc2V0KGlkLCB7XG5cdFx0XHRzY2hlbWVzOiBuZXcgU2V0KHNjaGVtZXMpLFxuXHRcdFx0bGFiZWwsXG5cdFx0XHRleHRlbnNpb25JZCxcblx0XHR9KTtcblxuXHRcdHRoaXMuX2NvbnRyaWJ1dGVkRXh0ZXJuYWxVcmlPcGVuZXJzU3RvcmUuZGlkUmVnaXN0ZXJPcGVuZXIoaWQsIGV4dGVuc2lvbklkLnZhbHVlKTtcblx0fVxuXG5cdGFzeW5jICR1bnJlZ2lzdGVyVXJpT3BlbmVyKGlkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl9yZWdpc3RlcmVkT3BlbmVycy5kZWxldGUoaWQpO1xuXHRcdHRoaXMuX2NvbnRyaWJ1dGVkRXh0ZXJuYWxVcmlPcGVuZXJzU3RvcmUuZGVsZXRlKGlkKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyZWRPcGVuZXJzLmNsZWFyKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUV4QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLHNCQUFzQixnQkFBZ0I7QUFDL0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxnQkFBd0MsbUJBQThDO0FBQy9GLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsMENBQTBDO0FBQ25ELFNBQXNELGlDQUFpQztBQUN2RixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE2QztBQVMvQyxJQUFNLHVCQUFOLGNBQW1DLFdBQXlFO0FBQUEsRUFNbEgsWUFDQyxTQUNpQixnQkFDVSwwQkFDUyxrQkFDSCxlQUNNLHFCQUN0QztBQUNELFVBQU07QUFKOEI7QUFDSDtBQUNNO0FBVHhDLFNBQWlCLHFCQUFxQixvQkFBSSxJQUFzQztBQVkvRSxTQUFLLFFBQVEsUUFBUSxTQUFTLGVBQWUsaUJBQWlCO0FBRTlELFNBQUssVUFBVSx5QkFBeUIsK0JBQStCLElBQUksQ0FBQztBQUU1RSxTQUFLLHNDQUFzQyxLQUFLLFVBQVUsSUFBSSxtQ0FBbUMsZ0JBQWdCLGdCQUFnQixDQUFDO0FBQUEsRUFDbkk7QUFBQSxFQUVBLE9BQWMsV0FBVyxXQUFtRDtBQUczRSxRQUFJLFVBQVUsV0FBVyxRQUFRLFFBQVEsVUFBVSxXQUFXLFFBQVEsT0FBTztBQUM1RTtBQUFBLElBQ0Q7QUFFQSxVQUFNLEtBQUssaUJBQWlCLGdCQUFnQixxQkFBcUIsVUFBVSxNQUFNLEVBQUU7QUFFbkYsZUFBVyxDQUFDLElBQUksY0FBYyxLQUFLLEtBQUssb0JBQW9CO0FBQzNELFVBQUksZUFBZSxRQUFRLElBQUksVUFBVSxNQUFNLEdBQUc7QUFDakQsY0FBTSxLQUFLLGFBQWEsSUFBSSxjQUFjO0FBQUEsTUFDM0M7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsYUFBYSxJQUFZLFVBQXdEO0FBQ3hGLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQSxPQUFPLFNBQVM7QUFBQSxNQUNoQixTQUFTLENBQUMsS0FBSyxVQUFVO0FBQ3hCLGVBQU8sS0FBSyxNQUFNLFlBQVksSUFBSSxLQUFLLEtBQUs7QUFBQSxNQUM3QztBQUFBLE1BQ0EsaUJBQWlCLE9BQU8sS0FBSyxLQUFLLFVBQVU7QUFDM0MsWUFBSTtBQUNILGdCQUFNLEtBQUssTUFBTSxTQUFTLElBQUksRUFBRSxhQUFhLEtBQUssV0FBVyxJQUFJLFVBQVUsR0FBRyxLQUFLO0FBQUEsUUFDcEYsU0FBUyxHQUFHO0FBQ1gsY0FBSSxDQUFDLG9CQUFvQixDQUFDLEdBQUc7QUFDNUIsa0JBQU0sb0JBQW9CLElBQUksT0FBTyxXQUFXLFNBQVMsMEJBQTBCLDJCQUEyQixHQUFHLFFBQVcsUUFBVyxZQUFZO0FBQ2xKLG9CQUFNLEtBQUssY0FBYyxLQUFLLEtBQUs7QUFBQSxnQkFDbEMsZ0JBQWdCO0FBQUEsZ0JBQ2hCLHlCQUF5QjtBQUFBLGNBQzFCLENBQUM7QUFBQSxZQUNGLENBQUM7QUFDRCw4QkFBa0IsVUFBVSxJQUFJLFNBQVM7QUFFekMsaUJBQUssb0JBQW9CLE9BQU87QUFBQSxjQUMvQixVQUFVLFNBQVM7QUFBQSxjQUNuQixTQUFTLFNBQVM7QUFBQSxnQkFDakIsS0FBSztBQUFBLGdCQUNMLFNBQVMsQ0FBQywyREFBMkQ7QUFBQSxjQUN0RSxHQUFHLHNDQUF3QyxJQUFJLEVBQUUsU0FBUyxDQUFDO0FBQUEsY0FDM0QsU0FBUztBQUFBLGdCQUNSLFNBQVM7QUFBQSxrQkFDUjtBQUFBLGdCQUNEO0FBQUEsY0FDRDtBQUFBLFlBQ0QsQ0FBQztBQUFBLFVBQ0Y7QUFBQSxRQUNEO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxtQkFDTCxJQUNBLFNBQ0EsYUFDQSxPQUNnQjtBQUNoQixRQUFJLEtBQUssbUJBQW1CLElBQUksRUFBRSxHQUFHO0FBQ3BDLFlBQU0sSUFBSSxNQUFNLG1CQUFtQixFQUFFLHNCQUFzQjtBQUFBLElBQzVEO0FBRUEsU0FBSyxtQkFBbUIsSUFBSSxJQUFJO0FBQUEsTUFDL0IsU0FBUyxJQUFJLElBQUksT0FBTztBQUFBLE1BQ3hCO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssb0NBQW9DLGtCQUFrQixJQUFJLFlBQVksS0FBSztBQUFBLEVBQ2pGO0FBQUEsRUFFQSxNQUFNLHFCQUFxQixJQUEyQjtBQUNyRCxTQUFLLG1CQUFtQixPQUFPLEVBQUU7QUFDakMsU0FBSyxvQ0FBb0MsT0FBTyxFQUFFO0FBQUEsRUFDbkQ7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLFVBQU0sUUFBUTtBQUNkLFNBQUssbUJBQW1CLE1BQU07QUFBQSxFQUMvQjtBQUNEO0FBekdhLHVCQUFOO0FBQUEsRUFETixxQkFBcUIsWUFBWSxvQkFBb0I7QUFBQSxFQVNuRDtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVpVOyIsCiAgIm5hbWVzIjogW10KfQo=
