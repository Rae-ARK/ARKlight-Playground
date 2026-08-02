import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { registerAction2 } from "../../../../platform/actions/common/actions.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ClearDisplayLanguageAction, ConfigureDisplayLanguageAction } from "./localizationsActions.js";
import { Extensions } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
class BaseLocalizationWorkbenchContribution extends Disposable {
  constructor() {
    super();
    registerAction2(ConfigureDisplayLanguageAction);
    registerAction2(ClearDisplayLanguageAction);
    ExtensionsRegistry.registerExtensionPoint({
      extensionPoint: "localizations",
      defaultExtensionKind: ["ui", "workspace"],
      jsonSchema: {
        description: localize("vscode.extension.contributes.localizations", "Contributes localizations to the editor"),
        type: "array",
        default: [],
        items: {
          type: "object",
          required: ["languageId", "translations"],
          defaultSnippets: [{ body: { languageId: "", languageName: "", localizedLanguageName: "", translations: [{ id: "vscode", path: "" }] } }],
          properties: {
            languageId: {
              description: localize("vscode.extension.contributes.localizations.languageId", "Id of the language into which the display strings are translated."),
              type: "string"
            },
            languageName: {
              description: localize("vscode.extension.contributes.localizations.languageName", "Name of the language in English."),
              type: "string"
            },
            localizedLanguageName: {
              description: localize("vscode.extension.contributes.localizations.languageNameLocalized", "Name of the language in contributed language."),
              type: "string"
            },
            translations: {
              description: localize("vscode.extension.contributes.localizations.translations", "List of translations associated to the language."),
              type: "array",
              default: [{ id: "vscode", path: "" }],
              items: {
                type: "object",
                required: ["id", "path"],
                properties: {
                  id: {
                    type: "string",
                    description: localize("vscode.extension.contributes.localizations.translations.id", "Id of VS Code or Extension for which this translation is contributed to. Id of VS Code is always `vscode` and of extension should be in format `publisherId.extensionName`."),
                    pattern: "^((vscode)|([a-z0-9A-Z][a-z0-9A-Z-]*)\\.([a-z0-9A-Z][a-z0-9A-Z-]*))$",
                    patternErrorMessage: localize("vscode.extension.contributes.localizations.translations.id.pattern", "Id should be `vscode` or in format `publisherId.extensionName` for translating VS code or an extension respectively.")
                  },
                  path: {
                    type: "string",
                    description: localize("vscode.extension.contributes.localizations.translations.path", "A relative path to a file containing translations for the language.")
                  }
                },
                defaultSnippets: [{ body: { id: "", path: "" } }]
              }
            }
          }
        }
      }
    });
  }
}
class LocalizationsDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.localizations;
  }
  render(manifest) {
    const localizations = manifest.contributes?.localizations || [];
    if (!localizations.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      localize("language id", "Language ID"),
      localize("localizations language name", "Language Name"),
      localize("localizations localized language name", "Language Name (Localized)")
    ];
    const rows = localizations.sort((a, b) => a.languageId.localeCompare(b.languageId)).map((localization) => {
      return [
        localization.languageId,
        localization.languageName ?? "",
        localization.localizedLanguageName ?? ""
      ];
    });
    return {
      data: {
        headers,
        rows
      },
      dispose: () => {
      }
    };
  }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "localizations",
  label: localize("localizations", "Language Packs"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(LocalizationsDataRenderer)
});
export {
  BaseLocalizationWorkbenchContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2xvY2FsaXphdGlvbi9jb21tb24vbG9jYWxpemF0aW9uLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IENsZWFyRGlzcGxheUxhbmd1YWdlQWN0aW9uLCBDb25maWd1cmVEaXNwbGF5TGFuZ3VhZ2VBY3Rpb24gfSBmcm9tICcuL2xvY2FsaXphdGlvbnNBY3Rpb25zLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciwgSVJlbmRlcmVkRGF0YSwgSVRhYmxlRGF0YSwgSVJvd0RhdGEsIElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcblxuZXhwb3J0IGNsYXNzIEJhc2VMb2NhbGl6YXRpb25Xb3JrYmVuY2hDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBSZWdpc3RlciBhY3Rpb24gdG8gY29uZmlndXJlIGxvY2FsZSBhbmQgcmVsYXRlZCBzZXR0aW5nc1xuXHRcdHJlZ2lzdGVyQWN0aW9uMihDb25maWd1cmVEaXNwbGF5TGFuZ3VhZ2VBY3Rpb24pO1xuXHRcdHJlZ2lzdGVyQWN0aW9uMihDbGVhckRpc3BsYXlMYW5ndWFnZUFjdGlvbik7XG5cblx0XHRFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludCh7XG5cdFx0XHRleHRlbnNpb25Qb2ludDogJ2xvY2FsaXphdGlvbnMnLFxuXHRcdFx0ZGVmYXVsdEV4dGVuc2lvbktpbmQ6IFsndWknLCAnd29ya3NwYWNlJ10sXG5cdFx0XHRqc29uU2NoZW1hOiB7XG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5sb2NhbGl6YXRpb25zJywgXCJDb250cmlidXRlcyBsb2NhbGl6YXRpb25zIHRvIHRoZSBlZGl0b3JcIiksXG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGRlZmF1bHQ6IFtdLFxuXHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2xhbmd1YWdlSWQnLCAndHJhbnNsYXRpb25zJ10sXG5cdFx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IGxhbmd1YWdlSWQ6ICcnLCBsYW5ndWFnZU5hbWU6ICcnLCBsb2NhbGl6ZWRMYW5ndWFnZU5hbWU6ICcnLCB0cmFuc2xhdGlvbnM6IFt7IGlkOiAndnNjb2RlJywgcGF0aDogJycgfV0gfSB9XSxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRsYW5ndWFnZUlkOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5sb2NhbGl6YXRpb25zLmxhbmd1YWdlSWQnLCAnSWQgb2YgdGhlIGxhbmd1YWdlIGludG8gd2hpY2ggdGhlIGRpc3BsYXkgc3RyaW5ncyBhcmUgdHJhbnNsYXRlZC4nKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRsYW5ndWFnZU5hbWU6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxvY2FsaXphdGlvbnMubGFuZ3VhZ2VOYW1lJywgJ05hbWUgb2YgdGhlIGxhbmd1YWdlIGluIEVuZ2xpc2guJyksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0bG9jYWxpemVkTGFuZ3VhZ2VOYW1lOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5sb2NhbGl6YXRpb25zLmxhbmd1YWdlTmFtZUxvY2FsaXplZCcsICdOYW1lIG9mIHRoZSBsYW5ndWFnZSBpbiBjb250cmlidXRlZCBsYW5ndWFnZS4nKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR0cmFuc2xhdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxvY2FsaXphdGlvbnMudHJhbnNsYXRpb25zJywgJ0xpc3Qgb2YgdHJhbnNsYXRpb25zIGFzc29jaWF0ZWQgdG8gdGhlIGxhbmd1YWdlLicpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0OiBbeyBpZDogJ3ZzY29kZScsIHBhdGg6ICcnIH1dLFxuXHRcdFx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ2lkJywgJ3BhdGgnXSxcblx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxvY2FsaXphdGlvbnMudHJhbnNsYXRpb25zLmlkJywgXCJJZCBvZiBWUyBDb2RlIG9yIEV4dGVuc2lvbiBmb3Igd2hpY2ggdGhpcyB0cmFuc2xhdGlvbiBpcyBjb250cmlidXRlZCB0by4gSWQgb2YgVlMgQ29kZSBpcyBhbHdheXMgYHZzY29kZWAgYW5kIG9mIGV4dGVuc2lvbiBzaG91bGQgYmUgaW4gZm9ybWF0IGBwdWJsaXNoZXJJZC5leHRlbnNpb25OYW1lYC5cIiksXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHBhdHRlcm46ICdeKCh2c2NvZGUpfChbYS16MC05QS1aXVthLXowLTlBLVotXSopXFxcXC4oW2EtejAtOUEtWl1bYS16MC05QS1aLV0qKSkkJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubG9jYWxpemF0aW9ucy50cmFuc2xhdGlvbnMuaWQucGF0dGVybicsIFwiSWQgc2hvdWxkIGJlIGB2c2NvZGVgIG9yIGluIGZvcm1hdCBgcHVibGlzaGVySWQuZXh0ZW5zaW9uTmFtZWAgZm9yIHRyYW5zbGF0aW5nIFZTIGNvZGUgb3IgYW4gZXh0ZW5zaW9uIHJlc3BlY3RpdmVseS5cIilcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubG9jYWxpemF0aW9ucy50cmFuc2xhdGlvbnMucGF0aCcsIFwiQSByZWxhdGl2ZSBwYXRoIHRvIGEgZmlsZSBjb250YWluaW5nIHRyYW5zbGF0aW9ucyBmb3IgdGhlIGxhbmd1YWdlLlwiKVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IGlkOiAnJywgcGF0aDogJycgfSB9XSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBMb2NhbGl6YXRpb25zRGF0YVJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICd0YWJsZSc7XG5cblx0c2hvdWxkUmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFtYW5pZmVzdC5jb250cmlidXRlcz8ubG9jYWxpemF0aW9ucztcblx0fVxuXG5cdHJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogSVJlbmRlcmVkRGF0YTxJVGFibGVEYXRhPiB7XG5cdFx0Y29uc3QgbG9jYWxpemF0aW9ucyA9IG1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5sb2NhbGl6YXRpb25zIHx8IFtdO1xuXHRcdGlmICghbG9jYWxpemF0aW9ucy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7IGRhdGE6IHsgaGVhZGVyczogW10sIHJvd3M6IFtdIH0sIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBbXG5cdFx0XHRsb2NhbGl6ZSgnbGFuZ3VhZ2UgaWQnLCBcIkxhbmd1YWdlIElEXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2xvY2FsaXphdGlvbnMgbGFuZ3VhZ2UgbmFtZScsIFwiTGFuZ3VhZ2UgTmFtZVwiKSxcblx0XHRcdGxvY2FsaXplKCdsb2NhbGl6YXRpb25zIGxvY2FsaXplZCBsYW5ndWFnZSBuYW1lJywgXCJMYW5ndWFnZSBOYW1lIChMb2NhbGl6ZWQpXCIpLFxuXHRcdF07XG5cblx0XHRjb25zdCByb3dzOiBJUm93RGF0YVtdW10gPSBsb2NhbGl6YXRpb25zXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gYS5sYW5ndWFnZUlkLmxvY2FsZUNvbXBhcmUoYi5sYW5ndWFnZUlkKSlcblx0XHRcdC5tYXAobG9jYWxpemF0aW9uID0+IHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRsb2NhbGl6YXRpb24ubGFuZ3VhZ2VJZCxcblx0XHRcdFx0XHRsb2NhbGl6YXRpb24ubGFuZ3VhZ2VOYW1lID8/ICcnLFxuXHRcdFx0XHRcdGxvY2FsaXphdGlvbi5sb2NhbGl6ZWRMYW5ndWFnZU5hbWUgPz8gJydcblx0XHRcdFx0XTtcblx0XHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0cm93c1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdH07XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkucmVnaXN0ZXJFeHRlbnNpb25GZWF0dXJlKHtcblx0aWQ6ICdsb2NhbGl6YXRpb25zJyxcblx0bGFiZWw6IGxvY2FsaXplKCdsb2NhbGl6YXRpb25zJywgXCJMYW5ndWFnZSBQYWNrc1wiKSxcblx0YWNjZXNzOiB7XG5cdFx0Y2FuVG9nZ2xlOiBmYWxzZVxuXHR9LFxuXHRyZW5kZXJlcjogbmV3IFN5bmNEZXNjcmlwdG9yKExvY2FsaXphdGlvbnNEYXRhUmVuZGVyZXIpLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDRCQUE0QixzQ0FBc0M7QUFDM0UsU0FBMEcsa0JBQWtCO0FBQzVILFNBQVMsMEJBQTBCO0FBRTVCLE1BQU0sOENBQThDLFdB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
