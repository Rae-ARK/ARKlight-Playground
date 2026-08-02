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
import { localize } from "../../../../nls.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
import * as platform from "../../../../base/common/platform.js";
import { IExtensionManagementService, IExtensionGalleryService, InstallOperation } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { INotificationService, NeverShowAgainScope, NotificationPriority } from "../../../../platform/notification/common/notification.js";
import Severity from "../../../../base/common/severity.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { minimumTranslatedStrings } from "./minimalTranslations.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { ILocaleService } from "../../../services/localization/common/locale.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { BaseLocalizationWorkbenchContribution } from "../common/localization.contribution.js";
let NativeLocalizationWorkbenchContribution = class extends BaseLocalizationWorkbenchContribution {
  constructor(notificationService, localeService, productService, storageService, extensionManagementService, galleryService, extensionsWorkbenchService, telemetryService) {
    super();
    this.notificationService = notificationService;
    this.localeService = localeService;
    this.productService = productService;
    this.storageService = storageService;
    this.extensionManagementService = extensionManagementService;
    this.galleryService = galleryService;
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.telemetryService = telemetryService;
    this.checkAndInstall();
    this._register(this.extensionManagementService.onDidInstallExtensions((e) => this.onDidInstallExtensions(e)));
    this._register(this.extensionManagementService.onDidUninstallExtension((e) => this.onDidUninstallExtension(e)));
  }
  async onDidInstallExtensions(results) {
    for (const result of results) {
      if (result.operation === InstallOperation.Install && result.local) {
        await this.onDidInstallExtension(result.local, !!result.context?.extensionsSync);
      }
    }
  }
  async onDidInstallExtension(localExtension, fromSettingsSync) {
    const localization = localExtension.manifest.contributes?.localizations?.[0];
    if (!localization || platform.language === localization.languageId) {
      return;
    }
    const { languageId, languageName } = localization;
    this.notificationService.prompt(
      Severity.Info,
      localize("updateLocale", "Would you like to change {0}'s display language to {1} and restart?", this.productService.nameLong, languageName || languageId),
      [{
        label: localize("changeAndRestart", "Change Language and Restart"),
        run: async () => {
          await this.localeService.setLocale({
            id: languageId,
            label: languageName ?? languageId,
            extensionId: localExtension.identifier.id
            // If settings sync installs the language pack, then we would have just shown the notification so no
            // need to show the dialog.
          }, true);
        }
      }],
      {
        sticky: true,
        priority: NotificationPriority.URGENT,
        neverShowAgain: { id: "langugage.update.donotask", isSecondary: true, scope: NeverShowAgainScope.APPLICATION }
      }
    );
  }
  async onDidUninstallExtension(_event) {
    if (!await this.isLocaleInstalled(platform.language)) {
      this.localeService.setLocale({
        id: "en",
        label: "English"
      });
    }
  }
  async checkAndInstall() {
    const language = platform.language;
    let locale = platform.locale ?? "";
    const languagePackSuggestionIgnoreList = JSON.parse(
      this.storageService.get(
        NativeLocalizationWorkbenchContribution.LANGUAGEPACK_SUGGESTION_IGNORE_STORAGE_KEY,
        StorageScope.APPLICATION,
        "[]"
      )
    );
    if (!this.galleryService.isEnabled()) {
      return;
    }
    if (!language || !locale || platform.Language.isDefaultVariant()) {
      return;
    }
    if (locale.startsWith(language) || languagePackSuggestionIgnoreList.includes(locale)) {
      return;
    }
    const installed = await this.isLocaleInstalled(locale);
    if (installed) {
      return;
    }
    const fullLocale = locale;
    let tagResult = await this.galleryService.query({ text: `tag:lp-${locale}` }, CancellationToken.None);
    if (tagResult.total === 0) {
      locale = locale.split("-")[0];
      tagResult = await this.galleryService.query({ text: `tag:lp-${locale}` }, CancellationToken.None);
      if (tagResult.total === 0) {
        return;
      }
    }
    const extensionToInstall = tagResult.total === 1 ? tagResult.firstPage[0] : tagResult.firstPage.find((e) => e.publisher === "MS-CEINTL" && e.name.startsWith("vscode-language-pack"));
    const extensionToFetchTranslationsFrom = extensionToInstall ?? tagResult.firstPage[0];
    if (!extensionToFetchTranslationsFrom.assets.manifest) {
      return;
    }
    const [manifest, translation] = await Promise.all([
      this.galleryService.getManifest(extensionToFetchTranslationsFrom, CancellationToken.None),
      this.galleryService.getCoreTranslation(extensionToFetchTranslationsFrom, locale)
    ]);
    const loc = manifest?.contributes?.localizations?.find((x) => locale.startsWith(x.languageId.toLowerCase()));
    const languageName = loc ? loc.languageName || locale : locale;
    const languageDisplayName = loc ? loc.localizedLanguageName || loc.languageName || locale : locale;
    const translationsFromPack = translation?.contents?.["vs/workbench/contrib/localization/electron-browser/minimalTranslations"] ?? {};
    const promptMessageKey = extensionToInstall ? "installAndRestartMessage" : "showLanguagePackExtensions";
    const useEnglish = !translationsFromPack[promptMessageKey];
    const translations = {};
    Object.keys(minimumTranslatedStrings).forEach((key) => {
      if (!translationsFromPack[key] || useEnglish) {
        translations[key] = minimumTranslatedStrings[key].replace("{0}", () => languageName);
      } else {
        translations[key] = `${translationsFromPack[key].replace("{0}", () => languageDisplayName)} (${minimumTranslatedStrings[key].replace("{0}", () => languageName)})`;
      }
    });
    const logUserReaction = (userReaction) => {
      this.telemetryService.publicLog("languagePackSuggestion:popup", { userReaction, language: locale });
    };
    const searchAction = {
      label: translations["searchMarketplace"],
      run: async () => {
        logUserReaction("search");
        await this.extensionsWorkbenchService.openSearch(`tag:lp-${locale}`);
      }
    };
    const installAndRestartAction = {
      label: translations["installAndRestart"],
      run: async () => {
        logUserReaction("installAndRestart");
        await this.localeService.setLocale({
          id: locale,
          label: languageName,
          extensionId: extensionToInstall?.identifier.id,
          galleryExtension: extensionToInstall
          // The user will be prompted if they want to install the language pack before this.
        }, true);
      }
    };
    const promptMessage = translations[promptMessageKey];
    this.notificationService.prompt(
      Severity.Info,
      promptMessage,
      [
        extensionToInstall ? installAndRestartAction : searchAction,
        {
          label: localize("neverAgain", "Don't Show Again"),
          isSecondary: true,
          run: () => {
            languagePackSuggestionIgnoreList.push(fullLocale);
            this.storageService.store(
              NativeLocalizationWorkbenchContribution.LANGUAGEPACK_SUGGESTION_IGNORE_STORAGE_KEY,
              JSON.stringify(languagePackSuggestionIgnoreList),
              StorageScope.APPLICATION,
              StorageTarget.USER
            );
            logUserReaction("neverShowAgain");
          }
        }
      ],
      {
        priority: NotificationPriority.OPTIONAL,
        onCancel: () => {
          logUserReaction("cancelled");
        }
      }
    );
  }
  async isLocaleInstalled(locale) {
    const installed = await this.extensionManagementService.getInstalled();
    return installed.some((i) => !!i.manifest.contributes?.localizations?.length && i.manifest.contributes.localizations.some((l) => locale.startsWith(l.languageId.toLowerCase())));
  }
};
NativeLocalizationWorkbenchContribution.LANGUAGEPACK_SUGGESTION_IGNORE_STORAGE_KEY = "extensionsAssistant/languagePackSuggestionIgnore";
NativeLocalizationWorkbenchContribution = __decorateClass([
  __decorateParam(0, INotificationService),
  __decorateParam(1, ILocaleService),
  __decorateParam(2, IProductService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IExtensionManagementService),
  __decorateParam(5, IExtensionGalleryService),
  __decorateParam(6, IExtensionsWorkbenchService),
  __decorateParam(7, ITelemetryService)
], NativeLocalizationWorkbenchContribution);
const workbenchRegistry = Registry.as(WorkbenchExtensions.Workbench);
workbenchRegistry.registerWorkbenchContribution(NativeLocalizationWorkbenchContribution, LifecyclePhase.Eventually);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2xvY2FsaXphdGlvbi9lbGVjdHJvbi1icm93c2VyL2xvY2FsaXphdGlvbi5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMsIElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBMaWZlY3ljbGVQaGFzZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSwgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCBJbnN0YWxsT3BlcmF0aW9uLCBJTG9jYWxFeHRlbnNpb24sIEluc3RhbGxFeHRlbnNpb25SZXN1bHQsIERpZFVuaW5zdGFsbEV4dGVuc2lvbkV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgTmV2ZXJTaG93QWdhaW5TY29wZSwgTm90aWZpY2F0aW9uUHJpb3JpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgU2V2ZXJpdHkgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2V2ZXJpdHkuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgbWluaW11bVRyYW5zbGF0ZWRTdHJpbmdzIH0gZnJvbSAnLi9taW5pbWFsVHJhbnNsYXRpb25zLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvY2FsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sb2NhbGl6YXRpb24vY29tbW9uL2xvY2FsZS5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBCYXNlTG9jYWxpemF0aW9uV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vY29tbW9uL2xvY2FsaXphdGlvbi5jb250cmlidXRpb24uanMnO1xuXG5jbGFzcyBOYXRpdmVMb2NhbGl6YXRpb25Xb3JrYmVuY2hDb250cmlidXRpb24gZXh0ZW5kcyBCYXNlTG9jYWxpemF0aW9uV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0cHJpdmF0ZSBzdGF0aWMgTEFOR1VBR0VQQUNLX1NVR0dFU1RJT05fSUdOT1JFX1NUT1JBR0VfS0VZID0gJ2V4dGVuc2lvbnNBc3Npc3RhbnQvbGFuZ3VhZ2VQYWNrU3VnZ2VzdGlvbklnbm9yZSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElMb2NhbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9jYWxlU2VydmljZTogSUxvY2FsZVNlcnZpY2UsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlOiBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25HYWxsZXJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGdhbGxlcnlTZXJ2aWNlOiBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmNoZWNrQW5kSW5zdGFsbCgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRJbnN0YWxsRXh0ZW5zaW9ucyhlID0+IHRoaXMub25EaWRJbnN0YWxsRXh0ZW5zaW9ucyhlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRVbmluc3RhbGxFeHRlbnNpb24oZSA9PiB0aGlzLm9uRGlkVW5pbnN0YWxsRXh0ZW5zaW9uKGUpKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkSW5zdGFsbEV4dGVuc2lvbnMocmVzdWx0czogcmVhZG9ubHkgSW5zdGFsbEV4dGVuc2lvblJlc3VsdFtdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Zm9yIChjb25zdCByZXN1bHQgb2YgcmVzdWx0cykge1xuXHRcdFx0aWYgKHJlc3VsdC5vcGVyYXRpb24gPT09IEluc3RhbGxPcGVyYXRpb24uSW5zdGFsbCAmJiByZXN1bHQubG9jYWwpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5vbkRpZEluc3RhbGxFeHRlbnNpb24ocmVzdWx0LmxvY2FsLCAhIXJlc3VsdC5jb250ZXh0Py5leHRlbnNpb25zU3luYyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkSW5zdGFsbEV4dGVuc2lvbihsb2NhbEV4dGVuc2lvbjogSUxvY2FsRXh0ZW5zaW9uLCBmcm9tU2V0dGluZ3NTeW5jOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbG9jYWxpemF0aW9uID0gbG9jYWxFeHRlbnNpb24ubWFuaWZlc3QuY29udHJpYnV0ZXM/LmxvY2FsaXphdGlvbnM/LlswXTtcblx0XHRpZiAoIWxvY2FsaXphdGlvbiB8fCBwbGF0Zm9ybS5sYW5ndWFnZSA9PT0gbG9jYWxpemF0aW9uLmxhbmd1YWdlSWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgeyBsYW5ndWFnZUlkLCBsYW5ndWFnZU5hbWUgfSA9IGxvY2FsaXphdGlvbjtcblxuXHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRTZXZlcml0eS5JbmZvLFxuXHRcdFx0bG9jYWxpemUoJ3VwZGF0ZUxvY2FsZScsIFwiV291bGQgeW91IGxpa2UgdG8gY2hhbmdlIHswfSdzIGRpc3BsYXkgbGFuZ3VhZ2UgdG8gezF9IGFuZCByZXN0YXJ0P1wiLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nLCBsYW5ndWFnZU5hbWUgfHwgbGFuZ3VhZ2VJZCksXG5cdFx0XHRbe1xuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NoYW5nZUFuZFJlc3RhcnQnLCBcIkNoYW5nZSBMYW5ndWFnZSBhbmQgUmVzdGFydFwiKSxcblx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5sb2NhbGVTZXJ2aWNlLnNldExvY2FsZSh7XG5cdFx0XHRcdFx0XHRpZDogbGFuZ3VhZ2VJZCxcblx0XHRcdFx0XHRcdGxhYmVsOiBsYW5ndWFnZU5hbWUgPz8gbGFuZ3VhZ2VJZCxcblx0XHRcdFx0XHRcdGV4dGVuc2lvbklkOiBsb2NhbEV4dGVuc2lvbi5pZGVudGlmaWVyLmlkLFxuXHRcdFx0XHRcdFx0Ly8gSWYgc2V0dGluZ3Mgc3luYyBpbnN0YWxscyB0aGUgbGFuZ3VhZ2UgcGFjaywgdGhlbiB3ZSB3b3VsZCBoYXZlIGp1c3Qgc2hvd24gdGhlIG5vdGlmaWNhdGlvbiBzbyBub1xuXHRcdFx0XHRcdFx0Ly8gbmVlZCB0byBzaG93IHRoZSBkaWFsb2cuXG5cdFx0XHRcdFx0fSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1dLFxuXHRcdFx0e1xuXHRcdFx0XHRzdGlja3k6IHRydWUsXG5cdFx0XHRcdHByaW9yaXR5OiBOb3RpZmljYXRpb25Qcmlvcml0eS5VUkdFTlQsXG5cdFx0XHRcdG5ldmVyU2hvd0FnYWluOiB7IGlkOiAnbGFuZ3VnYWdlLnVwZGF0ZS5kb25vdGFzaycsIGlzU2Vjb25kYXJ5OiB0cnVlLCBzY29wZTogTmV2ZXJTaG93QWdhaW5TY29wZS5BUFBMSUNBVElPTiB9XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25EaWRVbmluc3RhbGxFeHRlbnNpb24oX2V2ZW50OiBEaWRVbmluc3RhbGxFeHRlbnNpb25FdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICghYXdhaXQgdGhpcy5pc0xvY2FsZUluc3RhbGxlZChwbGF0Zm9ybS5sYW5ndWFnZSkpIHtcblx0XHRcdHRoaXMubG9jYWxlU2VydmljZS5zZXRMb2NhbGUoe1xuXHRcdFx0XHRpZDogJ2VuJyxcblx0XHRcdFx0bGFiZWw6ICdFbmdsaXNoJ1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjaGVja0FuZEluc3RhbGwoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2UgPSBwbGF0Zm9ybS5sYW5ndWFnZTtcblx0XHRsZXQgbG9jYWxlID0gcGxhdGZvcm0ubG9jYWxlID8/ICcnO1xuXHRcdGNvbnN0IGxhbmd1YWdlUGFja1N1Z2dlc3Rpb25JZ25vcmVMaXN0OiBzdHJpbmdbXSA9IEpTT04ucGFyc2UoXG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChcblx0XHRcdFx0TmF0aXZlTG9jYWxpemF0aW9uV29ya2JlbmNoQ29udHJpYnV0aW9uLkxBTkdVQUdFUEFDS19TVUdHRVNUSU9OX0lHTk9SRV9TVE9SQUdFX0tFWSxcblx0XHRcdFx0U3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0XHQnW10nXG5cdFx0XHQpXG5cdFx0KTtcblxuXHRcdGlmICghdGhpcy5nYWxsZXJ5U2VydmljZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIWxhbmd1YWdlIHx8ICFsb2NhbGUgfHwgcGxhdGZvcm0uTGFuZ3VhZ2UuaXNEZWZhdWx0VmFyaWFudCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChsb2NhbGUuc3RhcnRzV2l0aChsYW5ndWFnZSkgfHwgbGFuZ3VhZ2VQYWNrU3VnZ2VzdGlvbklnbm9yZUxpc3QuaW5jbHVkZXMobG9jYWxlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGluc3RhbGxlZCA9IGF3YWl0IHRoaXMuaXNMb2NhbGVJbnN0YWxsZWQobG9jYWxlKTtcblx0XHRpZiAoaW5zdGFsbGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZnVsbExvY2FsZSA9IGxvY2FsZTtcblx0XHRsZXQgdGFnUmVzdWx0ID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5xdWVyeSh7IHRleHQ6IGB0YWc6bHAtJHtsb2NhbGV9YCB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRpZiAodGFnUmVzdWx0LnRvdGFsID09PSAwKSB7XG5cdFx0XHQvLyBUcmltIHRoZSBsb2NhbGUgYW5kIHRyeSBhZ2Fpbi5cblx0XHRcdGxvY2FsZSA9IGxvY2FsZS5zcGxpdCgnLScpWzBdO1xuXHRcdFx0dGFnUmVzdWx0ID0gYXdhaXQgdGhpcy5nYWxsZXJ5U2VydmljZS5xdWVyeSh7IHRleHQ6IGB0YWc6bHAtJHtsb2NhbGV9YCB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGlmICh0YWdSZXN1bHQudG90YWwgPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IGV4dGVuc2lvblRvSW5zdGFsbCA9IHRhZ1Jlc3VsdC50b3RhbCA9PT0gMSA/IHRhZ1Jlc3VsdC5maXJzdFBhZ2VbMF0gOiB0YWdSZXN1bHQuZmlyc3RQYWdlLmZpbmQoZSA9PiBlLnB1Ymxpc2hlciA9PT0gJ01TLUNFSU5UTCcgJiYgZS5uYW1lLnN0YXJ0c1dpdGgoJ3ZzY29kZS1sYW5ndWFnZS1wYWNrJykpO1xuXHRcdGNvbnN0IGV4dGVuc2lvblRvRmV0Y2hUcmFuc2xhdGlvbnNGcm9tID0gZXh0ZW5zaW9uVG9JbnN0YWxsID8/IHRhZ1Jlc3VsdC5maXJzdFBhZ2VbMF07XG5cblx0XHRpZiAoIWV4dGVuc2lvblRvRmV0Y2hUcmFuc2xhdGlvbnNGcm9tLmFzc2V0cy5tYW5pZmVzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IFttYW5pZmVzdCwgdHJhbnNsYXRpb25dID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5nYWxsZXJ5U2VydmljZS5nZXRNYW5pZmVzdChleHRlbnNpb25Ub0ZldGNoVHJhbnNsYXRpb25zRnJvbSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHR0aGlzLmdhbGxlcnlTZXJ2aWNlLmdldENvcmVUcmFuc2xhdGlvbihleHRlbnNpb25Ub0ZldGNoVHJhbnNsYXRpb25zRnJvbSwgbG9jYWxlKVxuXHRcdF0pO1xuXHRcdGNvbnN0IGxvYyA9IG1hbmlmZXN0Py5jb250cmlidXRlcz8ubG9jYWxpemF0aW9ucz8uZmluZCh4ID0+IGxvY2FsZS5zdGFydHNXaXRoKHgubGFuZ3VhZ2VJZC50b0xvd2VyQ2FzZSgpKSk7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VOYW1lID0gbG9jID8gKGxvYy5sYW5ndWFnZU5hbWUgfHwgbG9jYWxlKSA6IGxvY2FsZTtcblx0XHRjb25zdCBsYW5ndWFnZURpc3BsYXlOYW1lID0gbG9jID8gKGxvYy5sb2NhbGl6ZWRMYW5ndWFnZU5hbWUgfHwgbG9jLmxhbmd1YWdlTmFtZSB8fCBsb2NhbGUpIDogbG9jYWxlO1xuXHRcdGNvbnN0IHRyYW5zbGF0aW9uc0Zyb21QYWNrOiB7IFtrZXk6IHN0cmluZ106IHN0cmluZyB9ID0gdHJhbnNsYXRpb24/LmNvbnRlbnRzPy5bJ3ZzL3dvcmtiZW5jaC9jb250cmliL2xvY2FsaXphdGlvbi9lbGVjdHJvbi1icm93c2VyL21pbmltYWxUcmFuc2xhdGlvbnMnXSA/PyB7fTtcblx0XHRjb25zdCBwcm9tcHRNZXNzYWdlS2V5ID0gZXh0ZW5zaW9uVG9JbnN0YWxsID8gJ2luc3RhbGxBbmRSZXN0YXJ0TWVzc2FnZScgOiAnc2hvd0xhbmd1YWdlUGFja0V4dGVuc2lvbnMnO1xuXHRcdGNvbnN0IHVzZUVuZ2xpc2ggPSAhdHJhbnNsYXRpb25zRnJvbVBhY2tbcHJvbXB0TWVzc2FnZUtleV07XG5cblx0XHRjb25zdCB0cmFuc2xhdGlvbnM6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH0gPSB7fTtcblx0XHRPYmplY3Qua2V5cyhtaW5pbXVtVHJhbnNsYXRlZFN0cmluZ3MpLmZvckVhY2goa2V5ID0+IHtcblx0XHRcdGlmICghdHJhbnNsYXRpb25zRnJvbVBhY2tba2V5XSB8fCB1c2VFbmdsaXNoKSB7XG5cdFx0XHRcdHRyYW5zbGF0aW9uc1trZXldID0gbWluaW11bVRyYW5zbGF0ZWRTdHJpbmdzW2tleV0ucmVwbGFjZSgnezB9JywgKCkgPT4gbGFuZ3VhZ2VOYW1lKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRyYW5zbGF0aW9uc1trZXldID0gYCR7dHJhbnNsYXRpb25zRnJvbVBhY2tba2V5XS5yZXBsYWNlKCd7MH0nLCAoKSA9PiBsYW5ndWFnZURpc3BsYXlOYW1lKX0gKCR7bWluaW11bVRyYW5zbGF0ZWRTdHJpbmdzW2tleV0ucmVwbGFjZSgnezB9JywgKCkgPT4gbGFuZ3VhZ2VOYW1lKX0pYDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGxvZ1VzZXJSZWFjdGlvbiA9ICh1c2VyUmVhY3Rpb246IHN0cmluZykgPT4ge1xuXHRcdFx0LyogX19HRFBSX19cblx0XHRcdFx0XCJsYW5ndWFnZVBhY2tTdWdnZXN0aW9uOnBvcHVwXCIgOiB7XG5cdFx0XHRcdFx0XCJvd25lclwiOiBcIlR5bGVyTGVvbmhhcmR0XCIsXG5cdFx0XHRcdFx0XCJ1c2VyUmVhY3Rpb25cIiA6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIgfSxcblx0XHRcdFx0XHRcImxhbmd1YWdlXCI6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIgfVxuXHRcdFx0XHR9XG5cdFx0XHQqL1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZygnbGFuZ3VhZ2VQYWNrU3VnZ2VzdGlvbjpwb3B1cCcsIHsgdXNlclJlYWN0aW9uLCBsYW5ndWFnZTogbG9jYWxlIH0pO1xuXHRcdH07XG5cblx0XHRjb25zdCBzZWFyY2hBY3Rpb24gPSB7XG5cdFx0XHRsYWJlbDogdHJhbnNsYXRpb25zWydzZWFyY2hNYXJrZXRwbGFjZSddLFxuXHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxvZ1VzZXJSZWFjdGlvbignc2VhcmNoJyk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2Uub3BlblNlYXJjaChgdGFnOmxwLSR7bG9jYWxlfWApO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBpbnN0YWxsQW5kUmVzdGFydEFjdGlvbiA9IHtcblx0XHRcdGxhYmVsOiB0cmFuc2xhdGlvbnNbJ2luc3RhbGxBbmRSZXN0YXJ0J10sXG5cdFx0XHRydW46IGFzeW5jICgpID0+IHtcblx0XHRcdFx0bG9nVXNlclJlYWN0aW9uKCdpbnN0YWxsQW5kUmVzdGFydCcpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmxvY2FsZVNlcnZpY2Uuc2V0TG9jYWxlKHtcblx0XHRcdFx0XHRpZDogbG9jYWxlLFxuXHRcdFx0XHRcdGxhYmVsOiBsYW5ndWFnZU5hbWUsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IGV4dGVuc2lvblRvSW5zdGFsbD8uaWRlbnRpZmllci5pZCxcblx0XHRcdFx0XHRnYWxsZXJ5RXh0ZW5zaW9uOiBleHRlbnNpb25Ub0luc3RhbGxcblx0XHRcdFx0XHQvLyBUaGUgdXNlciB3aWxsIGJlIHByb21wdGVkIGlmIHRoZXkgd2FudCB0byBpbnN0YWxsIHRoZSBsYW5ndWFnZSBwYWNrIGJlZm9yZSB0aGlzLlxuXHRcdFx0XHR9LCB0cnVlKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgcHJvbXB0TWVzc2FnZSA9IHRyYW5zbGF0aW9uc1twcm9tcHRNZXNzYWdlS2V5XTtcblxuXHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRTZXZlcml0eS5JbmZvLFxuXHRcdFx0cHJvbXB0TWVzc2FnZSxcblx0XHRcdFtleHRlbnNpb25Ub0luc3RhbGwgPyBpbnN0YWxsQW5kUmVzdGFydEFjdGlvbiA6IHNlYXJjaEFjdGlvbixcblx0XHRcdHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCduZXZlckFnYWluJywgXCJEb24ndCBTaG93IEFnYWluXCIpLFxuXHRcdFx0XHRpc1NlY29uZGFyeTogdHJ1ZSxcblx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0bGFuZ3VhZ2VQYWNrU3VnZ2VzdGlvbklnbm9yZUxpc3QucHVzaChmdWxsTG9jYWxlKTtcblx0XHRcdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFxuXHRcdFx0XHRcdFx0TmF0aXZlTG9jYWxpemF0aW9uV29ya2JlbmNoQ29udHJpYnV0aW9uLkxBTkdVQUdFUEFDS19TVUdHRVNUSU9OX0lHTk9SRV9TVE9SQUdFX0tFWSxcblx0XHRcdFx0XHRcdEpTT04uc3RyaW5naWZ5KGxhbmd1YWdlUGFja1N1Z2dlc3Rpb25JZ25vcmVMaXN0KSxcblx0XHRcdFx0XHRcdFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTixcblx0XHRcdFx0XHRcdFN0b3JhZ2VUYXJnZXQuVVNFUlxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0bG9nVXNlclJlYWN0aW9uKCduZXZlclNob3dBZ2FpbicpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XSxcblx0XHRcdHtcblx0XHRcdFx0cHJpb3JpdHk6IE5vdGlmaWNhdGlvblByaW9yaXR5Lk9QVElPTkFMLFxuXHRcdFx0XHRvbkNhbmNlbDogKCkgPT4ge1xuXHRcdFx0XHRcdGxvZ1VzZXJSZWFjdGlvbignY2FuY2VsbGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBpc0xvY2FsZUluc3RhbGxlZChsb2NhbGU6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IGluc3RhbGxlZCA9IGF3YWl0IHRoaXMuZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuZ2V0SW5zdGFsbGVkKCk7XG5cdFx0cmV0dXJuIGluc3RhbGxlZC5zb21lKGkgPT4gISFpLm1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5sb2NhbGl6YXRpb25zPy5sZW5ndGhcblx0XHRcdCYmIGkubWFuaWZlc3QuY29udHJpYnV0ZXMubG9jYWxpemF0aW9ucy5zb21lKGwgPT4gbG9jYWxlLnN0YXJ0c1dpdGgobC5sYW5ndWFnZUlkLnRvTG93ZXJDYXNlKCkpKSk7XG5cdH1cbn1cblxuY29uc3Qgd29ya2JlbmNoUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5PihXb3JrYmVuY2hFeHRlbnNpb25zLldvcmtiZW5jaCk7XG53b3JrYmVuY2hSZWdpc3RyeS5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihOYXRpdmVMb2NhbGl6YXRpb25Xb3JrYmVuY2hDb250cmlidXRpb24sIExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQWMsMkJBQTREO0FBQ25GLFNBQVMsc0JBQXNCO0FBQy9CLFlBQVksY0FBYztBQUMxQixTQUFTLDZCQUE2QiwwQkFBMEIsd0JBQTZGO0FBQzdKLFNBQVMsc0JBQXNCLHFCQUFxQiw0QkFBNEI7QUFDaEYsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkNBQTZDO0FBRXRELElBQU0sMENBQU4sY0FBc0Qsc0NBQXNDO0FBQUEsRUFHM0YsWUFDd0MscUJBQ04sZUFDQyxnQkFDQSxnQkFDWSw0QkFDSCxnQkFDRyw0QkFDVixrQkFDbkM7QUFDRCxVQUFNO0FBVGlDO0FBQ047QUFDQztBQUNBO0FBQ1k7QUFDSDtBQUNHO0FBQ1Y7QUFJcEMsU0FBSyxnQkFBZ0I7QUFDckIsU0FBSyxVQUFVLEtBQUssMkJBQTJCLHVCQUF1QixPQUFLLEtBQUssdUJBQXVCLENBQUMsQ0FBQyxDQUFDO0FBQzFHLFNBQUssVUFBVSxLQUFLLDJCQUEyQix3QkFBd0IsT0FBSyxLQUFLLHdCQUF3QixDQUFDLENBQUMsQ0FBQztBQUFBLEVBQzdHO0FBQUEsRUFFQSxNQUFjLHVCQUF1QixTQUEyRDtBQUMvRixlQUFXLFVBQVUsU0FBUztBQUM3QixVQUFJLE9BQU8sY0FBYyxpQkFBaUIsV0FBVyxPQUFPLE9BQU87QUFDbEUsY0FBTSxLQUFLLHNCQUFzQixPQUFPLE9BQU8sQ0FBQyxDQUFDLE9BQU8sU0FBUyxjQUFjO0FBQUEsTUFD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RUEsVUFBTSwwQkFBMEI7QUFBQSxNQUMvQixPQUFPLGFBQWEsbUJBQW1CO0FBQUEsTUFDdkMsS0FBSyxZQUFZO0FBQ2hCLHdCQUFnQixtQkFBbUI7QUFDbkMsY0FBTSxLQUFLLGNBQWMsVUFBVTtBQUFBLFVBQ2xDLElBQUk7QUFBQSxVQUNKLE9BQU87QUFBQSxVQUNQLGFBQWEsb0JBQW9CLFdBQVc7QUFBQSxVQUM1QyxrQkFBa0I7QUFBQTtBQUFBLFFBRW5CLEdBQUcsSUFBSTtBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsVUFBTSxnQkFBZ0IsYUFBYSxnQkFBZ0I7QUFFbkQsU0FBSyxvQkFBb0I7QUFBQSxNQUN4QixTQUFTO0FBQUEsTUFDVDtBQUFBLE1BQ0E7QUFBQSxRQUFDLHFCQUFxQiwwQkFBMEI7QUFBQSxRQUNoRDtBQUFBLFVBQ0MsT0FBTyxTQUFTLGNBQWMsa0JBQWtCO0FBQUEsVUFDaEQsYUFBYTtBQUFBLFVBQ2IsS0FBSyxNQUFNO0FBQ1YsNkNBQWlDLEtBQUssVUFBVTtBQUNoRCxpQkFBSyxlQUFlO0FBQUEsY0FDbkIsd0NBQXdDO0FBQUEsY0FDeEMsS0FBSyxVQUFVLGdDQUFnQztBQUFBLGNBQy9DLGFBQWE7QUFBQSxjQUNiLGNBQWM7QUFBQSxZQUNmO0FBQ0EsNEJBQWdCLGdCQUFnQjtBQUFBLFVBQ2pDO0FBQUEsUUFDRDtBQUFBLE1BQUM7QUFBQSxNQUNEO0FBQUEsUUFDQyxVQUFVLHFCQUFxQjtBQUFBLFFBQy9CLFVBQVUsTUFBTTtBQUNmLDBCQUFnQixXQUFXO0FBQUEsUUFDNUI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsa0JBQWtCLFFBQWtDO0FBQ2pFLFVBQU0sWUFBWSxNQUFNLEtBQUssMkJBQTJCLGFBQWE7QUFDckUsV0FBTyxVQUFVLEtBQUssT0FBSyxDQUFDLENBQUMsRUFBRSxTQUFTLGFBQWEsZUFBZSxVQUNoRSxFQUFFLFNBQVMsWUFBWSxjQUFjLEtBQUssT0FBSyxPQUFPLFdBQVcsRUFBRSxXQUFXLFlBQVksQ0FBQyxDQUFDLENBQUM7QUFBQSxFQUNsRztBQUNEO0FBdk1NLHdDQUNVLDZDQUE2QztBQUR2RCwwQ0FBTjtBQUFBLEVBSUc7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FYRztBQXlNTixNQUFNLG9CQUFvQixTQUFTLEdBQW9DLG9CQUFvQixTQUFTO0FBQ3BHLGtCQUFrQiw4QkFBOEIseUNBQXlDLGVBQWUsVUFBVTsiLAogICJuYW1lcyI6IFtdCn0K
