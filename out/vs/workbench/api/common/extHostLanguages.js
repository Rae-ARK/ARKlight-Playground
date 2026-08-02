import { MainContext } from "./extHost.protocol.js";
import * as typeConvert from "./extHostTypeConverters.js";
import { StandardTokenType, Range, LanguageStatusSeverity } from "./extHostTypes.js";
import Severity from "../../../base/common/severity.js";
import { disposableTimeout } from "../../../base/common/async.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { checkProposedApiEnabled } from "../../services/extensions/common/extensions.js";
import { Emitter } from "../../../base/common/event.js";
class ExtHostLanguages {
  constructor(mainContext, _documents, _commands, _uriTransformer) {
    this._documents = _documents;
    this._commands = _commands;
    this._uriTransformer = _uriTransformer;
    this._languageIds = [];
    this._onDidChangeSyntaxHighlighting = new Emitter();
    this.onDidChangeSyntaxHighlighting = this._onDidChangeSyntaxHighlighting.event;
    this._handlePool = 0;
    this._ids = /* @__PURE__ */ new Set();
    this._proxy = mainContext.getProxy(MainContext.MainThreadLanguages);
  }
  $acceptLanguageIds(ids) {
    this._languageIds = ids;
  }
  $acceptSyntaxHighlightingThemeChanged() {
    this._onDidChangeSyntaxHighlighting.fire();
  }
  async computeFullSyntaxHighlighting(source, languageId) {
    const result = await this._proxy.$computeFullSyntaxHighlighting(source, languageId);
    return result;
  }
  async getLanguages() {
    return this._languageIds.slice(0);
  }
  async changeLanguage(uri, languageId) {
    await this._proxy.$changeLanguage(uri, languageId);
    const data = this._documents.getDocumentData(uri);
    if (!data) {
      throw new Error(`document '${uri.toString()}' NOT found`);
    }
    return data.document;
  }
  async tokenAtPosition(document, position) {
    const versionNow = document.version;
    const pos = typeConvert.Position.from(position);
    const info = await this._proxy.$tokensAtPosition(document.uri, pos);
    const defaultRange = {
      type: StandardTokenType.Other,
      range: document.getWordRangeAtPosition(position) ?? new Range(position.line, position.character, position.line, position.character)
    };
    if (!info) {
      return defaultRange;
    }
    const result = {
      range: typeConvert.Range.to(info.range),
      type: typeConvert.TokenType.to(info.type)
    };
    if (!result.range.contains(position)) {
      return defaultRange;
    }
    if (versionNow !== document.version) {
      return defaultRange;
    }
    return result;
  }
  createLanguageStatusItem(extension, id, selector) {
    const handle = this._handlePool++;
    const proxy = this._proxy;
    const ids = this._ids;
    const fullyQualifiedId = `${extension.identifier.value}/${id}`;
    if (ids.has(fullyQualifiedId)) {
      throw new Error(`LanguageStatusItem with id '${id}' ALREADY exists`);
    }
    ids.add(fullyQualifiedId);
    const data = {
      selector,
      id,
      name: extension.displayName ?? extension.name,
      severity: LanguageStatusSeverity.Information,
      command: void 0,
      text: "",
      detail: "",
      busy: false
    };
    let soonHandle;
    const commandDisposables = new DisposableStore();
    const updateAsync = () => {
      soonHandle?.dispose();
      if (!ids.has(fullyQualifiedId)) {
        console.warn(`LanguageStatusItem (${id}) from ${extension.identifier.value} has been disposed and CANNOT be updated anymore`);
        return;
      }
      soonHandle = disposableTimeout(() => {
        commandDisposables.clear();
        this._proxy.$setLanguageStatus(handle, {
          id: fullyQualifiedId,
          name: data.name ?? extension.displayName ?? extension.name,
          source: extension.displayName ?? extension.name,
          selector: typeConvert.DocumentSelector.from(data.selector, this._uriTransformer),
          label: data.text,
          detail: data.detail ?? "",
          severity: data.severity === LanguageStatusSeverity.Error ? Severity.Error : data.severity === LanguageStatusSeverity.Warning ? Severity.Warning : Severity.Info,
          command: data.command && this._commands.toInternal(data.command, commandDisposables),
          accessibilityInfo: data.accessibilityInformation,
          busy: data.busy
        });
      }, 0);
    };
    const result = {
      dispose() {
        commandDisposables.dispose();
        soonHandle?.dispose();
        proxy.$removeLanguageStatus(handle);
        ids.delete(fullyQualifiedId);
      },
      get id() {
        return data.id;
      },
      get name() {
        return data.name;
      },
      set name(value) {
        data.name = value;
        updateAsync();
      },
      get selector() {
        return data.selector;
      },
      set selector(value) {
        data.selector = value;
        updateAsync();
      },
      get text() {
        return data.text;
      },
      set text(value) {
        data.text = value;
        updateAsync();
      },
      set text2(value) {
        checkProposedApiEnabled(extension, "languageStatusText");
        data.text = value;
        updateAsync();
      },
      get text2() {
        checkProposedApiEnabled(extension, "languageStatusText");
        return data.text;
      },
      get detail() {
        return data.detail;
      },
      set detail(value) {
        data.detail = value;
        updateAsync();
      },
      get severity() {
        return data.severity;
      },
      set severity(value) {
        data.severity = value;
        updateAsync();
      },
      get accessibilityInformation() {
        return data.accessibilityInformation;
      },
      set accessibilityInformation(value) {
        data.accessibilityInformation = value;
        updateAsync();
      },
      get command() {
        return data.command;
      },
      set command(value) {
        data.command = value;
        updateAsync();
      },
      get busy() {
        return data.busy;
      },
      set busy(value) {
        data.busy = value;
        updateAsync();
      }
    };
    updateAsync();
    return result;
  }
}
export {
  ExtHostLanguages
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvY29tbW9uL2V4dEhvc3RMYW5ndWFnZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBNYWluQ29udGV4dCwgTWFpblRocmVhZExhbmd1YWdlc1NoYXBlLCBJTWFpbkNvbnRleHQsIEV4dEhvc3RMYW5ndWFnZXNTaGFwZSB9IGZyb20gJy4vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50cyB9IGZyb20gJy4vZXh0SG9zdERvY3VtZW50cy5qcyc7XG5pbXBvcnQgKiBhcyB0eXBlQ29udmVydCBmcm9tICcuL2V4dEhvc3RUeXBlQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZFRva2VuVHlwZSwgUmFuZ2UsIFBvc2l0aW9uLCBMYW5ndWFnZVN0YXR1c1NldmVyaXR5IH0gZnJvbSAnLi9leHRIb3N0VHlwZXMuanMnO1xuaW1wb3J0IFNldmVyaXR5IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3NldmVyaXR5LmpzJztcbmltcG9ydCB7IGRpc3Bvc2FibGVUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IENvbW1hbmRzQ29udmVydGVyIH0gZnJvbSAnLi9leHRIb3N0Q29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSVVSSVRyYW5zZm9ybWVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpSXBjLmpzJztcbmltcG9ydCB7IGNoZWNrUHJvcG9zZWRBcGlFbmFibGVkIH0gZnJvbSAnLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuXG5leHBvcnQgY2xhc3MgRXh0SG9zdExhbmd1YWdlcyBpbXBsZW1lbnRzIEV4dEhvc3RMYW5ndWFnZXNTaGFwZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHJveHk6IE1haW5UaHJlYWRMYW5ndWFnZXNTaGFwZTtcblxuXHRwcml2YXRlIF9sYW5ndWFnZUlkczogc3RyaW5nW10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVN5bnRheEhpZ2hsaWdodGluZyA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU3ludGF4SGlnaGxpZ2h0aW5nID0gdGhpcy5fb25EaWRDaGFuZ2VTeW50YXhIaWdobGlnaHRpbmcuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0bWFpbkNvbnRleHQ6IElNYWluQ29udGV4dCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kb2N1bWVudHM6IEV4dEhvc3REb2N1bWVudHMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29tbWFuZHM6IENvbW1hbmRzQ29udmVydGVyLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3VyaVRyYW5zZm9ybWVyOiBJVVJJVHJhbnNmb3JtZXIgfCB1bmRlZmluZWRcblx0KSB7XG5cdFx0dGhpcy5fcHJveHkgPSBtYWluQ29udGV4dC5nZXRQcm94eShNYWluQ29udGV4dC5NYWluVGhyZWFkTGFuZ3VhZ2VzKTtcblx0fVxuXG5cdCRhY2NlcHRMYW5ndWFnZUlkcyhpZHM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0dGhpcy5fbGFuZ3VhZ2VJZHMgPSBpZHM7XG5cdH1cblxuXHQkYWNjZXB0U3ludGF4SGlnaGxpZ2h0aW5nVGhlbWVDaGFuZ2VkKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU3ludGF4SGlnaGxpZ2h0aW5nLmZpcmUoKTtcblx0fVxuXG5cdGFzeW5jIGNvbXB1dGVGdWxsU3ludGF4SGlnaGxpZ2h0aW5nKHNvdXJjZTogc3RyaW5nLCBsYW5ndWFnZUlkOiBzdHJpbmcpOiBQcm9taXNlPHZzY29kZS5TeW50YXhIaWdobGlnaHRpbmdSZXN1bHQ+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9wcm94eS4kY29tcHV0ZUZ1bGxTeW50YXhIaWdobGlnaHRpbmcoc291cmNlLCBsYW5ndWFnZUlkKTtcblx0XHRyZXR1cm4gcmVzdWx0IGFzIHZzY29kZS5TeW50YXhIaWdobGlnaHRpbmdSZXN1bHQ7XG5cdH1cblxuXHRhc3luYyBnZXRMYW5ndWFnZXMoKTogUHJvbWlzZTxzdHJpbmdbXT4ge1xuXHRcdHJldHVybiB0aGlzLl9sYW5ndWFnZUlkcy5zbGljZSgwKTtcblx0fVxuXG5cdGFzeW5jIGNoYW5nZUxhbmd1YWdlKHVyaTogdnNjb2RlLlVyaSwgbGFuZ3VhZ2VJZDogc3RyaW5nKTogUHJvbWlzZTx2c2NvZGUuVGV4dERvY3VtZW50PiB7XG5cdFx0YXdhaXQgdGhpcy5fcHJveHkuJGNoYW5nZUxhbmd1YWdlKHVyaSwgbGFuZ3VhZ2VJZCk7XG5cdFx0Y29uc3QgZGF0YSA9IHRoaXMuX2RvY3VtZW50cy5nZXREb2N1bWVudERhdGEodXJpKTtcblx0XHRpZiAoIWRhdGEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgZG9jdW1lbnQgJyR7dXJpLnRvU3RyaW5nKCl9JyBOT1QgZm91bmRgKTtcblx0XHR9XG5cdFx0cmV0dXJuIGRhdGEuZG9jdW1lbnQ7XG5cdH1cblxuXHRhc3luYyB0b2tlbkF0UG9zaXRpb24oZG9jdW1lbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnQsIHBvc2l0aW9uOiB2c2NvZGUuUG9zaXRpb24pOiBQcm9taXNlPHZzY29kZS5Ub2tlbkluZm9ybWF0aW9uPiB7XG5cdFx0Y29uc3QgdmVyc2lvbk5vdyA9IGRvY3VtZW50LnZlcnNpb247XG5cdFx0Y29uc3QgcG9zID0gdHlwZUNvbnZlcnQuUG9zaXRpb24uZnJvbShwb3NpdGlvbik7XG5cdFx0Y29uc3QgaW5mbyA9IGF3YWl0IHRoaXMuX3Byb3h5LiR0b2tlbnNBdFBvc2l0aW9uKGRvY3VtZW50LnVyaSwgcG9zKTtcblx0XHRjb25zdCBkZWZhdWx0UmFuZ2UgPSB7XG5cdFx0XHR0eXBlOiBTdGFuZGFyZFRva2VuVHlwZS5PdGhlcixcblx0XHRcdHJhbmdlOiBkb2N1bWVudC5nZXRXb3JkUmFuZ2VBdFBvc2l0aW9uKHBvc2l0aW9uKSA/PyBuZXcgUmFuZ2UocG9zaXRpb24ubGluZSwgcG9zaXRpb24uY2hhcmFjdGVyLCBwb3NpdGlvbi5saW5lLCBwb3NpdGlvbi5jaGFyYWN0ZXIpXG5cdFx0fTtcblx0XHRpZiAoIWluZm8pIHtcblx0XHRcdC8vIG5vIHJlc3VsdFxuXHRcdFx0cmV0dXJuIGRlZmF1bHRSYW5nZTtcblx0XHR9XG5cdFx0Y29uc3QgcmVzdWx0ID0ge1xuXHRcdFx0cmFuZ2U6IHR5cGVDb252ZXJ0LlJhbmdlLnRvKGluZm8ucmFuZ2UpLFxuXHRcdFx0dHlwZTogdHlwZUNvbnZlcnQuVG9rZW5UeXBlLnRvKGluZm8udHlwZSlcblx0XHR9O1xuXHRcdGlmICghcmVzdWx0LnJhbmdlLmNvbnRhaW5zKDxQb3NpdGlvbj5wb3NpdGlvbikpIHtcblx0XHRcdC8vIGJvZ291cyByZXN1bHRcblx0XHRcdHJldHVybiBkZWZhdWx0UmFuZ2U7XG5cdFx0fVxuXHRcdGlmICh2ZXJzaW9uTm93ICE9PSBkb2N1bWVudC52ZXJzaW9uKSB7XG5cdFx0XHQvLyBjb25jdXJyZW50IGNoYW5nZVxuXHRcdFx0cmV0dXJuIGRlZmF1bHRSYW5nZTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgX2hhbmRsZVBvb2w6IG51bWJlciA9IDA7XG5cdHByaXZhdGUgX2lkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGNyZWF0ZUxhbmd1YWdlU3RhdHVzSXRlbShleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbiwgaWQ6IHN0cmluZywgc2VsZWN0b3I6IHZzY29kZS5Eb2N1bWVudFNlbGVjdG9yKTogdnNjb2RlLkxhbmd1YWdlU3RhdHVzSXRlbSB7XG5cblx0XHRjb25zdCBoYW5kbGUgPSB0aGlzLl9oYW5kbGVQb29sKys7XG5cdFx0Y29uc3QgcHJveHkgPSB0aGlzLl9wcm94eTtcblx0XHRjb25zdCBpZHMgPSB0aGlzLl9pZHM7XG5cblx0XHQvLyBlbmZvcmNlIGV4dGVuc2lvbiB1bmlxdWUgaWRlbnRpZmllclxuXHRcdGNvbnN0IGZ1bGx5UXVhbGlmaWVkSWQgPSBgJHtleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZX0vJHtpZH1gO1xuXHRcdGlmIChpZHMuaGFzKGZ1bGx5UXVhbGlmaWVkSWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYExhbmd1YWdlU3RhdHVzSXRlbSB3aXRoIGlkICcke2lkfScgQUxSRUFEWSBleGlzdHNgKTtcblx0XHR9XG5cdFx0aWRzLmFkZChmdWxseVF1YWxpZmllZElkKTtcblxuXHRcdGNvbnN0IGRhdGE6IE9taXQ8dnNjb2RlLkxhbmd1YWdlU3RhdHVzSXRlbSwgJ2Rpc3Bvc2UnIHwgJ3RleHQyJz4gPSB7XG5cdFx0XHRzZWxlY3Rvcixcblx0XHRcdGlkLFxuXHRcdFx0bmFtZTogZXh0ZW5zaW9uLmRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbi5uYW1lLFxuXHRcdFx0c2V2ZXJpdHk6IExhbmd1YWdlU3RhdHVzU2V2ZXJpdHkuSW5mb3JtYXRpb24sXG5cdFx0XHRjb21tYW5kOiB1bmRlZmluZWQsXG5cdFx0XHR0ZXh0OiAnJyxcblx0XHRcdGRldGFpbDogJycsXG5cdFx0XHRidXN5OiBmYWxzZVxuXHRcdH07XG5cblxuXHRcdGxldCBzb29uSGFuZGxlOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb21tYW5kRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgdXBkYXRlQXN5bmMgPSAoKSA9PiB7XG5cdFx0XHRzb29uSGFuZGxlPy5kaXNwb3NlKCk7XG5cblx0XHRcdGlmICghaWRzLmhhcyhmdWxseVF1YWxpZmllZElkKSkge1xuXHRcdFx0XHRjb25zb2xlLndhcm4oYExhbmd1YWdlU3RhdHVzSXRlbSAoJHtpZH0pIGZyb20gJHtleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZX0gaGFzIGJlZW4gZGlzcG9zZWQgYW5kIENBTk5PVCBiZSB1cGRhdGVkIGFueW1vcmVgKTtcblx0XHRcdFx0cmV0dXJuOyAvLyBkaXNwb3NlZCBpbiB0aGUgbWVhbnRpbWVcblx0XHRcdH1cblxuXHRcdFx0c29vbkhhbmRsZSA9IGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0Y29tbWFuZERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdHRoaXMuX3Byb3h5LiRzZXRMYW5ndWFnZVN0YXR1cyhoYW5kbGUsIHtcblx0XHRcdFx0XHRpZDogZnVsbHlRdWFsaWZpZWRJZCxcblx0XHRcdFx0XHRuYW1lOiBkYXRhLm5hbWUgPz8gZXh0ZW5zaW9uLmRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbi5uYW1lLFxuXHRcdFx0XHRcdHNvdXJjZTogZXh0ZW5zaW9uLmRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbi5uYW1lLFxuXHRcdFx0XHRcdHNlbGVjdG9yOiB0eXBlQ29udmVydC5Eb2N1bWVudFNlbGVjdG9yLmZyb20oZGF0YS5zZWxlY3RvciwgdGhpcy5fdXJpVHJhbnNmb3JtZXIpLFxuXHRcdFx0XHRcdGxhYmVsOiBkYXRhLnRleHQsXG5cdFx0XHRcdFx0ZGV0YWlsOiBkYXRhLmRldGFpbCA/PyAnJyxcblx0XHRcdFx0XHRzZXZlcml0eTogZGF0YS5zZXZlcml0eSA9PT0gTGFuZ3VhZ2VTdGF0dXNTZXZlcml0eS5FcnJvciA/IFNldmVyaXR5LkVycm9yIDogZGF0YS5zZXZlcml0eSA9PT0gTGFuZ3VhZ2VTdGF0dXNTZXZlcml0eS5XYXJuaW5nID8gU2V2ZXJpdHkuV2FybmluZyA6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdFx0Y29tbWFuZDogZGF0YS5jb21tYW5kICYmIHRoaXMuX2NvbW1hbmRzLnRvSW50ZXJuYWwoZGF0YS5jb21tYW5kLCBjb21tYW5kRGlzcG9zYWJsZXMpLFxuXHRcdFx0XHRcdGFjY2Vzc2liaWxpdHlJbmZvOiBkYXRhLmFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbixcblx0XHRcdFx0XHRidXN5OiBkYXRhLmJ1c3lcblx0XHRcdFx0fSk7XG5cdFx0XHR9LCAwKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVzdWx0OiB2c2NvZGUuTGFuZ3VhZ2VTdGF0dXNJdGVtID0ge1xuXHRcdFx0ZGlzcG9zZSgpIHtcblx0XHRcdFx0Y29tbWFuZERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdFx0c29vbkhhbmRsZT8uZGlzcG9zZSgpO1xuXHRcdFx0XHRwcm94eS4kcmVtb3ZlTGFuZ3VhZ2VTdGF0dXMoaGFuZGxlKTtcblx0XHRcdFx0aWRzLmRlbGV0ZShmdWxseVF1YWxpZmllZElkKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgaWQoKSB7XG5cdFx0XHRcdHJldHVybiBkYXRhLmlkO1xuXHRcdFx0fSxcblx0XHRcdGdldCBuYW1lKCkge1xuXHRcdFx0XHRyZXR1cm4gZGF0YS5uYW1lO1xuXHRcdFx0fSxcblx0XHRcdHNldCBuYW1lKHZhbHVlKSB7XG5cdFx0XHRcdGRhdGEubmFtZSA9IHZhbHVlO1xuXHRcdFx0XHR1cGRhdGVBc3luYygpO1xuXHRcdFx0fSxcblx0XHRcdGdldCBzZWxlY3RvcigpIHtcblx0XHRcdFx0cmV0dXJuIGRhdGEuc2VsZWN0b3I7XG5cdFx0XHR9LFxuXHRcdFx0c2V0IHNlbGVjdG9yKHZhbHVlKSB7XG5cdFx0XHRcdGRhdGEuc2VsZWN0b3IgPSB2YWx1ZTtcblx0XHRcdFx0dXBkYXRlQXN5bmMoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgdGV4dCgpIHtcblx0XHRcdFx0cmV0dXJuIGRhdGEudGV4dDtcblx0XHRcdH0sXG5cdFx0XHRzZXQgdGV4dCh2YWx1ZSkge1xuXHRcdFx0XHRkYXRhLnRleHQgPSB2YWx1ZTtcblx0XHRcdFx0dXBkYXRlQXN5bmMoKTtcblx0XHRcdH0sXG5cdFx0XHRzZXQgdGV4dDIodmFsdWUpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbGFuZ3VhZ2VTdGF0dXNUZXh0Jyk7XG5cdFx0XHRcdGRhdGEudGV4dCA9IHZhbHVlO1xuXHRcdFx0XHR1cGRhdGVBc3luYygpO1xuXHRcdFx0fSxcblx0XHRcdGdldCB0ZXh0MigpIHtcblx0XHRcdFx0Y2hlY2tQcm9wb3NlZEFwaUVuYWJsZWQoZXh0ZW5zaW9uLCAnbGFuZ3VhZ2VTdGF0dXNUZXh0Jyk7XG5cdFx0XHRcdHJldHVybiBkYXRhLnRleHQ7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGRldGFpbCgpIHtcblx0XHRcdFx0cmV0dXJuIGRhdGEuZGV0YWlsO1xuXHRcdFx0fSxcblx0XHRcdHNldCBkZXRhaWwodmFsdWUpIHtcblx0XHRcdFx0ZGF0YS5kZXRhaWwgPSB2YWx1ZTtcblx0XHRcdFx0dXBkYXRlQXN5bmMoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgc2V2ZXJpdHkoKSB7XG5cdFx0XHRcdHJldHVybiBkYXRhLnNldmVyaXR5O1xuXHRcdFx0fSxcblx0XHRcdHNldCBzZXZlcml0eSh2YWx1ZSkge1xuXHRcdFx0XHRkYXRhLnNldmVyaXR5ID0gdmFsdWU7XG5cdFx0XHRcdHVwZGF0ZUFzeW5jKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0IGFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbigpIHtcblx0XHRcdFx0cmV0dXJuIGRhdGEuYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uO1xuXHRcdFx0fSxcblx0XHRcdHNldCBhY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24odmFsdWUpIHtcblx0XHRcdFx0ZGF0YS5hY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24gPSB2YWx1ZTtcblx0XHRcdFx0dXBkYXRlQXN5bmMoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgY29tbWFuZCgpIHtcblx0XHRcdFx0cmV0dXJuIGRhdGEuY29tbWFuZDtcblx0XHRcdH0sXG5cdFx0XHRzZXQgY29tbWFuZCh2YWx1ZSkge1xuXHRcdFx0XHRkYXRhLmNvbW1hbmQgPSB2YWx1ZTtcblx0XHRcdFx0dXBkYXRlQXN5bmMoKTtcblx0XHRcdH0sXG5cdFx0XHRnZXQgYnVzeSgpIHtcblx0XHRcdFx0cmV0dXJuIGRhdGEuYnVzeTtcblx0XHRcdH0sXG5cdFx0XHRzZXQgYnVzeSh2YWx1ZTogYm9vbGVhbikge1xuXHRcdFx0XHRkYXRhLmJ1c3kgPSB2YWx1ZTtcblx0XHRcdFx0dXBkYXRlQXN5bmMoKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHVwZGF0ZUFzeW5jKCk7XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxtQkFBa0Y7QUFHM0YsWUFBWSxpQkFBaUI7QUFDN0IsU0FBUyxtQkFBbUIsT0FBaUIs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
