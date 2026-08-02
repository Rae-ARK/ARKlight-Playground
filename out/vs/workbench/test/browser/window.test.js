import assert from "assert";
import { mainWindow } from "../../../base/browser/window.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { runWithFakedTimers } from "../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { BaseWindow } from "../../browser/window.js";
import { TestContextMenuService, TestEnvironmentService, TestHostService, TestLayoutService } from "./workbenchTestServices.js";
suite("Window", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  class TestWindow extends BaseWindow {
    constructor(window, dom) {
      super(window, dom, new TestHostService(), TestEnvironmentService, new TestContextMenuService(), new TestLayoutService());
    }
    enableWindowFocusOnElementFocus() {
    }
  }
  test("multi window aware setTimeout()", async function() {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const disposables = new DisposableStore();
      let windows = [];
      const dom = {
        getWindowsCount: () => windows.length,
        getWindows: () => windows
      };
      const setTimeoutCalls = [];
      const clearTimeoutCalls = [];
      function createWindow(id, slow) {
        const res = {
          setTimeout: function(callback, delay, ...args) {
            setTimeoutCalls.push(id);
            return mainWindow.setTimeout(() => callback(id), slow ? delay * 2 : delay, ...args);
          },
          clearTimeout: function(timeoutId) {
            clearTimeoutCalls.push(id);
            return mainWindow.clearTimeout(timeoutId);
          }
        };
        disposables.add(new TestWindow(res, dom));
        return res;
      }
      const window1 = createWindow(1);
      windows = [{ window: window1, disposables }];
      let called = false;
      await new Promise((resolve, reject) => {
        window1.setTimeout(() => {
          if (!called) {
            called = true;
            resolve();
          } else {
            reject(new Error("timeout called twice"));
          }
        }, 1);
      });
      assert.strictEqual(called, true);
      assert.deepStrictEqual(setTimeoutCalls, [1]);
      assert.deepStrictEqual(clearTimeoutCalls, []);
      called = false;
      setTimeoutCalls.length = 0;
      clearTimeoutCalls.length = 0;
      await new Promise((resolve, reject) => {
        window1.setTimeout(() => {
          if (!called) {
            called = true;
            resolve();
          } else {
            reject(new Error("timeout called twice"));
          }
        }, 0);
      });
      assert.strictEqual(called, true);
      assert.deepStrictEqual(setTimeoutCalls, [1]);
      assert.deepStrictEqual(clearTimeoutCalls, []);
      called = false;
      setTimeoutCalls.length = 0;
      clearTimeoutCalls.length = 0;
      let window2 = createWindow(2);
      const window3 = createWindow(3);
      windows = [
        { window: window2, disposables },
        { window: window1, disposables },
        { window: window3, disposables }
      ];
      await new Promise((resolve, reject) => {
        window1.setTimeout(() => {
          if (!called) {
            called = true;
            resolve();
          } else {
            reject(new Error("timeout called twice"));
          }
        }, 1);
      });
      assert.strictEqual(called, true);
      assert.deepStrictEqual(setTimeoutCalls, [2, 1, 3]);
      assert.deepStrictEqual(clearTimeoutCalls, [2, 1, 3]);
      called = false;
      setTimeoutCalls.length = 0;
      clearTimeoutCalls.length = 0;
      window2 = createWindow(2, true);
      windows = [
        { window: window2, disposables },
        { window: window1, disposables }
      ];
      await new Promise((resolve, reject) => {
        window1.setTimeout((windowId) => {
          if (!called && windowId === 1) {
            called = true;
            resolve();
          } else if (called) {
            reject(new Error("timeout called twice"));
          } else {
            reject(new Error("timeout called for wrong window"));
          }
        }, 1);
      });
      assert.strictEqual(called, true);
      assert.deepStrictEqual(setTimeoutCalls, [2, 1]);
      assert.deepStrictEqual(clearTimeoutCalls, [2, 1]);
      called = false;
      setTimeoutCalls.length = 0;
      clearTimeoutCalls.length = 0;
      disposables.dispose();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvd2luZG93LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBJUmVnaXN0ZXJlZENvZGVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IENvZGVXaW5kb3csIG1haW5XaW5kb3cgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBCYXNlV2luZG93IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgVGVzdENvbnRleHRNZW51U2VydmljZSwgVGVzdEVudmlyb25tZW50U2VydmljZSwgVGVzdEhvc3RTZXJ2aWNlLCBUZXN0TGF5b3V0U2VydmljZSB9IGZyb20gJy4vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcblxuc3VpdGUoJ1dpbmRvdycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjbGFzcyBUZXN0V2luZG93IGV4dGVuZHMgQmFzZVdpbmRvdyB7XG5cblx0XHRjb25zdHJ1Y3Rvcih3aW5kb3c6IENvZGVXaW5kb3csIGRvbTogeyBnZXRXaW5kb3dzQ291bnQ6ICgpID0+IG51bWJlcjsgZ2V0V2luZG93czogKCkgPT4gSXRlcmFibGU8SVJlZ2lzdGVyZWRDb2RlV2luZG93PiB9KSB7XG5cdFx0XHRzdXBlcih3aW5kb3csIGRvbSwgbmV3IFRlc3RIb3N0U2VydmljZSgpLCBUZXN0RW52aXJvbm1lbnRTZXJ2aWNlLCBuZXcgVGVzdENvbnRleHRNZW51U2VydmljZSgpLCBuZXcgVGVzdExheW91dFNlcnZpY2UoKSk7XG5cdFx0fVxuXG5cdFx0cHJvdGVjdGVkIG92ZXJyaWRlIGVuYWJsZVdpbmRvd0ZvY3VzT25FbGVtZW50Rm9jdXMoKTogdm9pZCB7IH1cblx0fVxuXG5cdHRlc3QoJ211bHRpIHdpbmRvdyBhd2FyZSBzZXRUaW1lb3V0KCknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdGxldCB3aW5kb3dzOiBJUmVnaXN0ZXJlZENvZGVXaW5kb3dbXSA9IFtdO1xuXHRcdFx0Y29uc3QgZG9tID0ge1xuXHRcdFx0XHRnZXRXaW5kb3dzQ291bnQ6ICgpID0+IHdpbmRvd3MubGVuZ3RoLFxuXHRcdFx0XHRnZXRXaW5kb3dzOiAoKSA9PiB3aW5kb3dzXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBzZXRUaW1lb3V0Q2FsbHM6IG51bWJlcltdID0gW107XG5cdFx0XHRjb25zdCBjbGVhclRpbWVvdXRDYWxsczogbnVtYmVyW10gPSBbXTtcblxuXHRcdFx0ZnVuY3Rpb24gY3JlYXRlV2luZG93KGlkOiBudW1iZXIsIHNsb3c/OiBib29sZWFuKSB7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRjb25zdCByZXMgPSB7XG5cdFx0XHRcdFx0c2V0VGltZW91dDogZnVuY3Rpb24gKGNhbGxiYWNrOiBGdW5jdGlvbiwgZGVsYXk6IG51bWJlciwgLi4uYXJnczogdW5rbm93bltdKTogbnVtYmVyIHtcblx0XHRcdFx0XHRcdHNldFRpbWVvdXRDYWxscy5wdXNoKGlkKTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuIG1haW5XaW5kb3cuc2V0VGltZW91dCgoKSA9PiBjYWxsYmFjayhpZCksIHNsb3cgPyBkZWxheSAqIDIgOiBkZWxheSwgLi4uYXJncyk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRjbGVhclRpbWVvdXQ6IGZ1bmN0aW9uICh0aW1lb3V0SWQ6IG51bWJlcik6IHZvaWQge1xuXHRcdFx0XHRcdFx0Y2xlYXJUaW1lb3V0Q2FsbHMucHVzaChpZCk7XG5cblx0XHRcdFx0XHRcdHJldHVybiBtYWluV2luZG93LmNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBhcyBhbnk7XG5cblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0V2luZG93KHJlcywgZG9tKSk7XG5cblx0XHRcdFx0cmV0dXJuIHJlcztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgd2luZG93MSA9IGNyZWF0ZVdpbmRvdygxKTtcblx0XHRcdHdpbmRvd3MgPSBbeyB3aW5kb3c6IHdpbmRvdzEsIGRpc3Bvc2FibGVzIH1dO1xuXG5cdFx0XHQvLyBXaW5kb3cgQ291bnQ6IDFcblxuXHRcdFx0bGV0IGNhbGxlZCA9IGZhbHNlO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHR3aW5kb3cxLnNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGlmICghY2FsbGVkKSB7XG5cdFx0XHRcdFx0XHRjYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKCd0aW1lb3V0IGNhbGxlZCB0d2ljZScpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIDEpO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXRUaW1lb3V0Q2FsbHMsIFsxXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsZWFyVGltZW91dENhbGxzLCBbXSk7XG5cdFx0XHRjYWxsZWQgPSBmYWxzZTtcblx0XHRcdHNldFRpbWVvdXRDYWxscy5sZW5ndGggPSAwO1xuXHRcdFx0Y2xlYXJUaW1lb3V0Q2FsbHMubGVuZ3RoID0gMDtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHR3aW5kb3cxLnNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGlmICghY2FsbGVkKSB7XG5cdFx0XHRcdFx0XHRjYWxsZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZWplY3QobmV3IEVycm9yKCd0aW1lb3V0IGNhbGxlZCB0d2ljZScpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sIDApO1xuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsZWQsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXRUaW1lb3V0Q2FsbHMsIFsxXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsZWFyVGltZW91dENhbGxzLCBbXSk7XG5cdFx0XHRjYWxsZWQgPSBmYWxzZTtcblx0XHRcdHNldFRpbWVvdXRDYWxscy5sZW5ndGggPSAwO1xuXHRcdFx0Y2xlYXJUaW1lb3V0Q2FsbHMubGVuZ3RoID0gMDtcblxuXHRcdFx0Ly8gV2luZG93IENvdW50OiAzXG5cblx0XHRcdGxldCB3aW5kb3cyID0gY3JlYXRlV2luZG93KDIpO1xuXHRcdFx0Y29uc3Qgd2luZG93MyA9IGNyZWF0ZVdpbmRvdygzKTtcblx0XHRcdHdpbmRvd3MgPSBbXG5cdFx0XHRcdHsgd2luZG93OiB3aW5kb3cyLCBkaXNwb3NhYmxlcyB9LFxuXHRcdFx0XHR7IHdpbmRvdzogd2luZG93MSwgZGlzcG9zYWJsZXMgfSxcblx0XHRcdFx0eyB3aW5kb3c6IHdpbmRvdzMsIGRpc3Bvc2FibGVzIH1cblx0XHRcdF07XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdFx0d2luZG93MS5zZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHRpZiAoIWNhbGxlZCkge1xuXHRcdFx0XHRcdFx0Y2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcigndGltZW91dCBjYWxsZWQgdHdpY2UnKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCAxKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbGVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2V0VGltZW91dENhbGxzLCBbMiwgMSwgM10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbGVhclRpbWVvdXRDYWxscywgWzIsIDEsIDNdKTtcblx0XHRcdGNhbGxlZCA9IGZhbHNlO1xuXHRcdFx0c2V0VGltZW91dENhbGxzLmxlbmd0aCA9IDA7XG5cdFx0XHRjbGVhclRpbWVvdXRDYWxscy5sZW5ndGggPSAwO1xuXG5cdFx0XHQvLyBXaW5kb3cgQ291bnQ6IDIgKDEgZmFzdCwgMSBzbG93KVxuXG5cdFx0XHR3aW5kb3cyID0gY3JlYXRlV2luZG93KDIsIHRydWUpO1xuXHRcdFx0d2luZG93cyA9IFtcblx0XHRcdFx0eyB3aW5kb3c6IHdpbmRvdzIsIGRpc3Bvc2FibGVzIH0sXG5cdFx0XHRcdHsgd2luZG93OiB3aW5kb3cxLCBkaXNwb3NhYmxlcyB9LFxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHR3aW5kb3cxLnNldFRpbWVvdXQoKHdpbmRvd0lkOiBudW1iZXIpID0+IHtcblx0XHRcdFx0XHRpZiAoIWNhbGxlZCAmJiB3aW5kb3dJZCA9PT0gMSkge1xuXHRcdFx0XHRcdFx0Y2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGNhbGxlZCkge1xuXHRcdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcigndGltZW91dCBjYWxsZWQgdHdpY2UnKSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlamVjdChuZXcgRXJyb3IoJ3RpbWVvdXQgY2FsbGVkIGZvciB3cm9uZyB3aW5kb3cnKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCAxKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbGVkLCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2V0VGltZW91dENhbGxzLCBbMiwgMV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjbGVhclRpbWVvdXRDYWxscywgWzIsIDFdKTtcblx0XHRcdGNhbGxlZCA9IGZhbHNlO1xuXHRcdFx0c2V0VGltZW91dENhbGxzLmxlbmd0aCA9IDA7XG5cdFx0XHRjbGVhclRpbWVvdXRDYWxscy5sZW5ndGggPSAwO1xuXG5cdFx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFFbkIsU0FBcUIsa0JBQWtCO0FBQ3ZDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsd0JBQXdCLHdCQUF3QixpQkFBaUIseUJBQXlCO0FBRW5HLE1BQU0sVUFBVSxNQUFNO0FBRXJCLDBDQUF3QztBQUFBLEVBRXhDLE1BQU0sbUJBQW1CLFdBQVc7QUFBQSxJQUVuQyxZQUFZLFFBQW9CLEtBQTJGO0FBQzFILFlBQU0sUUFBUSxLQUFLLElBQUksZ0JBQWdCLEdBQUcsd0JBQXdCLElBQUksdUJBQXVCLEdBQUcsSUFBSSxrQkFBa0IsQ0FBQztBQUFBLElBQ3hIO0FBQUEsSUFFbUIsa0NBQXdDO0FBQUEsSUFBRTtBQUFBLEVBQzlEO0FBRUEsT0FBSyxtQ0FBbUMsaUJBQWtCO0FBQ3pELFdBQU8sbUJBQW1CLEVBQUUsZUFBZSxLQUFLLEdBQUcsWUFBWTtBQUM5RCxZQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFFeEMsVUFBSSxVQUFtQyxDQUFDO0FBQ3hDLFlBQU0sTUFBTTtBQUFBLFFBQ1gsaUJBQWlCLE1BQU0sUUFBUTtBQUFBLFFBQy9CLFlBQVksTUFBTTtBQUFBLE1BQ25CO0FBRUEsWUFBTSxrQkFBNEIsQ0FBQztBQUNuQyxZQUFNLG9CQUE4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
