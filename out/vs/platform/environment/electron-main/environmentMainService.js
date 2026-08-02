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
import { memoize } from "../../../base/common/decorators.js";
import { join } from "../../../base/common/path.js";
import { isLinux } from "../../../base/common/platform.js";
import { createStaticIPCHandle } from "../../../base/parts/ipc/node/ipc.net.js";
import { IEnvironmentService } from "../common/environment.js";
import { NativeEnvironmentService } from "../node/environmentService.js";
import { refineServiceDecorator } from "../../instantiation/common/instantiation.js";
const IEnvironmentMainService = refineServiceDecorator(IEnvironmentService);
class EnvironmentMainService extends NativeEnvironmentService {
  constructor() {
    super(...arguments);
    this._snapEnv = {};
  }
  get backupHome() {
    return join(this.userDataPath, "Backups");
  }
  get mainIPCHandle() {
    return createStaticIPCHandle(this.userDataPath, "main", this.productService.version);
  }
  get mainLockfile() {
    return join(this.userDataPath, "code.lock");
  }
  get disableUpdates() {
    return !!this.args["disable-updates"];
  }
  get isPortable() {
    return !!process.env["VSCODE_PORTABLE"];
  }
  get crossOriginIsolated() {
    return !!this.args["enable-coi"];
  }
  get enableRDPDisplayTracking() {
    return !!this.args["enable-rdp-display-tracking"];
  }
  get codeCachePath() {
    return process.env["VSCODE_CODE_CACHE_PATH"] || void 0;
  }
  get useCodeCache() {
    return !!this.codeCachePath;
  }
  unsetSnapExportedVariables() {
    if (!isLinux) {
      return;
    }
    for (const key in process.env) {
      if (key.endsWith("_VSCODE_SNAP_ORIG")) {
        const originalKey = key.slice(0, -17);
        if (this._snapEnv[originalKey]) {
          continue;
        }
        if (process.env[originalKey]) {
          this._snapEnv[originalKey] = process.env[originalKey];
        }
        if (process.env[key]) {
          process.env[originalKey] = process.env[key];
        } else {
          delete process.env[originalKey];
        }
      }
    }
  }
  restoreSnapExportedVariables() {
    if (!isLinux) {
      return;
    }
    for (const key in this._snapEnv) {
      process.env[key] = this._snapEnv[key];
      delete this._snapEnv[key];
    }
  }
}
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "backupHome", 1);
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "mainIPCHandle", 1);
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "mainLockfile", 1);
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "disableUpdates", 1);
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "isPortable", 1);
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "crossOriginIsolated", 1);
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "enableRDPDisplayTracking", 1);
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "codeCachePath", 1);
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "useCodeCache", 1);
export {
  EnvironmentMainService,
  IEnvironmentMainService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2Vudmlyb25tZW50L2VsZWN0cm9uLW1haW4vZW52aXJvbm1lbnRNYWluU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IG1lbW9pemUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGlzTGludXggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTdGF0aWNJUENIYW5kbGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9ub2RlL2lwYy5uZXQuanMnO1xuaW1wb3J0IHsgSUVudmlyb25tZW50U2VydmljZSwgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi9ub2RlL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyByZWZpbmVTZXJ2aWNlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5cbmV4cG9ydCBjb25zdCBJRW52aXJvbm1lbnRNYWluU2VydmljZSA9IHJlZmluZVNlcnZpY2VEZWNvcmF0b3I8SUVudmlyb25tZW50U2VydmljZSwgSUVudmlyb25tZW50TWFpblNlcnZpY2U+KElFbnZpcm9ubWVudFNlcnZpY2UpO1xuXG4vKipcbiAqIEEgc3ViY2xhc3Mgb2YgdGhlIGBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlYCB0byBiZSB1c2VkIG9ubHkgaW4gZWxlY3Ryb24tbWFpblxuICogZW52aXJvbm1lbnRzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElFbnZpcm9ubWVudE1haW5TZXJ2aWNlIGV4dGVuZHMgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB7XG5cblx0Ly8gLS0tIGJhY2t1cCBwYXRoc1xuXHRyZWFkb25seSBiYWNrdXBIb21lOiBzdHJpbmc7XG5cblx0Ly8gLS0tIFY4IGNvZGUgY2FjaGluZ1xuXHRyZWFkb25seSBjb2RlQ2FjaGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHVzZUNvZGVDYWNoZTogYm9vbGVhbjtcblxuXHQvLyAtLS0gSVBDXG5cdHJlYWRvbmx5IG1haW5JUENIYW5kbGU6IHN0cmluZztcblx0cmVhZG9ubHkgbWFpbkxvY2tmaWxlOiBzdHJpbmc7XG5cblx0Ly8gLS0tIGNvbmZpZ1xuXHRyZWFkb25seSBkaXNhYmxlVXBkYXRlczogYm9vbGVhbjtcblx0cmVhZG9ubHkgaXNQb3J0YWJsZTogYm9vbGVhbjtcblxuXHQvLyBUT0RPQGRlZXBhazE1NTYgdGVtcG9yYXJ5IHVudGlsIGEgcmVhbCBmaXggbGFuZHMgdXBzdHJlYW1cblx0cmVhZG9ubHkgZW5hYmxlUkRQRGlzcGxheVRyYWNraW5nOiBib29sZWFuO1xuXG5cdHVuc2V0U25hcEV4cG9ydGVkVmFyaWFibGVzKCk6IHZvaWQ7XG5cdHJlc3RvcmVTbmFwRXhwb3J0ZWRWYXJpYWJsZXMoKTogdm9pZDtcbn1cblxuZXhwb3J0IGNsYXNzIEVudmlyb25tZW50TWFpblNlcnZpY2UgZXh0ZW5kcyBOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgaW1wbGVtZW50cyBJRW52aXJvbm1lbnRNYWluU2VydmljZSB7XG5cblx0cHJpdmF0ZSBfc25hcEVudjogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXG5cdEBtZW1vaXplXG5cdGdldCBiYWNrdXBIb21lKCk6IHN0cmluZyB7IHJldHVybiBqb2luKHRoaXMudXNlckRhdGFQYXRoLCAnQmFja3VwcycpOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IG1haW5JUENIYW5kbGUoKTogc3RyaW5nIHsgcmV0dXJuIGNyZWF0ZVN0YXRpY0lQQ0hhbmRsZSh0aGlzLnVzZXJEYXRhUGF0aCwgJ21haW4nLCB0aGlzLnByb2R1Y3RTZXJ2aWNlLnZlcnNpb24pOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IG1haW5Mb2NrZmlsZSgpOiBzdHJpbmcgeyByZXR1cm4gam9pbih0aGlzLnVzZXJEYXRhUGF0aCwgJ2NvZGUubG9jaycpOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IGRpc2FibGVVcGRhdGVzKCk6IGJvb2xlYW4geyByZXR1cm4gISF0aGlzLmFyZ3NbJ2Rpc2FibGUtdXBkYXRlcyddOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IGlzUG9ydGFibGUoKTogYm9vbGVhbiB7IHJldHVybiAhIXByb2Nlc3MuZW52WydWU0NPREVfUE9SVEFCTEUnXTsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBjcm9zc09yaWdpbklzb2xhdGVkKCk6IGJvb2xlYW4geyByZXR1cm4gISF0aGlzLmFyZ3NbJ2VuYWJsZS1jb2knXTsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBlbmFibGVSRFBEaXNwbGF5VHJhY2tpbmcoKTogYm9vbGVhbiB7IHJldHVybiAhIXRoaXMuYXJnc1snZW5hYmxlLXJkcC1kaXNwbGF5LXRyYWNraW5nJ107IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgY29kZUNhY2hlUGF0aCgpOiBzdHJpbmcgfCB1bmRlZmluZWQgeyByZXR1cm4gcHJvY2Vzcy5lbnZbJ1ZTQ09ERV9DT0RFX0NBQ0hFX1BBVEgnXSB8fCB1bmRlZmluZWQ7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgdXNlQ29kZUNhY2hlKCk6IGJvb2xlYW4geyByZXR1cm4gISF0aGlzLmNvZGVDYWNoZVBhdGg7IH1cblxuXHR1bnNldFNuYXBFeHBvcnRlZFZhcmlhYmxlcygpIHtcblx0XHRpZiAoIWlzTGludXgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBrZXkgaW4gcHJvY2Vzcy5lbnYpIHtcblx0XHRcdGlmIChrZXkuZW5kc1dpdGgoJ19WU0NPREVfU05BUF9PUklHJykpIHtcblx0XHRcdFx0Y29uc3Qgb3JpZ2luYWxLZXkgPSBrZXkuc2xpY2UoMCwgLTE3KTsgLy8gUmVtb3ZlIHRoZSBfVlNDT0RFX1NOQVBfT1JJRyBzdWZmaXhcblx0XHRcdFx0aWYgKHRoaXMuX3NuYXBFbnZbb3JpZ2luYWxLZXldKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gUHJlc2VydmUgdGhlIG9yaWdpbmFsIHZhbHVlIGluIGNhc2UgdGhlIHNuYXAgZW52IGlzIHJlLWVudGVyZWRcblx0XHRcdFx0aWYgKHByb2Nlc3MuZW52W29yaWdpbmFsS2V5XSkge1xuXHRcdFx0XHRcdHRoaXMuX3NuYXBFbnZbb3JpZ2luYWxLZXldID0gcHJvY2Vzcy5lbnZbb3JpZ2luYWxLZXldITtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBDb3B5IHRoZSBvcmlnaW5hbCB2YWx1ZSBmcm9tIGJlZm9yZSBlbnRlcmluZyB0aGUgc25hcCBlbnYgaWYgYXZhaWxhYmxlLFxuXHRcdFx0XHQvLyBpZiBub3QgZGVsZXRlIHRoZSBlbnYgdmFyaWFibGUuXG5cdFx0XHRcdGlmIChwcm9jZXNzLmVudltrZXldKSB7XG5cdFx0XHRcdFx0cHJvY2Vzcy5lbnZbb3JpZ2luYWxLZXldID0gcHJvY2Vzcy5lbnZba2V5XTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRkZWxldGUgcHJvY2Vzcy5lbnZbb3JpZ2luYWxLZXldO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cmVzdG9yZVNuYXBFeHBvcnRlZFZhcmlhYmxlcygpIHtcblx0XHRpZiAoIWlzTGludXgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBrZXkgaW4gdGhpcy5fc25hcEVudikge1xuXHRcdFx0cHJvY2Vzcy5lbnZba2V5XSA9IHRoaXMuX3NuYXBFbnZba2V5XTtcblx0XHRcdGRlbGV0ZSB0aGlzLl9zbmFwRW52W2tleV07XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUywyQkFBc0Q7QUFDL0QsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw4QkFBOEI7QUFFaEMsTUFBTSwwQkFBMEIsdUJBQXFFLG1CQUFtQjtBQThCeEgsTUFBTSwrQkFBK0IseUJBQTREO0FBQUEsRUFBakc7QUFBQTtBQUVOLFNBQVEsV0FBbUMsQ0FBQztBQUFBO0FBQUEsRUFHNUMsSUFBSSxhQUFxQjtBQUFFLFdBQU8sS0FBSyxLQUFLLGNBQWMsU0FBUztBQUFBLEVBQUc7QUFBQSxFQUd0RSxJQUFJLGdCQUF3QjtBQUFFLFdBQU8sc0JBQXNCLEtBQUssY0FBYyxRQUFRLEtBQUssZUFBZSxPQUFPO0FBQUEsRUFBRztBQUFBLEVBR3BILElBQUksZUFBdUI7QUFBRSxXQUFPLEtBQUssS0FBSyxjQUFjLFdBQVc7QUFBQSxFQUFHO0FBQUEsRUFHMUUsSUFBSSxpQkFBMEI7QUFBRSxXQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssaUJBQWlCO0FBQUEsRUFBRztBQUFBLEVBR3ZFLElBQUksYUFBc0I7QUFBRSxXQUFPLENBQUMsQ0FBQyxRQUFRLElBQUksaUJBQWlCO0FBQUEsRUFBRztBQUFBLEVBR3JFLElBQUksc0JBQStCO0FBQUUsV0FBTyxDQUFDLENBQUMsS0FBSyxLQUFLLFlBQVk7QUFBQSxFQUFHO0FBQUEsRUFHdkUsSUFBSSwyQkFBb0M7QUFBRSxXQUFPLENBQUMsQ0FBQyxLQUFLLEtBQUssNkJBQTZCO0FBQUEsRUFBRztBQUFBLEVBRzdGLElBQUksZ0JBQW9DO0FBQUUsV0FBTyxRQUFRLElBQUksd0JBQXdCLEtBQUs7QUFBQSxFQUFXO0FBQUEsRUFHckcsSUFBSSxlQUF3QjtBQUFFLFdBQU8sQ0FBQyxDQUFDLEtBQUs7QUFBQSxFQUFlO0FBQUEsRUFFM0QsNkJBQTZCO0FBQzVCLFFBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxJQUNEO0FBQ0EsZUFBVyxPQUFPLFFBQVEsS0FBSztBQUM5QixVQUFJLElBQUksU0FBUyxtQkFBbUIsR0FBRztBQUN0QyxjQUFNLGNBQWMsSUFBSSxNQUFNLEdBQUcsR0FBRztBQUNwQyxZQUFJLEtBQUssU0FBUyxXQUFXLEdBQUc7QUFDL0I7QUFBQSxRQUNEO0FBRUEsWUFBSSxRQUFRLElBQUksV0FBVyxHQUFHO0FBQzdCLGVBQUssU0FBUyxXQUFXLElBQUksUUFBUSxJQUFJLFdBQVc7QUFBQSxRQUNyRDtBQUdBLFlBQUksUUFBUSxJQUFJLEdBQUcsR0FBRztBQUNyQixrQkFBUSxJQUFJLFdBQVcsSUFBSSxRQUFRLElBQUksR0FBRztBQUFBLFFBQzNDLE9BQU87QUFDTixpQkFBTyxRQUFRLElBQUksV0FBVztBQUFBLFFBQy9CO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFQSwrQkFBK0I7QUFDOUIsUUFBSSxDQUFDLFNBQVM7QUFDYjtBQUFBLElBQ0Q7QUFDQSxlQUFXLE9BQU8sS0FBSyxVQUFVO0FBQ2hDLGNBQVEsSUFBSSxHQUFHLElBQUksS0FBSyxTQUFTLEdBQUc7QUFDcEMsYUFBTyxLQUFLLFNBQVMsR0FBRztBQUFBLElBQ3pCO0FBQUEsRUFDRDtBQUNEO0FBNURLO0FBQUEsRUFESDtBQUFBLEdBSlcsdUJBS1I7QUFHQTtBQUFBLEVBREg7QUFBQSxHQVBXLHVCQVFSO0FBR0E7QUFBQSxFQURIO0FBQUEsR0FWVyx1QkFXUjtBQUdBO0FBQUEsRUFESDtBQUFBLEdBYlcsdUJBY1I7QUFHQTtBQUFBLEVBREg7QUFBQSxHQWhCVyx1QkFpQlI7QUFHQTtBQUFBLEVBREg7QUFBQSxHQW5CVyx1QkFvQlI7QUFHQTtBQUFBLEVBREg7QUFBQSxHQXRCVyx1QkF1QlI7QUFHQTtBQUFBLEVBREg7QUFBQSxHQXpCVyx1QkEwQlI7QUFHQTtBQUFBLEVBREg7QUFBQSxHQTVCVyx1QkE2QlI7IiwKICAibmFtZXMiOiBbXQp9Cg==
