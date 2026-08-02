import { TimeoutTimer } from "../../../../base/common/async.js";
import { killTree } from "../../../../base/node/processes.js";
import { isWindows } from "../../../../base/common/platform.js";
var McpProcessState = /* @__PURE__ */ ((McpProcessState2) => {
  McpProcessState2[McpProcessState2["Running"] = 0] = "Running";
  McpProcessState2[McpProcessState2["StdinEnded"] = 1] = "StdinEnded";
  McpProcessState2[McpProcessState2["KilledPolite"] = 2] = "KilledPolite";
  McpProcessState2[McpProcessState2["KilledForceful"] = 3] = "KilledForceful";
  return McpProcessState2;
})(McpProcessState || {});
const _McpStdioStateHandler = class _McpStdioStateHandler {
  constructor(_child, _graceTimeMs = _McpStdioStateHandler.GRACE_TIME_MS) {
    this._child = _child;
    this._graceTimeMs = _graceTimeMs;
    this._procState = 0 /* Running */;
  }
  get stopped() {
    return this._procState !== 0 /* Running */;
  }
  /**
   * Initiates graceful shutdown. If called while shutdown is already in progress,
   * forces immediate termination.
   */
  stop() {
    if (this._procState === 0 /* Running */) {
      let graceTime = this._graceTimeMs;
      try {
        this._child.stdin.end();
      } catch (error) {
        graceTime = 1;
      }
      this._procState = 1 /* StdinEnded */;
      this._nextTimeout = new TimeoutTimer(() => this.killPolite(), graceTime);
    } else {
      this._nextTimeout?.dispose();
      this.killForceful();
    }
  }
  async killPolite() {
    this._procState = 2 /* KilledPolite */;
    this._nextTimeout = new TimeoutTimer(() => this.killForceful(), this._graceTimeMs);
    if (this._child.pid) {
      if (!isWindows) {
        await killTree(this._child.pid, false).catch(() => {
          this._child.kill("SIGTERM");
        });
      }
    } else {
      this._child.kill("SIGTERM");
    }
  }
  async killForceful() {
    this._procState = 3 /* KilledForceful */;
    if (this._child.pid) {
      await killTree(this._child.pid, true).catch(() => {
        this._child.kill("SIGKILL");
      });
    } else {
      this._child.kill();
    }
  }
  write(message) {
    if (!this.stopped) {
      this._child.stdin.write(message + "\n");
    }
  }
  dispose() {
    this._nextTimeout?.dispose();
  }
};
_McpStdioStateHandler.GRACE_TIME_MS = 1e4;
let McpStdioStateHandler = _McpStdioStateHandler;
export {
  McpStdioStateHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9ub2RlL21jcFN0ZGlvU3RhdGVIYW5kbGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgQ2hpbGRQcm9jZXNzV2l0aG91dE51bGxTdHJlYW1zIH0gZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBUaW1lb3V0VGltZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBraWxsVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2Uvbm9kZS9wcm9jZXNzZXMuanMnO1xuaW1wb3J0IHsgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuXG5jb25zdCBlbnVtIE1jcFByb2Nlc3NTdGF0ZSB7XG5cdFJ1bm5pbmcsXG5cdFN0ZGluRW5kZWQsXG5cdEtpbGxlZFBvbGl0ZSxcblx0S2lsbGVkRm9yY2VmdWwsXG59XG5cbi8qKlxuICogTWFuYWdlcyBncmFjZWZ1bCBzaHV0ZG93biBvZiBNQ1Agc3RkaW8gY29ubmVjdGlvbnMgZm9sbG93aW5nIHRoZSBNQ1Agc3BlY2lmaWNhdGlvbi5cbiAqXG4gKiBQZXIgc3BlYywgc2h1dGRvd24gc2hvdWxkOlxuICogMS4gQ2xvc2UgdGhlIGlucHV0IHN0cmVhbSB0byB0aGUgY2hpbGQgcHJvY2Vzc1xuICogMi4gV2FpdCBmb3IgdGhlIHNlcnZlciB0byBleGl0LCBvciBzZW5kIFNJR1RFUk0gaWYgaXQgZG9lc24ndCBleGl0IHdpdGhpbiAxMCBzZWNvbmRzXG4gKiAzLiBTZW5kIFNJR0tJTEwgaWYgdGhlIHNlcnZlciBkb2Vzbid0IGV4aXQgd2l0aGluIDEwIHNlY29uZHMgYWZ0ZXIgU0lHVEVSTVxuICogNC4gQWxsb3cgZm9yY2VmdWwga2lsbGluZyBpZiBjYWxsZWQgdHdpY2VcbiAqL1xuZXhwb3J0IGNsYXNzIE1jcFN0ZGlvU3RhdGVIYW5kbGVyIGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBHUkFDRV9USU1FX01TID0gMTBfMDAwO1xuXG5cdHByaXZhdGUgX3Byb2NTdGF0ZSA9IE1jcFByb2Nlc3NTdGF0ZS5SdW5uaW5nO1xuXHRwcml2YXRlIF9uZXh0VGltZW91dD86IElEaXNwb3NhYmxlO1xuXG5cdHB1YmxpYyBnZXQgc3RvcHBlZCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJvY1N0YXRlICE9PSBNY3BQcm9jZXNzU3RhdGUuUnVubmluZztcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NoaWxkOiBDaGlsZFByb2Nlc3NXaXRob3V0TnVsbFN0cmVhbXMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ3JhY2VUaW1lTXM6IG51bWJlciA9IE1jcFN0ZGlvU3RhdGVIYW5kbGVyLkdSQUNFX1RJTUVfTVNcblx0KSB7IH1cblxuXHQvKipcblx0ICogSW5pdGlhdGVzIGdyYWNlZnVsIHNodXRkb3duLiBJZiBjYWxsZWQgd2hpbGUgc2h1dGRvd24gaXMgYWxyZWFkeSBpbiBwcm9ncmVzcyxcblx0ICogZm9yY2VzIGltbWVkaWF0ZSB0ZXJtaW5hdGlvbi5cblx0ICovXG5cdHB1YmxpYyBzdG9wKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wcm9jU3RhdGUgPT09IE1jcFByb2Nlc3NTdGF0ZS5SdW5uaW5nKSB7XG5cdFx0XHRsZXQgZ3JhY2VUaW1lID0gdGhpcy5fZ3JhY2VUaW1lTXM7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9jaGlsZC5zdGRpbi5lbmQoKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdC8vIElmIHN0ZGluLmVuZCgpIGZhaWxzLCBjb250aW51ZSB3aXRoIHRlcm1pbmF0aW9uIHNlcXVlbmNlXG5cdFx0XHRcdC8vIFRoaXMgY2FuIGhhcHBlbiBpZiB0aGUgc3RyZWFtIGlzIGFscmVhZHkgaW4gYW4gZXJyb3Igc3RhdGVcblx0XHRcdFx0Z3JhY2VUaW1lID0gMTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3Byb2NTdGF0ZSA9IE1jcFByb2Nlc3NTdGF0ZS5TdGRpbkVuZGVkO1xuXHRcdFx0dGhpcy5fbmV4dFRpbWVvdXQgPSBuZXcgVGltZW91dFRpbWVyKCgpID0+IHRoaXMua2lsbFBvbGl0ZSgpLCBncmFjZVRpbWUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9uZXh0VGltZW91dD8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5raWxsRm9yY2VmdWwoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGtpbGxQb2xpdGUoKSB7XG5cdFx0dGhpcy5fcHJvY1N0YXRlID0gTWNwUHJvY2Vzc1N0YXRlLktpbGxlZFBvbGl0ZTtcblx0XHR0aGlzLl9uZXh0VGltZW91dCA9IG5ldyBUaW1lb3V0VGltZXIoKCkgPT4gdGhpcy5raWxsRm9yY2VmdWwoKSwgdGhpcy5fZ3JhY2VUaW1lTXMpO1xuXG5cdFx0aWYgKHRoaXMuX2NoaWxkLnBpZCkge1xuXHRcdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdFx0YXdhaXQga2lsbFRyZWUodGhpcy5fY2hpbGQucGlkLCBmYWxzZSkuY2F0Y2goKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2NoaWxkLmtpbGwoJ1NJR1RFUk0nKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NoaWxkLmtpbGwoJ1NJR1RFUk0nKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGtpbGxGb3JjZWZ1bCgpIHtcblx0XHR0aGlzLl9wcm9jU3RhdGUgPSBNY3BQcm9jZXNzU3RhdGUuS2lsbGVkRm9yY2VmdWw7XG5cblx0XHRpZiAodGhpcy5fY2hpbGQucGlkKSB7XG5cdFx0XHRhd2FpdCBraWxsVHJlZSh0aGlzLl9jaGlsZC5waWQsIHRydWUpLmNhdGNoKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fY2hpbGQua2lsbCgnU0lHS0lMTCcpO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NoaWxkLmtpbGwoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgd3JpdGUobWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnN0b3BwZWQpIHtcblx0XHRcdHRoaXMuX2NoaWxkLnN0ZGluLndyaXRlKG1lc3NhZ2UgKyAnXFxuJyk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5fbmV4dFRpbWVvdXQ/LmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxpQkFBaUI7QUFFMUIsSUFBVyxrQkFBWCxrQkFBV0EscUJBQVg7QUFDQyxFQUFBQSxrQ0FBQTtBQUNBLEVBQUFBLGtDQUFBO0FBQ0EsRUFBQUEsa0NBQUE7QUFDQSxFQUFBQSxrQ0FBQTtBQUpVLFNBQUFBO0FBQUEsR0FBQTtBQWdCSixNQUFNLHdCQUFOLE1BQU0sc0JBQTRDO0FBQUEsRUFVeEQsWUFDa0IsUUFDQSxlQUF1QixzQkFBcUIsZUFDNUQ7QUFGZ0I7QUFDQTtBQVRsQixTQUFRLGFBQWE7QUFBQSxFQVVqQjtBQUFBLEVBUEosSUFBVyxVQUFVO0FBQ3BCLFdBQU8sS0FBSyxlQUFlO0FBQUEsRUFDNUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBV08sT0FBYTtBQUNuQixRQUFJLEtBQUssZUFBZSxpQkFBeUI7QUFDaEQsVUFBSSxZQUFZLEtBQUs7QUFDckIsVUFBSTtBQUNILGFBQUssT0FBTyxNQUFNLElBQUk7QUFBQSxNQUN2QixTQUFTLE9BQU87QUFHZixvQkFBWTtBQUFBLE1BQ2I7QUFDQSxXQUFLLGFBQWE7QUFDbEIsV0FBSyxlQUFlLElBQUksYUFBYSxNQUFNLEtBQUssV0FBVyxHQUFHLFNBQVM7QUFBQSxJQUN4RSxPQUFPO0FBQ04sV0FBSyxjQUFjLFFBQVE7QUFDM0IsV0FBSyxhQUFhO0FBQUEsSUFDbkI7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFjLGFBQWE7QUFDMUIsU0FBSyxhQUFhO0FBQ2xCLFNBQUssZUFBZSxJQUFJLGFBQWEsTUFBTSxLQUFLLGFBQWEsR0FBRyxLQUFLLFlBQVk7QUFFakYsUUFBSSxLQUFLLE9BQU8sS0FBSztBQUNwQixVQUFJLENBQUMsV0FBVztBQUNmLGNBQU0sU0FBUyxLQUFLLE9BQU8sS0FBSyxLQUFLLEVBQUUsTUFBTSxNQUFNO0FBQ2xELGVBQUssT0FBTyxLQUFLLFNBQVM7QUFBQSxRQUMzQixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsT0FBTztBQUNOLFdBQUssT0FBTyxLQUFLLFNBQVM7QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsZUFBZTtBQUM1QixTQUFLLGFBQWE7QUFFbEIsUUFBSSxLQUFLLE9BQU8sS0FBSztBQUNwQixZQUFNLFNBQVMsS0FBSyxPQUFPLEtBQUssSUFBSSxFQUFFLE1BQU0sTUFBTTtBQUNqRCxhQUFLLE9BQU8sS0FBSyxTQUFTO0FBQUEsTUFDM0IsQ0FBQztBQUFBLElBQ0YsT0FBTztBQUNOLFdBQUssT0FBTyxLQUFLO0FBQUEsSUFDbEI7QUFBQSxFQUNEO0FBQUEsRUFFTyxNQUFNLFNBQXVCO0FBQ25DLFFBQUksQ0FBQyxLQUFLLFNBQVM7QUFDbEIsV0FBSyxPQUFPLE1BQU0sTUFBTSxVQUFVLElBQUk7QUFBQSxJQUN2QztBQUFBLEVBQ0Q7QUFBQSxFQUVPLFVBQVU7QUFDaEIsU0FBSyxjQUFjLFFBQVE7QUFBQSxFQUM1QjtBQUNEO0FBekVhLHNCQUNZLGdCQUFnQjtBQURsQyxJQUFNLHVCQUFOOyIsCiAgIm5hbWVzIjogWyJNY3BQcm9jZXNzU3RhdGUiXQp9Cg==
