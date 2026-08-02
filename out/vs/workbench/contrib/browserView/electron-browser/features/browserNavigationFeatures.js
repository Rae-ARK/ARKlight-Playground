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
import { localize, localize2 } from "../../../../../nls.js";
import { $ } from "../../../../../base/browser/dom.js";
import { disposableTimeout } from "../../../../../base/common/async.js";
import { Disposable, MutableDisposable } from "../../../../../base/common/lifecycle.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { KeyMod, KeyCode } from "../../../../../base/common/keyCodes.js";
import { Action2, MenuId, registerAction2 } from "../../../../../platform/actions/common/actions.js";
import { MenuWorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { HoverPosition } from "../../../../../base/browser/ui/hover/hoverWidget.js";
import { WorkbenchHoverDelegate } from "../../../../../platform/hover/browser/hover.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { KeybindingWeight } from "../../../../../platform/keybinding/common/keybindingsRegistry.js";
import { BrowserViewCommandId } from "../../../../../platform/browserView/common/browserView.js";
import { IOpenerService } from "../../../../../platform/opener/common/opener.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IPreferencesService } from "../../../../services/preferences/common/preferences.js";
import { BrowserEditorInput } from "../../common/browserEditorInput.js";
import {
  BROWSER_SEARCH_NONE,
  BrowserSearchEngineSettingId,
  buildSearchUrl,
  getBrowserSearchEngineLabel,
  resolveAddressBarInputType
} from "../../common/browserSearch.js";
import {
  BROWSER_EDITOR_ACTIVE,
  BrowserActionCategory,
  BrowserActionGroup,
  BrowserEditor,
  BrowserEditorContribution,
  BrowserWidgetLocation,
  CONTEXT_BROWSER_FOCUSED,
  CONTEXT_BROWSER_HAS_URL
} from "../browserEditor.js";
import { BrowserUrlBarWidget } from "../widgets/browserUrlBarWidget.js";
const CONTEXT_BROWSER_CAN_GO_BACK = new RawContextKey("browserCanGoBack", false, localize("browser.canGoBack", "Whether the browser can go back"));
const CONTEXT_BROWSER_CAN_GO_FORWARD = new RawContextKey("browserCanGoForward", false, localize("browser.canGoForward", "Whether the browser can go forward"));
class BrowserNavigationBar extends Disposable {
  constructor(editor, instantiationService, scopedContextKeyService, _configurationService, _preferencesService) {
    super();
    this._configurationService = _configurationService;
    this._preferencesService = _preferencesService;
    this.element = $(".browser-navbar");
    const hoverDelegate = this._register(
      instantiationService.createInstance(
        WorkbenchHoverDelegate,
        "element",
        void 0,
        { position: { hoverPosition: HoverPosition.ABOVE } }
      )
    );
    const scopedInstantiationService = instantiationService.createChild(new ServiceCollection(
      [IContextKeyService, scopedContextKeyService]
    ));
    const navContainer = $(".browser-nav-toolbar");
    const navToolbar = this._register(scopedInstantiationService.createInstance(
      MenuWorkbenchToolBar,
      navContainer,
      MenuId.BrowserNavigationToolbar,
      {
        hoverDelegate,
        highlightToggledItems: true,
        // Render all actions inline regardless of group.
        toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
        menuOptions: { shouldForwardArgs: true }
      }
    ));
    navToolbar.context = editor;
    const urlBarHost = {
      get input() {
        return editor.input instanceof BrowserEditorInput ? editor.input : void 0;
      },
      ensureBrowserFocus: () => editor.ensureBrowserFocus(),
      getPrimaryActions: (text) => this._resolvePrimaryActions(text),
      getPlaceholder: () => this._searchEngine ? localize({ key: "browser.urlOrSearchPlaceholder", comment: ["Placeholder text shown in the integrated browser's address (URL) bar when it is empty. The user can either type a search query to search the web, or type a URL to navigate to it."] }, "Search or enter URL") : localize("browser.urlPlaceholder", "Enter a URL")
    };
    this._urlBar = this._register(instantiationService.createInstance(BrowserUrlBarWidget, urlBarHost));
    const actionsContainer = $(".browser-actions-toolbar");
    const actionsToolbar = this._register(scopedInstantiationService.createInstance(
      MenuWorkbenchToolBar,
      actionsContainer,
      MenuId.BrowserActionsToolbar,
      {
        hoverDelegate,
        highlightToggledItems: true,
        toolbarOptions: { primaryGroup: () => true, useSeparatorsInPrimaryActions: true },
        menuOptions: { shouldForwardArgs: true },
        responsiveBehavior: {
          enabled: true,
          kind: "last",
          minItems: 0,
          // The URL bar is the flexible element, so the actions toolbar's own
          // element width does not reflect the room it could occupy.
          // So we pass manual calculations based on the navbar's overall width and the URL bar's width.
          observedElement: this.element,
          getAvailableWidth: () => {
            const toolbarBounds = this.element.getBoundingClientRect();
            const urlBarBounds = this._urlBar.element.getBoundingClientRect();
            return Math.max(
              0,
              toolbarBounds.right - urlBarBounds.left - 240
              /* approximate: preferred width of the URL input plus padding */
            );
          }
        }
      }
    ));
    actionsToolbar.context = editor;
    this.element.appendChild(navContainer);
    this.element.appendChild(this._urlBar.element);
    this.element.appendChild(actionsContainer);
  }
  refreshUrl() {
    this._urlBar.refreshUrl();
  }
  previewUrl(url) {
    this._urlBar.previewUrl(url);
  }
  focusUrlInput() {
    this._urlBar.focusUrlInput();
  }
  openUrlPicker() {
    this._urlBar.openUrlPicker();
  }
  clear() {
    this._urlBar.clear();
  }
  mountContributions(contributions) {
    this._urlBar.mountContributions(contributions);
  }
  /**
   * The configured address bar search engine, or `undefined` when search
   * routing is disabled (the setting is `'none'`).
   */
  get _searchEngine() {
    const value = this._configurationService.getValue(BrowserSearchEngineSettingId);
    return value && value !== BROWSER_SEARCH_NONE ? value : void 0;
  }
  /**
   * The URL bar's primary picker item(s) for the given text, mirroring
   * Chrome/Edge. With search enabled: a URL reads "{url}" (globe icon) first
   * with a search fallback after, a clear query reads "{query} - {engine}
   * Search" (search icon), and an ambiguous input offers both — Search first,
   * then Go to — so the user can pick. The destination URL is resolved here
   * (search text → search-engine URL) so {@link BrowserEditorInput.navigate}
   * receives a plain URL; the telemetry source is passed through so a
   * search-initiated navigation is tracked as such.
   */
  _resolvePrimaryActions(text) {
    const goTo = {
      id: text,
      label: text,
      iconClass: ThemeIcon.asClassName(Codicon.globe),
      apply: (input) => input.navigate(text)
    };
    const engineId = this._searchEngine;
    if (!engineId) {
      return [goTo];
    }
    const configureEngineButton = {
      id: "browser.configureSearchEngine",
      iconClass: ThemeIcon.asClassName(Codicon.settingsGear),
      tooltip: localize("browser.configureSearchEngine", "Configure Search Engine"),
      run: () => void this._preferencesService.openSettings({ query: `@id:${BrowserSearchEngineSettingId}` })
    };
    const search = {
      id: text,
      label: localize("browser.searchFor", "{0} - {1} Search", text, getBrowserSearchEngineLabel(engineId)),
      iconClass: ThemeIcon.asClassName(Codicon.search),
      buttons: [configureEngineButton],
      apply: (input) => input.navigate(buildSearchUrl(text, engineId), { source: "searchInput" })
    };
    switch (resolveAddressBarInputType(text)) {
      case "url":
        return [goTo, search];
      case "query":
        return [search];
      default:
        return [search, goTo];
    }
  }
}
let BrowserNavigationFeatures = class extends BrowserEditorContribution {
  constructor(editor, instantiationService, contextKeyService, configurationService, preferencesService) {
    super(editor);
    this._pendingTryFocus = this._register(new MutableDisposable());
    /**
     * Whether a navigation has been initiated on the current tab. Once true,
     * an empty URL means "navigation in flight" rather than "fresh tab", so
     * {@link tryFocus} keeps focus on the page instead of reopening the picker.
     */
    this._hasInitiatedNavigation = false;
    this._navbar = this._register(new BrowserNavigationBar(editor, instantiationService, contextKeyService, configurationService, preferencesService));
    this._canGoBackContext = CONTEXT_BROWSER_CAN_GO_BACK.bindTo(contextKeyService);
    this._canGoForwardContext = CONTEXT_BROWSER_CAN_GO_FORWARD.bindTo(contextKeyService);
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(BrowserSearchEngineSettingId)) {
        this._navbar.refreshUrl();
      }
    }));
  }
  get widgets() {
    return [{ location: BrowserWidgetLocation.Toolbar, element: this._navbar.element, order: 0 }];
  }
  onContainerCreated() {
    const contributions = [];
    for (const contribution of this.editor.getContributions()) {
      if (contribution !== this) {
        contributions.push(contribution);
      }
    }
    this._navbar.mountContributions(contributions);
  }
  prerenderInput(_input) {
    this._navbar.refreshUrl();
    this._canGoBackContext.set(false);
    this._canGoForwardContext.set(false);
  }
  onModelAttached(model, store) {
    this._hasInitiatedNavigation = model.loading;
    this._updateFromModel(model);
    store.add(model.onDidNavigate(() => this._updateFromModel(model)));
    store.add(model.onWillNavigate((url) => {
      this._hasInitiatedNavigation = true;
      this._navbar.previewUrl(url);
    }));
  }
  onModelDetached() {
    this._hasInitiatedNavigation = false;
    this._navbar.clear();
    this._canGoBackContext.reset();
    this._canGoForwardContext.reset();
  }
  tryFocus() {
    const input = this.editor.input;
    this._pendingTryFocus.value = disposableTimeout(() => {
      if (this.editor.input !== input) {
        return;
      }
      const url = this.editor.model?.url ?? (input instanceof BrowserEditorInput ? input.url : void 0);
      if (!url && !this._hasInitiatedNavigation) {
        this._navbar.openUrlPicker();
      } else {
        this.editor.ensureBrowserFocus();
      }
    }, 0);
    return true;
  }
  _updateFromModel(model) {
    this._navbar.refreshUrl();
    this._canGoBackContext.set(model.canGoBack);
    this._canGoForwardContext.set(model.canGoForward);
  }
  focusUrlInput() {
    this._navbar.focusUrlInput();
  }
  openUrlPicker() {
    this._navbar.openUrlPicker();
  }
};
BrowserNavigationFeatures = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IContextKeyService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IPreferencesService)
], BrowserNavigationFeatures);
BrowserEditor.registerContribution(BrowserNavigationFeatures);
const _GoBackAction = class _GoBackAction extends Action2 {
  constructor() {
    super({
      id: _GoBackAction.ID,
      title: localize2("browser.goBackAction", "Go Back"),
      category: BrowserActionCategory,
      icon: Codicon.arrowLeft,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_CAN_GO_BACK),
      menu: {
        id: MenuId.BrowserNavigationToolbar,
        group: "navigation",
        order: 1
      },
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib + 50,
        primary: KeyMod.Alt | KeyCode.LeftArrow,
        secondary: [KeyCode.BrowserBack],
        mac: { primary: KeyMod.CtrlCmd | KeyCode.BracketLeft, secondary: [KeyCode.BrowserBack, KeyMod.CtrlCmd | KeyCode.LeftArrow] }
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      await browserEditor.model?.goBack();
    }
  }
};
_GoBackAction.ID = BrowserViewCommandId.GoBack;
let GoBackAction = _GoBackAction;
const _GoForwardAction = class _GoForwardAction extends Action2 {
  constructor() {
    super({
      id: _GoForwardAction.ID,
      title: localize2("browser.goForwardAction", "Go Forward"),
      category: BrowserActionCategory,
      icon: Codicon.arrowRight,
      f1: true,
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_CAN_GO_FORWARD),
      menu: {
        id: MenuId.BrowserNavigationToolbar,
        group: "navigation",
        order: 2
      },
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib + 50,
        primary: KeyMod.Alt | KeyCode.RightArrow,
        secondary: [KeyCode.BrowserForward],
        mac: { primary: KeyMod.CtrlCmd | KeyCode.BracketRight, secondary: [KeyCode.BrowserForward, KeyMod.CtrlCmd | KeyCode.RightArrow] }
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      await browserEditor.model?.goForward();
    }
  }
};
_GoForwardAction.ID = BrowserViewCommandId.GoForward;
let GoForwardAction = _GoForwardAction;
const _ReloadAction = class _ReloadAction extends Action2 {
  constructor() {
    super({
      id: _ReloadAction.ID,
      title: localize2("browser.reloadAction", "Reload"),
      category: BrowserActionCategory,
      icon: Codicon.refresh,
      f1: true,
      precondition: BROWSER_EDITOR_ACTIVE,
      menu: {
        id: MenuId.BrowserNavigationToolbar,
        group: "navigation",
        order: 3,
        alt: {
          id: HardReloadAction.ID,
          title: localize2("browser.hardReloadAction", "Hard Reload"),
          icon: Codicon.refresh
        }
      },
      keybinding: {
        when: CONTEXT_BROWSER_FOCUSED,
        weight: KeybindingWeight.WorkbenchContrib + 75,
        primary: KeyMod.CtrlCmd | KeyCode.KeyR,
        secondary: [KeyCode.F5],
        mac: { primary: KeyMod.CtrlCmd | KeyCode.KeyR, secondary: [] }
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      await browserEditor.model?.reload();
    }
  }
};
_ReloadAction.ID = BrowserViewCommandId.Reload;
let ReloadAction = _ReloadAction;
const _HardReloadAction = class _HardReloadAction extends Action2 {
  constructor() {
    super({
      id: _HardReloadAction.ID,
      title: localize2("browser.hardReloadAction", "Hard Reload"),
      category: BrowserActionCategory,
      icon: Codicon.refresh,
      f1: true,
      precondition: BROWSER_EDITOR_ACTIVE,
      keybinding: {
        when: CONTEXT_BROWSER_FOCUSED,
        weight: KeybindingWeight.WorkbenchContrib + 75,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR,
        secondary: [KeyMod.CtrlCmd | KeyCode.F5],
        mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyR, secondary: [] }
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      await browserEditor.model?.reload(true);
    }
  }
};
_HardReloadAction.ID = BrowserViewCommandId.HardReload;
let HardReloadAction = _HardReloadAction;
const _FocusUrlInputAction = class _FocusUrlInputAction extends Action2 {
  constructor() {
    super({
      id: _FocusUrlInputAction.ID,
      title: localize2("browser.focusUrlInputAction", "Focus URL Input"),
      category: BrowserActionCategory,
      f1: true,
      precondition: BROWSER_EDITOR_ACTIVE,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyCode.KeyL
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      browserEditor.getContribution(BrowserNavigationFeatures)?.openUrlPicker();
    }
  }
};
_FocusUrlInputAction.ID = BrowserViewCommandId.FocusUrlInput;
let FocusUrlInputAction = _FocusUrlInputAction;
const _OpenInExternalBrowserAction = class _OpenInExternalBrowserAction extends Action2 {
  constructor() {
    super({
      id: _OpenInExternalBrowserAction.ID,
      title: localize2("browser.openExternalAction", "Open in External Browser"),
      category: BrowserActionCategory,
      icon: Codicon.linkExternal,
      f1: true,
      // Note: We do allow opening in an external browser even if there is an error page shown
      precondition: ContextKeyExpr.and(BROWSER_EDITOR_ACTIVE, CONTEXT_BROWSER_HAS_URL),
      menu: {
        id: MenuId.BrowserActionsToolbar,
        group: BrowserActionGroup.Tools,
        order: 10,
        isHiddenByDefault: true
      }
    });
  }
  async run(accessor, browserEditor = accessor.get(IEditorService).activeEditorPane) {
    if (browserEditor instanceof BrowserEditor) {
      const url = browserEditor.model?.url;
      if (url) {
        const openerService = accessor.get(IOpenerService);
        await openerService.open(url, {
          // ensures that VS Code itself doesn't try to open the URL, even for non-"http(s):" scheme URLs.
          openExternal: true,
          // ensures that the link isn't opened in Integrated Browser or other contributed external openers. False is the default, but just being explicit here.
          allowContributedOpeners: false
        });
      }
    }
  }
};
_OpenInExternalBrowserAction.ID = BrowserViewCommandId.OpenExternal;
let OpenInExternalBrowserAction = _OpenInExternalBrowserAction;
const _OpenBrowserSettingsAction = class _OpenBrowserSettingsAction extends Action2 {
  constructor() {
    super({
      id: _OpenBrowserSettingsAction.ID,
      title: localize2("browser.openSettingsAction", "Browser Settings"),
      category: BrowserActionCategory,
      icon: Codicon.settingsGear,
      f1: false,
      menu: {
        id: MenuId.BrowserActionsToolbar,
        group: BrowserActionGroup.Settings,
        order: 2,
        isHiddenByDefault: true
      }
    });
  }
  async run(accessor) {
    const preferencesService = accessor.get(IPreferencesService);
    await preferencesService.openSettings({ query: `@id:workbench.browser.*` });
  }
};
_OpenBrowserSettingsAction.ID = BrowserViewCommandId.OpenSettings;
let OpenBrowserSettingsAction = _OpenBrowserSettingsAction;
registerAction2(GoBackAction);
registerAction2(GoForwardAction);
registerAction2(ReloadAction);
registerAction2(HardReloadAction);
registerAction2(FocusUrlInputAction);
registerAction2(OpenInExternalBrowserAction);
registerAction2(OpenBrowserSettingsAction);
export {
  BrowserNavigationFeatures
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2Jyb3dzZXJWaWV3L2VsZWN0cm9uLWJyb3dzZXIvZmVhdHVyZXMvYnJvd3Nlck5hdmlnYXRpb25GZWF0dXJlcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgJCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgS2V5TW9kLCBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uMiwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ1dlaWdodCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdzUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQnJvd3NlclZpZXdDb21tYW5kSWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUHJlZmVyZW5jZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElCcm93c2VyVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2Jyb3dzZXJWaWV3LmpzJztcbmltcG9ydCB7IEJyb3dzZXJFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uL2NvbW1vbi9icm93c2VyRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHtcblx0QlJPV1NFUl9TRUFSQ0hfTk9ORSxcblx0QnJvd3NlclNlYXJjaEVuZ2luZUlkLFxuXHRCcm93c2VyU2VhcmNoRW5naW5lU2V0dGluZ0lkLFxuXHRidWlsZFNlYXJjaFVybCxcblx0Z2V0QnJvd3NlclNlYXJjaEVuZ2luZUxhYmVsLFxuXHRyZXNvbHZlQWRkcmVzc0JhcklucHV0VHlwZSxcbn0gZnJvbSAnLi4vLi4vY29tbW9uL2Jyb3dzZXJTZWFyY2guanMnO1xuaW1wb3J0IHtcblx0QlJPV1NFUl9FRElUT1JfQUNUSVZFLFxuXHRCcm93c2VyQWN0aW9uQ2F0ZWdvcnksXG5cdEJyb3dzZXJBY3Rpb25Hcm91cCxcblx0QnJvd3NlckVkaXRvcixcblx0QnJvd3NlckVkaXRvckNvbnRyaWJ1dGlvbixcblx0QnJvd3NlcldpZGdldExvY2F0aW9uLFxuXHRDT05URVhUX0JST1dTRVJfRk9DVVNFRCxcblx0Q09OVEVYVF9CUk9XU0VSX0hBU19VUkwsXG5cdElCcm93c2VyRWRpdG9yV2lkZ2V0LFxuXHRJQnJvd3NlclVybFN1Z2dlc3Rpb25BY3Rpb24sXG59IGZyb20gJy4uL2Jyb3dzZXJFZGl0b3IuanMnO1xuaW1wb3J0IHsgQnJvd3NlclVybEJhcldpZGdldCwgSUJyb3dzZXJVcmxCYXJIb3N0LCBJVXJsUGlja2VySXRlbSB9IGZyb20gJy4uL3dpZGdldHMvYnJvd3NlclVybEJhcldpZGdldC5qcyc7XG5cbmNvbnN0IENPTlRFWFRfQlJPV1NFUl9DQU5fR09fQkFDSyA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdicm93c2VyQ2FuR29CYWNrJywgZmFsc2UsIGxvY2FsaXplKCdicm93c2VyLmNhbkdvQmFjaycsIFwiV2hldGhlciB0aGUgYnJvd3NlciBjYW4gZ28gYmFja1wiKSk7XG5jb25zdCBDT05URVhUX0JST1dTRVJfQ0FOX0dPX0ZPUldBUkQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignYnJvd3NlckNhbkdvRm9yd2FyZCcsIGZhbHNlLCBsb2NhbGl6ZSgnYnJvd3Nlci5jYW5Hb0ZvcndhcmQnLCBcIldoZXRoZXIgdGhlIGJyb3dzZXIgY2FuIGdvIGZvcndhcmRcIikpO1xuXG4vKipcbiAqIEJyb3dzZXIgbmF2aWdhdGlvbiBiYXIgd2lkZ2V0OiBuYXYgdG9vbGJhciAoYmFjay9mb3J3YXJkL2V0YyksIFVSTCBiYXJcbiAqIChkaXNwbGF5ICsgZWRpdGluZyBwaWNrZXIsIHNlZSB7QGxpbmsgQnJvd3NlclVybEJhcldpZGdldH0pLCBhY3Rpb25zIHRvb2xiYXIuXG4gKiBPd25lZCBieSB7QGxpbmsgQnJvd3Nlck5hdmlnYXRpb25GZWF0dXJlc30uXG4gKi9cbmNsYXNzIEJyb3dzZXJOYXZpZ2F0aW9uQmFyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF91cmxCYXI6IEJyb3dzZXJVcmxCYXJXaWRnZXQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBCcm93c2VyRWRpdG9yLFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0c2NvcGVkQ29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3ByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZWxlbWVudCA9ICQoJy5icm93c2VyLW5hdmJhcicpO1xuXG5cdFx0Y29uc3QgaG92ZXJEZWxlZ2F0ZSA9IHRoaXMuX3JlZ2lzdGVyKFxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFdvcmtiZW5jaEhvdmVyRGVsZWdhdGUsXG5cdFx0XHRcdCdlbGVtZW50Jyxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR7IHBvc2l0aW9uOiB7IGhvdmVyUG9zaXRpb246IEhvdmVyUG9zaXRpb24uQUJPVkUgfSB9XG5cdFx0XHQpXG5cdFx0KTtcblxuXHRcdGNvbnN0IHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lDb250ZXh0S2V5U2VydmljZSwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2VdXG5cdFx0KSk7XG5cblx0XHRjb25zdCBuYXZDb250YWluZXIgPSAkKCcuYnJvd3Nlci1uYXYtdG9vbGJhcicpO1xuXHRcdGNvbnN0IG5hdlRvb2xiYXIgPSB0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdE1lbnVXb3JrYmVuY2hUb29sQmFyLFxuXHRcdFx0bmF2Q29udGFpbmVyLFxuXHRcdFx0TWVudUlkLkJyb3dzZXJOYXZpZ2F0aW9uVG9vbGJhcixcblx0XHRcdHtcblx0XHRcdFx0aG92ZXJEZWxlZ2F0ZSxcblx0XHRcdFx0aGlnaGxpZ2h0VG9nZ2xlZEl0ZW1zOiB0cnVlLFxuXHRcdFx0XHQvLyBSZW5kZXIgYWxsIGFjdGlvbnMgaW5saW5lIHJlZ2FyZGxlc3Mgb2YgZ3JvdXAuXG5cdFx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHByaW1hcnlHcm91cDogKCkgPT4gdHJ1ZSwgdXNlU2VwYXJhdG9yc0luUHJpbWFyeUFjdGlvbnM6IHRydWUgfSxcblx0XHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUgfVxuXHRcdFx0fVxuXHRcdCkpO1xuXHRcdG5hdlRvb2xiYXIuY29udGV4dCA9IGVkaXRvcjtcblxuXHRcdGNvbnN0IHVybEJhckhvc3Q6IElCcm93c2VyVXJsQmFySG9zdCA9IHtcblx0XHRcdGdldCBpbnB1dCgpIHsgcmV0dXJuIGVkaXRvci5pbnB1dCBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3JJbnB1dCA/IGVkaXRvci5pbnB1dCA6IHVuZGVmaW5lZDsgfSxcblx0XHRcdGVuc3VyZUJyb3dzZXJGb2N1czogKCkgPT4gZWRpdG9yLmVuc3VyZUJyb3dzZXJGb2N1cygpLFxuXHRcdFx0Z2V0UHJpbWFyeUFjdGlvbnM6ICh0ZXh0KSA9PiB0aGlzLl9yZXNvbHZlUHJpbWFyeUFjdGlvbnModGV4dCksXG5cdFx0XHRnZXRQbGFjZWhvbGRlcjogKCkgPT4gdGhpcy5fc2VhcmNoRW5naW5lXG5cdFx0XHRcdD8gbG9jYWxpemUoeyBrZXk6ICdicm93c2VyLnVybE9yU2VhcmNoUGxhY2Vob2xkZXInLCBjb21tZW50OiBbJ1BsYWNlaG9sZGVyIHRleHQgc2hvd24gaW4gdGhlIGludGVncmF0ZWQgYnJvd3NlclxcJ3MgYWRkcmVzcyAoVVJMKSBiYXIgd2hlbiBpdCBpcyBlbXB0eS4gVGhlIHVzZXIgY2FuIGVpdGhlciB0eXBlIGEgc2VhcmNoIHF1ZXJ5IHRvIHNlYXJjaCB0aGUgd2ViLCBvciB0eXBlIGEgVVJMIHRvIG5hdmlnYXRlIHRvIGl0LiddIH0sIFwiU2VhcmNoIG9yIGVudGVyIFVSTFwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdicm93c2VyLnVybFBsYWNlaG9sZGVyJywgXCJFbnRlciBhIFVSTFwiKSxcblx0XHR9O1xuXHRcdHRoaXMuX3VybEJhciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJyb3dzZXJVcmxCYXJXaWRnZXQsIHVybEJhckhvc3QpKTtcblxuXHRcdGNvbnN0IGFjdGlvbnNDb250YWluZXIgPSAkKCcuYnJvd3Nlci1hY3Rpb25zLXRvb2xiYXInKTtcblx0XHRjb25zdCBhY3Rpb25zVG9vbGJhciA9IHRoaXMuX3JlZ2lzdGVyKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0TWVudVdvcmtiZW5jaFRvb2xCYXIsXG5cdFx0XHRhY3Rpb25zQ29udGFpbmVyLFxuXHRcdFx0TWVudUlkLkJyb3dzZXJBY3Rpb25zVG9vbGJhcixcblx0XHRcdHtcblx0XHRcdFx0aG92ZXJEZWxlZ2F0ZSxcblx0XHRcdFx0aGlnaGxpZ2h0VG9nZ2xlZEl0ZW1zOiB0cnVlLFxuXHRcdFx0XHR0b29sYmFyT3B0aW9uczogeyBwcmltYXJ5R3JvdXA6ICgpID0+IHRydWUsIHVzZVNlcGFyYXRvcnNJblByaW1hcnlBY3Rpb25zOiB0cnVlIH0sXG5cdFx0XHRcdG1lbnVPcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlIH0sXG5cdFx0XHRcdHJlc3BvbnNpdmVCZWhhdmlvcjoge1xuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0a2luZDogJ2xhc3QnLFxuXHRcdFx0XHRcdG1pbkl0ZW1zOiAwLFxuXG5cdFx0XHRcdFx0Ly8gVGhlIFVSTCBiYXIgaXMgdGhlIGZsZXhpYmxlIGVsZW1lbnQsIHNvIHRoZSBhY3Rpb25zIHRvb2xiYXIncyBvd25cblx0XHRcdFx0XHQvLyBlbGVtZW50IHdpZHRoIGRvZXMgbm90IHJlZmxlY3QgdGhlIHJvb20gaXQgY291bGQgb2NjdXB5LlxuXHRcdFx0XHRcdC8vIFNvIHdlIHBhc3MgbWFudWFsIGNhbGN1bGF0aW9ucyBiYXNlZCBvbiB0aGUgbmF2YmFyJ3Mgb3ZlcmFsbCB3aWR0aCBhbmQgdGhlIFVSTCBiYXIncyB3aWR0aC5cblx0XHRcdFx0XHRvYnNlcnZlZEVsZW1lbnQ6IHRoaXMuZWxlbWVudCxcblx0XHRcdFx0XHRnZXRBdmFpbGFibGVXaWR0aDogKCkgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgdG9vbGJhckJvdW5kcyA9IHRoaXMuZWxlbWVudC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdFx0XHRcdGNvbnN0IHVybEJhckJvdW5kcyA9IHRoaXMuX3VybEJhci5lbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIE1hdGgubWF4KDAsIHRvb2xiYXJCb3VuZHMucmlnaHQgLSB1cmxCYXJCb3VuZHMubGVmdCAtIDI0MCAvKiBhcHByb3hpbWF0ZTogcHJlZmVycmVkIHdpZHRoIG9mIHRoZSBVUkwgaW5wdXQgcGx1cyBwYWRkaW5nICovKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9XG5cdFx0KSk7XG5cdFx0YWN0aW9uc1Rvb2xiYXIuY29udGV4dCA9IGVkaXRvcjtcblxuXHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZChuYXZDb250YWluZXIpO1xuXHRcdHRoaXMuZWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLl91cmxCYXIuZWxlbWVudCk7XG5cdFx0dGhpcy5lbGVtZW50LmFwcGVuZENoaWxkKGFjdGlvbnNDb250YWluZXIpO1xuXHR9XG5cblx0cmVmcmVzaFVybCgpOiB2b2lkIHsgdGhpcy5fdXJsQmFyLnJlZnJlc2hVcmwoKTsgfVxuXHRwcmV2aWV3VXJsKHVybDogc3RyaW5nKTogdm9pZCB7IHRoaXMuX3VybEJhci5wcmV2aWV3VXJsKHVybCk7IH1cblx0Zm9jdXNVcmxJbnB1dCgpOiB2b2lkIHsgdGhpcy5fdXJsQmFyLmZvY3VzVXJsSW5wdXQoKTsgfVxuXHRvcGVuVXJsUGlja2VyKCk6IHZvaWQgeyB0aGlzLl91cmxCYXIub3BlblVybFBpY2tlcigpOyB9XG5cdGNsZWFyKCk6IHZvaWQgeyB0aGlzLl91cmxCYXIuY2xlYXIoKTsgfVxuXG5cdG1vdW50Q29udHJpYnV0aW9ucyhjb250cmlidXRpb25zOiByZWFkb25seSBCcm93c2VyRWRpdG9yQ29udHJpYnV0aW9uW10pOiB2b2lkIHsgdGhpcy5fdXJsQmFyLm1vdW50Q29udHJpYnV0aW9ucyhjb250cmlidXRpb25zKTsgfVxuXG5cdC8qKlxuXHQgKiBUaGUgY29uZmlndXJlZCBhZGRyZXNzIGJhciBzZWFyY2ggZW5naW5lLCBvciBgdW5kZWZpbmVkYCB3aGVuIHNlYXJjaFxuXHQgKiByb3V0aW5nIGlzIGRpc2FibGVkICh0aGUgc2V0dGluZyBpcyBgJ25vbmUnYCkuXG5cdCAqL1xuXHRwcml2YXRlIGdldCBfc2VhcmNoRW5naW5lKCk6IEJyb3dzZXJTZWFyY2hFbmdpbmVJZCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdmFsdWUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KEJyb3dzZXJTZWFyY2hFbmdpbmVTZXR0aW5nSWQpO1xuXHRcdHJldHVybiB2YWx1ZSAmJiB2YWx1ZSAhPT0gQlJPV1NFUl9TRUFSQ0hfTk9ORSA/IHZhbHVlIGFzIEJyb3dzZXJTZWFyY2hFbmdpbmVJZCA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgVVJMIGJhcidzIHByaW1hcnkgcGlja2VyIGl0ZW0ocykgZm9yIHRoZSBnaXZlbiB0ZXh0LCBtaXJyb3Jpbmdcblx0ICogQ2hyb21lL0VkZ2UuIFdpdGggc2VhcmNoIGVuYWJsZWQ6IGEgVVJMIHJlYWRzIFwie3VybH1cIiAoZ2xvYmUgaWNvbikgZmlyc3Rcblx0ICogd2l0aCBhIHNlYXJjaCBmYWxsYmFjayBhZnRlciwgYSBjbGVhciBxdWVyeSByZWFkcyBcIntxdWVyeX0gLSB7ZW5naW5lfVxuXHQgKiBTZWFyY2hcIiAoc2VhcmNoIGljb24pLCBhbmQgYW4gYW1iaWd1b3VzIGlucHV0IG9mZmVycyBib3RoIFx1MjAxNCBTZWFyY2ggZmlyc3QsXG5cdCAqIHRoZW4gR28gdG8gXHUyMDE0IHNvIHRoZSB1c2VyIGNhbiBwaWNrLiBUaGUgZGVzdGluYXRpb24gVVJMIGlzIHJlc29sdmVkIGhlcmVcblx0ICogKHNlYXJjaCB0ZXh0IFx1MjE5MiBzZWFyY2gtZW5naW5lIFVSTCkgc28ge0BsaW5rIEJyb3dzZXJFZGl0b3JJbnB1dC5uYXZpZ2F0ZX1cblx0ICogcmVjZWl2ZXMgYSBwbGFpbiBVUkw7IHRoZSB0ZWxlbWV0cnkgc291cmNlIGlzIHBhc3NlZCB0aHJvdWdoIHNvIGFcblx0ICogc2VhcmNoLWluaXRpYXRlZCBuYXZpZ2F0aW9uIGlzIHRyYWNrZWQgYXMgc3VjaC5cblx0ICovXG5cdHByaXZhdGUgX3Jlc29sdmVQcmltYXJ5QWN0aW9ucyh0ZXh0OiBzdHJpbmcpOiBJVXJsUGlja2VySXRlbVtdIHtcblx0XHRjb25zdCBnb1RvOiBJVXJsUGlja2VySXRlbSA9IHtcblx0XHRcdGlkOiB0ZXh0LFxuXHRcdFx0bGFiZWw6IHRleHQsXG5cdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLmdsb2JlKSxcblx0XHRcdGFwcGx5OiBpbnB1dCA9PiBpbnB1dC5uYXZpZ2F0ZSh0ZXh0KSxcblx0XHR9O1xuXHRcdGNvbnN0IGVuZ2luZUlkID0gdGhpcy5fc2VhcmNoRW5naW5lO1xuXHRcdGlmICghZW5naW5lSWQpIHtcblx0XHRcdHJldHVybiBbZ29Ub107XG5cdFx0fVxuXHRcdGNvbnN0IGNvbmZpZ3VyZUVuZ2luZUJ1dHRvbjogSUJyb3dzZXJVcmxTdWdnZXN0aW9uQWN0aW9uID0ge1xuXHRcdFx0aWQ6ICdicm93c2VyLmNvbmZpZ3VyZVNlYXJjaEVuZ2luZScsXG5cdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnNldHRpbmdzR2VhciksXG5cdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnYnJvd3Nlci5jb25maWd1cmVTZWFyY2hFbmdpbmUnLCBcIkNvbmZpZ3VyZSBTZWFyY2ggRW5naW5lXCIpLFxuXHRcdFx0cnVuOiAoKSA9PiB2b2lkIHRoaXMuX3ByZWZlcmVuY2VzU2VydmljZS5vcGVuU2V0dGluZ3MoeyBxdWVyeTogYEBpZDoke0Jyb3dzZXJTZWFyY2hFbmdpbmVTZXR0aW5nSWR9YCB9KSxcblx0XHR9O1xuXHRcdGNvbnN0IHNlYXJjaDogSVVybFBpY2tlckl0ZW0gPSB7XG5cdFx0XHRpZDogdGV4dCxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYnJvd3Nlci5zZWFyY2hGb3InLCBcInswfSAtIHsxfSBTZWFyY2hcIiwgdGV4dCwgZ2V0QnJvd3NlclNlYXJjaEVuZ2luZUxhYmVsKGVuZ2luZUlkKSksXG5cdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnNlYXJjaCksXG5cdFx0XHRidXR0b25zOiBbY29uZmlndXJlRW5naW5lQnV0dG9uXSxcblx0XHRcdGFwcGx5OiBpbnB1dCA9PiBpbnB1dC5uYXZpZ2F0ZShidWlsZFNlYXJjaFVybCh0ZXh0LCBlbmdpbmVJZCksIHsgc291cmNlOiAnc2VhcmNoSW5wdXQnIH0pLFxuXHRcdH07XG5cdFx0c3dpdGNoIChyZXNvbHZlQWRkcmVzc0JhcklucHV0VHlwZSh0ZXh0KSkge1xuXHRcdFx0Y2FzZSAndXJsJzpcblx0XHRcdFx0Ly8gTG9va3MgbGlrZSBhIFVSTDogbmF2aWdhdGUgZmlyc3QsIGJ1dCBzdGlsbCBvZmZlciBzZWFyY2ggYWZ0ZXIuXG5cdFx0XHRcdHJldHVybiBbZ29Ubywgc2VhcmNoXTtcblx0XHRcdGNhc2UgJ3F1ZXJ5Jzpcblx0XHRcdFx0cmV0dXJuIFtzZWFyY2hdO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0Ly8gQW1iaWd1b3VzOiBvZmZlciBib3RoLCBzZWFyY2ggZmlyc3QuXG5cdFx0XHRcdHJldHVybiBbc2VhcmNoLCBnb1RvXTtcblx0XHR9XG5cdH1cbn1cblxuXG4vKipcbiAqIE93bnMgdGhlIG5hdmJhciB3aWRnZXQgYW5kIHRoZSBuYXZpZ2F0aW9uLXJlbGF0ZWQgY29udGV4dCBrZXlzLiBNb3VudHNcbiAqIHNpYmxpbmcgUHJlVXJsL1Bvc3RVcmwgd2lkZ2V0cyBhbmQgVVJMIHJlbmRlcmVycyBpbnRvIHRoZSBuYXZiYXIuXG4gKi9cbmV4cG9ydCBjbGFzcyBCcm93c2VyTmF2aWdhdGlvbkZlYXR1cmVzIGV4dGVuZHMgQnJvd3NlckVkaXRvckNvbnRyaWJ1dGlvbiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbmF2YmFyOiBCcm93c2VyTmF2aWdhdGlvbkJhcjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FuR29CYWNrQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NhbkdvRm9yd2FyZENvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nVHJ5Rm9jdXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgYSBuYXZpZ2F0aW9uIGhhcyBiZWVuIGluaXRpYXRlZCBvbiB0aGUgY3VycmVudCB0YWIuIE9uY2UgdHJ1ZSxcblx0ICogYW4gZW1wdHkgVVJMIG1lYW5zIFwibmF2aWdhdGlvbiBpbiBmbGlnaHRcIiByYXRoZXIgdGhhbiBcImZyZXNoIHRhYlwiLCBzb1xuXHQgKiB7QGxpbmsgdHJ5Rm9jdXN9IGtlZXBzIGZvY3VzIG9uIHRoZSBwYWdlIGluc3RlYWQgb2YgcmVvcGVuaW5nIHRoZSBwaWNrZXIuXG5cdCAqL1xuXHRwcml2YXRlIF9oYXNJbml0aWF0ZWROYXZpZ2F0aW9uID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZWRpdG9yOiBCcm93c2VyRWRpdG9yLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoZWRpdG9yKTtcblx0XHR0aGlzLl9uYXZiYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQnJvd3Nlck5hdmlnYXRpb25CYXIoZWRpdG9yLCBpbnN0YW50aWF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBwcmVmZXJlbmNlc1NlcnZpY2UpKTtcblx0XHR0aGlzLl9jYW5Hb0JhY2tDb250ZXh0ID0gQ09OVEVYVF9CUk9XU0VSX0NBTl9HT19CQUNLLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY2FuR29Gb3J3YXJkQ29udGV4dCA9IENPTlRFWFRfQlJPV1NFUl9DQU5fR09fRk9SV0FSRC5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0Ly8gS2VlcCB0aGUgVVJMIGJhciBwcmVzZW50YXRpb24gKHBsYWNlaG9sZGVyLCBwcmltYXJ5IGFjdGlvbikgaW4gc3luY1xuXHRcdC8vIHdoZW4gdGhlIHVzZXIgdG9nZ2xlcyBzZWFyY2ggc2V0dGluZ3Mgd2hpbGUgdGhlIGJhciBpcyB2aXNpYmxlLlxuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKEJyb3dzZXJTZWFyY2hFbmdpbmVTZXR0aW5nSWQpKSB7XG5cdFx0XHRcdHRoaXMuX25hdmJhci5yZWZyZXNoVXJsKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHdpZGdldHMoKTogcmVhZG9ubHkgSUJyb3dzZXJFZGl0b3JXaWRnZXRbXSB7XG5cdFx0cmV0dXJuIFt7IGxvY2F0aW9uOiBCcm93c2VyV2lkZ2V0TG9jYXRpb24uVG9vbGJhciwgZWxlbWVudDogdGhpcy5fbmF2YmFyLmVsZW1lbnQsIG9yZGVyOiAwIH1dO1xuXHR9XG5cblx0b3ZlcnJpZGUgb25Db250YWluZXJDcmVhdGVkKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbnM6IEJyb3dzZXJFZGl0b3JDb250cmlidXRpb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY29udHJpYnV0aW9uIG9mIHRoaXMuZWRpdG9yLmdldENvbnRyaWJ1dGlvbnMoKSkge1xuXHRcdFx0aWYgKGNvbnRyaWJ1dGlvbiAhPT0gdGhpcykge1xuXHRcdFx0XHRjb250cmlidXRpb25zLnB1c2goY29udHJpYnV0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fbmF2YmFyLm1vdW50Q29udHJpYnV0aW9ucyhjb250cmlidXRpb25zKTtcblx0fVxuXG5cdG92ZXJyaWRlIHByZXJlbmRlcklucHV0KF9pbnB1dDogQnJvd3NlckVkaXRvcklucHV0KTogdm9pZCB7XG5cdFx0dGhpcy5fbmF2YmFyLnJlZnJlc2hVcmwoKTtcblx0XHR0aGlzLl9jYW5Hb0JhY2tDb250ZXh0LnNldChmYWxzZSk7XG5cdFx0dGhpcy5fY2FuR29Gb3J3YXJkQ29udGV4dC5zZXQoZmFsc2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIG9uTW9kZWxBdHRhY2hlZChtb2RlbDogSUJyb3dzZXJWaWV3TW9kZWwsIHN0b3JlOiBEaXNwb3NhYmxlU3RvcmUpOiB2b2lkIHtcblx0XHQvLyBBIG1vZGVsIHRoYXQgaXMgYWxyZWFkeSBsb2FkaW5nIG9uIGF0dGFjaCAoZS5nLiBzd2l0Y2hpbmcgYmFjayB0byBhXG5cdFx0Ly8gdGFiIG1pZC1uYXZpZ2F0aW9uKSBjb3VudHMgYXMgaGF2aW5nIGluaXRpYXRlZCBuYXZpZ2F0aW9uLlxuXHRcdHRoaXMuX2hhc0luaXRpYXRlZE5hdmlnYXRpb24gPSBtb2RlbC5sb2FkaW5nO1xuXHRcdHRoaXMuX3VwZGF0ZUZyb21Nb2RlbChtb2RlbCk7XG5cdFx0c3RvcmUuYWRkKG1vZGVsLm9uRGlkTmF2aWdhdGUoKCkgPT4gdGhpcy5fdXBkYXRlRnJvbU1vZGVsKG1vZGVsKSkpO1xuXHRcdHN0b3JlLmFkZChtb2RlbC5vbldpbGxOYXZpZ2F0ZSh1cmwgPT4ge1xuXHRcdFx0dGhpcy5faGFzSW5pdGlhdGVkTmF2aWdhdGlvbiA9IHRydWU7XG5cdFx0XHR0aGlzLl9uYXZiYXIucHJldmlld1VybCh1cmwpO1xuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIG9uTW9kZWxEZXRhY2hlZCgpOiB2b2lkIHtcblx0XHR0aGlzLl9oYXNJbml0aWF0ZWROYXZpZ2F0aW9uID0gZmFsc2U7XG5cdFx0dGhpcy5fbmF2YmFyLmNsZWFyKCk7XG5cdFx0dGhpcy5fY2FuR29CYWNrQ29udGV4dC5yZXNldCgpO1xuXHRcdHRoaXMuX2NhbkdvRm9yd2FyZENvbnRleHQucmVzZXQoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHRyeUZvY3VzKCk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGlucHV0ID0gdGhpcy5lZGl0b3IuaW5wdXQ7XG5cblx0XHQvLyBEZWZlciBvbmUgdGljayBzbyBlZGl0b3ItdGFiIGFjdGl2YXRpb24gY2FuIGZvY3VzIHRoZSB0YWIgY29udHJvbCBmaXJzdDtcblx0XHQvLyB0aGVuIHdlIG1vdmUgZm9jdXMgaW50byB0aGUgYnJvd3NlciBlZGl0b3IncyBVUkwgZmxvdy5cblx0XHR0aGlzLl9wZW5kaW5nVHJ5Rm9jdXMudmFsdWUgPSBkaXNwb3NhYmxlVGltZW91dCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5lZGl0b3IuaW5wdXQgIT09IGlucHV0KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQSBuZXcgdGFiIChubyBVUkwgbG9hZGVkKSBhdXRvLW9wZW5zIHRoZSBwaWNrZXIgc28gdGhlIHVzZXIgY2FuIGltbWVkaWF0ZWx5IHR5cGUgLyBicm93c2Ugc3VnZ2VzdGlvbnMuXG5cdFx0XHQvLyBPdGhlcndpc2Ugd2UgbW92ZSBmb2N1cyBpbnRvIHRoZSBicm93c2VyIGVkaXRvciBzbyBpdCBkb2Vzbid0IHN0YXkgb24gdGhlIHRhYiBjb250cm9sLlxuXHRcdFx0Y29uc3QgdXJsID0gdGhpcy5lZGl0b3IubW9kZWw/LnVybCA/PyAoaW5wdXQgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9ySW5wdXQgPyBpbnB1dC51cmwgOiB1bmRlZmluZWQpO1xuXHRcdFx0aWYgKCF1cmwgJiYgIXRoaXMuX2hhc0luaXRpYXRlZE5hdmlnYXRpb24pIHtcblx0XHRcdFx0dGhpcy5fbmF2YmFyLm9wZW5VcmxQaWNrZXIoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLmVuc3VyZUJyb3dzZXJGb2N1cygpO1xuXHRcdFx0fVxuXHRcdH0sIDApO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRnJvbU1vZGVsKG1vZGVsOiBJQnJvd3NlclZpZXdNb2RlbCk6IHZvaWQge1xuXHRcdHRoaXMuX25hdmJhci5yZWZyZXNoVXJsKCk7XG5cdFx0dGhpcy5fY2FuR29CYWNrQ29udGV4dC5zZXQobW9kZWwuY2FuR29CYWNrKTtcblx0XHR0aGlzLl9jYW5Hb0ZvcndhcmRDb250ZXh0LnNldChtb2RlbC5jYW5Hb0ZvcndhcmQpO1xuXHR9XG5cblx0Zm9jdXNVcmxJbnB1dCgpOiB2b2lkIHtcblx0XHR0aGlzLl9uYXZiYXIuZm9jdXNVcmxJbnB1dCgpO1xuXHR9XG5cblx0b3BlblVybFBpY2tlcigpOiB2b2lkIHtcblx0XHR0aGlzLl9uYXZiYXIub3BlblVybFBpY2tlcigpO1xuXHR9XG59XG5cbkJyb3dzZXJFZGl0b3IucmVnaXN0ZXJDb250cmlidXRpb24oQnJvd3Nlck5hdmlnYXRpb25GZWF0dXJlcyk7XG5cbmNsYXNzIEdvQmFja0FjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBCcm93c2VyVmlld0NvbW1hbmRJZC5Hb0JhY2s7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IEdvQmFja0FjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIuZ29CYWNrQWN0aW9uJywgJ0dvIEJhY2snKSxcblx0XHRcdGNhdGVnb3J5OiBCcm93c2VyQWN0aW9uQ2F0ZWdvcnksXG5cdFx0XHRpY29uOiBDb2RpY29uLmFycm93TGVmdCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5hbmQoQlJPV1NFUl9FRElUT1JfQUNUSVZFLCBDT05URVhUX0JST1dTRVJfQ0FOX0dPX0JBQ0spLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkJyb3dzZXJOYXZpZ2F0aW9uVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDEsXG5cdFx0XHR9LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDUwLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQWx0IHwgS2V5Q29kZS5MZWZ0QXJyb3csXG5cdFx0XHRcdHNlY29uZGFyeTogW0tleUNvZGUuQnJvd3NlckJhY2tdLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJyYWNrZXRMZWZ0LCBzZWNvbmRhcnk6IFtLZXlDb2RlLkJyb3dzZXJCYWNrLCBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuTGVmdEFycm93XSB9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGJyb3dzZXJFZGl0b3IgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoYnJvd3NlckVkaXRvciBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3IpIHtcblx0XHRcdGF3YWl0IGJyb3dzZXJFZGl0b3IubW9kZWw/LmdvQmFjaygpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBHb0ZvcndhcmRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gQnJvd3NlclZpZXdDb21tYW5kSWQuR29Gb3J3YXJkO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBHb0ZvcndhcmRBY3Rpb24uSUQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdicm93c2VyLmdvRm9yd2FyZEFjdGlvbicsICdHbyBGb3J3YXJkJyksXG5cdFx0XHRjYXRlZ29yeTogQnJvd3NlckFjdGlvbkNhdGVnb3J5LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5hcnJvd1JpZ2h0LFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChCUk9XU0VSX0VESVRPUl9BQ1RJVkUsIENPTlRFWFRfQlJPV1NFUl9DQU5fR09fRk9SV0FSRCksXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQnJvd3Nlck5hdmlnYXRpb25Ub29sYmFyLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdH0sXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgNTAsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLlJpZ2h0QXJyb3csXG5cdFx0XHRcdHNlY29uZGFyeTogW0tleUNvZGUuQnJvd3NlckZvcndhcmRdLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkJyYWNrZXRSaWdodCwgc2Vjb25kYXJ5OiBbS2V5Q29kZS5Ccm93c2VyRm9yd2FyZCwgS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlJpZ2h0QXJyb3ddIH1cblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgYnJvd3NlckVkaXRvciA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSkuYWN0aXZlRWRpdG9yUGFuZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChicm93c2VyRWRpdG9yIGluc3RhbmNlb2YgQnJvd3NlckVkaXRvcikge1xuXHRcdFx0YXdhaXQgYnJvd3NlckVkaXRvci5tb2RlbD8uZ29Gb3J3YXJkKCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFJlbG9hZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBCcm93c2VyVmlld0NvbW1hbmRJZC5SZWxvYWQ7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFJlbG9hZEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIucmVsb2FkQWN0aW9uJywgJ1JlbG9hZCcpLFxuXHRcdFx0Y2F0ZWdvcnk6IEJyb3dzZXJBY3Rpb25DYXRlZ29yeSxcblx0XHRcdGljb246IENvZGljb24ucmVmcmVzaCxcblx0XHRcdGYxOiB0cnVlLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBCUk9XU0VSX0VESVRPUl9BQ1RJVkUsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuQnJvd3Nlck5hdmlnYXRpb25Ub29sYmFyLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMyxcblx0XHRcdFx0YWx0OiB7XG5cdFx0XHRcdFx0aWQ6IEhhcmRSZWxvYWRBY3Rpb24uSUQsXG5cdFx0XHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci5oYXJkUmVsb2FkQWN0aW9uJywgJ0hhcmQgUmVsb2FkJyksXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5yZWZyZXNoLFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3aGVuOiBDT05URVhUX0JST1dTRVJfRk9DVVNFRCxcblx0XHRcdFx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIgKyA3NSxcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVIsXG5cdFx0XHRcdHNlY29uZGFyeTogW0tleUNvZGUuRjVdLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleVIsIHNlY29uZGFyeTogW10gfVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBicm93c2VyRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGJyb3dzZXJFZGl0b3IgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9yKSB7XG5cdFx0XHRhd2FpdCBicm93c2VyRWRpdG9yLm1vZGVsPy5yZWxvYWQoKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgSGFyZFJlbG9hZEFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBCcm93c2VyVmlld0NvbW1hbmRJZC5IYXJkUmVsb2FkO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBIYXJkUmVsb2FkQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci5oYXJkUmVsb2FkQWN0aW9uJywgJ0hhcmQgUmVsb2FkJyksXG5cdFx0XHRjYXRlZ29yeTogQnJvd3NlckFjdGlvbkNhdGVnb3J5LFxuXHRcdFx0aWNvbjogQ29kaWNvbi5yZWZyZXNoLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRwcmVjb25kaXRpb246IEJST1dTRVJfRURJVE9SX0FDVElWRSxcblx0XHRcdGtleWJpbmRpbmc6IHtcblx0XHRcdFx0d2hlbjogQ09OVEVYVF9CUk9XU0VSX0ZPQ1VTRUQsXG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgNzUsXG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5LZXlSLFxuXHRcdFx0XHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRjVdLFxuXHRcdFx0XHRtYWM6IHsgcHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLktleVIsIHNlY29uZGFyeTogW10gfVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBicm93c2VyRWRpdG9yID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JTZXJ2aWNlKS5hY3RpdmVFZGl0b3JQYW5lKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGJyb3dzZXJFZGl0b3IgaW5zdGFuY2VvZiBCcm93c2VyRWRpdG9yKSB7XG5cdFx0XHRhd2FpdCBicm93c2VyRWRpdG9yLm1vZGVsPy5yZWxvYWQodHJ1ZSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEZvY3VzVXJsSW5wdXRBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gQnJvd3NlclZpZXdDb21tYW5kSWQuRm9jdXNVcmxJbnB1dDtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogRm9jdXNVcmxJbnB1dEFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIuZm9jdXNVcmxJbnB1dEFjdGlvbicsICdGb2N1cyBVUkwgSW5wdXQnKSxcblx0XHRcdGNhdGVnb3J5OiBCcm93c2VyQWN0aW9uQ2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogQlJPV1NFUl9FRElUT1JfQUNUSVZFLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLktleUwsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGJyb3dzZXJFZGl0b3IgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoYnJvd3NlckVkaXRvciBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3IpIHtcblx0XHRcdGJyb3dzZXJFZGl0b3IuZ2V0Q29udHJpYnV0aW9uKEJyb3dzZXJOYXZpZ2F0aW9uRmVhdHVyZXMpPy5vcGVuVXJsUGlja2VyKCk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIE9wZW5JbkV4dGVybmFsQnJvd3NlckFjdGlvbiBleHRlbmRzIEFjdGlvbjIge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSBCcm93c2VyVmlld0NvbW1hbmRJZC5PcGVuRXh0ZXJuYWw7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IE9wZW5JbkV4dGVybmFsQnJvd3NlckFjdGlvbi5JRCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2Jyb3dzZXIub3BlbkV4dGVybmFsQWN0aW9uJywgJ09wZW4gaW4gRXh0ZXJuYWwgQnJvd3NlcicpLFxuXHRcdFx0Y2F0ZWdvcnk6IEJyb3dzZXJBY3Rpb25DYXRlZ29yeSxcblx0XHRcdGljb246IENvZGljb24ubGlua0V4dGVybmFsLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHQvLyBOb3RlOiBXZSBkbyBhbGxvdyBvcGVuaW5nIGluIGFuIGV4dGVybmFsIGJyb3dzZXIgZXZlbiBpZiB0aGVyZSBpcyBhbiBlcnJvciBwYWdlIHNob3duXG5cdFx0XHRwcmVjb25kaXRpb246IENvbnRleHRLZXlFeHByLmFuZChCUk9XU0VSX0VESVRPUl9BQ1RJVkUsIENPTlRFWFRfQlJPV1NFUl9IQVNfVVJMKSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Ccm93c2VyQWN0aW9uc1Rvb2xiYXIsXG5cdFx0XHRcdGdyb3VwOiBCcm93c2VyQWN0aW9uR3JvdXAuVG9vbHMsXG5cdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdFx0aXNIaWRkZW5CeURlZmF1bHQ6IHRydWUsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIGJyb3dzZXJFZGl0b3IgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvclNlcnZpY2UpLmFjdGl2ZUVkaXRvclBhbmUpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoYnJvd3NlckVkaXRvciBpbnN0YW5jZW9mIEJyb3dzZXJFZGl0b3IpIHtcblx0XHRcdGNvbnN0IHVybCA9IGJyb3dzZXJFZGl0b3IubW9kZWw/LnVybDtcblx0XHRcdGlmICh1cmwpIHtcblx0XHRcdFx0Y29uc3Qgb3BlbmVyU2VydmljZSA9IGFjY2Vzc29yLmdldChJT3BlbmVyU2VydmljZSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lclNlcnZpY2Uub3Blbih1cmwsIHtcblx0XHRcdFx0XHQvLyBlbnN1cmVzIHRoYXQgVlMgQ29kZSBpdHNlbGYgZG9lc24ndCB0cnkgdG8gb3BlbiB0aGUgVVJMLCBldmVuIGZvciBub24tXCJodHRwKHMpOlwiIHNjaGVtZSBVUkxzLlxuXHRcdFx0XHRcdG9wZW5FeHRlcm5hbDogdHJ1ZSxcblx0XHRcdFx0XHQvLyBlbnN1cmVzIHRoYXQgdGhlIGxpbmsgaXNuJ3Qgb3BlbmVkIGluIEludGVncmF0ZWQgQnJvd3NlciBvciBvdGhlciBjb250cmlidXRlZCBleHRlcm5hbCBvcGVuZXJzLiBGYWxzZSBpcyB0aGUgZGVmYXVsdCwgYnV0IGp1c3QgYmVpbmcgZXhwbGljaXQgaGVyZS5cblx0XHRcdFx0XHRhbGxvd0NvbnRyaWJ1dGVkT3BlbmVyczogZmFsc2Vcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIE9wZW5Ccm93c2VyU2V0dGluZ3NBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0c3RhdGljIHJlYWRvbmx5IElEID0gQnJvd3NlclZpZXdDb21tYW5kSWQuT3BlblNldHRpbmdzO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBPcGVuQnJvd3NlclNldHRpbmdzQWN0aW9uLklELFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignYnJvd3Nlci5vcGVuU2V0dGluZ3NBY3Rpb24nLCAnQnJvd3NlciBTZXR0aW5ncycpLFxuXHRcdFx0Y2F0ZWdvcnk6IEJyb3dzZXJBY3Rpb25DYXRlZ29yeSxcblx0XHRcdGljb246IENvZGljb24uc2V0dGluZ3NHZWFyLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLkJyb3dzZXJBY3Rpb25zVG9vbGJhcixcblx0XHRcdFx0Z3JvdXA6IEJyb3dzZXJBY3Rpb25Hcm91cC5TZXR0aW5ncyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdGlzSGlkZGVuQnlEZWZhdWx0OiB0cnVlLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcHJlZmVyZW5jZXNTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElQcmVmZXJlbmNlc1NlcnZpY2UpO1xuXHRcdGF3YWl0IHByZWZlcmVuY2VzU2VydmljZS5vcGVuU2V0dGluZ3MoeyBxdWVyeTogYEBpZDp3b3JrYmVuY2guYnJvd3Nlci4qYCB9KTtcblx0fVxufVxuXG5yZWdpc3RlckFjdGlvbjIoR29CYWNrQWN0aW9uKTtcbnJlZ2lzdGVyQWN0aW9uMihHb0ZvcndhcmRBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKFJlbG9hZEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoSGFyZFJlbG9hZEFjdGlvbik7XG5yZWdpc3RlckFjdGlvbjIoRm9jdXNVcmxJbnB1dEFjdGlvbik7XG5cbnJlZ2lzdGVyQWN0aW9uMihPcGVuSW5FeHRlcm5hbEJyb3dzZXJBY3Rpb24pO1xucmVnaXN0ZXJBY3Rpb24yKE9wZW5Ccm93c2VyU2V0dGluZ3NBY3Rpb24pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsU0FBUztBQUNsQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFlBQTZCLHlCQUF5QjtBQUMvRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxRQUFRLGVBQWU7QUFDaEMsU0FBUyxTQUFTLFFBQVEsdUJBQXVCO0FBQ2pE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
