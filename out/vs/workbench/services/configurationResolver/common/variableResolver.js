import { normalizeDriveLetter } from "../../../../base/common/labels.js";
import * as paths from "../../../../base/common/path.js";
import { isWindows } from "../../../../base/common/platform.js";
import * as process from "../../../../base/common/process.js";
import * as types from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { allVariableKinds, VariableError, VariableKind } from "./configurationResolver.js";
import { ConfigurationResolverExpression } from "./configurationResolverExpression.js";
class AbstractVariableResolverService {
  constructor(_context, _labelService, _userHomePromise, _envVariablesPromise) {
    this._contributedVariables = /* @__PURE__ */ new Map();
    this.resolvableVariables = new Set(allVariableKinds);
    this._context = _context;
    this._labelService = _labelService;
    this._userHomePromise = _userHomePromise;
    if (_envVariablesPromise) {
      this._envVariablesPromise = _envVariablesPromise.then((envVariables) => {
        return this.prepareEnv(envVariables);
      });
    }
  }
  prepareEnv(envVariables) {
    if (isWindows) {
      const ev = /* @__PURE__ */ Object.create(null);
      Object.keys(envVariables).forEach((key) => {
        ev[key.toLowerCase()] = envVariables[key];
      });
      return ev;
    }
    return envVariables;
  }
  async resolveWithEnvironment(environment, folder, value) {
    const expr = ConfigurationResolverExpression.parse(value);
    for (const replacement of expr.unresolved()) {
      const resolvedValue = await this.evaluateSingleVariable(replacement, folder?.uri, environment);
      if (resolvedValue !== void 0) {
        expr.resolve(replacement, String(resolvedValue));
      }
    }
    return expr.toObject();
  }
  async resolveAsync(folder, config) {
    const expr = ConfigurationResolverExpression.parse(config);
    for (const replacement of expr.unresolved()) {
      const resolvedValue = await this.evaluateSingleVariable(replacement, folder?.uri);
      if (resolvedValue !== void 0) {
        expr.resolve(replacement, String(resolvedValue));
      }
    }
    return expr.toObject();
  }
  resolveWithInteractionReplace(folder, config) {
    throw new Error("resolveWithInteractionReplace not implemented.");
  }
  resolveWithInteraction(folder, config) {
    throw new Error("resolveWithInteraction not implemented.");
  }
  contributeVariable(variable, resolution) {
    if (this._contributedVariables.has(variable)) {
      throw new Error("Variable " + variable + " is contributed twice.");
    } else {
      this.resolvableVariables.add(variable);
      this._contributedVariables.set(variable, resolution);
    }
  }
  fsPath(displayUri) {
    return this._labelService ? this._labelService.getUriLabel(displayUri, { noPrefix: true }) : displayUri.fsPath;
  }
  async evaluateSingleVariable(replacement, folderUri, processEnvironment, commandValueMapping) {
    const environment = {
      env: processEnvironment !== void 0 ? this.prepareEnv(processEnvironment) : await this._envVariablesPromise,
      userHome: processEnvironment !== void 0 ? void 0 : await this._userHomePromise
    };
    const { name: variable, arg: argument } = replacement;
    const getFilePath = (variableKind) => {
      const filePath = this._context.getFilePath();
      if (filePath) {
        return normalizeDriveLetter(filePath);
      }
      throw new VariableError(variableKind, localize("canNotResolveFile", "Variable {0} can not be resolved. Please open an editor.", replacement.id));
    };
    const getFolderPathForFile = (variableKind) => {
      const filePath = getFilePath(variableKind);
      if (this._context.getWorkspaceFolderPathForFile) {
        const folderPath = this._context.getWorkspaceFolderPathForFile();
        if (folderPath) {
          return normalizeDriveLetter(folderPath);
        }
      }
      throw new VariableError(variableKind, localize("canNotResolveFolderForFile", "Variable {0}: can not find workspace folder of '{1}'.", replacement.id, paths.basename(filePath)));
    };
    const getFolderUri = (variableKind) => {
      if (argument) {
        const folder = this._context.getFolderUri(argument);
        if (folder) {
          return folder;
        }
        throw new VariableError(variableKind, localize("canNotFindFolder", "Variable {0} can not be resolved. No such folder '{1}'.", variableKind, argument));
      }
      if (folderUri) {
        return folderUri;
      }
      if (this._context.getWorkspaceFolderCount() > 1) {
        throw new VariableError(variableKind, localize("canNotResolveWorkspaceFolderMultiRoot", "Variable {0} can not be resolved in a multi folder workspace. Scope this variable using ':' and a workspace folder name.", variableKind));
      }
      throw new VariableError(variableKind, localize("canNotResolveWorkspaceFolder", "Variable {0} can not be resolved. Please open a folder.", variableKind));
    };
    switch (variable) {
      case "env":
        if (argument) {
          if (environment.env) {
            const env = environment.env[isWindows ? argument.toLowerCase() : argument];
            if (types.isString(env)) {
              return env;
            }
          }
          return "";
        }
        throw new VariableError(VariableKind.Env, localize("missingEnvVarName", "Variable {0} can not be resolved because no environment variable name is given.", replacement.id));
      case "config":
        if (argument) {
          const config = this._context.getConfigurationValue(folderUri, argument);
          if (types.isUndefinedOrNull(config)) {
            throw new VariableError(VariableKind.Config, localize("configNotFound", "Variable {0} can not be resolved because setting '{1}' not found.", replacement.id, argument));
          }
          if (types.isObject(config)) {
            throw new VariableError(VariableKind.Config, localize("configNoString", "Variable {0} can not be resolved because '{1}' is a structured value.", replacement.id, argument));
          }
          return config;
        }
        throw new VariableError(VariableKind.Config, localize("missingConfigName", "Variable {0} can not be resolved because no settings name is given.", replacement.id));
      case "command":
        return this.resolveFromMap(VariableKind.Command, replacement.id, argument, commandValueMapping, "command");
      case "input":
        return this.resolveFromMap(VariableKind.Input, replacement.id, argument, commandValueMapping, "input");
      case "extensionInstallFolder":
        if (argument) {
          const ext = await this._context.getExtension(argument);
          if (!ext) {
            throw new VariableError(VariableKind.ExtensionInstallFolder, localize("extensionNotInstalled", "Variable {0} can not be resolved because the extension {1} is not installed.", replacement.id, argument));
          }
          return this.fsPath(ext.extensionLocation);
        }
        throw new VariableError(VariableKind.ExtensionInstallFolder, localize("missingExtensionName", "Variable {0} can not be resolved because no extension name is given.", replacement.id));
      default: {
        switch (variable) {
          case "workspaceRoot":
          case "workspaceFolder": {
            const uri2 = getFolderUri(VariableKind.WorkspaceFolder);
            return uri2 ? normalizeDriveLetter(this.fsPath(uri2)) : void 0;
          }
          case "cwd": {
            if (!folderUri && !argument) {
              return process.cwd();
            }
            const uri2 = getFolderUri(VariableKind.Cwd);
            return uri2 ? normalizeDriveLetter(this.fsPath(uri2)) : void 0;
          }
          case "workspaceRootFolderName":
          case "workspaceFolderBasename": {
            const uri2 = getFolderUri(VariableKind.WorkspaceFolderBasename);
            return uri2 ? normalizeDriveLetter(paths.basename(this.fsPath(uri2))) : void 0;
          }
          case "userHome":
            if (environment.userHome) {
              return environment.userHome;
            }
            throw new VariableError(VariableKind.UserHome, localize("canNotResolveUserHome", "Variable {0} can not be resolved. UserHome path is not defined", replacement.id));
          case "lineNumber": {
            const lineNumber = this._context.getLineNumber();
            if (lineNumber) {
              return lineNumber;
            }
            throw new VariableError(VariableKind.LineNumber, localize("canNotResolveLineNumber", "Variable {0} can not be resolved. Make sure to have a line selected in the active editor.", replacement.id));
          }
          case "columnNumber": {
            const columnNumber = this._context.getColumnNumber();
            if (columnNumber) {
              return columnNumber;
            }
            throw new Error(localize("canNotResolveColumnNumber", "Variable {0} can not be resolved. Make sure to have a column selected in the active editor.", replacement.id));
          }
          case "selectedText": {
            const selectedText = this._context.getSelectedText();
            if (selectedText) {
              return selectedText;
            }
            throw new VariableError(VariableKind.SelectedText, localize("canNotResolveSelectedText", "Variable {0} can not be resolved. Make sure to have some text selected in the active editor.", replacement.id));
          }
          case "file":
            return getFilePath(VariableKind.File);
          case "fileWorkspaceFolder":
            return getFolderPathForFile(VariableKind.FileWorkspaceFolder);
          case "fileWorkspaceFolderBasename":
            return paths.basename(getFolderPathForFile(VariableKind.FileWorkspaceFolderBasename));
          case "relativeFile":
            if (folderUri || argument) {
              return paths.relative(this.fsPath(getFolderUri(VariableKind.RelativeFile)), getFilePath(VariableKind.RelativeFile));
            }
            return getFilePath(VariableKind.RelativeFile);
          case "relativeFileDirname": {
            const dirname = paths.dirname(getFilePath(VariableKind.RelativeFileDirname));
            if (folderUri || argument) {
              const relative = paths.relative(this.fsPath(getFolderUri(VariableKind.RelativeFileDirname)), dirname);
              return relative.length === 0 ? "." : relative;
            }
            return dirname;
          }
          case "fileDirname":
            return paths.dirname(getFilePath(VariableKind.FileDirname));
          case "fileExtname":
            return paths.extname(getFilePath(VariableKind.FileExtname));
          case "fileBasename":
            return paths.basename(getFilePath(VariableKind.FileBasename));
          case "fileBasenameNoExtension": {
            const basename = paths.basename(getFilePath(VariableKind.FileBasenameNoExtension));
            return basename.slice(0, basename.length - paths.extname(basename).length);
          }
          case "fileDirnameBasename":
            return paths.basename(paths.dirname(getFilePath(VariableKind.FileDirnameBasename)));
          case "execPath": {
            const ep = this._context.getExecPath();
            if (ep) {
              return ep;
            }
            return replacement.id;
          }
          case "execInstallFolder": {
            const ar = this._context.getAppRoot();
            if (ar) {
              return ar;
            }
            return replacement.id;
          }
          case "pathSeparator":
          case "/":
            return paths.sep;
          default: {
            try {
              return this.resolveFromMap(VariableKind.Unknown, replacement.id, argument, commandValueMapping, void 0);
            } catch {
              return replacement.id;
            }
          }
        }
      }
    }
  }
  resolveFromMap(variableKind, match, argument, commandValueMapping, prefix) {
    if (argument && commandValueMapping) {
      const v = prefix === void 0 ? commandValueMapping[argument] : commandValueMapping[prefix + ":" + argument];
      if (typeof v === "string") {
        return v;
      }
      throw new VariableError(variableKind, localize("noValueForCommand", "Variable {0} can not be resolved because the command has no value.", match));
    }
    return match;
  }
}
export {
  AbstractVariableResolverService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvY29tbW9uL3ZhcmlhYmxlUmVzb2x2ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJU3RyaW5nRGljdGlvbmFyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IG5vcm1hbGl6ZURyaXZlTGV0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGFiZWxzLmpzJztcbmltcG9ydCAqIGFzIHBhdGhzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgSVByb2Nlc3NFbnZpcm9ubWVudCwgaXNXaW5kb3dzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICogYXMgcHJvY2VzcyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wcm9jZXNzLmpzJztcbmltcG9ydCAqIGFzIHR5cGVzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSBhcyB1cmkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGFsbFZhcmlhYmxlS2luZHMsIElDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlLCBWYXJpYWJsZUVycm9yLCBWYXJpYWJsZUtpbmQgfSBmcm9tICcuL2NvbmZpZ3VyYXRpb25SZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uLCBJUmVzb2x2ZWRWYWx1ZSwgUmVwbGFjZW1lbnQgfSBmcm9tICcuL2NvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24uanMnO1xuXG5pbnRlcmZhY2UgSVZhcmlhYmxlUmVzb2x2ZUNvbnRleHQge1xuXHRnZXRGb2xkZXJVcmkoZm9sZGVyTmFtZTogc3RyaW5nKTogdXJpIHwgdW5kZWZpbmVkO1xuXHRnZXRXb3Jrc3BhY2VGb2xkZXJDb3VudCgpOiBudW1iZXI7XG5cdGdldENvbmZpZ3VyYXRpb25WYWx1ZShmb2xkZXJVcmk6IHVyaSB8IHVuZGVmaW5lZCwgc2VjdGlvbjogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXRBcHBSb290KCk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Z2V0RXhlY1BhdGgoKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXRGaWxlUGF0aCgpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldFdvcmtzcGFjZUZvbGRlclBhdGhGb3JGaWxlPygpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldFNlbGVjdGVkVGV4dCgpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGdldExpbmVOdW1iZXIoKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXRDb2x1bW5OdW1iZXIoKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRnZXRFeHRlbnNpb24oaWQ6IHN0cmluZyk6IFByb21pc2U8eyByZWFkb25seSBleHRlbnNpb25Mb2NhdGlvbjogdXJpIH0gfCB1bmRlZmluZWQ+O1xufVxuXG50eXBlIEVudmlyb25tZW50ID0geyBlbnY6IElQcm9jZXNzRW52aXJvbm1lbnQgfCB1bmRlZmluZWQ7IHVzZXJIb21lOiBzdHJpbmcgfCB1bmRlZmluZWQgfTtcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0VmFyaWFibGVSZXNvbHZlclNlcnZpY2UgaW1wbGVtZW50cyBJQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfY29udGV4dDogSVZhcmlhYmxlUmVzb2x2ZUNvbnRleHQ7XG5cdHByaXZhdGUgX2xhYmVsU2VydmljZT86IElMYWJlbFNlcnZpY2U7XG5cdHByaXZhdGUgX2VudlZhcmlhYmxlc1Byb21pc2U/OiBQcm9taXNlPElQcm9jZXNzRW52aXJvbm1lbnQ+O1xuXHRwcml2YXRlIF91c2VySG9tZVByb21pc2U/OiBQcm9taXNlPHN0cmluZz47XG5cdHByb3RlY3RlZCBfY29udHJpYnV0ZWRWYXJpYWJsZXM6IE1hcDxzdHJpbmcsICgpID0+IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPj4gPSBuZXcgTWFwKCk7XG5cblx0cHVibGljIHJlYWRvbmx5IHJlc29sdmFibGVWYXJpYWJsZXMgPSBuZXcgU2V0PHN0cmluZz4oYWxsVmFyaWFibGVLaW5kcyk7XG5cblx0Y29uc3RydWN0b3IoX2NvbnRleHQ6IElWYXJpYWJsZVJlc29sdmVDb250ZXh0LCBfbGFiZWxTZXJ2aWNlPzogSUxhYmVsU2VydmljZSwgX3VzZXJIb21lUHJvbWlzZT86IFByb21pc2U8c3RyaW5nPiwgX2VudlZhcmlhYmxlc1Byb21pc2U/OiBQcm9taXNlPElQcm9jZXNzRW52aXJvbm1lbnQ+KSB7XG5cdFx0dGhpcy5fY29udGV4dCA9IF9jb250ZXh0O1xuXHRcdHRoaXMuX2xhYmVsU2VydmljZSA9IF9sYWJlbFNlcnZpY2U7XG5cdFx0dGhpcy5fdXNlckhvbWVQcm9taXNlID0gX3VzZXJIb21lUHJvbWlzZTtcblx0XHRpZiAoX2VudlZhcmlhYmxlc1Byb21pc2UpIHtcblx0XHRcdHRoaXMuX2VudlZhcmlhYmxlc1Byb21pc2UgPSBfZW52VmFyaWFibGVzUHJvbWlzZS50aGVuKGVudlZhcmlhYmxlcyA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnByZXBhcmVFbnYoZW52VmFyaWFibGVzKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcHJlcGFyZUVudihlbnZWYXJpYWJsZXM6IElQcm9jZXNzRW52aXJvbm1lbnQpOiBJUHJvY2Vzc0Vudmlyb25tZW50IHtcblx0XHQvLyB3aW5kb3dzIGVudiB2YXJpYWJsZXMgYXJlIGNhc2UgaW5zZW5zaXRpdmVcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRjb25zdCBldjogSVByb2Nlc3NFbnZpcm9ubWVudCA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0XHRPYmplY3Qua2V5cyhlbnZWYXJpYWJsZXMpLmZvckVhY2goa2V5ID0+IHtcblx0XHRcdFx0ZXZba2V5LnRvTG93ZXJDYXNlKCldID0gZW52VmFyaWFibGVzW2tleV07XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBldjtcblx0XHR9XG5cdFx0cmV0dXJuIGVudlZhcmlhYmxlcztcblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZXNvbHZlV2l0aEVudmlyb25tZW50KGVudmlyb25tZW50OiBJUHJvY2Vzc0Vudmlyb25tZW50LCBmb2xkZXI6IElXb3Jrc3BhY2VGb2xkZXJEYXRhIHwgdW5kZWZpbmVkLCB2YWx1ZTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBleHByID0gQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbi5wYXJzZSh2YWx1ZSk7XG5cblx0XHRmb3IgKGNvbnN0IHJlcGxhY2VtZW50IG9mIGV4cHIudW5yZXNvbHZlZCgpKSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZFZhbHVlID0gYXdhaXQgdGhpcy5ldmFsdWF0ZVNpbmdsZVZhcmlhYmxlKHJlcGxhY2VtZW50LCBmb2xkZXI/LnVyaSwgZW52aXJvbm1lbnQpO1xuXHRcdFx0aWYgKHJlc29sdmVkVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRleHByLnJlc29sdmUocmVwbGFjZW1lbnQsIFN0cmluZyhyZXNvbHZlZFZhbHVlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGV4cHIudG9PYmplY3QoKTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyByZXNvbHZlQXN5bmM8VD4oZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyRGF0YSB8IHVuZGVmaW5lZCwgY29uZmlnOiBUKTogUHJvbWlzZTxUIGV4dGVuZHMgQ29uZmlndXJhdGlvblJlc29sdmVyRXhwcmVzc2lvbjxpbmZlciBSPiA/IFIgOiBUPiB7XG5cdFx0Y29uc3QgZXhwciA9IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24ucGFyc2UoY29uZmlnKTtcblxuXHRcdGZvciAoY29uc3QgcmVwbGFjZW1lbnQgb2YgZXhwci51bnJlc29sdmVkKCkpIHtcblx0XHRcdGNvbnN0IHJlc29sdmVkVmFsdWUgPSBhd2FpdCB0aGlzLmV2YWx1YXRlU2luZ2xlVmFyaWFibGUocmVwbGFjZW1lbnQsIGZvbGRlcj8udXJpKTtcblx0XHRcdGlmIChyZXNvbHZlZFZhbHVlICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0ZXhwci5yZXNvbHZlKHJlcGxhY2VtZW50LCBTdHJpbmcocmVzb2x2ZWRWYWx1ZSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBleHByLnRvT2JqZWN0KCkgYXMgKFQgZXh0ZW5kcyBDb25maWd1cmF0aW9uUmVzb2x2ZXJFeHByZXNzaW9uPGluZmVyIFI+ID8gUiA6IFQpO1xuXHR9XG5cblx0cHVibGljIHJlc29sdmVXaXRoSW50ZXJhY3Rpb25SZXBsYWNlKGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlckRhdGEgfCB1bmRlZmluZWQsIGNvbmZpZzogdW5rbm93bik6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdHRocm93IG5ldyBFcnJvcigncmVzb2x2ZVdpdGhJbnRlcmFjdGlvblJlcGxhY2Ugbm90IGltcGxlbWVudGVkLicpO1xuXHR9XG5cblx0cHVibGljIHJlc29sdmVXaXRoSW50ZXJhY3Rpb24oZm9sZGVyOiBJV29ya3NwYWNlRm9sZGVyRGF0YSB8IHVuZGVmaW5lZCwgY29uZmlnOiB1bmtub3duKTogUHJvbWlzZTxNYXA8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdyZXNvbHZlV2l0aEludGVyYWN0aW9uIG5vdCBpbXBsZW1lbnRlZC4nKTtcblx0fVxuXG5cdHB1YmxpYyBjb250cmlidXRlVmFyaWFibGUodmFyaWFibGU6IHN0cmluZywgcmVzb2x1dGlvbjogKCkgPT4gUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbnRyaWJ1dGVkVmFyaWFibGVzLmhhcyh2YXJpYWJsZSkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVmFyaWFibGUgJyArIHZhcmlhYmxlICsgJyBpcyBjb250cmlidXRlZCB0d2ljZS4nKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZXNvbHZhYmxlVmFyaWFibGVzLmFkZCh2YXJpYWJsZSk7XG5cdFx0XHR0aGlzLl9jb250cmlidXRlZFZhcmlhYmxlcy5zZXQodmFyaWFibGUsIHJlc29sdXRpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZnNQYXRoKGRpc3BsYXlVcmk6IHVyaSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhYmVsU2VydmljZSA/IHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChkaXNwbGF5VXJpLCB7IG5vUHJlZml4OiB0cnVlIH0pIDogZGlzcGxheVVyaS5mc1BhdGg7XG5cdH1cblxuXHRwcm90ZWN0ZWQgYXN5bmMgZXZhbHVhdGVTaW5nbGVWYXJpYWJsZShyZXBsYWNlbWVudDogUmVwbGFjZW1lbnQsIGZvbGRlclVyaTogdXJpIHwgdW5kZWZpbmVkLCBwcm9jZXNzRW52aXJvbm1lbnQ/OiBJUHJvY2Vzc0Vudmlyb25tZW50LCBjb21tYW5kVmFsdWVNYXBwaW5nPzogSVN0cmluZ0RpY3Rpb25hcnk8SVJlc29sdmVkVmFsdWU+KTogUHJvbWlzZTxJUmVzb2x2ZWRWYWx1ZSB8IHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXG5cblx0XHRjb25zdCBlbnZpcm9ubWVudDogRW52aXJvbm1lbnQgPSB7XG5cdFx0XHRlbnY6IChwcm9jZXNzRW52aXJvbm1lbnQgIT09IHVuZGVmaW5lZCkgPyB0aGlzLnByZXBhcmVFbnYocHJvY2Vzc0Vudmlyb25tZW50KSA6IGF3YWl0IHRoaXMuX2VudlZhcmlhYmxlc1Byb21pc2UsXG5cdFx0XHR1c2VySG9tZTogKHByb2Nlc3NFbnZpcm9ubWVudCAhPT0gdW5kZWZpbmVkKSA/IHVuZGVmaW5lZCA6IGF3YWl0IHRoaXMuX3VzZXJIb21lUHJvbWlzZVxuXHRcdH07XG5cblx0XHRjb25zdCB7IG5hbWU6IHZhcmlhYmxlLCBhcmc6IGFyZ3VtZW50IH0gPSByZXBsYWNlbWVudDtcblxuXHRcdC8vIGNvbW1vbiBlcnJvciBoYW5kbGluZyBmb3IgYWxsIHZhcmlhYmxlcyB0aGF0IHJlcXVpcmUgYW4gb3BlbiBlZGl0b3Jcblx0XHRjb25zdCBnZXRGaWxlUGF0aCA9ICh2YXJpYWJsZUtpbmQ6IFZhcmlhYmxlS2luZCk6IHN0cmluZyA9PiB7XG5cdFx0XHRjb25zdCBmaWxlUGF0aCA9IHRoaXMuX2NvbnRleHQuZ2V0RmlsZVBhdGgoKTtcblx0XHRcdGlmIChmaWxlUGF0aCkge1xuXHRcdFx0XHRyZXR1cm4gbm9ybWFsaXplRHJpdmVMZXR0ZXIoZmlsZVBhdGgpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IFZhcmlhYmxlRXJyb3IodmFyaWFibGVLaW5kLCAobG9jYWxpemUoJ2Nhbk5vdFJlc29sdmVGaWxlJywgXCJWYXJpYWJsZSB7MH0gY2FuIG5vdCBiZSByZXNvbHZlZC4gUGxlYXNlIG9wZW4gYW4gZWRpdG9yLlwiLCByZXBsYWNlbWVudC5pZCkpKTtcblx0XHR9O1xuXG5cdFx0Ly8gY29tbW9uIGVycm9yIGhhbmRsaW5nIGZvciBhbGwgdmFyaWFibGVzIHRoYXQgcmVxdWlyZSBhbiBvcGVuIGVkaXRvclxuXHRcdGNvbnN0IGdldEZvbGRlclBhdGhGb3JGaWxlID0gKHZhcmlhYmxlS2luZDogVmFyaWFibGVLaW5kKTogc3RyaW5nID0+IHtcblx0XHRcdGNvbnN0IGZpbGVQYXRoID0gZ2V0RmlsZVBhdGgodmFyaWFibGVLaW5kKTtcdFx0Ly8gdGhyb3dzIGVycm9yIGlmIG5vIGVkaXRvciBvcGVuXG5cdFx0XHRpZiAodGhpcy5fY29udGV4dC5nZXRXb3Jrc3BhY2VGb2xkZXJQYXRoRm9yRmlsZSkge1xuXHRcdFx0XHRjb25zdCBmb2xkZXJQYXRoID0gdGhpcy5fY29udGV4dC5nZXRXb3Jrc3BhY2VGb2xkZXJQYXRoRm9yRmlsZSgpO1xuXHRcdFx0XHRpZiAoZm9sZGVyUGF0aCkge1xuXHRcdFx0XHRcdHJldHVybiBub3JtYWxpemVEcml2ZUxldHRlcihmb2xkZXJQYXRoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IFZhcmlhYmxlRXJyb3IodmFyaWFibGVLaW5kLCBsb2NhbGl6ZSgnY2FuTm90UmVzb2x2ZUZvbGRlckZvckZpbGUnLCBcIlZhcmlhYmxlIHswfTogY2FuIG5vdCBmaW5kIHdvcmtzcGFjZSBmb2xkZXIgb2YgJ3sxfScuXCIsIHJlcGxhY2VtZW50LmlkLCBwYXRocy5iYXNlbmFtZShmaWxlUGF0aCkpKTtcblx0XHR9O1xuXG5cdFx0Ly8gY29tbW9uIGVycm9yIGhhbmRsaW5nIGZvciBhbGwgdmFyaWFibGVzIHRoYXQgcmVxdWlyZSBhbiBvcGVuIGZvbGRlciBhbmQgYWNjZXB0IGEgZm9sZGVyIG5hbWUgYXJndW1lbnRcblx0XHRjb25zdCBnZXRGb2xkZXJVcmkgPSAodmFyaWFibGVLaW5kOiBWYXJpYWJsZUtpbmQpOiB1cmkgPT4ge1xuXHRcdFx0aWYgKGFyZ3VtZW50KSB7XG5cdFx0XHRcdGNvbnN0IGZvbGRlciA9IHRoaXMuX2NvbnRleHQuZ2V0Rm9sZGVyVXJpKGFyZ3VtZW50KTtcblx0XHRcdFx0aWYgKGZvbGRlcikge1xuXHRcdFx0XHRcdHJldHVybiBmb2xkZXI7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IFZhcmlhYmxlRXJyb3IodmFyaWFibGVLaW5kLCBsb2NhbGl6ZSgnY2FuTm90RmluZEZvbGRlcicsIFwiVmFyaWFibGUgezB9IGNhbiBub3QgYmUgcmVzb2x2ZWQuIE5vIHN1Y2ggZm9sZGVyICd7MX0nLlwiLCB2YXJpYWJsZUtpbmQsIGFyZ3VtZW50KSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChmb2xkZXJVcmkpIHtcblx0XHRcdFx0cmV0dXJuIGZvbGRlclVyaTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX2NvbnRleHQuZ2V0V29ya3NwYWNlRm9sZGVyQ291bnQoKSA+IDEpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFZhcmlhYmxlRXJyb3IodmFyaWFibGVLaW5kLCBsb2NhbGl6ZSgnY2FuTm90UmVzb2x2ZVdvcmtzcGFjZUZvbGRlck11bHRpUm9vdCcsIFwiVmFyaWFibGUgezB9IGNhbiBub3QgYmUgcmVzb2x2ZWQgaW4gYSBtdWx0aSBmb2xkZXIgd29ya3NwYWNlLiBTY29wZSB0aGlzIHZhcmlhYmxlIHVzaW5nICc6JyBhbmQgYSB3b3Jrc3BhY2UgZm9sZGVyIG5hbWUuXCIsIHZhcmlhYmxlS2luZCkpO1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IFZhcmlhYmxlRXJyb3IodmFyaWFibGVLaW5kLCBsb2NhbGl6ZSgnY2FuTm90UmVzb2x2ZVdvcmtzcGFjZUZvbGRlcicsIFwiVmFyaWFibGUgezB9IGNhbiBub3QgYmUgcmVzb2x2ZWQuIFBsZWFzZSBvcGVuIGEgZm9sZGVyLlwiLCB2YXJpYWJsZUtpbmQpKTtcblx0XHR9O1xuXG5cdFx0c3dpdGNoICh2YXJpYWJsZSkge1xuXHRcdFx0Y2FzZSAnZW52Jzpcblx0XHRcdFx0aWYgKGFyZ3VtZW50KSB7XG5cdFx0XHRcdFx0aWYgKGVudmlyb25tZW50LmVudikge1xuXHRcdFx0XHRcdFx0Y29uc3QgZW52ID0gZW52aXJvbm1lbnQuZW52W2lzV2luZG93cyA/IGFyZ3VtZW50LnRvTG93ZXJDYXNlKCkgOiBhcmd1bWVudF07XG5cdFx0XHRcdFx0XHRpZiAodHlwZXMuaXNTdHJpbmcoZW52KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZW52O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IFZhcmlhYmxlRXJyb3IoVmFyaWFibGVLaW5kLkVudiwgbG9jYWxpemUoJ21pc3NpbmdFbnZWYXJOYW1lJywgXCJWYXJpYWJsZSB7MH0gY2FuIG5vdCBiZSByZXNvbHZlZCBiZWNhdXNlIG5vIGVudmlyb25tZW50IHZhcmlhYmxlIG5hbWUgaXMgZ2l2ZW4uXCIsIHJlcGxhY2VtZW50LmlkKSk7XG5cblx0XHRcdGNhc2UgJ2NvbmZpZyc6XG5cdFx0XHRcdGlmIChhcmd1bWVudCkge1xuXHRcdFx0XHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2NvbnRleHQuZ2V0Q29uZmlndXJhdGlvblZhbHVlKGZvbGRlclVyaSwgYXJndW1lbnQpO1xuXHRcdFx0XHRcdGlmICh0eXBlcy5pc1VuZGVmaW5lZE9yTnVsbChjb25maWcpKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcihWYXJpYWJsZUtpbmQuQ29uZmlnLCBsb2NhbGl6ZSgnY29uZmlnTm90Rm91bmQnLCBcIlZhcmlhYmxlIHswfSBjYW4gbm90IGJlIHJlc29sdmVkIGJlY2F1c2Ugc2V0dGluZyAnezF9JyBub3QgZm91bmQuXCIsIHJlcGxhY2VtZW50LmlkLCBhcmd1bWVudCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAodHlwZXMuaXNPYmplY3QoY29uZmlnKSkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IFZhcmlhYmxlRXJyb3IoVmFyaWFibGVLaW5kLkNvbmZpZywgbG9jYWxpemUoJ2NvbmZpZ05vU3RyaW5nJywgXCJWYXJpYWJsZSB7MH0gY2FuIG5vdCBiZSByZXNvbHZlZCBiZWNhdXNlICd7MX0nIGlzIGEgc3RydWN0dXJlZCB2YWx1ZS5cIiwgcmVwbGFjZW1lbnQuaWQsIGFyZ3VtZW50KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBjb25maWc7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgbmV3IFZhcmlhYmxlRXJyb3IoVmFyaWFibGVLaW5kLkNvbmZpZywgbG9jYWxpemUoJ21pc3NpbmdDb25maWdOYW1lJywgXCJWYXJpYWJsZSB7MH0gY2FuIG5vdCBiZSByZXNvbHZlZCBiZWNhdXNlIG5vIHNldHRpbmdzIG5hbWUgaXMgZ2l2ZW4uXCIsIHJlcGxhY2VtZW50LmlkKSk7XG5cblx0XHRcdGNhc2UgJ2NvbW1hbmQnOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlRnJvbU1hcChWYXJpYWJsZUtpbmQuQ29tbWFuZCwgcmVwbGFjZW1lbnQuaWQsIGFyZ3VtZW50LCBjb21tYW5kVmFsdWVNYXBwaW5nLCAnY29tbWFuZCcpO1xuXG5cdFx0XHRjYXNlICdpbnB1dCc6XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlc29sdmVGcm9tTWFwKFZhcmlhYmxlS2luZC5JbnB1dCwgcmVwbGFjZW1lbnQuaWQsIGFyZ3VtZW50LCBjb21tYW5kVmFsdWVNYXBwaW5nLCAnaW5wdXQnKTtcblxuXHRcdFx0Y2FzZSAnZXh0ZW5zaW9uSW5zdGFsbEZvbGRlcic6XG5cdFx0XHRcdGlmIChhcmd1bWVudCkge1xuXHRcdFx0XHRcdGNvbnN0IGV4dCA9IGF3YWl0IHRoaXMuX2NvbnRleHQuZ2V0RXh0ZW5zaW9uKGFyZ3VtZW50KTtcblx0XHRcdFx0XHRpZiAoIWV4dCkge1xuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IFZhcmlhYmxlRXJyb3IoVmFyaWFibGVLaW5kLkV4dGVuc2lvbkluc3RhbGxGb2xkZXIsIGxvY2FsaXplKCdleHRlbnNpb25Ob3RJbnN0YWxsZWQnLCBcIlZhcmlhYmxlIHswfSBjYW4gbm90IGJlIHJlc29sdmVkIGJlY2F1c2UgdGhlIGV4dGVuc2lvbiB7MX0gaXMgbm90IGluc3RhbGxlZC5cIiwgcmVwbGFjZW1lbnQuaWQsIGFyZ3VtZW50KSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB0aGlzLmZzUGF0aChleHQuZXh0ZW5zaW9uTG9jYXRpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRocm93IG5ldyBWYXJpYWJsZUVycm9yKFZhcmlhYmxlS2luZC5FeHRlbnNpb25JbnN0YWxsRm9sZGVyLCBsb2NhbGl6ZSgnbWlzc2luZ0V4dGVuc2lvbk5hbWUnLCBcIlZhcmlhYmxlIHswfSBjYW4gbm90IGJlIHJlc29sdmVkIGJlY2F1c2Ugbm8gZXh0ZW5zaW9uIG5hbWUgaXMgZ2l2ZW4uXCIsIHJlcGxhY2VtZW50LmlkKSk7XG5cblx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0c3dpdGNoICh2YXJpYWJsZSkge1xuXHRcdFx0XHRcdGNhc2UgJ3dvcmtzcGFjZVJvb3QnOlxuXHRcdFx0XHRcdGNhc2UgJ3dvcmtzcGFjZUZvbGRlcic6IHtcblx0XHRcdFx0XHRcdGNvbnN0IHVyaSA9IGdldEZvbGRlclVyaShWYXJpYWJsZUtpbmQuV29ya3NwYWNlRm9sZGVyKTtcblx0XHRcdFx0XHRcdHJldHVybiB1cmkgPyBub3JtYWxpemVEcml2ZUxldHRlcih0aGlzLmZzUGF0aCh1cmkpKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjYXNlICdjd2QnOiB7XG5cdFx0XHRcdFx0XHRpZiAoIWZvbGRlclVyaSAmJiAhYXJndW1lbnQpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHByb2Nlc3MuY3dkKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCB1cmkgPSBnZXRGb2xkZXJVcmkoVmFyaWFibGVLaW5kLkN3ZCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdXJpID8gbm9ybWFsaXplRHJpdmVMZXR0ZXIodGhpcy5mc1BhdGgodXJpKSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y2FzZSAnd29ya3NwYWNlUm9vdEZvbGRlck5hbWUnOlxuXHRcdFx0XHRcdGNhc2UgJ3dvcmtzcGFjZUZvbGRlckJhc2VuYW1lJzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgdXJpID0gZ2V0Rm9sZGVyVXJpKFZhcmlhYmxlS2luZC5Xb3Jrc3BhY2VGb2xkZXJCYXNlbmFtZSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdXJpID8gbm9ybWFsaXplRHJpdmVMZXR0ZXIocGF0aHMuYmFzZW5hbWUodGhpcy5mc1BhdGgodXJpKSkpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNhc2UgJ3VzZXJIb21lJzpcblx0XHRcdFx0XHRcdGlmIChlbnZpcm9ubWVudC51c2VySG9tZSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZW52aXJvbm1lbnQudXNlckhvbWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcihWYXJpYWJsZUtpbmQuVXNlckhvbWUsIGxvY2FsaXplKCdjYW5Ob3RSZXNvbHZlVXNlckhvbWUnLCBcIlZhcmlhYmxlIHswfSBjYW4gbm90IGJlIHJlc29sdmVkLiBVc2VySG9tZSBwYXRoIGlzIG5vdCBkZWZpbmVkXCIsIHJlcGxhY2VtZW50LmlkKSk7XG5cblx0XHRcdFx0XHRjYXNlICdsaW5lTnVtYmVyJzoge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHRoaXMuX2NvbnRleHQuZ2V0TGluZU51bWJlcigpO1xuXHRcdFx0XHRcdFx0aWYgKGxpbmVOdW1iZXIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcihWYXJpYWJsZUtpbmQuTGluZU51bWJlciwgbG9jYWxpemUoJ2Nhbk5vdFJlc29sdmVMaW5lTnVtYmVyJywgXCJWYXJpYWJsZSB7MH0gY2FuIG5vdCBiZSByZXNvbHZlZC4gTWFrZSBzdXJlIHRvIGhhdmUgYSBsaW5lIHNlbGVjdGVkIGluIHRoZSBhY3RpdmUgZWRpdG9yLlwiLCByZXBsYWNlbWVudC5pZCkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNhc2UgJ2NvbHVtbk51bWJlcic6IHtcblx0XHRcdFx0XHRcdGNvbnN0IGNvbHVtbk51bWJlciA9IHRoaXMuX2NvbnRleHQuZ2V0Q29sdW1uTnVtYmVyKCk7XG5cdFx0XHRcdFx0XHRpZiAoY29sdW1uTnVtYmVyKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBjb2x1bW5OdW1iZXI7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IobG9jYWxpemUoJ2Nhbk5vdFJlc29sdmVDb2x1bW5OdW1iZXInLCBcIlZhcmlhYmxlIHswfSBjYW4gbm90IGJlIHJlc29sdmVkLiBNYWtlIHN1cmUgdG8gaGF2ZSBhIGNvbHVtbiBzZWxlY3RlZCBpbiB0aGUgYWN0aXZlIGVkaXRvci5cIiwgcmVwbGFjZW1lbnQuaWQpKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjYXNlICdzZWxlY3RlZFRleHQnOiB7XG5cdFx0XHRcdFx0XHRjb25zdCBzZWxlY3RlZFRleHQgPSB0aGlzLl9jb250ZXh0LmdldFNlbGVjdGVkVGV4dCgpO1xuXHRcdFx0XHRcdFx0aWYgKHNlbGVjdGVkVGV4dCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gc2VsZWN0ZWRUZXh0O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0dGhyb3cgbmV3IFZhcmlhYmxlRXJyb3IoVmFyaWFibGVLaW5kLlNlbGVjdGVkVGV4dCwgbG9jYWxpemUoJ2Nhbk5vdFJlc29sdmVTZWxlY3RlZFRleHQnLCBcIlZhcmlhYmxlIHswfSBjYW4gbm90IGJlIHJlc29sdmVkLiBNYWtlIHN1cmUgdG8gaGF2ZSBzb21lIHRleHQgc2VsZWN0ZWQgaW4gdGhlIGFjdGl2ZSBlZGl0b3IuXCIsIHJlcGxhY2VtZW50LmlkKSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y2FzZSAnZmlsZSc6XG5cdFx0XHRcdFx0XHRyZXR1cm4gZ2V0RmlsZVBhdGgoVmFyaWFibGVLaW5kLkZpbGUpO1xuXG5cdFx0XHRcdFx0Y2FzZSAnZmlsZVdvcmtzcGFjZUZvbGRlcic6XG5cdFx0XHRcdFx0XHRyZXR1cm4gZ2V0Rm9sZGVyUGF0aEZvckZpbGUoVmFyaWFibGVLaW5kLkZpbGVXb3Jrc3BhY2VGb2xkZXIpO1xuXG5cdFx0XHRcdFx0Y2FzZSAnZmlsZVdvcmtzcGFjZUZvbGRlckJhc2VuYW1lJzpcblx0XHRcdFx0XHRcdHJldHVybiBwYXRocy5iYXNlbmFtZShnZXRGb2xkZXJQYXRoRm9yRmlsZShWYXJpYWJsZUtpbmQuRmlsZVdvcmtzcGFjZUZvbGRlckJhc2VuYW1lKSk7XG5cblx0XHRcdFx0XHRjYXNlICdyZWxhdGl2ZUZpbGUnOlxuXHRcdFx0XHRcdFx0aWYgKGZvbGRlclVyaSB8fCBhcmd1bWVudCkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcGF0aHMucmVsYXRpdmUodGhpcy5mc1BhdGgoZ2V0Rm9sZGVyVXJpKFZhcmlhYmxlS2luZC5SZWxhdGl2ZUZpbGUpKSwgZ2V0RmlsZVBhdGgoVmFyaWFibGVLaW5kLlJlbGF0aXZlRmlsZSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIGdldEZpbGVQYXRoKFZhcmlhYmxlS2luZC5SZWxhdGl2ZUZpbGUpO1xuXG5cdFx0XHRcdFx0Y2FzZSAncmVsYXRpdmVGaWxlRGlybmFtZSc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IGRpcm5hbWUgPSBwYXRocy5kaXJuYW1lKGdldEZpbGVQYXRoKFZhcmlhYmxlS2luZC5SZWxhdGl2ZUZpbGVEaXJuYW1lKSk7XG5cdFx0XHRcdFx0XHRpZiAoZm9sZGVyVXJpIHx8IGFyZ3VtZW50KSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHJlbGF0aXZlID0gcGF0aHMucmVsYXRpdmUodGhpcy5mc1BhdGgoZ2V0Rm9sZGVyVXJpKFZhcmlhYmxlS2luZC5SZWxhdGl2ZUZpbGVEaXJuYW1lKSksIGRpcm5hbWUpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gcmVsYXRpdmUubGVuZ3RoID09PSAwID8gJy4nIDogcmVsYXRpdmU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRyZXR1cm4gZGlybmFtZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjYXNlICdmaWxlRGlybmFtZSc6XG5cdFx0XHRcdFx0XHRyZXR1cm4gcGF0aHMuZGlybmFtZShnZXRGaWxlUGF0aChWYXJpYWJsZUtpbmQuRmlsZURpcm5hbWUpKTtcblxuXHRcdFx0XHRcdGNhc2UgJ2ZpbGVFeHRuYW1lJzpcblx0XHRcdFx0XHRcdHJldHVybiBwYXRocy5leHRuYW1lKGdldEZpbGVQYXRoKFZhcmlhYmxlS2luZC5GaWxlRXh0bmFtZSkpO1xuXG5cdFx0XHRcdFx0Y2FzZSAnZmlsZUJhc2VuYW1lJzpcblx0XHRcdFx0XHRcdHJldHVybiBwYXRocy5iYXNlbmFtZShnZXRGaWxlUGF0aChWYXJpYWJsZUtpbmQuRmlsZUJhc2VuYW1lKSk7XG5cblx0XHRcdFx0XHRjYXNlICdmaWxlQmFzZW5hbWVOb0V4dGVuc2lvbic6IHtcblx0XHRcdFx0XHRcdGNvbnN0IGJhc2VuYW1lID0gcGF0aHMuYmFzZW5hbWUoZ2V0RmlsZVBhdGgoVmFyaWFibGVLaW5kLkZpbGVCYXNlbmFtZU5vRXh0ZW5zaW9uKSk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gKGJhc2VuYW1lLnNsaWNlKDAsIGJhc2VuYW1lLmxlbmd0aCAtIHBhdGhzLmV4dG5hbWUoYmFzZW5hbWUpLmxlbmd0aCkpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNhc2UgJ2ZpbGVEaXJuYW1lQmFzZW5hbWUnOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHBhdGhzLmJhc2VuYW1lKHBhdGhzLmRpcm5hbWUoZ2V0RmlsZVBhdGgoVmFyaWFibGVLaW5kLkZpbGVEaXJuYW1lQmFzZW5hbWUpKSk7XG5cblx0XHRcdFx0XHRjYXNlICdleGVjUGF0aCc6IHtcblx0XHRcdFx0XHRcdGNvbnN0IGVwID0gdGhpcy5fY29udGV4dC5nZXRFeGVjUGF0aCgpO1xuXHRcdFx0XHRcdFx0aWYgKGVwKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBlcDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiByZXBsYWNlbWVudC5pZDtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjYXNlICdleGVjSW5zdGFsbEZvbGRlcic6IHtcblx0XHRcdFx0XHRcdGNvbnN0IGFyID0gdGhpcy5fY29udGV4dC5nZXRBcHBSb290KCk7XG5cdFx0XHRcdFx0XHRpZiAoYXIpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGFyO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHJlcGxhY2VtZW50LmlkO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNhc2UgJ3BhdGhTZXBhcmF0b3InOlxuXHRcdFx0XHRcdGNhc2UgJy8nOlxuXHRcdFx0XHRcdFx0cmV0dXJuIHBhdGhzLnNlcDtcblxuXHRcdFx0XHRcdGRlZmF1bHQ6IHtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB0aGlzLnJlc29sdmVGcm9tTWFwKFZhcmlhYmxlS2luZC5Vbmtub3duLCByZXBsYWNlbWVudC5pZCwgYXJndW1lbnQsIGNvbW1hbmRWYWx1ZU1hcHBpbmcsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIHJlcGxhY2VtZW50LmlkO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVzb2x2ZUZyb21NYXAodmFyaWFibGVLaW5kOiBWYXJpYWJsZUtpbmQsIG1hdGNoOiBzdHJpbmcsIGFyZ3VtZW50OiBzdHJpbmcgfCB1bmRlZmluZWQsIGNvbW1hbmRWYWx1ZU1hcHBpbmc6IElTdHJpbmdEaWN0aW9uYXJ5PElSZXNvbHZlZFZhbHVlPiB8IHVuZGVmaW5lZCwgcHJlZml4OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRcdGlmIChhcmd1bWVudCAmJiBjb21tYW5kVmFsdWVNYXBwaW5nKSB7XG5cdFx0XHRjb25zdCB2ID0gKHByZWZpeCA9PT0gdW5kZWZpbmVkKSA/IGNvbW1hbmRWYWx1ZU1hcHBpbmdbYXJndW1lbnRdIDogY29tbWFuZFZhbHVlTWFwcGluZ1twcmVmaXggKyAnOicgKyBhcmd1bWVudF07XG5cdFx0XHRpZiAodHlwZW9mIHYgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdHJldHVybiB2O1xuXHRcdFx0fVxuXHRcdFx0dGhyb3cgbmV3IFZhcmlhYmxlRXJyb3IodmFyaWFibGVLaW5kLCBsb2NhbGl6ZSgnbm9WYWx1ZUZvckNvbW1hbmQnLCBcIlZhcmlhYmxlIHswfSBjYW4gbm90IGJlIHJlc29sdmVkIGJlY2F1c2UgdGhlIGNvbW1hbmQgaGFzIG5vIHZhbHVlLlwiLCBtYXRjaCkpO1xuXHRcdH1cblx0XHRyZXR1cm4gbWF0Y2g7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsNEJBQTRCO0FBQ3JDLFlBQVksV0FBVztBQUN2QixTQUE4QixpQkFBaUI7QUFDL0Ms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QUFBLFVBRTNELEtBQUs7QUFDSixtQkFBTyxNQUFNLFFBQVEsWUFBWSxhQUFhLFdBQVcsQ0FBQztBQUFBLFVBRTNELEtBQUs7QUFDSixtQkFBTyxNQUFNLFNBQVMsWUFBWSxhQUFhLFlBQVksQ0FBQztBQUFBLFVBRTdELEtBQUssMkJBQTJCO0FBQy9CLGtCQUFNLFdBQVcsTUFBTSxTQUFTLFlBQVksYUFBYSx1QkFBdUIsQ0FBQztBQUNqRixtQkFBUSxTQUFTLE1BQU0sR0FBRyxTQUFTLFNBQVMsTUFBTSxRQUFRLFFBQVEsRUFBRSxNQUFNO0FBQUEsVUFDM0U7QUFBQSxVQUVBLEtBQUs7QUFDSixtQkFBTyxNQUFNLFNBQVMsTUFBTSxRQUFRLFlBQVksYUFBYSxtQkFBbUIsQ0FBQyxDQUFDO0FBQUEsVUFFbkYsS0FBSyxZQUFZO0FBQ2hCLGtCQUFNLEtBQUssS0FBSyxTQUFTLFlBQVk7QUFDckMsZ0JBQUksSUFBSTtBQUNQLHFCQUFPO0FBQUEsWUFDUjtBQUNBLG1CQUFPLFlBQVk7QUFBQSxVQUNwQjtBQUFBLFVBRUEsS0FBSyxxQkFBcUI7QUFDekIsa0JBQU0sS0FBSyxLQUFLLFNBQVMsV0FBVztBQUNwQyxnQkFBSSxJQUFJO0FBQ1AscUJBQU87QUFBQSxZQUNSO0FBQ0EsbUJBQU8sWUFBWTtBQUFBLFVBQ3BCO0FBQUEsVUFFQSxLQUFLO0FBQUEsVUFDTCxLQUFLO0FBQ0osbUJBQU8sTUFBTTtBQUFBLFVBRWQsU0FBUztBQUNSLGdCQUFJO0FBQ0gscUJBQU8sS0FBSyxlQUFlLGFBQWEsU0FBUyxZQUFZLElBQUksVUFBVSxxQkFBcUIsTUFBUztBQUFBLFlBQzFHLFFBQVE7QUFDUCxxQkFBTyxZQUFZO0FBQUEsWUFDcEI7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsZUFBZSxjQUE0QixPQUFlLFVBQThCLHFCQUFvRSxRQUFvQztBQUN2TSxRQUFJLFlBQVkscUJBQXFCO0FBQ3BDLFlBQU0sSUFBSyxXQUFXLFNBQWEsb0JBQW9CLFFBQVEsSUFBSSxvQkFBb0IsU0FBUyxNQUFNLFFBQVE7QUFDOUcsVUFBSSxPQUFPLE1BQU0sVUFBVTtBQUMxQixlQUFPO0FBQUEsTUFDUjtBQUNBLFlBQU0sSUFBSSxjQUFjLGNBQWMsU0FBUyxxQkFBcUIsc0VBQXNFLEtBQUssQ0FBQztBQUFBLElBQ2pKO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDsiLAogICJuYW1lcyI6IFsidXJpIl0KfQo=
