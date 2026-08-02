import * as nls from "../../../../nls.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { fontWeightRegex, fontStyleRegex, fontSizeRegex, fontIdRegex, fontColorRegex, fontIdErrorMessage } from "../../../../platform/theme/common/iconRegistry.js";
const schemaId = "vscode://schemas/icon-theme";
const schema = {
  type: "object",
  allowComments: true,
  allowTrailingCommas: true,
  definitions: {
    folderExpanded: {
      type: "string",
      description: nls.localize("schema.folderExpanded", "The folder icon for expanded folders. The expanded folder icon is optional. If not set, the icon defined for folder will be shown.")
    },
    folder: {
      type: "string",
      description: nls.localize("schema.folder", "The folder icon for collapsed folders, and if folderExpanded is not set, also for expanded folders.")
    },
    file: {
      type: "string",
      description: nls.localize("schema.file", "The default file icon, shown for all files that don't match any extension, filename or language id.")
    },
    rootFolder: {
      type: "string",
      description: nls.localize("schema.rootFolder", "The folder icon for collapsed root folders, and if rootFolderExpanded is not set, also for expanded root folders.")
    },
    rootFolderExpanded: {
      type: "string",
      description: nls.localize("schema.rootFolderExpanded", "The folder icon for expanded root folders. The expanded root folder icon is optional. If not set, the icon defined for root folder will be shown.")
    },
    rootFolderNames: {
      type: "object",
      description: nls.localize("schema.rootFolderNames", "Associates root folder names to icons. The object key is the root folder name. No patterns or wildcards are allowed. Root folder name matching is case insensitive."),
      additionalProperties: {
        type: "string",
        description: nls.localize("schema.folderName", "The ID of the icon definition for the association.")
      }
    },
    rootFolderNamesExpanded: {
      type: "object",
      description: nls.localize("schema.rootFolderNamesExpanded", "Associates root folder names to icons for expanded root folders. The object key is the root folder name. No patterns or wildcards are allowed. Root folder name matching is case insensitive."),
      additionalProperties: {
        type: "string",
        description: nls.localize("schema.rootFolderNameExpanded", "The ID of the icon definition for the association.")
      }
    },
    folderNames: {
      type: "object",
      description: nls.localize("schema.folderNames", "Associates folder names to icons. The object key is the folder name, not including any path segments. No patterns or wildcards are allowed. Folder name matching is case insensitive."),
      additionalProperties: {
        type: "string",
        description: nls.localize("schema.folderName", "The ID of the icon definition for the association.")
      }
    },
    folderNamesExpanded: {
      type: "object",
      description: nls.localize("schema.folderNamesExpanded", "Associates folder names to icons for expanded folders. The object key is the folder name, not including any path segments. No patterns or wildcards are allowed. Folder name matching is case insensitive."),
      additionalProperties: {
        type: "string",
        description: nls.localize("schema.folderNameExpanded", "The ID of the icon definition for the association.")
      }
    },
    fileExtensions: {
      type: "object",
      description: nls.localize("schema.fileExtensions", "Associates file extensions to icons. The object key is the file extension name. The extension name is the last segment of a file name after the last dot (not including the dot). Extensions are compared case insensitive."),
      additionalProperties: {
        type: "string",
        description: nls.localize("schema.fileExtension", "The ID of the icon definition for the association.")
      }
    },
    fileNames: {
      type: "object",
      description: nls.localize("schema.fileNames", "Associates file names to icons. The object key is the full file name, but not including any path segments. File name can include dots and a possible file extension. No patterns or wildcards are allowed. File name matching is case insensitive."),
      additionalProperties: {
        type: "string",
        description: nls.localize("schema.fileName", "The ID of the icon definition for the association.")
      }
    },
    languageIds: {
      type: "object",
      description: nls.localize("schema.languageIds", "Associates languages to icons. The object key is the language id as defined in the language contribution point."),
      additionalProperties: {
        type: "string",
        description: nls.localize("schema.languageId", "The ID of the icon definition for the association.")
      }
    },
    associations: {
      type: "object",
      properties: {
        folderExpanded: {
          $ref: "#/definitions/folderExpanded"
        },
        folder: {
          $ref: "#/definitions/folder"
        },
        file: {
          $ref: "#/definitions/file"
        },
        folderNames: {
          $ref: "#/definitions/folderNames"
        },
        folderNamesExpanded: {
          $ref: "#/definitions/folderNamesExpanded"
        },
        rootFolder: {
          $ref: "#/definitions/rootFolder"
        },
        rootFolderExpanded: {
          $ref: "#/definitions/rootFolderExpanded"
        },
        rootFolderNames: {
          $ref: "#/definitions/rootFolderNames"
        },
        rootFolderNamesExpanded: {
          $ref: "#/definitions/rootFolderNamesExpanded"
        },
        fileExtensions: {
          $ref: "#/definitions/fileExtensions"
        },
        fileNames: {
          $ref: "#/definitions/fileNames"
        },
        languageIds: {
          $ref: "#/definitions/languageIds"
        }
      }
    }
  },
  properties: {
    fonts: {
      type: "array",
      description: nls.localize("schema.fonts", "Fonts that are used in the icon definitions."),
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: nls.localize("schema.id", "The ID of the font."),
            pattern: fontIdRegex.source,
            patternErrorMessage: fontIdErrorMessage
          },
          src: {
            type: "array",
            description: nls.localize("schema.src", "The location of the font."),
            items: {
              type: "object",
              properties: {
                path: {
                  type: "string",
                  description: nls.localize("schema.font-path", "The font path, relative to the current file icon theme file.")
                },
                format: {
                  type: "string",
                  description: nls.localize("schema.font-format", "The format of the font."),
                  enum: ["woff", "woff2", "truetype", "opentype", "embedded-opentype", "svg"]
                }
              },
              required: [
                "path",
                "format"
              ]
            }
          },
          weight: {
            type: "string",
            description: nls.localize("schema.font-weight", "The weight of the font. See https://developer.mozilla.org/en-US/docs/Web/CSS/font-weight for valid values."),
            pattern: fontWeightRegex.source
          },
          style: {
            type: "string",
            description: nls.localize("schema.font-style", "The style of the font. See https://developer.mozilla.org/en-US/docs/Web/CSS/font-style for valid values."),
            pattern: fontStyleRegex.source
          },
          size: {
            type: "string",
            description: nls.localize("schema.font-size", "The default size of the font. We strongly recommend using a percentage value, for example: 125%."),
            pattern: fontSizeRegex.source
          }
        },
        required: [
          "id",
          "src"
        ]
      }
    },
    iconDefinitions: {
      type: "object",
      description: nls.localize("schema.iconDefinitions", "Description of all icons that can be used when associating files to icons."),
      additionalProperties: {
        type: "object",
        description: nls.localize("schema.iconDefinition", "An icon definition. The object key is the ID of the definition."),
        properties: {
          iconPath: {
            type: "string",
            description: nls.localize("schema.iconPath", "When using a SVG or PNG: The path to the image. The path is relative to the icon set file.")
          },
          fontCharacter: {
            type: "string",
            description: nls.localize("schema.fontCharacter", "When using a glyph font: The character in the font to use.")
          },
          fontColor: {
            type: "string",
            format: "color-hex",
            description: nls.localize("schema.fontColor", "When using a glyph font: The color to use."),
            pattern: fontColorRegex.source
          },
          fontSize: {
            type: "string",
            description: nls.localize("schema.fontSize", "When using a font: The font size in percentage to the text font. If not set, defaults to the size in the font definition."),
            pattern: fontSizeRegex.source
          },
          fontId: {
            type: "string",
            description: nls.localize("schema.fontId", "When using a font: The id of the font. If not set, defaults to the first font definition."),
            pattern: fontIdRegex.source,
            patternErrorMessage: fontIdErrorMessage
          }
        }
      }
    },
    folderExpanded: {
      $ref: "#/definitions/folderExpanded"
    },
    folder: {
      $ref: "#/definitions/folder"
    },
    file: {
      $ref: "#/definitions/file"
    },
    folderNames: {
      $ref: "#/definitions/folderNames"
    },
    folderNamesExpanded: {
      $ref: "#/definitions/folderNamesExpanded"
    },
    rootFolder: {
      $ref: "#/definitions/rootFolder"
    },
    rootFolderExpanded: {
      $ref: "#/definitions/rootFolderExpanded"
    },
    rootFolderNames: {
      $ref: "#/definitions/rootFolderNames"
    },
    rootFolderNamesExpanded: {
      $ref: "#/definitions/rootFolderNamesExpanded"
    },
    fileExtensions: {
      $ref: "#/definitions/fileExtensions"
    },
    fileNames: {
      $ref: "#/definitions/fileNames"
    },
    languageIds: {
      $ref: "#/definitions/languageIds"
    },
    light: {
      $ref: "#/definitions/associations",
      description: nls.localize("schema.light", "Optional associations for file icons in light color themes.")
    },
    highContrast: {
      $ref: "#/definitions/associations",
      description: nls.localize("schema.highContrast", "Optional associations for file icons in high contrast color themes.")
    },
    hidesExplorerArrows: {
      type: "boolean",
      description: nls.localize("schema.hidesExplorerArrows", "Configures whether the file explorer's arrows should be hidden when this theme is active.")
    },
    showLanguageModeIcons: {
      type: "boolean",
      description: nls.localize("schema.showLanguageModeIcons", "Configures whether the default language icons should be used if the theme does not define an icon for a language.")
    }
  }
};
function registerFileIconThemeSchemas() {
  const schemaRegistry = Registry.as(JSONExtensions.JSONContribution);
  schemaRegistry.registerSchema(schemaId, schema);
}
export {
  registerFileIconThemeSchemas
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL2ZpbGVJY29uVGhlbWVTY2hlbWEudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5cbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgSlNPTkV4dGVuc2lvbnMsIElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9qc29uc2NoZW1hcy9jb21tb24vanNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBmb250V2VpZ2h0UmVnZXgsIGZvbnRTdHlsZVJlZ2V4LCBmb250U2l6ZVJlZ2V4LCBmb250SWRSZWdleCwgZm9udENvbG9yUmVnZXgsIGZvbnRJZEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9pY29uUmVnaXN0cnkuanMnO1xuXG5jb25zdCBzY2hlbWFJZCA9ICd2c2NvZGU6Ly9zY2hlbWFzL2ljb24tdGhlbWUnO1xuY29uc3Qgc2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0dHlwZTogJ29iamVjdCcsXG5cdGFsbG93Q29tbWVudHM6IHRydWUsXG5cdGFsbG93VHJhaWxpbmdDb21tYXM6IHRydWUsXG5cdGRlZmluaXRpb25zOiB7XG5cdFx0Zm9sZGVyRXhwYW5kZWQ6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbGRlckV4cGFuZGVkJywgJ1RoZSBmb2xkZXIgaWNvbiBmb3IgZXhwYW5kZWQgZm9sZGVycy4gVGhlIGV4cGFuZGVkIGZvbGRlciBpY29uIGlzIG9wdGlvbmFsLiBJZiBub3Qgc2V0LCB0aGUgaWNvbiBkZWZpbmVkIGZvciBmb2xkZXIgd2lsbCBiZSBzaG93bi4nKVxuXHRcdH0sXG5cdFx0Zm9sZGVyOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5mb2xkZXInLCAnVGhlIGZvbGRlciBpY29uIGZvciBjb2xsYXBzZWQgZm9sZGVycywgYW5kIGlmIGZvbGRlckV4cGFuZGVkIGlzIG5vdCBzZXQsIGFsc28gZm9yIGV4cGFuZGVkIGZvbGRlcnMuJylcblxuXHRcdH0sXG5cdFx0ZmlsZToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZmlsZScsICdUaGUgZGVmYXVsdCBmaWxlIGljb24sIHNob3duIGZvciBhbGwgZmlsZXMgdGhhdCBkb25cXCd0IG1hdGNoIGFueSBleHRlbnNpb24sIGZpbGVuYW1lIG9yIGxhbmd1YWdlIGlkLicpXG5cblx0XHR9LFxuXHRcdHJvb3RGb2xkZXI6IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnJvb3RGb2xkZXInLCAnVGhlIGZvbGRlciBpY29uIGZvciBjb2xsYXBzZWQgcm9vdCBmb2xkZXJzLCBhbmQgaWYgcm9vdEZvbGRlckV4cGFuZGVkIGlzIG5vdCBzZXQsIGFsc28gZm9yIGV4cGFuZGVkIHJvb3QgZm9sZGVycy4nKVxuXHRcdH0sXG5cdFx0cm9vdEZvbGRlckV4cGFuZGVkOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5yb290Rm9sZGVyRXhwYW5kZWQnLCAnVGhlIGZvbGRlciBpY29uIGZvciBleHBhbmRlZCByb290IGZvbGRlcnMuIFRoZSBleHBhbmRlZCByb290IGZvbGRlciBpY29uIGlzIG9wdGlvbmFsLiBJZiBub3Qgc2V0LCB0aGUgaWNvbiBkZWZpbmVkIGZvciByb290IGZvbGRlciB3aWxsIGJlIHNob3duLicpXG5cdFx0fSxcblx0XHRyb290Rm9sZGVyTmFtZXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnJvb3RGb2xkZXJOYW1lcycsICdBc3NvY2lhdGVzIHJvb3QgZm9sZGVyIG5hbWVzIHRvIGljb25zLiBUaGUgb2JqZWN0IGtleSBpcyB0aGUgcm9vdCBmb2xkZXIgbmFtZS4gTm8gcGF0dGVybnMgb3Igd2lsZGNhcmRzIGFyZSBhbGxvd2VkLiBSb290IGZvbGRlciBuYW1lIG1hdGNoaW5nIGlzIGNhc2UgaW5zZW5zaXRpdmUuJyksXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbGRlck5hbWUnLCAnVGhlIElEIG9mIHRoZSBpY29uIGRlZmluaXRpb24gZm9yIHRoZSBhc3NvY2lhdGlvbi4nKVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0cm9vdEZvbGRlck5hbWVzRXhwYW5kZWQ6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnJvb3RGb2xkZXJOYW1lc0V4cGFuZGVkJywgJ0Fzc29jaWF0ZXMgcm9vdCBmb2xkZXIgbmFtZXMgdG8gaWNvbnMgZm9yIGV4cGFuZGVkIHJvb3QgZm9sZGVycy4gVGhlIG9iamVjdCBrZXkgaXMgdGhlIHJvb3QgZm9sZGVyIG5hbWUuIE5vIHBhdHRlcm5zIG9yIHdpbGRjYXJkcyBhcmUgYWxsb3dlZC4gUm9vdCBmb2xkZXIgbmFtZSBtYXRjaGluZyBpcyBjYXNlIGluc2Vuc2l0aXZlLicpLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5yb290Rm9sZGVyTmFtZUV4cGFuZGVkJywgJ1RoZSBJRCBvZiB0aGUgaWNvbiBkZWZpbml0aW9uIGZvciB0aGUgYXNzb2NpYXRpb24uJylcblx0XHRcdH1cblx0XHR9LFxuXHRcdGZvbGRlck5hbWVzOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5mb2xkZXJOYW1lcycsICdBc3NvY2lhdGVzIGZvbGRlciBuYW1lcyB0byBpY29ucy4gVGhlIG9iamVjdCBrZXkgaXMgdGhlIGZvbGRlciBuYW1lLCBub3QgaW5jbHVkaW5nIGFueSBwYXRoIHNlZ21lbnRzLiBObyBwYXR0ZXJucyBvciB3aWxkY2FyZHMgYXJlIGFsbG93ZWQuIEZvbGRlciBuYW1lIG1hdGNoaW5nIGlzIGNhc2UgaW5zZW5zaXRpdmUuJyksXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbGRlck5hbWUnLCAnVGhlIElEIG9mIHRoZSBpY29uIGRlZmluaXRpb24gZm9yIHRoZSBhc3NvY2lhdGlvbi4nKVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0Zm9sZGVyTmFtZXNFeHBhbmRlZDoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9sZGVyTmFtZXNFeHBhbmRlZCcsICdBc3NvY2lhdGVzIGZvbGRlciBuYW1lcyB0byBpY29ucyBmb3IgZXhwYW5kZWQgZm9sZGVycy4gVGhlIG9iamVjdCBrZXkgaXMgdGhlIGZvbGRlciBuYW1lLCBub3QgaW5jbHVkaW5nIGFueSBwYXRoIHNlZ21lbnRzLiBObyBwYXR0ZXJucyBvciB3aWxkY2FyZHMgYXJlIGFsbG93ZWQuIEZvbGRlciBuYW1lIG1hdGNoaW5nIGlzIGNhc2UgaW5zZW5zaXRpdmUuJyksXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbGRlck5hbWVFeHBhbmRlZCcsICdUaGUgSUQgb2YgdGhlIGljb24gZGVmaW5pdGlvbiBmb3IgdGhlIGFzc29jaWF0aW9uLicpXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRmaWxlRXh0ZW5zaW9uczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZmlsZUV4dGVuc2lvbnMnLCAnQXNzb2NpYXRlcyBmaWxlIGV4dGVuc2lvbnMgdG8gaWNvbnMuIFRoZSBvYmplY3Qga2V5IGlzIHRoZSBmaWxlIGV4dGVuc2lvbiBuYW1lLiBUaGUgZXh0ZW5zaW9uIG5hbWUgaXMgdGhlIGxhc3Qgc2VnbWVudCBvZiBhIGZpbGUgbmFtZSBhZnRlciB0aGUgbGFzdCBkb3QgKG5vdCBpbmNsdWRpbmcgdGhlIGRvdCkuIEV4dGVuc2lvbnMgYXJlIGNvbXBhcmVkIGNhc2UgaW5zZW5zaXRpdmUuJyksXG5cblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZmlsZUV4dGVuc2lvbicsICdUaGUgSUQgb2YgdGhlIGljb24gZGVmaW5pdGlvbiBmb3IgdGhlIGFzc29jaWF0aW9uLicpXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRmaWxlTmFtZXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZpbGVOYW1lcycsICdBc3NvY2lhdGVzIGZpbGUgbmFtZXMgdG8gaWNvbnMuIFRoZSBvYmplY3Qga2V5IGlzIHRoZSBmdWxsIGZpbGUgbmFtZSwgYnV0IG5vdCBpbmNsdWRpbmcgYW55IHBhdGggc2VnbWVudHMuIEZpbGUgbmFtZSBjYW4gaW5jbHVkZSBkb3RzIGFuZCBhIHBvc3NpYmxlIGZpbGUgZXh0ZW5zaW9uLiBObyBwYXR0ZXJucyBvciB3aWxkY2FyZHMgYXJlIGFsbG93ZWQuIEZpbGUgbmFtZSBtYXRjaGluZyBpcyBjYXNlIGluc2Vuc2l0aXZlLicpLFxuXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZpbGVOYW1lJywgJ1RoZSBJRCBvZiB0aGUgaWNvbiBkZWZpbml0aW9uIGZvciB0aGUgYXNzb2NpYXRpb24uJylcblx0XHRcdH1cblx0XHR9LFxuXHRcdGxhbmd1YWdlSWRzOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5sYW5ndWFnZUlkcycsICdBc3NvY2lhdGVzIGxhbmd1YWdlcyB0byBpY29ucy4gVGhlIG9iamVjdCBrZXkgaXMgdGhlIGxhbmd1YWdlIGlkIGFzIGRlZmluZWQgaW4gdGhlIGxhbmd1YWdlIGNvbnRyaWJ1dGlvbiBwb2ludC4nKSxcblxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5sYW5ndWFnZUlkJywgJ1RoZSBJRCBvZiB0aGUgaWNvbiBkZWZpbml0aW9uIGZvciB0aGUgYXNzb2NpYXRpb24uJylcblx0XHRcdH1cblx0XHR9LFxuXHRcdGFzc29jaWF0aW9uczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGZvbGRlckV4cGFuZGVkOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvZm9sZGVyRXhwYW5kZWQnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZvbGRlcjoge1xuXHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2ZvbGRlcidcblx0XHRcdFx0fSxcblx0XHRcdFx0ZmlsZToge1xuXHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2ZpbGUnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZvbGRlck5hbWVzOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvZm9sZGVyTmFtZXMnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZvbGRlck5hbWVzRXhwYW5kZWQ6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9mb2xkZXJOYW1lc0V4cGFuZGVkJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRyb290Rm9sZGVyOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvcm9vdEZvbGRlcidcblx0XHRcdFx0fSxcblx0XHRcdFx0cm9vdEZvbGRlckV4cGFuZGVkOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvcm9vdEZvbGRlckV4cGFuZGVkJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRyb290Rm9sZGVyTmFtZXM6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9yb290Rm9sZGVyTmFtZXMnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJvb3RGb2xkZXJOYW1lc0V4cGFuZGVkOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvcm9vdEZvbGRlck5hbWVzRXhwYW5kZWQnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZpbGVFeHRlbnNpb25zOiB7XG5cdFx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvZmlsZUV4dGVuc2lvbnMnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZpbGVOYW1lczoge1xuXHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2ZpbGVOYW1lcydcblx0XHRcdFx0fSxcblx0XHRcdFx0bGFuZ3VhZ2VJZHM6IHtcblx0XHRcdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9sYW5ndWFnZUlkcydcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fSxcblx0cHJvcGVydGllczoge1xuXHRcdGZvbnRzOiB7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbnRzJywgJ0ZvbnRzIHRoYXQgYXJlIHVzZWQgaW4gdGhlIGljb24gZGVmaW5pdGlvbnMuJyksXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5pZCcsICdUaGUgSUQgb2YgdGhlIGZvbnQuJyksXG5cdFx0XHRcdFx0XHRwYXR0ZXJuOiBmb250SWRSZWdleC5zb3VyY2UsXG5cdFx0XHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBmb250SWRFcnJvck1lc3NhZ2Vcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHNyYzoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5zcmMnLCAnVGhlIGxvY2F0aW9uIG9mIHRoZSBmb250LicpLFxuXHRcdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5mb250LXBhdGgnLCAnVGhlIGZvbnQgcGF0aCwgcmVsYXRpdmUgdG8gdGhlIGN1cnJlbnQgZmlsZSBpY29uIHRoZW1lIGZpbGUuJyksXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRmb3JtYXQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbnQtZm9ybWF0JywgJ1RoZSBmb3JtYXQgb2YgdGhlIGZvbnQuJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRlbnVtOiBbJ3dvZmYnLCAnd29mZjInLCAndHJ1ZXR5cGUnLCAnb3BlbnR5cGUnLCAnZW1iZWRkZWQtb3BlbnR5cGUnLCAnc3ZnJ11cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbXG5cdFx0XHRcdFx0XHRcdFx0J3BhdGgnLFxuXHRcdFx0XHRcdFx0XHRcdCdmb3JtYXQnXG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHdlaWdodDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9udC13ZWlnaHQnLCAnVGhlIHdlaWdodCBvZiB0aGUgZm9udC4gU2VlIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0NTUy9mb250LXdlaWdodCBmb3IgdmFsaWQgdmFsdWVzLicpLFxuXHRcdFx0XHRcdFx0cGF0dGVybjogZm9udFdlaWdodFJlZ2V4LnNvdXJjZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbnQtc3R5bGUnLCAnVGhlIHN0eWxlIG9mIHRoZSBmb250LiBTZWUgaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQ1NTL2ZvbnQtc3R5bGUgZm9yIHZhbGlkIHZhbHVlcy4nKSxcblx0XHRcdFx0XHRcdHBhdHRlcm46IGZvbnRTdHlsZVJlZ2V4LnNvdXJjZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0c2l6ZToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9udC1zaXplJywgJ1RoZSBkZWZhdWx0IHNpemUgb2YgdGhlIGZvbnQuIFdlIHN0cm9uZ2x5IHJlY29tbWVuZCB1c2luZyBhIHBlcmNlbnRhZ2UgdmFsdWUsIGZvciBleGFtcGxlOiAxMjUlLicpLFxuXHRcdFx0XHRcdFx0cGF0dGVybjogZm9udFNpemVSZWdleC5zb3VyY2Vcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlcXVpcmVkOiBbXG5cdFx0XHRcdFx0J2lkJyxcblx0XHRcdFx0XHQnc3JjJ1xuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRpY29uRGVmaW5pdGlvbnM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmljb25EZWZpbml0aW9ucycsICdEZXNjcmlwdGlvbiBvZiBhbGwgaWNvbnMgdGhhdCBjYW4gYmUgdXNlZCB3aGVuIGFzc29jaWF0aW5nIGZpbGVzIHRvIGljb25zLicpLFxuXHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5pY29uRGVmaW5pdGlvbicsICdBbiBpY29uIGRlZmluaXRpb24uIFRoZSBvYmplY3Qga2V5IGlzIHRoZSBJRCBvZiB0aGUgZGVmaW5pdGlvbi4nKSxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGljb25QYXRoOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5pY29uUGF0aCcsICdXaGVuIHVzaW5nIGEgU1ZHIG9yIFBORzogVGhlIHBhdGggdG8gdGhlIGltYWdlLiBUaGUgcGF0aCBpcyByZWxhdGl2ZSB0byB0aGUgaWNvbiBzZXQgZmlsZS4nKVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Zm9udENoYXJhY3Rlcjoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9udENoYXJhY3RlcicsICdXaGVuIHVzaW5nIGEgZ2x5cGggZm9udDogVGhlIGNoYXJhY3RlciBpbiB0aGUgZm9udCB0byB1c2UuJylcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGZvbnRDb2xvcjoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRmb3JtYXQ6ICdjb2xvci1oZXgnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbnRDb2xvcicsICdXaGVuIHVzaW5nIGEgZ2x5cGggZm9udDogVGhlIGNvbG9yIHRvIHVzZS4nKSxcblx0XHRcdFx0XHRcdHBhdHRlcm46IGZvbnRDb2xvclJlZ2V4LnNvdXJjZVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Zm9udFNpemU6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbnRTaXplJywgJ1doZW4gdXNpbmcgYSBmb250OiBUaGUgZm9udCBzaXplIGluIHBlcmNlbnRhZ2UgdG8gdGhlIHRleHQgZm9udC4gSWYgbm90IHNldCwgZGVmYXVsdHMgdG8gdGhlIHNpemUgaW4gdGhlIGZvbnQgZGVmaW5pdGlvbi4nKSxcblx0XHRcdFx0XHRcdHBhdHRlcm46IGZvbnRTaXplUmVnZXguc291cmNlXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRmb250SWQ6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbnRJZCcsICdXaGVuIHVzaW5nIGEgZm9udDogVGhlIGlkIG9mIHRoZSBmb250LiBJZiBub3Qgc2V0LCBkZWZhdWx0cyB0byB0aGUgZmlyc3QgZm9udCBkZWZpbml0aW9uLicpLFxuXHRcdFx0XHRcdFx0cGF0dGVybjogZm9udElkUmVnZXguc291cmNlLFxuXHRcdFx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogZm9udElkRXJyb3JNZXNzYWdlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRmb2xkZXJFeHBhbmRlZDoge1xuXHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvZm9sZGVyRXhwYW5kZWQnXG5cdFx0fSxcblx0XHRmb2xkZXI6IHtcblx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2ZvbGRlcidcblx0XHR9LFxuXHRcdGZpbGU6IHtcblx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2ZpbGUnXG5cdFx0fSxcblx0XHRmb2xkZXJOYW1lczoge1xuXHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvZm9sZGVyTmFtZXMnXG5cdFx0fSxcblx0XHRmb2xkZXJOYW1lc0V4cGFuZGVkOiB7XG5cdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9mb2xkZXJOYW1lc0V4cGFuZGVkJ1xuXHRcdH0sXG5cdFx0cm9vdEZvbGRlcjoge1xuXHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvcm9vdEZvbGRlcidcblx0XHR9LFxuXHRcdHJvb3RGb2xkZXJFeHBhbmRlZDoge1xuXHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvcm9vdEZvbGRlckV4cGFuZGVkJ1xuXHRcdH0sXG5cdFx0cm9vdEZvbGRlck5hbWVzOiB7XG5cdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9yb290Rm9sZGVyTmFtZXMnXG5cdFx0fSxcblx0XHRyb290Rm9sZGVyTmFtZXNFeHBhbmRlZDoge1xuXHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvcm9vdEZvbGRlck5hbWVzRXhwYW5kZWQnXG5cdFx0fSxcblx0XHRmaWxlRXh0ZW5zaW9uczoge1xuXHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvZmlsZUV4dGVuc2lvbnMnXG5cdFx0fSxcblx0XHRmaWxlTmFtZXM6IHtcblx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL2ZpbGVOYW1lcydcblx0XHR9LFxuXHRcdGxhbmd1YWdlSWRzOiB7XG5cdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9sYW5ndWFnZUlkcydcblx0XHR9LFxuXHRcdGxpZ2h0OiB7XG5cdFx0XHQkcmVmOiAnIy9kZWZpbml0aW9ucy9hc3NvY2lhdGlvbnMnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmxpZ2h0JywgJ09wdGlvbmFsIGFzc29jaWF0aW9ucyBmb3IgZmlsZSBpY29ucyBpbiBsaWdodCBjb2xvciB0aGVtZXMuJylcblx0XHR9LFxuXHRcdGhpZ2hDb250cmFzdDoge1xuXHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvYXNzb2NpYXRpb25zJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5oaWdoQ29udHJhc3QnLCAnT3B0aW9uYWwgYXNzb2NpYXRpb25zIGZvciBmaWxlIGljb25zIGluIGhpZ2ggY29udHJhc3QgY29sb3IgdGhlbWVzLicpXG5cdFx0fSxcblx0XHRoaWRlc0V4cGxvcmVyQXJyb3dzOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuaGlkZXNFeHBsb3JlckFycm93cycsICdDb25maWd1cmVzIHdoZXRoZXIgdGhlIGZpbGUgZXhwbG9yZXJcXCdzIGFycm93cyBzaG91bGQgYmUgaGlkZGVuIHdoZW4gdGhpcyB0aGVtZSBpcyBhY3RpdmUuJylcblx0XHR9LFxuXHRcdHNob3dMYW5ndWFnZU1vZGVJY29uczoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnNob3dMYW5ndWFnZU1vZGVJY29ucycsICdDb25maWd1cmVzIHdoZXRoZXIgdGhlIGRlZmF1bHQgbGFuZ3VhZ2UgaWNvbnMgc2hvdWxkIGJlIHVzZWQgaWYgdGhlIHRoZW1lIGRvZXMgbm90IGRlZmluZSBhbiBpY29uIGZvciBhIGxhbmd1YWdlLicpXG5cdFx0fVxuXHR9XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gcmVnaXN0ZXJGaWxlSWNvblRoZW1lU2NoZW1hcygpIHtcblx0Y29uc3Qgc2NoZW1hUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJSlNPTkNvbnRyaWJ1dGlvblJlZ2lzdHJ5PihKU09ORXh0ZW5zaW9ucy5KU09OQ29udHJpYnV0aW9uKTtcblx0c2NoZW1hUmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEoc2NoZW1hSWQsIHNjaGVtYSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxZQUFZLFNBQVM7QUFFckIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxjQUFjLHNCQUFpRDtBQUV4RSxTQUFTLGlCQUFpQixnQkFBZ0IsZUFBZSxhQUFhLGdCQUFnQiwwQkFBMEI7QUFFaEgsTUFBTSxXQUFXO0FBQ2pCLE1BQU0sU0FBc0I7QUFBQSxFQUMzQixNQUFNO0FBQUEsRUFDTixlQUFlO0FBQUEsRUFDZixxQkFBcUI7QUFBQSxFQUNyQixhQUFhO0FBQUEsSUFDWixnQkFBZ0I7QUFBQSxNQUNmLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLHlCQUF5QixvSUFBb0k7QUFBQSxJQUN4TDtBQUFBLElBQ0EsUUFBUTtBQUFBLE1BQ1AsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsaUJBQWlCLHFHQUFxRztBQUFBLElBRWpKO0FBQUEsSUFDQSxNQUFNO0FBQUEsTUFDTCxNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyxlQUFlLHFHQUFzRztBQUFBLElBRWhKO0FBQUEsSUFDQSxZQUFZO0FBQUEsTUFDWCxNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyxxQkFBcUIsbUhBQW1IO0FBQUEsSUFDbks7QUFBQSxJQUNBLG9CQUFvQjtBQUFBLE1BQ25CLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLDZCQUE2QixtSkFBbUo7QUFBQSxJQUMzTTtBQUFBLElBQ0EsaUJBQWlCO0FBQUEsTUFDaEIsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsMEJBQTBCLHFLQUFxSztBQUFBLE1BQ3pOLHNCQUFzQjtBQUFBLFFBQ3JCLE1BQU07QUFBQSxRQUNOLGFBQWEsSUFBSSxTQUFTLHFCQUFxQixvREFBb0Q7QUFBQSxNQUNwRztBQUFBLElBQ0Q7QUFBQSxJQUNBLHlCQUF5QjtBQUFBLE1BQ3hCLE1BQU07QUFBQSxNQUNO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
