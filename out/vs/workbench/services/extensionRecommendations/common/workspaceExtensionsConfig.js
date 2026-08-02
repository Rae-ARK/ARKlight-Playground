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
import { distinct } from "../../../../base/common/arrays.js";
import { Emitter } from "../../../../base/common/event.js";
import { parse } from "../../../../base/common/json.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { getIconClasses } from "../../../../editor/common/services/getIconClasses.js";
import { FileKind, IFileService } from "../../../../platform/files/common/files.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { isWorkspace, IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { localize } from "../../../../nls.js";
import { IJSONEditingService } from "../../configuration/common/jsonEditing.js";
import { ResourceMap } from "../../../../base/common/map.js";
const EXTENSIONS_CONFIG = ".vscode/extensions.json";
const IWorkspaceExtensionsConfigService = createDecorator("IWorkspaceExtensionsConfigService");
let WorkspaceExtensionsConfigService = class extends Disposable {
  constructor(workspaceContextService, fileService, quickInputService, modelService, languageService, jsonEditingService) {
    super();
    this.workspaceContextService = workspaceContextService;
    this.fileService = fileService;
    this.quickInputService = quickInputService;
    this.modelService = modelService;
    this.languageService = languageService;
    this.jsonEditingService = jsonEditingService;
    this._onDidChangeExtensionsConfigs = this._register(new Emitter());
    this.onDidChangeExtensionsConfigs = this._onDidChangeExtensionsConfigs.event;
    this._register(workspaceContextService.onDidChangeWorkspaceFolders((e) => this._onDidChangeExtensionsConfigs.fire()));
    this._register(fileService.onDidFilesChange((e) => {
      const workspace = workspaceContextService.getWorkspace();
      if (workspace.configuration && e.affects(workspace.configuration) || workspace.folders.some((folder) => e.affects(folder.toResource(EXTENSIONS_CONFIG)))) {
        this._onDidChangeExtensionsConfigs.fire();
      }
    }));
  }
  async getExtensionsConfigs() {
    const workspace = this.workspaceContextService.getWorkspace();
    const result = [];
    const workspaceExtensionsConfigContent = workspace.configuration ? await this.resolveWorkspaceExtensionConfig(workspace.configuration) : void 0;
    if (workspaceExtensionsConfigContent) {
      result.push(workspaceExtensionsConfigContent);
    }
    result.push(...await Promise.all(workspace.folders.map((workspaceFolder) => this.resolveWorkspaceFolderExtensionConfig(workspaceFolder))));
    return result;
  }
  async getRecommendations() {
    const configs = await this.getExtensionsConfigs();
    return distinct(configs.flatMap((c) => c.recommendations ? c.recommendations.map((c2) => c2.toLowerCase()) : []));
  }
  async getUnwantedRecommendations() {
    const configs = await this.getExtensionsConfigs();
    return distinct(configs.flatMap((c) => c.unwantedRecommendations ? c.unwantedRecommendations.map((c2) => c2.toLowerCase()) : []));
  }
  async toggleRecommendation(extensionId) {
    extensionId = extensionId.toLowerCase();
    const workspace = this.workspaceContextService.getWorkspace();
    const workspaceExtensionsConfigContent = workspace.configuration ? await this.resolveWorkspaceExtensionConfig(workspace.configuration) : void 0;
    const workspaceFolderExtensionsConfigContents = new ResourceMap();
    await Promise.all(workspace.folders.map(async (workspaceFolder) => {
      const extensionsConfigContent = await this.resolveWorkspaceFolderExtensionConfig(workspaceFolder);
      workspaceFolderExtensionsConfigContents.set(workspaceFolder.uri, extensionsConfigContent);
    }));
    const isWorkspaceRecommended = workspaceExtensionsConfigContent && workspaceExtensionsConfigContent.recommendations?.some((r) => r.toLowerCase() === extensionId);
    const recommendedWorksapceFolders = workspace.folders.filter((workspaceFolder) => workspaceFolderExtensionsConfigContents.get(workspaceFolder.uri)?.recommendations?.some((r) => r.toLowerCase() === extensionId));
    const isRecommended = isWorkspaceRecommended || recommendedWorksapceFolders.length > 0;
    const workspaceOrFolders = isRecommended ? await this.pickWorkspaceOrFolders(recommendedWorksapceFolders, isWorkspaceRecommended ? workspace : void 0, localize("select for remove", "Remove extension recommendation from")) : await this.pickWorkspaceOrFolders(workspace.folders, workspace.configuration ? workspace : void 0, localize("select for add", "Add extension recommendation to"));
    for (const workspaceOrWorkspaceFolder of workspaceOrFolders) {
      if (isWorkspace(workspaceOrWorkspaceFolder)) {
        await this.addOrRemoveWorkspaceRecommendation(extensionId, workspaceOrWorkspaceFolder, workspaceExtensionsConfigContent, !isRecommended);
      } else {
        await this.addOrRemoveWorkspaceFolderRecommendation(extensionId, workspaceOrWorkspaceFolder, workspaceFolderExtensionsConfigContents.get(workspaceOrWorkspaceFolder.uri), !isRecommended);
      }
    }
  }
  async toggleUnwantedRecommendation(extensionId) {
    const workspace = this.workspaceContextService.getWorkspace();
    const workspaceExtensionsConfigContent = workspace.configuration ? await this.resolveWorkspaceExtensionConfig(workspace.configuration) : void 0;
    const workspaceFolderExtensionsConfigContents = new ResourceMap();
    await Promise.all(workspace.folders.map(async (workspaceFolder) => {
      const extensionsConfigContent = await this.resolveWorkspaceFolderExtensionConfig(workspaceFolder);
      workspaceFolderExtensionsConfigContents.set(workspaceFolder.uri, extensionsConfigContent);
    }));
    const isWorkspaceUnwanted = workspaceExtensionsConfigContent && workspaceExtensionsConfigContent.unwantedRecommendations?.some((r) => r === extensionId);
    const unWantedWorksapceFolders = workspace.folders.filter((workspaceFolder) => workspaceFolderExtensionsConfigContents.get(workspaceFolder.uri)?.unwantedRecommendations?.some((r) => r === extensionId));
    const isUnwanted = isWorkspaceUnwanted || unWantedWorksapceFolders.length > 0;
    const workspaceOrFolders = isUnwanted ? await this.pickWorkspaceOrFolders(unWantedWorksapceFolders, isWorkspaceUnwanted ? workspace : void 0, localize("select for remove", "Remove extension recommendation from")) : await this.pickWorkspaceOrFolders(workspace.folders, workspace.configuration ? workspace : void 0, localize("select for add", "Add extension recommendation to"));
    for (const workspaceOrWorkspaceFolder of workspaceOrFolders) {
      if (isWorkspace(workspaceOrWorkspaceFolder)) {
        await this.addOrRemoveWorkspaceUnwantedRecommendation(extensionId, workspaceOrWorkspaceFolder, workspaceExtensionsConfigContent, !isUnwanted);
      } else {
        await this.addOrRemoveWorkspaceFolderUnwantedRecommendation(extensionId, workspaceOrWorkspaceFolder, workspaceFolderExtensionsConfigContents.get(workspaceOrWorkspaceFolder.uri), !isUnwanted);
      }
    }
  }
  async addOrRemoveWorkspaceFolderRecommendation(extensionId, workspaceFolder, extensionsConfigContent, add) {
    const values = [];
    if (add) {
      if (Array.isArray(extensionsConfigContent.recommendations)) {
        values.push({ path: ["recommendations", -1], value: extensionId });
      } else {
        values.push({ path: ["recommendations"], value: [extensionId] });
      }
      const unwantedRecommendationEdit = this.getEditToRemoveValueFromArray(["unwantedRecommendations"], extensionsConfigContent.unwantedRecommendations, extensionId);
      if (unwantedRecommendationEdit) {
        values.push(unwantedRecommendationEdit);
      }
    } else if (extensionsConfigContent.recommendations) {
      const recommendationEdit = this.getEditToRemoveValueFromArray(["recommendations"], extensionsConfigContent.recommendations, extensionId);
      if (recommendationEdit) {
        values.push(recommendationEdit);
      }
    }
    if (values.length) {
      return this.jsonEditingService.write(workspaceFolder.toResource(EXTENSIONS_CONFIG), values, true);
    }
  }
  async addOrRemoveWorkspaceRecommendation(extensionId, workspace, extensionsConfigContent, add) {
    const values = [];
    if (extensionsConfigContent) {
      if (add) {
        const path = ["extensions", "recommendations"];
        if (Array.isArray(extensionsConfigContent.recommendations)) {
          values.push({ path: [...path, -1], value: extensionId });
        } else {
          values.push({ path, value: [extensionId] });
        }
        const unwantedRecommendationEdit = this.getEditToRemoveValueFromArray(["extensions", "unwantedRecommendations"], extensionsConfigContent.unwantedRecommendations, extensionId);
        if (unwantedRecommendationEdit) {
          values.push(unwantedRecommendationEdit);
        }
      } else if (extensionsConfigContent.recommendations) {
        const recommendationEdit = this.getEditToRemoveValueFromArray(["extensions", "recommendations"], extensionsConfigContent.recommendations, extensionId);
        if (recommendationEdit) {
          values.push(recommendationEdit);
        }
      }
    } else if (add) {
      values.push({ path: ["extensions"], value: { recommendations: [extensionId] } });
    }
    if (values.length) {
      return this.jsonEditingService.write(workspace.configuration, values, true);
    }
  }
  async addOrRemoveWorkspaceFolderUnwantedRecommendation(extensionId, workspaceFolder, extensionsConfigContent, add) {
    const values = [];
    if (add) {
      const path = ["unwantedRecommendations"];
      if (Array.isArray(extensionsConfigContent.unwantedRecommendations)) {
        values.push({ path: [...path, -1], value: extensionId });
      } else {
        values.push({ path, value: [extensionId] });
      }
      const recommendationEdit = this.getEditToRemoveValueFromArray(["recommendations"], extensionsConfigContent.recommendations, extensionId);
      if (recommendationEdit) {
        values.push(recommendationEdit);
      }
    } else if (extensionsConfigContent.unwantedRecommendations) {
      const unwantedRecommendationEdit = this.getEditToRemoveValueFromArray(["unwantedRecommendations"], extensionsConfigContent.unwantedRecommendations, extensionId);
      if (unwantedRecommendationEdit) {
        values.push(unwantedRecommendationEdit);
      }
    }
    if (values.length) {
      return this.jsonEditingService.write(workspaceFolder.toResource(EXTENSIONS_CONFIG), values, true);
    }
  }
  async addOrRemoveWorkspaceUnwantedRecommendation(extensionId, workspace, extensionsConfigContent, add) {
    const values = [];
    if (extensionsConfigContent) {
      if (add) {
        const path = ["extensions", "unwantedRecommendations"];
        if (Array.isArray(extensionsConfigContent.recommendations)) {
          values.push({ path: [...path, -1], value: extensionId });
        } else {
          values.push({ path, value: [extensionId] });
        }
        const recommendationEdit = this.getEditToRemoveValueFromArray(["extensions", "recommendations"], extensionsConfigContent.recommendations, extensionId);
        if (recommendationEdit) {
          values.push(recommendationEdit);
        }
      } else if (extensionsConfigContent.unwantedRecommendations) {
        const unwantedRecommendationEdit = this.getEditToRemoveValueFromArray(["extensions", "unwantedRecommendations"], extensionsConfigContent.unwantedRecommendations, extensionId);
        if (unwantedRecommendationEdit) {
          values.push(unwantedRecommendationEdit);
        }
      }
    } else if (add) {
      values.push({ path: ["extensions"], value: { unwantedRecommendations: [extensionId] } });
    }
    if (values.length) {
      return this.jsonEditingService.write(workspace.configuration, values, true);
    }
  }
  async pickWorkspaceOrFolders(workspaceFolders, workspace, placeHolder) {
    const workspaceOrFolders = workspace ? [...workspaceFolders, workspace] : [...workspaceFolders];
    if (workspaceOrFolders.length === 1) {
      return workspaceOrFolders;
    }
    const folderPicks = workspaceFolders.map((workspaceFolder) => {
      return {
        label: workspaceFolder.name,
        description: localize("workspace folder", "Workspace Folder"),
        workspaceOrFolder: workspaceFolder,
        iconClasses: getIconClasses(this.modelService, this.languageService, workspaceFolder.uri, FileKind.ROOT_FOLDER)
      };
    });
    if (workspace) {
      folderPicks.push({ type: "separator" });
      folderPicks.push({
        label: localize("workspace", "Workspace"),
        workspaceOrFolder: workspace
      });
    }
    const result = await this.quickInputService.pick(folderPicks, { placeHolder, canPickMany: true }) || [];
    return result.map((r) => r.workspaceOrFolder);
  }
  async resolveWorkspaceExtensionConfig(workspaceConfigurationResource) {
    try {
      const content = await this.fileService.readFile(workspaceConfigurationResource);
      const extensionsConfigContent = parse(content.value.toString())["extensions"];
      return extensionsConfigContent ? this.parseExtensionConfig(extensionsConfigContent) : void 0;
    } catch (e) {
    }
    return void 0;
  }
  async resolveWorkspaceFolderExtensionConfig(workspaceFolder) {
    try {
      const content = await this.fileService.readFile(workspaceFolder.toResource(EXTENSIONS_CONFIG));
      const extensionsConfigContent = parse(content.value.toString());
      return this.parseExtensionConfig(extensionsConfigContent);
    } catch (e) {
    }
    return {};
  }
  parseExtensionConfig(extensionsConfigContent) {
    return {
      recommendations: distinct((extensionsConfigContent.recommendations || []).map((e) => e.toLowerCase())),
      unwantedRecommendations: distinct((extensionsConfigContent.unwantedRecommendations || []).map((e) => e.toLowerCase()))
    };
  }
  getEditToRemoveValueFromArray(path, array, value) {
    const index = array?.indexOf(value);
    if (index !== void 0 && index !== -1) {
      return { path: [...path, index], value: void 0 };
    }
    return void 0;
  }
};
WorkspaceExtensionsConfigService = __decorateClass([
  __decorateParam(0, IWorkspaceContextService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IQuickInputService),
  __decorateParam(3, IModelService),
  __decorateParam(4, ILanguageService),
  __decorateParam(5, IJSONEditingService)
], WorkspaceExtensionsConfigService);
registerSingleton(IWorkspaceExtensionsConfigService, WorkspaceExtensionsConfigService, InstantiationType.Delayed);
export {
  EXTENSIONS_CONFIG,
  IWorkspaceExtensionsConfigService,
  WorkspaceExtensionsConfigService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25SZWNvbW1lbmRhdGlvbnMvY29tbW9uL3dvcmtzcGFjZUV4dGVuc2lvbnNDb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEpTT05QYXRoLCBwYXJzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb24uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBnZXRJY29uQ2xhc3NlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZ2V0SWNvbkNsYXNzZXMuanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQsIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgaXNXb3Jrc3BhY2UsIElXb3Jrc3BhY2UsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUpTT05FZGl0aW5nU2VydmljZSwgSUpTT05WYWx1ZSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2pzb25FZGl0aW5nLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcblxuZXhwb3J0IGNvbnN0IEVYVEVOU0lPTlNfQ09ORklHID0gJy52c2NvZGUvZXh0ZW5zaW9ucy5qc29uJztcblxuZXhwb3J0IGludGVyZmFjZSBJRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQge1xuXHRyZWNvbW1lbmRhdGlvbnM/OiBzdHJpbmdbXTtcblx0dW53YW50ZWRSZWNvbW1lbmRhdGlvbnM/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNvbnN0IElXb3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJV29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ1NlcnZpY2U+KCdJV29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ1NlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJV29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ1NlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VFeHRlbnNpb25zQ29uZmlnczogRXZlbnQ8dm9pZD47XG5cdGdldEV4dGVuc2lvbnNDb25maWdzKCk6IFByb21pc2U8SUV4dGVuc2lvbnNDb25maWdDb250ZW50W10+O1xuXHRnZXRSZWNvbW1lbmRhdGlvbnMoKTogUHJvbWlzZTxzdHJpbmdbXT47XG5cdGdldFVud2FudGVkUmVjb21tZW5kYXRpb25zKCk6IFByb21pc2U8c3RyaW5nW10+O1xuXG5cdHRvZ2dsZVJlY29tbWVuZGF0aW9uKGV4dGVuc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xuXHR0b2dnbGVVbndhbnRlZFJlY29tbWVuZGF0aW9uKGV4dGVuc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgY2xhc3MgV29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtzcGFjZUV4dGVuc2lvbnNDb25maWdTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUV4dGVuc2lvbnNDb25maWdzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRXh0ZW5zaW9uc0NvbmZpZ3MgPSB0aGlzLl9vbkRpZENoYW5nZUV4dGVuc2lvbnNDb25maWdzLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBxdWlja0lucHV0U2VydmljZTogSVF1aWNrSW5wdXRTZXJ2aWNlLFxuXHRcdEBJTW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbW9kZWxTZXJ2aWNlOiBJTW9kZWxTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJSlNPTkVkaXRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkganNvbkVkaXRpbmdTZXJ2aWNlOiBJSlNPTkVkaXRpbmdTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyhlID0+IHRoaXMuX29uRGlkQ2hhbmdlRXh0ZW5zaW9uc0NvbmZpZ3MuZmlyZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZmlsZVNlcnZpY2Uub25EaWRGaWxlc0NoYW5nZShlID0+IHtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdFx0aWYgKCh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiAmJiBlLmFmZmVjdHMod29ya3NwYWNlLmNvbmZpZ3VyYXRpb24pKVxuXHRcdFx0XHR8fCB3b3Jrc3BhY2UuZm9sZGVycy5zb21lKGZvbGRlciA9PiBlLmFmZmVjdHMoZm9sZGVyLnRvUmVzb3VyY2UoRVhURU5TSU9OU19DT05GSUcpKSlcblx0XHRcdCkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUV4dGVuc2lvbnNDb25maWdzLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBnZXRFeHRlbnNpb25zQ29uZmlncygpOiBQcm9taXNlPElFeHRlbnNpb25zQ29uZmlnQ29udGVudFtdPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRjb25zdCByZXN1bHQ6IElFeHRlbnNpb25zQ29uZmlnQ29udGVudFtdID0gW107XG5cdFx0Y29uc3Qgd29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQgPSB3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiA/IGF3YWl0IHRoaXMucmVzb2x2ZVdvcmtzcGFjZUV4dGVuc2lvbkNvbmZpZyh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbikgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHdvcmtzcGFjZUV4dGVuc2lvbnNDb25maWdDb250ZW50KSB7XG5cdFx0XHRyZXN1bHQucHVzaCh3b3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnQ29udGVudCk7XG5cdFx0fVxuXHRcdHJlc3VsdC5wdXNoKC4uLmF3YWl0IFByb21pc2UuYWxsKHdvcmtzcGFjZS5mb2xkZXJzLm1hcCh3b3Jrc3BhY2VGb2xkZXIgPT4gdGhpcy5yZXNvbHZlV29ya3NwYWNlRm9sZGVyRXh0ZW5zaW9uQ29uZmlnKHdvcmtzcGFjZUZvbGRlcikpKSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIGdldFJlY29tbWVuZGF0aW9ucygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0Y29uc3QgY29uZmlncyA9IGF3YWl0IHRoaXMuZ2V0RXh0ZW5zaW9uc0NvbmZpZ3MoKTtcblx0XHRyZXR1cm4gZGlzdGluY3QoY29uZmlncy5mbGF0TWFwKGMgPT4gYy5yZWNvbW1lbmRhdGlvbnMgPyBjLnJlY29tbWVuZGF0aW9ucy5tYXAoYyA9PiBjLnRvTG93ZXJDYXNlKCkpIDogW10pKTtcblx0fVxuXG5cdGFzeW5jIGdldFVud2FudGVkUmVjb21tZW5kYXRpb25zKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRjb25zdCBjb25maWdzID0gYXdhaXQgdGhpcy5nZXRFeHRlbnNpb25zQ29uZmlncygpO1xuXHRcdHJldHVybiBkaXN0aW5jdChjb25maWdzLmZsYXRNYXAoYyA9PiBjLnVud2FudGVkUmVjb21tZW5kYXRpb25zID8gYy51bndhbnRlZFJlY29tbWVuZGF0aW9ucy5tYXAoYyA9PiBjLnRvTG93ZXJDYXNlKCkpIDogW10pKTtcblx0fVxuXG5cdGFzeW5jIHRvZ2dsZVJlY29tbWVuZGF0aW9uKGV4dGVuc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRleHRlbnNpb25JZCA9IGV4dGVuc2lvbklkLnRvTG93ZXJDYXNlKCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnQ29udGVudCA9IHdvcmtzcGFjZS5jb25maWd1cmF0aW9uID8gYXdhaXQgdGhpcy5yZXNvbHZlV29ya3NwYWNlRXh0ZW5zaW9uQ29uZmlnKHdvcmtzcGFjZS5jb25maWd1cmF0aW9uKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXJFeHRlbnNpb25zQ29uZmlnQ29udGVudHMgPSBuZXcgUmVzb3VyY2VNYXA8SUV4dGVuc2lvbnNDb25maWdDb250ZW50PigpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKHdvcmtzcGFjZS5mb2xkZXJzLm1hcChhc3luYyB3b3Jrc3BhY2VGb2xkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQgPSBhd2FpdCB0aGlzLnJlc29sdmVXb3Jrc3BhY2VGb2xkZXJFeHRlbnNpb25Db25maWcod29ya3NwYWNlRm9sZGVyKTtcblx0XHRcdHdvcmtzcGFjZUZvbGRlckV4dGVuc2lvbnNDb25maWdDb250ZW50cy5zZXQod29ya3NwYWNlRm9sZGVyLnVyaSwgZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGlzV29ya3NwYWNlUmVjb21tZW5kZWQgPSB3b3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnQ29udGVudCAmJiB3b3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnQ29udGVudC5yZWNvbW1lbmRhdGlvbnM/LnNvbWUociA9PiByLnRvTG93ZXJDYXNlKCkgPT09IGV4dGVuc2lvbklkKTtcblx0XHRjb25zdCByZWNvbW1lbmRlZFdvcmtzYXBjZUZvbGRlcnMgPSB3b3Jrc3BhY2UuZm9sZGVycy5maWx0ZXIod29ya3NwYWNlRm9sZGVyID0+IHdvcmtzcGFjZUZvbGRlckV4dGVuc2lvbnNDb25maWdDb250ZW50cy5nZXQod29ya3NwYWNlRm9sZGVyLnVyaSk/LnJlY29tbWVuZGF0aW9ucz8uc29tZShyID0+IHIudG9Mb3dlckNhc2UoKSA9PT0gZXh0ZW5zaW9uSWQpKTtcblx0XHRjb25zdCBpc1JlY29tbWVuZGVkID0gaXNXb3Jrc3BhY2VSZWNvbW1lbmRlZCB8fCByZWNvbW1lbmRlZFdvcmtzYXBjZUZvbGRlcnMubGVuZ3RoID4gMDtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZU9yRm9sZGVycyA9IGlzUmVjb21tZW5kZWRcblx0XHRcdD8gYXdhaXQgdGhpcy5waWNrV29ya3NwYWNlT3JGb2xkZXJzKHJlY29tbWVuZGVkV29ya3NhcGNlRm9sZGVycywgaXNXb3Jrc3BhY2VSZWNvbW1lbmRlZCA/IHdvcmtzcGFjZSA6IHVuZGVmaW5lZCwgbG9jYWxpemUoJ3NlbGVjdCBmb3IgcmVtb3ZlJywgXCJSZW1vdmUgZXh0ZW5zaW9uIHJlY29tbWVuZGF0aW9uIGZyb21cIikpXG5cdFx0XHQ6IGF3YWl0IHRoaXMucGlja1dvcmtzcGFjZU9yRm9sZGVycyh3b3Jrc3BhY2UuZm9sZGVycywgd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gPyB3b3Jrc3BhY2UgOiB1bmRlZmluZWQsIGxvY2FsaXplKCdzZWxlY3QgZm9yIGFkZCcsIFwiQWRkIGV4dGVuc2lvbiByZWNvbW1lbmRhdGlvbiB0b1wiKSk7XG5cblx0XHRmb3IgKGNvbnN0IHdvcmtzcGFjZU9yV29ya3NwYWNlRm9sZGVyIG9mIHdvcmtzcGFjZU9yRm9sZGVycykge1xuXHRcdFx0aWYgKGlzV29ya3NwYWNlKHdvcmtzcGFjZU9yV29ya3NwYWNlRm9sZGVyKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmFkZE9yUmVtb3ZlV29ya3NwYWNlUmVjb21tZW5kYXRpb24oZXh0ZW5zaW9uSWQsIHdvcmtzcGFjZU9yV29ya3NwYWNlRm9sZGVyLCB3b3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnQ29udGVudCwgIWlzUmVjb21tZW5kZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5hZGRPclJlbW92ZVdvcmtzcGFjZUZvbGRlclJlY29tbWVuZGF0aW9uKGV4dGVuc2lvbklkLCB3b3Jrc3BhY2VPcldvcmtzcGFjZUZvbGRlciwgd29ya3NwYWNlRm9sZGVyRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnRzLmdldCh3b3Jrc3BhY2VPcldvcmtzcGFjZUZvbGRlci51cmkpISwgIWlzUmVjb21tZW5kZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHRvZ2dsZVVud2FudGVkUmVjb21tZW5kYXRpb24oZXh0ZW5zaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQgPSB3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiA/IGF3YWl0IHRoaXMucmVzb2x2ZVdvcmtzcGFjZUV4dGVuc2lvbkNvbmZpZyh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbikgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnRzID0gbmV3IFJlc291cmNlTWFwPElFeHRlbnNpb25zQ29uZmlnQ29udGVudD4oKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbCh3b3Jrc3BhY2UuZm9sZGVycy5tYXAoYXN5bmMgd29ya3NwYWNlRm9sZGVyID0+IHtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnNDb25maWdDb250ZW50ID0gYXdhaXQgdGhpcy5yZXNvbHZlV29ya3NwYWNlRm9sZGVyRXh0ZW5zaW9uQ29uZmlnKHdvcmtzcGFjZUZvbGRlcik7XG5cdFx0XHR3b3Jrc3BhY2VGb2xkZXJFeHRlbnNpb25zQ29uZmlnQ29udGVudHMuc2V0KHdvcmtzcGFjZUZvbGRlci51cmksIGV4dGVuc2lvbnNDb25maWdDb250ZW50KTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBpc1dvcmtzcGFjZVVud2FudGVkID0gd29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQgJiYgd29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQudW53YW50ZWRSZWNvbW1lbmRhdGlvbnM/LnNvbWUociA9PiByID09PSBleHRlbnNpb25JZCk7XG5cdFx0Y29uc3QgdW5XYW50ZWRXb3Jrc2FwY2VGb2xkZXJzID0gd29ya3NwYWNlLmZvbGRlcnMuZmlsdGVyKHdvcmtzcGFjZUZvbGRlciA9PiB3b3Jrc3BhY2VGb2xkZXJFeHRlbnNpb25zQ29uZmlnQ29udGVudHMuZ2V0KHdvcmtzcGFjZUZvbGRlci51cmkpPy51bndhbnRlZFJlY29tbWVuZGF0aW9ucz8uc29tZShyID0+IHIgPT09IGV4dGVuc2lvbklkKSk7XG5cdFx0Y29uc3QgaXNVbndhbnRlZCA9IGlzV29ya3NwYWNlVW53YW50ZWQgfHwgdW5XYW50ZWRXb3Jrc2FwY2VGb2xkZXJzLmxlbmd0aCA+IDA7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VPckZvbGRlcnMgPSBpc1Vud2FudGVkXG5cdFx0XHQ/IGF3YWl0IHRoaXMucGlja1dvcmtzcGFjZU9yRm9sZGVycyh1bldhbnRlZFdvcmtzYXBjZUZvbGRlcnMsIGlzV29ya3NwYWNlVW53YW50ZWQgPyB3b3Jrc3BhY2UgOiB1bmRlZmluZWQsIGxvY2FsaXplKCdzZWxlY3QgZm9yIHJlbW92ZScsIFwiUmVtb3ZlIGV4dGVuc2lvbiByZWNvbW1lbmRhdGlvbiBmcm9tXCIpKVxuXHRcdFx0OiBhd2FpdCB0aGlzLnBpY2tXb3Jrc3BhY2VPckZvbGRlcnMod29ya3NwYWNlLmZvbGRlcnMsIHdvcmtzcGFjZS5jb25maWd1cmF0aW9uID8gd29ya3NwYWNlIDogdW5kZWZpbmVkLCBsb2NhbGl6ZSgnc2VsZWN0IGZvciBhZGQnLCBcIkFkZCBleHRlbnNpb24gcmVjb21tZW5kYXRpb24gdG9cIikpO1xuXG5cdFx0Zm9yIChjb25zdCB3b3Jrc3BhY2VPcldvcmtzcGFjZUZvbGRlciBvZiB3b3Jrc3BhY2VPckZvbGRlcnMpIHtcblx0XHRcdGlmIChpc1dvcmtzcGFjZSh3b3Jrc3BhY2VPcldvcmtzcGFjZUZvbGRlcikpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5hZGRPclJlbW92ZVdvcmtzcGFjZVVud2FudGVkUmVjb21tZW5kYXRpb24oZXh0ZW5zaW9uSWQsIHdvcmtzcGFjZU9yV29ya3NwYWNlRm9sZGVyLCB3b3Jrc3BhY2VFeHRlbnNpb25zQ29uZmlnQ29udGVudCwgIWlzVW53YW50ZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5hZGRPclJlbW92ZVdvcmtzcGFjZUZvbGRlclVud2FudGVkUmVjb21tZW5kYXRpb24oZXh0ZW5zaW9uSWQsIHdvcmtzcGFjZU9yV29ya3NwYWNlRm9sZGVyLCB3b3Jrc3BhY2VGb2xkZXJFeHRlbnNpb25zQ29uZmlnQ29udGVudHMuZ2V0KHdvcmtzcGFjZU9yV29ya3NwYWNlRm9sZGVyLnVyaSkhLCAhaXNVbndhbnRlZCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhZGRPclJlbW92ZVdvcmtzcGFjZUZvbGRlclJlY29tbWVuZGF0aW9uKGV4dGVuc2lvbklkOiBzdHJpbmcsIHdvcmtzcGFjZUZvbGRlcjogSVdvcmtzcGFjZUZvbGRlciwgZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQ6IElFeHRlbnNpb25zQ29uZmlnQ29udGVudCwgYWRkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdmFsdWVzOiBJSlNPTlZhbHVlW10gPSBbXTtcblx0XHRpZiAoYWRkKSB7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShleHRlbnNpb25zQ29uZmlnQ29udGVudC5yZWNvbW1lbmRhdGlvbnMpKSB7XG5cdFx0XHRcdHZhbHVlcy5wdXNoKHsgcGF0aDogWydyZWNvbW1lbmRhdGlvbnMnLCAtMV0sIHZhbHVlOiBleHRlbnNpb25JZCB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhbHVlcy5wdXNoKHsgcGF0aDogWydyZWNvbW1lbmRhdGlvbnMnXSwgdmFsdWU6IFtleHRlbnNpb25JZF0gfSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB1bndhbnRlZFJlY29tbWVuZGF0aW9uRWRpdCA9IHRoaXMuZ2V0RWRpdFRvUmVtb3ZlVmFsdWVGcm9tQXJyYXkoWyd1bndhbnRlZFJlY29tbWVuZGF0aW9ucyddLCBleHRlbnNpb25zQ29uZmlnQ29udGVudC51bndhbnRlZFJlY29tbWVuZGF0aW9ucywgZXh0ZW5zaW9uSWQpO1xuXHRcdFx0aWYgKHVud2FudGVkUmVjb21tZW5kYXRpb25FZGl0KSB7XG5cdFx0XHRcdHZhbHVlcy5wdXNoKHVud2FudGVkUmVjb21tZW5kYXRpb25FZGl0KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGV4dGVuc2lvbnNDb25maWdDb250ZW50LnJlY29tbWVuZGF0aW9ucykge1xuXHRcdFx0Y29uc3QgcmVjb21tZW5kYXRpb25FZGl0ID0gdGhpcy5nZXRFZGl0VG9SZW1vdmVWYWx1ZUZyb21BcnJheShbJ3JlY29tbWVuZGF0aW9ucyddLCBleHRlbnNpb25zQ29uZmlnQ29udGVudC5yZWNvbW1lbmRhdGlvbnMsIGV4dGVuc2lvbklkKTtcblx0XHRcdGlmIChyZWNvbW1lbmRhdGlvbkVkaXQpIHtcblx0XHRcdFx0dmFsdWVzLnB1c2gocmVjb21tZW5kYXRpb25FZGl0KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodmFsdWVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuanNvbkVkaXRpbmdTZXJ2aWNlLndyaXRlKHdvcmtzcGFjZUZvbGRlci50b1Jlc291cmNlKEVYVEVOU0lPTlNfQ09ORklHKSwgdmFsdWVzLCB0cnVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGFkZE9yUmVtb3ZlV29ya3NwYWNlUmVjb21tZW5kYXRpb24oZXh0ZW5zaW9uSWQ6IHN0cmluZywgd29ya3NwYWNlOiBJV29ya3NwYWNlLCBleHRlbnNpb25zQ29uZmlnQ29udGVudDogSUV4dGVuc2lvbnNDb25maWdDb250ZW50IHwgdW5kZWZpbmVkLCBhZGQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2YWx1ZXM6IElKU09OVmFsdWVbXSA9IFtdO1xuXHRcdGlmIChleHRlbnNpb25zQ29uZmlnQ29udGVudCkge1xuXHRcdFx0aWYgKGFkZCkge1xuXHRcdFx0XHRjb25zdCBwYXRoOiBKU09OUGF0aCA9IFsnZXh0ZW5zaW9ucycsICdyZWNvbW1lbmRhdGlvbnMnXTtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQucmVjb21tZW5kYXRpb25zKSkge1xuXHRcdFx0XHRcdHZhbHVlcy5wdXNoKHsgcGF0aDogWy4uLnBhdGgsIC0xXSwgdmFsdWU6IGV4dGVuc2lvbklkIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHZhbHVlcy5wdXNoKHsgcGF0aCwgdmFsdWU6IFtleHRlbnNpb25JZF0gfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgdW53YW50ZWRSZWNvbW1lbmRhdGlvbkVkaXQgPSB0aGlzLmdldEVkaXRUb1JlbW92ZVZhbHVlRnJvbUFycmF5KFsnZXh0ZW5zaW9ucycsICd1bndhbnRlZFJlY29tbWVuZGF0aW9ucyddLCBleHRlbnNpb25zQ29uZmlnQ29udGVudC51bndhbnRlZFJlY29tbWVuZGF0aW9ucywgZXh0ZW5zaW9uSWQpO1xuXHRcdFx0XHRpZiAodW53YW50ZWRSZWNvbW1lbmRhdGlvbkVkaXQpIHtcblx0XHRcdFx0XHR2YWx1ZXMucHVzaCh1bndhbnRlZFJlY29tbWVuZGF0aW9uRWRpdCk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQucmVjb21tZW5kYXRpb25zKSB7XG5cdFx0XHRcdGNvbnN0IHJlY29tbWVuZGF0aW9uRWRpdCA9IHRoaXMuZ2V0RWRpdFRvUmVtb3ZlVmFsdWVGcm9tQXJyYXkoWydleHRlbnNpb25zJywgJ3JlY29tbWVuZGF0aW9ucyddLCBleHRlbnNpb25zQ29uZmlnQ29udGVudC5yZWNvbW1lbmRhdGlvbnMsIGV4dGVuc2lvbklkKTtcblx0XHRcdFx0aWYgKHJlY29tbWVuZGF0aW9uRWRpdCkge1xuXHRcdFx0XHRcdHZhbHVlcy5wdXNoKHJlY29tbWVuZGF0aW9uRWRpdCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGFkZCkge1xuXHRcdFx0dmFsdWVzLnB1c2goeyBwYXRoOiBbJ2V4dGVuc2lvbnMnXSwgdmFsdWU6IHsgcmVjb21tZW5kYXRpb25zOiBbZXh0ZW5zaW9uSWRdIH0gfSk7XG5cdFx0fVxuXG5cdFx0aWYgKHZhbHVlcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB0aGlzLmpzb25FZGl0aW5nU2VydmljZS53cml0ZSh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiEsIHZhbHVlcywgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBhZGRPclJlbW92ZVdvcmtzcGFjZUZvbGRlclVud2FudGVkUmVjb21tZW5kYXRpb24oZXh0ZW5zaW9uSWQ6IHN0cmluZywgd29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyLCBleHRlbnNpb25zQ29uZmlnQ29udGVudDogSUV4dGVuc2lvbnNDb25maWdDb250ZW50LCBhZGQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCB2YWx1ZXM6IElKU09OVmFsdWVbXSA9IFtdO1xuXHRcdGlmIChhZGQpIHtcblx0XHRcdGNvbnN0IHBhdGg6IEpTT05QYXRoID0gWyd1bndhbnRlZFJlY29tbWVuZGF0aW9ucyddO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQudW53YW50ZWRSZWNvbW1lbmRhdGlvbnMpKSB7XG5cdFx0XHRcdHZhbHVlcy5wdXNoKHsgcGF0aDogWy4uLnBhdGgsIC0xXSwgdmFsdWU6IGV4dGVuc2lvbklkIH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dmFsdWVzLnB1c2goeyBwYXRoLCB2YWx1ZTogW2V4dGVuc2lvbklkXSB9KTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlY29tbWVuZGF0aW9uRWRpdCA9IHRoaXMuZ2V0RWRpdFRvUmVtb3ZlVmFsdWVGcm9tQXJyYXkoWydyZWNvbW1lbmRhdGlvbnMnXSwgZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQucmVjb21tZW5kYXRpb25zLCBleHRlbnNpb25JZCk7XG5cdFx0XHRpZiAocmVjb21tZW5kYXRpb25FZGl0KSB7XG5cdFx0XHRcdHZhbHVlcy5wdXNoKHJlY29tbWVuZGF0aW9uRWRpdCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChleHRlbnNpb25zQ29uZmlnQ29udGVudC51bndhbnRlZFJlY29tbWVuZGF0aW9ucykge1xuXHRcdFx0Y29uc3QgdW53YW50ZWRSZWNvbW1lbmRhdGlvbkVkaXQgPSB0aGlzLmdldEVkaXRUb1JlbW92ZVZhbHVlRnJvbUFycmF5KFsndW53YW50ZWRSZWNvbW1lbmRhdGlvbnMnXSwgZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQudW53YW50ZWRSZWNvbW1lbmRhdGlvbnMsIGV4dGVuc2lvbklkKTtcblx0XHRcdGlmICh1bndhbnRlZFJlY29tbWVuZGF0aW9uRWRpdCkge1xuXHRcdFx0XHR2YWx1ZXMucHVzaCh1bndhbnRlZFJlY29tbWVuZGF0aW9uRWRpdCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh2YWx1ZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5qc29uRWRpdGluZ1NlcnZpY2Uud3JpdGUod29ya3NwYWNlRm9sZGVyLnRvUmVzb3VyY2UoRVhURU5TSU9OU19DT05GSUcpLCB2YWx1ZXMsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgYWRkT3JSZW1vdmVXb3Jrc3BhY2VVbndhbnRlZFJlY29tbWVuZGF0aW9uKGV4dGVuc2lvbklkOiBzdHJpbmcsIHdvcmtzcGFjZTogSVdvcmtzcGFjZSwgZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQ6IElFeHRlbnNpb25zQ29uZmlnQ29udGVudCB8IHVuZGVmaW5lZCwgYWRkOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdmFsdWVzOiBJSlNPTlZhbHVlW10gPSBbXTtcblx0XHRpZiAoZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQpIHtcblx0XHRcdGlmIChhZGQpIHtcblx0XHRcdFx0Y29uc3QgcGF0aDogSlNPTlBhdGggPSBbJ2V4dGVuc2lvbnMnLCAndW53YW50ZWRSZWNvbW1lbmRhdGlvbnMnXTtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQucmVjb21tZW5kYXRpb25zKSkge1xuXHRcdFx0XHRcdHZhbHVlcy5wdXNoKHsgcGF0aDogWy4uLnBhdGgsIC0xXSwgdmFsdWU6IGV4dGVuc2lvbklkIH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHZhbHVlcy5wdXNoKHsgcGF0aCwgdmFsdWU6IFtleHRlbnNpb25JZF0gfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcmVjb21tZW5kYXRpb25FZGl0ID0gdGhpcy5nZXRFZGl0VG9SZW1vdmVWYWx1ZUZyb21BcnJheShbJ2V4dGVuc2lvbnMnLCAncmVjb21tZW5kYXRpb25zJ10sIGV4dGVuc2lvbnNDb25maWdDb250ZW50LnJlY29tbWVuZGF0aW9ucywgZXh0ZW5zaW9uSWQpO1xuXHRcdFx0XHRpZiAocmVjb21tZW5kYXRpb25FZGl0KSB7XG5cdFx0XHRcdFx0dmFsdWVzLnB1c2gocmVjb21tZW5kYXRpb25FZGl0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmIChleHRlbnNpb25zQ29uZmlnQ29udGVudC51bndhbnRlZFJlY29tbWVuZGF0aW9ucykge1xuXHRcdFx0XHRjb25zdCB1bndhbnRlZFJlY29tbWVuZGF0aW9uRWRpdCA9IHRoaXMuZ2V0RWRpdFRvUmVtb3ZlVmFsdWVGcm9tQXJyYXkoWydleHRlbnNpb25zJywgJ3Vud2FudGVkUmVjb21tZW5kYXRpb25zJ10sIGV4dGVuc2lvbnNDb25maWdDb250ZW50LnVud2FudGVkUmVjb21tZW5kYXRpb25zLCBleHRlbnNpb25JZCk7XG5cdFx0XHRcdGlmICh1bndhbnRlZFJlY29tbWVuZGF0aW9uRWRpdCkge1xuXHRcdFx0XHRcdHZhbHVlcy5wdXNoKHVud2FudGVkUmVjb21tZW5kYXRpb25FZGl0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoYWRkKSB7XG5cdFx0XHR2YWx1ZXMucHVzaCh7IHBhdGg6IFsnZXh0ZW5zaW9ucyddLCB2YWx1ZTogeyB1bndhbnRlZFJlY29tbWVuZGF0aW9uczogW2V4dGVuc2lvbklkXSB9IH0pO1xuXHRcdH1cblxuXHRcdGlmICh2YWx1ZXMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5qc29uRWRpdGluZ1NlcnZpY2Uud3JpdGUod29ya3NwYWNlLmNvbmZpZ3VyYXRpb24hLCB2YWx1ZXMsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcGlja1dvcmtzcGFjZU9yRm9sZGVycyh3b3Jrc3BhY2VGb2xkZXJzOiBJV29ya3NwYWNlRm9sZGVyW10sIHdvcmtzcGFjZTogSVdvcmtzcGFjZSB8IHVuZGVmaW5lZCwgcGxhY2VIb2xkZXI6IHN0cmluZyk6IFByb21pc2U8KElXb3Jrc3BhY2UgfCBJV29ya3NwYWNlRm9sZGVyKVtdPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlT3JGb2xkZXJzID0gd29ya3NwYWNlID8gWy4uLndvcmtzcGFjZUZvbGRlcnMsIHdvcmtzcGFjZV0gOiBbLi4ud29ya3NwYWNlRm9sZGVyc107XG5cdFx0aWYgKHdvcmtzcGFjZU9yRm9sZGVycy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybiB3b3Jrc3BhY2VPckZvbGRlcnM7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9sZGVyUGlja3M6IChJUXVpY2tQaWNrSXRlbSAmIHsgd29ya3NwYWNlT3JGb2xkZXI6IElXb3Jrc3BhY2UgfCBJV29ya3NwYWNlRm9sZGVyIH0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yKVtdID0gd29ya3NwYWNlRm9sZGVycy5tYXAod29ya3NwYWNlRm9sZGVyID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxhYmVsOiB3b3Jrc3BhY2VGb2xkZXIubmFtZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd3b3Jrc3BhY2UgZm9sZGVyJywgXCJXb3Jrc3BhY2UgRm9sZGVyXCIpLFxuXHRcdFx0XHR3b3Jrc3BhY2VPckZvbGRlcjogd29ya3NwYWNlRm9sZGVyLFxuXHRcdFx0XHRpY29uQ2xhc3NlczogZ2V0SWNvbkNsYXNzZXModGhpcy5tb2RlbFNlcnZpY2UsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCB3b3Jrc3BhY2VGb2xkZXIudXJpLCBGaWxlS2luZC5ST09UX0ZPTERFUilcblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHRpZiAod29ya3NwYWNlKSB7XG5cdFx0XHRmb2xkZXJQaWNrcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicgfSk7XG5cdFx0XHRmb2xkZXJQaWNrcy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCd3b3Jrc3BhY2UnLCBcIldvcmtzcGFjZVwiKSxcblx0XHRcdFx0d29ya3NwYWNlT3JGb2xkZXI6IHdvcmtzcGFjZSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucGljayhmb2xkZXJQaWNrcywgeyBwbGFjZUhvbGRlciwgY2FuUGlja01hbnk6IHRydWUgfSkgfHwgW107XG5cdFx0cmV0dXJuIHJlc3VsdC5tYXAociA9PiByLndvcmtzcGFjZU9yRm9sZGVyKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZVdvcmtzcGFjZUV4dGVuc2lvbkNvbmZpZyh3b3Jrc3BhY2VDb25maWd1cmF0aW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SUV4dGVuc2lvbnNDb25maWdDb250ZW50IHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHdvcmtzcGFjZUNvbmZpZ3VyYXRpb25SZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBleHRlbnNpb25zQ29uZmlnQ29udGVudCA9IDxJRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQgfCB1bmRlZmluZWQ+cGFyc2UoY29udGVudC52YWx1ZS50b1N0cmluZygpKVsnZXh0ZW5zaW9ucyddO1xuXHRcdFx0cmV0dXJuIGV4dGVuc2lvbnNDb25maWdDb250ZW50ID8gdGhpcy5wYXJzZUV4dGVuc2lvbkNvbmZpZyhleHRlbnNpb25zQ29uZmlnQ29udGVudCkgOiB1bmRlZmluZWQ7XG5cdFx0fSBjYXRjaCAoZSkgeyAvKiBJZ25vcmUgKi8gfVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlc29sdmVXb3Jrc3BhY2VGb2xkZXJFeHRlbnNpb25Db25maWcod29ya3NwYWNlRm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyKTogUHJvbWlzZTxJRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUod29ya3NwYWNlRm9sZGVyLnRvUmVzb3VyY2UoRVhURU5TSU9OU19DT05GSUcpKTtcblx0XHRcdGNvbnN0IGV4dGVuc2lvbnNDb25maWdDb250ZW50ID0gPElFeHRlbnNpb25zQ29uZmlnQ29udGVudD5wYXJzZShjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdFx0cmV0dXJuIHRoaXMucGFyc2VFeHRlbnNpb25Db25maWcoZXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQpO1xuXHRcdH0gY2F0Y2ggKGUpIHsgLyogaWdub3JlICovIH1cblx0XHRyZXR1cm4ge307XG5cdH1cblxuXHRwcml2YXRlIHBhcnNlRXh0ZW5zaW9uQ29uZmlnKGV4dGVuc2lvbnNDb25maWdDb250ZW50OiBJRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQpOiBJRXh0ZW5zaW9uc0NvbmZpZ0NvbnRlbnQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRyZWNvbW1lbmRhdGlvbnM6IGRpc3RpbmN0KChleHRlbnNpb25zQ29uZmlnQ29udGVudC5yZWNvbW1lbmRhdGlvbnMgfHwgW10pLm1hcChlID0+IGUudG9Mb3dlckNhc2UoKSkpLFxuXHRcdFx0dW53YW50ZWRSZWNvbW1lbmRhdGlvbnM6IGRpc3RpbmN0KChleHRlbnNpb25zQ29uZmlnQ29udGVudC51bndhbnRlZFJlY29tbWVuZGF0aW9ucyB8fCBbXSkubWFwKGUgPT4gZS50b0xvd2VyQ2FzZSgpKSlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFZGl0VG9SZW1vdmVWYWx1ZUZyb21BcnJheShwYXRoOiBKU09OUGF0aCwgYXJyYXk6IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCB2YWx1ZTogc3RyaW5nKTogSUpTT05WYWx1ZSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaW5kZXggPSBhcnJheT8uaW5kZXhPZih2YWx1ZSk7XG5cdFx0aWYgKGluZGV4ICE9PSB1bmRlZmluZWQgJiYgaW5kZXggIT09IC0xKSB7XG5cdFx0XHRyZXR1cm4geyBwYXRoOiBbLi4ucGF0aCwgaW5kZXhdLCB2YWx1ZTogdW5kZWZpbmVkIH07XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJV29ya3NwYWNlRXh0ZW5zaW9uc0NvbmZpZ1NlcnZpY2UsIFdvcmtzcGFjZUV4dGVuc2lvbnNDb25maWdTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFzQjtBQUMvQixTQUFtQixhQUFhO0FBQ2hDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsVUFBVSxvQkFBb0I7QUFDdkMsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsYUFBeUIsZ0NBQWtEO0FBQ3BGLFNBQVMsMEJBQStEO0FBQ3hFLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsMkJBQXVDO0FBQ2hE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
