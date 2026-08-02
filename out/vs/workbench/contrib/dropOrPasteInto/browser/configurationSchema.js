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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { editorConfigurationBaseNode } from "../../../../editor/common/config/editorConfigurationSchema.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { pasteAsCommandId } from "../../../../editor/contrib/dropOrPasteInto/browser/copyPasteContribution.js";
import { pasteAsPreferenceConfig } from "../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js";
import { dropAsPreferenceConfig } from "../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js";
import * as nls from "../../../../nls.js";
import { ConfigurationScope, Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
const dropEnumValues = [];
const dropAsPreferenceSchema = {
  type: "array",
  scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
  description: nls.localize("dropPreferredDescription", "Configures the preferred type of edit to use when dropping content.\n\nThis is an ordered list of edit kinds. The first available edit of a preferred kind will be used."),
  default: [],
  items: {
    description: nls.localize("dropKind", "The kind identifier of the drop edit."),
    anyOf: [
      { type: "string" },
      { enum: dropEnumValues }
    ]
  }
};
const pasteEnumValues = [];
const pasteAsPreferenceSchema = {
  type: "array",
  scope: ConfigurationScope.LANGUAGE_OVERRIDABLE,
  description: nls.localize("pastePreferredDescription", "Configures the preferred type of edit to use when pasting content.\n\nThis is an ordered list of edit kinds. The first available edit of a preferred kind will be used."),
  default: [],
  items: {
    description: nls.localize("pasteKind", "The kind identifier of the paste edit."),
    anyOf: [
      { type: "string" },
      { enum: pasteEnumValues }
    ]
  }
};
const editorConfiguration = Object.freeze({
  ...editorConfigurationBaseNode,
  properties: {
    [pasteAsPreferenceConfig]: pasteAsPreferenceSchema,
    [dropAsPreferenceConfig]: dropAsPreferenceSchema
  }
});
let DropOrPasteSchemaContribution = class extends Disposable {
  constructor(keybindingService, languageFeatures) {
    super();
    this.languageFeatures = languageFeatures;
    this._onDidChangeSchemaContributions = this._register(new Emitter());
    this._allProvidedDropKinds = [];
    this._allProvidedPasteKinds = [];
    this._register(
      Event.runAndSubscribe(
        Event.debounce(
          Event.any(languageFeatures.documentPasteEditProvider.onDidChange, languageFeatures.documentPasteEditProvider.onDidChange),
          () => {
          },
          1e3
        ),
        () => {
          this.updateProvidedKinds();
          this.updateConfigurationSchema();
          this._onDidChangeSchemaContributions.fire();
        }
      )
    );
    this._register(keybindingService.registerSchemaContribution({
      getSchemaAdditions: () => this.getKeybindingSchemaAdditions(),
      onDidChange: this._onDidChangeSchemaContributions.event
    }));
  }
  updateProvidedKinds() {
    const dropKinds = /* @__PURE__ */ new Map();
    for (const provider of this.languageFeatures.documentDropEditProvider.allNoModel()) {
      for (const kind of provider.providedDropEditKinds ?? []) {
        dropKinds.set(kind.value, kind);
      }
    }
    this._allProvidedDropKinds = Array.from(dropKinds.values());
    const pasteKinds = /* @__PURE__ */ new Map();
    for (const provider of this.languageFeatures.documentPasteEditProvider.allNoModel()) {
      for (const kind of provider.providedPasteEditKinds ?? []) {
        pasteKinds.set(kind.value, kind);
      }
    }
    this._allProvidedPasteKinds = Array.from(pasteKinds.values());
  }
  updateConfigurationSchema() {
    pasteEnumValues.length = 0;
    for (const codeActionKind of this._allProvidedPasteKinds) {
      pasteEnumValues.push(codeActionKind.value);
    }
    dropEnumValues.length = 0;
    for (const codeActionKind of this._allProvidedDropKinds) {
      dropEnumValues.push(codeActionKind.value);
    }
    Registry.as(Extensions.Configuration).notifyConfigurationSchemaUpdated(editorConfiguration);
  }
  getKeybindingSchemaAdditions() {
    return [
      {
        if: {
          required: ["command"],
          properties: {
            "command": { const: pasteAsCommandId }
          }
        },
        then: {
          properties: {
            "args": {
              oneOf: [
                {
                  required: ["kind"],
                  properties: {
                    "kind": {
                      anyOf: [
                        { enum: Array.from(this._allProvidedPasteKinds.map((x) => x.value)) },
                        { type: "string" }
                      ]
                    }
                  }
                },
                {
                  required: ["preferences"],
                  properties: {
                    "preferences": {
                      type: "array",
                      items: {
                        anyOf: [
                          { enum: Array.from(this._allProvidedPasteKinds.map((x) => x.value)) },
                          { type: "string" }
                        ]
                      }
                    }
                  }
                }
              ]
            }
          }
        }
      }
    ];
  }
};
DropOrPasteSchemaContribution.ID = "workbench.contrib.dropOrPasteIntoSchema";
DropOrPasteSchemaContribution = __decorateClass([
  __decorateParam(0, IKeybindingService),
  __decorateParam(1, ILanguageFeaturesService)
], DropOrPasteSchemaContribution);
export {
  DropOrPasteSchemaContribution,
  editorConfiguration
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2Ryb3BPclBhc3RlSW50by9icm93c2VyL2NvbmZpZ3VyYXRpb25TY2hlbWEudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEhpZXJhcmNoaWNhbEtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oaWVyYXJjaGljYWxLaW5kLmpzJztcbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVkaXRvckNvbmZpZ3VyYXRpb25CYXNlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvckNvbmZpZ3VyYXRpb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IHBhc3RlQXNDb21tYW5kSWQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9kcm9wT3JQYXN0ZUludG8vYnJvd3Nlci9jb3B5UGFzdGVDb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgcGFzdGVBc1ByZWZlcmVuY2VDb25maWcgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9kcm9wT3JQYXN0ZUludG8vYnJvd3Nlci9jb3B5UGFzdGVDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IGRyb3BBc1ByZWZlcmVuY2VDb25maWcgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9kcm9wT3JQYXN0ZUludG8vYnJvd3Nlci9kcm9wSW50b0VkaXRvckNvbnRyb2xsZXIuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uU2NvcGUsIEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uTm9kZSwgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSwgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5cbmNvbnN0IGRyb3BFbnVtVmFsdWVzOiBzdHJpbmdbXSA9IFtdO1xuXG5jb25zdCBkcm9wQXNQcmVmZXJlbmNlU2NoZW1hOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hID0ge1xuXHR0eXBlOiAnYXJyYXknLFxuXHRzY29wZTogQ29uZmlndXJhdGlvblNjb3BlLkxBTkdVQUdFX09WRVJSSURBQkxFLFxuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdkcm9wUHJlZmVycmVkRGVzY3JpcHRpb24nLCBcIkNvbmZpZ3VyZXMgdGhlIHByZWZlcnJlZCB0eXBlIG9mIGVkaXQgdG8gdXNlIHdoZW4gZHJvcHBpbmcgY29udGVudC5cXG5cXG5UaGlzIGlzIGFuIG9yZGVyZWQgbGlzdCBvZiBlZGl0IGtpbmRzLiBUaGUgZmlyc3QgYXZhaWxhYmxlIGVkaXQgb2YgYSBwcmVmZXJyZWQga2luZCB3aWxsIGJlIHVzZWQuXCIpLFxuXHRkZWZhdWx0OiBbXSxcblx0aXRlbXM6IHtcblx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdkcm9wS2luZCcsIFwiVGhlIGtpbmQgaWRlbnRpZmllciBvZiB0aGUgZHJvcCBlZGl0LlwiKSxcblx0XHRhbnlPZjogW1xuXHRcdFx0eyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0eyBlbnVtOiBkcm9wRW51bVZhbHVlcyB9XG5cdFx0XSxcblx0fVxufTtcblxuY29uc3QgcGFzdGVFbnVtVmFsdWVzOiBzdHJpbmdbXSA9IFtdO1xuXG5jb25zdCBwYXN0ZUFzUHJlZmVyZW5jZVNjaGVtYTogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSA9IHtcblx0dHlwZTogJ2FycmF5Jyxcblx0c2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSxcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncGFzdGVQcmVmZXJyZWREZXNjcmlwdGlvbicsIFwiQ29uZmlndXJlcyB0aGUgcHJlZmVycmVkIHR5cGUgb2YgZWRpdCB0byB1c2Ugd2hlbiBwYXN0aW5nIGNvbnRlbnQuXFxuXFxuVGhpcyBpcyBhbiBvcmRlcmVkIGxpc3Qgb2YgZWRpdCBraW5kcy4gVGhlIGZpcnN0IGF2YWlsYWJsZSBlZGl0IG9mIGEgcHJlZmVycmVkIGtpbmQgd2lsbCBiZSB1c2VkLlwiKSxcblx0ZGVmYXVsdDogW10sXG5cdGl0ZW1zOiB7XG5cdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgncGFzdGVLaW5kJywgXCJUaGUga2luZCBpZGVudGlmaWVyIG9mIHRoZSBwYXN0ZSBlZGl0LlwiKSxcblx0XHRhbnlPZjogW1xuXHRcdFx0eyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0eyBlbnVtOiBwYXN0ZUVudW1WYWx1ZXMgfVxuXHRcdF1cblx0fVxufTtcblxuZXhwb3J0IGNvbnN0IGVkaXRvckNvbmZpZ3VyYXRpb24gPSBPYmplY3QuZnJlZXplPElDb25maWd1cmF0aW9uTm9kZT4oe1xuXHQuLi5lZGl0b3JDb25maWd1cmF0aW9uQmFzZU5vZGUsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRbcGFzdGVBc1ByZWZlcmVuY2VDb25maWddOiBwYXN0ZUFzUHJlZmVyZW5jZVNjaGVtYSxcblx0XHRbZHJvcEFzUHJlZmVyZW5jZUNvbmZpZ106IGRyb3BBc1ByZWZlcmVuY2VTY2hlbWEsXG5cdH1cbn0pO1xuXG5leHBvcnQgY2xhc3MgRHJvcE9yUGFzdGVTY2hlbWFDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0cHVibGljIHN0YXRpYyBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5kcm9wT3JQYXN0ZUludG9TY2hlbWEnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2NoZW1hQ29udHJpYnV0aW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cdHByaXZhdGUgX2FsbFByb3ZpZGVkRHJvcEtpbmRzOiBIaWVyYXJjaGljYWxLaW5kW10gPSBbXTtcblx0cHJpdmF0ZSBfYWxsUHJvdmlkZWRQYXN0ZUtpbmRzOiBIaWVyYXJjaGljYWxLaW5kW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhbmd1YWdlRmVhdHVyZXM6IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoXG5cdFx0XHRFdmVudC5ydW5BbmRTdWJzY3JpYmUoXG5cdFx0XHRcdEV2ZW50LmRlYm91bmNlKFxuXHRcdFx0XHRcdEV2ZW50LmFueShsYW5ndWFnZUZlYXR1cmVzLmRvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIub25EaWRDaGFuZ2UsIGxhbmd1YWdlRmVhdHVyZXMuZG9jdW1lbnRQYXN0ZUVkaXRQcm92aWRlci5vbkRpZENoYW5nZSksXG5cdFx0XHRcdFx0KCkgPT4geyB9LFxuXHRcdFx0XHRcdDEwMDAsXG5cdFx0XHRcdCksICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZVByb3ZpZGVkS2luZHMoKTtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUNvbmZpZ3VyYXRpb25TY2hlbWEoKTtcblxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2NoZW1hQ29udHJpYnV0aW9ucy5maXJlKCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGtleWJpbmRpbmdTZXJ2aWNlLnJlZ2lzdGVyU2NoZW1hQ29udHJpYnV0aW9uKHtcblx0XHRcdGdldFNjaGVtYUFkZGl0aW9uczogKCkgPT4gdGhpcy5nZXRLZXliaW5kaW5nU2NoZW1hQWRkaXRpb25zKCksXG5cdFx0XHRvbkRpZENoYW5nZTogdGhpcy5fb25EaWRDaGFuZ2VTY2hlbWFDb250cmlidXRpb25zLmV2ZW50LFxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlUHJvdmlkZWRLaW5kcygpOiB2b2lkIHtcblx0XHQvLyBEcm9wXG5cdFx0Y29uc3QgZHJvcEtpbmRzID0gbmV3IE1hcDxzdHJpbmcsIEhpZXJhcmNoaWNhbEtpbmQ+KCk7XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLmxhbmd1YWdlRmVhdHVyZXMuZG9jdW1lbnREcm9wRWRpdFByb3ZpZGVyLmFsbE5vTW9kZWwoKSkge1xuXHRcdFx0Zm9yIChjb25zdCBraW5kIG9mIHByb3ZpZGVyLnByb3ZpZGVkRHJvcEVkaXRLaW5kcyA/PyBbXSkge1xuXHRcdFx0XHRkcm9wS2luZHMuc2V0KGtpbmQudmFsdWUsIGtpbmQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9hbGxQcm92aWRlZERyb3BLaW5kcyA9IEFycmF5LmZyb20oZHJvcEtpbmRzLnZhbHVlcygpKTtcblxuXHRcdC8vIFBhc3RlXG5cdFx0Y29uc3QgcGFzdGVLaW5kcyA9IG5ldyBNYXA8c3RyaW5nLCBIaWVyYXJjaGljYWxLaW5kPigpO1xuXHRcdGZvciAoY29uc3QgcHJvdmlkZXIgb2YgdGhpcy5sYW5ndWFnZUZlYXR1cmVzLmRvY3VtZW50UGFzdGVFZGl0UHJvdmlkZXIuYWxsTm9Nb2RlbCgpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGtpbmQgb2YgcHJvdmlkZXIucHJvdmlkZWRQYXN0ZUVkaXRLaW5kcyA/PyBbXSkge1xuXHRcdFx0XHRwYXN0ZUtpbmRzLnNldChraW5kLnZhbHVlLCBraW5kKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fYWxsUHJvdmlkZWRQYXN0ZUtpbmRzID0gQXJyYXkuZnJvbShwYXN0ZUtpbmRzLnZhbHVlcygpKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlQ29uZmlndXJhdGlvblNjaGVtYSgpOiB2b2lkIHtcblx0XHRwYXN0ZUVudW1WYWx1ZXMubGVuZ3RoID0gMDtcblx0XHRmb3IgKGNvbnN0IGNvZGVBY3Rpb25LaW5kIG9mIHRoaXMuX2FsbFByb3ZpZGVkUGFzdGVLaW5kcykge1xuXHRcdFx0cGFzdGVFbnVtVmFsdWVzLnB1c2goY29kZUFjdGlvbktpbmQudmFsdWUpO1xuXHRcdH1cblxuXHRcdGRyb3BFbnVtVmFsdWVzLmxlbmd0aCA9IDA7XG5cdFx0Zm9yIChjb25zdCBjb2RlQWN0aW9uS2luZCBvZiB0aGlzLl9hbGxQcm92aWRlZERyb3BLaW5kcykge1xuXHRcdFx0ZHJvcEVudW1WYWx1ZXMucHVzaChjb2RlQWN0aW9uS2luZC52YWx1ZSk7XG5cdFx0fVxuXG5cdFx0UmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKVxuXHRcdFx0Lm5vdGlmeUNvbmZpZ3VyYXRpb25TY2hlbWFVcGRhdGVkKGVkaXRvckNvbmZpZ3VyYXRpb24pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRLZXliaW5kaW5nU2NoZW1hQWRkaXRpb25zKCk6IElKU09OU2NoZW1hW10ge1xuXHRcdHJldHVybiBbXG5cdFx0XHR7XG5cdFx0XHRcdGlmOiB7XG5cdFx0XHRcdFx0cmVxdWlyZWQ6IFsnY29tbWFuZCddLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdCdjb21tYW5kJzogeyBjb25zdDogcGFzdGVBc0NvbW1hbmRJZCB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0aGVuOiB7XG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0J2FyZ3MnOiB7XG5cdFx0XHRcdFx0XHRcdG9uZU9mOiBbXG5cdFx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsna2luZCddLFxuXHRcdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHQna2luZCc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0eyBlbnVtOiBBcnJheS5mcm9tKHRoaXMuX2FsbFByb3ZpZGVkUGFzdGVLaW5kcy5tYXAoeCA9PiB4LnZhbHVlKSkgfSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbJ3ByZWZlcmVuY2VzJ10sXG5cdFx0XHRcdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdCdwcmVmZXJlbmNlcyc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7IGVudW06IEFycmF5LmZyb20odGhpcy5fYWxsUHJvdmlkZWRQYXN0ZUtpbmRzLm1hcCh4ID0+IHgudmFsdWUpKSB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdF07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxTQUFTLGFB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
