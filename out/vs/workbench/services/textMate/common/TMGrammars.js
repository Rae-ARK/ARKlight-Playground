import * as nls from "../../../../nls.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { languagesExtPoint } from "../../language/common/languageService.js";
const grammarsExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "grammars",
  deps: [languagesExtPoint],
  jsonSchema: {
    description: nls.localize("vscode.extension.contributes.grammars", "Contributes textmate tokenizers."),
    type: "array",
    defaultSnippets: [{ body: [{ language: "${1:id}", scopeName: "source.${2:id}", path: "./syntaxes/${3:id}.tmLanguage." }] }],
    items: {
      type: "object",
      defaultSnippets: [{ body: { language: "${1:id}", scopeName: "source.${2:id}", path: "./syntaxes/${3:id}.tmLanguage." } }],
      properties: {
        language: {
          description: nls.localize("vscode.extension.contributes.grammars.language", "Language identifier for which this syntax is contributed to."),
          type: "string"
        },
        scopeName: {
          description: nls.localize("vscode.extension.contributes.grammars.scopeName", "Textmate scope name used by the tmLanguage file."),
          type: "string"
        },
        path: {
          description: nls.localize("vscode.extension.contributes.grammars.path", "Path of the tmLanguage file. The path is relative to the extension folder and typically starts with './syntaxes/'."),
          type: "string"
        },
        embeddedLanguages: {
          description: nls.localize("vscode.extension.contributes.grammars.embeddedLanguages", "A map of scope name to language id if this grammar contains embedded languages."),
          type: "object"
        },
        tokenTypes: {
          description: nls.localize("vscode.extension.contributes.grammars.tokenTypes", "A map of scope name to token types."),
          type: "object",
          additionalProperties: {
            enum: ["string", "comment", "other", "regex"]
          }
        },
        injectTo: {
          description: nls.localize("vscode.extension.contributes.grammars.injectTo", "List of language scope names to which this grammar is injected to."),
          type: "array",
          items: {
            type: "string"
          }
        },
        balancedBracketScopes: {
          description: nls.localize("vscode.extension.contributes.grammars.balancedBracketScopes", "Defines which scope names contain balanced brackets."),
          type: "array",
          items: {
            type: "string"
          },
          default: ["*"]
        },
        unbalancedBracketScopes: {
          description: nls.localize("vscode.extension.contributes.grammars.unbalancedBracketScopes", "Defines which scope names do not contain balanced brackets."),
          type: "array",
          items: {
            type: "string"
          },
          default: []
        }
      },
      required: ["scopeName", "path"]
    }
  }
});
export {
  grammarsExtPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90ZXh0TWF0ZS9jb21tb24vVE1HcmFtbWFycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5LCBJRXh0ZW5zaW9uUG9pbnQgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgbGFuZ3VhZ2VzRXh0UG9pbnQgfSBmcm9tICcuLi8uLi9sYW5ndWFnZS9jb21tb24vbGFuZ3VhZ2VTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRW1iZWRkZWRMYW5ndWFnZXNNYXAge1xuXHRbc2NvcGVOYW1lOiBzdHJpbmddOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVG9rZW5UeXBlc0NvbnRyaWJ1dGlvbiB7XG5cdFtzY29wZU5hbWU6IHN0cmluZ106IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJVE1TeW50YXhFeHRlbnNpb25Qb2ludCB7XG5cdGxhbmd1YWdlPzogc3RyaW5nOyAvLyB1bmRlZmluZWQgaWYgdGhlIGdyYW1tYXIgaXMgb25seSBpbmNsdWRlZCBieSBvdGhlciBncmFtbWFyc1xuXHRzY29wZU5hbWU6IHN0cmluZztcblx0cGF0aDogc3RyaW5nO1xuXHRlbWJlZGRlZExhbmd1YWdlczogSUVtYmVkZGVkTGFuZ3VhZ2VzTWFwO1xuXHR0b2tlblR5cGVzOiBUb2tlblR5cGVzQ29udHJpYnV0aW9uO1xuXHRpbmplY3RUbzogc3RyaW5nW107XG5cdGJhbGFuY2VkQnJhY2tldFNjb3Blczogc3RyaW5nW107XG5cdHVuYmFsYW5jZWRCcmFja2V0U2NvcGVzOiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNvbnN0IGdyYW1tYXJzRXh0UG9pbnQ6IElFeHRlbnNpb25Qb2ludDxJVE1TeW50YXhFeHRlbnNpb25Qb2ludFtdPiA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PElUTVN5bnRheEV4dGVuc2lvblBvaW50W10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdncmFtbWFycycsXG5cdGRlcHM6IFtsYW5ndWFnZXNFeHRQb2ludF0sXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmdyYW1tYXJzJywgJ0NvbnRyaWJ1dGVzIHRleHRtYXRlIHRva2VuaXplcnMuJyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRkZWZhdWx0U25pcHBldHM6IFt7IGJvZHk6IFt7IGxhbmd1YWdlOiAnJHsxOmlkfScsIHNjb3BlTmFtZTogJ3NvdXJjZS4kezI6aWR9JywgcGF0aDogJy4vc3ludGF4ZXMvJHszOmlkfS50bUxhbmd1YWdlLicgfV0gfV0sXG5cdFx0aXRlbXM6IHtcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IGxhbmd1YWdlOiAnJHsxOmlkfScsIHNjb3BlTmFtZTogJ3NvdXJjZS4kezI6aWR9JywgcGF0aDogJy4vc3ludGF4ZXMvJHszOmlkfS50bUxhbmd1YWdlLicgfSB9XSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0bGFuZ3VhZ2U6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmdyYW1tYXJzLmxhbmd1YWdlJywgJ0xhbmd1YWdlIGlkZW50aWZpZXIgZm9yIHdoaWNoIHRoaXMgc3ludGF4IGlzIGNvbnRyaWJ1dGVkIHRvLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNjb3BlTmFtZToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZ3JhbW1hcnMuc2NvcGVOYW1lJywgJ1RleHRtYXRlIHNjb3BlIG5hbWUgdXNlZCBieSB0aGUgdG1MYW5ndWFnZSBmaWxlLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHBhdGg6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmdyYW1tYXJzLnBhdGgnLCAnUGF0aCBvZiB0aGUgdG1MYW5ndWFnZSBmaWxlLiBUaGUgcGF0aCBpcyByZWxhdGl2ZSB0byB0aGUgZXh0ZW5zaW9uIGZvbGRlciBhbmQgdHlwaWNhbGx5IHN0YXJ0cyB3aXRoIFxcJy4vc3ludGF4ZXMvXFwnLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGVtYmVkZGVkTGFuZ3VhZ2VzOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5ncmFtbWFycy5lbWJlZGRlZExhbmd1YWdlcycsICdBIG1hcCBvZiBzY29wZSBuYW1lIHRvIGxhbmd1YWdlIGlkIGlmIHRoaXMgZ3JhbW1hciBjb250YWlucyBlbWJlZGRlZCBsYW5ndWFnZXMuJyksXG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCdcblx0XHRcdFx0fSxcblx0XHRcdFx0dG9rZW5UeXBlczoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ3ZzY29kZS5leHRlbnNpb24uY29udHJpYnV0ZXMuZ3JhbW1hcnMudG9rZW5UeXBlcycsICdBIG1hcCBvZiBzY29wZSBuYW1lIHRvIHRva2VuIHR5cGVzLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRlbnVtOiBbJ3N0cmluZycsICdjb21tZW50JywgJ290aGVyJywgJ3JlZ2V4J11cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGluamVjdFRvOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5ncmFtbWFycy5pbmplY3RUbycsICdMaXN0IG9mIGxhbmd1YWdlIHNjb3BlIG5hbWVzIHRvIHdoaWNoIHRoaXMgZ3JhbW1hciBpcyBpbmplY3RlZCB0by4nKSxcblx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0YmFsYW5jZWRCcmFja2V0U2NvcGVzOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5ncmFtbWFycy5iYWxhbmNlZEJyYWNrZXRTY29wZXMnLCAnRGVmaW5lcyB3aGljaCBzY29wZSBuYW1lcyBjb250YWluIGJhbGFuY2VkIGJyYWNrZXRzLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRkZWZhdWx0OiBbJyonXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0dW5iYWxhbmNlZEJyYWNrZXRTY29wZXM6IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCd2c2NvZGUuZXh0ZW5zaW9uLmNvbnRyaWJ1dGVzLmdyYW1tYXJzLnVuYmFsYW5jZWRCcmFja2V0U2NvcGVzJywgJ0RlZmluZXMgd2hpY2ggc2NvcGUgbmFtZXMgZG8gbm90IGNvbnRhaW4gYmFsYW5jZWQgYnJhY2tldHMuJyksXG5cdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGRlZmF1bHQ6IFtdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHJlcXVpcmVkOiBbJ3Njb3BlTmFtZScsICdwYXRoJ11cblx0XHR9XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsMEJBQTJDO0FBQ3BELFNBQVMseUJBQXlCO0FBcUIzQixNQUFNLG1CQUErRCxtQkFBbUIsdUJBQWtEO0FBQUEsRUFDaEosZ0JBQWdCO0FBQUEsRUFDaEIsTUFBTSxDQUFDLGlCQUFpQjtBQUFBLEVBQ3hCLFlBQVk7QUFBQSxJQUNYLGFBQWEsSUFBSSxTQUFTLHlDQUF5QyxrQ0FBa0M7QUFBQSxJQUNyRyxNQUFNO0FBQUEsSUFDTixpQkFBaUIsQ0FBQyxFQUFFLE1BQU0sQ0FBQyxFQUFFLFVBQVUsV0FBVyxXQUFXLGtCQUFrQixNQUFNLGlDQUFpQyxDQUFDLEVBQUUsQ0FBQztBQUFBLElBQzFILE9BQU87QUFBQSxNQUNOLE1BQU07QUFBQSxNQUNOLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxFQUFFLFVBQVUsV0FBVyxXQUFXLGtCQUFrQixNQUFNLGlDQUFpQyxFQUFFLENBQUM7QUFBQSxNQUN4SCxZQUFZO0FBQUEsUUFDWCxVQUFVO0FBQUEsVUFDVCxhQUFhLElBQUksU0FBUyxrREFBa0QsOERBQThEO0FBQUEsVUFDMUksTUFBTTtBQUFBLFFBQ1A7QUFBQSxRQUNBLFdBQVc7QUFBQSxVQUNWLGFBQWEsSUFBSSxTQUFTLG1EQUFtRCxrREFBa0Q7QUFBQSxVQUMvSCxNQUFNO0FBQUEsUUFDUDtBQUFBLFFBQ0EsTUFBTTtBQUFBLFVBQ0wsYUFBYSxJQUFJLFNBQVMsOENBQThDLG9IQUFzSDtBQUFBLFVBQzlMLE1BQU07QUFBQSxRQUNQO0FBQUEsUUFDQSxtQkFBbUI7QUFBQSxVQUNsQixhQUFhLElBQUksU0FBUywyREFBMkQsaUZBQWlGO0FBQUEsVUFDdEssTUFBTTtBQUFBLFFBQ1A7QUFBQSxRQUNBLFlBQVk7QUFBQSxVQUNYLGFBQWEsSUFBSSxTQUFTLG9EQUFvRCxxQ0FBcUM7QUFBQSxVQUNuSCxNQUFNO0FBQUEsVUFDTixzQkFBc0I7QUFBQSxZQUNyQixNQUFNLENBQUMsVUFBVSxXQUFXLFNBQVMsT0FBTztBQUFBLFVBQzdDO0FBQUEsUUFDRDtBQUFBLFFBQ0EsVUFBVTtBQUFBLFVBQ1QsYUFBYSxJQUFJLFNBQVMsa0RBQWtELG9FQUFvRTtBQUFBLFVBQ2hKLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxZQUNOLE1BQU07QUFBQSxVQUNQO0FBQUEsUUFDRDtBQUFBLFFBQ0EsdUJBQXVCO0FBQUEsVUFDdEIsYUFBYSxJQUFJLFNBQVMsK0RBQStELHNEQUFzRDtBQUFBLFVBQy9JLE1BQU07QUFBQSxVQUNOLE9BQU87QUFBQSxZQUNOLE1BQU07QUFBQSxVQUNQO0FBQUEsVUFDQSxTQUFTLENBQUMsR0FBRztBQUFBLFFBQ2Q7QUFBQSxRQUNBLHlCQUF5QjtBQUFBLFVBQ3hCLGFBQWEsSUFBSSxTQUFTLGlFQUFpRSw2REFBNkQ7QUFBQSxVQUN4SixNQUFNO0FBQUEsVUFDTixPQUFPO0FBQUEsWUFDTixNQUFNO0FBQUEsVUFDUDtBQUFBLFVBQ0EsU0FBUyxDQUFDO0FBQUEsUUFDWDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLFVBQVUsQ0FBQyxhQUFhLE1BQU07QUFBQSxJQUMvQjtBQUFBLEVBQ0Q7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
