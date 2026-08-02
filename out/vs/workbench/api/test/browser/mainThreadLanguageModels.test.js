import assert from "assert";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { ExtensionIdentifier } from "../../../../platform/extensions/common/extensions.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { SerializableObjectWithBuffers } from "../../../services/extensions/common/proxyIdentifier.js";
import { TestExtensionService, TestProductService } from "../../../test/common/workbenchTestServices.js";
import { MainThreadLanguageModels } from "../../browser/mainThreadLanguageModels.js";
import { SingleProxyRPCProtocol } from "../common/testRPCProtocol.js";
suite("MainThreadLanguageModels", function() {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("bridges onDidChangeLanguageModels to $onChatModelsChange when the model id set changes", async () => {
    const store = disposables.add(new DisposableStore());
    const onDidChangeLanguageModels = store.add(new Emitter());
    let onChatModelsChangeCount = 0;
    let modelIds = [];
    const proxy = {
      $onChatModelsChange: () => {
        onChatModelsChangeCount++;
      }
    };
    const languageModelsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeLanguageModels = onDidChangeLanguageModels.event;
      }
      getLanguageModelIds() {
        return modelIds;
      }
    }();
    store.add(new MainThreadLanguageModels(
      SingleProxyRPCProtocol(proxy),
      languageModelsService,
      new NullLogService(),
      TestProductService,
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new TestExtensionService(),
      new class extends mock() {
      }()
    ));
    assert.strictEqual(onChatModelsChangeCount, 0);
    modelIds = ["vendor-a/model-1"];
    onDidChangeLanguageModels.fire("vendor-a");
    assert.strictEqual(onChatModelsChangeCount, 1);
    modelIds = ["vendor-a/model-1", "vendor-b/model-1"];
    onDidChangeLanguageModels.fire("vendor-b");
    assert.strictEqual(onChatModelsChangeCount, 2);
    modelIds = ["vendor-a/model-1"];
    onDidChangeLanguageModels.fire("vendor-b");
    assert.strictEqual(onChatModelsChangeCount, 3);
  });
  test("does not bridge metadata-only churn that keeps the model id set stable", async () => {
    const store = disposables.add(new DisposableStore());
    const onDidChangeLanguageModels = store.add(new Emitter());
    let onChatModelsChangeCount = 0;
    const modelIds = ["copilot/copilot-utility"];
    const proxy = {
      $onChatModelsChange: () => {
        onChatModelsChangeCount++;
      }
    };
    const languageModelsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeLanguageModels = onDidChangeLanguageModels.event;
      }
      getLanguageModelIds() {
        return modelIds;
      }
    }();
    store.add(new MainThreadLanguageModels(
      SingleProxyRPCProtocol(proxy),
      languageModelsService,
      new NullLogService(),
      TestProductService,
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new TestExtensionService(),
      new class extends mock() {
      }()
    ));
    for (let i = 0; i < 10; i++) {
      onDidChangeLanguageModels.fire("copilot");
    }
    assert.strictEqual(onChatModelsChangeCount, 0);
  });
  test("defaults isBYOK in provideLanguageModelChatInfo for built-in and extension-contributed models", async () => {
    const store = disposables.add(new DisposableStore());
    let provider;
    const copilotExtensionId = TestProductService.defaultChatAgent?.chatExtensionId;
    const proxy = {
      $provideLanguageModelChatInfo: async () => [
        {
          identifier: "explicit-true",
          metadata: {
            extension: new ExtensionIdentifier("custom.explicit-true"),
            name: "explicit-true",
            id: "explicit-true",
            vendor: "test-vendor",
            version: "1",
            family: "test-family",
            maxInputTokens: 1,
            maxOutputTokens: 1,
            isDefaultForLocation: {},
            isBYOK: true
          }
        },
        {
          identifier: "explicit-false",
          metadata: {
            extension: new ExtensionIdentifier("custom.explicit-false"),
            name: "explicit-false",
            id: "explicit-false",
            vendor: "test-vendor",
            version: "1",
            family: "test-family",
            maxInputTokens: 1,
            maxOutputTokens: 1,
            isDefaultForLocation: {},
            isBYOK: false
          }
        },
        {
          identifier: "builtin-default",
          metadata: {
            extension: new ExtensionIdentifier(copilotExtensionId ?? "builtin.copilot"),
            name: "builtin-default",
            id: "builtin-default",
            vendor: "test-vendor",
            version: "1",
            family: "test-family",
            maxInputTokens: 1,
            maxOutputTokens: 1,
            isDefaultForLocation: {}
          }
        },
        {
          identifier: "external-default",
          metadata: {
            extension: new ExtensionIdentifier("custom.external"),
            name: "external-default",
            id: "external-default",
            vendor: "test-vendor",
            version: "1",
            family: "test-family",
            maxInputTokens: 1,
            maxOutputTokens: 1,
            isDefaultForLocation: {}
          }
        }
      ]
    };
    const languageModelsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeLanguageModels = store.add(new Emitter()).event;
      }
      getLanguageModelIds() {
        return [];
      }
      registerLanguageModelProvider(_vendor, value) {
        provider = value;
        return Disposable.None;
      }
    }();
    const mainThread = store.add(new MainThreadLanguageModels(
      SingleProxyRPCProtocol(proxy),
      languageModelsService,
      new NullLogService(),
      TestProductService,
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new TestExtensionService(),
      new class extends mock() {
      }()
    ));
    mainThread.$registerLanguageModelProvider("test-vendor");
    const infos = await provider.provideLanguageModelChatInfo({ silent: true }, CancellationToken.None);
    assert.deepStrictEqual(infos.map((info) => ({ identifier: info.identifier, isBYOK: info.metadata.isBYOK })), [
      { identifier: "explicit-true", isBYOK: true },
      { identifier: "explicit-false", isBYOK: false },
      { identifier: "builtin-default", isBYOK: copilotExtensionId ? false : true },
      { identifier: "external-default", isBYOK: true }
    ]);
  });
  test("$cancelLanguageModelChatRequest cancels the token passed to $tryStartChatRequest", async () => {
    const store = disposables.add(new DisposableStore());
    let capturedToken;
    const languageModelsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeLanguageModels = store.add(new Emitter()).event;
      }
      getLanguageModelIds() {
        return [];
      }
      sendChatRequest(_modelId, _from, _messages, _options, token) {
        capturedToken = token;
        return Promise.resolve({
          stream: (async function* () {
          })(),
          result: new Promise(() => {
          })
          // never resolves
        });
      }
    }();
    const mainThread = store.add(new MainThreadLanguageModels(
      SingleProxyRPCProtocol({}),
      languageModelsService,
      new NullLogService(),
      TestProductService,
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new TestExtensionService(),
      new class extends mock() {
      }()
    ));
    const requestId = 42;
    const cts = store.add(new CancellationTokenSource());
    await mainThread.$tryStartChatRequest(
      new ExtensionIdentifier("test.ext"),
      "model-1",
      requestId,
      new SerializableObjectWithBuffers([]),
      {},
      cts.token
    );
    assert.ok(capturedToken, "token should have been captured by sendChatRequest");
    assert.strictEqual(capturedToken.isCancellationRequested, false);
    mainThread.$cancelLanguageModelChatRequest(requestId);
    assert.strictEqual(capturedToken.isCancellationRequested, true);
  });
  test("$cancelLanguageModelChatRequest is a no-op for unknown requestId", () => {
    const store = disposables.add(new DisposableStore());
    const onDidChangeLanguageModels = store.add(new Emitter());
    const languageModelsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeLanguageModels = onDidChangeLanguageModels.event;
      }
      getLanguageModelIds() {
        return [];
      }
    }();
    const mainThread = store.add(new MainThreadLanguageModels(
      SingleProxyRPCProtocol({}),
      languageModelsService,
      new NullLogService(),
      TestProductService,
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new TestExtensionService(),
      new class extends mock() {
      }()
    ));
    mainThread.$cancelLanguageModelChatRequest(999999);
  });
  test("disposes the provider request cancellation listener when the response completes", async () => {
    const store = disposables.add(new DisposableStore());
    let provider;
    let requestId;
    let cancelCount = 0;
    const proxy = {
      $startChatRequest: async (_modelId, id) => {
        requestId = id;
      },
      $cancelLanguageModelChatRequest: () => {
        cancelCount++;
      }
    };
    const languageModelsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeLanguageModels = store.add(new Emitter()).event;
      }
      getLanguageModelIds() {
        return [];
      }
      registerLanguageModelProvider(_vendor, value) {
        provider = value;
        return Disposable.None;
      }
    }();
    const mainThread = store.add(new MainThreadLanguageModels(
      SingleProxyRPCProtocol(proxy),
      languageModelsService,
      new NullLogService(),
      TestProductService,
      new class extends mock() {
      }(),
      new class extends mock() {
      }(),
      new TestExtensionService(),
      new class extends mock() {
      }()
    ));
    mainThread.$registerLanguageModelProvider("test");
    const cts = store.add(new CancellationTokenSource());
    const response = await provider.sendChatRequest("model-1", [], void 0, {}, cts.token);
    await mainThread.$reportResponseDone(requestId, void 0);
    await response.result;
    cts.cancel();
    assert.strictEqual(cancelCount, 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL21haW5UaHJlYWRMYW5ndWFnZU1vZGVscy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUF1dGhlbnRpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2F1dGhlbnRpY2F0aW9uL2NvbW1vbi9hdXRoZW50aWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvYXV0aGVudGljYXRpb24vYnJvd3Nlci9hdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxJZ25vcmVkRmlsZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9pZ25vcmVkRmlsZXMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXIsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIElDaGF0TWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgU2VyaWFsaXphYmxlT2JqZWN0V2l0aEJ1ZmZlcnMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9wcm94eUlkZW50aWZpZXIuanMnO1xuaW1wb3J0IHsgVGVzdEV4dGVuc2lvblNlcnZpY2UsIFRlc3RQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkTGFuZ3VhZ2VNb2RlbHMgfSBmcm9tICcuLi8uLi9icm93c2VyL21haW5UaHJlYWRMYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0TGFuZ3VhZ2VNb2RlbHNTaGFwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IFNpbmdsZVByb3h5UlBDUHJvdG9jb2wgfSBmcm9tICcuLi9jb21tb24vdGVzdFJQQ1Byb3RvY29sLmpzJztcblxuc3VpdGUoJ01haW5UaHJlYWRMYW5ndWFnZU1vZGVscycsIGZ1bmN0aW9uICgpIHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2JyaWRnZXMgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscyB0byAkb25DaGF0TW9kZWxzQ2hhbmdlIHdoZW4gdGhlIG1vZGVsIGlkIHNldCBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscyA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGxldCBvbkNoYXRNb2RlbHNDaGFuZ2VDb3VudCA9IDA7XG5cdFx0bGV0IG1vZGVsSWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHByb3h5OiBQYXJ0aWFsPEV4dEhvc3RMYW5ndWFnZU1vZGVsc1NoYXBlPiA9IHtcblx0XHRcdCRvbkNoYXRNb2RlbHNDaGFuZ2U6ICgpID0+IHsgb25DaGF0TW9kZWxzQ2hhbmdlQ291bnQrKzsgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxzU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzID0gb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscy5ldmVudDtcblx0XHRcdG92ZXJyaWRlIGdldExhbmd1YWdlTW9kZWxJZHMoKTogc3RyaW5nW10geyByZXR1cm4gbW9kZWxJZHM7IH1cblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKG5ldyBNYWluVGhyZWFkTGFuZ3VhZ2VNb2RlbHMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKHByb3h5KSxcblx0XHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0VGVzdFByb2R1Y3RTZXJ2aWNlLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQXV0aGVudGljYXRpb25TZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUF1dGhlbnRpY2F0aW9uQWNjZXNzU2VydmljZT4oKSB7IH0sXG5cdFx0XHRuZXcgVGVzdEV4dGVuc2lvblNlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxJZ25vcmVkRmlsZXNTZXJ2aWNlPigpIHsgfSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbkNoYXRNb2RlbHNDaGFuZ2VDb3VudCwgMCk7XG5cblx0XHQvLyBOZXcgbW9kZWwgaWRlbnRpZmllciBhcHBlYXJzIC0+IGJyaWRnZWRcblx0XHRtb2RlbElkcyA9IFsndmVuZG9yLWEvbW9kZWwtMSddO1xuXHRcdG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMuZmlyZSgndmVuZG9yLWEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob25DaGF0TW9kZWxzQ2hhbmdlQ291bnQsIDEpO1xuXG5cdFx0Ly8gQW5vdGhlciBuZXcgaWRlbnRpZmllciBhcHBlYXJzIC0+IGJyaWRnZWRcblx0XHRtb2RlbElkcyA9IFsndmVuZG9yLWEvbW9kZWwtMScsICd2ZW5kb3ItYi9tb2RlbC0xJ107XG5cdFx0b25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscy5maXJlKCd2ZW5kb3ItYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbkNoYXRNb2RlbHNDaGFuZ2VDb3VudCwgMik7XG5cblx0XHQvLyBJZGVudGlmaWVyIHJlbW92ZWQgLT4gYnJpZGdlZFxuXHRcdG1vZGVsSWRzID0gWyd2ZW5kb3ItYS9tb2RlbC0xJ107XG5cdFx0b25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscy5maXJlKCd2ZW5kb3ItYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvbkNoYXRNb2RlbHNDaGFuZ2VDb3VudCwgMyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGJyaWRnZSBtZXRhZGF0YS1vbmx5IGNodXJuIHRoYXQga2VlcHMgdGhlIG1vZGVsIGlkIHNldCBzdGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0bGV0IG9uQ2hhdE1vZGVsc0NoYW5nZUNvdW50ID0gMDtcblx0XHQvLyBTYW1lIGlkZW50aWZpZXIgc2V0IHRocm91Z2hvdXQ6IG9ubHkgbWV0YWRhdGEgKGUuZy4gYmFzZUNvdW50KSBjaGFuZ2VzIGJldHdlZW4gZmlyZXMuXG5cdFx0Y29uc3QgbW9kZWxJZHMgPSBbJ2NvcGlsb3QvY29waWxvdC11dGlsaXR5J107XG5cdFx0Y29uc3QgcHJveHk6IFBhcnRpYWw8RXh0SG9zdExhbmd1YWdlTW9kZWxzU2hhcGU+ID0ge1xuXHRcdFx0JG9uQ2hhdE1vZGVsc0NoYW5nZTogKCkgPT4geyBvbkNoYXRNb2RlbHNDaGFuZ2VDb3VudCsrOyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMgPSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzLmV2ZW50O1xuXHRcdFx0b3ZlcnJpZGUgZ2V0TGFuZ3VhZ2VNb2RlbElkcygpOiBzdHJpbmdbXSB7IHJldHVybiBtb2RlbElkczsgfVxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQobmV3IE1haW5UaHJlYWRMYW5ndWFnZU1vZGVscyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2wocHJveHkpLFxuXHRcdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRUZXN0UHJvZHVjdFNlcnZpY2UsXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBdXRoZW50aWNhdGlvblNlcnZpY2U+KCkgeyB9LFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBUZXN0RXh0ZW5zaW9uU2VydmljZSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbElnbm9yZWRGaWxlc1NlcnZpY2U+KCkgeyB9LFxuXHRcdCkpO1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAxMDsgaSsrKSB7XG5cdFx0XHRvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzLmZpcmUoJ2NvcGlsb3QnKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob25DaGF0TW9kZWxzQ2hhbmdlQ291bnQsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWZhdWx0cyBpc0JZT0sgaW4gcHJvdmlkZUxhbmd1YWdlTW9kZWxDaGF0SW5mbyBmb3IgYnVpbHQtaW4gYW5kIGV4dGVuc2lvbi1jb250cmlidXRlZCBtb2RlbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRsZXQgcHJvdmlkZXI6IElMYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNvcGlsb3RFeHRlbnNpb25JZCA9IFRlc3RQcm9kdWN0U2VydmljZS5kZWZhdWx0Q2hhdEFnZW50Py5jaGF0RXh0ZW5zaW9uSWQ7XG5cdFx0Y29uc3QgcHJveHk6IFBhcnRpYWw8RXh0SG9zdExhbmd1YWdlTW9kZWxzU2hhcGU+ID0ge1xuXHRcdFx0JHByb3ZpZGVMYW5ndWFnZU1vZGVsQ2hhdEluZm86IGFzeW5jICgpID0+IChbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAnZXhwbGljaXQtdHJ1ZScsXG5cdFx0XHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2N1c3RvbS5leHBsaWNpdC10cnVlJyksXG5cdFx0XHRcdFx0XHRuYW1lOiAnZXhwbGljaXQtdHJ1ZScsXG5cdFx0XHRcdFx0XHRpZDogJ2V4cGxpY2l0LXRydWUnLFxuXHRcdFx0XHRcdFx0dmVuZG9yOiAndGVzdC12ZW5kb3InLFxuXHRcdFx0XHRcdFx0dmVyc2lvbjogJzEnLFxuXHRcdFx0XHRcdFx0ZmFtaWx5OiAndGVzdC1mYW1pbHknLFxuXHRcdFx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEsXG5cdFx0XHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDEsXG5cdFx0XHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0XHRcdFx0XHRpc0JZT0s6IHRydWVcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZGVudGlmaWVyOiAnZXhwbGljaXQtZmFsc2UnLFxuXHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdjdXN0b20uZXhwbGljaXQtZmFsc2UnKSxcblx0XHRcdFx0XHRcdG5hbWU6ICdleHBsaWNpdC1mYWxzZScsXG5cdFx0XHRcdFx0XHRpZDogJ2V4cGxpY2l0LWZhbHNlJyxcblx0XHRcdFx0XHRcdHZlbmRvcjogJ3Rlc3QtdmVuZG9yJyxcblx0XHRcdFx0XHRcdHZlcnNpb246ICcxJyxcblx0XHRcdFx0XHRcdGZhbWlseTogJ3Rlc3QtZmFtaWx5Jyxcblx0XHRcdFx0XHRcdG1heElucHV0VG9rZW5zOiAxLFxuXHRcdFx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxLFxuXHRcdFx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdFx0XHRcdFx0aXNCWU9LOiBmYWxzZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkZW50aWZpZXI6ICdidWlsdGluLWRlZmF1bHQnLFxuXHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKGNvcGlsb3RFeHRlbnNpb25JZCA/PyAnYnVpbHRpbi5jb3BpbG90JyksXG5cdFx0XHRcdFx0XHRuYW1lOiAnYnVpbHRpbi1kZWZhdWx0Jyxcblx0XHRcdFx0XHRcdGlkOiAnYnVpbHRpbi1kZWZhdWx0Jyxcblx0XHRcdFx0XHRcdHZlbmRvcjogJ3Rlc3QtdmVuZG9yJyxcblx0XHRcdFx0XHRcdHZlcnNpb246ICcxJyxcblx0XHRcdFx0XHRcdGZhbWlseTogJ3Rlc3QtZmFtaWx5Jyxcblx0XHRcdFx0XHRcdG1heElucHV0VG9rZW5zOiAxLFxuXHRcdFx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxLFxuXHRcdFx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWRlbnRpZmllcjogJ2V4dGVybmFsLWRlZmF1bHQnLFxuXHRcdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdjdXN0b20uZXh0ZXJuYWwnKSxcblx0XHRcdFx0XHRcdG5hbWU6ICdleHRlcm5hbC1kZWZhdWx0Jyxcblx0XHRcdFx0XHRcdGlkOiAnZXh0ZXJuYWwtZGVmYXVsdCcsXG5cdFx0XHRcdFx0XHR2ZW5kb3I6ICd0ZXN0LXZlbmRvcicsXG5cdFx0XHRcdFx0XHR2ZXJzaW9uOiAnMScsXG5cdFx0XHRcdFx0XHRmYW1pbHk6ICd0ZXN0LWZhbWlseScsXG5cdFx0XHRcdFx0XHRtYXhJbnB1dFRva2VuczogMSxcblx0XHRcdFx0XHRcdG1heE91dHB1dFRva2VuczogMSxcblx0XHRcdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XSksXG5cdFx0fTtcblx0XHRjb25zdCBsYW5ndWFnZU1vZGVsc1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYW5ndWFnZU1vZGVsc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscyA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpLmV2ZW50O1xuXHRcdFx0b3ZlcnJpZGUgZ2V0TGFuZ3VhZ2VNb2RlbElkcygpOiBzdHJpbmdbXSB7IHJldHVybiBbXTsgfVxuXHRcdFx0b3ZlcnJpZGUgcmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXIoX3ZlbmRvcjogc3RyaW5nLCB2YWx1ZTogSUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXIpIHtcblx0XHRcdFx0cHJvdmlkZXIgPSB2YWx1ZTtcblx0XHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbWFpblRocmVhZCA9IHN0b3JlLmFkZChuZXcgTWFpblRocmVhZExhbmd1YWdlTW9kZWxzKFxuXHRcdFx0U2luZ2xlUHJveHlSUENQcm90b2NvbChwcm94eSksXG5cdFx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFRlc3RQcm9kdWN0U2VydmljZSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUF1dGhlbnRpY2F0aW9uU2VydmljZT4oKSB7IH0sXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2U+KCkgeyB9LFxuXHRcdFx0bmV3IFRlc3RFeHRlbnNpb25TZXJ2aWNlKCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVzU2VydmljZT4oKSB7IH0sXG5cdFx0KSk7XG5cdFx0bWFpblRocmVhZC4kcmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXIoJ3Rlc3QtdmVuZG9yJyk7XG5cblx0XHRjb25zdCBpbmZvcyA9IGF3YWl0IHByb3ZpZGVyIS5wcm92aWRlTGFuZ3VhZ2VNb2RlbENoYXRJbmZvKHsgc2lsZW50OiB0cnVlIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW5mb3MubWFwKGluZm8gPT4gKHsgaWRlbnRpZmllcjogaW5mby5pZGVudGlmaWVyLCBpc0JZT0s6IGluZm8ubWV0YWRhdGEuaXNCWU9LIH0pKSwgW1xuXHRcdFx0eyBpZGVudGlmaWVyOiAnZXhwbGljaXQtdHJ1ZScsIGlzQllPSzogdHJ1ZSB9LFxuXHRcdFx0eyBpZGVudGlmaWVyOiAnZXhwbGljaXQtZmFsc2UnLCBpc0JZT0s6IGZhbHNlIH0sXG5cdFx0XHR7IGlkZW50aWZpZXI6ICdidWlsdGluLWRlZmF1bHQnLCBpc0JZT0s6IGNvcGlsb3RFeHRlbnNpb25JZCA/IGZhbHNlIDogdHJ1ZSB9LFxuXHRcdFx0eyBpZGVudGlmaWVyOiAnZXh0ZXJuYWwtZGVmYXVsdCcsIGlzQllPSzogdHJ1ZSB9XG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJyRjYW5jZWxMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3QgY2FuY2VscyB0aGUgdG9rZW4gcGFzc2VkIHRvICR0cnlTdGFydENoYXRSZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0bGV0IGNhcHR1cmVkVG9rZW46IENhbmNlbGxhdGlvblRva2VuIHwgdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHMgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8c3RyaW5nPigpKS5ldmVudDtcblx0XHRcdG92ZXJyaWRlIGdldExhbmd1YWdlTW9kZWxJZHMoKTogc3RyaW5nW10geyByZXR1cm4gW107IH1cblx0XHRcdG92ZXJyaWRlIHNlbmRDaGF0UmVxdWVzdChfbW9kZWxJZDogc3RyaW5nLCBfZnJvbTogRXh0ZW5zaW9uSWRlbnRpZmllciwgX21lc3NhZ2VzOiBJQ2hhdE1lc3NhZ2VbXSwgX29wdGlvbnM6IHVua25vd24sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdFx0XHRjYXB0dXJlZFRva2VuID0gdG9rZW47XG5cdFx0XHRcdC8vIFJldHVybiBhIHJlc3BvbnNlIHRoYXQgbmV2ZXIgcmVzb2x2ZXMgc28gdGhlIENUUyBzdGF5cyBhbGl2ZS5cblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRcdFx0c3RyZWFtOiAoYXN5bmMgZnVuY3Rpb24qICgpIHsgfSkoKSxcblx0XHRcdFx0XHRyZXN1bHQ6IG5ldyBQcm9taXNlPHZvaWQ+KCgpID0+IHsgfSkgLy8gbmV2ZXIgcmVzb2x2ZXNcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IG1haW5UaHJlYWQgPSBzdG9yZS5hZGQobmV3IE1haW5UaHJlYWRMYW5ndWFnZU1vZGVscyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2woe30pLFxuXHRcdFx0bGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRUZXN0UHJvZHVjdFNlcnZpY2UsXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBdXRoZW50aWNhdGlvblNlcnZpY2U+KCkgeyB9LFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQXV0aGVudGljYXRpb25BY2Nlc3NTZXJ2aWNlPigpIHsgfSxcblx0XHRcdG5ldyBUZXN0RXh0ZW5zaW9uU2VydmljZSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFuZ3VhZ2VNb2RlbElnbm9yZWRGaWxlc1NlcnZpY2U+KCkgeyB9LFxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdElkID0gNDI7XG5cdFx0Y29uc3QgY3RzID0gc3RvcmUuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblxuXHRcdGF3YWl0IG1haW5UaHJlYWQuJHRyeVN0YXJ0Q2hhdFJlcXVlc3QoXG5cdFx0XHRuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdC5leHQnKSxcblx0XHRcdCdtb2RlbC0xJyxcblx0XHRcdHJlcXVlc3RJZCxcblx0XHRcdG5ldyBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVyczxJQ2hhdE1lc3NhZ2VbXT4oW10pLFxuXHRcdFx0e30sXG5cdFx0XHRjdHMudG9rZW5cblx0XHQpO1xuXG5cdFx0YXNzZXJ0Lm9rKGNhcHR1cmVkVG9rZW4sICd0b2tlbiBzaG91bGQgaGF2ZSBiZWVuIGNhcHR1cmVkIGJ5IHNlbmRDaGF0UmVxdWVzdCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZFRva2VuIS5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCwgZmFsc2UpO1xuXG5cdFx0bWFpblRocmVhZC4kY2FuY2VsTGFuZ3VhZ2VNb2RlbENoYXRSZXF1ZXN0KHJlcXVlc3RJZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWRUb2tlbiEuaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCckY2FuY2VsTGFuZ3VhZ2VNb2RlbENoYXRSZXF1ZXN0IGlzIGEgbm8tb3AgZm9yIHVua25vd24gcmVxdWVzdElkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscyA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWxzU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhbmd1YWdlTW9kZWxzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUxhbmd1YWdlTW9kZWxzID0gb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscy5ldmVudDtcblx0XHRcdG92ZXJyaWRlIGdldExhbmd1YWdlTW9kZWxJZHMoKTogc3RyaW5nW10geyByZXR1cm4gW107IH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbWFpblRocmVhZCA9IHN0b3JlLmFkZChuZXcgTWFpblRocmVhZExhbmd1YWdlTW9kZWxzKFxuXHRcdFx0U2luZ2xlUHJveHlSUENQcm90b2NvbCh7fSksXG5cdFx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFRlc3RQcm9kdWN0U2VydmljZSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUF1dGhlbnRpY2F0aW9uU2VydmljZT4oKSB7IH0sXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2U+KCkgeyB9LFxuXHRcdFx0bmV3IFRlc3RFeHRlbnNpb25TZXJ2aWNlKCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVzU2VydmljZT4oKSB7IH0sXG5cdFx0KSk7XG5cblx0XHQvLyBTaG91bGQgbm90IHRocm93XG5cdFx0bWFpblRocmVhZC4kY2FuY2VsTGFuZ3VhZ2VNb2RlbENoYXRSZXF1ZXN0KDk5OTk5OSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2VzIHRoZSBwcm92aWRlciByZXF1ZXN0IGNhbmNlbGxhdGlvbiBsaXN0ZW5lciB3aGVuIHRoZSByZXNwb25zZSBjb21wbGV0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRsZXQgcHJvdmlkZXI6IElMYW5ndWFnZU1vZGVsQ2hhdFByb3ZpZGVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCByZXF1ZXN0SWQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY2FuY2VsQ291bnQgPSAwO1xuXHRcdGNvbnN0IHByb3h5OiBQYXJ0aWFsPEV4dEhvc3RMYW5ndWFnZU1vZGVsc1NoYXBlPiA9IHtcblx0XHRcdCRzdGFydENoYXRSZXF1ZXN0OiBhc3luYyAoX21vZGVsSWQsIGlkKSA9PiB7XG5cdFx0XHRcdHJlcXVlc3RJZCA9IGlkO1xuXHRcdFx0fSxcblx0XHRcdCRjYW5jZWxMYW5ndWFnZU1vZGVsQ2hhdFJlcXVlc3Q6ICgpID0+IHtcblx0XHRcdFx0Y2FuY2VsQ291bnQrKztcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBsYW5ndWFnZU1vZGVsc1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYW5ndWFnZU1vZGVsc1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VMYW5ndWFnZU1vZGVscyA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjxzdHJpbmc+KCkpLmV2ZW50O1xuXHRcdFx0b3ZlcnJpZGUgZ2V0TGFuZ3VhZ2VNb2RlbElkcygpOiBzdHJpbmdbXSB7IHJldHVybiBbXTsgfVxuXHRcdFx0b3ZlcnJpZGUgcmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXIoX3ZlbmRvcjogc3RyaW5nLCB2YWx1ZTogSUxhbmd1YWdlTW9kZWxDaGF0UHJvdmlkZXIpIHtcblx0XHRcdFx0cHJvdmlkZXIgPSB2YWx1ZTtcblx0XHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbWFpblRocmVhZCA9IHN0b3JlLmFkZChuZXcgTWFpblRocmVhZExhbmd1YWdlTW9kZWxzKFxuXHRcdFx0U2luZ2xlUHJveHlSUENQcm90b2NvbChwcm94eSksXG5cdFx0XHRsYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFRlc3RQcm9kdWN0U2VydmljZSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUF1dGhlbnRpY2F0aW9uU2VydmljZT4oKSB7IH0sXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBdXRoZW50aWNhdGlvbkFjY2Vzc1NlcnZpY2U+KCkgeyB9LFxuXHRcdFx0bmV3IFRlc3RFeHRlbnNpb25TZXJ2aWNlKCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYW5ndWFnZU1vZGVsSWdub3JlZEZpbGVzU2VydmljZT4oKSB7IH0sXG5cdFx0KSk7XG5cdFx0bWFpblRocmVhZC4kcmVnaXN0ZXJMYW5ndWFnZU1vZGVsUHJvdmlkZXIoJ3Rlc3QnKTtcblxuXHRcdGNvbnN0IGN0cyA9IHN0b3JlLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCBwcm92aWRlciEuc2VuZENoYXRSZXF1ZXN0KCdtb2RlbC0xJywgW10sIHVuZGVmaW5lZCwge30sIGN0cy50b2tlbik7XG5cdFx0YXdhaXQgbWFpblRocmVhZC4kcmVwb3J0UmVzcG9uc2VEb25lKHJlcXVlc3RJZCEsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgcmVzcG9uc2UucmVzdWx0O1xuXHRcdGN0cy5jYW5jZWwoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYW5jZWxDb3VudCwgMCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUsvQixTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHNCQUFzQiwwQkFBMEI7QUFDekQsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyw4QkFBOEI7QUFFdkMsTUFBTSw0QkFBNEIsV0FBWTtBQUU3QyxRQUFNLGNBQWMsd0NBQXdDO0FBRTVELE9BQUssMEZBQTBGLFlBQVk7QUFDMUcsVUFBTSxRQUFRLFlBQVksSUFBSSxJQUFJLGdCQUFnQixDQUFDO0FBQ25ELFVBQU0sNEJBQTRCLE1BQU0sSUFBSSxJQUFJLFFBQWdCLENBQUM7QUFDakUsUUFBSSwwQkFBMEI7QUFDOUIsUUFBSSxXQUFxQixDQUFDO0FBQzFCLFVBQU0sUUFBNkM7QUFBQSxNQUNsRCxxQkFBcUIsTUFBTTtBQUFFO0FBQUEsTUFBMkI7QUFBQSxJQUN6RDtBQUNBLFVBQU0sd0JBQXdCLElBQUksY0FBYyxLQUE2QixFQUFFO0FBQUEsTUFBN0M7QUFBQTtBQUNqQyxhQUFrQiw0QkFBNEIsMEJBQTBCO0FBQUE7QUFBQSxNQUMvRCxzQkFBZ0M7QUFBRSxlQUFPO0FBQUEsTUFBVTtBQUFBLElBQzdEO0FBRUEsVUFBTSxJQUFJLElBQUk7QUFBQSxN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
