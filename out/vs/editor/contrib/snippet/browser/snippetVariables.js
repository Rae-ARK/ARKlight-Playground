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
import { normalizeDriveLetter } from "../../../../base/common/labels.js";
import * as path from "../../../../base/common/path.js";
import { dirname } from "../../../../base/common/resources.js";
import { commonPrefixLength, getLeadingWhitespace, isFalsyOrWhitespace, splitLines } from "../../../../base/common/strings.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { Text } from "./snippetParser.js";
import * as nls from "../../../../nls.js";
import { WORKSPACE_EXTENSION, isSingleFolderWorkspaceIdentifier, toWorkspaceIdentifier, isEmptyWorkspaceIdentifier } from "../../../../platform/workspace/common/workspace.js";
const KnownSnippetVariableNames = Object.freeze({
  "CURRENT_YEAR": true,
  "CURRENT_YEAR_SHORT": true,
  "CURRENT_MONTH": true,
  "CURRENT_DATE": true,
  "CURRENT_HOUR": true,
  "CURRENT_MINUTE": true,
  "CURRENT_SECOND": true,
  "CURRENT_MILLISECOND": true,
  "CURRENT_DAY_NAME": true,
  "CURRENT_DAY_NAME_SHORT": true,
  "CURRENT_MONTH_NAME": true,
  "CURRENT_MONTH_NAME_SHORT": true,
  "CURRENT_SECONDS_UNIX": true,
  "CURRENT_MILLISECONDS_UNIX": true,
  "CURRENT_TIMEZONE_OFFSET": true,
  "CURRENT_TIMEZONE_NAME": true,
  "SELECTION": true,
  "CLIPBOARD": true,
  "TM_SELECTED_TEXT": true,
  "TM_CURRENT_LINE": true,
  "TM_CURRENT_WORD": true,
  "TM_LINE_INDEX": true,
  "TM_LINE_NUMBER": true,
  "TM_FILENAME": true,
  "TM_FILENAME_BASE": true,
  "TM_DIRECTORY": true,
  "TM_DIRECTORY_BASE": true,
  "TM_FILEPATH": true,
  "CURSOR_INDEX": true,
  // 0-offset
  "CURSOR_NUMBER": true,
  // 1-offset
  "RELATIVE_FILEPATH": true,
  "BLOCK_COMMENT_START": true,
  "BLOCK_COMMENT_END": true,
  "LINE_COMMENT": true,
  "WORKSPACE_NAME": true,
  "WORKSPACE_FOLDER": true,
  "RANDOM": true,
  "RANDOM_HEX": true,
  "UUID": true
});
class CompositeSnippetVariableResolver {
  constructor(_delegates) {
    this._delegates = _delegates;
  }
  resolve(variable) {
    for (const delegate of this._delegates) {
      const value = delegate.resolve(variable);
      if (value !== void 0) {
        return value;
      }
    }
    return void 0;
  }
}
class SelectionBasedVariableResolver {
  constructor(_model, _selection, _selectionIdx, _overtypingCapturer) {
    this._model = _model;
    this._selection = _selection;
    this._selectionIdx = _selectionIdx;
    this._overtypingCapturer = _overtypingCapturer;
  }
  resolve(variable) {
    const { name } = variable;
    if (name === "SELECTION" || name === "TM_SELECTED_TEXT") {
      let value = this._model.getValueInRange(this._selection) || void 0;
      let isMultiline = this._selection.startLineNumber !== this._selection.endLineNumber;
      if (!value && this._overtypingCapturer) {
        const info = this._overtypingCapturer.getLastOvertypedInfo(this._selectionIdx);
        if (info) {
          value = info.value;
          isMultiline = info.multiline;
        }
      }
      if (value && isMultiline && variable.snippet) {
        const line = this._model.getLineContent(this._selection.startLineNumber);
        const lineLeadingWhitespace = getLeadingWhitespace(line, 0, this._selection.startColumn - 1);
        let varLeadingWhitespace = lineLeadingWhitespace;
        variable.snippet.walk((marker) => {
          if (marker === variable) {
            return false;
          }
          if (marker instanceof Text) {
            varLeadingWhitespace = getLeadingWhitespace(splitLines(marker.value).pop());
          }
          return true;
        });
        const whitespaceCommonLength = commonPrefixLength(varLeadingWhitespace, lineLeadingWhitespace);
        value = value.replace(
          /(\r\n|\r|\n)(.*)/g,
          (m, newline, rest) => `${newline}${varLeadingWhitespace.substr(whitespaceCommonLength)}${rest}`
        );
      }
      return value;
    } else if (name === "TM_CURRENT_LINE") {
      return this._model.getLineContent(this._selection.positionLineNumber);
    } else if (name === "TM_CURRENT_WORD") {
      const info = this._model.getWordAtPosition({
        lineNumber: this._selection.positionLineNumber,
        column: this._selection.positionColumn
      });
      return info && info.word || void 0;
    } else if (name === "TM_LINE_INDEX") {
      return String(this._selection.positionLineNumber - 1);
    } else if (name === "TM_LINE_NUMBER") {
      return String(this._selection.positionLineNumber);
    } else if (name === "CURSOR_INDEX") {
      return String(this._selectionIdx);
    } else if (name === "CURSOR_NUMBER") {
      return String(this._selectionIdx + 1);
    }
    return void 0;
  }
}
class ModelBasedVariableResolver {
  constructor(_labelService, _model) {
    this._labelService = _labelService;
    this._model = _model;
  }
  resolve(variable) {
    const { name } = variable;
    if (name === "TM_FILENAME") {
      return path.basename(this._model.uri.fsPath);
    } else if (name === "TM_FILENAME_BASE") {
      const name2 = path.basename(this._model.uri.fsPath);
      const idx = name2.lastIndexOf(".");
      if (idx <= 0) {
        return name2;
      } else {
        return name2.slice(0, idx);
      }
    } else if (name === "TM_DIRECTORY") {
      if (path.dirname(this._model.uri.fsPath) === ".") {
        return "";
      }
      return this._labelService.getUriLabel(dirname(this._model.uri));
    } else if (name === "TM_DIRECTORY_BASE") {
      if (path.dirname(this._model.uri.fsPath) === ".") {
        return "";
      }
      return path.basename(path.dirname(this._model.uri.fsPath));
    } else if (name === "TM_FILEPATH") {
      return this._labelService.getUriLabel(this._model.uri);
    } else if (name === "RELATIVE_FILEPATH") {
      return this._labelService.getUriLabel(this._model.uri, { relative: true, noPrefix: true });
    }
    return void 0;
  }
}
class ClipboardBasedVariableResolver {
  constructor(_readClipboardText, _selectionIdx, _selectionCount, _spread) {
    this._readClipboardText = _readClipboardText;
    this._selectionIdx = _selectionIdx;
    this._selectionCount = _selectionCount;
    this._spread = _spread;
  }
  resolve(variable) {
    if (variable.name !== "CLIPBOARD") {
      return void 0;
    }
    const clipboardText = this._readClipboardText();
    if (!clipboardText) {
      return void 0;
    }
    if (this._spread) {
      const lines = clipboardText.split(/\r\n|\n|\r/).filter((s) => !isFalsyOrWhitespace(s));
      if (lines.length === this._selectionCount) {
        return lines[this._selectionIdx];
      }
    }
    return clipboardText;
  }
}
let CommentBasedVariableResolver = class {
  constructor(_model, _selection, _languageConfigurationService) {
    this._model = _model;
    this._selection = _selection;
    this._languageConfigurationService = _languageConfigurationService;
  }
  resolve(variable) {
    const { name } = variable;
    const langId = this._model.getLanguageIdAtPosition(this._selection.selectionStartLineNumber, this._selection.selectionStartColumn);
    const config = this._languageConfigurationService.getLanguageConfiguration(langId).comments;
    if (!config) {
      return void 0;
    }
    if (name === "LINE_COMMENT") {
      return config.lineCommentToken || void 0;
    } else if (name === "BLOCK_COMMENT_START") {
      return config.blockCommentStartToken || void 0;
    } else if (name === "BLOCK_COMMENT_END") {
      return config.blockCommentEndToken || void 0;
    }
    return void 0;
  }
};
CommentBasedVariableResolver = __decorateClass([
  __decorateParam(2, ILanguageConfigurationService)
], CommentBasedVariableResolver);
const _TimeBasedVariableResolver = class _TimeBasedVariableResolver {
  constructor() {
    this._date = /* @__PURE__ */ new Date();
  }
  resolve(variable) {
    const { name } = variable;
    switch (name) {
      case "CURRENT_YEAR":
        return String(this._date.getFullYear());
      case "CURRENT_YEAR_SHORT":
        return String(this._date.getFullYear()).slice(-2);
      case "CURRENT_MONTH":
        return String(this._date.getMonth().valueOf() + 1).padStart(2, "0");
      case "CURRENT_DATE":
        return String(this._date.getDate().valueOf()).padStart(2, "0");
      case "CURRENT_HOUR":
        return String(this._date.getHours().valueOf()).padStart(2, "0");
      case "CURRENT_MINUTE":
        return String(this._date.getMinutes().valueOf()).padStart(2, "0");
      case "CURRENT_SECOND":
        return String(this._date.getSeconds().valueOf()).padStart(2, "0");
      case "CURRENT_MILLISECOND":
        return String(this._date.getMilliseconds().valueOf()).padStart(3, "0");
      case "CURRENT_DAY_NAME":
        return _TimeBasedVariableResolver.dayNames[this._date.getDay()];
      case "CURRENT_DAY_NAME_SHORT":
        return _TimeBasedVariableResolver.dayNamesShort[this._date.getDay()];
      case "CURRENT_MONTH_NAME":
        return _TimeBasedVariableResolver.monthNames[this._date.getMonth()];
      case "CURRENT_MONTH_NAME_SHORT":
        return _TimeBasedVariableResolver.monthNamesShort[this._date.getMonth()];
      case "CURRENT_SECONDS_UNIX":
        return String(Math.floor(this._date.getTime() / 1e3));
      case "CURRENT_MILLISECONDS_UNIX":
        return String(this._date.getTime());
      case "CURRENT_TIMEZONE_OFFSET": {
        const rawTimeOffset = this._date.getTimezoneOffset();
        const sign = rawTimeOffset > 0 ? "-" : "+";
        const hours = Math.trunc(Math.abs(rawTimeOffset / 60));
        const hoursString = hours < 10 ? "0" + hours : hours;
        const minutes = Math.abs(rawTimeOffset) - hours * 60;
        const minutesString = minutes < 10 ? "0" + minutes : minutes;
        return sign + hoursString + ":" + minutesString;
      }
      case "CURRENT_TIMEZONE_NAME":
        return this._timezoneName ??= Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    return void 0;
  }
};
_TimeBasedVariableResolver.dayNames = [nls.localize("Sunday", "Sunday"), nls.localize("Monday", "Monday"), nls.localize("Tuesday", "Tuesday"), nls.localize("Wednesday", "Wednesday"), nls.localize("Thursday", "Thursday"), nls.localize("Friday", "Friday"), nls.localize("Saturday", "Saturday")];
_TimeBasedVariableResolver.dayNamesShort = [nls.localize("SundayShort", "Sun"), nls.localize("MondayShort", "Mon"), nls.localize("TuesdayShort", "Tue"), nls.localize("WednesdayShort", "Wed"), nls.localize("ThursdayShort", "Thu"), nls.localize("FridayShort", "Fri"), nls.localize("SaturdayShort", "Sat")];
_TimeBasedVariableResolver.monthNames = [nls.localize("January", "January"), nls.localize("February", "February"), nls.localize("March", "March"), nls.localize("April", "April"), nls.localize("May", "May"), nls.localize("June", "June"), nls.localize("July", "July"), nls.localize("August", "August"), nls.localize("September", "September"), nls.localize("October", "October"), nls.localize("November", "November"), nls.localize("December", "December")];
_TimeBasedVariableResolver.monthNamesShort = [nls.localize("JanuaryShort", "Jan"), nls.localize("FebruaryShort", "Feb"), nls.localize("MarchShort", "Mar"), nls.localize("AprilShort", "Apr"), nls.localize("MayShort", "May"), nls.localize("JuneShort", "Jun"), nls.localize("JulyShort", "Jul"), nls.localize("AugustShort", "Aug"), nls.localize("SeptemberShort", "Sep"), nls.localize("OctoberShort", "Oct"), nls.localize("NovemberShort", "Nov"), nls.localize("DecemberShort", "Dec")];
let TimeBasedVariableResolver = _TimeBasedVariableResolver;
class WorkspaceBasedVariableResolver {
  constructor(_workspaceService) {
    this._workspaceService = _workspaceService;
  }
  resolve(variable) {
    if (!this._workspaceService) {
      return void 0;
    }
    const workspaceIdentifier = toWorkspaceIdentifier(this._workspaceService.getWorkspace());
    if (isEmptyWorkspaceIdentifier(workspaceIdentifier)) {
      return void 0;
    }
    if (variable.name === "WORKSPACE_NAME") {
      return this._resolveWorkspaceName(workspaceIdentifier);
    } else if (variable.name === "WORKSPACE_FOLDER") {
      return this._resoveWorkspacePath(workspaceIdentifier);
    }
    return void 0;
  }
  _resolveWorkspaceName(workspaceIdentifier) {
    if (isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
      return path.basename(workspaceIdentifier.uri.path);
    }
    let filename = path.basename(workspaceIdentifier.configPath.path);
    if (filename.endsWith(WORKSPACE_EXTENSION)) {
      filename = filename.substr(0, filename.length - WORKSPACE_EXTENSION.length - 1);
    }
    return filename;
  }
  _resoveWorkspacePath(workspaceIdentifier) {
    if (isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
      return normalizeDriveLetter(workspaceIdentifier.uri.fsPath);
    }
    const filename = path.basename(workspaceIdentifier.configPath.path);
    let folderpath = workspaceIdentifier.configPath.fsPath;
    if (folderpath.endsWith(filename)) {
      folderpath = folderpath.substr(0, folderpath.length - filename.length - 1);
    }
    return folderpath ? normalizeDriveLetter(folderpath) : "/";
  }
}
class RandomBasedVariableResolver {
  resolve(variable) {
    const { name } = variable;
    if (name === "RANDOM") {
      return Math.random().toString().slice(-6);
    } else if (name === "RANDOM_HEX") {
      return Math.random().toString(16).slice(-6);
    } else if (name === "UUID") {
      return generateUuid();
    }
    return void 0;
  }
}
export {
  ClipboardBasedVariableResolver,
  CommentBasedVariableResolver,
  CompositeSnippetVariableResolver,
  KnownSnippetVariableNames,
  ModelBasedVariableResolver,
  RandomBasedVariableResolver,
  SelectionBasedVariableResolver,
  TimeBasedVariableResolver,
  WorkspaceBasedVariableResolver
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0VmFyaWFibGVzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgbm9ybWFsaXplRHJpdmVMZXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYWJlbHMuanMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGRpcm5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgY29tbW9uUHJlZml4TGVuZ3RoLCBnZXRMZWFkaW5nV2hpdGVzcGFjZSwgaXNGYWxzeU9yV2hpdGVzcGFjZSwgc3BsaXRMaW5lcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgVGV4dCwgVmFyaWFibGUsIFZhcmlhYmxlUmVzb2x2ZXIgfSBmcm9tICcuL3NuaXBwZXRQYXJzZXIuanMnO1xuaW1wb3J0IHsgT3ZlcnR5cGluZ0NhcHR1cmVyIH0gZnJvbSAnLi4vLi4vc3VnZ2VzdC9icm93c2VyL3N1Z2dlc3RPdmVydHlwaW5nQ2FwdHVyZXIuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IFdPUktTUEFDRV9FWFRFTlNJT04sIGlzU2luZ2xlRm9sZGVyV29ya3NwYWNlSWRlbnRpZmllciwgdG9Xb3Jrc3BhY2VJZGVudGlmaWVyLCBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyLCBJV29ya3NwYWNlSWRlbnRpZmllciwgaXNFbXB0eVdvcmtzcGFjZUlkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBLbm93blNuaXBwZXRWYXJpYWJsZU5hbWVzID0gT2JqZWN0LmZyZWV6ZTx7IFtrZXk6IHN0cmluZ106IHRydWUgfT4oe1xuXHQnQ1VSUkVOVF9ZRUFSJzogdHJ1ZSxcblx0J0NVUlJFTlRfWUVBUl9TSE9SVCc6IHRydWUsXG5cdCdDVVJSRU5UX01PTlRIJzogdHJ1ZSxcblx0J0NVUlJFTlRfREFURSc6IHRydWUsXG5cdCdDVVJSRU5UX0hPVVInOiB0cnVlLFxuXHQnQ1VSUkVOVF9NSU5VVEUnOiB0cnVlLFxuXHQnQ1VSUkVOVF9TRUNPTkQnOiB0cnVlLFxuXHQnQ1VSUkVOVF9NSUxMSVNFQ09ORCc6IHRydWUsXG5cdCdDVVJSRU5UX0RBWV9OQU1FJzogdHJ1ZSxcblx0J0NVUlJFTlRfREFZX05BTUVfU0hPUlQnOiB0cnVlLFxuXHQnQ1VSUkVOVF9NT05USF9OQU1FJzogdHJ1ZSxcblx0J0NVUlJFTlRfTU9OVEhfTkFNRV9TSE9SVCc6IHRydWUsXG5cdCdDVVJSRU5UX1NFQ09ORFNfVU5JWCc6IHRydWUsXG5cdCdDVVJSRU5UX01JTExJU0VDT05EU19VTklYJzogdHJ1ZSxcblx0J0NVUlJFTlRfVElNRVpPTkVfT0ZGU0VUJzogdHJ1ZSxcblx0J0NVUlJFTlRfVElNRVpPTkVfTkFNRSc6IHRydWUsXG5cdCdTRUxFQ1RJT04nOiB0cnVlLFxuXHQnQ0xJUEJPQVJEJzogdHJ1ZSxcblx0J1RNX1NFTEVDVEVEX1RFWFQnOiB0cnVlLFxuXHQnVE1fQ1VSUkVOVF9MSU5FJzogdHJ1ZSxcblx0J1RNX0NVUlJFTlRfV09SRCc6IHRydWUsXG5cdCdUTV9MSU5FX0lOREVYJzogdHJ1ZSxcblx0J1RNX0xJTkVfTlVNQkVSJzogdHJ1ZSxcblx0J1RNX0ZJTEVOQU1FJzogdHJ1ZSxcblx0J1RNX0ZJTEVOQU1FX0JBU0UnOiB0cnVlLFxuXHQnVE1fRElSRUNUT1JZJzogdHJ1ZSxcblx0J1RNX0RJUkVDVE9SWV9CQVNFJzogdHJ1ZSxcblx0J1RNX0ZJTEVQQVRIJzogdHJ1ZSxcblx0J0NVUlNPUl9JTkRFWCc6IHRydWUsIC8vIDAtb2Zmc2V0XG5cdCdDVVJTT1JfTlVNQkVSJzogdHJ1ZSwgLy8gMS1vZmZzZXRcblx0J1JFTEFUSVZFX0ZJTEVQQVRIJzogdHJ1ZSxcblx0J0JMT0NLX0NPTU1FTlRfU1RBUlQnOiB0cnVlLFxuXHQnQkxPQ0tfQ09NTUVOVF9FTkQnOiB0cnVlLFxuXHQnTElORV9DT01NRU5UJzogdHJ1ZSxcblx0J1dPUktTUEFDRV9OQU1FJzogdHJ1ZSxcblx0J1dPUktTUEFDRV9GT0xERVInOiB0cnVlLFxuXHQnUkFORE9NJzogdHJ1ZSxcblx0J1JBTkRPTV9IRVgnOiB0cnVlLFxuXHQnVVVJRCc6IHRydWVcbn0pO1xuXG5leHBvcnQgY2xhc3MgQ29tcG9zaXRlU25pcHBldFZhcmlhYmxlUmVzb2x2ZXIgaW1wbGVtZW50cyBWYXJpYWJsZVJlc29sdmVyIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9kZWxlZ2F0ZXM6IFZhcmlhYmxlUmVzb2x2ZXJbXSkge1xuXHRcdC8vXG5cdH1cblxuXHRyZXNvbHZlKHZhcmlhYmxlOiBWYXJpYWJsZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Zm9yIChjb25zdCBkZWxlZ2F0ZSBvZiB0aGlzLl9kZWxlZ2F0ZXMpIHtcblx0XHRcdGNvbnN0IHZhbHVlID0gZGVsZWdhdGUucmVzb2x2ZSh2YXJpYWJsZSk7XG5cdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRyZXR1cm4gdmFsdWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFNlbGVjdGlvbkJhc2VkVmFyaWFibGVSZXNvbHZlciBpbXBsZW1lbnRzIFZhcmlhYmxlUmVzb2x2ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBJVGV4dE1vZGVsLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NlbGVjdGlvbjogU2VsZWN0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NlbGVjdGlvbklkeDogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX292ZXJ0eXBpbmdDYXB0dXJlcjogT3ZlcnR5cGluZ0NhcHR1cmVyIHwgdW5kZWZpbmVkXG5cdCkge1xuXHRcdC8vXG5cdH1cblxuXHRyZXNvbHZlKHZhcmlhYmxlOiBWYXJpYWJsZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cblx0XHRjb25zdCB7IG5hbWUgfSA9IHZhcmlhYmxlO1xuXG5cdFx0aWYgKG5hbWUgPT09ICdTRUxFQ1RJT04nIHx8IG5hbWUgPT09ICdUTV9TRUxFQ1RFRF9URVhUJykge1xuXHRcdFx0bGV0IHZhbHVlID0gdGhpcy5fbW9kZWwuZ2V0VmFsdWVJblJhbmdlKHRoaXMuX3NlbGVjdGlvbikgfHwgdW5kZWZpbmVkO1xuXHRcdFx0bGV0IGlzTXVsdGlsaW5lID0gdGhpcy5fc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciAhPT0gdGhpcy5fc2VsZWN0aW9uLmVuZExpbmVOdW1iZXI7XG5cblx0XHRcdC8vIElmIHRoZXJlIHdhcyBubyBzZWxlY3RlZCB0ZXh0LCB0cnkgdG8gZ2V0IGxhc3Qgb3ZlcnR5cGVkIHRleHRcblx0XHRcdGlmICghdmFsdWUgJiYgdGhpcy5fb3ZlcnR5cGluZ0NhcHR1cmVyKSB7XG5cdFx0XHRcdGNvbnN0IGluZm8gPSB0aGlzLl9vdmVydHlwaW5nQ2FwdHVyZXIuZ2V0TGFzdE92ZXJ0eXBlZEluZm8odGhpcy5fc2VsZWN0aW9uSWR4KTtcblx0XHRcdFx0aWYgKGluZm8pIHtcblx0XHRcdFx0XHR2YWx1ZSA9IGluZm8udmFsdWU7XG5cdFx0XHRcdFx0aXNNdWx0aWxpbmUgPSBpbmZvLm11bHRpbGluZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAodmFsdWUgJiYgaXNNdWx0aWxpbmUgJiYgdmFyaWFibGUuc25pcHBldCkge1xuXHRcdFx0XHQvLyBTZWxlY3Rpb24gaXMgYSBtdWx0aWxpbmUgc3RyaW5nIHdoaWNoIHdlIGluZGVudGF0aW9uIHdlIG5vd1xuXHRcdFx0XHQvLyBuZWVkIHRvIGFkanVzdC4gV2UgY29tcGFyZSB0aGUgaW5kZW50YXRpb24gb2YgdGhpcyB2YXJpYWJsZVxuXHRcdFx0XHQvLyB3aXRoIHRoZSBpbmRlbnRhdGlvbiBhdCB0aGUgZWRpdG9yIHBvc2l0aW9uIGFuZCBhZGQgcG90ZW50aWFsXG5cdFx0XHRcdC8vIGV4dHJhIGluZGVudGF0aW9uIHRvIHRoZSB2YWx1ZVxuXG5cdFx0XHRcdGNvbnN0IGxpbmUgPSB0aGlzLl9tb2RlbC5nZXRMaW5lQ29udGVudCh0aGlzLl9zZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRcdFx0Y29uc3QgbGluZUxlYWRpbmdXaGl0ZXNwYWNlID0gZ2V0TGVhZGluZ1doaXRlc3BhY2UobGluZSwgMCwgdGhpcy5fc2VsZWN0aW9uLnN0YXJ0Q29sdW1uIC0gMSk7XG5cblx0XHRcdFx0bGV0IHZhckxlYWRpbmdXaGl0ZXNwYWNlID0gbGluZUxlYWRpbmdXaGl0ZXNwYWNlO1xuXHRcdFx0XHR2YXJpYWJsZS5zbmlwcGV0LndhbGsobWFya2VyID0+IHtcblx0XHRcdFx0XHRpZiAobWFya2VyID09PSB2YXJpYWJsZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAobWFya2VyIGluc3RhbmNlb2YgVGV4dCkge1xuXHRcdFx0XHRcdFx0dmFyTGVhZGluZ1doaXRlc3BhY2UgPSBnZXRMZWFkaW5nV2hpdGVzcGFjZShzcGxpdExpbmVzKG1hcmtlci52YWx1ZSkucG9wKCkhKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCB3aGl0ZXNwYWNlQ29tbW9uTGVuZ3RoID0gY29tbW9uUHJlZml4TGVuZ3RoKHZhckxlYWRpbmdXaGl0ZXNwYWNlLCBsaW5lTGVhZGluZ1doaXRlc3BhY2UpO1xuXG5cdFx0XHRcdHZhbHVlID0gdmFsdWUucmVwbGFjZShcblx0XHRcdFx0XHQvKFxcclxcbnxcXHJ8XFxuKSguKikvZyxcblx0XHRcdFx0XHQobSwgbmV3bGluZSwgcmVzdCkgPT4gYCR7bmV3bGluZX0ke3ZhckxlYWRpbmdXaGl0ZXNwYWNlLnN1YnN0cih3aGl0ZXNwYWNlQ29tbW9uTGVuZ3RoKX0ke3Jlc3R9YFxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHZhbHVlO1xuXG5cdFx0fSBlbHNlIGlmIChuYW1lID09PSAnVE1fQ1VSUkVOVF9MSU5FJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX21vZGVsLmdldExpbmVDb250ZW50KHRoaXMuX3NlbGVjdGlvbi5wb3NpdGlvbkxpbmVOdW1iZXIpO1xuXG5cdFx0fSBlbHNlIGlmIChuYW1lID09PSAnVE1fQ1VSUkVOVF9XT1JEJykge1xuXHRcdFx0Y29uc3QgaW5mbyA9IHRoaXMuX21vZGVsLmdldFdvcmRBdFBvc2l0aW9uKHtcblx0XHRcdFx0bGluZU51bWJlcjogdGhpcy5fc2VsZWN0aW9uLnBvc2l0aW9uTGluZU51bWJlcixcblx0XHRcdFx0Y29sdW1uOiB0aGlzLl9zZWxlY3Rpb24ucG9zaXRpb25Db2x1bW5cblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIGluZm8gJiYgaW5mby53b3JkIHx8IHVuZGVmaW5lZDtcblxuXHRcdH0gZWxzZSBpZiAobmFtZSA9PT0gJ1RNX0xJTkVfSU5ERVgnKSB7XG5cdFx0XHRyZXR1cm4gU3RyaW5nKHRoaXMuX3NlbGVjdGlvbi5wb3NpdGlvbkxpbmVOdW1iZXIgLSAxKTtcblxuXHRcdH0gZWxzZSBpZiAobmFtZSA9PT0gJ1RNX0xJTkVfTlVNQkVSJykge1xuXHRcdFx0cmV0dXJuIFN0cmluZyh0aGlzLl9zZWxlY3Rpb24ucG9zaXRpb25MaW5lTnVtYmVyKTtcblxuXHRcdH0gZWxzZSBpZiAobmFtZSA9PT0gJ0NVUlNPUl9JTkRFWCcpIHtcblx0XHRcdHJldHVybiBTdHJpbmcodGhpcy5fc2VsZWN0aW9uSWR4KTtcblxuXHRcdH0gZWxzZSBpZiAobmFtZSA9PT0gJ0NVUlNPUl9OVU1CRVInKSB7XG5cdFx0XHRyZXR1cm4gU3RyaW5nKHRoaXMuX3NlbGVjdGlvbklkeCArIDEpO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNb2RlbEJhc2VkVmFyaWFibGVSZXNvbHZlciBpbXBsZW1lbnRzIFZhcmlhYmxlUmVzb2x2ZXIge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogSVRleHRNb2RlbFxuXHQpIHtcblx0XHQvL1xuXHR9XG5cblx0cmVzb2x2ZSh2YXJpYWJsZTogVmFyaWFibGUpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXG5cdFx0Y29uc3QgeyBuYW1lIH0gPSB2YXJpYWJsZTtcblxuXHRcdGlmIChuYW1lID09PSAnVE1fRklMRU5BTUUnKSB7XG5cdFx0XHRyZXR1cm4gcGF0aC5iYXNlbmFtZSh0aGlzLl9tb2RlbC51cmkuZnNQYXRoKTtcblxuXHRcdH0gZWxzZSBpZiAobmFtZSA9PT0gJ1RNX0ZJTEVOQU1FX0JBU0UnKSB7XG5cdFx0XHRjb25zdCBuYW1lID0gcGF0aC5iYXNlbmFtZSh0aGlzLl9tb2RlbC51cmkuZnNQYXRoKTtcblx0XHRcdGNvbnN0IGlkeCA9IG5hbWUubGFzdEluZGV4T2YoJy4nKTtcblx0XHRcdGlmIChpZHggPD0gMCkge1xuXHRcdFx0XHRyZXR1cm4gbmFtZTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBuYW1lLnNsaWNlKDAsIGlkeCk7XG5cdFx0XHR9XG5cblx0XHR9IGVsc2UgaWYgKG5hbWUgPT09ICdUTV9ESVJFQ1RPUlknKSB7XG5cdFx0XHRpZiAocGF0aC5kaXJuYW1lKHRoaXMuX21vZGVsLnVyaS5mc1BhdGgpID09PSAnLicpIHtcblx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbChkaXJuYW1lKHRoaXMuX21vZGVsLnVyaSkpO1xuXG5cdFx0fSBlbHNlIGlmIChuYW1lID09PSAnVE1fRElSRUNUT1JZX0JBU0UnKSB7XG5cdFx0XHRpZiAocGF0aC5kaXJuYW1lKHRoaXMuX21vZGVsLnVyaS5mc1BhdGgpID09PSAnLicpIHtcblx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHBhdGguYmFzZW5hbWUocGF0aC5kaXJuYW1lKHRoaXMuX21vZGVsLnVyaS5mc1BhdGgpKTtcblxuXHRcdH0gZWxzZSBpZiAobmFtZSA9PT0gJ1RNX0ZJTEVQQVRIJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbCh0aGlzLl9tb2RlbC51cmkpO1xuXHRcdH0gZWxzZSBpZiAobmFtZSA9PT0gJ1JFTEFUSVZFX0ZJTEVQQVRIJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2xhYmVsU2VydmljZS5nZXRVcmlMYWJlbCh0aGlzLl9tb2RlbC51cmksIHsgcmVsYXRpdmU6IHRydWUsIG5vUHJlZml4OiB0cnVlIH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJUmVhZENsaXBib2FyZFRleHQge1xuXHQoKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgY2xhc3MgQ2xpcGJvYXJkQmFzZWRWYXJpYWJsZVJlc29sdmVyIGltcGxlbWVudHMgVmFyaWFibGVSZXNvbHZlciB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVhZENsaXBib2FyZFRleHQ6IElSZWFkQ2xpcGJvYXJkVGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZWxlY3Rpb25JZHg6IG51bWJlcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZWxlY3Rpb25Db3VudDogbnVtYmVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NwcmVhZDogYm9vbGVhblxuXHQpIHtcblx0XHQvL1xuXHR9XG5cblx0cmVzb2x2ZSh2YXJpYWJsZTogVmFyaWFibGUpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh2YXJpYWJsZS5uYW1lICE9PSAnQ0xJUEJPQVJEJykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjbGlwYm9hcmRUZXh0ID0gdGhpcy5fcmVhZENsaXBib2FyZFRleHQoKTtcblx0XHRpZiAoIWNsaXBib2FyZFRleHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gYHNwcmVhZGAgaXMgYXNzaWduaW5nIGVhY2ggY3Vyc29yIGEgbGluZSBvZiB0aGUgY2xpcGJvYXJkXG5cdFx0Ly8gdGV4dCB3aGVuZXZlciB0aGVyZSB0aGUgbGluZSBjb3VudCBlcXVhbHMgdGhlIGN1cnNvciBjb3VudFxuXHRcdC8vIGFuZCB3aGVuIGVuYWJsZWRcblx0XHRpZiAodGhpcy5fc3ByZWFkKSB7XG5cdFx0XHRjb25zdCBsaW5lcyA9IGNsaXBib2FyZFRleHQuc3BsaXQoL1xcclxcbnxcXG58XFxyLykuZmlsdGVyKHMgPT4gIWlzRmFsc3lPcldoaXRlc3BhY2UocykpO1xuXHRcdFx0aWYgKGxpbmVzLmxlbmd0aCA9PT0gdGhpcy5fc2VsZWN0aW9uQ291bnQpIHtcblx0XHRcdFx0cmV0dXJuIGxpbmVzW3RoaXMuX3NlbGVjdGlvbklkeF07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBjbGlwYm9hcmRUZXh0O1xuXHR9XG59XG5leHBvcnQgY2xhc3MgQ29tbWVudEJhc2VkVmFyaWFibGVSZXNvbHZlciBpbXBsZW1lbnRzIFZhcmlhYmxlUmVzb2x2ZXIge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogSVRleHRNb2RlbCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zZWxlY3Rpb246IFNlbGVjdGlvbixcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0Ly9cblx0fVxuXHRyZXNvbHZlKHZhcmlhYmxlOiBWYXJpYWJsZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgeyBuYW1lIH0gPSB2YXJpYWJsZTtcblx0XHRjb25zdCBsYW5nSWQgPSB0aGlzLl9tb2RlbC5nZXRMYW5ndWFnZUlkQXRQb3NpdGlvbih0aGlzLl9zZWxlY3Rpb24uc2VsZWN0aW9uU3RhcnRMaW5lTnVtYmVyLCB0aGlzLl9zZWxlY3Rpb24uc2VsZWN0aW9uU3RhcnRDb2x1bW4pO1xuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UuZ2V0TGFuZ3VhZ2VDb25maWd1cmF0aW9uKGxhbmdJZCkuY29tbWVudHM7XG5cdFx0aWYgKCFjb25maWcpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmIChuYW1lID09PSAnTElORV9DT01NRU5UJykge1xuXHRcdFx0cmV0dXJuIGNvbmZpZy5saW5lQ29tbWVudFRva2VuIHx8IHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKG5hbWUgPT09ICdCTE9DS19DT01NRU5UX1NUQVJUJykge1xuXHRcdFx0cmV0dXJuIGNvbmZpZy5ibG9ja0NvbW1lbnRTdGFydFRva2VuIHx8IHVuZGVmaW5lZDtcblx0XHR9IGVsc2UgaWYgKG5hbWUgPT09ICdCTE9DS19DT01NRU5UX0VORCcpIHtcblx0XHRcdHJldHVybiBjb25maWcuYmxvY2tDb21tZW50RW5kVG9rZW4gfHwgdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5leHBvcnQgY2xhc3MgVGltZUJhc2VkVmFyaWFibGVSZXNvbHZlciBpbXBsZW1lbnRzIFZhcmlhYmxlUmVzb2x2ZXIge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IGRheU5hbWVzID0gW25scy5sb2NhbGl6ZSgnU3VuZGF5JywgXCJTdW5kYXlcIiksIG5scy5sb2NhbGl6ZSgnTW9uZGF5JywgXCJNb25kYXlcIiksIG5scy5sb2NhbGl6ZSgnVHVlc2RheScsIFwiVHVlc2RheVwiKSwgbmxzLmxvY2FsaXplKCdXZWRuZXNkYXknLCBcIldlZG5lc2RheVwiKSwgbmxzLmxvY2FsaXplKCdUaHVyc2RheScsIFwiVGh1cnNkYXlcIiksIG5scy5sb2NhbGl6ZSgnRnJpZGF5JywgXCJGcmlkYXlcIiksIG5scy5sb2NhbGl6ZSgnU2F0dXJkYXknLCBcIlNhdHVyZGF5XCIpXTtcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgZGF5TmFtZXNTaG9ydCA9IFtubHMubG9jYWxpemUoJ1N1bmRheVNob3J0JywgXCJTdW5cIiksIG5scy5sb2NhbGl6ZSgnTW9uZGF5U2hvcnQnLCBcIk1vblwiKSwgbmxzLmxvY2FsaXplKCdUdWVzZGF5U2hvcnQnLCBcIlR1ZVwiKSwgbmxzLmxvY2FsaXplKCdXZWRuZXNkYXlTaG9ydCcsIFwiV2VkXCIpLCBubHMubG9jYWxpemUoJ1RodXJzZGF5U2hvcnQnLCBcIlRodVwiKSwgbmxzLmxvY2FsaXplKCdGcmlkYXlTaG9ydCcsIFwiRnJpXCIpLCBubHMubG9jYWxpemUoJ1NhdHVyZGF5U2hvcnQnLCBcIlNhdFwiKV07XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IG1vbnRoTmFtZXMgPSBbbmxzLmxvY2FsaXplKCdKYW51YXJ5JywgXCJKYW51YXJ5XCIpLCBubHMubG9jYWxpemUoJ0ZlYnJ1YXJ5JywgXCJGZWJydWFyeVwiKSwgbmxzLmxvY2FsaXplKCdNYXJjaCcsIFwiTWFyY2hcIiksIG5scy5sb2NhbGl6ZSgnQXByaWwnLCBcIkFwcmlsXCIpLCBubHMubG9jYWxpemUoJ01heScsIFwiTWF5XCIpLCBubHMubG9jYWxpemUoJ0p1bmUnLCBcIkp1bmVcIiksIG5scy5sb2NhbGl6ZSgnSnVseScsIFwiSnVseVwiKSwgbmxzLmxvY2FsaXplKCdBdWd1c3QnLCBcIkF1Z3VzdFwiKSwgbmxzLmxvY2FsaXplKCdTZXB0ZW1iZXInLCBcIlNlcHRlbWJlclwiKSwgbmxzLmxvY2FsaXplKCdPY3RvYmVyJywgXCJPY3RvYmVyXCIpLCBubHMubG9jYWxpemUoJ05vdmVtYmVyJywgXCJOb3ZlbWJlclwiKSwgbmxzLmxvY2FsaXplKCdEZWNlbWJlcicsIFwiRGVjZW1iZXJcIildO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBtb250aE5hbWVzU2hvcnQgPSBbbmxzLmxvY2FsaXplKCdKYW51YXJ5U2hvcnQnLCBcIkphblwiKSwgbmxzLmxvY2FsaXplKCdGZWJydWFyeVNob3J0JywgXCJGZWJcIiksIG5scy5sb2NhbGl6ZSgnTWFyY2hTaG9ydCcsIFwiTWFyXCIpLCBubHMubG9jYWxpemUoJ0FwcmlsU2hvcnQnLCBcIkFwclwiKSwgbmxzLmxvY2FsaXplKCdNYXlTaG9ydCcsIFwiTWF5XCIpLCBubHMubG9jYWxpemUoJ0p1bmVTaG9ydCcsIFwiSnVuXCIpLCBubHMubG9jYWxpemUoJ0p1bHlTaG9ydCcsIFwiSnVsXCIpLCBubHMubG9jYWxpemUoJ0F1Z3VzdFNob3J0JywgXCJBdWdcIiksIG5scy5sb2NhbGl6ZSgnU2VwdGVtYmVyU2hvcnQnLCBcIlNlcFwiKSwgbmxzLmxvY2FsaXplKCdPY3RvYmVyU2hvcnQnLCBcIk9jdFwiKSwgbmxzLmxvY2FsaXplKCdOb3ZlbWJlclNob3J0JywgXCJOb3ZcIiksIG5scy5sb2NhbGl6ZSgnRGVjZW1iZXJTaG9ydCcsIFwiRGVjXCIpXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kYXRlID0gbmV3IERhdGUoKTtcblx0cHJpdmF0ZSBfdGltZXpvbmVOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0cmVzb2x2ZSh2YXJpYWJsZTogVmFyaWFibGUpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHsgbmFtZSB9ID0gdmFyaWFibGU7XG5cblx0XHRzd2l0Y2ggKG5hbWUpIHtcblx0XHRcdGNhc2UgJ0NVUlJFTlRfWUVBUic6XG5cdFx0XHRcdHJldHVybiBTdHJpbmcodGhpcy5fZGF0ZS5nZXRGdWxsWWVhcigpKTtcblx0XHRcdGNhc2UgJ0NVUlJFTlRfWUVBUl9TSE9SVCc6XG5cdFx0XHRcdHJldHVybiBTdHJpbmcodGhpcy5fZGF0ZS5nZXRGdWxsWWVhcigpKS5zbGljZSgtMik7XG5cdFx0XHRjYXNlICdDVVJSRU5UX01PTlRIJzpcblx0XHRcdFx0cmV0dXJuIFN0cmluZyh0aGlzLl9kYXRlLmdldE1vbnRoKCkudmFsdWVPZigpICsgMSkucGFkU3RhcnQoMiwgJzAnKTtcblx0XHRcdGNhc2UgJ0NVUlJFTlRfREFURSc6XG5cdFx0XHRcdHJldHVybiBTdHJpbmcodGhpcy5fZGF0ZS5nZXREYXRlKCkudmFsdWVPZigpKS5wYWRTdGFydCgyLCAnMCcpO1xuXHRcdFx0Y2FzZSAnQ1VSUkVOVF9IT1VSJzpcblx0XHRcdFx0cmV0dXJuIFN0cmluZyh0aGlzLl9kYXRlLmdldEhvdXJzKCkudmFsdWVPZigpKS5wYWRTdGFydCgyLCAnMCcpO1xuXHRcdFx0Y2FzZSAnQ1VSUkVOVF9NSU5VVEUnOlxuXHRcdFx0XHRyZXR1cm4gU3RyaW5nKHRoaXMuX2RhdGUuZ2V0TWludXRlcygpLnZhbHVlT2YoKSkucGFkU3RhcnQoMiwgJzAnKTtcblx0XHRcdGNhc2UgJ0NVUlJFTlRfU0VDT05EJzpcblx0XHRcdFx0cmV0dXJuIFN0cmluZyh0aGlzLl9kYXRlLmdldFNlY29uZHMoKS52YWx1ZU9mKCkpLnBhZFN0YXJ0KDIsICcwJyk7XG5cdFx0XHRjYXNlICdDVVJSRU5UX01JTExJU0VDT05EJzpcblx0XHRcdFx0cmV0dXJuIFN0cmluZyh0aGlzLl9kYXRlLmdldE1pbGxpc2Vjb25kcygpLnZhbHVlT2YoKSkucGFkU3RhcnQoMywgJzAnKTtcblx0XHRcdGNhc2UgJ0NVUlJFTlRfREFZX05BTUUnOlxuXHRcdFx0XHRyZXR1cm4gVGltZUJhc2VkVmFyaWFibGVSZXNvbHZlci5kYXlOYW1lc1t0aGlzLl9kYXRlLmdldERheSgpXTtcblx0XHRcdGNhc2UgJ0NVUlJFTlRfREFZX05BTUVfU0hPUlQnOlxuXHRcdFx0XHRyZXR1cm4gVGltZUJhc2VkVmFyaWFibGVSZXNvbHZlci5kYXlOYW1lc1Nob3J0W3RoaXMuX2RhdGUuZ2V0RGF5KCldO1xuXHRcdFx0Y2FzZSAnQ1VSUkVOVF9NT05USF9OQU1FJzpcblx0XHRcdFx0cmV0dXJuIFRpbWVCYXNlZFZhcmlhYmxlUmVzb2x2ZXIubW9udGhOYW1lc1t0aGlzLl9kYXRlLmdldE1vbnRoKCldO1xuXHRcdFx0Y2FzZSAnQ1VSUkVOVF9NT05USF9OQU1FX1NIT1JUJzpcblx0XHRcdFx0cmV0dXJuIFRpbWVCYXNlZFZhcmlhYmxlUmVzb2x2ZXIubW9udGhOYW1lc1Nob3J0W3RoaXMuX2RhdGUuZ2V0TW9udGgoKV07XG5cdFx0XHRjYXNlICdDVVJSRU5UX1NFQ09ORFNfVU5JWCc6XG5cdFx0XHRcdHJldHVybiBTdHJpbmcoTWF0aC5mbG9vcih0aGlzLl9kYXRlLmdldFRpbWUoKSAvIDEwMDApKTtcblx0XHRcdGNhc2UgJ0NVUlJFTlRfTUlMTElTRUNPTkRTX1VOSVgnOlxuXHRcdFx0XHRyZXR1cm4gU3RyaW5nKHRoaXMuX2RhdGUuZ2V0VGltZSgpKTtcblx0XHRcdGNhc2UgJ0NVUlJFTlRfVElNRVpPTkVfT0ZGU0VUJzoge1xuXHRcdFx0XHRjb25zdCByYXdUaW1lT2Zmc2V0ID0gdGhpcy5fZGF0ZS5nZXRUaW1lem9uZU9mZnNldCgpO1xuXHRcdFx0XHRjb25zdCBzaWduID0gcmF3VGltZU9mZnNldCA+IDAgPyAnLScgOiAnKyc7XG5cdFx0XHRcdGNvbnN0IGhvdXJzID0gTWF0aC50cnVuYyhNYXRoLmFicyhyYXdUaW1lT2Zmc2V0IC8gNjApKTtcblx0XHRcdFx0Y29uc3QgaG91cnNTdHJpbmcgPSAoaG91cnMgPCAxMCA/ICcwJyArIGhvdXJzIDogaG91cnMpO1xuXHRcdFx0XHRjb25zdCBtaW51dGVzID0gTWF0aC5hYnMocmF3VGltZU9mZnNldCkgLSBob3VycyAqIDYwO1xuXHRcdFx0XHRjb25zdCBtaW51dGVzU3RyaW5nID0gKG1pbnV0ZXMgPCAxMCA/ICcwJyArIG1pbnV0ZXMgOiBtaW51dGVzKTtcblx0XHRcdFx0cmV0dXJuIHNpZ24gKyBob3Vyc1N0cmluZyArICc6JyArIG1pbnV0ZXNTdHJpbmc7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdDVVJSRU5UX1RJTUVaT05FX05BTUUnOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fdGltZXpvbmVOYW1lID8/PSBJbnRsLkRhdGVUaW1lRm9ybWF0KCkucmVzb2x2ZWRPcHRpb25zKCkudGltZVpvbmU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgV29ya3NwYWNlQmFzZWRWYXJpYWJsZVJlc29sdmVyIGltcGxlbWVudHMgVmFyaWFibGVSZXNvbHZlciB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtzcGFjZVNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB8IHVuZGVmaW5lZCxcblx0KSB7XG5cdFx0Ly9cblx0fVxuXG5cdHJlc29sdmUodmFyaWFibGU6IFZhcmlhYmxlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX3dvcmtzcGFjZVNlcnZpY2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya3NwYWNlSWRlbnRpZmllciA9IHRvV29ya3NwYWNlSWRlbnRpZmllcih0aGlzLl93b3Jrc3BhY2VTZXJ2aWNlLmdldFdvcmtzcGFjZSgpKTtcblx0XHRpZiAoaXNFbXB0eVdvcmtzcGFjZUlkZW50aWZpZXIod29ya3NwYWNlSWRlbnRpZmllcikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHZhcmlhYmxlLm5hbWUgPT09ICdXT1JLU1BBQ0VfTkFNRScpIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZXNvbHZlV29ya3NwYWNlTmFtZSh3b3Jrc3BhY2VJZGVudGlmaWVyKTtcblx0XHR9IGVsc2UgaWYgKHZhcmlhYmxlLm5hbWUgPT09ICdXT1JLU1BBQ0VfRk9MREVSJykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3Jlc292ZVdvcmtzcGFjZVBhdGgod29ya3NwYWNlSWRlbnRpZmllcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRwcml2YXRlIF9yZXNvbHZlV29ya3NwYWNlTmFtZSh3b3Jrc3BhY2VJZGVudGlmaWVyOiBJV29ya3NwYWNlSWRlbnRpZmllciB8IElTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaXNTaW5nbGVGb2xkZXJXb3Jrc3BhY2VJZGVudGlmaWVyKHdvcmtzcGFjZUlkZW50aWZpZXIpKSB7XG5cdFx0XHRyZXR1cm4gcGF0aC5iYXNlbmFtZSh3b3Jrc3BhY2VJZGVudGlmaWVyLnVyaS5wYXRoKTtcblx0XHR9XG5cblx0XHRsZXQgZmlsZW5hbWUgPSBwYXRoLmJhc2VuYW1lKHdvcmtzcGFjZUlkZW50aWZpZXIuY29uZmlnUGF0aC5wYXRoKTtcblx0XHRpZiAoZmlsZW5hbWUuZW5kc1dpdGgoV09SS1NQQUNFX0VYVEVOU0lPTikpIHtcblx0XHRcdGZpbGVuYW1lID0gZmlsZW5hbWUuc3Vic3RyKDAsIGZpbGVuYW1lLmxlbmd0aCAtIFdPUktTUEFDRV9FWFRFTlNJT04ubGVuZ3RoIC0gMSk7XG5cdFx0fVxuXHRcdHJldHVybiBmaWxlbmFtZTtcblx0fVxuXHRwcml2YXRlIF9yZXNvdmVXb3Jrc3BhY2VQYXRoKHdvcmtzcGFjZUlkZW50aWZpZXI6IElXb3Jrc3BhY2VJZGVudGlmaWVyIHwgSVNpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmIChpc1NpbmdsZUZvbGRlcldvcmtzcGFjZUlkZW50aWZpZXIod29ya3NwYWNlSWRlbnRpZmllcikpIHtcblx0XHRcdHJldHVybiBub3JtYWxpemVEcml2ZUxldHRlcih3b3Jrc3BhY2VJZGVudGlmaWVyLnVyaS5mc1BhdGgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbGVuYW1lID0gcGF0aC5iYXNlbmFtZSh3b3Jrc3BhY2VJZGVudGlmaWVyLmNvbmZpZ1BhdGgucGF0aCk7XG5cdFx0bGV0IGZvbGRlcnBhdGggPSB3b3Jrc3BhY2VJZGVudGlmaWVyLmNvbmZpZ1BhdGguZnNQYXRoO1xuXHRcdGlmIChmb2xkZXJwYXRoLmVuZHNXaXRoKGZpbGVuYW1lKSkge1xuXHRcdFx0Zm9sZGVycGF0aCA9IGZvbGRlcnBhdGguc3Vic3RyKDAsIGZvbGRlcnBhdGgubGVuZ3RoIC0gZmlsZW5hbWUubGVuZ3RoIC0gMSk7XG5cdFx0fVxuXHRcdHJldHVybiAoZm9sZGVycGF0aCA/IG5vcm1hbGl6ZURyaXZlTGV0dGVyKGZvbGRlcnBhdGgpIDogJy8nKTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUmFuZG9tQmFzZWRWYXJpYWJsZVJlc29sdmVyIGltcGxlbWVudHMgVmFyaWFibGVSZXNvbHZlciB7XG5cdHJlc29sdmUodmFyaWFibGU6IFZhcmlhYmxlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB7IG5hbWUgfSA9IHZhcmlhYmxlO1xuXG5cdFx0aWYgKG5hbWUgPT09ICdSQU5ET00nKSB7XG5cdFx0XHRyZXR1cm4gTWF0aC5yYW5kb20oKS50b1N0cmluZygpLnNsaWNlKC02KTtcblx0XHR9IGVsc2UgaWYgKG5hbWUgPT09ICdSQU5ET01fSEVYJykge1xuXHRcdFx0cmV0dXJuIE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMTYpLnNsaWNlKC02KTtcblx0XHR9IGVsc2UgaWYgKG5hbWUgPT09ICdVVUlEJykge1xuXHRcdFx0cmV0dXJuIGdlbmVyYXRlVXVpZCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyw0QkFBNEI7QUFDckMsWUFBWSxVQUFVO0FBQ3RCLFNBQVMsZUFBZTtBQUN4QixTQUFTLG9CQUFvQixzQkFBc0IscUJBQXFCLGtCQUFrQjtBQUMxRixTQUFTLG9CQUFvQjtB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
