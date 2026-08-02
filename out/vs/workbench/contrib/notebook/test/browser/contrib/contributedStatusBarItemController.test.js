import assert from "assert";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ContributedStatusBarItemController } from "../../../browser/contrib/cellStatusBar/contributedStatusBarItemController.js";
import { INotebookCellStatusBarService } from "../../../common/notebookCellStatusBarService.js";
import { CellKind } from "../../../common/notebookCommon.js";
import { withTestNotebook } from "../testNotebookEditor.js";
suite("Notebook Statusbar", () => {
  const testDisposables = new DisposableStore();
  teardown(() => {
    testDisposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("Calls item provider", async function() {
    await withTestNotebook(
      [
        ["var b = 1;", "javascript", CellKind.Code, [], {}],
        ["# header a", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        const cellStatusbarSvc = accessor.get(INotebookCellStatusBarService);
        testDisposables.add(accessor.createInstance(ContributedStatusBarItemController, editor));
        const provider = testDisposables.add(new class extends Disposable {
          constructor() {
            super(...arguments);
            this.provideCalls = 0;
            this._onProvideCalled = this._register(new Emitter());
            this.onProvideCalled = this._onProvideCalled.event;
            this._onDidChangeStatusBarItems = this._register(new Emitter());
            this.onDidChangeStatusBarItems = this._onDidChangeStatusBarItems.event;
            this.viewType = editor.textModel.viewType;
          }
          async provideCellStatusBarItems(_uri, index, _token) {
            if (index === 0) {
              this.provideCalls++;
              this._onProvideCalled.fire(this.provideCalls);
            }
            return { items: [] };
          }
        }());
        const providePromise1 = asPromise(provider.onProvideCalled, "registering provider");
        testDisposables.add(cellStatusbarSvc.registerCellStatusBarItemProvider(provider));
        assert.strictEqual(await providePromise1, 1, "should call provider on registration");
        const providePromise2 = asPromise(provider.onProvideCalled, "updating metadata");
        const cell0 = editor.textModel.cells[0];
        cell0.metadata = { ...cell0.metadata, ...{ newMetadata: true } };
        assert.strictEqual(await providePromise2, 2, "should call provider on updating metadata");
        const providePromise3 = asPromise(provider.onProvideCalled, "changing cell language");
        cell0.language = "newlanguage";
        assert.strictEqual(await providePromise3, 3, "should call provider on changing language");
        const providePromise4 = asPromise(provider.onProvideCalled, "manually firing change event");
        provider._onDidChangeStatusBarItems.fire();
        assert.strictEqual(await providePromise4, 4, "should call provider on manually firing change event");
      }
    );
  });
});
async function asPromise(event, message) {
  const error = new Error("asPromise TIMEOUT reached: " + message);
  return new Promise((resolve, reject) => {
    const handle = setTimeout(() => {
      sub.dispose();
      reject(error);
    }, 1e3);
    const sub = event((e) => {
      clearTimeout(handle);
      sub.dispose();
      resolve(e);
    });
  });
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL3Rlc3QvYnJvd3Nlci9jb250cmliL2NvbnRyaWJ1dGVkU3RhdHVzQmFySXRlbUNvbnRyb2xsZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENvbnRyaWJ1dGVkU3RhdHVzQmFySXRlbUNvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NvbnRyaWIvY2VsbFN0YXR1c0Jhci9jb250cmlidXRlZFN0YXR1c0Jhckl0ZW1Db250cm9sbGVyLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0NlbGxTdGF0dXNCYXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ2VsbFN0YXR1c0JhclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2VsbEtpbmQsIElOb3RlYm9va0NlbGxTdGF0dXNCYXJJdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgd2l0aFRlc3ROb3RlYm9vayB9IGZyb20gJy4uL3Rlc3ROb3RlYm9va0VkaXRvci5qcyc7XG5cbnN1aXRlKCdOb3RlYm9vayBTdGF0dXNiYXInLCAoKSA9PiB7XG5cdGNvbnN0IHRlc3REaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0dGVzdERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ0NhbGxzIGl0ZW0gcHJvdmlkZXInLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0Wyd2YXIgYiA9IDE7JywgJ2phdmFzY3JpcHQnLCBDZWxsS2luZC5Db2RlLCBbXSwge31dLFxuXHRcdFx0XHRbJyMgaGVhZGVyIGEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBfZHMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNlbGxTdGF0dXNiYXJTdmMgPSBhY2Nlc3Nvci5nZXQoSU5vdGVib29rQ2VsbFN0YXR1c0JhclNlcnZpY2UpO1xuXHRcdFx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLmNyZWF0ZUluc3RhbmNlKENvbnRyaWJ1dGVkU3RhdHVzQmFySXRlbUNvbnRyb2xsZXIsIGVkaXRvcikpO1xuXG5cdFx0XHRcdGNvbnN0IHByb3ZpZGVyID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgY2xhc3MgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW1Qcm92aWRlciB7XG5cdFx0XHRcdFx0cHJpdmF0ZSBwcm92aWRlQ2FsbHMgPSAwO1xuXG5cdFx0XHRcdFx0cHJpdmF0ZSBfb25Qcm92aWRlQ2FsbGVkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8bnVtYmVyPigpKTtcblx0XHRcdFx0XHRwdWJsaWMgb25Qcm92aWRlQ2FsbGVkID0gdGhpcy5fb25Qcm92aWRlQ2FsbGVkLmV2ZW50O1xuXG5cdFx0XHRcdFx0cHVibGljIF9vbkRpZENoYW5nZVN0YXR1c0Jhckl0ZW1zID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0XHRcdFx0cHVibGljIG9uRGlkQ2hhbmdlU3RhdHVzQmFySXRlbXMgPSB0aGlzLl9vbkRpZENoYW5nZVN0YXR1c0Jhckl0ZW1zLmV2ZW50O1xuXG5cdFx0XHRcdFx0YXN5bmMgcHJvdmlkZUNlbGxTdGF0dXNCYXJJdGVtcyhfdXJpOiBVUkksIGluZGV4OiBudW1iZXIsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pIHtcblx0XHRcdFx0XHRcdGlmIChpbmRleCA9PT0gMCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnByb3ZpZGVDYWxscysrO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9vblByb3ZpZGVDYWxsZWQuZmlyZSh0aGlzLnByb3ZpZGVDYWxscyk7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHJldHVybiB7IGl0ZW1zOiBbXSB9O1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHZpZXdUeXBlID0gZWRpdG9yLnRleHRNb2RlbC52aWV3VHlwZTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnN0IHByb3ZpZGVQcm9taXNlMSA9IGFzUHJvbWlzZShwcm92aWRlci5vblByb3ZpZGVDYWxsZWQsICdyZWdpc3RlcmluZyBwcm92aWRlcicpO1xuXHRcdFx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKGNlbGxTdGF0dXNiYXJTdmMucmVnaXN0ZXJDZWxsU3RhdHVzQmFySXRlbVByb3ZpZGVyKHByb3ZpZGVyKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBwcm92aWRlUHJvbWlzZTEsIDEsICdzaG91bGQgY2FsbCBwcm92aWRlciBvbiByZWdpc3RyYXRpb24nKTtcblxuXHRcdFx0XHRjb25zdCBwcm92aWRlUHJvbWlzZTIgPSBhc1Byb21pc2UocHJvdmlkZXIub25Qcm92aWRlQ2FsbGVkLCAndXBkYXRpbmcgbWV0YWRhdGEnKTtcblx0XHRcdFx0Y29uc3QgY2VsbDAgPSBlZGl0b3IudGV4dE1vZGVsLmNlbGxzWzBdO1xuXHRcdFx0XHRjZWxsMC5tZXRhZGF0YSA9IHsgLi4uY2VsbDAubWV0YWRhdGEsIC4uLnsgbmV3TWV0YWRhdGE6IHRydWUgfSB9O1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcHJvdmlkZVByb21pc2UyLCAyLCAnc2hvdWxkIGNhbGwgcHJvdmlkZXIgb24gdXBkYXRpbmcgbWV0YWRhdGEnKTtcblxuXHRcdFx0XHRjb25zdCBwcm92aWRlUHJvbWlzZTMgPSBhc1Byb21pc2UocHJvdmlkZXIub25Qcm92aWRlQ2FsbGVkLCAnY2hhbmdpbmcgY2VsbCBsYW5ndWFnZScpO1xuXHRcdFx0XHRjZWxsMC5sYW5ndWFnZSA9ICduZXdsYW5ndWFnZSc7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBwcm92aWRlUHJvbWlzZTMsIDMsICdzaG91bGQgY2FsbCBwcm92aWRlciBvbiBjaGFuZ2luZyBsYW5ndWFnZScpO1xuXG5cdFx0XHRcdGNvbnN0IHByb3ZpZGVQcm9taXNlNCA9IGFzUHJvbWlzZShwcm92aWRlci5vblByb3ZpZGVDYWxsZWQsICdtYW51YWxseSBmaXJpbmcgY2hhbmdlIGV2ZW50Jyk7XG5cdFx0XHRcdHByb3ZpZGVyLl9vbkRpZENoYW5nZVN0YXR1c0Jhckl0ZW1zLmZpcmUoKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHByb3ZpZGVQcm9taXNlNCwgNCwgJ3Nob3VsZCBjYWxsIHByb3ZpZGVyIG9uIG1hbnVhbGx5IGZpcmluZyBjaGFuZ2UgZXZlbnQnKTtcblx0XHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5hc3luYyBmdW5jdGlvbiBhc1Byb21pc2U8VD4oZXZlbnQ6IEV2ZW50PFQ+LCBtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPFQ+IHtcblx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoJ2FzUHJvbWlzZSBUSU1FT1VUIHJlYWNoZWQ6ICcgKyBtZXNzYWdlKTtcblx0cmV0dXJuIG5ldyBQcm9taXNlPFQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCBoYW5kbGUgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdH0sIDEwMDApO1xuXG5cdFx0Y29uc3Qgc3ViID0gZXZlbnQoZSA9PiB7XG5cdFx0XHRjbGVhclRpbWVvdXQoaGFuZGxlKTtcblx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0XHRyZXNvbHZlKGUpO1xuXHRcdH0pO1xuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtB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
