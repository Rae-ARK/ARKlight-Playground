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
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ALL_EXTENSION_KINDS, ExtensionIdentifierMap } from "../../../../platform/extensions/common/extensions.js";
import { ExtensionsRegistry } from "./extensionsRegistry.js";
import { getGalleryExtensionId } from "../../../../platform/extensionManagement/common/extensionManagementUtil.js";
import { isNonEmptyArray } from "../../../../base/common/arrays.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { WORKSPACE_TRUST_EXTENSION_SUPPORT } from "../../workspaces/common/workspaceTrust.js";
import { isBoolean } from "../../../../base/common/types.js";
import { IWorkspaceTrustEnablementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { isWeb } from "../../../../base/common/platform.js";
const IExtensionManifestPropertiesService = createDecorator("extensionManifestPropertiesService");
const EXTENSIONS_SUPPORT_AGENTS_WINDOW = "extensions.supportAgentsWindow";
const SESSIONS_WINDOW_ALLOWED_CONTRIBUTION_POINTS = /* @__PURE__ */ new Set([
  "themes",
  "iconThemes",
  "productIconThemes",
  "colors",
  "keybindings",
  "jsonValidation",
  "jsonValidationRegistry",
  "localizations",
  "grammars",
  "languages"
]);
let ExtensionManifestPropertiesService = class extends Disposable {
  constructor(productService, configurationService, workspaceTrustEnablementService, logService) {
    super();
    this.productService = productService;
    this.configurationService = configurationService;
    this.workspaceTrustEnablementService = workspaceTrustEnablementService;
    this.logService = logService;
    this._extensionPointExtensionKindsMap = null;
    this._productExtensionKindsMap = null;
    this._configuredExtensionKindsMap = null;
    this._productVirtualWorkspaceSupportMap = null;
    this._configuredVirtualWorkspaceSupportMap = null;
    this._configuredSessionsWindowSupportMap = null;
    this._configuredExtensionWorkspaceTrustRequestMap = new ExtensionIdentifierMap();
    const configuredExtensionWorkspaceTrustRequests = configurationService.inspect(WORKSPACE_TRUST_EXTENSION_SUPPORT).userValue || {};
    for (const id of Object.keys(configuredExtensionWorkspaceTrustRequests)) {
      this._configuredExtensionWorkspaceTrustRequestMap.set(id, configuredExtensionWorkspaceTrustRequests[id]);
    }
    this._productExtensionWorkspaceTrustRequestMap = /* @__PURE__ */ new Map();
    if (productService.extensionUntrustedWorkspaceSupport) {
      for (const id of Object.keys(productService.extensionUntrustedWorkspaceSupport)) {
        this._productExtensionWorkspaceTrustRequestMap.set(id, productService.extensionUntrustedWorkspaceSupport[id]);
      }
    }
  }
  canExecuteOnSessionsWindow(manifest) {
    const configuredSessionsWindowSupport = this.getConfiguredSessionsWindowSupport(manifest);
    if (configuredSessionsWindowSupport !== void 0) {
      return configuredSessionsWindowSupport;
    }
    if (manifest.main || manifest.browser) {
      return false;
    }
    const contributionPoints = Object.keys(manifest.contributes || {});
    return contributionPoints.every((point) => SESSIONS_WINDOW_ALLOWED_CONTRIBUTION_POINTS.has(point));
  }
  prefersExecuteOnUI(manifest) {
    const extensionKind = this.getExtensionKind(manifest);
    return extensionKind.length > 0 && extensionKind[0] === "ui";
  }
  prefersExecuteOnWorkspace(manifest) {
    const extensionKind = this.getExtensionKind(manifest);
    return extensionKind.length > 0 && extensionKind[0] === "workspace";
  }
  prefersExecuteOnWeb(manifest) {
    const extensionKind = this.getExtensionKind(manifest);
    return extensionKind.length > 0 && extensionKind[0] === "web";
  }
  canExecuteOnUI(manifest) {
    const extensionKind = this.getExtensionKind(manifest);
    return extensionKind.some((kind) => kind === "ui");
  }
  canExecuteOnWorkspace(manifest) {
    const extensionKind = this.getExtensionKind(manifest);
    return extensionKind.some((kind) => kind === "workspace");
  }
  canExecuteOnWeb(manifest) {
    const extensionKind = this.getExtensionKind(manifest);
    return extensionKind.some((kind) => kind === "web");
  }
  getExtensionKind(manifest) {
    const deducedExtensionKind = this.deduceExtensionKind(manifest);
    const configuredExtensionKind = this.getConfiguredExtensionKind(manifest);
    if (configuredExtensionKind && configuredExtensionKind.length > 0) {
      const result = [];
      for (const extensionKind of configuredExtensionKind) {
        if (extensionKind !== "-web") {
          result.push(extensionKind);
        }
      }
      if (configuredExtensionKind.includes("-web") && !result.length) {
        result.push("ui");
        result.push("workspace");
      }
      if (isWeb && !configuredExtensionKind.includes("-web") && !configuredExtensionKind.includes("web") && deducedExtensionKind.includes("web")) {
        result.push("web");
      }
      return result;
    }
    return deducedExtensionKind;
  }
  getUserConfiguredExtensionKind(extensionIdentifier) {
    if (this._configuredExtensionKindsMap === null) {
      const configuredExtensionKindsMap = new ExtensionIdentifierMap();
      const configuredExtensionKinds = this.configurationService.getValue("remote.extensionKind") || {};
      for (const id of Object.keys(configuredExtensionKinds)) {
        configuredExtensionKindsMap.set(id, configuredExtensionKinds[id]);
      }
      this._configuredExtensionKindsMap = configuredExtensionKindsMap;
    }
    const userConfiguredExtensionKind = this._configuredExtensionKindsMap.get(extensionIdentifier.id);
    return userConfiguredExtensionKind ? this.toArray(userConfiguredExtensionKind) : void 0;
  }
  getExtensionUntrustedWorkspaceSupportType(manifest) {
    if (!this.workspaceTrustEnablementService.isWorkspaceTrustEnabled() || !manifest.main) {
      return true;
    }
    const configuredWorkspaceTrustRequest = this.getConfiguredExtensionWorkspaceTrustRequest(manifest);
    const productWorkspaceTrustRequest = this.getProductExtensionWorkspaceTrustRequest(manifest);
    if (configuredWorkspaceTrustRequest !== void 0) {
      return configuredWorkspaceTrustRequest;
    }
    if (productWorkspaceTrustRequest?.override !== void 0) {
      return productWorkspaceTrustRequest.override;
    }
    if (manifest.capabilities?.untrustedWorkspaces?.supported !== void 0) {
      return manifest.capabilities.untrustedWorkspaces.supported;
    }
    if (productWorkspaceTrustRequest?.default !== void 0) {
      return productWorkspaceTrustRequest.default;
    }
    return false;
  }
  getExtensionVirtualWorkspaceSupportType(manifest) {
    const userConfiguredVirtualWorkspaceSupport = this.getConfiguredVirtualWorkspaceSupport(manifest);
    if (userConfiguredVirtualWorkspaceSupport !== void 0) {
      return userConfiguredVirtualWorkspaceSupport;
    }
    const productConfiguredWorkspaceSchemes = this.getProductVirtualWorkspaceSupport(manifest);
    if (productConfiguredWorkspaceSchemes?.override !== void 0) {
      return productConfiguredWorkspaceSchemes.override;
    }
    const virtualWorkspaces = manifest.capabilities?.virtualWorkspaces;
    if (isBoolean(virtualWorkspaces)) {
      return virtualWorkspaces;
    } else if (virtualWorkspaces) {
      const supported = virtualWorkspaces.supported;
      if (isBoolean(supported) || supported === "limited") {
        return supported;
      }
    }
    if (productConfiguredWorkspaceSchemes?.default !== void 0) {
      return productConfiguredWorkspaceSchemes.default;
    }
    return true;
  }
  deduceExtensionKind(manifest) {
    if (manifest.main) {
      if (manifest.browser) {
        return isWeb ? ["workspace", "web"] : ["workspace"];
      }
      return ["workspace"];
    }
    if (manifest.browser) {
      return ["web"];
    }
    let result = [...ALL_EXTENSION_KINDS];
    if (isNonEmptyArray(manifest.extensionPack) || isNonEmptyArray(manifest.extensionDependencies)) {
      result = isWeb ? ["workspace", "web"] : ["workspace"];
    }
    if (manifest.contributes) {
      for (const contribution of Object.keys(manifest.contributes)) {
        const supportedExtensionKinds = this.getSupportedExtensionKindsForExtensionPoint(contribution);
        if (supportedExtensionKinds.length) {
          result = result.filter((extensionKind) => supportedExtensionKinds.includes(extensionKind));
        }
      }
    }
    if (!result.length) {
      this.logService.warn("Cannot deduce extensionKind for extension", getGalleryExtensionId(manifest.publisher, manifest.name));
    }
    return result;
  }
  getSupportedExtensionKindsForExtensionPoint(extensionPoint) {
    if (this._extensionPointExtensionKindsMap === null) {
      const extensionPointExtensionKindsMap = /* @__PURE__ */ new Map();
      ExtensionsRegistry.getExtensionPoints().forEach((e) => extensionPointExtensionKindsMap.set(
        e.name,
        e.defaultExtensionKind || []
        /* supports all */
      ));
      this._extensionPointExtensionKindsMap = extensionPointExtensionKindsMap;
    }
    let extensionPointExtensionKind = this._extensionPointExtensionKindsMap.get(extensionPoint);
    if (extensionPointExtensionKind) {
      return extensionPointExtensionKind;
    }
    extensionPointExtensionKind = this.productService.extensionPointExtensionKind ? this.productService.extensionPointExtensionKind[extensionPoint] : void 0;
    if (extensionPointExtensionKind) {
      return extensionPointExtensionKind;
    }
    return isWeb ? ["workspace", "web"] : ["workspace"];
  }
  getConfiguredExtensionKind(manifest) {
    const extensionIdentifier = { id: getGalleryExtensionId(manifest.publisher, manifest.name) };
    let result = this.getUserConfiguredExtensionKind(extensionIdentifier);
    if (typeof result !== "undefined") {
      return this.toArray(result);
    }
    result = this.getProductExtensionKind(manifest);
    if (typeof result !== "undefined") {
      return result;
    }
    result = manifest.extensionKind;
    if (typeof result !== "undefined") {
      result = this.toArray(result);
      return result.filter((r) => ["ui", "workspace"].includes(r));
    }
    return null;
  }
  getProductExtensionKind(manifest) {
    if (this._productExtensionKindsMap === null) {
      const productExtensionKindsMap = new ExtensionIdentifierMap();
      if (this.productService.extensionKind) {
        for (const id of Object.keys(this.productService.extensionKind)) {
          productExtensionKindsMap.set(id, this.productService.extensionKind[id]);
        }
      }
      this._productExtensionKindsMap = productExtensionKindsMap;
    }
    const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
    return this._productExtensionKindsMap.get(extensionId);
  }
  getProductVirtualWorkspaceSupport(manifest) {
    if (this._productVirtualWorkspaceSupportMap === null) {
      const productWorkspaceSchemesMap = new ExtensionIdentifierMap();
      if (this.productService.extensionVirtualWorkspacesSupport) {
        for (const id of Object.keys(this.productService.extensionVirtualWorkspacesSupport)) {
          productWorkspaceSchemesMap.set(id, this.productService.extensionVirtualWorkspacesSupport[id]);
        }
      }
      this._productVirtualWorkspaceSupportMap = productWorkspaceSchemesMap;
    }
    const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
    return this._productVirtualWorkspaceSupportMap.get(extensionId);
  }
  getConfiguredVirtualWorkspaceSupport(manifest) {
    if (this._configuredVirtualWorkspaceSupportMap === null) {
      const configuredWorkspaceSchemesMap = new ExtensionIdentifierMap();
      const configuredWorkspaceSchemes = this.configurationService.getValue("extensions.supportVirtualWorkspaces") || {};
      for (const id of Object.keys(configuredWorkspaceSchemes)) {
        if (configuredWorkspaceSchemes[id] !== void 0) {
          configuredWorkspaceSchemesMap.set(id, configuredWorkspaceSchemes[id]);
        }
      }
      this._configuredVirtualWorkspaceSupportMap = configuredWorkspaceSchemesMap;
    }
    const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
    return this._configuredVirtualWorkspaceSupportMap.get(extensionId);
  }
  getConfiguredSessionsWindowSupport(manifest) {
    if (this._configuredSessionsWindowSupportMap === null) {
      const configuredSessionsWindowSupportMap = new ExtensionIdentifierMap();
      const configuredSessionsWindowSupport = this.configurationService.getValue(EXTENSIONS_SUPPORT_AGENTS_WINDOW) || {};
      for (const id of Object.keys(configuredSessionsWindowSupport)) {
        if (configuredSessionsWindowSupport[id] !== void 0) {
          configuredSessionsWindowSupportMap.set(id, configuredSessionsWindowSupport[id]);
        }
      }
      this._configuredSessionsWindowSupportMap = configuredSessionsWindowSupportMap;
    }
    const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
    return this._configuredSessionsWindowSupportMap.get(extensionId);
  }
  getConfiguredExtensionWorkspaceTrustRequest(manifest) {
    const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
    const extensionWorkspaceTrustRequest = this._configuredExtensionWorkspaceTrustRequestMap.get(extensionId);
    if (extensionWorkspaceTrustRequest && (extensionWorkspaceTrustRequest.version === void 0 || extensionWorkspaceTrustRequest.version === manifest.version)) {
      return extensionWorkspaceTrustRequest.supported;
    }
    return void 0;
  }
  getProductExtensionWorkspaceTrustRequest(manifest) {
    const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
    return this._productExtensionWorkspaceTrustRequestMap.get(extensionId);
  }
  toArray(extensionKind) {
    if (Array.isArray(extensionKind)) {
      return extensionKind;
    }
    return extensionKind === "ui" ? ["ui", "workspace"] : [extensionKind];
  }
};
ExtensionManifestPropertiesService = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IWorkspaceTrustEnablementService),
  __decorateParam(3, ILogService)
], ExtensionManifestPropertiesService);
registerSingleton(IExtensionManifestPropertiesService, ExtensionManifestPropertiesService, InstantiationType.Delayed);
export {
  EXTENSIONS_SUPPORT_AGENTS_WINDOW,
  ExtensionManifestPropertiesService,
  IExtensionManifestPropertiesService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3QsIEV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnRUeXBlLCBFeHRlbnNpb25WaXJ0dWFsV29ya3NwYWNlU3VwcG9ydFR5cGUsIElFeHRlbnNpb25JZGVudGlmaWVyLCBBTExfRVhURU5TSU9OX0tJTkRTLCBFeHRlbnNpb25JZGVudGlmaWVyTWFwLCBJRXh0ZW5zaW9uQ29udHJpYnV0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uS2luZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25NYW5hZ2VtZW50VXRpbC5qcyc7XG5pbXBvcnQgeyBpc05vbkVtcHR5QXJyYXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgV09SS1NQQUNFX1RSVVNUX0VYVEVOU0lPTl9TVVBQT1JUIH0gZnJvbSAnLi4vLi4vd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgaXNCb29sZWFuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5cbmV4cG9ydCBjb25zdCBJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJRXh0ZW5zaW9uTWFuaWZlc3RQcm9wZXJ0aWVzU2VydmljZT4oJ2V4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UnKTtcblxuZXhwb3J0IGNvbnN0IEVYVEVOU0lPTlNfU1VQUE9SVF9BR0VOVFNfV0lORE9XID0gJ2V4dGVuc2lvbnMuc3VwcG9ydEFnZW50c1dpbmRvdyc7XG5cbmNvbnN0IFNFU1NJT05TX1dJTkRPV19BTExPV0VEX0NPTlRSSUJVVElPTl9QT0lOVFM6IFJlYWRvbmx5U2V0PGtleW9mIElFeHRlbnNpb25Db250cmlidXRpb25zPiA9IG5ldyBTZXQoW1xuXHQndGhlbWVzJyxcblx0J2ljb25UaGVtZXMnLFxuXHQncHJvZHVjdEljb25UaGVtZXMnLFxuXHQnY29sb3JzJyxcblx0J2tleWJpbmRpbmdzJyxcblx0J2pzb25WYWxpZGF0aW9uJyxcblx0J2pzb25WYWxpZGF0aW9uUmVnaXN0cnknLFxuXHQnbG9jYWxpemF0aW9ucycsXG5cdCdncmFtbWFycycsXG5cdCdsYW5ndWFnZXMnLFxuXSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJlZmVyc0V4ZWN1dGVPblVJKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuO1xuXHRwcmVmZXJzRXhlY3V0ZU9uV29ya3NwYWNlKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuO1xuXHRwcmVmZXJzRXhlY3V0ZU9uV2ViKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuO1xuXG5cdGNhbkV4ZWN1dGVPblVJKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuO1xuXHRjYW5FeGVjdXRlT25Xb3Jrc3BhY2UobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW47XG5cdGNhbkV4ZWN1dGVPbldlYihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbjtcblx0Y2FuRXhlY3V0ZU9uU2Vzc2lvbnNXaW5kb3cobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW47XG5cblx0Z2V0RXh0ZW5zaW9uS2luZChtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogRXh0ZW5zaW9uS2luZFtdO1xuXHRnZXRVc2VyQ29uZmlndXJlZEV4dGVuc2lvbktpbmQoZXh0ZW5zaW9uSWRlbnRpZmllcjogSUV4dGVuc2lvbklkZW50aWZpZXIpOiBFeHRlbnNpb25LaW5kW10gfCB1bmRlZmluZWQ7XG5cdGdldEV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnRUeXBlKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBFeHRlbnNpb25VbnRydXN0ZWRXb3Jrc3BhY2VTdXBwb3J0VHlwZTtcblx0Z2V0RXh0ZW5zaW9uVmlydHVhbFdvcmtzcGFjZVN1cHBvcnRUeXBlKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBFeHRlbnNpb25WaXJ0dWFsV29ya3NwYWNlU3VwcG9ydFR5cGU7XG59XG5cbmV4cG9ydCBjbGFzcyBFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25NYW5pZmVzdFByb3BlcnRpZXNTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfZXh0ZW5zaW9uUG9pbnRFeHRlbnNpb25LaW5kc01hcDogTWFwPHN0cmluZywgRXh0ZW5zaW9uS2luZFtdPiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9wcm9kdWN0RXh0ZW5zaW9uS2luZHNNYXA6IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8RXh0ZW5zaW9uS2luZFtdPiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9jb25maWd1cmVkRXh0ZW5zaW9uS2luZHNNYXA6IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8RXh0ZW5zaW9uS2luZCB8IEV4dGVuc2lvbktpbmRbXT4gfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIF9wcm9kdWN0VmlydHVhbFdvcmtzcGFjZVN1cHBvcnRNYXA6IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8eyBkZWZhdWx0PzogYm9vbGVhbjsgb3ZlcnJpZGU/OiBib29sZWFuIH0+IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgX2NvbmZpZ3VyZWRWaXJ0dWFsV29ya3NwYWNlU3VwcG9ydE1hcDogRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxib29sZWFuPiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9jb25maWd1cmVkU2Vzc2lvbnNXaW5kb3dTdXBwb3J0TWFwOiBFeHRlbnNpb25JZGVudGlmaWVyTWFwPGJvb2xlYW4+IHwgbnVsbCA9IG51bGw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJlZEV4dGVuc2lvbldvcmtzcGFjZVRydXN0UmVxdWVzdE1hcDogRXh0ZW5zaW9uSWRlbnRpZmllck1hcDx7IHN1cHBvcnRlZDogRXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydFR5cGU7IHZlcnNpb24/OiBzdHJpbmcgfT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RFeHRlbnNpb25Xb3Jrc3BhY2VUcnVzdFJlcXVlc3RNYXA6IE1hcDxzdHJpbmcsIEV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RFbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdEVuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gV29ya3NwYWNlIHRydXN0IHJlcXVlc3QgdHlwZSAoc2V0dGluZ3MuanNvbilcblx0XHR0aGlzLl9jb25maWd1cmVkRXh0ZW5zaW9uV29ya3NwYWNlVHJ1c3RSZXF1ZXN0TWFwID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8eyBzdXBwb3J0ZWQ6IEV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnRUeXBlOyB2ZXJzaW9uPzogc3RyaW5nIH0+KCk7XG5cdFx0Y29uc3QgY29uZmlndXJlZEV4dGVuc2lvbldvcmtzcGFjZVRydXN0UmVxdWVzdHMgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PHsgW2tleTogc3RyaW5nXTogeyBzdXBwb3J0ZWQ6IEV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnRUeXBlOyB2ZXJzaW9uPzogc3RyaW5nIH0gfT4oV09SS1NQQUNFX1RSVVNUX0VYVEVOU0lPTl9TVVBQT1JUKS51c2VyVmFsdWUgfHwge307XG5cdFx0Zm9yIChjb25zdCBpZCBvZiBPYmplY3Qua2V5cyhjb25maWd1cmVkRXh0ZW5zaW9uV29ya3NwYWNlVHJ1c3RSZXF1ZXN0cykpIHtcblx0XHRcdHRoaXMuX2NvbmZpZ3VyZWRFeHRlbnNpb25Xb3Jrc3BhY2VUcnVzdFJlcXVlc3RNYXAuc2V0KGlkLCBjb25maWd1cmVkRXh0ZW5zaW9uV29ya3NwYWNlVHJ1c3RSZXF1ZXN0c1tpZF0pO1xuXHRcdH1cblxuXHRcdC8vIFdvcmtzcGFjZSB0cnVzdCByZXF1ZXN0IHR5cGUgKHByb2R1Y3QuanNvbilcblx0XHR0aGlzLl9wcm9kdWN0RXh0ZW5zaW9uV29ya3NwYWNlVHJ1c3RSZXF1ZXN0TWFwID0gbmV3IE1hcDxzdHJpbmcsIEV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnQ+KCk7XG5cdFx0aWYgKHByb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnQpIHtcblx0XHRcdGZvciAoY29uc3QgaWQgb2YgT2JqZWN0LmtleXMocHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydCkpIHtcblx0XHRcdFx0dGhpcy5fcHJvZHVjdEV4dGVuc2lvbldvcmtzcGFjZVRydXN0UmVxdWVzdE1hcC5zZXQoaWQsIHByb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnRbaWRdKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjYW5FeGVjdXRlT25TZXNzaW9uc1dpbmRvdyhtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY29uZmlndXJlZFNlc3Npb25zV2luZG93U3VwcG9ydCA9IHRoaXMuZ2V0Q29uZmlndXJlZFNlc3Npb25zV2luZG93U3VwcG9ydChtYW5pZmVzdCk7XG5cdFx0aWYgKGNvbmZpZ3VyZWRTZXNzaW9uc1dpbmRvd1N1cHBvcnQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGNvbmZpZ3VyZWRTZXNzaW9uc1dpbmRvd1N1cHBvcnQ7XG5cdFx0fVxuXG5cdFx0Ly8gSW4gdGhlIHNlc3Npb25zIHdpbmRvdyBvbmx5IGV4dGVuc2lvbnMgdGhhdCBoYXZlIG5vIGNvZGUgYXJlIGN1cnJlbnRseSBhbGxvd2VkIHRvIHJ1blxuXHRcdGlmIChtYW5pZmVzdC5tYWluIHx8IG1hbmlmZXN0LmJyb3dzZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBPbmx5IGFsbG93IGV4dGVuc2lvbnMgdGhhdCBjb250cmlidXRlIHRvIHRoZW1lcyBhbmQgb3RoZXIgZGVjbGFyYXRpdmUsIG5vbi1leGVjdXRpbmcgY29udHJpYnV0aW9uIHBvaW50c1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvblBvaW50cyA9IE9iamVjdC5rZXlzKG1hbmlmZXN0LmNvbnRyaWJ1dGVzIHx8IHt9KSBhcyBBcnJheTxrZXlvZiBJRXh0ZW5zaW9uQ29udHJpYnV0aW9ucz47XG5cdFx0cmV0dXJuIGNvbnRyaWJ1dGlvblBvaW50cy5ldmVyeShwb2ludCA9PiBTRVNTSU9OU19XSU5ET1dfQUxMT1dFRF9DT05UUklCVVRJT05fUE9JTlRTLmhhcyhwb2ludCkpO1xuXHR9XG5cblx0cHJlZmVyc0V4ZWN1dGVPblVJKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRjb25zdCBleHRlbnNpb25LaW5kID0gdGhpcy5nZXRFeHRlbnNpb25LaW5kKG1hbmlmZXN0KTtcblx0XHRyZXR1cm4gKGV4dGVuc2lvbktpbmQubGVuZ3RoID4gMCAmJiBleHRlbnNpb25LaW5kWzBdID09PSAndWknKTtcblx0fVxuXG5cdHByZWZlcnNFeGVjdXRlT25Xb3Jrc3BhY2UobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbktpbmQgPSB0aGlzLmdldEV4dGVuc2lvbktpbmQobWFuaWZlc3QpO1xuXHRcdHJldHVybiAoZXh0ZW5zaW9uS2luZC5sZW5ndGggPiAwICYmIGV4dGVuc2lvbktpbmRbMF0gPT09ICd3b3Jrc3BhY2UnKTtcblx0fVxuXG5cdHByZWZlcnNFeGVjdXRlT25XZWIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbktpbmQgPSB0aGlzLmdldEV4dGVuc2lvbktpbmQobWFuaWZlc3QpO1xuXHRcdHJldHVybiAoZXh0ZW5zaW9uS2luZC5sZW5ndGggPiAwICYmIGV4dGVuc2lvbktpbmRbMF0gPT09ICd3ZWInKTtcblx0fVxuXG5cdGNhbkV4ZWN1dGVPblVJKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRjb25zdCBleHRlbnNpb25LaW5kID0gdGhpcy5nZXRFeHRlbnNpb25LaW5kKG1hbmlmZXN0KTtcblx0XHRyZXR1cm4gZXh0ZW5zaW9uS2luZC5zb21lKGtpbmQgPT4ga2luZCA9PT0gJ3VpJyk7XG5cdH1cblxuXHRjYW5FeGVjdXRlT25Xb3Jrc3BhY2UobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbktpbmQgPSB0aGlzLmdldEV4dGVuc2lvbktpbmQobWFuaWZlc3QpO1xuXHRcdHJldHVybiBleHRlbnNpb25LaW5kLnNvbWUoa2luZCA9PiBraW5kID09PSAnd29ya3NwYWNlJyk7XG5cdH1cblxuXHRjYW5FeGVjdXRlT25XZWIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGV4dGVuc2lvbktpbmQgPSB0aGlzLmdldEV4dGVuc2lvbktpbmQobWFuaWZlc3QpO1xuXHRcdHJldHVybiBleHRlbnNpb25LaW5kLnNvbWUoa2luZCA9PiBraW5kID09PSAnd2ViJyk7XG5cdH1cblxuXHRnZXRFeHRlbnNpb25LaW5kKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBFeHRlbnNpb25LaW5kW10ge1xuXHRcdGNvbnN0IGRlZHVjZWRFeHRlbnNpb25LaW5kID0gdGhpcy5kZWR1Y2VFeHRlbnNpb25LaW5kKG1hbmlmZXN0KTtcblx0XHRjb25zdCBjb25maWd1cmVkRXh0ZW5zaW9uS2luZCA9IHRoaXMuZ2V0Q29uZmlndXJlZEV4dGVuc2lvbktpbmQobWFuaWZlc3QpO1xuXG5cdFx0aWYgKGNvbmZpZ3VyZWRFeHRlbnNpb25LaW5kICYmIGNvbmZpZ3VyZWRFeHRlbnNpb25LaW5kLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHJlc3VsdDogRXh0ZW5zaW9uS2luZFtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbktpbmQgb2YgY29uZmlndXJlZEV4dGVuc2lvbktpbmQpIHtcblx0XHRcdFx0aWYgKGV4dGVuc2lvbktpbmQgIT09ICctd2ViJykge1xuXHRcdFx0XHRcdHJlc3VsdC5wdXNoKGV4dGVuc2lvbktpbmQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIG9wdGVkIG91dCBmcm9tIHdlYiB3aXRob3V0IHNwZWNpZnlpbmcgb3RoZXIgZXh0ZW5zaW9uIGtpbmRzIHRoZW4gZGVmYXVsdCB0byB1aSwgd29ya3NwYWNlXG5cdFx0XHRpZiAoY29uZmlndXJlZEV4dGVuc2lvbktpbmQuaW5jbHVkZXMoJy13ZWInKSAmJiAhcmVzdWx0Lmxlbmd0aCkge1xuXHRcdFx0XHRyZXN1bHQucHVzaCgndWknKTtcblx0XHRcdFx0cmVzdWx0LnB1c2goJ3dvcmtzcGFjZScpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBZGQgd2ViIGtpbmQgaWYgbm90IG9wdGVkIG91dCBmcm9tIHdlYiBhbmQgY2FuIHJ1biBpbiB3ZWJcblx0XHRcdGlmIChpc1dlYiAmJiAhY29uZmlndXJlZEV4dGVuc2lvbktpbmQuaW5jbHVkZXMoJy13ZWInKSAmJiAhY29uZmlndXJlZEV4dGVuc2lvbktpbmQuaW5jbHVkZXMoJ3dlYicpICYmIGRlZHVjZWRFeHRlbnNpb25LaW5kLmluY2x1ZGVzKCd3ZWInKSkge1xuXHRcdFx0XHRyZXN1bHQucHVzaCgnd2ViJyk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGRlZHVjZWRFeHRlbnNpb25LaW5kO1xuXHR9XG5cblx0Z2V0VXNlckNvbmZpZ3VyZWRFeHRlbnNpb25LaW5kKGV4dGVuc2lvbklkZW50aWZpZXI6IElFeHRlbnNpb25JZGVudGlmaWVyKTogRXh0ZW5zaW9uS2luZFtdIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fY29uZmlndXJlZEV4dGVuc2lvbktpbmRzTWFwID09PSBudWxsKSB7XG5cdFx0XHRjb25zdCBjb25maWd1cmVkRXh0ZW5zaW9uS2luZHNNYXAgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxFeHRlbnNpb25LaW5kIHwgRXh0ZW5zaW9uS2luZFtdPigpO1xuXHRcdFx0Y29uc3QgY29uZmlndXJlZEV4dGVuc2lvbktpbmRzID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx7IFtrZXk6IHN0cmluZ106IEV4dGVuc2lvbktpbmQgfCBFeHRlbnNpb25LaW5kW10gfT4oJ3JlbW90ZS5leHRlbnNpb25LaW5kJykgfHwge307XG5cdFx0XHRmb3IgKGNvbnN0IGlkIG9mIE9iamVjdC5rZXlzKGNvbmZpZ3VyZWRFeHRlbnNpb25LaW5kcykpIHtcblx0XHRcdFx0Y29uZmlndXJlZEV4dGVuc2lvbktpbmRzTWFwLnNldChpZCwgY29uZmlndXJlZEV4dGVuc2lvbktpbmRzW2lkXSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jb25maWd1cmVkRXh0ZW5zaW9uS2luZHNNYXAgPSBjb25maWd1cmVkRXh0ZW5zaW9uS2luZHNNYXA7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXNlckNvbmZpZ3VyZWRFeHRlbnNpb25LaW5kID0gdGhpcy5fY29uZmlndXJlZEV4dGVuc2lvbktpbmRzTWFwLmdldChleHRlbnNpb25JZGVudGlmaWVyLmlkKTtcblx0XHRyZXR1cm4gdXNlckNvbmZpZ3VyZWRFeHRlbnNpb25LaW5kID8gdGhpcy50b0FycmF5KHVzZXJDb25maWd1cmVkRXh0ZW5zaW9uS2luZCkgOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRnZXRFeHRlbnNpb25VbnRydXN0ZWRXb3Jrc3BhY2VTdXBwb3J0VHlwZShtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogRXh0ZW5zaW9uVW50cnVzdGVkV29ya3NwYWNlU3VwcG9ydFR5cGUge1xuXHRcdC8vIFdvcmtzcGFjZSB0cnVzdCBmZWF0dXJlIGlzIGRpc2FibGVkLCBvciBleHRlbnNpb24gaGFzIG5vIGVudHJ5IHBvaW50XG5cdFx0aWYgKCF0aGlzLndvcmtzcGFjZVRydXN0RW5hYmxlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdEVuYWJsZWQoKSB8fCAhbWFuaWZlc3QubWFpbikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gR2V0IGV4dGVuc2lvbiB3b3Jrc3BhY2UgdHJ1c3QgcmVxdWlyZW1lbnRzIGZyb20gc2V0dGluZ3MuanNvblxuXHRcdGNvbnN0IGNvbmZpZ3VyZWRXb3Jrc3BhY2VUcnVzdFJlcXVlc3QgPSB0aGlzLmdldENvbmZpZ3VyZWRFeHRlbnNpb25Xb3Jrc3BhY2VUcnVzdFJlcXVlc3QobWFuaWZlc3QpO1xuXG5cdFx0Ly8gR2V0IGV4dGVuc2lvbiB3b3Jrc3BhY2UgdHJ1c3QgcmVxdWlyZW1lbnRzIGZyb20gcHJvZHVjdC5qc29uXG5cdFx0Y29uc3QgcHJvZHVjdFdvcmtzcGFjZVRydXN0UmVxdWVzdCA9IHRoaXMuZ2V0UHJvZHVjdEV4dGVuc2lvbldvcmtzcGFjZVRydXN0UmVxdWVzdChtYW5pZmVzdCk7XG5cblx0XHQvLyBVc2Ugc2V0dGluZ3MuanNvbiBvdmVycmlkZSB2YWx1ZSBpZiBpdCBleGlzdHNcblx0XHRpZiAoY29uZmlndXJlZFdvcmtzcGFjZVRydXN0UmVxdWVzdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gY29uZmlndXJlZFdvcmtzcGFjZVRydXN0UmVxdWVzdDtcblx0XHR9XG5cblx0XHQvLyBVc2UgcHJvZHVjdC5qc29uIG92ZXJyaWRlIHZhbHVlIGlmIGl0IGV4aXN0c1xuXHRcdGlmIChwcm9kdWN0V29ya3NwYWNlVHJ1c3RSZXF1ZXN0Py5vdmVycmlkZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gcHJvZHVjdFdvcmtzcGFjZVRydXN0UmVxdWVzdC5vdmVycmlkZTtcblx0XHR9XG5cblx0XHQvLyBVc2UgZXh0ZW5zaW9uIG1hbmlmZXN0IHZhbHVlIGlmIGl0IGV4aXN0c1xuXHRcdGlmIChtYW5pZmVzdC5jYXBhYmlsaXRpZXM/LnVudHJ1c3RlZFdvcmtzcGFjZXM/LnN1cHBvcnRlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gbWFuaWZlc3QuY2FwYWJpbGl0aWVzLnVudHJ1c3RlZFdvcmtzcGFjZXMuc3VwcG9ydGVkO1xuXHRcdH1cblxuXHRcdC8vIFVzZSBwcm9kdWN0Lmpzb24gZGVmYXVsdCB2YWx1ZSBpZiBpdCBleGlzdHNcblx0XHRpZiAocHJvZHVjdFdvcmtzcGFjZVRydXN0UmVxdWVzdD8uZGVmYXVsdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gcHJvZHVjdFdvcmtzcGFjZVRydXN0UmVxdWVzdC5kZWZhdWx0O1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGdldEV4dGVuc2lvblZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0VHlwZShtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogRXh0ZW5zaW9uVmlydHVhbFdvcmtzcGFjZVN1cHBvcnRUeXBlIHtcblx0XHQvLyBjaGVjayB1c2VyIGNvbmZpZ3VyZWRcblx0XHRjb25zdCB1c2VyQ29uZmlndXJlZFZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0ID0gdGhpcy5nZXRDb25maWd1cmVkVmlydHVhbFdvcmtzcGFjZVN1cHBvcnQobWFuaWZlc3QpO1xuXHRcdGlmICh1c2VyQ29uZmlndXJlZFZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1c2VyQ29uZmlndXJlZFZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0O1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb2R1Y3RDb25maWd1cmVkV29ya3NwYWNlU2NoZW1lcyA9IHRoaXMuZ2V0UHJvZHVjdFZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0KG1hbmlmZXN0KTtcblxuXHRcdC8vIGNoZWNrIG92ZXJyaWRlIGZyb20gcHJvZHVjdFxuXHRcdGlmIChwcm9kdWN0Q29uZmlndXJlZFdvcmtzcGFjZVNjaGVtZXM/Lm92ZXJyaWRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBwcm9kdWN0Q29uZmlndXJlZFdvcmtzcGFjZVNjaGVtZXMub3ZlcnJpZGU7XG5cdFx0fVxuXG5cdFx0Ly8gY2hlY2sgdGhlIG1hbmlmZXN0XG5cdFx0Y29uc3QgdmlydHVhbFdvcmtzcGFjZXMgPSBtYW5pZmVzdC5jYXBhYmlsaXRpZXM/LnZpcnR1YWxXb3Jrc3BhY2VzO1xuXHRcdGlmIChpc0Jvb2xlYW4odmlydHVhbFdvcmtzcGFjZXMpKSB7XG5cdFx0XHRyZXR1cm4gdmlydHVhbFdvcmtzcGFjZXM7XG5cdFx0fSBlbHNlIGlmICh2aXJ0dWFsV29ya3NwYWNlcykge1xuXHRcdFx0Y29uc3Qgc3VwcG9ydGVkID0gdmlydHVhbFdvcmtzcGFjZXMuc3VwcG9ydGVkO1xuXHRcdFx0aWYgKGlzQm9vbGVhbihzdXBwb3J0ZWQpIHx8IHN1cHBvcnRlZCA9PT0gJ2xpbWl0ZWQnKSB7XG5cdFx0XHRcdHJldHVybiBzdXBwb3J0ZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gY2hlY2sgZGVmYXVsdCBmcm9tIHByb2R1Y3Rcblx0XHRpZiAocHJvZHVjdENvbmZpZ3VyZWRXb3Jrc3BhY2VTY2hlbWVzPy5kZWZhdWx0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBwcm9kdWN0Q29uZmlndXJlZFdvcmtzcGFjZVNjaGVtZXMuZGVmYXVsdDtcblx0XHR9XG5cblx0XHQvLyBEZWZhdWx0IC0gc3VwcG9ydHMgdmlydHVhbCB3b3Jrc3BhY2Vcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgZGVkdWNlRXh0ZW5zaW9uS2luZChtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogRXh0ZW5zaW9uS2luZFtdIHtcblx0XHQvLyBOb3QgYW4gVUkgZXh0ZW5zaW9uIGlmIGl0IGhhcyBtYWluXG5cdFx0aWYgKG1hbmlmZXN0Lm1haW4pIHtcblx0XHRcdGlmIChtYW5pZmVzdC5icm93c2VyKSB7XG5cdFx0XHRcdHJldHVybiBpc1dlYiA/IFsnd29ya3NwYWNlJywgJ3dlYiddIDogWyd3b3Jrc3BhY2UnXTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBbJ3dvcmtzcGFjZSddO1xuXHRcdH1cblxuXHRcdGlmIChtYW5pZmVzdC5icm93c2VyKSB7XG5cdFx0XHRyZXR1cm4gWyd3ZWInXTtcblx0XHR9XG5cblx0XHRsZXQgcmVzdWx0ID0gWy4uLkFMTF9FWFRFTlNJT05fS0lORFNdO1xuXG5cdFx0aWYgKGlzTm9uRW1wdHlBcnJheShtYW5pZmVzdC5leHRlbnNpb25QYWNrKSB8fCBpc05vbkVtcHR5QXJyYXkobWFuaWZlc3QuZXh0ZW5zaW9uRGVwZW5kZW5jaWVzKSkge1xuXHRcdFx0Ly8gRXh0ZW5zaW9uIHBhY2sgZGVmYXVsdHMgdG8gW3dvcmtzcGFjZSwgd2ViXSBpbiB3ZWIgYW5kIG9ubHkgW3dvcmtzcGFjZV0gaW4gZGVza3RvcFxuXHRcdFx0cmVzdWx0ID0gaXNXZWIgPyBbJ3dvcmtzcGFjZScsICd3ZWInXSA6IFsnd29ya3NwYWNlJ107XG5cdFx0fVxuXG5cdFx0aWYgKG1hbmlmZXN0LmNvbnRyaWJ1dGVzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiBPYmplY3Qua2V5cyhtYW5pZmVzdC5jb250cmlidXRlcykpIHtcblx0XHRcdFx0Y29uc3Qgc3VwcG9ydGVkRXh0ZW5zaW9uS2luZHMgPSB0aGlzLmdldFN1cHBvcnRlZEV4dGVuc2lvbktpbmRzRm9yRXh0ZW5zaW9uUG9pbnQoY29udHJpYnV0aW9uKTtcblx0XHRcdFx0aWYgKHN1cHBvcnRlZEV4dGVuc2lvbktpbmRzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHJlc3VsdCA9IHJlc3VsdC5maWx0ZXIoZXh0ZW5zaW9uS2luZCA9PiBzdXBwb3J0ZWRFeHRlbnNpb25LaW5kcy5pbmNsdWRlcyhleHRlbnNpb25LaW5kKSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXJlc3VsdC5sZW5ndGgpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdDYW5ub3QgZGVkdWNlIGV4dGVuc2lvbktpbmQgZm9yIGV4dGVuc2lvbicsIGdldEdhbGxlcnlFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTdXBwb3J0ZWRFeHRlbnNpb25LaW5kc0ZvckV4dGVuc2lvblBvaW50KGV4dGVuc2lvblBvaW50OiBzdHJpbmcpOiBFeHRlbnNpb25LaW5kW10ge1xuXHRcdGlmICh0aGlzLl9leHRlbnNpb25Qb2ludEV4dGVuc2lvbktpbmRzTWFwID09PSBudWxsKSB7XG5cdFx0XHRjb25zdCBleHRlbnNpb25Qb2ludEV4dGVuc2lvbktpbmRzTWFwID0gbmV3IE1hcDxzdHJpbmcsIEV4dGVuc2lvbktpbmRbXT4oKTtcblx0XHRcdEV4dGVuc2lvbnNSZWdpc3RyeS5nZXRFeHRlbnNpb25Qb2ludHMoKS5mb3JFYWNoKGUgPT4gZXh0ZW5zaW9uUG9pbnRFeHRlbnNpb25LaW5kc01hcC5zZXQoZS5uYW1lLCBlLmRlZmF1bHRFeHRlbnNpb25LaW5kIHx8IFtdIC8qIHN1cHBvcnRzIGFsbCAqLykpO1xuXHRcdFx0dGhpcy5fZXh0ZW5zaW9uUG9pbnRFeHRlbnNpb25LaW5kc01hcCA9IGV4dGVuc2lvblBvaW50RXh0ZW5zaW9uS2luZHNNYXA7XG5cdFx0fVxuXG5cdFx0bGV0IGV4dGVuc2lvblBvaW50RXh0ZW5zaW9uS2luZCA9IHRoaXMuX2V4dGVuc2lvblBvaW50RXh0ZW5zaW9uS2luZHNNYXAuZ2V0KGV4dGVuc2lvblBvaW50KTtcblx0XHRpZiAoZXh0ZW5zaW9uUG9pbnRFeHRlbnNpb25LaW5kKSB7XG5cdFx0XHRyZXR1cm4gZXh0ZW5zaW9uUG9pbnRFeHRlbnNpb25LaW5kO1xuXHRcdH1cblxuXHRcdGV4dGVuc2lvblBvaW50RXh0ZW5zaW9uS2luZCA9IHRoaXMucHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uUG9pbnRFeHRlbnNpb25LaW5kID8gdGhpcy5wcm9kdWN0U2VydmljZS5leHRlbnNpb25Qb2ludEV4dGVuc2lvbktpbmRbZXh0ZW5zaW9uUG9pbnRdIDogdW5kZWZpbmVkO1xuXHRcdGlmIChleHRlbnNpb25Qb2ludEV4dGVuc2lvbktpbmQpIHtcblx0XHRcdHJldHVybiBleHRlbnNpb25Qb2ludEV4dGVuc2lvbktpbmQ7XG5cdFx0fVxuXG5cdFx0LyogVW5rbm93biBleHRlbnNpb24gcG9pbnQgKi9cblx0XHRyZXR1cm4gaXNXZWIgPyBbJ3dvcmtzcGFjZScsICd3ZWInXSA6IFsnd29ya3NwYWNlJ107XG5cdH1cblxuXHRwcml2YXRlIGdldENvbmZpZ3VyZWRFeHRlbnNpb25LaW5kKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiAoRXh0ZW5zaW9uS2luZCB8ICctd2ViJylbXSB8IG51bGwge1xuXHRcdGNvbnN0IGV4dGVuc2lvbklkZW50aWZpZXIgPSB7IGlkOiBnZXRHYWxsZXJ5RXh0ZW5zaW9uSWQobWFuaWZlc3QucHVibGlzaGVyLCBtYW5pZmVzdC5uYW1lKSB9O1xuXG5cdFx0Ly8gY2hlY2sgaW4gY29uZmlnXG5cdFx0bGV0IHJlc3VsdDogRXh0ZW5zaW9uS2luZCB8IEV4dGVuc2lvbktpbmRbXSB8IHVuZGVmaW5lZCA9IHRoaXMuZ2V0VXNlckNvbmZpZ3VyZWRFeHRlbnNpb25LaW5kKGV4dGVuc2lvbklkZW50aWZpZXIpO1xuXHRcdGlmICh0eXBlb2YgcmVzdWx0ICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHRoaXMudG9BcnJheShyZXN1bHQpO1xuXHRcdH1cblxuXHRcdC8vIGNoZWNrIHByb2R1Y3QuanNvblxuXHRcdHJlc3VsdCA9IHRoaXMuZ2V0UHJvZHVjdEV4dGVuc2lvbktpbmQobWFuaWZlc3QpO1xuXHRcdGlmICh0eXBlb2YgcmVzdWx0ICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHQvLyBjaGVjayB0aGUgbWFuaWZlc3QgaXRzZWxmXG5cdFx0cmVzdWx0ID0gbWFuaWZlc3QuZXh0ZW5zaW9uS2luZDtcblx0XHRpZiAodHlwZW9mIHJlc3VsdCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJlc3VsdCA9IHRoaXMudG9BcnJheShyZXN1bHQpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdC5maWx0ZXIociA9PiBbJ3VpJywgJ3dvcmtzcGFjZSddLmluY2x1ZGVzKHIpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UHJvZHVjdEV4dGVuc2lvbktpbmQobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IEV4dGVuc2lvbktpbmRbXSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX3Byb2R1Y3RFeHRlbnNpb25LaW5kc01hcCA9PT0gbnVsbCkge1xuXHRcdFx0Y29uc3QgcHJvZHVjdEV4dGVuc2lvbktpbmRzTWFwID0gbmV3IEV4dGVuc2lvbklkZW50aWZpZXJNYXA8RXh0ZW5zaW9uS2luZFtdPigpO1xuXHRcdFx0aWYgKHRoaXMucHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uS2luZCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGlkIG9mIE9iamVjdC5rZXlzKHRoaXMucHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uS2luZCkpIHtcblx0XHRcdFx0XHRwcm9kdWN0RXh0ZW5zaW9uS2luZHNNYXAuc2V0KGlkLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvbktpbmRbaWRdKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcHJvZHVjdEV4dGVuc2lvbktpbmRzTWFwID0gcHJvZHVjdEV4dGVuc2lvbktpbmRzTWFwO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvbklkID0gZ2V0R2FsbGVyeUV4dGVuc2lvbklkKG1hbmlmZXN0LnB1Ymxpc2hlciwgbWFuaWZlc3QubmFtZSk7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb2R1Y3RFeHRlbnNpb25LaW5kc01hcC5nZXQoZXh0ZW5zaW9uSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQcm9kdWN0VmlydHVhbFdvcmtzcGFjZVN1cHBvcnQobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IHsgZGVmYXVsdD86IGJvb2xlYW47IG92ZXJyaWRlPzogYm9vbGVhbiB9IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fcHJvZHVjdFZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0TWFwID09PSBudWxsKSB7XG5cdFx0XHRjb25zdCBwcm9kdWN0V29ya3NwYWNlU2NoZW1lc01hcCA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyTWFwPHsgZGVmYXVsdD86IGJvb2xlYW47IG92ZXJyaWRlPzogYm9vbGVhbiB9PigpO1xuXHRcdFx0aWYgKHRoaXMucHJvZHVjdFNlcnZpY2UuZXh0ZW5zaW9uVmlydHVhbFdvcmtzcGFjZXNTdXBwb3J0KSB7XG5cdFx0XHRcdGZvciAoY29uc3QgaWQgb2YgT2JqZWN0LmtleXModGhpcy5wcm9kdWN0U2VydmljZS5leHRlbnNpb25WaXJ0dWFsV29ya3NwYWNlc1N1cHBvcnQpKSB7XG5cdFx0XHRcdFx0cHJvZHVjdFdvcmtzcGFjZVNjaGVtZXNNYXAuc2V0KGlkLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLmV4dGVuc2lvblZpcnR1YWxXb3Jrc3BhY2VzU3VwcG9ydFtpZF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wcm9kdWN0VmlydHVhbFdvcmtzcGFjZVN1cHBvcnRNYXAgPSBwcm9kdWN0V29ya3NwYWNlU2NoZW1lc01hcDtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25JZCA9IGdldEdhbGxlcnlFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpO1xuXHRcdHJldHVybiB0aGlzLl9wcm9kdWN0VmlydHVhbFdvcmtzcGFjZVN1cHBvcnRNYXAuZ2V0KGV4dGVuc2lvbklkKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29uZmlndXJlZFZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0KG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fY29uZmlndXJlZFZpcnR1YWxXb3Jrc3BhY2VTdXBwb3J0TWFwID09PSBudWxsKSB7XG5cdFx0XHRjb25zdCBjb25maWd1cmVkV29ya3NwYWNlU2NoZW1lc01hcCA9IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyTWFwPGJvb2xlYW4+KCk7XG5cdFx0XHRjb25zdCBjb25maWd1cmVkV29ya3NwYWNlU2NoZW1lcyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0+KCdleHRlbnNpb25zLnN1cHBvcnRWaXJ0dWFsV29ya3NwYWNlcycpIHx8IHt9O1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBPYmplY3Qua2V5cyhjb25maWd1cmVkV29ya3NwYWNlU2NoZW1lcykpIHtcblx0XHRcdFx0aWYgKGNvbmZpZ3VyZWRXb3Jrc3BhY2VTY2hlbWVzW2lkXSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29uZmlndXJlZFdvcmtzcGFjZVNjaGVtZXNNYXAuc2V0KGlkLCBjb25maWd1cmVkV29ya3NwYWNlU2NoZW1lc1tpZF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jb25maWd1cmVkVmlydHVhbFdvcmtzcGFjZVN1cHBvcnRNYXAgPSBjb25maWd1cmVkV29ya3NwYWNlU2NoZW1lc01hcDtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25JZCA9IGdldEdhbGxlcnlFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpO1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmVkVmlydHVhbFdvcmtzcGFjZVN1cHBvcnRNYXAuZ2V0KGV4dGVuc2lvbklkKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29uZmlndXJlZFNlc3Npb25zV2luZG93U3VwcG9ydChtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2NvbmZpZ3VyZWRTZXNzaW9uc1dpbmRvd1N1cHBvcnRNYXAgPT09IG51bGwpIHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRTZXNzaW9uc1dpbmRvd1N1cHBvcnRNYXAgPSBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllck1hcDxib29sZWFuPigpO1xuXHRcdFx0Y29uc3QgY29uZmlndXJlZFNlc3Npb25zV2luZG93U3VwcG9ydCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0+KEVYVEVOU0lPTlNfU1VQUE9SVF9BR0VOVFNfV0lORE9XKSB8fCB7fTtcblx0XHRcdGZvciAoY29uc3QgaWQgb2YgT2JqZWN0LmtleXMoY29uZmlndXJlZFNlc3Npb25zV2luZG93U3VwcG9ydCkpIHtcblx0XHRcdFx0aWYgKGNvbmZpZ3VyZWRTZXNzaW9uc1dpbmRvd1N1cHBvcnRbaWRdICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRjb25maWd1cmVkU2Vzc2lvbnNXaW5kb3dTdXBwb3J0TWFwLnNldChpZCwgY29uZmlndXJlZFNlc3Npb25zV2luZG93U3VwcG9ydFtpZF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jb25maWd1cmVkU2Vzc2lvbnNXaW5kb3dTdXBwb3J0TWFwID0gY29uZmlndXJlZFNlc3Npb25zV2luZG93U3VwcG9ydE1hcDtcblx0XHR9XG5cblx0XHRjb25zdCBleHRlbnNpb25JZCA9IGdldEdhbGxlcnlFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpO1xuXHRcdHJldHVybiB0aGlzLl9jb25maWd1cmVkU2Vzc2lvbnNXaW5kb3dTdXBwb3J0TWFwLmdldChleHRlbnNpb25JZCk7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbmZpZ3VyZWRFeHRlbnNpb25Xb3Jrc3BhY2VUcnVzdFJlcXVlc3QobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IEV4dGVuc2lvblVudHJ1c3RlZFdvcmtzcGFjZVN1cHBvcnRUeXBlIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBleHRlbnNpb25JZCA9IGdldEdhbGxlcnlFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpO1xuXHRcdGNvbnN0IGV4dGVuc2lvbldvcmtzcGFjZVRydXN0UmVxdWVzdCA9IHRoaXMuX2NvbmZpZ3VyZWRFeHRlbnNpb25Xb3Jrc3BhY2VUcnVzdFJlcXVlc3RNYXAuZ2V0KGV4dGVuc2lvbklkKTtcblxuXHRcdGlmIChleHRlbnNpb25Xb3Jrc3BhY2VUcnVzdFJlcXVlc3QgJiYgKGV4dGVuc2lvbldvcmtzcGFjZVRydXN0UmVxdWVzdC52ZXJzaW9uID09PSB1bmRlZmluZWQgfHwgZXh0ZW5zaW9uV29ya3NwYWNlVHJ1c3RSZXF1ZXN0LnZlcnNpb24gPT09IG1hbmlmZXN0LnZlcnNpb24pKSB7XG5cdFx0XHRyZXR1cm4gZXh0ZW5zaW9uV29ya3NwYWNlVHJ1c3RSZXF1ZXN0LnN1cHBvcnRlZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRQcm9kdWN0RXh0ZW5zaW9uV29ya3NwYWNlVHJ1c3RSZXF1ZXN0KG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBFeHRlbnNpb25VbnRydXN0ZWRXb3Jrc3BhY2VTdXBwb3J0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBleHRlbnNpb25JZCA9IGdldEdhbGxlcnlFeHRlbnNpb25JZChtYW5pZmVzdC5wdWJsaXNoZXIsIG1hbmlmZXN0Lm5hbWUpO1xuXHRcdHJldHVybiB0aGlzLl9wcm9kdWN0RXh0ZW5zaW9uV29ya3NwYWNlVHJ1c3RSZXF1ZXN0TWFwLmdldChleHRlbnNpb25JZCk7XG5cdH1cblxuXHRwcml2YXRlIHRvQXJyYXkoZXh0ZW5zaW9uS2luZDogRXh0ZW5zaW9uS2luZCB8IEV4dGVuc2lvbktpbmRbXSk6IEV4dGVuc2lvbktpbmRbXSB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoZXh0ZW5zaW9uS2luZCkpIHtcblx0XHRcdHJldHVybiBleHRlbnNpb25LaW5kO1xuXHRcdH1cblx0XHRyZXR1cm4gZXh0ZW5zaW9uS2luZCA9PT0gJ3VpJyA/IFsndWknLCAnd29ya3NwYWNlJ10gOiBbZXh0ZW5zaW9uS2luZF07XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UsIEV4dGVuc2lvbk1hbmlmZXN0UHJvcGVydGllc1NlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLDZCQUE2QjtBQUN0QyxTQUFpSSxxQkFBcUIsOEJBQXVEO0FBRTdNLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUVyRCxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHlDQUF5QztBQUNsRCxTQUFTLGlCQUFpQjtBQUMx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
