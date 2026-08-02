(async function() {
  performance.mark("code/didStartRenderer");
  const preloadGlobals = window.vscode;
  const safeProcess = preloadGlobals.process;
  function showSplash(configuration2) {
    performance.mark("code/willShowPartsSplash");
    showDefaultSplash(configuration2);
    performance.mark("code/didShowPartsSplash");
  }
  function showDefaultSplash(configuration2) {
    let data = configuration2.partsSplash;
    if (data) {
      if (configuration2.autoDetectHighContrast && configuration2.colorScheme.highContrast) {
        if (configuration2.colorScheme.dark && data.baseTheme !== "hc-black" || !configuration2.colorScheme.dark && data.baseTheme !== "hc-light") {
          data = void 0;
        }
      } else if (configuration2.autoDetectColorScheme) {
        if (configuration2.colorScheme.dark && data.baseTheme !== "vs-dark" || !configuration2.colorScheme.dark && data.baseTheme !== "vs") {
          data = void 0;
        }
      }
    }
    if (data && configuration2.extensionDevelopmentPath) {
      data.layoutInfo = void 0;
    }
    let baseTheme;
    let shellBackground;
    let shellForeground;
    if (data) {
      baseTheme = data.baseTheme;
      shellBackground = data.colorInfo.editorBackground;
      shellForeground = data.colorInfo.foreground;
    } else if (configuration2.autoDetectHighContrast && configuration2.colorScheme.highContrast) {
      if (configuration2.colorScheme.dark) {
        baseTheme = "hc-black";
        shellBackground = "#000000";
        shellForeground = "#FFFFFF";
      } else {
        baseTheme = "hc-light";
        shellBackground = "#FFFFFF";
        shellForeground = "#000000";
      }
    } else if (configuration2.autoDetectColorScheme) {
      if (configuration2.colorScheme.dark) {
        baseTheme = "vs-dark";
        shellBackground = "#1E1E1E";
        shellForeground = "#CCCCCC";
      } else {
        baseTheme = "vs";
        shellBackground = "#FFFFFF";
        shellForeground = "#000000";
      }
    }
    const style = document.createElement("style");
    style.className = "initialShellColors";
    window.document.head.appendChild(style);
    style.textContent = `body {	background-color: ${shellBackground}; color: ${shellForeground}; margin: 0; padding: 0; }`;
    if (typeof data?.zoomLevel === "number" && typeof preloadGlobals?.webFrame?.setZoomLevel === "function") {
      preloadGlobals.webFrame.setZoomLevel(data.zoomLevel);
    }
    if (data?.layoutInfo) {
      const { layoutInfo, colorInfo } = data;
      const modernUI = layoutInfo.modernUI === true;
      const floatingMargin = 4;
      const floatingOuterMargin = floatingMargin * 2;
      const floatingBorderWidth = 1;
      const splash = document.createElement("div");
      splash.id = "monaco-parts-splash";
      splash.className = baseTheme ?? "vs-dark";
      if (layoutInfo.windowBorder && colorInfo.windowBorder) {
        const borderElement = document.createElement("div");
        borderElement.style.position = "absolute";
        borderElement.style.width = "calc(100vw - 2px)";
        borderElement.style.height = "calc(100vh - 2px)";
        borderElement.style.zIndex = "1";
        borderElement.style.border = `1px solid var(--window-border-color)`;
        borderElement.style.setProperty("--window-border-color", colorInfo.windowBorder);
        if (layoutInfo.windowBorderRadius) {
          borderElement.style.borderRadius = layoutInfo.windowBorderRadius;
        }
        splash.appendChild(borderElement);
      }
      const setBounds = (element, bounds) => {
        element.style.position = "absolute";
        element.style.top = `${bounds.top}px`;
        if (typeof bounds.bottom === "number") {
          element.style.bottom = `${bounds.bottom}px`;
        }
        if (typeof bounds.left === "number") {
          element.style.left = `${bounds.left}px`;
        }
        if (typeof bounds.right === "number") {
          element.style.right = `${bounds.right}px`;
        }
        if (typeof bounds.width === "number") {
          element.style.width = `${bounds.width}px`;
        }
        if (typeof bounds.height === "number") {
          element.style.height = `${bounds.height}px`;
        }
      };
      const setPartBounds = (element, bounds) => {
        element.style.position = "absolute";
        element.style.top = `${bounds.top}px`;
        element.style.left = `${bounds.left}px`;
        element.style.width = `${bounds.width}px`;
        element.style.height = `${bounds.height}px`;
      };
      const applyFloatingCardStyles = (element, backgroundColor) => {
        element.style.boxSizing = "border-box";
        element.style.border = `${floatingBorderWidth}px solid ${colorInfo.agentsPanelBorder ?? colorInfo.editorGroupBorder ?? "transparent"}`;
        element.style.borderRadius = "8px";
        element.style.backgroundColor = backgroundColor ?? colorInfo.editorBackground ?? colorInfo.background;
        element.style.overflow = "hidden";
      };
      const contentTop = layoutInfo.titleBarHeight;
      const contentBottom = layoutInfo.statusBarHeight;
      const contentHeight = `calc(100% - ${contentTop + contentBottom}px)`;
      const activityHeight = modernUI ? `calc(100% - ${contentTop + contentBottom + floatingMargin}px)` : contentHeight;
      if (layoutInfo.auxiliaryBarWidth === Number.MAX_SAFE_INTEGER) {
        layoutInfo.auxiliaryBarWidth = window.innerWidth - layoutInfo.activityBarWidth;
      } else {
        layoutInfo.auxiliaryBarWidth = Math.min(layoutInfo.auxiliaryBarWidth, window.innerWidth - (layoutInfo.activityBarWidth + layoutInfo.editorPartMinWidth + layoutInfo.sideBarWidth));
      }
      layoutInfo.sideBarWidth = Math.min(layoutInfo.sideBarWidth, window.innerWidth - (layoutInfo.activityBarWidth + layoutInfo.editorPartMinWidth + layoutInfo.auxiliaryBarWidth));
      if (layoutInfo.titleBarHeight > 0) {
        const titleDiv = document.createElement("div");
        titleDiv.style.position = "absolute";
        titleDiv.style.width = "100%";
        titleDiv.style.height = `${layoutInfo.titleBarHeight}px`;
        titleDiv.style.left = "0";
        titleDiv.style.top = "0";
        titleDiv.style.backgroundColor = modernUI ? "transparent" : `${colorInfo.titleBarBackground}`;
        titleDiv.style["-webkit-app-region"] = "drag";
        splash.appendChild(titleDiv);
        if (!modernUI && colorInfo.titleBarBorder) {
          const titleBorder = document.createElement("div");
          titleBorder.style.position = "absolute";
          titleBorder.style.width = "100%";
          titleBorder.style.height = "1px";
          titleBorder.style.left = "0";
          titleBorder.style.bottom = "0";
          titleBorder.style.borderBottom = `1px solid ${colorInfo.titleBarBorder}`;
          titleDiv.appendChild(titleBorder);
        }
      }
      if (layoutInfo.activityBarWidth > 0) {
        const activityDiv = document.createElement("div");
        activityDiv.style.position = "absolute";
        activityDiv.style.width = `${layoutInfo.activityBarWidth}px`;
        activityDiv.style.height = activityHeight;
        activityDiv.style.top = `${contentTop}px`;
        if (layoutInfo.sideBarSide === "left") {
          activityDiv.style.left = "0";
        } else {
          activityDiv.style.right = "0";
        }
        activityDiv.style.backgroundColor = modernUI ? "transparent" : `${colorInfo.activityBarBackground}`;
        splash.appendChild(activityDiv);
        if (!modernUI && colorInfo.activityBarBorder) {
          const activityBorderDiv = document.createElement("div");
          activityBorderDiv.style.position = "absolute";
          activityBorderDiv.style.width = "1px";
          activityBorderDiv.style.height = "100%";
          activityBorderDiv.style.top = "0";
          if (layoutInfo.sideBarSide === "left") {
            activityBorderDiv.style.right = "0";
            activityBorderDiv.style.borderRight = `1px solid ${colorInfo.activityBarBorder}`;
          } else {
            activityBorderDiv.style.left = "0";
            activityBorderDiv.style.borderLeft = `1px solid ${colorInfo.activityBarBorder}`;
          }
          activityDiv.appendChild(activityBorderDiv);
        }
      }
      if (layoutInfo.sideBarWidth > 0) {
        const sideDiv = document.createElement("div");
        if (modernUI && layoutInfo.partBounds?.sideBar) {
          setPartBounds(sideDiv, layoutInfo.partBounds.sideBar);
        } else if (layoutInfo.sideBarSide === "left") {
          setBounds(sideDiv, {
            top: contentTop,
            bottom: modernUI ? contentBottom + floatingMargin : contentBottom,
            left: layoutInfo.activityBarWidth + (modernUI ? floatingMargin : 0),
            width: modernUI ? Math.max(0, layoutInfo.sideBarWidth - floatingOuterMargin - floatingBorderWidth * 2) : layoutInfo.sideBarWidth
          });
        } else {
          setBounds(sideDiv, {
            top: contentTop,
            bottom: modernUI ? contentBottom + floatingMargin : contentBottom,
            right: layoutInfo.activityBarWidth + (modernUI ? floatingMargin : 0),
            width: modernUI ? Math.max(0, layoutInfo.sideBarWidth - floatingOuterMargin - floatingBorderWidth * 2) : layoutInfo.sideBarWidth
          });
        }
        if (modernUI) {
          applyFloatingCardStyles(sideDiv, colorInfo.agentsPanelBackground ?? colorInfo.sideBarBackground);
        } else {
          sideDiv.style.backgroundColor = `${colorInfo.sideBarBackground}`;
        }
        splash.appendChild(sideDiv);
        if (!modernUI && colorInfo.sideBarBorder) {
          const sideBorderDiv = document.createElement("div");
          sideBorderDiv.style.position = "absolute";
          sideBorderDiv.style.width = "1px";
          sideBorderDiv.style.height = "100%";
          sideBorderDiv.style.top = "0";
          sideBorderDiv.style.right = "0";
          if (layoutInfo.sideBarSide === "left") {
            sideBorderDiv.style.borderRight = `1px solid ${colorInfo.sideBarBorder}`;
          } else {
            sideBorderDiv.style.left = "0";
            sideBorderDiv.style.borderLeft = `1px solid ${colorInfo.sideBarBorder}`;
          }
          sideDiv.appendChild(sideBorderDiv);
        }
      }
      if (layoutInfo.auxiliaryBarWidth > 0) {
        const auxSideDiv = document.createElement("div");
        if (modernUI && layoutInfo.partBounds?.auxiliaryBar) {
          setPartBounds(auxSideDiv, layoutInfo.partBounds.auxiliaryBar);
        } else if (layoutInfo.sideBarSide === "left") {
          setBounds(auxSideDiv, {
            top: contentTop,
            bottom: modernUI ? contentBottom + floatingMargin : contentBottom,
            right: modernUI ? floatingOuterMargin : 0,
            width: modernUI ? Math.max(0, layoutInfo.auxiliaryBarWidth - floatingOuterMargin - floatingMargin - floatingBorderWidth * 2) : layoutInfo.auxiliaryBarWidth
          });
        } else {
          setBounds(auxSideDiv, {
            top: contentTop,
            bottom: modernUI ? contentBottom + floatingMargin : contentBottom,
            left: modernUI ? floatingOuterMargin : 0,
            width: modernUI ? Math.max(0, layoutInfo.auxiliaryBarWidth - floatingOuterMargin - floatingMargin - floatingBorderWidth * 2) : layoutInfo.auxiliaryBarWidth
          });
        }
        if (modernUI) {
          applyFloatingCardStyles(auxSideDiv, colorInfo.sideBarBackground);
        } else {
          auxSideDiv.style.backgroundColor = `${colorInfo.sideBarBackground}`;
        }
        splash.appendChild(auxSideDiv);
        if (!modernUI && colorInfo.sideBarBorder) {
          const auxSideBorderDiv = document.createElement("div");
          auxSideBorderDiv.style.position = "absolute";
          auxSideBorderDiv.style.width = "1px";
          auxSideBorderDiv.style.height = "100%";
          auxSideBorderDiv.style.top = "0";
          if (layoutInfo.sideBarSide === "left") {
            auxSideBorderDiv.style.left = "0";
            auxSideBorderDiv.style.borderLeft = `1px solid ${colorInfo.sideBarBorder}`;
          } else {
            auxSideBorderDiv.style.right = "0";
            auxSideBorderDiv.style.borderRight = `1px solid ${colorInfo.sideBarBorder}`;
          }
          auxSideDiv.appendChild(auxSideBorderDiv);
        }
      }
      if (modernUI && (layoutInfo.partBounds?.editor || !layoutInfo.partBounds)) {
        const editorDiv = document.createElement("div");
        if (layoutInfo.partBounds?.editor) {
          setPartBounds(editorDiv, layoutInfo.partBounds.editor);
        } else {
          const editorLeft = (layoutInfo.sideBarSide === "left" ? layoutInfo.activityBarWidth + layoutInfo.sideBarWidth : layoutInfo.auxiliaryBarWidth) + floatingMargin;
          const editorRight = (layoutInfo.sideBarSide === "left" ? layoutInfo.auxiliaryBarWidth : layoutInfo.activityBarWidth + layoutInfo.sideBarWidth) + floatingMargin;
          setBounds(editorDiv, {
            top: contentTop,
            bottom: contentBottom + floatingMargin,
            left: editorLeft,
            right: editorRight
          });
        }
        applyFloatingCardStyles(editorDiv, colorInfo.editorBackground);
        splash.appendChild(editorDiv);
      }
      if (modernUI && layoutInfo.partBounds?.panel) {
        const panelDiv = document.createElement("div");
        setPartBounds(panelDiv, layoutInfo.partBounds.panel);
        applyFloatingCardStyles(panelDiv, colorInfo.panelBackground ?? colorInfo.editorBackground);
        splash.appendChild(panelDiv);
      }
      if (layoutInfo.statusBarHeight > 0) {
        const statusDiv = document.createElement("div");
        statusDiv.style.position = "absolute";
        statusDiv.style.width = "100%";
        statusDiv.style.height = `${layoutInfo.statusBarHeight}px`;
        statusDiv.style.bottom = "0";
        statusDiv.style.left = "0";
        if (modernUI) {
          statusDiv.style.backgroundColor = "transparent";
        } else if (configuration2.workspace && colorInfo.statusBarBackground) {
          statusDiv.style.backgroundColor = colorInfo.statusBarBackground;
        } else if (!configuration2.workspace && colorInfo.statusBarNoFolderBackground) {
          statusDiv.style.backgroundColor = colorInfo.statusBarNoFolderBackground;
        }
        splash.appendChild(statusDiv);
        if (!modernUI && colorInfo.statusBarBorder) {
          const statusBorderDiv = document.createElement("div");
          statusBorderDiv.style.position = "absolute";
          statusBorderDiv.style.width = "100%";
          statusBorderDiv.style.height = "1px";
          statusBorderDiv.style.top = "0";
          statusBorderDiv.style.borderTop = `1px solid ${colorInfo.statusBarBorder}`;
          statusDiv.appendChild(statusBorderDiv);
        }
      }
      window.document.body.appendChild(splash);
    }
  }
  async function load(options) {
    const configuration2 = await resolveWindowConfiguration();
    options?.beforeImport?.(configuration2);
    const { enableDeveloperKeybindings, removeDeveloperKeybindingsAfterLoad, developerDeveloperKeybindingsDisposable, forceDisableShowDevtoolsOnError } = setupDeveloperKeybindings(configuration2, options);
    setupNLS(configuration2);
    const baseUrl = new URL(`${fileUriFromPath(configuration2.appRoot, { isWindows: safeProcess.platform === "win32", scheme: "vscode-file", fallbackAuthority: "vscode-app" })}/out/`);
    globalThis._VSCODE_FILE_ROOT = baseUrl.toString();
    globalThis._VSCODE_PRODUCT_JSON = { ...configuration2.product };
    setupCSSImportMaps(configuration2, baseUrl);
    try {
      let workbenchUrl;
      if (!!safeProcess.env["VSCODE_DEV"] && globalThis._VSCODE_USE_RELATIVE_IMPORTS) {
        workbenchUrl = "../../../workbench/workbench.desktop.main.js";
      } else {
        workbenchUrl = new URL(`vs/workbench/workbench.desktop.main.js`, baseUrl).href;
      }
      const result2 = await import(workbenchUrl);
      if (developerDeveloperKeybindingsDisposable && removeDeveloperKeybindingsAfterLoad) {
        developerDeveloperKeybindingsDisposable();
      }
      return { result: result2, configuration: configuration2 };
    } catch (error) {
      onUnexpectedError(error, enableDeveloperKeybindings && !forceDisableShowDevtoolsOnError);
      throw error;
    }
  }
  async function resolveWindowConfiguration() {
    const timeout = setTimeout(() => {
      console.error(`[resolve window config] Could not resolve window configuration within 10 seconds, but will continue to wait...`);
    }, 1e4);
    performance.mark("code/willWaitForWindowConfig");
    const configuration2 = await preloadGlobals.context.resolveConfiguration();
    performance.mark("code/didWaitForWindowConfig");
    clearTimeout(timeout);
    return configuration2;
  }
  function setupDeveloperKeybindings(configuration2, options) {
    const {
      forceEnableDeveloperKeybindings,
      disallowReloadKeybinding,
      removeDeveloperKeybindingsAfterLoad,
      forceDisableShowDevtoolsOnError
    } = typeof options?.configureDeveloperSettings === "function" ? options.configureDeveloperSettings(configuration2) : {
      forceEnableDeveloperKeybindings: false,
      disallowReloadKeybinding: false,
      removeDeveloperKeybindingsAfterLoad: false,
      forceDisableShowDevtoolsOnError: false
    };
    const isDev = !!safeProcess.env["VSCODE_DEV"];
    const enableDeveloperKeybindings = Boolean(isDev || forceEnableDeveloperKeybindings);
    let developerDeveloperKeybindingsDisposable = void 0;
    if (enableDeveloperKeybindings) {
      developerDeveloperKeybindingsDisposable = registerDeveloperKeybindings(disallowReloadKeybinding);
    }
    return {
      enableDeveloperKeybindings,
      removeDeveloperKeybindingsAfterLoad,
      developerDeveloperKeybindingsDisposable,
      forceDisableShowDevtoolsOnError
    };
  }
  function registerDeveloperKeybindings(disallowReloadKeybinding) {
    const ipcRenderer = preloadGlobals.ipcRenderer;
    const extractKey = function(e) {
      return [
        e.ctrlKey ? "ctrl-" : "",
        e.metaKey ? "meta-" : "",
        e.altKey ? "alt-" : "",
        e.shiftKey ? "shift-" : "",
        e.keyCode
      ].join("");
    };
    const TOGGLE_DEV_TOOLS_KB = safeProcess.platform === "darwin" ? "meta-alt-73" : "ctrl-shift-73";
    const TOGGLE_DEV_TOOLS_KB_ALT = "123";
    const RELOAD_KB = safeProcess.platform === "darwin" ? "meta-82" : "ctrl-82";
    let listener = function(e) {
      const key = extractKey(e);
      if (key === TOGGLE_DEV_TOOLS_KB || key === TOGGLE_DEV_TOOLS_KB_ALT) {
        ipcRenderer.send("vscode:toggleDevTools");
      } else if (key === RELOAD_KB && !disallowReloadKeybinding) {
        ipcRenderer.send("vscode:reloadWindow");
      }
    };
    window.addEventListener("keydown", listener);
    return function() {
      if (listener) {
        window.removeEventListener("keydown", listener);
        listener = void 0;
      }
    };
  }
  function setupNLS(configuration2) {
    globalThis._VSCODE_NLS_MESSAGES = configuration2.nls.messages;
    globalThis._VSCODE_NLS_LANGUAGE = configuration2.nls.language;
    let language = configuration2.nls.language || "en";
    if (language === "zh-tw") {
      language = "zh-Hant";
    } else if (language === "zh-cn") {
      language = "zh-Hans";
    }
    window.document.documentElement.setAttribute("lang", language);
  }
  function onUnexpectedError(error, showDevtoolsOnError) {
    if (showDevtoolsOnError) {
      const ipcRenderer = preloadGlobals.ipcRenderer;
      ipcRenderer.send("vscode:openDevTools");
    }
    console.error(`[uncaught exception]: ${error}`);
    if (error && typeof error !== "string" && error.stack) {
      console.error(error.stack);
    }
  }
  function fileUriFromPath(path, config) {
    let pathName = path.replace(/\\/g, "/");
    if (pathName.length > 0 && pathName.charAt(0) !== "/") {
      pathName = `/${pathName}`;
    }
    let uri;
    if (config.isWindows && pathName.startsWith("//")) {
      uri = encodeURI(`${config.scheme || "file"}:${pathName}`);
    } else {
      uri = encodeURI(`${config.scheme || "file"}://${config.fallbackAuthority || ""}${pathName}`);
    }
    return uri.replace(/#/g, "%23");
  }
  function setupCSSImportMaps(configuration2, baseUrl) {
    if (globalThis._VSCODE_DISABLE_CSS_IMPORT_MAP) {
      return;
    }
    if (Array.isArray(configuration2.cssModules) && configuration2.cssModules.length > 0) {
      performance.mark("code/willAddCssLoader");
      globalThis._VSCODE_CSS_LOAD = function(url) {
        const link = document.createElement("link");
        link.setAttribute("rel", "stylesheet");
        link.setAttribute("type", "text/css");
        link.setAttribute("href", url);
        window.document.head.appendChild(link);
      };
      const importMap = { imports: {} };
      for (const cssModule of configuration2.cssModules) {
        const cssUrl = new URL(cssModule, baseUrl).href;
        const jsSrc = `globalThis._VSCODE_CSS_LOAD('${cssUrl}');
`;
        const blob = new Blob([jsSrc], { type: "application/javascript" });
        importMap.imports[cssUrl] = URL.createObjectURL(blob);
      }
      const ttp = window.trustedTypes?.createPolicy("vscode-bootstrapImportMap", { createScript(value) {
        return value;
      } });
      const importMapSrc = JSON.stringify(importMap, void 0, 2);
      const importMapScript = document.createElement("script");
      importMapScript.type = "importmap";
      importMapScript.setAttribute("nonce", "0c6a828f1297");
      importMapScript.textContent = ttp?.createScript(importMapSrc) ?? importMapSrc;
      window.document.head.appendChild(importMapScript);
      performance.mark("code/didAddCssLoader");
    }
  }
  const { result, configuration } = await load(
    {
      configureDeveloperSettings: function(windowConfig) {
        return {
          // disable automated devtools opening on error when running extension tests
          // as this can lead to nondeterministic test execution (devtools steals focus)
          forceDisableShowDevtoolsOnError: typeof windowConfig.extensionTestsPath === "string" || windowConfig["enable-smoke-test-driver"] === true,
          // enable devtools keybindings in extension development window
          forceEnableDeveloperKeybindings: Array.isArray(windowConfig.extensionDevelopmentPath) && windowConfig.extensionDevelopmentPath.length > 0,
          removeDeveloperKeybindingsAfterLoad: true
        };
      },
      beforeImport: function(windowConfig) {
        showSplash(windowConfig);
        Object.defineProperty(window, "vscodeWindowId", {
          get: () => windowConfig.windowId
        });
        window.requestIdleCallback(() => {
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          context?.clearRect(0, 0, canvas.width, canvas.height);
          canvas.remove();
        }, { timeout: 50 });
        performance.mark("code/willLoadWorkbenchMain");
      }
    }
  );
  performance.mark("code/didLoadWorkbenchMain");
  result.main(configuration);
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2NvZGUvZWxlY3Ryb24tYnJvd3Nlci93b3JrYmVuY2gvd29ya2JlbmNoLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuLyogZXNsaW50LWRpc2FibGUgbm8tcmVzdHJpY3RlZC1nbG9iYWxzICovXG5cbihhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0Ly8gQWRkIGEgcGVyZiBlbnRyeSByaWdodCBmcm9tIHRoZSB0b3Bcblx0cGVyZm9ybWFuY2UubWFyaygnY29kZS9kaWRTdGFydFJlbmRlcmVyJyk7XG5cblx0dHlwZSBJU2FuZGJveENvbmZpZ3VyYXRpb24gPSBpbXBvcnQoJy4uLy4uLy4uL2Jhc2UvcGFydHMvc2FuZGJveC9jb21tb24vc2FuZGJveFR5cGVzLmpzJykuSVNhbmRib3hDb25maWd1cmF0aW9uO1xuXHR0eXBlIElMb2FkUmVzdWx0PE0sIFQgZXh0ZW5kcyBJU2FuZGJveENvbmZpZ3VyYXRpb24+ID0gaW1wb3J0KCcuLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvZWxlY3Ryb24tYnJvd3Nlci93aW5kb3cuanMnKS5JTG9hZFJlc3VsdDxNLCBUPjtcblx0dHlwZSBJTG9hZE9wdGlvbnM8VCBleHRlbmRzIElTYW5kYm94Q29uZmlndXJhdGlvbj4gPSBpbXBvcnQoJy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9lbGVjdHJvbi1icm93c2VyL3dpbmRvdy5qcycpLklMb2FkT3B0aW9uczxUPjtcblx0dHlwZSBJTmF0aXZlV2luZG93Q29uZmlndXJhdGlvbiA9IGltcG9ydCgnLi4vLi4vLi4vcGxhdGZvcm0vd2luZG93L2NvbW1vbi93aW5kb3cudHMnKS5JTmF0aXZlV2luZG93Q29uZmlndXJhdGlvbjtcblx0dHlwZSBJTWFpbldpbmRvd1NhbmRib3hHbG9iYWxzID0gaW1wb3J0KCcuLi8uLi8uLi9iYXNlL3BhcnRzL3NhbmRib3gvZWxlY3Ryb24tYnJvd3Nlci9nbG9iYWxzLmpzJykuSU1haW5XaW5kb3dTYW5kYm94R2xvYmFscztcblx0dHlwZSBJRGVza3RvcE1haW4gPSBpbXBvcnQoJy4uLy4uLy4uL3dvcmtiZW5jaC9lbGVjdHJvbi1icm93c2VyL2Rlc2t0b3AubWFpbi5qcycpLklEZXNrdG9wTWFpbjtcblxuXHRjb25zdCBwcmVsb2FkR2xvYmFscyA9ICh3aW5kb3cgYXMgdW5rbm93biBhcyB7IHZzY29kZTogSU1haW5XaW5kb3dTYW5kYm94R2xvYmFscyB9KS52c2NvZGU7IC8vIGRlZmluZWQgYnkgcHJlbG9hZC50c1xuXHRjb25zdCBzYWZlUHJvY2VzcyA9IHByZWxvYWRHbG9iYWxzLnByb2Nlc3M7XG5cblx0Ly8jcmVnaW9uIFNwbGFzaCBTY3JlZW4gSGVscGVyc1xuXG5cdGZ1bmN0aW9uIHNob3dTcGxhc2goY29uZmlndXJhdGlvbjogSU5hdGl2ZVdpbmRvd0NvbmZpZ3VyYXRpb24pIHtcblx0XHRwZXJmb3JtYW5jZS5tYXJrKCdjb2RlL3dpbGxTaG93UGFydHNTcGxhc2gnKTtcblx0XHRzaG93RGVmYXVsdFNwbGFzaChjb25maWd1cmF0aW9uKTtcblx0XHRwZXJmb3JtYW5jZS5tYXJrKCdjb2RlL2RpZFNob3dQYXJ0c1NwbGFzaCcpO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2hvd0RlZmF1bHRTcGxhc2goY29uZmlndXJhdGlvbjogSU5hdGl2ZVdpbmRvd0NvbmZpZ3VyYXRpb24pIHtcblx0XHRsZXQgZGF0YSA9IGNvbmZpZ3VyYXRpb24ucGFydHNTcGxhc2g7XG5cdFx0aWYgKGRhdGEpIHtcblx0XHRcdGlmIChjb25maWd1cmF0aW9uLmF1dG9EZXRlY3RIaWdoQ29udHJhc3QgJiYgY29uZmlndXJhdGlvbi5jb2xvclNjaGVtZS5oaWdoQ29udHJhc3QpIHtcblx0XHRcdFx0aWYgKChjb25maWd1cmF0aW9uLmNvbG9yU2NoZW1lLmRhcmsgJiYgZGF0YS5iYXNlVGhlbWUgIT09ICdoYy1ibGFjaycpIHx8ICghY29uZmlndXJhdGlvbi5jb2xvclNjaGVtZS5kYXJrICYmIGRhdGEuYmFzZVRoZW1lICE9PSAnaGMtbGlnaHQnKSkge1xuXHRcdFx0XHRcdGRhdGEgPSB1bmRlZmluZWQ7IC8vIGhpZ2ggY29udHJhc3QgbW9kZSBoYXMgYmVlbiB0dXJuZWQgYnkgdGhlIE9TIC0+IGlnbm9yZSBzdG9yZWQgY29sb3JzIGFuZCBsYXlvdXRzXG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoY29uZmlndXJhdGlvbi5hdXRvRGV0ZWN0Q29sb3JTY2hlbWUpIHtcblx0XHRcdFx0aWYgKChjb25maWd1cmF0aW9uLmNvbG9yU2NoZW1lLmRhcmsgJiYgZGF0YS5iYXNlVGhlbWUgIT09ICd2cy1kYXJrJykgfHwgKCFjb25maWd1cmF0aW9uLmNvbG9yU2NoZW1lLmRhcmsgJiYgZGF0YS5iYXNlVGhlbWUgIT09ICd2cycpKSB7XG5cdFx0XHRcdFx0ZGF0YSA9IHVuZGVmaW5lZDsgLy8gT1MgY29sb3Igc2NoZW1lIGlzIHRyYWNrZWQgYW5kIGhhcyBjaGFuZ2VkXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBkZXZlbG9waW5nIGFuIGV4dGVuc2lvbiAtPiBpZ25vcmUgc3RvcmVkIGxheW91dHNcblx0XHRpZiAoZGF0YSAmJiBjb25maWd1cmF0aW9uLmV4dGVuc2lvbkRldmVsb3BtZW50UGF0aCkge1xuXHRcdFx0ZGF0YS5sYXlvdXRJbmZvID0gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIG1pbmltYWwgY29sb3IgY29uZmlndXJhdGlvbiAod29ya3Mgd2l0aCBvciB3aXRob3V0IHBlcnNpc3RlZCBkYXRhKVxuXHRcdGxldCBiYXNlVGhlbWU7XG5cdFx0bGV0IHNoZWxsQmFja2dyb3VuZDtcblx0XHRsZXQgc2hlbGxGb3JlZ3JvdW5kO1xuXHRcdGlmIChkYXRhKSB7XG5cdFx0XHRiYXNlVGhlbWUgPSBkYXRhLmJhc2VUaGVtZTtcblx0XHRcdHNoZWxsQmFja2dyb3VuZCA9IGRhdGEuY29sb3JJbmZvLmVkaXRvckJhY2tncm91bmQ7XG5cdFx0XHRzaGVsbEZvcmVncm91bmQgPSBkYXRhLmNvbG9ySW5mby5mb3JlZ3JvdW5kO1xuXHRcdH0gZWxzZSBpZiAoY29uZmlndXJhdGlvbi5hdXRvRGV0ZWN0SGlnaENvbnRyYXN0ICYmIGNvbmZpZ3VyYXRpb24uY29sb3JTY2hlbWUuaGlnaENvbnRyYXN0KSB7XG5cdFx0XHRpZiAoY29uZmlndXJhdGlvbi5jb2xvclNjaGVtZS5kYXJrKSB7XG5cdFx0XHRcdGJhc2VUaGVtZSA9ICdoYy1ibGFjayc7XG5cdFx0XHRcdHNoZWxsQmFja2dyb3VuZCA9ICcjMDAwMDAwJztcblx0XHRcdFx0c2hlbGxGb3JlZ3JvdW5kID0gJyNGRkZGRkYnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YmFzZVRoZW1lID0gJ2hjLWxpZ2h0Jztcblx0XHRcdFx0c2hlbGxCYWNrZ3JvdW5kID0gJyNGRkZGRkYnO1xuXHRcdFx0XHRzaGVsbEZvcmVncm91bmQgPSAnIzAwMDAwMCc7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChjb25maWd1cmF0aW9uLmF1dG9EZXRlY3RDb2xvclNjaGVtZSkge1xuXHRcdFx0aWYgKGNvbmZpZ3VyYXRpb24uY29sb3JTY2hlbWUuZGFyaykge1xuXHRcdFx0XHRiYXNlVGhlbWUgPSAndnMtZGFyayc7XG5cdFx0XHRcdHNoZWxsQmFja2dyb3VuZCA9ICcjMUUxRTFFJztcblx0XHRcdFx0c2hlbGxGb3JlZ3JvdW5kID0gJyNDQ0NDQ0MnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YmFzZVRoZW1lID0gJ3ZzJztcblx0XHRcdFx0c2hlbGxCYWNrZ3JvdW5kID0gJyNGRkZGRkYnO1xuXHRcdFx0XHRzaGVsbEZvcmVncm91bmQgPSAnIzAwMDAwMCc7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3R5bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzdHlsZScpO1xuXHRcdHN0eWxlLmNsYXNzTmFtZSA9ICdpbml0aWFsU2hlbGxDb2xvcnMnO1xuXHRcdHdpbmRvdy5kb2N1bWVudC5oZWFkLmFwcGVuZENoaWxkKHN0eWxlKTtcblx0XHRzdHlsZS50ZXh0Q29udGVudCA9IGBib2R5IHtcdGJhY2tncm91bmQtY29sb3I6ICR7c2hlbGxCYWNrZ3JvdW5kfTsgY29sb3I6ICR7c2hlbGxGb3JlZ3JvdW5kfTsgbWFyZ2luOiAwOyBwYWRkaW5nOiAwOyB9YDtcblxuXHRcdC8vIHNldCB6b29tIGxldmVsIGFzIHNvb24gYXMgcG9zc2libGVcblx0XHRpZiAodHlwZW9mIGRhdGE/Lnpvb21MZXZlbCA9PT0gJ251bWJlcicgJiYgdHlwZW9mIHByZWxvYWRHbG9iYWxzPy53ZWJGcmFtZT8uc2V0Wm9vbUxldmVsID09PSAnZnVuY3Rpb24nKSB7XG5cdFx0XHRwcmVsb2FkR2xvYmFscy53ZWJGcmFtZS5zZXRab29tTGV2ZWwoZGF0YS56b29tTGV2ZWwpO1xuXHRcdH1cblxuXHRcdC8vIHJlc3RvcmUgcGFydHMgaWYgcG9zc2libGUgKHdlIG1pZ2h0IG5vdCBhbHdheXMgc3RvcmUgbGF5b3V0IGluZm8pXG5cdFx0aWYgKGRhdGE/LmxheW91dEluZm8pIHtcblx0XHRcdGNvbnN0IHsgbGF5b3V0SW5mbywgY29sb3JJbmZvIH0gPSBkYXRhO1xuXHRcdFx0Y29uc3QgbW9kZXJuVUkgPSBsYXlvdXRJbmZvLm1vZGVyblVJID09PSB0cnVlO1xuXHRcdFx0Y29uc3QgZmxvYXRpbmdNYXJnaW4gPSA0O1xuXHRcdFx0Y29uc3QgZmxvYXRpbmdPdXRlck1hcmdpbiA9IGZsb2F0aW5nTWFyZ2luICogMjtcblx0XHRcdGNvbnN0IGZsb2F0aW5nQm9yZGVyV2lkdGggPSAxO1xuXG5cdFx0XHRjb25zdCBzcGxhc2ggPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdHNwbGFzaC5pZCA9ICdtb25hY28tcGFydHMtc3BsYXNoJztcblx0XHRcdHNwbGFzaC5jbGFzc05hbWUgPSBiYXNlVGhlbWUgPz8gJ3ZzLWRhcmsnO1xuXG5cdFx0XHRpZiAobGF5b3V0SW5mby53aW5kb3dCb3JkZXIgJiYgY29sb3JJbmZvLndpbmRvd0JvcmRlcikge1xuXHRcdFx0XHRjb25zdCBib3JkZXJFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdGJvcmRlckVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdFx0XHRib3JkZXJFbGVtZW50LnN0eWxlLndpZHRoID0gJ2NhbGMoMTAwdncgLSAycHgpJztcblx0XHRcdFx0Ym9yZGVyRWxlbWVudC5zdHlsZS5oZWlnaHQgPSAnY2FsYygxMDB2aCAtIDJweCknO1xuXHRcdFx0XHRib3JkZXJFbGVtZW50LnN0eWxlLnpJbmRleCA9ICcxJzsgLy8gYWxsb3cgYm9yZGVyIGFib3ZlIG90aGVyIGVsZW1lbnRzXG5cdFx0XHRcdGJvcmRlckVsZW1lbnQuc3R5bGUuYm9yZGVyID0gYDFweCBzb2xpZCB2YXIoLS13aW5kb3ctYm9yZGVyLWNvbG9yKWA7XG5cdFx0XHRcdGJvcmRlckVsZW1lbnQuc3R5bGUuc2V0UHJvcGVydHkoJy0td2luZG93LWJvcmRlci1jb2xvcicsIGNvbG9ySW5mby53aW5kb3dCb3JkZXIpO1xuXG5cdFx0XHRcdGlmIChsYXlvdXRJbmZvLndpbmRvd0JvcmRlclJhZGl1cykge1xuXHRcdFx0XHRcdGJvcmRlckVsZW1lbnQuc3R5bGUuYm9yZGVyUmFkaXVzID0gbGF5b3V0SW5mby53aW5kb3dCb3JkZXJSYWRpdXM7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzcGxhc2guYXBwZW5kQ2hpbGQoYm9yZGVyRWxlbWVudCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNldEJvdW5kcyA9IChlbGVtZW50OiBIVE1MRWxlbWVudCwgYm91bmRzOiB7IHRvcDogbnVtYmVyOyBib3R0b20/OiBudW1iZXI7IGxlZnQ/OiBudW1iZXI7IHJpZ2h0PzogbnVtYmVyOyB3aWR0aD86IG51bWJlcjsgaGVpZ2h0PzogbnVtYmVyIH0pID0+IHtcblx0XHRcdFx0ZWxlbWVudC5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0XHRcdGVsZW1lbnQuc3R5bGUudG9wID0gYCR7Ym91bmRzLnRvcH1weGA7XG5cdFx0XHRcdGlmICh0eXBlb2YgYm91bmRzLmJvdHRvbSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRlbGVtZW50LnN0eWxlLmJvdHRvbSA9IGAke2JvdW5kcy5ib3R0b219cHhgO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0eXBlb2YgYm91bmRzLmxlZnQgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0ZWxlbWVudC5zdHlsZS5sZWZ0ID0gYCR7Ym91bmRzLmxlZnR9cHhgO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0eXBlb2YgYm91bmRzLnJpZ2h0ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdGVsZW1lbnQuc3R5bGUucmlnaHQgPSBgJHtib3VuZHMucmlnaHR9cHhgO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0eXBlb2YgYm91bmRzLndpZHRoID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdGVsZW1lbnQuc3R5bGUud2lkdGggPSBgJHtib3VuZHMud2lkdGh9cHhgO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0eXBlb2YgYm91bmRzLmhlaWdodCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRlbGVtZW50LnN0eWxlLmhlaWdodCA9IGAke2JvdW5kcy5oZWlnaHR9cHhgO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBzZXRQYXJ0Qm91bmRzID0gKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBib3VuZHM6IHsgdG9wOiBudW1iZXI7IGxlZnQ6IG51bWJlcjsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSkgPT4ge1xuXHRcdFx0XHRlbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRcdFx0ZWxlbWVudC5zdHlsZS50b3AgPSBgJHtib3VuZHMudG9wfXB4YDtcblx0XHRcdFx0ZWxlbWVudC5zdHlsZS5sZWZ0ID0gYCR7Ym91bmRzLmxlZnR9cHhgO1xuXHRcdFx0XHRlbGVtZW50LnN0eWxlLndpZHRoID0gYCR7Ym91bmRzLndpZHRofXB4YDtcblx0XHRcdFx0ZWxlbWVudC5zdHlsZS5oZWlnaHQgPSBgJHtib3VuZHMuaGVpZ2h0fXB4YDtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGFwcGx5RmxvYXRpbmdDYXJkU3R5bGVzID0gKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBiYWNrZ3JvdW5kQ29sb3I6IHN0cmluZyB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0XHRlbGVtZW50LnN0eWxlLmJveFNpemluZyA9ICdib3JkZXItYm94Jztcblx0XHRcdFx0ZWxlbWVudC5zdHlsZS5ib3JkZXIgPSBgJHtmbG9hdGluZ0JvcmRlcldpZHRofXB4IHNvbGlkICR7Y29sb3JJbmZvLmFnZW50c1BhbmVsQm9yZGVyID8/IGNvbG9ySW5mby5lZGl0b3JHcm91cEJvcmRlciA/PyAndHJhbnNwYXJlbnQnfWA7XG5cdFx0XHRcdGVsZW1lbnQuc3R5bGUuYm9yZGVyUmFkaXVzID0gJzhweCc7XG5cdFx0XHRcdGVsZW1lbnQuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYmFja2dyb3VuZENvbG9yID8/IGNvbG9ySW5mby5lZGl0b3JCYWNrZ3JvdW5kID8/IGNvbG9ySW5mby5iYWNrZ3JvdW5kO1xuXHRcdFx0XHRlbGVtZW50LnN0eWxlLm92ZXJmbG93ID0gJ2hpZGRlbic7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBjb250ZW50VG9wID0gbGF5b3V0SW5mby50aXRsZUJhckhlaWdodDtcblx0XHRcdGNvbnN0IGNvbnRlbnRCb3R0b20gPSBsYXlvdXRJbmZvLnN0YXR1c0JhckhlaWdodDtcblx0XHRcdGNvbnN0IGNvbnRlbnRIZWlnaHQgPSBgY2FsYygxMDAlIC0gJHtjb250ZW50VG9wICsgY29udGVudEJvdHRvbX1weClgO1xuXHRcdFx0Y29uc3QgYWN0aXZpdHlIZWlnaHQgPSBtb2Rlcm5VSSA/IGBjYWxjKDEwMCUgLSAke2NvbnRlbnRUb3AgKyBjb250ZW50Qm90dG9tICsgZmxvYXRpbmdNYXJnaW59cHgpYCA6IGNvbnRlbnRIZWlnaHQ7XG5cblx0XHRcdGlmIChsYXlvdXRJbmZvLmF1eGlsaWFyeUJhcldpZHRoID09PSBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUikge1xuXHRcdFx0XHQvLyBpZiBhdXhpbGlhcnkgYmFyIGlzIG1heGltaXplZCwgaXQgZ29lcyBhcyB3aWRlIGFzIHRoZVxuXHRcdFx0XHQvLyB3aW5kb3cgd2lkdGggYnV0IGxlYXZpbmcgcm9vbSBmb3IgYWN0aXZpdHkgYmFyXG5cdFx0XHRcdGxheW91dEluZm8uYXV4aWxpYXJ5QmFyV2lkdGggPSB3aW5kb3cuaW5uZXJXaWR0aCAtIGxheW91dEluZm8uYWN0aXZpdHlCYXJXaWR0aDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIG90aGVyd2lzZSBhZGp1c3QgZm9yIG90aGVyIHBhcnRzIHNpemVzIGlmIG5vdCBtYXhpbWl6ZWRcblx0XHRcdFx0bGF5b3V0SW5mby5hdXhpbGlhcnlCYXJXaWR0aCA9IE1hdGgubWluKGxheW91dEluZm8uYXV4aWxpYXJ5QmFyV2lkdGgsIHdpbmRvdy5pbm5lcldpZHRoIC0gKGxheW91dEluZm8uYWN0aXZpdHlCYXJXaWR0aCArIGxheW91dEluZm8uZWRpdG9yUGFydE1pbldpZHRoICsgbGF5b3V0SW5mby5zaWRlQmFyV2lkdGgpKTtcblx0XHRcdH1cblx0XHRcdGxheW91dEluZm8uc2lkZUJhcldpZHRoID0gTWF0aC5taW4obGF5b3V0SW5mby5zaWRlQmFyV2lkdGgsIHdpbmRvdy5pbm5lcldpZHRoIC0gKGxheW91dEluZm8uYWN0aXZpdHlCYXJXaWR0aCArIGxheW91dEluZm8uZWRpdG9yUGFydE1pbldpZHRoICsgbGF5b3V0SW5mby5hdXhpbGlhcnlCYXJXaWR0aCkpO1xuXG5cdFx0XHQvLyBwYXJ0OiB0aXRsZVxuXHRcdFx0aWYgKGxheW91dEluZm8udGl0bGVCYXJIZWlnaHQgPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHRpdGxlRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdHRpdGxlRGl2LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRcdFx0dGl0bGVEaXYuc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cdFx0XHRcdHRpdGxlRGl2LnN0eWxlLmhlaWdodCA9IGAke2xheW91dEluZm8udGl0bGVCYXJIZWlnaHR9cHhgO1xuXHRcdFx0XHR0aXRsZURpdi5zdHlsZS5sZWZ0ID0gJzAnO1xuXHRcdFx0XHR0aXRsZURpdi5zdHlsZS50b3AgPSAnMCc7XG5cdFx0XHRcdHRpdGxlRGl2LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IG1vZGVyblVJID8gJ3RyYW5zcGFyZW50JyA6IGAke2NvbG9ySW5mby50aXRsZUJhckJhY2tncm91bmR9YDtcblx0XHRcdFx0KHRpdGxlRGl2LnN0eWxlIGFzIENTU1N0eWxlRGVjbGFyYXRpb24gJiB7ICctd2Via2l0LWFwcC1yZWdpb24nOiBzdHJpbmcgfSlbJy13ZWJraXQtYXBwLXJlZ2lvbiddID0gJ2RyYWcnO1xuXHRcdFx0XHRzcGxhc2guYXBwZW5kQ2hpbGQodGl0bGVEaXYpO1xuXG5cdFx0XHRcdGlmICghbW9kZXJuVUkgJiYgY29sb3JJbmZvLnRpdGxlQmFyQm9yZGVyKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGl0bGVCb3JkZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0XHR0aXRsZUJvcmRlci5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0XHRcdFx0dGl0bGVCb3JkZXIuc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cdFx0XHRcdFx0dGl0bGVCb3JkZXIuc3R5bGUuaGVpZ2h0ID0gJzFweCc7XG5cdFx0XHRcdFx0dGl0bGVCb3JkZXIuc3R5bGUubGVmdCA9ICcwJztcblx0XHRcdFx0XHR0aXRsZUJvcmRlci5zdHlsZS5ib3R0b20gPSAnMCc7XG5cdFx0XHRcdFx0dGl0bGVCb3JkZXIuc3R5bGUuYm9yZGVyQm90dG9tID0gYDFweCBzb2xpZCAke2NvbG9ySW5mby50aXRsZUJhckJvcmRlcn1gO1xuXHRcdFx0XHRcdHRpdGxlRGl2LmFwcGVuZENoaWxkKHRpdGxlQm9yZGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBwYXJ0OiBhY3Rpdml0eSBiYXJcblx0XHRcdGlmIChsYXlvdXRJbmZvLmFjdGl2aXR5QmFyV2lkdGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGl2aXR5RGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdGFjdGl2aXR5RGl2LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRcdFx0YWN0aXZpdHlEaXYuc3R5bGUud2lkdGggPSBgJHtsYXlvdXRJbmZvLmFjdGl2aXR5QmFyV2lkdGh9cHhgO1xuXHRcdFx0XHRhY3Rpdml0eURpdi5zdHlsZS5oZWlnaHQgPSBhY3Rpdml0eUhlaWdodDtcblx0XHRcdFx0YWN0aXZpdHlEaXYuc3R5bGUudG9wID0gYCR7Y29udGVudFRvcH1weGA7XG5cdFx0XHRcdGlmIChsYXlvdXRJbmZvLnNpZGVCYXJTaWRlID09PSAnbGVmdCcpIHtcblx0XHRcdFx0XHRhY3Rpdml0eURpdi5zdHlsZS5sZWZ0ID0gJzAnO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFjdGl2aXR5RGl2LnN0eWxlLnJpZ2h0ID0gJzAnO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFjdGl2aXR5RGl2LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IG1vZGVyblVJID8gJ3RyYW5zcGFyZW50JyA6IGAke2NvbG9ySW5mby5hY3Rpdml0eUJhckJhY2tncm91bmR9YDtcblx0XHRcdFx0c3BsYXNoLmFwcGVuZENoaWxkKGFjdGl2aXR5RGl2KTtcblxuXHRcdFx0XHRpZiAoIW1vZGVyblVJICYmIGNvbG9ySW5mby5hY3Rpdml0eUJhckJvcmRlcikge1xuXHRcdFx0XHRcdGNvbnN0IGFjdGl2aXR5Qm9yZGVyRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdFx0YWN0aXZpdHlCb3JkZXJEaXYuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdFx0XHRcdGFjdGl2aXR5Qm9yZGVyRGl2LnN0eWxlLndpZHRoID0gJzFweCc7XG5cdFx0XHRcdFx0YWN0aXZpdHlCb3JkZXJEaXYuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXHRcdFx0XHRcdGFjdGl2aXR5Qm9yZGVyRGl2LnN0eWxlLnRvcCA9ICcwJztcblx0XHRcdFx0XHRpZiAobGF5b3V0SW5mby5zaWRlQmFyU2lkZSA9PT0gJ2xlZnQnKSB7XG5cdFx0XHRcdFx0XHRhY3Rpdml0eUJvcmRlckRpdi5zdHlsZS5yaWdodCA9ICcwJztcblx0XHRcdFx0XHRcdGFjdGl2aXR5Qm9yZGVyRGl2LnN0eWxlLmJvcmRlclJpZ2h0ID0gYDFweCBzb2xpZCAke2NvbG9ySW5mby5hY3Rpdml0eUJhckJvcmRlcn1gO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhY3Rpdml0eUJvcmRlckRpdi5zdHlsZS5sZWZ0ID0gJzAnO1xuXHRcdFx0XHRcdFx0YWN0aXZpdHlCb3JkZXJEaXYuc3R5bGUuYm9yZGVyTGVmdCA9IGAxcHggc29saWQgJHtjb2xvckluZm8uYWN0aXZpdHlCYXJCb3JkZXJ9YDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YWN0aXZpdHlEaXYuYXBwZW5kQ2hpbGQoYWN0aXZpdHlCb3JkZXJEaXYpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIHBhcnQ6IHNpZGUgYmFyXG5cdFx0XHRpZiAobGF5b3V0SW5mby5zaWRlQmFyV2lkdGggPiAwKSB7XG5cdFx0XHRcdGNvbnN0IHNpZGVEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0aWYgKG1vZGVyblVJICYmIGxheW91dEluZm8ucGFydEJvdW5kcz8uc2lkZUJhcikge1xuXHRcdFx0XHRcdHNldFBhcnRCb3VuZHMoc2lkZURpdiwgbGF5b3V0SW5mby5wYXJ0Qm91bmRzLnNpZGVCYXIpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGxheW91dEluZm8uc2lkZUJhclNpZGUgPT09ICdsZWZ0Jykge1xuXHRcdFx0XHRcdHNldEJvdW5kcyhzaWRlRGl2LCB7XG5cdFx0XHRcdFx0XHR0b3A6IGNvbnRlbnRUb3AsXG5cdFx0XHRcdFx0XHRib3R0b206IG1vZGVyblVJID8gY29udGVudEJvdHRvbSArIGZsb2F0aW5nTWFyZ2luIDogY29udGVudEJvdHRvbSxcblx0XHRcdFx0XHRcdGxlZnQ6IGxheW91dEluZm8uYWN0aXZpdHlCYXJXaWR0aCArIChtb2Rlcm5VSSA/IGZsb2F0aW5nTWFyZ2luIDogMCksXG5cdFx0XHRcdFx0XHR3aWR0aDogbW9kZXJuVUkgPyBNYXRoLm1heCgwLCBsYXlvdXRJbmZvLnNpZGVCYXJXaWR0aCAtIGZsb2F0aW5nT3V0ZXJNYXJnaW4gLSBmbG9hdGluZ0JvcmRlcldpZHRoICogMikgOiBsYXlvdXRJbmZvLnNpZGVCYXJXaWR0aFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHNldEJvdW5kcyhzaWRlRGl2LCB7XG5cdFx0XHRcdFx0XHR0b3A6IGNvbnRlbnRUb3AsXG5cdFx0XHRcdFx0XHRib3R0b206IG1vZGVyblVJID8gY29udGVudEJvdHRvbSArIGZsb2F0aW5nTWFyZ2luIDogY29udGVudEJvdHRvbSxcblx0XHRcdFx0XHRcdHJpZ2h0OiBsYXlvdXRJbmZvLmFjdGl2aXR5QmFyV2lkdGggKyAobW9kZXJuVUkgPyBmbG9hdGluZ01hcmdpbiA6IDApLFxuXHRcdFx0XHRcdFx0d2lkdGg6IG1vZGVyblVJID8gTWF0aC5tYXgoMCwgbGF5b3V0SW5mby5zaWRlQmFyV2lkdGggLSBmbG9hdGluZ091dGVyTWFyZ2luIC0gZmxvYXRpbmdCb3JkZXJXaWR0aCAqIDIpIDogbGF5b3V0SW5mby5zaWRlQmFyV2lkdGhcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobW9kZXJuVUkpIHtcblx0XHRcdFx0XHRhcHBseUZsb2F0aW5nQ2FyZFN0eWxlcyhzaWRlRGl2LCBjb2xvckluZm8uYWdlbnRzUGFuZWxCYWNrZ3JvdW5kID8/IGNvbG9ySW5mby5zaWRlQmFyQmFja2dyb3VuZCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0c2lkZURpdi5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBgJHtjb2xvckluZm8uc2lkZUJhckJhY2tncm91bmR9YDtcblx0XHRcdFx0fVxuXHRcdFx0XHRzcGxhc2guYXBwZW5kQ2hpbGQoc2lkZURpdik7XG5cblx0XHRcdFx0aWYgKCFtb2Rlcm5VSSAmJiBjb2xvckluZm8uc2lkZUJhckJvcmRlcikge1xuXHRcdFx0XHRcdGNvbnN0IHNpZGVCb3JkZXJEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0XHRzaWRlQm9yZGVyRGl2LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRcdFx0XHRzaWRlQm9yZGVyRGl2LnN0eWxlLndpZHRoID0gJzFweCc7XG5cdFx0XHRcdFx0c2lkZUJvcmRlckRpdi5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cdFx0XHRcdFx0c2lkZUJvcmRlckRpdi5zdHlsZS50b3AgPSAnMCc7XG5cdFx0XHRcdFx0c2lkZUJvcmRlckRpdi5zdHlsZS5yaWdodCA9ICcwJztcblx0XHRcdFx0XHRpZiAobGF5b3V0SW5mby5zaWRlQmFyU2lkZSA9PT0gJ2xlZnQnKSB7XG5cdFx0XHRcdFx0XHRzaWRlQm9yZGVyRGl2LnN0eWxlLmJvcmRlclJpZ2h0ID0gYDFweCBzb2xpZCAke2NvbG9ySW5mby5zaWRlQmFyQm9yZGVyfWA7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHNpZGVCb3JkZXJEaXYuc3R5bGUubGVmdCA9ICcwJztcblx0XHRcdFx0XHRcdHNpZGVCb3JkZXJEaXYuc3R5bGUuYm9yZGVyTGVmdCA9IGAxcHggc29saWQgJHtjb2xvckluZm8uc2lkZUJhckJvcmRlcn1gO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRzaWRlRGl2LmFwcGVuZENoaWxkKHNpZGVCb3JkZXJEaXYpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIHBhcnQ6IGF1eGlsaWFyeSBzaWRlYmFyXG5cdFx0XHRpZiAobGF5b3V0SW5mby5hdXhpbGlhcnlCYXJXaWR0aCA+IDApIHtcblx0XHRcdFx0Y29uc3QgYXV4U2lkZURpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRpZiAobW9kZXJuVUkgJiYgbGF5b3V0SW5mby5wYXJ0Qm91bmRzPy5hdXhpbGlhcnlCYXIpIHtcblx0XHRcdFx0XHRzZXRQYXJ0Qm91bmRzKGF1eFNpZGVEaXYsIGxheW91dEluZm8ucGFydEJvdW5kcy5hdXhpbGlhcnlCYXIpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGxheW91dEluZm8uc2lkZUJhclNpZGUgPT09ICdsZWZ0Jykge1xuXHRcdFx0XHRcdHNldEJvdW5kcyhhdXhTaWRlRGl2LCB7XG5cdFx0XHRcdFx0XHR0b3A6IGNvbnRlbnRUb3AsXG5cdFx0XHRcdFx0XHRib3R0b206IG1vZGVyblVJID8gY29udGVudEJvdHRvbSArIGZsb2F0aW5nTWFyZ2luIDogY29udGVudEJvdHRvbSxcblx0XHRcdFx0XHRcdHJpZ2h0OiBtb2Rlcm5VSSA/IGZsb2F0aW5nT3V0ZXJNYXJnaW4gOiAwLFxuXHRcdFx0XHRcdFx0d2lkdGg6IG1vZGVyblVJID8gTWF0aC5tYXgoMCwgbGF5b3V0SW5mby5hdXhpbGlhcnlCYXJXaWR0aCAtIGZsb2F0aW5nT3V0ZXJNYXJnaW4gLSBmbG9hdGluZ01hcmdpbiAtIGZsb2F0aW5nQm9yZGVyV2lkdGggKiAyKSA6IGxheW91dEluZm8uYXV4aWxpYXJ5QmFyV2lkdGhcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRzZXRCb3VuZHMoYXV4U2lkZURpdiwge1xuXHRcdFx0XHRcdFx0dG9wOiBjb250ZW50VG9wLFxuXHRcdFx0XHRcdFx0Ym90dG9tOiBtb2Rlcm5VSSA/IGNvbnRlbnRCb3R0b20gKyBmbG9hdGluZ01hcmdpbiA6IGNvbnRlbnRCb3R0b20sXG5cdFx0XHRcdFx0XHRsZWZ0OiBtb2Rlcm5VSSA/IGZsb2F0aW5nT3V0ZXJNYXJnaW4gOiAwLFxuXHRcdFx0XHRcdFx0d2lkdGg6IG1vZGVyblVJID8gTWF0aC5tYXgoMCwgbGF5b3V0SW5mby5hdXhpbGlhcnlCYXJXaWR0aCAtIGZsb2F0aW5nT3V0ZXJNYXJnaW4gLSBmbG9hdGluZ01hcmdpbiAtIGZsb2F0aW5nQm9yZGVyV2lkdGggKiAyKSA6IGxheW91dEluZm8uYXV4aWxpYXJ5QmFyV2lkdGhcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAobW9kZXJuVUkpIHtcblx0XHRcdFx0XHRhcHBseUZsb2F0aW5nQ2FyZFN0eWxlcyhhdXhTaWRlRGl2LCBjb2xvckluZm8uc2lkZUJhckJhY2tncm91bmQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGF1eFNpZGVEaXYuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYCR7Y29sb3JJbmZvLnNpZGVCYXJCYWNrZ3JvdW5kfWA7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3BsYXNoLmFwcGVuZENoaWxkKGF1eFNpZGVEaXYpO1xuXG5cdFx0XHRcdGlmICghbW9kZXJuVUkgJiYgY29sb3JJbmZvLnNpZGVCYXJCb3JkZXIpIHtcblx0XHRcdFx0XHRjb25zdCBhdXhTaWRlQm9yZGVyRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdFx0YXV4U2lkZUJvcmRlckRpdi5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0XHRcdFx0YXV4U2lkZUJvcmRlckRpdi5zdHlsZS53aWR0aCA9ICcxcHgnO1xuXHRcdFx0XHRcdGF1eFNpZGVCb3JkZXJEaXYuc3R5bGUuaGVpZ2h0ID0gJzEwMCUnO1xuXHRcdFx0XHRcdGF1eFNpZGVCb3JkZXJEaXYuc3R5bGUudG9wID0gJzAnO1xuXHRcdFx0XHRcdGlmIChsYXlvdXRJbmZvLnNpZGVCYXJTaWRlID09PSAnbGVmdCcpIHtcblx0XHRcdFx0XHRcdGF1eFNpZGVCb3JkZXJEaXYuc3R5bGUubGVmdCA9ICcwJztcblx0XHRcdFx0XHRcdGF1eFNpZGVCb3JkZXJEaXYuc3R5bGUuYm9yZGVyTGVmdCA9IGAxcHggc29saWQgJHtjb2xvckluZm8uc2lkZUJhckJvcmRlcn1gO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhdXhTaWRlQm9yZGVyRGl2LnN0eWxlLnJpZ2h0ID0gJzAnO1xuXHRcdFx0XHRcdFx0YXV4U2lkZUJvcmRlckRpdi5zdHlsZS5ib3JkZXJSaWdodCA9IGAxcHggc29saWQgJHtjb2xvckluZm8uc2lkZUJhckJvcmRlcn1gO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhdXhTaWRlRGl2LmFwcGVuZENoaWxkKGF1eFNpZGVCb3JkZXJEaXYpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChtb2Rlcm5VSSAmJiAobGF5b3V0SW5mby5wYXJ0Qm91bmRzPy5lZGl0b3IgfHwgIWxheW91dEluZm8ucGFydEJvdW5kcykpIHtcblx0XHRcdFx0Y29uc3QgZWRpdG9yRGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRcdGlmIChsYXlvdXRJbmZvLnBhcnRCb3VuZHM/LmVkaXRvcikge1xuXHRcdFx0XHRcdHNldFBhcnRCb3VuZHMoZWRpdG9yRGl2LCBsYXlvdXRJbmZvLnBhcnRCb3VuZHMuZWRpdG9yKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JMZWZ0ID0gKGxheW91dEluZm8uc2lkZUJhclNpZGUgPT09ICdsZWZ0JyA/IGxheW91dEluZm8uYWN0aXZpdHlCYXJXaWR0aCArIGxheW91dEluZm8uc2lkZUJhcldpZHRoIDogbGF5b3V0SW5mby5hdXhpbGlhcnlCYXJXaWR0aCkgKyBmbG9hdGluZ01hcmdpbjtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JSaWdodCA9IChsYXlvdXRJbmZvLnNpZGVCYXJTaWRlID09PSAnbGVmdCcgPyBsYXlvdXRJbmZvLmF1eGlsaWFyeUJhcldpZHRoIDogbGF5b3V0SW5mby5hY3Rpdml0eUJhcldpZHRoICsgbGF5b3V0SW5mby5zaWRlQmFyV2lkdGgpICsgZmxvYXRpbmdNYXJnaW47XG5cdFx0XHRcdFx0c2V0Qm91bmRzKGVkaXRvckRpdiwge1xuXHRcdFx0XHRcdFx0dG9wOiBjb250ZW50VG9wLFxuXHRcdFx0XHRcdFx0Ym90dG9tOiBjb250ZW50Qm90dG9tICsgZmxvYXRpbmdNYXJnaW4sXG5cdFx0XHRcdFx0XHRsZWZ0OiBlZGl0b3JMZWZ0LFxuXHRcdFx0XHRcdFx0cmlnaHQ6IGVkaXRvclJpZ2h0XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXBwbHlGbG9hdGluZ0NhcmRTdHlsZXMoZWRpdG9yRGl2LCBjb2xvckluZm8uZWRpdG9yQmFja2dyb3VuZCk7XG5cdFx0XHRcdHNwbGFzaC5hcHBlbmRDaGlsZChlZGl0b3JEaXYpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobW9kZXJuVUkgJiYgbGF5b3V0SW5mby5wYXJ0Qm91bmRzPy5wYW5lbCkge1xuXHRcdFx0XHRjb25zdCBwYW5lbERpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRzZXRQYXJ0Qm91bmRzKHBhbmVsRGl2LCBsYXlvdXRJbmZvLnBhcnRCb3VuZHMucGFuZWwpO1xuXHRcdFx0XHRhcHBseUZsb2F0aW5nQ2FyZFN0eWxlcyhwYW5lbERpdiwgY29sb3JJbmZvLnBhbmVsQmFja2dyb3VuZCA/PyBjb2xvckluZm8uZWRpdG9yQmFja2dyb3VuZCk7XG5cdFx0XHRcdHNwbGFzaC5hcHBlbmRDaGlsZChwYW5lbERpdik7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHBhcnQ6IHN0YXR1c2JhclxuXHRcdFx0aWYgKGxheW91dEluZm8uc3RhdHVzQmFySGVpZ2h0ID4gMCkge1xuXHRcdFx0XHRjb25zdCBzdGF0dXNEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0c3RhdHVzRGl2LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRcdFx0c3RhdHVzRGl2LnN0eWxlLndpZHRoID0gJzEwMCUnO1xuXHRcdFx0XHRzdGF0dXNEaXYuc3R5bGUuaGVpZ2h0ID0gYCR7bGF5b3V0SW5mby5zdGF0dXNCYXJIZWlnaHR9cHhgO1xuXHRcdFx0XHRzdGF0dXNEaXYuc3R5bGUuYm90dG9tID0gJzAnO1xuXHRcdFx0XHRzdGF0dXNEaXYuc3R5bGUubGVmdCA9ICcwJztcblx0XHRcdFx0aWYgKG1vZGVyblVJKSB7XG5cdFx0XHRcdFx0c3RhdHVzRGl2LnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICd0cmFuc3BhcmVudCc7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY29uZmlndXJhdGlvbi53b3Jrc3BhY2UgJiYgY29sb3JJbmZvLnN0YXR1c0JhckJhY2tncm91bmQpIHtcblx0XHRcdFx0XHRzdGF0dXNEaXYuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gY29sb3JJbmZvLnN0YXR1c0JhckJhY2tncm91bmQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAoIWNvbmZpZ3VyYXRpb24ud29ya3NwYWNlICYmIGNvbG9ySW5mby5zdGF0dXNCYXJOb0ZvbGRlckJhY2tncm91bmQpIHtcblx0XHRcdFx0XHRzdGF0dXNEaXYuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gY29sb3JJbmZvLnN0YXR1c0Jhck5vRm9sZGVyQmFja2dyb3VuZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRzcGxhc2guYXBwZW5kQ2hpbGQoc3RhdHVzRGl2KTtcblxuXHRcdFx0XHRpZiAoIW1vZGVyblVJICYmIGNvbG9ySW5mby5zdGF0dXNCYXJCb3JkZXIpIHtcblx0XHRcdFx0XHRjb25zdCBzdGF0dXNCb3JkZXJEaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdFx0XHRzdGF0dXNCb3JkZXJEaXYuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdFx0XHRcdHN0YXR1c0JvcmRlckRpdi5zdHlsZS53aWR0aCA9ICcxMDAlJztcblx0XHRcdFx0XHRzdGF0dXNCb3JkZXJEaXYuc3R5bGUuaGVpZ2h0ID0gJzFweCc7XG5cdFx0XHRcdFx0c3RhdHVzQm9yZGVyRGl2LnN0eWxlLnRvcCA9ICcwJztcblx0XHRcdFx0XHRzdGF0dXNCb3JkZXJEaXYuc3R5bGUuYm9yZGVyVG9wID0gYDFweCBzb2xpZCAke2NvbG9ySW5mby5zdGF0dXNCYXJCb3JkZXJ9YDtcblx0XHRcdFx0XHRzdGF0dXNEaXYuYXBwZW5kQ2hpbGQoc3RhdHVzQm9yZGVyRGl2KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHR3aW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChzcGxhc2gpO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBXaW5kb3cgSGVscGVyc1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGxvYWQ8TSwgVCBleHRlbmRzIElTYW5kYm94Q29uZmlndXJhdGlvbj4ob3B0aW9uczogSUxvYWRPcHRpb25zPFQ+KTogUHJvbWlzZTxJTG9hZFJlc3VsdDxNLCBUPj4ge1xuXG5cdFx0Ly8gV2luZG93IENvbmZpZ3VyYXRpb24gZnJvbSBQcmVsb2FkIFNjcmlwdFxuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSBhd2FpdCByZXNvbHZlV2luZG93Q29uZmlndXJhdGlvbjxUPigpO1xuXG5cdFx0Ly8gU2lnbmFsIGJlZm9yZSBpbXBvcnQoKVxuXHRcdG9wdGlvbnM/LmJlZm9yZUltcG9ydD8uKGNvbmZpZ3VyYXRpb24pO1xuXG5cdFx0Ly8gRGV2ZWxvcGVyIHNldHRpbmdzXG5cdFx0Y29uc3QgeyBlbmFibGVEZXZlbG9wZXJLZXliaW5kaW5ncywgcmVtb3ZlRGV2ZWxvcGVyS2V5YmluZGluZ3NBZnRlckxvYWQsIGRldmVsb3BlckRldmVsb3BlcktleWJpbmRpbmdzRGlzcG9zYWJsZSwgZm9yY2VEaXNhYmxlU2hvd0RldnRvb2xzT25FcnJvciB9ID0gc2V0dXBEZXZlbG9wZXJLZXliaW5kaW5ncyhjb25maWd1cmF0aW9uLCBvcHRpb25zKTtcblxuXHRcdC8vIE5MU1xuXHRcdHNldHVwTkxTPFQ+KGNvbmZpZ3VyYXRpb24pO1xuXG5cdFx0Ly8gQ29tcHV0ZSBiYXNlIFVSTCBhbmQgc2V0IGFzIGdsb2JhbFxuXHRcdGNvbnN0IGJhc2VVcmwgPSBuZXcgVVJMKGAke2ZpbGVVcmlGcm9tUGF0aChjb25maWd1cmF0aW9uLmFwcFJvb3QsIHsgaXNXaW5kb3dzOiBzYWZlUHJvY2Vzcy5wbGF0Zm9ybSA9PT0gJ3dpbjMyJywgc2NoZW1lOiAndnNjb2RlLWZpbGUnLCBmYWxsYmFja0F1dGhvcml0eTogJ3ZzY29kZS1hcHAnIH0pfS9vdXQvYCk7XG5cdFx0Z2xvYmFsVGhpcy5fVlNDT0RFX0ZJTEVfUk9PVCA9IGJhc2VVcmwudG9TdHJpbmcoKTtcblxuXHRcdC8vIFNldCBwcm9kdWN0IGNvbmZpZ3VyYXRpb24gYXMgZ2xvYmFsICh1c2VkIGUuZy4gdG8gc2VsZWN0IHRoZSBBU0FSIHBhdGggaW4gYGFtZFhgKVxuXHRcdGdsb2JhbFRoaXMuX1ZTQ09ERV9QUk9EVUNUX0pTT04gPSB7IC4uLmNvbmZpZ3VyYXRpb24ucHJvZHVjdCB9O1xuXG5cdFx0Ly8gRGV2IG9ubHk6IENTUyBpbXBvcnQgbWFwIHRyaWNrc1xuXHRcdHNldHVwQ1NTSW1wb3J0TWFwczxUPihjb25maWd1cmF0aW9uLCBiYXNlVXJsKTtcblxuXHRcdC8vIEVTTSBJbXBvcnRcblx0XHR0cnkge1xuXHRcdFx0bGV0IHdvcmtiZW5jaFVybDogc3RyaW5nO1xuXHRcdFx0aWYgKCEhc2FmZVByb2Nlc3MuZW52WydWU0NPREVfREVWJ10gJiYgZ2xvYmFsVGhpcy5fVlNDT0RFX1VTRV9SRUxBVElWRV9JTVBPUlRTKSB7XG5cdFx0XHRcdHdvcmtiZW5jaFVybCA9ICcuLi8uLi8uLi93b3JrYmVuY2gvd29ya2JlbmNoLmRlc2t0b3AubWFpbi5qcyc7IC8vIGZvciBkZXYgcHVycG9zZXMgb25seVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0d29ya2JlbmNoVXJsID0gbmV3IFVSTChgdnMvd29ya2JlbmNoL3dvcmtiZW5jaC5kZXNrdG9wLm1haW4uanNgLCBiYXNlVXJsKS5ocmVmO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBpbXBvcnQod29ya2JlbmNoVXJsKTtcblx0XHRcdGlmIChkZXZlbG9wZXJEZXZlbG9wZXJLZXliaW5kaW5nc0Rpc3Bvc2FibGUgJiYgcmVtb3ZlRGV2ZWxvcGVyS2V5YmluZGluZ3NBZnRlckxvYWQpIHtcblx0XHRcdFx0ZGV2ZWxvcGVyRGV2ZWxvcGVyS2V5YmluZGluZ3NEaXNwb3NhYmxlKCk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IHJlc3VsdCwgY29uZmlndXJhdGlvbiB9O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnJvciwgZW5hYmxlRGV2ZWxvcGVyS2V5YmluZGluZ3MgJiYgIWZvcmNlRGlzYWJsZVNob3dEZXZ0b29sc09uRXJyb3IpO1xuXG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiByZXNvbHZlV2luZG93Q29uZmlndXJhdGlvbjxUIGV4dGVuZHMgSVNhbmRib3hDb25maWd1cmF0aW9uPigpIHtcblx0XHRjb25zdCB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7IGNvbnNvbGUuZXJyb3IoYFtyZXNvbHZlIHdpbmRvdyBjb25maWddIENvdWxkIG5vdCByZXNvbHZlIHdpbmRvdyBjb25maWd1cmF0aW9uIHdpdGhpbiAxMCBzZWNvbmRzLCBidXQgd2lsbCBjb250aW51ZSB0byB3YWl0Li4uYCk7IH0sIDEwMDAwKTtcblx0XHRwZXJmb3JtYW5jZS5tYXJrKCdjb2RlL3dpbGxXYWl0Rm9yV2luZG93Q29uZmlnJyk7XG5cblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gYXdhaXQgcHJlbG9hZEdsb2JhbHMuY29udGV4dC5yZXNvbHZlQ29uZmlndXJhdGlvbigpIGFzIFQ7XG5cdFx0cGVyZm9ybWFuY2UubWFyaygnY29kZS9kaWRXYWl0Rm9yV2luZG93Q29uZmlnJyk7XG5cblx0XHRjbGVhclRpbWVvdXQodGltZW91dCk7XG5cblx0XHRyZXR1cm4gY29uZmlndXJhdGlvbjtcblx0fVxuXG5cdGZ1bmN0aW9uIHNldHVwRGV2ZWxvcGVyS2V5YmluZGluZ3M8VCBleHRlbmRzIElTYW5kYm94Q29uZmlndXJhdGlvbj4oY29uZmlndXJhdGlvbjogVCwgb3B0aW9uczogSUxvYWRPcHRpb25zPFQ+KSB7XG5cdFx0Y29uc3Qge1xuXHRcdFx0Zm9yY2VFbmFibGVEZXZlbG9wZXJLZXliaW5kaW5ncyxcblx0XHRcdGRpc2FsbG93UmVsb2FkS2V5YmluZGluZyxcblx0XHRcdHJlbW92ZURldmVsb3BlcktleWJpbmRpbmdzQWZ0ZXJMb2FkLFxuXHRcdFx0Zm9yY2VEaXNhYmxlU2hvd0RldnRvb2xzT25FcnJvclxuXHRcdH0gPSB0eXBlb2Ygb3B0aW9ucz8uY29uZmlndXJlRGV2ZWxvcGVyU2V0dGluZ3MgPT09ICdmdW5jdGlvbicgPyBvcHRpb25zLmNvbmZpZ3VyZURldmVsb3BlclNldHRpbmdzKGNvbmZpZ3VyYXRpb24pIDoge1xuXHRcdFx0Zm9yY2VFbmFibGVEZXZlbG9wZXJLZXliaW5kaW5nczogZmFsc2UsXG5cdFx0XHRkaXNhbGxvd1JlbG9hZEtleWJpbmRpbmc6IGZhbHNlLFxuXHRcdFx0cmVtb3ZlRGV2ZWxvcGVyS2V5YmluZGluZ3NBZnRlckxvYWQ6IGZhbHNlLFxuXHRcdFx0Zm9yY2VEaXNhYmxlU2hvd0RldnRvb2xzT25FcnJvcjogZmFsc2Vcblx0XHR9O1xuXG5cdFx0Y29uc3QgaXNEZXYgPSAhIXNhZmVQcm9jZXNzLmVudlsnVlNDT0RFX0RFViddO1xuXHRcdGNvbnN0IGVuYWJsZURldmVsb3BlcktleWJpbmRpbmdzID0gQm9vbGVhbihpc0RldiB8fCBmb3JjZUVuYWJsZURldmVsb3BlcktleWJpbmRpbmdzKTtcblx0XHRsZXQgZGV2ZWxvcGVyRGV2ZWxvcGVyS2V5YmluZGluZ3NEaXNwb3NhYmxlOiBGdW5jdGlvbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRpZiAoZW5hYmxlRGV2ZWxvcGVyS2V5YmluZGluZ3MpIHtcblx0XHRcdGRldmVsb3BlckRldmVsb3BlcktleWJpbmRpbmdzRGlzcG9zYWJsZSA9IHJlZ2lzdGVyRGV2ZWxvcGVyS2V5YmluZGluZ3MoZGlzYWxsb3dSZWxvYWRLZXliaW5kaW5nKTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZW5hYmxlRGV2ZWxvcGVyS2V5YmluZGluZ3MsXG5cdFx0XHRyZW1vdmVEZXZlbG9wZXJLZXliaW5kaW5nc0FmdGVyTG9hZCxcblx0XHRcdGRldmVsb3BlckRldmVsb3BlcktleWJpbmRpbmdzRGlzcG9zYWJsZSxcblx0XHRcdGZvcmNlRGlzYWJsZVNob3dEZXZ0b29sc09uRXJyb3Jcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gcmVnaXN0ZXJEZXZlbG9wZXJLZXliaW5kaW5ncyhkaXNhbGxvd1JlbG9hZEtleWJpbmRpbmc6IGJvb2xlYW4gfCB1bmRlZmluZWQpOiBGdW5jdGlvbiB7XG5cdFx0Y29uc3QgaXBjUmVuZGVyZXIgPSBwcmVsb2FkR2xvYmFscy5pcGNSZW5kZXJlcjtcblxuXHRcdGNvbnN0IGV4dHJhY3RLZXkgPVxuXHRcdFx0ZnVuY3Rpb24gKGU6IEtleWJvYXJkRXZlbnQpIHtcblx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRlLmN0cmxLZXkgPyAnY3RybC0nIDogJycsXG5cdFx0XHRcdFx0ZS5tZXRhS2V5ID8gJ21ldGEtJyA6ICcnLFxuXHRcdFx0XHRcdGUuYWx0S2V5ID8gJ2FsdC0nIDogJycsXG5cdFx0XHRcdFx0ZS5zaGlmdEtleSA/ICdzaGlmdC0nIDogJycsXG5cdFx0XHRcdFx0ZS5rZXlDb2RlXG5cdFx0XHRcdF0uam9pbignJyk7XG5cdFx0XHR9O1xuXG5cdFx0Ly8gRGV2dG9vbHMgJiByZWxvYWQgc3VwcG9ydFxuXHRcdGNvbnN0IFRPR0dMRV9ERVZfVE9PTFNfS0IgPSAoc2FmZVByb2Nlc3MucGxhdGZvcm0gPT09ICdkYXJ3aW4nID8gJ21ldGEtYWx0LTczJyA6ICdjdHJsLXNoaWZ0LTczJyk7IC8vIG1hYzogQ21kLUFsdC1JLCByZXN0OiBDdHJsLVNoaWZ0LUlcblx0XHRjb25zdCBUT0dHTEVfREVWX1RPT0xTX0tCX0FMVCA9ICcxMjMnOyAvLyBGMTJcblx0XHRjb25zdCBSRUxPQURfS0IgPSAoc2FmZVByb2Nlc3MucGxhdGZvcm0gPT09ICdkYXJ3aW4nID8gJ21ldGEtODInIDogJ2N0cmwtODInKTsgLy8gbWFjOiBDbWQtUiwgcmVzdDogQ3RybC1SXG5cblx0XHRsZXQgbGlzdGVuZXI6ICgoZTogS2V5Ym9hcmRFdmVudCkgPT4gdm9pZCkgfCB1bmRlZmluZWQgPSBmdW5jdGlvbiAoZSkge1xuXHRcdFx0Y29uc3Qga2V5ID0gZXh0cmFjdEtleShlKTtcblx0XHRcdGlmIChrZXkgPT09IFRPR0dMRV9ERVZfVE9PTFNfS0IgfHwga2V5ID09PSBUT0dHTEVfREVWX1RPT0xTX0tCX0FMVCkge1xuXHRcdFx0XHRpcGNSZW5kZXJlci5zZW5kKCd2c2NvZGU6dG9nZ2xlRGV2VG9vbHMnKTtcblx0XHRcdH0gZWxzZSBpZiAoa2V5ID09PSBSRUxPQURfS0IgJiYgIWRpc2FsbG93UmVsb2FkS2V5YmluZGluZykge1xuXHRcdFx0XHRpcGNSZW5kZXJlci5zZW5kKCd2c2NvZGU6cmVsb2FkV2luZG93Jyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHdpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdrZXlkb3duJywgbGlzdGVuZXIpO1xuXG5cdFx0cmV0dXJuIGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmIChsaXN0ZW5lcikge1xuXHRcdFx0XHR3aW5kb3cucmVtb3ZlRXZlbnRMaXN0ZW5lcigna2V5ZG93bicsIGxpc3RlbmVyKTtcblx0XHRcdFx0bGlzdGVuZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNldHVwTkxTPFQgZXh0ZW5kcyBJU2FuZGJveENvbmZpZ3VyYXRpb24+KGNvbmZpZ3VyYXRpb246IFQpOiB2b2lkIHtcblx0XHRnbG9iYWxUaGlzLl9WU0NPREVfTkxTX01FU1NBR0VTID0gY29uZmlndXJhdGlvbi5ubHMubWVzc2FnZXM7XG5cdFx0Z2xvYmFsVGhpcy5fVlNDT0RFX05MU19MQU5HVUFHRSA9IGNvbmZpZ3VyYXRpb24ubmxzLmxhbmd1YWdlO1xuXG5cdFx0bGV0IGxhbmd1YWdlID0gY29uZmlndXJhdGlvbi5ubHMubGFuZ3VhZ2UgfHwgJ2VuJztcblx0XHRpZiAobGFuZ3VhZ2UgPT09ICd6aC10dycpIHtcblx0XHRcdGxhbmd1YWdlID0gJ3poLUhhbnQnO1xuXHRcdH0gZWxzZSBpZiAobGFuZ3VhZ2UgPT09ICd6aC1jbicpIHtcblx0XHRcdGxhbmd1YWdlID0gJ3poLUhhbnMnO1xuXHRcdH1cblxuXHRcdHdpbmRvdy5kb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc2V0QXR0cmlidXRlKCdsYW5nJywgbGFuZ3VhZ2UpO1xuXHR9XG5cblx0ZnVuY3Rpb24gb25VbmV4cGVjdGVkRXJyb3IoZXJyb3I6IHN0cmluZyB8IEVycm9yLCBzaG93RGV2dG9vbHNPbkVycm9yOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHNob3dEZXZ0b29sc09uRXJyb3IpIHtcblx0XHRcdGNvbnN0IGlwY1JlbmRlcmVyID0gcHJlbG9hZEdsb2JhbHMuaXBjUmVuZGVyZXI7XG5cdFx0XHRpcGNSZW5kZXJlci5zZW5kKCd2c2NvZGU6b3BlbkRldlRvb2xzJyk7XG5cdFx0fVxuXG5cdFx0Y29uc29sZS5lcnJvcihgW3VuY2F1Z2h0IGV4Y2VwdGlvbl06ICR7ZXJyb3J9YCk7XG5cblx0XHRpZiAoZXJyb3IgJiYgdHlwZW9mIGVycm9yICE9PSAnc3RyaW5nJyAmJiBlcnJvci5zdGFjaykge1xuXHRcdFx0Y29uc29sZS5lcnJvcihlcnJvci5zdGFjayk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gZmlsZVVyaUZyb21QYXRoKHBhdGg6IHN0cmluZywgY29uZmlnOiB7IGlzV2luZG93cz86IGJvb2xlYW47IHNjaGVtZT86IHN0cmluZzsgZmFsbGJhY2tBdXRob3JpdHk/OiBzdHJpbmcgfSk6IHN0cmluZyB7XG5cblx0XHQvLyBTaW5jZSB3ZSBhcmUgYnVpbGRpbmcgYSBVUkksIHdlIG5vcm1hbGl6ZSBhbnkgYmFja3NsYXNoXG5cdFx0Ly8gdG8gc2xhc2hlcyBhbmQgd2UgZW5zdXJlIHRoYXQgdGhlIHBhdGggYmVnaW5zIHdpdGggYSAnLycuXG5cdFx0bGV0IHBhdGhOYW1lID0gcGF0aC5yZXBsYWNlKC9cXFxcL2csICcvJyk7XG5cdFx0aWYgKHBhdGhOYW1lLmxlbmd0aCA+IDAgJiYgcGF0aE5hbWUuY2hhckF0KDApICE9PSAnLycpIHtcblx0XHRcdHBhdGhOYW1lID0gYC8ke3BhdGhOYW1lfWA7XG5cdFx0fVxuXG5cdFx0bGV0IHVyaTogc3RyaW5nO1xuXG5cdFx0Ly8gV2luZG93czogaW4gb3JkZXIgdG8gc3VwcG9ydCBVTkMgcGF0aHMgKHdoaWNoIHN0YXJ0IHdpdGggJy8vJylcblx0XHQvLyB0aGF0IGhhdmUgdGhlaXIgb3duIGF1dGhvcml0eSwgd2UgZG8gbm90IHVzZSB0aGUgcHJvdmlkZWQgYXV0aG9yaXR5XG5cdFx0Ly8gYnV0IHJhdGhlciBwcmVzZXJ2ZSBpdC5cblx0XHRpZiAoY29uZmlnLmlzV2luZG93cyAmJiBwYXRoTmFtZS5zdGFydHNXaXRoKCcvLycpKSB7XG5cdFx0XHR1cmkgPSBlbmNvZGVVUkkoYCR7Y29uZmlnLnNjaGVtZSB8fCAnZmlsZSd9OiR7cGF0aE5hbWV9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIHdlIG9wdGlvbmFsbHkgYWRkIHRoZSBwcm92aWRlZCBhdXRob3JpdHkgaWYgc3BlY2lmaWVkXG5cdFx0ZWxzZSB7XG5cdFx0XHR1cmkgPSBlbmNvZGVVUkkoYCR7Y29uZmlnLnNjaGVtZSB8fCAnZmlsZSd9Oi8vJHtjb25maWcuZmFsbGJhY2tBdXRob3JpdHkgfHwgJyd9JHtwYXRoTmFtZX1gKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdXJpLnJlcGxhY2UoLyMvZywgJyUyMycpO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dXBDU1NJbXBvcnRNYXBzPFQgZXh0ZW5kcyBJU2FuZGJveENvbmZpZ3VyYXRpb24+KGNvbmZpZ3VyYXRpb246IFQsIGJhc2VVcmw6IFVSTCkge1xuXG5cdFx0Ly8gREVWIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHRcdC8vIERFVjogVGhpcyBpcyBmb3IgZGV2ZWxvcG1lbnQgYW5kIGVuYWJsZXMgbG9hZGluZyBDU1MgdmlhIGltcG9ydC1zdGF0ZW1lbnRzIHZpYSBpbXBvcnQtbWFwcy5cblx0XHQvLyBERVY6IEZvciBlYWNoIENTUyBtb2R1bGVzIHRoYXQgd2UgaGF2ZSB3ZSBkZWZpbmVkIGFuIGVudHJ5IGluIHRoZSBpbXBvcnQgbWFwIHRoYXQgbWFwcyB0b1xuXHRcdC8vIERFVjogYSBibG9iIFVSTCB0aGF0IGxvYWRzIHRoZSBDU1MgdmlhIGEgZHluYW1pYyBAaW1wb3J0LXJ1bGUuXG5cdFx0Ly8gREVWIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdFx0aWYgKGdsb2JhbFRoaXMuX1ZTQ09ERV9ESVNBQkxFX0NTU19JTVBPUlRfTUFQKSB7XG5cdFx0XHRyZXR1cm47IC8vIGRpc2FibGVkIGluIGNlcnRhaW4gZGV2ZWxvcG1lbnQgc2V0dXBzXG5cdFx0fVxuXG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoY29uZmlndXJhdGlvbi5jc3NNb2R1bGVzKSAmJiBjb25maWd1cmF0aW9uLmNzc01vZHVsZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0cGVyZm9ybWFuY2UubWFyaygnY29kZS93aWxsQWRkQ3NzTG9hZGVyJyk7XG5cblx0XHRcdGdsb2JhbFRoaXMuX1ZTQ09ERV9DU1NfTE9BRCA9IGZ1bmN0aW9uICh1cmwpIHtcblx0XHRcdFx0Y29uc3QgbGluayA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2xpbmsnKTtcblx0XHRcdFx0bGluay5zZXRBdHRyaWJ1dGUoJ3JlbCcsICdzdHlsZXNoZWV0Jyk7XG5cdFx0XHRcdGxpbmsuc2V0QXR0cmlidXRlKCd0eXBlJywgJ3RleHQvY3NzJyk7XG5cdFx0XHRcdGxpbmsuc2V0QXR0cmlidXRlKCdocmVmJywgdXJsKTtcblxuXHRcdFx0XHR3aW5kb3cuZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChsaW5rKTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGltcG9ydE1hcDogeyBpbXBvcnRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+IH0gPSB7IGltcG9ydHM6IHt9IH07XG5cdFx0XHRmb3IgKGNvbnN0IGNzc01vZHVsZSBvZiBjb25maWd1cmF0aW9uLmNzc01vZHVsZXMpIHtcblx0XHRcdFx0Y29uc3QgY3NzVXJsID0gbmV3IFVSTChjc3NNb2R1bGUsIGJhc2VVcmwpLmhyZWY7XG5cdFx0XHRcdGNvbnN0IGpzU3JjID0gYGdsb2JhbFRoaXMuX1ZTQ09ERV9DU1NfTE9BRCgnJHtjc3NVcmx9Jyk7XFxuYDtcblx0XHRcdFx0Y29uc3QgYmxvYiA9IG5ldyBCbG9iKFtqc1NyY10sIHsgdHlwZTogJ2FwcGxpY2F0aW9uL2phdmFzY3JpcHQnIH0pO1xuXHRcdFx0XHRpbXBvcnRNYXAuaW1wb3J0c1tjc3NVcmxdID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdHRwID0gd2luZG93LnRydXN0ZWRUeXBlcz8uY3JlYXRlUG9saWN5KCd2c2NvZGUtYm9vdHN0cmFwSW1wb3J0TWFwJywgeyBjcmVhdGVTY3JpcHQodmFsdWUpIHsgcmV0dXJuIHZhbHVlOyB9LCB9KTtcblx0XHRcdGNvbnN0IGltcG9ydE1hcFNyYyA9IEpTT04uc3RyaW5naWZ5KGltcG9ydE1hcCwgdW5kZWZpbmVkLCAyKTtcblx0XHRcdGNvbnN0IGltcG9ydE1hcFNjcmlwdCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NjcmlwdCcpO1xuXHRcdFx0aW1wb3J0TWFwU2NyaXB0LnR5cGUgPSAnaW1wb3J0bWFwJztcblx0XHRcdGltcG9ydE1hcFNjcmlwdC5zZXRBdHRyaWJ1dGUoJ25vbmNlJywgJzBjNmE4MjhmMTI5NycpO1xuXHRcdFx0Ly8gQHRzLWV4cGVjdC1lcnJvclxuXHRcdFx0aW1wb3J0TWFwU2NyaXB0LnRleHRDb250ZW50ID0gdHRwPy5jcmVhdGVTY3JpcHQoaW1wb3J0TWFwU3JjKSA/PyBpbXBvcnRNYXBTcmM7XG5cdFx0XHR3aW5kb3cuZG9jdW1lbnQuaGVhZC5hcHBlbmRDaGlsZChpbXBvcnRNYXBTY3JpcHQpO1xuXG5cdFx0XHRwZXJmb3JtYW5jZS5tYXJrKCdjb2RlL2RpZEFkZENzc0xvYWRlcicpO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdGNvbnN0IHsgcmVzdWx0LCBjb25maWd1cmF0aW9uIH0gPSBhd2FpdCBsb2FkPElEZXNrdG9wTWFpbiwgSU5hdGl2ZVdpbmRvd0NvbmZpZ3VyYXRpb24+KFxuXHRcdHtcblx0XHRcdGNvbmZpZ3VyZURldmVsb3BlclNldHRpbmdzOiBmdW5jdGlvbiAod2luZG93Q29uZmlnKSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0Ly8gZGlzYWJsZSBhdXRvbWF0ZWQgZGV2dG9vbHMgb3BlbmluZyBvbiBlcnJvciB3aGVuIHJ1bm5pbmcgZXh0ZW5zaW9uIHRlc3RzXG5cdFx0XHRcdFx0Ly8gYXMgdGhpcyBjYW4gbGVhZCB0byBub25kZXRlcm1pbmlzdGljIHRlc3QgZXhlY3V0aW9uIChkZXZ0b29scyBzdGVhbHMgZm9jdXMpXG5cdFx0XHRcdFx0Zm9yY2VEaXNhYmxlU2hvd0RldnRvb2xzT25FcnJvcjogdHlwZW9mIHdpbmRvd0NvbmZpZy5leHRlbnNpb25UZXN0c1BhdGggPT09ICdzdHJpbmcnIHx8IHdpbmRvd0NvbmZpZ1snZW5hYmxlLXNtb2tlLXRlc3QtZHJpdmVyJ10gPT09IHRydWUsXG5cdFx0XHRcdFx0Ly8gZW5hYmxlIGRldnRvb2xzIGtleWJpbmRpbmdzIGluIGV4dGVuc2lvbiBkZXZlbG9wbWVudCB3aW5kb3dcblx0XHRcdFx0XHRmb3JjZUVuYWJsZURldmVsb3BlcktleWJpbmRpbmdzOiBBcnJheS5pc0FycmF5KHdpbmRvd0NvbmZpZy5leHRlbnNpb25EZXZlbG9wbWVudFBhdGgpICYmIHdpbmRvd0NvbmZpZy5leHRlbnNpb25EZXZlbG9wbWVudFBhdGgubGVuZ3RoID4gMCxcblx0XHRcdFx0XHRyZW1vdmVEZXZlbG9wZXJLZXliaW5kaW5nc0FmdGVyTG9hZDogdHJ1ZVxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHRcdGJlZm9yZUltcG9ydDogZnVuY3Rpb24gKHdpbmRvd0NvbmZpZykge1xuXG5cdFx0XHRcdC8vIFNob3cgb3VyIHNwbGFzaCBhcyBlYXJseSBhcyBwb3NzaWJsZVxuXHRcdFx0XHRzaG93U3BsYXNoKHdpbmRvd0NvbmZpZyk7XG5cblx0XHRcdFx0Ly8gQ29kZSB3aW5kb3dzIGhhdmUgYSBgdnNjb2RlV2luZG93SWRgIHByb3BlcnR5IHRvIGlkZW50aWZ5IHRoZW1cblx0XHRcdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KHdpbmRvdywgJ3ZzY29kZVdpbmRvd0lkJywge1xuXHRcdFx0XHRcdGdldDogKCkgPT4gd2luZG93Q29uZmlnLndpbmRvd0lkXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIEl0IGxvb2tzIGxpa2UgYnJvd3NlcnMgb25seSBsYXppbHkgZW5hYmxlXG5cdFx0XHRcdC8vIHRoZSA8Y2FudmFzPiBlbGVtZW50IHdoZW4gbmVlZGVkLiBTaW5jZSB3ZVxuXHRcdFx0XHQvLyBsZXZlcmFnZSBjYW52YXMgZWxlbWVudHMgaW4gb3VyIGNvZGUgaW4gbWFueVxuXHRcdFx0XHQvLyBsb2NhdGlvbnMsIHdlIHRyeSB0byBoZWxwIHRoZSBicm93c2VyIHRvXG5cdFx0XHRcdC8vIGluaXRpYWxpemUgY2FudmFzIHdoZW4gaXQgaXMgaWRsZSwgcmlnaHRcblx0XHRcdFx0Ly8gYmVmb3JlIHdlIHdhaXQgZm9yIHRoZSBzY3JpcHRzIHRvIGJlIGxvYWRlZC5cblx0XHRcdFx0d2luZG93LnJlcXVlc3RJZGxlQ2FsbGJhY2soKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNhbnZhcyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2NhbnZhcycpO1xuXHRcdFx0XHRcdGNvbnN0IGNvbnRleHQgPSBjYW52YXMuZ2V0Q29udGV4dCgnMmQnKTtcblx0XHRcdFx0XHRjb250ZXh0Py5jbGVhclJlY3QoMCwgMCwgY2FudmFzLndpZHRoLCBjYW52YXMuaGVpZ2h0KTtcblx0XHRcdFx0XHRjYW52YXMucmVtb3ZlKCk7XG5cdFx0XHRcdH0sIHsgdGltZW91dDogNTAgfSk7XG5cblx0XHRcdFx0Ly8gVHJhY2sgaW1wb3J0KCkgcGVyZlxuXHRcdFx0XHRwZXJmb3JtYW5jZS5tYXJrKCdjb2RlL3dpbGxMb2FkV29ya2JlbmNoTWFpbicpO1xuXHRcdFx0fVxuXHRcdH1cblx0KTtcblxuXHQvLyBNYXJrIHN0YXJ0IG9mIHdvcmtiZW5jaFxuXHRwZXJmb3JtYW5jZS5tYXJrKCdjb2RlL2RpZExvYWRXb3JrYmVuY2hNYWluJyk7XG5cblx0Ly8gTG9hZCB3b3JrYmVuY2hcblx0cmVzdWx0Lm1haW4oY29uZmlndXJhdGlvbik7XG59KCkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIkNBT0MsaUJBQWtCO0FBR2xCLGNBQVksS0FBSyx1QkFBdUI7QUFTeEMsUUFBTSxpQkFBa0IsT0FBNEQ7QUFDcEYsUUFBTSxjQUFjLGVBQWU7QUFJbkMsV0FBUyxXQUFXQSxnQkFBMkM7QUFDOUQsZ0JBQVksS0FBSywwQkFBMEI7QUFDM0Msc0JBQWtCQSxjQUFhO0FBQy9CLGdCQUFZLEtBQUsseUJBQXlCO0FBQUEsRUFDM0M7QUFFQSxXQUFTLGtCQUFrQkEsZ0JBQTJDO0FBQ3JFLFFBQUksT0FBT0EsZUFBYztBQUN6QixRQUFJLE1BQU07QUFDVCxVQUFJQSxlQUFjLDBCQUEwQkEsZUFBYyxZQUFZLGNBQWM7QUFDbkYsWUFBS0EsZUFBYyxZQUFZLFFBQVEsS0FBSyxjQUFjLGNBQWdCLENBQUNBLGVBQWMsWUFBWSxRQUFRLEtBQUssY0FBYyxZQUFhO0FBQzVJLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0QsV0FBV0EsZUFBYyx1QkFBdUI7QUFDL0MsWUFBS0EsZUFBYyxZQUFZLFFBQVEsS0FBSyxjQUFjLGFBQWUsQ0FBQ0EsZUFBYyxZQUFZLFFBQVEsS0FBSyxjQUFjLE1BQU87QUFDckksaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFHQSxRQUFJLFFBQVFBLGVBQWMsMEJBQTBCO0FBQ25ELFdBQUssYUFBYTtBQUFBLElBQ25CO0FBR0EsUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJO0FBQ0osUUFBSSxNQUFNO0FBQ1Qsa0JBQVksS0FBSztBQUNqQix3QkFBa0IsS0FBSyxVQUFVO0FBQ2pDLHdCQUFrQixLQUFLLFVBQVU7QUFBQSxJQUNsQyxXQUFXQSxlQUFjLDBCQUEwQkEsZUFBYyxZQUFZLGNBQWM7QUFDMUYsVUFBSUEsZUFBYyxZQUFZLE1BQU07QUFDbkMsb0JBQVk7QUFDWiwwQkFBa0I7QUFDbEIsMEJBQWtCO0FBQUEsTUFDbkIsT0FBTztBQUNOLG9CQUFZO0FBQ1osMEJBQWtCO0FBQ2xCLDBCQUFrQjtBQUFBLE1BQ25CO0FBQUEsSUFDRCxXQUFXQSxlQUFjLHVCQUF1QjtBQUMvQyxVQUFJQSxlQUFjLFlBQVksTUFBTTtBQUNuQyxvQkFBWTtBQUNaLDBCQUFrQjtBQUNsQiwwQkFBa0I7QUFBQSxNQUNuQixPQUFPO0FBQ04sb0JBQVk7QUFDWiwwQkFBa0I7QUFDbEIsMEJBQWtCO0FBQUEsTUFDbkI7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUFRLFNBQVMsY0FBYyxPQUFPO0FBQzVDLFVBQU0sWUFBWTtBQUNsQixXQUFPLFNBQVMsS0FBSyxZQUFZLEtBQUs7QUFDdEMsVUFBTSxjQUFjLDRCQUE0QixlQUFlLFlBQVksZUFBZTtBQUcxRixRQUFJLE9BQU8sTUFBTSxjQUFjLFlBQVksT0FBTyxnQkFBZ0IsVUFBVSxpQkFBaUIsWUFBWTtBQUN4RyxxQkFBZSxTQUFTLGFBQWEsS0FBSyxTQUFTO0FBQUEsSUFDcEQ7QUFHQSxRQUFJLE1BQU0sWUFBWTtBQUNyQixZQUFNLEVBQUUsWUFBWSxVQUFVLElBQUk7QUFDbEMsWUFBTSxXQUFXLFdBQVcsYUFBYTtBQUN6QyxZQUFNLGlCQUFpQjtBQUN2QixZQUFNLHNCQUFzQixpQkFBaUI7QUFDN0MsWUFBTSxzQkFBc0I7QUFFNUIsWUFBTSxTQUFTLFNBQVMsY0FBYyxLQUFLO0FBQzNDLGFBQU8sS0FBSztBQUNaLGFBQU8sWUFBWSxhQUFhO0FBRWhDLFVBQUksV0FBVyxnQkFBZ0IsVUFBVSxjQUFjO0FBQ3RELGNBQU0sZ0JBQWdCLFNBQVMsY0FBYyxLQUFLO0FBQ2xELHNCQUFjLE1BQU0sV0FBVztBQUMvQixzQkFBYyxNQUFNLFFBQVE7QUFDNUIsc0JBQWMsTUFBTSxTQUFTO0FBQzdCLHNCQUFjLE1BQU0sU0FBUztBQUM3QixzQkFBYyxNQUFNLFNBQVM7QUFDN0Isc0JBQWMsTUFBTSxZQUFZLHlCQUF5QixVQUFVLFlBQVk7QUFFL0UsWUFBSSxXQUFXLG9CQUFvQjtBQUNsQyx3QkFBYyxNQUFNLGVBQWUsV0FBVztBQUFBLFFBQy9DO0FBRUEsZUFBTyxZQUFZLGFBQWE7QUFBQSxNQUNqQztBQUVBLFlBQU0sWUFBWSxDQUFDLFNBQXNCLFdBQTZHO0FBQ3JKLGdCQUFRLE1BQU0sV0FBVztBQUN6QixnQkFBUSxNQUFNLE1BQU0sR0FBRyxPQUFPLEdBQUc7QUFDakMsWUFBSSxPQUFPLE9BQU8sV0FBVyxVQUFVO0FBQ3RDLGtCQUFRLE1BQU0sU0FBUyxHQUFHLE9BQU8sTUFBTTtBQUFBLFFBQ3hDO0FBQ0EsWUFBSSxPQUFPLE9BQU8sU0FBUyxVQUFVO0FBQ3BDLGtCQUFRLE1BQU0sT0FBTyxHQUFHLE9BQU8sSUFBSTtBQUFBLFFBQ3BDO0FBQ0EsWUFBSSxPQUFPLE9BQU8sVUFBVSxVQUFVO0FBQ3JDLGtCQUFRLE1BQU0sUUFBUSxHQUFHLE9BQU8sS0FBSztBQUFBLFFBQ3RDO0FBQ0EsWUFBSSxPQUFPLE9BQU8sVUFBVSxVQUFVO0FBQ3JDLGtCQUFRLE1BQU0sUUFBUSxHQUFHLE9BQU8sS0FBSztBQUFBLFFBQ3RDO0FBQ0EsWUFBSSxPQUFPLE9BQU8sV0FBVyxVQUFVO0FBQ3RDLGtCQUFRLE1BQU0sU0FBUyxHQUFHLE9BQU8sTUFBTTtBQUFBLFFBQ3hDO0FBQUEsTUFDRDtBQUVBLFlBQU0sZ0JBQWdCLENBQUMsU0FBc0IsV0FBeUU7QUFDckgsZ0JBQVEsTUFBTSxXQUFXO0FBQ3pCLGdCQUFRLE1BQU0sTUFBTSxHQUFHLE9BQU8sR0FBRztBQUNqQyxnQkFBUSxNQUFNLE9BQU8sR0FBRyxPQUFPLElBQUk7QUFDbkMsZ0JBQVEsTUFBTSxRQUFRLEdBQUcsT0FBTyxLQUFLO0FBQ3JDLGdCQUFRLE1BQU0sU0FBUyxHQUFHLE9BQU8sTUFBTTtBQUFBLE1BQ3hDO0FBRUEsWUFBTSwwQkFBMEIsQ0FBQyxTQUFzQixvQkFBd0M7QUFDOUYsZ0JBQVEsTUFBTSxZQUFZO0FBQzFCLGdCQUFRLE1BQU0sU0FBUyxHQUFHLG1CQUFtQixZQUFZLFVBQVUscUJBQXFCLFVBQVUscUJBQXFCLGFBQWE7QUFDcEksZ0JBQVEsTUFBTSxlQUFlO0FBQzdCLGdCQUFRLE1BQU0sa0JBQWtCLG1CQUFtQixVQUFVLG9CQUFvQixVQUFVO0FBQzNGLGdCQUFRLE1BQU0sV0FBVztBQUFBLE1BQzFCO0FBRUEsWUFBTSxhQUFhLFdBQVc7QUFDOUIsWUFBTSxnQkFBZ0IsV0FBVztBQUNqQyxZQUFNLGdCQUFnQixlQUFlLGFBQWEsYUFBYTtBQUMvRCxZQUFNLGlCQUFpQixXQUFXLGVBQWUsYUFBYSxnQkFBZ0IsY0FBYyxRQUFRO0FBRXBHLFVBQUksV0FBVyxzQkFBc0IsT0FBTyxrQkFBa0I7QUFHN0QsbUJBQVcsb0JBQW9CLE9BQU8sYUFBYSxXQUFXO0FBQUEsTUFDL0QsT0FBTztBQUVOLG1CQUFXLG9CQUFvQixLQUFLLElBQUksV0FBVyxtQkFBbUIsT0FBTyxjQUFjLFdBQVcsbUJBQW1CLFdBQVcscUJBQXFCLFdBQVcsYUFBYTtBQUFBLE1BQ2xMO0FBQ0EsaUJBQVcsZUFBZSxLQUFLLElBQUksV0FBVyxjQUFjLE9BQU8sY0FBYyxXQUFXLG1CQUFtQixXQUFXLHFCQUFxQixXQUFXLGtCQUFrQjtBQUc1SyxVQUFJLFdBQVcsaUJBQWlCLEdBQUc7QUFDbEMsY0FBTSxXQUFXLFNBQVMsY0FBYyxLQUFLO0FBQzdDLGlCQUFTLE1BQU0sV0FBVztBQUMxQixpQkFBUyxNQUFNLFFBQVE7QUFDdkIsaUJBQVMsTUFBTSxTQUFTLEdBQUcsV0FBVyxjQUFjO0FBQ3BELGlCQUFTLE1BQU0sT0FBTztBQUN0QixpQkFBUyxNQUFNLE1BQU07QUFDckIsaUJBQVMsTUFBTSxrQkFBa0IsV0FBVyxnQkFBZ0IsR0FBRyxVQUFVLGtCQUFrQjtBQUMzRixRQUFDLFNBQVMsTUFBaUUsb0JBQW9CLElBQUk7QUFDbkcsZUFBTyxZQUFZLFFBQVE7QUFFM0IsWUFBSSxDQUFDLFlBQVksVUFBVSxnQkFBZ0I7QUFDMUMsZ0JBQU0sY0FBYyxTQUFTLGNBQWMsS0FBSztBQUNoRCxzQkFBWSxNQUFNLFdBQVc7QUFDN0Isc0JBQVksTUFBTSxRQUFRO0FBQzFCLHNCQUFZLE1BQU0sU0FBUztBQUMzQixzQkFBWSxNQUFNLE9BQU87QUFDekIsc0JBQVksTUFBTSxTQUFTO0FBQzNCLHNCQUFZLE1BQU0sZUFBZSxhQUFhLFVBQVUsY0FBYztBQUN0RSxtQkFBUyxZQUFZLFdBQVc7QUFBQSxRQUNqQztBQUFBLE1BQ0Q7QUFHQSxVQUFJLFdBQVcsbUJBQW1CLEdBQUc7QUFDcEMsY0FBTSxjQUFjLFNBQVMsY0FBYyxLQUFLO0FBQ2hELG9CQUFZLE1BQU0sV0FBVztBQUM3QixvQkFBWSxNQUFNLFFBQVEsR0FBRyxXQUFXLGdCQUFnQjtBQUN4RCxvQkFBWSxNQUFNLFNBQVM7QUFDM0Isb0JBQVksTUFBTSxNQUFNLEdBQUcsVUFBVTtBQUNyQyxZQUFJLFdBQVcsZ0JBQWdCLFFBQVE7QUFDdEMsc0JBQVksTUFBTSxPQUFPO0FBQUEsUUFDMUIsT0FBTztBQUNOLHNCQUFZLE1BQU0sUUFBUTtBQUFBLFFBQzNCO0FBQ0Esb0JBQVksTUFBTSxrQkFBa0IsV0FBVyxnQkFBZ0IsR0FBRyxVQUFVLHFCQUFxQjtBQUNqRyxlQUFPLFlBQVksV0FBVztBQUU5QixZQUFJLENBQUMsWUFBWSxVQUFVLG1CQUFtQjtBQUM3QyxnQkFBTSxvQkFBb0IsU0FBUyxjQUFjLEtBQUs7QUFDdEQsNEJBQWtCLE1BQU0sV0FBVztBQUNuQyw0QkFBa0IsTUFBTSxRQUFRO0FBQ2hDLDRCQUFrQixNQUFNLFNBQVM7QUFDakMsNEJBQWtCLE1BQU0sTUFBTTtBQUM5QixjQUFJLFdBQVcsZ0JBQWdCLFFBQVE7QUFDdEMsOEJBQWtCLE1BQU0sUUFBUTtBQUNoQyw4QkFBa0IsTUFBTSxjQUFjLGFBQWEsVUFBVSxpQkFBaUI7QUFBQSxVQUMvRSxPQUFPO0FBQ04sOEJBQWtCLE1BQU0sT0FBTztBQUMvQiw4QkFBa0IsTUFBTSxhQUFhLGFBQWEsVUFBVSxpQkFBaUI7QUFBQSxVQUM5RTtBQUNBLHNCQUFZLFlBQVksaUJBQWlCO0FBQUEsUUFDMUM7QUFBQSxNQUNEO0FBR0EsVUFBSSxXQUFXLGVBQWUsR0FBRztBQUNoQyxjQUFNLFVBQVUsU0FBUyxjQUFjLEtBQUs7QUFDNUMsWUFBSSxZQUFZLFdBQVcsWUFBWSxTQUFTO0FBQy9DLHdCQUFjLFNBQVMsV0FBVyxXQUFXLE9BQU87QUFBQSxRQUNyRCxXQUFXLFdBQVcsZ0JBQWdCLFFBQVE7QUFDN0Msb0JBQVUsU0FBUztBQUFBLFlBQ2xCLEtBQUs7QUFBQSxZQUNMLFFBQVEsV0FBVyxnQkFBZ0IsaUJBQWlCO0FBQUEsWUFDcEQsTUFBTSxXQUFXLG9CQUFvQixXQUFXLGlCQUFpQjtBQUFBLFlBQ2pFLE9BQU8sV0FBVyxLQUFLLElBQUksR0FBRyxXQUFXLGVBQWUsc0JBQXNCLHNCQUFzQixDQUFDLElBQUksV0FBVztBQUFBLFVBQ3JILENBQUM7QUFBQSxRQUNGLE9BQU87QUFDTixvQkFBVSxTQUFTO0FBQUEsWUFDbEIsS0FBSztBQUFBLFlBQ0wsUUFBUSxXQUFXLGdCQUFnQixpQkFBaUI7QUFBQSxZQUNwRCxPQUFPLFdBQVcsb0JBQW9CLFdBQVcsaUJBQWlCO0FBQUEsWUFDbEUsT0FBTyxXQUFXLEtBQUssSUFBSSxHQUFHLFdBQVcsZUFBZSxzQkFBc0Isc0JBQXNCLENBQUMsSUFBSSxXQUFXO0FBQUEsVUFDckgsQ0FBQztBQUFBLFFBQ0Y7QUFDQSxZQUFJLFVBQVU7QUFDYixrQ0FBd0IsU0FBUyxVQUFVLHlCQUF5QixVQUFVLGlCQUFpQjtBQUFBLFFBQ2hHLE9BQU87QUFDTixrQkFBUSxNQUFNLGtCQUFrQixHQUFHLFVBQVUsaUJBQWlCO0FBQUEsUUFDL0Q7QUFDQSxlQUFPLFlBQVksT0FBTztBQUUxQixZQUFJLENBQUMsWUFBWSxVQUFVLGVBQWU7QUFDekMsZ0JBQU0sZ0JBQWdCLFNBQVMsY0FBYyxLQUFLO0FBQ2xELHdCQUFjLE1BQU0sV0FBVztBQUMvQix3QkFBYyxNQUFNLFFBQVE7QUFDNUIsd0JBQWMsTUFBTSxTQUFTO0FBQzdCLHdCQUFjLE1BQU0sTUFBTTtBQUMxQix3QkFBYyxNQUFNLFFBQVE7QUFDNUIsY0FBSSxXQUFXLGdCQUFnQixRQUFRO0FBQ3RDLDBCQUFjLE1BQU0sY0FBYyxhQUFhLFVBQVUsYUFBYTtBQUFBLFVBQ3ZFLE9BQU87QUFDTiwwQkFBYyxNQUFNLE9BQU87QUFDM0IsMEJBQWMsTUFBTSxhQUFhLGFBQWEsVUFBVSxhQUFhO0FBQUEsVUFDdEU7QUFDQSxrQkFBUSxZQUFZLGFBQWE7QUFBQSxRQUNsQztBQUFBLE1BQ0Q7QUFHQSxVQUFJLFdBQVcsb0JBQW9CLEdBQUc7QUFDckMsY0FBTSxhQUFhLFNBQVMsY0FBYyxLQUFLO0FBQy9DLFlBQUksWUFBWSxXQUFXLFlBQVksY0FBYztBQUNwRCx3QkFBYyxZQUFZLFdBQVcsV0FBVyxZQUFZO0FBQUEsUUFDN0QsV0FBVyxXQUFXLGdCQUFnQixRQUFRO0FBQzdDLG9CQUFVLFlBQVk7QUFBQSxZQUNyQixLQUFLO0FBQUEsWUFDTCxRQUFRLFdBQVcsZ0JBQWdCLGlCQUFpQjtBQUFBLFlBQ3BELE9BQU8sV0FBVyxzQkFBc0I7QUFBQSxZQUN4QyxPQUFPLFdBQVcsS0FBSyxJQUFJLEdBQUcsV0FBVyxvQkFBb0Isc0JBQXNCLGlCQUFpQixzQkFBc0IsQ0FBQyxJQUFJLFdBQVc7QUFBQSxVQUMzSSxDQUFDO0FBQUEsUUFDRixPQUFPO0FBQ04sb0JBQVUsWUFBWTtBQUFBLFlBQ3JCLEtBQUs7QUFBQSxZQUNMLFFBQVEsV0FBVyxnQkFBZ0IsaUJBQWlCO0FBQUEsWUFDcEQsTUFBTSxXQUFXLHNCQUFzQjtBQUFBLFlBQ3ZDLE9BQU8sV0FBVyxLQUFLLElBQUksR0FBRyxXQUFXLG9CQUFvQixzQkFBc0IsaUJBQWlCLHNCQUFzQixDQUFDLElBQUksV0FBVztBQUFBLFVBQzNJLENBQUM7QUFBQSxRQUNGO0FBQ0EsWUFBSSxVQUFVO0FBQ2Isa0NBQXdCLFlBQVksVUFBVSxpQkFBaUI7QUFBQSxRQUNoRSxPQUFPO0FBQ04scUJBQVcsTUFBTSxrQkFBa0IsR0FBRyxVQUFVLGlCQUFpQjtBQUFBLFFBQ2xFO0FBQ0EsZUFBTyxZQUFZLFVBQVU7QUFFN0IsWUFBSSxDQUFDLFlBQVksVUFBVSxlQUFlO0FBQ3pDLGdCQUFNLG1CQUFtQixTQUFTLGNBQWMsS0FBSztBQUNyRCwyQkFBaUIsTUFBTSxXQUFXO0FBQ2xDLDJCQUFpQixNQUFNLFFBQVE7QUFDL0IsMkJBQWlCLE1BQU0sU0FBUztBQUNoQywyQkFBaUIsTUFBTSxNQUFNO0FBQzdCLGNBQUksV0FBVyxnQkFBZ0IsUUFBUTtBQUN0Qyw2QkFBaUIsTUFBTSxPQUFPO0FBQzlCLDZCQUFpQixNQUFNLGFBQWEsYUFBYSxVQUFVLGFBQWE7QUFBQSxVQUN6RSxPQUFPO0FBQ04sNkJBQWlCLE1BQU0sUUFBUTtBQUMvQiw2QkFBaUIsTUFBTSxjQUFjLGFBQWEsVUFBVSxhQUFhO0FBQUEsVUFDMUU7QUFDQSxxQkFBVyxZQUFZLGdCQUFnQjtBQUFBLFFBQ3hDO0FBQUEsTUFDRDtBQUVBLFVBQUksYUFBYSxXQUFXLFlBQVksVUFBVSxDQUFDLFdBQVcsYUFBYTtBQUMxRSxjQUFNLFlBQVksU0FBUyxjQUFjLEtBQUs7QUFDOUMsWUFBSSxXQUFXLFlBQVksUUFBUTtBQUNsQyx3QkFBYyxXQUFXLFdBQVcsV0FBVyxNQUFNO0FBQUEsUUFDdEQsT0FBTztBQUNOLGdCQUFNLGNBQWMsV0FBVyxnQkFBZ0IsU0FBUyxXQUFXLG1CQUFtQixXQUFXLGVBQWUsV0FBVyxxQkFBcUI7QUFDaEosZ0JBQU0sZUFBZSxXQUFXLGdCQUFnQixTQUFTLFdBQVcsb0JBQW9CLFdBQVcsbUJBQW1CLFdBQVcsZ0JBQWdCO0FBQ2pKLG9CQUFVLFdBQVc7QUFBQSxZQUNwQixLQUFLO0FBQUEsWUFDTCxRQUFRLGdCQUFnQjtBQUFBLFlBQ3hCLE1BQU07QUFBQSxZQUNOLE9BQU87QUFBQSxVQUNSLENBQUM7QUFBQSxRQUNGO0FBQ0EsZ0NBQXdCLFdBQVcsVUFBVSxnQkFBZ0I7QUFDN0QsZUFBTyxZQUFZLFNBQVM7QUFBQSxNQUM3QjtBQUVBLFVBQUksWUFBWSxXQUFXLFlBQVksT0FBTztBQUM3QyxjQUFNLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFDN0Msc0JBQWMsVUFBVSxXQUFXLFdBQVcsS0FBSztBQUNuRCxnQ0FBd0IsVUFBVSxVQUFVLG1CQUFtQixVQUFVLGdCQUFnQjtBQUN6RixlQUFPLFlBQVksUUFBUTtBQUFBLE1BQzVCO0FBR0EsVUFBSSxXQUFXLGtCQUFrQixHQUFHO0FBQ25DLGNBQU0sWUFBWSxTQUFTLGNBQWMsS0FBSztBQUM5QyxrQkFBVSxNQUFNLFdBQVc7QUFDM0Isa0JBQVUsTUFBTSxRQUFRO0FBQ3hCLGtCQUFVLE1BQU0sU0FBUyxHQUFHLFdBQVcsZUFBZTtBQUN0RCxrQkFBVSxNQUFNLFNBQVM7QUFDekIsa0JBQVUsTUFBTSxPQUFPO0FBQ3ZCLFlBQUksVUFBVTtBQUNiLG9CQUFVLE1BQU0sa0JBQWtCO0FBQUEsUUFDbkMsV0FBV0EsZUFBYyxhQUFhLFVBQVUscUJBQXFCO0FBQ3BFLG9CQUFVLE1BQU0sa0JBQWtCLFVBQVU7QUFBQSxRQUM3QyxXQUFXLENBQUNBLGVBQWMsYUFBYSxVQUFVLDZCQUE2QjtBQUM3RSxvQkFBVSxNQUFNLGtCQUFrQixVQUFVO0FBQUEsUUFDN0M7QUFDQSxlQUFPLFlBQVksU0FBUztBQUU1QixZQUFJLENBQUMsWUFBWSxVQUFVLGlCQUFpQjtBQUMzQyxnQkFBTSxrQkFBa0IsU0FBUyxjQUFjLEtBQUs7QUFDcEQsMEJBQWdCLE1BQU0sV0FBVztBQUNqQywwQkFBZ0IsTUFBTSxRQUFRO0FBQzlCLDBCQUFnQixNQUFNLFNBQVM7QUFDL0IsMEJBQWdCLE1BQU0sTUFBTTtBQUM1QiwwQkFBZ0IsTUFBTSxZQUFZLGFBQWEsVUFBVSxlQUFlO0FBQ3hFLG9CQUFVLFlBQVksZUFBZTtBQUFBLFFBQ3RDO0FBQUEsTUFDRDtBQUVBLGFBQU8sU0FBUyxLQUFLLFlBQVksTUFBTTtBQUFBLElBQ3hDO0FBQUEsRUFDRDtBQU1BLGlCQUFlLEtBQXlDLFNBQXNEO0FBRzdHLFVBQU1BLGlCQUFnQixNQUFNLDJCQUE4QjtBQUcxRCxhQUFTLGVBQWVBLGNBQWE7QUFHckMsVUFBTSxFQUFFLDRCQUE0QixxQ0FBcUMseUNBQXlDLGdDQUFnQyxJQUFJLDBCQUEwQkEsZ0JBQWUsT0FBTztBQUd0TSxhQUFZQSxjQUFhO0FBR3pCLFVBQU0sVUFBVSxJQUFJLElBQUksR0FBRyxnQkFBZ0JBLGVBQWMsU0FBUyxFQUFFLFdBQVcsWUFBWSxhQUFhLFNBQVMsUUFBUSxlQUFlLG1CQUFtQixhQUFhLENBQUMsQ0FBQyxPQUFPO0FBQ2pMLGVBQVcsb0JBQW9CLFFBQVEsU0FBUztBQUdoRCxlQUFXLHVCQUF1QixFQUFFLEdBQUdBLGVBQWMsUUFBUTtBQUc3RCx1QkFBc0JBLGdCQUFlLE9BQU87QUFHNUMsUUFBSTtBQUNILFVBQUk7QUFDSixVQUFJLENBQUMsQ0FBQyxZQUFZLElBQUksWUFBWSxLQUFLLFdBQVcsOEJBQThCO0FBQy9FLHVCQUFlO0FBQUEsTUFDaEIsT0FBTztBQUNOLHVCQUFlLElBQUksSUFBSSwwQ0FBMEMsT0FBTyxFQUFFO0FBQUEsTUFDM0U7QUFFQSxZQUFNQyxVQUFTLE1BQU0sT0FBTztBQUM1QixVQUFJLDJDQUEyQyxxQ0FBcUM7QUFDbkYsZ0RBQXdDO0FBQUEsTUFDekM7QUFFQSxhQUFPLEVBQUUsUUFBQUEsU0FBUSxlQUFBRCxlQUFjO0FBQUEsSUFDaEMsU0FBUyxPQUFPO0FBQ2Ysd0JBQWtCLE9BQU8sOEJBQThCLENBQUMsK0JBQStCO0FBRXZGLFlBQU07QUFBQSxJQUNQO0FBQUEsRUFDRDtBQUVBLGlCQUFlLDZCQUE4RDtBQUM1RSxVQUFNLFVBQVUsV0FBVyxNQUFNO0FBQUUsY0FBUSxNQUFNLGdIQUFnSDtBQUFBLElBQUcsR0FBRyxHQUFLO0FBQzVLLGdCQUFZLEtBQUssOEJBQThCO0FBRS9DLFVBQU1BLGlCQUFnQixNQUFNLGVBQWUsUUFBUSxxQkFBcUI7QUFDeEUsZ0JBQVksS0FBSyw2QkFBNkI7QUFFOUMsaUJBQWEsT0FBTztBQUVwQixXQUFPQTtBQUFBLEVBQ1I7QUFFQSxXQUFTLDBCQUEyREEsZ0JBQWtCLFNBQTBCO0FBQy9HLFVBQU07QUFBQSxNQUNMO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxJQUFJLE9BQU8sU0FBUywrQkFBK0IsYUFBYSxRQUFRLDJCQUEyQkEsY0FBYSxJQUFJO0FBQUEsTUFDbkgsaUNBQWlDO0FBQUEsTUFDakMsMEJBQTBCO0FBQUEsTUFDMUIscUNBQXFDO0FBQUEsTUFDckMsaUNBQWlDO0FBQUEsSUFDbEM7QUFFQSxVQUFNLFFBQVEsQ0FBQyxDQUFDLFlBQVksSUFBSSxZQUFZO0FBQzVDLFVBQU0sNkJBQTZCLFFBQVEsU0FBUywrQkFBK0I7QUFDbkYsUUFBSSwwQ0FBZ0U7QUFDcEUsUUFBSSw0QkFBNEI7QUFDL0IsZ0RBQTBDLDZCQUE2Qix3QkFBd0I7QUFBQSxJQUNoRztBQUVBLFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFFQSxXQUFTLDZCQUE2QiwwQkFBeUQ7QUFDOUYsVUFBTSxjQUFjLGVBQWU7QUFFbkMsVUFBTSxhQUNMLFNBQVUsR0FBa0I7QUFDM0IsYUFBTztBQUFBLFFBQ04sRUFBRSxVQUFVLFVBQVU7QUFBQSxRQUN0QixFQUFFLFVBQVUsVUFBVTtBQUFBLFFBQ3RCLEVBQUUsU0FBUyxTQUFTO0FBQUEsUUFDcEIsRUFBRSxXQUFXLFdBQVc7QUFBQSxRQUN4QixFQUFFO0FBQUEsTUFDSCxFQUFFLEtBQUssRUFBRTtBQUFBLElBQ1Y7QUFHRCxVQUFNLHNCQUF1QixZQUFZLGFBQWEsV0FBVyxnQkFBZ0I7QUFDakYsVUFBTSwwQkFBMEI7QUFDaEMsVUFBTSxZQUFhLFlBQVksYUFBYSxXQUFXLFlBQVk7QUFFbkUsUUFBSSxXQUFxRCxTQUFVLEdBQUc7QUFDckUsWUFBTSxNQUFNLFdBQVcsQ0FBQztBQUN4QixVQUFJLFFBQVEsdUJBQXVCLFFBQVEseUJBQXlCO0FBQ25FLG9CQUFZLEtBQUssdUJBQXVCO0FBQUEsTUFDekMsV0FBVyxRQUFRLGFBQWEsQ0FBQywwQkFBMEI7QUFDMUQsb0JBQVksS0FBSyxxQkFBcUI7QUFBQSxNQUN2QztBQUFBLElBQ0Q7QUFFQSxXQUFPLGlCQUFpQixXQUFXLFFBQVE7QUFFM0MsV0FBTyxXQUFZO0FBQ2xCLFVBQUksVUFBVTtBQUNiLGVBQU8sb0JBQW9CLFdBQVcsUUFBUTtBQUM5QyxtQkFBVztBQUFBLE1BQ1o7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLFdBQVMsU0FBMENBLGdCQUF3QjtBQUMxRSxlQUFXLHVCQUF1QkEsZUFBYyxJQUFJO0FBQ3BELGVBQVcsdUJBQXVCQSxlQUFjLElBQUk7QUFFcEQsUUFBSSxXQUFXQSxlQUFjLElBQUksWUFBWTtBQUM3QyxRQUFJLGFBQWEsU0FBUztBQUN6QixpQkFBVztBQUFBLElBQ1osV0FBVyxhQUFhLFNBQVM7QUFDaEMsaUJBQVc7QUFBQSxJQUNaO0FBRUEsV0FBTyxTQUFTLGdCQUFnQixhQUFhLFFBQVEsUUFBUTtBQUFBLEVBQzlEO0FBRUEsV0FBUyxrQkFBa0IsT0FBdUIscUJBQW9DO0FBQ3JGLFFBQUkscUJBQXFCO0FBQ3hCLFlBQU0sY0FBYyxlQUFlO0FBQ25DLGtCQUFZLEtBQUsscUJBQXFCO0FBQUEsSUFDdkM7QUFFQSxZQUFRLE1BQU0seUJBQXlCLEtBQUssRUFBRTtBQUU5QyxRQUFJLFNBQVMsT0FBTyxVQUFVLFlBQVksTUFBTSxPQUFPO0FBQ3RELGNBQVEsTUFBTSxNQUFNLEtBQUs7QUFBQSxJQUMxQjtBQUFBLEVBQ0Q7QUFFQSxXQUFTLGdCQUFnQixNQUFjLFFBQXNGO0FBSTVILFFBQUksV0FBVyxLQUFLLFFBQVEsT0FBTyxHQUFHO0FBQ3RDLFFBQUksU0FBUyxTQUFTLEtBQUssU0FBUyxPQUFPLENBQUMsTUFBTSxLQUFLO0FBQ3RELGlCQUFXLElBQUksUUFBUTtBQUFBLElBQ3hCO0FBRUEsUUFBSTtBQUtKLFFBQUksT0FBTyxhQUFhLFNBQVMsV0FBVyxJQUFJLEdBQUc7QUFDbEQsWUFBTSxVQUFVLEdBQUcsT0FBTyxVQUFVLE1BQU0sSUFBSSxRQUFRLEVBQUU7QUFBQSxJQUN6RCxPQUdLO0FBQ0osWUFBTSxVQUFVLEdBQUcsT0FBTyxVQUFVLE1BQU0sTUFBTSxPQUFPLHFCQUFxQixFQUFFLEdBQUcsUUFBUSxFQUFFO0FBQUEsSUFDNUY7QUFFQSxXQUFPLElBQUksUUFBUSxNQUFNLEtBQUs7QUFBQSxFQUMvQjtBQUVBLFdBQVMsbUJBQW9EQSxnQkFBa0IsU0FBYztBQVE1RixRQUFJLFdBQVcsZ0NBQWdDO0FBQzlDO0FBQUEsSUFDRDtBQUVBLFFBQUksTUFBTSxRQUFRQSxlQUFjLFVBQVUsS0FBS0EsZUFBYyxXQUFXLFNBQVMsR0FBRztBQUNuRixrQkFBWSxLQUFLLHVCQUF1QjtBQUV4QyxpQkFBVyxtQkFBbUIsU0FBVSxLQUFLO0FBQzVDLGNBQU0sT0FBTyxTQUFTLGNBQWMsTUFBTTtBQUMxQyxhQUFLLGFBQWEsT0FBTyxZQUFZO0FBQ3JDLGFBQUssYUFBYSxRQUFRLFVBQVU7QUFDcEMsYUFBSyxhQUFhLFFBQVEsR0FBRztBQUU3QixlQUFPLFNBQVMsS0FBSyxZQUFZLElBQUk7QUFBQSxNQUN0QztBQUVBLFlBQU0sWUFBaUQsRUFBRSxTQUFTLENBQUMsRUFBRTtBQUNyRSxpQkFBVyxhQUFhQSxlQUFjLFlBQVk7QUFDakQsY0FBTSxTQUFTLElBQUksSUFBSSxXQUFXLE9BQU8sRUFBRTtBQUMzQyxjQUFNLFFBQVEsZ0NBQWdDLE1BQU07QUFBQTtBQUNwRCxjQUFNLE9BQU8sSUFBSSxLQUFLLENBQUMsS0FBSyxHQUFHLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNqRSxrQkFBVSxRQUFRLE1BQU0sSUFBSSxJQUFJLGdCQUFnQixJQUFJO0FBQUEsTUFDckQ7QUFFQSxZQUFNLE1BQU0sT0FBTyxjQUFjLGFBQWEsNkJBQTZCLEVBQUUsYUFBYSxPQUFPO0FBQUUsZUFBTztBQUFBLE1BQU8sRUFBRyxDQUFDO0FBQ3JILFlBQU0sZUFBZSxLQUFLLFVBQVUsV0FBVyxRQUFXLENBQUM7QUFDM0QsWUFBTSxrQkFBa0IsU0FBUyxjQUFjLFFBQVE7QUFDdkQsc0JBQWdCLE9BQU87QUFDdkIsc0JBQWdCLGFBQWEsU0FBUyxjQUFjO0FBRXBELHNCQUFnQixjQUFjLEtBQUssYUFBYSxZQUFZLEtBQUs7QUFDakUsYUFBTyxTQUFTLEtBQUssWUFBWSxlQUFlO0FBRWhELGtCQUFZLEtBQUssc0JBQXNCO0FBQUEsSUFDeEM7QUFBQSxFQUNEO0FBSUEsUUFBTSxFQUFFLFFBQVEsY0FBYyxJQUFJLE1BQU07QUFBQSxJQUN2QztBQUFBLE1BQ0MsNEJBQTRCLFNBQVUsY0FBYztBQUNuRCxlQUFPO0FBQUE7QUFBQTtBQUFBLFVBR04saUNBQWlDLE9BQU8sYUFBYSx1QkFBdUIsWUFBWSxhQUFhLDBCQUEwQixNQUFNO0FBQUE7QUFBQSxVQUVySSxpQ0FBaUMsTUFBTSxRQUFRLGFBQWEsd0JBQXdCLEtBQUssYUFBYSx5QkFBeUIsU0FBUztBQUFBLFVBQ3hJLHFDQUFxQztBQUFBLFFBQ3RDO0FBQUEsTUFDRDtBQUFBLE1BQ0EsY0FBYyxTQUFVLGNBQWM7QUFHckMsbUJBQVcsWUFBWTtBQUd2QixlQUFPLGVBQWUsUUFBUSxrQkFBa0I7QUFBQSxVQUMvQyxLQUFLLE1BQU0sYUFBYTtBQUFBLFFBQ3pCLENBQUM7QUFRRCxlQUFPLG9CQUFvQixNQUFNO0FBQ2hDLGdCQUFNLFNBQVMsU0FBUyxjQUFjLFFBQVE7QUFDOUMsZ0JBQU0sVUFBVSxPQUFPLFdBQVcsSUFBSTtBQUN0QyxtQkFBUyxVQUFVLEdBQUcsR0FBRyxPQUFPLE9BQU8sT0FBTyxNQUFNO0FBQ3BELGlCQUFPLE9BQU87QUFBQSxRQUNmLEdBQUcsRUFBRSxTQUFTLEdBQUcsQ0FBQztBQUdsQixvQkFBWSxLQUFLLDRCQUE0QjtBQUFBLE1BQzlDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFHQSxjQUFZLEtBQUssMkJBQTJCO0FBRzVDLFNBQU8sS0FBSyxhQUFhO0FBQzFCLEdBQUU7IiwKICAibmFtZXMiOiBbImNvbmZpZ3VyYXRpb24iLCAicmVzdWx0Il0KfQo=
