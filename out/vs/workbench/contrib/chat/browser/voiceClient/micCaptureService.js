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
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { addDisposableListener } from "../../../../../base/browser/dom.js";
import { Emitter } from "../../../../../base/common/event.js";
import { createDecorator } from "../../../../../platform/instantiation/common/instantiation.js";
import { InstantiationType, registerSingleton } from "../../../../../platform/instantiation/common/extensions.js";
import { IStorageService, StorageScope } from "../../../../../platform/storage/common/storage.js";
import { INotificationService, Severity } from "../../../../../platform/notification/common/notification.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { localize } from "../../../../../nls.js";
import { AgentsVoiceStorageKeys } from "../../../../contrib/agentsVoice/common/agentsVoice.js";
import { createPcmCaptureNode } from "../pcmCaptureWorklet.js";
const IMicCaptureService = createDecorator("micCaptureService");
const MIC_CAPTURE_CHUNK_SIZE = 512;
function isMicrophonePermissionDeniedError(error) {
  return (error instanceof DOMException || error instanceof Error) && error.name === "NotAllowedError";
}
let MicCaptureService = class extends Disposable {
  constructor(storageService, notificationService, logService) {
    super();
    this.storageService = storageService;
    this.notificationService = notificationService;
    this.logService = logService;
    this._micStream = null;
    this._isCapturing = false;
    this._captureGeneration = 0;
    this._pttGeneration = 0;
    this._pttHeld = false;
    this._pttStreaming = false;
    this._isMuted = false;
    this._suppressUntilTs = 0;
    this._pttAcquiring = false;
    this._pttReleasedDuringAcquire = false;
    // --- Hardware mute detection. ---
    // A hardware microphone kill switch (e.g. on Framework laptops) leaves
    // `getUserMedia` succeeding with a track whose `muted` flag is set, so no
    // acquisition error surfaces. Track the mute state to warn the user.
    this._micTrackListeners = this._register(new DisposableStore());
    this._micMutedNotified = false;
    this._pttDrainTargetSamples = 0;
    this._pttDrainSamplesSent = 0;
    this._diagTurnId = "";
    this._diagPttDownTs = 0;
    this._diagPttUpTs = 0;
    this._diagChunksSent = 0;
    this._diagSamplesSent = 0;
    this._diagDrainFired = false;
    this._diagDrainChunks = 0;
    this._diagDrainSamples = 0;
    this._diagDrainSkippedByMute = 0;
    this._diagDrainSkippedBySuppression = 0;
    this._diagPostReleaseCallbacks = 0;
    this._diagPostReleaseSamples = 0;
    this._diagPostReleaseSkippedByMute = 0;
    this._diagPostReleaseSkippedBySuppression = 0;
    this._diagReleasedDuringAcquire = false;
    this._diagPttUpWithoutCapture = false;
    this._onPttStart = this._register(new Emitter());
    this.onPttStart = this._onPttStart.event;
    this._onPttAudioChunk = this._register(new Emitter());
    this.onPttAudioChunk = this._onPttAudioChunk.event;
    this._onPttEnd = this._register(new Emitter());
    this.onPttEnd = this._onPttEnd.event;
    this._onPttDiagnostic = this._register(new Emitter());
    this.onPttDiagnostic = this._onPttDiagnostic.event;
  }
  get isCapturing() {
    return this._isCapturing;
  }
  get analyserNode() {
    return this._analyserNode;
  }
  get isMuted() {
    return this._isMuted;
  }
  set isMuted(value) {
    this._isMuted = value;
  }
  suppressUntil(timestamp) {
    this._suppressUntilTs = timestamp;
  }
  prepare(window) {
    this._window = window;
  }
  async pttDown(turnId, passive = false) {
    if (this._pttHeld) {
      return;
    }
    const pttGeneration = ++this._pttGeneration;
    this._finishDrain();
    this._flushPendingDiagnostic();
    this._resetDiagnosticCounters(turnId);
    this._pttHeld = true;
    this._pttStreaming = true;
    this._pttReleasedDuringAcquire = false;
    this._isMuted = false;
    if (this._isCapturing) {
      this._onPttStart.fire(passive);
      return;
    }
    if (!this._window) {
      return;
    }
    if (this._pttAcquiring) {
      return;
    }
    this._pttAcquiring = true;
    try {
      await this.startCapture(this._window);
    } catch (err) {
      if (pttGeneration !== this._pttGeneration) {
        return;
      }
      this._pttHeld = false;
      this._pttStreaming = false;
      this._pttReleasedDuringAcquire = false;
      throw err;
    } finally {
      if (pttGeneration === this._pttGeneration) {
        this._pttAcquiring = false;
      }
    }
    if (pttGeneration !== this._pttGeneration || !this._isCapturing || !this._pttHeld) {
      this._pttReleasedDuringAcquire = false;
      return;
    }
    this._onPttStart.fire(passive);
    if (this._pttReleasedDuringAcquire) {
      this._pttReleasedDuringAcquire = false;
      this._pttStreaming = false;
      this._diagReleasedDuringAcquire = true;
      this._onPttEnd.fire();
      this.stopCapture();
      this._scheduleDiagnosticFire();
    }
  }
  pttUp() {
    if (!this._pttHeld) {
      return;
    }
    if (this._pttAcquiring) {
      this._pttReleasedDuringAcquire = true;
      this._diagReleasedDuringAcquire = true;
      this._diagPttUpTs = Date.now();
      this._scheduleDiagnosticFire();
      return;
    }
    if (!this._isCapturing) {
      this._pttHeld = false;
      this._pttStreaming = false;
      this._diagPttUpWithoutCapture = true;
      this._diagPttUpTs = Date.now();
      this._scheduleDiagnosticFire();
      return;
    }
    this._pttHeld = false;
    this._diagPttUpTs = Date.now();
    const sampleRate = this._micCtx?.sampleRate ?? 16e3;
    this._pttDrainTargetSamples = Math.ceil(
      sampleRate * MicCaptureService._PTT_DRAIN_WINDOW_MS / 1e3
    );
    this._pttDrainSamplesSent = 0;
    this._pttDrainFallbackTimer = setTimeout(() => {
      this._pttDrainFallbackTimer = void 0;
      this._finishDrain();
    }, MicCaptureService._PTT_DRAIN_WINDOW_MS + 250);
    this._scheduleDiagnosticFire();
  }
  abortPtt() {
    if (!this._pttHeld && !this._pttStreaming) {
      return;
    }
    if (this._pttDrainFallbackTimer) {
      clearTimeout(this._pttDrainFallbackTimer);
      this._pttDrainFallbackTimer = void 0;
    }
    this._pttDrainTargetSamples = 0;
    this._pttDrainSamplesSent = 0;
    this._pttGeneration++;
    this._pttAcquiring = false;
    this._pttHeld = false;
    this._pttStreaming = false;
    this._pttReleasedDuringAcquire = false;
    this._diagPttUpTs = Date.now();
    this._scheduleDiagnosticFire();
  }
  async startCapture(window) {
    this._window = window;
    if (this._isCapturing) {
      return;
    }
    if (this._capturePromise) {
      return this._capturePromise;
    }
    const capturePromise = this._startCapture(window);
    this._capturePromise = capturePromise;
    try {
      await capturePromise;
    } finally {
      if (this._capturePromise === capturePromise) {
        this._capturePromise = void 0;
      }
    }
  }
  async _startCapture(window) {
    const captureGeneration = this._captureGeneration;
    const deviceId = this.storageService.get(AgentsVoiceStorageKeys.MicrophoneDevice, StorageScope.APPLICATION);
    const audioConstraints = {
      channelCount: 1,
      sampleRate: 16e3,
      echoCancellation: true,
      noiseSuppression: true
    };
    if (deviceId) {
      audioConstraints.deviceId = { exact: deviceId };
    }
    let micStream;
    try {
      micStream = await window.navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });
    } catch (err) {
      const isDeviceError = deviceId && err instanceof DOMException && (err.name === "OverconstrainedError" || err.name === "NotFoundError");
      if (isDeviceError) {
        this.logService.warn(`[mic] Preferred device ${deviceId.slice(0, 8)}\u2026 unavailable, falling back to default`);
        delete audioConstraints.deviceId;
        try {
          micStream = await window.navigator.mediaDevices.getUserMedia({
            audio: audioConstraints
          });
        } catch (retryErr) {
          this._notifyMicPermissionDenied(retryErr);
          throw retryErr;
        }
      } else {
        this._notifyMicPermissionDenied(err);
        throw err;
      }
    }
    if (captureGeneration !== this._captureGeneration) {
      micStream.getTracks().forEach((track) => track.stop());
      return;
    }
    this._micStream = micStream;
    const cleanupFailedCapture = () => {
      if (this._micStream === micStream) {
        this._stopCaptureResources();
      } else {
        micStream.getTracks().forEach((track) => track.stop());
      }
    };
    let ctx;
    let source;
    try {
      this._micTrackListeners.clear();
      this._micMutedNotified = false;
      const audioTrack = micStream.getAudioTracks()[0];
      if (audioTrack) {
        if (audioTrack.muted) {
          this._notifyMicrophoneMuted();
        }
        this._micTrackListeners.add(addDisposableListener(audioTrack, "mute", () => this._notifyMicrophoneMuted()));
        this._micTrackListeners.add(addDisposableListener(audioTrack, "unmute", () => {
          this._micMutedNotified = false;
        }));
      }
      if (!this._micCtx) {
        this._micCtx = new window.AudioContext({ sampleRate: 16e3 });
      }
      ctx = this._micCtx;
      source = ctx.createMediaStreamSource(micStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      this._analyserNode = analyser;
    } catch (err) {
      cleanupFailedCapture();
      throw err;
    }
    const captureNodePromise = createPcmCaptureNode(window, ctx, MIC_CAPTURE_CHUNK_SIZE, (samples) => {
      const nowTs = Date.now();
      const ptUpTs = this._diagPttUpTs;
      const isDrainCallback = this._pttStreaming && !this._pttHeld;
      const inDiagWindow = ptUpTs > 0 && !this._pttHeld && nowTs <= ptUpTs + MicCaptureService._DIAG_POST_RELEASE_WINDOW_MS;
      const isPostReleaseCallback = !this._pttStreaming && inDiagWindow;
      if (this._isMuted) {
        if (isDrainCallback) {
          this._diagDrainSkippedByMute++;
        }
        if (isPostReleaseCallback) {
          this._diagPostReleaseSkippedByMute++;
        }
        return;
      }
      if (nowTs < this._suppressUntilTs) {
        if (isDrainCallback) {
          this._diagDrainSkippedBySuppression++;
        }
        if (isPostReleaseCallback) {
          this._diagPostReleaseSkippedBySuppression++;
        }
        return;
      }
      if (!this._pttStreaming) {
        if (isPostReleaseCallback) {
          this._diagPostReleaseCallbacks++;
          this._diagPostReleaseSamples += samples.length;
        }
        return;
      }
      const b64 = encodeRawPcm16Base64(samples, this._window);
      this._diagChunksSent++;
      this._diagSamplesSent += samples.length;
      if (isDrainCallback) {
        this._diagDrainFired = true;
        this._diagDrainChunks++;
        this._diagDrainSamples += samples.length;
        this._pttDrainSamplesSent += samples.length;
      }
      this._onPttAudioChunk.fire(b64);
      if (isDrainCallback && this._pttDrainSamplesSent >= this._pttDrainTargetSamples) {
        this._finishDrain();
      }
    });
    let node;
    try {
      node = (await captureNodePromise).node;
    } catch (err) {
      cleanupFailedCapture();
      throw err;
    }
    if (this._micCtx !== ctx) {
      try {
        node.disconnect();
      } catch {
      }
      return;
    }
    try {
      this._workletNode = node;
      source.connect(node);
      node.connect(ctx.destination);
      this._isCapturing = true;
    } catch (err) {
      cleanupFailedCapture();
      throw err;
    }
  }
  _notifyMicPermissionDenied(err) {
    if (isMicrophonePermissionDeniedError(err)) {
      this.notificationService.notify({
        severity: Severity.Error,
        message: localize("mic.permissionDenied", "Microphone access was denied. Grant microphone permission in your system settings to use Voice Mode.")
      });
    }
  }
  _notifyMicrophoneMuted() {
    if (this._micMutedNotified) {
      return;
    }
    this._micMutedNotified = true;
    this.logService.warn("[mic] Microphone track is muted \u2014 likely a hardware mute switch is enabled");
    this.notificationService.notify({
      severity: Severity.Warning,
      message: localize("mic.hardwareMuted", "Your microphone appears to be muted or disabled, possibly by a hardware switch. Voice Mode won't hear you until it's re-enabled.")
    });
  }
  _stopCaptureResources() {
    this._captureGeneration++;
    this._capturePromise = void 0;
    if (this._workletNode) {
      this._workletNode.port.onmessage = null;
      try {
        this._workletNode.disconnect();
      } catch {
      }
      this._workletNode = void 0;
    }
    this._analyserNode = void 0;
    this._micCtx?.close();
    this._micCtx = void 0;
    if (this._micStream) {
      this._micStream.getTracks().forEach((t) => t.stop());
      this._micStream = null;
    }
    this._micTrackListeners.clear();
    this._micMutedNotified = false;
    this._isCapturing = false;
  }
  stopCapture() {
    this._stopCaptureResources();
    this._pttGeneration++;
    this._pttAcquiring = false;
    if (this._pttDrainFallbackTimer) {
      clearTimeout(this._pttDrainFallbackTimer);
      this._pttDrainFallbackTimer = void 0;
    }
    this._pttDrainTargetSamples = 0;
    this._pttDrainSamplesSent = 0;
    this._pttHeld = false;
    this._pttStreaming = false;
    this._pttReleasedDuringAcquire = false;
  }
  dispose() {
    if (this._diagFireTimer) {
      clearTimeout(this._diagFireTimer);
      this._diagFireTimer = void 0;
    }
    if (this._pttDrainFallbackTimer) {
      clearTimeout(this._pttDrainFallbackTimer);
      this._pttDrainFallbackTimer = void 0;
    }
    this.stopCapture();
    super.dispose();
  }
  /**
   * End the post-release drain phase: stop accepting more audio for
   * this turn and fire `_onPttEnd`. Idempotent. Safe to call when no
   * drain is in progress.
   */
  _finishDrain() {
    if (this._pttDrainFallbackTimer) {
      clearTimeout(this._pttDrainFallbackTimer);
      this._pttDrainFallbackTimer = void 0;
    }
    this._pttDrainTargetSamples = 0;
    this._pttDrainSamplesSent = 0;
    if (this._pttStreaming && !this._pttHeld) {
      this._pttStreaming = false;
      this._onPttEnd.fire();
    }
  }
  _resetDiagnosticCounters(turnId) {
    this._diagTurnId = turnId;
    this._diagPttDownTs = Date.now();
    this._diagPttUpTs = 0;
    this._diagChunksSent = 0;
    this._diagSamplesSent = 0;
    this._diagDrainFired = false;
    this._diagDrainChunks = 0;
    this._diagDrainSamples = 0;
    this._diagDrainSkippedByMute = 0;
    this._diagDrainSkippedBySuppression = 0;
    this._diagPostReleaseCallbacks = 0;
    this._diagPostReleaseSamples = 0;
    this._diagPostReleaseSkippedByMute = 0;
    this._diagPostReleaseSkippedBySuppression = 0;
    this._diagReleasedDuringAcquire = false;
    this._diagPttUpWithoutCapture = false;
  }
  _scheduleDiagnosticFire() {
    if (this._diagFireTimer) {
      clearTimeout(this._diagFireTimer);
      this._diagFireTimer = void 0;
    }
    this._diagFireTimer = setTimeout(() => {
      this._diagFireTimer = void 0;
      this._emitDiagnostic();
    }, MicCaptureService._DIAG_POST_RELEASE_WINDOW_MS);
  }
  _flushPendingDiagnostic() {
    if (this._diagFireTimer) {
      clearTimeout(this._diagFireTimer);
      this._diagFireTimer = void 0;
      this._emitDiagnostic();
    }
  }
  _emitDiagnostic() {
    if (!this._diagTurnId && this._diagPttDownTs === 0) {
      return;
    }
    const msHeld = this._diagPttUpTs > 0 ? this._diagPttUpTs - this._diagPttDownTs : 0;
    this._onPttDiagnostic.fire({
      turnId: this._diagTurnId,
      msHeld,
      chunksSent: this._diagChunksSent,
      samplesSent: this._diagSamplesSent,
      drainFired: this._diagDrainFired,
      drainChunks: this._diagDrainChunks,
      drainSamples: this._diagDrainSamples,
      drainWindowMs: MicCaptureService._PTT_DRAIN_WINDOW_MS,
      drainSkippedByMute: this._diagDrainSkippedByMute,
      drainSkippedBySuppression: this._diagDrainSkippedBySuppression,
      postReleaseCallbacks: this._diagPostReleaseCallbacks,
      postReleaseSamples: this._diagPostReleaseSamples,
      postReleaseSkippedByMute: this._diagPostReleaseSkippedByMute,
      postReleaseSkippedBySuppression: this._diagPostReleaseSkippedBySuppression,
      postReleaseWindowMs: MicCaptureService._DIAG_POST_RELEASE_WINDOW_MS,
      releasedDuringAcquire: this._diagReleasedDuringAcquire,
      pttUpWithoutCapture: this._diagPttUpWithoutCapture
    });
  }
};
// --- Drain state (post-release continued streaming). ---
// Drain length is enforced primarily by counting samples shipped
// since `pttUp` (immune to main-thread jitter that would skew a
// pure wall-clock timer). The fallback timer guards against the
// `onaudioprocess` callback being throttled or stopping entirely.
MicCaptureService._PTT_DRAIN_WINDOW_MS = 500;
// --- Per-press diagnostic counters (reset on pttDown). ---
// Diagnostic window MUST be > drain window so any audio still
// produced after drain end is observable as `postReleaseCallbacks`.
MicCaptureService._DIAG_POST_RELEASE_WINDOW_MS = 1e3;
MicCaptureService = __decorateClass([
  __decorateParam(0, IStorageService),
  __decorateParam(1, INotificationService),
  __decorateParam(2, ILogService)
], MicCaptureService);
function encodeRawPcm16Base64(samples, win) {
  const buf = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 32768 : s * 32767, true);
  }
  const bytes = new Uint8Array(buf);
  let binaryStr = "";
  for (let i = 0; i < bytes.length; i++) {
    binaryStr += String.fromCharCode(bytes[i]);
  }
  return win.btoa(binaryStr);
}
registerSingleton(IMicCaptureService, MicCaptureService, InstantiationType.Delayed);
export {
  IMicCaptureService,
  MIC_CAPTURE_CHUNK_SIZE,
  MicCaptureService,
  isMicrophonePermissionDeniedError
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci92b2ljZUNsaWVudC9taWNDYXB0dXJlU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uVHlwZSwgcmVnaXN0ZXJTaW5nbGV0b24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFnZW50c1ZvaWNlU3RvcmFnZUtleXMgfSBmcm9tICcuLi8uLi8uLi8uLi9jb250cmliL2FnZW50c1ZvaWNlL2NvbW1vbi9hZ2VudHNWb2ljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVQY21DYXB0dXJlTm9kZSB9IGZyb20gJy4uL3BjbUNhcHR1cmVXb3JrbGV0LmpzJztcblxuZXhwb3J0IGNvbnN0IElNaWNDYXB0dXJlU2VydmljZSA9IGNyZWF0ZURlY29yYXRvcjxJTWljQ2FwdHVyZVNlcnZpY2U+KCdtaWNDYXB0dXJlU2VydmljZScpO1xuXG4vKiogTnVtYmVyIG9mIHNhbXBsZXMgYnVmZmVyZWQgcGVyIDMyIG1zIHZvaWNlIGNhcHR1cmUgY2h1bmsgYXQgMTYga0h6LCBtYXRjaGluZyBvbmUgU2lsZXJvIFZBRCBmcmFtZS4gKi9cbmV4cG9ydCBjb25zdCBNSUNfQ0FQVFVSRV9DSFVOS19TSVpFID0gNTEyO1xuXG5leHBvcnQgZnVuY3Rpb24gaXNNaWNyb3Bob25lUGVybWlzc2lvbkRlbmllZEVycm9yKGVycm9yOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdHJldHVybiAoZXJyb3IgaW5zdGFuY2VvZiBET01FeGNlcHRpb24gfHwgZXJyb3IgaW5zdGFuY2VvZiBFcnJvcikgJiYgZXJyb3IubmFtZSA9PT0gJ05vdEFsbG93ZWRFcnJvcic7XG59XG5cbi8qKlxuICogUGVyLVBUVC1wcmVzcyBkaWFnbm9zdGljIGVtaXR0ZWQgYWZ0ZXIgYHB0dFVwYCBvbmNlIHRoZSBkaWFnbm9zdGljXG4gKiB3aW5kb3cgY2xvc2VzLiBMb2dnZWQgKyBzZW50IHRvIGJhY2tlbmQgc28gd2UgY2FuIGNvcnJlbGF0ZSBmcm9udGVuZFxuICogYXVkaW8gYm9va2tlZXBpbmcgd2l0aCBiYWNrZW5kIEFTUiByZXN1bHRzIHZpYSBgdHVybklkYC5cbiAqXG4gKiBEcmFpbiBtb2RlbDogYWZ0ZXIgYHB0dFVwYCB0aGUgc2VydmljZSBrZWVwcyBzdHJlYW1pbmcgYXVkaW8gY2h1bmtzXG4gKiBmb3IgYSBmaXhlZCBcImRyYWluIHdpbmRvd1wiICh+NTAwbXMgYnkgZGVmYXVsdCkuIFRoZSBkcmFpbiBlbmRzIGFzXG4gKiBzb29uIGFzIGl0IGhhcyBzaGlwcGVkIGVub3VnaCBzYW1wbGVzIHRvIGNvdmVyIHRoZSB3aW5kb3cgKG9yIGFcbiAqIGZhbGxiYWNrIHRpbWVyIHRyaXBzIGlmIGBvbmF1ZGlvcHJvY2Vzc2Agc3RvcHMgZmlyaW5nKS4gT25seSBBRlRFUlxuICogdGhlIGRyYWluIGhhcyBjbG9zZWQgZG9lcyBgX29uUHR0RW5kYCBmaXJlLiBUaGUgZGlhZ25vc3RpYyB3aW5kb3cgaXNcbiAqIGludGVudGlvbmFsbHkgTE9OR0VSIHRoYW4gdGhlIGRyYWluIHdpbmRvdyBzbyBhbnkgYXVkaW8gc3RpbGxcbiAqIHByb2R1Y2VkIGFmdGVyIGRyYWluIGVuZCAod2l0aGluIHRoZSBkaWFnbm9zdGljIHdpbmRvdykgaXMgY291bnRlZFxuICogYXMgYHBvc3RSZWxlYXNlQ2FsbGJhY2tzYCAtLSBhIGRpcmVjdCBzaWduYWwgdGhhdCB0aGUgZHJhaW4gd2luZG93XG4gKiBpcyB0b28gc2hvcnQgZm9yIHRoaXMgZGV2aWNlL2xvYWQgYW5kIHRoZSBmaXggbmVlZHMgdG8gZXh0ZW5kIGl0LlxuICpcbiAqIEZpZWxkIGludGVycHJldGF0aW9uOlxuICogIC0gYGRyYWluQ2h1bmtzYCAvIGBkcmFpblNhbXBsZXNgID0+IGF1ZGlvIGNhcHR1cmVkIGR1cmluZyB0aGUgZHJhaW5cbiAqICAgIHdpbmRvdyBhbmQgc2hpcHBlZCB0byB0aGUgYmFja2VuZC4gTm9uLXplcm8gaW4gbm9ybWFsIG9wZXJhdGlvbi5cbiAqICAtIGBwb3N0UmVsZWFzZUNhbGxiYWNrcyA+IDBgID0+IHRoZSBXZWJBdWRpbyBwaXBlbGluZSBwcm9kdWNlZCBtb3JlXG4gKiAgICBhdWRpbyBBRlRFUiB0aGUgZHJhaW4gd2luZG93IGNsb3NlZCBidXQgYmVmb3JlIHRoZSBkaWFnbm9zdGljXG4gKiAgICB3aW5kb3cuIFRoaXMgYXVkaW8gd2FzIERST1BQRUQ7IGlmIGl0IGhhcHBlbnMgb2Z0ZW4gdGhlIGRyYWluXG4gKiAgICB3aW5kb3cgbmVlZHMgdG8gZ3Jvdy5cbiAqICAtIGBkcmFpblNraXBwZWRCeSpgID4gMCA9PiB0aGUgZHJhaW4gd2FzIG11dGVkIG9yIEFFQy1zdXBwcmVzc2VkLlxuICogICAgVGFpbCBhdWRpbyBmb3IgdGhhdCBwcmVzcyB3YXMgbG9zdDsgaW52ZXN0aWdhdGUgdGhlIG11dGUgLyBBRUNcbiAqICAgIHN1cHByZXNzaW9uIHBhdGggcmF0aGVyIHRoYW4gdGhlIGRyYWluIHdpbmRvdy5cbiAqICAtIGBwdHRVcFdpdGhvdXRDYXB0dXJlYCA9PiBwdHRVcCBhcnJpdmVkIHdoaWxlIG1pYyB3YXMgbm90IGNhcHR1cmluZy5cbiAqICAtIGByZWxlYXNlZER1cmluZ0FjcXVpcmVgID0+IHVzZXIgcmVsZWFzZWQgd2hpbGUgbWljIHdhcyBzdGlsbCBiZWluZ1xuICogICAgYWNxdWlyZWQ7IG5vIGF1ZGlvIHdhcyBldmVyIHJlY29yZGVkIGZvciB0aGlzIHByZXNzLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElQdHREaWFnbm9zdGljIHtcblx0cmVhZG9ubHkgdHVybklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1zSGVsZDogbnVtYmVyO1xuXHRyZWFkb25seSBjaHVua3NTZW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IHNhbXBsZXNTZW50OiBudW1iZXI7XG5cdHJlYWRvbmx5IGRyYWluRmlyZWQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGRyYWluQ2h1bmtzOiBudW1iZXI7XG5cdHJlYWRvbmx5IGRyYWluU2FtcGxlczogbnVtYmVyO1xuXHRyZWFkb25seSBkcmFpbldpbmRvd01zOiBudW1iZXI7XG5cdHJlYWRvbmx5IGRyYWluU2tpcHBlZEJ5TXV0ZTogbnVtYmVyO1xuXHRyZWFkb25seSBkcmFpblNraXBwZWRCeVN1cHByZXNzaW9uOiBudW1iZXI7XG5cdHJlYWRvbmx5IHBvc3RSZWxlYXNlQ2FsbGJhY2tzOiBudW1iZXI7XG5cdHJlYWRvbmx5IHBvc3RSZWxlYXNlU2FtcGxlczogbnVtYmVyO1xuXHRyZWFkb25seSBwb3N0UmVsZWFzZVNraXBwZWRCeU11dGU6IG51bWJlcjtcblx0cmVhZG9ubHkgcG9zdFJlbGVhc2VTa2lwcGVkQnlTdXBwcmVzc2lvbjogbnVtYmVyO1xuXHRyZWFkb25seSBwb3N0UmVsZWFzZVdpbmRvd01zOiBudW1iZXI7XG5cdHJlYWRvbmx5IHJlbGVhc2VkRHVyaW5nQWNxdWlyZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgcHR0VXBXaXRob3V0Q2FwdHVyZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWljQ2FwdHVyZVNlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFN0b3JlIGEgd2luZG93IHJlZmVyZW5jZSBmb3IgbGF0ZXIgbGF6eSBtaWMgYWNxdWlzaXRpb24gd2l0aG91dCBhY3R1YWxseVxuXHQgKiBhY3F1aXJpbmcgdGhlIG1pY3JvcGhvbmUuIFRoZSBtaWMgaXMgYWNxdWlyZWQgb24gYHB0dERvd24oKWAgYW5kIHJlbGVhc2VkXG5cdCAqIG9uIGBwdHRVcCgpYC5cblx0ICovXG5cdHByZXBhcmUod2luZG93OiBXaW5kb3cgJiB0eXBlb2YgZ2xvYmFsVGhpcyk6IHZvaWQ7XG5cblx0LyoqIFN0YXJ0IGNhcHR1cmluZyBhdWRpbyBmcm9tIHRoZSBtaWNyb3Bob25lLiAqL1xuXHRzdGFydENhcHR1cmUod2luZG93OiBXaW5kb3cgJiB0eXBlb2YgZ2xvYmFsVGhpcyk6IFByb21pc2U8dm9pZD47XG5cblx0LyoqIFN0b3AgY2FwdHVyaW5nIGFuZCByZWxlYXNlIG1pYyByZXNvdXJjZXMuICovXG5cdHN0b3BDYXB0dXJlKCk6IHZvaWQ7XG5cblx0cmVhZG9ubHkgaXNDYXB0dXJpbmc6IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIEZpcmVkIHdoZW4gYSBQVFQgc2VnbWVudCBiZWdpbnMgKG1pYyByZWFkeSkuIFRoZSBib29sZWFuIHBheWxvYWQgaXMgdGhlXG5cdCAqIGBwYXNzaXZlYCBmbGFnIGNhcHR1cmVkIGF0IHRoZSBjb3JyZXNwb25kaW5nIGBwdHREb3duYCBjYWxsIChzZWUgdGhlcmUpLlxuXHQgKi9cblx0cmVhZG9ubHkgb25QdHRTdGFydDogRXZlbnQ8Ym9vbGVhbj47XG5cblx0LyoqIEZpcmVkIGR1cmluZyBQVFQgaG9sZCB3aXRoIGJhc2U2NC1lbmNvZGVkIHJhdyBQQ00xNiBjaHVua3MuICovXG5cdHJlYWRvbmx5IG9uUHR0QXVkaW9DaHVuazogRXZlbnQ8c3RyaW5nPjtcblxuXHQvKiogRmlyZWQgd2hlbiBhIFBUVCBzZWdtZW50IGVuZHMuIEFsbCBjaHVua3MgaGF2ZSBiZWVuIHNlbnQgYmVmb3JlIHRoaXMgZmlyZXMuICovXG5cdHJlYWRvbmx5IG9uUHR0RW5kOiBFdmVudDx2b2lkPjtcblxuXHQvKipcblx0ICogRmlyZWQgYWZ0ZXIgdGhlIGRpYWdub3N0aWMgd2luZG93IGNsb3NlcyAofjFzIGFmdGVyIGBwdHRVcGApIHdpdGhcblx0ICogcGVyLXByZXNzIHRlbGVtZXRyeS4gQWx3YXlzIGZpcmVzIEFGVEVSIGBvblB0dEVuZGAgZm9yIG5vcm1hbFxuXHQgKiBwcmVzc2VzLiBVc2VkIGZvciB0YWlsLWxvc3MgZGlhZ25vc2lzOyBzYWZlIHRvIGlnbm9yZSBmb3Igbm9ybWFsXG5cdCAqIG9wZXJhdGlvbi5cblx0ICovXG5cdHJlYWRvbmx5IG9uUHR0RGlhZ25vc3RpYzogRXZlbnQ8SVB0dERpYWdub3N0aWM+O1xuXG5cdC8qKiBUaGUgQW5hbHlzZXJOb2RlIGZvciB2aXN1YWxpc2F0aW9uLCBhdmFpbGFibGUgd2hpbGUgY2FwdHVyaW5nLiAqL1xuXHRyZWFkb25seSBhbmFseXNlck5vZGU6IEFuYWx5c2VyTm9kZSB8IHVuZGVmaW5lZDtcblxuXHQvLyAtLS0gUFRUIC0tLVxuXHQvKipcblx0ICogQmVnaW4gYSBQVFQgc2VnbWVudC4gTGF6aWx5IGFjcXVpcmVzIHRoZSBtaWNyb3Bob25lIGlmIG5vdCBhbHJlYWR5XG5cdCAqIGNhcHR1cmluZy4gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBvbmNlIHRoZSBtaWMgaXMgcmVhZHkgdG9cblx0ICogcmVjb3JkIChvciByZWplY3RzIGlmIGFjcXVpc2l0aW9uIGZhaWxzKS5cblx0ICpcblx0ICogYHR1cm5JZGAgaXMgYW4gb3BhcXVlIHBlci1wcmVzcyBpZGVudGlmaWVyIHByb3BhZ2F0ZWQgaW50byB0aGVcblx0ICogZXZlbnR1YWwgYG9uUHR0RGlhZ25vc3RpY2AgcGF5bG9hZCBmb3IgY29ycmVsYXRpb24gd2l0aCBiYWNrZW5kIGxvZ3MuXG5cdCAqIFBhc3MgZW1wdHkgc3RyaW5nIHdoZW4gbm8gY29ycmVsYXRpb24gaXMgbmVlZGVkLlxuXHQgKlxuXHQgKiBgcGFzc2l2ZWAgbWFya3MgdGhpcyBwcmVzcyBhcyBhIGhhbmRzLWZyZWUgYmFyZ2UtaW4gbGlzdGVuIChtaWMgb3BlbmVkXG5cdCAqIGR1cmluZyBhc3Npc3RhbnQgcGxheWJhY2ssIG5vdCBhIHJlYWwgdXNlciBwcmVzcykuIEl0IGlzIGNhcHR1cmVkXG5cdCAqIGltbXV0YWJseSBhdCBjYWxsIHRpbWUgYW5kIGNhcnJpZWQgb24gdGhlIGBvblB0dFN0YXJ0YCBlbWlzc2lvbi4gVGhpc1xuXHQgKiBzdGF5cyBjb3JyZWN0IGV2ZW4gaWYgdGhlIGNhbGxlcidzIG93biBzdGF0ZSBjaGFuZ2VzIGR1cmluZyB0aGUgYXN5bmNcblx0ICogbWljIGFjcXVpcmUuXG5cdCAqL1xuXHRwdHREb3duKHR1cm5JZDogc3RyaW5nLCBwYXNzaXZlPzogYm9vbGVhbik6IFByb21pc2U8dm9pZD47XG5cblx0LyoqXG5cdCAqIEVuZCBhIFBUVCBzZWdtZW50LiBTZW5kcyBhbnkgcmVtYWluaW5nIGF1ZGlvIGNodW5rcywgdGhlbiBmaXJlcyBwdHRFbmQuXG5cdCAqL1xuXHRwdHRVcCgpOiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBBYm9ydCB0aGUgY3VycmVudCBQVFQgc2VnbWVudCBXSVRIT1VUIGZpcmluZyBgYG9uUHR0RW5kYGAgYW5kIFdJVEhPVVRcblx0ICogdGVhcmluZyBkb3duIHRoZSB3YXJtIG1pYy4gVXNlZCB3aGVuIHRoZSBiYWNrZW5kIGVuZHMgdGhlIHR1cm4gaXRzZWxmXG5cdCAqIChzZXJ2ZXIgVkFEIHNpbGVuY2UgLyBzdG9wIHBocmFzZSk6IHN0cmVhbWluZyBzdG9wcyBpbW1lZGlhdGVseSBmb3IgdGhpc1xuXHQgKiBwcmVzcyBzbyBubyBmdXJ0aGVyIGF1ZGlvIGlzIHNoaXBwZWQsIGJ1dCBubyBjbGllbnQgYGBwdHRfZW5kYGAgaXNcblx0ICogZW1pdHRlZCBmb3IgdGhlIHR1cm4uIFNhZmUgdG8gY2FsbCB3aGVuIG5vIHByZXNzIGlzIGFjdGl2ZS5cblx0ICovXG5cdGFib3J0UHR0KCk6IHZvaWQ7XG5cblx0Ly8gLS0tIE11dGUgLyBBRUMgc3VwcHJlc3Npb24gLS0tXG5cdGlzTXV0ZWQ6IGJvb2xlYW47XG5cblx0LyoqIFN1cHByZXNzIG1pYyBvdXRwdXQgdW50aWwgdGhlIGdpdmVuIHRpbWVzdGFtcCAoQUVDIGdhdGluZykuICovXG5cdHN1cHByZXNzVW50aWwodGltZXN0YW1wOiBudW1iZXIpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgTWljQ2FwdHVyZVNlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU1pY0NhcHR1cmVTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcml2YXRlIF93aW5kb3c6IChXaW5kb3cgJiB0eXBlb2YgZ2xvYmFsVGhpcykgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX21pY1N0cmVhbTogTWVkaWFTdHJlYW0gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfbWljQ3R4OiBBdWRpb0NvbnRleHQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3dvcmtsZXROb2RlOiBBdWRpb1dvcmtsZXROb2RlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9hbmFseXNlck5vZGU6IEFuYWx5c2VyTm9kZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfaXNDYXB0dXJpbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSBfY2FwdHVyZUdlbmVyYXRpb24gPSAwO1xuXHRwcml2YXRlIF9jYXB0dXJlUHJvbWlzZTogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHR0R2VuZXJhdGlvbiA9IDA7XG5cdHByaXZhdGUgX3B0dEhlbGQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfcHR0U3RyZWFtaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX2lzTXV0ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfc3VwcHJlc3NVbnRpbFRzID0gMDtcblx0cHJpdmF0ZSBfcHR0QWNxdWlyaW5nID0gZmFsc2U7XG5cdHByaXZhdGUgX3B0dFJlbGVhc2VkRHVyaW5nQWNxdWlyZSA9IGZhbHNlO1xuXG5cdC8vIC0tLSBIYXJkd2FyZSBtdXRlIGRldGVjdGlvbi4gLS0tXG5cdC8vIEEgaGFyZHdhcmUgbWljcm9waG9uZSBraWxsIHN3aXRjaCAoZS5nLiBvbiBGcmFtZXdvcmsgbGFwdG9wcykgbGVhdmVzXG5cdC8vIGBnZXRVc2VyTWVkaWFgIHN1Y2NlZWRpbmcgd2l0aCBhIHRyYWNrIHdob3NlIGBtdXRlZGAgZmxhZyBpcyBzZXQsIHNvIG5vXG5cdC8vIGFjcXVpc2l0aW9uIGVycm9yIHN1cmZhY2VzLiBUcmFjayB0aGUgbXV0ZSBzdGF0ZSB0byB3YXJuIHRoZSB1c2VyLlxuXHRwcml2YXRlIHJlYWRvbmx5IF9taWNUcmFja0xpc3RlbmVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX21pY011dGVkTm90aWZpZWQgPSBmYWxzZTtcblxuXHQvLyAtLS0gRHJhaW4gc3RhdGUgKHBvc3QtcmVsZWFzZSBjb250aW51ZWQgc3RyZWFtaW5nKS4gLS0tXG5cdC8vIERyYWluIGxlbmd0aCBpcyBlbmZvcmNlZCBwcmltYXJpbHkgYnkgY291bnRpbmcgc2FtcGxlcyBzaGlwcGVkXG5cdC8vIHNpbmNlIGBwdHRVcGAgKGltbXVuZSB0byBtYWluLXRocmVhZCBqaXR0ZXIgdGhhdCB3b3VsZCBza2V3IGFcblx0Ly8gcHVyZSB3YWxsLWNsb2NrIHRpbWVyKS4gVGhlIGZhbGxiYWNrIHRpbWVyIGd1YXJkcyBhZ2FpbnN0IHRoZVxuXHQvLyBgb25hdWRpb3Byb2Nlc3NgIGNhbGxiYWNrIGJlaW5nIHRocm90dGxlZCBvciBzdG9wcGluZyBlbnRpcmVseS5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX1BUVF9EUkFJTl9XSU5ET1dfTVMgPSA1MDA7XG5cdHByaXZhdGUgX3B0dERyYWluVGFyZ2V0U2FtcGxlcyA9IDA7XG5cdHByaXZhdGUgX3B0dERyYWluU2FtcGxlc1NlbnQgPSAwO1xuXHRwcml2YXRlIF9wdHREcmFpbkZhbGxiYWNrVGltZXI6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXG5cdC8vIC0tLSBQZXItcHJlc3MgZGlhZ25vc3RpYyBjb3VudGVycyAocmVzZXQgb24gcHR0RG93bikuIC0tLVxuXHQvLyBEaWFnbm9zdGljIHdpbmRvdyBNVVNUIGJlID4gZHJhaW4gd2luZG93IHNvIGFueSBhdWRpbyBzdGlsbFxuXHQvLyBwcm9kdWNlZCBhZnRlciBkcmFpbiBlbmQgaXMgb2JzZXJ2YWJsZSBhcyBgcG9zdFJlbGVhc2VDYWxsYmFja3NgLlxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfRElBR19QT1NUX1JFTEVBU0VfV0lORE9XX01TID0gMTAwMDtcblx0cHJpdmF0ZSBfZGlhZ1R1cm5JZCA9ICcnO1xuXHRwcml2YXRlIF9kaWFnUHR0RG93blRzID0gMDtcblx0cHJpdmF0ZSBfZGlhZ1B0dFVwVHMgPSAwO1xuXHRwcml2YXRlIF9kaWFnQ2h1bmtzU2VudCA9IDA7XG5cdHByaXZhdGUgX2RpYWdTYW1wbGVzU2VudCA9IDA7XG5cdHByaXZhdGUgX2RpYWdEcmFpbkZpcmVkID0gZmFsc2U7XG5cdHByaXZhdGUgX2RpYWdEcmFpbkNodW5rcyA9IDA7XG5cdHByaXZhdGUgX2RpYWdEcmFpblNhbXBsZXMgPSAwO1xuXHRwcml2YXRlIF9kaWFnRHJhaW5Ta2lwcGVkQnlNdXRlID0gMDtcblx0cHJpdmF0ZSBfZGlhZ0RyYWluU2tpcHBlZEJ5U3VwcHJlc3Npb24gPSAwO1xuXHRwcml2YXRlIF9kaWFnUG9zdFJlbGVhc2VDYWxsYmFja3MgPSAwO1xuXHRwcml2YXRlIF9kaWFnUG9zdFJlbGVhc2VTYW1wbGVzID0gMDtcblx0cHJpdmF0ZSBfZGlhZ1Bvc3RSZWxlYXNlU2tpcHBlZEJ5TXV0ZSA9IDA7XG5cdHByaXZhdGUgX2RpYWdQb3N0UmVsZWFzZVNraXBwZWRCeVN1cHByZXNzaW9uID0gMDtcblx0cHJpdmF0ZSBfZGlhZ1JlbGVhc2VkRHVyaW5nQWNxdWlyZSA9IGZhbHNlO1xuXHRwcml2YXRlIF9kaWFnUHR0VXBXaXRob3V0Q2FwdHVyZSA9IGZhbHNlO1xuXHRwcml2YXRlIF9kaWFnRmlyZVRpbWVyOiBSZXR1cm5UeXBlPHR5cGVvZiBzZXRUaW1lb3V0PiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblB0dFN0YXJ0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uUHR0U3RhcnQ6IEV2ZW50PGJvb2xlYW4+ID0gdGhpcy5fb25QdHRTdGFydC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblB0dEF1ZGlvQ2h1bmsgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvblB0dEF1ZGlvQ2h1bms6IEV2ZW50PHN0cmluZz4gPSB0aGlzLl9vblB0dEF1ZGlvQ2h1bmsuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25QdHRFbmQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25QdHRFbmQ6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25QdHRFbmQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25QdHREaWFnbm9zdGljID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVB0dERpYWdub3N0aWM+KCkpO1xuXHRyZWFkb25seSBvblB0dERpYWdub3N0aWM6IEV2ZW50PElQdHREaWFnbm9zdGljPiA9IHRoaXMuX29uUHR0RGlhZ25vc3RpYy5ldmVudDtcblxuXHRnZXQgaXNDYXB0dXJpbmcoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9pc0NhcHR1cmluZzsgfVxuXHRnZXQgYW5hbHlzZXJOb2RlKCk6IEFuYWx5c2VyTm9kZSB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9hbmFseXNlck5vZGU7IH1cblxuXHRnZXQgaXNNdXRlZCgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2lzTXV0ZWQ7IH1cblx0c2V0IGlzTXV0ZWQodmFsdWU6IGJvb2xlYW4pIHsgdGhpcy5faXNNdXRlZCA9IHZhbHVlOyB9XG5cblx0c3VwcHJlc3NVbnRpbCh0aW1lc3RhbXA6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3N1cHByZXNzVW50aWxUcyA9IHRpbWVzdGFtcDtcblx0fVxuXG5cdHByZXBhcmUod2luZG93OiBXaW5kb3cgJiB0eXBlb2YgZ2xvYmFsVGhpcyk6IHZvaWQge1xuXHRcdHRoaXMuX3dpbmRvdyA9IHdpbmRvdztcblx0fVxuXG5cdGFzeW5jIHB0dERvd24odHVybklkOiBzdHJpbmcsIHBhc3NpdmU6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLl9wdHRIZWxkKSB7IHJldHVybjsgfVxuXHRcdGNvbnN0IHB0dEdlbmVyYXRpb24gPSArK3RoaXMuX3B0dEdlbmVyYXRpb247XG5cdFx0Ly8gSWYgYSBwcmV2aW91cyBwcmVzcyBpcyBzdGlsbCBpbiBpdHMgZHJhaW4gd2luZG93LCBmaW5pc2ggaXRcblx0XHQvLyBub3c6IGNhbmNlbCB0aGUgZmFsbGJhY2sgdGltZXIsIG1hcmsgc3RyZWFtaW5nIGNsb3NlZCwgZmlyZVxuXHRcdC8vIGBfb25QdHRFbmRgLiBPdGhlcndpc2UgdGhlIGJhY2tlbmQgd291bGQga2VlcCB0aGUgcHJpb3IgdHVyblxuXHRcdC8vIG9wZW4gYW5kIG91ciBuZXcgdHVybiB3b3VsZCByYWNlIGFnYWluc3QgaXQuXG5cdFx0Ly9cblx0XHQvLyBUaGlzIGlzIGFsc28gYSByZXF1aXJlZCBvcmRlcmluZyBndWFyYW50ZWU6IGZsdXNoaW5nIHRoZVxuXHRcdC8vIGRyYWluIChhbmQgaXRzIGBfb25QdHRFbmRgKSBiZWZvcmUgdGhpcyB0dXJuJ3MgYF9vblB0dFN0YXJ0YFxuXHRcdC8vIGZpcmVzIGJlbG93IGtlZXBzIHRoZSB3aXJlIG9yZGVyIGBwdHRfZW5kYChwcmV2KSB0aGVuXG5cdFx0Ly8gYHB0dF9zdGFydGAobmV4dCkuIGBwdHRfZW5kYCBjYXJyaWVzIG5vIHR1cm5faWQsIHNvIHRoZSBiYWNrZW5kXG5cdFx0Ly8gcmVsaWVzIG9uIHRoYXQgb3JkZXIgdG8gZW5kIHRoZSBjb3JyZWN0IHR1cm4gYW5kIG5ldmVyIHRoZVxuXHRcdC8vIGZyZXNobHkgb3BlbmVkIG9uZS4gS2VlcCBgX2ZpbmlzaERyYWluKClgIGFoZWFkIG9mIGV2ZXJ5XG5cdFx0Ly8gYF9vblB0dFN0YXJ0LmZpcmUoKWAgcGF0aCBpZiB0aGlzIG1ldGhvZCBpcyByZWZhY3RvcmVkLlxuXHRcdHRoaXMuX2ZpbmlzaERyYWluKCk7XG5cdFx0Ly8gSWYgYSBwcmV2aW91cyBwcmVzcydzIGRpYWdub3N0aWMgaGFzbid0IGZpcmVkIHlldCAoYmFjay10by1iYWNrXG5cdFx0Ly8gcHJlc3NlcyBpbnNpZGUgdGhlIGRpYWdub3N0aWMgd2luZG93KSwgZW1pdCBpdCBub3cgc28gaXRcblx0XHQvLyBpc24ndCBvdmVyd3JpdHRlbiBieSB0aGlzIHByZXNzJ3MgcmVzZXQuXG5cdFx0dGhpcy5fZmx1c2hQZW5kaW5nRGlhZ25vc3RpYygpO1xuXHRcdHRoaXMuX3Jlc2V0RGlhZ25vc3RpY0NvdW50ZXJzKHR1cm5JZCk7XG5cdFx0dGhpcy5fcHR0SGVsZCA9IHRydWU7XG5cdFx0dGhpcy5fcHR0U3RyZWFtaW5nID0gdHJ1ZTtcblx0XHR0aGlzLl9wdHRSZWxlYXNlZER1cmluZ0FjcXVpcmUgPSBmYWxzZTtcblx0XHR0aGlzLl9pc011dGVkID0gZmFsc2U7XG5cblx0XHRpZiAodGhpcy5faXNDYXB0dXJpbmcpIHtcblx0XHRcdHRoaXMuX29uUHR0U3RhcnQuZmlyZShwYXNzaXZlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl93aW5kb3cpIHsgcmV0dXJuOyB9XG5cdFx0aWYgKHRoaXMuX3B0dEFjcXVpcmluZykgeyByZXR1cm47IH1cblxuXHRcdHRoaXMuX3B0dEFjcXVpcmluZyA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuc3RhcnRDYXB0dXJlKHRoaXMuX3dpbmRvdyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAocHR0R2VuZXJhdGlvbiAhPT0gdGhpcy5fcHR0R2VuZXJhdGlvbikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9wdHRIZWxkID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9wdHRTdHJlYW1pbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuX3B0dFJlbGVhc2VkRHVyaW5nQWNxdWlyZSA9IGZhbHNlO1xuXHRcdFx0dGhyb3cgZXJyO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRpZiAocHR0R2VuZXJhdGlvbiA9PT0gdGhpcy5fcHR0R2VuZXJhdGlvbikge1xuXHRcdFx0XHR0aGlzLl9wdHRBY3F1aXJpbmcgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKHB0dEdlbmVyYXRpb24gIT09IHRoaXMuX3B0dEdlbmVyYXRpb24gfHwgIXRoaXMuX2lzQ2FwdHVyaW5nIHx8ICF0aGlzLl9wdHRIZWxkKSB7XG5cdFx0XHR0aGlzLl9wdHRSZWxlYXNlZER1cmluZ0FjcXVpcmUgPSBmYWxzZTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fb25QdHRTdGFydC5maXJlKHBhc3NpdmUpO1xuXG5cdFx0aWYgKHRoaXMuX3B0dFJlbGVhc2VkRHVyaW5nQWNxdWlyZSkge1xuXHRcdFx0dGhpcy5fcHR0UmVsZWFzZWREdXJpbmdBY3F1aXJlID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9wdHRTdHJlYW1pbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2RpYWdSZWxlYXNlZER1cmluZ0FjcXVpcmUgPSB0cnVlO1xuXHRcdFx0dGhpcy5fb25QdHRFbmQuZmlyZSgpO1xuXHRcdFx0dGhpcy5zdG9wQ2FwdHVyZSgpO1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVEaWFnbm9zdGljRmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHB0dFVwKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fcHR0SGVsZCkgeyByZXR1cm47IH1cblxuXHRcdGlmICh0aGlzLl9wdHRBY3F1aXJpbmcpIHtcblx0XHRcdHRoaXMuX3B0dFJlbGVhc2VkRHVyaW5nQWNxdWlyZSA9IHRydWU7XG5cdFx0XHR0aGlzLl9kaWFnUmVsZWFzZWREdXJpbmdBY3F1aXJlID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2RpYWdQdHRVcFRzID0gRGF0ZS5ub3coKTtcblx0XHRcdHRoaXMuX3NjaGVkdWxlRGlhZ25vc3RpY0ZpcmUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2lzQ2FwdHVyaW5nKSB7XG5cdFx0XHR0aGlzLl9wdHRIZWxkID0gZmFsc2U7XG5cdFx0XHR0aGlzLl9wdHRTdHJlYW1pbmcgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2RpYWdQdHRVcFdpdGhvdXRDYXB0dXJlID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2RpYWdQdHRVcFRzID0gRGF0ZS5ub3coKTtcblx0XHRcdHRoaXMuX3NjaGVkdWxlRGlhZ25vc3RpY0ZpcmUoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9wdHRIZWxkID0gZmFsc2U7XG5cdFx0dGhpcy5fZGlhZ1B0dFVwVHMgPSBEYXRlLm5vdygpO1xuXHRcdC8vIFN0YXJ0IGRyYWluOiBrZWVwIGBfcHR0U3RyZWFtaW5nYCB0cnVlIHNvIHN1YnNlcXVlbnRcblx0XHQvLyBgb25hdWRpb3Byb2Nlc3NgIGNhbGxiYWNrcyBjb250aW51ZSB0byBzaGlwIGF1ZGlvLiBFbmQgdGhlXG5cdFx0Ly8gZHJhaW4gb25jZSB3ZSd2ZSBzaGlwcGVkIGEgZnVsbCB3aW5kb3cgb2Ygc2FtcGxlcywgT1IgYWZ0ZXJcblx0XHQvLyB0aGUgZmFsbGJhY2sgdGltZXIgdHJpcHMgaWYgYG9uYXVkaW9wcm9jZXNzYCBzdG9wcyBmaXJpbmcuXG5cdFx0Y29uc3Qgc2FtcGxlUmF0ZSA9IHRoaXMuX21pY0N0eD8uc2FtcGxlUmF0ZSA/PyAxNjAwMDtcblx0XHR0aGlzLl9wdHREcmFpblRhcmdldFNhbXBsZXMgPSBNYXRoLmNlaWwoXG5cdFx0XHRzYW1wbGVSYXRlICogTWljQ2FwdHVyZVNlcnZpY2UuX1BUVF9EUkFJTl9XSU5ET1dfTVMgLyAxMDAwXG5cdFx0KTtcblx0XHR0aGlzLl9wdHREcmFpblNhbXBsZXNTZW50ID0gMDtcblx0XHR0aGlzLl9wdHREcmFpbkZhbGxiYWNrVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3B0dERyYWluRmFsbGJhY2tUaW1lciA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2ZpbmlzaERyYWluKCk7XG5cdFx0fSwgTWljQ2FwdHVyZVNlcnZpY2UuX1BUVF9EUkFJTl9XSU5ET1dfTVMgKyAyNTApO1xuXHRcdHRoaXMuX3NjaGVkdWxlRGlhZ25vc3RpY0ZpcmUoKTtcblx0fVxuXG5cdGFib3J0UHR0KCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fcHR0SGVsZCAmJiAhdGhpcy5fcHR0U3RyZWFtaW5nKSB7IHJldHVybjsgfVxuXHRcdC8vIENhbmNlbCBhbnkgaW4tZmxpZ2h0IGRyYWluIGFuZCBzdG9wIHN0cmVhbWluZyBpbW1lZGlhdGVseS4gVW5saWtlXG5cdFx0Ly8gYHB0dFVwKClgIHRoaXMgcnVucyBOTyBwb3N0LXJlbGVhc2UgZHJhaW4gYW5kIGZpcmVzIE5PIGBfb25QdHRFbmRgOlxuXHRcdC8vIHRoZSBiYWNrZW5kIGFscmVhZHkgZW5kZWQgdGhlIHR1cm4sIHNvIHdlIG11c3Qgbm90IHNoaXAgbW9yZSBhdWRpb1xuXHRcdC8vIGZvciBpdCBub3IgZW1pdCBvdXIgb3duIHB0dF9lbmQuIFRoZSBtaWMvQXVkaW9Db250ZXh0IHN0YXlzIHdhcm0gZm9yXG5cdFx0Ly8gdGhlIG5leHQgcHJlc3MuXG5cdFx0aWYgKHRoaXMuX3B0dERyYWluRmFsbGJhY2tUaW1lcikge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX3B0dERyYWluRmFsbGJhY2tUaW1lcik7XG5cdFx0XHR0aGlzLl9wdHREcmFpbkZhbGxiYWNrVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX3B0dERyYWluVGFyZ2V0U2FtcGxlcyA9IDA7XG5cdFx0dGhpcy5fcHR0RHJhaW5TYW1wbGVzU2VudCA9IDA7XG5cdFx0dGhpcy5fcHR0R2VuZXJhdGlvbisrO1xuXHRcdHRoaXMuX3B0dEFjcXVpcmluZyA9IGZhbHNlO1xuXHRcdHRoaXMuX3B0dEhlbGQgPSBmYWxzZTtcblx0XHR0aGlzLl9wdHRTdHJlYW1pbmcgPSBmYWxzZTtcblx0XHR0aGlzLl9wdHRSZWxlYXNlZER1cmluZ0FjcXVpcmUgPSBmYWxzZTtcblx0XHQvLyBTdGlsbCBlbWl0IHRoZSBwZXItcHJlc3MgZGlhZ25vc3RpYyAoa2V5ZWQgYnkgdHVybklkKSwgbWF0Y2hpbmcgcHR0VXAuXG5cdFx0dGhpcy5fZGlhZ1B0dFVwVHMgPSBEYXRlLm5vdygpO1xuXHRcdHRoaXMuX3NjaGVkdWxlRGlhZ25vc3RpY0ZpcmUoKTtcblx0fVxuXG5cdGFzeW5jIHN0YXJ0Q2FwdHVyZSh3aW5kb3c6IFdpbmRvdyAmIHR5cGVvZiBnbG9iYWxUaGlzKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fd2luZG93ID0gd2luZG93O1xuXHRcdGlmICh0aGlzLl9pc0NhcHR1cmluZykgeyByZXR1cm47IH1cblx0XHRpZiAodGhpcy5fY2FwdHVyZVByb21pc2UpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jYXB0dXJlUHJvbWlzZTtcblx0XHR9XG5cdFx0Y29uc3QgY2FwdHVyZVByb21pc2UgPSB0aGlzLl9zdGFydENhcHR1cmUod2luZG93KTtcblx0XHR0aGlzLl9jYXB0dXJlUHJvbWlzZSA9IGNhcHR1cmVQcm9taXNlO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBjYXB0dXJlUHJvbWlzZTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHRoaXMuX2NhcHR1cmVQcm9taXNlID09PSBjYXB0dXJlUHJvbWlzZSkge1xuXHRcdFx0XHR0aGlzLl9jYXB0dXJlUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9zdGFydENhcHR1cmUod2luZG93OiBXaW5kb3cgJiB0eXBlb2YgZ2xvYmFsVGhpcyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNhcHR1cmVHZW5lcmF0aW9uID0gdGhpcy5fY2FwdHVyZUdlbmVyYXRpb247XG5cdFx0Y29uc3QgZGV2aWNlSWQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChBZ2VudHNWb2ljZVN0b3JhZ2VLZXlzLk1pY3JvcGhvbmVEZXZpY2UsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0Y29uc3QgYXVkaW9Db25zdHJhaW50czogTWVkaWFUcmFja0NvbnN0cmFpbnRzID0ge1xuXHRcdFx0Y2hhbm5lbENvdW50OiAxLFxuXHRcdFx0c2FtcGxlUmF0ZTogMTYwMDAsXG5cdFx0XHRlY2hvQ2FuY2VsbGF0aW9uOiB0cnVlLFxuXHRcdFx0bm9pc2VTdXBwcmVzc2lvbjogdHJ1ZSxcblx0XHR9O1xuXHRcdGlmIChkZXZpY2VJZCkge1xuXHRcdFx0YXVkaW9Db25zdHJhaW50cy5kZXZpY2VJZCA9IHsgZXhhY3Q6IGRldmljZUlkIH07XG5cdFx0fVxuXG5cdFx0bGV0IG1pY1N0cmVhbTogTWVkaWFTdHJlYW07XG5cdFx0dHJ5IHtcblx0XHRcdG1pY1N0cmVhbSA9IGF3YWl0IHdpbmRvdy5uYXZpZ2F0b3IubWVkaWFEZXZpY2VzLmdldFVzZXJNZWRpYSh7XG5cdFx0XHRcdGF1ZGlvOiBhdWRpb0NvbnN0cmFpbnRzLFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHQvLyBJZiB0aGUgc3RvcmVkIGRldmljZSBpcyB1bmF2YWlsYWJsZSAodW5wbHVnZ2VkL3N0YWxlIElEKSwgZmFsbCBiYWNrXG5cdFx0XHQvLyB0byBzeXN0ZW0gZGVmYXVsdC4gT25seSByZXRyeSBvbiBkZXZpY2Utc3BlY2lmaWMgZXJyb3JzLlxuXHRcdFx0Y29uc3QgaXNEZXZpY2VFcnJvciA9IGRldmljZUlkICYmIGVyciBpbnN0YW5jZW9mIERPTUV4Y2VwdGlvbiAmJlxuXHRcdFx0XHQoZXJyLm5hbWUgPT09ICdPdmVyY29uc3RyYWluZWRFcnJvcicgfHwgZXJyLm5hbWUgPT09ICdOb3RGb3VuZEVycm9yJyk7XG5cdFx0XHRpZiAoaXNEZXZpY2VFcnJvcikge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgW21pY10gUHJlZmVycmVkIGRldmljZSAke2RldmljZUlkLnNsaWNlKDAsIDgpfVx1MjAyNiB1bmF2YWlsYWJsZSwgZmFsbGluZyBiYWNrIHRvIGRlZmF1bHRgKTtcblx0XHRcdFx0ZGVsZXRlIGF1ZGlvQ29uc3RyYWludHMuZGV2aWNlSWQ7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0bWljU3RyZWFtID0gYXdhaXQgd2luZG93Lm5hdmlnYXRvci5tZWRpYURldmljZXMuZ2V0VXNlck1lZGlhKHtcblx0XHRcdFx0XHRcdGF1ZGlvOiBhdWRpb0NvbnN0cmFpbnRzLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9IGNhdGNoIChyZXRyeUVycikge1xuXHRcdFx0XHRcdHRoaXMuX25vdGlmeU1pY1Blcm1pc3Npb25EZW5pZWQocmV0cnlFcnIpO1xuXHRcdFx0XHRcdHRocm93IHJldHJ5RXJyO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9ub3RpZnlNaWNQZXJtaXNzaW9uRGVuaWVkKGVycik7XG5cdFx0XHRcdHRocm93IGVycjtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGNhcHR1cmVHZW5lcmF0aW9uICE9PSB0aGlzLl9jYXB0dXJlR2VuZXJhdGlvbikge1xuXHRcdFx0bWljU3RyZWFtLmdldFRyYWNrcygpLmZvckVhY2godHJhY2sgPT4gdHJhY2suc3RvcCgpKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fbWljU3RyZWFtID0gbWljU3RyZWFtO1xuXG5cdFx0Y29uc3QgY2xlYW51cEZhaWxlZENhcHR1cmUgPSAoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fbWljU3RyZWFtID09PSBtaWNTdHJlYW0pIHtcblx0XHRcdFx0dGhpcy5fc3RvcENhcHR1cmVSZXNvdXJjZXMoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdG1pY1N0cmVhbS5nZXRUcmFja3MoKS5mb3JFYWNoKHRyYWNrID0+IHRyYWNrLnN0b3AoKSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGxldCBjdHg6IEF1ZGlvQ29udGV4dDtcblx0XHRsZXQgc291cmNlOiBNZWRpYVN0cmVhbUF1ZGlvU291cmNlTm9kZTtcblx0XHR0cnkge1xuXHRcdFx0Ly8gRGV0ZWN0IGEgaGFyZHdhcmUtbXV0ZWQgbWljcm9waG9uZSAoZS5nLiBhIHBoeXNpY2FsIGtpbGwgc3dpdGNoKS5cblx0XHRcdC8vIGBnZXRVc2VyTWVkaWFgIHN1Y2NlZWRzIGluIHRoaXMgY2FzZSBidXQgdGhlIHRyYWNrIHByb2R1Y2VzIHNpbGVuY2UsXG5cdFx0XHQvLyBzbyB3aXRob3V0IHRoaXMgY2hlY2sgUFRUIHdvdWxkIGFwcGVhciB0byB3b3JrIHdoaWxlIGNhcHR1cmluZyBub3RoaW5nLlxuXHRcdFx0dGhpcy5fbWljVHJhY2tMaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHRcdHRoaXMuX21pY011dGVkTm90aWZpZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGF1ZGlvVHJhY2sgPSBtaWNTdHJlYW0uZ2V0QXVkaW9UcmFja3MoKVswXTtcblx0XHRcdGlmIChhdWRpb1RyYWNrKSB7XG5cdFx0XHRcdGlmIChhdWRpb1RyYWNrLm11dGVkKSB7XG5cdFx0XHRcdFx0dGhpcy5fbm90aWZ5TWljcm9waG9uZU11dGVkKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fbWljVHJhY2tMaXN0ZW5lcnMuYWRkKGFkZERpc3Bvc2FibGVMaXN0ZW5lcihhdWRpb1RyYWNrLCAnbXV0ZScsICgpID0+IHRoaXMuX25vdGlmeU1pY3JvcGhvbmVNdXRlZCgpKSk7XG5cdFx0XHRcdHRoaXMuX21pY1RyYWNrTGlzdGVuZXJzLmFkZChhZGREaXNwb3NhYmxlTGlzdGVuZXIoYXVkaW9UcmFjaywgJ3VubXV0ZScsICgpID0+IHsgdGhpcy5fbWljTXV0ZWROb3RpZmllZCA9IGZhbHNlOyB9KSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy5fbWljQ3R4KSB7XG5cdFx0XHRcdHRoaXMuX21pY0N0eCA9IG5ldyB3aW5kb3cuQXVkaW9Db250ZXh0KHsgc2FtcGxlUmF0ZTogMTYwMDAgfSk7XG5cdFx0XHR9XG5cdFx0XHRjdHggPSB0aGlzLl9taWNDdHg7XG5cdFx0XHRzb3VyY2UgPSBjdHguY3JlYXRlTWVkaWFTdHJlYW1Tb3VyY2UobWljU3RyZWFtKTtcblxuXHRcdFx0Y29uc3QgYW5hbHlzZXIgPSBjdHguY3JlYXRlQW5hbHlzZXIoKTtcblx0XHRcdGFuYWx5c2VyLmZmdFNpemUgPSAyNTY7XG5cdFx0XHRzb3VyY2UuY29ubmVjdChhbmFseXNlcik7XG5cdFx0XHR0aGlzLl9hbmFseXNlck5vZGUgPSBhbmFseXNlcjtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNsZWFudXBGYWlsZWRDYXB0dXJlKCk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2FwdHVyZU5vZGVQcm9taXNlID0gY3JlYXRlUGNtQ2FwdHVyZU5vZGUod2luZG93LCBjdHgsIE1JQ19DQVBUVVJFX0NIVU5LX1NJWkUsIHNhbXBsZXMgPT4ge1xuXHRcdFx0Y29uc3Qgbm93VHMgPSBEYXRlLm5vdygpO1xuXHRcdFx0Y29uc3QgcHRVcFRzID0gdGhpcy5fZGlhZ1B0dFVwVHM7XG5cdFx0XHQvLyBBIGNhbGxiYWNrIGlzIGEgXCJkcmFpblwiIGNhbGxiYWNrIHdoaWxlIHdlJ3JlIHN0aWxsIGluIHRoZVxuXHRcdFx0Ly8gZHJhaW4gd2luZG93IGFmdGVyIHJlbGVhc2U6IF9wdHRTdHJlYW1pbmcgaXMgdHJ1ZSAoZHJhaW5cblx0XHRcdC8vIGhhc24ndCBmaW5pc2hlZCkgQU5EIF9wdHRIZWxkIGlzIGZhbHNlICh1c2VyIHJlbGVhc2VkKS5cblx0XHRcdGNvbnN0IGlzRHJhaW5DYWxsYmFjayA9IHRoaXMuX3B0dFN0cmVhbWluZyAmJiAhdGhpcy5fcHR0SGVsZDtcblx0XHRcdC8vIEEgY2FsbGJhY2sgaXMgXCJwb3N0LXJlbGVhc2VcIiBvbmNlIGRyYWluIGhhcyBmaW5pc2hlZFxuXHRcdFx0Ly8gKF9wdHRTdHJlYW1pbmcgZmxpcHBlZCB0byBmYWxzZSBpbiBfZmluaXNoRHJhaW4pIGJ1dCB3ZSdyZVxuXHRcdFx0Ly8gc3RpbGwgaW5zaWRlIHRoZSB3aWRlciBkaWFnbm9zdGljIHdpbmRvdy4gQXVkaW8gaW4gdGhpc1xuXHRcdFx0Ly8gd2luZG93IGlzIGN1cnJlbnRseSBEUk9QUEVEOyB0aGUgY291bnQgaXMgb3VyIHNpZ25hbCB0aGF0XG5cdFx0XHQvLyB0aGUgZHJhaW4gd2luZG93IGlzIHRvbyBzaG9ydC5cblx0XHRcdGNvbnN0IGluRGlhZ1dpbmRvdyA9XG5cdFx0XHRcdHB0VXBUcyA+IDAgJiZcblx0XHRcdFx0IXRoaXMuX3B0dEhlbGQgJiZcblx0XHRcdFx0bm93VHMgPD0gcHRVcFRzICsgTWljQ2FwdHVyZVNlcnZpY2UuX0RJQUdfUE9TVF9SRUxFQVNFX1dJTkRPV19NUztcblx0XHRcdGNvbnN0IGlzUG9zdFJlbGVhc2VDYWxsYmFjayA9ICF0aGlzLl9wdHRTdHJlYW1pbmcgJiYgaW5EaWFnV2luZG93O1xuXG5cdFx0XHRpZiAodGhpcy5faXNNdXRlZCkge1xuXHRcdFx0XHRpZiAoaXNEcmFpbkNhbGxiYWNrKSB7IHRoaXMuX2RpYWdEcmFpblNraXBwZWRCeU11dGUrKzsgfVxuXHRcdFx0XHRpZiAoaXNQb3N0UmVsZWFzZUNhbGxiYWNrKSB7IHRoaXMuX2RpYWdQb3N0UmVsZWFzZVNraXBwZWRCeU11dGUrKzsgfVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChub3dUcyA8IHRoaXMuX3N1cHByZXNzVW50aWxUcykge1xuXHRcdFx0XHRpZiAoaXNEcmFpbkNhbGxiYWNrKSB7IHRoaXMuX2RpYWdEcmFpblNraXBwZWRCeVN1cHByZXNzaW9uKys7IH1cblx0XHRcdFx0aWYgKGlzUG9zdFJlbGVhc2VDYWxsYmFjaykgeyB0aGlzLl9kaWFnUG9zdFJlbGVhc2VTa2lwcGVkQnlTdXBwcmVzc2lvbisrOyB9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCF0aGlzLl9wdHRTdHJlYW1pbmcpIHtcblx0XHRcdFx0aWYgKGlzUG9zdFJlbGVhc2VDYWxsYmFjaykge1xuXHRcdFx0XHRcdHRoaXMuX2RpYWdQb3N0UmVsZWFzZUNhbGxiYWNrcysrO1xuXHRcdFx0XHRcdHRoaXMuX2RpYWdQb3N0UmVsZWFzZVNhbXBsZXMgKz0gc2FtcGxlcy5sZW5ndGg7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBiNjQgPSBlbmNvZGVSYXdQY20xNkJhc2U2NChzYW1wbGVzLCB0aGlzLl93aW5kb3chKTtcblx0XHRcdHRoaXMuX2RpYWdDaHVua3NTZW50Kys7XG5cdFx0XHR0aGlzLl9kaWFnU2FtcGxlc1NlbnQgKz0gc2FtcGxlcy5sZW5ndGg7XG5cdFx0XHRpZiAoaXNEcmFpbkNhbGxiYWNrKSB7XG5cdFx0XHRcdHRoaXMuX2RpYWdEcmFpbkZpcmVkID0gdHJ1ZTtcblx0XHRcdFx0dGhpcy5fZGlhZ0RyYWluQ2h1bmtzKys7XG5cdFx0XHRcdHRoaXMuX2RpYWdEcmFpblNhbXBsZXMgKz0gc2FtcGxlcy5sZW5ndGg7XG5cdFx0XHRcdHRoaXMuX3B0dERyYWluU2FtcGxlc1NlbnQgKz0gc2FtcGxlcy5sZW5ndGg7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9vblB0dEF1ZGlvQ2h1bmsuZmlyZShiNjQpO1xuXG5cdFx0XHQvLyBFbmQgdGhlIGRyYWluIGFzIHNvb24gYXMgd2UndmUgc2hpcHBlZCBhIGZ1bGwgd2luZG93IG9mXG5cdFx0XHQvLyBhdWRpby4gRG9pbmcgdGhpcyBBRlRFUiBmaXJpbmcgdGhlIGNodW5rIGd1YXJhbnRlZXMgdGhlXG5cdFx0XHQvLyBmaW5hbCBkcmFpbiBjaHVuayByZWFjaGVzIHRoZSBiYWNrZW5kIGJlZm9yZSBgX29uUHR0RW5kYC5cblx0XHRcdGlmIChpc0RyYWluQ2FsbGJhY2sgJiYgdGhpcy5fcHR0RHJhaW5TYW1wbGVzU2VudCA+PSB0aGlzLl9wdHREcmFpblRhcmdldFNhbXBsZXMpIHtcblx0XHRcdFx0dGhpcy5fZmluaXNoRHJhaW4oKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGxldCBub2RlOiBBdWRpb1dvcmtsZXROb2RlO1xuXHRcdHRyeSB7XG5cdFx0XHRub2RlID0gKGF3YWl0IGNhcHR1cmVOb2RlUHJvbWlzZSkubm9kZTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGNsZWFudXBGYWlsZWRDYXB0dXJlKCk7XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXG5cdFx0Ly8gc3RvcENhcHR1cmUoKSBtYXkgaGF2ZSBydW4gd2hpbGUgdGhlIHdvcmtsZXQgbW9kdWxlIHdhcyBsb2FkaW5nLlxuXHRcdGlmICh0aGlzLl9taWNDdHggIT09IGN0eCkge1xuXHRcdFx0dHJ5IHsgbm9kZS5kaXNjb25uZWN0KCk7IH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLl93b3JrbGV0Tm9kZSA9IG5vZGU7XG5cdFx0XHRzb3VyY2UuY29ubmVjdChub2RlKTtcblx0XHRcdG5vZGUuY29ubmVjdChjdHguZGVzdGluYXRpb24pO1xuXHRcdFx0dGhpcy5faXNDYXB0dXJpbmcgPSB0cnVlO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0Y2xlYW51cEZhaWxlZENhcHR1cmUoKTtcblx0XHRcdHRocm93IGVycjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9ub3RpZnlNaWNQZXJtaXNzaW9uRGVuaWVkKGVycjogdW5rbm93bik6IHZvaWQge1xuXHRcdGlmIChpc01pY3JvcGhvbmVQZXJtaXNzaW9uRGVuaWVkRXJyb3IoZXJyKSkge1xuXHRcdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRcdHNldmVyaXR5OiBTZXZlcml0eS5FcnJvcixcblx0XHRcdFx0bWVzc2FnZTogbG9jYWxpemUoJ21pYy5wZXJtaXNzaW9uRGVuaWVkJywgXCJNaWNyb3Bob25lIGFjY2VzcyB3YXMgZGVuaWVkLiBHcmFudCBtaWNyb3Bob25lIHBlcm1pc3Npb24gaW4geW91ciBzeXN0ZW0gc2V0dGluZ3MgdG8gdXNlIFZvaWNlIE1vZGUuXCIpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbm90aWZ5TWljcm9waG9uZU11dGVkKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9taWNNdXRlZE5vdGlmaWVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX21pY011dGVkTm90aWZpZWQgPSB0cnVlO1xuXHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdbbWljXSBNaWNyb3Bob25lIHRyYWNrIGlzIG11dGVkIFx1MjAxNCBsaWtlbHkgYSBoYXJkd2FyZSBtdXRlIHN3aXRjaCBpcyBlbmFibGVkJyk7XG5cdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLm5vdGlmeSh7XG5cdFx0XHRzZXZlcml0eTogU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdG1lc3NhZ2U6IGxvY2FsaXplKCdtaWMuaGFyZHdhcmVNdXRlZCcsIFwiWW91ciBtaWNyb3Bob25lIGFwcGVhcnMgdG8gYmUgbXV0ZWQgb3IgZGlzYWJsZWQsIHBvc3NpYmx5IGJ5IGEgaGFyZHdhcmUgc3dpdGNoLiBWb2ljZSBNb2RlIHdvbid0IGhlYXIgeW91IHVudGlsIGl0J3MgcmUtZW5hYmxlZC5cIiksXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9zdG9wQ2FwdHVyZVJlc291cmNlcygpOiB2b2lkIHtcblx0XHR0aGlzLl9jYXB0dXJlR2VuZXJhdGlvbisrO1xuXHRcdHRoaXMuX2NhcHR1cmVQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdGlmICh0aGlzLl93b3JrbGV0Tm9kZSkge1xuXHRcdFx0dGhpcy5fd29ya2xldE5vZGUucG9ydC5vbm1lc3NhZ2UgPSBudWxsO1xuXHRcdFx0dHJ5IHsgdGhpcy5fd29ya2xldE5vZGUuZGlzY29ubmVjdCgpOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0XHRcdHRoaXMuX3dvcmtsZXROb2RlID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9hbmFseXNlck5vZGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbWljQ3R4Py5jbG9zZSgpO1xuXHRcdHRoaXMuX21pY0N0eCA9IHVuZGVmaW5lZDtcblx0XHRpZiAodGhpcy5fbWljU3RyZWFtKSB7XG5cdFx0XHR0aGlzLl9taWNTdHJlYW0uZ2V0VHJhY2tzKCkuZm9yRWFjaCh0ID0+IHQuc3RvcCgpKTtcblx0XHRcdHRoaXMuX21pY1N0cmVhbSA9IG51bGw7XG5cdFx0fVxuXHRcdHRoaXMuX21pY1RyYWNrTGlzdGVuZXJzLmNsZWFyKCk7XG5cdFx0dGhpcy5fbWljTXV0ZWROb3RpZmllZCA9IGZhbHNlO1xuXHRcdHRoaXMuX2lzQ2FwdHVyaW5nID0gZmFsc2U7XG5cdH1cblxuXHRzdG9wQ2FwdHVyZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9wQ2FwdHVyZVJlc291cmNlcygpO1xuXHRcdHRoaXMuX3B0dEdlbmVyYXRpb24rKztcblx0XHR0aGlzLl9wdHRBY3F1aXJpbmcgPSBmYWxzZTtcblx0XHQvLyBDYW5jZWwgYW55IGluLWZsaWdodCBkcmFpbjsgZG8gTk9UIGZpcmUgYF9vblB0dEVuZGAgaGVyZVxuXHRcdC8vIGJlY2F1c2UgY2FsbGVycyAocmVjb25uZWN0IC8gZGlzY29ubmVjdCAvIGRpc3Bvc2UpIGhhdmVcblx0XHQvLyBhbHJlYWR5IHRvcm4gZG93biBvciBhcmUgYWJvdXQgdG8gdGVhciBkb3duIHRoZSBiYWNrZW5kXG5cdFx0Ly8gY29ubmVjdGlvbi5cblx0XHRpZiAodGhpcy5fcHR0RHJhaW5GYWxsYmFja1RpbWVyKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fcHR0RHJhaW5GYWxsYmFja1RpbWVyKTtcblx0XHRcdHRoaXMuX3B0dERyYWluRmFsbGJhY2tUaW1lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fcHR0RHJhaW5UYXJnZXRTYW1wbGVzID0gMDtcblx0XHR0aGlzLl9wdHREcmFpblNhbXBsZXNTZW50ID0gMDtcblx0XHR0aGlzLl9wdHRIZWxkID0gZmFsc2U7XG5cdFx0dGhpcy5fcHR0U3RyZWFtaW5nID0gZmFsc2U7XG5cdFx0dGhpcy5fcHR0UmVsZWFzZWREdXJpbmdBY3F1aXJlID0gZmFsc2U7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9kaWFnRmlyZVRpbWVyKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fZGlhZ0ZpcmVUaW1lcik7XG5cdFx0XHR0aGlzLl9kaWFnRmlyZVRpbWVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fcHR0RHJhaW5GYWxsYmFja1RpbWVyKSB7XG5cdFx0XHRjbGVhclRpbWVvdXQodGhpcy5fcHR0RHJhaW5GYWxsYmFja1RpbWVyKTtcblx0XHRcdHRoaXMuX3B0dERyYWluRmFsbGJhY2tUaW1lciA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5zdG9wQ2FwdHVyZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFbmQgdGhlIHBvc3QtcmVsZWFzZSBkcmFpbiBwaGFzZTogc3RvcCBhY2NlcHRpbmcgbW9yZSBhdWRpbyBmb3Jcblx0ICogdGhpcyB0dXJuIGFuZCBmaXJlIGBfb25QdHRFbmRgLiBJZGVtcG90ZW50LiBTYWZlIHRvIGNhbGwgd2hlbiBub1xuXHQgKiBkcmFpbiBpcyBpbiBwcm9ncmVzcy5cblx0ICovXG5cdHByaXZhdGUgX2ZpbmlzaERyYWluKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wdHREcmFpbkZhbGxiYWNrVGltZXIpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9wdHREcmFpbkZhbGxiYWNrVGltZXIpO1xuXHRcdFx0dGhpcy5fcHR0RHJhaW5GYWxsYmFja1RpbWVyID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0aGlzLl9wdHREcmFpblRhcmdldFNhbXBsZXMgPSAwO1xuXHRcdHRoaXMuX3B0dERyYWluU2FtcGxlc1NlbnQgPSAwO1xuXHRcdGlmICh0aGlzLl9wdHRTdHJlYW1pbmcgJiYgIXRoaXMuX3B0dEhlbGQpIHtcblx0XHRcdHRoaXMuX3B0dFN0cmVhbWluZyA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fb25QdHRFbmQuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3Jlc2V0RGlhZ25vc3RpY0NvdW50ZXJzKHR1cm5JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlhZ1R1cm5JZCA9IHR1cm5JZDtcblx0XHR0aGlzLl9kaWFnUHR0RG93blRzID0gRGF0ZS5ub3coKTtcblx0XHR0aGlzLl9kaWFnUHR0VXBUcyA9IDA7XG5cdFx0dGhpcy5fZGlhZ0NodW5rc1NlbnQgPSAwO1xuXHRcdHRoaXMuX2RpYWdTYW1wbGVzU2VudCA9IDA7XG5cdFx0dGhpcy5fZGlhZ0RyYWluRmlyZWQgPSBmYWxzZTtcblx0XHR0aGlzLl9kaWFnRHJhaW5DaHVua3MgPSAwO1xuXHRcdHRoaXMuX2RpYWdEcmFpblNhbXBsZXMgPSAwO1xuXHRcdHRoaXMuX2RpYWdEcmFpblNraXBwZWRCeU11dGUgPSAwO1xuXHRcdHRoaXMuX2RpYWdEcmFpblNraXBwZWRCeVN1cHByZXNzaW9uID0gMDtcblx0XHR0aGlzLl9kaWFnUG9zdFJlbGVhc2VDYWxsYmFja3MgPSAwO1xuXHRcdHRoaXMuX2RpYWdQb3N0UmVsZWFzZVNhbXBsZXMgPSAwO1xuXHRcdHRoaXMuX2RpYWdQb3N0UmVsZWFzZVNraXBwZWRCeU11dGUgPSAwO1xuXHRcdHRoaXMuX2RpYWdQb3N0UmVsZWFzZVNraXBwZWRCeVN1cHByZXNzaW9uID0gMDtcblx0XHR0aGlzLl9kaWFnUmVsZWFzZWREdXJpbmdBY3F1aXJlID0gZmFsc2U7XG5cdFx0dGhpcy5fZGlhZ1B0dFVwV2l0aG91dENhcHR1cmUgPSBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX3NjaGVkdWxlRGlhZ25vc3RpY0ZpcmUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2RpYWdGaXJlVGltZXIpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9kaWFnRmlyZVRpbWVyKTtcblx0XHRcdHRoaXMuX2RpYWdGaXJlVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX2RpYWdGaXJlVGltZXIgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX2RpYWdGaXJlVGltZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9lbWl0RGlhZ25vc3RpYygpO1xuXHRcdH0sIE1pY0NhcHR1cmVTZXJ2aWNlLl9ESUFHX1BPU1RfUkVMRUFTRV9XSU5ET1dfTVMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZmx1c2hQZW5kaW5nRGlhZ25vc3RpYygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fZGlhZ0ZpcmVUaW1lcikge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHRoaXMuX2RpYWdGaXJlVGltZXIpO1xuXHRcdFx0dGhpcy5fZGlhZ0ZpcmVUaW1lciA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX2VtaXREaWFnbm9zdGljKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZW1pdERpYWdub3N0aWMoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9kaWFnVHVybklkICYmIHRoaXMuX2RpYWdQdHREb3duVHMgPT09IDApIHsgcmV0dXJuOyB9XG5cdFx0Y29uc3QgbXNIZWxkID0gdGhpcy5fZGlhZ1B0dFVwVHMgPiAwID8gdGhpcy5fZGlhZ1B0dFVwVHMgLSB0aGlzLl9kaWFnUHR0RG93blRzIDogMDtcblx0XHR0aGlzLl9vblB0dERpYWdub3N0aWMuZmlyZSh7XG5cdFx0XHR0dXJuSWQ6IHRoaXMuX2RpYWdUdXJuSWQsXG5cdFx0XHRtc0hlbGQsXG5cdFx0XHRjaHVua3NTZW50OiB0aGlzLl9kaWFnQ2h1bmtzU2VudCxcblx0XHRcdHNhbXBsZXNTZW50OiB0aGlzLl9kaWFnU2FtcGxlc1NlbnQsXG5cdFx0XHRkcmFpbkZpcmVkOiB0aGlzLl9kaWFnRHJhaW5GaXJlZCxcblx0XHRcdGRyYWluQ2h1bmtzOiB0aGlzLl9kaWFnRHJhaW5DaHVua3MsXG5cdFx0XHRkcmFpblNhbXBsZXM6IHRoaXMuX2RpYWdEcmFpblNhbXBsZXMsXG5cdFx0XHRkcmFpbldpbmRvd01zOiBNaWNDYXB0dXJlU2VydmljZS5fUFRUX0RSQUlOX1dJTkRPV19NUyxcblx0XHRcdGRyYWluU2tpcHBlZEJ5TXV0ZTogdGhpcy5fZGlhZ0RyYWluU2tpcHBlZEJ5TXV0ZSxcblx0XHRcdGRyYWluU2tpcHBlZEJ5U3VwcHJlc3Npb246IHRoaXMuX2RpYWdEcmFpblNraXBwZWRCeVN1cHByZXNzaW9uLFxuXHRcdFx0cG9zdFJlbGVhc2VDYWxsYmFja3M6IHRoaXMuX2RpYWdQb3N0UmVsZWFzZUNhbGxiYWNrcyxcblx0XHRcdHBvc3RSZWxlYXNlU2FtcGxlczogdGhpcy5fZGlhZ1Bvc3RSZWxlYXNlU2FtcGxlcyxcblx0XHRcdHBvc3RSZWxlYXNlU2tpcHBlZEJ5TXV0ZTogdGhpcy5fZGlhZ1Bvc3RSZWxlYXNlU2tpcHBlZEJ5TXV0ZSxcblx0XHRcdHBvc3RSZWxlYXNlU2tpcHBlZEJ5U3VwcHJlc3Npb246IHRoaXMuX2RpYWdQb3N0UmVsZWFzZVNraXBwZWRCeVN1cHByZXNzaW9uLFxuXHRcdFx0cG9zdFJlbGVhc2VXaW5kb3dNczogTWljQ2FwdHVyZVNlcnZpY2UuX0RJQUdfUE9TVF9SRUxFQVNFX1dJTkRPV19NUyxcblx0XHRcdHJlbGVhc2VkRHVyaW5nQWNxdWlyZTogdGhpcy5fZGlhZ1JlbGVhc2VkRHVyaW5nQWNxdWlyZSxcblx0XHRcdHB0dFVwV2l0aG91dENhcHR1cmU6IHRoaXMuX2RpYWdQdHRVcFdpdGhvdXRDYXB0dXJlLFxuXHRcdH0pO1xuXHR9XG59XG5cbi8qKlxuICogRW5jb2RlIFBDTSBGbG9hdDMyIHNhbXBsZXMgaW50byBiYXNlNjQtZW5jb2RlZCByYXcgUENNMTYgKG5vIFdBViBoZWFkZXIpLlxuICovXG5mdW5jdGlvbiBlbmNvZGVSYXdQY20xNkJhc2U2NChzYW1wbGVzOiBGbG9hdDMyQXJyYXksIHdpbjogV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXMpOiBzdHJpbmcge1xuXHRjb25zdCBidWYgPSBuZXcgQXJyYXlCdWZmZXIoc2FtcGxlcy5sZW5ndGggKiAyKTtcblx0Y29uc3QgdmlldyA9IG5ldyBEYXRhVmlldyhidWYpO1xuXHRmb3IgKGxldCBpID0gMDsgaSA8IHNhbXBsZXMubGVuZ3RoOyBpKyspIHtcblx0XHRjb25zdCBzID0gTWF0aC5tYXgoLTEsIE1hdGgubWluKDEsIHNhbXBsZXNbaV0pKTtcblx0XHR2aWV3LnNldEludDE2KGkgKiAyLCBzIDwgMCA/IHMgKiAweDgwMDAgOiBzICogMHg3RkZGLCB0cnVlKTtcblx0fVxuXHRjb25zdCBieXRlcyA9IG5ldyBVaW50OEFycmF5KGJ1Zik7XG5cdGxldCBiaW5hcnlTdHIgPSAnJztcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBieXRlcy5sZW5ndGg7IGkrKykge1xuXHRcdGJpbmFyeVN0ciArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ5dGVzW2ldKTtcblx0fVxuXHRyZXR1cm4gd2luLmJ0b2EoYmluYXJ5U3RyKTtcbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSU1pY0NhcHR1cmVTZXJ2aWNlLCBNaWNDYXB0dXJlU2VydmljZSwgSW5zdGFudGlhdGlvblR5cGUuRGVsYXllZCk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMs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
