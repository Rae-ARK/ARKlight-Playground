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
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { language } from "../../../base/common/platform.js";
import { localize } from "../../../nls.js";
import { IExtensionGalleryService } from "../../extensionManagement/common/extensionManagement.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
function getLocale(extension) {
  return extension.tags.find((t) => t.startsWith("lp-"))?.split("lp-")[1];
}
const ILanguagePackService = createDecorator("languagePackService");
let LanguagePackBaseService = class extends Disposable {
  constructor(extensionGalleryService) {
    super();
    this.extensionGalleryService = extensionGalleryService;
  }
  async getAvailableLanguages() {
    const timeout = new CancellationTokenSource();
    setTimeout(() => timeout.cancel(), 1e3);
    let result;
    try {
      result = await this.extensionGalleryService.query({
        text: 'category:"language packs"',
        pageSize: 20
      }, timeout.token);
    } catch (_) {
      return [];
    }
    const languagePackExtensions = result.firstPage.filter((e) => e.properties.localizedLanguages?.length && e.tags.some((t) => t.startsWith("lp-")));
    const allFromMarketplace = languagePackExtensions.map((lp) => {
      const languageName = lp.properties.localizedLanguages?.[0];
      const locale = getLocale(lp);
      const baseQuickPick = this.createQuickPickItem(locale, languageName, lp);
      return {
        ...baseQuickPick,
        extensionId: lp.identifier.id,
        galleryExtension: lp
      };
    });
    allFromMarketplace.push(this.createQuickPickItem("en", "English"));
    return allFromMarketplace;
  }
  createQuickPickItem(locale, languageName, languagePack) {
    const label = languageName ?? locale;
    let description;
    if (label !== locale) {
      description = `(${locale})`;
    }
    if (locale.toLowerCase() === language.toLowerCase()) {
      description ??= "";
      description += localize("currentDisplayLanguage", " (Current)");
    }
    if (languagePack?.installCount) {
      description ??= "";
      const count = languagePack.installCount;
      let countLabel;
      if (count > 1e6) {
        countLabel = `${Math.floor(count / 1e5) / 10}M`;
      } else if (count > 1e3) {
        countLabel = `${Math.floor(count / 1e3)}K`;
      } else {
        countLabel = String(count);
      }
      description += ` $(cloud-download) ${countLabel}`;
    }
    return {
      id: locale,
      label,
      description
    };
  }
};
LanguagePackBaseService = __decorateClass([
  __decorateParam(0, IExtensionGalleryService)
], LanguagePackBaseService);
export {
  ILanguagePackService,
  LanguagePackBaseService,
  getLocale
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2xhbmd1YWdlUGFja3MvY29tbW9uL2xhbmd1YWdlUGFja3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxhbmd1YWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vLi4vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsIElHYWxsZXJ5RXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGdldExvY2FsZShleHRlbnNpb246IElHYWxsZXJ5RXh0ZW5zaW9uKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGV4dGVuc2lvbi50YWdzLmZpbmQodCA9PiB0LnN0YXJ0c1dpdGgoJ2xwLScpKT8uc3BsaXQoJ2xwLScpWzFdO1xufVxuXG5leHBvcnQgY29uc3QgSUxhbmd1YWdlUGFja1NlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUxhbmd1YWdlUGFja1NlcnZpY2U+KCdsYW5ndWFnZVBhY2tTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxhbmd1YWdlUGFja0l0ZW0gZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbSB7XG5cdHJlYWRvbmx5IGV4dGVuc2lvbklkPzogc3RyaW5nO1xuXHRyZWFkb25seSBnYWxsZXJ5RXh0ZW5zaW9uPzogSUdhbGxlcnlFeHRlbnNpb247XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxhbmd1YWdlUGFja1NlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGdldEF2YWlsYWJsZUxhbmd1YWdlcygpOiBQcm9taXNlPEFycmF5PElMYW5ndWFnZVBhY2tJdGVtPj47XG5cdGdldEluc3RhbGxlZExhbmd1YWdlcygpOiBQcm9taXNlPEFycmF5PElMYW5ndWFnZVBhY2tJdGVtPj47XG5cdGdldEJ1aWx0SW5FeHRlbnNpb25UcmFuc2xhdGlvbnNVcmkoaWQ6IHN0cmluZywgbGFuZ3VhZ2U6IHN0cmluZyk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPjtcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIExhbmd1YWdlUGFja0Jhc2VTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElMYW5ndWFnZVBhY2tTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoQElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgZXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2U6IElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhYnN0cmFjdCBnZXRCdWlsdEluRXh0ZW5zaW9uVHJhbnNsYXRpb25zVXJpKGlkOiBzdHJpbmcsIGxhbmd1YWdlOiBzdHJpbmcpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD47XG5cblx0YWJzdHJhY3QgZ2V0SW5zdGFsbGVkTGFuZ3VhZ2VzKCk6IFByb21pc2U8QXJyYXk8SUxhbmd1YWdlUGFja0l0ZW0+PjtcblxuXHRhc3luYyBnZXRBdmFpbGFibGVMYW5ndWFnZXMoKTogUHJvbWlzZTxJTGFuZ3VhZ2VQYWNrSXRlbVtdPiB7XG5cdFx0Y29uc3QgdGltZW91dCA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHNldFRpbWVvdXQoKCkgPT4gdGltZW91dC5jYW5jZWwoKSwgMTAwMCk7XG5cblx0XHRsZXQgcmVzdWx0O1xuXHRcdHRyeSB7XG5cdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLnF1ZXJ5KHtcblx0XHRcdFx0dGV4dDogJ2NhdGVnb3J5OlwibGFuZ3VhZ2UgcGFja3NcIicsXG5cdFx0XHRcdHBhZ2VTaXplOiAyMFxuXHRcdFx0fSwgdGltZW91dC50b2tlbik7XG5cdFx0fSBjYXRjaCAoXykge1xuXHRcdFx0Ly8gVGhpcyBtZXRob2QgaXMgYmVzdCBlZmZvcnQuIFNvLCB3ZSBpZ25vcmUgYW55IGVycm9ycy5cblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBsYW5ndWFnZVBhY2tFeHRlbnNpb25zID0gcmVzdWx0LmZpcnN0UGFnZS5maWx0ZXIoZSA9PiBlLnByb3BlcnRpZXMubG9jYWxpemVkTGFuZ3VhZ2VzPy5sZW5ndGggJiYgZS50YWdzLnNvbWUodCA9PiB0LnN0YXJ0c1dpdGgoJ2xwLScpKSk7XG5cdFx0Y29uc3QgYWxsRnJvbU1hcmtldHBsYWNlOiBJTGFuZ3VhZ2VQYWNrSXRlbVtdID0gbGFuZ3VhZ2VQYWNrRXh0ZW5zaW9ucy5tYXAobHAgPT4ge1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VOYW1lID0gbHAucHJvcGVydGllcy5sb2NhbGl6ZWRMYW5ndWFnZXM/LlswXTtcblx0XHRcdGNvbnN0IGxvY2FsZSA9IGdldExvY2FsZShscCkhO1xuXHRcdFx0Y29uc3QgYmFzZVF1aWNrUGljayA9IHRoaXMuY3JlYXRlUXVpY2tQaWNrSXRlbShsb2NhbGUsIGxhbmd1YWdlTmFtZSwgbHApO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uYmFzZVF1aWNrUGljayxcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGxwLmlkZW50aWZpZXIuaWQsXG5cdFx0XHRcdGdhbGxlcnlFeHRlbnNpb246IGxwXG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0YWxsRnJvbU1hcmtldHBsYWNlLnB1c2godGhpcy5jcmVhdGVRdWlja1BpY2tJdGVtKCdlbicsICdFbmdsaXNoJykpO1xuXG5cdFx0cmV0dXJuIGFsbEZyb21NYXJrZXRwbGFjZTtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVRdWlja1BpY2tJdGVtKGxvY2FsZTogc3RyaW5nLCBsYW5ndWFnZU5hbWU/OiBzdHJpbmcsIGxhbmd1YWdlUGFjaz86IElHYWxsZXJ5RXh0ZW5zaW9uKTogSVF1aWNrUGlja0l0ZW0ge1xuXHRcdGNvbnN0IGxhYmVsID0gbGFuZ3VhZ2VOYW1lID8/IGxvY2FsZTtcblx0XHRsZXQgZGVzY3JpcHRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRpZiAobGFiZWwgIT09IGxvY2FsZSkge1xuXHRcdFx0ZGVzY3JpcHRpb24gPSBgKCR7bG9jYWxlfSlgO1xuXHRcdH1cblxuXHRcdGlmIChsb2NhbGUudG9Mb3dlckNhc2UoKSA9PT0gbGFuZ3VhZ2UudG9Mb3dlckNhc2UoKSkge1xuXHRcdFx0ZGVzY3JpcHRpb24gPz89ICcnO1xuXHRcdFx0ZGVzY3JpcHRpb24gKz0gbG9jYWxpemUoJ2N1cnJlbnREaXNwbGF5TGFuZ3VhZ2UnLCBcIiAoQ3VycmVudClcIik7XG5cdFx0fVxuXG5cdFx0aWYgKGxhbmd1YWdlUGFjaz8uaW5zdGFsbENvdW50KSB7XG5cdFx0XHRkZXNjcmlwdGlvbiA/Pz0gJyc7XG5cblx0XHRcdGNvbnN0IGNvdW50ID0gbGFuZ3VhZ2VQYWNrLmluc3RhbGxDb3VudDtcblx0XHRcdGxldCBjb3VudExhYmVsOiBzdHJpbmc7XG5cdFx0XHRpZiAoY291bnQgPiAxMDAwMDAwKSB7XG5cdFx0XHRcdGNvdW50TGFiZWwgPSBgJHtNYXRoLmZsb29yKGNvdW50IC8gMTAwMDAwKSAvIDEwfU1gO1xuXHRcdFx0fSBlbHNlIGlmIChjb3VudCA+IDEwMDApIHtcblx0XHRcdFx0Y291bnRMYWJlbCA9IGAke01hdGguZmxvb3IoY291bnQgLyAxMDAwKX1LYDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvdW50TGFiZWwgPSBTdHJpbmcoY291bnQpO1xuXHRcdFx0fVxuXHRcdFx0ZGVzY3JpcHRpb24gKz0gYCAkKGNsb3VkLWRvd25sb2FkKSAke2NvdW50TGFiZWx9YDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0aWQ6IGxvY2FsZSxcblx0XHRcdGxhYmVsLFxuXHRcdFx0ZGVzY3JpcHRpb25cblx0XHR9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsa0JBQWtCO0FBQzNCLFNB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
