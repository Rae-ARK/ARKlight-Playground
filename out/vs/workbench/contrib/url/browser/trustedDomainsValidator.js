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
import { Schemas, matchesScheme } from "../../../../base/common/network.js";
import Severity from "../../../../base/common/severity.js";
import { URI } from "../../../../base/common/uri.js";
import { localize } from "../../../../nls.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { ITrustedDomainService } from "./trustedDomainService.js";
import { isURLDomainTrusted } from "../../../../platform/url/common/trustedDomains.js";
import { configureOpenerTrustedDomainsHandler, readStaticTrustedDomains } from "./trustedDomains.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
let OpenerValidatorContributions = class {
  constructor(_openerService, _storageService, _dialogService, _productService, _quickInputService, _editorService, _clipboardService, _telemetryService, _instantiationService, _configurationService, _workspaceTrustService, _trustedDomainService) {
    this._openerService = _openerService;
    this._storageService = _storageService;
    this._dialogService = _dialogService;
    this._productService = _productService;
    this._quickInputService = _quickInputService;
    this._editorService = _editorService;
    this._clipboardService = _clipboardService;
    this._telemetryService = _telemetryService;
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._workspaceTrustService = _workspaceTrustService;
    this._trustedDomainService = _trustedDomainService;
    this._openerService.registerValidator({ shouldOpen: (uri, options) => this.validateLink(uri, options) });
  }
  async validateLink(resource, openOptions) {
    if (!matchesScheme(resource, Schemas.http) && !matchesScheme(resource, Schemas.https)) {
      return true;
    }
    if (openOptions?.fromWorkspace && this._workspaceTrustService.isWorkspaceTrusted() && !this._configurationService.getValue("workbench.trustedDomains.promptInTrustedWorkspace")) {
      return true;
    }
    const originalResource = resource;
    let resourceUri;
    if (typeof resource === "string") {
      resourceUri = URI.parse(resource);
    } else {
      resourceUri = resource;
    }
    if (this._trustedDomainService.isValid(resourceUri)) {
      return true;
    } else {
      const { scheme, authority, path, query, fragment } = resourceUri;
      let formattedLink = `${scheme}://${authority}${path}`;
      const linkTail = `${query ? "?" + query : ""}${fragment ? "#" + fragment : ""}`;
      const remainingLength = Math.max(0, 60 - formattedLink.length);
      const linkTailLengthToKeep = Math.min(Math.max(5, remainingLength), linkTail.length);
      if (linkTailLengthToKeep === linkTail.length) {
        formattedLink += linkTail;
      } else {
        formattedLink += linkTail.charAt(0) + "..." + linkTail.substring(linkTail.length - linkTailLengthToKeep + 1);
      }
      const { result } = await this._dialogService.prompt({
        type: Severity.Info,
        message: localize(
          "openExternalLinkAt",
          "Do you want {0} to open the external website?",
          this._productService.nameShort
        ),
        detail: typeof originalResource === "string" ? originalResource : formattedLink,
        buttons: [
          {
            label: localize({ key: "open", comment: ["&& denotes a mnemonic"] }, "&&Open"),
            run: () => true
          },
          {
            label: localize({ key: "copy", comment: ["&& denotes a mnemonic"] }, "&&Copy"),
            run: () => {
              this._clipboardService.writeText(typeof originalResource === "string" ? originalResource : resourceUri.toString(true));
              return false;
            }
          },
          {
            label: localize({ key: "configureTrustedDomains", comment: ["&& denotes a mnemonic"] }, "Configure &&Trusted Domains"),
            run: async () => {
              const { trustedDomains } = this._instantiationService.invokeFunction(readStaticTrustedDomains);
              const domainToOpen = `${scheme}://${authority}`;
              const pickedDomains = await configureOpenerTrustedDomainsHandler(
                trustedDomains,
                domainToOpen,
                resourceUri,
                this._quickInputService,
                this._storageService,
                this._editorService,
                this._telemetryService
              );
              if (pickedDomains.indexOf("*") !== -1) {
                return true;
              }
              if (isURLDomainTrusted(resourceUri, pickedDomains)) {
                return true;
              }
              return false;
            }
          }
        ],
        cancelButton: {
          run: () => false
        }
      });
      return result;
    }
  }
};
OpenerValidatorContributions = __decorateClass([
  __decorateParam(0, IOpenerService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IDialogService),
  __decorateParam(3, IProductService),
  __decorateParam(4, IQuickInputService),
  __decorateParam(5, IEditorService),
  __decorateParam(6, IClipboardService),
  __decorateParam(7, ITelemetryService),
  __decorateParam(8, IInstantiationService),
  __decorateParam(9, IConfigurationService),
  __decorateParam(10, IWorkspaceTrustManagementService),
  __decorateParam(11, ITrustedDomainService)
], OpenerValidatorContributions);
export {
  OpenerValidatorContributions
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3VybC9icm93c2VyL3RydXN0ZWREb21haW5zVmFsaWRhdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgU2NoZW1hcywgbWF0Y2hlc1NjaGVtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlLCBPcGVuT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSVRydXN0ZWREb21haW5TZXJ2aWNlIH0gZnJvbSAnLi90cnVzdGVkRG9tYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc1VSTERvbWFpblRydXN0ZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmwvY29tbW9uL3RydXN0ZWREb21haW5zLmpzJztcbmltcG9ydCB7IGNvbmZpZ3VyZU9wZW5lclRydXN0ZWREb21haW5zSGFuZGxlciwgcmVhZFN0YXRpY1RydXN0ZWREb21haW5zIH0gZnJvbSAnLi90cnVzdGVkRG9tYWlucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBPcGVuZXJWYWxpZGF0b3JDb250cmlidXRpb25zIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX29wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASURpYWxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VUcnVzdFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVHJ1c3RlZERvbWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdHJ1c3RlZERvbWFpblNlcnZpY2U6IElUcnVzdGVkRG9tYWluU2VydmljZSxcblx0KSB7XG5cdFx0dGhpcy5fb3BlbmVyU2VydmljZS5yZWdpc3RlclZhbGlkYXRvcih7IHNob3VsZE9wZW46ICh1cmksIG9wdGlvbnMpID0+IHRoaXMudmFsaWRhdGVMaW5rKHVyaSwgb3B0aW9ucykgfSk7XG5cdH1cblxuXHRhc3luYyB2YWxpZGF0ZUxpbmsocmVzb3VyY2U6IFVSSSB8IHN0cmluZywgb3Blbk9wdGlvbnM/OiBPcGVuT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmICghbWF0Y2hlc1NjaGVtZShyZXNvdXJjZSwgU2NoZW1hcy5odHRwKSAmJiAhbWF0Y2hlc1NjaGVtZShyZXNvdXJjZSwgU2NoZW1hcy5odHRwcykpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChvcGVuT3B0aW9ucz8uZnJvbVdvcmtzcGFjZSAmJiB0aGlzLl93b3Jrc3BhY2VUcnVzdFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkgJiYgIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd3b3JrYmVuY2gudHJ1c3RlZERvbWFpbnMucHJvbXB0SW5UcnVzdGVkV29ya3NwYWNlJykpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9yaWdpbmFsUmVzb3VyY2UgPSByZXNvdXJjZTtcblx0XHRsZXQgcmVzb3VyY2VVcmk6IFVSSTtcblx0XHRpZiAodHlwZW9mIHJlc291cmNlID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmVzb3VyY2VVcmkgPSBVUkkucGFyc2UocmVzb3VyY2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXNvdXJjZVVyaSA9IHJlc291cmNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl90cnVzdGVkRG9tYWluU2VydmljZS5pc1ZhbGlkKHJlc291cmNlVXJpKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHsgc2NoZW1lLCBhdXRob3JpdHksIHBhdGgsIHF1ZXJ5LCBmcmFnbWVudCB9ID0gcmVzb3VyY2VVcmk7XG5cdFx0XHRsZXQgZm9ybWF0dGVkTGluayA9IGAke3NjaGVtZX06Ly8ke2F1dGhvcml0eX0ke3BhdGh9YDtcblxuXHRcdFx0Y29uc3QgbGlua1RhaWwgPSBgJHtxdWVyeSA/ICc/JyArIHF1ZXJ5IDogJyd9JHtmcmFnbWVudCA/ICcjJyArIGZyYWdtZW50IDogJyd9YDtcblxuXG5cdFx0XHRjb25zdCByZW1haW5pbmdMZW5ndGggPSBNYXRoLm1heCgwLCA2MCAtIGZvcm1hdHRlZExpbmsubGVuZ3RoKTtcblx0XHRcdGNvbnN0IGxpbmtUYWlsTGVuZ3RoVG9LZWVwID0gTWF0aC5taW4oTWF0aC5tYXgoNSwgcmVtYWluaW5nTGVuZ3RoKSwgbGlua1RhaWwubGVuZ3RoKTtcblxuXHRcdFx0aWYgKGxpbmtUYWlsTGVuZ3RoVG9LZWVwID09PSBsaW5rVGFpbC5sZW5ndGgpIHtcblx0XHRcdFx0Zm9ybWF0dGVkTGluayArPSBsaW5rVGFpbDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIGtlZXAgdGhlIGZpcnN0IGNoYXIgPyBvciAjXG5cdFx0XHRcdC8vIGFkZCAuLi4gYW5kIGtlZXAgdGhlIHRhaWwgZW5kIGFzIG11Y2ggYXMgcG9zc2libGVcblx0XHRcdFx0Zm9ybWF0dGVkTGluayArPSBsaW5rVGFpbC5jaGFyQXQoMCkgKyAnLi4uJyArIGxpbmtUYWlsLnN1YnN0cmluZyhsaW5rVGFpbC5sZW5ndGggLSBsaW5rVGFpbExlbmd0aFRvS2VlcCArIDEpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB7IHJlc3VsdCB9ID0gYXdhaXQgdGhpcy5fZGlhbG9nU2VydmljZS5wcm9tcHQ8Ym9vbGVhbj4oe1xuXHRcdFx0XHR0eXBlOiBTZXZlcml0eS5JbmZvLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZShcblx0XHRcdFx0XHQnb3BlbkV4dGVybmFsTGlua0F0Jyxcblx0XHRcdFx0XHQnRG8geW91IHdhbnQgezB9IHRvIG9wZW4gdGhlIGV4dGVybmFsIHdlYnNpdGU/Jyxcblx0XHRcdFx0XHR0aGlzLl9wcm9kdWN0U2VydmljZS5uYW1lU2hvcnRcblx0XHRcdFx0KSxcblx0XHRcdFx0ZGV0YWlsOiB0eXBlb2Ygb3JpZ2luYWxSZXNvdXJjZSA9PT0gJ3N0cmluZycgPyBvcmlnaW5hbFJlc291cmNlIDogZm9ybWF0dGVkTGluayxcblx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ29wZW4nLCBjb21tZW50OiBbJyYmIGRlbm90ZXMgYSBtbmVtb25pYyddIH0sICcmJk9wZW4nKSxcblx0XHRcdFx0XHRcdHJ1bjogKCkgPT4gdHJ1ZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKHsga2V5OiAnY29weScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgJyYmQ29weScpLFxuXHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX2NsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KHR5cGVvZiBvcmlnaW5hbFJlc291cmNlID09PSAnc3RyaW5nJyA/IG9yaWdpbmFsUmVzb3VyY2UgOiByZXNvdXJjZVVyaS50b1N0cmluZyh0cnVlKSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ2NvbmZpZ3VyZVRydXN0ZWREb21haW5zJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCAnQ29uZmlndXJlICYmVHJ1c3RlZCBEb21haW5zJyksXG5cdFx0XHRcdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgeyB0cnVzdGVkRG9tYWlucywgfSA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHJlYWRTdGF0aWNUcnVzdGVkRG9tYWlucyk7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGRvbWFpblRvT3BlbiA9IGAke3NjaGVtZX06Ly8ke2F1dGhvcml0eX1gO1xuXHRcdFx0XHRcdFx0XHRjb25zdCBwaWNrZWREb21haW5zID0gYXdhaXQgY29uZmlndXJlT3BlbmVyVHJ1c3RlZERvbWFpbnNIYW5kbGVyKFxuXHRcdFx0XHRcdFx0XHRcdHRydXN0ZWREb21haW5zLFxuXHRcdFx0XHRcdFx0XHRcdGRvbWFpblRvT3Blbixcblx0XHRcdFx0XHRcdFx0XHRyZXNvdXJjZVVyaSxcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9xdWlja0lucHV0U2VydmljZSxcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZSxcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9lZGl0b3JTZXJ2aWNlLFxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRcdC8vIFRydXN0IGFsbCBkb21haW5zXG5cdFx0XHRcdFx0XHRcdGlmIChwaWNrZWREb21haW5zLmluZGV4T2YoJyonKSAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHQvLyBUcnVzdCBjdXJyZW50IGRvbWFpblxuXHRcdFx0XHRcdFx0XHRpZiAoaXNVUkxEb21haW5UcnVzdGVkKHJlc291cmNlVXJpLCBwaWNrZWREb21haW5zKSkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdGNhbmNlbEJ1dHRvbjoge1xuXHRcdFx0XHRcdHJ1bjogKCkgPT4gZmFsc2Vcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsU0FBUyxxQkFBcUI7QUFDdkMsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFtQztBQUM1QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHdDQUF3QztBQUVqRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHNDQUFzQyxnQ0FBZ0M7QUFDL0UsU0FBUyxzQkFBc0I7QUFFeEIsSUFBTSwrQkFBTixNQUFxRTtBQUFBLEVBRTNFLFlBQ2tDLGdCQUNDLGlCQUNELGdCQUNDLGlCQUNHLG9CQUNKLGdCQUNHLG1CQUNBLG1CQUNJLHVCQUNBLHVCQUNXLHdCQUNYLHVCQUN2QztBQVpnQztBQUNDO0FBQ0Q7QUFDQztBQUNHO0FBQ0o7QUFDRztBQUNBO0FBQ0k7QUFDQTtBQUNXO0FBQ1g7QUFFeEMsU0FBSyxlQUFlLGtCQUFrQixFQUFFLFlBQVksQ0FBQyxLQUFLLFlBQVksS0FBSyxhQUFhLEtBQUssT0FBTyxFQUFFLENBQUM7QUFBQSxFQUN4RztBQUFBLEVBRUEsTUFBTSxhQUFhLFVBQXdCLGFBQTZDO0FBQ3ZGLFFBQUksQ0FBQyxjQUFjLFVBQVUsUUFBUSxJQUFJLEtBQUssQ0FBQyxjQUFjLFVBQVUsUUFBUSxLQUFLLEdBQUc7QUFDdEYsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJLGFBQWEsaUJBQWlCLEtBQUssdUJBQXVCLG1CQUFtQixLQUFLLENBQUMsS0FBSyxzQkFBc0IsU0FBUyxtREFBbUQsR0FBRztBQUNoTCxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sbUJBQW1CO0FBQ3pCLFFBQUk7QUFDSixRQUFJLE9BQU8sYUFBYSxVQUFVO0FBQ2pDLG9CQUFjLElBQUksTUFBTSxRQUFRO0FBQUEsSUFDakMsT0FBTztBQUNOLG9CQUFjO0FBQUEsSUFDZjtBQUVBLFFBQUksS0FBSyxzQkFBc0IsUUFBUSxXQUFXLEdBQUc7QUFDcEQsYUFBTztBQUFBLElBQ1IsT0FBTztBQUNOLFlBQU0sRUFBRSxRQUFRLFdBQVcsTUFBTSxPQUFPLFNBQVMsSUFBSTtBQUNyRCxVQUFJLGdCQUFnQixHQUFHLE1BQU0sTUFBTSxTQUFTLEdBQUcsSUFBSTtBQUVuRCxZQUFNLFdBQVcsR0FBRyxRQUFRLE1BQU0sUUFBUSxFQUFFLEdBQUcsV0FBVyxNQUFNLFdBQVcsRUFBRTtBQUc3RSxZQUFNLGtCQUFrQixLQUFLLElBQUksR0FBRyxLQUFLLGNBQWMsTUFBTTtBQUM3RCxZQUFNLHVCQUF1QixLQUFLLElBQUksS0FBSyxJQUFJLEdBQUcsZUFBZSxHQUFHLFNBQVMsTUFBTTtBQUVuRixVQUFJLHlCQUF5QixTQUFTLFFBQVE7QUFDN0MseUJBQWlCO0FBQUEsTUFDbEIsT0FBTztBQUdOLHlCQUFpQixTQUFTLE9BQU8sQ0FBQyxJQUFJLFFBQVEsU0FBUyxVQUFVLFNBQVMsU0FBUyx1QkFBdUIsQ0FBQztBQUFBLE1BQzVHO0FBRUEsWUFBTSxFQUFFLE9BQU8sSUFBSSxNQUFNLEtBQUssZUFBZSxPQUFnQjtBQUFBLFFBQzVELE1BQU0sU0FBUztBQUFBLFFBQ2YsU0FBUztBQUFBLFVBQ1I7QUFBQSxVQUNBO0FBQUEsVUFDQSxLQUFLLGdCQUFnQjtBQUFBLFFBQ3RCO0FBQUEsUUFDQSxRQUFRLE9BQU8scUJBQXFCLFdBQVcsbUJBQW1CO0FBQUEsUUFDbEUsU0FBUztBQUFBLFVBQ1I7QUFBQSxZQUNDLE9BQU8sU0FBUyxFQUFFLEtBQUssUUFBUSxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxRQUFRO0FBQUEsWUFDN0UsS0FBSyxNQUFNO0FBQUEsVUFDWjtBQUFBLFVBQ0E7QUFBQSxZQUNDLE9BQU8sU0FBUyxFQUFFLEtBQUssUUFBUSxTQUFTLENBQUMsdUJBQXVCLEVBQUUsR0FBRyxRQUFRO0FBQUEsWUFDN0UsS0FBSyxNQUFNO0FBQ1YsbUJBQUssa0JBQWtCLFVBQVUsT0FBTyxxQkFBcUIsV0FBVyxtQkFBbUIsWUFBWSxTQUFTLElBQUksQ0FBQztBQUNySCxxQkFBTztBQUFBLFlBQ1I7QUFBQSxVQUNEO0FBQUEsVUFDQTtBQUFBLFlBQ0MsT0FBTyxTQUFTLEVBQUUsS0FBSywyQkFBMkIsU0FBUyxDQUFDLHVCQUF1QixFQUFFLEdBQUcsNkJBQTZCO0FBQUEsWUFDckgsS0FBSyxZQUFZO0FBQ2hCLG9CQUFNLEVBQUUsZUFBZ0IsSUFBSSxLQUFLLHNCQUFzQixlQUFlLHdCQUF3QjtBQUM5RixvQkFBTSxlQUFlLEdBQUcsTUFBTSxNQUFNLFNBQVM7QUFDN0Msb0JBQU0sZ0JBQWdCLE1BQU07QUFBQSxnQkFDM0I7QUFBQSxnQkFDQTtBQUFBLGdCQUNBO0FBQUEsZ0JBQ0EsS0FBSztBQUFBLGdCQUNMLEtBQUs7QUFBQSxnQkFDTCxLQUFLO0FBQUEsZ0JBQ0wsS0FBSztBQUFBLGNBQ047QUFFQSxrQkFBSSxjQUFjLFFBQVEsR0FBRyxNQUFNLElBQUk7QUFDdEMsdUJBQU87QUFBQSxjQUNSO0FBRUEsa0JBQUksbUJBQW1CLGFBQWEsYUFBYSxHQUFHO0FBQ25ELHVCQUFPO0FBQUEsY0FDUjtBQUNBLHFCQUFPO0FBQUEsWUFDUjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsUUFDQSxjQUFjO0FBQUEsVUFDYixLQUFLLE1BQU07QUFBQSxRQUNaO0FBQUEsTUFDRCxDQUFDO0FBRUQsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0Q7QUE5R2EsK0JBQU47QUFBQSxFQUdKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWRVOyIsCiAgIm5hbWVzIjogW10KfQo=
