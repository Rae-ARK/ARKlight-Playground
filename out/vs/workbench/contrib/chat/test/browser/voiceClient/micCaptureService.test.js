import assert from "assert";
import { mainWindow } from "../../../../../../base/browser/window.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { TestNotificationService } from "../../../../../../platform/notification/test/common/testNotificationService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestStorageService } from "../../../../../test/common/workbenchTestServices.js";
import { MIC_CAPTURE_CHUNK_SIZE, MicCaptureService } from "../../../browser/voiceClient/micCaptureService.js";
suite("MicCaptureService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("buffers 32 ms voice chunks at 16 kHz", () => {
    assert.deepStrictEqual({
      samples: MIC_CAPTURE_CHUNK_SIZE,
      durationMs: MIC_CAPTURE_CHUNK_SIZE / 16
    }, {
      samples: 512,
      durationMs: 32
    });
  });
  test("propagates capture setup failures after cleaning up acquired resources", async () => {
    const setupError = new Error("audio source setup failed");
    let trackStopCalls = 0;
    const track = new class extends mock() {
      stop() {
        trackStopCalls++;
      }
    }();
    const stream = new class extends mock() {
      getTracks() {
        return [track];
      }
      getAudioTracks() {
        return [];
      }
    }();
    const targetWindow = Object.create(mainWindow);
    Object.defineProperties(targetWindow, {
      navigator: {
        value: {
          mediaDevices: {
            getUserMedia: async () => stream
          }
        }
      },
      AudioContext: {
        value: class {
          close() {
            return Promise.resolve();
          }
          createMediaStreamSource() {
            throw setupError;
          }
        }
      }
    });
    const service = store.add(new MicCaptureService(
      store.add(new TestStorageService()),
      new TestNotificationService(),
      new NullLogService()
    ));
    service.prepare(targetWindow);
    await assert.rejects(() => service.pttDown("turn-1"), (error) => error === setupError);
    assert.deepStrictEqual({
      isCapturing: service.isCapturing,
      trackStopCalls
    }, {
      isCapturing: false,
      trackStopCalls: 1
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3ZvaWNlQ2xpZW50L21pY0NhcHR1cmVTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vdGVzdC9jb21tb24vdGVzdE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgTUlDX0NBUFRVUkVfQ0hVTktfU0laRSwgTWljQ2FwdHVyZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3ZvaWNlQ2xpZW50L21pY0NhcHR1cmVTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ01pY0NhcHR1cmVTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2J1ZmZlcnMgMzIgbXMgdm9pY2UgY2h1bmtzIGF0IDE2IGtIeicsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNhbXBsZXM6IE1JQ19DQVBUVVJFX0NIVU5LX1NJWkUsXG5cdFx0XHRkdXJhdGlvbk1zOiBNSUNfQ0FQVFVSRV9DSFVOS19TSVpFIC8gMTYsXG5cdFx0fSwge1xuXHRcdFx0c2FtcGxlczogNTEyLFxuXHRcdFx0ZHVyYXRpb25NczogMzIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb3BhZ2F0ZXMgY2FwdHVyZSBzZXR1cCBmYWlsdXJlcyBhZnRlciBjbGVhbmluZyB1cCBhY3F1aXJlZCByZXNvdXJjZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2V0dXBFcnJvciA9IG5ldyBFcnJvcignYXVkaW8gc291cmNlIHNldHVwIGZhaWxlZCcpO1xuXHRcdGxldCB0cmFja1N0b3BDYWxscyA9IDA7XG5cdFx0Y29uc3QgdHJhY2sgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1lZGlhU3RyZWFtVHJhY2s+KCkge1xuXHRcdFx0b3ZlcnJpZGUgc3RvcCgpOiB2b2lkIHsgdHJhY2tTdG9wQ2FsbHMrKzsgfVxuXHRcdH0oKTtcblx0XHRjb25zdCBzdHJlYW0gPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1lZGlhU3RyZWFtPigpIHtcblx0XHRcdG92ZXJyaWRlIGdldFRyYWNrcygpOiBNZWRpYVN0cmVhbVRyYWNrW10geyByZXR1cm4gW3RyYWNrXTsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0QXVkaW9UcmFja3MoKTogTWVkaWFTdHJlYW1UcmFja1tdIHsgcmV0dXJuIFtdOyB9XG5cdFx0fSgpO1xuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IE9iamVjdC5jcmVhdGUobWFpbldpbmRvdykgYXMgV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXM7XG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnRpZXModGFyZ2V0V2luZG93LCB7XG5cdFx0XHRuYXZpZ2F0b3I6IHtcblx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRtZWRpYURldmljZXM6IHtcblx0XHRcdFx0XHRcdGdldFVzZXJNZWRpYTogYXN5bmMgKCkgPT4gc3RyZWFtLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0QXVkaW9Db250ZXh0OiB7XG5cdFx0XHRcdHZhbHVlOiBjbGFzcyB7XG5cdFx0XHRcdFx0Y2xvc2UoKTogUHJvbWlzZTx2b2lkPiB7IHJldHVybiBQcm9taXNlLnJlc29sdmUoKTsgfVxuXHRcdFx0XHRcdGNyZWF0ZU1lZGlhU3RyZWFtU291cmNlKCk6IG5ldmVyIHsgdGhyb3cgc2V0dXBFcnJvcjsgfVxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBNaWNDYXB0dXJlU2VydmljZShcblx0XHRcdHN0b3JlLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpLFxuXHRcdFx0bmV3IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblx0XHRzZXJ2aWNlLnByZXBhcmUodGFyZ2V0V2luZG93KTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHNlcnZpY2UucHR0RG93bigndHVybi0xJyksIGVycm9yID0+IGVycm9yID09PSBzZXR1cEVycm9yKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGlzQ2FwdHVyaW5nOiBzZXJ2aWNlLmlzQ2FwdHVyaW5nLFxuXHRcdFx0dHJhY2tTdG9wQ2FsbHMsXG5cdFx0fSwge1xuXHRcdFx0aXNDYXB0dXJpbmc6IGZhbHNlLFxuXHRcdFx0dHJhY2tTdG9wQ2FsbHM6IDEsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsd0JBQXdCLHlCQUF5QjtBQUUxRCxNQUFNLHFCQUFxQixNQUFNO0FBQ2hDLFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsT0FBSyx3Q0FBd0MsTUFBTTtBQUNsRCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFNBQVM7QUFBQSxNQUNULFlBQVkseUJBQXlCO0FBQUEsSUFDdEMsR0FBRztBQUFBLE1BQ0YsU0FBUztBQUFBLE1BQ1QsWUFBWTtBQUFBLElBQ2IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMEVBQTBFLFlBQVk7QUFDMUYsVUFBTSxhQUFhLElBQUksTUFBTSwyQkFBMkI7QUFDeEQsUUFBSSxpQkFBaUI7QUFDckIsVUFBTSxRQUFRLElBQUksY0FBYyxLQUF1QixFQUFFO0FBQUEsTUFDL0MsT0FBYTtBQUFFO0FBQUEsTUFBa0I7QUFBQSxJQUMzQyxFQUFFO0FBQ0YsVUFBTSxTQUFTLElBQUksY0FBYyxLQUFrQixFQUFFO0FBQUEsTUFDM0MsWUFBZ0M7QUFBRSxlQUFPLENBQUMsS0FBSztBQUFBLE1BQUc7QUFBQSxNQUNsRCxpQkFBcUM7QUFBRSxlQUFPLENBQUM7QUFBQSxNQUFHO0FBQUEsSUFDNUQsRUFBRTtBQUNGLFVBQU0sZUFBZSxPQUFPLE9BQU8sVUFBVTtBQUM3QyxXQUFPLGlCQUFpQixjQUFjO0FBQUEsTUFDckMsV0FBVztBQUFBLFFBQ1YsT0FBTztBQUFBLFVBQ04sY0FBYztBQUFBLFlBQ2IsY0FBYyxZQUFZO0FBQUEsVUFDM0I7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLE1BQ0EsY0FBYztBQUFBLFFBQ2IsT0FBTyxNQUFNO0FBQUEsVUFDWixRQUF1QjtBQUFFLG1CQUFPLFFBQVEsUUFBUTtBQUFBLFVBQUc7QUFBQSxVQUNuRCwwQkFBaUM7QUFBRSxrQkFBTTtBQUFBLFVBQVk7QUFBQSxRQUN0RDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUM7QUFDRCxVQUFNLFVBQVUsTUFBTSxJQUFJLElBQUk7QUFBQSxNQUM3QixNQUFNLElBQUksSUFBSSxtQkFBbUIsQ0FBQztBQUFBLE1BQ2xDLElBQUksd0JBQXdCO0FBQUEsTUFDNUIsSUFBSSxlQUFlO0FBQUEsSUFDcEIsQ0FBQztBQUNELFlBQVEsUUFBUSxZQUFZO0FBRTVCLFVBQU0sT0FBTyxRQUFRLE1BQU0sUUFBUSxRQUFRLFFBQVEsR0FBRyxXQUFTLFVBQVUsVUFBVTtBQUNuRixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGFBQWEsUUFBUTtBQUFBLE1BQ3JCO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixhQUFhO0FBQUEsTUFDYixnQkFBZ0I7QUFBQSxJQUNqQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
