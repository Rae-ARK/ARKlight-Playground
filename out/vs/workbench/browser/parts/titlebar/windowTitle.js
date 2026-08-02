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
import { localize } from "../../../../nls.js";
import { dirname, basename } from "../../../../base/common/resources.js";
import { IConfigurationService, isConfigured } from "../../../../platform/configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { EditorResourceAccessor, Verbosity, SideBySideEditor } from "../../../common/editor.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { isWindows, isWeb, isMacintosh, isNative } from "../../../../base/common/platform.js";
import { trim } from "../../../../base/common/strings.js";
import { template } from "../../../../base/common/labels.js";
import { ILabelService, Verbosity as LabelVerbosity } from "../../../../platform/label/common/label.js";
import { Emitter } from "../../../../base/common/event.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { Schemas } from "../../../../base/common/network.js";
import { getVirtualWorkspaceLocation } from "../../../../platform/workspace/common/virtualWorkspace.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { isCodeEditor, isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { getWindowById } from "../../../../base/browser/dom.js";
import { IDecorationsService } from "../../../services/decorations/common/decorations.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
var WindowSettingNames = /* @__PURE__ */ ((WindowSettingNames2) => {
  WindowSettingNames2["titleSeparator"] = "window.titleSeparator";
  WindowSettingNames2["title"] = "window.title";
  return WindowSettingNames2;
})(WindowSettingNames || {});
const defaultWindowTitle = (() => {
  if (isMacintosh && isNative) {
    return "${activeEditorShort}${separator}${rootName}${separator}${profileName}";
  }
  const base = "${dirty}${activeEditorShort}${separator}${rootName}${separator}${profileName}${separator}${appName}";
  if (isWeb) {
    return base + "${separator}${remoteName}";
  }
  return base;
})();
const defaultWindowTitleSeparator = isMacintosh ? " \u2014 " : " - ";
let WindowTitle = class extends Disposable {
  constructor(targetWindow, configurationService, contextKeyService, editorService, environmentService, contextService, labelService, userDataProfileService, productService, viewsService, decorationsService, accessibilityService) {
    super();
    this.configurationService = configurationService;
    this.contextKeyService = contextKeyService;
    this.editorService = editorService;
    this.environmentService = environmentService;
    this.contextService = contextService;
    this.labelService = labelService;
    this.userDataProfileService = userDataProfileService;
    this.productService = productService;
    this.viewsService = viewsService;
    this.decorationsService = decorationsService;
    this.accessibilityService = accessibilityService;
    this.properties = { isPure: true, isAdmin: false, prefix: void 0 };
    this.variables = /* @__PURE__ */ new Map();
    this.activeEditorListeners = this._register(new DisposableStore());
    this.titleUpdater = this._register(new RunOnceScheduler(() => this.doUpdateTitle(), 0));
    this.onDidChangeEmitter = this._register(new Emitter());
    this.onDidChange = this.onDidChangeEmitter.event;
    this.titleIncludesFocusedView = false;
    this.titleIncludesEditorState = false;
    this.windowId = targetWindow.vscodeWindowId;
    this.checkTitleVariables();
    this.registerListeners();
  }
  get value() {
    return this.title ?? "";
  }
  get workspaceName() {
    return this.labelService.getWorkspaceLabel(this.contextService.getWorkspace());
  }
  get fileName() {
    const activeEditor = this.editorService.activeEditor;
    if (!activeEditor) {
      return void 0;
    }
    const fileName = activeEditor.getTitle(Verbosity.SHORT);
    const dirty = activeEditor?.isDirty() && !activeEditor.isSaving() ? WindowTitle.TITLE_DIRTY : "";
    return `${dirty}${fileName}`;
  }
  registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationChanged(e)));
    this._register(this.editorService.onDidActiveEditorChange(() => this.onActiveEditorChange()));
    this._register(this.contextService.onDidChangeWorkspaceFolders(() => this.titleUpdater.schedule()));
    this._register(this.contextService.onDidChangeWorkbenchState(() => this.titleUpdater.schedule()));
    this._register(this.contextService.onDidChangeWorkspaceName(() => this.titleUpdater.schedule()));
    this._register(this.labelService.onDidChangeFormatters(() => this.titleUpdater.schedule()));
    this._register(this.userDataProfileService.onDidChangeCurrentProfile(() => this.titleUpdater.schedule()));
    this._register(this.viewsService.onDidChangeFocusedView(() => {
      if (this.titleIncludesFocusedView) {
        this.titleUpdater.schedule();
      }
    }));
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(this.variables)) {
        this.titleUpdater.schedule();
      }
    }));
    this._register(this.accessibilityService.onDidChangeScreenReaderOptimized(() => this.titleUpdater.schedule()));
  }
  onConfigurationChanged(event) {
    const affectsTitleConfiguration = event.affectsConfiguration("window.title" /* title */);
    if (affectsTitleConfiguration) {
      this.checkTitleVariables();
    }
    if (affectsTitleConfiguration || event.affectsConfiguration("window.titleSeparator" /* titleSeparator */)) {
      this.titleUpdater.schedule();
    }
  }
  checkTitleVariables() {
    const titleTemplate = this.configurationService.getValue("window.title" /* title */);
    if (typeof titleTemplate === "string") {
      this.titleIncludesFocusedView = titleTemplate.includes("${focusedView}");
      this.titleIncludesEditorState = titleTemplate.includes("${activeEditorState}");
    }
  }
  onActiveEditorChange() {
    this.activeEditorListeners.clear();
    this.titleUpdater.schedule();
    const activeEditor = this.editorService.activeEditor;
    if (activeEditor) {
      this.activeEditorListeners.add(activeEditor.onDidChangeDirty(() => this.titleUpdater.schedule()));
      this.activeEditorListeners.add(activeEditor.onDidChangeLabel(() => this.titleUpdater.schedule()));
    }
    if (this.titleIncludesFocusedView) {
      const activeTextEditorControl = this.editorService.activeTextEditorControl;
      const textEditorControls = [];
      if (isCodeEditor(activeTextEditorControl)) {
        textEditorControls.push(activeTextEditorControl);
      } else if (isDiffEditor(activeTextEditorControl)) {
        textEditorControls.push(activeTextEditorControl.getOriginalEditor(), activeTextEditorControl.getModifiedEditor());
      }
      for (const textEditorControl of textEditorControls) {
        this.activeEditorListeners.add(textEditorControl.onDidBlurEditorText(() => this.titleUpdater.schedule()));
        this.activeEditorListeners.add(textEditorControl.onDidFocusEditorText(() => this.titleUpdater.schedule()));
      }
    }
    if (this.titleIncludesEditorState) {
      this.activeEditorListeners.add(this.decorationsService.onDidChangeDecorations(() => this.titleUpdater.schedule()));
    }
  }
  doUpdateTitle() {
    const title = this.getFullWindowTitle();
    if (title !== this.title) {
      let nativeTitle = title;
      if (!trim(nativeTitle)) {
        nativeTitle = this.productService.nameLong;
      }
      const window = getWindowById(this.windowId, true).window;
      if (!window.document.title && isMacintosh && nativeTitle === this.productService.nameLong) {
        window.document.title = `${this.productService.nameLong} ${WindowTitle.TITLE_DIRTY}`;
      }
      window.document.title = nativeTitle;
      this.title = title;
      this.onDidChangeEmitter.fire();
    }
  }
  getFullWindowTitle() {
    const { prefix, suffix } = this.getTitleDecorations();
    let title = this.getWindowTitle() || this.productService.nameLong;
    if (prefix) {
      title = `${prefix} ${title}`;
    }
    if (suffix) {
      title = `${title} ${suffix}`;
    }
    return title.replace(/[^\S ]/g, " ");
  }
  getTitleDecorations() {
    let prefix;
    let suffix;
    if (this.properties.prefix) {
      prefix = this.properties.prefix;
    }
    if (this.environmentService.isExtensionDevelopment) {
      prefix = !prefix ? WindowTitle.NLS_EXTENSION_HOST : `${WindowTitle.NLS_EXTENSION_HOST} - ${prefix}`;
    }
    if (this.properties.isAdmin) {
      suffix = WindowTitle.NLS_USER_IS_ADMIN;
    }
    return { prefix, suffix };
  }
  updateProperties(properties) {
    const isAdmin = typeof properties.isAdmin === "boolean" ? properties.isAdmin : this.properties.isAdmin;
    const isPure = typeof properties.isPure === "boolean" ? properties.isPure : this.properties.isPure;
    const prefix = typeof properties.prefix === "string" ? properties.prefix : this.properties.prefix;
    if (isAdmin !== this.properties.isAdmin || isPure !== this.properties.isPure || prefix !== this.properties.prefix) {
      this.properties.isAdmin = isAdmin;
      this.properties.isPure = isPure;
      this.properties.prefix = prefix;
      this.titleUpdater.schedule();
    }
  }
  registerVariables(variables) {
    let changed = false;
    for (const { name, contextKey } of variables) {
      if (!this.variables.has(contextKey)) {
        this.variables.set(contextKey, name);
        changed = true;
      }
    }
    if (changed) {
      this.titleUpdater.schedule();
    }
  }
  /**
   * Possible template values:
   *
   * {activeEditorLong}: e.g. /Users/Development/myFolder/myFileFolder/myFile.txt
   * {activeEditorMedium}: e.g. myFolder/myFileFolder/myFile.txt
   * {activeEditorShort}: e.g. myFile.txt
   * {activeEditorLanguageId}: e.g. typescript
   * {activeFolderLong}: e.g. /Users/Development/myFolder/myFileFolder
   * {activeFolderMedium}: e.g. myFolder/myFileFolder
   * {activeFolderShort}: e.g. myFileFolder
   * {rootName}: e.g. myFolder1, myFolder2, myFolder3
   * {rootPath}: e.g. /Users/Development
   * {folderName}: e.g. myFolder
   * {folderPath}: e.g. /Users/Development/myFolder
   * {appName}: e.g. VS Code
   * {remoteName}: e.g. SSH
   * {dirty}: indicator
   * {focusedView}: e.g. Terminal
   * {separator}: conditional separator
   * {activeEditorState}: e.g. Modified
   */
  getWindowTitle() {
    const editor = this.editorService.activeEditor;
    const workspace = this.contextService.getWorkspace();
    let root;
    if (workspace.configuration) {
      root = workspace.configuration;
    } else if (workspace.folders.length) {
      root = workspace.folders[0].uri;
    }
    const editorResource = EditorResourceAccessor.getOriginalUri(editor, { supportSideBySide: SideBySideEditor.PRIMARY });
    let editorFolderResource = editorResource ? dirname(editorResource) : void 0;
    if (editorFolderResource?.path === ".") {
      editorFolderResource = void 0;
    }
    let folder = void 0;
    if (this.contextService.getWorkbenchState() === WorkbenchState.FOLDER) {
      folder = workspace.folders[0];
    } else if (editorResource) {
      folder = this.contextService.getWorkspaceFolder(editorResource) ?? void 0;
    }
    let remoteName = void 0;
    if (this.environmentService.remoteAuthority && !isWeb) {
      remoteName = this.labelService.getHostLabel(Schemas.vscodeRemote, this.environmentService.remoteAuthority);
    } else {
      const virtualWorkspaceLocation = getVirtualWorkspaceLocation(workspace);
      if (virtualWorkspaceLocation) {
        remoteName = this.labelService.getHostLabel(virtualWorkspaceLocation.scheme, virtualWorkspaceLocation.authority);
      }
    }
    const activeEditorShort = editor ? editor.getTitle(Verbosity.SHORT) : "";
    const activeEditorMedium = editor ? editor.getTitle(Verbosity.MEDIUM) : activeEditorShort;
    const activeEditorLong = editor ? editor.getTitle(Verbosity.LONG) : activeEditorMedium;
    const activeFolderShort = editorFolderResource ? basename(editorFolderResource) : "";
    const activeFolderMedium = editorFolderResource ? this.labelService.getUriLabel(editorFolderResource, { relative: true }) : "";
    const activeFolderLong = editorFolderResource ? this.labelService.getUriLabel(editorFolderResource) : "";
    const rootName = this.labelService.getWorkspaceLabel(workspace);
    const rootNameShort = this.labelService.getWorkspaceLabel(workspace, { verbose: LabelVerbosity.SHORT });
    const rootPath = root ? this.labelService.getUriLabel(root) : "";
    const folderName = folder ? folder.name : "";
    const folderPath = folder ? this.labelService.getUriLabel(folder.uri) : "";
    const dirty = editor?.isDirty() && !editor.isSaving() ? WindowTitle.TITLE_DIRTY : "";
    const appName = this.productService.nameLong;
    const profileName = this.userDataProfileService.currentProfile.isDefault ? "" : this.userDataProfileService.currentProfile.name;
    const focusedView = this.viewsService.getFocusedViewName();
    const activeEditorState = editorResource ? this.decorationsService.getDecoration(editorResource, false)?.tooltip : void 0;
    const activeEditorLanguageId = this.editorService.activeTextEditorLanguageId;
    const variables = {};
    for (const [contextKey, name] of this.variables) {
      variables[name] = this.contextKeyService.getContextKeyValue(contextKey) ?? "";
    }
    let titleTemplate = this.configurationService.getValue("window.title" /* title */);
    if (typeof titleTemplate !== "string") {
      titleTemplate = defaultWindowTitle;
    }
    if (!this.titleIncludesEditorState && this.accessibilityService.isScreenReaderOptimized() && this.configurationService.getValue("accessibility.windowTitleOptimized")) {
      titleTemplate += "${separator}${activeEditorState}";
    }
    let separator = this.configurationService.getValue("window.titleSeparator" /* titleSeparator */);
    if (typeof separator !== "string") {
      separator = defaultWindowTitleSeparator;
    }
    return template(titleTemplate, {
      ...variables,
      activeEditorShort,
      activeEditorLong,
      activeEditorMedium,
      activeEditorLanguageId,
      activeFolderShort,
      activeFolderMedium,
      activeFolderLong,
      rootName,
      rootPath,
      rootNameShort,
      folderName,
      folderPath,
      dirty,
      appName,
      remoteName,
      profileName,
      focusedView,
      activeEditorState,
      separator: { label: separator }
    });
  }
  isCustomTitleFormat() {
    if (this.accessibilityService.isScreenReaderOptimized() || this.titleIncludesEditorState) {
      return true;
    }
    const title = this.configurationService.inspect("window.title" /* title */);
    const titleSeparator = this.configurationService.inspect("window.titleSeparator" /* titleSeparator */);
    if (isConfigured(title) || isConfigured(titleSeparator)) {
      return true;
    }
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
    const configurationProperties = configurationRegistry.getConfigurationProperties();
    return title.defaultValue !== configurationProperties["window.title" /* title */]?.defaultDefaultValue;
  }
};
WindowTitle.NLS_USER_IS_ADMIN = isWindows ? localize("userIsAdmin", "[Administrator]") : localize("userIsSudo", "[Superuser]");
WindowTitle.NLS_EXTENSION_HOST = localize("devExtensionWindowTitlePrefix", "[Extension Development Host]");
WindowTitle.TITLE_DIRTY = "\u25CF ";
WindowTitle = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IBrowserWorkbenchEnvironmentService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, IUserDataProfileService),
  __decorateParam(8, IProductService),
  __decorateParam(9, IViewsService),
  __decorateParam(10, IDecorationsService),
  __decorateParam(11, IAccessibilityService)
], WindowTitle);
export {
  WindowTitle,
  defaultWindowTitle,
  defaultWindowTitleSeparator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL3RpdGxlYmFyL3dpbmRvd1RpdGxlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgZGlybmFtZSwgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSVRpdGxlUHJvcGVydGllcywgSVRpdGxlVmFyaWFibGUgfSBmcm9tICcuL3RpdGxlYmFyUGFydC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UsIElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIGlzQ29uZmlndXJlZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgVmVyYm9zaXR5LCBTaWRlQnlTaWRlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJQnJvd3NlcldvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2Jyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUsIElXb3Jrc3BhY2VGb2xkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MsIGlzV2ViLCBpc01hY2ludG9zaCwgaXNOYXRpdmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgdHJpbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgdGVtcGxhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYWJlbHMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSwgVmVyYm9zaXR5IGFzIExhYmVsVmVyYm9zaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgZ2V0VmlydHVhbFdvcmtzcGFjZUxvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi92aXJ0dWFsV29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIGlzQ29kZUVkaXRvciwgaXNEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IGdldFdpbmRvd0J5SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENvZGVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IElEZWNvcmF0aW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9kZWNvcmF0aW9ucy9jb21tb24vZGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgSUFjY2Vzc2liaWxpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9jb21tb24vYWNjZXNzaWJpbGl0eS5qcyc7XG5cbmNvbnN0IGVudW0gV2luZG93U2V0dGluZ05hbWVzIHtcblx0dGl0bGVTZXBhcmF0b3IgPSAnd2luZG93LnRpdGxlU2VwYXJhdG9yJyxcblx0dGl0bGUgPSAnd2luZG93LnRpdGxlJyxcbn1cblxuZXhwb3J0IGNvbnN0IGRlZmF1bHRXaW5kb3dUaXRsZSA9ICgoKSA9PiB7XG5cdGlmIChpc01hY2ludG9zaCAmJiBpc05hdGl2ZSkge1xuXHRcdHJldHVybiAnJHthY3RpdmVFZGl0b3JTaG9ydH0ke3NlcGFyYXRvcn0ke3Jvb3ROYW1lfSR7c2VwYXJhdG9yfSR7cHJvZmlsZU5hbWV9JzsgLy8gbWFjT1MgaGFzIG5hdGl2ZSBkaXJ0eSBpbmRpY2F0b3Jcblx0fVxuXG5cdGNvbnN0IGJhc2UgPSAnJHtkaXJ0eX0ke2FjdGl2ZUVkaXRvclNob3J0fSR7c2VwYXJhdG9yfSR7cm9vdE5hbWV9JHtzZXBhcmF0b3J9JHtwcm9maWxlTmFtZX0ke3NlcGFyYXRvcn0ke2FwcE5hbWV9Jztcblx0aWYgKGlzV2ViKSB7XG5cdFx0cmV0dXJuIGJhc2UgKyAnJHtzZXBhcmF0b3J9JHtyZW1vdGVOYW1lfSc7IC8vIFdlYjogYWx3YXlzIHNob3cgcmVtb3RlIG5hbWVcblx0fVxuXG5cdHJldHVybiBiYXNlO1xufSkoKTtcbmV4cG9ydCBjb25zdCBkZWZhdWx0V2luZG93VGl0bGVTZXBhcmF0b3IgPSBpc01hY2ludG9zaCA/ICcgXFx1MjAxNCAnIDogJyAtICc7XG5cbmV4cG9ydCBjbGFzcyBXaW5kb3dUaXRsZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE5MU19VU0VSX0lTX0FETUlOID0gaXNXaW5kb3dzID8gbG9jYWxpemUoJ3VzZXJJc0FkbWluJywgXCJbQWRtaW5pc3RyYXRvcl1cIikgOiBsb2NhbGl6ZSgndXNlcklzU3VkbycsIFwiW1N1cGVydXNlcl1cIik7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE5MU19FWFRFTlNJT05fSE9TVCA9IGxvY2FsaXplKCdkZXZFeHRlbnNpb25XaW5kb3dUaXRsZVByZWZpeCcsIFwiW0V4dGVuc2lvbiBEZXZlbG9wbWVudCBIb3N0XVwiKTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVElUTEVfRElSVFkgPSAnXFx1MjVjZiAnO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvcGVydGllczogSVRpdGxlUHJvcGVydGllcyA9IHsgaXNQdXJlOiB0cnVlLCBpc0FkbWluOiBmYWxzZSwgcHJlZml4OiB1bmRlZmluZWQgfTtcblx0cHJpdmF0ZSByZWFkb25seSB2YXJpYWJsZXMgPSBuZXcgTWFwPHN0cmluZyAvKiBjb250ZXh0IGtleSAqLywgc3RyaW5nIC8qIG5hbWUgKi8+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVFZGl0b3JMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHRpdGxlVXBkYXRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuZG9VcGRhdGVUaXRsZSgpLCAwKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZENoYW5nZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2UgPSB0aGlzLm9uRGlkQ2hhbmdlRW1pdHRlci5ldmVudDtcblxuXHRnZXQgdmFsdWUoKSB7IHJldHVybiB0aGlzLnRpdGxlID8/ICcnOyB9XG5cdGdldCB3b3Jrc3BhY2VOYW1lKCkgeyByZXR1cm4gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0V29ya3NwYWNlTGFiZWwodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKSk7IH1cblx0Z2V0IGZpbGVOYW1lKCkge1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3IpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGZpbGVOYW1lID0gYWN0aXZlRWRpdG9yLmdldFRpdGxlKFZlcmJvc2l0eS5TSE9SVCk7XG5cdFx0Y29uc3QgZGlydHkgPSBhY3RpdmVFZGl0b3I/LmlzRGlydHkoKSAmJiAhYWN0aXZlRWRpdG9yLmlzU2F2aW5nKCkgPyBXaW5kb3dUaXRsZS5USVRMRV9ESVJUWSA6ICcnO1xuXHRcdHJldHVybiBgJHtkaXJ0eX0ke2ZpbGVOYW1lfWA7XG5cdH1cblxuXHRwcml2YXRlIHRpdGxlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSB0aXRsZUluY2x1ZGVzRm9jdXNlZFZpZXc6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSB0aXRsZUluY2x1ZGVzRWRpdG9yU3RhdGU6IGJvb2xlYW4gPSBmYWxzZTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHdpbmRvd0lkOiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dGFyZ2V0V2luZG93OiBDb2RlV2luZG93LFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZVNlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHRcdEBJRGVjb3JhdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVjb3JhdGlvbnNTZXJ2aWNlOiBJRGVjb3JhdGlvbnNTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLndpbmRvd0lkID0gdGFyZ2V0V2luZG93LnZzY29kZVdpbmRvd0lkO1xuXG5cdFx0dGhpcy5jaGVja1RpdGxlVmFyaWFibGVzKCk7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4gdGhpcy5vbkNvbmZpZ3VyYXRpb25DaGFuZ2VkKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCgpID0+IHRoaXMub25BY3RpdmVFZGl0b3JDaGFuZ2UoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCgpID0+IHRoaXMudGl0bGVVcGRhdGVyLnNjaGVkdWxlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUoKCkgPT4gdGhpcy50aXRsZVVwZGF0ZXIuc2NoZWR1bGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VOYW1lKCgpID0+IHRoaXMudGl0bGVVcGRhdGVyLnNjaGVkdWxlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxhYmVsU2VydmljZS5vbkRpZENoYW5nZUZvcm1hdHRlcnMoKCkgPT4gdGhpcy50aXRsZVVwZGF0ZXIuc2NoZWR1bGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5vbkRpZENoYW5nZUN1cnJlbnRQcm9maWxlKCgpID0+IHRoaXMudGl0bGVVcGRhdGVyLnNjaGVkdWxlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdzU2VydmljZS5vbkRpZENoYW5nZUZvY3VzZWRWaWV3KCgpID0+IHtcblx0XHRcdGlmICh0aGlzLnRpdGxlSW5jbHVkZXNGb2N1c2VkVmlldykge1xuXHRcdFx0XHR0aGlzLnRpdGxlVXBkYXRlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKHRoaXMudmFyaWFibGVzKSkge1xuXHRcdFx0XHR0aGlzLnRpdGxlVXBkYXRlci5zY2hlZHVsZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLm9uRGlkQ2hhbmdlU2NyZWVuUmVhZGVyT3B0aW1pemVkKCgpID0+IHRoaXMudGl0bGVVcGRhdGVyLnNjaGVkdWxlKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgb25Db25maWd1cmF0aW9uQ2hhbmdlZChldmVudDogSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGFmZmVjdHNUaXRsZUNvbmZpZ3VyYXRpb24gPSBldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbihXaW5kb3dTZXR0aW5nTmFtZXMudGl0bGUpO1xuXHRcdGlmIChhZmZlY3RzVGl0bGVDb25maWd1cmF0aW9uKSB7XG5cdFx0XHR0aGlzLmNoZWNrVGl0bGVWYXJpYWJsZXMoKTtcblx0XHR9XG5cblx0XHRpZiAoYWZmZWN0c1RpdGxlQ29uZmlndXJhdGlvbiB8fCBldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbihXaW5kb3dTZXR0aW5nTmFtZXMudGl0bGVTZXBhcmF0b3IpKSB7XG5cdFx0XHR0aGlzLnRpdGxlVXBkYXRlci5zY2hlZHVsZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2hlY2tUaXRsZVZhcmlhYmxlcygpOiB2b2lkIHtcblx0XHRjb25zdCB0aXRsZVRlbXBsYXRlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx1bmtub3duPihXaW5kb3dTZXR0aW5nTmFtZXMudGl0bGUpO1xuXHRcdGlmICh0eXBlb2YgdGl0bGVUZW1wbGF0ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMudGl0bGVJbmNsdWRlc0ZvY3VzZWRWaWV3ID0gdGl0bGVUZW1wbGF0ZS5pbmNsdWRlcygnJHtmb2N1c2VkVmlld30nKTtcblx0XHRcdHRoaXMudGl0bGVJbmNsdWRlc0VkaXRvclN0YXRlID0gdGl0bGVUZW1wbGF0ZS5pbmNsdWRlcygnJHthY3RpdmVFZGl0b3JTdGF0ZX0nKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uQWN0aXZlRWRpdG9yQ2hhbmdlKCk6IHZvaWQge1xuXG5cdFx0Ly8gRGlzcG9zZSBvbGQgbGlzdGVuZXJzXG5cdFx0dGhpcy5hY3RpdmVFZGl0b3JMaXN0ZW5lcnMuY2xlYXIoKTtcblxuXHRcdC8vIENhbGN1bGF0ZSBOZXcgV2luZG93IFRpdGxlXG5cdFx0dGhpcy50aXRsZVVwZGF0ZXIuc2NoZWR1bGUoKTtcblxuXHRcdC8vIEFwcGx5IGxpc3RlbmVyIGZvciBkaXJ0eSBhbmQgbGFiZWwgY2hhbmdlc1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvciA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3I7XG5cdFx0aWYgKGFjdGl2ZUVkaXRvcikge1xuXHRcdFx0dGhpcy5hY3RpdmVFZGl0b3JMaXN0ZW5lcnMuYWRkKGFjdGl2ZUVkaXRvci5vbkRpZENoYW5nZURpcnR5KCgpID0+IHRoaXMudGl0bGVVcGRhdGVyLnNjaGVkdWxlKCkpKTtcblx0XHRcdHRoaXMuYWN0aXZlRWRpdG9yTGlzdGVuZXJzLmFkZChhY3RpdmVFZGl0b3Iub25EaWRDaGFuZ2VMYWJlbCgoKSA9PiB0aGlzLnRpdGxlVXBkYXRlci5zY2hlZHVsZSgpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQXBwbHkgbGlzdGVuZXJzIGZvciB0cmFja2luZyBmb2N1c2VkIGNvZGUgZWRpdG9yXG5cdFx0aWYgKHRoaXMudGl0bGVJbmNsdWRlc0ZvY3VzZWRWaWV3KSB7XG5cdFx0XHRjb25zdCBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCA9IHRoaXMuZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblx0XHRcdGNvbnN0IHRleHRFZGl0b3JDb250cm9sczogSUNvZGVFZGl0b3JbXSA9IFtdO1xuXHRcdFx0aWYgKGlzQ29kZUVkaXRvcihhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCkpIHtcblx0XHRcdFx0dGV4dEVkaXRvckNvbnRyb2xzLnB1c2goYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpO1xuXHRcdFx0fSBlbHNlIGlmIChpc0RpZmZFZGl0b3IoYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpKSB7XG5cdFx0XHRcdHRleHRFZGl0b3JDb250cm9scy5wdXNoKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldE9yaWdpbmFsRWRpdG9yKCksIGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldE1vZGlmaWVkRWRpdG9yKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IHRleHRFZGl0b3JDb250cm9sIG9mIHRleHRFZGl0b3JDb250cm9scykge1xuXHRcdFx0XHR0aGlzLmFjdGl2ZUVkaXRvckxpc3RlbmVycy5hZGQodGV4dEVkaXRvckNvbnRyb2wub25EaWRCbHVyRWRpdG9yVGV4dCgoKSA9PiB0aGlzLnRpdGxlVXBkYXRlci5zY2hlZHVsZSgpKSk7XG5cdFx0XHRcdHRoaXMuYWN0aXZlRWRpdG9yTGlzdGVuZXJzLmFkZCh0ZXh0RWRpdG9yQ29udHJvbC5vbkRpZEZvY3VzRWRpdG9yVGV4dCgoKSA9PiB0aGlzLnRpdGxlVXBkYXRlci5zY2hlZHVsZSgpKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQXBwbHkgbGlzdGVuZXIgZm9yIGRlY29yYXRpb25zIHRvIHRyYWNrIGVkaXRvciBzdGF0ZVxuXHRcdGlmICh0aGlzLnRpdGxlSW5jbHVkZXNFZGl0b3JTdGF0ZSkge1xuXHRcdFx0dGhpcy5hY3RpdmVFZGl0b3JMaXN0ZW5lcnMuYWRkKHRoaXMuZGVjb3JhdGlvbnNTZXJ2aWNlLm9uRGlkQ2hhbmdlRGVjb3JhdGlvbnMoKCkgPT4gdGhpcy50aXRsZVVwZGF0ZXIuc2NoZWR1bGUoKSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZG9VcGRhdGVUaXRsZSgpOiB2b2lkIHtcblx0XHRjb25zdCB0aXRsZSA9IHRoaXMuZ2V0RnVsbFdpbmRvd1RpdGxlKCk7XG5cdFx0aWYgKHRpdGxlICE9PSB0aGlzLnRpdGxlKSB7XG5cblx0XHRcdC8vIEFsd2F5cyBzZXQgdGhlIG5hdGl2ZSB3aW5kb3cgdGl0bGUgdG8gaWRlbnRpZnkgdXMgcHJvcGVybHkgdG8gdGhlIE9TXG5cdFx0XHRsZXQgbmF0aXZlVGl0bGUgPSB0aXRsZTtcblx0XHRcdGlmICghdHJpbShuYXRpdmVUaXRsZSkpIHtcblx0XHRcdFx0bmF0aXZlVGl0bGUgPSB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB3aW5kb3cgPSBnZXRXaW5kb3dCeUlkKHRoaXMud2luZG93SWQsIHRydWUpLndpbmRvdztcblx0XHRcdGlmICghd2luZG93LmRvY3VtZW50LnRpdGxlICYmIGlzTWFjaW50b3NoICYmIG5hdGl2ZVRpdGxlID09PSB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nKSB7XG5cdFx0XHRcdC8vIFRPRE9AZWxlY3Ryb24gbWFjT1M6IGlmIHdlIHNldCBhIHdpbmRvdyB0aXRsZSBmb3Jcblx0XHRcdFx0Ly8gdGhlIGZpcnN0IHRpbWUgYW5kIGl0IG1hdGNoZXMgdGhlIG9uZSB3ZSBzZXQgaW5cblx0XHRcdFx0Ly8gYHdpbmRvd0ltcGwudHNgIHNvbWVob3cgdGhlIHdpbmRvdyBkb2VzIG5vdCBhcHBlYXJcblx0XHRcdFx0Ly8gaW4gdGhlIFwiV2luZG93c1wiIG1lbnUuIEFzIHN1Y2gsIHdlIHNldCB0aGUgdGl0bGVcblx0XHRcdFx0Ly8gYnJpZWZseSB0byBzb21ldGhpbmcgZGlmZmVyZW50IHRvIGVuc3VyZSBtYWNPU1xuXHRcdFx0XHQvLyByZWNvZ25pemVzIHdlIGhhdmUgYSB3aW5kb3cuXG5cdFx0XHRcdC8vIFNlZTogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzE5MTI4OFxuXHRcdFx0XHR3aW5kb3cuZG9jdW1lbnQudGl0bGUgPSBgJHt0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nfSAke1dpbmRvd1RpdGxlLlRJVExFX0RJUlRZfWA7XG5cdFx0XHR9XG5cblx0XHRcdHdpbmRvdy5kb2N1bWVudC50aXRsZSA9IG5hdGl2ZVRpdGxlO1xuXHRcdFx0dGhpcy50aXRsZSA9IHRpdGxlO1xuXG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlRW1pdHRlci5maXJlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRGdWxsV2luZG93VGl0bGUoKTogc3RyaW5nIHtcblx0XHRjb25zdCB7IHByZWZpeCwgc3VmZml4IH0gPSB0aGlzLmdldFRpdGxlRGVjb3JhdGlvbnMoKTtcblxuXHRcdGxldCB0aXRsZSA9IHRoaXMuZ2V0V2luZG93VGl0bGUoKSB8fCB0aGlzLnByb2R1Y3RTZXJ2aWNlLm5hbWVMb25nO1xuXHRcdGlmIChwcmVmaXgpIHtcblx0XHRcdHRpdGxlID0gYCR7cHJlZml4fSAke3RpdGxlfWA7XG5cdFx0fVxuXG5cdFx0aWYgKHN1ZmZpeCkge1xuXHRcdFx0dGl0bGUgPSBgJHt0aXRsZX0gJHtzdWZmaXh9YDtcblx0XHR9XG5cblx0XHQvLyBSZXBsYWNlIG5vbi1zcGFjZSB3aGl0ZXNwYWNlXG5cdFx0cmV0dXJuIHRpdGxlLnJlcGxhY2UoL1teXFxTIF0vZywgJyAnKTtcblx0fVxuXG5cdGdldFRpdGxlRGVjb3JhdGlvbnMoKSB7XG5cdFx0bGV0IHByZWZpeDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBzdWZmaXg6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdGlmICh0aGlzLnByb3BlcnRpZXMucHJlZml4KSB7XG5cdFx0XHRwcmVmaXggPSB0aGlzLnByb3BlcnRpZXMucHJlZml4O1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0V4dGVuc2lvbkRldmVsb3BtZW50KSB7XG5cdFx0XHRwcmVmaXggPSAhcHJlZml4XG5cdFx0XHRcdD8gV2luZG93VGl0bGUuTkxTX0VYVEVOU0lPTl9IT1NUXG5cdFx0XHRcdDogYCR7V2luZG93VGl0bGUuTkxTX0VYVEVOU0lPTl9IT1NUfSAtICR7cHJlZml4fWA7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMucHJvcGVydGllcy5pc0FkbWluKSB7XG5cdFx0XHRzdWZmaXggPSBXaW5kb3dUaXRsZS5OTFNfVVNFUl9JU19BRE1JTjtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBwcmVmaXgsIHN1ZmZpeCB9O1xuXHR9XG5cblx0dXBkYXRlUHJvcGVydGllcyhwcm9wZXJ0aWVzOiBJVGl0bGVQcm9wZXJ0aWVzKTogdm9pZCB7XG5cdFx0Y29uc3QgaXNBZG1pbiA9IHR5cGVvZiBwcm9wZXJ0aWVzLmlzQWRtaW4gPT09ICdib29sZWFuJyA/IHByb3BlcnRpZXMuaXNBZG1pbiA6IHRoaXMucHJvcGVydGllcy5pc0FkbWluO1xuXHRcdGNvbnN0IGlzUHVyZSA9IHR5cGVvZiBwcm9wZXJ0aWVzLmlzUHVyZSA9PT0gJ2Jvb2xlYW4nID8gcHJvcGVydGllcy5pc1B1cmUgOiB0aGlzLnByb3BlcnRpZXMuaXNQdXJlO1xuXHRcdGNvbnN0IHByZWZpeCA9IHR5cGVvZiBwcm9wZXJ0aWVzLnByZWZpeCA9PT0gJ3N0cmluZycgPyBwcm9wZXJ0aWVzLnByZWZpeCA6IHRoaXMucHJvcGVydGllcy5wcmVmaXg7XG5cblx0XHRpZiAoaXNBZG1pbiAhPT0gdGhpcy5wcm9wZXJ0aWVzLmlzQWRtaW4gfHwgaXNQdXJlICE9PSB0aGlzLnByb3BlcnRpZXMuaXNQdXJlIHx8IHByZWZpeCAhPT0gdGhpcy5wcm9wZXJ0aWVzLnByZWZpeCkge1xuXHRcdFx0dGhpcy5wcm9wZXJ0aWVzLmlzQWRtaW4gPSBpc0FkbWluO1xuXHRcdFx0dGhpcy5wcm9wZXJ0aWVzLmlzUHVyZSA9IGlzUHVyZTtcblx0XHRcdHRoaXMucHJvcGVydGllcy5wcmVmaXggPSBwcmVmaXg7XG5cblx0XHRcdHRoaXMudGl0bGVVcGRhdGVyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHR9XG5cblx0cmVnaXN0ZXJWYXJpYWJsZXModmFyaWFibGVzOiBJVGl0bGVWYXJpYWJsZVtdKTogdm9pZCB7XG5cdFx0bGV0IGNoYW5nZWQgPSBmYWxzZTtcblxuXHRcdGZvciAoY29uc3QgeyBuYW1lLCBjb250ZXh0S2V5IH0gb2YgdmFyaWFibGVzKSB7XG5cdFx0XHRpZiAoIXRoaXMudmFyaWFibGVzLmhhcyhjb250ZXh0S2V5KSkge1xuXHRcdFx0XHR0aGlzLnZhcmlhYmxlcy5zZXQoY29udGV4dEtleSwgbmFtZSk7XG5cblx0XHRcdFx0Y2hhbmdlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGNoYW5nZWQpIHtcblx0XHRcdHRoaXMudGl0bGVVcGRhdGVyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFBvc3NpYmxlIHRlbXBsYXRlIHZhbHVlczpcblx0ICpcblx0ICoge2FjdGl2ZUVkaXRvckxvbmd9OiBlLmcuIC9Vc2Vycy9EZXZlbG9wbWVudC9teUZvbGRlci9teUZpbGVGb2xkZXIvbXlGaWxlLnR4dFxuXHQgKiB7YWN0aXZlRWRpdG9yTWVkaXVtfTogZS5nLiBteUZvbGRlci9teUZpbGVGb2xkZXIvbXlGaWxlLnR4dFxuXHQgKiB7YWN0aXZlRWRpdG9yU2hvcnR9OiBlLmcuIG15RmlsZS50eHRcblx0ICoge2FjdGl2ZUVkaXRvckxhbmd1YWdlSWR9OiBlLmcuIHR5cGVzY3JpcHRcblx0ICoge2FjdGl2ZUZvbGRlckxvbmd9OiBlLmcuIC9Vc2Vycy9EZXZlbG9wbWVudC9teUZvbGRlci9teUZpbGVGb2xkZXJcblx0ICoge2FjdGl2ZUZvbGRlck1lZGl1bX06IGUuZy4gbXlGb2xkZXIvbXlGaWxlRm9sZGVyXG5cdCAqIHthY3RpdmVGb2xkZXJTaG9ydH06IGUuZy4gbXlGaWxlRm9sZGVyXG5cdCAqIHtyb290TmFtZX06IGUuZy4gbXlGb2xkZXIxLCBteUZvbGRlcjIsIG15Rm9sZGVyM1xuXHQgKiB7cm9vdFBhdGh9OiBlLmcuIC9Vc2Vycy9EZXZlbG9wbWVudFxuXHQgKiB7Zm9sZGVyTmFtZX06IGUuZy4gbXlGb2xkZXJcblx0ICoge2ZvbGRlclBhdGh9OiBlLmcuIC9Vc2Vycy9EZXZlbG9wbWVudC9teUZvbGRlclxuXHQgKiB7YXBwTmFtZX06IGUuZy4gVlMgQ29kZVxuXHQgKiB7cmVtb3RlTmFtZX06IGUuZy4gU1NIXG5cdCAqIHtkaXJ0eX06IGluZGljYXRvclxuXHQgKiB7Zm9jdXNlZFZpZXd9OiBlLmcuIFRlcm1pbmFsXG5cdCAqIHtzZXBhcmF0b3J9OiBjb25kaXRpb25hbCBzZXBhcmF0b3Jcblx0ICoge2FjdGl2ZUVkaXRvclN0YXRlfTogZS5nLiBNb2RpZmllZFxuXHQgKi9cblx0Z2V0V2luZG93VGl0bGUoKTogc3RyaW5nIHtcblx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCk7XG5cblx0XHQvLyBDb21wdXRlIHJvb3Rcblx0XHRsZXQgcm9vdDogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGlmICh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbikge1xuXHRcdFx0cm9vdCA9IHdvcmtzcGFjZS5jb25maWd1cmF0aW9uO1xuXHRcdH0gZWxzZSBpZiAod29ya3NwYWNlLmZvbGRlcnMubGVuZ3RoKSB7XG5cdFx0XHRyb290ID0gd29ya3NwYWNlLmZvbGRlcnNbMF0udXJpO1xuXHRcdH1cblxuXHRcdC8vIENvbXB1dGUgYWN0aXZlIGVkaXRvciBmb2xkZXJcblx0XHRjb25zdCBlZGl0b3JSZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yLCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0bGV0IGVkaXRvckZvbGRlclJlc291cmNlID0gZWRpdG9yUmVzb3VyY2UgPyBkaXJuYW1lKGVkaXRvclJlc291cmNlKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoZWRpdG9yRm9sZGVyUmVzb3VyY2U/LnBhdGggPT09ICcuJykge1xuXHRcdFx0ZWRpdG9yRm9sZGVyUmVzb3VyY2UgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ29tcHV0ZSBmb2xkZXIgcmVzb3VyY2Vcblx0XHQvLyBTaW5nbGUgUm9vdCBXb3Jrc3BhY2U6IGFsd2F5cyB0aGUgcm9vdCBzaW5nbGUgd29ya3NwYWNlIGluIHRoaXMgY2FzZVxuXHRcdC8vIE90aGVyd2lzZTogcm9vdCBmb2xkZXIgb2YgdGhlIGN1cnJlbnRseSBhY3RpdmUgZmlsZSBpZiBhbnlcblx0XHRsZXQgZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkZPTERFUikge1xuXHRcdFx0Zm9sZGVyID0gd29ya3NwYWNlLmZvbGRlcnNbMF07XG5cdFx0fSBlbHNlIGlmIChlZGl0b3JSZXNvdXJjZSkge1xuXHRcdFx0Zm9sZGVyID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIoZWRpdG9yUmVzb3VyY2UpID8/IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBDb21wdXRlIHJlbW90ZVxuXHRcdC8vIHZzY29kZS1yZW10b2U6IHVzZSBhcyBpc1xuXHRcdC8vIG90aGVyd2lzZSBmaWd1cmUgb3V0IGlmIHdlIGhhdmUgYSB2aXJ0dWFsIGZvbGRlciBvcGVuZWRcblx0XHRsZXQgcmVtb3RlTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkgJiYgIWlzV2ViKSB7XG5cdFx0XHRyZW1vdGVOYW1lID0gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0SG9zdExhYmVsKFNjaGVtYXMudnNjb2RlUmVtb3RlLCB0aGlzLmVudmlyb25tZW50U2VydmljZS5yZW1vdGVBdXRob3JpdHkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB2aXJ0dWFsV29ya3NwYWNlTG9jYXRpb24gPSBnZXRWaXJ0dWFsV29ya3NwYWNlTG9jYXRpb24od29ya3NwYWNlKTtcblx0XHRcdGlmICh2aXJ0dWFsV29ya3NwYWNlTG9jYXRpb24pIHtcblx0XHRcdFx0cmVtb3RlTmFtZSA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldEhvc3RMYWJlbCh2aXJ0dWFsV29ya3NwYWNlTG9jYXRpb24uc2NoZW1lLCB2aXJ0dWFsV29ya3NwYWNlTG9jYXRpb24uYXV0aG9yaXR5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBWYXJpYWJsZXNcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JTaG9ydCA9IGVkaXRvciA/IGVkaXRvci5nZXRUaXRsZShWZXJib3NpdHkuU0hPUlQpIDogJyc7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yTWVkaXVtID0gZWRpdG9yID8gZWRpdG9yLmdldFRpdGxlKFZlcmJvc2l0eS5NRURJVU0pIDogYWN0aXZlRWRpdG9yU2hvcnQ7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yTG9uZyA9IGVkaXRvciA/IGVkaXRvci5nZXRUaXRsZShWZXJib3NpdHkuTE9ORykgOiBhY3RpdmVFZGl0b3JNZWRpdW07XG5cdFx0Y29uc3QgYWN0aXZlRm9sZGVyU2hvcnQgPSBlZGl0b3JGb2xkZXJSZXNvdXJjZSA/IGJhc2VuYW1lKGVkaXRvckZvbGRlclJlc291cmNlKSA6ICcnO1xuXHRcdGNvbnN0IGFjdGl2ZUZvbGRlck1lZGl1bSA9IGVkaXRvckZvbGRlclJlc291cmNlID8gdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZWRpdG9yRm9sZGVyUmVzb3VyY2UsIHsgcmVsYXRpdmU6IHRydWUgfSkgOiAnJztcblx0XHRjb25zdCBhY3RpdmVGb2xkZXJMb25nID0gZWRpdG9yRm9sZGVyUmVzb3VyY2UgPyB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChlZGl0b3JGb2xkZXJSZXNvdXJjZSkgOiAnJztcblx0XHRjb25zdCByb290TmFtZSA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFdvcmtzcGFjZUxhYmVsKHdvcmtzcGFjZSk7XG5cdFx0Y29uc3Qgcm9vdE5hbWVTaG9ydCA9IHRoaXMubGFiZWxTZXJ2aWNlLmdldFdvcmtzcGFjZUxhYmVsKHdvcmtzcGFjZSwgeyB2ZXJib3NlOiBMYWJlbFZlcmJvc2l0eS5TSE9SVCB9KTtcblx0XHRjb25zdCByb290UGF0aCA9IHJvb3QgPyB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChyb290KSA6ICcnO1xuXHRcdGNvbnN0IGZvbGRlck5hbWUgPSBmb2xkZXIgPyBmb2xkZXIubmFtZSA6ICcnO1xuXHRcdGNvbnN0IGZvbGRlclBhdGggPSBmb2xkZXIgPyB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbChmb2xkZXIudXJpKSA6ICcnO1xuXHRcdGNvbnN0IGRpcnR5ID0gZWRpdG9yPy5pc0RpcnR5KCkgJiYgIWVkaXRvci5pc1NhdmluZygpID8gV2luZG93VGl0bGUuVElUTEVfRElSVFkgOiAnJztcblx0XHRjb25zdCBhcHBOYW1lID0gdGhpcy5wcm9kdWN0U2VydmljZS5uYW1lTG9uZztcblx0XHRjb25zdCBwcm9maWxlTmFtZSA9IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5pc0RlZmF1bHQgPyAnJyA6IHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5uYW1lO1xuXHRcdGNvbnN0IGZvY3VzZWRWaWV3OiBzdHJpbmcgPSB0aGlzLnZpZXdzU2VydmljZS5nZXRGb2N1c2VkVmlld05hbWUoKTtcblx0XHRjb25zdCBhY3RpdmVFZGl0b3JTdGF0ZSA9IGVkaXRvclJlc291cmNlID8gdGhpcy5kZWNvcmF0aW9uc1NlcnZpY2UuZ2V0RGVjb3JhdGlvbihlZGl0b3JSZXNvdXJjZSwgZmFsc2UpPy50b29sdGlwIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvckxhbmd1YWdlSWQgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckxhbmd1YWdlSWQ7XG5cblx0XHRjb25zdCB2YXJpYWJsZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IFtjb250ZXh0S2V5LCBuYW1lXSBvZiB0aGlzLnZhcmlhYmxlcykge1xuXHRcdFx0dmFyaWFibGVzW25hbWVdID0gdGhpcy5jb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoY29udGV4dEtleSkgPz8gJyc7XG5cdFx0fVxuXG5cdFx0bGV0IHRpdGxlVGVtcGxhdGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oV2luZG93U2V0dGluZ05hbWVzLnRpdGxlKTtcblx0XHRpZiAodHlwZW9mIHRpdGxlVGVtcGxhdGUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aXRsZVRlbXBsYXRlID0gZGVmYXVsdFdpbmRvd1RpdGxlO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy50aXRsZUluY2x1ZGVzRWRpdG9yU3RhdGUgJiYgdGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpICYmIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2FjY2Vzc2liaWxpdHkud2luZG93VGl0bGVPcHRpbWl6ZWQnKSkge1xuXHRcdFx0dGl0bGVUZW1wbGF0ZSArPSAnJHtzZXBhcmF0b3J9JHthY3RpdmVFZGl0b3JTdGF0ZX0nO1xuXHRcdH1cblxuXHRcdGxldCBzZXBhcmF0b3IgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oV2luZG93U2V0dGluZ05hbWVzLnRpdGxlU2VwYXJhdG9yKTtcblx0XHRpZiAodHlwZW9mIHNlcGFyYXRvciAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHNlcGFyYXRvciA9IGRlZmF1bHRXaW5kb3dUaXRsZVNlcGFyYXRvcjtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGVtcGxhdGUodGl0bGVUZW1wbGF0ZSwge1xuXHRcdFx0Li4udmFyaWFibGVzLFxuXHRcdFx0YWN0aXZlRWRpdG9yU2hvcnQsXG5cdFx0XHRhY3RpdmVFZGl0b3JMb25nLFxuXHRcdFx0YWN0aXZlRWRpdG9yTWVkaXVtLFxuXHRcdFx0YWN0aXZlRWRpdG9yTGFuZ3VhZ2VJZCxcblx0XHRcdGFjdGl2ZUZvbGRlclNob3J0LFxuXHRcdFx0YWN0aXZlRm9sZGVyTWVkaXVtLFxuXHRcdFx0YWN0aXZlRm9sZGVyTG9uZyxcblx0XHRcdHJvb3ROYW1lLFxuXHRcdFx0cm9vdFBhdGgsXG5cdFx0XHRyb290TmFtZVNob3J0LFxuXHRcdFx0Zm9sZGVyTmFtZSxcblx0XHRcdGZvbGRlclBhdGgsXG5cdFx0XHRkaXJ0eSxcblx0XHRcdGFwcE5hbWUsXG5cdFx0XHRyZW1vdGVOYW1lLFxuXHRcdFx0cHJvZmlsZU5hbWUsXG5cdFx0XHRmb2N1c2VkVmlldyxcblx0XHRcdGFjdGl2ZUVkaXRvclN0YXRlLFxuXHRcdFx0c2VwYXJhdG9yOiB7IGxhYmVsOiBzZXBhcmF0b3IgfVxuXHRcdH0pO1xuXHR9XG5cblx0aXNDdXN0b21UaXRsZUZvcm1hdCgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc1NjcmVlblJlYWRlck9wdGltaXplZCgpIHx8IHRoaXMudGl0bGVJbmNsdWRlc0VkaXRvclN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3QgdGl0bGUgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8c3RyaW5nPihXaW5kb3dTZXR0aW5nTmFtZXMudGl0bGUpO1xuXHRcdGNvbnN0IHRpdGxlU2VwYXJhdG9yID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0PHN0cmluZz4oV2luZG93U2V0dGluZ05hbWVzLnRpdGxlU2VwYXJhdG9yKTtcblxuXHRcdGlmIChpc0NvbmZpZ3VyZWQodGl0bGUpIHx8IGlzQ29uZmlndXJlZCh0aXRsZVNlcGFyYXRvcikpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoZSBkZWZhdWx0IHZhbHVlIGlzIG92ZXJyaWRkZW4gZnJvbSB0aGUgY29uZmlndXJhdGlvbiByZWdpc3RyeVxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzID0gY29uZmlndXJhdGlvblJlZ2lzdHJ5LmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cdFx0cmV0dXJuIHRpdGxlLmRlZmF1bHRWYWx1ZSAhPT0gY29uZmlndXJhdGlvblByb3BlcnRpZXNbV2luZG93U2V0dGluZ05hbWVzLnRpdGxlXT8uZGVmYXVsdERlZmF1bHRWYWx1ZTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFNBQVMsZ0JBQWdCO0FBRWxDLFNBQVMsdUJBQWtELG9CQUFvQjtBQUMvRSxTQUFTLGNBQWMsK0JBQXVEO0FBQzlFLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyx3QkFBd0IsV0FBVyx3QkFBd0I7QUFDcEUsU0FB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
