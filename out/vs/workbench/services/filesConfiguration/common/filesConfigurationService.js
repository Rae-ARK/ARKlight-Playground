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
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { RawContextKey, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { AutoSaveConfiguration, HotExitConfiguration, FILES_READONLY_INCLUDE_CONFIG, FILES_READONLY_EXCLUDE_CONFIG, IFileService, hasReadonlyCapability } from "../../../../platform/files/common/files.js";
import { equals } from "../../../../base/common/objects.js";
import { isWeb } from "../../../../base/common/platform.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { ResourceGlobMatcher } from "../../../common/resources.js";
import { GlobalIdleValue } from "../../../../base/common/async.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { LRUCache, ResourceMap } from "../../../../base/common/map.js";
import { EditorInput } from "../../../common/editor/editorInput.js";
import { EditorResourceAccessor, SaveReason, SideBySideEditor } from "../../../common/editor.js";
import { IMarkerService, MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
const AutoSaveAfterShortDelayContext = new RawContextKey("autoSaveAfterShortDelayContext", false, true);
var AutoSaveMode = /* @__PURE__ */ ((AutoSaveMode2) => {
  AutoSaveMode2[AutoSaveMode2["OFF"] = 0] = "OFF";
  AutoSaveMode2[AutoSaveMode2["AFTER_SHORT_DELAY"] = 1] = "AFTER_SHORT_DELAY";
  AutoSaveMode2[AutoSaveMode2["AFTER_LONG_DELAY"] = 2] = "AFTER_LONG_DELAY";
  AutoSaveMode2[AutoSaveMode2["ON_FOCUS_CHANGE"] = 3] = "ON_FOCUS_CHANGE";
  AutoSaveMode2[AutoSaveMode2["ON_WINDOW_CHANGE"] = 4] = "ON_WINDOW_CHANGE";
  return AutoSaveMode2;
})(AutoSaveMode || {});
var AutoSaveDisabledReason = /* @__PURE__ */ ((AutoSaveDisabledReason2) => {
  AutoSaveDisabledReason2[AutoSaveDisabledReason2["SETTINGS"] = 1] = "SETTINGS";
  AutoSaveDisabledReason2[AutoSaveDisabledReason2["OUT_OF_WORKSPACE"] = 2] = "OUT_OF_WORKSPACE";
  AutoSaveDisabledReason2[AutoSaveDisabledReason2["ERRORS"] = 3] = "ERRORS";
  AutoSaveDisabledReason2[AutoSaveDisabledReason2["DISABLED"] = 4] = "DISABLED";
  return AutoSaveDisabledReason2;
})(AutoSaveDisabledReason || {});
const IFilesConfigurationService = createDecorator("filesConfigurationService");
let FilesConfigurationService = class extends Disposable {
  constructor(contextKeyService, configurationService, contextService, environmentService, uriIdentityService, fileService, markerService, textResourceConfigurationService) {
    super();
    this.configurationService = configurationService;
    this.contextService = contextService;
    this.environmentService = environmentService;
    this.uriIdentityService = uriIdentityService;
    this.fileService = fileService;
    this.markerService = markerService;
    this.textResourceConfigurationService = textResourceConfigurationService;
    this._onDidChangeAutoSaveConfiguration = this._register(new Emitter());
    this.onDidChangeAutoSaveConfiguration = this._onDidChangeAutoSaveConfiguration.event;
    this._onDidChangeAutoSaveDisabled = this._register(new Emitter());
    this.onDidChangeAutoSaveDisabled = this._onDidChangeAutoSaveDisabled.event;
    this._onDidChangeFilesAssociation = this._register(new Emitter());
    this.onDidChangeFilesAssociation = this._onDidChangeFilesAssociation.event;
    this._onDidChangeReadonly = this._register(new Emitter());
    this.onDidChangeReadonly = this._onDidChangeReadonly.event;
    this.autoSaveConfigurationCache = new LRUCache(1e3);
    this.autoSaveAfterShortDelayOverrides = new ResourceMap();
    this.autoSaveDisabledOverrides = new ResourceMap();
    this.readonlyIncludeMatcher = this._register(new GlobalIdleValue(() => this.createReadonlyMatcher(FILES_READONLY_INCLUDE_CONFIG)));
    this.readonlyExcludeMatcher = this._register(new GlobalIdleValue(() => this.createReadonlyMatcher(FILES_READONLY_EXCLUDE_CONFIG)));
    this.sessionReadonlyOverrides = new ResourceMap((resource) => this.uriIdentityService.extUri.getComparisonKey(resource));
    this.autoSaveAfterShortDelayContext = AutoSaveAfterShortDelayContext.bindTo(contextKeyService);
    const configuration = configurationService.getValue();
    this.currentGlobalAutoSaveConfiguration = this.computeAutoSaveConfiguration(void 0, configuration.files);
    this.currentFilesAssociationConfiguration = configuration?.files?.associations;
    this.currentHotExitConfiguration = configuration?.files?.hotExit || HotExitConfiguration.ON_EXIT;
    this.onFilesConfigurationChange(configuration, false);
    this.registerListeners();
  }
  createReadonlyMatcher(config) {
    const matcher = this._register(new ResourceGlobMatcher(
      (resource) => this.configurationService.getValue(config, { resource }),
      (event) => event.affectsConfiguration(config),
      this.contextService,
      this.configurationService
    ));
    this._register(matcher.onExpressionChange(() => this._onDidChangeReadonly.fire()));
    return matcher;
  }
  isReadonly(resource, stat) {
    const provider = this.fileService.getProvider(resource.scheme);
    if (provider && hasReadonlyCapability(provider)) {
      return provider.readOnlyMessage ?? FilesConfigurationService.READONLY_MESSAGES.providerReadonly;
    }
    const sessionReadonlyOverride = this.sessionReadonlyOverrides.get(resource);
    if (typeof sessionReadonlyOverride === "boolean") {
      return sessionReadonlyOverride === true ? FilesConfigurationService.READONLY_MESSAGES.sessionReadonly : false;
    }
    if (this.uriIdentityService.extUri.isEqualOrParent(resource, this.environmentService.userRoamingDataHome) || this.uriIdentityService.extUri.isEqual(resource, this.contextService.getWorkspace().configuration ?? void 0)) {
      return false;
    }
    if (this.readonlyIncludeMatcher.value.matches(resource)) {
      return !this.readonlyExcludeMatcher.value.matches(resource) ? FilesConfigurationService.READONLY_MESSAGES.configuredReadonly : false;
    }
    if (this.configuredReadonlyFromPermissions && stat?.locked) {
      return FilesConfigurationService.READONLY_MESSAGES.fileLocked;
    }
    if (stat?.readonly) {
      return FilesConfigurationService.READONLY_MESSAGES.fileReadonly;
    }
    return false;
  }
  async updateReadonly(resource, readonly) {
    if (Array.isArray(resource)) {
      for (const r of resource) {
        this.applyReadonly(r, readonly);
      }
      if (resource.length > 0) {
        this._onDidChangeReadonly.fire();
      }
      return;
    }
    if (readonly === "toggle") {
      let stat = void 0;
      try {
        stat = await this.fileService.resolve(resource, { resolveMetadata: true });
      } catch (error) {
      }
      readonly = !this.isReadonly(resource, stat);
    }
    this.applyReadonly(resource, readonly);
    this._onDidChangeReadonly.fire();
  }
  applyReadonly(resource, readonly) {
    if (readonly === "reset") {
      this.sessionReadonlyOverrides.delete(resource);
    } else {
      this.sessionReadonlyOverrides.set(resource, readonly);
    }
  }
  registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("files")) {
        this.onFilesConfigurationChange(this.configurationService.getValue(), true);
      }
    }));
  }
  onFilesConfigurationChange(configuration, fromEvent) {
    this.currentGlobalAutoSaveConfiguration = this.computeAutoSaveConfiguration(void 0, configuration.files);
    this.autoSaveConfigurationCache.clear();
    this.autoSaveAfterShortDelayContext.set(this.getAutoSaveMode(void 0).mode === 1 /* AFTER_SHORT_DELAY */);
    if (fromEvent) {
      this._onDidChangeAutoSaveConfiguration.fire();
    }
    const filesAssociation = configuration?.files?.associations;
    if (!equals(this.currentFilesAssociationConfiguration, filesAssociation)) {
      this.currentFilesAssociationConfiguration = filesAssociation;
      if (fromEvent) {
        this._onDidChangeFilesAssociation.fire();
      }
    }
    const hotExitMode = configuration?.files?.hotExit;
    if (hotExitMode === HotExitConfiguration.OFF || hotExitMode === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE) {
      this.currentHotExitConfiguration = hotExitMode;
    } else {
      this.currentHotExitConfiguration = HotExitConfiguration.ON_EXIT;
    }
    const readonlyFromPermissions = Boolean(configuration?.files?.readonlyFromPermissions);
    if (readonlyFromPermissions !== Boolean(this.configuredReadonlyFromPermissions)) {
      this.configuredReadonlyFromPermissions = readonlyFromPermissions;
      if (fromEvent) {
        this._onDidChangeReadonly.fire();
      }
    }
  }
  getAutoSaveConfiguration(resourceOrEditor) {
    const resource = this.toResource(resourceOrEditor);
    if (resource) {
      let resourceAutoSaveConfiguration = this.autoSaveConfigurationCache.get(resource);
      if (!resourceAutoSaveConfiguration) {
        resourceAutoSaveConfiguration = this.computeAutoSaveConfiguration(resource, this.textResourceConfigurationService.getValue(resource, "files"));
        this.autoSaveConfigurationCache.set(resource, resourceAutoSaveConfiguration);
      }
      return resourceAutoSaveConfiguration;
    }
    return this.currentGlobalAutoSaveConfiguration;
  }
  computeAutoSaveConfiguration(resource, filesConfiguration) {
    let autoSave;
    let autoSaveDelay;
    let autoSaveWorkspaceFilesOnly;
    let autoSaveWhenNoErrors;
    let isOutOfWorkspace;
    let isShortAutoSaveDelay;
    switch (filesConfiguration?.autoSave ?? FilesConfigurationService.DEFAULT_AUTO_SAVE_MODE) {
      case AutoSaveConfiguration.AFTER_DELAY: {
        autoSave = "afterDelay";
        autoSaveDelay = typeof filesConfiguration?.autoSaveDelay === "number" && filesConfiguration.autoSaveDelay >= 0 ? filesConfiguration.autoSaveDelay : FilesConfigurationService.DEFAULT_AUTO_SAVE_DELAY;
        isShortAutoSaveDelay = autoSaveDelay <= FilesConfigurationService.DEFAULT_AUTO_SAVE_DELAY;
        break;
      }
      case AutoSaveConfiguration.ON_FOCUS_CHANGE:
        autoSave = "onFocusChange";
        break;
      case AutoSaveConfiguration.ON_WINDOW_CHANGE:
        autoSave = "onWindowChange";
        break;
    }
    if (filesConfiguration?.autoSaveWorkspaceFilesOnly === true) {
      autoSaveWorkspaceFilesOnly = true;
      if (resource && !this.contextService.isInsideWorkspace(resource)) {
        isOutOfWorkspace = true;
        isShortAutoSaveDelay = void 0;
      }
    }
    if (filesConfiguration?.autoSaveWhenNoErrors === true) {
      autoSaveWhenNoErrors = true;
      isShortAutoSaveDelay = void 0;
    }
    return {
      autoSave,
      autoSaveDelay,
      autoSaveWorkspaceFilesOnly,
      autoSaveWhenNoErrors,
      isOutOfWorkspace,
      isShortAutoSaveDelay
    };
  }
  toResource(resourceOrEditor) {
    if (resourceOrEditor instanceof EditorInput) {
      return EditorResourceAccessor.getOriginalUri(resourceOrEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    }
    return resourceOrEditor;
  }
  hasShortAutoSaveDelay(resourceOrEditor) {
    const resource = this.toResource(resourceOrEditor);
    if (resource && this.autoSaveAfterShortDelayOverrides.has(resource)) {
      return true;
    }
    if (this.getAutoSaveConfiguration(resource).isShortAutoSaveDelay) {
      return !resource || !this.autoSaveDisabledOverrides.has(resource);
    }
    return false;
  }
  getAutoSaveMode(resourceOrEditor, saveReason) {
    const resource = this.toResource(resourceOrEditor);
    if (resource && this.autoSaveAfterShortDelayOverrides.has(resource)) {
      return { mode: 1 /* AFTER_SHORT_DELAY */ };
    }
    if (resource && this.autoSaveDisabledOverrides.has(resource)) {
      return { mode: 0 /* OFF */, reason: 4 /* DISABLED */ };
    }
    const autoSaveConfiguration = this.getAutoSaveConfiguration(resource);
    if (typeof autoSaveConfiguration.autoSave === "undefined") {
      return { mode: 0 /* OFF */, reason: 1 /* SETTINGS */ };
    }
    if (typeof saveReason === "number") {
      if (autoSaveConfiguration.autoSave === "afterDelay" && saveReason !== SaveReason.AUTO || autoSaveConfiguration.autoSave === "onFocusChange" && saveReason !== SaveReason.FOCUS_CHANGE && saveReason !== SaveReason.WINDOW_CHANGE || autoSaveConfiguration.autoSave === "onWindowChange" && saveReason !== SaveReason.WINDOW_CHANGE) {
        return { mode: 0 /* OFF */, reason: 1 /* SETTINGS */ };
      }
    }
    if (resource) {
      if (autoSaveConfiguration.autoSaveWorkspaceFilesOnly && autoSaveConfiguration.isOutOfWorkspace) {
        return { mode: 0 /* OFF */, reason: 2 /* OUT_OF_WORKSPACE */ };
      }
      if (autoSaveConfiguration.autoSaveWhenNoErrors && this.markerService.read({ resource, take: 1, severities: MarkerSeverity.Error }).length > 0) {
        return { mode: 0 /* OFF */, reason: 3 /* ERRORS */ };
      }
    }
    switch (autoSaveConfiguration.autoSave) {
      case "afterDelay":
        if (typeof autoSaveConfiguration.autoSaveDelay === "number" && autoSaveConfiguration.autoSaveDelay <= FilesConfigurationService.DEFAULT_AUTO_SAVE_DELAY) {
          return { mode: autoSaveConfiguration.autoSaveWhenNoErrors ? 2 /* AFTER_LONG_DELAY */ : 1 /* AFTER_SHORT_DELAY */ };
        }
        return { mode: 2 /* AFTER_LONG_DELAY */ };
      case "onFocusChange":
        return { mode: 3 /* ON_FOCUS_CHANGE */ };
      case "onWindowChange":
        return { mode: 4 /* ON_WINDOW_CHANGE */ };
    }
  }
  async toggleAutoSave() {
    const currentSetting = this.configurationService.getValue("files.autoSave");
    let newAutoSaveValue;
    if ([AutoSaveConfiguration.AFTER_DELAY, AutoSaveConfiguration.ON_FOCUS_CHANGE, AutoSaveConfiguration.ON_WINDOW_CHANGE].some((setting) => setting === currentSetting)) {
      newAutoSaveValue = AutoSaveConfiguration.OFF;
    } else {
      newAutoSaveValue = AutoSaveConfiguration.AFTER_DELAY;
    }
    return this.configurationService.updateValue("files.autoSave", newAutoSaveValue);
  }
  enableAutoSaveAfterShortDelay(resourceOrEditor) {
    const resource = this.toResource(resourceOrEditor);
    if (!resource) {
      return Disposable.None;
    }
    const counter = this.autoSaveAfterShortDelayOverrides.get(resource) ?? 0;
    this.autoSaveAfterShortDelayOverrides.set(resource, counter + 1);
    return toDisposable(() => {
      const counter2 = this.autoSaveAfterShortDelayOverrides.get(resource) ?? 0;
      if (counter2 <= 1) {
        this.autoSaveAfterShortDelayOverrides.delete(resource);
      } else {
        this.autoSaveAfterShortDelayOverrides.set(resource, counter2 - 1);
      }
    });
  }
  disableAutoSave(resourceOrEditor) {
    const resource = this.toResource(resourceOrEditor);
    if (!resource) {
      return Disposable.None;
    }
    const counter = this.autoSaveDisabledOverrides.get(resource) ?? 0;
    this.autoSaveDisabledOverrides.set(resource, counter + 1);
    if (counter === 0) {
      this._onDidChangeAutoSaveDisabled.fire(resource);
    }
    return toDisposable(() => {
      const counter2 = this.autoSaveDisabledOverrides.get(resource) ?? 0;
      if (counter2 <= 1) {
        this.autoSaveDisabledOverrides.delete(resource);
        this._onDidChangeAutoSaveDisabled.fire(resource);
      } else {
        this.autoSaveDisabledOverrides.set(resource, counter2 - 1);
      }
    });
  }
  get isHotExitEnabled() {
    if (this.contextService.getWorkspace().transient) {
      return false;
    }
    return this.currentHotExitConfiguration !== HotExitConfiguration.OFF;
  }
  get hotExitConfiguration() {
    return this.currentHotExitConfiguration;
  }
  preventSaveConflicts(resource, language) {
    return this.configurationService.getValue("files.saveConflictResolution", { resource, overrideIdentifier: language }) !== "overwriteFileOnDisk";
  }
};
FilesConfigurationService.DEFAULT_AUTO_SAVE_MODE = isWeb ? AutoSaveConfiguration.AFTER_DELAY : AutoSaveConfiguration.OFF;
FilesConfigurationService.DEFAULT_AUTO_SAVE_DELAY = 1e3;
FilesConfigurationService.READONLY_MESSAGES = {
  providerReadonly: { value: localize("providerReadonly", "Editor is read-only because the file system of the file is read-only."), isTrusted: true },
  sessionReadonly: { value: localize({ key: "sessionReadonly", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change', '{Locked="](command:{0})"}'] }, "Editor is read-only because the file was set read-only in this session. [Click here](command:{0}) to set writeable.", "workbench.action.files.setActiveEditorWriteableInSession"), isTrusted: true },
  configuredReadonly: { value: localize({ key: "configuredReadonly", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change', '{Locked="](command:{0})"}'] }, "Editor is read-only because the file was set read-only via settings. [Click here](command:{0}) to configure or [toggle for this session](command:{1}).", `workbench.action.openSettings?${encodeURIComponent('["files.readonly"]')}`, "workbench.action.files.toggleActiveEditorReadonlyInSession"), isTrusted: true },
  fileLocked: { value: localize({ key: "fileLocked", comment: ['Please do not translate the word "command", it is part of our internal syntax which must not change', '{Locked="](command:{0})"}'] }, "Editor is read-only because of file permissions. [Click here](command:{0}) to set writeable anyway.", "workbench.action.files.setActiveEditorWriteableInSession"), isTrusted: true },
  fileReadonly: { value: localize("fileReadonly", "Editor is read-only because the file is read-only."), isTrusted: true }
};
FilesConfigurationService = __decorateClass([
  __decorateParam(0, IContextKeyService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IEnvironmentService),
  __decorateParam(4, IUriIdentityService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IMarkerService),
  __decorateParam(7, ITextResourceConfigurationService)
], FilesConfigurationService);
registerSingleton(IFilesConfigurationService, FilesConfigurationService, InstantiationType.Eager);
export {
  AutoSaveAfterShortDelayContext,
  AutoSaveDisabledReason,
  AutoSaveMode,
  FilesConfigurationService,
  IFilesConfigurationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25UeXBlLCByZWdpc3RlclNpbmdsZXRvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQsIEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJhd0NvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgSUNvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvbiwgQXV0b1NhdmVDb25maWd1cmF0aW9uLCBIb3RFeGl0Q29uZmlndXJhdGlvbiwgRklMRVNfUkVBRE9OTFlfSU5DTFVERV9DT05GSUcsIEZJTEVTX1JFQURPTkxZX0VYQ0xVREVfQ09ORklHLCBJRmlsZVN0YXRXaXRoTWV0YWRhdGEsIElGaWxlU2VydmljZSwgSUJhc2VGaWxlU3RhdCwgaGFzUmVhZG9ubHlDYXBhYmlsaXR5LCBJRmlsZXNDb25maWd1cmF0aW9uTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFJlc291cmNlR2xvYk1hdGNoZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IEdsb2JhbElkbGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBMUlVDYWNoZSwgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL2VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IsIFNhdmVSZWFzb24sIFNpZGVCeVNpZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElNYXJrZXJTZXJ2aWNlLCBNYXJrZXJTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuXG5leHBvcnQgY29uc3QgQXV0b1NhdmVBZnRlclNob3J0RGVsYXlDb250ZXh0ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2F1dG9TYXZlQWZ0ZXJTaG9ydERlbGF5Q29udGV4dCcsIGZhbHNlLCB0cnVlKTtcblxuZXhwb3J0IGludGVyZmFjZSBJQXV0b1NhdmVDb25maWd1cmF0aW9uIHtcblx0YXV0b1NhdmU/OiAnYWZ0ZXJEZWxheScgfCAnb25Gb2N1c0NoYW5nZScgfCAnb25XaW5kb3dDaGFuZ2UnO1xuXHRhdXRvU2F2ZURlbGF5PzogbnVtYmVyO1xuXHRhdXRvU2F2ZVdvcmtzcGFjZUZpbGVzT25seT86IGJvb2xlYW47XG5cdGF1dG9TYXZlV2hlbk5vRXJyb3JzPzogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIElDYWNoZWRBdXRvU2F2ZUNvbmZpZ3VyYXRpb24gZXh0ZW5kcyBJQXV0b1NhdmVDb25maWd1cmF0aW9uIHtcblxuXHQvLyBTb21lIGV4dHJhIHN0YXRlIHRoYXQgd2UgY2FjaGUgdG8gcmVkdWNlIHRoZSBhbW91bnRcblx0Ly8gb2YgbG9va3VwIHdlIGhhdmUgdG8gZG8gc2luY2UgYXV0byBzYXZlIG1ldGhvZHNcblx0Ly8gYXJlIGJlaW5nIGNhbGxlZCB2ZXJ5IG9mdGVuLCBlLmcuIHdoZW4gY29udGVudCBjaGFuZ2VzXG5cblx0aXNPdXRPZldvcmtzcGFjZT86IGJvb2xlYW47XG5cdGlzU2hvcnRBdXRvU2F2ZURlbGF5PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gQXV0b1NhdmVNb2RlIHtcblx0T0ZGLFxuXHRBRlRFUl9TSE9SVF9ERUxBWSxcblx0QUZURVJfTE9OR19ERUxBWSxcblx0T05fRk9DVVNfQ0hBTkdFLFxuXHRPTl9XSU5ET1dfQ0hBTkdFXG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEF1dG9TYXZlRGlzYWJsZWRSZWFzb24ge1xuXHRTRVRUSU5HUyA9IDEsXG5cdE9VVF9PRl9XT1JLU1BBQ0UsXG5cdEVSUk9SUyxcblx0RElTQUJMRURcbn1cblxuZXhwb3J0IHR5cGUgSUF1dG9TYXZlTW9kZSA9IElFbmFibGVkQXV0b1NhdmVNb2RlIHwgSURpc2FibGVkQXV0b1NhdmVNb2RlO1xuXG5leHBvcnQgaW50ZXJmYWNlIElFbmFibGVkQXV0b1NhdmVNb2RlIHtcblx0cmVhZG9ubHkgbW9kZTogQXV0b1NhdmVNb2RlLkFGVEVSX1NIT1JUX0RFTEFZIHwgQXV0b1NhdmVNb2RlLkFGVEVSX0xPTkdfREVMQVkgfCBBdXRvU2F2ZU1vZGUuT05fRk9DVVNfQ0hBTkdFIHwgQXV0b1NhdmVNb2RlLk9OX1dJTkRPV19DSEFOR0U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURpc2FibGVkQXV0b1NhdmVNb2RlIHtcblx0cmVhZG9ubHkgbW9kZTogQXV0b1NhdmVNb2RlLk9GRjtcblx0cmVhZG9ubHkgcmVhc29uOiBBdXRvU2F2ZURpc2FibGVkUmVhc29uO1xufVxuXG5leHBvcnQgY29uc3QgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2U+KCdmaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2Uge1xuXG5cdHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHQvLyNyZWdpb24gQXV0byBTYXZlXG5cblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBdXRvU2F2ZUNvbmZpZ3VyYXRpb246IEV2ZW50PHZvaWQ+O1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXV0b1NhdmVEaXNhYmxlZDogRXZlbnQ8VVJJPjtcblxuXHRnZXRBdXRvU2F2ZUNvbmZpZ3VyYXRpb24ocmVzb3VyY2VPckVkaXRvcjogRWRpdG9ySW5wdXQgfCBVUkkgfCB1bmRlZmluZWQpOiBJQXV0b1NhdmVDb25maWd1cmF0aW9uO1xuXG5cdGhhc1Nob3J0QXV0b1NhdmVEZWxheShyZXNvdXJjZU9yRWRpdG9yOiBFZGl0b3JJbnB1dCB8IFVSSSB8IHVuZGVmaW5lZCk6IGJvb2xlYW47XG5cblx0Z2V0QXV0b1NhdmVNb2RlKHJlc291cmNlT3JFZGl0b3I6IEVkaXRvcklucHV0IHwgVVJJIHwgdW5kZWZpbmVkLCBzYXZlUmVhc29uPzogU2F2ZVJlYXNvbik6IElBdXRvU2F2ZU1vZGU7XG5cblx0dG9nZ2xlQXV0b1NhdmUoKTogUHJvbWlzZTx2b2lkPjtcblxuXHRlbmFibGVBdXRvU2F2ZUFmdGVyU2hvcnREZWxheShyZXNvdXJjZU9yRWRpdG9yOiBFZGl0b3JJbnB1dCB8IFVSSSk6IElEaXNwb3NhYmxlO1xuXHRkaXNhYmxlQXV0b1NhdmUocmVzb3VyY2VPckVkaXRvcjogRWRpdG9ySW5wdXQgfCBVUkkpOiBJRGlzcG9zYWJsZTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gQ29uZmlndXJlZCBSZWFkb25seVxuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVhZG9ubHk6IEV2ZW50PHZvaWQ+O1xuXG5cdGlzUmVhZG9ubHkocmVzb3VyY2U6IFVSSSwgc3RhdD86IElCYXNlRmlsZVN0YXQpOiBib29sZWFuIHwgSU1hcmtkb3duU3RyaW5nO1xuXG5cdHVwZGF0ZVJlYWRvbmx5KHJlc291cmNlOiBVUkksIHJlYWRvbmx5OiB0cnVlIHwgZmFsc2UgfCAndG9nZ2xlJyB8ICdyZXNldCcpOiBQcm9taXNlPHZvaWQ+O1xuXHR1cGRhdGVSZWFkb25seShyZXNvdXJjZTogVVJJW10sIHJlYWRvbmx5OiB0cnVlIHwgZmFsc2UgfCAncmVzZXQnKTogUHJvbWlzZTx2b2lkPjtcblxuXHQvLyNlbmRyZWdpb25cblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbGVzQXNzb2NpYXRpb246IEV2ZW50PHZvaWQ+O1xuXG5cdHJlYWRvbmx5IGlzSG90RXhpdEVuYWJsZWQ6IGJvb2xlYW47XG5cblx0cmVhZG9ubHkgaG90RXhpdENvbmZpZ3VyYXRpb246IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcmV2ZW50U2F2ZUNvbmZsaWN0cyhyZXNvdXJjZTogVVJJLCBsYW5ndWFnZT86IHN0cmluZyk6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBERUZBVUxUX0FVVE9fU0FWRV9NT0RFID0gaXNXZWIgPyBBdXRvU2F2ZUNvbmZpZ3VyYXRpb24uQUZURVJfREVMQVkgOiBBdXRvU2F2ZUNvbmZpZ3VyYXRpb24uT0ZGO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBERUZBVUxUX0FVVE9fU0FWRV9ERUxBWSA9IDEwMDA7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgUkVBRE9OTFlfTUVTU0FHRVMgPSB7XG5cdFx0cHJvdmlkZXJSZWFkb25seTogeyB2YWx1ZTogbG9jYWxpemUoJ3Byb3ZpZGVyUmVhZG9ubHknLCBcIkVkaXRvciBpcyByZWFkLW9ubHkgYmVjYXVzZSB0aGUgZmlsZSBzeXN0ZW0gb2YgdGhlIGZpbGUgaXMgcmVhZC1vbmx5LlwiKSwgaXNUcnVzdGVkOiB0cnVlIH0sXG5cdFx0c2Vzc2lvblJlYWRvbmx5OiB7IHZhbHVlOiBsb2NhbGl6ZSh7IGtleTogJ3Nlc3Npb25SZWFkb25seScsIGNvbW1lbnQ6IFsnUGxlYXNlIGRvIG5vdCB0cmFuc2xhdGUgdGhlIHdvcmQgXCJjb21tYW5kXCIsIGl0IGlzIHBhcnQgb2Ygb3VyIGludGVybmFsIHN5bnRheCB3aGljaCBtdXN0IG5vdCBjaGFuZ2UnLCAne0xvY2tlZD1cIl0oY29tbWFuZDp7MH0pXCJ9J10gfSwgXCJFZGl0b3IgaXMgcmVhZC1vbmx5IGJlY2F1c2UgdGhlIGZpbGUgd2FzIHNldCByZWFkLW9ubHkgaW4gdGhpcyBzZXNzaW9uLiBbQ2xpY2sgaGVyZV0oY29tbWFuZDp7MH0pIHRvIHNldCB3cml0ZWFibGUuXCIsICd3b3JrYmVuY2guYWN0aW9uLmZpbGVzLnNldEFjdGl2ZUVkaXRvcldyaXRlYWJsZUluU2Vzc2lvbicpLCBpc1RydXN0ZWQ6IHRydWUgfSxcblx0XHRjb25maWd1cmVkUmVhZG9ubHk6IHsgdmFsdWU6IGxvY2FsaXplKHsga2V5OiAnY29uZmlndXJlZFJlYWRvbmx5JywgY29tbWVudDogWydQbGVhc2UgZG8gbm90IHRyYW5zbGF0ZSB0aGUgd29yZCBcImNvbW1hbmRcIiwgaXQgaXMgcGFydCBvZiBvdXIgaW50ZXJuYWwgc3ludGF4IHdoaWNoIG11c3Qgbm90IGNoYW5nZScsICd7TG9ja2VkPVwiXShjb21tYW5kOnswfSlcIn0nXSB9LCBcIkVkaXRvciBpcyByZWFkLW9ubHkgYmVjYXVzZSB0aGUgZmlsZSB3YXMgc2V0IHJlYWQtb25seSB2aWEgc2V0dGluZ3MuIFtDbGljayBoZXJlXShjb21tYW5kOnswfSkgdG8gY29uZmlndXJlIG9yIFt0b2dnbGUgZm9yIHRoaXMgc2Vzc2lvbl0oY29tbWFuZDp7MX0pLlwiLCBgd29ya2JlbmNoLmFjdGlvbi5vcGVuU2V0dGluZ3M/JHtlbmNvZGVVUklDb21wb25lbnQoJ1tcImZpbGVzLnJlYWRvbmx5XCJdJyl9YCwgJ3dvcmtiZW5jaC5hY3Rpb24uZmlsZXMudG9nZ2xlQWN0aXZlRWRpdG9yUmVhZG9ubHlJblNlc3Npb24nKSwgaXNUcnVzdGVkOiB0cnVlIH0sXG5cdFx0ZmlsZUxvY2tlZDogeyB2YWx1ZTogbG9jYWxpemUoeyBrZXk6ICdmaWxlTG9ja2VkJywgY29tbWVudDogWydQbGVhc2UgZG8gbm90IHRyYW5zbGF0ZSB0aGUgd29yZCBcImNvbW1hbmRcIiwgaXQgaXMgcGFydCBvZiBvdXIgaW50ZXJuYWwgc3ludGF4IHdoaWNoIG11c3Qgbm90IGNoYW5nZScsICd7TG9ja2VkPVwiXShjb21tYW5kOnswfSlcIn0nXSB9LCBcIkVkaXRvciBpcyByZWFkLW9ubHkgYmVjYXVzZSBvZiBmaWxlIHBlcm1pc3Npb25zLiBbQ2xpY2sgaGVyZV0oY29tbWFuZDp7MH0pIHRvIHNldCB3cml0ZWFibGUgYW55d2F5LlwiLCAnd29ya2JlbmNoLmFjdGlvbi5maWxlcy5zZXRBY3RpdmVFZGl0b3JXcml0ZWFibGVJblNlc3Npb24nKSwgaXNUcnVzdGVkOiB0cnVlIH0sXG5cdFx0ZmlsZVJlYWRvbmx5OiB7IHZhbHVlOiBsb2NhbGl6ZSgnZmlsZVJlYWRvbmx5JywgXCJFZGl0b3IgaXMgcmVhZC1vbmx5IGJlY2F1c2UgdGhlIGZpbGUgaXMgcmVhZC1vbmx5LlwiKSwgaXNUcnVzdGVkOiB0cnVlIH1cblx0fTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUF1dG9TYXZlQ29uZmlndXJhdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUF1dG9TYXZlQ29uZmlndXJhdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlQXV0b1NhdmVDb25maWd1cmF0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlQXV0b1NhdmVEaXNhYmxlZCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFVSST4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlQXV0b1NhdmVEaXNhYmxlZCA9IHRoaXMuX29uRGlkQ2hhbmdlQXV0b1NhdmVEaXNhYmxlZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUZpbGVzQXNzb2NpYXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VGaWxlc0Fzc29jaWF0aW9uID0gdGhpcy5fb25EaWRDaGFuZ2VGaWxlc0Fzc29jaWF0aW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlUmVhZG9ubHkgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VSZWFkb25seSA9IHRoaXMuX29uRGlkQ2hhbmdlUmVhZG9ubHkuZXZlbnQ7XG5cblx0cHJpdmF0ZSBjdXJyZW50R2xvYmFsQXV0b1NhdmVDb25maWd1cmF0aW9uOiBJQXV0b1NhdmVDb25maWd1cmF0aW9uO1xuXHRwcml2YXRlIGN1cnJlbnRGaWxlc0Fzc29jaWF0aW9uQ29uZmlndXJhdGlvbjogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBjdXJyZW50SG90RXhpdENvbmZpZ3VyYXRpb246IHN0cmluZztcblxuXHRwcml2YXRlIHJlYWRvbmx5IGF1dG9TYXZlQ29uZmlndXJhdGlvbkNhY2hlID0gbmV3IExSVUNhY2hlPFVSSSwgSUNhY2hlZEF1dG9TYXZlQ29uZmlndXJhdGlvbj4oMTAwMCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBhdXRvU2F2ZUFmdGVyU2hvcnREZWxheU92ZXJyaWRlcyA9IG5ldyBSZXNvdXJjZU1hcDxudW1iZXIgLyogY291bnRlciAqLz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBhdXRvU2F2ZURpc2FibGVkT3ZlcnJpZGVzID0gbmV3IFJlc291cmNlTWFwPG51bWJlciAvKiBjb3VudGVyICovPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgYXV0b1NhdmVBZnRlclNob3J0RGVsYXlDb250ZXh0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlYWRvbmx5SW5jbHVkZU1hdGNoZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgR2xvYmFsSWRsZVZhbHVlKCgpID0+IHRoaXMuY3JlYXRlUmVhZG9ubHlNYXRjaGVyKEZJTEVTX1JFQURPTkxZX0lOQ0xVREVfQ09ORklHKSkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlYWRvbmx5RXhjbHVkZU1hdGNoZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgR2xvYmFsSWRsZVZhbHVlKCgpID0+IHRoaXMuY3JlYXRlUmVhZG9ubHlNYXRjaGVyKEZJTEVTX1JFQURPTkxZX0VYQ0xVREVfQ09ORklHKSkpO1xuXHRwcml2YXRlIGNvbmZpZ3VyZWRSZWFkb25seUZyb21QZXJtaXNzaW9uczogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25SZWFkb25seU92ZXJyaWRlcyA9IG5ldyBSZXNvdXJjZU1hcDxib29sZWFuPihyZXNvdXJjZSA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZ2V0Q29tcGFyaXNvbktleShyZXNvdXJjZSkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSUVudmlyb25tZW50U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASU1hcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2U6IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5hdXRvU2F2ZUFmdGVyU2hvcnREZWxheUNvbnRleHQgPSBBdXRvU2F2ZUFmdGVyU2hvcnREZWxheUNvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRmlsZXNDb25maWd1cmF0aW9uPigpO1xuXG5cdFx0dGhpcy5jdXJyZW50R2xvYmFsQXV0b1NhdmVDb25maWd1cmF0aW9uID0gdGhpcy5jb21wdXRlQXV0b1NhdmVDb25maWd1cmF0aW9uKHVuZGVmaW5lZCwgY29uZmlndXJhdGlvbi5maWxlcyk7XG5cdFx0dGhpcy5jdXJyZW50RmlsZXNBc3NvY2lhdGlvbkNvbmZpZ3VyYXRpb24gPSBjb25maWd1cmF0aW9uPy5maWxlcz8uYXNzb2NpYXRpb25zO1xuXHRcdHRoaXMuY3VycmVudEhvdEV4aXRDb25maWd1cmF0aW9uID0gY29uZmlndXJhdGlvbj8uZmlsZXM/LmhvdEV4aXQgfHwgSG90RXhpdENvbmZpZ3VyYXRpb24uT05fRVhJVDtcblxuXHRcdHRoaXMub25GaWxlc0NvbmZpZ3VyYXRpb25DaGFuZ2UoY29uZmlndXJhdGlvbiwgZmFsc2UpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVSZWFkb25seU1hdGNoZXIoY29uZmlnOiBzdHJpbmcpIHtcblx0XHRjb25zdCBtYXRjaGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJlc291cmNlR2xvYk1hdGNoZXIoXG5cdFx0XHRyZXNvdXJjZSA9PiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKGNvbmZpZywgeyByZXNvdXJjZSB9KSxcblx0XHRcdGV2ZW50ID0+IGV2ZW50LmFmZmVjdHNDb25maWd1cmF0aW9uKGNvbmZpZyksXG5cdFx0XHR0aGlzLmNvbnRleHRTZXJ2aWNlLFxuXHRcdFx0dGhpcy5jb25maWd1cmF0aW9uU2VydmljZVxuXHRcdCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIobWF0Y2hlci5vbkV4cHJlc3Npb25DaGFuZ2UoKCkgPT4gdGhpcy5fb25EaWRDaGFuZ2VSZWFkb25seS5maXJlKCkpKTtcblxuXHRcdHJldHVybiBtYXRjaGVyO1xuXHR9XG5cblx0aXNSZWFkb25seShyZXNvdXJjZTogVVJJLCBzdGF0PzogSUJhc2VGaWxlU3RhdCk6IGJvb2xlYW4gfCBJTWFya2Rvd25TdHJpbmcge1xuXG5cdFx0Ly8gaWYgdGhlIGVudGlyZSBmaWxlIHN5c3RlbSBwcm92aWRlciBpcyByZWFkb25seSwgd2UgcmVzcGVjdCB0aGF0XG5cdFx0Ly8gYW5kIGRvIG5vdCBhbGxvdyB0byBjaGFuZ2UgcmVhZG9ubHkuIHdlIHRha2UgdGhpcyBhcyBhIGhpbnQgdGhhdFxuXHRcdC8vIHRoZSBwcm92aWRlciBoYXMgbm8gY2FwYWJpbGl0aWVzIG9mIHdyaXRpbmcuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB0aGlzLmZpbGVTZXJ2aWNlLmdldFByb3ZpZGVyKHJlc291cmNlLnNjaGVtZSk7XG5cdFx0aWYgKHByb3ZpZGVyICYmIGhhc1JlYWRvbmx5Q2FwYWJpbGl0eShwcm92aWRlcikpIHtcblx0XHRcdHJldHVybiBwcm92aWRlci5yZWFkT25seU1lc3NhZ2UgPz8gRmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5SRUFET05MWV9NRVNTQUdFUy5wcm92aWRlclJlYWRvbmx5O1xuXHRcdH1cblxuXHRcdC8vIHNlc3Npb24gb3ZlcnJpZGUgYWx3YXlzIHdpbnMgb3ZlciB0aGUgb3RoZXJzXG5cdFx0Y29uc3Qgc2Vzc2lvblJlYWRvbmx5T3ZlcnJpZGUgPSB0aGlzLnNlc3Npb25SZWFkb25seU92ZXJyaWRlcy5nZXQocmVzb3VyY2UpO1xuXHRcdGlmICh0eXBlb2Ygc2Vzc2lvblJlYWRvbmx5T3ZlcnJpZGUgPT09ICdib29sZWFuJykge1xuXHRcdFx0cmV0dXJuIHNlc3Npb25SZWFkb25seU92ZXJyaWRlID09PSB0cnVlID8gRmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5SRUFET05MWV9NRVNTQUdFUy5zZXNzaW9uUmVhZG9ubHkgOiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHR0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaXNFcXVhbE9yUGFyZW50KHJlc291cmNlLCB0aGlzLmVudmlyb25tZW50U2VydmljZS51c2VyUm9hbWluZ0RhdGFIb21lKSB8fFxuXHRcdFx0dGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmlzRXF1YWwocmVzb3VyY2UsIHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuY29uZmlndXJhdGlvbiA/PyB1bmRlZmluZWQpXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7IC8vIGV4cGxpY2l0bHkgZXhjbHVkZSBzb21lIHBhdGhzIGZyb20gcmVhZG9ubHkgdGhhdCB3ZSBuZWVkIGZvciBjb25maWd1cmF0aW9uXG5cdFx0fVxuXG5cdFx0Ly8gY29uZmlndXJlZCBnbG9iIHBhdHRlcm5zIHdpbiBvdmVyIHN0YXQgaW5mb3JtYXRpb25cblx0XHRpZiAodGhpcy5yZWFkb25seUluY2x1ZGVNYXRjaGVyLnZhbHVlLm1hdGNoZXMocmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gIXRoaXMucmVhZG9ubHlFeGNsdWRlTWF0Y2hlci52YWx1ZS5tYXRjaGVzKHJlc291cmNlKSA/IEZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuUkVBRE9OTFlfTUVTU0FHRVMuY29uZmlndXJlZFJlYWRvbmx5IDogZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gY2hlY2sgaWYgZmlsZSBpcyBsb2NrZWQgYW5kIGNvbmZpZ3VyZWQgdG8gdHJlYXQgYXMgcmVhZG9ubHlcblx0XHRpZiAodGhpcy5jb25maWd1cmVkUmVhZG9ubHlGcm9tUGVybWlzc2lvbnMgJiYgc3RhdD8ubG9ja2VkKSB7XG5cdFx0XHRyZXR1cm4gRmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5SRUFET05MWV9NRVNTQUdFUy5maWxlTG9ja2VkO1xuXHRcdH1cblxuXHRcdC8vIGNoZWNrIGlmIGZpbGUgaXMgbWFya2VkIHJlYWRvbmx5IGZyb20gdGhlIGZpbGUgc3lzdGVtIHByb3ZpZGVyXG5cdFx0aWYgKHN0YXQ/LnJlYWRvbmx5KSB7XG5cdFx0XHRyZXR1cm4gRmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5SRUFET05MWV9NRVNTQUdFUy5maWxlUmVhZG9ubHk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlUmVhZG9ubHkocmVzb3VyY2U6IFVSSSB8IFVSSVtdLCByZWFkb25seTogdHJ1ZSB8IGZhbHNlIHwgJ3RvZ2dsZScgfCAncmVzZXQnKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkocmVzb3VyY2UpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHIgb2YgcmVzb3VyY2UpIHtcblx0XHRcdFx0dGhpcy5hcHBseVJlYWRvbmx5KHIsIHJlYWRvbmx5IGFzIHRydWUgfCBmYWxzZSB8ICdyZXNldCcpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJlc291cmNlLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSZWFkb25seS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHJlYWRvbmx5ID09PSAndG9nZ2xlJykge1xuXHRcdFx0bGV0IHN0YXQ6IElGaWxlU3RhdFdpdGhNZXRhZGF0YSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUocmVzb3VyY2UsIHsgcmVzb2x2ZU1ldGFkYXRhOiB0cnVlIH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Ly8gaWdub3JlXG5cdFx0XHR9XG5cblx0XHRcdHJlYWRvbmx5ID0gIXRoaXMuaXNSZWFkb25seShyZXNvdXJjZSwgc3RhdCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5hcHBseVJlYWRvbmx5KHJlc291cmNlLCByZWFkb25seSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VSZWFkb25seS5maXJlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFwcGx5UmVhZG9ubHkocmVzb3VyY2U6IFVSSSwgcmVhZG9ubHk6IHRydWUgfCBmYWxzZSB8ICdyZXNldCcpOiB2b2lkIHtcblx0XHRpZiAocmVhZG9ubHkgPT09ICdyZXNldCcpIHtcblx0XHRcdHRoaXMuc2Vzc2lvblJlYWRvbmx5T3ZlcnJpZGVzLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2Vzc2lvblJlYWRvbmx5T3ZlcnJpZGVzLnNldChyZXNvdXJjZSwgcmVhZG9ubHkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBGaWxlcyBjb25maWd1cmF0aW9uIGNoYW5nZXNcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdmaWxlcycpKSB7XG5cdFx0XHRcdHRoaXMub25GaWxlc0NvbmZpZ3VyYXRpb25DaGFuZ2UodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRmlsZXNDb25maWd1cmF0aW9uPigpLCB0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25GaWxlc0NvbmZpZ3VyYXRpb25DaGFuZ2UoY29uZmlndXJhdGlvbjogSUZpbGVzQ29uZmlndXJhdGlvbiwgZnJvbUV2ZW50OiBib29sZWFuKTogdm9pZCB7XG5cblx0XHQvLyBBdXRvIFNhdmVcblx0XHR0aGlzLmN1cnJlbnRHbG9iYWxBdXRvU2F2ZUNvbmZpZ3VyYXRpb24gPSB0aGlzLmNvbXB1dGVBdXRvU2F2ZUNvbmZpZ3VyYXRpb24odW5kZWZpbmVkLCBjb25maWd1cmF0aW9uLmZpbGVzKTtcblx0XHR0aGlzLmF1dG9TYXZlQ29uZmlndXJhdGlvbkNhY2hlLmNsZWFyKCk7XG5cdFx0dGhpcy5hdXRvU2F2ZUFmdGVyU2hvcnREZWxheUNvbnRleHQuc2V0KHRoaXMuZ2V0QXV0b1NhdmVNb2RlKHVuZGVmaW5lZCkubW9kZSA9PT0gQXV0b1NhdmVNb2RlLkFGVEVSX1NIT1JUX0RFTEFZKTtcblx0XHRpZiAoZnJvbUV2ZW50KSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUF1dG9TYXZlQ29uZmlndXJhdGlvbi5maXJlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gQ2hlY2sgZm9yIGNoYW5nZSBpbiBmaWxlcyBhc3NvY2lhdGlvbnNcblx0XHRjb25zdCBmaWxlc0Fzc29jaWF0aW9uID0gY29uZmlndXJhdGlvbj8uZmlsZXM/LmFzc29jaWF0aW9ucztcblx0XHRpZiAoIWVxdWFscyh0aGlzLmN1cnJlbnRGaWxlc0Fzc29jaWF0aW9uQ29uZmlndXJhdGlvbiwgZmlsZXNBc3NvY2lhdGlvbikpIHtcblx0XHRcdHRoaXMuY3VycmVudEZpbGVzQXNzb2NpYXRpb25Db25maWd1cmF0aW9uID0gZmlsZXNBc3NvY2lhdGlvbjtcblx0XHRcdGlmIChmcm9tRXZlbnQpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VGaWxlc0Fzc29jaWF0aW9uLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBIb3QgZXhpdFxuXHRcdGNvbnN0IGhvdEV4aXRNb2RlID0gY29uZmlndXJhdGlvbj8uZmlsZXM/LmhvdEV4aXQ7XG5cdFx0aWYgKGhvdEV4aXRNb2RlID09PSBIb3RFeGl0Q29uZmlndXJhdGlvbi5PRkYgfHwgaG90RXhpdE1vZGUgPT09IEhvdEV4aXRDb25maWd1cmF0aW9uLk9OX0VYSVRfQU5EX1dJTkRPV19DTE9TRSkge1xuXHRcdFx0dGhpcy5jdXJyZW50SG90RXhpdENvbmZpZ3VyYXRpb24gPSBob3RFeGl0TW9kZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jdXJyZW50SG90RXhpdENvbmZpZ3VyYXRpb24gPSBIb3RFeGl0Q29uZmlndXJhdGlvbi5PTl9FWElUO1xuXHRcdH1cblxuXHRcdC8vIFJlYWRvbmx5XG5cdFx0Y29uc3QgcmVhZG9ubHlGcm9tUGVybWlzc2lvbnMgPSBCb29sZWFuKGNvbmZpZ3VyYXRpb24/LmZpbGVzPy5yZWFkb25seUZyb21QZXJtaXNzaW9ucyk7XG5cdFx0aWYgKHJlYWRvbmx5RnJvbVBlcm1pc3Npb25zICE9PSBCb29sZWFuKHRoaXMuY29uZmlndXJlZFJlYWRvbmx5RnJvbVBlcm1pc3Npb25zKSkge1xuXHRcdFx0dGhpcy5jb25maWd1cmVkUmVhZG9ubHlGcm9tUGVybWlzc2lvbnMgPSByZWFkb25seUZyb21QZXJtaXNzaW9ucztcblx0XHRcdGlmIChmcm9tRXZlbnQpIHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VSZWFkb25seS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Z2V0QXV0b1NhdmVDb25maWd1cmF0aW9uKHJlc291cmNlT3JFZGl0b3I6IEVkaXRvcklucHV0IHwgVVJJIHwgdW5kZWZpbmVkKTogSUNhY2hlZEF1dG9TYXZlQ29uZmlndXJhdGlvbiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLnRvUmVzb3VyY2UocmVzb3VyY2VPckVkaXRvcik7XG5cdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRsZXQgcmVzb3VyY2VBdXRvU2F2ZUNvbmZpZ3VyYXRpb24gPSB0aGlzLmF1dG9TYXZlQ29uZmlndXJhdGlvbkNhY2hlLmdldChyZXNvdXJjZSk7XG5cdFx0XHRpZiAoIXJlc291cmNlQXV0b1NhdmVDb25maWd1cmF0aW9uKSB7XG5cdFx0XHRcdHJlc291cmNlQXV0b1NhdmVDb25maWd1cmF0aW9uID0gdGhpcy5jb21wdXRlQXV0b1NhdmVDb25maWd1cmF0aW9uKHJlc291cmNlLCB0aGlzLnRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElGaWxlc0NvbmZpZ3VyYXRpb25Ob2RlPihyZXNvdXJjZSwgJ2ZpbGVzJykpO1xuXHRcdFx0XHR0aGlzLmF1dG9TYXZlQ29uZmlndXJhdGlvbkNhY2hlLnNldChyZXNvdXJjZSwgcmVzb3VyY2VBdXRvU2F2ZUNvbmZpZ3VyYXRpb24pO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gcmVzb3VyY2VBdXRvU2F2ZUNvbmZpZ3VyYXRpb247XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuY3VycmVudEdsb2JhbEF1dG9TYXZlQ29uZmlndXJhdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZUF1dG9TYXZlQ29uZmlndXJhdGlvbihyZXNvdXJjZTogVVJJIHwgdW5kZWZpbmVkLCBmaWxlc0NvbmZpZ3VyYXRpb246IElGaWxlc0NvbmZpZ3VyYXRpb25Ob2RlIHwgdW5kZWZpbmVkKTogSUNhY2hlZEF1dG9TYXZlQ29uZmlndXJhdGlvbiB7XG5cdFx0bGV0IGF1dG9TYXZlOiAnYWZ0ZXJEZWxheScgfCAnb25Gb2N1c0NoYW5nZScgfCAnb25XaW5kb3dDaGFuZ2UnIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBhdXRvU2F2ZURlbGF5OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGF1dG9TYXZlV29ya3NwYWNlRmlsZXNPbmx5OiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBhdXRvU2F2ZVdoZW5Ob0Vycm9yczogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHRcdGxldCBpc091dE9mV29ya3NwYWNlOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBpc1Nob3J0QXV0b1NhdmVEZWxheTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHRcdHN3aXRjaCAoZmlsZXNDb25maWd1cmF0aW9uPy5hdXRvU2F2ZSA/PyBGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLkRFRkFVTFRfQVVUT19TQVZFX01PREUpIHtcblx0XHRcdGNhc2UgQXV0b1NhdmVDb25maWd1cmF0aW9uLkFGVEVSX0RFTEFZOiB7XG5cdFx0XHRcdGF1dG9TYXZlID0gJ2FmdGVyRGVsYXknO1xuXHRcdFx0XHRhdXRvU2F2ZURlbGF5ID0gdHlwZW9mIGZpbGVzQ29uZmlndXJhdGlvbj8uYXV0b1NhdmVEZWxheSA9PT0gJ251bWJlcicgJiYgZmlsZXNDb25maWd1cmF0aW9uLmF1dG9TYXZlRGVsYXkgPj0gMCA/IGZpbGVzQ29uZmlndXJhdGlvbi5hdXRvU2F2ZURlbGF5IDogRmlsZXNDb25maWd1cmF0aW9uU2VydmljZS5ERUZBVUxUX0FVVE9fU0FWRV9ERUxBWTtcblx0XHRcdFx0aXNTaG9ydEF1dG9TYXZlRGVsYXkgPSBhdXRvU2F2ZURlbGF5IDw9IEZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuREVGQVVMVF9BVVRPX1NBVkVfREVMQVk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXG5cdFx0XHRjYXNlIEF1dG9TYXZlQ29uZmlndXJhdGlvbi5PTl9GT0NVU19DSEFOR0U6XG5cdFx0XHRcdGF1dG9TYXZlID0gJ29uRm9jdXNDaGFuZ2UnO1xuXHRcdFx0XHRicmVhaztcblxuXHRcdFx0Y2FzZSBBdXRvU2F2ZUNvbmZpZ3VyYXRpb24uT05fV0lORE9XX0NIQU5HRTpcblx0XHRcdFx0YXV0b1NhdmUgPSAnb25XaW5kb3dDaGFuZ2UnO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRpZiAoZmlsZXNDb25maWd1cmF0aW9uPy5hdXRvU2F2ZVdvcmtzcGFjZUZpbGVzT25seSA9PT0gdHJ1ZSkge1xuXHRcdFx0YXV0b1NhdmVXb3Jrc3BhY2VGaWxlc09ubHkgPSB0cnVlO1xuXG5cdFx0XHRpZiAocmVzb3VyY2UgJiYgIXRoaXMuY29udGV4dFNlcnZpY2UuaXNJbnNpZGVXb3Jrc3BhY2UocmVzb3VyY2UpKSB7XG5cdFx0XHRcdGlzT3V0T2ZXb3Jrc3BhY2UgPSB0cnVlO1xuXHRcdFx0XHRpc1Nob3J0QXV0b1NhdmVEZWxheSA9IHVuZGVmaW5lZDsgLy8gb3V0IG9mIHdvcmtzcGFjZSBmaWxlIGFyZSBub3QgYXV0byBzYXZlZCB3aXRoIHRoaXMgY29uZmlndXJhdGlvblxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChmaWxlc0NvbmZpZ3VyYXRpb24/LmF1dG9TYXZlV2hlbk5vRXJyb3JzID09PSB0cnVlKSB7XG5cdFx0XHRhdXRvU2F2ZVdoZW5Ob0Vycm9ycyA9IHRydWU7XG5cdFx0XHRpc1Nob3J0QXV0b1NhdmVEZWxheSA9IHVuZGVmaW5lZDsgLy8gdGhpcyBjb25maWd1cmF0aW9uIGRpc2FibGVzIHNob3J0IGF1dG8gc2F2ZSBkZWxheVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRhdXRvU2F2ZSxcblx0XHRcdGF1dG9TYXZlRGVsYXksXG5cdFx0XHRhdXRvU2F2ZVdvcmtzcGFjZUZpbGVzT25seSxcblx0XHRcdGF1dG9TYXZlV2hlbk5vRXJyb3JzLFxuXHRcdFx0aXNPdXRPZldvcmtzcGFjZSxcblx0XHRcdGlzU2hvcnRBdXRvU2F2ZURlbGF5XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgdG9SZXNvdXJjZShyZXNvdXJjZU9yRWRpdG9yOiBFZGl0b3JJbnB1dCB8IFVSSSB8IHVuZGVmaW5lZCk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHJlc291cmNlT3JFZGl0b3IgaW5zdGFuY2VvZiBFZGl0b3JJbnB1dCkge1xuXHRcdFx0cmV0dXJuIEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkocmVzb3VyY2VPckVkaXRvciwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXNvdXJjZU9yRWRpdG9yO1xuXHR9XG5cblx0aGFzU2hvcnRBdXRvU2F2ZURlbGF5KHJlc291cmNlT3JFZGl0b3I6IEVkaXRvcklucHV0IHwgVVJJIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLnRvUmVzb3VyY2UocmVzb3VyY2VPckVkaXRvcik7XG5cblx0XHRpZiAocmVzb3VyY2UgJiYgdGhpcy5hdXRvU2F2ZUFmdGVyU2hvcnREZWxheU92ZXJyaWRlcy5oYXMocmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTsgLy8gb3ZlcnJpZGRlbiB0byBiZSBlbmFibGVkIGFmdGVyIHNob3J0IGRlbGF5XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZ2V0QXV0b1NhdmVDb25maWd1cmF0aW9uKHJlc291cmNlKS5pc1Nob3J0QXV0b1NhdmVEZWxheSkge1xuXHRcdFx0cmV0dXJuICFyZXNvdXJjZSB8fCAhdGhpcy5hdXRvU2F2ZURpc2FibGVkT3ZlcnJpZGVzLmhhcyhyZXNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Z2V0QXV0b1NhdmVNb2RlKHJlc291cmNlT3JFZGl0b3I6IEVkaXRvcklucHV0IHwgVVJJIHwgdW5kZWZpbmVkLCBzYXZlUmVhc29uPzogU2F2ZVJlYXNvbik6IElBdXRvU2F2ZU1vZGUge1xuXHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy50b1Jlc291cmNlKHJlc291cmNlT3JFZGl0b3IpO1xuXHRcdGlmIChyZXNvdXJjZSAmJiB0aGlzLmF1dG9TYXZlQWZ0ZXJTaG9ydERlbGF5T3ZlcnJpZGVzLmhhcyhyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB7IG1vZGU6IEF1dG9TYXZlTW9kZS5BRlRFUl9TSE9SVF9ERUxBWSB9OyAvLyBvdmVycmlkZGVuIHRvIGJlIGVuYWJsZWQgYWZ0ZXIgc2hvcnQgZGVsYXlcblx0XHR9XG5cblx0XHRpZiAocmVzb3VyY2UgJiYgdGhpcy5hdXRvU2F2ZURpc2FibGVkT3ZlcnJpZGVzLmhhcyhyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB7IG1vZGU6IEF1dG9TYXZlTW9kZS5PRkYsIHJlYXNvbjogQXV0b1NhdmVEaXNhYmxlZFJlYXNvbi5ESVNBQkxFRCB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGF1dG9TYXZlQ29uZmlndXJhdGlvbiA9IHRoaXMuZ2V0QXV0b1NhdmVDb25maWd1cmF0aW9uKHJlc291cmNlKTtcblx0XHRpZiAodHlwZW9mIGF1dG9TYXZlQ29uZmlndXJhdGlvbi5hdXRvU2F2ZSA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiB7IG1vZGU6IEF1dG9TYXZlTW9kZS5PRkYsIHJlYXNvbjogQXV0b1NhdmVEaXNhYmxlZFJlYXNvbi5TRVRUSU5HUyB9O1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2Ygc2F2ZVJlYXNvbiA9PT0gJ251bWJlcicpIHtcblx0XHRcdGlmIChcblx0XHRcdFx0KGF1dG9TYXZlQ29uZmlndXJhdGlvbi5hdXRvU2F2ZSA9PT0gJ2FmdGVyRGVsYXknICYmIHNhdmVSZWFzb24gIT09IFNhdmVSZWFzb24uQVVUTykgfHxcblx0XHRcdFx0KGF1dG9TYXZlQ29uZmlndXJhdGlvbi5hdXRvU2F2ZSA9PT0gJ29uRm9jdXNDaGFuZ2UnICYmIHNhdmVSZWFzb24gIT09IFNhdmVSZWFzb24uRk9DVVNfQ0hBTkdFICYmIHNhdmVSZWFzb24gIT09IFNhdmVSZWFzb24uV0lORE9XX0NIQU5HRSkgfHxcblx0XHRcdFx0KGF1dG9TYXZlQ29uZmlndXJhdGlvbi5hdXRvU2F2ZSA9PT0gJ29uV2luZG93Q2hhbmdlJyAmJiBzYXZlUmVhc29uICE9PSBTYXZlUmVhc29uLldJTkRPV19DSEFOR0UpXG5cdFx0XHQpIHtcblx0XHRcdFx0cmV0dXJuIHsgbW9kZTogQXV0b1NhdmVNb2RlLk9GRiwgcmVhc29uOiBBdXRvU2F2ZURpc2FibGVkUmVhc29uLlNFVFRJTkdTIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHJlc291cmNlKSB7XG5cdFx0XHRpZiAoYXV0b1NhdmVDb25maWd1cmF0aW9uLmF1dG9TYXZlV29ya3NwYWNlRmlsZXNPbmx5ICYmIGF1dG9TYXZlQ29uZmlndXJhdGlvbi5pc091dE9mV29ya3NwYWNlKSB7XG5cdFx0XHRcdHJldHVybiB7IG1vZGU6IEF1dG9TYXZlTW9kZS5PRkYsIHJlYXNvbjogQXV0b1NhdmVEaXNhYmxlZFJlYXNvbi5PVVRfT0ZfV09SS1NQQUNFIH07XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhdXRvU2F2ZUNvbmZpZ3VyYXRpb24uYXV0b1NhdmVXaGVuTm9FcnJvcnMgJiYgdGhpcy5tYXJrZXJTZXJ2aWNlLnJlYWQoeyByZXNvdXJjZSwgdGFrZTogMSwgc2V2ZXJpdGllczogTWFya2VyU2V2ZXJpdHkuRXJyb3IgfSkubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRyZXR1cm4geyBtb2RlOiBBdXRvU2F2ZU1vZGUuT0ZGLCByZWFzb246IEF1dG9TYXZlRGlzYWJsZWRSZWFzb24uRVJST1JTIH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0c3dpdGNoIChhdXRvU2F2ZUNvbmZpZ3VyYXRpb24uYXV0b1NhdmUpIHtcblx0XHRcdGNhc2UgJ2FmdGVyRGVsYXknOlxuXHRcdFx0XHRpZiAodHlwZW9mIGF1dG9TYXZlQ29uZmlndXJhdGlvbi5hdXRvU2F2ZURlbGF5ID09PSAnbnVtYmVyJyAmJiBhdXRvU2F2ZUNvbmZpZ3VyYXRpb24uYXV0b1NhdmVEZWxheSA8PSBGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLkRFRkFVTFRfQVVUT19TQVZFX0RFTEFZKSB7XG5cdFx0XHRcdFx0Ly8gRXhwbGljaXRseSBtYXJrIGF1dG8gc2F2ZSBjb25maWd1cmF0aW9ucyBhcyBsb25nIHJ1bm5pbmdcblx0XHRcdFx0XHQvLyBpZiB0aGV5IGFyZSBjb25maWd1cmVkIHRvIG5vdCBydW4gd2hlbiB0aGVyZSBhcmUgZXJyb3JzLlxuXHRcdFx0XHRcdC8vIFRoZSByYXRpb25hbGUgaGVyZSBpcyB0aGF0IGVycm9ycyBtYXkgY29tZSBpbiBhZnRlciBhdXRvXG5cdFx0XHRcdFx0Ly8gc2F2ZSBoYXMgYmVlbiBzY2hlZHVsZWQgYW5kIHRoZW4gZnVydGhlciBkZWxheSB0aGUgYXV0b1xuXHRcdFx0XHRcdC8vIHNhdmUgdW50aWwgcmVzb2x2ZWQuXG5cdFx0XHRcdFx0cmV0dXJuIHsgbW9kZTogYXV0b1NhdmVDb25maWd1cmF0aW9uLmF1dG9TYXZlV2hlbk5vRXJyb3JzID8gQXV0b1NhdmVNb2RlLkFGVEVSX0xPTkdfREVMQVkgOiBBdXRvU2F2ZU1vZGUuQUZURVJfU0hPUlRfREVMQVkgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4geyBtb2RlOiBBdXRvU2F2ZU1vZGUuQUZURVJfTE9OR19ERUxBWSB9O1xuXHRcdFx0Y2FzZSAnb25Gb2N1c0NoYW5nZSc6XG5cdFx0XHRcdHJldHVybiB7IG1vZGU6IEF1dG9TYXZlTW9kZS5PTl9GT0NVU19DSEFOR0UgfTtcblx0XHRcdGNhc2UgJ29uV2luZG93Q2hhbmdlJzpcblx0XHRcdFx0cmV0dXJuIHsgbW9kZTogQXV0b1NhdmVNb2RlLk9OX1dJTkRPV19DSEFOR0UgfTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyB0b2dnbGVBdXRvU2F2ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjdXJyZW50U2V0dGluZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ2ZpbGVzLmF1dG9TYXZlJyk7XG5cblx0XHRsZXQgbmV3QXV0b1NhdmVWYWx1ZTogc3RyaW5nO1xuXHRcdGlmIChbQXV0b1NhdmVDb25maWd1cmF0aW9uLkFGVEVSX0RFTEFZLCBBdXRvU2F2ZUNvbmZpZ3VyYXRpb24uT05fRk9DVVNfQ0hBTkdFLCBBdXRvU2F2ZUNvbmZpZ3VyYXRpb24uT05fV0lORE9XX0NIQU5HRV0uc29tZShzZXR0aW5nID0+IHNldHRpbmcgPT09IGN1cnJlbnRTZXR0aW5nKSkge1xuXHRcdFx0bmV3QXV0b1NhdmVWYWx1ZSA9IEF1dG9TYXZlQ29uZmlndXJhdGlvbi5PRkY7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG5ld0F1dG9TYXZlVmFsdWUgPSBBdXRvU2F2ZUNvbmZpZ3VyYXRpb24uQUZURVJfREVMQVk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoJ2ZpbGVzLmF1dG9TYXZlJywgbmV3QXV0b1NhdmVWYWx1ZSk7XG5cdH1cblxuXHRlbmFibGVBdXRvU2F2ZUFmdGVyU2hvcnREZWxheShyZXNvdXJjZU9yRWRpdG9yOiBFZGl0b3JJbnB1dCB8IFVSSSk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCByZXNvdXJjZSA9IHRoaXMudG9SZXNvdXJjZShyZXNvdXJjZU9yRWRpdG9yKTtcblx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvdW50ZXIgPSB0aGlzLmF1dG9TYXZlQWZ0ZXJTaG9ydERlbGF5T3ZlcnJpZGVzLmdldChyZXNvdXJjZSkgPz8gMDtcblx0XHR0aGlzLmF1dG9TYXZlQWZ0ZXJTaG9ydERlbGF5T3ZlcnJpZGVzLnNldChyZXNvdXJjZSwgY291bnRlciArIDEpO1xuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBjb3VudGVyID0gdGhpcy5hdXRvU2F2ZUFmdGVyU2hvcnREZWxheU92ZXJyaWRlcy5nZXQocmVzb3VyY2UpID8/IDA7XG5cdFx0XHRpZiAoY291bnRlciA8PSAxKSB7XG5cdFx0XHRcdHRoaXMuYXV0b1NhdmVBZnRlclNob3J0RGVsYXlPdmVycmlkZXMuZGVsZXRlKHJlc291cmNlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuYXV0b1NhdmVBZnRlclNob3J0RGVsYXlPdmVycmlkZXMuc2V0KHJlc291cmNlLCBjb3VudGVyIC0gMSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRkaXNhYmxlQXV0b1NhdmUocmVzb3VyY2VPckVkaXRvcjogRWRpdG9ySW5wdXQgfCBVUkkpOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSB0aGlzLnRvUmVzb3VyY2UocmVzb3VyY2VPckVkaXRvcik7XG5cdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9XG5cblx0XHRjb25zdCBjb3VudGVyID0gdGhpcy5hdXRvU2F2ZURpc2FibGVkT3ZlcnJpZGVzLmdldChyZXNvdXJjZSkgPz8gMDtcblx0XHR0aGlzLmF1dG9TYXZlRGlzYWJsZWRPdmVycmlkZXMuc2V0KHJlc291cmNlLCBjb3VudGVyICsgMSk7XG5cblx0XHRpZiAoY291bnRlciA9PT0gMCkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VBdXRvU2F2ZURpc2FibGVkLmZpcmUocmVzb3VyY2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0Y29uc3QgY291bnRlciA9IHRoaXMuYXV0b1NhdmVEaXNhYmxlZE92ZXJyaWRlcy5nZXQocmVzb3VyY2UpID8/IDA7XG5cdFx0XHRpZiAoY291bnRlciA8PSAxKSB7XG5cdFx0XHRcdHRoaXMuYXV0b1NhdmVEaXNhYmxlZE92ZXJyaWRlcy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUF1dG9TYXZlRGlzYWJsZWQuZmlyZShyZXNvdXJjZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmF1dG9TYXZlRGlzYWJsZWRPdmVycmlkZXMuc2V0KHJlc291cmNlLCBjb3VudGVyIC0gMSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRnZXQgaXNIb3RFeGl0RW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS50cmFuc2llbnQpIHtcblx0XHRcdC8vIFRyYW5zaWVudCB3b3Jrc3BhY2U6IGhvdCBleGl0IGlzIGRpc2FibGVkIGJlY2F1c2Vcblx0XHRcdC8vIHRyYW5zaWVudCB3b3Jrc3BhY2VzIGFyZSBub3QgcmVzdG9yZWQgdXBvbiByZXN0YXJ0XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuY3VycmVudEhvdEV4aXRDb25maWd1cmF0aW9uICE9PSBIb3RFeGl0Q29uZmlndXJhdGlvbi5PRkY7XG5cdH1cblxuXHRnZXQgaG90RXhpdENvbmZpZ3VyYXRpb24oKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50SG90RXhpdENvbmZpZ3VyYXRpb247XG5cdH1cblxuXHRwcmV2ZW50U2F2ZUNvbmZsaWN0cyhyZXNvdXJjZTogVVJJLCBsYW5ndWFnZT86IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKCdmaWxlcy5zYXZlQ29uZmxpY3RSZXNvbHV0aW9uJywgeyByZXNvdXJjZSwgb3ZlcnJpZGVJZGVudGlmaWVyOiBsYW5ndWFnZSB9KSAhPT0gJ292ZXJ3cml0ZUZpbGVPbkRpc2snO1xuXHR9XG59XG5cbnJlZ2lzdGVyU2luZ2xldG9uKElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5FYWdlcik7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFnQixlQUFlO0FBQy9CLFNBQVMsWUFBeUIsb0JBQW9CO0FBQ3RELFNBQVMsZUFBZSwwQkFBdUM7QUFDL0QsU0FBUyw2QkFBNkI7QUFDdEMsU0FBOEIsdUJBQXVCLHNCQUFzQiwrQkFBK0IsK0JBQXNELGNBQTZCLDZCQUFzRDtBQUNuUCxTQUFTLGNBQWM7QUFFdkIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsVUFBVSxtQkFBbUI7QUFFdEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx3QkFBd0IsWUFBWSx3QkFBd0I7QUFDckUsU0FBUyxnQkFBZ0Isc0JBQXNCO0FBQy9DLFNBQVMseUNBQXlDO0FBRzNDLE1BQU0saUNBQWlD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O0FBQUEsTUFDaEQsT0FBTztBQUNOLGFBQUssMEJBQTBCLElBQUksVUFBVUEsV0FBVSxDQUFDO0FBQUEsTUFDekQ7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxJQUFJLG1CQUE0QjtBQUMvQixRQUFJLEtBQUssZUFBZSxhQUFhLEVBQUUsV0FBVztBQUdqRCxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sS0FBSyxnQ0FBZ0MscUJBQXFCO0FBQUEsRUFDbEU7QUFBQSxFQUVBLElBQUksdUJBQStCO0FBQ2xDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLHFCQUFxQixVQUFlLFVBQTRCO0FBQy9ELFdBQU8sS0FBSyxxQkFBcUIsU0FBUyxnQ0FBZ0MsRUFBRSxVQUFVLG9CQUFvQixTQUFTLENBQUMsTUFBTTtBQUFBLEVBQzNIO0FBQ0Q7QUFqYWEsMEJBSVkseUJBQXlCLFFBQVEsc0JBQXNCLGNBQWMsc0JBQXNCO0FBSnZHLDBCQUtZLDBCQUEwQjtBQUx0QywwQkFPWSxvQkFBb0I7QUFBQSxFQUMzQyxrQkFBa0IsRUFBRSxPQUFPLFNBQVMsb0JBQW9CLHVFQUF1RSxHQUFHLFdBQVcsS0FBSztBQUFBLEVBQ2xKLGlCQUFpQixFQUFFLE9BQU8sU0FBUyxFQUFFLEtBQUssbUJBQW1CLFNBQVMsQ0FBQyx1R0FBdUcsMkJBQTJCLEVBQUUsR0FBRyx1SEFBdUgsMERBQTBELEdBQUcsV0FBVyxLQUFLO0FBQUEsRUFDbFosb0JBQW9CLEVBQUUsT0FBTyxTQUFTLEVBQUUsS0FBSyxzQkFBc0IsU0FBUyxDQUFDLHVHQUF1RywyQkFBMkIsRUFBRSxHQUFHLDBKQUEwSixpQ0FBaUMsbUJBQW1CLG9CQUFvQixDQUFDLElBQUksNERBQTRELEdBQUcsV0FBVyxLQUFLO0FBQUEsRUFDMWdCLFlBQVksRUFBRSxPQUFPLFNBQVMsRUFBRSxLQUFLLGNBQWMsU0FBUyxDQUFDLHVHQUF1RywyQkFBMkIsRUFBRSxHQUFHLHVHQUF1RywwREFBMEQsR0FBRyxXQUFXLEtBQUs7QUFBQSxFQUN4WCxjQUFjLEVBQUUsT0FBTyxTQUFTLGdCQUFnQixvREFBb0QsR0FBRyxXQUFXLEtBQUs7QUFDeEg7QUFiWSw0QkFBTjtBQUFBLEVBNkNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBcERVO0FBbWFiLGtCQUFrQiw0QkFBNEIsMkJBQTJCLGtCQUFrQixLQUFLOyIsCiAgIm5hbWVzIjogWyJBdXRvU2F2ZU1vZGUiLCAiQXV0b1NhdmVEaXNhYmxlZFJlYXNvbiIsICJjb3VudGVyIl0KfQo=
