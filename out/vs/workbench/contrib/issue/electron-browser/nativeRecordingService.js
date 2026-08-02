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
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { isMacintosh } from "../../../../base/common/platform.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { RecordingState } from "../browser/recordingService.js";
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const SIZE_LIMIT_THRESHOLD = 0.9;
let NativeRecordingService = class extends Disposable {
  constructor(logService, nativeHostService) {
    super();
    this.logService = logService;
    this.nativeHostService = nativeHostService;
    // MediaRecorder + getDisplayMedia may be absent if the renderer is run with reduced
    // APIs (e.g. some test/runtime configurations); derive support from feature detection
    // so startRecording can early-reject rather than blowing up with ReferenceError.
    this.isSupported = typeof MediaRecorder !== "undefined" && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;
    this._state = RecordingState.Idle;
    this._onDidChangeState = this._register(new Emitter());
    this.onDidChangeState = this._onDidChangeState.event;
    this.chunks = [];
    this.bytesRecorded = 0;
    this.stoppedBySize = false;
    this.startTime = 0;
    this._register(toDisposable(() => this.cleanup()));
  }
  getScreenCapturePermissionStatus() {
    return this.nativeHostService.getMediaAccessStatus("screen");
  }
  openScreenCapturePermissionSettings() {
    if (isMacintosh) {
      void this.nativeHostService.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
    }
  }
  get state() {
    return this._state;
  }
  setState(state) {
    if (this._state !== state) {
      this._state = state;
      this._onDidChangeState.fire(state);
    }
  }
  getSupportedFormats() {
    const formats = [];
    if (typeof MediaRecorder !== "undefined") {
      if (MediaRecorder.isTypeSupported("video/mp4")) {
        formats.push({ mimeType: "video/mp4", label: "MP4", extension: "mp4" });
      }
      if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
        formats.push({ mimeType: "video/webm;codecs=vp9", label: "WebM", extension: "webm" });
      } else if (MediaRecorder.isTypeSupported("video/webm")) {
        formats.push({ mimeType: "video/webm", label: "WebM", extension: "webm" });
      }
    }
    return formats;
  }
  async startRecording(preferredMimeType) {
    if (!this.isSupported) {
      throw new Error("Recording is not supported in this environment (MediaRecorder / getDisplayMedia unavailable).");
    }
    if (this._state === RecordingState.Recording) {
      throw new Error("Recording already in progress.");
    }
    this.cleanup();
    try {
      this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });
    } catch (err) {
      this.logService.error("[RecordingService] Failed to get display media:", err);
      throw new Error("Failed to start recording. The user may have cancelled the source picker.");
    }
    let mimeType;
    if (preferredMimeType && MediaRecorder.isTypeSupported(preferredMimeType)) {
      mimeType = preferredMimeType;
    } else if (MediaRecorder.isTypeSupported("video/mp4")) {
      mimeType = "video/mp4";
    } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
      mimeType = "video/webm;codecs=vp9";
    } else {
      mimeType = "video/webm";
    }
    this.chunks = [];
    this.bytesRecorded = 0;
    this.stoppedBySize = false;
    this.startTime = Date.now();
    try {
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType,
        videoBitsPerSecond: 25e5
        // 2.5 Mbps — good quality, reasonable file size
      });
    } catch (err) {
      this.logService.error("[RecordingService] Failed to create MediaRecorder:", err);
      this.stopTracks();
      throw new Error("Failed to create media recorder.");
    }
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        if (this.stoppedBySize) {
          return;
        }
        this.chunks.push(e.data);
        this.bytesRecorded += e.data.size;
        if (this.bytesRecorded >= MAX_FILE_SIZE_BYTES * SIZE_LIMIT_THRESHOLD && this._state === RecordingState.Recording) {
          this.logService.info("[RecordingService] Max file size reached, stopping recording.");
          this.stoppedBySize = true;
          this.mediaRecorder?.stop();
        }
      }
    };
    this.mediaRecorder.onstop = () => {
      if (this._state === RecordingState.Recording) {
        this.stopTracks();
        this.setState(RecordingState.Stopped);
      }
    };
    for (const track of this.mediaStream.getTracks()) {
      track.onended = () => {
        if (this._state === RecordingState.Recording && this.mediaRecorder?.state === "recording") {
          this.mediaRecorder.stop();
        }
      };
    }
    this.mediaRecorder.start(1e3);
    this.setState(RecordingState.Recording);
  }
  async stopRecording() {
    if (this._state !== RecordingState.Recording && this._state !== RecordingState.Stopped) {
      return void 0;
    }
    if (this._state === RecordingState.Recording && this.mediaRecorder?.state === "recording") {
      const recorder = this.mediaRecorder;
      await new Promise((resolve) => {
        recorder.onstop = () => {
          resolve();
        };
        recorder.requestData();
        recorder.stop();
      });
    }
    this.stopTracks();
    if (this.chunks.length === 0) {
      this.setState(RecordingState.Idle);
      return void 0;
    }
    const mimeType = this.mediaRecorder?.mimeType ?? "video/webm";
    const blob = new Blob(this.chunks, { type: mimeType });
    const durationMs = Date.now() - this.startTime;
    const data = {
      blob,
      mimeType,
      durationMs,
      sizeBytes: blob.size,
      stoppedBySize: this.stoppedBySize
    };
    this.chunks = [];
    this.mediaRecorder = void 0;
    this.setState(RecordingState.Idle);
    return data;
  }
  discardRecording() {
    if (this.mediaRecorder) {
      this.mediaRecorder.ondataavailable = null;
      this.mediaRecorder.onstop = null;
      if (this._state === RecordingState.Recording && this.mediaRecorder.state === "recording") {
        this.mediaRecorder.stop();
      }
    }
    this.cleanup();
    this.setState(RecordingState.Idle);
  }
  stopTracks() {
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = void 0;
    }
  }
  cleanup() {
    this.stopTracks();
    this.chunks = [];
    this.bytesRecorded = 0;
    this.stoppedBySize = false;
    this.mediaRecorder = void 0;
  }
};
NativeRecordingService = __decorateClass([
  __decorateParam(0, ILogService),
  __decorateParam(1, INativeHostService)
], NativeRecordingService);
export {
  NativeRecordingService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lzc3VlL2VsZWN0cm9uLWJyb3dzZXIvbmF0aXZlUmVjb3JkaW5nU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGlzTWFjaW50b3NoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJUmVjb3JkaW5nRGF0YSwgSVJlY29yZGluZ1NlcnZpY2UsIFJlY29yZGluZ1N0YXRlIH0gZnJvbSAnLi4vYnJvd3Nlci9yZWNvcmRpbmdTZXJ2aWNlLmpzJztcblxuY29uc3QgTUFYX0ZJTEVfU0laRV9CWVRFUyA9IDEwMCAqIDEwMjQgKiAxMDI0OyAvLyAxMDAgTUIgXHUyMDE0IEdpdEh1YiB1cGxvYWQgbGltaXRcbmNvbnN0IFNJWkVfTElNSVRfVEhSRVNIT0xEID0gMC45OyAvLyBTdG9wIGF0IDkwJSB0byBhY2NvdW50IGZvciBjaHVuayBvdmVyc2hvb3RcblxuZXhwb3J0IGNsYXNzIE5hdGl2ZVJlY29yZGluZ1NlcnZpY2UgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVJlY29yZGluZ1NlcnZpY2Uge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdC8vIE1lZGlhUmVjb3JkZXIgKyBnZXREaXNwbGF5TWVkaWEgbWF5IGJlIGFic2VudCBpZiB0aGUgcmVuZGVyZXIgaXMgcnVuIHdpdGggcmVkdWNlZFxuXHQvLyBBUElzIChlLmcuIHNvbWUgdGVzdC9ydW50aW1lIGNvbmZpZ3VyYXRpb25zKTsgZGVyaXZlIHN1cHBvcnQgZnJvbSBmZWF0dXJlIGRldGVjdGlvblxuXHQvLyBzbyBzdGFydFJlY29yZGluZyBjYW4gZWFybHktcmVqZWN0IHJhdGhlciB0aGFuIGJsb3dpbmcgdXAgd2l0aCBSZWZlcmVuY2VFcnJvci5cblx0cmVhZG9ubHkgaXNTdXBwb3J0ZWQgPSB0eXBlb2YgTWVkaWFSZWNvcmRlciAhPT0gJ3VuZGVmaW5lZCdcblx0XHQmJiB0eXBlb2YgbmF2aWdhdG9yICE9PSAndW5kZWZpbmVkJ1xuXHRcdCYmICEhbmF2aWdhdG9yLm1lZGlhRGV2aWNlcz8uZ2V0RGlzcGxheU1lZGlhO1xuXG5cdHByaXZhdGUgX3N0YXRlID0gUmVjb3JkaW5nU3RhdGUuSWRsZTtcblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFJlY29yZGluZ1N0YXRlPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTdGF0ZTogRXZlbnQ8UmVjb3JkaW5nU3RhdGU+ID0gdGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5ldmVudDtcblxuXHRwcml2YXRlIG1lZGlhUmVjb3JkZXI6IE1lZGlhUmVjb3JkZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbWVkaWFTdHJlYW06IE1lZGlhU3RyZWFtIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGNodW5rczogQmxvYltdID0gW107XG5cdHByaXZhdGUgYnl0ZXNSZWNvcmRlZCA9IDA7XG5cdHByaXZhdGUgc3RvcHBlZEJ5U2l6ZSA9IGZhbHNlO1xuXHRwcml2YXRlIHN0YXJ0VGltZSA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElOYXRpdmVIb3N0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5hdGl2ZUhvc3RTZXJ2aWNlOiBJTmF0aXZlSG9zdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5jbGVhbnVwKCkpKTtcblx0fVxuXG5cdGdldFNjcmVlbkNhcHR1cmVQZXJtaXNzaW9uU3RhdHVzKCk6IFByb21pc2U8J25vdC1kZXRlcm1pbmVkJyB8ICdncmFudGVkJyB8ICdkZW5pZWQnIHwgJ3Jlc3RyaWN0ZWQnIHwgJ3Vua25vd24nPiB7XG5cdFx0cmV0dXJuIHRoaXMubmF0aXZlSG9zdFNlcnZpY2UuZ2V0TWVkaWFBY2Nlc3NTdGF0dXMoJ3NjcmVlbicpO1xuXHR9XG5cblx0b3BlblNjcmVlbkNhcHR1cmVQZXJtaXNzaW9uU2V0dGluZ3MoKTogdm9pZCB7XG5cdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHQvLyBEZWVwLWxpbmsgdG8gdGhlIFNjcmVlbiBSZWNvcmRpbmcgcGFuZSBpbiBtYWNPUyBQcml2YWN5ICYgU2VjdXJpdHkuXG5cdFx0XHR2b2lkIHRoaXMubmF0aXZlSG9zdFNlcnZpY2Uub3BlbkV4dGVybmFsKCd4LWFwcGxlLnN5c3RlbXByZWZlcmVuY2VzOmNvbS5hcHBsZS5wcmVmZXJlbmNlLnNlY3VyaXR5P1ByaXZhY3lfU2NyZWVuQ2FwdHVyZScpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBzdGF0ZSgpOiBSZWNvcmRpbmdTdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXRlO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRTdGF0ZShzdGF0ZTogUmVjb3JkaW5nU3RhdGUpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3RhdGUgIT09IHN0YXRlKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZSA9IHN0YXRlO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTdGF0ZS5maXJlKHN0YXRlKTtcblx0XHR9XG5cdH1cblxuXHRnZXRTdXBwb3J0ZWRGb3JtYXRzKCk6IHsgbWltZVR5cGU6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgZXh0ZW5zaW9uOiBzdHJpbmcgfVtdIHtcblx0XHRjb25zdCBmb3JtYXRzOiB7IG1pbWVUeXBlOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmc7IGV4dGVuc2lvbjogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdGlmICh0eXBlb2YgTWVkaWFSZWNvcmRlciAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdGlmIChNZWRpYVJlY29yZGVyLmlzVHlwZVN1cHBvcnRlZCgndmlkZW8vbXA0JykpIHtcblx0XHRcdFx0Zm9ybWF0cy5wdXNoKHsgbWltZVR5cGU6ICd2aWRlby9tcDQnLCBsYWJlbDogJ01QNCcsIGV4dGVuc2lvbjogJ21wNCcgfSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoTWVkaWFSZWNvcmRlci5pc1R5cGVTdXBwb3J0ZWQoJ3ZpZGVvL3dlYm07Y29kZWNzPXZwOScpKSB7XG5cdFx0XHRcdGZvcm1hdHMucHVzaCh7IG1pbWVUeXBlOiAndmlkZW8vd2VibTtjb2RlY3M9dnA5JywgbGFiZWw6ICdXZWJNJywgZXh0ZW5zaW9uOiAnd2VibScgfSk7XG5cdFx0XHR9IGVsc2UgaWYgKE1lZGlhUmVjb3JkZXIuaXNUeXBlU3VwcG9ydGVkKCd2aWRlby93ZWJtJykpIHtcblx0XHRcdFx0Zm9ybWF0cy5wdXNoKHsgbWltZVR5cGU6ICd2aWRlby93ZWJtJywgbGFiZWw6ICdXZWJNJywgZXh0ZW5zaW9uOiAnd2VibScgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmb3JtYXRzO1xuXHR9XG5cblx0YXN5bmMgc3RhcnRSZWNvcmRpbmcocHJlZmVycmVkTWltZVR5cGU/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuaXNTdXBwb3J0ZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignUmVjb3JkaW5nIGlzIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBlbnZpcm9ubWVudCAoTWVkaWFSZWNvcmRlciAvIGdldERpc3BsYXlNZWRpYSB1bmF2YWlsYWJsZSkuJyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gUmVjb3JkaW5nU3RhdGUuUmVjb3JkaW5nKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1JlY29yZGluZyBhbHJlYWR5IGluIHByb2dyZXNzLicpO1xuXHRcdH1cblxuXHRcdHRoaXMuY2xlYW51cCgpO1xuXG5cdFx0Ly8gVXNlIGdldERpc3BsYXlNZWRpYSBcdTIwMTQgb24gRWxlY3Ryb24gZGVza3RvcCB0aGUgbWFpbiBwcm9jZXNzIGhhbmRsZXJcblx0XHQvLyBhdXRvLXNlbGVjdHMgdGhlIHNjcmVlbiBjb250YWluaW5nIHRoZSBWUyBDb2RlIHdpbmRvdyB2aWFcblx0XHQvLyBkZXNrdG9wQ2FwdHVyZXIuZ2V0U291cmNlcygpIChjYWNoZWQgZm9yIHN1YnNlcXVlbnQgcmVjb3JkaW5ncykuXG5cdFx0dHJ5IHtcblx0XHRcdHRoaXMubWVkaWFTdHJlYW0gPSBhd2FpdCBuYXZpZ2F0b3IubWVkaWFEZXZpY2VzLmdldERpc3BsYXlNZWRpYSh7XG5cdFx0XHRcdHZpZGVvOiB0cnVlLFxuXHRcdFx0XHRhdWRpbzogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcignW1JlY29yZGluZ1NlcnZpY2VdIEZhaWxlZCB0byBnZXQgZGlzcGxheSBtZWRpYTonLCBlcnIpO1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gc3RhcnQgcmVjb3JkaW5nLiBUaGUgdXNlciBtYXkgaGF2ZSBjYW5jZWxsZWQgdGhlIHNvdXJjZSBwaWNrZXIuJyk7XG5cdFx0fVxuXG5cdFx0Ly8gU2VsZWN0IG1pbWUgdHlwZTogcHJlZmVyIGNhbGxlcidzIGNob2ljZSwgZmFsbCBiYWNrIHRvIGJlc3QgYXZhaWxhYmxlXG5cdFx0bGV0IG1pbWVUeXBlOiBzdHJpbmc7XG5cdFx0aWYgKHByZWZlcnJlZE1pbWVUeXBlICYmIE1lZGlhUmVjb3JkZXIuaXNUeXBlU3VwcG9ydGVkKHByZWZlcnJlZE1pbWVUeXBlKSkge1xuXHRcdFx0bWltZVR5cGUgPSBwcmVmZXJyZWRNaW1lVHlwZTtcblx0XHR9IGVsc2UgaWYgKE1lZGlhUmVjb3JkZXIuaXNUeXBlU3VwcG9ydGVkKCd2aWRlby9tcDQnKSkge1xuXHRcdFx0bWltZVR5cGUgPSAndmlkZW8vbXA0Jztcblx0XHR9IGVsc2UgaWYgKE1lZGlhUmVjb3JkZXIuaXNUeXBlU3VwcG9ydGVkKCd2aWRlby93ZWJtO2NvZGVjcz12cDknKSkge1xuXHRcdFx0bWltZVR5cGUgPSAndmlkZW8vd2VibTtjb2RlY3M9dnA5Jztcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWltZVR5cGUgPSAndmlkZW8vd2VibSc7XG5cdFx0fVxuXG5cdFx0dGhpcy5jaHVua3MgPSBbXTtcblx0XHR0aGlzLmJ5dGVzUmVjb3JkZWQgPSAwO1xuXHRcdHRoaXMuc3RvcHBlZEJ5U2l6ZSA9IGZhbHNlO1xuXHRcdHRoaXMuc3RhcnRUaW1lID0gRGF0ZS5ub3coKTtcblxuXHRcdHRyeSB7XG5cdFx0XHR0aGlzLm1lZGlhUmVjb3JkZXIgPSBuZXcgTWVkaWFSZWNvcmRlcih0aGlzLm1lZGlhU3RyZWFtLCB7XG5cdFx0XHRcdG1pbWVUeXBlLFxuXHRcdFx0XHR2aWRlb0JpdHNQZXJTZWNvbmQ6IDJfNTAwXzAwMCwgLy8gMi41IE1icHMgXHUyMDE0IGdvb2QgcXVhbGl0eSwgcmVhc29uYWJsZSBmaWxlIHNpemVcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbUmVjb3JkaW5nU2VydmljZV0gRmFpbGVkIHRvIGNyZWF0ZSBNZWRpYVJlY29yZGVyOicsIGVycik7XG5cdFx0XHR0aGlzLnN0b3BUcmFja3MoKTtcblx0XHRcdHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGNyZWF0ZSBtZWRpYSByZWNvcmRlci4nKTtcblx0XHR9XG5cblx0XHR0aGlzLm1lZGlhUmVjb3JkZXIub25kYXRhYXZhaWxhYmxlID0gZSA9PiB7XG5cdFx0XHRpZiAoZS5kYXRhICYmIGUuZGF0YS5zaXplID4gMCkge1xuXHRcdFx0XHRpZiAodGhpcy5zdG9wcGVkQnlTaXplKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEFsd2F5cyBhY2NlcHQgdGhlIGN1cnJlbnQgY2h1bmssIHRoZW4gY2hlY2sgaWYgd2UndmUgaGl0IHRoZSBsaW1pdC5cblx0XHRcdFx0Ly8gVGhpcyBtZWFucyB0aGUgZmlsZSBtYXkgb3ZlcnNob290IGJ5IHVwIHRvIG9uZSAxMDAwbXMgY2h1bmssXG5cdFx0XHRcdC8vIHdoaWNoIGlzIHNtYWxsIGVub3VnaCBmb3IgdGhlIDEwMCBNQiBHaXRIdWIgbGltaXQuXG5cdFx0XHRcdHRoaXMuY2h1bmtzLnB1c2goZS5kYXRhKTtcblx0XHRcdFx0dGhpcy5ieXRlc1JlY29yZGVkICs9IGUuZGF0YS5zaXplO1xuXHRcdFx0XHRpZiAodGhpcy5ieXRlc1JlY29yZGVkID49IE1BWF9GSUxFX1NJWkVfQllURVMgKiBTSVpFX0xJTUlUX1RIUkVTSE9MRCAmJiB0aGlzLl9zdGF0ZSA9PT0gUmVjb3JkaW5nU3RhdGUuUmVjb3JkaW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oJ1tSZWNvcmRpbmdTZXJ2aWNlXSBNYXggZmlsZSBzaXplIHJlYWNoZWQsIHN0b3BwaW5nIHJlY29yZGluZy4nKTtcblx0XHRcdFx0XHR0aGlzLnN0b3BwZWRCeVNpemUgPSB0cnVlO1xuXHRcdFx0XHRcdHRoaXMubWVkaWFSZWNvcmRlcj8uc3RvcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdC8vIElmIHRoZSB1c2VyIHN0b3BzIHNoYXJpbmcgdmlhIHRoZSBicm93c2VyL09TIFVJLCB0cmVhdCBpdCBhcyBzdG9wXG5cdFx0dGhpcy5tZWRpYVJlY29yZGVyLm9uc3RvcCA9ICgpID0+IHtcblx0XHRcdC8vIE9ubHkgbW92ZSB0byBTdG9wcGVkIGlmIHdlIHdlcmUgUmVjb3JkaW5nIChhdm9pZCBkb3VibGUgdHJhbnNpdGlvbilcblx0XHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gUmVjb3JkaW5nU3RhdGUuUmVjb3JkaW5nKSB7XG5cdFx0XHRcdHRoaXMuc3RvcFRyYWNrcygpO1xuXHRcdFx0XHR0aGlzLnNldFN0YXRlKFJlY29yZGluZ1N0YXRlLlN0b3BwZWQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHQvLyBBbHNvIGhhbmRsZSB0aGUgc3RyZWFtIGVuZGluZyBleHRlcm5hbGx5ICh1c2VyIGNsaWNrZWQgXCJTdG9wIHNoYXJpbmdcIilcblx0XHRmb3IgKGNvbnN0IHRyYWNrIG9mIHRoaXMubWVkaWFTdHJlYW0uZ2V0VHJhY2tzKCkpIHtcblx0XHRcdHRyYWNrLm9uZW5kZWQgPSAoKSA9PiB7XG5cdFx0XHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gUmVjb3JkaW5nU3RhdGUuUmVjb3JkaW5nICYmIHRoaXMubWVkaWFSZWNvcmRlcj8uc3RhdGUgPT09ICdyZWNvcmRpbmcnKSB7XG5cdFx0XHRcdFx0dGhpcy5tZWRpYVJlY29yZGVyLnN0b3AoKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0aGlzLm1lZGlhUmVjb3JkZXIuc3RhcnQoMTAwMCk7IC8vIDEtc2Vjb25kIHRpbWVzbGljZSBmb3Igc2l6ZSB0cmFja2luZ1xuXHRcdHRoaXMuc2V0U3RhdGUoUmVjb3JkaW5nU3RhdGUuUmVjb3JkaW5nKTtcblx0fVxuXG5cdGFzeW5jIHN0b3BSZWNvcmRpbmcoKTogUHJvbWlzZTxJUmVjb3JkaW5nRGF0YSB8IHVuZGVmaW5lZD4ge1xuXHRcdGlmICh0aGlzLl9zdGF0ZSAhPT0gUmVjb3JkaW5nU3RhdGUuUmVjb3JkaW5nICYmIHRoaXMuX3N0YXRlICE9PSBSZWNvcmRpbmdTdGF0ZS5TdG9wcGVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIElmIHN0aWxsIHJlY29yZGluZywgc3RvcCB0aGUgcmVjb3JkZXIgYW5kIHdhaXQgZm9yIGl0IHRvIGZpbmlzaFxuXHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gUmVjb3JkaW5nU3RhdGUuUmVjb3JkaW5nICYmIHRoaXMubWVkaWFSZWNvcmRlcj8uc3RhdGUgPT09ICdyZWNvcmRpbmcnKSB7XG5cdFx0XHRjb25zdCByZWNvcmRlciA9IHRoaXMubWVkaWFSZWNvcmRlcjtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHQvLyBSZXBsYWNlIG9uc3RvcCBlbnRpcmVseSBzbyB0aGUgb3JpZ2luYWwgXCJleHRlcm5hbCBzdG9wXCIgaGFuZGxlciBkb2Vzbid0XG5cdFx0XHRcdC8vIGVtaXQgc2V0U3RhdGUoU3RvcHBlZCkgaGVyZS4gVGhhdCBldmVudCB3b3VsZCByZS1lbnRlciB0aGUgYXV0by1zdG9wXG5cdFx0XHRcdC8vIGxpc3RlbmVyIChJc3N1ZVJlcG9ydGVyRWRpdG9yUGFuZSkgYW5kIHJlY3Vyc2l2ZWx5IGNhbGwgc3RvcFJlY29yZGluZy5cblx0XHRcdFx0Ly8gRXhwbGljaXQgc3RvcHMgb3duIHRoZSBzdGF0ZSB0cmFuc2l0aW9ucyB0aGVtc2VsdmVzIGFuZCBlbmQgd2l0aFxuXHRcdFx0XHQvLyBzZXRTdGF0ZShJZGxlKSBiZWxvdywgd2hpY2ggc3RpbGwgc2F0aXNmaWVzIHRoZSBJUmVjb3JkaW5nU2VydmljZVxuXHRcdFx0XHQvLyBjb250cmFjdCBieSBlbWl0dGluZyB0aGUgdGVybWluYWwgSWRsZSB0cmFuc2l0aW9uLlxuXHRcdFx0XHRyZWNvcmRlci5vbnN0b3AgPSAoKSA9PiB7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9O1xuXHRcdFx0XHQvLyBGbHVzaCBhbnkgYnVmZmVyZWQgZGF0YSBiZWZvcmUgc3RvcHBpbmdcblx0XHRcdFx0cmVjb3JkZXIucmVxdWVzdERhdGEoKTtcblx0XHRcdFx0cmVjb3JkZXIuc3RvcCgpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zdG9wVHJhY2tzKCk7XG5cblx0XHRpZiAodGhpcy5jaHVua3MubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLnNldFN0YXRlKFJlY29yZGluZ1N0YXRlLklkbGUpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBtaW1lVHlwZSA9IHRoaXMubWVkaWFSZWNvcmRlcj8ubWltZVR5cGUgPz8gJ3ZpZGVvL3dlYm0nO1xuXHRcdGNvbnN0IGJsb2IgPSBuZXcgQmxvYih0aGlzLmNodW5rcywgeyB0eXBlOiBtaW1lVHlwZSB9KTtcblx0XHRjb25zdCBkdXJhdGlvbk1zID0gRGF0ZS5ub3coKSAtIHRoaXMuc3RhcnRUaW1lO1xuXG5cdFx0Y29uc3QgZGF0YTogSVJlY29yZGluZ0RhdGEgPSB7XG5cdFx0XHRibG9iLFxuXHRcdFx0bWltZVR5cGUsXG5cdFx0XHRkdXJhdGlvbk1zLFxuXHRcdFx0c2l6ZUJ5dGVzOiBibG9iLnNpemUsXG5cdFx0XHRzdG9wcGVkQnlTaXplOiB0aGlzLnN0b3BwZWRCeVNpemUsXG5cdFx0fTtcblxuXHRcdHRoaXMuY2h1bmtzID0gW107XG5cdFx0dGhpcy5tZWRpYVJlY29yZGVyID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuc2V0U3RhdGUoUmVjb3JkaW5nU3RhdGUuSWRsZSk7XG5cblx0XHRyZXR1cm4gZGF0YTtcblx0fVxuXG5cdGRpc2NhcmRSZWNvcmRpbmcoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubWVkaWFSZWNvcmRlcikge1xuXHRcdFx0Ly8gQ2xlYXIgaGFuZGxlcnMgQkVGT1JFIHN0b3AoKSBzbyBhbnkgZmluYWwgb25kYXRhYXZhaWxhYmxlIGZpcmVkIGFmdGVyIHN0b3AoKVxuXHRcdFx0Ly8gZG9lcyBub3QgYXBwZW5kIGEgY2h1bmsgdGhhdCB3ZSdkIHRoZW4gaGF2ZSB0byBHQyBleHBsaWNpdGx5LlxuXHRcdFx0dGhpcy5tZWRpYVJlY29yZGVyLm9uZGF0YWF2YWlsYWJsZSA9IG51bGw7XG5cdFx0XHR0aGlzLm1lZGlhUmVjb3JkZXIub25zdG9wID0gbnVsbDtcblx0XHRcdGlmICh0aGlzLl9zdGF0ZSA9PT0gUmVjb3JkaW5nU3RhdGUuUmVjb3JkaW5nICYmIHRoaXMubWVkaWFSZWNvcmRlci5zdGF0ZSA9PT0gJ3JlY29yZGluZycpIHtcblx0XHRcdFx0dGhpcy5tZWRpYVJlY29yZGVyLnN0b3AoKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5jbGVhbnVwKCk7XG5cdFx0dGhpcy5zZXRTdGF0ZShSZWNvcmRpbmdTdGF0ZS5JZGxlKTtcblx0fVxuXG5cdHByaXZhdGUgc3RvcFRyYWNrcygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5tZWRpYVN0cmVhbSkge1xuXHRcdFx0Zm9yIChjb25zdCB0cmFjayBvZiB0aGlzLm1lZGlhU3RyZWFtLmdldFRyYWNrcygpKSB7XG5cdFx0XHRcdHRyYWNrLnN0b3AoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMubWVkaWFTdHJlYW0gPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGVhbnVwKCk6IHZvaWQge1xuXHRcdHRoaXMuc3RvcFRyYWNrcygpO1xuXHRcdHRoaXMuY2h1bmtzID0gW107XG5cdFx0dGhpcy5ieXRlc1JlY29yZGVkID0gMDtcblx0XHR0aGlzLnN0b3BwZWRCeVNpemUgPSBmYWxzZTtcblx0XHR0aGlzLm1lZGlhUmVjb3JkZXIgPSB1bmRlZmluZWQ7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksb0JBQW9CO0FBQ3pDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQTRDLHNCQUFzQjtBQUVsRSxNQUFNLHNCQUFzQixNQUFNLE9BQU87QUFDekMsTUFBTSx1QkFBdUI7QUFFdEIsSUFBTSx5QkFBTixjQUFxQyxXQUF3QztBQUFBLEVBb0JuRixZQUMrQixZQUNPLG1CQUNwQztBQUNELFVBQU07QUFId0I7QUFDTztBQWpCdEM7QUFBQTtBQUFBO0FBQUEsU0FBUyxjQUFjLE9BQU8sa0JBQWtCLGVBQzVDLE9BQU8sY0FBYyxlQUNyQixDQUFDLENBQUMsVUFBVSxjQUFjO0FBRTlCLFNBQVEsU0FBUyxlQUFlO0FBQ2hDLFNBQWlCLG9CQUFvQixLQUFLLFVBQVUsSUFBSSxRQUF3QixDQUFDO0FBQ2pGLFNBQVMsbUJBQTBDLEtBQUssa0JBQWtCO0FBSTFFLFNBQVEsU0FBaUIsQ0FBQztBQUMxQixTQUFRLGdCQUFnQjtBQUN4QixTQUFRLGdCQUFnQjtBQUN4QixTQUFRLFlBQVk7QUFRbkIsU0FBSyxVQUFVLGFBQWEsTUFBTSxLQUFLLFFBQVEsQ0FBQyxDQUFDO0FBQUEsRUFDbEQ7QUFBQSxFQUVBLG1DQUFnSDtBQUMvRyxXQUFPLEtBQUssa0JBQWtCLHFCQUFxQixRQUFRO0FBQUEsRUFDNUQ7QUFBQSxFQUVBLHNDQUE0QztBQUMzQyxRQUFJLGFBQWE7QUFFaEIsV0FBSyxLQUFLLGtCQUFrQixh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
