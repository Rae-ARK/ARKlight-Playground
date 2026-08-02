import { coalesce } from "../../../../base/common/arrays.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import * as nls from "../../../../nls.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { CustomEditorPriority } from "./customEditor.js";
import { Extensions } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { languagesExtPoint } from "../../../services/language/common/languageService.js";
const Fields = Object.freeze({
  viewType: "viewType",
  displayName: "displayName",
  selector: "selector",
  priority: "priority"
});
const PriorityFields = Object.freeze({
  textEditor: "textEditor",
  diffEditor: "diffEditor"
});
const customEditorPrioritySchema = {
  type: "string",
  enum: [
    CustomEditorPriority.default,
    CustomEditorPriority.option,
    CustomEditorPriority.explicit
  ],
  markdownEnumDescriptions: [
    nls.localize("contributes.priority.default", "The editor is automatically used when the user opens a resource, provided that no other default custom editors are registered for that resource."),
    nls.localize("contributes.priority.option", "The editor is not automatically used when the user opens a resource, but a user can switch to the editor using the `Reopen With` command."),
    nls.localize("contributes.priority.explicit", "The editor is not automatically used or opted into by an association from another editor mode. It can still be opened using the `Reopen With` command or an association configured specifically for this editor mode.")
  ]
};
const customEditorsContributionSchema = {
  type: "object",
  required: [
    Fields.viewType,
    Fields.displayName,
    Fields.selector
  ],
  additionalProperties: false,
  properties: {
    [Fields.viewType]: {
      type: "string",
      markdownDescription: nls.localize("contributes.viewType", "Identifier for the custom editor. This must be unique across all custom editors, so we recommend including your extension id as part of `viewType`. The `viewType` is used when registering custom editors with `vscode.registerCustomEditorProvider` and in the `onCustomEditor:${id}` [activation event](https://code.visualstudio.com/api/references/activation-events).")
    },
    [Fields.displayName]: {
      type: "string",
      description: nls.localize("contributes.displayName", "Human readable name of the custom editor. This is displayed to users when selecting which editor to use.")
    },
    [Fields.selector]: {
      type: "array",
      description: nls.localize("contributes.selector", "Set of globs that the custom editor is enabled for."),
      items: {
        type: "object",
        defaultSnippets: [{
          body: {
            filenamePattern: "$1"
          }
        }],
        additionalProperties: false,
        properties: {
          filenamePattern: {
            type: "string",
            description: nls.localize("contributes.selector.filenamePattern", "Glob that the custom editor is enabled for.")
          }
        }
      }
    },
    [Fields.priority]: {
      markdownDescription: nls.localize("contributes.priority", "Controls if the custom editor is enabled automatically when the user opens a file or diff editor. This may be overridden by users using the `workbench.editorAssociations` or `workbench.diffEditorAssociations` setting. When omitted, the custom editor defaults to `default` for the normal editor and `explicit` for diff editors, so it is not used for diffs unless it opts in."),
      anyOf: [
        customEditorPrioritySchema,
        {
          type: "object",
          required: [PriorityFields.textEditor],
          additionalProperties: false,
          properties: {
            [PriorityFields.textEditor]: {
              ...customEditorPrioritySchema,
              markdownDescription: nls.localize("contributes.priority.textEditor", "Controls if the custom editor is enabled automatically when the user opens a file. `diffEditor` does not inherit this value; when it is not specified it defaults to `explicit`.")
            },
            [PriorityFields.diffEditor]: {
              ...customEditorPrioritySchema,
              markdownDescription: nls.localize("contributes.priority.diffEditor", "Controls if the custom editor is enabled automatically when the user opens a diff. When not specified this defaults to `explicit`, so the custom editor is not used for diffs unless it opts in.")
            }
          }
        }
      ],
      default: CustomEditorPriority.default
    }
  }
};
const customEditorsExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "customEditors",
  deps: [languagesExtPoint],
  jsonSchema: {
    description: nls.localize("contributes.customEditors", "Contributed custom editors."),
    type: "array",
    defaultSnippets: [{
      body: [{
        [Fields.viewType]: "$1",
        [Fields.displayName]: "$2",
        [Fields.selector]: [{
          filenamePattern: "$3"
        }]
      }]
    }],
    items: customEditorsContributionSchema
  },
  activationEventsGenerator: function* (contribs) {
    for (const contrib of contribs) {
      const viewType = contrib[Fields.viewType];
      if (viewType) {
        yield `onCustomEditor:${viewType}`;
      }
    }
  }
});
class CustomEditorsDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.customEditors;
  }
  render(manifest) {
    const customEditors = manifest.contributes?.customEditors || [];
    if (!customEditors.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      nls.localize("customEditors view type", "View Type"),
      nls.localize("customEditors priority", "Priority"),
      nls.localize("customEditors filenamePattern", "Filename Pattern")
    ];
    const rows = customEditors.map((customEditor) => {
      return [
        customEditor.viewType,
        renderPriority(customEditor.priority),
        coalesce(customEditor.selector.map((x) => x.filenamePattern)).join(", ")
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
function renderPriority(priority) {
  if (!priority) {
    return "";
  }
  if (typeof priority === "string") {
    return priority;
  }
  return coalesce([
    priority.textEditor ? `textEditor: ${priority.textEditor}` : void 0,
    priority.diffEditor ? `diffEditor: ${priority.diffEditor}` : void 0
  ]).join(", ");
}
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "customEditors",
  label: nls.localize("customEditors", "Custom Editors"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(CustomEditorsDataRenderer)
});
export {
  customEditorsExtensionPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2N1c3RvbUVkaXRvci9jb21tb24vZXh0ZW5zaW9uUG9pbnQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBUeXBlRnJvbUpzb25TY2hlbWEsIElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbk1hbmlmZXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEN1c3RvbUVkaXRvclByaW9yaXR5IH0gZnJvbSAnLi9jdXN0b21FZGl0b3IuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyLCBJRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSwgSVJlbmRlcmVkRGF0YSwgSVJvd0RhdGEsIElUYWJsZURhdGEgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25GZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgbGFuZ3VhZ2VzRXh0UG9pbnQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9sYW5ndWFnZS9jb21tb24vbGFuZ3VhZ2VTZXJ2aWNlLmpzJztcblxuY29uc3QgRmllbGRzID0gT2JqZWN0LmZyZWV6ZSh7XG5cdHZpZXdUeXBlOiAndmlld1R5cGUnLFxuXHRkaXNwbGF5TmFtZTogJ2Rpc3BsYXlOYW1lJyxcblx0c2VsZWN0b3I6ICdzZWxlY3RvcicsXG5cdHByaW9yaXR5OiAncHJpb3JpdHknLFxufSk7XG5cbmNvbnN0IFByaW9yaXR5RmllbGRzID0gT2JqZWN0LmZyZWV6ZSh7XG5cdHRleHRFZGl0b3I6ICd0ZXh0RWRpdG9yJyxcblx0ZGlmZkVkaXRvcjogJ2RpZmZFZGl0b3InLFxufSk7XG5cbmNvbnN0IGN1c3RvbUVkaXRvclByaW9yaXR5U2NoZW1hID0ge1xuXHR0eXBlOiAnc3RyaW5nJyxcblx0ZW51bTogW1xuXHRcdEN1c3RvbUVkaXRvclByaW9yaXR5LmRlZmF1bHQsXG5cdFx0Q3VzdG9tRWRpdG9yUHJpb3JpdHkub3B0aW9uLFxuXHRcdEN1c3RvbUVkaXRvclByaW9yaXR5LmV4cGxpY2l0LFxuXHRdLFxuXHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnByaW9yaXR5LmRlZmF1bHQnLCAnVGhlIGVkaXRvciBpcyBhdXRvbWF0aWNhbGx5IHVzZWQgd2hlbiB0aGUgdXNlciBvcGVucyBhIHJlc291cmNlLCBwcm92aWRlZCB0aGF0IG5vIG90aGVyIGRlZmF1bHQgY3VzdG9tIGVkaXRvcnMgYXJlIHJlZ2lzdGVyZWQgZm9yIHRoYXQgcmVzb3VyY2UuJyksXG5cdFx0bmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5wcmlvcml0eS5vcHRpb24nLCAnVGhlIGVkaXRvciBpcyBub3QgYXV0b21hdGljYWxseSB1c2VkIHdoZW4gdGhlIHVzZXIgb3BlbnMgYSByZXNvdXJjZSwgYnV0IGEgdXNlciBjYW4gc3dpdGNoIHRvIHRoZSBlZGl0b3IgdXNpbmcgdGhlIGBSZW9wZW4gV2l0aGAgY29tbWFuZC4nKSxcblx0XHRubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnByaW9yaXR5LmV4cGxpY2l0JywgJ1RoZSBlZGl0b3IgaXMgbm90IGF1dG9tYXRpY2FsbHkgdXNlZCBvciBvcHRlZCBpbnRvIGJ5IGFuIGFzc29jaWF0aW9uIGZyb20gYW5vdGhlciBlZGl0b3IgbW9kZS4gSXQgY2FuIHN0aWxsIGJlIG9wZW5lZCB1c2luZyB0aGUgYFJlb3BlbiBXaXRoYCBjb21tYW5kIG9yIGFuIGFzc29jaWF0aW9uIGNvbmZpZ3VyZWQgc3BlY2lmaWNhbGx5IGZvciB0aGlzIGVkaXRvciBtb2RlLicpLFxuXHRdLFxufSBhcyBjb25zdCBzYXRpc2ZpZXMgSUpTT05TY2hlbWE7XG5cbmNvbnN0IGN1c3RvbUVkaXRvcnNDb250cmlidXRpb25TY2hlbWEgPSB7XG5cdHR5cGU6ICdvYmplY3QnLFxuXHRyZXF1aXJlZDogW1xuXHRcdEZpZWxkcy52aWV3VHlwZSxcblx0XHRGaWVsZHMuZGlzcGxheU5hbWUsXG5cdFx0RmllbGRzLnNlbGVjdG9yLFxuXHRdLFxuXHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdHByb3BlcnRpZXM6IHtcblx0XHRbRmllbGRzLnZpZXdUeXBlXToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnZpZXdUeXBlJywgJ0lkZW50aWZpZXIgZm9yIHRoZSBjdXN0b20gZWRpdG9yLiBUaGlzIG11c3QgYmUgdW5pcXVlIGFjcm9zcyBhbGwgY3VzdG9tIGVkaXRvcnMsIHNvIHdlIHJlY29tbWVuZCBpbmNsdWRpbmcgeW91ciBleHRlbnNpb24gaWQgYXMgcGFydCBvZiBgdmlld1R5cGVgLiBUaGUgYHZpZXdUeXBlYCBpcyB1c2VkIHdoZW4gcmVnaXN0ZXJpbmcgY3VzdG9tIGVkaXRvcnMgd2l0aCBgdnNjb2RlLnJlZ2lzdGVyQ3VzdG9tRWRpdG9yUHJvdmlkZXJgIGFuZCBpbiB0aGUgYG9uQ3VzdG9tRWRpdG9yOiR7aWR9YCBbYWN0aXZhdGlvbiBldmVudF0oaHR0cHM6Ly9jb2RlLnZpc3VhbHN0dWRpby5jb20vYXBpL3JlZmVyZW5jZXMvYWN0aXZhdGlvbi1ldmVudHMpLicpLFxuXHRcdH0sXG5cdFx0W0ZpZWxkcy5kaXNwbGF5TmFtZV06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuZGlzcGxheU5hbWUnLCAnSHVtYW4gcmVhZGFibGUgbmFtZSBvZiB0aGUgY3VzdG9tIGVkaXRvci4gVGhpcyBpcyBkaXNwbGF5ZWQgdG8gdXNlcnMgd2hlbiBzZWxlY3Rpbmcgd2hpY2ggZWRpdG9yIHRvIHVzZS4nKSxcblx0XHR9LFxuXHRcdFtGaWVsZHMuc2VsZWN0b3JdOiB7XG5cdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuc2VsZWN0b3InLCAnU2V0IG9mIGdsb2JzIHRoYXQgdGhlIGN1c3RvbSBlZGl0b3IgaXMgZW5hYmxlZCBmb3IuJyksXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbe1xuXHRcdFx0XHRcdGJvZHk6IHtcblx0XHRcdFx0XHRcdGZpbGVuYW1lUGF0dGVybjogJyQxJyxcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRhZGRpdGlvbmFsUHJvcGVydGllczogZmFsc2UsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRmaWxlbmFtZVBhdHRlcm46IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuc2VsZWN0b3IuZmlsZW5hbWVQYXR0ZXJuJywgJ0dsb2IgdGhhdCB0aGUgY3VzdG9tIGVkaXRvciBpcyBlbmFibGVkIGZvci4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRbRmllbGRzLnByaW9yaXR5XToge1xuXHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5wcmlvcml0eScsICdDb250cm9scyBpZiB0aGUgY3VzdG9tIGVkaXRvciBpcyBlbmFibGVkIGF1dG9tYXRpY2FsbHkgd2hlbiB0aGUgdXNlciBvcGVucyBhIGZpbGUgb3IgZGlmZiBlZGl0b3IuIFRoaXMgbWF5IGJlIG92ZXJyaWRkZW4gYnkgdXNlcnMgdXNpbmcgdGhlIGB3b3JrYmVuY2guZWRpdG9yQXNzb2NpYXRpb25zYCBvciBgd29ya2JlbmNoLmRpZmZFZGl0b3JBc3NvY2lhdGlvbnNgIHNldHRpbmcuIFdoZW4gb21pdHRlZCwgdGhlIGN1c3RvbSBlZGl0b3IgZGVmYXVsdHMgdG8gYGRlZmF1bHRgIGZvciB0aGUgbm9ybWFsIGVkaXRvciBhbmQgYGV4cGxpY2l0YCBmb3IgZGlmZiBlZGl0b3JzLCBzbyBpdCBpcyBub3QgdXNlZCBmb3IgZGlmZnMgdW5sZXNzIGl0IG9wdHMgaW4uJyksXG5cdFx0XHRhbnlPZjogW1xuXHRcdFx0XHRjdXN0b21FZGl0b3JQcmlvcml0eVNjaGVtYSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBbUHJpb3JpdHlGaWVsZHMudGV4dEVkaXRvcl0sXG5cdFx0XHRcdFx0YWRkaXRpb25hbFByb3BlcnRpZXM6IGZhbHNlLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFtQcmlvcml0eUZpZWxkcy50ZXh0RWRpdG9yXToge1xuXHRcdFx0XHRcdFx0XHQuLi5jdXN0b21FZGl0b3JQcmlvcml0eVNjaGVtYSxcblx0XHRcdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5wcmlvcml0eS50ZXh0RWRpdG9yJywgJ0NvbnRyb2xzIGlmIHRoZSBjdXN0b20gZWRpdG9yIGlzIGVuYWJsZWQgYXV0b21hdGljYWxseSB3aGVuIHRoZSB1c2VyIG9wZW5zIGEgZmlsZS4gYGRpZmZFZGl0b3JgIGRvZXMgbm90IGluaGVyaXQgdGhpcyB2YWx1ZTsgd2hlbiBpdCBpcyBub3Qgc3BlY2lmaWVkIGl0IGRlZmF1bHRzIHRvIGBleHBsaWNpdGAuJyksXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0W1ByaW9yaXR5RmllbGRzLmRpZmZFZGl0b3JdOiB7XG5cdFx0XHRcdFx0XHRcdC4uLmN1c3RvbUVkaXRvclByaW9yaXR5U2NoZW1hLFxuXHRcdFx0XHRcdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnByaW9yaXR5LmRpZmZFZGl0b3InLCAnQ29udHJvbHMgaWYgdGhlIGN1c3RvbSBlZGl0b3IgaXMgZW5hYmxlZCBhdXRvbWF0aWNhbGx5IHdoZW4gdGhlIHVzZXIgb3BlbnMgYSBkaWZmLiBXaGVuIG5vdCBzcGVjaWZpZWQgdGhpcyBkZWZhdWx0cyB0byBgZXhwbGljaXRgLCBzbyB0aGUgY3VzdG9tIGVkaXRvciBpcyBub3QgdXNlZCBmb3IgZGlmZnMgdW5sZXNzIGl0IG9wdHMgaW4uJyksXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6IEN1c3RvbUVkaXRvclByaW9yaXR5LmRlZmF1bHRcblx0XHR9XG5cdH1cbn0gYXMgY29uc3Qgc2F0aXNmaWVzIElKU09OU2NoZW1hO1xuXG5leHBvcnQgdHlwZSBJQ3VzdG9tRWRpdG9yc0V4dGVuc2lvblBvaW50ID0gVHlwZUZyb21Kc29uU2NoZW1hPHR5cGVvZiBjdXN0b21FZGl0b3JzQ29udHJpYnV0aW9uU2NoZW1hPjtcblxuZXhwb3J0IGNvbnN0IGN1c3RvbUVkaXRvcnNFeHRlbnNpb25Qb2ludCA9IEV4dGVuc2lvbnNSZWdpc3RyeS5yZWdpc3RlckV4dGVuc2lvblBvaW50PElDdXN0b21FZGl0b3JzRXh0ZW5zaW9uUG9pbnRbXT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ2N1c3RvbUVkaXRvcnMnLFxuXHRkZXBzOiBbbGFuZ3VhZ2VzRXh0UG9pbnRdLFxuXHRqc29uU2NoZW1hOiB7XG5cdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMuY3VzdG9tRWRpdG9ycycsICdDb250cmlidXRlZCBjdXN0b20gZWRpdG9ycy4nKSxcblx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdGRlZmF1bHRTbmlwcGV0czogW3tcblx0XHRcdGJvZHk6IFt7XG5cdFx0XHRcdFtGaWVsZHMudmlld1R5cGVdOiAnJDEnLFxuXHRcdFx0XHRbRmllbGRzLmRpc3BsYXlOYW1lXTogJyQyJyxcblx0XHRcdFx0W0ZpZWxkcy5zZWxlY3Rvcl06IFt7XG5cdFx0XHRcdFx0ZmlsZW5hbWVQYXR0ZXJuOiAnJDMnXG5cdFx0XHRcdH1dLFxuXHRcdFx0fV1cblx0XHR9XSxcblx0XHRpdGVtczogY3VzdG9tRWRpdG9yc0NvbnRyaWJ1dGlvblNjaGVtYVxuXHR9LFxuXHRhY3RpdmF0aW9uRXZlbnRzR2VuZXJhdG9yOiBmdW5jdGlvbiogKGNvbnRyaWJzOiByZWFkb25seSBJQ3VzdG9tRWRpdG9yc0V4dGVuc2lvblBvaW50W10pIHtcblx0XHRmb3IgKGNvbnN0IGNvbnRyaWIgb2YgY29udHJpYnMpIHtcblx0XHRcdGNvbnN0IHZpZXdUeXBlID0gY29udHJpYltGaWVsZHMudmlld1R5cGVdO1xuXHRcdFx0aWYgKHZpZXdUeXBlKSB7XG5cdFx0XHRcdHlpZWxkIGBvbkN1c3RvbUVkaXRvcjoke3ZpZXdUeXBlfWA7XG5cdFx0XHR9XG5cdFx0fVxuXHR9LFxufSk7XG5cbmNsYXNzIEN1c3RvbUVkaXRvcnNEYXRhUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyIHtcblxuXHRyZWFkb25seSB0eXBlID0gJ3RhYmxlJztcblxuXHRzaG91bGRSZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIW1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5jdXN0b21FZGl0b3JzO1xuXHR9XG5cblx0cmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBJUmVuZGVyZWREYXRhPElUYWJsZURhdGE+IHtcblx0XHRjb25zdCBjdXN0b21FZGl0b3JzID0gbWFuaWZlc3QuY29udHJpYnV0ZXM/LmN1c3RvbUVkaXRvcnMgfHwgW107XG5cdFx0aWYgKCFjdXN0b21FZGl0b3JzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHsgZGF0YTogeyBoZWFkZXJzOiBbXSwgcm93czogW10gfSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGVhZGVycyA9IFtcblx0XHRcdG5scy5sb2NhbGl6ZSgnY3VzdG9tRWRpdG9ycyB2aWV3IHR5cGUnLCBcIlZpZXcgVHlwZVwiKSxcblx0XHRcdG5scy5sb2NhbGl6ZSgnY3VzdG9tRWRpdG9ycyBwcmlvcml0eScsIFwiUHJpb3JpdHlcIiksXG5cdFx0XHRubHMubG9jYWxpemUoJ2N1c3RvbUVkaXRvcnMgZmlsZW5hbWVQYXR0ZXJuJywgXCJGaWxlbmFtZSBQYXR0ZXJuXCIpLFxuXHRcdF07XG5cblx0XHRjb25zdCByb3dzOiBJUm93RGF0YVtdW10gPSBjdXN0b21FZGl0b3JzXG5cdFx0XHQubWFwKGN1c3RvbUVkaXRvciA9PiB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0Y3VzdG9tRWRpdG9yLnZpZXdUeXBlLFxuXHRcdFx0XHRcdHJlbmRlclByaW9yaXR5KGN1c3RvbUVkaXRvci5wcmlvcml0eSksXG5cdFx0XHRcdFx0Y29hbGVzY2UoY3VzdG9tRWRpdG9yLnNlbGVjdG9yLm1hcCh4ID0+IHguZmlsZW5hbWVQYXR0ZXJuKSkuam9pbignLCAnKVxuXHRcdFx0XHRdO1xuXHRcdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRyb3dzXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblx0fVxufVxuXG5mdW5jdGlvbiByZW5kZXJQcmlvcml0eShwcmlvcml0eTogSUN1c3RvbUVkaXRvcnNFeHRlbnNpb25Qb2ludFsncHJpb3JpdHknXSB8IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdGlmICghcHJpb3JpdHkpIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblx0aWYgKHR5cGVvZiBwcmlvcml0eSA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gcHJpb3JpdHk7XG5cdH1cblx0cmV0dXJuIGNvYWxlc2NlKFtcblx0XHRwcmlvcml0eS50ZXh0RWRpdG9yID8gYHRleHRFZGl0b3I6ICR7cHJpb3JpdHkudGV4dEVkaXRvcn1gIDogdW5kZWZpbmVkLFxuXHRcdHByaW9yaXR5LmRpZmZFZGl0b3IgPyBgZGlmZkVkaXRvcjogJHtwcmlvcml0eS5kaWZmRWRpdG9yfWAgOiB1bmRlZmluZWQsXG5cdF0pLmpvaW4oJywgJyk7XG59XG5cblJlZ2lzdHJ5LmFzPElFeHRlbnNpb25GZWF0dXJlc1JlZ2lzdHJ5PihFeHRlbnNpb25zLkV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnkpLnJlZ2lzdGVyRXh0ZW5zaW9uRmVhdHVyZSh7XG5cdGlkOiAnY3VzdG9tRWRpdG9ycycsXG5cdGxhYmVsOiBubHMubG9jYWxpemUoJ2N1c3RvbUVkaXRvcnMnLCBcIkN1c3RvbSBFZGl0b3JzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoQ3VzdG9tRWRpdG9yc0RhdGFSZW5kZXJlciksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsa0JBQWtCO0FBQzNCLFlBQVksU0FBUztBQUVyQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGtCQUFtSDtBQUM1SCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHlCQUF5QjtBQUVsQyxNQUFNLFNBQVMsT0FBTyxPQUFPO0FBQUEsRUFDNUIsVUFBVTtBQUFBLEVBQ1YsYUFBYTtBQUFBLEVBQ2IsVUFBVTtBQUFBLEVBQ1YsVUFBVTtBQUNYLENBQUM7QUFFRCxNQUFNLGlCQUFpQixPQUFPLE9BQU87QUFBQSxFQUNwQyxZQUFZO0FBQUEsRUFDWixZQUFZO0FBQ2IsQ0FBQztBQUVELE1BQU0sNkJBQTZCO0FBQUEsRUFDbEMsTUFBTTtBQUFBLEVBQ04sTUFBTTtBQUFBLElBQ0wscUJBQXFCO0FBQUEsSUFDckIscUJBQXFC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
