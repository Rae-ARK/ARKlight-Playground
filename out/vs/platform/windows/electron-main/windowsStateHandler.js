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
import electron from "electron";
import { Disposable } from "../../../base/common/lifecycle.js";
import { isMacintosh } from "../../../base/common/platform.js";
import { extUriBiasedIgnorePathCase } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { ILifecycleMainService } from "../../lifecycle/electron-main/lifecycleMainService.js";
import { ILogService } from "../../log/common/log.js";
import { IStateService } from "../../state/node/state.js";
import { IWindowsMainService } from "./windows.js";
import { defaultWindowState, WindowMode } from "../../window/electron-main/window.js";
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from "../../workspace/common/workspace.js";
let WindowsStateHandler = class extends Disposable {
  constructor(windowsMainService, stateService, lifecycleMainService, logService, configurationService) {
    super();
    this.windowsMainService = windowsMainService;
    this.stateService = stateService;
    this.lifecycleMainService = lifecycleMainService;
    this.logService = logService;
    this.configurationService = configurationService;
    this.lastClosedState = void 0;
    this.shuttingDown = false;
    this._state = restoreWindowsState(this.stateService.getItem(WindowsStateHandler.windowsStateStorageKey));
    this.registerListeners();
  }
  get state() {
    return this._state;
  }
  registerListeners() {
    electron.app.on("browser-window-blur", () => {
      if (!this.shuttingDown) {
        this.saveWindowsState();
      }
    });
    this._register(this.lifecycleMainService.onBeforeCloseWindow((window) => this.onBeforeCloseWindow(window)));
    this._register(this.lifecycleMainService.onBeforeShutdown(() => this.onBeforeShutdown()));
    this._register(this.windowsMainService.onDidChangeWindowsCount((e) => {
      if (e.newCount - e.oldCount > 0) {
        this.lastClosedState = void 0;
      }
    }));
    this._register(this.windowsMainService.onDidDestroyWindow((window) => this.onBeforeCloseWindow(window)));
  }
  // Note that onBeforeShutdown() and onBeforeCloseWindow() are fired in different order depending on the OS:
  // - macOS: since the app will not quit when closing the last window, you will always first get
  //          the onBeforeShutdown() event followed by N onBeforeCloseWindow() events for each window
  // - other: on other OS, closing the last window will quit the app so the order depends on the
  //          user interaction: closing the last window will first trigger onBeforeCloseWindow()
  //          and then onBeforeShutdown(). Using the quit action however will first issue onBeforeShutdown()
  //          and then onBeforeCloseWindow().
  //
  // Here is the behavior on different OS depending on action taken (Electron 1.7.x):
  //
  // Legend
  // -  quit(N): quit application with N windows opened
  // - close(1): close one window via the window close button
  // - closeAll: close all windows via the taskbar command
  // - onBeforeShutdown(N): number of windows reported in this event handler
  // - onBeforeCloseWindow(N, M): number of windows reported and quitRequested boolean in this event handler
  //
  // macOS
  // 	-     quit(1): onBeforeShutdown(1), onBeforeCloseWindow(1, true)
  // 	-     quit(2): onBeforeShutdown(2), onBeforeCloseWindow(2, true), onBeforeCloseWindow(2, true)
  // 	-     quit(0): onBeforeShutdown(0)
  // 	-    close(1): onBeforeCloseWindow(1, false)
  //
  // Windows
  // 	-     quit(1): onBeforeShutdown(1), onBeforeCloseWindow(1, true)
  // 	-     quit(2): onBeforeShutdown(2), onBeforeCloseWindow(2, true), onBeforeCloseWindow(2, true)
  // 	-    close(1): onBeforeCloseWindow(2, false)[not last window]
  // 	-    close(1): onBeforeCloseWindow(1, false), onBeforeShutdown(0)[last window]
  // 	- closeAll(2): onBeforeCloseWindow(2, false), onBeforeCloseWindow(2, false), onBeforeShutdown(0)
  //
  // Linux
  // 	-     quit(1): onBeforeShutdown(1), onBeforeCloseWindow(1, true)
  // 	-     quit(2): onBeforeShutdown(2), onBeforeCloseWindow(2, true), onBeforeCloseWindow(2, true)
  // 	-    close(1): onBeforeCloseWindow(2, false)[not last window]
  // 	-    close(1): onBeforeCloseWindow(1, false), onBeforeShutdown(0)[last window]
  // 	- closeAll(2): onBeforeCloseWindow(2, false), onBeforeCloseWindow(2, false), onBeforeShutdown(0)
  //
  onBeforeShutdown() {
    this.shuttingDown = true;
    this.saveWindowsState();
  }
  saveWindowsState() {
    const displaysWithFullScreenWindow = /* @__PURE__ */ new Set();
    const currentWindowsState = {
      openedWindows: [],
      lastPluginDevelopmentHostWindow: this._state.lastPluginDevelopmentHostWindow,
      lastActiveWindow: this.lastClosedState
    };
    if (!currentWindowsState.lastActiveWindow) {
      let activeWindow = this.windowsMainService.getLastActiveWindow();
      if (!activeWindow || activeWindow.isExtensionDevelopmentHost) {
        activeWindow = this.windowsMainService.getWindows().find((window) => !window.isExtensionDevelopmentHost);
      }
      if (activeWindow) {
        currentWindowsState.lastActiveWindow = this.toWindowState(activeWindow);
        if (currentWindowsState.lastActiveWindow.uiState.mode === WindowMode.Fullscreen) {
          displaysWithFullScreenWindow.add(currentWindowsState.lastActiveWindow.uiState.display);
        }
      }
    }
    const extensionHostWindow = this.windowsMainService.getWindows().find((window) => window.isExtensionDevelopmentHost && !window.isExtensionTestHost);
    if (extensionHostWindow) {
      currentWindowsState.lastPluginDevelopmentHostWindow = this.toWindowState(extensionHostWindow);
      if (currentWindowsState.lastPluginDevelopmentHostWindow.uiState.mode === WindowMode.Fullscreen) {
        if (displaysWithFullScreenWindow.has(currentWindowsState.lastPluginDevelopmentHostWindow.uiState.display)) {
          if (isMacintosh && !extensionHostWindow.win?.isSimpleFullScreen()) {
            currentWindowsState.lastPluginDevelopmentHostWindow.uiState.mode = WindowMode.Normal;
          }
        } else {
          displaysWithFullScreenWindow.add(currentWindowsState.lastPluginDevelopmentHostWindow.uiState.display);
        }
      }
    }
    if (this.windowsMainService.getWindowCount() > 1) {
      currentWindowsState.openedWindows = this.windowsMainService.getWindows().filter((window) => !window.isExtensionDevelopmentHost).map((window) => {
        const windowState = this.toWindowState(window);
        if (windowState.uiState.mode === WindowMode.Fullscreen) {
          if (displaysWithFullScreenWindow.has(windowState.uiState.display)) {
            if (isMacintosh && windowState.windowId !== currentWindowsState.lastActiveWindow?.windowId && !window.win?.isSimpleFullScreen()) {
              windowState.uiState.mode = WindowMode.Normal;
            }
          } else {
            displaysWithFullScreenWindow.add(windowState.uiState.display);
          }
        }
        return windowState;
      });
    }
    const state = getWindowsStateStoreData(currentWindowsState);
    this.stateService.setItem(WindowsStateHandler.windowsStateStorageKey, state);
    if (this.shuttingDown) {
      this.logService.trace("[WindowsStateHandler] onBeforeShutdown", state);
    }
  }
  // See note on #onBeforeShutdown() for details how these events are flowing
  onBeforeCloseWindow(window) {
    if (this.lifecycleMainService.quitRequested) {
      return;
    }
    const state = this.toWindowState(window);
    if (window.isExtensionDevelopmentHost && !window.isExtensionTestHost) {
      this._state.lastPluginDevelopmentHostWindow = state;
    } else if (!window.isExtensionDevelopmentHost && window.openedWorkspace) {
      this._state.openedWindows.forEach((openedWindow) => {
        const sameWorkspace = isWorkspaceIdentifier(window.openedWorkspace) && openedWindow.workspace?.id === window.openedWorkspace.id;
        const sameFolder = isSingleFolderWorkspaceIdentifier(window.openedWorkspace) && openedWindow.folderUri && extUriBiasedIgnorePathCase.isEqual(openedWindow.folderUri, window.openedWorkspace.uri);
        if (sameWorkspace || sameFolder) {
          openedWindow.uiState = state.uiState;
        }
      });
    }
    if (this.windowsMainService.getWindowCount() === 1) {
      this.lastClosedState = state;
    }
  }
  toWindowState(window) {
    return {
      windowId: window.id,
      workspace: isWorkspaceIdentifier(window.openedWorkspace) ? window.openedWorkspace : void 0,
      folderUri: isSingleFolderWorkspaceIdentifier(window.openedWorkspace) ? window.openedWorkspace.uri : void 0,
      backupPath: window.backupPath,
      remoteAuthority: window.remoteAuthority,
      uiState: window.serializeWindowState()
    };
  }
  getNewWindowState(configuration) {
    const state = this.doGetNewWindowState(configuration);
    const windowConfig = this.configurationService.getValue("window");
    if (state.mode === WindowMode.Fullscreen) {
      let allowFullscreen;
      if (state.hasDefaultState) {
        allowFullscreen = !!(windowConfig?.newWindowDimensions && ["fullscreen", "inherit", "offset"].indexOf(windowConfig.newWindowDimensions) >= 0);
      } else {
        allowFullscreen = !!(this.lifecycleMainService.wasRestarted || windowConfig?.restoreFullscreen);
      }
      if (!allowFullscreen) {
        state.mode = WindowMode.Normal;
      }
    }
    return state;
  }
  doGetNewWindowState(configuration) {
    const lastActive = this.windowsMainService.getLastActiveWindow();
    if (!configuration.extensionTestsPath) {
      if (!!configuration.extensionDevelopmentPath && this.state.lastPluginDevelopmentHostWindow) {
        return this.state.lastPluginDevelopmentHostWindow.uiState;
      }
      const workspace = configuration.workspace;
      if (isWorkspaceIdentifier(workspace)) {
        const stateForWorkspace = this.state.openedWindows.filter((openedWindow) => openedWindow.workspace && openedWindow.workspace.id === workspace.id).map((openedWindow) => openedWindow.uiState);
        if (stateForWorkspace.length) {
          return stateForWorkspace[0];
        }
      }
      if (isSingleFolderWorkspaceIdentifier(workspace)) {
        const stateForFolder = this.state.openedWindows.filter((openedWindow) => openedWindow.folderUri && extUriBiasedIgnorePathCase.isEqual(openedWindow.folderUri, workspace.uri)).map((openedWindow) => openedWindow.uiState);
        if (stateForFolder.length) {
          return stateForFolder[0];
        }
      } else if (configuration.backupPath) {
        const stateForEmptyWindow = this.state.openedWindows.filter((openedWindow) => openedWindow.backupPath === configuration.backupPath).map((openedWindow) => openedWindow.uiState);
        if (stateForEmptyWindow.length) {
          return stateForEmptyWindow[0];
        }
      }
      const lastActiveState = this.lastClosedState || this.state.lastActiveWindow;
      if (!lastActive && lastActiveState) {
        return lastActiveState.uiState;
      }
    }
    let displayToUse;
    const displays = electron.screen.getAllDisplays();
    if (displays.length === 1) {
      displayToUse = displays[0];
    } else {
      if (isMacintosh) {
        const cursorPoint = electron.screen.getCursorScreenPoint();
        displayToUse = electron.screen.getDisplayNearestPoint(cursorPoint);
      }
      if (!displayToUse && lastActive) {
        displayToUse = electron.screen.getDisplayMatching(lastActive.getBounds());
      }
      if (!displayToUse) {
        displayToUse = electron.screen.getPrimaryDisplay() || displays[0];
      }
    }
    let state = defaultWindowState(void 0, isWorkspaceIdentifier(configuration.workspace) || isSingleFolderWorkspaceIdentifier(configuration.workspace));
    state.x = Math.round(displayToUse.bounds.x + displayToUse.bounds.width / 2 - state.width / 2);
    state.y = Math.round(displayToUse.bounds.y + displayToUse.bounds.height / 2 - state.height / 2);
    const windowConfig = this.configurationService.getValue("window");
    let ensureNoOverlap = true;
    if (windowConfig?.newWindowDimensions) {
      if (windowConfig.newWindowDimensions === "maximized") {
        state.mode = WindowMode.Maximized;
        ensureNoOverlap = false;
      } else if (windowConfig.newWindowDimensions === "fullscreen") {
        state.mode = WindowMode.Fullscreen;
        ensureNoOverlap = false;
      } else if ((windowConfig.newWindowDimensions === "inherit" || windowConfig.newWindowDimensions === "offset") && lastActive) {
        const lastActiveState = lastActive.serializeWindowState();
        if (lastActiveState.mode === WindowMode.Fullscreen) {
          state.mode = WindowMode.Fullscreen;
        } else {
          state = {
            ...lastActiveState,
            zoomLevel: void 0
            // do not inherit zoom level
          };
        }
        ensureNoOverlap = state.mode !== WindowMode.Fullscreen && windowConfig.newWindowDimensions === "offset";
      }
    }
    if (ensureNoOverlap) {
      state = this.ensureNoOverlap(state);
    }
    state.hasDefaultState = true;
    return state;
  }
  ensureNoOverlap(state) {
    if (this.windowsMainService.getWindows().length === 0) {
      return state;
    }
    state.x = typeof state.x === "number" ? state.x : 0;
    state.y = typeof state.y === "number" ? state.y : 0;
    const existingWindowBounds = this.windowsMainService.getWindows().map((window) => window.getBounds());
    while (existingWindowBounds.some((bounds) => bounds.x === state.x || bounds.y === state.y)) {
      state.x += 30;
      state.y += 30;
    }
    return state;
  }
};
WindowsStateHandler.windowsStateStorageKey = "windowsState";
WindowsStateHandler = __decorateClass([
  __decorateParam(0, IWindowsMainService),
  __decorateParam(1, IStateService),
  __decorateParam(2, ILifecycleMainService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IConfigurationService)
], WindowsStateHandler);
function restoreWindowsState(data) {
  const result = { openedWindows: [] };
  const windowsState = data || { openedWindows: [] };
  if (windowsState.lastActiveWindow) {
    result.lastActiveWindow = restoreWindowState(windowsState.lastActiveWindow);
  }
  if (windowsState.lastPluginDevelopmentHostWindow) {
    result.lastPluginDevelopmentHostWindow = restoreWindowState(windowsState.lastPluginDevelopmentHostWindow);
  }
  if (Array.isArray(windowsState.openedWindows)) {
    result.openedWindows = windowsState.openedWindows.map((windowState) => restoreWindowState(windowState));
  }
  return result;
}
function restoreWindowState(windowState) {
  const result = { uiState: windowState.uiState };
  if (windowState.backupPath) {
    result.backupPath = windowState.backupPath;
  }
  if (windowState.remoteAuthority) {
    result.remoteAuthority = windowState.remoteAuthority;
  }
  if (windowState.folder) {
    result.folderUri = URI.parse(windowState.folder);
  }
  if (windowState.workspaceIdentifier) {
    result.workspace = { id: windowState.workspaceIdentifier.id, configPath: URI.parse(windowState.workspaceIdentifier.configURIPath) };
  }
  return result;
}
function getWindowsStateStoreData(windowsState) {
  return {
    lastActiveWindow: windowsState.lastActiveWindow && serializeWindowState(windowsState.lastActiveWindow),
    lastPluginDevelopmentHostWindow: windowsState.lastPluginDevelopmentHostWindow && serializeWindowState(windowsState.lastPluginDevelopmentHostWindow),
    openedWindows: windowsState.openedWindows.map((ws) => serializeWindowState(ws))
  };
}
function serializeWindowState(windowState) {
  return {
    workspaceIdentifier: windowState.workspace && { id: windowState.workspace.id, configURIPath: windowState.workspace.configPath.toString() },
    folder: windowState.folderUri?.toString(),
    backupPath: windowState.backupPath,
    remoteAuthority: windowState.remoteAuthority,
    uiState: windowState.uiState
  };
}
export {
  WindowsStateHandler,
  getWindowsStateStoreData,
  restoreWindowsState
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3dpbmRvd3MvZWxlY3Ryb24tbWFpbi93aW5kb3dzU3RhdGVIYW5kbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGVsZWN0cm9uIGZyb20gJ2VsZWN0cm9uJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlTWFpblNlcnZpY2UgfSBmcm9tICcuLi8uLi9saWZlY3ljbGUvZWxlY3Ryb24tbWFpbi9saWZlY3ljbGVNYWluU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElTdGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9zdGF0ZS9ub2RlL3N0YXRlLmpzJztcbmltcG9ydCB7IElOYXRpdmVXaW5kb3dDb25maWd1cmF0aW9uLCBJV2luZG93U2V0dGluZ3MgfSBmcm9tICcuLi8uLi93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBJV2luZG93c01haW5TZXJ2aWNlIH0gZnJvbSAnLi93aW5kb3dzLmpzJztcbmltcG9ydCB7IGRlZmF1bHRXaW5kb3dTdGF0ZSwgSUNvZGVXaW5kb3csIElXaW5kb3dTdGF0ZSBhcyBJV2luZG93VUlTdGF0ZSwgV2luZG93TW9kZSB9IGZyb20gJy4uLy4uL3dpbmRvdy9lbGVjdHJvbi1tYWluL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIsIGlzV29ya3NwYWNlSWRlbnRpZmllciwgSVdvcmtzcGFjZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdpbmRvd1N0YXRlIHtcblx0cmVhZG9ubHkgd2luZG93SWQ/OiBudW1iZXI7XG5cdHdvcmtzcGFjZT86IElXb3Jrc3BhY2VJZGVudGlmaWVyO1xuXHRmb2xkZXJVcmk/OiBVUkk7XG5cdGJhY2t1cFBhdGg/OiBzdHJpbmc7XG5cdHJlbW90ZUF1dGhvcml0eT86IHN0cmluZztcblx0dWlTdGF0ZTogSVdpbmRvd1VJU3RhdGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdpbmRvd3NTdGF0ZSB7XG5cdGxhc3RBY3RpdmVXaW5kb3c/OiBJV2luZG93U3RhdGU7XG5cdGxhc3RQbHVnaW5EZXZlbG9wbWVudEhvc3RXaW5kb3c/OiBJV2luZG93U3RhdGU7XG5cdG9wZW5lZFdpbmRvd3M6IElXaW5kb3dTdGF0ZVtdO1xufVxuXG5pbnRlcmZhY2UgSU5ld1dpbmRvd1N0YXRlIGV4dGVuZHMgSVdpbmRvd1VJU3RhdGUge1xuXHRoYXNEZWZhdWx0U3RhdGU/OiBib29sZWFuO1xufVxuXG5pbnRlcmZhY2UgSVNlcmlhbGl6ZWRXaW5kb3dzU3RhdGUge1xuXHRyZWFkb25seSBsYXN0QWN0aXZlV2luZG93PzogSVNlcmlhbGl6ZWRXaW5kb3dTdGF0ZTtcblx0cmVhZG9ubHkgbGFzdFBsdWdpbkRldmVsb3BtZW50SG9zdFdpbmRvdz86IElTZXJpYWxpemVkV2luZG93U3RhdGU7XG5cdHJlYWRvbmx5IG9wZW5lZFdpbmRvd3M6IElTZXJpYWxpemVkV2luZG93U3RhdGVbXTtcbn1cblxuaW50ZXJmYWNlIElTZXJpYWxpemVkV2luZG93U3RhdGUge1xuXHRyZWFkb25seSB3b3Jrc3BhY2VJZGVudGlmaWVyPzogeyBpZDogc3RyaW5nOyBjb25maWdVUklQYXRoOiBzdHJpbmcgfTtcblx0cmVhZG9ubHkgZm9sZGVyPzogc3RyaW5nO1xuXHRyZWFkb25seSBiYWNrdXBQYXRoPzogc3RyaW5nO1xuXHRyZWFkb25seSByZW1vdGVBdXRob3JpdHk/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHVpU3RhdGU6IElXaW5kb3dVSVN0YXRlO1xufVxuXG5leHBvcnQgY2xhc3MgV2luZG93c1N0YXRlSGFuZGxlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IHdpbmRvd3NTdGF0ZVN0b3JhZ2VLZXkgPSAnd2luZG93c1N0YXRlJztcblxuXHRnZXQgc3RhdGUoKSB7IHJldHVybiB0aGlzLl9zdGF0ZTsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZTogSVdpbmRvd3NTdGF0ZTtcblxuXHRwcml2YXRlIGxhc3RDbG9zZWRTdGF0ZTogSVdpbmRvd1N0YXRlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgc2h1dHRpbmdEb3duID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElXaW5kb3dzTWFpblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3aW5kb3dzTWFpblNlcnZpY2U6IElXaW5kb3dzTWFpblNlcnZpY2UsXG5cdFx0QElTdGF0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdGF0ZVNlcnZpY2U6IElTdGF0ZVNlcnZpY2UsXG5cdFx0QElMaWZlY3ljbGVNYWluU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxpZmVjeWNsZU1haW5TZXJ2aWNlOiBJTGlmZWN5Y2xlTWFpblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3N0YXRlID0gcmVzdG9yZVdpbmRvd3NTdGF0ZSh0aGlzLnN0YXRlU2VydmljZS5nZXRJdGVtPElTZXJpYWxpemVkV2luZG93c1N0YXRlPihXaW5kb3dzU3RhdGVIYW5kbGVyLndpbmRvd3NTdGF0ZVN0b3JhZ2VLZXkpKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cblx0XHQvLyBXaGVuIGEgd2luZG93IGxvb3NlcyBmb2N1cywgc2F2ZSBhbGwgd2luZG93cyBzdGF0ZS4gVGhpcyBhbGxvd3MgdG9cblx0XHQvLyBwcmV2ZW50IGxvc3Mgb2Ygd2luZG93LXN0YXRlIGRhdGEgd2hlbiBPUyBpcyByZXN0YXJ0ZWQgd2l0aG91dCBwcm9wZXJseVxuXHRcdC8vIHNodXR0aW5nIGRvd24gdGhlIGFwcGxpY2F0aW9uIChodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvODcxNzEpXG5cdFx0ZWxlY3Ryb24uYXBwLm9uKCdicm93c2VyLXdpbmRvdy1ibHVyJywgKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnNodXR0aW5nRG93bikge1xuXHRcdFx0XHR0aGlzLnNhdmVXaW5kb3dzU3RhdGUoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdC8vIEhhbmRsZSB2YXJpb3VzIGxpZmVjeWNsZSBldmVudHMgYXJvdW5kIHdpbmRvd3Ncblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLm9uQmVmb3JlQ2xvc2VXaW5kb3cod2luZG93ID0+IHRoaXMub25CZWZvcmVDbG9zZVdpbmRvdyh3aW5kb3cpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5saWZlY3ljbGVNYWluU2VydmljZS5vbkJlZm9yZVNodXRkb3duKCgpID0+IHRoaXMub25CZWZvcmVTaHV0ZG93bigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy53aW5kb3dzTWFpblNlcnZpY2Uub25EaWRDaGFuZ2VXaW5kb3dzQ291bnQoZSA9PiB7XG5cdFx0XHRpZiAoZS5uZXdDb3VudCAtIGUub2xkQ291bnQgPiAwKSB7XG5cdFx0XHRcdC8vIGNsZWFyIGxhc3QgY2xvc2VkIHdpbmRvdyBzdGF0ZSB3aGVuIGEgbmV3IHdpbmRvdyBvcGVucy4gdGhpcyBoZWxwcyBvbiBtYWNPUyB3aGVyZVxuXHRcdFx0XHQvLyBvdGhlcndpc2UgY2xvc2luZyB0aGUgbGFzdCB3aW5kb3csIG9wZW5pbmcgYSBuZXcgd2luZG93IGFuZCB0aGVuIHF1aXR0aW5nIHdvdWxkXG5cdFx0XHRcdC8vIHVzZSB0aGUgc3RhdGUgb2YgdGhlIHByZXZpb3VzbHkgY2xvc2VkIHdpbmRvdyB3aGVuIHJlc3RhcnRpbmcuXG5cdFx0XHRcdHRoaXMubGFzdENsb3NlZFN0YXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIHRyeSB0byBzYXZlIHN0YXRlIGJlZm9yZSBkZXN0cm95IGJlY2F1c2UgY2xvc2Ugd2lsbCBub3QgZmlyZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2luZG93c01haW5TZXJ2aWNlLm9uRGlkRGVzdHJveVdpbmRvdyh3aW5kb3cgPT4gdGhpcy5vbkJlZm9yZUNsb3NlV2luZG93KHdpbmRvdykpKTtcblx0fVxuXG5cdC8vIE5vdGUgdGhhdCBvbkJlZm9yZVNodXRkb3duKCkgYW5kIG9uQmVmb3JlQ2xvc2VXaW5kb3coKSBhcmUgZmlyZWQgaW4gZGlmZmVyZW50IG9yZGVyIGRlcGVuZGluZyBvbiB0aGUgT1M6XG5cdC8vIC0gbWFjT1M6IHNpbmNlIHRoZSBhcHAgd2lsbCBub3QgcXVpdCB3aGVuIGNsb3NpbmcgdGhlIGxhc3Qgd2luZG93LCB5b3Ugd2lsbCBhbHdheXMgZmlyc3QgZ2V0XG5cdC8vICAgICAgICAgIHRoZSBvbkJlZm9yZVNodXRkb3duKCkgZXZlbnQgZm9sbG93ZWQgYnkgTiBvbkJlZm9yZUNsb3NlV2luZG93KCkgZXZlbnRzIGZvciBlYWNoIHdpbmRvd1xuXHQvLyAtIG90aGVyOiBvbiBvdGhlciBPUywgY2xvc2luZyB0aGUgbGFzdCB3aW5kb3cgd2lsbCBxdWl0IHRoZSBhcHAgc28gdGhlIG9yZGVyIGRlcGVuZHMgb24gdGhlXG5cdC8vICAgICAgICAgIHVzZXIgaW50ZXJhY3Rpb246IGNsb3NpbmcgdGhlIGxhc3Qgd2luZG93IHdpbGwgZmlyc3QgdHJpZ2dlciBvbkJlZm9yZUNsb3NlV2luZG93KClcblx0Ly8gICAgICAgICAgYW5kIHRoZW4gb25CZWZvcmVTaHV0ZG93bigpLiBVc2luZyB0aGUgcXVpdCBhY3Rpb24gaG93ZXZlciB3aWxsIGZpcnN0IGlzc3VlIG9uQmVmb3JlU2h1dGRvd24oKVxuXHQvLyAgICAgICAgICBhbmQgdGhlbiBvbkJlZm9yZUNsb3NlV2luZG93KCkuXG5cdC8vXG5cdC8vIEhlcmUgaXMgdGhlIGJlaGF2aW9yIG9uIGRpZmZlcmVudCBPUyBkZXBlbmRpbmcgb24gYWN0aW9uIHRha2VuIChFbGVjdHJvbiAxLjcueCk6XG5cdC8vXG5cdC8vIExlZ2VuZFxuXHQvLyAtICBxdWl0KE4pOiBxdWl0IGFwcGxpY2F0aW9uIHdpdGggTiB3aW5kb3dzIG9wZW5lZFxuXHQvLyAtIGNsb3NlKDEpOiBjbG9zZSBvbmUgd2luZG93IHZpYSB0aGUgd2luZG93IGNsb3NlIGJ1dHRvblxuXHQvLyAtIGNsb3NlQWxsOiBjbG9zZSBhbGwgd2luZG93cyB2aWEgdGhlIHRhc2tiYXIgY29tbWFuZFxuXHQvLyAtIG9uQmVmb3JlU2h1dGRvd24oTik6IG51bWJlciBvZiB3aW5kb3dzIHJlcG9ydGVkIGluIHRoaXMgZXZlbnQgaGFuZGxlclxuXHQvLyAtIG9uQmVmb3JlQ2xvc2VXaW5kb3coTiwgTSk6IG51bWJlciBvZiB3aW5kb3dzIHJlcG9ydGVkIGFuZCBxdWl0UmVxdWVzdGVkIGJvb2xlYW4gaW4gdGhpcyBldmVudCBoYW5kbGVyXG5cdC8vXG5cdC8vIG1hY09TXG5cdC8vIFx0LSAgICAgcXVpdCgxKTogb25CZWZvcmVTaHV0ZG93bigxKSwgb25CZWZvcmVDbG9zZVdpbmRvdygxLCB0cnVlKVxuXHQvLyBcdC0gICAgIHF1aXQoMik6IG9uQmVmb3JlU2h1dGRvd24oMiksIG9uQmVmb3JlQ2xvc2VXaW5kb3coMiwgdHJ1ZSksIG9uQmVmb3JlQ2xvc2VXaW5kb3coMiwgdHJ1ZSlcblx0Ly8gXHQtICAgICBxdWl0KDApOiBvbkJlZm9yZVNodXRkb3duKDApXG5cdC8vIFx0LSAgICBjbG9zZSgxKTogb25CZWZvcmVDbG9zZVdpbmRvdygxLCBmYWxzZSlcblx0Ly9cblx0Ly8gV2luZG93c1xuXHQvLyBcdC0gICAgIHF1aXQoMSk6IG9uQmVmb3JlU2h1dGRvd24oMSksIG9uQmVmb3JlQ2xvc2VXaW5kb3coMSwgdHJ1ZSlcblx0Ly8gXHQtICAgICBxdWl0KDIpOiBvbkJlZm9yZVNodXRkb3duKDIpLCBvbkJlZm9yZUNsb3NlV2luZG93KDIsIHRydWUpLCBvbkJlZm9yZUNsb3NlV2luZG93KDIsIHRydWUpXG5cdC8vIFx0LSAgICBjbG9zZSgxKTogb25CZWZvcmVDbG9zZVdpbmRvdygyLCBmYWxzZSlbbm90IGxhc3Qgd2luZG93XVxuXHQvLyBcdC0gICAgY2xvc2UoMSk6IG9uQmVmb3JlQ2xvc2VXaW5kb3coMSwgZmFsc2UpLCBvbkJlZm9yZVNodXRkb3duKDApW2xhc3Qgd2luZG93XVxuXHQvLyBcdC0gY2xvc2VBbGwoMik6IG9uQmVmb3JlQ2xvc2VXaW5kb3coMiwgZmFsc2UpLCBvbkJlZm9yZUNsb3NlV2luZG93KDIsIGZhbHNlKSwgb25CZWZvcmVTaHV0ZG93bigwKVxuXHQvL1xuXHQvLyBMaW51eFxuXHQvLyBcdC0gICAgIHF1aXQoMSk6IG9uQmVmb3JlU2h1dGRvd24oMSksIG9uQmVmb3JlQ2xvc2VXaW5kb3coMSwgdHJ1ZSlcblx0Ly8gXHQtICAgICBxdWl0KDIpOiBvbkJlZm9yZVNodXRkb3duKDIpLCBvbkJlZm9yZUNsb3NlV2luZG93KDIsIHRydWUpLCBvbkJlZm9yZUNsb3NlV2luZG93KDIsIHRydWUpXG5cdC8vIFx0LSAgICBjbG9zZSgxKTogb25CZWZvcmVDbG9zZVdpbmRvdygyLCBmYWxzZSlbbm90IGxhc3Qgd2luZG93XVxuXHQvLyBcdC0gICAgY2xvc2UoMSk6IG9uQmVmb3JlQ2xvc2VXaW5kb3coMSwgZmFsc2UpLCBvbkJlZm9yZVNodXRkb3duKDApW2xhc3Qgd2luZG93XVxuXHQvLyBcdC0gY2xvc2VBbGwoMik6IG9uQmVmb3JlQ2xvc2VXaW5kb3coMiwgZmFsc2UpLCBvbkJlZm9yZUNsb3NlV2luZG93KDIsIGZhbHNlKSwgb25CZWZvcmVTaHV0ZG93bigwKVxuXHQvL1xuXHRwcml2YXRlIG9uQmVmb3JlU2h1dGRvd24oKTogdm9pZCB7XG5cdFx0dGhpcy5zaHV0dGluZ0Rvd24gPSB0cnVlO1xuXG5cdFx0dGhpcy5zYXZlV2luZG93c1N0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIHNhdmVXaW5kb3dzU3RhdGUoKTogdm9pZCB7XG5cblx0XHQvLyBUT0RPQGVsZWN0cm9uIHdvcmthcm91bmQgZm9yIEVsZWN0cm9uIG5vdCBiZWluZyBhYmxlIHRvIHJlc3RvcmVcblx0XHQvLyBtdWx0aXBsZSAobmF0aXZlKSBmdWxsc2NyZWVuIHdpbmRvd3Mgb24gdGhlIHNhbWUgZGlzcGxheSBhdCBvbmNlXG5cdFx0Ly8gb24gbWFjT1MuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL2VsZWN0cm9uL2VsZWN0cm9uL2lzc3Vlcy8zNDM2N1xuXHRcdGNvbnN0IGRpc3BsYXlzV2l0aEZ1bGxTY3JlZW5XaW5kb3cgPSBuZXcgU2V0PG51bWJlciB8IHVuZGVmaW5lZD4oKTtcblxuXHRcdGNvbnN0IGN1cnJlbnRXaW5kb3dzU3RhdGU6IElXaW5kb3dzU3RhdGUgPSB7XG5cdFx0XHRvcGVuZWRXaW5kb3dzOiBbXSxcblx0XHRcdGxhc3RQbHVnaW5EZXZlbG9wbWVudEhvc3RXaW5kb3c6IHRoaXMuX3N0YXRlLmxhc3RQbHVnaW5EZXZlbG9wbWVudEhvc3RXaW5kb3csXG5cdFx0XHRsYXN0QWN0aXZlV2luZG93OiB0aGlzLmxhc3RDbG9zZWRTdGF0ZVxuXHRcdH07XG5cblx0XHQvLyAxLikgRmluZCBhIGxhc3QgYWN0aXZlIHdpbmRvdyAocGljayBhbnkgb3RoZXIgZmlyc3Qgd2luZG93IG90aGVyd2lzZSlcblx0XHRpZiAoIWN1cnJlbnRXaW5kb3dzU3RhdGUubGFzdEFjdGl2ZVdpbmRvdykge1xuXHRcdFx0bGV0IGFjdGl2ZVdpbmRvdyA9IHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldExhc3RBY3RpdmVXaW5kb3coKTtcblx0XHRcdGlmICghYWN0aXZlV2luZG93IHx8IGFjdGl2ZVdpbmRvdy5pc0V4dGVuc2lvbkRldmVsb3BtZW50SG9zdCkge1xuXHRcdFx0XHRhY3RpdmVXaW5kb3cgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRXaW5kb3dzKCkuZmluZCh3aW5kb3cgPT4gIXdpbmRvdy5pc0V4dGVuc2lvbkRldmVsb3BtZW50SG9zdCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhY3RpdmVXaW5kb3cpIHtcblx0XHRcdFx0Y3VycmVudFdpbmRvd3NTdGF0ZS5sYXN0QWN0aXZlV2luZG93ID0gdGhpcy50b1dpbmRvd1N0YXRlKGFjdGl2ZVdpbmRvdyk7XG5cblx0XHRcdFx0aWYgKGN1cnJlbnRXaW5kb3dzU3RhdGUubGFzdEFjdGl2ZVdpbmRvdy51aVN0YXRlLm1vZGUgPT09IFdpbmRvd01vZGUuRnVsbHNjcmVlbikge1xuXHRcdFx0XHRcdGRpc3BsYXlzV2l0aEZ1bGxTY3JlZW5XaW5kb3cuYWRkKGN1cnJlbnRXaW5kb3dzU3RhdGUubGFzdEFjdGl2ZVdpbmRvdy51aVN0YXRlLmRpc3BsYXkpOyAvLyBhbHdheXMgYWxsb3cgZnVsbHNjcmVlbiBmb3IgYWN0aXZlIHdpbmRvd1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gMi4pIEZpbmQgZXh0ZW5zaW9uIGhvc3Qgd2luZG93XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSG9zdFdpbmRvdyA9IHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd3MoKS5maW5kKHdpbmRvdyA9PiB3aW5kb3cuaXNFeHRlbnNpb25EZXZlbG9wbWVudEhvc3QgJiYgIXdpbmRvdy5pc0V4dGVuc2lvblRlc3RIb3N0KTtcblx0XHRpZiAoZXh0ZW5zaW9uSG9zdFdpbmRvdykge1xuXHRcdFx0Y3VycmVudFdpbmRvd3NTdGF0ZS5sYXN0UGx1Z2luRGV2ZWxvcG1lbnRIb3N0V2luZG93ID0gdGhpcy50b1dpbmRvd1N0YXRlKGV4dGVuc2lvbkhvc3RXaW5kb3cpO1xuXG5cdFx0XHRpZiAoY3VycmVudFdpbmRvd3NTdGF0ZS5sYXN0UGx1Z2luRGV2ZWxvcG1lbnRIb3N0V2luZG93LnVpU3RhdGUubW9kZSA9PT0gV2luZG93TW9kZS5GdWxsc2NyZWVuKSB7XG5cdFx0XHRcdGlmIChkaXNwbGF5c1dpdGhGdWxsU2NyZWVuV2luZG93LmhhcyhjdXJyZW50V2luZG93c1N0YXRlLmxhc3RQbHVnaW5EZXZlbG9wbWVudEhvc3RXaW5kb3cudWlTdGF0ZS5kaXNwbGF5KSkge1xuXHRcdFx0XHRcdGlmIChpc01hY2ludG9zaCAmJiAhZXh0ZW5zaW9uSG9zdFdpbmRvdy53aW4/LmlzU2ltcGxlRnVsbFNjcmVlbigpKSB7XG5cdFx0XHRcdFx0XHRjdXJyZW50V2luZG93c1N0YXRlLmxhc3RQbHVnaW5EZXZlbG9wbWVudEhvc3RXaW5kb3cudWlTdGF0ZS5tb2RlID0gV2luZG93TW9kZS5Ob3JtYWw7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGRpc3BsYXlzV2l0aEZ1bGxTY3JlZW5XaW5kb3cuYWRkKGN1cnJlbnRXaW5kb3dzU3RhdGUubGFzdFBsdWdpbkRldmVsb3BtZW50SG9zdFdpbmRvdy51aVN0YXRlLmRpc3BsYXkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gMy4pIEFsbCB3aW5kb3dzIChleGNlcHQgZXh0ZW5zaW9uIGhvc3QpIGZvciBOID49IDIgdG8gc3VwcG9ydCBgcmVzdG9yZVdpbmRvd3M6IGFsbGAgb3IgZm9yIGF1dG8gdXBkYXRlXG5cdFx0Ly9cblx0XHQvLyBDYXJlZnVsIGhlcmU6IGFza2luZyBhIHdpbmRvdyBmb3IgaXRzIHdpbmRvdyBzdGF0ZSBhZnRlciBpdCBoYXMgYmVlbiBjbG9zZWQgcmV0dXJucyBib2d1cyB2YWx1ZXMgKHdpZHRoOiAwLCBoZWlnaHQ6IDApXG5cdFx0Ly8gc28gaWYgd2UgZXZlciB3YW50IHRvIHBlcnNpc3QgdGhlIFVJIHN0YXRlIG9mIHRoZSBsYXN0IGNsb3NlZCB3aW5kb3cgKHdpbmRvdyBjb3VudCA9PT0gMSksIGl0IGhhc1xuXHRcdC8vIHRvIGNvbWUgZnJvbSB0aGUgc3RvcmVkIGxhc3RDbG9zZWRXaW5kb3dTdGF0ZSBvbiBXaW4vTGludXggYXQgbGVhc3Rcblx0XHRpZiAodGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93Q291bnQoKSA+IDEpIHtcblx0XHRcdGN1cnJlbnRXaW5kb3dzU3RhdGUub3BlbmVkV2luZG93cyA9IHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd3MoKS5maWx0ZXIod2luZG93ID0+ICF3aW5kb3cuaXNFeHRlbnNpb25EZXZlbG9wbWVudEhvc3QpLm1hcCh3aW5kb3cgPT4ge1xuXHRcdFx0XHRjb25zdCB3aW5kb3dTdGF0ZSA9IHRoaXMudG9XaW5kb3dTdGF0ZSh3aW5kb3cpO1xuXG5cdFx0XHRcdGlmICh3aW5kb3dTdGF0ZS51aVN0YXRlLm1vZGUgPT09IFdpbmRvd01vZGUuRnVsbHNjcmVlbikge1xuXHRcdFx0XHRcdGlmIChkaXNwbGF5c1dpdGhGdWxsU2NyZWVuV2luZG93Lmhhcyh3aW5kb3dTdGF0ZS51aVN0YXRlLmRpc3BsYXkpKSB7XG5cdFx0XHRcdFx0XHRpZiAoaXNNYWNpbnRvc2ggJiYgd2luZG93U3RhdGUud2luZG93SWQgIT09IGN1cnJlbnRXaW5kb3dzU3RhdGUubGFzdEFjdGl2ZVdpbmRvdz8ud2luZG93SWQgJiYgIXdpbmRvdy53aW4/LmlzU2ltcGxlRnVsbFNjcmVlbigpKSB7XG5cdFx0XHRcdFx0XHRcdHdpbmRvd1N0YXRlLnVpU3RhdGUubW9kZSA9IFdpbmRvd01vZGUuTm9ybWFsO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRkaXNwbGF5c1dpdGhGdWxsU2NyZWVuV2luZG93LmFkZCh3aW5kb3dTdGF0ZS51aVN0YXRlLmRpc3BsYXkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiB3aW5kb3dTdGF0ZTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIFBlcnNpc3Rcblx0XHRjb25zdCBzdGF0ZSA9IGdldFdpbmRvd3NTdGF0ZVN0b3JlRGF0YShjdXJyZW50V2luZG93c1N0YXRlKTtcblx0XHR0aGlzLnN0YXRlU2VydmljZS5zZXRJdGVtKFdpbmRvd3NTdGF0ZUhhbmRsZXIud2luZG93c1N0YXRlU3RvcmFnZUtleSwgc3RhdGUpO1xuXG5cdFx0aWYgKHRoaXMuc2h1dHRpbmdEb3duKSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tXaW5kb3dzU3RhdGVIYW5kbGVyXSBvbkJlZm9yZVNodXRkb3duJywgc3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdC8vIFNlZSBub3RlIG9uICNvbkJlZm9yZVNodXRkb3duKCkgZm9yIGRldGFpbHMgaG93IHRoZXNlIGV2ZW50cyBhcmUgZmxvd2luZ1xuXHRwcml2YXRlIG9uQmVmb3JlQ2xvc2VXaW5kb3cod2luZG93OiBJQ29kZVdpbmRvdyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxpZmVjeWNsZU1haW5TZXJ2aWNlLnF1aXRSZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybjsgLy8gZHVyaW5nIHF1aXQsIG1hbnkgd2luZG93cyBjbG9zZSBpbiBwYXJhbGxlbCBzbyBsZXQgaXQgYmUgaGFuZGxlZCBpbiB0aGUgYmVmb3JlLXF1aXQgaGFuZGxlclxuXHRcdH1cblxuXHRcdC8vIE9uIFdpbmRvdyBjbG9zZSwgdXBkYXRlIG91ciBzdG9yZWQgVUkgc3RhdGUgb2YgdGhpcyB3aW5kb3dcblx0XHRjb25zdCBzdGF0ZTogSVdpbmRvd1N0YXRlID0gdGhpcy50b1dpbmRvd1N0YXRlKHdpbmRvdyk7XG5cdFx0aWYgKHdpbmRvdy5pc0V4dGVuc2lvbkRldmVsb3BtZW50SG9zdCAmJiAhd2luZG93LmlzRXh0ZW5zaW9uVGVzdEhvc3QpIHtcblx0XHRcdHRoaXMuX3N0YXRlLmxhc3RQbHVnaW5EZXZlbG9wbWVudEhvc3RXaW5kb3cgPSBzdGF0ZTsgLy8gZG8gbm90IGxldCB0ZXN0IHJ1biB3aW5kb3cgc3RhdGUgb3ZlcndyaXRlIG91ciBleHRlbnNpb24gZGV2ZWxvcG1lbnQgc3RhdGVcblx0XHR9XG5cblx0XHQvLyBBbnkgbm9uIGV4dGVuc2lvbiBob3N0IHdpbmRvdyB3aXRoIHNhbWUgd29ya3NwYWNlIG9yIGZvbGRlclxuXHRcdGVsc2UgaWYgKCF3aW5kb3cuaXNFeHRlbnNpb25EZXZlbG9wbWVudEhvc3QgJiYgd2luZG93Lm9wZW5lZFdvcmtzcGFjZSkge1xuXHRcdFx0dGhpcy5fc3RhdGUub3BlbmVkV2luZG93cy5mb3JFYWNoKG9wZW5lZFdpbmRvdyA9PiB7XG5cdFx0XHRcdGNvbnN0IHNhbWVXb3Jrc3BhY2UgPSBpc1dvcmtzcGFjZUlkZW50aWZpZXIod2luZG93Lm9wZW5lZFdvcmtzcGFjZSkgJiYgb3BlbmVkV2luZG93LndvcmtzcGFjZT8uaWQgPT09IHdpbmRvdy5vcGVuZWRXb3Jrc3BhY2UuaWQ7XG5cdFx0XHRcdGNvbnN0IHNhbWVGb2xkZXIgPSBpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIod2luZG93Lm9wZW5lZFdvcmtzcGFjZSkgJiYgb3BlbmVkV2luZG93LmZvbGRlclVyaSAmJiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKG9wZW5lZFdpbmRvdy5mb2xkZXJVcmksIHdpbmRvdy5vcGVuZWRXb3Jrc3BhY2UudXJpKTtcblxuXHRcdFx0XHRpZiAoc2FtZVdvcmtzcGFjZSB8fCBzYW1lRm9sZGVyKSB7XG5cdFx0XHRcdFx0b3BlbmVkV2luZG93LnVpU3RhdGUgPSBzdGF0ZS51aVN0YXRlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBPbiBXaW5kb3dzIGFuZCBMaW51eCBjbG9zaW5nIHRoZSBsYXN0IHdpbmRvdyB3aWxsIHRyaWdnZXIgcXVpdC4gU2luY2Ugd2UgYXJlIHN0b3JpbmcgYWxsIFVJIHN0YXRlXG5cdFx0Ly8gYmVmb3JlIHF1aXR0aW5nLCB3ZSBuZWVkIHRvIHJlbWVtYmVyIHRoZSBVSSBzdGF0ZSBvZiB0aGlzIHdpbmRvdyB0byBiZSBhYmxlIHRvIHBlcnNpc3QgaXQuXG5cdFx0Ly8gT24gbWFjT1Mgd2Uga2VlcCB0aGUgbGFzdCBjbG9zZWQgd2luZG93IHN0YXRlIHJlYWR5IGluIGNhc2UgdGhlIHVzZXIgd2FudHMgdG8gcXVpdCByaWdodCBhZnRlciBvclxuXHRcdC8vIHdhbnRzIHRvIG9wZW4gYW5vdGhlciB3aW5kb3csIGluIHdoaWNoIGNhc2Ugd2UgdXNlIHRoaXMgc3RhdGUgb3ZlciB0aGUgcGVyc2lzdGVkIG9uZS5cblx0XHRpZiAodGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93Q291bnQoKSA9PT0gMSkge1xuXHRcdFx0dGhpcy5sYXN0Q2xvc2VkU3RhdGUgPSBzdGF0ZTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHRvV2luZG93U3RhdGUod2luZG93OiBJQ29kZVdpbmRvdyk6IElXaW5kb3dTdGF0ZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHdpbmRvd0lkOiB3aW5kb3cuaWQsXG5cdFx0XHR3b3Jrc3BhY2U6IGlzV29ya3NwYWNlSWRlbnRpZmllcih3aW5kb3cub3BlbmVkV29ya3NwYWNlKSA/IHdpbmRvdy5vcGVuZWRXb3Jrc3BhY2UgOiB1bmRlZmluZWQsXG5cdFx0XHRmb2xkZXJVcmk6IGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllcih3aW5kb3cub3BlbmVkV29ya3NwYWNlKSA/IHdpbmRvdy5vcGVuZWRXb3Jrc3BhY2UudXJpIDogdW5kZWZpbmVkLFxuXHRcdFx0YmFja3VwUGF0aDogd2luZG93LmJhY2t1cFBhdGgsXG5cdFx0XHRyZW1vdGVBdXRob3JpdHk6IHdpbmRvdy5yZW1vdGVBdXRob3JpdHksXG5cdFx0XHR1aVN0YXRlOiB3aW5kb3cuc2VyaWFsaXplV2luZG93U3RhdGUoKVxuXHRcdH07XG5cdH1cblxuXHRnZXROZXdXaW5kb3dTdGF0ZShjb25maWd1cmF0aW9uOiBJTmF0aXZlV2luZG93Q29uZmlndXJhdGlvbik6IElOZXdXaW5kb3dTdGF0ZSB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLmRvR2V0TmV3V2luZG93U3RhdGUoY29uZmlndXJhdGlvbik7XG5cdFx0Y29uc3Qgd2luZG93Q29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJV2luZG93U2V0dGluZ3MgfCB1bmRlZmluZWQ+KCd3aW5kb3cnKTtcblxuXHRcdC8vIEZ1bGxzY3JlZW4gc3RhdGUgZ2V0cyBzcGVjaWFsIHRyZWF0bWVudFxuXHRcdGlmIChzdGF0ZS5tb2RlID09PSBXaW5kb3dNb2RlLkZ1bGxzY3JlZW4pIHtcblxuXHRcdFx0Ly8gV2luZG93IHN0YXRlIGlzIG5vdCBmcm9tIGEgcHJldmlvdXMgc2Vzc2lvbjogb25seSBhbGxvdyBmdWxsc2NyZWVuIGlmIHdlIGluaGVyaXQgaXQgb3IgdXNlciB3YW50cyBmdWxsc2NyZWVuXG5cdFx0XHRsZXQgYWxsb3dGdWxsc2NyZWVuOiBib29sZWFuO1xuXHRcdFx0aWYgKHN0YXRlLmhhc0RlZmF1bHRTdGF0ZSkge1xuXHRcdFx0XHRhbGxvd0Z1bGxzY3JlZW4gPSAhISh3aW5kb3dDb25maWc/Lm5ld1dpbmRvd0RpbWVuc2lvbnMgJiYgWydmdWxsc2NyZWVuJywgJ2luaGVyaXQnLCAnb2Zmc2V0J10uaW5kZXhPZih3aW5kb3dDb25maWcubmV3V2luZG93RGltZW5zaW9ucykgPj0gMCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFdpbmRvdyBzdGF0ZSBpcyBmcm9tIGEgcHJldmlvdXMgc2Vzc2lvbjogb25seSBhbGxvdyBmdWxsc2NyZWVuIHdoZW4gd2UgZ290IHVwZGF0ZWQgb3IgdXNlciB3YW50cyB0byByZXN0b3JlXG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0YWxsb3dGdWxsc2NyZWVuID0gISEodGhpcy5saWZlY3ljbGVNYWluU2VydmljZS53YXNSZXN0YXJ0ZWQgfHwgd2luZG93Q29uZmlnPy5yZXN0b3JlRnVsbHNjcmVlbik7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghYWxsb3dGdWxsc2NyZWVuKSB7XG5cdFx0XHRcdHN0YXRlLm1vZGUgPSBXaW5kb3dNb2RlLk5vcm1hbDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gc3RhdGU7XG5cdH1cblxuXHRwcml2YXRlIGRvR2V0TmV3V2luZG93U3RhdGUoY29uZmlndXJhdGlvbjogSU5hdGl2ZVdpbmRvd0NvbmZpZ3VyYXRpb24pOiBJTmV3V2luZG93U3RhdGUge1xuXHRcdGNvbnN0IGxhc3RBY3RpdmUgPSB0aGlzLndpbmRvd3NNYWluU2VydmljZS5nZXRMYXN0QWN0aXZlV2luZG93KCk7XG5cblx0XHQvLyBSZXN0b3JlIHN0YXRlIHVubGVzcyB3ZSBhcmUgcnVubmluZyBleHRlbnNpb24gdGVzdHNcblx0XHRpZiAoIWNvbmZpZ3VyYXRpb24uZXh0ZW5zaW9uVGVzdHNQYXRoKSB7XG5cblx0XHRcdC8vIGV4dGVuc2lvbiBkZXZlbG9wbWVudCBob3N0IFdpbmRvdyAtIGxvYWQgZnJvbSBzdG9yZWQgc2V0dGluZ3MgaWYgYW55XG5cdFx0XHRpZiAoISFjb25maWd1cmF0aW9uLmV4dGVuc2lvbkRldmVsb3BtZW50UGF0aCAmJiB0aGlzLnN0YXRlLmxhc3RQbHVnaW5EZXZlbG9wbWVudEhvc3RXaW5kb3cpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuc3RhdGUubGFzdFBsdWdpbkRldmVsb3BtZW50SG9zdFdpbmRvdy51aVN0YXRlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBLbm93biBXb3Jrc3BhY2UgLSBsb2FkIGZyb20gc3RvcmVkIHNldHRpbmdzXG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjb25maWd1cmF0aW9uLndvcmtzcGFjZTtcblx0XHRcdGlmIChpc1dvcmtzcGFjZUlkZW50aWZpZXIod29ya3NwYWNlKSkge1xuXHRcdFx0XHRjb25zdCBzdGF0ZUZvcldvcmtzcGFjZSA9IHRoaXMuc3RhdGUub3BlbmVkV2luZG93cy5maWx0ZXIob3BlbmVkV2luZG93ID0+IG9wZW5lZFdpbmRvdy53b3Jrc3BhY2UgJiYgb3BlbmVkV2luZG93LndvcmtzcGFjZS5pZCA9PT0gd29ya3NwYWNlLmlkKS5tYXAob3BlbmVkV2luZG93ID0+IG9wZW5lZFdpbmRvdy51aVN0YXRlKTtcblx0XHRcdFx0aWYgKHN0YXRlRm9yV29ya3NwYWNlLmxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybiBzdGF0ZUZvcldvcmtzcGFjZVswXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBLbm93biBGb2xkZXIgLSBsb2FkIGZyb20gc3RvcmVkIHNldHRpbmdzXG5cdFx0XHRpZiAoaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKHdvcmtzcGFjZSkpIHtcblx0XHRcdFx0Y29uc3Qgc3RhdGVGb3JGb2xkZXIgPSB0aGlzLnN0YXRlLm9wZW5lZFdpbmRvd3MuZmlsdGVyKG9wZW5lZFdpbmRvdyA9PiBvcGVuZWRXaW5kb3cuZm9sZGVyVXJpICYmIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwob3BlbmVkV2luZG93LmZvbGRlclVyaSwgd29ya3NwYWNlLnVyaSkpLm1hcChvcGVuZWRXaW5kb3cgPT4gb3BlbmVkV2luZG93LnVpU3RhdGUpO1xuXHRcdFx0XHRpZiAoc3RhdGVGb3JGb2xkZXIubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHN0YXRlRm9yRm9sZGVyWzBdO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIEVtcHR5IHdpbmRvd3Mgd2l0aCBiYWNrdXBzXG5cdFx0XHRlbHNlIGlmIChjb25maWd1cmF0aW9uLmJhY2t1cFBhdGgpIHtcblx0XHRcdFx0Y29uc3Qgc3RhdGVGb3JFbXB0eVdpbmRvdyA9IHRoaXMuc3RhdGUub3BlbmVkV2luZG93cy5maWx0ZXIob3BlbmVkV2luZG93ID0+IG9wZW5lZFdpbmRvdy5iYWNrdXBQYXRoID09PSBjb25maWd1cmF0aW9uLmJhY2t1cFBhdGgpLm1hcChvcGVuZWRXaW5kb3cgPT4gb3BlbmVkV2luZG93LnVpU3RhdGUpO1xuXHRcdFx0XHRpZiAoc3RhdGVGb3JFbXB0eVdpbmRvdy5sZW5ndGgpIHtcblx0XHRcdFx0XHRyZXR1cm4gc3RhdGVGb3JFbXB0eVdpbmRvd1swXTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBGaXJzdCBXaW5kb3dcblx0XHRcdGNvbnN0IGxhc3RBY3RpdmVTdGF0ZSA9IHRoaXMubGFzdENsb3NlZFN0YXRlIHx8IHRoaXMuc3RhdGUubGFzdEFjdGl2ZVdpbmRvdztcblx0XHRcdGlmICghbGFzdEFjdGl2ZSAmJiBsYXN0QWN0aXZlU3RhdGUpIHtcblx0XHRcdFx0cmV0dXJuIGxhc3RBY3RpdmVTdGF0ZS51aVN0YXRlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vXG5cdFx0Ly8gSW4gYW55IG90aGVyIGNhc2UsIHdlIGRvIG5vdCBoYXZlIGFueSBzdG9yZWQgc2V0dGluZ3MgZm9yIHRoZSB3aW5kb3cgc3RhdGUsIHNvIHdlIGNvbWUgdXAgd2l0aCBzb21ldGhpbmcgc21hcnRcblx0XHQvL1xuXG5cdFx0Ly8gV2Ugd2FudCB0aGUgbmV3IHdpbmRvdyB0byBvcGVuIG9uIHRoZSBzYW1lIGRpc3BsYXkgdGhhdCB0aGUgbGFzdCBhY3RpdmUgb25lIGlzIGluXG5cdFx0bGV0IGRpc3BsYXlUb1VzZTogZWxlY3Ryb24uRGlzcGxheSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBkaXNwbGF5cyA9IGVsZWN0cm9uLnNjcmVlbi5nZXRBbGxEaXNwbGF5cygpO1xuXG5cdFx0Ly8gU2luZ2xlIERpc3BsYXlcblx0XHRpZiAoZGlzcGxheXMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRkaXNwbGF5VG9Vc2UgPSBkaXNwbGF5c1swXTtcblx0XHR9XG5cblx0XHQvLyBNdWx0aSBEaXNwbGF5XG5cdFx0ZWxzZSB7XG5cblx0XHRcdC8vIG9uIG1hYyB0aGVyZSBpcyAxIG1lbnUgcGVyIHdpbmRvdyBzbyB3ZSBuZWVkIHRvIHVzZSB0aGUgbW9uaXRvciB3aGVyZSB0aGUgY3Vyc29yIGN1cnJlbnRseSBpc1xuXHRcdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRcdGNvbnN0IGN1cnNvclBvaW50ID0gZWxlY3Ryb24uc2NyZWVuLmdldEN1cnNvclNjcmVlblBvaW50KCk7XG5cdFx0XHRcdGRpc3BsYXlUb1VzZSA9IGVsZWN0cm9uLnNjcmVlbi5nZXREaXNwbGF5TmVhcmVzdFBvaW50KGN1cnNvclBvaW50KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gaWYgd2UgaGF2ZSBhIGxhc3QgYWN0aXZlIHdpbmRvdywgdXNlIHRoYXQgZGlzcGxheSBmb3IgdGhlIG5ldyB3aW5kb3dcblx0XHRcdGlmICghZGlzcGxheVRvVXNlICYmIGxhc3RBY3RpdmUpIHtcblx0XHRcdFx0ZGlzcGxheVRvVXNlID0gZWxlY3Ryb24uc2NyZWVuLmdldERpc3BsYXlNYXRjaGluZyhsYXN0QWN0aXZlLmdldEJvdW5kcygpKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gZmFsbGJhY2sgdG8gcHJpbWFyeSBkaXNwbGF5IG9yIGZpcnN0IGRpc3BsYXlcblx0XHRcdGlmICghZGlzcGxheVRvVXNlKSB7XG5cdFx0XHRcdGRpc3BsYXlUb1VzZSA9IGVsZWN0cm9uLnNjcmVlbi5nZXRQcmltYXJ5RGlzcGxheSgpIHx8IGRpc3BsYXlzWzBdO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENvbXB1dGUgeC95IGJhc2VkIG9uIGRpc3BsYXkgYm91bmRzXG5cdFx0Ly8gTm90ZTogaW1wb3J0YW50IHRvIHVzZSBNYXRoLnJvdW5kKCkgYmVjYXVzZSBFbGVjdHJvbiBkb2VzIG5vdCBzZWVtIHRvIGJlIHRvbyBoYXBweSBhYm91dFxuXHRcdC8vIGRpc3BsYXkgY29vcmRpbmF0ZXMgdGhhdCBhcmUgbm90IGFic29sdXRlIG51bWJlcnMuXG5cdFx0bGV0IHN0YXRlID0gZGVmYXVsdFdpbmRvd1N0YXRlKHVuZGVmaW5lZCwgaXNXb3Jrc3BhY2VJZGVudGlmaWVyKGNvbmZpZ3VyYXRpb24ud29ya3NwYWNlKSB8fCBpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIoY29uZmlndXJhdGlvbi53b3Jrc3BhY2UpKTtcblx0XHRzdGF0ZS54ID0gTWF0aC5yb3VuZChkaXNwbGF5VG9Vc2UuYm91bmRzLnggKyAoZGlzcGxheVRvVXNlLmJvdW5kcy53aWR0aCAvIDIpIC0gKHN0YXRlLndpZHRoISAvIDIpKTtcblx0XHRzdGF0ZS55ID0gTWF0aC5yb3VuZChkaXNwbGF5VG9Vc2UuYm91bmRzLnkgKyAoZGlzcGxheVRvVXNlLmJvdW5kcy5oZWlnaHQgLyAyKSAtIChzdGF0ZS5oZWlnaHQhIC8gMikpO1xuXG5cdFx0Ly8gQ2hlY2sgZm9yIG5ld1dpbmRvd0RpbWVuc2lvbnMgc2V0dGluZyBhbmQgYWRqdXN0IGFjY29yZGluZ2x5XG5cdFx0Y29uc3Qgd2luZG93Q29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJV2luZG93U2V0dGluZ3MgfCB1bmRlZmluZWQ+KCd3aW5kb3cnKTtcblx0XHRsZXQgZW5zdXJlTm9PdmVybGFwID0gdHJ1ZTtcblx0XHRpZiAod2luZG93Q29uZmlnPy5uZXdXaW5kb3dEaW1lbnNpb25zKSB7XG5cdFx0XHRpZiAod2luZG93Q29uZmlnLm5ld1dpbmRvd0RpbWVuc2lvbnMgPT09ICdtYXhpbWl6ZWQnKSB7XG5cdFx0XHRcdHN0YXRlLm1vZGUgPSBXaW5kb3dNb2RlLk1heGltaXplZDtcblx0XHRcdFx0ZW5zdXJlTm9PdmVybGFwID0gZmFsc2U7XG5cdFx0XHR9IGVsc2UgaWYgKHdpbmRvd0NvbmZpZy5uZXdXaW5kb3dEaW1lbnNpb25zID09PSAnZnVsbHNjcmVlbicpIHtcblx0XHRcdFx0c3RhdGUubW9kZSA9IFdpbmRvd01vZGUuRnVsbHNjcmVlbjtcblx0XHRcdFx0ZW5zdXJlTm9PdmVybGFwID0gZmFsc2U7XG5cdFx0XHR9IGVsc2UgaWYgKCh3aW5kb3dDb25maWcubmV3V2luZG93RGltZW5zaW9ucyA9PT0gJ2luaGVyaXQnIHx8IHdpbmRvd0NvbmZpZy5uZXdXaW5kb3dEaW1lbnNpb25zID09PSAnb2Zmc2V0JykgJiYgbGFzdEFjdGl2ZSkge1xuXHRcdFx0XHRjb25zdCBsYXN0QWN0aXZlU3RhdGUgPSBsYXN0QWN0aXZlLnNlcmlhbGl6ZVdpbmRvd1N0YXRlKCk7XG5cdFx0XHRcdGlmIChsYXN0QWN0aXZlU3RhdGUubW9kZSA9PT0gV2luZG93TW9kZS5GdWxsc2NyZWVuKSB7XG5cdFx0XHRcdFx0c3RhdGUubW9kZSA9IFdpbmRvd01vZGUuRnVsbHNjcmVlbjsgLy8gb25seSB0YWtlIG1vZGUgKGZpeGVzIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xOTMzMSlcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzdGF0ZSA9IHtcblx0XHRcdFx0XHRcdC4uLmxhc3RBY3RpdmVTdGF0ZSxcblx0XHRcdFx0XHRcdHpvb21MZXZlbDogdW5kZWZpbmVkIC8vIGRvIG5vdCBpbmhlcml0IHpvb20gbGV2ZWxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZW5zdXJlTm9PdmVybGFwID0gc3RhdGUubW9kZSAhPT0gV2luZG93TW9kZS5GdWxsc2NyZWVuICYmIHdpbmRvd0NvbmZpZy5uZXdXaW5kb3dEaW1lbnNpb25zID09PSAnb2Zmc2V0Jztcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZW5zdXJlTm9PdmVybGFwKSB7XG5cdFx0XHRzdGF0ZSA9IHRoaXMuZW5zdXJlTm9PdmVybGFwKHN0YXRlKTtcblx0XHR9XG5cblx0XHQoc3RhdGUgYXMgSU5ld1dpbmRvd1N0YXRlKS5oYXNEZWZhdWx0U3RhdGUgPSB0cnVlOyAvLyBmbGFnIGFzIGRlZmF1bHQgc3RhdGVcblxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdHByaXZhdGUgZW5zdXJlTm9PdmVybGFwKHN0YXRlOiBJV2luZG93VUlTdGF0ZSk6IElXaW5kb3dVSVN0YXRlIHtcblx0XHRpZiAodGhpcy53aW5kb3dzTWFpblNlcnZpY2UuZ2V0V2luZG93cygpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHN0YXRlO1xuXHRcdH1cblxuXHRcdHN0YXRlLnggPSB0eXBlb2Ygc3RhdGUueCA9PT0gJ251bWJlcicgPyBzdGF0ZS54IDogMDtcblx0XHRzdGF0ZS55ID0gdHlwZW9mIHN0YXRlLnkgPT09ICdudW1iZXInID8gc3RhdGUueSA6IDA7XG5cblx0XHRjb25zdCBleGlzdGluZ1dpbmRvd0JvdW5kcyA9IHRoaXMud2luZG93c01haW5TZXJ2aWNlLmdldFdpbmRvd3MoKS5tYXAod2luZG93ID0+IHdpbmRvdy5nZXRCb3VuZHMoKSk7XG5cdFx0d2hpbGUgKGV4aXN0aW5nV2luZG93Qm91bmRzLnNvbWUoYm91bmRzID0+IGJvdW5kcy54ID09PSBzdGF0ZS54IHx8IGJvdW5kcy55ID09PSBzdGF0ZS55KSkge1xuXHRcdFx0c3RhdGUueCArPSAzMDtcblx0XHRcdHN0YXRlLnkgKz0gMzA7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiByZXN0b3JlV2luZG93c1N0YXRlKGRhdGE6IElTZXJpYWxpemVkV2luZG93c1N0YXRlIHwgdW5kZWZpbmVkKTogSVdpbmRvd3NTdGF0ZSB7XG5cdGNvbnN0IHJlc3VsdDogSVdpbmRvd3NTdGF0ZSA9IHsgb3BlbmVkV2luZG93czogW10gfTtcblx0Y29uc3Qgd2luZG93c1N0YXRlID0gZGF0YSB8fCB7IG9wZW5lZFdpbmRvd3M6IFtdIH07XG5cblx0aWYgKHdpbmRvd3NTdGF0ZS5sYXN0QWN0aXZlV2luZG93KSB7XG5cdFx0cmVzdWx0Lmxhc3RBY3RpdmVXaW5kb3cgPSByZXN0b3JlV2luZG93U3RhdGUod2luZG93c1N0YXRlLmxhc3RBY3RpdmVXaW5kb3cpO1xuXHR9XG5cblx0aWYgKHdpbmRvd3NTdGF0ZS5sYXN0UGx1Z2luRGV2ZWxvcG1lbnRIb3N0V2luZG93KSB7XG5cdFx0cmVzdWx0Lmxhc3RQbHVnaW5EZXZlbG9wbWVudEhvc3RXaW5kb3cgPSByZXN0b3JlV2luZG93U3RhdGUod2luZG93c1N0YXRlLmxhc3RQbHVnaW5EZXZlbG9wbWVudEhvc3RXaW5kb3cpO1xuXHR9XG5cblx0aWYgKEFycmF5LmlzQXJyYXkod2luZG93c1N0YXRlLm9wZW5lZFdpbmRvd3MpKSB7XG5cdFx0cmVzdWx0Lm9wZW5lZFdpbmRvd3MgPSB3aW5kb3dzU3RhdGUub3BlbmVkV2luZG93cy5tYXAod2luZG93U3RhdGUgPT4gcmVzdG9yZVdpbmRvd1N0YXRlKHdpbmRvd1N0YXRlKSk7XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiByZXN0b3JlV2luZG93U3RhdGUod2luZG93U3RhdGU6IElTZXJpYWxpemVkV2luZG93U3RhdGUpOiBJV2luZG93U3RhdGUge1xuXHRjb25zdCByZXN1bHQ6IElXaW5kb3dTdGF0ZSA9IHsgdWlTdGF0ZTogd2luZG93U3RhdGUudWlTdGF0ZSB9O1xuXHRpZiAod2luZG93U3RhdGUuYmFja3VwUGF0aCkge1xuXHRcdHJlc3VsdC5iYWNrdXBQYXRoID0gd2luZG93U3RhdGUuYmFja3VwUGF0aDtcblx0fVxuXG5cdGlmICh3aW5kb3dTdGF0ZS5yZW1vdGVBdXRob3JpdHkpIHtcblx0XHRyZXN1bHQucmVtb3RlQXV0aG9yaXR5ID0gd2luZG93U3RhdGUucmVtb3RlQXV0aG9yaXR5O1xuXHR9XG5cblx0aWYgKHdpbmRvd1N0YXRlLmZvbGRlcikge1xuXHRcdHJlc3VsdC5mb2xkZXJVcmkgPSBVUkkucGFyc2Uod2luZG93U3RhdGUuZm9sZGVyKTtcblx0fVxuXG5cdGlmICh3aW5kb3dTdGF0ZS53b3Jrc3BhY2VJZGVudGlmaWVyKSB7XG5cdFx0cmVzdWx0LndvcmtzcGFjZSA9IHsgaWQ6IHdpbmRvd1N0YXRlLndvcmtzcGFjZUlkZW50aWZpZXIuaWQsIGNvbmZpZ1BhdGg6IFVSSS5wYXJzZSh3aW5kb3dTdGF0ZS53b3Jrc3BhY2VJZGVudGlmaWVyLmNvbmZpZ1VSSVBhdGgpIH07XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0V2luZG93c1N0YXRlU3RvcmVEYXRhKHdpbmRvd3NTdGF0ZTogSVdpbmRvd3NTdGF0ZSk6IElXaW5kb3dzU3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdGxhc3RBY3RpdmVXaW5kb3c6IHdpbmRvd3NTdGF0ZS5sYXN0QWN0aXZlV2luZG93ICYmIHNlcmlhbGl6ZVdpbmRvd1N0YXRlKHdpbmRvd3NTdGF0ZS5sYXN0QWN0aXZlV2luZG93KSxcblx0XHRsYXN0UGx1Z2luRGV2ZWxvcG1lbnRIb3N0V2luZG93OiB3aW5kb3dzU3RhdGUubGFzdFBsdWdpbkRldmVsb3BtZW50SG9zdFdpbmRvdyAmJiBzZXJpYWxpemVXaW5kb3dTdGF0ZSh3aW5kb3dzU3RhdGUubGFzdFBsdWdpbkRldmVsb3BtZW50SG9zdFdpbmRvdyksXG5cdFx0b3BlbmVkV2luZG93czogd2luZG93c1N0YXRlLm9wZW5lZFdpbmRvd3MubWFwKHdzID0+IHNlcmlhbGl6ZVdpbmRvd1N0YXRlKHdzKSlcblx0fTtcbn1cblxuZnVuY3Rpb24gc2VyaWFsaXplV2luZG93U3RhdGUod2luZG93U3RhdGU6IElXaW5kb3dTdGF0ZSk6IElTZXJpYWxpemVkV2luZG93U3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdHdvcmtzcGFjZUlkZW50aWZpZXI6IHdpbmRvd1N0YXRlLndvcmtzcGFjZSAmJiB7IGlkOiB3aW5kb3dTdGF0ZS53b3Jrc3BhY2UuaWQsIGNvbmZpZ1VSSVBhdGg6IHdpbmRvd1N0YXRlLndvcmtzcGFjZS5jb25maWdQYXRoLnRvU3RyaW5nKCkgfSxcblx0XHRmb2xkZXI6IHdpbmRvd1N0YXRlLmZvbGRlclVyaT8udG9TdHJpbmcoKSxcblx0XHRiYWNrdXBQYXRoOiB3aW5kb3dTdGF0ZS5iYWNrdXBQYXRoLFxuXHRcdHJlbW90ZUF1dGhvcml0eTogd2luZG93U3RhdGUucmVtb3RlQXV0aG9yaXR5LFxuXHRcdHVpU3RhdGU6IHdpbmRvd1N0YXRlLnVpU3RhdGVcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsT0FBTyxjQUFjO0FBQ3JCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsV0FBVztBQUNwQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHFCQUFxQjtBQUU5QixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9CQUFpRSxrQkFBa0I7QUFDNUYsU0FBUyxtQ0FBbUMsNkJB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RSxlQUFlLENBQUMsRUFBRTtBQUVqRCxNQUFJLGFBQWEsa0JBQWtCO0FBQ2xDLFdBQU8sbUJBQW1CLG1CQUFtQixhQUFhLGdCQUFnQjtBQUFBLEVBQzNFO0FBRUEsTUFBSSxhQUFhLGlDQUFpQztBQUNqRCxXQUFPLGtDQUFrQyxtQkFBbUIsYUFBYSwrQkFBK0I7QUFBQSxFQUN6RztBQUVBLE1BQUksTUFBTSxRQUFRLGFBQWEsYUFBYSxHQUFHO0FBQzlDLFdBQU8sZ0JBQWdCLGFBQWEsY0FBYyxJQUFJLGlCQUFlLG1CQUFtQixXQUFXLENBQUM7QUFBQSxFQUNyRztBQUVBLFNBQU87QUFDUjtBQUVBLFNBQVMsbUJBQW1CLGFBQW1EO0FBQzlFLFFBQU0sU0FBdUIsRUFBRSxTQUFTLFlBQVksUUFBUTtBQUM1RCxNQUFJLFlBQVksWUFBWTtBQUMzQixXQUFPLGFBQWEsWUFBWTtBQUFBLEVBQ2pDO0FBRUEsTUFBSSxZQUFZLGlCQUFpQjtBQUNoQyxXQUFPLGtCQUFrQixZQUFZO0FBQUEsRUFDdEM7QUFFQSxNQUFJLFlBQVksUUFBUTtBQUN2QixXQUFPLFlBQVksSUFBSSxNQUFNLFlBQVksTUFBTTtBQUFBLEVBQ2hEO0FBRUEsTUFBSSxZQUFZLHFCQUFxQjtBQUNwQyxXQUFPLFlBQVksRUFBRSxJQUFJLFlBQVksb0JBQW9CLElBQUksWUFBWSxJQUFJLE1BQU0sWUFBWSxvQkFBb0IsYUFBYSxFQUFFO0FBQUEsRUFDbkk7QUFFQSxTQUFPO0FBQ1I7QUFFTyxTQUFTLHlCQUF5QixjQUE0QztBQUNwRixTQUFPO0FBQUEsSUFDTixrQkFBa0IsYUFBYSxvQkFBb0IscUJBQXFCLGFBQWEsZ0JBQWdCO0FBQUEsSUFDckcsaUNBQWlDLGFBQWEsbUNBQW1DLHFCQUFxQixhQUFhLCtCQUErQjtBQUFBLElBQ2xKLGVBQWUsYUFBYSxjQUFjLElBQUksUUFBTSxxQkFBcUIsRUFBRSxDQUFDO0FBQUEsRUFDN0U7QUFDRDtBQUVBLFNBQVMscUJBQXFCLGFBQW1EO0FBQ2hGLFNBQU87QUFBQSxJQUNOLHFCQUFxQixZQUFZLGFBQWEsRUFBRSxJQUFJLFlBQVksVUFBVSxJQUFJLGVBQWUsWUFBWSxVQUFVLFdBQVcsU0FBUyxFQUFFO0FBQUEsSUFDekksUUFBUSxZQUFZLFdBQVcsU0FBUztBQUFBLElBQ3hDLFlBQVksWUFBWTtBQUFBLElBQ3hCLGlCQUFpQixZQUFZO0FBQUEsSUFDN0IsU0FBUyxZQUFZO0FBQUEsRUFDdEI7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
