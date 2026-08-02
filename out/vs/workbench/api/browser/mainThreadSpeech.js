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
import { raceCancellation } from "../../../base/common/async.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { ILogService } from "../../../platform/log/common/log.js";
import { ExtHostContext, MainContext } from "../common/extHost.protocol.js";
import { ISpeechService, TextToSpeechStatus } from "../../contrib/speech/common/speechService.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
let MainThreadSpeech = class {
  constructor(extHostContext, speechService, logService) {
    this.speechService = speechService;
    this.logService = logService;
    this.providerRegistrations = /* @__PURE__ */ new Map();
    this.speechToTextSessions = /* @__PURE__ */ new Map();
    this.textToSpeechSessions = /* @__PURE__ */ new Map();
    this.keywordRecognitionSessions = /* @__PURE__ */ new Map();
    this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostSpeech);
  }
  $registerProvider(handle, identifier, metadata) {
    this.logService.trace("[Speech] extension registered provider", metadata.extension.value);
    const registration = this.speechService.registerSpeechProvider(identifier, {
      metadata,
      createSpeechToTextSession: (token, options) => {
        if (token.isCancellationRequested) {
          return {
            onDidChange: Event.None
          };
        }
        const disposables = new DisposableStore();
        const session = Math.random();
        this.proxy.$createSpeechToTextSession(handle, session, options?.language);
        const onDidChange = disposables.add(new Emitter());
        this.speechToTextSessions.set(session, { onDidChange });
        disposables.add(token.onCancellationRequested(() => {
          this.proxy.$cancelSpeechToTextSession(session);
          this.speechToTextSessions.delete(session);
          disposables.dispose();
        }));
        return {
          onDidChange: onDidChange.event
        };
      },
      createTextToSpeechSession: (token, options) => {
        if (token.isCancellationRequested) {
          return {
            onDidChange: Event.None,
            synthesize: async () => {
            }
          };
        }
        const disposables = new DisposableStore();
        const session = Math.random();
        this.proxy.$createTextToSpeechSession(handle, session, options?.language);
        const onDidChange = disposables.add(new Emitter());
        this.textToSpeechSessions.set(session, { onDidChange });
        disposables.add(token.onCancellationRequested(() => {
          this.proxy.$cancelTextToSpeechSession(session);
          this.textToSpeechSessions.delete(session);
          disposables.dispose();
        }));
        return {
          onDidChange: onDidChange.event,
          synthesize: async (text) => {
            await this.proxy.$synthesizeSpeech(session, text);
            const disposable = new DisposableStore();
            try {
              await raceCancellation(Event.toPromise(Event.filter(onDidChange.event, (e) => e.status === TextToSpeechStatus.Stopped, disposable), disposable), token);
            } finally {
              disposable.dispose();
            }
          }
        };
      },
      createKeywordRecognitionSession: (token) => {
        if (token.isCancellationRequested) {
          return {
            onDidChange: Event.None
          };
        }
        const disposables = new DisposableStore();
        const session = Math.random();
        this.proxy.$createKeywordRecognitionSession(handle, session);
        const onDidChange = disposables.add(new Emitter());
        this.keywordRecognitionSessions.set(session, { onDidChange });
        disposables.add(token.onCancellationRequested(() => {
          this.proxy.$cancelKeywordRecognitionSession(session);
          this.keywordRecognitionSessions.delete(session);
          disposables.dispose();
        }));
        return {
          onDidChange: onDidChange.event
        };
      }
    });
    this.providerRegistrations.set(handle, {
      dispose: () => {
        registration.dispose();
      }
    });
  }
  $unregisterProvider(handle) {
    const registration = this.providerRegistrations.get(handle);
    if (registration) {
      registration.dispose();
      this.providerRegistrations.delete(handle);
    }
  }
  $emitSpeechToTextEvent(session, event) {
    const providerSession = this.speechToTextSessions.get(session);
    providerSession?.onDidChange.fire(event);
  }
  $emitTextToSpeechEvent(session, event) {
    const providerSession = this.textToSpeechSessions.get(session);
    providerSession?.onDidChange.fire(event);
  }
  $emitKeywordRecognitionEvent(session, event) {
    const providerSession = this.keywordRecognitionSessions.get(session);
    providerSession?.onDidChange.fire(event);
  }
  dispose() {
    this.providerRegistrations.forEach((disposable) => disposable.dispose());
    this.providerRegistrations.clear();
    this.speechToTextSessions.forEach((session) => session.onDidChange.dispose());
    this.speechToTextSessions.clear();
    this.textToSpeechSessions.forEach((session) => session.onDidChange.dispose());
    this.textToSpeechSessions.clear();
    this.keywordRecognitionSessions.forEach((session) => session.onDidChange.dispose());
    this.keywordRecognitionSessions.clear();
  }
};
MainThreadSpeech = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadSpeech),
  __decorateParam(1, ISpeechService),
  __decorateParam(2, ILogService)
], MainThreadSpeech);
export {
  MainThreadSpeech
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkU3BlZWNoLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcmFjZUNhbmNlbGxhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb250ZXh0LCBFeHRIb3N0U3BlZWNoU2hhcGUsIE1haW5Db250ZXh0LCBNYWluVGhyZWFkU3BlZWNoU2hhcGUgfSBmcm9tICcuLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJS2V5d29yZFJlY29nbml0aW9uRXZlbnQsIElTcGVlY2hQcm92aWRlck1ldGFkYXRhLCBJU3BlZWNoU2VydmljZSwgSVNwZWVjaFRvVGV4dEV2ZW50LCBJVGV4dFRvU3BlZWNoRXZlbnQsIFRleHRUb1NwZWVjaFN0YXR1cyB9IGZyb20gJy4uLy4uL2NvbnRyaWIvc3BlZWNoL2NvbW1vbi9zcGVlY2hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0Q29udGV4dCwgZXh0SG9zdE5hbWVkQ3VzdG9tZXIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcblxudHlwZSBTcGVlY2hUb1RleHRTZXNzaW9uID0ge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRW1pdHRlcjxJU3BlZWNoVG9UZXh0RXZlbnQ+O1xufTtcblxudHlwZSBUZXh0VG9TcGVlY2hTZXNzaW9uID0ge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRW1pdHRlcjxJVGV4dFRvU3BlZWNoRXZlbnQ+O1xufTtcblxudHlwZSBLZXl3b3JkUmVjb2duaXRpb25TZXNzaW9uID0ge1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRW1pdHRlcjxJS2V5d29yZFJlY29nbml0aW9uRXZlbnQ+O1xufTtcblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRTcGVlY2gpXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZFNwZWVjaCBpbXBsZW1lbnRzIE1haW5UaHJlYWRTcGVlY2hTaGFwZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBwcm94eTogRXh0SG9zdFNwZWVjaFNoYXBlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcHJvdmlkZXJSZWdpc3RyYXRpb25zID0gbmV3IE1hcDxudW1iZXIsIElEaXNwb3NhYmxlPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3BlZWNoVG9UZXh0U2Vzc2lvbnMgPSBuZXcgTWFwPG51bWJlciwgU3BlZWNoVG9UZXh0U2Vzc2lvbj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB0ZXh0VG9TcGVlY2hTZXNzaW9ucyA9IG5ldyBNYXA8bnVtYmVyLCBUZXh0VG9TcGVlY2hTZXNzaW9uPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGtleXdvcmRSZWNvZ25pdGlvblNlc3Npb25zID0gbmV3IE1hcDxudW1iZXIsIEtleXdvcmRSZWNvZ25pdGlvblNlc3Npb24+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0ZXh0SG9zdENvbnRleHQ6IElFeHRIb3N0Q29udGV4dCxcblx0XHRASVNwZWVjaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzcGVlY2hTZXJ2aWNlOiBJU3BlZWNoU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLnByb3h5ID0gZXh0SG9zdENvbnRleHQuZ2V0UHJveHkoRXh0SG9zdENvbnRleHQuRXh0SG9zdFNwZWVjaCk7XG5cdH1cblxuXHQkcmVnaXN0ZXJQcm92aWRlcihoYW5kbGU6IG51bWJlciwgaWRlbnRpZmllcjogc3RyaW5nLCBtZXRhZGF0YTogSVNwZWVjaFByb3ZpZGVyTWV0YWRhdGEpOiB2b2lkIHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tTcGVlY2hdIGV4dGVuc2lvbiByZWdpc3RlcmVkIHByb3ZpZGVyJywgbWV0YWRhdGEuZXh0ZW5zaW9uLnZhbHVlKTtcblxuXHRcdGNvbnN0IHJlZ2lzdHJhdGlvbiA9IHRoaXMuc3BlZWNoU2VydmljZS5yZWdpc3RlclNwZWVjaFByb3ZpZGVyKGlkZW50aWZpZXIsIHtcblx0XHRcdG1ldGFkYXRhLFxuXHRcdFx0Y3JlYXRlU3BlZWNoVG9UZXh0U2Vzc2lvbjogKHRva2VuLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IE1hdGgucmFuZG9tKCk7XG5cblx0XHRcdFx0dGhpcy5wcm94eS4kY3JlYXRlU3BlZWNoVG9UZXh0U2Vzc2lvbihoYW5kbGUsIHNlc3Npb24sIG9wdGlvbnM/Lmxhbmd1YWdlKTtcblxuXHRcdFx0XHRjb25zdCBvbkRpZENoYW5nZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJU3BlZWNoVG9UZXh0RXZlbnQ+KCkpO1xuXHRcdFx0XHR0aGlzLnNwZWVjaFRvVGV4dFNlc3Npb25zLnNldChzZXNzaW9uLCB7IG9uRGlkQ2hhbmdlIH0pO1xuXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5wcm94eS4kY2FuY2VsU3BlZWNoVG9UZXh0U2Vzc2lvbihzZXNzaW9uKTtcblx0XHRcdFx0XHR0aGlzLnNwZWVjaFRvVGV4dFNlc3Npb25zLmRlbGV0ZShzZXNzaW9uKTtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0XHRcdH0pKTtcblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBvbkRpZENoYW5nZS5ldmVudFxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZVRleHRUb1NwZWVjaFNlc3Npb246ICh0b2tlbiwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdFx0XHRzeW50aGVzaXplOiBhc3luYyAoKSA9PiB7IH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdGNvbnN0IHNlc3Npb24gPSBNYXRoLnJhbmRvbSgpO1xuXG5cdFx0XHRcdHRoaXMucHJveHkuJGNyZWF0ZVRleHRUb1NwZWVjaFNlc3Npb24oaGFuZGxlLCBzZXNzaW9uLCBvcHRpb25zPy5sYW5ndWFnZSk7XG5cblx0XHRcdFx0Y29uc3Qgb25EaWRDaGFuZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVRleHRUb1NwZWVjaEV2ZW50PigpKTtcblx0XHRcdFx0dGhpcy50ZXh0VG9TcGVlY2hTZXNzaW9ucy5zZXQoc2Vzc2lvbiwgeyBvbkRpZENoYW5nZSB9KTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucHJveHkuJGNhbmNlbFRleHRUb1NwZWVjaFNlc3Npb24oc2Vzc2lvbik7XG5cdFx0XHRcdFx0dGhpcy50ZXh0VG9TcGVlY2hTZXNzaW9ucy5kZWxldGUoc2Vzc2lvbik7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRvbkRpZENoYW5nZTogb25EaWRDaGFuZ2UuZXZlbnQsXG5cdFx0XHRcdFx0c3ludGhlc2l6ZTogYXN5bmMgdGV4dCA9PiB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnByb3h5LiRzeW50aGVzaXplU3BlZWNoKHNlc3Npb24sIHRleHQpO1xuXHRcdFx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHJhY2VDYW5jZWxsYXRpb24oRXZlbnQudG9Qcm9taXNlKEV2ZW50LmZpbHRlcihvbkRpZENoYW5nZS5ldmVudCwgZSA9PiBlLnN0YXR1cyA9PT0gVGV4dFRvU3BlZWNoU3RhdHVzLlN0b3BwZWQsIGRpc3Bvc2FibGUpLCBkaXNwb3NhYmxlKSwgdG9rZW4pO1xuXHRcdFx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0fSxcblx0XHRcdGNyZWF0ZUtleXdvcmRSZWNvZ25pdGlvblNlc3Npb246IHRva2VuID0+IHtcblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gTWF0aC5yYW5kb20oKTtcblxuXHRcdFx0XHR0aGlzLnByb3h5LiRjcmVhdGVLZXl3b3JkUmVjb2duaXRpb25TZXNzaW9uKGhhbmRsZSwgc2Vzc2lvbik7XG5cblx0XHRcdFx0Y29uc3Qgb25EaWRDaGFuZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SUtleXdvcmRSZWNvZ25pdGlvbkV2ZW50PigpKTtcblx0XHRcdFx0dGhpcy5rZXl3b3JkUmVjb2duaXRpb25TZXNzaW9ucy5zZXQoc2Vzc2lvbiwgeyBvbkRpZENoYW5nZSB9KTtcblxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMucHJveHkuJGNhbmNlbEtleXdvcmRSZWNvZ25pdGlvblNlc3Npb24oc2Vzc2lvbik7XG5cdFx0XHRcdFx0dGhpcy5rZXl3b3JkUmVjb2duaXRpb25TZXNzaW9ucy5kZWxldGUoc2Vzc2lvbik7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRvbkRpZENoYW5nZTogb25EaWRDaGFuZ2UuZXZlbnRcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLnByb3ZpZGVyUmVnaXN0cmF0aW9ucy5zZXQoaGFuZGxlLCB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdHJlZ2lzdHJhdGlvbi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQkdW5yZWdpc3RlclByb3ZpZGVyKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVnaXN0cmF0aW9uID0gdGhpcy5wcm92aWRlclJlZ2lzdHJhdGlvbnMuZ2V0KGhhbmRsZSk7XG5cdFx0aWYgKHJlZ2lzdHJhdGlvbikge1xuXHRcdFx0cmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMucHJvdmlkZXJSZWdpc3RyYXRpb25zLmRlbGV0ZShoYW5kbGUpO1xuXHRcdH1cblx0fVxuXG5cdCRlbWl0U3BlZWNoVG9UZXh0RXZlbnQoc2Vzc2lvbjogbnVtYmVyLCBldmVudDogSVNwZWVjaFRvVGV4dEV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXJTZXNzaW9uID0gdGhpcy5zcGVlY2hUb1RleHRTZXNzaW9ucy5nZXQoc2Vzc2lvbik7XG5cdFx0cHJvdmlkZXJTZXNzaW9uPy5vbkRpZENoYW5nZS5maXJlKGV2ZW50KTtcblx0fVxuXG5cdCRlbWl0VGV4dFRvU3BlZWNoRXZlbnQoc2Vzc2lvbjogbnVtYmVyLCBldmVudDogSVRleHRUb1NwZWVjaEV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXJTZXNzaW9uID0gdGhpcy50ZXh0VG9TcGVlY2hTZXNzaW9ucy5nZXQoc2Vzc2lvbik7XG5cdFx0cHJvdmlkZXJTZXNzaW9uPy5vbkRpZENoYW5nZS5maXJlKGV2ZW50KTtcblx0fVxuXG5cdCRlbWl0S2V5d29yZFJlY29nbml0aW9uRXZlbnQoc2Vzc2lvbjogbnVtYmVyLCBldmVudDogSUtleXdvcmRSZWNvZ25pdGlvbkV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgcHJvdmlkZXJTZXNzaW9uID0gdGhpcy5rZXl3b3JkUmVjb2duaXRpb25TZXNzaW9ucy5nZXQoc2Vzc2lvbik7XG5cdFx0cHJvdmlkZXJTZXNzaW9uPy5vbkRpZENoYW5nZS5maXJlKGV2ZW50KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5wcm92aWRlclJlZ2lzdHJhdGlvbnMuZm9yRWFjaChkaXNwb3NhYmxlID0+IGRpc3Bvc2FibGUuZGlzcG9zZSgpKTtcblx0XHR0aGlzLnByb3ZpZGVyUmVnaXN0cmF0aW9ucy5jbGVhcigpO1xuXG5cdFx0dGhpcy5zcGVlY2hUb1RleHRTZXNzaW9ucy5mb3JFYWNoKHNlc3Npb24gPT4gc2Vzc2lvbi5vbkRpZENoYW5nZS5kaXNwb3NlKCkpO1xuXHRcdHRoaXMuc3BlZWNoVG9UZXh0U2Vzc2lvbnMuY2xlYXIoKTtcblxuXHRcdHRoaXMudGV4dFRvU3BlZWNoU2Vzc2lvbnMuZm9yRWFjaChzZXNzaW9uID0+IHNlc3Npb24ub25EaWRDaGFuZ2UuZGlzcG9zZSgpKTtcblx0XHR0aGlzLnRleHRUb1NwZWVjaFNlc3Npb25zLmNsZWFyKCk7XG5cblx0XHR0aGlzLmtleXdvcmRSZWNvZ25pdGlvblNlc3Npb25zLmZvckVhY2goc2Vzc2lvbiA9PiBzZXNzaW9uLm9uRGlkQ2hhbmdlLmRpc3Bvc2UoKSk7XG5cdFx0dGhpcy5rZXl3b3JkUmVjb2duaXRpb25TZXNzaW9ucy5jbGVhcigpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNBQVMsdUJBQW9DO0FBQzdDLFNBQVMsbUJBQW1CO0FBQzVCLFNB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
