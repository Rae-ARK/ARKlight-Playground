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
import { getZoomLevel } from "../../../../base/browser/browser.js";
import { $, Dimension, EventHelper, EventType, ModifierKeyEmitter, addDisposableListener, copyAttributes, createLinkElement, createMetaElement, getActiveWindow, getClientArea, getWindowId, isHTMLElement, position, registerWindow, sharedMutationObserver, trackAttributes } from "../../../../base/browser/dom.js";
import { cloneGlobalStylesheets, isGlobalStylesheet } from "../../../../base/browser/domStylesheets.js";
import { ensureCodeWindow, mainWindow } from "../../../../base/browser/window.js";
import { coalesce } from "../../../../base/common/arrays.js";
import { Barrier } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { mark } from "../../../../base/common/performance.js";
import { isFirefox, isWeb } from "../../../../base/common/platform.js";
import Severity from "../../../../base/common/severity.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { DEFAULT_AUX_WINDOW_SIZE, WindowMinimumSize } from "../../../../platform/window/common/window.js";
import { BaseWindow } from "../../../browser/window.js";
import { IWorkbenchEnvironmentService } from "../../environment/common/environmentService.js";
import { IHostService } from "../../host/browser/host.js";
import { IWorkbenchLayoutService } from "../../layout/browser/layoutService.js";
const IAuxiliaryWindowService = createDecorator("auxiliaryWindowService");
var AuxiliaryWindowMode = /* @__PURE__ */ ((AuxiliaryWindowMode2) => {
  AuxiliaryWindowMode2[AuxiliaryWindowMode2["Maximized"] = 0] = "Maximized";
  AuxiliaryWindowMode2[AuxiliaryWindowMode2["Normal"] = 1] = "Normal";
  AuxiliaryWindowMode2[AuxiliaryWindowMode2["Fullscreen"] = 2] = "Fullscreen";
  return AuxiliaryWindowMode2;
})(AuxiliaryWindowMode || {});
const DEFAULT_AUX_WINDOW_DIMENSIONS = new Dimension(DEFAULT_AUX_WINDOW_SIZE.width, DEFAULT_AUX_WINDOW_SIZE.height);
let AuxiliaryWindow = class extends BaseWindow {
  constructor(window, container, stylesHaveLoaded, configurationService, hostService, environmentService, contextMenuService, layoutService) {
    super(window, void 0, hostService, environmentService, contextMenuService, layoutService);
    this.window = window;
    this.container = container;
    this.configurationService = configurationService;
    this._onWillLayout = this._register(new Emitter());
    this.onWillLayout = this._onWillLayout.event;
    this._onDidLayout = this._register(new Emitter());
    this.onDidLayout = this._onDidLayout.event;
    this._onBeforeUnload = this._register(new Emitter());
    this.onBeforeUnload = this._onBeforeUnload.event;
    this._onUnload = this._register(new Emitter());
    this.onUnload = this._onUnload.event;
    this._onWillDispose = this._register(new Emitter());
    this.onWillDispose = this._onWillDispose.event;
    this.compact = false;
    this.whenStylesHaveLoaded = stylesHaveLoaded.wait().then(() => void 0);
    this.registerListeners();
  }
  updateOptions(options) {
    this.compact = options.compact;
  }
  registerListeners() {
    this._register(addDisposableListener(this.window, EventType.BEFORE_UNLOAD, (e) => this.handleBeforeUnload(e)));
    this._register(addDisposableListener(this.window, EventType.UNLOAD, () => this.handleUnload()));
    this._register(addDisposableListener(this.window, "unhandledrejection", (e) => {
      onUnexpectedError(e.reason);
      e.preventDefault();
    }));
    this._register(addDisposableListener(this.window, EventType.RESIZE, () => this.layout()));
    this._register(addDisposableListener(this.container, EventType.SCROLL, () => this.container.scrollTop = 0));
    if (isWeb) {
      this._register(addDisposableListener(this.container, EventType.DROP, (e) => EventHelper.stop(e, true)));
      this._register(addDisposableListener(this.container, EventType.WHEEL, (e) => e.preventDefault(), { passive: false }));
      this._register(addDisposableListener(this.container, EventType.CONTEXT_MENU, (e) => EventHelper.stop(e, true)));
    } else {
      this._register(addDisposableListener(this.window.document.body, EventType.DRAG_OVER, (e) => EventHelper.stop(e)));
      this._register(addDisposableListener(this.window.document.body, EventType.DROP, (e) => EventHelper.stop(e)));
    }
  }
  handleBeforeUnload(e) {
    let veto;
    this._onBeforeUnload.fire({
      veto(reason) {
        if (reason) {
          veto = reason;
        }
      }
    });
    if (veto) {
      this.handleVetoBeforeClose(e, veto);
      return;
    }
    const confirmBeforeCloseSetting = this.configurationService.getValue("window.confirmBeforeClose");
    const confirmBeforeClose = confirmBeforeCloseSetting === "always" || confirmBeforeCloseSetting === "keyboardOnly" && ModifierKeyEmitter.getInstance().isModifierPressed;
    if (confirmBeforeClose) {
      this.confirmBeforeClose(e);
    }
  }
  handleVetoBeforeClose(e, reason) {
    this.preventUnload(e);
  }
  preventUnload(e) {
    e.preventDefault();
    e.returnValue = localize("lifecycleVeto", "Changes that you made may not be saved. Please check press 'Cancel' and try again.");
  }
  confirmBeforeClose(e) {
    this.preventUnload(e);
  }
  handleUnload() {
    this._onUnload.fire();
  }
  layout() {
    const dimension = getClientArea(this.window.document.body, DEFAULT_AUX_WINDOW_DIMENSIONS, this.container);
    this._onWillLayout.fire(dimension);
    this._onDidLayout.fire(dimension);
  }
  createState() {
    return {
      bounds: {
        x: this.window.screenX,
        y: this.window.screenY,
        width: this.window.outerWidth,
        height: this.window.outerHeight
      },
      zoomLevel: getZoomLevel(this.window),
      compact: this.compact
    };
  }
  dispose() {
    if (this._store.isDisposed) {
      return;
    }
    this._onWillDispose.fire();
    super.dispose();
  }
};
AuxiliaryWindow = __decorateClass([
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IHostService),
  __decorateParam(5, IWorkbenchEnvironmentService),
  __decorateParam(6, IContextMenuService),
  __decorateParam(7, IWorkbenchLayoutService)
], AuxiliaryWindow);
let BrowserAuxiliaryWindowService = class extends Disposable {
  constructor(layoutService, dialogService, configurationService, telemetryService, hostService, environmentService, contextMenuService) {
    super();
    this.layoutService = layoutService;
    this.dialogService = dialogService;
    this.configurationService = configurationService;
    this.telemetryService = telemetryService;
    this.hostService = hostService;
    this.environmentService = environmentService;
    this.contextMenuService = contextMenuService;
    // start from the main window ID + 1
    this._onDidOpenAuxiliaryWindow = this._register(new Emitter());
    this.onDidOpenAuxiliaryWindow = this._onDidOpenAuxiliaryWindow.event;
    this.windows = /* @__PURE__ */ new Map();
  }
  async open(options) {
    mark("code/auxiliaryWindow/willOpen");
    const targetWindow = await this.openWindow(options);
    if (!targetWindow) {
      throw new Error(localize("unableToOpenWindowError", "Unable to open a new window."));
    }
    const resolvedWindowId = await this.resolveWindowId(targetWindow);
    ensureCodeWindow(targetWindow, resolvedWindowId);
    const containerDisposables = new DisposableStore();
    const { container, stylesLoaded } = this.createContainer(targetWindow, containerDisposables, options);
    const auxiliaryWindow = this.createAuxiliaryWindow(targetWindow, container, stylesLoaded);
    auxiliaryWindow.updateOptions({ compact: options?.compact ?? false });
    const registryDisposables = new DisposableStore();
    this.windows.set(targetWindow.vscodeWindowId, auxiliaryWindow);
    registryDisposables.add(toDisposable(() => this.windows.delete(targetWindow.vscodeWindowId)));
    const eventDisposables = new DisposableStore();
    Event.once(auxiliaryWindow.onWillDispose)(() => {
      targetWindow.close();
      containerDisposables.dispose();
      registryDisposables.dispose();
      eventDisposables.dispose();
    });
    registryDisposables.add(registerWindow(targetWindow));
    this._onDidOpenAuxiliaryWindow.fire({ window: auxiliaryWindow, disposables: eventDisposables });
    mark("code/auxiliaryWindow/didOpen");
    this.telemetryService.publicLog2("auxiliaryWindowOpen", { bounds: !!options?.bounds });
    return auxiliaryWindow;
  }
  createAuxiliaryWindow(targetWindow, container, stylesLoaded) {
    return new AuxiliaryWindow(targetWindow, container, stylesLoaded, this.configurationService, this.hostService, this.environmentService, this.contextMenuService, this.layoutService);
  }
  async openWindow(options) {
    const activeWindow = getActiveWindow();
    const activeWindowBounds = {
      x: activeWindow.screenX,
      y: activeWindow.screenY,
      width: activeWindow.outerWidth,
      height: activeWindow.outerHeight
    };
    const defaultSize = DEFAULT_AUX_WINDOW_SIZE;
    const width = options?.frameless ? options?.bounds?.width ?? defaultSize.width : Math.max(options?.bounds?.width ?? defaultSize.width, WindowMinimumSize.WIDTH);
    const height = options?.frameless ? options?.bounds?.height ?? defaultSize.height : Math.max(options?.bounds?.height ?? defaultSize.height, WindowMinimumSize.HEIGHT);
    let newWindowBounds = {
      x: options?.bounds?.x ?? Math.max(activeWindowBounds.x + activeWindowBounds.width / 2 - width / 2, 0),
      y: options?.bounds?.y ?? Math.max(activeWindowBounds.y + activeWindowBounds.height / 2 - height / 2, 0),
      width,
      height
    };
    if (!options?.bounds && newWindowBounds.x === activeWindowBounds.x && newWindowBounds.y === activeWindowBounds.y) {
      newWindowBounds = {
        ...newWindowBounds,
        x: newWindowBounds.x + 30,
        y: newWindowBounds.y + 30
      };
    }
    const features = coalesce([
      "popup=yes",
      `left=${newWindowBounds.x}`,
      `top=${newWindowBounds.y}`,
      `width=${newWindowBounds.width}`,
      `height=${newWindowBounds.height}`,
      // non-standard properties
      options?.nativeTitlebar ? "window-native-titlebar=yes" : void 0,
      options?.disableFullscreen ? "window-disable-fullscreen=yes" : void 0,
      options?.alwaysOnTop ? "window-always-on-top=yes" : void 0,
      options?.mode === 0 /* Maximized */ ? "window-maximized=yes" : void 0,
      options?.mode === 2 /* Fullscreen */ ? "window-fullscreen=yes" : void 0,
      options?.frameless ? "window-frameless=yes" : void 0,
      options?.transparent ? "window-transparent=yes" : void 0,
      options?.notResizable ? "window-not-resizable=yes" : void 0,
      options?.noBackgroundThrottling ? "window-no-background-throttling=yes" : void 0,
      options?.backgroundColor && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(options.backgroundColor) ? `window-background-color=${options.backgroundColor}` : void 0
    ]);
    const auxiliaryWindow = mainWindow.open(isFirefox ? "" : "about:blank", void 0, features.join(","));
    if (!auxiliaryWindow && isWeb) {
      return (await this.dialogService.prompt({
        type: Severity.Warning,
        message: localize("unableToOpenWindow", "The browser blocked opening a new window. Press 'Retry' to try again."),
        custom: {
          markdownDetails: [{ markdown: new MarkdownString(localize("unableToOpenWindowDetail", "Please allow pop-ups for this website in your [browser settings]({0}).", "https://aka.ms/allow-vscode-popup"), true) }]
        },
        buttons: [
          {
            label: localize({ key: "retry", comment: ["&& denotes a mnemonic"] }, "&&Retry"),
            run: () => this.openWindow(options)
          }
        ],
        cancelButton: true
      })).result;
    }
    return auxiliaryWindow?.window;
  }
  async resolveWindowId(auxiliaryWindow) {
    return BrowserAuxiliaryWindowService.WINDOW_IDS++;
  }
  createContainer(auxiliaryWindow, disposables, options) {
    auxiliaryWindow.document.createElement = function() {
      throw new Error('Not allowed to create elements in child window JavaScript context. Always use the main window so that "xyz instanceof HTMLElement" continues to work.');
    };
    this.applyMeta(auxiliaryWindow);
    const { stylesLoaded } = this.applyCSS(auxiliaryWindow, disposables);
    const container = this.applyHTML(auxiliaryWindow, disposables);
    return { stylesLoaded, container };
  }
  applyMeta(auxiliaryWindow) {
    for (const metaTag of ['meta[charset="utf-8"]', 'meta[http-equiv="Content-Security-Policy"]', 'meta[name="viewport"]', 'meta[name="theme-color"]']) {
      const metaElement = mainWindow.document.querySelector(metaTag);
      if (metaElement) {
        const clonedMetaElement = createMetaElement(auxiliaryWindow.document.head);
        copyAttributes(metaElement, clonedMetaElement);
        if (metaTag === 'meta[http-equiv="Content-Security-Policy"]') {
          const content = clonedMetaElement.getAttribute("content");
          if (content) {
            clonedMetaElement.setAttribute("content", content.replace(/(script-src[^\;]*)/, `script-src 'none'`));
          }
        }
      }
    }
    const originalIconLinkTag = mainWindow.document.querySelector('link[rel="icon"]');
    if (originalIconLinkTag) {
      const icon = createLinkElement(auxiliaryWindow.document.head);
      copyAttributes(originalIconLinkTag, icon);
    }
  }
  applyCSS(auxiliaryWindow, disposables) {
    mark("code/auxiliaryWindow/willApplyCSS");
    const mapOriginalToClone = /* @__PURE__ */ new Map();
    const stylesLoaded = new Barrier();
    stylesLoaded.wait().then(() => mark("code/auxiliaryWindow/didLoadCSSStyles"));
    const pendingLinksDisposables = disposables.add(new DisposableStore());
    let pendingLinksToSettle = 0;
    function onLinkSettled() {
      if (--pendingLinksToSettle === 0) {
        pendingLinksDisposables.dispose();
        stylesLoaded.open();
      }
    }
    function cloneNode(originalNode) {
      if (isGlobalStylesheet(originalNode)) {
        return;
      }
      const clonedNode = auxiliaryWindow.document.head.appendChild(originalNode.cloneNode(true));
      if (originalNode.tagName.toLowerCase() === "link") {
        pendingLinksToSettle++;
        pendingLinksDisposables.add(addDisposableListener(clonedNode, "load", onLinkSettled));
        pendingLinksDisposables.add(addDisposableListener(clonedNode, "error", onLinkSettled));
      }
      mapOriginalToClone.set(originalNode, clonedNode);
    }
    pendingLinksToSettle++;
    try {
      for (const originalNode of mainWindow.document.head.querySelectorAll('link[rel="stylesheet"], style')) {
        cloneNode(originalNode);
      }
    } finally {
      onLinkSettled();
    }
    disposables.add(cloneGlobalStylesheets(auxiliaryWindow));
    disposables.add(sharedMutationObserver.observe(mainWindow.document.head, disposables, { childList: true, subtree: true })((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== "childList" || // only interested in added/removed nodes
        mutation.target.nodeName.toLowerCase() === "title" || // skip over title changes that happen frequently
        mutation.target.nodeName.toLowerCase() === "script" || // block <script> changes that are unsupported anyway
        mutation.target.nodeName.toLowerCase() === "meta") {
          continue;
        }
        for (const node of mutation.addedNodes) {
          if (isHTMLElement(node) && (node.tagName.toLowerCase() === "style" || node.tagName.toLowerCase() === "link")) {
            cloneNode(node);
          } else if (node.nodeType === Node.TEXT_NODE && node.parentNode) {
            const clonedNode = mapOriginalToClone.get(node.parentNode);
            if (clonedNode) {
              clonedNode.textContent = node.textContent;
            }
          }
        }
        for (const node of mutation.removedNodes) {
          const clonedNode = mapOriginalToClone.get(node);
          if (clonedNode) {
            clonedNode.parentNode?.removeChild(clonedNode);
            mapOriginalToClone.delete(node);
          }
        }
      }
    }));
    mark("code/auxiliaryWindow/didApplyCSS");
    return { stylesLoaded };
  }
  applyHTML(auxiliaryWindow, disposables) {
    mark("code/auxiliaryWindow/willApplyHTML");
    const container = $("div", { role: "application" });
    position(container, 0, 0, 0, 0, "relative");
    container.style.display = "flex";
    container.style.height = "100%";
    container.style.flexDirection = "column";
    auxiliaryWindow.document.body.append(container);
    disposables.add(trackAttributes(mainWindow.document.documentElement, auxiliaryWindow.document.documentElement));
    disposables.add(trackAttributes(mainWindow.document.body, auxiliaryWindow.document.body));
    disposables.add(trackAttributes(this.layoutService.mainContainer, container, ["class"]));
    mark("code/auxiliaryWindow/didApplyHTML");
    return container;
  }
  getWindow(windowId) {
    return this.windows.get(windowId);
  }
};
BrowserAuxiliaryWindowService.WINDOW_IDS = getWindowId(mainWindow) + 1;
BrowserAuxiliaryWindowService = __decorateClass([
  __decorateParam(0, IWorkbenchLayoutService),
  __decorateParam(1, IDialogService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IHostService),
  __decorateParam(5, IWorkbenchEnvironmentService),
  __decorateParam(6, IContextMenuService)
], BrowserAuxiliaryWindowService);
registerSingleton(IAuxiliaryWindowService, BrowserAuxiliaryWindowService, InstantiationType.Delayed);
export {
  AuxiliaryWindow,
  AuxiliaryWindowMode,
  BrowserAuxiliaryWindowService,
  IAuxiliaryWindowService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9hdXhpbGlhcnlXaW5kb3cvYnJvd3Nlci9hdXhpbGlhcnlXaW5kb3dTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZ2V0Wm9vbUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgJCwgRGltZW5zaW9uLCBFdmVudEhlbHBlciwgRXZlbnRUeXBlLCBNb2RpZmllcktleUVtaXR0ZXIsIGFkZERpc3Bvc2FibGVMaXN0ZW5lciwgY29weUF0dHJpYnV0ZXMsIGNyZWF0ZUxpbmtFbGVtZW50LCBjcmVhdGVNZXRhRWxlbWVudCwgZ2V0QWN0aXZlV2luZG93LCBnZXRDbGllbnRBcmVhLCBnZXRXaW5kb3dJZCwgaXNIVE1MRWxlbWVudCwgcG9zaXRpb24sIHJlZ2lzdGVyV2luZG93LCBzaGFyZWRNdXRhdGlvbk9ic2VydmVyLCB0cmFja0F0dHJpYnV0ZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IGNsb25lR2xvYmFsU3R5bGVzaGVldHMsIGlzR2xvYmFsU3R5bGVzaGVldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBDb2RlV2luZG93LCBlbnN1cmVDb2RlV2luZG93LCBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBCYXJyaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBtYXJrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGVyZm9ybWFuY2UuanMnO1xuaW1wb3J0IHsgaXNGaXJlZm94LCBpc1dlYiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0FVWF9XSU5ET1dfU0laRSwgSVJlY3RhbmdsZSwgV2luZG93TWluaW11bVNpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBCYXNlV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaG9zdC9icm93c2VyL2hvc3QuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNvbnN0IElBdXhpbGlhcnlXaW5kb3dTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElBdXhpbGlhcnlXaW5kb3dTZXJ2aWNlPignYXV4aWxpYXJ5V2luZG93U2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElBdXhpbGlhcnlXaW5kb3dPcGVuRXZlbnQge1xuXHRyZWFkb25seSB3aW5kb3c6IElBdXhpbGlhcnlXaW5kb3c7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmV4cG9ydCBlbnVtIEF1eGlsaWFyeVdpbmRvd01vZGUge1xuXHRNYXhpbWl6ZWQsXG5cdE5vcm1hbCxcblx0RnVsbHNjcmVlblxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBdXhpbGlhcnlXaW5kb3dPcGVuT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGJvdW5kcz86IFBhcnRpYWw8SVJlY3RhbmdsZT47XG5cdHJlYWRvbmx5IGNvbXBhY3Q/OiBib29sZWFuO1xuXG5cdHJlYWRvbmx5IG1vZGU/OiBBdXhpbGlhcnlXaW5kb3dNb2RlO1xuXHRyZWFkb25seSB6b29tTGV2ZWw/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGFsd2F5c09uVG9wPzogYm9vbGVhbjtcblxuXHRyZWFkb25seSBuYXRpdmVUaXRsZWJhcj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGRpc2FibGVGdWxsc2NyZWVuPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZnJhbWVsZXNzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdHJhbnNwYXJlbnQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBub3RSZXNpemFibGU/OiBib29sZWFuO1xuXHRyZWFkb25seSBub0JhY2tncm91bmRUaHJvdHRsaW5nPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgYmFja2dyb3VuZENvbG9yPzogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBdXhpbGlhcnlXaW5kb3dTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25EaWRPcGVuQXV4aWxpYXJ5V2luZG93OiBFdmVudDxJQXV4aWxpYXJ5V2luZG93T3BlbkV2ZW50PjtcblxuXHRvcGVuKG9wdGlvbnM/OiBJQXV4aWxpYXJ5V2luZG93T3Blbk9wdGlvbnMpOiBQcm9taXNlPElBdXhpbGlhcnlXaW5kb3c+O1xuXG5cdGdldFdpbmRvdyh3aW5kb3dJZDogbnVtYmVyKTogSUF1eGlsaWFyeVdpbmRvdyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBCZWZvcmVBdXhpbGlhcnlXaW5kb3dVbmxvYWRFdmVudCB7XG5cdHZldG8ocmVhc29uOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBdXhpbGlhcnlXaW5kb3cgZXh0ZW5kcyBJRGlzcG9zYWJsZSB7XG5cblx0cmVhZG9ubHkgb25XaWxsTGF5b3V0OiBFdmVudDxEaW1lbnNpb24+O1xuXHRyZWFkb25seSBvbkRpZExheW91dDogRXZlbnQ8RGltZW5zaW9uPjtcblxuXHRyZWFkb25seSBvbkJlZm9yZVVubG9hZDogRXZlbnQ8QmVmb3JlQXV4aWxpYXJ5V2luZG93VW5sb2FkRXZlbnQ+O1xuXHRyZWFkb25seSBvblVubG9hZDogRXZlbnQ8dm9pZD47XG5cblx0cmVhZG9ubHkgd2hlblN0eWxlc0hhdmVMb2FkZWQ6IFByb21pc2U8dm9pZD47XG5cblx0cmVhZG9ubHkgd2luZG93OiBDb2RlV2luZG93O1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXG5cdHVwZGF0ZU9wdGlvbnMob3B0aW9uczogeyBjb21wYWN0OiBib29sZWFuIH0gfCB1bmRlZmluZWQpOiB2b2lkO1xuXG5cdGxheW91dCgpOiB2b2lkO1xuXG5cdGNyZWF0ZVN0YXRlKCk6IElBdXhpbGlhcnlXaW5kb3dPcGVuT3B0aW9ucztcbn1cblxuY29uc3QgREVGQVVMVF9BVVhfV0lORE9XX0RJTUVOU0lPTlMgPSBuZXcgRGltZW5zaW9uKERFRkFVTFRfQVVYX1dJTkRPV19TSVpFLndpZHRoLCBERUZBVUxUX0FVWF9XSU5ET1dfU0laRS5oZWlnaHQpO1xuXG5leHBvcnQgY2xhc3MgQXV4aWxpYXJ5V2luZG93IGV4dGVuZHMgQmFzZVdpbmRvdyBpbXBsZW1lbnRzIElBdXhpbGlhcnlXaW5kb3cge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uV2lsbExheW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPERpbWVuc2lvbj4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbExheW91dCA9IHRoaXMuX29uV2lsbExheW91dC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZExheW91dCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPERpbWVuc2lvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkTGF5b3V0ID0gdGhpcy5fb25EaWRMYXlvdXQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25CZWZvcmVVbmxvYWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxCZWZvcmVBdXhpbGlhcnlXaW5kb3dVbmxvYWRFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uQmVmb3JlVW5sb2FkID0gdGhpcy5fb25CZWZvcmVVbmxvYWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25VbmxvYWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25VbmxvYWQgPSB0aGlzLl9vblVubG9hZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbldpbGxEaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uV2lsbERpc3Bvc2UgPSB0aGlzLl9vbldpbGxEaXNwb3NlLmV2ZW50O1xuXG5cdHJlYWRvbmx5IHdoZW5TdHlsZXNIYXZlTG9hZGVkOiBQcm9taXNlPHZvaWQ+O1xuXG5cdHByaXZhdGUgY29tcGFjdCA9IGZhbHNlO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHdpbmRvdzogQ29kZVdpbmRvdyxcblx0XHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHN0eWxlc0hhdmVMb2FkZWQ6IEJhcnJpZXIsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElIb3N0U2VydmljZSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlIGxheW91dFNlcnZpY2U6IElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKHdpbmRvdywgdW5kZWZpbmVkLCBob3N0U2VydmljZSwgZW52aXJvbm1lbnRTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGxheW91dFNlcnZpY2UpO1xuXG5cdFx0dGhpcy53aGVuU3R5bGVzSGF2ZUxvYWRlZCA9IHN0eWxlc0hhdmVMb2FkZWQud2FpdCgpLnRoZW4oKCkgPT4gdW5kZWZpbmVkKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHVwZGF0ZU9wdGlvbnMob3B0aW9uczogeyBjb21wYWN0OiBib29sZWFuIH0pOiB2b2lkIHtcblx0XHR0aGlzLmNvbXBhY3QgPSBvcHRpb25zLmNvbXBhY3Q7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLndpbmRvdywgRXZlbnRUeXBlLkJFRk9SRV9VTkxPQUQsIChlOiBCZWZvcmVVbmxvYWRFdmVudCkgPT4gdGhpcy5oYW5kbGVCZWZvcmVVbmxvYWQoZSkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy53aW5kb3csIEV2ZW50VHlwZS5VTkxPQUQsICgpID0+IHRoaXMuaGFuZGxlVW5sb2FkKCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLndpbmRvdywgJ3VuaGFuZGxlZHJlamVjdGlvbicsIGUgPT4ge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZS5yZWFzb24pO1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLndpbmRvdywgRXZlbnRUeXBlLlJFU0laRSwgKCkgPT4gdGhpcy5sYXlvdXQoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGFpbmVyLCBFdmVudFR5cGUuU0NST0xMLCAoKSA9PiB0aGlzLmNvbnRhaW5lci5zY3JvbGxUb3AgPSAwKSk7IFx0XHRcdFx0XHRcdC8vIFByZXZlbnQgY29udGFpbmVyIGZyb20gc2Nyb2xsaW5nICgjNTU0NTYpXG5cblx0XHRpZiAoaXNXZWIpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRXZlbnRUeXBlLkRST1AsIGUgPT4gRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKSkpOyBcdFx0XHRcdFx0XHRcdC8vIFByZXZlbnQgZGVmYXVsdCBuYXZpZ2F0aW9uIG9uIGRyb3Bcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgRXZlbnRUeXBlLldIRUVMLCBlID0+IGUucHJldmVudERlZmF1bHQoKSwgeyBwYXNzaXZlOiBmYWxzZSB9KSk7IFx0XHRcdC8vIFByZXZlbnQgdGhlIGJhY2svZm9yd2FyZCBnZXN0dXJlcyBpbiBtYWNPU1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGFpbmVyLCBFdmVudFR5cGUuQ09OVEVYVF9NRU5VLCBlID0+IEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSkpKTsgXHRcdFx0XHRcdC8vIFByZXZlbnQgbmF0aXZlIGNvbnRleHQgbWVudXMgaW4gd2ViXG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLndpbmRvdy5kb2N1bWVudC5ib2R5LCBFdmVudFR5cGUuRFJBR19PVkVSLCAoZTogRHJhZ0V2ZW50KSA9PiBFdmVudEhlbHBlci5zdG9wKGUpKSk7XHQvLyBQcmV2ZW50IGRyYWcgZmVlZGJhY2sgb24gPGJvZHk+XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy53aW5kb3cuZG9jdW1lbnQuYm9keSwgRXZlbnRUeXBlLkRST1AsIChlOiBEcmFnRXZlbnQpID0+IEV2ZW50SGVscGVyLnN0b3AoZSkpKTtcdFx0Ly8gUHJldmVudCBkZWZhdWx0IG5hdmlnYXRpb24gb24gZHJvcFxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlQmVmb3JlVW5sb2FkKGU6IEJlZm9yZVVubG9hZEV2ZW50KTogdm9pZCB7XG5cblx0XHQvLyBDaGVjayBmb3IgdmV0byBmcm9tIGEgbGlzdGVuaW5nIGNvbXBvbmVudFxuXHRcdGxldCB2ZXRvOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb25CZWZvcmVVbmxvYWQuZmlyZSh7XG5cdFx0XHR2ZXRvKHJlYXNvbikge1xuXHRcdFx0XHRpZiAocmVhc29uKSB7XG5cdFx0XHRcdFx0dmV0byA9IHJlYXNvbjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGlmICh2ZXRvKSB7XG5cdFx0XHR0aGlzLmhhbmRsZVZldG9CZWZvcmVDbG9zZShlLCB2ZXRvKTtcblxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBjb25maXJtIGJlZm9yZSBjbG9zZSBzZXR0aW5nXG5cdFx0Y29uc3QgY29uZmlybUJlZm9yZUNsb3NlU2V0dGluZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J2Fsd2F5cycgfCAnbmV2ZXInIHwgJ2tleWJvYXJkT25seSc+KCd3aW5kb3cuY29uZmlybUJlZm9yZUNsb3NlJyk7XG5cdFx0Y29uc3QgY29uZmlybUJlZm9yZUNsb3NlID0gY29uZmlybUJlZm9yZUNsb3NlU2V0dGluZyA9PT0gJ2Fsd2F5cycgfHwgKGNvbmZpcm1CZWZvcmVDbG9zZVNldHRpbmcgPT09ICdrZXlib2FyZE9ubHknICYmIE1vZGlmaWVyS2V5RW1pdHRlci5nZXRJbnN0YW5jZSgpLmlzTW9kaWZpZXJQcmVzc2VkKTtcblx0XHRpZiAoY29uZmlybUJlZm9yZUNsb3NlKSB7XG5cdFx0XHR0aGlzLmNvbmZpcm1CZWZvcmVDbG9zZShlKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgaGFuZGxlVmV0b0JlZm9yZUNsb3NlKGU6IEJlZm9yZVVubG9hZEV2ZW50LCByZWFzb246IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMucHJldmVudFVubG9hZChlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBwcmV2ZW50VW5sb2FkKGU6IEJlZm9yZVVubG9hZEV2ZW50KTogdm9pZCB7XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUucmV0dXJuVmFsdWUgPSBsb2NhbGl6ZSgnbGlmZWN5Y2xlVmV0bycsIFwiQ2hhbmdlcyB0aGF0IHlvdSBtYWRlIG1heSBub3QgYmUgc2F2ZWQuIFBsZWFzZSBjaGVjayBwcmVzcyAnQ2FuY2VsJyBhbmQgdHJ5IGFnYWluLlwiKTtcblx0fVxuXG5cdHByb3RlY3RlZCBjb25maXJtQmVmb3JlQ2xvc2UoZTogQmVmb3JlVW5sb2FkRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLnByZXZlbnRVbmxvYWQoZSk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVVubG9hZCgpOiB2b2lkIHtcblxuXHRcdC8vIEV2ZW50XG5cdFx0dGhpcy5fb25VbmxvYWQuZmlyZSgpO1xuXHR9XG5cblx0bGF5b3V0KCk6IHZvaWQge1xuXG5cdFx0Ly8gU3BsaXQgbGF5b3V0IHVwIGludG8gdHdvIGV2ZW50cyBzbyB0aGF0IGRvd25zdHJlYW0gY29tcG9uZW50c1xuXHRcdC8vIGhhdmUgYSBjaGFuY2UgdG8gcGFydGljaXBhdGUgaW4gdGhlIGJlZ2lubmluZyBvciBlbmQgb2YgdGhlXG5cdFx0Ly8gbGF5b3V0IHBoYXNlLlxuXHRcdC8vIFRoaXMgaGVscHMgdG8gYnVpbGQgdGhlIGF1eGlsaWFyeSB3aW5kb3cgaW4gYW5vdGhlciBjb21wb25lbnRcblx0XHQvLyBpbiB0aGUgYG9uV2lsbExheW91dGAgcGhhc2UgYW5kIHRoZW4gbGV0IG90aGVyIGNvbXBvbWVudHNcblx0XHQvLyByZWFjdCB3aGVuIHRoZSBvdmVyYWxsIGxheW91dCBoYXMgZmluaXNoZWQgaW4gYG9uRGlkTGF5b3V0YC5cblxuXHRcdGNvbnN0IGRpbWVuc2lvbiA9IGdldENsaWVudEFyZWEodGhpcy53aW5kb3cuZG9jdW1lbnQuYm9keSwgREVGQVVMVF9BVVhfV0lORE9XX0RJTUVOU0lPTlMsIHRoaXMuY29udGFpbmVyKTtcblx0XHR0aGlzLl9vbldpbGxMYXlvdXQuZmlyZShkaW1lbnNpb24pO1xuXHRcdHRoaXMuX29uRGlkTGF5b3V0LmZpcmUoZGltZW5zaW9uKTtcblx0fVxuXG5cdGNyZWF0ZVN0YXRlKCk6IElBdXhpbGlhcnlXaW5kb3dPcGVuT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGJvdW5kczoge1xuXHRcdFx0XHR4OiB0aGlzLndpbmRvdy5zY3JlZW5YLFxuXHRcdFx0XHR5OiB0aGlzLndpbmRvdy5zY3JlZW5ZLFxuXHRcdFx0XHR3aWR0aDogdGhpcy53aW5kb3cub3V0ZXJXaWR0aCxcblx0XHRcdFx0aGVpZ2h0OiB0aGlzLndpbmRvdy5vdXRlckhlaWdodFxuXHRcdFx0fSxcblx0XHRcdHpvb21MZXZlbDogZ2V0Wm9vbUxldmVsKHRoaXMud2luZG93KSxcblx0XHRcdGNvbXBhY3Q6IHRoaXMuY29tcGFjdFxuXHRcdH07XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25XaWxsRGlzcG9zZS5maXJlKCk7XG5cblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEJyb3dzZXJBdXhpbGlhcnlXaW5kb3dTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBdXhpbGlhcnlXaW5kb3dTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHN0YXRpYyBXSU5ET1dfSURTID0gZ2V0V2luZG93SWQobWFpbldpbmRvdykgKyAxOyAvLyBzdGFydCBmcm9tIHRoZSBtYWluIHdpbmRvdyBJRCArIDFcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZE9wZW5BdXhpbGlhcnlXaW5kb3cgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJQXV4aWxpYXJ5V2luZG93T3BlbkV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRPcGVuQXV4aWxpYXJ5V2luZG93ID0gdGhpcy5fb25EaWRPcGVuQXV4aWxpYXJ5V2luZG93LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgd2luZG93cyA9IG5ldyBNYXA8bnVtYmVyLCBJQXV4aWxpYXJ5V2luZG93PigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJV29ya2JlbmNoTGF5b3V0U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgbGF5b3V0U2VydmljZTogSVdvcmtiZW5jaExheW91dFNlcnZpY2UsXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBkaWFsb2dTZXJ2aWNlOiBJRGlhbG9nU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGhvc3RTZXJ2aWNlOiBJSG9zdFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0YXN5bmMgb3BlbihvcHRpb25zPzogSUF1eGlsaWFyeVdpbmRvd09wZW5PcHRpb25zKTogUHJvbWlzZTxJQXV4aWxpYXJ5V2luZG93PiB7XG5cdFx0bWFyaygnY29kZS9hdXhpbGlhcnlXaW5kb3cvd2lsbE9wZW4nKTtcblxuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGF3YWl0IHRoaXMub3BlbldpbmRvdyhvcHRpb25zKTtcblx0XHRpZiAoIXRhcmdldFdpbmRvdykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGxvY2FsaXplKCd1bmFibGVUb09wZW5XaW5kb3dFcnJvcicsIFwiVW5hYmxlIHRvIG9wZW4gYSBuZXcgd2luZG93LlwiKSk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkIGEgYHZzY29kZVdpbmRvd0lkYCBwcm9wZXJ0eSB0byBpZGVudGlmeSBhdXhpbGlhcnkgd2luZG93c1xuXHRcdGNvbnN0IHJlc29sdmVkV2luZG93SWQgPSBhd2FpdCB0aGlzLnJlc29sdmVXaW5kb3dJZCh0YXJnZXRXaW5kb3cpO1xuXHRcdGVuc3VyZUNvZGVXaW5kb3codGFyZ2V0V2luZG93LCByZXNvbHZlZFdpbmRvd0lkKTtcblxuXHRcdGNvbnN0IGNvbnRhaW5lckRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHsgY29udGFpbmVyLCBzdHlsZXNMb2FkZWQgfSA9IHRoaXMuY3JlYXRlQ29udGFpbmVyKHRhcmdldFdpbmRvdywgY29udGFpbmVyRGlzcG9zYWJsZXMsIG9wdGlvbnMpO1xuXG5cdFx0Y29uc3QgYXV4aWxpYXJ5V2luZG93ID0gdGhpcy5jcmVhdGVBdXhpbGlhcnlXaW5kb3codGFyZ2V0V2luZG93LCBjb250YWluZXIsIHN0eWxlc0xvYWRlZCk7XG5cdFx0YXV4aWxpYXJ5V2luZG93LnVwZGF0ZU9wdGlvbnMoeyBjb21wYWN0OiBvcHRpb25zPy5jb21wYWN0ID8/IGZhbHNlIH0pO1xuXG5cdFx0Y29uc3QgcmVnaXN0cnlEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHR0aGlzLndpbmRvd3Muc2V0KHRhcmdldFdpbmRvdy52c2NvZGVXaW5kb3dJZCwgYXV4aWxpYXJ5V2luZG93KTtcblx0XHRyZWdpc3RyeURpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy53aW5kb3dzLmRlbGV0ZSh0YXJnZXRXaW5kb3cudnNjb2RlV2luZG93SWQpKSk7XG5cblx0XHRjb25zdCBldmVudERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0RXZlbnQub25jZShhdXhpbGlhcnlXaW5kb3cub25XaWxsRGlzcG9zZSkoKCkgPT4ge1xuXHRcdFx0dGFyZ2V0V2luZG93LmNsb3NlKCk7XG5cblx0XHRcdGNvbnRhaW5lckRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdHJlZ2lzdHJ5RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0ZXZlbnREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHRyZWdpc3RyeURpc3Bvc2FibGVzLmFkZChyZWdpc3RlcldpbmRvdyh0YXJnZXRXaW5kb3cpKTtcblx0XHR0aGlzLl9vbkRpZE9wZW5BdXhpbGlhcnlXaW5kb3cuZmlyZSh7IHdpbmRvdzogYXV4aWxpYXJ5V2luZG93LCBkaXNwb3NhYmxlczogZXZlbnREaXNwb3NhYmxlcyB9KTtcblxuXHRcdG1hcmsoJ2NvZGUvYXV4aWxpYXJ5V2luZG93L2RpZE9wZW4nKTtcblxuXHRcdHR5cGUgQXV4aWxpYXJ5V2luZG93Q2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2JwYXNlcm8nO1xuXHRcdFx0Y29tbWVudDogJ0FuIGV2ZW50IHRoYXQgZmlyZXMgd2hlbiBhbiBhdXhpbGlhcnkgd2luZG93IGlzIG9wZW5lZCc7XG5cdFx0XHRib3VuZHM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdIYXMgd2luZG93IGJvdW5kcyBwcm92aWRlZC4nIH07XG5cdFx0fTtcblx0XHR0eXBlIEF1eGlsaWFyeVdpbmRvd09wZW5FdmVudCA9IHtcblx0XHRcdGJvdW5kczogYm9vbGVhbjtcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEF1eGlsaWFyeVdpbmRvd09wZW5FdmVudCwgQXV4aWxpYXJ5V2luZG93Q2xhc3NpZmljYXRpb24+KCdhdXhpbGlhcnlXaW5kb3dPcGVuJywgeyBib3VuZHM6ICEhb3B0aW9ucz8uYm91bmRzIH0pO1xuXG5cdFx0cmV0dXJuIGF1eGlsaWFyeVdpbmRvdztcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVBdXhpbGlhcnlXaW5kb3codGFyZ2V0V2luZG93OiBDb2RlV2luZG93LCBjb250YWluZXI6IEhUTUxFbGVtZW50LCBzdHlsZXNMb2FkZWQ6IEJhcnJpZXIpOiBBdXhpbGlhcnlXaW5kb3cge1xuXHRcdHJldHVybiBuZXcgQXV4aWxpYXJ5V2luZG93KHRhcmdldFdpbmRvdywgY29udGFpbmVyLCBzdHlsZXNMb2FkZWQsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIHRoaXMuaG9zdFNlcnZpY2UsIHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLCB0aGlzLmNvbnRleHRNZW51U2VydmljZSwgdGhpcy5sYXlvdXRTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbldpbmRvdyhvcHRpb25zPzogSUF1eGlsaWFyeVdpbmRvd09wZW5PcHRpb25zKTogUHJvbWlzZTxXaW5kb3cgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhY3RpdmVXaW5kb3cgPSBnZXRBY3RpdmVXaW5kb3coKTtcblx0XHRjb25zdCBhY3RpdmVXaW5kb3dCb3VuZHMgPSB7XG5cdFx0XHR4OiBhY3RpdmVXaW5kb3cuc2NyZWVuWCxcblx0XHRcdHk6IGFjdGl2ZVdpbmRvdy5zY3JlZW5ZLFxuXHRcdFx0d2lkdGg6IGFjdGl2ZVdpbmRvdy5vdXRlcldpZHRoLFxuXHRcdFx0aGVpZ2h0OiBhY3RpdmVXaW5kb3cub3V0ZXJIZWlnaHRcblx0XHR9O1xuXG5cdFx0Y29uc3QgZGVmYXVsdFNpemUgPSBERUZBVUxUX0FVWF9XSU5ET1dfU0laRTtcblxuXHRcdGNvbnN0IHdpZHRoID0gb3B0aW9ucz8uZnJhbWVsZXNzXG5cdFx0XHQ/IChvcHRpb25zPy5ib3VuZHM/LndpZHRoID8/IGRlZmF1bHRTaXplLndpZHRoKVxuXHRcdFx0OiBNYXRoLm1heChvcHRpb25zPy5ib3VuZHM/LndpZHRoID8/IGRlZmF1bHRTaXplLndpZHRoLCBXaW5kb3dNaW5pbXVtU2l6ZS5XSURUSCk7XG5cdFx0Y29uc3QgaGVpZ2h0ID0gb3B0aW9ucz8uZnJhbWVsZXNzXG5cdFx0XHQ/IChvcHRpb25zPy5ib3VuZHM/LmhlaWdodCA/PyBkZWZhdWx0U2l6ZS5oZWlnaHQpXG5cdFx0XHQ6IE1hdGgubWF4KG9wdGlvbnM/LmJvdW5kcz8uaGVpZ2h0ID8/IGRlZmF1bHRTaXplLmhlaWdodCwgV2luZG93TWluaW11bVNpemUuSEVJR0hUKTtcblxuXHRcdGxldCBuZXdXaW5kb3dCb3VuZHM6IElSZWN0YW5nbGUgPSB7XG5cdFx0XHR4OiBvcHRpb25zPy5ib3VuZHM/LnggPz8gTWF0aC5tYXgoYWN0aXZlV2luZG93Qm91bmRzLnggKyBhY3RpdmVXaW5kb3dCb3VuZHMud2lkdGggLyAyIC0gd2lkdGggLyAyLCAwKSxcblx0XHRcdHk6IG9wdGlvbnM/LmJvdW5kcz8ueSA/PyBNYXRoLm1heChhY3RpdmVXaW5kb3dCb3VuZHMueSArIGFjdGl2ZVdpbmRvd0JvdW5kcy5oZWlnaHQgLyAyIC0gaGVpZ2h0IC8gMiwgMCksXG5cdFx0XHR3aWR0aCxcblx0XHRcdGhlaWdodFxuXHRcdH07XG5cblx0XHRpZiAoIW9wdGlvbnM/LmJvdW5kcyAmJiBuZXdXaW5kb3dCb3VuZHMueCA9PT0gYWN0aXZlV2luZG93Qm91bmRzLnggJiYgbmV3V2luZG93Qm91bmRzLnkgPT09IGFjdGl2ZVdpbmRvd0JvdW5kcy55KSB7XG5cdFx0XHQvLyBPZmZzZXQgdGhlIG5ldyB3aW5kb3cgYSBiaXQgc28gdGhhdCBpdCBkb2VzIG5vdCBvdmVybGFwXG5cdFx0XHQvLyB3aXRoIHRoZSBhY3RpdmUgd2luZG93LCB1bmxlc3MgYm91bmRzIGFyZSBwcm92aWRlZFxuXHRcdFx0bmV3V2luZG93Qm91bmRzID0ge1xuXHRcdFx0XHQuLi5uZXdXaW5kb3dCb3VuZHMsXG5cdFx0XHRcdHg6IG5ld1dpbmRvd0JvdW5kcy54ICsgMzAsXG5cdFx0XHRcdHk6IG5ld1dpbmRvd0JvdW5kcy55ICsgMzBcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmVhdHVyZXMgPSBjb2FsZXNjZShbXG5cdFx0XHQncG9wdXA9eWVzJyxcblx0XHRcdGBsZWZ0PSR7bmV3V2luZG93Qm91bmRzLnh9YCxcblx0XHRcdGB0b3A9JHtuZXdXaW5kb3dCb3VuZHMueX1gLFxuXHRcdFx0YHdpZHRoPSR7bmV3V2luZG93Qm91bmRzLndpZHRofWAsXG5cdFx0XHRgaGVpZ2h0PSR7bmV3V2luZG93Qm91bmRzLmhlaWdodH1gLFxuXG5cdFx0XHQvLyBub24tc3RhbmRhcmQgcHJvcGVydGllc1xuXHRcdFx0b3B0aW9ucz8ubmF0aXZlVGl0bGViYXIgPyAnd2luZG93LW5hdGl2ZS10aXRsZWJhcj15ZXMnIDogdW5kZWZpbmVkLFxuXHRcdFx0b3B0aW9ucz8uZGlzYWJsZUZ1bGxzY3JlZW4gPyAnd2luZG93LWRpc2FibGUtZnVsbHNjcmVlbj15ZXMnIDogdW5kZWZpbmVkLFxuXHRcdFx0b3B0aW9ucz8uYWx3YXlzT25Ub3AgPyAnd2luZG93LWFsd2F5cy1vbi10b3A9eWVzJyA6IHVuZGVmaW5lZCxcblx0XHRcdG9wdGlvbnM/Lm1vZGUgPT09IEF1eGlsaWFyeVdpbmRvd01vZGUuTWF4aW1pemVkID8gJ3dpbmRvdy1tYXhpbWl6ZWQ9eWVzJyA6IHVuZGVmaW5lZCxcblx0XHRcdG9wdGlvbnM/Lm1vZGUgPT09IEF1eGlsaWFyeVdpbmRvd01vZGUuRnVsbHNjcmVlbiA/ICd3aW5kb3ctZnVsbHNjcmVlbj15ZXMnIDogdW5kZWZpbmVkLFxuXHRcdFx0b3B0aW9ucz8uZnJhbWVsZXNzID8gJ3dpbmRvdy1mcmFtZWxlc3M9eWVzJyA6IHVuZGVmaW5lZCxcblx0XHRcdG9wdGlvbnM/LnRyYW5zcGFyZW50ID8gJ3dpbmRvdy10cmFuc3BhcmVudD15ZXMnIDogdW5kZWZpbmVkLFxuXHRcdFx0b3B0aW9ucz8ubm90UmVzaXphYmxlID8gJ3dpbmRvdy1ub3QtcmVzaXphYmxlPXllcycgOiB1bmRlZmluZWQsXG5cdFx0XHRvcHRpb25zPy5ub0JhY2tncm91bmRUaHJvdHRsaW5nID8gJ3dpbmRvdy1uby1iYWNrZ3JvdW5kLXRocm90dGxpbmc9eWVzJyA6IHVuZGVmaW5lZCxcblx0XHRcdG9wdGlvbnM/LmJhY2tncm91bmRDb2xvciAmJiAvXiMoPzpbMC05YS1mQS1GXXszfXxbMC05YS1mQS1GXXs0fXxbMC05YS1mQS1GXXs2fXxbMC05YS1mQS1GXXs4fSkkLy50ZXN0KG9wdGlvbnMuYmFja2dyb3VuZENvbG9yKSA/IGB3aW5kb3ctYmFja2dyb3VuZC1jb2xvcj0ke29wdGlvbnMuYmFja2dyb3VuZENvbG9yfWAgOiB1bmRlZmluZWQsXG5cdFx0XSk7XG5cblx0XHRjb25zdCBhdXhpbGlhcnlXaW5kb3cgPSBtYWluV2luZG93Lm9wZW4oaXNGaXJlZm94ID8gJycgLyogRkYgaW1tZWRpYXRlbHkgZmlyZXMgYW4gdW5sb2FkIGV2ZW50IGlmIHVzaW5nIGFib3V0OmJsYW5rICovIDogJ2Fib3V0OmJsYW5rJywgdW5kZWZpbmVkLCBmZWF0dXJlcy5qb2luKCcsJykpO1xuXHRcdGlmICghYXV4aWxpYXJ5V2luZG93ICYmIGlzV2ViKSB7XG5cdFx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuZGlhbG9nU2VydmljZS5wcm9tcHQoe1xuXHRcdFx0XHR0eXBlOiBTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRtZXNzYWdlOiBsb2NhbGl6ZSgndW5hYmxlVG9PcGVuV2luZG93JywgXCJUaGUgYnJvd3NlciBibG9ja2VkIG9wZW5pbmcgYSBuZXcgd2luZG93LiBQcmVzcyAnUmV0cnknIHRvIHRyeSBhZ2Fpbi5cIiksXG5cdFx0XHRcdGN1c3RvbToge1xuXHRcdFx0XHRcdG1hcmtkb3duRGV0YWlsczogW3sgbWFya2Rvd246IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgndW5hYmxlVG9PcGVuV2luZG93RGV0YWlsJywgXCJQbGVhc2UgYWxsb3cgcG9wLXVwcyBmb3IgdGhpcyB3ZWJzaXRlIGluIHlvdXIgW2Jyb3dzZXIgc2V0dGluZ3NdKHswfSkuXCIsICdodHRwczovL2FrYS5tcy9hbGxvdy12c2NvZGUtcG9wdXAnKSwgdHJ1ZSkgfV1cblx0XHRcdFx0fSxcblx0XHRcdFx0YnV0dG9uczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSh7IGtleTogJ3JldHJ5JywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmUmV0cnlcIiksXG5cdFx0XHRcdFx0XHRydW46ICgpID0+IHRoaXMub3BlbldpbmRvdyhvcHRpb25zKVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0Y2FuY2VsQnV0dG9uOiB0cnVlXG5cdFx0XHR9KSkucmVzdWx0O1xuXHRcdH1cblxuXHRcdHJldHVybiBhdXhpbGlhcnlXaW5kb3c/LndpbmRvdztcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyByZXNvbHZlV2luZG93SWQoYXV4aWxpYXJ5V2luZG93OiBXaW5kb3cpOiBQcm9taXNlPG51bWJlcj4ge1xuXHRcdHJldHVybiBCcm93c2VyQXV4aWxpYXJ5V2luZG93U2VydmljZS5XSU5ET1dfSURTKys7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlQ29udGFpbmVyKGF1eGlsaWFyeVdpbmRvdzogQ29kZVdpbmRvdywgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgb3B0aW9ucz86IElBdXhpbGlhcnlXaW5kb3dPcGVuT3B0aW9ucyk6IHsgc3R5bGVzTG9hZGVkOiBCYXJyaWVyOyBjb250YWluZXI6IEhUTUxFbGVtZW50IH0ge1xuXHRcdGF1eGlsaWFyeVdpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50ID0gZnVuY3Rpb24gKCkge1xuXHRcdFx0Ly8gRGlzYWxsb3cgYGNyZWF0ZUVsZW1lbnRgIGJlY2F1c2UgaXQgd291bGQgY3JlYXRlXG5cdFx0XHQvLyBIVE1MIEVsZW1lbnRzIGluIHRoZSBcIndyb25nXCIgY29udGV4dCBhbmQgYnJlYWtcblx0XHRcdC8vIGNvZGUgdGhhdCBkb2VzIFwiaW5zdGFuY2VvZiBIVE1MRWxlbWVudFwiIGV0Yy5cblx0XHRcdHRocm93IG5ldyBFcnJvcignTm90IGFsbG93ZWQgdG8gY3JlYXRlIGVsZW1lbnRzIGluIGNoaWxkIHdpbmRvdyBKYXZhU2NyaXB0IGNvbnRleHQuIEFsd2F5cyB1c2UgdGhlIG1haW4gd2luZG93IHNvIHRoYXQgXCJ4eXogaW5zdGFuY2VvZiBIVE1MRWxlbWVudFwiIGNvbnRpbnVlcyB0byB3b3JrLicpO1xuXHRcdH07XG5cblx0XHR0aGlzLmFwcGx5TWV0YShhdXhpbGlhcnlXaW5kb3cpO1xuXHRcdGNvbnN0IHsgc3R5bGVzTG9hZGVkIH0gPSB0aGlzLmFwcGx5Q1NTKGF1eGlsaWFyeVdpbmRvdywgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IHRoaXMuYXBwbHlIVE1MKGF1eGlsaWFyeVdpbmRvdywgZGlzcG9zYWJsZXMpO1xuXG5cdFx0cmV0dXJuIHsgc3R5bGVzTG9hZGVkLCBjb250YWluZXIgfTtcblx0fVxuXG5cdHByaXZhdGUgYXBwbHlNZXRhKGF1eGlsaWFyeVdpbmRvdzogQ29kZVdpbmRvdyk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgbWV0YVRhZyBvZiBbJ21ldGFbY2hhcnNldD1cInV0Zi04XCJdJywgJ21ldGFbaHR0cC1lcXVpdj1cIkNvbnRlbnQtU2VjdXJpdHktUG9saWN5XCJdJywgJ21ldGFbbmFtZT1cInZpZXdwb3J0XCJdJywgJ21ldGFbbmFtZT1cInRoZW1lLWNvbG9yXCJdJ10pIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgbWV0YUVsZW1lbnQgPSBtYWluV2luZG93LmRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IobWV0YVRhZyk7XG5cdFx0XHRpZiAobWV0YUVsZW1lbnQpIHtcblx0XHRcdFx0Y29uc3QgY2xvbmVkTWV0YUVsZW1lbnQgPSBjcmVhdGVNZXRhRWxlbWVudChhdXhpbGlhcnlXaW5kb3cuZG9jdW1lbnQuaGVhZCk7XG5cdFx0XHRcdGNvcHlBdHRyaWJ1dGVzKG1ldGFFbGVtZW50LCBjbG9uZWRNZXRhRWxlbWVudCk7XG5cblx0XHRcdFx0aWYgKG1ldGFUYWcgPT09ICdtZXRhW2h0dHAtZXF1aXY9XCJDb250ZW50LVNlY3VyaXR5LVBvbGljeVwiXScpIHtcblx0XHRcdFx0XHRjb25zdCBjb250ZW50ID0gY2xvbmVkTWV0YUVsZW1lbnQuZ2V0QXR0cmlidXRlKCdjb250ZW50Jyk7XG5cdFx0XHRcdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdFx0XHRcdGNsb25lZE1ldGFFbGVtZW50LnNldEF0dHJpYnV0ZSgnY29udGVudCcsIGNvbnRlbnQucmVwbGFjZSgvKHNjcmlwdC1zcmNbXlxcO10qKS8sIGBzY3JpcHQtc3JjICdub25lJ2ApKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRjb25zdCBvcmlnaW5hbEljb25MaW5rVGFnID0gbWFpbldpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKCdsaW5rW3JlbD1cImljb25cIl0nKTtcblx0XHRpZiAob3JpZ2luYWxJY29uTGlua1RhZykge1xuXHRcdFx0Y29uc3QgaWNvbiA9IGNyZWF0ZUxpbmtFbGVtZW50KGF1eGlsaWFyeVdpbmRvdy5kb2N1bWVudC5oZWFkKTtcblx0XHRcdGNvcHlBdHRyaWJ1dGVzKG9yaWdpbmFsSWNvbkxpbmtUYWcsIGljb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXBwbHlDU1MoYXV4aWxpYXJ5V2luZG93OiBDb2RlV2luZG93LCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKSB7XG5cdFx0bWFyaygnY29kZS9hdXhpbGlhcnlXaW5kb3cvd2lsbEFwcGx5Q1NTJyk7XG5cblx0XHRjb25zdCBtYXBPcmlnaW5hbFRvQ2xvbmUgPSBuZXcgTWFwPE5vZGUgLyogb3JpZ2luYWwgKi8sIE5vZGUgLyogY2xvbmUgKi8+KCk7XG5cblx0XHRjb25zdCBzdHlsZXNMb2FkZWQgPSBuZXcgQmFycmllcigpO1xuXHRcdHN0eWxlc0xvYWRlZC53YWl0KCkudGhlbigoKSA9PiBtYXJrKCdjb2RlL2F1eGlsaWFyeVdpbmRvdy9kaWRMb2FkQ1NTU3R5bGVzJykpO1xuXG5cdFx0Y29uc3QgcGVuZGluZ0xpbmtzRGlzcG9zYWJsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdGxldCBwZW5kaW5nTGlua3NUb1NldHRsZSA9IDA7XG5cdFx0ZnVuY3Rpb24gb25MaW5rU2V0dGxlZCgpIHtcblx0XHRcdGlmICgtLXBlbmRpbmdMaW5rc1RvU2V0dGxlID09PSAwKSB7XG5cdFx0XHRcdHBlbmRpbmdMaW5rc0Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0c3R5bGVzTG9hZGVkLm9wZW4oKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjbG9uZU5vZGUob3JpZ2luYWxOb2RlOiBFbGVtZW50KTogdm9pZCB7XG5cdFx0XHRpZiAoaXNHbG9iYWxTdHlsZXNoZWV0KG9yaWdpbmFsTm9kZSkpIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBnbG9iYWwgc3R5bGVzaGVldHMgYXJlIGhhbmRsZWQgYnkgYGNsb25lR2xvYmFsU3R5bGVzaGVldHNgIGJlbG93XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGNsb25lZE5vZGUgPSBhdXhpbGlhcnlXaW5kb3cuZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChvcmlnaW5hbE5vZGUuY2xvbmVOb2RlKHRydWUpKTtcblx0XHRcdGlmIChvcmlnaW5hbE5vZGUudGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnbGluaycpIHtcblx0XHRcdFx0cGVuZGluZ0xpbmtzVG9TZXR0bGUrKztcblxuXHRcdFx0XHRwZW5kaW5nTGlua3NEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNsb25lZE5vZGUsICdsb2FkJywgb25MaW5rU2V0dGxlZCkpO1xuXHRcdFx0XHRwZW5kaW5nTGlua3NEaXNwb3NhYmxlcy5hZGQoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGNsb25lZE5vZGUsICdlcnJvcicsIG9uTGlua1NldHRsZWQpKTtcblx0XHRcdH1cblxuXHRcdFx0bWFwT3JpZ2luYWxUb0Nsb25lLnNldChvcmlnaW5hbE5vZGUsIGNsb25lZE5vZGUpO1xuXHRcdH1cblxuXHRcdC8vIENsb25lIGFsbCBzdHlsZSBlbGVtZW50cyBhbmQgc3R5bGVzaGVldCBsaW5rcyBmcm9tIHRoZSB3aW5kb3cgdG8gdGhlIGNoaWxkIHdpbmRvd1xuXHRcdC8vIGFuZCBrZWVwIHRyYWNrIG9mIDxsaW5rPiBlbGVtZW50cyB0byBzZXR0bGUgdG8gc2lnbmFsIHRoYXQgc3R5bGVzIGhhdmUgbG9hZGVkXG5cdFx0Ly8gSW5jcmVtZW50IHBlbmRpbmcgbGlua3MgcmlnaHQgZnJvbSB0aGUgYmVnaW5uaW5nIHRvIGVuc3VyZSB3ZSBvbmx5IHNldHRsZSB3aGVuXG5cdFx0Ly8gYWxsIHN0eWxlIHJlbGF0ZWQgbm9kZXMgaGF2ZSBiZWVuIGNsb25lZC5cblx0XHRwZW5kaW5nTGlua3NUb1NldHRsZSsrO1xuXHRcdHRyeSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGZvciAoY29uc3Qgb3JpZ2luYWxOb2RlIG9mIG1haW5XaW5kb3cuZG9jdW1lbnQuaGVhZC5xdWVyeVNlbGVjdG9yQWxsKCdsaW5rW3JlbD1cInN0eWxlc2hlZXRcIl0sIHN0eWxlJykpIHtcblx0XHRcdFx0Y2xvbmVOb2RlKG9yaWdpbmFsTm9kZSk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdG9uTGlua1NldHRsZWQoKTtcblx0XHR9XG5cblx0XHQvLyBHbG9iYWwgc3R5bGVzaGVldHMgaW4gPGhlYWQ+IGFyZSBjbG9uZWQgaW4gYSBzcGVjaWFsIHdheSBiZWNhdXNlIHRoZSBtdXRhdGlvblxuXHRcdC8vIG9ic2VydmVyIGlzIG5vdCBmaXJpbmcgZm9yIGNoYW5nZXMgZG9uZSB2aWEgYHN0eWxlLnNoZWV0YCBBUEkuIE9ubHkgdGV4dCBjaGFuZ2VzXG5cdFx0Ly8gY2FuIGJlIG9ic2VydmVkLlxuXHRcdGRpc3Bvc2FibGVzLmFkZChjbG9uZUdsb2JhbFN0eWxlc2hlZXRzKGF1eGlsaWFyeVdpbmRvdykpO1xuXG5cdFx0Ly8gTGlzdGVuIHRvIG5ldyBzdHlsZXNoZWV0cyBhcyB0aGV5IGFyZSBiZWluZyBhZGRlZCBvciByZW1vdmVkIGluIHRoZSBtYWluIHdpbmRvd1xuXHRcdC8vIGFuZCBhcHBseSB0byBjaGlsZCB3aW5kb3cgKGluY2x1ZGluZyBjaGFuZ2VzIHRvIGV4aXN0aW5nIHN0eWxlc2hlZXRzIGVsZW1lbnRzKVxuXHRcdGRpc3Bvc2FibGVzLmFkZChzaGFyZWRNdXRhdGlvbk9ic2VydmVyLm9ic2VydmUobWFpbldpbmRvdy5kb2N1bWVudC5oZWFkLCBkaXNwb3NhYmxlcywgeyBjaGlsZExpc3Q6IHRydWUsIHN1YnRyZWU6IHRydWUgfSkobXV0YXRpb25zID0+IHtcblx0XHRcdGZvciAoY29uc3QgbXV0YXRpb24gb2YgbXV0YXRpb25zKSB7XG5cdFx0XHRcdGlmIChcblx0XHRcdFx0XHRtdXRhdGlvbi50eXBlICE9PSAnY2hpbGRMaXN0JyB8fFx0XHRcdFx0XHRcdC8vIG9ubHkgaW50ZXJlc3RlZCBpbiBhZGRlZC9yZW1vdmVkIG5vZGVzXG5cdFx0XHRcdFx0bXV0YXRpb24udGFyZ2V0Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICd0aXRsZScgfHwgXHQvLyBza2lwIG92ZXIgdGl0bGUgY2hhbmdlcyB0aGF0IGhhcHBlbiBmcmVxdWVudGx5XG5cdFx0XHRcdFx0bXV0YXRpb24udGFyZ2V0Lm5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgPT09ICdzY3JpcHQnIHx8IFx0Ly8gYmxvY2sgPHNjcmlwdD4gY2hhbmdlcyB0aGF0IGFyZSB1bnN1cHBvcnRlZCBhbnl3YXlcblx0XHRcdFx0XHRtdXRhdGlvbi50YXJnZXQubm9kZU5hbWUudG9Mb3dlckNhc2UoKSA9PT0gJ21ldGEnXHRcdC8vIGRvIG5vdCBvYnNlcnZlIDxtZXRhPiBlbGVtZW50cyBmb3Igbm93XG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIG11dGF0aW9uLmFkZGVkTm9kZXMpIHtcblxuXHRcdFx0XHRcdC8vIDxzdHlsZT4vPGxpbms+IGVsZW1lbnQgd2FzIGFkZGVkXG5cdFx0XHRcdFx0aWYgKGlzSFRNTEVsZW1lbnQobm9kZSkgJiYgKG5vZGUudGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnc3R5bGUnIHx8IG5vZGUudGFnTmFtZS50b0xvd2VyQ2FzZSgpID09PSAnbGluaycpKSB7XG5cdFx0XHRcdFx0XHRjbG9uZU5vZGUobm9kZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gdGV4dC1ub2RlIHdhcyBjaGFuZ2VkLCB0cnkgdG8gYXBwbHkgdG8gb3VyIGNsb25lc1xuXHRcdFx0XHRcdGVsc2UgaWYgKG5vZGUubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFICYmIG5vZGUucGFyZW50Tm9kZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2xvbmVkTm9kZSA9IG1hcE9yaWdpbmFsVG9DbG9uZS5nZXQobm9kZS5wYXJlbnROb2RlKTtcblx0XHRcdFx0XHRcdGlmIChjbG9uZWROb2RlKSB7XG5cdFx0XHRcdFx0XHRcdGNsb25lZE5vZGUudGV4dENvbnRlbnQgPSBub2RlLnRleHRDb250ZW50O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGZvciAoY29uc3Qgbm9kZSBvZiBtdXRhdGlvbi5yZW1vdmVkTm9kZXMpIHtcblx0XHRcdFx0XHRjb25zdCBjbG9uZWROb2RlID0gbWFwT3JpZ2luYWxUb0Nsb25lLmdldChub2RlKTtcblx0XHRcdFx0XHRpZiAoY2xvbmVkTm9kZSkge1xuXHRcdFx0XHRcdFx0Y2xvbmVkTm9kZS5wYXJlbnROb2RlPy5yZW1vdmVDaGlsZChjbG9uZWROb2RlKTtcblx0XHRcdFx0XHRcdG1hcE9yaWdpbmFsVG9DbG9uZS5kZWxldGUobm9kZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bWFyaygnY29kZS9hdXhpbGlhcnlXaW5kb3cvZGlkQXBwbHlDU1MnKTtcblxuXHRcdHJldHVybiB7IHN0eWxlc0xvYWRlZCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseUhUTUwoYXV4aWxpYXJ5V2luZG93OiBDb2RlV2luZG93LCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKTogSFRNTEVsZW1lbnQge1xuXHRcdG1hcmsoJ2NvZGUvYXV4aWxpYXJ5V2luZG93L3dpbGxBcHBseUhUTUwnKTtcblxuXHRcdC8vIENyZWF0ZSB3b3JrYmVuY2ggY29udGFpbmVyIGFuZCBhcHBseSBjbGFzc2VzXG5cdFx0Y29uc3QgY29udGFpbmVyID0gJCgnZGl2JywgeyByb2xlOiAnYXBwbGljYXRpb24nIH0pO1xuXHRcdHBvc2l0aW9uKGNvbnRhaW5lciwgMCwgMCwgMCwgMCwgJ3JlbGF0aXZlJyk7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSAnZmxleCc7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblx0XHRjb250YWluZXIuc3R5bGUuZmxleERpcmVjdGlvbiA9ICdjb2x1bW4nO1xuXHRcdGF1eGlsaWFyeVdpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZChjb250YWluZXIpO1xuXG5cdFx0Ly8gVHJhY2sgYXR0cmlidXRlc1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0cmFja0F0dHJpYnV0ZXMobWFpbldpbmRvdy5kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQsIGF1eGlsaWFyeVdpbmRvdy5kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodHJhY2tBdHRyaWJ1dGVzKG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keSwgYXV4aWxpYXJ5V2luZG93LmRvY3VtZW50LmJvZHkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodHJhY2tBdHRyaWJ1dGVzKHRoaXMubGF5b3V0U2VydmljZS5tYWluQ29udGFpbmVyLCBjb250YWluZXIsIFsnY2xhc3MnXSkpOyAvLyBvbmx5IGNsYXNzIGF0dHJpYnV0ZVxuXG5cdFx0bWFyaygnY29kZS9hdXhpbGlhcnlXaW5kb3cvZGlkQXBwbHlIVE1MJyk7XG5cblx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHR9XG5cblx0Z2V0V2luZG93KHdpbmRvd0lkOiBudW1iZXIpOiBJQXV4aWxpYXJ5V2luZG93IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy53aW5kb3dzLmdldCh3aW5kb3dJZCk7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSUF1eGlsaWFyeVdpbmRvd1NlcnZpY2UsIEJyb3dzZXJBdXhpbGlhcnlXaW5kb3dTZXJ2aWNlLCBJbnN0YW50aWF0aW9uVHlwZS5EZWxheWVkKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxHQUFHLFdBQVcsYUFBYSxXQUFXLG9CQUFvQix1QkFBdUIsZ0JBQWdCLG1CQUFtQixtQkFBbUIsaUJBQWlCLGVBQWUsYUFBYSxlQUFlLFVBQVUsZ0JBQWdCLHdCQUF3Qix1QkFBdUI7QUFDclIsU0FBUyx3QkFBd0IsMEJBQTBCO0FBQzNELFNBQXFCLGtCQUFrQixrQkFBa0I7QUFDekQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBWSxpQkFBOEIsb0JBQW9CO0FBQ3ZFLFNBQVMsWUFBWTtBQUNyQixTQUFTLFdBQVcsYUFBYTtBQUNqQyxPQUFPLGNBQWM7QUFDckIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFB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QU0sU0FBUztBQUM3RyxzQkFBVSxJQUFJO0FBQUEsVUFDZixXQUdTLEtBQUssYUFBYSxLQUFLLGFBQWEsS0FBSyxZQUFZO0FBQzdELGtCQUFNLGFBQWEsbUJBQW1CLElBQUksS0FBSyxVQUFVO0FBQ3pELGdCQUFJLFlBQVk7QUFDZix5QkFBVyxjQUFjLEtBQUs7QUFBQSxZQUMvQjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBRUEsbUJBQVcsUUFBUSxTQUFTLGNBQWM7QUFDekMsZ0JBQU0sYUFBYSxtQkFBbUIsSUFBSSxJQUFJO0FBQzlDLGNBQUksWUFBWTtBQUNmLHVCQUFXLFlBQVksWUFBWSxVQUFVO0FBQzdDLCtCQUFtQixPQUFPLElBQUk7QUFBQSxVQUMvQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLGtDQUFrQztBQUV2QyxXQUFPLEVBQUUsYUFBYTtBQUFBLEVBQ3ZCO0FBQUEsRUFFUSxVQUFVLGlCQUE2QixhQUEyQztBQUN6RixTQUFLLG9DQUFvQztBQUd6QyxVQUFNLFlBQVksRUFBRSxPQUFPLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFDbEQsYUFBUyxXQUFXLEdBQUcsR0FBRyxHQUFHLEdBQUcsVUFBVTtBQUMxQyxjQUFVLE1BQU0sVUFBVTtBQUMxQixjQUFVLE1BQU0sU0FBUztBQUN6QixjQUFVLE1BQU0sZ0JBQWdCO0FBQ2hDLG9CQUFnQixTQUFTLEtBQUssT0FBTyxTQUFTO0FBRzlDLGdCQUFZLElBQUksZ0JBQWdCLFdBQVcsU0FBUyxpQkFBaUIsZ0JBQWdCLFNBQVMsZUFBZSxDQUFDO0FBQzlHLGdCQUFZLElBQUksZ0JBQWdCLFdBQVcsU0FBUyxNQUFNLGdCQUFnQixTQUFTLElBQUksQ0FBQztBQUN4RixnQkFBWSxJQUFJLGdCQUFnQixLQUFLLGNBQWMsZUFBZSxXQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7QUFFdkYsU0FBSyxtQ0FBbUM7QUFFeEMsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLFVBQVUsVUFBZ0Q7QUFDekQsV0FBTyxLQUFLLFFBQVEsSUFBSSxRQUFRO0FBQUEsRUFDakM7QUFDRDtBQTlUYSw4QkFJRyxhQUFhLFlBQVksVUFBVSxJQUFJO0FBSjFDLGdDQUFOO0FBQUEsRUFZSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBbEJVO0FBZ1ViLGtCQUFrQix5QkFBeUIsK0JBQStCLGtCQUFrQixPQUFPOyIsCiAgIm5hbWVzIjogWyJBdXhpbGlhcnlXaW5kb3dNb2RlIl0KfQo=
