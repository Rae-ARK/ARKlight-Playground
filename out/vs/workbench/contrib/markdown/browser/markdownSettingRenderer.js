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
import { ActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { Schemas } from "../../../../base/common/network.js";
import * as nls from "../../../../nls.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { settingKeyToDisplayFormat } from "../../preferences/browser/settingsTreeModels.js";
let SimpleSettingRenderer = class {
  // setting ID to feature value
  constructor(_configurationService, _contextMenuService, _preferencesService, _telemetryService, _clipboardService) {
    this._configurationService = _configurationService;
    this._contextMenuService = _contextMenuService;
    this._preferencesService = _preferencesService;
    this._telemetryService = _telemetryService;
    this._clipboardService = _clipboardService;
    this._updatedSettings = /* @__PURE__ */ new Map();
    // setting ID to user's original setting value
    this._encounteredSettings = /* @__PURE__ */ new Map();
    // setting ID to setting
    this._featuredSettings = /* @__PURE__ */ new Map();
    this.codeSettingAnchorRegex = new RegExp(`^<a (href)=".*code.*://settings/([^\\s"]+)"(?:\\s*codesetting="([^"]+)")?>`);
    this.codeSettingSimpleRegex = new RegExp(`^setting\\(([^\\s:)]+)(?::([^)]+))?\\)$`);
  }
  get featuredSettingStates() {
    const result = /* @__PURE__ */ new Map();
    for (const [settingId, value] of this._featuredSettings) {
      result.set(settingId, this._configurationService.getValue(settingId) === value);
    }
    return result;
  }
  replaceAnchor(raw) {
    const match = this.codeSettingAnchorRegex.exec(raw);
    if (match && match.length === 4) {
      const settingId = match[2];
      const rendered = this.render(settingId, match[3]);
      if (rendered) {
        return raw.replace(this.codeSettingAnchorRegex, rendered);
      }
    }
    return void 0;
  }
  replaceSimple(raw) {
    const match = this.codeSettingSimpleRegex.exec(raw);
    if (match && match.length === 3) {
      const settingId = match[1];
      const rendered = this.render(settingId, match[2]);
      if (rendered) {
        return raw.replace(this.codeSettingSimpleRegex, rendered);
      }
    }
    return void 0;
  }
  getHtmlRenderer() {
    return ({ raw }) => {
      const replacedAnchor = this.replaceAnchor(raw);
      if (replacedAnchor) {
        raw = replacedAnchor;
      }
      return raw;
    };
  }
  getCodeSpanRenderer() {
    return ({ text }) => {
      const replacedSimple = this.replaceSimple(text);
      if (replacedSimple) {
        return replacedSimple;
      }
      return `<code>${text}</code>`;
    };
  }
  settingToUriString(settingId, value) {
    return `${Schemas.codeSetting}://${settingId}${value ? `/${value}` : ""}`;
  }
  getSetting(settingId) {
    if (this._encounteredSettings.has(settingId)) {
      return this._encounteredSettings.get(settingId);
    }
    return this._preferencesService.getSetting(settingId);
  }
  parseValue(settingId, value) {
    if (value === "undefined" || value === "") {
      return void 0;
    }
    const setting = this.getSetting(settingId);
    if (!setting) {
      return value;
    }
    switch (setting.type) {
      case "boolean":
        return value === "true";
      case "number":
        return parseInt(value, 10);
      case "string":
      default:
        return value;
    }
  }
  render(settingId, newValue) {
    const setting = this.getSetting(settingId);
    if (!setting) {
      return `<code>${settingId}</code>`;
    }
    return this.renderSetting(setting, newValue);
  }
  viewInSettingsMessage(settingId, alreadyDisplayed) {
    if (alreadyDisplayed) {
      return nls.localize("viewInSettings", "View in Settings");
    } else {
      const displayName = settingKeyToDisplayFormat(settingId);
      return nls.localize("viewInSettingsDetailed", 'View "{0}: {1}" in Settings', displayName.category, displayName.label);
    }
  }
  restorePreviousSettingMessage(settingId) {
    const displayName = settingKeyToDisplayFormat(settingId);
    return nls.localize("restorePreviousValue", 'Restore value of "{0}: {1}"', displayName.category, displayName.label);
  }
  isAlreadySet(setting, value) {
    const currentValue = this._configurationService.getValue(setting.key);
    return currentValue === value || currentValue === void 0 && setting.value === value;
  }
  booleanSettingMessage(setting, booleanValue) {
    const displayName = settingKeyToDisplayFormat(setting.key);
    if (this.isAlreadySet(setting, booleanValue)) {
      if (booleanValue) {
        return nls.localize("alreadysetBoolTrue", '"{0}: {1}" is already enabled', displayName.category, displayName.label);
      } else {
        return nls.localize("alreadysetBoolFalse", '"{0}: {1}" is already disabled', displayName.category, displayName.label);
      }
    }
    if (booleanValue) {
      return nls.localize("trueMessage", 'Enable "{0}: {1}"', displayName.category, displayName.label);
    } else {
      return nls.localize("falseMessage", 'Disable "{0}: {1}"', displayName.category, displayName.label);
    }
  }
  stringSettingMessage(setting, stringValue) {
    const displayName = settingKeyToDisplayFormat(setting.key);
    if (this.isAlreadySet(setting, stringValue)) {
      return nls.localize("alreadysetString", '"{0}: {1}" is already set to "{2}"', displayName.category, displayName.label, stringValue);
    }
    return nls.localize("stringValue", 'Set "{0}: {1}" to "{2}"', displayName.category, displayName.label, stringValue);
  }
  numberSettingMessage(setting, numberValue) {
    const displayName = settingKeyToDisplayFormat(setting.key);
    if (this.isAlreadySet(setting, numberValue)) {
      return nls.localize("alreadysetNum", '"{0}: {1}" is already set to {2}', displayName.category, displayName.label, numberValue);
    }
    return nls.localize("numberValue", 'Set "{0}: {1}" to {2}', displayName.category, displayName.label, numberValue);
  }
  renderSetting(setting, newValue) {
    const href = this.settingToUriString(setting.key, newValue);
    const title = nls.localize("changeSettingTitle", "View or change setting");
    return `<code tabindex="0"><a href="${href}" class="codesetting" title="${title}" aria-role="button"><svg width="14" height="14" viewBox="0 0 15 15" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M9.1 4.4L8.6 2H7.4l-.5 2.4-.7.3-2-1.3-.9.8 1.3 2-.2.7-2.4.5v1.2l2.4.5.3.8-1.3 2 .8.8 2-1.3.8.3.4 2.3h1.2l.5-2.4.8-.3 2 1.3.8-.8-1.3-2 .3-.8 2.3-.4V7.4l-2.4-.5-.3-.8 1.3-2-.8-.8-2 1.3-.7-.2zM9.4 1l.5 2.4L12 2.1l2 2-1.4 2.1 2.4.4v2.8l-2.4.5L14 12l-2 2-2.1-1.4-.5 2.4H6.6l-.5-2.4L4 13.9l-2-2 1.4-2.1L1 9.4V6.6l2.4-.5L2.1 4l2-2 2.1 1.4.4-2.4h2.8zm.6 7c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zM8 9c.6 0 1-.4 1-1s-.4-1-1-1-1 .4-1 1 .4 1 1 1z"/></svg>
			<span class="separator"></span>
			<span class="setting-name">${setting.key}</span>
		</a></code>`;
  }
  getSettingMessage(setting, newValue) {
    if (setting.type === "boolean") {
      return this.booleanSettingMessage(setting, newValue);
    } else if (setting.type === "string") {
      return this.stringSettingMessage(setting, newValue);
    } else if (setting.type === "number") {
      return this.numberSettingMessage(setting, newValue);
    }
    return void 0;
  }
  async restoreSetting(settingId) {
    const userOriginalSettingValue = this._updatedSettings.get(settingId);
    this._updatedSettings.delete(settingId);
    return this._configurationService.updateValue(settingId, userOriginalSettingValue, ConfigurationTarget.USER);
  }
  async setSetting(settingId, currentSettingValue, newSettingValue) {
    this._updatedSettings.set(settingId, currentSettingValue);
    return this._configurationService.updateValue(settingId, newSettingValue, ConfigurationTarget.USER);
  }
  getActions(uri) {
    if (uri.scheme !== Schemas.codeSetting) {
      return;
    }
    const actions = [];
    const settingId = uri.authority;
    const newSettingValue = this.parseValue(uri.authority, uri.path.substring(1));
    const currentSettingValue = this._configurationService.inspect(settingId).userValue;
    if (newSettingValue !== void 0 && newSettingValue === currentSettingValue && this._updatedSettings.has(settingId)) {
      const restoreMessage = this.restorePreviousSettingMessage(settingId);
      actions.push({
        class: void 0,
        id: "restoreSetting",
        enabled: true,
        tooltip: restoreMessage,
        label: restoreMessage,
        run: () => {
          return this.restoreSetting(settingId);
        }
      });
    } else if (newSettingValue !== void 0) {
      const setting = this.getSetting(settingId);
      const trySettingMessage = setting ? this.getSettingMessage(setting, newSettingValue) : void 0;
      if (setting && trySettingMessage) {
        actions.push({
          class: void 0,
          id: "trySetting",
          enabled: !this.isAlreadySet(setting, newSettingValue),
          tooltip: trySettingMessage,
          label: trySettingMessage,
          run: () => {
            this.setSetting(settingId, currentSettingValue, newSettingValue);
          }
        });
      }
    }
    const viewInSettingsMessage = this.viewInSettingsMessage(settingId, actions.length > 0);
    actions.push({
      class: void 0,
      enabled: true,
      id: "viewInSettings",
      tooltip: viewInSettingsMessage,
      label: viewInSettingsMessage,
      run: () => {
        return this._preferencesService.openApplicationSettings({ query: `@id:${settingId}` });
      }
    });
    actions.push({
      class: void 0,
      enabled: true,
      id: "copySettingId",
      tooltip: nls.localize("copySettingId", "Copy Setting ID"),
      label: nls.localize("copySettingId", "Copy Setting ID"),
      run: () => {
        this._clipboardService.writeText(settingId);
      }
    });
    return actions;
  }
  showContextMenu(uri, x, y) {
    const actions = this.getActions(uri);
    if (!actions) {
      return;
    }
    this._contextMenuService.showContextMenu({
      getAnchor: () => ({ x, y }),
      getActions: () => actions,
      getActionViewItem: (action) => {
        return new ActionViewItem(action, action, { label: true });
      }
    });
  }
  async updateSetting(uri, x, y) {
    if (uri.scheme === Schemas.codeSetting) {
      this._telemetryService.publicLog2("releaseNotesSettingAction", {
        settingId: uri.authority
      });
      return this.showContextMenu(uri, x, y);
    }
  }
};
SimpleSettingRenderer = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IContextMenuService),
  __decorateParam(2, IPreferencesService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IClipboardService)
], SimpleSettingRenderer);
export {
  SimpleSettingRenderer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25TZXR0aW5nUmVuZGVyZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uVmlld0l0ZW1zLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB0eXBlIHsgVG9rZW5zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFya2VkL21hcmtlZC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSwgSVNldHRpbmcgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgc2V0dGluZ0tleVRvRGlzcGxheUZvcm1hdCB9IGZyb20gJy4uLy4uL3ByZWZlcmVuY2VzL2Jyb3dzZXIvc2V0dGluZ3NUcmVlTW9kZWxzLmpzJztcblxuZXhwb3J0IGNsYXNzIFNpbXBsZVNldHRpbmdSZW5kZXJlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgY29kZVNldHRpbmdBbmNob3JSZWdleDogUmVnRXhwO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvZGVTZXR0aW5nU2ltcGxlUmVnZXg6IFJlZ0V4cDtcblxuXHRwcml2YXRlIF91cGRhdGVkU2V0dGluZ3MgPSBuZXcgTWFwPHN0cmluZywgdW5rbm93bj4oKTsgLy8gc2V0dGluZyBJRCB0byB1c2VyJ3Mgb3JpZ2luYWwgc2V0dGluZyB2YWx1ZVxuXHRwcml2YXRlIF9lbmNvdW50ZXJlZFNldHRpbmdzID0gbmV3IE1hcDxzdHJpbmcsIElTZXR0aW5nPigpOyAvLyBzZXR0aW5nIElEIHRvIHNldHRpbmdcblx0cHJpdmF0ZSBfZmVhdHVyZWRTZXR0aW5ncyA9IG5ldyBNYXA8c3RyaW5nLCB1bmtub3duPigpOyAvLyBzZXR0aW5nIElEIHRvIGZlYXR1cmUgdmFsdWVcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3ByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElDbGlwYm9hcmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NsaXBib2FyZFNlcnZpY2U6IElDbGlwYm9hcmRTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLmNvZGVTZXR0aW5nQW5jaG9yUmVnZXggPSBuZXcgUmVnRXhwKGBePGEgKGhyZWYpPVwiLipjb2RlLio6Ly9zZXR0aW5ncy8oW15cXFxcc1wiXSspXCIoPzpcXFxccypjb2Rlc2V0dGluZz1cIihbXlwiXSspXCIpPz5gKTtcblx0XHR0aGlzLmNvZGVTZXR0aW5nU2ltcGxlUmVnZXggPSBuZXcgUmVnRXhwKGBec2V0dGluZ1xcXFwoKFteXFxcXHM6KV0rKSg/OjooW14pXSspKT9cXFxcKSRgKTtcblx0fVxuXG5cdGdldCBmZWF0dXJlZFNldHRpbmdTdGF0ZXMoKTogTWFwPHN0cmluZywgYm9vbGVhbj4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8c3RyaW5nLCBib29sZWFuPigpO1xuXHRcdGZvciAoY29uc3QgW3NldHRpbmdJZCwgdmFsdWVdIG9mIHRoaXMuX2ZlYXR1cmVkU2V0dGluZ3MpIHtcblx0XHRcdHJlc3VsdC5zZXQoc2V0dGluZ0lkLCB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShzZXR0aW5nSWQpID09PSB2YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHJlcGxhY2VBbmNob3IocmF3OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1hdGNoID0gdGhpcy5jb2RlU2V0dGluZ0FuY2hvclJlZ2V4LmV4ZWMocmF3KTtcblx0XHRpZiAobWF0Y2ggJiYgbWF0Y2gubGVuZ3RoID09PSA0KSB7XG5cdFx0XHRjb25zdCBzZXR0aW5nSWQgPSBtYXRjaFsyXTtcblx0XHRcdGNvbnN0IHJlbmRlcmVkID0gdGhpcy5yZW5kZXIoc2V0dGluZ0lkLCBtYXRjaFszXSk7XG5cdFx0XHRpZiAocmVuZGVyZWQpIHtcblx0XHRcdFx0cmV0dXJuIHJhdy5yZXBsYWNlKHRoaXMuY29kZVNldHRpbmdBbmNob3JSZWdleCwgcmVuZGVyZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSByZXBsYWNlU2ltcGxlKHJhdzogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtYXRjaCA9IHRoaXMuY29kZVNldHRpbmdTaW1wbGVSZWdleC5leGVjKHJhdyk7XG5cdFx0aWYgKG1hdGNoICYmIG1hdGNoLmxlbmd0aCA9PT0gMykge1xuXHRcdFx0Y29uc3Qgc2V0dGluZ0lkID0gbWF0Y2hbMV07XG5cdFx0XHRjb25zdCByZW5kZXJlZCA9IHRoaXMucmVuZGVyKHNldHRpbmdJZCwgbWF0Y2hbMl0pO1xuXHRcdFx0aWYgKHJlbmRlcmVkKSB7XG5cdFx0XHRcdHJldHVybiByYXcucmVwbGFjZSh0aGlzLmNvZGVTZXR0aW5nU2ltcGxlUmVnZXgsIHJlbmRlcmVkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldEh0bWxSZW5kZXJlcigpOiAodG9rZW46IFRva2Vucy5IVE1MIHwgVG9rZW5zLlRhZykgPT4gc3RyaW5nIHtcblx0XHRyZXR1cm4gKHsgcmF3IH06IFRva2Vucy5IVE1MIHwgVG9rZW5zLlRhZyk6IHN0cmluZyA9PiB7XG5cdFx0XHRjb25zdCByZXBsYWNlZEFuY2hvciA9IHRoaXMucmVwbGFjZUFuY2hvcihyYXcpO1xuXHRcdFx0aWYgKHJlcGxhY2VkQW5jaG9yKSB7XG5cdFx0XHRcdHJhdyA9IHJlcGxhY2VkQW5jaG9yO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJhdztcblx0XHR9O1xuXHR9XG5cblx0Z2V0Q29kZVNwYW5SZW5kZXJlcigpOiAodG9rZW46IFRva2Vucy5Db2Rlc3BhbikgPT4gc3RyaW5nIHtcblx0XHRyZXR1cm4gKHsgdGV4dCB9OiBUb2tlbnMuQ29kZXNwYW4pOiBzdHJpbmcgPT4ge1xuXHRcdFx0Y29uc3QgcmVwbGFjZWRTaW1wbGUgPSB0aGlzLnJlcGxhY2VTaW1wbGUodGV4dCk7XG5cdFx0XHRpZiAocmVwbGFjZWRTaW1wbGUpIHtcblx0XHRcdFx0cmV0dXJuIHJlcGxhY2VkU2ltcGxlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGA8Y29kZT4ke3RleHR9PC9jb2RlPmA7XG5cdFx0fTtcblx0fVxuXG5cdHNldHRpbmdUb1VyaVN0cmluZyhzZXR0aW5nSWQ6IHN0cmluZywgdmFsdWU/OiB1bmtub3duKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYCR7U2NoZW1hcy5jb2RlU2V0dGluZ306Ly8ke3NldHRpbmdJZH0ke3ZhbHVlID8gYC8ke3ZhbHVlfWAgOiAnJ31gO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZXR0aW5nKHNldHRpbmdJZDogc3RyaW5nKTogSVNldHRpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9lbmNvdW50ZXJlZFNldHRpbmdzLmhhcyhzZXR0aW5nSWQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZW5jb3VudGVyZWRTZXR0aW5ncy5nZXQoc2V0dGluZ0lkKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3ByZWZlcmVuY2VzU2VydmljZS5nZXRTZXR0aW5nKHNldHRpbmdJZCk7XG5cdH1cblxuXHRwYXJzZVZhbHVlKHNldHRpbmdJZDogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKSB7XG5cdFx0aWYgKHZhbHVlID09PSAndW5kZWZpbmVkJyB8fCB2YWx1ZSA9PT0gJycpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNldHRpbmcgPSB0aGlzLmdldFNldHRpbmcoc2V0dGluZ0lkKTtcblx0XHRpZiAoIXNldHRpbmcpIHtcblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9XG5cblx0XHRzd2l0Y2ggKHNldHRpbmcudHlwZSkge1xuXHRcdFx0Y2FzZSAnYm9vbGVhbic6XG5cdFx0XHRcdHJldHVybiB2YWx1ZSA9PT0gJ3RydWUnO1xuXHRcdFx0Y2FzZSAnbnVtYmVyJzpcblx0XHRcdFx0cmV0dXJuIHBhcnNlSW50KHZhbHVlLCAxMCk7XG5cdFx0XHRjYXNlICdzdHJpbmcnOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyKHNldHRpbmdJZDogc3RyaW5nLCBuZXdWYWx1ZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzZXR0aW5nID0gdGhpcy5nZXRTZXR0aW5nKHNldHRpbmdJZCk7XG5cdFx0aWYgKCFzZXR0aW5nKSB7XG5cdFx0XHRyZXR1cm4gYDxjb2RlPiR7c2V0dGluZ0lkfTwvY29kZT5gO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnJlbmRlclNldHRpbmcoc2V0dGluZywgbmV3VmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSB2aWV3SW5TZXR0aW5nc01lc3NhZ2Uoc2V0dGluZ0lkOiBzdHJpbmcsIGFscmVhZHlEaXNwbGF5ZWQ6IGJvb2xlYW4pIHtcblx0XHRpZiAoYWxyZWFkeURpc3BsYXllZCkge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgndmlld0luU2V0dGluZ3MnLCBcIlZpZXcgaW4gU2V0dGluZ3NcIik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gc2V0dGluZ0tleVRvRGlzcGxheUZvcm1hdChzZXR0aW5nSWQpO1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgndmlld0luU2V0dGluZ3NEZXRhaWxlZCcsIFwiVmlldyBcXFwiezB9OiB7MX1cXFwiIGluIFNldHRpbmdzXCIsIGRpc3BsYXlOYW1lLmNhdGVnb3J5LCBkaXNwbGF5TmFtZS5sYWJlbCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZXN0b3JlUHJldmlvdXNTZXR0aW5nTWVzc2FnZShzZXR0aW5nSWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0KHNldHRpbmdJZCk7XG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncmVzdG9yZVByZXZpb3VzVmFsdWUnLCBcIlJlc3RvcmUgdmFsdWUgb2YgXFxcInswfTogezF9XFxcIlwiLCBkaXNwbGF5TmFtZS5jYXRlZ29yeSwgZGlzcGxheU5hbWUubGFiZWwpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc0FscmVhZHlTZXQoc2V0dGluZzogSVNldHRpbmcsIHZhbHVlOiBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgY3VycmVudFZhbHVlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oc2V0dGluZy5rZXkpO1xuXHRcdHJldHVybiAoY3VycmVudFZhbHVlID09PSB2YWx1ZSB8fCAoY3VycmVudFZhbHVlID09PSB1bmRlZmluZWQgJiYgc2V0dGluZy52YWx1ZSA9PT0gdmFsdWUpKTtcblx0fVxuXG5cdHByaXZhdGUgYm9vbGVhblNldHRpbmdNZXNzYWdlKHNldHRpbmc6IElTZXR0aW5nLCBib29sZWFuVmFsdWU6IGJvb2xlYW4pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gc2V0dGluZ0tleVRvRGlzcGxheUZvcm1hdChzZXR0aW5nLmtleSk7XG5cdFx0aWYgKHRoaXMuaXNBbHJlYWR5U2V0KHNldHRpbmcsIGJvb2xlYW5WYWx1ZSkpIHtcblx0XHRcdGlmIChib29sZWFuVmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnYWxyZWFkeXNldEJvb2xUcnVlJywgXCJcXFwiezB9OiB7MX1cXFwiIGlzIGFscmVhZHkgZW5hYmxlZFwiLCBkaXNwbGF5TmFtZS5jYXRlZ29yeSwgZGlzcGxheU5hbWUubGFiZWwpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnYWxyZWFkeXNldEJvb2xGYWxzZScsIFwiXFxcInswfTogezF9XFxcIiBpcyBhbHJlYWR5IGRpc2FibGVkXCIsIGRpc3BsYXlOYW1lLmNhdGVnb3J5LCBkaXNwbGF5TmFtZS5sYWJlbCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGJvb2xlYW5WYWx1ZSkge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgndHJ1ZU1lc3NhZ2UnLCBcIkVuYWJsZSBcXFwiezB9OiB7MX1cXFwiXCIsIGRpc3BsYXlOYW1lLmNhdGVnb3J5LCBkaXNwbGF5TmFtZS5sYWJlbCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ2ZhbHNlTWVzc2FnZScsIFwiRGlzYWJsZSBcXFwiezB9OiB7MX1cXFwiXCIsIGRpc3BsYXlOYW1lLmNhdGVnb3J5LCBkaXNwbGF5TmFtZS5sYWJlbCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzdHJpbmdTZXR0aW5nTWVzc2FnZShzZXR0aW5nOiBJU2V0dGluZywgc3RyaW5nVmFsdWU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBzZXR0aW5nS2V5VG9EaXNwbGF5Rm9ybWF0KHNldHRpbmcua2V5KTtcblx0XHRpZiAodGhpcy5pc0FscmVhZHlTZXQoc2V0dGluZywgc3RyaW5nVmFsdWUpKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdhbHJlYWR5c2V0U3RyaW5nJywgXCJcXFwiezB9OiB7MX1cXFwiIGlzIGFscmVhZHkgc2V0IHRvIFxcXCJ7Mn1cXFwiXCIsIGRpc3BsYXlOYW1lLmNhdGVnb3J5LCBkaXNwbGF5TmFtZS5sYWJlbCwgc3RyaW5nVmFsdWUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBubHMubG9jYWxpemUoJ3N0cmluZ1ZhbHVlJywgXCJTZXQgXFxcInswfTogezF9XFxcIiB0byBcXFwiezJ9XFxcIlwiLCBkaXNwbGF5TmFtZS5jYXRlZ29yeSwgZGlzcGxheU5hbWUubGFiZWwsIHN0cmluZ1ZhbHVlKTtcblx0fVxuXG5cdHByaXZhdGUgbnVtYmVyU2V0dGluZ01lc3NhZ2Uoc2V0dGluZzogSVNldHRpbmcsIG51bWJlclZhbHVlOiBudW1iZXIpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGRpc3BsYXlOYW1lID0gc2V0dGluZ0tleVRvRGlzcGxheUZvcm1hdChzZXR0aW5nLmtleSk7XG5cdFx0aWYgKHRoaXMuaXNBbHJlYWR5U2V0KHNldHRpbmcsIG51bWJlclZhbHVlKSkge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnYWxyZWFkeXNldE51bScsIFwiXFxcInswfTogezF9XFxcIiBpcyBhbHJlYWR5IHNldCB0byB7Mn1cIiwgZGlzcGxheU5hbWUuY2F0ZWdvcnksIGRpc3BsYXlOYW1lLmxhYmVsLCBudW1iZXJWYWx1ZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnbnVtYmVyVmFsdWUnLCBcIlNldCBcXFwiezB9OiB7MX1cXFwiIHRvIHsyfVwiLCBkaXNwbGF5TmFtZS5jYXRlZ29yeSwgZGlzcGxheU5hbWUubGFiZWwsIG51bWJlclZhbHVlKTtcblxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTZXR0aW5nKHNldHRpbmc6IElTZXR0aW5nLCBuZXdWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBocmVmID0gdGhpcy5zZXR0aW5nVG9VcmlTdHJpbmcoc2V0dGluZy5rZXksIG5ld1ZhbHVlKTtcblx0XHRjb25zdCB0aXRsZSA9IG5scy5sb2NhbGl6ZSgnY2hhbmdlU2V0dGluZ1RpdGxlJywgXCJWaWV3IG9yIGNoYW5nZSBzZXR0aW5nXCIpO1xuXHRcdHJldHVybiBgPGNvZGUgdGFiaW5kZXg9XCIwXCI+PGEgaHJlZj1cIiR7aHJlZn1cIiBjbGFzcz1cImNvZGVzZXR0aW5nXCIgdGl0bGU9XCIke3RpdGxlfVwiIGFyaWEtcm9sZT1cImJ1dHRvblwiPjxzdmcgd2lkdGg9XCIxNFwiIGhlaWdodD1cIjE0XCIgdmlld0JveD1cIjAgMCAxNSAxNVwiIHhtbG5zPVwiaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmdcIiBmaWxsPVwiY3VycmVudENvbG9yXCI+PHBhdGggZD1cIk05LjEgNC40TDguNiAySDcuNGwtLjUgMi40LS43LjMtMi0xLjMtLjkuOCAxLjMgMi0uMi43LTIuNC41djEuMmwyLjQuNS4zLjgtMS4zIDIgLjguOCAyLTEuMy44LjMuNCAyLjNoMS4ybC41LTIuNC44LS4zIDIgMS4zLjgtLjgtMS4zLTIgLjMtLjggMi4zLS40VjcuNGwtMi40LS41LS4zLS44IDEuMy0yLS44LS44LTIgMS4zLS43LS4yek05LjQgMWwuNSAyLjRMMTIgMi4xbDIgMi0xLjQgMi4xIDIuNC40djIuOGwtMi40LjVMMTQgMTJsLTIgMi0yLjEtMS40LS41IDIuNEg2LjZsLS41LTIuNEw0IDEzLjlsLTItMiAxLjQtMi4xTDEgOS40VjYuNmwyLjQtLjVMMi4xIDRsMi0yIDIuMSAxLjQuNC0yLjRoMi44em0uNiA3YzAgMS4xLS45IDItMiAycy0yLS45LTItMiAuOS0yIDItMiAyIC45IDIgMnpNOCA5Yy42IDAgMS0uNCAxLTFzLS40LTEtMS0xLTEgLjQtMSAxIC40IDEgMSAxelwiLz48L3N2Zz5cblx0XHRcdDxzcGFuIGNsYXNzPVwic2VwYXJhdG9yXCI+PC9zcGFuPlxuXHRcdFx0PHNwYW4gY2xhc3M9XCJzZXR0aW5nLW5hbWVcIj4ke3NldHRpbmcua2V5fTwvc3Bhbj5cblx0XHQ8L2E+PC9jb2RlPmA7XG5cdH1cblxuXHRwcml2YXRlIGdldFNldHRpbmdNZXNzYWdlKHNldHRpbmc6IElTZXR0aW5nLCBuZXdWYWx1ZTogYm9vbGVhbiB8IHN0cmluZyB8IG51bWJlcik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHNldHRpbmcudHlwZSA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5ib29sZWFuU2V0dGluZ01lc3NhZ2Uoc2V0dGluZywgbmV3VmFsdWUgYXMgYm9vbGVhbik7XG5cdFx0fSBlbHNlIGlmIChzZXR0aW5nLnR5cGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zdHJpbmdTZXR0aW5nTWVzc2FnZShzZXR0aW5nLCBuZXdWYWx1ZSBhcyBzdHJpbmcpO1xuXHRcdH0gZWxzZSBpZiAoc2V0dGluZy50eXBlID09PSAnbnVtYmVyJykge1xuXHRcdFx0cmV0dXJuIHRoaXMubnVtYmVyU2V0dGluZ01lc3NhZ2Uoc2V0dGluZywgbmV3VmFsdWUgYXMgbnVtYmVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIHJlc3RvcmVTZXR0aW5nKHNldHRpbmdJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgdXNlck9yaWdpbmFsU2V0dGluZ1ZhbHVlID0gdGhpcy5fdXBkYXRlZFNldHRpbmdzLmdldChzZXR0aW5nSWQpO1xuXHRcdHRoaXMuX3VwZGF0ZWRTZXR0aW5ncy5kZWxldGUoc2V0dGluZ0lkKTtcblx0XHRyZXR1cm4gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoc2V0dGluZ0lkLCB1c2VyT3JpZ2luYWxTZXR0aW5nVmFsdWUsIENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUik7XG5cdH1cblxuXHRhc3luYyBzZXRTZXR0aW5nKHNldHRpbmdJZDogc3RyaW5nLCBjdXJyZW50U2V0dGluZ1ZhbHVlOiB1bmtub3duLCBuZXdTZXR0aW5nVmFsdWU6IHVua25vd24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLl91cGRhdGVkU2V0dGluZ3Muc2V0KHNldHRpbmdJZCwgY3VycmVudFNldHRpbmdWYWx1ZSk7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKHNldHRpbmdJZCwgbmV3U2V0dGluZ1ZhbHVlLCBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIpO1xuXHR9XG5cblx0Z2V0QWN0aW9ucyh1cmk6IFVSSSkge1xuXHRcdGlmICh1cmkuc2NoZW1lICE9PSBTY2hlbWFzLmNvZGVTZXR0aW5nKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cblx0XHRjb25zdCBzZXR0aW5nSWQgPSB1cmkuYXV0aG9yaXR5O1xuXHRcdGNvbnN0IG5ld1NldHRpbmdWYWx1ZSA9IHRoaXMucGFyc2VWYWx1ZSh1cmkuYXV0aG9yaXR5LCB1cmkucGF0aC5zdWJzdHJpbmcoMSkpO1xuXHRcdGNvbnN0IGN1cnJlbnRTZXR0aW5nVmFsdWUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KHNldHRpbmdJZCkudXNlclZhbHVlO1xuXG5cdFx0aWYgKChuZXdTZXR0aW5nVmFsdWUgIT09IHVuZGVmaW5lZCkgJiYgbmV3U2V0dGluZ1ZhbHVlID09PSBjdXJyZW50U2V0dGluZ1ZhbHVlICYmIHRoaXMuX3VwZGF0ZWRTZXR0aW5ncy5oYXMoc2V0dGluZ0lkKSkge1xuXHRcdFx0Y29uc3QgcmVzdG9yZU1lc3NhZ2UgPSB0aGlzLnJlc3RvcmVQcmV2aW91c1NldHRpbmdNZXNzYWdlKHNldHRpbmdJZCk7XG5cdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRpZDogJ3Jlc3RvcmVTZXR0aW5nJyxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0dG9vbHRpcDogcmVzdG9yZU1lc3NhZ2UsXG5cdFx0XHRcdGxhYmVsOiByZXN0b3JlTWVzc2FnZSxcblx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMucmVzdG9yZVNldHRpbmcoc2V0dGluZ0lkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGlmIChuZXdTZXR0aW5nVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3Qgc2V0dGluZyA9IHRoaXMuZ2V0U2V0dGluZyhzZXR0aW5nSWQpO1xuXHRcdFx0Y29uc3QgdHJ5U2V0dGluZ01lc3NhZ2UgPSBzZXR0aW5nID8gdGhpcy5nZXRTZXR0aW5nTWVzc2FnZShzZXR0aW5nLCBuZXdTZXR0aW5nVmFsdWUpIDogdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAoc2V0dGluZyAmJiB0cnlTZXR0aW5nTWVzc2FnZSkge1xuXHRcdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0aWQ6ICd0cnlTZXR0aW5nJyxcblx0XHRcdFx0XHRlbmFibGVkOiAhdGhpcy5pc0FscmVhZHlTZXQoc2V0dGluZywgbmV3U2V0dGluZ1ZhbHVlKSxcblx0XHRcdFx0XHR0b29sdGlwOiB0cnlTZXR0aW5nTWVzc2FnZSxcblx0XHRcdFx0XHRsYWJlbDogdHJ5U2V0dGluZ01lc3NhZ2UsXG5cdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLnNldFNldHRpbmcoc2V0dGluZ0lkLCBjdXJyZW50U2V0dGluZ1ZhbHVlLCBuZXdTZXR0aW5nVmFsdWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgdmlld0luU2V0dGluZ3NNZXNzYWdlID0gdGhpcy52aWV3SW5TZXR0aW5nc01lc3NhZ2Uoc2V0dGluZ0lkLCBhY3Rpb25zLmxlbmd0aCA+IDApO1xuXHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGlkOiAndmlld0luU2V0dGluZ3MnLFxuXHRcdFx0dG9vbHRpcDogdmlld0luU2V0dGluZ3NNZXNzYWdlLFxuXHRcdFx0bGFiZWw6IHZpZXdJblNldHRpbmdzTWVzc2FnZSxcblx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fcHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5BcHBsaWNhdGlvblNldHRpbmdzKHsgcXVlcnk6IGBAaWQ6JHtzZXR0aW5nSWR9YCB9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGlkOiAnY29weVNldHRpbmdJZCcsXG5cdFx0XHR0b29sdGlwOiBubHMubG9jYWxpemUoJ2NvcHlTZXR0aW5nSWQnLCBcIkNvcHkgU2V0dGluZyBJRFwiKSxcblx0XHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2NvcHlTZXR0aW5nSWQnLCBcIkNvcHkgU2V0dGluZyBJRFwiKSxcblx0XHRcdHJ1bjogKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9jbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChzZXR0aW5nSWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIHNob3dDb250ZXh0TWVudSh1cmk6IFVSSSwgeDogbnVtYmVyLCB5OiBudW1iZXIpIHtcblx0XHRjb25zdCBhY3Rpb25zID0gdGhpcy5nZXRBY3Rpb25zKHVyaSk7XG5cdFx0aWYgKCFhY3Rpb25zKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+ICh7IHgsIHkgfSksXG5cdFx0XHRnZXRBY3Rpb25zOiAoKSA9PiBhY3Rpb25zLFxuXHRcdFx0Z2V0QWN0aW9uVmlld0l0ZW06IChhY3Rpb24pID0+IHtcblx0XHRcdFx0cmV0dXJuIG5ldyBBY3Rpb25WaWV3SXRlbShhY3Rpb24sIGFjdGlvbiwgeyBsYWJlbDogdHJ1ZSB9KTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyB1cGRhdGVTZXR0aW5nKHVyaTogVVJJLCB4OiBudW1iZXIsIHk6IG51bWJlcikge1xuXHRcdGlmICh1cmkuc2NoZW1lID09PSBTY2hlbWFzLmNvZGVTZXR0aW5nKSB7XG5cdFx0XHR0eXBlIFJlbGVhc2VOb3Rlc1NldHRpbmdVc2VkQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRcdG93bmVyOiAnYWxleHIwMCc7XG5cdFx0XHRcdGNvbW1lbnQ6ICdVc2VkIHRvIHVuZGVyc3RhbmQgaWYgdGhlIGFjdGlvbiB0byB1cGRhdGUgc2V0dGluZ3MgZnJvbSB0aGUgcmVsZWFzZSBub3RlcyBpcyB1c2VkLic7XG5cdFx0XHRcdHNldHRpbmdJZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBpZCBvZiB0aGUgc2V0dGluZyB0aGF0IHdhcyBjbGlja2VkIG9uIGluIHRoZSByZWxlYXNlIG5vdGVzJyB9O1xuXHRcdFx0fTtcblx0XHRcdHR5cGUgUmVsZWFzZU5vdGVzU2V0dGluZ1VzZWQgPSB7XG5cdFx0XHRcdHNldHRpbmdJZDogc3RyaW5nO1xuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxSZWxlYXNlTm90ZXNTZXR0aW5nVXNlZCwgUmVsZWFzZU5vdGVzU2V0dGluZ1VzZWRDbGFzc2lmaWNhdGlvbj4oJ3JlbGVhc2VOb3Rlc1NldHRpbmdBY3Rpb24nLCB7XG5cdFx0XHRcdHNldHRpbmdJZDogdXJpLmF1dGhvcml0eVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5zaG93Q29udGV4dE1lbnUodXJpLCB4LCB5KTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxzQkFBc0I7QUFHL0IsU0FBUyxlQUFlO0FBRXhCLFlBQVksU0FBUztBQUNyQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQiw2QkFBNkI7QUFDM0QsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywyQkFBcUM7QUFDOUMsU0FBUyxpQ0FBaUM7QUFFbkMsSUFBTSx3QkFBTixNQUE0QjtBQUFBO0FBQUEsRUFRbEMsWUFDeUMsdUJBQ0YscUJBQ0EscUJBQ0YsbUJBQ0EsbUJBQ25DO0FBTHVDO0FBQ0Y7QUFDQTtBQUNGO0FBQ0E7QUFUckMsU0FBUSxtQkFBbUIsb0JBQUksSUFBcUI7QUFDcEQ7QUFBQSxTQUFRLHVCQUF1QixvQkFBSSxJQUFzQjtBQUN6RDtBQUFBLFNBQVEsb0JBQW9CLG9CQUFJLElBQXFCO0FBU3BELFNBQUsseUJBQXlCLElBQUksT0FBTyw0RUFBNEU7QUFDckgsU0FBSyx5QkFBeUIsSUFBSSxPQUFPLHlDQUF5QztBQUFBLEVBQ25GO0FBQUEsRUFFQSxJQUFJLHdCQUE4QztBQUNqRCxVQUFNLFNBQVMsb0JBQUksSUFBcUI7QUFDeEMsZUFBVyxDQUFDLFdBQVcsS0FBSyxLQUFLLEtBQUssbUJBQW1CO0FBQ3hELGFBQU8sSUFBSSxXQUFXLEtBQUssc0JBQXNCLFNBQVMsU0FBUyxNQUFNLEtBQUs7QUFBQSxJQUMvRTtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxj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
