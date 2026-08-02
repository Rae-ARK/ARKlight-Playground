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
import { ObservablePromise } from "../../../../base/common/observable.js";
import { importAMDNodeModule } from "../../../../amdX.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { FileOperationResult, IFileService, toFileOperationResult } from "../../../../platform/files/common/files.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { CachedFunction } from "../../../../base/common/cache.js";
import { IEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { FileAccess, nodeModulesAsarUnpackedPath, nodeModulesPath } from "../../../../base/common/network.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { isWeb } from "../../../../base/common/platform.js";
const EDITOR_EXPERIMENTAL_PREFER_TREESITTER = "editor.experimental.preferTreeSitter";
const TREESITTER_ALLOWED_SUPPORT = ["css", "typescript", "ini", "regex"];
const MODULE_LOCATION_SUBPATH = `@vscode/tree-sitter-wasm/wasm`;
const FILENAME_TREESITTER_WASM = `tree-sitter.wasm`;
function getModuleLocation(environmentService) {
  const useAsarUnpacked = environmentService.isBuilt && !isWeb;
  return `${useAsarUnpacked ? nodeModulesAsarUnpackedPath : nodeModulesPath}/${MODULE_LOCATION_SUBPATH}`;
}
let TreeSitterLibraryService = class extends Disposable {
  constructor(_configurationService, _fileService, _environmentService) {
    super();
    this._configurationService = _configurationService;
    this._fileService = _fileService;
    this._environmentService = _environmentService;
    this.isTest = false;
    this._treeSitterImport = new Lazy(async () => {
      const TreeSitter = await importAMDNodeModule("@vscode/tree-sitter-wasm", "wasm/tree-sitter.js");
      const environmentService = this._environmentService;
      const isTest = this.isTest;
      await TreeSitter.Parser.init({
        locateFile(_file, _folder) {
          const location = `${getModuleLocation(environmentService)}/${FILENAME_TREESITTER_WASM}`;
          if (isTest) {
            return FileAccess.asFileUri(location).toString(true);
          } else {
            return FileAccess.asBrowserUri(location).toString(true);
          }
        }
      });
      return TreeSitter;
    });
    this._supportsLanguage = new CachedFunction((languageId) => {
      return observableConfigValue(`${EDITOR_EXPERIMENTAL_PREFER_TREESITTER}.${languageId}`, false, this._configurationService);
    });
    this._languagesCache = new CachedFunction((languageId) => {
      return ObservablePromise.fromFn(async () => {
        const languageLocation = getModuleLocation(this._environmentService);
        const grammarName = `tree-sitter-${languageId}`;
        const wasmPath = `${languageLocation}/${grammarName}.wasm`;
        const [treeSitter, languageFile] = await Promise.all([
          this._treeSitterImport.value,
          this._fileService.readFile(FileAccess.asFileUri(wasmPath))
        ]);
        const Language = treeSitter.Language;
        const language = await Language.load(languageFile.value.buffer);
        return language;
      });
    });
    this._injectionQueries = new CachedFunction({ getCacheKey: JSON.stringify }, (arg) => {
      const loadQuerySource = async () => {
        const injectionsQueriesLocation = `vs/editor/common/languages/${arg.kind}/${arg.languageId}.scm`;
        const uri = FileAccess.asFileUri(injectionsQueriesLocation);
        if (!this._fileService.hasProvider(uri)) {
          return void 0;
        }
        const query = await tryReadFile(this._fileService, uri);
        if (query === void 0) {
          return void 0;
        }
        return query.value.toString();
      };
      return ObservablePromise.fromFn(async () => {
        const [
          querySource,
          language,
          treeSitter
        ] = await Promise.all([
          loadQuerySource(),
          this._languagesCache.get(arg.languageId).promise,
          this._treeSitterImport.value
        ]);
        if (querySource === void 0) {
          return null;
        }
        const Query = treeSitter.Query;
        return new Query(language, querySource);
      }).resolvedValue;
    });
  }
  supportsLanguage(languageId, reader) {
    return this._supportsLanguage.get(languageId).read(reader);
  }
  async getParserClass() {
    const treeSitter = await this._treeSitterImport.value;
    return treeSitter.Parser;
  }
  getLanguage(languageId, ignoreSupportsCheck, reader) {
    if (!ignoreSupportsCheck && !this.supportsLanguage(languageId, reader)) {
      return void 0;
    }
    const lang = this._languagesCache.get(languageId).resolvedValue.read(reader);
    return lang;
  }
  async getLanguagePromise(languageId) {
    return this._languagesCache.get(languageId).promise;
  }
  getInjectionQueries(languageId, reader) {
    if (!this.supportsLanguage(languageId, reader)) {
      return void 0;
    }
    const query = this._injectionQueries.get({ languageId, kind: "injections" }).read(reader);
    return query;
  }
  getHighlightingQueries(languageId, reader) {
    if (!this.supportsLanguage(languageId, reader)) {
      return void 0;
    }
    const query = this._injectionQueries.get({ languageId, kind: "highlights" }).read(reader);
    return query;
  }
  async createQuery(language, querySource) {
    const treeSitter = await this._treeSitterImport.value;
    return new treeSitter.Query(language, querySource);
  }
};
TreeSitterLibraryService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, IFileService),
  __decorateParam(2, IEnvironmentService)
], TreeSitterLibraryService);
async function tryReadFile(fileService, uri) {
  try {
    const result = await fileService.readFile(uri);
    return result;
  } catch (e) {
    if (toFileOperationResult(e) === FileOperationResult.FILE_NOT_FOUND) {
      return void 0;
    }
    throw e;
  }
}
export {
  EDITOR_EXPERIMENTAL_PREFER_TREESITTER,
  TREESITTER_ALLOWED_SUPPORT,
  TreeSitterLibraryService,
  getModuleLocation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy90cmVlU2l0dGVyL2Jyb3dzZXIvdHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXG5pbXBvcnQgdHlwZSB7IFBhcnNlciwgTGFuZ3VhZ2UsIFF1ZXJ5IH0gZnJvbSAnQHZzY29kZS90cmVlLXNpdHRlci13YXNtJztcbmltcG9ydCB7IElSZWFkZXIsIE9ic2VydmFibGVQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJVHJlZVNpdHRlckxpYnJhcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90cmVlU2l0dGVyL3RyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBpbXBvcnRBTUROb2RlTW9kdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYW1kWC5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEZpbGVPcGVyYXRpb25SZXN1bHQsIElGaWxlQ29udGVudCwgSUZpbGVTZXJ2aWNlLCB0b0ZpbGVPcGVyYXRpb25SZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb2JzZXJ2YWJsZS9jb21tb24vcGxhdGZvcm1PYnNlcnZhYmxlVXRpbHMuanMnO1xuaW1wb3J0IHsgQ2FjaGVkRnVuY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYWNoZS5qcyc7XG5pbXBvcnQgeyBJRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50LmpzJztcbmltcG9ydCB7IEFwcFJlc291cmNlUGF0aCwgRmlsZUFjY2Vzcywgbm9kZU1vZHVsZXNBc2FyVW5wYWNrZWRQYXRoLCBub2RlTW9kdWxlc1BhdGggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNXZWIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuXG5leHBvcnQgY29uc3QgRURJVE9SX0VYUEVSSU1FTlRBTF9QUkVGRVJfVFJFRVNJVFRFUiA9ICdlZGl0b3IuZXhwZXJpbWVudGFsLnByZWZlclRyZWVTaXR0ZXInO1xuZXhwb3J0IGNvbnN0IFRSRUVTSVRURVJfQUxMT1dFRF9TVVBQT1JUID0gWydjc3MnLCAndHlwZXNjcmlwdCcsICdpbmknLCAncmVnZXgnXTtcblxuY29uc3QgTU9EVUxFX0xPQ0FUSU9OX1NVQlBBVEggPSBgQHZzY29kZS90cmVlLXNpdHRlci13YXNtL3dhc21gO1xuY29uc3QgRklMRU5BTUVfVFJFRVNJVFRFUl9XQVNNID0gYHRyZWUtc2l0dGVyLndhc21gO1xuXG5leHBvcnQgZnVuY3Rpb24gZ2V0TW9kdWxlTG9jYXRpb24oZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlKTogQXBwUmVzb3VyY2VQYXRoIHtcblx0Y29uc3QgdXNlQXNhclVucGFja2VkID0gZW52aXJvbm1lbnRTZXJ2aWNlLmlzQnVpbHQgJiYgIWlzV2ViO1xuXHRyZXR1cm4gYCR7dXNlQXNhclVucGFja2VkID8gbm9kZU1vZHVsZXNBc2FyVW5wYWNrZWRQYXRoIDogbm9kZU1vZHVsZXNQYXRofS8ke01PRFVMRV9MT0NBVElPTl9TVUJQQVRIfWA7XG59XG5cbmV4cG9ydCBjbGFzcyBUcmVlU2l0dGVyTGlicmFyeVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRyZWVTaXR0ZXJMaWJyYXJ5U2VydmljZSB7XG5cdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0aXNUZXN0OiBib29sZWFuID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdHJlZVNpdHRlckltcG9ydCA9IG5ldyBMYXp5KGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBUcmVlU2l0dGVyID0gYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAdnNjb2RlL3RyZWUtc2l0dGVyLXdhc20nKT4oJ0B2c2NvZGUvdHJlZS1zaXR0ZXItd2FzbScsICd3YXNtL3RyZWUtc2l0dGVyLmpzJyk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnRTZXJ2aWNlID0gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlO1xuXHRcdGNvbnN0IGlzVGVzdCA9IHRoaXMuaXNUZXN0O1xuXHRcdGF3YWl0IFRyZWVTaXR0ZXIuUGFyc2VyLmluaXQoe1xuXHRcdFx0bG9jYXRlRmlsZShfZmlsZTogc3RyaW5nLCBfZm9sZGVyOiBzdHJpbmcpIHtcblx0XHRcdFx0Y29uc3QgbG9jYXRpb246IEFwcFJlc291cmNlUGF0aCA9IGAke2dldE1vZHVsZUxvY2F0aW9uKGVudmlyb25tZW50U2VydmljZSl9LyR7RklMRU5BTUVfVFJFRVNJVFRFUl9XQVNNfWA7XG5cdFx0XHRcdGlmIChpc1Rlc3QpIHtcblx0XHRcdFx0XHRyZXR1cm4gRmlsZUFjY2Vzcy5hc0ZpbGVVcmkobG9jYXRpb24pLnRvU3RyaW5nKHRydWUpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJldHVybiBGaWxlQWNjZXNzLmFzQnJvd3NlclVyaShsb2NhdGlvbikudG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0XHRyZXR1cm4gVHJlZVNpdHRlcjtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3VwcG9ydHNMYW5ndWFnZSA9IG5ldyBDYWNoZWRGdW5jdGlvbigobGFuZ3VhZ2VJZDogc3RyaW5nKSA9PiB7XG5cdFx0cmV0dXJuIG9ic2VydmFibGVDb25maWdWYWx1ZShgJHtFRElUT1JfRVhQRVJJTUVOVEFMX1BSRUZFUl9UUkVFU0lUVEVSfS4ke2xhbmd1YWdlSWR9YCwgZmFsc2UsIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VzQ2FjaGUgPSBuZXcgQ2FjaGVkRnVuY3Rpb24oKGxhbmd1YWdlSWQ6IHN0cmluZykgPT4ge1xuXHRcdHJldHVybiBPYnNlcnZhYmxlUHJvbWlzZS5mcm9tRm4oYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGFuZ3VhZ2VMb2NhdGlvbiA9IGdldE1vZHVsZUxvY2F0aW9uKHRoaXMuX2Vudmlyb25tZW50U2VydmljZSk7XG5cdFx0XHRjb25zdCBncmFtbWFyTmFtZSA9IGB0cmVlLXNpdHRlci0ke2xhbmd1YWdlSWR9YDtcblxuXHRcdFx0Y29uc3Qgd2FzbVBhdGg6IEFwcFJlc291cmNlUGF0aCA9IGAke2xhbmd1YWdlTG9jYXRpb259LyR7Z3JhbW1hck5hbWV9Lndhc21gO1xuXHRcdFx0Y29uc3QgW3RyZWVTaXR0ZXIsIGxhbmd1YWdlRmlsZV0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHRoaXMuX3RyZWVTaXR0ZXJJbXBvcnQudmFsdWUsXG5cdFx0XHRcdHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKEZpbGVBY2Nlc3MuYXNGaWxlVXJpKHdhc21QYXRoKSlcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBMYW5ndWFnZSA9IHRyZWVTaXR0ZXIuTGFuZ3VhZ2U7XG5cdFx0XHRjb25zdCBsYW5ndWFnZSA9IGF3YWl0IExhbmd1YWdlLmxvYWQobGFuZ3VhZ2VGaWxlLnZhbHVlLmJ1ZmZlcik7XG5cdFx0XHRyZXR1cm4gbGFuZ3VhZ2U7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2luamVjdGlvblF1ZXJpZXMgPSBuZXcgQ2FjaGVkRnVuY3Rpb24oeyBnZXRDYWNoZUtleTogSlNPTi5zdHJpbmdpZnkgfSwgKGFyZzogeyBsYW5ndWFnZUlkOiBzdHJpbmc7IGtpbmQ6ICdpbmplY3Rpb25zJyB8ICdoaWdobGlnaHRzJyB9KSA9PiB7XG5cdFx0Y29uc3QgbG9hZFF1ZXJ5U291cmNlID0gYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5qZWN0aW9uc1F1ZXJpZXNMb2NhdGlvbjogQXBwUmVzb3VyY2VQYXRoID0gYHZzL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLyR7YXJnLmtpbmR9LyR7YXJnLmxhbmd1YWdlSWR9LnNjbWA7XG5cdFx0XHRjb25zdCB1cmkgPSBGaWxlQWNjZXNzLmFzRmlsZVVyaShpbmplY3Rpb25zUXVlcmllc0xvY2F0aW9uKTtcblx0XHRcdGlmICghdGhpcy5fZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIodXJpKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcXVlcnkgPSBhd2FpdCB0cnlSZWFkRmlsZSh0aGlzLl9maWxlU2VydmljZSwgdXJpKTtcblx0XHRcdGlmIChxdWVyeSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcXVlcnkudmFsdWUudG9TdHJpbmcoKTtcblx0XHR9O1xuXG5cdFx0cmV0dXJuIE9ic2VydmFibGVQcm9taXNlLmZyb21Gbihhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBbXG5cdFx0XHRcdHF1ZXJ5U291cmNlLFxuXHRcdFx0XHRsYW5ndWFnZSxcblx0XHRcdFx0dHJlZVNpdHRlclxuXHRcdFx0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0bG9hZFF1ZXJ5U291cmNlKCksXG5cdFx0XHRcdHRoaXMuX2xhbmd1YWdlc0NhY2hlLmdldChhcmcubGFuZ3VhZ2VJZCkucHJvbWlzZSxcblx0XHRcdFx0dGhpcy5fdHJlZVNpdHRlckltcG9ydC52YWx1ZSxcblx0XHRcdF0pO1xuXG5cdFx0XHRpZiAocXVlcnlTb3VyY2UgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gbnVsbDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgUXVlcnkgPSB0cmVlU2l0dGVyLlF1ZXJ5O1xuXHRcdFx0cmV0dXJuIG5ldyBRdWVyeShsYW5ndWFnZSwgcXVlcnlTb3VyY2UpO1xuXHRcdH0pLnJlc29sdmVkVmFsdWU7XG5cdH0pO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0c3VwcG9ydHNMYW5ndWFnZShsYW5ndWFnZUlkOiBzdHJpbmcsIHJlYWRlcjogSVJlYWRlciB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zdXBwb3J0c0xhbmd1YWdlLmdldChsYW5ndWFnZUlkKS5yZWFkKHJlYWRlcik7XG5cdH1cblxuXHRhc3luYyBnZXRQYXJzZXJDbGFzcygpOiBQcm9taXNlPHR5cGVvZiBQYXJzZXI+IHtcblx0XHRjb25zdCB0cmVlU2l0dGVyID0gYXdhaXQgdGhpcy5fdHJlZVNpdHRlckltcG9ydC52YWx1ZTtcblx0XHRyZXR1cm4gdHJlZVNpdHRlci5QYXJzZXI7XG5cdH1cblxuXHRnZXRMYW5ndWFnZShsYW5ndWFnZUlkOiBzdHJpbmcsIGlnbm9yZVN1cHBvcnRzQ2hlY2s6IGJvb2xlYW4sIHJlYWRlcjogSVJlYWRlciB8IHVuZGVmaW5lZCk6IExhbmd1YWdlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWlnbm9yZVN1cHBvcnRzQ2hlY2sgJiYgIXRoaXMuc3VwcG9ydHNMYW5ndWFnZShsYW5ndWFnZUlkLCByZWFkZXIpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBsYW5nID0gdGhpcy5fbGFuZ3VhZ2VzQ2FjaGUuZ2V0KGxhbmd1YWdlSWQpLnJlc29sdmVkVmFsdWUucmVhZChyZWFkZXIpO1xuXHRcdHJldHVybiBsYW5nO1xuXHR9XG5cblx0YXN5bmMgZ2V0TGFuZ3VhZ2VQcm9taXNlKGxhbmd1YWdlSWQ6IHN0cmluZyk6IFByb21pc2U8TGFuZ3VhZ2UgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fbGFuZ3VhZ2VzQ2FjaGUuZ2V0KGxhbmd1YWdlSWQpLnByb21pc2U7XG5cdH1cblxuXHRnZXRJbmplY3Rpb25RdWVyaWVzKGxhbmd1YWdlSWQ6IHN0cmluZywgcmVhZGVyOiBJUmVhZGVyIHwgdW5kZWZpbmVkKTogUXVlcnkgfCBudWxsIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuc3VwcG9ydHNMYW5ndWFnZShsYW5ndWFnZUlkLCByZWFkZXIpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBxdWVyeSA9IHRoaXMuX2luamVjdGlvblF1ZXJpZXMuZ2V0KHsgbGFuZ3VhZ2VJZCwga2luZDogJ2luamVjdGlvbnMnIH0pLnJlYWQocmVhZGVyKTtcblx0XHRyZXR1cm4gcXVlcnk7XG5cdH1cblxuXHRnZXRIaWdobGlnaHRpbmdRdWVyaWVzKGxhbmd1YWdlSWQ6IHN0cmluZywgcmVhZGVyOiBJUmVhZGVyIHwgdW5kZWZpbmVkKTogUXVlcnkgfCBudWxsIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuc3VwcG9ydHNMYW5ndWFnZShsYW5ndWFnZUlkLCByZWFkZXIpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBxdWVyeSA9IHRoaXMuX2luamVjdGlvblF1ZXJpZXMuZ2V0KHsgbGFuZ3VhZ2VJZCwga2luZDogJ2hpZ2hsaWdodHMnIH0pLnJlYWQocmVhZGVyKTtcblx0XHRyZXR1cm4gcXVlcnk7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVRdWVyeShsYW5ndWFnZTogTGFuZ3VhZ2UsIHF1ZXJ5U291cmNlOiBzdHJpbmcpOiBQcm9taXNlPFF1ZXJ5PiB7XG5cdFx0Y29uc3QgdHJlZVNpdHRlciA9IGF3YWl0IHRoaXMuX3RyZWVTaXR0ZXJJbXBvcnQudmFsdWU7XG5cdFx0cmV0dXJuIG5ldyB0cmVlU2l0dGVyLlF1ZXJ5KGxhbmd1YWdlLCBxdWVyeVNvdXJjZSk7XG5cdH1cbn1cblxuYXN5bmMgZnVuY3Rpb24gdHJ5UmVhZEZpbGUoZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSwgdXJpOiBVUkkpOiBQcm9taXNlPElGaWxlQ29udGVudCB8IHVuZGVmaW5lZD4ge1xuXHR0cnkge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHVyaSk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fSBjYXRjaCAoZSkge1xuXHRcdGlmICh0b0ZpbGVPcGVyYXRpb25SZXN1bHQoZSkgPT09IEZpbGVPcGVyYXRpb25SZXN1bHQuRklMRV9OT1RfRk9VTkQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRocm93IGU7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBT0EsU0FBa0IseUJBQXlCO0FBRTNDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsWUFBWTtBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFCQUFtQyxjQUFjLDZCQUE2QjtBQUN2RixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUNwQyxTQUEwQixZQUFZLDZCQUE2Qix1QkFBdUI7QUFDMUYsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhO0FBR2YsTUFBTSx3Q0FBd0M7QUFDOUMsTUFBTSw2QkFBNkIsQ0FBQyxPQUFPLGNBQWMsT0FBTyxPQUFPO0FBRTlFLE1BQU0sMEJBQTBCO0FBQ2hDLE1BQU0sMkJBQTJCO0FBRTFCLFNBQVMsa0JBQWtCLG9CQUEwRDtBQUMzRixRQUFNLGtCQUFrQixtQkFBbUIsV0FBVyxDQUFDO0FBQ3ZELFNBQU8sR0FBRyxrQkFBa0IsOEJBQThCLGVBQWUsSUFBSSx1QkFBdUI7QUFDckc7QUFFTyxJQUFNLDJCQUFOLGNBQXVDLFdBQWdEO0FBQUEsRUE0RTdGLFlBQ3lDLHVCQUNULGNBQ08scUJBQ3JDO0FBQ0QsVUFBTTtBQUprQztBQUNUO0FB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
