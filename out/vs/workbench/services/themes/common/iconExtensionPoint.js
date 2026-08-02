import * as nls from "../../../../nls.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { Extensions as IconRegistryExtensions } from "../../../../platform/theme/common/iconRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import * as resources from "../../../../base/common/resources.js";
import { extname, posix } from "../../../../base/common/path.js";
const iconRegistry = Registry.as(IconRegistryExtensions.IconContribution);
const iconReferenceSchema = iconRegistry.getIconReferenceSchema();
const iconIdPattern = `^${ThemeIcon.iconNameSegment}(-${ThemeIcon.iconNameSegment})+$`;
const iconConfigurationExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "icons",
  jsonSchema: {
    description: nls.localize("contributes.icons", "Contributes extension defined themable icons"),
    type: "object",
    propertyNames: {
      pattern: iconIdPattern,
      description: nls.localize("contributes.icon.id", "The identifier of the themable icon"),
      patternErrorMessage: nls.localize("contributes.icon.id.format", "Identifiers can only contain letters, digits and minuses and need to consist of at least two segments in the form `component-iconname`.")
    },
    additionalProperties: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: nls.localize("contributes.icon.description", "The description of the themable icon")
        },
        default: {
          anyOf: [
            iconReferenceSchema,
            {
              type: "object",
              properties: {
                fontPath: {
                  description: nls.localize("contributes.icon.default.fontPath", "The path of the icon font that defines the icon."),
                  type: "string"
                },
                fontCharacter: {
                  description: nls.localize("contributes.icon.default.fontCharacter", "The character for the icon in the icon font."),
                  type: "string"
                }
              },
              required: ["fontPath", "fontCharacter"],
              defaultSnippets: [{ body: { fontPath: "${1:myiconfont.woff}", fontCharacter: "${2:\\\\E001}" } }]
            }
          ],
          description: nls.localize("contributes.icon.default", "The default of the icon. Either a reference to an existing ThemeIcon or an icon in an icon font.")
        }
      },
      required: ["description", "default"],
      defaultSnippets: [{ body: { description: "${1:my icon}", default: { fontPath: "${2:myiconfont.woff}", fontCharacter: "${3:\\\\E001}" } } }]
    },
    defaultSnippets: [{ body: { "${1:my-icon-id}": { description: "${2:my icon}", default: { fontPath: "${3:myiconfont.woff}", fontCharacter: "${4:\\\\E001}" } } } }]
  }
});
class IconExtensionPoint {
  constructor() {
    iconConfigurationExtPoint.setHandler((extensions, delta) => {
      for (const extension of delta.added) {
        const extensionValue = extension.value;
        const collector = extension.collector;
        if (!extensionValue || typeof extensionValue !== "object") {
          collector.error(nls.localize("invalid.icons.configuration", "'configuration.icons' must be an object with the icon names as properties."));
          return;
        }
        for (const id in extensionValue) {
          if (!id.match(iconIdPattern)) {
            collector.error(nls.localize("invalid.icons.id.format", "'configuration.icons' keys represent the icon id and can only contain letter, digits and minuses. They need to consist of at least two segments in the form `component-iconname`."));
            return;
          }
          const iconContribution = extensionValue[id];
          if (typeof iconContribution.description !== "string" || iconContribution.description.length === 0) {
            collector.error(nls.localize("invalid.icons.description", "'configuration.icons.description' must be defined and can not be empty"));
            return;
          }
          const defaultIcon = iconContribution.default;
          if (typeof defaultIcon === "string") {
            iconRegistry.registerIcon(id, { id: defaultIcon }, iconContribution.description);
          } else if (typeof defaultIcon === "object" && typeof defaultIcon.fontPath === "string" && typeof defaultIcon.fontCharacter === "string") {
            const fileExt = extname(defaultIcon.fontPath).substring(1);
            const format = formatMap[fileExt];
            if (!format) {
              collector.warn(nls.localize("invalid.icons.default.fontPath.extension", "Expected `contributes.icons.default.fontPath` to have file extension 'woff', woff2' or 'ttf', is '{0}'.", fileExt));
              return;
            }
            const extensionLocation = extension.description.extensionLocation;
            const iconFontLocation = resources.joinPath(extensionLocation, defaultIcon.fontPath);
            const fontId = getFontId(extension.description, defaultIcon.fontPath);
            const definition = iconRegistry.registerIconFont(fontId, { src: [{ location: iconFontLocation, format }] });
            if (!resources.isEqualOrParent(iconFontLocation, extensionLocation)) {
              collector.warn(nls.localize("invalid.icons.default.fontPath.path", "Expected `contributes.icons.default.fontPath` ({0}) to be included inside extension's folder ({0}).", iconFontLocation.path, extensionLocation.path));
              return;
            }
            iconRegistry.registerIcon(id, {
              fontCharacter: defaultIcon.fontCharacter,
              font: {
                id: fontId,
                definition
              }
            }, iconContribution.description);
          } else {
            collector.error(nls.localize("invalid.icons.default", "'configuration.icons.default' must be either a reference to the id of an other theme icon (string) or a icon definition (object) with properties `fontPath` and `fontCharacter`."));
          }
        }
      }
      for (const extension of delta.removed) {
        const extensionValue = extension.value;
        for (const id in extensionValue) {
          iconRegistry.deregisterIcon(id);
        }
      }
    });
  }
}
const formatMap = {
  "ttf": "truetype",
  "woff": "woff",
  "woff2": "woff2"
};
function getFontId(description, fontPath) {
  return posix.join(description.identifier.value, fontPath);
}
export {
  IconExtensionPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL2ljb25FeHRlbnNpb25Qb2ludC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElJY29uUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgSWNvblJlZ2lzdHJ5RXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBleHRuYW1lLCBwb3NpeCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuXG5pbnRlcmZhY2UgSUljb25FeHRlbnNpb25Qb2ludCB7XG5cdFtpZDogc3RyaW5nXToge1xuXHRcdGRlc2NyaXB0aW9uOiBzdHJpbmc7XG5cdFx0ZGVmYXVsdDogeyBmb250UGF0aDogc3RyaW5nOyBmb250Q2hhcmFjdGVyOiBzdHJpbmcgfSB8IHN0cmluZztcblx0fTtcbn1cblxuY29uc3QgaWNvblJlZ2lzdHJ5OiBJSWNvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUljb25SZWdpc3RyeT4oSWNvblJlZ2lzdHJ5RXh0ZW5zaW9ucy5JY29uQ29udHJpYnV0aW9uKTtcblxuY29uc3QgaWNvblJlZmVyZW5jZVNjaGVtYSA9IGljb25SZWdpc3RyeS5nZXRJY29uUmVmZXJlbmNlU2NoZW1hKCk7XG5jb25zdCBpY29uSWRQYXR0ZXJuID0gYF4ke1RoZW1lSWNvbi5pY29uTmFtZVNlZ21lbnR9KC0ke1RoZW1lSWNvbi5pY29uTmFtZVNlZ21lbnR9KSskYDtcblxuY29uc3QgaWNvbkNvbmZpZ3VyYXRpb25FeHRQb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PElJY29uRXh0ZW5zaW9uUG9pbnQ+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdpY29ucycsXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5pY29ucycsICdDb250cmlidXRlcyBleHRlbnNpb24gZGVmaW5lZCB0aGVtYWJsZSBpY29ucycpLFxuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnR5TmFtZXM6IHtcblx0XHRcdHBhdHRlcm46IGljb25JZFBhdHRlcm4sXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5pY29uLmlkJywgJ1RoZSBpZGVudGlmaWVyIG9mIHRoZSB0aGVtYWJsZSBpY29uJyksXG5cdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLmljb24uaWQuZm9ybWF0JywgJ0lkZW50aWZpZXJzIGNhbiBvbmx5IGNvbnRhaW4gbGV0dGVycywgZGlnaXRzIGFuZCBtaW51c2VzIGFuZCBuZWVkIHRvIGNvbnNpc3Qgb2YgYXQgbGVhc3QgdHdvIHNlZ21lbnRzIGluIHRoZSBmb3JtIGBjb21wb25lbnQtaWNvbm5hbWVgLicpLFxuXHRcdH0sXG5cdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLmljb24uZGVzY3JpcHRpb24nLCAnVGhlIGRlc2NyaXB0aW9uIG9mIHRoZSB0aGVtYWJsZSBpY29uJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdFx0aWNvblJlZmVyZW5jZVNjaGVtYSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRmb250UGF0aDoge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuaWNvbi5kZWZhdWx0LmZvbnRQYXRoJywgJ1RoZSBwYXRoIG9mIHRoZSBpY29uIGZvbnQgdGhhdCBkZWZpbmVzIHRoZSBpY29uLicpLFxuXHRcdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdGZvbnRDaGFyYWN0ZXI6IHtcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLmljb24uZGVmYXVsdC5mb250Q2hhcmFjdGVyJywgJ1RoZSBjaGFyYWN0ZXIgZm9yIHRoZSBpY29uIGluIHRoZSBpY29uIGZvbnQuJyksXG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnZm9udFBhdGgnLCAnZm9udENoYXJhY3RlciddLFxuXHRcdFx0XHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgZm9udFBhdGg6ICckezE6bXlpY29uZm9udC53b2ZmfScsIGZvbnRDaGFyYWN0ZXI6ICckezI6XFxcXFxcXFxFMDAxfScgfSB9XVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuaWNvbi5kZWZhdWx0JywgJ1RoZSBkZWZhdWx0IG9mIHRoZSBpY29uLiBFaXRoZXIgYSByZWZlcmVuY2UgdG8gYW4gZXhpc3RpbmcgVGhlbWVJY29uIG9yIGFuIGljb24gaW4gYW4gaWNvbiBmb250LicpLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0cmVxdWlyZWQ6IFsnZGVzY3JpcHRpb24nLCAnZGVmYXVsdCddLFxuXHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IGRlc2NyaXB0aW9uOiAnJHsxOm15IGljb259JywgZGVmYXVsdDogeyBmb250UGF0aDogJyR7MjpteWljb25mb250LndvZmZ9JywgZm9udENoYXJhY3RlcjogJyR7MzpcXFxcXFxcXEUwMDF9JyB9IH0gfV1cblx0XHR9LFxuXHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyAnJHsxOm15LWljb24taWR9JzogeyBkZXNjcmlwdGlvbjogJyR7MjpteSBpY29ufScsIGRlZmF1bHQ6IHsgZm9udFBhdGg6ICckezM6bXlpY29uZm9udC53b2ZmfScsIGZvbnRDaGFyYWN0ZXI6ICckezQ6XFxcXFxcXFxFMDAxfScgfSB9IH0gfV1cblx0fVxufSk7XG5cbmV4cG9ydCBjbGFzcyBJY29uRXh0ZW5zaW9uUG9pbnQge1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdGljb25Db25maWd1cmF0aW9uRXh0UG9pbnQuc2V0SGFuZGxlcigoZXh0ZW5zaW9ucywgZGVsdGEpID0+IHtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGRlbHRhLmFkZGVkKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblZhbHVlID0gPElJY29uRXh0ZW5zaW9uUG9pbnQ+ZXh0ZW5zaW9uLnZhbHVlO1xuXHRcdFx0XHRjb25zdCBjb2xsZWN0b3IgPSBleHRlbnNpb24uY29sbGVjdG9yO1xuXG5cdFx0XHRcdGlmICghZXh0ZW5zaW9uVmFsdWUgfHwgdHlwZW9mIGV4dGVuc2lvblZhbHVlICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuaWNvbnMuY29uZmlndXJhdGlvbicsIFwiJ2NvbmZpZ3VyYXRpb24uaWNvbnMnIG11c3QgYmUgYW4gb2JqZWN0IHdpdGggdGhlIGljb24gbmFtZXMgYXMgcHJvcGVydGllcy5cIikpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3QgaWQgaW4gZXh0ZW5zaW9uVmFsdWUpIHtcblx0XHRcdFx0XHRpZiAoIWlkLm1hdGNoKGljb25JZFBhdHRlcm4pKSB7XG5cdFx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmljb25zLmlkLmZvcm1hdCcsIFwiJ2NvbmZpZ3VyYXRpb24uaWNvbnMnIGtleXMgcmVwcmVzZW50IHRoZSBpY29uIGlkIGFuZCBjYW4gb25seSBjb250YWluIGxldHRlciwgZGlnaXRzIGFuZCBtaW51c2VzLiBUaGV5IG5lZWQgdG8gY29uc2lzdCBvZiBhdCBsZWFzdCB0d28gc2VnbWVudHMgaW4gdGhlIGZvcm0gYGNvbXBvbmVudC1pY29ubmFtZWAuXCIpKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgaWNvbkNvbnRyaWJ1dGlvbiA9IGV4dGVuc2lvblZhbHVlW2lkXTtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGljb25Db250cmlidXRpb24uZGVzY3JpcHRpb24gIT09ICdzdHJpbmcnIHx8IGljb25Db250cmlidXRpb24uZGVzY3JpcHRpb24ubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmljb25zLmRlc2NyaXB0aW9uJywgXCInY29uZmlndXJhdGlvbi5pY29ucy5kZXNjcmlwdGlvbicgbXVzdCBiZSBkZWZpbmVkIGFuZCBjYW4gbm90IGJlIGVtcHR5XCIpKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgZGVmYXVsdEljb24gPSBpY29uQ29udHJpYnV0aW9uLmRlZmF1bHQ7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBkZWZhdWx0SWNvbiA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGljb25SZWdpc3RyeS5yZWdpc3Rlckljb24oaWQsIHsgaWQ6IGRlZmF1bHRJY29uIH0sIGljb25Db250cmlidXRpb24uZGVzY3JpcHRpb24pO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAodHlwZW9mIGRlZmF1bHRJY29uID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgZGVmYXVsdEljb24uZm9udFBhdGggPT09ICdzdHJpbmcnICYmIHR5cGVvZiBkZWZhdWx0SWNvbi5mb250Q2hhcmFjdGVyID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRcdFx0Y29uc3QgZmlsZUV4dCA9IGV4dG5hbWUoZGVmYXVsdEljb24uZm9udFBhdGgpLnN1YnN0cmluZygxKTtcblx0XHRcdFx0XHRcdGNvbnN0IGZvcm1hdCA9IGZvcm1hdE1hcFtmaWxlRXh0XTtcblx0XHRcdFx0XHRcdGlmICghZm9ybWF0KSB7XG5cdFx0XHRcdFx0XHRcdGNvbGxlY3Rvci53YXJuKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5pY29ucy5kZWZhdWx0LmZvbnRQYXRoLmV4dGVuc2lvbicsIFwiRXhwZWN0ZWQgYGNvbnRyaWJ1dGVzLmljb25zLmRlZmF1bHQuZm9udFBhdGhgIHRvIGhhdmUgZmlsZSBleHRlbnNpb24gJ3dvZmYnLCB3b2ZmMicgb3IgJ3R0ZicsIGlzICd7MH0nLlwiLCBmaWxlRXh0KSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkxvY2F0aW9uID0gZXh0ZW5zaW9uLmRlc2NyaXB0aW9uLmV4dGVuc2lvbkxvY2F0aW9uO1xuXHRcdFx0XHRcdFx0Y29uc3QgaWNvbkZvbnRMb2NhdGlvbiA9IHJlc291cmNlcy5qb2luUGF0aChleHRlbnNpb25Mb2NhdGlvbiwgZGVmYXVsdEljb24uZm9udFBhdGgpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZm9udElkID0gZ2V0Rm9udElkKGV4dGVuc2lvbi5kZXNjcmlwdGlvbiwgZGVmYXVsdEljb24uZm9udFBhdGgpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZGVmaW5pdGlvbiA9IGljb25SZWdpc3RyeS5yZWdpc3Rlckljb25Gb250KGZvbnRJZCwgeyBzcmM6IFt7IGxvY2F0aW9uOiBpY29uRm9udExvY2F0aW9uLCBmb3JtYXQgfV0gfSk7XG5cdFx0XHRcdFx0XHRpZiAoIXJlc291cmNlcy5pc0VxdWFsT3JQYXJlbnQoaWNvbkZvbnRMb2NhdGlvbiwgZXh0ZW5zaW9uTG9jYXRpb24pKSB7XG5cdFx0XHRcdFx0XHRcdGNvbGxlY3Rvci53YXJuKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5pY29ucy5kZWZhdWx0LmZvbnRQYXRoLnBhdGgnLCBcIkV4cGVjdGVkIGBjb250cmlidXRlcy5pY29ucy5kZWZhdWx0LmZvbnRQYXRoYCAoezB9KSB0byBiZSBpbmNsdWRlZCBpbnNpZGUgZXh0ZW5zaW9uJ3MgZm9sZGVyICh7MH0pLlwiLCBpY29uRm9udExvY2F0aW9uLnBhdGgsIGV4dGVuc2lvbkxvY2F0aW9uLnBhdGgpKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWNvblJlZ2lzdHJ5LnJlZ2lzdGVySWNvbihpZCwge1xuXHRcdFx0XHRcdFx0XHRmb250Q2hhcmFjdGVyOiBkZWZhdWx0SWNvbi5mb250Q2hhcmFjdGVyLFxuXHRcdFx0XHRcdFx0XHRmb250OiB7XG5cdFx0XHRcdFx0XHRcdFx0aWQ6IGZvbnRJZCxcblx0XHRcdFx0XHRcdFx0XHRkZWZpbml0aW9uXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0sIGljb25Db250cmlidXRpb24uZGVzY3JpcHRpb24pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmljb25zLmRlZmF1bHQnLCBcIidjb25maWd1cmF0aW9uLmljb25zLmRlZmF1bHQnIG11c3QgYmUgZWl0aGVyIGEgcmVmZXJlbmNlIHRvIHRoZSBpZCBvZiBhbiBvdGhlciB0aGVtZSBpY29uIChzdHJpbmcpIG9yIGEgaWNvbiBkZWZpbml0aW9uIChvYmplY3QpIHdpdGggcHJvcGVydGllcyBgZm9udFBhdGhgIGFuZCBgZm9udENoYXJhY3RlcmAuXCIpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGRlbHRhLnJlbW92ZWQpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uVmFsdWUgPSA8SUljb25FeHRlbnNpb25Qb2ludD5leHRlbnNpb24udmFsdWU7XG5cdFx0XHRcdGZvciAoY29uc3QgaWQgaW4gZXh0ZW5zaW9uVmFsdWUpIHtcblx0XHRcdFx0XHRpY29uUmVnaXN0cnkuZGVyZWdpc3Rlckljb24oaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cbn1cblxuY29uc3QgZm9ybWF0TWFwOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge1xuXHQndHRmJzogJ3RydWV0eXBlJyxcblx0J3dvZmYnOiAnd29mZicsXG5cdCd3b2ZmMic6ICd3b2ZmMidcbn07XG5cbmZ1bmN0aW9uIGdldEZvbnRJZChkZXNjcmlwdGlvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLCBmb250UGF0aDogc3RyaW5nKSB7XG5cdHJldHVybiBwb3NpeC5qb2luKGRlc2NyaXB0aW9uLmlkZW50aWZpZXIudmFsdWUsIGZvbnRQYXRoKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDBCQUEwQjtBQUNuQyxTQUF3QixjQUFjLDhCQUE4QjtBQUNwRSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQjtBQUMxQixZQUFZLGVBQWU7QUFFM0IsU0FBUyxTQUFTLGFBQWE7QUFTL0IsTUFBTSxlQUE4QixTQUFTLEdBQWtCLHVCQUF1QixnQkFBZ0I7QUFFdEcsTUFBTSxzQkFBc0IsYUFBYSx1QkFBdUI7QUFDaEUsTUFBTSxnQkFBZ0IsSUFBSSxVQUFVLGVBQWUsS0FBSyxVQUFVLGVBQWU7QUFFakYsTUFBTSw0QkFBNEIsbUJBQW1CLHVCQUE0QztBQUFBLEVBQ2hHLGdCQUFnQjtBQUFBLEVBQ2hCLFlBQVk7QUFBQSxJQUNYLGFBQWEsSUFBSSxTQUFTLHFCQUFxQiw4Q0FBOEM7QUFBQSxJQUM3RixNQUFNO0FBQUEsSUFDTixlQUFlO0FBQUEsTUFD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
