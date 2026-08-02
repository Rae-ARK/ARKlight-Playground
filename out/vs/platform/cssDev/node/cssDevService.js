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
import { spawn } from "child_process";
import { relative } from "../../../base/common/path.js";
import { FileAccess } from "../../../base/common/network.js";
import { rgDiskPath } from "../../../base/node/ripgrep.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
const ICSSDevelopmentService = createDecorator("ICSSDevelopmentService");
let CSSDevelopmentService = class {
  constructor(envService, logService) {
    this.envService = envService;
    this.logService = logService;
  }
  get isEnabled() {
    return !this.envService.isBuilt;
  }
  getCssModules() {
    this._cssModules ??= this.computeCssModules();
    return this._cssModules;
  }
  async computeCssModules() {
    if (!this.isEnabled) {
      return [];
    }
    const rgBinPath = await rgDiskPath();
    return await new Promise((resolve) => {
      const sw = StopWatch.create();
      const chunks = [];
      const basePath = FileAccess.asFileUri("").fsPath;
      const process = spawn(rgBinPath, ["-g", "**/*.css", "--files", "--no-ignore", basePath], {});
      process.stdout.on("data", (data) => {
        chunks.push(data);
      });
      process.on("error", (err) => {
        this.logService.error("[CSS_DEV] FAILED to compute CSS data", err);
        resolve([]);
      });
      process.on("close", () => {
        const data = Buffer.concat(chunks).toString("utf8");
        const result = data.split("\n").filter(Boolean).map((path) => relative(basePath, path).replace(/\\/g, "/")).filter(Boolean).sort();
        if (result.some((path) => path.indexOf("vs/") !== 0)) {
          this.logService.error(`[CSS_DEV] Detected invalid paths in css modules, raw output: ${data}`);
        }
        resolve(result);
        this.logService.info(`[CSS_DEV] DONE, ${result.length} css modules (${Math.round(sw.elapsed())}ms)`);
      });
    });
  }
};
CSSDevelopmentService = __decorateClass([
  __decorateParam(0, IEnvironmentService),
  __decorateParam(1, ILogService)
], CSSDevelopmentService);
export {
  CSSDevelopmentService,
  ICSSDevelopmentService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Nzc0Rldi9ub2RlL2Nzc0RldlNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBzcGF3biB9IGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgcmVsYXRpdmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IEZpbGVBY2Nlc3MgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IHJnRGlza1BhdGggfSBmcm9tICcuLi8uLi8uLi9iYXNlL25vZGUvcmlwZ3JlcC5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuXG5leHBvcnQgY29uc3QgSUNTU0RldmVsb3BtZW50U2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQ1NTRGV2ZWxvcG1lbnRTZXJ2aWNlPignSUNTU0RldmVsb3BtZW50U2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDU1NEZXZlbG9wbWVudFNlcnZpY2Uge1xuXHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdGlzRW5hYmxlZDogYm9vbGVhbjtcblx0Z2V0Q3NzTW9kdWxlcygpOiBQcm9taXNlPHN0cmluZ1tdPjtcbn1cblxuZXhwb3J0IGNsYXNzIENTU0RldmVsb3BtZW50U2VydmljZSBpbXBsZW1lbnRzIElDU1NEZXZlbG9wbWVudFNlcnZpY2Uge1xuXG5cdGRlY2xhcmUgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX2Nzc01vZHVsZXM/OiBQcm9taXNlPHN0cmluZ1tdPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudlNlcnZpY2U6IElFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7IH1cblxuXHRnZXQgaXNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhdGhpcy5lbnZTZXJ2aWNlLmlzQnVpbHQ7XG5cdH1cblxuXHRnZXRDc3NNb2R1bGVzKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHR0aGlzLl9jc3NNb2R1bGVzID8/PSB0aGlzLmNvbXB1dGVDc3NNb2R1bGVzKCk7XG5cdFx0cmV0dXJuIHRoaXMuX2Nzc01vZHVsZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbXB1dGVDc3NNb2R1bGVzKCk6IFByb21pc2U8c3RyaW5nW10+IHtcblx0XHRpZiAoIXRoaXMuaXNFbmFibGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmdCaW5QYXRoID0gYXdhaXQgcmdEaXNrUGF0aCgpO1xuXHRcdHJldHVybiBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmdbXT4oKHJlc29sdmUpID0+IHtcblxuXHRcdFx0Y29uc3Qgc3cgPSBTdG9wV2F0Y2guY3JlYXRlKCk7XG5cblx0XHRcdGNvbnN0IGNodW5rczogQnVmZmVyW10gPSBbXTtcblx0XHRcdGNvbnN0IGJhc2VQYXRoID0gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkoJycpLmZzUGF0aDtcblx0XHRcdGNvbnN0IHByb2Nlc3MgPSBzcGF3bihyZ0JpblBhdGgsIFsnLWcnLCAnKiovKi5jc3MnLCAnLS1maWxlcycsICctLW5vLWlnbm9yZScsIGJhc2VQYXRoXSwge30pO1xuXG5cdFx0XHRwcm9jZXNzLnN0ZG91dC5vbignZGF0YScsIGRhdGEgPT4ge1xuXHRcdFx0XHRjaHVua3MucHVzaChkYXRhKTtcblx0XHRcdH0pO1xuXHRcdFx0cHJvY2Vzcy5vbignZXJyb3InLCBlcnIgPT4ge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ1tDU1NfREVWXSBGQUlMRUQgdG8gY29tcHV0ZSBDU1MgZGF0YScsIGVycik7XG5cdFx0XHRcdHJlc29sdmUoW10pO1xuXHRcdFx0fSk7XG5cdFx0XHRwcm9jZXNzLm9uKCdjbG9zZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZGF0YSA9IEJ1ZmZlci5jb25jYXQoY2h1bmtzKS50b1N0cmluZygndXRmOCcpO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBkYXRhLnNwbGl0KCdcXG4nKS5maWx0ZXIoQm9vbGVhbikubWFwKHBhdGggPT4gcmVsYXRpdmUoYmFzZVBhdGgsIHBhdGgpLnJlcGxhY2UoL1xcXFwvZywgJy8nKSkuZmlsdGVyKEJvb2xlYW4pLnNvcnQoKTtcblx0XHRcdFx0aWYgKHJlc3VsdC5zb21lKHBhdGggPT4gcGF0aC5pbmRleE9mKCd2cy8nKSAhPT0gMCkpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFtDU1NfREVWXSBEZXRlY3RlZCBpbnZhbGlkIHBhdGhzIGluIGNzcyBtb2R1bGVzLCByYXcgb3V0cHV0OiAke2RhdGF9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZShyZXN1bHQpO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgW0NTU19ERVZdIERPTkUsICR7cmVzdWx0Lmxlbmd0aH0gY3NzIG1vZHVsZXMgKCR7TWF0aC5yb3VuZChzdy5lbGFwc2VkKCkpfW1zKWApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CO0FBRXJCLE1BQU0seUJBQXlCLGdCQUF3Qyx3QkFBd0I7QUFRL0YsSUFBTSx3QkFBTixNQUE4RDtBQUFBLEVBTXBFLFlBQ3VDLFlBQ1IsWUFDN0I7QUFGcUM7QUFDUjtBQUFBLEVBQzNCO0FBQUEsRUFFSixJQUFJLFlBQXFCO0FBQ3hCLFdBQU8sQ0FBQyxLQUFLLFdBQVc7QUFBQSxFQUN6QjtBQUFBLEVBRUEsZ0JBQW1DO0FBQ2xDLFNBQUssZ0JBQWdCLEtBQUssa0JBQWtCO0FBQzVDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLE1BQWMsb0JBQXVDO0FBQ3BELFFBQUksQ0FBQyxLQUFLLFdBQVc7QUFDcEIsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUVBLFVBQU0sWUFBWSxNQUFNLFdBQVc7QUFDbkMsV0FBTyxNQUFNLElBQUksUUFBa0IsQ0FBQyxZQUFZO0FBRS9DLFlBQU0sS0FBSyxVQUFVLE9BQU87QUFFNUIsWUFBTSxTQUFtQixDQUFDO0FBQzFCLFlBQU0sV0FBVyxXQUFXLFVBQVUsRUFBRSxFQUFFO0FBQzFDLFlBQU0sVUFBVSxNQUFNLFdBQVcsQ0FBQyxNQUFNLFlBQVksV0FBVyxlQUFlLFFBQVEsR0FBRyxDQUFDLENBQUM7QUFFM0YsY0FBUSxPQUFPLEdBQUcsUUFBUSxVQUFRO0FBQ2pDLGVBQU8sS0FBSyxJQUFJO0FBQUEsTUFDakIsQ0FBQztBQUNELGNBQVEsR0FBRyxTQUFTLFNBQU87QUFDMUIsYUFBSyxXQUFXLE1BQU0sd0NBQXdDLEdBQUc7QUFDakUsZ0JBQVEsQ0FBQyxDQUFDO0FBQUEsTUFDWCxDQUFDO0FBQ0QsY0FBUSxHQUFHLFNBQVMsTUFBTTtBQUN6QixjQUFNLE9BQU8sT0FBTyxPQUFPLE1BQU0sRUFBRSxTQUFTLE1BQU07QUFDbEQsY0FBTSxTQUFTLEtBQUssTUFBTSxJQUFJLEVBQUUsT0FBTyxPQUFPLEVBQUUsSUFBSSxVQUFRLFNBQVMsVUFBVSxJQUFJLEVBQUUsUUFBUSxPQUFPLEdBQUcsQ0FBQyxFQUFFLE9BQU8sT0FBTyxFQUFFLEtBQUs7QUFDL0gsWUFBSSxPQUFPLEtBQUssVUFBUSxLQUFLLFFBQVEsS0FBSyxNQUFNLENBQUMsR0FBRztBQUNuRCxlQUFLLFdBQVcsTUFBTSxnRUFBZ0UsSUFBSSxFQUFFO0FBQUEsUUFDN0Y7QUFDQSxnQkFBUSxNQUFNO0FBQ2QsYUFBSyxXQUFXLEtBQUssbUJBQW1CLE9BQU8sTUFBTSxpQkFBaUIsS0FBSyxNQUFNLEdBQUcsUUFBUSxDQUFDLENBQUMsS0FBSztBQUFBLE1BQ3BHLENBQUM7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNGO0FBQ0Q7QUFwRGEsd0JBQU47QUFBQSxFQU9KO0FBQUEsRUFDQTtBQUFBLEdBUlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
