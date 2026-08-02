(function() {
  const { ipcRenderer, webFrame, contextBridge } = require("electron");
  function validateIPC(channel) {
    if (!channel?.startsWith("vscode:")) {
      throw new Error(`Unsupported event IPC channel '${channel}'`);
    }
    return true;
  }
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
    }
  };
  try {
    contextBridge.exposeInMainWorld("vscode", globals);
  } catch (error) {
    console.error(error);
  }
})();
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvcGFydHMvc2FuZGJveC9lbGVjdHJvbi1icm93c2VyL3ByZWxvYWQtYXV4LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuKGZ1bmN0aW9uICgpIHtcblxuXHRjb25zdCB7IGlwY1JlbmRlcmVyLCB3ZWJGcmFtZSwgY29udGV4dEJyaWRnZSB9ID0gcmVxdWlyZSgnZWxlY3Ryb24nKTtcblxuXHRmdW5jdGlvbiB2YWxpZGF0ZUlQQyhjaGFubmVsOiBzdHJpbmcpOiB0cnVlIHwgbmV2ZXIge1xuXHRcdGlmICghY2hhbm5lbD8uc3RhcnRzV2l0aCgndnNjb2RlOicpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVuc3VwcG9ydGVkIGV2ZW50IElQQyBjaGFubmVsICcke2NoYW5uZWx9J2ApO1xuXHRcdH1cblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Y29uc3QgZ2xvYmFscyA9IHtcblxuXHRcdC8qKlxuXHRcdCAqIEEgbWluaW1hbCBzZXQgb2YgbWV0aG9kcyBleHBvc2VkIGZyb20gRWxlY3Ryb24ncyBgaXBjUmVuZGVyZXJgXG5cdFx0ICogdG8gc3VwcG9ydCBjb21tdW5pY2F0aW9uIHRvIG1haW4gcHJvY2Vzcy5cblx0XHQgKi9cblx0XHRpcGNSZW5kZXJlcjoge1xuXG5cdFx0XHRzZW5kKGNoYW5uZWw6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0XHRcdGlmICh2YWxpZGF0ZUlQQyhjaGFubmVsKSkge1xuXHRcdFx0XHRcdGlwY1JlbmRlcmVyLnNlbmQoY2hhbm5lbCwgLi4uYXJncyk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cblx0XHRcdGludm9rZShjaGFubmVsOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdFx0XHR2YWxpZGF0ZUlQQyhjaGFubmVsKTtcblxuXHRcdFx0XHRyZXR1cm4gaXBjUmVuZGVyZXIuaW52b2tlKGNoYW5uZWwsIC4uLmFyZ3MpO1xuXHRcdFx0fVxuXHRcdH0sXG5cblx0XHQvKipcblx0XHQgKiBTdXBwb3J0IGZvciBzdWJzZXQgb2YgbWV0aG9kcyBvZiBFbGVjdHJvbidzIGB3ZWJGcmFtZWAgdHlwZS5cblx0XHQgKi9cblx0XHR3ZWJGcmFtZToge1xuXG5cdFx0XHRzZXRab29tTGV2ZWwobGV2ZWw6IG51bWJlcik6IHZvaWQge1xuXHRcdFx0XHRpZiAodHlwZW9mIGxldmVsID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdHdlYkZyYW1lLnNldFpvb21MZXZlbChsZXZlbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH07XG5cblx0dHJ5IHtcblx0XHRjb250ZXh0QnJpZGdlLmV4cG9zZUluTWFpbldvcmxkKCd2c2NvZGUnLCBnbG9iYWxzKTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRjb25zb2xlLmVycm9yKGVycm9yKTtcblx0fVxufSgpKTtcbiJdLAogICJtYXBwaW5ncyI6ICJDQUtDLFdBQVk7QUFFWixRQUFNLEVBQUUsYUFBYSxVQUFVLGNBQWMsSUFBSSxRQUFRLFVBQVU7QUFFbkUsV0FBUyxZQUFZLFNBQStCO0FBQ25ELFFBQUksQ0FBQyxTQUFTLFdBQVcsU0FBUyxHQUFHO0FBQ3BDLFlBQU0sSUFBSSxNQUFNLGtDQUFrQyxPQUFPLEdBQUc7QUFBQSxJQUM3RDtBQUVBLFdBQU87QUFBQSxFQUNSO0FBRUEsUUFBTSxVQUFVO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQU1mLGFBQWE7QUFBQSxNQUVaLEtBQUssWUFBb0IsTUFBdUI7QUFDL0MsWUFBSSxZQUFZLE9BQU8sR0FBRztBQUN6QixzQkFBWSxLQUFLLFNBQVMsR0FBRyxJQUFJO0FBQUEsUUFDbEM7QUFBQSxNQUNEO0FBQUEsTUFFQSxPQUFPLFlBQW9CLE1BQW1DO0FBQzdELG9CQUFZLE9BQU87QUFFbkIsZUFBTyxZQUFZLE9BQU8sU0FBUyxHQUFHLElBQUk7QUFBQSxNQUMzQztBQUFBLElBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQUtBLFVBQVU7QUFBQSxNQUVULGFBQWEsT0FBcUI7QUFDakMsWUFBSSxPQUFPLFVBQVUsVUFBVTtBQUM5QixtQkFBUyxhQUFhLEtBQUs7QUFBQSxRQUM1QjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUVBLE1BQUk7QUFDSCxrQkFBYyxrQkFBa0IsVUFBVSxPQUFPO0FBQUEsRUFDbEQsU0FBUyxPQUFPO0FBQ2YsWUFBUSxNQUFNLEtBQUs7QUFBQSxFQUNwQjtBQUNELEdBQUU7IiwKICAibmFtZXMiOiBbXQp9Cg==
