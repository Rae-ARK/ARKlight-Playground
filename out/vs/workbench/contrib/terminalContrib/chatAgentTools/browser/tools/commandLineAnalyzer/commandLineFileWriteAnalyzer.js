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
import { Disposable } from "../../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { win32, posix } from "../../../../../../../base/common/path.js";
import { extUri, normalizePath } from "../../../../../../../base/common/resources.js";
import { localize } from "../../../../../../../nls.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { IWorkspaceContextService } from "../../../../../../../platform/workspace/common/workspace.js";
import { TerminalChatAgentToolsSettingId } from "../../../common/terminalChatAgentToolsConfiguration.js";
import { TreeSitterCommandParserLanguage } from "../../treeSitterCommandParser.js";
import { OperatingSystem } from "../../../../../../../base/common/platform.js";
import { isString } from "../../../../../../../base/common/types.js";
import { ILabelService } from "../../../../../../../platform/label/common/label.js";
const nullDevice = /* @__PURE__ */ Symbol("null device");
let CommandLineFileWriteAnalyzer = class extends Disposable {
  constructor(_treeSitterCommandParser, _log, _configurationService, _labelService, _workspaceContextService) {
    super();
    this._treeSitterCommandParser = _treeSitterCommandParser;
    this._log = _log;
    this._configurationService = _configurationService;
    this._labelService = _labelService;
    this._workspaceContextService = _workspaceContextService;
  }
  async analyze(options) {
    let fileWrites;
    try {
      fileWrites = await this._getFileWrites(options);
    } catch (e) {
      console.error(e);
      this._log("Failed to get file writes via grammar", options.treeSitterLanguage);
      return {
        isAutoApproveAllowed: false
      };
    }
    return this._getResult(options, fileWrites);
  }
  async _getFileWrites(options) {
    let fileWrites = [];
    const capturedFileWrites = (await this._treeSitterCommandParser.getFileWrites(options.treeSitterLanguage, options.commandLine)).map(this._mapNullDevice.bind(this, options));
    const commandFileWrites = (await this._treeSitterCommandParser.getCommandFileWrites(options.treeSitterLanguage, options.commandLine)).map(this._mapNullDevice.bind(this, options));
    const allCapturedFileWrites = [...capturedFileWrites, ...commandFileWrites];
    if (allCapturedFileWrites.length) {
      const cwd = options.cwd;
      if (cwd) {
        this._log("Detected cwd", cwd.toString());
        fileWrites = allCapturedFileWrites.map((e) => {
          if (e === nullDevice) {
            return e;
          }
          if (/^['"].*['"]$/.test(e)) {
            e = this._stripSurroundingQuotes(e);
          }
          const isAbsolute = options.os === OperatingSystem.Windows ? win32.isAbsolute(e) : posix.isAbsolute(e);
          if (isAbsolute) {
            return cwd.with({ path: e });
          }
          return URI.joinPath(cwd, e);
        });
      } else {
        this._log("Cwd could not be detected");
        fileWrites = allCapturedFileWrites;
      }
    }
    this._log("File writes detected", fileWrites.map((e) => e.toString()));
    return fileWrites;
  }
  _stripSurroundingQuotes(text) {
    let result = text;
    while (result.startsWith('"') && result.endsWith('"') || result.startsWith("'") && result.endsWith("'")) {
      result = result.slice(1, -1);
    }
    return result;
  }
  _mapNullDevice(options, rawFileWrite) {
    if (options.treeSitterLanguage === TreeSitterCommandParserLanguage.PowerShell) {
      return rawFileWrite === "$null" ? nullDevice : rawFileWrite;
    }
    return rawFileWrite === "/dev/null" ? nullDevice : rawFileWrite;
  }
  _getResult(options, fileWrites) {
    let isAutoApproveAllowed = true;
    if (fileWrites.length > 0) {
      const blockDetectedFileWrites = this._configurationService.getValue(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites);
      switch (blockDetectedFileWrites) {
        case "all": {
          isAutoApproveAllowed = false;
          this._log('File writes blocked due to "all" setting');
          break;
        }
        case "outsideWorkspace": {
          const workspaceFolders = this._workspaceContextService.getWorkspace().folders;
          if (workspaceFolders.length > 0) {
            for (const fileWrite of fileWrites) {
              if (fileWrite === nullDevice) {
                this._log("File write to null device allowed", URI.isUri(fileWrite) ? fileWrite.toString() : fileWrite);
                continue;
              }
              if (isString(fileWrite)) {
                const isAbsolute = options.os === OperatingSystem.Windows ? win32.isAbsolute(fileWrite) : posix.isAbsolute(fileWrite);
                if (!isAbsolute) {
                  isAutoApproveAllowed = false;
                  this._log("File write blocked due to unknown terminal cwd", fileWrite);
                  break;
                }
              }
              const fileUri = normalizePath(URI.isUri(fileWrite) ? fileWrite : URI.file(fileWrite));
              if (fileUri.fsPath.match(/[$\(\){}`~%]/)) {
                isAutoApproveAllowed = false;
                this._log("File write blocked due to likely containing a variable, sub-command, or tilde/environment-variable expansion", fileUri.toString());
                break;
              }
              const isInsideWorkspace = workspaceFolders.some(
                (folder) => folder.uri.scheme === fileUri.scheme && extUri.isEqualOrParent(fileUri, folder.uri)
              );
              if (!isInsideWorkspace) {
                if (options.hasSessionAutoApproval && this._isInTempDirectory(fileUri.path, options.os)) {
                  continue;
                }
                isAutoApproveAllowed = false;
                this._log("File write blocked outside workspace", fileUri.toString());
                break;
              }
            }
          } else {
            const hasOnlyNullDevices = fileWrites.every((fw) => fw === nullDevice);
            if (!hasOnlyNullDevices) {
              isAutoApproveAllowed = false;
              this._log("File writes blocked - no workspace folders");
            }
          }
          break;
        }
        case "never":
        default: {
          break;
        }
      }
    }
    const disclaimers = [];
    if (fileWrites.length > 0) {
      const fileWritesList = fileWrites.map((fw) => `\`${URI.isUri(fw) ? this._labelService.getUriLabel(fw) : fw === nullDevice ? "/dev/null" : fw.toString()}\``).join(", ");
      if (!isAutoApproveAllowed) {
        disclaimers.push(localize("runInTerminal.fileWriteBlockedDisclaimer", "File write operations detected that cannot be auto approved: {0}", fileWritesList));
      } else {
        disclaimers.push(localize("runInTerminal.fileWriteDisclaimer", "File write operations detected: {0}", fileWritesList));
      }
    }
    return {
      isAutoApproveAllowed,
      disclaimers
    };
  }
  /**
   * Returns true if the given URI path points inside an OS temporary directory.
   * On posix systems this matches `/tmp/`. On Windows this matches any `temp`
   * or `tmp` directory segment (case-insensitive), which covers the canonical
   * user temp (`...\AppData\Local\Temp\`), system temp (`C:\Windows\Temp\`),
   * and common dev conventions like `C:\Temp\` and `C:\tmp\`.
   */
  _isInTempDirectory(uriPath, os) {
    if (os === OperatingSystem.Windows) {
      return /[\\/]te?mp[\\/].+/i.test(uriPath);
    }
    return uriPath.startsWith("/tmp/");
  }
};
CommandLineFileWriteAnalyzer = __decorateClass([
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, ILabelService),
  __decorateParam(4, IWorkspaceContextService)
], CommandLineFileWriteAnalyzer);
export {
  CommandLineFileWriteAnalyzer
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL3Rvb2xzL2NvbW1hbmRMaW5lQW5hbHl6ZXIvY29tbWFuZExpbmVGaWxlV3JpdGVBbmFseXplci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IHdpbjMyLCBwb3NpeCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZXh0VXJpLCBub3JtYWxpemVQYXRoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90ZXJtaW5hbENoYXRBZ2VudFRvb2xzQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUcmVlU2l0dGVyQ29tbWFuZFBhcnNlckxhbmd1YWdlLCB0eXBlIFRyZWVTaXR0ZXJDb21tYW5kUGFyc2VyIH0gZnJvbSAnLi4vLi4vdHJlZVNpdHRlckNvbW1hbmRQYXJzZXIuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ29tbWFuZExpbmVBbmFseXplciwgSUNvbW1hbmRMaW5lQW5hbHl6ZXJPcHRpb25zLCBJQ29tbWFuZExpbmVBbmFseXplclJlc3VsdCB9IGZyb20gJy4vY29tbWFuZExpbmVBbmFseXplci5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuXG5jb25zdCBudWxsRGV2aWNlID0gU3ltYm9sKCdudWxsIGRldmljZScpO1xuXG50eXBlIEZpbGVXcml0ZSA9IFVSSSB8IHN0cmluZyB8IHR5cGVvZiBudWxsRGV2aWNlO1xuXG5leHBvcnQgY2xhc3MgQ29tbWFuZExpbmVGaWxlV3JpdGVBbmFseXplciBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ29tbWFuZExpbmVBbmFseXplciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RyZWVTaXR0ZXJDb21tYW5kUGFyc2VyOiBUcmVlU2l0dGVyQ29tbWFuZFBhcnNlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2c6IChtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4gdm9pZCxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfd29ya3NwYWNlQ29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGFzeW5jIGFuYWx5emUob3B0aW9uczogSUNvbW1hbmRMaW5lQW5hbHl6ZXJPcHRpb25zKTogUHJvbWlzZTxJQ29tbWFuZExpbmVBbmFseXplclJlc3VsdD4ge1xuXHRcdGxldCBmaWxlV3JpdGVzOiBGaWxlV3JpdGVbXTtcblx0XHR0cnkge1xuXHRcdFx0ZmlsZVdyaXRlcyA9IGF3YWl0IHRoaXMuX2dldEZpbGVXcml0ZXMob3B0aW9ucyk7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc29sZS5lcnJvcihlKTtcblx0XHRcdHRoaXMuX2xvZygnRmFpbGVkIHRvIGdldCBmaWxlIHdyaXRlcyB2aWEgZ3JhbW1hcicsIG9wdGlvbnMudHJlZVNpdHRlckxhbmd1YWdlKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlzQXV0b0FwcHJvdmVBbGxvd2VkOiBmYWxzZVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2dldFJlc3VsdChvcHRpb25zLCBmaWxlV3JpdGVzKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2dldEZpbGVXcml0ZXMob3B0aW9uczogSUNvbW1hbmRMaW5lQW5hbHl6ZXJPcHRpb25zKTogUHJvbWlzZTxGaWxlV3JpdGVbXT4ge1xuXHRcdGxldCBmaWxlV3JpdGVzOiBGaWxlV3JpdGVbXSA9IFtdO1xuXG5cdFx0Ly8gR2V0IGZpbGUgd3JpdGVzIGZyb20gcmVkaXJlY3Rpb25zICh2aWEgdHJlZS1zaXR0ZXIgZ3JhbW1hcilcblx0XHRjb25zdCBjYXB0dXJlZEZpbGVXcml0ZXMgPSAoYXdhaXQgdGhpcy5fdHJlZVNpdHRlckNvbW1hbmRQYXJzZXIuZ2V0RmlsZVdyaXRlcyhvcHRpb25zLnRyZWVTaXR0ZXJMYW5ndWFnZSwgb3B0aW9ucy5jb21tYW5kTGluZSkpXG5cdFx0XHQubWFwKHRoaXMuX21hcE51bGxEZXZpY2UuYmluZCh0aGlzLCBvcHRpb25zKSk7XG5cblx0XHQvLyBHZXQgZmlsZSB3cml0ZXMgZnJvbSBjb21tYW5kLXNwZWNpZmljIHBhcnNlcnMgKGUuZy4sIHNlZCAtaSBpbi1wbGFjZSBlZGl0aW5nKVxuXHRcdGNvbnN0IGNvbW1hbmRGaWxlV3JpdGVzID0gKGF3YWl0IHRoaXMuX3RyZWVTaXR0ZXJDb21tYW5kUGFyc2VyLmdldENvbW1hbmRGaWxlV3JpdGVzKG9wdGlvbnMudHJlZVNpdHRlckxhbmd1YWdlLCBvcHRpb25zLmNvbW1hbmRMaW5lKSlcblx0XHRcdC5tYXAodGhpcy5fbWFwTnVsbERldmljZS5iaW5kKHRoaXMsIG9wdGlvbnMpKTtcblxuXHRcdGNvbnN0IGFsbENhcHR1cmVkRmlsZVdyaXRlcyA9IFsuLi5jYXB0dXJlZEZpbGVXcml0ZXMsIC4uLmNvbW1hbmRGaWxlV3JpdGVzXTtcblxuXHRcdGlmIChhbGxDYXB0dXJlZEZpbGVXcml0ZXMubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBjd2QgPSBvcHRpb25zLmN3ZDtcblx0XHRcdGlmIChjd2QpIHtcblx0XHRcdFx0dGhpcy5fbG9nKCdEZXRlY3RlZCBjd2QnLCBjd2QudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGZpbGVXcml0ZXMgPSBhbGxDYXB0dXJlZEZpbGVXcml0ZXMubWFwKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlID09PSBudWxsRGV2aWNlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBTdXJyb3VuZGluZyBxdW90ZXMgd2hlcmUgaXQncyBkaWZmaWN1bHQgdG8gZGV0ZXJtaW5lIHdoZXRoZXIgdGhpcyBpcyBhYnNvbHV0ZVxuXHRcdFx0XHRcdC8vIG9yIHJlbGF0aXZlXG5cdFx0XHRcdFx0aWYgKC9eWydcIl0uKlsnXCJdJC8udGVzdChlKSkge1xuXHRcdFx0XHRcdFx0Ly8gU3RyaXAgc3Vycm91bmRpbmcgcXVvdGVzIHRvIGdldCBhIG1vcmUgcmVhc29uYWJsZSB2aWV3IG9mIHRoZSBwYXRoLiBOb3RlXG5cdFx0XHRcdFx0XHQvLyB0aGF0IHRoaXMgbWF5IG5vdCBnZXQgdGhlIHJlYWwgZmlsZSBpbiB0aGUgY2FzZSBvZiBpbm5lciBxdW90ZXMsIGJ1dCB0aGVcblx0XHRcdFx0XHRcdC8vIGltcG9ydGFudCB0aGluZyBoZXJlIGlzIHRoZSByZXNvbHZpbmcgd2hldGhlciBpdCdzIGFic29sdXRlIG9yIG5vdC5cblx0XHRcdFx0XHRcdGUgPSB0aGlzLl9zdHJpcFN1cnJvdW5kaW5nUXVvdGVzKGUpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIEFic29sdXRlXG5cdFx0XHRcdFx0Y29uc3QgaXNBYnNvbHV0ZSA9IG9wdGlvbnMub3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gd2luMzIuaXNBYnNvbHV0ZShlKSA6IHBvc2l4LmlzQWJzb2x1dGUoZSk7XG5cdFx0XHRcdFx0aWYgKGlzQWJzb2x1dGUpIHtcblx0XHRcdFx0XHRcdC8vIEVuc3VyZSBjd2QncyBzY2hlbWUgYW5kIGF1dGhvcml0eSBpcyByZXRhaW5lZFxuXHRcdFx0XHRcdFx0cmV0dXJuIGN3ZC53aXRoKHsgcGF0aDogZSB9KTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBSZWxhdGl2ZVxuXHRcdFx0XHRcdHJldHVybiBVUkkuam9pblBhdGgoY3dkLCBlKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2coJ0N3ZCBjb3VsZCBub3QgYmUgZGV0ZWN0ZWQnKTtcblx0XHRcdFx0ZmlsZVdyaXRlcyA9IGFsbENhcHR1cmVkRmlsZVdyaXRlcztcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fbG9nKCdGaWxlIHdyaXRlcyBkZXRlY3RlZCcsIGZpbGVXcml0ZXMubWFwKGUgPT4gZS50b1N0cmluZygpKSk7XG5cdFx0cmV0dXJuIGZpbGVXcml0ZXM7XG5cdH1cblxuXHRwcml2YXRlIF9zdHJpcFN1cnJvdW5kaW5nUXVvdGVzKHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0bGV0IHJlc3VsdCA9IHRleHQ7XG5cdFx0d2hpbGUgKFxuXHRcdFx0KHJlc3VsdC5zdGFydHNXaXRoKCdcIicpICYmIHJlc3VsdC5lbmRzV2l0aCgnXCInKSkgfHxcblx0XHRcdChyZXN1bHQuc3RhcnRzV2l0aCgnXFwnJykgJiYgcmVzdWx0LmVuZHNXaXRoKCdcXCcnKSlcblx0XHQpIHtcblx0XHRcdHJlc3VsdCA9IHJlc3VsdC5zbGljZSgxLCAtMSk7XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9tYXBOdWxsRGV2aWNlKG9wdGlvbnM6IElDb21tYW5kTGluZUFuYWx5emVyT3B0aW9ucywgcmF3RmlsZVdyaXRlOiBzdHJpbmcpOiBzdHJpbmcgfCB0eXBlb2YgbnVsbERldmljZSB7XG5cdFx0aWYgKG9wdGlvbnMudHJlZVNpdHRlckxhbmd1YWdlID09PSBUcmVlU2l0dGVyQ29tbWFuZFBhcnNlckxhbmd1YWdlLlBvd2VyU2hlbGwpIHtcblx0XHRcdHJldHVybiByYXdGaWxlV3JpdGUgPT09ICckbnVsbCdcblx0XHRcdFx0PyBudWxsRGV2aWNlXG5cdFx0XHRcdDogcmF3RmlsZVdyaXRlO1xuXHRcdH1cblx0XHRyZXR1cm4gcmF3RmlsZVdyaXRlID09PSAnL2Rldi9udWxsJ1xuXHRcdFx0PyBudWxsRGV2aWNlXG5cdFx0XHQ6IHJhd0ZpbGVXcml0ZTtcblx0fVxuXG5cdHByaXZhdGUgX2dldFJlc3VsdChvcHRpb25zOiBJQ29tbWFuZExpbmVBbmFseXplck9wdGlvbnMsIGZpbGVXcml0ZXM6IEZpbGVXcml0ZVtdKTogSUNvbW1hbmRMaW5lQW5hbHl6ZXJSZXN1bHQge1xuXHRcdGxldCBpc0F1dG9BcHByb3ZlQWxsb3dlZCA9IHRydWU7XG5cdFx0aWYgKGZpbGVXcml0ZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgYmxvY2tEZXRlY3RlZEZpbGVXcml0ZXMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQmxvY2tEZXRlY3RlZEZpbGVXcml0ZXMpO1xuXHRcdFx0c3dpdGNoIChibG9ja0RldGVjdGVkRmlsZVdyaXRlcykge1xuXHRcdFx0XHRjYXNlICdhbGwnOiB7XG5cdFx0XHRcdFx0aXNBdXRvQXBwcm92ZUFsbG93ZWQgPSBmYWxzZTtcblx0XHRcdFx0XHR0aGlzLl9sb2coJ0ZpbGUgd3JpdGVzIGJsb2NrZWQgZHVlIHRvIFwiYWxsXCIgc2V0dGluZycpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhc2UgJ291dHNpZGVXb3Jrc3BhY2UnOiB7XG5cdFx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVycyA9IHRoaXMuX3dvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnM7XG5cdFx0XHRcdFx0aWYgKHdvcmtzcGFjZUZvbGRlcnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBmaWxlV3JpdGUgb2YgZmlsZVdyaXRlcykge1xuXHRcdFx0XHRcdFx0XHRpZiAoZmlsZVdyaXRlID09PSBudWxsRGV2aWNlKSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nKCdGaWxlIHdyaXRlIHRvIG51bGwgZGV2aWNlIGFsbG93ZWQnLCBVUkkuaXNVcmkoZmlsZVdyaXRlKSA/IGZpbGVXcml0ZS50b1N0cmluZygpIDogZmlsZVdyaXRlKTtcblx0XHRcdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRcdGlmIChpc1N0cmluZyhmaWxlV3JpdGUpKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y29uc3QgaXNBYnNvbHV0ZSA9IG9wdGlvbnMub3MgPT09IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzID8gd2luMzIuaXNBYnNvbHV0ZShmaWxlV3JpdGUpIDogcG9zaXguaXNBYnNvbHV0ZShmaWxlV3JpdGUpO1xuXHRcdFx0XHRcdFx0XHRcdGlmICghaXNBYnNvbHV0ZSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0aXNBdXRvQXBwcm92ZUFsbG93ZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuX2xvZygnRmlsZSB3cml0ZSBibG9ja2VkIGR1ZSB0byB1bmtub3duIHRlcm1pbmFsIGN3ZCcsIGZpbGVXcml0ZSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0Y29uc3QgZmlsZVVyaSA9IG5vcm1hbGl6ZVBhdGgoVVJJLmlzVXJpKGZpbGVXcml0ZSkgPyBmaWxlV3JpdGUgOiBVUkkuZmlsZShmaWxlV3JpdGUpKTtcblx0XHRcdFx0XHRcdFx0Ly8gVE9ETzogSGFuZGxlIGNvbW1hbmQgc3Vic3RpdHV0aW9ucy9jb21wbGV4IGRlc3RpbmF0aW9ucyBwcm9wZXJseSBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjc0MTY3XG5cdFx0XHRcdFx0XHRcdC8vIFRPRE86IEhhbmRsZSBlbnZpcm9ubWVudCB2YXJpYWJsZXMgcHJvcGVybHkgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzI3NDE2NlxuXHRcdFx0XHRcdFx0XHQvLyBgfmAgY2F0Y2hlcyBQT1NJWCB0aWxkZSBleHBhbnNpb24gKGUuZy4gYH4vZm9vYCkgYW5kIGAlYCBjYXRjaGVzIFdpbmRvd3Ncblx0XHRcdFx0XHRcdFx0Ly8gZW52aXJvbm1lbnQgdmFyaWFibGUgZXhwYW5zaW9ucyAoZS5nLiBgJUFQUERBVEElXFxmb29gKS4gTmVpdGhlciBpc1xuXHRcdFx0XHRcdFx0XHQvLyByZWNvZ25pemVkIGFzIGFic29sdXRlIGJ5IGBwb3NpeC5pc0Fic29sdXRlYCAvIGB3aW4zMi5pc0Fic29sdXRlYCwgc29cblx0XHRcdFx0XHRcdFx0Ly8gd2l0aG91dCB0aGlzIGd1YXJkIHRoZXkgd291bGQgYmUgam9pbmVkIG9udG8gY3dkIGFuZCBpbmNvcnJlY3RseSBjbGFzc2lmaWVkXG5cdFx0XHRcdFx0XHRcdC8vIGFzIGluc2lkZSB0aGUgd29ya3NwYWNlIHdoaWxlIGV4cGFuZGluZyBhdCBydW50aW1lIHRvIGEgbG9jYXRpb24gb3V0c2lkZSBpdC5cblx0XHRcdFx0XHRcdFx0aWYgKGZpbGVVcmkuZnNQYXRoLm1hdGNoKC9bJFxcKFxcKXt9YH4lXS8pKSB7XG5cdFx0XHRcdFx0XHRcdFx0aXNBdXRvQXBwcm92ZUFsbG93ZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl9sb2coJ0ZpbGUgd3JpdGUgYmxvY2tlZCBkdWUgdG8gbGlrZWx5IGNvbnRhaW5pbmcgYSB2YXJpYWJsZSwgc3ViLWNvbW1hbmQsIG9yIHRpbGRlL2Vudmlyb25tZW50LXZhcmlhYmxlIGV4cGFuc2lvbicsIGZpbGVVcmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRjb25zdCBpc0luc2lkZVdvcmtzcGFjZSA9IHdvcmtzcGFjZUZvbGRlcnMuc29tZShmb2xkZXIgPT5cblx0XHRcdFx0XHRcdFx0XHRmb2xkZXIudXJpLnNjaGVtZSA9PT0gZmlsZVVyaS5zY2hlbWUgJiZcblx0XHRcdFx0XHRcdFx0XHRleHRVcmkuaXNFcXVhbE9yUGFyZW50KGZpbGVVcmksIGZvbGRlci51cmkpXG5cdFx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0XHRcdGlmICghaXNJbnNpZGVXb3Jrc3BhY2UpIHtcblx0XHRcdFx0XHRcdFx0XHQvLyBBbGxvdyB3cml0ZXMgdG8gT1MgdGVtcCBsb2NhdGlvbnMgd2hlbiB0aGUgdXNlciBoYXMgb3B0ZWQgaW50b1xuXHRcdFx0XHRcdFx0XHRcdC8vIFwiQWxsb3cgQWxsIENvbW1hbmRzIGluIHRoaXMgU2Vzc2lvblwiIHZpYSB0aGUgY29uZmlybWF0aW9uLlxuXHRcdFx0XHRcdFx0XHRcdGlmIChvcHRpb25zLmhhc1Nlc3Npb25BdXRvQXBwcm92YWwgJiYgdGhpcy5faXNJblRlbXBEaXJlY3RvcnkoZmlsZVVyaS5wYXRoLCBvcHRpb25zLm9zKSkge1xuXHRcdFx0XHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGlzQXV0b0FwcHJvdmVBbGxvd2VkID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nKCdGaWxlIHdyaXRlIGJsb2NrZWQgb3V0c2lkZSB3b3Jrc3BhY2UnLCBmaWxlVXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIE5vIHdvcmtzcGFjZSBmb2xkZXJzLCBhbGxvdyBzYWZlIG51bGwgZGV2aWNlIHBhdGhzIGV2ZW4gd2l0aG91dCB3b3Jrc3BhY2Vcblx0XHRcdFx0XHRcdGNvbnN0IGhhc09ubHlOdWxsRGV2aWNlcyA9IGZpbGVXcml0ZXMuZXZlcnkoZncgPT4gZncgPT09IG51bGxEZXZpY2UpO1xuXHRcdFx0XHRcdFx0aWYgKCFoYXNPbmx5TnVsbERldmljZXMpIHtcblx0XHRcdFx0XHRcdFx0aXNBdXRvQXBwcm92ZUFsbG93ZWQgPSBmYWxzZTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nKCdGaWxlIHdyaXRlcyBibG9ja2VkIC0gbm8gd29ya3NwYWNlIGZvbGRlcnMnKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSAnbmV2ZXInOlxuXHRcdFx0XHRkZWZhdWx0OiB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBkaXNjbGFpbWVyczogc3RyaW5nW10gPSBbXTtcblx0XHRpZiAoZmlsZVdyaXRlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBmaWxlV3JpdGVzTGlzdCA9IGZpbGVXcml0ZXMubWFwKGZ3ID0+IGBcXGAke1VSSS5pc1VyaShmdykgPyB0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0VXJpTGFiZWwoZncpIDogZncgPT09IG51bGxEZXZpY2UgPyAnL2Rldi9udWxsJyA6IGZ3LnRvU3RyaW5nKCl9XFxgYCkuam9pbignLCAnKTtcblx0XHRcdGlmICghaXNBdXRvQXBwcm92ZUFsbG93ZWQpIHtcblx0XHRcdFx0ZGlzY2xhaW1lcnMucHVzaChsb2NhbGl6ZSgncnVuSW5UZXJtaW5hbC5maWxlV3JpdGVCbG9ja2VkRGlzY2xhaW1lcicsICdGaWxlIHdyaXRlIG9wZXJhdGlvbnMgZGV0ZWN0ZWQgdGhhdCBjYW5ub3QgYmUgYXV0byBhcHByb3ZlZDogezB9JywgZmlsZVdyaXRlc0xpc3QpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGRpc2NsYWltZXJzLnB1c2gobG9jYWxpemUoJ3J1bkluVGVybWluYWwuZmlsZVdyaXRlRGlzY2xhaW1lcicsICdGaWxlIHdyaXRlIG9wZXJhdGlvbnMgZGV0ZWN0ZWQ6IHswfScsIGZpbGVXcml0ZXNMaXN0KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRpc0F1dG9BcHByb3ZlQWxsb3dlZCxcblx0XHRcdGRpc2NsYWltZXJzLFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIGlmIHRoZSBnaXZlbiBVUkkgcGF0aCBwb2ludHMgaW5zaWRlIGFuIE9TIHRlbXBvcmFyeSBkaXJlY3RvcnkuXG5cdCAqIE9uIHBvc2l4IHN5c3RlbXMgdGhpcyBtYXRjaGVzIGAvdG1wL2AuIE9uIFdpbmRvd3MgdGhpcyBtYXRjaGVzIGFueSBgdGVtcGBcblx0ICogb3IgYHRtcGAgZGlyZWN0b3J5IHNlZ21lbnQgKGNhc2UtaW5zZW5zaXRpdmUpLCB3aGljaCBjb3ZlcnMgdGhlIGNhbm9uaWNhbFxuXHQgKiB1c2VyIHRlbXAgKGAuLi5cXEFwcERhdGFcXExvY2FsXFxUZW1wXFxgKSwgc3lzdGVtIHRlbXAgKGBDOlxcV2luZG93c1xcVGVtcFxcYCksXG5cdCAqIGFuZCBjb21tb24gZGV2IGNvbnZlbnRpb25zIGxpa2UgYEM6XFxUZW1wXFxgIGFuZCBgQzpcXHRtcFxcYC5cblx0ICovXG5cdHByaXZhdGUgX2lzSW5UZW1wRGlyZWN0b3J5KHVyaVBhdGg6IHN0cmluZywgb3M6IE9wZXJhdGluZ1N5c3RlbSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdGlmIChvcyA9PT0gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpIHtcblx0XHRcdC8vIFdpbmRvd3MgcGF0aHMgZnJvbSBVUkkud2l0aCh7cGF0aH0pIGtlZXAgdGhlaXIgb3JpZ2luYWwgYmFja3NsYXNoZXMsXG5cdFx0XHQvLyBzbyBhY2NlcHQgZWl0aGVyIHNlcGFyYXRvci4gUmVxdWlyZSBjb250ZW50IGFmdGVyIHRoZSBzZWdtZW50IHNvIHRoZVxuXHRcdFx0Ly8gZGlyZWN0b3J5IGl0c2VsZiBpcyBub3QgbWF0Y2hlZC5cblx0XHRcdHJldHVybiAvW1xcXFwvXXRlP21wW1xcXFwvXS4rL2kudGVzdCh1cmlQYXRoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHVyaVBhdGguc3RhcnRzV2l0aCgnL3RtcC8nKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxPQUFPLGFBQWE7QUFDN0IsU0FBUyxRQUFRLHFCQUFxQjtBQUN0QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHVDQUFxRTtBQUU5RSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUU5QixNQUFNLGFBQWEsdUJBQU8sYUFBYTtBQUloQyxJQUFNLCtCQUFOLGNBQTJDLFdBQTJDO0FBQUEsRUFDNUYsWUFDa0IsMEJBQ0EsTUFDdUIsdUJBQ1IsZUFDVywwQkFDMUM7QUFDRCxVQUFNO0FBTlc7QUFDQTtBQUN1QjtBQUNSO0FBQ1c7QUFBQSxFQUc1QztBQUFBLEVBRUEsTUFBTSxRQUFRLFNBQTJFO0FBQ3hGLFFBQUk7QUFDSixRQUFJO0FBQ0gsbUJBQWEsTUFBTSxLQUFLLGVBQWUsT0FBTztBQUFBLElBQy9DLFNBQVMsR0FBRztBQUNYLGNBQVEsTUFBTSxDQUFDO0FBQ2YsV0FBSyxLQUFLLHlDQUF5QyxRQUFRLGtCQUFrQjtBQUM3RSxhQUFPO0FBQUEsUUFDTixzQkFBc0I7QUFBQSxNQUN2QjtBQUFBLElBQ0Q7QUFDQSxXQUFPLEtBQUssV0FBVyxTQUFTLFVBQVU7QUFBQSxFQUMzQztBQUFBLEVBRUEsTUFBYyxlQUFlLFNBQTREO0FBQ3hGLFFBQUksYUFBMEIsQ0FBQztBQUcvQixVQUFNLHNCQUFzQixNQUFNLEtBQUsseUJB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
