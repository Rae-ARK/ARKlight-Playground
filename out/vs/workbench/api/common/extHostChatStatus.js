import * as extHostProtocol from "./extHost.protocol.js";
import { ExtensionIdentifier } from "../../../platform/extensions/common/extensions.js";
class ExtHostChatStatus {
  constructor(mainContext) {
    this._items = /* @__PURE__ */ new Map();
    this._proxy = mainContext.getProxy(extHostProtocol.MainContext.MainThreadChatStatus);
  }
  createChatStatusItem(extension, id) {
    const internalId = asChatItemIdentifier(extension.identifier, id);
    if (this._items.has(internalId)) {
      throw new Error(`Chat status item '${id}' already exists`);
    }
    const state = {
      id: internalId,
      title: "",
      description: "",
      detail: "",
      tooltip: void 0
    };
    let disposed = false;
    let visible = false;
    const syncState = () => {
      if (disposed) {
        throw new Error("Chat status item is disposed");
      }
      if (!visible) {
        return;
      }
      this._proxy.$setEntry(id, state);
    };
    const item = Object.freeze({
      id,
      get title() {
        return state.title;
      },
      set title(value) {
        state.title = value;
        syncState();
      },
      get description() {
        return state.description;
      },
      set description(value) {
        state.description = value;
        syncState();
      },
      get detail() {
        return state.detail;
      },
      set detail(value) {
        state.detail = value;
        syncState();
      },
      get tooltip() {
        return state.tooltip;
      },
      set tooltip(value) {
        state.tooltip = value;
        syncState();
      },
      show: () => {
        visible = true;
        syncState();
      },
      hide: () => {
        visible = false;
        this._proxy.$disposeEntry(id);
      },
      dispose: () => {
        disposed = true;
        this._proxy.$disposeEntry(id);
        this._items.delete(internalId);
      }
    });
    this._items.set(internalId, item);
    return item;
  }
}
function asChatItemIdentifier(extension, id) {
  return `${ExtensionIdentifier.toKey(extension)}.${id}`;
}
export {
  ExtHostChatStatus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RDaGF0U3RhdHVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgKiBhcyB2c2NvZGUgZnJvbSAndnNjb2RlJztcbmltcG9ydCAqIGFzIGV4dEhvc3RQcm90b2NvbCBmcm9tICcuL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciwgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBFeHRIb3N0Q2hhdFN0YXR1cyB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IGV4dEhvc3RQcm90b2NvbC5NYWluVGhyZWFkQ2hhdFN0YXR1c1NoYXBlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2l0ZW1zID0gbmV3IE1hcDxzdHJpbmcsIHZzY29kZS5DaGF0U3RhdHVzSXRlbT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRtYWluQ29udGV4dDogZXh0SG9zdFByb3RvY29sLklNYWluQ29udGV4dFxuXHQpIHtcblx0XHR0aGlzLl9wcm94eSA9IG1haW5Db250ZXh0LmdldFByb3h5KGV4dEhvc3RQcm90b2NvbC5NYWluQ29udGV4dC5NYWluVGhyZWFkQ2hhdFN0YXR1cyk7XG5cdH1cblxuXHRjcmVhdGVDaGF0U3RhdHVzSXRlbShleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaWQ6IHN0cmluZyk6IHZzY29kZS5DaGF0U3RhdHVzSXRlbSB7XG5cdFx0Y29uc3QgaW50ZXJuYWxJZCA9IGFzQ2hhdEl0ZW1JZGVudGlmaWVyKGV4dGVuc2lvbi5pZGVudGlmaWVyLCBpZCk7XG5cdFx0aWYgKHRoaXMuX2l0ZW1zLmhhcyhpbnRlcm5hbElkKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDaGF0IHN0YXR1cyBpdGVtICcke2lkfScgYWxyZWFkeSBleGlzdHNgKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0ZTogZXh0SG9zdFByb3RvY29sLkNoYXRTdGF0dXNJdGVtRHRvID0ge1xuXHRcdFx0aWQ6IGludGVybmFsSWQsXG5cdFx0XHR0aXRsZTogJycsXG5cdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0XHRkZXRhaWw6ICcnLFxuXHRcdFx0dG9vbHRpcDogdW5kZWZpbmVkLFxuXHRcdH07XG5cblx0XHRsZXQgZGlzcG9zZWQgPSBmYWxzZTtcblx0XHRsZXQgdmlzaWJsZSA9IGZhbHNlO1xuXHRcdGNvbnN0IHN5bmNTdGF0ZSA9ICgpID0+IHtcblx0XHRcdGlmIChkaXNwb3NlZCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NoYXQgc3RhdHVzIGl0ZW0gaXMgZGlzcG9zZWQnKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF2aXNpYmxlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fcHJveHkuJHNldEVudHJ5KGlkLCBzdGF0ZSk7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGl0ZW0gPSBPYmplY3QuZnJlZXplPHZzY29kZS5DaGF0U3RhdHVzSXRlbT4oe1xuXHRcdFx0aWQ6IGlkLFxuXG5cdFx0XHRnZXQgdGl0bGUoKTogc3RyaW5nIHwgeyBsYWJlbDogc3RyaW5nOyBsaW5rOiBzdHJpbmc7IGhlbHBUZXh0Pzogc3RyaW5nIH0ge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGUudGl0bGU7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHRpdGxlKHZhbHVlOiBzdHJpbmcgfCB7IGxhYmVsOiBzdHJpbmc7IGxpbms6IHN0cmluZzsgaGVscFRleHQ/OiBzdHJpbmcgfSkge1xuXHRcdFx0XHRzdGF0ZS50aXRsZSA9IHZhbHVlO1xuXHRcdFx0XHRzeW5jU3RhdGUoKTtcblx0XHRcdH0sXG5cblx0XHRcdGdldCBkZXNjcmlwdGlvbigpOiBzdHJpbmcge1xuXHRcdFx0XHRyZXR1cm4gc3RhdGUuZGVzY3JpcHRpb247XG5cdFx0XHR9LFxuXHRcdFx0c2V0IGRlc2NyaXB0aW9uKHZhbHVlOiBzdHJpbmcpIHtcblx0XHRcdFx0c3RhdGUuZGVzY3JpcHRpb24gPSB2YWx1ZTtcblx0XHRcdFx0c3luY1N0YXRlKCk7XG5cdFx0XHR9LFxuXG5cdFx0XHRnZXQgZGV0YWlsKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZS5kZXRhaWw7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IGRldGFpbCh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHN0YXRlLmRldGFpbCA9IHZhbHVlO1xuXHRcdFx0XHRzeW5jU3RhdGUoKTtcblx0XHRcdH0sXG5cblx0XHRcdGdldCB0b29sdGlwKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdHJldHVybiBzdGF0ZS50b29sdGlwO1xuXHRcdFx0fSxcblx0XHRcdHNldCB0b29sdGlwKHZhbHVlOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRcdFx0c3RhdGUudG9vbHRpcCA9IHZhbHVlO1xuXHRcdFx0XHRzeW5jU3RhdGUoKTtcblx0XHRcdH0sXG5cblx0XHRcdHNob3c6ICgpID0+IHtcblx0XHRcdFx0dmlzaWJsZSA9IHRydWU7XG5cdFx0XHRcdHN5bmNTdGF0ZSgpO1xuXHRcdFx0fSxcblx0XHRcdGhpZGU6ICgpID0+IHtcblx0XHRcdFx0dmlzaWJsZSA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLl9wcm94eS4kZGlzcG9zZUVudHJ5KGlkKTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGRpc3Bvc2VkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fcHJveHkuJGRpc3Bvc2VFbnRyeShpZCk7XG5cdFx0XHRcdHRoaXMuX2l0ZW1zLmRlbGV0ZShpbnRlcm5hbElkKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHR0aGlzLl9pdGVtcy5zZXQoaW50ZXJuYWxJZCwgaXRlbSk7XG5cdFx0cmV0dXJuIGl0ZW07XG5cdH1cbn1cblxuZnVuY3Rpb24gYXNDaGF0SXRlbUlkZW50aWZpZXIoZXh0ZW5zaW9uOiBFeHRlbnNpb25JZGVudGlmaWVyLCBpZDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGAke0V4dGVuc2lvbklkZW50aWZpZXIudG9LZXkoZXh0ZW5zaW9uKX0uJHtpZH1gO1xufVxuXG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxZQUFZLHFCQUFxQjtBQUNqQyxTQUFTLDJCQUFrRDtBQUVwRCxNQUFNLGtCQUFrQjtBQUFBLEVBTTlCLFlBQ0MsYUFDQztBQUpGLFNBQWlCLFNBQVMsb0JBQUksSUFBbUM7QUFLaEUsU0FBSyxTQUFTLFlBQVksU0FBUyxnQkFBZ0IsWUFBWSxvQkFBb0I7QUFBQSxFQUNwRjtBQUFBLEVBRUEscUJBQXFCLFdBQWtDLElBQW1DO0FBQ3pGLFVBQU0sYUFBYSxxQkFBcUIsVUFBVSxZQUFZLEVBQUU7QUFDaEUsUUFBSSxLQUFLLE9BQU8sSUFBSSxVQUFVLEdBQUc7QUFDaEMsWUFBTSxJQUFJLE1BQU0scUJBQXFCLEVBQUUsa0JBQWtCO0FBQUEsSUFDMUQ7QUFFQSxVQUFNLFFBQTJDO0FBQUEsTUFDaEQsSUFBSTtBQUFBLE1BQ0osT0FBTztBQUFBLE1BQ1AsYUFBYTtBQUFBLE1BQ2IsUUFBUTtBQUFBLE1BQ1IsU0FBUztBQUFBLElBQ1Y7QUFFQSxRQUFJLFdBQVc7QUFDZixRQUFJLFVBQVU7QUFDZCxVQUFNLFlBQVksTUFBTTtBQUN2QixVQUFJLFVBQVU7QUFDYixjQUFNLElBQUksTUFBTSw4QkFBOEI7QUFBQSxNQUMvQztBQUVBLFVBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxNQUNEO0FBRUEsV0FBSyxPQUFPLFVBQVUsSUFBSSxLQUFLO0FBQUEsSUFDaEM7QUFFQSxVQUFNLE9BQU8sT0FBTyxPQUE4QjtBQUFBLE1BQ2pEO0FBQUEsTUFFQSxJQUFJLFFBQXFFO0FBQ3hFLGVBQU8sTUFBTTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLElBQUksTUFBTSxPQUFvRTtBQUM3RSxjQUFNLFFBQVE7QUFDZCxrQkFBVTtBQUFBLE1BQ1g7QUFBQSxNQUVBLElBQUksY0FBc0I7QUFDekIsZUFBTyxNQUFNO0FBQUEsTUFDZDtBQUFBLE1BQ0EsSUFBSSxZQUFZLE9BQWU7QUFDOUIsY0FBTSxjQUFjO0FBQ3BCLGtCQUFVO0FBQUEsTUFDWDtBQUFBLE1BRUEsSUFBSSxTQUE2QjtBQUNoQyxlQUFPLE1BQU07QUFBQSxNQUNkO0FBQUEsTUFDQSxJQUFJLE9BQU8sT0FBMkI7QUFDckMsY0FBTSxTQUFTO0FBQ2Ysa0JBQVU7QUFBQSxNQUNYO0FBQUEsTUFFQSxJQUFJLFVBQThCO0FBQ2pDLGVBQU8sTUFBTTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLElBQUksUUFBUSxPQUEyQjtBQUN0QyxjQUFNLFVBQVU7QUFDaEIsa0JBQVU7QUFBQSxNQUNYO0FBQUEsTUFFQSxNQUFNLE1BQU07QUFDWCxrQkFBVTtBQUNWLGtCQUFVO0FBQUEsTUFDWDtBQUFBLE1BQ0EsTUFBTSxNQUFNO0FBQ1gsa0JBQVU7QUFDVixhQUFLLE9BQU8sY0FBYyxFQUFFO0FBQUEsTUFDN0I7QUFBQSxNQUNBLFNBQVMsTUFBTTtBQUNkLG1CQUFXO0FBQ1gsYUFBSyxPQUFPLGNBQWMsRUFBRTtBQUM1QixhQUFLLE9BQU8sT0FBTyxVQUFVO0FBQUEsTUFDOUI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLE9BQU8sSUFBSSxZQUFZLElBQUk7QUFDaEMsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLFNBQVMscUJBQXFCLFdBQWdDLElBQW9CO0FBQ2pGLFNBQU8sR0FBRyxvQkFBb0IsTUFBTSxTQUFTLENBQUMsSUFBSSxFQUFFO0FBQ3JEOyIsCiAgIm5hbWVzIjogW10KfQo=
