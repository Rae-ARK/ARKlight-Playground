import * as nls from "../../../nls.js";
import { ExtensionsRegistry } from "../../services/extensions/common/extensionsRegistry.js";
import * as resources from "../../../base/common/resources.js";
import { isString } from "../../../base/common/types.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { Extensions } from "../../services/extensionManagement/common/extensionFeatures.js";
import { Registry } from "../../../platform/registry/common/platform.js";
import { SyncDescriptor } from "../../../platform/instantiation/common/descriptors.js";
import { MarkdownString } from "../../../base/common/htmlContent.js";
const configurationExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "jsonValidation",
  defaultExtensionKind: ["workspace", "web"],
  jsonSchema: {
    description: nls.localize("contributes.jsonValidation", "Contributes json schema configuration."),
    type: "array",
    defaultSnippets: [{ body: [{ fileMatch: "${1:file.json}", url: "${2:url}" }] }],
    items: {
      type: "object",
      defaultSnippets: [{ body: { fileMatch: "${1:file.json}", url: "${2:url}" } }],
      properties: {
        fileMatch: {
          type: ["string", "array"],
          description: nls.localize("contributes.jsonValidation.fileMatch", `The file pattern (or an array of patterns) to match, for example "package.json" or "*.launch". Exclusion patterns start with '!'`),
          items: {
            type: ["string"]
          }
        },
        url: {
          description: nls.localize("contributes.jsonValidation.url", "A schema URL ('http:', 'https:') or relative path to the extension folder ('./')."),
          type: "string"
        }
      }
    }
  }
});
const registryExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "jsonValidationRegistry",
  defaultExtensionKind: ["workspace", "web"],
  jsonSchema: {
    description: nls.localize("contributes.jsonValidationRegistry", "Contributes a JSON validation registry. The registry can be a dynamic resource from a filesystem provider and allows associations to change at runtime."),
    type: "array",
    defaultSnippets: [{ body: [{ url: "${1:url}" }] }],
    items: {
      type: "object",
      defaultSnippets: [{ body: { url: "${1:url}" } }],
      properties: {
        url: {
          description: nls.localize("contributes.jsonValidationRegistry.url", "A registry URI or relative path to the extension folder ('./')."),
          type: "string"
        }
      }
    }
  }
});
class JSONValidationExtensionPoint {
  constructor() {
    configurationExtPoint.setHandler((extensions) => {
      for (const extension of extensions) {
        const extensionValue = extension.value;
        const collector = extension.collector;
        const extensionLocation = extension.description.extensionLocation;
        if (!extensionValue || !Array.isArray(extensionValue)) {
          collector.error(nls.localize("invalid.jsonValidation", "'configuration.jsonValidation' must be a array"));
          return;
        }
        extensionValue.forEach((extension2) => {
          if (!isString(extension2.fileMatch) && !(Array.isArray(extension2.fileMatch) && extension2.fileMatch.every(isString))) {
            collector.error(nls.localize("invalid.fileMatch", "'configuration.jsonValidation.fileMatch' must be defined as a string or an array of strings."));
            return;
          }
          const uri = extension2.url;
          if (!isString(uri)) {
            collector.error(nls.localize("invalid.url", "'configuration.jsonValidation.url' must be a URL or relative path"));
            return;
          }
          if (uri.startsWith("./")) {
            try {
              const colorThemeLocation = resources.joinPath(extensionLocation, uri);
              if (!resources.isEqualOrParent(colorThemeLocation, extensionLocation)) {
                collector.warn(nls.localize("invalid.path.1", "Expected `contributes.{0}.url` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", configurationExtPoint.name, colorThemeLocation.toString(), extensionLocation.path));
              }
            } catch (e) {
              collector.error(nls.localize("invalid.url.fileschema", "'configuration.jsonValidation.url' is an invalid relative URL: {0}", e.message));
            }
          } else if (!/^[^:/?#]+:\/\//.test(uri)) {
            collector.error(nls.localize("invalid.url.schema", "'configuration.jsonValidation.url' must be an absolute URL or start with './'  to reference schemas located in the extension."));
            return;
          }
        });
      }
    });
    registryExtPoint.setHandler((extensions) => {
      for (const extension of extensions) {
        const catalogs = extension.value;
        const collector = extension.collector;
        const extensionLocation = extension.description.extensionLocation;
        if (!Array.isArray(catalogs)) {
          collector.error(nls.localize("invalid.jsonValidationRegistry", "'configuration.jsonValidationRegistry' must be an array"));
          continue;
        }
        for (const catalog of catalogs) {
          const uri = catalog?.url;
          if (!isString(uri)) {
            collector.error(nls.localize("invalid.jsonValidationRegistry.url", "'configuration.jsonValidationRegistry.url' must be a URI or relative path"));
            continue;
          }
          if (uri.startsWith("./")) {
            try {
              const catalogLocation = resources.joinPath(extensionLocation, uri);
              if (!resources.isEqualOrParent(catalogLocation, extensionLocation)) {
                collector.warn(nls.localize("invalid.jsonValidationRegistry.path", "Expected `contributes.{0}.url` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", registryExtPoint.name, catalogLocation.toString(), extensionLocation.path));
              }
            } catch (e) {
              collector.error(nls.localize("invalid.jsonValidationRegistry.fileschema", "'configuration.jsonValidationRegistry.url' is an invalid relative URI: {0}", e.message));
            }
          } else if (!/^[^:/?#]+:\/\//.test(uri)) {
            collector.error(nls.localize("invalid.jsonValidationRegistry.schema", "'configuration.jsonValidationRegistry.url' must be an absolute URI or start with './' to reference a registry located in the extension."));
          }
        }
      }
    });
  }
}
class JSONValidationDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.jsonValidation;
  }
  render(manifest) {
    const contrib = manifest.contributes?.jsonValidation || [];
    if (!contrib.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      nls.localize("fileMatch", "File Match"),
      nls.localize("schema", "Schema")
    ];
    const rows = contrib.map((v) => {
      return [
        new MarkdownString().appendMarkdown(`\`${Array.isArray(v.fileMatch) ? v.fileMatch.join(", ") : v.fileMatch}\``),
        v.url
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
  id: "jsonValidation",
  label: nls.localize("jsonValidation", "JSON Validation"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(JSONValidationDataRenderer)
});
export {
  JSONValidationExtensionPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2pzb25WYWxpZGF0aW9uRXh0ZW5zaW9uUG9pbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgKiBhcyByZXNvdXJjZXMgZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGlzU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIsIElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5LCBJUmVuZGVyZWREYXRhLCBJUm93RGF0YSwgSVRhYmxlRGF0YSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkZlYXR1cmVzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25NYW5pZmVzdCB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcblxuaW50ZXJmYWNlIElKU09OVmFsaWRhdGlvbkV4dGVuc2lvblBvaW50IHtcblx0ZmlsZU1hdGNoOiBzdHJpbmcgfCBzdHJpbmdbXTtcblx0dXJsOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJSlNPTlZhbGlkYXRpb25SZWdpc3RyeUV4dGVuc2lvblBvaW50IHtcblx0dXJsOiBzdHJpbmc7XG59XG5cbmNvbnN0IGNvbmZpZ3VyYXRpb25FeHRQb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PElKU09OVmFsaWRhdGlvbkV4dGVuc2lvblBvaW50W10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdqc29uVmFsaWRhdGlvbicsXG5cdGRlZmF1bHRFeHRlbnNpb25LaW5kOiBbJ3dvcmtzcGFjZScsICd3ZWInXSxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLmpzb25WYWxpZGF0aW9uJywgJ0NvbnRyaWJ1dGVzIGpzb24gc2NoZW1hIGNvbmZpZ3VyYXRpb24uJyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IFt7IGZpbGVNYXRjaDogJyR7MTpmaWxlLmpzb259JywgdXJsOiAnJHsyOnVybH0nIH1dIH1dLFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyBmaWxlTWF0Y2g6ICckezE6ZmlsZS5qc29ufScsIHVybDogJyR7Mjp1cmx9JyB9IH1dLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRmaWxlTWF0Y2g6IHtcblx0XHRcdFx0XHR0eXBlOiBbJ3N0cmluZycsICdhcnJheSddLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLmpzb25WYWxpZGF0aW9uLmZpbGVNYXRjaCcsICdUaGUgZmlsZSBwYXR0ZXJuIChvciBhbiBhcnJheSBvZiBwYXR0ZXJucykgdG8gbWF0Y2gsIGZvciBleGFtcGxlIFwicGFja2FnZS5qc29uXCIgb3IgXCIqLmxhdW5jaFwiLiBFeGNsdXNpb24gcGF0dGVybnMgc3RhcnQgd2l0aCBcXCchXFwnJyksXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6IFsnc3RyaW5nJ11cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHVybDoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLmpzb25WYWxpZGF0aW9uLnVybCcsICdBIHNjaGVtYSBVUkwgKFxcJ2h0dHA6XFwnLCBcXCdodHRwczpcXCcpIG9yIHJlbGF0aXZlIHBhdGggdG8gdGhlIGV4dGVuc2lvbiBmb2xkZXIgKFxcJy4vXFwnKS4nKSxcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuY29uc3QgcmVnaXN0cnlFeHRQb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PElKU09OVmFsaWRhdGlvblJlZ2lzdHJ5RXh0ZW5zaW9uUG9pbnRbXT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ2pzb25WYWxpZGF0aW9uUmVnaXN0cnknLFxuXHRkZWZhdWx0RXh0ZW5zaW9uS2luZDogWyd3b3Jrc3BhY2UnLCAnd2ViJ10sXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5qc29uVmFsaWRhdGlvblJlZ2lzdHJ5JywgJ0NvbnRyaWJ1dGVzIGEgSlNPTiB2YWxpZGF0aW9uIHJlZ2lzdHJ5LiBUaGUgcmVnaXN0cnkgY2FuIGJlIGEgZHluYW1pYyByZXNvdXJjZSBmcm9tIGEgZmlsZXN5c3RlbSBwcm92aWRlciBhbmQgYWxsb3dzIGFzc29jaWF0aW9ucyB0byBjaGFuZ2UgYXQgcnVudGltZS4nKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogW3sgdXJsOiAnJHsxOnVybH0nIH1dIH1dLFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyB1cmw6ICckezE6dXJsfScgfSB9XSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0dXJsOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuanNvblZhbGlkYXRpb25SZWdpc3RyeS51cmwnLCAnQSByZWdpc3RyeSBVUkkgb3IgcmVsYXRpdmUgcGF0aCB0byB0aGUgZXh0ZW5zaW9uIGZvbGRlciAoXFwnLi9cXCcpLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5leHBvcnQgY2xhc3MgSlNPTlZhbGlkYXRpb25FeHRlbnNpb25Qb2ludCB7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0Y29uZmlndXJhdGlvbkV4dFBvaW50LnNldEhhbmRsZXIoKGV4dGVuc2lvbnMpID0+IHtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGV4dGVuc2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uVmFsdWUgPSA8SUpTT05WYWxpZGF0aW9uRXh0ZW5zaW9uUG9pbnRbXT5leHRlbnNpb24udmFsdWU7XG5cdFx0XHRcdGNvbnN0IGNvbGxlY3RvciA9IGV4dGVuc2lvbi5jb2xsZWN0b3I7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkxvY2F0aW9uID0gZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmV4dGVuc2lvbkxvY2F0aW9uO1xuXG5cdFx0XHRcdGlmICghZXh0ZW5zaW9uVmFsdWUgfHwgIUFycmF5LmlzQXJyYXkoZXh0ZW5zaW9uVmFsdWUpKSB7XG5cdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5qc29uVmFsaWRhdGlvbicsIFwiJ2NvbmZpZ3VyYXRpb24uanNvblZhbGlkYXRpb24nIG11c3QgYmUgYSBhcnJheVwiKSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGV4dGVuc2lvblZhbHVlLmZvckVhY2goZXh0ZW5zaW9uID0+IHtcblx0XHRcdFx0XHRpZiAoIWlzU3RyaW5nKGV4dGVuc2lvbi5maWxlTWF0Y2gpICYmICEoQXJyYXkuaXNBcnJheShleHRlbnNpb24uZmlsZU1hdGNoKSAmJiBleHRlbnNpb24uZmlsZU1hdGNoLmV2ZXJ5KGlzU3RyaW5nKSkpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuZmlsZU1hdGNoJywgXCInY29uZmlndXJhdGlvbi5qc29uVmFsaWRhdGlvbi5maWxlTWF0Y2gnIG11c3QgYmUgZGVmaW5lZCBhcyBhIHN0cmluZyBvciBhbiBhcnJheSBvZiBzdHJpbmdzLlwiKSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHVyaSA9IGV4dGVuc2lvbi51cmw7XG5cdFx0XHRcdFx0aWYgKCFpc1N0cmluZyh1cmkpKSB7XG5cdFx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLnVybCcsIFwiJ2NvbmZpZ3VyYXRpb24uanNvblZhbGlkYXRpb24udXJsJyBtdXN0IGJlIGEgVVJMIG9yIHJlbGF0aXZlIHBhdGhcIikpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodXJpLnN0YXJ0c1dpdGgoJy4vJykpIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNvbG9yVGhlbWVMb2NhdGlvbiA9IHJlc291cmNlcy5qb2luUGF0aChleHRlbnNpb25Mb2NhdGlvbiwgdXJpKTtcblx0XHRcdFx0XHRcdFx0aWYgKCFyZXNvdXJjZXMuaXNFcXVhbE9yUGFyZW50KGNvbG9yVGhlbWVMb2NhdGlvbiwgZXh0ZW5zaW9uTG9jYXRpb24pKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29sbGVjdG9yLndhcm4obmxzLmxvY2FsaXplKCdpbnZhbGlkLnBhdGguMScsIFwiRXhwZWN0ZWQgYGNvbnRyaWJ1dGVzLnswfS51cmxgICh7MX0pIHRvIGJlIGluY2x1ZGVkIGluc2lkZSBleHRlbnNpb24ncyBmb2xkZXIgKHsyfSkuIFRoaXMgbWlnaHQgbWFrZSB0aGUgZXh0ZW5zaW9uIG5vbi1wb3J0YWJsZS5cIiwgY29uZmlndXJhdGlvbkV4dFBvaW50Lm5hbWUsIGNvbG9yVGhlbWVMb2NhdGlvbi50b1N0cmluZygpLCBleHRlbnNpb25Mb2NhdGlvbi5wYXRoKSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC51cmwuZmlsZXNjaGVtYScsIFwiJ2NvbmZpZ3VyYXRpb24uanNvblZhbGlkYXRpb24udXJsJyBpcyBhbiBpbnZhbGlkIHJlbGF0aXZlIFVSTDogezB9XCIsIGUubWVzc2FnZSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoIS9eW146Lz8jXSs6XFwvXFwvLy50ZXN0KHVyaSkpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQudXJsLnNjaGVtYScsIFwiJ2NvbmZpZ3VyYXRpb24uanNvblZhbGlkYXRpb24udXJsJyBtdXN0IGJlIGFuIGFic29sdXRlIFVSTCBvciBzdGFydCB3aXRoICcuLycgIHRvIHJlZmVyZW5jZSBzY2hlbWFzIGxvY2F0ZWQgaW4gdGhlIGV4dGVuc2lvbi5cIikpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZWdpc3RyeUV4dFBvaW50LnNldEhhbmRsZXIoZXh0ZW5zaW9ucyA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBleHRlbnNpb25zKSB7XG5cdFx0XHRcdGNvbnN0IGNhdGFsb2dzID0gZXh0ZW5zaW9uLnZhbHVlO1xuXHRcdFx0XHRjb25zdCBjb2xsZWN0b3IgPSBleHRlbnNpb24uY29sbGVjdG9yO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25Mb2NhdGlvbiA9IGV4dGVuc2lvbi5kZXNjcmlwdGlvbi5leHRlbnNpb25Mb2NhdGlvbjtcblxuXHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoY2F0YWxvZ3MpKSB7XG5cdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5qc29uVmFsaWRhdGlvblJlZ2lzdHJ5JywgXCInY29uZmlndXJhdGlvbi5qc29uVmFsaWRhdGlvblJlZ2lzdHJ5JyBtdXN0IGJlIGFuIGFycmF5XCIpKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGNhdGFsb2cgb2YgY2F0YWxvZ3MpIHtcblx0XHRcdFx0XHRjb25zdCB1cmkgPSBjYXRhbG9nPy51cmw7XG5cdFx0XHRcdFx0aWYgKCFpc1N0cmluZyh1cmkpKSB7XG5cdFx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmpzb25WYWxpZGF0aW9uUmVnaXN0cnkudXJsJywgXCInY29uZmlndXJhdGlvbi5qc29uVmFsaWRhdGlvblJlZ2lzdHJ5LnVybCcgbXVzdCBiZSBhIFVSSSBvciByZWxhdGl2ZSBwYXRoXCIpKTtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodXJpLnN0YXJ0c1dpdGgoJy4vJykpIHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGNhdGFsb2dMb2NhdGlvbiA9IHJlc291cmNlcy5qb2luUGF0aChleHRlbnNpb25Mb2NhdGlvbiwgdXJpKTtcblx0XHRcdFx0XHRcdFx0aWYgKCFyZXNvdXJjZXMuaXNFcXVhbE9yUGFyZW50KGNhdGFsb2dMb2NhdGlvbiwgZXh0ZW5zaW9uTG9jYXRpb24pKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29sbGVjdG9yLndhcm4obmxzLmxvY2FsaXplKCdpbnZhbGlkLmpzb25WYWxpZGF0aW9uUmVnaXN0cnkucGF0aCcsIFwiRXhwZWN0ZWQgYGNvbnRyaWJ1dGVzLnswfS51cmxgICh7MX0pIHRvIGJlIGluY2x1ZGVkIGluc2lkZSBleHRlbnNpb24ncyBmb2xkZXIgKHsyfSkuIFRoaXMgbWlnaHQgbWFrZSB0aGUgZXh0ZW5zaW9uIG5vbi1wb3J0YWJsZS5cIiwgcmVnaXN0cnlFeHRQb2ludC5uYW1lLCBjYXRhbG9nTG9jYXRpb24udG9TdHJpbmcoKSwgZXh0ZW5zaW9uTG9jYXRpb24ucGF0aCkpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuanNvblZhbGlkYXRpb25SZWdpc3RyeS5maWxlc2NoZW1hJywgXCInY29uZmlndXJhdGlvbi5qc29uVmFsaWRhdGlvblJlZ2lzdHJ5LnVybCcgaXMgYW4gaW52YWxpZCByZWxhdGl2ZSBVUkk6IHswfVwiLCBlLm1lc3NhZ2UpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2UgaWYgKCEvXlteOi8/I10rOlxcL1xcLy8udGVzdCh1cmkpKSB7XG5cdFx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmpzb25WYWxpZGF0aW9uUmVnaXN0cnkuc2NoZW1hJywgXCInY29uZmlndXJhdGlvbi5qc29uVmFsaWRhdGlvblJlZ2lzdHJ5LnVybCcgbXVzdCBiZSBhbiBhYnNvbHV0ZSBVUkkgb3Igc3RhcnQgd2l0aCAnLi8nIHRvIHJlZmVyZW5jZSBhIHJlZ2lzdHJ5IGxvY2F0ZWQgaW4gdGhlIGV4dGVuc2lvbi5cIikpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cbn1cblxuY2xhc3MgSlNPTlZhbGlkYXRpb25EYXRhUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyIHtcblxuXHRyZWFkb25seSB0eXBlID0gJ3RhYmxlJztcblxuXHRzaG91bGRSZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIW1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5qc29uVmFsaWRhdGlvbjtcblx0fVxuXG5cdHJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogSVJlbmRlcmVkRGF0YTxJVGFibGVEYXRhPiB7XG5cdFx0Y29uc3QgY29udHJpYiA9IG1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5qc29uVmFsaWRhdGlvbiB8fCBbXTtcblx0XHRpZiAoIWNvbnRyaWIubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4geyBkYXRhOiB7IGhlYWRlcnM6IFtdLCByb3dzOiBbXSB9LCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHR9XG5cblx0XHRjb25zdCBoZWFkZXJzID0gW1xuXHRcdFx0bmxzLmxvY2FsaXplKCdmaWxlTWF0Y2gnLCBcIkZpbGUgTWF0Y2hcIiksXG5cdFx0XHRubHMubG9jYWxpemUoJ3NjaGVtYScsIFwiU2NoZW1hXCIpLFxuXHRcdF07XG5cblx0XHRjb25zdCByb3dzOiBJUm93RGF0YVtdW10gPSBjb250cmliLm1hcCh2ID0+IHtcblx0XHRcdHJldHVybiBbXG5cdFx0XHRcdG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZE1hcmtkb3duKGBcXGAke0FycmF5LmlzQXJyYXkodi5maWxlTWF0Y2gpID8gdi5maWxlTWF0Y2guam9pbignLCAnKSA6IHYuZmlsZU1hdGNofVxcYGApLFxuXHRcdFx0XHR2LnVybCxcblx0XHRcdF07XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRyb3dzXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5yZWdpc3RlckV4dGVuc2lvbkZlYXR1cmUoe1xuXHRpZDogJ2pzb25WYWxpZGF0aW9uJyxcblx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnanNvblZhbGlkYXRpb24nLCBcIkpTT04gVmFsaWRhdGlvblwiKSxcblx0YWNjZXNzOiB7XG5cdFx0Y2FuVG9nZ2xlOiBmYWxzZVxuXHR9LFxuXHRyZW5kZXJlcjogbmV3IFN5bmNEZXNjcmlwdG9yKEpTT05WYWxpZGF0aW9uRGF0YVJlbmRlcmVyKSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsMEJBQTBCO0FBQ25DLFlBQVksZUFBZTtBQUMzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtCQUFtSDtBQUU1SCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNCQUFzQjtBQVcvQixNQUFNLHdCQUF3QixtQkFBbUIsdUJBQXdEO0FBQUEsRUFDeEcsZ0JBQWdCO0FBQUEsRUFDaEIsc0JBQXNCLENBQUMsYUFBYSxLQUFLO0FBQUEsRUFDekMsWUFBWTtBQUFBLElBQ1gsYUFBYSxJQUFJLFNBQVMsOEJBQThCLHdDQUF3QztBQUFBLElBQ2hHLE1BQU07QUFBQSxJQUNOLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxDQUFDLEVBQUUsV0FBVyxrQkFBa0IsS0FBSyxXQUFXLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDOUUsT0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04saUJBQWlCLENBQUMsRUFBRSxNQUFNLEVBQUUsV0FBVyxrQkFBa0IsS0FBSyxXQUFXLEVBQUUsQ0FBQztBQUFBLE1BQzVFLFlBQVk7QUFBQSxRQUNYLFdBQVc7QUFBQSxVQUNWLE1BQU0sQ0FBQyxVQUFVLE9BQU87QUFBQSxVQUN4QixhQUFhLElBQUksU0FBUyx3Q0FBd0Msa0lBQW9JO0FBQUEsVUFDdE0sT0FBTztBQUFBLFlBQ04sTUFBTSxDQUFDLFFBQVE7QUFBQSxVQUNoQjtBQUFBLFFBQ0Q7QUFBQSxRQUNBLEtBQUs7QUFBQSxVQUNKLGFBQWEsSUFBSSxTQUFTLGtDQUFrQyxtRkFBeUY7QUFBQSxVQUNySixNQUFNO0FBQUEsUUFDUDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNELENBQUM7QUFFRCxNQUFNLG1CQUFtQixtQkFBbUIsdUJBQWdFO0FBQUEsRUFDM0csZ0JBQWdCO0FBQUEsRUFDaEIsc0JBQXNCLENBQUMsYUFBYSxLQUFLO0FBQUEsRUFDekMsWUFBWTtBQUFBLElBQ1gsYUFBYSxJQUFJLFNBQVMsc0NBQXNDLHlKQUF5SjtBQUFBLElBQ3pOLE1BQU07QUFBQSxJQUNOLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxDQUFDLEVBQUUsS0FBSyxXQUFXLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDakQsT0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04saUJBQWlCLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxXQUFXLEVBQUUsQ0FBQztBQUFBLE1BQy9DLFlBQVk7QUFBQSxRQUNYLEtBQUs7QUFBQSxVQUNKLGFBQWEsSUFBSSxTQUFTLDBDQUEwQyxpRUFBbUU7QUFBQSxVQUN2SSxNQUFNO0FBQUEsUUFDUDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNELENBQUM7QUFFTSxNQUFNLDZCQUE2QjtBQUFBLEVBRXpDLGNBQWM7QUFDYiwwQkFBc0IsV0FBVyxDQUFDLGVBQWU7QUFDaEQsaUJBQVcsYUFBYSxZQUFZO0FBQ25DLGNBQU0saUJBQWtELFVBQVU7QUFDbEUsY0FBTSxZQUFZLFVBQVU7QUFDNUIsY0FBTSxvQkFBb0IsVUFBVSxZQUFZO0FBRWhELFlBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLFFBQVEsY0FBYyxHQUFHO0FBQ3RELG9CQUFVLE1BQU0sSUFBSSxTQUFTLDBCQUEwQixnREFBZ0QsQ0FBQztBQUN4RztBQUFBLFFBQ0Q7QUFDQSx1QkFBZSxRQUFRLENBQUFBLGVBQWE7QUFDbkMsY0FBSSxDQUFDLFNBQVNBLFdBQVUsU0FBUyxLQUFLLEVBQUUsTUFBTSxRQUFRQSxXQUFVLFNBQVMsS0FBS0EsV0FBVSxVQUFVLE1BQU0sUUFBUSxJQUFJO0FBQ25ILHNCQUFVLE1BQU0sSUFBSSxTQUFTLHFCQUFxQiw4RkFBOEYsQ0FBQztBQUNqSjtBQUFBLFVBQ0Q7QUFDQSxnQkFBTSxNQUFNQSxXQUFVO0FBQ3RCLGNBQUksQ0FBQyxTQUFTLEdBQUcsR0FBRztBQUNuQixzQkFBVSxNQUFNLElBQUksU0FBUyxlQUFlLG1FQUFtRSxDQUFDO0FBQ2hIO0FBQUEsVUFDRDtBQUNBLGNBQUksSUFBSSxXQUFXLElBQUksR0FBRztBQUN6QixnQkFBSTtBQUNILG9CQUFNLHFCQUFxQixVQUFVLFNBQVMsbUJBQW1CLEdBQUc7QUFDcEUsa0JBQUksQ0FBQyxVQUFVLGdCQUFnQixvQkFBb0IsaUJBQWlCLEdBQUc7QUFDdEUsMEJBQVUsS0FBSyxJQUFJLFNBQVMsa0JBQWtCLG9JQUFvSSxzQkFBc0IsTUFBTSxtQkFBbUIsU0FBUyxHQUFHLGtCQUFrQixJQUFJLENBQUM7QUFBQSxjQUNyUTtBQUFBLFlBQ0QsU0FBUyxHQUFHO0FBQ1gsd0JBQVUsTUFBTSxJQUFJLFNBQVMsMEJBQTBCLHNFQUFzRSxFQUFFLE9BQU8sQ0FBQztBQUFBLFlBQ3hJO0FBQUEsVUFDRCxXQUFXLENBQUMsaUJBQWlCLEtBQUssR0FBRyxHQUFHO0FBQ3ZDLHNCQUFVLE1BQU0sSUFBSSxTQUFTLHNCQUFzQiwrSEFBK0gsQ0FBQztBQUNuTDtBQUFBLFVBQ0Q7QUFBQSxRQUNELENBQUM7QUFBQSxNQUNGO0FBQUEsSUFDRCxDQUFDO0FBRUQscUJBQWlCLFdBQVcsZ0JBQWM7QUFDekMsaUJBQVcsYUFBYSxZQUFZO0FBQ25DLGNBQU0sV0FBVyxVQUFVO0FBQzNCLGNBQU0sWUFBWSxVQUFVO0FBQzVCLGNBQU0sb0JBQW9CLFVBQVUsWUFBWTtBQUVoRCxZQUFJLENBQUMsTUFBTSxRQUFRLFFBQVEsR0FBRztBQUM3QixvQkFBVSxNQUFNLElBQUksU0FBUyxrQ0FBa0MseURBQXlELENBQUM7QUFDekg7QUFBQSxRQUNEO0FBQ0EsbUJBQVcsV0FBVyxVQUFVO0FBQy9CLGdCQUFNLE1BQU0sU0FBUztBQUNyQixjQUFJLENBQUMsU0FBUyxHQUFHLEdBQUc7QUFDbkIsc0JBQVUsTUFBTSxJQUFJLFNBQVMsc0NBQXNDLDJFQUEyRSxDQUFDO0FBQy9JO0FBQUEsVUFDRDtBQUNBLGNBQUksSUFBSSxXQUFXLElBQUksR0FBRztBQUN6QixnQkFBSTtBQUNILG9CQUFNLGtCQUFrQixVQUFVLFNBQVMsbUJBQW1CLEdBQUc7QUFDakUsa0JBQUksQ0FBQyxVQUFVLGdCQUFnQixpQkFBaUIsaUJBQWlCLEdBQUc7QUFDbkUsMEJBQVUsS0FBSyxJQUFJLFNBQVMsdUNBQXVDLG9JQUFvSSxpQkFBaUIsTUFBTSxnQkFBZ0IsU0FBUyxHQUFHLGtCQUFrQixJQUFJLENBQUM7QUFBQSxjQUNsUjtBQUFBLFlBQ0QsU0FBUyxHQUFHO0FBQ1gsd0JBQVUsTUFBTSxJQUFJLFNBQVMsNkNBQTZDLDhFQUE4RSxFQUFFLE9BQU8sQ0FBQztBQUFBLFlBQ25LO0FBQUEsVUFDRCxXQUFXLENBQUMsaUJBQWlCLEtBQUssR0FBRyxHQUFHO0FBQ3ZDLHNCQUFVLE1BQU0sSUFBSSxTQUFTLHlDQUF5Qyx5SUFBeUksQ0FBQztBQUFBLFVBQ2pOO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBRUQ7QUFFQSxNQUFNLG1DQUFtQyxXQUFxRDtBQUFBLEVBQTlGO0FBQUE7QUFFQyxTQUFTLE9BQU87QUFBQTtBQUFBLEVBRWhCLGFBQWEsVUFBdUM7QUFDbkQsV0FBTyxDQUFDLENBQUMsU0FBUyxhQUFhO0FBQUEsRUFDaEM7QUFBQSxFQUVBLE9BQU8sVUFBeUQ7QUFDL0QsVUFBTSxVQUFVLFNBQVMsYUFBYSxrQkFBa0IsQ0FBQztBQUN6RCxRQUFJLENBQUMsUUFBUSxRQUFRO0FBQ3BCLGFBQU8sRUFBRSxNQUFNLEVBQUUsU0FBUyxDQUFDLEdBQUcsTUFBTSxDQUFDLEVBQUUsR0FBRyxTQUFTLE1BQU07QUFBQSxNQUFFLEVBQUU7QUFBQSxJQUM5RDtBQUVBLFVBQU0sVUFBVTtBQUFBLE1BQ2YsSUFBSSxTQUFTLGFBQWEsWUFBWTtBQUFBLE1BQ3RDLElBQUksU0FBUyxVQUFVLFFBQVE7QUFBQSxJQUNoQztBQUVBLFVBQU0sT0FBcUIsUUFBUSxJQUFJLE9BQUs7QUFDM0MsYUFBTztBQUFBLFFBQ04sSUFBSSxlQUFlLEVBQUUsZUFBZSxLQUFLLE1BQU0sUUFBUSxFQUFFLFNBQVMsSUFBSSxFQUFFLFVBQVUsS0FBSyxJQUFJLElBQUksRUFBRSxTQUFTLElBQUk7QUFBQSxRQUM5RyxFQUFFO0FBQUEsTUFDSDtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU87QUFBQSxNQUNOLE1BQU07QUFBQSxRQUNMO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFNBQVMsTUFBTTtBQUFBLE1BQUU7QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFDRDtBQUVBLFNBQVMsR0FBK0IsV0FBVyx5QkFBeUIsRUFBRSx5QkFBeUI7QUFBQSxFQUN0RyxJQUFJO0FBQUEsRUFDSixPQUFPLElBQUksU0FBUyxrQkFBa0IsaUJBQWlCO0FBQUEsRUFDdkQsUUFBUTtBQUFBLElBQ1AsV0FBVztBQUFBLEVBQ1o7QUFBQSxFQUNBLFVBQVUsSUFBSSxlQUFlLDBCQUEwQjtBQUN4RCxDQUFDOyIsCiAgIm5hbWVzIjogWyJleHRlbnNpb24iXQp9Cg==
