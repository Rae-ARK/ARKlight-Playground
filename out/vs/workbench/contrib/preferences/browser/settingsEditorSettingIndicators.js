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
import * as DOM from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { HoverStyle } from "../../../../base/browser/ui/hover/hover.js";
import { HoverPosition } from "../../../../base/browser/ui/hover/hoverWidget.js";
import { SimpleIconLabel } from "../../../../base/browser/ui/iconLabel/simpleIconLabel.js";
import { MarkdownString, createMarkdownLink } from "../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IUserDataSyncEnablementService } from "../../../../platform/userDataSync/common/userDataSync.js";
import { IWorkbenchConfigurationService } from "../../../services/configuration/common/configuration.js";
import { ADVANCED_INDICATOR_DESCRIPTION, EXPERIMENTAL_INDICATOR_DESCRIPTION, POLICY_SETTING_TAG, PREVIEW_INDICATOR_DESCRIPTION } from "../common/preferences.js";
const $ = DOM.$;
let cachedSyncIgnoredSettingsSet = /* @__PURE__ */ new Set();
let cachedSyncIgnoredSettings = [];
let SettingsTreeIndicatorsLabel = class {
  constructor(container, configurationService, hoverService, userDataSyncEnablementService, languageService, commandService) {
    this.configurationService = configurationService;
    this.hoverService = hoverService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.languageService = languageService;
    this.commandService = commandService;
    /** Indicators that each have their own square container at the top-right of the setting */
    this.isolatedIndicators = [];
    this.keybindingListeners = new DisposableStore();
    this.focusedIndex = 0;
    this.defaultHoverOptions = {
      trapFocus: true,
      style: HoverStyle.Pointer,
      position: {
        hoverPosition: HoverPosition.BELOW
      }
    };
    this.indicatorsContainerElement = DOM.append(container, $(".setting-indicators-container"));
    this.indicatorsContainerElement.style.display = "inline";
    this.previewIndicator = this.createPreviewIndicator();
    this.advancedIndicator = this.createAdvancedIndicator();
    this.isolatedIndicators = [this.previewIndicator, this.advancedIndicator];
    this.workspaceTrustIndicator = this.createWorkspaceTrustIndicator();
    this.scopeOverridesIndicator = this.createScopeOverridesIndicator();
    this.syncIgnoredIndicator = this.createSyncIgnoredIndicator();
    this.defaultOverrideIndicator = this.createDefaultOverrideIndicator();
    this.parenthesizedIndicators = [this.workspaceTrustIndicator, this.scopeOverridesIndicator, this.syncIgnoredIndicator, this.defaultOverrideIndicator];
  }
  createWorkspaceTrustIndicator() {
    const disposables = new DisposableStore();
    const workspaceTrustElement = $("span.setting-indicator.setting-item-workspace-trust");
    const workspaceTrustLabel = disposables.add(new SimpleIconLabel(workspaceTrustElement));
    workspaceTrustLabel.text = "$(shield) " + localize("workspaceUntrustedLabel", "Requires workspace trust");
    const content = localize("trustLabel", "The setting value can only be applied in a trusted workspace.");
    disposables.add(this.hoverService.setupDelayedHover(workspaceTrustElement, () => ({
      ...this.defaultHoverOptions,
      content,
      actions: [{
        label: localize("manageWorkspaceTrust", "Manage Workspace Trust"),
        commandId: "workbench.trust.manage",
        run: (target) => {
          this.commandService.executeCommand("workbench.trust.manage");
        }
      }]
    }), { setupKeyboardEvents: true }));
    return {
      element: workspaceTrustElement,
      label: workspaceTrustLabel,
      disposables
    };
  }
  createScopeOverridesIndicator() {
    const disposables = new DisposableStore();
    const otherOverridesElement = $("span.setting-item-overrides");
    const otherOverridesLabel = disposables.add(new SimpleIconLabel(otherOverridesElement));
    return {
      element: otherOverridesElement,
      label: otherOverridesLabel,
      disposables
    };
  }
  createSyncIgnoredIndicator() {
    const disposables = new DisposableStore();
    const syncIgnoredElement = $("span.setting-indicator.setting-item-ignored");
    const syncIgnoredLabel = disposables.add(new SimpleIconLabel(syncIgnoredElement));
    syncIgnoredLabel.text = localize("extensionSyncIgnoredLabel", "Not synced");
    const syncIgnoredHoverContent = localize("syncIgnoredTitle", "This setting is ignored during sync");
    disposables.add(this.hoverService.setupDelayedHover(syncIgnoredElement, {
      ...this.defaultHoverOptions,
      content: syncIgnoredHoverContent
    }, { setupKeyboardEvents: true }));
    return {
      element: syncIgnoredElement,
      label: syncIgnoredLabel,
      disposables
    };
  }
  createDefaultOverrideIndicator() {
    const disposables = new DisposableStore();
    const defaultOverrideIndicator = $("span.setting-indicator.setting-item-default-overridden");
    const defaultOverrideLabel = disposables.add(new SimpleIconLabel(defaultOverrideIndicator));
    defaultOverrideLabel.text = localize("defaultOverriddenLabel", "Default value changed");
    return {
      element: defaultOverrideIndicator,
      label: defaultOverrideLabel,
      disposables
    };
  }
  createPreviewIndicator() {
    const disposables = new DisposableStore();
    const previewIndicator = $("span.setting-indicator.setting-item-preview");
    const previewLabel = disposables.add(new SimpleIconLabel(previewIndicator));
    return {
      element: previewIndicator,
      label: previewLabel,
      disposables
    };
  }
  createAdvancedIndicator() {
    const disposables = new DisposableStore();
    const advancedIndicator = $("span.setting-indicator.setting-item-preview");
    const advancedLabel = disposables.add(new SimpleIconLabel(advancedIndicator));
    advancedLabel.text = localize("advancedLabel", "Advanced");
    disposables.add(this.hoverService.setupDelayedHover(advancedIndicator, {
      ...this.defaultHoverOptions,
      content: ADVANCED_INDICATOR_DESCRIPTION
    }, { setupKeyboardEvents: true }));
    return {
      element: advancedIndicator,
      label: advancedLabel,
      disposables
    };
  }
  render() {
    this.indicatorsContainerElement.innerText = "";
    this.indicatorsContainerElement.style.display = "none";
    const isolatedIndicatorsToShow = this.isolatedIndicators.filter((indicator) => {
      return indicator.element.style.display !== "none";
    });
    if (isolatedIndicatorsToShow.length) {
      this.indicatorsContainerElement.style.display = "inline";
      for (let i = 0; i < isolatedIndicatorsToShow.length; i++) {
        DOM.append(this.indicatorsContainerElement, isolatedIndicatorsToShow[i].element);
      }
    }
    const parenthesizedIndicatorsToShow = this.parenthesizedIndicators.filter((indicator) => {
      return indicator.element.style.display !== "none";
    });
    if (parenthesizedIndicatorsToShow.length) {
      this.indicatorsContainerElement.style.display = "inline";
      DOM.append(this.indicatorsContainerElement, $("span", void 0, "("));
      for (let i = 0; i < parenthesizedIndicatorsToShow.length - 1; i++) {
        DOM.append(this.indicatorsContainerElement, parenthesizedIndicatorsToShow[i].element);
        DOM.append(this.indicatorsContainerElement, $("span.comma", void 0, " \u2022 "));
      }
      DOM.append(this.indicatorsContainerElement, parenthesizedIndicatorsToShow[parenthesizedIndicatorsToShow.length - 1].element);
      DOM.append(this.indicatorsContainerElement, $("span", void 0, ")"));
    }
    this.resetIndicatorNavigationKeyBindings([...isolatedIndicatorsToShow, ...parenthesizedIndicatorsToShow]);
  }
  resetIndicatorNavigationKeyBindings(indicators) {
    this.keybindingListeners.clear();
    this.indicatorsContainerElement.role = indicators.length >= 1 ? "toolbar" : "button";
    if (!indicators.length) {
      return;
    }
    const firstElement = indicators[0].focusElement ?? indicators[0].element;
    firstElement.tabIndex = 0;
    this.keybindingListeners.add(DOM.addDisposableListener(this.indicatorsContainerElement, "keydown", (e) => {
      const ev = new StandardKeyboardEvent(e);
      let handled = true;
      if (ev.equals(KeyCode.Home)) {
        this.focusIndicatorAt(indicators, 0);
      } else if (ev.equals(KeyCode.End)) {
        this.focusIndicatorAt(indicators, indicators.length - 1);
      } else if (ev.equals(KeyCode.RightArrow)) {
        const indexToFocus = (this.focusedIndex + 1) % indicators.length;
        this.focusIndicatorAt(indicators, indexToFocus);
      } else if (ev.equals(KeyCode.LeftArrow)) {
        const indexToFocus = this.focusedIndex ? this.focusedIndex - 1 : indicators.length - 1;
        this.focusIndicatorAt(indicators, indexToFocus);
      } else {
        handled = false;
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    }));
  }
  focusIndicatorAt(indicators, index) {
    if (index === this.focusedIndex) {
      return;
    }
    const indicator = indicators[index];
    const elementToFocus = indicator.focusElement ?? indicator.element;
    elementToFocus.tabIndex = 0;
    elementToFocus.focus();
    const currentlyFocusedIndicator = indicators[this.focusedIndex];
    const previousFocusedElement = currentlyFocusedIndicator.focusElement ?? currentlyFocusedIndicator.element;
    previousFocusedElement.tabIndex = -1;
    this.focusedIndex = index;
  }
  updateWorkspaceTrust(element) {
    this.workspaceTrustIndicator.element.style.display = element.isUntrusted ? "inline" : "none";
    this.render();
  }
  updateSyncIgnored(element, ignoredSettings) {
    this.syncIgnoredIndicator.element.style.display = this.userDataSyncEnablementService.isEnabled() && ignoredSettings.includes(element.setting.key) ? "inline" : "none";
    this.render();
    if (cachedSyncIgnoredSettings !== ignoredSettings) {
      cachedSyncIgnoredSettings = ignoredSettings;
      cachedSyncIgnoredSettingsSet = new Set(cachedSyncIgnoredSettings);
    }
  }
  updatePreviewIndicator(element) {
    const isPreviewSetting = element.tags?.has("preview");
    const isExperimentalSetting = element.tags?.has("experimental");
    this.previewIndicator.element.style.display = isPreviewSetting || isExperimentalSetting ? "inline" : "none";
    this.previewIndicator.label.text = isPreviewSetting ? localize("previewLabel", "Preview") : localize("experimentalLabel", "Experimental");
    const content = isPreviewSetting ? PREVIEW_INDICATOR_DESCRIPTION : EXPERIMENTAL_INDICATOR_DESCRIPTION;
    this.previewIndicator.disposables.add(this.hoverService.setupDelayedHover(this.previewIndicator.element, {
      ...this.defaultHoverOptions,
      content
    }, { setupKeyboardEvents: true }));
    this.render();
  }
  updateAdvancedIndicator(element) {
    const isAdvancedSetting = element.tags?.has("advanced");
    this.advancedIndicator.element.style.display = isAdvancedSetting ? "inline" : "none";
    this.render();
  }
  getInlineScopeDisplayText(completeScope) {
    const [scope, language] = completeScope.split(":");
    const localizedScope = scope === "user" ? localize("user", "User") : scope === "workspace" ? localize("workspace", "Workspace") : localize("remote", "Remote");
    if (language) {
      return `${this.languageService.getLanguageName(language)} > ${localizedScope}`;
    }
    return localizedScope;
  }
  dispose() {
    this.keybindingListeners.dispose();
    for (const indicator of this.isolatedIndicators) {
      indicator.disposables.dispose();
    }
    for (const indicator of this.parenthesizedIndicators) {
      indicator.disposables.dispose();
    }
  }
  updateScopeOverrides(element, onDidClickOverrideElement, onApplyFilter) {
    this.scopeOverridesIndicator.disposables.clear();
    this.scopeOverridesIndicator.element.innerText = "";
    this.scopeOverridesIndicator.element.style.display = "none";
    this.scopeOverridesIndicator.focusElement = this.scopeOverridesIndicator.element;
    if (element.hasPolicyValue) {
      this.scopeOverridesIndicator.element.style.display = "inline";
      this.scopeOverridesIndicator.element.classList.add("setting-indicator");
      this.scopeOverridesIndicator.label.text = "$(briefcase) " + localize("policyLabelText", "Managed by organization");
      const content = localize("policyDescription", "This setting is managed by your organization and its actual value cannot be changed.");
      this.scopeOverridesIndicator.disposables.add(this.hoverService.setupDelayedHover(this.scopeOverridesIndicator.element, () => ({
        ...this.defaultHoverOptions,
        content,
        actions: [{
          label: localize("policyFilterLink", "View policy settings"),
          commandId: "_settings.action.viewPolicySettings",
          run: (_) => {
            onApplyFilter.fire(`@${POLICY_SETTING_TAG}`);
          }
        }]
      }), { setupKeyboardEvents: true }));
    } else if (element.isAgentsWindowReadOnly) {
      this.scopeOverridesIndicator.element.style.display = "inline";
      this.scopeOverridesIndicator.element.classList.add("setting-indicator");
      this.scopeOverridesIndicator.label.text = "$(lock) " + localize("agentsWindowReadOnlyLabelText", "Cannot be changed in Agents window");
      const content = localize("agentsWindowReadOnlyDescription", "This setting cannot be changed in the Agents window.");
      this.scopeOverridesIndicator.disposables.add(this.hoverService.setupDelayedHover(this.scopeOverridesIndicator.element, {
        ...this.defaultHoverOptions,
        content
      }, { setupKeyboardEvents: true }));
    } else if (element.settingsTarget === ConfigurationTarget.USER_LOCAL && this.configurationService.isSettingAppliedForAllProfiles(element.setting.key)) {
      this.scopeOverridesIndicator.element.style.display = "inline";
      this.scopeOverridesIndicator.element.classList.add("setting-indicator");
      this.scopeOverridesIndicator.label.text = localize("applicationSetting", "Applies to all profiles");
      const content = localize("applicationSettingDescription", "The setting is not specific to the current profile, and will retain its value when switching profiles.");
      this.scopeOverridesIndicator.disposables.add(this.hoverService.setupDelayedHover(this.scopeOverridesIndicator.element, {
        ...this.defaultHoverOptions,
        content
      }, { setupKeyboardEvents: true }));
    } else if (element.overriddenScopeList.length || element.overriddenDefaultsLanguageList.length) {
      if (element.overriddenScopeList.length === 1 && !element.overriddenDefaultsLanguageList.length) {
        this.scopeOverridesIndicator.element.style.display = "inline";
        this.scopeOverridesIndicator.element.classList.remove("setting-indicator");
        const prefaceText = element.isConfigured ? localize("alsoConfiguredIn", "Also modified in") : localize("configuredIn", "Modified in");
        this.scopeOverridesIndicator.label.text = `${prefaceText} `;
        const overriddenScope = element.overriddenScopeList[0];
        const view = DOM.append(this.scopeOverridesIndicator.element, $("a.modified-scope", void 0, this.getInlineScopeDisplayText(overriddenScope)));
        view.tabIndex = -1;
        this.scopeOverridesIndicator.focusElement = view;
        const onClickOrKeydown = (e) => {
          const [scope, language] = overriddenScope.split(":");
          onDidClickOverrideElement.fire({
            settingKey: element.setting.key,
            scope,
            language
          });
          e.preventDefault();
          e.stopPropagation();
        };
        this.scopeOverridesIndicator.disposables.add(DOM.addDisposableListener(view, DOM.EventType.CLICK, (e) => {
          onClickOrKeydown(e);
        }));
        this.scopeOverridesIndicator.disposables.add(DOM.addDisposableListener(view, DOM.EventType.KEY_DOWN, (e) => {
          const ev = new StandardKeyboardEvent(e);
          if (ev.equals(KeyCode.Space) || ev.equals(KeyCode.Enter)) {
            onClickOrKeydown(e);
          }
        }));
      } else {
        this.scopeOverridesIndicator.element.style.display = "inline";
        this.scopeOverridesIndicator.element.classList.add("setting-indicator");
        const scopeOverridesLabelText = element.isConfigured ? localize("alsoConfiguredElsewhere", "Also modified elsewhere") : localize("configuredElsewhere", "Modified elsewhere");
        this.scopeOverridesIndicator.label.text = scopeOverridesLabelText;
        let contentMarkdownString = "";
        if (element.overriddenScopeList.length) {
          const prefaceText = element.isConfigured ? localize("alsoModifiedInScopes", "The setting has also been modified in the following scopes:") : localize("modifiedInScopes", "The setting has been modified in the following scopes:");
          contentMarkdownString = prefaceText;
          for (const scope of element.overriddenScopeList) {
            const scopeDisplayText = this.getInlineScopeDisplayText(scope);
            contentMarkdownString += "\n- " + createMarkdownLink(scopeDisplayText, SettingScopeLink.create(scope).toString(), getAccessibleScopeDisplayText(scope, this.languageService));
          }
        }
        if (element.overriddenDefaultsLanguageList.length) {
          if (contentMarkdownString) {
            contentMarkdownString += `

`;
          }
          const prefaceText = localize("hasDefaultOverridesForLanguages", "The following languages have default overrides:");
          contentMarkdownString += prefaceText;
          for (const language of element.overriddenDefaultsLanguageList) {
            const scopeDisplayText = this.languageService.getLanguageName(language);
            contentMarkdownString += "\n- " + createMarkdownLink(scopeDisplayText ?? language, SettingScopeLink.create(`default:${language}`).toString());
          }
        }
        const content = {
          value: contentMarkdownString,
          isTrusted: false,
          supportHtml: false
        };
        this.scopeOverridesIndicator.disposables.add(this.hoverService.setupDelayedHover(this.scopeOverridesIndicator.element, () => ({
          ...this.defaultHoverOptions,
          content,
          linkHandler: (url) => {
            const [scope, language] = SettingScopeLink.parse(url).split(":");
            onDidClickOverrideElement.fire({
              settingKey: element.setting.key,
              scope,
              language
            });
          }
        }), { setupKeyboardEvents: true }));
      }
    }
    this.render();
  }
  updateDefaultOverrideIndicator(element) {
    this.defaultOverrideIndicator.element.style.display = "none";
    let sourceToDisplay = getDefaultValueSourceToDisplay(element);
    if (sourceToDisplay !== void 0) {
      this.defaultOverrideIndicator.element.style.display = "inline";
      this.defaultOverrideIndicator.disposables.clear();
      if (Array.isArray(sourceToDisplay) && sourceToDisplay.length === 1) {
        sourceToDisplay = sourceToDisplay[0];
      }
      let defaultOverrideHoverContent;
      if (!Array.isArray(sourceToDisplay)) {
        defaultOverrideHoverContent = localize("defaultOverriddenDetails", "Default setting value overridden by `{0}`", sourceToDisplay);
      } else {
        sourceToDisplay = sourceToDisplay.map((source) => `\`${source}\``);
        defaultOverrideHoverContent = localize("multipledefaultOverriddenDetails", "A default values has been set by {0}", sourceToDisplay.slice(0, -1).join(", ") + " & " + sourceToDisplay.slice(-1));
      }
      this.defaultOverrideIndicator.disposables.add(this.hoverService.setupDelayedHover(this.defaultOverrideIndicator.element, () => ({
        content: new MarkdownString().appendMarkdown(defaultOverrideHoverContent),
        style: HoverStyle.Pointer,
        position: {
          hoverPosition: HoverPosition.BELOW
        }
      }), { setupKeyboardEvents: true }));
    }
    this.render();
  }
};
SettingsTreeIndicatorsLabel = __decorateClass([
  __decorateParam(1, IWorkbenchConfigurationService),
  __decorateParam(2, IHoverService),
  __decorateParam(3, IUserDataSyncEnablementService),
  __decorateParam(4, ILanguageService),
  __decorateParam(5, ICommandService)
], SettingsTreeIndicatorsLabel);
function getDefaultValueSourceToDisplay(element) {
  let sourceToDisplay;
  const defaultValueSource = element.defaultValueSource;
  if (defaultValueSource) {
    if (defaultValueSource instanceof Map) {
      sourceToDisplay = [];
      for (const [, value] of defaultValueSource) {
        const newValue = typeof value !== "string" ? value.displayName ?? value.id : value;
        if (!sourceToDisplay.includes(newValue)) {
          sourceToDisplay.push(newValue);
        }
      }
    } else if (typeof defaultValueSource === "string") {
      sourceToDisplay = defaultValueSource;
    } else {
      sourceToDisplay = defaultValueSource.displayName ?? defaultValueSource.id;
    }
  }
  return sourceToDisplay;
}
function getAccessibleScopeDisplayText(completeScope, languageService) {
  const [scope, language] = completeScope.split(":");
  const localizedScope = scope === "user" ? localize("user", "User") : scope === "workspace" ? localize("workspace", "Workspace") : localize("remote", "Remote");
  if (language) {
    return localize("modifiedInScopeForLanguage", "The {0} scope for {1}", localizedScope, languageService.getLanguageName(language));
  }
  return localizedScope;
}
function getAccessibleScopeDisplayMidSentenceText(completeScope, languageService) {
  const [scope, language] = completeScope.split(":");
  const localizedScope = scope === "user" ? localize("user", "User") : scope === "workspace" ? localize("workspace", "Workspace") : localize("remote", "Remote");
  if (language) {
    return localize("modifiedInScopeForLanguageMidSentence", "the {0} scope for {1}", localizedScope.toLowerCase(), languageService.getLanguageName(language));
  }
  return localizedScope;
}
function getIndicatorsLabelAriaLabel(element, configurationService, userDataProfilesService, languageService) {
  const ariaLabelSections = [];
  if (element.tags?.has("preview")) {
    ariaLabelSections.push(localize("previewLabel", "Preview"));
  } else if (element.tags?.has("experimental")) {
    ariaLabelSections.push(localize("experimentalLabel", "Experimental"));
  }
  if (element.tags?.has("advanced")) {
    ariaLabelSections.push(localize("advancedLabel", "Advanced"));
  }
  if (element.isUntrusted) {
    ariaLabelSections.push(localize("workspaceUntrustedAriaLabel", "Workspace untrusted; setting value not applied"));
  }
  if (element.hasPolicyValue) {
    ariaLabelSections.push(localize("policyDescriptionAccessible", "Managed by organization policy; setting value not applied"));
  } else if (element.isAgentsWindowReadOnly) {
    ariaLabelSections.push(localize("agentsWindowReadOnlyAccessible", "Cannot be changed in Agents window"));
  } else if (element.settingsTarget === ConfigurationTarget.USER_LOCAL && configurationService.isSettingAppliedForAllProfiles(element.setting.key)) {
    ariaLabelSections.push(localize("applicationSettingDescriptionAccessible", "Setting value retained when switching profiles"));
  } else {
    const otherOverridesStart = element.isConfigured ? localize("alsoConfiguredIn", "Also modified in") : localize("configuredIn", "Modified in");
    const otherOverridesList = element.overriddenScopeList.map((scope) => getAccessibleScopeDisplayMidSentenceText(scope, languageService)).join(", ");
    if (element.overriddenScopeList.length) {
      ariaLabelSections.push(`${otherOverridesStart} ${otherOverridesList}`);
    }
  }
  if (cachedSyncIgnoredSettingsSet.has(element.setting.key)) {
    ariaLabelSections.push(localize("syncIgnoredAriaLabel", "Setting ignored during sync"));
  }
  let sourceToDisplay = getDefaultValueSourceToDisplay(element);
  if (sourceToDisplay !== void 0) {
    if (Array.isArray(sourceToDisplay) && sourceToDisplay.length === 1) {
      sourceToDisplay = sourceToDisplay[0];
    }
    let overriddenDetailsText;
    if (!Array.isArray(sourceToDisplay)) {
      overriddenDetailsText = localize("defaultOverriddenDetailsAriaLabel", "{0} overrides the default value", sourceToDisplay);
    } else {
      overriddenDetailsText = localize("multipleDefaultOverriddenDetailsAriaLabel", "{0} override the default value", sourceToDisplay.slice(0, -1).join(", ") + " & " + sourceToDisplay.slice(-1));
    }
    ariaLabelSections.push(overriddenDetailsText);
  }
  const otherLanguageOverridesList = element.overriddenDefaultsLanguageList.map((language) => languageService.getLanguageName(language)).join(", ");
  if (element.overriddenDefaultsLanguageList.length) {
    const otherLanguageOverridesText = localize("defaultOverriddenLanguagesList", "Language-specific default values exist for {0}", otherLanguageOverridesList);
    ariaLabelSections.push(otherLanguageOverridesText);
  }
  const ariaLabel = ariaLabelSections.join(". ");
  return ariaLabel;
}
var SettingScopeLink;
((SettingScopeLink2) => {
  function create(scope) {
    return URI.from({
      scheme: Schemas.internal,
      path: "/",
      query: encodeURIComponent(scope)
    });
  }
  SettingScopeLink2.create = create;
  function parse(link) {
    const uri = URI.parse(link);
    return decodeURIComponent(uri.query);
  }
  SettingScopeLink2.parse = parse;
})(SettingScopeLink || (SettingScopeLink = {}));
export {
  SettingsTreeIndicatorsLabel,
  getIndicatorsLabelAriaLabel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3ByZWZlcmVuY2VzL2Jyb3dzZXIvc2V0dGluZ3NFZGl0b3JTZXR0aW5nSW5kaWNhdG9ycy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIERPTSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IEhvdmVyU3R5bGUsIHR5cGUgSUhvdmVyT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBIb3ZlclBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyV2lkZ2V0LmpzJztcbmltcG9ydCB7IFNpbXBsZUljb25MYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvc2ltcGxlSWNvbkxhYmVsLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25TdHJpbmcsIE1hcmtkb3duU3RyaW5nLCBjcmVhdGVNYXJrZG93bkxpbmsgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzL2xhbmd1YWdlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3VzZXJEYXRhUHJvZmlsZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEFEVkFOQ0VEX0lORElDQVRPUl9ERVNDUklQVElPTiwgRVhQRVJJTUVOVEFMX0lORElDQVRPUl9ERVNDUklQVElPTiwgUE9MSUNZX1NFVFRJTkdfVEFHLCBQUkVWSUVXX0lORElDQVRPUl9ERVNDUklQVElPTiB9IGZyb20gJy4uL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCB9IGZyb20gJy4vc2V0dGluZ3NUcmVlTW9kZWxzLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG50eXBlIFNjb3BlU3RyaW5nID0gJ3dvcmtzcGFjZScgfCAndXNlcicgfCAncmVtb3RlJyB8ICdkZWZhdWx0JztcblxuZXhwb3J0IGludGVyZmFjZSBJU2V0dGluZ092ZXJyaWRlQ2xpY2tFdmVudCB7XG5cdHNjb3BlOiBTY29wZVN0cmluZztcblx0bGFuZ3VhZ2U6IHN0cmluZztcblx0c2V0dGluZ0tleTogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgU2V0dGluZ0luZGljYXRvciB7XG5cdGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHQvKipcblx0ICogVGhlIGVsZW1lbnQgdG8gZm9jdXMgb24gd2hlbiBuYXZpZ2F0aW5nIHdpdGgga2V5Ym9hcmQuXG5cdCAqIFdoZW4gdW5kZWZpbmVkLCB1c2Uge0BsaW5rIGVsZW1lbnR9IGluc3RlYWQuXG5cdCAqL1xuXHRmb2N1c0VsZW1lbnQ/OiBIVE1MRWxlbWVudDtcblx0bGFiZWw6IFNpbXBsZUljb25MYWJlbDtcblx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcbn1cblxuLyoqXG4gKiBDb250YWlucyBhIHNldCBvZiB0aGUgc3luYy1pZ25vcmVkIHNldHRpbmdzXG4gKiB0byBrZWVwIHRoZSBzeW5jIGlnbm9yZWQgaW5kaWNhdG9yIGFuZCB0aGUgZ2V0SW5kaWNhdG9yc0xhYmVsQXJpYUxhYmVsKCkgZnVuY3Rpb24gaW4gc3luYy5cbiAqIFNldHRpbmdzVHJlZUluZGljYXRvcnNMYWJlbCN1cGRhdGVTeW5jSWdub3JlZCBwcm92aWRlcyB0aGUgc291cmNlIG9mIHRydXRoLlxuICovXG5sZXQgY2FjaGVkU3luY0lnbm9yZWRTZXR0aW5nc1NldDogU2V0PHN0cmluZz4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuLyoqXG4gKiBDb250YWlucyBhIGNvcHkgb2YgdGhlIHN5bmMtaWdub3JlZCBzZXR0aW5ncyB0byBkZXRlcm1pbmUgd2hlbiB0byB1cGRhdGVcbiAqIGNhY2hlZFN5bmNJZ25vcmVkU2V0dGluZ3NTZXQuXG4gKi9cbmxldCBjYWNoZWRTeW5jSWdub3JlZFNldHRpbmdzOiBzdHJpbmdbXSA9IFtdO1xuXG4vKipcbiAqIFJlbmRlcnMgdGhlIGluZGljYXRvcnMgbmV4dCB0byBhIHNldHRpbmcsIHN1Y2ggYXMgXCJBbHNvIE1vZGlmaWVkIEluXCIuXG4gKi9cbmV4cG9ydCBjbGFzcyBTZXR0aW5nc1RyZWVJbmRpY2F0b3JzTGFiZWwgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgaW5kaWNhdG9yc0NvbnRhaW5lckVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJldmlld0luZGljYXRvcjogU2V0dGluZ0luZGljYXRvcjtcblx0cHJpdmF0ZSByZWFkb25seSBhZHZhbmNlZEluZGljYXRvcjogU2V0dGluZ0luZGljYXRvcjtcblx0cHJpdmF0ZSByZWFkb25seSB3b3Jrc3BhY2VUcnVzdEluZGljYXRvcjogU2V0dGluZ0luZGljYXRvcjtcblx0cHJpdmF0ZSByZWFkb25seSBzY29wZU92ZXJyaWRlc0luZGljYXRvcjogU2V0dGluZ0luZGljYXRvcjtcblx0cHJpdmF0ZSByZWFkb25seSBzeW5jSWdub3JlZEluZGljYXRvcjogU2V0dGluZ0luZGljYXRvcjtcblx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0T3ZlcnJpZGVJbmRpY2F0b3I6IFNldHRpbmdJbmRpY2F0b3I7XG5cblx0LyoqIEluZGljYXRvcnMgdGhhdCBlYWNoIGhhdmUgdGhlaXIgb3duIHNxdWFyZSBjb250YWluZXIgYXQgdGhlIHRvcC1yaWdodCBvZiB0aGUgc2V0dGluZyAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IGlzb2xhdGVkSW5kaWNhdG9yczogU2V0dGluZ0luZGljYXRvcltdID0gW107XG5cdC8qKiBJbmRpY2F0b3JzIHRoYXQgZW5kIHVwIHdyYXBwZWQgaW4gYSBwYXJlbnRoZXNpcyBhdCB0aGUgdG9wLXJpZ2h0IG9mIHRoZSBzZXR0aW5nICovXG5cdHByaXZhdGUgcmVhZG9ubHkgcGFyZW50aGVzaXplZEluZGljYXRvcnM6IFNldHRpbmdJbmRpY2F0b3JbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdMaXN0ZW5lcnM6IERpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBmb2N1c2VkSW5kZXggPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0QElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElVc2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlOiBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UpIHtcblx0XHR0aGlzLmluZGljYXRvcnNDb250YWluZXJFbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5zZXR0aW5nLWluZGljYXRvcnMtY29udGFpbmVyJykpO1xuXHRcdHRoaXMuaW5kaWNhdG9yc0NvbnRhaW5lckVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUnO1xuXG5cdFx0dGhpcy5wcmV2aWV3SW5kaWNhdG9yID0gdGhpcy5jcmVhdGVQcmV2aWV3SW5kaWNhdG9yKCk7XG5cdFx0dGhpcy5hZHZhbmNlZEluZGljYXRvciA9IHRoaXMuY3JlYXRlQWR2YW5jZWRJbmRpY2F0b3IoKTtcblx0XHR0aGlzLmlzb2xhdGVkSW5kaWNhdG9ycyA9IFt0aGlzLnByZXZpZXdJbmRpY2F0b3IsIHRoaXMuYWR2YW5jZWRJbmRpY2F0b3JdO1xuXG5cdFx0dGhpcy53b3Jrc3BhY2VUcnVzdEluZGljYXRvciA9IHRoaXMuY3JlYXRlV29ya3NwYWNlVHJ1c3RJbmRpY2F0b3IoKTtcblx0XHR0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yID0gdGhpcy5jcmVhdGVTY29wZU92ZXJyaWRlc0luZGljYXRvcigpO1xuXHRcdHRoaXMuc3luY0lnbm9yZWRJbmRpY2F0b3IgPSB0aGlzLmNyZWF0ZVN5bmNJZ25vcmVkSW5kaWNhdG9yKCk7XG5cdFx0dGhpcy5kZWZhdWx0T3ZlcnJpZGVJbmRpY2F0b3IgPSB0aGlzLmNyZWF0ZURlZmF1bHRPdmVycmlkZUluZGljYXRvcigpO1xuXHRcdHRoaXMucGFyZW50aGVzaXplZEluZGljYXRvcnMgPSBbdGhpcy53b3Jrc3BhY2VUcnVzdEluZGljYXRvciwgdGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvciwgdGhpcy5zeW5jSWdub3JlZEluZGljYXRvciwgdGhpcy5kZWZhdWx0T3ZlcnJpZGVJbmRpY2F0b3JdO1xuXHR9XG5cblx0cHJpdmF0ZSBkZWZhdWx0SG92ZXJPcHRpb25zOiBQYXJ0aWFsPElIb3Zlck9wdGlvbnM+ID0ge1xuXHRcdHRyYXBGb2N1czogdHJ1ZSxcblx0XHRzdHlsZTogSG92ZXJTdHlsZS5Qb2ludGVyLFxuXHRcdHBvc2l0aW9uOiB7XG5cdFx0XHRob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkJFTE9XLFxuXHRcdH0sXG5cdH07XG5cblxuXHRwcml2YXRlIGNyZWF0ZVdvcmtzcGFjZVRydXN0SW5kaWNhdG9yKCk6IFNldHRpbmdJbmRpY2F0b3Ige1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVRydXN0RWxlbWVudCA9ICQoJ3NwYW4uc2V0dGluZy1pbmRpY2F0b3Iuc2V0dGluZy1pdGVtLXdvcmtzcGFjZS10cnVzdCcpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVRydXN0TGFiZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNpbXBsZUljb25MYWJlbCh3b3Jrc3BhY2VUcnVzdEVsZW1lbnQpKTtcblx0XHR3b3Jrc3BhY2VUcnVzdExhYmVsLnRleHQgPSAnJChzaGllbGQpICcgKyBsb2NhbGl6ZSgnd29ya3NwYWNlVW50cnVzdGVkTGFiZWwnLCBcIlJlcXVpcmVzIHdvcmtzcGFjZSB0cnVzdFwiKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBsb2NhbGl6ZSgndHJ1c3RMYWJlbCcsIFwiVGhlIHNldHRpbmcgdmFsdWUgY2FuIG9ubHkgYmUgYXBwbGllZCBpbiBhIHRydXN0ZWQgd29ya3NwYWNlLlwiKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIod29ya3NwYWNlVHJ1c3RFbGVtZW50LCAoKSA9PiAoe1xuXHRcdFx0Li4udGhpcy5kZWZhdWx0SG92ZXJPcHRpb25zLFxuXHRcdFx0Y29udGVudCxcblx0XHRcdGFjdGlvbnM6IFt7XG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnbWFuYWdlV29ya3NwYWNlVHJ1c3QnLCBcIk1hbmFnZSBXb3Jrc3BhY2UgVHJ1c3RcIiksXG5cdFx0XHRcdGNvbW1hbmRJZDogJ3dvcmtiZW5jaC50cnVzdC5tYW5hZ2UnLFxuXHRcdFx0XHRydW46ICh0YXJnZXQ6IEhUTUxFbGVtZW50KSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCgnd29ya2JlbmNoLnRydXN0Lm1hbmFnZScpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XSxcblx0XHR9KSwgeyBzZXR1cEtleWJvYXJkRXZlbnRzOiB0cnVlIH0pKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWxlbWVudDogd29ya3NwYWNlVHJ1c3RFbGVtZW50LFxuXHRcdFx0bGFiZWw6IHdvcmtzcGFjZVRydXN0TGFiZWwsXG5cdFx0XHRkaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yKCk6IFNldHRpbmdJbmRpY2F0b3Ige1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdC8vIERvbid0IGFkZCAuc2V0dGluZy1pbmRpY2F0b3IgY2xhc3MgaGVyZSwgYmVjYXVzZSBpdCBnZXRzIGNvbmRpdGlvbmFsbHkgYWRkZWQgbGF0ZXIuXG5cdFx0Y29uc3Qgb3RoZXJPdmVycmlkZXNFbGVtZW50ID0gJCgnc3Bhbi5zZXR0aW5nLWl0ZW0tb3ZlcnJpZGVzJyk7XG5cdFx0Y29uc3Qgb3RoZXJPdmVycmlkZXNMYWJlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2ltcGxlSWNvbkxhYmVsKG90aGVyT3ZlcnJpZGVzRWxlbWVudCkpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRlbGVtZW50OiBvdGhlck92ZXJyaWRlc0VsZW1lbnQsXG5cdFx0XHRsYWJlbDogb3RoZXJPdmVycmlkZXNMYWJlbCxcblx0XHRcdGRpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU3luY0lnbm9yZWRJbmRpY2F0b3IoKTogU2V0dGluZ0luZGljYXRvciB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3Qgc3luY0lnbm9yZWRFbGVtZW50ID0gJCgnc3Bhbi5zZXR0aW5nLWluZGljYXRvci5zZXR0aW5nLWl0ZW0taWdub3JlZCcpO1xuXHRcdGNvbnN0IHN5bmNJZ25vcmVkTGFiZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNpbXBsZUljb25MYWJlbChzeW5jSWdub3JlZEVsZW1lbnQpKTtcblx0XHRzeW5jSWdub3JlZExhYmVsLnRleHQgPSBsb2NhbGl6ZSgnZXh0ZW5zaW9uU3luY0lnbm9yZWRMYWJlbCcsICdOb3Qgc3luY2VkJyk7XG5cblx0XHRjb25zdCBzeW5jSWdub3JlZEhvdmVyQ29udGVudCA9IGxvY2FsaXplKCdzeW5jSWdub3JlZFRpdGxlJywgXCJUaGlzIHNldHRpbmcgaXMgaWdub3JlZCBkdXJpbmcgc3luY1wiKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIoc3luY0lnbm9yZWRFbGVtZW50LCB7XG5cdFx0XHQuLi50aGlzLmRlZmF1bHRIb3Zlck9wdGlvbnMsXG5cdFx0XHRjb250ZW50OiBzeW5jSWdub3JlZEhvdmVyQ29udGVudCxcblx0XHR9LCB7IHNldHVwS2V5Ym9hcmRFdmVudHM6IHRydWUgfSkpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVsZW1lbnQ6IHN5bmNJZ25vcmVkRWxlbWVudCxcblx0XHRcdGxhYmVsOiBzeW5jSWdub3JlZExhYmVsLFxuXHRcdFx0ZGlzcG9zYWJsZXNcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVEZWZhdWx0T3ZlcnJpZGVJbmRpY2F0b3IoKTogU2V0dGluZ0luZGljYXRvciB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgZGVmYXVsdE92ZXJyaWRlSW5kaWNhdG9yID0gJCgnc3Bhbi5zZXR0aW5nLWluZGljYXRvci5zZXR0aW5nLWl0ZW0tZGVmYXVsdC1vdmVycmlkZGVuJyk7XG5cdFx0Y29uc3QgZGVmYXVsdE92ZXJyaWRlTGFiZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNpbXBsZUljb25MYWJlbChkZWZhdWx0T3ZlcnJpZGVJbmRpY2F0b3IpKTtcblx0XHRkZWZhdWx0T3ZlcnJpZGVMYWJlbC50ZXh0ID0gbG9jYWxpemUoJ2RlZmF1bHRPdmVycmlkZGVuTGFiZWwnLCBcIkRlZmF1bHQgdmFsdWUgY2hhbmdlZFwiKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRlbGVtZW50OiBkZWZhdWx0T3ZlcnJpZGVJbmRpY2F0b3IsXG5cdFx0XHRsYWJlbDogZGVmYXVsdE92ZXJyaWRlTGFiZWwsXG5cdFx0XHRkaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVByZXZpZXdJbmRpY2F0b3IoKTogU2V0dGluZ0luZGljYXRvciB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcHJldmlld0luZGljYXRvciA9ICQoJ3NwYW4uc2V0dGluZy1pbmRpY2F0b3Iuc2V0dGluZy1pdGVtLXByZXZpZXcnKTtcblx0XHRjb25zdCBwcmV2aWV3TGFiZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNpbXBsZUljb25MYWJlbChwcmV2aWV3SW5kaWNhdG9yKSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWxlbWVudDogcHJldmlld0luZGljYXRvcixcblx0XHRcdGxhYmVsOiBwcmV2aWV3TGFiZWwsXG5cdFx0XHRkaXNwb3NhYmxlc1xuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUFkdmFuY2VkSW5kaWNhdG9yKCk6IFNldHRpbmdJbmRpY2F0b3Ige1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IGFkdmFuY2VkSW5kaWNhdG9yID0gJCgnc3Bhbi5zZXR0aW5nLWluZGljYXRvci5zZXR0aW5nLWl0ZW0tcHJldmlldycpO1xuXHRcdGNvbnN0IGFkdmFuY2VkTGFiZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNpbXBsZUljb25MYWJlbChhZHZhbmNlZEluZGljYXRvcikpO1xuXHRcdGFkdmFuY2VkTGFiZWwudGV4dCA9IGxvY2FsaXplKCdhZHZhbmNlZExhYmVsJywgXCJBZHZhbmNlZFwiKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihhZHZhbmNlZEluZGljYXRvciwge1xuXHRcdFx0Li4udGhpcy5kZWZhdWx0SG92ZXJPcHRpb25zLFxuXHRcdFx0Y29udGVudDogQURWQU5DRURfSU5ESUNBVE9SX0RFU0NSSVBUSU9OLFxuXHRcdH0sIHsgc2V0dXBLZXlib2FyZEV2ZW50czogdHJ1ZSB9KSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWxlbWVudDogYWR2YW5jZWRJbmRpY2F0b3IsXG5cdFx0XHRsYWJlbDogYWR2YW5jZWRMYWJlbCxcblx0XHRcdGRpc3Bvc2FibGVzXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyKCkge1xuXHRcdHRoaXMuaW5kaWNhdG9yc0NvbnRhaW5lckVsZW1lbnQuaW5uZXJUZXh0ID0gJyc7XG5cdFx0dGhpcy5pbmRpY2F0b3JzQ29udGFpbmVyRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXG5cdFx0Y29uc3QgaXNvbGF0ZWRJbmRpY2F0b3JzVG9TaG93ID0gdGhpcy5pc29sYXRlZEluZGljYXRvcnMuZmlsdGVyKGluZGljYXRvciA9PiB7XG5cdFx0XHRyZXR1cm4gaW5kaWNhdG9yLmVsZW1lbnQuc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnO1xuXHRcdH0pO1xuXHRcdGlmIChpc29sYXRlZEluZGljYXRvcnNUb1Nob3cubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmluZGljYXRvcnNDb250YWluZXJFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lJztcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaXNvbGF0ZWRJbmRpY2F0b3JzVG9TaG93Lmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdERPTS5hcHBlbmQodGhpcy5pbmRpY2F0b3JzQ29udGFpbmVyRWxlbWVudCwgaXNvbGF0ZWRJbmRpY2F0b3JzVG9TaG93W2ldLmVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IHBhcmVudGhlc2l6ZWRJbmRpY2F0b3JzVG9TaG93ID0gdGhpcy5wYXJlbnRoZXNpemVkSW5kaWNhdG9ycy5maWx0ZXIoaW5kaWNhdG9yID0+IHtcblx0XHRcdHJldHVybiBpbmRpY2F0b3IuZWxlbWVudC5zdHlsZS5kaXNwbGF5ICE9PSAnbm9uZSc7XG5cdFx0fSk7XG5cdFx0aWYgKHBhcmVudGhlc2l6ZWRJbmRpY2F0b3JzVG9TaG93Lmxlbmd0aCkge1xuXHRcdFx0dGhpcy5pbmRpY2F0b3JzQ29udGFpbmVyRWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZSc7XG5cdFx0XHRET00uYXBwZW5kKHRoaXMuaW5kaWNhdG9yc0NvbnRhaW5lckVsZW1lbnQsICQoJ3NwYW4nLCB1bmRlZmluZWQsICcoJykpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBwYXJlbnRoZXNpemVkSW5kaWNhdG9yc1RvU2hvdy5sZW5ndGggLSAxOyBpKyspIHtcblx0XHRcdFx0RE9NLmFwcGVuZCh0aGlzLmluZGljYXRvcnNDb250YWluZXJFbGVtZW50LCBwYXJlbnRoZXNpemVkSW5kaWNhdG9yc1RvU2hvd1tpXS5lbGVtZW50KTtcblx0XHRcdFx0RE9NLmFwcGVuZCh0aGlzLmluZGljYXRvcnNDb250YWluZXJFbGVtZW50LCAkKCdzcGFuLmNvbW1hJywgdW5kZWZpbmVkLCAnIFx1MjAyMiAnKSk7XG5cdFx0XHR9XG5cdFx0XHRET00uYXBwZW5kKHRoaXMuaW5kaWNhdG9yc0NvbnRhaW5lckVsZW1lbnQsIHBhcmVudGhlc2l6ZWRJbmRpY2F0b3JzVG9TaG93W3BhcmVudGhlc2l6ZWRJbmRpY2F0b3JzVG9TaG93Lmxlbmd0aCAtIDFdLmVsZW1lbnQpO1xuXHRcdFx0RE9NLmFwcGVuZCh0aGlzLmluZGljYXRvcnNDb250YWluZXJFbGVtZW50LCAkKCdzcGFuJywgdW5kZWZpbmVkLCAnKScpKTtcblx0XHR9XG5cdFx0dGhpcy5yZXNldEluZGljYXRvck5hdmlnYXRpb25LZXlCaW5kaW5ncyhbLi4uaXNvbGF0ZWRJbmRpY2F0b3JzVG9TaG93LCAuLi5wYXJlbnRoZXNpemVkSW5kaWNhdG9yc1RvU2hvd10pO1xuXHR9XG5cblx0cHJpdmF0ZSByZXNldEluZGljYXRvck5hdmlnYXRpb25LZXlCaW5kaW5ncyhpbmRpY2F0b3JzOiBTZXR0aW5nSW5kaWNhdG9yW10pIHtcblx0XHR0aGlzLmtleWJpbmRpbmdMaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHR0aGlzLmluZGljYXRvcnNDb250YWluZXJFbGVtZW50LnJvbGUgPSBpbmRpY2F0b3JzLmxlbmd0aCA+PSAxID8gJ3Rvb2xiYXInIDogJ2J1dHRvbic7XG5cdFx0aWYgKCFpbmRpY2F0b3JzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBmaXJzdEVsZW1lbnQgPSBpbmRpY2F0b3JzWzBdLmZvY3VzRWxlbWVudCA/PyBpbmRpY2F0b3JzWzBdLmVsZW1lbnQ7XG5cdFx0Zmlyc3RFbGVtZW50LnRhYkluZGV4ID0gMDtcblx0XHR0aGlzLmtleWJpbmRpbmdMaXN0ZW5lcnMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5pbmRpY2F0b3JzQ29udGFpbmVyRWxlbWVudCwgJ2tleWRvd24nLCAoZSkgPT4ge1xuXHRcdFx0Y29uc3QgZXYgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0bGV0IGhhbmRsZWQgPSB0cnVlO1xuXHRcdFx0aWYgKGV2LmVxdWFscyhLZXlDb2RlLkhvbWUpKSB7XG5cdFx0XHRcdHRoaXMuZm9jdXNJbmRpY2F0b3JBdChpbmRpY2F0b3JzLCAwKTtcblx0XHRcdH0gZWxzZSBpZiAoZXYuZXF1YWxzKEtleUNvZGUuRW5kKSkge1xuXHRcdFx0XHR0aGlzLmZvY3VzSW5kaWNhdG9yQXQoaW5kaWNhdG9ycywgaW5kaWNhdG9ycy5sZW5ndGggLSAxKTtcblx0XHRcdH0gZWxzZSBpZiAoZXYuZXF1YWxzKEtleUNvZGUuUmlnaHRBcnJvdykpIHtcblx0XHRcdFx0Y29uc3QgaW5kZXhUb0ZvY3VzID0gKHRoaXMuZm9jdXNlZEluZGV4ICsgMSkgJSBpbmRpY2F0b3JzLmxlbmd0aDtcblx0XHRcdFx0dGhpcy5mb2N1c0luZGljYXRvckF0KGluZGljYXRvcnMsIGluZGV4VG9Gb2N1cyk7XG5cdFx0XHR9IGVsc2UgaWYgKGV2LmVxdWFscyhLZXlDb2RlLkxlZnRBcnJvdykpIHtcblx0XHRcdFx0Y29uc3QgaW5kZXhUb0ZvY3VzID0gdGhpcy5mb2N1c2VkSW5kZXggPyB0aGlzLmZvY3VzZWRJbmRleCAtIDEgOiBpbmRpY2F0b3JzLmxlbmd0aCAtIDE7XG5cdFx0XHRcdHRoaXMuZm9jdXNJbmRpY2F0b3JBdChpbmRpY2F0b3JzLCBpbmRleFRvRm9jdXMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aGFuZGxlZCA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaGFuZGxlZCkge1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBmb2N1c0luZGljYXRvckF0KGluZGljYXRvcnM6IFNldHRpbmdJbmRpY2F0b3JbXSwgaW5kZXg6IG51bWJlcikge1xuXHRcdGlmIChpbmRleCA9PT0gdGhpcy5mb2N1c2VkSW5kZXgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgaW5kaWNhdG9yID0gaW5kaWNhdG9yc1tpbmRleF07XG5cdFx0Y29uc3QgZWxlbWVudFRvRm9jdXMgPSBpbmRpY2F0b3IuZm9jdXNFbGVtZW50ID8/IGluZGljYXRvci5lbGVtZW50O1xuXHRcdGVsZW1lbnRUb0ZvY3VzLnRhYkluZGV4ID0gMDtcblx0XHRlbGVtZW50VG9Gb2N1cy5mb2N1cygpO1xuXG5cdFx0Y29uc3QgY3VycmVudGx5Rm9jdXNlZEluZGljYXRvciA9IGluZGljYXRvcnNbdGhpcy5mb2N1c2VkSW5kZXhdO1xuXHRcdGNvbnN0IHByZXZpb3VzRm9jdXNlZEVsZW1lbnQgPSBjdXJyZW50bHlGb2N1c2VkSW5kaWNhdG9yLmZvY3VzRWxlbWVudCA/PyBjdXJyZW50bHlGb2N1c2VkSW5kaWNhdG9yLmVsZW1lbnQ7XG5cdFx0cHJldmlvdXNGb2N1c2VkRWxlbWVudC50YWJJbmRleCA9IC0xO1xuXG5cdFx0dGhpcy5mb2N1c2VkSW5kZXggPSBpbmRleDtcblx0fVxuXG5cdHVwZGF0ZVdvcmtzcGFjZVRydXN0KGVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KSB7XG5cdFx0dGhpcy53b3Jrc3BhY2VUcnVzdEluZGljYXRvci5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBlbGVtZW50LmlzVW50cnVzdGVkID8gJ2lubGluZScgOiAnbm9uZSc7XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0fVxuXG5cdHVwZGF0ZVN5bmNJZ25vcmVkKGVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50LCBpZ25vcmVkU2V0dGluZ3M6IHN0cmluZ1tdKSB7XG5cdFx0dGhpcy5zeW5jSWdub3JlZEluZGljYXRvci5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSB0aGlzLnVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLmlzRW5hYmxlZCgpXG5cdFx0XHQmJiBpZ25vcmVkU2V0dGluZ3MuaW5jbHVkZXMoZWxlbWVudC5zZXR0aW5nLmtleSkgPyAnaW5saW5lJyA6ICdub25lJztcblx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdGlmIChjYWNoZWRTeW5jSWdub3JlZFNldHRpbmdzICE9PSBpZ25vcmVkU2V0dGluZ3MpIHtcblx0XHRcdGNhY2hlZFN5bmNJZ25vcmVkU2V0dGluZ3MgPSBpZ25vcmVkU2V0dGluZ3M7XG5cdFx0XHRjYWNoZWRTeW5jSWdub3JlZFNldHRpbmdzU2V0ID0gbmV3IFNldDxzdHJpbmc+KGNhY2hlZFN5bmNJZ25vcmVkU2V0dGluZ3MpO1xuXHRcdH1cblx0fVxuXG5cdHVwZGF0ZVByZXZpZXdJbmRpY2F0b3IoZWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQpIHtcblx0XHRjb25zdCBpc1ByZXZpZXdTZXR0aW5nID0gZWxlbWVudC50YWdzPy5oYXMoJ3ByZXZpZXcnKTtcblx0XHRjb25zdCBpc0V4cGVyaW1lbnRhbFNldHRpbmcgPSBlbGVtZW50LnRhZ3M/LmhhcygnZXhwZXJpbWVudGFsJyk7XG5cdFx0dGhpcy5wcmV2aWV3SW5kaWNhdG9yLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9IChpc1ByZXZpZXdTZXR0aW5nIHx8IGlzRXhwZXJpbWVudGFsU2V0dGluZykgPyAnaW5saW5lJyA6ICdub25lJztcblx0XHR0aGlzLnByZXZpZXdJbmRpY2F0b3IubGFiZWwudGV4dCA9IGlzUHJldmlld1NldHRpbmcgP1xuXHRcdFx0bG9jYWxpemUoJ3ByZXZpZXdMYWJlbCcsIFwiUHJldmlld1wiKSA6XG5cdFx0XHRsb2NhbGl6ZSgnZXhwZXJpbWVudGFsTGFiZWwnLCBcIkV4cGVyaW1lbnRhbFwiKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBpc1ByZXZpZXdTZXR0aW5nID8gUFJFVklFV19JTkRJQ0FUT1JfREVTQ1JJUFRJT04gOiBFWFBFUklNRU5UQUxfSU5ESUNBVE9SX0RFU0NSSVBUSU9OO1xuXHRcdHRoaXMucHJldmlld0luZGljYXRvci5kaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGhpcy5wcmV2aWV3SW5kaWNhdG9yLmVsZW1lbnQsIHtcblx0XHRcdC4uLnRoaXMuZGVmYXVsdEhvdmVyT3B0aW9ucyxcblx0XHRcdGNvbnRlbnQsXG5cdFx0fSwgeyBzZXR1cEtleWJvYXJkRXZlbnRzOiB0cnVlIH0pKTtcblxuXHRcdHRoaXMucmVuZGVyKCk7XG5cdH1cblxuXHR1cGRhdGVBZHZhbmNlZEluZGljYXRvcihlbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCkge1xuXHRcdGNvbnN0IGlzQWR2YW5jZWRTZXR0aW5nID0gZWxlbWVudC50YWdzPy5oYXMoJ2FkdmFuY2VkJyk7XG5cdFx0dGhpcy5hZHZhbmNlZEluZGljYXRvci5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBpc0FkdmFuY2VkU2V0dGluZyA/ICdpbmxpbmUnIDogJ25vbmUnO1xuXHRcdHRoaXMucmVuZGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldElubGluZVNjb3BlRGlzcGxheVRleHQoY29tcGxldGVTY29wZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRjb25zdCBbc2NvcGUsIGxhbmd1YWdlXSA9IGNvbXBsZXRlU2NvcGUuc3BsaXQoJzonKTtcblx0XHRjb25zdCBsb2NhbGl6ZWRTY29wZSA9IHNjb3BlID09PSAndXNlcicgP1xuXHRcdFx0bG9jYWxpemUoJ3VzZXInLCBcIlVzZXJcIikgOiBzY29wZSA9PT0gJ3dvcmtzcGFjZScgP1xuXHRcdFx0XHRsb2NhbGl6ZSgnd29ya3NwYWNlJywgXCJXb3Jrc3BhY2VcIikgOiBsb2NhbGl6ZSgncmVtb3RlJywgXCJSZW1vdGVcIik7XG5cdFx0aWYgKGxhbmd1YWdlKSB7XG5cdFx0XHRyZXR1cm4gYCR7dGhpcy5sYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VOYW1lKGxhbmd1YWdlKX0gPiAke2xvY2FsaXplZFNjb3BlfWA7XG5cdFx0fVxuXHRcdHJldHVybiBsb2NhbGl6ZWRTY29wZTtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5rZXliaW5kaW5nTGlzdGVuZXJzLmRpc3Bvc2UoKTtcblx0XHRmb3IgKGNvbnN0IGluZGljYXRvciBvZiB0aGlzLmlzb2xhdGVkSW5kaWNhdG9ycykge1xuXHRcdFx0aW5kaWNhdG9yLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBpbmRpY2F0b3Igb2YgdGhpcy5wYXJlbnRoZXNpemVkSW5kaWNhdG9ycykge1xuXHRcdFx0aW5kaWNhdG9yLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHR1cGRhdGVTY29wZU92ZXJyaWRlcyhlbGVtZW50OiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCwgb25EaWRDbGlja092ZXJyaWRlRWxlbWVudDogRW1pdHRlcjxJU2V0dGluZ092ZXJyaWRlQ2xpY2tFdmVudD4sIG9uQXBwbHlGaWx0ZXI6IEVtaXR0ZXI8c3RyaW5nPikge1xuXHRcdHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmVsZW1lbnQuaW5uZXJUZXh0ID0gJyc7XG5cdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5mb2N1c0VsZW1lbnQgPSB0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmVsZW1lbnQ7XG5cdFx0aWYgKGVsZW1lbnQuaGFzUG9saWN5VmFsdWUpIHtcblx0XHRcdC8vIElmIHRoZSBzZXR0aW5nIGZhbGxzIHVuZGVyIGEgcG9saWN5LCB0aGVuIG5vIG1hdHRlciB3aGF0IHRoZSB1c2VyIHNldHMsIHRoZSBwb2xpY3kgdmFsdWUgdGFrZXMgZWZmZWN0LlxuXHRcdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lJztcblx0XHRcdHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzZXR0aW5nLWluZGljYXRvcicpO1xuXG5cdFx0XHR0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmxhYmVsLnRleHQgPSAnJChicmllZmNhc2UpICcgKyBsb2NhbGl6ZSgncG9saWN5TGFiZWxUZXh0JywgXCJNYW5hZ2VkIGJ5IG9yZ2FuaXphdGlvblwiKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBsb2NhbGl6ZSgncG9saWN5RGVzY3JpcHRpb24nLCBcIlRoaXMgc2V0dGluZyBpcyBtYW5hZ2VkIGJ5IHlvdXIgb3JnYW5pemF0aW9uIGFuZCBpdHMgYWN0dWFsIHZhbHVlIGNhbm5vdCBiZSBjaGFuZ2VkLlwiKTtcblx0XHRcdHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZWxlbWVudCwgKCkgPT4gKHtcblx0XHRcdFx0Li4udGhpcy5kZWZhdWx0SG92ZXJPcHRpb25zLFxuXHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRhY3Rpb25zOiBbe1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncG9saWN5RmlsdGVyTGluaycsIFwiVmlldyBwb2xpY3kgc2V0dGluZ3NcIiksXG5cdFx0XHRcdFx0Y29tbWFuZElkOiAnX3NldHRpbmdzLmFjdGlvbi52aWV3UG9saWN5U2V0dGluZ3MnLFxuXHRcdFx0XHRcdHJ1bjogKF8pID0+IHtcblx0XHRcdFx0XHRcdG9uQXBwbHlGaWx0ZXIuZmlyZShgQCR7UE9MSUNZX1NFVFRJTkdfVEFHfWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV0sXG5cdFx0XHR9KSwgeyBzZXR1cEtleWJvYXJkRXZlbnRzOiB0cnVlIH0pKTtcblx0XHR9IGVsc2UgaWYgKGVsZW1lbnQuaXNBZ2VudHNXaW5kb3dSZWFkT25seSkge1xuXHRcdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lJztcblx0XHRcdHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzZXR0aW5nLWluZGljYXRvcicpO1xuXG5cdFx0XHR0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmxhYmVsLnRleHQgPSAnJChsb2NrKSAnICsgbG9jYWxpemUoJ2FnZW50c1dpbmRvd1JlYWRPbmx5TGFiZWxUZXh0JywgXCJDYW5ub3QgYmUgY2hhbmdlZCBpbiBBZ2VudHMgd2luZG93XCIpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGxvY2FsaXplKCdhZ2VudHNXaW5kb3dSZWFkT25seURlc2NyaXB0aW9uJywgXCJUaGlzIHNldHRpbmcgY2Fubm90IGJlIGNoYW5nZWQgaW4gdGhlIEFnZW50cyB3aW5kb3cuXCIpO1xuXHRcdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5kaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5lbGVtZW50LCB7XG5cdFx0XHRcdC4uLnRoaXMuZGVmYXVsdEhvdmVyT3B0aW9ucyxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdH0sIHsgc2V0dXBLZXlib2FyZEV2ZW50czogdHJ1ZSB9KSk7XG5cdFx0fSBlbHNlIGlmIChlbGVtZW50LnNldHRpbmdzVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwgJiYgdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pc1NldHRpbmdBcHBsaWVkRm9yQWxsUHJvZmlsZXMoZWxlbWVudC5zZXR0aW5nLmtleSkpIHtcblx0XHRcdHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZSc7XG5cdFx0XHR0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnc2V0dGluZy1pbmRpY2F0b3InKTtcblxuXHRcdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5sYWJlbC50ZXh0ID0gbG9jYWxpemUoJ2FwcGxpY2F0aW9uU2V0dGluZycsIFwiQXBwbGllcyB0byBhbGwgcHJvZmlsZXNcIik7XG5cblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBsb2NhbGl6ZSgnYXBwbGljYXRpb25TZXR0aW5nRGVzY3JpcHRpb24nLCBcIlRoZSBzZXR0aW5nIGlzIG5vdCBzcGVjaWZpYyB0byB0aGUgY3VycmVudCBwcm9maWxlLCBhbmQgd2lsbCByZXRhaW4gaXRzIHZhbHVlIHdoZW4gc3dpdGNoaW5nIHByb2ZpbGVzLlwiKTtcblx0XHRcdHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZWxlbWVudCwge1xuXHRcdFx0XHQuLi50aGlzLmRlZmF1bHRIb3Zlck9wdGlvbnMsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHR9LCB7IHNldHVwS2V5Ym9hcmRFdmVudHM6IHRydWUgfSkpO1xuXHRcdH0gZWxzZSBpZiAoZWxlbWVudC5vdmVycmlkZGVuU2NvcGVMaXN0Lmxlbmd0aCB8fCBlbGVtZW50Lm92ZXJyaWRkZW5EZWZhdWx0c0xhbmd1YWdlTGlzdC5sZW5ndGgpIHtcblx0XHRcdGlmIChlbGVtZW50Lm92ZXJyaWRkZW5TY29wZUxpc3QubGVuZ3RoID09PSAxICYmICFlbGVtZW50Lm92ZXJyaWRkZW5EZWZhdWx0c0xhbmd1YWdlTGlzdC5sZW5ndGgpIHtcblx0XHRcdFx0Ly8gV2UgY2FuIGlubGluZSB0aGUgb3ZlcnJpZGUgYW5kIHNob3cgYWxsIHRoZSB0ZXh0IGluIHRoZSBsYWJlbFxuXHRcdFx0XHQvLyBzbyB0aGF0IHVzZXJzIGRvbid0IGhhdmUgdG8gd2FpdCBmb3IgdGhlIGhvdmVyIHRvIGxvYWRcblx0XHRcdFx0Ly8ganVzdCB0byBjbGljayBpbnRvIHRoZSBvbmUgb3ZlcnJpZGUgdGhlcmUgaXMuXG5cdFx0XHRcdHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZSc7XG5cdFx0XHRcdHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdzZXR0aW5nLWluZGljYXRvcicpO1xuXG5cdFx0XHRcdGNvbnN0IHByZWZhY2VUZXh0ID0gZWxlbWVudC5pc0NvbmZpZ3VyZWQgP1xuXHRcdFx0XHRcdGxvY2FsaXplKCdhbHNvQ29uZmlndXJlZEluJywgXCJBbHNvIG1vZGlmaWVkIGluXCIpIDpcblx0XHRcdFx0XHRsb2NhbGl6ZSgnY29uZmlndXJlZEluJywgXCJNb2RpZmllZCBpblwiKTtcblx0XHRcdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5sYWJlbC50ZXh0ID0gYCR7cHJlZmFjZVRleHR9IGA7XG5cblx0XHRcdFx0Y29uc3Qgb3ZlcnJpZGRlblNjb3BlID0gZWxlbWVudC5vdmVycmlkZGVuU2NvcGVMaXN0WzBdO1xuXHRcdFx0XHRjb25zdCB2aWV3ID0gRE9NLmFwcGVuZCh0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmVsZW1lbnQsICQoJ2EubW9kaWZpZWQtc2NvcGUnLCB1bmRlZmluZWQsIHRoaXMuZ2V0SW5saW5lU2NvcGVEaXNwbGF5VGV4dChvdmVycmlkZGVuU2NvcGUpKSk7XG5cdFx0XHRcdHZpZXcudGFiSW5kZXggPSAtMTtcblx0XHRcdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5mb2N1c0VsZW1lbnQgPSB2aWV3O1xuXHRcdFx0XHRjb25zdCBvbkNsaWNrT3JLZXlkb3duID0gKGU6IFVJRXZlbnQpID0+IHtcblx0XHRcdFx0XHRjb25zdCBbc2NvcGUsIGxhbmd1YWdlXSA9IG92ZXJyaWRkZW5TY29wZS5zcGxpdCgnOicpO1xuXHRcdFx0XHRcdG9uRGlkQ2xpY2tPdmVycmlkZUVsZW1lbnQuZmlyZSh7XG5cdFx0XHRcdFx0XHRzZXR0aW5nS2V5OiBlbGVtZW50LnNldHRpbmcua2V5LFxuXHRcdFx0XHRcdFx0c2NvcGU6IHNjb3BlIGFzIFNjb3BlU3RyaW5nLFxuXHRcdFx0XHRcdFx0bGFuZ3VhZ2Vcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5kaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih2aWV3LCBET00uRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0XHRcdG9uQ2xpY2tPcktleWRvd24oZSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0dGhpcy5zY29wZU92ZXJyaWRlc0luZGljYXRvci5kaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih2aWV3LCBET00uRXZlbnRUeXBlLktFWV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGV2ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdFx0XHRpZiAoZXYuZXF1YWxzKEtleUNvZGUuU3BhY2UpIHx8IGV2LmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHRcdFx0b25DbGlja09yS2V5ZG93bihlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZSc7XG5cdFx0XHRcdHRoaXMuc2NvcGVPdmVycmlkZXNJbmRpY2F0b3IuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzZXR0aW5nLWluZGljYXRvcicpO1xuXHRcdFx0XHRjb25zdCBzY29wZU92ZXJyaWRlc0xhYmVsVGV4dCA9IGVsZW1lbnQuaXNDb25maWd1cmVkID9cblx0XHRcdFx0XHRsb2NhbGl6ZSgnYWxzb0NvbmZpZ3VyZWRFbHNld2hlcmUnLCBcIkFsc28gbW9kaWZpZWQgZWxzZXdoZXJlXCIpIDpcblx0XHRcdFx0XHRsb2NhbGl6ZSgnY29uZmlndXJlZEVsc2V3aGVyZScsIFwiTW9kaWZpZWQgZWxzZXdoZXJlXCIpO1xuXHRcdFx0XHR0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmxhYmVsLnRleHQgPSBzY29wZU92ZXJyaWRlc0xhYmVsVGV4dDtcblxuXHRcdFx0XHRsZXQgY29udGVudE1hcmtkb3duU3RyaW5nID0gJyc7XG5cdFx0XHRcdGlmIChlbGVtZW50Lm92ZXJyaWRkZW5TY29wZUxpc3QubGVuZ3RoKSB7XG5cdFx0XHRcdFx0Y29uc3QgcHJlZmFjZVRleHQgPSBlbGVtZW50LmlzQ29uZmlndXJlZCA/XG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnYWxzb01vZGlmaWVkSW5TY29wZXMnLCBcIlRoZSBzZXR0aW5nIGhhcyBhbHNvIGJlZW4gbW9kaWZpZWQgaW4gdGhlIGZvbGxvd2luZyBzY29wZXM6XCIpIDpcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdtb2RpZmllZEluU2NvcGVzJywgXCJUaGUgc2V0dGluZyBoYXMgYmVlbiBtb2RpZmllZCBpbiB0aGUgZm9sbG93aW5nIHNjb3BlczpcIik7XG5cdFx0XHRcdFx0Y29udGVudE1hcmtkb3duU3RyaW5nID0gcHJlZmFjZVRleHQ7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBzY29wZSBvZiBlbGVtZW50Lm92ZXJyaWRkZW5TY29wZUxpc3QpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHNjb3BlRGlzcGxheVRleHQgPSB0aGlzLmdldElubGluZVNjb3BlRGlzcGxheVRleHQoc2NvcGUpO1xuXHRcdFx0XHRcdFx0Y29udGVudE1hcmtkb3duU3RyaW5nICs9ICdcXG4tICcgKyBjcmVhdGVNYXJrZG93bkxpbmsoc2NvcGVEaXNwbGF5VGV4dCwgU2V0dGluZ1Njb3BlTGluay5jcmVhdGUoc2NvcGUpLnRvU3RyaW5nKCksIGdldEFjY2Vzc2libGVTY29wZURpc3BsYXlUZXh0KHNjb3BlLCB0aGlzLmxhbmd1YWdlU2VydmljZSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZWxlbWVudC5vdmVycmlkZGVuRGVmYXVsdHNMYW5ndWFnZUxpc3QubGVuZ3RoKSB7XG5cdFx0XHRcdFx0aWYgKGNvbnRlbnRNYXJrZG93blN0cmluZykge1xuXHRcdFx0XHRcdFx0Y29udGVudE1hcmtkb3duU3RyaW5nICs9IGBcXG5cXG5gO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBwcmVmYWNlVGV4dCA9IGxvY2FsaXplKCdoYXNEZWZhdWx0T3ZlcnJpZGVzRm9yTGFuZ3VhZ2VzJywgXCJUaGUgZm9sbG93aW5nIGxhbmd1YWdlcyBoYXZlIGRlZmF1bHQgb3ZlcnJpZGVzOlwiKTtcblx0XHRcdFx0XHRjb250ZW50TWFya2Rvd25TdHJpbmcgKz0gcHJlZmFjZVRleHQ7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBsYW5ndWFnZSBvZiBlbGVtZW50Lm92ZXJyaWRkZW5EZWZhdWx0c0xhbmd1YWdlTGlzdCkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2NvcGVEaXNwbGF5VGV4dCA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmdldExhbmd1YWdlTmFtZShsYW5ndWFnZSk7XG5cdFx0XHRcdFx0XHRjb250ZW50TWFya2Rvd25TdHJpbmcgKz0gJ1xcbi0gJyArIGNyZWF0ZU1hcmtkb3duTGluayhzY29wZURpc3BsYXlUZXh0ID8/IGxhbmd1YWdlLCBTZXR0aW5nU2NvcGVMaW5rLmNyZWF0ZShgZGVmYXVsdDoke2xhbmd1YWdlfWApLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjb250ZW50OiBJTWFya2Rvd25TdHJpbmcgPSB7XG5cdFx0XHRcdFx0dmFsdWU6IGNvbnRlbnRNYXJrZG93blN0cmluZyxcblx0XHRcdFx0XHRpc1RydXN0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdHN1cHBvcnRIdG1sOiBmYWxzZVxuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcih0aGlzLnNjb3BlT3ZlcnJpZGVzSW5kaWNhdG9yLmVsZW1lbnQsICgpID0+ICh7XG5cdFx0XHRcdFx0Li4udGhpcy5kZWZhdWx0SG92ZXJPcHRpb25zLFxuXHRcdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdFx0bGlua0hhbmRsZXI6ICh1cmw6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgW3Njb3BlLCBsYW5ndWFnZV0gPSBTZXR0aW5nU2NvcGVMaW5rLnBhcnNlKHVybCkuc3BsaXQoJzonKTtcblx0XHRcdFx0XHRcdG9uRGlkQ2xpY2tPdmVycmlkZUVsZW1lbnQuZmlyZSh7XG5cdFx0XHRcdFx0XHRcdHNldHRpbmdLZXk6IGVsZW1lbnQuc2V0dGluZy5rZXksXG5cdFx0XHRcdFx0XHRcdHNjb3BlOiBzY29wZSBhcyBTY29wZVN0cmluZyxcblx0XHRcdFx0XHRcdFx0bGFuZ3VhZ2Vcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSksIHsgc2V0dXBLZXlib2FyZEV2ZW50czogdHJ1ZSB9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMucmVuZGVyKCk7XG5cdH1cblxuXHR1cGRhdGVEZWZhdWx0T3ZlcnJpZGVJbmRpY2F0b3IoZWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQpIHtcblx0XHR0aGlzLmRlZmF1bHRPdmVycmlkZUluZGljYXRvci5lbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnbm9uZSc7XG5cdFx0bGV0IHNvdXJjZVRvRGlzcGxheSA9IGdldERlZmF1bHRWYWx1ZVNvdXJjZVRvRGlzcGxheShlbGVtZW50KTtcblx0XHRpZiAoc291cmNlVG9EaXNwbGF5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuZGVmYXVsdE92ZXJyaWRlSW5kaWNhdG9yLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUnO1xuXHRcdFx0dGhpcy5kZWZhdWx0T3ZlcnJpZGVJbmRpY2F0b3IuZGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdFx0Ly8gU2hvdyBzb3VyY2Ugb2YgZGVmYXVsdCB2YWx1ZSB3aGVuIGhvdmVyZWRcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHNvdXJjZVRvRGlzcGxheSkgJiYgc291cmNlVG9EaXNwbGF5Lmxlbmd0aCA9PT0gMSkge1xuXHRcdFx0XHRzb3VyY2VUb0Rpc3BsYXkgPSBzb3VyY2VUb0Rpc3BsYXlbMF07XG5cdFx0XHR9XG5cblx0XHRcdGxldCBkZWZhdWx0T3ZlcnJpZGVIb3ZlckNvbnRlbnQ7XG5cdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoc291cmNlVG9EaXNwbGF5KSkge1xuXHRcdFx0XHRkZWZhdWx0T3ZlcnJpZGVIb3ZlckNvbnRlbnQgPSBsb2NhbGl6ZSgnZGVmYXVsdE92ZXJyaWRkZW5EZXRhaWxzJywgXCJEZWZhdWx0IHNldHRpbmcgdmFsdWUgb3ZlcnJpZGRlbiBieSBgezB9YFwiLCBzb3VyY2VUb0Rpc3BsYXkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c291cmNlVG9EaXNwbGF5ID0gc291cmNlVG9EaXNwbGF5Lm1hcChzb3VyY2UgPT4gYFxcYCR7c291cmNlfVxcYGApO1xuXHRcdFx0XHRkZWZhdWx0T3ZlcnJpZGVIb3ZlckNvbnRlbnQgPSBsb2NhbGl6ZSgnbXVsdGlwbGVkZWZhdWx0T3ZlcnJpZGRlbkRldGFpbHMnLCBcIkEgZGVmYXVsdCB2YWx1ZXMgaGFzIGJlZW4gc2V0IGJ5IHswfVwiLCBzb3VyY2VUb0Rpc3BsYXkuc2xpY2UoMCwgLTEpLmpvaW4oJywgJykgKyAnICYgJyArIHNvdXJjZVRvRGlzcGxheS5zbGljZSgtMSkpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmRlZmF1bHRPdmVycmlkZUluZGljYXRvci5kaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIodGhpcy5kZWZhdWx0T3ZlcnJpZGVJbmRpY2F0b3IuZWxlbWVudCwgKCkgPT4gKHtcblx0XHRcdFx0Y29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kTWFya2Rvd24oZGVmYXVsdE92ZXJyaWRlSG92ZXJDb250ZW50KSxcblx0XHRcdFx0c3R5bGU6IEhvdmVyU3R5bGUuUG9pbnRlcixcblx0XHRcdFx0cG9zaXRpb246IHtcblx0XHRcdFx0XHRob3ZlclBvc2l0aW9uOiBIb3ZlclBvc2l0aW9uLkJFTE9XLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSksIHsgc2V0dXBLZXlib2FyZEV2ZW50czogdHJ1ZSB9KSk7XG5cdFx0fVxuXHRcdHRoaXMucmVuZGVyKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0RGVmYXVsdFZhbHVlU291cmNlVG9EaXNwbGF5KGVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHwgc3RyaW5nW10ge1xuXHRsZXQgc291cmNlVG9EaXNwbGF5OiBzdHJpbmcgfCB1bmRlZmluZWQgfCBzdHJpbmdbXTtcblx0Y29uc3QgZGVmYXVsdFZhbHVlU291cmNlID0gZWxlbWVudC5kZWZhdWx0VmFsdWVTb3VyY2U7XG5cdGlmIChkZWZhdWx0VmFsdWVTb3VyY2UpIHtcblx0XHRpZiAoZGVmYXVsdFZhbHVlU291cmNlIGluc3RhbmNlb2YgTWFwKSB7XG5cdFx0XHRzb3VyY2VUb0Rpc3BsYXkgPSBbXTtcblx0XHRcdGZvciAoY29uc3QgWywgdmFsdWVdIG9mIGRlZmF1bHRWYWx1ZVNvdXJjZSkge1xuXHRcdFx0XHRjb25zdCBuZXdWYWx1ZSA9IHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycgPyB2YWx1ZS5kaXNwbGF5TmFtZSA/PyB2YWx1ZS5pZCA6IHZhbHVlO1xuXHRcdFx0XHRpZiAoIXNvdXJjZVRvRGlzcGxheS5pbmNsdWRlcyhuZXdWYWx1ZSkpIHtcblx0XHRcdFx0XHRzb3VyY2VUb0Rpc3BsYXkucHVzaChuZXdWYWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHR5cGVvZiBkZWZhdWx0VmFsdWVTb3VyY2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRzb3VyY2VUb0Rpc3BsYXkgPSBkZWZhdWx0VmFsdWVTb3VyY2U7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHNvdXJjZVRvRGlzcGxheSA9IGRlZmF1bHRWYWx1ZVNvdXJjZS5kaXNwbGF5TmFtZSA/PyBkZWZhdWx0VmFsdWVTb3VyY2UuaWQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBzb3VyY2VUb0Rpc3BsYXk7XG59XG5cbmZ1bmN0aW9uIGdldEFjY2Vzc2libGVTY29wZURpc3BsYXlUZXh0KGNvbXBsZXRlU2NvcGU6IHN0cmluZywgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlKTogc3RyaW5nIHtcblx0Y29uc3QgW3Njb3BlLCBsYW5ndWFnZV0gPSBjb21wbGV0ZVNjb3BlLnNwbGl0KCc6Jyk7XG5cdGNvbnN0IGxvY2FsaXplZFNjb3BlID0gc2NvcGUgPT09ICd1c2VyJyA/XG5cdFx0bG9jYWxpemUoJ3VzZXInLCBcIlVzZXJcIikgOiBzY29wZSA9PT0gJ3dvcmtzcGFjZScgP1xuXHRcdFx0bG9jYWxpemUoJ3dvcmtzcGFjZScsIFwiV29ya3NwYWNlXCIpIDogbG9jYWxpemUoJ3JlbW90ZScsIFwiUmVtb3RlXCIpO1xuXHRpZiAobGFuZ3VhZ2UpIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ21vZGlmaWVkSW5TY29wZUZvckxhbmd1YWdlJywgXCJUaGUgezB9IHNjb3BlIGZvciB7MX1cIiwgbG9jYWxpemVkU2NvcGUsIGxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZU5hbWUobGFuZ3VhZ2UpKTtcblx0fVxuXHRyZXR1cm4gbG9jYWxpemVkU2NvcGU7XG59XG5cbmZ1bmN0aW9uIGdldEFjY2Vzc2libGVTY29wZURpc3BsYXlNaWRTZW50ZW5jZVRleHQoY29tcGxldGVTY29wZTogc3RyaW5nLCBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UpOiBzdHJpbmcge1xuXHRjb25zdCBbc2NvcGUsIGxhbmd1YWdlXSA9IGNvbXBsZXRlU2NvcGUuc3BsaXQoJzonKTtcblx0Y29uc3QgbG9jYWxpemVkU2NvcGUgPSBzY29wZSA9PT0gJ3VzZXInID9cblx0XHRsb2NhbGl6ZSgndXNlcicsIFwiVXNlclwiKSA6IHNjb3BlID09PSAnd29ya3NwYWNlJyA/XG5cdFx0XHRsb2NhbGl6ZSgnd29ya3NwYWNlJywgXCJXb3Jrc3BhY2VcIikgOiBsb2NhbGl6ZSgncmVtb3RlJywgXCJSZW1vdGVcIik7XG5cdGlmIChsYW5ndWFnZSkge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnbW9kaWZpZWRJblNjb3BlRm9yTGFuZ3VhZ2VNaWRTZW50ZW5jZScsIFwidGhlIHswfSBzY29wZSBmb3IgezF9XCIsIGxvY2FsaXplZFNjb3BlLnRvTG93ZXJDYXNlKCksIGxhbmd1YWdlU2VydmljZS5nZXRMYW5ndWFnZU5hbWUobGFuZ3VhZ2UpKTtcblx0fVxuXHRyZXR1cm4gbG9jYWxpemVkU2NvcGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRJbmRpY2F0b3JzTGFiZWxBcmlhTGFiZWwoZWxlbWVudDogU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UsIHVzZXJEYXRhUHJvZmlsZXNTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlc1NlcnZpY2UsIGxhbmd1YWdlU2VydmljZTogSUxhbmd1YWdlU2VydmljZSk6IHN0cmluZyB7XG5cdGNvbnN0IGFyaWFMYWJlbFNlY3Rpb25zOiBzdHJpbmdbXSA9IFtdO1xuXG5cdC8vIEFkZCBwcmV2aWV3IG9yIGV4cGVyaW1lbnRhbCBpbmRpY2F0b3IgdGV4dFxuXHRpZiAoZWxlbWVudC50YWdzPy5oYXMoJ3ByZXZpZXcnKSkge1xuXHRcdGFyaWFMYWJlbFNlY3Rpb25zLnB1c2gobG9jYWxpemUoJ3ByZXZpZXdMYWJlbCcsIFwiUHJldmlld1wiKSk7XG5cdH0gZWxzZSBpZiAoZWxlbWVudC50YWdzPy5oYXMoJ2V4cGVyaW1lbnRhbCcpKSB7XG5cdFx0YXJpYUxhYmVsU2VjdGlvbnMucHVzaChsb2NhbGl6ZSgnZXhwZXJpbWVudGFsTGFiZWwnLCBcIkV4cGVyaW1lbnRhbFwiKSk7XG5cdH1cblxuXHRpZiAoZWxlbWVudC50YWdzPy5oYXMoJ2FkdmFuY2VkJykpIHtcblx0XHRhcmlhTGFiZWxTZWN0aW9ucy5wdXNoKGxvY2FsaXplKCdhZHZhbmNlZExhYmVsJywgXCJBZHZhbmNlZFwiKSk7XG5cdH1cblxuXHQvLyBBZGQgd29ya3NwYWNlIHRydXN0IHRleHRcblx0aWYgKGVsZW1lbnQuaXNVbnRydXN0ZWQpIHtcblx0XHRhcmlhTGFiZWxTZWN0aW9ucy5wdXNoKGxvY2FsaXplKCd3b3Jrc3BhY2VVbnRydXN0ZWRBcmlhTGFiZWwnLCBcIldvcmtzcGFjZSB1bnRydXN0ZWQ7IHNldHRpbmcgdmFsdWUgbm90IGFwcGxpZWRcIikpO1xuXHR9XG5cblx0aWYgKGVsZW1lbnQuaGFzUG9saWN5VmFsdWUpIHtcblx0XHRhcmlhTGFiZWxTZWN0aW9ucy5wdXNoKGxvY2FsaXplKCdwb2xpY3lEZXNjcmlwdGlvbkFjY2Vzc2libGUnLCBcIk1hbmFnZWQgYnkgb3JnYW5pemF0aW9uIHBvbGljeTsgc2V0dGluZyB2YWx1ZSBub3QgYXBwbGllZFwiKSk7XG5cdH0gZWxzZSBpZiAoZWxlbWVudC5pc0FnZW50c1dpbmRvd1JlYWRPbmx5KSB7XG5cdFx0YXJpYUxhYmVsU2VjdGlvbnMucHVzaChsb2NhbGl6ZSgnYWdlbnRzV2luZG93UmVhZE9ubHlBY2Nlc3NpYmxlJywgXCJDYW5ub3QgYmUgY2hhbmdlZCBpbiBBZ2VudHMgd2luZG93XCIpKTtcblx0fSBlbHNlIGlmIChlbGVtZW50LnNldHRpbmdzVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwgJiYgY29uZmlndXJhdGlvblNlcnZpY2UuaXNTZXR0aW5nQXBwbGllZEZvckFsbFByb2ZpbGVzKGVsZW1lbnQuc2V0dGluZy5rZXkpKSB7XG5cdFx0YXJpYUxhYmVsU2VjdGlvbnMucHVzaChsb2NhbGl6ZSgnYXBwbGljYXRpb25TZXR0aW5nRGVzY3JpcHRpb25BY2Nlc3NpYmxlJywgXCJTZXR0aW5nIHZhbHVlIHJldGFpbmVkIHdoZW4gc3dpdGNoaW5nIHByb2ZpbGVzXCIpKTtcblx0fSBlbHNlIHtcblx0XHQvLyBBZGQgb3RoZXIgb3ZlcnJpZGVzIHRleHRcblx0XHRjb25zdCBvdGhlck92ZXJyaWRlc1N0YXJ0ID0gZWxlbWVudC5pc0NvbmZpZ3VyZWQgP1xuXHRcdFx0bG9jYWxpemUoJ2Fsc29Db25maWd1cmVkSW4nLCBcIkFsc28gbW9kaWZpZWQgaW5cIikgOlxuXHRcdFx0bG9jYWxpemUoJ2NvbmZpZ3VyZWRJbicsIFwiTW9kaWZpZWQgaW5cIik7XG5cdFx0Y29uc3Qgb3RoZXJPdmVycmlkZXNMaXN0ID0gZWxlbWVudC5vdmVycmlkZGVuU2NvcGVMaXN0XG5cdFx0XHQubWFwKHNjb3BlID0+IGdldEFjY2Vzc2libGVTY29wZURpc3BsYXlNaWRTZW50ZW5jZVRleHQoc2NvcGUsIGxhbmd1YWdlU2VydmljZSkpLmpvaW4oJywgJyk7XG5cdFx0aWYgKGVsZW1lbnQub3ZlcnJpZGRlblNjb3BlTGlzdC5sZW5ndGgpIHtcblx0XHRcdGFyaWFMYWJlbFNlY3Rpb25zLnB1c2goYCR7b3RoZXJPdmVycmlkZXNTdGFydH0gJHtvdGhlck92ZXJyaWRlc0xpc3R9YCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gQWRkIHN5bmMgaWdub3JlZCB0ZXh0XG5cdGlmIChjYWNoZWRTeW5jSWdub3JlZFNldHRpbmdzU2V0LmhhcyhlbGVtZW50LnNldHRpbmcua2V5KSkge1xuXHRcdGFyaWFMYWJlbFNlY3Rpb25zLnB1c2gobG9jYWxpemUoJ3N5bmNJZ25vcmVkQXJpYUxhYmVsJywgXCJTZXR0aW5nIGlnbm9yZWQgZHVyaW5nIHN5bmNcIikpO1xuXHR9XG5cblx0Ly8gQWRkIGRlZmF1bHQgb3ZlcnJpZGUgaW5kaWNhdG9yIHRleHRcblx0bGV0IHNvdXJjZVRvRGlzcGxheSA9IGdldERlZmF1bHRWYWx1ZVNvdXJjZVRvRGlzcGxheShlbGVtZW50KTtcblx0aWYgKHNvdXJjZVRvRGlzcGxheSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoc291cmNlVG9EaXNwbGF5KSAmJiBzb3VyY2VUb0Rpc3BsYXkubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRzb3VyY2VUb0Rpc3BsYXkgPSBzb3VyY2VUb0Rpc3BsYXlbMF07XG5cdFx0fVxuXG5cdFx0bGV0IG92ZXJyaWRkZW5EZXRhaWxzVGV4dDtcblx0XHRpZiAoIUFycmF5LmlzQXJyYXkoc291cmNlVG9EaXNwbGF5KSkge1xuXHRcdFx0b3ZlcnJpZGRlbkRldGFpbHNUZXh0ID0gbG9jYWxpemUoJ2RlZmF1bHRPdmVycmlkZGVuRGV0YWlsc0FyaWFMYWJlbCcsIFwiezB9IG92ZXJyaWRlcyB0aGUgZGVmYXVsdCB2YWx1ZVwiLCBzb3VyY2VUb0Rpc3BsYXkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRvdmVycmlkZGVuRGV0YWlsc1RleHQgPSBsb2NhbGl6ZSgnbXVsdGlwbGVEZWZhdWx0T3ZlcnJpZGRlbkRldGFpbHNBcmlhTGFiZWwnLCBcInswfSBvdmVycmlkZSB0aGUgZGVmYXVsdCB2YWx1ZVwiLCBzb3VyY2VUb0Rpc3BsYXkuc2xpY2UoMCwgLTEpLmpvaW4oJywgJykgKyAnICYgJyArIHNvdXJjZVRvRGlzcGxheS5zbGljZSgtMSkpO1xuXHRcdH1cblx0XHRhcmlhTGFiZWxTZWN0aW9ucy5wdXNoKG92ZXJyaWRkZW5EZXRhaWxzVGV4dCk7XG5cdH1cblxuXHQvLyBBZGQgdGV4dCBhYm91dCBkZWZhdWx0IHZhbHVlcyBiZWluZyBvdmVycmlkZGVuIGluIG90aGVyIGxhbmd1YWdlc1xuXHRjb25zdCBvdGhlckxhbmd1YWdlT3ZlcnJpZGVzTGlzdCA9IGVsZW1lbnQub3ZlcnJpZGRlbkRlZmF1bHRzTGFuZ3VhZ2VMaXN0XG5cdFx0Lm1hcChsYW5ndWFnZSA9PiBsYW5ndWFnZVNlcnZpY2UuZ2V0TGFuZ3VhZ2VOYW1lKGxhbmd1YWdlKSkuam9pbignLCAnKTtcblx0aWYgKGVsZW1lbnQub3ZlcnJpZGRlbkRlZmF1bHRzTGFuZ3VhZ2VMaXN0Lmxlbmd0aCkge1xuXHRcdGNvbnN0IG90aGVyTGFuZ3VhZ2VPdmVycmlkZXNUZXh0ID0gbG9jYWxpemUoJ2RlZmF1bHRPdmVycmlkZGVuTGFuZ3VhZ2VzTGlzdCcsIFwiTGFuZ3VhZ2Utc3BlY2lmaWMgZGVmYXVsdCB2YWx1ZXMgZXhpc3QgZm9yIHswfVwiLCBvdGhlckxhbmd1YWdlT3ZlcnJpZGVzTGlzdCk7XG5cdFx0YXJpYUxhYmVsU2VjdGlvbnMucHVzaChvdGhlckxhbmd1YWdlT3ZlcnJpZGVzVGV4dCk7XG5cdH1cblxuXHRjb25zdCBhcmlhTGFiZWwgPSBhcmlhTGFiZWxTZWN0aW9ucy5qb2luKCcuICcpO1xuXHRyZXR1cm4gYXJpYUxhYmVsO1xufVxuXG4vKipcbiAqIEludGVybmFsIGxpbmtzIHVzZWQgdG8gb3BlbiBhIHNwZWNpZmljIHNjb3BlIGluIHRoZSBzZXR0aW5ncyBlZGl0b3JcbiAqL1xubmFtZXNwYWNlIFNldHRpbmdTY29wZUxpbmsge1xuXHRleHBvcnQgZnVuY3Rpb24gY3JlYXRlKHNjb3BlOiBzdHJpbmcpOiBVUkkge1xuXHRcdHJldHVybiBVUkkuZnJvbSh7XG5cdFx0XHRzY2hlbWU6IFNjaGVtYXMuaW50ZXJuYWwsXG5cdFx0XHRwYXRoOiAnLycsXG5cdFx0XHRxdWVyeTogZW5jb2RlVVJJQ29tcG9uZW50KHNjb3BlKVxuXHRcdH0pO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHBhcnNlKGxpbms6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKGxpbmspO1xuXHRcdHJldHVybiBkZWNvZGVVUklDb21wb25lbnQodXJpLnF1ZXJ5KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQkFBc0M7QUFDL0MsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyx1QkFBdUI7QUFFaEMsU0FBMEIsZ0JBQWdCLDBCQUEwQjtBQUNwRSxTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBb0M7QUFDN0MsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHFCQUFxQjtBQUU5QixTQUFTLHNDQUFzQztBQUMvQyxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLGdDQUFnQyxvQ0FBb0Msb0JBQW9CLHFDQUFxQztBQUd0SSxNQUFNLElBQUksSUFBSTtBQTBCZCxJQUFJLCtCQUE0QyxvQkFBSSxJQUFZO0FBTWhFLElBQUksNEJBQXNDLENBQUM7QUFLcEMsSUFBTSw4QkFBTixNQUF5RDtBQUFBLEVBa0IvRCxZQUNDLFdBQ2lELHNCQUNqQixjQUNpQiwrQkFDZCxpQkFDRCxnQkFBaUM7QUFKbEI7QUFDakI7QUFDaUI7QUFDZDtBQUNEO0FBYm5DO0FBQUEsU0FBaUIscUJBQXlDLENBQUM7QUFJM0QsU0FBaUIsc0JBQXVDLElBQUksZ0JBQWdCO0FBQzVFLFNBQVEsZUFBZTtBQXVCdkIsU0FBUSxzQkFBOEM7QUFBQSxNQUNyRCxXQUFXO0FBQUEsTUFDWCxPQUFPLFdBQVc7QUFBQSxNQUNsQixVQUFVO0FBQUEsUUFDVCxlQUFlLGNBQWM7QUFBQSxNQUM5QjtB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SUFBSTtBQUMxRixRQUFJLFFBQVEsb0JBQW9CLFFBQVE7QUFDdkMsd0JBQWtCLEtBQUssR0FBRyxtQkFBbUIsSUFBSSxrQkFBa0IsRUFBRTtBQUFBLElBQ3RFO0FBQUEsRUFDRDtBQUdBLE1BQUksNkJBQTZCLElBQUksUUFBUSxRQUFRLEdBQUcsR0FBRztBQUMxRCxzQkFBa0IsS0FBSyxTQUFTLHdCQUF3Qiw2QkFBNkIsQ0FBQztBQUFBLEVBQ3ZGO0FBR0EsTUFBSSxrQkFBa0IsK0JBQStCLE9BQU87QUFDNUQsTUFBSSxvQkFBb0IsUUFBVztBQUNsQyxRQUFJLE1BQU0sUUFBUSxlQUFlLEtBQUssZ0JBQWdCLFdBQVcsR0FBRztBQUNuRSx3QkFBa0IsZ0JBQWdCLENBQUM7QUFBQSxJQUNwQztBQUVBLFFBQUk7QUFDSixRQUFJLENBQUMsTUFBTSxRQUFRLGVBQWUsR0FBRztBQUNwQyw4QkFBd0IsU0FBUyxxQ0FBcUMsbUNBQW1DLGVBQWU7QUFBQSxJQUN6SCxPQUFPO0FBQ04sOEJBQXdCLFNBQVMsNkNBQTZDLGtDQUFrQyxnQkFBZ0IsTUFBTSxHQUFHLEVBQUUsRUFBRSxLQUFLLElBQUksSUFBSSxRQUFRLGdCQUFnQixNQUFNLEVBQUUsQ0FBQztBQUFBLElBQzVMO0FBQ0Esc0JBQWtCLEtBQUsscUJBQXFCO0FBQUEsRUFDN0M7QUFHQSxRQUFNLDZCQUE2QixRQUFRLCtCQUN6QyxJQUFJLGNBQVksZ0JBQWdCLGdCQUFnQixRQUFRLENBQUMsRUFBRSxLQUFLLElBQUk7QUFDdEUsTUFBSSxRQUFRLCtCQUErQixRQUFRO0FBQ2xELFVBQU0sNkJBQTZCLFNBQVMsa0NBQWtDLGtEQUFrRCwwQkFBMEI7QUFDMUosc0JBQWtCLEtBQUssMEJBQTBCO0FBQUEsRUFDbEQ7QUFFQSxRQUFNLFlBQVksa0JBQWtCLEtBQUssSUFBSTtBQUM3QyxTQUFPO0FBQ1I7QUFLQSxJQUFVO0FBQUEsQ0FBVixDQUFVQSxzQkFBVjtBQUNRLFdBQVMsT0FBTyxPQUFvQjtBQUMxQyxXQUFPLElBQUksS0FBSztBQUFBLE1BQ2YsUUFBUSxRQUFRO0FBQUEsTUFDaEIsTUFBTTtBQUFBLE1BQ04sT0FBTyxtQkFBbUIsS0FBSztBQUFBLElBQ2hDLENBQUM7QUFBQSxFQUNGO0FBTk8sRUFBQUEsa0JBQVM7QUFRVCxXQUFTLE1BQU0sTUFBc0I7QUFDM0MsVUFBTSxNQUFNLElBQUksTUFBTSxJQUFJO0FBQzFCLFdBQU8sbUJBQW1CLElBQUksS0FBSztBQUFBLEVBQ3BDO0FBSE8sRUFBQUEsa0JBQVM7QUFBQSxHQVRQOyIsCiAgIm5hbWVzIjogWyJTZXR0aW5nU2NvcGVMaW5rIl0KfQo=
