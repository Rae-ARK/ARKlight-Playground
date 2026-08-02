import * as nls from "../../../../nls.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { NotebookEditorPriority } from "../common/notebookCommon.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { SyncDescriptor } from "../../../../platform/instantiation/common/descriptors.js";
import { Extensions } from "../../../services/extensionManagement/common/extensionFeatures.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
const NotebookEditorContribution = Object.freeze({
  type: "type",
  displayName: "displayName",
  selector: "selector",
  priority: "priority"
});
const NotebookRendererContribution = Object.freeze({
  id: "id",
  displayName: "displayName",
  mimeTypes: "mimeTypes",
  entrypoint: "entrypoint",
  hardDependencies: "dependencies",
  optionalDependencies: "optionalDependencies",
  requiresMessaging: "requiresMessaging"
});
const NotebookPreloadContribution = Object.freeze({
  type: "type",
  entrypoint: "entrypoint",
  localResourceRoots: "localResourceRoots"
});
const notebookProviderContribution = {
  description: nls.localize("contributes.notebook.provider", "Contributes notebook document provider."),
  type: "array",
  defaultSnippets: [{ body: [{ type: "", displayName: "", "selector": [{ "filenamePattern": "" }] }] }],
  items: {
    type: "object",
    required: [
      NotebookEditorContribution.type,
      NotebookEditorContribution.displayName,
      NotebookEditorContribution.selector
    ],
    properties: {
      [NotebookEditorContribution.type]: {
        type: "string",
        description: nls.localize("contributes.notebook.provider.viewType", "Type of the notebook.")
      },
      [NotebookEditorContribution.displayName]: {
        type: "string",
        description: nls.localize("contributes.notebook.provider.displayName", "Human readable name of the notebook.")
      },
      [NotebookEditorContribution.selector]: {
        type: "array",
        description: nls.localize("contributes.notebook.provider.selector", "Set of globs that the notebook is for."),
        items: {
          type: "object",
          properties: {
            filenamePattern: {
              type: "string",
              description: nls.localize("contributes.notebook.provider.selector.filenamePattern", "Glob that the notebook is enabled for.")
            },
            excludeFileNamePattern: {
              type: "string",
              description: nls.localize("contributes.notebook.selector.provider.excludeFileNamePattern", "Glob that the notebook is disabled for.")
            }
          }
        }
      },
      [NotebookEditorContribution.priority]: {
        type: "string",
        markdownDeprecationMessage: nls.localize("contributes.priority", "Controls if the custom editor is enabled automatically when the user opens a file. This may be overridden by users using the `workbench.editorAssociations` setting."),
        enum: [
          NotebookEditorPriority.default,
          NotebookEditorPriority.option
        ],
        markdownEnumDescriptions: [
          nls.localize("contributes.priority.default", "The editor is automatically used when the user opens a resource, provided that no other default custom editors are registered for that resource."),
          nls.localize("contributes.priority.option", "The editor is not automatically used when the user opens a resource, but a user can switch to the editor using the `Reopen With` command.")
        ],
        default: "default"
      }
    }
  }
};
const defaultRendererSnippet = Object.freeze({ id: "", displayName: "", mimeTypes: [""], entrypoint: "" });
const notebookRendererContribution = {
  description: nls.localize("contributes.notebook.renderer", "Contributes notebook output renderer provider."),
  type: "array",
  defaultSnippets: [{ body: [defaultRendererSnippet] }],
  items: {
    defaultSnippets: [{ body: defaultRendererSnippet }],
    allOf: [
      {
        type: "object",
        required: [
          NotebookRendererContribution.id,
          NotebookRendererContribution.displayName
        ],
        properties: {
          [NotebookRendererContribution.id]: {
            type: "string",
            description: nls.localize("contributes.notebook.renderer.viewType", "Unique identifier of the notebook output renderer.")
          },
          [NotebookRendererContribution.displayName]: {
            type: "string",
            description: nls.localize("contributes.notebook.renderer.displayName", "Human readable name of the notebook output renderer.")
          },
          [NotebookRendererContribution.hardDependencies]: {
            type: "array",
            uniqueItems: true,
            items: { type: "string" },
            markdownDescription: nls.localize("contributes.notebook.renderer.hardDependencies", "List of kernel dependencies the renderer requires. If any of the dependencies are present in the `NotebookKernel.preloads`, the renderer can be used.")
          },
          [NotebookRendererContribution.optionalDependencies]: {
            type: "array",
            uniqueItems: true,
            items: { type: "string" },
            markdownDescription: nls.localize("contributes.notebook.renderer.optionalDependencies", "List of soft kernel dependencies the renderer can make use of. If any of the dependencies are present in the `NotebookKernel.preloads`, the renderer will be preferred over renderers that don't interact with the kernel.")
          },
          [NotebookRendererContribution.requiresMessaging]: {
            default: "never",
            enum: [
              "always",
              "optional",
              "never"
            ],
            enumDescriptions: [
              nls.localize("contributes.notebook.renderer.requiresMessaging.always", "Messaging is required. The renderer will only be used when it's part of an extension that can be run in an extension host."),
              nls.localize("contributes.notebook.renderer.requiresMessaging.optional", "The renderer is better with messaging available, but it's not required."),
              nls.localize("contributes.notebook.renderer.requiresMessaging.never", "The renderer does not require messaging.")
            ],
            description: nls.localize("contributes.notebook.renderer.requiresMessaging", "Defines how and if the renderer needs to communicate with an extension host, via `createRendererMessaging`. Renderers with stronger messaging requirements may not work in all environments.")
          }
        }
      },
      {
        oneOf: [
          {
            required: [
              NotebookRendererContribution.entrypoint,
              NotebookRendererContribution.mimeTypes
            ],
            properties: {
              [NotebookRendererContribution.mimeTypes]: {
                type: "array",
                description: nls.localize("contributes.notebook.selector", "Set of globs that the notebook is for."),
                items: {
                  type: "string"
                }
              },
              [NotebookRendererContribution.entrypoint]: {
                description: nls.localize("contributes.notebook.renderer.entrypoint", "File to load in the webview to render the extension."),
                type: "string"
              }
            }
          },
          {
            required: [
              NotebookRendererContribution.entrypoint
            ],
            properties: {
              [NotebookRendererContribution.entrypoint]: {
                description: nls.localize("contributes.notebook.renderer.entrypoint", "File to load in the webview to render the extension."),
                type: "object",
                required: ["extends", "path"],
                properties: {
                  extends: {
                    type: "string",
                    description: nls.localize("contributes.notebook.renderer.entrypoint.extends", "Existing renderer that this one extends.")
                  },
                  path: {
                    type: "string",
                    description: nls.localize("contributes.notebook.renderer.entrypoint", "File to load in the webview to render the extension.")
                  }
                }
              }
            }
          }
        ]
      }
    ]
  }
};
const notebookPreloadContribution = {
  description: nls.localize("contributes.preload.provider", "Contributes notebook preloads."),
  type: "array",
  defaultSnippets: [{ body: [{ type: "", entrypoint: "" }] }],
  items: {
    type: "object",
    required: [
      NotebookPreloadContribution.type,
      NotebookPreloadContribution.entrypoint
    ],
    properties: {
      [NotebookPreloadContribution.type]: {
        type: "string",
        description: nls.localize("contributes.preload.provider.viewType", "Type of the notebook.")
      },
      [NotebookPreloadContribution.entrypoint]: {
        type: "string",
        description: nls.localize("contributes.preload.entrypoint", "Path to file loaded in the webview.")
      },
      [NotebookPreloadContribution.localResourceRoots]: {
        type: "array",
        items: { type: "string" },
        description: nls.localize("contributes.preload.localResourceRoots", "Paths to additional resources that should be allowed in the webview.")
      }
    }
  }
};
const notebooksExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "notebooks",
  jsonSchema: notebookProviderContribution,
  activationEventsGenerator: function* (contribs) {
    for (const contrib of contribs) {
      if (contrib.type) {
        yield `onNotebookSerializer:${contrib.type}`;
      }
    }
  }
});
const notebookRendererExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "notebookRenderer",
  jsonSchema: notebookRendererContribution,
  activationEventsGenerator: function* (contribs) {
    for (const contrib of contribs) {
      if (contrib.id) {
        yield `onRenderer:${contrib.id}`;
      }
    }
  }
});
const notebookPreloadExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "notebookPreload",
  jsonSchema: notebookPreloadContribution
});
class NotebooksDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.notebooks;
  }
  render(manifest) {
    const contrib = manifest.contributes?.notebooks || [];
    if (!contrib.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      nls.localize("Notebook id", "ID"),
      nls.localize("Notebook name", "Name")
    ];
    const rows = contrib.sort((a, b) => a.type.localeCompare(b.type)).map((notebook) => {
      return [
        notebook.type,
        notebook.displayName
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
class NotebookRenderersDataRenderer extends Disposable {
  constructor() {
    super(...arguments);
    this.type = "table";
  }
  shouldRender(manifest) {
    return !!manifest.contributes?.notebookRenderer;
  }
  render(manifest) {
    const contrib = manifest.contributes?.notebookRenderer || [];
    if (!contrib.length) {
      return { data: { headers: [], rows: [] }, dispose: () => {
      } };
    }
    const headers = [
      nls.localize("Notebook renderer name", "Name"),
      nls.localize("Notebook mimetypes", "Mimetypes")
    ];
    const rows = contrib.sort((a, b) => a.displayName.localeCompare(b.displayName)).map((notebookRenderer) => {
      return [
        notebookRenderer.displayName,
        notebookRenderer.mimeTypes.join(",")
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
  id: "notebooks",
  label: nls.localize("notebooks", "Notebooks"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(NotebooksDataRenderer)
});
Registry.as(Extensions.ExtensionFeaturesRegistry).registerExtensionFeature({
  id: "notebookRenderer",
  label: nls.localize("notebookRenderer", "Notebook Renderers"),
  access: {
    canToggle: false
  },
  renderer: new SyncDescriptor(NotebookRenderersDataRenderer)
});
export {
  notebookPreloadExtensionPoint,
  notebookRendererExtensionPoint,
  notebooksExtensionPoint
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tFeHRlbnNpb25Qb2ludC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElKU09OU2NoZW1hIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvblNjaGVtYS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnNSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0VkaXRvclByaW9yaXR5LCBDb250cmlidXRlZE5vdGVib29rUmVuZGVyZXJFbnRyeXBvaW50LCBSZW5kZXJlck1lc3NhZ2luZ1NwZWMgfSBmcm9tICcuLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkZlYXR1cmVUYWJsZVJlbmRlcmVyLCBJUmVuZGVyZWREYXRhLCBJVGFibGVEYXRhLCBJUm93RGF0YSwgSUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnksIEV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25NYW5hZ2VtZW50L2NvbW1vbi9leHRlbnNpb25GZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5cbmNvbnN0IE5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uID0gT2JqZWN0LmZyZWV6ZSh7XG5cdHR5cGU6ICd0eXBlJyxcblx0ZGlzcGxheU5hbWU6ICdkaXNwbGF5TmFtZScsXG5cdHNlbGVjdG9yOiAnc2VsZWN0b3InLFxuXHRwcmlvcml0eTogJ3ByaW9yaXR5Jyxcbn0pO1xuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbiB7XG5cdHJlYWRvbmx5IFtOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbi50eXBlXTogc3RyaW5nO1xuXHRyZWFkb25seSBbTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24uZGlzcGxheU5hbWVdOiBzdHJpbmc7XG5cdHJlYWRvbmx5IFtOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbi5zZWxlY3Rvcl0/OiByZWFkb25seSB7IGZpbGVuYW1lUGF0dGVybj86IHN0cmluZzsgZXhjbHVkZUZpbGVOYW1lUGF0dGVybj86IHN0cmluZyB9W107XG5cdHJlYWRvbmx5IFtOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbi5wcmlvcml0eV0/OiBzdHJpbmc7XG59XG5cbmNvbnN0IE5vdGVib29rUmVuZGVyZXJDb250cmlidXRpb24gPSBPYmplY3QuZnJlZXplKHtcblx0aWQ6ICdpZCcsXG5cdGRpc3BsYXlOYW1lOiAnZGlzcGxheU5hbWUnLFxuXHRtaW1lVHlwZXM6ICdtaW1lVHlwZXMnLFxuXHRlbnRyeXBvaW50OiAnZW50cnlwb2ludCcsXG5cdGhhcmREZXBlbmRlbmNpZXM6ICdkZXBlbmRlbmNpZXMnLFxuXHRvcHRpb25hbERlcGVuZGVuY2llczogJ29wdGlvbmFsRGVwZW5kZW5jaWVzJyxcblx0cmVxdWlyZXNNZXNzYWdpbmc6ICdyZXF1aXJlc01lc3NhZ2luZycsXG59KTtcblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbiB7XG5cdHJlYWRvbmx5IFtOb3RlYm9va1JlbmRlcmVyQ29udHJpYnV0aW9uLmlkXT86IHN0cmluZztcblx0cmVhZG9ubHkgW05vdGVib29rUmVuZGVyZXJDb250cmlidXRpb24uZGlzcGxheU5hbWVdOiBzdHJpbmc7XG5cdHJlYWRvbmx5IFtOb3RlYm9va1JlbmRlcmVyQ29udHJpYnV0aW9uLm1pbWVUeXBlc10/OiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgW05vdGVib29rUmVuZGVyZXJDb250cmlidXRpb24uZW50cnlwb2ludF06IENvbnRyaWJ1dGVkTm90ZWJvb2tSZW5kZXJlckVudHJ5cG9pbnQ7XG5cdHJlYWRvbmx5IFtOb3RlYm9va1JlbmRlcmVyQ29udHJpYnV0aW9uLmhhcmREZXBlbmRlbmNpZXNdOiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgW05vdGVib29rUmVuZGVyZXJDb250cmlidXRpb24ub3B0aW9uYWxEZXBlbmRlbmNpZXNdOiByZWFkb25seSBzdHJpbmdbXTtcblx0cmVhZG9ubHkgW05vdGVib29rUmVuZGVyZXJDb250cmlidXRpb24ucmVxdWlyZXNNZXNzYWdpbmddOiBSZW5kZXJlck1lc3NhZ2luZ1NwZWM7XG59XG5cbmNvbnN0IE5vdGVib29rUHJlbG9hZENvbnRyaWJ1dGlvbiA9IE9iamVjdC5mcmVlemUoe1xuXHR0eXBlOiAndHlwZScsXG5cdGVudHJ5cG9pbnQ6ICdlbnRyeXBvaW50Jyxcblx0bG9jYWxSZXNvdXJjZVJvb3RzOiAnbG9jYWxSZXNvdXJjZVJvb3RzJyxcbn0pO1xuXG5pbnRlcmZhY2UgSU5vdGVib29rUHJlbG9hZENvbnRyaWJ1dGlvbiB7XG5cdHJlYWRvbmx5IFtOb3RlYm9va1ByZWxvYWRDb250cmlidXRpb24udHlwZV06IHN0cmluZztcblx0cmVhZG9ubHkgW05vdGVib29rUHJlbG9hZENvbnRyaWJ1dGlvbi5lbnRyeXBvaW50XTogc3RyaW5nO1xuXHRyZWFkb25seSBbTm90ZWJvb2tQcmVsb2FkQ29udHJpYnV0aW9uLmxvY2FsUmVzb3VyY2VSb290c106IHJlYWRvbmx5IHN0cmluZ1tdO1xufVxuXG5jb25zdCBub3RlYm9va1Byb3ZpZGVyQ29udHJpYnV0aW9uOiBJSlNPTlNjaGVtYSA9IHtcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMubm90ZWJvb2sucHJvdmlkZXInLCAnQ29udHJpYnV0ZXMgbm90ZWJvb2sgZG9jdW1lbnQgcHJvdmlkZXIuJyksXG5cdHR5cGU6ICdhcnJheScsXG5cdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogW3sgdHlwZTogJycsIGRpc3BsYXlOYW1lOiAnJywgJ3NlbGVjdG9yJzogW3sgJ2ZpbGVuYW1lUGF0dGVybic6ICcnIH1dIH1dIH1dLFxuXHRpdGVtczoge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHJlcXVpcmVkOiBbXG5cdFx0XHROb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbi50eXBlLFxuXHRcdFx0Tm90ZWJvb2tFZGl0b3JDb250cmlidXRpb24uZGlzcGxheU5hbWUsXG5cdFx0XHROb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbi5zZWxlY3Rvcixcblx0XHRdLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFtOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbi50eXBlXToge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMubm90ZWJvb2sucHJvdmlkZXIudmlld1R5cGUnLCAnVHlwZSBvZiB0aGUgbm90ZWJvb2suJyksXG5cdFx0XHR9LFxuXHRcdFx0W05vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uLmRpc3BsYXlOYW1lXToge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMubm90ZWJvb2sucHJvdmlkZXIuZGlzcGxheU5hbWUnLCAnSHVtYW4gcmVhZGFibGUgbmFtZSBvZiB0aGUgbm90ZWJvb2suJyksXG5cdFx0XHR9LFxuXHRcdFx0W05vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uLnNlbGVjdG9yXToge1xuXHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5wcm92aWRlci5zZWxlY3RvcicsICdTZXQgb2YgZ2xvYnMgdGhhdCB0aGUgbm90ZWJvb2sgaXMgZm9yLicpLFxuXHRcdFx0XHRpdGVtczoge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdGZpbGVuYW1lUGF0dGVybjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMubm90ZWJvb2sucHJvdmlkZXIuc2VsZWN0b3IuZmlsZW5hbWVQYXR0ZXJuJywgJ0dsb2IgdGhhdCB0aGUgbm90ZWJvb2sgaXMgZW5hYmxlZCBmb3IuJyksXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0ZXhjbHVkZUZpbGVOYW1lUGF0dGVybjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMubm90ZWJvb2suc2VsZWN0b3IucHJvdmlkZXIuZXhjbHVkZUZpbGVOYW1lUGF0dGVybicsICdHbG9iIHRoYXQgdGhlIG5vdGVib29rIGlzIGRpc2FibGVkIGZvci4nKVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdFtOb3RlYm9va0VkaXRvckNvbnRyaWJ1dGlvbi5wcmlvcml0eV06IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdG1hcmtkb3duRGVwcmVjYXRpb25NZXNzYWdlOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnByaW9yaXR5JywgJ0NvbnRyb2xzIGlmIHRoZSBjdXN0b20gZWRpdG9yIGlzIGVuYWJsZWQgYXV0b21hdGljYWxseSB3aGVuIHRoZSB1c2VyIG9wZW5zIGEgZmlsZS4gVGhpcyBtYXkgYmUgb3ZlcnJpZGRlbiBieSB1c2VycyB1c2luZyB0aGUgYHdvcmtiZW5jaC5lZGl0b3JBc3NvY2lhdGlvbnNgIHNldHRpbmcuJyksXG5cdFx0XHRcdGVudW06IFtcblx0XHRcdFx0XHROb3RlYm9va0VkaXRvclByaW9yaXR5LmRlZmF1bHQsXG5cdFx0XHRcdFx0Tm90ZWJvb2tFZGl0b3JQcmlvcml0eS5vcHRpb24sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdG1hcmtkb3duRW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMucHJpb3JpdHkuZGVmYXVsdCcsICdUaGUgZWRpdG9yIGlzIGF1dG9tYXRpY2FsbHkgdXNlZCB3aGVuIHRoZSB1c2VyIG9wZW5zIGEgcmVzb3VyY2UsIHByb3ZpZGVkIHRoYXQgbm8gb3RoZXIgZGVmYXVsdCBjdXN0b20gZWRpdG9ycyBhcmUgcmVnaXN0ZXJlZCBmb3IgdGhhdCByZXNvdXJjZS4nKSxcblx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnByaW9yaXR5Lm9wdGlvbicsICdUaGUgZWRpdG9yIGlzIG5vdCBhdXRvbWF0aWNhbGx5IHVzZWQgd2hlbiB0aGUgdXNlciBvcGVucyBhIHJlc291cmNlLCBidXQgYSB1c2VyIGNhbiBzd2l0Y2ggdG8gdGhlIGVkaXRvciB1c2luZyB0aGUgYFJlb3BlbiBXaXRoYCBjb21tYW5kLicpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRkZWZhdWx0OiAnZGVmYXVsdCdcblx0XHRcdH1cblx0XHR9XG5cdH1cbn07XG5cbmNvbnN0IGRlZmF1bHRSZW5kZXJlclNuaXBwZXQgPSBPYmplY3QuZnJlZXplKHsgaWQ6ICcnLCBkaXNwbGF5TmFtZTogJycsIG1pbWVUeXBlczogWycnXSwgZW50cnlwb2ludDogJycgfSk7XG5cbmNvbnN0IG5vdGVib29rUmVuZGVyZXJDb250cmlidXRpb246IElKU09OU2NoZW1hID0ge1xuXHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5yZW5kZXJlcicsICdDb250cmlidXRlcyBub3RlYm9vayBvdXRwdXQgcmVuZGVyZXIgcHJvdmlkZXIuJyksXG5cdHR5cGU6ICdhcnJheScsXG5cdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogW2RlZmF1bHRSZW5kZXJlclNuaXBwZXRdIH1dLFxuXHRpdGVtczoge1xuXHRcdGRlZmF1bHRTbmlwcGV0czogW3sgYm9keTogZGVmYXVsdFJlbmRlcmVyU25pcHBldCB9XSxcblx0XHRhbGxPZjogW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cmVxdWlyZWQ6IFtcblx0XHRcdFx0XHROb3RlYm9va1JlbmRlcmVyQ29udHJpYnV0aW9uLmlkLFxuXHRcdFx0XHRcdE5vdGVib29rUmVuZGVyZXJDb250cmlidXRpb24uZGlzcGxheU5hbWUsXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRbTm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbi5pZF06IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMubm90ZWJvb2sucmVuZGVyZXIudmlld1R5cGUnLCAnVW5pcXVlIGlkZW50aWZpZXIgb2YgdGhlIG5vdGVib29rIG91dHB1dCByZW5kZXJlci4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFtOb3RlYm9va1JlbmRlcmVyQ29udHJpYnV0aW9uLmRpc3BsYXlOYW1lXToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5yZW5kZXJlci5kaXNwbGF5TmFtZScsICdIdW1hbiByZWFkYWJsZSBuYW1lIG9mIHRoZSBub3RlYm9vayBvdXRwdXQgcmVuZGVyZXIuJyksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRbTm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbi5oYXJkRGVwZW5kZW5jaWVzXToge1xuXHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdHVuaXF1ZUl0ZW1zOiB0cnVlLFxuXHRcdFx0XHRcdFx0aXRlbXM6IHsgdHlwZTogJ3N0cmluZycgfSxcblx0XHRcdFx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMubm90ZWJvb2sucmVuZGVyZXIuaGFyZERlcGVuZGVuY2llcycsICdMaXN0IG9mIGtlcm5lbCBkZXBlbmRlbmNpZXMgdGhlIHJlbmRlcmVyIHJlcXVpcmVzLiBJZiBhbnkgb2YgdGhlIGRlcGVuZGVuY2llcyBhcmUgcHJlc2VudCBpbiB0aGUgYE5vdGVib29rS2VybmVsLnByZWxvYWRzYCwgdGhlIHJlbmRlcmVyIGNhbiBiZSB1c2VkLicpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0W05vdGVib29rUmVuZGVyZXJDb250cmlidXRpb24ub3B0aW9uYWxEZXBlbmRlbmNpZXNdOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYXJyYXknLFxuXHRcdFx0XHRcdFx0dW5pcXVlSXRlbXM6IHRydWUsXG5cdFx0XHRcdFx0XHRpdGVtczogeyB0eXBlOiAnc3RyaW5nJyB9LFxuXHRcdFx0XHRcdFx0bWFya2Rvd25EZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5yZW5kZXJlci5vcHRpb25hbERlcGVuZGVuY2llcycsICdMaXN0IG9mIHNvZnQga2VybmVsIGRlcGVuZGVuY2llcyB0aGUgcmVuZGVyZXIgY2FuIG1ha2UgdXNlIG9mLiBJZiBhbnkgb2YgdGhlIGRlcGVuZGVuY2llcyBhcmUgcHJlc2VudCBpbiB0aGUgYE5vdGVib29rS2VybmVsLnByZWxvYWRzYCwgdGhlIHJlbmRlcmVyIHdpbGwgYmUgcHJlZmVycmVkIG92ZXIgcmVuZGVyZXJzIHRoYXQgZG9uXFwndCBpbnRlcmFjdCB3aXRoIHRoZSBrZXJuZWwuJyksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRbTm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbi5yZXF1aXJlc01lc3NhZ2luZ106IHtcblx0XHRcdFx0XHRcdGRlZmF1bHQ6ICduZXZlcicsXG5cdFx0XHRcdFx0XHRlbnVtOiBbXG5cdFx0XHRcdFx0XHRcdCdhbHdheXMnLFxuXHRcdFx0XHRcdFx0XHQnb3B0aW9uYWwnLFxuXHRcdFx0XHRcdFx0XHQnbmV2ZXInLFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5yZW5kZXJlci5yZXF1aXJlc01lc3NhZ2luZy5hbHdheXMnLCAnTWVzc2FnaW5nIGlzIHJlcXVpcmVkLiBUaGUgcmVuZGVyZXIgd2lsbCBvbmx5IGJlIHVzZWQgd2hlbiBpdFxcJ3MgcGFydCBvZiBhbiBleHRlbnNpb24gdGhhdCBjYW4gYmUgcnVuIGluIGFuIGV4dGVuc2lvbiBob3N0LicpLFxuXHRcdFx0XHRcdFx0XHRubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLm5vdGVib29rLnJlbmRlcmVyLnJlcXVpcmVzTWVzc2FnaW5nLm9wdGlvbmFsJywgJ1RoZSByZW5kZXJlciBpcyBiZXR0ZXIgd2l0aCBtZXNzYWdpbmcgYXZhaWxhYmxlLCBidXQgaXRcXCdzIG5vdCByZXF1aXJlZC4nKSxcblx0XHRcdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5yZW5kZXJlci5yZXF1aXJlc01lc3NhZ2luZy5uZXZlcicsICdUaGUgcmVuZGVyZXIgZG9lcyBub3QgcmVxdWlyZSBtZXNzYWdpbmcuJyksXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMubm90ZWJvb2sucmVuZGVyZXIucmVxdWlyZXNNZXNzYWdpbmcnLCAnRGVmaW5lcyBob3cgYW5kIGlmIHRoZSByZW5kZXJlciBuZWVkcyB0byBjb21tdW5pY2F0ZSB3aXRoIGFuIGV4dGVuc2lvbiBob3N0LCB2aWEgYGNyZWF0ZVJlbmRlcmVyTWVzc2FnaW5nYC4gUmVuZGVyZXJzIHdpdGggc3Ryb25nZXIgbWVzc2FnaW5nIHJlcXVpcmVtZW50cyBtYXkgbm90IHdvcmsgaW4gYWxsIGVudmlyb25tZW50cy4nKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRvbmVPZjogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbXG5cdFx0XHRcdFx0XHRcdE5vdGVib29rUmVuZGVyZXJDb250cmlidXRpb24uZW50cnlwb2ludCxcblx0XHRcdFx0XHRcdFx0Tm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbi5taW1lVHlwZXMsXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRbTm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbi5taW1lVHlwZXNdOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5zZWxlY3RvcicsICdTZXQgb2YgZ2xvYnMgdGhhdCB0aGUgbm90ZWJvb2sgaXMgZm9yLicpLFxuXHRcdFx0XHRcdFx0XHRcdGl0ZW1zOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0W05vdGVib29rUmVuZGVyZXJDb250cmlidXRpb24uZW50cnlwb2ludF06IHtcblx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5yZW5kZXJlci5lbnRyeXBvaW50JywgJ0ZpbGUgdG8gbG9hZCBpbiB0aGUgd2VidmlldyB0byByZW5kZXIgdGhlIGV4dGVuc2lvbi4nKSxcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHJlcXVpcmVkOiBbXG5cdFx0XHRcdFx0XHRcdE5vdGVib29rUmVuZGVyZXJDb250cmlidXRpb24uZW50cnlwb2ludCxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdFtOb3RlYm9va1JlbmRlcmVyQ29udHJpYnV0aW9uLmVudHJ5cG9pbnRdOiB7XG5cdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMubm90ZWJvb2sucmVuZGVyZXIuZW50cnlwb2ludCcsICdGaWxlIHRvIGxvYWQgaW4gdGhlIHdlYnZpZXcgdG8gcmVuZGVyIHRoZSBleHRlbnNpb24uJyksXG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IFsnZXh0ZW5kcycsICdwYXRoJ10sXG5cdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0ZXh0ZW5kczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMubm90ZWJvb2sucmVuZGVyZXIuZW50cnlwb2ludC5leHRlbmRzJywgJ0V4aXN0aW5nIHJlbmRlcmVyIHRoYXQgdGhpcyBvbmUgZXh0ZW5kcy4nKSxcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRwYXRoOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogbmxzLmxvY2FsaXplKCdjb250cmlidXRlcy5ub3RlYm9vay5yZW5kZXJlci5lbnRyeXBvaW50JywgJ0ZpbGUgdG8gbG9hZCBpbiB0aGUgd2VidmlldyB0byByZW5kZXIgdGhlIGV4dGVuc2lvbi4nKSxcblx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdF1cblx0fVxufTtcblxuY29uc3Qgbm90ZWJvb2tQcmVsb2FkQ29udHJpYnV0aW9uOiBJSlNPTlNjaGVtYSA9IHtcblx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMucHJlbG9hZC5wcm92aWRlcicsICdDb250cmlidXRlcyBub3RlYm9vayBwcmVsb2Fkcy4nKSxcblx0dHlwZTogJ2FycmF5Jyxcblx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiBbeyB0eXBlOiAnJywgZW50cnlwb2ludDogJycgfV0gfV0sXG5cdGl0ZW1zOiB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cmVxdWlyZWQ6IFtcblx0XHRcdE5vdGVib29rUHJlbG9hZENvbnRyaWJ1dGlvbi50eXBlLFxuXHRcdFx0Tm90ZWJvb2tQcmVsb2FkQ29udHJpYnV0aW9uLmVudHJ5cG9pbnRcblx0XHRdLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFtOb3RlYm9va1ByZWxvYWRDb250cmlidXRpb24udHlwZV06IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnByZWxvYWQucHJvdmlkZXIudmlld1R5cGUnLCAnVHlwZSBvZiB0aGUgbm90ZWJvb2suJyksXG5cdFx0XHR9LFxuXHRcdFx0W05vdGVib29rUHJlbG9hZENvbnRyaWJ1dGlvbi5lbnRyeXBvaW50XToge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IG5scy5sb2NhbGl6ZSgnY29udHJpYnV0ZXMucHJlbG9hZC5lbnRyeXBvaW50JywgJ1BhdGggdG8gZmlsZSBsb2FkZWQgaW4gdGhlIHdlYnZpZXcuJyksXG5cdFx0XHR9LFxuXHRcdFx0W05vdGVib29rUHJlbG9hZENvbnRyaWJ1dGlvbi5sb2NhbFJlc291cmNlUm9vdHNdOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBubHMubG9jYWxpemUoJ2NvbnRyaWJ1dGVzLnByZWxvYWQubG9jYWxSZXNvdXJjZVJvb3RzJywgJ1BhdGhzIHRvIGFkZGl0aW9uYWwgcmVzb3VyY2VzIHRoYXQgc2hvdWxkIGJlIGFsbG93ZWQgaW4gdGhlIHdlYnZpZXcuJyksXG5cdFx0XHR9LFxuXHRcdH1cblx0fVxufTtcblxuZXhwb3J0IGNvbnN0IG5vdGVib29rc0V4dGVuc2lvblBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SU5vdGVib29rRWRpdG9yQ29udHJpYnV0aW9uW10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdub3RlYm9va3MnLFxuXHRqc29uU2NoZW1hOiBub3RlYm9va1Byb3ZpZGVyQ29udHJpYnV0aW9uLFxuXHRhY3RpdmF0aW9uRXZlbnRzR2VuZXJhdG9yOiBmdW5jdGlvbiogKGNvbnRyaWJzOiByZWFkb25seSBJTm90ZWJvb2tFZGl0b3JDb250cmlidXRpb25bXSkge1xuXHRcdGZvciAoY29uc3QgY29udHJpYiBvZiBjb250cmlicykge1xuXHRcdFx0aWYgKGNvbnRyaWIudHlwZSkge1xuXHRcdFx0XHR5aWVsZCBgb25Ob3RlYm9va1NlcmlhbGl6ZXI6JHtjb250cmliLnR5cGV9YDtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5leHBvcnQgY29uc3Qgbm90ZWJvb2tSZW5kZXJlckV4dGVuc2lvblBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SU5vdGVib29rUmVuZGVyZXJDb250cmlidXRpb25bXT4oe1xuXHRleHRlbnNpb25Qb2ludDogJ25vdGVib29rUmVuZGVyZXInLFxuXHRqc29uU2NoZW1hOiBub3RlYm9va1JlbmRlcmVyQ29udHJpYnV0aW9uLFxuXHRhY3RpdmF0aW9uRXZlbnRzR2VuZXJhdG9yOiBmdW5jdGlvbiogKGNvbnRyaWJzOiByZWFkb25seSBJTm90ZWJvb2tSZW5kZXJlckNvbnRyaWJ1dGlvbltdKSB7XG5cdFx0Zm9yIChjb25zdCBjb250cmliIG9mIGNvbnRyaWJzKSB7XG5cdFx0XHRpZiAoY29udHJpYi5pZCkge1xuXHRcdFx0XHR5aWVsZCBgb25SZW5kZXJlcjoke2NvbnRyaWIuaWR9YDtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5leHBvcnQgY29uc3Qgbm90ZWJvb2tQcmVsb2FkRXh0ZW5zaW9uUG9pbnQgPSBFeHRlbnNpb25zUmVnaXN0cnkucmVnaXN0ZXJFeHRlbnNpb25Qb2ludDxJTm90ZWJvb2tQcmVsb2FkQ29udHJpYnV0aW9uW10+KHtcblx0ZXh0ZW5zaW9uUG9pbnQ6ICdub3RlYm9va1ByZWxvYWQnLFxuXHRqc29uU2NoZW1hOiBub3RlYm9va1ByZWxvYWRDb250cmlidXRpb24sXG59KTtcblxuY2xhc3MgTm90ZWJvb2tzRGF0YVJlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFeHRlbnNpb25GZWF0dXJlVGFibGVSZW5kZXJlciB7XG5cblx0cmVhZG9ubHkgdHlwZSA9ICd0YWJsZSc7XG5cblx0c2hvdWxkUmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFtYW5pZmVzdC5jb250cmlidXRlcz8ubm90ZWJvb2tzO1xuXHR9XG5cblx0cmVuZGVyKG1hbmlmZXN0OiBJRXh0ZW5zaW9uTWFuaWZlc3QpOiBJUmVuZGVyZWREYXRhPElUYWJsZURhdGE+IHtcblx0XHRjb25zdCBjb250cmliID0gbWFuaWZlc3QuY29udHJpYnV0ZXM/Lm5vdGVib29rcyB8fCBbXTtcblx0XHRpZiAoIWNvbnRyaWIubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4geyBkYXRhOiB7IGhlYWRlcnM6IFtdLCByb3dzOiBbXSB9LCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHR9XG5cblx0XHRjb25zdCBoZWFkZXJzID0gW1xuXHRcdFx0bmxzLmxvY2FsaXplKCdOb3RlYm9vayBpZCcsIFwiSURcIiksXG5cdFx0XHRubHMubG9jYWxpemUoJ05vdGVib29rIG5hbWUnLCBcIk5hbWVcIiksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHJvd3M6IElSb3dEYXRhW11bXSA9IGNvbnRyaWJcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLnR5cGUubG9jYWxlQ29tcGFyZShiLnR5cGUpKVxuXHRcdFx0Lm1hcChub3RlYm9vayA9PiB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bm90ZWJvb2sudHlwZSxcblx0XHRcdFx0XHRub3RlYm9vay5kaXNwbGF5TmFtZVxuXHRcdFx0XHRdO1xuXHRcdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGF0YToge1xuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0XHRyb3dzXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9XG5cdFx0fTtcblx0fVxufVxuXG5jbGFzcyBOb3RlYm9va1JlbmRlcmVyc0RhdGFSZW5kZXJlciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJRXh0ZW5zaW9uRmVhdHVyZVRhYmxlUmVuZGVyZXIge1xuXG5cdHJlYWRvbmx5IHR5cGUgPSAndGFibGUnO1xuXG5cdHNob3VsZFJlbmRlcihtYW5pZmVzdDogSUV4dGVuc2lvbk1hbmlmZXN0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhbWFuaWZlc3QuY29udHJpYnV0ZXM/Lm5vdGVib29rUmVuZGVyZXI7XG5cdH1cblxuXHRyZW5kZXIobWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCk6IElSZW5kZXJlZERhdGE8SVRhYmxlRGF0YT4ge1xuXHRcdGNvbnN0IGNvbnRyaWIgPSBtYW5pZmVzdC5jb250cmlidXRlcz8ubm90ZWJvb2tSZW5kZXJlciB8fCBbXTtcblx0XHRpZiAoIWNvbnRyaWIubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4geyBkYXRhOiB7IGhlYWRlcnM6IFtdLCByb3dzOiBbXSB9LCBkaXNwb3NlOiAoKSA9PiB7IH0gfTtcblx0XHR9XG5cblx0XHRjb25zdCBoZWFkZXJzID0gW1xuXHRcdFx0bmxzLmxvY2FsaXplKCdOb3RlYm9vayByZW5kZXJlciBuYW1lJywgXCJOYW1lXCIpLFxuXHRcdFx0bmxzLmxvY2FsaXplKCdOb3RlYm9vayBtaW1ldHlwZXMnLCBcIk1pbWV0eXBlc1wiKSxcblx0XHRdO1xuXG5cdFx0Y29uc3Qgcm93czogSVJvd0RhdGFbXVtdID0gY29udHJpYlxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGEuZGlzcGxheU5hbWUubG9jYWxlQ29tcGFyZShiLmRpc3BsYXlOYW1lKSlcblx0XHRcdC5tYXAobm90ZWJvb2tSZW5kZXJlciA9PiB7XG5cdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0bm90ZWJvb2tSZW5kZXJlci5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRub3RlYm9va1JlbmRlcmVyLm1pbWVUeXBlcy5qb2luKCcsJylcblx0XHRcdFx0XTtcblx0XHRcdH0pO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0cm93c1xuXHRcdFx0fSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdH07XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkucmVnaXN0ZXJFeHRlbnNpb25GZWF0dXJlKHtcblx0aWQ6ICdub3RlYm9va3MnLFxuXHRsYWJlbDogbmxzLmxvY2FsaXplKCdub3RlYm9va3MnLCBcIk5vdGVib29rc1wiKSxcblx0YWNjZXNzOiB7XG5cdFx0Y2FuVG9nZ2xlOiBmYWxzZVxuXHR9LFxuXHRyZW5kZXJlcjogbmV3IFN5bmNEZXNjcmlwdG9yKE5vdGVib29rc0RhdGFSZW5kZXJlciksXG59KTtcblxuUmVnaXN0cnkuYXM8SUV4dGVuc2lvbkZlYXR1cmVzUmVnaXN0cnk+KEV4dGVuc2lvbnMuRXh0ZW5zaW9uRmVhdHVyZXNSZWdpc3RyeSkucmVnaXN0ZXJFeHRlbnNpb25GZWF0dXJlKHtcblx0aWQ6ICdub3RlYm9va1JlbmRlcmVyJyxcblx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnbm90ZWJvb2tSZW5kZXJlcicsIFwiTm90ZWJvb2sgUmVuZGVyZXJzXCIpLFxuXHRhY2Nlc3M6IHtcblx0XHRjYW5Ub2dnbGU6IGZhbHNlXG5cdH0sXG5cdHJlbmRlcmVyOiBuZXcgU3luY0Rlc2NyaXB0b3IoTm90ZWJvb2tSZW5kZXJlcnNEYXRhUmVuZGVyZXIpLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxZQUFZLFNBQVM7QUFDckIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw4QkFBNEY7QUFDckcsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxzQkFBc0I7QUFDL0IsU0FBMEcsa0JBQWtCO0FBQzVILFNBQVMsZ0JBQWdCO0FBRXpCLE1BQU0sNkJBQTZCLE9BQU8sT0FBTztBQUFBLEVBQ2hELE1BQU07QUFBQSxFQUNOLGFBQWE7QUFBQSxFQUNiLFVBQVU7QUFBQSxFQUNWLFVBQVU7QUFDWCxDQUFDO0FBU0QsTUFBTSwrQkFBK0IsT0FBTyxPQUFPO0FBQUEsRUFDbEQsSUFBSTtBQUFBLEVBQ0osYUFBYTtBQUFBLEVBQ2IsV0FBVztBQUFBLEVBQ1gsWUFBWTtBQUFBLEVBQ1osa0JBQWtCO0FBQUEsRUFDbEIsc0JBQXNCO0FBQUEsRUFDdEIsbUJBQW1CO0FBQ3BCLENBQUM7QUFZRCxNQUFNLDhCQUE4QixPQUFPLE9BQU87QUFBQSxFQUNqRCxNQUFNO0FBQUEsRUFDTixZQUFZO0FBQUEsRUFDWixvQkFBb0I7QUFDckIsQ0FBQztBQVFELE1BQU0sK0JBQTRDO0FBQUEsRUFDakQsYUFBYSxJQUFJLFNBQVMsaUNBQWlDLHlDQUF5QztBQUFBLEVBQ3BHLE1BQU07QUFBQSxFQUNOLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxDQUFDLEVBQUUsTUFBTSxJQUFJLGFBQWEsSUFBSSxZQUFZLENBQUMsRUFBRSxtQkFBbUIsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFBQSxFQUNwRyxPQUFPO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixVQUFVO0FBQUEsTUFDVCwyQkFBMkI7QUFBQSxNQUMzQiwyQkFBMkI7QUFBQSxN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
