import { Emitter } from "../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { dirname, join } from "../../../base/common/path.js";
import { ensureFoundryLocalRuntime } from "./foundryLocalRuntime.js";
import {
  DEFAULT_LOCAL_TRANSCRIPTION_MODEL,
  LocalTranscriptionModelState
} from "../common/localTranscription.js";
import { importFoundryLocalModel } from "./foundryLocalModelImport.js";
const SAMPLE_RATE = 16e3;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const FOUNDRY_APP_NAME = "vscode-dictation";
function runtimeCacheDir(modelCacheDir) {
  return join(dirname(modelCacheDir), "chatDictationRuntime");
}
function classifyModelError(message) {
  const text = message.toLowerCase();
  if (/\b(404|not found|no such file|does not exist|could not locate|repository not found|unknown model)\b/.test(text)) {
    return "notFound";
  }
  if (/\b(network|fetch|econn|enotfound|etimedout|socket|dns|offline|proxy|tls|certificate|getaddrinfo|feed)\b/.test(text)) {
    return "network";
  }
  if (/\b(out of memory|oom|enomem|allocation failed|cannot allocate)\b/.test(text)) {
    return "memory";
  }
  if (/\b(enospc|no space left|disk)\b/.test(text)) {
    return "disk";
  }
  if (/\b(eacces|eperm|permission denied|access is denied)\b/.test(text)) {
    return "permission";
  }
  return "unknown";
}
function transcriptSeparator(current, next) {
  if (!current || !next || /[\s([{]$/.test(current) || /^\s|^[,.;:!?)}\]'"]/.test(next)) {
    return "";
  }
  return " ";
}
function appendTranscriptChunk(current, next) {
  if (!next.trim()) {
    return current;
  }
  if (!current) {
    return next.trimStart();
  }
  return `${current}${next}`;
}
class TranscriptAccumulator {
  constructor() {
    this._segments = /* @__PURE__ */ new Map();
    this._nextOrder = 0;
  }
  /** Record a finalized segment, replacing an earlier revision of the same one. */
  addFinal(text, startTime, endTime) {
    const normalized = text.trim();
    if (!normalized) {
      return;
    }
    const key = startTime !== null || endTime !== null ? `${startTime ?? "na"}:${endTime ?? "na"}` : `untimed:${this._nextOrder}`;
    const existing = this._segments.get(key);
    if (existing) {
      existing.text = normalized;
      return;
    }
    this._segments.set(key, { order: this._nextOrder, startTime, endTime, text: normalized });
    this._nextOrder++;
  }
  /** The cumulative finalized transcript, segments joined in time order. */
  getText() {
    return [...this._segments.values()].sort((a, b) => {
      if (a.startTime !== null && b.startTime !== null) {
        return a.startTime - b.startTime;
      }
      if (a.startTime !== null) {
        return -1;
      }
      if (b.startTime !== null) {
        return 1;
      }
      return a.order - b.order;
    }).reduce((text, seg) => `${text}${transcriptSeparator(text, seg.text)}${seg.text}`, "").trim();
  }
  reset() {
    this._segments.clear();
    this._nextOrder = 0;
  }
}
class LocalTranscriptionService extends Disposable {
  constructor() {
    super();
    this.isSupported = true;
    this._onDidChangeModelStatus = this._register(new Emitter());
    this.onDidChangeModelStatus = this._onDidChangeModelStatus.event;
    this._onDidTranscribe = this._register(new Emitter());
    this.onDidTranscribe = this._onDidTranscribe.event;
    this._status = { state: LocalTranscriptionModelState.Idle };
    this._sessionActive = false;
    /** Cumulative finalized transcript, accumulated per timed segment. */
    this._accumulator = new TranscriptAccumulator();
    /** Latest interim (not-yet-finalized) segment text. */
    this._partialText = "";
    /**
     * PCM chunks captured before the model finished loading and the session
     * opened. Flushed in order once the session starts so no leading audio is
     * dropped while the first-use download/load completes.
     */
    this._pendingChunks = [];
    /**
     * Serializes every `session.append()` through a single FIFO chain. Both the
     * buffered-backlog flush and live `pushAudio()` enqueue here, so audio is
     * always appended to native core in capture order — even across the first-use
     * handoff — and `stop()` can await this to guarantee the final chunk lands
     * before `session.stop()` drains the stream. The stored tail swallows
     * rejections so one failed append doesn't break ordering for the rest; the
     * real (rejectable) promise is returned to callers that need to observe it.
     */
    this._appendChain = Promise.resolve();
    /**
     * Monotonically bumped whenever a session starts or is reset, so a slow
     * session opened for one recording can detect that it is now stale and avoid
     * emitting its transcript into a later session.
     */
    this._generation = 0;
    this._register(toDisposable(() => {
      void this._disposeSession();
      this._modelPrepareCts?.cancel();
      this._modelPrepareCts?.dispose();
      this._modelPrepareCts = void 0;
    }));
  }
  async getModelStatus() {
    return this._status;
  }
  importModel(options) {
    return importFoundryLocalModel(options.sourcePath, options.cacheDir);
  }
  _setStatus(status) {
    this._status = status;
    this._onDidChangeModelStatus.fire(status);
  }
  async start(options) {
    this._applyProxyEnv(options.proxyUrl, options.noProxy, options.proxyStrictSSL, options.proxyAuthorization);
    this._runtimeDownload = options.runtimeUrlTemplate && options.runtimeVersion ? { urlTemplate: options.runtimeUrlTemplate, version: options.runtimeVersion } : void 0;
    await this._disposeSession();
    this._generation++;
    const generation = this._generation;
    this._sessionActive = true;
    this._accumulator.reset();
    this._partialText = "";
    this._pendingChunks = [];
    this._runtimeError = void 0;
    const model = options.model ?? DEFAULT_LOCAL_TRANSCRIPTION_MODEL;
    const language = options.language;
    this._openPromise = this._openSession(options.cacheDir, model, language, generation);
    this._openPromise.catch(() => {
    });
  }
  /**
   * Apply VS Code's proxy settings as environment variables for this process, so
   * every download leg (our fetches and the native model download) honors a proxy
   * configured only in VS Code (not in the OS environment):
   * - `http.proxy`/`http.noProxy` → `HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY`.
   * - `http.proxyAuthorization` (a `Basic <base64>` value) → folded into the proxy
   *   URL's userinfo so both our `HttpsProxyAgent` and the native HTTP stack send
   *   `Proxy-Authorization`. Non-`Basic` schemes (e.g. Negotiate/NTLM) cannot be
   *   carried this way and are left to OS-level auth.
   * - `http.proxyStrictSSL === false` → disable TLS certificate verification for
   *   the Node download legs. The native model leg still requires the CA in the OS
   *   trust store.
   *
   * A blank/undefined `proxyUrl` leaves any inherited environment proxy untouched.
   */
  _applyProxyEnv(proxyUrl, noProxy, proxyStrictSSL, proxyAuthorization) {
    if (proxyStrictSSL === false) {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
    if (!proxyUrl) {
      return;
    }
    const effectiveProxyUrl = this._embedProxyCredentials(proxyUrl, proxyAuthorization);
    process.env.HTTPS_PROXY = effectiveProxyUrl;
    process.env.HTTP_PROXY = effectiveProxyUrl;
    if (noProxy) {
      process.env.NO_PROXY = noProxy;
    }
  }
  /**
   * Fold a `Basic <base64>` `http.proxyAuthorization` value into `proxyUrl`'s
   * userinfo so proxy credentials survive the env-var bridge to every leg.
   * Returns `proxyUrl` unchanged when there is nothing to add or the header is
   * not a decodable `Basic` credential or the URL already carries credentials.
   */
  _embedProxyCredentials(proxyUrl, proxyAuthorization) {
    if (!proxyAuthorization) {
      return proxyUrl;
    }
    const basic = /^Basic\s+(?<token>[A-Za-z0-9+/=]+)$/i.exec(proxyAuthorization.trim());
    if (!basic?.groups?.token) {
      return proxyUrl;
    }
    let parsed;
    try {
      parsed = new URL(proxyUrl);
    } catch {
      return proxyUrl;
    }
    if (parsed.username || parsed.password) {
      return proxyUrl;
    }
    const decoded = Buffer.from(basic.groups.token, "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) {
      return proxyUrl;
    }
    parsed.username = encodeURIComponent(decoded.slice(0, separator));
    parsed.password = encodeURIComponent(decoded.slice(separator + 1));
    return parsed.toString();
  }
  /**
   * Ensure the Foundry Local manager exists, the selected model is downloaded
   * and loaded, and a fresh live transcription session is started. Buffered
   * audio captured while this was in flight is flushed once the session opens.
   */
  async _openSession(cacheDir, modelId, language, generation) {
    try {
      const model = await this._ensureModel(cacheDir, modelId);
      if (generation !== this._generation) {
        return;
      }
      const audioClient = model.createAudioClient();
      if (language) {
        audioClient.settings.language = language;
      }
      const session = audioClient.createLiveTranscriptionSession();
      session.settings.sampleRate = SAMPLE_RATE;
      session.settings.channels = CHANNELS;
      session.settings.bitsPerSample = BITS_PER_SAMPLE;
      if (language) {
        session.settings.language = language;
      }
      await session.start();
      if (generation !== this._generation) {
        await session.dispose();
        return;
      }
      this._session = session;
      this._setStatus({ state: LocalTranscriptionModelState.Ready });
      this._consumePromise = this._consume(session, generation);
      const buffered = this._pendingChunks;
      this._pendingChunks = [];
      for (const chunk of buffered) {
        if (generation !== this._generation) {
          break;
        }
        this._enqueueAppend(session, generation, chunk).catch((err) => {
          if (generation === this._generation) {
            const message = String(err instanceof Error ? err.message : err);
            this._setStatus({ state: LocalTranscriptionModelState.Error, error: message, errorCode: classifyModelError(message) });
          }
        });
      }
    } catch (err) {
      if (generation === this._generation) {
        const message = String(err instanceof Error ? err.message : err);
        this._setStatus({ state: LocalTranscriptionModelState.Error, error: message, errorCode: classifyModelError(message) });
      }
      throw err;
    }
  }
  /**
   * Append `chunk` to `session` after every previously enqueued append has
   * completed, preserving capture order. Returns a promise that rejects if this
   * particular append fails (for callers that must surface it); the internal
   * chain continues regardless so ordering is preserved for later chunks.
   */
  _enqueueAppend(session, generation, chunk) {
    const result = this._appendChain.then(() => {
      if (generation !== this._generation || this._session !== session) {
        return;
      }
      return session.append(chunk);
    });
    this._appendChain = result.catch(() => {
    });
    return result;
  }
  /**
   * Download (if needed) and load the selected model through Foundry Local,
   * reporting download/load progress via the model status. Idempotent: a load
   * already in flight (or the same model already loaded) is reused.
   */
  async _ensureModel(cacheDir, modelId) {
    if (this._model && this._loadedModelId === modelId) {
      return this._model;
    }
    if (this._modelPromise && this._loadedModelId === modelId) {
      return this._modelPromise;
    }
    this._loadedModelId = modelId;
    const cts = new CancellationTokenSource();
    this._modelPrepareCts = cts;
    this._modelPromise = (async () => {
      try {
        this._setStatus({ state: LocalTranscriptionModelState.Loading });
        if (this._runtimeDownload) {
          const nativeDir = await ensureFoundryLocalRuntime(runtimeCacheDir(cacheDir), this._runtimeDownload, cts.token);
          process.env.VSCODE_FOUNDRY_LOCAL_NATIVE_DIR = nativeDir;
        }
        if (!this._sdk) {
          this._sdk = await import("foundry-local-sdk");
        }
        if (!this._manager) {
          this._manager = await this._sdk.FoundryLocalManager.createAsync({
            appName: FOUNDRY_APP_NAME,
            modelCacheDir: cacheDir,
            logLevel: "warn"
          });
        }
        const model = await this._manager.catalog.getModel(modelId);
        let didDownload = false;
        if (!model.isCached) {
          didDownload = true;
          this._setStatus({ state: LocalTranscriptionModelState.Downloading, progress: 0 });
          const ac = new AbortController();
          const sub = cts.token.onCancellationRequested(() => ac.abort());
          try {
            await model.download((percent) => {
              this._setStatus({ state: LocalTranscriptionModelState.Downloading, progress: Math.min(1, Math.max(0, percent / 100)) });
            }, ac.signal);
          } finally {
            sub.dispose();
          }
        }
        if (cts.token.isCancellationRequested) {
          throw new Error("cancelled");
        }
        this._setStatus({ state: LocalTranscriptionModelState.Loading });
        await model.load();
        this._model = model;
        this._setStatus({ state: LocalTranscriptionModelState.Ready, downloaded: didDownload });
        if (this._modelPrepareCts === cts) {
          this._modelPrepareCts = void 0;
        }
        return model;
      } catch (err) {
        this._model = void 0;
        this._modelPromise = void 0;
        this._loadedModelId = void 0;
        if (this._modelPrepareCts === cts) {
          this._modelPrepareCts = void 0;
        }
        throw err;
      }
    })();
    return this._modelPromise;
  }
  /**
   * Drain the session's result stream, maintaining a cumulative transcript.
   * Foundry emits per-segment results flagged `is_final`; a finalized segment is
   * recorded (and replaced if later refined) in the accumulator, while a
   * non-final result is the interim tail of the segment currently being spoken.
   * Each update fires the full cumulative transcript so the renderer can shimmer
   * the interim tail and solidify finalized text.
   */
  async _consume(session, generation) {
    try {
      for await (const result of session.getStream()) {
        if (generation !== this._generation) {
          break;
        }
        const text = this._resultText(result);
        if (result.is_final) {
          this._accumulator.addFinal(text, result.start_time ?? null, result.end_time ?? null);
          this._partialText = "";
        } else {
          this._partialText = appendTranscriptChunk(this._partialText, text);
        }
        if (this._sessionActive) {
          this._onDidTranscribe.fire({ text: this._cumulativeText(), isFinal: false, finalizedText: this._accumulator.getText() });
        }
      }
    } catch (err) {
      if (generation === this._generation && this._sessionActive) {
        const error = err instanceof Error ? err : new Error(String(err));
        this._runtimeError = error;
        this._setStatus({ state: LocalTranscriptionModelState.Error, error: error.message, errorCode: "runtime" });
      }
    }
  }
  /** Finalized transcript plus the current interim tail, joined naturally. */
  _cumulativeText() {
    const finalized = this._accumulator.getText();
    const partial = this._partialText;
    if (!partial) {
      return finalized;
    }
    if (!finalized) {
      return partial;
    }
    return `${finalized}${transcriptSeparator(finalized, partial)}${partial}`;
  }
  _resultText(result) {
    const part = result.content?.[0];
    return part?.text ?? part?.transcript ?? "";
  }
  async pushAudio(chunk) {
    if (!this._sessionActive) {
      return;
    }
    const bytes = chunk.buffer;
    const pcm = new Uint8Array(bytes.byteLength);
    pcm.set(bytes);
    if (this._session) {
      await this._enqueueAppend(this._session, this._generation, pcm);
    } else {
      this._pendingChunks.push(pcm);
    }
  }
  async stop() {
    const generation = this._generation;
    this._sessionActive = false;
    if (this._openPromise) {
      try {
        await this._openPromise;
      } catch {
      }
    }
    if (generation !== this._generation) {
      return "";
    }
    const session = this._session;
    if (!session) {
      const text2 = this._cumulativeText();
      this._resetSessionState();
      return text2;
    }
    try {
      try {
        await this._appendChain;
      } catch {
      }
      await session.stop();
    } catch {
    }
    if (this._consumePromise) {
      try {
        await this._consumePromise;
      } catch {
      }
    }
    const runtimeError = this._runtimeError;
    if (runtimeError && generation === this._generation) {
      await this._disposeSession();
      this._resetSessionState();
      throw runtimeError;
    }
    const text = this._cumulativeText();
    if (generation === this._generation) {
      this._onDidTranscribe.fire({ text, isFinal: true, finalizedText: text });
    }
    await this._disposeSession();
    this._resetSessionState();
    return text;
  }
  async cancel() {
    this._modelPrepareCts?.cancel();
    this._modelPrepareCts = void 0;
    this._sessionActive = false;
    this._generation++;
    await this._disposeSession();
    this._resetSessionState();
  }
  async _disposeSession() {
    const session = this._session;
    this._session = void 0;
    const consume = this._consumePromise;
    this._consumePromise = void 0;
    if (session) {
      try {
        await session.dispose();
      } catch {
      }
    }
    if (consume) {
      try {
        await consume;
      } catch {
      }
    }
  }
  _resetSessionState() {
    this._sessionActive = false;
    this._accumulator.reset();
    this._partialText = "";
    this._pendingChunks = [];
    this._appendChain = Promise.resolve();
    this._runtimeError = void 0;
  }
}
export {
  LocalTranscriptionService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2xvY2FsVHJhbnNjcmlwdGlvbi9ub2RlL2xvY2FsVHJhbnNjcmlwdGlvblNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBkaXJuYW1lLCBqb2luIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVGb3VuZHJ5TG9jYWxSdW50aW1lIH0gZnJvbSAnLi9mb3VuZHJ5TG9jYWxSdW50aW1lLmpzJztcbmltcG9ydCB7XG5cdElMb2NhbFRyYW5zY3JpcHRpb25Nb2RlbFN0YXR1cyxcblx0SUxvY2FsVHJhbnNjcmlwdGlvblJlc3VsdCxcblx0SUxvY2FsVHJhbnNjcmlwdGlvblNlcnZpY2UsXG5cdERFRkFVTFRfTE9DQUxfVFJBTlNDUklQVElPTl9NT0RFTCxcblx0SUxvY2FsVHJhbnNjcmlwdGlvbk1vZGVsSW1wb3J0UmVzdWx0LFxuXHRMb2NhbFRyYW5zY3JpcHRpb25Nb2RlbFN0YXRlLFxufSBmcm9tICcuLi9jb21tb24vbG9jYWxUcmFuc2NyaXB0aW9uLmpzJztcbmltcG9ydCB7IGltcG9ydEZvdW5kcnlMb2NhbE1vZGVsIH0gZnJvbSAnLi9mb3VuZHJ5TG9jYWxNb2RlbEltcG9ydC5qcyc7XG5cbi8qKiBQQ00gYXVkaW8gZm9ybWF0IHRoZSByZW5kZXJlciBjYXB0dXJlcyBhbmQgc3RyZWFtczogbW9ubyAxNiBrSHogc2lnbmVkIDE2LWJpdC4gKi9cbmNvbnN0IFNBTVBMRV9SQVRFID0gMTYwMDA7XG5jb25zdCBDSEFOTkVMUyA9IDE7XG5jb25zdCBCSVRTX1BFUl9TQU1QTEUgPSAxNjtcblxuLyoqIEFwcGxpY2F0aW9uIG5hbWUgcmVwb3J0ZWQgdG8gRm91bmRyeSBMb2NhbCBmb3IgbG9ncy90ZWxlbWV0cnkgYW5kIGl0cyBkYXRhIGRpci4gKi9cbmNvbnN0IEZPVU5EUllfQVBQX05BTUUgPSAndnNjb2RlLWRpY3RhdGlvbic7XG5cbi8qKlxuICogRGlyZWN0b3J5IGhvbGRpbmcgdGhlIG9uLWRlbWFuZCBGb3VuZHJ5IExvY2FsIG5hdGl2ZSBydW50aW1lIChhZGRvbiArIGNvcmVcbiAqIGxpYnJhcmllcykuIERlcml2ZWQgYXMgYSBzaWJsaW5nIG9mIHRoZSBtb2RlbCBjYWNoZSBkaXIgc28gYm90aCBsaXZlIHVuZGVyIFZTXG4gKiBDb2RlJ3MgY2FjaGUgaG9tZTsga2VwdCBzZXBhcmF0ZSBmcm9tIG1vZGVsIGZpbGVzIHNpbmNlIGl0IGlzIHZlcnNpb25lZCBieSBTREtcbiAqIHZlcnNpb24gYW5kIHByb3Zpc2lvbmVkIGluZGVwZW5kZW50bHkuXG4gKi9cbmZ1bmN0aW9uIHJ1bnRpbWVDYWNoZURpcihtb2RlbENhY2hlRGlyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gam9pbihkaXJuYW1lKG1vZGVsQ2FjaGVEaXIpLCAnY2hhdERpY3RhdGlvblJ1bnRpbWUnKTtcbn1cblxuLyoqXG4gKiBGb3VuZHJ5IExvY2FsIEpTIFNESy4gSXQgaXMgYW4gRVNNIHBhY2thZ2UgdGhhdCBsb2FkcyBhIG5hdGl2ZSBhZGRvblxuICogKGBmb3VuZHJ5X2xvY2FsX25hcGkubm9kZWApIHBsdXMgdGhlIEZvdW5kcnkgTG9jYWwgQ29yZSAvIG9ubnhydW50aW1lIC9cbiAqIG9ubnhydW50aW1lLWdlbmFpIHNoYXJlZCBsaWJyYXJpZXMuIEltcG9ydCBpdCBsYXppbHkgc28gZm9ya2luZyB0aGUgdXRpbGl0eVxuICogcHJvY2VzcyBzdGF5cyBjaGVhcDsgdGhlIG1vZGVsIGl0c2VsZiBpcyBvbmx5IGRvd25sb2FkZWQvbG9hZGVkIHdoZW4gZGljdGF0aW9uXG4gKiBmaXJzdCBydW5zLlxuICovXG50eXBlIEZvdW5kcnlMb2NhbCA9IHR5cGVvZiBpbXBvcnQoJ2ZvdW5kcnktbG9jYWwtc2RrJyk7XG50eXBlIEZvdW5kcnlMb2NhbE1hbmFnZXIgPSBpbXBvcnQoJ2ZvdW5kcnktbG9jYWwtc2RrJykuRm91bmRyeUxvY2FsTWFuYWdlcjtcbnR5cGUgSU1vZGVsID0gaW1wb3J0KCdmb3VuZHJ5LWxvY2FsLXNkaycpLklNb2RlbDtcbnR5cGUgTGl2ZUF1ZGlvVHJhbnNjcmlwdGlvblNlc3Npb24gPSBpbXBvcnQoJ2ZvdW5kcnktbG9jYWwtc2RrJykuTGl2ZUF1ZGlvVHJhbnNjcmlwdGlvblNlc3Npb247XG50eXBlIExpdmVBdWRpb1RyYW5zY3JpcHRpb25SZXNwb25zZSA9IGltcG9ydCgnZm91bmRyeS1sb2NhbC1zZGsnKS5MaXZlQXVkaW9UcmFuc2NyaXB0aW9uUmVzcG9uc2U7XG5cbi8qKlxuICogTWFwIGEgcmF3IG1vZGVsIGRvd25sb2FkL2xvYWQgZXJyb3IgbWVzc2FnZSB0byBhIGZpeGVkLCBsb3ctY2FyZGluYWxpdHkgY29kZVxuICogc2FmZSB0byBlbWl0IGFzIHRlbGVtZXRyeS4gVGhlIHJhdyBtZXNzYWdlIGNhbiBjb250YWluIHBhdGhzLCBVUkxzLCBvciBvdGhlclxuICogZHluYW1pYyBkZXRhaWwsIHNvIG9ubHkgdGhlIHJldHVybmVkIGFsbG93bGlzdGVkIGNvZGUgc2hvdWxkIGJlIHJlcG9ydGVkLlxuICovXG5mdW5jdGlvbiBjbGFzc2lmeU1vZGVsRXJyb3IobWVzc2FnZTogc3RyaW5nKTogc3RyaW5nIHtcblx0Y29uc3QgdGV4dCA9IG1lc3NhZ2UudG9Mb3dlckNhc2UoKTtcblx0aWYgKC9cXGIoNDA0fG5vdCBmb3VuZHxubyBzdWNoIGZpbGV8ZG9lcyBub3QgZXhpc3R8Y291bGQgbm90IGxvY2F0ZXxyZXBvc2l0b3J5IG5vdCBmb3VuZHx1bmtub3duIG1vZGVsKVxcYi8udGVzdCh0ZXh0KSkge1xuXHRcdHJldHVybiAnbm90Rm91bmQnO1xuXHR9XG5cdGlmICgvXFxiKG5ldHdvcmt8ZmV0Y2h8ZWNvbm58ZW5vdGZvdW5kfGV0aW1lZG91dHxzb2NrZXR8ZG5zfG9mZmxpbmV8cHJveHl8dGxzfGNlcnRpZmljYXRlfGdldGFkZHJpbmZvfGZlZWQpXFxiLy50ZXN0KHRleHQpKSB7XG5cdFx0cmV0dXJuICduZXR3b3JrJztcblx0fVxuXHRpZiAoL1xcYihvdXQgb2YgbWVtb3J5fG9vbXxlbm9tZW18YWxsb2NhdGlvbiBmYWlsZWR8Y2Fubm90IGFsbG9jYXRlKVxcYi8udGVzdCh0ZXh0KSkge1xuXHRcdHJldHVybiAnbWVtb3J5Jztcblx0fVxuXHRpZiAoL1xcYihlbm9zcGN8bm8gc3BhY2UgbGVmdHxkaXNrKVxcYi8udGVzdCh0ZXh0KSkge1xuXHRcdHJldHVybiAnZGlzayc7XG5cdH1cblx0aWYgKC9cXGIoZWFjY2VzfGVwZXJtfHBlcm1pc3Npb24gZGVuaWVkfGFjY2VzcyBpcyBkZW5pZWQpXFxiLy50ZXN0KHRleHQpKSB7XG5cdFx0cmV0dXJuICdwZXJtaXNzaW9uJztcblx0fVxuXHRyZXR1cm4gJ3Vua25vd24nO1xufVxuXG4vKipcbiAqIENob29zZSB0aGUgc2VwYXJhdG9yIHRvIHBsYWNlIGJldHdlZW4gdHdvIHRyYW5zY3JpcHQgZnJhZ21lbnRzLiBNaXJyb3JzIHRoZVxuICogR2l0SHViIENvcGlsb3QgYXBwJ3Mgam9pbmluZyBydWxlOiBubyBzcGFjZSBpZiB0aGUgbGVmdCBhbHJlYWR5IGVuZHMgaW4gYW5cbiAqIG9wZW5lci93aGl0ZXNwYWNlIG9yIHRoZSByaWdodCBiZWdpbnMgd2l0aCB3aGl0ZXNwYWNlIG9yIGNsb3NpbmcgcHVuY3R1YXRpb24sXG4gKiBvdGhlcndpc2UgYSBzaW5nbGUgc3BhY2UuXG4gKi9cbmZ1bmN0aW9uIHRyYW5zY3JpcHRTZXBhcmF0b3IoY3VycmVudDogc3RyaW5nLCBuZXh0OiBzdHJpbmcpOiAnJyB8ICcgJyB7XG5cdGlmICghY3VycmVudCB8fCAhbmV4dCB8fCAvW1xccyhbe10kLy50ZXN0KGN1cnJlbnQpIHx8IC9eXFxzfF5bLC47OiE/KX1cXF0nXCJdLy50ZXN0KG5leHQpKSB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cdHJldHVybiAnICc7XG59XG5cbi8qKlxuICogQXBwZW5kIGEgbm9uLWZpbmFsIChpbnRlcmltKSB0cmFuc2NyaXB0IGNodW5rIHRvIHRoZSBjdXJyZW50IHBhcnRpYWwgdGV4dC5cbiAqIEZvdW5kcnkgTG9jYWwgZW1pdHMgaW50ZXJpbSByZXN1bHRzIGZvciB0aGUgaW4tcHJvZ3Jlc3Mgc2VnbWVudCBhcyAqZGVsdGFzKiBcdTIwMTRcbiAqIGVhY2ggY2FycmllcyBvbmx5IHRoZSBuZXdseSByZWNvZ25pemVkIHRleHQgKHdpdGggaXRzIG93biBsZWFkaW5nL3RyYWlsaW5nXG4gKiBzcGFjaW5nKSwgTk9UIHRoZSBjdW11bGF0aXZlIHBhcnRpYWwgc28gZmFyIFx1MjAxNCBzbyB0aGV5IG11c3QgYmUgY29uY2F0ZW5hdGVkXG4gKiB2ZXJiYXRpbSByYXRoZXIgdGhhbiByZXBsYWNlZC4gUmVwbGFjaW5nIHdvdWxkIGRyb3AgZWFybGllciBwYXJ0aWFsIHdvcmRzXG4gKiAoZS5nLiBpbnRlcmltIFwiaGVsbG9cIiB0aGVuIFwiIHdvcmxkXCIgbXVzdCB5aWVsZCBcImhlbGxvIHdvcmxkXCIsIG5vdCBcIndvcmxkXCIpLlxuICogTWlycm9ycyB0aGUgR2l0SHViIENvcGlsb3QgYXBwJ3MgYGFwcGVuZFZvaWNlVHJhbnNjcmlwdENodW5rYC5cbiAqL1xuZnVuY3Rpb24gYXBwZW5kVHJhbnNjcmlwdENodW5rKGN1cnJlbnQ6IHN0cmluZywgbmV4dDogc3RyaW5nKTogc3RyaW5nIHtcblx0aWYgKCFuZXh0LnRyaW0oKSkge1xuXHRcdHJldHVybiBjdXJyZW50O1xuXHR9XG5cdGlmICghY3VycmVudCkge1xuXHRcdHJldHVybiBuZXh0LnRyaW1TdGFydCgpO1xuXHR9XG5cdHJldHVybiBgJHtjdXJyZW50fSR7bmV4dH1gO1xufVxuXG5pbnRlcmZhY2UgSUZpbmFsU2VnbWVudCB7XG5cdHJlYWRvbmx5IG9yZGVyOiBudW1iZXI7XG5cdHJlYWRvbmx5IHN0YXJ0VGltZTogbnVtYmVyIHwgbnVsbDtcblx0cmVhZG9ubHkgZW5kVGltZTogbnVtYmVyIHwgbnVsbDtcblx0dGV4dDogc3RyaW5nO1xufVxuXG4vKipcbiAqIEFjY3VtdWxhdGVzIHRoZSBjdW11bGF0aXZlIHRyYW5zY3JpcHQgZnJvbSBGb3VuZHJ5IExvY2FsJ3MgcGVyLXNlZ21lbnRcbiAqIHN0cmVhbWluZyByZXN1bHRzLiBGb3VuZHJ5IGVtaXRzIHJlc3VsdHMgd2hvc2UgdGV4dCBpcyBzY29wZWQgdG8gYSBzaW5nbGVcbiAqIGVuZHBvaW50ZWQgc2VnbWVudCAoTk9UIHRoZSB3aG9sZSBzZXNzaW9uKSwgYW5kIHJlLWVtaXRzIHRoZSBzYW1lIHNlZ21lbnRcbiAqIG11bHRpcGxlIHRpbWVzIGFzIGl0IHJlZmluZXMgdGhlIGh5cG90aGVzaXMgXHUyMDE0IHNvIGZpbmFsaXplZCBzZWdtZW50cyBtdXN0IGJlXG4gKiBrZXllZCAoYnkgdGhlaXIgc3RhcnQvZW5kIHRpbWUpIGFuZCByZXBsYWNlZCBvbiByZWZpbmVtZW50LCB0aGVuIHRoZSBkaXN0aW5jdFxuICogc2VnbWVudHMgam9pbmVkIGluIHRpbWUgb3JkZXIuIEJsaW5kbHkgYXBwZW5kaW5nIGV2ZXJ5IGBpc19maW5hbGAgcmVzdWx0IHdvdWxkXG4gKiBkdXBsaWNhdGUgd29yZHMuIE1pcnJvcnMgdGhlIEdpdEh1YiBDb3BpbG90IGFwcCdzIGBWb2ljZVRyYW5zY3JpcHRBY2N1bXVsYXRvcmAuXG4gKi9cbmNsYXNzIFRyYW5zY3JpcHRBY2N1bXVsYXRvciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlZ21lbnRzID0gbmV3IE1hcDxzdHJpbmcsIElGaW5hbFNlZ21lbnQ+KCk7XG5cdHByaXZhdGUgX25leHRPcmRlciA9IDA7XG5cblx0LyoqIFJlY29yZCBhIGZpbmFsaXplZCBzZWdtZW50LCByZXBsYWNpbmcgYW4gZWFybGllciByZXZpc2lvbiBvZiB0aGUgc2FtZSBvbmUuICovXG5cdGFkZEZpbmFsKHRleHQ6IHN0cmluZywgc3RhcnRUaW1lOiBudW1iZXIgfCBudWxsLCBlbmRUaW1lOiBudW1iZXIgfCBudWxsKTogdm9pZCB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IHRleHQudHJpbSgpO1xuXHRcdGlmICghbm9ybWFsaXplZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBrZXkgPSAoc3RhcnRUaW1lICE9PSBudWxsIHx8IGVuZFRpbWUgIT09IG51bGwpXG5cdFx0XHQ/IGAke3N0YXJ0VGltZSA/PyAnbmEnfToke2VuZFRpbWUgPz8gJ25hJ31gXG5cdFx0XHQ6IGB1bnRpbWVkOiR7dGhpcy5fbmV4dE9yZGVyfWA7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9zZWdtZW50cy5nZXQoa2V5KTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdGV4aXN0aW5nLnRleHQgPSBub3JtYWxpemVkO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zZWdtZW50cy5zZXQoa2V5LCB7IG9yZGVyOiB0aGlzLl9uZXh0T3JkZXIsIHN0YXJ0VGltZSwgZW5kVGltZSwgdGV4dDogbm9ybWFsaXplZCB9KTtcblx0XHR0aGlzLl9uZXh0T3JkZXIrKztcblx0fVxuXG5cdC8qKiBUaGUgY3VtdWxhdGl2ZSBmaW5hbGl6ZWQgdHJhbnNjcmlwdCwgc2VnbWVudHMgam9pbmVkIGluIHRpbWUgb3JkZXIuICovXG5cdGdldFRleHQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX3NlZ21lbnRzLnZhbHVlcygpXVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IHtcblx0XHRcdFx0aWYgKGEuc3RhcnRUaW1lICE9PSBudWxsICYmIGIuc3RhcnRUaW1lICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGEuc3RhcnRUaW1lIC0gYi5zdGFydFRpbWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGEuc3RhcnRUaW1lICE9PSBudWxsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChiLnN0YXJ0VGltZSAhPT0gbnVsbCkge1xuXHRcdFx0XHRcdHJldHVybiAxO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBhLm9yZGVyIC0gYi5vcmRlcjtcblx0XHRcdH0pXG5cdFx0XHQucmVkdWNlKCh0ZXh0LCBzZWcpID0+IGAke3RleHR9JHt0cmFuc2NyaXB0U2VwYXJhdG9yKHRleHQsIHNlZy50ZXh0KX0ke3NlZy50ZXh0fWAsICcnKVxuXHRcdFx0LnRyaW0oKTtcblx0fVxuXG5cdHJlc2V0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlZ21lbnRzLmNsZWFyKCk7XG5cdFx0dGhpcy5fbmV4dE9yZGVyID0gMDtcblx0fVxufVxuXG4vKipcbiAqIE9uLWRldmljZSBzcGVlY2gtdG8tdGV4dCBiYWNrZWQgYnkgRm91bmRyeSBMb2NhbCdzIHN0cmVhbWluZyBBU1IgZW5naW5lLiBSdW5zXG4gKiBpbiBhIHV0aWxpdHkgcHJvY2Vzcy4gQSBzaW5nbGUgdHJhbnNjcmlwdGlvbiBzZXNzaW9uIGlzIGFjdGl2ZSBhdCBhIHRpbWVcbiAqIChkaWN0YXRpb24gaXMgYSBzaW5nbGV0b24gaW4gdGhlIHJlbmRlcmVyKTogdGhlIHJlbmRlcmVyIHN0cmVhbXMgUENNMTYgbW9ub1xuICogMTYga0h6IGF1ZGlvIHZpYSBgcHVzaEF1ZGlvYCwgYW5kIHRoZSBzZXJ2aWNlIGVtaXRzIGludGVyaW0gdHJhbnNjcmlwdHMgb25cbiAqIGBvbkRpZFRyYW5zY3JpYmVgIGFuZCBhIGZpbmFsIG9uZSBhZnRlciBgc3RvcGAuXG4gKi9cbmV4cG9ydCBjbGFzcyBMb2NhbFRyYW5zY3JpcHRpb25TZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElMb2NhbFRyYW5zY3JpcHRpb25TZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBpc1N1cHBvcnRlZCA9IHRydWU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VNb2RlbFN0YXR1cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElMb2NhbFRyYW5zY3JpcHRpb25Nb2RlbFN0YXR1cz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxTdGF0dXM6IEV2ZW50PElMb2NhbFRyYW5zY3JpcHRpb25Nb2RlbFN0YXR1cz4gPSB0aGlzLl9vbkRpZENoYW5nZU1vZGVsU3RhdHVzLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVHJhbnNjcmliZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElMb2NhbFRyYW5zY3JpcHRpb25SZXN1bHQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZFRyYW5zY3JpYmU6IEV2ZW50PElMb2NhbFRyYW5zY3JpcHRpb25SZXN1bHQ+ID0gdGhpcy5fb25EaWRUcmFuc2NyaWJlLmV2ZW50O1xuXG5cdHByaXZhdGUgX3N0YXR1czogSUxvY2FsVHJhbnNjcmlwdGlvbk1vZGVsU3RhdHVzID0geyBzdGF0ZTogTG9jYWxUcmFuc2NyaXB0aW9uTW9kZWxTdGF0ZS5JZGxlIH07XG5cblx0cHJpdmF0ZSBfc2RrOiBGb3VuZHJ5TG9jYWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX21hbmFnZXI6IEZvdW5kcnlMb2NhbE1hbmFnZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX21vZGVsOiBJTW9kZWwgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xvYWRlZE1vZGVsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0LyoqIEluLWZsaWdodCAob3IgcmVzb2x2ZWQpIG1vZGVsIGRvd25sb2FkK2xvYWQgZm9yIHRoZSBzZWxlY3RlZCBtb2RlbC4gKi9cblx0cHJpdmF0ZSBfbW9kZWxQcm9taXNlOiBQcm9taXNlPElNb2RlbD4gfCB1bmRlZmluZWQ7XG5cdC8qKiBDYW5jZWxsYXRpb24gc291cmNlIGZvciB0aGUgaW4tZmxpZ2h0IG1vZGVsIGRvd25sb2FkL2xvYWQ7IGFib3J0cyBpdCB3aGVuIGNhbmNlbGxlZC4gKi9cblx0cHJpdmF0ZSBfbW9kZWxQcmVwYXJlQ3RzOiBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogV2hlcmUgdG8gZG93bmxvYWQgdGhlIG5hdGl2ZSBydW50aW1lIGZyb20gKHByb2R1Y3QuZGljdGF0aW9uUnVudGltZSksIG9yXG5cdCAqIGB1bmRlZmluZWRgIGluIGRldiBidWlsZHMgd2hlcmUgdGhlIFNESydzIG93biBub2RlX21vZHVsZXMgcGF5bG9hZCBpcyB1c2VkLlxuXHQgKi9cblx0cHJpdmF0ZSBfcnVudGltZURvd25sb2FkOiB7IHVybFRlbXBsYXRlOiBzdHJpbmc7IHZlcnNpb246IHN0cmluZyB9IHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBUaGUgYWN0aXZlIHN0cmVhbWluZyBzZXNzaW9uLCBvbmNlIGBzdGFydCgpYCBoYXMgb3BlbmVkIGl0LiAqL1xuXHRwcml2YXRlIF9zZXNzaW9uOiBMaXZlQXVkaW9UcmFuc2NyaXB0aW9uU2Vzc2lvbiB8IHVuZGVmaW5lZDtcblx0LyoqIFJlc29sdmVzIHdoZW4gdGhlIGJhY2tncm91bmQgc3RyZWFtIGNvbnN1bWVyIGZvciBgX3Nlc3Npb25gIGhhcyBkcmFpbmVkLiAqL1xuXHRwcml2YXRlIF9jb25zdW1lUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0LyoqIEluLWZsaWdodCBtb2RlbCBkb3dubG9hZC9sb2FkICsgc2Vzc2lvbiBvcGVuIGZvciB0aGUgYWN0aXZlIHJlY29yZGluZy4gKi9cblx0cHJpdmF0ZSBfb3BlblByb21pc2U6IFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3Nlc3Npb25BY3RpdmUgPSBmYWxzZTtcblxuXHQvKiogQ3VtdWxhdGl2ZSBmaW5hbGl6ZWQgdHJhbnNjcmlwdCwgYWNjdW11bGF0ZWQgcGVyIHRpbWVkIHNlZ21lbnQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjY3VtdWxhdG9yID0gbmV3IFRyYW5zY3JpcHRBY2N1bXVsYXRvcigpO1xuXHQvKiogTGF0ZXN0IGludGVyaW0gKG5vdC15ZXQtZmluYWxpemVkKSBzZWdtZW50IHRleHQuICovXG5cdHByaXZhdGUgX3BhcnRpYWxUZXh0ID0gJyc7XG5cdC8qKlxuXHQgKiBTZXQgd2hlbiB0aGUgbmF0aXZlIHN0cmVhbWluZyBzZXNzaW9uIGZhaWxzIG1pZC1yZWNvcmRpbmcgKGl0cyByZXN1bHRcblx0ICogc3RyZWFtIHRocm93cykuIGBzdG9wKClgIHJldGhyb3dzIHRoaXMgc28gdGhlIHJlbmRlcmVyIHRyZWF0cyB0aGUgc2Vzc2lvblxuXHQgKiBhcyBmYWlsZWQgaW5zdGVhZCBvZiByZXBvcnRpbmcgdGhlIHBhcnRpYWwgdHJhbnNjcmlwdCBhcyBhIHN1Y2Nlc3MuXG5cdCAqL1xuXHRwcml2YXRlIF9ydW50aW1lRXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBQQ00gY2h1bmtzIGNhcHR1cmVkIGJlZm9yZSB0aGUgbW9kZWwgZmluaXNoZWQgbG9hZGluZyBhbmQgdGhlIHNlc3Npb25cblx0ICogb3BlbmVkLiBGbHVzaGVkIGluIG9yZGVyIG9uY2UgdGhlIHNlc3Npb24gc3RhcnRzIHNvIG5vIGxlYWRpbmcgYXVkaW8gaXNcblx0ICogZHJvcHBlZCB3aGlsZSB0aGUgZmlyc3QtdXNlIGRvd25sb2FkL2xvYWQgY29tcGxldGVzLlxuXHQgKi9cblx0cHJpdmF0ZSBfcGVuZGluZ0NodW5rczogVWludDhBcnJheVtdID0gW107XG5cblx0LyoqXG5cdCAqIFNlcmlhbGl6ZXMgZXZlcnkgYHNlc3Npb24uYXBwZW5kKClgIHRocm91Z2ggYSBzaW5nbGUgRklGTyBjaGFpbi4gQm90aCB0aGVcblx0ICogYnVmZmVyZWQtYmFja2xvZyBmbHVzaCBhbmQgbGl2ZSBgcHVzaEF1ZGlvKClgIGVucXVldWUgaGVyZSwgc28gYXVkaW8gaXNcblx0ICogYWx3YXlzIGFwcGVuZGVkIHRvIG5hdGl2ZSBjb3JlIGluIGNhcHR1cmUgb3JkZXIgXHUyMDE0IGV2ZW4gYWNyb3NzIHRoZSBmaXJzdC11c2Vcblx0ICogaGFuZG9mZiBcdTIwMTQgYW5kIGBzdG9wKClgIGNhbiBhd2FpdCB0aGlzIHRvIGd1YXJhbnRlZSB0aGUgZmluYWwgY2h1bmsgbGFuZHNcblx0ICogYmVmb3JlIGBzZXNzaW9uLnN0b3AoKWAgZHJhaW5zIHRoZSBzdHJlYW0uIFRoZSBzdG9yZWQgdGFpbCBzd2FsbG93c1xuXHQgKiByZWplY3Rpb25zIHNvIG9uZSBmYWlsZWQgYXBwZW5kIGRvZXNuJ3QgYnJlYWsgb3JkZXJpbmcgZm9yIHRoZSByZXN0OyB0aGVcblx0ICogcmVhbCAocmVqZWN0YWJsZSkgcHJvbWlzZSBpcyByZXR1cm5lZCB0byBjYWxsZXJzIHRoYXQgbmVlZCB0byBvYnNlcnZlIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfYXBwZW5kQ2hhaW46IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUoKTtcblxuXHQvKipcblx0ICogTW9ub3RvbmljYWxseSBidW1wZWQgd2hlbmV2ZXIgYSBzZXNzaW9uIHN0YXJ0cyBvciBpcyByZXNldCwgc28gYSBzbG93XG5cdCAqIHNlc3Npb24gb3BlbmVkIGZvciBvbmUgcmVjb3JkaW5nIGNhbiBkZXRlY3QgdGhhdCBpdCBpcyBub3cgc3RhbGUgYW5kIGF2b2lkXG5cdCAqIGVtaXR0aW5nIGl0cyB0cmFuc2NyaXB0IGludG8gYSBsYXRlciBzZXNzaW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfZ2VuZXJhdGlvbiA9IDA7XG5cblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoKTtcblx0XHQvLyBUZWFyIGRvd24gdGhlIGFjdGl2ZSBzZXNzaW9uIChhbmQgaXRzIG5hdGl2ZSBBU1IgcmVzb3VyY2VzKSB3aGVuIHRoZVxuXHRcdC8vIHNlcnZpY2UgXHUyMDE0IGFuZCBpdHMgdXRpbGl0eSBwcm9jZXNzIFx1MjAxNCBnb2VzIGF3YXkuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHZvaWQgdGhpcy5fZGlzcG9zZVNlc3Npb24oKTtcblx0XHRcdHRoaXMuX21vZGVsUHJlcGFyZUN0cz8uY2FuY2VsKCk7XG5cdFx0XHR0aGlzLl9tb2RlbFByZXBhcmVDdHM/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMuX21vZGVsUHJlcGFyZUN0cyA9IHVuZGVmaW5lZDtcblx0XHR9KSk7XG5cdH1cblxuXHRhc3luYyBnZXRNb2RlbFN0YXR1cygpOiBQcm9taXNlPElMb2NhbFRyYW5zY3JpcHRpb25Nb2RlbFN0YXR1cz4ge1xuXHRcdHJldHVybiB0aGlzLl9zdGF0dXM7XG5cdH1cblxuXHRpbXBvcnRNb2RlbChvcHRpb25zOiB7IHNvdXJjZVBhdGg6IHN0cmluZzsgY2FjaGVEaXI6IHN0cmluZyB9KTogUHJvbWlzZTxJTG9jYWxUcmFuc2NyaXB0aW9uTW9kZWxJbXBvcnRSZXN1bHQ+IHtcblx0XHRyZXR1cm4gaW1wb3J0Rm91bmRyeUxvY2FsTW9kZWwob3B0aW9ucy5zb3VyY2VQYXRoLCBvcHRpb25zLmNhY2hlRGlyKTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFN0YXR1cyhzdGF0dXM6IElMb2NhbFRyYW5zY3JpcHRpb25Nb2RlbFN0YXR1cyk6IHZvaWQge1xuXHRcdHRoaXMuX3N0YXR1cyA9IHN0YXR1cztcblx0XHR0aGlzLl9vbkRpZENoYW5nZU1vZGVsU3RhdHVzLmZpcmUoc3RhdHVzKTtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0KG9wdGlvbnM6IHsgY2FjaGVEaXI6IHN0cmluZzsgbW9kZWw/OiBzdHJpbmc7IGxhbmd1YWdlPzogc3RyaW5nOyBwcm94eVVybD86IHN0cmluZzsgbm9Qcm94eT86IHN0cmluZzsgcHJveHlTdHJpY3RTU0w/OiBib29sZWFuOyBwcm94eUF1dGhvcml6YXRpb24/OiBzdHJpbmc7IHJ1bnRpbWVVcmxUZW1wbGF0ZT86IHN0cmluZzsgcnVudGltZVZlcnNpb24/OiBzdHJpbmcgfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIEJyaWRnZSBWUyBDb2RlJ3MgcHJveHkgc2V0dGluZ3MgaW50byB0aGlzIHByb2Nlc3MncyBlbnZpcm9ubWVudCBiZWZvcmUgYW55XG5cdFx0Ly8gZmlyc3QtdXNlIGRvd25sb2FkLCBzbyBib3RoIG91ciBvd24gZmV0Y2hlcyBhbmQgdGhlIG5hdGl2ZSBGb3VuZHJ5IExvY2FsXG5cdFx0Ly8gbW9kZWwgZG93bmxvYWQgcm91dGUgdGhyb3VnaCB0aGUgY29uZmlndXJlZCBwcm94eSAodGhleSByZWFkIHRoZSBPUy9lbnZcblx0XHQvLyBwcm94eSwgbm90IFZTIENvZGUgc2V0dGluZ3MgZGlyZWN0bHkpLlxuXHRcdHRoaXMuX2FwcGx5UHJveHlFbnYob3B0aW9ucy5wcm94eVVybCwgb3B0aW9ucy5ub1Byb3h5LCBvcHRpb25zLnByb3h5U3RyaWN0U1NMLCBvcHRpb25zLnByb3h5QXV0aG9yaXphdGlvbik7XG5cblx0XHQvLyBSZWNvcmQgd2hlcmUgdGhlIG5hdGl2ZSBydW50aW1lIGlzIHB1Ymxpc2hlZCAoZnJvbSBwcm9kdWN0Lmpzb24pLiBXaGVuXG5cdFx0Ly8gdW5zZXQgKGRldiBidWlsZHMpLCB0aGUgU0RLJ3Mgb3duIG5vZGVfbW9kdWxlcyBwYXlsb2FkIGlzIHVzZWQgaW5zdGVhZC5cblx0XHR0aGlzLl9ydW50aW1lRG93bmxvYWQgPSBvcHRpb25zLnJ1bnRpbWVVcmxUZW1wbGF0ZSAmJiBvcHRpb25zLnJ1bnRpbWVWZXJzaW9uXG5cdFx0XHQ/IHsgdXJsVGVtcGxhdGU6IG9wdGlvbnMucnVudGltZVVybFRlbXBsYXRlLCB2ZXJzaW9uOiBvcHRpb25zLnJ1bnRpbWVWZXJzaW9uIH1cblx0XHRcdDogdW5kZWZpbmVkO1xuXG5cdFx0Ly8gUmVzZXQgYW55IHByaW9yIHNlc3Npb24gYmVmb3JlIHN0YXJ0aW5nIGEgbmV3IG9uZS5cblx0XHRhd2FpdCB0aGlzLl9kaXNwb3NlU2Vzc2lvbigpO1xuXHRcdHRoaXMuX2dlbmVyYXRpb24rKztcblx0XHRjb25zdCBnZW5lcmF0aW9uID0gdGhpcy5fZ2VuZXJhdGlvbjtcblx0XHR0aGlzLl9zZXNzaW9uQWN0aXZlID0gdHJ1ZTtcblx0XHR0aGlzLl9hY2N1bXVsYXRvci5yZXNldCgpO1xuXHRcdHRoaXMuX3BhcnRpYWxUZXh0ID0gJyc7XG5cdFx0dGhpcy5fcGVuZGluZ0NodW5rcyA9IFtdO1xuXHRcdHRoaXMuX3J1bnRpbWVFcnJvciA9IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IG1vZGVsID0gb3B0aW9ucy5tb2RlbCA/PyBERUZBVUxUX0xPQ0FMX1RSQU5TQ1JJUFRJT05fTU9ERUw7XG5cdFx0Y29uc3QgbGFuZ3VhZ2UgPSBvcHRpb25zLmxhbmd1YWdlO1xuXHRcdC8vIERvIG5vdCBibG9jayBjYXB0dXJlIG9uIHRoZSAocG9zc2libHkgZmlyc3QtdXNlKSBtb2RlbCBkb3dubG9hZC9sb2FkIGFuZFxuXHRcdC8vIHNlc3Npb24gb3BlbjsgYnVmZmVyIGF1ZGlvIHVudGlsIHRoZSBzZXNzaW9uIGlzIHJlYWR5LCB0aGVuIGZsdXNoIGl0LlxuXHRcdHRoaXMuX29wZW5Qcm9taXNlID0gdGhpcy5fb3BlblNlc3Npb24ob3B0aW9ucy5jYWNoZURpciwgbW9kZWwsIGxhbmd1YWdlLCBnZW5lcmF0aW9uKTtcblx0XHR0aGlzLl9vcGVuUHJvbWlzZS5jYXRjaCgoKSA9PiB7IC8qIHN0YXR1cyBhbHJlYWR5IHJlcG9ydGVkICovIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGx5IFZTIENvZGUncyBwcm94eSBzZXR0aW5ncyBhcyBlbnZpcm9ubWVudCB2YXJpYWJsZXMgZm9yIHRoaXMgcHJvY2Vzcywgc29cblx0ICogZXZlcnkgZG93bmxvYWQgbGVnIChvdXIgZmV0Y2hlcyBhbmQgdGhlIG5hdGl2ZSBtb2RlbCBkb3dubG9hZCkgaG9ub3JzIGEgcHJveHlcblx0ICogY29uZmlndXJlZCBvbmx5IGluIFZTIENvZGUgKG5vdCBpbiB0aGUgT1MgZW52aXJvbm1lbnQpOlxuXHQgKiAtIGBodHRwLnByb3h5YC9gaHR0cC5ub1Byb3h5YCBcdTIxOTIgYEhUVFBTX1BST1hZYC9gSFRUUF9QUk9YWWAvYE5PX1BST1hZYC5cblx0ICogLSBgaHR0cC5wcm94eUF1dGhvcml6YXRpb25gIChhIGBCYXNpYyA8YmFzZTY0PmAgdmFsdWUpIFx1MjE5MiBmb2xkZWQgaW50byB0aGUgcHJveHlcblx0ICogICBVUkwncyB1c2VyaW5mbyBzbyBib3RoIG91ciBgSHR0cHNQcm94eUFnZW50YCBhbmQgdGhlIG5hdGl2ZSBIVFRQIHN0YWNrIHNlbmRcblx0ICogICBgUHJveHktQXV0aG9yaXphdGlvbmAuIE5vbi1gQmFzaWNgIHNjaGVtZXMgKGUuZy4gTmVnb3RpYXRlL05UTE0pIGNhbm5vdCBiZVxuXHQgKiAgIGNhcnJpZWQgdGhpcyB3YXkgYW5kIGFyZSBsZWZ0IHRvIE9TLWxldmVsIGF1dGguXG5cdCAqIC0gYGh0dHAucHJveHlTdHJpY3RTU0wgPT09IGZhbHNlYCBcdTIxOTIgZGlzYWJsZSBUTFMgY2VydGlmaWNhdGUgdmVyaWZpY2F0aW9uIGZvclxuXHQgKiAgIHRoZSBOb2RlIGRvd25sb2FkIGxlZ3MuIFRoZSBuYXRpdmUgbW9kZWwgbGVnIHN0aWxsIHJlcXVpcmVzIHRoZSBDQSBpbiB0aGUgT1Ncblx0ICogICB0cnVzdCBzdG9yZS5cblx0ICpcblx0ICogQSBibGFuay91bmRlZmluZWQgYHByb3h5VXJsYCBsZWF2ZXMgYW55IGluaGVyaXRlZCBlbnZpcm9ubWVudCBwcm94eSB1bnRvdWNoZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9hcHBseVByb3h5RW52KHByb3h5VXJsOiBzdHJpbmcgfCB1bmRlZmluZWQsIG5vUHJveHk6IHN0cmluZyB8IHVuZGVmaW5lZCwgcHJveHlTdHJpY3RTU0w6IGJvb2xlYW4gfCB1bmRlZmluZWQsIHByb3h5QXV0aG9yaXphdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHByb3h5U3RyaWN0U1NMID09PSBmYWxzZSkge1xuXHRcdFx0Ly8gQ292ZXJzIGJvdGggTm9kZSBsZWdzIHVuaWZvcm1seSAob3VyIGZldGNoIGFuZCB0aGUgU0RLJ3MgYmFyZVxuXHRcdFx0Ly8gYGh0dHBzLmdldGAgTnVHZXQgaW5zdGFsbCk7IHNjb3BlZCB0byB0aGlzIGRlZGljYXRlZCB1dGlsaXR5IHByb2Nlc3MuXG5cdFx0XHRwcm9jZXNzLmVudi5OT0RFX1RMU19SRUpFQ1RfVU5BVVRIT1JJWkVEID0gJzAnO1xuXHRcdH1cblx0XHRpZiAoIXByb3h5VXJsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGVmZmVjdGl2ZVByb3h5VXJsID0gdGhpcy5fZW1iZWRQcm94eUNyZWRlbnRpYWxzKHByb3h5VXJsLCBwcm94eUF1dGhvcml6YXRpb24pO1xuXHRcdHByb2Nlc3MuZW52LkhUVFBTX1BST1hZID0gZWZmZWN0aXZlUHJveHlVcmw7XG5cdFx0cHJvY2Vzcy5lbnYuSFRUUF9QUk9YWSA9IGVmZmVjdGl2ZVByb3h5VXJsO1xuXHRcdGlmIChub1Byb3h5KSB7XG5cdFx0XHRwcm9jZXNzLmVudi5OT19QUk9YWSA9IG5vUHJveHk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZvbGQgYSBgQmFzaWMgPGJhc2U2ND5gIGBodHRwLnByb3h5QXV0aG9yaXphdGlvbmAgdmFsdWUgaW50byBgcHJveHlVcmxgJ3Ncblx0ICogdXNlcmluZm8gc28gcHJveHkgY3JlZGVudGlhbHMgc3Vydml2ZSB0aGUgZW52LXZhciBicmlkZ2UgdG8gZXZlcnkgbGVnLlxuXHQgKiBSZXR1cm5zIGBwcm94eVVybGAgdW5jaGFuZ2VkIHdoZW4gdGhlcmUgaXMgbm90aGluZyB0byBhZGQgb3IgdGhlIGhlYWRlciBpc1xuXHQgKiBub3QgYSBkZWNvZGFibGUgYEJhc2ljYCBjcmVkZW50aWFsIG9yIHRoZSBVUkwgYWxyZWFkeSBjYXJyaWVzIGNyZWRlbnRpYWxzLlxuXHQgKi9cblx0cHJpdmF0ZSBfZW1iZWRQcm94eUNyZWRlbnRpYWxzKHByb3h5VXJsOiBzdHJpbmcsIHByb3h5QXV0aG9yaXphdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHtcblx0XHRpZiAoIXByb3h5QXV0aG9yaXphdGlvbikge1xuXHRcdFx0cmV0dXJuIHByb3h5VXJsO1xuXHRcdH1cblx0XHRjb25zdCBiYXNpYyA9IC9eQmFzaWNcXHMrKD88dG9rZW4+W0EtWmEtejAtOSsvPV0rKSQvaS5leGVjKHByb3h5QXV0aG9yaXphdGlvbi50cmltKCkpO1xuXHRcdGlmICghYmFzaWM/Lmdyb3Vwcz8udG9rZW4pIHtcblx0XHRcdHJldHVybiBwcm94eVVybDtcblx0XHR9XG5cdFx0bGV0IHBhcnNlZDogVVJMO1xuXHRcdHRyeSB7XG5cdFx0XHRwYXJzZWQgPSBuZXcgVVJMKHByb3h5VXJsKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBwcm94eVVybDtcblx0XHR9XG5cdFx0aWYgKHBhcnNlZC51c2VybmFtZSB8fCBwYXJzZWQucGFzc3dvcmQpIHtcblx0XHRcdHJldHVybiBwcm94eVVybDtcblx0XHR9XG5cdFx0Y29uc3QgZGVjb2RlZCA9IEJ1ZmZlci5mcm9tKGJhc2ljLmdyb3Vwcy50b2tlbiwgJ2Jhc2U2NCcpLnRvU3RyaW5nKCd1dGY4Jyk7XG5cdFx0Y29uc3Qgc2VwYXJhdG9yID0gZGVjb2RlZC5pbmRleE9mKCc6Jyk7XG5cdFx0aWYgKHNlcGFyYXRvciA8IDApIHtcblx0XHRcdHJldHVybiBwcm94eVVybDtcblx0XHR9XG5cdFx0cGFyc2VkLnVzZXJuYW1lID0gZW5jb2RlVVJJQ29tcG9uZW50KGRlY29kZWQuc2xpY2UoMCwgc2VwYXJhdG9yKSk7XG5cdFx0cGFyc2VkLnBhc3N3b3JkID0gZW5jb2RlVVJJQ29tcG9uZW50KGRlY29kZWQuc2xpY2Uoc2VwYXJhdG9yICsgMSkpO1xuXHRcdHJldHVybiBwYXJzZWQudG9TdHJpbmcoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFbnN1cmUgdGhlIEZvdW5kcnkgTG9jYWwgbWFuYWdlciBleGlzdHMsIHRoZSBzZWxlY3RlZCBtb2RlbCBpcyBkb3dubG9hZGVkXG5cdCAqIGFuZCBsb2FkZWQsIGFuZCBhIGZyZXNoIGxpdmUgdHJhbnNjcmlwdGlvbiBzZXNzaW9uIGlzIHN0YXJ0ZWQuIEJ1ZmZlcmVkXG5cdCAqIGF1ZGlvIGNhcHR1cmVkIHdoaWxlIHRoaXMgd2FzIGluIGZsaWdodCBpcyBmbHVzaGVkIG9uY2UgdGhlIHNlc3Npb24gb3BlbnMuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9vcGVuU2Vzc2lvbihjYWNoZURpcjogc3RyaW5nLCBtb2RlbElkOiBzdHJpbmcsIGxhbmd1YWdlOiBzdHJpbmcgfCB1bmRlZmluZWQsIGdlbmVyYXRpb246IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGF3YWl0IHRoaXMuX2Vuc3VyZU1vZGVsKGNhY2hlRGlyLCBtb2RlbElkKTtcblx0XHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLl9nZW5lcmF0aW9uKSB7XG5cdFx0XHRcdHJldHVybjsgLy8gc3VwZXJzZWRlZCBieSBhIG5ld2VyIHNlc3Npb25cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYXVkaW9DbGllbnQgPSBtb2RlbC5jcmVhdGVBdWRpb0NsaWVudCgpO1xuXHRcdFx0aWYgKGxhbmd1YWdlKSB7XG5cdFx0XHRcdGF1ZGlvQ2xpZW50LnNldHRpbmdzLmxhbmd1YWdlID0gbGFuZ3VhZ2U7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gYXVkaW9DbGllbnQuY3JlYXRlTGl2ZVRyYW5zY3JpcHRpb25TZXNzaW9uKCk7XG5cdFx0XHRzZXNzaW9uLnNldHRpbmdzLnNhbXBsZVJhdGUgPSBTQU1QTEVfUkFURTtcblx0XHRcdHNlc3Npb24uc2V0dGluZ3MuY2hhbm5lbHMgPSBDSEFOTkVMUztcblx0XHRcdHNlc3Npb24uc2V0dGluZ3MuYml0c1BlclNhbXBsZSA9IEJJVFNfUEVSX1NBTVBMRTtcblx0XHRcdGlmIChsYW5ndWFnZSkge1xuXHRcdFx0XHRzZXNzaW9uLnNldHRpbmdzLmxhbmd1YWdlID0gbGFuZ3VhZ2U7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBzZXNzaW9uLnN0YXJ0KCk7XG5cblx0XHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLl9nZW5lcmF0aW9uKSB7XG5cdFx0XHRcdC8vIEEgbmV3ZXIgc2Vzc2lvbiByZXBsYWNlZCB0aGlzIG9uZSB3aGlsZSBpdCB3YXMgb3BlbmluZzsgZGlzY2FyZC5cblx0XHRcdFx0YXdhaXQgc2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fc2Vzc2lvbiA9IHNlc3Npb247XG5cdFx0XHR0aGlzLl9zZXRTdGF0dXMoeyBzdGF0ZTogTG9jYWxUcmFuc2NyaXB0aW9uTW9kZWxTdGF0ZS5SZWFkeSB9KTtcblxuXHRcdFx0Ly8gQ29uc3VtZSBzdHJlYW1pbmcgcmVzdWx0cyBpbiB0aGUgYmFja2dyb3VuZCwgYWNjdW11bGF0aW5nIGFcblx0XHRcdC8vIGN1bXVsYXRpdmUgdHJhbnNjcmlwdCBhbmQgZW1pdHRpbmcgaW50ZXJpbXMgYXMgc2VnbWVudHMgYXJyaXZlLlxuXHRcdFx0dGhpcy5fY29uc3VtZVByb21pc2UgPSB0aGlzLl9jb25zdW1lKHNlc3Npb24sIGdlbmVyYXRpb24pO1xuXG5cdFx0XHQvLyBGbHVzaCBhbnkgYXVkaW8gY2FwdHVyZWQgYmVmb3JlIHRoZSBzZXNzaW9uIHdhcyByZWFkeSwgaW4gb3JkZXIuXG5cdFx0XHQvLyBFbnF1ZXVlIHN5bmNocm9ub3VzbHkgKG5vIGBhd2FpdGAgYmVmb3JlIHRoZSBsb29wIGNvbXBsZXRlcykgc28gdGhlXG5cdFx0XHQvLyBlbnRpcmUgYmFja2xvZyBpcyBxdWV1ZWQgYWhlYWQgb2YgYW55IGxpdmUgYHB1c2hBdWRpbygpYCBhcHBlbmQgXHUyMDE0XG5cdFx0XHQvLyBleHBvc2luZyBgX3Nlc3Npb25gIGFib3ZlIG11c3Qgbm90IGxldCBhIGZyZXNobHkgY2FwdHVyZWQgY2h1bmsganVtcFxuXHRcdFx0Ly8gYWhlYWQgb2YgdGhlIGJ1ZmZlcmVkIGJhY2tsb2cuXG5cdFx0XHRjb25zdCBidWZmZXJlZCA9IHRoaXMuX3BlbmRpbmdDaHVua3M7XG5cdFx0XHR0aGlzLl9wZW5kaW5nQ2h1bmtzID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGNodW5rIG9mIGJ1ZmZlcmVkKSB7XG5cdFx0XHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLl9nZW5lcmF0aW9uKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fZW5xdWV1ZUFwcGVuZChzZXNzaW9uLCBnZW5lcmF0aW9uLCBjaHVuaykuY2F0Y2goZXJyID0+IHtcblx0XHRcdFx0XHRpZiAoZ2VuZXJhdGlvbiA9PT0gdGhpcy5fZ2VuZXJhdGlvbikge1xuXHRcdFx0XHRcdFx0Y29uc3QgbWVzc2FnZSA9IFN0cmluZyhlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogZXJyKTtcblx0XHRcdFx0XHRcdHRoaXMuX3NldFN0YXR1cyh7IHN0YXRlOiBMb2NhbFRyYW5zY3JpcHRpb25Nb2RlbFN0YXRlLkVycm9yLCBlcnJvcjogbWVzc2FnZSwgZXJyb3JDb2RlOiBjbGFzc2lmeU1vZGVsRXJyb3IobWVzc2FnZSkgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmIChnZW5lcmF0aW9uID09PSB0aGlzLl9nZW5lcmF0aW9uKSB7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBTdHJpbmcoZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IGVycik7XG5cdFx0XHRcdHRoaXMuX3NldFN0YXR1cyh7IHN0YXRlOiBMb2NhbFRyYW5zY3JpcHRpb25Nb2RlbFN0YXRlLkVycm9yLCBlcnJvcjogbWVzc2FnZSwgZXJyb3JDb2RlOiBjbGFzc2lmeU1vZGVsRXJyb3IobWVzc2FnZSkgfSk7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEFwcGVuZCBgY2h1bmtgIHRvIGBzZXNzaW9uYCBhZnRlciBldmVyeSBwcmV2aW91c2x5IGVucXVldWVkIGFwcGVuZCBoYXNcblx0ICogY29tcGxldGVkLCBwcmVzZXJ2aW5nIGNhcHR1cmUgb3JkZXIuIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVqZWN0cyBpZiB0aGlzXG5cdCAqIHBhcnRpY3VsYXIgYXBwZW5kIGZhaWxzIChmb3IgY2FsbGVycyB0aGF0IG11c3Qgc3VyZmFjZSBpdCk7IHRoZSBpbnRlcm5hbFxuXHQgKiBjaGFpbiBjb250aW51ZXMgcmVnYXJkbGVzcyBzbyBvcmRlcmluZyBpcyBwcmVzZXJ2ZWQgZm9yIGxhdGVyIGNodW5rcy5cblx0ICovXG5cdHByaXZhdGUgX2VucXVldWVBcHBlbmQoc2Vzc2lvbjogTGl2ZUF1ZGlvVHJhbnNjcmlwdGlvblNlc3Npb24sIGdlbmVyYXRpb246IG51bWJlciwgY2h1bms6IFVpbnQ4QXJyYXkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLl9hcHBlbmRDaGFpbi50aGVuKCgpID0+IHtcblx0XHRcdGlmIChnZW5lcmF0aW9uICE9PSB0aGlzLl9nZW5lcmF0aW9uIHx8IHRoaXMuX3Nlc3Npb24gIT09IHNlc3Npb24pIHtcblx0XHRcdFx0cmV0dXJuOyAvLyBzdXBlcnNlZGVkL3Jlc2V0OyBkcm9wIHN0YWxlIGFwcGVuZFxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHNlc3Npb24uYXBwZW5kKGNodW5rKTtcblx0XHR9KTtcblx0XHR0aGlzLl9hcHBlbmRDaGFpbiA9IHJlc3VsdC5jYXRjaCgoKSA9PiB7IC8qIGtlZXAgdGhlIGNoYWluIGFsaXZlIGFmdGVyIGEgZmFpbGVkIGFwcGVuZCAqLyB9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0LyoqXG5cdCAqIERvd25sb2FkIChpZiBuZWVkZWQpIGFuZCBsb2FkIHRoZSBzZWxlY3RlZCBtb2RlbCB0aHJvdWdoIEZvdW5kcnkgTG9jYWwsXG5cdCAqIHJlcG9ydGluZyBkb3dubG9hZC9sb2FkIHByb2dyZXNzIHZpYSB0aGUgbW9kZWwgc3RhdHVzLiBJZGVtcG90ZW50OiBhIGxvYWRcblx0ICogYWxyZWFkeSBpbiBmbGlnaHQgKG9yIHRoZSBzYW1lIG1vZGVsIGFscmVhZHkgbG9hZGVkKSBpcyByZXVzZWQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9lbnN1cmVNb2RlbChjYWNoZURpcjogc3RyaW5nLCBtb2RlbElkOiBzdHJpbmcpOiBQcm9taXNlPElNb2RlbD4ge1xuXHRcdGlmICh0aGlzLl9tb2RlbCAmJiB0aGlzLl9sb2FkZWRNb2RlbElkID09PSBtb2RlbElkKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbW9kZWw7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9tb2RlbFByb21pc2UgJiYgdGhpcy5fbG9hZGVkTW9kZWxJZCA9PT0gbW9kZWxJZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX21vZGVsUHJvbWlzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2FkZWRNb2RlbElkID0gbW9kZWxJZDtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLl9tb2RlbFByZXBhcmVDdHMgPSBjdHM7XG5cdFx0dGhpcy5fbW9kZWxQcm9taXNlID0gKGFzeW5jICgpID0+IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdC8vIFRoZSBtb2RlbCBjYWNoZSBzdGF0ZSBpcyB1bmtub3duIHVudGlsIHRoZSBjYXRhbG9nIGlzIHF1ZXJpZWQuXG5cdFx0XHRcdHRoaXMuX3NldFN0YXR1cyh7IHN0YXRlOiBMb2NhbFRyYW5zY3JpcHRpb25Nb2RlbFN0YXRlLkxvYWRpbmcgfSk7XG5cblx0XHRcdFx0Ly8gRW5zdXJlIHRoZSBGb3VuZHJ5IExvY2FsIG5hdGl2ZSBydW50aW1lIChOLUFQSSBhZGRvbiArIGNvcmVcblx0XHRcdFx0Ly8gbGlicmFyaWVzKSBpcyBhdmFpbGFibGUgYmVmb3JlIGxvYWRpbmcgdGhlIFNESy4gV2UgZG8gbm90IHNoaXBcblx0XHRcdFx0Ly8gaXQgXHUyMDE0IHRoZSBhZGRvbiByZXF1aXJlcyBhIG5ld2VyIGdsaWJjIHRoYW4gb3VyIG1pbmltdW0gc3VwcG9ydGVkXG5cdFx0XHRcdC8vIExpbnV4IGRpc3Ryb3MgXHUyMDE0IHNvIGluIHBhY2thZ2VkIGJ1aWxkcyBpdCBpcyBkb3dubG9hZGVkIG9uIGRlbWFuZFxuXHRcdFx0XHQvLyBmcm9tIFZTIENvZGUncyBDRE4gKHBlciBgcHJvZHVjdC5kaWN0YXRpb25SdW50aW1lYCkgaW50byBhXG5cdFx0XHRcdC8vIHBlci11c2VyIGNhY2hlIGFuZCB0aGUgU0RLIGxvYWRlciBpcyBwb2ludGVkIGF0IGl0IHZpYSBlbnYgdmFyLlxuXHRcdFx0XHQvLyBUaGlzIGlzIGEgbm8tb3Agb25jZSBjYWNoZWQuIEluIGRldiBidWlsZHMgKG5vIHByb2R1Y3QgY29uZmlnKVxuXHRcdFx0XHQvLyB0aGUgU0RLIHJlc29sdmVzIGl0cyBhZGRvbiArIGNvcmUgbGlicyBmcm9tIG5vZGVfbW9kdWxlcywgc28gd2Vcblx0XHRcdFx0Ly8gc2tpcCBwcm92aXNpb25pbmcgYW5kIGxlYXZlIHRoZSBsb2FkZXIgb24gaXRzIGRlZmF1bHQgcGF0aC5cblx0XHRcdFx0aWYgKHRoaXMuX3J1bnRpbWVEb3dubG9hZCkge1xuXHRcdFx0XHRcdGNvbnN0IG5hdGl2ZURpciA9IGF3YWl0IGVuc3VyZUZvdW5kcnlMb2NhbFJ1bnRpbWUocnVudGltZUNhY2hlRGlyKGNhY2hlRGlyKSwgdGhpcy5fcnVudGltZURvd25sb2FkLCBjdHMudG9rZW4pO1xuXHRcdFx0XHRcdHByb2Nlc3MuZW52LlZTQ09ERV9GT1VORFJZX0xPQ0FMX05BVElWRV9ESVIgPSBuYXRpdmVEaXI7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIXRoaXMuX3Nkaykge1xuXHRcdFx0XHRcdHRoaXMuX3NkayA9IGF3YWl0IGltcG9ydCgnZm91bmRyeS1sb2NhbC1zZGsnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoIXRoaXMuX21hbmFnZXIpIHtcblx0XHRcdFx0XHQvLyBTdG9yZSBkb3dubG9hZGVkIG1vZGVsIGZpbGVzIHVuZGVyIFZTIENvZGUncyBjYWNoZSBkaXIgc29cblx0XHRcdFx0XHQvLyBzdWJzZXF1ZW50IHNlc3Npb25zIGxvYWQgd2l0aG91dCByZS1kb3dubG9hZGluZyAoXCJtb2RlbFxuXHRcdFx0XHRcdC8vIG1hbmFnZW1lbnRcIikuIGBjcmVhdGVBc3luY2AgYXZvaWRzIGJsb2NraW5nIHRoZSBldmVudCBsb29wXG5cdFx0XHRcdFx0Ly8gZHVyaW5nIG5hdGl2ZSBpbml0LlxuXHRcdFx0XHRcdHRoaXMuX21hbmFnZXIgPSBhd2FpdCB0aGlzLl9zZGsuRm91bmRyeUxvY2FsTWFuYWdlci5jcmVhdGVBc3luYyh7XG5cdFx0XHRcdFx0XHRhcHBOYW1lOiBGT1VORFJZX0FQUF9OQU1FLFxuXHRcdFx0XHRcdFx0bW9kZWxDYWNoZURpcjogY2FjaGVEaXIsXG5cdFx0XHRcdFx0XHRsb2dMZXZlbDogJ3dhcm4nLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBhd2FpdCB0aGlzLl9tYW5hZ2VyLmNhdGFsb2cuZ2V0TW9kZWwobW9kZWxJZCk7XG5cblx0XHRcdFx0bGV0IGRpZERvd25sb2FkID0gZmFsc2U7XG5cdFx0XHRcdGlmICghbW9kZWwuaXNDYWNoZWQpIHtcblx0XHRcdFx0XHRkaWREb3dubG9hZCA9IHRydWU7XG5cdFx0XHRcdFx0Ly8gT25seSBub3csIGhhdmluZyBjb25maXJtZWQgYSBjYWNoZSBtaXNzLCBzdXJmYWNlIHRoZVxuXHRcdFx0XHRcdC8vIGBEb3dubG9hZGluZ2Agc3RhdHVzLiBSZXBvcnQgaXQgdXAgZnJvbnQgKHByb2dyZXNzIDApIHNvIHRoZVxuXHRcdFx0XHRcdC8vIGRvd25sb2FkIFVJIGFwcGVhcnMgaW1tZWRpYXRlbHkgcmF0aGVyIHRoYW4gd2FpdGluZyBmb3IgdGhlXG5cdFx0XHRcdFx0Ly8gU0RLJ3MgZmlyc3QgcHJvZ3Jlc3MgY2FsbGJhY2suXG5cdFx0XHRcdFx0dGhpcy5fc2V0U3RhdHVzKHsgc3RhdGU6IExvY2FsVHJhbnNjcmlwdGlvbk1vZGVsU3RhdGUuRG93bmxvYWRpbmcsIHByb2dyZXNzOiAwIH0pO1xuXHRcdFx0XHRcdC8vIEJyaWRnZSBWUyBDb2RlIGNhbmNlbGxhdGlvbiB0byB0aGUgQWJvcnRTaWduYWwgdGhlIFNESyBleHBlY3RzLlxuXHRcdFx0XHRcdGNvbnN0IGFjID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRcdFx0XHRcdGNvbnN0IHN1YiA9IGN0cy50b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBhYy5hYm9ydCgpKTtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXdhaXQgbW9kZWwuZG93bmxvYWQoKHBlcmNlbnQ6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9zZXRTdGF0dXMoeyBzdGF0ZTogTG9jYWxUcmFuc2NyaXB0aW9uTW9kZWxTdGF0ZS5Eb3dubG9hZGluZywgcHJvZ3Jlc3M6IE1hdGgubWluKDEsIE1hdGgubWF4KDAsIHBlcmNlbnQgLyAxMDApKSB9KTtcblx0XHRcdFx0XHRcdH0sIGFjLnNpZ25hbCk7XG5cdFx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gbW9kZWwubG9hZCgpIGhhcyBubyBBYm9ydFNpZ25hbDsgY2hlY2sgY2FuY2VsbGF0aW9uIGJlZm9yZSBzdGFydGluZyBpdC5cblx0XHRcdFx0aWYgKGN0cy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignY2FuY2VsbGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fc2V0U3RhdHVzKHsgc3RhdGU6IExvY2FsVHJhbnNjcmlwdGlvbk1vZGVsU3RhdGUuTG9hZGluZyB9KTtcblx0XHRcdFx0YXdhaXQgbW9kZWwubG9hZCgpO1xuXG5cdFx0XHRcdHRoaXMuX21vZGVsID0gbW9kZWw7XG5cdFx0XHRcdHRoaXMuX3NldFN0YXR1cyh7IHN0YXRlOiBMb2NhbFRyYW5zY3JpcHRpb25Nb2RlbFN0YXRlLlJlYWR5LCBkb3dubG9hZGVkOiBkaWREb3dubG9hZCB9KTtcblx0XHRcdFx0aWYgKHRoaXMuX21vZGVsUHJlcGFyZUN0cyA9PT0gY3RzKSB7XG5cdFx0XHRcdFx0dGhpcy5fbW9kZWxQcmVwYXJlQ3RzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBtb2RlbDtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9tb2RlbCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fbW9kZWxQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLl9sb2FkZWRNb2RlbElkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAodGhpcy5fbW9kZWxQcmVwYXJlQ3RzID09PSBjdHMpIHtcblx0XHRcdFx0XHR0aGlzLl9tb2RlbFByZXBhcmVDdHMgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdH0pKCk7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsUHJvbWlzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEcmFpbiB0aGUgc2Vzc2lvbidzIHJlc3VsdCBzdHJlYW0sIG1haW50YWluaW5nIGEgY3VtdWxhdGl2ZSB0cmFuc2NyaXB0LlxuXHQgKiBGb3VuZHJ5IGVtaXRzIHBlci1zZWdtZW50IHJlc3VsdHMgZmxhZ2dlZCBgaXNfZmluYWxgOyBhIGZpbmFsaXplZCBzZWdtZW50IGlzXG5cdCAqIHJlY29yZGVkIChhbmQgcmVwbGFjZWQgaWYgbGF0ZXIgcmVmaW5lZCkgaW4gdGhlIGFjY3VtdWxhdG9yLCB3aGlsZSBhXG5cdCAqIG5vbi1maW5hbCByZXN1bHQgaXMgdGhlIGludGVyaW0gdGFpbCBvZiB0aGUgc2VnbWVudCBjdXJyZW50bHkgYmVpbmcgc3Bva2VuLlxuXHQgKiBFYWNoIHVwZGF0ZSBmaXJlcyB0aGUgZnVsbCBjdW11bGF0aXZlIHRyYW5zY3JpcHQgc28gdGhlIHJlbmRlcmVyIGNhbiBzaGltbWVyXG5cdCAqIHRoZSBpbnRlcmltIHRhaWwgYW5kIHNvbGlkaWZ5IGZpbmFsaXplZCB0ZXh0LlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfY29uc3VtZShzZXNzaW9uOiBMaXZlQXVkaW9UcmFuc2NyaXB0aW9uU2Vzc2lvbiwgZ2VuZXJhdGlvbjogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGZvciBhd2FpdCAoY29uc3QgcmVzdWx0IG9mIHNlc3Npb24uZ2V0U3RyZWFtKCkpIHtcblx0XHRcdFx0aWYgKGdlbmVyYXRpb24gIT09IHRoaXMuX2dlbmVyYXRpb24pIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCB0ZXh0ID0gdGhpcy5fcmVzdWx0VGV4dChyZXN1bHQpO1xuXHRcdFx0XHRpZiAocmVzdWx0LmlzX2ZpbmFsKSB7XG5cdFx0XHRcdFx0dGhpcy5fYWNjdW11bGF0b3IuYWRkRmluYWwodGV4dCwgcmVzdWx0LnN0YXJ0X3RpbWUgPz8gbnVsbCwgcmVzdWx0LmVuZF90aW1lID8/IG51bGwpO1xuXHRcdFx0XHRcdHRoaXMuX3BhcnRpYWxUZXh0ID0gJyc7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gSW50ZXJpbSByZXN1bHRzIGFyZSBkZWx0YXMgb2YgdGhlIGluLXByb2dyZXNzIHNlZ21lbnQ7IGFwcGVuZFxuXHRcdFx0XHRcdC8vIHRoZW0gKHByZXNlcnZpbmcgdGhlaXIgb3duIHNwYWNpbmcpIHJhdGhlciB0aGFuIHJlcGxhY2luZywgc29cblx0XHRcdFx0XHQvLyBlYXJsaWVyIHBhcnRpYWwgd29yZHMgYXJlIG5vdCBsb3N0LlxuXHRcdFx0XHRcdHRoaXMuX3BhcnRpYWxUZXh0ID0gYXBwZW5kVHJhbnNjcmlwdENodW5rKHRoaXMuX3BhcnRpYWxUZXh0LCB0ZXh0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5fc2Vzc2lvbkFjdGl2ZSkge1xuXHRcdFx0XHRcdHRoaXMuX29uRGlkVHJhbnNjcmliZS5maXJlKHsgdGV4dDogdGhpcy5fY3VtdWxhdGl2ZVRleHQoKSwgaXNGaW5hbDogZmFsc2UsIGZpbmFsaXplZFRleHQ6IHRoaXMuX2FjY3VtdWxhdG9yLmdldFRleHQoKSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Ly8gQSBuYXRpdmUgc3RyZWFtaW5nL3B1c2ggZmFpbHVyZSB0ZXJtaW5hdGVzIHRoZSBzdHJlYW0uIElmIGl0IGhhcHBlbmVkXG5cdFx0XHQvLyB3aGlsZSByZWNvcmRpbmcgKG5vdCBkdXJpbmcgb3VyIG93biB0ZWFyZG93biksIHJlY29yZCBpdCBhbmQgc3VyZmFjZVxuXHRcdFx0Ly8gYW4gZXJyb3Igc3RhdHVzIHNvIHRoZSByZW5kZXJlciB0ZWFycyB0aGUgc2Vzc2lvbiBkb3duIGFuZCBpbmZvcm1zIHRoZVxuXHRcdFx0Ly8gdXNlcjsgc3RvcCgpIGFsc28gcmV0aHJvd3MgaXQgcmF0aGVyIHRoYW4gcmVwb3J0aW5nIGEgZmFsc2Ugc3VjY2Vzcy5cblx0XHRcdGlmIChnZW5lcmF0aW9uID09PSB0aGlzLl9nZW5lcmF0aW9uICYmIHRoaXMuX3Nlc3Npb25BY3RpdmUpIHtcblx0XHRcdFx0Y29uc3QgZXJyb3IgPSBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyKSk7XG5cdFx0XHRcdHRoaXMuX3J1bnRpbWVFcnJvciA9IGVycm9yO1xuXHRcdFx0XHR0aGlzLl9zZXRTdGF0dXMoeyBzdGF0ZTogTG9jYWxUcmFuc2NyaXB0aW9uTW9kZWxTdGF0ZS5FcnJvciwgZXJyb3I6IGVycm9yLm1lc3NhZ2UsIGVycm9yQ29kZTogJ3J1bnRpbWUnIH0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKiBGaW5hbGl6ZWQgdHJhbnNjcmlwdCBwbHVzIHRoZSBjdXJyZW50IGludGVyaW0gdGFpbCwgam9pbmVkIG5hdHVyYWxseS4gKi9cblx0cHJpdmF0ZSBfY3VtdWxhdGl2ZVRleHQoKTogc3RyaW5nIHtcblx0XHRjb25zdCBmaW5hbGl6ZWQgPSB0aGlzLl9hY2N1bXVsYXRvci5nZXRUZXh0KCk7XG5cdFx0Y29uc3QgcGFydGlhbCA9IHRoaXMuX3BhcnRpYWxUZXh0O1xuXHRcdGlmICghcGFydGlhbCkge1xuXHRcdFx0cmV0dXJuIGZpbmFsaXplZDtcblx0XHR9XG5cdFx0aWYgKCFmaW5hbGl6ZWQpIHtcblx0XHRcdHJldHVybiBwYXJ0aWFsO1xuXHRcdH1cblx0XHRyZXR1cm4gYCR7ZmluYWxpemVkfSR7dHJhbnNjcmlwdFNlcGFyYXRvcihmaW5hbGl6ZWQsIHBhcnRpYWwpfSR7cGFydGlhbH1gO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVzdWx0VGV4dChyZXN1bHQ6IExpdmVBdWRpb1RyYW5zY3JpcHRpb25SZXNwb25zZSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgcGFydCA9IHJlc3VsdC5jb250ZW50Py5bMF07XG5cdFx0Ly8gUmV0dXJuIHRoZSByYXcgdGV4dCAobm90IHRyaW1tZWQpOiBpbnRlcmltIGRlbHRhcyBjYXJyeSBzaWduaWZpY2FudFxuXHRcdC8vIGxlYWRpbmcvdHJhaWxpbmcgc3BhY2luZyB1c2VkIHRvIGNvbmNhdGVuYXRlIHRoZW0uIGBhZGRGaW5hbGAgdHJpbXNcblx0XHQvLyBmaW5hbGl6ZWQgc2VnbWVudHMgaXRzZWxmLlxuXHRcdHJldHVybiBwYXJ0Py50ZXh0ID8/IHBhcnQ/LnRyYW5zY3JpcHQgPz8gJyc7XG5cdH1cblxuXHRhc3luYyBwdXNoQXVkaW8oY2h1bms6IFZTQnVmZmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLl9zZXNzaW9uQWN0aXZlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGJ5dGVzID0gY2h1bmsuYnVmZmVyO1xuXHRcdC8vIENvcHkgb3V0IG9mIHRoZSBzaGFyZWQgVlNCdWZmZXIgYmFja2luZyBzdG9yZTsgYGFwcGVuZGAgdGFrZXMgb3duZXJzaGlwXG5cdFx0Ly8gb2YgdGhlIGJ5dGVzIGl0IHF1ZXVlcyB0byBuYXRpdmUgY29yZS5cblx0XHRjb25zdCBwY20gPSBuZXcgVWludDhBcnJheShieXRlcy5ieXRlTGVuZ3RoKTtcblx0XHRwY20uc2V0KGJ5dGVzKTtcblx0XHRpZiAodGhpcy5fc2Vzc2lvbikge1xuXHRcdFx0Ly8gUm91dGUgdGhyb3VnaCB0aGUgc2hhcmVkIGFwcGVuZCBxdWV1ZSBzbyB0aGlzIGxpdmUgY2h1bmsgbGFuZHNcblx0XHRcdC8vIGFmdGVyIGFueSBzdGlsbC1kcmFpbmluZyBidWZmZXJlZCBiYWNrbG9nIChwcmVzZXJ2aW5nIG9yZGVyIGFjcm9zc1xuXHRcdFx0Ly8gdGhlIGZpcnN0LXVzZSBoYW5kb2ZmKS4gTGV0IGEgcmVqZWN0aW9uIHByb3BhZ2F0ZTogdGhlIHJlbmRlcmVyJ3Ncblx0XHRcdC8vIHB1c2hBdWRpbygpLmNhdGNoIGZhaWxzIHRoZSBzZXNzaW9uIHNvIGRpY3RhdGlvbiBkb2Vzbid0IHNpbGVudGx5XG5cdFx0XHQvLyBjb250aW51ZSB3aGlsZSBldmVyeSBzdWJzZXF1ZW50IGNodW5rIGlzIGRyb3BwZWQuIExhdGUgZmFpbHVyZXNcblx0XHRcdC8vIGFmdGVyIHN0b3AoKSBhcmUgaWdub3JlZCBieSB0aGUgcmVuZGVyZXIuXG5cdFx0XHRhd2FpdCB0aGlzLl9lbnF1ZXVlQXBwZW5kKHRoaXMuX3Nlc3Npb24sIHRoaXMuX2dlbmVyYXRpb24sIHBjbSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIE1vZGVsIHN0aWxsIGxvYWRpbmcgLyBzZXNzaW9uIG5vdCBvcGVuIHlldDogYnVmZmVyIHVudGlsIGl0IGlzLlxuXHRcdFx0dGhpcy5fcGVuZGluZ0NodW5rcy5wdXNoKHBjbSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgc3RvcCgpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdGNvbnN0IGdlbmVyYXRpb24gPSB0aGlzLl9nZW5lcmF0aW9uO1xuXHRcdHRoaXMuX3Nlc3Npb25BY3RpdmUgPSBmYWxzZTtcblxuXHRcdC8vIEFsd2F5cyB3YWl0IGZvciB0aGUgaW4tZmxpZ2h0IHNlc3Npb24gb3BlbiB0byBzZXR0bGUuIGBfc2Vzc2lvbmAgaXNcblx0XHQvLyBhc3NpZ25lZCBiZWZvcmUgYF9vcGVuU2Vzc2lvbmAgZmluaXNoZXMgZmx1c2hpbmcgdGhlIGJ1ZmZlcmVkIGF1ZGlvIGl0XG5cdFx0Ly8gY2FwdHVyZWQgZHVyaW5nIG1vZGVsIGxvYWQsIHNvIHN0b3BwaW5nIHJpZ2h0IGFmdGVyIHRoZSBzZXNzaW9uIG9wZW5zXG5cdFx0Ly8gbXVzdCBub3QgcmFjZSB0aGF0IGZsdXNoIFx1MjAxNCBvdGhlcndpc2UgYHNlc3Npb24uc3RvcCgpYCBjYW4gcmVqZWN0IHRoZVxuXHRcdC8vIHJlbWFpbmluZyBhcHBlbmRzIGFuZCByZXR1cm4gYSB0cnVuY2F0ZWQgdHJhbnNjcmlwdC5cblx0XHRpZiAodGhpcy5fb3BlblByb21pc2UpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX29wZW5Qcm9taXNlO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIExvYWQgZmFpbGVkOyBzdGF0dXMgYWxyZWFkeSByZXBvcnRlZCBhcyBFcnJvci5cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZ2VuZXJhdGlvbiAhPT0gdGhpcy5fZ2VuZXJhdGlvbikge1xuXHRcdFx0cmV0dXJuICcnO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9uO1xuXHRcdGlmICghc2Vzc2lvbikge1xuXHRcdFx0Ly8gTW9kZWwgbmV2ZXIgZmluaXNoZWQgbG9hZGluZzsgbm90aGluZyB0byB0cmFuc2NyaWJlLlxuXHRcdFx0Y29uc3QgdGV4dCA9IHRoaXMuX2N1bXVsYXRpdmVUZXh0KCk7XG5cdFx0XHR0aGlzLl9yZXNldFNlc3Npb25TdGF0ZSgpO1xuXHRcdFx0cmV0dXJuIHRleHQ7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdC8vIERyYWluIGV2ZXJ5IHF1ZXVlZCBhcHBlbmQgKGJ1ZmZlcmVkIGJhY2tsb2cgKyBsaXZlIGNodW5rcykgc28gdGhlXG5cdFx0XHQvLyBmaW5hbCBjYXB0dXJlZCBhdWRpbyByZWFjaGVzIG5hdGl2ZSBjb3JlIGJlZm9yZSB3ZSBzdG9wIFx1MjAxNCBvdGhlcndpc2Vcblx0XHRcdC8vIGBzdG9wKClgIGNhbiBjb21wbGV0ZSB0aGUgc3RyZWFtIHdoaWxlIHRoZSB0YWlsIGFwcGVuZCBpcyBzdGlsbFxuXHRcdFx0Ly8gcGVuZGluZywgdHJ1bmNhdGluZyB0aGUgdHJhbnNjcmlwdC5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2FwcGVuZENoYWluO1xuXHRcdFx0fSBjYXRjaCB7IC8qIGluZGl2aWR1YWwgYXBwZW5kIGZhaWx1cmVzIGFscmVhZHkgc3VyZmFjZWQgKi8gfVxuXHRcdFx0Ly8gYHN0b3AoKWAgZHJhaW5zIGFueSBidWZmZXJlZCBhdWRpbywgZW1pdHMgZmluYWwgcmVzdWx0cyBpbnRvIHRoZVxuXHRcdFx0Ly8gc3RyZWFtLCB0aGVuIGNvbXBsZXRlcyBpdCBcdTIwMTQgc28gdGhlIGNvbnN1bWVyIGxvb3AgZW5kcyBhZnRlciB0aGlzLlxuXHRcdFx0YXdhaXQgc2Vzc2lvbi5zdG9wKCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBCZXN0LWVmZm9ydDogZmFsbCB0aHJvdWdoIHRvIHdoYXRldmVyIHRyYW5zY3JpcHQgd2UgYWNjdW11bGF0ZWQuXG5cdFx0fVxuXHRcdGlmICh0aGlzLl9jb25zdW1lUHJvbWlzZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY29uc3VtZVByb21pc2U7XG5cdFx0XHR9IGNhdGNoIHsgLyogY29uc3VtZXIgc3dhbGxvd3MgaXRzIG93biBlcnJvcnMgKi8gfVxuXHRcdH1cblxuXHRcdC8vIFRoZSBuYXRpdmUgc3RyZWFtIGZhaWxlZCBtaWQtcmVjb3JkaW5nOiBmYWlsIHRoZSBzdG9wIHJhdGhlciB0aGFuXG5cdFx0Ly8gcmVwb3J0aW5nIHRoZSBwYXJ0aWFsIHRyYW5zY3JpcHQgYXMgYSBzdWNjZXNzZnVsIGRpY3RhdGlvbiByZXN1bHQuXG5cdFx0Y29uc3QgcnVudGltZUVycm9yID0gdGhpcy5fcnVudGltZUVycm9yO1xuXHRcdGlmIChydW50aW1lRXJyb3IgJiYgZ2VuZXJhdGlvbiA9PT0gdGhpcy5fZ2VuZXJhdGlvbikge1xuXHRcdFx0YXdhaXQgdGhpcy5fZGlzcG9zZVNlc3Npb24oKTtcblx0XHRcdHRoaXMuX3Jlc2V0U2Vzc2lvblN0YXRlKCk7XG5cdFx0XHR0aHJvdyBydW50aW1lRXJyb3I7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dCA9IHRoaXMuX2N1bXVsYXRpdmVUZXh0KCk7XG5cdFx0aWYgKGdlbmVyYXRpb24gPT09IHRoaXMuX2dlbmVyYXRpb24pIHtcblx0XHRcdC8vIE9uIHN0b3AgZXZlcnl0aGluZyBpcyBmaW5hbGl6ZWQ6IG5vIHNoaW1tZXJpbmcgdGFpbCByZW1haW5zLlxuXHRcdFx0dGhpcy5fb25EaWRUcmFuc2NyaWJlLmZpcmUoeyB0ZXh0LCBpc0ZpbmFsOiB0cnVlLCBmaW5hbGl6ZWRUZXh0OiB0ZXh0IH0pO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLl9kaXNwb3NlU2Vzc2lvbigpO1xuXHRcdHRoaXMuX3Jlc2V0U2Vzc2lvblN0YXRlKCk7XG5cdFx0cmV0dXJuIHRleHQ7XG5cdH1cblxuXHRhc3luYyBjYW5jZWwoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fbW9kZWxQcmVwYXJlQ3RzPy5jYW5jZWwoKTtcblx0XHR0aGlzLl9tb2RlbFByZXBhcmVDdHMgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fc2Vzc2lvbkFjdGl2ZSA9IGZhbHNlO1xuXHRcdHRoaXMuX2dlbmVyYXRpb24rKztcblx0XHRhd2FpdCB0aGlzLl9kaXNwb3NlU2Vzc2lvbigpO1xuXHRcdHRoaXMuX3Jlc2V0U2Vzc2lvblN0YXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kaXNwb3NlU2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbjtcblx0XHR0aGlzLl9zZXNzaW9uID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvbnN1bWUgPSB0aGlzLl9jb25zdW1lUHJvbWlzZTtcblx0XHR0aGlzLl9jb25zdW1lUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgc2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0XHR9IGNhdGNoIHsgLyogYmVzdC1lZmZvcnQgdGVhcmRvd24gKi8gfVxuXHRcdH1cblx0XHRpZiAoY29uc3VtZSkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgY29uc3VtZTtcblx0XHRcdH0gY2F0Y2ggeyAvKiBjb25zdW1lciBzd2FsbG93cyBpdHMgb3duIGVycm9ycyAqLyB9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVzZXRTZXNzaW9uU3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvbkFjdGl2ZSA9IGZhbHNlO1xuXHRcdHRoaXMuX2FjY3VtdWxhdG9yLnJlc2V0KCk7XG5cdFx0dGhpcy5fcGFydGlhbFRleHQgPSAnJztcblx0XHR0aGlzLl9wZW5kaW5nQ2h1bmtzID0gW107XG5cdFx0dGhpcy5fYXBwZW5kQ2hhaW4gPSBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR0aGlzLl9ydW50aW1lRXJyb3IgPSB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxZQUFZLG9CQUFvQjtBQUN6QyxTQUFTLCtCQUErQjtBQUV4QyxTQUFTLFNBQVMsWUFBWTtBQUM5QixTQUFTLGlDQUFpQztBQUMxQztBQUFBLEVBSUM7QUFBQSxFQUVBO0FBQUEsT0FDTTtBQUNQLFNBQVMsK0JBQStCO0FBR3hDLE1BQU0sY0FBYztBQUNwQixNQUFNLFdBQVc7QUFDakIsTUFBTSxrQkFBa0I7QUFHeEIsTUFBTSxtQkFBbUI7QUFRekIsU0FBUyxnQkFBZ0IsZUFBK0I7QUFDdkQsU0FBTyxLQUFLLFFBQVEsYUFBYSxHQUFHLHNCQUFzQjtBQUMzRDtBQW9CQSxTQUFTLG1CQUFtQixTQUF5QjtBQUNwRCxRQUFNLE9BQU8sUUFBUSxZQUFZO0FBQ2pDLE1BQUksc0dBQXNHLEtBQUssSUFBSSxHQUFHO0FBQ3JILFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSwwR0FBMEcsS0FBSyxJQUFJLEdBQUc7QUFDekgsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJLG1FQUFtRSxLQUFLLElBQUksR0FBRztBQUNsRixXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksa0NBQWtDLEtBQUssSUFBSSxHQUFHO0FBQ2pELFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSx3REFBd0QsS0FBSyxJQUFJLEdBQUc7QUFDdkUsV0FBTztBQUFBLEVBQ1I7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
