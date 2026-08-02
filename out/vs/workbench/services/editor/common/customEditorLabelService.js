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
import { Emitter } from "../../../../base/common/event.js";
import { parse as parseGlob } from "../../../../base/common/glob.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isAbsolute, parse as parsePath, dirname } from "../../../../base/common/path.js";
import { dirname as resourceDirname, relativePath as getRelativePath } from "../../../../base/common/resources.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { createDecorator } from "../../../../platform/instantiation/common/instantiation.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { MRUCache } from "../../../../base/common/map.js";
let CustomEditorLabelService = class extends Disposable {
  constructor(configurationService, workspaceContextService) {
    super();
    this.configurationService = configurationService;
    this.workspaceContextService = workspaceContextService;
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this.patterns = [];
    this.enabled = true;
    this.cache = new MRUCache(1e3);
    this._templateRegexValidation = /[a-zA-Z0-9]/;
    this._parsedTemplateExpression = /\$\{(dirname|filename|extname|extname\((?<extnameN>[-+]?\d+)\)|dirname\((?<dirnameN>[-+]?\d+)\))\}/g;
    this._filenameCaptureExpression = /(?<filename>^\.*[^.]*)/;
    this.storeEnablementState();
    this.storeCustomPatterns();
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CustomEditorLabelService.SETTING_ID_ENABLED)) {
        const oldEnablement = this.enabled;
        this.storeEnablementState();
        if (oldEnablement !== this.enabled && this.patterns.length > 0) {
          this._onDidChange.fire();
        }
      } else if (e.affectsConfiguration(CustomEditorLabelService.SETTING_ID_PATTERNS)) {
        this.cache.clear();
        this.storeCustomPatterns();
        this._onDidChange.fire();
      }
    }));
  }
  storeEnablementState() {
    this.enabled = this.configurationService.getValue(CustomEditorLabelService.SETTING_ID_ENABLED);
  }
  storeCustomPatterns() {
    this.patterns = [];
    const customLabelPatterns = this.configurationService.getValue(CustomEditorLabelService.SETTING_ID_PATTERNS);
    for (const pattern in customLabelPatterns) {
      const template = customLabelPatterns[pattern];
      if (!this._templateRegexValidation.test(template)) {
        continue;
      }
      const isAbsolutePath = isAbsolute(pattern);
      const parsedPattern = parseGlob(pattern, { ignoreCase: true });
      this.patterns.push({ pattern, template, isAbsolutePath, parsedPattern });
    }
    this.patterns.sort((a, b) => this.patternWeight(b.pattern) - this.patternWeight(a.pattern));
  }
  patternWeight(pattern) {
    let weight = 0;
    for (const fragment of pattern.split("/")) {
      if (fragment === "**") {
        weight += 1;
      } else if (fragment === "*") {
        weight += 10;
      } else if (fragment.includes("*") || fragment.includes("?")) {
        weight += 50;
      } else if (fragment !== "") {
        weight += 100;
      }
    }
    return weight;
  }
  getName(resource) {
    if (!this.enabled || this.patterns.length === 0) {
      return void 0;
    }
    const key = resource.toString();
    const cached = this.cache.get(key);
    if (cached !== void 0) {
      return cached ?? void 0;
    }
    const result = this.applyPatterns(resource);
    this.cache.set(key, result ?? null);
    return result;
  }
  applyPatterns(resource) {
    const root = this.workspaceContextService.getWorkspaceFolder(resource);
    let relativePath;
    for (const pattern of this.patterns) {
      let relevantPath;
      if (root && !pattern.isAbsolutePath) {
        if (!relativePath) {
          relativePath = getRelativePath(resourceDirname(root.uri), resource) ?? resource.path;
        }
        relevantPath = relativePath;
      } else {
        relevantPath = resource.path;
      }
      if (pattern.parsedPattern(relevantPath)) {
        return this.applyTemplate(pattern.template, resource, relevantPath);
      }
    }
    return void 0;
  }
  applyTemplate(template, resource, relevantPath) {
    let parsedPath;
    return template.replace(this._parsedTemplateExpression, (match, variable, ...args) => {
      parsedPath = parsedPath ?? parsePath(resource.path);
      const { dirnameN = "0", extnameN = "0" } = args.pop();
      if (variable === "filename") {
        const { filename } = this._filenameCaptureExpression.exec(parsedPath.base)?.groups ?? {};
        if (filename) {
          return filename;
        }
      } else if (variable === "extname") {
        const extension = this.getExtnames(parsedPath.base);
        if (extension) {
          return extension;
        }
      } else if (variable.startsWith("extname")) {
        const n = parseInt(extnameN);
        const nthExtname = this.getNthExtname(parsedPath.base, n);
        if (nthExtname) {
          return nthExtname;
        }
      } else if (variable.startsWith("dirname")) {
        const n = parseInt(dirnameN);
        const nthDir = this.getNthDirname(dirname(relevantPath), n);
        if (nthDir) {
          return nthDir;
        }
      }
      return match;
    });
  }
  removeLeadingDot(path) {
    let withoutLeadingDot = path;
    while (withoutLeadingDot.startsWith(".")) {
      withoutLeadingDot = withoutLeadingDot.slice(1);
    }
    return withoutLeadingDot;
  }
  getNthDirname(path, n) {
    path = path.startsWith("/") ? path.slice(1) : path;
    const pathFragments = path.split("/");
    return this.getNthFragment(pathFragments, n);
  }
  getExtnames(fullFileName) {
    return this.removeLeadingDot(fullFileName).split(".").slice(1).join(".");
  }
  getNthExtname(fullFileName, n) {
    const extensionNameFragments = this.removeLeadingDot(fullFileName).split(".");
    extensionNameFragments.shift();
    return this.getNthFragment(extensionNameFragments, n);
  }
  getNthFragment(fragments, n) {
    const length = fragments.length;
    let nth;
    if (n < 0) {
      nth = Math.abs(n) - 1;
    } else {
      nth = length - n - 1;
    }
    const nthFragment = fragments[nth];
    if (nthFragment === void 0 || nthFragment === "") {
      return void 0;
    }
    return nthFragment;
  }
};
CustomEditorLabelService.SETTING_ID_PATTERNS = "workbench.editor.customLabels.patterns";
CustomEditorLabelService.SETTING_ID_ENABLED = "workbench.editor.customLabels.enabled";
CustomEditorLabelService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IWorkspaceContextService)
], CustomEditorLabelService);
const ICustomEditorLabelService = createDecorator("ICustomEditorLabelService");
registerSingleton(ICustomEditorLabelService, CustomEditorLabelService, InstantiationType.Delayed);
export {
  CustomEditorLabelService,
  ICustomEditorLabelService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2N1c3RvbUVkaXRvckxhYmVsU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgUGFyc2VkUGF0dGVybiwgcGFyc2UgYXMgcGFyc2VHbG9iIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzQWJzb2x1dGUsIHBhcnNlIGFzIHBhcnNlUGF0aCwgUGFyc2VkUGF0aCwgZGlybmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZGlybmFtZSBhcyByZXNvdXJjZURpcm5hbWUsIHJlbGF0aXZlUGF0aCBhcyBnZXRSZWxhdGl2ZVBhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IE1SVUNhY2hlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcblxuaW50ZXJmYWNlIElDdXN0b21FZGl0b3JMYWJlbE9iamVjdCB7XG5cdHJlYWRvbmx5IFtrZXk6IHN0cmluZ106IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElDdXN0b21FZGl0b3JMYWJlbFBhdHRlcm4ge1xuXHRyZWFkb25seSBwYXR0ZXJuOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRlbXBsYXRlOiBzdHJpbmc7XG5cblx0cmVhZG9ubHkgaXNBYnNvbHV0ZVBhdGg6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHBhcnNlZFBhdHRlcm46IFBhcnNlZFBhdHRlcm47XG59XG5cbmV4cG9ydCBjbGFzcyBDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUN1c3RvbUVkaXRvckxhYmVsU2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHN0YXRpYyByZWFkb25seSBTRVRUSU5HX0lEX1BBVFRFUk5TID0gJ3dvcmtiZW5jaC5lZGl0b3IuY3VzdG9tTGFiZWxzLnBhdHRlcm5zJztcblx0c3RhdGljIHJlYWRvbmx5IFNFVFRJTkdfSURfRU5BQkxFRCA9ICd3b3JrYmVuY2guZWRpdG9yLmN1c3RvbUxhYmVscy5lbmFibGVkJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcGF0dGVybnM6IElDdXN0b21FZGl0b3JMYWJlbFBhdHRlcm5bXSA9IFtdO1xuXHRwcml2YXRlIGVuYWJsZWQgPSB0cnVlO1xuXG5cdHByaXZhdGUgY2FjaGUgPSBuZXcgTVJVQ2FjaGU8c3RyaW5nLCBzdHJpbmcgfCBudWxsPigxMDAwKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuc3RvcmVFbmFibGVtZW50U3RhdGUoKTtcblx0XHR0aGlzLnN0b3JlQ3VzdG9tUGF0dGVybnMoKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHQvLyBDYWNoZSB0aGUgZW5hYmxlZCBzdGF0ZVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlLlNFVFRJTkdfSURfRU5BQkxFRCkpIHtcblx0XHRcdFx0Y29uc3Qgb2xkRW5hYmxlbWVudCA9IHRoaXMuZW5hYmxlZDtcblx0XHRcdFx0dGhpcy5zdG9yZUVuYWJsZW1lbnRTdGF0ZSgpO1xuXHRcdFx0XHRpZiAob2xkRW5hYmxlbWVudCAhPT0gdGhpcy5lbmFibGVkICYmIHRoaXMucGF0dGVybnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBDYWNoZSB0aGUgcGF0dGVybnNcblx0XHRcdGVsc2UgaWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlLlNFVFRJTkdfSURfUEFUVEVSTlMpKSB7XG5cdFx0XHRcdHRoaXMuY2FjaGUuY2xlYXIoKTtcblx0XHRcdFx0dGhpcy5zdG9yZUN1c3RvbVBhdHRlcm5zKCk7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHN0b3JlRW5hYmxlbWVudFN0YXRlKCk6IHZvaWQge1xuXHRcdHRoaXMuZW5hYmxlZCA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlLlNFVFRJTkdfSURfRU5BQkxFRCk7XG5cdH1cblxuXHRwcml2YXRlIF90ZW1wbGF0ZVJlZ2V4VmFsaWRhdGlvbiA9IC9bYS16QS1aMC05XS87XG5cdHByaXZhdGUgc3RvcmVDdXN0b21QYXR0ZXJucygpOiB2b2lkIHtcblx0XHR0aGlzLnBhdHRlcm5zID0gW107XG5cdFx0Y29uc3QgY3VzdG9tTGFiZWxQYXR0ZXJucyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SUN1c3RvbUVkaXRvckxhYmVsT2JqZWN0PihDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UuU0VUVElOR19JRF9QQVRURVJOUyk7XG5cdFx0Zm9yIChjb25zdCBwYXR0ZXJuIGluIGN1c3RvbUxhYmVsUGF0dGVybnMpIHtcblx0XHRcdGNvbnN0IHRlbXBsYXRlID0gY3VzdG9tTGFiZWxQYXR0ZXJuc1twYXR0ZXJuXTtcblxuXHRcdFx0aWYgKCF0aGlzLl90ZW1wbGF0ZVJlZ2V4VmFsaWRhdGlvbi50ZXN0KHRlbXBsYXRlKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXNBYnNvbHV0ZVBhdGggPSBpc0Fic29sdXRlKHBhdHRlcm4pO1xuXHRcdFx0Y29uc3QgcGFyc2VkUGF0dGVybiA9IHBhcnNlR2xvYihwYXR0ZXJuLCB7IGlnbm9yZUNhc2U6IHRydWUgfSk7XG5cblx0XHRcdHRoaXMucGF0dGVybnMucHVzaCh7IHBhdHRlcm4sIHRlbXBsYXRlLCBpc0Fic29sdXRlUGF0aCwgcGFyc2VkUGF0dGVybiB9KTtcblx0XHR9XG5cblx0XHR0aGlzLnBhdHRlcm5zLnNvcnQoKGEsIGIpID0+IHRoaXMucGF0dGVybldlaWdodChiLnBhdHRlcm4pIC0gdGhpcy5wYXR0ZXJuV2VpZ2h0KGEucGF0dGVybikpO1xuXHR9XG5cblx0cHJpdmF0ZSBwYXR0ZXJuV2VpZ2h0KHBhdHRlcm46IHN0cmluZyk6IG51bWJlciB7XG5cdFx0bGV0IHdlaWdodCA9IDA7XG5cdFx0Zm9yIChjb25zdCBmcmFnbWVudCBvZiBwYXR0ZXJuLnNwbGl0KCcvJykpIHtcblx0XHRcdGlmIChmcmFnbWVudCA9PT0gJyoqJykge1xuXHRcdFx0XHR3ZWlnaHQgKz0gMTtcblx0XHRcdH0gZWxzZSBpZiAoZnJhZ21lbnQgPT09ICcqJykge1xuXHRcdFx0XHR3ZWlnaHQgKz0gMTA7XG5cdFx0XHR9IGVsc2UgaWYgKGZyYWdtZW50LmluY2x1ZGVzKCcqJykgfHwgZnJhZ21lbnQuaW5jbHVkZXMoJz8nKSkge1xuXHRcdFx0XHR3ZWlnaHQgKz0gNTA7XG5cdFx0XHR9IGVsc2UgaWYgKGZyYWdtZW50ICE9PSAnJykge1xuXHRcdFx0XHR3ZWlnaHQgKz0gMTAwO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB3ZWlnaHQ7XG5cdH1cblxuXHRnZXROYW1lKHJlc291cmNlOiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghdGhpcy5lbmFibGVkIHx8IHRoaXMucGF0dGVybnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGtleSA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY2FjaGVkID0gdGhpcy5jYWNoZS5nZXQoa2V5KTtcblx0XHRpZiAoY2FjaGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBjYWNoZWQgPz8gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuYXBwbHlQYXR0ZXJucyhyZXNvdXJjZSk7XG5cdFx0dGhpcy5jYWNoZS5zZXQoa2V5LCByZXN1bHQgPz8gbnVsbCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseVBhdHRlcm5zKHJlc291cmNlOiBVUkkpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJvb3QgPSB0aGlzLndvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZUZvbGRlcihyZXNvdXJjZSk7XG5cdFx0bGV0IHJlbGF0aXZlUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0Zm9yIChjb25zdCBwYXR0ZXJuIG9mIHRoaXMucGF0dGVybnMpIHtcblx0XHRcdGxldCByZWxldmFudFBhdGg6IHN0cmluZztcblx0XHRcdGlmIChyb290ICYmICFwYXR0ZXJuLmlzQWJzb2x1dGVQYXRoKSB7XG5cdFx0XHRcdGlmICghcmVsYXRpdmVQYXRoKSB7XG5cdFx0XHRcdFx0cmVsYXRpdmVQYXRoID0gZ2V0UmVsYXRpdmVQYXRoKHJlc291cmNlRGlybmFtZShyb290LnVyaSksIHJlc291cmNlKSA/PyByZXNvdXJjZS5wYXRoO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlbGV2YW50UGF0aCA9IHJlbGF0aXZlUGF0aDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlbGV2YW50UGF0aCA9IHJlc291cmNlLnBhdGg7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChwYXR0ZXJuLnBhcnNlZFBhdHRlcm4ocmVsZXZhbnRQYXRoKSkge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5hcHBseVRlbXBsYXRlKHBhdHRlcm4udGVtcGxhdGUsIHJlc291cmNlLCByZWxldmFudFBhdGgpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wYXJzZWRUZW1wbGF0ZUV4cHJlc3Npb24gPSAvXFwkXFx7KGRpcm5hbWV8ZmlsZW5hbWV8ZXh0bmFtZXxleHRuYW1lXFwoKD88ZXh0bmFtZU4+Wy0rXT9cXGQrKVxcKXxkaXJuYW1lXFwoKD88ZGlybmFtZU4+Wy0rXT9cXGQrKVxcKSlcXH0vZztcblx0cHJpdmF0ZSByZWFkb25seSBfZmlsZW5hbWVDYXB0dXJlRXhwcmVzc2lvbiA9IC8oPzxmaWxlbmFtZT5eXFwuKlteLl0qKS87XG5cdHByaXZhdGUgYXBwbHlUZW1wbGF0ZSh0ZW1wbGF0ZTogc3RyaW5nLCByZXNvdXJjZTogVVJJLCByZWxldmFudFBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0bGV0IHBhcnNlZFBhdGg6IHVuZGVmaW5lZCB8IFBhcnNlZFBhdGg7XG5cdFx0cmV0dXJuIHRlbXBsYXRlLnJlcGxhY2UodGhpcy5fcGFyc2VkVGVtcGxhdGVFeHByZXNzaW9uLCAobWF0Y2g6IHN0cmluZywgdmFyaWFibGU6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKSA9PiB7XG5cdFx0XHRwYXJzZWRQYXRoID0gcGFyc2VkUGF0aCA/PyBwYXJzZVBhdGgocmVzb3VyY2UucGF0aCk7XG5cdFx0XHQvLyBuYW1lZCBncm91cCBtYXRjaGVzXG5cdFx0XHRjb25zdCB7IGRpcm5hbWVOID0gJzAnLCBleHRuYW1lTiA9ICcwJyB9ID0gYXJncy5wb3AoKSBhcyB7IGRpcm5hbWVOPzogc3RyaW5nOyBleHRuYW1lTj86IHN0cmluZyB9O1xuXG5cdFx0XHRpZiAodmFyaWFibGUgPT09ICdmaWxlbmFtZScpIHtcblx0XHRcdFx0Y29uc3QgeyBmaWxlbmFtZSB9ID0gdGhpcy5fZmlsZW5hbWVDYXB0dXJlRXhwcmVzc2lvbi5leGVjKHBhcnNlZFBhdGguYmFzZSk/Lmdyb3VwcyA/PyB7fTtcblx0XHRcdFx0aWYgKGZpbGVuYW1lKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZpbGVuYW1lO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHZhcmlhYmxlID09PSAnZXh0bmFtZScpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0gdGhpcy5nZXRFeHRuYW1lcyhwYXJzZWRQYXRoLmJhc2UpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGV4dGVuc2lvbjtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICh2YXJpYWJsZS5zdGFydHNXaXRoKCdleHRuYW1lJykpIHtcblx0XHRcdFx0Y29uc3QgbiA9IHBhcnNlSW50KGV4dG5hbWVOKTtcblx0XHRcdFx0Y29uc3QgbnRoRXh0bmFtZSA9IHRoaXMuZ2V0TnRoRXh0bmFtZShwYXJzZWRQYXRoLmJhc2UsIG4pO1xuXHRcdFx0XHRpZiAobnRoRXh0bmFtZSkge1xuXHRcdFx0XHRcdHJldHVybiBudGhFeHRuYW1lO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKHZhcmlhYmxlLnN0YXJ0c1dpdGgoJ2Rpcm5hbWUnKSkge1xuXHRcdFx0XHRjb25zdCBuID0gcGFyc2VJbnQoZGlybmFtZU4pO1xuXHRcdFx0XHRjb25zdCBudGhEaXIgPSB0aGlzLmdldE50aERpcm5hbWUoZGlybmFtZShyZWxldmFudFBhdGgpLCBuKTtcblx0XHRcdFx0aWYgKG50aERpcikge1xuXHRcdFx0XHRcdHJldHVybiBudGhEaXI7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG1hdGNoO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVMZWFkaW5nRG90KHBhdGg6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0bGV0IHdpdGhvdXRMZWFkaW5nRG90ID0gcGF0aDtcblx0XHR3aGlsZSAod2l0aG91dExlYWRpbmdEb3Quc3RhcnRzV2l0aCgnLicpKSB7XG5cdFx0XHR3aXRob3V0TGVhZGluZ0RvdCA9IHdpdGhvdXRMZWFkaW5nRG90LnNsaWNlKDEpO1xuXHRcdH1cblx0XHRyZXR1cm4gd2l0aG91dExlYWRpbmdEb3Q7XG5cdH1cblxuXHRwcml2YXRlIGdldE50aERpcm5hbWUocGF0aDogc3RyaW5nLCBuOiBudW1iZXIpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdC8vIGdyYW5kLXBhcmVudC9wYXJlbnQvZmlsZW5hbWUuZXh0MS5leHQyIC0+IFtncmFuZC1wYXJlbnQsIHBhcmVudF1cblx0XHRwYXRoID0gcGF0aC5zdGFydHNXaXRoKCcvJykgPyBwYXRoLnNsaWNlKDEpIDogcGF0aDtcblx0XHRjb25zdCBwYXRoRnJhZ21lbnRzID0gcGF0aC5zcGxpdCgnLycpO1xuXG5cdFx0cmV0dXJuIHRoaXMuZ2V0TnRoRnJhZ21lbnQocGF0aEZyYWdtZW50cywgbik7XG5cdH1cblxuXHRwcml2YXRlIGdldEV4dG5hbWVzKGZ1bGxGaWxlTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5yZW1vdmVMZWFkaW5nRG90KGZ1bGxGaWxlTmFtZSkuc3BsaXQoJy4nKS5zbGljZSgxKS5qb2luKCcuJyk7XG5cdH1cblxuXHRwcml2YXRlIGdldE50aEV4dG5hbWUoZnVsbEZpbGVOYW1lOiBzdHJpbmcsIG46IG51bWJlcik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gZmlsZS5leHQxLmV4dDIuZXh0MyAtPiBbZmlsZSwgZXh0MSwgZXh0MiwgZXh0M11cblx0XHRjb25zdCBleHRlbnNpb25OYW1lRnJhZ21lbnRzID0gdGhpcy5yZW1vdmVMZWFkaW5nRG90KGZ1bGxGaWxlTmFtZSkuc3BsaXQoJy4nKTtcblx0XHRleHRlbnNpb25OYW1lRnJhZ21lbnRzLnNoaWZ0KCk7IC8vIHJlbW92ZSB0aGUgZmlyc3QgZWxlbWVudCB3aGljaCBpcyB0aGUgZmlsZSBuYW1lXG5cblx0XHRyZXR1cm4gdGhpcy5nZXROdGhGcmFnbWVudChleHRlbnNpb25OYW1lRnJhZ21lbnRzLCBuKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TnRoRnJhZ21lbnQoZnJhZ21lbnRzOiBzdHJpbmdbXSwgbjogbnVtYmVyKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsZW5ndGggPSBmcmFnbWVudHMubGVuZ3RoO1xuXG5cdFx0bGV0IG50aDtcblx0XHRpZiAobiA8IDApIHtcblx0XHRcdG50aCA9IE1hdGguYWJzKG4pIC0gMTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bnRoID0gbGVuZ3RoIC0gbiAtIDE7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbnRoRnJhZ21lbnQgPSBmcmFnbWVudHNbbnRoXTtcblx0XHRpZiAobnRoRnJhZ21lbnQgPT09IHVuZGVmaW5lZCB8fCBudGhGcmFnbWVudCA9PT0gJycpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBudGhGcmFnbWVudDtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgSUN1c3RvbUVkaXRvckxhYmVsU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlPignSUN1c3RvbUVkaXRvckxhYmVsU2VydmljZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPjtcblx0Z2V0TmFtZShyZXNvdXJjZTogVVJJKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJQ3VzdG9tRWRpdG9yTGFiZWxTZXJ2aWNlLCBDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQXNCO0FBQy9CLFNBQXdCLFNBQVMsaUJBQWlCO0FBQ2xELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsWUFBWSxTQUFTLFdBQXVCLGVBQWU7QUFDcEUsU0FBUyxXQUFXLGlCQUFpQixnQkFBZ0IsdUJBQXVCO0FBRTVFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdCQUFnQjtBQWNsQixJQUFNLDJCQUFOLGNBQXVDLFdBQWdEO0FBQUEsRUFlN0YsWUFDeUMsc0JBQ0cseUJBQzFDO0FBQ0QsVUFBTTtBQUhrQztBQUNHO0FBVjVDLFNBQWlCLGVBQWUsS0FBSyxVQUFVLElBQUksUUFBYyxDQUFDO0FBQ2xFLFNBQVMsY0FBYyxLQUFLLGFBQWE7QUFFekMsU0FBUSxXQUF3QyxDQUFDO0FBQ2pELFNBQVEsVUFBVTtBQUVsQixTQUFRLFFBQVEsSUFBSSxTQUFnQyxHQUFJO0FBc0N4RCxTQUFRLDJCQUEyQjtBQTZFbkMsU0FBaUIsNEJBQTRCO0FBQzdDLFNBQWlCLDZCQUE2QjtBQTVHN0MsU0FBSyxxQkFBcUI7QUFDMUIsU0FBSyxvQkFBb0I7QUFFekIsU0FB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
