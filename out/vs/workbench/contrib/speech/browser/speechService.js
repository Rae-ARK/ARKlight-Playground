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
import { localize } from "../../../../nls.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IHostService } from "../../../services/host/browser/host.js";
import { DeferredPromise } from "../../../../base/common/async.js";
import { HasSpeechProvider, SpeechToTextInProgress, KeywordRecognitionStatus, SpeechToTextStatus, speechLanguageConfigToLanguage, SPEECH_LANGUAGE_CONFIG, TextToSpeechInProgress, TextToSpeechStatus } from "../common/speechService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ExtensionsRegistry } from "../../../services/extensions/common/extensionsRegistry.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
const speechProvidersExtensionPoint = ExtensionsRegistry.registerExtensionPoint({
  extensionPoint: "speechProviders",
  jsonSchema: {
    description: localize("vscode.extension.contributes.speechProvider", "Contributes a Speech Provider"),
    type: "array",
    items: {
      additionalProperties: false,
      type: "object",
      defaultSnippets: [{ body: { name: "", description: "" } }],
      required: ["name"],
      properties: {
        name: {
          description: localize("speechProviderName", "Unique name for this Speech Provider."),
          type: "string"
        },
        description: {
          description: localize("speechProviderDescription", "A description of this Speech Provider, shown in the UI."),
          type: "string"
        }
      }
    }
  }
});
let SpeechService = class extends Disposable {
  constructor(logService, contextKeyService, hostService, telemetryService, configurationService, extensionService) {
    super();
    this.logService = logService;
    this.hostService = hostService;
    this.telemetryService = telemetryService;
    this.configurationService = configurationService;
    this.extensionService = extensionService;
    this._onDidChangeHasSpeechProvider = this._register(new Emitter());
    this.onDidChangeHasSpeechProvider = this._onDidChangeHasSpeechProvider.event;
    this.providers = /* @__PURE__ */ new Map();
    this.providerDescriptors = /* @__PURE__ */ new Map();
    //#region Speech to Text
    this._onDidStartSpeechToTextSession = this._register(new Emitter());
    this.onDidStartSpeechToTextSession = this._onDidStartSpeechToTextSession.event;
    this._onDidEndSpeechToTextSession = this._register(new Emitter());
    this.onDidEndSpeechToTextSession = this._onDidEndSpeechToTextSession.event;
    this.activeSpeechToTextSessions = 0;
    //#endregion
    //#region Text to Speech
    this._onDidStartTextToSpeechSession = this._register(new Emitter());
    this.onDidStartTextToSpeechSession = this._onDidStartTextToSpeechSession.event;
    this._onDidEndTextToSpeechSession = this._register(new Emitter());
    this.onDidEndTextToSpeechSession = this._onDidEndTextToSpeechSession.event;
    this.activeTextToSpeechSessions = 0;
    //#endregion
    //#region Keyword Recognition
    this._onDidStartKeywordRecognition = this._register(new Emitter());
    this.onDidStartKeywordRecognition = this._onDidStartKeywordRecognition.event;
    this._onDidEndKeywordRecognition = this._register(new Emitter());
    this.onDidEndKeywordRecognition = this._onDidEndKeywordRecognition.event;
    this.activeKeywordRecognitionSessions = 0;
    this.hasSpeechProviderContext = HasSpeechProvider.bindTo(contextKeyService);
    this.textToSpeechInProgress = TextToSpeechInProgress.bindTo(contextKeyService);
    this.speechToTextInProgress = SpeechToTextInProgress.bindTo(contextKeyService);
    this.handleAndRegisterSpeechExtensions();
  }
  get hasSpeechProvider() {
    return this.providerDescriptors.size > 0 || this.providers.size > 0;
  }
  handleAndRegisterSpeechExtensions() {
    speechProvidersExtensionPoint.setHandler((extensions, delta) => {
      const oldHasSpeechProvider = this.hasSpeechProvider;
      for (const extension of delta.removed) {
        for (const descriptor of extension.value) {
          this.providerDescriptors.delete(descriptor.name);
        }
      }
      for (const extension of delta.added) {
        for (const descriptor of extension.value) {
          this.providerDescriptors.set(descriptor.name, descriptor);
        }
      }
      if (oldHasSpeechProvider !== this.hasSpeechProvider) {
        this.handleHasSpeechProviderChange();
      }
    });
  }
  registerSpeechProvider(identifier, provider) {
    if (this.providers.has(identifier)) {
      throw new Error(`Speech provider with identifier ${identifier} is already registered.`);
    }
    const oldHasSpeechProvider = this.hasSpeechProvider;
    this.providers.set(identifier, provider);
    if (oldHasSpeechProvider !== this.hasSpeechProvider) {
      this.handleHasSpeechProviderChange();
    }
    return toDisposable(() => {
      const oldHasSpeechProvider2 = this.hasSpeechProvider;
      this.providers.delete(identifier);
      if (oldHasSpeechProvider2 !== this.hasSpeechProvider) {
        this.handleHasSpeechProviderChange();
      }
    });
  }
  handleHasSpeechProviderChange() {
    this.hasSpeechProviderContext.set(this.hasSpeechProvider);
    this._onDidChangeHasSpeechProvider.fire();
  }
  get hasActiveSpeechToTextSession() {
    return this.activeSpeechToTextSessions > 0;
  }
  async createSpeechToTextSession(token, context = "speech") {
    const provider = await this.getProvider();
    const language = speechLanguageConfigToLanguage(this.configurationService.getValue(SPEECH_LANGUAGE_CONFIG));
    const session = provider.createSpeechToTextSession(token, typeof language === "string" ? { language } : void 0);
    const sessionStart = Date.now();
    let sessionRecognized = false;
    let sessionError = false;
    let sessionContentLength = 0;
    const disposables = new DisposableStore();
    const onSessionStoppedOrCanceled = () => {
      this.activeSpeechToTextSessions = Math.max(0, this.activeSpeechToTextSessions - 1);
      if (!this.hasActiveSpeechToTextSession) {
        this.speechToTextInProgress.reset();
      }
      this._onDidEndSpeechToTextSession.fire();
      this.telemetryService.publicLog2("speechToTextSession", {
        context,
        sessionDuration: Date.now() - sessionStart,
        sessionRecognized,
        sessionError,
        sessionContentLength,
        sessionLanguage: language
      });
      disposables.dispose();
    };
    disposables.add(token.onCancellationRequested(() => onSessionStoppedOrCanceled()));
    if (token.isCancellationRequested) {
      onSessionStoppedOrCanceled();
    }
    disposables.add(session.onDidChange((e) => {
      switch (e.status) {
        case SpeechToTextStatus.Started:
          this.activeSpeechToTextSessions++;
          this.speechToTextInProgress.set(true);
          this._onDidStartSpeechToTextSession.fire();
          break;
        case SpeechToTextStatus.Recognizing:
          sessionRecognized = true;
          break;
        case SpeechToTextStatus.Recognized:
          if (typeof e.text === "string") {
            sessionContentLength += e.text.length;
          }
          break;
        case SpeechToTextStatus.Stopped:
          onSessionStoppedOrCanceled();
          break;
        case SpeechToTextStatus.Error:
          this.logService.error(`Speech provider error in speech to text session: ${e.text}`);
          sessionError = true;
          break;
      }
    }));
    return session;
  }
  async getProvider() {
    await this.extensionService.activateByEvent("onSpeech");
    const provider = Array.from(this.providers.values()).at(0);
    if (!provider) {
      throw new Error(`No Speech provider is registered.`);
    } else if (this.providers.size > 1) {
      this.logService.warn(`Multiple speech providers registered. Picking first one: ${provider.metadata.displayName}`);
    }
    return provider;
  }
  get hasActiveTextToSpeechSession() {
    return this.activeTextToSpeechSessions > 0;
  }
  async createTextToSpeechSession(token, context = "speech") {
    const provider = await this.getProvider();
    const language = speechLanguageConfigToLanguage(this.configurationService.getValue(SPEECH_LANGUAGE_CONFIG));
    const session = provider.createTextToSpeechSession(token, typeof language === "string" ? { language } : void 0);
    const sessionStart = Date.now();
    let sessionError = false;
    const disposables = new DisposableStore();
    const onSessionStoppedOrCanceled = (dispose) => {
      this.activeTextToSpeechSessions = Math.max(0, this.activeTextToSpeechSessions - 1);
      if (!this.hasActiveTextToSpeechSession) {
        this.textToSpeechInProgress.reset();
      }
      this._onDidEndTextToSpeechSession.fire();
      this.telemetryService.publicLog2("textToSpeechSession", {
        context,
        sessionDuration: Date.now() - sessionStart,
        sessionError,
        sessionLanguage: language
      });
      if (dispose) {
        disposables.dispose();
      }
    };
    disposables.add(token.onCancellationRequested(() => onSessionStoppedOrCanceled(true)));
    if (token.isCancellationRequested) {
      onSessionStoppedOrCanceled(true);
    }
    disposables.add(session.onDidChange((e) => {
      switch (e.status) {
        case TextToSpeechStatus.Started:
          this.activeTextToSpeechSessions++;
          this.textToSpeechInProgress.set(true);
          this._onDidStartTextToSpeechSession.fire();
          break;
        case TextToSpeechStatus.Stopped:
          onSessionStoppedOrCanceled(false);
          break;
        case TextToSpeechStatus.Error:
          this.logService.error(`Speech provider error in text to speech session: ${e.text}`);
          sessionError = true;
          break;
      }
    }));
    return session;
  }
  get hasActiveKeywordRecognition() {
    return this.activeKeywordRecognitionSessions > 0;
  }
  async recognizeKeyword(token) {
    const result = new DeferredPromise();
    const disposables = new DisposableStore();
    disposables.add(token.onCancellationRequested(() => {
      disposables.dispose();
      result.complete(KeywordRecognitionStatus.Canceled);
    }));
    const recognizeKeywordDisposables = disposables.add(new DisposableStore());
    let activeRecognizeKeywordSession = void 0;
    const recognizeKeyword = () => {
      recognizeKeywordDisposables.clear();
      const cts = new CancellationTokenSource(token);
      recognizeKeywordDisposables.add(toDisposable(() => cts.dispose(true)));
      const currentRecognizeKeywordSession = activeRecognizeKeywordSession = this.doRecognizeKeyword(cts.token).then((status2) => {
        if (currentRecognizeKeywordSession === activeRecognizeKeywordSession) {
          result.complete(status2);
        }
      }, (error) => {
        if (currentRecognizeKeywordSession === activeRecognizeKeywordSession) {
          result.error(error);
        }
      });
    };
    disposables.add(this.hostService.onDidChangeFocus((focused) => {
      if (!focused && activeRecognizeKeywordSession) {
        recognizeKeywordDisposables.clear();
        activeRecognizeKeywordSession = void 0;
      } else if (!activeRecognizeKeywordSession) {
        recognizeKeyword();
      }
    }));
    if (this.hostService.hasFocus) {
      recognizeKeyword();
    }
    let status;
    try {
      status = await result.p;
    } finally {
      disposables.dispose();
    }
    this.telemetryService.publicLog2("keywordRecognition", {
      keywordRecognized: status === KeywordRecognitionStatus.Recognized
    });
    return status;
  }
  async doRecognizeKeyword(token) {
    const provider = await this.getProvider();
    const session = provider.createKeywordRecognitionSession(token);
    this.activeKeywordRecognitionSessions++;
    this._onDidStartKeywordRecognition.fire();
    const disposables = new DisposableStore();
    const onSessionStoppedOrCanceled = () => {
      this.activeKeywordRecognitionSessions = Math.max(0, this.activeKeywordRecognitionSessions - 1);
      this._onDidEndKeywordRecognition.fire();
      disposables.dispose();
    };
    disposables.add(token.onCancellationRequested(() => onSessionStoppedOrCanceled()));
    if (token.isCancellationRequested) {
      onSessionStoppedOrCanceled();
    }
    disposables.add(session.onDidChange((e) => {
      if (e.status === KeywordRecognitionStatus.Stopped) {
        onSessionStoppedOrCanceled();
      }
    }));
    try {
      return (await Event.toPromise(session.onDidChange)).status;
    } finally {
      onSessionStoppedOrCanceled();
    }
  }
  //#endregion
};
SpeechService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, IHostService),
  __decorateParam(3, ITelemetryService),
  __decorateParam(4, IConfigurationService),
  __decorateParam(5, IExtensionService)
], SpeechService);
export {
  SpeechService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3NwZWVjaC9icm93c2VyL3NwZWVjaFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9ob3N0L2Jyb3dzZXIvaG9zdC5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBJU3BlZWNoU2VydmljZSwgSVNwZWVjaFByb3ZpZGVyLCBIYXNTcGVlY2hQcm92aWRlciwgSVNwZWVjaFRvVGV4dFNlc3Npb24sIFNwZWVjaFRvVGV4dEluUHJvZ3Jlc3MsIEtleXdvcmRSZWNvZ25pdGlvblN0YXR1cywgU3BlZWNoVG9UZXh0U3RhdHVzLCBzcGVlY2hMYW5ndWFnZUNvbmZpZ1RvTGFuZ3VhZ2UsIFNQRUVDSF9MQU5HVUFHRV9DT05GSUcsIElUZXh0VG9TcGVlY2hTZXNzaW9uLCBUZXh0VG9TcGVlY2hJblByb2dyZXNzLCBUZXh0VG9TcGVlY2hTdGF0dXMgfSBmcm9tICcuLi9jb21tb24vc3BlZWNoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNwZWVjaFByb3ZpZGVyRGVzY3JpcHRvciB7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBzdHJpbmc7XG59XG5cbmNvbnN0IHNwZWVjaFByb3ZpZGVyc0V4dGVuc2lvblBvaW50ID0gRXh0ZW5zaW9uc1JlZ2lzdHJ5LnJlZ2lzdGVyRXh0ZW5zaW9uUG9pbnQ8SVNwZWVjaFByb3ZpZGVyRGVzY3JpcHRvcltdPih7XG5cdGV4dGVuc2lvblBvaW50OiAnc3BlZWNoUHJvdmlkZXJzJyxcblx0anNvblNjaGVtYToge1xuXHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndnNjb2RlLmV4dGVuc2lvbi5jb250cmlidXRlcy5zcGVlY2hQcm92aWRlcicsICdDb250cmlidXRlcyBhIFNwZWVjaCBQcm92aWRlcicpLFxuXHRcdHR5cGU6ICdhcnJheScsXG5cdFx0aXRlbXM6IHtcblx0XHRcdGFkZGl0aW9uYWxQcm9wZXJ0aWVzOiBmYWxzZSxcblx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0ZGVmYXVsdFNuaXBwZXRzOiBbeyBib2R5OiB7IG5hbWU6ICcnLCBkZXNjcmlwdGlvbjogJycgfSB9XSxcblx0XHRcdHJlcXVpcmVkOiBbJ25hbWUnXSxcblx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0bmFtZToge1xuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc3BlZWNoUHJvdmlkZXJOYW1lJywgXCJVbmlxdWUgbmFtZSBmb3IgdGhpcyBTcGVlY2ggUHJvdmlkZXIuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB7XG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdzcGVlY2hQcm92aWRlckRlc2NyaXB0aW9uJywgXCJBIGRlc2NyaXB0aW9uIG9mIHRoaXMgU3BlZWNoIFByb3ZpZGVyLCBzaG93biBpbiB0aGUgVUkuXCIpLFxuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cbn0pO1xuXG5leHBvcnQgY2xhc3MgU3BlZWNoU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU3BlZWNoU2VydmljZSB7XG5cblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlSGFzU3BlZWNoUHJvdmlkZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VIYXNTcGVlY2hQcm92aWRlciA9IHRoaXMuX29uRGlkQ2hhbmdlSGFzU3BlZWNoUHJvdmlkZXIuZXZlbnQ7XG5cblx0Z2V0IGhhc1NwZWVjaFByb3ZpZGVyKCkgeyByZXR1cm4gdGhpcy5wcm92aWRlckRlc2NyaXB0b3JzLnNpemUgPiAwIHx8IHRoaXMucHJvdmlkZXJzLnNpemUgPiAwOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcm92aWRlcnMgPSBuZXcgTWFwPHN0cmluZywgSVNwZWVjaFByb3ZpZGVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IHByb3ZpZGVyRGVzY3JpcHRvcnMgPSBuZXcgTWFwPHN0cmluZywgSVNwZWVjaFByb3ZpZGVyRGVzY3JpcHRvcj4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGhhc1NwZWVjaFByb3ZpZGVyQ29udGV4dDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBob3N0U2VydmljZTogSUhvc3RTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmhhc1NwZWVjaFByb3ZpZGVyQ29udGV4dCA9IEhhc1NwZWVjaFByb3ZpZGVyLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy50ZXh0VG9TcGVlY2hJblByb2dyZXNzID0gVGV4dFRvU3BlZWNoSW5Qcm9ncmVzcy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc3BlZWNoVG9UZXh0SW5Qcm9ncmVzcyA9IFNwZWVjaFRvVGV4dEluUHJvZ3Jlc3MuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuaGFuZGxlQW5kUmVnaXN0ZXJTcGVlY2hFeHRlbnNpb25zKCk7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZUFuZFJlZ2lzdGVyU3BlZWNoRXh0ZW5zaW9ucygpOiB2b2lkIHtcblx0XHRzcGVlY2hQcm92aWRlcnNFeHRlbnNpb25Qb2ludC5zZXRIYW5kbGVyKChleHRlbnNpb25zLCBkZWx0YSkgPT4ge1xuXHRcdFx0Y29uc3Qgb2xkSGFzU3BlZWNoUHJvdmlkZXIgPSB0aGlzLmhhc1NwZWVjaFByb3ZpZGVyO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGV4dGVuc2lvbiBvZiBkZWx0YS5yZW1vdmVkKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgZGVzY3JpcHRvciBvZiBleHRlbnNpb24udmFsdWUpIHtcblx0XHRcdFx0XHR0aGlzLnByb3ZpZGVyRGVzY3JpcHRvcnMuZGVsZXRlKGRlc2NyaXB0b3IubmFtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Zm9yIChjb25zdCBleHRlbnNpb24gb2YgZGVsdGEuYWRkZWQpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBkZXNjcmlwdG9yIG9mIGV4dGVuc2lvbi52YWx1ZSkge1xuXHRcdFx0XHRcdHRoaXMucHJvdmlkZXJEZXNjcmlwdG9ycy5zZXQoZGVzY3JpcHRvci5uYW1lLCBkZXNjcmlwdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRpZiAob2xkSGFzU3BlZWNoUHJvdmlkZXIgIT09IHRoaXMuaGFzU3BlZWNoUHJvdmlkZXIpIHtcblx0XHRcdFx0dGhpcy5oYW5kbGVIYXNTcGVlY2hQcm92aWRlckNoYW5nZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cmVnaXN0ZXJTcGVlY2hQcm92aWRlcihpZGVudGlmaWVyOiBzdHJpbmcsIHByb3ZpZGVyOiBJU3BlZWNoUHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKHRoaXMucHJvdmlkZXJzLmhhcyhpZGVudGlmaWVyKSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBTcGVlY2ggcHJvdmlkZXIgd2l0aCBpZGVudGlmaWVyICR7aWRlbnRpZmllcn0gaXMgYWxyZWFkeSByZWdpc3RlcmVkLmApO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9sZEhhc1NwZWVjaFByb3ZpZGVyID0gdGhpcy5oYXNTcGVlY2hQcm92aWRlcjtcblxuXHRcdHRoaXMucHJvdmlkZXJzLnNldChpZGVudGlmaWVyLCBwcm92aWRlcik7XG5cblx0XHRpZiAob2xkSGFzU3BlZWNoUHJvdmlkZXIgIT09IHRoaXMuaGFzU3BlZWNoUHJvdmlkZXIpIHtcblx0XHRcdHRoaXMuaGFuZGxlSGFzU3BlZWNoUHJvdmlkZXJDaGFuZ2UoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNvbnN0IG9sZEhhc1NwZWVjaFByb3ZpZGVyID0gdGhpcy5oYXNTcGVlY2hQcm92aWRlcjtcblxuXHRcdFx0dGhpcy5wcm92aWRlcnMuZGVsZXRlKGlkZW50aWZpZXIpO1xuXG5cdFx0XHRpZiAob2xkSGFzU3BlZWNoUHJvdmlkZXIgIT09IHRoaXMuaGFzU3BlZWNoUHJvdmlkZXIpIHtcblx0XHRcdFx0dGhpcy5oYW5kbGVIYXNTcGVlY2hQcm92aWRlckNoYW5nZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVIYXNTcGVlY2hQcm92aWRlckNoYW5nZSgpOiB2b2lkIHtcblx0XHR0aGlzLmhhc1NwZWVjaFByb3ZpZGVyQ29udGV4dC5zZXQodGhpcy5oYXNTcGVlY2hQcm92aWRlcik7XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUhhc1NwZWVjaFByb3ZpZGVyLmZpcmUoKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBTcGVlY2ggdG8gVGV4dFxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3RhcnRTcGVlY2hUb1RleHRTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU3RhcnRTcGVlY2hUb1RleHRTZXNzaW9uID0gdGhpcy5fb25EaWRTdGFydFNwZWVjaFRvVGV4dFNlc3Npb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFbmRTcGVlY2hUb1RleHRTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRW5kU3BlZWNoVG9UZXh0U2Vzc2lvbiA9IHRoaXMuX29uRGlkRW5kU3BlZWNoVG9UZXh0U2Vzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIGFjdGl2ZVNwZWVjaFRvVGV4dFNlc3Npb25zID0gMDtcblx0Z2V0IGhhc0FjdGl2ZVNwZWVjaFRvVGV4dFNlc3Npb24oKSB7IHJldHVybiB0aGlzLmFjdGl2ZVNwZWVjaFRvVGV4dFNlc3Npb25zID4gMDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3BlZWNoVG9UZXh0SW5Qcm9ncmVzczogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0YXN5bmMgY3JlYXRlU3BlZWNoVG9UZXh0U2Vzc2lvbih0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGNvbnRleHQ6IHN0cmluZyA9ICdzcGVlY2gnKTogUHJvbWlzZTxJU3BlZWNoVG9UZXh0U2Vzc2lvbj4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gYXdhaXQgdGhpcy5nZXRQcm92aWRlcigpO1xuXG5cdFx0Y29uc3QgbGFuZ3VhZ2UgPSBzcGVlY2hMYW5ndWFnZUNvbmZpZ1RvTGFuZ3VhZ2UodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx1bmtub3duPihTUEVFQ0hfTEFOR1VBR0VfQ09ORklHKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZVNwZWVjaFRvVGV4dFNlc3Npb24odG9rZW4sIHR5cGVvZiBsYW5ndWFnZSA9PT0gJ3N0cmluZycgPyB7IGxhbmd1YWdlIH0gOiB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblN0YXJ0ID0gRGF0ZS5ub3coKTtcblx0XHRsZXQgc2Vzc2lvblJlY29nbml6ZWQgPSBmYWxzZTtcblx0XHRsZXQgc2Vzc2lvbkVycm9yID0gZmFsc2U7XG5cdFx0bGV0IHNlc3Npb25Db250ZW50TGVuZ3RoID0gMDtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Y29uc3Qgb25TZXNzaW9uU3RvcHBlZE9yQ2FuY2VsZWQgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLmFjdGl2ZVNwZWVjaFRvVGV4dFNlc3Npb25zID0gTWF0aC5tYXgoMCwgdGhpcy5hY3RpdmVTcGVlY2hUb1RleHRTZXNzaW9ucyAtIDEpO1xuXHRcdFx0aWYgKCF0aGlzLmhhc0FjdGl2ZVNwZWVjaFRvVGV4dFNlc3Npb24pIHtcblx0XHRcdFx0dGhpcy5zcGVlY2hUb1RleHRJblByb2dyZXNzLnJlc2V0KCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vbkRpZEVuZFNwZWVjaFRvVGV4dFNlc3Npb24uZmlyZSgpO1xuXG5cdFx0XHR0eXBlIFNwZWVjaFRvVGV4dFNlc3Npb25DbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0b3duZXI6ICdicGFzZXJvJztcblx0XHRcdFx0Y29tbWVudDogJ0FuIGV2ZW50IHRoYXQgZmlyZXMgd2hlbiBhIHNwZWVjaCB0byB0ZXh0IHNlc3Npb24gaXMgY3JlYXRlZCc7XG5cdFx0XHRcdGNvbnRleHQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdDb250ZXh0IG9mIHRoZSBzZXNzaW9uLicgfTtcblx0XHRcdFx0c2Vzc2lvbkR1cmF0aW9uOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnRHVyYXRpb24gb2YgdGhlIHNlc3Npb24uJyB9O1xuXHRcdFx0XHRzZXNzaW9uUmVjb2duaXplZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0lmIHNwZWVjaCB3YXMgcmVjb2duaXplZC4nIH07XG5cdFx0XHRcdHNlc3Npb25FcnJvcjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0lmIHNwZWVjaCByZXN1bHRlZCBpbiBlcnJvci4nIH07XG5cdFx0XHRcdHNlc3Npb25Db250ZW50TGVuZ3RoOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnTGVuZ3RoIG9mIHRoZSByZWNvZ25pemVkIHRleHQuJyB9O1xuXHRcdFx0XHRzZXNzaW9uTGFuZ3VhZ2U6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdDb25maWd1cmVkIGxhbmd1YWdlIGZvciB0aGUgc2Vzc2lvbi4nIH07XG5cdFx0XHR9O1xuXHRcdFx0dHlwZSBTcGVlY2hUb1RleHRTZXNzaW9uRXZlbnQgPSB7XG5cdFx0XHRcdGNvbnRleHQ6IHN0cmluZztcblx0XHRcdFx0c2Vzc2lvbkR1cmF0aW9uOiBudW1iZXI7XG5cdFx0XHRcdHNlc3Npb25SZWNvZ25pemVkOiBib29sZWFuO1xuXHRcdFx0XHRzZXNzaW9uRXJyb3I6IGJvb2xlYW47XG5cdFx0XHRcdHNlc3Npb25Db250ZW50TGVuZ3RoOiBudW1iZXI7XG5cdFx0XHRcdHNlc3Npb25MYW5ndWFnZTogc3RyaW5nO1xuXHRcdFx0fTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFNwZWVjaFRvVGV4dFNlc3Npb25FdmVudCwgU3BlZWNoVG9UZXh0U2Vzc2lvbkNsYXNzaWZpY2F0aW9uPignc3BlZWNoVG9UZXh0U2Vzc2lvbicsIHtcblx0XHRcdFx0Y29udGV4dCxcblx0XHRcdFx0c2Vzc2lvbkR1cmF0aW9uOiBEYXRlLm5vdygpIC0gc2Vzc2lvblN0YXJ0LFxuXHRcdFx0XHRzZXNzaW9uUmVjb2duaXplZCxcblx0XHRcdFx0c2Vzc2lvbkVycm9yLFxuXHRcdFx0XHRzZXNzaW9uQ29udGVudExlbmd0aCxcblx0XHRcdFx0c2Vzc2lvbkxhbmd1YWdlOiBsYW5ndWFnZVxuXHRcdFx0fSk7XG5cblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9O1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IG9uU2Vzc2lvblN0b3BwZWRPckNhbmNlbGVkKCkpKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdG9uU2Vzc2lvblN0b3BwZWRPckNhbmNlbGVkKCk7XG5cdFx0fVxuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlc3Npb24ub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRzd2l0Y2ggKGUuc3RhdHVzKSB7XG5cdFx0XHRcdGNhc2UgU3BlZWNoVG9UZXh0U3RhdHVzLlN0YXJ0ZWQ6XG5cdFx0XHRcdFx0dGhpcy5hY3RpdmVTcGVlY2hUb1RleHRTZXNzaW9ucysrO1xuXHRcdFx0XHRcdHRoaXMuc3BlZWNoVG9UZXh0SW5Qcm9ncmVzcy5zZXQodHJ1ZSk7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRTdGFydFNwZWVjaFRvVGV4dFNlc3Npb24uZmlyZSgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFNwZWVjaFRvVGV4dFN0YXR1cy5SZWNvZ25pemluZzpcblx0XHRcdFx0XHRzZXNzaW9uUmVjb2duaXplZCA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgU3BlZWNoVG9UZXh0U3RhdHVzLlJlY29nbml6ZWQ6XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBlLnRleHQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdFx0XHRzZXNzaW9uQ29udGVudExlbmd0aCArPSBlLnRleHQubGVuZ3RoO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBTcGVlY2hUb1RleHRTdGF0dXMuU3RvcHBlZDpcblx0XHRcdFx0XHRvblNlc3Npb25TdG9wcGVkT3JDYW5jZWxlZCgpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFNwZWVjaFRvVGV4dFN0YXR1cy5FcnJvcjpcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoYFNwZWVjaCBwcm92aWRlciBlcnJvciBpbiBzcGVlY2ggdG8gdGV4dCBzZXNzaW9uOiAke2UudGV4dH1gKTtcblx0XHRcdFx0XHRzZXNzaW9uRXJyb3IgPSB0cnVlO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBzZXNzaW9uO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRQcm92aWRlcigpOiBQcm9taXNlPElTcGVlY2hQcm92aWRlcj4ge1xuXG5cdFx0Ly8gU2VuZCBvdXQgZXh0ZW5zaW9uIGFjdGl2YXRpb24gdG8gZW5zdXJlIHByb3ZpZGVycyBjYW4gcmVnaXN0ZXJcblx0XHRhd2FpdCB0aGlzLmV4dGVuc2lvblNlcnZpY2UuYWN0aXZhdGVCeUV2ZW50KCdvblNwZWVjaCcpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBBcnJheS5mcm9tKHRoaXMucHJvdmlkZXJzLnZhbHVlcygpKS5hdCgwKTtcblx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIFNwZWVjaCBwcm92aWRlciBpcyByZWdpc3RlcmVkLmApO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5wcm92aWRlcnMuc2l6ZSA+IDEpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBNdWx0aXBsZSBzcGVlY2ggcHJvdmlkZXJzIHJlZ2lzdGVyZWQuIFBpY2tpbmcgZmlyc3Qgb25lOiAke3Byb3ZpZGVyLm1ldGFkYXRhLmRpc3BsYXlOYW1lfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcm92aWRlcjtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBUZXh0IHRvIFNwZWVjaFxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3RhcnRUZXh0VG9TcGVlY2hTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkU3RhcnRUZXh0VG9TcGVlY2hTZXNzaW9uID0gdGhpcy5fb25EaWRTdGFydFRleHRUb1NwZWVjaFNlc3Npb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFbmRUZXh0VG9TcGVlY2hTZXNzaW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRW5kVGV4dFRvU3BlZWNoU2Vzc2lvbiA9IHRoaXMuX29uRGlkRW5kVGV4dFRvU3BlZWNoU2Vzc2lvbi5ldmVudDtcblxuXHRwcml2YXRlIGFjdGl2ZVRleHRUb1NwZWVjaFNlc3Npb25zID0gMDtcblx0Z2V0IGhhc0FjdGl2ZVRleHRUb1NwZWVjaFNlc3Npb24oKSB7IHJldHVybiB0aGlzLmFjdGl2ZVRleHRUb1NwZWVjaFNlc3Npb25zID4gMDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgdGV4dFRvU3BlZWNoSW5Qcm9ncmVzczogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0YXN5bmMgY3JlYXRlVGV4dFRvU3BlZWNoU2Vzc2lvbih0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIGNvbnRleHQ6IHN0cmluZyA9ICdzcGVlY2gnKTogUHJvbWlzZTxJVGV4dFRvU3BlZWNoU2Vzc2lvbj4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gYXdhaXQgdGhpcy5nZXRQcm92aWRlcigpO1xuXG5cdFx0Y29uc3QgbGFuZ3VhZ2UgPSBzcGVlY2hMYW5ndWFnZUNvbmZpZ1RvTGFuZ3VhZ2UodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTx1bmtub3duPihTUEVFQ0hfTEFOR1VBR0VfQ09ORklHKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZVRleHRUb1NwZWVjaFNlc3Npb24odG9rZW4sIHR5cGVvZiBsYW5ndWFnZSA9PT0gJ3N0cmluZycgPyB7IGxhbmd1YWdlIH0gOiB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblN0YXJ0ID0gRGF0ZS5ub3coKTtcblx0XHRsZXQgc2Vzc2lvbkVycm9yID0gZmFsc2U7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IG9uU2Vzc2lvblN0b3BwZWRPckNhbmNlbGVkID0gKGRpc3Bvc2U6IGJvb2xlYW4pID0+IHtcblx0XHRcdHRoaXMuYWN0aXZlVGV4dFRvU3BlZWNoU2Vzc2lvbnMgPSBNYXRoLm1heCgwLCB0aGlzLmFjdGl2ZVRleHRUb1NwZWVjaFNlc3Npb25zIC0gMSk7XG5cdFx0XHRpZiAoIXRoaXMuaGFzQWN0aXZlVGV4dFRvU3BlZWNoU2Vzc2lvbikge1xuXHRcdFx0XHR0aGlzLnRleHRUb1NwZWVjaEluUHJvZ3Jlc3MucmVzZXQoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuX29uRGlkRW5kVGV4dFRvU3BlZWNoU2Vzc2lvbi5maXJlKCk7XG5cblx0XHRcdHR5cGUgVGV4dFRvU3BlZWNoU2Vzc2lvbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0XHRvd25lcjogJ2JwYXNlcm8nO1xuXHRcdFx0XHRjb21tZW50OiAnQW4gZXZlbnQgdGhhdCBmaXJlcyB3aGVuIGEgdGV4dCB0byBzcGVlY2ggc2Vzc2lvbiBpcyBjcmVhdGVkJztcblx0XHRcdFx0Y29udGV4dDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0NvbnRleHQgb2YgdGhlIHNlc3Npb24uJyB9O1xuXHRcdFx0XHRzZXNzaW9uRHVyYXRpb246IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdEdXJhdGlvbiBvZiB0aGUgc2Vzc2lvbi4nIH07XG5cdFx0XHRcdHNlc3Npb25FcnJvcjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0lmIHNwZWVjaCByZXN1bHRlZCBpbiBlcnJvci4nIH07XG5cdFx0XHRcdHNlc3Npb25MYW5ndWFnZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0NvbmZpZ3VyZWQgbGFuZ3VhZ2UgZm9yIHRoZSBzZXNzaW9uLicgfTtcblx0XHRcdH07XG5cdFx0XHR0eXBlIFRleHRUb1NwZWVjaFNlc3Npb25FdmVudCA9IHtcblx0XHRcdFx0Y29udGV4dDogc3RyaW5nO1xuXHRcdFx0XHRzZXNzaW9uRHVyYXRpb246IG51bWJlcjtcblx0XHRcdFx0c2Vzc2lvbkVycm9yOiBib29sZWFuO1xuXHRcdFx0XHRzZXNzaW9uTGFuZ3VhZ2U6IHN0cmluZztcblx0XHRcdH07XG5cdFx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxUZXh0VG9TcGVlY2hTZXNzaW9uRXZlbnQsIFRleHRUb1NwZWVjaFNlc3Npb25DbGFzc2lmaWNhdGlvbj4oJ3RleHRUb1NwZWVjaFNlc3Npb24nLCB7XG5cdFx0XHRcdGNvbnRleHQsXG5cdFx0XHRcdHNlc3Npb25EdXJhdGlvbjogRGF0ZS5ub3coKSAtIHNlc3Npb25TdGFydCxcblx0XHRcdFx0c2Vzc2lvbkVycm9yLFxuXHRcdFx0XHRzZXNzaW9uTGFuZ3VhZ2U6IGxhbmd1YWdlXG5cdFx0XHR9KTtcblxuXHRcdFx0aWYgKGRpc3Bvc2UpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gb25TZXNzaW9uU3RvcHBlZE9yQ2FuY2VsZWQodHJ1ZSkpKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdG9uU2Vzc2lvblN0b3BwZWRPckNhbmNlbGVkKHRydWUpO1xuXHRcdH1cblxuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXNzaW9uLm9uRGlkQ2hhbmdlKGUgPT4ge1xuXHRcdFx0c3dpdGNoIChlLnN0YXR1cykge1xuXHRcdFx0XHRjYXNlIFRleHRUb1NwZWVjaFN0YXR1cy5TdGFydGVkOlxuXHRcdFx0XHRcdHRoaXMuYWN0aXZlVGV4dFRvU3BlZWNoU2Vzc2lvbnMrKztcblx0XHRcdFx0XHR0aGlzLnRleHRUb1NwZWVjaEluUHJvZ3Jlc3Muc2V0KHRydWUpO1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkU3RhcnRUZXh0VG9TcGVlY2hTZXNzaW9uLmZpcmUoKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBUZXh0VG9TcGVlY2hTdGF0dXMuU3RvcHBlZDpcblx0XHRcdFx0XHRvblNlc3Npb25TdG9wcGVkT3JDYW5jZWxlZChmYWxzZSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgVGV4dFRvU3BlZWNoU3RhdHVzLkVycm9yOlxuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgU3BlZWNoIHByb3ZpZGVyIGVycm9yIGluIHRleHQgdG8gc3BlZWNoIHNlc3Npb246ICR7ZS50ZXh0fWApO1xuXHRcdFx0XHRcdHNlc3Npb25FcnJvciA9IHRydWU7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gS2V5d29yZCBSZWNvZ25pdGlvblxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3RhcnRLZXl3b3JkUmVjb2duaXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRTdGFydEtleXdvcmRSZWNvZ25pdGlvbiA9IHRoaXMuX29uRGlkU3RhcnRLZXl3b3JkUmVjb2duaXRpb24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFbmRLZXl3b3JkUmVjb2duaXRpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWRFbmRLZXl3b3JkUmVjb2duaXRpb24gPSB0aGlzLl9vbkRpZEVuZEtleXdvcmRSZWNvZ25pdGlvbi5ldmVudDtcblxuXHRwcml2YXRlIGFjdGl2ZUtleXdvcmRSZWNvZ25pdGlvblNlc3Npb25zID0gMDtcblx0Z2V0IGhhc0FjdGl2ZUtleXdvcmRSZWNvZ25pdGlvbigpIHsgcmV0dXJuIHRoaXMuYWN0aXZlS2V5d29yZFJlY29nbml0aW9uU2Vzc2lvbnMgPiAwOyB9XG5cblx0YXN5bmMgcmVjb2duaXplS2V5d29yZCh0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEtleXdvcmRSZWNvZ25pdGlvblN0YXR1cz4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBEZWZlcnJlZFByb21pc2U8S2V5d29yZFJlY29nbml0aW9uU3RhdHVzPigpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRcdHJlc3VsdC5jb21wbGV0ZShLZXl3b3JkUmVjb2duaXRpb25TdGF0dXMuQ2FuY2VsZWQpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlY29nbml6ZUtleXdvcmREaXNwb3NhYmxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGxldCBhY3RpdmVSZWNvZ25pemVLZXl3b3JkU2Vzc2lvbjogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZWNvZ25pemVLZXl3b3JkID0gKCkgPT4ge1xuXHRcdFx0cmVjb2duaXplS2V5d29yZERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSh0b2tlbik7XG5cdFx0XHRyZWNvZ25pemVLZXl3b3JkRGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjdHMuZGlzcG9zZSh0cnVlKSkpO1xuXHRcdFx0Y29uc3QgY3VycmVudFJlY29nbml6ZUtleXdvcmRTZXNzaW9uID0gYWN0aXZlUmVjb2duaXplS2V5d29yZFNlc3Npb24gPSB0aGlzLmRvUmVjb2duaXplS2V5d29yZChjdHMudG9rZW4pLnRoZW4oc3RhdHVzID0+IHtcblx0XHRcdFx0aWYgKGN1cnJlbnRSZWNvZ25pemVLZXl3b3JkU2Vzc2lvbiA9PT0gYWN0aXZlUmVjb2duaXplS2V5d29yZFNlc3Npb24pIHtcblx0XHRcdFx0XHRyZXN1bHQuY29tcGxldGUoc3RhdHVzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSwgZXJyb3IgPT4ge1xuXHRcdFx0XHRpZiAoY3VycmVudFJlY29nbml6ZUtleXdvcmRTZXNzaW9uID09PSBhY3RpdmVSZWNvZ25pemVLZXl3b3JkU2Vzc2lvbikge1xuXHRcdFx0XHRcdHJlc3VsdC5lcnJvcihlcnJvcik7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5ob3N0U2VydmljZS5vbkRpZENoYW5nZUZvY3VzKGZvY3VzZWQgPT4ge1xuXHRcdFx0aWYgKCFmb2N1c2VkICYmIGFjdGl2ZVJlY29nbml6ZUtleXdvcmRTZXNzaW9uKSB7XG5cdFx0XHRcdHJlY29nbml6ZUtleXdvcmREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHRhY3RpdmVSZWNvZ25pemVLZXl3b3JkU2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0XHRcdH0gZWxzZSBpZiAoIWFjdGl2ZVJlY29nbml6ZUtleXdvcmRTZXNzaW9uKSB7XG5cdFx0XHRcdHJlY29nbml6ZUtleXdvcmQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAodGhpcy5ob3N0U2VydmljZS5oYXNGb2N1cykge1xuXHRcdFx0cmVjb2duaXplS2V5d29yZCgpO1xuXHRcdH1cblxuXHRcdGxldCBzdGF0dXM6IEtleXdvcmRSZWNvZ25pdGlvblN0YXR1cztcblx0XHR0cnkge1xuXHRcdFx0c3RhdHVzID0gYXdhaXQgcmVzdWx0LnA7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHR0eXBlIEtleXdvcmRSZWNvZ25pdGlvbkNsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0b3duZXI6ICdicGFzZXJvJztcblx0XHRcdGNvbW1lbnQ6ICdBbiBldmVudCB0aGF0IGZpcmVzIHdoZW4gYSBzcGVlY2gga2V5d29yZCBkZXRlY3Rpb24gaXMgc3RhcnRlZCc7XG5cdFx0XHRrZXl3b3JkUmVjb2duaXplZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0lmIHRoZSBrZXl3b3JkIHdhcyByZWNvZ25pemVkLicgfTtcblx0XHR9O1xuXHRcdHR5cGUgS2V5d29yZFJlY29nbml0aW9uRXZlbnQgPSB7XG5cdFx0XHRrZXl3b3JkUmVjb2duaXplZDogYm9vbGVhbjtcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEtleXdvcmRSZWNvZ25pdGlvbkV2ZW50LCBLZXl3b3JkUmVjb2duaXRpb25DbGFzc2lmaWNhdGlvbj4oJ2tleXdvcmRSZWNvZ25pdGlvbicsIHtcblx0XHRcdGtleXdvcmRSZWNvZ25pemVkOiBzdGF0dXMgPT09IEtleXdvcmRSZWNvZ25pdGlvblN0YXR1cy5SZWNvZ25pemVkXG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gc3RhdHVzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBkb1JlY29nbml6ZUtleXdvcmQodG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxLZXl3b3JkUmVjb2duaXRpb25TdGF0dXM+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGF3YWl0IHRoaXMuZ2V0UHJvdmlkZXIoKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVLZXl3b3JkUmVjb2duaXRpb25TZXNzaW9uKHRva2VuKTtcblx0XHR0aGlzLmFjdGl2ZUtleXdvcmRSZWNvZ25pdGlvblNlc3Npb25zKys7XG5cdFx0dGhpcy5fb25EaWRTdGFydEtleXdvcmRSZWNvZ25pdGlvbi5maXJlKCk7XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnN0IG9uU2Vzc2lvblN0b3BwZWRPckNhbmNlbGVkID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5hY3RpdmVLZXl3b3JkUmVjb2duaXRpb25TZXNzaW9ucyA9IE1hdGgubWF4KDAsIHRoaXMuYWN0aXZlS2V5d29yZFJlY29nbml0aW9uU2Vzc2lvbnMgLSAxKTtcblx0XHRcdHRoaXMuX29uRGlkRW5kS2V5d29yZFJlY29nbml0aW9uLmZpcmUoKTtcblxuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdH07XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gb25TZXNzaW9uU3RvcHBlZE9yQ2FuY2VsZWQoKSkpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0b25TZXNzaW9uU3RvcHBlZE9yQ2FuY2VsZWQoKTtcblx0XHR9XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQoc2Vzc2lvbi5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLnN0YXR1cyA9PT0gS2V5d29yZFJlY29nbml0aW9uU3RhdHVzLlN0b3BwZWQpIHtcblx0XHRcdFx0b25TZXNzaW9uU3RvcHBlZE9yQ2FuY2VsZWQoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIChhd2FpdCBFdmVudC50b1Byb21pc2Uoc2Vzc2lvbi5vbkRpZENoYW5nZSkpLnN0YXR1cztcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0b25TZXNzaW9uU3RvcHBlZE9yQ2FuY2VsZWQoKTtcblx0XHR9XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7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
