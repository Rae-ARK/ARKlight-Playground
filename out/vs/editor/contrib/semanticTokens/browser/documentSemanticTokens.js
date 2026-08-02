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
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import * as errors from "../../../../base/common/errors.js";
import { Disposable, DisposableStore, dispose } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { registerEditorFeature } from "../../../common/editorFeatures.js";
import { ILanguageFeatureDebounceService } from "../../../common/services/languageFeatureDebounce.js";
import { ILanguageFeaturesService } from "../../../common/services/languageFeatures.js";
import { IModelService } from "../../../common/services/model.js";
import { toMultilineTokens2 } from "../../../common/services/semanticTokensProviderStyling.js";
import { ISemanticTokensStylingService } from "../../../common/services/semanticTokensStyling.js";
import { getDocumentSemanticTokens, hasDocumentSemanticTokensProvider, isSemanticTokens, isSemanticTokensEdits } from "../common/getSemanticTokens.js";
import { SEMANTIC_HIGHLIGHTING_SETTING_ID, isSemanticColoringEnabled } from "../common/semanticTokensConfig.js";
let DocumentSemanticTokensFeature = class extends Disposable {
  constructor(semanticTokensStylingService, modelService, themeService, configurationService, languageFeatureDebounceService, languageFeaturesService) {
    super();
    this._watchers = new ResourceMap();
    this._providerChangeListeners = this._register(new DisposableStore());
    const provider = languageFeaturesService.documentSemanticTokensProvider;
    const register = (model) => {
      this._watchers.get(model.uri)?.dispose();
      this._watchers.set(model.uri, new ModelSemanticColoring(model, semanticTokensStylingService, themeService, languageFeatureDebounceService, languageFeaturesService));
    };
    const deregister = (model, modelSemanticColoring) => {
      modelSemanticColoring.dispose();
      this._watchers.delete(model.uri);
    };
    const handleSettingOrThemeChange = () => {
      for (const model of modelService.getModels()) {
        const curr = this._watchers.get(model.uri);
        if (isSemanticColoringEnabled(model, themeService, configurationService)) {
          if (!curr) {
            register(model);
          }
        } else {
          if (curr) {
            deregister(model, curr);
          }
        }
      }
    };
    const bindProviderChangeListeners = () => {
      this._providerChangeListeners.clear();
      for (const p of provider.allNoModel()) {
        if (typeof p.onDidChange === "function") {
          this._providerChangeListeners.add(p.onDidChange(() => {
            for (const watcher of this._watchers.values()) {
              watcher.handleProviderDidChange(p);
            }
          }));
        }
      }
    };
    modelService.getModels().forEach((model) => {
      if (isSemanticColoringEnabled(model, themeService, configurationService)) {
        register(model);
      }
    });
    this._register(modelService.onModelAdded((model) => {
      if (isSemanticColoringEnabled(model, themeService, configurationService)) {
        register(model);
      }
    }));
    this._register(modelService.onModelRemoved((model) => {
      const curr = this._watchers.get(model.uri);
      if (curr) {
        deregister(model, curr);
      }
    }));
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(SEMANTIC_HIGHLIGHTING_SETTING_ID)) {
        handleSettingOrThemeChange();
      }
    }));
    this._register(themeService.onDidColorThemeChange(handleSettingOrThemeChange));
    bindProviderChangeListeners();
    this._register(provider.onDidChange(() => {
      bindProviderChangeListeners();
      for (const watcher of this._watchers.values()) {
        watcher.handleRegistryChange();
      }
    }));
  }
  dispose() {
    dispose(this._watchers.values());
    this._watchers.clear();
    super.dispose();
  }
};
DocumentSemanticTokensFeature = __decorateClass([
  __decorateParam(0, ISemanticTokensStylingService),
  __decorateParam(1, IModelService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, ILanguageFeatureDebounceService),
  __decorateParam(5, ILanguageFeaturesService)
], DocumentSemanticTokensFeature);
let ModelSemanticColoring = class extends Disposable {
  constructor(model, _semanticTokensStylingService, themeService, languageFeatureDebounceService, languageFeaturesService) {
    super();
    this._semanticTokensStylingService = _semanticTokensStylingService;
    this._relevantProviders = /* @__PURE__ */ new Set();
    this._isDisposed = false;
    this._model = model;
    this._provider = languageFeaturesService.documentSemanticTokensProvider;
    this._debounceInformation = languageFeatureDebounceService.for(this._provider, "DocumentSemanticTokens", { min: ModelSemanticColoring.REQUEST_MIN_DELAY, max: ModelSemanticColoring.REQUEST_MAX_DELAY });
    this._fetchDocumentSemanticTokens = this._register(new RunOnceScheduler(() => this._fetchDocumentSemanticTokensNow(), ModelSemanticColoring.REQUEST_MIN_DELAY));
    this._currentDocumentResponse = null;
    this._currentDocumentRequestCancellationTokenSource = null;
    this._providersChangedDuringRequest = false;
    this._updateRelevantProviders();
    this._register(this._model.onDidChangeContent(() => {
      if (!this._fetchDocumentSemanticTokens.isScheduled()) {
        this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
      }
    }));
    this._register(this._model.onDidChangeAttached(() => {
      if (!this._fetchDocumentSemanticTokens.isScheduled()) {
        this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
      }
    }));
    this._register(this._model.onDidChangeLanguage(() => {
      if (this._currentDocumentResponse) {
        this._currentDocumentResponse.dispose();
        this._currentDocumentResponse = null;
      }
      if (this._currentDocumentRequestCancellationTokenSource) {
        this._currentDocumentRequestCancellationTokenSource.cancel();
        this._currentDocumentRequestCancellationTokenSource = null;
      }
      this._setDocumentSemanticTokens(null, null, null, []);
      this._updateRelevantProviders();
      this._fetchDocumentSemanticTokens.schedule(0);
    }));
    this._register(themeService.onDidColorThemeChange((_) => {
      this._setDocumentSemanticTokens(null, null, null, []);
      this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
    }));
    this._fetchDocumentSemanticTokens.schedule(0);
  }
  handleRegistryChange() {
    this._updateRelevantProviders();
    this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
  }
  handleProviderDidChange(provider) {
    if (!this._relevantProviders.has(provider)) {
      return;
    }
    if (this._currentDocumentRequestCancellationTokenSource) {
      this._providersChangedDuringRequest = true;
      return;
    }
    this._fetchDocumentSemanticTokens.schedule(0);
  }
  _updateRelevantProviders() {
    this._relevantProviders = new Set(this._provider.all(this._model));
  }
  dispose() {
    if (this._currentDocumentResponse) {
      this._currentDocumentResponse.dispose();
      this._currentDocumentResponse = null;
    }
    if (this._currentDocumentRequestCancellationTokenSource) {
      this._currentDocumentRequestCancellationTokenSource.cancel();
      this._currentDocumentRequestCancellationTokenSource = null;
    }
    this._setDocumentSemanticTokens(null, null, null, []);
    this._isDisposed = true;
    super.dispose();
  }
  _fetchDocumentSemanticTokensNow() {
    if (this._currentDocumentRequestCancellationTokenSource) {
      return;
    }
    if (!hasDocumentSemanticTokensProvider(this._provider, this._model)) {
      if (this._currentDocumentResponse) {
        this._model.tokenization.setSemanticTokens(null, false);
      }
      return;
    }
    if (!this._model.isAttachedToEditor()) {
      return;
    }
    const cancellationTokenSource = new CancellationTokenSource();
    const lastProvider = this._currentDocumentResponse ? this._currentDocumentResponse.provider : null;
    const lastResultId = this._currentDocumentResponse ? this._currentDocumentResponse.resultId || null : null;
    const request = getDocumentSemanticTokens(this._provider, this._model, lastProvider, lastResultId, cancellationTokenSource.token);
    this._currentDocumentRequestCancellationTokenSource = cancellationTokenSource;
    this._providersChangedDuringRequest = false;
    const pendingChanges = [];
    const contentChangeListener = this._model.onDidChangeContent((e) => {
      pendingChanges.push(e);
    });
    const sw = new StopWatch(false);
    request.then((res) => {
      this._debounceInformation.update(this._model, sw.elapsed());
      this._currentDocumentRequestCancellationTokenSource = null;
      contentChangeListener.dispose();
      if (!res) {
        this._setDocumentSemanticTokens(null, null, null, pendingChanges);
      } else {
        const { provider, tokens } = res;
        const styling = this._semanticTokensStylingService.getStyling(provider);
        this._setDocumentSemanticTokens(provider, tokens || null, styling, pendingChanges);
      }
    }, (err) => {
      const isExpectedError = err && (errors.isCancellationError(err) || typeof err.message === "string" && err.message.indexOf("busy") !== -1);
      if (!isExpectedError) {
        errors.onUnexpectedError(err);
      }
      this._currentDocumentRequestCancellationTokenSource = null;
      contentChangeListener.dispose();
      if (pendingChanges.length > 0 || this._providersChangedDuringRequest) {
        if (!this._fetchDocumentSemanticTokens.isScheduled()) {
          this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
        }
      }
    });
  }
  static _copy(src, srcOffset, dest, destOffset, length) {
    length = Math.min(length, dest.length - destOffset, src.length - srcOffset);
    for (let i = 0; i < length; i++) {
      dest[destOffset + i] = src[srcOffset + i];
    }
  }
  _setDocumentSemanticTokens(provider, tokens, styling, pendingChanges) {
    const currentResponse = this._currentDocumentResponse;
    const rescheduleIfNeeded = () => {
      if ((pendingChanges.length > 0 || this._providersChangedDuringRequest) && !this._fetchDocumentSemanticTokens.isScheduled()) {
        this._fetchDocumentSemanticTokens.schedule(this._debounceInformation.get(this._model));
      }
    };
    if (this._currentDocumentResponse) {
      this._currentDocumentResponse.dispose();
      this._currentDocumentResponse = null;
    }
    if (this._isDisposed) {
      if (provider && tokens) {
        provider.releaseDocumentSemanticTokens(tokens.resultId);
      }
      return;
    }
    if (!provider || !styling) {
      this._model.tokenization.setSemanticTokens(null, false);
      return;
    }
    if (!tokens) {
      this._model.tokenization.setSemanticTokens(null, true);
      rescheduleIfNeeded();
      return;
    }
    if (isSemanticTokensEdits(tokens)) {
      if (!currentResponse) {
        this._model.tokenization.setSemanticTokens(null, true);
        return;
      }
      if (tokens.edits.length === 0) {
        tokens = {
          resultId: tokens.resultId,
          data: currentResponse.data
        };
      } else {
        let deltaLength = 0;
        for (const edit of tokens.edits) {
          deltaLength += (edit.data ? edit.data.length : 0) - edit.deleteCount;
        }
        const srcData = currentResponse.data;
        const destData = new Uint32Array(srcData.length + deltaLength);
        let srcLastStart = srcData.length;
        let destLastStart = destData.length;
        for (let i = tokens.edits.length - 1; i >= 0; i--) {
          const edit = tokens.edits[i];
          if (edit.start > srcData.length) {
            styling.warnInvalidEditStart(currentResponse.resultId, tokens.resultId, i, edit.start, srcData.length);
            this._model.tokenization.setSemanticTokens(null, true);
            return;
          }
          const copyCount = srcLastStart - (edit.start + edit.deleteCount);
          if (copyCount > 0) {
            ModelSemanticColoring._copy(srcData, srcLastStart - copyCount, destData, destLastStart - copyCount, copyCount);
            destLastStart -= copyCount;
          }
          if (edit.data) {
            ModelSemanticColoring._copy(edit.data, 0, destData, destLastStart - edit.data.length, edit.data.length);
            destLastStart -= edit.data.length;
          }
          srcLastStart = edit.start;
        }
        if (srcLastStart > 0) {
          ModelSemanticColoring._copy(srcData, 0, destData, 0, srcLastStart);
        }
        tokens = {
          resultId: tokens.resultId,
          data: destData
        };
      }
    }
    if (isSemanticTokens(tokens)) {
      this._currentDocumentResponse = new SemanticTokensResponse(provider, tokens.resultId, tokens.data);
      const result = toMultilineTokens2(tokens, styling, this._model.getLanguageId());
      if (pendingChanges.length > 0) {
        for (const change of pendingChanges) {
          for (const area of result) {
            for (const singleChange of change.changes) {
              area.applyEdit(singleChange.range, singleChange.text);
            }
          }
        }
      }
      this._model.tokenization.setSemanticTokens(result, true);
    } else {
      this._model.tokenization.setSemanticTokens(null, true);
    }
    rescheduleIfNeeded();
  }
};
ModelSemanticColoring.REQUEST_MIN_DELAY = 300;
ModelSemanticColoring.REQUEST_MAX_DELAY = 2e3;
ModelSemanticColoring = __decorateClass([
  __decorateParam(1, ISemanticTokensStylingService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, ILanguageFeatureDebounceService),
  __decorateParam(4, ILanguageFeaturesService)
], ModelSemanticColoring);
class SemanticTokensResponse {
  constructor(provider, resultId, data) {
    this.provider = provider;
    this.resultId = resultId;
    this.data = data;
  }
  dispose() {
    this.provider.releaseDocumentSemanticTokens(this.resultId);
  }
}
registerEditorFeature(DocumentSemanticTokensFeature);
export {
  DocumentSemanticTokensFeature
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3NlbWFudGljVG9rZW5zL2Jyb3dzZXIvZG9jdW1lbnRTZW1hbnRpY1Rva2Vucy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFJ1bk9uY2VTY2hlZHVsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgKiBhcyBlcnJvcnMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckVkaXRvckZlYXR1cmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VGZWF0dXJlUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyLCBTZW1hbnRpY1Rva2VucywgU2VtYW50aWNUb2tlbnNFZGl0cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJRmVhdHVyZURlYm91bmNlSW5mb3JtYXRpb24sIElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL2xhbmd1YWdlRmVhdHVyZXMuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyU3R5bGluZywgdG9NdWx0aWxpbmVUb2tlbnMyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL3NlbWFudGljVG9rZW5zUHJvdmlkZXJTdHlsaW5nLmpzJztcbmltcG9ydCB7IElTZW1hbnRpY1Rva2Vuc1N0eWxpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZpY2VzL3NlbWFudGljVG9rZW5zU3R5bGluZy5qcyc7XG5pbXBvcnQgeyBJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RleHRNb2RlbEV2ZW50cy5qcyc7XG5pbXBvcnQgeyBnZXREb2N1bWVudFNlbWFudGljVG9rZW5zLCBoYXNEb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIsIGlzU2VtYW50aWNUb2tlbnMsIGlzU2VtYW50aWNUb2tlbnNFZGl0cyB9IGZyb20gJy4uL2NvbW1vbi9nZXRTZW1hbnRpY1Rva2Vucy5qcyc7XG5pbXBvcnQgeyBTRU1BTlRJQ19ISUdITElHSFRJTkdfU0VUVElOR19JRCwgaXNTZW1hbnRpY0NvbG9yaW5nRW5hYmxlZCB9IGZyb20gJy4uL2NvbW1vbi9zZW1hbnRpY1Rva2Vuc0NvbmZpZy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBEb2N1bWVudFNlbWFudGljVG9rZW5zRmVhdHVyZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dhdGNoZXJzID0gbmV3IFJlc291cmNlTWFwPE1vZGVsU2VtYW50aWNDb2xvcmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJDaGFuZ2VMaXN0ZW5lcnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU2VtYW50aWNUb2tlbnNTdHlsaW5nU2VydmljZSBzZW1hbnRpY1Rva2Vuc1N0eWxpbmdTZXJ2aWNlOiBJU2VtYW50aWNUb2tlbnNTdHlsaW5nU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSBsYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2U6IElMYW5ndWFnZUZlYXR1cmVEZWJvdW5jZVNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBsYW5ndWFnZUZlYXR1cmVzU2VydmljZS5kb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXI7XG5cblx0XHRjb25zdCByZWdpc3RlciA9IChtb2RlbDogSVRleHRNb2RlbCkgPT4ge1xuXHRcdFx0dGhpcy5fd2F0Y2hlcnMuZ2V0KG1vZGVsLnVyaSk/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX3dhdGNoZXJzLnNldChtb2RlbC51cmksIG5ldyBNb2RlbFNlbWFudGljQ29sb3JpbmcobW9kZWwsIHNlbWFudGljVG9rZW5zU3R5bGluZ1NlcnZpY2UsIHRoZW1lU2VydmljZSwgbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlLCBsYW5ndWFnZUZlYXR1cmVzU2VydmljZSkpO1xuXHRcdH07XG5cdFx0Y29uc3QgZGVyZWdpc3RlciA9IChtb2RlbDogSVRleHRNb2RlbCwgbW9kZWxTZW1hbnRpY0NvbG9yaW5nOiBNb2RlbFNlbWFudGljQ29sb3JpbmcpID0+IHtcblx0XHRcdG1vZGVsU2VtYW50aWNDb2xvcmluZy5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl93YXRjaGVycy5kZWxldGUobW9kZWwudXJpKTtcblx0XHR9O1xuXHRcdGNvbnN0IGhhbmRsZVNldHRpbmdPclRoZW1lQ2hhbmdlID0gKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBtb2RlbCBvZiBtb2RlbFNlcnZpY2UuZ2V0TW9kZWxzKCkpIHtcblx0XHRcdFx0Y29uc3QgY3VyciA9IHRoaXMuX3dhdGNoZXJzLmdldChtb2RlbC51cmkpO1xuXHRcdFx0XHRpZiAoaXNTZW1hbnRpY0NvbG9yaW5nRW5hYmxlZChtb2RlbCwgdGhlbWVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSkpIHtcblx0XHRcdFx0XHRpZiAoIWN1cnIpIHtcblx0XHRcdFx0XHRcdHJlZ2lzdGVyKG1vZGVsKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKGN1cnIpIHtcblx0XHRcdFx0XHRcdGRlcmVnaXN0ZXIobW9kZWwsIGN1cnIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBiaW5kUHJvdmlkZXJDaGFuZ2VMaXN0ZW5lcnMgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLl9wcm92aWRlckNoYW5nZUxpc3RlbmVycy5jbGVhcigpO1xuXHRcdFx0Zm9yIChjb25zdCBwIG9mIHByb3ZpZGVyLmFsbE5vTW9kZWwoKSkge1xuXHRcdFx0XHRpZiAodHlwZW9mIHAub25EaWRDaGFuZ2UgPT09ICdmdW5jdGlvbicpIHtcblx0XHRcdFx0XHR0aGlzLl9wcm92aWRlckNoYW5nZUxpc3RlbmVycy5hZGQocC5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHdhdGNoZXIgb2YgdGhpcy5fd2F0Y2hlcnMudmFsdWVzKCkpIHtcblx0XHRcdFx0XHRcdFx0d2F0Y2hlci5oYW5kbGVQcm92aWRlckRpZENoYW5nZShwKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0bW9kZWxTZXJ2aWNlLmdldE1vZGVscygpLmZvckVhY2gobW9kZWwgPT4ge1xuXHRcdFx0aWYgKGlzU2VtYW50aWNDb2xvcmluZ0VuYWJsZWQobW9kZWwsIHRoZW1lU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0XHRcdHJlZ2lzdGVyKG1vZGVsKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbFNlcnZpY2Uub25Nb2RlbEFkZGVkKChtb2RlbCkgPT4ge1xuXHRcdFx0aWYgKGlzU2VtYW50aWNDb2xvcmluZ0VuYWJsZWQobW9kZWwsIHRoZW1lU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpKSB7XG5cdFx0XHRcdHJlZ2lzdGVyKG1vZGVsKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIobW9kZWxTZXJ2aWNlLm9uTW9kZWxSZW1vdmVkKChtb2RlbCkgPT4ge1xuXHRcdFx0Y29uc3QgY3VyciA9IHRoaXMuX3dhdGNoZXJzLmdldChtb2RlbC51cmkpO1xuXHRcdFx0aWYgKGN1cnIpIHtcblx0XHRcdFx0ZGVyZWdpc3Rlcihtb2RlbCwgY3Vycik7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKFNFTUFOVElDX0hJR0hMSUdIVElOR19TRVRUSU5HX0lEKSkge1xuXHRcdFx0XHRoYW5kbGVTZXR0aW5nT3JUaGVtZUNoYW5nZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGVtZVNlcnZpY2Uub25EaWRDb2xvclRoZW1lQ2hhbmdlKGhhbmRsZVNldHRpbmdPclRoZW1lQ2hhbmdlKSk7XG5cdFx0YmluZFByb3ZpZGVyQ2hhbmdlTGlzdGVuZXJzKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIocHJvdmlkZXIub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0YmluZFByb3ZpZGVyQ2hhbmdlTGlzdGVuZXJzKCk7XG5cdFx0XHRmb3IgKGNvbnN0IHdhdGNoZXIgb2YgdGhpcy5fd2F0Y2hlcnMudmFsdWVzKCkpIHtcblx0XHRcdFx0d2F0Y2hlci5oYW5kbGVSZWdpc3RyeUNoYW5nZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0aGlzLl93YXRjaGVycy52YWx1ZXMoKSk7XG5cdFx0dGhpcy5fd2F0Y2hlcnMuY2xlYXIoKTtcblxuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBNb2RlbFNlbWFudGljQ29sb3JpbmcgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwdWJsaWMgc3RhdGljIFJFUVVFU1RfTUlOX0RFTEFZID0gMzAwO1xuXHRwdWJsaWMgc3RhdGljIFJFUVVFU1RfTUFYX0RFTEFZID0gMjAwMDtcblxuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkOiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbDogSVRleHRNb2RlbDtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXI6IExhbmd1YWdlRmVhdHVyZVJlZ2lzdHJ5PERvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlcj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RlYm91bmNlSW5mb3JtYXRpb246IElGZWF0dXJlRGVib3VuY2VJbmZvcm1hdGlvbjtcblx0cHJpdmF0ZSByZWFkb25seSBfZmV0Y2hEb2N1bWVudFNlbWFudGljVG9rZW5zOiBSdW5PbmNlU2NoZWR1bGVyO1xuXHRwcml2YXRlIF9jdXJyZW50RG9jdW1lbnRSZXNwb25zZTogU2VtYW50aWNUb2tlbnNSZXNwb25zZSB8IG51bGw7XG5cdHByaXZhdGUgX2N1cnJlbnREb2N1bWVudFJlcXVlc3RDYW5jZWxsYXRpb25Ub2tlblNvdXJjZTogQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfCBudWxsO1xuXHRwcml2YXRlIF9yZWxldmFudFByb3ZpZGVycyA9IG5ldyBTZXQ8RG9jdW1lbnRTZW1hbnRpY1Rva2Vuc1Byb3ZpZGVyPigpO1xuXHRwcml2YXRlIF9wcm92aWRlcnNDaGFuZ2VkRHVyaW5nUmVxdWVzdDogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRtb2RlbDogSVRleHRNb2RlbCxcblx0XHRASVNlbWFudGljVG9rZW5zU3R5bGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfc2VtYW50aWNUb2tlbnNTdHlsaW5nU2VydmljZTogSVNlbWFudGljVG9rZW5zU3R5bGluZ1NlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZTogSUxhbmd1YWdlRmVhdHVyZURlYm91bmNlU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cdFx0dGhpcy5fbW9kZWwgPSBtb2RlbDtcblx0XHR0aGlzLl9wcm92aWRlciA9IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlcjtcblx0XHR0aGlzLl9kZWJvdW5jZUluZm9ybWF0aW9uID0gbGFuZ3VhZ2VGZWF0dXJlRGVib3VuY2VTZXJ2aWNlLmZvcih0aGlzLl9wcm92aWRlciwgJ0RvY3VtZW50U2VtYW50aWNUb2tlbnMnLCB7IG1pbjogTW9kZWxTZW1hbnRpY0NvbG9yaW5nLlJFUVVFU1RfTUlOX0RFTEFZLCBtYXg6IE1vZGVsU2VtYW50aWNDb2xvcmluZy5SRVFVRVNUX01BWF9ERUxBWSB9KTtcblx0XHR0aGlzLl9mZXRjaERvY3VtZW50U2VtYW50aWNUb2tlbnMgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB0aGlzLl9mZXRjaERvY3VtZW50U2VtYW50aWNUb2tlbnNOb3coKSwgTW9kZWxTZW1hbnRpY0NvbG9yaW5nLlJFUVVFU1RfTUlOX0RFTEFZKSk7XG5cdFx0dGhpcy5fY3VycmVudERvY3VtZW50UmVzcG9uc2UgPSBudWxsO1xuXHRcdHRoaXMuX2N1cnJlbnREb2N1bWVudFJlcXVlc3RDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG51bGw7XG5cdFx0dGhpcy5fcHJvdmlkZXJzQ2hhbmdlZER1cmluZ1JlcXVlc3QgPSBmYWxzZTtcblx0XHR0aGlzLl91cGRhdGVSZWxldmFudFByb3ZpZGVycygpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbW9kZWwub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IHtcblx0XHRcdGlmICghdGhpcy5fZmV0Y2hEb2N1bWVudFNlbWFudGljVG9rZW5zLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0dGhpcy5fZmV0Y2hEb2N1bWVudFNlbWFudGljVG9rZW5zLnNjaGVkdWxlKHRoaXMuX2RlYm91bmNlSW5mb3JtYXRpb24uZ2V0KHRoaXMuX21vZGVsKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX21vZGVsLm9uRGlkQ2hhbmdlQXR0YWNoZWQoKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9mZXRjaERvY3VtZW50U2VtYW50aWNUb2tlbnMuaXNTY2hlZHVsZWQoKSkge1xuXHRcdFx0XHR0aGlzLl9mZXRjaERvY3VtZW50U2VtYW50aWNUb2tlbnMuc2NoZWR1bGUodGhpcy5fZGVib3VuY2VJbmZvcm1hdGlvbi5nZXQodGhpcy5fbW9kZWwpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbW9kZWwub25EaWRDaGFuZ2VMYW5ndWFnZSgoKSA9PiB7XG5cdFx0XHQvLyBjbGVhciBhbnkgb3V0c3RhbmRpbmcgc3RhdGVcblx0XHRcdGlmICh0aGlzLl9jdXJyZW50RG9jdW1lbnRSZXNwb25zZSkge1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50RG9jdW1lbnRSZXNwb25zZS5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnREb2N1bWVudFJlc3BvbnNlID0gbnVsbDtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9jdXJyZW50RG9jdW1lbnRSZXF1ZXN0Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UpIHtcblx0XHRcdFx0dGhpcy5fY3VycmVudERvY3VtZW50UmVxdWVzdENhbmNlbGxhdGlvblRva2VuU291cmNlLmNhbmNlbCgpO1xuXHRcdFx0XHR0aGlzLl9jdXJyZW50RG9jdW1lbnRSZXF1ZXN0Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBudWxsO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc2V0RG9jdW1lbnRTZW1hbnRpY1Rva2VucyhudWxsLCBudWxsLCBudWxsLCBbXSk7XG5cdFx0XHR0aGlzLl91cGRhdGVSZWxldmFudFByb3ZpZGVycygpO1xuXHRcdFx0dGhpcy5fZmV0Y2hEb2N1bWVudFNlbWFudGljVG9rZW5zLnNjaGVkdWxlKDApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoZW1lU2VydmljZS5vbkRpZENvbG9yVGhlbWVDaGFuZ2UoXyA9PiB7XG5cdFx0XHQvLyBjbGVhciBvdXQgZXhpc3RpbmcgdG9rZW5zXG5cdFx0XHR0aGlzLl9zZXREb2N1bWVudFNlbWFudGljVG9rZW5zKG51bGwsIG51bGwsIG51bGwsIFtdKTtcblx0XHRcdHRoaXMuX2ZldGNoRG9jdW1lbnRTZW1hbnRpY1Rva2Vucy5zY2hlZHVsZSh0aGlzLl9kZWJvdW5jZUluZm9ybWF0aW9uLmdldCh0aGlzLl9tb2RlbCkpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2ZldGNoRG9jdW1lbnRTZW1hbnRpY1Rva2Vucy5zY2hlZHVsZSgwKTtcblx0fVxuXG5cdHB1YmxpYyBoYW5kbGVSZWdpc3RyeUNoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLl91cGRhdGVSZWxldmFudFByb3ZpZGVycygpO1xuXHRcdHRoaXMuX2ZldGNoRG9jdW1lbnRTZW1hbnRpY1Rva2Vucy5zY2hlZHVsZSh0aGlzLl9kZWJvdW5jZUluZm9ybWF0aW9uLmdldCh0aGlzLl9tb2RlbCkpO1xuXHR9XG5cblx0cHVibGljIGhhbmRsZVByb3ZpZGVyRGlkQ2hhbmdlKHByb3ZpZGVyOiBEb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3JlbGV2YW50UHJvdmlkZXJzLmhhcyhwcm92aWRlcikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnREb2N1bWVudFJlcXVlc3RDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSkge1xuXHRcdFx0Ly8gdGhlcmUgaXMgYWxyZWFkeSBhIHJlcXVlc3QgcnVubmluZyxcblx0XHRcdHRoaXMuX3Byb3ZpZGVyc0NoYW5nZWREdXJpbmdSZXF1ZXN0ID0gdHJ1ZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZmV0Y2hEb2N1bWVudFNlbWFudGljVG9rZW5zLnNjaGVkdWxlKDApO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlUmVsZXZhbnRQcm92aWRlcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVsZXZhbnRQcm92aWRlcnMgPSBuZXcgU2V0KHRoaXMuX3Byb3ZpZGVyLmFsbCh0aGlzLl9tb2RlbCkpO1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnREb2N1bWVudFJlc3BvbnNlKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50RG9jdW1lbnRSZXNwb25zZS5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLl9jdXJyZW50RG9jdW1lbnRSZXNwb25zZSA9IG51bGw7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jdXJyZW50RG9jdW1lbnRSZXF1ZXN0Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnREb2N1bWVudFJlcXVlc3RDYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5jYW5jZWwoKTtcblx0XHRcdHRoaXMuX2N1cnJlbnREb2N1bWVudFJlcXVlc3RDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG51bGw7XG5cdFx0fVxuXHRcdHRoaXMuX3NldERvY3VtZW50U2VtYW50aWNUb2tlbnMobnVsbCwgbnVsbCwgbnVsbCwgW10pO1xuXHRcdHRoaXMuX2lzRGlzcG9zZWQgPSB0cnVlO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmV0Y2hEb2N1bWVudFNlbWFudGljVG9rZW5zTm93KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jdXJyZW50RG9jdW1lbnRSZXF1ZXN0Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UpIHtcblx0XHRcdC8vIHRoZXJlIGlzIGFscmVhZHkgYSByZXF1ZXN0IHJ1bm5pbmcsIGxldCBpdCBmaW5pc2guLi5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIWhhc0RvY3VtZW50U2VtYW50aWNUb2tlbnNQcm92aWRlcih0aGlzLl9wcm92aWRlciwgdGhpcy5fbW9kZWwpKSB7XG5cdFx0XHQvLyB0aGVyZSBpcyBubyBwcm92aWRlclxuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnREb2N1bWVudFJlc3BvbnNlKSB7XG5cdFx0XHRcdC8vIHRoZXJlIGFyZSBzZW1hbnRpYyB0b2tlbnMgc2V0XG5cdFx0XHRcdHRoaXMuX21vZGVsLnRva2VuaXphdGlvbi5zZXRTZW1hbnRpY1Rva2VucyhudWxsLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLl9tb2RlbC5pc0F0dGFjaGVkVG9FZGl0b3IoKSkge1xuXHRcdFx0Ly8gdGhpcyBkb2N1bWVudCBpcyBub3QgdmlzaWJsZSwgdGhlcmUgaXMgbm8gbmVlZCB0byBmZXRjaCBzZW1hbnRpYyB0b2tlbnMgZm9yIGl0XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjb25zdCBsYXN0UHJvdmlkZXIgPSB0aGlzLl9jdXJyZW50RG9jdW1lbnRSZXNwb25zZSA/IHRoaXMuX2N1cnJlbnREb2N1bWVudFJlc3BvbnNlLnByb3ZpZGVyIDogbnVsbDtcblx0XHRjb25zdCBsYXN0UmVzdWx0SWQgPSB0aGlzLl9jdXJyZW50RG9jdW1lbnRSZXNwb25zZSA/IHRoaXMuX2N1cnJlbnREb2N1bWVudFJlc3BvbnNlLnJlc3VsdElkIHx8IG51bGwgOiBudWxsO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBnZXREb2N1bWVudFNlbWFudGljVG9rZW5zKHRoaXMuX3Byb3ZpZGVyLCB0aGlzLl9tb2RlbCwgbGFzdFByb3ZpZGVyLCBsYXN0UmVzdWx0SWQsIGNhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuKTtcblx0XHR0aGlzLl9jdXJyZW50RG9jdW1lbnRSZXF1ZXN0Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBjYW5jZWxsYXRpb25Ub2tlblNvdXJjZTtcblx0XHR0aGlzLl9wcm92aWRlcnNDaGFuZ2VkRHVyaW5nUmVxdWVzdCA9IGZhbHNlO1xuXG5cdFx0Y29uc3QgcGVuZGluZ0NoYW5nZXM6IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnRbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbnRlbnRDaGFuZ2VMaXN0ZW5lciA9IHRoaXMuX21vZGVsLm9uRGlkQ2hhbmdlQ29udGVudCgoZSkgPT4ge1xuXHRcdFx0cGVuZGluZ0NoYW5nZXMucHVzaChlKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHN3ID0gbmV3IFN0b3BXYXRjaChmYWxzZSk7XG5cdFx0cmVxdWVzdC50aGVuKChyZXMpID0+IHtcblx0XHRcdHRoaXMuX2RlYm91bmNlSW5mb3JtYXRpb24udXBkYXRlKHRoaXMuX21vZGVsLCBzdy5lbGFwc2VkKCkpO1xuXHRcdFx0dGhpcy5fY3VycmVudERvY3VtZW50UmVxdWVzdENhbmNlbGxhdGlvblRva2VuU291cmNlID0gbnVsbDtcblx0XHRcdGNvbnRlbnRDaGFuZ2VMaXN0ZW5lci5kaXNwb3NlKCk7XG5cblx0XHRcdGlmICghcmVzKSB7XG5cdFx0XHRcdHRoaXMuX3NldERvY3VtZW50U2VtYW50aWNUb2tlbnMobnVsbCwgbnVsbCwgbnVsbCwgcGVuZGluZ0NoYW5nZXMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgeyBwcm92aWRlciwgdG9rZW5zIH0gPSByZXM7XG5cdFx0XHRcdGNvbnN0IHN0eWxpbmcgPSB0aGlzLl9zZW1hbnRpY1Rva2Vuc1N0eWxpbmdTZXJ2aWNlLmdldFN0eWxpbmcocHJvdmlkZXIpO1xuXHRcdFx0XHR0aGlzLl9zZXREb2N1bWVudFNlbWFudGljVG9rZW5zKHByb3ZpZGVyLCB0b2tlbnMgfHwgbnVsbCwgc3R5bGluZywgcGVuZGluZ0NoYW5nZXMpO1xuXHRcdFx0fVxuXHRcdH0sIChlcnIpID0+IHtcblx0XHRcdGNvbnN0IGlzRXhwZWN0ZWRFcnJvciA9IGVyciAmJiAoZXJyb3JzLmlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyKSB8fCAodHlwZW9mIGVyci5tZXNzYWdlID09PSAnc3RyaW5nJyAmJiBlcnIubWVzc2FnZS5pbmRleE9mKCdidXN5JykgIT09IC0xKSk7XG5cdFx0XHRpZiAoIWlzRXhwZWN0ZWRFcnJvcikge1xuXHRcdFx0XHRlcnJvcnMub25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2VtYW50aWMgdG9rZW5zIGVhdHMgdXAgYWxsIGVycm9ycyBhbmQgY29uc2lkZXJzIGVycm9ycyB0byBtZWFuIHRoYXQgdGhlIHJlc3VsdCBpcyB0ZW1wb3JhcmlseSBub3QgYXZhaWxhYmxlXG5cdFx0XHQvLyBUaGUgQVBJIGRvZXMgbm90IGhhdmUgYSBzcGVjaWFsIGVycm9yIGtpbmQgdG8gZXhwcmVzcyB0aGlzLi4uXG5cdFx0XHR0aGlzLl9jdXJyZW50RG9jdW1lbnRSZXF1ZXN0Q2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgPSBudWxsO1xuXHRcdFx0Y29udGVudENoYW5nZUxpc3RlbmVyLmRpc3Bvc2UoKTtcblxuXHRcdFx0aWYgKHBlbmRpbmdDaGFuZ2VzLmxlbmd0aCA+IDAgfHwgdGhpcy5fcHJvdmlkZXJzQ2hhbmdlZER1cmluZ1JlcXVlc3QpIHtcblx0XHRcdFx0Ly8gTW9yZSBjaGFuZ2VzIG9jY3VycmVkIHdoaWxlIHRoZSByZXF1ZXN0IHdhcyBydW5uaW5nXG5cdFx0XHRcdGlmICghdGhpcy5fZmV0Y2hEb2N1bWVudFNlbWFudGljVG9rZW5zLmlzU2NoZWR1bGVkKCkpIHtcblx0XHRcdFx0XHR0aGlzLl9mZXRjaERvY3VtZW50U2VtYW50aWNUb2tlbnMuc2NoZWR1bGUodGhpcy5fZGVib3VuY2VJbmZvcm1hdGlvbi5nZXQodGhpcy5fbW9kZWwpKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX2NvcHkoc3JjOiBVaW50MzJBcnJheSwgc3JjT2Zmc2V0OiBudW1iZXIsIGRlc3Q6IFVpbnQzMkFycmF5LCBkZXN0T2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Ly8gcHJvdGVjdCBhZ2FpbnN0IG92ZXJmbG93c1xuXHRcdGxlbmd0aCA9IE1hdGgubWluKGxlbmd0aCwgZGVzdC5sZW5ndGggLSBkZXN0T2Zmc2V0LCBzcmMubGVuZ3RoIC0gc3JjT2Zmc2V0KTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG5cdFx0XHRkZXN0W2Rlc3RPZmZzZXQgKyBpXSA9IHNyY1tzcmNPZmZzZXQgKyBpXTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zZXREb2N1bWVudFNlbWFudGljVG9rZW5zKHByb3ZpZGVyOiBEb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIgfCBudWxsLCB0b2tlbnM6IFNlbWFudGljVG9rZW5zIHwgU2VtYW50aWNUb2tlbnNFZGl0cyB8IG51bGwsIHN0eWxpbmc6IFNlbWFudGljVG9rZW5zUHJvdmlkZXJTdHlsaW5nIHwgbnVsbCwgcGVuZGluZ0NoYW5nZXM6IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnRbXSk6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnRSZXNwb25zZSA9IHRoaXMuX2N1cnJlbnREb2N1bWVudFJlc3BvbnNlO1xuXHRcdGNvbnN0IHJlc2NoZWR1bGVJZk5lZWRlZCA9ICgpID0+IHtcblx0XHRcdGlmICgocGVuZGluZ0NoYW5nZXMubGVuZ3RoID4gMCB8fCB0aGlzLl9wcm92aWRlcnNDaGFuZ2VkRHVyaW5nUmVxdWVzdCkgJiYgIXRoaXMuX2ZldGNoRG9jdW1lbnRTZW1hbnRpY1Rva2Vucy5pc1NjaGVkdWxlZCgpKSB7XG5cdFx0XHRcdHRoaXMuX2ZldGNoRG9jdW1lbnRTZW1hbnRpY1Rva2Vucy5zY2hlZHVsZSh0aGlzLl9kZWJvdW5jZUluZm9ybWF0aW9uLmdldCh0aGlzLl9tb2RlbCkpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAodGhpcy5fY3VycmVudERvY3VtZW50UmVzcG9uc2UpIHtcblx0XHRcdHRoaXMuX2N1cnJlbnREb2N1bWVudFJlc3BvbnNlLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX2N1cnJlbnREb2N1bWVudFJlc3BvbnNlID0gbnVsbDtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX2lzRGlzcG9zZWQpIHtcblx0XHRcdC8vIGRpc3Bvc2VkIVxuXHRcdFx0aWYgKHByb3ZpZGVyICYmIHRva2Vucykge1xuXHRcdFx0XHRwcm92aWRlci5yZWxlYXNlRG9jdW1lbnRTZW1hbnRpY1Rva2Vucyh0b2tlbnMucmVzdWx0SWQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXByb3ZpZGVyIHx8ICFzdHlsaW5nKSB7XG5cdFx0XHR0aGlzLl9tb2RlbC50b2tlbml6YXRpb24uc2V0U2VtYW50aWNUb2tlbnMobnVsbCwgZmFsc2UpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIXRva2Vucykge1xuXHRcdFx0dGhpcy5fbW9kZWwudG9rZW5pemF0aW9uLnNldFNlbWFudGljVG9rZW5zKG51bGwsIHRydWUpO1xuXHRcdFx0cmVzY2hlZHVsZUlmTmVlZGVkKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGlzU2VtYW50aWNUb2tlbnNFZGl0cyh0b2tlbnMpKSB7XG5cdFx0XHRpZiAoIWN1cnJlbnRSZXNwb25zZSkge1xuXHRcdFx0XHQvLyBub3QgcG9zc2libGUhXG5cdFx0XHRcdHRoaXMuX21vZGVsLnRva2VuaXphdGlvbi5zZXRTZW1hbnRpY1Rva2VucyhudWxsLCB0cnVlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHRva2Vucy5lZGl0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0Ly8gbm90aGluZyB0byBkbyFcblx0XHRcdFx0dG9rZW5zID0ge1xuXHRcdFx0XHRcdHJlc3VsdElkOiB0b2tlbnMucmVzdWx0SWQsXG5cdFx0XHRcdFx0ZGF0YTogY3VycmVudFJlc3BvbnNlLmRhdGFcblx0XHRcdFx0fTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGxldCBkZWx0YUxlbmd0aCA9IDA7XG5cdFx0XHRcdGZvciAoY29uc3QgZWRpdCBvZiB0b2tlbnMuZWRpdHMpIHtcblx0XHRcdFx0XHRkZWx0YUxlbmd0aCArPSAoZWRpdC5kYXRhID8gZWRpdC5kYXRhLmxlbmd0aCA6IDApIC0gZWRpdC5kZWxldGVDb3VudDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHNyY0RhdGEgPSBjdXJyZW50UmVzcG9uc2UuZGF0YTtcblx0XHRcdFx0Y29uc3QgZGVzdERhdGEgPSBuZXcgVWludDMyQXJyYXkoc3JjRGF0YS5sZW5ndGggKyBkZWx0YUxlbmd0aCk7XG5cblx0XHRcdFx0bGV0IHNyY0xhc3RTdGFydCA9IHNyY0RhdGEubGVuZ3RoO1xuXHRcdFx0XHRsZXQgZGVzdExhc3RTdGFydCA9IGRlc3REYXRhLmxlbmd0aDtcblx0XHRcdFx0Zm9yIChsZXQgaSA9IHRva2Vucy5lZGl0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0XHRcdGNvbnN0IGVkaXQgPSB0b2tlbnMuZWRpdHNbaV07XG5cblx0XHRcdFx0XHRpZiAoZWRpdC5zdGFydCA+IHNyY0RhdGEubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRzdHlsaW5nLndhcm5JbnZhbGlkRWRpdFN0YXJ0KGN1cnJlbnRSZXNwb25zZS5yZXN1bHRJZCwgdG9rZW5zLnJlc3VsdElkLCBpLCBlZGl0LnN0YXJ0LCBzcmNEYXRhLmxlbmd0aCk7XG5cdFx0XHRcdFx0XHQvLyBUaGUgZWRpdHMgYXJlIGludmFsaWQgYW5kIHRoZXJlJ3Mgbm8gd2F5IHRvIHJlY292ZXJcblx0XHRcdFx0XHRcdHRoaXMuX21vZGVsLnRva2VuaXphdGlvbi5zZXRTZW1hbnRpY1Rva2VucyhudWxsLCB0cnVlKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBjb3B5Q291bnQgPSBzcmNMYXN0U3RhcnQgLSAoZWRpdC5zdGFydCArIGVkaXQuZGVsZXRlQ291bnQpO1xuXHRcdFx0XHRcdGlmIChjb3B5Q291bnQgPiAwKSB7XG5cdFx0XHRcdFx0XHRNb2RlbFNlbWFudGljQ29sb3JpbmcuX2NvcHkoc3JjRGF0YSwgc3JjTGFzdFN0YXJ0IC0gY29weUNvdW50LCBkZXN0RGF0YSwgZGVzdExhc3RTdGFydCAtIGNvcHlDb3VudCwgY29weUNvdW50KTtcblx0XHRcdFx0XHRcdGRlc3RMYXN0U3RhcnQgLT0gY29weUNvdW50O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGlmIChlZGl0LmRhdGEpIHtcblx0XHRcdFx0XHRcdE1vZGVsU2VtYW50aWNDb2xvcmluZy5fY29weShlZGl0LmRhdGEsIDAsIGRlc3REYXRhLCBkZXN0TGFzdFN0YXJ0IC0gZWRpdC5kYXRhLmxlbmd0aCwgZWRpdC5kYXRhLmxlbmd0aCk7XG5cdFx0XHRcdFx0XHRkZXN0TGFzdFN0YXJ0IC09IGVkaXQuZGF0YS5sZW5ndGg7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0c3JjTGFzdFN0YXJ0ID0gZWRpdC5zdGFydDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChzcmNMYXN0U3RhcnQgPiAwKSB7XG5cdFx0XHRcdFx0TW9kZWxTZW1hbnRpY0NvbG9yaW5nLl9jb3B5KHNyY0RhdGEsIDAsIGRlc3REYXRhLCAwLCBzcmNMYXN0U3RhcnQpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dG9rZW5zID0ge1xuXHRcdFx0XHRcdHJlc3VsdElkOiB0b2tlbnMucmVzdWx0SWQsXG5cdFx0XHRcdFx0ZGF0YTogZGVzdERhdGFcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaXNTZW1hbnRpY1Rva2Vucyh0b2tlbnMpKSB7XG5cblx0XHRcdHRoaXMuX2N1cnJlbnREb2N1bWVudFJlc3BvbnNlID0gbmV3IFNlbWFudGljVG9rZW5zUmVzcG9uc2UocHJvdmlkZXIsIHRva2Vucy5yZXN1bHRJZCwgdG9rZW5zLmRhdGEpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSB0b011bHRpbGluZVRva2VuczIodG9rZW5zLCBzdHlsaW5nLCB0aGlzLl9tb2RlbC5nZXRMYW5ndWFnZUlkKCkpO1xuXG5cdFx0XHQvLyBBZGp1c3QgaW5jb21pbmcgc2VtYW50aWMgdG9rZW5zXG5cdFx0XHRpZiAocGVuZGluZ0NoYW5nZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHQvLyBNb3JlIGNoYW5nZXMgb2NjdXJyZWQgd2hpbGUgdGhlIHJlcXVlc3Qgd2FzIHJ1bm5pbmdcblx0XHRcdFx0Ly8gV2UgbmVlZCB0bzpcblx0XHRcdFx0Ly8gMS4gQWRqdXN0IGluY29taW5nIHNlbWFudGljIHRva2Vuc1xuXHRcdFx0XHQvLyAyLiBSZXF1ZXN0IHRoZW0gYWdhaW5cblx0XHRcdFx0Zm9yIChjb25zdCBjaGFuZ2Ugb2YgcGVuZGluZ0NoYW5nZXMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGFyZWEgb2YgcmVzdWx0KSB7XG5cdFx0XHRcdFx0XHRmb3IgKGNvbnN0IHNpbmdsZUNoYW5nZSBvZiBjaGFuZ2UuY2hhbmdlcykge1xuXHRcdFx0XHRcdFx0XHRhcmVhLmFwcGx5RWRpdChzaW5nbGVDaGFuZ2UucmFuZ2UsIHNpbmdsZUNoYW5nZS50ZXh0KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbW9kZWwudG9rZW5pemF0aW9uLnNldFNlbWFudGljVG9rZW5zKHJlc3VsdCwgdHJ1ZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX21vZGVsLnRva2VuaXphdGlvbi5zZXRTZW1hbnRpY1Rva2VucyhudWxsLCB0cnVlKTtcblx0XHR9XG5cblx0XHRyZXNjaGVkdWxlSWZOZWVkZWQoKTtcblx0fVxufVxuXG5jbGFzcyBTZW1hbnRpY1Rva2Vuc1Jlc3BvbnNlIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHVibGljIHJlYWRvbmx5IHByb3ZpZGVyOiBEb2N1bWVudFNlbWFudGljVG9rZW5zUHJvdmlkZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHJlc3VsdElkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0cHVibGljIHJlYWRvbmx5IGRhdGE6IFVpbnQzMkFycmF5XG5cdCkgeyB9XG5cblx0cHVibGljIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5wcm92aWRlci5yZWxlYXNlRG9jdW1lbnRTZW1hbnRpY1Rva2Vucyh0aGlzLnJlc3VsdElkKTtcblx0fVxufVxuXG5yZWdpc3RlckVkaXRvckZlYXR1cmUoRG9jdW1lbnRTZW1hbnRpY1Rva2Vuc0ZlYXR1cmUpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLCtCQUErQjtBQUN4QyxZQUFZLFlBQVk7QUFDeEIsU0FB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
