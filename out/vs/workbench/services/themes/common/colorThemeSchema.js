import * as nls from "../../../../nls.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { workbenchColorsSchemaId } from "../../../../platform/theme/common/colorRegistry.js";
import { tokenStylingSchemaId } from "../../../../platform/theme/common/tokenClassificationRegistry.js";
const textMateScopes = [
  "comment",
  "comment.block",
  "comment.block.documentation",
  "comment.line",
  "constant",
  "constant.character",
  "constant.character.escape",
  "constant.numeric",
  "constant.numeric.integer",
  "constant.numeric.float",
  "constant.numeric.hex",
  "constant.numeric.octal",
  "constant.other",
  "constant.regexp",
  "constant.rgb-value",
  "emphasis",
  "entity",
  "entity.name",
  "entity.name.class",
  "entity.name.function",
  "entity.name.method",
  "entity.name.section",
  "entity.name.selector",
  "entity.name.tag",
  "entity.name.type",
  "entity.other",
  "entity.other.attribute-name",
  "entity.other.inherited-class",
  "invalid",
  "invalid.deprecated",
  "invalid.illegal",
  "keyword",
  "keyword.control",
  "keyword.operator",
  "keyword.operator.new",
  "keyword.operator.assignment",
  "keyword.operator.arithmetic",
  "keyword.operator.logical",
  "keyword.other",
  "markup",
  "markup.bold",
  "markup.changed",
  "markup.deleted",
  "markup.heading",
  "markup.inline.raw",
  "markup.inserted",
  "markup.italic",
  "markup.list",
  "markup.list.numbered",
  "markup.list.unnumbered",
  "markup.other",
  "markup.quote",
  "markup.raw",
  "markup.underline",
  "markup.underline.link",
  "meta",
  "meta.block",
  "meta.cast",
  "meta.class",
  "meta.function",
  "meta.function-call",
  "meta.preprocessor",
  "meta.return-type",
  "meta.selector",
  "meta.tag",
  "meta.type.annotation",
  "meta.type",
  "punctuation.definition.string.begin",
  "punctuation.definition.string.end",
  "punctuation.separator",
  "punctuation.separator.continuation",
  "punctuation.terminator",
  "storage",
  "storage.modifier",
  "storage.type",
  "string",
  "string.interpolated",
  "string.other",
  "string.quoted",
  "string.quoted.double",
  "string.quoted.other",
  "string.quoted.single",
  "string.quoted.triple",
  "string.regexp",
  "string.unquoted",
  "strong",
  "support",
  "support.class",
  "support.constant",
  "support.function",
  "support.other",
  "support.type",
  "support.type.property-name",
  "support.variable",
  "variable",
  "variable.language",
  "variable.name",
  "variable.other",
  "variable.other.readwrite",
  "variable.parameter"
];
const textmateColorsSchemaId = "vscode://schemas/textmate-colors";
const textmateColorGroupSchemaId = `${textmateColorsSchemaId}#/definitions/colorGroup`;
const textmateColorSchema = {
  type: "array",
  definitions: {
    colorGroup: {
      default: "#FF0000",
      anyOf: [
        {
          type: "string",
          format: "color-hex"
        },
        {
          $ref: "#/definitions/settings"
        }
      ]
    },
    settings: {
      type: "object",
      description: nls.localize("schema.token.settings", "Colors and styles for the token."),
      properties: {
        foreground: {
          type: "string",
          description: nls.localize("schema.token.foreground", "Foreground color for the token."),
          format: "color-hex",
          default: "#ff0000"
        },
        background: {
          type: "string",
          deprecationMessage: nls.localize("schema.token.background.warning", "Token background colors are currently not supported.")
        },
        fontStyle: {
          type: "string",
          description: nls.localize("schema.token.fontStyle", "Font style of the rule: 'italic', 'bold', 'underline', 'strikethrough' or a combination. The empty string unsets inherited settings."),
          pattern: "^(\\s*\\b(italic|bold|underline|strikethrough))*\\s*$",
          patternErrorMessage: nls.localize("schema.fontStyle.error", "Font style must be 'italic', 'bold', 'underline', 'strikethrough' or a combination or the empty string."),
          defaultSnippets: [
            { label: nls.localize("schema.token.fontStyle.none", "None (clear inherited style)"), bodyText: '""' },
            { body: "italic" },
            { body: "bold" },
            { body: "underline" },
            { body: "strikethrough" },
            { body: "italic bold" },
            { body: "italic underline" },
            { body: "italic strikethrough" },
            { body: "bold underline" },
            { body: "bold strikethrough" },
            { body: "underline strikethrough" },
            { body: "italic bold underline" },
            { body: "italic bold strikethrough" },
            { body: "italic underline strikethrough" },
            { body: "bold underline strikethrough" },
            { body: "italic bold underline strikethrough" }
          ]
        },
        fontFamily: {
          type: "string",
          description: nls.localize("schema.token.fontFamily", 'Font family for the token (e.g., "Fira Code", "JetBrains Mono").')
        },
        fontSize: {
          type: "number",
          description: nls.localize("schema.token.fontSize", "Font size multiplier for the token (e.g., 1.2 will use 1.2 times the default font size).")
        },
        lineHeight: {
          type: "number",
          description: nls.localize("schema.token.lineHeight", "Line height multiplier for the token (e.g., 1.2 will use 1.2 times the default height). If the font size is set and the line height is not explicitly set, the line height will be computed based on the font size.")
        }
      },
      additionalProperties: false,
      defaultSnippets: [{ body: { foreground: "${1:#FF0000}", fontStyle: "${2:bold}" } }]
    }
  },
  items: {
    type: "object",
    defaultSnippets: [{ body: { scope: "${1:keyword.operator}", settings: { foreground: "${2:#FF0000}" } } }],
    properties: {
      name: {
        type: "string",
        description: nls.localize("schema.properties.name", "Description of the rule.")
      },
      scope: {
        description: nls.localize("schema.properties.scope", "Scope selector against which this rule matches."),
        anyOf: [
          {
            enum: textMateScopes
          },
          {
            type: "string"
          },
          {
            type: "array",
            items: {
              enum: textMateScopes
            }
          },
          {
            type: "array",
            items: {
              type: "string"
            }
          }
        ]
      },
      settings: {
        $ref: "#/definitions/settings"
      }
    },
    required: [
      "settings"
    ],
    additionalProperties: false
  }
};
const colorThemeSchemaId = "vscode://schemas/color-theme";
const colorThemeSchema = {
  type: "object",
  allowComments: true,
  allowTrailingCommas: true,
  properties: {
    colors: {
      description: nls.localize("schema.workbenchColors", "Colors in the workbench"),
      $ref: workbenchColorsSchemaId,
      additionalProperties: false
    },
    tokenColors: {
      anyOf: [
        {
          type: "string",
          description: nls.localize("schema.tokenColors.path", "Path to a tmTheme file (relative to the current file).")
        },
        {
          description: nls.localize("schema.colors", "Colors for syntax highlighting"),
          $ref: textmateColorsSchemaId
        }
      ]
    },
    semanticHighlighting: {
      type: "boolean",
      description: nls.localize("schema.supportsSemanticHighlighting", "Whether semantic highlighting should be enabled for this theme.")
    },
    semanticTokenColors: {
      type: "object",
      description: nls.localize("schema.semanticTokenColors", "Colors for semantic tokens"),
      $ref: tokenStylingSchemaId
    }
  }
};
function registerColorThemeSchemas() {
  const schemaRegistry = Registry.as(JSONExtensions.JSONContribution);
  schemaRegistry.registerSchema(colorThemeSchemaId, colorThemeSchema);
  schemaRegistry.registerSchema(textmateColorsSchemaId, textmateColorSchema);
}
export {
  colorThemeSchemaId,
  registerColorThemeSchemas,
  textmateColorGroupSchemaId,
  textmateColorsSchemaId
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL2NvbG9yVGhlbWVTY2hlbWEudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5cbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgSlNPTkV4dGVuc2lvbnMsIElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9qc29uc2NoZW1hcy9jb21tb24vanNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5cbmltcG9ydCB7IHdvcmtiZW5jaENvbG9yc1NjaGVtYUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgdG9rZW5TdHlsaW5nU2NoZW1hSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LmpzJztcblxuY29uc3QgdGV4dE1hdGVTY29wZXMgPSBbXG5cdCdjb21tZW50Jyxcblx0J2NvbW1lbnQuYmxvY2snLFxuXHQnY29tbWVudC5ibG9jay5kb2N1bWVudGF0aW9uJyxcblx0J2NvbW1lbnQubGluZScsXG5cdCdjb25zdGFudCcsXG5cdCdjb25zdGFudC5jaGFyYWN0ZXInLFxuXHQnY29uc3RhbnQuY2hhcmFjdGVyLmVzY2FwZScsXG5cdCdjb25zdGFudC5udW1lcmljJyxcblx0J2NvbnN0YW50Lm51bWVyaWMuaW50ZWdlcicsXG5cdCdjb25zdGFudC5udW1lcmljLmZsb2F0Jyxcblx0J2NvbnN0YW50Lm51bWVyaWMuaGV4Jyxcblx0J2NvbnN0YW50Lm51bWVyaWMub2N0YWwnLFxuXHQnY29uc3RhbnQub3RoZXInLFxuXHQnY29uc3RhbnQucmVnZXhwJyxcblx0J2NvbnN0YW50LnJnYi12YWx1ZScsXG5cdCdlbXBoYXNpcycsXG5cdCdlbnRpdHknLFxuXHQnZW50aXR5Lm5hbWUnLFxuXHQnZW50aXR5Lm5hbWUuY2xhc3MnLFxuXHQnZW50aXR5Lm5hbWUuZnVuY3Rpb24nLFxuXHQnZW50aXR5Lm5hbWUubWV0aG9kJyxcblx0J2VudGl0eS5uYW1lLnNlY3Rpb24nLFxuXHQnZW50aXR5Lm5hbWUuc2VsZWN0b3InLFxuXHQnZW50aXR5Lm5hbWUudGFnJyxcblx0J2VudGl0eS5uYW1lLnR5cGUnLFxuXHQnZW50aXR5Lm90aGVyJyxcblx0J2VudGl0eS5vdGhlci5hdHRyaWJ1dGUtbmFtZScsXG5cdCdlbnRpdHkub3RoZXIuaW5oZXJpdGVkLWNsYXNzJyxcblx0J2ludmFsaWQnLFxuXHQnaW52YWxpZC5kZXByZWNhdGVkJyxcblx0J2ludmFsaWQuaWxsZWdhbCcsXG5cdCdrZXl3b3JkJyxcblx0J2tleXdvcmQuY29udHJvbCcsXG5cdCdrZXl3b3JkLm9wZXJhdG9yJyxcblx0J2tleXdvcmQub3BlcmF0b3IubmV3Jyxcblx0J2tleXdvcmQub3BlcmF0b3IuYXNzaWdubWVudCcsXG5cdCdrZXl3b3JkLm9wZXJhdG9yLmFyaXRobWV0aWMnLFxuXHQna2V5d29yZC5vcGVyYXRvci5sb2dpY2FsJyxcblx0J2tleXdvcmQub3RoZXInLFxuXHQnbWFya3VwJyxcblx0J21hcmt1cC5ib2xkJyxcblx0J21hcmt1cC5jaGFuZ2VkJyxcblx0J21hcmt1cC5kZWxldGVkJyxcblx0J21hcmt1cC5oZWFkaW5nJyxcblx0J21hcmt1cC5pbmxpbmUucmF3Jyxcblx0J21hcmt1cC5pbnNlcnRlZCcsXG5cdCdtYXJrdXAuaXRhbGljJyxcblx0J21hcmt1cC5saXN0Jyxcblx0J21hcmt1cC5saXN0Lm51bWJlcmVkJyxcblx0J21hcmt1cC5saXN0LnVubnVtYmVyZWQnLFxuXHQnbWFya3VwLm90aGVyJyxcblx0J21hcmt1cC5xdW90ZScsXG5cdCdtYXJrdXAucmF3Jyxcblx0J21hcmt1cC51bmRlcmxpbmUnLFxuXHQnbWFya3VwLnVuZGVybGluZS5saW5rJyxcblx0J21ldGEnLFxuXHQnbWV0YS5ibG9jaycsXG5cdCdtZXRhLmNhc3QnLFxuXHQnbWV0YS5jbGFzcycsXG5cdCdtZXRhLmZ1bmN0aW9uJyxcblx0J21ldGEuZnVuY3Rpb24tY2FsbCcsXG5cdCdtZXRhLnByZXByb2Nlc3NvcicsXG5cdCdtZXRhLnJldHVybi10eXBlJyxcblx0J21ldGEuc2VsZWN0b3InLFxuXHQnbWV0YS50YWcnLFxuXHQnbWV0YS50eXBlLmFubm90YXRpb24nLFxuXHQnbWV0YS50eXBlJyxcblx0J3B1bmN0dWF0aW9uLmRlZmluaXRpb24uc3RyaW5nLmJlZ2luJyxcblx0J3B1bmN0dWF0aW9uLmRlZmluaXRpb24uc3RyaW5nLmVuZCcsXG5cdCdwdW5jdHVhdGlvbi5zZXBhcmF0b3InLFxuXHQncHVuY3R1YXRpb24uc2VwYXJhdG9yLmNvbnRpbnVhdGlvbicsXG5cdCdwdW5jdHVhdGlvbi50ZXJtaW5hdG9yJyxcblx0J3N0b3JhZ2UnLFxuXHQnc3RvcmFnZS5tb2RpZmllcicsXG5cdCdzdG9yYWdlLnR5cGUnLFxuXHQnc3RyaW5nJyxcblx0J3N0cmluZy5pbnRlcnBvbGF0ZWQnLFxuXHQnc3RyaW5nLm90aGVyJyxcblx0J3N0cmluZy5xdW90ZWQnLFxuXHQnc3RyaW5nLnF1b3RlZC5kb3VibGUnLFxuXHQnc3RyaW5nLnF1b3RlZC5vdGhlcicsXG5cdCdzdHJpbmcucXVvdGVkLnNpbmdsZScsXG5cdCdzdHJpbmcucXVvdGVkLnRyaXBsZScsXG5cdCdzdHJpbmcucmVnZXhwJyxcblx0J3N0cmluZy51bnF1b3RlZCcsXG5cdCdzdHJvbmcnLFxuXHQnc3VwcG9ydCcsXG5cdCdzdXBwb3J0LmNsYXNzJyxcblx0J3N1cHBvcnQuY29uc3RhbnQnLFxuXHQnc3VwcG9ydC5mdW5jdGlvbicsXG5cdCdzdXBwb3J0Lm90aGVyJyxcblx0J3N1cHBvcnQudHlwZScsXG5cdCdzdXBwb3J0LnR5cGUucHJvcGVydHktbmFtZScsXG5cdCdzdXBwb3J0LnZhcmlhYmxlJyxcblx0J3ZhcmlhYmxlJyxcblx0J3ZhcmlhYmxlLmxhbmd1YWdlJyxcblx0J3ZhcmlhYmxlLm5hbWUnLFxuXHQndmFyaWFibGUub3RoZXInLFxuXHQndmFyaWFibGUub3RoZXIucmVhZHdyaXRlJyxcblx0J3ZhcmlhYmxlLnBhcmFtZXRlcidcbl07XG5cbmV4cG9ydCBjb25zdCB0ZXh0bWF0ZUNvbG9yc1NjaGVtYUlkID0gJ3ZzY29kZTovL3NjaGVtYXMvdGV4dG1hdGUtY29sb3JzJztcbmV4cG9ydCBjb25zdCB0ZXh0bWF0ZUNvbG9yR3JvdXBTY2hlbWFJZCA9IGAke3RleHRtYXRlQ29sb3JzU2NoZW1hSWR9Iy9kZWZpbml0aW9ucy9jb2xvckdyb3VwYDtcblxuY29uc3QgdGV4dG1hdGVDb2xvclNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdhcnJheScsXG5cdGRlZmluaXRpb25zOiB7XG5cdFx0Y29sb3JHcm91cDoge1xuXHRcdFx0ZGVmYXVsdDogJyNGRjAwMDAnLFxuXHRcdFx0YW55T2Y6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGZvcm1hdDogJ2NvbG9yLWhleCdcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdCRyZWY6ICcjL2RlZmluaXRpb25zL3NldHRpbmdzJ1xuXHRcdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSxcblx0XHRzZXR0aW5nczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEudG9rZW4uc2V0dGluZ3MnLCAnQ29sb3JzIGFuZCBzdHlsZXMgZm9yIHRoZSB0b2tlbi4nKSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0Zm9yZWdyb3VuZDoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS50b2tlbi5mb3JlZ3JvdW5kJywgJ0ZvcmVncm91bmQgY29sb3IgZm9yIHRoZSB0b2tlbi4nKSxcblx0XHRcdFx0XHRmb3JtYXQ6ICdjb2xvci1oZXgnLFxuXHRcdFx0XHRcdGRlZmF1bHQ6ICcjZmYwMDAwJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRiYWNrZ3JvdW5kOiB7XG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0ZGVwcmVjYXRpb25NZXNzYWdlOiBubHMubG9jYWxpemUoJ3NjaGVtYS50b2tlbi5iYWNrZ3JvdW5kLndhcm5pbmcnLCAnVG9rZW4gYmFja2dyb3VuZCBjb2xvcnMgYXJlIGN1cnJlbnRseSBub3Qgc3VwcG9ydGVkLicpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZvbnRTdHlsZToge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS50b2tlbi5mb250U3R5bGUnLCAnRm9udCBzdHlsZSBvZiB0aGUgcnVsZTogXFwnaXRhbGljXFwnLCBcXCdib2xkXFwnLCBcXCd1bmRlcmxpbmVcXCcsIFxcJ3N0cmlrZXRocm91Z2hcXCcgb3IgYSBjb21iaW5hdGlvbi4gVGhlIGVtcHR5IHN0cmluZyB1bnNldHMgaW5oZXJpdGVkIHNldHRpbmdzLicpLFxuXHRcdFx0XHRcdHBhdHRlcm46ICdeKFxcXFxzKlxcXFxiKGl0YWxpY3xib2xkfHVuZGVybGluZXxzdHJpa2V0aHJvdWdoKSkqXFxcXHMqJCcsXG5cdFx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9udFN0eWxlLmVycm9yJywgJ0ZvbnQgc3R5bGUgbXVzdCBiZSBcXCdpdGFsaWNcXCcsIFxcJ2JvbGRcXCcsIFxcJ3VuZGVybGluZVxcJywgXFwnc3RyaWtldGhyb3VnaFxcJyBvciBhIGNvbWJpbmF0aW9uIG9yIHRoZSBlbXB0eSBzdHJpbmcuJyksXG5cdFx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbXG5cdFx0XHRcdFx0XHR7IGxhYmVsOiBubHMubG9jYWxpemUoJ3NjaGVtYS50b2tlbi5mb250U3R5bGUubm9uZScsICdOb25lIChjbGVhciBpbmhlcml0ZWQgc3R5bGUpJyksIGJvZHlUZXh0OiAnXCJcIicgfSxcblx0XHRcdFx0XHRcdHsgYm9keTogJ2l0YWxpYycgfSxcblx0XHRcdFx0XHRcdHsgYm9keTogJ2JvbGQnIH0sXG5cdFx0XHRcdFx0XHR7IGJvZHk6ICd1bmRlcmxpbmUnIH0sXG5cdFx0XHRcdFx0XHR7IGJvZHk6ICdzdHJpa2V0aHJvdWdoJyB9LFxuXHRcdFx0XHRcdFx0eyBib2R5OiAnaXRhbGljIGJvbGQnIH0sXG5cdFx0XHRcdFx0XHR7IGJvZHk6ICdpdGFsaWMgdW5kZXJsaW5lJyB9LFxuXHRcdFx0XHRcdFx0eyBib2R5OiAnaXRhbGljIHN0cmlrZXRocm91Z2gnIH0sXG5cdFx0XHRcdFx0XHR7IGJvZHk6ICdib2xkIHVuZGVybGluZScgfSxcblx0XHRcdFx0XHRcdHsgYm9keTogJ2JvbGQgc3RyaWtldGhyb3VnaCcgfSxcblx0XHRcdFx0XHRcdHsgYm9keTogJ3VuZGVybGluZSBzdHJpa2V0aHJvdWdoJyB9LFxuXHRcdFx0XHRcdFx0eyBib2R5OiAnaXRhbGljIGJvbGQgdW5kZXJsaW5lJyB9LFxuXHRcdFx0XHRcdFx0eyBib2R5OiAnaXRhbGljIGJvbGQgc3RyaWtldGhyb3VnaCcgfSxcblx0XHRcdFx0XHRcdHsgYm9keTogJ2l0YWxpYyB1bmRlcmxpbmUgc3RyaWtldGhyb3VnaCcgfSxcblx0XHRcdFx0XHRcdHsgYm9keTogJ2JvbGQgdW5kZXJsaW5lIHN0cmlrZXRocm91Z2gnIH0sXG5cdFx0XHRcdFx0XHR7IGJvZHk6ICdpdGFsaWMgYm9sZCB1bmRlcmxpbmUgc3RyaWtldGhyb3VnaCcgfVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0Zm9udEZhbWlseToge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS50b2tlbi5mb250RmFtaWx5JywgJ0ZvbnQgZmFtaWx5IGZvciB0aGUgdG9rZW4gKGUuZy4sIFwiRmlyYSBDb2RlXCIsIFwiSmV0QnJhaW5zIE1vbm9cIikuJylcblx0XHRcdFx0fSxcblx0XHRcdFx0Zm9udFNpemU6IHtcblx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEudG9rZW4uZm9udFNpemUnLCAnRm9udCBzaXplIG11bHRpcGxpZXIgZm9yIHRoZSB0b2tlbiAoZS5nLiwgMS4yIHdpbGwgdXNlIDEuMiB0aW1lcyB0aGUgZGVmYXVsdCBmb250IHNpemUpLicpXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxpbmVIZWlnaHQ6IHtcblx0XHRcdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEudG9rZW4ubGluZUhlaWdodCcsICdMaW5lIGhlaWdodCBtdWx0aXBsaWVyIGZvciB0aGUgdG9rZW4gKGUuZy4sIDEuMiB3aWxsIHVzZSAxLjIgdGltZXMgdGhlIGRlZmF1bHQgaGVpZ2h0KS4gSWYgdGhlIGZvbnQgc2l6ZSBpcyBzZXQgYW5kIHRoZSBsaW5lIGhlaWdodCBpcyBub3QgZXhwbGljaXRseSBzZXQsIHRoZSBsaW5lIGhlaWdodCB3aWxsIGJlIGNvbXB1dGVkIGJhc2VkIG9uIHRoZSBmb250IHNpemUuJylcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyBmb3JlZ3JvdW5kOiAnJHsxOiNGRjAwMDB9JywgZm9udFN0eWxlOiAnJHsyOmJvbGR9JyB9IH1dXG5cdFx0fVxuXHR9LFxuXHRpdGVtczoge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogeyBzY29wZTogJyR7MTprZXl3b3JkLm9wZXJhdG9yfScsIHNldHRpbmdzOiB7IGZvcmVncm91bmQ6ICckezI6I0ZGMDAwMH0nIH0gfSB9XSxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRuYW1lOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEucHJvcGVydGllcy5uYW1lJywgJ0Rlc2NyaXB0aW9uIG9mIHRoZSBydWxlLicpXG5cdFx0XHR9LFxuXHRcdFx0c2NvcGU6IHtcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnByb3BlcnRpZXMuc2NvcGUnLCAnU2NvcGUgc2VsZWN0b3IgYWdhaW5zdCB3aGljaCB0aGlzIHJ1bGUgbWF0Y2hlcy4nKSxcblx0XHRcdFx0YW55T2Y6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlbnVtOiB0ZXh0TWF0ZVNjb3Blc1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0XHRlbnVtOiB0ZXh0TWF0ZVNjb3Blc1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0c2V0dGluZ3M6IHtcblx0XHRcdFx0JHJlZjogJyMvZGVmaW5pdGlvbnMvc2V0dGluZ3MnXG5cdFx0XHR9XG5cdFx0fSxcblx0XHRyZXF1aXJlZDogW1xuXHRcdFx0J3NldHRpbmdzJ1xuXHRcdF0sXG5cdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlXG5cdH1cbn07XG5cbmV4cG9ydCBjb25zdCBjb2xvclRoZW1lU2NoZW1hSWQgPSAndnNjb2RlOi8vc2NoZW1hcy9jb2xvci10aGVtZSc7XG5cbmNvbnN0IGNvbG9yVGhlbWVTY2hlbWE6IElKU09OU2NoZW1hID0ge1xuXHR0eXBlOiAnb2JqZWN0Jyxcblx0YWxsb3dDb21tZW50czogdHJ1ZSxcblx0YWxsb3dUcmFpbGluZ0NvbW1hczogdHJ1ZSxcblx0cHJvcGVydGllczoge1xuXHRcdGNvbG9yczoge1xuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLndvcmtiZW5jaENvbG9ycycsICdDb2xvcnMgaW4gdGhlIHdvcmtiZW5jaCcpLFxuXHRcdFx0JHJlZjogd29ya2JlbmNoQ29sb3JzU2NoZW1hSWQsXG5cdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2Vcblx0XHR9LFxuXHRcdHRva2VuQ29sb3JzOiB7XG5cdFx0XHRhbnlPZjogW3tcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS50b2tlbkNvbG9ycy5wYXRoJywgJ1BhdGggdG8gYSB0bVRoZW1lIGZpbGUgKHJlbGF0aXZlIHRvIHRoZSBjdXJyZW50IGZpbGUpLicpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuY29sb3JzJywgJ0NvbG9ycyBmb3Igc3ludGF4IGhpZ2hsaWdodGluZycpLFxuXHRcdFx0XHQkcmVmOiB0ZXh0bWF0ZUNvbG9yc1NjaGVtYUlkXG5cdFx0XHR9XG5cdFx0XHRdXG5cdFx0fSxcblx0XHRzZW1hbnRpY0hpZ2hsaWdodGluZzoge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnN1cHBvcnRzU2VtYW50aWNIaWdobGlnaHRpbmcnLCAnV2hldGhlciBzZW1hbnRpYyBoaWdobGlnaHRpbmcgc2hvdWxkIGJlIGVuYWJsZWQgZm9yIHRoaXMgdGhlbWUuJylcblx0XHR9LFxuXHRcdHNlbWFudGljVG9rZW5Db2xvcnM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLnNlbWFudGljVG9rZW5Db2xvcnMnLCAnQ29sb3JzIGZvciBzZW1hbnRpYyB0b2tlbnMnKSxcblx0XHRcdCRyZWY6IHRva2VuU3R5bGluZ1NjaGVtYUlkXG5cdFx0fVxuXHR9XG59O1xuXG5cblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyQ29sb3JUaGVtZVNjaGVtYXMoKSB7XG5cdGNvbnN0IHNjaGVtYVJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUpTT05Db250cmlidXRpb25SZWdpc3RyeT4oSlNPTkV4dGVuc2lvbnMuSlNPTkNvbnRyaWJ1dGlvbik7XG5cdHNjaGVtYVJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKGNvbG9yVGhlbWVTY2hlbWFJZCwgY29sb3JUaGVtZVNjaGVtYSk7XG5cdHNjaGVtYVJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKHRleHRtYXRlQ29sb3JzU2NoZW1hSWQsIHRleHRtYXRlQ29sb3JTY2hlbWEpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsWUFBWSxTQUFTO0FBRXJCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYyxzQkFBaUQ7QUFHeEUsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyw0QkFBNEI7QUFFckMsTUFBTSxpQkFBaUI7QUFBQSxFQUN0QjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUNEO0FBRU8sTUFBTSx5QkFBeUI7QUFDL0IsTUFBTSw2QkFBNkIsR0FBRyxzQkFBc0I7QUFFbkUsTUFBTSxzQkFBbUM7QUFBQSxFQUN4QyxNQUFNO0FBQUEsRUFDTixhQUFhO0FBQUEsSUFDWixZQUFZO0FBQUEsTUFDWCxTQUFTO0FBQUEsTUFDVCxPQUFPO0FBQUEsUUFDTjtBQUFBLFVBQ0MsTUFBTTtBQUFBLFVBQ04sUUFBUTtBQUFBLFFBQ1Q7QUFBQSxRQUNBO0FBQUEsVUFDQyxNQUFNO0FBQUEsUUFDUDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxVQUFVO0FBQUEsTUFDVCxNQUFNO0FBQUEsTUFDTixhQUFhLElBQUksU0FBUyx5QkFBeUIsa0NBQWtDO0FBQUEsTUFDckYsWUFBWTtBQUFBLFFBQ1gsWUFBWTtBQUFBLFVBQ1gsTUFBTTtBQUFBLFVBQ04sYUFBYSxJQUFJLFNBQVMsMkJBQTJCLGlDQUFpQztBQUFBLFVBQ3RGLFFBQVE7QUFBQSxVQUNSLFNBQVM7QUFBQSxRQUNWO0FBQUEsUUFDQSxZQUFZO0FBQUEsVUFDWCxNQUFNO0FBQUEsVUFDTixvQkFBb0IsSUFBSSxTQUFTLG1DQUFtQyxzREFBc0Q7QUFBQSxRQUMzSDtBQUFBLFFBQ0EsV0FBVztBQUFBLFVBQ1YsTUFBTTtBQUFBLFVBQ04sYUFBYSxJQUFJLFNBQVMsMEJBQTBCLHNJQUE4STtBQUFBLFVBQ2xNLFNBQVM7QUFBQSxVQUNULHFCQUFxQixJQUFJLFNBQVMsMEJBQTBCLHlHQUFpSDtBQUFBLFVBQzdLLGlCQUFpQjtBQUFBLFlBQ2hCLEVBQUUsT0FBTyxJQUFJLFNBQVMsK0JBQStCLDhCQUE4QixHQUFHLFVBQVUsS0FBSztBQUFBLFlBQ3JHLEVBQUUsTUFBTSxTQUFTO0FBQUEsWUFDakIsRUFBRSxNQUFNLE9BQU87QUFBQSxZQUNmLEVBQUUsTUFBTSxZQUFZO0FBQUEsWUFDcEIsRUFBRSxNQUFNLGdCQUFnQjtBQUFBLFlBQ3hCLEVBQUUsTUFBTSxjQUFjO0FBQUEsWUFDdEIsRUFBRSxNQUFNLG1CQUFtQjtBQUFBLFlBQzNCLEVBQUUsTUFBTSx1QkFBdUI7QUFBQSxZQUMvQixFQUFFLE1BQU0saUJBQWlCO0FBQUEsWUFDekIsRUFBRSxNQUFNLHFCQUFxQjtBQUFBLFlBQzdCLEVBQUUsTUFBTSwwQkFBMEI7QUFBQSxZQUNsQyxFQUFFLE1BQU0sd0JBQXdCO0FBQUEsWUFDaEMsRUFBRSxNQUFNLDRCQUE0QjtBQUFBLFlBQ3BDLEVBQUUsTUFBTSxpQ0FBaUM7QUFBQSxZQUN6QyxFQUFFLE1BQU0sK0JBQStCO0FBQUEsWUFDdkMsRUFBRSxNQUFNLHNDQUFzQztBQUFBLFVBQy9DO0FBQUEsUUFDRDtBQUFBLFFBQ0EsWUFBWTtBQUFBLFVBQ1gsTUFBTTtBQUFBLFVBQ04sYUFBYSxJQUFJLFNBQVMsMkJBQTJCLGtFQUFrRTtBQUFBLFFBQ3hIO0FBQUEsUUFDQSxVQUFVO0FBQUEsVUFDVCxNQUFNO0FBQUEsVUFDTixhQUFhLElBQUksU0FBUyx5QkFBeUIsMEZBQTBGO0FBQUEsUUFDOUk7QUFBQSxRQUNBLFlBQVk7QUFBQSxVQUNYLE1BQU07QUFBQSxVQUNOLGFBQWEsSUFBSSxTQUFTLDJCQUEyQixxTkFBcU47QUFBQSxRQUMzUTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLHNCQUFzQjtBQUFBLE1BQ3RCLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxFQUFFLFlBQVksZ0JBQWdCLFdBQVcsWUFBWSxFQUFFLENBQUM7QUFBQSxJQUNuRjtBQUFBLEVBQ0Q7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxFQUFFLE9BQU8seUJBQXlCLFVBQVUsRUFBRSxZQUFZLGVBQWUsRUFBRSxFQUFFLENBQUM7QUFBQSxJQUN4RyxZQUFZO0FBQUEsTUFDWCxNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFDTixhQUFhLElBQUksU0FBUywwQkFBMEIsMEJBQTBCO0FBQUEsTUFDL0U7QUFBQSxNQUNBLE9BQU87QUFBQSxRQUNOLGFBQWEsSUFBSSxTQUFTLDJCQUEyQixpREFBaUQ7QUFBQSxRQUN0RyxPQUFPO0FBQUEsVUFDTjtBQUFBLFlBQ0MsTUFBTTtBQUFBLFVBQ1A7QUFBQSxVQUNBO0FBQUEsWUFDQyxNQUFNO0FBQUEsVUFDUDtBQUFBLFVBQ0E7QUFBQSxZQUNDLE1BQU07QUFBQSxZQUNOLE9BQU87QUFBQSxjQUNOLE1BQU07QUFBQSxZQUNQO0FBQUEsVUFDRDtBQUFBLFVBQ0E7QUFBQSxZQUNDLE1BQU07QUFBQSxZQUNOLE9BQU87QUFBQSxjQUNOLE1BQU07QUFBQSxZQUNQO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsTUFDQSxVQUFVO0FBQUEsUUFDVCxNQUFNO0FBQUEsTUFDUDtBQUFBLElBQ0Q7QUFBQSxJQUNBLFVBQVU7QUFBQSxNQUNUO0FBQUEsSUFDRDtBQUFBLElBQ0Esc0JBQXNCO0FBQUEsRUFDdkI7QUFDRDtBQUVPLE1BQU0scUJBQXFCO0FBRWxDLE1BQU0sbUJBQWdDO0FBQUEsRUFDckMsTUFBTTtBQUFBLEVBQ04sZUFBZTtBQUFBLEVBQ2YscUJBQXFCO0FBQUEsRUFDckIsWUFBWTtBQUFBLElBQ1gsUUFBUTtBQUFBLE1BQ1AsYUFBYSxJQUFJLFNBQVMsMEJBQTBCLHlCQUF5QjtBQUFBLE1BQzdFLE1BQU07QUFBQSxNQUNOLHNCQUFzQjtBQUFBLElBQ3ZCO0FBQUEsSUFDQSxhQUFhO0FBQUEsTUFDWixPQUFPO0FBQUEsUUFBQztBQUFBLFVBQ1AsTUFBTTtBQUFBLFVBQ04sYUFBYSxJQUFJLFNBQVMsMkJBQTJCLHdEQUF3RDtBQUFBLFFBQzlHO0FBQUEsUUFDQTtBQUFBLFVBQ0MsYUFBYSxJQUFJLFNBQVMsaUJBQWlCLGdDQUFnQztBQUFBLFVBQzNFLE1BQU07QUFBQSxRQUNQO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFBQSxJQUNBLHNCQUFzQjtBQUFBLE1BQ3JCLE1BQU07QUFBQSxNQUNOLGFBQWEsSUFBSSxTQUFTLHVDQUF1QyxpRUFBaUU7QUFBQSxJQUNuSTtBQUFBLElBQ0EscUJBQXFCO0FBQUEsTUFDcEIsTUFBTTtBQUFBLE1BQ04sYUFBYSxJQUFJLFNBQVMsOEJBQThCLDRCQUE0QjtBQUFBLE1BQ3BGLE1BQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUNEO0FBSU8sU0FBUyw0QkFBNEI7QUFDM0MsUUFBTSxpQkFBaUIsU0FBUyxHQUE4QixlQUFlLGdCQUFnQjtBQUM3RixpQkFBZSxlQUFlLG9CQUFvQixnQkFBZ0I7QUFDbEUsaUJBQWUsZUFBZSx3QkFBd0IsbUJBQW1CO0FBQzFFOyIsCiAgIm5hbWVzIjogW10KfQo=
