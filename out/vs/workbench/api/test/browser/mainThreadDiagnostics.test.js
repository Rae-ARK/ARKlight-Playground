import assert from "assert";
import { timeout } from "../../../../base/common/async.js";
import { URI } from "../../../../base/common/uri.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { MarkerService } from "../../../../platform/markers/common/markerService.js";
import { MainThreadDiagnostics } from "../../browser/mainThreadDiagnostics.js";
import { ExtensionHostKind } from "../../../services/extensions/common/extensionHostKind.js";
import { mock } from "../../../test/common/workbenchTestServices.js";
suite("MainThreadDiagnostics", function() {
  let markerService;
  setup(function() {
    markerService = new MarkerService();
  });
  teardown(function() {
    markerService.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("clear markers on dispose", function() {
    const diag = new MainThreadDiagnostics(
      new class {
        constructor() {
          this.remoteAuthority = "";
          this.extensionHostKind = ExtensionHostKind.LocalProcess;
        }
        dispose() {
        }
        assertRegistered() {
        }
        set(v) {
          return null;
        }
        getProxy() {
          return {
            $acceptMarkersChange() {
            }
          };
        }
        drain() {
          return null;
        }
      }(),
      markerService,
      new class extends mock() {
        asCanonicalUri(uri) {
          return uri;
        }
      }()
    );
    diag.$changeMany("foo", [[URI.file("a"), [{
      code: "666",
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 1,
      message: "fffff",
      severity: 1,
      source: "me"
    }]]]);
    assert.strictEqual(markerService.read().length, 1);
    diag.dispose();
    assert.strictEqual(markerService.read().length, 0);
  });
  test("OnDidChangeDiagnostics triggers twice on same diagnostics #136434", function() {
    return runWithFakedTimers({}, async () => {
      const changedData = [];
      const diag = new MainThreadDiagnostics(
        new class {
          constructor() {
            this.remoteAuthority = "";
            this.extensionHostKind = ExtensionHostKind.LocalProcess;
          }
          dispose() {
          }
          assertRegistered() {
          }
          set(v) {
            return null;
          }
          getProxy() {
            return {
              $acceptMarkersChange(data) {
                changedData.push(data);
              }
            };
          }
          drain() {
            return null;
          }
        }(),
        markerService,
        new class extends mock() {
          asCanonicalUri(uri) {
            return uri;
          }
        }()
      );
      const markerDataStub = {
        code: "666",
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1,
        severity: 1,
        source: "me"
      };
      const target = URI.file("a");
      diag.$changeMany("foo", [[target, [{ ...markerDataStub, message: "same_owner" }]]]);
      markerService.changeOne("bar", target, [{ ...markerDataStub, message: "forgein_owner" }]);
      await timeout(0);
      assert.strictEqual(markerService.read().length, 2);
      assert.strictEqual(changedData.length, 1);
      assert.strictEqual(changedData[0].length, 1);
      assert.strictEqual(changedData[0][0][1][0].message, "forgein_owner");
      diag.dispose();
    });
  });
  test('onDidChangeDiagnostics different behavior when "extensionKind" ui running on remote workspace #136955', function() {
    return runWithFakedTimers({}, async () => {
      const markerData = {
        code: "666",
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1,
        severity: 1,
        source: "me",
        message: "message"
      };
      const target = URI.file("a");
      markerService.changeOne("bar", target, [markerData]);
      const changedData = [];
      const diag = new MainThreadDiagnostics(
        new class {
          constructor() {
            this.remoteAuthority = "";
            this.extensionHostKind = ExtensionHostKind.LocalProcess;
          }
          dispose() {
          }
          assertRegistered() {
          }
          set(v) {
            return null;
          }
          getProxy() {
            return {
              $acceptMarkersChange(data) {
                changedData.push(data);
              }
            };
          }
          drain() {
            return null;
          }
        }(),
        markerService,
        new class extends mock() {
          asCanonicalUri(uri) {
            return uri;
          }
        }()
      );
      diag.$clear("bar");
      await timeout(0);
      assert.strictEqual(markerService.read().length, 0);
      assert.strictEqual(changedData.length, 1);
      diag.dispose();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL21haW5UaHJlYWREaWFnbm9zdGljcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFVSSSwgVXJpQ29tcG9uZW50cyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBNYXJrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbWFya2Vycy9jb21tb24vbWFya2VyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWFya2VyRGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkRGlhZ25vc3RpY3MgfSBmcm9tICcuLi8uLi9icm93c2VyL21haW5UaHJlYWREaWFnbm9zdGljcy5qcyc7XG5pbXBvcnQgeyBJRXh0SG9zdENvbnRleHQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbkhvc3RLaW5kIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9uSG9zdEtpbmQuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5cblxuc3VpdGUoJ01haW5UaHJlYWREaWFnbm9zdGljcycsIGZ1bmN0aW9uICgpIHtcblxuXHRsZXQgbWFya2VyU2VydmljZTogTWFya2VyU2VydmljZTtcblxuXHRzZXR1cChmdW5jdGlvbiAoKSB7XG5cdFx0bWFya2VyU2VydmljZSA9IG5ldyBNYXJrZXJTZXJ2aWNlKCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGZ1bmN0aW9uICgpIHtcblx0XHRtYXJrZXJTZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY2xlYXIgbWFya2VycyBvbiBkaXNwb3NlJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgZGlhZyA9IG5ldyBNYWluVGhyZWFkRGlhZ25vc3RpY3MoXG5cdFx0XHRuZXcgY2xhc3MgaW1wbGVtZW50cyBJRXh0SG9zdENvbnRleHQge1xuXHRcdFx0XHRyZW1vdGVBdXRob3JpdHkgPSAnJztcblx0XHRcdFx0ZXh0ZW5zaW9uSG9zdEtpbmQgPSBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFByb2Nlc3M7XG5cdFx0XHRcdGRpc3Bvc2UoKSB7IH1cblx0XHRcdFx0YXNzZXJ0UmVnaXN0ZXJlZCgpIHsgfVxuXHRcdFx0XHRzZXQodjogYW55KTogYW55IHsgcmV0dXJuIG51bGw7IH1cblx0XHRcdFx0Z2V0UHJveHkoKTogYW55IHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0JGFjY2VwdE1hcmtlcnNDaGFuZ2UoKSB7IH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGRyYWluKCk6IGFueSB7IHJldHVybiBudWxsOyB9XG5cdFx0XHR9LFxuXHRcdFx0bWFya2VyU2VydmljZSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVVyaUlkZW50aXR5U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzQ2Fub25pY2FsVXJpKHVyaTogVVJJKSB7IHJldHVybiB1cmk7IH1cblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0ZGlhZy4kY2hhbmdlTWFueSgnZm9vJywgW1tVUkkuZmlsZSgnYScpLCBbe1xuXHRcdFx0Y29kZTogJzY2NicsXG5cdFx0XHRzdGFydExpbmVOdW1iZXI6IDEsXG5cdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdGVuZExpbmVOdW1iZXI6IDEsXG5cdFx0XHRlbmRDb2x1bW46IDEsXG5cdFx0XHRtZXNzYWdlOiAnZmZmZmYnLFxuXHRcdFx0c2V2ZXJpdHk6IDEsXG5cdFx0XHRzb3VyY2U6ICdtZSdcblx0XHR9XV1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJTZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDEpO1xuXHRcdGRpYWcuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJTZXJ2aWNlLnJlYWQoKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdPbkRpZENoYW5nZURpYWdub3N0aWNzIHRyaWdnZXJzIHR3aWNlIG9uIHNhbWUgZGlhZ25vc3RpY3MgIzEzNjQzNCcsIGZ1bmN0aW9uICgpIHtcblxuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblxuXHRcdFx0Y29uc3QgY2hhbmdlZERhdGE6IFtVcmlDb21wb25lbnRzLCBJTWFya2VyRGF0YVtdXVtdW10gPSBbXTtcblxuXHRcdFx0Y29uc3QgZGlhZyA9IG5ldyBNYWluVGhyZWFkRGlhZ25vc3RpY3MoXG5cdFx0XHRcdG5ldyBjbGFzcyBpbXBsZW1lbnRzIElFeHRIb3N0Q29udGV4dCB7XG5cdFx0XHRcdFx0cmVtb3RlQXV0aG9yaXR5ID0gJyc7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSG9zdEtpbmQgPSBFeHRlbnNpb25Ib3N0S2luZC5Mb2NhbFByb2Nlc3M7XG5cdFx0XHRcdFx0ZGlzcG9zZSgpIHsgfVxuXHRcdFx0XHRcdGFzc2VydFJlZ2lzdGVyZWQoKSB7IH1cblx0XHRcdFx0XHRzZXQodjogYW55KTogYW55IHsgcmV0dXJuIG51bGw7IH1cblx0XHRcdFx0XHRnZXRQcm94eSgpOiBhbnkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0JGFjY2VwdE1hcmtlcnNDaGFuZ2UoZGF0YTogW1VyaUNvbXBvbmVudHMsIElNYXJrZXJEYXRhW11dW10pIHtcblx0XHRcdFx0XHRcdFx0XHRjaGFuZ2VkRGF0YS5wdXNoKGRhdGEpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkcmFpbigpOiBhbnkgeyByZXR1cm4gbnVsbDsgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtYXJrZXJTZXJ2aWNlLFxuXHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElVcmlJZGVudGl0eVNlcnZpY2U+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIGFzQ2Fub25pY2FsVXJpKHVyaTogVVJJKSB7IHJldHVybiB1cmk7IH1cblx0XHRcdFx0fVxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgbWFya2VyRGF0YVN0dWIgPSB7XG5cdFx0XHRcdGNvZGU6ICc2NjYnLFxuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyOiAxLFxuXHRcdFx0XHRlbmRDb2x1bW46IDEsXG5cdFx0XHRcdHNldmVyaXR5OiAxLFxuXHRcdFx0XHRzb3VyY2U6ICdtZSdcblx0XHRcdH07XG5cdFx0XHRjb25zdCB0YXJnZXQgPSBVUkkuZmlsZSgnYScpO1xuXHRcdFx0ZGlhZy4kY2hhbmdlTWFueSgnZm9vJywgW1t0YXJnZXQsIFt7IC4uLm1hcmtlckRhdGFTdHViLCBtZXNzYWdlOiAnc2FtZV9vd25lcicgfV1dXSk7XG5cdFx0XHRtYXJrZXJTZXJ2aWNlLmNoYW5nZU9uZSgnYmFyJywgdGFyZ2V0LCBbeyAuLi5tYXJrZXJEYXRhU3R1YiwgbWVzc2FnZTogJ2ZvcmdlaW5fb3duZXInIH1dKTtcblxuXHRcdFx0Ly8gYWRkZWQgb25lIG1hcmtlciB2aWEgdGhlIEFQSSBhbmQgb25lIHZpYSB0aGUgZXh0IGhvc3QuIHRoZSBsYXR0ZXIgbXVzdCBub3Rcblx0XHRcdC8vIHRyaWdnZXIgYW4gZXZlbnQgdG8gdGhlIGV4dGVuc2lvbiBob3N0XG5cblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2VyU2VydmljZS5yZWFkKCkubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkRGF0YS5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZWREYXRhWzBdLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZERhdGFbMF1bMF1bMV1bMF0ubWVzc2FnZSwgJ2ZvcmdlaW5fb3duZXInKTtcblxuXHRcdFx0ZGlhZy5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlRGlhZ25vc3RpY3MgZGlmZmVyZW50IGJlaGF2aW9yIHdoZW4gXCJleHRlbnNpb25LaW5kXCIgdWkgcnVubmluZyBvbiByZW1vdGUgd29ya3NwYWNlICMxMzY5NTUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRjb25zdCBtYXJrZXJEYXRhOiBJTWFya2VyRGF0YSA9IHtcblx0XHRcdFx0Y29kZTogJzY2NicsXG5cdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMSxcblx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdGVuZExpbmVOdW1iZXI6IDEsXG5cdFx0XHRcdGVuZENvbHVtbjogMSxcblx0XHRcdFx0c2V2ZXJpdHk6IDEsXG5cdFx0XHRcdHNvdXJjZTogJ21lJyxcblx0XHRcdFx0bWVzc2FnZTogJ21lc3NhZ2UnXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gVVJJLmZpbGUoJ2EnKTtcblx0XHRcdG1hcmtlclNlcnZpY2UuY2hhbmdlT25lKCdiYXInLCB0YXJnZXQsIFttYXJrZXJEYXRhXSk7XG5cblx0XHRcdGNvbnN0IGNoYW5nZWREYXRhOiBbVXJpQ29tcG9uZW50cywgSU1hcmtlckRhdGFbXV1bXVtdID0gW107XG5cblx0XHRcdGNvbnN0IGRpYWcgPSBuZXcgTWFpblRocmVhZERpYWdub3N0aWNzKFxuXHRcdFx0XHRuZXcgY2xhc3MgaW1wbGVtZW50cyBJRXh0SG9zdENvbnRleHQge1xuXHRcdFx0XHRcdHJlbW90ZUF1dGhvcml0eSA9ICcnO1xuXHRcdFx0XHRcdGV4dGVuc2lvbkhvc3RLaW5kID0gRXh0ZW5zaW9uSG9zdEtpbmQuTG9jYWxQcm9jZXNzO1xuXHRcdFx0XHRcdGRpc3Bvc2UoKSB7IH1cblx0XHRcdFx0XHRhc3NlcnRSZWdpc3RlcmVkKCkgeyB9XG5cdFx0XHRcdFx0c2V0KHY6IGFueSk6IGFueSB7IHJldHVybiBudWxsOyB9XG5cdFx0XHRcdFx0Z2V0UHJveHkoKTogYW55IHtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdCRhY2NlcHRNYXJrZXJzQ2hhbmdlKGRhdGE6IFtVcmlDb21wb25lbnRzLCBJTWFya2VyRGF0YVtdXVtdKSB7XG5cdFx0XHRcdFx0XHRcdFx0Y2hhbmdlZERhdGEucHVzaChkYXRhKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZHJhaW4oKTogYW55IHsgcmV0dXJuIG51bGw7IH1cblx0XHRcdFx0fSxcblx0XHRcdFx0bWFya2VyU2VydmljZSxcblx0XHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVXJpSWRlbnRpdHlTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSBhc0Nhbm9uaWNhbFVyaSh1cmk6IFVSSSkgeyByZXR1cm4gdXJpOyB9XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdGRpYWcuJGNsZWFyKCdiYXInKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2VyU2VydmljZS5yZWFkKCkubGVuZ3RoLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkRGF0YS5sZW5ndGgsIDEpO1xuXG5cdFx0XHRkaWFnLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUEwQjtBQUNuQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUN4RCxT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
