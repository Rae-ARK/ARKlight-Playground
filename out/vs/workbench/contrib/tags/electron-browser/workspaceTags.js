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
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ITelemetryService, TelemetryLevel } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { IWorkspaceTagsService, getHashedRemotesFromConfig as baseGetHashedRemotesFromConfig } from "../common/workspaceTags.js";
import { IDiagnosticsService } from "../../../../platform/diagnostics/common/diagnostics.js";
import { IRequestService } from "../../../../platform/request/common/request.js";
import { isWindows } from "../../../../base/common/platform.js";
import { AllowedSecondLevelDomains, getDomainsOfRemotes } from "../../../../platform/extensionManagement/common/configRemotes.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { hashAsync } from "../../../../base/common/hash.js";
async function getHashedRemotesFromConfig(text, stripEndingDotGit = false) {
  return baseGetHashedRemotesFromConfig(text, stripEndingDotGit, hashAsync);
}
let WorkspaceTags = class {
  constructor(fileService, contextService, telemetryService, requestService, textFileService, workspaceTagsService, diagnosticsService, productService, nativeHostService) {
    this.fileService = fileService;
    this.contextService = contextService;
    this.telemetryService = telemetryService;
    this.requestService = requestService;
    this.textFileService = textFileService;
    this.workspaceTagsService = workspaceTagsService;
    this.diagnosticsService = diagnosticsService;
    this.productService = productService;
    this.nativeHostService = nativeHostService;
    if (this.telemetryService.telemetryLevel === TelemetryLevel.USAGE) {
      this.report();
    }
  }
  async report() {
    this.reportWindowsEdition();
    this.workspaceTagsService.getTags().then((tags) => this.reportWorkspaceTags(tags), (error) => onUnexpectedError(error));
    this.reportCloudStats();
    this.reportProxyStats();
    this.getWorkspaceInformation().then((stats) => this.diagnosticsService.reportWorkspaceStats(stats));
  }
  async reportWindowsEdition() {
    if (!isWindows) {
      return;
    }
    let value = await this.nativeHostService.windowsGetStringRegKey("HKEY_LOCAL_MACHINE", "SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", "EditionID");
    if (value === void 0) {
      value = "Unknown";
    }
    this.telemetryService.publicLog2("windowsEdition", { edition: value });
  }
  async getWorkspaceInformation() {
    const workspace = this.contextService.getWorkspace();
    const state = this.contextService.getWorkbenchState();
    const telemetryId = await this.workspaceTagsService.getTelemetryWorkspaceId(workspace, state);
    return {
      id: workspace.id,
      telemetryId,
      rendererSessionId: this.telemetryService.sessionId,
      folders: workspace.folders,
      transient: workspace.transient,
      configuration: workspace.configuration
    };
  }
  reportWorkspaceTags(tags) {
    this.telemetryService.publicLog("workspce.tags", tags);
  }
  reportRemoteDomains(workspaceUris) {
    Promise.all(workspaceUris.map((workspaceUri) => {
      const path = workspaceUri.path;
      const uri = workspaceUri.with({ path: `${path !== "/" ? path : ""}/.git/config` });
      return this.fileService.exists(uri).then((exists) => {
        if (!exists) {
          return [];
        }
        return this.textFileService.read(uri, { acceptTextOnly: true }).then(
          (content) => getDomainsOfRemotes(content.value, AllowedSecondLevelDomains),
          (err) => []
          // ignore missing or binary file
        );
      });
    })).then((domains) => {
      const set = domains.reduce((set2, list2) => list2.reduce((set3, item) => set3.add(item), set2), /* @__PURE__ */ new Set());
      const list = [];
      set.forEach((item) => list.push(item));
      this.telemetryService.publicLog("workspace.remotes", { domains: list.sort() });
    }, onUnexpectedError);
  }
  reportRemotes(workspaceUris) {
    Promise.all(workspaceUris.map((workspaceUri) => {
      return this.workspaceTagsService.getHashedRemotesFromUri(workspaceUri, true);
    })).then(() => {
    }, onUnexpectedError);
  }
  /* __GDPR__FRAGMENT__
  	"AzureTags" : {
  		"node" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
  	}
  */
  reportAzureNode(workspaceUris, tags) {
    const uris = workspaceUris.map((workspaceUri) => {
      const path = workspaceUri.path;
      return workspaceUri.with({ path: `${path !== "/" ? path : ""}/node_modules` });
    });
    return this.fileService.resolveAll(uris.map((resource) => ({ resource }))).then(
      (results) => {
        const names = [].concat(...results.map((result) => result.success ? result.stat.children || [] : [])).map((c) => c.name);
        const referencesAzure = WorkspaceTags.searchArray(names, /azure/i);
        if (referencesAzure) {
          tags["node"] = true;
        }
        return tags;
      },
      (err) => {
        return tags;
      }
    );
  }
  static searchArray(arr, regEx) {
    return arr.some((v) => v.search(regEx) > -1) || void 0;
  }
  /* __GDPR__FRAGMENT__
  	"AzureTags" : {
  		"java" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
  	}
  */
  reportAzureJava(workspaceUris, tags) {
    return Promise.all(workspaceUris.map((workspaceUri) => {
      const path = workspaceUri.path;
      const uri = workspaceUri.with({ path: `${path !== "/" ? path : ""}/pom.xml` });
      return this.fileService.exists(uri).then((exists) => {
        if (!exists) {
          return false;
        }
        return this.textFileService.read(uri, { acceptTextOnly: true }).then(
          (content) => !!content.value.match(/azure/i),
          (err) => false
        );
      });
    })).then((javas) => {
      if (javas.indexOf(true) !== -1) {
        tags["java"] = true;
      }
      return tags;
    });
  }
  reportAzure(uris) {
    const tags = /* @__PURE__ */ Object.create(null);
    this.reportAzureNode(uris, tags).then((tags2) => {
      return this.reportAzureJava(uris, tags2);
    }).then((tags2) => {
      if (Object.keys(tags2).length) {
        this.telemetryService.publicLog("workspace.azure", tags2);
      }
    }).then(void 0, onUnexpectedError);
  }
  reportCloudStats() {
    const uris = this.contextService.getWorkspace().folders.map((folder) => folder.uri);
    if (uris.length && this.fileService) {
      this.reportRemoteDomains(uris);
      this.reportRemotes(uris);
      this.reportAzure(uris);
    }
  }
  reportProxyStats() {
    const downloadUrl = this.productService.downloadUrl;
    if (!downloadUrl) {
      return;
    }
    this.requestService.resolveProxy(downloadUrl).then((proxy) => {
      let type = proxy ? String(proxy).trim().split(/\s+/, 1)[0] : "EMPTY";
      if (["DIRECT", "PROXY", "HTTPS", "SOCKS", "EMPTY"].indexOf(type) === -1) {
        type = "UNKNOWN";
      }
    }).then(void 0, onUnexpectedError);
  }
};
WorkspaceTags = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IWorkspaceContextService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, IRequestService),
  __decorateParam(4, ITextFileService),
  __decorateParam(5, IWorkspaceTagsService),
  __decorateParam(6, IDiagnosticsService),
  __decorateParam(7, IProductService),
  __decorateParam(8, INativeHostService)
], WorkspaceTags);
export {
  WorkspaceTags,
  getHashedRemotesFromConfig
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3RhZ3MvZWxlY3Ryb24tYnJvd3Nlci93b3Jrc3BhY2VUYWdzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSwgSUZpbGVTdGF0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlLCBUZWxlbWV0cnlMZXZlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlLCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRhZ3NTZXJ2aWNlLCBUYWdzLCBnZXRIYXNoZWRSZW1vdGVzRnJvbUNvbmZpZyBhcyBiYXNlR2V0SGFzaGVkUmVtb3Rlc0Zyb21Db25maWcgfSBmcm9tICcuLi9jb21tb24vd29ya3NwYWNlVGFncy5qcyc7XG5pbXBvcnQgeyBJRGlhZ25vc3RpY3NTZXJ2aWNlLCBJV29ya3NwYWNlSW5mb3JtYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFnbm9zdGljcy9jb21tb24vZGlhZ25vc3RpY3MuanMnO1xuaW1wb3J0IHsgSVJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBBbGxvd2VkU2Vjb25kTGV2ZWxEb21haW5zLCBnZXREb21haW5zT2ZSZW1vdGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vY29uZmlnUmVtb3Rlcy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBoYXNoQXN5bmMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdldEhhc2hlZFJlbW90ZXNGcm9tQ29uZmlnKHRleHQ6IHN0cmluZywgc3RyaXBFbmRpbmdEb3RHaXQ6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0cmV0dXJuIGJhc2VHZXRIYXNoZWRSZW1vdGVzRnJvbUNvbmZpZyh0ZXh0LCBzdHJpcEVuZGluZ0RvdEdpdCwgaGFzaEFzeW5jKTtcbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtzcGFjZVRhZ3MgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASVJlcXVlc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVxdWVzdFNlcnZpY2U6IElSZXF1ZXN0U2VydmljZSxcblx0XHRASVRleHRGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRhZ3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlVGFnc1NlcnZpY2U6IElXb3Jrc3BhY2VUYWdzU2VydmljZSxcblx0XHRASURpYWdub3N0aWNzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWdub3N0aWNzU2VydmljZTogSURpYWdub3N0aWNzU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZVxuXHQpIHtcblx0XHRpZiAodGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnRlbGVtZXRyeUxldmVsID09PSBUZWxlbWV0cnlMZXZlbC5VU0FHRSkge1xuXHRcdFx0dGhpcy5yZXBvcnQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlcG9ydCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBXaW5kb3dzLW9ubHkgRWRpdGlvbiBFdmVudFxuXHRcdHRoaXMucmVwb3J0V2luZG93c0VkaXRpb24oKTtcblxuXHRcdC8vIFdvcmtzcGFjZSBUYWdzXG5cdFx0dGhpcy53b3Jrc3BhY2VUYWdzU2VydmljZS5nZXRUYWdzKClcblx0XHRcdC50aGVuKHRhZ3MgPT4gdGhpcy5yZXBvcnRXb3Jrc3BhY2VUYWdzKHRhZ3MpLCBlcnJvciA9PiBvblVuZXhwZWN0ZWRFcnJvcihlcnJvcikpO1xuXG5cdFx0Ly8gQ2xvdWQgU3RhdHNcblx0XHR0aGlzLnJlcG9ydENsb3VkU3RhdHMoKTtcblxuXHRcdHRoaXMucmVwb3J0UHJveHlTdGF0cygpO1xuXG5cdFx0dGhpcy5nZXRXb3Jrc3BhY2VJbmZvcm1hdGlvbigpLnRoZW4oc3RhdHMgPT4gdGhpcy5kaWFnbm9zdGljc1NlcnZpY2UucmVwb3J0V29ya3NwYWNlU3RhdHMoc3RhdHMpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVwb3J0V2luZG93c0VkaXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgdmFsdWUgPSBhd2FpdCB0aGlzLm5hdGl2ZUhvc3RTZXJ2aWNlLndpbmRvd3NHZXRTdHJpbmdSZWdLZXkoJ0hLRVlfTE9DQUxfTUFDSElORScsICdTT0ZUV0FSRVxcXFxNaWNyb3NvZnRcXFxcV2luZG93cyBOVFxcXFxDdXJyZW50VmVyc2lvbicsICdFZGl0aW9uSUQnKTtcblx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dmFsdWUgPSAnVW5rbm93bic7XG5cdFx0fVxuXG5cdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8eyBlZGl0aW9uOiBzdHJpbmcgfSwgeyBvd25lcjogJ3NiYXR0ZW4nOyBjb21tZW50OiAnSW5mb3JtYXRpb24gYWJvdXQgdGhlIFdpbmRvd3MgZWRpdGlvbi4nOyBlZGl0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnQnVzaW5lc3NJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBXaW5kb3dzIGVkaXRpb24uJyB9IH0+KCd3aW5kb3dzRWRpdGlvbicsIHsgZWRpdGlvbjogdmFsdWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFdvcmtzcGFjZUluZm9ybWF0aW9uKCk6IFByb21pc2U8SVdvcmtzcGFjZUluZm9ybWF0aW9uPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKTtcblx0XHRjb25zdCB0ZWxlbWV0cnlJZCA9IGF3YWl0IHRoaXMud29ya3NwYWNlVGFnc1NlcnZpY2UuZ2V0VGVsZW1ldHJ5V29ya3NwYWNlSWQod29ya3NwYWNlLCBzdGF0ZSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IHdvcmtzcGFjZS5pZCxcblx0XHRcdHRlbGVtZXRyeUlkLFxuXHRcdFx0cmVuZGVyZXJTZXNzaW9uSWQ6IHRoaXMudGVsZW1ldHJ5U2VydmljZS5zZXNzaW9uSWQsXG5cdFx0XHRmb2xkZXJzOiB3b3Jrc3BhY2UuZm9sZGVycyxcblx0XHRcdHRyYW5zaWVudDogd29ya3NwYWNlLnRyYW5zaWVudCxcblx0XHRcdGNvbmZpZ3VyYXRpb246IHdvcmtzcGFjZS5jb25maWd1cmF0aW9uXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgcmVwb3J0V29ya3NwYWNlVGFncyh0YWdzOiBUYWdzKTogdm9pZCB7XG5cdFx0LyogX19HRFBSX19cblx0XHRcdFwid29ya3NwY2UudGFnc1wiIDoge1xuXHRcdFx0XHRcIm93bmVyXCI6IFwibHJhbW9zMTVcIixcblx0XHRcdFx0XCIke2luY2x1ZGV9XCI6IFtcblx0XHRcdFx0XHRcIiR7V29ya3NwYWNlVGFnc31cIlxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0Ki9cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nKCd3b3Jrc3BjZS50YWdzJywgdGFncyk7XG5cdH1cblxuXHRwcml2YXRlIHJlcG9ydFJlbW90ZURvbWFpbnMod29ya3NwYWNlVXJpczogVVJJW10pOiB2b2lkIHtcblx0XHRQcm9taXNlLmFsbDxzdHJpbmdbXT4od29ya3NwYWNlVXJpcy5tYXAod29ya3NwYWNlVXJpID0+IHtcblx0XHRcdGNvbnN0IHBhdGggPSB3b3Jrc3BhY2VVcmkucGF0aDtcblx0XHRcdGNvbnN0IHVyaSA9IHdvcmtzcGFjZVVyaS53aXRoKHsgcGF0aDogYCR7cGF0aCAhPT0gJy8nID8gcGF0aCA6ICcnfS8uZ2l0L2NvbmZpZ2AgfSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5maWxlU2VydmljZS5leGlzdHModXJpKS50aGVuKGV4aXN0cyA9PiB7XG5cdFx0XHRcdGlmICghZXhpc3RzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLnRleHRGaWxlU2VydmljZS5yZWFkKHVyaSwgeyBhY2NlcHRUZXh0T25seTogdHJ1ZSB9KS50aGVuKFxuXHRcdFx0XHRcdGNvbnRlbnQgPT4gZ2V0RG9tYWluc09mUmVtb3Rlcyhjb250ZW50LnZhbHVlLCBBbGxvd2VkU2Vjb25kTGV2ZWxEb21haW5zKSxcblx0XHRcdFx0XHRlcnIgPT4gW10gLy8gaWdub3JlIG1pc3Npbmcgb3IgYmluYXJ5IGZpbGVcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH0pKS50aGVuKGRvbWFpbnMgPT4ge1xuXHRcdFx0Y29uc3Qgc2V0ID0gZG9tYWlucy5yZWR1Y2UoKHNldCwgbGlzdCkgPT4gbGlzdC5yZWR1Y2UoKHNldCwgaXRlbSkgPT4gc2V0LmFkZChpdGVtKSwgc2V0KSwgbmV3IFNldDxzdHJpbmc+KCkpO1xuXHRcdFx0Y29uc3QgbGlzdDogc3RyaW5nW10gPSBbXTtcblx0XHRcdHNldC5mb3JFYWNoKGl0ZW0gPT4gbGlzdC5wdXNoKGl0ZW0pKTtcblx0XHRcdC8qIF9fR0RQUl9fXG5cdFx0XHRcdFwid29ya3NwYWNlLnJlbW90ZXNcIiA6IHtcblx0XHRcdFx0XHRcIm93bmVyXCI6IFwibHJhbW9zMTVcIixcblx0XHRcdFx0XHRcImRvbWFpbnNcIiA6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIgfVxuXHRcdFx0XHR9XG5cdFx0XHQqL1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZygnd29ya3NwYWNlLnJlbW90ZXMnLCB7IGRvbWFpbnM6IGxpc3Quc29ydCgpIH0pO1xuXHRcdH0sIG9uVW5leHBlY3RlZEVycm9yKTtcblx0fVxuXG5cdHByaXZhdGUgcmVwb3J0UmVtb3Rlcyh3b3Jrc3BhY2VVcmlzOiBVUklbXSk6IHZvaWQge1xuXHRcdFByb21pc2UuYWxsPHN0cmluZ1tdPih3b3Jrc3BhY2VVcmlzLm1hcCh3b3Jrc3BhY2VVcmkgPT4ge1xuXHRcdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlVGFnc1NlcnZpY2UuZ2V0SGFzaGVkUmVtb3Rlc0Zyb21Vcmkod29ya3NwYWNlVXJpLCB0cnVlKTtcblx0XHR9KSkudGhlbigoKSA9PiB7IH0sIG9uVW5leHBlY3RlZEVycm9yKTtcblx0fVxuXG5cdC8qIF9fR0RQUl9fRlJBR01FTlRfX1xuXHRcdFwiQXp1cmVUYWdzXCIgOiB7XG5cdFx0XHRcIm5vZGVcIiA6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIsIFwiaXNNZWFzdXJlbWVudFwiOiB0cnVlIH1cblx0XHR9XG5cdCovXG5cdHByaXZhdGUgcmVwb3J0QXp1cmVOb2RlKHdvcmtzcGFjZVVyaXM6IFVSSVtdLCB0YWdzOiBUYWdzKTogUHJvbWlzZTxUYWdzPiB7XG5cdFx0Ly8gVE9ETzogc2hvdWxkIGFsc28gd29yayBmb3IgYG5vZGVfbW9kdWxlc2AgZm9sZGVycyBzZXZlcmFsIGxldmVscyBkb3duXG5cdFx0Y29uc3QgdXJpcyA9IHdvcmtzcGFjZVVyaXMubWFwKHdvcmtzcGFjZVVyaSA9PiB7XG5cdFx0XHRjb25zdCBwYXRoID0gd29ya3NwYWNlVXJpLnBhdGg7XG5cdFx0XHRyZXR1cm4gd29ya3NwYWNlVXJpLndpdGgoeyBwYXRoOiBgJHtwYXRoICE9PSAnLycgPyBwYXRoIDogJyd9L25vZGVfbW9kdWxlc2AgfSk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRoaXMuZmlsZVNlcnZpY2UucmVzb2x2ZUFsbCh1cmlzLm1hcChyZXNvdXJjZSA9PiAoeyByZXNvdXJjZSB9KSkpLnRoZW4oXG5cdFx0XHRyZXN1bHRzID0+IHtcblx0XHRcdFx0Y29uc3QgbmFtZXMgPSAoPElGaWxlU3RhdFtdPltdKS5jb25jYXQoLi4ucmVzdWx0cy5tYXAocmVzdWx0ID0+IHJlc3VsdC5zdWNjZXNzID8gKHJlc3VsdC5zdGF0IS5jaGlsZHJlbiB8fCBbXSkgOiBbXSkpLm1hcChjID0+IGMubmFtZSk7XG5cdFx0XHRcdGNvbnN0IHJlZmVyZW5jZXNBenVyZSA9IFdvcmtzcGFjZVRhZ3Muc2VhcmNoQXJyYXkobmFtZXMsIC9henVyZS9pKTtcblx0XHRcdFx0aWYgKHJlZmVyZW5jZXNBenVyZSkge1xuXHRcdFx0XHRcdHRhZ3NbJ25vZGUnXSA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRhZ3M7XG5cdFx0XHR9LFxuXHRcdFx0ZXJyID0+IHtcblx0XHRcdFx0cmV0dXJuIHRhZ3M7XG5cdFx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgc3RhdGljIHNlYXJjaEFycmF5KGFycjogc3RyaW5nW10sIHJlZ0V4OiBSZWdFeHApOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gYXJyLnNvbWUodiA9PiB2LnNlYXJjaChyZWdFeCkgPiAtMSkgfHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0LyogX19HRFBSX19GUkFHTUVOVF9fXG5cdFx0XCJBenVyZVRhZ3NcIiA6IHtcblx0XHRcdFwiamF2YVwiIDogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfVxuXHRcdH1cblx0Ki9cblx0cHJpdmF0ZSByZXBvcnRBenVyZUphdmEod29ya3NwYWNlVXJpczogVVJJW10sIHRhZ3M6IFRhZ3MpOiBQcm9taXNlPFRhZ3M+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5hbGwod29ya3NwYWNlVXJpcy5tYXAod29ya3NwYWNlVXJpID0+IHtcblx0XHRcdGNvbnN0IHBhdGggPSB3b3Jrc3BhY2VVcmkucGF0aDtcblx0XHRcdGNvbnN0IHVyaSA9IHdvcmtzcGFjZVVyaS53aXRoKHsgcGF0aDogYCR7cGF0aCAhPT0gJy8nID8gcGF0aCA6ICcnfS9wb20ueG1sYCB9KTtcblx0XHRcdHJldHVybiB0aGlzLmZpbGVTZXJ2aWNlLmV4aXN0cyh1cmkpLnRoZW4oZXhpc3RzID0+IHtcblx0XHRcdFx0aWYgKCFleGlzdHMpIHtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXMudGV4dEZpbGVTZXJ2aWNlLnJlYWQodXJpLCB7IGFjY2VwdFRleHRPbmx5OiB0cnVlIH0pLnRoZW4oXG5cdFx0XHRcdFx0Y29udGVudCA9PiAhIWNvbnRlbnQudmFsdWUubWF0Y2goL2F6dXJlL2kpLFxuXHRcdFx0XHRcdGVyciA9PiBmYWxzZVxuXHRcdFx0XHQpO1xuXHRcdFx0fSk7XG5cdFx0fSkpLnRoZW4oamF2YXMgPT4ge1xuXHRcdFx0aWYgKGphdmFzLmluZGV4T2YodHJ1ZSkgIT09IC0xKSB7XG5cdFx0XHRcdHRhZ3NbJ2phdmEnXSA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGFncztcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmVwb3J0QXp1cmUodXJpczogVVJJW10pIHtcblx0XHRjb25zdCB0YWdzOiBUYWdzID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHR0aGlzLnJlcG9ydEF6dXJlTm9kZSh1cmlzLCB0YWdzKS50aGVuKCh0YWdzKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZXBvcnRBenVyZUphdmEodXJpcywgdGFncyk7XG5cdFx0fSkudGhlbigodGFncykgPT4ge1xuXHRcdFx0aWYgKE9iamVjdC5rZXlzKHRhZ3MpLmxlbmd0aCkge1xuXHRcdFx0XHQvKiBfX0dEUFJfX1xuXHRcdFx0XHRcdFwid29ya3NwYWNlLmF6dXJlXCIgOiB7XG5cdFx0XHRcdFx0XHRcIm93bmVyXCI6IFwibHJhbW9zMTVcIixcblx0XHRcdFx0XHRcdFwiJHtpbmNsdWRlfVwiOiBbXG5cdFx0XHRcdFx0XHRcdFwiJHtBenVyZVRhZ3N9XCJcblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdCovXG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2coJ3dvcmtzcGFjZS5henVyZScsIHRhZ3MpO1xuXHRcdFx0fVxuXHRcdH0pLnRoZW4odW5kZWZpbmVkLCBvblVuZXhwZWN0ZWRFcnJvcik7XG5cdH1cblxuXHRwcml2YXRlIHJlcG9ydENsb3VkU3RhdHMoKTogdm9pZCB7XG5cdFx0Y29uc3QgdXJpcyA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycy5tYXAoZm9sZGVyID0+IGZvbGRlci51cmkpO1xuXHRcdGlmICh1cmlzLmxlbmd0aCAmJiB0aGlzLmZpbGVTZXJ2aWNlKSB7XG5cdFx0XHR0aGlzLnJlcG9ydFJlbW90ZURvbWFpbnModXJpcyk7XG5cdFx0XHR0aGlzLnJlcG9ydFJlbW90ZXModXJpcyk7XG5cdFx0XHR0aGlzLnJlcG9ydEF6dXJlKHVyaXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVwb3J0UHJveHlTdGF0cygpIHtcblx0XHRjb25zdCBkb3dubG9hZFVybCA9IHRoaXMucHJvZHVjdFNlcnZpY2UuZG93bmxvYWRVcmw7XG5cdFx0aWYgKCFkb3dubG9hZFVybCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnJlcXVlc3RTZXJ2aWNlLnJlc29sdmVQcm94eShkb3dubG9hZFVybClcblx0XHRcdC50aGVuKHByb3h5ID0+IHtcblx0XHRcdFx0bGV0IHR5cGUgPSBwcm94eSA/IFN0cmluZyhwcm94eSkudHJpbSgpLnNwbGl0KC9cXHMrLywgMSlbMF0gOiAnRU1QVFknO1xuXHRcdFx0XHRpZiAoWydESVJFQ1QnLCAnUFJPWFknLCAnSFRUUFMnLCAnU09DS1MnLCAnRU1QVFknXS5pbmRleE9mKHR5cGUpID09PSAtMSkge1xuXHRcdFx0XHRcdHR5cGUgPSAnVU5LTk9XTic7XG5cdFx0XHRcdH1cblx0XHRcdH0pLnRoZW4odW5kZWZpbmVkLCBvblVuZXhwZWN0ZWRFcnJvcik7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxvQkFBK0I7QUFDeEMsU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsd0JBQXlCO0FBQ2xDLFNBQVMsdUJBQTZCLDhCQUE4Qixz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
