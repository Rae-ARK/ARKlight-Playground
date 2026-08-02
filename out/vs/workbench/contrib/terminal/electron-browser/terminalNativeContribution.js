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
import { ipcRenderer } from "../../../../base/parts/sandbox/electron-browser/globals.js";
import { URI } from "../../../../base/common/uri.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { registerRemoteContributions } from "./terminalRemote.js";
import { IRemoteAgentService } from "../../../services/remote/common/remoteAgentService.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ITerminalService } from "../browser/terminal.js";
import { disposableWindowInterval, getActiveWindow } from "../../../../base/browser/dom.js";
let TerminalNativeContribution = class extends Disposable {
  constructor(_fileService, _terminalService, remoteAgentService, nativeHostService) {
    super();
    this._fileService = _fileService;
    this._terminalService = _terminalService;
    ipcRenderer.on("vscode:openFiles", (_, ...args) => {
      this._onOpenFileRequest(args[0]);
    });
    this._register(nativeHostService.onDidResumeOS(() => this._onOsResume()));
    this._terminalService.setNativeDelegate({
      getWindowCount: () => nativeHostService.getWindowCount()
    });
    const connection = remoteAgentService.getConnection();
    if (connection && connection.remoteAuthority) {
      registerRemoteContributions();
    }
  }
  _onOsResume() {
    for (const instance of this._terminalService.instances) {
      instance.xterm?.forceRedraw();
    }
  }
  async _onOpenFileRequest(request) {
    if (request.termProgram === "vscode" && request.filesToWait) {
      const waitMarkerFileUri = URI.revive(request.filesToWait.waitMarkerFileUri);
      await this._whenFileDeleted(waitMarkerFileUri);
      this._terminalService.activeInstance?.focus();
    }
  }
  _whenFileDeleted(path) {
    return new Promise((resolve) => {
      let running = false;
      const interval = disposableWindowInterval(getActiveWindow(), async () => {
        if (!running) {
          running = true;
          const exists = await this._fileService.exists(path);
          running = false;
          if (!exists) {
            interval.dispose();
            resolve(void 0);
          }
        }
      }, 1e3);
    });
  }
};
TerminalNativeContribution = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, ITerminalService),
  __decorateParam(2, IRemoteAgentService),
  __decorateParam(3, INativeHostService)
], TerminalNativeContribution);
export {
  TerminalNativeContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsL2VsZWN0cm9uLWJyb3dzZXIvdGVybWluYWxOYXRpdmVDb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpcGNSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvcGFydHMvc2FuZGJveC9lbGVjdHJvbi1icm93c2VyL2dsb2JhbHMuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZU9wZW5GaWxlUmVxdWVzdCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dpbmRvdy9jb21tb24vd2luZG93LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJSZW1vdGVDb250cmlidXRpb25zIH0gZnJvbSAnLi90ZXJtaW5hbFJlbW90ZS5qcyc7XG5pbXBvcnQgeyBJUmVtb3RlQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcmVtb3RlL2NvbW1vbi9yZW1vdGVBZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmF0aXZlL2NvbW1vbi9uYXRpdmUuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJVGVybWluYWxTZXJ2aWNlIH0gZnJvbSAnLi4vYnJvd3Nlci90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVdpbmRvd0ludGVydmFsLCBnZXRBY3RpdmVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcblxuZXhwb3J0IGNsYXNzIFRlcm1pbmFsTmF0aXZlQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxTZXJ2aWNlOiBJVGVybWluYWxTZXJ2aWNlLFxuXHRcdEBJUmVtb3RlQWdlbnRTZXJ2aWNlIHJlbW90ZUFnZW50U2VydmljZTogSVJlbW90ZUFnZW50U2VydmljZSxcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIG5hdGl2ZUhvc3RTZXJ2aWNlOiBJTmF0aXZlSG9zdFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGlwY1JlbmRlcmVyLm9uKCd2c2NvZGU6b3BlbkZpbGVzJywgKF86IHVua25vd24sIC4uLmFyZ3M6IHVua25vd25bXSkgPT4geyB0aGlzLl9vbk9wZW5GaWxlUmVxdWVzdChhcmdzWzBdIGFzIElOYXRpdmVPcGVuRmlsZVJlcXVlc3QpOyB9KTtcblx0XHR0aGlzLl9yZWdpc3RlcihuYXRpdmVIb3N0U2VydmljZS5vbkRpZFJlc3VtZU9TKCgpID0+IHRoaXMuX29uT3NSZXN1bWUoKSkpO1xuXG5cdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLnNldE5hdGl2ZURlbGVnYXRlKHtcblx0XHRcdGdldFdpbmRvd0NvdW50OiAoKSA9PiBuYXRpdmVIb3N0U2VydmljZS5nZXRXaW5kb3dDb3VudCgpXG5cdFx0fSk7XG5cblx0XHRjb25zdCBjb25uZWN0aW9uID0gcmVtb3RlQWdlbnRTZXJ2aWNlLmdldENvbm5lY3Rpb24oKTtcblx0XHRpZiAoY29ubmVjdGlvbiAmJiBjb25uZWN0aW9uLnJlbW90ZUF1dGhvcml0eSkge1xuXHRcdFx0cmVnaXN0ZXJSZW1vdGVDb250cmlidXRpb25zKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfb25Pc1Jlc3VtZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGluc3RhbmNlIG9mIHRoaXMuX3Rlcm1pbmFsU2VydmljZS5pbnN0YW5jZXMpIHtcblx0XHRcdGluc3RhbmNlLnh0ZXJtPy5mb3JjZVJlZHJhdygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX29uT3BlbkZpbGVSZXF1ZXN0KHJlcXVlc3Q6IElOYXRpdmVPcGVuRmlsZVJlcXVlc3QpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBpZiB0aGUgcmVxdWVzdCB0byBvcGVuIGZpbGVzIGlzIGNvbWluZyBpbiBmcm9tIHRoZSBpbnRlZ3JhdGVkIHRlcm1pbmFsIChpZGVudGlmaWVkIHRob3VnaFxuXHRcdC8vIHRoZSB0ZXJtUHJvZ3JhbSB2YXJpYWJsZSkgYW5kIHdlIGFyZSBpbnN0cnVjdGVkIHRvIHdhaXQgZm9yIGVkaXRvcnMgY2xvc2UsIHdhaXQgZm9yIHRoZVxuXHRcdC8vIG1hcmtlciBmaWxlIHRvIGdldCBkZWxldGVkIGFuZCB0aGVuIGZvY3VzIGJhY2sgdG8gdGhlIGludGVncmF0ZWQgdGVybWluYWwuXG5cdFx0aWYgKHJlcXVlc3QudGVybVByb2dyYW0gPT09ICd2c2NvZGUnICYmIHJlcXVlc3QuZmlsZXNUb1dhaXQpIHtcblx0XHRcdGNvbnN0IHdhaXRNYXJrZXJGaWxlVXJpID0gVVJJLnJldml2ZShyZXF1ZXN0LmZpbGVzVG9XYWl0LndhaXRNYXJrZXJGaWxlVXJpKTtcblx0XHRcdGF3YWl0IHRoaXMuX3doZW5GaWxlRGVsZXRlZCh3YWl0TWFya2VyRmlsZVVyaSk7XG5cblx0XHRcdC8vIEZvY3VzIGFjdGl2ZSB0ZXJtaW5hbFxuXHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLmFjdGl2ZUluc3RhbmNlPy5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3doZW5GaWxlRGVsZXRlZChwYXRoOiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBDb21wbGV0ZSB3aGVuIHdhaXQgbWFya2VyIGZpbGUgaXMgZGVsZXRlZFxuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGxldCBydW5uaW5nID0gZmFsc2U7XG5cdFx0XHRjb25zdCBpbnRlcnZhbCA9IGRpc3Bvc2FibGVXaW5kb3dJbnRlcnZhbChnZXRBY3RpdmVXaW5kb3coKSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXJ1bm5pbmcpIHtcblx0XHRcdFx0XHRydW5uaW5nID0gdHJ1ZTtcblx0XHRcdFx0XHRjb25zdCBleGlzdHMgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5leGlzdHMocGF0aCk7XG5cdFx0XHRcdFx0cnVubmluZyA9IGZhbHNlO1xuXG5cdFx0XHRcdFx0aWYgKCFleGlzdHMpIHtcblx0XHRcdFx0XHRcdGludGVydmFsLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0sIDEwMDApO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHdCQUF3QjtBQUVqQyxTQUFTLDBCQUEwQix1QkFBdUI7QUFFbkQsSUFBTSw2QkFBTixjQUF5QyxXQUE2QztBQUFBLEVBRzVGLFlBQ2dDLGNBQ0ksa0JBQ2Qsb0JBQ0QsbUJBQ25CO0FBQ0QsVUFBTTtBQUx5QjtBQUNJO0FBTW5DLGdCQUFZLEdBQUcsb0JBQW9CLENBQUMsTUFBZSxTQUFvQjtBQUFFLFdBQUssbUJBQW1CLEtBQUssQ0FBQyxDQUEyQjtBQUFBLElBQUcsQ0FBQztBQUN0SSxTQUFLLFVBQVUsa0JBQWtCLGNBQWMsTUFBTSxLQUFLLFlBQVksQ0FBQyxDQUFDO0FBRXhFLFNBQUssaUJBQWlCLGtCQUFrQjtBQUFBLE1BQ3ZDLGdCQUFnQixNQUFNLGtCQUFrQixlQUFlO0FBQUEsSUFDeEQsQ0FBQztBQUVELFVBQU0sYUFBYSxtQkFBbUIsY0FBYztBQUNwRCxRQUFJLGNBQWMsV0FBVyxpQkFBaUI7QUFDN0Msa0NBQTRCO0FBQUEsSUFDN0I7QUFBQSxFQUNEO0FBQUEsRUFFUSxjQUFvQjtBQUMzQixlQUFXLFlBQVksS0FBSyxpQkFBaUIsV0FBVztBQUN2RCxlQUFTLE9BQU8sWUFBWTtBQUFBLElBQzdCO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxtQkFBbUIsU0FBZ0Q7QUFJaEYsUUFBSSxRQUFRLGdCQUFnQixZQUFZLFFBQVEsYUFBYTtBQUM1RCxZQUFNLG9CQUFvQixJQUFJLE9BQU8sUUFBUSxZQUFZLGlCQUFpQjtBQUMxRSxZQUFNLEtBQUssaUJBQWlCLGlCQUFpQjtBQUc3QyxXQUFLLGlCQUFpQixnQkFBZ0IsTUFBTTtBQUFBLElBQzdDO0FBQUEsRUFDRDtBQUFBLEVBRVEsaUJBQWlCLE1BQTBCO0FBRWxELFdBQU8sSUFBSSxRQUFjLGFBQVc7QUFDbkMsVUFBSSxVQUFVO0FBQ2QsWUFBTSxXQUFXLHlCQUF5QixnQkFBZ0IsR0FBRyxZQUFZO0FBQ3hFLFlBQUksQ0FBQyxTQUFTO0FBQ2Isb0JBQVU7QUFDVixnQkFBTSxTQUFTLE1BQU0sS0FBSyxhQUFhLE9BQU8sSUFBSTtBQUNsRCxvQkFBVTtBQUVWLGNBQUksQ0FBQyxRQUFRO0FBQ1oscUJBQVMsUUFBUTtBQUNqQixvQkFBUSxNQUFTO0FBQUEsVUFDbEI7QUFBQSxRQUNEO0FBQUEsTUFDRCxHQUFHLEdBQUk7QUFBQSxJQUNSLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUE3RGEsNkJBQU47QUFBQSxFQUlKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FQVTsiLAogICJuYW1lcyI6IFtdCn0K
