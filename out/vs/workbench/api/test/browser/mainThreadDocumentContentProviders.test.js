import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { MainThreadDocumentContentProviders } from "../../browser/mainThreadDocumentContentProviders.js";
import { createTextModel } from "../../../../editor/test/common/testTextModel.js";
import { mock } from "../../../../base/test/common/mock.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("MainThreadDocumentContentProviders", function() {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("events are processed properly", function() {
    const uri = URI.parse("test:uri");
    const model = createTextModel("1", void 0, void 0, uri);
    const providers = new MainThreadDocumentContentProviders(
      new TestRPCProtocol(),
      null,
      null,
      new class extends mock() {
        getModel(_uri) {
          assert.strictEqual(uri.toString(), _uri.toString());
          return model;
        }
      }(),
      new class extends mock() {
        computeMoreMinimalEdits(_uri, data) {
          assert.strictEqual(model.getValue(), "1");
          return Promise.resolve(data);
        }
      }()
    );
    store.add(model);
    store.add(providers);
    return new Promise((resolve, reject) => {
      let expectedEvents = 1;
      store.add(model.onDidChangeContent((e) => {
        expectedEvents -= 1;
        try {
          assert.ok(expectedEvents >= 0);
        } catch (err) {
          reject(err);
        }
        if (model.getValue() === "1\n2\n3") {
          model.dispose();
          resolve();
        }
      }));
      providers.$onVirtualDocumentChange(uri, "1\n2");
      providers.$onVirtualDocumentChange(uri, "1\n2\n3");
    });
  });
  test("model disposed during async operation", async function() {
    const uri = URI.parse("test:disposed");
    const model = createTextModel("initial", void 0, void 0, uri);
    let disposeModelDuringEdit = false;
    const providers = new MainThreadDocumentContentProviders(
      new TestRPCProtocol(),
      null,
      null,
      new class extends mock() {
        getModel(_uri) {
          assert.strictEqual(uri.toString(), _uri.toString());
          return model;
        }
      }(),
      new class extends mock() {
        async computeMoreMinimalEdits(_uri, data) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          if (disposeModelDuringEdit) {
            model.dispose();
          }
          return data;
        }
      }()
    );
    store.add(model);
    store.add(providers);
    await providers.$onVirtualDocumentChange(uri, "updated");
    assert.strictEqual(model.getValue(), "updated");
    disposeModelDuringEdit = true;
    await providers.$onVirtualDocumentChange(uri, "should not apply");
    assert.ok(model.isDisposed());
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL21haW5UaHJlYWREb2N1bWVudENvbnRlbnRQcm92aWRlcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkRG9jdW1lbnRDb250ZW50UHJvdmlkZXJzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tYWluVGhyZWFkRG9jdW1lbnRDb250ZW50UHJvdmlkZXJzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSUVkaXRvcldvcmtlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2VkaXRvcldvcmtlci5qcyc7XG5pbXBvcnQgeyBUZXN0UlBDUHJvdG9jb2wgfSBmcm9tICcuLi9jb21tb24vdGVzdFJQQ1Byb3RvY29sLmpzJztcbmltcG9ydCB7IFRleHRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdNYWluVGhyZWFkRG9jdW1lbnRDb250ZW50UHJvdmlkZXJzJywgZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZXZlbnRzIGFyZSBwcm9jZXNzZWQgcHJvcGVybHknLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3Rlc3Q6dXJpJyk7XG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJzEnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdXJpKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVycyA9IG5ldyBNYWluVGhyZWFkRG9jdW1lbnRDb250ZW50UHJvdmlkZXJzKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwgbnVsbCEsIG51bGwhLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTW9kZWxTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0TW9kZWwoX3VyaTogVVJJKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS50b1N0cmluZygpLCBfdXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdHJldHVybiBtb2RlbDtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvcldvcmtlclNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBjb21wdXRlTW9yZU1pbmltYWxFZGl0cyhfdXJpOiBVUkksIGRhdGE6IFRleHRFZGl0W10gfCB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZ2V0VmFsdWUoKSwgJzEnKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGRhdGEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdCk7XG5cblx0XHRzdG9yZS5hZGQobW9kZWwpO1xuXHRcdHN0b3JlLmFkZChwcm92aWRlcnMpO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGxldCBleHBlY3RlZEV2ZW50cyA9IDE7XG5cdFx0XHRzdG9yZS5hZGQobW9kZWwub25EaWRDaGFuZ2VDb250ZW50KGUgPT4ge1xuXHRcdFx0XHRleHBlY3RlZEV2ZW50cyAtPSAxO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGFzc2VydC5vayhleHBlY3RlZEV2ZW50cyA+PSAwKTtcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0cmVqZWN0KGVycik7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKG1vZGVsLmdldFZhbHVlKCkgPT09ICcxXFxuMlxcbjMnKSB7XG5cdFx0XHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0cHJvdmlkZXJzLiRvblZpcnR1YWxEb2N1bWVudENoYW5nZSh1cmksICcxXFxuMicpO1xuXHRcdFx0cHJvdmlkZXJzLiRvblZpcnR1YWxEb2N1bWVudENoYW5nZSh1cmksICcxXFxuMlxcbjMnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbW9kZWwgZGlzcG9zZWQgZHVyaW5nIGFzeW5jIG9wZXJhdGlvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3Rlc3Q6ZGlzcG9zZWQnKTtcblx0XHRjb25zdCBtb2RlbCA9IGNyZWF0ZVRleHRNb2RlbCgnaW5pdGlhbCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1cmkpO1xuXG5cdFx0bGV0IGRpc3Bvc2VNb2RlbER1cmluZ0VkaXQgPSBmYWxzZTtcblxuXHRcdGNvbnN0IHByb3ZpZGVycyA9IG5ldyBNYWluVGhyZWFkRG9jdW1lbnRDb250ZW50UHJvdmlkZXJzKG5ldyBUZXN0UlBDUHJvdG9jb2woKSwgbnVsbCEsIG51bGwhLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTW9kZWxTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgZ2V0TW9kZWwoX3VyaTogVVJJKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVyaS50b1N0cmluZygpLCBfdXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0XHRcdHJldHVybiBtb2RlbDtcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvcldvcmtlclNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBjb21wdXRlTW9yZU1pbmltYWxFZGl0cyhfdXJpOiBVUkksIGRhdGE6IFRleHRFZGl0W10gfCB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHQvLyBTaW11bGF0ZSBhc3luYyBvcGVyYXRpb25cblx0XHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcblxuXHRcdFx0XHRcdC8vIERpc3Bvc2UgbW9kZWwgZHVyaW5nIHRoZSBhc3luYyBvcGVyYXRpb24gaWYgZmxhZyBpcyBzZXRcblx0XHRcdFx0XHRpZiAoZGlzcG9zZU1vZGVsRHVyaW5nRWRpdCkge1xuXHRcdFx0XHRcdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBkYXRhO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdCk7XG5cblx0XHRzdG9yZS5hZGQobW9kZWwpO1xuXHRcdHN0b3JlLmFkZChwcm92aWRlcnMpO1xuXG5cdFx0Ly8gRmlyc3QgY2FsbCBzaG91bGQgd29yayBub3JtYWxseVxuXHRcdGF3YWl0IHByb3ZpZGVycy4kb25WaXJ0dWFsRG9jdW1lbnRDaGFuZ2UodXJpLCAndXBkYXRlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5nZXRWYWx1ZSgpLCAndXBkYXRlZCcpO1xuXG5cdFx0Ly8gU2Vjb25kIGNhbGwgc2hvdWxkIG5vdCB0aHJvdyBldmVuIHRob3VnaCBtb2RlbCBnZXRzIGRpc3Bvc2VkIGR1cmluZyBhc3luYyBvcGVyYXRpb25cblx0XHRkaXNwb3NlTW9kZWxEdXJpbmdFZGl0ID0gdHJ1ZTtcblx0XHRhd2FpdCBwcm92aWRlcnMuJG9uVmlydHVhbERvY3VtZW50Q2hhbmdlKHVyaSwgJ3Nob3VsZCBub3QgYXBwbHknKTtcblxuXHRcdC8vIE1vZGVsIHNob3VsZCBiZSBkaXNwb3NlZCBhbmQgdmFsdWUgdW5jaGFuZ2VkXG5cdFx0YXNzZXJ0Lm9rKG1vZGVsLmlzRGlzcG9zZWQoKSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsWUFBWTtBQUdyQixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLCtDQUErQztBQUV4RCxNQUFNLHNDQUFzQyxXQUFZO0FBRXZELFFBQU0sUUFBUSx3Q0FBd0M7QUFFdEQsT0FBSyxpQ0FBaUMsV0FBWTtBQUVqRCxVQUFNLE1BQU0sSUFB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
