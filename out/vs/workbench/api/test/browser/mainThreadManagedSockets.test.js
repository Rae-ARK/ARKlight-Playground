import assert from "assert";
import { disposableTimeout, timeout } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { Emitter } from "../../../../base/common/event.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { MainThreadManagedSocket } from "../../browser/mainThreadManagedSockets.js";
suite("MainThreadManagedSockets", () => {
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  suite("ManagedSocket", () => {
    let extHost;
    let half;
    class ExtHostMock extends mock() {
      constructor() {
        super(...arguments);
        this.onDidFire = new Emitter();
        this.events = [];
      }
      $remoteSocketWrite(socketId, buffer) {
        this.events.push({ socketId, data: buffer.toString() });
        this.onDidFire.fire();
      }
      $remoteSocketDrain(socketId) {
        this.events.push({ socketId, event: "drain" });
        this.onDidFire.fire();
        return Promise.resolve();
      }
      $remoteSocketEnd(socketId) {
        this.events.push({ socketId, event: "end" });
        this.onDidFire.fire();
      }
      expectEvent(test2, message) {
        if (this.events.some(test2)) {
          return;
        }
        const d = new DisposableStore();
        return new Promise((resolve) => {
          d.add(this.onDidFire.event(() => {
            if (this.events.some(test2)) {
              return;
            }
          }));
          d.add(disposableTimeout(() => {
            throw new Error(`Expected ${message} but only had ${JSON.stringify(this.events, null, 2)}`);
          }, 1e3));
        }).finally(() => d.dispose());
      }
    }
    setup(() => {
      extHost = new ExtHostMock();
      half = {
        onClose: new Emitter(),
        onData: new Emitter(),
        onEnd: new Emitter()
      };
    });
    async function doConnect() {
      const socket = MainThreadManagedSocket.connect(1, extHost, "/hello", "world=true", "", half);
      await extHost.expectEvent((evt) => evt.data && evt.data.startsWith("GET ws://localhost/hello?world=true&skipWebSocketFrames=true HTTP/1.1\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key:"), "websocket open event");
      half.onData.fire(VSBuffer.fromString("Opened successfully ;)\r\n\r\n"));
      return ds.add(await socket);
    }
    test("connects", async () => {
      await doConnect();
    });
    test("includes trailing connection data", async () => {
      const socketProm = MainThreadManagedSocket.connect(1, extHost, "/hello", "world=true", "", half);
      await extHost.expectEvent((evt) => evt.data && evt.data.includes("GET ws://localhost"), "websocket open event");
      half.onData.fire(VSBuffer.fromString("Opened successfully ;)\r\n\r\nSome trailing data"));
      const socket = ds.add(await socketProm);
      const data = [];
      ds.add(socket.onData((d) => data.push(d.toString())));
      await timeout(1);
      assert.deepStrictEqual(data, ["Some trailing data"]);
    });
    test("round trips data", async () => {
      const socket = await doConnect();
      const data = [];
      ds.add(socket.onData((d) => data.push(d.toString())));
      socket.write(VSBuffer.fromString("ping"));
      await extHost.expectEvent((evt) => evt.data === "ping", "expected ping");
      half.onData.fire(VSBuffer.fromString("pong"));
      assert.deepStrictEqual(data, ["pong"]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL21haW5UaHJlYWRNYW5hZ2VkU29ja2V0cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNvY2tldENsb3NlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3BhcnRzL2lwYy9jb21tb24vaXBjLm5ldC5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUmVtb3RlU29ja2V0SGFsZiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlbW90ZS9jb21tb24vbWFuYWdlZFNvY2tldC5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkTWFuYWdlZFNvY2tldCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbWFpblRocmVhZE1hbmFnZWRTb2NrZXRzLmpzJztcbmltcG9ydCB7IEV4dEhvc3RNYW5hZ2VkU29ja2V0c1NoYXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuXG5zdWl0ZSgnTWFpblRocmVhZE1hbmFnZWRTb2NrZXRzJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ01hbmFnZWRTb2NrZXQnLCAoKSA9PiB7XG5cdFx0bGV0IGV4dEhvc3Q6IEV4dEhvc3RNb2NrO1xuXHRcdGxldCBoYWxmOiBSZW1vdGVTb2NrZXRIYWxmO1xuXG5cdFx0Y2xhc3MgRXh0SG9zdE1vY2sgZXh0ZW5kcyBtb2NrPEV4dEhvc3RNYW5hZ2VkU29ja2V0c1NoYXBlPigpIHtcblx0XHRcdHByaXZhdGUgb25EaWRGaXJlID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRcdHB1YmxpYyByZWFkb25seSBldmVudHM6IGFueVtdID0gW107XG5cblx0XHRcdG92ZXJyaWRlICRyZW1vdGVTb2NrZXRXcml0ZShzb2NrZXRJZDogbnVtYmVyLCBidWZmZXI6IFZTQnVmZmVyKTogdm9pZCB7XG5cdFx0XHRcdHRoaXMuZXZlbnRzLnB1c2goeyBzb2NrZXRJZCwgZGF0YTogYnVmZmVyLnRvU3RyaW5nKCkgfSk7XG5cdFx0XHRcdHRoaXMub25EaWRGaXJlLmZpcmUoKTtcblx0XHRcdH1cblxuXHRcdFx0b3ZlcnJpZGUgJHJlbW90ZVNvY2tldERyYWluKHNvY2tldElkOiBudW1iZXIpIHtcblx0XHRcdFx0dGhpcy5ldmVudHMucHVzaCh7IHNvY2tldElkLCBldmVudDogJ2RyYWluJyB9KTtcblx0XHRcdFx0dGhpcy5vbkRpZEZpcmUuZmlyZSgpO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHR9XG5cblx0XHRcdG92ZXJyaWRlICRyZW1vdGVTb2NrZXRFbmQoc29ja2V0SWQ6IG51bWJlcikge1xuXHRcdFx0XHR0aGlzLmV2ZW50cy5wdXNoKHsgc29ja2V0SWQsIGV2ZW50OiAnZW5kJyB9KTtcblx0XHRcdFx0dGhpcy5vbkRpZEZpcmUuZmlyZSgpO1xuXHRcdFx0fVxuXG5cdFx0XHRleHBlY3RFdmVudCh0ZXN0OiAoZXZ0OiBhbnkpID0+IHZvaWQsIG1lc3NhZ2U6IHN0cmluZykge1xuXHRcdFx0XHRpZiAodGhpcy5ldmVudHMuc29tZSh0ZXN0KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGQgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRkLmFkZCh0aGlzLm9uRGlkRmlyZS5ldmVudCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5ldmVudHMuc29tZSh0ZXN0KSkge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdGQuYWRkKGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgRXhwZWN0ZWQgJHttZXNzYWdlfSBidXQgb25seSBoYWQgJHtKU09OLnN0cmluZ2lmeSh0aGlzLmV2ZW50cywgbnVsbCwgMil9YCk7XG5cdFx0XHRcdFx0fSwgMTAwMCkpO1xuXHRcdFx0XHR9KS5maW5hbGx5KCgpID0+IGQuZGlzcG9zZSgpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRleHRIb3N0ID0gbmV3IEV4dEhvc3RNb2NrKCk7XG5cdFx0XHRoYWxmID0ge1xuXHRcdFx0XHRvbkNsb3NlOiBuZXcgRW1pdHRlcjxTb2NrZXRDbG9zZUV2ZW50PigpLFxuXHRcdFx0XHRvbkRhdGE6IG5ldyBFbWl0dGVyPFZTQnVmZmVyPigpLFxuXHRcdFx0XHRvbkVuZDogbmV3IEVtaXR0ZXI8dm9pZD4oKSxcblx0XHRcdH07XG5cdFx0fSk7XG5cblx0XHRhc3luYyBmdW5jdGlvbiBkb0Nvbm5lY3QoKSB7XG5cdFx0XHRjb25zdCBzb2NrZXQgPSBNYWluVGhyZWFkTWFuYWdlZFNvY2tldC5jb25uZWN0KDEsIGV4dEhvc3QsICcvaGVsbG8nLCAnd29ybGQ9dHJ1ZScsICcnLCBoYWxmKTtcblx0XHRcdGF3YWl0IGV4dEhvc3QuZXhwZWN0RXZlbnQoZXZ0ID0+IGV2dC5kYXRhICYmIGV2dC5kYXRhLnN0YXJ0c1dpdGgoJ0dFVCB3czovL2xvY2FsaG9zdC9oZWxsbz93b3JsZD10cnVlJnNraXBXZWJTb2NrZXRGcmFtZXM9dHJ1ZSBIVFRQLzEuMVxcclxcbkNvbm5lY3Rpb246IFVwZ3JhZGVcXHJcXG5VcGdyYWRlOiB3ZWJzb2NrZXRcXHJcXG5TZWMtV2ViU29ja2V0LUtleTonKSwgJ3dlYnNvY2tldCBvcGVuIGV2ZW50Jyk7XG5cdFx0XHRoYWxmLm9uRGF0YS5maXJlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ09wZW5lZCBzdWNjZXNzZnVsbHkgOylcXHJcXG5cXHJcXG4nKSk7XG5cdFx0XHRyZXR1cm4gZHMuYWRkKGF3YWl0IHNvY2tldCk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnY29ubmVjdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBkb0Nvbm5lY3QoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIHRyYWlsaW5nIGNvbm5lY3Rpb24gZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNvY2tldFByb20gPSBNYWluVGhyZWFkTWFuYWdlZFNvY2tldC5jb25uZWN0KDEsIGV4dEhvc3QsICcvaGVsbG8nLCAnd29ybGQ9dHJ1ZScsICcnLCBoYWxmKTtcblx0XHRcdGF3YWl0IGV4dEhvc3QuZXhwZWN0RXZlbnQoZXZ0ID0+IGV2dC5kYXRhICYmIGV2dC5kYXRhLmluY2x1ZGVzKCdHRVQgd3M6Ly9sb2NhbGhvc3QnKSwgJ3dlYnNvY2tldCBvcGVuIGV2ZW50Jyk7XG5cdFx0XHRoYWxmLm9uRGF0YS5maXJlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ09wZW5lZCBzdWNjZXNzZnVsbHkgOylcXHJcXG5cXHJcXG5Tb21lIHRyYWlsaW5nIGRhdGEnKSk7XG5cdFx0XHRjb25zdCBzb2NrZXQgPSBkcy5hZGQoYXdhaXQgc29ja2V0UHJvbSk7XG5cblx0XHRcdGNvbnN0IGRhdGE6IHN0cmluZ1tdID0gW107XG5cdFx0XHRkcy5hZGQoc29ja2V0Lm9uRGF0YShkID0+IGRhdGEucHVzaChkLnRvU3RyaW5nKCkpKSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEpOyAvLyBhbGxvdyBtaWNyb3Rhc2tzIHRvIGZsdXNoXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRhdGEsIFsnU29tZSB0cmFpbGluZyBkYXRhJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncm91bmQgdHJpcHMgZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNvY2tldCA9IGF3YWl0IGRvQ29ubmVjdCgpO1xuXHRcdFx0Y29uc3QgZGF0YTogc3RyaW5nW10gPSBbXTtcblx0XHRcdGRzLmFkZChzb2NrZXQub25EYXRhKGQgPT4gZGF0YS5wdXNoKGQudG9TdHJpbmcoKSkpKTtcblxuXHRcdFx0c29ja2V0LndyaXRlKFZTQnVmZmVyLmZyb21TdHJpbmcoJ3BpbmcnKSk7XG5cdFx0XHRhd2FpdCBleHRIb3N0LmV4cGVjdEV2ZW50KGV2dCA9PiBldnQuZGF0YSA9PT0gJ3BpbmcnLCAnZXhwZWN0ZWQgcGluZycpO1xuXHRcdFx0aGFsZi5vbkRhdGEuZmlyZShWU0J1ZmZlci5mcm9tU3RyaW5nKCdwb25nJykpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkYXRhLCBbJ3BvbmcnXSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxtQkFBbUIsZUFBZTtBQUMzQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsK0JBQStCO0FBR3hDLE1BQU0sNEJBQTRCLE1BQU07QUFFdkMsUUFBTSxLQUFLLHdDQUF3QztBQUVuRCxRQUFNLGlCQUFpQixNQUFNO0FBQzVCLFFBQUk7QUFDSixRQUFJO0FBQUEsSUFFSixNQUFNLG9CQUFvQixLQUFpQyxFQUFFO0FBQUEsTUFBN0Q7QUFBQTtBQUNDLGFBQVEsWUFBWSxJQUFJLFFBQWM7QUFDdEMsYUFBZ0IsU0FBZ0IsQ0FBQztBQUFBO0FBQUEsTUFFeEIsbUJBQW1CLFVBQWtCLFFBQXdCO0FBQ3JFLGFBQUssT0FBTyxLQUFLLEVBQUUsVUFBVSxNQUFNLE9BQU8sU0FBUyxFQUFFLENBQUM7QUFDdEQsYUFBSyxVQUFVLEtBQUs7QUFBQSxNQUNyQjtBQUFBLE1BRVMsbUJBQW1CLFVBQWtCO0FBQzdDLGFBQUssT0FBTyxLQUFLLEVBQUUsVUFBVSxPQUFPLFFBQVEsQ0FBQztBQUM3QyxhQUFLLFVBQVUsS0FBSztBQUNwQixlQUFPLFFBQVEsUUFBUTtBQUFBLE1BQ3hCO0FBQUEsTUFFUyxpQkFBaUIsVUFBa0I7QUFDM0MsYUFBSyxPQUFPLEtBQUssRUFBRSxVQUFV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
