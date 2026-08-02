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
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { mixin } from "../../../base/common/objects.js";
import { isWeb } from "../../../base/common/platform.js";
import { PolicyCategory } from "../../../base/common/policy.js";
import { escapeRegExpCharacters } from "../../../base/common/strings.js";
import { localize } from "../../../nls.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { ConfigurationScope, Extensions } from "../../configuration/common/configurationRegistry.js";
import product from "../../product/common/product.js";
import { IProductService } from "../../product/common/productService.js";
import { Registry } from "../../registry/common/platform.js";
import { TelemetryConfiguration, TelemetryLevel, TELEMETRY_CRASH_REPORTER_SETTING_ID, TELEMETRY_OLD_SETTING_ID, TELEMETRY_SECTION_ID, TELEMETRY_SETTING_ID } from "./telemetry.js";
import { cleanData, getTelemetryLevel, TelemetryTrustedValue } from "./telemetryUtils.js";
let TelemetryService = class {
  constructor(config, _configurationService, _productService) {
    this._configurationService = _configurationService;
    this._productService = _productService;
    this._experimentProperties = {};
    this._pendingEvents = [];
    this._isExperimentPropertySet = false;
    this._disposables = new DisposableStore();
    this._cleanupPatterns = [];
    this._appenders = config.appenders;
    this._commonProperties = config.commonProperties ?? /* @__PURE__ */ Object.create(null);
    this.sessionId = this._commonProperties["sessionID"];
    this.machineId = this._commonProperties["common.machineId"];
    this.sqmId = this._commonProperties["common.sqmId"];
    this.devDeviceId = this._commonProperties["common.devDeviceId"];
    this.firstSessionDate = this._commonProperties["common.firstSessionDate"];
    this.msftInternal = this._commonProperties["common.msftInternal"];
    this._piiPaths = config.piiPaths || [];
    this._telemetryLevel = TelemetryLevel.USAGE;
    this._sendErrorTelemetry = !!config.sendErrorTelemetry;
    this._meteredConnectionService = config.meteredConnectionService;
    this._cleanupPatterns = [/(vscode-)?file:\/\/.*?\/resources\/app\//gi];
    for (const piiPath of this._piiPaths) {
      this._cleanupPatterns.push(new RegExp(escapeRegExpCharacters(piiPath), "gi"));
      if (piiPath.indexOf("\\") >= 0) {
        this._cleanupPatterns.push(new RegExp(escapeRegExpCharacters(piiPath.replace(/\\/g, "/")), "gi"));
      }
    }
    this._updateTelemetryLevel();
    this._disposables.add(this._configurationService.onDidChangeConfiguration((e) => {
      const affectsTelemetryConfig = e.affectsConfiguration(TELEMETRY_SETTING_ID) || e.affectsConfiguration(TELEMETRY_OLD_SETTING_ID) || e.affectsConfiguration(TELEMETRY_CRASH_REPORTER_SETTING_ID);
      if (affectsTelemetryConfig) {
        this._updateTelemetryLevel();
      }
    }));
    if (config.waitForExperimentProperties) {
      this._flushTimeout = setTimeout(() => this._flushPendingEvents(), TelemetryService.BUFFER_FLUSH_TIMEOUT);
    } else {
      this._isExperimentPropertySet = true;
    }
  }
  setExperimentProperty(name, value) {
    this._experimentProperties[name] = new TelemetryTrustedValue(value);
    if (!this._isExperimentPropertySet) {
      this._flushPendingEvents();
    }
  }
  setCommonProperty(name, value) {
    this._commonProperties[name] = value;
  }
  _flushPendingEvents() {
    if (this._isExperimentPropertySet) {
      return;
    }
    this._isExperimentPropertySet = true;
    if (this._flushTimeout !== void 0) {
      clearTimeout(this._flushTimeout);
      this._flushTimeout = void 0;
    }
    for (const event of this._pendingEvents) {
      this._doLog(event.eventName, event.eventLevel, event.data);
    }
    this._pendingEvents = [];
  }
  _updateTelemetryLevel() {
    let level = getTelemetryLevel(this._configurationService);
    const collectableTelemetry = this._productService.enabledTelemetryLevels;
    if (collectableTelemetry) {
      this._sendErrorTelemetry = this.sendErrorTelemetry ? collectableTelemetry.error : false;
      const maxCollectableTelemetryLevel = collectableTelemetry.usage ? TelemetryLevel.USAGE : collectableTelemetry.error ? TelemetryLevel.ERROR : TelemetryLevel.NONE;
      level = Math.min(level, maxCollectableTelemetryLevel);
    }
    this._telemetryLevel = level;
  }
  get sendErrorTelemetry() {
    return this._sendErrorTelemetry;
  }
  get telemetryLevel() {
    return this._telemetryLevel;
  }
  dispose() {
    this._flushPendingEvents();
    this._disposables.dispose();
  }
  _log(eventName, eventLevel, data) {
    if (this._telemetryLevel < eventLevel) {
      return;
    }
    if (this._meteredConnectionService?.isConnectionMetered) {
      return;
    }
    if (!this._isExperimentPropertySet) {
      if (this._pendingEvents.length < TelemetryService.MAX_BUFFER_SIZE) {
        this._pendingEvents.push({ eventName, eventLevel, data });
      }
      return;
    }
    this._doLog(eventName, eventLevel, data);
  }
  _doLog(eventName, eventLevel, data) {
    data = mixin(data, this._experimentProperties);
    data = cleanData(data, this._cleanupPatterns);
    data = mixin(data, this._commonProperties);
    if (eventLevel === TelemetryLevel.ERROR) {
      data = { ...data, "isError": true };
    }
    this._appenders.forEach((a) => a.log(eventName, data ?? {}));
  }
  publicLog(eventName, data) {
    this._log(eventName, TelemetryLevel.USAGE, data);
  }
  publicLog2(eventName, data) {
    this.publicLog(eventName, data);
  }
  publicLogError(errorEventName, data) {
    if (!this._sendErrorTelemetry) {
      return;
    }
    this._log(errorEventName, TelemetryLevel.ERROR, data);
  }
  publicLogError2(eventName, data) {
    this.publicLogError(eventName, data);
  }
};
TelemetryService.IDLE_START_EVENT_NAME = "UserIdleStart";
TelemetryService.IDLE_STOP_EVENT_NAME = "UserIdleStop";
TelemetryService.BUFFER_FLUSH_TIMEOUT = 1e4;
// 10 seconds
TelemetryService.MAX_BUFFER_SIZE = 1e3;
TelemetryService = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IProductService)
], TelemetryService);
function getTelemetryLevelSettingDescription() {
  const telemetryText = localize("telemetry.telemetryLevelMd", "Controls {0} telemetry, first-party extension telemetry, and participating third-party extension telemetry. Some third party extensions might not respect this setting. Consult the specific extension's documentation to be sure. Telemetry helps us better understand how {0} is performing, where improvements need to be made, and how features are being used.", product.nameLong);
  const externalLinksStatement = !product.privacyStatementUrl ? localize("telemetry.docsStatement", "Read more about the [data we collect]({0}).", "https://aka.ms/vscode-telemetry") : localize("telemetry.docsAndPrivacyStatement", "Read more about the [data we collect]({0}) and our [privacy statement]({1}).", "https://aka.ms/vscode-telemetry", product.privacyStatementUrl);
  const restartString = !isWeb ? localize("telemetry.restart", "A full restart of the application is necessary for crash reporting changes to take effect.") : "";
  const crashReportsHeader = localize("telemetry.crashReports", "Crash Reports");
  const errorsHeader = localize("telemetry.errors", "Error Telemetry");
  const usageHeader = localize("telemetry.usage", "Usage Data");
  const telemetryTableDescription = localize("telemetry.telemetryLevel.tableDescription", "The following table outlines the data sent with each setting:");
  const telemetryTable = `
|       | ${crashReportsHeader} | ${errorsHeader} | ${usageHeader} |
|:------|:-------------:|:---------------:|:----------:|
| all   |       \u2713       |        \u2713        |     \u2713      |
| error |       \u2713       |        \u2713        |     -      |
| crash |       \u2713       |        -        |     -      |
| off   |       -       |        -        |     -      |
`;
  const deprecatedSettingNote = localize("telemetry.telemetryLevel.deprecated", "****Note:*** If this setting is 'off', no telemetry will be sent regardless of other telemetry settings. If this setting is set to anything except 'off' and telemetry is disabled with deprecated settings, no telemetry will be sent.*");
  const telemetryDescription = `
${telemetryText} ${externalLinksStatement} ${restartString}

&nbsp;

${telemetryTableDescription}
${telemetryTable}

&nbsp;

${deprecatedSettingNote}
`;
  return telemetryDescription;
}
const configurationRegistry = Registry.as(Extensions.Configuration);
configurationRegistry.registerConfiguration({
  "id": TELEMETRY_SECTION_ID,
  "order": 1,
  "type": "object",
  "title": localize("telemetryConfigurationTitle", "Telemetry"),
  "properties": {
    [TELEMETRY_SETTING_ID]: {
      "type": "string",
      "enum": [TelemetryConfiguration.ON, TelemetryConfiguration.ERROR, TelemetryConfiguration.CRASH, TelemetryConfiguration.OFF],
      "enumDescriptions": [
        localize("telemetry.telemetryLevel.default", "Sends usage data, errors, and crash reports."),
        localize("telemetry.telemetryLevel.error", "Sends general error telemetry and crash reports."),
        localize("telemetry.telemetryLevel.crash", "Sends OS level crash reports."),
        localize("telemetry.telemetryLevel.off", "Disables all product telemetry.")
      ],
      "markdownDescription": getTelemetryLevelSettingDescription(),
      "default": TelemetryConfiguration.ON,
      "restricted": true,
      "scope": ConfigurationScope.APPLICATION,
      "tags": ["usesOnlineServices", "telemetry"],
      "policy": {
        name: "TelemetryLevel",
        category: PolicyCategory.Telemetry,
        minimumVersion: "1.99",
        localization: {
          description: {
            key: "telemetry.telemetryLevel.policyDescription",
            value: localize("telemetry.telemetryLevel.policyDescription", "Controls the level of telemetry.")
          },
          enumDescriptions: [
            {
              key: "telemetry.telemetryLevel.default",
              value: localize("telemetry.telemetryLevel.default", "Sends usage data, errors, and crash reports.")
            },
            {
              key: "telemetry.telemetryLevel.error",
              value: localize("telemetry.telemetryLevel.error", "Sends general error telemetry and crash reports.")
            },
            {
              key: "telemetry.telemetryLevel.crash",
              value: localize("telemetry.telemetryLevel.crash", "Sends OS level crash reports.")
            },
            {
              key: "telemetry.telemetryLevel.off",
              value: localize("telemetry.telemetryLevel.off", "Disables all product telemetry.")
            }
          ]
        }
      }
    },
    "telemetry.feedback.enabled": {
      type: "boolean",
      default: true,
      description: localize("telemetry.feedback.enabled", "Enable feedback mechanisms such as the issue reporter, surveys, and other feedback options."),
      policy: {
        name: "EnableFeedback",
        category: PolicyCategory.Telemetry,
        minimumVersion: "1.99",
        localization: { description: { key: "telemetry.feedback.enabled", value: localize("telemetry.feedback.enabled", "Enable feedback mechanisms such as the issue reporter, surveys, and other feedback options.") } }
      }
    },
    // Deprecated telemetry setting
    [TELEMETRY_OLD_SETTING_ID]: {
      "type": "boolean",
      "markdownDescription": !product.privacyStatementUrl ? localize("telemetry.enableTelemetry", "Enable diagnostic data to be collected. This helps us to better understand how {0} is performing and where improvements need to be made.", product.nameLong) : localize("telemetry.enableTelemetryMd", "Enable diagnostic data to be collected. This helps us to better understand how {0} is performing and where improvements need to be made. [Read more]({1}) about what we collect and our privacy statement.", product.nameLong, product.privacyStatementUrl),
      "default": true,
      "restricted": true,
      "markdownDeprecationMessage": localize("enableTelemetryDeprecated", "If this setting is false, no telemetry will be sent regardless of the new setting's value. Deprecated in favor of the {0} setting.", `\`#${TELEMETRY_SETTING_ID}#\``),
      "scope": ConfigurationScope.APPLICATION,
      "tags": ["usesOnlineServices", "telemetry"]
    }
  }
});
export {
  TelemetryService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBtaXhpbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBQb2xpY3lDYXRlZ29yeSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BvbGljeS5qcyc7XG5pbXBvcnQgeyBlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25TY29wZSwgRXh0ZW5zaW9ucywgSUNvbmZpZ3VyYXRpb25SZWdpc3RyeSB9IGZyb20gJy4uLy4uL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJTWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbWV0ZXJlZENvbm5lY3Rpb24vY29tbW9uL21ldGVyZWRDb25uZWN0aW9uLmpzJztcbmltcG9ydCBwcm9kdWN0IGZyb20gJy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3QuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgQ2xhc3NpZmllZEV2ZW50LCBJR0RQUlByb3BlcnR5LCBPbWl0TWV0YWRhdGEsIFN0cmljdFByb3BlcnR5Q2hlY2sgfSBmcm9tICcuL2dkcHJUeXBpbmdzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlEYXRhLCBJVGVsZW1ldHJ5U2VydmljZSwgVGVsZW1ldHJ5Q29uZmlndXJhdGlvbiwgVGVsZW1ldHJ5TGV2ZWwsIFRFTEVNRVRSWV9DUkFTSF9SRVBPUlRFUl9TRVRUSU5HX0lELCBURUxFTUVUUllfT0xEX1NFVFRJTkdfSUQsIFRFTEVNRVRSWV9TRUNUSU9OX0lELCBURUxFTUVUUllfU0VUVElOR19JRCwgSUNvbW1vblByb3BlcnRpZXMgfSBmcm9tICcuL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBjbGVhbkRhdGEsIGdldFRlbGVtZXRyeUxldmVsLCBJVGVsZW1ldHJ5QXBwZW5kZXIsIFRlbGVtZXRyeVRydXN0ZWRWYWx1ZSB9IGZyb20gJy4vdGVsZW1ldHJ5VXRpbHMuanMnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElUZWxlbWV0cnlTZXJ2aWNlQ29uZmlnIHtcblx0YXBwZW5kZXJzOiBJVGVsZW1ldHJ5QXBwZW5kZXJbXTtcblx0c2VuZEVycm9yVGVsZW1ldHJ5PzogYm9vbGVhbjtcblx0Y29tbW9uUHJvcGVydGllcz86IElDb21tb25Qcm9wZXJ0aWVzO1xuXHRwaWlQYXRocz86IHN0cmluZ1tdO1xuXHQvKipcblx0ICogSWYgdHJ1ZSwgdGVsZW1ldHJ5IGV2ZW50cyB3aWxsIGJlIGJ1ZmZlcmVkIHVudGlsIHNldEV4cGVyaW1lbnRQcm9wZXJ0eSBpcyBjYWxsZWRcblx0ICogKHVwIHRvIDEwIHNlY29uZHMpIHRvIGVuc3VyZSBleHBlcmltZW50IGNvbnRleHQgaXMgYXR0YWNoZWQgdG8gYWxsIGV2ZW50cy5cblx0ICovXG5cdHdhaXRGb3JFeHBlcmltZW50UHJvcGVydGllcz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBJZiBwcm92aWRlZCwgdGVsZW1ldHJ5IGV2ZW50cyB3aWxsIGJlIGRyb3BwZWQgd2hlbiB0aGUgY29ubmVjdGlvbiBpcyBtZXRlcmVkLlxuXHQgKi9cblx0bWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlPzogSU1ldGVyZWRDb25uZWN0aW9uU2VydmljZTtcbn1cblxuaW50ZXJmYWNlIElQZW5kaW5nRXZlbnQge1xuXHRldmVudE5hbWU6IHN0cmluZztcblx0ZXZlbnRMZXZlbDogVGVsZW1ldHJ5TGV2ZWw7XG5cdGRhdGE6IElUZWxlbWV0cnlEYXRhIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgVGVsZW1ldHJ5U2VydmljZSBpbXBsZW1lbnRzIElUZWxlbWV0cnlTZXJ2aWNlIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSURMRV9TVEFSVF9FVkVOVF9OQU1FID0gJ1VzZXJJZGxlU3RhcnQnO1xuXHRzdGF0aWMgcmVhZG9ubHkgSURMRV9TVE9QX0VWRU5UX05BTUUgPSAnVXNlcklkbGVTdG9wJztcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBCVUZGRVJfRkxVU0hfVElNRU9VVCA9IDEwMDAwOyAvLyAxMCBzZWNvbmRzXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IE1BWF9CVUZGRVJfU0laRSA9IDEwMDA7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1hY2hpbmVJZDogc3RyaW5nO1xuXHRyZWFkb25seSBzcW1JZDogc3RyaW5nO1xuXHRyZWFkb25seSBkZXZEZXZpY2VJZDogc3RyaW5nO1xuXHRyZWFkb25seSBmaXJzdFNlc3Npb25EYXRlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1zZnRJbnRlcm5hbDogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9hcHBlbmRlcnM6IElUZWxlbWV0cnlBcHBlbmRlcltdO1xuXHRwcml2YXRlIF9jb21tb25Qcm9wZXJ0aWVzOiBJQ29tbW9uUHJvcGVydGllcztcblx0cHJpdmF0ZSBfZXhwZXJpbWVudFByb3BlcnRpZXM6IHsgW25hbWU6IHN0cmluZ106IHN0cmluZyB8IFRlbGVtZXRyeVRydXN0ZWRWYWx1ZTxzdHJpbmc+IH0gPSB7fTtcblx0cHJpdmF0ZSBfcGlpUGF0aHM6IHN0cmluZ1tdO1xuXHRwcml2YXRlIF90ZWxlbWV0cnlMZXZlbDogVGVsZW1ldHJ5TGV2ZWw7XG5cdHByaXZhdGUgX3NlbmRFcnJvclRlbGVtZXRyeTogYm9vbGVhbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9tZXRlcmVkQ29ubmVjdGlvblNlcnZpY2U6IElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfcGVuZGluZ0V2ZW50czogSVBlbmRpbmdFdmVudFtdID0gW107XG5cdHByaXZhdGUgX2lzRXhwZXJpbWVudFByb3BlcnR5U2V0ID0gZmFsc2U7XG5cdHByaXZhdGUgX2ZsdXNoVGltZW91dDogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgX2NsZWFudXBQYXR0ZXJuczogUmVnRXhwW10gPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb25maWc6IElUZWxlbWV0cnlTZXJ2aWNlQ29uZmlnLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2Vcblx0KSB7XG5cdFx0dGhpcy5fYXBwZW5kZXJzID0gY29uZmlnLmFwcGVuZGVycztcblx0XHR0aGlzLl9jb21tb25Qcm9wZXJ0aWVzID0gY29uZmlnLmNvbW1vblByb3BlcnRpZXMgPz8gT2JqZWN0LmNyZWF0ZShudWxsKTtcblxuXHRcdHRoaXMuc2Vzc2lvbklkID0gdGhpcy5fY29tbW9uUHJvcGVydGllc1snc2Vzc2lvbklEJ10gYXMgc3RyaW5nO1xuXHRcdHRoaXMubWFjaGluZUlkID0gdGhpcy5fY29tbW9uUHJvcGVydGllc1snY29tbW9uLm1hY2hpbmVJZCddIGFzIHN0cmluZztcblx0XHR0aGlzLnNxbUlkID0gdGhpcy5fY29tbW9uUHJvcGVydGllc1snY29tbW9uLnNxbUlkJ10gYXMgc3RyaW5nO1xuXHRcdHRoaXMuZGV2RGV2aWNlSWQgPSB0aGlzLl9jb21tb25Qcm9wZXJ0aWVzWydjb21tb24uZGV2RGV2aWNlSWQnXSBhcyBzdHJpbmc7XG5cdFx0dGhpcy5maXJzdFNlc3Npb25EYXRlID0gdGhpcy5fY29tbW9uUHJvcGVydGllc1snY29tbW9uLmZpcnN0U2Vzc2lvbkRhdGUnXSBhcyBzdHJpbmc7XG5cdFx0dGhpcy5tc2Z0SW50ZXJuYWwgPSB0aGlzLl9jb21tb25Qcm9wZXJ0aWVzWydjb21tb24ubXNmdEludGVybmFsJ10gYXMgYm9vbGVhbiB8IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuX3BpaVBhdGhzID0gY29uZmlnLnBpaVBhdGhzIHx8IFtdO1xuXHRcdHRoaXMuX3RlbGVtZXRyeUxldmVsID0gVGVsZW1ldHJ5TGV2ZWwuVVNBR0U7XG5cdFx0dGhpcy5fc2VuZEVycm9yVGVsZW1ldHJ5ID0gISFjb25maWcuc2VuZEVycm9yVGVsZW1ldHJ5O1xuXHRcdHRoaXMuX21ldGVyZWRDb25uZWN0aW9uU2VydmljZSA9IGNvbmZpZy5tZXRlcmVkQ29ubmVjdGlvblNlcnZpY2U7XG5cblx0XHQvLyBzdGF0aWMgY2xlYW51cCBwYXR0ZXJuIGZvcjogYHZzY29kZS1maWxlOi8vL0RBTkdFUk9VUy9QQVRIL3Jlc291cmNlcy9hcHAvVXNlZnVsL0luZm9ybWF0aW9uYFxuXHRcdHRoaXMuX2NsZWFudXBQYXR0ZXJucyA9IFsvKHZzY29kZS0pP2ZpbGU6XFwvXFwvLio/XFwvcmVzb3VyY2VzXFwvYXBwXFwvL2dpXTtcblxuXHRcdGZvciAoY29uc3QgcGlpUGF0aCBvZiB0aGlzLl9waWlQYXRocykge1xuXHRcdFx0dGhpcy5fY2xlYW51cFBhdHRlcm5zLnB1c2gobmV3IFJlZ0V4cChlc2NhcGVSZWdFeHBDaGFyYWN0ZXJzKHBpaVBhdGgpLCAnZ2knKSk7XG5cblx0XHRcdGlmIChwaWlQYXRoLmluZGV4T2YoJ1xcXFwnKSA+PSAwKSB7XG5cdFx0XHRcdHRoaXMuX2NsZWFudXBQYXR0ZXJucy5wdXNoKG5ldyBSZWdFeHAoZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhwaWlQYXRoLnJlcGxhY2UoL1xcXFwvZywgJy8nKSksICdnaScpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl91cGRhdGVUZWxlbWV0cnlMZXZlbCgpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHQvLyBDaGVjayBvbiB0aGUgdGVsZW1ldHJ5IHNldHRpbmdzIGFuZCB1cGRhdGUgdGhlIHN0YXRlIGlmIGNoYW5nZWRcblx0XHRcdGNvbnN0IGFmZmVjdHNUZWxlbWV0cnlDb25maWcgPVxuXHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRFTEVNRVRSWV9TRVRUSU5HX0lEKVxuXHRcdFx0XHR8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKFRFTEVNRVRSWV9PTERfU0VUVElOR19JRClcblx0XHRcdFx0fHwgZS5hZmZlY3RzQ29uZmlndXJhdGlvbihURUxFTUVUUllfQ1JBU0hfUkVQT1JURVJfU0VUVElOR19JRCk7XG5cdFx0XHRpZiAoYWZmZWN0c1RlbGVtZXRyeUNvbmZpZykge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVUZWxlbWV0cnlMZXZlbCgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEJ1ZmZlciBldmVudHMgdW50aWwgZXhwZXJpbWVudCBwcm9wZXJ0aWVzIGFyZSBzZXQgKG9yIHRpbWVvdXQgZXhwaXJlcykuXG5cdFx0Ly8gVGhpcyBlbnN1cmVzIGVhcmx5IGV2ZW50cyBpbmNsdWRlIGV4cGVyaW1lbnQgY29udGV4dCB3aGVuIGF2YWlsYWJsZS5cblx0XHRpZiAoY29uZmlnLndhaXRGb3JFeHBlcmltZW50UHJvcGVydGllcykge1xuXHRcdFx0dGhpcy5fZmx1c2hUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB0aGlzLl9mbHVzaFBlbmRpbmdFdmVudHMoKSwgVGVsZW1ldHJ5U2VydmljZS5CVUZGRVJfRkxVU0hfVElNRU9VVCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2lzRXhwZXJpbWVudFByb3BlcnR5U2V0ID0gdHJ1ZTtcblx0XHR9XG5cdH1cblxuXHRzZXRFeHBlcmltZW50UHJvcGVydHkobmFtZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZXhwZXJpbWVudFByb3BlcnRpZXNbbmFtZV0gPSBuZXcgVGVsZW1ldHJ5VHJ1c3RlZFZhbHVlKHZhbHVlKTtcblxuXHRcdC8vIE9uIGZpcnN0IGNhbGwsIGZsdXNoIGFsbCBwZW5kaW5nIGV2ZW50cyB0aGF0IHdlcmUgYnVmZmVyZWQgd2FpdGluZyBmb3IgZXhwZXJpbWVudCBwcm9wZXJ0aWVzXG5cdFx0aWYgKCF0aGlzLl9pc0V4cGVyaW1lbnRQcm9wZXJ0eVNldCkge1xuXHRcdFx0dGhpcy5fZmx1c2hQZW5kaW5nRXZlbnRzKCk7XG5cdFx0fVxuXHR9XG5cblx0c2V0Q29tbW9uUHJvcGVydHkobmFtZTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nIHwgYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2NvbW1vblByb3BlcnRpZXNbbmFtZV0gPSB2YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2ZsdXNoUGVuZGluZ0V2ZW50cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNFeHBlcmltZW50UHJvcGVydHlTZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9pc0V4cGVyaW1lbnRQcm9wZXJ0eVNldCA9IHRydWU7XG5cblx0XHRpZiAodGhpcy5fZmx1c2hUaW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9mbHVzaFRpbWVvdXQpO1xuXHRcdFx0dGhpcy5fZmx1c2hUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFNlbmQgYWxsIGJ1ZmZlcmVkIGV2ZW50cyBub3cgdGhhdCBleHBlcmltZW50IHByb3BlcnRpZXMgYXJlIGF2YWlsYWJsZVxuXHRcdGZvciAoY29uc3QgZXZlbnQgb2YgdGhpcy5fcGVuZGluZ0V2ZW50cykge1xuXHRcdFx0dGhpcy5fZG9Mb2coZXZlbnQuZXZlbnROYW1lLCBldmVudC5ldmVudExldmVsLCBldmVudC5kYXRhKTtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ0V2ZW50cyA9IFtdO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVGVsZW1ldHJ5TGV2ZWwoKTogdm9pZCB7XG5cdFx0bGV0IGxldmVsID0gZ2V0VGVsZW1ldHJ5TGV2ZWwodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvbGxlY3RhYmxlVGVsZW1ldHJ5ID0gdGhpcy5fcHJvZHVjdFNlcnZpY2UuZW5hYmxlZFRlbGVtZXRyeUxldmVscztcblx0XHQvLyBBbHNvIGVuc3VyZSB0aGF0IGVycm9yIHRlbGVtZXRyeSBpcyByZXNwZWN0aW5nIHRoZSBwcm9kdWN0IGNvbmZpZ3VyYXRpb24gZm9yIGNvbGxlY3RhYmxlIHRlbGVtZXRyeVxuXHRcdGlmIChjb2xsZWN0YWJsZVRlbGVtZXRyeSkge1xuXHRcdFx0dGhpcy5fc2VuZEVycm9yVGVsZW1ldHJ5ID0gdGhpcy5zZW5kRXJyb3JUZWxlbWV0cnkgPyBjb2xsZWN0YWJsZVRlbGVtZXRyeS5lcnJvciA6IGZhbHNlO1xuXHRcdFx0Ly8gTWFrZSBzdXJlIHRoZSB0ZWxlbWV0cnkgbGV2ZWwgZnJvbSB0aGUgc2VydmljZSBpcyB0aGUgbWluaW11bSBvZiB0aGUgY29uZmlnIGFuZCBwcm9kdWN0XG5cdFx0XHRjb25zdCBtYXhDb2xsZWN0YWJsZVRlbGVtZXRyeUxldmVsID0gY29sbGVjdGFibGVUZWxlbWV0cnkudXNhZ2UgPyBUZWxlbWV0cnlMZXZlbC5VU0FHRSA6IGNvbGxlY3RhYmxlVGVsZW1ldHJ5LmVycm9yID8gVGVsZW1ldHJ5TGV2ZWwuRVJST1IgOiBUZWxlbWV0cnlMZXZlbC5OT05FO1xuXHRcdFx0bGV2ZWwgPSBNYXRoLm1pbihsZXZlbCwgbWF4Q29sbGVjdGFibGVUZWxlbWV0cnlMZXZlbCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdGVsZW1ldHJ5TGV2ZWwgPSBsZXZlbDtcblx0fVxuXG5cdGdldCBzZW5kRXJyb3JUZWxlbWV0cnkoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbmRFcnJvclRlbGVtZXRyeTtcblx0fVxuXG5cdGdldCB0ZWxlbWV0cnlMZXZlbCgpOiBUZWxlbWV0cnlMZXZlbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3RlbGVtZXRyeUxldmVsO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHQvLyBGbHVzaCBhbnkgcmVtYWluaW5nIHBlbmRpbmcgZXZlbnRzIGJlZm9yZSBkaXNwb3Npbmdcblx0XHR0aGlzLl9mbHVzaFBlbmRpbmdFdmVudHMoKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF9sb2coZXZlbnROYW1lOiBzdHJpbmcsIGV2ZW50TGV2ZWw6IFRlbGVtZXRyeUxldmVsLCBkYXRhPzogSVRlbGVtZXRyeURhdGEpIHtcblx0XHQvLyBkb24ndCBzZW5kIGV2ZW50cyB3aGVuIHRoZSB1c2VyIGlzIG9wdG91dFxuXHRcdGlmICh0aGlzLl90ZWxlbWV0cnlMZXZlbCA8IGV2ZW50TGV2ZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBEb24ndCBzZW5kIGV2ZW50cyB3aGVuIHRoZSBjb25uZWN0aW9uIGlzIG1ldGVyZWRcblx0XHRpZiAodGhpcy5fbWV0ZXJlZENvbm5lY3Rpb25TZXJ2aWNlPy5pc0Nvbm5lY3Rpb25NZXRlcmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQnVmZmVyIGV2ZW50cyB1bnRpbCBleHBlcmltZW50IHByb3BlcnRpZXMgYXJlIHNldCAob3IgdGltZW91dCBleHBpcmVzKVxuXHRcdGlmICghdGhpcy5faXNFeHBlcmltZW50UHJvcGVydHlTZXQpIHtcblx0XHRcdGlmICh0aGlzLl9wZW5kaW5nRXZlbnRzLmxlbmd0aCA8IFRlbGVtZXRyeVNlcnZpY2UuTUFYX0JVRkZFUl9TSVpFKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdFdmVudHMucHVzaCh7IGV2ZW50TmFtZSwgZXZlbnRMZXZlbCwgZGF0YSB9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9kb0xvZyhldmVudE5hbWUsIGV2ZW50TGV2ZWwsIGRhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZG9Mb2coZXZlbnROYW1lOiBzdHJpbmcsIGV2ZW50TGV2ZWw6IFRlbGVtZXRyeUxldmVsLCBkYXRhPzogSVRlbGVtZXRyeURhdGEpIHtcblx0XHQvLyBhZGQgZXhwZXJpbWVudCBwcm9wZXJ0aWVzXG5cdFx0ZGF0YSA9IG1peGluKGRhdGEsIHRoaXMuX2V4cGVyaW1lbnRQcm9wZXJ0aWVzKTtcblxuXHRcdC8vIHJlbW92ZSBhbGwgUElJIGZyb20gZGF0YVxuXHRcdGRhdGEgPSBjbGVhbkRhdGEoZGF0YSwgdGhpcy5fY2xlYW51cFBhdHRlcm5zKTtcblxuXHRcdC8vIGFkZCBjb21tb24gcHJvcGVydGllc1xuXHRcdGRhdGEgPSBtaXhpbihkYXRhLCB0aGlzLl9jb21tb25Qcm9wZXJ0aWVzKTtcblxuXHRcdC8vIHRhZyBlcnJvci1sZXZlbCBldmVudHMgc28gdGhlIGJhY2tlbmQgY2FuIGlkZW50aWZ5IHRoZW0gZ2VuZXJpY2FsbHlcblx0XHRpZiAoZXZlbnRMZXZlbCA9PT0gVGVsZW1ldHJ5TGV2ZWwuRVJST1IpIHtcblx0XHRcdGRhdGEgPSB7IC4uLmRhdGEsICdpc0Vycm9yJzogdHJ1ZSB9O1xuXHRcdH1cblxuXHRcdC8vIExvZyB0byB0aGUgYXBwZW5kZXJzIG9mIHN1ZmZpY2llbnQgbGV2ZWxcblx0XHR0aGlzLl9hcHBlbmRlcnMuZm9yRWFjaChhID0+IGEubG9nKGV2ZW50TmFtZSwgZGF0YSA/PyB7fSkpO1xuXHR9XG5cblx0cHVibGljTG9nKGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhPzogSVRlbGVtZXRyeURhdGEpIHtcblx0XHR0aGlzLl9sb2coZXZlbnROYW1lLCBUZWxlbWV0cnlMZXZlbC5VU0FHRSwgZGF0YSk7XG5cdH1cblxuXHRwdWJsaWNMb2cyPEUgZXh0ZW5kcyBDbGFzc2lmaWVkRXZlbnQ8T21pdE1ldGFkYXRhPFQ+PiA9IG5ldmVyLCBUIGV4dGVuZHMgSUdEUFJQcm9wZXJ0eSA9IG5ldmVyPihldmVudE5hbWU6IHN0cmluZywgZGF0YT86IFN0cmljdFByb3BlcnR5Q2hlY2s8VCwgRT4pIHtcblx0XHR0aGlzLnB1YmxpY0xvZyhldmVudE5hbWUsIGRhdGEgYXMgSVRlbGVtZXRyeURhdGEpO1xuXHR9XG5cblx0cHVibGljTG9nRXJyb3IoZXJyb3JFdmVudE5hbWU6IHN0cmluZywgZGF0YT86IElUZWxlbWV0cnlEYXRhKSB7XG5cdFx0aWYgKCF0aGlzLl9zZW5kRXJyb3JUZWxlbWV0cnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBTZW5kIGVycm9yIGV2ZW50IGFuZCBhbm9ueW1pemUgcGF0aHNcblx0XHR0aGlzLl9sb2coZXJyb3JFdmVudE5hbWUsIFRlbGVtZXRyeUxldmVsLkVSUk9SLCBkYXRhKTtcblx0fVxuXG5cdHB1YmxpY0xvZ0Vycm9yMjxFIGV4dGVuZHMgQ2xhc3NpZmllZEV2ZW50PE9taXRNZXRhZGF0YTxUPj4gPSBuZXZlciwgVCBleHRlbmRzIElHRFBSUHJvcGVydHkgPSBuZXZlcj4oZXZlbnROYW1lOiBzdHJpbmcsIGRhdGE/OiBTdHJpY3RQcm9wZXJ0eUNoZWNrPFQsIEU+KSB7XG5cdFx0dGhpcy5wdWJsaWNMb2dFcnJvcihldmVudE5hbWUsIGRhdGEgYXMgSVRlbGVtZXRyeURhdGEpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFRlbGVtZXRyeUxldmVsU2V0dGluZ0Rlc2NyaXB0aW9uKCk6IHN0cmluZyB7XG5cdGNvbnN0IHRlbGVtZXRyeVRleHQgPSBsb2NhbGl6ZSgndGVsZW1ldHJ5LnRlbGVtZXRyeUxldmVsTWQnLCBcIkNvbnRyb2xzIHswfSB0ZWxlbWV0cnksIGZpcnN0LXBhcnR5IGV4dGVuc2lvbiB0ZWxlbWV0cnksIGFuZCBwYXJ0aWNpcGF0aW5nIHRoaXJkLXBhcnR5IGV4dGVuc2lvbiB0ZWxlbWV0cnkuIFNvbWUgdGhpcmQgcGFydHkgZXh0ZW5zaW9ucyBtaWdodCBub3QgcmVzcGVjdCB0aGlzIHNldHRpbmcuIENvbnN1bHQgdGhlIHNwZWNpZmljIGV4dGVuc2lvbidzIGRvY3VtZW50YXRpb24gdG8gYmUgc3VyZS4gVGVsZW1ldHJ5IGhlbHBzIHVzIGJldHRlciB1bmRlcnN0YW5kIGhvdyB7MH0gaXMgcGVyZm9ybWluZywgd2hlcmUgaW1wcm92ZW1lbnRzIG5lZWQgdG8gYmUgbWFkZSwgYW5kIGhvdyBmZWF0dXJlcyBhcmUgYmVpbmcgdXNlZC5cIiwgcHJvZHVjdC5uYW1lTG9uZyk7XG5cdGNvbnN0IGV4dGVybmFsTGlua3NTdGF0ZW1lbnQgPSAhcHJvZHVjdC5wcml2YWN5U3RhdGVtZW50VXJsID9cblx0XHRsb2NhbGl6ZShcInRlbGVtZXRyeS5kb2NzU3RhdGVtZW50XCIsIFwiUmVhZCBtb3JlIGFib3V0IHRoZSBbZGF0YSB3ZSBjb2xsZWN0XSh7MH0pLlwiLCAnaHR0cHM6Ly9ha2EubXMvdnNjb2RlLXRlbGVtZXRyeScpIDpcblx0XHRsb2NhbGl6ZShcInRlbGVtZXRyeS5kb2NzQW5kUHJpdmFjeVN0YXRlbWVudFwiLCBcIlJlYWQgbW9yZSBhYm91dCB0aGUgW2RhdGEgd2UgY29sbGVjdF0oezB9KSBhbmQgb3VyIFtwcml2YWN5IHN0YXRlbWVudF0oezF9KS5cIiwgJ2h0dHBzOi8vYWthLm1zL3ZzY29kZS10ZWxlbWV0cnknLCBwcm9kdWN0LnByaXZhY3lTdGF0ZW1lbnRVcmwpO1xuXHRjb25zdCByZXN0YXJ0U3RyaW5nID0gIWlzV2ViID8gbG9jYWxpemUoJ3RlbGVtZXRyeS5yZXN0YXJ0JywgJ0EgZnVsbCByZXN0YXJ0IG9mIHRoZSBhcHBsaWNhdGlvbiBpcyBuZWNlc3NhcnkgZm9yIGNyYXNoIHJlcG9ydGluZyBjaGFuZ2VzIHRvIHRha2UgZWZmZWN0LicpIDogJyc7XG5cblx0Y29uc3QgY3Jhc2hSZXBvcnRzSGVhZGVyID0gbG9jYWxpemUoJ3RlbGVtZXRyeS5jcmFzaFJlcG9ydHMnLCBcIkNyYXNoIFJlcG9ydHNcIik7XG5cdGNvbnN0IGVycm9yc0hlYWRlciA9IGxvY2FsaXplKCd0ZWxlbWV0cnkuZXJyb3JzJywgXCJFcnJvciBUZWxlbWV0cnlcIik7XG5cdGNvbnN0IHVzYWdlSGVhZGVyID0gbG9jYWxpemUoJ3RlbGVtZXRyeS51c2FnZScsIFwiVXNhZ2UgRGF0YVwiKTtcblxuXHRjb25zdCB0ZWxlbWV0cnlUYWJsZURlc2NyaXB0aW9uID0gbG9jYWxpemUoJ3RlbGVtZXRyeS50ZWxlbWV0cnlMZXZlbC50YWJsZURlc2NyaXB0aW9uJywgXCJUaGUgZm9sbG93aW5nIHRhYmxlIG91dGxpbmVzIHRoZSBkYXRhIHNlbnQgd2l0aCBlYWNoIHNldHRpbmc6XCIpO1xuXHRjb25zdCB0ZWxlbWV0cnlUYWJsZSA9IGBcbnwgICAgICAgfCAke2NyYXNoUmVwb3J0c0hlYWRlcn0gfCAke2Vycm9yc0hlYWRlcn0gfCAke3VzYWdlSGVhZGVyfSB8XG58Oi0tLS0tLXw6LS0tLS0tLS0tLS0tLTp8Oi0tLS0tLS0tLS0tLS0tLTp8Oi0tLS0tLS0tLS06fFxufCBhbGwgICB8ICAgICAgIFx1MjcxMyAgICAgICB8ICAgICAgICBcdTI3MTMgICAgICAgIHwgICAgIFx1MjcxMyAgICAgIHxcbnwgZXJyb3IgfCAgICAgICBcdTI3MTMgICAgICAgfCAgICAgICAgXHUyNzEzICAgICAgICB8ICAgICAtICAgICAgfFxufCBjcmFzaCB8ICAgICAgIFx1MjcxMyAgICAgICB8ICAgICAgICAtICAgICAgICB8ICAgICAtICAgICAgfFxufCBvZmYgICB8ICAgICAgIC0gICAgICAgfCAgICAgICAgLSAgICAgICAgfCAgICAgLSAgICAgIHxcbmA7XG5cblx0Y29uc3QgZGVwcmVjYXRlZFNldHRpbmdOb3RlID0gbG9jYWxpemUoJ3RlbGVtZXRyeS50ZWxlbWV0cnlMZXZlbC5kZXByZWNhdGVkJywgXCIqKioqTm90ZToqKiogSWYgdGhpcyBzZXR0aW5nIGlzICdvZmYnLCBubyB0ZWxlbWV0cnkgd2lsbCBiZSBzZW50IHJlZ2FyZGxlc3Mgb2Ygb3RoZXIgdGVsZW1ldHJ5IHNldHRpbmdzLiBJZiB0aGlzIHNldHRpbmcgaXMgc2V0IHRvIGFueXRoaW5nIGV4Y2VwdCAnb2ZmJyBhbmQgdGVsZW1ldHJ5IGlzIGRpc2FibGVkIHdpdGggZGVwcmVjYXRlZCBzZXR0aW5ncywgbm8gdGVsZW1ldHJ5IHdpbGwgYmUgc2VudC4qXCIpO1xuXHRjb25zdCB0ZWxlbWV0cnlEZXNjcmlwdGlvbiA9IGBcbiR7dGVsZW1ldHJ5VGV4dH0gJHtleHRlcm5hbExpbmtzU3RhdGVtZW50fSAke3Jlc3RhcnRTdHJpbmd9XG5cbiZuYnNwO1xuXG4ke3RlbGVtZXRyeVRhYmxlRGVzY3JpcHRpb259XG4ke3RlbGVtZXRyeVRhYmxlfVxuXG4mbmJzcDtcblxuJHtkZXByZWNhdGVkU2V0dGluZ05vdGV9XG5gO1xuXG5cdHJldHVybiB0ZWxlbWV0cnlEZXNjcmlwdGlvbjtcbn1cblxuY29uc3QgY29uZmlndXJhdGlvblJlZ2lzdHJ5ID0gUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcbmNvbmZpZ3VyYXRpb25SZWdpc3RyeS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHQnaWQnOiBURUxFTUVUUllfU0VDVElPTl9JRCxcblx0J29yZGVyJzogMSxcblx0J3R5cGUnOiAnb2JqZWN0Jyxcblx0J3RpdGxlJzogbG9jYWxpemUoJ3RlbGVtZXRyeUNvbmZpZ3VyYXRpb25UaXRsZScsIFwiVGVsZW1ldHJ5XCIpLFxuXHQncHJvcGVydGllcyc6IHtcblx0XHRbVEVMRU1FVFJZX1NFVFRJTkdfSURdOiB7XG5cdFx0XHQndHlwZSc6ICdzdHJpbmcnLFxuXHRcdFx0J2VudW0nOiBbVGVsZW1ldHJ5Q29uZmlndXJhdGlvbi5PTiwgVGVsZW1ldHJ5Q29uZmlndXJhdGlvbi5FUlJPUiwgVGVsZW1ldHJ5Q29uZmlndXJhdGlvbi5DUkFTSCwgVGVsZW1ldHJ5Q29uZmlndXJhdGlvbi5PRkZdLFxuXHRcdFx0J2VudW1EZXNjcmlwdGlvbnMnOiBbXG5cdFx0XHRcdGxvY2FsaXplKCd0ZWxlbWV0cnkudGVsZW1ldHJ5TGV2ZWwuZGVmYXVsdCcsIFwiU2VuZHMgdXNhZ2UgZGF0YSwgZXJyb3JzLCBhbmQgY3Jhc2ggcmVwb3J0cy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCd0ZWxlbWV0cnkudGVsZW1ldHJ5TGV2ZWwuZXJyb3InLCBcIlNlbmRzIGdlbmVyYWwgZXJyb3IgdGVsZW1ldHJ5IGFuZCBjcmFzaCByZXBvcnRzLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ3RlbGVtZXRyeS50ZWxlbWV0cnlMZXZlbC5jcmFzaCcsIFwiU2VuZHMgT1MgbGV2ZWwgY3Jhc2ggcmVwb3J0cy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCd0ZWxlbWV0cnkudGVsZW1ldHJ5TGV2ZWwub2ZmJywgXCJEaXNhYmxlcyBhbGwgcHJvZHVjdCB0ZWxlbWV0cnkuXCIpXG5cdFx0XHRdLFxuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBnZXRUZWxlbWV0cnlMZXZlbFNldHRpbmdEZXNjcmlwdGlvbigpLFxuXHRcdFx0J2RlZmF1bHQnOiBUZWxlbWV0cnlDb25maWd1cmF0aW9uLk9OLFxuXHRcdFx0J3Jlc3RyaWN0ZWQnOiB0cnVlLFxuXHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0J3RhZ3MnOiBbJ3VzZXNPbmxpbmVTZXJ2aWNlcycsICd0ZWxlbWV0cnknXSxcblx0XHRcdCdwb2xpY3knOiB7XG5cdFx0XHRcdG5hbWU6ICdUZWxlbWV0cnlMZXZlbCcsXG5cdFx0XHRcdGNhdGVnb3J5OiBQb2xpY3lDYXRlZ29yeS5UZWxlbWV0cnksXG5cdFx0XHRcdG1pbmltdW1WZXJzaW9uOiAnMS45OScsXG5cdFx0XHRcdGxvY2FsaXphdGlvbjoge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0XHRrZXk6ICd0ZWxlbWV0cnkudGVsZW1ldHJ5TGV2ZWwucG9saWN5RGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCd0ZWxlbWV0cnkudGVsZW1ldHJ5TGV2ZWwucG9saWN5RGVzY3JpcHRpb24nLCBcIkNvbnRyb2xzIHRoZSBsZXZlbCBvZiB0ZWxlbWV0cnkuXCIpLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRrZXk6ICd0ZWxlbWV0cnkudGVsZW1ldHJ5TGV2ZWwuZGVmYXVsdCcsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZSgndGVsZW1ldHJ5LnRlbGVtZXRyeUxldmVsLmRlZmF1bHQnLCBcIlNlbmRzIHVzYWdlIGRhdGEsIGVycm9ycywgYW5kIGNyYXNoIHJlcG9ydHMuXCIpLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0a2V5OiAndGVsZW1ldHJ5LnRlbGVtZXRyeUxldmVsLmVycm9yJyxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IGxvY2FsaXplKCd0ZWxlbWV0cnkudGVsZW1ldHJ5TGV2ZWwuZXJyb3InLCBcIlNlbmRzIGdlbmVyYWwgZXJyb3IgdGVsZW1ldHJ5IGFuZCBjcmFzaCByZXBvcnRzLlwiKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGtleTogJ3RlbGVtZXRyeS50ZWxlbWV0cnlMZXZlbC5jcmFzaCcsXG5cdFx0XHRcdFx0XHRcdHZhbHVlOiBsb2NhbGl6ZSgndGVsZW1ldHJ5LnRlbGVtZXRyeUxldmVsLmNyYXNoJywgXCJTZW5kcyBPUyBsZXZlbCBjcmFzaCByZXBvcnRzLlwiKSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdGtleTogJ3RlbGVtZXRyeS50ZWxlbWV0cnlMZXZlbC5vZmYnLFxuXHRcdFx0XHRcdFx0XHR2YWx1ZTogbG9jYWxpemUoJ3RlbGVtZXRyeS50ZWxlbWV0cnlMZXZlbC5vZmYnLCBcIkRpc2FibGVzIGFsbCBwcm9kdWN0IHRlbGVtZXRyeS5cIiksXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSxcblx0XHQndGVsZW1ldHJ5LmZlZWRiYWNrLmVuYWJsZWQnOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiB0cnVlLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZWxlbWV0cnkuZmVlZGJhY2suZW5hYmxlZCcsIFwiRW5hYmxlIGZlZWRiYWNrIG1lY2hhbmlzbXMgc3VjaCBhcyB0aGUgaXNzdWUgcmVwb3J0ZXIsIHN1cnZleXMsIGFuZCBvdGhlciBmZWVkYmFjayBvcHRpb25zLlwiKSxcblx0XHRcdHBvbGljeToge1xuXHRcdFx0XHRuYW1lOiAnRW5hYmxlRmVlZGJhY2snLFxuXHRcdFx0XHRjYXRlZ29yeTogUG9saWN5Q2F0ZWdvcnkuVGVsZW1ldHJ5LFxuXHRcdFx0XHRtaW5pbXVtVmVyc2lvbjogJzEuOTknLFxuXHRcdFx0XHRsb2NhbGl6YXRpb246IHsgZGVzY3JpcHRpb246IHsga2V5OiAndGVsZW1ldHJ5LmZlZWRiYWNrLmVuYWJsZWQnLCB2YWx1ZTogbG9jYWxpemUoJ3RlbGVtZXRyeS5mZWVkYmFjay5lbmFibGVkJywgXCJFbmFibGUgZmVlZGJhY2sgbWVjaGFuaXNtcyBzdWNoIGFzIHRoZSBpc3N1ZSByZXBvcnRlciwgc3VydmV5cywgYW5kIG90aGVyIGZlZWRiYWNrIG9wdGlvbnMuXCIpIH0gfSxcblx0XHRcdH1cblx0XHR9LFxuXHRcdC8vIERlcHJlY2F0ZWQgdGVsZW1ldHJ5IHNldHRpbmdcblx0XHRbVEVMRU1FVFJZX09MRF9TRVRUSU5HX0lEXToge1xuXHRcdFx0J3R5cGUnOiAnYm9vbGVhbicsXG5cdFx0XHQnbWFya2Rvd25EZXNjcmlwdGlvbic6XG5cdFx0XHRcdCFwcm9kdWN0LnByaXZhY3lTdGF0ZW1lbnRVcmwgP1xuXHRcdFx0XHRcdGxvY2FsaXplKCd0ZWxlbWV0cnkuZW5hYmxlVGVsZW1ldHJ5JywgXCJFbmFibGUgZGlhZ25vc3RpYyBkYXRhIHRvIGJlIGNvbGxlY3RlZC4gVGhpcyBoZWxwcyB1cyB0byBiZXR0ZXIgdW5kZXJzdGFuZCBob3cgezB9IGlzIHBlcmZvcm1pbmcgYW5kIHdoZXJlIGltcHJvdmVtZW50cyBuZWVkIHRvIGJlIG1hZGUuXCIsIHByb2R1Y3QubmFtZUxvbmcpIDpcblx0XHRcdFx0XHRsb2NhbGl6ZSgndGVsZW1ldHJ5LmVuYWJsZVRlbGVtZXRyeU1kJywgXCJFbmFibGUgZGlhZ25vc3RpYyBkYXRhIHRvIGJlIGNvbGxlY3RlZC4gVGhpcyBoZWxwcyB1cyB0byBiZXR0ZXIgdW5kZXJzdGFuZCBob3cgezB9IGlzIHBlcmZvcm1pbmcgYW5kIHdoZXJlIGltcHJvdmVtZW50cyBuZWVkIHRvIGJlIG1hZGUuIFtSZWFkIG1vcmVdKHsxfSkgYWJvdXQgd2hhdCB3ZSBjb2xsZWN0IGFuZCBvdXIgcHJpdmFjeSBzdGF0ZW1lbnQuXCIsIHByb2R1Y3QubmFtZUxvbmcsIHByb2R1Y3QucHJpdmFjeVN0YXRlbWVudFVybCksXG5cdFx0XHQnZGVmYXVsdCc6IHRydWUsXG5cdFx0XHQncmVzdHJpY3RlZCc6IHRydWUsXG5cdFx0XHQnbWFya2Rvd25EZXByZWNhdGlvbk1lc3NhZ2UnOiBsb2NhbGl6ZSgnZW5hYmxlVGVsZW1ldHJ5RGVwcmVjYXRlZCcsIFwiSWYgdGhpcyBzZXR0aW5nIGlzIGZhbHNlLCBubyB0ZWxlbWV0cnkgd2lsbCBiZSBzZW50IHJlZ2FyZGxlc3Mgb2YgdGhlIG5ldyBzZXR0aW5nJ3MgdmFsdWUuIERlcHJlY2F0ZWQgaW4gZmF2b3Igb2YgdGhlIHswfSBzZXR0aW5nLlwiLCBgXFxgIyR7VEVMRU1FVFJZX1NFVFRJTkdfSUR9I1xcYGApLFxuXHRcdFx0J3Njb3BlJzogQ29uZmlndXJhdGlvblNjb3BlLkFQUExJQ0FUSU9OLFxuXHRcdFx0J3RhZ3MnOiBbJ3VzZXNPbmxpbmVTZXJ2aWNlcycsICd0ZWxlbWV0cnknXVxuXHRcdH1cblx0fSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsc0JBQXNC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Q0FBQyxzQkFBc0IsV0FBVztBQUFBLE1BQzFDLFVBQVU7QUFBQSxRQUNULE1BQU07QUFBQSxRQUNOLFVBQVUsZUFBZTtBQUFBLFFBQ3pCLGdCQUFnQjtBQUFBLFFBQ2hCLGNBQWM7QUFBQSxVQUNiLGFBQWE7QUFBQSxZQUNaLEtBQUs7QUFBQSxZQUNMLE9BQU8sU0FBUyw4Q0FBOEMsa0NBQWtDO0FBQUEsVUFDakc7QUFBQSxVQUNBLGtCQUFrQjtBQUFBLFlBQ2pCO0FBQUEsY0FDQyxLQUFLO0FBQUEsY0FDTCxPQUFPLFNBQVMsb0NBQW9DLDhDQUE4QztBQUFBLFlBQ25HO0FBQUEsWUFDQTtBQUFBLGNBQ0MsS0FBSztBQUFBLGNBQ0wsT0FBTyxTQUFTLGtDQUFrQyxrREFBa0Q7QUFBQSxZQUNyRztBQUFBLFlBQ0E7QUFBQSxjQUNDLEtBQUs7QUFBQSxjQUNMLE9BQU8sU0FBUyxrQ0FBa0MsK0JBQStCO0FBQUEsWUFDbEY7QUFBQSxZQUNBO0FBQUEsY0FDQyxLQUFLO0FBQUEsY0FDTCxPQUFPLFNBQVMsZ0NBQWdDLGlDQUFpQztBQUFBLFlBQ2xGO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUFBLElBQ0EsOEJBQThCO0FBQUEsTUFDN0IsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsYUFBYSxTQUFTLDhCQUE4Qiw2RkFBNkY7QUFBQSxNQUNqSixRQUFRO0FBQUEsUUFDUCxNQUFNO0FBQUEsUUFDTixVQUFVLGVBQWU7QUFBQSxRQUN6QixnQkFBZ0I7QUFBQSxRQUNoQixjQUFjLEVBQUUsYUFBYSxFQUFFLEtBQUssOEJBQThCLE9BQU8sU0FBUyw4QkFBOEIsNkZBQTZGLEVBQUUsRUFBRTtBQUFBLE1BQ2xOO0FBQUEsSUFDRDtBQUFBO0FBQUEsSUFFQSxDQUFDLHdCQUF3QixHQUFHO0FBQUEsTUFDM0IsUUFBUTtBQUFBLE1BQ1IsdUJBQ0MsQ0FBQyxRQUFRLHNCQUNSLFNBQVMsNkJBQTZCLDRJQUE0SSxRQUFRLFFBQVEsSUFDbE0sU0FBUywrQkFBK0IsOE1BQThNLFFBQVEsVUFBVSxRQUFRLG1CQUFtQjtBQUFBLE1BQ3JTLFdBQVc7QUFBQSxNQUNYLGNBQWM7QUFBQSxNQUNkLDhCQUE4QixTQUFTLDZCQUE2QixzSUFBc0ksTUFBTSxvQkFBb0IsS0FBSztBQUFBLE1BQ3pPLFNBQVMsbUJBQW1CO0FBQUEsTUFDNUIsUUFBUSxDQUFDLHNCQUFzQixXQUFXO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBQ0QsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
