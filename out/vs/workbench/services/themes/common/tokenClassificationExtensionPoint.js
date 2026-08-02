import * as nls from "../../../../nls.js";
import { ExtensionsRegistry } from "../../extensions/common/extensionsRegistry.js";
import { getTokenClassificationRegistry, typeAndModifierIdPattern } from "../../../../platform/theme/common/tokenClassificationRegistry.js";
const tokenClassificationRegistry = getTokenClassificationRegistry();
const tokenTypeExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "semanticTokenTypes",
  jsonSchema: {
    description: nls.localize("contributes.semanticTokenTypes", "Contributes semantic token types."),
    type: "array",
    items: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: nls.localize("contributes.semanticTokenTypes.id", "The identifier of the semantic token type"),
          pattern: typeAndModifierIdPattern,
          patternErrorMessage: nls.localize("contributes.semanticTokenTypes.id.format", "Identifiers should be in the form letterOrDigit[_-letterOrDigit]*")
        },
        superType: {
          type: "string",
          description: nls.localize("contributes.semanticTokenTypes.superType", "The super type of the semantic token type"),
          pattern: typeAndModifierIdPattern,
          patternErrorMessage: nls.localize("contributes.semanticTokenTypes.superType.format", "Super types should be in the form letterOrDigit[_-letterOrDigit]*")
        },
        description: {
          type: "string",
          description: nls.localize("contributes.color.description", "The description of the semantic token type")
        }
      }
    }
  }
});
const tokenModifierExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "semanticTokenModifiers",
  jsonSchema: {
    description: nls.localize("contributes.semanticTokenModifiers", "Contributes semantic token modifiers."),
    type: "array",
    items: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: nls.localize("contributes.semanticTokenModifiers.id", "The identifier of the semantic token modifier"),
          pattern: typeAndModifierIdPattern,
          patternErrorMessage: nls.localize("contributes.semanticTokenModifiers.id.format", "Identifiers should be in the form letterOrDigit[_-letterOrDigit]*")
        },
        description: {
          description: nls.localize("contributes.semanticTokenModifiers.description", "The description of the semantic token modifier")
        }
      }
    }
  }
});
const tokenStyleDefaultsExtPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "semanticTokenScopes",
  jsonSchema: {
    description: nls.localize("contributes.semanticTokenScopes", "Contributes semantic token scope maps."),
    type: "array",
    items: {
      type: "object",
      properties: {
        language: {
          description: nls.localize("contributes.semanticTokenScopes.languages", "Lists the languge for which the defaults are."),
          type: "string"
        },
        scopes: {
          description: nls.localize("contributes.semanticTokenScopes.scopes", "Maps a semantic token (described by semantic token selector) to one or more textMate scopes used to represent that token."),
          type: "object",
          additionalProperties: {
            type: "array",
            items: {
              type: "string"
            }
          }
        }
      }
    }
  }
});
class TokenClassificationExtensionPoints {
  constructor() {
    function validateTypeOrModifier(contribution, extensionPoint, collector) {
      if (typeof contribution.id !== "string" || contribution.id.length === 0) {
        collector.error(nls.localize("invalid.id", "'configuration.{0}.id' must be defined and can not be empty", extensionPoint));
        return false;
      }
      if (!contribution.id.match(typeAndModifierIdPattern)) {
        collector.error(nls.localize("invalid.id.format", "'configuration.{0}.id' must follow the pattern letterOrDigit[-_letterOrDigit]*", extensionPoint));
        return false;
      }
      const superType = contribution.superType;
      if (superType && !superType.match(typeAndModifierIdPattern)) {
        collector.error(nls.localize("invalid.superType.format", "'configuration.{0}.superType' must follow the pattern letterOrDigit[-_letterOrDigit]*", extensionPoint));
        return false;
      }
      if (typeof contribution.description !== "string" || contribution.id.length === 0) {
        collector.error(nls.localize("invalid.description", "'configuration.{0}.description' must be defined and can not be empty", extensionPoint));
        return false;
      }
      return true;
    }
    tokenTypeExtPoint.setHandler((extensions, delta) => {
      for (const extension of delta.added) {
        const extensionValue = extension.value;
        const collector = extension.collector;
        if (!extensionValue || !Array.isArray(extensionValue)) {
          collector.error(nls.localize("invalid.semanticTokenTypeConfiguration", "'configuration.semanticTokenType' must be an array"));
          return;
        }
        for (const contribution of extensionValue) {
          if (validateTypeOrModifier(contribution, "semanticTokenType", collector)) {
            tokenClassificationRegistry.registerTokenType(contribution.id, contribution.description, contribution.superType);
          }
        }
      }
      for (const extension of delta.removed) {
        const extensionValue = extension.value;
        for (const contribution of extensionValue) {
          tokenClassificationRegistry.deregisterTokenType(contribution.id);
        }
      }
    });
    tokenModifierExtPoint.setHandler((extensions, delta) => {
      for (const extension of delta.added) {
        const extensionValue = extension.value;
        const collector = extension.collector;
        if (!extensionValue || !Array.isArray(extensionValue)) {
          collector.error(nls.localize("invalid.semanticTokenModifierConfiguration", "'configuration.semanticTokenModifier' must be an array"));
          return;
        }
        for (const contribution of extensionValue) {
          if (validateTypeOrModifier(contribution, "semanticTokenModifier", collector)) {
            tokenClassificationRegistry.registerTokenModifier(contribution.id, contribution.description);
          }
        }
      }
      for (const extension of delta.removed) {
        const extensionValue = extension.value;
        for (const contribution of extensionValue) {
          tokenClassificationRegistry.deregisterTokenModifier(contribution.id);
        }
      }
    });
    tokenStyleDefaultsExtPoint.setHandler((extensions, delta) => {
      for (const extension of delta.added) {
        const extensionValue = extension.value;
        const collector = extension.collector;
        if (!extensionValue || !Array.isArray(extensionValue)) {
          collector.error(nls.localize("invalid.semanticTokenScopes.configuration", "'configuration.semanticTokenScopes' must be an array"));
          return;
        }
        for (const contribution of extensionValue) {
          if (contribution.language && typeof contribution.language !== "string") {
            collector.error(nls.localize("invalid.semanticTokenScopes.language", "'configuration.semanticTokenScopes.language' must be a string"));
            continue;
          }
          if (!contribution.scopes || typeof contribution.scopes !== "object") {
            collector.error(nls.localize("invalid.semanticTokenScopes.scopes", "'configuration.semanticTokenScopes.scopes' must be defined as an object"));
            continue;
          }
          for (const selectorString in contribution.scopes) {
            const tmScopes = contribution.scopes[selectorString];
            if (!Array.isArray(tmScopes) || tmScopes.some((l) => typeof l !== "string")) {
              collector.error(nls.localize("invalid.semanticTokenScopes.scopes.value", "'configuration.semanticTokenScopes.scopes' values must be an array of strings"));
              continue;
            }
            try {
              const selector = tokenClassificationRegistry.parseTokenSelector(selectorString, contribution.language);
              tokenClassificationRegistry.registerTokenStyleDefault(selector, { scopesToProbe: tmScopes.map((s) => s.split(" ")) });
            } catch (e) {
              collector.error(nls.localize("invalid.semanticTokenScopes.scopes.selector", "configuration.semanticTokenScopes.scopes': Problems parsing selector {0}.", selectorString));
            }
          }
        }
      }
      for (const extension of delta.removed) {
        const extensionValue = extension.value;
        for (const contribution of extensionValue) {
          for (const selectorString in contribution.scopes) {
            const tmScopes = contribution.scopes[selectorString];
            try {
              const selector = tokenClassificationRegistry.parseTokenSelector(selectorString, contribution.language);
              tokenClassificationRegistry.registerTokenStyleDefault(selector, { scopesToProbe: tmScopes.map((s) => s.split(" ")) });
            } catch (e) {
            }
          }
        }
      }
    });
  }
}
export {
  TokenClassificationExtensionPoints
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90aGVtZXMvY29tbW9uL3Rva2VuQ2xhc3NpZmljYXRpb25FeHRlbnNpb25Qb2ludC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5LCBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yIH0gZnJvbSAnLi4vLi4vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IGdldFRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeSwgSVRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeSwgdHlwZUFuZE1vZGlmaWVySWRQYXR0ZXJuIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3Rva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeS5qcyc7XG5cbmludGVyZmFjZSBJVG9rZW5UeXBlRXh0ZW5zaW9uUG9pbnQge1xuXHRpZDogc3RyaW5nO1xuXHRkZXNjcmlwdGlvbjogc3RyaW5nO1xuXHRzdXBlclR5cGU/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJVG9rZW5Nb2RpZmllckV4dGVuc2lvblBvaW50IHtcblx0aWQ6IHN0cmluZztcblx0ZGVzY3JpcHRpb246IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElUb2tlblN0eWxlRGVmYXVsdEV4dGVuc2lvblBvaW50IHtcblx0bGFuZ3VhZ2U/OiBzdHJpbmc7XG5cdHNjb3BlczogeyBbc2VsZWN0b3I6IHN0cmluZ106IHN0cmluZ1tdIH07XG59XG5cbmNvbnN0IHRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeTogSVRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeSA9IGdldFRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeSgpO1xuXG5jb25zdCB0b2tlblR5cGVFeHRQb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PElUb2tlblR5cGVFeHRlbnNpb25Qb2ludFtdPih7XG5cdGV4dGVuc2lvblBvaW50OiAnc2VtYW50aWNUb2tlblR5cGVzJyxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnNlbWFudGljVG9rZW5UeXBlcycsICdDb250cmlidXRlcyBzZW1hbnRpYyB0b2tlbiB0eXBlcy4nKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5zZW1hbnRpY1Rva2VuVHlwZXMuaWQnLCAnVGhlIGlkZW50aWZpZXIgb2YgdGhlIHNlbWFudGljIHRva2VuIHR5cGUnKSxcblx0XHRcdFx0XHRwYXR0ZXJuOiB0eXBlQW5kTW9kaWZpZXJJZFBhdHRlcm4sXG5cdFx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5zZW1hbnRpY1Rva2VuVHlwZXMuaWQuZm9ybWF0JywgJ0lkZW50aWZpZXJzIHNob3VsZCBiZSBpbiB0aGUgZm9ybSBsZXR0ZXJPckRpZ2l0W18tbGV0dGVyT3JEaWdpdF0qJyksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHN1cGVyVHlwZToge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnNlbWFudGljVG9rZW5UeXBlcy5zdXBlclR5cGUnLCAnVGhlIHN1cGVyIHR5cGUgb2YgdGhlIHNlbWFudGljIHRva2VuIHR5cGUnKSxcblx0XHRcdFx0XHRwYXR0ZXJuOiB0eXBlQW5kTW9kaWZpZXJJZFBhdHRlcm4sXG5cdFx0XHRcdFx0cGF0dGVybkVycm9yTWVzc2FnZTogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5zZW1hbnRpY1Rva2VuVHlwZXMuc3VwZXJUeXBlLmZvcm1hdCcsICdTdXBlciB0eXBlcyBzaG91bGQgYmUgaW4gdGhlIGZvcm0gbGV0dGVyT3JEaWdpdFtfLWxldHRlck9yRGlnaXRdKicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLmNvbG9yLmRlc2NyaXB0aW9uJywgJ1RoZSBkZXNjcmlwdGlvbiBvZiB0aGUgc2VtYW50aWMgdG9rZW4gdHlwZScpLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuY29uc3QgdG9rZW5Nb2RpZmllckV4dFBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SVRva2VuTW9kaWZpZXJFeHRlbnNpb25Qb2ludFtdPih7XG5cdGV4dGVuc2lvblBvaW50OiAnc2VtYW50aWNUb2tlbk1vZGlmaWVycycsXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5zZW1hbnRpY1Rva2VuTW9kaWZpZXJzJywgJ0NvbnRyaWJ1dGVzIHNlbWFudGljIHRva2VuIG1vZGlmaWVycy4nKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGl0ZW1zOiB7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0aWQ6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5zZW1hbnRpY1Rva2VuTW9kaWZpZXJzLmlkJywgJ1RoZSBpZGVudGlmaWVyIG9mIHRoZSBzZW1hbnRpYyB0b2tlbiBtb2RpZmllcicpLFxuXHRcdFx0XHRcdHBhdHRlcm46IHR5cGVBbmRNb2RpZmllcklkUGF0dGVybixcblx0XHRcdFx0XHRwYXR0ZXJuRXJyb3JNZXNzYWdlOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnNlbWFudGljVG9rZW5Nb2RpZmllcnMuaWQuZm9ybWF0JywgJ0lkZW50aWZpZXJzIHNob3VsZCBiZSBpbiB0aGUgZm9ybSBsZXR0ZXJPckRpZ2l0W18tbGV0dGVyT3JEaWdpdF0qJylcblx0XHRcdFx0fSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5zZW1hbnRpY1Rva2VuTW9kaWZpZXJzLmRlc2NyaXB0aW9uJywgJ1RoZSBkZXNjcmlwdGlvbiBvZiB0aGUgc2VtYW50aWMgdG9rZW4gbW9kaWZpZXInKVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59KTtcblxuY29uc3QgdG9rZW5TdHlsZURlZmF1bHRzRXh0UG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJVG9rZW5TdHlsZURlZmF1bHRFeHRlbnNpb25Qb2ludFtdPih7XG5cdGV4dGVuc2lvblBvaW50OiAnc2VtYW50aWNUb2tlblNjb3BlcycsXG5cdGpzb25TY2hlbWE6IHtcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5zZW1hbnRpY1Rva2VuU2NvcGVzJywgJ0NvbnRyaWJ1dGVzIHNlbWFudGljIHRva2VuIHNjb3BlIG1hcHMuJyksXG5cdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRpdGVtczoge1xuXHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdGxhbmd1YWdlOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuc2VtYW50aWNUb2tlblNjb3Blcy5sYW5ndWFnZXMnLCAnTGlzdHMgdGhlIGxhbmd1Z2UgZm9yIHdoaWNoIHRoZSBkZWZhdWx0cyBhcmUuJyksXG5cdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0fSxcblx0XHRcdFx0c2NvcGVzOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuc2VtYW50aWNUb2tlblNjb3Blcy5zY29wZXMnLCAnTWFwcyBhIHNlbWFudGljIHRva2VuIChkZXNjcmliZWQgYnkgc2VtYW50aWMgdG9rZW4gc2VsZWN0b3IpIHRvIG9uZSBvciBtb3JlIHRleHRNYXRlIHNjb3BlcyB1c2VkIHRvIHJlcHJlc2VudCB0aGF0IHRva2VuLicpLFxuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5cbmV4cG9ydCBjbGFzcyBUb2tlbkNsYXNzaWZpY2F0aW9uRXh0ZW5zaW9uUG9pbnRzIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRmdW5jdGlvbiB2YWxpZGF0ZVR5cGVPck1vZGlmaWVyKGNvbnRyaWJ1dGlvbjogSVRva2VuVHlwZUV4dGVuc2lvblBvaW50IHwgSVRva2VuTW9kaWZpZXJFeHRlbnNpb25Qb2ludCwgZXh0ZW5zaW9uUG9pbnQ6IHN0cmluZywgY29sbGVjdG9yOiBFeHRlbnNpb25NZXNzYWdlQ29sbGVjdG9yKTogYm9vbGVhbiB7XG5cdFx0XHRpZiAodHlwZW9mIGNvbnRyaWJ1dGlvbi5pZCAhPT0gJ3N0cmluZycgfHwgY29udHJpYnV0aW9uLmlkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmlkJywgXCInY29uZmlndXJhdGlvbi57MH0uaWQnIG11c3QgYmUgZGVmaW5lZCBhbmQgY2FuIG5vdCBiZSBlbXB0eVwiLCBleHRlbnNpb25Qb2ludCkpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWNvbnRyaWJ1dGlvbi5pZC5tYXRjaCh0eXBlQW5kTW9kaWZpZXJJZFBhdHRlcm4pKSB7XG5cdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuaWQuZm9ybWF0JywgXCInY29uZmlndXJhdGlvbi57MH0uaWQnIG11c3QgZm9sbG93IHRoZSBwYXR0ZXJuIGxldHRlck9yRGlnaXRbLV9sZXR0ZXJPckRpZ2l0XSpcIiwgZXh0ZW5zaW9uUG9pbnQpKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc3VwZXJUeXBlID0gKGNvbnRyaWJ1dGlvbiBhcyBJVG9rZW5UeXBlRXh0ZW5zaW9uUG9pbnQpLnN1cGVyVHlwZTtcblx0XHRcdGlmIChzdXBlclR5cGUgJiYgIXN1cGVyVHlwZS5tYXRjaCh0eXBlQW5kTW9kaWZpZXJJZFBhdHRlcm4pKSB7XG5cdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuc3VwZXJUeXBlLmZvcm1hdCcsIFwiJ2NvbmZpZ3VyYXRpb24uezB9LnN1cGVyVHlwZScgbXVzdCBmb2xsb3cgdGhlIHBhdHRlcm4gbGV0dGVyT3JEaWdpdFstX2xldHRlck9yRGlnaXRdKlwiLCBleHRlbnNpb25Qb2ludCkpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRpZiAodHlwZW9mIGNvbnRyaWJ1dGlvbi5kZXNjcmlwdGlvbiAhPT0gJ3N0cmluZycgfHwgY29udHJpYnV0aW9uLmlkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRjb2xsZWN0b3IuZXJyb3IobmxzLmxvY2FsaXplKCdpbnZhbGlkLmRlc2NyaXB0aW9uJywgXCInY29uZmlndXJhdGlvbi57MH0uZGVzY3JpcHRpb24nIG11c3QgYmUgZGVmaW5lZCBhbmQgY2FuIG5vdCBiZSBlbXB0eVwiLCBleHRlbnNpb25Qb2ludCkpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHR0b2tlblR5cGVFeHRQb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zLCBkZWx0YSkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZGVsdGEuYWRkZWQpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uVmFsdWUgPSA8SVRva2VuVHlwZUV4dGVuc2lvblBvaW50W10+ZXh0ZW5zaW9uLnZhbHVlO1xuXHRcdFx0XHRjb25zdCBjb2xsZWN0b3IgPSBleHRlbnNpb24uY29sbGVjdG9yO1xuXG5cdFx0XHRcdGlmICghZXh0ZW5zaW9uVmFsdWUgfHwgIUFycmF5LmlzQXJyYXkoZXh0ZW5zaW9uVmFsdWUpKSB7XG5cdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5zZW1hbnRpY1Rva2VuVHlwZUNvbmZpZ3VyYXRpb24nLCBcIidjb25maWd1cmF0aW9uLnNlbWFudGljVG9rZW5UeXBlJyBtdXN0IGJlIGFuIGFycmF5XCIpKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Zm9yIChjb25zdCBjb250cmlidXRpb24gb2YgZXh0ZW5zaW9uVmFsdWUpIHtcblx0XHRcdFx0XHRpZiAodmFsaWRhdGVUeXBlT3JNb2RpZmllcihjb250cmlidXRpb24sICdzZW1hbnRpY1Rva2VuVHlwZScsIGNvbGxlY3RvcikpIHtcblx0XHRcdFx0XHRcdHRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeS5yZWdpc3RlclRva2VuVHlwZShjb250cmlidXRpb24uaWQsIGNvbnRyaWJ1dGlvbi5kZXNjcmlwdGlvbiwgY29udHJpYnV0aW9uLnN1cGVyVHlwZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBkZWx0YS5yZW1vdmVkKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblZhbHVlID0gPElUb2tlblR5cGVFeHRlbnNpb25Qb2ludFtdPmV4dGVuc2lvbi52YWx1ZTtcblx0XHRcdFx0Zm9yIChjb25zdCBjb250cmlidXRpb24gb2YgZXh0ZW5zaW9uVmFsdWUpIHtcblx0XHRcdFx0XHR0b2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkuZGVyZWdpc3RlclRva2VuVHlwZShjb250cmlidXRpb24uaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dG9rZW5Nb2RpZmllckV4dFBvaW50LnNldEhhbmRsZXIoKGV4dGVuc2lvbnMsIGRlbHRhKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBkZWx0YS5hZGRlZCkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25WYWx1ZSA9IDxJVG9rZW5Nb2RpZmllckV4dGVuc2lvblBvaW50W10+ZXh0ZW5zaW9uLnZhbHVlO1xuXHRcdFx0XHRjb25zdCBjb2xsZWN0b3IgPSBleHRlbnNpb24uY29sbGVjdG9yO1xuXG5cdFx0XHRcdGlmICghZXh0ZW5zaW9uVmFsdWUgfHwgIUFycmF5LmlzQXJyYXkoZXh0ZW5zaW9uVmFsdWUpKSB7XG5cdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5zZW1hbnRpY1Rva2VuTW9kaWZpZXJDb25maWd1cmF0aW9uJywgXCInY29uZmlndXJhdGlvbi5zZW1hbnRpY1Rva2VuTW9kaWZpZXInIG11c3QgYmUgYW4gYXJyYXlcIikpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiBleHRlbnNpb25WYWx1ZSkge1xuXHRcdFx0XHRcdGlmICh2YWxpZGF0ZVR5cGVPck1vZGlmaWVyKGNvbnRyaWJ1dGlvbiwgJ3NlbWFudGljVG9rZW5Nb2RpZmllcicsIGNvbGxlY3RvcikpIHtcblx0XHRcdFx0XHRcdHRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeS5yZWdpc3RlclRva2VuTW9kaWZpZXIoY29udHJpYnV0aW9uLmlkLCBjb250cmlidXRpb24uZGVzY3JpcHRpb24pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZGVsdGEucmVtb3ZlZCkge1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25WYWx1ZSA9IDxJVG9rZW5Nb2RpZmllckV4dGVuc2lvblBvaW50W10+ZXh0ZW5zaW9uLnZhbHVlO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiBleHRlbnNpb25WYWx1ZSkge1xuXHRcdFx0XHRcdHRva2VuQ2xhc3NpZmljYXRpb25SZWdpc3RyeS5kZXJlZ2lzdGVyVG9rZW5Nb2RpZmllcihjb250cmlidXRpb24uaWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dG9rZW5TdHlsZURlZmF1bHRzRXh0UG9pbnQuc2V0SGFuZGxlcigoZXh0ZW5zaW9ucywgZGVsdGEpID0+IHtcblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGRlbHRhLmFkZGVkKSB7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvblZhbHVlID0gPElUb2tlblN0eWxlRGVmYXVsdEV4dGVuc2lvblBvaW50W10+ZXh0ZW5zaW9uLnZhbHVlO1xuXHRcdFx0XHRjb25zdCBjb2xsZWN0b3IgPSBleHRlbnNpb24uY29sbGVjdG9yO1xuXG5cdFx0XHRcdGlmICghZXh0ZW5zaW9uVmFsdWUgfHwgIUFycmF5LmlzQXJyYXkoZXh0ZW5zaW9uVmFsdWUpKSB7XG5cdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5zZW1hbnRpY1Rva2VuU2NvcGVzLmNvbmZpZ3VyYXRpb24nLCBcIidjb25maWd1cmF0aW9uLnNlbWFudGljVG9rZW5TY29wZXMnIG11c3QgYmUgYW4gYXJyYXlcIikpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGNvbnN0IGNvbnRyaWJ1dGlvbiBvZiBleHRlbnNpb25WYWx1ZSkge1xuXHRcdFx0XHRcdGlmIChjb250cmlidXRpb24ubGFuZ3VhZ2UgJiYgdHlwZW9mIGNvbnRyaWJ1dGlvbi5sYW5ndWFnZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdGNvbGxlY3Rvci5lcnJvcihubHMubG9jYWxpemUoJ2ludmFsaWQuc2VtYW50aWNUb2tlblNjb3Blcy5sYW5ndWFnZScsIFwiJ2NvbmZpZ3VyYXRpb24uc2VtYW50aWNUb2tlblNjb3Blcy5sYW5ndWFnZScgbXVzdCBiZSBhIHN0cmluZ1wiKSk7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKCFjb250cmlidXRpb24uc2NvcGVzIHx8IHR5cGVvZiBjb250cmlidXRpb24uc2NvcGVzICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5zZW1hbnRpY1Rva2VuU2NvcGVzLnNjb3BlcycsIFwiJ2NvbmZpZ3VyYXRpb24uc2VtYW50aWNUb2tlblNjb3Blcy5zY29wZXMnIG11c3QgYmUgZGVmaW5lZCBhcyBhbiBvYmplY3RcIikpO1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGZvciAoY29uc3Qgc2VsZWN0b3JTdHJpbmcgaW4gY29udHJpYnV0aW9uLnNjb3Blcykge1xuXHRcdFx0XHRcdFx0Y29uc3QgdG1TY29wZXMgPSBjb250cmlidXRpb24uc2NvcGVzW3NlbGVjdG9yU3RyaW5nXTtcblx0XHRcdFx0XHRcdGlmICghQXJyYXkuaXNBcnJheSh0bVNjb3BlcykgfHwgdG1TY29wZXMuc29tZShsID0+IHR5cGVvZiBsICE9PSAnc3RyaW5nJykpIHtcblx0XHRcdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5zZW1hbnRpY1Rva2VuU2NvcGVzLnNjb3Blcy52YWx1ZScsIFwiJ2NvbmZpZ3VyYXRpb24uc2VtYW50aWNUb2tlblNjb3Blcy5zY29wZXMnIHZhbHVlcyBtdXN0IGJlIGFuIGFycmF5IG9mIHN0cmluZ3NcIikpO1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHNlbGVjdG9yID0gdG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LnBhcnNlVG9rZW5TZWxlY3RvcihzZWxlY3RvclN0cmluZywgY29udHJpYnV0aW9uLmxhbmd1YWdlKTtcblx0XHRcdFx0XHRcdFx0dG9rZW5DbGFzc2lmaWNhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyVG9rZW5TdHlsZURlZmF1bHQoc2VsZWN0b3IsIHsgc2NvcGVzVG9Qcm9iZTogdG1TY29wZXMubWFwKHMgPT4gcy5zcGxpdCgnICcpKSB9KTtcblx0XHRcdFx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0XHRcdFx0Y29sbGVjdG9yLmVycm9yKG5scy5sb2NhbGl6ZSgnaW52YWxpZC5zZW1hbnRpY1Rva2VuU2NvcGVzLnNjb3Blcy5zZWxlY3RvcicsIFwiY29uZmlndXJhdGlvbi5zZW1hbnRpY1Rva2VuU2NvcGVzLnNjb3Blcyc6IFByb2JsZW1zIHBhcnNpbmcgc2VsZWN0b3IgezB9LlwiLCBzZWxlY3RvclN0cmluZykpO1xuXHRcdFx0XHRcdFx0XHQvLyBpbnZhbGlkIHNlbGVjdG9yLCBpZ25vcmVcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgZXh0ZW5zaW9uIG9mIGRlbHRhLnJlbW92ZWQpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uVmFsdWUgPSA8SVRva2VuU3R5bGVEZWZhdWx0RXh0ZW5zaW9uUG9pbnRbXT5leHRlbnNpb24udmFsdWU7XG5cdFx0XHRcdGZvciAoY29uc3QgY29udHJpYnV0aW9uIG9mIGV4dGVuc2lvblZhbHVlKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzZWxlY3RvclN0cmluZyBpbiBjb250cmlidXRpb24uc2NvcGVzKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB0bVNjb3BlcyA9IGNvbnRyaWJ1dGlvbi5zY29wZXNbc2VsZWN0b3JTdHJpbmddO1xuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0Y29uc3Qgc2VsZWN0b3IgPSB0b2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkucGFyc2VUb2tlblNlbGVjdG9yKHNlbGVjdG9yU3RyaW5nLCBjb250cmlidXRpb24ubGFuZ3VhZ2UpO1xuXHRcdFx0XHRcdFx0XHR0b2tlbkNsYXNzaWZpY2F0aW9uUmVnaXN0cnkucmVnaXN0ZXJUb2tlblN0eWxlRGVmYXVsdChzZWxlY3RvciwgeyBzY29wZXNUb1Byb2JlOiB0bVNjb3Blcy5tYXAocyA9PiBzLnNwbGl0KCcgJykpIH0pO1xuXHRcdFx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdFx0XHQvLyBpbnZhbGlkIHNlbGVjdG9yLCBpZ25vcmVcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuXG5cblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsMEJBQXFEO0FBQzlELFNBQVMsZ0NBQThELGdDQUFnQztBQWtCdkcsTUFBTSw4QkFBNEQsK0JBQStCO0FBRWpHLE1BQU0sb0JBQW9CLG1CQUFtQix1QkFBbUQ7QUFBQSxFQUMvRixnQkFBZ0I7QUFBQSxFQUNoQixZQUFZO0FBQUEsSUFDWCxhQUFhLElBQUksU0FBUyxrQ0FBa0MsbUNBQW1DO0FBQUEsSUFDL0YsTUFBTTtBQUFBLElBQ04sT0FBTztBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sWUFBWTtBQUFBLFFBQ1gsSUFBSTtBQUFBLFVBQ0gsTUFBTTtBQUFBLFVBQ04sYUFBYSxJQUFJLFNBQVMscUNBQXFDLDJDQUEyQztBQUFBLFVBQzFHLFNBQVM7QUFBQSxVQUNULHFCQUFxQixJQUFJLFNBQVMsNENBQTRDLG1FQUFtRTtBQUFBLFFBQ2xKO0FBQUEsUUFDQSxXQUFXO0FBQUEsVUFDVixNQUFNO0FBQUEsVUFDTixhQUFhLElBQUksU0FBUyw0Q0FBNEMsMkNBQTJDO0FBQUEsVUFDakgsU0FBUztBQUFBLFVBQ1QscUJBQXFCLElBQUksU0FBUyxtREFBbUQsbUVBQW1FO0FBQUEsUUFDeko7QUFBQSxRQUNBLGFBQWE7QUFBQSxVQUNaLE1BQU07QUFBQSxVQUNOLGFBQWEsSUFBSSxTQUFTLGlDQUFpQyw0Q0FBNEM7QUFBQSxRQUN4RztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUNELENBQUM7QUFFRCxNQUFNLHdCQUF3QixtQkFBbUIsdUJBQXVEO0FBQUEsRUFDdkcsZ0JBQWdCO0FBQUEsRUFDaEIsWUFBWTtBQUFBLElBQ1gsYUFBYSxJQUFJLFNBQVMsc0NB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
