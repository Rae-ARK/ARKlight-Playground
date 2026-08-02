import * as nls from "../../../../nls.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { Extensions as ColorRegistryExtensions } from "../../../../platform/theme/common/colorRegistry.js";
import { Color } from "../../../../base/common/color.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Extensions } from "../../extensionManagement/common/extensionFeatures.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
const colorRegistry = Registry.as(ColorRegistryExtensions.ColorContribution);
const colorReferenceSchema = colorRegistry.getColorReferenceSchema();
const colorIdPattern = "^\\w+[.\\w+]*$";
const configurationExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "colors",
  jsonSchema: {
    description: nls.localize("contributes.color", "Contributes extension defined themable colors"),
    type: "array",
    items: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: nls.localize("contributes.color.id", "The identifier of the themable color"),
          pattern: colorIdPattern,
          patternErrorMessage: nls.localize("contributes.color.id.format", "Identifiers must only contain letters, digits and dots and can not start with a dot")
        },
        description: {
          type: "string",
          description: nls.localize("contributes.color.description", "The description of the themable color")
        },
        defaults: {
          type: "object",
          properties: {
            light: {
              description: nls.localize("contributes.defaults.light", "The default color for light themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default."),
              type: "string",
              anyOf: [
                colorReferenceSchema,
                { type: "string", format: "color-hex" }
              ]
            },
            dark: {
              description: nls.localize("contributes.defaults.dark", "The default color for dark themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default."),
              type: "string",
              anyOf: [
                colorReferenceSchema,
                { type: "string", format: "color-hex" }
              ]
            },
            highContrast: {
              description: nls.localize("contributes.defaults.highContrast", "The default color for high contrast dark themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default. If not provided, the `dark` color is used as default for high contrast dark themes."),
              type: "string",
              anyOf: [
                colorReferenceSchema,
                { type: "string", format: "color-hex" }
              ]
            },
            highContrastLight: {
              description: nls.localize("contributes.defaults.highContrastLight", "The default color for high contrast light themes. Either a color value in hex (#RRGGBB[AA]) or the identifier of a themable color which provides the default. If not provided, the `light` color is used as default for high contrast light themes."),
              type: "string",
              anyOf: [
                colorReferenceSchema,
                { type: "string", format: "color-hex" }
              ]
            }
          },
          required: ["light", "dark"]
        }
      }
    }
  }
});
class ColorExtensionPoint {
  constructor() {
    configurationExtPoint.setHandler((extensions, delta) => {
      for (const extension of delta.added) {
        const extensionValue = extension.value;
        const collector = extension.collector;
        if (!extensionValue || !Array.isArray(extensionValue)) {
          collector.error(nls.localize("invalid.colorConfiguration", "'configuration.colors' must be a array"));
          return;
        }
        const parseColorValue = (s, name) => {
          if (s.length > 0) {
            if (s[0] === "#") {
              return Color.Format.CSS.parseHex(s);
            } else {
              return s;
            }
          }
          collector.error(nls.localize("invalid.default.colorType", "{0} must be either a color value in hex (#RRGGBB[AA] or #RGB[A]) or the identifier of a themable color which provides the default.", name));
          return Color.red;
        };
        for (const colorContribution of extensionValue) {
          if (typeof colorContribution.id !== "string" || colorContribution.id.length === 0) {
            collector.error(nls.localize("invalid.id", "'configuration.colors.id' must be defined and can not be empty"));
            return;
          }
          if (!colorContribution.id.match(colorIdPattern)) {
            collector.error(nls.localize("invalid.id.format", "'configuration.colors.id' must only contain letters, digits and dots and can not start with a dot"));
            return;
          }
          if (typeof colorContribution.description !== "string" || colorContribution.id.length === 0) {
            collector.error(nls.localize("invalid.description", "'configuration.colors.description' must be defined and can not be empty"));
            return;
          }
          const defaults = colorContribution.defaults;
          if (!defaults || typeof defaults !== "object" || typeof defaults.light !== "string" || typeof defaults.dark !== "string") {
            collector.error(nls.localize("invalid.defaults", "'configuration.colors.defaults' must be defined and must contain 'light' and 'dark'"));
            return;
          }
          if (defaults.highContrast && typeof defaults.highContrast !== "string") {
            collector.error(nls.localize("invalid.defaults.highContrast", "If defined, 'configuration.colors.defaults.highContrast' must be a string."));
            return;
          }
          if (defaults.highContrastLight && typeof defaults.highContrastLight !== "string") {
            collector.error(nls.localize("invalid.defaults.highContrastLight", "If defined, 'configuration.colors.defaults.highContrastLight' must be a string."));
            return;
          }
          colorRegistry.registerColor(colorContribution.id, {
            light: parseColorValue(defaults.light, "configuration.colors.defaults.light"),
            dark: parseColorValue(defaults.dark, "configuration.colors.defaults.dark"),
            hcDark: parseColorValue(defaults.highContrast ?? defaults.dark, "configuration.colors.defaults.highContrast"),
            hcLight: parseColorValue(defaults.highContrastLight ?? defaults.light, "configuration.colors.defaults.highContrastLight")
          }, colorContribution.description);
        }
      }
      for (const extension of delta.removed) {
        const extensionValue = extension.value;
        for (const colorContribution of extensionValue) {
          colorRegistry.deregisterColor(colorContribution.id);
        }
      }
    });
  }
}
class ColorDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.colors;
  }
  render(manifest) {
    const colors = manifest.contributes?.colors || [];
    if (!colors.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      nls.localize("id", "ID"),
      nls.localize("description", "Description"),
      nls.localize("defaultDark", "Dark Default"),
      nls.localize("defaultLight", "Light Default"),
      nls.localize("defaultHC", "High Contrast Default")
    ];
    const toColor = (colorReference) => colorReference[0] === "#" ? Color.fromHex(colorReference) : void 0;
    const rows = colors.sort((a, b) => a.id.localeCompare(b.id)).map((color) => {
      return [
        new MarkdownString().appendMarkdown(`\`${color.id}\``),
        color.description,
        toColor(color.defaults.dark) ?? new MarkdownString().appendMarkdown(`\`${color.defaults.dark}\``),
        toColor(color.defaults.light) ?? new MarkdownString().appendMarkdown(`\`${color.defaults.light}\``),
        toColor(color.defaults.highContrast) ?? new MarkdownString().appendMarkdown(`\`${color.defaults.highContrast}\``)
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
  id: "colors",
  label: nls.localize("colors", "Colors"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ColorDataRenderer)
});
export {
  ColorExtensionPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL2NvbG9yRXh0ZW5zaW9uUG9pbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29sb3JSZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBDb2xvclJlZ2lzdHJ5RXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IENvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sb3IuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIsIElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5LCBJUmVuZGVyZWREYXRhLCBJUm93RGF0YSwgSVRhYmxlRGF0YSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2V4dGVuc2lvbkZlYXR1cmVzLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcblxuaW50ZXJmYWNlIElDb2xvckV4dGVuc2lvblBvaW50IHtcblx0aWQ6IHN0cmluZztcblx0ZGVzY3JpcHRpb246IHN0cmluZztcblx0ZGVmYXVsdHM6IHsgbGlnaHQ6IHN0cmluZzsgZGFyazogc3RyaW5nOyBoaWdoQ29udHJhc3Q6IHN0cmluZzsgaGlnaENvbnRyYXN0TGlnaHQ/OiBzdHJpbmcgfTtcbn1cblxuY29uc3QgY29sb3JSZWdpc3RyeTogSUNvbG9yUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29sb3JSZWdpc3RyeT4oQ29sb3JSZWdpc3RyeUV4dGVuc2lvbnMuQ29sb3JDb250cmlidXRpb24pO1xuXG5jb25zdCBjb2xvclJlZmVyZW5jZVNjaGVtYSA9IGNvbG9yUmVnaXN0cnkuZ2V0Q29sb3JSZWZlcmVuY2VTY2hlbWEoKTtcbmNvbnN0IGNvbG9ySWRQYXR0ZXJuID0gJ15cXFxcdytbLlxcXFx3K10qJCc7XG5cbmNvbnN0IGNvbmZpZ3VyYXRpb25FeHRQb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PElDb2xvckV4dGVuc2lvblBvaW50W10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdjb2xvcnMnLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuY29sb3InLCAnQ29udHJpYnV0ZXMgZXh0ZW5zaW9uIGRlZmluZWQgdGhlbWFibGUgY29sb3JzJyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRpdGVtczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuY29sb3IuaWQnLCAnVGhlIGlkZW50aWZpZXIgb2YgdGhlIHRoZW1hYmxlIGNvbG9yJyksXG5cdFx0XHRcdFx0cGF0dGVybjogY29sb3JJZFBhdHRlcm4sXG5cdFx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5jb2xvci5pZC5mb3JtYXQnLCAnSWRlbnRpZmllcnMgbXVzdCBvbmx5IGNvbnRhaW4gbGV0dGVycywgZGlnaXRzIGFuZCBkb3RzIGFuZCBjYW4gbm90IHN0YXJ0IHdpdGggYSBkb3QnKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5jb2xvci5kZXNjcmlwdGlvbicsICdUaGUgZGVzY3JpcHRpb24gb2YgdGhlIHRoZW1hYmxlIGNvbG9yJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlZmF1bHRzOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0bGlnaHQ6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuZGVmYXVsdHMubGlnaHQnLCAnVGhlIGRlZmF1bHQgY29sb3IgZm9yIGxpZ2h0IHRoZW1lcy4gRWl0aGVyIGEgY29sb3IgdmFsdWUgaW4gaGV4ICgjUlJHR0JCW0FBXSkgb3IgdGhlIGlkZW50aWZpZXIgb2YgYSB0aGVtYWJsZSBjb2xvciB3aGljaCBwcm92aWRlcyB0aGUgZGVmYXVsdC4nKSxcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRcdGFueU9mOiBbXG5cdFx0XHRcdFx0XHRcdFx0Y29sb3JSZWZlcmVuY2VTY2hlbWEsXG5cdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnc3RyaW5nJywgZm9ybWF0OiAnY29sb3ItaGV4JyB9XG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRkYXJrOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLmRlZmF1bHRzLmRhcmsnLCAnVGhlIGRlZmF1bHQgY29sb3IgZm9yIGRhcmsgdGhlbWVzLiBFaXRoZXIgYSBjb2xvciB2YWx1ZSBpbiBoZXggKCNSUkdHQkJbQUFdKSBvciB0aGUgaWRlbnRpZmllciBvZiBhIHRoZW1hYmxlIGNvbG9yIHdoaWNoIHByb3ZpZGVzIHRoZSBkZWZhdWx0LicpLFxuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0YW55T2Y6IFtcblx0XHRcdFx0XHRcdFx0XHRjb2xvclJlZmVyZW5jZVNjaGVtYSxcblx0XHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdzdHJpbmcnLCBmb3JtYXQ6ICdjb2xvci1oZXgnIH1cblx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdGhpZ2hDb250cmFzdDoge1xuXHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5kZWZhdWx0cy5oaWdoQ29udHJhc3QnLCAnVGhlIGRlZmF1bHQgY29sb3IgZm9yIGhpZ2ggY29udHJhc3QgZGFyayB0aGVtZXMuIEVpdGhlciBhIGNvbG9yIHZhbHVlIGluIGhleCAoI1JSR0dCQltBQV0pIG9yIHRoZSBpZGVudGlmaWVyIG9mIGEgdGhlbWFibGUgY29sb3Igd2hpY2ggcHJvdmlkZXMgdGhlIGRlZmF1bHQuIElmIG5vdCBwcm92aWRlZCwgdGhlIGBkYXJrYCBjb2xvciBpcyB1c2VkIGFzIGRlZmF1bHQgZm9yIGhpZ2ggY29udHJhc3QgZGFyayB0aGVtZXMuJyksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdFx0XHRcdGNvbG9yUmVmZXJlbmNlU2NoZW1hLFxuXHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ3N0cmluZycsIGZvcm1hdDogJ2NvbG9yLWhleCcgfVxuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0aGlnaENvbnRyYXN0TGlnaHQ6IHtcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuZGVmYXVsdHMuaGlnaENvbnRyYXN0TGlnaHQnLCAnVGhlIGRlZmF1bHQgY29sb3IgZm9yIGhpZ2ggY29udHJhc3QgbGlnaHQgdGhlbWVzLiBFaXRoZXIgYSBjb2xvciB2YWx1ZSBpbiBoZXggKCNSUkdHQkJbQUFdKSBvciB0aGUgaWRlbnRpZmllciBvZiBhIHRoZW1hYmxlIGNvbG9yIHdoaWNoIHByb3ZpZGVzIHRoZSBkZWZhdWx0LiBJZiBub3QgcHJvdmlkZWQsIHRoZSBgbGlnaHRgIGNvbG9yIGlzIHVzZWQgYXMgZGVmYXVsdCBmb3IgaGlnaCBjb250cmFzdCBsaWdodCB0aGVtZXMuJyksXG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdFx0XHRcdGNvbG9yUmVmZXJlbmNlU2NoZW1hLFxuXHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ3N0cmluZycsIGZvcm1hdDogJ2NvbG9yLWhleCcgfVxuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZXF1aXJlZDogWydsaWdodCcsICdkYXJrJ11cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxufSk7XG5cbmV4cG9ydCBjbGFzcyBDb2xvckV4dGVuc2lvblBvaW50IHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRjb25maWd1cmF0aW9uRXh0UG9pbnQuc2V0SGFuZGxlcigoZXh0ZW5zaW9ucywgZGVsdGEpID0+IHtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGRlbHRhLmFkZGVkKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblZhbHVlID0gPElDb2xvckV4dGVuc2lvblBvaW50W10+ZXh0ZW5zaW9uLnZhbHVlO1xuXHRcdFx0XHRjb25zdCBjb2xsZWN0b3IgPSBleHRlbnNpb24uY29sbGVjdG9yO1xuXG5cdFx0XHRcdGlmICghZXh0ZW5zaW9uVmFsdWUgfHwgIUFycmF5LmlzQXJyYXkoZXh0ZW5zaW9uVmFsdWUpKSB7XG5cdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5jb2xvckNvbmZpZ3VyYXRpb24nLCBcIidjb25maWd1cmF0aW9uLmNvbG9ycycgbXVzdCBiZSBhIGFycmF5XCIpKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcGFyc2VDb2xvclZhbHVlID0gKHM6IHN0cmluZywgbmFtZTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0aWYgKHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0aWYgKHNbMF0gPT09ICcjJykge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gQ29sb3IuRm9ybWF0LkNTUy5wYXJzZUhleChzKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBzO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmRlZmF1bHQuY29sb3JUeXBlJywgXCJ7MH0gbXVzdCBiZSBlaXRoZXIgYSBjb2xvciB2YWx1ZSBpbiBoZXggKCNSUkdHQkJbQUFdIG9yICNSR0JbQV0pIG9yIHRoZSBpZGVudGlmaWVyIG9mIGEgdGhlbWFibGUgY29sb3Igd2hpY2ggcHJvdmlkZXMgdGhlIGRlZmF1bHQuXCIsIG5hbWUpKTtcblx0XHRcdFx0XHRyZXR1cm4gQ29sb3IucmVkO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGZvciAoY29uc3QgY29sb3JDb250cmlidXRpb24gb2YgZXh0ZW5zaW9uVmFsdWUpIHtcblx0XHRcdFx0XHRpZiAodHlwZW9mIGNvbG9yQ29udHJpYnV0aW9uLmlkICE9PSAnc3RyaW5nJyB8fCBjb2xvckNvbnRyaWJ1dGlvbi5pZC5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuaWQnLCBcIidjb25maWd1cmF0aW9uLmNvbG9ycy5pZCcgbXVzdCBiZSBkZWZpbmVkIGFuZCBjYW4gbm90IGJlIGVtcHR5XCIpKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFjb2xvckNvbnRyaWJ1dGlvbi5pZC5tYXRjaChjb2xvcklkUGF0dGVybikpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuaWQuZm9ybWF0JywgXCInY29uZmlndXJhdGlvbi5jb2xvcnMuaWQnIG11c3Qgb25seSBjb250YWluIGxldHRlcnMsIGRpZ2l0cyBhbmQgZG90cyBhbmQgY2FuIG5vdCBzdGFydCB3aXRoIGEgZG90XCIpKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBjb2xvckNvbnRyaWJ1dGlvbi5kZXNjcmlwdGlvbiAhPT0gJ3N0cmluZycgfHwgY29sb3JDb250cmlidXRpb24uaWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmRlc2NyaXB0aW9uJywgXCInY29uZmlndXJhdGlvbi5jb2xvcnMuZGVzY3JpcHRpb24nIG11c3QgYmUgZGVmaW5lZCBhbmQgY2FuIG5vdCBiZSBlbXB0eVwiKSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGRlZmF1bHRzID0gY29sb3JDb250cmlidXRpb24uZGVmYXVsdHM7XG5cdFx0XHRcdFx0aWYgKCFkZWZhdWx0cyB8fCB0eXBlb2YgZGVmYXVsdHMgIT09ICdvYmplY3QnIHx8IHR5cGVvZiBkZWZhdWx0cy5saWdodCAhPT0gJ3N0cmluZycgfHwgdHlwZW9mIGRlZmF1bHRzLmRhcmsgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmRlZmF1bHRzJywgXCInY29uZmlndXJhdGlvbi5jb2xvcnMuZGVmYXVsdHMnIG11c3QgYmUgZGVmaW5lZCBhbmQgbXVzdCBjb250YWluICdsaWdodCcgYW5kICdkYXJrJ1wiKSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChkZWZhdWx0cy5oaWdoQ29udHJhc3QgJiYgdHlwZW9mIGRlZmF1bHRzLmhpZ2hDb250cmFzdCAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuZGVmYXVsdHMuaGlnaENvbnRyYXN0JywgXCJJZiBkZWZpbmVkLCAnY29uZmlndXJhdGlvbi5jb2xvcnMuZGVmYXVsdHMuaGlnaENvbnRyYXN0JyBtdXN0IGJlIGEgc3RyaW5nLlwiKSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChkZWZhdWx0cy5oaWdoQ29udHJhc3RMaWdodCAmJiB0eXBlb2YgZGVmYXVsdHMuaGlnaENvbnRyYXN0TGlnaHQgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmRlZmF1bHRzLmhpZ2hDb250cmFzdExpZ2h0JywgXCJJZiBkZWZpbmVkLCAnY29uZmlndXJhdGlvbi5jb2xvcnMuZGVmYXVsdHMuaGlnaENvbnRyYXN0TGlnaHQnIG11c3QgYmUgYSBzdHJpbmcuXCIpKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb2xvclJlZ2lzdHJ5LnJlZ2lzdGVyQ29sb3IoY29sb3JDb250cmlidXRpb24uaWQsIHtcblx0XHRcdFx0XHRcdGxpZ2h0OiBwYXJzZUNvbG9yVmFsdWUoZGVmYXVsdHMubGlnaHQsICdjb25maWd1cmF0aW9uLmNvbG9ycy5kZWZhdWx0cy5saWdodCcpLFxuXHRcdFx0XHRcdFx0ZGFyazogcGFyc2VDb2xvclZhbHVlKGRlZmF1bHRzLmRhcmssICdjb25maWd1cmF0aW9uLmNvbG9ycy5kZWZhdWx0cy5kYXJrJyksXG5cdFx0XHRcdFx0XHRoY0Rhcms6IHBhcnNlQ29sb3JWYWx1ZShkZWZhdWx0cy5oaWdoQ29udHJhc3QgPz8gZGVmYXVsdHMuZGFyaywgJ2NvbmZpZ3VyYXRpb24uY29sb3JzLmRlZmF1bHRzLmhpZ2hDb250cmFzdCcpLFxuXHRcdFx0XHRcdFx0aGNMaWdodDogcGFyc2VDb2xvclZhbHVlKGRlZmF1bHRzLmhpZ2hDb250cmFzdExpZ2h0ID8/IGRlZmF1bHRzLmxpZ2h0LCAnY29uZmlndXJhdGlvbi5jb2xvcnMuZGVmYXVsdHMuaGlnaENvbnRyYXN0TGlnaHQnKSxcblx0XHRcdFx0XHR9LCBjb2xvckNvbnRyaWJ1dGlvbi5kZXNjcmlwdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGRlbHRhLnJlbW92ZWQpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uVmFsdWUgPSA8SUNvbG9yRXh0ZW5zaW9uUG9pbnRbXT5leHRlbnNpb24udmFsdWU7XG5cdFx0XHRcdGZvciAoY29uc3QgY29sb3JDb250cmlidXRpb24gb2YgZXh0ZW5zaW9uVmFsdWUpIHtcblx0XHRcdFx0XHRjb2xvclJlZ2lzdHJ5LmRlcmVnaXN0ZXJDb2xvcihjb2xvckNvbnRyaWJ1dGlvbi5pZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBDb2xvckRhdGFSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAndGFibGUnO1xuXG5cdHNob3VsZFJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhbWFuaWZlc3QuY29udHJpYnV0ZXM/LmNvbG9ycztcblx0fVxuXG5cdHJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogSVJlbmRlcmVkRGF0YTxJVGFibGVEYXRhPiB7XG5cdFx0Y29uc3QgY29sb3JzID0gbWFuaWZlc3QuY29udHJpYnV0ZXM/LmNvbG9ycyB8fCBbXTtcblx0XHRpZiAoIWNvbG9ycy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB7IGRhdGE6IHsgaGVhZGVyczogW10sIHJvd3M6IFtdIH0sIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBbXG5cdFx0XHRubHMubG9jYWxpemUoJ2lkJywgXCJJRFwiKSxcblx0XHRcdG5scy5sb2NhbGl6ZSgnZGVzY3JpcHRpb24nLCBcIkRlc2NyaXB0aW9uXCIpLFxuXHRcdFx0bmxzLmxvY2FsaXplKCdkZWZhdWx0RGFyaycsIFwiRGFyayBEZWZhdWx0XCIpLFxuXHRcdFx0bmxzLmxvY2FsaXplKCdkZWZhdWx0TGlnaHQnLCBcIkxpZ2h0IERlZmF1bHRcIiksXG5cdFx0XHRubHMubG9jYWxpemUoJ2RlZmF1bHRIQycsIFwiSGlnaCBDb250cmFzdCBEZWZhdWx0XCIpLFxuXHRcdF07XG5cblx0XHRjb25zdCB0b0NvbG9yID0gKGNvbG9yUmVmZXJlbmNlOiBzdHJpbmcpOiBDb2xvciB8IHVuZGVmaW5lZCA9PiBjb2xvclJlZmVyZW5jZVswXSA9PT0gJyMnID8gQ29sb3IuZnJvbUhleChjb2xvclJlZmVyZW5jZSkgOiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCByb3dzOiBJUm93RGF0YVtdW10gPSBjb2xvcnMuc29ydCgoYSwgYikgPT4gYS5pZC5sb2NhbGVDb21wYXJlKGIuaWQpKVxuXHRcdFx0Lm1hcChjb2xvciA9PiB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kTWFya2Rvd24oYFxcYCR7Y29sb3IuaWR9XFxgYCksXG5cdFx0XHRcdFx0Y29sb3IuZGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0dG9Db2xvcihjb2xvci5kZWZhdWx0cy5kYXJrKSA/PyBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bihgXFxgJHtjb2xvci5kZWZhdWx0cy5kYXJrfVxcYGApLFxuXHRcdFx0XHRcdHRvQ29sb3IoY29sb3IuZGVmYXVsdHMubGlnaHQpID8/IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZE1hcmtkb3duKGBcXGAke2NvbG9yLmRlZmF1bHRzLmxpZ2h0fVxcYGApLFxuXHRcdFx0XHRcdHRvQ29sb3IoY29sb3IuZGVmYXVsdHMuaGlnaENvbnRyYXN0KSA/PyBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bihgXFxgJHtjb2xvci5kZWZhdWx0cy5oaWdoQ29udHJhc3R9XFxgYCksXG5cdFx0XHRcdF07XG5cdFx0XHR9KTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRkYXRhOiB7XG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHRcdHJvd3Ncblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHR9O1xuXHR9XG59XG5cblJlZ2lzdHJ5LmFzPElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5PihFeHRlbnNpb25zLkV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnkpLnJlZ2lzdGVyRXh0ZW5zaW9uRmVhdHVyZSh7XG5cdGlkOiAnY29sb3JzJyxcblx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnY29sb3JzJywgXCJDb2xvcnNcIiksXG5cdGFjY2Vzczoge1xuXHRcdGNhblRvZ2dsZTogZmFsc2Vcblx0fSxcblx0cmVuZGVyZXI6IG5ldyBTeW5jRGVzY3JpcHRvcihDb2xvckRhdGFSZW5kZXJlciksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDBCQUEwQjtBQUNuQyxTQUF5QixjQUFjLCtCQUErQjtBQUN0RSxTQUFTLGFBQWE7QUFDdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxrQkFBbUg7QUFDNUgsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxzQkFBc0I7QUFRL0IsTUFBTSxnQkFBZ0MsU0FBUyxHQUFtQix3QkFBd0IsaUJBQWlCO0FBRTNHLE1BQU0sdUJBQXVCLGNBQWMsd0JBQXdCO0FBQ25FLE1BQU0saUJBQWlCO0FBRXZCLE1BQU0sd0JBQXdCLG1CQUFtQix1QkFBK0M7QUFBQSxFQUMvRixnQkFBZ0I7QUFBQSxFQUNoQixZQUFZO0FBQUEsSUFDWCxhQUFhLElBQUksU0FBUyxxQkFBcUIsK0NBQStDO0FBQUEsSUFDOUYsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ04sTUFBTTtB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
