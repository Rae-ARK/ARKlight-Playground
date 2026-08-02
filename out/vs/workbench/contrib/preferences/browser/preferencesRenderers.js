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
import { EventHelper, getDomNodePagePosition } from "../../../../base/browser/dom.js";
import { SubmenuAction } from "../../../../base/common/actions.js";
import { Delayer } from "../../../../base/common/async.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { isEqual } from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { MouseTargetType } from "../../../../editor/browser/editorBrowser.js";
import { EditorOption } from "../../../../editor/common/config/editorOptions.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import * as editorCommon from "../../../../editor/common/editorCommon.js";
import { TrackedRangeStickiness } from "../../../../editor/common/model.js";
import { ModelDecorationOptions } from "../../../../editor/common/model/textModel.js";
import { ILanguageFeaturesService } from "../../../../editor/common/services/languageFeatures.js";
import { CodeActionKind } from "../../../../editor/contrib/codeAction/common/types.js";
import * as nls from "../../../../nls.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions, ConfigurationScope, OVERRIDE_PROPERTY_REGEX, overrideIdentifiersFromKey } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IMarkerService, MarkerSeverity, MarkerTag } from "../../../../platform/markers/common/markers.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { IUserDataProfilesService } from "../../../../platform/userDataProfile/common/userDataProfile.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { RangeHighlightDecorations } from "../../../browser/codeeditor.js";
import { settingsEditIcon } from "./preferencesIcons.js";
import { EditPreferenceWidget } from "./preferencesWidgets.js";
import { APPLICATION_SCOPES, APPLY_ALL_PROFILES_SETTING, IWorkbenchConfigurationService } from "../../../services/configuration/common/configuration.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { DefaultSettingsEditorModel, WorkspaceConfigurationEditorModel } from "../../../services/preferences/common/preferencesModels.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { EXPERIMENTAL_INDICATOR_DESCRIPTION, PREVIEW_INDICATOR_DESCRIPTION } from "../common/preferences.js";
import { mcpConfigurationSection } from "../../mcp/common/mcpConfiguration.js";
import { McpCommandIds } from "../../mcp/common/mcpCommandIds.js";
let UserSettingsRenderer = class extends Disposable {
  constructor(editor, preferencesModel, preferencesService, configurationService, instantiationService) {
    super();
    this.editor = editor;
    this.preferencesModel = preferencesModel;
    this.preferencesService = preferencesService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.modelChangeDelayer = this._register(new Delayer(200));
    this.settingHighlighter = this._register(instantiationService.createInstance(SettingHighlighter, editor));
    this.editSettingActionRenderer = this._register(this.instantiationService.createInstance(EditSettingRenderer, this.editor, this.preferencesModel, this.settingHighlighter));
    this._register(this.editSettingActionRenderer.onUpdateSetting(({ key, value, source }) => this.updatePreference(key, value, source)));
    this._register(this.editor.getModel().onDidChangeContent(() => this.modelChangeDelayer.trigger(() => this.onModelChanged())));
    this.unsupportedSettingsRenderer = this._register(instantiationService.createInstance(UnsupportedSettingsRenderer, editor, preferencesModel));
    this.mcpSettingsRenderer = this._register(instantiationService.createInstance(McpSettingsRenderer, editor, preferencesModel));
  }
  render() {
    this.editSettingActionRenderer.render(this.preferencesModel.settingsGroups, this.associatedPreferencesModel);
    this.unsupportedSettingsRenderer.render();
    this.mcpSettingsRenderer.render();
  }
  updatePreference(key, value, source) {
    const overrideIdentifiers = source.overrideOf ? overrideIdentifiersFromKey(source.overrideOf.key) : null;
    const resource = this.preferencesModel.uri;
    this.configurationService.updateValue(key, value, { overrideIdentifiers, resource }, this.preferencesModel.configurationTarget).then(() => this.onSettingUpdated(source));
  }
  onModelChanged() {
    if (!this.editor.hasModel()) {
      return;
    }
    this.render();
  }
  onSettingUpdated(setting) {
    this.editor.focus();
    setting = this.getSetting(setting);
    if (setting) {
      this.editor.setSelection(setting.valueRange);
      this.settingHighlighter.highlight(setting, true);
    }
  }
  getSetting(setting) {
    const { key, overrideOf } = setting;
    if (overrideOf) {
      const setting2 = this.getSetting(overrideOf);
      for (const override of setting2.overrides) {
        if (override.key === key) {
          return override;
        }
      }
      return void 0;
    }
    return this.preferencesModel.getPreference(key);
  }
  focusPreference(setting) {
    const s = this.getSetting(setting);
    if (s) {
      this.settingHighlighter.highlight(s, true);
      this.editor.setPosition({ lineNumber: s.keyRange.startLineNumber, column: s.keyRange.startColumn });
    } else {
      this.settingHighlighter.clear(true);
    }
  }
  clearFocus(setting) {
    this.settingHighlighter.clear(true);
  }
  editPreference(setting) {
    const editableSetting = this.getSetting(setting);
    return !!(editableSetting && this.editSettingActionRenderer.activateOnSetting(editableSetting));
  }
};
UserSettingsRenderer = __decorateClass([
  __decorateParam(2, IPreferencesService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService)
], UserSettingsRenderer);
let WorkspaceSettingsRenderer = class extends UserSettingsRenderer {
  constructor(editor, preferencesModel, preferencesService, configurationService, instantiationService) {
    super(editor, preferencesModel, preferencesService, configurationService, instantiationService);
    this.workspaceConfigurationRenderer = this._register(instantiationService.createInstance(WorkspaceConfigurationRenderer, editor, preferencesModel));
  }
  render() {
    super.render();
    this.workspaceConfigurationRenderer.render();
  }
};
WorkspaceSettingsRenderer = __decorateClass([
  __decorateParam(2, IPreferencesService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService)
], WorkspaceSettingsRenderer);
let EditSettingRenderer = class extends Disposable {
  constructor(editor, primarySettingsModel, settingHighlighter, configurationService, instantiationService, contextMenuService) {
    super();
    this.editor = editor;
    this.primarySettingsModel = primarySettingsModel;
    this.settingHighlighter = settingHighlighter;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.contextMenuService = contextMenuService;
    this.settingsGroups = [];
    this._onUpdateSetting = this._register(new Emitter());
    this.onUpdateSetting = this._onUpdateSetting.event;
    this.editPreferenceWidgetForCursorPosition = this._register(this.instantiationService.createInstance(EditPreferenceWidget, editor));
    this.editPreferenceWidgetForMouseMove = this._register(this.instantiationService.createInstance(EditPreferenceWidget, editor));
    this.toggleEditPreferencesForMouseMoveDelayer = this._register(new Delayer(75));
    this._register(this.editPreferenceWidgetForCursorPosition.onClick((e) => this.onEditSettingClicked(this.editPreferenceWidgetForCursorPosition, e)));
    this._register(this.editPreferenceWidgetForMouseMove.onClick((e) => this.onEditSettingClicked(this.editPreferenceWidgetForMouseMove, e)));
    this._register(this.editor.onDidChangeCursorPosition((positionChangeEvent) => this.onPositionChanged(positionChangeEvent)));
    this._register(this.editor.onMouseMove((mouseMoveEvent) => this.onMouseMoved(mouseMoveEvent)));
    this._register(this.editor.onDidChangeConfiguration(() => this.onConfigurationChanged()));
  }
  render(settingsGroups, associatedPreferencesModel) {
    this.editPreferenceWidgetForCursorPosition.hide();
    this.editPreferenceWidgetForMouseMove.hide();
    this.settingsGroups = settingsGroups;
    this.associatedPreferencesModel = associatedPreferencesModel;
    const settings = this.getSettings(this.editor.getPosition().lineNumber);
    if (settings.length) {
      this.showEditPreferencesWidget(this.editPreferenceWidgetForCursorPosition, settings);
    }
  }
  isDefaultSettings() {
    return this.primarySettingsModel instanceof DefaultSettingsEditorModel;
  }
  onConfigurationChanged() {
    if (!this.editor.getOption(EditorOption.glyphMargin)) {
      this.editPreferenceWidgetForCursorPosition.hide();
      this.editPreferenceWidgetForMouseMove.hide();
    }
  }
  onPositionChanged(positionChangeEvent) {
    this.editPreferenceWidgetForMouseMove.hide();
    const settings = this.getSettings(positionChangeEvent.position.lineNumber);
    if (settings.length) {
      this.showEditPreferencesWidget(this.editPreferenceWidgetForCursorPosition, settings);
    } else {
      this.editPreferenceWidgetForCursorPosition.hide();
    }
  }
  onMouseMoved(mouseMoveEvent) {
    const editPreferenceWidget = this.getEditPreferenceWidgetUnderMouse(mouseMoveEvent);
    if (editPreferenceWidget) {
      this.onMouseOver(editPreferenceWidget);
      return;
    }
    this.settingHighlighter.clear();
    this.toggleEditPreferencesForMouseMoveDelayer.trigger(() => this.toggleEditPreferenceWidgetForMouseMove(mouseMoveEvent));
  }
  getEditPreferenceWidgetUnderMouse(mouseMoveEvent) {
    if (mouseMoveEvent.target.type === MouseTargetType.GUTTER_GLYPH_MARGIN) {
      const line = mouseMoveEvent.target.position.lineNumber;
      if (this.editPreferenceWidgetForMouseMove.getLine() === line && this.editPreferenceWidgetForMouseMove.isVisible()) {
        return this.editPreferenceWidgetForMouseMove;
      }
      if (this.editPreferenceWidgetForCursorPosition.getLine() === line && this.editPreferenceWidgetForCursorPosition.isVisible()) {
        return this.editPreferenceWidgetForCursorPosition;
      }
    }
    return void 0;
  }
  toggleEditPreferenceWidgetForMouseMove(mouseMoveEvent) {
    const settings = mouseMoveEvent.target.position ? this.getSettings(mouseMoveEvent.target.position.lineNumber) : null;
    if (settings && settings.length) {
      this.showEditPreferencesWidget(this.editPreferenceWidgetForMouseMove, settings);
    } else {
      this.editPreferenceWidgetForMouseMove.hide();
    }
  }
  showEditPreferencesWidget(editPreferencesWidget, settings) {
    const line = settings[0].valueRange.startLineNumber;
    if (this.editor.getOption(EditorOption.glyphMargin) && this.marginFreeFromOtherDecorations(line)) {
      editPreferencesWidget.show(line, nls.localize("editTtile", "Edit"), settings);
      const editPreferenceWidgetToHide = editPreferencesWidget === this.editPreferenceWidgetForCursorPosition ? this.editPreferenceWidgetForMouseMove : this.editPreferenceWidgetForCursorPosition;
      editPreferenceWidgetToHide.hide();
    }
  }
  marginFreeFromOtherDecorations(line) {
    const decorations = this.editor.getLineDecorations(line);
    if (decorations) {
      for (const { options } of decorations) {
        if (options.glyphMarginClassName && options.glyphMarginClassName.indexOf(ThemeIcon.asClassName(settingsEditIcon)) === -1) {
          return false;
        }
      }
    }
    return true;
  }
  getSettings(lineNumber) {
    const configurationMap = this.getConfigurationsMap();
    return this.getSettingsAtLineNumber(lineNumber).filter((setting) => {
      const configurationNode = configurationMap[setting.key];
      if (configurationNode) {
        if (configurationNode.policy && this.configurationService.inspect(setting.key).policyValue !== void 0) {
          return false;
        }
        if (this.isDefaultSettings()) {
          if (setting.key === "launch") {
            return false;
          }
          return true;
        }
        if (configurationNode.type === "boolean" || configurationNode.enum) {
          if (this.primarySettingsModel.configurationTarget !== ConfigurationTarget.WORKSPACE_FOLDER) {
            return true;
          }
          if (configurationNode.scope === ConfigurationScope.RESOURCE || configurationNode.scope === ConfigurationScope.LANGUAGE_OVERRIDABLE) {
            return true;
          }
        }
      }
      return false;
    });
  }
  getSettingsAtLineNumber(lineNumber) {
    let index = 0;
    const settings = [];
    for (const group of this.settingsGroups) {
      if (group.range.startLineNumber > lineNumber) {
        break;
      }
      if (lineNumber >= group.range.startLineNumber && lineNumber <= group.range.endLineNumber) {
        for (const section of group.sections) {
          for (const setting of section.settings) {
            if (setting.range.startLineNumber > lineNumber) {
              break;
            }
            if (lineNumber >= setting.range.startLineNumber && lineNumber <= setting.range.endLineNumber) {
              if (!this.isDefaultSettings() && setting.overrides.length) {
                for (const overrideSetting of setting.overrides) {
                  if (lineNumber >= overrideSetting.range.startLineNumber && lineNumber <= overrideSetting.range.endLineNumber) {
                    settings.push({ ...overrideSetting, index, groupId: group.id });
                  }
                }
              } else {
                settings.push({ ...setting, index, groupId: group.id });
              }
            }
            index++;
          }
        }
      }
    }
    return settings;
  }
  onMouseOver(editPreferenceWidget) {
    this.settingHighlighter.highlight(editPreferenceWidget.preferences[0]);
  }
  onEditSettingClicked(editPreferenceWidget, e) {
    EventHelper.stop(e.event, true);
    const actions = this.getSettings(editPreferenceWidget.getLine()).length === 1 ? this.getActions(editPreferenceWidget.preferences[0], this.getConfigurationsMap()[editPreferenceWidget.preferences[0].key]) : editPreferenceWidget.preferences.map((setting) => new SubmenuAction(`preferences.submenu.${setting.key}`, setting.key, this.getActions(setting, this.getConfigurationsMap()[setting.key])));
    this.contextMenuService.showContextMenu({
      getAnchor: () => e.event,
      getActions: () => actions
    });
  }
  activateOnSetting(setting) {
    const startLine = setting.keyRange.startLineNumber;
    const settings = this.getSettings(startLine);
    if (!settings.length) {
      return false;
    }
    this.editPreferenceWidgetForMouseMove.show(startLine, "", settings);
    const actions = this.getActions(this.editPreferenceWidgetForMouseMove.preferences[0], this.getConfigurationsMap()[this.editPreferenceWidgetForMouseMove.preferences[0].key]);
    this.contextMenuService.showContextMenu({
      getAnchor: () => this.toAbsoluteCoords(new Position(startLine, 1)),
      getActions: () => actions
    });
    return true;
  }
  toAbsoluteCoords(position) {
    const positionCoords = this.editor.getScrolledVisiblePosition(position);
    const editorCoords = getDomNodePagePosition(this.editor.getDomNode());
    const x = editorCoords.left + positionCoords.left;
    const y = editorCoords.top + positionCoords.top + positionCoords.height;
    return { x, y: y + 10 };
  }
  getConfigurationsMap() {
    return Registry.as(ConfigurationExtensions.Configuration).getConfigurationProperties();
  }
  getActions(setting, jsonSchema) {
    if (jsonSchema.type === "boolean") {
      return [{
        id: "truthyValue",
        label: "true",
        tooltip: "true",
        enabled: true,
        run: () => this.updateSetting(setting.key, true, setting),
        class: void 0
      }, {
        id: "falsyValue",
        label: "false",
        tooltip: "false",
        enabled: true,
        run: () => this.updateSetting(setting.key, false, setting),
        class: void 0
      }];
    }
    if (jsonSchema.enum) {
      return jsonSchema.enum.map((value) => {
        return {
          id: value,
          label: JSON.stringify(value),
          tooltip: JSON.stringify(value),
          enabled: true,
          run: () => this.updateSetting(setting.key, value, setting),
          class: void 0
        };
      });
    }
    return this.getDefaultActions(setting);
  }
  getDefaultActions(setting) {
    if (this.isDefaultSettings()) {
      const settingInOtherModel = this.associatedPreferencesModel.getPreference(setting.key);
      return [{
        id: "setDefaultValue",
        label: settingInOtherModel ? nls.localize("replaceDefaultValue", "Replace in Settings") : nls.localize("copyDefaultValue", "Copy to Settings"),
        tooltip: settingInOtherModel ? nls.localize("replaceDefaultValue", "Replace in Settings") : nls.localize("copyDefaultValue", "Copy to Settings"),
        enabled: true,
        run: () => this.updateSetting(setting.key, setting.value, setting),
        class: void 0
      }];
    }
    return [];
  }
  updateSetting(key, value, source) {
    this._onUpdateSetting.fire({ key, value, source });
  }
};
EditSettingRenderer = __decorateClass([
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextMenuService)
], EditSettingRenderer);
let SettingHighlighter = class extends Disposable {
  constructor(editor, instantiationService) {
    super();
    this.editor = editor;
    this.fixedHighlighter = this._register(instantiationService.createInstance(RangeHighlightDecorations));
    this.volatileHighlighter = this._register(instantiationService.createInstance(RangeHighlightDecorations));
  }
  highlight(setting, fix = false) {
    this.volatileHighlighter.removeHighlightRange();
    this.fixedHighlighter.removeHighlightRange();
    const highlighter = fix ? this.fixedHighlighter : this.volatileHighlighter;
    highlighter.highlightRange({
      range: setting.valueRange,
      resource: this.editor.getModel().uri
    }, this.editor);
    this.editor.revealLineInCenterIfOutsideViewport(setting.valueRange.startLineNumber, editorCommon.ScrollType.Smooth);
  }
  clear(fix = false) {
    this.volatileHighlighter.removeHighlightRange();
    if (fix) {
      this.fixedHighlighter.removeHighlightRange();
    }
  }
};
SettingHighlighter = __decorateClass([
  __decorateParam(1, IInstantiationService)
], SettingHighlighter);
let UnsupportedSettingsRenderer = class extends Disposable {
  constructor(editor, settingsEditorModel, markerService, environmentService, configurationService, workspaceTrustManagementService, uriIdentityService, languageFeaturesService, userDataProfileService, userDataProfilesService) {
    super();
    this.editor = editor;
    this.settingsEditorModel = settingsEditorModel;
    this.markerService = markerService;
    this.environmentService = environmentService;
    this.configurationService = configurationService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.uriIdentityService = uriIdentityService;
    this.userDataProfileService = userDataProfileService;
    this.userDataProfilesService = userDataProfilesService;
    this.renderingDelayer = this._register(new Delayer(200));
    this.codeActions = new ResourceMap((uri) => this.uriIdentityService.extUri.getComparisonKey(uri));
    this._register(this.editor.getModel().onDidChangeContent(() => this.delayedRender()));
    this._register(Event.filter(this.configurationService.onDidChangeConfiguration, (e) => e.source === ConfigurationTarget.DEFAULT)(() => this.delayedRender()));
    this._register(languageFeaturesService.codeActionProvider.register({ pattern: settingsEditorModel.uri.path }, this));
    this._register(userDataProfileService.onDidChangeCurrentProfile(() => this.delayedRender()));
  }
  delayedRender() {
    this.renderingDelayer.trigger(() => this.render());
  }
  render() {
    this.codeActions.clear();
    const markerData = this.generateMarkerData();
    if (markerData.length) {
      this.markerService.changeOne("UnsupportedSettingsRenderer", this.settingsEditorModel.uri, markerData);
    } else {
      this.markerService.remove("UnsupportedSettingsRenderer", [this.settingsEditorModel.uri]);
    }
  }
  async provideCodeActions(model, range, context, token) {
    const actions = [];
    const codeActionsByRange = this.codeActions.get(model.uri);
    if (codeActionsByRange) {
      for (const [codeActionsRange, codeActions] of codeActionsByRange) {
        if (codeActionsRange.containsRange(range)) {
          actions.push(...codeActions);
        }
      }
    }
    return {
      actions,
      dispose: () => {
      }
    };
  }
  generateMarkerData() {
    const markerData = [];
    const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration).getConfigurationProperties();
    for (const settingsGroup of this.settingsEditorModel.settingsGroups) {
      for (const section of settingsGroup.sections) {
        for (const setting of section.settings) {
          if (OVERRIDE_PROPERTY_REGEX.test(setting.key)) {
            if (setting.overrides) {
              this.handleOverrides(setting.overrides, configurationRegistry, markerData);
            }
            continue;
          }
          const configuration = configurationRegistry[setting.key];
          if (configuration) {
            this.handleUnstableSettingConfiguration(setting, configuration, markerData);
            if (this.handlePolicyConfiguration(setting, configuration, markerData)) {
              continue;
            }
            switch (this.settingsEditorModel.configurationTarget) {
              case ConfigurationTarget.USER_LOCAL:
                this.handleLocalUserConfiguration(setting, configuration, markerData);
                break;
              case ConfigurationTarget.USER_REMOTE:
                this.handleRemoteUserConfiguration(setting, configuration, markerData);
                break;
              case ConfigurationTarget.WORKSPACE:
                this.handleWorkspaceConfiguration(setting, configuration, markerData);
                break;
              case ConfigurationTarget.WORKSPACE_FOLDER:
                this.handleWorkspaceFolderConfiguration(setting, configuration, markerData);
                break;
            }
          } else {
            markerData.push(this.generateUnknownConfigurationMarker(setting));
          }
        }
      }
    }
    return markerData;
  }
  handlePolicyConfiguration(setting, configuration, markerData) {
    if (!configuration.policy) {
      return false;
    }
    if (this.configurationService.inspect(setting.key).policyValue === void 0) {
      return false;
    }
    if (this.settingsEditorModel.configurationTarget === ConfigurationTarget.DEFAULT) {
      return false;
    }
    markerData.push({
      severity: MarkerSeverity.Hint,
      tags: [MarkerTag.Unnecessary],
      ...setting.range,
      message: nls.localize("unsupportedPolicySetting", "This setting cannot be applied because it is configured in the system policy.")
    });
    return true;
  }
  handleOverrides(overrides, configurationRegistry, markerData) {
    for (const setting of overrides || []) {
      const configuration = configurationRegistry[setting.key];
      if (configuration) {
        if (configuration.scope !== ConfigurationScope.LANGUAGE_OVERRIDABLE) {
          markerData.push({
            severity: MarkerSeverity.Hint,
            tags: [MarkerTag.Unnecessary],
            ...setting.range,
            message: nls.localize("unsupportLanguageOverrideSetting", "This setting cannot be applied because it is not registered as language override setting.")
          });
        }
      } else {
        markerData.push(this.generateUnknownConfigurationMarker(setting));
      }
    }
  }
  handleLocalUserConfiguration(setting, configuration, markerData) {
    if (!this.userDataProfileService.currentProfile.isDefault && !this.userDataProfileService.currentProfile.useDefaultFlags?.settings) {
      if (isEqual(this.userDataProfilesService.defaultProfile.settingsResource, this.settingsEditorModel.uri) && !this.configurationService.isSettingAppliedForAllProfiles(setting.key)) {
        markerData.push({
          severity: MarkerSeverity.Hint,
          tags: [MarkerTag.Unnecessary],
          ...setting.range,
          message: nls.localize("defaultProfileSettingWhileNonDefaultActive", "This setting cannot be applied while a non-default profile is active. It will be applied when the default profile is active.")
        });
      } else if (isEqual(this.userDataProfileService.currentProfile.settingsResource, this.settingsEditorModel.uri)) {
        if (configuration.scope && APPLICATION_SCOPES.includes(configuration.scope)) {
          markerData.push(this.generateUnsupportedApplicationSettingMarker(setting));
        } else if (this.configurationService.isSettingAppliedForAllProfiles(setting.key)) {
          markerData.push({
            severity: MarkerSeverity.Hint,
            tags: [MarkerTag.Unnecessary],
            ...setting.range,
            message: nls.localize("allProfileSettingWhileInNonDefaultProfileSetting", "This setting cannot be applied because it is configured to be applied in all profiles using setting {0}. Value from the default profile will be used instead.", APPLY_ALL_PROFILES_SETTING)
          });
        }
      }
    }
    if (this.environmentService.remoteAuthority && (configuration.scope === ConfigurationScope.MACHINE || configuration.scope === ConfigurationScope.APPLICATION_MACHINE || configuration.scope === ConfigurationScope.MACHINE_OVERRIDABLE)) {
      markerData.push({
        severity: MarkerSeverity.Hint,
        tags: [MarkerTag.Unnecessary],
        ...setting.range,
        message: nls.localize("unsupportedRemoteMachineSetting", "This setting cannot be applied in this window. It will be applied when you open a local window.")
      });
    }
  }
  handleRemoteUserConfiguration(setting, configuration, markerData) {
    if (configuration.scope === ConfigurationScope.APPLICATION) {
      markerData.push(this.generateUnsupportedApplicationSettingMarker(setting));
    }
  }
  handleWorkspaceConfiguration(setting, configuration, markerData) {
    if (configuration.scope && APPLICATION_SCOPES.includes(configuration.scope)) {
      markerData.push(this.generateUnsupportedApplicationSettingMarker(setting));
    }
    if (configuration.scope === ConfigurationScope.MACHINE) {
      markerData.push(this.generateUnsupportedMachineSettingMarker(setting));
    }
    if (!this.workspaceTrustManagementService.isWorkspaceTrusted() && configuration.restricted) {
      const marker = this.generateUntrustedSettingMarker(setting);
      markerData.push(marker);
      const codeActions = this.generateUntrustedSettingCodeActions([marker]);
      this.addCodeActions(marker, codeActions);
    }
  }
  handleWorkspaceFolderConfiguration(setting, configuration, markerData) {
    if (configuration.scope && APPLICATION_SCOPES.includes(configuration.scope)) {
      markerData.push(this.generateUnsupportedApplicationSettingMarker(setting));
    }
    if (configuration.scope === ConfigurationScope.MACHINE) {
      markerData.push(this.generateUnsupportedMachineSettingMarker(setting));
    }
    if (configuration.scope === ConfigurationScope.WINDOW) {
      markerData.push({
        severity: MarkerSeverity.Hint,
        tags: [MarkerTag.Unnecessary],
        ...setting.range,
        message: nls.localize("unsupportedWindowSetting", "This setting cannot be applied in this workspace. It will be applied when you open the containing workspace folder directly.")
      });
    }
    if (!this.workspaceTrustManagementService.isWorkspaceTrusted() && configuration.restricted) {
      const marker = this.generateUntrustedSettingMarker(setting);
      markerData.push(marker);
      const codeActions = this.generateUntrustedSettingCodeActions([marker]);
      this.addCodeActions(marker, codeActions);
    }
  }
  handleUnstableSettingConfiguration(setting, configuration, markerData) {
    if (configuration.tags?.includes("preview")) {
      markerData.push(this.generatePreviewSettingMarker(setting));
    } else if (configuration.tags?.includes("experimental")) {
      markerData.push(this.generateExperimentalSettingMarker(setting));
    }
  }
  generateUnsupportedApplicationSettingMarker(setting) {
    return {
      severity: MarkerSeverity.Hint,
      tags: [MarkerTag.Unnecessary],
      ...setting.range,
      message: nls.localize("unsupportedApplicationSetting", "This setting has an application scope and can only be set in the settings file from the Default profile.")
    };
  }
  generateUnsupportedMachineSettingMarker(setting) {
    return {
      severity: MarkerSeverity.Hint,
      tags: [MarkerTag.Unnecessary],
      ...setting.range,
      message: nls.localize("unsupportedMachineSetting", "This setting can only be applied in user settings in local window or in remote settings in remote window.")
    };
  }
  generateUntrustedSettingMarker(setting) {
    return {
      severity: MarkerSeverity.Warning,
      ...setting.range,
      message: nls.localize("untrustedSetting", "This setting can only be applied in a trusted workspace.")
    };
  }
  generateUnknownConfigurationMarker(setting) {
    return {
      severity: MarkerSeverity.Hint,
      tags: [MarkerTag.Unnecessary],
      ...setting.range,
      message: nls.localize("unknown configuration setting", "Unknown Configuration Setting")
    };
  }
  generateUntrustedSettingCodeActions(diagnostics) {
    return [{
      title: nls.localize("manage workspace trust", "Manage Workspace Trust"),
      command: {
        id: "workbench.trust.manage",
        title: nls.localize("manage workspace trust", "Manage Workspace Trust")
      },
      diagnostics,
      kind: CodeActionKind.QuickFix.value
    }];
  }
  generatePreviewSettingMarker(setting) {
    return {
      severity: MarkerSeverity.Hint,
      ...setting.range,
      message: PREVIEW_INDICATOR_DESCRIPTION
    };
  }
  generateExperimentalSettingMarker(setting) {
    return {
      severity: MarkerSeverity.Hint,
      ...setting.range,
      message: EXPERIMENTAL_INDICATOR_DESCRIPTION
    };
  }
  addCodeActions(range, codeActions) {
    let actions = this.codeActions.get(this.settingsEditorModel.uri);
    if (!actions) {
      actions = [];
      this.codeActions.set(this.settingsEditorModel.uri, actions);
    }
    actions.push([Range.lift(range), codeActions]);
  }
  dispose() {
    this.markerService.remove("UnsupportedSettingsRenderer", [this.settingsEditorModel.uri]);
    this.codeActions.clear();
    super.dispose();
  }
};
UnsupportedSettingsRenderer = __decorateClass([
  __decorateParam(2, IMarkerService),
  __decorateParam(3, IWorkbenchEnvironmentService),
  __decorateParam(4, IWorkbenchConfigurationService),
  __decorateParam(5, IWorkspaceTrustManagementService),
  __decorateParam(6, IUriIdentityService),
  __decorateParam(7, ILanguageFeaturesService),
  __decorateParam(8, IUserDataProfileService),
  __decorateParam(9, IUserDataProfilesService)
], UnsupportedSettingsRenderer);
let McpSettingsRenderer = class extends Disposable {
  constructor(editor, settingsEditorModel, markerService, uriIdentityService, languageFeaturesService) {
    super();
    this.editor = editor;
    this.settingsEditorModel = settingsEditorModel;
    this.markerService = markerService;
    this.uriIdentityService = uriIdentityService;
    this.renderingDelayer = this._register(new Delayer(200));
    this.codeActions = new ResourceMap((uri) => this.uriIdentityService.extUri.getComparisonKey(uri));
    this._register(this.editor.getModel().onDidChangeContent(() => this.delayedRender()));
    this._register(languageFeaturesService.codeActionProvider.register({ pattern: settingsEditorModel.uri.path }, this));
  }
  delayedRender() {
    this.renderingDelayer.trigger(() => this.render());
  }
  render() {
    this.codeActions.clear();
    const markerData = this.generateMarkerData();
    if (markerData.length) {
      this.markerService.changeOne("McpSettingsRenderer", this.settingsEditorModel.uri, markerData);
    } else {
      this.markerService.remove("McpSettingsRenderer", [this.settingsEditorModel.uri]);
    }
  }
  async provideCodeActions(model, range, context, token) {
    const actions = [];
    const codeActionsByRange = this.codeActions.get(model.uri);
    if (codeActionsByRange) {
      for (const [codeActionsRange, codeActions] of codeActionsByRange) {
        if (codeActionsRange.containsRange(range)) {
          actions.push(...codeActions);
        }
      }
    }
    return {
      actions,
      dispose: () => {
      }
    };
  }
  generateMarkerData() {
    const markerData = [];
    if (this.settingsEditorModel.configurationTarget !== ConfigurationTarget.USER_LOCAL && this.settingsEditorModel.configurationTarget !== ConfigurationTarget.USER_REMOTE) {
      return markerData;
    }
    for (const settingsGroup of this.settingsEditorModel.settingsGroups) {
      for (const section of settingsGroup.sections) {
        for (const setting of section.settings) {
          if (setting.key === mcpConfigurationSection) {
            const marker = this.generateMcpConfigurationMarker(setting);
            markerData.push(marker);
            const codeActions = this.generateMcpConfigurationCodeActions([marker]);
            this.addCodeActions(setting.range, codeActions);
          }
        }
      }
    }
    return markerData;
  }
  generateMcpConfigurationMarker(setting) {
    const isRemote = this.settingsEditorModel.configurationTarget === ConfigurationTarget.USER_REMOTE;
    const message = isRemote ? nls.localize("mcp.renderer.remoteConfigFound", "MCP servers should not be configured in remote user settings. Use the dedicated MCP configuration instead.") : nls.localize("mcp.renderer.userConfigFound", "MCP servers should not be configured in user settings. Use the dedicated MCP configuration instead.");
    return {
      severity: MarkerSeverity.Warning,
      ...setting.range,
      message
    };
  }
  generateMcpConfigurationCodeActions(diagnostics) {
    const isRemote = this.settingsEditorModel.configurationTarget === ConfigurationTarget.USER_REMOTE;
    const openConfigLabel = isRemote ? nls.localize("mcp.renderer.openRemoteConfig", "Open Remote User MCP Configuration") : nls.localize("mcp.renderer.openUserConfig", "Open User MCP Configuration");
    const commandId = isRemote ? McpCommandIds.OpenRemoteUserMcp : McpCommandIds.OpenUserMcp;
    return [{
      title: openConfigLabel,
      command: {
        id: commandId,
        title: openConfigLabel
      },
      diagnostics,
      kind: CodeActionKind.QuickFix.value
    }];
  }
  addCodeActions(range, codeActions) {
    let actions = this.codeActions.get(this.settingsEditorModel.uri);
    if (!actions) {
      actions = [];
      this.codeActions.set(this.settingsEditorModel.uri, actions);
    }
    actions.push([Range.lift(range), codeActions]);
  }
  dispose() {
    this.markerService.remove("McpSettingsRenderer", [this.settingsEditorModel.uri]);
    this.codeActions.clear();
    super.dispose();
  }
};
McpSettingsRenderer = __decorateClass([
  __decorateParam(2, IMarkerService),
  __decorateParam(3, IUriIdentityService),
  __decorateParam(4, ILanguageFeaturesService)
], McpSettingsRenderer);
let WorkspaceConfigurationRenderer = class extends Disposable {
  constructor(editor, workspaceSettingsEditorModel, workspaceContextService, markerService) {
    super();
    this.editor = editor;
    this.workspaceSettingsEditorModel = workspaceSettingsEditorModel;
    this.workspaceContextService = workspaceContextService;
    this.markerService = markerService;
    this.renderingDelayer = this._register(new Delayer(200));
    this.decorations = this.editor.createDecorationsCollection();
    this._register(this.editor.getModel().onDidChangeContent(() => this.renderingDelayer.trigger(() => this.render())));
  }
  render() {
    const markerData = [];
    if (this.workspaceContextService.getWorkbenchState() === WorkbenchState.WORKSPACE && this.workspaceSettingsEditorModel instanceof WorkspaceConfigurationEditorModel) {
      const ranges = [];
      for (const settingsGroup of this.workspaceSettingsEditorModel.configurationGroups) {
        for (const section of settingsGroup.sections) {
          for (const setting of section.settings) {
            if (!WorkspaceConfigurationRenderer.supportedKeys.includes(setting.key)) {
              markerData.push({
                severity: MarkerSeverity.Hint,
                tags: [MarkerTag.Unnecessary],
                ...setting.range,
                message: nls.localize("unsupportedProperty", "Unsupported Property")
              });
            }
          }
        }
      }
      this.decorations.set(ranges.map((range) => this.createDecoration(range)));
    }
    if (markerData.length) {
      this.markerService.changeOne("WorkspaceConfigurationRenderer", this.workspaceSettingsEditorModel.uri, markerData);
    } else {
      this.markerService.remove("WorkspaceConfigurationRenderer", [this.workspaceSettingsEditorModel.uri]);
    }
  }
  createDecoration(range) {
    return {
      range,
      options: WorkspaceConfigurationRenderer._DIM_CONFIGURATION_
    };
  }
  dispose() {
    this.markerService.remove("WorkspaceConfigurationRenderer", [this.workspaceSettingsEditorModel.uri]);
    this.decorations.clear();
    super.dispose();
  }
};
WorkspaceConfigurationRenderer.supportedKeys = ["folders", "tasks", "launch", "extensions", "settings", "remoteAuthority", "transient"];
WorkspaceConfigurationRenderer._DIM_CONFIGURATION_ = ModelDecorationOptions.register({
  description: "dim-configuration",
  stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
  inlineClassName: "dim-configuration"
});
WorkspaceConfigurationRenderer = __decorateClass([
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IMarkerService)
], WorkspaceConfigurationRenderer);
export {
  UserSettingsRenderer,
  WorkspaceSettingsRenderer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL2Jyb3dzZXIvcHJlZmVyZW5jZXNSZW5kZXJlcnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudEhlbHBlciwgZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgU3VibWVudUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IsIElFZGl0b3JNb3VzZUV2ZW50LCBNb3VzZVRhcmdldFR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgSVJhbmdlLCBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElDdXJzb3JQb3NpdGlvbkNoYW5nZWRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY3Vyc29yRXZlbnRzLmpzJztcbmltcG9ydCAqIGFzIGVkaXRvckNvbW1vbiBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgKiBhcyBsYW5ndWFnZXMgZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsRGVsdGFEZWNvcmF0aW9uLCBJVGV4dE1vZGVsLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNb2RlbERlY29yYXRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC90ZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9sYW5ndWFnZUZlYXR1cmVzLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25LaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29kZUFjdGlvbi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIENvbmZpZ3VyYXRpb25TY29wZSwgSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSwgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSwgSVJlZ2lzdGVyZWRDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEsIE9WRVJSSURFX1BST1BFUlRZX1JFR0VYLCBvdmVycmlkZUlkZW50aWZpZXJzRnJvbUtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElNYXJrZXJEYXRhLCBJTWFya2VyU2VydmljZSwgTWFya2VyU2V2ZXJpdHksIE1hcmtlclRhZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIFdvcmtiZW5jaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IFJhbmdlSGlnaGxpZ2h0RGVjb3JhdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NvZGVlZGl0b3IuanMnO1xuaW1wb3J0IHsgc2V0dGluZ3NFZGl0SWNvbiB9IGZyb20gJy4vcHJlZmVyZW5jZXNJY29ucy5qcyc7XG5pbXBvcnQgeyBFZGl0UHJlZmVyZW5jZVdpZGdldCB9IGZyb20gJy4vcHJlZmVyZW5jZXNXaWRnZXRzLmpzJztcbmltcG9ydCB7IEFQUExJQ0FUSU9OX1NDT1BFUywgQVBQTFlfQUxMX1BST0ZJTEVTX1NFVFRJTkcsIElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzRWRpdG9yTW9kZWwsIElQcmVmZXJlbmNlc1NlcnZpY2UsIElTZXR0aW5nLCBJU2V0dGluZ3NFZGl0b3JNb2RlbCwgSVNldHRpbmdzR3JvdXAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgRGVmYXVsdFNldHRpbmdzRWRpdG9yTW9kZWwsIFNldHRpbmdzRWRpdG9yTW9kZWwsIFdvcmtzcGFjZUNvbmZpZ3VyYXRpb25FZGl0b3JNb2RlbCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlc01vZGVscy5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJEYXRhUHJvZmlsZS9jb21tb24vdXNlckRhdGFQcm9maWxlLmpzJztcbmltcG9ydCB7IEVYUEVSSU1FTlRBTF9JTkRJQ0FUT1JfREVTQ1JJUFRJT04sIFBSRVZJRVdfSU5ESUNBVE9SX0RFU0NSSVBUSU9OIH0gZnJvbSAnLi4vY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IG1jcENvbmZpZ3VyYXRpb25TZWN0aW9uIH0gZnJvbSAnLi4vLi4vbWNwL2NvbW1vbi9tY3BDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IE1jcENvbW1hbmRJZHMgfSBmcm9tICcuLi8uLi9tY3AvY29tbW9uL21jcENvbW1hbmRJZHMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElQcmVmZXJlbmNlc1JlbmRlcmVyIGV4dGVuZHMgSURpc3Bvc2FibGUge1xuXHRyZW5kZXIoKTogdm9pZDtcblx0dXBkYXRlUHJlZmVyZW5jZShrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIHNvdXJjZTogSVNldHRpbmcpOiB2b2lkO1xuXHRmb2N1c1ByZWZlcmVuY2Uoc2V0dGluZzogSVNldHRpbmcpOiB2b2lkO1xuXHRjbGVhckZvY3VzKHNldHRpbmc6IElTZXR0aW5nKTogdm9pZDtcblx0ZWRpdFByZWZlcmVuY2Uoc2V0dGluZzogSVNldHRpbmcpOiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgVXNlclNldHRpbmdzUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVByZWZlcmVuY2VzUmVuZGVyZXIge1xuXG5cdHByaXZhdGUgc2V0dGluZ0hpZ2hsaWdodGVyOiBTZXR0aW5nSGlnaGxpZ2h0ZXI7XG5cdHByaXZhdGUgZWRpdFNldHRpbmdBY3Rpb25SZW5kZXJlcjogRWRpdFNldHRpbmdSZW5kZXJlcjtcblx0cHJpdmF0ZSBtb2RlbENoYW5nZURlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPigyMDApKTtcblx0cHJpdmF0ZSBhc3NvY2lhdGVkUHJlZmVyZW5jZXNNb2RlbCE6IElQcmVmZXJlbmNlc0VkaXRvck1vZGVsPElTZXR0aW5nPjtcblxuXHRwcml2YXRlIHVuc3VwcG9ydGVkU2V0dGluZ3NSZW5kZXJlcjogVW5zdXBwb3J0ZWRTZXR0aW5nc1JlbmRlcmVyO1xuXHRwcml2YXRlIG1jcFNldHRpbmdzUmVuZGVyZXI6IE1jcFNldHRpbmdzUmVuZGVyZXI7XG5cblx0Y29uc3RydWN0b3IocHJvdGVjdGVkIGVkaXRvcjogSUNvZGVFZGl0b3IsIHJlYWRvbmx5IHByZWZlcmVuY2VzTW9kZWw6IFNldHRpbmdzRWRpdG9yTW9kZWwsXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgcHJvdGVjdGVkIHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5zZXR0aW5nSGlnaGxpZ2h0ZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXR0aW5nSGlnaGxpZ2h0ZXIsIGVkaXRvcikpO1xuXHRcdHRoaXMuZWRpdFNldHRpbmdBY3Rpb25SZW5kZXJlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdFNldHRpbmdSZW5kZXJlciwgdGhpcy5lZGl0b3IsIHRoaXMucHJlZmVyZW5jZXNNb2RlbCwgdGhpcy5zZXR0aW5nSGlnaGxpZ2h0ZXIpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRTZXR0aW5nQWN0aW9uUmVuZGVyZXIub25VcGRhdGVTZXR0aW5nKCh7IGtleSwgdmFsdWUsIHNvdXJjZSB9KSA9PiB0aGlzLnVwZGF0ZVByZWZlcmVuY2Uoa2V5LCB2YWx1ZSwgc291cmNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLmdldE1vZGVsKCkhLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB0aGlzLm1vZGVsQ2hhbmdlRGVsYXllci50cmlnZ2VyKCgpID0+IHRoaXMub25Nb2RlbENoYW5nZWQoKSkpKTtcblx0XHR0aGlzLnVuc3VwcG9ydGVkU2V0dGluZ3NSZW5kZXJlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFVuc3VwcG9ydGVkU2V0dGluZ3NSZW5kZXJlciwgZWRpdG9yLCBwcmVmZXJlbmNlc01vZGVsKSk7XG5cdFx0dGhpcy5tY3BTZXR0aW5nc1JlbmRlcmVyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWNwU2V0dGluZ3NSZW5kZXJlciwgZWRpdG9yLCBwcmVmZXJlbmNlc01vZGVsKSk7XG5cdH1cblxuXHRyZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0U2V0dGluZ0FjdGlvblJlbmRlcmVyLnJlbmRlcih0aGlzLnByZWZlcmVuY2VzTW9kZWwuc2V0dGluZ3NHcm91cHMsIHRoaXMuYXNzb2NpYXRlZFByZWZlcmVuY2VzTW9kZWwpO1xuXHRcdHRoaXMudW5zdXBwb3J0ZWRTZXR0aW5nc1JlbmRlcmVyLnJlbmRlcigpO1xuXHRcdHRoaXMubWNwU2V0dGluZ3NSZW5kZXJlci5yZW5kZXIoKTtcblx0fVxuXG5cdHVwZGF0ZVByZWZlcmVuY2Uoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBzb3VyY2U6IElJbmRleGVkU2V0dGluZyk6IHZvaWQge1xuXHRcdGNvbnN0IG92ZXJyaWRlSWRlbnRpZmllcnMgPSBzb3VyY2Uub3ZlcnJpZGVPZiA/IG92ZXJyaWRlSWRlbnRpZmllcnNGcm9tS2V5KHNvdXJjZS5vdmVycmlkZU9mLmtleSkgOiBudWxsO1xuXHRcdGNvbnN0IHJlc291cmNlID0gdGhpcy5wcmVmZXJlbmNlc01vZGVsLnVyaTtcblx0XHR0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKGtleSwgdmFsdWUsIHsgb3ZlcnJpZGVJZGVudGlmaWVycywgcmVzb3VyY2UgfSwgdGhpcy5wcmVmZXJlbmNlc01vZGVsLmNvbmZpZ3VyYXRpb25UYXJnZXQpXG5cdFx0XHQudGhlbigoKSA9PiB0aGlzLm9uU2V0dGluZ1VwZGF0ZWQoc291cmNlKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uTW9kZWxDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5lZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0Ly8gbW9kZWwgY291bGQgaGF2ZSBiZWVuIGRpc3Bvc2VkIGR1cmluZyB0aGUgZGVsYXlcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0fVxuXG5cdHByaXZhdGUgb25TZXR0aW5nVXBkYXRlZChzZXR0aW5nOiBJU2V0dGluZykge1xuXHRcdHRoaXMuZWRpdG9yLmZvY3VzKCk7XG5cdFx0c2V0dGluZyA9IHRoaXMuZ2V0U2V0dGluZyhzZXR0aW5nKSE7XG5cdFx0aWYgKHNldHRpbmcpIHtcblx0XHRcdC8vIFRPRE86QHNhbmR5IFNlbGVjdGlvbiByYW5nZSBzaG91bGQgYmUgdGVtcGxhdGUgcmFuZ2Vcblx0XHRcdHRoaXMuZWRpdG9yLnNldFNlbGVjdGlvbihzZXR0aW5nLnZhbHVlUmFuZ2UpO1xuXHRcdFx0dGhpcy5zZXR0aW5nSGlnaGxpZ2h0ZXIuaGlnaGxpZ2h0KHNldHRpbmcsIHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0U2V0dGluZyhzZXR0aW5nOiBJU2V0dGluZyk6IElTZXR0aW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB7IGtleSwgb3ZlcnJpZGVPZiB9ID0gc2V0dGluZztcblx0XHRpZiAob3ZlcnJpZGVPZikge1xuXHRcdFx0Y29uc3Qgc2V0dGluZyA9IHRoaXMuZ2V0U2V0dGluZyhvdmVycmlkZU9mKTtcblx0XHRcdGZvciAoY29uc3Qgb3ZlcnJpZGUgb2Ygc2V0dGluZyEub3ZlcnJpZGVzISkge1xuXHRcdFx0XHRpZiAob3ZlcnJpZGUua2V5ID09PSBrZXkpIHtcblx0XHRcdFx0XHRyZXR1cm4gb3ZlcnJpZGU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMucHJlZmVyZW5jZXNNb2RlbC5nZXRQcmVmZXJlbmNlKGtleSk7XG5cdH1cblxuXHRmb2N1c1ByZWZlcmVuY2Uoc2V0dGluZzogSVNldHRpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBzID0gdGhpcy5nZXRTZXR0aW5nKHNldHRpbmcpO1xuXHRcdGlmIChzKSB7XG5cdFx0XHR0aGlzLnNldHRpbmdIaWdobGlnaHRlci5oaWdobGlnaHQocywgdHJ1ZSk7XG5cdFx0XHR0aGlzLmVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IHMua2V5UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBjb2x1bW46IHMua2V5UmFuZ2Uuc3RhcnRDb2x1bW4gfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2V0dGluZ0hpZ2hsaWdodGVyLmNsZWFyKHRydWUpO1xuXHRcdH1cblx0fVxuXG5cdGNsZWFyRm9jdXMoc2V0dGluZzogSVNldHRpbmcpOiB2b2lkIHtcblx0XHR0aGlzLnNldHRpbmdIaWdobGlnaHRlci5jbGVhcih0cnVlKTtcblx0fVxuXG5cdGVkaXRQcmVmZXJlbmNlKHNldHRpbmc6IElTZXR0aW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgZWRpdGFibGVTZXR0aW5nID0gdGhpcy5nZXRTZXR0aW5nKHNldHRpbmcpO1xuXHRcdHJldHVybiAhIShlZGl0YWJsZVNldHRpbmcgJiYgdGhpcy5lZGl0U2V0dGluZ0FjdGlvblJlbmRlcmVyLmFjdGl2YXRlT25TZXR0aW5nKGVkaXRhYmxlU2V0dGluZykpO1xuXHR9XG5cbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtzcGFjZVNldHRpbmdzUmVuZGVyZXIgZXh0ZW5kcyBVc2VyU2V0dGluZ3NSZW5kZXJlciBpbXBsZW1lbnRzIElQcmVmZXJlbmNlc1JlbmRlcmVyIHtcblxuXHRwcml2YXRlIHdvcmtzcGFjZUNvbmZpZ3VyYXRpb25SZW5kZXJlcjogV29ya3NwYWNlQ29uZmlndXJhdGlvblJlbmRlcmVyO1xuXG5cdGNvbnN0cnVjdG9yKGVkaXRvcjogSUNvZGVFZGl0b3IsIHByZWZlcmVuY2VzTW9kZWw6IFNldHRpbmdzRWRpdG9yTW9kZWwsXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgcHJlZmVyZW5jZXNTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoZWRpdG9yLCBwcmVmZXJlbmNlc01vZGVsLCBwcmVmZXJlbmNlc1NlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy53b3Jrc3BhY2VDb25maWd1cmF0aW9uUmVuZGVyZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXb3Jrc3BhY2VDb25maWd1cmF0aW9uUmVuZGVyZXIsIGVkaXRvciwgcHJlZmVyZW5jZXNNb2RlbCkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgcmVuZGVyKCk6IHZvaWQge1xuXHRcdHN1cGVyLnJlbmRlcigpO1xuXHRcdHRoaXMud29ya3NwYWNlQ29uZmlndXJhdGlvblJlbmRlcmVyLnJlbmRlcigpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUluZGV4ZWRTZXR0aW5nIGV4dGVuZHMgSVNldHRpbmcge1xuXHRpbmRleDogbnVtYmVyO1xuXHRncm91cElkOiBzdHJpbmc7XG59XG5cbmNsYXNzIEVkaXRTZXR0aW5nUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIGVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yQ3Vyc29yUG9zaXRpb246IEVkaXRQcmVmZXJlbmNlV2lkZ2V0PElJbmRleGVkU2V0dGluZz47XG5cdHByaXZhdGUgZWRpdFByZWZlcmVuY2VXaWRnZXRGb3JNb3VzZU1vdmU6IEVkaXRQcmVmZXJlbmNlV2lkZ2V0PElJbmRleGVkU2V0dGluZz47XG5cblx0cHJpdmF0ZSBzZXR0aW5nc0dyb3VwczogSVNldHRpbmdzR3JvdXBbXSA9IFtdO1xuXHRhc3NvY2lhdGVkUHJlZmVyZW5jZXNNb2RlbCE6IElQcmVmZXJlbmNlc0VkaXRvck1vZGVsPElTZXR0aW5nPjtcblx0cHJpdmF0ZSB0b2dnbGVFZGl0UHJlZmVyZW5jZXNGb3JNb3VzZU1vdmVEZWxheWVyOiBEZWxheWVyPHZvaWQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uVXBkYXRlU2V0dGluZzogRW1pdHRlcjx7IGtleTogc3RyaW5nOyB2YWx1ZTogdW5rbm93bjsgc291cmNlOiBJSW5kZXhlZFNldHRpbmcgfT4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IGtleTogc3RyaW5nOyB2YWx1ZTogdW5rbm93bjsgc291cmNlOiBJSW5kZXhlZFNldHRpbmcgfT4oKSk7XG5cdHJlYWRvbmx5IG9uVXBkYXRlU2V0dGluZzogRXZlbnQ8eyBrZXk6IHN0cmluZzsgdmFsdWU6IHVua25vd247IHNvdXJjZTogSUluZGV4ZWRTZXR0aW5nIH0+ID0gdGhpcy5fb25VcGRhdGVTZXR0aW5nLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgZWRpdG9yOiBJQ29kZUVkaXRvciwgcHJpdmF0ZSBwcmltYXJ5U2V0dGluZ3NNb2RlbDogSVNldHRpbmdzRWRpdG9yTW9kZWwsXG5cdFx0cHJpdmF0ZSBzZXR0aW5nSGlnaGxpZ2h0ZXI6IFNldHRpbmdIaWdobGlnaHRlcixcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvckN1cnNvclBvc2l0aW9uID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0UHJlZmVyZW5jZVdpZGdldDxJSW5kZXhlZFNldHRpbmc+LCBlZGl0b3IpKTtcblx0XHR0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yTW91c2VNb3ZlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0UHJlZmVyZW5jZVdpZGdldDxJSW5kZXhlZFNldHRpbmc+LCBlZGl0b3IpKTtcblx0XHR0aGlzLnRvZ2dsZUVkaXRQcmVmZXJlbmNlc0Zvck1vdXNlTW92ZURlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPig3NSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvckN1cnNvclBvc2l0aW9uLm9uQ2xpY2soZSA9PiB0aGlzLm9uRWRpdFNldHRpbmdDbGlja2VkKHRoaXMuZWRpdFByZWZlcmVuY2VXaWRnZXRGb3JDdXJzb3JQb3NpdGlvbiwgZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yTW91c2VNb3ZlLm9uQ2xpY2soZSA9PiB0aGlzLm9uRWRpdFNldHRpbmdDbGlja2VkKHRoaXMuZWRpdFByZWZlcmVuY2VXaWRnZXRGb3JNb3VzZU1vdmUsIGUpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmVkaXRvci5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKHBvc2l0aW9uQ2hhbmdlRXZlbnQgPT4gdGhpcy5vblBvc2l0aW9uQ2hhbmdlZChwb3NpdGlvbkNoYW5nZUV2ZW50KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uTW91c2VNb3ZlKG1vdXNlTW92ZUV2ZW50ID0+IHRoaXMub25Nb3VzZU1vdmVkKG1vdXNlTW92ZUV2ZW50KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbigoKSA9PiB0aGlzLm9uQ29uZmlndXJhdGlvbkNoYW5nZWQoKSkpO1xuXHR9XG5cblx0cmVuZGVyKHNldHRpbmdzR3JvdXBzOiBJU2V0dGluZ3NHcm91cFtdLCBhc3NvY2lhdGVkUHJlZmVyZW5jZXNNb2RlbDogSVByZWZlcmVuY2VzRWRpdG9yTW9kZWw8SVNldHRpbmc+KTogdm9pZCB7XG5cdFx0dGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvckN1cnNvclBvc2l0aW9uLmhpZGUoKTtcblx0XHR0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yTW91c2VNb3ZlLmhpZGUoKTtcblx0XHR0aGlzLnNldHRpbmdzR3JvdXBzID0gc2V0dGluZ3NHcm91cHM7XG5cdFx0dGhpcy5hc3NvY2lhdGVkUHJlZmVyZW5jZXNNb2RlbCA9IGFzc29jaWF0ZWRQcmVmZXJlbmNlc01vZGVsO1xuXG5cdFx0Y29uc3Qgc2V0dGluZ3MgPSB0aGlzLmdldFNldHRpbmdzKHRoaXMuZWRpdG9yLmdldFBvc2l0aW9uKCkhLmxpbmVOdW1iZXIpO1xuXHRcdGlmIChzZXR0aW5ncy5sZW5ndGgpIHtcblx0XHRcdHRoaXMuc2hvd0VkaXRQcmVmZXJlbmNlc1dpZGdldCh0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yQ3Vyc29yUG9zaXRpb24sIHNldHRpbmdzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGlzRGVmYXVsdFNldHRpbmdzKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnByaW1hcnlTZXR0aW5nc01vZGVsIGluc3RhbmNlb2YgRGVmYXVsdFNldHRpbmdzRWRpdG9yTW9kZWw7XG5cdH1cblxuXHRwcml2YXRlIG9uQ29uZmlndXJhdGlvbkNoYW5nZWQoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmdseXBoTWFyZ2luKSkge1xuXHRcdFx0dGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvckN1cnNvclBvc2l0aW9uLmhpZGUoKTtcblx0XHRcdHRoaXMuZWRpdFByZWZlcmVuY2VXaWRnZXRGb3JNb3VzZU1vdmUuaGlkZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Qb3NpdGlvbkNoYW5nZWQocG9zaXRpb25DaGFuZ2VFdmVudDogSUN1cnNvclBvc2l0aW9uQ2hhbmdlZEV2ZW50KSB7XG5cdFx0dGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvck1vdXNlTW92ZS5oaWRlKCk7XG5cdFx0Y29uc3Qgc2V0dGluZ3MgPSB0aGlzLmdldFNldHRpbmdzKHBvc2l0aW9uQ2hhbmdlRXZlbnQucG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0aWYgKHNldHRpbmdzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5zaG93RWRpdFByZWZlcmVuY2VzV2lkZ2V0KHRoaXMuZWRpdFByZWZlcmVuY2VXaWRnZXRGb3JDdXJzb3JQb3NpdGlvbiwgc2V0dGluZ3MpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yQ3Vyc29yUG9zaXRpb24uaGlkZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Nb3VzZU1vdmVkKG1vdXNlTW92ZUV2ZW50OiBJRWRpdG9yTW91c2VFdmVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRQcmVmZXJlbmNlV2lkZ2V0ID0gdGhpcy5nZXRFZGl0UHJlZmVyZW5jZVdpZGdldFVuZGVyTW91c2UobW91c2VNb3ZlRXZlbnQpO1xuXHRcdGlmIChlZGl0UHJlZmVyZW5jZVdpZGdldCkge1xuXHRcdFx0dGhpcy5vbk1vdXNlT3ZlcihlZGl0UHJlZmVyZW5jZVdpZGdldCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuc2V0dGluZ0hpZ2hsaWdodGVyLmNsZWFyKCk7XG5cdFx0dGhpcy50b2dnbGVFZGl0UHJlZmVyZW5jZXNGb3JNb3VzZU1vdmVEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy50b2dnbGVFZGl0UHJlZmVyZW5jZVdpZGdldEZvck1vdXNlTW92ZShtb3VzZU1vdmVFdmVudCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRFZGl0UHJlZmVyZW5jZVdpZGdldFVuZGVyTW91c2UobW91c2VNb3ZlRXZlbnQ6IElFZGl0b3JNb3VzZUV2ZW50KTogRWRpdFByZWZlcmVuY2VXaWRnZXQ8SVNldHRpbmc+IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAobW91c2VNb3ZlRXZlbnQudGFyZ2V0LnR5cGUgPT09IE1vdXNlVGFyZ2V0VHlwZS5HVVRURVJfR0xZUEhfTUFSR0lOKSB7XG5cdFx0XHRjb25zdCBsaW5lID0gbW91c2VNb3ZlRXZlbnQudGFyZ2V0LnBvc2l0aW9uLmxpbmVOdW1iZXI7XG5cdFx0XHRpZiAodGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvck1vdXNlTW92ZS5nZXRMaW5lKCkgPT09IGxpbmUgJiYgdGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvck1vdXNlTW92ZS5pc1Zpc2libGUoKSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvck1vdXNlTW92ZTtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yQ3Vyc29yUG9zaXRpb24uZ2V0TGluZSgpID09PSBsaW5lICYmIHRoaXMuZWRpdFByZWZlcmVuY2VXaWRnZXRGb3JDdXJzb3JQb3NpdGlvbi5pc1Zpc2libGUoKSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvckN1cnNvclBvc2l0aW9uO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSB0b2dnbGVFZGl0UHJlZmVyZW5jZVdpZGdldEZvck1vdXNlTW92ZShtb3VzZU1vdmVFdmVudDogSUVkaXRvck1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCBzZXR0aW5ncyA9IG1vdXNlTW92ZUV2ZW50LnRhcmdldC5wb3NpdGlvbiA/IHRoaXMuZ2V0U2V0dGluZ3MobW91c2VNb3ZlRXZlbnQudGFyZ2V0LnBvc2l0aW9uLmxpbmVOdW1iZXIpIDogbnVsbDtcblx0XHRpZiAoc2V0dGluZ3MgJiYgc2V0dGluZ3MubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnNob3dFZGl0UHJlZmVyZW5jZXNXaWRnZXQodGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvck1vdXNlTW92ZSwgc2V0dGluZ3MpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yTW91c2VNb3ZlLmhpZGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3dFZGl0UHJlZmVyZW5jZXNXaWRnZXQoZWRpdFByZWZlcmVuY2VzV2lkZ2V0OiBFZGl0UHJlZmVyZW5jZVdpZGdldDxJU2V0dGluZz4sIHNldHRpbmdzOiBJSW5kZXhlZFNldHRpbmdbXSkge1xuXHRcdGNvbnN0IGxpbmUgPSBzZXR0aW5nc1swXS52YWx1ZVJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRpZiAodGhpcy5lZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5nbHlwaE1hcmdpbikgJiYgdGhpcy5tYXJnaW5GcmVlRnJvbU90aGVyRGVjb3JhdGlvbnMobGluZSkpIHtcblx0XHRcdGVkaXRQcmVmZXJlbmNlc1dpZGdldC5zaG93KGxpbmUsIG5scy5sb2NhbGl6ZSgnZWRpdFR0aWxlJywgXCJFZGl0XCIpLCBzZXR0aW5ncyk7XG5cdFx0XHRjb25zdCBlZGl0UHJlZmVyZW5jZVdpZGdldFRvSGlkZSA9IGVkaXRQcmVmZXJlbmNlc1dpZGdldCA9PT0gdGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvckN1cnNvclBvc2l0aW9uID8gdGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvck1vdXNlTW92ZSA6IHRoaXMuZWRpdFByZWZlcmVuY2VXaWRnZXRGb3JDdXJzb3JQb3NpdGlvbjtcblx0XHRcdGVkaXRQcmVmZXJlbmNlV2lkZ2V0VG9IaWRlLmhpZGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG1hcmdpbkZyZWVGcm9tT3RoZXJEZWNvcmF0aW9ucyhsaW5lOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IHRoaXMuZWRpdG9yLmdldExpbmVEZWNvcmF0aW9ucyhsaW5lKTtcblx0XHRpZiAoZGVjb3JhdGlvbnMpIHtcblx0XHRcdGZvciAoY29uc3QgeyBvcHRpb25zIH0gb2YgZGVjb3JhdGlvbnMpIHtcblx0XHRcdFx0aWYgKG9wdGlvbnMuZ2x5cGhNYXJnaW5DbGFzc05hbWUgJiYgb3B0aW9ucy5nbHlwaE1hcmdpbkNsYXNzTmFtZS5pbmRleE9mKFRoZW1lSWNvbi5hc0NsYXNzTmFtZShzZXR0aW5nc0VkaXRJY29uKSkgPT09IC0xKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXR0aW5ncyhsaW5lTnVtYmVyOiBudW1iZXIpOiBJSW5kZXhlZFNldHRpbmdbXSB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbk1hcCA9IHRoaXMuZ2V0Q29uZmlndXJhdGlvbnNNYXAoKTtcblx0XHRyZXR1cm4gdGhpcy5nZXRTZXR0aW5nc0F0TGluZU51bWJlcihsaW5lTnVtYmVyKS5maWx0ZXIoc2V0dGluZyA9PiB7XG5cdFx0XHRjb25zdCBjb25maWd1cmF0aW9uTm9kZSA9IGNvbmZpZ3VyYXRpb25NYXBbc2V0dGluZy5rZXldO1xuXHRcdFx0aWYgKGNvbmZpZ3VyYXRpb25Ob2RlKSB7XG5cdFx0XHRcdGlmIChjb25maWd1cmF0aW9uTm9kZS5wb2xpY3kgJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KHNldHRpbmcua2V5KS5wb2xpY3lWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0aGlzLmlzRGVmYXVsdFNldHRpbmdzKCkpIHtcblx0XHRcdFx0XHRpZiAoc2V0dGluZy5rZXkgPT09ICdsYXVuY2gnKSB7XG5cdFx0XHRcdFx0XHQvLyBEbyBub3Qgc2hvdyBiZWNhdXNlIG9mIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8zMjU5M1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY29uZmlndXJhdGlvbk5vZGUudHlwZSA9PT0gJ2Jvb2xlYW4nIHx8IGNvbmZpZ3VyYXRpb25Ob2RlLmVudW0pIHtcblx0XHRcdFx0XHRpZiAoKDxTZXR0aW5nc0VkaXRvck1vZGVsPnRoaXMucHJpbWFyeVNldHRpbmdzTW9kZWwpLmNvbmZpZ3VyYXRpb25UYXJnZXQgIT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUikge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChjb25maWd1cmF0aW9uTm9kZS5zY29wZSA9PT0gQ29uZmlndXJhdGlvblNjb3BlLlJFU09VUkNFIHx8IGNvbmZpZ3VyYXRpb25Ob2RlLnNjb3BlID09PSBDb25maWd1cmF0aW9uU2NvcGUuTEFOR1VBR0VfT1ZFUlJJREFCTEUpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXR0aW5nc0F0TGluZU51bWJlcihsaW5lTnVtYmVyOiBudW1iZXIpOiBJSW5kZXhlZFNldHRpbmdbXSB7XG5cdFx0Ly8gaW5kZXggb2Ygc2V0dGluZywgYWNyb3NzIGFsbCBncm91cHMvc2VjdGlvbnNcblx0XHRsZXQgaW5kZXggPSAwO1xuXG5cdFx0Y29uc3Qgc2V0dGluZ3M6IElJbmRleGVkU2V0dGluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBncm91cCBvZiB0aGlzLnNldHRpbmdzR3JvdXBzKSB7XG5cdFx0XHRpZiAoZ3JvdXAucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID4gbGluZU51bWJlcikge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGlmIChsaW5lTnVtYmVyID49IGdyb3VwLnJhbmdlLnN0YXJ0TGluZU51bWJlciAmJiBsaW5lTnVtYmVyIDw9IGdyb3VwLnJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIGdyb3VwLnNlY3Rpb25zKSB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHNlY3Rpb24uc2V0dGluZ3MpIHtcblx0XHRcdFx0XHRcdGlmIChzZXR0aW5nLnJhbmdlLnN0YXJ0TGluZU51bWJlciA+IGxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAobGluZU51bWJlciA+PSBzZXR0aW5nLnJhbmdlLnN0YXJ0TGluZU51bWJlciAmJiBsaW5lTnVtYmVyIDw9IHNldHRpbmcucmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdFx0XHRcdFx0XHRpZiAoIXRoaXMuaXNEZWZhdWx0U2V0dGluZ3MoKSAmJiBzZXR0aW5nLm92ZXJyaWRlcyEubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gT25seSBvbmUgbGV2ZWwgYmVjYXVzZSBvdmVycmlkZSBzZXR0aW5ncyBjYW5ub3QgaGF2ZSBvdmVycmlkZSBzZXR0aW5nc1xuXHRcdFx0XHRcdFx0XHRcdGZvciAoY29uc3Qgb3ZlcnJpZGVTZXR0aW5nIG9mIHNldHRpbmcub3ZlcnJpZGVzISkge1xuXHRcdFx0XHRcdFx0XHRcdFx0aWYgKGxpbmVOdW1iZXIgPj0gb3ZlcnJpZGVTZXR0aW5nLnJhbmdlLnN0YXJ0TGluZU51bWJlciAmJiBsaW5lTnVtYmVyIDw9IG92ZXJyaWRlU2V0dGluZy5yYW5nZS5lbmRMaW5lTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdHNldHRpbmdzLnB1c2goeyAuLi5vdmVycmlkZVNldHRpbmcsIGluZGV4LCBncm91cElkOiBncm91cC5pZCB9KTtcblx0XHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0c2V0dGluZ3MucHVzaCh7IC4uLnNldHRpbmcsIGluZGV4LCBncm91cElkOiBncm91cC5pZCB9KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpbmRleCsrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gc2V0dGluZ3M7XG5cdH1cblxuXHRwcml2YXRlIG9uTW91c2VPdmVyKGVkaXRQcmVmZXJlbmNlV2lkZ2V0OiBFZGl0UHJlZmVyZW5jZVdpZGdldDxJU2V0dGluZz4pOiB2b2lkIHtcblx0XHR0aGlzLnNldHRpbmdIaWdobGlnaHRlci5oaWdobGlnaHQoZWRpdFByZWZlcmVuY2VXaWRnZXQucHJlZmVyZW5jZXNbMF0pO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVkaXRTZXR0aW5nQ2xpY2tlZChlZGl0UHJlZmVyZW5jZVdpZGdldDogRWRpdFByZWZlcmVuY2VXaWRnZXQ8SUluZGV4ZWRTZXR0aW5nPiwgZTogSUVkaXRvck1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRFdmVudEhlbHBlci5zdG9wKGUuZXZlbnQsIHRydWUpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMuZ2V0U2V0dGluZ3MoZWRpdFByZWZlcmVuY2VXaWRnZXQuZ2V0TGluZSgpKS5sZW5ndGggPT09IDEgPyB0aGlzLmdldEFjdGlvbnMoZWRpdFByZWZlcmVuY2VXaWRnZXQucHJlZmVyZW5jZXNbMF0sIHRoaXMuZ2V0Q29uZmlndXJhdGlvbnNNYXAoKVtlZGl0UHJlZmVyZW5jZVdpZGdldC5wcmVmZXJlbmNlc1swXS5rZXldKVxuXHRcdFx0OiBlZGl0UHJlZmVyZW5jZVdpZGdldC5wcmVmZXJlbmNlcy5tYXAoc2V0dGluZyA9PiBuZXcgU3VibWVudUFjdGlvbihgcHJlZmVyZW5jZXMuc3VibWVudS4ke3NldHRpbmcua2V5fWAsIHNldHRpbmcua2V5LCB0aGlzLmdldEFjdGlvbnMoc2V0dGluZywgdGhpcy5nZXRDb25maWd1cmF0aW9uc01hcCgpW3NldHRpbmcua2V5XSkpKTtcblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmV2ZW50LFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9uc1xuXHRcdH0pO1xuXHR9XG5cblx0YWN0aXZhdGVPblNldHRpbmcoc2V0dGluZzogSVNldHRpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBzdGFydExpbmUgPSBzZXR0aW5nLmtleVJhbmdlLnN0YXJ0TGluZU51bWJlcjtcblx0XHRjb25zdCBzZXR0aW5ncyA9IHRoaXMuZ2V0U2V0dGluZ3Moc3RhcnRMaW5lKTtcblx0XHRpZiAoIXNldHRpbmdzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHRoaXMuZWRpdFByZWZlcmVuY2VXaWRnZXRGb3JNb3VzZU1vdmUuc2hvdyhzdGFydExpbmUsICcnLCBzZXR0aW5ncyk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IHRoaXMuZ2V0QWN0aW9ucyh0aGlzLmVkaXRQcmVmZXJlbmNlV2lkZ2V0Rm9yTW91c2VNb3ZlLnByZWZlcmVuY2VzWzBdLCB0aGlzLmdldENvbmZpZ3VyYXRpb25zTWFwKClbdGhpcy5lZGl0UHJlZmVyZW5jZVdpZGdldEZvck1vdXNlTW92ZS5wcmVmZXJlbmNlc1swXS5rZXldKTtcblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiB0aGlzLnRvQWJzb2x1dGVDb29yZHMobmV3IFBvc2l0aW9uKHN0YXJ0TGluZSwgMSkpLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9uc1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIHRvQWJzb2x1dGVDb29yZHMocG9zaXRpb246IFBvc2l0aW9uKTogeyB4OiBudW1iZXI7IHk6IG51bWJlciB9IHtcblx0XHRjb25zdCBwb3NpdGlvbkNvb3JkcyA9IHRoaXMuZWRpdG9yLmdldFNjcm9sbGVkVmlzaWJsZVBvc2l0aW9uKHBvc2l0aW9uKTtcblx0XHRjb25zdCBlZGl0b3JDb29yZHMgPSBnZXREb21Ob2RlUGFnZVBvc2l0aW9uKHRoaXMuZWRpdG9yLmdldERvbU5vZGUoKSEpO1xuXHRcdGNvbnN0IHggPSBlZGl0b3JDb29yZHMubGVmdCArIHBvc2l0aW9uQ29vcmRzIS5sZWZ0O1xuXHRcdGNvbnN0IHkgPSBlZGl0b3JDb29yZHMudG9wICsgcG9zaXRpb25Db29yZHMhLnRvcCArIHBvc2l0aW9uQ29vcmRzIS5oZWlnaHQ7XG5cblx0XHRyZXR1cm4geyB4LCB5OiB5ICsgMTAgfTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0Q29uZmlndXJhdGlvbnNNYXAoKTogeyBbcXVhbGlmaWVkS2V5OiBzdHJpbmddOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hIH0ge1xuXHRcdHJldHVybiBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5nZXRDb25maWd1cmF0aW9uUHJvcGVydGllcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3Rpb25zKHNldHRpbmc6IElJbmRleGVkU2V0dGluZywganNvblNjaGVtYTogSUpTT05TY2hlbWEpOiBJQWN0aW9uW10ge1xuXHRcdGlmIChqc29uU2NoZW1hLnR5cGUgPT09ICdib29sZWFuJykge1xuXHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdGlkOiAndHJ1dGh5VmFsdWUnLFxuXHRcdFx0XHRsYWJlbDogJ3RydWUnLFxuXHRcdFx0XHR0b29sdGlwOiAndHJ1ZScsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdHJ1bjogKCkgPT4gdGhpcy51cGRhdGVTZXR0aW5nKHNldHRpbmcua2V5LCB0cnVlLCBzZXR0aW5nKSxcblx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogJ2ZhbHN5VmFsdWUnLFxuXHRcdFx0XHRsYWJlbDogJ2ZhbHNlJyxcblx0XHRcdFx0dG9vbHRpcDogJ2ZhbHNlJyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLnVwZGF0ZVNldHRpbmcoc2V0dGluZy5rZXksIGZhbHNlLCBzZXR0aW5nKSxcblx0XHRcdFx0Y2xhc3M6IHVuZGVmaW5lZFxuXHRcdFx0fV07XG5cdFx0fVxuXHRcdGlmIChqc29uU2NoZW1hLmVudW0pIHtcblx0XHRcdHJldHVybiBqc29uU2NoZW1hLmVudW0ubWFwKHZhbHVlID0+IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogdmFsdWUsXG5cdFx0XHRcdFx0bGFiZWw6IEpTT04uc3RyaW5naWZ5KHZhbHVlKSxcblx0XHRcdFx0XHR0b29sdGlwOiBKU09OLnN0cmluZ2lmeSh2YWx1ZSksXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMudXBkYXRlU2V0dGluZyhzZXR0aW5nLmtleSwgdmFsdWUsIHNldHRpbmcpLFxuXHRcdFx0XHRcdGNsYXNzOiB1bmRlZmluZWRcblx0XHRcdFx0fTtcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5nZXREZWZhdWx0QWN0aW9ucyhzZXR0aW5nKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVmYXVsdEFjdGlvbnMoc2V0dGluZzogSUluZGV4ZWRTZXR0aW5nKTogSUFjdGlvbltdIHtcblx0XHRpZiAodGhpcy5pc0RlZmF1bHRTZXR0aW5ncygpKSB7XG5cdFx0XHRjb25zdCBzZXR0aW5nSW5PdGhlck1vZGVsID0gdGhpcy5hc3NvY2lhdGVkUHJlZmVyZW5jZXNNb2RlbC5nZXRQcmVmZXJlbmNlKHNldHRpbmcua2V5KTtcblx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRpZDogJ3NldERlZmF1bHRWYWx1ZScsXG5cdFx0XHRcdGxhYmVsOiBzZXR0aW5nSW5PdGhlck1vZGVsID8gbmxzLmxvY2FsaXplKCdyZXBsYWNlRGVmYXVsdFZhbHVlJywgXCJSZXBsYWNlIGluIFNldHRpbmdzXCIpIDogbmxzLmxvY2FsaXplKCdjb3B5RGVmYXVsdFZhbHVlJywgXCJDb3B5IHRvIFNldHRpbmdzXCIpLFxuXHRcdFx0XHR0b29sdGlwOiBzZXR0aW5nSW5PdGhlck1vZGVsID8gbmxzLmxvY2FsaXplKCdyZXBsYWNlRGVmYXVsdFZhbHVlJywgXCJSZXBsYWNlIGluIFNldHRpbmdzXCIpIDogbmxzLmxvY2FsaXplKCdjb3B5RGVmYXVsdFZhbHVlJywgXCJDb3B5IHRvIFNldHRpbmdzXCIpLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMudXBkYXRlU2V0dGluZyhzZXR0aW5nLmtleSwgc2V0dGluZy52YWx1ZSwgc2V0dGluZyksXG5cdFx0XHRcdGNsYXNzOiB1bmRlZmluZWRcblx0XHRcdH1dO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNldHRpbmcoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCBzb3VyY2U6IElJbmRleGVkU2V0dGluZyk6IHZvaWQge1xuXHRcdHRoaXMuX29uVXBkYXRlU2V0dGluZy5maXJlKHsga2V5LCB2YWx1ZSwgc291cmNlIH0pO1xuXHR9XG59XG5cbmNsYXNzIFNldHRpbmdIaWdobGlnaHRlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgZml4ZWRIaWdobGlnaHRlcjogUmFuZ2VIaWdobGlnaHREZWNvcmF0aW9ucztcblx0cHJpdmF0ZSB2b2xhdGlsZUhpZ2hsaWdodGVyOiBSYW5nZUhpZ2hsaWdodERlY29yYXRpb25zO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgZWRpdG9yOiBJQ29kZUVkaXRvciwgQElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLmZpeGVkSGlnaGxpZ2h0ZXIgPSB0aGlzLl9yZWdpc3RlcihpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSYW5nZUhpZ2hsaWdodERlY29yYXRpb25zKSk7XG5cdFx0dGhpcy52b2xhdGlsZUhpZ2hsaWdodGVyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmFuZ2VIaWdobGlnaHREZWNvcmF0aW9ucykpO1xuXHR9XG5cblx0aGlnaGxpZ2h0KHNldHRpbmc6IElTZXR0aW5nLCBmaXg6IGJvb2xlYW4gPSBmYWxzZSkge1xuXHRcdHRoaXMudm9sYXRpbGVIaWdobGlnaHRlci5yZW1vdmVIaWdobGlnaHRSYW5nZSgpO1xuXHRcdHRoaXMuZml4ZWRIaWdobGlnaHRlci5yZW1vdmVIaWdobGlnaHRSYW5nZSgpO1xuXG5cdFx0Y29uc3QgaGlnaGxpZ2h0ZXIgPSBmaXggPyB0aGlzLmZpeGVkSGlnaGxpZ2h0ZXIgOiB0aGlzLnZvbGF0aWxlSGlnaGxpZ2h0ZXI7XG5cdFx0aGlnaGxpZ2h0ZXIuaGlnaGxpZ2h0UmFuZ2Uoe1xuXHRcdFx0cmFuZ2U6IHNldHRpbmcudmFsdWVSYW5nZSxcblx0XHRcdHJlc291cmNlOiB0aGlzLmVkaXRvci5nZXRNb2RlbCgpIS51cmlcblx0XHR9LCB0aGlzLmVkaXRvcik7XG5cblx0XHR0aGlzLmVkaXRvci5yZXZlYWxMaW5lSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChzZXR0aW5nLnZhbHVlUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBlZGl0b3JDb21tb24uU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHR9XG5cblx0Y2xlYXIoZml4OiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHR0aGlzLnZvbGF0aWxlSGlnaGxpZ2h0ZXIucmVtb3ZlSGlnaGxpZ2h0UmFuZ2UoKTtcblx0XHRpZiAoZml4KSB7XG5cdFx0XHR0aGlzLmZpeGVkSGlnaGxpZ2h0ZXIucmVtb3ZlSGlnaGxpZ2h0UmFuZ2UoKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgVW5zdXBwb3J0ZWRTZXR0aW5nc1JlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIGxhbmd1YWdlcy5Db2RlQWN0aW9uUHJvdmlkZXIge1xuXG5cdHByaXZhdGUgcmVuZGVyaW5nRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KDIwMCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY29kZUFjdGlvbnMgPSBuZXcgUmVzb3VyY2VNYXA8W1JhbmdlLCBsYW5ndWFnZXMuQ29kZUFjdGlvbltdXVtdPih1cmkgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmdldENvbXBhcmlzb25LZXkodXJpKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2V0dGluZ3NFZGl0b3JNb2RlbDogU2V0dGluZ3NFZGl0b3JNb2RlbCxcblx0XHRASU1hcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSxcblx0XHRASVVyaUlkZW50aXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdXNlckRhdGFQcm9maWxlU2VydmljZTogSVVzZXJEYXRhUHJvZmlsZVNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVByb2ZpbGVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3IuZ2V0TW9kZWwoKSEub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IHRoaXMuZGVsYXllZFJlbmRlcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZmlsdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uLCBlID0+IGUuc291cmNlID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LkRFRkFVTFQpKCgpID0+IHRoaXMuZGVsYXllZFJlbmRlcigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuY29kZUFjdGlvblByb3ZpZGVyLnJlZ2lzdGVyKHsgcGF0dGVybjogc2V0dGluZ3NFZGl0b3JNb2RlbC51cmkucGF0aCB9LCB0aGlzKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodXNlckRhdGFQcm9maWxlU2VydmljZS5vbkRpZENoYW5nZUN1cnJlbnRQcm9maWxlKCgpID0+IHRoaXMuZGVsYXllZFJlbmRlcigpKSk7XG5cdH1cblxuXHRwcml2YXRlIGRlbGF5ZWRSZW5kZXIoKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJpbmdEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy5yZW5kZXIoKSk7XG5cdH1cblxuXHRwdWJsaWMgcmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuY29kZUFjdGlvbnMuY2xlYXIoKTtcblx0XHRjb25zdCBtYXJrZXJEYXRhOiBJTWFya2VyRGF0YVtdID0gdGhpcy5nZW5lcmF0ZU1hcmtlckRhdGEoKTtcblx0XHRpZiAobWFya2VyRGF0YS5sZW5ndGgpIHtcblx0XHRcdHRoaXMubWFya2VyU2VydmljZS5jaGFuZ2VPbmUoJ1Vuc3VwcG9ydGVkU2V0dGluZ3NSZW5kZXJlcicsIHRoaXMuc2V0dGluZ3NFZGl0b3JNb2RlbC51cmksIG1hcmtlckRhdGEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLm1hcmtlclNlcnZpY2UucmVtb3ZlKCdVbnN1cHBvcnRlZFNldHRpbmdzUmVuZGVyZXInLCBbdGhpcy5zZXR0aW5nc0VkaXRvck1vZGVsLnVyaV0pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVDb2RlQWN0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2U6IFJhbmdlIHwgU2VsZWN0aW9uLCBjb250ZXh0OiBsYW5ndWFnZXMuQ29kZUFjdGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkNvZGVBY3Rpb25MaXN0PiB7XG5cdFx0Y29uc3QgYWN0aW9uczogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGNvZGVBY3Rpb25zQnlSYW5nZSA9IHRoaXMuY29kZUFjdGlvbnMuZ2V0KG1vZGVsLnVyaSk7XG5cdFx0aWYgKGNvZGVBY3Rpb25zQnlSYW5nZSkge1xuXHRcdFx0Zm9yIChjb25zdCBbY29kZUFjdGlvbnNSYW5nZSwgY29kZUFjdGlvbnNdIG9mIGNvZGVBY3Rpb25zQnlSYW5nZSkge1xuXHRcdFx0XHRpZiAoY29kZUFjdGlvbnNSYW5nZS5jb250YWluc1JhbmdlKHJhbmdlKSkge1xuXHRcdFx0XHRcdGFjdGlvbnMucHVzaCguLi5jb2RlQWN0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFjdGlvbnMsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZW5lcmF0ZU1hcmtlckRhdGEoKTogSU1hcmtlckRhdGFbXSB7XG5cdFx0Y29uc3QgbWFya2VyRGF0YTogSU1hcmtlckRhdGFbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ3VyYXRpb25FeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cdFx0Zm9yIChjb25zdCBzZXR0aW5nc0dyb3VwIG9mIHRoaXMuc2V0dGluZ3NFZGl0b3JNb2RlbC5zZXR0aW5nc0dyb3Vwcykge1xuXHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIHNldHRpbmdzR3JvdXAuc2VjdGlvbnMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHNlY3Rpb24uc2V0dGluZ3MpIHtcblx0XHRcdFx0XHRpZiAoT1ZFUlJJREVfUFJPUEVSVFlfUkVHRVgudGVzdChzZXR0aW5nLmtleSkpIHtcblx0XHRcdFx0XHRcdGlmIChzZXR0aW5nLm92ZXJyaWRlcykge1xuXHRcdFx0XHRcdFx0XHR0aGlzLmhhbmRsZU92ZXJyaWRlcyhzZXR0aW5nLm92ZXJyaWRlcywgY29uZmlndXJhdGlvblJlZ2lzdHJ5LCBtYXJrZXJEYXRhKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gY29uZmlndXJhdGlvblJlZ2lzdHJ5W3NldHRpbmcua2V5XTtcblx0XHRcdFx0XHRpZiAoY29uZmlndXJhdGlvbikge1xuXHRcdFx0XHRcdFx0dGhpcy5oYW5kbGVVbnN0YWJsZVNldHRpbmdDb25maWd1cmF0aW9uKHNldHRpbmcsIGNvbmZpZ3VyYXRpb24sIG1hcmtlckRhdGEpO1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuaGFuZGxlUG9saWN5Q29uZmlndXJhdGlvbihzZXR0aW5nLCBjb25maWd1cmF0aW9uLCBtYXJrZXJEYXRhKSkge1xuXHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHN3aXRjaCAodGhpcy5zZXR0aW5nc0VkaXRvck1vZGVsLmNvbmZpZ3VyYXRpb25UYXJnZXQpIHtcblx0XHRcdFx0XHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUw6XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5oYW5kbGVMb2NhbFVzZXJDb25maWd1cmF0aW9uKHNldHRpbmcsIGNvbmZpZ3VyYXRpb24sIG1hcmtlckRhdGEpO1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEU6XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5oYW5kbGVSZW1vdGVVc2VyQ29uZmlndXJhdGlvbihzZXR0aW5nLCBjb25maWd1cmF0aW9uLCBtYXJrZXJEYXRhKTtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTpcblx0XHRcdFx0XHRcdFx0XHR0aGlzLmhhbmRsZVdvcmtzcGFjZUNvbmZpZ3VyYXRpb24oc2V0dGluZywgY29uZmlndXJhdGlvbiwgbWFya2VyRGF0YSk7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSOlxuXHRcdFx0XHRcdFx0XHRcdHRoaXMuaGFuZGxlV29ya3NwYWNlRm9sZGVyQ29uZmlndXJhdGlvbihzZXR0aW5nLCBjb25maWd1cmF0aW9uLCBtYXJrZXJEYXRhKTtcblx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bWFya2VyRGF0YS5wdXNoKHRoaXMuZ2VuZXJhdGVVbmtub3duQ29uZmlndXJhdGlvbk1hcmtlcihzZXR0aW5nKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBtYXJrZXJEYXRhO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVQb2xpY3lDb25maWd1cmF0aW9uKHNldHRpbmc6IElTZXR0aW5nLCBjb25maWd1cmF0aW9uOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hLCBtYXJrZXJEYXRhOiBJTWFya2VyRGF0YVtdKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFjb25maWd1cmF0aW9uLnBvbGljeSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KHNldHRpbmcua2V5KS5wb2xpY3lWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnNldHRpbmdzRWRpdG9yTW9kZWwuY29uZmlndXJhdGlvblRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5ERUZBVUxUKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdG1hcmtlckRhdGEucHVzaCh7XG5cdFx0XHRzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuSGludCxcblx0XHRcdHRhZ3M6IFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldLFxuXHRcdFx0Li4uc2V0dGluZy5yYW5nZSxcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndW5zdXBwb3J0ZWRQb2xpY3lTZXR0aW5nJywgXCJUaGlzIHNldHRpbmcgY2Fubm90IGJlIGFwcGxpZWQgYmVjYXVzZSBpdCBpcyBjb25maWd1cmVkIGluIHRoZSBzeXN0ZW0gcG9saWN5LlwiKVxuXHRcdH0pO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVPdmVycmlkZXMob3ZlcnJpZGVzOiBJU2V0dGluZ1tdLCBjb25maWd1cmF0aW9uUmVnaXN0cnk6IElTdHJpbmdEaWN0aW9uYXJ5PElSZWdpc3RlcmVkQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hPiwgbWFya2VyRGF0YTogSU1hcmtlckRhdGFbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgc2V0dGluZyBvZiBvdmVycmlkZXMgfHwgW10pIHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSBjb25maWd1cmF0aW9uUmVnaXN0cnlbc2V0dGluZy5rZXldO1xuXHRcdFx0aWYgKGNvbmZpZ3VyYXRpb24pIHtcblx0XHRcdFx0aWYgKGNvbmZpZ3VyYXRpb24uc2NvcGUgIT09IENvbmZpZ3VyYXRpb25TY29wZS5MQU5HVUFHRV9PVkVSUklEQUJMRSkge1xuXHRcdFx0XHRcdG1hcmtlckRhdGEucHVzaCh7XG5cdFx0XHRcdFx0XHRzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuSGludCxcblx0XHRcdFx0XHRcdHRhZ3M6IFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldLFxuXHRcdFx0XHRcdFx0Li4uc2V0dGluZy5yYW5nZSxcblx0XHRcdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndW5zdXBwb3J0TGFuZ3VhZ2VPdmVycmlkZVNldHRpbmcnLCBcIlRoaXMgc2V0dGluZyBjYW5ub3QgYmUgYXBwbGllZCBiZWNhdXNlIGl0IGlzIG5vdCByZWdpc3RlcmVkIGFzIGxhbmd1YWdlIG92ZXJyaWRlIHNldHRpbmcuXCIpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1hcmtlckRhdGEucHVzaCh0aGlzLmdlbmVyYXRlVW5rbm93bkNvbmZpZ3VyYXRpb25NYXJrZXIoc2V0dGluZykpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlTG9jYWxVc2VyQ29uZmlndXJhdGlvbihzZXR0aW5nOiBJU2V0dGluZywgY29uZmlndXJhdGlvbjogSUNvbmZpZ3VyYXRpb25Qcm9wZXJ0eVNjaGVtYSwgbWFya2VyRGF0YTogSU1hcmtlckRhdGFbXSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLmlzRGVmYXVsdCAmJiAhdGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLnVzZURlZmF1bHRGbGFncz8uc2V0dGluZ3MpIHtcblx0XHRcdGlmIChpc0VxdWFsKHRoaXMudXNlckRhdGFQcm9maWxlc1NlcnZpY2UuZGVmYXVsdFByb2ZpbGUuc2V0dGluZ3NSZXNvdXJjZSwgdGhpcy5zZXR0aW5nc0VkaXRvck1vZGVsLnVyaSkgJiYgIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaXNTZXR0aW5nQXBwbGllZEZvckFsbFByb2ZpbGVzKHNldHRpbmcua2V5KSkge1xuXHRcdFx0XHQvLyBJZiB3ZSdyZSBpbiB0aGUgZGVmYXVsdCBwcm9maWxlIHNldHRpbmcgZmlsZSwgYW5kIHRoZSBzZXR0aW5nIGNhbm5vdCBiZSBhcHBsaWVkIGluIGFsbCBwcm9maWxlc1xuXHRcdFx0XHRtYXJrZXJEYXRhLnB1c2goe1xuXHRcdFx0XHRcdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5IaW50LFxuXHRcdFx0XHRcdHRhZ3M6IFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldLFxuXHRcdFx0XHRcdC4uLnNldHRpbmcucmFuZ2UsXG5cdFx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdkZWZhdWx0UHJvZmlsZVNldHRpbmdXaGlsZU5vbkRlZmF1bHRBY3RpdmUnLCBcIlRoaXMgc2V0dGluZyBjYW5ub3QgYmUgYXBwbGllZCB3aGlsZSBhIG5vbi1kZWZhdWx0IHByb2ZpbGUgaXMgYWN0aXZlLiBJdCB3aWxsIGJlIGFwcGxpZWQgd2hlbiB0aGUgZGVmYXVsdCBwcm9maWxlIGlzIGFjdGl2ZS5cIilcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzRXF1YWwodGhpcy51c2VyRGF0YVByb2ZpbGVTZXJ2aWNlLmN1cnJlbnRQcm9maWxlLnNldHRpbmdzUmVzb3VyY2UsIHRoaXMuc2V0dGluZ3NFZGl0b3JNb2RlbC51cmkpKSB7XG5cdFx0XHRcdGlmIChjb25maWd1cmF0aW9uLnNjb3BlICYmIEFQUExJQ0FUSU9OX1NDT1BFUy5pbmNsdWRlcyhjb25maWd1cmF0aW9uLnNjb3BlKSkge1xuXHRcdFx0XHRcdC8vIElmIHdlJ3JlIGluIGEgcHJvZmlsZSBzZXR0aW5nIGZpbGUsIGFuZCB0aGUgc2V0dGluZyBpcyBhcHBsaWNhdGlvbi1zY29wZWQsIGZhZGUgaXQgb3V0LlxuXHRcdFx0XHRcdG1hcmtlckRhdGEucHVzaCh0aGlzLmdlbmVyYXRlVW5zdXBwb3J0ZWRBcHBsaWNhdGlvblNldHRpbmdNYXJrZXIoc2V0dGluZykpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuaXNTZXR0aW5nQXBwbGllZEZvckFsbFByb2ZpbGVzKHNldHRpbmcua2V5KSkge1xuXHRcdFx0XHRcdC8vIElmIHdlJ3JlIGluIHRoZSBub24tZGVmYXVsdCBwcm9maWxlIHNldHRpbmcgZmlsZSwgYW5kIHRoZSBzZXR0aW5nIGNhbiBiZSBhcHBsaWVkIGluIGFsbCBwcm9maWxlcywgZmFkZSBpdCBvdXQuXG5cdFx0XHRcdFx0bWFya2VyRGF0YS5wdXNoKHtcblx0XHRcdFx0XHRcdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5IaW50LFxuXHRcdFx0XHRcdFx0dGFnczogW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0sXG5cdFx0XHRcdFx0XHQuLi5zZXR0aW5nLnJhbmdlLFxuXHRcdFx0XHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCdhbGxQcm9maWxlU2V0dGluZ1doaWxlSW5Ob25EZWZhdWx0UHJvZmlsZVNldHRpbmcnLCBcIlRoaXMgc2V0dGluZyBjYW5ub3QgYmUgYXBwbGllZCBiZWNhdXNlIGl0IGlzIGNvbmZpZ3VyZWQgdG8gYmUgYXBwbGllZCBpbiBhbGwgcHJvZmlsZXMgdXNpbmcgc2V0dGluZyB7MH0uIFZhbHVlIGZyb20gdGhlIGRlZmF1bHQgcHJvZmlsZSB3aWxsIGJlIHVzZWQgaW5zdGVhZC5cIiwgQVBQTFlfQUxMX1BST0ZJTEVTX1NFVFRJTkcpXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSAmJiAoY29uZmlndXJhdGlvbi5zY29wZSA9PT0gQ29uZmlndXJhdGlvblNjb3BlLk1BQ0hJTkUgfHwgY29uZmlndXJhdGlvbi5zY29wZSA9PT0gQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OX01BQ0hJTkUgfHwgY29uZmlndXJhdGlvbi5zY29wZSA9PT0gQ29uZmlndXJhdGlvblNjb3BlLk1BQ0hJTkVfT1ZFUlJJREFCTEUpKSB7XG5cdFx0XHRtYXJrZXJEYXRhLnB1c2goe1xuXHRcdFx0XHRzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuSGludCxcblx0XHRcdFx0dGFnczogW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0sXG5cdFx0XHRcdC4uLnNldHRpbmcucmFuZ2UsXG5cdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndW5zdXBwb3J0ZWRSZW1vdGVNYWNoaW5lU2V0dGluZycsIFwiVGhpcyBzZXR0aW5nIGNhbm5vdCBiZSBhcHBsaWVkIGluIHRoaXMgd2luZG93LiBJdCB3aWxsIGJlIGFwcGxpZWQgd2hlbiB5b3Ugb3BlbiBhIGxvY2FsIHdpbmRvdy5cIilcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlUmVtb3RlVXNlckNvbmZpZ3VyYXRpb24oc2V0dGluZzogSVNldHRpbmcsIGNvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEsIG1hcmtlckRhdGE6IElNYXJrZXJEYXRhW10pOiB2b2lkIHtcblx0XHRpZiAoY29uZmlndXJhdGlvbi5zY29wZSA9PT0gQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OKSB7XG5cdFx0XHRtYXJrZXJEYXRhLnB1c2godGhpcy5nZW5lcmF0ZVVuc3VwcG9ydGVkQXBwbGljYXRpb25TZXR0aW5nTWFya2VyKHNldHRpbmcpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVdvcmtzcGFjZUNvbmZpZ3VyYXRpb24oc2V0dGluZzogSVNldHRpbmcsIGNvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEsIG1hcmtlckRhdGE6IElNYXJrZXJEYXRhW10pOiB2b2lkIHtcblx0XHRpZiAoY29uZmlndXJhdGlvbi5zY29wZSAmJiBBUFBMSUNBVElPTl9TQ09QRVMuaW5jbHVkZXMoY29uZmlndXJhdGlvbi5zY29wZSkpIHtcblx0XHRcdG1hcmtlckRhdGEucHVzaCh0aGlzLmdlbmVyYXRlVW5zdXBwb3J0ZWRBcHBsaWNhdGlvblNldHRpbmdNYXJrZXIoc2V0dGluZykpO1xuXHRcdH1cblxuXHRcdGlmIChjb25maWd1cmF0aW9uLnNjb3BlID09PSBDb25maWd1cmF0aW9uU2NvcGUuTUFDSElORSkge1xuXHRcdFx0bWFya2VyRGF0YS5wdXNoKHRoaXMuZ2VuZXJhdGVVbnN1cHBvcnRlZE1hY2hpbmVTZXR0aW5nTWFya2VyKHNldHRpbmcpKTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSAmJiBjb25maWd1cmF0aW9uLnJlc3RyaWN0ZWQpIHtcblx0XHRcdGNvbnN0IG1hcmtlciA9IHRoaXMuZ2VuZXJhdGVVbnRydXN0ZWRTZXR0aW5nTWFya2VyKHNldHRpbmcpO1xuXHRcdFx0bWFya2VyRGF0YS5wdXNoKG1hcmtlcik7XG5cdFx0XHRjb25zdCBjb2RlQWN0aW9ucyA9IHRoaXMuZ2VuZXJhdGVVbnRydXN0ZWRTZXR0aW5nQ29kZUFjdGlvbnMoW21hcmtlcl0pO1xuXHRcdFx0dGhpcy5hZGRDb2RlQWN0aW9ucyhtYXJrZXIsIGNvZGVBY3Rpb25zKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVdvcmtzcGFjZUZvbGRlckNvbmZpZ3VyYXRpb24oc2V0dGluZzogSVNldHRpbmcsIGNvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uUHJvcGVydHlTY2hlbWEsIG1hcmtlckRhdGE6IElNYXJrZXJEYXRhW10pOiB2b2lkIHtcblx0XHRpZiAoY29uZmlndXJhdGlvbi5zY29wZSAmJiBBUFBMSUNBVElPTl9TQ09QRVMuaW5jbHVkZXMoY29uZmlndXJhdGlvbi5zY29wZSkpIHtcblx0XHRcdG1hcmtlckRhdGEucHVzaCh0aGlzLmdlbmVyYXRlVW5zdXBwb3J0ZWRBcHBsaWNhdGlvblNldHRpbmdNYXJrZXIoc2V0dGluZykpO1xuXHRcdH1cblxuXHRcdGlmIChjb25maWd1cmF0aW9uLnNjb3BlID09PSBDb25maWd1cmF0aW9uU2NvcGUuTUFDSElORSkge1xuXHRcdFx0bWFya2VyRGF0YS5wdXNoKHRoaXMuZ2VuZXJhdGVVbnN1cHBvcnRlZE1hY2hpbmVTZXR0aW5nTWFya2VyKHNldHRpbmcpKTtcblx0XHR9XG5cblx0XHRpZiAoY29uZmlndXJhdGlvbi5zY29wZSA9PT0gQ29uZmlndXJhdGlvblNjb3BlLldJTkRPVykge1xuXHRcdFx0bWFya2VyRGF0YS5wdXNoKHtcblx0XHRcdFx0c2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkhpbnQsXG5cdFx0XHRcdHRhZ3M6IFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldLFxuXHRcdFx0XHQuLi5zZXR0aW5nLnJhbmdlLFxuXHRcdFx0XHRtZXNzYWdlOiBubHMubG9jYWxpemUoJ3Vuc3VwcG9ydGVkV2luZG93U2V0dGluZycsIFwiVGhpcyBzZXR0aW5nIGNhbm5vdCBiZSBhcHBsaWVkIGluIHRoaXMgd29ya3NwYWNlLiBJdCB3aWxsIGJlIGFwcGxpZWQgd2hlbiB5b3Ugb3BlbiB0aGUgY29udGFpbmluZyB3b3Jrc3BhY2UgZm9sZGVyIGRpcmVjdGx5LlwiKVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkgJiYgY29uZmlndXJhdGlvbi5yZXN0cmljdGVkKSB7XG5cdFx0XHRjb25zdCBtYXJrZXIgPSB0aGlzLmdlbmVyYXRlVW50cnVzdGVkU2V0dGluZ01hcmtlcihzZXR0aW5nKTtcblx0XHRcdG1hcmtlckRhdGEucHVzaChtYXJrZXIpO1xuXHRcdFx0Y29uc3QgY29kZUFjdGlvbnMgPSB0aGlzLmdlbmVyYXRlVW50cnVzdGVkU2V0dGluZ0NvZGVBY3Rpb25zKFttYXJrZXJdKTtcblx0XHRcdHRoaXMuYWRkQ29kZUFjdGlvbnMobWFya2VyLCBjb2RlQWN0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVVbnN0YWJsZVNldHRpbmdDb25maWd1cmF0aW9uKHNldHRpbmc6IElTZXR0aW5nLCBjb25maWd1cmF0aW9uOiBJQ29uZmlndXJhdGlvblByb3BlcnR5U2NoZW1hLCBtYXJrZXJEYXRhOiBJTWFya2VyRGF0YVtdKTogdm9pZCB7XG5cdFx0aWYgKGNvbmZpZ3VyYXRpb24udGFncz8uaW5jbHVkZXMoJ3ByZXZpZXcnKSkge1xuXHRcdFx0bWFya2VyRGF0YS5wdXNoKHRoaXMuZ2VuZXJhdGVQcmV2aWV3U2V0dGluZ01hcmtlcihzZXR0aW5nKSk7XG5cdFx0fSBlbHNlIGlmIChjb25maWd1cmF0aW9uLnRhZ3M/LmluY2x1ZGVzKCdleHBlcmltZW50YWwnKSkge1xuXHRcdFx0bWFya2VyRGF0YS5wdXNoKHRoaXMuZ2VuZXJhdGVFeHBlcmltZW50YWxTZXR0aW5nTWFya2VyKHNldHRpbmcpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdlbmVyYXRlVW5zdXBwb3J0ZWRBcHBsaWNhdGlvblNldHRpbmdNYXJrZXIoc2V0dGluZzogSVNldHRpbmcpOiBJTWFya2VyRGF0YSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5IaW50LFxuXHRcdFx0dGFnczogW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0sXG5cdFx0XHQuLi5zZXR0aW5nLnJhbmdlLFxuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd1bnN1cHBvcnRlZEFwcGxpY2F0aW9uU2V0dGluZycsIFwiVGhpcyBzZXR0aW5nIGhhcyBhbiBhcHBsaWNhdGlvbiBzY29wZSBhbmQgY2FuIG9ubHkgYmUgc2V0IGluIHRoZSBzZXR0aW5ncyBmaWxlIGZyb20gdGhlIERlZmF1bHQgcHJvZmlsZS5cIilcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZW5lcmF0ZVVuc3VwcG9ydGVkTWFjaGluZVNldHRpbmdNYXJrZXIoc2V0dGluZzogSVNldHRpbmcpOiBJTWFya2VyRGF0YSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5IaW50LFxuXHRcdFx0dGFnczogW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0sXG5cdFx0XHQuLi5zZXR0aW5nLnJhbmdlLFxuXHRcdFx0bWVzc2FnZTogbmxzLmxvY2FsaXplKCd1bnN1cHBvcnRlZE1hY2hpbmVTZXR0aW5nJywgXCJUaGlzIHNldHRpbmcgY2FuIG9ubHkgYmUgYXBwbGllZCBpbiB1c2VyIHNldHRpbmdzIGluIGxvY2FsIHdpbmRvdyBvciBpbiByZW1vdGUgc2V0dGluZ3MgaW4gcmVtb3RlIHdpbmRvdy5cIilcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZW5lcmF0ZVVudHJ1c3RlZFNldHRpbmdNYXJrZXIoc2V0dGluZzogSVNldHRpbmcpOiBJTWFya2VyRGF0YSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0Li4uc2V0dGluZy5yYW5nZSxcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndW50cnVzdGVkU2V0dGluZycsIFwiVGhpcyBzZXR0aW5nIGNhbiBvbmx5IGJlIGFwcGxpZWQgaW4gYSB0cnVzdGVkIHdvcmtzcGFjZS5cIilcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZW5lcmF0ZVVua25vd25Db25maWd1cmF0aW9uTWFya2VyKHNldHRpbmc6IElTZXR0aW5nKTogSU1hcmtlckRhdGEge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuSGludCxcblx0XHRcdHRhZ3M6IFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldLFxuXHRcdFx0Li4uc2V0dGluZy5yYW5nZSxcblx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndW5rbm93biBjb25maWd1cmF0aW9uIHNldHRpbmcnLCBcIlVua25vd24gQ29uZmlndXJhdGlvbiBTZXR0aW5nXCIpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2VuZXJhdGVVbnRydXN0ZWRTZXR0aW5nQ29kZUFjdGlvbnMoZGlhZ25vc3RpY3M6IElNYXJrZXJEYXRhW10pOiBsYW5ndWFnZXMuQ29kZUFjdGlvbltdIHtcblx0XHRyZXR1cm4gW3tcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ21hbmFnZSB3b3Jrc3BhY2UgdHJ1c3QnLCBcIk1hbmFnZSBXb3Jrc3BhY2UgVHJ1c3RcIiksXG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLnRydXN0Lm1hbmFnZScsXG5cdFx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ21hbmFnZSB3b3Jrc3BhY2UgdHJ1c3QnLCBcIk1hbmFnZSBXb3Jrc3BhY2UgVHJ1c3RcIilcblx0XHRcdH0sXG5cdFx0XHRkaWFnbm9zdGljcyxcblx0XHRcdGtpbmQ6IENvZGVBY3Rpb25LaW5kLlF1aWNrRml4LnZhbHVlXG5cdFx0fV07XG5cdH1cblxuXHRwcml2YXRlIGdlbmVyYXRlUHJldmlld1NldHRpbmdNYXJrZXIoc2V0dGluZzogSVNldHRpbmcpOiBJTWFya2VyRGF0YSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5IaW50LFxuXHRcdFx0Li4uc2V0dGluZy5yYW5nZSxcblx0XHRcdG1lc3NhZ2U6IFBSRVZJRVdfSU5ESUNBVE9SX0RFU0NSSVBUSU9OXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgZ2VuZXJhdGVFeHBlcmltZW50YWxTZXR0aW5nTWFya2VyKHNldHRpbmc6IElTZXR0aW5nKTogSU1hcmtlckRhdGEge1xuXHRcdHJldHVybiB7XG5cdFx0XHRzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuSGludCxcblx0XHRcdC4uLnNldHRpbmcucmFuZ2UsXG5cdFx0XHRtZXNzYWdlOiBFWFBFUklNRU5UQUxfSU5ESUNBVE9SX0RFU0NSSVBUSU9OXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYWRkQ29kZUFjdGlvbnMocmFuZ2U6IElSYW5nZSwgY29kZUFjdGlvbnM6IGxhbmd1YWdlcy5Db2RlQWN0aW9uW10pOiB2b2lkIHtcblx0XHRsZXQgYWN0aW9ucyA9IHRoaXMuY29kZUFjdGlvbnMuZ2V0KHRoaXMuc2V0dGluZ3NFZGl0b3JNb2RlbC51cmkpO1xuXHRcdGlmICghYWN0aW9ucykge1xuXHRcdFx0YWN0aW9ucyA9IFtdO1xuXHRcdFx0dGhpcy5jb2RlQWN0aW9ucy5zZXQodGhpcy5zZXR0aW5nc0VkaXRvck1vZGVsLnVyaSwgYWN0aW9ucyk7XG5cdFx0fVxuXHRcdGFjdGlvbnMucHVzaChbUmFuZ2UubGlmdChyYW5nZSksIGNvZGVBY3Rpb25zXSk7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLm1hcmtlclNlcnZpY2UucmVtb3ZlKCdVbnN1cHBvcnRlZFNldHRpbmdzUmVuZGVyZXInLCBbdGhpcy5zZXR0aW5nc0VkaXRvck1vZGVsLnVyaV0pO1xuXHRcdHRoaXMuY29kZUFjdGlvbnMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxufVxuXG5jbGFzcyBNY3BTZXR0aW5nc1JlbmRlcmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIGxhbmd1YWdlcy5Db2RlQWN0aW9uUHJvdmlkZXIge1xuXG5cdHByaXZhdGUgcmVuZGVyaW5nRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KDIwMCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvZGVBY3Rpb25zID0gbmV3IFJlc291cmNlTWFwPFtSYW5nZSwgbGFuZ3VhZ2VzLkNvZGVBY3Rpb25bXV1bXT4odXJpID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5nZXRDb21wYXJpc29uS2V5KHVyaSkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNldHRpbmdzRWRpdG9yTW9kZWw6IFNldHRpbmdzRWRpdG9yTW9kZWwsXG5cdFx0QElNYXJrZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLmdldE1vZGVsKCkhLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB0aGlzLmRlbGF5ZWRSZW5kZXIoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmNvZGVBY3Rpb25Qcm92aWRlci5yZWdpc3Rlcih7IHBhdHRlcm46IHNldHRpbmdzRWRpdG9yTW9kZWwudXJpLnBhdGggfSwgdGhpcykpO1xuXHR9XG5cblx0cHJpdmF0ZSBkZWxheWVkUmVuZGVyKCk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyaW5nRGVsYXllci50cmlnZ2VyKCgpID0+IHRoaXMucmVuZGVyKCkpO1xuXHR9XG5cblx0cHVibGljIHJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLmNvZGVBY3Rpb25zLmNsZWFyKCk7XG5cdFx0Y29uc3QgbWFya2VyRGF0YTogSU1hcmtlckRhdGFbXSA9IHRoaXMuZ2VuZXJhdGVNYXJrZXJEYXRhKCk7XG5cdFx0aWYgKG1hcmtlckRhdGEubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLm1hcmtlclNlcnZpY2UuY2hhbmdlT25lKCdNY3BTZXR0aW5nc1JlbmRlcmVyJywgdGhpcy5zZXR0aW5nc0VkaXRvck1vZGVsLnVyaSwgbWFya2VyRGF0YSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubWFya2VyU2VydmljZS5yZW1vdmUoJ01jcFNldHRpbmdzUmVuZGVyZXInLCBbdGhpcy5zZXR0aW5nc0VkaXRvck1vZGVsLnVyaV0pO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHByb3ZpZGVDb2RlQWN0aW9ucyhtb2RlbDogSVRleHRNb2RlbCwgcmFuZ2U6IFJhbmdlIHwgU2VsZWN0aW9uLCBjb250ZXh0OiBsYW5ndWFnZXMuQ29kZUFjdGlvbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8bGFuZ3VhZ2VzLkNvZGVBY3Rpb25MaXN0PiB7XG5cdFx0Y29uc3QgYWN0aW9uczogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25bXSA9IFtdO1xuXHRcdGNvbnN0IGNvZGVBY3Rpb25zQnlSYW5nZSA9IHRoaXMuY29kZUFjdGlvbnMuZ2V0KG1vZGVsLnVyaSk7XG5cdFx0aWYgKGNvZGVBY3Rpb25zQnlSYW5nZSkge1xuXHRcdFx0Zm9yIChjb25zdCBbY29kZUFjdGlvbnNSYW5nZSwgY29kZUFjdGlvbnNdIG9mIGNvZGVBY3Rpb25zQnlSYW5nZSkge1xuXHRcdFx0XHRpZiAoY29kZUFjdGlvbnNSYW5nZS5jb250YWluc1JhbmdlKHJhbmdlKSkge1xuXHRcdFx0XHRcdGFjdGlvbnMucHVzaCguLi5jb2RlQWN0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHtcblx0XHRcdGFjdGlvbnMsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH1cblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZW5lcmF0ZU1hcmtlckRhdGEoKTogSU1hcmtlckRhdGFbXSB7XG5cdFx0Y29uc3QgbWFya2VyRGF0YTogSU1hcmtlckRhdGFbXSA9IFtdO1xuXG5cdFx0Ly8gT25seSBjaGVjayBmb3IgTUNQIGNvbmZpZ3VyYXRpb24gaW4gdXNlciBsb2NhbCBhbmQgdXNlciByZW1vdGUgc2V0dGluZ3Ncblx0XHRpZiAodGhpcy5zZXR0aW5nc0VkaXRvck1vZGVsLmNvbmZpZ3VyYXRpb25UYXJnZXQgIT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCAmJlxuXHRcdFx0dGhpcy5zZXR0aW5nc0VkaXRvck1vZGVsLmNvbmZpZ3VyYXRpb25UYXJnZXQgIT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUpIHtcblx0XHRcdHJldHVybiBtYXJrZXJEYXRhO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc2V0dGluZ3NHcm91cCBvZiB0aGlzLnNldHRpbmdzRWRpdG9yTW9kZWwuc2V0dGluZ3NHcm91cHMpIHtcblx0XHRcdGZvciAoY29uc3Qgc2VjdGlvbiBvZiBzZXR0aW5nc0dyb3VwLnNlY3Rpb25zKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgc2V0dGluZyBvZiBzZWN0aW9uLnNldHRpbmdzKSB7XG5cdFx0XHRcdFx0aWYgKHNldHRpbmcua2V5ID09PSBtY3BDb25maWd1cmF0aW9uU2VjdGlvbikge1xuXHRcdFx0XHRcdFx0Y29uc3QgbWFya2VyID0gdGhpcy5nZW5lcmF0ZU1jcENvbmZpZ3VyYXRpb25NYXJrZXIoc2V0dGluZyk7XG5cdFx0XHRcdFx0XHRtYXJrZXJEYXRhLnB1c2gobWFya2VyKTtcblx0XHRcdFx0XHRcdGNvbnN0IGNvZGVBY3Rpb25zID0gdGhpcy5nZW5lcmF0ZU1jcENvbmZpZ3VyYXRpb25Db2RlQWN0aW9ucyhbbWFya2VyXSk7XG5cdFx0XHRcdFx0XHR0aGlzLmFkZENvZGVBY3Rpb25zKHNldHRpbmcucmFuZ2UsIGNvZGVBY3Rpb25zKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIG1hcmtlckRhdGE7XG5cdH1cblxuXHRwcml2YXRlIGdlbmVyYXRlTWNwQ29uZmlndXJhdGlvbk1hcmtlcihzZXR0aW5nOiBJU2V0dGluZyk6IElNYXJrZXJEYXRhIHtcblx0XHRjb25zdCBpc1JlbW90ZSA9IHRoaXMuc2V0dGluZ3NFZGl0b3JNb2RlbC5jb25maWd1cmF0aW9uVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfUkVNT1RFO1xuXHRcdGNvbnN0IG1lc3NhZ2UgPSBpc1JlbW90ZVxuXHRcdFx0PyBubHMubG9jYWxpemUoJ21jcC5yZW5kZXJlci5yZW1vdGVDb25maWdGb3VuZCcsICdNQ1Agc2VydmVycyBzaG91bGQgbm90IGJlIGNvbmZpZ3VyZWQgaW4gcmVtb3RlIHVzZXIgc2V0dGluZ3MuIFVzZSB0aGUgZGVkaWNhdGVkIE1DUCBjb25maWd1cmF0aW9uIGluc3RlYWQuJylcblx0XHRcdDogbmxzLmxvY2FsaXplKCdtY3AucmVuZGVyZXIudXNlckNvbmZpZ0ZvdW5kJywgJ01DUCBzZXJ2ZXJzIHNob3VsZCBub3QgYmUgY29uZmlndXJlZCBpbiB1c2VyIHNldHRpbmdzLiBVc2UgdGhlIGRlZGljYXRlZCBNQ1AgY29uZmlndXJhdGlvbiBpbnN0ZWFkLicpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0Li4uc2V0dGluZy5yYW5nZSxcblx0XHRcdG1lc3NhZ2Vcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZW5lcmF0ZU1jcENvbmZpZ3VyYXRpb25Db2RlQWN0aW9ucyhkaWFnbm9zdGljczogSU1hcmtlckRhdGFbXSk6IGxhbmd1YWdlcy5Db2RlQWN0aW9uW10ge1xuXHRcdGNvbnN0IGlzUmVtb3RlID0gdGhpcy5zZXR0aW5nc0VkaXRvck1vZGVsLmNvbmZpZ3VyYXRpb25UYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEU7XG5cdFx0Y29uc3Qgb3BlbkNvbmZpZ0xhYmVsID0gaXNSZW1vdGVcblx0XHRcdD8gbmxzLmxvY2FsaXplKCdtY3AucmVuZGVyZXIub3BlblJlbW90ZUNvbmZpZycsICdPcGVuIFJlbW90ZSBVc2VyIE1DUCBDb25maWd1cmF0aW9uJylcblx0XHRcdDogbmxzLmxvY2FsaXplKCdtY3AucmVuZGVyZXIub3BlblVzZXJDb25maWcnLCAnT3BlbiBVc2VyIE1DUCBDb25maWd1cmF0aW9uJyk7XG5cblx0XHRjb25zdCBjb21tYW5kSWQgPSBpc1JlbW90ZSA/IE1jcENvbW1hbmRJZHMuT3BlblJlbW90ZVVzZXJNY3AgOiBNY3BDb21tYW5kSWRzLk9wZW5Vc2VyTWNwO1xuXG5cdFx0cmV0dXJuIFt7XG5cdFx0XHR0aXRsZTogb3BlbkNvbmZpZ0xhYmVsLFxuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogY29tbWFuZElkLFxuXHRcdFx0XHR0aXRsZTogb3BlbkNvbmZpZ0xhYmVsXG5cdFx0XHR9LFxuXHRcdFx0ZGlhZ25vc3RpY3MsXG5cdFx0XHRraW5kOiBDb2RlQWN0aW9uS2luZC5RdWlja0ZpeC52YWx1ZVxuXHRcdH1dO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRDb2RlQWN0aW9ucyhyYW5nZTogSVJhbmdlLCBjb2RlQWN0aW9uczogbGFuZ3VhZ2VzLkNvZGVBY3Rpb25bXSk6IHZvaWQge1xuXHRcdGxldCBhY3Rpb25zID0gdGhpcy5jb2RlQWN0aW9ucy5nZXQodGhpcy5zZXR0aW5nc0VkaXRvck1vZGVsLnVyaSk7XG5cdFx0aWYgKCFhY3Rpb25zKSB7XG5cdFx0XHRhY3Rpb25zID0gW107XG5cdFx0XHR0aGlzLmNvZGVBY3Rpb25zLnNldCh0aGlzLnNldHRpbmdzRWRpdG9yTW9kZWwudXJpLCBhY3Rpb25zKTtcblx0XHR9XG5cdFx0YWN0aW9ucy5wdXNoKFtSYW5nZS5saWZ0KHJhbmdlKSwgY29kZUFjdGlvbnNdKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMubWFya2VyU2VydmljZS5yZW1vdmUoJ01jcFNldHRpbmdzUmVuZGVyZXInLCBbdGhpcy5zZXR0aW5nc0VkaXRvck1vZGVsLnVyaV0pO1xuXHRcdHRoaXMuY29kZUFjdGlvbnMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxufVxuXG5jbGFzcyBXb3Jrc3BhY2VDb25maWd1cmF0aW9uUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgc3VwcG9ydGVkS2V5cyA9IFsnZm9sZGVycycsICd0YXNrcycsICdsYXVuY2gnLCAnZXh0ZW5zaW9ucycsICdzZXR0aW5ncycsICdyZW1vdGVBdXRob3JpdHknLCAndHJhbnNpZW50J107XG5cblx0cHJpdmF0ZSByZWFkb25seSBkZWNvcmF0aW9uczogZWRpdG9yQ29tbW9uLklFZGl0b3JEZWNvcmF0aW9uc0NvbGxlY3Rpb247XG5cdHByaXZhdGUgcmVuZGVyaW5nRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KDIwMCkpO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgZWRpdG9yOiBJQ29kZUVkaXRvciwgcHJpdmF0ZSB3b3Jrc3BhY2VTZXR0aW5nc0VkaXRvck1vZGVsOiBTZXR0aW5nc0VkaXRvck1vZGVsLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJTWFya2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1hcmtlclNlcnZpY2U6IElNYXJrZXJTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5kZWNvcmF0aW9ucyA9IHRoaXMuZWRpdG9yLmNyZWF0ZURlY29yYXRpb25zQ29sbGVjdGlvbigpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLmdldE1vZGVsKCkhLm9uRGlkQ2hhbmdlQ29udGVudCgoKSA9PiB0aGlzLnJlbmRlcmluZ0RlbGF5ZXIudHJpZ2dlcigoKSA9PiB0aGlzLnJlbmRlcigpKSkpO1xuXHR9XG5cblx0cmVuZGVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IG1hcmtlckRhdGE6IElNYXJrZXJEYXRhW10gPSBbXTtcblx0XHRpZiAodGhpcy53b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3JrYmVuY2hTdGF0ZSgpID09PSBXb3JrYmVuY2hTdGF0ZS5XT1JLU1BBQ0UgJiYgdGhpcy53b3Jrc3BhY2VTZXR0aW5nc0VkaXRvck1vZGVsIGluc3RhbmNlb2YgV29ya3NwYWNlQ29uZmlndXJhdGlvbkVkaXRvck1vZGVsKSB7XG5cdFx0XHRjb25zdCByYW5nZXM6IElSYW5nZVtdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHNldHRpbmdzR3JvdXAgb2YgdGhpcy53b3Jrc3BhY2VTZXR0aW5nc0VkaXRvck1vZGVsLmNvbmZpZ3VyYXRpb25Hcm91cHMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIHNldHRpbmdzR3JvdXAuc2VjdGlvbnMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2Ygc2VjdGlvbi5zZXR0aW5ncykge1xuXHRcdFx0XHRcdFx0aWYgKCFXb3Jrc3BhY2VDb25maWd1cmF0aW9uUmVuZGVyZXIuc3VwcG9ydGVkS2V5cy5pbmNsdWRlcyhzZXR0aW5nLmtleSkpIHtcblx0XHRcdFx0XHRcdFx0bWFya2VyRGF0YS5wdXNoKHtcblx0XHRcdFx0XHRcdFx0XHRzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuSGludCxcblx0XHRcdFx0XHRcdFx0XHR0YWdzOiBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSxcblx0XHRcdFx0XHRcdFx0XHQuLi5zZXR0aW5nLnJhbmdlLFxuXHRcdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IG5scy5sb2NhbGl6ZSgndW5zdXBwb3J0ZWRQcm9wZXJ0eScsIFwiVW5zdXBwb3J0ZWQgUHJvcGVydHlcIilcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRlY29yYXRpb25zLnNldChyYW5nZXMubWFwKHJhbmdlID0+IHRoaXMuY3JlYXRlRGVjb3JhdGlvbihyYW5nZSkpKTtcblx0XHR9XG5cdFx0aWYgKG1hcmtlckRhdGEubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLm1hcmtlclNlcnZpY2UuY2hhbmdlT25lKCdXb3Jrc3BhY2VDb25maWd1cmF0aW9uUmVuZGVyZXInLCB0aGlzLndvcmtzcGFjZVNldHRpbmdzRWRpdG9yTW9kZWwudXJpLCBtYXJrZXJEYXRhKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5tYXJrZXJTZXJ2aWNlLnJlbW92ZSgnV29ya3NwYWNlQ29uZmlndXJhdGlvblJlbmRlcmVyJywgW3RoaXMud29ya3NwYWNlU2V0dGluZ3NFZGl0b3JNb2RlbC51cmldKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfRElNX0NPTkZJR1VSQVRJT05fID0gTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7XG5cdFx0ZGVzY3JpcHRpb246ICdkaW0tY29uZmlndXJhdGlvbicsXG5cdFx0c3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsXG5cdFx0aW5saW5lQ2xhc3NOYW1lOiAnZGltLWNvbmZpZ3VyYXRpb24nXG5cdH0pO1xuXG5cdHByaXZhdGUgY3JlYXRlRGVjb3JhdGlvbihyYW5nZTogSVJhbmdlKTogSU1vZGVsRGVsdGFEZWNvcmF0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmFuZ2UsXG5cdFx0XHRvcHRpb25zOiBXb3Jrc3BhY2VDb25maWd1cmF0aW9uUmVuZGVyZXIuX0RJTV9DT05GSUdVUkFUSU9OX1xuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMubWFya2VyU2VydmljZS5yZW1vdmUoJ1dvcmtzcGFjZUNvbmZpZ3VyYXRpb25SZW5kZXJlcicsIFt0aGlzLndvcmtzcGFjZVNldHRpbmdzRWRpdG9yTW9kZWwudXJpXSk7XG5cdFx0dGhpcy5kZWNvcmF0aW9ucy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGFBQWEsOEJBQThCO0FBQ3BELFNBQWtCLHFCQUFxQjtBQUN2QyxTQUFTLGVBQWU7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
