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
import { timeout } from "../../../base/common/async.js";
import { ILogService } from "../../log/common/log.js";
let WindowProfiler = class {
  constructor(_window, _sessionId, _logService) {
    this._window = _window;
    this._sessionId = _sessionId;
    this._logService = _logService;
  }
  async inspect(duration) {
    await this._connect();
    const inspector = this._window.webContents.debugger;
    await inspector.sendCommand("Profiler.start");
    this._logService.warn("[perf] profiling STARTED", this._sessionId);
    await timeout(duration);
    const data = await inspector.sendCommand("Profiler.stop");
    this._logService.warn("[perf] profiling DONE", this._sessionId);
    await this._disconnect();
    return data.profile;
  }
  async _connect() {
    const inspector = this._window.webContents.debugger;
    inspector.attach();
    await inspector.sendCommand("Profiler.enable");
  }
  async _disconnect() {
    const inspector = this._window.webContents.debugger;
    await inspector.sendCommand("Profiler.disable");
    inspector.detach();
  }
};
WindowProfiler = __decorateClass([
  __decorateParam(2, ILogService)
], WindowProfiler);
export {
  WindowProfiler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3Byb2ZpbGluZy9lbGVjdHJvbi1tYWluL3dpbmRvd1Byb2ZpbGluZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFByb2ZpbGVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcHJvZmlsaW5nLmpzJztcbmltcG9ydCB7IEJyb3dzZXJXaW5kb3cgfSBmcm9tICdlbGVjdHJvbic7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVjhQcm9maWxlIH0gZnJvbSAnLi4vY29tbW9uL3Byb2ZpbGluZy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBXaW5kb3dQcm9maWxlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfd2luZG93OiBCcm93c2VyV2luZG93LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25JZDogc3RyaW5nLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBpbnNwZWN0KGR1cmF0aW9uOiBudW1iZXIpOiBQcm9taXNlPElWOFByb2ZpbGU+IHtcblxuXHRcdGF3YWl0IHRoaXMuX2Nvbm5lY3QoKTtcblxuXHRcdGNvbnN0IGluc3BlY3RvciA9IHRoaXMuX3dpbmRvdy53ZWJDb250ZW50cy5kZWJ1Z2dlcjtcblx0XHRhd2FpdCBpbnNwZWN0b3Iuc2VuZENvbW1hbmQoJ1Byb2ZpbGVyLnN0YXJ0Jyk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKCdbcGVyZl0gcHJvZmlsaW5nIFNUQVJURUQnLCB0aGlzLl9zZXNzaW9uSWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoZHVyYXRpb24pO1xuXHRcdGNvbnN0IGRhdGE6IFByb2ZpbGVSZXN1bHQgPSBhd2FpdCBpbnNwZWN0b3Iuc2VuZENvbW1hbmQoJ1Byb2ZpbGVyLnN0b3AnKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oJ1twZXJmXSBwcm9maWxpbmcgRE9ORScsIHRoaXMuX3Nlc3Npb25JZCk7XG5cblx0XHRhd2FpdCB0aGlzLl9kaXNjb25uZWN0KCk7XG5cdFx0cmV0dXJuIGRhdGEucHJvZmlsZTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2Nvbm5lY3QoKSB7XG5cdFx0Y29uc3QgaW5zcGVjdG9yID0gdGhpcy5fd2luZG93LndlYkNvbnRlbnRzLmRlYnVnZ2VyO1xuXHRcdGluc3BlY3Rvci5hdHRhY2goKTtcblx0XHRhd2FpdCBpbnNwZWN0b3Iuc2VuZENvbW1hbmQoJ1Byb2ZpbGVyLmVuYWJsZScpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZGlzY29ubmVjdCgpIHtcblx0XHRjb25zdCBpbnNwZWN0b3IgPSB0aGlzLl93aW5kb3cud2ViQ29udGVudHMuZGVidWdnZXI7XG5cdFx0YXdhaXQgaW5zcGVjdG9yLnNlbmRDb21tYW5kKCdQcm9maWxlci5kaXNhYmxlJyk7XG5cdFx0aW5zcGVjdG9yLmRldGFjaCgpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU9BLFNBQVMsZUFBZTtBQUN4QixTQUFTLG1CQUFtQjtBQUdyQixJQUFNLGlCQUFOLE1BQXFCO0FBQUEsRUFFM0IsWUFDa0IsU0FDQSxZQUNhLGFBQzdCO0FBSGdCO0FBQ0E7QUFDYTtBQUFBLEVBQzNCO0FBQUEsRUFFSixNQUFNLFFBQVEsVUFBdUM7QUFFcEQsVUFBTSxLQUFLLFNBQVM7QUFFcEIsVUFBTSxZQUFZLEtBQUssUUFBUSxZQUFZO0FBQzNDLFVBQU0sVUFBVSxZQUFZLGdCQUFnQjtBQUM1QyxTQUFLLFlBQVksS0FBSyw0QkFBNEIsS0FBSyxVQUFVO0FBQ2pFLFVBQU0sUUFBUSxRQUFRO0FBQ3RCLFVBQU0sT0FBc0IsTUFBTSxVQUFVLFlBQVksZUFBZTtBQUN2RSxTQUFLLFlBQVksS0FBSyx5QkFBeUIsS0FBSyxVQUFVO0FBRTlELFVBQU0sS0FBSyxZQUFZO0FBQ3ZCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLE1BQWMsV0FBVztBQUN4QixVQUFNLFlBQVksS0FBSyxRQUFRLFlBQVk7QUFDM0MsY0FBVSxPQUFPO0FBQ2pCLFVBQU0sVUFBVSxZQUFZLGlCQUFpQjtBQUFBLEVBQzlDO0FBQUEsRUFFQSxNQUFjLGNBQWM7QUFDM0IsVUFBTSxZQUFZLEtBQUssUUFBUSxZQUFZO0FBQzNDLFVBQU0sVUFBVSxZQUFZLGtCQUFrQjtBQUM5QyxjQUFVLE9BQU87QUFBQSxFQUNsQjtBQUNEO0FBbENhLGlCQUFOO0FBQUEsRUFLSjtBQUFBLEdBTFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
