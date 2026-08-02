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
var __decorateParam = (index2, decorator) => (target, key) => decorator(target, key, index2);
import { localize } from "../../../../nls.js";
import { clearConfiguredLanguageAssociations, registerConfiguredLanguageAssociation } from "../../../../editor/common/services/languagesAssociations.js";
import { joinPath } from "../../../../base/common/resources.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { LanguageService } from "../../../../editor/common/services/languageService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { FILES_ASSOCIATIONS_CONFIG } from "../../../../platform/files/common/files.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Extensions } from "../../extensionManagement/common/extensionFeatures.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { index } from "../../../../base/common/arrays.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { isString } from "../../../../base/common/types.js";
const languagesExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "languages",
  jsonSchema: {
    description: localize("vscode.extension.contributes.languages", "Contributes language declarations."),
    type: "array",
    items: {
      type: "object",
      defaultSnippets: [{ body: { id: "${1:languageId}", aliases: ["${2:label}"], extensions: ["${3:extension}"], configuration: "./language-configuration.json" } }],
      properties: {
        id: {
          description: localize("vscode.extension.contributes.languages.id", "ID of the language."),
          type: "string"
        },
        aliases: {
          description: localize("vscode.extension.contributes.languages.aliases", "Name aliases for the language."),
          type: "array",
          items: {
            type: "string"
          }
        },
        extensions: {
          description: localize("vscode.extension.contributes.languages.extensions", "File extensions associated to the language."),
          default: [".foo"],
          type: "array",
          items: {
            type: "string"
          }
        },
        filenames: {
          description: localize("vscode.extension.contributes.languages.filenames", "File names associated to the language."),
          type: "array",
          items: {
            type: "string"
          }
        },
        filenamePatterns: {
          description: localize("vscode.extension.contributes.languages.filenamePatterns", "File name glob patterns associated to the language."),
          type: "array",
          items: {
            type: "string"
          }
        },
        mimetypes: {
          description: localize("vscode.extension.contributes.languages.mimetypes", "Mime types associated to the language."),
          type: "array",
          items: {
            type: "string"
          }
        },
        firstLine: {
          description: localize("vscode.extension.contributes.languages.firstLine", "A regular expression matching the first line of a file of the language."),
          type: "string"
        },
        configuration: {
          description: localize("vscode.extension.contributes.languages.configuration", "A relative path to a file containing configuration options for the language."),
          type: "string",
          default: "./language-configuration.json"
        },
        icon: {
          type: "object",
          description: localize("vscode.extension.contributes.languages.icon", "A icon to use as file icon, if no icon theme provides one for the language."),
          properties: {
            light: {
              description: localize("vscode.extension.contributes.languages.icon.light", "Icon path when a light theme is used"),
              type: "string"
            },
            dark: {
              description: localize("vscode.extension.contributes.languages.icon.dark", "Icon path when a dark theme is used"),
              type: "string"
            }
          }
        }
      }
    }
  },
  activationEventsGenerator: function* (languageContributions) {
    for (const languageContribution of languageContributions) {
      if (languageContribution.id && languageContribution.configuration) {
        yield `onLanguage:${languageContribution.id}`;
      }
    }
  }
});
class LanguageTableRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.languages;
  }
  render(manifest) {
    const contributes = manifest.contributes;
    const rawLanguages = contributes?.languages || [];
    const languages = [];
    for (const l of rawLanguages) {
      if (isValidLanguageExtensionPoint(l)) {
        languages.push({
          id: l.id,
          name: (l.aliases || [])[0] || l.id,
          extensions: l.extensions || [],
          hasGrammar: false,
          hasSnippets: false
        });
      }
    }
    const byId = index(languages, (l) => l.id);
    const grammars = contributes?.grammars || [];
    grammars.forEach((grammar) => {
      if (!isString(grammar.language)) {
        return;
      }
      let language = byId[grammar.language];
      if (language) {
        language.hasGrammar = true;
      } else {
        language = { id: grammar.language, name: grammar.language, extensions: [], hasGrammar: true, hasSnippets: false };
        byId[language.id] = language;
        languages.push(language);
      }
    });
    const snippets = contributes?.snippets || [];
    snippets.forEach((snippet) => {
      if (!isString(snippet.language)) {
        return;
      }
      let language = byId[snippet.language];
      if (language) {
        language.hasSnippets = true;
      } else {
        language = { id: snippet.language, name: snippet.language, extensions: [], hasGrammar: false, hasSnippets: true };
        byId[language.id] = language;
        languages.push(language);
      }
    });
    if (!languages.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      localize("language id", "ID"),
      localize("language name", "Name"),
      localize("file extensions", "File Extensions"),
      localize("grammar", "Grammar"),
      localize("snippets", "Snippets")
    ];
    const rows = languages.sort((a, b) => a.id.localeCompare(b.id)).map((l) => {
      return [
        l.id,
        l.name,
        new MarkdownString().appendMarkdown(`${l.extensions.map((e) => `\`${e}\``).join("&nbsp;")}`),
        l.hasGrammar ? "\u2714\uFE0E" : "\u2014",
        l.hasSnippets ? "\u2714\uFE0E" : "\u2014"
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
  id: "languages",
  label: localize("languages", "Programming Languages"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(LanguageTableRenderer)
});
let WorkbenchLanguageService = class extends LanguageService {
  constructor(extensionService, configurationService, environmentService, logService) {
    super(environmentService.verbose || environmentService.isExtensionDevelopment || !environmentService.isBuilt);
    this.logService = logService;
    this._configurationService = configurationService;
    this._extensionService = extensionService;
    languagesExtPoint.setHandler((extensions) => {
      const allValidLanguages = [];
      for (let i = 0, len = extensions.length; i < len; i++) {
        const extension = extensions[i];
        if (!Array.isArray(extension.value)) {
          extension.collector.error(localize("invalid", "Invalid `contributes.{0}`. Expected an array.", languagesExtPoint.name));
          continue;
        }
        for (let j = 0, lenJ = extension.value.length; j < lenJ; j++) {
          const ext = extension.value[j];
          if (isValidLanguageExtensionPoint(ext, extension.collector)) {
            let configuration = void 0;
            if (ext.configuration) {
              configuration = joinPath(extension.description.extensionLocation, ext.configuration);
            }
            allValidLanguages.push({
              id: ext.id,
              extensions: ext.extensions,
              filenames: ext.filenames,
              filenamePatterns: ext.filenamePatterns,
              firstLine: ext.firstLine,
              aliases: ext.aliases,
              mimetypes: ext.mimetypes,
              configuration,
              icon: ext.icon && {
                light: joinPath(extension.description.extensionLocation, ext.icon.light),
                dark: joinPath(extension.description.extensionLocation, ext.icon.dark)
              }
            });
          }
        }
      }
      this._registry.setDynamicLanguages(allValidLanguages);
    });
    this.updateMime();
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(FILES_ASSOCIATIONS_CONFIG)) {
        this.updateMime();
      }
    }));
    this._extensionService.whenInstalledExtensionsRegistered().then(() => {
      this.updateMime();
    });
    this._register(this.onDidRequestRichLanguageFeatures((languageId) => {
      this._extensionService.activateByEvent(`onLanguage:${languageId}`);
      this._extensionService.activateByEvent(`onLanguage`);
    }));
  }
  updateMime() {
    const configuration = this._configurationService.getValue();
    clearConfiguredLanguageAssociations();
    if (configuration.files?.associations) {
      Object.keys(configuration.files.associations).forEach((pattern) => {
        const langId = configuration.files.associations[pattern];
        if (typeof langId !== "string") {
          this.logService.warn(`Ignoring configured 'files.associations' for '${pattern}' because its type is not a string but '${typeof langId}'`);
          return;
        }
        const mimeType = this.getMimeType(langId) || `text/x-${langId}`;
        registerConfiguredLanguageAssociation({ id: langId, mime: mimeType, filepattern: pattern });
      });
    }
    this._onDidChange.fire();
  }
};
WorkbenchLanguageService = __decorateClass([
  __decorateParam(0, IExtensionService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IEnvironmentService),
  __decorateParam(3, ILogService)
], WorkbenchLanguageService);
function isUndefinedOrStringArray(value) {
  if (typeof value === "undefined") {
    return true;
  }
  if (!Array.isArray(value)) {
    return false;
  }
  return value.every((item) => typeof item === "string");
}
function isValidLanguageExtensionPoint(value, collector) {
  if (!value) {
    collector?.error(localize("invalid.empty", "Empty value for `contributes.{0}`", languagesExtPoint.name));
    return false;
  }
  if (typeof value.id !== "string") {
    collector?.error(localize("require.id", "property `{0}` is mandatory and must be of type `string`", "id"));
    return false;
  }
  if (!isUndefinedOrStringArray(value.extensions)) {
    collector?.error(localize("opt.extensions", "property `{0}` can be omitted and must be of type `string[]`", "extensions"));
    return false;
  }
  if (!isUndefinedOrStringArray(value.filenames)) {
    collector?.error(localize("opt.filenames", "property `{0}` can be omitted and must be of type `string[]`", "filenames"));
    return false;
  }
  if (typeof value.firstLine !== "undefined" && typeof value.firstLine !== "string") {
    collector?.error(localize("opt.firstLine", "property `{0}` can be omitted and must be of type `string`", "firstLine"));
    return false;
  }
  if (typeof value.configuration !== "undefined" && typeof value.configuration !== "string") {
    collector?.error(localize("opt.configuration", "property `{0}` can be omitted and must be of type `string`", "configuration"));
    return false;
  }
  if (!isUndefinedOrStringArray(value.aliases)) {
    collector?.error(localize("opt.aliases", "property `{0}` can be omitted and must be of type `string[]`", "aliases"));
    return false;
  }
  if (!isUndefinedOrStringArray(value.mimetypes)) {
    collector?.error(localize("opt.mimetypes", "property `{0}` can be omitted and must be of type `string[]`", "mimetypes"));
    return false;
  }
  if (typeof value.icon !== "undefined") {
    if (typeof value.icon !== "object" || typeof value.icon.light !== "string" || typeof value.icon.dark !== "string") {
      collector?.error(localize("opt.icon", "property `{0}` can be omitted and must be of type `object` with properties `{1}` and `{2}` of type `string`", "icon", "light", "dark"));
      return false;
    }
  }
  return true;
}
registerSingleton(ILanguageService, WorkbenchLanguageService, InstantiationType.Eager);
export {
  WorkbenchLanguageService,
  languagesExtPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYW5ndWFnZS9jb21tb24vbGFuZ3VhZ2VTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgY2xlYXJDb25maWd1cmVkTGFuZ3VhZ2VBc3NvY2lhdGlvbnMsIHJlZ2lzdGVyQ29uZmlndXJlZExhbmd1YWdlQXNzb2NpYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlc0Fzc29jaWF0aW9ucy5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRXh0ZW5zaW9uUG9pbnQsIElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgRklMRVNfQVNTT0NJQVRJT05TX0NPTkZJRywgSUZpbGVzQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uTWVzc2FnZUNvbGxlY3RvciwgRXh0ZW5zaW9uc1JlZ2lzdHJ5LCBJRXh0ZW5zaW9uUG9pbnQsIElFeHRlbnNpb25Qb2ludFVzZXIgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIsIElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5LCBJUmVuZGVyZWREYXRhLCBJUm93RGF0YSwgSVRhYmxlRGF0YSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkZlYXR1cmVzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgaW5kZXggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJUmF3TGFuZ3VhZ2VFeHRlbnNpb25Qb2ludCB7XG5cdGlkOiBzdHJpbmc7XG5cdGV4dGVuc2lvbnM6IHN0cmluZ1tdO1xuXHRmaWxlbmFtZXM6IHN0cmluZ1tdO1xuXHRmaWxlbmFtZVBhdHRlcm5zOiBzdHJpbmdbXTtcblx0Zmlyc3RMaW5lOiBzdHJpbmc7XG5cdGFsaWFzZXM6IHN0cmluZ1tdO1xuXHRtaW1ldHlwZXM6IHN0cmluZ1tdO1xuXHRjb25maWd1cmF0aW9uOiBzdHJpbmc7XG5cdGljb246IHsgbGlnaHQ6IHN0cmluZzsgZGFyazogc3RyaW5nIH07XG59XG5cbmV4cG9ydCBjb25zdCBsYW5ndWFnZXNFeHRQb2ludDogSUV4dGVuc2lvblBvaW50PElSYXdMYW5ndWFnZUV4dGVuc2lvblBvaW50W10+ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SVJhd0xhbmd1YWdlRXh0ZW5zaW9uUG9pbnRbXT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ2xhbmd1YWdlcycsXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VzJywgJ0NvbnRyaWJ1dGVzIGxhbmd1YWdlIGRlY2xhcmF0aW9ucy4nKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyBpZDogJyR7MTpsYW5ndWFnZUlkfScsIGFsaWFzZXM6IFsnJHsyOmxhYmVsfSddLCBleHRlbnNpb25zOiBbJyR7MzpleHRlbnNpb259J10sIGNvbmZpZ3VyYXRpb246ICcuL2xhbmd1YWdlLWNvbmZpZ3VyYXRpb24uanNvbicgfSB9XSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VzLmlkJywgJ0lEIG9mIHRoZSBsYW5ndWFnZS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRhbGlhc2VzOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlcy5hbGlhc2VzJywgJ05hbWUgYWxpYXNlcyBmb3IgdGhlIGxhbmd1YWdlLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRleHRlbnNpb25zOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlcy5leHRlbnNpb25zJywgJ0ZpbGUgZXh0ZW5zaW9ucyBhc3NvY2lhdGVkIHRvIHRoZSBsYW5ndWFnZS4nKSxcblx0XHRcdFx0XHRkZWZhdWx0OiBbJy5mb28nXSxcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZmlsZW5hbWVzOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlcy5maWxlbmFtZXMnLCAnRmlsZSBuYW1lcyBhc3NvY2lhdGVkIHRvIHRoZSBsYW5ndWFnZS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0ZmlsZW5hbWVQYXR0ZXJuczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5sYW5ndWFnZXMuZmlsZW5hbWVQYXR0ZXJucycsICdGaWxlIG5hbWUgZ2xvYiBwYXR0ZXJucyBhc3NvY2lhdGVkIHRvIHRoZSBsYW5ndWFnZS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0bWltZXR5cGVzOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlcy5taW1ldHlwZXMnLCAnTWltZSB0eXBlcyBhc3NvY2lhdGVkIHRvIHRoZSBsYW5ndWFnZS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0Zmlyc3RMaW5lOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlcy5maXJzdExpbmUnLCAnQSByZWd1bGFyIGV4cHJlc3Npb24gbWF0Y2hpbmcgdGhlIGZpcnN0IGxpbmUgb2YgYSBmaWxlIG9mIHRoZSBsYW5ndWFnZS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlcy5jb25maWd1cmF0aW9uJywgJ0EgcmVsYXRpdmUgcGF0aCB0byBhIGZpbGUgY29udGFpbmluZyBjb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIHRoZSBsYW5ndWFnZS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZWZhdWx0OiAnLi9sYW5ndWFnZS1jb25maWd1cmF0aW9uLmpzb24nXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGljb246IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMubGFuZ3VhZ2VzLmljb24nLCAnQSBpY29uIHRvIHVzZSBhcyBmaWxlIGljb24sIGlmIG5vIGljb24gdGhlbWUgcHJvdmlkZXMgb25lIGZvciB0aGUgbGFuZ3VhZ2UuJyksXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0bGlnaHQ6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlcy5pY29uLmxpZ2h0JywgJ0ljb24gcGF0aCB3aGVuIGEgbGlnaHQgdGhlbWUgaXMgdXNlZCcpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGRhcms6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmxhbmd1YWdlcy5pY29uLmRhcmsnLCAnSWNvbiBwYXRoIHdoZW4gYSBkYXJrIHRoZW1lIGlzIHVzZWQnKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH0sXG5cdGFjdGl2YXRpb25FdmVudHNHZW5lcmF0b3I6IGZ1bmN0aW9uKiAobGFuZ3VhZ2VDb250cmlidXRpb25zKSB7XG5cdFx0Zm9yIChjb25zdCBsYW5ndWFnZUNvbnRyaWJ1dGlvbiBvZiBsYW5ndWFnZUNvbnRyaWJ1dGlvbnMpIHtcblx0XHRcdGlmIChsYW5ndWFnZUNvbnRyaWJ1dGlvbi5pZCAmJiBsYW5ndWFnZUNvbnRyaWJ1dGlvbi5jb25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdHlpZWxkIGBvbkxhbmd1YWdlOiR7bGFuZ3VhZ2VDb250cmlidXRpb24uaWR9YDtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5jbGFzcyBMYW5ndWFnZVRhYmxlUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyIHtcblxuXHRyZWFkb25seSB0eXBlID0gJ3RhYmxlJztcblxuXHRzaG91bGRSZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIW1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5sYW5ndWFnZXM7XG5cdH1cblxuXHRyZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IElSZW5kZXJlZERhdGE8SVRhYmxlRGF0YT4ge1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGVzID0gbWFuaWZlc3QuY29udHJpYnV0ZXM7XG5cdFx0Y29uc3QgcmF3TGFuZ3VhZ2VzID0gY29udHJpYnV0ZXM/Lmxhbmd1YWdlcyB8fCBbXTtcblx0XHRjb25zdCBsYW5ndWFnZXM6IHsgaWQ6IHN0cmluZzsgbmFtZTogc3RyaW5nOyBleHRlbnNpb25zOiBzdHJpbmdbXTsgaGFzR3JhbW1hcjogYm9vbGVhbjsgaGFzU25pcHBldHM6IGJvb2xlYW4gfVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBsIG9mIHJhd0xhbmd1YWdlcykge1xuXHRcdFx0aWYgKGlzVmFsaWRMYW5ndWFnZUV4dGVuc2lvblBvaW50KGwpKSB7XG5cdFx0XHRcdGxhbmd1YWdlcy5wdXNoKHtcblx0XHRcdFx0XHRpZDogbC5pZCxcblx0XHRcdFx0XHRuYW1lOiAobC5hbGlhc2VzIHx8IFtdKVswXSB8fCBsLmlkLFxuXHRcdFx0XHRcdGV4dGVuc2lvbnM6IGwuZXh0ZW5zaW9ucyB8fCBbXSxcblx0XHRcdFx0XHRoYXNHcmFtbWFyOiBmYWxzZSxcblx0XHRcdFx0XHRoYXNTbmlwcGV0czogZmFsc2Vcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGJ5SWQgPSBpbmRleChsYW5ndWFnZXMsIGwgPT4gbC5pZCk7XG5cblx0XHRjb25zdCBncmFtbWFycyA9IGNvbnRyaWJ1dGVzPy5ncmFtbWFycyB8fCBbXTtcblx0XHRncmFtbWFycy5mb3JFYWNoKGdyYW1tYXIgPT4ge1xuXHRcdFx0aWYgKCFpc1N0cmluZyhncmFtbWFyLmxhbmd1YWdlKSkge1xuXHRcdFx0XHQvLyBpZ25vcmUgdGhlIGdyYW1tYXJzIHRoYXQgYXJlIG9ubHkgdXNlZCBhcyBpbmNsdWRlcyBpbiBvdGhlciBncmFtbWFyc1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsZXQgbGFuZ3VhZ2UgPSBieUlkW2dyYW1tYXIubGFuZ3VhZ2VdO1xuXG5cdFx0XHRpZiAobGFuZ3VhZ2UpIHtcblx0XHRcdFx0bGFuZ3VhZ2UuaGFzR3JhbW1hciA9IHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsYW5ndWFnZSA9IHsgaWQ6IGdyYW1tYXIubGFuZ3VhZ2UsIG5hbWU6IGdyYW1tYXIubGFuZ3VhZ2UsIGV4dGVuc2lvbnM6IFtdLCBoYXNHcmFtbWFyOiB0cnVlLCBoYXNTbmlwcGV0czogZmFsc2UgfTtcblx0XHRcdFx0YnlJZFtsYW5ndWFnZS5pZF0gPSBsYW5ndWFnZTtcblx0XHRcdFx0bGFuZ3VhZ2VzLnB1c2gobGFuZ3VhZ2UpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc25pcHBldHMgPSBjb250cmlidXRlcz8uc25pcHBldHMgfHwgW107XG5cdFx0c25pcHBldHMuZm9yRWFjaChzbmlwcGV0ID0+IHtcblx0XHRcdGlmICghaXNTdHJpbmcoc25pcHBldC5sYW5ndWFnZSkpIHtcblx0XHRcdFx0Ly8gaWdub3JlIGludmFsaWQgc25pcHBldHNcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bGV0IGxhbmd1YWdlID0gYnlJZFtzbmlwcGV0Lmxhbmd1YWdlXTtcblxuXHRcdFx0aWYgKGxhbmd1YWdlKSB7XG5cdFx0XHRcdGxhbmd1YWdlLmhhc1NuaXBwZXRzID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxhbmd1YWdlID0geyBpZDogc25pcHBldC5sYW5ndWFnZSwgbmFtZTogc25pcHBldC5sYW5ndWFnZSwgZXh0ZW5zaW9uczogW10sIGhhc0dyYW1tYXI6IGZhbHNlLCBoYXNTbmlwcGV0czogdHJ1ZSB9O1xuXHRcdFx0XHRieUlkW2xhbmd1YWdlLmlkXSA9IGxhbmd1YWdlO1xuXHRcdFx0XHRsYW5ndWFnZXMucHVzaChsYW5ndWFnZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoIWxhbmd1YWdlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7IGRhdGE6IHsgaGVhZGVyczogW10sIHJvd3M6IFtdIH0sIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBbXG5cdFx0XHRsb2NhbGl6ZSgnbGFuZ3VhZ2UgaWQnLCBcIklEXCIpLFxuXHRcdFx0bG9jYWxpemUoJ2xhbmd1YWdlIG5hbWUnLCBcIk5hbWVcIiksXG5cdFx0XHRsb2NhbGl6ZSgnZmlsZSBleHRlbnNpb25zJywgXCJGaWxlIEV4dGVuc2lvbnNcIiksXG5cdFx0XHRsb2NhbGl6ZSgnZ3JhbW1hcicsIFwiR3JhbW1hclwiKSxcblx0XHRcdGxvY2FsaXplKCdzbmlwcGV0cycsIFwiU25pcHBldHNcIilcblx0XHRdO1xuXHRcdGNvbnN0IHJvd3M6IElSb3dEYXRhW11bXSA9IGxhbmd1YWdlcy5zb3J0KChhLCBiKSA9PiBhLmlkLmxvY2FsZUNvbXBhcmUoYi5pZCkpXG5cdFx0XHQubWFwKGwgPT4ge1xuXHRcdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRcdGwuaWQsIGwubmFtZSxcblx0XHRcdFx0XHRuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bihgJHtsLmV4dGVuc2lvbnMubWFwKGUgPT4gYFxcYCR7ZX1cXGBgKS5qb2luKCcmbmJzcDsnKX1gKSxcblx0XHRcdFx0XHRsLmhhc0dyYW1tYXIgPyAnXHUyNzE0XHVGRTBFJyA6ICdcXHUyMDE0Jyxcblx0XHRcdFx0XHRsLmhhc1NuaXBwZXRzID8gJ1x1MjcxNFx1RkUwRScgOiAnXFx1MjAxNCdcblx0XHRcdFx0XTtcblx0XHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0cm93c1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdH07XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkucmVnaXN0ZXJFeHRlbnNpb25GZWF0dXJlKHtcblx0aWQ6ICdsYW5ndWFnZXMnLFxuXHRsYWJlbDogbG9jYWxpemUoJ2xhbmd1YWdlcycsIFwiUHJvZ3JhbW1pbmcgTGFuZ3VhZ2VzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoTGFuZ3VhZ2VUYWJsZVJlbmRlcmVyKSxcbn0pO1xuXG5leHBvcnQgY2xhc3MgV29ya2JlbmNoTGFuZ3VhZ2VTZXJ2aWNlIGV4dGVuZHMgTGFuZ3VhZ2VTZXJ2aWNlIHtcblx0cHJpdmF0ZSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZTtcblx0cHJpdmF0ZSBfZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoZW52aXJvbm1lbnRTZXJ2aWNlLnZlcmJvc2UgfHwgZW52aXJvbm1lbnRTZXJ2aWNlLmlzRXh0ZW5zaW9uRGV2ZWxvcG1lbnQgfHwgIWVudmlyb25tZW50U2VydmljZS5pc0J1aWx0KTtcblx0XHR0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRcdHRoaXMuX2V4dGVuc2lvblNlcnZpY2UgPSBleHRlbnNpb25TZXJ2aWNlO1xuXG5cdFx0bGFuZ3VhZ2VzRXh0UG9pbnQuc2V0SGFuZGxlcigoZXh0ZW5zaW9uczogcmVhZG9ubHkgSUV4dGVuc2lvblBvaW50VXNlcjxJUmF3TGFuZ3VhZ2VFeHRlbnNpb25Qb2ludFtdPltdKSA9PiB7XG5cdFx0XHRjb25zdCBhbGxWYWxpZExhbmd1YWdlczogSUxhbmd1YWdlRXh0ZW5zaW9uUG9pbnRbXSA9IFtdO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gZXh0ZW5zaW9ucy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb24gPSBleHRlbnNpb25zW2ldO1xuXG5cdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheShleHRlbnNpb24udmFsdWUpKSB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uLmNvbGxlY3Rvci5lcnJvcihsb2NhbGl6ZSgnaW52YWxpZCcsIFwiSW52YWxpZCBgY29udHJpYnV0ZXMuezB9YC4gRXhwZWN0ZWQgYW4gYXJyYXkuXCIsIGxhbmd1YWdlc0V4dFBvaW50Lm5hbWUpKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAobGV0IGogPSAwLCBsZW5KID0gZXh0ZW5zaW9uLnZhbHVlLmxlbmd0aDsgaiA8IGxlbko7IGorKykge1xuXHRcdFx0XHRcdGNvbnN0IGV4dCA9IGV4dGVuc2lvbi52YWx1ZVtqXTtcblx0XHRcdFx0XHRpZiAoaXNWYWxpZExhbmd1YWdlRXh0ZW5zaW9uUG9pbnQoZXh0LCBleHRlbnNpb24uY29sbGVjdG9yKSkge1xuXHRcdFx0XHRcdFx0bGV0IGNvbmZpZ3VyYXRpb246IFVSSSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdGlmIChleHQuY29uZmlndXJhdGlvbikge1xuXHRcdFx0XHRcdFx0XHRjb25maWd1cmF0aW9uID0gam9pblBhdGgoZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmV4dGVuc2lvbkxvY2F0aW9uLCBleHQuY29uZmlndXJhdGlvbik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRhbGxWYWxpZExhbmd1YWdlcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0aWQ6IGV4dC5pZCxcblx0XHRcdFx0XHRcdFx0ZXh0ZW5zaW9uczogZXh0LmV4dGVuc2lvbnMsXG5cdFx0XHRcdFx0XHRcdGZpbGVuYW1lczogZXh0LmZpbGVuYW1lcyxcblx0XHRcdFx0XHRcdFx0ZmlsZW5hbWVQYXR0ZXJuczogZXh0LmZpbGVuYW1lUGF0dGVybnMsXG5cdFx0XHRcdFx0XHRcdGZpcnN0TGluZTogZXh0LmZpcnN0TGluZSxcblx0XHRcdFx0XHRcdFx0YWxpYXNlczogZXh0LmFsaWFzZXMsXG5cdFx0XHRcdFx0XHRcdG1pbWV0eXBlczogZXh0Lm1pbWV0eXBlcyxcblx0XHRcdFx0XHRcdFx0Y29uZmlndXJhdGlvbjogY29uZmlndXJhdGlvbixcblx0XHRcdFx0XHRcdFx0aWNvbjogZXh0Lmljb24gJiYge1xuXHRcdFx0XHRcdFx0XHRcdGxpZ2h0OiBqb2luUGF0aChleHRlbnNpb24uZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24sIGV4dC5pY29uLmxpZ2h0KSxcblx0XHRcdFx0XHRcdFx0XHRkYXJrOiBqb2luUGF0aChleHRlbnNpb24uZGVzY3JpcHRpb24uZXh0ZW5zaW9uTG9jYXRpb24sIGV4dC5pY29uLmRhcmspXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9yZWdpc3RyeS5zZXREeW5hbWljTGFuZ3VhZ2VzKGFsbFZhbGlkTGFuZ3VhZ2VzKTtcblxuXHRcdH0pO1xuXG5cdFx0dGhpcy51cGRhdGVNaW1lKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oRklMRVNfQVNTT0NJQVRJT05TX0NPTkZJRykpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVNaW1lKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX2V4dGVuc2lvblNlcnZpY2Uud2hlbkluc3RhbGxlZEV4dGVuc2lvbnNSZWdpc3RlcmVkKCkudGhlbigoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZU1pbWUoKTtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMub25EaWRSZXF1ZXN0UmljaExhbmd1YWdlRmVhdHVyZXMoKGxhbmd1YWdlSWQpID0+IHtcblx0XHRcdC8vIGV4dGVuc2lvbiBhY3RpdmF0aW9uXG5cdFx0XHR0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChgb25MYW5ndWFnZToke2xhbmd1YWdlSWR9YCk7XG5cdFx0XHR0aGlzLl9leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChgb25MYW5ndWFnZWApO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlTWltZSgpOiB2b2lkIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUZpbGVzQ29uZmlndXJhdGlvbj4oKTtcblxuXHRcdC8vIENsZWFyIHVzZXIgY29uZmlndXJlZCBtaW1lIGFzc29jaWF0aW9uc1xuXHRcdGNsZWFyQ29uZmlndXJlZExhbmd1YWdlQXNzb2NpYXRpb25zKCk7XG5cblx0XHQvLyBSZWdpc3RlciBiYXNlZCBvbiBzZXR0aW5nc1xuXHRcdGlmIChjb25maWd1cmF0aW9uLmZpbGVzPy5hc3NvY2lhdGlvbnMpIHtcblx0XHRcdE9iamVjdC5rZXlzKGNvbmZpZ3VyYXRpb24uZmlsZXMuYXNzb2NpYXRpb25zKS5mb3JFYWNoKHBhdHRlcm4gPT4ge1xuXHRcdFx0XHRjb25zdCBsYW5nSWQgPSBjb25maWd1cmF0aW9uLmZpbGVzIS5hc3NvY2lhdGlvbnNbcGF0dGVybl07XG5cdFx0XHRcdGlmICh0eXBlb2YgbGFuZ0lkICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBJZ25vcmluZyBjb25maWd1cmVkICdmaWxlcy5hc3NvY2lhdGlvbnMnIGZvciAnJHtwYXR0ZXJufScgYmVjYXVzZSBpdHMgdHlwZSBpcyBub3QgYSBzdHJpbmcgYnV0ICcke3R5cGVvZiBsYW5nSWR9J2ApO1xuXG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMTQ3Mjg0XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBtaW1lVHlwZSA9IHRoaXMuZ2V0TWltZVR5cGUobGFuZ0lkKSB8fCBgdGV4dC94LSR7bGFuZ0lkfWA7XG5cblx0XHRcdFx0cmVnaXN0ZXJDb25maWd1cmVkTGFuZ3VhZ2VBc3NvY2lhdGlvbih7IGlkOiBsYW5nSWQsIG1pbWU6IG1pbWVUeXBlLCBmaWxlcGF0dGVybjogcGF0dGVybiB9KTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZE9yU3RyaW5nQXJyYXkodmFsdWU6IHN0cmluZ1tdKTogYm9vbGVhbiB7XG5cdGlmICh0eXBlb2YgdmFsdWUgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0aWYgKCFBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gdmFsdWUuZXZlcnkoaXRlbSA9PiB0eXBlb2YgaXRlbSA9PT0gJ3N0cmluZycpO1xufVxuXG5mdW5jdGlvbiBpc1ZhbGlkTGFuZ3VhZ2VFeHRlbnNpb25Qb2ludCh2YWx1ZTogYW55LCBjb2xsZWN0b3I/OiBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yKTogdmFsdWUgaXMgSVJhd0xhbmd1YWdlRXh0ZW5zaW9uUG9pbnQge1xuXHRpZiAoIXZhbHVlKSB7XG5cdFx0Y29sbGVjdG9yPy5lcnJvcihsb2NhbGl6ZSgnaW52YWxpZC5lbXB0eScsIFwiRW1wdHkgdmFsdWUgZm9yIGBjb250cmlidXRlcy57MH1gXCIsIGxhbmd1YWdlc0V4dFBvaW50Lm5hbWUpKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKHR5cGVvZiB2YWx1ZS5pZCAhPT0gJ3N0cmluZycpIHtcblx0XHRjb2xsZWN0b3I/LmVycm9yKGxvY2FsaXplKCdyZXF1aXJlLmlkJywgXCJwcm9wZXJ0eSBgezB9YCBpcyBtYW5kYXRvcnkgYW5kIG11c3QgYmUgb2YgdHlwZSBgc3RyaW5nYFwiLCAnaWQnKSk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICghaXNVbmRlZmluZWRPclN0cmluZ0FycmF5KHZhbHVlLmV4dGVuc2lvbnMpKSB7XG5cdFx0Y29sbGVjdG9yPy5lcnJvcihsb2NhbGl6ZSgnb3B0LmV4dGVuc2lvbnMnLCBcInByb3BlcnR5IGB7MH1gIGNhbiBiZSBvbWl0dGVkIGFuZCBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ1tdYFwiLCAnZXh0ZW5zaW9ucycpKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKCFpc1VuZGVmaW5lZE9yU3RyaW5nQXJyYXkodmFsdWUuZmlsZW5hbWVzKSkge1xuXHRcdGNvbGxlY3Rvcj8uZXJyb3IobG9jYWxpemUoJ29wdC5maWxlbmFtZXMnLCBcInByb3BlcnR5IGB7MH1gIGNhbiBiZSBvbWl0dGVkIGFuZCBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ1tdYFwiLCAnZmlsZW5hbWVzJykpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAodHlwZW9mIHZhbHVlLmZpcnN0TGluZSAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIHZhbHVlLmZpcnN0TGluZSAhPT0gJ3N0cmluZycpIHtcblx0XHRjb2xsZWN0b3I/LmVycm9yKGxvY2FsaXplKCdvcHQuZmlyc3RMaW5lJywgXCJwcm9wZXJ0eSBgezB9YCBjYW4gYmUgb21pdHRlZCBhbmQgbXVzdCBiZSBvZiB0eXBlIGBzdHJpbmdgXCIsICdmaXJzdExpbmUnKSk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICh0eXBlb2YgdmFsdWUuY29uZmlndXJhdGlvbiAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIHZhbHVlLmNvbmZpZ3VyYXRpb24gIT09ICdzdHJpbmcnKSB7XG5cdFx0Y29sbGVjdG9yPy5lcnJvcihsb2NhbGl6ZSgnb3B0LmNvbmZpZ3VyYXRpb24nLCBcInByb3BlcnR5IGB7MH1gIGNhbiBiZSBvbWl0dGVkIGFuZCBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ2BcIiwgJ2NvbmZpZ3VyYXRpb24nKSk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICghaXNVbmRlZmluZWRPclN0cmluZ0FycmF5KHZhbHVlLmFsaWFzZXMpKSB7XG5cdFx0Y29sbGVjdG9yPy5lcnJvcihsb2NhbGl6ZSgnb3B0LmFsaWFzZXMnLCBcInByb3BlcnR5IGB7MH1gIGNhbiBiZSBvbWl0dGVkIGFuZCBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ1tdYFwiLCAnYWxpYXNlcycpKTtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKCFpc1VuZGVmaW5lZE9yU3RyaW5nQXJyYXkodmFsdWUubWltZXR5cGVzKSkge1xuXHRcdGNvbGxlY3Rvcj8uZXJyb3IobG9jYWxpemUoJ29wdC5taW1ldHlwZXMnLCBcInByb3BlcnR5IGB7MH1gIGNhbiBiZSBvbWl0dGVkIGFuZCBtdXN0IGJlIG9mIHR5cGUgYHN0cmluZ1tdYFwiLCAnbWltZXR5cGVzJykpO1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAodHlwZW9mIHZhbHVlLmljb24gIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0aWYgKHR5cGVvZiB2YWx1ZS5pY29uICE9PSAnb2JqZWN0JyB8fCB0eXBlb2YgdmFsdWUuaWNvbi5saWdodCAhPT0gJ3N0cmluZycgfHwgdHlwZW9mIHZhbHVlLmljb24uZGFyayAhPT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbGxlY3Rvcj8uZXJyb3IobG9jYWxpemUoJ29wdC5pY29uJywgXCJwcm9wZXJ0eSBgezB9YCBjYW4gYmUgb21pdHRlZCBhbmQgbXVzdCBiZSBvZiB0eXBlIGBvYmplY3RgIHdpdGggcHJvcGVydGllcyBgezF9YCBhbmQgYHsyfWAgb2YgdHlwZSBgc3RyaW5nYFwiLCAnaWNvbicsICdsaWdodCcsICdkYXJrJykpO1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdHJ1ZTtcbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUxhbmd1YWdlU2VydmljZSwgV29ya2JlbmNoTGFuZ3VhZ2VTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUNBQXFDLDZDQUE2QztBQUMzRixTQUFTLGdCQUFnQjtBQUV6QixTQUFrQyx3QkFBd0I7QUFDMUQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQ0FBc0Q7QUFDL0QsU0FBUyx5QkFBeUI7QUFDbEMsU0FBb0MsMEJBQWdFO0FBQ3BHLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUVyRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtCQUFtSDtBQUM1SCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFjbEIsTUFBTSxvQkFBbUUs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
