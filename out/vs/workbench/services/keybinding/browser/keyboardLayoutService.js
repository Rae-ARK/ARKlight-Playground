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
import { Emitter, Event } from "../../../../base/common/event.js";
import { FileAccess } from "../../../../base/common/network.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { KeymapInfo } from "../common/keymapInfo.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { DispatchConfig, readKeyboardConfig } from "../../../../platform/keyboardLayout/common/keyboardConfig.js";
import { CachedKeyboardMapper } from "../../../../platform/keyboardLayout/common/keyboardMapper.js";
import { OS, OperatingSystem, isMacintosh, isWindows } from "../../../../base/common/platform.js";
import { WindowsKeyboardMapper } from "../common/windowsKeyboardMapper.js";
import { FallbackKeyboardMapper } from "../common/fallbackKeyboardMapper.js";
import { MacLinuxKeyboardMapper } from "../common/macLinuxKeyboardMapper.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { parse, getNodeType } from "../../../../base/common/json.js";
import * as objects from "../../../../base/common/objects.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as ConfigExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { getKeyboardLayoutId, IKeyboardLayoutService } from "../../../../platform/keyboardLayout/common/keyboardLayout.js";
class BrowserKeyboardMapperFactoryBase extends Disposable {
  constructor(_configurationService) {
    super();
    this._configurationService = _configurationService;
    this._onDidChangeKeyboardMapper = this._register(new Emitter());
    this.onDidChangeKeyboardMapper = this._onDidChangeKeyboardMapper.event;
    this.keyboardLayoutMapAllowed = navigator.keyboard !== void 0;
    this._keyboardMapper = null;
    this._initialized = false;
    this._keymapInfos = [];
    this._mru = [];
    this._activeKeymapInfo = null;
    if (navigator.keyboard && navigator.keyboard.addEventListener) {
      navigator.keyboard.addEventListener("layoutchange", () => {
        this._getBrowserKeyMapping().then((mapping) => {
          if (this.isKeyMappingActive(mapping)) {
            return;
          }
          this.setLayoutFromBrowserAPI();
        });
      });
    }
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("keyboard")) {
        this._keyboardMapper = null;
        this._onDidChangeKeyboardMapper.fire();
      }
    }));
  }
  get activeKeymap() {
    return this._activeKeymapInfo;
  }
  get keymapInfos() {
    return this._keymapInfos;
  }
  get activeKeyboardLayout() {
    if (!this._initialized) {
      return null;
    }
    return this._activeKeymapInfo?.layout ?? null;
  }
  get activeKeyMapping() {
    if (!this._initialized) {
      return null;
    }
    return this._activeKeymapInfo?.mapping ?? null;
  }
  get keyboardLayouts() {
    return this._keymapInfos.map((keymapInfo) => keymapInfo.layout);
  }
  registerKeyboardLayout(layout) {
    this._keymapInfos.push(layout);
    this._mru = this._keymapInfos;
  }
  removeKeyboardLayout(layout) {
    let index = this._mru.indexOf(layout);
    if (index !== -1) {
      this._mru.splice(index, 1);
    }
    index = this._keymapInfos.indexOf(layout);
    if (index !== -1) {
      this._keymapInfos.splice(index, 1);
    }
  }
  getMatchedKeymapInfo(keyMapping) {
    if (!keyMapping) {
      return null;
    }
    const usStandard = this.getUSStandardLayout();
    if (usStandard) {
      let maxScore = usStandard.getScore(keyMapping);
      if (maxScore === 0) {
        return {
          result: usStandard,
          score: 0
        };
      }
      let result = usStandard;
      for (let i = 0; i < this._mru.length; i++) {
        const score = this._mru[i].getScore(keyMapping);
        if (score > maxScore) {
          if (score === 0) {
            return {
              result: this._mru[i],
              score: 0
            };
          }
          maxScore = score;
          result = this._mru[i];
        }
      }
      return {
        result,
        score: maxScore
      };
    }
    for (let i = 0; i < this._mru.length; i++) {
      if (this._mru[i].fuzzyEqual(keyMapping)) {
        return {
          result: this._mru[i],
          score: 0
        };
      }
    }
    return null;
  }
  getUSStandardLayout() {
    const usStandardLayouts = this._mru.filter((layout) => layout.layout.isUSStandard);
    if (usStandardLayouts.length) {
      return usStandardLayouts[0];
    }
    return null;
  }
  isKeyMappingActive(keymap) {
    return this._activeKeymapInfo && keymap && this._activeKeymapInfo.fuzzyEqual(keymap);
  }
  setUSKeyboardLayout() {
    this._activeKeymapInfo = this.getUSStandardLayout();
  }
  setActiveKeyMapping(keymap) {
    let keymapUpdated = false;
    const matchedKeyboardLayout = this.getMatchedKeymapInfo(keymap);
    if (matchedKeyboardLayout) {
      if (!this._activeKeymapInfo) {
        this._activeKeymapInfo = matchedKeyboardLayout.result;
        keymapUpdated = true;
      } else if (keymap) {
        if (matchedKeyboardLayout.result.getScore(keymap) > this._activeKeymapInfo.getScore(keymap)) {
          this._activeKeymapInfo = matchedKeyboardLayout.result;
          keymapUpdated = true;
        }
      }
    }
    if (!this._activeKeymapInfo) {
      this._activeKeymapInfo = this.getUSStandardLayout();
      keymapUpdated = true;
    }
    if (!this._activeKeymapInfo || !keymapUpdated) {
      return;
    }
    const index = this._mru.indexOf(this._activeKeymapInfo);
    this._mru.splice(index, 1);
    this._mru.unshift(this._activeKeymapInfo);
    this._setKeyboardData(this._activeKeymapInfo);
  }
  setActiveKeymapInfo(keymapInfo) {
    this._activeKeymapInfo = keymapInfo;
    const index = this._mru.indexOf(this._activeKeymapInfo);
    if (index === 0) {
      return;
    }
    this._mru.splice(index, 1);
    this._mru.unshift(this._activeKeymapInfo);
    this._setKeyboardData(this._activeKeymapInfo);
  }
  setLayoutFromBrowserAPI() {
    this._updateKeyboardLayoutAsync(this._initialized);
  }
  _updateKeyboardLayoutAsync(initialized, keyboardEvent) {
    if (!initialized) {
      return;
    }
    this._getBrowserKeyMapping(keyboardEvent).then((keyMap) => {
      if (this.isKeyMappingActive(keyMap)) {
        return;
      }
      this.setActiveKeyMapping(keyMap);
    });
  }
  getKeyboardMapper() {
    const config = readKeyboardConfig(this._configurationService);
    if (config.dispatch === DispatchConfig.KeyCode || !this._initialized || !this._activeKeymapInfo) {
      return new FallbackKeyboardMapper(config.mapAltGrToCtrlAlt, OS);
    }
    if (!this._keyboardMapper) {
      this._keyboardMapper = new CachedKeyboardMapper(BrowserKeyboardMapperFactory._createKeyboardMapper(this._activeKeymapInfo, config.mapAltGrToCtrlAlt));
    }
    return this._keyboardMapper;
  }
  validateCurrentKeyboardMapping(keyboardEvent) {
    if (!this._initialized) {
      return;
    }
    const isCurrentKeyboard = this._validateCurrentKeyboardMapping(keyboardEvent);
    if (isCurrentKeyboard) {
      return;
    }
    this._updateKeyboardLayoutAsync(true, keyboardEvent);
  }
  setKeyboardLayout(layoutName) {
    const matchedLayouts = this.keymapInfos.filter((keymapInfo) => getKeyboardLayoutId(keymapInfo.layout) === layoutName);
    if (matchedLayouts.length > 0) {
      this.setActiveKeymapInfo(matchedLayouts[0]);
    }
  }
  _setKeyboardData(keymapInfo) {
    this._initialized = true;
    this._keyboardMapper = null;
    this._onDidChangeKeyboardMapper.fire();
  }
  static _createKeyboardMapper(keymapInfo, mapAltGrToCtrlAlt) {
    const rawMapping = keymapInfo.mapping;
    const isUSStandard = !!keymapInfo.layout.isUSStandard;
    if (OS === OperatingSystem.Windows) {
      return new WindowsKeyboardMapper(isUSStandard, rawMapping, mapAltGrToCtrlAlt);
    }
    if (Object.keys(rawMapping).length === 0) {
      return new FallbackKeyboardMapper(mapAltGrToCtrlAlt, OS);
    }
    return new MacLinuxKeyboardMapper(isUSStandard, rawMapping, mapAltGrToCtrlAlt, OS);
  }
  //#region Browser API
  _validateCurrentKeyboardMapping(keyboardEvent) {
    if (!this._initialized) {
      return true;
    }
    const standardKeyboardEvent = keyboardEvent;
    const currentKeymap = this._activeKeymapInfo;
    if (!currentKeymap) {
      return true;
    }
    if (standardKeyboardEvent.browserEvent.key === "Dead" || standardKeyboardEvent.browserEvent.isComposing) {
      return true;
    }
    const mapping = currentKeymap.mapping[standardKeyboardEvent.code];
    if (!mapping) {
      return false;
    }
    if (mapping.value === "") {
      if (keyboardEvent.ctrlKey || keyboardEvent.metaKey) {
        setTimeout(() => {
          this._getBrowserKeyMapping().then((keymap) => {
            if (this.isKeyMappingActive(keymap)) {
              return;
            }
            this.setLayoutFromBrowserAPI();
          });
        }, 350);
      }
      return true;
    }
    const expectedValue = standardKeyboardEvent.altKey && standardKeyboardEvent.shiftKey ? mapping.withShiftAltGr : standardKeyboardEvent.altKey ? mapping.withAltGr : standardKeyboardEvent.shiftKey ? mapping.withShift : mapping.value;
    const isDead = standardKeyboardEvent.altKey && standardKeyboardEvent.shiftKey && mapping.withShiftAltGrIsDeadKey || standardKeyboardEvent.altKey && mapping.withAltGrIsDeadKey || standardKeyboardEvent.shiftKey && mapping.withShiftIsDeadKey || mapping.valueIsDeadKey;
    if (isDead && standardKeyboardEvent.browserEvent.key !== "Dead") {
      return false;
    }
    if (!isDead && standardKeyboardEvent.browserEvent.key !== expectedValue) {
      return false;
    }
    return true;
  }
  async _getBrowserKeyMapping(keyboardEvent) {
    if (this.keyboardLayoutMapAllowed) {
      try {
        return await navigator.keyboard.getLayoutMap().then((e) => {
          const ret = {};
          for (const key of e) {
            ret[key[0]] = {
              "value": key[1],
              "withShift": "",
              "withAltGr": "",
              "withShiftAltGr": ""
            };
          }
          return ret;
        });
      } catch {
        this.keyboardLayoutMapAllowed = false;
      }
    }
    if (keyboardEvent && !keyboardEvent.shiftKey && !keyboardEvent.altKey && !keyboardEvent.metaKey && !keyboardEvent.metaKey) {
      const ret = {};
      const standardKeyboardEvent = keyboardEvent;
      ret[standardKeyboardEvent.browserEvent.code] = {
        "value": standardKeyboardEvent.browserEvent.key,
        "withShift": "",
        "withAltGr": "",
        "withShiftAltGr": ""
      };
      const matchedKeyboardLayout = this.getMatchedKeymapInfo(ret);
      if (matchedKeyboardLayout) {
        return ret;
      }
      return null;
    }
    return null;
  }
  //#endregion
}
class BrowserKeyboardMapperFactory extends BrowserKeyboardMapperFactoryBase {
  constructor(configurationService, notificationService, storageService, commandService) {
    super(configurationService);
    const platform = isWindows ? "win" : isMacintosh ? "darwin" : "linux";
    import(
      /* webpackIgnore: true */
      FileAccess.asBrowserUri(`vs/workbench/services/keybinding/browser/keyboardLayouts/layout.contribution.${platform}.js`).path
    ).then((m) => {
      const keymapInfos = m.KeyboardLayoutContribution.INSTANCE.layoutInfos;
      this._keymapInfos.push(...keymapInfos.map((info) => new KeymapInfo(info.layout, info.secondaryLayouts, info.mapping, info.isUserKeyboardLayout)));
      this._mru = this._keymapInfos;
      this._initialized = true;
      this.setLayoutFromBrowserAPI();
    });
  }
}
class UserKeyboardLayout extends Disposable {
  constructor(keyboardLayoutResource, fileService) {
    super();
    this.keyboardLayoutResource = keyboardLayoutResource;
    this.fileService = fileService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._keyboardLayout = null;
    this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reload().then((changed) => {
      if (changed) {
        this._onDidChange.fire();
      }
    }), 50));
    this._register(Event.filter(this.fileService.onDidFilesChange, (e) => e.contains(this.keyboardLayoutResource))(() => this.reloadConfigurationScheduler.schedule()));
  }
  get keyboardLayout() {
    return this._keyboardLayout;
  }
  async initialize() {
    await this.reload();
  }
  async reload() {
    const existing = this._keyboardLayout;
    try {
      const content = await this.fileService.readFile(this.keyboardLayoutResource);
      const value = parse(content.value.toString());
      if (getNodeType(value) === "object") {
        const layoutInfo = value.layout;
        const mappings = value.rawMapping;
        this._keyboardLayout = KeymapInfo.createKeyboardLayoutFromDebugInfo(layoutInfo, mappings, true);
      } else {
        this._keyboardLayout = null;
      }
    } catch (e) {
      this._keyboardLayout = null;
    }
    return existing ? !objects.equals(existing, this._keyboardLayout) : true;
  }
}
let BrowserKeyboardLayoutService = class extends Disposable {
  constructor(environmentService, fileService, notificationService, storageService, commandService, configurationService) {
    super();
    this.configurationService = configurationService;
    this._onDidChangeKeyboardLayout = this._register(new Emitter());
    this.onDidChangeKeyboardLayout = this._onDidChangeKeyboardLayout.event;
    const keyboardConfig = configurationService.getValue("keyboard");
    const layout = keyboardConfig.layout;
    this._keyboardLayoutMode = layout ?? "autodetect";
    this._factory = new BrowserKeyboardMapperFactory(configurationService, notificationService, storageService, commandService);
    this._register(this._factory.onDidChangeKeyboardMapper(() => {
      this._onDidChangeKeyboardLayout.fire();
    }));
    if (layout && layout !== "autodetect") {
      this._factory.setKeyboardLayout(layout);
    }
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("keyboard.layout")) {
        const keyboardConfig2 = configurationService.getValue("keyboard");
        const layout2 = keyboardConfig2.layout;
        this._keyboardLayoutMode = layout2;
        if (layout2 === "autodetect") {
          this._factory.setLayoutFromBrowserAPI();
        } else {
          this._factory.setKeyboardLayout(layout2);
        }
      }
    }));
    this._userKeyboardLayout = new UserKeyboardLayout(environmentService.keyboardLayoutResource, fileService);
    this._userKeyboardLayout.initialize().then(() => {
      if (this._userKeyboardLayout.keyboardLayout) {
        this._factory.registerKeyboardLayout(this._userKeyboardLayout.keyboardLayout);
        this.setUserKeyboardLayoutIfMatched();
      }
    });
    this._register(this._userKeyboardLayout.onDidChange(() => {
      const userKeyboardLayouts = this._factory.keymapInfos.filter((layout2) => layout2.isUserKeyboardLayout);
      if (userKeyboardLayouts.length) {
        if (this._userKeyboardLayout.keyboardLayout) {
          userKeyboardLayouts[0].update(this._userKeyboardLayout.keyboardLayout);
        } else {
          this._factory.removeKeyboardLayout(userKeyboardLayouts[0]);
        }
      } else {
        if (this._userKeyboardLayout.keyboardLayout) {
          this._factory.registerKeyboardLayout(this._userKeyboardLayout.keyboardLayout);
        }
      }
      this.setUserKeyboardLayoutIfMatched();
    }));
  }
  setUserKeyboardLayoutIfMatched() {
    const keyboardConfig = this.configurationService.getValue("keyboard");
    const layout = keyboardConfig.layout;
    if (layout && this._userKeyboardLayout.keyboardLayout) {
      if (getKeyboardLayoutId(this._userKeyboardLayout.keyboardLayout.layout) === layout && this._factory.activeKeymap) {
        if (!this._userKeyboardLayout.keyboardLayout.equal(this._factory.activeKeymap)) {
          this._factory.setActiveKeymapInfo(this._userKeyboardLayout.keyboardLayout);
        }
      }
    }
  }
  getKeyboardMapper() {
    return this._factory.getKeyboardMapper();
  }
  getCurrentKeyboardLayout() {
    return this._factory.activeKeyboardLayout;
  }
  getAllKeyboardLayouts() {
    return this._factory.keyboardLayouts;
  }
  getRawKeyboardMapping() {
    return this._factory.activeKeyMapping;
  }
  validateCurrentKeyboardMapping(keyboardEvent) {
    if (this._keyboardLayoutMode !== "autodetect") {
      return;
    }
    this._factory.validateCurrentKeyboardMapping(keyboardEvent);
  }
};
BrowserKeyboardLayoutService = __decorateClass([
  __decorateParam(0, IEnvironmentService),
  __decorateParam(1, IFileService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, ICommandService),
  __decorateParam(5, IConfigurationService)
], BrowserKeyboardLayoutService);
registerSingleton(IKeyboardLayoutService, BrowserKeyboardLayoutService, InstantiationType.Delayed);
const configurationRegistry = Registry.as(ConfigExtensions.Configuration);
const keyboardConfiguration = {
  "id": "keyboard",
  "order": 15,
  "type": "object",
  "title": nls.localize("keyboardConfigurationTitle", "Keyboard"),
  "properties": {
    "keyboard.layout": {
      "type": "string",
      "default": "autodetect",
      "description": nls.localize("keyboard.layout.config", "Control the keyboard layout used in web.")
    }
  }
};
configurationRegistry.registerConfiguration(keyboardConfiguration);
export {
  BrowserKeyboardLayoutService,
  BrowserKeyboardMapperFactory,
  BrowserKeyboardMapperFactoryBase
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9rZXliaW5kaW5nL2Jyb3dzZXIva2V5Ym9hcmRMYXlvdXRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEFwcFJlc291cmNlUGF0aCwgRmlsZUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBLZXltYXBJbmZvLCBJUmF3TWl4ZWRLZXlib2FyZE1hcHBpbmcsIElLZXltYXBJbmZvIH0gZnJvbSAnLi4vY29tbW9uL2tleW1hcEluZm8uanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBEaXNwYXRjaENvbmZpZywgcmVhZEtleWJvYXJkQ29uZmlnIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5Ym9hcmRMYXlvdXQvY29tbW9uL2tleWJvYXJkQ29uZmlnLmpzJztcbmltcG9ydCB7IElLZXlib2FyZE1hcHBlciwgQ2FjaGVkS2V5Ym9hcmRNYXBwZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXlib2FyZExheW91dC9jb21tb24va2V5Ym9hcmRNYXBwZXIuanMnO1xuaW1wb3J0IHsgT1MsIE9wZXJhdGluZ1N5c3RlbSwgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFdpbmRvd3NLZXlib2FyZE1hcHBlciB9IGZyb20gJy4uL2NvbW1vbi93aW5kb3dzS2V5Ym9hcmRNYXBwZXIuanMnO1xuaW1wb3J0IHsgRmFsbGJhY2tLZXlib2FyZE1hcHBlciB9IGZyb20gJy4uL2NvbW1vbi9mYWxsYmFja0tleWJvYXJkTWFwcGVyLmpzJztcbmltcG9ydCB7IElLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBNYWNMaW51eEtleWJvYXJkTWFwcGVyIH0gZnJvbSAnLi4vY29tbW9uL21hY0xpbnV4S2V5Ym9hcmRNYXBwZXIuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgcGFyc2UsIGdldE5vZGVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vanNvbi5qcyc7XG5pbXBvcnQgKiBhcyBvYmplY3RzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zIGFzIENvbmZpZ0V4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnksIElDb25maWd1cmF0aW9uTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElOYXZpZ2F0b3JXaXRoS2V5Ym9hcmQgfSBmcm9tICcuL25hdmlnYXRvcktleWJvYXJkLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgZ2V0S2V5Ym9hcmRMYXlvdXRJZCwgSUtleWJvYXJkTGF5b3V0SW5mbywgSUtleWJvYXJkTGF5b3V0U2VydmljZSwgSUtleWJvYXJkTWFwcGluZywgSU1hY0xpbnV4S2V5Ym9hcmRNYXBwaW5nLCBJV2luZG93c0tleWJvYXJkTWFwcGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJvYXJkTGF5b3V0L2NvbW1vbi9rZXlib2FyZExheW91dC5qcyc7XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyS2V5Ym9hcmRNYXBwZXJGYWN0b3J5QmFzZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHQvLyBrZXlib2FyZCBtYXBwZXJcblx0cHJvdGVjdGVkIF9pbml0aWFsaXplZDogYm9vbGVhbjtcblx0cHJvdGVjdGVkIF9rZXlib2FyZE1hcHBlcjogSUtleWJvYXJkTWFwcGVyIHwgbnVsbDtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VLZXlib2FyZE1hcHBlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgb25EaWRDaGFuZ2VLZXlib2FyZE1hcHBlcjogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZENoYW5nZUtleWJvYXJkTWFwcGVyLmV2ZW50O1xuXG5cdC8vIGtleW1hcCBpbmZvc1xuXHRwcm90ZWN0ZWQgX2tleW1hcEluZm9zOiBLZXltYXBJbmZvW107XG5cdHByb3RlY3RlZCBfbXJ1OiBLZXltYXBJbmZvW107XG5cdHByaXZhdGUgX2FjdGl2ZUtleW1hcEluZm86IEtleW1hcEluZm8gfCBudWxsO1xuXHRwcml2YXRlIGtleWJvYXJkTGF5b3V0TWFwQWxsb3dlZDogYm9vbGVhbiA9IChuYXZpZ2F0b3IgYXMgSU5hdmlnYXRvcldpdGhLZXlib2FyZCkua2V5Ym9hcmQgIT09IHVuZGVmaW5lZDtcblxuXHRnZXQgYWN0aXZlS2V5bWFwKCk6IEtleW1hcEluZm8gfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlS2V5bWFwSW5mbztcblx0fVxuXG5cdGdldCBrZXltYXBJbmZvcygpOiBLZXltYXBJbmZvW10ge1xuXHRcdHJldHVybiB0aGlzLl9rZXltYXBJbmZvcztcblx0fVxuXG5cdGdldCBhY3RpdmVLZXlib2FyZExheW91dCgpOiBJS2V5Ym9hcmRMYXlvdXRJbmZvIHwgbnVsbCB7XG5cdFx0aWYgKCF0aGlzLl9pbml0aWFsaXplZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZUtleW1hcEluZm8/LmxheW91dCA/PyBudWxsO1xuXHR9XG5cblx0Z2V0IGFjdGl2ZUtleU1hcHBpbmcoKTogSUtleWJvYXJkTWFwcGluZyB8IG51bGwge1xuXHRcdGlmICghdGhpcy5faW5pdGlhbGl6ZWQpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9hY3RpdmVLZXltYXBJbmZvPy5tYXBwaW5nID8/IG51bGw7XG5cdH1cblxuXHRnZXQga2V5Ym9hcmRMYXlvdXRzKCk6IElLZXlib2FyZExheW91dEluZm9bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2tleW1hcEluZm9zLm1hcChrZXltYXBJbmZvID0+IGtleW1hcEluZm8ubGF5b3V0KTtcblx0fVxuXG5cdHByb3RlY3RlZCBjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdC8vIHByaXZhdGUgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdC8vIHByaXZhdGUgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0Ly8gcHJpdmF0ZSBfY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2tleWJvYXJkTWFwcGVyID0gbnVsbDtcblx0XHR0aGlzLl9pbml0aWFsaXplZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2tleW1hcEluZm9zID0gW107XG5cdFx0dGhpcy5fbXJ1ID0gW107XG5cdFx0dGhpcy5fYWN0aXZlS2V5bWFwSW5mbyA9IG51bGw7XG5cblx0XHRpZiAoKDxJTmF2aWdhdG9yV2l0aEtleWJvYXJkPm5hdmlnYXRvcikua2V5Ym9hcmQgJiYgKDxJTmF2aWdhdG9yV2l0aEtleWJvYXJkPm5hdmlnYXRvcikua2V5Ym9hcmQuYWRkRXZlbnRMaXN0ZW5lcikge1xuXHRcdFx0KDxJTmF2aWdhdG9yV2l0aEtleWJvYXJkPm5hdmlnYXRvcikua2V5Ym9hcmQuYWRkRXZlbnRMaXN0ZW5lciEoJ2xheW91dGNoYW5nZScsICgpID0+IHtcblx0XHRcdFx0Ly8gVXBkYXRlIHVzZXIga2V5Ym9hcmQgbWFwIHNldHRpbmdzXG5cdFx0XHRcdHRoaXMuX2dldEJyb3dzZXJLZXlNYXBwaW5nKCkudGhlbigobWFwcGluZzogSUtleWJvYXJkTWFwcGluZyB8IG51bGwpID0+IHtcblx0XHRcdFx0XHRpZiAodGhpcy5pc0tleU1hcHBpbmdBY3RpdmUobWFwcGluZykpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLnNldExheW91dEZyb21Ccm93c2VyQVBJKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlKSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbigna2V5Ym9hcmQnKSkge1xuXHRcdFx0XHR0aGlzLl9rZXlib2FyZE1hcHBlciA9IG51bGw7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlS2V5Ym9hcmRNYXBwZXIuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHJlZ2lzdGVyS2V5Ym9hcmRMYXlvdXQobGF5b3V0OiBLZXltYXBJbmZvKSB7XG5cdFx0dGhpcy5fa2V5bWFwSW5mb3MucHVzaChsYXlvdXQpO1xuXHRcdHRoaXMuX21ydSA9IHRoaXMuX2tleW1hcEluZm9zO1xuXHR9XG5cblx0cmVtb3ZlS2V5Ym9hcmRMYXlvdXQobGF5b3V0OiBLZXltYXBJbmZvKTogdm9pZCB7XG5cdFx0bGV0IGluZGV4ID0gdGhpcy5fbXJ1LmluZGV4T2YobGF5b3V0KTtcblx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHR0aGlzLl9tcnUuc3BsaWNlKGluZGV4LCAxKTtcblx0XHR9XG5cdFx0aW5kZXggPSB0aGlzLl9rZXltYXBJbmZvcy5pbmRleE9mKGxheW91dCk7XG5cdFx0aWYgKGluZGV4ICE9PSAtMSkge1xuXHRcdFx0dGhpcy5fa2V5bWFwSW5mb3Muc3BsaWNlKGluZGV4LCAxKTtcblx0XHR9XG5cdH1cblxuXHRnZXRNYXRjaGVkS2V5bWFwSW5mbyhrZXlNYXBwaW5nOiBJS2V5Ym9hcmRNYXBwaW5nIHwgbnVsbCk6IHsgcmVzdWx0OiBLZXltYXBJbmZvOyBzY29yZTogbnVtYmVyIH0gfCBudWxsIHtcblx0XHRpZiAoIWtleU1hcHBpbmcpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVzU3RhbmRhcmQgPSB0aGlzLmdldFVTU3RhbmRhcmRMYXlvdXQoKTtcblxuXHRcdGlmICh1c1N0YW5kYXJkKSB7XG5cdFx0XHRsZXQgbWF4U2NvcmUgPSB1c1N0YW5kYXJkLmdldFNjb3JlKGtleU1hcHBpbmcpO1xuXHRcdFx0aWYgKG1heFNjb3JlID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0cmVzdWx0OiB1c1N0YW5kYXJkLFxuXHRcdFx0XHRcdHNjb3JlOiAwXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdGxldCByZXN1bHQgPSB1c1N0YW5kYXJkO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9tcnUubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3Qgc2NvcmUgPSB0aGlzLl9tcnVbaV0uZ2V0U2NvcmUoa2V5TWFwcGluZyk7XG5cdFx0XHRcdGlmIChzY29yZSA+IG1heFNjb3JlKSB7XG5cdFx0XHRcdFx0aWYgKHNjb3JlID09PSAwKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRyZXN1bHQ6IHRoaXMuX21ydVtpXSxcblx0XHRcdFx0XHRcdFx0c2NvcmU6IDBcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0bWF4U2NvcmUgPSBzY29yZTtcblx0XHRcdFx0XHRyZXN1bHQgPSB0aGlzLl9tcnVbaV07XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHRzY29yZTogbWF4U2NvcmVcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLl9tcnUubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmICh0aGlzLl9tcnVbaV0uZnV6enlFcXVhbChrZXlNYXBwaW5nKSkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHJlc3VsdDogdGhpcy5fbXJ1W2ldLFxuXHRcdFx0XHRcdHNjb3JlOiAwXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRnZXRVU1N0YW5kYXJkTGF5b3V0KCkge1xuXHRcdGNvbnN0IHVzU3RhbmRhcmRMYXlvdXRzID0gdGhpcy5fbXJ1LmZpbHRlcihsYXlvdXQgPT4gbGF5b3V0LmxheW91dC5pc1VTU3RhbmRhcmQpO1xuXG5cdFx0aWYgKHVzU3RhbmRhcmRMYXlvdXRzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVzU3RhbmRhcmRMYXlvdXRzWzBdO1xuXHRcdH1cblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0aXNLZXlNYXBwaW5nQWN0aXZlKGtleW1hcDogSUtleWJvYXJkTWFwcGluZyB8IG51bGwpIHtcblx0XHRyZXR1cm4gdGhpcy5fYWN0aXZlS2V5bWFwSW5mbyAmJiBrZXltYXAgJiYgdGhpcy5fYWN0aXZlS2V5bWFwSW5mby5mdXp6eUVxdWFsKGtleW1hcCk7XG5cdH1cblxuXHRzZXRVU0tleWJvYXJkTGF5b3V0KCkge1xuXHRcdHRoaXMuX2FjdGl2ZUtleW1hcEluZm8gPSB0aGlzLmdldFVTU3RhbmRhcmRMYXlvdXQoKTtcblx0fVxuXG5cdHNldEFjdGl2ZUtleU1hcHBpbmcoa2V5bWFwOiBJS2V5Ym9hcmRNYXBwaW5nIHwgbnVsbCkge1xuXHRcdGxldCBrZXltYXBVcGRhdGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgbWF0Y2hlZEtleWJvYXJkTGF5b3V0ID0gdGhpcy5nZXRNYXRjaGVkS2V5bWFwSW5mbyhrZXltYXApO1xuXHRcdGlmIChtYXRjaGVkS2V5Ym9hcmRMYXlvdXQpIHtcblx0XHRcdC8vIGxldCBzY29yZSA9IG1hdGNoZWRLZXlib2FyZExheW91dC5zY29yZTtcblxuXHRcdFx0Ly8gRHVlIHRvIGh0dHBzOi8vYnVncy5jaHJvbWl1bS5vcmcvcC9jaHJvbWl1bS9pc3N1ZXMvZGV0YWlsP2lkPTk3NzYwOSwgYW55IGtleSBhZnRlciBhIGRlYWQga2V5IHdpbGwgZ2VuZXJhdGUgYSB3cm9uZyBtYXBwaW5nLFxuXHRcdFx0Ly8gd2Ugc2hvdWQgYXZvaWQgeWllbGRpbmcgdGhlIGZhbHNlIGVycm9yLlxuXHRcdFx0Ly8gaWYgKGtleW1hcCAmJiBzY29yZSA8IDApIHtcblx0XHRcdC8vIGNvbnN0IGRvbm90QXNrVXBkYXRlS2V5ID0gJ21pc3Npbmcua2V5Ym9hcmRsYXlvdXQuZG9ub3Rhc2snO1xuXHRcdFx0Ly8gaWYgKHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldEJvb2xlYW4oZG9ub3RBc2tVcGRhdGVLZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikpIHtcblx0XHRcdC8vIFx0cmV0dXJuO1xuXHRcdFx0Ly8gfVxuXG5cdFx0XHQvLyB0aGUga2V5Ym9hcmQgbGF5b3V0IGRvZXNuJ3QgYWN0dWFsbHkgbWF0Y2ggdGhlIGtleSBldmVudCBvciB0aGUga2V5bWFwIGZyb20gY2hyb21pdW1cblx0XHRcdC8vIHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0Ly8gXHRTZXZlcml0eS5JbmZvLFxuXHRcdFx0Ly8gXHRubHMubG9jYWxpemUoJ21pc3Npbmcua2V5Ym9hcmRsYXlvdXQnLCAnRmFpbCB0byBmaW5kIG1hdGNoaW5nIGtleWJvYXJkIGxheW91dCcpLFxuXHRcdFx0Ly8gXHRbe1xuXHRcdFx0Ly8gXHRcdGxhYmVsOiBubHMubG9jYWxpemUoJ2tleWJvYXJkTGF5b3V0TWlzc2luZy5jb25maWd1cmUnLCBcIkNvbmZpZ3VyZVwiKSxcblx0XHRcdC8vIFx0XHRydW46ICgpID0+IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5LZXlib2FyZExheW91dFBpY2tlcicpXG5cdFx0XHQvLyBcdH0sIHtcblx0XHRcdC8vIFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCduZXZlckFnYWluJywgXCJEb24ndCBTaG93IEFnYWluXCIpLFxuXHRcdFx0Ly8gXHRcdGlzU2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0Ly8gXHRcdHJ1bjogKCkgPT4gdGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoZG9ub3RBc2tVcGRhdGVLZXksIHRydWUsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTilcblx0XHRcdC8vIFx0fV1cblx0XHRcdC8vICk7XG5cblx0XHRcdC8vIGNvbnNvbGUud2FybignQWN0aXZlIGtleW1hcC9rZXlldmVudCBkb2VzIG5vdCBtYXRjaCBjdXJyZW50IGtleWJvYXJkIGxheW91dCcsIEpTT04uc3RyaW5naWZ5KGtleW1hcCksIHRoaXMuX2FjdGl2ZUtleW1hcEluZm8gPyBKU09OLnN0cmluZ2lmeSh0aGlzLl9hY3RpdmVLZXltYXBJbmZvLmxheW91dCkgOiAnJyk7XG5cblx0XHRcdC8vIHJldHVybjtcblx0XHRcdC8vIH1cblxuXHRcdFx0aWYgKCF0aGlzLl9hY3RpdmVLZXltYXBJbmZvKSB7XG5cdFx0XHRcdHRoaXMuX2FjdGl2ZUtleW1hcEluZm8gPSBtYXRjaGVkS2V5Ym9hcmRMYXlvdXQucmVzdWx0O1xuXHRcdFx0XHRrZXltYXBVcGRhdGVkID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSBpZiAoa2V5bWFwKSB7XG5cdFx0XHRcdGlmIChtYXRjaGVkS2V5Ym9hcmRMYXlvdXQucmVzdWx0LmdldFNjb3JlKGtleW1hcCkgPiB0aGlzLl9hY3RpdmVLZXltYXBJbmZvLmdldFNjb3JlKGtleW1hcCkpIHtcblx0XHRcdFx0XHR0aGlzLl9hY3RpdmVLZXltYXBJbmZvID0gbWF0Y2hlZEtleWJvYXJkTGF5b3V0LnJlc3VsdDtcblx0XHRcdFx0XHRrZXltYXBVcGRhdGVkID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fYWN0aXZlS2V5bWFwSW5mbykge1xuXHRcdFx0dGhpcy5fYWN0aXZlS2V5bWFwSW5mbyA9IHRoaXMuZ2V0VVNTdGFuZGFyZExheW91dCgpO1xuXHRcdFx0a2V5bWFwVXBkYXRlZCA9IHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9hY3RpdmVLZXltYXBJbmZvIHx8ICFrZXltYXBVcGRhdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9tcnUuaW5kZXhPZih0aGlzLl9hY3RpdmVLZXltYXBJbmZvKTtcblxuXHRcdHRoaXMuX21ydS5zcGxpY2UoaW5kZXgsIDEpO1xuXHRcdHRoaXMuX21ydS51bnNoaWZ0KHRoaXMuX2FjdGl2ZUtleW1hcEluZm8pO1xuXG5cdFx0dGhpcy5fc2V0S2V5Ym9hcmREYXRhKHRoaXMuX2FjdGl2ZUtleW1hcEluZm8pO1xuXHR9XG5cblx0c2V0QWN0aXZlS2V5bWFwSW5mbyhrZXltYXBJbmZvOiBLZXltYXBJbmZvKSB7XG5cdFx0dGhpcy5fYWN0aXZlS2V5bWFwSW5mbyA9IGtleW1hcEluZm87XG5cblx0XHRjb25zdCBpbmRleCA9IHRoaXMuX21ydS5pbmRleE9mKHRoaXMuX2FjdGl2ZUtleW1hcEluZm8pO1xuXG5cdFx0aWYgKGluZGV4ID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fbXJ1LnNwbGljZShpbmRleCwgMSk7XG5cdFx0dGhpcy5fbXJ1LnVuc2hpZnQodGhpcy5fYWN0aXZlS2V5bWFwSW5mbyk7XG5cblx0XHR0aGlzLl9zZXRLZXlib2FyZERhdGEodGhpcy5fYWN0aXZlS2V5bWFwSW5mbyk7XG5cdH1cblxuXHRwdWJsaWMgc2V0TGF5b3V0RnJvbUJyb3dzZXJBUEkoKTogdm9pZCB7XG5cdFx0dGhpcy5fdXBkYXRlS2V5Ym9hcmRMYXlvdXRBc3luYyh0aGlzLl9pbml0aWFsaXplZCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVLZXlib2FyZExheW91dEFzeW5jKGluaXRpYWxpemVkOiBib29sZWFuLCBrZXlib2FyZEV2ZW50PzogSUtleWJvYXJkRXZlbnQpIHtcblx0XHRpZiAoIWluaXRpYWxpemVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZ2V0QnJvd3NlcktleU1hcHBpbmcoa2V5Ym9hcmRFdmVudCkudGhlbihrZXlNYXAgPT4ge1xuXHRcdFx0Ly8gbWlnaHQgYmUgZmFsc2UgcG9zaXRpdmVcblx0XHRcdGlmICh0aGlzLmlzS2V5TWFwcGluZ0FjdGl2ZShrZXlNYXApKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuc2V0QWN0aXZlS2V5TWFwcGluZyhrZXlNYXApO1xuXHRcdH0pO1xuXHR9XG5cblx0cHVibGljIGdldEtleWJvYXJkTWFwcGVyKCk6IElLZXlib2FyZE1hcHBlciB7XG5cdFx0Y29uc3QgY29uZmlnID0gcmVhZEtleWJvYXJkQ29uZmlnKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRpZiAoY29uZmlnLmRpc3BhdGNoID09PSBEaXNwYXRjaENvbmZpZy5LZXlDb2RlIHx8ICF0aGlzLl9pbml0aWFsaXplZCB8fCAhdGhpcy5fYWN0aXZlS2V5bWFwSW5mbykge1xuXHRcdFx0Ly8gRm9yY2VmdWxseSBzZXQgdG8gdXNlIGtleUNvZGVcblx0XHRcdHJldHVybiBuZXcgRmFsbGJhY2tLZXlib2FyZE1hcHBlcihjb25maWcubWFwQWx0R3JUb0N0cmxBbHQsIE9TKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9rZXlib2FyZE1hcHBlcikge1xuXHRcdFx0dGhpcy5fa2V5Ym9hcmRNYXBwZXIgPSBuZXcgQ2FjaGVkS2V5Ym9hcmRNYXBwZXIoQnJvd3NlcktleWJvYXJkTWFwcGVyRmFjdG9yeS5fY3JlYXRlS2V5Ym9hcmRNYXBwZXIodGhpcy5fYWN0aXZlS2V5bWFwSW5mbywgY29uZmlnLm1hcEFsdEdyVG9DdHJsQWx0KSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9rZXlib2FyZE1hcHBlcjtcblx0fVxuXG5cdHB1YmxpYyB2YWxpZGF0ZUN1cnJlbnRLZXlib2FyZE1hcHBpbmcoa2V5Ym9hcmRFdmVudDogSUtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2luaXRpYWxpemVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNDdXJyZW50S2V5Ym9hcmQgPSB0aGlzLl92YWxpZGF0ZUN1cnJlbnRLZXlib2FyZE1hcHBpbmcoa2V5Ym9hcmRFdmVudCk7XG5cblx0XHRpZiAoaXNDdXJyZW50S2V5Ym9hcmQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVLZXlib2FyZExheW91dEFzeW5jKHRydWUsIGtleWJvYXJkRXZlbnQpO1xuXHR9XG5cblx0cHVibGljIHNldEtleWJvYXJkTGF5b3V0KGxheW91dE5hbWU6IHN0cmluZykge1xuXHRcdGNvbnN0IG1hdGNoZWRMYXlvdXRzOiBLZXltYXBJbmZvW10gPSB0aGlzLmtleW1hcEluZm9zLmZpbHRlcihrZXltYXBJbmZvID0+IGdldEtleWJvYXJkTGF5b3V0SWQoa2V5bWFwSW5mby5sYXlvdXQpID09PSBsYXlvdXROYW1lKTtcblxuXHRcdGlmIChtYXRjaGVkTGF5b3V0cy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLnNldEFjdGl2ZUtleW1hcEluZm8obWF0Y2hlZExheW91dHNbMF0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NldEtleWJvYXJkRGF0YShrZXltYXBJbmZvOiBLZXltYXBJbmZvKTogdm9pZCB7XG5cdFx0dGhpcy5faW5pdGlhbGl6ZWQgPSB0cnVlO1xuXG5cdFx0dGhpcy5fa2V5Ym9hcmRNYXBwZXIgPSBudWxsO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlS2V5Ym9hcmRNYXBwZXIuZmlyZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NyZWF0ZUtleWJvYXJkTWFwcGVyKGtleW1hcEluZm86IEtleW1hcEluZm8sIG1hcEFsdEdyVG9DdHJsQWx0OiBib29sZWFuKTogSUtleWJvYXJkTWFwcGVyIHtcblx0XHRjb25zdCByYXdNYXBwaW5nID0ga2V5bWFwSW5mby5tYXBwaW5nO1xuXHRcdGNvbnN0IGlzVVNTdGFuZGFyZCA9ICEha2V5bWFwSW5mby5sYXlvdXQuaXNVU1N0YW5kYXJkO1xuXHRcdGlmIChPUyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRcdHJldHVybiBuZXcgV2luZG93c0tleWJvYXJkTWFwcGVyKGlzVVNTdGFuZGFyZCwgPElXaW5kb3dzS2V5Ym9hcmRNYXBwaW5nPnJhd01hcHBpbmcsIG1hcEFsdEdyVG9DdHJsQWx0KTtcblx0XHR9XG5cdFx0aWYgKE9iamVjdC5rZXlzKHJhd01hcHBpbmcpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gTG9va3MgbGlrZSByZWFkaW5nIHRoZSBtYXBwaW5ncyBmYWlsZWQgKG1vc3QgbGlrZWx5IE1hYyArIEphcGFuZXNlL0NoaW5lc2Uga2V5Ym9hcmQgbGF5b3V0cylcblx0XHRcdHJldHVybiBuZXcgRmFsbGJhY2tLZXlib2FyZE1hcHBlcihtYXBBbHRHclRvQ3RybEFsdCwgT1MpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgTWFjTGludXhLZXlib2FyZE1hcHBlcihpc1VTU3RhbmRhcmQsIDxJTWFjTGludXhLZXlib2FyZE1hcHBpbmc+cmF3TWFwcGluZywgbWFwQWx0R3JUb0N0cmxBbHQsIE9TKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBCcm93c2VyIEFQSVxuXHRwcml2YXRlIF92YWxpZGF0ZUN1cnJlbnRLZXlib2FyZE1hcHBpbmcoa2V5Ym9hcmRFdmVudDogSUtleWJvYXJkRXZlbnQpOiBib29sZWFuIHtcblx0XHRpZiAoIXRoaXMuX2luaXRpYWxpemVkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFuZGFyZEtleWJvYXJkRXZlbnQgPSBrZXlib2FyZEV2ZW50IGFzIFN0YW5kYXJkS2V5Ym9hcmRFdmVudDtcblx0XHRjb25zdCBjdXJyZW50S2V5bWFwID0gdGhpcy5fYWN0aXZlS2V5bWFwSW5mbztcblx0XHRpZiAoIWN1cnJlbnRLZXltYXApIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChzdGFuZGFyZEtleWJvYXJkRXZlbnQuYnJvd3NlckV2ZW50LmtleSA9PT0gJ0RlYWQnIHx8IHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5icm93c2VyRXZlbnQuaXNDb21wb3NpbmcpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1hcHBpbmcgPSBjdXJyZW50S2V5bWFwLm1hcHBpbmdbc3RhbmRhcmRLZXlib2FyZEV2ZW50LmNvZGVdO1xuXG5cdFx0aWYgKCFtYXBwaW5nKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKG1hcHBpbmcudmFsdWUgPT09ICcnKSB7XG5cdFx0XHQvLyBUaGUgdmFsdWUgaXMgZW1wdHkgd2hlbiB0aGUga2V5IGlzIG5vdCBhIHByaW50YWJsZSBjaGFyYWN0ZXIsIHdlIHNraXAgdmFsaWRhdGlvbi5cblx0XHRcdGlmIChrZXlib2FyZEV2ZW50LmN0cmxLZXkgfHwga2V5Ym9hcmRFdmVudC5tZXRhS2V5KSB7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2dldEJyb3dzZXJLZXlNYXBwaW5nKCkudGhlbigoa2V5bWFwOiBJUmF3TWl4ZWRLZXlib2FyZE1hcHBpbmcgfCBudWxsKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5pc0tleU1hcHBpbmdBY3RpdmUoa2V5bWFwKSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHRoaXMuc2V0TGF5b3V0RnJvbUJyb3dzZXJBUEkoKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSwgMzUwKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGV4cGVjdGVkVmFsdWUgPSBzdGFuZGFyZEtleWJvYXJkRXZlbnQuYWx0S2V5ICYmIHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5zaGlmdEtleSA/IG1hcHBpbmcud2l0aFNoaWZ0QWx0R3IgOlxuXHRcdFx0c3RhbmRhcmRLZXlib2FyZEV2ZW50LmFsdEtleSA/IG1hcHBpbmcud2l0aEFsdEdyIDpcblx0XHRcdFx0c3RhbmRhcmRLZXlib2FyZEV2ZW50LnNoaWZ0S2V5ID8gbWFwcGluZy53aXRoU2hpZnQgOiBtYXBwaW5nLnZhbHVlO1xuXG5cdFx0Y29uc3QgaXNEZWFkID0gKHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5hbHRLZXkgJiYgc3RhbmRhcmRLZXlib2FyZEV2ZW50LnNoaWZ0S2V5ICYmIG1hcHBpbmcud2l0aFNoaWZ0QWx0R3JJc0RlYWRLZXkpIHx8XG5cdFx0XHQoc3RhbmRhcmRLZXlib2FyZEV2ZW50LmFsdEtleSAmJiBtYXBwaW5nLndpdGhBbHRHcklzRGVhZEtleSkgfHxcblx0XHRcdChzdGFuZGFyZEtleWJvYXJkRXZlbnQuc2hpZnRLZXkgJiYgbWFwcGluZy53aXRoU2hpZnRJc0RlYWRLZXkpIHx8XG5cdFx0XHRtYXBwaW5nLnZhbHVlSXNEZWFkS2V5O1xuXG5cdFx0aWYgKGlzRGVhZCAmJiBzdGFuZGFyZEtleWJvYXJkRXZlbnQuYnJvd3NlckV2ZW50LmtleSAhPT0gJ0RlYWQnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gVE9ETywgdGhpcyBhc3N1bXB0aW9uIGlzIHdyb25nIGFzIGBicm93c2VyRXZlbnQua2V5YCBkb2Vzbid0IG5lY2Vzc2FyaWx5IGVxdWFsIGV4cGVjdGVkVmFsdWUgZnJvbSByZWFsIGtleW1hcFxuXHRcdGlmICghaXNEZWFkICYmIHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5icm93c2VyRXZlbnQua2V5ICE9PSBleHBlY3RlZFZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9nZXRCcm93c2VyS2V5TWFwcGluZyhrZXlib2FyZEV2ZW50PzogSUtleWJvYXJkRXZlbnQpOiBQcm9taXNlPElSYXdNaXhlZEtleWJvYXJkTWFwcGluZyB8IG51bGw+IHtcblx0XHRpZiAodGhpcy5rZXlib2FyZExheW91dE1hcEFsbG93ZWQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCAobmF2aWdhdG9yIGFzIElOYXZpZ2F0b3JXaXRoS2V5Ym9hcmQpLmtleWJvYXJkLmdldExheW91dE1hcCgpLnRoZW4oKGU6IGFueSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHJldDogSUtleWJvYXJkTWFwcGluZyA9IHt9O1xuXHRcdFx0XHRcdGZvciAoY29uc3Qga2V5IG9mIGUpIHtcblx0XHRcdFx0XHRcdHJldFtrZXlbMF1dID0ge1xuXHRcdFx0XHRcdFx0XHQndmFsdWUnOiBrZXlbMV0sXG5cdFx0XHRcdFx0XHRcdCd3aXRoU2hpZnQnOiAnJyxcblx0XHRcdFx0XHRcdFx0J3dpdGhBbHRHcic6ICcnLFxuXHRcdFx0XHRcdFx0XHQnd2l0aFNoaWZ0QWx0R3InOiAnJ1xuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gcmV0O1xuXG5cdFx0XHRcdFx0Ly8gY29uc3QgbWF0Y2hlZEtleWJvYXJkTGF5b3V0ID0gdGhpcy5nZXRNYXRjaGVkS2V5bWFwSW5mbyhyZXQpO1xuXG5cdFx0XHRcdFx0Ly8gaWYgKG1hdGNoZWRLZXlib2FyZExheW91dCkge1xuXHRcdFx0XHRcdC8vIFx0cmV0dXJuIG1hdGNoZWRLZXlib2FyZExheW91dC5yZXN1bHQubWFwcGluZztcblx0XHRcdFx0XHQvLyB9XG5cblx0XHRcdFx0XHQvLyByZXR1cm4gbnVsbDtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gZ2V0TGF5b3V0TWFwIGNhbiB0aHJvdyBpZiBpbnZva2VkIGZyb20gYSBuZXN0ZWQgYnJvd3NpbmcgY29udGV4dFxuXHRcdFx0XHR0aGlzLmtleWJvYXJkTGF5b3V0TWFwQWxsb3dlZCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoa2V5Ym9hcmRFdmVudCAmJiAha2V5Ym9hcmRFdmVudC5zaGlmdEtleSAmJiAha2V5Ym9hcmRFdmVudC5hbHRLZXkgJiYgIWtleWJvYXJkRXZlbnQubWV0YUtleSAmJiAha2V5Ym9hcmRFdmVudC5tZXRhS2V5KSB7XG5cdFx0XHRjb25zdCByZXQ6IElLZXlib2FyZE1hcHBpbmcgPSB7fTtcblx0XHRcdGNvbnN0IHN0YW5kYXJkS2V5Ym9hcmRFdmVudCA9IGtleWJvYXJkRXZlbnQgYXMgU3RhbmRhcmRLZXlib2FyZEV2ZW50O1xuXHRcdFx0cmV0W3N0YW5kYXJkS2V5Ym9hcmRFdmVudC5icm93c2VyRXZlbnQuY29kZV0gPSB7XG5cdFx0XHRcdCd2YWx1ZSc6IHN0YW5kYXJkS2V5Ym9hcmRFdmVudC5icm93c2VyRXZlbnQua2V5LFxuXHRcdFx0XHQnd2l0aFNoaWZ0JzogJycsXG5cdFx0XHRcdCd3aXRoQWx0R3InOiAnJyxcblx0XHRcdFx0J3dpdGhTaGlmdEFsdEdyJzogJydcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IG1hdGNoZWRLZXlib2FyZExheW91dCA9IHRoaXMuZ2V0TWF0Y2hlZEtleW1hcEluZm8ocmV0KTtcblxuXHRcdFx0aWYgKG1hdGNoZWRLZXlib2FyZExheW91dCkge1xuXHRcdFx0XHRyZXR1cm4gcmV0O1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuXG5leHBvcnQgY2xhc3MgQnJvd3NlcktleWJvYXJkTWFwcGVyRmFjdG9yeSBleHRlbmRzIEJyb3dzZXJLZXlib2FyZE1hcHBlckZhY3RvcnlCYXNlIHtcblx0Y29uc3RydWN0b3IoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UpIHtcblx0XHQvLyBzdXBlcihub3RpZmljYXRpb25TZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgY29tbWFuZFNlcnZpY2UpO1xuXHRcdHN1cGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHBsYXRmb3JtID0gaXNXaW5kb3dzID8gJ3dpbicgOiBpc01hY2ludG9zaCA/ICdkYXJ3aW4nIDogJ2xpbnV4JztcblxuXHRcdGltcG9ydCgvKiB3ZWJwYWNrSWdub3JlOiB0cnVlICovRmlsZUFjY2Vzcy5hc0Jyb3dzZXJVcmkoYHZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9rZXliaW5kaW5nL2Jyb3dzZXIva2V5Ym9hcmRMYXlvdXRzL2xheW91dC5jb250cmlidXRpb24uJHtwbGF0Zm9ybX0uanNgIHNhdGlzZmllcyBBcHBSZXNvdXJjZVBhdGgpLnBhdGgpLnRoZW4oKG0pID0+IHtcblx0XHRcdGNvbnN0IGtleW1hcEluZm9zOiBJS2V5bWFwSW5mb1tdID0gbS5LZXlib2FyZExheW91dENvbnRyaWJ1dGlvbi5JTlNUQU5DRS5sYXlvdXRJbmZvcztcblx0XHRcdHRoaXMuX2tleW1hcEluZm9zLnB1c2goLi4ua2V5bWFwSW5mb3MubWFwKGluZm8gPT4gKG5ldyBLZXltYXBJbmZvKGluZm8ubGF5b3V0LCBpbmZvLnNlY29uZGFyeUxheW91dHMsIGluZm8ubWFwcGluZywgaW5mby5pc1VzZXJLZXlib2FyZExheW91dCkpKSk7XG5cdFx0XHR0aGlzLl9tcnUgPSB0aGlzLl9rZXltYXBJbmZvcztcblx0XHRcdHRoaXMuX2luaXRpYWxpemVkID0gdHJ1ZTtcblx0XHRcdHRoaXMuc2V0TGF5b3V0RnJvbUJyb3dzZXJBUEkoKTtcblx0XHR9KTtcblx0fVxufVxuXG5jbGFzcyBVc2VyS2V5Ym9hcmRMYXlvdXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHJlbG9hZENvbmZpZ3VyYXRpb25TY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2U6IEVtaXR0ZXI8dm9pZD4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfa2V5Ym9hcmRMYXlvdXQ6IEtleW1hcEluZm8gfCBudWxsO1xuXHRnZXQga2V5Ym9hcmRMYXlvdXQoKTogS2V5bWFwSW5mbyB8IG51bGwgeyByZXR1cm4gdGhpcy5fa2V5Ym9hcmRMYXlvdXQ7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGtleWJvYXJkTGF5b3V0UmVzb3VyY2U6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX2tleWJvYXJkTGF5b3V0ID0gbnVsbDtcblxuXHRcdHRoaXMucmVsb2FkQ29uZmlndXJhdGlvblNjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMucmVsb2FkKCkudGhlbihjaGFuZ2VkID0+IHtcblx0XHRcdGlmIChjaGFuZ2VkKSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSwgNTApKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmZpbHRlcih0aGlzLmZpbGVTZXJ2aWNlLm9uRGlkRmlsZXNDaGFuZ2UsIGUgPT4gZS5jb250YWlucyh0aGlzLmtleWJvYXJkTGF5b3V0UmVzb3VyY2UpKSgoKSA9PiB0aGlzLnJlbG9hZENvbmZpZ3VyYXRpb25TY2hlZHVsZXIuc2NoZWR1bGUoKSkpO1xuXHR9XG5cblx0YXN5bmMgaW5pdGlhbGl6ZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLnJlbG9hZCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWxvYWQoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9rZXlib2FyZExheW91dDtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuZmlsZVNlcnZpY2UucmVhZEZpbGUodGhpcy5rZXlib2FyZExheW91dFJlc291cmNlKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gcGFyc2UoY29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0XHRcdGlmIChnZXROb2RlVHlwZSh2YWx1ZSkgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRcdGNvbnN0IGxheW91dEluZm8gPSB2YWx1ZS5sYXlvdXQ7XG5cdFx0XHRcdGNvbnN0IG1hcHBpbmdzID0gdmFsdWUucmF3TWFwcGluZztcblx0XHRcdFx0dGhpcy5fa2V5Ym9hcmRMYXlvdXQgPSBLZXltYXBJbmZvLmNyZWF0ZUtleWJvYXJkTGF5b3V0RnJvbURlYnVnSW5mbyhsYXlvdXRJbmZvLCBtYXBwaW5ncywgdHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9rZXlib2FyZExheW91dCA9IG51bGw7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0dGhpcy5fa2V5Ym9hcmRMYXlvdXQgPSBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiBleGlzdGluZyA/ICFvYmplY3RzLmVxdWFscyhleGlzdGluZywgdGhpcy5fa2V5Ym9hcmRMYXlvdXQpIDogdHJ1ZTtcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBCcm93c2VyS2V5Ym9hcmRMYXlvdXRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElLZXlib2FyZExheW91dFNlcnZpY2Uge1xuXHRwdWJsaWMgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlS2V5Ym9hcmRMYXlvdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkQ2hhbmdlS2V5Ym9hcmRMYXlvdXQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWRDaGFuZ2VLZXlib2FyZExheW91dC5ldmVudDtcblxuXHRwcml2YXRlIF91c2VyS2V5Ym9hcmRMYXlvdXQ6IFVzZXJLZXlib2FyZExheW91dDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9mYWN0b3J5OiBCcm93c2VyS2V5Ym9hcmRNYXBwZXJGYWN0b3J5O1xuXHRwcml2YXRlIF9rZXlib2FyZExheW91dE1vZGU6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVudmlyb25tZW50U2VydmljZSBlbnZpcm9ubWVudFNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdGNvbnN0IGtleWJvYXJkQ29uZmlnID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBsYXlvdXQ6IHN0cmluZyB9Pigna2V5Ym9hcmQnKTtcblx0XHRjb25zdCBsYXlvdXQgPSBrZXlib2FyZENvbmZpZy5sYXlvdXQ7XG5cdFx0dGhpcy5fa2V5Ym9hcmRMYXlvdXRNb2RlID0gbGF5b3V0ID8/ICdhdXRvZGV0ZWN0Jztcblx0XHR0aGlzLl9mYWN0b3J5ID0gbmV3IEJyb3dzZXJLZXlib2FyZE1hcHBlckZhY3RvcnkoY29uZmlndXJhdGlvblNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlLCBjb21tYW5kU2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9mYWN0b3J5Lm9uRGlkQ2hhbmdlS2V5Ym9hcmRNYXBwZXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VLZXlib2FyZExheW91dC5maXJlKCk7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKGxheW91dCAmJiBsYXlvdXQgIT09ICdhdXRvZGV0ZWN0Jykge1xuXHRcdFx0Ly8gc2V0IGtleWJvYXJkIGxheW91dFxuXHRcdFx0dGhpcy5fZmFjdG9yeS5zZXRLZXlib2FyZExheW91dChsYXlvdXQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKCdrZXlib2FyZC5sYXlvdXQnKSkge1xuXHRcdFx0XHRjb25zdCBrZXlib2FyZENvbmZpZyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHsgbGF5b3V0OiBzdHJpbmcgfT4oJ2tleWJvYXJkJyk7XG5cdFx0XHRcdGNvbnN0IGxheW91dCA9IGtleWJvYXJkQ29uZmlnLmxheW91dDtcblx0XHRcdFx0dGhpcy5fa2V5Ym9hcmRMYXlvdXRNb2RlID0gbGF5b3V0O1xuXG5cdFx0XHRcdGlmIChsYXlvdXQgPT09ICdhdXRvZGV0ZWN0Jykge1xuXHRcdFx0XHRcdHRoaXMuX2ZhY3Rvcnkuc2V0TGF5b3V0RnJvbUJyb3dzZXJBUEkoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9mYWN0b3J5LnNldEtleWJvYXJkTGF5b3V0KGxheW91dCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl91c2VyS2V5Ym9hcmRMYXlvdXQgPSBuZXcgVXNlcktleWJvYXJkTGF5b3V0KGVudmlyb25tZW50U2VydmljZS5rZXlib2FyZExheW91dFJlc291cmNlLCBmaWxlU2VydmljZSk7XG5cdFx0dGhpcy5fdXNlcktleWJvYXJkTGF5b3V0LmluaXRpYWxpemUoKS50aGVuKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLl91c2VyS2V5Ym9hcmRMYXlvdXQua2V5Ym9hcmRMYXlvdXQpIHtcblx0XHRcdFx0dGhpcy5fZmFjdG9yeS5yZWdpc3RlcktleWJvYXJkTGF5b3V0KHRoaXMuX3VzZXJLZXlib2FyZExheW91dC5rZXlib2FyZExheW91dCk7XG5cblx0XHRcdFx0dGhpcy5zZXRVc2VyS2V5Ym9hcmRMYXlvdXRJZk1hdGNoZWQoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3VzZXJLZXlib2FyZExheW91dC5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRjb25zdCB1c2VyS2V5Ym9hcmRMYXlvdXRzID0gdGhpcy5fZmFjdG9yeS5rZXltYXBJbmZvcy5maWx0ZXIobGF5b3V0ID0+IGxheW91dC5pc1VzZXJLZXlib2FyZExheW91dCk7XG5cblx0XHRcdGlmICh1c2VyS2V5Ym9hcmRMYXlvdXRzLmxlbmd0aCkge1xuXHRcdFx0XHRpZiAodGhpcy5fdXNlcktleWJvYXJkTGF5b3V0LmtleWJvYXJkTGF5b3V0KSB7XG5cdFx0XHRcdFx0dXNlcktleWJvYXJkTGF5b3V0c1swXS51cGRhdGUodGhpcy5fdXNlcktleWJvYXJkTGF5b3V0LmtleWJvYXJkTGF5b3V0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9mYWN0b3J5LnJlbW92ZUtleWJvYXJkTGF5b3V0KHVzZXJLZXlib2FyZExheW91dHNbMF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRpZiAodGhpcy5fdXNlcktleWJvYXJkTGF5b3V0LmtleWJvYXJkTGF5b3V0KSB7XG5cdFx0XHRcdFx0dGhpcy5fZmFjdG9yeS5yZWdpc3RlcktleWJvYXJkTGF5b3V0KHRoaXMuX3VzZXJLZXlib2FyZExheW91dC5rZXlib2FyZExheW91dCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zZXRVc2VyS2V5Ym9hcmRMYXlvdXRJZk1hdGNoZWQoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRzZXRVc2VyS2V5Ym9hcmRMYXlvdXRJZk1hdGNoZWQoKSB7XG5cdFx0Y29uc3Qga2V5Ym9hcmRDb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHsgbGF5b3V0OiBzdHJpbmcgfT4oJ2tleWJvYXJkJyk7XG5cdFx0Y29uc3QgbGF5b3V0ID0ga2V5Ym9hcmRDb25maWcubGF5b3V0O1xuXG5cdFx0aWYgKGxheW91dCAmJiB0aGlzLl91c2VyS2V5Ym9hcmRMYXlvdXQua2V5Ym9hcmRMYXlvdXQpIHtcblx0XHRcdGlmIChnZXRLZXlib2FyZExheW91dElkKHRoaXMuX3VzZXJLZXlib2FyZExheW91dC5rZXlib2FyZExheW91dC5sYXlvdXQpID09PSBsYXlvdXQgJiYgdGhpcy5fZmFjdG9yeS5hY3RpdmVLZXltYXApIHtcblxuXHRcdFx0XHRpZiAoIXRoaXMuX3VzZXJLZXlib2FyZExheW91dC5rZXlib2FyZExheW91dC5lcXVhbCh0aGlzLl9mYWN0b3J5LmFjdGl2ZUtleW1hcCkpIHtcblx0XHRcdFx0XHR0aGlzLl9mYWN0b3J5LnNldEFjdGl2ZUtleW1hcEluZm8odGhpcy5fdXNlcktleWJvYXJkTGF5b3V0LmtleWJvYXJkTGF5b3V0KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldEtleWJvYXJkTWFwcGVyKCk6IElLZXlib2FyZE1hcHBlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZhY3RvcnkuZ2V0S2V5Ym9hcmRNYXBwZXIoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDdXJyZW50S2V5Ym9hcmRMYXlvdXQoKTogSUtleWJvYXJkTGF5b3V0SW5mbyB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9mYWN0b3J5LmFjdGl2ZUtleWJvYXJkTGF5b3V0O1xuXHR9XG5cblx0cHVibGljIGdldEFsbEtleWJvYXJkTGF5b3V0cygpOiBJS2V5Ym9hcmRMYXlvdXRJbmZvW10ge1xuXHRcdHJldHVybiB0aGlzLl9mYWN0b3J5LmtleWJvYXJkTGF5b3V0cztcblx0fVxuXG5cdHB1YmxpYyBnZXRSYXdLZXlib2FyZE1hcHBpbmcoKTogSUtleWJvYXJkTWFwcGluZyB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9mYWN0b3J5LmFjdGl2ZUtleU1hcHBpbmc7XG5cdH1cblxuXHRwdWJsaWMgdmFsaWRhdGVDdXJyZW50S2V5Ym9hcmRNYXBwaW5nKGtleWJvYXJkRXZlbnQ6IElLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2tleWJvYXJkTGF5b3V0TW9kZSAhPT0gJ2F1dG9kZXRlY3QnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZmFjdG9yeS52YWxpZGF0ZUN1cnJlbnRLZXlib2FyZE1hcHBpbmcoa2V5Ym9hcmRFdmVudCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUtleWJvYXJkTGF5b3V0U2VydmljZSwgQnJvd3NlcktleWJvYXJkTGF5b3V0U2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG5cbi8vIENvbmZpZ3VyYXRpb25cbmNvbnN0IGNvbmZpZ3VyYXRpb25SZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uUmVnaXN0cnk+KENvbmZpZ0V4dGVuc2lvbnMuQ29uZmlndXJhdGlvbik7XG5jb25zdCBrZXlib2FyZENvbmZpZ3VyYXRpb246IElDb25maWd1cmF0aW9uTm9kZSA9IHtcblx0J2lkJzogJ2tleWJvYXJkJyxcblx0J29yZGVyJzogMTUsXG5cdCd0eXBlJzogJ29iamVjdCcsXG5cdCd0aXRsZSc6IG5scy5sb2NhbGl6ZSgna2V5Ym9hcmRDb25maWd1cmF0aW9uVGl0bGUnLCBcIktleWJvYXJkXCIpLFxuXHQncHJvcGVydGllcyc6IHtcblx0XHQna2V5Ym9hcmQubGF5b3V0Jzoge1xuXHRcdFx0J3R5cGUnOiAnc3RyaW5nJyxcblx0XHRcdCdkZWZhdWx0JzogJ2F1dG9kZXRlY3QnLFxuXHRcdFx0J2Rlc2NyaXB0aW9uJzogbmxzLmxvY2FsaXplKCdrZXlib2FyZC5sYXlvdXQuY29uZmlnJywgXCJDb250cm9sIHRoZSBrZXlib2FyZCBsYXlvdXQgdXNlZCBpbiB3ZWIuXCIpXG5cdFx0fVxuXHR9XG59O1xuXG5jb25maWd1cmF0aW9uUmVnaXN0cnkucmVnaXN0ZXJD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
