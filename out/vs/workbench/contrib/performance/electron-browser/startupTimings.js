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
import { timeout } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IUpdateService } from "../../../../platform/update/common/update.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ITimerService } from "../../../services/timer/browser/timerService.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { URI } from "../../../../base/common/uri.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { StartupTimings } from "../browser/startupTimings.js";
import { coalesce } from "../../../../base/common/arrays.js";
let NativeStartupTimings = class extends StartupTimings {
  constructor(_fileService, _timerService, _nativeHostService, editorService, paneCompositeService, _telemetryService, lifecycleService, updateService, _environmentService, _productService, workspaceTrustService) {
    super(editorService, paneCompositeService, lifecycleService, updateService, workspaceTrustService);
    this._fileService = _fileService;
    this._timerService = _timerService;
    this._nativeHostService = _nativeHostService;
    this._telemetryService = _telemetryService;
    this._environmentService = _environmentService;
    this._productService = _productService;
    this._report().catch(onUnexpectedError);
  }
  async _report() {
    const standardStartupError = await this._isStandardStartup();
    this._appendStartupTimes(standardStartupError).catch(onUnexpectedError);
  }
  async _appendStartupTimes(standardStartupError) {
    const appendTo = this._environmentService.args["prof-append-timers"];
    const durationMarkers = this._environmentService.args["prof-duration-markers"];
    const durationMarkersFile = this._environmentService.args["prof-duration-markers-file"];
    if (!appendTo && !durationMarkers) {
      return;
    }
    try {
      await Promise.all([
        this._timerService.whenReady(),
        timeout(15e3)
        // wait: cached data creation, telemetry sending
      ]);
      const perfBaseline = await this._timerService.perfBaseline;
      const heapStatistics = await this._resolveStartupHeapStatistics();
      if (heapStatistics) {
        this._telemetryLogHeapStatistics(heapStatistics);
      }
      if (appendTo) {
        const content = coalesce([
          this._timerService.startupMetrics.ellapsed,
          this._productService.nameShort,
          (this._productService.commit || "").slice(0, 10) || "0000000000",
          this._telemetryService.sessionId,
          standardStartupError === void 0 ? "standard_start" : `NO_standard_start : ${standardStartupError}`,
          `${String(perfBaseline).padStart(4, "0")}ms`,
          heapStatistics ? this._printStartupHeapStatistics(heapStatistics) : void 0
        ]).join("	") + "\n";
        await this._appendContent(URI.file(appendTo), content);
      }
      if (durationMarkers?.length) {
        const durations = [];
        for (const durationMarker of durationMarkers) {
          let duration = 0;
          if (durationMarker === "ellapsed") {
            duration = this._timerService.startupMetrics.ellapsed;
          } else if (durationMarker.indexOf("-") !== -1) {
            const markers = durationMarker.split("-");
            if (markers.length === 2) {
              duration = this._timerService.getDuration(markers[0], markers[1]);
            }
          }
          if (duration) {
            durations.push(durationMarker);
            durations.push(`${duration}`);
          }
        }
        const durationsContent = `${durations.join("	")}
`;
        if (durationMarkersFile) {
          await this._appendContent(URI.file(durationMarkersFile), durationsContent);
        } else {
          console.log(durationsContent);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      this._nativeHostService.exit(0);
    }
  }
  async _isStandardStartup() {
    const windowCount = await this._nativeHostService.getWindowCount();
    if (windowCount !== 1) {
      return `Expected window count : 1, Actual : ${windowCount}`;
    }
    return super._isStandardStartup();
  }
  async _appendContent(file, content) {
    const chunks = [];
    if (await this._fileService.exists(file)) {
      chunks.push((await this._fileService.readFile(file)).value);
    }
    chunks.push(VSBuffer.fromString(content));
    await this._fileService.writeFile(file, VSBuffer.concat(chunks));
  }
  async _resolveStartupHeapStatistics() {
    if (!this._environmentService.args["enable-tracing"] || !this._environmentService.args["trace-startup-file"] || this._environmentService.args["trace-startup-format"] !== "json" || !this._environmentService.args["trace-startup-duration"]) {
      return void 0;
    }
    const windowProcessId = await this._nativeHostService.getProcessId();
    const used = performance.memory?.usedJSHeapSize ?? 0;
    let minorGCs = 0;
    let majorGCs = 0;
    let garbage = 0;
    let duration = 0;
    try {
      const traceContents = JSON.parse((await this._fileService.readFile(URI.file(this._environmentService.args["trace-startup-file"]))).value.toString());
      for (const event of traceContents.traceEvents) {
        if (event.pid !== windowProcessId) {
          continue;
        }
        switch (event.name) {
          // Major/Minor GC Events
          case "MinorGC":
            minorGCs++;
            break;
          case "MajorGC":
            majorGCs++;
            break;
          // GC Events that block the main thread
          // Refs: https://v8.dev/blog/trash-talk
          case "V8.GCFinalizeMC":
          case "V8.GCScavenger":
            duration += event.dur;
            break;
        }
        if (event.name === "MajorGC" || event.name === "MinorGC") {
          if (typeof event.args?.usedHeapSizeAfter === "number" && typeof event.args.usedHeapSizeBefore === "number") {
            garbage += event.args.usedHeapSizeBefore - event.args.usedHeapSizeAfter;
          }
        }
      }
      return { minorGCs, majorGCs, used, garbage, duration: Math.round(duration / 1e3) };
    } catch (error) {
      console.error(error);
    }
    return void 0;
  }
  _telemetryLogHeapStatistics({ used, garbage, majorGCs, minorGCs, duration }) {
    this._telemetryService.publicLog2("startupHeapStatistics", {
      heapUsed: used,
      heapGarbage: garbage,
      majorGCs,
      minorGCs,
      gcsDuration: duration
    });
  }
  _printStartupHeapStatistics({ used, garbage, majorGCs, minorGCs, duration }) {
    const MB = 1024 * 1024;
    return `Heap: ${Math.round(used / MB)}MB (used) ${Math.round(garbage / MB)}MB (garbage) ${majorGCs} (MajorGC) ${minorGCs} (MinorGC) ${duration}ms (GC duration)`;
  }
};
NativeStartupTimings = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, ITimerService),
  __decorateParam(2, INativeHostService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IPaneCompositePartService),
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, ILifecycleService),
  __decorateParam(7, IUpdateService),
  __decorateParam(8, INativeWorkbenchEnvironmentService),
  __decorateParam(9, IProductService),
  __decorateParam(10, IWorkspaceTrustManagementService)
], NativeStartupTimings);
export {
  NativeStartupTimings
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3BlcmZvcm1hbmNlL2VsZWN0cm9uLWJyb3dzZXIvc3RhcnR1cFRpbWluZ3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9lbGVjdHJvbi1icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2xpZmVjeWNsZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSVVwZGF0ZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cGRhdGUvY29tbW9uL3VwZGF0ZS5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGltZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGltZXIvYnJvd3Nlci90aW1lclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlVHJ1c3QuanMnO1xuaW1wb3J0IHsgSVBhbmVDb21wb3NpdGVQYXJ0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3BhbmVjb21wb3NpdGUvYnJvd3Nlci9wYW5lY29tcG9zaXRlLmpzJztcbmltcG9ydCB7IFN0YXJ0dXBUaW1pbmdzIH0gZnJvbSAnLi4vYnJvd3Nlci9zdGFydHVwVGltaW5ncy5qcyc7XG5pbXBvcnQgeyBjb2FsZXNjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5cbmludGVyZmFjZSBJVHJhY2luZ0RhdGEge1xuXHRyZWFkb25seSBhcmdzPzoge1xuXHRcdHJlYWRvbmx5IHVzZWRIZWFwU2l6ZUFmdGVyPzogbnVtYmVyO1xuXHRcdHJlYWRvbmx5IHVzZWRIZWFwU2l6ZUJlZm9yZT86IG51bWJlcjtcblx0fTtcblx0cmVhZG9ubHkgZHVyOiBudW1iZXI7IFx0Ly8gaW4gbWljcm9zZWNvbmRzXG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcdC8vIGUuZy4gTWlub3JHQyBvciBNYWpvckdDXG5cdHJlYWRvbmx5IHBpZDogbnVtYmVyO1xufVxuXG5pbnRlcmZhY2UgSUhlYXBTdGF0aXN0aWNzIHtcblx0cmVhZG9ubHkgdXNlZDogbnVtYmVyO1xuXHRyZWFkb25seSBnYXJiYWdlOiBudW1iZXI7XG5cdHJlYWRvbmx5IG1ham9yR0NzOiBudW1iZXI7XG5cdHJlYWRvbmx5IG1pbm9yR0NzOiBudW1iZXI7XG5cdHJlYWRvbmx5IGR1cmF0aW9uOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBOYXRpdmVTdGFydHVwVGltaW5ncyBleHRlbmRzIFN0YXJ0dXBUaW1pbmdzIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJVGltZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RpbWVyU2VydmljZTogSVRpbWVyU2VydmljZSxcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25hdGl2ZUhvc3RTZXJ2aWNlOiBJTmF0aXZlSG9zdFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIHBhbmVDb21wb3NpdGVTZXJ2aWNlOiBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUxpZmVjeWNsZVNlcnZpY2UgbGlmZWN5Y2xlU2VydmljZTogSUxpZmVjeWNsZVNlcnZpY2UsXG5cdFx0QElVcGRhdGVTZXJ2aWNlIHVwZGF0ZVNlcnZpY2U6IElVcGRhdGVTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Byb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIHdvcmtzcGFjZVRydXN0U2VydmljZTogSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoZWRpdG9yU2VydmljZSwgcGFuZUNvbXBvc2l0ZVNlcnZpY2UsIGxpZmVjeWNsZVNlcnZpY2UsIHVwZGF0ZVNlcnZpY2UsIHdvcmtzcGFjZVRydXN0U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZXBvcnQoKS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXBvcnQoKSB7XG5cdFx0Y29uc3Qgc3RhbmRhcmRTdGFydHVwRXJyb3IgPSBhd2FpdCB0aGlzLl9pc1N0YW5kYXJkU3RhcnR1cCgpO1xuXHRcdHRoaXMuX2FwcGVuZFN0YXJ0dXBUaW1lcyhzdGFuZGFyZFN0YXJ0dXBFcnJvcikuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYXBwZW5kU3RhcnR1cFRpbWVzKHN0YW5kYXJkU3RhcnR1cEVycm9yOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRjb25zdCBhcHBlbmRUbyA9IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzWydwcm9mLWFwcGVuZC10aW1lcnMnXTtcblx0XHRjb25zdCBkdXJhdGlvbk1hcmtlcnMgPSB0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1sncHJvZi1kdXJhdGlvbi1tYXJrZXJzJ107XG5cdFx0Y29uc3QgZHVyYXRpb25NYXJrZXJzRmlsZSA9IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzWydwcm9mLWR1cmF0aW9uLW1hcmtlcnMtZmlsZSddO1xuXHRcdGlmICghYXBwZW5kVG8gJiYgIWR1cmF0aW9uTWFya2Vycykge1xuXHRcdFx0Ly8gbm90aGluZyB0byBkb1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHRoaXMuX3RpbWVyU2VydmljZS53aGVuUmVhZHkoKSxcblx0XHRcdFx0dGltZW91dCgxNTAwMCksIC8vIHdhaXQ6IGNhY2hlZCBkYXRhIGNyZWF0aW9uLCB0ZWxlbWV0cnkgc2VuZGluZ1xuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHBlcmZCYXNlbGluZSA9IGF3YWl0IHRoaXMuX3RpbWVyU2VydmljZS5wZXJmQmFzZWxpbmU7XG5cdFx0XHRjb25zdCBoZWFwU3RhdGlzdGljcyA9IGF3YWl0IHRoaXMuX3Jlc29sdmVTdGFydHVwSGVhcFN0YXRpc3RpY3MoKTtcblx0XHRcdGlmIChoZWFwU3RhdGlzdGljcykge1xuXHRcdFx0XHR0aGlzLl90ZWxlbWV0cnlMb2dIZWFwU3RhdGlzdGljcyhoZWFwU3RhdGlzdGljcyk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhcHBlbmRUbykge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gY29hbGVzY2UoW1xuXHRcdFx0XHRcdHRoaXMuX3RpbWVyU2VydmljZS5zdGFydHVwTWV0cmljcy5lbGxhcHNlZCxcblx0XHRcdFx0XHR0aGlzLl9wcm9kdWN0U2VydmljZS5uYW1lU2hvcnQsXG5cdFx0XHRcdFx0KHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLmNvbW1pdCB8fCAnJykuc2xpY2UoMCwgMTApIHx8ICcwMDAwMDAwMDAwJyxcblx0XHRcdFx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnNlc3Npb25JZCxcblx0XHRcdFx0XHRzdGFuZGFyZFN0YXJ0dXBFcnJvciA9PT0gdW5kZWZpbmVkID8gJ3N0YW5kYXJkX3N0YXJ0JyA6IGBOT19zdGFuZGFyZF9zdGFydCA6ICR7c3RhbmRhcmRTdGFydHVwRXJyb3J9YCxcblx0XHRcdFx0XHRgJHtTdHJpbmcocGVyZkJhc2VsaW5lKS5wYWRTdGFydCg0LCAnMCcpfW1zYCxcblx0XHRcdFx0XHRoZWFwU3RhdGlzdGljcyA/IHRoaXMuX3ByaW50U3RhcnR1cEhlYXBTdGF0aXN0aWNzKGhlYXBTdGF0aXN0aWNzKSA6IHVuZGVmaW5lZFxuXHRcdFx0XHRdKS5qb2luKCdcXHQnKSArICdcXG4nO1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9hcHBlbmRDb250ZW50KFVSSS5maWxlKGFwcGVuZFRvKSwgY29udGVudCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChkdXJhdGlvbk1hcmtlcnM/Lmxlbmd0aCkge1xuXHRcdFx0XHRjb25zdCBkdXJhdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgZHVyYXRpb25NYXJrZXIgb2YgZHVyYXRpb25NYXJrZXJzKSB7XG5cdFx0XHRcdFx0bGV0IGR1cmF0aW9uOiBudW1iZXIgPSAwO1xuXHRcdFx0XHRcdGlmIChkdXJhdGlvbk1hcmtlciA9PT0gJ2VsbGFwc2VkJykge1xuXHRcdFx0XHRcdFx0ZHVyYXRpb24gPSB0aGlzLl90aW1lclNlcnZpY2Uuc3RhcnR1cE1ldHJpY3MuZWxsYXBzZWQ7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChkdXJhdGlvbk1hcmtlci5pbmRleE9mKCctJykgIT09IC0xKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBtYXJrZXJzID0gZHVyYXRpb25NYXJrZXIuc3BsaXQoJy0nKTtcblx0XHRcdFx0XHRcdGlmIChtYXJrZXJzLmxlbmd0aCA9PT0gMikge1xuXHRcdFx0XHRcdFx0XHRkdXJhdGlvbiA9IHRoaXMuX3RpbWVyU2VydmljZS5nZXREdXJhdGlvbihtYXJrZXJzWzBdLCBtYXJrZXJzWzFdKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGR1cmF0aW9uKSB7XG5cdFx0XHRcdFx0XHRkdXJhdGlvbnMucHVzaChkdXJhdGlvbk1hcmtlcik7XG5cdFx0XHRcdFx0XHRkdXJhdGlvbnMucHVzaChgJHtkdXJhdGlvbn1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBkdXJhdGlvbnNDb250ZW50ID0gYCR7ZHVyYXRpb25zLmpvaW4oJ1xcdCcpfVxcbmA7XG5cdFx0XHRcdGlmIChkdXJhdGlvbk1hcmtlcnNGaWxlKSB7XG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fYXBwZW5kQ29udGVudChVUkkuZmlsZShkdXJhdGlvbk1hcmtlcnNGaWxlKSwgZHVyYXRpb25zQ29udGVudCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc29sZS5sb2coZHVyYXRpb25zQ29udGVudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y29uc29sZS5lcnJvcihlcnIpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9uYXRpdmVIb3N0U2VydmljZS5leGl0KDApO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhc3luYyBfaXNTdGFuZGFyZFN0YXJ0dXAoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB3aW5kb3dDb3VudCA9IGF3YWl0IHRoaXMuX25hdGl2ZUhvc3RTZXJ2aWNlLmdldFdpbmRvd0NvdW50KCk7XG5cdFx0aWYgKHdpbmRvd0NvdW50ICE9PSAxKSB7XG5cdFx0XHRyZXR1cm4gYEV4cGVjdGVkIHdpbmRvdyBjb3VudCA6IDEsIEFjdHVhbCA6ICR7d2luZG93Q291bnR9YDtcblx0XHR9XG5cdFx0cmV0dXJuIHN1cGVyLl9pc1N0YW5kYXJkU3RhcnR1cCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfYXBwZW5kQ29udGVudChmaWxlOiBVUkksIGNvbnRlbnQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNodW5rczogVlNCdWZmZXJbXSA9IFtdO1xuXHRcdGlmIChhd2FpdCB0aGlzLl9maWxlU2VydmljZS5leGlzdHMoZmlsZSkpIHtcblx0XHRcdGNodW5rcy5wdXNoKChhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShmaWxlKSkudmFsdWUpO1xuXHRcdH1cblx0XHRjaHVua3MucHVzaChWU0J1ZmZlci5mcm9tU3RyaW5nKGNvbnRlbnQpKTtcblx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS53cml0ZUZpbGUoZmlsZSwgVlNCdWZmZXIuY29uY2F0KGNodW5rcykpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVN0YXJ0dXBIZWFwU3RhdGlzdGljcygpOiBQcm9taXNlPElIZWFwU3RhdGlzdGljcyB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmIChcblx0XHRcdCF0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1snZW5hYmxlLXRyYWNpbmcnXSB8fFxuXHRcdFx0IXRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzWyd0cmFjZS1zdGFydHVwLWZpbGUnXSB8fFxuXHRcdFx0dGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ3RyYWNlLXN0YXJ0dXAtZm9ybWF0J10gIT09ICdqc29uJyB8fFxuXHRcdFx0IXRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzWyd0cmFjZS1zdGFydHVwLWR1cmF0aW9uJ11cblx0XHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7IC8vIHVuZXhwZWN0ZWQgYXJndW1lbnRzIGZvciBzdGFydHVwIGhlYXAgc3RhdGlzdGljc1xuXHRcdH1cblxuXHRcdGNvbnN0IHdpbmRvd1Byb2Nlc3NJZCA9IGF3YWl0IHRoaXMuX25hdGl2ZUhvc3RTZXJ2aWNlLmdldFByb2Nlc3NJZCgpO1xuXHRcdGNvbnN0IHVzZWQgPSAocGVyZm9ybWFuY2UgYXMgdW5rbm93biBhcyB7IG1lbW9yeT86IHsgdXNlZEpTSGVhcFNpemU/OiBudW1iZXIgfSB9KS5tZW1vcnk/LnVzZWRKU0hlYXBTaXplID8/IDA7IC8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0FQSS9QZXJmb3JtYW5jZS9tZW1vcnlcblxuXHRcdGxldCBtaW5vckdDcyA9IDA7XG5cdFx0bGV0IG1ham9yR0NzID0gMDtcblx0XHRsZXQgZ2FyYmFnZSA9IDA7XG5cdFx0bGV0IGR1cmF0aW9uID0gMDtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB0cmFjZUNvbnRlbnRzOiB7IHRyYWNlRXZlbnRzOiBJVHJhY2luZ0RhdGFbXSB9ID0gSlNPTi5wYXJzZSgoYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmZpbGUodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ3RyYWNlLXN0YXJ0dXAtZmlsZSddKSkpLnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdFx0Zm9yIChjb25zdCBldmVudCBvZiB0cmFjZUNvbnRlbnRzLnRyYWNlRXZlbnRzKSB7XG5cdFx0XHRcdGlmIChldmVudC5waWQgIT09IHdpbmRvd1Byb2Nlc3NJZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0c3dpdGNoIChldmVudC5uYW1lKSB7XG5cblx0XHRcdFx0XHQvLyBNYWpvci9NaW5vciBHQyBFdmVudHNcblx0XHRcdFx0XHRjYXNlICdNaW5vckdDJzpcblx0XHRcdFx0XHRcdG1pbm9yR0NzKys7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRjYXNlICdNYWpvckdDJzpcblx0XHRcdFx0XHRcdG1ham9yR0NzKys7XG5cdFx0XHRcdFx0XHRicmVhaztcblxuXHRcdFx0XHRcdC8vIEdDIEV2ZW50cyB0aGF0IGJsb2NrIHRoZSBtYWluIHRocmVhZFxuXHRcdFx0XHRcdC8vIFJlZnM6IGh0dHBzOi8vdjguZGV2L2Jsb2cvdHJhc2gtdGFsa1xuXHRcdFx0XHRcdGNhc2UgJ1Y4LkdDRmluYWxpemVNQyc6XG5cdFx0XHRcdFx0Y2FzZSAnVjguR0NTY2F2ZW5nZXInOlxuXHRcdFx0XHRcdFx0ZHVyYXRpb24gKz0gZXZlbnQuZHVyO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZXZlbnQubmFtZSA9PT0gJ01ham9yR0MnIHx8IGV2ZW50Lm5hbWUgPT09ICdNaW5vckdDJykge1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgZXZlbnQuYXJncz8udXNlZEhlYXBTaXplQWZ0ZXIgPT09ICdudW1iZXInICYmIHR5cGVvZiBldmVudC5hcmdzLnVzZWRIZWFwU2l6ZUJlZm9yZSA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRcdGdhcmJhZ2UgKz0gKGV2ZW50LmFyZ3MudXNlZEhlYXBTaXplQmVmb3JlIC0gZXZlbnQuYXJncy51c2VkSGVhcFNpemVBZnRlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7IG1pbm9yR0NzLCBtYWpvckdDcywgdXNlZCwgZ2FyYmFnZSwgZHVyYXRpb246IE1hdGgucm91bmQoZHVyYXRpb24gLyAxMDAwKSB9O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGVycm9yKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfdGVsZW1ldHJ5TG9nSGVhcFN0YXRpc3RpY3MoeyB1c2VkLCBnYXJiYWdlLCBtYWpvckdDcywgbWlub3JHQ3MsIGR1cmF0aW9uIH06IElIZWFwU3RhdGlzdGljcyk6IHZvaWQge1xuXHRcdHR5cGUgU3RhcnR1cEhlYXBTdGF0aXN0aWNzQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ2JwYXNlcm8nO1xuXHRcdFx0Y29tbWVudDogJ0FuIGV2ZW50IHRoYXQgcmVwb3J0cyBzdGFydHVwIGhlYXAgc3RhdGlzdGljcyBmb3IgcGVyZm9ybWFuY2UgYW5hbHlzaXMuJztcblx0XHRcdGhlYXBVc2VkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVXNlZCBoZWFwJyB9O1xuXHRcdFx0aGVhcEdhcmJhZ2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdHYXJiYWdlIGhlYXAnIH07XG5cdFx0XHRtYWpvckdDczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ01ham9yIEdDcyBjb3VudCcgfTtcblx0XHRcdG1pbm9yR0NzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnTWlub3IgR0NzIGNvdW50JyB9O1xuXHRcdFx0Z2NzRHVyYXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdHQ3MgZHVyYXRpb24nIH07XG5cdFx0fTtcblx0XHR0eXBlIFN0YXJ0dXBIZWFwU3RhdGlzdGljc0V2ZW50ID0ge1xuXHRcdFx0aGVhcFVzZWQ6IG51bWJlcjtcblx0XHRcdGhlYXBHYXJiYWdlOiBudW1iZXI7XG5cdFx0XHRtYWpvckdDczogbnVtYmVyO1xuXHRcdFx0bWlub3JHQ3M6IG51bWJlcjtcblx0XHRcdGdjc0R1cmF0aW9uOiBudW1iZXI7XG5cdFx0fTtcblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8U3RhcnR1cEhlYXBTdGF0aXN0aWNzRXZlbnQsIFN0YXJ0dXBIZWFwU3RhdGlzdGljc0NsYXNzaWZpY2F0aW9uPignc3RhcnR1cEhlYXBTdGF0aXN0aWNzJywge1xuXHRcdFx0aGVhcFVzZWQ6IHVzZWQsXG5cdFx0XHRoZWFwR2FyYmFnZTogZ2FyYmFnZSxcblx0XHRcdG1ham9yR0NzLFxuXHRcdFx0bWlub3JHQ3MsXG5cdFx0XHRnY3NEdXJhdGlvbjogZHVyYXRpb25cblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3ByaW50U3RhcnR1cEhlYXBTdGF0aXN0aWNzKHsgdXNlZCwgZ2FyYmFnZSwgbWFqb3JHQ3MsIG1pbm9yR0NzLCBkdXJhdGlvbiB9OiBJSGVhcFN0YXRpc3RpY3MpIHtcblx0XHRjb25zdCBNQiA9IDEwMjQgKiAxMDI0O1xuXHRcdHJldHVybiBgSGVhcDogJHtNYXRoLnJvdW5kKHVzZWQgLyBNQil9TUIgKHVzZWQpICR7TWF0aC5yb3VuZChnYXJiYWdlIC8gTUIpfU1CIChnYXJiYWdlKSAke21ham9yR0NzfSAoTWFqb3JHQykgJHttaW5vckdDc30gKE1pbm9yR0MpICR7ZHVyYXRpb259bXMgKEdDIGR1cmF0aW9uKWA7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxlQUFlO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMENBQTBDO0FBQ25ELFNB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
