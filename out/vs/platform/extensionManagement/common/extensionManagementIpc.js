import { Emitter, Event } from "../../../base/common/event.js";
import { cloneAndChange } from "../../../base/common/objects.js";
import { URI } from "../../../base/common/uri.js";
import { DefaultURITransformer, transformAndReviveIncomingURIs } from "../../../base/common/uriIpc.js";
import { CommontExtensionManagementService } from "./abstractExtensionManagementService.js";
import { language } from "../../../base/common/platform.js";
function transformIncomingURI(uri, transformer) {
  return uri ? URI.revive(transformer ? transformer.transformIncoming(uri) : uri) : void 0;
}
function transformOutgoingURI(uri, transformer) {
  return transformer ? transformer.transformOutgoingURI(uri) : uri;
}
function transformIncomingExtension(extension, transformer) {
  transformer = transformer ? transformer : DefaultURITransformer;
  const manifest = extension.manifest;
  const transformed = transformAndReviveIncomingURIs({ ...extension, ...{ manifest: void 0 } }, transformer);
  return { ...transformed, ...{ manifest } };
}
function transformIncomingOptions(options, transformer) {
  return options?.profileLocation ? transformAndReviveIncomingURIs(options, transformer ?? DefaultURITransformer) : options;
}
function transformOutgoingExtension(extension, transformer) {
  return transformer ? cloneAndChange(extension, (value) => value instanceof URI ? transformer.transformOutgoingURI(value) : void 0) : extension;
}
class ExtensionManagementChannel {
  constructor(service, getUriTransformer) {
    this.service = service;
    this.getUriTransformer = getUriTransformer;
    this.onInstallExtension = Event.buffer(service.onInstallExtension, "onInstallExtension", true);
    this.onDidInstallExtensions = Event.buffer(service.onDidInstallExtensions, "onDidInstallExtensions", true);
    this.onUninstallExtension = Event.buffer(service.onUninstallExtension, "onUninstallExtension", true);
    this.onDidUninstallExtension = Event.buffer(service.onDidUninstallExtension, "onDidUninstallExtension", true);
    this.onDidUpdateExtensionMetadata = Event.buffer(service.onDidUpdateExtensionMetadata, "onDidUpdateExtensionMetadata", true);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listen(context, event) {
    const uriTransformer = this.getUriTransformer(context);
    switch (event) {
      case "onInstallExtension": {
        return Event.map(this.onInstallExtension, (e) => {
          return {
            ...e,
            profileLocation: e.profileLocation ? transformOutgoingURI(e.profileLocation, uriTransformer) : e.profileLocation
          };
        });
      }
      case "onDidInstallExtensions": {
        return Event.map(this.onDidInstallExtensions, (results) => results.map((i) => ({
          ...i,
          local: i.local ? transformOutgoingExtension(i.local, uriTransformer) : i.local,
          profileLocation: i.profileLocation ? transformOutgoingURI(i.profileLocation, uriTransformer) : i.profileLocation
        })));
      }
      case "onUninstallExtension": {
        return Event.map(this.onUninstallExtension, (e) => {
          return {
            ...e,
            profileLocation: e.profileLocation ? transformOutgoingURI(e.profileLocation, uriTransformer) : e.profileLocation
          };
        });
      }
      case "onDidUninstallExtension": {
        return Event.map(this.onDidUninstallExtension, (e) => {
          return {
            ...e,
            profileLocation: e.profileLocation ? transformOutgoingURI(e.profileLocation, uriTransformer) : e.profileLocation
          };
        });
      }
      case "onDidUpdateExtensionMetadata": {
        return Event.map(this.onDidUpdateExtensionMetadata, (e) => {
          return {
            local: transformOutgoingExtension(e.local, uriTransformer),
            profileLocation: transformOutgoingURI(e.profileLocation, uriTransformer)
          };
        });
      }
    }
    throw new Error("Invalid listen");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async call(context, command, args) {
    const uriTransformer = this.getUriTransformer(context);
    switch (command) {
      case "zip": {
        const extension = transformIncomingExtension(args[0], uriTransformer);
        const uri = await this.service.zip(extension);
        return transformOutgoingURI(uri, uriTransformer);
      }
      case "install": {
        return this.service.install(transformIncomingURI(args[0], uriTransformer), transformIncomingOptions(args[1], uriTransformer));
      }
      case "installFromLocation": {
        return this.service.installFromLocation(transformIncomingURI(args[0], uriTransformer), transformIncomingURI(args[1], uriTransformer));
      }
      case "installExtensionsFromProfile": {
        return this.service.installExtensionsFromProfile(args[0], transformIncomingURI(args[1], uriTransformer), transformIncomingURI(args[2], uriTransformer));
      }
      case "getManifest": {
        return this.service.getManifest(transformIncomingURI(args[0], uriTransformer));
      }
      case "getTargetPlatform": {
        return this.service.getTargetPlatform();
      }
      case "installFromGallery": {
        return this.service.installFromGallery(args[0], transformIncomingOptions(args[1], uriTransformer));
      }
      case "installGalleryExtensions": {
        const arg = args[0];
        return this.service.installGalleryExtensions(arg.map(({ extension, options }) => ({ extension, options: transformIncomingOptions(options, uriTransformer) ?? {} })));
      }
      case "uninstall": {
        return this.service.uninstall(transformIncomingExtension(args[0], uriTransformer), transformIncomingOptions(args[1], uriTransformer));
      }
      case "uninstallExtensions": {
        const arg = args[0];
        return this.service.uninstallExtensions(arg.map(({ extension, options }) => ({ extension: transformIncomingExtension(extension, uriTransformer), options: transformIncomingOptions(options, uriTransformer) })));
      }
      case "getInstalled": {
        const extensions = await this.service.getInstalled(args[0], transformIncomingURI(args[1], uriTransformer), args[2], args[3]);
        return extensions.map((e) => transformOutgoingExtension(e, uriTransformer));
      }
      case "toggleApplicationScope": {
        const extension = await this.service.toggleApplicationScope(transformIncomingExtension(args[0], uriTransformer), transformIncomingURI(args[1], uriTransformer));
        return transformOutgoingExtension(extension, uriTransformer);
      }
      case "copyExtensions": {
        return this.service.copyExtensions(transformIncomingURI(args[0], uriTransformer), transformIncomingURI(args[1], uriTransformer));
      }
      case "updateMetadata": {
        const e = await this.service.updateMetadata(transformIncomingExtension(args[0], uriTransformer), args[1], transformIncomingURI(args[2], uriTransformer));
        return transformOutgoingExtension(e, uriTransformer);
      }
      case "resetPinnedStateForAllUserExtensions": {
        return this.service.resetPinnedStateForAllUserExtensions(args[0]);
      }
      case "getExtensionsControlManifest": {
        return this.service.getExtensionsControlManifest();
      }
      case "download": {
        return this.service.download(args[0], args[1], args[2]);
      }
      case "cleanUp": {
        return this.service.cleanUp();
      }
    }
    throw new Error("Invalid call");
  }
}
class ExtensionManagementChannelClient extends CommontExtensionManagementService {
  constructor(channel, productService, allowedExtensionsService) {
    super(productService, allowedExtensionsService);
    this.channel = channel;
    this._onInstallExtension = this._register(new Emitter());
    this._onDidInstallExtensions = this._register(new Emitter());
    this._onUninstallExtension = this._register(new Emitter());
    this._onDidUninstallExtension = this._register(new Emitter());
    this._onDidUpdateExtensionMetadata = this._register(new Emitter());
    this._register(this.channel.listen("onInstallExtension")((e) => this.onInstallExtensionEvent({ ...e, source: this.isUriComponents(e.source) ? URI.revive(e.source) : e.source, profileLocation: URI.revive(e.profileLocation) })));
    this._register(this.channel.listen("onDidInstallExtensions")((results) => this.onDidInstallExtensionsEvent(results.map((e) => ({ ...e, local: e.local ? transformIncomingExtension(e.local, null) : e.local, source: this.isUriComponents(e.source) ? URI.revive(e.source) : e.source, profileLocation: URI.revive(e.profileLocation) })))));
    this._register(this.channel.listen("onUninstallExtension")((e) => this.onUninstallExtensionEvent({ ...e, profileLocation: URI.revive(e.profileLocation) })));
    this._register(this.channel.listen("onDidUninstallExtension")((e) => this.onDidUninstallExtensionEvent({ ...e, profileLocation: URI.revive(e.profileLocation) })));
    this._register(this.channel.listen("onDidUpdateExtensionMetadata")((e) => this.onDidUpdateExtensionMetadataEvent({ profileLocation: URI.revive(e.profileLocation), local: transformIncomingExtension(e.local, null) })));
  }
  get onInstallExtension() {
    return this._onInstallExtension.event;
  }
  get onDidInstallExtensions() {
    return this._onDidInstallExtensions.event;
  }
  get onUninstallExtension() {
    return this._onUninstallExtension.event;
  }
  get onDidUninstallExtension() {
    return this._onDidUninstallExtension.event;
  }
  get onDidUpdateExtensionMetadata() {
    return this._onDidUpdateExtensionMetadata.event;
  }
  onInstallExtensionEvent(event) {
    this._onInstallExtension.fire(event);
  }
  onDidInstallExtensionsEvent(results) {
    this._onDidInstallExtensions.fire(results);
  }
  onUninstallExtensionEvent(event) {
    this._onUninstallExtension.fire(event);
  }
  onDidUninstallExtensionEvent(event) {
    this._onDidUninstallExtension.fire(event);
  }
  onDidUpdateExtensionMetadataEvent(event) {
    this._onDidUpdateExtensionMetadata.fire(event);
  }
  isUriComponents(obj) {
    if (!obj) {
      return false;
    }
    const thing = obj;
    return typeof thing?.path === "string" && typeof thing?.scheme === "string";
  }
  getTargetPlatform() {
    if (!this._targetPlatformPromise) {
      this._targetPlatformPromise = this.channel.call("getTargetPlatform");
    }
    return this._targetPlatformPromise;
  }
  zip(extension) {
    return Promise.resolve(this.channel.call("zip", [extension]).then((result) => URI.revive(result)));
  }
  install(vsix, options) {
    return Promise.resolve(this.channel.call("install", [vsix, options])).then((local) => transformIncomingExtension(local, null));
  }
  installFromLocation(location, profileLocation) {
    return Promise.resolve(this.channel.call("installFromLocation", [location, profileLocation])).then((local) => transformIncomingExtension(local, null));
  }
  async installExtensionsFromProfile(extensions, fromProfileLocation, toProfileLocation) {
    const result = await this.channel.call("installExtensionsFromProfile", [extensions, fromProfileLocation, toProfileLocation]);
    return result.map((local) => transformIncomingExtension(local, null));
  }
  getManifest(vsix) {
    return Promise.resolve(this.channel.call("getManifest", [vsix]));
  }
  installFromGallery(extension, installOptions) {
    return Promise.resolve(this.channel.call("installFromGallery", [extension, installOptions])).then((local) => transformIncomingExtension(local, null));
  }
  async installGalleryExtensions(extensions) {
    const results = await this.channel.call("installGalleryExtensions", [extensions]);
    return results.map((e) => ({ ...e, local: e.local ? transformIncomingExtension(e.local, null) : e.local, source: this.isUriComponents(e.source) ? URI.revive(e.source) : e.source, profileLocation: URI.revive(e.profileLocation) }));
  }
  uninstall(extension, options) {
    if (extension.isWorkspaceScoped) {
      throw new Error("Cannot uninstall a workspace extension");
    }
    return Promise.resolve(this.channel.call("uninstall", [extension, options]));
  }
  uninstallExtensions(extensions) {
    if (extensions.some((e) => e.extension.isWorkspaceScoped)) {
      throw new Error("Cannot uninstall a workspace extension");
    }
    return Promise.resolve(this.channel.call("uninstallExtensions", [extensions]));
  }
  getInstalled(type = null, extensionsProfileResource, productVersion) {
    return Promise.resolve(this.channel.call("getInstalled", [type, extensionsProfileResource, productVersion, language])).then((extensions) => extensions.map((extension) => transformIncomingExtension(extension, null)));
  }
  updateMetadata(local, metadata, extensionsProfileResource) {
    return Promise.resolve(this.channel.call("updateMetadata", [local, metadata, extensionsProfileResource])).then((extension) => transformIncomingExtension(extension, null));
  }
  resetPinnedStateForAllUserExtensions(pinned) {
    return this.channel.call("resetPinnedStateForAllUserExtensions", [pinned]);
  }
  toggleApplicationScope(local, fromProfileLocation) {
    return this.channel.call("toggleApplicationScope", [local, fromProfileLocation]).then((extension) => transformIncomingExtension(extension, null));
  }
  copyExtensions(fromProfileLocation, toProfileLocation) {
    return this.channel.call("copyExtensions", [fromProfileLocation, toProfileLocation]);
  }
  getExtensionsControlManifest() {
    return Promise.resolve(this.channel.call("getExtensionsControlManifest"));
  }
  async download(extension, operation, donotVerifySignature) {
    const result = await this.channel.call("download", [extension, operation, donotVerifySignature]);
    return URI.revive(result);
  }
  async cleanUp() {
    return this.channel.call("cleanUp");
  }
  registerParticipant() {
    throw new Error("Not Supported");
  }
}
class ExtensionTipsChannel {
  constructor(service) {
    this.service = service;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listen(context, event) {
    throw new Error("Invalid listen");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  call(context, command, args) {
    switch (command) {
      case "getConfigBasedTips":
        return this.service.getConfigBasedTips(URI.revive(args[0]));
      case "getImportantExecutableBasedTips":
        return this.service.getImportantExecutableBasedTips();
      case "getOtherExecutableBasedTips":
        return this.service.getOtherExecutableBasedTips();
    }
    throw new Error("Invalid call");
  }
}
export {
  ExtensionManagementChannel,
  ExtensionManagementChannelClient,
  ExtensionTipsChannel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbk1hbmFnZW1lbnRJcGMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNsb25lQW5kQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRGVmYXVsdFVSSVRyYW5zZm9ybWVyLCBJVVJJVHJhbnNmb3JtZXIsIHRyYW5zZm9ybUFuZFJldml2ZUluY29taW5nVVJJcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaUlwYy5qcyc7XG5pbXBvcnQgeyBJQ2hhbm5lbCwgSVNlcnZlckNoYW5uZWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLmpzJztcbmltcG9ydCB7XG5cdElFeHRlbnNpb25JZGVudGlmaWVyLCBJRXh0ZW5zaW9uVGlwc1NlcnZpY2UsIElHYWxsZXJ5RXh0ZW5zaW9uLCBJTG9jYWxFeHRlbnNpb24sIElFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0LCBJbnN0YWxsT3B0aW9ucyxcblx0VW5pbnN0YWxsT3B0aW9ucywgTWV0YWRhdGEsIElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgRGlkVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQsIEluc3RhbGxFeHRlbnNpb25FdmVudCwgSW5zdGFsbEV4dGVuc2lvblJlc3VsdCxcblx0VW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQsIEluc3RhbGxPcGVyYXRpb24sIEluc3RhbGxFeHRlbnNpb25JbmZvLCBJUHJvZHVjdFZlcnNpb24sIERpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhLCBVbmluc3RhbGxFeHRlbnNpb25JbmZvLFxuXHRJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlXG59IGZyb20gJy4vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25UeXBlLCBJRXh0ZW5zaW9uTWFuaWZlc3QsIFRhcmdldFBsYXRmb3JtIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21tb250RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuL2Fic3RyYWN0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbGFuZ3VhZ2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBSZW1vdGVBZ2VudENvbm5lY3Rpb25Db250ZXh0IH0gZnJvbSAnLi4vLi4vcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudEVudmlyb25tZW50LmpzJztcblxuZnVuY3Rpb24gdHJhbnNmb3JtSW5jb21pbmdVUkkodXJpOiBVcmlDb21wb25lbnRzLCB0cmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyIHwgbnVsbCk6IFVSSTtcbmZ1bmN0aW9uIHRyYW5zZm9ybUluY29taW5nVVJJKHVyaTogVXJpQ29tcG9uZW50cyB8IHVuZGVmaW5lZCwgdHJhbnNmb3JtZXI6IElVUklUcmFuc2Zvcm1lciB8IG51bGwpOiBVUkkgfCB1bmRlZmluZWQ7XG5mdW5jdGlvbiB0cmFuc2Zvcm1JbmNvbWluZ1VSSSh1cmk6IFVyaUNvbXBvbmVudHMgfCB1bmRlZmluZWQsIHRyYW5zZm9ybWVyOiBJVVJJVHJhbnNmb3JtZXIgfCBudWxsKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHVyaSA/IFVSSS5yZXZpdmUodHJhbnNmb3JtZXIgPyB0cmFuc2Zvcm1lci50cmFuc2Zvcm1JbmNvbWluZyh1cmkpIDogdXJpKSA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gdHJhbnNmb3JtT3V0Z29pbmdVUkkodXJpOiBVUkksIHRyYW5zZm9ybWVyOiBJVVJJVHJhbnNmb3JtZXIgfCBudWxsKTogVVJJIHtcblx0cmV0dXJuIHRyYW5zZm9ybWVyID8gdHJhbnNmb3JtZXIudHJhbnNmb3JtT3V0Z29pbmdVUkkodXJpKSA6IHVyaTtcbn1cblxuZnVuY3Rpb24gdHJhbnNmb3JtSW5jb21pbmdFeHRlbnNpb24oZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24sIHRyYW5zZm9ybWVyOiBJVVJJVHJhbnNmb3JtZXIgfCBudWxsKTogSUxvY2FsRXh0ZW5zaW9uIHtcblx0dHJhbnNmb3JtZXIgPSB0cmFuc2Zvcm1lciA/IHRyYW5zZm9ybWVyIDogRGVmYXVsdFVSSVRyYW5zZm9ybWVyO1xuXHRjb25zdCBtYW5pZmVzdCA9IGV4dGVuc2lvbi5tYW5pZmVzdDtcblx0Y29uc3QgdHJhbnNmb3JtZWQgPSB0cmFuc2Zvcm1BbmRSZXZpdmVJbmNvbWluZ1VSSXMoeyAuLi5leHRlbnNpb24sIC4uLnsgbWFuaWZlc3Q6IHVuZGVmaW5lZCB9IH0sIHRyYW5zZm9ybWVyKTtcblx0cmV0dXJuIHsgLi4udHJhbnNmb3JtZWQsIC4uLnsgbWFuaWZlc3QgfSB9O1xufVxuXG5mdW5jdGlvbiB0cmFuc2Zvcm1JbmNvbWluZ09wdGlvbnM8TyBleHRlbmRzIHsgcHJvZmlsZUxvY2F0aW9uPzogVXJpQ29tcG9uZW50cyB9PihvcHRpb25zOiBPIHwgdW5kZWZpbmVkLCB0cmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyIHwgbnVsbCk6IE8gfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gb3B0aW9ucz8ucHJvZmlsZUxvY2F0aW9uID8gdHJhbnNmb3JtQW5kUmV2aXZlSW5jb21pbmdVUklzKG9wdGlvbnMsIHRyYW5zZm9ybWVyID8/IERlZmF1bHRVUklUcmFuc2Zvcm1lcikgOiBvcHRpb25zO1xufVxuXG5mdW5jdGlvbiB0cmFuc2Zvcm1PdXRnb2luZ0V4dGVuc2lvbihleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgdHJhbnNmb3JtZXI6IElVUklUcmFuc2Zvcm1lciB8IG51bGwpOiBJTG9jYWxFeHRlbnNpb24ge1xuXHRyZXR1cm4gdHJhbnNmb3JtZXIgPyBjbG9uZUFuZENoYW5nZShleHRlbnNpb24sIHZhbHVlID0+IHZhbHVlIGluc3RhbmNlb2YgVVJJID8gdHJhbnNmb3JtZXIudHJhbnNmb3JtT3V0Z29pbmdVUkkodmFsdWUpIDogdW5kZWZpbmVkKSA6IGV4dGVuc2lvbjtcbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbk1hbmFnZW1lbnRDaGFubmVsPFRDb250ZXh0ID0gUmVtb3RlQWdlbnRDb25uZWN0aW9uQ29udGV4dCB8IHN0cmluZz4gaW1wbGVtZW50cyBJU2VydmVyQ2hhbm5lbDxUQ29udGV4dD4ge1xuXG5cdHJlYWRvbmx5IG9uSW5zdGFsbEV4dGVuc2lvbjogRXZlbnQ8SW5zdGFsbEV4dGVuc2lvbkV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRJbnN0YWxsRXh0ZW5zaW9uczogRXZlbnQ8cmVhZG9ubHkgSW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdPjtcblx0cmVhZG9ubHkgb25Vbmluc3RhbGxFeHRlbnNpb246IEV2ZW50PFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRVbmluc3RhbGxFeHRlbnNpb246IEV2ZW50PERpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YTogRXZlbnQ8RGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGE+O1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgc2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLCBwcml2YXRlIGdldFVyaVRyYW5zZm9ybWVyOiAocmVxdWVzdENvbnRleHQ6IFRDb250ZXh0KSA9PiBJVVJJVHJhbnNmb3JtZXIgfCBudWxsKSB7XG5cdFx0dGhpcy5vbkluc3RhbGxFeHRlbnNpb24gPSBFdmVudC5idWZmZXIoc2VydmljZS5vbkluc3RhbGxFeHRlbnNpb24sICdvbkluc3RhbGxFeHRlbnNpb24nLCB0cnVlKTtcblx0XHR0aGlzLm9uRGlkSW5zdGFsbEV4dGVuc2lvbnMgPSBFdmVudC5idWZmZXIoc2VydmljZS5vbkRpZEluc3RhbGxFeHRlbnNpb25zLCAnb25EaWRJbnN0YWxsRXh0ZW5zaW9ucycsIHRydWUpO1xuXHRcdHRoaXMub25Vbmluc3RhbGxFeHRlbnNpb24gPSBFdmVudC5idWZmZXIoc2VydmljZS5vblVuaW5zdGFsbEV4dGVuc2lvbiwgJ29uVW5pbnN0YWxsRXh0ZW5zaW9uJywgdHJ1ZSk7XG5cdFx0dGhpcy5vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbiA9IEV2ZW50LmJ1ZmZlcihzZXJ2aWNlLm9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uLCAnb25EaWRVbmluc3RhbGxFeHRlbnNpb24nLCB0cnVlKTtcblx0XHR0aGlzLm9uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEgPSBFdmVudC5idWZmZXIoc2VydmljZS5vbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhLCAnb25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YScsIHRydWUpO1xuXHR9XG5cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0bGlzdGVuKGNvbnRleHQ6IGFueSwgZXZlbnQ6IHN0cmluZyk6IEV2ZW50PGFueT4ge1xuXHRcdGNvbnN0IHVyaVRyYW5zZm9ybWVyID0gdGhpcy5nZXRVcmlUcmFuc2Zvcm1lcihjb250ZXh0KTtcblx0XHRzd2l0Y2ggKGV2ZW50KSB7XG5cdFx0XHRjYXNlICdvbkluc3RhbGxFeHRlbnNpb24nOiB7XG5cdFx0XHRcdHJldHVybiBFdmVudC5tYXA8SW5zdGFsbEV4dGVuc2lvbkV2ZW50LCBJbnN0YWxsRXh0ZW5zaW9uRXZlbnQ+KHRoaXMub25JbnN0YWxsRXh0ZW5zaW9uLCBlID0+IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Li4uZSxcblx0XHRcdFx0XHRcdHByb2ZpbGVMb2NhdGlvbjogZS5wcm9maWxlTG9jYXRpb24gPyB0cmFuc2Zvcm1PdXRnb2luZ1VSSShlLnByb2ZpbGVMb2NhdGlvbiwgdXJpVHJhbnNmb3JtZXIpIDogZS5wcm9maWxlTG9jYXRpb25cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ29uRGlkSW5zdGFsbEV4dGVuc2lvbnMnOiB7XG5cdFx0XHRcdHJldHVybiBFdmVudC5tYXA8cmVhZG9ubHkgSW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdLCByZWFkb25seSBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0W10+KHRoaXMub25EaWRJbnN0YWxsRXh0ZW5zaW9ucywgcmVzdWx0cyA9PlxuXHRcdFx0XHRcdHJlc3VsdHMubWFwKGkgPT4gKHtcblx0XHRcdFx0XHRcdC4uLmksXG5cdFx0XHRcdFx0XHRsb2NhbDogaS5sb2NhbCA/IHRyYW5zZm9ybU91dGdvaW5nRXh0ZW5zaW9uKGkubG9jYWwsIHVyaVRyYW5zZm9ybWVyKSA6IGkubG9jYWwsXG5cdFx0XHRcdFx0XHRwcm9maWxlTG9jYXRpb246IGkucHJvZmlsZUxvY2F0aW9uID8gdHJhbnNmb3JtT3V0Z29pbmdVUkkoaS5wcm9maWxlTG9jYXRpb24sIHVyaVRyYW5zZm9ybWVyKSA6IGkucHJvZmlsZUxvY2F0aW9uXG5cdFx0XHRcdFx0fSkpKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ29uVW5pbnN0YWxsRXh0ZW5zaW9uJzoge1xuXHRcdFx0XHRyZXR1cm4gRXZlbnQubWFwPFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50LCBVbmluc3RhbGxFeHRlbnNpb25FdmVudD4odGhpcy5vblVuaW5zdGFsbEV4dGVuc2lvbiwgZSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdC4uLmUsXG5cdFx0XHRcdFx0XHRwcm9maWxlTG9jYXRpb246IGUucHJvZmlsZUxvY2F0aW9uID8gdHJhbnNmb3JtT3V0Z29pbmdVUkkoZS5wcm9maWxlTG9jYXRpb24sIHVyaVRyYW5zZm9ybWVyKSA6IGUucHJvZmlsZUxvY2F0aW9uXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdvbkRpZFVuaW5zdGFsbEV4dGVuc2lvbic6IHtcblx0XHRcdFx0cmV0dXJuIEV2ZW50Lm1hcDxEaWRVbmluc3RhbGxFeHRlbnNpb25FdmVudCwgRGlkVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQ+KHRoaXMub25EaWRVbmluc3RhbGxFeHRlbnNpb24sIGUgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHQuLi5lLFxuXHRcdFx0XHRcdFx0cHJvZmlsZUxvY2F0aW9uOiBlLnByb2ZpbGVMb2NhdGlvbiA/IHRyYW5zZm9ybU91dGdvaW5nVVJJKGUucHJvZmlsZUxvY2F0aW9uLCB1cmlUcmFuc2Zvcm1lcikgOiBlLnByb2ZpbGVMb2NhdGlvblxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnb25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YSc6IHtcblx0XHRcdFx0cmV0dXJuIEV2ZW50Lm1hcDxEaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YSwgRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGE+KHRoaXMub25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YSwgZSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGxvY2FsOiB0cmFuc2Zvcm1PdXRnb2luZ0V4dGVuc2lvbihlLmxvY2FsLCB1cmlUcmFuc2Zvcm1lciksXG5cdFx0XHRcdFx0XHRwcm9maWxlTG9jYXRpb246IHRyYW5zZm9ybU91dGdvaW5nVVJJKGUucHJvZmlsZUxvY2F0aW9uLCB1cmlUcmFuc2Zvcm1lcilcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgbGlzdGVuJyk7XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRhc3luYyBjYWxsKGNvbnRleHQ6IGFueSwgY29tbWFuZDogc3RyaW5nLCBhcmdzPzogYW55KTogUHJvbWlzZTxhbnk+IHtcblx0XHRjb25zdCB1cmlUcmFuc2Zvcm1lcjogSVVSSVRyYW5zZm9ybWVyIHwgbnVsbCA9IHRoaXMuZ2V0VXJpVHJhbnNmb3JtZXIoY29udGV4dCk7XG5cdFx0c3dpdGNoIChjb21tYW5kKSB7XG5cdFx0XHRjYXNlICd6aXAnOiB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IHRyYW5zZm9ybUluY29taW5nRXh0ZW5zaW9uKGFyZ3NbMF0sIHVyaVRyYW5zZm9ybWVyKTtcblx0XHRcdFx0Y29uc3QgdXJpID0gYXdhaXQgdGhpcy5zZXJ2aWNlLnppcChleHRlbnNpb24pO1xuXHRcdFx0XHRyZXR1cm4gdHJhbnNmb3JtT3V0Z29pbmdVUkkodXJpLCB1cmlUcmFuc2Zvcm1lcik7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdpbnN0YWxsJzoge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXJ2aWNlLmluc3RhbGwodHJhbnNmb3JtSW5jb21pbmdVUkkoYXJnc1swXSwgdXJpVHJhbnNmb3JtZXIpLCB0cmFuc2Zvcm1JbmNvbWluZ09wdGlvbnMoYXJnc1sxXSwgdXJpVHJhbnNmb3JtZXIpKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2luc3RhbGxGcm9tTG9jYXRpb24nOiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNlcnZpY2UuaW5zdGFsbEZyb21Mb2NhdGlvbih0cmFuc2Zvcm1JbmNvbWluZ1VSSShhcmdzWzBdLCB1cmlUcmFuc2Zvcm1lciksIHRyYW5zZm9ybUluY29taW5nVVJJKGFyZ3NbMV0sIHVyaVRyYW5zZm9ybWVyKSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdpbnN0YWxsRXh0ZW5zaW9uc0Zyb21Qcm9maWxlJzoge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXJ2aWNlLmluc3RhbGxFeHRlbnNpb25zRnJvbVByb2ZpbGUoYXJnc1swXSwgdHJhbnNmb3JtSW5jb21pbmdVUkkoYXJnc1sxXSwgdXJpVHJhbnNmb3JtZXIpLCB0cmFuc2Zvcm1JbmNvbWluZ1VSSShhcmdzWzJdLCB1cmlUcmFuc2Zvcm1lcikpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnZ2V0TWFuaWZlc3QnOiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNlcnZpY2UuZ2V0TWFuaWZlc3QodHJhbnNmb3JtSW5jb21pbmdVUkkoYXJnc1swXSwgdXJpVHJhbnNmb3JtZXIpKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2dldFRhcmdldFBsYXRmb3JtJzoge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXJ2aWNlLmdldFRhcmdldFBsYXRmb3JtKCk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdpbnN0YWxsRnJvbUdhbGxlcnknOiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNlcnZpY2UuaW5zdGFsbEZyb21HYWxsZXJ5KGFyZ3NbMF0sIHRyYW5zZm9ybUluY29taW5nT3B0aW9ucyhhcmdzWzFdLCB1cmlUcmFuc2Zvcm1lcikpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnaW5zdGFsbEdhbGxlcnlFeHRlbnNpb25zJzoge1xuXHRcdFx0XHRjb25zdCBhcmc6IEluc3RhbGxFeHRlbnNpb25JbmZvW10gPSBhcmdzWzBdO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXJ2aWNlLmluc3RhbGxHYWxsZXJ5RXh0ZW5zaW9ucyhhcmcubWFwKCh7IGV4dGVuc2lvbiwgb3B0aW9ucyB9KSA9PiAoeyBleHRlbnNpb24sIG9wdGlvbnM6IHRyYW5zZm9ybUluY29taW5nT3B0aW9ucyhvcHRpb25zLCB1cmlUcmFuc2Zvcm1lcikgPz8ge30gfSkpKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3VuaW5zdGFsbCc6IHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2VydmljZS51bmluc3RhbGwodHJhbnNmb3JtSW5jb21pbmdFeHRlbnNpb24oYXJnc1swXSwgdXJpVHJhbnNmb3JtZXIpLCB0cmFuc2Zvcm1JbmNvbWluZ09wdGlvbnMoYXJnc1sxXSwgdXJpVHJhbnNmb3JtZXIpKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3VuaW5zdGFsbEV4dGVuc2lvbnMnOiB7XG5cdFx0XHRcdGNvbnN0IGFyZzogVW5pbnN0YWxsRXh0ZW5zaW9uSW5mb1tdID0gYXJnc1swXTtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc2VydmljZS51bmluc3RhbGxFeHRlbnNpb25zKGFyZy5tYXAoKHsgZXh0ZW5zaW9uLCBvcHRpb25zIH0pID0+ICh7IGV4dGVuc2lvbjogdHJhbnNmb3JtSW5jb21pbmdFeHRlbnNpb24oZXh0ZW5zaW9uLCB1cmlUcmFuc2Zvcm1lciksIG9wdGlvbnM6IHRyYW5zZm9ybUluY29taW5nT3B0aW9ucyhvcHRpb25zLCB1cmlUcmFuc2Zvcm1lcikgfSkpKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2dldEluc3RhbGxlZCc6IHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9ucyA9IGF3YWl0IHRoaXMuc2VydmljZS5nZXRJbnN0YWxsZWQoYXJnc1swXSwgdHJhbnNmb3JtSW5jb21pbmdVUkkoYXJnc1sxXSwgdXJpVHJhbnNmb3JtZXIpLCBhcmdzWzJdLCBhcmdzWzNdKTtcblx0XHRcdFx0cmV0dXJuIGV4dGVuc2lvbnMubWFwKGUgPT4gdHJhbnNmb3JtT3V0Z29pbmdFeHRlbnNpb24oZSwgdXJpVHJhbnNmb3JtZXIpKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3RvZ2dsZUFwcGxpY2F0aW9uU2NvcGUnOiB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbiA9IGF3YWl0IHRoaXMuc2VydmljZS50b2dnbGVBcHBsaWNhdGlvblNjb3BlKHRyYW5zZm9ybUluY29taW5nRXh0ZW5zaW9uKGFyZ3NbMF0sIHVyaVRyYW5zZm9ybWVyKSwgdHJhbnNmb3JtSW5jb21pbmdVUkkoYXJnc1sxXSwgdXJpVHJhbnNmb3JtZXIpKTtcblx0XHRcdFx0cmV0dXJuIHRyYW5zZm9ybU91dGdvaW5nRXh0ZW5zaW9uKGV4dGVuc2lvbiwgdXJpVHJhbnNmb3JtZXIpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnY29weUV4dGVuc2lvbnMnOiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNlcnZpY2UuY29weUV4dGVuc2lvbnModHJhbnNmb3JtSW5jb21pbmdVUkkoYXJnc1swXSwgdXJpVHJhbnNmb3JtZXIpLCB0cmFuc2Zvcm1JbmNvbWluZ1VSSShhcmdzWzFdLCB1cmlUcmFuc2Zvcm1lcikpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAndXBkYXRlTWV0YWRhdGEnOiB7XG5cdFx0XHRcdGNvbnN0IGUgPSBhd2FpdCB0aGlzLnNlcnZpY2UudXBkYXRlTWV0YWRhdGEodHJhbnNmb3JtSW5jb21pbmdFeHRlbnNpb24oYXJnc1swXSwgdXJpVHJhbnNmb3JtZXIpLCBhcmdzWzFdLCB0cmFuc2Zvcm1JbmNvbWluZ1VSSShhcmdzWzJdLCB1cmlUcmFuc2Zvcm1lcikpO1xuXHRcdFx0XHRyZXR1cm4gdHJhbnNmb3JtT3V0Z29pbmdFeHRlbnNpb24oZSwgdXJpVHJhbnNmb3JtZXIpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAncmVzZXRQaW5uZWRTdGF0ZUZvckFsbFVzZXJFeHRlbnNpb25zJzoge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXJ2aWNlLnJlc2V0UGlubmVkU3RhdGVGb3JBbGxVc2VyRXh0ZW5zaW9ucyhhcmdzWzBdKTtcblx0XHRcdH1cblx0XHRcdGNhc2UgJ2dldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QnOiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNlcnZpY2UuZ2V0RXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdCgpO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnZG93bmxvYWQnOiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNlcnZpY2UuZG93bmxvYWQoYXJnc1swXSwgYXJnc1sxXSwgYXJnc1syXSk7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdjbGVhblVwJzoge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5zZXJ2aWNlLmNsZWFuVXAoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgY2FsbCcpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgRXh0ZW5zaW9uRXZlbnRSZXN1bHQge1xuXHRyZWFkb25seSBwcm9maWxlTG9jYXRpb246IFVSSTtcblx0cmVhZG9ubHkgbG9jYWw/OiBJTG9jYWxFeHRlbnNpb247XG5cdHJlYWRvbmx5IGFwcGxpY2F0aW9uU2NvcGVkPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvbk1hbmFnZW1lbnRDaGFubmVsQ2xpZW50IGV4dGVuZHMgQ29tbW9udEV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIGltcGxlbWVudHMgSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uSW5zdGFsbEV4dGVuc2lvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEluc3RhbGxFeHRlbnNpb25FdmVudD4oKSk7XG5cdGdldCBvbkluc3RhbGxFeHRlbnNpb24oKSB7IHJldHVybiB0aGlzLl9vbkluc3RhbGxFeHRlbnNpb24uZXZlbnQ7IH1cblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkSW5zdGFsbEV4dGVuc2lvbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxyZWFkb25seSBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0W10+KCkpO1xuXHRnZXQgb25EaWRJbnN0YWxsRXh0ZW5zaW9ucygpIHsgcmV0dXJuIHRoaXMuX29uRGlkSW5zdGFsbEV4dGVuc2lvbnMuZXZlbnQ7IH1cblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uVW5pbnN0YWxsRXh0ZW5zaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQ+KCkpO1xuXHRnZXQgb25Vbmluc3RhbGxFeHRlbnNpb24oKSB7IHJldHVybiB0aGlzLl9vblVuaW5zdGFsbEV4dGVuc2lvbi5ldmVudDsgfVxuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRVbmluc3RhbGxFeHRlbnNpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxEaWRVbmluc3RhbGxFeHRlbnNpb25FdmVudD4oKSk7XG5cdGdldCBvbkRpZFVuaW5zdGFsbEV4dGVuc2lvbigpIHsgcmV0dXJuIHRoaXMuX29uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uLmV2ZW50OyB9XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8RGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGE+KCkpO1xuXHRnZXQgb25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YSgpIHsgcmV0dXJuIHRoaXMuX29uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEuZXZlbnQ7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGNoYW5uZWw6IElDaGFubmVsLFxuXHRcdHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0YWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlOiBJQWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihwcm9kdWN0U2VydmljZSwgYWxsb3dlZEV4dGVuc2lvbnNTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYW5uZWwubGlzdGVuPEluc3RhbGxFeHRlbnNpb25FdmVudD4oJ29uSW5zdGFsbEV4dGVuc2lvbicpKGUgPT4gdGhpcy5vbkluc3RhbGxFeHRlbnNpb25FdmVudCh7IC4uLmUsIHNvdXJjZTogdGhpcy5pc1VyaUNvbXBvbmVudHMoZS5zb3VyY2UpID8gVVJJLnJldml2ZShlLnNvdXJjZSkgOiBlLnNvdXJjZSwgcHJvZmlsZUxvY2F0aW9uOiBVUkkucmV2aXZlKGUucHJvZmlsZUxvY2F0aW9uKSB9KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhbm5lbC5saXN0ZW48cmVhZG9ubHkgSW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdPignb25EaWRJbnN0YWxsRXh0ZW5zaW9ucycpKHJlc3VsdHMgPT4gdGhpcy5vbkRpZEluc3RhbGxFeHRlbnNpb25zRXZlbnQocmVzdWx0cy5tYXAoZSA9PiAoeyAuLi5lLCBsb2NhbDogZS5sb2NhbCA/IHRyYW5zZm9ybUluY29taW5nRXh0ZW5zaW9uKGUubG9jYWwsIG51bGwpIDogZS5sb2NhbCwgc291cmNlOiB0aGlzLmlzVXJpQ29tcG9uZW50cyhlLnNvdXJjZSkgPyBVUkkucmV2aXZlKGUuc291cmNlKSA6IGUuc291cmNlLCBwcm9maWxlTG9jYXRpb246IFVSSS5yZXZpdmUoZS5wcm9maWxlTG9jYXRpb24pIH0pKSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYW5uZWwubGlzdGVuPFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50Pignb25Vbmluc3RhbGxFeHRlbnNpb24nKShlID0+IHRoaXMub25Vbmluc3RhbGxFeHRlbnNpb25FdmVudCh7IC4uLmUsIHByb2ZpbGVMb2NhdGlvbjogVVJJLnJldml2ZShlLnByb2ZpbGVMb2NhdGlvbikgfSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYW5uZWwubGlzdGVuPERpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50Pignb25EaWRVbmluc3RhbGxFeHRlbnNpb24nKShlID0+IHRoaXMub25EaWRVbmluc3RhbGxFeHRlbnNpb25FdmVudCh7IC4uLmUsIHByb2ZpbGVMb2NhdGlvbjogVVJJLnJldml2ZShlLnByb2ZpbGVMb2NhdGlvbikgfSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNoYW5uZWwubGlzdGVuPERpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhPignb25EaWRVcGRhdGVFeHRlbnNpb25NZXRhZGF0YScpKGUgPT4gdGhpcy5vbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhRXZlbnQoeyBwcm9maWxlTG9jYXRpb246IFVSSS5yZXZpdmUoZS5wcm9maWxlTG9jYXRpb24pLCBsb2NhbDogdHJhbnNmb3JtSW5jb21pbmdFeHRlbnNpb24oZS5sb2NhbCwgbnVsbCkgfSkpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvbkluc3RhbGxFeHRlbnNpb25FdmVudChldmVudDogSW5zdGFsbEV4dGVuc2lvbkV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fb25JbnN0YWxsRXh0ZW5zaW9uLmZpcmUoZXZlbnQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG9uRGlkSW5zdGFsbEV4dGVuc2lvbnNFdmVudChyZXN1bHRzOiByZWFkb25seSBJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0W10pOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZEluc3RhbGxFeHRlbnNpb25zLmZpcmUocmVzdWx0cyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25Vbmluc3RhbGxFeHRlbnNpb25FdmVudChldmVudDogVW5pbnN0YWxsRXh0ZW5zaW9uRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLl9vblVuaW5zdGFsbEV4dGVuc2lvbi5maXJlKGV2ZW50KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvbkRpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50KGV2ZW50OiBEaWRVbmluc3RhbGxFeHRlbnNpb25FdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uLmZpcmUoZXZlbnQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG9uRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGFFdmVudChldmVudDogRGlkVXBkYXRlRXh0ZW5zaW9uTWV0YWRhdGEpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFVwZGF0ZUV4dGVuc2lvbk1ldGFkYXRhLmZpcmUoZXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1VyaUNvbXBvbmVudHMob2JqOiB1bmtub3duKTogb2JqIGlzIFVyaUNvbXBvbmVudHMge1xuXHRcdGlmICghb2JqKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHRoaW5nID0gb2JqIGFzIFVyaUNvbXBvbmVudHMgfCB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIHR5cGVvZiB0aGluZz8ucGF0aCA9PT0gJ3N0cmluZycgJiZcblx0XHRcdHR5cGVvZiB0aGluZz8uc2NoZW1lID09PSAnc3RyaW5nJztcblx0fVxuXG5cdHByb3RlY3RlZCBfdGFyZ2V0UGxhdGZvcm1Qcm9taXNlOiBQcm9taXNlPFRhcmdldFBsYXRmb3JtPiB8IHVuZGVmaW5lZDtcblx0Z2V0VGFyZ2V0UGxhdGZvcm0oKTogUHJvbWlzZTxUYXJnZXRQbGF0Zm9ybT4ge1xuXHRcdGlmICghdGhpcy5fdGFyZ2V0UGxhdGZvcm1Qcm9taXNlKSB7XG5cdFx0XHR0aGlzLl90YXJnZXRQbGF0Zm9ybVByb21pc2UgPSB0aGlzLmNoYW5uZWwuY2FsbDxUYXJnZXRQbGF0Zm9ybT4oJ2dldFRhcmdldFBsYXRmb3JtJyk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90YXJnZXRQbGF0Zm9ybVByb21pc2U7XG5cdH1cblxuXHR6aXAoZXh0ZW5zaW9uOiBJTG9jYWxFeHRlbnNpb24pOiBQcm9taXNlPFVSST4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5jaGFubmVsLmNhbGw8VXJpQ29tcG9uZW50cz4oJ3ppcCcsIFtleHRlbnNpb25dKS50aGVuKHJlc3VsdCA9PiBVUkkucmV2aXZlKHJlc3VsdCkpKTtcblx0fVxuXG5cdGluc3RhbGwodnNpeDogVVJJLCBvcHRpb25zPzogSW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5jaGFubmVsLmNhbGw8SUxvY2FsRXh0ZW5zaW9uPignaW5zdGFsbCcsIFt2c2l4LCBvcHRpb25zXSkpLnRoZW4obG9jYWwgPT4gdHJhbnNmb3JtSW5jb21pbmdFeHRlbnNpb24obG9jYWwsIG51bGwpKTtcblx0fVxuXG5cdGluc3RhbGxGcm9tTG9jYXRpb24obG9jYXRpb246IFVSSSwgcHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5jaGFubmVsLmNhbGw8SUxvY2FsRXh0ZW5zaW9uPignaW5zdGFsbEZyb21Mb2NhdGlvbicsIFtsb2NhdGlvbiwgcHJvZmlsZUxvY2F0aW9uXSkpLnRoZW4obG9jYWwgPT4gdHJhbnNmb3JtSW5jb21pbmdFeHRlbnNpb24obG9jYWwsIG51bGwpKTtcblx0fVxuXG5cdGFzeW5jIGluc3RhbGxFeHRlbnNpb25zRnJvbVByb2ZpbGUoZXh0ZW5zaW9uczogSUV4dGVuc2lvbklkZW50aWZpZXJbXSwgZnJvbVByb2ZpbGVMb2NhdGlvbjogVVJJLCB0b1Byb2ZpbGVMb2NhdGlvbjogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb25bXT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY2hhbm5lbC5jYWxsPElMb2NhbEV4dGVuc2lvbltdPignaW5zdGFsbEV4dGVuc2lvbnNGcm9tUHJvZmlsZScsIFtleHRlbnNpb25zLCBmcm9tUHJvZmlsZUxvY2F0aW9uLCB0b1Byb2ZpbGVMb2NhdGlvbl0pO1xuXHRcdHJldHVybiByZXN1bHQubWFwKGxvY2FsID0+IHRyYW5zZm9ybUluY29taW5nRXh0ZW5zaW9uKGxvY2FsLCBudWxsKSk7XG5cdH1cblxuXHRnZXRNYW5pZmVzdCh2c2l4OiBVUkkpOiBQcm9taXNlPElFeHRlbnNpb25NYW5pZmVzdD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5jaGFubmVsLmNhbGw8SUV4dGVuc2lvbk1hbmlmZXN0PignZ2V0TWFuaWZlc3QnLCBbdnNpeF0pKTtcblx0fVxuXG5cdGluc3RhbGxGcm9tR2FsbGVyeShleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uLCBpbnN0YWxsT3B0aW9ucz86IEluc3RhbGxPcHRpb25zKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuY2hhbm5lbC5jYWxsPElMb2NhbEV4dGVuc2lvbj4oJ2luc3RhbGxGcm9tR2FsbGVyeScsIFtleHRlbnNpb24sIGluc3RhbGxPcHRpb25zXSkpLnRoZW4obG9jYWwgPT4gdHJhbnNmb3JtSW5jb21pbmdFeHRlbnNpb24obG9jYWwsIG51bGwpKTtcblx0fVxuXG5cdGFzeW5jIGluc3RhbGxHYWxsZXJ5RXh0ZW5zaW9ucyhleHRlbnNpb25zOiBJbnN0YWxsRXh0ZW5zaW9uSW5mb1tdKTogUHJvbWlzZTxJbnN0YWxsRXh0ZW5zaW9uUmVzdWx0W10+IHtcblx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5jaGFubmVsLmNhbGw8SW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdPignaW5zdGFsbEdhbGxlcnlFeHRlbnNpb25zJywgW2V4dGVuc2lvbnNdKTtcblx0XHRyZXR1cm4gcmVzdWx0cy5tYXAoZSA9PiAoeyAuLi5lLCBsb2NhbDogZS5sb2NhbCA/IHRyYW5zZm9ybUluY29taW5nRXh0ZW5zaW9uKGUubG9jYWwsIG51bGwpIDogZS5sb2NhbCwgc291cmNlOiB0aGlzLmlzVXJpQ29tcG9uZW50cyhlLnNvdXJjZSkgPyBVUkkucmV2aXZlKGUuc291cmNlKSA6IGUuc291cmNlLCBwcm9maWxlTG9jYXRpb246IFVSSS5yZXZpdmUoZS5wcm9maWxlTG9jYXRpb24pIH0pKTtcblx0fVxuXG5cdHVuaW5zdGFsbChleHRlbnNpb246IElMb2NhbEV4dGVuc2lvbiwgb3B0aW9ucz86IFVuaW5zdGFsbE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoZXh0ZW5zaW9uLmlzV29ya3NwYWNlU2NvcGVkKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB1bmluc3RhbGwgYSB3b3Jrc3BhY2UgZXh0ZW5zaW9uJyk7XG5cdFx0fVxuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5jaGFubmVsLmNhbGw8dm9pZD4oJ3VuaW5zdGFsbCcsIFtleHRlbnNpb24sIG9wdGlvbnNdKSk7XG5cdH1cblxuXHR1bmluc3RhbGxFeHRlbnNpb25zKGV4dGVuc2lvbnM6IFVuaW5zdGFsbEV4dGVuc2lvbkluZm9bXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChleHRlbnNpb25zLnNvbWUoZSA9PiBlLmV4dGVuc2lvbi5pc1dvcmtzcGFjZVNjb3BlZCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHVuaW5zdGFsbCBhIHdvcmtzcGFjZSBleHRlbnNpb24nKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLmNoYW5uZWwuY2FsbDx2b2lkPigndW5pbnN0YWxsRXh0ZW5zaW9ucycsIFtleHRlbnNpb25zXSkpO1xuXG5cdH1cblxuXHRnZXRJbnN0YWxsZWQodHlwZTogRXh0ZW5zaW9uVHlwZSB8IG51bGwgPSBudWxsLCBleHRlbnNpb25zUHJvZmlsZVJlc291cmNlPzogVVJJLCBwcm9kdWN0VmVyc2lvbj86IElQcm9kdWN0VmVyc2lvbik6IFByb21pc2U8SUxvY2FsRXh0ZW5zaW9uW10+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuY2hhbm5lbC5jYWxsPElMb2NhbEV4dGVuc2lvbltdPignZ2V0SW5zdGFsbGVkJywgW3R5cGUsIGV4dGVuc2lvbnNQcm9maWxlUmVzb3VyY2UsIHByb2R1Y3RWZXJzaW9uLCBsYW5ndWFnZV0pKVxuXHRcdFx0LnRoZW4oZXh0ZW5zaW9ucyA9PiBleHRlbnNpb25zLm1hcChleHRlbnNpb24gPT4gdHJhbnNmb3JtSW5jb21pbmdFeHRlbnNpb24oZXh0ZW5zaW9uLCBudWxsKSkpO1xuXHR9XG5cblx0dXBkYXRlTWV0YWRhdGEobG9jYWw6IElMb2NhbEV4dGVuc2lvbiwgbWV0YWRhdGE6IFBhcnRpYWw8TWV0YWRhdGE+LCBleHRlbnNpb25zUHJvZmlsZVJlc291cmNlPzogVVJJKTogUHJvbWlzZTxJTG9jYWxFeHRlbnNpb24+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMuY2hhbm5lbC5jYWxsPElMb2NhbEV4dGVuc2lvbj4oJ3VwZGF0ZU1ldGFkYXRhJywgW2xvY2FsLCBtZXRhZGF0YSwgZXh0ZW5zaW9uc1Byb2ZpbGVSZXNvdXJjZV0pKVxuXHRcdFx0LnRoZW4oZXh0ZW5zaW9uID0+IHRyYW5zZm9ybUluY29taW5nRXh0ZW5zaW9uKGV4dGVuc2lvbiwgbnVsbCkpO1xuXHR9XG5cblx0cmVzZXRQaW5uZWRTdGF0ZUZvckFsbFVzZXJFeHRlbnNpb25zKHBpbm5lZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmNoYW5uZWwuY2FsbDx2b2lkPigncmVzZXRQaW5uZWRTdGF0ZUZvckFsbFVzZXJFeHRlbnNpb25zJywgW3Bpbm5lZF0pO1xuXHR9XG5cblx0dG9nZ2xlQXBwbGljYXRpb25TY29wZShsb2NhbDogSUxvY2FsRXh0ZW5zaW9uLCBmcm9tUHJvZmlsZUxvY2F0aW9uOiBVUkkpOiBQcm9taXNlPElMb2NhbEV4dGVuc2lvbj4ge1xuXHRcdHJldHVybiB0aGlzLmNoYW5uZWwuY2FsbDxJTG9jYWxFeHRlbnNpb24+KCd0b2dnbGVBcHBsaWNhdGlvblNjb3BlJywgW2xvY2FsLCBmcm9tUHJvZmlsZUxvY2F0aW9uXSlcblx0XHRcdC50aGVuKGV4dGVuc2lvbiA9PiB0cmFuc2Zvcm1JbmNvbWluZ0V4dGVuc2lvbihleHRlbnNpb24sIG51bGwpKTtcblx0fVxuXG5cdGNvcHlFeHRlbnNpb25zKGZyb21Qcm9maWxlTG9jYXRpb246IFVSSSwgdG9Qcm9maWxlTG9jYXRpb246IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmNoYW5uZWwuY2FsbDx2b2lkPignY29weUV4dGVuc2lvbnMnLCBbZnJvbVByb2ZpbGVMb2NhdGlvbiwgdG9Qcm9maWxlTG9jYXRpb25dKTtcblx0fVxuXG5cdGdldEV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3QoKTogUHJvbWlzZTxJRXh0ZW5zaW9uc0NvbnRyb2xNYW5pZmVzdD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5jaGFubmVsLmNhbGw8SUV4dGVuc2lvbnNDb250cm9sTWFuaWZlc3Q+KCdnZXRFeHRlbnNpb25zQ29udHJvbE1hbmlmZXN0JykpO1xuXHR9XG5cblx0YXN5bmMgZG93bmxvYWQoZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiwgb3BlcmF0aW9uOiBJbnN0YWxsT3BlcmF0aW9uLCBkb25vdFZlcmlmeVNpZ25hdHVyZTogYm9vbGVhbik6IFByb21pc2U8VVJJPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jaGFubmVsLmNhbGw8VXJpQ29tcG9uZW50cz4oJ2Rvd25sb2FkJywgW2V4dGVuc2lvbiwgb3BlcmF0aW9uLCBkb25vdFZlcmlmeVNpZ25hdHVyZV0pO1xuXHRcdHJldHVybiBVUkkucmV2aXZlKHJlc3VsdCk7XG5cdH1cblxuXHRhc3luYyBjbGVhblVwKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLmNoYW5uZWwuY2FsbCgnY2xlYW5VcCcpO1xuXHR9XG5cblx0cmVnaXN0ZXJQYXJ0aWNpcGFudCgpIHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgU3VwcG9ydGVkJyk7IH1cbn1cblxuZXhwb3J0IGNsYXNzIEV4dGVuc2lvblRpcHNDaGFubmVsIGltcGxlbWVudHMgSVNlcnZlckNoYW5uZWwge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgc2VydmljZTogSUV4dGVuc2lvblRpcHNTZXJ2aWNlKSB7XG5cdH1cblxuXHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRsaXN0ZW4oY29udGV4dDogYW55LCBldmVudDogc3RyaW5nKTogRXZlbnQ8YW55PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxpc3RlbicpO1xuXHR9XG5cblx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0Y2FsbChjb250ZXh0OiBhbnksIGNvbW1hbmQ6IHN0cmluZywgYXJncz86IGFueSk6IFByb21pc2U8YW55PiB7XG5cdFx0c3dpdGNoIChjb21tYW5kKSB7XG5cdFx0XHRjYXNlICdnZXRDb25maWdCYXNlZFRpcHMnOiByZXR1cm4gdGhpcy5zZXJ2aWNlLmdldENvbmZpZ0Jhc2VkVGlwcyhVUkkucmV2aXZlKGFyZ3NbMF0pKTtcblx0XHRcdGNhc2UgJ2dldEltcG9ydGFudEV4ZWN1dGFibGVCYXNlZFRpcHMnOiByZXR1cm4gdGhpcy5zZXJ2aWNlLmdldEltcG9ydGFudEV4ZWN1dGFibGVCYXNlZFRpcHMoKTtcblx0XHRcdGNhc2UgJ2dldE90aGVyRXhlY3V0YWJsZUJhc2VkVGlwcyc6IHJldHVybiB0aGlzLnNlcnZpY2UuZ2V0T3RoZXJFeGVjdXRhYmxlQmFzZWRUaXBzKCk7XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGNhbGwnKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLHVCQUF3QyxzQ0FBc0M7QUFVdkYsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyxnQkFBZ0I7QUFLekIsU0FBUyxxQkFBcUIsS0FBZ0MsYUFBc0Q7QUFDbkgsU0FBTyxNQUFNLElBQUksT0FBTyxjQUFjLFlBQVksa0JBQWtCLEdBQUcsSUFBSSxHQUFHLElBQUk7QUFDbkY7QUFFQSxTQUFTLHFCQUFxQixLQUFVLGFBQTBDO0FBQ2pGLFNBQU8sY0FBYyxZQUFZLHFCQUFxQixHQUFHLElBQUk7QUFDOUQ7QUFFQSxTQUFTLDJCQUEyQixXQUE0QixhQUFzRDtBQUNySCxnQkFBYyxjQUFjLGNBQWM7QUFDMUMsUUFBTSxXQUFXLFVBQVU7QUFDM0IsUUFBTSxjQUFjLCtCQUErQixFQUFFLEdBQUcsV0FBVyxHQUFHLEVBQUUsVUFBVSxPQUFVLEVBQUUsR0FBRyxXQUFXO0FBQzVHLFNBQU8sRUFBRSxHQUFHLGFBQWEsR0FBRyxFQUFFLFNBQVMsRUFBRTtBQUMxQztBQUVBLFNBQVMseUJBQXdFLFNBQXdCLGFBQW9EO0FBQzVKLFNBQU8sU0FBUyxrQkFBa0IsK0JBQStCLFNBQVMsZUFBZSxxQkFBcUIsSUFBSTtBQUNuSDtBQUVBLFNBQVMsMkJBQTJCLFdBQTRCLGFBQXNEO0FBQ3JILFNBQU8sY0FBYyxlQUFlLFdBQVcsV0FBUyxpQkFBaUIsTUFBTSxZQUFZLHFCQUFxQixLQUFLLElBQUksTUFBUyxJQUFJO0FBQ3ZJO0FBRU8sTUFBTSwyQkFBaUg7QUFBQSxFQVE3SCxZQUFvQixTQUE4QyxtQkFBeUU7QUFBdkg7QUFBOEM7QUFDakUsU0FBSyxxQkFBcUIsTUFBTSxPQUFPLFFBQVEsb0JBQW9CLHNCQUFz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
