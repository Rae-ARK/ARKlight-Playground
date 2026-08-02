(function() {
  const { ipcRenderer, webFrame, contextBridge, webUtils } = require("electron");
  function validateIPC(channel) {
    if (!channel?.startsWith("vscode:")) {
      throw new Error(`Unsupported event IPC channel '${channel}'`);
    }
    return true;
  }
  function parseArgv(key) {
    for (const arg of process.argv) {
      if (arg.indexOf(`--${key}=`) === 0) {
        return arg.split("=")[1];
      }
    }
    return void 0;
  }
  let configuration = void 0;
  const resolveConfiguration = (async () => {
    const windowConfigIpcChannel = parseArgv("vscode-window-config");
    if (!windowConfigIpcChannel) {
      throw new Error("Preload: did not find expected vscode-window-config in renderer process arguments list.");
    }
    try {
      validateIPC(windowConfigIpcChannel);
      const resolvedConfiguration = configuration = await ipcRenderer.invoke(windowConfigIpcChannel);
      Object.assign(process.env, resolvedConfiguration.userEnv);
      webFrame.setZoomLevel(resolvedConfiguration.zoomLevel ?? 0);
      return resolvedConfiguration;
    } catch (error) {
      throw new Error(`Preload: unable to fetch vscode-window-config: ${error}`);
    }
  })();
  const resolveShellEnv = (async () => {
    const [userEnv, shellEnv] = await Promise.all([
      (async () => (await resolveConfiguration).userEnv)(),
      ipcRenderer.invoke("vscode:fetchShellEnv")
    ]);
    return { ...process.env, ...shellEnv, ...userEnv };
  })();
  const globals = {
    /**
     * A minimal set of methods exposed from Electron's `ipcRenderer`
     * to support communication to main process.
     */
    ipcRenderer: {
      send(channel, ...args) {
        if (validateIPC(channel)) {
          ipcRenderer.send(channel, ...args);
        }
      },
      invoke(channel, ...args) {
        validateIPC(channel);
        return ipcRenderer.invoke(channel, ...args);
      },
      on(channel, listener) {
        validateIPC(channel);
        ipcRenderer.on(channel, listener);
        return this;
      },
      once(channel, listener) {
        validateIPC(channel);
        ipcRenderer.once(channel, listener);
        return this;
      },
      removeListener(channel, listener) {
        validateIPC(channel);
        ipcRenderer.removeListener(channel, listener);
        return this;
      }
    },
    ipcMessagePort: {
      acquire(responseChannel, nonce) {
        if (validateIPC(responseChannel)) {
          const responseListener = (e, responseNonce) => {
            if (nonce === responseNonce) {
              ipcRenderer.off(responseChannel, responseListener);
              window.postMessage(nonce, "*", e.ports);
            }
          };
          ipcRenderer.on(responseChannel, responseListener);
        }
      }
    },
    /**
     * Support for subset of methods of Electron's `webFrame` type.
     */
    webFrame: {
      setZoomLevel(level) {
        if (typeof level === "number") {
          webFrame.setZoomLevel(level);
        }
      }
    },
    /**
     * Support for subset of Electron's `webUtils` type.
     */
    webUtils: {
      getPathForFile(file) {
        return webUtils.getPathForFile(file);
      }
    },
    /**
     * Support for a subset of access to node.js global `process`.
     *
     * Note: when `sandbox` is enabled, the only properties available
     * are https://github.com/electron/electron/blob/master/docs/api/process.md#sandbox
     */
    process: {
      get platform() {
        return process.platform;
      },
      get arch() {
        return process.arch;
      },
      get env() {
        return { ...process.env };
      },
      get versions() {
        return process.versions;
      },
      get type() {
        return "renderer";
      },
      get execPath() {
        return process.execPath;
      },
      cwd() {
        return process.env["VSCODE_CWD"] || process.execPath.substr(0, process.execPath.lastIndexOf(process.platform === "win32" ? "\\" : "/"));
      },
      shellEnv() {
        return resolveShellEnv;
      },
      getProcessMemoryInfo() {
        return process.getProcessMemoryInfo();
      },
      on(type, callback) {
        process.on(type, callback);
      }
    },
    /**
     * Some information about the context we are running in.
     */
    context: {
      /**
       * A configuration object made accessible from the main side
       * to configure the sandbox browser window.
       *
       * Note: intentionally not using a getter here because the
       * actual value will be set after `resolveConfiguration`
       * has finished.
       */
      configuration() {
        return configuration;
      },
      /**
       * Allows to await the resolution of the configuration object.
       */
      async resolveConfiguration() {
        return resolveConfiguration;
      }
    }
  };
  try {
    contextBridge.exposeInMainWorld("vscode", globals);
  } catch (error) {
    console.error(error);
  }
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvcGFydHMvc2FuZGJveC9lbGVjdHJvbi1icm93c2VyL3ByZWxvYWQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vKiBlc2xpbnQtZGlzYWJsZSBuby1yZXN0cmljdGVkLWdsb2JhbHMgKi9cblxuKGZ1bmN0aW9uICgpIHtcblxuXHRjb25zdCB7IGlwY1JlbmRlcmVyLCB3ZWJGcmFtZSwgY29udGV4dEJyaWRnZSwgd2ViVXRpbHMgfSA9IHJlcXVpcmUoJ2VsZWN0cm9uJyk7XG5cblx0dHlwZSBJU2FuZGJveENvbmZpZ3VyYXRpb24gPSBpbXBvcnQoJy4uL2NvbW1vbi9zYW5kYm94VHlwZXMuanMnKS5JU2FuZGJveENvbmZpZ3VyYXRpb247XG5cblx0Ly8jcmVnaW9uIFV0aWxpdGllc1xuXG5cdGZ1bmN0aW9uIHZhbGlkYXRlSVBDKGNoYW5uZWw6IHN0cmluZyk6IHRydWUgfCBuZXZlciB7XG5cdFx0aWYgKCFjaGFubmVsPy5zdGFydHNXaXRoKCd2c2NvZGU6JykpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5zdXBwb3J0ZWQgZXZlbnQgSVBDIGNoYW5uZWwgJyR7Y2hhbm5lbH0nYCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRmdW5jdGlvbiBwYXJzZUFyZ3Yoa2V5OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGZvciAoY29uc3QgYXJnIG9mIHByb2Nlc3MuYXJndikge1xuXHRcdFx0aWYgKGFyZy5pbmRleE9mKGAtLSR7a2V5fT1gKSA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gYXJnLnNwbGl0KCc9JylbMV07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBSZXNvbHZlIENvbmZpZ3VyYXRpb25cblxuXHRsZXQgY29uZmlndXJhdGlvbjogSVNhbmRib3hDb25maWd1cmF0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0IHJlc29sdmVDb25maWd1cmF0aW9uOiBQcm9taXNlPElTYW5kYm94Q29uZmlndXJhdGlvbj4gPSAoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdpbmRvd0NvbmZpZ0lwY0NoYW5uZWwgPSBwYXJzZUFyZ3YoJ3ZzY29kZS13aW5kb3ctY29uZmlnJyk7XG5cdFx0aWYgKCF3aW5kb3dDb25maWdJcGNDaGFubmVsKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1ByZWxvYWQ6IGRpZCBub3QgZmluZCBleHBlY3RlZCB2c2NvZGUtd2luZG93LWNvbmZpZyBpbiByZW5kZXJlciBwcm9jZXNzIGFyZ3VtZW50cyBsaXN0LicpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHR2YWxpZGF0ZUlQQyh3aW5kb3dDb25maWdJcGNDaGFubmVsKTtcblxuXHRcdFx0Ly8gUmVzb2x2ZSBjb25maWd1cmF0aW9uIGZyb20gZWxlY3Ryb24tbWFpblxuXHRcdFx0Y29uc3QgcmVzb2x2ZWRDb25maWd1cmF0aW9uOiBJU2FuZGJveENvbmZpZ3VyYXRpb24gPSBjb25maWd1cmF0aW9uID0gYXdhaXQgaXBjUmVuZGVyZXIuaW52b2tlKHdpbmRvd0NvbmZpZ0lwY0NoYW5uZWwpO1xuXG5cdFx0XHQvLyBBcHBseSBgdXNlckVudmAgZGlyZWN0bHlcblx0XHRcdE9iamVjdC5hc3NpZ24ocHJvY2Vzcy5lbnYsIHJlc29sdmVkQ29uZmlndXJhdGlvbi51c2VyRW52KTtcblxuXHRcdFx0Ly8gQXBwbHkgem9vbSBsZXZlbCBlYXJseSBiZWZvcmUgZXZlbiBidWlsZGluZyB0aGVcblx0XHRcdC8vIHdpbmRvdyBET00gZWxlbWVudHMgdG8gYXZvaWQgVUkgZmxpY2tlci4gV2UgYWx3YXlzXG5cdFx0XHQvLyBoYXZlIHRvIHNldCB0aGUgem9vbSBsZXZlbCBmcm9tIHdpdGhpbiB0aGUgd2luZG93XG5cdFx0XHQvLyBiZWNhdXNlIENocm9tZSBoYXMgaXQncyBvd24gd2F5IG9mIHJlbWVtYmVyaW5nIHpvb21cblx0XHRcdC8vIHNldHRpbmdzIHBlciBvcmlnaW4gKGlmIHZzY29kZS1maWxlOi8vIGlzIHVzZWQpIGFuZFxuXHRcdFx0Ly8gd2Ugd2FudCB0byBlbnN1cmUgdGhhdCB0aGUgdXNlciBjb25maWd1cmF0aW9uIHdpbnMuXG5cdFx0XHR3ZWJGcmFtZS5zZXRab29tTGV2ZWwocmVzb2x2ZWRDb25maWd1cmF0aW9uLnpvb21MZXZlbCA/PyAwKTtcblxuXHRcdFx0cmV0dXJuIHJlc29sdmVkQ29uZmlndXJhdGlvbjtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBQcmVsb2FkOiB1bmFibGUgdG8gZmV0Y2ggdnNjb2RlLXdpbmRvdy1jb25maWc6ICR7ZXJyb3J9YCk7XG5cdFx0fVxuXHR9KSgpO1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBSZXNvbHZlIFNoZWxsIEVudmlyb25tZW50XG5cblx0LyoqXG5cdCAqIElmIFZTQ29kZSBpcyBub3QgcnVuIGZyb20gYSB0ZXJtaW5hbCwgd2Ugc2hvdWxkIHJlc29sdmUgYWRkaXRpb25hbFxuXHQgKiBzaGVsbCBzcGVjaWZpYyBlbnZpcm9ubWVudCBmcm9tIHRoZSBPUyBzaGVsbCB0byBlbnN1cmUgd2UgYXJlIHNlZWluZ1xuXHQgKiBhbGwgZGV2ZWxvcG1lbnQgcmVsYXRlZCBlbnZpcm9ubWVudCB2YXJpYWJsZXMuIFdlIGRvIHRoaXMgZnJvbSB0aGVcblx0ICogbWFpbiBwcm9jZXNzIGJlY2F1c2UgaXQgbWF5IGludm9sdmUgc3Bhd25pbmcgYSBzaGVsbC5cblx0ICovXG5cdGNvbnN0IHJlc29sdmVTaGVsbEVudjogUHJvbWlzZTx0eXBlb2YgcHJvY2Vzcy5lbnY+ID0gKGFzeW5jICgpID0+IHtcblxuXHRcdC8vIFJlc29sdmUgYHVzZXJFbnZgIGZyb20gY29uZmlndXJhdGlvbiBhbmRcblx0XHQvLyBgc2hlbGxFbnZgIGZyb20gdGhlIG1haW4gc2lkZVxuXHRcdGNvbnN0IFt1c2VyRW52LCBzaGVsbEVudl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHQoYXN5bmMgKCkgPT4gKGF3YWl0IHJlc29sdmVDb25maWd1cmF0aW9uKS51c2VyRW52KSgpLFxuXHRcdFx0aXBjUmVuZGVyZXIuaW52b2tlKCd2c2NvZGU6ZmV0Y2hTaGVsbEVudicpXG5cdFx0XSk7XG5cblx0XHRyZXR1cm4geyAuLi5wcm9jZXNzLmVudiwgLi4uc2hlbGxFbnYsIC4uLnVzZXJFbnYgfTtcblx0fSkoKTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gR2xvYmFscyBEZWZpbml0aW9uXG5cblx0Ly8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblx0Ly8gIyMjICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjIyNcblx0Ly8gIyMjICAgICAgICEhISBETyBOT1QgVVNFIEdFVC9TRVQgUFJPUEVSVElFUyBBTllXSEVSRSBIRVJFICEhISAgICAgICAjIyNcblx0Ly8gIyMjICAgICAgICEhISAgVU5MRVNTIFRIRSBBQ0NFU1MgSVMgV0lUSE9VVCBTSURFIEVGRkVDVFMgICEhISAgICAgICAjIyNcblx0Ly8gIyMjICAgICAgIChodHRwczovL2dpdGh1Yi5jb20vZWxlY3Ryb24vZWxlY3Ryb24vaXNzdWVzLzI1NTE2KSAgICAgICAjIyNcblx0Ly8gIyMjICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjIyNcblx0Ly8gIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNcblxuXHRjb25zdCBnbG9iYWxzID0ge1xuXG5cdFx0LyoqXG5cdFx0ICogQSBtaW5pbWFsIHNldCBvZiBtZXRob2RzIGV4cG9zZWQgZnJvbSBFbGVjdHJvbidzIGBpcGNSZW5kZXJlcmBcblx0XHQgKiB0byBzdXBwb3J0IGNvbW11bmljYXRpb24gdG8gbWFpbiBwcm9jZXNzLlxuXHRcdCAqL1xuXG5cdFx0aXBjUmVuZGVyZXI6IHtcblxuXHRcdFx0c2VuZChjaGFubmVsOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdFx0XHRpZiAodmFsaWRhdGVJUEMoY2hhbm5lbCkpIHtcblx0XHRcdFx0XHRpcGNSZW5kZXJlci5zZW5kKGNoYW5uZWwsIC4uLmFyZ3MpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXG5cdFx0XHRpbnZva2UoY2hhbm5lbDogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHVua25vd24+IHtcblx0XHRcdFx0dmFsaWRhdGVJUEMoY2hhbm5lbCk7XG5cblx0XHRcdFx0cmV0dXJuIGlwY1JlbmRlcmVyLmludm9rZShjaGFubmVsLCAuLi5hcmdzKTtcblx0XHRcdH0sXG5cblx0XHRcdG9uKGNoYW5uZWw6IHN0cmluZywgbGlzdGVuZXI6IChldmVudDogRWxlY3Ryb24uSXBjUmVuZGVyZXJFdmVudCwgLi4uYXJnczogdW5rbm93bltdKSA9PiB2b2lkKSB7XG5cdFx0XHRcdHZhbGlkYXRlSVBDKGNoYW5uZWwpO1xuXG5cdFx0XHRcdGlwY1JlbmRlcmVyLm9uKGNoYW5uZWwsIGxpc3RlbmVyKTtcblxuXHRcdFx0XHRyZXR1cm4gdGhpcztcblx0XHRcdH0sXG5cblx0XHRcdG9uY2UoY2hhbm5lbDogc3RyaW5nLCBsaXN0ZW5lcjogKGV2ZW50OiBFbGVjdHJvbi5JcGNSZW5kZXJlckV2ZW50LCAuLi5hcmdzOiB1bmtub3duW10pID0+IHZvaWQpIHtcblx0XHRcdFx0dmFsaWRhdGVJUEMoY2hhbm5lbCk7XG5cblx0XHRcdFx0aXBjUmVuZGVyZXIub25jZShjaGFubmVsLCBsaXN0ZW5lcik7XG5cblx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHR9LFxuXG5cdFx0XHRyZW1vdmVMaXN0ZW5lcihjaGFubmVsOiBzdHJpbmcsIGxpc3RlbmVyOiAoZXZlbnQ6IEVsZWN0cm9uLklwY1JlbmRlcmVyRXZlbnQsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZCkge1xuXHRcdFx0XHR2YWxpZGF0ZUlQQyhjaGFubmVsKTtcblxuXHRcdFx0XHRpcGNSZW5kZXJlci5yZW1vdmVMaXN0ZW5lcihjaGFubmVsLCBsaXN0ZW5lcik7XG5cblx0XHRcdFx0cmV0dXJuIHRoaXM7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdGlwY01lc3NhZ2VQb3J0OiB7XG5cblx0XHRcdGFjcXVpcmUocmVzcG9uc2VDaGFubmVsOiBzdHJpbmcsIG5vbmNlOiBzdHJpbmcpIHtcblx0XHRcdFx0aWYgKHZhbGlkYXRlSVBDKHJlc3BvbnNlQ2hhbm5lbCkpIHtcblx0XHRcdFx0XHRjb25zdCByZXNwb25zZUxpc3RlbmVyID0gKGU6IEVsZWN0cm9uLklwY1JlbmRlcmVyRXZlbnQsIHJlc3BvbnNlTm9uY2U6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gdmFsaWRhdGUgdGhhdCB0aGUgbm9uY2UgZnJvbSB0aGUgcmVzcG9uc2UgaXMgdGhlIHNhbWVcblx0XHRcdFx0XHRcdC8vIGFzIHdoZW4gcmVxdWVzdGVkLiBhbmQgaWYgc28sIHVzZSBgcG9zdE1lc3NhZ2VgIHRvXG5cdFx0XHRcdFx0XHQvLyBzZW5kIHRoZSBgTWVzc2FnZVBvcnRgIHNhZmVseSBvdmVyLCBldmVuIHdoZW4gY29udGV4dFxuXHRcdFx0XHRcdFx0Ly8gaXNvbGF0aW9uIGlzIGVuYWJsZWRcblx0XHRcdFx0XHRcdGlmIChub25jZSA9PT0gcmVzcG9uc2VOb25jZSkge1xuXHRcdFx0XHRcdFx0XHRpcGNSZW5kZXJlci5vZmYocmVzcG9uc2VDaGFubmVsLCByZXNwb25zZUxpc3RlbmVyKTtcblx0XHRcdFx0XHRcdFx0d2luZG93LnBvc3RNZXNzYWdlKG5vbmNlLCAnKicsIGUucG9ydHMpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHQvLyBoYW5kbGUgcmVwbHkgZnJvbSBtYWluXG5cdFx0XHRcdFx0aXBjUmVuZGVyZXIub24ocmVzcG9uc2VDaGFubmVsLCByZXNwb25zZUxpc3RlbmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBTdXBwb3J0IGZvciBzdWJzZXQgb2YgbWV0aG9kcyBvZiBFbGVjdHJvbidzIGB3ZWJGcmFtZWAgdHlwZS5cblx0XHQgKi9cblx0XHR3ZWJGcmFtZToge1xuXG5cdFx0XHRzZXRab29tTGV2ZWwobGV2ZWw6IG51bWJlcik6IHZvaWQge1xuXHRcdFx0XHRpZiAodHlwZW9mIGxldmVsID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdHdlYkZyYW1lLnNldFpvb21MZXZlbChsZXZlbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0LyoqXG5cdFx0ICogU3VwcG9ydCBmb3Igc3Vic2V0IG9mIEVsZWN0cm9uJ3MgYHdlYlV0aWxzYCB0eXBlLlxuXHRcdCAqL1xuXHRcdHdlYlV0aWxzOiB7XG5cblx0XHRcdGdldFBhdGhGb3JGaWxlKGZpbGU6IEZpbGUpOiBzdHJpbmcge1xuXHRcdFx0XHRyZXR1cm4gd2ViVXRpbHMuZ2V0UGF0aEZvckZpbGUoZmlsZSk7XG5cdFx0XHR9XG5cdFx0fSxcblxuXHRcdC8qKlxuXHRcdCAqIFN1cHBvcnQgZm9yIGEgc3Vic2V0IG9mIGFjY2VzcyB0byBub2RlLmpzIGdsb2JhbCBgcHJvY2Vzc2AuXG5cdFx0ICpcblx0XHQgKiBOb3RlOiB3aGVuIGBzYW5kYm94YCBpcyBlbmFibGVkLCB0aGUgb25seSBwcm9wZXJ0aWVzIGF2YWlsYWJsZVxuXHRcdCAqIGFyZSBodHRwczovL2dpdGh1Yi5jb20vZWxlY3Ryb24vZWxlY3Ryb24vYmxvYi9tYXN0ZXIvZG9jcy9hcGkvcHJvY2Vzcy5tZCNzYW5kYm94XG5cdFx0ICovXG5cdFx0cHJvY2Vzczoge1xuXHRcdFx0Z2V0IHBsYXRmb3JtKCkgeyByZXR1cm4gcHJvY2Vzcy5wbGF0Zm9ybTsgfSxcblx0XHRcdGdldCBhcmNoKCkgeyByZXR1cm4gcHJvY2Vzcy5hcmNoOyB9LFxuXHRcdFx0Z2V0IGVudigpIHsgcmV0dXJuIHsgLi4ucHJvY2Vzcy5lbnYgfTsgfSxcblx0XHRcdGdldCB2ZXJzaW9ucygpIHsgcmV0dXJuIHByb2Nlc3MudmVyc2lvbnM7IH0sXG5cdFx0XHRnZXQgdHlwZSgpIHsgcmV0dXJuICdyZW5kZXJlcic7IH0sXG5cdFx0XHRnZXQgZXhlY1BhdGgoKSB7IHJldHVybiBwcm9jZXNzLmV4ZWNQYXRoOyB9LFxuXG5cdFx0XHRjd2QoKTogc3RyaW5nIHtcblx0XHRcdFx0cmV0dXJuIHByb2Nlc3MuZW52WydWU0NPREVfQ1dEJ10gfHwgcHJvY2Vzcy5leGVjUGF0aC5zdWJzdHIoMCwgcHJvY2Vzcy5leGVjUGF0aC5sYXN0SW5kZXhPZihwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInID8gJ1xcXFwnIDogJy8nKSk7XG5cdFx0XHR9LFxuXG5cdFx0XHRzaGVsbEVudigpOiBQcm9taXNlPHR5cGVvZiBwcm9jZXNzLmVudj4ge1xuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZVNoZWxsRW52O1xuXHRcdFx0fSxcblxuXHRcdFx0Z2V0UHJvY2Vzc01lbW9yeUluZm8oKTogUHJvbWlzZTxFbGVjdHJvbi5Qcm9jZXNzTWVtb3J5SW5mbz4ge1xuXHRcdFx0XHRyZXR1cm4gcHJvY2Vzcy5nZXRQcm9jZXNzTWVtb3J5SW5mbygpO1xuXHRcdFx0fSxcblxuXHRcdFx0b24odHlwZTogc3RyaW5nLCBjYWxsYmFjazogKC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZCk6IHZvaWQge1xuXHRcdFx0XHRwcm9jZXNzLm9uKHR5cGUsIGNhbGxiYWNrKTtcblx0XHRcdH1cblx0XHR9LFxuXG5cdFx0LyoqXG5cdFx0ICogU29tZSBpbmZvcm1hdGlvbiBhYm91dCB0aGUgY29udGV4dCB3ZSBhcmUgcnVubmluZyBpbi5cblx0XHQgKi9cblx0XHRjb250ZXh0OiB7XG5cblx0XHRcdC8qKlxuXHRcdFx0ICogQSBjb25maWd1cmF0aW9uIG9iamVjdCBtYWRlIGFjY2Vzc2libGUgZnJvbSB0aGUgbWFpbiBzaWRlXG5cdFx0XHQgKiB0byBjb25maWd1cmUgdGhlIHNhbmRib3ggYnJvd3NlciB3aW5kb3cuXG5cdFx0XHQgKlxuXHRcdFx0ICogTm90ZTogaW50ZW50aW9uYWxseSBub3QgdXNpbmcgYSBnZXR0ZXIgaGVyZSBiZWNhdXNlIHRoZVxuXHRcdFx0ICogYWN0dWFsIHZhbHVlIHdpbGwgYmUgc2V0IGFmdGVyIGByZXNvbHZlQ29uZmlndXJhdGlvbmBcblx0XHRcdCAqIGhhcyBmaW5pc2hlZC5cblx0XHRcdCAqL1xuXHRcdFx0Y29uZmlndXJhdGlvbigpOiBJU2FuZGJveENvbmZpZ3VyYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdFx0XHRyZXR1cm4gY29uZmlndXJhdGlvbjtcblx0XHRcdH0sXG5cblx0XHRcdC8qKlxuXHRcdFx0ICogQWxsb3dzIHRvIGF3YWl0IHRoZSByZXNvbHV0aW9uIG9mIHRoZSBjb25maWd1cmF0aW9uIG9iamVjdC5cblx0XHRcdCAqL1xuXHRcdFx0YXN5bmMgcmVzb2x2ZUNvbmZpZ3VyYXRpb24oKTogUHJvbWlzZTxJU2FuZGJveENvbmZpZ3VyYXRpb24+IHtcblx0XHRcdFx0cmV0dXJuIHJlc29sdmVDb25maWd1cmF0aW9uO1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHR0cnkge1xuXHRcdC8vIFVzZSBgY29udGV4dEJyaWRnZWAgQVBJcyB0byBleHBvc2UgZ2xvYmFscyB0byBWU0NvZGVcblx0XHRjb250ZXh0QnJpZGdlLmV4cG9zZUluTWFpbldvcmxkKCd2c2NvZGUnLCBnbG9iYWxzKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRjb25zb2xlLmVycm9yKGVycm9yKTtcblx0fVxufSgpKTtcbiJdLAogICJtYXBwaW5ncyI6ICJDQU9DLFdBQVk7QUFFWixRQUFNLEVBQUUsYUFBYSxVQUFVLGVBQWUsU0FBUyxJQUFJLFFBQVEsVUFBVTtBQU03RSxXQUFTLFlBQVksU0FBK0I7QUFDbkQsUUFBSSxDQUFDLFNBQVMsV0FBVyxTQUFTLEdBQUc7QUFDcEMsWUFBTSxJQUFJLE1BQU0sa0NBQWtDLE9BQU8sR0FBRztBQUFBLElBQzdEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFFQSxXQUFTLFVBQVUsS0FBaUM7QUFDbkQsZUFBVyxPQUFPLFFBQVEsTUFBTTtBQUMvQixVQUFJLElBQUksUUFBUSxLQUFLLEdBQUcsR0FBRyxNQUFNLEdBQUc7QUFDbkMsZUFBTyxJQUFJLE1BQU0sR0FBRyxFQUFFLENBQUM7QUFBQSxNQUN4QjtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQU1BLE1BQUksZ0JBQW1EO0FBRXZELFFBQU0sd0JBQXdELFlBQVk7QUFDekUsVUFBTSx5QkFBeUIsVUFBVSxzQkFBc0I7QUFDL0QsUUFBSSxDQUFDLHdCQUF3QjtBQUM1QixZQUFNLElBQUksTUFBTSx5RkFBeUY7QUFBQSxJQUMxRztBQUVBLFFBQUk7QUFDSCxrQkFBWSxzQkFBc0I7QUFHbEMsWUFB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
