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
import "../../../workbench/browser/parts/titlebar/media/titlebarpart.css";
import "./media/titlebarpart.css";
import { MultiWindowParts, Part } from "../../../workbench/browser/part.js";
import { getZoomFactor, isWCOEnabled, getWCOTitlebarAreaRect, isFullscreen, onDidChangeFullscreen } from "../../../base/browser/browser.js";
import { hasCustomTitlebar, hasNativeTitlebar, DEFAULT_CUSTOM_TITLEBAR_HEIGHT, getTitleBarStyle, getWindowControlsStyle, WindowControlsStyle } from "../../../platform/window/common/window.js";
import { IContextMenuService } from "../../../platform/contextview/browser/contextView.js";
import { StandardMouseEvent } from "../../../base/browser/mouseEvent.js";
import { IConfigurationService } from "../../../platform/configuration/common/configuration.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { IThemeService } from "../../../platform/theme/common/themeService.js";
import { agentsBackground, agentsPanelForeground } from "../../common/theme.js";
import { isMacintosh, isWeb, isNative, platformLocale } from "../../../base/common/platform.js";
import { EventType, EventHelper, append, $, addDisposableListener, prepend, getWindow, getWindowId } from "../../../base/browser/dom.js";
import { IInstantiationService } from "../../../platform/instantiation/common/instantiation.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { IStorageService } from "../../../platform/storage/common/storage.js";
import { Parts, IWorkbenchLayoutService } from "../../../workbench/services/layout/browser/layoutService.js";
import { IContextKeyService } from "../../../platform/contextkey/common/contextkey.js";
import { IHostService } from "../../../workbench/services/host/browser/host.js";
import { HiddenItemStrategy, MenuWorkbenchToolBar } from "../../../platform/actions/browser/toolbar.js";
import { mainWindow } from "../../../base/browser/window.js";
import { safeIntl } from "../../../base/common/date.js";
import { WindowTitle } from "../../../workbench/browser/parts/titlebar/windowTitle.js";
import { Menus } from "../menus.js";
import { IsNewChatSessionContext } from "../../common/contextkeys.js";
const commandCenterContextKeys = /* @__PURE__ */ new Set([IsNewChatSessionContext.key]);
let TitlebarPart = class extends Part {
  constructor(id, targetWindow, contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService) {
    super(id, { hasTitle: false }, themeService, storageService, layoutService);
    this.contextMenuService = contextMenuService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.contextKeyService = contextKeyService;
    this.hostService = hostService;
    //#region IView
    this.minimumWidth = 0;
    this.maximumWidth = Number.POSITIVE_INFINITY;
    //#endregion
    //#region Events
    this._onMenubarVisibilityChange = this._register(new Emitter());
    this.onMenubarVisibilityChange = this._onMenubarVisibilityChange.event;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this.leftSpacerWidth = 0;
    this.isInactive = false;
    this.titleBarStyle = getTitleBarStyle(this.configurationService);
    this.registerListeners(getWindowId(targetWindow));
  }
  get minimumHeight() {
    const wcoEnabled = isWeb && isWCOEnabled();
    let value = DEFAULT_CUSTOM_TITLEBAR_HEIGHT;
    if (wcoEnabled) {
      value = Math.max(value, getWCOTitlebarAreaRect(getWindow(this.element))?.height ?? 0);
    }
    return value / (this.preventZoom ? getZoomFactor(getWindow(this.element)) : 1);
  }
  get maximumHeight() {
    return this.minimumHeight;
  }
  get leftContainer() {
    return this.leftContent;
  }
  get rightContainer() {
    return this.rightContent;
  }
  get rightWindowControlsContainer() {
    return this.windowControlsContainer;
  }
  registerListeners(targetWindowId) {
    this._register(this.hostService.onDidChangeFocus((focused) => focused ? this.onFocus() : this.onBlur()));
    this._register(this.hostService.onDidChangeActiveWindow((windowId) => windowId === targetWindowId ? this.onFocus() : this.onBlur()));
  }
  onBlur() {
    this.isInactive = true;
    this.updateStyles();
  }
  onFocus() {
    this.isInactive = false;
    this.updateStyles();
  }
  updateProperties(_properties) {
  }
  registerVariables(_variables) {
  }
  updateOptions(_options) {
  }
  createContentArea(parent) {
    this.element = parent;
    this.rootContainer = append(parent, $(".titlebar-container.sessions-titlebar-container.has-center"));
    prepend(this.rootContainer, $("div.titlebar-drag-region"));
    this.leftContent = append(this.rootContainer, $(".titlebar-left"));
    this.centerContent = append(this.rootContainer, $(".titlebar-center"));
    this.rightContent = append(this.rootContainer, $(".titlebar-right"));
    if (!hasNativeTitlebar(this.configurationService, this.titleBarStyle)) {
      let primaryWindowControlsLocation = isMacintosh ? "left" : "right";
      if (isMacintosh && isNative) {
        const localeInfo = safeIntl.Locale(platformLocale).value;
        const textInfo = localeInfo.textInfo;
        if (textInfo?.direction === "rtl") {
          primaryWindowControlsLocation = "right";
        }
      }
      if (isMacintosh && isNative && primaryWindowControlsLocation === "left") {
        const spacer = append(this.leftContent, $("div.window-controls-container"));
        const updateSpacerVisibility = () => {
          const fullscreen = isFullscreen(mainWindow);
          spacer.style.display = fullscreen ? "none" : "";
          this.leftSpacerWidth = fullscreen ? 0 : 70;
        };
        updateSpacerVisibility();
        spacer.style.width = `${this.leftSpacerWidth}px`;
        spacer.style.flexShrink = "0";
        this._register(onDidChangeFullscreen((windowId) => {
          if (windowId === getWindowId(mainWindow)) {
            updateSpacerVisibility();
          }
        }));
      } else if (getWindowControlsStyle(this.configurationService) === WindowControlsStyle.HIDDEN) {
      } else {
        this.windowControlsContainer = append(primaryWindowControlsLocation === "left" ? this.leftContent : this.rightContent, $("div.window-controls-container"));
        if (isWeb) {
          append(primaryWindowControlsLocation === "left" ? this.rightContent : this.leftContent, $("div.window-controls-container"));
        }
        if (isWCOEnabled()) {
          this.windowControlsContainer.classList.add("wco-enabled");
        }
      }
    }
    this.leftToolbarContainer = append(this.leftContent, $("div.left-toolbar-container"));
    this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, this.leftToolbarContainer, Menus.TitleBarLeftLayout, {
      contextMenu: Menus.TitleBarContext,
      telemetrySource: "titlePart.left",
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      toolbarOptions: { primaryGroup: () => true }
    }));
    const centerNavContainer = append(this.centerContent, $("div.titlebar-actions-container.titlebar-center-nav-container"));
    this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, centerNavContainer, Menus.TitleBarCenterLeft, {
      contextMenu: Menus.TitleBarContext,
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      telemetrySource: "titlePart.centerLeft",
      toolbarOptions: { primaryGroup: () => true }
    }));
    const windowTitle = append(this.centerContent, $("div.window-title"));
    const centerToolbarContainer = append(windowTitle, $("div.command-center"));
    const centerToolbar = this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, centerToolbarContainer, Menus.CommandCenter, {
      contextMenu: Menus.TitleBarContext,
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      telemetrySource: "commandCenter",
      toolbarOptions: { primaryGroup: () => true }
    }));
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      if (e.affectsSome(commandCenterContextKeys)) {
        centerToolbar.refresh();
      }
    }));
    const centerActionsContainer = append(this.centerContent, $("div.titlebar-actions-container.titlebar-center-actions-container"));
    this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, centerActionsContainer, Menus.TitleBarCenterRight, {
      contextMenu: Menus.TitleBarContext,
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      telemetrySource: "titlePart.centerRight",
      toolbarOptions: { primaryGroup: () => true }
    }));
    const rightToolbarContainer = prepend(this.rightContent, $("div.titlebar-actions-container.titlebar-right-layout-container"));
    this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, rightToolbarContainer, Menus.TitleBarRightLayout, {
      contextMenu: Menus.TitleBarContext,
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      telemetrySource: "titlePart.right",
      toolbarOptions: { primaryGroup: () => true }
    }));
    const sessionActionsContainer = prepend(this.rightContent, $("div.titlebar-actions-container.titlebar-session-actions-container"));
    this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, sessionActionsContainer, Menus.TitleBarSessionMenu, {
      contextMenu: Menus.TitleBarContext,
      hiddenItemStrategy: HiddenItemStrategy.NoHide,
      telemetrySource: "titlePart.sessionActions",
      toolbarOptions: { primaryGroup: () => true }
    }));
    this._register(addDisposableListener(this.rootContainer, EventType.CONTEXT_MENU, (e) => {
      EventHelper.stop(e);
      this.onContextMenu(e);
    }));
    this.updateStyles();
    return this.element;
  }
  updateStyles() {
    super.updateStyles();
    if (this.element) {
      this.element.classList.toggle("inactive", this.isInactive);
      const titleBarBackground = this.getColor(agentsBackground);
      this.element.style.backgroundColor = titleBarBackground || "";
      const titleForeground = this.getColor(agentsPanelForeground);
      this.element.style.color = titleForeground || "";
    }
  }
  onContextMenu(e) {
    const event = new StandardMouseEvent(getWindow(this.element), e);
    this.contextMenuService.showContextMenu({
      getAnchor: () => event,
      menuId: Menus.TitleBarContext,
      contextKeyService: this.contextKeyService,
      domForShadowRoot: isMacintosh && isNative ? event.target : void 0
    });
  }
  get hasZoomableElements() {
    return true;
  }
  get preventZoom() {
    return getZoomFactor(getWindow(this.element)) < 1 || !this.hasZoomableElements;
  }
  layout(width, height) {
    this.updateLayout();
    super.layoutContents(width, height);
  }
  updateLayout() {
    if (!hasCustomTitlebar(this.configurationService, this.titleBarStyle)) {
      return;
    }
    const zoomFactor = getZoomFactor(getWindow(this.element));
    this.element.style.setProperty("--zoom-factor", zoomFactor.toString());
    this.rootContainer.classList.toggle("counter-zoom", this.preventZoom);
  }
  focus() {
    this.element.querySelector('[tabindex]:not([tabindex="-1"])')?.focus();
  }
  toJSON() {
    return { type: Parts.TITLEBAR_PART };
  }
  dispose() {
    this._onWillDispose.fire();
    super.dispose();
  }
};
TitlebarPart = __decorateClass([
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IWorkbenchLayoutService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IHostService)
], TitlebarPart);
let MainTitlebarPart = class extends TitlebarPart {
  constructor(contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService) {
    super(Parts.TITLEBAR_PART, mainWindow, contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService);
  }
};
MainTitlebarPart = __decorateClass([
  __decorateParam(0, IContextMenuService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IThemeService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IWorkbenchLayoutService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IHostService)
], MainTitlebarPart);
let AuxiliaryTitlebarPart = class extends TitlebarPart {
  constructor(container, mainTitlebar, contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService) {
    const id = AuxiliaryTitlebarPart.COUNTER++;
    super(`workbench.parts.auxiliaryTitle.${id}`, getWindow(container), contextMenuService, configurationService, instantiationService, themeService, storageService, layoutService, contextKeyService, hostService);
    this.container = container;
    this.mainTitlebar = mainTitlebar;
  }
  get height() {
    return this.minimumHeight;
  }
  get preventZoom() {
    return getZoomFactor(getWindow(this.element)) < 1 || !this.mainTitlebar.hasZoomableElements;
  }
};
AuxiliaryTitlebarPart.COUNTER = 1;
AuxiliaryTitlebarPart = __decorateClass([
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IThemeService),
  __decorateParam(6, IStorageService),
  __decorateParam(7, IWorkbenchLayoutService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IHostService)
], AuxiliaryTitlebarPart);
let TitleService = class extends MultiWindowParts {
  constructor(instantiationService, storageService, themeService) {
    super("workbench.agentSessionsTitleService", themeService, storageService);
    this.instantiationService = instantiationService;
    this.mainPart = this._register(this.createMainTitlebarPart());
    this.onMenubarVisibilityChange = this.mainPart.onMenubarVisibilityChange;
    this._register(this.registerPart(this.mainPart));
  }
  createMainTitlebarPart() {
    return this.instantiationService.createInstance(MainTitlebarPart);
  }
  //#region Auxiliary Titlebar Parts
  createAuxiliaryTitlebarPart(container, editorGroupsContainer, instantiationService) {
    const titlebarPartContainer = $(".part.titlebar", { role: "none" });
    titlebarPartContainer.style.position = "relative";
    container.insertBefore(titlebarPartContainer, container.firstChild);
    const disposables = new DisposableStore();
    const titlebarPart = this.doCreateAuxiliaryTitlebarPart(titlebarPartContainer, editorGroupsContainer, instantiationService);
    disposables.add(this.registerPart(titlebarPart));
    disposables.add(Event.runAndSubscribe(titlebarPart.onDidChange, () => titlebarPartContainer.style.height = `${titlebarPart.height}px`));
    titlebarPart.create(titlebarPartContainer);
    Event.once(titlebarPart.onWillDispose)(() => disposables.dispose());
    return titlebarPart;
  }
  doCreateAuxiliaryTitlebarPart(container, _editorGroupsContainer, instantiationService) {
    return instantiationService.createInstance(AuxiliaryTitlebarPart, container, this.mainPart);
  }
  updateProperties(properties) {
    for (const part of this.parts) {
      part.updateProperties(properties);
    }
  }
  registerVariables(variables) {
    for (const part of this.parts) {
      part.registerVariables(variables);
    }
  }
  get windowTitle() {
    if (!this._windowTitle) {
      this._windowTitle = this._register(this.instantiationService.createInstance(WindowTitle, mainWindow));
    }
    return this._windowTitle;
  }
  //#endregion
};
TitleService = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, IThemeService)
], TitleService);
export {
  AuxiliaryTitlebarPart,
  MainTitlebarPart,
  TitleService,
  TitlebarPart
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2Jyb3dzZXIvcGFydHMvdGl0bGViYXJQYXJ0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0cy90aXRsZWJhci9tZWRpYS90aXRsZWJhcnBhcnQuY3NzJztcbmltcG9ydCAnLi9tZWRpYS90aXRsZWJhcnBhcnQuY3NzJztcbmltcG9ydCB7IE11bHRpV2luZG93UGFydHMsIFBhcnQgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9wYXJ0LmpzJztcbmltcG9ydCB7IElUaXRsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvdGl0bGUvYnJvd3Nlci90aXRsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Wm9vbUZhY3RvciwgaXNXQ09FbmFibGVkLCBnZXRXQ09UaXRsZWJhckFyZWFSZWN0LCBpc0Z1bGxzY3JlZW4sIG9uRGlkQ2hhbmdlRnVsbHNjcmVlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9icm93c2VyLmpzJztcbmltcG9ydCB7IGhhc0N1c3RvbVRpdGxlYmFyLCBoYXNOYXRpdmVUaXRsZWJhciwgREVGQVVMVF9DVVNUT01fVElUTEVCQVJfSEVJR0hULCBUaXRsZWJhclN0eWxlLCBnZXRUaXRsZUJhclN0eWxlLCBnZXRXaW5kb3dDb250cm9sc1N0eWxlLCBXaW5kb3dDb250cm9sc1N0eWxlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRNb3VzZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYWdlbnRzQmFja2dyb3VuZCwgYWdlbnRzUGFuZWxGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoLCBpc1dlYiwgaXNOYXRpdmUsIHBsYXRmb3JtTG9jYWxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRXZlbnRUeXBlLCBFdmVudEhlbHBlciwgYXBwZW5kLCAkLCBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIHByZXBlbmQsIGdldFdpbmRvdywgZ2V0V2luZG93SWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IFBhcnRzLCBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcblxuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSGlkZGVuSXRlbVN0cmF0ZWd5LCBNZW51V29ya2JlbmNoVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci90b29sYmFyLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNDb250YWluZXIgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvZGVXaW5kb3csIG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IHNhZmVJbnRsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZGF0ZS5qcyc7XG5pbXBvcnQgeyBJVGl0bGViYXJQYXJ0LCBJVGl0bGVQcm9wZXJ0aWVzLCBJVGl0bGVWYXJpYWJsZSwgSUF1eGlsaWFyeVRpdGxlYmFyUGFydCB9IGZyb20gJy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL3RpdGxlYmFyL3RpdGxlYmFyUGFydC5qcyc7XG5pbXBvcnQgeyBXaW5kb3dUaXRsZSB9IGZyb20gJy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL3RpdGxlYmFyL3dpbmRvd1RpdGxlLmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vbWVudXMuanMnO1xuaW1wb3J0IHsgSXNOZXdDaGF0U2Vzc2lvbkNvbnRleHQgfSBmcm9tICcuLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuXG5jb25zdCBjb21tYW5kQ2VudGVyQ29udGV4dEtleXMgPSBuZXcgU2V0KFtJc05ld0NoYXRTZXNzaW9uQ29udGV4dC5rZXldKTtcblxuLyoqXG4gKiBTaW1wbGlmaWVkIGFnZW50IHNlc3Npb25zIHRpdGxlYmFyIHBhcnQuXG4gKlxuICogVGhyZWUgc2VjdGlvbnMgZHJpdmVuIGVudGlyZWx5IGJ5IG1lbnVzOlxuICogLSAqKkxlZnQqKjogYE1lbnVzLlRpdGxlQmFyTGVmdGAgdG9vbGJhclxuICogLSAqKkNlbnRlcioqOiBgTWVudXMuQ29tbWFuZENlbnRlcmAgdG9vbGJhciAocmVuZGVycyBzZXNzaW9uIHBpY2tlciB2aWEgSUFjdGlvblZpZXdJdGVtU2VydmljZSlcbiAqIC0gKipSaWdodCoqOiBgTWVudXMuVGl0bGVCYXJSaWdodGAgdG9vbGJhciAoaW5jbHVkZXMgYWNjb3VudCBzdWJtZW51KVxuICpcbiAqIE5vIG1lbnViYXIsIG5vIGVkaXRvciBhY3Rpb25zLCBubyBsYXlvdXQgY29udHJvbHMsIG5vIFdpbmRvd1RpdGxlIGRlcGVuZGVuY3kuXG4gKi9cbmV4cG9ydCBjbGFzcyBUaXRsZWJhclBhcnQgZXh0ZW5kcyBQYXJ0IGltcGxlbWVudHMgSVRpdGxlYmFyUGFydCB7XG5cblx0Ly8jcmVnaW9uIElWaWV3XG5cblx0cmVhZG9ubHkgbWluaW11bVdpZHRoOiBudW1iZXIgPSAwO1xuXHRyZWFkb25seSBtYXhpbXVtV2lkdGg6IG51bWJlciA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcblxuXHRnZXQgbWluaW11bUhlaWdodCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IHdjb0VuYWJsZWQgPSBpc1dlYiAmJiBpc1dDT0VuYWJsZWQoKTtcblx0XHRsZXQgdmFsdWUgPSBERUZBVUxUX0NVU1RPTV9USVRMRUJBUl9IRUlHSFQ7XG5cdFx0aWYgKHdjb0VuYWJsZWQpIHtcblx0XHRcdHZhbHVlID0gTWF0aC5tYXgodmFsdWUsIGdldFdDT1RpdGxlYmFyQXJlYVJlY3QoZ2V0V2luZG93KHRoaXMuZWxlbWVudCkpPy5oZWlnaHQgPz8gMCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHZhbHVlIC8gKHRoaXMucHJldmVudFpvb20gPyBnZXRab29tRmFjdG9yKGdldFdpbmRvdyh0aGlzLmVsZW1lbnQpKSA6IDEpO1xuXHR9XG5cblx0Z2V0IG1heGltdW1IZWlnaHQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMubWluaW11bUhlaWdodDsgfVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBFdmVudHNcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbk1lbnViYXJWaXNpYmlsaXR5Q2hhbmdlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uTWVudWJhclZpc2liaWxpdHlDaGFuZ2UgPSB0aGlzLl9vbk1lbnViYXJWaXNpYmlsaXR5Q2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbERpc3Bvc2UgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25XaWxsRGlzcG9zZSA9IHRoaXMuX29uV2lsbERpc3Bvc2UuZXZlbnQ7XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0cHJvdGVjdGVkIHJvb3RDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJvdGVjdGVkIHdpbmRvd0NvbnRyb2xzQ29udGFpbmVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIGxlZnRDb250ZW50ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgbGVmdFRvb2xiYXJDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBjZW50ZXJDb250ZW50ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmlnaHRDb250ZW50ITogSFRNTEVsZW1lbnQ7XG5cblx0Z2V0IGxlZnRDb250YWluZXIoKTogSFRNTEVsZW1lbnQgeyByZXR1cm4gdGhpcy5sZWZ0Q29udGVudDsgfVxuXHRnZXQgcmlnaHRDb250YWluZXIoKTogSFRNTEVsZW1lbnQgeyByZXR1cm4gdGhpcy5yaWdodENvbnRlbnQ7IH1cblx0Z2V0IHJpZ2h0V2luZG93Q29udHJvbHNDb250YWluZXIoKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQgeyByZXR1cm4gdGhpcy53aW5kb3dDb250cm9sc0NvbnRhaW5lcjsgfVxuXG5cdHByaXZhdGUgbGVmdFNwYWNlcldpZHRoOiBudW1iZXIgPSAwO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgdGl0bGVCYXJTdHlsZTogVGl0bGViYXJTdHlsZTtcblx0cHJpdmF0ZSBpc0luYWN0aXZlOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHR0YXJnZXRXaW5kb3c6IENvZGVXaW5kb3csXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihpZCwgeyBoYXNUaXRsZTogZmFsc2UgfSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbGF5b3V0U2VydmljZSk7XG5cblx0XHR0aGlzLnRpdGxlQmFyU3R5bGUgPSBnZXRUaXRsZUJhclN0eWxlKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5yZWdpc3Rlckxpc3RlbmVycyhnZXRXaW5kb3dJZCh0YXJnZXRXaW5kb3cpKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnModGFyZ2V0V2luZG93SWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaG9zdFNlcnZpY2Uub25EaWRDaGFuZ2VGb2N1cyhmb2N1c2VkID0+IGZvY3VzZWQgPyB0aGlzLm9uRm9jdXMoKSA6IHRoaXMub25CbHVyKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmhvc3RTZXJ2aWNlLm9uRGlkQ2hhbmdlQWN0aXZlV2luZG93KHdpbmRvd0lkID0+IHdpbmRvd0lkID09PSB0YXJnZXRXaW5kb3dJZCA/IHRoaXMub25Gb2N1cygpIDogdGhpcy5vbkJsdXIoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkJsdXIoKTogdm9pZCB7XG5cdFx0dGhpcy5pc0luYWN0aXZlID0gdHJ1ZTtcblx0XHR0aGlzLnVwZGF0ZVN0eWxlcygpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuaXNJbmFjdGl2ZSA9IGZhbHNlO1xuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cdH1cblxuXHR1cGRhdGVQcm9wZXJ0aWVzKF9wcm9wZXJ0aWVzOiBJVGl0bGVQcm9wZXJ0aWVzKTogdm9pZCB7XG5cdFx0Ly8gTm8gd2luZG93IHRpdGxlIHRvIHVwZGF0ZSBpbiBzaW1wbGlmaWVkIHRpdGxlYmFyXG5cdH1cblxuXHRyZWdpc3RlclZhcmlhYmxlcyhfdmFyaWFibGVzOiBJVGl0bGVWYXJpYWJsZVtdKTogdm9pZCB7XG5cdFx0Ly8gTm8gd2luZG93IHRpdGxlIHZhcmlhYmxlcyBpbiBzaW1wbGlmaWVkIHRpdGxlYmFyXG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKF9vcHRpb25zOiB7IGNvbXBhY3Q6IGJvb2xlYW4gfSk6IHZvaWQge1xuXHRcdC8vIE5vIGNvbXBhY3QgbW9kZSBzdXBwb3J0IGluIGFnZW50IHNlc3Npb25zIHRpdGxlYmFyXG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlQ29udGVudEFyZWEocGFyZW50OiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0XHR0aGlzLmVsZW1lbnQgPSBwYXJlbnQ7XG5cdFx0dGhpcy5yb290Q29udGFpbmVyID0gYXBwZW5kKHBhcmVudCwgJCgnLnRpdGxlYmFyLWNvbnRhaW5lci5zZXNzaW9ucy10aXRsZWJhci1jb250YWluZXIuaGFzLWNlbnRlcicpKTtcblxuXHRcdC8vIERyYWdnYWJsZSByZWdpb25cblx0XHRwcmVwZW5kKHRoaXMucm9vdENvbnRhaW5lciwgJCgnZGl2LnRpdGxlYmFyLWRyYWctcmVnaW9uJykpO1xuXG5cdFx0dGhpcy5sZWZ0Q29udGVudCA9IGFwcGVuZCh0aGlzLnJvb3RDb250YWluZXIsICQoJy50aXRsZWJhci1sZWZ0JykpO1xuXHRcdHRoaXMuY2VudGVyQ29udGVudCA9IGFwcGVuZCh0aGlzLnJvb3RDb250YWluZXIsICQoJy50aXRsZWJhci1jZW50ZXInKSk7XG5cdFx0dGhpcy5yaWdodENvbnRlbnQgPSBhcHBlbmQodGhpcy5yb290Q29udGFpbmVyLCAkKCcudGl0bGViYXItcmlnaHQnKSk7XG5cblx0XHQvLyBXaW5kb3cgQ29udHJvbHMgQ29udGFpbmVyIChtdXN0IGJlIGJlZm9yZSBsZWZ0IHRvb2xiYXIgZm9yIGNvcnJlY3Qgb3JkZXJpbmcpXG5cdFx0aWYgKCFoYXNOYXRpdmVUaXRsZWJhcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLnRpdGxlQmFyU3R5bGUpKSB7XG5cdFx0XHRsZXQgcHJpbWFyeVdpbmRvd0NvbnRyb2xzTG9jYXRpb24gPSBpc01hY2ludG9zaCA/ICdsZWZ0JyA6ICdyaWdodCc7XG5cdFx0XHRpZiAoaXNNYWNpbnRvc2ggJiYgaXNOYXRpdmUpIHtcblx0XHRcdFx0Y29uc3QgbG9jYWxlSW5mbyA9IHNhZmVJbnRsLkxvY2FsZShwbGF0Zm9ybUxvY2FsZSkudmFsdWU7XG5cdFx0XHRcdGNvbnN0IHRleHRJbmZvID0gKGxvY2FsZUluZm8gYXMgeyB0ZXh0SW5mbz86IHsgZGlyZWN0aW9uPzogc3RyaW5nIH0gfSkudGV4dEluZm87XG5cdFx0XHRcdGlmICh0ZXh0SW5mbz8uZGlyZWN0aW9uID09PSAncnRsJykge1xuXHRcdFx0XHRcdHByaW1hcnlXaW5kb3dDb250cm9sc0xvY2F0aW9uID0gJ3JpZ2h0Jztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNNYWNpbnRvc2ggJiYgaXNOYXRpdmUgJiYgcHJpbWFyeVdpbmRvd0NvbnRyb2xzTG9jYXRpb24gPT09ICdsZWZ0Jykge1xuXHRcdFx0XHQvLyBtYWNPUyBuYXRpdmU6IHRyYWZmaWMgbGlnaHRzIGFyZSByZW5kZXJlZCBieSB0aGUgT1MgYXQgdGhlIHRvcC1sZWZ0IGNvcm5lci5cblx0XHRcdFx0Ly8gQWRkIGEgZml4ZWQtd2lkdGggc3BhY2VyIHRvIHB1c2ggY29udGVudCBwYXN0IHRoZSB0cmFmZmljIGxpZ2h0cy5cblx0XHRcdFx0Y29uc3Qgc3BhY2VyID0gYXBwZW5kKHRoaXMubGVmdENvbnRlbnQsICQoJ2Rpdi53aW5kb3ctY29udHJvbHMtY29udGFpbmVyJykpO1xuXG5cdFx0XHRcdC8vIEhpZGUgc3BhY2VyIGluIGZ1bGxzY3JlZW4gKHRyYWZmaWMgbGlnaHRzIGFyZSBub3Qgc2hvd24pXG5cdFx0XHRcdGNvbnN0IHVwZGF0ZVNwYWNlclZpc2liaWxpdHkgPSAoKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgZnVsbHNjcmVlbiA9IGlzRnVsbHNjcmVlbihtYWluV2luZG93KTtcblx0XHRcdFx0XHRzcGFjZXIuc3R5bGUuZGlzcGxheSA9IGZ1bGxzY3JlZW4gPyAnbm9uZScgOiAnJztcblx0XHRcdFx0XHR0aGlzLmxlZnRTcGFjZXJXaWR0aCA9IGZ1bGxzY3JlZW4gPyAwIDogNzA7XG5cdFx0XHRcdH07XG5cdFx0XHRcdHVwZGF0ZVNwYWNlclZpc2liaWxpdHkoKTtcblx0XHRcdFx0c3BhY2VyLnN0eWxlLndpZHRoID0gYCR7dGhpcy5sZWZ0U3BhY2VyV2lkdGh9cHhgO1xuXHRcdFx0XHRzcGFjZXIuc3R5bGUuZmxleFNocmluayA9ICcwJztcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIob25EaWRDaGFuZ2VGdWxsc2NyZWVuKHdpbmRvd0lkID0+IHtcblx0XHRcdFx0XHRpZiAod2luZG93SWQgPT09IGdldFdpbmRvd0lkKG1haW5XaW5kb3cpKSB7XG5cdFx0XHRcdFx0XHR1cGRhdGVTcGFjZXJWaXNpYmlsaXR5KCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9IGVsc2UgaWYgKGdldFdpbmRvd0NvbnRyb2xzU3R5bGUodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSkgPT09IFdpbmRvd0NvbnRyb2xzU3R5bGUuSElEREVOKSB7XG5cdFx0XHRcdC8vIGNvbnRyb2xzIGV4cGxpY2l0bHkgZGlzYWJsZWRcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMud2luZG93Q29udHJvbHNDb250YWluZXIgPSBhcHBlbmQocHJpbWFyeVdpbmRvd0NvbnRyb2xzTG9jYXRpb24gPT09ICdsZWZ0JyA/IHRoaXMubGVmdENvbnRlbnQgOiB0aGlzLnJpZ2h0Q29udGVudCwgJCgnZGl2LndpbmRvdy1jb250cm9scy1jb250YWluZXInKSk7XG5cdFx0XHRcdGlmIChpc1dlYikge1xuXHRcdFx0XHRcdGFwcGVuZChwcmltYXJ5V2luZG93Q29udHJvbHNMb2NhdGlvbiA9PT0gJ2xlZnQnID8gdGhpcy5yaWdodENvbnRlbnQgOiB0aGlzLmxlZnRDb250ZW50LCAkKCdkaXYud2luZG93LWNvbnRyb2xzLWNvbnRhaW5lcicpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpc1dDT0VuYWJsZWQoKSkge1xuXHRcdFx0XHRcdHRoaXMud2luZG93Q29udHJvbHNDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnd2NvLWVuYWJsZWQnKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIExlZnQgdG9vbGJhciAoZHJpdmVuIGJ5IE1lbnVzLlRpdGxlQmFyTGVmdCwgcmVuZGVyZWQgYWZ0ZXIgd2luZG93IGNvbnRyb2xzIHZpYSBDU1Mgb3JkZXIpXG5cdFx0dGhpcy5sZWZ0VG9vbGJhckNvbnRhaW5lciA9IGFwcGVuZCh0aGlzLmxlZnRDb250ZW50LCAkKCdkaXYubGVmdC10b29sYmFyLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCB0aGlzLmxlZnRUb29sYmFyQ29udGFpbmVyLCBNZW51cy5UaXRsZUJhckxlZnRMYXlvdXQsIHtcblx0XHRcdGNvbnRleHRNZW51OiBNZW51cy5UaXRsZUJhckNvbnRleHQsXG5cdFx0XHR0ZWxlbWV0cnlTb3VyY2U6ICd0aXRsZVBhcnQubGVmdCcsXG5cdFx0XHRoaWRkZW5JdGVtU3RyYXRlZ3k6IEhpZGRlbkl0ZW1TdHJhdGVneS5Ob0hpZGUsXG5cdFx0XHR0b29sYmFyT3B0aW9uczogeyBwcmltYXJ5R3JvdXA6ICgpID0+IHRydWUgfSxcblx0XHR9KSk7XG5cblx0XHQvLyBDZW50ZXIgc2VjdGlvbjogW25hdiB0b29sYmFyXSBbY29tbWFuZCBjZW50ZXIgYm94XSBbYWN0aW9ucyB0b29sYmFyXVxuXHRcdC8vIEFsbCBsaXZlIGluc2lkZSAudGl0bGViYXItY2VudGVyIHNvIHRoZSBjbHVzdGVyIGlzIHdpbmRvdy1jZW50ZXJlZC5cblxuXHRcdC8vIE5hdmlnYXRpb24gdG9vbGJhciAoQmFjay9Gb3J3YXJkKSwgcmVuZGVyZWQgbGVmdCBvZiB0aGUgY29tbWFuZCBjZW50ZXIuXG5cdFx0Y29uc3QgY2VudGVyTmF2Q29udGFpbmVyID0gYXBwZW5kKHRoaXMuY2VudGVyQ29udGVudCwgJCgnZGl2LnRpdGxlYmFyLWFjdGlvbnMtY29udGFpbmVyLnRpdGxlYmFyLWNlbnRlci1uYXYtY29udGFpbmVyJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGNlbnRlck5hdkNvbnRhaW5lciwgTWVudXMuVGl0bGVCYXJDZW50ZXJMZWZ0LCB7XG5cdFx0XHRjb250ZXh0TWVudTogTWVudXMuVGl0bGVCYXJDb250ZXh0LFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiAndGl0bGVQYXJ0LmNlbnRlckxlZnQnLFxuXHRcdFx0dG9vbGJhck9wdGlvbnM6IHsgcHJpbWFyeUdyb3VwOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSkpO1xuXG5cdFx0Ly8gQ2VudGVyIHRvb2xiYXIgLSBjb21tYW5kIGNlbnRlciAocmVuZGVycyBzZXNzaW9uIHBpY2tlciB2aWEgSUFjdGlvblZpZXdJdGVtU2VydmljZSlcblx0XHQvLyBVc2VzIC53aW5kb3ctdGl0bGUgPiAuY29tbWFuZC1jZW50ZXIgbmVzdGluZyB0byBtYXRjaCBkZWZhdWx0IHdvcmtiZW5jaCBDU1Mgc2VsZWN0b3JzXG5cdFx0Y29uc3Qgd2luZG93VGl0bGUgPSBhcHBlbmQodGhpcy5jZW50ZXJDb250ZW50LCAkKCdkaXYud2luZG93LXRpdGxlJykpO1xuXHRcdGNvbnN0IGNlbnRlclRvb2xiYXJDb250YWluZXIgPSBhcHBlbmQod2luZG93VGl0bGUsICQoJ2Rpdi5jb21tYW5kLWNlbnRlcicpKTtcblx0XHRjb25zdCBjZW50ZXJUb29sYmFyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgY2VudGVyVG9vbGJhckNvbnRhaW5lciwgTWVudXMuQ29tbWFuZENlbnRlciwge1xuXHRcdFx0Y29udGV4dE1lbnU6IE1lbnVzLlRpdGxlQmFyQ29udGV4dCxcblx0XHRcdGhpZGRlbkl0ZW1TdHJhdGVneTogSGlkZGVuSXRlbVN0cmF0ZWd5Lk5vSGlkZSxcblx0XHRcdHRlbGVtZXRyeVNvdXJjZTogJ2NvbW1hbmRDZW50ZXInLFxuXHRcdFx0dG9vbGJhck9wdGlvbnM6IHsgcHJpbWFyeUdyb3VwOiAoKSA9PiB0cnVlIH0sXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c1NvbWUoY29tbWFuZENlbnRlckNvbnRleHRLZXlzKSkge1xuXHRcdFx0XHRjZW50ZXJUb29sYmFyLnJlZnJlc2goKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBBY3Rpb25zIHRvb2xiYXIgKE9wZW4gaW4gVlMgQ29kZSksIHJlbmRlcmVkIHJpZ2h0IG9mIHRoZSBjb21tYW5kIGNlbnRlci5cblx0XHRjb25zdCBjZW50ZXJBY3Rpb25zQ29udGFpbmVyID0gYXBwZW5kKHRoaXMuY2VudGVyQ29udGVudCwgJCgnZGl2LnRpdGxlYmFyLWFjdGlvbnMtY29udGFpbmVyLnRpdGxlYmFyLWNlbnRlci1hY3Rpb25zLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCBjZW50ZXJBY3Rpb25zQ29udGFpbmVyLCBNZW51cy5UaXRsZUJhckNlbnRlclJpZ2h0LCB7XG5cdFx0XHRjb250ZXh0TWVudTogTWVudXMuVGl0bGVCYXJDb250ZXh0LFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiAndGl0bGVQYXJ0LmNlbnRlclJpZ2h0Jyxcblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHByaW1hcnlHcm91cDogKCkgPT4gdHJ1ZSB9LFxuXHRcdH0pKTtcblxuXHRcdC8vIFJpZ2h0IHRvb2xiYXIgKGRyaXZlbiBieSBNZW51cy5UaXRsZUJhclJpZ2h0TGF5b3V0IC0gaW5jbHVkZXMgbGF5b3V0IGFjdGlvbnMpXG5cdFx0Y29uc3QgcmlnaHRUb29sYmFyQ29udGFpbmVyID0gcHJlcGVuZCh0aGlzLnJpZ2h0Q29udGVudCwgJCgnZGl2LnRpdGxlYmFyLWFjdGlvbnMtY29udGFpbmVyLnRpdGxlYmFyLXJpZ2h0LWxheW91dC1jb250YWluZXInKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgcmlnaHRUb29sYmFyQ29udGFpbmVyLCBNZW51cy5UaXRsZUJhclJpZ2h0TGF5b3V0LCB7XG5cdFx0XHRjb250ZXh0TWVudTogTWVudXMuVGl0bGVCYXJDb250ZXh0LFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiAndGl0bGVQYXJ0LnJpZ2h0Jyxcblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHByaW1hcnlHcm91cDogKCkgPT4gdHJ1ZSB9LFxuXHRcdH0pKTtcblxuXHRcdC8vIFNlc3Npb24gdGl0bGUgYWN0aW9ucyB0b29sYmFyIChiZWZvcmUgcmlnaHQgdG9vbGJhcilcblx0XHRjb25zdCBzZXNzaW9uQWN0aW9uc0NvbnRhaW5lciA9IHByZXBlbmQodGhpcy5yaWdodENvbnRlbnQsICQoJ2Rpdi50aXRsZWJhci1hY3Rpb25zLWNvbnRhaW5lci50aXRsZWJhci1zZXNzaW9uLWFjdGlvbnMtY29udGFpbmVyJykpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIHNlc3Npb25BY3Rpb25zQ29udGFpbmVyLCBNZW51cy5UaXRsZUJhclNlc3Npb25NZW51LCB7XG5cdFx0XHRjb250ZXh0TWVudTogTWVudXMuVGl0bGVCYXJDb250ZXh0LFxuXHRcdFx0aGlkZGVuSXRlbVN0cmF0ZWd5OiBIaWRkZW5JdGVtU3RyYXRlZ3kuTm9IaWRlLFxuXHRcdFx0dGVsZW1ldHJ5U291cmNlOiAndGl0bGVQYXJ0LnNlc3Npb25BY3Rpb25zJyxcblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHByaW1hcnlHcm91cDogKCkgPT4gdHJ1ZSB9LFxuXHRcdH0pKTtcblxuXHRcdC8vIENvbnRleHQgbWVudSBvbiB0aGUgdGl0bGViYXJcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5yb290Q29udGFpbmVyLCBFdmVudFR5cGUuQ09OVEVYVF9NRU5VLCBlID0+IHtcblx0XHRcdEV2ZW50SGVscGVyLnN0b3AoZSk7XG5cdFx0XHR0aGlzLm9uQ29udGV4dE1lbnUoZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy51cGRhdGVTdHlsZXMoKTtcblxuXHRcdHJldHVybiB0aGlzLmVsZW1lbnQ7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVTdHlsZXMoKTogdm9pZCB7XG5cdFx0c3VwZXIudXBkYXRlU3R5bGVzKCk7XG5cblx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHR0aGlzLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnaW5hY3RpdmUnLCB0aGlzLmlzSW5hY3RpdmUpO1xuXG5cdFx0XHRjb25zdCB0aXRsZUJhckJhY2tncm91bmQgPSB0aGlzLmdldENvbG9yKGFnZW50c0JhY2tncm91bmQpOyAvLyB0cmFuc3BhcmVudCBiYWNrZ3JvdW5kIG5vdCBzdXBwb3J0ZWQgb24gc29tZSBwbGF0Zm9ybXNcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSB0aXRsZUJhckJhY2tncm91bmQgfHwgJyc7XG5cblx0XHRcdGNvbnN0IHRpdGxlRm9yZWdyb3VuZCA9IHRoaXMuZ2V0Q29sb3IoYWdlbnRzUGFuZWxGb3JlZ3JvdW5kKTtcblx0XHRcdHRoaXMuZWxlbWVudC5zdHlsZS5jb2xvciA9IHRpdGxlRm9yZWdyb3VuZCB8fCAnJztcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25Db250ZXh0TWVudShlOiBNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRNb3VzZUV2ZW50KGdldFdpbmRvdyh0aGlzLmVsZW1lbnQpLCBlKTtcblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBldmVudCxcblx0XHRcdG1lbnVJZDogTWVudXMuVGl0bGVCYXJDb250ZXh0LFxuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6IHRoaXMuY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRkb21Gb3JTaGFkb3dSb290OiBpc01hY2ludG9zaCAmJiBpc05hdGl2ZSA/IGV2ZW50LnRhcmdldCA6IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0IGhhc1pvb21hYmxlRWxlbWVudHMoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRydWU7IC8vIHNlc3Npb25zIHRpdGxlYmFyIGFsd2F5cyBoYXMgY29tbWFuZCBjZW50ZXIgYW5kIHRvb2xiYXIgYWN0aW9uc1xuXHR9XG5cblx0Z2V0IHByZXZlbnRab29tKCk6IGJvb2xlYW4ge1xuXHRcdC8vIFByZXZlbnQgem9vbWluZyBiZWhhdmlvciBpZiBhbnkgb2YgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG5cdFx0Ly8gMS4gU2hyaW5raW5nIGJlbG93IHRoZSB3aW5kb3cgY29udHJvbCBzaXplICh6b29tIDwgMSlcblx0XHQvLyAyLiBObyBjdXN0b20gaXRlbXMgYXJlIHByZXNlbnQgaW4gdGhlIHRpdGxlIGJhclxuXHRcdHJldHVybiBnZXRab29tRmFjdG9yKGdldFdpbmRvdyh0aGlzLmVsZW1lbnQpKSA8IDEgfHwgIXRoaXMuaGFzWm9vbWFibGVFbGVtZW50cztcblx0fVxuXG5cdG92ZXJyaWRlIGxheW91dCh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMudXBkYXRlTGF5b3V0KCk7XG5cdFx0c3VwZXIubGF5b3V0Q29udGVudHMod2lkdGgsIGhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUxheW91dCgpOiB2b2lkIHtcblx0XHRpZiAoIWhhc0N1c3RvbVRpdGxlYmFyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMudGl0bGVCYXJTdHlsZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB6b29tRmFjdG9yID0gZ2V0Wm9vbUZhY3RvcihnZXRXaW5kb3codGhpcy5lbGVtZW50KSk7XG5cdFx0dGhpcy5lbGVtZW50LnN0eWxlLnNldFByb3BlcnR5KCctLXpvb20tZmFjdG9yJywgem9vbUZhY3Rvci50b1N0cmluZygpKTtcblx0XHR0aGlzLnJvb3RDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY291bnRlci16b29tJywgdGhpcy5wcmV2ZW50Wm9vbSk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHQodGhpcy5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ1t0YWJpbmRleF06bm90KFt0YWJpbmRleD1cIi0xXCJdKScpIGFzIEhUTUxFbGVtZW50IHwgbnVsbCk/LmZvY3VzKCk7XG5cdH1cblxuXHR0b0pTT04oKTogb2JqZWN0IHtcblx0XHRyZXR1cm4geyB0eXBlOiBQYXJ0cy5USVRMRUJBUl9QQVJUIH07XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uV2lsbERpc3Bvc2UuZmlyZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIE1haW4gYWdlbnQgc2Vzc2lvbnMgdGl0bGViYXIgcGFydCAoZm9yIHRoZSBtYWluIHdpbmRvdykuXG4gKi9cbmV4cG9ydCBjbGFzcyBNYWluVGl0bGViYXJQYXJ0IGV4dGVuZHMgVGl0bGViYXJQYXJ0IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihQYXJ0cy5USVRMRUJBUl9QQVJULCBtYWluV2luZG93LCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbGF5b3V0U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGhvc3RTZXJ2aWNlKTtcblx0fVxufVxuXG4vKipcbiAqIEF1eGlsaWFyeSBhZ2VudCBzZXNzaW9ucyB0aXRsZWJhciBwYXJ0IChmb3IgYXV4aWxpYXJ5IHdpbmRvd3MpLlxuICovXG5leHBvcnQgY2xhc3MgQXV4aWxpYXJ5VGl0bGViYXJQYXJ0IGV4dGVuZHMgVGl0bGViYXJQYXJ0IGltcGxlbWVudHMgSUF1eGlsaWFyeVRpdGxlYmFyUGFydCB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgQ09VTlRFUiA9IDE7XG5cblx0Z2V0IGhlaWdodCgpIHsgcmV0dXJuIHRoaXMubWluaW11bUhlaWdodDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtYWluVGl0bGViYXI6IFRpdGxlYmFyUGFydCxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBsYXlvdXRTZXJ2aWNlOiBJV29ya2JlbmNoTGF5b3V0U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRjb25zdCBpZCA9IEF1eGlsaWFyeVRpdGxlYmFyUGFydC5DT1VOVEVSKys7XG5cdFx0c3VwZXIoYHdvcmtiZW5jaC5wYXJ0cy5hdXhpbGlhcnlUaXRsZS4ke2lkfWAsIGdldFdpbmRvdyhjb250YWluZXIpLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSwgbGF5b3V0U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIGhvc3RTZXJ2aWNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBwcmV2ZW50Wm9vbSgpOiBib29sZWFuIHtcblx0XHQvLyBQcmV2ZW50IHpvb21pbmcgYmVoYXZpb3IgaWYgYW55IG9mIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuXHRcdC8vIDEuIFNocmlua2luZyBiZWxvdyB0aGUgd2luZG93IGNvbnRyb2wgc2l6ZSAoem9vbSA8IDEpXG5cdFx0Ly8gMi4gTm8gY3VzdG9tIGl0ZW1zIGFyZSBwcmVzZW50IGluIHRoZSBtYWluIHRpdGxlIGJhclxuXHRcdC8vIFRoZSBhdXhpbGlhcnkgdGl0bGUgYmFyIG5ldmVyIGNvbnRhaW5zIGFueSB6b29tYWJsZSBpdGVtcyBpdHNlbGYsXG5cdFx0Ly8gYnV0IHdlIHdhbnQgdG8gbWF0Y2ggdGhlIGJlaGF2aW9yIG9mIHRoZSBtYWluIHRpdGxlIGJhci5cblx0XHRyZXR1cm4gZ2V0Wm9vbUZhY3RvcihnZXRXaW5kb3codGhpcy5lbGVtZW50KSkgPCAxIHx8ICF0aGlzLm1haW5UaXRsZWJhci5oYXNab29tYWJsZUVsZW1lbnRzO1xuXHR9XG59XG5cbi8qKlxuICogQWdlbnQgU2Vzc2lvbnMgdGl0bGUgc2VydmljZSAtIG1hbmFnZXMgdGhlIHRpdGxlYmFyIHBhcnRzLlxuICovXG5leHBvcnQgY2xhc3MgVGl0bGVTZXJ2aWNlIGV4dGVuZHMgTXVsdGlXaW5kb3dQYXJ0czxUaXRsZWJhclBhcnQ+IGltcGxlbWVudHMgSVRpdGxlU2VydmljZSB7XG5cblx0ZGVjbGFyZSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgbWFpblBhcnQ6IFRpdGxlYmFyUGFydDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoJ3dvcmtiZW5jaC5hZ2VudFNlc3Npb25zVGl0bGVTZXJ2aWNlJywgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHR0aGlzLm1haW5QYXJ0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5jcmVhdGVNYWluVGl0bGViYXJQYXJ0KCkpO1xuXHRcdHRoaXMub25NZW51YmFyVmlzaWJpbGl0eUNoYW5nZSA9IHRoaXMubWFpblBhcnQub25NZW51YmFyVmlzaWJpbGl0eUNoYW5nZTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlZ2lzdGVyUGFydCh0aGlzLm1haW5QYXJ0KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlTWFpblRpdGxlYmFyUGFydCgpOiBUaXRsZWJhclBhcnQge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1haW5UaXRsZWJhclBhcnQpO1xuXHR9XG5cblx0Ly8jcmVnaW9uIEF1eGlsaWFyeSBUaXRsZWJhciBQYXJ0c1xuXG5cdGNyZWF0ZUF1eGlsaWFyeVRpdGxlYmFyUGFydChjb250YWluZXI6IEhUTUxFbGVtZW50LCBlZGl0b3JHcm91cHNDb250YWluZXI6IElFZGl0b3JHcm91cHNDb250YWluZXIsIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UpOiBJQXV4aWxpYXJ5VGl0bGViYXJQYXJ0IHtcblx0XHRjb25zdCB0aXRsZWJhclBhcnRDb250YWluZXIgPSAkKCcucGFydC50aXRsZWJhcicsIHsgcm9sZTogJ25vbmUnIH0pO1xuXHRcdHRpdGxlYmFyUGFydENvbnRhaW5lci5zdHlsZS5wb3NpdGlvbiA9ICdyZWxhdGl2ZSc7XG5cdFx0Y29udGFpbmVyLmluc2VydEJlZm9yZSh0aXRsZWJhclBhcnRDb250YWluZXIsIGNvbnRhaW5lci5maXJzdENoaWxkKTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3QgdGl0bGViYXJQYXJ0ID0gdGhpcy5kb0NyZWF0ZUF1eGlsaWFyeVRpdGxlYmFyUGFydCh0aXRsZWJhclBhcnRDb250YWluZXIsIGVkaXRvckdyb3Vwc0NvbnRhaW5lciwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0aGlzLnJlZ2lzdGVyUGFydCh0aXRsZWJhclBhcnQpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5ydW5BbmRTdWJzY3JpYmUodGl0bGViYXJQYXJ0Lm9uRGlkQ2hhbmdlLCAoKSA9PiB0aXRsZWJhclBhcnRDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gYCR7dGl0bGViYXJQYXJ0LmhlaWdodH1weGApKTtcblx0XHR0aXRsZWJhclBhcnQuY3JlYXRlKHRpdGxlYmFyUGFydENvbnRhaW5lcik7XG5cblx0XHRFdmVudC5vbmNlKHRpdGxlYmFyUGFydC5vbldpbGxEaXNwb3NlKSgoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpO1xuXG5cdFx0cmV0dXJuIHRpdGxlYmFyUGFydDtcblx0fVxuXG5cdHByb3RlY3RlZCBkb0NyZWF0ZUF1eGlsaWFyeVRpdGxlYmFyUGFydChjb250YWluZXI6IEhUTUxFbGVtZW50LCBfZWRpdG9yR3JvdXBzQ29udGFpbmVyOiBJRWRpdG9yR3JvdXBzQ29udGFpbmVyLCBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlKTogVGl0bGViYXJQYXJ0ICYgSUF1eGlsaWFyeVRpdGxlYmFyUGFydCB7XG5cdFx0cmV0dXJuIGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEF1eGlsaWFyeVRpdGxlYmFyUGFydCwgY29udGFpbmVyLCB0aGlzLm1haW5QYXJ0KTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBTZXJ2aWNlIEltcGxlbWVudGF0aW9uXG5cblx0cmVhZG9ubHkgb25NZW51YmFyVmlzaWJpbGl0eUNoYW5nZTogRXZlbnQ8Ym9vbGVhbj47XG5cblx0dXBkYXRlUHJvcGVydGllcyhwcm9wZXJ0aWVzOiBJVGl0bGVQcm9wZXJ0aWVzKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHRoaXMucGFydHMpIHtcblx0XHRcdHBhcnQudXBkYXRlUHJvcGVydGllcyhwcm9wZXJ0aWVzKTtcblx0XHR9XG5cdH1cblxuXHRyZWdpc3RlclZhcmlhYmxlcyh2YXJpYWJsZXM6IElUaXRsZVZhcmlhYmxlW10pOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGhpcy5wYXJ0cykge1xuXHRcdFx0cGFydC5yZWdpc3RlclZhcmlhYmxlcyh2YXJpYWJsZXMpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3dpbmRvd1RpdGxlOiBXaW5kb3dUaXRsZSB8IHVuZGVmaW5lZDtcblxuXHRnZXQgd2luZG93VGl0bGUoKTogV2luZG93VGl0bGUge1xuXHRcdC8vIFRoZSBBZ2VudHMgd2luZG93IHRpdGxlIGJhciBkb2VzIG5vdCByZW5kZXIgYHdpbmRvdy50aXRsZWAsIHNvIHdlXG5cdFx0Ly8gbGF6aWx5IGNvbnN0cnVjdCBhIGBXaW5kb3dUaXRsZWAgb25seSB3aGVuIGEgY29uc3VtZXIgKGUuZy4gYSBjdXN0b21cblx0XHQvLyBjb21tYW5kIGNlbnRlciB3aWRnZXQpIGFjdHVhbGx5IGFza3MgZm9yIG9uZS5cblx0XHRpZiAoIXRoaXMuX3dpbmRvd1RpdGxlKSB7XG5cdFx0XHR0aGlzLl93aW5kb3dUaXRsZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV2luZG93VGl0bGUsIG1haW5XaW5kb3cpKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3dpbmRvd1RpdGxlO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxPQUFPO0FBQ1AsU0FBUyxrQkFBa0IsWUFBWTtBQUV2QyxTQUFTLGVBQWUsY0FBYyx3QkFBd0IsY0FBYyw2QkFBNkI7QUFDekcsU0FBUyxtQkFBbUIsbUJBQW1CLGdDQUErQyxrQkFBa0Isd0JBQXdCLDJCQUEyQjtBQUNuSyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0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
