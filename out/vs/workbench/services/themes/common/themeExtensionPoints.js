import * as nls from "../../../../nls.js";
import * as types from "../../../../base/common/types.js";
import * as resources from "../../../../base/common/resources.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { ExtensionData, migrateThemeSettingsId } from "./workbenchThemeService.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Extensions } from "../../extensionManagement/common/extensionFeatures.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { ThemeTypeSelector } from "../../../../platform/theme/common/theme.js";
function registerColorThemeExtensionPoint() {
  return ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: "themes",
    jsonSchema: {
      description: nls.localize("vscode.extension.contributes.themes", "Contributes textmate color themes."),
      type: "array",
      items: {
        type: "object",
        defaultSnippets: [{ body: { label: "${1:label}", id: "${2:id}", uiTheme: ThemeTypeSelector.VS_DARK, path: "./themes/${3:id}.tmTheme." } }],
        properties: {
          id: {
            description: nls.localize("vscode.extension.contributes.themes.id", "Id of the color theme as used in the user settings."),
            type: "string"
          },
          label: {
            description: nls.localize("vscode.extension.contributes.themes.label", "Label of the color theme as shown in the UI."),
            type: "string"
          },
          uiTheme: {
            markdownDescription: nls.localize("vscode.extension.contributes.themes.uiTheme", "Base theme defining the colors around the editor: `vs` is the light color theme, `vs-dark` is the dark color theme. `hc-black` is the dark high contrast theme, `hc-light` is the light high contrast theme."),
            enum: [ThemeTypeSelector.VS, ThemeTypeSelector.VS_DARK, ThemeTypeSelector.HC_BLACK, ThemeTypeSelector.HC_LIGHT]
          },
          path: {
            markdownDescription: nls.localize("vscode.extension.contributes.themes.path", "Path of the tmTheme file. The path is relative to the extension folder and is typically `./colorthemes/awesome-color-theme.json`."),
            type: "string"
          }
        },
        required: ["path", "uiTheme"]
      }
    }
  });
}
function registerFileIconThemeExtensionPoint() {
  return ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: "iconThemes",
    jsonSchema: {
      description: nls.localize("vscode.extension.contributes.iconThemes", "Contributes file icon themes."),
      type: "array",
      items: {
        type: "object",
        defaultSnippets: [{ body: { id: "${1:id}", label: "${2:label}", path: "./fileicons/${3:id}-icon-theme.json" } }],
        properties: {
          id: {
            description: nls.localize("vscode.extension.contributes.iconThemes.id", "Id of the file icon theme as used in the user settings."),
            type: "string"
          },
          label: {
            description: nls.localize("vscode.extension.contributes.iconThemes.label", "Label of the file icon theme as shown in the UI."),
            type: "string"
          },
          path: {
            description: nls.localize("vscode.extension.contributes.iconThemes.path", "Path of the file icon theme definition file. The path is relative to the extension folder and is typically './fileicons/awesome-icon-theme.json'."),
            type: "string"
          }
        },
        required: ["path", "id"]
      }
    }
  });
}
function registerProductIconThemeExtensionPoint() {
  return ExtensionsRegistry.registerExtensionPoint({
    extensionPoint: "productIconThemes",
    jsonSchema: {
      description: nls.localize("vscode.extension.contributes.productIconThemes", "Contributes product icon themes."),
      type: "array",
      items: {
        type: "object",
        defaultSnippets: [{ body: { id: "${1:id}", label: "${2:label}", path: "./producticons/${3:id}-product-icon-theme.json" } }],
        properties: {
          id: {
            description: nls.localize("vscode.extension.contributes.productIconThemes.id", "Id of the product icon theme as used in the user settings."),
            type: "string"
          },
          label: {
            description: nls.localize("vscode.extension.contributes.productIconThemes.label", "Label of the product icon theme as shown in the UI."),
            type: "string"
          },
          path: {
            description: nls.localize("vscode.extension.contributes.productIconThemes.path", "Path of the product icon theme definition file. The path is relative to the extension folder and is typically './producticons/awesome-product-icon-theme.json'."),
            type: "string"
          }
        },
        required: ["path", "id"]
      }
    }
  });
}
class ThemeDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "markdown";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.themes || !!manifest.contributes?.iconThemes || !!manifest.contributes?.productIconThemes;
  }
  render(manifest) {
    const markdown = new MarkdownString();
    if (manifest.contributes?.themes) {
      markdown.appendMarkdown(`### ${nls.localize("color themes", "Color Themes")}

`);
      for (const theme of manifest.contributes.themes) {
        markdown.appendMarkdown(`- ${theme.label}
`);
      }
    }
    if (manifest.contributes?.iconThemes) {
      markdown.appendMarkdown(`### ${nls.localize("file icon themes", "File Icon Themes")}

`);
      for (const theme of manifest.contributes.iconThemes) {
        markdown.appendMarkdown(`- ${theme.label}
`);
      }
    }
    if (manifest.contributes?.productIconThemes) {
      markdown.appendMarkdown(`### ${nls.localize("product icon themes", "Product Icon Themes")}

`);
      for (const theme of manifest.contributes.productIconThemes) {
        markdown.appendMarkdown(`- ${theme.label}
`);
      }
    }
    return {
      data: markdown,
      dispose: () => {
      }
    };
  }
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "themes",
  label: nls.localize("themes", "Themes"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(ThemeDataRenderer)
});
class ThemeRegistry {
  constructor(themesExtPoint, create, idRequired = false, builtInTheme = void 0) {
    this.themesExtPoint = themesExtPoint;
    this.create = create;
    this.idRequired = idRequired;
    this.builtInTheme = builtInTheme;
    this.onDidChangeEmitter = new Emitter();
    this.onDidChange = this.onDidChangeEmitter.event;
    this.extensionThemes = [];
    this.initialize();
  }
  dispose() {
    this.themesExtPoint.setHandler(() => {
    });
    this.onDidChangeEmitter.dispose();
  }
  initialize() {
    this.themesExtPoint.setHandler((extensions, delta) => {
      const previousIds = {};
      const added = [];
      for (const theme of this.extensionThemes) {
        previousIds[theme.id] = theme;
      }
      this.extensionThemes.length = 0;
      for (const ext of extensions) {
        const extensionData = ExtensionData.fromName(ext.description.publisher, ext.description.name, ext.description.isBuiltin);
        this.onThemes(extensionData, ext.description.extensionLocation, ext.value, this.extensionThemes, ext.collector);
      }
      for (const theme of this.extensionThemes) {
        if (!previousIds[theme.id]) {
          added.push(theme);
        } else {
          delete previousIds[theme.id];
        }
      }
      const removed = Object.values(previousIds);
      this.onDidChangeEmitter.fire({ themes: this.extensionThemes, added, removed });
    });
  }
  onThemes(extensionData, extensionLocation, themeContributions, resultingThemes = [], log) {
    if (!Array.isArray(themeContributions)) {
      log?.error(nls.localize(
        "reqarray",
        "Extension point `{0}` must be an array.",
        this.themesExtPoint.name
      ));
      return resultingThemes;
    }
    themeContributions.forEach((theme) => {
      if (!theme.path || !types.isString(theme.path)) {
        log?.error(nls.localize(
          "reqpath",
          "Expected string in `contributes.{0}.path`. Provided value: {1}",
          this.themesExtPoint.name,
          String(theme.path)
        ));
        return;
      }
      if (this.idRequired && (!theme.id || !types.isString(theme.id))) {
        log?.error(nls.localize(
          "reqid",
          "Expected string in `contributes.{0}.id`. Provided value: {1}",
          this.themesExtPoint.name,
          String(theme.id)
        ));
        return;
      }
      const themeLocation = resources.joinPath(extensionLocation, theme.path);
      if (!resources.isEqualOrParent(themeLocation, extensionLocation)) {
        log?.warn(nls.localize("invalid.path.1", "Expected `contributes.{0}.path` ({1}) to be included inside extension's folder ({2}). This might make the extension non-portable.", this.themesExtPoint.name, themeLocation.path, extensionLocation.path));
      }
      const themeData = this.create(theme, themeLocation, extensionData);
      resultingThemes.push(themeData);
    });
    return resultingThemes;
  }
  findThemeById(themeId) {
    if (this.builtInTheme && this.builtInTheme.id === themeId) {
      return this.builtInTheme;
    }
    const allThemes = this.getThemes();
    for (const t of allThemes) {
      if (t.id === themeId) {
        return t;
      }
    }
    return void 0;
  }
  findThemeBySettingsId(settingsId, defaultSettingsId) {
    const migratedId = settingsId ? migrateThemeSettingsId(settingsId) : settingsId;
    if (this.builtInTheme && this.builtInTheme.settingsId === migratedId) {
      return this.builtInTheme;
    }
    const allThemes = this.getThemes();
    let defaultTheme = void 0;
    for (const t of allThemes) {
      if (t.settingsId === migratedId) {
        return t;
      }
      if (t.settingsId === defaultSettingsId) {
        defaultTheme = t;
      }
    }
    return defaultTheme;
  }
  findThemeByExtensionLocation(extLocation) {
    if (extLocation) {
      return this.getThemes().filter((t) => t.location && resources.isEqualOrParent(t.location, extLocation));
    }
    return [];
  }
  getThemes() {
    return this.extensionThemes;
  }
  getMarketplaceThemes(manifest, extensionLocation, extensionData) {
    const themes = manifest?.contributes?.[this.themesExtPoint.name];
    if (Array.isArray(themes)) {
      return this.onThemes(extensionData, extensionLocation, themes);
    }
    return [];
  }
}
export {
  ThemeRegistry,
  registerColorThemeExtensionPoint,
  registerFileIconThemeExtensionPoint,
  registerProductIconThemeExtensionPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL3RoZW1lRXh0ZW5zaW9uUG9pbnRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5cbmltcG9ydCAqIGFzIHR5cGVzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCAqIGFzIHJlc291cmNlcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uTWVzc2FnZUNvbGxlY3RvciwgSUV4dGVuc2lvblBvaW50LCBFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uRGF0YSwgSVRoZW1lRXh0ZW5zaW9uUG9pbnQsIG1pZ3JhdGVUaGVtZVNldHRpbmdzSWQgfSBmcm9tICcuL3dvcmtiZW5jaFRoZW1lU2VydmljZS5qcyc7XG5cbmltcG9ydCB7IEV2ZW50LCBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElFeHRlbnNpb25GZWF0dXJlTWFya2Rvd25SZW5kZXJlciwgSUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnksIElSZW5kZXJlZERhdGEgfSBmcm9tICcuLi8uLi9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25GZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IFRoZW1lVHlwZVNlbGVjdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29sb3JUaGVtZUV4dGVuc2lvblBvaW50KCkge1xuXHRyZXR1cm4gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SVRoZW1lRXh0ZW5zaW9uUG9pbnRbXT4oe1xuXHRcdGV4dGVuc2lvblBvaW50OiAndGhlbWVzJyxcblx0XHRqc29uU2NoZW1hOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnRoZW1lcycsICdDb250cmlidXRlcyB0ZXh0bWF0ZSBjb2xvciB0aGVtZXMuJyksXG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyBsYWJlbDogJyR7MTpsYWJlbH0nLCBpZDogJyR7MjppZH0nLCB1aVRoZW1lOiBUaGVtZVR5cGVTZWxlY3Rvci5WU19EQVJLLCBwYXRoOiAnLi90aGVtZXMvJHszOmlkfS50bVRoZW1lLicgfSB9XSxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLnRoZW1lcy5pZCcsICdJZCBvZiB0aGUgY29sb3IgdGhlbWUgYXMgdXNlZCBpbiB0aGUgdXNlciBzZXR0aW5ncy4nKSxcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRsYWJlbDoge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy50aGVtZXMubGFiZWwnLCAnTGFiZWwgb2YgdGhlIGNvbG9yIHRoZW1lIGFzIHNob3duIGluIHRoZSBVSS4nKSxcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR1aVRoZW1lOiB7XG5cdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMudGhlbWVzLnVpVGhlbWUnLCAnQmFzZSB0aGVtZSBkZWZpbmluZyB0aGUgY29sb3JzIGFyb3VuZCB0aGUgZWRpdG9yOiBgdnNgIGlzIHRoZSBsaWdodCBjb2xvciB0aGVtZSwgYHZzLWRhcmtgIGlzIHRoZSBkYXJrIGNvbG9yIHRoZW1lLiBgaGMtYmxhY2tgIGlzIHRoZSBkYXJrIGhpZ2ggY29udHJhc3QgdGhlbWUsIGBoYy1saWdodGAgaXMgdGhlIGxpZ2h0IGhpZ2ggY29udHJhc3QgdGhlbWUuJyksXG5cdFx0XHRcdFx0XHRlbnVtOiBbVGhlbWVUeXBlU2VsZWN0b3IuVlMsIFRoZW1lVHlwZVNlbGVjdG9yLlZTX0RBUkssIFRoZW1lVHlwZVNlbGVjdG9yLkhDX0JMQUNLLCBUaGVtZVR5cGVTZWxlY3Rvci5IQ19MSUdIVF1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy50aGVtZXMucGF0aCcsICdQYXRoIG9mIHRoZSB0bVRoZW1lIGZpbGUuIFRoZSBwYXRoIGlzIHJlbGF0aXZlIHRvIHRoZSBleHRlbnNpb24gZm9sZGVyIGFuZCBpcyB0eXBpY2FsbHkgYC4vY29sb3J0aGVtZXMvYXdlc29tZS1jb2xvci10aGVtZS5qc29uYC4nKSxcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXF1aXJlZDogWydwYXRoJywgJ3VpVGhlbWUnXVxuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG59XG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJGaWxlSWNvblRoZW1lRXh0ZW5zaW9uUG9pbnQoKSB7XG5cdHJldHVybiBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJVGhlbWVFeHRlbnNpb25Qb2ludFtdPih7XG5cdFx0ZXh0ZW5zaW9uUG9pbnQ6ICdpY29uVGhlbWVzJyxcblx0XHRqc29uU2NoZW1hOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmljb25UaGVtZXMnLCAnQ29udHJpYnV0ZXMgZmlsZSBpY29uIHRoZW1lcy4nKSxcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IGlkOiAnJHsxOmlkfScsIGxhYmVsOiAnJHsyOmxhYmVsfScsIHBhdGg6ICcuL2ZpbGVpY29ucy8kezM6aWR9LWljb24tdGhlbWUuanNvbicgfSB9XSxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmljb25UaGVtZXMuaWQnLCAnSWQgb2YgdGhlIGZpbGUgaWNvbiB0aGVtZSBhcyB1c2VkIGluIHRoZSB1c2VyIHNldHRpbmdzLicpLFxuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGxhYmVsOiB7XG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmljb25UaGVtZXMubGFiZWwnLCAnTGFiZWwgb2YgdGhlIGZpbGUgaWNvbiB0aGVtZSBhcyBzaG93biBpbiB0aGUgVUkuJyksXG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5pY29uVGhlbWVzLnBhdGgnLCAnUGF0aCBvZiB0aGUgZmlsZSBpY29uIHRoZW1lIGRlZmluaXRpb24gZmlsZS4gVGhlIHBhdGggaXMgcmVsYXRpdmUgdG8gdGhlIGV4dGVuc2lvbiBmb2xkZXIgYW5kIGlzIHR5cGljYWxseSBcXCcuL2ZpbGVpY29ucy9hd2Vzb21lLWljb24tdGhlbWUuanNvblxcJy4nKSxcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXF1aXJlZDogWydwYXRoJywgJ2lkJ11cblx0XHRcdH1cblx0XHR9XG5cdH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJQcm9kdWN0SWNvblRoZW1lRXh0ZW5zaW9uUG9pbnQoKSB7XG5cdHJldHVybiBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJVGhlbWVFeHRlbnNpb25Qb2ludFtdPih7XG5cdFx0ZXh0ZW5zaW9uUG9pbnQ6ICdwcm9kdWN0SWNvblRoZW1lcycsXG5cdFx0anNvblNjaGVtYToge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5wcm9kdWN0SWNvblRoZW1lcycsICdDb250cmlidXRlcyBwcm9kdWN0IGljb24gdGhlbWVzLicpLFxuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IHsgaWQ6ICckezE6aWR9JywgbGFiZWw6ICckezI6bGFiZWx9JywgcGF0aDogJy4vcHJvZHVjdGljb25zLyR7MzppZH0tcHJvZHVjdC1pY29uLXRoZW1lLmpzb24nIH0gfV0sXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRpZDoge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5wcm9kdWN0SWNvblRoZW1lcy5pZCcsICdJZCBvZiB0aGUgcHJvZHVjdCBpY29uIHRoZW1lIGFzIHVzZWQgaW4gdGhlIHVzZXIgc2V0dGluZ3MuJyksXG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0bGFiZWw6IHtcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMucHJvZHVjdEljb25UaGVtZXMubGFiZWwnLCAnTGFiZWwgb2YgdGhlIHByb2R1Y3QgaWNvbiB0aGVtZSBhcyBzaG93biBpbiB0aGUgVUkuJyksXG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cGF0aDoge1xuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5wcm9kdWN0SWNvblRoZW1lcy5wYXRoJywgJ1BhdGggb2YgdGhlIHByb2R1Y3QgaWNvbiB0aGVtZSBkZWZpbml0aW9uIGZpbGUuIFRoZSBwYXRoIGlzIHJlbGF0aXZlIHRvIHRoZSBleHRlbnNpb24gZm9sZGVyIGFuZCBpcyB0eXBpY2FsbHkgXFwnLi9wcm9kdWN0aWNvbnMvYXdlc29tZS1wcm9kdWN0LWljb24tdGhlbWUuanNvblxcJy4nKSxcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXF1aXJlZDogWydwYXRoJywgJ2lkJ11cblx0XHRcdH1cblx0XHR9XG5cdH0pO1xufVxuXG5jbGFzcyBUaGVtZURhdGFSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uRmVhdHVyZU1hcmtkb3duUmVuZGVyZXIge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAnbWFya2Rvd24nO1xuXG5cdHNob3VsZFJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhbWFuaWZlc3QuY29udHJpYnV0ZXM/LnRoZW1lcyB8fCAhIW1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5pY29uVGhlbWVzIHx8ICEhbWFuaWZlc3QuY29udHJpYnV0ZXM/LnByb2R1Y3RJY29uVGhlbWVzO1xuXHR9XG5cblx0cmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBJUmVuZGVyZWREYXRhPElNYXJrZG93blN0cmluZz4ge1xuXHRcdGNvbnN0IG1hcmtkb3duID0gbmV3IE1hcmtkb3duU3RyaW5nKCk7XG5cdFx0aWYgKG1hbmlmZXN0LmNvbnRyaWJ1dGVzPy50aGVtZXMpIHtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAjIyMgJHtubHMubG9jYWxpemUoJ2NvbG9yIHRoZW1lcycsIFwiQ29sb3IgVGhlbWVzXCIpfVxcblxcbmApO1xuXHRcdFx0Zm9yIChjb25zdCB0aGVtZSBvZiBtYW5pZmVzdC5jb250cmlidXRlcy50aGVtZXMpIHtcblx0XHRcdFx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYC0gJHt0aGVtZS5sYWJlbH1cXG5gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKG1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5pY29uVGhlbWVzKSB7XG5cdFx0XHRtYXJrZG93bi5hcHBlbmRNYXJrZG93bihgIyMjICR7bmxzLmxvY2FsaXplKCdmaWxlIGljb24gdGhlbWVzJywgXCJGaWxlIEljb24gVGhlbWVzXCIpfVxcblxcbmApO1xuXHRcdFx0Zm9yIChjb25zdCB0aGVtZSBvZiBtYW5pZmVzdC5jb250cmlidXRlcy5pY29uVGhlbWVzKSB7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAtICR7dGhlbWUubGFiZWx9XFxuYCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmIChtYW5pZmVzdC5jb250cmlidXRlcz8ucHJvZHVjdEljb25UaGVtZXMpIHtcblx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAjIyMgJHtubHMubG9jYWxpemUoJ3Byb2R1Y3QgaWNvbiB0aGVtZXMnLCBcIlByb2R1Y3QgSWNvbiBUaGVtZXNcIil9XFxuXFxuYCk7XG5cdFx0XHRmb3IgKGNvbnN0IHRoZW1lIG9mIG1hbmlmZXN0LmNvbnRyaWJ1dGVzLnByb2R1Y3RJY29uVGhlbWVzKSB7XG5cdFx0XHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAtICR7dGhlbWUubGFiZWx9XFxuYCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRkYXRhOiBtYXJrZG93bixcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgLyogbm9vcCAqLyB9XG5cdFx0fTtcblx0fVxufVxuXG5SZWdpc3RyeS5hczxJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeT4oRXh0ZW5zaW9ucy5FeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5KS5yZWdpc3RlckV4dGVuc2lvbkZlYXR1cmUoe1xuXHRpZDogJ3RoZW1lcycsXG5cdGxhYmVsOiBubHMubG9jYWxpemUoJ3RoZW1lcycsIFwiVGhlbWVzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoVGhlbWVEYXRhUmVuZGVyZXIpLFxufSk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgVGhlbWVDaGFuZ2VFdmVudDxUPiB7XG5cdHRoZW1lczogVFtdO1xuXHRhZGRlZDogVFtdO1xuXHRyZW1vdmVkOiBUW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVRoZW1lRGF0YSB7XG5cdGlkOiBzdHJpbmc7XG5cdHNldHRpbmdzSWQ6IHN0cmluZyB8IG51bGw7XG5cdGxvY2F0aW9uPzogVVJJO1xufVxuXG5leHBvcnQgY2xhc3MgVGhlbWVSZWdpc3RyeTxUIGV4dGVuZHMgSVRoZW1lRGF0YT4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBleHRlbnNpb25UaGVtZXM6IFRbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRW1pdHRlciA9IG5ldyBFbWl0dGVyPFRoZW1lQ2hhbmdlRXZlbnQ8VD4+KCk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8VGhlbWVDaGFuZ2VFdmVudDxUPj4gPSB0aGlzLm9uRGlkQ2hhbmdlRW1pdHRlci5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRoZW1lc0V4dFBvaW50OiBJRXh0ZW5zaW9uUG9pbnQ8SVRoZW1lRXh0ZW5zaW9uUG9pbnRbXT4sXG5cdFx0cHJpdmF0ZSBjcmVhdGU6ICh0aGVtZTogSVRoZW1lRXh0ZW5zaW9uUG9pbnQsIHRoZW1lTG9jYXRpb246IFVSSSwgZXh0ZW5zaW9uRGF0YTogRXh0ZW5zaW9uRGF0YSkgPT4gVCxcblx0XHRwcml2YXRlIGlkUmVxdWlyZWQgPSBmYWxzZSxcblx0XHRwcml2YXRlIGJ1aWx0SW5UaGVtZTogVCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZFxuXHQpIHtcblx0XHR0aGlzLmV4dGVuc2lvblRoZW1lcyA9IFtdO1xuXHRcdHRoaXMuaW5pdGlhbGl6ZSgpO1xuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLnRoZW1lc0V4dFBvaW50LnNldEhhbmRsZXIoKCkgPT4geyB9KTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlRW1pdHRlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGluaXRpYWxpemUoKSB7XG5cdFx0dGhpcy50aGVtZXNFeHRQb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zLCBkZWx0YSkgPT4ge1xuXHRcdFx0Y29uc3QgcHJldmlvdXNJZHM6IHsgW2tleTogc3RyaW5nXTogVCB9ID0ge307XG5cblx0XHRcdGNvbnN0IGFkZGVkOiBUW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3QgdGhlbWUgb2YgdGhpcy5leHRlbnNpb25UaGVtZXMpIHtcblx0XHRcdFx0cHJldmlvdXNJZHNbdGhlbWUuaWRdID0gdGhlbWU7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmV4dGVuc2lvblRoZW1lcy5sZW5ndGggPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBleHQgb2YgZXh0ZW5zaW9ucykge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25EYXRhID0gRXh0ZW5zaW9uRGF0YS5mcm9tTmFtZShleHQuZGVzY3JpcHRpb24ucHVibGlzaGVyLCBleHQuZGVzY3JpcHRpb24ubmFtZSwgZXh0LmRlc2NyaXB0aW9uLmlzQnVpbHRpbik7XG5cdFx0XHRcdHRoaXMub25UaGVtZXMoZXh0ZW5zaW9uRGF0YSwgZXh0LmRlc2NyaXB0aW9uLmV4dGVuc2lvbkxvY2F0aW9uLCBleHQudmFsdWUsIHRoaXMuZXh0ZW5zaW9uVGhlbWVzLCBleHQuY29sbGVjdG9yKTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgdGhlbWUgb2YgdGhpcy5leHRlbnNpb25UaGVtZXMpIHtcblx0XHRcdFx0aWYgKCFwcmV2aW91c0lkc1t0aGVtZS5pZF0pIHtcblx0XHRcdFx0XHRhZGRlZC5wdXNoKHRoZW1lKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkZWxldGUgcHJldmlvdXNJZHNbdGhlbWUuaWRdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByZW1vdmVkID0gT2JqZWN0LnZhbHVlcyhwcmV2aW91c0lkcyk7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlRW1pdHRlci5maXJlKHsgdGhlbWVzOiB0aGlzLmV4dGVuc2lvblRoZW1lcywgYWRkZWQsIHJlbW92ZWQgfSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIG9uVGhlbWVzKGV4dGVuc2lvbkRhdGE6IEV4dGVuc2lvbkRhdGEsIGV4dGVuc2lvbkxvY2F0aW9uOiBVUkksIHRoZW1lQ29udHJpYnV0aW9uczogSVRoZW1lRXh0ZW5zaW9uUG9pbnRbXSwgcmVzdWx0aW5nVGhlbWVzOiBUW10gPSBbXSwgbG9nPzogRXh0ZW5zaW9uTWVzc2FnZUNvbGxlY3Rvcik6IFRbXSB7XG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHRoZW1lQ29udHJpYnV0aW9ucykpIHtcblx0XHRcdGxvZz8uZXJyb3IobmxzLmxvY2FsaXplKFxuXHRcdFx0XHQncmVxYXJyYXknLFxuXHRcdFx0XHRcIkV4dGVuc2lvbiBwb2ludCBgezB9YCBtdXN0IGJlIGFuIGFycmF5LlwiLFxuXHRcdFx0XHR0aGlzLnRoZW1lc0V4dFBvaW50Lm5hbWVcblx0XHRcdCkpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdGluZ1RoZW1lcztcblx0XHR9XG5cdFx0dGhlbWVDb250cmlidXRpb25zLmZvckVhY2godGhlbWUgPT4ge1xuXHRcdFx0aWYgKCF0aGVtZS5wYXRoIHx8ICF0eXBlcy5pc1N0cmluZyh0aGVtZS5wYXRoKSkge1xuXHRcdFx0XHRsb2c/LmVycm9yKG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHQncmVxcGF0aCcsXG5cdFx0XHRcdFx0XCJFeHBlY3RlZCBzdHJpbmcgaW4gYGNvbnRyaWJ1dGVzLnswfS5wYXRoYC4gUHJvdmlkZWQgdmFsdWU6IHsxfVwiLFxuXHRcdFx0XHRcdHRoaXMudGhlbWVzRXh0UG9pbnQubmFtZSxcblx0XHRcdFx0XHRTdHJpbmcodGhlbWUucGF0aClcblx0XHRcdFx0KSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmlkUmVxdWlyZWQgJiYgKCF0aGVtZS5pZCB8fCAhdHlwZXMuaXNTdHJpbmcodGhlbWUuaWQpKSkge1xuXHRcdFx0XHRsb2c/LmVycm9yKG5scy5sb2NhbGl6ZShcblx0XHRcdFx0XHQncmVxaWQnLFxuXHRcdFx0XHRcdFwiRXhwZWN0ZWQgc3RyaW5nIGluIGBjb250cmlidXRlcy57MH0uaWRgLiBQcm92aWRlZCB2YWx1ZTogezF9XCIsXG5cdFx0XHRcdFx0dGhpcy50aGVtZXNFeHRQb2ludC5uYW1lLFxuXHRcdFx0XHRcdFN0cmluZyh0aGVtZS5pZClcblx0XHRcdFx0KSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGhlbWVMb2NhdGlvbiA9IHJlc291cmNlcy5qb2luUGF0aChleHRlbnNpb25Mb2NhdGlvbiwgdGhlbWUucGF0aCk7XG5cdFx0XHRpZiAoIXJlc291cmNlcy5pc0VxdWFsT3JQYXJlbnQodGhlbWVMb2NhdGlvbiwgZXh0ZW5zaW9uTG9jYXRpb24pKSB7XG5cdFx0XHRcdGxvZz8ud2FybihubHMubG9jYWxpemUoJ2ludmFsaWQucGF0aC4xJywgXCJFeHBlY3RlZCBgY29udHJpYnV0ZXMuezB9LnBhdGhgICh7MX0pIHRvIGJlIGluY2x1ZGVkIGluc2lkZSBleHRlbnNpb24ncyBmb2xkZXIgKHsyfSkuIFRoaXMgbWlnaHQgbWFrZSB0aGUgZXh0ZW5zaW9uIG5vbi1wb3J0YWJsZS5cIiwgdGhpcy50aGVtZXNFeHRQb2ludC5uYW1lLCB0aGVtZUxvY2F0aW9uLnBhdGgsIGV4dGVuc2lvbkxvY2F0aW9uLnBhdGgpKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGhlbWVEYXRhID0gdGhpcy5jcmVhdGUodGhlbWUsIHRoZW1lTG9jYXRpb24sIGV4dGVuc2lvbkRhdGEpO1xuXHRcdFx0cmVzdWx0aW5nVGhlbWVzLnB1c2godGhlbWVEYXRhKTtcblx0XHR9KTtcblx0XHRyZXR1cm4gcmVzdWx0aW5nVGhlbWVzO1xuXHR9XG5cblx0cHVibGljIGZpbmRUaGVtZUJ5SWQodGhlbWVJZDogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuYnVpbHRJblRoZW1lICYmIHRoaXMuYnVpbHRJblRoZW1lLmlkID09PSB0aGVtZUlkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5idWlsdEluVGhlbWU7XG5cdFx0fVxuXHRcdGNvbnN0IGFsbFRoZW1lcyA9IHRoaXMuZ2V0VGhlbWVzKCk7XG5cdFx0Zm9yIChjb25zdCB0IG9mIGFsbFRoZW1lcykge1xuXHRcdFx0aWYgKHQuaWQgPT09IHRoZW1lSWQpIHtcblx0XHRcdFx0cmV0dXJuIHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwdWJsaWMgZmluZFRoZW1lQnlTZXR0aW5nc0lkKHNldHRpbmdzSWQ6IHN0cmluZyB8IG51bGwsIGRlZmF1bHRTZXR0aW5nc0lkPzogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgbWlncmF0ZWRJZCA9IHNldHRpbmdzSWQgPyBtaWdyYXRlVGhlbWVTZXR0aW5nc0lkKHNldHRpbmdzSWQpIDogc2V0dGluZ3NJZDtcblx0XHRpZiAodGhpcy5idWlsdEluVGhlbWUgJiYgdGhpcy5idWlsdEluVGhlbWUuc2V0dGluZ3NJZCA9PT0gbWlncmF0ZWRJZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuYnVpbHRJblRoZW1lO1xuXHRcdH1cblx0XHRjb25zdCBhbGxUaGVtZXMgPSB0aGlzLmdldFRoZW1lcygpO1xuXHRcdGxldCBkZWZhdWx0VGhlbWU6IFQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCB0IG9mIGFsbFRoZW1lcykge1xuXHRcdFx0aWYgKHQuc2V0dGluZ3NJZCA9PT0gbWlncmF0ZWRJZCkge1xuXHRcdFx0XHRyZXR1cm4gdDtcblx0XHRcdH1cblx0XHRcdGlmICh0LnNldHRpbmdzSWQgPT09IGRlZmF1bHRTZXR0aW5nc0lkKSB7XG5cdFx0XHRcdGRlZmF1bHRUaGVtZSA9IHQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBkZWZhdWx0VGhlbWU7XG5cdH1cblxuXHRwdWJsaWMgZmluZFRoZW1lQnlFeHRlbnNpb25Mb2NhdGlvbihleHRMb2NhdGlvbjogVVJJIHwgdW5kZWZpbmVkKTogVFtdIHtcblx0XHRpZiAoZXh0TG9jYXRpb24pIHtcblx0XHRcdHJldHVybiB0aGlzLmdldFRoZW1lcygpLmZpbHRlcih0ID0+IHQubG9jYXRpb24gJiYgcmVzb3VyY2VzLmlzRXF1YWxPclBhcmVudCh0LmxvY2F0aW9uLCBleHRMb2NhdGlvbikpO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwdWJsaWMgZ2V0VGhlbWVzKCk6IFRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZXh0ZW5zaW9uVGhlbWVzO1xuXHR9XG5cblx0cHVibGljIGdldE1hcmtldHBsYWNlVGhlbWVzKG1hbmlmZXN0OiBhbnksIGV4dGVuc2lvbkxvY2F0aW9uOiBVUkksIGV4dGVuc2lvbkRhdGE6IEV4dGVuc2lvbkRhdGEpOiBUW10ge1xuXHRcdGNvbnN0IHRoZW1lcyA9IG1hbmlmZXN0Py5jb250cmlidXRlcz8uW3RoaXMudGhlbWVzRXh0UG9pbnQubmFtZV07XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodGhlbWVzKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMub25UaGVtZXMoZXh0ZW5zaW9uRGF0YSwgZXh0ZW5zaW9uTG9jYXRpb24sIHRoZW1lcyk7XG5cdFx0fVxuXHRcdHJldHVybiBbXTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxZQUFZLFNBQVM7QUFFckIsWUFBWSxXQUFXO0FBQ3ZCLFlBQVksZUFBZTtBQUMzQixTQUFxRCwwQkFBMEI7QUFDL0UsU0FBUyxlQUFxQyw4QkFBOEI7QUFFNUUsU0FBZ0IsZUFBZTtBQUUvQixTQUFTLGtCQUErQjtBQUN4QyxTQUFTLGtCQUFnRztBQUV6RyxTQUEwQixzQkFBc0I7QUFDaEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFFM0IsU0FBUyxtQ0FBbUM7QUFDbEQsU0FBTyxtQkFBbUIsdUJBQStDO0FBQUEsSUFDeEUsZ0JBQWdCO0FBQUEsSUFDaEIsWUFBWTtBQUFBLE1BQ1gsYUFBYSxJQUFJLFNBQVMsdUNBQXVDLG9DQUFvQztBQUFBLE1BQ3JHLE1BQU07QUFBQSxNQUNOLE9BQU87QUFBQSxRQUNOLE1BQU07QUFBQSxRQUNOLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8sY0FBYyxJQUFJLFdBQVcsU0FBUyxrQkFBa0IsU0FBUyxNQUFNLDRCQUE0QixFQUFFLENBQUM7QUFBQSxRQUN6SSxZQUFZO0FBQUEsVUFDWCxJ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
