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
import { CancellationToken } from "../../../base/common/cancellation.js";
import { Event } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { ILogService } from "../../log/common/log.js";
import { IProductService } from "../../product/common/productService.js";
import { IRequestService, isSuccess } from "../../request/common/request.js";
import { McpGalleryResourceType, McpGalleryManifestStatus } from "./mcpGalleryManifest.js";
const SUPPORTED_VERSIONS = [
  "v0.1",
  "v0"
];
let McpGalleryManifestService = class extends Disposable {
  constructor(productService, requestService, logService) {
    super();
    this.productService = productService;
    this.requestService = requestService;
    this.logService = logService;
    this.onDidChangeMcpGalleryManifest = Event.None;
    this.onDidChangeMcpGalleryManifestStatus = Event.None;
    this.versionByUrl = /* @__PURE__ */ new Map();
  }
  get mcpGalleryManifestStatus() {
    return !!this.productService.mcpGallery?.serviceUrl ? McpGalleryManifestStatus.Available : McpGalleryManifestStatus.Unavailable;
  }
  async getMcpGalleryManifest() {
    if (!this.productService.mcpGallery) {
      return null;
    }
    return this.createMcpGalleryManifest(this.productService.mcpGallery.serviceUrl, SUPPORTED_VERSIONS[0]);
  }
  async createMcpGalleryManifest(url, version) {
    url = url.endsWith("/") ? url.slice(0, -1) : url;
    if (!version) {
      let versionPromise = this.versionByUrl.get(url);
      if (!versionPromise) {
        this.versionByUrl.set(url, versionPromise = this.getVersion(url));
      }
      version = await versionPromise;
    }
    const isProductGalleryUrl = this.productService.mcpGallery?.serviceUrl === url;
    const serversUrl = `${url}/${version}/servers`;
    const resources = [
      {
        id: serversUrl,
        type: McpGalleryResourceType.McpServersQueryService
      },
      {
        id: `${serversUrl}/{name}/versions/{version}`,
        type: McpGalleryResourceType.McpServerVersionUri
      },
      {
        id: `${serversUrl}/{name}/versions/latest`,
        type: McpGalleryResourceType.McpServerLatestVersionUri
      }
    ];
    if (isProductGalleryUrl) {
      resources.push({
        id: `${serversUrl}/by-name/{name}`,
        type: McpGalleryResourceType.McpServerNamedResourceUri
      });
      resources.push({
        id: this.productService.mcpGallery.itemWebUrl,
        type: McpGalleryResourceType.McpServerWebUri
      });
      resources.push({
        id: this.productService.mcpGallery.publisherUrl,
        type: McpGalleryResourceType.PublisherUriTemplate
      });
      resources.push({
        id: this.productService.mcpGallery.supportUrl,
        type: McpGalleryResourceType.ContactSupportUri
      });
      resources.push({
        id: this.productService.mcpGallery.supportUrl,
        type: McpGalleryResourceType.ContactSupportUri
      });
      resources.push({
        id: this.productService.mcpGallery.privacyPolicyUrl,
        type: McpGalleryResourceType.PrivacyPolicyUri
      });
      resources.push({
        id: this.productService.mcpGallery.termsOfServiceUrl,
        type: McpGalleryResourceType.TermsOfServiceUri
      });
      resources.push({
        id: this.productService.mcpGallery.reportUrl,
        type: McpGalleryResourceType.ReportUri
      });
    }
    if (version === "v0") {
      resources.push({
        id: `${serversUrl}/{id}`,
        type: McpGalleryResourceType.McpServerIdUri
      });
    }
    return {
      version,
      url,
      resources
    };
  }
  async getVersion(url) {
    for (const version of SUPPORTED_VERSIONS) {
      if (await this.checkVersion(url, version)) {
        return version;
      }
    }
    return SUPPORTED_VERSIONS[0];
  }
  async checkVersion(url, version) {
    try {
      const context = await this.requestService.request({
        type: "GET",
        url: `${url}/${version}/servers?limit=1`,
        callSite: "mcpGalleryManifestService.checkVersion"
      }, CancellationToken.None);
      if (isSuccess(context)) {
        return true;
      }
      this.logService.info(`The service at ${url} does not support version ${version}. Service returned status ${context.res.statusCode}.`);
    } catch (error) {
      this.logService.error(error);
    }
    return false;
  }
};
McpGalleryManifestService = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IRequestService),
  __decorateParam(2, ILogService)
], McpGalleryManifestService);
export {
  McpGalleryManifestService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL21jcC9jb21tb24vbWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZXF1ZXN0U2VydmljZSwgaXNTdWNjZXNzIH0gZnJvbSAnLi4vLi4vcmVxdWVzdC9jb21tb24vcmVxdWVzdC5qcyc7XG5pbXBvcnQgeyBNY3BHYWxsZXJ5UmVzb3VyY2VUeXBlLCBJTWNwR2FsbGVyeU1hbmlmZXN0LCBJTWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZSwgTWNwR2FsbGVyeU1hbmlmZXN0U3RhdHVzIH0gZnJvbSAnLi9tY3BHYWxsZXJ5TWFuaWZlc3QuanMnO1xuXG5jb25zdCBTVVBQT1JURURfVkVSU0lPTlMgPSBbXG5cdCd2MC4xJyxcblx0J3YwJyxcbl07XG5cbmV4cG9ydCBjbGFzcyBNY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElNY3BHYWxsZXJ5TWFuaWZlc3RTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTWNwR2FsbGVyeU1hbmlmZXN0ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VNY3BHYWxsZXJ5TWFuaWZlc3RTdGF0dXMgPSBFdmVudC5Ob25lO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdmVyc2lvbkJ5VXJsID0gbmV3IE1hcDxzdHJpbmcsIFByb21pc2U8c3RyaW5nPj4oKTtcblxuXHRnZXQgbWNwR2FsbGVyeU1hbmlmZXN0U3RhdHVzKCk6IE1jcEdhbGxlcnlNYW5pZmVzdFN0YXR1cyB7XG5cdFx0cmV0dXJuICEhdGhpcy5wcm9kdWN0U2VydmljZS5tY3BHYWxsZXJ5Py5zZXJ2aWNlVXJsID8gTWNwR2FsbGVyeU1hbmlmZXN0U3RhdHVzLkF2YWlsYWJsZSA6IE1jcEdhbGxlcnlNYW5pZmVzdFN0YXR1cy5VbmF2YWlsYWJsZTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJUmVxdWVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZXF1ZXN0U2VydmljZTogSVJlcXVlc3RTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyBnZXRNY3BHYWxsZXJ5TWFuaWZlc3QoKTogUHJvbWlzZTxJTWNwR2FsbGVyeU1hbmlmZXN0IHwgbnVsbD4ge1xuXHRcdGlmICghdGhpcy5wcm9kdWN0U2VydmljZS5tY3BHYWxsZXJ5KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY3JlYXRlTWNwR2FsbGVyeU1hbmlmZXN0KHRoaXMucHJvZHVjdFNlcnZpY2UubWNwR2FsbGVyeS5zZXJ2aWNlVXJsLCBTVVBQT1JURURfVkVSU0lPTlNbMF0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIGNyZWF0ZU1jcEdhbGxlcnlNYW5pZmVzdCh1cmw6IHN0cmluZywgdmVyc2lvbj86IHN0cmluZyk6IFByb21pc2U8SU1jcEdhbGxlcnlNYW5pZmVzdD4ge1xuXHRcdHVybCA9IHVybC5lbmRzV2l0aCgnLycpID8gdXJsLnNsaWNlKDAsIC0xKSA6IHVybDtcblxuXHRcdGlmICghdmVyc2lvbikge1xuXHRcdFx0bGV0IHZlcnNpb25Qcm9taXNlID0gdGhpcy52ZXJzaW9uQnlVcmwuZ2V0KHVybCk7XG5cdFx0XHRpZiAoIXZlcnNpb25Qcm9taXNlKSB7XG5cdFx0XHRcdHRoaXMudmVyc2lvbkJ5VXJsLnNldCh1cmwsIHZlcnNpb25Qcm9taXNlID0gdGhpcy5nZXRWZXJzaW9uKHVybCkpO1xuXHRcdFx0fVxuXHRcdFx0dmVyc2lvbiA9IGF3YWl0IHZlcnNpb25Qcm9taXNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzUHJvZHVjdEdhbGxlcnlVcmwgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLm1jcEdhbGxlcnk/LnNlcnZpY2VVcmwgPT09IHVybDtcblx0XHRjb25zdCBzZXJ2ZXJzVXJsID0gYCR7dXJsfS8ke3ZlcnNpb259L3NlcnZlcnNgO1xuXHRcdGNvbnN0IHJlc291cmNlcyA9IFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6IHNlcnZlcnNVcmwsXG5cdFx0XHRcdHR5cGU6IE1jcEdhbGxlcnlSZXNvdXJjZVR5cGUuTWNwU2VydmVyc1F1ZXJ5U2VydmljZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6IGAke3NlcnZlcnNVcmx9L3tuYW1lfS92ZXJzaW9ucy97dmVyc2lvbn1gLFxuXHRcdFx0XHR0eXBlOiBNY3BHYWxsZXJ5UmVzb3VyY2VUeXBlLk1jcFNlcnZlclZlcnNpb25Vcmlcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiBgJHtzZXJ2ZXJzVXJsfS97bmFtZX0vdmVyc2lvbnMvbGF0ZXN0YCxcblx0XHRcdFx0dHlwZTogTWNwR2FsbGVyeVJlc291cmNlVHlwZS5NY3BTZXJ2ZXJMYXRlc3RWZXJzaW9uVXJpXG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdGlmIChpc1Byb2R1Y3RHYWxsZXJ5VXJsKSB7XG5cdFx0XHRyZXNvdXJjZXMucHVzaCh7XG5cdFx0XHRcdGlkOiBgJHtzZXJ2ZXJzVXJsfS9ieS1uYW1lL3tuYW1lfWAsXG5cdFx0XHRcdHR5cGU6IE1jcEdhbGxlcnlSZXNvdXJjZVR5cGUuTWNwU2VydmVyTmFtZWRSZXNvdXJjZVVyaVxuXHRcdFx0fSk7XG5cdFx0XHRyZXNvdXJjZXMucHVzaCh7XG5cdFx0XHRcdGlkOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLm1jcEdhbGxlcnkuaXRlbVdlYlVybCxcblx0XHRcdFx0dHlwZTogTWNwR2FsbGVyeVJlc291cmNlVHlwZS5NY3BTZXJ2ZXJXZWJVcmlcblx0XHRcdH0pO1xuXHRcdFx0cmVzb3VyY2VzLnB1c2goe1xuXHRcdFx0XHRpZDogdGhpcy5wcm9kdWN0U2VydmljZS5tY3BHYWxsZXJ5LnB1Ymxpc2hlclVybCxcblx0XHRcdFx0dHlwZTogTWNwR2FsbGVyeVJlc291cmNlVHlwZS5QdWJsaXNoZXJVcmlUZW1wbGF0ZVxuXHRcdFx0fSk7XG5cdFx0XHRyZXNvdXJjZXMucHVzaCh7XG5cdFx0XHRcdGlkOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLm1jcEdhbGxlcnkuc3VwcG9ydFVybCxcblx0XHRcdFx0dHlwZTogTWNwR2FsbGVyeVJlc291cmNlVHlwZS5Db250YWN0U3VwcG9ydFVyaVxuXHRcdFx0fSk7XG5cdFx0XHRyZXNvdXJjZXMucHVzaCh7XG5cdFx0XHRcdGlkOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLm1jcEdhbGxlcnkuc3VwcG9ydFVybCxcblx0XHRcdFx0dHlwZTogTWNwR2FsbGVyeVJlc291cmNlVHlwZS5Db250YWN0U3VwcG9ydFVyaVxuXHRcdFx0fSk7XG5cdFx0XHRyZXNvdXJjZXMucHVzaCh7XG5cdFx0XHRcdGlkOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLm1jcEdhbGxlcnkucHJpdmFjeVBvbGljeVVybCxcblx0XHRcdFx0dHlwZTogTWNwR2FsbGVyeVJlc291cmNlVHlwZS5Qcml2YWN5UG9saWN5VXJpXG5cdFx0XHR9KTtcblx0XHRcdHJlc291cmNlcy5wdXNoKHtcblx0XHRcdFx0aWQ6IHRoaXMucHJvZHVjdFNlcnZpY2UubWNwR2FsbGVyeS50ZXJtc09mU2VydmljZVVybCxcblx0XHRcdFx0dHlwZTogTWNwR2FsbGVyeVJlc291cmNlVHlwZS5UZXJtc09mU2VydmljZVVyaVxuXHRcdFx0fSk7XG5cdFx0XHRyZXNvdXJjZXMucHVzaCh7XG5cdFx0XHRcdGlkOiB0aGlzLnByb2R1Y3RTZXJ2aWNlLm1jcEdhbGxlcnkucmVwb3J0VXJsLFxuXHRcdFx0XHR0eXBlOiBNY3BHYWxsZXJ5UmVzb3VyY2VUeXBlLlJlcG9ydFVyaVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKHZlcnNpb24gPT09ICd2MCcpIHtcblx0XHRcdHJlc291cmNlcy5wdXNoKHtcblx0XHRcdFx0aWQ6IGAke3NlcnZlcnNVcmx9L3tpZH1gLFxuXHRcdFx0XHR0eXBlOiBNY3BHYWxsZXJ5UmVzb3VyY2VUeXBlLk1jcFNlcnZlcklkVXJpXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0dmVyc2lvbixcblx0XHRcdHVybCxcblx0XHRcdHJlc291cmNlc1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldFZlcnNpb24odXJsOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGZvciAoY29uc3QgdmVyc2lvbiBvZiBTVVBQT1JURURfVkVSU0lPTlMpIHtcblx0XHRcdGlmIChhd2FpdCB0aGlzLmNoZWNrVmVyc2lvbih1cmwsIHZlcnNpb24pKSB7XG5cdFx0XHRcdHJldHVybiB2ZXJzaW9uO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gU1VQUE9SVEVEX1ZFUlNJT05TWzBdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjaGVja1ZlcnNpb24odXJsOiBzdHJpbmcsIHZlcnNpb246IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBjb250ZXh0ID0gYXdhaXQgdGhpcy5yZXF1ZXN0U2VydmljZS5yZXF1ZXN0KHtcblx0XHRcdFx0dHlwZTogJ0dFVCcsXG5cdFx0XHRcdHVybDogYCR7dXJsfS8ke3ZlcnNpb259L3NlcnZlcnM/bGltaXQ9MWAsXG5cdFx0XHRcdGNhbGxTaXRlOiAnbWNwR2FsbGVyeU1hbmlmZXN0U2VydmljZS5jaGVja1ZlcnNpb24nXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGlmIChpc1N1Y2Nlc3MoY29udGV4dCkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgVGhlIHNlcnZpY2UgYXQgJHt1cmx9IGRvZXMgbm90IHN1cHBvcnQgdmVyc2lvbiAke3ZlcnNpb259LiBTZXJ2aWNlIHJldHVybmVkIHN0YXR1cyAke2NvbnRleHQucmVzLnN0YXR1c0NvZGV9LmApO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsaUJBQWlCLGlCQUFpQjtBQUMzQyxTQUFTLHdCQUF5RSxnQ0FBZ0M7QUFFbEgsTUFBTSxxQkFBcUI7QUFBQSxFQUMxQjtBQUFBLEVBQ0E7QUFDRDtBQUVPLElBQU0sNEJBQU4sY0FBd0MsV0FBaUQ7QUFBQSxFQVkvRixZQUNtQyxnQkFDQSxnQkFDRixZQUMvQjtBQUNELFVBQU07QUFKNEI7QUFDQTtBQUNGO0FBWmpDLFNBQVMsZ0NBQWdDLE1BQU07QUFDL0MsU0FBUyxzQ0FBc0MsTUFBTTtBQUVyRCxTQUFpQixlQUFlLG9CQUFJLElBQTZCO0FBQUEsRUFZakU7QUFBQSxFQVZBLElBQUksMkJBQXFEO0FBQ3hELFdBQU8sQ0FBQyxDQUFDLEtBQUssZUFBZSxZQUFZLGFBQWEseUJBQXlCLFlBQVkseUJBQXlCO0FBQUEsRUFDckg7QUFBQSxFQVVBLE1BQU0sd0JBQTZEO0FBQ2xFLFFBQUksQ0FBQyxLQUFLLGVBQWUsWUFBWTtBQUNwQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sS0FBSyx5QkFBeUIsS0FBSyxlQUFlLFdBQVcsWUFBWSxtQkFBbUIsQ0FBQyxDQUFDO0FBQUEsRUFDdEc7QUFBQSxFQUVBLE1BQWdCLHlCQUF5QixLQUFhLFNBQWdEO0FBQ3JHLFVBQU0sSUFBSSxTQUFTLEdBQUcsSUFBSSxJQUFJLE1BQU0sR0FBRyxFQUFFLElBQUk7QUFFN0MsUUFBSSxDQUFDLFNBQVM7QUFDYixVQUFJLGlCQUFpQixLQUFLLGFBQWEsSUFBSSxHQUFHO0FBQzlDLFVBQUksQ0FBQyxnQkFBZ0I7QUFDcEIsYUFBSyxhQUFhLElBQUksS0FBSyxpQkFBaUIs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
