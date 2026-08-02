const _bootstrapFnSource = (function _bootstrapFn(workerUrl) {
  const listener = (event) => {
    globalThis.removeEventListener("message", listener);
    const port = event.data;
    Object.defineProperties(globalThis, {
      "postMessage": {
        value(data, transferOrOptions) {
          port.postMessage(data, transferOrOptions);
        }
      },
      "onmessage": {
        get() {
          return port.onmessage;
        },
        set(value) {
          port.onmessage = value;
        }
      }
      // todo onerror
    });
    port.addEventListener("message", (msg) => {
      globalThis.dispatchEvent(new MessageEvent("message", { data: msg.data, ports: msg.ports ? [...msg.ports] : void 0 }));
    });
    port.start();
    globalThis.Worker = class {
      constructor() {
        throw new TypeError("Nested workers from within nested worker are NOT supported.");
      }
    };
    importScripts(workerUrl);
  };
  globalThis.addEventListener("message", listener);
}).toString();
class NestedWorker extends EventTarget {
  constructor(nativePostMessage, stringOrUrl, options) {
    super();
    this.onmessage = null;
    this.onmessageerror = null;
    this.onerror = null;
    const bootstrap = `((${_bootstrapFnSource})('${stringOrUrl}'))`;
    const blob = new Blob([bootstrap], { type: "application/javascript" });
    const blobUrl = URL.createObjectURL(blob);
    const channel = new MessageChannel();
    const id = blobUrl;
    const msg = {
      type: "_newWorker",
      id,
      port: channel.port2,
      url: blobUrl,
      options
    };
    nativePostMessage(msg, [channel.port2]);
    this.postMessage = channel.port1.postMessage.bind(channel.port1);
    this.terminate = () => {
      const msg2 = {
        type: "_terminateWorker",
        id
      };
      nativePostMessage(msg2);
      URL.revokeObjectURL(blobUrl);
      channel.port1.close();
      channel.port2.close();
    };
    Object.defineProperties(this, {
      "onmessage": {
        get() {
          return channel.port1.onmessage;
        },
        set(value) {
          channel.port1.onmessage = value;
        }
      },
      "onmessageerror": {
        get() {
          return channel.port1.onmessageerror;
        },
        set(value) {
          channel.port1.onmessageerror = value;
        }
      }
      // todo onerror
    });
    channel.port1.addEventListener("messageerror", (evt) => {
      const msgEvent = new MessageEvent("messageerror", { data: evt.data });
      this.dispatchEvent(msgEvent);
    });
    channel.port1.addEventListener("message", (evt) => {
      const msgEvent = new MessageEvent("message", { data: evt.data });
      this.dispatchEvent(msgEvent);
    });
    channel.port1.start();
  }
}
export {
  NestedWorker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL3dvcmtlci9wb2x5ZmlsbE5lc3RlZFdvcmtlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IE5ld1dvcmtlck1lc3NhZ2UsIFRlcm1pbmF0ZVdvcmtlck1lc3NhZ2UgfSBmcm9tICcuLi9jb21tb24vcG9seWZpbGxOZXN0ZWRXb3JrZXIucHJvdG9jb2wuanMnO1xuXG5kZWNsYXJlIGZ1bmN0aW9uIHBvc3RNZXNzYWdlKGRhdGE6IGFueSwgdHJhbnNmZXJhYmxlcz86IFRyYW5zZmVyYWJsZVtdKTogdm9pZDtcblxuZGVjbGFyZSB0eXBlIE1lc3NhZ2VFdmVudEhhbmRsZXIgPSAoKGV2OiBNZXNzYWdlRXZlbnQ8YW55PikgPT4gYW55KSB8IG51bGw7XG5cbmNvbnN0IF9ib290c3RyYXBGblNvdXJjZSA9IChmdW5jdGlvbiBfYm9vdHN0cmFwRm4od29ya2VyVXJsOiBzdHJpbmcpIHtcblxuXHRjb25zdCBsaXN0ZW5lcjogRXZlbnRMaXN0ZW5lciA9IChldmVudDogRXZlbnQpOiB2b2lkID0+IHtcblx0XHQvLyB1bmluc3RhbGwgaGFuZGxlclxuXHRcdGdsb2JhbFRoaXMucmVtb3ZlRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGxpc3RlbmVyKTtcblxuXHRcdC8vIGdldCBkYXRhXG5cdFx0Y29uc3QgcG9ydCA9IDxNZXNzYWdlUG9ydD4oPE1lc3NhZ2VFdmVudD5ldmVudCkuZGF0YTtcblxuXHRcdC8vIHBvc3RNZXNzYWdlXG5cdFx0Ly8gb25tZXNzYWdlXG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnRpZXMoZ2xvYmFsVGhpcywge1xuXHRcdFx0J3Bvc3RNZXNzYWdlJzoge1xuXHRcdFx0XHR2YWx1ZShkYXRhOiBhbnksIHRyYW5zZmVyT3JPcHRpb25zPzogYW55KSB7XG5cdFx0XHRcdFx0cG9ydC5wb3N0TWVzc2FnZShkYXRhLCB0cmFuc2Zlck9yT3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQnb25tZXNzYWdlJzoge1xuXHRcdFx0XHRnZXQoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHBvcnQub25tZXNzYWdlO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZXQodmFsdWU6IE1lc3NhZ2VFdmVudEhhbmRsZXIpIHtcblx0XHRcdFx0XHRwb3J0Lm9ubWVzc2FnZSA9IHZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyB0b2RvIG9uZXJyb3Jcblx0XHR9KTtcblxuXHRcdHBvcnQuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIG1zZyA9PiB7XG5cdFx0XHRnbG9iYWxUaGlzLmRpc3BhdGNoRXZlbnQobmV3IE1lc3NhZ2VFdmVudCgnbWVzc2FnZScsIHsgZGF0YTogbXNnLmRhdGEsIHBvcnRzOiBtc2cucG9ydHMgPyBbLi4ubXNnLnBvcnRzXSA6IHVuZGVmaW5lZCB9KSk7XG5cdFx0fSk7XG5cblx0XHRwb3J0LnN0YXJ0KCk7XG5cblx0XHQvLyBmYWtlIHJlY3Vyc2l2ZWx5IG5lc3RlZCB3b3JrZXJcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRnbG9iYWxUaGlzLldvcmtlciA9IDxhbnk+Y2xhc3MgeyBjb25zdHJ1Y3RvcigpIHsgdGhyb3cgbmV3IFR5cGVFcnJvcignTmVzdGVkIHdvcmtlcnMgZnJvbSB3aXRoaW4gbmVzdGVkIHdvcmtlciBhcmUgTk9UIHN1cHBvcnRlZC4nKTsgfSB9O1xuXG5cdFx0Ly8gbG9hZCBtb2R1bGVcblx0XHRpbXBvcnRTY3JpcHRzKHdvcmtlclVybCk7XG5cdH07XG5cblx0Z2xvYmFsVGhpcy5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgbGlzdGVuZXIpO1xufSkudG9TdHJpbmcoKTtcblxuXG5leHBvcnQgY2xhc3MgTmVzdGVkV29ya2VyIGV4dGVuZHMgRXZlbnRUYXJnZXQgaW1wbGVtZW50cyBXb3JrZXIge1xuXG5cdG9ubWVzc2FnZTogKCh0aGlzOiBXb3JrZXIsIGV2OiBNZXNzYWdlRXZlbnQ8YW55PikgPT4gYW55KSB8IG51bGwgPSBudWxsO1xuXHRvbm1lc3NhZ2VlcnJvcjogKCh0aGlzOiBXb3JrZXIsIGV2OiBNZXNzYWdlRXZlbnQ8YW55PikgPT4gYW55KSB8IG51bGwgPSBudWxsO1xuXHRvbmVycm9yOiAoKHRoaXM6IEFic3RyYWN0V29ya2VyLCBldjogRXJyb3JFdmVudCkgPT4gYW55KSB8IG51bGwgPSBudWxsO1xuXG5cdHJlYWRvbmx5IHRlcm1pbmF0ZTogKCkgPT4gdm9pZDtcblx0cmVhZG9ubHkgcG9zdE1lc3NhZ2U6IChtZXNzYWdlOiBhbnksIG9wdGlvbnM/OiBhbnkpID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IobmF0aXZlUG9zdE1lc3NhZ2U6IHR5cGVvZiBwb3N0TWVzc2FnZSwgc3RyaW5nT3JVcmw6IHN0cmluZyB8IFVSTCwgb3B0aW9ucz86IFdvcmtlck9wdGlvbnMpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gY3JlYXRlIGJvb3RzdHJhcCBzY3JpcHRcblx0XHRjb25zdCBib290c3RyYXAgPSBgKCgke19ib290c3RyYXBGblNvdXJjZX0pKCcke3N0cmluZ09yVXJsfScpKWA7XG5cdFx0Y29uc3QgYmxvYiA9IG5ldyBCbG9iKFtib290c3RyYXBdLCB7IHR5cGU6ICdhcHBsaWNhdGlvbi9qYXZhc2NyaXB0JyB9KTtcblx0XHRjb25zdCBibG9iVXJsID0gVVJMLmNyZWF0ZU9iamVjdFVSTChibG9iKTtcblxuXHRcdGNvbnN0IGNoYW5uZWwgPSBuZXcgTWVzc2FnZUNoYW5uZWwoKTtcblx0XHRjb25zdCBpZCA9IGJsb2JVcmw7IC8vIHdvcmtzIGJlY2F1c2UgYmxvYiB1cmwgaXMgdW5pcXVlLCBuZWVkcyBJRCBwb29sIG90aGVyd2lzZVxuXG5cdFx0Y29uc3QgbXNnOiBOZXdXb3JrZXJNZXNzYWdlID0ge1xuXHRcdFx0dHlwZTogJ19uZXdXb3JrZXInLFxuXHRcdFx0aWQsXG5cdFx0XHRwb3J0OiBjaGFubmVsLnBvcnQyLFxuXHRcdFx0dXJsOiBibG9iVXJsLFxuXHRcdFx0b3B0aW9ucyxcblx0XHR9O1xuXHRcdG5hdGl2ZVBvc3RNZXNzYWdlKG1zZywgW2NoYW5uZWwucG9ydDJdKTtcblxuXHRcdC8vIHdvcmtlci1pbXBsOiBmdW5jdGlvbnNcblx0XHR0aGlzLnBvc3RNZXNzYWdlID0gY2hhbm5lbC5wb3J0MS5wb3N0TWVzc2FnZS5iaW5kKGNoYW5uZWwucG9ydDEpO1xuXHRcdHRoaXMudGVybWluYXRlID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgbXNnOiBUZXJtaW5hdGVXb3JrZXJNZXNzYWdlID0ge1xuXHRcdFx0XHR0eXBlOiAnX3Rlcm1pbmF0ZVdvcmtlcicsXG5cdFx0XHRcdGlkXG5cdFx0XHR9O1xuXHRcdFx0bmF0aXZlUG9zdE1lc3NhZ2UobXNnKTtcblx0XHRcdFVSTC5yZXZva2VPYmplY3RVUkwoYmxvYlVybCk7XG5cblx0XHRcdGNoYW5uZWwucG9ydDEuY2xvc2UoKTtcblx0XHRcdGNoYW5uZWwucG9ydDIuY2xvc2UoKTtcblx0XHR9O1xuXG5cdFx0Ly8gd29ya2VyLWltcGw6IGV2ZW50c1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKHRoaXMsIHtcblx0XHRcdCdvbm1lc3NhZ2UnOiB7XG5cdFx0XHRcdGdldCgpIHtcblx0XHRcdFx0XHRyZXR1cm4gY2hhbm5lbC5wb3J0MS5vbm1lc3NhZ2U7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNldCh2YWx1ZTogTWVzc2FnZUV2ZW50SGFuZGxlcikge1xuXHRcdFx0XHRcdGNoYW5uZWwucG9ydDEub25tZXNzYWdlID0gdmFsdWU7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHQnb25tZXNzYWdlZXJyb3InOiB7XG5cdFx0XHRcdGdldCgpIHtcblx0XHRcdFx0XHRyZXR1cm4gY2hhbm5lbC5wb3J0MS5vbm1lc3NhZ2VlcnJvcjtcblx0XHRcdFx0fSxcblx0XHRcdFx0c2V0KHZhbHVlOiBNZXNzYWdlRXZlbnRIYW5kbGVyKSB7XG5cdFx0XHRcdFx0Y2hhbm5lbC5wb3J0MS5vbm1lc3NhZ2VlcnJvciA9IHZhbHVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Ly8gdG9kbyBvbmVycm9yXG5cdFx0fSk7XG5cblx0XHRjaGFubmVsLnBvcnQxLmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2VlcnJvcicsIGV2dCA9PiB7XG5cdFx0XHRjb25zdCBtc2dFdmVudCA9IG5ldyBNZXNzYWdlRXZlbnQoJ21lc3NhZ2VlcnJvcicsIHsgZGF0YTogZXZ0LmRhdGEgfSk7XG5cdFx0XHR0aGlzLmRpc3BhdGNoRXZlbnQobXNnRXZlbnQpO1xuXHRcdH0pO1xuXG5cdFx0Y2hhbm5lbC5wb3J0MS5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgZXZ0ID0+IHtcblx0XHRcdGNvbnN0IG1zZ0V2ZW50ID0gbmV3IE1lc3NhZ2VFdmVudCgnbWVzc2FnZScsIHsgZGF0YTogZXZ0LmRhdGEgfSk7XG5cdFx0XHR0aGlzLmRpc3BhdGNoRXZlbnQobXNnRXZlbnQpO1xuXHRcdH0pO1xuXG5cdFx0Y2hhbm5lbC5wb3J0MS5zdGFydCgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFXQSxNQUFNLHNCQUFzQixTQUFTLGFBQWEsV0FBbUI7QUFFcEUsUUFBTSxXQUEwQixDQUFDLFVBQXVCO0FBRXZELGVBQVcsb0JBQW9CLFdBQVcsUUFBUTtBQUdsRCxVQUFNLE9BQW1DLE1BQU87QUFJaEQsV0FBTyxpQkFBaUIsWUFBWTtBQUFBLE1BQ25DLGVBQWU7QUFBQSxRQUNkLE1BQU0sTUFBVyxtQkFBeUI7QUFDekMsZUFBSyxZQUFZLE1BQU0saUJBQWlCO0FBQUEsUUFDekM7QUFBQSxNQUNEO0FBQUEsTUFDQSxhQUFhO0FBQUEsUUFDWixNQUFNO0FBQ0wsaUJBQU8sS0FBSztBQUFBLFFBQ2I7QUFBQSxRQUNBLElBQUksT0FBNEI7QUFDL0IsZUFBSyxZQUFZO0FBQUEsUUFDbEI7QUFBQSxNQUNEO0FBQUE7QUFBQSxJQUVELENBQUM7QUFFRCxTQUFLLGlCQUFpQixXQUFXLFNBQU87QUFDdkMsaUJBQVcsY0FBYyxJQUFJLGFBQWEsV0FBVyxFQUFFLE1BQU0sSUFBSSxNQUFNLE9BQU8sSUFBSSxRQUFRLENBQUMsR0FBRyxJQUFJLEtBQUssSUFBSSxPQUFVLENBQUMsQ0FBQztBQUFBLElBQ3hILENBQUM7QUFFRCxTQUFLLE1BQU07QUFJWCxlQUFXLFNBQWMsTUFBTTtBQUFBLE1BQUUsY0FBYztBQUFFLGNBQU0sSUFBSSxVQUFVLDZEQUE2RDtBQUFBLE1BQUc7QUFBQSxJQUFFO0FBR3ZJLGtCQUFjLFNBQVM7QUFBQSxFQUN4QjtBQUVBLGFBQVcsaUJBQWlCLFdBQVcsUUFBUTtBQUNoRCxHQUFHLFNBQVM7QUFHTCxNQUFNLHFCQUFxQixZQUE4QjtBQUFBLEVBUy9ELFlBQVksbUJBQXVDLGFBQTJCLFNBQXlCO0FBQ3RHLFVBQU07QUFSUCxxQkFBbUU7QUFDbkUsMEJBQXdFO0FBQ3hFLG1CQUFrRTtBQVNqRSxVQUFNLFlBQVksS0FBSyxrQkFBa0IsTUFBTSxXQUFXO0FBQzFELFVBQU0sT0FBTyxJQUFJLEtBQUssQ0FBQyxTQUFTLEdBQUcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3JFLFVBQU0sVUFBVSxJQUFJLGdCQUFnQixJQUFJO0FBRXhDLFVBQU0sVUFBVSxJQUFJLGVBQWU7QUFDbkMsVUFBTSxLQUFLO0FBRVgsVUFBTSxNQUF3QjtBQUFBLE1BQzdCLE1BQU07QUFBQSxNQUNOO0FBQUEsTUFDQSxNQUFNLFFBQVE7QUFBQSxNQUNkLEtBQUs7QUFBQSxNQUNMO0FBQUEsSUFDRDtBQUNBLHNCQUFrQixLQUFLLENBQUMsUUFBUSxLQUFLLENBQUM7QUFHdEMsU0FBSyxjQUFjLFFBQVEsTUFBTSxZQUFZLEtBQUssUUFBUSxLQUFLO0FBQy9ELFNBQUssWUFBWSxNQUFNO0FBQ3RCLFlBQU1BLE9BQThCO0FBQUEsUUFDbkMsTUFBTTtBQUFBLFFBQ047QUFBQSxNQUNEO0FBQ0Esd0JBQWtCQSxJQUFHO0FBQ3JCLFVBQUksZ0JBQWdCLE9BQU87QUFFM0IsY0FBUSxNQUFNLE1BQU07QUFDcEIsY0FBUSxNQUFNLE1BQU07QUFBQSxJQUNyQjtBQUdBLFdBQU8saUJBQWlCLE1BQU07QUFBQSxNQUM3QixhQUFhO0FBQUEsUUFDWixNQUFNO0FBQ0wsaUJBQU8sUUFBUSxNQUFNO0FBQUEsUUFDdEI7QUFBQSxRQUNBLElBQUksT0FBNEI7QUFDL0Isa0JBQVEsTUFBTSxZQUFZO0FBQUEsUUFDM0I7QUFBQSxNQUNEO0FBQUEsTUFDQSxrQkFBa0I7QUFBQSxRQUNqQixNQUFNO0FBQ0wsaUJBQU8sUUFBUSxNQUFNO0FBQUEsUUFDdEI7QUFBQSxRQUNBLElBQUksT0FBNEI7QUFDL0Isa0JBQVEsTUFBTSxpQkFBaUI7QUFBQSxRQUNoQztBQUFBLE1BQ0Q7QUFBQTtBQUFBLElBRUQsQ0FBQztBQUVELFlBQVEsTUFBTSxpQkFBaUIsZ0JBQWdCLFNBQU87QUFDckQsWUFBTSxXQUFXLElBQUksYUFBYSxnQkFBZ0IsRUFBRSxNQUFNLElBQUksS0FBSyxDQUFDO0FBQ3BFLFdBQUssY0FBYyxRQUFRO0FBQUEsSUFDNUIsQ0FBQztBQUVELFlBQVEsTUFBTSxpQkFBaUIsV0FBVyxTQUFPO0FBQ2hELFlBQU0sV0FBVyxJQUFJLGFBQWEsV0FBVyxFQUFFLE1BQU0sSUFBSSxLQUFLLENBQUM7QUFDL0QsV0FBSyxjQUFjLFFBQVE7QUFBQSxJQUM1QixDQUFDO0FBRUQsWUFBUSxNQUFNLE1BQU07QUFBQSxFQUNyQjtBQUNEOyIsCiAgIm5hbWVzIjogWyJtc2ciXQp9Cg==
