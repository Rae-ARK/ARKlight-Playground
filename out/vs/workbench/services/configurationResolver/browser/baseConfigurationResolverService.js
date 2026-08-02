import { Queue } from "../../../../base/common/async.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { LRUCache } from "../../../../base/common/map.js";
import { Schemas } from "../../../../base/common/network.js";
import * as Types from "../../../../base/common/types.js";
import { isCodeEditor, isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { localize } from "../../../../nls.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../common/editor.js";
import { VariableError, VariableKind } from "../common/configurationResolver.js";
import { ConfigurationResolverExpression } from "../common/configurationResolverExpression.js";
import { AbstractVariableResolverService } from "../common/variableResolver.js";
const LAST_INPUT_STORAGE_KEY = "configResolveInputLru";
const LAST_INPUT_CACHE_SIZE = 5;
class BaseConfigurationResolverService extends AbstractVariableResolverService {
  constructor(context, envVariablesPromise, editorService, configurationService, commandService, workspaceContextService, quickInputService, labelService, pathService, extensionService, storageService) {
    super({
      getFolderUri: (folderName) => {
        const folder = workspaceContextService.getWorkspace().folders.filter((f) => f.name === folderName).pop();
        return folder ? folder.uri : void 0;
      },
      getWorkspaceFolderCount: () => {
        return workspaceContextService.getWorkspace().folders.length;
      },
      getConfigurationValue: (folderUri, section) => {
        return configurationService.getValue(section, folderUri ? { resource: folderUri } : {});
      },
      getAppRoot: () => {
        return context.getAppRoot();
      },
      getExecPath: () => {
        return context.getExecPath();
      },
      getFilePath: () => {
        const fileResource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, {
          supportSideBySide: SideBySideEditor.PRIMARY,
          filterByScheme: [Schemas.file, Schemas.vscodeUserData, this.pathService.defaultUriScheme]
        });
        if (!fileResource) {
          return void 0;
        }
        return this.labelService.getUriLabel(fileResource, { noPrefix: true });
      },
      getWorkspaceFolderPathForFile: () => {
        const fileResource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, {
          supportSideBySide: SideBySideEditor.PRIMARY,
          filterByScheme: [Schemas.file, Schemas.vscodeUserData, this.pathService.defaultUriScheme]
        });
        if (!fileResource) {
          return void 0;
        }
        const wsFolder = workspaceContextService.getWorkspaceFolder(fileResource);
        if (!wsFolder) {
          return void 0;
        }
        return this.labelService.getUriLabel(wsFolder.uri, { noPrefix: true });
      },
      getSelectedText: () => {
        const activeTextEditorControl = editorService.activeTextEditorControl;
        let activeControl = null;
        if (isCodeEditor(activeTextEditorControl)) {
          activeControl = activeTextEditorControl;
        } else if (isDiffEditor(activeTextEditorControl)) {
          const original = activeTextEditorControl.getOriginalEditor();
          const modified = activeTextEditorControl.getModifiedEditor();
          activeControl = original.hasWidgetFocus() ? original : modified;
        }
        const activeModel = activeControl?.getModel();
        const activeSelection = activeControl?.getSelection();
        if (activeModel && activeSelection) {
          return activeModel.getValueInRange(activeSelection);
        }
        return void 0;
      },
      getLineNumber: () => {
        const activeTextEditorControl = editorService.activeTextEditorControl;
        if (isCodeEditor(activeTextEditorControl)) {
          const selection = activeTextEditorControl.getSelection();
          if (selection) {
            const lineNumber = selection.positionLineNumber;
            return String(lineNumber);
          }
        }
        return void 0;
      },
      getColumnNumber: () => {
        const activeTextEditorControl = editorService.activeTextEditorControl;
        if (isCodeEditor(activeTextEditorControl)) {
          const selection = activeTextEditorControl.getSelection();
          if (selection) {
            const columnNumber = selection.positionColumn;
            return String(columnNumber);
          }
        }
        return void 0;
      },
      getExtension: (id) => {
        return extensionService.getExtension(id);
      }
    }, labelService, pathService.userHome().then((home) => home.path), envVariablesPromise);
    this.configurationService = configurationService;
    this.commandService = commandService;
    this.quickInputService = quickInputService;
    this.labelService = labelService;
    this.pathService = pathService;
    this.storageService = storageService;
    this.userInputAccessQueue = new Queue();
    this.resolvableVariables.add("command");
    this.resolvableVariables.add("input");
  }
  async resolveWithInteractionReplace(folder, config, section, variables, target) {
    const parsed = ConfigurationResolverExpression.parse(config);
    const resolved = await this.resolveWithInteraction(folder, parsed, section, variables, target);
    if (resolved === void 0) {
      return void 0;
    }
    return parsed.toObject();
  }
  async resolveWithInteraction(folder, config, section, variableToCommandMap, target) {
    const expr = ConfigurationResolverExpression.parse(config);
    for (const variable of expr.unresolved()) {
      let result;
      if (variable.name === "command") {
        const commandId = (variableToCommandMap ? variableToCommandMap[variable.arg] : void 0) || variable.arg;
        const value = await this.commandService.executeCommand(commandId, expr.toObject());
        if (!Types.isUndefinedOrNull(value)) {
          if (typeof value !== "string") {
            throw new VariableError(VariableKind.Command, localize("commandVariable.noStringType", "Cannot substitute command variable '{0}' because command did not return a result of type string.", commandId));
          }
          result = { value };
        }
      } else if (variable.name === "input") {
        result = await this.showUserInput(section, variable.arg, await this.resolveInputs(folder, section, target), variableToCommandMap);
      } else if (this._contributedVariables.has(variable.inner)) {
        result = { value: await this._contributedVariables.get(variable.inner)() };
      } else {
        const resolvedValue = await this.evaluateSingleVariable(variable, folder?.uri);
        if (resolvedValue === void 0) {
          continue;
        }
        result = typeof resolvedValue === "string" ? { value: resolvedValue } : resolvedValue;
      }
      if (result === void 0) {
        return void 0;
      }
      expr.resolve(variable, result);
    }
    return new Map(Iterable.map(expr.resolved(), ([key, value]) => [key.inner, value.value]));
  }
  async resolveInputs(folder, section, target) {
    if (!section) {
      return void 0;
    }
    let inputs;
    const overrides = folder ? { resource: folder.uri } : {};
    const result = this.configurationService.inspect(section, overrides);
    if (result) {
      switch (target) {
        case ConfigurationTarget.MEMORY:
          inputs = result.memoryValue?.inputs;
          break;
        case ConfigurationTarget.DEFAULT:
          inputs = result.defaultValue?.inputs;
          break;
        case ConfigurationTarget.USER:
          inputs = result.userValue?.inputs;
          break;
        case ConfigurationTarget.USER_LOCAL:
          inputs = result.userLocalValue?.inputs;
          break;
        case ConfigurationTarget.USER_REMOTE:
          inputs = result.userRemoteValue?.inputs;
          break;
        case ConfigurationTarget.APPLICATION:
          inputs = result.applicationValue?.inputs;
          break;
        case ConfigurationTarget.WORKSPACE:
          inputs = result.workspaceValue?.inputs;
          break;
        case ConfigurationTarget.WORKSPACE_FOLDER:
        default:
          inputs = result.workspaceFolderValue?.inputs;
          break;
      }
    }
    inputs ??= this.configurationService.getValue(section, overrides)?.inputs;
    return inputs;
  }
  readInputLru() {
    const contents = this.storageService.get(LAST_INPUT_STORAGE_KEY, StorageScope.WORKSPACE);
    const lru = new LRUCache(LAST_INPUT_CACHE_SIZE);
    try {
      if (contents) {
        lru.fromJSON(JSON.parse(contents));
      }
    } catch {
    }
    return lru;
  }
  storeInputLru(lru) {
    this.storageService.store(LAST_INPUT_STORAGE_KEY, JSON.stringify(lru.toJSON()), StorageScope.WORKSPACE, StorageTarget.MACHINE);
  }
  async showUserInput(section, variable, inputInfos, variableToCommandMap) {
    if (!inputInfos) {
      throw new VariableError(VariableKind.Input, localize("inputVariable.noInputSection", "Variable '{0}' must be defined in an '{1}' section of the debug or task configuration.", variable, "inputs"));
    }
    const info = inputInfos.filter((item) => item.id === variable).pop();
    if (info) {
      const missingAttribute = (attrName) => {
        throw new VariableError(VariableKind.Input, localize("inputVariable.missingAttribute", "Input variable '{0}' is of type '{1}' and must include '{2}'.", variable, info.type, attrName));
      };
      const defaultValueMap = this.readInputLru();
      const defaultValueKey = `${section}.${variable}`;
      const previousPickedValue = defaultValueMap.get(defaultValueKey);
      switch (info.type) {
        case "promptString": {
          if (!Types.isString(info.description)) {
            missingAttribute("description");
          }
          const inputOptions = { prompt: info.description, ignoreFocusLost: true, value: variableToCommandMap?.[`input:${variable}`] ?? previousPickedValue ?? info.default };
          if (info.password) {
            inputOptions.password = info.password;
          }
          return this.userInputAccessQueue.queue(() => this.quickInputService.input(inputOptions)).then((resolvedInput) => {
            if (typeof resolvedInput === "string" && !info.password) {
              this.storeInputLru(defaultValueMap.set(defaultValueKey, resolvedInput));
            }
            return resolvedInput !== void 0 ? { value: resolvedInput, input: info } : void 0;
          });
        }
        case "pickString": {
          if (!Types.isString(info.description)) {
            missingAttribute("description");
          }
          if (Array.isArray(info.options)) {
            for (const pickOption of info.options) {
              if (!Types.isString(pickOption) && !Types.isString(pickOption.value)) {
                missingAttribute("value");
              }
            }
          } else {
            missingAttribute("options");
          }
          const picks = new Array();
          for (const pickOption of info.options) {
            const value = Types.isString(pickOption) ? pickOption : pickOption.value;
            const label = Types.isString(pickOption) ? void 0 : pickOption.label;
            const item = {
              label: label ? `${label}: ${value}` : value,
              value
            };
            const topValue = variableToCommandMap?.[`input:${variable}`] ?? previousPickedValue ?? info.default;
            if (value === info.default) {
              item.description = localize("inputVariable.defaultInputValue", "(Default)");
              picks.unshift(item);
            } else if (value === topValue) {
              picks.unshift(item);
            } else {
              picks.push(item);
            }
          }
          const pickOptions = { placeHolder: info.description, matchOnDetail: true, ignoreFocusLost: true };
          return this.userInputAccessQueue.queue(() => this.quickInputService.pick(picks, pickOptions, void 0)).then((resolvedInput) => {
            if (resolvedInput) {
              const value = resolvedInput.value;
              this.storeInputLru(defaultValueMap.set(defaultValueKey, value));
              return { value, input: info };
            }
            return void 0;
          });
        }
        case "command": {
          if (!Types.isString(info.command)) {
            missingAttribute("command");
          }
          return this.userInputAccessQueue.queue(() => this.commandService.executeCommand(info.command, info.args)).then((result) => {
            if (typeof result === "string" || Types.isUndefinedOrNull(result)) {
              return { value: result, input: info };
            }
            throw new VariableError(VariableKind.Input, localize("inputVariable.command.noStringType", "Cannot substitute input variable '{0}' because command '{1}' did not return a result of type string.", variable, info.command));
          });
        }
        default:
          throw new VariableError(VariableKind.Input, localize("inputVariable.unknownType", "Input variable '{0}' can only be of type 'promptString', 'pickString', or 'command'.", variable));
      }
    }
    throw new VariableError(VariableKind.Input, localize("inputVariable.undefinedVariable", "Undefined input variable '{0}' encountered. Remove or define '{0}' to continue.", variable));
  }
}
BaseConfigurationResolverService.INPUT_OR_COMMAND_VARIABLES_PATTERN = /\${((input|command):(.*?))}/g;
export {
  BaseConfigurationResolverService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9jb25maWd1cmF0aW9uUmVzb2x2ZXIvYnJvd3Nlci9iYXNlQ29uZmlndXJhdGlvblJlc29sdmVyU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgeyBRdWV1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBMUlVDYWNoZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBJUHJvY2Vzc0Vudmlyb25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICogYXMgVHlwZXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIGFzIHVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciwgaXNDb2RlRWRpdG9yLCBpc0RpZmZFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvbk92ZXJyaWRlcywgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IElJbnB1dE9wdGlvbnMsIElQaWNrT3B0aW9ucywgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgSVdvcmtzcGFjZUZvbGRlckRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBTaWRlQnlTaWRlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVBhdGhTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vcGF0aC9jb21tb24vcGF0aFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJlZElucHV0LCBWYXJpYWJsZUVycm9yLCBWYXJpYWJsZUtpbmQgfSBmcm9tICcuLi9jb21tb24vY29uZmlndXJhdGlvblJlc29sdmVyLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24sIElSZXNvbHZlZFZhbHVlIH0gZnJvbSAnLi4vY29tbW9uL2NvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24uanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RWYXJpYWJsZVJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi92YXJpYWJsZVJlc29sdmVyLmpzJztcblxuY29uc3QgTEFTVF9JTlBVVF9TVE9SQUdFX0tFWSA9ICdjb25maWdSZXNvbHZlSW5wdXRMcnUnO1xuY29uc3QgTEFTVF9JTlBVVF9DQUNIRV9TSVpFID0gNTtcblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEJhc2VDb25maWd1cmF0aW9uUmVzb2x2ZXJTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RWYXJpYWJsZVJlc29sdmVyU2VydmljZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElOUFVUX09SX0NPTU1BTkRfVkFSSUFCTEVTX1BBVFRFUk4gPSAvXFwkeygoaW5wdXR8Y29tbWFuZCk6KC4qPykpfS9nO1xuXG5cdHByaXZhdGUgdXNlcklucHV0QWNjZXNzUXVldWUgPSBuZXcgUXVldWU8c3RyaW5nIHwgSVF1aWNrUGlja0l0ZW0gfCB1bmRlZmluZWQ+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGV4dDoge1xuXHRcdFx0Z2V0QXBwUm9vdDogKCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0Z2V0RXhlY1BhdGg6ICgpID0+IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHR9LFxuXHRcdGVudlZhcmlhYmxlc1Byb21pc2U6IFByb21pc2U8SVByb2Nlc3NFbnZpcm9ubWVudD4sXG5cdFx0ZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHR3b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0ZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRnZXRGb2xkZXJVcmk6IChmb2xkZXJOYW1lOiBzdHJpbmcpOiB1cmkgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRjb25zdCBmb2xkZXIgPSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzLmZpbHRlcihmID0+IGYubmFtZSA9PT0gZm9sZGVyTmFtZSkucG9wKCk7XG5cdFx0XHRcdHJldHVybiBmb2xkZXIgPyBmb2xkZXIudXJpIDogdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGdldFdvcmtzcGFjZUZvbGRlckNvdW50OiAoKTogbnVtYmVyID0+IHtcblx0XHRcdFx0cmV0dXJuIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMubGVuZ3RoO1xuXHRcdFx0fSxcblx0XHRcdGdldENvbmZpZ3VyYXRpb25WYWx1ZTogKGZvbGRlclVyaTogdXJpIHwgdW5kZWZpbmVkLCBzZWN0aW9uOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihzZWN0aW9uLCBmb2xkZXJVcmkgPyB7IHJlc291cmNlOiBmb2xkZXJVcmkgfSA6IHt9KTtcblx0XHRcdH0sXG5cdFx0XHRnZXRBcHBSb290OiAoKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0cmV0dXJuIGNvbnRleHQuZ2V0QXBwUm9vdCgpO1xuXHRcdFx0fSxcblx0XHRcdGdldEV4ZWNQYXRoOiAoKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdFx0cmV0dXJuIGNvbnRleHQuZ2V0RXhlY1BhdGgoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRGaWxlUGF0aDogKCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdGNvbnN0IGZpbGVSZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IsIHtcblx0XHRcdFx0XHRzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZLFxuXHRcdFx0XHRcdGZpbHRlckJ5U2NoZW1lOiBbU2NoZW1hcy5maWxlLCBTY2hlbWFzLnZzY29kZVVzZXJEYXRhLCB0aGlzLnBhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWVdXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoIWZpbGVSZXNvdXJjZSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKGZpbGVSZXNvdXJjZSwgeyBub1ByZWZpeDogdHJ1ZSB9KTtcblx0XHRcdH0sXG5cdFx0XHRnZXRXb3Jrc3BhY2VGb2xkZXJQYXRoRm9yRmlsZTogKCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdGNvbnN0IGZpbGVSZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkoZWRpdG9yU2VydmljZS5hY3RpdmVFZGl0b3IsIHtcblx0XHRcdFx0XHRzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZLFxuXHRcdFx0XHRcdGZpbHRlckJ5U2NoZW1lOiBbU2NoZW1hcy5maWxlLCBTY2hlbWFzLnZzY29kZVVzZXJEYXRhLCB0aGlzLnBhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWVdXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAoIWZpbGVSZXNvdXJjZSkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3Qgd3NGb2xkZXIgPSB3b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2VGb2xkZXIoZmlsZVJlc291cmNlKTtcblx0XHRcdFx0aWYgKCF3c0ZvbGRlcikge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHdzRm9sZGVyLnVyaSwgeyBub1ByZWZpeDogdHJ1ZSB9KTtcblx0XHRcdH0sXG5cdFx0XHRnZXRTZWxlY3RlZFRleHQ6ICgpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRjb25zdCBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cblx0XHRcdFx0bGV0IGFjdGl2ZUNvbnRyb2w6IElDb2RlRWRpdG9yIHwgbnVsbCA9IG51bGw7XG5cblx0XHRcdFx0aWYgKGlzQ29kZUVkaXRvcihhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCkpIHtcblx0XHRcdFx0XHRhY3RpdmVDb250cm9sID0gYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaXNEaWZmRWRpdG9yKGFjdGl2ZVRleHRFZGl0b3JDb250cm9sKSkge1xuXHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsID0gYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wuZ2V0T3JpZ2luYWxFZGl0b3IoKTtcblx0XHRcdFx0XHRjb25zdCBtb2RpZmllZCA9IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sLmdldE1vZGlmaWVkRWRpdG9yKCk7XG5cdFx0XHRcdFx0YWN0aXZlQ29udHJvbCA9IG9yaWdpbmFsLmhhc1dpZGdldEZvY3VzKCkgPyBvcmlnaW5hbCA6IG1vZGlmaWVkO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgYWN0aXZlTW9kZWwgPSBhY3RpdmVDb250cm9sPy5nZXRNb2RlbCgpO1xuXHRcdFx0XHRjb25zdCBhY3RpdmVTZWxlY3Rpb24gPSBhY3RpdmVDb250cm9sPy5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdFx0aWYgKGFjdGl2ZU1vZGVsICYmIGFjdGl2ZVNlbGVjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiBhY3RpdmVNb2RlbC5nZXRWYWx1ZUluUmFuZ2UoYWN0aXZlU2VsZWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGdldExpbmVOdW1iZXI6ICgpOiBzdHJpbmcgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRjb25zdCBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCA9IGVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cdFx0XHRcdGlmIChpc0NvZGVFZGl0b3IoYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wpKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gYWN0aXZlVGV4dEVkaXRvckNvbnRyb2wuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRcdFx0aWYgKHNlbGVjdGlvbikge1xuXHRcdFx0XHRcdFx0Y29uc3QgbGluZU51bWJlciA9IHNlbGVjdGlvbi5wb3NpdGlvbkxpbmVOdW1iZXI7XG5cdFx0XHRcdFx0XHRyZXR1cm4gU3RyaW5nKGxpbmVOdW1iZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdGdldENvbHVtbk51bWJlcjogKCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdGNvbnN0IGFjdGl2ZVRleHRFZGl0b3JDb250cm9sID0gZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbDtcblx0XHRcdFx0aWYgKGlzQ29kZUVkaXRvcihhY3RpdmVUZXh0RWRpdG9yQ29udHJvbCkpIHtcblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBhY3RpdmVUZXh0RWRpdG9yQ29udHJvbC5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdFx0XHRpZiAoc2VsZWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBjb2x1bW5OdW1iZXIgPSBzZWxlY3Rpb24ucG9zaXRpb25Db2x1bW47XG5cdFx0XHRcdFx0XHRyZXR1cm4gU3RyaW5nKGNvbHVtbk51bWJlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0RXh0ZW5zaW9uOiBpZCA9PiB7XG5cdFx0XHRcdHJldHVybiBleHRlbnNpb25TZXJ2aWNlLmdldEV4dGVuc2lvbihpZCk7XG5cdFx0XHR9LFxuXHRcdH0sIGxhYmVsU2VydmljZSwgcGF0aFNlcnZpY2UudXNlckhvbWUoKS50aGVuKGhvbWUgPT4gaG9tZS5wYXRoKSwgZW52VmFyaWFibGVzUHJvbWlzZSk7XG5cblx0XHR0aGlzLnJlc29sdmFibGVWYXJpYWJsZXMuYWRkKCdjb21tYW5kJyk7XG5cdFx0dGhpcy5yZXNvbHZhYmxlVmFyaWFibGVzLmFkZCgnaW5wdXQnKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJlc29sdmVXaXRoSW50ZXJhY3Rpb25SZXBsYWNlKGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlckRhdGEgfCB1bmRlZmluZWQsIGNvbmZpZzogdW5rbm93biwgc2VjdGlvbj86IHN0cmluZywgdmFyaWFibGVzPzogSVN0cmluZ0RpY3Rpb25hcnk8c3RyaW5nPiwgdGFyZ2V0PzogQ29uZmlndXJhdGlvblRhcmdldCk6IFByb21pc2U8dW5rbm93bj4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24ucGFyc2UoY29uZmlnKTtcblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IHRoaXMucmVzb2x2ZVdpdGhJbnRlcmFjdGlvbihmb2xkZXIsIHBhcnNlZCwgc2VjdGlvbiwgdmFyaWFibGVzLCB0YXJnZXQpO1xuXG5cdFx0Ly8gU2tpcCBpZiBpbnB1dCB2YXJpYWJsZSB3YXMgY2FuY2VsZWRcblx0XHRpZiAocmVzb2x2ZWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gcGFyc2VkLnRvT2JqZWN0KCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyByZXNvbHZlV2l0aEludGVyYWN0aW9uKGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlckRhdGEgfCB1bmRlZmluZWQsIGNvbmZpZzogdW5rbm93biwgc2VjdGlvbj86IHN0cmluZywgdmFyaWFibGVUb0NvbW1hbmRNYXA/OiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+LCB0YXJnZXQ/OiBDb25maWd1cmF0aW9uVGFyZ2V0KTogUHJvbWlzZTxNYXA8c3RyaW5nLCBzdHJpbmc+IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgZXhwciA9IENvbmZpZ3VyYXRpb25SZXNvbHZlckV4cHJlc3Npb24ucGFyc2UoY29uZmlnKTtcblxuXHRcdC8vIEdldCB2YWx1ZXMgZm9yIGlucHV0IHZhcmlhYmxlcyBmcm9tIFVJXG5cdFx0Zm9yIChjb25zdCB2YXJpYWJsZSBvZiBleHByLnVucmVzb2x2ZWQoKSkge1xuXHRcdFx0bGV0IHJlc3VsdDogSVJlc29sdmVkVmFsdWUgfCB1bmRlZmluZWQ7XG5cblx0XHRcdC8vIENvbW1hbmRcblx0XHRcdGlmICh2YXJpYWJsZS5uYW1lID09PSAnY29tbWFuZCcpIHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZElkID0gKHZhcmlhYmxlVG9Db21tYW5kTWFwID8gdmFyaWFibGVUb0NvbW1hbmRNYXBbdmFyaWFibGUuYXJnIV0gOiB1bmRlZmluZWQpIHx8IHZhcmlhYmxlLmFyZyE7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gYXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChjb21tYW5kSWQsIGV4cHIudG9PYmplY3QoKSk7XG5cdFx0XHRcdGlmICghVHlwZXMuaXNVbmRlZmluZWRPck51bGwodmFsdWUpKSB7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBWYXJpYWJsZUVycm9yKFZhcmlhYmxlS2luZC5Db21tYW5kLCBsb2NhbGl6ZSgnY29tbWFuZFZhcmlhYmxlLm5vU3RyaW5nVHlwZScsIFwiQ2Fubm90IHN1YnN0aXR1dGUgY29tbWFuZCB2YXJpYWJsZSAnezB9JyBiZWNhdXNlIGNvbW1hbmQgZGlkIG5vdCByZXR1cm4gYSByZXN1bHQgb2YgdHlwZSBzdHJpbmcuXCIsIGNvbW1hbmRJZCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXN1bHQgPSB7IHZhbHVlIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIElucHV0XG5cdFx0XHRlbHNlIGlmICh2YXJpYWJsZS5uYW1lID09PSAnaW5wdXQnKSB7XG5cdFx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuc2hvd1VzZXJJbnB1dChzZWN0aW9uISwgdmFyaWFibGUuYXJnISwgYXdhaXQgdGhpcy5yZXNvbHZlSW5wdXRzKGZvbGRlciwgc2VjdGlvbiEsIHRhcmdldCksIHZhcmlhYmxlVG9Db21tYW5kTWFwKTtcblx0XHRcdH1cblx0XHRcdC8vIENvbnRyaWJ1dGVkIHZhcmlhYmxlXG5cdFx0XHRlbHNlIGlmICh0aGlzLl9jb250cmlidXRlZFZhcmlhYmxlcy5oYXModmFyaWFibGUuaW5uZXIpKSB7XG5cdFx0XHRcdHJlc3VsdCA9IHsgdmFsdWU6IGF3YWl0IHRoaXMuX2NvbnRyaWJ1dGVkVmFyaWFibGVzLmdldCh2YXJpYWJsZS5pbm5lcikhKCkgfTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHQvLyBGYWxsYmFjayB0byBwYXJlbnQgZXZhbHVhdGlvblxuXHRcdFx0XHRjb25zdCByZXNvbHZlZFZhbHVlID0gYXdhaXQgdGhpcy5ldmFsdWF0ZVNpbmdsZVZhcmlhYmxlKHZhcmlhYmxlLCBmb2xkZXI/LnVyaSk7XG5cdFx0XHRcdGlmIChyZXNvbHZlZFZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHQvLyBOb3Qgc29tZXRoaW5nIHdlIGNhbiBoYW5kbGVcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXN1bHQgPSB0eXBlb2YgcmVzb2x2ZWRWYWx1ZSA9PT0gJ3N0cmluZycgPyB7IHZhbHVlOiByZXNvbHZlZFZhbHVlIH0gOiByZXNvbHZlZFZhbHVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAocmVzdWx0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Ly8gU2tpcCB0aGUgZW50aXJlIGZsb3cgaWYgYW55IGlucHV0IHZhcmlhYmxlIHdhcyBjYW5jZWxlZFxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRleHByLnJlc29sdmUodmFyaWFibGUsIHJlc3VsdCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBNYXAoSXRlcmFibGUubWFwKGV4cHIucmVzb2x2ZWQoKSwgKFtrZXksIHZhbHVlXSkgPT4gW2tleS5pbm5lciwgdmFsdWUudmFsdWUhXSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXNvbHZlSW5wdXRzKGZvbGRlcjogSVdvcmtzcGFjZUZvbGRlckRhdGEgfCB1bmRlZmluZWQsIHNlY3Rpb246IHN0cmluZywgdGFyZ2V0PzogQ29uZmlndXJhdGlvblRhcmdldCk6IFByb21pc2U8Q29uZmlndXJlZElucHV0W10gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXNlY3Rpb24pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gTG9vayBhdCB3b3Jrc3BhY2UgY29uZmlndXJhdGlvblxuXHRcdGxldCBpbnB1dHM6IENvbmZpZ3VyZWRJbnB1dFtdIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG92ZXJyaWRlczogSUNvbmZpZ3VyYXRpb25PdmVycmlkZXMgPSBmb2xkZXIgPyB7IHJlc291cmNlOiBmb2xkZXIudXJpIH0gOiB7fTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q8eyBpbnB1dHM/OiBDb25maWd1cmVkSW5wdXRbXSB9PihzZWN0aW9uLCBvdmVycmlkZXMpO1xuXG5cdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0c3dpdGNoICh0YXJnZXQpIHtcblx0XHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0Lk1FTU9SWTogaW5wdXRzID0gcmVzdWx0Lm1lbW9yeVZhbHVlPy5pbnB1dHM7IGJyZWFrO1xuXHRcdFx0XHRjYXNlIENvbmZpZ3VyYXRpb25UYXJnZXQuREVGQVVMVDogaW5wdXRzID0gcmVzdWx0LmRlZmF1bHRWYWx1ZT8uaW5wdXRzOyBicmVhaztcblx0XHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVI6IGlucHV0cyA9IHJlc3VsdC51c2VyVmFsdWU/LmlucHV0czsgYnJlYWs7XG5cdFx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMOiBpbnB1dHMgPSByZXN1bHQudXNlckxvY2FsVmFsdWU/LmlucHV0czsgYnJlYWs7XG5cdFx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX1JFTU9URTogaW5wdXRzID0gcmVzdWx0LnVzZXJSZW1vdGVWYWx1ZT8uaW5wdXRzOyBicmVhaztcblx0XHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LkFQUExJQ0FUSU9OOiBpbnB1dHMgPSByZXN1bHQuYXBwbGljYXRpb25WYWx1ZT8uaW5wdXRzOyBicmVhaztcblx0XHRcdFx0Y2FzZSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRTogaW5wdXRzID0gcmVzdWx0LndvcmtzcGFjZVZhbHVlPy5pbnB1dHM7IGJyZWFrO1xuXG5cdFx0XHRcdGNhc2UgQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSOlxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGlucHV0cyA9IHJlc3VsdC53b3Jrc3BhY2VGb2xkZXJWYWx1ZT8uaW5wdXRzO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXG5cdFx0aW5wdXRzID8/PSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPHsgaW5wdXRzPzogQ29uZmlndXJlZElucHV0W10gfT4oc2VjdGlvbiwgb3ZlcnJpZGVzKT8uaW5wdXRzO1xuXG5cdFx0cmV0dXJuIGlucHV0cztcblx0fVxuXG5cdHByaXZhdGUgcmVhZElucHV0THJ1KCk6IExSVUNhY2hlPHN0cmluZywgc3RyaW5nPiB7XG5cdFx0Y29uc3QgY29udGVudHMgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChMQVNUX0lOUFVUX1NUT1JBR0VfS0VZLCBTdG9yYWdlU2NvcGUuV09SS1NQQUNFKTtcblx0XHRjb25zdCBscnUgPSBuZXcgTFJVQ2FjaGU8c3RyaW5nLCBzdHJpbmc+KExBU1RfSU5QVVRfQ0FDSEVfU0laRSk7XG5cdFx0dHJ5IHtcblx0XHRcdGlmIChjb250ZW50cykge1xuXHRcdFx0XHRscnUuZnJvbUpTT04oSlNPTi5wYXJzZShjb250ZW50cykpO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gaWdub3JlZFxuXHRcdH1cblxuXHRcdHJldHVybiBscnU7XG5cdH1cblxuXHRwcml2YXRlIHN0b3JlSW5wdXRMcnUobHJ1OiBMUlVDYWNoZTxzdHJpbmcsIHN0cmluZz4pOiB2b2lkIHtcblx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKExBU1RfSU5QVVRfU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KGxydS50b0pTT04oKSksIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNob3dVc2VySW5wdXQoc2VjdGlvbjogc3RyaW5nLCB2YXJpYWJsZTogc3RyaW5nLCBpbnB1dEluZm9zOiBDb25maWd1cmVkSW5wdXRbXSB8IHVuZGVmaW5lZCwgdmFyaWFibGVUb0NvbW1hbmRNYXA/OiBJU3RyaW5nRGljdGlvbmFyeTxzdHJpbmc+KTogUHJvbWlzZTxJUmVzb2x2ZWRWYWx1ZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICghaW5wdXRJbmZvcykge1xuXHRcdFx0dGhyb3cgbmV3IFZhcmlhYmxlRXJyb3IoVmFyaWFibGVLaW5kLklucHV0LCBsb2NhbGl6ZSgnaW5wdXRWYXJpYWJsZS5ub0lucHV0U2VjdGlvbicsIFwiVmFyaWFibGUgJ3swfScgbXVzdCBiZSBkZWZpbmVkIGluIGFuICd7MX0nIHNlY3Rpb24gb2YgdGhlIGRlYnVnIG9yIHRhc2sgY29uZmlndXJhdGlvbi5cIiwgdmFyaWFibGUsICdpbnB1dHMnKSk7XG5cdFx0fVxuXG5cdFx0Ly8gRmluZCBpbmZvIGZvciB0aGUgZ2l2ZW4gaW5wdXQgdmFyaWFibGVcblx0XHRjb25zdCBpbmZvID0gaW5wdXRJbmZvcy5maWx0ZXIoaXRlbSA9PiBpdGVtLmlkID09PSB2YXJpYWJsZSkucG9wKCk7XG5cdFx0aWYgKGluZm8pIHtcblx0XHRcdGNvbnN0IG1pc3NpbmdBdHRyaWJ1dGUgPSAoYXR0ck5hbWU6IHN0cmluZykgPT4ge1xuXHRcdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcihWYXJpYWJsZUtpbmQuSW5wdXQsIGxvY2FsaXplKCdpbnB1dFZhcmlhYmxlLm1pc3NpbmdBdHRyaWJ1dGUnLCBcIklucHV0IHZhcmlhYmxlICd7MH0nIGlzIG9mIHR5cGUgJ3sxfScgYW5kIG11c3QgaW5jbHVkZSAnezJ9Jy5cIiwgdmFyaWFibGUsIGluZm8udHlwZSwgYXR0ck5hbWUpKTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGRlZmF1bHRWYWx1ZU1hcCA9IHRoaXMucmVhZElucHV0THJ1KCk7XG5cdFx0XHRjb25zdCBkZWZhdWx0VmFsdWVLZXkgPSBgJHtzZWN0aW9ufS4ke3ZhcmlhYmxlfWA7XG5cdFx0XHRjb25zdCBwcmV2aW91c1BpY2tlZFZhbHVlID0gZGVmYXVsdFZhbHVlTWFwLmdldChkZWZhdWx0VmFsdWVLZXkpO1xuXG5cdFx0XHRzd2l0Y2ggKGluZm8udHlwZSkge1xuXHRcdFx0XHRjYXNlICdwcm9tcHRTdHJpbmcnOiB7XG5cdFx0XHRcdFx0aWYgKCFUeXBlcy5pc1N0cmluZyhpbmZvLmRlc2NyaXB0aW9uKSkge1xuXHRcdFx0XHRcdFx0bWlzc2luZ0F0dHJpYnV0ZSgnZGVzY3JpcHRpb24nKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgaW5wdXRPcHRpb25zOiBJSW5wdXRPcHRpb25zID0geyBwcm9tcHQ6IGluZm8uZGVzY3JpcHRpb24sIGlnbm9yZUZvY3VzTG9zdDogdHJ1ZSwgdmFsdWU6IHZhcmlhYmxlVG9Db21tYW5kTWFwPy5bYGlucHV0OiR7dmFyaWFibGV9YF0gPz8gcHJldmlvdXNQaWNrZWRWYWx1ZSA/PyBpbmZvLmRlZmF1bHQgfTtcblx0XHRcdFx0XHRpZiAoaW5mby5wYXNzd29yZCkge1xuXHRcdFx0XHRcdFx0aW5wdXRPcHRpb25zLnBhc3N3b3JkID0gaW5mby5wYXNzd29yZDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMudXNlcklucHV0QWNjZXNzUXVldWUucXVldWUoKCkgPT4gdGhpcy5xdWlja0lucHV0U2VydmljZS5pbnB1dChpbnB1dE9wdGlvbnMpKS50aGVuKHJlc29sdmVkSW5wdXQgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHR5cGVvZiByZXNvbHZlZElucHV0ID09PSAnc3RyaW5nJyAmJiAhaW5mby5wYXNzd29yZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnN0b3JlSW5wdXRMcnUoZGVmYXVsdFZhbHVlTWFwLnNldChkZWZhdWx0VmFsdWVLZXksIHJlc29sdmVkSW5wdXQpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiByZXNvbHZlZElucHV0ICE9PSB1bmRlZmluZWQgPyB7IHZhbHVlOiByZXNvbHZlZElucHV0IGFzIHN0cmluZywgaW5wdXQ6IGluZm8gfSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNhc2UgJ3BpY2tTdHJpbmcnOiB7XG5cdFx0XHRcdFx0aWYgKCFUeXBlcy5pc1N0cmluZyhpbmZvLmRlc2NyaXB0aW9uKSkge1xuXHRcdFx0XHRcdFx0bWlzc2luZ0F0dHJpYnV0ZSgnZGVzY3JpcHRpb24nKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoaW5mby5vcHRpb25zKSkge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBwaWNrT3B0aW9uIG9mIGluZm8ub3B0aW9ucykge1xuXHRcdFx0XHRcdFx0XHRpZiAoIVR5cGVzLmlzU3RyaW5nKHBpY2tPcHRpb24pICYmICFUeXBlcy5pc1N0cmluZyhwaWNrT3B0aW9uLnZhbHVlKSkge1xuXHRcdFx0XHRcdFx0XHRcdG1pc3NpbmdBdHRyaWJ1dGUoJ3ZhbHVlJyk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bWlzc2luZ0F0dHJpYnV0ZSgnb3B0aW9ucycpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGludGVyZmFjZSBQaWNrU3RyaW5nSXRlbSBleHRlbmRzIElRdWlja1BpY2tJdGVtIHtcblx0XHRcdFx0XHRcdHZhbHVlOiBzdHJpbmc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHBpY2tzID0gbmV3IEFycmF5PFBpY2tTdHJpbmdJdGVtPigpO1xuXHRcdFx0XHRcdGZvciAoY29uc3QgcGlja09wdGlvbiBvZiBpbmZvLm9wdGlvbnMpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gVHlwZXMuaXNTdHJpbmcocGlja09wdGlvbikgPyBwaWNrT3B0aW9uIDogcGlja09wdGlvbi52YWx1ZTtcblx0XHRcdFx0XHRcdGNvbnN0IGxhYmVsID0gVHlwZXMuaXNTdHJpbmcocGlja09wdGlvbikgPyB1bmRlZmluZWQgOiBwaWNrT3B0aW9uLmxhYmVsO1xuXG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtOiBQaWNrU3RyaW5nSXRlbSA9IHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGxhYmVsID8gYCR7bGFiZWx9OiAke3ZhbHVlfWAgOiB2YWx1ZSxcblx0XHRcdFx0XHRcdFx0dmFsdWU6IHZhbHVlXG5cdFx0XHRcdFx0XHR9O1xuXG5cdFx0XHRcdFx0XHRjb25zdCB0b3BWYWx1ZSA9IHZhcmlhYmxlVG9Db21tYW5kTWFwPy5bYGlucHV0OiR7dmFyaWFibGV9YF0gPz8gcHJldmlvdXNQaWNrZWRWYWx1ZSA/PyBpbmZvLmRlZmF1bHQ7XG5cdFx0XHRcdFx0XHRpZiAodmFsdWUgPT09IGluZm8uZGVmYXVsdCkge1xuXHRcdFx0XHRcdFx0XHRpdGVtLmRlc2NyaXB0aW9uID0gbG9jYWxpemUoJ2lucHV0VmFyaWFibGUuZGVmYXVsdElucHV0VmFsdWUnLCBcIihEZWZhdWx0KVwiKTtcblx0XHRcdFx0XHRcdFx0cGlja3MudW5zaGlmdChpdGVtKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAodmFsdWUgPT09IHRvcFZhbHVlKSB7XG5cdFx0XHRcdFx0XHRcdHBpY2tzLnVuc2hpZnQoaXRlbSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRwaWNrcy5wdXNoKGl0ZW0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IHBpY2tPcHRpb25zOiBJUGlja09wdGlvbnM8UGlja1N0cmluZ0l0ZW0+ID0geyBwbGFjZUhvbGRlcjogaW5mby5kZXNjcmlwdGlvbiwgbWF0Y2hPbkRldGFpbDogdHJ1ZSwgaWdub3JlRm9jdXNMb3N0OiB0cnVlIH07XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMudXNlcklucHV0QWNjZXNzUXVldWUucXVldWUoKCkgPT4gdGhpcy5xdWlja0lucHV0U2VydmljZS5waWNrKHBpY2tzLCBwaWNrT3B0aW9ucywgdW5kZWZpbmVkKSkudGhlbihyZXNvbHZlZElucHV0ID0+IHtcblx0XHRcdFx0XHRcdGlmIChyZXNvbHZlZElucHV0KSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IHZhbHVlID0gKHJlc29sdmVkSW5wdXQgYXMgUGlja1N0cmluZ0l0ZW0pLnZhbHVlO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnN0b3JlSW5wdXRMcnUoZGVmYXVsdFZhbHVlTWFwLnNldChkZWZhdWx0VmFsdWVLZXksIHZhbHVlKSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IHZhbHVlLCBpbnB1dDogaW5mbyB9O1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNhc2UgJ2NvbW1hbmQnOiB7XG5cdFx0XHRcdFx0aWYgKCFUeXBlcy5pc1N0cmluZyhpbmZvLmNvbW1hbmQpKSB7XG5cdFx0XHRcdFx0XHRtaXNzaW5nQXR0cmlidXRlKCdjb21tYW5kJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB0aGlzLnVzZXJJbnB1dEFjY2Vzc1F1ZXVlLnF1ZXVlKCgpID0+IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQ8c3RyaW5nPihpbmZvLmNvbW1hbmQsIGluZm8uYXJncykpLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdFx0XHRcdGlmICh0eXBlb2YgcmVzdWx0ID09PSAnc3RyaW5nJyB8fCBUeXBlcy5pc1VuZGVmaW5lZE9yTnVsbChyZXN1bHQpKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiB7IHZhbHVlOiByZXN1bHQsIGlucHV0OiBpbmZvIH07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgVmFyaWFibGVFcnJvcihWYXJpYWJsZUtpbmQuSW5wdXQsIGxvY2FsaXplKCdpbnB1dFZhcmlhYmxlLmNvbW1hbmQubm9TdHJpbmdUeXBlJywgXCJDYW5ub3Qgc3Vic3RpdHV0ZSBpbnB1dCB2YXJpYWJsZSAnezB9JyBiZWNhdXNlIGNvbW1hbmQgJ3sxfScgZGlkIG5vdCByZXR1cm4gYSByZXN1bHQgb2YgdHlwZSBzdHJpbmcuXCIsIHZhcmlhYmxlLCBpbmZvLmNvbW1hbmQpKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0dGhyb3cgbmV3IFZhcmlhYmxlRXJyb3IoVmFyaWFibGVLaW5kLklucHV0LCBsb2NhbGl6ZSgnaW5wdXRWYXJpYWJsZS51bmtub3duVHlwZScsIFwiSW5wdXQgdmFyaWFibGUgJ3swfScgY2FuIG9ubHkgYmUgb2YgdHlwZSAncHJvbXB0U3RyaW5nJywgJ3BpY2tTdHJpbmcnLCBvciAnY29tbWFuZCcuXCIsIHZhcmlhYmxlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhyb3cgbmV3IFZhcmlhYmxlRXJyb3IoVmFyaWFibGVLaW5kLklucHV0LCBsb2NhbGl6ZSgnaW5wdXRWYXJpYWJsZS51bmRlZmluZWRWYXJpYWJsZScsIFwiVW5kZWZpbmVkIGlucHV0IHZhcmlhYmxlICd7MH0nIGVuY291bnRlcmVkLiBSZW1vdmUgb3IgZGVmaW5lICd7MH0nIHRvIGNvbnRpbnVlLlwiLCB2YXJpYWJsZSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxTQUFTLGFBQWE7QUFFdEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBRXhCLFlBQVksV0FBVztBQUV2QixTQUFzQixjQUFjLG9CQUFvQjtBQUN4RCxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDJCQUEyRTtBQUdwRixTQUEwQixjQUFjLHFCQUFxQjtBQUU3RCxTQUFTLHdCQUF3Qix3QkFBd0I7QUFJekQsU0FBMEIsZUFBZSxvQkFBb0I7QUFDN0QsU0FBUyx1Q0FBdUQ7QUFDaEUsU0FBUyx1Q0FBdUM7QUFFaEQsTUFBTSx5QkFBeUI7QUFDL0IsTUFBTSx3QkFBd0I7QUFFdkIsTUFBZSx5Q0FBeUMsZ0NBQWdDO0FBQUEsRUFNOUYsWUFDQyxTQUlBLHFCQUNBLGVBQ2lCLHNCQUNBLGdCQUNqQix5QkFDaUIsbUJBQ0EsY0FDQSxhQUNqQixrQkFDaUIsZ0JBQ2hCO0FBQ0QsVUFBTTtBQUFBLE1BQ0wsY0FBYyxDQUFDLGVBQXdDO0FBQ3RELGNBQU0sU0FBUyx3QkFBd0IsYUFBYSxFQUFFLFFBQVEsT0FBTyxPQUFLLEVBQUUsU0FBUyxVQUFVLEVBQUUsSUFBSTtBQUNyRyxlQUFPLFNBQVMsT0FBTyxNQUFNO0FBQUEsTUFDOUI7QUFBQSxNQUNBLHlCQUF5QixNQUFjO0FBQ3RDLGVBQU8sd0JBQXdCLGFBQWEsRUFBRSxRQUFRO0FBQUEsTUFD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
