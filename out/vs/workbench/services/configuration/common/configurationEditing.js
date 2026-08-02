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
import * as nls from "../../../../nls.js";
import * as json from "../../../../base/common/json.js";
import { setProperty } from "../../../../base/common/jsonEdit.js";
import { Queue } from "../../../../base/common/async.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { ITextFileService } from "../../textfile/common/textfiles.js";
import { FOLDER_SETTINGS_PATH, WORKSPACE_STANDALONE_CONFIGURATIONS, TASKS_CONFIGURATION_KEY, LAUNCH_CONFIGURATION_KEY, USER_STANDALONE_CONFIGURATIONS, TASKS_DEFAULT, FOLDER_SCOPES, IWorkbenchConfigurationService, APPLICATION_SCOPES, MCP_CONFIGURATION_KEY } from "./configuration.js";
import { FileOperationResult, IFileService } from "../../../../platform/files/common/files.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope, keyFromOverrideIdentifiers, OVERRIDE_PROPERTY_REGEX } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { IPreferencesService } from "../../preferences/common/preferences.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { Range } from "../../../../editor/common/core/range.js";
import { EditOperation } from "../../../../editor/common/core/editOperation.js";
import { Selection } from "../../../../editor/common/core/selection.js";
import { IUserDataProfileService } from "../../userDataProfile/common/userDataProfile.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { ErrorNoTelemetry } from "../../../../base/common/errors.js";
import { IFilesConfigurationService } from "../../filesConfiguration/common/filesConfigurationService.js";
var ConfigurationEditingErrorCode = /* @__PURE__ */ ((ConfigurationEditingErrorCode2) => {
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_UNKNOWN_KEY"] = 0] = "ERROR_UNKNOWN_KEY";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION"] = 1] = "ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE"] = 2] = "ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INVALID_FOLDER_CONFIGURATION"] = 3] = "ERROR_INVALID_FOLDER_CONFIGURATION";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INVALID_USER_TARGET"] = 4] = "ERROR_INVALID_USER_TARGET";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INVALID_WORKSPACE_TARGET"] = 5] = "ERROR_INVALID_WORKSPACE_TARGET";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INVALID_FOLDER_TARGET"] = 6] = "ERROR_INVALID_FOLDER_TARGET";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INVALID_RESOURCE_LANGUAGE_CONFIGURATION"] = 7] = "ERROR_INVALID_RESOURCE_LANGUAGE_CONFIGURATION";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_NO_WORKSPACE_OPENED"] = 8] = "ERROR_NO_WORKSPACE_OPENED";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_CONFIGURATION_FILE_DIRTY"] = 9] = "ERROR_CONFIGURATION_FILE_DIRTY";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_CONFIGURATION_FILE_MODIFIED_SINCE"] = 10] = "ERROR_CONFIGURATION_FILE_MODIFIED_SINCE";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INVALID_CONFIGURATION"] = 11] = "ERROR_INVALID_CONFIGURATION";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_POLICY_CONFIGURATION"] = 12] = "ERROR_POLICY_CONFIGURATION";
  ConfigurationEditingErrorCode2[ConfigurationEditingErrorCode2["ERROR_INTERNAL"] = 13] = "ERROR_INTERNAL";
  return ConfigurationEditingErrorCode2;
})(ConfigurationEditingErrorCode || {});
class ConfigurationEditingError extends ErrorNoTelemetry {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
var EditableConfigurationTarget = /* @__PURE__ */ ((EditableConfigurationTarget2) => {
  EditableConfigurationTarget2[EditableConfigurationTarget2["USER_LOCAL"] = 1] = "USER_LOCAL";
  EditableConfigurationTarget2[EditableConfigurationTarget2["USER_REMOTE"] = 2] = "USER_REMOTE";
  EditableConfigurationTarget2[EditableConfigurationTarget2["WORKSPACE"] = 3] = "WORKSPACE";
  EditableConfigurationTarget2[EditableConfigurationTarget2["WORKSPACE_FOLDER"] = 4] = "WORKSPACE_FOLDER";
  return EditableConfigurationTarget2;
})(EditableConfigurationTarget || {});
let ConfigurationEditing = class {
  constructor(remoteSettingsResource, configurationService, contextService, userDataProfileService, userDataProfilesService, fileService, textModelResolverService, textFileService, notificationService, preferencesService, editorService, uriIdentityService, filesConfigurationService) {
    this.remoteSettingsResource = remoteSettingsResource;
    this.configurationService = configurationService;
    this.contextService = contextService;
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.fileService = fileService;
    this.textModelResolverService = textModelResolverService;
    this.textFileService = textFileService;
    this.notificationService = notificationService;
    this.preferencesService = preferencesService;
    this.editorService = editorService;
    this.uriIdentityService = uriIdentityService;
    this.filesConfigurationService = filesConfigurationService;
    this.queue = new Queue();
  }
  async writeConfiguration(target, value, options = {}) {
    const operation = this.getConfigurationEditOperation(target, value, options.scopes || {});
    return this.queue.queue(async () => {
      try {
        await this.doWriteConfiguration(operation, options);
      } catch (error) {
        if (options.donotNotifyError) {
          throw error;
        }
        await this.onError(error, operation, options.scopes);
      }
    });
  }
  async doWriteConfiguration(operation, options) {
    await this.validate(operation.target, operation, !options.handleDirtyFile, options.scopes || {});
    const resource = operation.resource;
    const reference = await this.resolveModelReference(resource);
    try {
      const formattingOptions = this.getFormattingOptions(reference.object.textEditorModel);
      await this.updateConfiguration(operation, reference.object.textEditorModel, formattingOptions, options);
    } finally {
      reference.dispose();
    }
  }
  async updateConfiguration(operation, model, formattingOptions, options) {
    if (this.hasParseErrors(model.getValue(), operation)) {
      throw this.toConfigurationEditingError(11 /* ERROR_INVALID_CONFIGURATION */, operation.target, operation);
    }
    if (this.textFileService.isDirty(model.uri) && options.handleDirtyFile) {
      switch (options.handleDirtyFile) {
        case "save":
          await this.save(model, operation);
          break;
        case "revert":
          await this.textFileService.revert(model.uri);
          break;
      }
    }
    const edit = this.getEdits(operation, model.getValue(), formattingOptions)[0];
    if (edit) {
      let disposable;
      try {
        disposable = this.filesConfigurationService.enableAutoSaveAfterShortDelay(model.uri);
        if (this.applyEditsToBuffer(edit, model)) {
          await this.save(model, operation);
        }
      } finally {
        disposable?.dispose();
      }
    }
  }
  async save(model, operation) {
    try {
      await this.textFileService.save(model.uri, { ignoreErrorHandler: true });
    } catch (error) {
      if (error.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
        throw this.toConfigurationEditingError(10 /* ERROR_CONFIGURATION_FILE_MODIFIED_SINCE */, operation.target, operation);
      }
      throw new ConfigurationEditingError(nls.localize("fsError", "Error while writing to {0}. {1}", this.stringifyTarget(operation.target), error.message), 13 /* ERROR_INTERNAL */);
    }
  }
  applyEditsToBuffer(edit, model) {
    const startPosition = model.getPositionAt(edit.offset);
    const endPosition = model.getPositionAt(edit.offset + edit.length);
    const range = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
    const currentText = model.getValueInRange(range);
    if (edit.content !== currentText) {
      const editOperation = currentText ? EditOperation.replace(range, edit.content) : EditOperation.insert(startPosition, edit.content);
      model.pushEditOperations([new Selection(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column)], [editOperation], () => []);
      return true;
    }
    return false;
  }
  getEdits({ value, jsonPath }, modelContent, formattingOptions) {
    if (jsonPath.length) {
      return setProperty(modelContent, jsonPath, value, formattingOptions);
    }
    const content = JSON.stringify(value, null, formattingOptions.insertSpaces && formattingOptions.tabSize ? " ".repeat(formattingOptions.tabSize) : "	");
    return [{
      content,
      length: modelContent.length,
      offset: 0
    }];
  }
  getFormattingOptions(model) {
    const { insertSpaces, tabSize } = model.getOptions();
    const eol = model.getEOL();
    return { insertSpaces, tabSize, eol };
  }
  async onError(error, operation, scopes) {
    switch (error.code) {
      case 11 /* ERROR_INVALID_CONFIGURATION */:
        this.onInvalidConfigurationError(error, operation);
        break;
      case 9 /* ERROR_CONFIGURATION_FILE_DIRTY */:
        this.onConfigurationFileDirtyError(error, operation, scopes);
        break;
      case 10 /* ERROR_CONFIGURATION_FILE_MODIFIED_SINCE */:
        return this.doWriteConfiguration(operation, { scopes, handleDirtyFile: "revert" });
      default:
        this.notificationService.error(error.message);
    }
  }
  onInvalidConfigurationError(error, operation) {
    const openStandAloneConfigurationActionLabel = operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY ? nls.localize("openTasksConfiguration", "Open Tasks Configuration") : operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY ? nls.localize("openLaunchConfiguration", "Open Launch Configuration") : operation.workspaceStandAloneConfigurationKey === MCP_CONFIGURATION_KEY ? nls.localize("openMcpConfiguration", "Open MCP Configuration") : null;
    if (openStandAloneConfigurationActionLabel) {
      this.notificationService.prompt(
        Severity.Error,
        error.message,
        [{
          label: openStandAloneConfigurationActionLabel,
          run: () => this.openFile(operation.resource)
        }]
      );
    } else {
      this.notificationService.prompt(
        Severity.Error,
        error.message,
        [{
          label: nls.localize("open", "Open Settings"),
          run: () => this.openSettings(operation)
        }]
      );
    }
  }
  onConfigurationFileDirtyError(error, operation, scopes) {
    const openStandAloneConfigurationActionLabel = operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY ? nls.localize("openTasksConfiguration", "Open Tasks Configuration") : operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY ? nls.localize("openLaunchConfiguration", "Open Launch Configuration") : null;
    if (openStandAloneConfigurationActionLabel) {
      this.notificationService.prompt(
        Severity.Error,
        error.message,
        [
          {
            label: nls.localize("saveAndRetry", "Save and Retry"),
            run: () => {
              const key = operation.key ? `${operation.workspaceStandAloneConfigurationKey}.${operation.key}` : operation.workspaceStandAloneConfigurationKey;
              this.writeConfiguration(operation.target, { key, value: operation.value }, { handleDirtyFile: "save", scopes });
            }
          },
          {
            label: openStandAloneConfigurationActionLabel,
            run: () => this.openFile(operation.resource)
          }
        ]
      );
    } else {
      this.notificationService.prompt(
        Severity.Error,
        error.message,
        [
          {
            label: nls.localize("saveAndRetry", "Save and Retry"),
            run: () => this.writeConfiguration(operation.target, { key: operation.key, value: operation.value }, { handleDirtyFile: "save", scopes })
          },
          {
            label: nls.localize("open", "Open Settings"),
            run: () => this.openSettings(operation)
          }
        ]
      );
    }
  }
  openSettings(operation) {
    const options = { jsonEditor: true };
    switch (operation.target) {
      case 1 /* USER_LOCAL */:
        this.preferencesService.openUserSettings(options);
        break;
      case 2 /* USER_REMOTE */:
        this.preferencesService.openRemoteSettings(options);
        break;
      case 3 /* WORKSPACE */:
        this.preferencesService.openWorkspaceSettings(options);
        break;
      case 4 /* WORKSPACE_FOLDER */:
        if (operation.resource) {
          const workspaceFolder = this.contextService.getWorkspaceFolder(operation.resource);
          if (workspaceFolder) {
            this.preferencesService.openFolderSettings({ folderUri: workspaceFolder.uri, jsonEditor: true });
          }
        }
        break;
    }
  }
  openFile(resource) {
    this.editorService.openEditor({ resource, options: { pinned: true } });
  }
  toConfigurationEditingError(code, target, operation) {
    const message = this.toErrorMessage(code, target, operation);
    return new ConfigurationEditingError(message, code);
  }
  toErrorMessage(error, target, operation) {
    switch (error) {
      // API constraints
      case 12 /* ERROR_POLICY_CONFIGURATION */:
        return nls.localize("errorPolicyConfiguration", "Unable to write {0} because it is configured in system policy.", operation.key);
      case 0 /* ERROR_UNKNOWN_KEY */:
        return nls.localize("errorUnknownKey", "Unable to write to {0} because {1} is not a registered configuration.", this.stringifyTarget(target), operation.key);
      case 1 /* ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION */:
        return nls.localize("errorInvalidWorkspaceConfigurationApplication", "Unable to write {0} to Workspace Settings. This setting can be written only into User settings.", operation.key);
      case 2 /* ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE */:
        return nls.localize("errorInvalidWorkspaceConfigurationMachine", "Unable to write {0} to Workspace Settings. This setting can be written only into User settings.", operation.key);
      case 3 /* ERROR_INVALID_FOLDER_CONFIGURATION */:
        return nls.localize("errorInvalidFolderConfiguration", "Unable to write to Folder Settings because {0} does not support the folder resource scope.", operation.key);
      case 4 /* ERROR_INVALID_USER_TARGET */:
        return nls.localize("errorInvalidUserTarget", "Unable to write to User Settings because {0} does not support for global scope.", operation.key);
      case 5 /* ERROR_INVALID_WORKSPACE_TARGET */:
        return nls.localize("errorInvalidWorkspaceTarget", "Unable to write to Workspace Settings because {0} does not support for workspace scope in a multi folder workspace.", operation.key);
      case 6 /* ERROR_INVALID_FOLDER_TARGET */:
        return nls.localize("errorInvalidFolderTarget", "Unable to write to Folder Settings because no resource is provided.");
      case 7 /* ERROR_INVALID_RESOURCE_LANGUAGE_CONFIGURATION */:
        return nls.localize("errorInvalidResourceLanguageConfiguration", "Unable to write to Language Settings because {0} is not a resource language setting.", operation.key);
      case 8 /* ERROR_NO_WORKSPACE_OPENED */:
        return nls.localize("errorNoWorkspaceOpened", "Unable to write to {0} because no workspace is opened. Please open a workspace first and try again.", this.stringifyTarget(target));
      // User issues
      case 11 /* ERROR_INVALID_CONFIGURATION */: {
        if (operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY) {
          return nls.localize("errorInvalidTaskConfiguration", "Unable to write into the tasks configuration file. Please open it to correct errors/warnings in it and try again.");
        }
        if (operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY) {
          return nls.localize("errorInvalidLaunchConfiguration", "Unable to write into the launch configuration file. Please open it to correct errors/warnings in it and try again.");
        }
        if (operation.workspaceStandAloneConfigurationKey === MCP_CONFIGURATION_KEY) {
          return nls.localize("errorInvalidMCPConfiguration", "Unable to write into the MCP configuration file. Please open it to correct errors/warnings in it and try again.");
        }
        switch (target) {
          case 1 /* USER_LOCAL */:
            return nls.localize("errorInvalidConfiguration", "Unable to write into user settings. Please open the user settings to correct errors/warnings in it and try again.");
          case 2 /* USER_REMOTE */:
            return nls.localize("errorInvalidRemoteConfiguration", "Unable to write into remote user settings. Please open the remote user settings to correct errors/warnings in it and try again.");
          case 3 /* WORKSPACE */:
            return nls.localize("errorInvalidConfigurationWorkspace", "Unable to write into workspace settings. Please open the workspace settings to correct errors/warnings in the file and try again.");
          case 4 /* WORKSPACE_FOLDER */: {
            let workspaceFolderName = "<<unknown>>";
            if (operation.resource) {
              const folder = this.contextService.getWorkspaceFolder(operation.resource);
              if (folder) {
                workspaceFolderName = folder.name;
              }
            }
            return nls.localize("errorInvalidConfigurationFolder", "Unable to write into folder settings. Please open the '{0}' folder settings to correct errors/warnings in it and try again.", workspaceFolderName);
          }
          default:
            return "";
        }
      }
      case 9 /* ERROR_CONFIGURATION_FILE_DIRTY */: {
        if (operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY) {
          return nls.localize("errorTasksConfigurationFileDirty", "Unable to write into tasks configuration file because the file has unsaved changes. Please save it first and then try again.");
        }
        if (operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY) {
          return nls.localize("errorLaunchConfigurationFileDirty", "Unable to write into launch configuration file because the file has unsaved changes. Please save it first and then try again.");
        }
        if (operation.workspaceStandAloneConfigurationKey === MCP_CONFIGURATION_KEY) {
          return nls.localize("errorMCPConfigurationFileDirty", "Unable to write into MCP configuration file because the file has unsaved changes. Please save it first and then try again.");
        }
        switch (target) {
          case 1 /* USER_LOCAL */:
            return nls.localize("errorConfigurationFileDirty", "Unable to write into user settings because the file has unsaved changes. Please save the user settings file first and then try again.");
          case 2 /* USER_REMOTE */:
            return nls.localize("errorRemoteConfigurationFileDirty", "Unable to write into remote user settings because the file has unsaved changes. Please save the remote user settings file first and then try again.");
          case 3 /* WORKSPACE */:
            return nls.localize("errorConfigurationFileDirtyWorkspace", "Unable to write into workspace settings because the file has unsaved changes. Please save the workspace settings file first and then try again.");
          case 4 /* WORKSPACE_FOLDER */: {
            let workspaceFolderName = "<<unknown>>";
            if (operation.resource) {
              const folder = this.contextService.getWorkspaceFolder(operation.resource);
              if (folder) {
                workspaceFolderName = folder.name;
              }
            }
            return nls.localize("errorConfigurationFileDirtyFolder", "Unable to write into folder settings because the file has unsaved changes. Please save the '{0}' folder settings file first and then try again.", workspaceFolderName);
          }
          default:
            return "";
        }
      }
      case 10 /* ERROR_CONFIGURATION_FILE_MODIFIED_SINCE */:
        if (operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY) {
          return nls.localize("errorTasksConfigurationFileModifiedSince", "Unable to write into tasks configuration file because the content of the file is newer.");
        }
        if (operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY) {
          return nls.localize("errorLaunchConfigurationFileModifiedSince", "Unable to write into launch configuration file because the content of the file is newer.");
        }
        if (operation.workspaceStandAloneConfigurationKey === MCP_CONFIGURATION_KEY) {
          return nls.localize("errorMCPConfigurationFileModifiedSince", "Unable to write into MCP configuration file because the content of the file is newer.");
        }
        switch (target) {
          case 1 /* USER_LOCAL */:
            return nls.localize("errorConfigurationFileModifiedSince", "Unable to write into user settings because the content of the file is newer.");
          case 2 /* USER_REMOTE */:
            return nls.localize("errorRemoteConfigurationFileModifiedSince", "Unable to write into remote user settings because the content of the file is newer.");
          case 3 /* WORKSPACE */:
            return nls.localize("errorConfigurationFileModifiedSinceWorkspace", "Unable to write into workspace settings because the content of the file is newer.");
          case 4 /* WORKSPACE_FOLDER */:
            return nls.localize("errorConfigurationFileModifiedSinceFolder", "Unable to write into folder settings because the content of the file is newer.");
        }
      case 13 /* ERROR_INTERNAL */:
        return nls.localize("errorUnknown", "Unable to write to {0} because of an internal error.", this.stringifyTarget(target));
    }
  }
  stringifyTarget(target) {
    switch (target) {
      case 1 /* USER_LOCAL */:
        return nls.localize("userTarget", "User Settings");
      case 2 /* USER_REMOTE */:
        return nls.localize("remoteUserTarget", "Remote User Settings");
      case 3 /* WORKSPACE */:
        return nls.localize("workspaceTarget", "Workspace Settings");
      case 4 /* WORKSPACE_FOLDER */:
        return nls.localize("folderTarget", "Folder Settings");
      default:
        return "";
    }
  }
  defaultResourceValue(resource) {
    const basename = this.uriIdentityService.extUri.basename(resource);
    const configurationValue = basename.substr(0, basename.length - this.uriIdentityService.extUri.extname(resource).length);
    switch (configurationValue) {
      case TASKS_CONFIGURATION_KEY:
        return TASKS_DEFAULT;
      default:
        return "{}";
    }
  }
  async resolveModelReference(resource) {
    const exists = await this.fileService.exists(resource);
    if (!exists) {
      await this.textFileService.write(resource, this.defaultResourceValue(resource), { encoding: "utf8" });
    }
    return this.textModelResolverService.createModelReference(resource);
  }
  hasParseErrors(content, operation) {
    if (operation.workspaceStandAloneConfigurationKey && !operation.key) {
      return false;
    }
    const parseErrors = [];
    json.parse(content, parseErrors, { allowTrailingComma: true, allowEmptyContent: true });
    return parseErrors.length > 0;
  }
  async validate(target, operation, checkDirty, overrides) {
    if (this.configurationService.inspect(operation.key).policyValue !== void 0) {
      throw this.toConfigurationEditingError(12 /* ERROR_POLICY_CONFIGURATION */, target, operation);
    }
    const configurationProperties = Registry.as(ConfigurationExtensions.Configuration).getConfigurationProperties();
    const configurationScope = configurationProperties[operation.key]?.scope;
    if (!operation.workspaceStandAloneConfigurationKey) {
      const validKeys = this.configurationService.keys().default;
      if (validKeys.indexOf(operation.key) < 0 && !OVERRIDE_PROPERTY_REGEX.test(operation.key) && operation.value !== void 0) {
        throw this.toConfigurationEditingError(0 /* ERROR_UNKNOWN_KEY */, target, operation);
      }
    }
    if (operation.workspaceStandAloneConfigurationKey) {
      if (operation.workspaceStandAloneConfigurationKey !== TASKS_CONFIGURATION_KEY && operation.workspaceStandAloneConfigurationKey !== MCP_CONFIGURATION_KEY && (target === 1 /* USER_LOCAL */ || target === 2 /* USER_REMOTE */)) {
        throw this.toConfigurationEditingError(4 /* ERROR_INVALID_USER_TARGET */, target, operation);
      }
    }
    if ((target === 3 /* WORKSPACE */ || target === 4 /* WORKSPACE_FOLDER */) && this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
      throw this.toConfigurationEditingError(8 /* ERROR_NO_WORKSPACE_OPENED */, target, operation);
    }
    if (target === 3 /* WORKSPACE */) {
      if (!operation.workspaceStandAloneConfigurationKey && !OVERRIDE_PROPERTY_REGEX.test(operation.key)) {
        if (configurationScope && APPLICATION_SCOPES.includes(configurationScope)) {
          throw this.toConfigurationEditingError(1 /* ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION */, target, operation);
        }
        if (configurationScope === ConfigurationScope.MACHINE) {
          throw this.toConfigurationEditingError(2 /* ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE */, target, operation);
        }
      }
    }
    if (target === 4 /* WORKSPACE_FOLDER */) {
      if (!operation.resource) {
        throw this.toConfigurationEditingError(6 /* ERROR_INVALID_FOLDER_TARGET */, target, operation);
      }
      if (!operation.workspaceStandAloneConfigurationKey && !OVERRIDE_PROPERTY_REGEX.test(operation.key)) {
        if (configurationScope !== void 0 && !FOLDER_SCOPES.includes(configurationScope)) {
          throw this.toConfigurationEditingError(3 /* ERROR_INVALID_FOLDER_CONFIGURATION */, target, operation);
        }
      }
    }
    if (overrides.overrideIdentifiers?.length) {
      if (configurationScope !== ConfigurationScope.LANGUAGE_OVERRIDABLE) {
        throw this.toConfigurationEditingError(7 /* ERROR_INVALID_RESOURCE_LANGUAGE_CONFIGURATION */, target, operation);
      }
    }
    if (!operation.resource) {
      throw this.toConfigurationEditingError(6 /* ERROR_INVALID_FOLDER_TARGET */, target, operation);
    }
    if (checkDirty && this.textFileService.isDirty(operation.resource)) {
      throw this.toConfigurationEditingError(9 /* ERROR_CONFIGURATION_FILE_DIRTY */, target, operation);
    }
  }
  getConfigurationEditOperation(target, config, overrides) {
    if (config.key) {
      const standaloneConfigurationMap = target === 1 /* USER_LOCAL */ ? USER_STANDALONE_CONFIGURATIONS : WORKSPACE_STANDALONE_CONFIGURATIONS;
      const standaloneConfigurationKeys = Object.keys(standaloneConfigurationMap);
      for (const key2 of standaloneConfigurationKeys) {
        const resource2 = this.getConfigurationFileResource(target, key2, standaloneConfigurationMap[key2], overrides.resource, void 0);
        if (config.key === key2) {
          const jsonPath2 = this.isWorkspaceConfigurationResource(resource2) ? [key2] : [];
          return { key: jsonPath2[jsonPath2.length - 1], jsonPath: jsonPath2, value: config.value, resource: resource2 ?? void 0, workspaceStandAloneConfigurationKey: key2, target };
        }
        const keyPrefix = `${key2}.`;
        if (config.key.indexOf(keyPrefix) === 0) {
          const jsonPath2 = this.isWorkspaceConfigurationResource(resource2) ? [key2, config.key.substring(keyPrefix.length)] : [config.key.substring(keyPrefix.length)];
          return { key: jsonPath2[jsonPath2.length - 1], jsonPath: jsonPath2, value: config.value, resource: resource2 ?? void 0, workspaceStandAloneConfigurationKey: key2, target };
        }
      }
    }
    const key = config.key;
    const configurationProperties = Registry.as(ConfigurationExtensions.Configuration).getConfigurationProperties();
    const configurationScope = configurationProperties[key]?.scope;
    let jsonPath = overrides.overrideIdentifiers?.length ? [keyFromOverrideIdentifiers(overrides.overrideIdentifiers), key] : [key];
    if (target === 1 /* USER_LOCAL */ || target === 2 /* USER_REMOTE */) {
      return { key, jsonPath, value: config.value, resource: this.getConfigurationFileResource(target, key, "", null, configurationScope) ?? void 0, target };
    }
    const resource = this.getConfigurationFileResource(target, key, FOLDER_SETTINGS_PATH, overrides.resource, configurationScope);
    if (this.isWorkspaceConfigurationResource(resource)) {
      jsonPath = ["settings", ...jsonPath];
    }
    return { key, jsonPath, value: config.value, resource: resource ?? void 0, target };
  }
  isWorkspaceConfigurationResource(resource) {
    const workspace = this.contextService.getWorkspace();
    return !!(workspace.configuration && resource && workspace.configuration.fsPath === resource.fsPath);
  }
  getConfigurationFileResource(target, key, relativePath, resource, scope) {
    if (target === 1 /* USER_LOCAL */) {
      if (key === TASKS_CONFIGURATION_KEY) {
        return this.userDataProfileService.currentProfile.tasksResource;
      }
      if (key === MCP_CONFIGURATION_KEY) {
        return this.userDataProfileService.currentProfile.mcpResource;
      } else {
        if (!this.userDataProfileService.currentProfile.isDefault && this.configurationService.isSettingAppliedForAllProfiles(key)) {
          return this.userDataProfilesService.defaultProfile.settingsResource;
        }
        return this.userDataProfileService.currentProfile.settingsResource;
      }
    }
    if (target === 2 /* USER_REMOTE */) {
      return this.remoteSettingsResource;
    }
    const workbenchState = this.contextService.getWorkbenchState();
    if (workbenchState !== WorkbenchState.EMPTY) {
      const workspace = this.contextService.getWorkspace();
      if (target === 3 /* WORKSPACE */) {
        if (workbenchState === WorkbenchState.WORKSPACE) {
          return workspace.configuration ?? null;
        }
        if (workbenchState === WorkbenchState.FOLDER) {
          return workspace.folders[0].toResource(relativePath);
        }
      }
      if (target === 4 /* WORKSPACE_FOLDER */) {
        if (resource) {
          const folder = this.contextService.getWorkspaceFolder(resource);
          if (folder) {
            return folder.toResource(relativePath);
          }
        }
      }
    }
    return null;
  }
};
ConfigurationEditing = __decorateClass([
  __decorateParam(1, IWorkbenchConfigurationService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IUserDataProfileService),
  __decorateParam(4, IUserDataProfilesService),
  __decorateParam(5, IFileService),
  __decorateParam(6, ITextModelService),
  __decorateParam(7, ITextFileService),
  __decorateParam(8, INotificationService),
  __decorateParam(9, IPreferencesService),
  __decorateParam(10, IEditorService),
  __decorateParam(11, IUriIdentityService),
  __decorateParam(12, IFilesConfigurationService)
], ConfigurationEditing);
export {
  ConfigurationEditing,
  ConfigurationEditingError,
  ConfigurationEditingErrorCode,
  EditableConfigurationTarget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uRWRpdGluZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCAqIGFzIGpzb24gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgeyBzZXRQcm9wZXJ0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25FZGl0LmpzJztcbmltcG9ydCB7IFF1ZXVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRWRpdCwgRm9ybWF0dGluZ09wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9qc29uRm9ybWF0dGVyLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgV29ya2JlbmNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblVwZGF0ZU9wdGlvbnMsIElDb25maWd1cmF0aW9uVXBkYXRlT3ZlcnJpZGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBGT0xERVJfU0VUVElOR1NfUEFUSCwgV09SS1NQQUNFX1NUQU5EQUxPTkVfQ09ORklHVVJBVElPTlMsIFRBU0tTX0NPTkZJR1VSQVRJT05fS0VZLCBMQVVOQ0hfQ09ORklHVVJBVElPTl9LRVksIFVTRVJfU1RBTkRBTE9ORV9DT05GSUdVUkFUSU9OUywgVEFTS1NfREVGQVVMVCwgRk9MREVSX1NDT1BFUywgSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBBUFBMSUNBVElPTl9TQ09QRVMsIE1DUF9DT05GSUdVUkFUSU9OX0tFWSB9IGZyb20gJy4vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBGaWxlT3BlcmF0aW9uRXJyb3IsIEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwsIElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgRXh0ZW5zaW9ucyBhcyBDb25maWd1cmF0aW9uRXh0ZW5zaW9ucywgQ29uZmlndXJhdGlvblNjb3BlLCBrZXlGcm9tT3ZlcnJpZGVJZGVudGlmaWVycywgT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVggfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSU9wZW5TZXR0aW5nc09wdGlvbnMsIElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgSVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBFZGl0T3BlcmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IEVycm9yTm9UZWxlbWV0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuXG5leHBvcnQgY29uc3QgZW51bSBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yQ29kZSB7XG5cblx0LyoqXG5cdCAqIEVycm9yIHdoZW4gdHJ5aW5nIHRvIHdyaXRlIGEgY29uZmlndXJhdGlvbiBrZXkgdGhhdCBpcyBub3QgcmVnaXN0ZXJlZC5cblx0ICovXG5cdEVSUk9SX1VOS05PV05fS0VZLFxuXG5cdC8qKlxuXHQgKiBFcnJvciB3aGVuIHRyeWluZyB0byB3cml0ZSBhbiBhcHBsaWNhdGlvbiBzZXR0aW5nIGludG8gd29ya3NwYWNlIHNldHRpbmdzLlxuXHQgKi9cblx0RVJST1JfSU5WQUxJRF9XT1JLU1BBQ0VfQ09ORklHVVJBVElPTl9BUFBMSUNBVElPTixcblxuXHQvKipcblx0ICogRXJyb3Igd2hlbiB0cnlpbmcgdG8gd3JpdGUgYSBtYWNobmUgc2V0dGluZyBpbnRvIHdvcmtzcGFjZSBzZXR0aW5ncy5cblx0ICovXG5cdEVSUk9SX0lOVkFMSURfV09SS1NQQUNFX0NPTkZJR1VSQVRJT05fTUFDSElORSxcblxuXHQvKipcblx0ICogRXJyb3Igd2hlbiB0cnlpbmcgdG8gd3JpdGUgYW4gaW52YWxpZCBmb2xkZXIgY29uZmlndXJhdGlvbiBrZXkgdG8gZm9sZGVyIHNldHRpbmdzLlxuXHQgKi9cblx0RVJST1JfSU5WQUxJRF9GT0xERVJfQ09ORklHVVJBVElPTixcblxuXHQvKipcblx0ICogRXJyb3Igd2hlbiB0cnlpbmcgdG8gd3JpdGUgdG8gdXNlciB0YXJnZXQgYnV0IG5vdCBzdXBwb3J0ZWQgZm9yIHByb3ZpZGVkIGtleS5cblx0ICovXG5cdEVSUk9SX0lOVkFMSURfVVNFUl9UQVJHRVQsXG5cblx0LyoqXG5cdCAqIEVycm9yIHdoZW4gdHJ5aW5nIHRvIHdyaXRlIHRvIHVzZXIgdGFyZ2V0IGJ1dCBub3Qgc3VwcG9ydGVkIGZvciBwcm92aWRlZCBrZXkuXG5cdCAqL1xuXHRFUlJPUl9JTlZBTElEX1dPUktTUEFDRV9UQVJHRVQsXG5cblx0LyoqXG5cdCAqIEVycm9yIHdoZW4gdHJ5aW5nIHRvIHdyaXRlIGEgY29uZmlndXJhdGlvbiBrZXkgdG8gZm9sZGVyIHRhcmdldFxuXHQgKi9cblx0RVJST1JfSU5WQUxJRF9GT0xERVJfVEFSR0VULFxuXG5cdC8qKlxuXHQgKiBFcnJvciB3aGVuIHRyeWluZyB0byB3cml0ZSB0byBsYW5ndWFnZSBzcGVjaWZpYyBzZXR0aW5nIGJ1dCBub3Qgc3VwcG9ydGVkIGZvciBwcmVvdmlkZWQga2V5XG5cdCAqL1xuXHRFUlJPUl9JTlZBTElEX1JFU09VUkNFX0xBTkdVQUdFX0NPTkZJR1VSQVRJT04sXG5cblx0LyoqXG5cdCAqIEVycm9yIHdoZW4gdHJ5aW5nIHRvIHdyaXRlIHRvIHRoZSB3b3Jrc3BhY2UgY29uZmlndXJhdGlvbiB3aXRob3V0IGhhdmluZyBhIHdvcmtzcGFjZSBvcGVuZWQuXG5cdCAqL1xuXHRFUlJPUl9OT19XT1JLU1BBQ0VfT1BFTkVELFxuXG5cdC8qKlxuXHQgKiBFcnJvciB3aGVuIHRyeWluZyB0byB3cml0ZSBhbmQgc2F2ZSB0byB0aGUgY29uZmlndXJhdGlvbiBmaWxlIHdoaWxlIGl0IGlzIGRpcnR5IGluIHRoZSBlZGl0b3IuXG5cdCAqL1xuXHRFUlJPUl9DT05GSUdVUkFUSU9OX0ZJTEVfRElSVFksXG5cblx0LyoqXG5cdCAqIEVycm9yIHdoZW4gdHJ5aW5nIHRvIHdyaXRlIGFuZCBzYXZlIHRvIHRoZSBjb25maWd1cmF0aW9uIGZpbGUgd2hpbGUgaXQgaXMgbm90IHRoZSBsYXRlc3QgaW4gdGhlIGRpc2suXG5cdCAqL1xuXHRFUlJPUl9DT05GSUdVUkFUSU9OX0ZJTEVfTU9ESUZJRURfU0lOQ0UsXG5cblx0LyoqXG5cdCAqIEVycm9yIHdoZW4gdHJ5aW5nIHRvIHdyaXRlIHRvIGEgY29uZmlndXJhdGlvbiBmaWxlIHRoYXQgY29udGFpbnMgSlNPTiBlcnJvcnMuXG5cdCAqL1xuXHRFUlJPUl9JTlZBTElEX0NPTkZJR1VSQVRJT04sXG5cblx0LyoqXG5cdCAqIEVycm9yIHdoZW4gdHJ5aW5nIHRvIHdyaXRlIGEgcG9saWN5IGNvbmZpZ3VyYXRpb25cblx0ICovXG5cdEVSUk9SX1BPTElDWV9DT05GSUdVUkFUSU9OLFxuXG5cdC8qKlxuXHQgKiBJbnRlcm5hbCBFcnJvci5cblx0ICovXG5cdEVSUk9SX0lOVEVSTkFMXG59XG5cbmV4cG9ydCBjbGFzcyBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yIGV4dGVuZHMgRXJyb3JOb1RlbGVtZXRyeSB7XG5cdGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZywgcHVibGljIGNvZGU6IENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlKSB7XG5cdFx0c3VwZXIobWVzc2FnZSk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ29uZmlndXJhdGlvblZhbHVlIHtcblx0a2V5OiBzdHJpbmc7XG5cdHZhbHVlOiB1bmtub3duO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDb25maWd1cmF0aW9uRWRpdGluZ09wdGlvbnMgZXh0ZW5kcyBJQ29uZmlndXJhdGlvblVwZGF0ZU9wdGlvbnMge1xuXHQvKipcblx0ICogU2NvcGUgb2YgY29uZmlndXJhdGlvbiB0byBiZSB3cml0dGVuIGludG8uXG5cdCAqL1xuXHRzY29wZXM/OiBJQ29uZmlndXJhdGlvblVwZGF0ZU92ZXJyaWRlcztcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0IHtcblx0VVNFUl9MT0NBTCA9IDEsXG5cdFVTRVJfUkVNT1RFLFxuXHRXT1JLU1BBQ0UsXG5cdFdPUktTUEFDRV9GT0xERVJcbn1cblxuaW50ZXJmYWNlIElDb25maWd1cmF0aW9uRWRpdE9wZXJhdGlvbiBleHRlbmRzIElDb25maWd1cmF0aW9uVmFsdWUge1xuXHR0YXJnZXQ6IEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldDtcblx0anNvblBhdGg6IGpzb24uSlNPTlBhdGg7XG5cdHJlc291cmNlPzogVVJJO1xuXHR3b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleT86IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIENvbmZpZ3VyYXRpb25FZGl0aW5nIHtcblxuXHRwdWJsaWMgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcXVldWU6IFF1ZXVlPHZvaWQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcmVtb3RlU2V0dGluZ3NSZXNvdXJjZTogVVJJIHwgbnVsbCxcblx0XHRASVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASVVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlc1NlcnZpY2U6IElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASVRleHRNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXh0TW9kZWxSZXNvbHZlclNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlLFxuXHRcdEBJVGV4dEZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dEZpbGVTZXJ2aWNlOiBJVGV4dEZpbGVTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJlZmVyZW5jZXNTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXJpSWRlbnRpdHlTZXJ2aWNlOiBJVXJpSWRlbnRpdHlTZXJ2aWNlLFxuXHRcdEBJRmlsZXNDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2U6IElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMucXVldWUgPSBuZXcgUXVldWU8dm9pZD4oKTtcblx0fVxuXG5cdGFzeW5jIHdyaXRlQ29uZmlndXJhdGlvbih0YXJnZXQ6IEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldCwgdmFsdWU6IElDb25maWd1cmF0aW9uVmFsdWUsIG9wdGlvbnM6IElDb25maWd1cmF0aW9uRWRpdGluZ09wdGlvbnMgPSB7fSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG9wZXJhdGlvbiA9IHRoaXMuZ2V0Q29uZmlndXJhdGlvbkVkaXRPcGVyYXRpb24odGFyZ2V0LCB2YWx1ZSwgb3B0aW9ucy5zY29wZXMgfHwge30pO1xuXHRcdC8vIHF1ZXVlIHVwIHdyaXRlcyB0byBwcmV2ZW50IHJhY2UgY29uZGl0aW9uc1xuXHRcdHJldHVybiB0aGlzLnF1ZXVlLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZG9Xcml0ZUNvbmZpZ3VyYXRpb24ob3BlcmF0aW9uLCBvcHRpb25zKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmIChvcHRpb25zLmRvbm90Tm90aWZ5RXJyb3IpIHtcblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCB0aGlzLm9uRXJyb3IoZXJyb3IsIG9wZXJhdGlvbiwgb3B0aW9ucy5zY29wZXMpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1dyaXRlQ29uZmlndXJhdGlvbihvcGVyYXRpb246IElDb25maWd1cmF0aW9uRWRpdE9wZXJhdGlvbiwgb3B0aW9uczogSUNvbmZpZ3VyYXRpb25FZGl0aW5nT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMudmFsaWRhdGUob3BlcmF0aW9uLnRhcmdldCwgb3BlcmF0aW9uLCAhb3B0aW9ucy5oYW5kbGVEaXJ0eUZpbGUsIG9wdGlvbnMuc2NvcGVzIHx8IHt9KTtcblx0XHRjb25zdCByZXNvdXJjZTogVVJJID0gb3BlcmF0aW9uLnJlc291cmNlITtcblx0XHRjb25zdCByZWZlcmVuY2UgPSBhd2FpdCB0aGlzLnJlc29sdmVNb2RlbFJlZmVyZW5jZShyZXNvdXJjZSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGZvcm1hdHRpbmdPcHRpb25zID0gdGhpcy5nZXRGb3JtYXR0aW5nT3B0aW9ucyhyZWZlcmVuY2Uub2JqZWN0LnRleHRFZGl0b3JNb2RlbCk7XG5cdFx0XHRhd2FpdCB0aGlzLnVwZGF0ZUNvbmZpZ3VyYXRpb24ob3BlcmF0aW9uLCByZWZlcmVuY2Uub2JqZWN0LnRleHRFZGl0b3JNb2RlbCwgZm9ybWF0dGluZ09wdGlvbnMsIG9wdGlvbnMpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWZlcmVuY2UuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlQ29uZmlndXJhdGlvbihvcGVyYXRpb246IElDb25maWd1cmF0aW9uRWRpdE9wZXJhdGlvbiwgbW9kZWw6IElUZXh0TW9kZWwsIGZvcm1hdHRpbmdPcHRpb25zOiBGb3JtYXR0aW5nT3B0aW9ucywgb3B0aW9uczogSUNvbmZpZ3VyYXRpb25FZGl0aW5nT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmhhc1BhcnNlRXJyb3JzKG1vZGVsLmdldFZhbHVlKCksIG9wZXJhdGlvbikpIHtcblx0XHRcdHRocm93IHRoaXMudG9Db25maWd1cmF0aW9uRWRpdGluZ0Vycm9yKENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX0lOVkFMSURfQ09ORklHVVJBVElPTiwgb3BlcmF0aW9uLnRhcmdldCwgb3BlcmF0aW9uKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy50ZXh0RmlsZVNlcnZpY2UuaXNEaXJ0eShtb2RlbC51cmkpICYmIG9wdGlvbnMuaGFuZGxlRGlydHlGaWxlKSB7XG5cdFx0XHRzd2l0Y2ggKG9wdGlvbnMuaGFuZGxlRGlydHlGaWxlKSB7XG5cdFx0XHRcdGNhc2UgJ3NhdmUnOiBhd2FpdCB0aGlzLnNhdmUobW9kZWwsIG9wZXJhdGlvbik7IGJyZWFrO1xuXHRcdFx0XHRjYXNlICdyZXZlcnQnOiBhd2FpdCB0aGlzLnRleHRGaWxlU2VydmljZS5yZXZlcnQobW9kZWwudXJpKTsgYnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdCA9IHRoaXMuZ2V0RWRpdHMob3BlcmF0aW9uLCBtb2RlbC5nZXRWYWx1ZSgpLCBmb3JtYXR0aW5nT3B0aW9ucylbMF07XG5cdFx0aWYgKGVkaXQpIHtcblx0XHRcdGxldCBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdC8vIE9wdGltaXphdGlvbjogd2UgYXBwbHkgZWRpdHMgdG8gYSB0ZXh0IG1vZGVsIGFuZCBzYXZlIGl0XG5cdFx0XHRcdC8vIHJpZ2h0IGFmdGVyLiBVc2UgdGhlIGZpbGVzIGNvbmZpZyBzZXJ2aWNlIHRvIHNpZ25hbCB0aGlzXG5cdFx0XHRcdC8vIHRvIHRoZSB3b3JrYmVuY2ggdG8gb3B0aW1pc2UgdGhlIFVJIGR1cmluZyB0aGlzIG9wZXJhdGlvbi5cblx0XHRcdFx0Ly8gRm9yIGV4YW1wbGUsIGF2b2lkcyB0byBicmllZmx5IHNob3cgZGlydHkgaW5kaWNhdG9ycy5cblx0XHRcdFx0ZGlzcG9zYWJsZSA9IHRoaXMuZmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5lbmFibGVBdXRvU2F2ZUFmdGVyU2hvcnREZWxheShtb2RlbC51cmkpO1xuXHRcdFx0XHRpZiAodGhpcy5hcHBseUVkaXRzVG9CdWZmZXIoZWRpdCwgbW9kZWwpKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5zYXZlKG1vZGVsLCBvcGVyYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRkaXNwb3NhYmxlPy5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzYXZlKG1vZGVsOiBJVGV4dE1vZGVsLCBvcGVyYXRpb246IElDb25maWd1cmF0aW9uRWRpdE9wZXJhdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLnRleHRGaWxlU2VydmljZS5zYXZlKG1vZGVsLnVyaSwgeyBpZ25vcmVFcnJvckhhbmRsZXI6IHRydWUgfSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGlmICgoPEZpbGVPcGVyYXRpb25FcnJvcj5lcnJvcikuZmlsZU9wZXJhdGlvblJlc3VsdCA9PT0gRmlsZU9wZXJhdGlvblJlc3VsdC5GSUxFX01PRElGSUVEX1NJTkNFKSB7XG5cdFx0XHRcdHRocm93IHRoaXMudG9Db25maWd1cmF0aW9uRWRpdGluZ0Vycm9yKENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX0NPTkZJR1VSQVRJT05fRklMRV9NT0RJRklFRF9TSU5DRSwgb3BlcmF0aW9uLnRhcmdldCwgb3BlcmF0aW9uKTtcblx0XHRcdH1cblx0XHRcdHRocm93IG5ldyBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yKG5scy5sb2NhbGl6ZSgnZnNFcnJvcicsIFwiRXJyb3Igd2hpbGUgd3JpdGluZyB0byB7MH0uIHsxfVwiLCB0aGlzLnN0cmluZ2lmeVRhcmdldChvcGVyYXRpb24udGFyZ2V0KSwgZXJyb3IubWVzc2FnZSksIENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX0lOVEVSTkFMKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5RWRpdHNUb0J1ZmZlcihlZGl0OiBFZGl0LCBtb2RlbDogSVRleHRNb2RlbCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHN0YXJ0UG9zaXRpb24gPSBtb2RlbC5nZXRQb3NpdGlvbkF0KGVkaXQub2Zmc2V0KTtcblx0XHRjb25zdCBlbmRQb3NpdGlvbiA9IG1vZGVsLmdldFBvc2l0aW9uQXQoZWRpdC5vZmZzZXQgKyBlZGl0Lmxlbmd0aCk7XG5cdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2Uoc3RhcnRQb3NpdGlvbi5saW5lTnVtYmVyLCBzdGFydFBvc2l0aW9uLmNvbHVtbiwgZW5kUG9zaXRpb24ubGluZU51bWJlciwgZW5kUG9zaXRpb24uY29sdW1uKTtcblx0XHRjb25zdCBjdXJyZW50VGV4dCA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShyYW5nZSk7XG5cdFx0aWYgKGVkaXQuY29udGVudCAhPT0gY3VycmVudFRleHQpIHtcblx0XHRcdGNvbnN0IGVkaXRPcGVyYXRpb24gPSBjdXJyZW50VGV4dCA/IEVkaXRPcGVyYXRpb24ucmVwbGFjZShyYW5nZSwgZWRpdC5jb250ZW50KSA6IEVkaXRPcGVyYXRpb24uaW5zZXJ0KHN0YXJ0UG9zaXRpb24sIGVkaXQuY29udGVudCk7XG5cdFx0XHRtb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnMoW25ldyBTZWxlY3Rpb24oc3RhcnRQb3NpdGlvbi5saW5lTnVtYmVyLCBzdGFydFBvc2l0aW9uLmNvbHVtbiwgc3RhcnRQb3NpdGlvbi5saW5lTnVtYmVyLCBzdGFydFBvc2l0aW9uLmNvbHVtbildLCBbZWRpdE9wZXJhdGlvbl0sICgpID0+IFtdKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGdldEVkaXRzKHsgdmFsdWUsIGpzb25QYXRoIH06IElDb25maWd1cmF0aW9uRWRpdE9wZXJhdGlvbiwgbW9kZWxDb250ZW50OiBzdHJpbmcsIGZvcm1hdHRpbmdPcHRpb25zOiBGb3JtYXR0aW5nT3B0aW9ucyk6IEVkaXRbXSB7XG5cdFx0aWYgKGpzb25QYXRoLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHNldFByb3BlcnR5KG1vZGVsQ29udGVudCwganNvblBhdGgsIHZhbHVlLCBmb3JtYXR0aW5nT3B0aW9ucyk7XG5cdFx0fVxuXG5cdFx0Ly8gV2l0aG91dCBqc29uUGF0aCwgdGhlIGVudGlyZSBjb25maWd1cmF0aW9uIGZpbGUgaXMgYmVpbmcgcmVwbGFjZWQsIHNvIHdlIGp1c3QgdXNlIEpTT04uc3RyaW5naWZ5XG5cdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHZhbHVlLCBudWxsLCBmb3JtYXR0aW5nT3B0aW9ucy5pbnNlcnRTcGFjZXMgJiYgZm9ybWF0dGluZ09wdGlvbnMudGFiU2l6ZSA/ICcgJy5yZXBlYXQoZm9ybWF0dGluZ09wdGlvbnMudGFiU2l6ZSkgOiAnXFx0Jyk7XG5cdFx0cmV0dXJuIFt7XG5cdFx0XHRjb250ZW50LFxuXHRcdFx0bGVuZ3RoOiBtb2RlbENvbnRlbnQubGVuZ3RoLFxuXHRcdFx0b2Zmc2V0OiAwXG5cdFx0fV07XG5cdH1cblxuXHRwcml2YXRlIGdldEZvcm1hdHRpbmdPcHRpb25zKG1vZGVsOiBJVGV4dE1vZGVsKTogRm9ybWF0dGluZ09wdGlvbnMge1xuXHRcdGNvbnN0IHsgaW5zZXJ0U3BhY2VzLCB0YWJTaXplIH0gPSBtb2RlbC5nZXRPcHRpb25zKCk7XG5cdFx0Y29uc3QgZW9sID0gbW9kZWwuZ2V0RU9MKCk7XG5cdFx0cmV0dXJuIHsgaW5zZXJ0U3BhY2VzLCB0YWJTaXplLCBlb2wgfTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25FcnJvcihlcnJvcjogQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvciwgb3BlcmF0aW9uOiBJQ29uZmlndXJhdGlvbkVkaXRPcGVyYXRpb24sIHNjb3BlczogSUNvbmZpZ3VyYXRpb25VcGRhdGVPdmVycmlkZXMgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRzd2l0Y2ggKGVycm9yLmNvZGUpIHtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfSU5WQUxJRF9DT05GSUdVUkFUSU9OOlxuXHRcdFx0XHR0aGlzLm9uSW52YWxpZENvbmZpZ3VyYXRpb25FcnJvcihlcnJvciwgb3BlcmF0aW9uKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX0NPTkZJR1VSQVRJT05fRklMRV9ESVJUWTpcblx0XHRcdFx0dGhpcy5vbkNvbmZpZ3VyYXRpb25GaWxlRGlydHlFcnJvcihlcnJvciwgb3BlcmF0aW9uLCBzY29wZXMpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfQ09ORklHVVJBVElPTl9GSUxFX01PRElGSUVEX1NJTkNFOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5kb1dyaXRlQ29uZmlndXJhdGlvbihvcGVyYXRpb24sIHsgc2NvcGVzLCBoYW5kbGVEaXJ0eUZpbGU6ICdyZXZlcnQnIH0pO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKGVycm9yLm1lc3NhZ2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25JbnZhbGlkQ29uZmlndXJhdGlvbkVycm9yKGVycm9yOiBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yLCBvcGVyYXRpb246IElDb25maWd1cmF0aW9uRWRpdE9wZXJhdGlvbiwpOiB2b2lkIHtcblx0XHRjb25zdCBvcGVuU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25BY3Rpb25MYWJlbCA9IG9wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleSA9PT0gVEFTS1NfQ09ORklHVVJBVElPTl9LRVkgPyBubHMubG9jYWxpemUoJ29wZW5UYXNrc0NvbmZpZ3VyYXRpb24nLCBcIk9wZW4gVGFza3MgQ29uZmlndXJhdGlvblwiKVxuXHRcdFx0OiBvcGVyYXRpb24ud29ya3NwYWNlU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25LZXkgPT09IExBVU5DSF9DT05GSUdVUkFUSU9OX0tFWSA/IG5scy5sb2NhbGl6ZSgnb3BlbkxhdW5jaENvbmZpZ3VyYXRpb24nLCBcIk9wZW4gTGF1bmNoIENvbmZpZ3VyYXRpb25cIilcblx0XHRcdFx0OiBvcGVyYXRpb24ud29ya3NwYWNlU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25LZXkgPT09IE1DUF9DT05GSUdVUkFUSU9OX0tFWSA/IG5scy5sb2NhbGl6ZSgnb3Blbk1jcENvbmZpZ3VyYXRpb24nLCBcIk9wZW4gTUNQIENvbmZpZ3VyYXRpb25cIilcblx0XHRcdFx0XHQ6IG51bGw7XG5cdFx0aWYgKG9wZW5TdGFuZEFsb25lQ29uZmlndXJhdGlvbkFjdGlvbkxhYmVsKSB7XG5cdFx0XHR0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFNldmVyaXR5LkVycm9yLCBlcnJvci5tZXNzYWdlLFxuXHRcdFx0XHRbe1xuXHRcdFx0XHRcdGxhYmVsOiBvcGVuU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25BY3Rpb25MYWJlbCxcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMub3BlbkZpbGUob3BlcmF0aW9uLnJlc291cmNlISlcblx0XHRcdFx0fV1cblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuRXJyb3IsIGVycm9yLm1lc3NhZ2UsXG5cdFx0XHRcdFt7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnb3BlbicsIFwiT3BlbiBTZXR0aW5nc1wiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMub3BlblNldHRpbmdzKG9wZXJhdGlvbilcblx0XHRcdFx0fV1cblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbmZpZ3VyYXRpb25GaWxlRGlydHlFcnJvcihlcnJvcjogQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvciwgb3BlcmF0aW9uOiBJQ29uZmlndXJhdGlvbkVkaXRPcGVyYXRpb24sIHNjb3BlczogSUNvbmZpZ3VyYXRpb25VcGRhdGVPdmVycmlkZXMgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBvcGVuU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25BY3Rpb25MYWJlbCA9IG9wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleSA9PT0gVEFTS1NfQ09ORklHVVJBVElPTl9LRVkgPyBubHMubG9jYWxpemUoJ29wZW5UYXNrc0NvbmZpZ3VyYXRpb24nLCBcIk9wZW4gVGFza3MgQ29uZmlndXJhdGlvblwiKVxuXHRcdFx0OiBvcGVyYXRpb24ud29ya3NwYWNlU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25LZXkgPT09IExBVU5DSF9DT05GSUdVUkFUSU9OX0tFWSA/IG5scy5sb2NhbGl6ZSgnb3BlbkxhdW5jaENvbmZpZ3VyYXRpb24nLCBcIk9wZW4gTGF1bmNoIENvbmZpZ3VyYXRpb25cIilcblx0XHRcdFx0OiBudWxsO1xuXHRcdGlmIChvcGVuU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25BY3Rpb25MYWJlbCkge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5FcnJvciwgZXJyb3IubWVzc2FnZSxcblx0XHRcdFx0W3tcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdzYXZlQW5kUmV0cnknLCBcIlNhdmUgYW5kIFJldHJ5XCIpLFxuXHRcdFx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3Qga2V5ID0gb3BlcmF0aW9uLmtleSA/IGAke29wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleX0uJHtvcGVyYXRpb24ua2V5fWAgOiBvcGVyYXRpb24ud29ya3NwYWNlU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25LZXkhO1xuXHRcdFx0XHRcdFx0dGhpcy53cml0ZUNvbmZpZ3VyYXRpb24ob3BlcmF0aW9uLnRhcmdldCwgeyBrZXksIHZhbHVlOiBvcGVyYXRpb24udmFsdWUgfSwgeyBoYW5kbGVEaXJ0eUZpbGU6ICdzYXZlJywgc2NvcGVzIH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBvcGVuU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25BY3Rpb25MYWJlbCxcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMub3BlbkZpbGUob3BlcmF0aW9uLnJlc291cmNlISlcblx0XHRcdFx0fV1cblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoU2V2ZXJpdHkuRXJyb3IsIGVycm9yLm1lc3NhZ2UsXG5cdFx0XHRcdFt7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnc2F2ZUFuZFJldHJ5JywgXCJTYXZlIGFuZCBSZXRyeVwiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMud3JpdGVDb25maWd1cmF0aW9uKG9wZXJhdGlvbi50YXJnZXQsIHsga2V5OiBvcGVyYXRpb24ua2V5LCB2YWx1ZTogb3BlcmF0aW9uLnZhbHVlIH0sIHsgaGFuZGxlRGlydHlGaWxlOiAnc2F2ZScsIHNjb3BlcyB9KVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IG5scy5sb2NhbGl6ZSgnb3BlbicsIFwiT3BlbiBTZXR0aW5nc1wiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMub3BlblNldHRpbmdzKG9wZXJhdGlvbilcblx0XHRcdFx0fV1cblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvcGVuU2V0dGluZ3Mob3BlcmF0aW9uOiBJQ29uZmlndXJhdGlvbkVkaXRPcGVyYXRpb24pOiB2b2lkIHtcblx0XHRjb25zdCBvcHRpb25zOiBJT3BlblNldHRpbmdzT3B0aW9ucyA9IHsganNvbkVkaXRvcjogdHJ1ZSB9O1xuXHRcdHN3aXRjaCAob3BlcmF0aW9uLnRhcmdldCkge1xuXHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDpcblx0XHRcdFx0dGhpcy5wcmVmZXJlbmNlc1NlcnZpY2Uub3BlblVzZXJTZXR0aW5ncyhvcHRpb25zKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URTpcblx0XHRcdFx0dGhpcy5wcmVmZXJlbmNlc1NlcnZpY2Uub3BlblJlbW90ZVNldHRpbmdzKG9wdGlvbnMpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTpcblx0XHRcdFx0dGhpcy5wcmVmZXJlbmNlc1NlcnZpY2Uub3BlbldvcmtzcGFjZVNldHRpbmdzKG9wdGlvbnMpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI6XG5cdFx0XHRcdGlmIChvcGVyYXRpb24ucmVzb3VyY2UpIHtcblx0XHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VGb2xkZXIgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihvcGVyYXRpb24ucmVzb3VyY2UpO1xuXHRcdFx0XHRcdGlmICh3b3Jrc3BhY2VGb2xkZXIpIHtcblx0XHRcdFx0XHRcdHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Gb2xkZXJTZXR0aW5ncyh7IGZvbGRlclVyaTogd29ya3NwYWNlRm9sZGVyLnVyaSwganNvbkVkaXRvcjogdHJ1ZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvcGVuRmlsZShyZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZSwgb3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfSB9KTtcblx0fVxuXG5cdHByaXZhdGUgdG9Db25maWd1cmF0aW9uRWRpdGluZ0Vycm9yKGNvZGU6IENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLCB0YXJnZXQ6IEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldCwgb3BlcmF0aW9uOiBJQ29uZmlndXJhdGlvbkVkaXRPcGVyYXRpb24pOiBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yIHtcblx0XHRjb25zdCBtZXNzYWdlID0gdGhpcy50b0Vycm9yTWVzc2FnZShjb2RlLCB0YXJnZXQsIG9wZXJhdGlvbik7XG5cdFx0cmV0dXJuIG5ldyBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yKG1lc3NhZ2UsIGNvZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b0Vycm9yTWVzc2FnZShlcnJvcjogQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUsIHRhcmdldDogRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LCBvcGVyYXRpb246IElDb25maWd1cmF0aW9uRWRpdE9wZXJhdGlvbik6IHN0cmluZyB7XG5cdFx0c3dpdGNoIChlcnJvcikge1xuXG5cdFx0XHQvLyBBUEkgY29uc3RyYWludHNcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfUE9MSUNZX0NPTkZJR1VSQVRJT046IHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9yUG9saWN5Q29uZmlndXJhdGlvbicsIFwiVW5hYmxlIHRvIHdyaXRlIHswfSBiZWNhdXNlIGl0IGlzIGNvbmZpZ3VyZWQgaW4gc3lzdGVtIHBvbGljeS5cIiwgb3BlcmF0aW9uLmtleSk7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX1VOS05PV05fS0VZOiByZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvclVua25vd25LZXknLCBcIlVuYWJsZSB0byB3cml0ZSB0byB7MH0gYmVjYXVzZSB7MX0gaXMgbm90IGEgcmVnaXN0ZXJlZCBjb25maWd1cmF0aW9uLlwiLCB0aGlzLnN0cmluZ2lmeVRhcmdldCh0YXJnZXQpLCBvcGVyYXRpb24ua2V5KTtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfSU5WQUxJRF9XT1JLU1BBQ0VfQ09ORklHVVJBVElPTl9BUFBMSUNBVElPTjogcmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JJbnZhbGlkV29ya3NwYWNlQ29uZmlndXJhdGlvbkFwcGxpY2F0aW9uJywgXCJVbmFibGUgdG8gd3JpdGUgezB9IHRvIFdvcmtzcGFjZSBTZXR0aW5ncy4gVGhpcyBzZXR0aW5nIGNhbiBiZSB3cml0dGVuIG9ubHkgaW50byBVc2VyIHNldHRpbmdzLlwiLCBvcGVyYXRpb24ua2V5KTtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfSU5WQUxJRF9XT1JLU1BBQ0VfQ09ORklHVVJBVElPTl9NQUNISU5FOiByZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvckludmFsaWRXb3Jrc3BhY2VDb25maWd1cmF0aW9uTWFjaGluZScsIFwiVW5hYmxlIHRvIHdyaXRlIHswfSB0byBXb3Jrc3BhY2UgU2V0dGluZ3MuIFRoaXMgc2V0dGluZyBjYW4gYmUgd3JpdHRlbiBvbmx5IGludG8gVXNlciBzZXR0aW5ncy5cIiwgb3BlcmF0aW9uLmtleSk7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX0lOVkFMSURfRk9MREVSX0NPTkZJR1VSQVRJT046IHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9ySW52YWxpZEZvbGRlckNvbmZpZ3VyYXRpb24nLCBcIlVuYWJsZSB0byB3cml0ZSB0byBGb2xkZXIgU2V0dGluZ3MgYmVjYXVzZSB7MH0gZG9lcyBub3Qgc3VwcG9ydCB0aGUgZm9sZGVyIHJlc291cmNlIHNjb3BlLlwiLCBvcGVyYXRpb24ua2V5KTtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfSU5WQUxJRF9VU0VSX1RBUkdFVDogcmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JJbnZhbGlkVXNlclRhcmdldCcsIFwiVW5hYmxlIHRvIHdyaXRlIHRvIFVzZXIgU2V0dGluZ3MgYmVjYXVzZSB7MH0gZG9lcyBub3Qgc3VwcG9ydCBmb3IgZ2xvYmFsIHNjb3BlLlwiLCBvcGVyYXRpb24ua2V5KTtcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfSU5WQUxJRF9XT1JLU1BBQ0VfVEFSR0VUOiByZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvckludmFsaWRXb3Jrc3BhY2VUYXJnZXQnLCBcIlVuYWJsZSB0byB3cml0ZSB0byBXb3Jrc3BhY2UgU2V0dGluZ3MgYmVjYXVzZSB7MH0gZG9lcyBub3Qgc3VwcG9ydCBmb3Igd29ya3NwYWNlIHNjb3BlIGluIGEgbXVsdGkgZm9sZGVyIHdvcmtzcGFjZS5cIiwgb3BlcmF0aW9uLmtleSk7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX0lOVkFMSURfRk9MREVSX1RBUkdFVDogcmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JJbnZhbGlkRm9sZGVyVGFyZ2V0JywgXCJVbmFibGUgdG8gd3JpdGUgdG8gRm9sZGVyIFNldHRpbmdzIGJlY2F1c2Ugbm8gcmVzb3VyY2UgaXMgcHJvdmlkZWQuXCIpO1xuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yQ29kZS5FUlJPUl9JTlZBTElEX1JFU09VUkNFX0xBTkdVQUdFX0NPTkZJR1VSQVRJT046IHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9ySW52YWxpZFJlc291cmNlTGFuZ3VhZ2VDb25maWd1cmF0aW9uJywgXCJVbmFibGUgdG8gd3JpdGUgdG8gTGFuZ3VhZ2UgU2V0dGluZ3MgYmVjYXVzZSB7MH0gaXMgbm90IGEgcmVzb3VyY2UgbGFuZ3VhZ2Ugc2V0dGluZy5cIiwgb3BlcmF0aW9uLmtleSk7XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX05PX1dPUktTUEFDRV9PUEVORUQ6IHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9yTm9Xb3Jrc3BhY2VPcGVuZWQnLCBcIlVuYWJsZSB0byB3cml0ZSB0byB7MH0gYmVjYXVzZSBubyB3b3Jrc3BhY2UgaXMgb3BlbmVkLiBQbGVhc2Ugb3BlbiBhIHdvcmtzcGFjZSBmaXJzdCBhbmQgdHJ5IGFnYWluLlwiLCB0aGlzLnN0cmluZ2lmeVRhcmdldCh0YXJnZXQpKTtcblxuXHRcdFx0Ly8gVXNlciBpc3N1ZXNcblx0XHRcdGNhc2UgQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfSU5WQUxJRF9DT05GSUdVUkFUSU9OOiB7XG5cdFx0XHRcdGlmIChvcGVyYXRpb24ud29ya3NwYWNlU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25LZXkgPT09IFRBU0tTX0NPTkZJR1VSQVRJT05fS0VZKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JJbnZhbGlkVGFza0NvbmZpZ3VyYXRpb24nLCBcIlVuYWJsZSB0byB3cml0ZSBpbnRvIHRoZSB0YXNrcyBjb25maWd1cmF0aW9uIGZpbGUuIFBsZWFzZSBvcGVuIGl0IHRvIGNvcnJlY3QgZXJyb3JzL3dhcm5pbmdzIGluIGl0IGFuZCB0cnkgYWdhaW4uXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChvcGVyYXRpb24ud29ya3NwYWNlU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25LZXkgPT09IExBVU5DSF9DT05GSUdVUkFUSU9OX0tFWSkge1xuXHRcdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9ySW52YWxpZExhdW5jaENvbmZpZ3VyYXRpb24nLCBcIlVuYWJsZSB0byB3cml0ZSBpbnRvIHRoZSBsYXVuY2ggY29uZmlndXJhdGlvbiBmaWxlLiBQbGVhc2Ugb3BlbiBpdCB0byBjb3JyZWN0IGVycm9ycy93YXJuaW5ncyBpbiBpdCBhbmQgdHJ5IGFnYWluLlwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3BlcmF0aW9uLndvcmtzcGFjZVN0YW5kQWxvbmVDb25maWd1cmF0aW9uS2V5ID09PSBNQ1BfQ09ORklHVVJBVElPTl9LRVkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvckludmFsaWRNQ1BDb25maWd1cmF0aW9uJywgXCJVbmFibGUgdG8gd3JpdGUgaW50byB0aGUgTUNQIGNvbmZpZ3VyYXRpb24gZmlsZS4gUGxlYXNlIG9wZW4gaXQgdG8gY29ycmVjdCBlcnJvcnMvd2FybmluZ3MgaW4gaXQgYW5kIHRyeSBhZ2Fpbi5cIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3dpdGNoICh0YXJnZXQpIHtcblx0XHRcdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMOlxuXHRcdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JJbnZhbGlkQ29uZmlndXJhdGlvbicsIFwiVW5hYmxlIHRvIHdyaXRlIGludG8gdXNlciBzZXR0aW5ncy4gUGxlYXNlIG9wZW4gdGhlIHVzZXIgc2V0dGluZ3MgdG8gY29ycmVjdCBlcnJvcnMvd2FybmluZ3MgaW4gaXQgYW5kIHRyeSBhZ2Fpbi5cIik7XG5cdFx0XHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEU6XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvckludmFsaWRSZW1vdGVDb25maWd1cmF0aW9uJywgXCJVbmFibGUgdG8gd3JpdGUgaW50byByZW1vdGUgdXNlciBzZXR0aW5ncy4gUGxlYXNlIG9wZW4gdGhlIHJlbW90ZSB1c2VyIHNldHRpbmdzIHRvIGNvcnJlY3QgZXJyb3JzL3dhcm5pbmdzIGluIGl0IGFuZCB0cnkgYWdhaW4uXCIpO1xuXHRcdFx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTpcblx0XHRcdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9ySW52YWxpZENvbmZpZ3VyYXRpb25Xb3Jrc3BhY2UnLCBcIlVuYWJsZSB0byB3cml0ZSBpbnRvIHdvcmtzcGFjZSBzZXR0aW5ncy4gUGxlYXNlIG9wZW4gdGhlIHdvcmtzcGFjZSBzZXR0aW5ncyB0byBjb3JyZWN0IGVycm9ycy93YXJuaW5ncyBpbiB0aGUgZmlsZSBhbmQgdHJ5IGFnYWluLlwiKTtcblx0XHRcdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSOiB7XG5cdFx0XHRcdFx0XHRsZXQgd29ya3NwYWNlRm9sZGVyTmFtZTogc3RyaW5nID0gJzw8dW5rbm93bj4+Jztcblx0XHRcdFx0XHRcdGlmIChvcGVyYXRpb24ucmVzb3VyY2UpIHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgZm9sZGVyID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIob3BlcmF0aW9uLnJlc291cmNlKTtcblx0XHRcdFx0XHRcdFx0aWYgKGZvbGRlcikge1xuXHRcdFx0XHRcdFx0XHRcdHdvcmtzcGFjZUZvbGRlck5hbWUgPSBmb2xkZXIubmFtZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JJbnZhbGlkQ29uZmlndXJhdGlvbkZvbGRlcicsIFwiVW5hYmxlIHRvIHdyaXRlIGludG8gZm9sZGVyIHNldHRpbmdzLiBQbGVhc2Ugb3BlbiB0aGUgJ3swfScgZm9sZGVyIHNldHRpbmdzIHRvIGNvcnJlY3QgZXJyb3JzL3dhcm5pbmdzIGluIGl0IGFuZCB0cnkgYWdhaW4uXCIsIHdvcmtzcGFjZUZvbGRlck5hbWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX0NPTkZJR1VSQVRJT05fRklMRV9ESVJUWToge1xuXHRcdFx0XHRpZiAob3BlcmF0aW9uLndvcmtzcGFjZVN0YW5kQWxvbmVDb25maWd1cmF0aW9uS2V5ID09PSBUQVNLU19DT05GSUdVUkFUSU9OX0tFWSkge1xuXHRcdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9yVGFza3NDb25maWd1cmF0aW9uRmlsZURpcnR5JywgXCJVbmFibGUgdG8gd3JpdGUgaW50byB0YXNrcyBjb25maWd1cmF0aW9uIGZpbGUgYmVjYXVzZSB0aGUgZmlsZSBoYXMgdW5zYXZlZCBjaGFuZ2VzLiBQbGVhc2Ugc2F2ZSBpdCBmaXJzdCBhbmQgdGhlbiB0cnkgYWdhaW4uXCIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChvcGVyYXRpb24ud29ya3NwYWNlU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25LZXkgPT09IExBVU5DSF9DT05GSUdVUkFUSU9OX0tFWSkge1xuXHRcdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2Vycm9yTGF1bmNoQ29uZmlndXJhdGlvbkZpbGVEaXJ0eScsIFwiVW5hYmxlIHRvIHdyaXRlIGludG8gbGF1bmNoIGNvbmZpZ3VyYXRpb24gZmlsZSBiZWNhdXNlIHRoZSBmaWxlIGhhcyB1bnNhdmVkIGNoYW5nZXMuIFBsZWFzZSBzYXZlIGl0IGZpcnN0IGFuZCB0aGVuIHRyeSBhZ2Fpbi5cIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleSA9PT0gTUNQX0NPTkZJR1VSQVRJT05fS0VZKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JNQ1BDb25maWd1cmF0aW9uRmlsZURpcnR5JywgXCJVbmFibGUgdG8gd3JpdGUgaW50byBNQ1AgY29uZmlndXJhdGlvbiBmaWxlIGJlY2F1c2UgdGhlIGZpbGUgaGFzIHVuc2F2ZWQgY2hhbmdlcy4gUGxlYXNlIHNhdmUgaXQgZmlyc3QgYW5kIHRoZW4gdHJ5IGFnYWluLlwiKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzd2l0Y2ggKHRhcmdldCkge1xuXHRcdFx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUw6XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvckNvbmZpZ3VyYXRpb25GaWxlRGlydHknLCBcIlVuYWJsZSB0byB3cml0ZSBpbnRvIHVzZXIgc2V0dGluZ3MgYmVjYXVzZSB0aGUgZmlsZSBoYXMgdW5zYXZlZCBjaGFuZ2VzLiBQbGVhc2Ugc2F2ZSB0aGUgdXNlciBzZXR0aW5ncyBmaWxlIGZpcnN0IGFuZCB0aGVuIHRyeSBhZ2Fpbi5cIik7XG5cdFx0XHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEU6XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvclJlbW90ZUNvbmZpZ3VyYXRpb25GaWxlRGlydHknLCBcIlVuYWJsZSB0byB3cml0ZSBpbnRvIHJlbW90ZSB1c2VyIHNldHRpbmdzIGJlY2F1c2UgdGhlIGZpbGUgaGFzIHVuc2F2ZWQgY2hhbmdlcy4gUGxlYXNlIHNhdmUgdGhlIHJlbW90ZSB1c2VyIHNldHRpbmdzIGZpbGUgZmlyc3QgYW5kIHRoZW4gdHJ5IGFnYWluLlwiKTtcblx0XHRcdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0U6XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvckNvbmZpZ3VyYXRpb25GaWxlRGlydHlXb3Jrc3BhY2UnLCBcIlVuYWJsZSB0byB3cml0ZSBpbnRvIHdvcmtzcGFjZSBzZXR0aW5ncyBiZWNhdXNlIHRoZSBmaWxlIGhhcyB1bnNhdmVkIGNoYW5nZXMuIFBsZWFzZSBzYXZlIHRoZSB3b3Jrc3BhY2Ugc2V0dGluZ3MgZmlsZSBmaXJzdCBhbmQgdGhlbiB0cnkgYWdhaW4uXCIpO1xuXHRcdFx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVI6IHtcblx0XHRcdFx0XHRcdGxldCB3b3Jrc3BhY2VGb2xkZXJOYW1lOiBzdHJpbmcgPSAnPDx1bmtub3duPj4nO1xuXHRcdFx0XHRcdFx0aWYgKG9wZXJhdGlvbi5yZXNvdXJjZSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBmb2xkZXIgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihvcGVyYXRpb24ucmVzb3VyY2UpO1xuXHRcdFx0XHRcdFx0XHRpZiAoZm9sZGVyKSB7XG5cdFx0XHRcdFx0XHRcdFx0d29ya3NwYWNlRm9sZGVyTmFtZSA9IGZvbGRlci5uYW1lO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvckNvbmZpZ3VyYXRpb25GaWxlRGlydHlGb2xkZXInLCBcIlVuYWJsZSB0byB3cml0ZSBpbnRvIGZvbGRlciBzZXR0aW5ncyBiZWNhdXNlIHRoZSBmaWxlIGhhcyB1bnNhdmVkIGNoYW5nZXMuIFBsZWFzZSBzYXZlIHRoZSAnezB9JyBmb2xkZXIgc2V0dGluZ3MgZmlsZSBmaXJzdCBhbmQgdGhlbiB0cnkgYWdhaW4uXCIsIHdvcmtzcGFjZUZvbGRlck5hbWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX0NPTkZJR1VSQVRJT05fRklMRV9NT0RJRklFRF9TSU5DRTpcblx0XHRcdFx0aWYgKG9wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleSA9PT0gVEFTS1NfQ09ORklHVVJBVElPTl9LRVkpIHtcblx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvclRhc2tzQ29uZmlndXJhdGlvbkZpbGVNb2RpZmllZFNpbmNlJywgXCJVbmFibGUgdG8gd3JpdGUgaW50byB0YXNrcyBjb25maWd1cmF0aW9uIGZpbGUgYmVjYXVzZSB0aGUgY29udGVudCBvZiB0aGUgZmlsZSBpcyBuZXdlci5cIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleSA9PT0gTEFVTkNIX0NPTkZJR1VSQVRJT05fS0VZKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JMYXVuY2hDb25maWd1cmF0aW9uRmlsZU1vZGlmaWVkU2luY2UnLCBcIlVuYWJsZSB0byB3cml0ZSBpbnRvIGxhdW5jaCBjb25maWd1cmF0aW9uIGZpbGUgYmVjYXVzZSB0aGUgY29udGVudCBvZiB0aGUgZmlsZSBpcyBuZXdlci5cIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG9wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleSA9PT0gTUNQX0NPTkZJR1VSQVRJT05fS0VZKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JNQ1BDb25maWd1cmF0aW9uRmlsZU1vZGlmaWVkU2luY2UnLCBcIlVuYWJsZSB0byB3cml0ZSBpbnRvIE1DUCBjb25maWd1cmF0aW9uIGZpbGUgYmVjYXVzZSB0aGUgY29udGVudCBvZiB0aGUgZmlsZSBpcyBuZXdlci5cIik7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3dpdGNoICh0YXJnZXQpIHtcblx0XHRcdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMOlxuXHRcdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JDb25maWd1cmF0aW9uRmlsZU1vZGlmaWVkU2luY2UnLCBcIlVuYWJsZSB0byB3cml0ZSBpbnRvIHVzZXIgc2V0dGluZ3MgYmVjYXVzZSB0aGUgY29udGVudCBvZiB0aGUgZmlsZSBpcyBuZXdlci5cIik7XG5cdFx0XHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEU6XG5cdFx0XHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdlcnJvclJlbW90ZUNvbmZpZ3VyYXRpb25GaWxlTW9kaWZpZWRTaW5jZScsIFwiVW5hYmxlIHRvIHdyaXRlIGludG8gcmVtb3RlIHVzZXIgc2V0dGluZ3MgYmVjYXVzZSB0aGUgY29udGVudCBvZiB0aGUgZmlsZSBpcyBuZXdlci5cIik7XG5cdFx0XHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFOlxuXHRcdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JDb25maWd1cmF0aW9uRmlsZU1vZGlmaWVkU2luY2VXb3Jrc3BhY2UnLCBcIlVuYWJsZSB0byB3cml0ZSBpbnRvIHdvcmtzcGFjZSBzZXR0aW5ncyBiZWNhdXNlIHRoZSBjb250ZW50IG9mIHRoZSBmaWxlIGlzIG5ld2VyLlwiKTtcblx0XHRcdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSOlxuXHRcdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JDb25maWd1cmF0aW9uRmlsZU1vZGlmaWVkU2luY2VGb2xkZXInLCBcIlVuYWJsZSB0byB3cml0ZSBpbnRvIGZvbGRlciBzZXR0aW5ncyBiZWNhdXNlIHRoZSBjb250ZW50IG9mIHRoZSBmaWxlIGlzIG5ld2VyLlwiKTtcblx0XHRcdFx0fVxuXHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yQ29kZS5FUlJPUl9JTlRFUk5BTDogcmV0dXJuIG5scy5sb2NhbGl6ZSgnZXJyb3JVbmtub3duJywgXCJVbmFibGUgdG8gd3JpdGUgdG8gezB9IGJlY2F1c2Ugb2YgYW4gaW50ZXJuYWwgZXJyb3IuXCIsIHRoaXMuc3RyaW5naWZ5VGFyZ2V0KHRhcmdldCkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc3RyaW5naWZ5VGFyZ2V0KHRhcmdldDogRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0KTogc3RyaW5nIHtcblx0XHRzd2l0Y2ggKHRhcmdldCkge1xuXHRcdFx0Y2FzZSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDpcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgndXNlclRhcmdldCcsIFwiVXNlciBTZXR0aW5nc1wiKTtcblx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFOlxuXHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdyZW1vdGVVc2VyVGFyZ2V0JywgXCJSZW1vdGUgVXNlciBTZXR0aW5nc1wiKTtcblx0XHRcdGNhc2UgRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTpcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnd29ya3NwYWNlVGFyZ2V0JywgXCJXb3Jrc3BhY2UgU2V0dGluZ3NcIik7XG5cdFx0XHRjYXNlIEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSOlxuXHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdmb2xkZXJUYXJnZXQnLCBcIkZvbGRlciBTZXR0aW5nc1wiKTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiAnJztcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGRlZmF1bHRSZXNvdXJjZVZhbHVlKHJlc291cmNlOiBVUkkpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGJhc2VuYW1lOiBzdHJpbmcgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuYmFzZW5hbWUocmVzb3VyY2UpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25WYWx1ZTogc3RyaW5nID0gYmFzZW5hbWUuc3Vic3RyKDAsIGJhc2VuYW1lLmxlbmd0aCAtIHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5leHRuYW1lKHJlc291cmNlKS5sZW5ndGgpO1xuXHRcdHN3aXRjaCAoY29uZmlndXJhdGlvblZhbHVlKSB7XG5cdFx0XHRjYXNlIFRBU0tTX0NPTkZJR1VSQVRJT05fS0VZOiByZXR1cm4gVEFTS1NfREVGQVVMVDtcblx0XHRcdGRlZmF1bHQ6IHJldHVybiAne30nO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVzb2x2ZU1vZGVsUmVmZXJlbmNlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElSZWZlcmVuY2U8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPj4ge1xuXHRcdGNvbnN0IGV4aXN0cyA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UuZXhpc3RzKHJlc291cmNlKTtcblx0XHRpZiAoIWV4aXN0cykge1xuXHRcdFx0YXdhaXQgdGhpcy50ZXh0RmlsZVNlcnZpY2Uud3JpdGUocmVzb3VyY2UsIHRoaXMuZGVmYXVsdFJlc291cmNlVmFsdWUocmVzb3VyY2UpLCB7IGVuY29kaW5nOiAndXRmOCcgfSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnRleHRNb2RlbFJlc29sdmVyU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShyZXNvdXJjZSk7XG5cdH1cblxuXHRwcml2YXRlIGhhc1BhcnNlRXJyb3JzKGNvbnRlbnQ6IHN0cmluZywgb3BlcmF0aW9uOiBJQ29uZmlndXJhdGlvbkVkaXRPcGVyYXRpb24pOiBib29sZWFuIHtcblx0XHQvLyBJZiB3ZSB3cml0ZSB0byBhIHdvcmtzcGFjZSBzdGFuZGFsb25lIGZpbGUgYW5kIHJlcGxhY2UgdGhlIGVudGlyZSBjb250ZW50cyAobm8ga2V5IHByb3ZpZGVkKVxuXHRcdC8vIHdlIGNhbiByZXR1cm4gaGVyZSBiZWNhdXNlIGFueSBwYXJzZSBlcnJvcnMgY2FuIHNhZmVseSBiZSBpZ25vcmVkIHNpbmNlIGFsbCBjb250ZW50cyBhcmUgcmVwbGFjZWRcblx0XHRpZiAob3BlcmF0aW9uLndvcmtzcGFjZVN0YW5kQWxvbmVDb25maWd1cmF0aW9uS2V5ICYmICFvcGVyYXRpb24ua2V5KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHBhcnNlRXJyb3JzOiBqc29uLlBhcnNlRXJyb3JbXSA9IFtdO1xuXHRcdGpzb24ucGFyc2UoY29udGVudCwgcGFyc2VFcnJvcnMsIHsgYWxsb3dUcmFpbGluZ0NvbW1hOiB0cnVlLCBhbGxvd0VtcHR5Q29udGVudDogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gcGFyc2VFcnJvcnMubGVuZ3RoID4gMDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdmFsaWRhdGUodGFyZ2V0OiBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQsIG9wZXJhdGlvbjogSUNvbmZpZ3VyYXRpb25FZGl0T3BlcmF0aW9uLCBjaGVja0RpcnR5OiBib29sZWFuLCBvdmVycmlkZXM6IElDb25maWd1cmF0aW9uVXBkYXRlT3ZlcnJpZGVzKTogUHJvbWlzZTx2b2lkPiB7XG5cblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KG9wZXJhdGlvbi5rZXkpLnBvbGljeVZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IHRoaXMudG9Db25maWd1cmF0aW9uRWRpdGluZ0Vycm9yKENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX1BPTElDWV9DT05GSUdVUkFUSU9OLCB0YXJnZXQsIG9wZXJhdGlvbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblByb3BlcnRpZXMgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TY29wZSA9IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW29wZXJhdGlvbi5rZXldPy5zY29wZTtcblxuXHRcdC8qKlxuXHRcdCAqIEtleSB0byB1cGRhdGUgbXVzdCBiZSBhIGtub3duIHNldHRpbmcgZnJvbSB0aGUgcmVnaXN0cnkgdW5sZXNzXG5cdFx0ICogXHQtIHRoZSBrZXkgaXMgc3RhbmRhbG9uZSBjb25maWd1cmF0aW9uIChlZzogdGFza3MsIGRlYnVnKVxuXHRcdCAqIFx0LSB0aGUga2V5IGlzIGFuIG92ZXJyaWRlIGlkZW50aWZpZXJcblx0XHQgKiBcdC0gdGhlIG9wZXJhdGlvbiBpcyB0byBkZWxldGUgdGhlIGtleVxuXHRcdCAqL1xuXHRcdGlmICghb3BlcmF0aW9uLndvcmtzcGFjZVN0YW5kQWxvbmVDb25maWd1cmF0aW9uS2V5KSB7XG5cdFx0XHRjb25zdCB2YWxpZEtleXMgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmtleXMoKS5kZWZhdWx0O1xuXHRcdFx0aWYgKHZhbGlkS2V5cy5pbmRleE9mKG9wZXJhdGlvbi5rZXkpIDwgMCAmJiAhT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChvcGVyYXRpb24ua2V5KSAmJiBvcGVyYXRpb24udmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aHJvdyB0aGlzLnRvQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvcihDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yQ29kZS5FUlJPUl9VTktOT1dOX0tFWSwgdGFyZ2V0LCBvcGVyYXRpb24pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChvcGVyYXRpb24ud29ya3NwYWNlU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25LZXkpIHtcblx0XHRcdC8vIEdsb2JhbCBsYXVuY2hlcyBhcmUgbm90IHN1cHBvcnRlZFxuXHRcdFx0aWYgKChvcGVyYXRpb24ud29ya3NwYWNlU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25LZXkgIT09IFRBU0tTX0NPTkZJR1VSQVRJT05fS0VZKSAmJiAob3BlcmF0aW9uLndvcmtzcGFjZVN0YW5kQWxvbmVDb25maWd1cmF0aW9uS2V5ICE9PSBNQ1BfQ09ORklHVVJBVElPTl9LRVkpICYmICh0YXJnZXQgPT09IEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMIHx8IHRhcmdldCA9PT0gRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFKSkge1xuXHRcdFx0XHR0aHJvdyB0aGlzLnRvQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvcihDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yQ29kZS5FUlJPUl9JTlZBTElEX1VTRVJfVEFSR0VULCB0YXJnZXQsIG9wZXJhdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gVGFyZ2V0IGNhbm5vdCBiZSB3b3Jrc3BhY2Ugb3IgZm9sZGVyIGlmIG5vIHdvcmtzcGFjZSBvcGVuZWRcblx0XHRpZiAoKHRhcmdldCA9PT0gRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSB8fCB0YXJnZXQgPT09IEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSKSAmJiB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSB7XG5cdFx0XHR0aHJvdyB0aGlzLnRvQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvcihDb25maWd1cmF0aW9uRWRpdGluZ0Vycm9yQ29kZS5FUlJPUl9OT19XT1JLU1BBQ0VfT1BFTkVELCB0YXJnZXQsIG9wZXJhdGlvbik7XG5cdFx0fVxuXG5cdFx0aWYgKHRhcmdldCA9PT0gRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSkge1xuXHRcdFx0aWYgKCFvcGVyYXRpb24ud29ya3NwYWNlU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25LZXkgJiYgIU9WRVJSSURFX1BST1BFUlRZX1JFR0VYLnRlc3Qob3BlcmF0aW9uLmtleSkpIHtcblx0XHRcdFx0aWYgKGNvbmZpZ3VyYXRpb25TY29wZSAmJiBBUFBMSUNBVElPTl9TQ09QRVMuaW5jbHVkZXMoY29uZmlndXJhdGlvblNjb3BlKSkge1xuXHRcdFx0XHRcdHRocm93IHRoaXMudG9Db25maWd1cmF0aW9uRWRpdGluZ0Vycm9yKENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX0lOVkFMSURfV09SS1NQQUNFX0NPTkZJR1VSQVRJT05fQVBQTElDQVRJT04sIHRhcmdldCwgb3BlcmF0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY29uZmlndXJhdGlvblNjb3BlID09PSBDb25maWd1cmF0aW9uU2NvcGUuTUFDSElORSkge1xuXHRcdFx0XHRcdHRocm93IHRoaXMudG9Db25maWd1cmF0aW9uRWRpdGluZ0Vycm9yKENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX0lOVkFMSURfV09SS1NQQUNFX0NPTkZJR1VSQVRJT05fTUFDSElORSwgdGFyZ2V0LCBvcGVyYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRhcmdldCA9PT0gRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIpIHtcblx0XHRcdGlmICghb3BlcmF0aW9uLnJlc291cmNlKSB7XG5cdFx0XHRcdHRocm93IHRoaXMudG9Db25maWd1cmF0aW9uRWRpdGluZ0Vycm9yKENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX0lOVkFMSURfRk9MREVSX1RBUkdFVCwgdGFyZ2V0LCBvcGVyYXRpb24pO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIW9wZXJhdGlvbi53b3Jrc3BhY2VTdGFuZEFsb25lQ29uZmlndXJhdGlvbktleSAmJiAhT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChvcGVyYXRpb24ua2V5KSkge1xuXHRcdFx0XHRpZiAoY29uZmlndXJhdGlvblNjb3BlICE9PSB1bmRlZmluZWQgJiYgIUZPTERFUl9TQ09QRVMuaW5jbHVkZXMoY29uZmlndXJhdGlvblNjb3BlKSkge1xuXHRcdFx0XHRcdHRocm93IHRoaXMudG9Db25maWd1cmF0aW9uRWRpdGluZ0Vycm9yKENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX0lOVkFMSURfRk9MREVSX0NPTkZJR1VSQVRJT04sIHRhcmdldCwgb3BlcmF0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVycz8ubGVuZ3RoKSB7XG5cdFx0XHRpZiAoY29uZmlndXJhdGlvblNjb3BlICE9PSBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUpIHtcblx0XHRcdFx0dGhyb3cgdGhpcy50b0NvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IoQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfSU5WQUxJRF9SRVNPVVJDRV9MQU5HVUFHRV9DT05GSUdVUkFUSU9OLCB0YXJnZXQsIG9wZXJhdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFvcGVyYXRpb24ucmVzb3VyY2UpIHtcblx0XHRcdHRocm93IHRoaXMudG9Db25maWd1cmF0aW9uRWRpdGluZ0Vycm9yKENvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlLkVSUk9SX0lOVkFMSURfRk9MREVSX1RBUkdFVCwgdGFyZ2V0LCBvcGVyYXRpb24pO1xuXHRcdH1cblxuXHRcdGlmIChjaGVja0RpcnR5ICYmIHRoaXMudGV4dEZpbGVTZXJ2aWNlLmlzRGlydHkob3BlcmF0aW9uLnJlc291cmNlKSkge1xuXHRcdFx0dGhyb3cgdGhpcy50b0NvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3IoQ29uZmlndXJhdGlvbkVkaXRpbmdFcnJvckNvZGUuRVJST1JfQ09ORklHVVJBVElPTl9GSUxFX0RJUlRZLCB0YXJnZXQsIG9wZXJhdGlvbik7XG5cdFx0fVxuXG5cdH1cblxuXHRwcml2YXRlIGdldENvbmZpZ3VyYXRpb25FZGl0T3BlcmF0aW9uKHRhcmdldDogRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LCBjb25maWc6IElDb25maWd1cmF0aW9uVmFsdWUsIG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25VcGRhdGVPdmVycmlkZXMpOiBJQ29uZmlndXJhdGlvbkVkaXRPcGVyYXRpb24ge1xuXG5cdFx0Ly8gQ2hlY2sgZm9yIHN0YW5kYWxvbmUgd29ya3NwYWNlIGNvbmZpZ3VyYXRpb25zXG5cdFx0aWYgKGNvbmZpZy5rZXkpIHtcblx0XHRcdGNvbnN0IHN0YW5kYWxvbmVDb25maWd1cmF0aW9uTWFwID0gdGFyZ2V0ID09PSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCA/IFVTRVJfU1RBTkRBTE9ORV9DT05GSUdVUkFUSU9OUyA6IFdPUktTUEFDRV9TVEFOREFMT05FX0NPTkZJR1VSQVRJT05TO1xuXHRcdFx0Y29uc3Qgc3RhbmRhbG9uZUNvbmZpZ3VyYXRpb25LZXlzID0gT2JqZWN0LmtleXMoc3RhbmRhbG9uZUNvbmZpZ3VyYXRpb25NYXApO1xuXHRcdFx0Zm9yIChjb25zdCBrZXkgb2Ygc3RhbmRhbG9uZUNvbmZpZ3VyYXRpb25LZXlzKSB7XG5cdFx0XHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5nZXRDb25maWd1cmF0aW9uRmlsZVJlc291cmNlKHRhcmdldCwga2V5LCBzdGFuZGFsb25lQ29uZmlndXJhdGlvbk1hcFtrZXldLCBvdmVycmlkZXMucmVzb3VyY2UsIHVuZGVmaW5lZCk7XG5cblx0XHRcdFx0Ly8gQ2hlY2sgZm9yIHByZWZpeFxuXHRcdFx0XHRpZiAoY29uZmlnLmtleSA9PT0ga2V5KSB7XG5cdFx0XHRcdFx0Y29uc3QganNvblBhdGggPSB0aGlzLmlzV29ya3NwYWNlQ29uZmlndXJhdGlvblJlc291cmNlKHJlc291cmNlKSA/IFtrZXldIDogW107XG5cdFx0XHRcdFx0cmV0dXJuIHsga2V5OiBqc29uUGF0aFtqc29uUGF0aC5sZW5ndGggLSAxXSwganNvblBhdGgsIHZhbHVlOiBjb25maWcudmFsdWUsIHJlc291cmNlOiByZXNvdXJjZSA/PyB1bmRlZmluZWQsIHdvcmtzcGFjZVN0YW5kQWxvbmVDb25maWd1cmF0aW9uS2V5OiBrZXksIHRhcmdldCB9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gQ2hlY2sgZm9yIHByZWZpeC48c2V0dGluZz5cblx0XHRcdFx0Y29uc3Qga2V5UHJlZml4ID0gYCR7a2V5fS5gO1xuXHRcdFx0XHRpZiAoY29uZmlnLmtleS5pbmRleE9mKGtleVByZWZpeCkgPT09IDApIHtcblx0XHRcdFx0XHRjb25zdCBqc29uUGF0aCA9IHRoaXMuaXNXb3Jrc3BhY2VDb25maWd1cmF0aW9uUmVzb3VyY2UocmVzb3VyY2UpID8gW2tleSwgY29uZmlnLmtleS5zdWJzdHJpbmcoa2V5UHJlZml4Lmxlbmd0aCldIDogW2NvbmZpZy5rZXkuc3Vic3RyaW5nKGtleVByZWZpeC5sZW5ndGgpXTtcblx0XHRcdFx0XHRyZXR1cm4geyBrZXk6IGpzb25QYXRoW2pzb25QYXRoLmxlbmd0aCAtIDFdLCBqc29uUGF0aCwgdmFsdWU6IGNvbmZpZy52YWx1ZSwgcmVzb3VyY2U6IHJlc291cmNlID8/IHVuZGVmaW5lZCwgd29ya3NwYWNlU3RhbmRBbG9uZUNvbmZpZ3VyYXRpb25LZXk6IGtleSwgdGFyZ2V0IH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBrZXkgPSBjb25maWcua2V5O1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbikuZ2V0Q29uZmlndXJhdGlvblByb3BlcnRpZXMoKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2NvcGUgPSBjb25maWd1cmF0aW9uUHJvcGVydGllc1trZXldPy5zY29wZTtcblx0XHRsZXQganNvblBhdGggPSBvdmVycmlkZXMub3ZlcnJpZGVJZGVudGlmaWVycz8ubGVuZ3RoID8gW2tleUZyb21PdmVycmlkZUlkZW50aWZpZXJzKG92ZXJyaWRlcy5vdmVycmlkZUlkZW50aWZpZXJzKSwga2V5XSA6IFtrZXldO1xuXHRcdGlmICh0YXJnZXQgPT09IEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMIHx8IHRhcmdldCA9PT0gRWRpdGFibGVDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFKSB7XG5cdFx0XHRyZXR1cm4geyBrZXksIGpzb25QYXRoLCB2YWx1ZTogY29uZmlnLnZhbHVlLCByZXNvdXJjZTogdGhpcy5nZXRDb25maWd1cmF0aW9uRmlsZVJlc291cmNlKHRhcmdldCwga2V5LCAnJywgbnVsbCwgY29uZmlndXJhdGlvblNjb3BlKSA/PyB1bmRlZmluZWQsIHRhcmdldCB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5nZXRDb25maWd1cmF0aW9uRmlsZVJlc291cmNlKHRhcmdldCwga2V5LCBGT0xERVJfU0VUVElOR1NfUEFUSCwgb3ZlcnJpZGVzLnJlc291cmNlLCBjb25maWd1cmF0aW9uU2NvcGUpO1xuXHRcdGlmICh0aGlzLmlzV29ya3NwYWNlQ29uZmlndXJhdGlvblJlc291cmNlKHJlc291cmNlKSkge1xuXHRcdFx0anNvblBhdGggPSBbJ3NldHRpbmdzJywgLi4uanNvblBhdGhdO1xuXHRcdH1cblx0XHRyZXR1cm4geyBrZXksIGpzb25QYXRoLCB2YWx1ZTogY29uZmlnLnZhbHVlLCByZXNvdXJjZTogcmVzb3VyY2UgPz8gdW5kZWZpbmVkLCB0YXJnZXQgfTtcblx0fVxuXG5cdHByaXZhdGUgaXNXb3Jrc3BhY2VDb25maWd1cmF0aW9uUmVzb3VyY2UocmVzb3VyY2U6IFVSSSB8IG51bGwpOiBib29sZWFuIHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXHRcdHJldHVybiAhISh3b3Jrc3BhY2UuY29uZmlndXJhdGlvbiAmJiByZXNvdXJjZSAmJiB3b3Jrc3BhY2UuY29uZmlndXJhdGlvbi5mc1BhdGggPT09IHJlc291cmNlLmZzUGF0aCk7XG5cdH1cblxuXHRwcml2YXRlIGdldENvbmZpZ3VyYXRpb25GaWxlUmVzb3VyY2UodGFyZ2V0OiBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQsIGtleTogc3RyaW5nLCByZWxhdGl2ZVBhdGg6IHN0cmluZywgcmVzb3VyY2U6IFVSSSB8IG51bGwgfCB1bmRlZmluZWQsIHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUgfCB1bmRlZmluZWQpOiBVUkkgfCBudWxsIHtcblx0XHRpZiAodGFyZ2V0ID09PSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCkge1xuXHRcdFx0aWYgKGtleSA9PT0gVEFTS1NfQ09ORklHVVJBVElPTl9LRVkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS50YXNrc1Jlc291cmNlO1xuXHRcdFx0fSBpZiAoa2V5ID09PSBNQ1BfQ09ORklHVVJBVElPTl9LRVkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlU2VydmljZS5jdXJyZW50UHJvZmlsZS5tY3BSZXNvdXJjZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmICghdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmlzRGVmYXVsdCAmJiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmlzU2V0dGluZ0FwcGxpZWRGb3JBbGxQcm9maWxlcyhrZXkpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0YXJnZXQgPT09IEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVtb3RlU2V0dGluZ3NSZXNvdXJjZTtcblx0XHR9XG5cdFx0Y29uc3Qgd29ya2JlbmNoU3RhdGUgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCk7XG5cdFx0aWYgKHdvcmtiZW5jaFN0YXRlICE9PSBXb3JrYmVuY2hTdGF0ZS5FTVBUWSkge1xuXG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpO1xuXG5cdFx0XHRpZiAodGFyZ2V0ID09PSBFZGl0YWJsZUNvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFKSB7XG5cdFx0XHRcdGlmICh3b3JrYmVuY2hTdGF0ZSA9PT0gV29ya2JlbmNoU3RhdGUuV09SS1NQQUNFKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHdvcmtzcGFjZS5jb25maWd1cmF0aW9uID8/IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHdvcmtiZW5jaFN0YXRlID09PSBXb3JrYmVuY2hTdGF0ZS5GT0xERVIpIHtcblx0XHRcdFx0XHRyZXR1cm4gd29ya3NwYWNlLmZvbGRlcnNbMF0udG9SZXNvdXJjZShyZWxhdGl2ZVBhdGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0YXJnZXQgPT09IEVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSKSB7XG5cdFx0XHRcdGlmIChyZXNvdXJjZSkge1xuXHRcdFx0XHRcdGNvbnN0IGZvbGRlciA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlRm9sZGVyKHJlc291cmNlKTtcblx0XHRcdFx0XHRpZiAoZm9sZGVyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZm9sZGVyLnRvUmVzb3VyY2UocmVsYXRpdmVQYXRoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBRXJCLFlBQVksVUFBVTtBQUN0QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGFBQWE7QUFFdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEIsc0JBQXNCO0FBQ3pELFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsc0JBQXNCLHFDQUFxQyx5QkFBeUIsMEJBQTBCLGdDQUFnQyxlQUFlLGVBQWUsZ0NBQWdDLG9CQUFvQiw2QkFBNkI7QUFDdFEsU0FBNkIscUJBQXFCLG9CQUFvQjtBQUN0RSxTQUFtQyx5QkFBeUI7QUFDNUQsU0FBaUMsY0FBYyx5QkFBeUIsb0JBQW9CLDRCQUE0QiwrQkFBK0I7QUFDdkosU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQStCLDJCQUEyQjtBQUMxRCxTQUFTLDJCQUEyQjtBQUdwQyxTQUFT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S0FBSyxxQkFBcUIsK0JBQStCLEdBQUcsR0FBRztBQUMzSCxpQkFBTyxLQUFLLHdCQUF3QixlQUFlO0FBQUEsUUFDcEQ7QUFDQSxlQUFPLEtBQUssdUJBQXVCLGVBQWU7QUFBQSxNQUNuRDtBQUFBLElBQ0Q7QUFDQSxRQUFJLFdBQVcscUJBQXlDO0FBQ3ZELGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxVQUFNLGlCQUFpQixLQUFLLGVBQWUsa0JBQWtCO0FBQzdELFFBQUksbUJBQW1CLGVBQWUsT0FBTztBQUU1QyxZQUFNLFlBQVksS0FBSyxlQUFlLGFBQWE7QUFFbkQsVUFBSSxXQUFXLG1CQUF1QztBQUNyRCxZQUFJLG1CQUFtQixlQUFlLFdBQVc7QUFDaEQsaUJBQU8sVUFBVSxpQkFBaUI7QUFBQSxRQUNuQztBQUNBLFlBQUksbUJBQW1CLGVBQWUsUUFBUTtBQUM3QyxpQkFBTyxVQUFVLFFBQVEsQ0FBQyxFQUFFLFdBQVcsWUFBWTtBQUFBLFFBQ3BEO0FBQUEsTUFDRDtBQUVBLFVBQUksV0FBVywwQkFBOEM7QUFDNUQsWUFBSSxVQUFVO0FBQ2IsZ0JBQU0sU0FBUyxLQUFLLGVBQWUsbUJBQW1CLFFBQVE7QUFDOUQsY0FBSSxRQUFRO0FBQ1gsbUJBQU8sT0FBTyxXQUFXLFlBQVk7QUFBQSxVQUN0QztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFqaEJhLHVCQUFOO0FBQUEsRUFRSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FuQlU7IiwKICAibmFtZXMiOiBbIkNvbmZpZ3VyYXRpb25FZGl0aW5nRXJyb3JDb2RlIiwgIkVkaXRhYmxlQ29uZmlndXJhdGlvblRhcmdldCIsICJrZXkiLCAicmVzb3VyY2UiLCAianNvblBhdGgiXQp9Cg==
