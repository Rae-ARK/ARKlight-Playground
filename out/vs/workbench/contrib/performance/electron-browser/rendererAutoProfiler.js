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
import { VSBuffer } from "../../../../base/common/buffer.js";
import { joinPath } from "../../../../base/common/resources.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IProfileAnalysisWorkerService, ProfilingOutput } from "../../../../platform/profiling/electron-browser/profileAnalysisWorkerService.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
import { parseExtensionDevOptions } from "../../../services/extensions/common/extensionDevOptions.js";
import { ITimerService } from "../../../services/timer/browser/timerService.js";
let RendererProfiling = class {
  constructor(_environmentService, _fileService, _logService, nativeHostService, timerService, configService, profileAnalysisService) {
    this._environmentService = _environmentService;
    this._fileService = _fileService;
    this._logService = _logService;
    const devOpts = parseExtensionDevOptions(_environmentService);
    if (devOpts.isExtensionDevTestFromCli) {
      return;
    }
    timerService.perfBaseline.then((perfBaseline) => {
      (_environmentService.isBuilt ? _logService.info : _logService.trace).apply(_logService, [`[perf] Render performance baseline is ${perfBaseline}ms`]);
      if (perfBaseline < 0) {
        return;
      }
      const slowThreshold = perfBaseline * 10;
      const obs = new PerformanceObserver(async (list) => {
        obs.takeRecords();
        const maxDuration = list.getEntries().map((e) => e.duration).reduce((p, c) => Math.max(p, c), 0);
        if (maxDuration < slowThreshold) {
          return;
        }
        if (!configService.getValue("application.experimental.rendererProfiling")) {
          _logService.debug(`[perf] SLOW task detected (${maxDuration}ms) but renderer profiling is disabled via 'application.experimental.rendererProfiling'`);
          return;
        }
        const sessionId = generateUuid();
        _logService.warn(`[perf] Renderer reported VERY LONG TASK (${maxDuration}ms), starting profiling session '${sessionId}'`);
        obs.disconnect();
        for (let i = 0; i < 3; i++) {
          try {
            const profile = await nativeHostService.profileRenderer(sessionId, 5e3);
            const output = await profileAnalysisService.analyseBottomUp(profile, (_url) => "<<renderer>>", perfBaseline, true);
            if (output === ProfilingOutput.Interesting) {
              this._store(profile, sessionId);
              break;
            }
            timeout(15e3);
          } catch (err) {
            _logService.error(err);
            break;
          }
        }
        obs.observe({ entryTypes: ["longtask"] });
      });
      obs.observe({ entryTypes: ["longtask"] });
      this._observer = obs;
    });
  }
  dispose() {
    this._observer?.disconnect();
  }
  async _store(profile, sessionId) {
    const path = joinPath(this._environmentService.tmpDir, `renderer-${Math.random().toString(16).slice(2, 8)}.cpuprofile.json`);
    await this._fileService.writeFile(path, VSBuffer.fromString(JSON.stringify(profile)));
    this._logService.info(`[perf] stored profile to DISK '${path}'`, sessionId);
  }
};
RendererProfiling = __decorateClass([
  __decorateParam(0, INativeWorkbenchEnvironmentService),
  __decorateParam(1, IFileService),
  __decorateParam(2, ILogService),
  __decorateParam(3, INativeHostService),
  __decorateParam(4, ITimerService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IProfileAnalysisWorkerService)
], RendererProfiling);
export {
  RendererProfiling
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3BlcmZvcm1hbmNlL2VsZWN0cm9uLWJyb3dzZXIvcmVuZGVyZXJBdXRvUHJvZmlsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgam9pblBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IElWOFByb2ZpbGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9maWxpbmcvY29tbW9uL3Byb2ZpbGluZy5qcyc7XG5pbXBvcnQgeyBJUHJvZmlsZUFuYWx5c2lzV29ya2VyU2VydmljZSwgUHJvZmlsaW5nT3V0cHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZmlsaW5nL2VsZWN0cm9uLWJyb3dzZXIvcHJvZmlsZUFuYWx5c2lzV29ya2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvZWxlY3Ryb24tYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcGFyc2VFeHRlbnNpb25EZXZPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uRGV2T3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJVGltZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdGltZXIvYnJvd3Nlci90aW1lclNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgUmVuZGVyZXJQcm9maWxpbmcge1xuXG5cdHByaXZhdGUgX29ic2VydmVyPzogUGVyZm9ybWFuY2VPYnNlcnZlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lbnZpcm9ubWVudFNlcnZpY2U6IElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASU5hdGl2ZUhvc3RTZXJ2aWNlIG5hdGl2ZUhvc3RTZXJ2aWNlOiBJTmF0aXZlSG9zdFNlcnZpY2UsXG5cdFx0QElUaW1lclNlcnZpY2UgdGltZXJTZXJ2aWNlOiBJVGltZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlnU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZmlsZUFuYWx5c2lzV29ya2VyU2VydmljZSBwcm9maWxlQW5hbHlzaXNTZXJ2aWNlOiBJUHJvZmlsZUFuYWx5c2lzV29ya2VyU2VydmljZVxuXHQpIHtcblxuXHRcdGNvbnN0IGRldk9wdHMgPSBwYXJzZUV4dGVuc2lvbkRldk9wdGlvbnMoX2Vudmlyb25tZW50U2VydmljZSk7XG5cdFx0aWYgKGRldk9wdHMuaXNFeHRlbnNpb25EZXZUZXN0RnJvbUNsaSkge1xuXHRcdFx0Ly8gZGlzYWJsZWQgd2hlbiBydW5uaW5nIGV4dGVuc2lvbiB0ZXN0c1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRpbWVyU2VydmljZS5wZXJmQmFzZWxpbmUudGhlbihwZXJmQmFzZWxpbmUgPT4ge1xuXHRcdFx0KF9lbnZpcm9ubWVudFNlcnZpY2UuaXNCdWlsdCA/IF9sb2dTZXJ2aWNlLmluZm8gOiBfbG9nU2VydmljZS50cmFjZSkuYXBwbHkoX2xvZ1NlcnZpY2UsIFtgW3BlcmZdIFJlbmRlciBwZXJmb3JtYW5jZSBiYXNlbGluZSBpcyAke3BlcmZCYXNlbGluZX1tc2BdKTtcblxuXHRcdFx0aWYgKHBlcmZCYXNlbGluZSA8IDApIHtcblx0XHRcdFx0Ly8gdG9vIHNsb3dcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTTE9XIHRocmVzaG9sZFxuXHRcdFx0Y29uc3Qgc2xvd1RocmVzaG9sZCA9IHBlcmZCYXNlbGluZSAqIDEwOyAvLyB+MTAgZnJhbWVzIGF0IDY0ZnBzIG9uIE1ZIG1hY2hpbmVcblxuXHRcdFx0Y29uc3Qgb2JzID0gbmV3IFBlcmZvcm1hbmNlT2JzZXJ2ZXIoYXN5bmMgbGlzdCA9PiB7XG5cblx0XHRcdFx0b2JzLnRha2VSZWNvcmRzKCk7XG5cdFx0XHRcdGNvbnN0IG1heER1cmF0aW9uID0gbGlzdC5nZXRFbnRyaWVzKClcblx0XHRcdFx0XHQubWFwKGUgPT4gZS5kdXJhdGlvbilcblx0XHRcdFx0XHQucmVkdWNlKChwLCBjKSA9PiBNYXRoLm1heChwLCBjKSwgMCk7XG5cblx0XHRcdFx0aWYgKG1heER1cmF0aW9uIDwgc2xvd1RocmVzaG9sZCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghY29uZmlnU2VydmljZS5nZXRWYWx1ZSgnYXBwbGljYXRpb24uZXhwZXJpbWVudGFsLnJlbmRlcmVyUHJvZmlsaW5nJykpIHtcblx0XHRcdFx0XHRfbG9nU2VydmljZS5kZWJ1ZyhgW3BlcmZdIFNMT1cgdGFzayBkZXRlY3RlZCAoJHttYXhEdXJhdGlvbn1tcykgYnV0IHJlbmRlcmVyIHByb2ZpbGluZyBpcyBkaXNhYmxlZCB2aWEgJ2FwcGxpY2F0aW9uLmV4cGVyaW1lbnRhbC5yZW5kZXJlclByb2ZpbGluZydgKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzZXNzaW9uSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblxuXHRcdFx0XHRfbG9nU2VydmljZS53YXJuKGBbcGVyZl0gUmVuZGVyZXIgcmVwb3J0ZWQgVkVSWSBMT05HIFRBU0sgKCR7bWF4RHVyYXRpb259bXMpLCBzdGFydGluZyBwcm9maWxpbmcgc2Vzc2lvbiAnJHtzZXNzaW9uSWR9J2ApO1xuXG5cdFx0XHRcdC8vIHBhdXNlIG9ic2VydmF0aW9uLCB3ZSdsbCB0YWtlIGEgZGV0YWlsZWQgbG9va1xuXHRcdFx0XHRvYnMuZGlzY29ubmVjdCgpO1xuXG5cdFx0XHRcdC8vIHByb2ZpbGUgcmVuZGVyZXIgZm9yIDVzZWNzLCBhbmFseXNlLCBhbmQgdGFrZSBhY3Rpb24gZGVwZW5kaW5nIG9uIHRoZSByZXN1bHRcblx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAzOyBpKyspIHtcblxuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRjb25zdCBwcm9maWxlID0gYXdhaXQgbmF0aXZlSG9zdFNlcnZpY2UucHJvZmlsZVJlbmRlcmVyKHNlc3Npb25JZCwgNTAwMCk7XG5cdFx0XHRcdFx0XHRjb25zdCBvdXRwdXQgPSBhd2FpdCBwcm9maWxlQW5hbHlzaXNTZXJ2aWNlLmFuYWx5c2VCb3R0b21VcChwcm9maWxlLCBfdXJsID0+ICc8PHJlbmRlcmVyPj4nLCBwZXJmQmFzZWxpbmUsIHRydWUpO1xuXHRcdFx0XHRcdFx0aWYgKG91dHB1dCA9PT0gUHJvZmlsaW5nT3V0cHV0LkludGVyZXN0aW5nKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3N0b3JlKHByb2ZpbGUsIHNlc3Npb25JZCk7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHR0aW1lb3V0KDE1MDAwKTsgLy8gd2FpdCAxNXNcblxuXHRcdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdFx0X2xvZ1NlcnZpY2UuZXJyb3IoZXJyKTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIHJlY29ubmVjdCB0aGUgb2JzZXJ2ZXJcblx0XHRcdFx0b2JzLm9ic2VydmUoeyBlbnRyeVR5cGVzOiBbJ2xvbmd0YXNrJ10gfSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0b2JzLm9ic2VydmUoeyBlbnRyeVR5cGVzOiBbJ2xvbmd0YXNrJ10gfSk7XG5cdFx0XHR0aGlzLl9vYnNlcnZlciA9IG9icztcblxuXHRcdH0pO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vYnNlcnZlcj8uZGlzY29ubmVjdCgpO1xuXHR9XG5cblxuXHRwcml2YXRlIGFzeW5jIF9zdG9yZShwcm9maWxlOiBJVjhQcm9maWxlLCBzZXNzaW9uSWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBhdGggPSBqb2luUGF0aCh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UudG1wRGlyLCBgcmVuZGVyZXItJHtNYXRoLnJhbmRvbSgpLnRvU3RyaW5nKDE2KS5zbGljZSgyLCA4KX0uY3B1cHJvZmlsZS5qc29uYCk7XG5cdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHBhdGgsIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkocHJvZmlsZSkpKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtwZXJmXSBzdG9yZWQgcHJvZmlsZSB0byBESVNLICcke3BhdGh9J2AsIHNlc3Npb25JZCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsK0JBQStCLHVCQUF1QjtBQUMvRCxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHFCQUFxQjtBQUV2QixJQUFNLG9CQUFOLE1BQXdCO0FBQUEsRUFJOUIsWUFDc0QscUJBQ3RCLGNBQ0QsYUFDVixtQkFDTCxjQUNRLGVBQ1Esd0JBQzlCO0FBUG9EO0FBQ3RCO0FBQ0Q7QUFPOUIsVUFBTSxVQUFVLHlCQUF5QixtQkFBbUI7QUFDNUQsUUFBSSxRQUFRLDJCQUEyQjtBQUV0QztBQUFBLElBQ0Q7QUFFQSxpQkFBYSxhQUFhLEtBQUssa0JBQWdCO0FBQzlDLE9BQUMsb0JBQW9CLFVBQVUsWUFBWSxPQUFPLFlBQVksT0FBTyxNQUFNLGFBQWEsQ0FBQyx5Q0FBeUMsWUFBWSxJQUFJLENBQUM7QUFFbkosVUFBSSxlQUFlLEdBQUc7QUFFckI7QUFBQSxNQUNEO0FBR0EsWUFBTSxnQkFBZ0IsZUFBZTtBQUVyQyxZQUFNLE1BQU0sSUFBSSxvQkFBb0IsT0FBTSxTQUFRO0FBRWpELFlBQUksWUFBWTtBQUNoQixjQUFNLGNBQWMsS0FBSyxXQUFXLEVBQ2xDLElBQUksT0FBSyxFQUFFLFFBQVEsRUFDbkIsT0FBTyxDQUFDLEdBQUcsTUFBTSxLQUFLLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQztBQUVwQyxZQUFJLGNBQWMsZUFBZTtBQUNoQztBQUFBLFFBQ0Q7QUFFQSxZQUFJLENBQUMsY0FBYyxTQUFTLDRDQUE0QyxHQUFHO0FBQzFFLHNCQUFZLE1BQU0sOEJBQThCLFdBQVcseUZBQXlGO0FBQ3BKO0FBQUEsUUFDRDtBQUVBLGNBQU0sWUFBWSxhQUFhO0FBRS9CLG9CQUFZLEtBQUssNENBQTRDLFdBQVcsb0NBQW9DLFNBQVMsR0FBRztBQUd4SCxZQUFJLFdBQVc7QUFHZixpQkFBUyxJQUFJLEdBQUcsSUFBSSxHQUFHLEtBQUs7QUFFM0IsY0FBSTtBQUNILGtCQUFNLFVBQVUsTUFBTSxrQkFBa0IsZ0JBQWdCLFdBQVcsR0FBSTtBQUN2RSxrQkFBTSxTQUFTLE1BQU0sdUJBQXVCLGdCQUFnQixTQUFTLFVBQVEsZ0JBQWdCLGNBQWMsSUFBSTtBQUMvRyxnQkFBSSxXQUFXLGdCQUFnQixhQUFhO0FBQzNDLG1CQUFLLE9BQU8sU0FBUyxTQUFTO0FBQzlCO0FBQUEsWUFDRDtBQUVBLG9CQUFRLElBQUs7QUFBQSxVQUVkLFNBQVMsS0FBSztBQUNiLHdCQUFZLE1BQU0sR0FBRztBQUNyQjtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBR0EsWUFBSSxRQUFRLEVBQUUsWUFBWSxDQUFDLFVBQVUsRUFBRSxDQUFDO0FBQUEsTUFDekMsQ0FBQztBQUVELFVBQUksUUFBUSxFQUFFLFlBQVksQ0FBQyxVQUFVLEVBQUUsQ0FBQztBQUN4QyxXQUFLLFlBQVk7QUFBQSxJQUVsQixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsVUFBZ0I7QUFDZixTQUFLLFdBQVcsV0FBVztBQUFBLEVBQzVCO0FBQUEsRUFHQSxNQUFjLE9BQU8sU0FBcUIsV0FBa0M7QUFDM0UsVUFBTSxPQUFPLFNBQVMsS0FBSyxvQkFBb0IsUUFBUSxZQUFZLEtBQUssT0FBTyxFQUFFLFNBQVMsRUFBRSxFQUFFLE1BQU0sR0FBRyxDQUFDLENBQUMsa0JBQWtCO0FBQzNILFVBQU0sS0FBSyxhQUFhLFVBQVUsTUFBTSxTQUFTLFdBQVcsS0FBSyxVQUFVLE9BQU8sQ0FBQyxDQUFDO0FBQ3BGLFNBQUssWUFBWSxLQUFLLGtDQUFrQyxJQUFJLEtBQUssU0FBUztBQUFBLEVBQzNFO0FBQ0Q7QUE3RmEsb0JBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FYVTsiLAogICJuYW1lcyI6IFtdCn0K
