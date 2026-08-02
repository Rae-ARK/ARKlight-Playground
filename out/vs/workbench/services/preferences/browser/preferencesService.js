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
import { getErrorMessage } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { parse } from "../../../../base/common/json.js";
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import * as network from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { CoreEditingCommands } from "../../../../editor/browser/coreCommands.js";
import { getCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import * as nls from "../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions, getDefaultValue, OVERRIDE_PROPERTY_REGEX } from "../../../../platform/configuration/common/configurationRegistry.js";
import { FileOperationResult } from "../../../../platform/files/common/files.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { DEFAULT_EDITOR_ASSOCIATION } from "../../../common/editor.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { IJSONEditingService } from "../../configuration/common/jsonEditing.js";
import { GroupDirection, IEditorGroupsService } from "../../editor/common/editorGroupsService.js";
import { ACTIVE_GROUP, IEditorService, MODAL_GROUP, SIDE_GROUP } from "../../editor/common/editorService.js";
import { KeybindingsEditorInput } from "./keybindingsEditorInput.js";
import { DEFAULT_SETTINGS_EDITOR_SETTING, FOLDER_SETTINGS_PATH, IPreferencesService, SETTINGS_AUTHORITY, USE_SPLIT_JSON_SETTING, validateSettingsEditorOptions } from "../common/preferences.js";
import { PreferencesEditorInput, SettingsEditor2Input } from "../common/preferencesEditorInput.js";
import { defaultKeybindingsContents, DefaultKeybindingsEditorModel, DefaultRawSettingsEditorModel, DefaultSettings, DefaultSettingsEditorModel, Settings2EditorModel, SettingsEditorModel, WorkspaceConfigurationEditorModel } from "../common/preferencesModels.js";
import { IRemoteAgentService } from "../../remote/common/remoteAgentService.js";
import { ITextEditorService } from "../../textfile/common/textEditorService.js";
import { ITextFileService } from "../../textfile/common/textfiles.js";
import { isObject } from "../../../../base/common/types.js";
import { SuggestController } from "../../../../editor/contrib/suggest/browser/suggestController.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { ResourceSet } from "../../../../base/common/map.js";
import { isEqual } from "../../../../base/common/resources.js";
import { IURLService } from "../../../../platform/url/common/url.js";
import { compareIgnoreCase } from "../../../../base/common/strings.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
const emptyEditableSettingsContent = "{\n}";
let PreferencesService = class extends Disposable {
  constructor(editorService, editorGroupService, textFileService, configurationService, notificationService, contextService, instantiationService, userDataProfileService, userDataProfilesService, textModelResolverService, keybindingService, modelService, jsonEditingService, labelService, remoteAgentService, textEditorService, urlService, extensionService, progressService, environmentService) {
    super();
    this.editorService = editorService;
    this.editorGroupService = editorGroupService;
    this.textFileService = textFileService;
    this.configurationService = configurationService;
    this.notificationService = notificationService;
    this.contextService = contextService;
    this.instantiationService = instantiationService;
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.textModelResolverService = textModelResolverService;
    this.jsonEditingService = jsonEditingService;
    this.labelService = labelService;
    this.remoteAgentService = remoteAgentService;
    this.textEditorService = textEditorService;
    this.extensionService = extensionService;
    this.progressService = progressService;
    this.environmentService = environmentService;
    this._onDispose = this._register(new Emitter());
    this._onDidDefaultSettingsContentChanged = this._register(new Emitter());
    this.onDidDefaultSettingsContentChanged = this._onDidDefaultSettingsContentChanged.event;
    this._requestedDefaultSettings = new ResourceSet();
    this._settingsGroups = void 0;
    this._cachedSettingsEditor2Input = void 0;
    this.defaultKeybindingsResource = URI.from({ scheme: network.Schemas.vscode, authority: "defaultsettings", path: "/keybindings.json" });
    this.defaultSettingsRawResource = URI.from({ scheme: network.Schemas.vscode, authority: "defaultsettings", path: "/defaultSettings.jsonc" });
    this._register(keybindingService.onDidUpdateKeybindings(() => {
      const model = modelService.getModel(this.defaultKeybindingsResource);
      if (!model) {
        return;
      }
      modelService.updateModel(model, defaultKeybindingsContents(keybindingService));
    }));
    this._register(urlService.registerHandler(this));
  }
  get userSettingsResource() {
    return this.userDataProfileService.currentProfile.settingsResource;
  }
  get workspaceSettingsResource() {
    if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
      return null;
    }
    const workspace = this.contextService.getWorkspace();
    return workspace.configuration || workspace.folders[0].toResource(FOLDER_SETTINGS_PATH);
  }
  createOrGetCachedSettingsEditor2Input() {
    if (!this._cachedSettingsEditor2Input || this._cachedSettingsEditor2Input.isDisposed()) {
      this._cachedSettingsEditor2Input = new SettingsEditor2Input(this);
    }
    return this._cachedSettingsEditor2Input;
  }
  getFolderSettingsResource(resource) {
    const folder = this.contextService.getWorkspaceFolder(resource);
    return folder ? folder.toResource(FOLDER_SETTINGS_PATH) : null;
  }
  hasDefaultSettingsContent(uri) {
    return this.isDefaultSettingsResource(uri) || isEqual(uri, this.defaultSettingsRawResource) || isEqual(uri, this.defaultKeybindingsResource);
  }
  getDefaultSettingsContent(uri) {
    if (this.isDefaultSettingsResource(uri)) {
      const target = this.getConfigurationTargetFromDefaultSettingsResource(uri);
      const defaultSettings = this.getDefaultSettings(target);
      if (!this._requestedDefaultSettings.has(uri)) {
        this._register(defaultSettings.onDidChange(() => this._onDidDefaultSettingsContentChanged.fire(uri)));
        this._requestedDefaultSettings.add(uri);
      }
      return defaultSettings.getContentWithoutMostCommonlyUsed(true);
    }
    if (isEqual(uri, this.defaultSettingsRawResource)) {
      if (!this._defaultRawSettingsEditorModel) {
        this._defaultRawSettingsEditorModel = this._register(this.instantiationService.createInstance(DefaultRawSettingsEditorModel, this.getDefaultSettings(ConfigurationTarget.USER_LOCAL)));
        this._register(this._defaultRawSettingsEditorModel.onDidContentChanged(() => this._onDidDefaultSettingsContentChanged.fire(uri)));
      }
      return this._defaultRawSettingsEditorModel.content;
    }
    if (isEqual(uri, this.defaultKeybindingsResource)) {
      const defaultKeybindingsEditorModel = this.instantiationService.createInstance(DefaultKeybindingsEditorModel, uri);
      return defaultKeybindingsEditorModel.content;
    }
    return void 0;
  }
  async createPreferencesEditorModel(uri) {
    if (this.isDefaultSettingsResource(uri)) {
      return this.createDefaultSettingsEditorModel(uri);
    }
    if (this.userSettingsResource.toString() === uri.toString() || this.userDataProfilesService.defaultProfile.settingsResource.toString() === uri.toString()) {
      return this.createEditableSettingsEditorModel(ConfigurationTarget.USER_LOCAL, uri);
    }
    const workspaceSettingsUri = await this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE);
    if (workspaceSettingsUri && workspaceSettingsUri.toString() === uri.toString()) {
      return this.createEditableSettingsEditorModel(ConfigurationTarget.WORKSPACE, workspaceSettingsUri);
    }
    if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE) {
      const settingsUri = await this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE_FOLDER, uri);
      if (settingsUri && settingsUri.toString() === uri.toString()) {
        return this.createEditableSettingsEditorModel(ConfigurationTarget.WORKSPACE_FOLDER, uri);
      }
    }
    const remoteEnvironment = await this.remoteAgentService.getEnvironment();
    const remoteSettingsUri = remoteEnvironment ? remoteEnvironment.settingsPath : null;
    if (remoteSettingsUri && remoteSettingsUri.toString() === uri.toString()) {
      return this.createEditableSettingsEditorModel(ConfigurationTarget.USER_REMOTE, uri);
    }
    return null;
  }
  openRawDefaultSettings() {
    return this.editorService.openEditor({ resource: this.defaultSettingsRawResource });
  }
  openRawUserSettings() {
    return this.editorService.openEditor({ resource: this.userSettingsResource });
  }
  shouldOpenJsonByDefault() {
    return this.configurationService.getValue("workbench.settings.editor") === "json";
  }
  async openPreferences() {
    await this.editorService.openEditor(this.instantiationService.createInstance(PreferencesEditorInput), void 0, MODAL_GROUP);
  }
  openSettings(options = {}) {
    options = {
      ...options,
      target: ConfigurationTarget.USER_LOCAL
    };
    if (options.query) {
      options.jsonEditor = false;
    }
    return this.open(this.userSettingsResource, options);
  }
  openLanguageSpecificSettings(languageId, options = {}) {
    if (this.shouldOpenJsonByDefault()) {
      options.query = void 0;
      options.revealSetting = { key: `[${languageId}]`, edit: true };
    } else {
      options.query = `@lang:${languageId}${options.query ? ` ${options.query}` : ""}`;
    }
    options.target = options.target ?? ConfigurationTarget.USER_LOCAL;
    return this.open(this.userSettingsResource, options);
  }
  open(settingsResource, options) {
    options = {
      ...options,
      jsonEditor: options.jsonEditor ?? this.shouldOpenJsonByDefault()
    };
    if (options.jsonEditor && options.query && !options.revealSetting) {
      const query = options.query.trim();
      const idMatch = query.match(/^@id:(.+)$/);
      let key;
      if (idMatch) {
        key = idMatch[1].trim();
      } else if (Registry.as(Extensions.Configuration).getConfigurationProperties()[query.trim()]) {
        key = query.trim();
      }
      options.query = void 0;
      if (key) {
        options.revealSetting = { key };
      }
    }
    return options.jsonEditor ? this.openSettingsJson(settingsResource, options) : this.openSettings2(options);
  }
  async openSettings2(options) {
    const input = this.createOrGetCachedSettingsEditor2Input();
    options = {
      ...options,
      focusSearch: true
    };
    const group = this.getEditorGroupFromOptions(options);
    return this.editorService.openEditor(input, validateSettingsEditorOptions(options), group);
  }
  openApplicationSettings(options = {}) {
    options = {
      ...options,
      target: ConfigurationTarget.USER_LOCAL
    };
    return this.open(this.userDataProfilesService.defaultProfile.settingsResource, options);
  }
  openUserSettings(options = {}) {
    options = {
      ...options,
      target: ConfigurationTarget.USER_LOCAL
    };
    return this.open(this.userSettingsResource, options);
  }
  async openRemoteSettings(options = {}) {
    const environment = await this.remoteAgentService.getEnvironment();
    if (environment) {
      options = {
        ...options,
        target: ConfigurationTarget.USER_REMOTE
      };
      this.open(environment.settingsPath, options);
    }
    return void 0;
  }
  openWorkspaceSettings(options = {}) {
    if (!this.workspaceSettingsResource) {
      this.notificationService.info(nls.localize("openFolderFirst", "Open a folder or workspace first to create workspace or folder settings."));
      return Promise.reject(null);
    }
    options = {
      ...options,
      target: ConfigurationTarget.WORKSPACE
    };
    return this.open(this.workspaceSettingsResource, options);
  }
  async openFolderSettings(options = {}) {
    options = {
      ...options,
      target: ConfigurationTarget.WORKSPACE_FOLDER
    };
    if (!options.folderUri) {
      throw new Error(`Missing folder URI`);
    }
    const folderSettingsUri = await this.getEditableSettingsURI(ConfigurationTarget.WORKSPACE_FOLDER, options.folderUri);
    if (!folderSettingsUri) {
      throw new Error(`Invalid folder URI - ${options.folderUri.toString()}`);
    }
    return this.open(folderSettingsUri, options);
  }
  async openGlobalKeybindingSettings(textual, options) {
    options = { pinned: true, revealIfOpened: true, ...options };
    if (textual) {
      const emptyContents = "// " + nls.localize("emptyKeybindingsHeader", "Place your key bindings in this file to override the defaults") + "\n[\n]";
      const editableKeybindings = this.userDataProfileService.currentProfile.keybindingsResource;
      const openDefaultKeybindings = !!this.configurationService.getValue("workbench.settings.openDefaultKeybindings");
      await this.createIfNotExists(editableKeybindings, emptyContents);
      if (openDefaultKeybindings) {
        const sourceGroupId = options.groupId ?? this.editorGroupService.activeGroup.id;
        const sideEditorGroup = this.editorGroupService.addGroup(sourceGroupId, GroupDirection.RIGHT);
        await Promise.all([
          this.editorService.openEditor({ resource: this.defaultKeybindingsResource, options: { pinned: true, preserveFocus: true, revealIfOpened: true, override: DEFAULT_EDITOR_ASSOCIATION.id }, label: nls.localize("defaultKeybindings", "Default Keybindings"), description: "" }, sourceGroupId),
          this.editorService.openEditor({ resource: editableKeybindings, options }, sideEditorGroup.id)
        ]);
      } else {
        await this.editorService.openEditor({ resource: editableKeybindings, options }, this.getEditorGroupFromOptions(options));
      }
    } else {
      const group = this.getEditorGroupFromOptions(options);
      const editor = await this.editorService.openEditor(this.instantiationService.createInstance(KeybindingsEditorInput), { ...options }, group);
      if (options.query) {
        editor.search(options.query);
      }
    }
  }
  openDefaultKeybindingsFile() {
    return this.editorService.openEditor({ resource: this.defaultKeybindingsResource, label: nls.localize("defaultKeybindings", "Default Keybindings") });
  }
  getEditorGroupFromOptions(options) {
    if (options?.groupId !== void 0 && !options.openToSide) {
      const group = this.editorGroupService.getGroup(options.groupId);
      if (group) {
        const modalEditorPart = this.editorGroupService.activeModalEditorPart;
        if (modalEditorPart?.groups.some((modalGroup) => modalGroup.id === group.id)) {
          return MODAL_GROUP;
        }
        return group;
      }
    }
    if (this.configurationService.getValue("workbench.editor.useModal") !== "off" && // modal editors enabled in settings
    !this.environmentService.enableSmokeTestDriver && !this.environmentService.extensionTestsLocationURI) {
      return MODAL_GROUP;
    }
    if (options.openToSide) {
      return SIDE_GROUP;
    }
    if (options?.groupId !== void 0) {
      return this.editorGroupService.getGroup(options.groupId) ?? this.editorGroupService.activeGroup;
    }
    return ACTIVE_GROUP;
  }
  async openSettingsJson(resource, options) {
    const group = this.getEditorGroupFromOptions(options);
    const editor = await this.doOpenSettingsJson(resource, options, group);
    if (editor && options?.revealSetting) {
      await this.revealSetting(options.revealSetting.key, !!options.revealSetting.edit, editor, resource);
    }
    return editor;
  }
  async doOpenSettingsJson(resource, options, group) {
    const openSplitJSON = !!this.configurationService.getValue(USE_SPLIT_JSON_SETTING);
    const openDefaultSettings = !!this.configurationService.getValue(DEFAULT_SETTINGS_EDITOR_SETTING);
    if (openSplitJSON || openDefaultSettings) {
      return this.doOpenSplitJSON(resource, options, group);
    }
    const configurationTarget = options?.target ?? ConfigurationTarget.USER;
    const editableSettingsEditorInput = await this.getOrCreateEditableSettingsEditorInput(configurationTarget, resource);
    options = { ...options, pinned: true };
    return await this.editorService.openEditor(editableSettingsEditorInput, { ...validateSettingsEditorOptions(options) }, group);
  }
  async doOpenSplitJSON(resource, options = {}, group) {
    const configurationTarget = options.target ?? ConfigurationTarget.USER;
    await this.createSettingsIfNotExists(configurationTarget, resource);
    const preferencesEditorInput = this.createSplitJsonEditorInput(configurationTarget, resource);
    options = { ...options, pinned: true };
    return this.editorService.openEditor(preferencesEditorInput, validateSettingsEditorOptions(options), group);
  }
  createSplitJsonEditorInput(configurationTarget, resource) {
    const editableSettingsEditorInput = this.textEditorService.createTextEditor({ resource });
    const defaultPreferencesEditorInput = this.textEditorService.createTextEditor({ resource: this.getDefaultSettingsResource(configurationTarget) });
    return this.instantiationService.createInstance(SideBySideEditorInput, editableSettingsEditorInput.getName(), void 0, defaultPreferencesEditorInput, editableSettingsEditorInput);
  }
  createSettings2EditorModel() {
    return this.instantiationService.createInstance(Settings2EditorModel, this.getDefaultSettings(ConfigurationTarget.USER_LOCAL));
  }
  getConfigurationTargetFromDefaultSettingsResource(uri) {
    return this.isDefaultWorkspaceSettingsResource(uri) ? ConfigurationTarget.WORKSPACE : this.isDefaultFolderSettingsResource(uri) ? ConfigurationTarget.WORKSPACE_FOLDER : ConfigurationTarget.USER_LOCAL;
  }
  isDefaultSettingsResource(uri) {
    return this.isDefaultUserSettingsResource(uri) || this.isDefaultWorkspaceSettingsResource(uri) || this.isDefaultFolderSettingsResource(uri);
  }
  isDefaultUserSettingsResource(uri) {
    return uri.authority === "defaultsettings" && uri.scheme === network.Schemas.vscode && !!uri.path.match(/\/(\d+\/)?settings\.json$/);
  }
  isDefaultWorkspaceSettingsResource(uri) {
    return uri.authority === "defaultsettings" && uri.scheme === network.Schemas.vscode && !!uri.path.match(/\/(\d+\/)?workspaceSettings\.json$/);
  }
  isDefaultFolderSettingsResource(uri) {
    return uri.authority === "defaultsettings" && uri.scheme === network.Schemas.vscode && !!uri.path.match(/\/(\d+\/)?resourceSettings\.json$/);
  }
  getDefaultSettingsResource(configurationTarget) {
    switch (configurationTarget) {
      case ConfigurationTarget.WORKSPACE:
        return URI.from({ scheme: network.Schemas.vscode, authority: "defaultsettings", path: `/workspaceSettings.json` });
      case ConfigurationTarget.WORKSPACE_FOLDER:
        return URI.from({ scheme: network.Schemas.vscode, authority: "defaultsettings", path: `/resourceSettings.json` });
    }
    return URI.from({ scheme: network.Schemas.vscode, authority: "defaultsettings", path: `/settings.json` });
  }
  async getOrCreateEditableSettingsEditorInput(target, resource) {
    await this.createSettingsIfNotExists(target, resource);
    return this.textEditorService.createTextEditor({ resource });
  }
  async createEditableSettingsEditorModel(configurationTarget, settingsUri) {
    const workspace = this.contextService.getWorkspace();
    if (workspace.configuration && workspace.configuration.toString() === settingsUri.toString()) {
      const reference2 = await this.textModelResolverService.createModelReference(settingsUri);
      return this.instantiationService.createInstance(WorkspaceConfigurationEditorModel, reference2, configurationTarget);
    }
    const reference = await this.textModelResolverService.createModelReference(settingsUri);
    return this.instantiationService.createInstance(SettingsEditorModel, reference, configurationTarget);
  }
  async createDefaultSettingsEditorModel(defaultSettingsUri) {
    const reference = await this.textModelResolverService.createModelReference(defaultSettingsUri);
    const target = this.getConfigurationTargetFromDefaultSettingsResource(defaultSettingsUri);
    return this.instantiationService.createInstance(DefaultSettingsEditorModel, defaultSettingsUri, reference, this.getDefaultSettings(target));
  }
  getDefaultSettings(target) {
    if (target === ConfigurationTarget.WORKSPACE) {
      this._defaultWorkspaceSettingsContentModel ??= this._register(new DefaultSettings(this.getMostCommonlyUsedSettings(), target, this.configurationService));
      return this._defaultWorkspaceSettingsContentModel;
    }
    if (target === ConfigurationTarget.WORKSPACE_FOLDER) {
      this._defaultFolderSettingsContentModel ??= this._register(new DefaultSettings(this.getMostCommonlyUsedSettings(), target, this.configurationService));
      return this._defaultFolderSettingsContentModel;
    }
    this._defaultUserSettingsContentModel ??= this._register(new DefaultSettings(this.getMostCommonlyUsedSettings(), target, this.configurationService));
    return this._defaultUserSettingsContentModel;
  }
  async getEditableSettingsURI(configurationTarget, resource) {
    switch (configurationTarget) {
      case ConfigurationTarget.APPLICATION:
        return this.userDataProfilesService.defaultProfile.settingsResource;
      case ConfigurationTarget.USER:
      case ConfigurationTarget.USER_LOCAL:
        return this.userSettingsResource;
      case ConfigurationTarget.USER_REMOTE: {
        const remoteEnvironment = await this.remoteAgentService.getEnvironment();
        return remoteEnvironment ? remoteEnvironment.settingsPath : null;
      }
      case ConfigurationTarget.WORKSPACE:
        return this.workspaceSettingsResource;
      case ConfigurationTarget.WORKSPACE_FOLDER:
        if (resource) {
          return this.getFolderSettingsResource(resource);
        }
    }
    return null;
  }
  async createSettingsIfNotExists(target, resource) {
    if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && target === ConfigurationTarget.WORKSPACE) {
      const workspaceConfig = this.contextService.getWorkspace().configuration;
      if (!workspaceConfig) {
        return;
      }
      const content = await this.textFileService.read(workspaceConfig);
      if (Object.keys(parse(content.value)).indexOf("settings") === -1) {
        await this.jsonEditingService.write(resource, [{ path: ["settings"], value: {} }], true);
      }
      return void 0;
    }
    await this.createIfNotExists(resource, emptyEditableSettingsContent);
  }
  async createIfNotExists(resource, contents) {
    try {
      await this.textFileService.read(resource, { acceptTextOnly: true });
    } catch (error) {
      if (error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
        try {
          await this.textFileService.write(resource, contents);
          return;
        } catch (error2) {
          throw new Error(nls.localize("fail.createSettings", "Unable to create '{0}' ({1}).", this.labelService.getUriLabel(resource, { relative: true }), getErrorMessage(error2)));
        }
      } else {
        throw error;
      }
    }
  }
  getMostCommonlyUsedSettings() {
    return [
      "editor.fontSize",
      "editor.formatOnSave",
      "files.autoSave",
      "editor.defaultFormatter",
      "editor.fontFamily",
      "editor.wordWrap",
      "chat.agent.maxRequests",
      "files.exclude",
      "workbench.colorTheme",
      "editor.tabSize",
      "editor.mouseWheelZoom",
      "editor.formatOnPaste"
    ];
  }
  async revealSetting(settingKey, edit, editor, settingsResource) {
    const codeEditor = editor ? getCodeEditor(editor.getControl()) : null;
    if (!codeEditor) {
      return;
    }
    const settingsModel = await this.createPreferencesEditorModel(settingsResource);
    if (!settingsModel) {
      return;
    }
    const position = await this.getPositionToReveal(settingKey, edit, settingsModel, codeEditor);
    if (position) {
      codeEditor.setPosition(position);
      codeEditor.revealPositionNearTop(position);
      codeEditor.focus();
      if (edit) {
        SuggestController.get(codeEditor)?.triggerSuggest();
      }
    }
  }
  async getPositionToReveal(settingKey, edit, settingsModel, codeEditor) {
    const model = codeEditor.getModel();
    if (!model) {
      return null;
    }
    const schema = Registry.as(Extensions.Configuration).getConfigurationProperties()[settingKey];
    const isOverrideProperty = OVERRIDE_PROPERTY_REGEX.test(settingKey);
    if (!schema && !isOverrideProperty) {
      return null;
    }
    let position = null;
    const type = schema?.type ?? "object";
    let setting = settingsModel.getPreference(settingKey);
    if (!setting && edit) {
      let defaultValue = type === "object" || type === "array" ? this.configurationService.inspect(settingKey).defaultValue : getDefaultValue(type);
      defaultValue = defaultValue === void 0 && isOverrideProperty ? {} : defaultValue;
      if (defaultValue !== void 0) {
        const key = settingsModel instanceof WorkspaceConfigurationEditorModel ? ["settings", settingKey] : [settingKey];
        await this.jsonEditingService.write(settingsModel.uri, [{ path: key, value: defaultValue }], false);
        setting = settingsModel.getPreference(settingKey);
      }
    }
    if (setting) {
      if (edit) {
        if (isObject(setting.value) || Array.isArray(setting.value)) {
          position = { lineNumber: setting.valueRange.startLineNumber, column: setting.valueRange.startColumn + 1 };
          codeEditor.setPosition(position);
          await this.instantiationService.invokeFunction((accessor) => {
            return CoreEditingCommands.LineBreakInsert.runEditorCommand(accessor, codeEditor, null);
          });
          position = { lineNumber: position.lineNumber + 1, column: model.getLineMaxColumn(position.lineNumber + 1) };
          const firstNonWhiteSpaceColumn = model.getLineFirstNonWhitespaceColumn(position.lineNumber);
          if (firstNonWhiteSpaceColumn) {
            codeEditor.setPosition({ lineNumber: position.lineNumber, column: firstNonWhiteSpaceColumn });
            await this.instantiationService.invokeFunction((accessor) => {
              return CoreEditingCommands.LineBreakInsert.runEditorCommand(accessor, codeEditor, null);
            });
            position = { lineNumber: position.lineNumber, column: model.getLineMaxColumn(position.lineNumber) };
          }
        } else {
          position = { lineNumber: setting.valueRange.startLineNumber, column: setting.valueRange.endColumn };
        }
      } else {
        position = { lineNumber: setting.keyRange.startLineNumber, column: setting.keyRange.startColumn };
      }
    }
    return position;
  }
  getSetting(settingId) {
    if (!this._settingsGroups) {
      const defaultSettings = this.getDefaultSettings(ConfigurationTarget.USER);
      const defaultsChangedDisposable = this._register(new MutableDisposable());
      defaultsChangedDisposable.value = defaultSettings.onDidChange(() => {
        this._settingsGroups = void 0;
        defaultsChangedDisposable.clear();
      });
      this._settingsGroups = defaultSettings.getSettingsGroups();
    }
    for (const group of this._settingsGroups) {
      for (const section of group.sections) {
        for (const setting of section.settings) {
          if (compareIgnoreCase(setting.key, settingId) === 0) {
            return setting;
          }
        }
      }
    }
    return void 0;
  }
  /**
   * Should be of the format:
   * 	code://settings/settingName
   * Examples:
   * 	code://settings/files.autoSave
   *
   */
  async handleURL(uri) {
    if (compareIgnoreCase(uri.authority, SETTINGS_AUTHORITY) !== 0) {
      return false;
    }
    const settingInfo = uri.path.split("/").filter((part) => !!part);
    const settingId = settingInfo.length > 0 ? settingInfo[0] : void 0;
    if (!settingId) {
      this.openSettings();
      return true;
    }
    let setting = this.getSetting(settingId);
    if (!setting && this.extensionService.extensions.length === 0) {
      await this.progressService.withProgress({ location: ProgressLocation.Window }, () => Event.toPromise(this.extensionService.onDidRegisterExtensions));
      setting = this.getSetting(settingId);
    }
    const openSettingsOptions = {};
    if (setting) {
      openSettingsOptions.query = settingId;
    }
    this.openSettings(openSettingsOptions);
    return true;
  }
  dispose() {
    if (this._cachedSettingsEditor2Input && !this._cachedSettingsEditor2Input.isDisposed()) {
      this._cachedSettingsEditor2Input.dispose();
    }
    this._onDispose.fire();
    super.dispose();
  }
};
PreferencesService = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IEditorGroupsService),
  __decorateParam(2, ITextFileService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, INotificationService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IUserDataProfileService),
  __decorateParam(8, IUserDataProfilesService),
  __decorateParam(9, ITextModelService),
  __decorateParam(10, IKeybindingService),
  __decorateParam(11, IModelService),
  __decorateParam(12, IJSONEditingService),
  __decorateParam(13, ILabelService),
  __decorateParam(14, IRemoteAgentService),
  __decorateParam(15, ITextEditorService),
  __decorateParam(16, IURLService),
  __decorateParam(17, IExtensionService),
  __decorateParam(18, IProgressService),
  __decorateParam(19, IWorkbenchEnvironmentService)
], PreferencesService);
registerSingleton(IPreferencesService, PreferencesService, InstantiationType.Delayed);
export {
  PreferencesService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9icm93c2VyL3ByZWZlcmVuY2VzU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdldEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0ICogYXMgbmV0d29yayBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDb3JlRWRpdGluZ0NvbW1hbmRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvY29yZUNvbW1hbmRzLmpzJztcbmltcG9ydCB7IGdldENvZGVFZGl0b3IsIElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9ucywgZ2V0RGVmYXVsdFZhbHVlLCBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBPVkVSUklERV9QUk9QRVJUWV9SRUdFWCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25SZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTiwgSUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBJSlNPTkVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vanNvbkVkaXRpbmcuanMnO1xuaW1wb3J0IHsgR3JvdXBEaXJlY3Rpb24sIElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgSUVkaXRvclNlcnZpY2UsIE1PREFMX0dST1VQLCBQcmVmZXJyZWRHcm91cCwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc0VkaXRvcklucHV0IH0gZnJvbSAnLi9rZXliaW5kaW5nc0VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IERFRkFVTFRfU0VUVElOR1NfRURJVE9SX1NFVFRJTkcsIEZPTERFUl9TRVRUSU5HU19QQVRILCBJS2V5YmluZGluZ3NFZGl0b3JQYW5lLCBJT3BlbktleWJpbmRpbmdzRWRpdG9yT3B0aW9ucywgSU9wZW5TZXR0aW5nc09wdGlvbnMsIElQcmVmZXJlbmNlc0VkaXRvck1vZGVsLCBJUHJlZmVyZW5jZXNTZXJ2aWNlLCBJU2V0dGluZywgSVNldHRpbmdzRWRpdG9yT3B0aW9ucywgSVNldHRpbmdzR3JvdXAsIFNFVFRJTkdTX0FVVEhPUklUWSwgVVNFX1NQTElUX0pTT05fU0VUVElORywgdmFsaWRhdGVTZXR0aW5nc0VkaXRvck9wdGlvbnMgfSBmcm9tICcuLi9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgUHJlZmVyZW5jZXNFZGl0b3JJbnB1dCwgU2V0dGluZ3NFZGl0b3IySW5wdXQgfSBmcm9tICcuLi9jb21tb24vcHJlZmVyZW5jZXNFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0S2V5YmluZGluZ3NDb250ZW50cywgRGVmYXVsdEtleWJpbmRpbmdzRWRpdG9yTW9kZWwsIERlZmF1bHRSYXdTZXR0aW5nc0VkaXRvck1vZGVsLCBEZWZhdWx0U2V0dGluZ3MsIERlZmF1bHRTZXR0aW5nc0VkaXRvck1vZGVsLCBTZXR0aW5nczJFZGl0b3JNb2RlbCwgU2V0dGluZ3NFZGl0b3JNb2RlbCwgV29ya3NwYWNlQ29uZmlndXJhdGlvbkVkaXRvck1vZGVsIH0gZnJvbSAnLi4vY29tbW9uL3ByZWZlcmVuY2VzTW9kZWxzLmpzJztcbmltcG9ydCB7IElSZW1vdGVBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9yZW1vdGUvY29tbW9uL3JlbW90ZUFnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZXh0ZmlsZS9jb21tb24vdGV4dEVkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRleHRGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3RleHRmaWxlL2NvbW1vbi90ZXh0ZmlsZXMuanMnO1xuaW1wb3J0IHsgaXNPYmplY3QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBTdWdnZXN0Q29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0Q29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IGlzRXF1YWwgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgSVVSTFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmwvY29tbW9uL3VybC5qcyc7XG5pbXBvcnQgeyBjb21wYXJlSWdub3JlQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElQcm9ncmVzc1NlcnZpY2UsIFByb2dyZXNzTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuXG5jb25zdCBlbXB0eUVkaXRhYmxlU2V0dGluZ3NDb250ZW50ID0gJ3tcXG59JztcblxuZXhwb3J0IGNsYXNzIFByZWZlcmVuY2VzU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUHJlZmVyZW5jZXNTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERlZmF1bHRTZXR0aW5nc0NvbnRlbnRDaGFuZ2VkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8VVJJPigpKTtcblx0cmVhZG9ubHkgb25EaWREZWZhdWx0U2V0dGluZ3NDb250ZW50Q2hhbmdlZCA9IHRoaXMuX29uRGlkRGVmYXVsdFNldHRpbmdzQ29udGVudENoYW5nZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfZGVmYXVsdFVzZXJTZXR0aW5nc0NvbnRlbnRNb2RlbDogRGVmYXVsdFNldHRpbmdzIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9kZWZhdWx0V29ya3NwYWNlU2V0dGluZ3NDb250ZW50TW9kZWw6IERlZmF1bHRTZXR0aW5ncyB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZGVmYXVsdEZvbGRlclNldHRpbmdzQ29udGVudE1vZGVsOiBEZWZhdWx0U2V0dGluZ3MgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfZGVmYXVsdFJhd1NldHRpbmdzRWRpdG9yTW9kZWw6IERlZmF1bHRSYXdTZXR0aW5nc0VkaXRvck1vZGVsIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3JlcXVlc3RlZERlZmF1bHRTZXR0aW5ncyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXG5cdHByaXZhdGUgX3NldHRpbmdzR3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jYWNoZWRTZXR0aW5nc0VkaXRvcjJJbnB1dDogU2V0dGluZ3NFZGl0b3IySW5wdXQgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZSxcblx0XHRASVRleHRGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElKU09ORWRpdGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBqc29uRWRpdGluZ1NlcnZpY2U6IElKU09ORWRpdGluZ1NlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElSZW1vdGVBZ2VudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSByZW1vdGVBZ2VudFNlcnZpY2U6IElSZW1vdGVBZ2VudFNlcnZpY2UsXG5cdFx0QElUZXh0RWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRFZGl0b3JTZXJ2aWNlOiBJVGV4dEVkaXRvclNlcnZpY2UsXG5cdFx0QElVUkxTZXJ2aWNlIHVybFNlcnZpY2U6IElVUkxTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZW52aXJvbm1lbnRTZXJ2aWNlOiBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdC8vIFRoZSBkZWZhdWx0IGtleWJpbmRpbmdzLmpzb24gdXBkYXRlcyBiYXNlZCBvbiBrZXlib2FyZCBsYXlvdXRzLCBzbyBoZXJlIHdlIG1ha2Ugc3VyZVxuXHRcdC8vIGlmIGEgbW9kZWwgaGFzIGJlZW4gZ2l2ZW4gb3V0IHdlIHVwZGF0ZSBpdCBhY2NvcmRpbmdseS5cblx0XHR0aGlzLl9yZWdpc3RlcihrZXliaW5kaW5nU2VydmljZS5vbkRpZFVwZGF0ZUtleWJpbmRpbmdzKCgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVsID0gbW9kZWxTZXJ2aWNlLmdldE1vZGVsKHRoaXMuZGVmYXVsdEtleWJpbmRpbmdzUmVzb3VyY2UpO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHQvLyBtb2RlbCBoYXMgbm90IGJlZW4gZ2l2ZW4gb3V0ID0+IG5vdGhpbmcgdG8gZG9cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0bW9kZWxTZXJ2aWNlLnVwZGF0ZU1vZGVsKG1vZGVsLCBkZWZhdWx0S2V5YmluZGluZ3NDb250ZW50cyhrZXliaW5kaW5nU2VydmljZSkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHVybFNlcnZpY2UucmVnaXN0ZXJIYW5kbGVyKHRoaXMpKTtcblx0fVxuXG5cdHJlYWRvbmx5IGRlZmF1bHRLZXliaW5kaW5nc1Jlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IG5ldHdvcmsuU2NoZW1hcy52c2NvZGUsIGF1dGhvcml0eTogJ2RlZmF1bHRzZXR0aW5ncycsIHBhdGg6ICcva2V5YmluZGluZ3MuanNvbicgfSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdFNldHRpbmdzUmF3UmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogbmV0d29yay5TY2hlbWFzLnZzY29kZSwgYXV0aG9yaXR5OiAnZGVmYXVsdHNldHRpbmdzJywgcGF0aDogJy9kZWZhdWx0U2V0dGluZ3MuanNvbmMnIH0pO1xuXG5cdGdldCB1c2VyU2V0dGluZ3NSZXNvdXJjZSgpOiBVUkkge1xuXHRcdHJldHVybiB0aGlzLnVzZXJEYXRhUHJvZmlsZVNlcnZpY2UuY3VycmVudFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZTtcblx0fVxuXG5cdGdldCB3b3Jrc3BhY2VTZXR0aW5nc1Jlc291cmNlKCk6IFVSSSB8IG51bGwge1xuXHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRyZXR1cm4gd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gfHwgd29ya3NwYWNlLmZvbGRlcnNbMF0udG9SZXNvdXJjZShGT0xERVJfU0VUVElOR1NfUEFUSCk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU9yR2V0Q2FjaGVkU2V0dGluZ3NFZGl0b3IySW5wdXQoKTogU2V0dGluZ3NFZGl0b3IySW5wdXQge1xuXHRcdGlmICghdGhpcy5fY2FjaGVkU2V0dGluZ3NFZGl0b3IySW5wdXQgfHwgdGhpcy5fY2FjaGVkU2V0dGluZ3NFZGl0b3IySW5wdXQuaXNEaXNwb3NlZCgpKSB7XG5cdFx0XHQvLyBSZWNyZWF0ZSB0aGUgaW5wdXQgaWYgdGhlIHVzZXIgbmV2ZXIgb3BlbmVkIHRoZSBTZXR0aW5ncyBlZGl0b3IsXG5cdFx0XHQvLyBvciBpZiB0aGV5IGNsb3NlZCBpdCBhbmQgd2FudCB0byByZW9wZW4gaXQuXG5cdFx0XHR0aGlzLl9jYWNoZWRTZXR0aW5nc0VkaXRvcjJJbnB1dCA9IG5ldyBTZXR0aW5nc0VkaXRvcjJJbnB1dCh0aGlzKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2NhY2hlZFNldHRpbmdzRWRpdG9yMklucHV0O1xuXHR9XG5cblx0Z2V0Rm9sZGVyU2V0dGluZ3NSZXNvdXJjZShyZXNvdXJjZTogVVJJKTogVVJJIHwgbnVsbCB7XG5cdFx0Y29uc3QgZm9sZGVyID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIocmVzb3VyY2UpO1xuXHRcdHJldHVybiBmb2xkZXIgPyBmb2xkZXIudG9SZXNvdXJjZShGT0xERVJfU0VUVElOR1NfUEFUSCkgOiBudWxsO1xuXHR9XG5cblx0aGFzRGVmYXVsdFNldHRpbmdzQ29udGVudCh1cmk6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmlzRGVmYXVsdFNldHRpbmdzUmVzb3VyY2UodXJpKSB8fCBpc0VxdWFsKHVyaSwgdGhpcy5kZWZhdWx0U2V0dGluZ3NSYXdSZXNvdXJjZSkgfHwgaXNFcXVhbCh1cmksIHRoaXMuZGVmYXVsdEtleWJpbmRpbmdzUmVzb3VyY2UpO1xuXHR9XG5cblx0Z2V0RGVmYXVsdFNldHRpbmdzQ29udGVudCh1cmk6IFVSSSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuaXNEZWZhdWx0U2V0dGluZ3NSZXNvdXJjZSh1cmkpKSB7XG5cdFx0XHQvLyBXZSBvcGVuZWQgYSBzcGxpdCBqc29uIGVkaXRvciBpbiB0aGlzIGNhc2UsXG5cdFx0XHQvLyBhbmQgdGhpcyBoYWxmIHNob3dzIHRoZSBkZWZhdWx0IHNldHRpbmdzLlxuXG5cdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLmdldENvbmZpZ3VyYXRpb25UYXJnZXRGcm9tRGVmYXVsdFNldHRpbmdzUmVzb3VyY2UodXJpKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRTZXR0aW5ncyA9IHRoaXMuZ2V0RGVmYXVsdFNldHRpbmdzKHRhcmdldCk7XG5cblx0XHRcdGlmICghdGhpcy5fcmVxdWVzdGVkRGVmYXVsdFNldHRpbmdzLmhhcyh1cmkpKSB7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRlZmF1bHRTZXR0aW5ncy5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl9vbkRpZERlZmF1bHRTZXR0aW5nc0NvbnRlbnRDaGFuZ2VkLmZpcmUodXJpKSkpO1xuXHRcdFx0XHR0aGlzLl9yZXF1ZXN0ZWREZWZhdWx0U2V0dGluZ3MuYWRkKHVyaSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZGVmYXVsdFNldHRpbmdzLmdldENvbnRlbnRXaXRob3V0TW9zdENvbW1vbmx5VXNlZCh0cnVlKTtcblx0XHR9XG5cblx0XHRpZiAoaXNFcXVhbCh1cmksIHRoaXMuZGVmYXVsdFNldHRpbmdzUmF3UmVzb3VyY2UpKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2RlZmF1bHRSYXdTZXR0aW5nc0VkaXRvck1vZGVsKSB7XG5cdFx0XHRcdHRoaXMuX2RlZmF1bHRSYXdTZXR0aW5nc0VkaXRvck1vZGVsID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEZWZhdWx0UmF3U2V0dGluZ3NFZGl0b3JNb2RlbCwgdGhpcy5nZXREZWZhdWx0U2V0dGluZ3MoQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKSkpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9kZWZhdWx0UmF3U2V0dGluZ3NFZGl0b3JNb2RlbC5vbkRpZENvbnRlbnRDaGFuZ2VkKCgpID0+IHRoaXMuX29uRGlkRGVmYXVsdFNldHRpbmdzQ29udGVudENoYW5nZWQuZmlyZSh1cmkpKSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5fZGVmYXVsdFJhd1NldHRpbmdzRWRpdG9yTW9kZWwuY29udGVudDtcblx0XHR9XG5cblx0XHRpZiAoaXNFcXVhbCh1cmksIHRoaXMuZGVmYXVsdEtleWJpbmRpbmdzUmVzb3VyY2UpKSB7XG5cdFx0XHRjb25zdCBkZWZhdWx0S2V5YmluZGluZ3NFZGl0b3JNb2RlbCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVmYXVsdEtleWJpbmRpbmdzRWRpdG9yTW9kZWwsIHVyaSk7XG5cdFx0XHRyZXR1cm4gZGVmYXVsdEtleWJpbmRpbmdzRWRpdG9yTW9kZWwuY29udGVudDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIGNyZWF0ZVByZWZlcmVuY2VzRWRpdG9yTW9kZWwodXJpOiBVUkkpOiBQcm9taXNlPElQcmVmZXJlbmNlc0VkaXRvck1vZGVsPElTZXR0aW5nPiB8IG51bGw+IHtcblx0XHRpZiAodGhpcy5pc0RlZmF1bHRTZXR0aW5nc1Jlc291cmNlKHVyaSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZURlZmF1bHRTZXR0aW5nc0VkaXRvck1vZGVsKHVyaSk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudXNlclNldHRpbmdzUmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gdXJpLnRvU3RyaW5nKCkgfHwgdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlLnRvU3RyaW5nKCkgPT09IHVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVFZGl0YWJsZVNldHRpbmdzRWRpdG9yTW9kZWwoQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMLCB1cmkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtzcGFjZVNldHRpbmdzVXJpID0gYXdhaXQgdGhpcy5nZXRFZGl0YWJsZVNldHRpbmdzVVJJKENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKTtcblx0XHRpZiAod29ya3NwYWNlU2V0dGluZ3NVcmkgJiYgd29ya3NwYWNlU2V0dGluZ3NVcmkudG9TdHJpbmcoKSA9PT0gdXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUVkaXRhYmxlU2V0dGluZ3NFZGl0b3JNb2RlbChDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSwgd29ya3NwYWNlU2V0dGluZ3NVcmkpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLldPUktTUEFDRSkge1xuXHRcdFx0Y29uc3Qgc2V0dGluZ3NVcmkgPSBhd2FpdCB0aGlzLmdldEVkaXRhYmxlU2V0dGluZ3NVUkkoQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSLCB1cmkpO1xuXHRcdFx0aWYgKHNldHRpbmdzVXJpICYmIHNldHRpbmdzVXJpLnRvU3RyaW5nKCkgPT09IHVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUVkaXRhYmxlU2V0dGluZ3NFZGl0b3JNb2RlbChDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIsIHVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVtb3RlRW52aXJvbm1lbnQgPSBhd2FpdCB0aGlzLnJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpO1xuXHRcdGNvbnN0IHJlbW90ZVNldHRpbmdzVXJpID0gcmVtb3RlRW52aXJvbm1lbnQgPyByZW1vdGVFbnZpcm9ubWVudC5zZXR0aW5nc1BhdGggOiBudWxsO1xuXHRcdGlmIChyZW1vdGVTZXR0aW5nc1VyaSAmJiByZW1vdGVTZXR0aW5nc1VyaS50b1N0cmluZygpID09PSB1cmkudG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlRWRpdGFibGVTZXR0aW5nc0VkaXRvck1vZGVsKENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUsIHVyaSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRvcGVuUmF3RGVmYXVsdFNldHRpbmdzKCk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdGhpcy5kZWZhdWx0U2V0dGluZ3NSYXdSZXNvdXJjZSB9KTtcblx0fVxuXG5cdG9wZW5SYXdVc2VyU2V0dGluZ3MoKTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7IHJlc291cmNlOiB0aGlzLnVzZXJTZXR0aW5nc1Jlc291cmNlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRPcGVuSnNvbkJ5RGVmYXVsdCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgnd29ya2JlbmNoLnNldHRpbmdzLmVkaXRvcicpID09PSAnanNvbic7XG5cdH1cblxuXHRhc3luYyBvcGVuUHJlZmVyZW5jZXMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShQcmVmZXJlbmNlc0VkaXRvcklucHV0KSwgdW5kZWZpbmVkLCBNT0RBTF9HUk9VUCk7XG5cdH1cblxuXHRvcGVuU2V0dGluZ3Mob3B0aW9uczogSU9wZW5TZXR0aW5nc09wdGlvbnMgPSB7fSk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+IHtcblx0XHRvcHRpb25zID0ge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMLFxuXHRcdH07XG5cdFx0aWYgKG9wdGlvbnMucXVlcnkpIHtcblx0XHRcdG9wdGlvbnMuanNvbkVkaXRvciA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLm9wZW4odGhpcy51c2VyU2V0dGluZ3NSZXNvdXJjZSwgb3B0aW9ucyk7XG5cdH1cblxuXHRvcGVuTGFuZ3VhZ2VTcGVjaWZpY1NldHRpbmdzKGxhbmd1YWdlSWQ6IHN0cmluZywgb3B0aW9uczogSU9wZW5TZXR0aW5nc09wdGlvbnMgPSB7fSk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAodGhpcy5zaG91bGRPcGVuSnNvbkJ5RGVmYXVsdCgpKSB7XG5cdFx0XHRvcHRpb25zLnF1ZXJ5ID0gdW5kZWZpbmVkO1xuXHRcdFx0b3B0aW9ucy5yZXZlYWxTZXR0aW5nID0geyBrZXk6IGBbJHtsYW5ndWFnZUlkfV1gLCBlZGl0OiB0cnVlIH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdG9wdGlvbnMucXVlcnkgPSBgQGxhbmc6JHtsYW5ndWFnZUlkfSR7b3B0aW9ucy5xdWVyeSA/IGAgJHtvcHRpb25zLnF1ZXJ5fWAgOiAnJ31gO1xuXHRcdH1cblx0XHRvcHRpb25zLnRhcmdldCA9IG9wdGlvbnMudGFyZ2V0ID8/IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDtcblxuXHRcdHJldHVybiB0aGlzLm9wZW4odGhpcy51c2VyU2V0dGluZ3NSZXNvdXJjZSwgb3B0aW9ucyk7XG5cdH1cblxuXHRwcml2YXRlIG9wZW4oc2V0dGluZ3NSZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJT3BlblNldHRpbmdzT3B0aW9ucyk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+IHtcblx0XHRvcHRpb25zID0ge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdGpzb25FZGl0b3I6IG9wdGlvbnMuanNvbkVkaXRvciA/PyB0aGlzLnNob3VsZE9wZW5Kc29uQnlEZWZhdWx0KClcblx0XHR9O1xuXG5cdFx0aWYgKG9wdGlvbnMuanNvbkVkaXRvciAmJiBvcHRpb25zLnF1ZXJ5ICYmICFvcHRpb25zLnJldmVhbFNldHRpbmcpIHtcblx0XHRcdGNvbnN0IHF1ZXJ5ID0gb3B0aW9ucy5xdWVyeS50cmltKCk7XG5cdFx0XHRjb25zdCBpZE1hdGNoID0gcXVlcnkubWF0Y2goL15AaWQ6KC4rKSQvKTtcblx0XHRcdGxldCBrZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChpZE1hdGNoKSB7XG5cdFx0XHRcdGtleSA9IGlkTWF0Y2hbMV0udHJpbSgpO1xuXHRcdFx0fSBlbHNlIGlmIChSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKClbcXVlcnkudHJpbSgpXSkge1xuXHRcdFx0XHRrZXkgPSBxdWVyeS50cmltKCk7XG5cdFx0XHR9XG5cdFx0XHRvcHRpb25zLnF1ZXJ5ID0gdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGtleSkge1xuXHRcdFx0XHRvcHRpb25zLnJldmVhbFNldHRpbmcgPSB7IGtleSB9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBvcHRpb25zLmpzb25FZGl0b3IgP1xuXHRcdFx0dGhpcy5vcGVuU2V0dGluZ3NKc29uKHNldHRpbmdzUmVzb3VyY2UsIG9wdGlvbnMpIDpcblx0XHRcdHRoaXMub3BlblNldHRpbmdzMihvcHRpb25zKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlblNldHRpbmdzMihvcHRpb25zOiBJT3BlblNldHRpbmdzT3B0aW9ucyk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBpbnB1dCA9IHRoaXMuY3JlYXRlT3JHZXRDYWNoZWRTZXR0aW5nc0VkaXRvcjJJbnB1dCgpO1xuXHRcdG9wdGlvbnMgPSB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0Zm9jdXNTZWFyY2g6IHRydWVcblx0XHR9O1xuXHRcdGNvbnN0IGdyb3VwID0gdGhpcy5nZXRFZGl0b3JHcm91cEZyb21PcHRpb25zKG9wdGlvbnMpO1xuXHRcdHJldHVybiB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihpbnB1dCwgdmFsaWRhdGVTZXR0aW5nc0VkaXRvck9wdGlvbnMob3B0aW9ucyksIGdyb3VwKTtcblx0fVxuXG5cdG9wZW5BcHBsaWNhdGlvblNldHRpbmdzKG9wdGlvbnM6IElPcGVuU2V0dGluZ3NPcHRpb25zID0ge30pOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0b3B0aW9ucyA9IHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHR0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCxcblx0XHR9O1xuXHRcdHJldHVybiB0aGlzLm9wZW4odGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlLCBvcHRpb25zKTtcblx0fVxuXG5cdG9wZW5Vc2VyU2V0dGluZ3Mob3B0aW9uczogSU9wZW5TZXR0aW5nc09wdGlvbnMgPSB7fSk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+IHtcblx0XHRvcHRpb25zID0ge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMLFxuXHRcdH07XG5cdFx0cmV0dXJuIHRoaXMub3Blbih0aGlzLnVzZXJTZXR0aW5nc1Jlc291cmNlLCBvcHRpb25zKTtcblx0fVxuXG5cdGFzeW5jIG9wZW5SZW1vdGVTZXR0aW5ncyhvcHRpb25zOiBJT3BlblNldHRpbmdzT3B0aW9ucyA9IHt9KTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGVudmlyb25tZW50ID0gYXdhaXQgdGhpcy5yZW1vdGVBZ2VudFNlcnZpY2UuZ2V0RW52aXJvbm1lbnQoKTtcblx0XHRpZiAoZW52aXJvbm1lbnQpIHtcblx0XHRcdG9wdGlvbnMgPSB7XG5cdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdHRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSxcblx0XHRcdH07XG5cblx0XHRcdHRoaXMub3BlbihlbnZpcm9ubWVudC5zZXR0aW5nc1BhdGgsIG9wdGlvbnMpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0b3BlbldvcmtzcGFjZVNldHRpbmdzKG9wdGlvbnM6IElPcGVuU2V0dGluZ3NPcHRpb25zID0ge30pOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF0aGlzLndvcmtzcGFjZVNldHRpbmdzUmVzb3VyY2UpIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5pbmZvKG5scy5sb2NhbGl6ZSgnb3BlbkZvbGRlckZpcnN0JywgXCJPcGVuIGEgZm9sZGVyIG9yIHdvcmtzcGFjZSBmaXJzdCB0byBjcmVhdGUgd29ya3NwYWNlIG9yIGZvbGRlciBzZXR0aW5ncy5cIikpO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG51bGwpO1xuXHRcdH1cblxuXHRcdG9wdGlvbnMgPSB7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0dGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRVxuXHRcdH07XG5cdFx0cmV0dXJuIHRoaXMub3Blbih0aGlzLndvcmtzcGFjZVNldHRpbmdzUmVzb3VyY2UsIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgb3BlbkZvbGRlclNldHRpbmdzKG9wdGlvbnM6IElPcGVuU2V0dGluZ3NPcHRpb25zID0ge30pOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0b3B0aW9ucyA9IHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHR0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUlxuXHRcdH07XG5cblx0XHRpZiAoIW9wdGlvbnMuZm9sZGVyVXJpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgZm9sZGVyIFVSSWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvbGRlclNldHRpbmdzVXJpID0gYXdhaXQgdGhpcy5nZXRFZGl0YWJsZVNldHRpbmdzVVJJKENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUiwgb3B0aW9ucy5mb2xkZXJVcmkpO1xuXHRcdGlmICghZm9sZGVyU2V0dGluZ3NVcmkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgSW52YWxpZCBmb2xkZXIgVVJJIC0gJHtvcHRpb25zLmZvbGRlclVyaS50b1N0cmluZygpfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLm9wZW4oZm9sZGVyU2V0dGluZ3NVcmksIG9wdGlvbnMpO1xuXHR9XG5cblx0YXN5bmMgb3Blbkdsb2JhbEtleWJpbmRpbmdTZXR0aW5ncyh0ZXh0dWFsOiBib29sZWFuLCBvcHRpb25zPzogSU9wZW5LZXliaW5kaW5nc0VkaXRvck9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRvcHRpb25zID0geyBwaW5uZWQ6IHRydWUsIHJldmVhbElmT3BlbmVkOiB0cnVlLCAuLi5vcHRpb25zIH07XG5cdFx0aWYgKHRleHR1YWwpIHtcblx0XHRcdGNvbnN0IGVtcHR5Q29udGVudHMgPSAnLy8gJyArIG5scy5sb2NhbGl6ZSgnZW1wdHlLZXliaW5kaW5nc0hlYWRlcicsIFwiUGxhY2UgeW91ciBrZXkgYmluZGluZ3MgaW4gdGhpcyBmaWxlIHRvIG92ZXJyaWRlIHRoZSBkZWZhdWx0c1wiKSArICdcXG5bXFxuXSc7XG5cdFx0XHRjb25zdCBlZGl0YWJsZUtleWJpbmRpbmdzID0gdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmtleWJpbmRpbmdzUmVzb3VyY2U7XG5cdFx0XHRjb25zdCBvcGVuRGVmYXVsdEtleWJpbmRpbmdzID0gISF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCd3b3JrYmVuY2guc2V0dGluZ3Mub3BlbkRlZmF1bHRLZXliaW5kaW5ncycpO1xuXG5cdFx0XHQvLyBDcmVhdGUgYXMgbmVlZGVkIGFuZCBvcGVuIGluIGVkaXRvclxuXHRcdFx0YXdhaXQgdGhpcy5jcmVhdGVJZk5vdEV4aXN0cyhlZGl0YWJsZUtleWJpbmRpbmdzLCBlbXB0eUNvbnRlbnRzKTtcblx0XHRcdGlmIChvcGVuRGVmYXVsdEtleWJpbmRpbmdzKSB7XG5cdFx0XHRcdGNvbnN0IHNvdXJjZUdyb3VwSWQgPSBvcHRpb25zLmdyb3VwSWQgPz8gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuYWN0aXZlR3JvdXAuaWQ7XG5cdFx0XHRcdGNvbnN0IHNpZGVFZGl0b3JHcm91cCA9IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFkZEdyb3VwKHNvdXJjZUdyb3VwSWQsIEdyb3VwRGlyZWN0aW9uLlJJR0hUKTtcblx0XHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IHRoaXMuZGVmYXVsdEtleWJpbmRpbmdzUmVzb3VyY2UsIG9wdGlvbnM6IHsgcGlubmVkOiB0cnVlLCBwcmVzZXJ2ZUZvY3VzOiB0cnVlLCByZXZlYWxJZk9wZW5lZDogdHJ1ZSwgb3ZlcnJpZGU6IERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OLmlkIH0sIGxhYmVsOiBubHMubG9jYWxpemUoJ2RlZmF1bHRLZXliaW5kaW5ncycsIFwiRGVmYXVsdCBLZXliaW5kaW5nc1wiKSwgZGVzY3JpcHRpb246ICcnIH0sIHNvdXJjZUdyb3VwSWQpLFxuXHRcdFx0XHRcdHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IGVkaXRhYmxlS2V5YmluZGluZ3MsIG9wdGlvbnMgfSwgc2lkZUVkaXRvckdyb3VwLmlkKVxuXHRcdFx0XHRdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHsgcmVzb3VyY2U6IGVkaXRhYmxlS2V5YmluZGluZ3MsIG9wdGlvbnMgfSwgdGhpcy5nZXRFZGl0b3JHcm91cEZyb21PcHRpb25zKG9wdGlvbnMpKTtcblx0XHRcdH1cblxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBncm91cCA9IHRoaXMuZ2V0RWRpdG9yR3JvdXBGcm9tT3B0aW9ucyhvcHRpb25zKTtcblx0XHRcdGNvbnN0IGVkaXRvciA9IChhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEtleWJpbmRpbmdzRWRpdG9ySW5wdXQpLCB7IC4uLm9wdGlvbnMgfSwgZ3JvdXApKSBhcyBJS2V5YmluZGluZ3NFZGl0b3JQYW5lO1xuXHRcdFx0aWYgKG9wdGlvbnMucXVlcnkpIHtcblx0XHRcdFx0ZWRpdG9yLnNlYXJjaChvcHRpb25zLnF1ZXJ5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0fVxuXG5cdG9wZW5EZWZhdWx0S2V5YmluZGluZ3NGaWxlKCk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogdGhpcy5kZWZhdWx0S2V5YmluZGluZ3NSZXNvdXJjZSwgbGFiZWw6IG5scy5sb2NhbGl6ZSgnZGVmYXVsdEtleWJpbmRpbmdzJywgXCJEZWZhdWx0IEtleWJpbmRpbmdzXCIpIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFZGl0b3JHcm91cEZyb21PcHRpb25zKG9wdGlvbnM6IHsgZ3JvdXBJZD86IG51bWJlcjsgb3BlblRvU2lkZT86IGJvb2xlYW4gfSk6IFByZWZlcnJlZEdyb3VwIHtcblxuXHRcdC8vIFdoZW4gdGhlIGNhbGxlciBrbm93cyB0aGUgc291cmNlIGVkaXRvciBncm91cCAoZS5nLiB0aGUgZWRpdG9yIHRpdGxlIGFjdGlvbnNcblx0XHQvLyBhbmQgdGhlaXIga2V5Ym9hcmQgc2hvcnRjdXRzIHRoYXQgc3dpdGNoIGJldHdlZW4gdGhlIHNldHRpbmdzIFVJIGFuZCBKU09OIGVkaXRvciksXG5cdFx0Ly8gb3BlbiBpbiB0aGF0IHNhbWUgZ3JvdXAgc28gdGhlIGVkaXRvciBzdGF5cyBpbiB0aGUgZWRpdG9yIHBhcnQgKG1haW4sIG1vZGFsIG9yXG5cdFx0Ly8gYXV4aWxpYXJ5IHdpbmRvdykgaXQgd2FzIGludm9rZWQgZnJvbS4gSWYgdGhhdCBncm91cCBsaXZlcyBpbiB0aGUgbW9kYWwgZWRpdG9yIHBhcnQsXG5cdFx0Ly8gcmVxdWVzdCB0aGUgbW9kYWwgZ3JvdXAgc28gaXQgc3RheXMgbW9kYWw7IG90aGVyd2lzZSBvcGVuIGluIHRoYXQgZXhhY3QgZ3JvdXAuIFRoaXNcblx0XHQvLyBpcyBza2lwcGVkIHdoZW4gb3BlbmluZyB0byB0aGUgc2lkZSwgd2hlcmUgYSBuZXcgc2lkZSBncm91cCBpcyBwcmVmZXJyZWQgaW5zdGVhZC5cblx0XHRpZiAob3B0aW9ucz8uZ3JvdXBJZCAhPT0gdW5kZWZpbmVkICYmICFvcHRpb25zLm9wZW5Ub1NpZGUpIHtcblx0XHRcdGNvbnN0IGdyb3VwID0gdGhpcy5lZGl0b3JHcm91cFNlcnZpY2UuZ2V0R3JvdXAob3B0aW9ucy5ncm91cElkKTtcblx0XHRcdGlmIChncm91cCkge1xuXHRcdFx0XHRjb25zdCBtb2RhbEVkaXRvclBhcnQgPSB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5hY3RpdmVNb2RhbEVkaXRvclBhcnQ7XG5cdFx0XHRcdGlmIChtb2RhbEVkaXRvclBhcnQ/Lmdyb3Vwcy5zb21lKG1vZGFsR3JvdXAgPT4gbW9kYWxHcm91cC5pZCA9PT0gZ3JvdXAuaWQpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIE1PREFMX0dST1VQO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBncm91cDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ3dvcmtiZW5jaC5lZGl0b3IudXNlTW9kYWwnKSAhPT0gJ29mZicgJiZcdFx0XHRcdFx0Ly8gbW9kYWwgZWRpdG9ycyBlbmFibGVkIGluIHNldHRpbmdzXG5cdFx0XHQhdGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuZW5hYmxlU21va2VUZXN0RHJpdmVyICYmICF0aGlzLmVudmlyb25tZW50U2VydmljZS5leHRlbnNpb25UZXN0c0xvY2F0aW9uVVJJXHQvLyBidXQgbm90IGluIHNtb2tlIHRlc3Qgb3IgZXh0ZW5zaW9uIHRlc3QgZW52aXJvbm1lbnRzIHRvIHJlZHVjZSBmbGFraW5lc3Ncblx0XHQpIHtcblx0XHRcdHJldHVybiBNT0RBTF9HUk9VUDtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnMub3BlblRvU2lkZSkge1xuXHRcdFx0cmV0dXJuIFNJREVfR1JPVVA7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zPy5ncm91cElkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLmVkaXRvckdyb3VwU2VydmljZS5nZXRHcm91cChvcHRpb25zLmdyb3VwSWQpID8/IHRoaXMuZWRpdG9yR3JvdXBTZXJ2aWNlLmFjdGl2ZUdyb3VwO1xuXHRcdH1cblx0XHRyZXR1cm4gQUNUSVZFX0dST1VQO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvcGVuU2V0dGluZ3NKc29uKHJlc291cmNlOiBVUkksIG9wdGlvbnM6IElPcGVuU2V0dGluZ3NPcHRpb25zKTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGdyb3VwID0gdGhpcy5nZXRFZGl0b3JHcm91cEZyb21PcHRpb25zKG9wdGlvbnMpO1xuXHRcdGNvbnN0IGVkaXRvciA9IGF3YWl0IHRoaXMuZG9PcGVuU2V0dGluZ3NKc29uKHJlc291cmNlLCBvcHRpb25zLCBncm91cCk7XG5cdFx0aWYgKGVkaXRvciAmJiBvcHRpb25zPy5yZXZlYWxTZXR0aW5nKSB7XG5cdFx0XHRhd2FpdCB0aGlzLnJldmVhbFNldHRpbmcob3B0aW9ucy5yZXZlYWxTZXR0aW5nLmtleSwgISFvcHRpb25zLnJldmVhbFNldHRpbmcuZWRpdCwgZWRpdG9yLCByZXNvdXJjZSk7XG5cdFx0fVxuXHRcdHJldHVybiBlZGl0b3I7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvT3BlblNldHRpbmdzSnNvbihyZXNvdXJjZTogVVJJLCBvcHRpb25zOiBJU2V0dGluZ3NFZGl0b3JPcHRpb25zLCBncm91cDogUHJlZmVycmVkR3JvdXApOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgb3BlblNwbGl0SlNPTiA9ICEhdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShVU0VfU1BMSVRfSlNPTl9TRVRUSU5HKTtcblx0XHRjb25zdCBvcGVuRGVmYXVsdFNldHRpbmdzID0gISF0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKERFRkFVTFRfU0VUVElOR1NfRURJVE9SX1NFVFRJTkcpO1xuXHRcdGlmIChvcGVuU3BsaXRKU09OIHx8IG9wZW5EZWZhdWx0U2V0dGluZ3MpIHtcblx0XHRcdHJldHVybiB0aGlzLmRvT3BlblNwbGl0SlNPTihyZXNvdXJjZSwgb3B0aW9ucywgZ3JvdXApO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25UYXJnZXQgPSBvcHRpb25zPy50YXJnZXQgPz8gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSO1xuXHRcdGNvbnN0IGVkaXRhYmxlU2V0dGluZ3NFZGl0b3JJbnB1dCA9IGF3YWl0IHRoaXMuZ2V0T3JDcmVhdGVFZGl0YWJsZVNldHRpbmdzRWRpdG9ySW5wdXQoY29uZmlndXJhdGlvblRhcmdldCwgcmVzb3VyY2UpO1xuXHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIHBpbm5lZDogdHJ1ZSB9O1xuXHRcdHJldHVybiBhd2FpdCB0aGlzLmVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcihlZGl0YWJsZVNldHRpbmdzRWRpdG9ySW5wdXQsIHsgLi4udmFsaWRhdGVTZXR0aW5nc0VkaXRvck9wdGlvbnMob3B0aW9ucykgfSwgZ3JvdXApO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb09wZW5TcGxpdEpTT04ocmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSVNldHRpbmdzRWRpdG9yT3B0aW9ucyA9IHt9LCBncm91cDogUHJlZmVycmVkR3JvdXAsKTogUHJvbWlzZTxJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25UYXJnZXQgPSBvcHRpb25zLnRhcmdldCA/PyBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVI7XG5cdFx0YXdhaXQgdGhpcy5jcmVhdGVTZXR0aW5nc0lmTm90RXhpc3RzKGNvbmZpZ3VyYXRpb25UYXJnZXQsIHJlc291cmNlKTtcblx0XHRjb25zdCBwcmVmZXJlbmNlc0VkaXRvcklucHV0ID0gdGhpcy5jcmVhdGVTcGxpdEpzb25FZGl0b3JJbnB1dChjb25maWd1cmF0aW9uVGFyZ2V0LCByZXNvdXJjZSk7XG5cdFx0b3B0aW9ucyA9IHsgLi4ub3B0aW9ucywgcGlubmVkOiB0cnVlIH07XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHByZWZlcmVuY2VzRWRpdG9ySW5wdXQsIHZhbGlkYXRlU2V0dGluZ3NFZGl0b3JPcHRpb25zKG9wdGlvbnMpLCBncm91cCk7XG5cdH1cblxuXHRwdWJsaWMgY3JlYXRlU3BsaXRKc29uRWRpdG9ySW5wdXQoY29uZmlndXJhdGlvblRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCwgcmVzb3VyY2U6IFVSSSk6IEVkaXRvcklucHV0IHtcblx0XHRjb25zdCBlZGl0YWJsZVNldHRpbmdzRWRpdG9ySW5wdXQgPSB0aGlzLnRleHRFZGl0b3JTZXJ2aWNlLmNyZWF0ZVRleHRFZGl0b3IoeyByZXNvdXJjZSB9KTtcblx0XHRjb25zdCBkZWZhdWx0UHJlZmVyZW5jZXNFZGl0b3JJbnB1dCA9IHRoaXMudGV4dEVkaXRvclNlcnZpY2UuY3JlYXRlVGV4dEVkaXRvcih7IHJlc291cmNlOiB0aGlzLmdldERlZmF1bHRTZXR0aW5nc1Jlc291cmNlKGNvbmZpZ3VyYXRpb25UYXJnZXQpIH0pO1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNpZGVCeVNpZGVFZGl0b3JJbnB1dCwgZWRpdGFibGVTZXR0aW5nc0VkaXRvcklucHV0LmdldE5hbWUoKSwgdW5kZWZpbmVkLCBkZWZhdWx0UHJlZmVyZW5jZXNFZGl0b3JJbnB1dCwgZWRpdGFibGVTZXR0aW5nc0VkaXRvcklucHV0KTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVTZXR0aW5nczJFZGl0b3JNb2RlbCgpOiBTZXR0aW5nczJFZGl0b3JNb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ3MyRWRpdG9yTW9kZWwsIHRoaXMuZ2V0RGVmYXVsdFNldHRpbmdzKENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb25maWd1cmF0aW9uVGFyZ2V0RnJvbURlZmF1bHRTZXR0aW5nc1Jlc291cmNlKHVyaTogVVJJKSB7XG5cdFx0cmV0dXJuIHRoaXMuaXNEZWZhdWx0V29ya3NwYWNlU2V0dGluZ3NSZXNvdXJjZSh1cmkpID9cblx0XHRcdENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFIDpcblx0XHRcdHRoaXMuaXNEZWZhdWx0Rm9sZGVyU2V0dGluZ3NSZXNvdXJjZSh1cmkpID9cblx0XHRcdFx0Q29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSIDpcblx0XHRcdFx0Q29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0RlZmF1bHRTZXR0aW5nc1Jlc291cmNlKHVyaTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaXNEZWZhdWx0VXNlclNldHRpbmdzUmVzb3VyY2UodXJpKSB8fCB0aGlzLmlzRGVmYXVsdFdvcmtzcGFjZVNldHRpbmdzUmVzb3VyY2UodXJpKSB8fCB0aGlzLmlzRGVmYXVsdEZvbGRlclNldHRpbmdzUmVzb3VyY2UodXJpKTtcblx0fVxuXG5cdHByaXZhdGUgaXNEZWZhdWx0VXNlclNldHRpbmdzUmVzb3VyY2UodXJpOiBVUkkpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdXJpLmF1dGhvcml0eSA9PT0gJ2RlZmF1bHRzZXR0aW5ncycgJiYgdXJpLnNjaGVtZSA9PT0gbmV0d29yay5TY2hlbWFzLnZzY29kZSAmJiAhIXVyaS5wYXRoLm1hdGNoKC9cXC8oXFxkK1xcLyk/c2V0dGluZ3NcXC5qc29uJC8pO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0RlZmF1bHRXb3Jrc3BhY2VTZXR0aW5nc1Jlc291cmNlKHVyaTogVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHVyaS5hdXRob3JpdHkgPT09ICdkZWZhdWx0c2V0dGluZ3MnICYmIHVyaS5zY2hlbWUgPT09IG5ldHdvcmsuU2NoZW1hcy52c2NvZGUgJiYgISF1cmkucGF0aC5tYXRjaCgvXFwvKFxcZCtcXC8pP3dvcmtzcGFjZVNldHRpbmdzXFwuanNvbiQvKTtcblx0fVxuXG5cdHByaXZhdGUgaXNEZWZhdWx0Rm9sZGVyU2V0dGluZ3NSZXNvdXJjZSh1cmk6IFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB1cmkuYXV0aG9yaXR5ID09PSAnZGVmYXVsdHNldHRpbmdzJyAmJiB1cmkuc2NoZW1lID09PSBuZXR3b3JrLlNjaGVtYXMudnNjb2RlICYmICEhdXJpLnBhdGgubWF0Y2goL1xcLyhcXGQrXFwvKT9yZXNvdXJjZVNldHRpbmdzXFwuanNvbiQvKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVmYXVsdFNldHRpbmdzUmVzb3VyY2UoY29uZmlndXJhdGlvblRhcmdldDogQ29uZmlndXJhdGlvblRhcmdldCk6IFVSSSB7XG5cdFx0c3dpdGNoIChjb25maWd1cmF0aW9uVGFyZ2V0KSB7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFOlxuXHRcdFx0XHRyZXR1cm4gVVJJLmZyb20oeyBzY2hlbWU6IG5ldHdvcmsuU2NoZW1hcy52c2NvZGUsIGF1dGhvcml0eTogJ2RlZmF1bHRzZXR0aW5ncycsIHBhdGg6IGAvd29ya3NwYWNlU2V0dGluZ3MuanNvbmAgfSk7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUjpcblx0XHRcdFx0cmV0dXJuIFVSSS5mcm9tKHsgc2NoZW1lOiBuZXR3b3JrLlNjaGVtYXMudnNjb2RlLCBhdXRob3JpdHk6ICdkZWZhdWx0c2V0dGluZ3MnLCBwYXRoOiBgL3Jlc291cmNlU2V0dGluZ3MuanNvbmAgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogbmV0d29yay5TY2hlbWFzLnZzY29kZSwgYXV0aG9yaXR5OiAnZGVmYXVsdHNldHRpbmdzJywgcGF0aDogYC9zZXR0aW5ncy5qc29uYCB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0T3JDcmVhdGVFZGl0YWJsZVNldHRpbmdzRWRpdG9ySW5wdXQodGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LCByZXNvdXJjZTogVVJJKTogUHJvbWlzZTxFZGl0b3JJbnB1dD4ge1xuXHRcdGF3YWl0IHRoaXMuY3JlYXRlU2V0dGluZ3NJZk5vdEV4aXN0cyh0YXJnZXQsIHJlc291cmNlKTtcblx0XHRyZXR1cm4gdGhpcy50ZXh0RWRpdG9yU2VydmljZS5jcmVhdGVUZXh0RWRpdG9yKHsgcmVzb3VyY2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNyZWF0ZUVkaXRhYmxlU2V0dGluZ3NFZGl0b3JNb2RlbChjb25maWd1cmF0aW9uVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LCBzZXR0aW5nc1VyaTogVVJJKTogUHJvbWlzZTxTZXR0aW5nc0VkaXRvck1vZGVsPiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRpZiAod29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gJiYgd29ya3NwYWNlLmNvbmZpZ3VyYXRpb24udG9TdHJpbmcoKSA9PT0gc2V0dGluZ3NVcmkudG9TdHJpbmcoKSkge1xuXHRcdFx0Y29uc3QgcmVmZXJlbmNlID0gYXdhaXQgdGhpcy50ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2Uoc2V0dGluZ3NVcmkpO1xuXHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya3NwYWNlQ29uZmlndXJhdGlvbkVkaXRvck1vZGVsLCByZWZlcmVuY2UsIGNvbmZpZ3VyYXRpb25UYXJnZXQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlZmVyZW5jZSA9IGF3YWl0IHRoaXMudGV4dE1vZGVsUmVzb2x2ZXJTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKHNldHRpbmdzVXJpKTtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nc0VkaXRvck1vZGVsLCByZWZlcmVuY2UsIGNvbmZpZ3VyYXRpb25UYXJnZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjcmVhdGVEZWZhdWx0U2V0dGluZ3NFZGl0b3JNb2RlbChkZWZhdWx0U2V0dGluZ3NVcmk6IFVSSSk6IFByb21pc2U8RGVmYXVsdFNldHRpbmdzRWRpdG9yTW9kZWw+IHtcblx0XHRjb25zdCByZWZlcmVuY2UgPSBhd2FpdCB0aGlzLnRleHRNb2RlbFJlc29sdmVyU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShkZWZhdWx0U2V0dGluZ3NVcmkpO1xuXHRcdGNvbnN0IHRhcmdldCA9IHRoaXMuZ2V0Q29uZmlndXJhdGlvblRhcmdldEZyb21EZWZhdWx0U2V0dGluZ3NSZXNvdXJjZShkZWZhdWx0U2V0dGluZ3NVcmkpO1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlZmF1bHRTZXR0aW5nc0VkaXRvck1vZGVsLCBkZWZhdWx0U2V0dGluZ3NVcmksIHJlZmVyZW5jZSwgdGhpcy5nZXREZWZhdWx0U2V0dGluZ3ModGFyZ2V0KSk7XG5cdH1cblxuXHRwcml2YXRlIGdldERlZmF1bHRTZXR0aW5ncyh0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQpOiBEZWZhdWx0U2V0dGluZ3Mge1xuXHRcdGlmICh0YXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKSB7XG5cdFx0XHR0aGlzLl9kZWZhdWx0V29ya3NwYWNlU2V0dGluZ3NDb250ZW50TW9kZWwgPz89IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWZhdWx0U2V0dGluZ3ModGhpcy5nZXRNb3N0Q29tbW9ubHlVc2VkU2V0dGluZ3MoKSwgdGFyZ2V0LCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZGVmYXVsdFdvcmtzcGFjZVNldHRpbmdzQ29udGVudE1vZGVsO1xuXHRcdH1cblx0XHRpZiAodGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIpIHtcblx0XHRcdHRoaXMuX2RlZmF1bHRGb2xkZXJTZXR0aW5nc0NvbnRlbnRNb2RlbCA/Pz0gdGhpcy5fcmVnaXN0ZXIobmV3IERlZmF1bHRTZXR0aW5ncyh0aGlzLmdldE1vc3RDb21tb25seVVzZWRTZXR0aW5ncygpLCB0YXJnZXQsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRcdHJldHVybiB0aGlzLl9kZWZhdWx0Rm9sZGVyU2V0dGluZ3NDb250ZW50TW9kZWw7XG5cdFx0fVxuXHRcdHRoaXMuX2RlZmF1bHRVc2VyU2V0dGluZ3NDb250ZW50TW9kZWwgPz89IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWZhdWx0U2V0dGluZ3ModGhpcy5nZXRNb3N0Q29tbW9ubHlVc2VkU2V0dGluZ3MoKSwgdGFyZ2V0LCB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHRVc2VyU2V0dGluZ3NDb250ZW50TW9kZWw7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgZ2V0RWRpdGFibGVTZXR0aW5nc1VSSShjb25maWd1cmF0aW9uVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LCByZXNvdXJjZT86IFVSSSk6IFByb21pc2U8VVJJIHwgbnVsbD4ge1xuXHRcdHN3aXRjaCAoY29uZmlndXJhdGlvblRhcmdldCkge1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LkFQUExJQ0FUSU9OOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVzU2VydmljZS5kZWZhdWx0UHJvZmlsZS5zZXR0aW5nc1Jlc291cmNlO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVI6XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDpcblx0XHRcdFx0cmV0dXJuIHRoaXMudXNlclNldHRpbmdzUmVzb3VyY2U7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEU6IHtcblx0XHRcdFx0Y29uc3QgcmVtb3RlRW52aXJvbm1lbnQgPSBhd2FpdCB0aGlzLnJlbW90ZUFnZW50U2VydmljZS5nZXRFbnZpcm9ubWVudCgpO1xuXHRcdFx0XHRyZXR1cm4gcmVtb3RlRW52aXJvbm1lbnQgPyByZW1vdGVFbnZpcm9ubWVudC5zZXR0aW5nc1BhdGggOiBudWxsO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTpcblx0XHRcdFx0cmV0dXJuIHRoaXMud29ya3NwYWNlU2V0dGluZ3NSZXNvdXJjZTtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSOlxuXHRcdFx0XHRpZiAocmVzb3VyY2UpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRGb2xkZXJTZXR0aW5nc1Jlc291cmNlKHJlc291cmNlKTtcblx0XHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlU2V0dGluZ3NJZk5vdEV4aXN0cyh0YXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQsIHJlc291cmNlOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0UgJiYgdGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlQ29uZmlnID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5jb25maWd1cmF0aW9uO1xuXHRcdFx0aWYgKCF3b3Jrc3BhY2VDb25maWcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy50ZXh0RmlsZVNlcnZpY2UucmVhZCh3b3Jrc3BhY2VDb25maWcpO1xuXHRcdFx0aWYgKE9iamVjdC5rZXlzKHBhcnNlKGNvbnRlbnQudmFsdWUpKS5pbmRleE9mKCdzZXR0aW5ncycpID09PSAtMSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmpzb25FZGl0aW5nU2VydmljZS53cml0ZShyZXNvdXJjZSwgW3sgcGF0aDogWydzZXR0aW5ncyddLCB2YWx1ZToge30gfV0sIHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRhd2FpdCB0aGlzLmNyZWF0ZUlmTm90RXhpc3RzKHJlc291cmNlLCBlbXB0eUVkaXRhYmxlU2V0dGluZ3NDb250ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY3JlYXRlSWZOb3RFeGlzdHMocmVzb3VyY2U6IFVSSSwgY29udGVudHM6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLnRleHRGaWxlU2VydmljZS5yZWFkKHJlc291cmNlLCB7IGFjY2VwdFRleHRPbmx5OiB0cnVlIH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoKDxGaWxlT3BlcmF0aW9uRXJyb3I+ZXJyb3IpLmZpbGVPcGVyYXRpb25SZXN1bHQgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLnRleHRGaWxlU2VydmljZS53cml0ZShyZXNvdXJjZSwgY29udGVudHMpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fSBjYXRjaCAoZXJyb3IyKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKG5scy5sb2NhbGl6ZSgnZmFpbC5jcmVhdGVTZXR0aW5ncycsIFwiVW5hYmxlIHRvIGNyZWF0ZSAnezB9JyAoezF9KS5cIiwgdGhpcy5sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwocmVzb3VyY2UsIHsgcmVsYXRpdmU6IHRydWUgfSksIGdldEVycm9yTWVzc2FnZShlcnJvcjIpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRocm93IGVycm9yO1xuXHRcdFx0fVxuXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRNb3N0Q29tbW9ubHlVc2VkU2V0dGluZ3MoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBbXG5cdFx0XHQnZWRpdG9yLmZvbnRTaXplJyxcblx0XHRcdCdlZGl0b3IuZm9ybWF0T25TYXZlJyxcblx0XHRcdCdmaWxlcy5hdXRvU2F2ZScsXG5cdFx0XHQnZWRpdG9yLmRlZmF1bHRGb3JtYXR0ZXInLFxuXHRcdFx0J2VkaXRvci5mb250RmFtaWx5Jyxcblx0XHRcdCdlZGl0b3Iud29yZFdyYXAnLFxuXHRcdFx0J2NoYXQuYWdlbnQubWF4UmVxdWVzdHMnLFxuXHRcdFx0J2ZpbGVzLmV4Y2x1ZGUnLFxuXHRcdFx0J3dvcmtiZW5jaC5jb2xvclRoZW1lJyxcblx0XHRcdCdlZGl0b3IudGFiU2l6ZScsXG5cdFx0XHQnZWRpdG9yLm1vdXNlV2hlZWxab29tJyxcblx0XHRcdCdlZGl0b3IuZm9ybWF0T25QYXN0ZSdcblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXZlYWxTZXR0aW5nKHNldHRpbmdLZXk6IHN0cmluZywgZWRpdDogYm9vbGVhbiwgZWRpdG9yOiBJRWRpdG9yUGFuZSwgc2V0dGluZ3NSZXNvdXJjZTogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY29kZUVkaXRvciA9IGVkaXRvciA/IGdldENvZGVFZGl0b3IoZWRpdG9yLmdldENvbnRyb2woKSkgOiBudWxsO1xuXHRcdGlmICghY29kZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXR0aW5nc01vZGVsID0gYXdhaXQgdGhpcy5jcmVhdGVQcmVmZXJlbmNlc0VkaXRvck1vZGVsKHNldHRpbmdzUmVzb3VyY2UpO1xuXHRcdGlmICghc2V0dGluZ3NNb2RlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBwb3NpdGlvbiA9IGF3YWl0IHRoaXMuZ2V0UG9zaXRpb25Ub1JldmVhbChzZXR0aW5nS2V5LCBlZGl0LCBzZXR0aW5nc01vZGVsLCBjb2RlRWRpdG9yKTtcblx0XHRpZiAocG9zaXRpb24pIHtcblx0XHRcdGNvZGVFZGl0b3Iuc2V0UG9zaXRpb24ocG9zaXRpb24pO1xuXHRcdFx0Y29kZUVkaXRvci5yZXZlYWxQb3NpdGlvbk5lYXJUb3AocG9zaXRpb24pO1xuXHRcdFx0Y29kZUVkaXRvci5mb2N1cygpO1xuXHRcdFx0aWYgKGVkaXQpIHtcblx0XHRcdFx0U3VnZ2VzdENvbnRyb2xsZXIuZ2V0KGNvZGVFZGl0b3IpPy50cmlnZ2VyU3VnZ2VzdCgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0UG9zaXRpb25Ub1JldmVhbChzZXR0aW5nS2V5OiBzdHJpbmcsIGVkaXQ6IGJvb2xlYW4sIHNldHRpbmdzTW9kZWw6IElQcmVmZXJlbmNlc0VkaXRvck1vZGVsPElTZXR0aW5nPiwgY29kZUVkaXRvcjogSUNvZGVFZGl0b3IpOiBQcm9taXNlPElQb3NpdGlvbiB8IG51bGw+IHtcblx0XHRjb25zdCBtb2RlbCA9IGNvZGVFZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cdFx0Y29uc3Qgc2NoZW1hID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpW3NldHRpbmdLZXldO1xuXHRcdGNvbnN0IGlzT3ZlcnJpZGVQcm9wZXJ0eSA9IE9WRVJSSURFX1BST1BFUlRZX1JFR0VYLnRlc3Qoc2V0dGluZ0tleSk7XG5cdFx0aWYgKCFzY2hlbWEgJiYgIWlzT3ZlcnJpZGVQcm9wZXJ0eSkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0bGV0IHBvc2l0aW9uID0gbnVsbDtcblx0XHRjb25zdCB0eXBlID0gc2NoZW1hPy50eXBlID8/ICdvYmplY3QnIC8qIFR5cGUgbm90IGRlZmluZWQgb3IgaXMgYW4gT3ZlcnJpZGUgSWRlbnRpZmllciAqLztcblx0XHRsZXQgc2V0dGluZyA9IHNldHRpbmdzTW9kZWwuZ2V0UHJlZmVyZW5jZShzZXR0aW5nS2V5KTtcblx0XHRpZiAoIXNldHRpbmcgJiYgZWRpdCkge1xuXHRcdFx0bGV0IGRlZmF1bHRWYWx1ZSA9ICh0eXBlID09PSAnb2JqZWN0JyB8fCB0eXBlID09PSAnYXJyYXknKSA/IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdChzZXR0aW5nS2V5KS5kZWZhdWx0VmFsdWUgOiBnZXREZWZhdWx0VmFsdWUodHlwZSk7XG5cdFx0XHRkZWZhdWx0VmFsdWUgPSBkZWZhdWx0VmFsdWUgPT09IHVuZGVmaW5lZCAmJiBpc092ZXJyaWRlUHJvcGVydHkgPyB7fSA6IGRlZmF1bHRWYWx1ZTtcblx0XHRcdGlmIChkZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBrZXkgPSBzZXR0aW5nc01vZGVsIGluc3RhbmNlb2YgV29ya3NwYWNlQ29uZmlndXJhdGlvbkVkaXRvck1vZGVsID8gWydzZXR0aW5ncycsIHNldHRpbmdLZXldIDogW3NldHRpbmdLZXldO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmpzb25FZGl0aW5nU2VydmljZS53cml0ZShzZXR0aW5nc01vZGVsLnVyaSEsIFt7IHBhdGg6IGtleSwgdmFsdWU6IGRlZmF1bHRWYWx1ZSB9XSwgZmFsc2UpO1xuXHRcdFx0XHRzZXR0aW5nID0gc2V0dGluZ3NNb2RlbC5nZXRQcmVmZXJlbmNlKHNldHRpbmdLZXkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChzZXR0aW5nKSB7XG5cdFx0XHRpZiAoZWRpdCkge1xuXHRcdFx0XHRpZiAoaXNPYmplY3Qoc2V0dGluZy52YWx1ZSkgfHwgQXJyYXkuaXNBcnJheShzZXR0aW5nLnZhbHVlKSkge1xuXHRcdFx0XHRcdHBvc2l0aW9uID0geyBsaW5lTnVtYmVyOiBzZXR0aW5nLnZhbHVlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBjb2x1bW46IHNldHRpbmcudmFsdWVSYW5nZS5zdGFydENvbHVtbiArIDEgfTtcblx0XHRcdFx0XHRjb2RlRWRpdG9yLnNldFBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0XHRcdHJldHVybiBDb3JlRWRpdGluZ0NvbW1hbmRzLkxpbmVCcmVha0luc2VydC5ydW5FZGl0b3JDb21tYW5kKGFjY2Vzc29yLCBjb2RlRWRpdG9yLCBudWxsKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRwb3NpdGlvbiA9IHsgbGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlciArIDEsIGNvbHVtbjogbW9kZWwuZ2V0TGluZU1heENvbHVtbihwb3NpdGlvbi5saW5lTnVtYmVyICsgMSkgfTtcblx0XHRcdFx0XHRjb25zdCBmaXJzdE5vbldoaXRlU3BhY2VDb2x1bW4gPSBtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdGlmIChmaXJzdE5vbldoaXRlU3BhY2VDb2x1bW4pIHtcblx0XHRcdFx0XHRcdC8vIExpbmUgaGFzIHNvbWUgdGV4dC4gSW5zZXJ0IGFub3RoZXIgbmV3IGxpbmUuXG5cdFx0XHRcdFx0XHRjb2RlRWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlciwgY29sdW1uOiBmaXJzdE5vbldoaXRlU3BhY2VDb2x1bW4gfSk7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIENvcmVFZGl0aW5nQ29tbWFuZHMuTGluZUJyZWFrSW5zZXJ0LnJ1bkVkaXRvckNvbW1hbmQoYWNjZXNzb3IsIGNvZGVFZGl0b3IsIG51bGwpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHRwb3NpdGlvbiA9IHsgbGluZU51bWJlcjogcG9zaXRpb24ubGluZU51bWJlciwgY29sdW1uOiBtb2RlbC5nZXRMaW5lTWF4Q29sdW1uKHBvc2l0aW9uLmxpbmVOdW1iZXIpIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHBvc2l0aW9uID0geyBsaW5lTnVtYmVyOiBzZXR0aW5nLnZhbHVlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBjb2x1bW46IHNldHRpbmcudmFsdWVSYW5nZS5lbmRDb2x1bW4gfTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cG9zaXRpb24gPSB7IGxpbmVOdW1iZXI6IHNldHRpbmcua2V5UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBjb2x1bW46IHNldHRpbmcua2V5UmFuZ2Uuc3RhcnRDb2x1bW4gfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcG9zaXRpb247XG5cdH1cblxuXHRnZXRTZXR0aW5nKHNldHRpbmdJZDogc3RyaW5nKTogSVNldHRpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5fc2V0dGluZ3NHcm91cHMpIHtcblx0XHRcdGNvbnN0IGRlZmF1bHRTZXR0aW5ncyA9IHRoaXMuZ2V0RGVmYXVsdFNldHRpbmdzKENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdFx0XHRjb25zdCBkZWZhdWx0c0NoYW5nZWREaXNwb3NhYmxlOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0XHRkZWZhdWx0c0NoYW5nZWREaXNwb3NhYmxlLnZhbHVlID0gZGVmYXVsdFNldHRpbmdzLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fc2V0dGluZ3NHcm91cHMgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGRlZmF1bHRzQ2hhbmdlZERpc3Bvc2FibGUuY2xlYXIoKTtcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5fc2V0dGluZ3NHcm91cHMgPSBkZWZhdWx0U2V0dGluZ3MuZ2V0U2V0dGluZ3NHcm91cHMoKTtcblx0XHR9XG5cblx0XHRmb3IgKGNvbnN0IGdyb3VwIG9mIHRoaXMuX3NldHRpbmdzR3JvdXBzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlY3Rpb24gb2YgZ3JvdXAuc2VjdGlvbnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHNlY3Rpb24uc2V0dGluZ3MpIHtcblx0XHRcdFx0XHRpZiAoY29tcGFyZUlnbm9yZUNhc2Uoc2V0dGluZy5rZXksIHNldHRpbmdJZCkgPT09IDApIHtcblx0XHRcdFx0XHRcdHJldHVybiBzZXR0aW5nO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNob3VsZCBiZSBvZiB0aGUgZm9ybWF0OlxuXHQgKiBcdGNvZGU6Ly9zZXR0aW5ncy9zZXR0aW5nTmFtZVxuXHQgKiBFeGFtcGxlczpcblx0ICogXHRjb2RlOi8vc2V0dGluZ3MvZmlsZXMuYXV0b1NhdmVcblx0ICpcblx0ICovXG5cdGFzeW5jIGhhbmRsZVVSTCh1cmk6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGlmIChjb21wYXJlSWdub3JlQ2FzZSh1cmkuYXV0aG9yaXR5LCBTRVRUSU5HU19BVVRIT1JJVFkpICE9PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2V0dGluZ0luZm8gPSB1cmkucGF0aC5zcGxpdCgnLycpLmZpbHRlcihwYXJ0ID0+ICEhcGFydCk7XG5cdFx0Y29uc3Qgc2V0dGluZ0lkID0gKChzZXR0aW5nSW5mby5sZW5ndGggPiAwKSA/IHNldHRpbmdJbmZvWzBdIDogdW5kZWZpbmVkKTtcblx0XHRpZiAoIXNldHRpbmdJZCkge1xuXHRcdFx0dGhpcy5vcGVuU2V0dGluZ3MoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGxldCBzZXR0aW5nID0gdGhpcy5nZXRTZXR0aW5nKHNldHRpbmdJZCk7XG5cblx0XHRpZiAoIXNldHRpbmcgJiYgdGhpcy5leHRlbnNpb25TZXJ2aWNlLmV4dGVuc2lvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHQvLyB3YWl0IGZvciBleHRlbnNpb24gcG9pbnRzIHRvIGJlIHByb2Nlc3NlZFxuXHRcdFx0YXdhaXQgdGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgbG9jYXRpb246IFByb2dyZXNzTG9jYXRpb24uV2luZG93IH0sICgpID0+IEV2ZW50LnRvUHJvbWlzZSh0aGlzLmV4dGVuc2lvblNlcnZpY2Uub25EaWRSZWdpc3RlckV4dGVuc2lvbnMpKTtcblx0XHRcdHNldHRpbmcgPSB0aGlzLmdldFNldHRpbmcoc2V0dGluZ0lkKTtcblx0XHR9XG5cblx0XHRjb25zdCBvcGVuU2V0dGluZ3NPcHRpb25zOiBJT3BlblNldHRpbmdzT3B0aW9ucyA9IHt9O1xuXHRcdGlmIChzZXR0aW5nKSB7XG5cdFx0XHRvcGVuU2V0dGluZ3NPcHRpb25zLnF1ZXJ5ID0gc2V0dGluZ0lkO1xuXHRcdH1cblxuXHRcdHRoaXMub3BlblNldHRpbmdzKG9wZW5TZXR0aW5nc09wdGlvbnMpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NhY2hlZFNldHRpbmdzRWRpdG9yMklucHV0ICYmICF0aGlzLl9jYWNoZWRTZXR0aW5nc0VkaXRvcjJJbnB1dC5pc0Rpc3Bvc2VkKCkpIHtcblx0XHRcdHRoaXMuX2NhY2hlZFNldHRpbmdzRWRpdG9yMklucHV0LmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fb25EaXNwb3NlLmZpcmUoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVByZWZlcmVuY2VzU2VydmljZSwgUHJlZmVyZW5jZXNTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBeUIseUJBQXlCO0FBQzNELFlBQVksYUFBYTtBQUN6QixTQUFTLFdBQVc7QUFDcEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxxQkFBa0M7QUFFM0MsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx5QkFBeUI7QUFDbEMsWUFBWSxTQUFTO0FBQ3JCLFNBQVMscUJB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
