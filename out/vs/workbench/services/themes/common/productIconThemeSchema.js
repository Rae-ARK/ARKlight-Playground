import * as nls from "../../../../nls.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { fontIdErrorMessage, fontIdRegex, fontStyleRegex, fontWeightRegex, iconsSchemaId } from "../../../../platform/theme/common/iconRegistry.js";
const schemaId = "vscode://schemas/product-icon-theme";
const schema = {
  type: "object",
  allowComments: true,
  allowTrailingCommas: true,
  properties: {
    fonts: {
      type: "array",
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
                  description: nls.localize("schema.font-path", "The font path, relative to the current product icon theme file.")
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
            anyOf: [
              { enum: ["normal", "bold", "lighter", "bolder"] },
              { type: "string", pattern: fontWeightRegex.source }
            ]
          },
          style: {
            type: "string",
            description: nls.localize("schema.font-style", "The style of the font. See https://developer.mozilla.org/en-US/docs/Web/CSS/font-style for valid values."),
            anyOf: [
              { enum: ["normal", "italic", "oblique"] },
              { type: "string", pattern: fontStyleRegex.source }
            ]
          }
        },
        required: [
          "id",
          "src"
        ]
      }
    },
    iconDefinitions: {
      description: nls.localize("schema.iconDefinitions", "Association of icon name to a font character."),
      $ref: iconsSchemaId
    }
  }
};
function registerProductIconThemeSchemas() {
  const schemaRegistry = Registry.as(JSONExtensions.JSONContribution);
  schemaRegistry.registerSchema(schemaId, schema);
}
export {
  registerProductIconThemeSchemas
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL3Byb2R1Y3RJY29uVGhlbWVTY2hlbWEudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5cbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgSlNPTkV4dGVuc2lvbnMsIElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9qc29uc2NoZW1hcy9jb21tb24vanNvbkNvbnRyaWJ1dGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBmb250SWRFcnJvck1lc3NhZ2UsIGZvbnRJZFJlZ2V4LCBmb250U3R5bGVSZWdleCwgZm9udFdlaWdodFJlZ2V4LCBpY29uc1NjaGVtYUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2ljb25SZWdpc3RyeS5qcyc7XG5cbmNvbnN0IHNjaGVtYUlkID0gJ3ZzY29kZTovL3NjaGVtYXMvcHJvZHVjdC1pY29uLXRoZW1lJztcbmNvbnN0IHNjaGVtYTogSUpTT05TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRhbGxvd0NvbW1lbnRzOiB0cnVlLFxuXHRhbGxvd1RyYWlsaW5nQ29tbWFzOiB0cnVlLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0Zm9udHM6IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGlkOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5pZCcsICdUaGUgSUQgb2YgdGhlIGZvbnQuJyksXG5cdFx0XHRcdFx0XHRwYXR0ZXJuOiBmb250SWRSZWdleC5zb3VyY2UsXG5cdFx0XHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBmb250SWRFcnJvck1lc3NhZ2Vcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHNyYzoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5zcmMnLCAnVGhlIGxvY2F0aW9uIG9mIHRoZSBmb250LicpLFxuXHRcdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3NjaGVtYS5mb250LXBhdGgnLCAnVGhlIGZvbnQgcGF0aCwgcmVsYXRpdmUgdG8gdGhlIGN1cnJlbnQgcHJvZHVjdCBpY29uIHRoZW1lIGZpbGUuJyksXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0XHRmb3JtYXQ6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnc2NoZW1hLmZvbnQtZm9ybWF0JywgJ1RoZSBmb3JtYXQgb2YgdGhlIGZvbnQuJyksXG5cdFx0XHRcdFx0XHRcdFx0XHRlbnVtOiBbJ3dvZmYnLCAnd29mZjInLCAndHJ1ZXR5cGUnLCAnb3BlbnR5cGUnLCAnZW1iZWRkZWQtb3BlbnR5cGUnLCAnc3ZnJ11cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbXG5cdFx0XHRcdFx0XHRcdFx0J3BhdGgnLFxuXHRcdFx0XHRcdFx0XHRcdCdmb3JtYXQnXG5cdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHdlaWdodDoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9udC13ZWlnaHQnLCAnVGhlIHdlaWdodCBvZiB0aGUgZm9udC4gU2VlIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0NTUy9mb250LXdlaWdodCBmb3IgdmFsaWQgdmFsdWVzLicpLFxuXHRcdFx0XHRcdFx0YW55T2Y6IFtcblx0XHRcdFx0XHRcdFx0eyBlbnVtOiBbJ25vcm1hbCcsICdib2xkJywgJ2xpZ2h0ZXInLCAnYm9sZGVyJ10gfSxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnc3RyaW5nJywgcGF0dGVybjogZm9udFdlaWdodFJlZ2V4LnNvdXJjZSB9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRzdHlsZToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuZm9udC1zdHlsZScsICdUaGUgc3R5bGUgb2YgdGhlIGZvbnQuIFNlZSBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1dlYi9DU1MvZm9udC1zdHlsZSBmb3IgdmFsaWQgdmFsdWVzLicpLFxuXHRcdFx0XHRcdFx0YW55T2Y6IFtcblx0XHRcdFx0XHRcdFx0eyBlbnVtOiBbJ25vcm1hbCcsICdpdGFsaWMnLCAnb2JsaXF1ZSddIH0sXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ3N0cmluZycsIHBhdHRlcm46IGZvbnRTdHlsZVJlZ2V4LnNvdXJjZSB9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRyZXF1aXJlZDogW1xuXHRcdFx0XHRcdCdpZCcsXG5cdFx0XHRcdFx0J3NyYydcblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0aWNvbkRlZmluaXRpb25zOiB7XG5cdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdzY2hlbWEuaWNvbkRlZmluaXRpb25zJywgJ0Fzc29jaWF0aW9uIG9mIGljb24gbmFtZSB0byBhIGZvbnQgY2hhcmFjdGVyLicpLFxuXHRcdFx0JHJlZjogaWNvbnNTY2hlbWFJZFxuXHRcdH1cblx0fVxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIHJlZ2lzdGVyUHJvZHVjdEljb25UaGVtZVNjaGVtYXMoKSB7XG5cdGNvbnN0IHNjaGVtYVJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUpTT05Db250cmlidXRpb25SZWdpc3RyeT4oSlNPTkV4dGVuc2lvbnMuSlNPTkNvbnRyaWJ1dGlvbik7XG5cdHNjaGVtYVJlZ2lzdHJ5LnJlZ2lzdGVyU2NoZW1hKHNjaGVtYUlkLCBzY2hlbWEpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsWUFBWSxTQUFTO0FBRXJCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsY0FBYyxzQkFBaUQ7QUFFeEUsU0FBUyxvQkFBb0IsYUFBYSxnQkFBZ0IsaUJBQWlCLHFCQUFxQjtBQUVoRyxNQUFNLFdBQVc7QUFDakIsTUFBTSxTQUFzQjtBQUFBLEVBQzNCLE1BQU07QUFBQSxFQUNOLGVBQWU7QUFBQSxFQUNmLHFCQUFxQjtBQUFBLEVBQ3JCLFlBQVk7QUFBQSxJQUNYLE9BQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLE9BQU87QUFBQSxRQUNOLE1BQU07QUFBQSxRQUNOLFlBQVk7QUFBQSxVQUNYLElBQUk7QUFBQSxZQUNILE1BQU07QUFBQSxZQUNOLGFBQWEsSUFBSSxTQUFTLGFBQWEscUJBQXFCO0FBQUEsWUFDNUQsU0FBUyxZQUFZO0FBQUEsWUFDckIscUJBQXFCO0FBQUEsVUFDdEI7QUFBQSxVQUNBLEtBQUs7QUFBQSxZQUNKLE1BQU07QUFBQSxZQUNOLGFBQWEsSUFBSSxTQUFTLGNBQWMsMkJBQTJCO0FBQUEsWUFDbkUsT0FBTztBQUFBLGNBQ04sTUFBTTtBQUFBLGNBQ04sWUFBWTtBQUFBLGdCQUNYLE1BQU07QUFBQSxrQkFDTCxNQUFNO0FBQUEsa0JBQ04sYUFBYSxJQUFJLFNBQVMsb0JBQW9CLGlFQUFpRTtBQUFBLGdCQUNoSDtBQUFBLGdCQUNBLFFBQVE7QUFBQSxrQkFDUCxNQUFNO0FBQUEsa0JBQ04sYUFBYSxJQUFJLFNBQVMsc0JBQXNCLHlCQUF5QjtBQUFBLGtCQUN6RSxNQUFNLENBQUMsUUFBUSxTQUFTLFlBQVksWUFBWSxxQkFBcUIsS0FBSztBQUFBLGdCQUMzRTtBQUFBLGNBQ0Q7QUFBQSxjQUNBLFVBQVU7QUFBQSxnQkFDVDtBQUFBLGdCQUNBO0FBQUEsY0FDRDtBQUFBLFlBQ0Q7QUFBQSxVQUNEO0FBQUEsVUFDQSxRQUFRO0FBQUEsWUFDUCxNQUFNO0FBQUEsWUFDTixhQUFhLElBQUksU0FBUyxzQkFBc0IsNEdBQTRHO0FBQUEsWUFDNUosT0FBTztBQUFBLGNBQ04sRUFBRSxNQUFNLENBQUMsVUFBVSxRQUFRLFdBQVcsUUFBUSxFQUFFO0FBQUEsY0FDaEQsRUFBRSxNQUFNLFVBQVUsU0FBUyxnQkFBZ0IsT0FBTztBQUFBLFlBQ25EO0FBQUEsVUFDRDtBQUFBLFVBQ0EsT0FBTztBQUFBLFlBQ04sTUFBTTtBQUFBLFlBQ04sYUFBYSxJQUFJLFNBQVMscUJBQXFCLDBHQUEwRztBQUFBLFlBQ3pKLE9BQU87QUFBQSxjQUNOLEVBQUUsTUFBTSxDQUFDLFVBQVUsVUFBVSxTQUFTLEVBQUU7QUFBQSxjQUN4QyxFQUFFLE1BQU0sVUFBVSxTQUFTLGVBQWUsT0FBTztBQUFBLFlBQ2xEO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxRQUNBLFVBQVU7QUFBQSxVQUNUO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0EsaUJBQWlCO0FBQUEsTUFDaEIsYUFBYSxJQUFJLFNBQVMsMEJBQTBCLCtDQUErQztBQUFBLE1BQ25HLE1BQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUNEO0FBRU8sU0FBUyxrQ0FBa0M7QUFDakQsUUFBTSxpQkFBaUIsU0FBUyxHQUE4QixlQUFlLGdCQUFnQjtBQUM3RixpQkFBZSxlQUFlLFVBQVUsTUFBTTtBQUMvQzsiLAogICJuYW1lcyI6IFtdCn0K
