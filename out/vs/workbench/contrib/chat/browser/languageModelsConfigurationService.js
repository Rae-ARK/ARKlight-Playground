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
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService, MODAL_GROUP } from "../../../services/editor/common/editorService.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { equals } from "../../../../base/common/objects.js";
import { visit } from "../../../../base/common/json.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { getCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { SnippetController2 } from "../../../../editor/contrib/snippet/browser/snippetController2.js";
import { ILanguageModelsConfigurationService } from "../common/languageModelsConfiguration.js";
import { Extensions as JSONExtensions } from "../../../../platform/jsonschemas/common/jsonContributionRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ILanguageModelsService } from "../common/languageModels.js";
import { DEFAULT_EDITOR_ASSOCIATION } from "../../../common/editor.js";
let LanguageModelsConfigurationService = class extends Disposable {
  constructor(fileService, textFileService, textModelService, editorService, editorGroupsService, userDataProfileService, uriIdentityService) {
    super();
    this.fileService = fileService;
    this.textFileService = textFileService;
    this.textModelService = textModelService;
    this.editorService = editorService;
    this.editorGroupsService = editorGroupsService;
    this._onDidChangeLanguageModelGroups = this._register(new Emitter());
    this.onDidChangeLanguageModelGroups = this._onDidChangeLanguageModelGroups.event;
    this.languageModelsProviderGroups = [];
    this.modelsConfigurationFile = userDataProfileService.currentProfile.languageModelsResource;
    this._whenReady = this.updateLanguageModelsConfiguration().catch(() => {
    });
    this._register(fileService.watch(uriIdentityService.extUri.dirname(this.modelsConfigurationFile)));
    this._register(fileService.onDidFilesChange((e) => {
      if (e.contains(this.modelsConfigurationFile)) {
        this.updateLanguageModelsConfiguration();
      }
    }));
  }
  get configurationFile() {
    return this.modelsConfigurationFile;
  }
  get whenReady() {
    return this._whenReady;
  }
  setLanguageModelsConfiguration(languageModelsConfiguration) {
    const changedGroups = [];
    const oldGroupMap = new Map(this.languageModelsProviderGroups.map((g) => [`${g.vendor}:${g.name}`, g]));
    const newGroupMap = new Map(languageModelsConfiguration.map((g) => [`${g.vendor}:${g.name}`, g]));
    for (const [key, newGroup] of newGroupMap) {
      const oldGroup = oldGroupMap.get(key);
      if (!oldGroup || !equals(oldGroup, newGroup)) {
        changedGroups.push(newGroup);
      }
    }
    for (const [key, oldGroup] of oldGroupMap) {
      if (!newGroupMap.has(key)) {
        changedGroups.push(oldGroup);
      }
    }
    this.languageModelsProviderGroups = languageModelsConfiguration;
    if (changedGroups.length > 0) {
      this._onDidChangeLanguageModelGroups.fire(changedGroups);
    }
  }
  async updateLanguageModelsConfiguration() {
    const languageModelsProviderGroups = await this.withLanguageModelsProviderGroups();
    this.setLanguageModelsConfiguration(languageModelsProviderGroups);
  }
  getLanguageModelsProviderGroups() {
    return this.languageModelsProviderGroups;
  }
  async addLanguageModelsProviderGroup(toAdd) {
    await this.withLanguageModelsProviderGroups(async (languageModelsProviderGroups) => {
      if (languageModelsProviderGroups.some(({ name, vendor }) => name === toAdd.name && vendor === toAdd.vendor)) {
        throw new Error(`Language model group with name ${toAdd.name} already exists for vendor ${toAdd.vendor}`);
      }
      languageModelsProviderGroups.push(toAdd);
      return languageModelsProviderGroups;
    });
    await this.updateLanguageModelsConfiguration();
    const result = this.getLanguageModelsProviderGroups().find((group) => group.name === toAdd.name && group.vendor === toAdd.vendor);
    if (!result) {
      throw new Error(`Language model group with name ${toAdd.name} not found for vendor ${toAdd.vendor}`);
    }
    return result;
  }
  async updateLanguageModelsProviderGroup(from, to) {
    await this.withLanguageModelsProviderGroups(async (languageModelsProviderGroups) => {
      const result2 = [];
      for (const group of languageModelsProviderGroups) {
        if (group.name === from.name && group.vendor === from.vendor) {
          result2.push(to);
        } else {
          result2.push(group);
        }
      }
      return result2;
    });
    await this.updateLanguageModelsConfiguration();
    const result = this.getLanguageModelsProviderGroups().find((group) => group.name === to.name && group.vendor === to.vendor);
    if (!result) {
      throw new Error(`Language model group with name ${to.name} not found for vendor ${to.vendor}`);
    }
    return result;
  }
  async removeLanguageModelsProviderGroup(toRemove) {
    await this.withLanguageModelsProviderGroups(async (languageModelsProviderGroups) => {
      const result = [];
      for (const group of languageModelsProviderGroups) {
        if (group.name === toRemove.name && group.vendor === toRemove.vendor) {
          continue;
        }
        result.push(group);
      }
      return result;
    });
    await this.updateLanguageModelsConfiguration();
  }
  async configureLanguageModels(options) {
    const preferredGroup = this.editorGroupsService.getPart(this.editorGroupsService.activeGroup) === this.editorGroupsService.activeModalEditorPart ? MODAL_GROUP : void 0;
    const editor = await this.editorService.openEditor({
      resource: this.modelsConfigurationFile,
      options: { override: DEFAULT_EDITOR_ASSOCIATION.id }
    }, preferredGroup);
    if (!editor || !options?.group) {
      return;
    }
    const codeEditor = getCodeEditor(editor.getControl());
    if (!codeEditor) {
      return;
    }
    if (options.snippet) {
      const model = codeEditor.getModel();
      if (!model) {
        return;
      }
      const targetRange = options.snippetTarget === "models" ? options.group.modelsRange : options.group.range;
      if (!targetRange) {
        return;
      }
      const models = options.group.models;
      const isModelsArray = options.snippetTarget === "models" && Array.isArray(models);
      const emptyModelsArray = isModelsArray && models.length === 0;
      const insertBeforeModelsArrayEnd = emptyModelsArray || isModelsArray && targetRange.startLineNumber === targetRange.endLineNumber;
      const lastPropertyLine = targetRange.endLineNumber - 1;
      const insertPosition = insertBeforeModelsArrayEnd ? {
        lineNumber: targetRange.endLineNumber,
        column: targetRange.endColumn - 1
      } : {
        lineNumber: lastPropertyLine,
        column: model.getLineLength(lastPropertyLine) + 1
      };
      codeEditor.setPosition(insertPosition);
      codeEditor.revealPositionNearTop(insertPosition);
      codeEditor.focus();
      SnippetController2.get(codeEditor)?.insert(emptyModelsArray ? options.snippet : ",\n" + options.snippet);
    } else {
      if (!options.group.range) {
        return;
      }
      const position = { lineNumber: options.group.range.startLineNumber, column: options.group.range.startColumn };
      codeEditor.setPosition(position);
      codeEditor.revealPositionNearTop(position);
      codeEditor.focus();
    }
  }
  async withLanguageModelsProviderGroups(update) {
    const exists = await this.fileService.exists(this.modelsConfigurationFile);
    if (!exists) {
      await this.fileService.writeFile(this.modelsConfigurationFile, VSBuffer.fromString(JSON.stringify([], void 0, "	")));
    }
    const ref = await this.textModelService.createModelReference(this.modelsConfigurationFile);
    const model = ref.object.textEditorModel;
    try {
      const languageModelsProviderGroups = parseLanguageModelsProviderGroups(model);
      if (!update) {
        return languageModelsProviderGroups;
      }
      const updatedLanguageModelsProviderGroups = await update(languageModelsProviderGroups);
      for (const group of updatedLanguageModelsProviderGroups) {
        delete group.range;
        delete group.modelsRange;
      }
      model.setValue(JSON.stringify(updatedLanguageModelsProviderGroups, void 0, "	"));
      await this.textFileService.save(this.modelsConfigurationFile);
      return updatedLanguageModelsProviderGroups;
    } finally {
      ref.dispose();
    }
  }
};
LanguageModelsConfigurationService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, ITextFileService),
  __decorateParam(2, ITextModelService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IEditorGroupsService),
  __decorateParam(5, IUserDataProfileService),
  __decorateParam(6, IUriIdentityService)
], LanguageModelsConfigurationService);
function parseLanguageModelsProviderGroups(model) {
  const configuration = [];
  let currentProperty = null;
  let currentParent = configuration;
  const previousParents = [];
  function onValue(value, offset, length) {
    if (Array.isArray(currentParent)) {
      currentParent.push(value);
    } else if (currentProperty !== null) {
      currentParent[currentProperty] = value;
    }
  }
  const visitor = {
    onObjectBegin: (offset, length) => {
      const object = {};
      if (previousParents.length === 1 && Array.isArray(currentParent)) {
        const start = model.getPositionAt(offset);
        const end = model.getPositionAt(offset + length);
        object.range = {
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column
        };
      }
      onValue(object, offset, length);
      previousParents.push(currentParent);
      currentParent = object;
      currentProperty = null;
    },
    onObjectProperty: (name, offset, length) => {
      currentProperty = name;
    },
    onObjectEnd: (offset, length) => {
      const parent = currentParent;
      if (parent.range) {
        const end = model.getPositionAt(offset + length);
        parent.range = {
          startLineNumber: parent.range.startLineNumber,
          startColumn: parent.range.startColumn,
          endLineNumber: end.lineNumber,
          endColumn: end.column
        };
      }
      if (parent._parentConfigurationRange) {
        const end = model.getPositionAt(offset + length);
        parent._parentConfigurationRange.endLineNumber = end.lineNumber;
        parent._parentConfigurationRange.endColumn = end.column;
        delete parent._parentConfigurationRange;
      }
      currentParent = previousParents.pop();
    },
    onArrayBegin: (offset, length) => {
      if (currentParent === configuration && previousParents.length === 0) {
        previousParents.push(currentParent);
        currentProperty = null;
        return;
      }
      const array = [];
      const parent = currentParent;
      if (currentProperty === "models" && parent.range) {
        const start = model.getPositionAt(offset);
        const end = model.getPositionAt(offset + length);
        parent.modelsRange = {
          startLineNumber: start.lineNumber,
          startColumn: start.column,
          endLineNumber: end.lineNumber,
          endColumn: end.column
        };
        array._parentModelsRange = parent.modelsRange;
      }
      onValue(array, offset, length);
      previousParents.push(currentParent);
      currentParent = array;
      currentProperty = null;
    },
    onArrayEnd: (offset, length) => {
      const parent = currentParent;
      if (parent._parentConfigurationRange) {
        const end = model.getPositionAt(offset + length);
        parent._parentConfigurationRange.endLineNumber = end.lineNumber;
        parent._parentConfigurationRange.endColumn = end.column;
        delete parent._parentConfigurationRange;
      }
      if (parent._parentModelsRange) {
        const end = model.getPositionAt(offset + length);
        parent._parentModelsRange.endLineNumber = end.lineNumber;
        parent._parentModelsRange.endColumn = end.column;
        delete parent._parentModelsRange;
      }
      currentParent = previousParents.pop();
    },
    onLiteralValue: (value, offset, length) => {
      onValue(value, offset, length);
    }
  };
  visit(model.getValue(), visitor);
  return configuration;
}
const languageModelsSchemaId = "vscode://schemas/language-models";
let ChatLanguageModelsDataContribution = class extends Disposable {
  constructor(languageModelsService, languageModelsConfigurationService) {
    super();
    this.languageModelsService = languageModelsService;
    const registry = Registry.as(JSONExtensions.JSONContribution);
    this._register(registry.registerSchemaAssociation(languageModelsSchemaId, languageModelsConfigurationService.configurationFile.toString()));
    this.updateSchema(registry);
    this._register(this.languageModelsService.onDidChangeLanguageModels(() => this.updateSchema(registry)));
  }
  updateSchema(registry) {
    const vendors = this.languageModelsService.getVendors();
    const modelSchemas = [];
    const modelIds = this.languageModelsService.getLanguageModelIds();
    for (const modelId of modelIds) {
      const metadata = this.languageModelsService.lookupLanguageModel(modelId);
      if (metadata?.configurationSchema) {
        modelSchemas.push({
          if: {
            properties: {
              vendor: { const: metadata.vendor }
            }
          },
          then: {
            properties: {
              settings: {
                type: "object",
                properties: {
                  [metadata.id]: metadata.configurationSchema
                }
              }
            }
          }
        });
      }
    }
    const schema = {
      type: "array",
      items: {
        properties: {
          vendor: {
            type: "string",
            enum: vendors.map((v) => v.vendor)
          },
          name: { type: "string" },
          settings: {
            type: "object",
            description: localize("settings.perModelConfig", "Per-model settings")
          }
        },
        allOf: [
          ...vendors.map((vendor) => ({
            if: {
              properties: {
                vendor: { const: vendor.vendor }
              }
            },
            then: vendor.configuration
          })),
          ...modelSchemas
        ],
        required: ["vendor", "name"]
      }
    };
    registry.registerSchema(languageModelsSchemaId, schema);
  }
};
ChatLanguageModelsDataContribution.ID = "workbench.contrib.chatLanguageModelsData";
ChatLanguageModelsDataContribution = __decorateClass([
  __decorateParam(0, ILanguageModelsService),
  __decorateParam(1, ILanguageModelsConfigurationService)
], ChatLanguageModelsDataContribution);
export {
  ChatLanguageModelsDataContribution,
  LanguageModelsConfigurationService,
  parseLanguageModelsProviderGroups
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE11dGFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UsIE1PREFMX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgZXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSlNPTlZpc2l0b3IsIHZpc2l0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IGdldENvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IFNuaXBwZXRDb250cm9sbGVyMiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0Q29udHJvbGxlcjIuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJlTGFuZ3VhZ2VNb2RlbHNPcHRpb25zLCBJTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uU2VydmljZSwgSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCB9IGZyb20gJy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUpTT05Db250cmlidXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBKU09ORXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2pzb25zY2hlbWFzL2NvbW1vbi9qc29uQ29udHJpYnV0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSUpTT05TY2hlbWEgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uU2NoZW1hLmpzJztcbmltcG9ydCB7IERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5cbnR5cGUgTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcyA9IE11dGFibGU8SUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cD5bXTtcblxuZXhwb3J0IGNsYXNzIExhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWxzQ29uZmlndXJhdGlvbkZpbGU6IFVSSTtcblx0Z2V0IGNvbmZpZ3VyYXRpb25GaWxlKCk6IFVSSSB7IHJldHVybiB0aGlzLm1vZGVsc0NvbmZpZ3VyYXRpb25GaWxlOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsR3JvdXBzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8cmVhZG9ubHkgSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cFtdPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsR3JvdXBzOiBFdmVudDxyZWFkb25seSBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwW10+ID0gdGhpcy5fb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsR3JvdXBzLmV2ZW50O1xuXG5cdHByaXZhdGUgbGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwczogTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcyA9IFtdO1xuXG5cdC8qKiBSZXNvbHZlZCBvbmNlIHRoZSBmaXJzdCBjb25maWctZmlsZSBsb2FkIGF0dGVtcHQgY29tcGxldGVzOyBhc3NpZ25lZCBleGFjdGx5IG9uY2UgaW4gdGhlIGN0b3IuIFJlamVjdGlvbnMgYXJlIHN3YWxsb3dlZCBzbyBjb25zdW1lcnMgY2FuIHRyZWF0IHJlYWRpbmVzcyBhcyBcImZpcnN0IGxvYWQgYXR0ZW1wdGVkXCIuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3doZW5SZWFkeTogUHJvbWlzZTx2b2lkPjtcblx0Z2V0IHdoZW5SZWFkeSgpOiBQcm9taXNlPHZvaWQ+IHsgcmV0dXJuIHRoaXMuX3doZW5SZWFkeTsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJVGV4dE1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvckdyb3Vwc1NlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5tb2RlbHNDb25maWd1cmF0aW9uRmlsZSA9IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUubGFuZ3VhZ2VNb2RlbHNSZXNvdXJjZTtcblx0XHR0aGlzLl93aGVuUmVhZHkgPSB0aGlzLnVwZGF0ZUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvbigpLmNhdGNoKCgpID0+IHsgLyogc3dhbGxvdzogcmVhZGluZXNzIHNpZ25hbHMgXCJhdHRlbXB0ZWRcIiwgbm90IFwic3VjY2VlZGVkXCIgKi8gfSk7XG5cdFx0Ly8gV2F0Y2ggdGhlIHBhcmVudCBmb2xkZXIgZm9yIHJlbGlhYmxlIGNoYW5nZSBkZXRlY3Rpb24gYWNyb3NzIHBsYXRmb3JtcyAoZXNwZWNpYWxseSBXaW5kb3dzXG5cdFx0Ly8gd2hlcmUgYGZzLndhdGNoYCBvbiBpbmRpdmlkdWFsIGZpbGVzIGNhbiBtaXNzIGluLXBsYWNlIHdyaXRlcykuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZmlsZVNlcnZpY2Uud2F0Y2godXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5kaXJuYW1lKHRoaXMubW9kZWxzQ29uZmlndXJhdGlvbkZpbGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmNvbnRhaW5zKHRoaXMubW9kZWxzQ29uZmlndXJhdGlvbkZpbGUpKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRMYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb24obGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uOiBMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhbmdlZEdyb3VwczogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cFtdID0gW107XG5cdFx0Y29uc3Qgb2xkR3JvdXBNYXAgPSBuZXcgTWFwKHRoaXMubGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3Vwcy5tYXAoZyA9PiBbYCR7Zy52ZW5kb3J9OiR7Zy5uYW1lfWAsIGddKSk7XG5cdFx0Y29uc3QgbmV3R3JvdXBNYXAgPSBuZXcgTWFwKGxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvbi5tYXAoZyA9PiBbYCR7Zy52ZW5kb3J9OiR7Zy5uYW1lfWAsIGddKSk7XG5cblx0XHQvLyBGaW5kIGFkZGVkIG9yIG1vZGlmaWVkIGdyb3Vwc1xuXHRcdGZvciAoY29uc3QgW2tleSwgbmV3R3JvdXBdIG9mIG5ld0dyb3VwTWFwKSB7XG5cdFx0XHRjb25zdCBvbGRHcm91cCA9IG9sZEdyb3VwTWFwLmdldChrZXkpO1xuXHRcdFx0aWYgKCFvbGRHcm91cCB8fCAhZXF1YWxzKG9sZEdyb3VwLCBuZXdHcm91cCkpIHtcblx0XHRcdFx0Y2hhbmdlZEdyb3Vwcy5wdXNoKG5ld0dyb3VwKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBGaW5kIHJlbW92ZWQgZ3JvdXBzXG5cdFx0Zm9yIChjb25zdCBba2V5LCBvbGRHcm91cF0gb2Ygb2xkR3JvdXBNYXApIHtcblx0XHRcdGlmICghbmV3R3JvdXBNYXAuaGFzKGtleSkpIHtcblx0XHRcdFx0Y2hhbmdlZEdyb3Vwcy5wdXNoKG9sZEdyb3VwKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMgPSBsYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb247XG5cdFx0aWYgKGNoYW5nZWRHcm91cHMubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVsR3JvdXBzLmZpcmUoY2hhbmdlZEdyb3Vwcyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB1cGRhdGVMYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcyA9IGF3YWl0IHRoaXMud2l0aExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMoKTtcblx0XHR0aGlzLnNldExhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvbihsYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKTtcblx0fVxuXG5cdGdldExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMoKTogcmVhZG9ubHkgSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cFtdIHtcblx0XHRyZXR1cm4gdGhpcy5sYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzO1xuXHR9XG5cblx0YXN5bmMgYWRkTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKHRvQWRkOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKTogUHJvbWlzZTxJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwPiB7XG5cdFx0YXdhaXQgdGhpcy53aXRoTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3Vwcyhhc3luYyBsYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzID0+IHtcblx0XHRcdGlmIChsYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzLnNvbWUoKHsgbmFtZSwgdmVuZG9yIH0pID0+IG5hbWUgPT09IHRvQWRkLm5hbWUgJiYgdmVuZG9yID09PSB0b0FkZC52ZW5kb3IpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTGFuZ3VhZ2UgbW9kZWwgZ3JvdXAgd2l0aCBuYW1lICR7dG9BZGQubmFtZX0gYWxyZWFkeSBleGlzdHMgZm9yIHZlbmRvciAke3RvQWRkLnZlbmRvcn1gKTtcblx0XHRcdH1cblx0XHRcdGxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMucHVzaCh0b0FkZCk7XG5cdFx0XHRyZXR1cm4gbGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3Vwcztcblx0XHR9KTtcblxuXHRcdGF3YWl0IHRoaXMudXBkYXRlTGFuZ3VhZ2VNb2RlbHNDb25maWd1cmF0aW9uKCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5nZXRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKCkuZmluZChncm91cCA9PiBncm91cC5uYW1lID09PSB0b0FkZC5uYW1lICYmIGdyb3VwLnZlbmRvciA9PT0gdG9BZGQudmVuZG9yKTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBMYW5ndWFnZSBtb2RlbCBncm91cCB3aXRoIG5hbWUgJHt0b0FkZC5uYW1lfSBub3QgZm91bmQgZm9yIHZlbmRvciAke3RvQWRkLnZlbmRvcn1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIHVwZGF0ZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cChmcm9tOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwLCB0bzogSUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cCk6IFByb21pc2U8SUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cD4ge1xuXHRcdGF3YWl0IHRoaXMud2l0aExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMoYXN5bmMgbGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcyA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMgPSBbXTtcblx0XHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgbGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3Vwcykge1xuXHRcdFx0XHRpZiAoZ3JvdXAubmFtZSA9PT0gZnJvbS5uYW1lICYmIGdyb3VwLnZlbmRvciA9PT0gZnJvbS52ZW5kb3IpIHtcblx0XHRcdFx0XHRyZXN1bHQucHVzaCh0byk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goZ3JvdXApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgdGhpcy51cGRhdGVMYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb24oKTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmdldExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMoKS5maW5kKGdyb3VwID0+IGdyb3VwLm5hbWUgPT09IHRvLm5hbWUgJiYgZ3JvdXAudmVuZG9yID09PSB0by52ZW5kb3IpO1xuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYExhbmd1YWdlIG1vZGVsIGdyb3VwIHdpdGggbmFtZSAke3RvLm5hbWV9IG5vdCBmb3VuZCBmb3IgdmVuZG9yICR7dG8udmVuZG9yfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgcmVtb3ZlTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKHRvUmVtb3ZlOiBJTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy53aXRoTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3Vwcyhhc3luYyBsYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdDogTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcyA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBncm91cCBvZiBsYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKSB7XG5cdFx0XHRcdGlmIChncm91cC5uYW1lID09PSB0b1JlbW92ZS5uYW1lICYmIGdyb3VwLnZlbmRvciA9PT0gdG9SZW1vdmUudmVuZG9yKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzdWx0LnB1c2goZ3JvdXApO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9KTtcblx0XHRhd2FpdCB0aGlzLnVwZGF0ZUxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvbigpO1xuXHR9XG5cblx0YXN5bmMgY29uZmlndXJlTGFuZ3VhZ2VNb2RlbHMob3B0aW9ucz86IENvbmZpZ3VyZUxhbmd1YWdlTW9kZWxzT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIE1pcnJvciB0aGUgc3VyZmFjZSB0aGF0IHRoZSBjaGF0IG1vZGVscyBlZGl0b3IgaXMgY3VycmVudGx5IHNob3duIGluOiBpZlxuXHRcdC8vIGl0IGxpdmVzIGluc2lkZSB0aGUgbW9kYWwgZWRpdG9yIHBhcnQsIG9wZW4gdGhlIEpTT04gaW4gdGhlIG1vZGFsIHRvbztcblx0XHQvLyBvdGhlcndpc2UgZmFsbCBiYWNrIHRvIHRoZSBkZWZhdWx0IGdyb3VwIHJlc29sdXRpb24gKHJlZ3VsYXIgZWRpdG9yIGFyZWEpLlxuXHRcdGNvbnN0IHByZWZlcnJlZEdyb3VwID0gdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLmdldFBhcnQodGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLmFjdGl2ZUdyb3VwKSA9PT0gdGhpcy5lZGl0b3JHcm91cHNTZXJ2aWNlLmFjdGl2ZU1vZGFsRWRpdG9yUGFydCA/IE1PREFMX0dST1VQIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdHJlc291cmNlOiB0aGlzLm1vZGVsc0NvbmZpZ3VyYXRpb25GaWxlLFxuXHRcdFx0b3B0aW9uczogeyBvdmVycmlkZTogREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQgfVxuXHRcdH0sIHByZWZlcnJlZEdyb3VwKTtcblx0XHRpZiAoIWVkaXRvciB8fCAhb3B0aW9ucz8uZ3JvdXApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb2RlRWRpdG9yID0gZ2V0Q29kZUVkaXRvcihlZGl0b3IuZ2V0Q29udHJvbCgpKTtcblx0XHRpZiAoIWNvZGVFZGl0b3IpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAob3B0aW9ucy5zbmlwcGV0KSB7XG5cdFx0XHQvLyBJbnNlcnQgc25pcHBldCBhdCB0aGUgZW5kIG9mIHRoZSBsYXN0IHByb3BlcnR5IGxpbmUgKGJlZm9yZSB0aGUgY2xvc2luZyBicmFjZSBsaW5lKSwgd2l0aCBjb21tYSBwcmVwZW5kZWRcblx0XHRcdGNvbnN0IG1vZGVsID0gY29kZUVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0YXJnZXRSYW5nZSA9IG9wdGlvbnMuc25pcHBldFRhcmdldCA9PT0gJ21vZGVscycgPyBvcHRpb25zLmdyb3VwLm1vZGVsc1JhbmdlIDogb3B0aW9ucy5ncm91cC5yYW5nZTtcblx0XHRcdGlmICghdGFyZ2V0UmFuZ2UpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbW9kZWxzID0gb3B0aW9ucy5ncm91cC5tb2RlbHM7XG5cdFx0XHRjb25zdCBpc01vZGVsc0FycmF5ID0gb3B0aW9ucy5zbmlwcGV0VGFyZ2V0ID09PSAnbW9kZWxzJyAmJiBBcnJheS5pc0FycmF5KG1vZGVscyk7XG5cdFx0XHRjb25zdCBlbXB0eU1vZGVsc0FycmF5ID0gaXNNb2RlbHNBcnJheSAmJiBtb2RlbHMubGVuZ3RoID09PSAwO1xuXHRcdFx0Y29uc3QgaW5zZXJ0QmVmb3JlTW9kZWxzQXJyYXlFbmQgPSBlbXB0eU1vZGVsc0FycmF5IHx8IChpc01vZGVsc0FycmF5ICYmIHRhcmdldFJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gdGFyZ2V0UmFuZ2UuZW5kTGluZU51bWJlcik7XG5cdFx0XHRjb25zdCBsYXN0UHJvcGVydHlMaW5lID0gdGFyZ2V0UmFuZ2UuZW5kTGluZU51bWJlciAtIDE7XG5cdFx0XHRjb25zdCBpbnNlcnRQb3NpdGlvbiA9IGluc2VydEJlZm9yZU1vZGVsc0FycmF5RW5kID8ge1xuXHRcdFx0XHRsaW5lTnVtYmVyOiB0YXJnZXRSYW5nZS5lbmRMaW5lTnVtYmVyLFxuXHRcdFx0XHRjb2x1bW46IHRhcmdldFJhbmdlLmVuZENvbHVtbiAtIDFcblx0XHRcdH0gOiB7XG5cdFx0XHRcdGxpbmVOdW1iZXI6IGxhc3RQcm9wZXJ0eUxpbmUsXG5cdFx0XHRcdGNvbHVtbjogbW9kZWwuZ2V0TGluZUxlbmd0aChsYXN0UHJvcGVydHlMaW5lKSArIDFcblx0XHRcdH07XG5cdFx0XHRjb2RlRWRpdG9yLnNldFBvc2l0aW9uKGluc2VydFBvc2l0aW9uKTtcblx0XHRcdGNvZGVFZGl0b3IucmV2ZWFsUG9zaXRpb25OZWFyVG9wKGluc2VydFBvc2l0aW9uKTtcblx0XHRcdGNvZGVFZGl0b3IuZm9jdXMoKTtcblx0XHRcdFNuaXBwZXRDb250cm9sbGVyMi5nZXQoY29kZUVkaXRvcik/Lmluc2VydChlbXB0eU1vZGVsc0FycmF5ID8gb3B0aW9ucy5zbmlwcGV0IDogJyxcXG4nICsgb3B0aW9ucy5zbmlwcGV0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKCFvcHRpb25zLmdyb3VwLnJhbmdlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHBvc2l0aW9uID0geyBsaW5lTnVtYmVyOiBvcHRpb25zLmdyb3VwLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgY29sdW1uOiBvcHRpb25zLmdyb3VwLnJhbmdlLnN0YXJ0Q29sdW1uIH07XG5cdFx0XHRjb2RlRWRpdG9yLnNldFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRcdGNvZGVFZGl0b3IucmV2ZWFsUG9zaXRpb25OZWFyVG9wKHBvc2l0aW9uKTtcblx0XHRcdGNvZGVFZGl0b3IuZm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdpdGhMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKHVwZGF0ZT86IChsYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzOiBMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKSA9PiBQcm9taXNlPExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHM+KTogUHJvbWlzZTxMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzPiB7XG5cdFx0Y29uc3QgZXhpc3RzID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5leGlzdHModGhpcy5tb2RlbHNDb25maWd1cmF0aW9uRmlsZSk7XG5cdFx0aWYgKCFleGlzdHMpIHtcblx0XHRcdGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHRoaXMubW9kZWxzQ29uZmlndXJhdGlvbkZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoW10sIHVuZGVmaW5lZCwgJ1xcdCcpKSk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMudGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZSh0aGlzLm1vZGVsc0NvbmZpZ3VyYXRpb25GaWxlKTtcblx0XHRjb25zdCBtb2RlbCA9IHJlZi5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBsYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzID0gcGFyc2VMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKG1vZGVsKTtcblx0XHRcdGlmICghdXBkYXRlKSB7XG5cdFx0XHRcdHJldHVybiBsYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdXBkYXRlZExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMgPSBhd2FpdCB1cGRhdGUobGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3Vwcyk7XG5cdFx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHVwZGF0ZWRMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzKSB7XG5cdFx0XHRcdGRlbGV0ZSBncm91cC5yYW5nZTtcblx0XHRcdFx0ZGVsZXRlIGdyb3VwLm1vZGVsc1JhbmdlO1xuXHRcdFx0fVxuXHRcdFx0bW9kZWwuc2V0VmFsdWUoSlNPTi5zdHJpbmdpZnkodXBkYXRlZExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMsIHVuZGVmaW5lZCwgJ1xcdCcpKTtcblx0XHRcdGF3YWl0IHRoaXMudGV4dEZpbGVTZXJ2aWNlLnNhdmUodGhpcy5tb2RlbHNDb25maWd1cmF0aW9uRmlsZSk7XG5cdFx0XHRyZXR1cm4gdXBkYXRlZExhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHM7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUxhbmd1YWdlTW9kZWxzUHJvdmlkZXJHcm91cHMobW9kZWw6IElUZXh0TW9kZWwpOiBMYW5ndWFnZU1vZGVsc1Byb3ZpZGVyR3JvdXBzIHtcblx0Y29uc3QgY29uZmlndXJhdGlvbjogTGFuZ3VhZ2VNb2RlbHNQcm92aWRlckdyb3VwcyA9IFtdO1xuXHRsZXQgY3VycmVudFByb3BlcnR5OiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0bGV0IGN1cnJlbnRQYXJlbnQ6IHVua25vd24gPSBjb25maWd1cmF0aW9uO1xuXHRjb25zdCBwcmV2aW91c1BhcmVudHM6IHVua25vd25bXSA9IFtdO1xuXG5cdGZ1bmN0aW9uIG9uVmFsdWUodmFsdWU6IHVua25vd24sIG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikge1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGN1cnJlbnRQYXJlbnQpKSB7XG5cdFx0XHQoY3VycmVudFBhcmVudCBhcyB1bmtub3duW10pLnB1c2godmFsdWUpO1xuXHRcdH0gZWxzZSBpZiAoY3VycmVudFByb3BlcnR5ICE9PSBudWxsKSB7XG5cdFx0XHQoY3VycmVudFBhcmVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbY3VycmVudFByb3BlcnR5XSA9IHZhbHVlO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHZpc2l0b3I6IEpTT05WaXNpdG9yID0ge1xuXHRcdG9uT2JqZWN0QmVnaW46IChvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdGNvbnN0IG9iamVjdDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gJiB7IHJhbmdlPzogSVJhbmdlIH0gPSB7fTtcblx0XHRcdGlmIChwcmV2aW91c1BhcmVudHMubGVuZ3RoID09PSAxICYmIEFycmF5LmlzQXJyYXkoY3VycmVudFBhcmVudCkpIHtcblx0XHRcdFx0Y29uc3Qgc3RhcnQgPSBtb2RlbC5nZXRQb3NpdGlvbkF0KG9mZnNldCk7XG5cdFx0XHRcdGNvbnN0IGVuZCA9IG1vZGVsLmdldFBvc2l0aW9uQXQob2Zmc2V0ICsgbGVuZ3RoKTtcblx0XHRcdFx0b2JqZWN0LnJhbmdlID0ge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogc3RhcnQubGluZU51bWJlcixcblx0XHRcdFx0XHRzdGFydENvbHVtbjogc3RhcnQuY29sdW1uLFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IGVuZC5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdGVuZENvbHVtbjogZW5kLmNvbHVtblxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0b25WYWx1ZShvYmplY3QsIG9mZnNldCwgbGVuZ3RoKTtcblx0XHRcdHByZXZpb3VzUGFyZW50cy5wdXNoKGN1cnJlbnRQYXJlbnQpO1xuXHRcdFx0Y3VycmVudFBhcmVudCA9IG9iamVjdDtcblx0XHRcdGN1cnJlbnRQcm9wZXJ0eSA9IG51bGw7XG5cdFx0fSxcblx0XHRvbk9iamVjdFByb3BlcnR5OiAobmFtZTogc3RyaW5nLCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdGN1cnJlbnRQcm9wZXJ0eSA9IG5hbWU7XG5cdFx0fSxcblx0XHRvbk9iamVjdEVuZDogKG9mZnNldDogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4ge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gY3VycmVudFBhcmVudCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiAmIHsgcmFuZ2U/OiBJUmFuZ2U7IF9wYXJlbnRDb25maWd1cmF0aW9uUmFuZ2U/OiBNdXRhYmxlPElSYW5nZT4gfTtcblx0XHRcdGlmIChwYXJlbnQucmFuZ2UpIHtcblx0XHRcdFx0Y29uc3QgZW5kID0gbW9kZWwuZ2V0UG9zaXRpb25BdChvZmZzZXQgKyBsZW5ndGgpO1xuXHRcdFx0XHRwYXJlbnQucmFuZ2UgPSB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBwYXJlbnQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiBwYXJlbnQucmFuZ2Uuc3RhcnRDb2x1bW4sXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogZW5kLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiBlbmQuY29sdW1uXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRpZiAocGFyZW50Ll9wYXJlbnRDb25maWd1cmF0aW9uUmFuZ2UpIHtcblx0XHRcdFx0Y29uc3QgZW5kID0gbW9kZWwuZ2V0UG9zaXRpb25BdChvZmZzZXQgKyBsZW5ndGgpO1xuXHRcdFx0XHRwYXJlbnQuX3BhcmVudENvbmZpZ3VyYXRpb25SYW5nZS5lbmRMaW5lTnVtYmVyID0gZW5kLmxpbmVOdW1iZXI7XG5cdFx0XHRcdHBhcmVudC5fcGFyZW50Q29uZmlndXJhdGlvblJhbmdlLmVuZENvbHVtbiA9IGVuZC5jb2x1bW47XG5cdFx0XHRcdGRlbGV0ZSBwYXJlbnQuX3BhcmVudENvbmZpZ3VyYXRpb25SYW5nZTtcblx0XHRcdH1cblx0XHRcdGN1cnJlbnRQYXJlbnQgPSBwcmV2aW91c1BhcmVudHMucG9wKCk7XG5cdFx0fSxcblx0XHRvbkFycmF5QmVnaW46IChvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdGlmIChjdXJyZW50UGFyZW50ID09PSBjb25maWd1cmF0aW9uICYmIHByZXZpb3VzUGFyZW50cy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cHJldmlvdXNQYXJlbnRzLnB1c2goY3VycmVudFBhcmVudCk7XG5cdFx0XHRcdGN1cnJlbnRQcm9wZXJ0eSA9IG51bGw7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFycmF5OiB1bmtub3duW10gJiB7IF9wYXJlbnRNb2RlbHNSYW5nZT86IE11dGFibGU8SVJhbmdlPiB9ID0gW107XG5cdFx0XHRjb25zdCBwYXJlbnQgPSBjdXJyZW50UGFyZW50IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+ICYgeyByYW5nZT86IElSYW5nZTsgbW9kZWxzUmFuZ2U/OiBNdXRhYmxlPElSYW5nZT4gfTtcblx0XHRcdGlmIChjdXJyZW50UHJvcGVydHkgPT09ICdtb2RlbHMnICYmIHBhcmVudC5yYW5nZSkge1xuXHRcdFx0XHRjb25zdCBzdGFydCA9IG1vZGVsLmdldFBvc2l0aW9uQXQob2Zmc2V0KTtcblx0XHRcdFx0Y29uc3QgZW5kID0gbW9kZWwuZ2V0UG9zaXRpb25BdChvZmZzZXQgKyBsZW5ndGgpO1xuXHRcdFx0XHRwYXJlbnQubW9kZWxzUmFuZ2UgPSB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBzdGFydC5saW5lTnVtYmVyLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiBzdGFydC5jb2x1bW4sXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogZW5kLmxpbmVOdW1iZXIsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiBlbmQuY29sdW1uXG5cdFx0XHRcdH07XG5cdFx0XHRcdGFycmF5Ll9wYXJlbnRNb2RlbHNSYW5nZSA9IHBhcmVudC5tb2RlbHNSYW5nZTtcblx0XHRcdH1cblx0XHRcdG9uVmFsdWUoYXJyYXksIG9mZnNldCwgbGVuZ3RoKTtcblx0XHRcdHByZXZpb3VzUGFyZW50cy5wdXNoKGN1cnJlbnRQYXJlbnQpO1xuXHRcdFx0Y3VycmVudFBhcmVudCA9IGFycmF5O1xuXHRcdFx0Y3VycmVudFByb3BlcnR5ID0gbnVsbDtcblx0XHR9LFxuXHRcdG9uQXJyYXlFbmQ6IChvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdGNvbnN0IHBhcmVudCA9IGN1cnJlbnRQYXJlbnQgYXMgeyBfcGFyZW50Q29uZmlndXJhdGlvblJhbmdlPzogTXV0YWJsZTxJUmFuZ2U+OyBfcGFyZW50TW9kZWxzUmFuZ2U/OiBNdXRhYmxlPElSYW5nZT4gfTtcblx0XHRcdGlmIChwYXJlbnQuX3BhcmVudENvbmZpZ3VyYXRpb25SYW5nZSkge1xuXHRcdFx0XHRjb25zdCBlbmQgPSBtb2RlbC5nZXRQb3NpdGlvbkF0KG9mZnNldCArIGxlbmd0aCk7XG5cdFx0XHRcdHBhcmVudC5fcGFyZW50Q29uZmlndXJhdGlvblJhbmdlLmVuZExpbmVOdW1iZXIgPSBlbmQubGluZU51bWJlcjtcblx0XHRcdFx0cGFyZW50Ll9wYXJlbnRDb25maWd1cmF0aW9uUmFuZ2UuZW5kQ29sdW1uID0gZW5kLmNvbHVtbjtcblx0XHRcdFx0ZGVsZXRlIHBhcmVudC5fcGFyZW50Q29uZmlndXJhdGlvblJhbmdlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHBhcmVudC5fcGFyZW50TW9kZWxzUmFuZ2UpIHtcblx0XHRcdFx0Y29uc3QgZW5kID0gbW9kZWwuZ2V0UG9zaXRpb25BdChvZmZzZXQgKyBsZW5ndGgpO1xuXHRcdFx0XHRwYXJlbnQuX3BhcmVudE1vZGVsc1JhbmdlLmVuZExpbmVOdW1iZXIgPSBlbmQubGluZU51bWJlcjtcblx0XHRcdFx0cGFyZW50Ll9wYXJlbnRNb2RlbHNSYW5nZS5lbmRDb2x1bW4gPSBlbmQuY29sdW1uO1xuXHRcdFx0XHRkZWxldGUgcGFyZW50Ll9wYXJlbnRNb2RlbHNSYW5nZTtcblx0XHRcdH1cblx0XHRcdGN1cnJlbnRQYXJlbnQgPSBwcmV2aW91c1BhcmVudHMucG9wKCk7XG5cdFx0fSxcblx0XHRvbkxpdGVyYWxWYWx1ZTogKHZhbHVlOiB1bmtub3duLCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpID0+IHtcblx0XHRcdG9uVmFsdWUodmFsdWUsIG9mZnNldCwgbGVuZ3RoKTtcblx0XHR9LFxuXHR9O1xuXHR2aXNpdChtb2RlbC5nZXRWYWx1ZSgpLCB2aXNpdG9yKTtcblx0cmV0dXJuIGNvbmZpZ3VyYXRpb247XG59XG5cbmNvbnN0IGxhbmd1YWdlTW9kZWxzU2NoZW1hSWQgPSAndnNjb2RlOi8vc2NoZW1hcy9sYW5ndWFnZS1tb2RlbHMnO1xuXG5leHBvcnQgY2xhc3MgQ2hhdExhbmd1YWdlTW9kZWxzRGF0YUNvbnRyaWJ1dGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIuY2hhdExhbmd1YWdlTW9kZWxzRGF0YSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZU1vZGVsc1NlcnZpY2U6IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0QElMYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIGxhbmd1YWdlTW9kZWxzQ29uZmlndXJhdGlvblNlcnZpY2U6IElMYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUpTT05Db250cmlidXRpb25SZWdpc3RyeT4oSlNPTkV4dGVuc2lvbnMuSlNPTkNvbnRyaWJ1dGlvbik7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVnaXN0cnkucmVnaXN0ZXJTY2hlbWFBc3NvY2lhdGlvbihsYW5ndWFnZU1vZGVsc1NjaGVtYUlkLCBsYW5ndWFnZU1vZGVsc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmNvbmZpZ3VyYXRpb25GaWxlLnRvU3RyaW5nKCkpKTtcblxuXHRcdHRoaXMudXBkYXRlU2NoZW1hKHJlZ2lzdHJ5KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5vbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzKCgpID0+IHRoaXMudXBkYXRlU2NoZW1hKHJlZ2lzdHJ5KSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTY2hlbWEocmVnaXN0cnk6IElKU09OQ29udHJpYnV0aW9uUmVnaXN0cnkpOiB2b2lkIHtcblx0XHRjb25zdCB2ZW5kb3JzID0gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0VmVuZG9ycygpO1xuXG5cdFx0Ly8gQnVpbGQgcGVyLW1vZGVsIGNvbmZpZ3VyYXRpb24gc2NoZW1hc1xuXHRcdGNvbnN0IG1vZGVsU2NoZW1hczogSUpTT05TY2hlbWFbXSA9IFtdO1xuXHRcdGNvbnN0IG1vZGVsSWRzID0gdGhpcy5sYW5ndWFnZU1vZGVsc1NlcnZpY2UuZ2V0TGFuZ3VhZ2VNb2RlbElkcygpO1xuXHRcdGZvciAoY29uc3QgbW9kZWxJZCBvZiBtb2RlbElkcykge1xuXHRcdFx0Y29uc3QgbWV0YWRhdGEgPSB0aGlzLmxhbmd1YWdlTW9kZWxzU2VydmljZS5sb29rdXBMYW5ndWFnZU1vZGVsKG1vZGVsSWQpO1xuXHRcdFx0aWYgKG1ldGFkYXRhPy5jb25maWd1cmF0aW9uU2NoZW1hKSB7XG5cdFx0XHRcdG1vZGVsU2NoZW1hcy5wdXNoKHtcblx0XHRcdFx0XHRpZjoge1xuXHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHR2ZW5kb3I6IHsgY29uc3Q6IG1ldGFkYXRhLnZlbmRvciB9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR0aGVuOiB7XG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdHNldHRpbmdzOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0W21ldGFkYXRhLmlkXTogbWV0YWRhdGEuY29uZmlndXJhdGlvblNjaGVtYVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2NoZW1hOiBJSlNPTlNjaGVtYSA9IHtcblx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRpdGVtczoge1xuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0dmVuZG9yOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGVudW06IHZlbmRvcnMubWFwKHYgPT4gdi52ZW5kb3IpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRuYW1lOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdFx0c2V0dGluZ3M6IHtcblx0XHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzZXR0aW5ncy5wZXJNb2RlbENvbmZpZycsIFwiUGVyLW1vZGVsIHNldHRpbmdzXCIpLFxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0YWxsT2Y6IFtcblx0XHRcdFx0XHQuLi52ZW5kb3JzLm1hcCh2ZW5kb3IgPT4gKHtcblx0XHRcdFx0XHRcdGlmOiB7XG5cdFx0XHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdFx0XHR2ZW5kb3I6IHsgY29uc3Q6IHZlbmRvci52ZW5kb3IgfVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0dGhlbjogdmVuZG9yLmNvbmZpZ3VyYXRpb25cblx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdFx0Li4ubW9kZWxTY2hlbWFzXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHJlcXVpcmVkOiBbJ3ZlbmRvcicsICduYW1lJ11cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0cmVnaXN0cnkucmVnaXN0ZXJTY2hlbWEobGFuZ3VhZ2VNb2RlbHNTY2hlbWFJZCwgc2NoZW1hKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsa0JBQWtCO0FBRzNCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWdCLG1CQUFtQjtBQUM1QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGNBQWM7QUFFdkIsU0FBc0IsYUFBYTtBQUVuQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDBCQUEwQjtBQUNuQyxTQUF5QywyQ0FBeUU7QUFDbEgsU0FBb0MsY0FBYyxzQkFBc0I7QUFDeEUsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUyw4QkFBOEI7QUFFdkMsU0FBUyxrQ0FBa0M7QUFJcEMsSUFBTSxxQ0FBTixjQUFpRCxXQUEwRDtBQUFBLEVBZ0JqSCxZQUNnQyxhQUNJLGlCQUNDLGtCQUNILGVBQ00scUJBQ2Qsd0JBQ0osb0JBQ3BCO0FBQ0QsVUFBTTtBQVJ5QjtBQUNJO0FBQ0M7QUFDSDtBQUNNO0FBZHhDLFNBQWlCLGtDQUFrQyxLQUFLLFVBQVUsSUFBSSxRQUFpRCxDQUFDO0FBQ3hILFNBQVMsaUNBQWlGLEtBQUssZ0NBQWdDO0FBRS9ILFNBQVEsK0JBQTZELENBQUM7QUFnQnJFLFNBQUssMEJBQTBCLHVCQUF1QixlQUFlO0FBQ3JFLFNBQUssYUFBYSxLQUFLLGtDQUFrQyxFQUFFLE1BQU0sTUFBTTtBQUFBLElBQWdFLENBQUM7QUFHeEksU0FBSyxVQUFVLFlBQVksTUFBTSxtQkFBbUIsT0FBTyxRQUFRLEtBQUssdUJBQXVCLENBQUMsQ0FBQztBQUNqRyxTQUFLLFVBQVUsWUFBWSxpQkFBaUIsT0FBSztBQUNoRCxVQUFJLEVBQUUsU0FBUyxLQUFLLHVCQUF1QixHQUFHO0FBQzdDLGFBQUssa0NBQWtDO0FBQUEsTUFDeEM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQS9CQSxJQUFJLG9CQUF5QjtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQXlCO0FBQUEsRUFTcEUsSUFBSSxZQUEyQjtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQVk7QUFBQSxFQXdCakQsK0JBQStCLDZCQUFpRTtBQUN2RyxVQUFNLGdCQUFnRCxDQUFDO0FBQ3ZELFVBQU0sY0FBYyxJQUFJLElBQUksS0FBSyw2QkFBNkIsSUFBSSxPQUFLLENBQUMsR0FBRyxFQUFFLE1BQU0sSUFBSSxFQUFFLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQztBQUNwRyxVQUFNLGNBQWMsSUFBSSxJQUFJLDRCQUE0QixJQUFJLE9BQUssQ0FBQyxHQUFHLEVBQUUsTUFBTSxJQUFJLEVBQUUsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBRzlGLGVBQVcsQ0FBQyxLQUFLLFFBQVEsS0FBSyxhQUFhO0FBQzFDLFlBQU0sV0FBVyxZQUFZLElBQUksR0FBRztBQUNwQyxVQUFJLENBQUMsWUFBWSxDQUFDLE9BQU8sVUFBVSxRQUFRLEdBQUc7QUFDN0Msc0JBQWMsS0FBSyxRQUFRO0FBQUEsTUFDNUI7QUFBQSxJQUNEO0FBR0EsZUFBVyxDQUFDLEtBQUssUUFBUSxLQUFLLGFBQWE7QUFDMUMsVUFBSSxDQUFDLFlBQVksSUFBSSxHQUFHLEdBQUc7QUFDMUIsc0JBQWMsS0FBSyxRQUFRO0FBQUEsTUFDNUI7QUFBQSxJQUNEO0FBRUEsU0FBSywrQkFBK0I7QUFDcEMsUUFBSSxjQUFjLFNBQVMsR0FBRztBQUM3QixXQUFLLGdDQUFnQyxLQUFLLGFBQWE7QUFBQSxJQUN4RDtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsb0NBQW1EO0FBQ2hFLFVBQU0sK0JBQStCLE1BQU0sS0FBSyxpQ0FBaUM7QUFDakYsU0FBSywrQkFBK0IsNEJBQTRCO0FBQUEsRUFDakU7QUFBQSxFQUVBLGtDQUEyRTtBQUMxRSxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxNQUFNLCtCQUErQixPQUE0RTtBQUNoSCxVQUFNLEtBQUssaUNBQWlDLE9BQU0saUNBQWdDO0FBQ2pGLFVBQUksNkJBQTZCLEtBQUssQ0FBQyxFQUFFLE1BQU0sT0FBTyxNQUFNLFNBQVMsTUFBTSxRQUFRLFdBQVcsTUFBTSxNQUFNLEdBQUc7QUFDNUcsY0FBTSxJQUFJLE1BQU0sa0NBQWtDLE1BQU0sSUFBSSw4QkFBOEIsTUFBTSxNQUFNLEVBQUU7QUFBQSxNQUN6RztBQUNBLG1DQUE2QixLQUFLLEtBQUs7QUFDdkMsYUFBTztBQUFBLElBQ1IsQ0FBQztBQUVELFVBQU0sS0FBSyxrQ0FBa0M7QUFDN0MsVUFBTSxTQUFTLEtBQUssZ0NBQWdDLEVBQUUsS0FBSyxXQUFTLE1BQU0sU0FBUyxNQUFNLFFBQVEsTUFBTSxXQUFXLE1BQU0sTUFBTTtBQUM5SCxRQUFJLENBQUMsUUFBUTtBQUNaLFlBQU0sSUFBSSxNQUFNLGtDQUFrQyxNQUFNLElBQUkseUJBQXlCLE1BQU0sTUFBTSxFQUFFO0FBQUEsSUFDcEc7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxrQ0FBa0MsTUFBb0MsSUFBeUU7QUFDcEosVUFBTSxLQUFLLGlDQUFpQyxPQUFNLGlDQUFnQztBQUNqRixZQUFNQSxVQUF1QyxDQUFDO0FBQzlDLGlCQUFXLFNBQVMsOEJBQThCO0FBQ2pELFlBQUksTUFBTSxTQUFTLEtBQUssUUFBUSxNQUFNLFdBQVcsS0FBSyxRQUFRO0FBQzdELFVBQUFBLFFBQU8sS0FBSyxFQUFFO0FBQUEsUUFDZixPQUFPO0FBQ04sVUFBQUEsUUFBTyxLQUFLLEtBQUs7QUFBQSxRQUNsQjtBQUFBLE1BQ0Q7QUFDQSxhQUFPQTtBQUFBLElBQ1IsQ0FBQztBQUVELFVBQU0sS0FBSyxrQ0FBa0M7QUFDN0MsVUFBTSxTQUFTLEtBQUssZ0NBQWdDLEVBQUUsS0FBSyxXQUFTLE1BQU0sU0FBUyxHQUFHLFFBQVEsTUFBTSxXQUFXLEdBQUcsTUFBTTtBQUN4SCxRQUFJLENBQUMsUUFBUTtBQUNaLFlBQU0sSUFBSSxNQUFNLGtDQUFrQyxHQUFHLElBQUkseUJBQXlCLEdBQUcsTUFBTSxFQUFFO0FBQUEsSUFDOUY7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBTSxrQ0FBa0MsVUFBdUQ7QUFDOUYsVUFBTSxLQUFLLGlDQUFpQyxPQUFNLGlDQUFnQztBQUNqRixZQUFNLFNBQXVDLENBQUM7QUFDOUMsaUJBQVcsU0FBUyw4QkFBOEI7QUFDakQsWUFBSSxNQUFNLFNBQVMsU0FBUyxRQUFRLE1BQU0sV0FBVyxTQUFTLFFBQVE7QUFDckU7QUFBQSxRQUNEO0FBQ0EsZUFBTyxLQUFLLEtBQUs7QUFBQSxNQUNsQjtBQUNBLGFBQU87QUFBQSxJQUNSLENBQUM7QUFDRCxVQUFNLEtBQUssa0NBQWtDO0FBQUEsRUFDOUM7QUFBQSxFQUVBLE1BQU0sd0JBQXdCLFNBQXlEO0FBSXRGLFVBQU0saUJBQWlCLEtBQUssb0JBQW9CLFFBQVEsS0FBSyxvQkFBb0IsV0FBVyxNQUFNLEtBQUssb0JBQW9CLHdCQUF3QixjQUFjO0FBQ2pLLFVBQU0sU0FBUyxNQUFNLEtBQUssY0FBYyxXQUFXO0FBQUEsTUFDbEQsVUFBVSxLQUFLO0FBQUEsTUFDZixTQUFTLEVBQUUsVUFBVSwyQkFBMkIsR0FBRztBQUFBLElBQ3BELEdBQUcsY0FBYztBQUNqQixRQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsT0FBTztBQUMvQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGFBQWEsY0FBYyxPQUFPLFdBQVcsQ0FBQztBQUNwRCxRQUFJLENBQUMsWUFBWTtBQUNoQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLFFBQVEsU0FBUztBQUVwQixZQUFNLFFBQVEsV0FBVyxTQUFTO0FBQ2xDLFVBQUksQ0FBQyxPQUFPO0FBQ1g7QUFBQSxNQUNEO0FBQ0EsWUFBTSxjQUFjLFFBQVEsa0JBQWtCLFdBQVcsUUFBUSxNQUFNLGNBQWMsUUFBUSxNQUFNO0FBQ25HLFVBQUksQ0FBQyxhQUFhO0FBQ2pCO0FBQUEsTUFDRDtBQUNBLFlBQU0sU0FBUyxRQUFRLE1BQU07QUFDN0IsWUFBTSxnQkFBZ0IsUUFBUSxrQkFBa0IsWUFBWSxNQUFNLFFBQVEsTUFBTTtBQUNoRixZQUFNLG1CQUFtQixpQkFBaUIsT0FBTyxXQUFXO0FBQzVELFlBQU0sNkJBQTZCLG9CQUFxQixpQkFBaUIsWUFBWSxvQkFBb0IsWUFBWTtBQUNySCxZQUFNLG1CQUFtQixZQUFZLGdCQUFnQjtBQUNyRCxZQUFNLGlCQUFpQiw2QkFBNkI7QUFBQSxRQUNuRCxZQUFZLFlBQVk7QUFBQSxRQUN4QixRQUFRLFlBQVksWUFBWTtBQUFBLE1BQ2pDLElBQUk7QUFBQSxRQUNILFlBQVk7QUFBQSxRQUNaLFFBQVEsTUFBTSxjQUFjLGdCQUFnQixJQUFJO0FBQUEsTUFDakQ7QUFDQSxpQkFBVyxZQUFZLGNBQWM7QUFDckMsaUJBQVcsc0JBQXNCLGNBQWM7QUFDL0MsaUJBQVcsTUFBTTtBQUNqQix5QkFBbUIsSUFBSSxVQUFVLEdBQUcsT0FBTyxtQkFBbUIsUUFBUSxVQUFVLFFBQVEsUUFBUSxPQUFPO0FBQUEsSUFDeEcsT0FBTztBQUNOLFVBQUksQ0FBQyxRQUFRLE1BQU0sT0FBTztBQUN6QjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFdBQVcsRUFBRSxZQUFZLFFBQVEsTUFBTSxNQUFNLGlCQUFpQixRQUFRLFFBQVEsTUFBTSxNQUFNLFlBQVk7QUFDNUcsaUJBQVcsWUFBWSxRQUFRO0FBQy9CLGlCQUFXLHNCQUFzQixRQUFRO0FBQ3pDLGlCQUFXLE1BQU07QUFBQSxJQUNsQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsaUNBQWlDLFFBQXVKO0FBQ3JNLFVBQU0sU0FBUyxNQUFNLEtBQUssWUFBWSxPQUFPLEtBQUssdUJBQXVCO0FBQ3pFLFFBQUksQ0FBQyxRQUFRO0FBQ1osWUFBTSxLQUFLLFlBQVksVUFBVSxLQUFLLHlCQUF5QixTQUFTLFdBQVcsS0FBSyxVQUFVLENBQUMsR0FBRyxRQUFXLEdBQUksQ0FBQyxDQUFDO0FBQUEsSUFDeEg7QUFDQSxVQUFNLE1BQU0sTUFBTSxLQUFLLGlCQUFpQixxQkFBcUIsS0FBSyx1QkFBdUI7QUFDekYsVUFBTSxRQUFRLElBQUksT0FBTztBQUN6QixRQUFJO0FBQ0gsWUFBTSwrQkFBK0Isa0NBQWtDLEtBQUs7QUFDNUUsVUFBSSxDQUFDLFFBQVE7QUFDWixlQUFPO0FBQUEsTUFDUjtBQUNBLFlBQU0sc0NBQXNDLE1BQU0sT0FBTyw0QkFBNEI7QUFDckYsaUJBQVcsU0FBUyxxQ0FBcUM7QUFDeEQsZUFBTyxNQUFNO0FBQ2IsZUFBTyxNQUFNO0FBQUEsTUFDZDtBQUNBLFlBQU0sU0FBUyxLQUFLLFVBQVUscUNBQXFDLFFBQVcsR0FBSSxDQUFDO0FBQ25GLFlBQU0sS0FBSyxnQkFBZ0IsS0FBSyxLQUFLLHVCQUF1QjtBQUM1RCxhQUFPO0FBQUEsSUFDUixVQUFFO0FBQ0QsVUFBSSxRQUFRO0FBQUEsSUFDYjtBQUFBLEVBQ0Q7QUFDRDtBQTVNYSxxQ0FBTjtBQUFBLEVBaUJKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0F2QlU7QUE4TU4sU0FBUyxrQ0FBa0MsT0FBaUQ7QUFDbEcsUUFBTSxnQkFBOEMsQ0FBQztBQUNyRCxNQUFJLGtCQUFpQztBQUNyQyxNQUFJLGdCQUF5QjtBQUM3QixRQUFNLGtCQUE2QixDQUFDO0FBRXBDLFdBQVMsUUFBUSxPQUFnQixRQUFnQixRQUFnQjtBQUNoRSxRQUFJLE1BQU0sUUFBUSxhQUFhLEdBQUc7QUFDakMsTUFBQyxjQUE0QixLQUFLLEtBQUs7QUFBQSxJQUN4QyxXQUFXLG9CQUFvQixNQUFNO0FBQ3BDLE1BQUMsY0FBMEMsZUFBZSxJQUFJO0FBQUEsSUFDL0Q7QUFBQSxFQUNEO0FBRUEsUUFBTSxVQUF1QjtBQUFBLElBQzVCLGVBQWUsQ0FBQyxRQUFnQixXQUFtQjtBQUNsRCxZQUFNLFNBQXVELENBQUM7QUFDOUQsVUFBSSxnQkFBZ0IsV0FBVyxLQUFLLE1BQU0sUUFBUSxhQUFhLEdBQUc7QUFDakUsY0FBTSxRQUFRLE1BQU0sY0FBYyxNQUFNO0FBQ3hDLGNBQU0sTUFBTSxNQUFNLGNBQWMsU0FBUyxNQUFNO0FBQy9DLGVBQU8sUUFBUTtBQUFBLFVBQ2QsaUJBQWlCLE1BQU07QUFBQSxVQUN2QixhQUFhLE1BQU07QUFBQSxVQUNuQixlQUFlLElBQUk7QUFBQSxVQUNuQixXQUFXLElBQUk7QUFBQSxRQUNoQjtBQUFBLE1BQ0Q7QUFDQSxjQUFRLFFBQVEsUUFBUSxNQUFNO0FBQzlCLHNCQUFnQixLQUFLLGFBQWE7QUFDbEMsc0JBQWdCO0FBQ2hCLHdCQUFrQjtBQUFBLElBQ25CO0FBQUEsSUFDQSxrQkFBa0IsQ0FBQyxNQUFjLFFBQWdCLFdBQW1CO0FBQ25FLHdCQUFrQjtBQUFBLElBQ25CO0FBQUEsSUFDQSxhQUFhLENBQUMsUUFBZ0IsV0FBbUI7QUFDaEQsWUFBTSxTQUFTO0FBQ2YsVUFBSSxPQUFPLE9BQU87QUFDakIsY0FBTSxNQUFNLE1BQU0sY0FBYyxTQUFTLE1BQU07QUFDL0MsZUFBTyxRQUFRO0FBQUEsVUFDZCxpQkFBaUIsT0FBTyxNQUFNO0FBQUEsVUFDOUIsYUFBYSxPQUFPLE1BQU07QUFBQSxVQUMxQixlQUFlLElBQUk7QUFBQSxVQUNuQixXQUFXLElBQUk7QUFBQSxRQUNoQjtBQUFBLE1BQ0Q7QUFDQSxVQUFJLE9BQU8sMkJBQTJCO0FBQ3JDLGNBQU0sTUFBTSxNQUFNLGNBQWMsU0FBUyxNQUFNO0FBQy9DLGVBQU8sMEJBQTBCLGdCQUFnQixJQUFJO0FBQ3JELGVBQU8sMEJBQTBCLFlBQVksSUFBSTtBQUNqRCxlQUFPLE9BQU87QUFBQSxNQUNmO0FBQ0Esc0JBQWdCLGdCQUFnQixJQUFJO0FBQUEsSUFDckM7QUFBQSxJQUNBLGNBQWMsQ0FBQyxRQUFnQixXQUFtQjtBQUNqRCxVQUFJLGtCQUFrQixpQkFBaUIsZ0JBQWdCLFdBQVcsR0FBRztBQUNwRSx3QkFBZ0IsS0FBSyxhQUFhO0FBQ2xDLDBCQUFrQjtBQUNsQjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLFFBQThELENBQUM7QUFDckUsWUFBTSxTQUFTO0FBQ2YsVUFBSSxvQkFBb0IsWUFBWSxPQUFPLE9BQU87QUFDakQsY0FBTSxRQUFRLE1BQU0sY0FBYyxNQUFNO0FBQ3hDLGNBQU0sTUFBTSxNQUFNLGNBQWMsU0FBUyxNQUFNO0FBQy9DLGVBQU8sY0FBYztBQUFBLFVBQ3BCLGlCQUFpQixNQUFNO0FBQUEsVUFDdkIsYUFBYSxNQUFNO0FBQUEsVUFDbkIsZUFBZSxJQUFJO0FBQUEsVUFDbkIsV0FBVyxJQUFJO0FBQUEsUUFDaEI7QUFDQSxjQUFNLHFCQUFxQixPQUFPO0FBQUEsTUFDbkM7QUFDQSxjQUFRLE9BQU8sUUFBUSxNQUFNO0FBQzdCLHNCQUFnQixLQUFLLGFBQWE7QUFDbEMsc0JBQWdCO0FBQ2hCLHdCQUFrQjtBQUFBLElBQ25CO0FBQUEsSUFDQSxZQUFZLENBQUMsUUFBZ0IsV0FBbUI7QUFDL0MsWUFBTSxTQUFTO0FBQ2YsVUFBSSxPQUFPLDJCQUEyQjtBQUNyQyxjQUFNLE1BQU0sTUFBTSxjQUFjLFNBQVMsTUFBTTtBQUMvQyxlQUFPLDBCQUEwQixnQkFBZ0IsSUFBSTtBQUNyRCxlQUFPLDBCQUEwQixZQUFZLElBQUk7QUFDakQsZUFBTyxPQUFPO0FBQUEsTUFDZjtBQUNBLFVBQUksT0FBTyxvQkFBb0I7QUFDOUIsY0FBTSxNQUFNLE1BQU0sY0FBYyxTQUFTLE1BQU07QUFDL0MsZUFBTyxtQkFBbUIsZ0JBQWdCLElBQUk7QUFDOUMsZUFBTyxtQkFBbUIsWUFBWSxJQUFJO0FBQzFDLGVBQU8sT0FBTztBQUFBLE1BQ2Y7QUFDQSxzQkFBZ0IsZ0JBQWdCLElBQUk7QUFBQSxJQUNyQztBQUFBLElBQ0EsZ0JBQWdCLENBQUMsT0FBZ0IsUUFBZ0IsV0FBbUI7QUFDbkUsY0FBUSxPQUFPLFFBQVEsTUFBTTtBQUFBLElBQzlCO0FBQUEsRUFDRDtBQUNBLFFBQU0sTUFBTSxTQUFTLEdBQUcsT0FBTztBQUMvQixTQUFPO0FBQ1I7QUFFQSxNQUFNLHlCQUF5QjtBQUV4QixJQUFNLHFDQUFOLGNBQWlELFdBQTZDO0FBQUEsRUFJcEcsWUFDMEMsdUJBQ0osb0NBQ3BDO0FBQ0QsVUFBTTtBQUhtQztBQUl6QyxVQUFNLFdBQVcsU0FBUyxHQUE4QixlQUFlLGdCQUFnQjtBQUN2RixTQUFLLFVBQVUsU0FBUywwQkFBMEIsd0JBQXdCLG1DQUFtQyxrQkFBa0IsU0FBUyxDQUFDLENBQUM7QUFFMUksU0FBSyxhQUFhLFFBQVE7QUFDMUIsU0FBSyxVQUFVLEtBQUssc0JBQXNCLDBCQUEwQixNQUFNLEtBQUssYUFBYSxRQUFRLENBQUMsQ0FBQztBQUFBLEVBQ3ZHO0FBQUEsRUFFUSxhQUFhLFVBQTJDO0FBQy9ELFVBQU0sVUFBVSxLQUFLLHNCQUFzQixXQUFXO0FBR3RELFVBQU0sZUFBOEIsQ0FBQztBQUNyQyxVQUFNLFdBQVcsS0FBSyxzQkFBc0Isb0JBQW9CO0FBQ2hFLGVBQVcsV0FBVyxVQUFVO0FBQy9CLFlBQU0sV0FBVyxLQUFLLHNCQUFzQixvQkFBb0IsT0FBTztBQUN2RSxVQUFJLFVBQVUscUJBQXFCO0FBQ2xDLHFCQUFhLEtBQUs7QUFBQSxVQUNqQixJQUFJO0FBQUEsWUFDSCxZQUFZO0FBQUEsY0FDWCxRQUFRLEVBQUUsT0FBTyxTQUFTLE9BQU87QUFBQSxZQUNsQztBQUFBLFVBQ0Q7QUFBQSxVQUNBLE1BQU07QUFBQSxZQUNMLFlBQVk7QUFBQSxjQUNYLFVBQVU7QUFBQSxnQkFDVCxNQUFNO0FBQUEsZ0JBQ04sWUFBWTtBQUFBLGtCQUNYLENBQUMsU0FBUyxFQUFFLEdBQUcsU0FBUztBQUFBLGdCQUN6QjtBQUFBLGNBQ0Q7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLFFBQ0QsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxJQUNEO0FBRUEsVUFBTSxTQUFzQjtBQUFBLE1BQzNCLE1BQU07QUFBQSxNQUNOLE9BQU87QUFBQSxRQUNOLFlBQVk7QUFBQSxVQUNYLFFBQVE7QUFBQSxZQUNQLE1BQU07QUFBQSxZQUNOLE1BQU0sUUFBUSxJQUFJLE9BQUssRUFBRSxNQUFNO0FBQUEsVUFDaEM7QUFBQSxVQUNBLE1BQU0sRUFBRSxNQUFNLFNBQVM7QUFBQSxVQUN2QixVQUFVO0FBQUEsWUFDVCxNQUFNO0FBQUEsWUFDTixhQUFhLFNBQVMsMkJBQTJCLG9CQUFvQjtBQUFBLFVBQ3RFO0FBQUEsUUFDRDtBQUFBLFFBQ0EsT0FBTztBQUFBLFVBQ04sR0FBRyxRQUFRLElBQUksYUFBVztBQUFBLFlBQ3pCLElBQUk7QUFBQSxjQUNILFlBQVk7QUFBQSxnQkFDWCxRQUFRLEVBQUUsT0FBTyxPQUFPLE9BQU87QUFBQSxjQUNoQztBQUFBLFlBQ0Q7QUFBQSxZQUNBLE1BQU0sT0FBTztBQUFBLFVBQ2QsRUFBRTtBQUFBLFVBQ0YsR0FBRztBQUFBLFFBQ0o7QUFBQSxRQUNBLFVBQVUsQ0FBQyxVQUFVLE1BQU07QUFBQSxNQUM1QjtBQUFBLElBQ0Q7QUFFQSxhQUFTLGVBQWUsd0JBQXdCLE1BQU07QUFBQSxFQUN2RDtBQUNEO0FBNUVhLG1DQUVJLEtBQUs7QUFGVCxxQ0FBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsR0FOVTsiLAogICJuYW1lcyI6IFsicmVzdWx0Il0KfQo=
