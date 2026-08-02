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
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { Emitter, Event } from "../../../../base/common/event.js";
import { HierarchicalKind } from "../../../../base/common/hierarchicalKind.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { editorConfigurationBaseNode } from "../../../../editor/common/config/editorConfigurationSchema.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { codeActionCommandId, refactorCommandId, sourceActionCommandId } from "../../../../editor/contrib/codeAction/browser/codeAction.js";
import { CodeActionKind } from "../../../../editor/contrib/codeAction/common/types.js";
import * as nls from "../../../../nls.js";
import { ConfigurationScope, Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
const createCodeActionsAutoSave = (description) => {
  return {
    type: "string",
    enum: ["always", "explicit", "never", true, false],
    enumDescriptions: [
      nls.localize("alwaysSave", "Triggers Code Actions on explicit saves and auto saves triggered by window or focus changes."),
      nls.localize("explicitSave", "Triggers Code Actions only when explicitly saved"),
      nls.localize("neverSave", "Never triggers Code Actions on save"),
      nls.localize("explicitSaveBoolean", 'Triggers Code Actions only when explicitly saved. This value will be deprecated in favor of "explicit".'),
      nls.localize("neverSaveBoolean", 'Never triggers Code Actions on save. This value will be deprecated in favor of "never".')
    ],
    default: "explicit",
    description
  };
};
const createNotebookCodeActionsAutoSave = (description) => {
  return {
    type: ["string", "boolean"],
    enum: ["explicit", "never", true, false],
    enumDescriptions: [
      nls.localize("explicit", "Triggers Code Actions only when explicitly saved."),
      nls.localize("never", "Never triggers Code Actions on save."),
      nls.localize("explicitBoolean", 'Triggers Code Actions only when explicitly saved. This value will be deprecated in favor of "explicit".'),
      nls.localize("neverBoolean", 'Triggers Code Actions only when explicitly saved. This value will be deprecated in favor of "never".')
    ],
    default: "explicit",
    description
  };
};
const codeActionsOnSaveSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: {
        type: "string"
      }
    },
    {
      type: "array",
      items: { type: "string" }
    }
  ],
  markdownDescription: nls.localize("editor.codeActionsOnSave", 'Run Code Actions for the editor on save. Code Actions must be specified and the editor must not be shutting down. When {0} is set to `afterDelay`, Code Actions will only be run when the file is saved explicitly. Example: `"source.organizeImports": "explicit" `', "`#files.autoSave#`"),
  type: ["object", "array"],
  additionalProperties: {
    type: "string",
    enum: ["always", "explicit", "never", true, false]
  },
  default: {},
  scope: ConfigurationScope.LANGUAGE_OVERRIDABLE
};
const editorConfiguration = Object.freeze({
  ...editorConfigurationBaseNode,
  properties: {
    "editor.codeActionsOnSave": codeActionsOnSaveSchema
  }
});
const notebookCodeActionsOnSaveSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: {
        type: "string"
      }
    },
    {
      type: "array",
      items: { type: "string" }
    }
  ],
  markdownDescription: nls.localize("notebook.codeActionsOnSave", 'Run a series of Code Actions for a notebook on save. Code Actions must be specified and the editor must not be shutting down. When {0} is set to `afterDelay`, Code Actions will only be run when the file is saved explicitly. Example: `"notebook.source.organizeImports": "explicit"`', "`#files.autoSave#`"),
  type: "object",
  additionalProperties: {
    type: ["string", "boolean"],
    enum: ["explicit", "never", true, false]
    // enum: ['explicit', 'always', 'never'], -- autosave support needs to be built first
    // nls.localize('always', 'Always triggers Code Actions on save, including autosave, focus, and window change events.'),
  },
  default: {}
};
const notebookEditorConfiguration = Object.freeze({
  ...editorConfigurationBaseNode,
  properties: {
    "notebook.codeActionsOnSave": notebookCodeActionsOnSaveSchema
  }
});
let CodeActionsContribution = class extends Disposable {
  constructor(keybindingService, languageFeatures) {
    super();
    this.languageFeatures = languageFeatures;
    this._onDidChangeSchemaContributions = this._register(new Emitter());
    this._allProvidedCodeActionKinds = [];
    this._register(
      Event.runAndSubscribe(
        Event.debounce(languageFeatures.codeActionProvider.onDidChange, () => {
        }, 1e3),
        () => {
          this._allProvidedCodeActionKinds = this.getAllProvidedCodeActionKinds();
          this.updateConfigurationSchema(this._allProvidedCodeActionKinds);
          this._onDidChangeSchemaContributions.fire();
        }
      )
    );
    this._register(keybindingService.registerSchemaContribution({
      getSchemaAdditions: () => this.getKeybindingSchemaAdditions(),
      onDidChange: this._onDidChangeSchemaContributions.event
    }));
  }
  getAllProvidedCodeActionKinds() {
    const out = /* @__PURE__ */ new Map();
    for (const provider of this.languageFeatures.codeActionProvider.allNoModel()) {
      for (const kind of provider.providedCodeActionKinds ?? []) {
        out.set(kind, new HierarchicalKind(kind));
      }
    }
    return Array.from(out.values());
  }
  updateConfigurationSchema(allProvidedKinds) {
    const properties = { ...codeActionsOnSaveSchema.properties };
    const notebookProperties = { ...notebookCodeActionsOnSaveSchema.properties };
    for (const codeActionKind of allProvidedKinds) {
      if (CodeActionKind.Source.contains(codeActionKind) && !properties[codeActionKind.value]) {
        properties[codeActionKind.value] = createCodeActionsAutoSave(nls.localize("codeActionsOnSave.generic", "Controls whether '{0}' actions should be run on file save.", codeActionKind.value));
        notebookProperties[codeActionKind.value] = createNotebookCodeActionsAutoSave(nls.localize("codeActionsOnSave.generic", "Controls whether '{0}' actions should be run on file save.", codeActionKind.value));
      }
    }
    codeActionsOnSaveSchema.properties = properties;
    notebookCodeActionsOnSaveSchema.properties = notebookProperties;
    Registry.as(Extensions.Configuration).notifyConfigurationSchemaUpdated(editorConfiguration);
  }
  getKeybindingSchemaAdditions() {
    const conditionalSchema = (command, kinds) => {
      return {
        if: {
          required: ["command"],
          properties: {
            "command": { const: command }
          }
        },
        then: {
          properties: {
            "args": {
              required: ["kind"],
              properties: {
                "kind": {
                  anyOf: [
                    { enum: Array.from(kinds) },
                    { type: "string" }
                  ]
                }
              }
            }
          }
        }
      };
    };
    const filterProvidedKinds = (ofKind) => {
      const out = /* @__PURE__ */ new Set();
      for (const providedKind of this._allProvidedCodeActionKinds) {
        if (ofKind.contains(providedKind)) {
          out.add(providedKind.value);
        }
      }
      return Array.from(out);
    };
    return [
      conditionalSchema(codeActionCommandId, filterProvidedKinds(HierarchicalKind.Empty)),
      conditionalSchema(refactorCommandId, filterProvidedKinds(CodeActionKind.Refactor)),
      conditionalSchema(sourceActionCommandId, filterProvidedKinds(CodeActionKind.Source))
    ];
  }
};
CodeActionsContribution = __decorateClass([
  __decorateParam(0, IKeybindingService),
  __decorateParam(1, ILanguageFeaturesService)
], CodeActionsContribution);
export {
  CodeActionsContribution,
  editorConfiguration,
  notebookEditorConfiguration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVBY3Rpb25zL2Jyb3dzZXIvY29kZUFjdGlvbnNDb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEhpZXJhcmNoaWNhbEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oaWVyYXJjaGljYWxLaW5kLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hLCBJSlNPTlNjaGVtYU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlZGl0b3JDb25maWd1cmF0aW9uQmFzZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JDb25maWd1cmF0aW9uU2NoZW1hLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBjb2RlQWN0aW9uQ29tbWFuZElkLCByZWZhY3RvckNvbW1hbmRJZCwgc291cmNlQWN0aW9uQ29tbWFuZElkIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29kZUFjdGlvbi9icm93c2VyL2NvZGVBY3Rpb24uanMnO1xuaW1wb3J0IHsgQ29kZUFjdGlvbktpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9jb2RlQWN0aW9uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25Ob2RlLCBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcblxuY29uc3QgY3JlYXRlQ29kZUFjdGlvbnNBdXRvU2F2ZSA9IChkZXNjcmlwdGlvbjogc3RyaW5nKTogSUpTT05TY2hlbWEgPT4ge1xuXHRyZXR1cm4ge1xuXHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdGVudW06IFsnYWx3YXlzJywgJ2V4cGxpY2l0JywgJ25ldmVyJywgdHJ1ZSwgZmFsc2VdLFxuXHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdG5scy5sb2NhbGl6ZSgnYWx3YXlzU2F2ZScsICdUcmlnZ2VycyBDb2RlIEFjdGlvbnMgb24gZXhwbGljaXQgc2F2ZXMgYW5kIGF1dG8gc2F2ZXMgdHJpZ2dlcmVkIGJ5IHdpbmRvdyBvciBmb2N1cyBjaGFuZ2VzLicpLFxuXHRcdFx0bmxzLmxvY2FsaXplKCdleHBsaWNpdFNhdmUnLCAnVHJpZ2dlcnMgQ29kZSBBY3Rpb25zIG9ubHkgd2hlbiBleHBsaWNpdGx5IHNhdmVkJyksXG5cdFx0XHRubHMubG9jYWxpemUoJ25ldmVyU2F2ZScsICdOZXZlciB0cmlnZ2VycyBDb2RlIEFjdGlvbnMgb24gc2F2ZScpLFxuXHRcdFx0bmxzLmxvY2FsaXplKCdleHBsaWNpdFNhdmVCb29sZWFuJywgJ1RyaWdnZXJzIENvZGUgQWN0aW9ucyBvbmx5IHdoZW4gZXhwbGljaXRseSBzYXZlZC4gVGhpcyB2YWx1ZSB3aWxsIGJlIGRlcHJlY2F0ZWQgaW4gZmF2b3Igb2YgXCJleHBsaWNpdFwiLicpLFxuXHRcdFx0bmxzLmxvY2FsaXplKCduZXZlclNhdmVCb29sZWFuJywgJ05ldmVyIHRyaWdnZXJzIENvZGUgQWN0aW9ucyBvbiBzYXZlLiBUaGlzIHZhbHVlIHdpbGwgYmUgZGVwcmVjYXRlZCBpbiBmYXZvciBvZiBcIm5ldmVyXCIuJylcblx0XHRdLFxuXHRcdGRlZmF1bHQ6ICdleHBsaWNpdCcsXG5cdFx0ZGVzY3JpcHRpb246IGRlc2NyaXB0aW9uXG5cdH07XG59O1xuXG5jb25zdCBjcmVhdGVOb3RlYm9va0NvZGVBY3Rpb25zQXV0b1NhdmUgPSAoZGVzY3JpcHRpb246IHN0cmluZyk6IElKU09OU2NoZW1hID0+IHtcblx0cmV0dXJuIHtcblx0XHR0eXBlOiBbJ3N0cmluZycsICdib29sZWFuJ10sXG5cdFx0ZW51bTogWydleHBsaWNpdCcsICduZXZlcicsIHRydWUsIGZhbHNlXSxcblx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRubHMubG9jYWxpemUoJ2V4cGxpY2l0JywgJ1RyaWdnZXJzIENvZGUgQWN0aW9ucyBvbmx5IHdoZW4gZXhwbGljaXRseSBzYXZlZC4nKSxcblx0XHRcdG5scy5sb2NhbGl6ZSgnbmV2ZXInLCAnTmV2ZXIgdHJpZ2dlcnMgQ29kZSBBY3Rpb25zIG9uIHNhdmUuJyksXG5cdFx0XHRubHMubG9jYWxpemUoJ2V4cGxpY2l0Qm9vbGVhbicsICdUcmlnZ2VycyBDb2RlIEFjdGlvbnMgb25seSB3aGVuIGV4cGxpY2l0bHkgc2F2ZWQuIFRoaXMgdmFsdWUgd2lsbCBiZSBkZXByZWNhdGVkIGluIGZhdm9yIG9mIFwiZXhwbGljaXRcIi4nKSxcblx0XHRcdG5scy5sb2NhbGl6ZSgnbmV2ZXJCb29sZWFuJywgJ1RyaWdnZXJzIENvZGUgQWN0aW9ucyBvbmx5IHdoZW4gZXhwbGljaXRseSBzYXZlZC4gVGhpcyB2YWx1ZSB3aWxsIGJlIGRlcHJlY2F0ZWQgaW4gZmF2b3Igb2YgXCJuZXZlclwiLicpXG5cdFx0XSxcblx0XHRkZWZhdWx0OiAnZXhwbGljaXQnLFxuXHRcdGRlc2NyaXB0aW9uOiBkZXNjcmlwdGlvblxuXHR9O1xufTtcblxuXG5jb25zdCBjb2RlQWN0aW9uc09uU2F2ZVNjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSA9IHtcblx0b25lT2Y6IFtcblx0XHR7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH1cblx0XHR9XG5cdF0sXG5cdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnZWRpdG9yLmNvZGVBY3Rpb25zT25TYXZlJywgJ1J1biBDb2RlIEFjdGlvbnMgZm9yIHRoZSBlZGl0b3Igb24gc2F2ZS4gQ29kZSBBY3Rpb25zIG11c3QgYmUgc3BlY2lmaWVkIGFuZCB0aGUgZWRpdG9yIG11c3Qgbm90IGJlIHNodXR0aW5nIGRvd24uIFdoZW4gezB9IGlzIHNldCB0byBgYWZ0ZXJEZWxheWAsIENvZGUgQWN0aW9ucyB3aWxsIG9ubHkgYmUgcnVuIHdoZW4gdGhlIGZpbGUgaXMgc2F2ZWQgZXhwbGljaXRseS4gRXhhbXBsZTogYFwic291cmNlLm9yZ2FuaXplSW1wb3J0c1wiOiBcImV4cGxpY2l0XCIgYCcsICdgI2ZpbGVzLmF1dG9TYXZlI2AnKSxcblx0dHlwZTogWydvYmplY3QnLCAnYXJyYXknXSxcblx0YWRkaXRpb25hbFByb3BlcnRpZXM6IHtcblx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRlbnVtOiBbJ2Fsd2F5cycsICdleHBsaWNpdCcsICduZXZlcicsIHRydWUsIGZhbHNlXSxcblx0fSxcblx0ZGVmYXVsdDoge30sXG5cdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUsXG59O1xuXG5leHBvcnQgY29uc3QgZWRpdG9yQ29uZmlndXJhdGlvbiA9IE9iamVjdC5mcmVlemU8SUNvbmZpZ3VyYXRpb25Ob2RlPih7XG5cdC4uLmVkaXRvckNvbmZpZ3VyYXRpb25CYXNlTm9kZSxcblx0cHJvcGVydGllczoge1xuXHRcdCdlZGl0b3IuY29kZUFjdGlvbnNPblNhdmUnOiBjb2RlQWN0aW9uc09uU2F2ZVNjaGVtYVxuXHR9XG59KTtcblxuY29uc3Qgbm90ZWJvb2tDb2RlQWN0aW9uc09uU2F2ZVNjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSA9IHtcblx0b25lT2Y6IFtcblx0XHR7XG5cdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHR9LFxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH1cblx0XHR9XG5cdF0sXG5cdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2suY29kZUFjdGlvbnNPblNhdmUnLCAnUnVuIGEgc2VyaWVzIG9mIENvZGUgQWN0aW9ucyBmb3IgYSBub3RlYm9vayBvbiBzYXZlLiBDb2RlIEFjdGlvbnMgbXVzdCBiZSBzcGVjaWZpZWQgYW5kIHRoZSBlZGl0b3IgbXVzdCBub3QgYmUgc2h1dHRpbmcgZG93bi4gV2hlbiB7MH0gaXMgc2V0IHRvIGBhZnRlckRlbGF5YCwgQ29kZSBBY3Rpb25zIHdpbGwgb25seSBiZSBydW4gd2hlbiB0aGUgZmlsZSBpcyBzYXZlZCBleHBsaWNpdGx5LiBFeGFtcGxlOiBgXCJub3RlYm9vay5zb3VyY2Uub3JnYW5pemVJbXBvcnRzXCI6IFwiZXhwbGljaXRcImAnLCAnYCNmaWxlcy5hdXRvU2F2ZSNgJyksXG5cdHR5cGU6ICdvYmplY3QnLFxuXHRhZGRpdGlvbmFsUHJvcGVydGllczoge1xuXHRcdHR5cGU6IFsnc3RyaW5nJywgJ2Jvb2xlYW4nXSxcblx0XHRlbnVtOiBbJ2V4cGxpY2l0JywgJ25ldmVyJywgdHJ1ZSwgZmFsc2VdLFxuXHRcdC8vIGVudW06IFsnZXhwbGljaXQnLCAnYWx3YXlzJywgJ25ldmVyJ10sIC0tIGF1dG9zYXZlIHN1cHBvcnQgbmVlZHMgdG8gYmUgYnVpbHQgZmlyc3Rcblx0XHQvLyBubHMubG9jYWxpemUoJ2Fsd2F5cycsICdBbHdheXMgdHJpZ2dlcnMgQ29kZSBBY3Rpb25zIG9uIHNhdmUsIGluY2x1ZGluZyBhdXRvc2F2ZSwgZm9jdXMsIGFuZCB3aW5kb3cgY2hhbmdlIGV2ZW50cy4nKSxcblx0fSxcblx0ZGVmYXVsdDoge31cbn07XG5cbmV4cG9ydCBjb25zdCBub3RlYm9va0VkaXRvckNvbmZpZ3VyYXRpb24gPSBPYmplY3QuZnJlZXplPElDb25maWd1cmF0aW9uTm9kZT4oe1xuXHQuLi5lZGl0b3JDb25maWd1cmF0aW9uQmFzZU5vZGUsXG5cdHByb3BlcnRpZXM6IHtcblx0XHQnbm90ZWJvb2suY29kZUFjdGlvbnNPblNhdmUnOiBub3RlYm9va0NvZGVBY3Rpb25zT25TYXZlU2NoZW1hXG5cdH1cbn0pO1xuXG5leHBvcnQgY2xhc3MgQ29kZUFjdGlvbnNDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTY2hlbWFDb250cmlidXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cblx0cHJpdmF0ZSBfYWxsUHJvdmlkZWRDb2RlQWN0aW9uS2luZHM6IEhpZXJhcmNoaWNhbEtpbmRbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VGZWF0dXJlczogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHQvLyBUT0RPOiBAanVzdHNjaGVuIGNhY2hpbmcgb2YgY29kZSBhY3Rpb25zIGJhc2VkIG9uIGV4dGVuc2lvbnMgbG9hZGVkOiBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjE2MDE5XG5cdFx0dGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRFdmVudC5ydW5BbmRTdWJzY3JpYmUoXG5cdFx0XHRcdEV2ZW50LmRlYm91bmNlKGxhbmd1YWdlRmVhdHVyZXMuY29kZUFjdGlvblByb3ZpZGVyLm9uRGlkQ2hhbmdlLCAoKSA9PiB7IH0sIDEwMDApLFxuXHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fYWxsUHJvdmlkZWRDb2RlQWN0aW9uS2luZHMgPSB0aGlzLmdldEFsbFByb3ZpZGVkQ29kZUFjdGlvbktpbmRzKCk7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVDb25maWd1cmF0aW9uU2NoZW1hKHRoaXMuX2FsbFByb3ZpZGVkQ29kZUFjdGlvbktpbmRzKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNjaGVtYUNvbnRyaWJ1dGlvbnMuZmlyZSgpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihrZXliaW5kaW5nU2VydmljZS5yZWdpc3RlclNjaGVtYUNvbnRyaWJ1dGlvbih7XG5cdFx0XHRnZXRTY2hlbWFBZGRpdGlvbnM6ICgpID0+IHRoaXMuZ2V0S2V5YmluZGluZ1NjaGVtYUFkZGl0aW9ucygpLFxuXHRcdFx0b25EaWRDaGFuZ2U6IHRoaXMuX29uRGlkQ2hhbmdlU2NoZW1hQ29udHJpYnV0aW9ucy5ldmVudCxcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldEFsbFByb3ZpZGVkQ29kZUFjdGlvbktpbmRzKCk6IEFycmF5PEhpZXJhcmNoaWNhbEtpbmQ+IHtcblx0XHRjb25zdCBvdXQgPSBuZXcgTWFwPHN0cmluZywgSGllcmFyY2hpY2FsS2luZD4oKTtcblx0XHRmb3IgKGNvbnN0IHByb3ZpZGVyIG9mIHRoaXMubGFuZ3VhZ2VGZWF0dXJlcy5jb2RlQWN0aW9uUHJvdmlkZXIuYWxsTm9Nb2RlbCgpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtpbmQgb2YgcHJvdmlkZXIucHJvdmlkZWRDb2RlQWN0aW9uS2luZHMgPz8gW10pIHtcblx0XHRcdFx0b3V0LnNldChraW5kLCBuZXcgSGllcmFyY2hpY2FsS2luZChraW5kKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBBcnJheS5mcm9tKG91dC52YWx1ZXMoKSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNvbmZpZ3VyYXRpb25TY2hlbWEoYWxsUHJvdmlkZWRLaW5kczogSXRlcmFibGU8SGllcmFyY2hpY2FsS2luZD4pOiB2b2lkIHtcblx0XHRjb25zdCBwcm9wZXJ0aWVzOiBJSlNPTlNjaGVtYU1hcCA9IHsgLi4uY29kZUFjdGlvbnNPblNhdmVTY2hlbWEucHJvcGVydGllcyB9O1xuXHRcdGNvbnN0IG5vdGVib29rUHJvcGVydGllczogSUpTT05TY2hlbWFNYXAgPSB7IC4uLm5vdGVib29rQ29kZUFjdGlvbnNPblNhdmVTY2hlbWEucHJvcGVydGllcyB9O1xuXHRcdGZvciAoY29uc3QgY29kZUFjdGlvbktpbmQgb2YgYWxsUHJvdmlkZWRLaW5kcykge1xuXHRcdFx0aWYgKENvZGVBY3Rpb25LaW5kLlNvdXJjZS5jb250YWlucyhjb2RlQWN0aW9uS2luZCkgJiYgIXByb3BlcnRpZXNbY29kZUFjdGlvbktpbmQudmFsdWVdKSB7XG5cdFx0XHRcdHByb3BlcnRpZXNbY29kZUFjdGlvbktpbmQudmFsdWVdID0gY3JlYXRlQ29kZUFjdGlvbnNBdXRvU2F2ZShubHMubG9jYWxpemUoJ2NvZGVBY3Rpb25zT25TYXZlLmdlbmVyaWMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgJ3swfScgYWN0aW9ucyBzaG91bGQgYmUgcnVuIG9uIGZpbGUgc2F2ZS5cIiwgY29kZUFjdGlvbktpbmQudmFsdWUpKTtcblx0XHRcdFx0bm90ZWJvb2tQcm9wZXJ0aWVzW2NvZGVBY3Rpb25LaW5kLnZhbHVlXSA9IGNyZWF0ZU5vdGVib29rQ29kZUFjdGlvbnNBdXRvU2F2ZShubHMubG9jYWxpemUoJ2NvZGVBY3Rpb25zT25TYXZlLmdlbmVyaWMnLCBcIkNvbnRyb2xzIHdoZXRoZXIgJ3swfScgYWN0aW9ucyBzaG91bGQgYmUgcnVuIG9uIGZpbGUgc2F2ZS5cIiwgY29kZUFjdGlvbktpbmQudmFsdWUpKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29kZUFjdGlvbnNPblNhdmVTY2hlbWEucHJvcGVydGllcyA9IHByb3BlcnRpZXM7XG5cdFx0bm90ZWJvb2tDb2RlQWN0aW9uc09uU2F2ZVNjaGVtYS5wcm9wZXJ0aWVzID0gbm90ZWJvb2tQcm9wZXJ0aWVzO1xuXG5cdFx0UmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKVxuXHRcdFx0Lm5vdGlmeUNvbmZpZ3VyYXRpb25TY2hlbWFVcGRhdGVkKGVkaXRvckNvbmZpZ3VyYXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRLZXliaW5kaW5nU2NoZW1hQWRkaXRpb25zKCk6IElKU09OU2NoZW1hW10ge1xuXHRcdGNvbnN0IGNvbmRpdGlvbmFsU2NoZW1hID0gKGNvbW1hbmQ6IHN0cmluZywga2luZHM6IHJlYWRvbmx5IHN0cmluZ1tdKTogSUpTT05TY2hlbWEgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aWY6IHtcblx0XHRcdFx0XHRyZXF1aXJlZDogWydjb21tYW5kJ10sXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiB7IGNvbnN0OiBjb21tYW5kIH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRoZW46IHtcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHQnYXJncyc6IHtcblx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsna2luZCddLFxuXHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0J2tpbmQnOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR7IGVudW06IEFycmF5LmZyb20oa2luZHMpIH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGNvbnN0IGZpbHRlclByb3ZpZGVkS2luZHMgPSAob2ZLaW5kOiBIaWVyYXJjaGljYWxLaW5kKTogc3RyaW5nW10gPT4ge1xuXHRcdFx0Y29uc3Qgb3V0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IHByb3ZpZGVkS2luZCBvZiB0aGlzLl9hbGxQcm92aWRlZENvZGVBY3Rpb25LaW5kcykge1xuXHRcdFx0XHRpZiAob2ZLaW5kLmNvbnRhaW5zKHByb3ZpZGVkS2luZCkpIHtcblx0XHRcdFx0XHRvdXQuYWRkKHByb3ZpZGVkS2luZC52YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBBcnJheS5mcm9tKG91dCk7XG5cdFx0fTtcblxuXHRcdHJldHVybiBbXG5cdFx0XHRjb25kaXRpb25hbFNjaGVtYShjb2RlQWN0aW9uQ29tbWFuZElkLCBmaWx0ZXJQcm92aWRlZEtpbmRzKEhpZXJhcmNoaWNhbEtpbmQuRW1wdHkpKSxcblx0XHRcdGNvbmRpdGlvbmFsU2NoZW1hKHJlZmFjdG9yQ29tbWFuZElkLCBmaWx0ZXJQcm92aWRlZEtpbmRzKENvZGVBY3Rpb25LaW5kLlJlZmFjdG9yKSksXG5cdFx0XHRjb25kaXRpb25hbFNjaGVtYShzb3VyY2VBY3Rpb25Db21tYW5kSWQsIGZpbHRlclByb3ZpZGVkS2luZHMoQ29kZUFjdGlvbktpbmQuU291cmNlKSksXG5cdFx0XTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHFCQUFxQixtQkFBbUIsNkJBQTZCO0FBQzlFLFNBQVMsc0JBQXNCO0FBQy9CLFlBQVksU0FBUztBQUNyQixTQUFTLG9CQUFvQixrQkFBNEY7QUFDekgsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxnQkFBZ0I7QUFHekIs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
