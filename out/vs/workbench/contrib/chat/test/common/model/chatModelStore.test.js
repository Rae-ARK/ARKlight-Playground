import assert from "assert";
import { DeferredPromise } from "../../../../../../base/common/async.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { ChatModelStore } from "../../../common/model/chatModelStore.js";
import { ChatAgentLocation } from "../../../common/constants.js";
import { MockChatModel } from "./mockChatModel.js";
suite("ChatModelStore", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let testObject;
  let createdModels;
  let willDisposePromises;
  setup(() => {
    createdModels = [];
    willDisposePromises = [];
    testObject = store.add(new ChatModelStore({
      createModel: (props) => {
        const model = new MockChatModel(props.sessionResource);
        createdModels.push(model);
        return model;
      },
      willDisposeModel: async (model) => {
        const p = new DeferredPromise();
        willDisposePromises.push(p);
        await p.p;
      }
    }, new NullLogService()));
  });
  test("create and dispose", async () => {
    const uri = URI.parse("test://session");
    const props = {
      sessionResource: uri,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const ref = testObject.acquireOrCreate(props);
    assert.strictEqual(createdModels.length, 1);
    assert.strictEqual(ref.object, createdModels[0]);
    ref.dispose();
    assert.strictEqual(willDisposePromises.length, 1);
    willDisposePromises[0].complete();
    await testObject.waitForModelDisposals();
    assert.strictEqual(testObject.get(uri), void 0);
  });
  test("resurrection", async () => {
    const uri = URI.parse("test://session");
    const props = {
      sessionResource: uri,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const ref1 = testObject.acquireOrCreate(props);
    const model1 = ref1.object;
    ref1.dispose();
    assert.strictEqual(willDisposePromises.length, 1);
    assert.strictEqual(testObject.get(uri), model1);
    const ref2 = testObject.acquireOrCreate(props);
    assert.strictEqual(ref2.object, model1);
    assert.strictEqual(createdModels.length, 1);
    willDisposePromises[0].complete();
    await testObject.waitForModelDisposals();
    assert.strictEqual(testObject.get(uri), model1);
    ref2.dispose();
  });
  test("get and has", async () => {
    const uri = URI.parse("test://session");
    const props = {
      sessionResource: uri,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const ref = testObject.acquireOrCreate(props);
    assert.strictEqual(testObject.get(uri), ref.object);
    assert.strictEqual(testObject.has(uri), true);
    ref.dispose();
    willDisposePromises[0].complete();
    await testObject.waitForModelDisposals();
    assert.strictEqual(testObject.get(uri), void 0);
    assert.strictEqual(testObject.has(uri), false);
  });
  test("acquireExisting", async () => {
    const uri = URI.parse("test://session");
    const props = {
      sessionResource: uri,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    assert.strictEqual(testObject.acquireExisting(uri), void 0);
    const ref1 = testObject.acquireOrCreate(props);
    const ref2 = testObject.acquireExisting(uri);
    assert.ok(ref2);
    assert.strictEqual(ref2.object, ref1.object);
    ref1.dispose();
    ref2.dispose();
    willDisposePromises[0].complete();
    await testObject.waitForModelDisposals();
  });
  test("values", async () => {
    const uri1 = URI.parse("test://session1");
    const uri2 = URI.parse("test://session2");
    const props1 = {
      sessionResource: uri1,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const props2 = {
      sessionResource: uri2,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const ref1 = testObject.acquireOrCreate(props1);
    const ref2 = testObject.acquireOrCreate(props2);
    const values = Array.from(testObject.values());
    assert.strictEqual(values.length, 2);
    assert.ok(values.includes(ref1.object));
    assert.ok(values.includes(ref2.object));
    ref1.dispose();
    ref2.dispose();
    willDisposePromises[0].complete();
    willDisposePromises[1].complete();
    await testObject.waitForModelDisposals();
  });
  test("dispose store", async () => {
    const uri = URI.parse("test://session");
    const props = {
      sessionResource: uri,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const ref = testObject.acquireOrCreate(props);
    const model = ref.object;
    testObject.dispose();
    assert.strictEqual(model.isDisposed, true);
  });
  test("tracks reference owners and creation owner", async () => {
    const uri = URI.parse("test://session");
    const props = {
      sessionResource: uri,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const ref1 = testObject.acquireOrCreate(props, "ChatModelStoreTest#create");
    const ref2 = testObject.acquireExisting(uri, "ChatModelStoreTest#existing");
    const ref3 = testObject.acquireExisting(uri, "ChatModelStoreTest#existing");
    assert.deepStrictEqual(testObject.getReferenceDebugSnapshot(), {
      totalModels: 1,
      totalReferences: 3,
      models: [{
        sessionResource: uri,
        title: "",
        createdBy: "ChatModelStoreTest#create",
        initialLocation: ChatAgentLocation.Chat,
        isImported: false,
        willKeepAlive: true,
        hasPendingEdits: false,
        pendingDisposal: false,
        referenceCount: 3,
        holders: [
          { holder: "ChatModelStoreTest#existing", count: 2 },
          { holder: "ChatModelStoreTest#create", count: 1 }
        ]
      }]
    });
    ref1.dispose();
    ref2?.dispose();
    ref3?.dispose();
    willDisposePromises[0].complete();
    await testObject.waitForModelDisposals();
  });
  test("reports pending disposal models without holders", async () => {
    const uri = URI.parse("test://session");
    const props = {
      sessionResource: uri,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const ref = testObject.acquireOrCreate(props, "ChatModelStoreTest#create");
    ref.dispose();
    assert.deepStrictEqual(testObject.getReferenceDebugSnapshot(), {
      totalModels: 1,
      totalReferences: 0,
      models: [{
        sessionResource: uri,
        title: "",
        createdBy: "ChatModelStoreTest#create",
        initialLocation: ChatAgentLocation.Chat,
        isImported: false,
        willKeepAlive: true,
        hasPendingEdits: false,
        pendingDisposal: true,
        referenceCount: 0,
        holders: []
      }]
    });
    willDisposePromises[0].complete();
    await testObject.waitForModelDisposals();
  });
  test("resurrection preserves debug tracking", async () => {
    const uri = URI.parse("test://session");
    const props = {
      sessionResource: uri,
      location: ChatAgentLocation.Chat,
      canUseTools: true
    };
    const ref1 = testObject.acquireOrCreate(props, "OriginalCreator");
    ref1.dispose();
    const ref2 = testObject.acquireOrCreate(props, "Rescuer");
    willDisposePromises[0].complete();
    await testObject.waitForModelDisposals();
    assert.deepStrictEqual(testObject.getReferenceDebugSnapshot(), {
      totalModels: 1,
      totalReferences: 1,
      models: [{
        sessionResource: uri,
        title: "",
        createdBy: "OriginalCreator",
        initialLocation: ChatAgentLocation.Chat,
        isImported: false,
        willKeepAlive: true,
        hasPendingEdits: false,
        pendingDisposal: false,
        referenceCount: 1,
        holders: [{ holder: "Rescuer", count: 1 }]
      }]
    });
    ref2.dispose();
    willDisposePromises[1].complete();
    await testObject.waitForModelDisposals();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9jb21tb24vbW9kZWwvY2hhdE1vZGVsU3RvcmUudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZWxTdG9yZSwgSVN0YXJ0U2Vzc2lvblByb3BzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbFN0b3JlLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdE1vZGVsIH0gZnJvbSAnLi9tb2NrQ2hhdE1vZGVsLmpzJztcblxuc3VpdGUoJ0NoYXRNb2RlbFN0b3JlJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCB0ZXN0T2JqZWN0OiBDaGF0TW9kZWxTdG9yZTtcblx0bGV0IGNyZWF0ZWRNb2RlbHM6IE1vY2tDaGF0TW9kZWxbXTtcblx0bGV0IHdpbGxEaXNwb3NlUHJvbWlzZXM6IERlZmVycmVkUHJvbWlzZTx2b2lkPltdO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjcmVhdGVkTW9kZWxzID0gW107XG5cdFx0d2lsbERpc3Bvc2VQcm9taXNlcyA9IFtdO1xuXHRcdHRlc3RPYmplY3QgPSBzdG9yZS5hZGQobmV3IENoYXRNb2RlbFN0b3JlKHtcblx0XHRcdGNyZWF0ZU1vZGVsOiAocHJvcHM6IElTdGFydFNlc3Npb25Qcm9wcykgPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IG5ldyBNb2NrQ2hhdE1vZGVsKHByb3BzLnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRcdGNyZWF0ZWRNb2RlbHMucHVzaChtb2RlbCk7XG5cdFx0XHRcdHJldHVybiBtb2RlbCBhcyB1bmtub3duIGFzIENoYXRNb2RlbDtcblx0XHRcdH0sXG5cdFx0XHR3aWxsRGlzcG9zZU1vZGVsOiBhc3luYyAobW9kZWw6IENoYXRNb2RlbCkgPT4ge1xuXHRcdFx0XHRjb25zdCBwID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0XHR3aWxsRGlzcG9zZVByb21pc2VzLnB1c2gocCk7XG5cdFx0XHRcdGF3YWl0IHAucDtcblx0XHRcdH1cblx0XHR9LCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGUgYW5kIGRpc3Bvc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpO1xuXHRcdGNvbnN0IHByb3BzOiBJU3RhcnRTZXNzaW9uUHJvcHMgPSB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHVyaSxcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Y2FuVXNlVG9vbHM6IHRydWVcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVmID0gdGVzdE9iamVjdC5hY3F1aXJlT3JDcmVhdGUocHJvcHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjcmVhdGVkTW9kZWxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZi5vYmplY3QsIGNyZWF0ZWRNb2RlbHNbMF0pO1xuXG5cdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lsbERpc3Bvc2VQcm9taXNlcy5sZW5ndGgsIDEpO1xuXG5cdFx0d2lsbERpc3Bvc2VQcm9taXNlc1swXS5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud2FpdEZvck1vZGVsRGlzcG9zYWxzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0KHVyaSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3VycmVjdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyk7XG5cdFx0Y29uc3QgcHJvcHM6IElTdGFydFNlc3Npb25Qcm9wcyA9IHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogdXJpLFxuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRjYW5Vc2VUb29sczogdHJ1ZVxuXHRcdH07XG5cblx0XHRjb25zdCByZWYxID0gdGVzdE9iamVjdC5hY3F1aXJlT3JDcmVhdGUocHJvcHMpO1xuXHRcdGNvbnN0IG1vZGVsMSA9IHJlZjEub2JqZWN0O1xuXHRcdHJlZjEuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gTW9kZWwgaXMgcGVuZGluZyBkaXNwb3NhbFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWxsRGlzcG9zZVByb21pc2VzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0KHVyaSksIG1vZGVsMSk7XG5cblx0XHQvLyBBY3F1aXJlIGFnYWluIC0gc2hvdWxkIGJlIHJlc3VycmVjdGVkXG5cdFx0Y29uc3QgcmVmMiA9IHRlc3RPYmplY3QuYWNxdWlyZU9yQ3JlYXRlKHByb3BzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVmMi5vYmplY3QsIG1vZGVsMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWRNb2RlbHMubGVuZ3RoLCAxKTtcblxuXHRcdC8vIEZpbmlzaCBkaXNwb3NhbCBvZiB0aGUgZmlyc3QgcmVmXG5cdFx0d2lsbERpc3Bvc2VQcm9taXNlc1swXS5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Qud2FpdEZvck1vZGVsRGlzcG9zYWxzKCk7XG5cblx0XHQvLyBNb2RlbCBzaG91bGQgc3RpbGwgZXhpc3QgYmVjYXVzZSByZWYyIGhvbGRzIGl0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0KHVyaSksIG1vZGVsMSk7XG5cblx0XHRyZWYyLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0IGFuZCBoYXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpO1xuXHRcdGNvbnN0IHByb3BzOiBJU3RhcnRTZXNzaW9uUHJvcHMgPSB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHVyaSxcblx0XHRcdGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0LFxuXHRcdFx0Y2FuVXNlVG9vbHM6IHRydWVcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVmID0gdGVzdE9iamVjdC5hY3F1aXJlT3JDcmVhdGUocHJvcHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldCh1cmkpLCByZWYub2JqZWN0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5oYXModXJpKSwgdHJ1ZSk7XG5cblx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdHdpbGxEaXNwb3NlUHJvbWlzZXNbMF0uY29tcGxldGUoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndhaXRGb3JNb2RlbERpc3Bvc2FscygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0KHVyaSksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaGFzKHVyaSksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnYWNxdWlyZUV4aXN0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKTtcblx0XHRjb25zdCBwcm9wczogSVN0YXJ0U2Vzc2lvblByb3BzID0ge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiB1cmksXG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGNhblVzZVRvb2xzOiB0cnVlXG5cdFx0fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmFjcXVpcmVFeGlzdGluZyh1cmkpLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgcmVmMSA9IHRlc3RPYmplY3QuYWNxdWlyZU9yQ3JlYXRlKHByb3BzKTtcblx0XHRjb25zdCByZWYyID0gdGVzdE9iamVjdC5hY3F1aXJlRXhpc3RpbmcodXJpKTtcblx0XHRhc3NlcnQub2socmVmMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZjIub2JqZWN0LCByZWYxLm9iamVjdCk7XG5cblx0XHRyZWYxLmRpc3Bvc2UoKTtcblx0XHRyZWYyLmRpc3Bvc2UoKTtcblx0XHR3aWxsRGlzcG9zZVByb21pc2VzWzBdLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53YWl0Rm9yTW9kZWxEaXNwb3NhbHMoKTtcblx0fSk7XG5cblx0dGVzdCgndmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaTEgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uMScpO1xuXHRcdGNvbnN0IHVyaTIgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uMicpO1xuXHRcdGNvbnN0IHByb3BzMTogSVN0YXJ0U2Vzc2lvblByb3BzID0ge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiB1cmkxLFxuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRjYW5Vc2VUb29sczogdHJ1ZVxuXHRcdH07XG5cdFx0Y29uc3QgcHJvcHMyOiBJU3RhcnRTZXNzaW9uUHJvcHMgPSB7XG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHVyaTIsXG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGNhblVzZVRvb2xzOiB0cnVlXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlZjEgPSB0ZXN0T2JqZWN0LmFjcXVpcmVPckNyZWF0ZShwcm9wczEpO1xuXHRcdGNvbnN0IHJlZjIgPSB0ZXN0T2JqZWN0LmFjcXVpcmVPckNyZWF0ZShwcm9wczIpO1xuXG5cdFx0Y29uc3QgdmFsdWVzID0gQXJyYXkuZnJvbSh0ZXN0T2JqZWN0LnZhbHVlcygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWVzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0Lm9rKHZhbHVlcy5pbmNsdWRlcyhyZWYxLm9iamVjdCkpO1xuXHRcdGFzc2VydC5vayh2YWx1ZXMuaW5jbHVkZXMocmVmMi5vYmplY3QpKTtcblxuXHRcdHJlZjEuZGlzcG9zZSgpO1xuXHRcdHJlZjIuZGlzcG9zZSgpO1xuXHRcdHdpbGxEaXNwb3NlUHJvbWlzZXNbMF0uY29tcGxldGUoKTtcblx0XHR3aWxsRGlzcG9zZVByb21pc2VzWzFdLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53YWl0Rm9yTW9kZWxEaXNwb3NhbHMoKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZSBzdG9yZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyk7XG5cdFx0Y29uc3QgcHJvcHM6IElTdGFydFNlc3Npb25Qcm9wcyA9IHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogdXJpLFxuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRjYW5Vc2VUb29sczogdHJ1ZVxuXHRcdH07XG5cblx0XHRjb25zdCByZWYgPSB0ZXN0T2JqZWN0LmFjcXVpcmVPckNyZWF0ZShwcm9wcyk7XG5cdFx0Y29uc3QgbW9kZWwgPSByZWYub2JqZWN0IGFzIHVua25vd24gYXMgTW9ja0NoYXRNb2RlbDtcblx0XHR0ZXN0T2JqZWN0LmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5pc0Rpc3Bvc2VkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgndHJhY2tzIHJlZmVyZW5jZSBvd25lcnMgYW5kIGNyZWF0aW9uIG93bmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKTtcblx0XHRjb25zdCBwcm9wczogSVN0YXJ0U2Vzc2lvblByb3BzID0ge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiB1cmksXG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGNhblVzZVRvb2xzOiB0cnVlXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlZjEgPSB0ZXN0T2JqZWN0LmFjcXVpcmVPckNyZWF0ZShwcm9wcywgJ0NoYXRNb2RlbFN0b3JlVGVzdCNjcmVhdGUnKTtcblx0XHRjb25zdCByZWYyID0gdGVzdE9iamVjdC5hY3F1aXJlRXhpc3RpbmcodXJpLCAnQ2hhdE1vZGVsU3RvcmVUZXN0I2V4aXN0aW5nJyk7XG5cdFx0Y29uc3QgcmVmMyA9IHRlc3RPYmplY3QuYWNxdWlyZUV4aXN0aW5nKHVyaSwgJ0NoYXRNb2RlbFN0b3JlVGVzdCNleGlzdGluZycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldFJlZmVyZW5jZURlYnVnU25hcHNob3QoKSwge1xuXHRcdFx0dG90YWxNb2RlbHM6IDEsXG5cdFx0XHR0b3RhbFJlZmVyZW5jZXM6IDMsXG5cdFx0XHRtb2RlbHM6IFt7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogdXJpLFxuXHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdGNyZWF0ZWRCeTogJ0NoYXRNb2RlbFN0b3JlVGVzdCNjcmVhdGUnLFxuXHRcdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdGlzSW1wb3J0ZWQ6IGZhbHNlLFxuXHRcdFx0XHR3aWxsS2VlcEFsaXZlOiB0cnVlLFxuXHRcdFx0XHRoYXNQZW5kaW5nRWRpdHM6IGZhbHNlLFxuXHRcdFx0XHRwZW5kaW5nRGlzcG9zYWw6IGZhbHNlLFxuXHRcdFx0XHRyZWZlcmVuY2VDb3VudDogMyxcblx0XHRcdFx0aG9sZGVyczogW1xuXHRcdFx0XHRcdHsgaG9sZGVyOiAnQ2hhdE1vZGVsU3RvcmVUZXN0I2V4aXN0aW5nJywgY291bnQ6IDIgfSxcblx0XHRcdFx0XHR7IGhvbGRlcjogJ0NoYXRNb2RlbFN0b3JlVGVzdCNjcmVhdGUnLCBjb3VudDogMSB9XG5cdFx0XHRcdF1cblx0XHRcdH1dXG5cdFx0fSk7XG5cblx0XHRyZWYxLmRpc3Bvc2UoKTtcblx0XHRyZWYyPy5kaXNwb3NlKCk7XG5cdFx0cmVmMz8uZGlzcG9zZSgpO1xuXHRcdHdpbGxEaXNwb3NlUHJvbWlzZXNbMF0uY29tcGxldGUoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndhaXRGb3JNb2RlbERpc3Bvc2FscygpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBvcnRzIHBlbmRpbmcgZGlzcG9zYWwgbW9kZWxzIHdpdGhvdXQgaG9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyk7XG5cdFx0Y29uc3QgcHJvcHM6IElTdGFydFNlc3Npb25Qcm9wcyA9IHtcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogdXJpLFxuXHRcdFx0bG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRjYW5Vc2VUb29sczogdHJ1ZVxuXHRcdH07XG5cblx0XHRjb25zdCByZWYgPSB0ZXN0T2JqZWN0LmFjcXVpcmVPckNyZWF0ZShwcm9wcywgJ0NoYXRNb2RlbFN0b3JlVGVzdCNjcmVhdGUnKTtcblx0XHRyZWYuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldFJlZmVyZW5jZURlYnVnU25hcHNob3QoKSwge1xuXHRcdFx0dG90YWxNb2RlbHM6IDEsXG5cdFx0XHR0b3RhbFJlZmVyZW5jZXM6IDAsXG5cdFx0XHRtb2RlbHM6IFt7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogdXJpLFxuXHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdGNyZWF0ZWRCeTogJ0NoYXRNb2RlbFN0b3JlVGVzdCNjcmVhdGUnLFxuXHRcdFx0XHRpbml0aWFsTG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdGlzSW1wb3J0ZWQ6IGZhbHNlLFxuXHRcdFx0XHR3aWxsS2VlcEFsaXZlOiB0cnVlLFxuXHRcdFx0XHRoYXNQZW5kaW5nRWRpdHM6IGZhbHNlLFxuXHRcdFx0XHRwZW5kaW5nRGlzcG9zYWw6IHRydWUsXG5cdFx0XHRcdHJlZmVyZW5jZUNvdW50OiAwLFxuXHRcdFx0XHRob2xkZXJzOiBbXVxuXHRcdFx0fV1cblx0XHR9KTtcblxuXHRcdHdpbGxEaXNwb3NlUHJvbWlzZXNbMF0uY29tcGxldGUoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndhaXRGb3JNb2RlbERpc3Bvc2FscygpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN1cnJlY3Rpb24gcHJlc2VydmVzIGRlYnVnIHRyYWNraW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKTtcblx0XHRjb25zdCBwcm9wczogSVN0YXJ0U2Vzc2lvblByb3BzID0ge1xuXHRcdFx0c2Vzc2lvblJlc291cmNlOiB1cmksXG5cdFx0XHRsb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdGNhblVzZVRvb2xzOiB0cnVlXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlZjEgPSB0ZXN0T2JqZWN0LmFjcXVpcmVPckNyZWF0ZShwcm9wcywgJ09yaWdpbmFsQ3JlYXRvcicpO1xuXHRcdHJlZjEuZGlzcG9zZSgpO1xuXG5cdFx0Ly8gTW9kZWwgaXMgcGVuZGluZyBkaXNwb3NhbCBcdTIwMTQgcmUtYWNxdWlyZSBiZWZvcmUgZGlzcG9zYWwgY29tcGxldGVzXG5cdFx0Y29uc3QgcmVmMiA9IHRlc3RPYmplY3QuYWNxdWlyZU9yQ3JlYXRlKHByb3BzLCAnUmVzY3VlcicpO1xuXG5cdFx0Ly8gQ29tcGxldGUgdGhlIG9sZCBkaXNwb3NhbCBcdTIwMTQgc2hvdWxkIE5PVCB3aXBlIHRoZSBtb2RlbCBvciB0cmFja2luZ1xuXHRcdHdpbGxEaXNwb3NlUHJvbWlzZXNbMF0uY29tcGxldGUoKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LndhaXRGb3JNb2RlbERpc3Bvc2FscygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldFJlZmVyZW5jZURlYnVnU25hcHNob3QoKSwge1xuXHRcdFx0dG90YWxNb2RlbHM6IDEsXG5cdFx0XHR0b3RhbFJlZmVyZW5jZXM6IDEsXG5cdFx0XHRtb2RlbHM6IFt7XG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogdXJpLFxuXHRcdFx0XHR0aXRsZTogJycsXG5cdFx0XHRcdGNyZWF0ZWRCeTogJ09yaWdpbmFsQ3JlYXRvcicsXG5cdFx0XHRcdGluaXRpYWxMb2NhdGlvbjogQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCxcblx0XHRcdFx0aXNJbXBvcnRlZDogZmFsc2UsXG5cdFx0XHRcdHdpbGxLZWVwQWxpdmU6IHRydWUsXG5cdFx0XHRcdGhhc1BlbmRpbmdFZGl0czogZmFsc2UsXG5cdFx0XHRcdHBlbmRpbmdEaXNwb3NhbDogZmFsc2UsXG5cdFx0XHRcdHJlZmVyZW5jZUNvdW50OiAxLFxuXHRcdFx0XHRob2xkZXJzOiBbeyBob2xkZXI6ICdSZXNjdWVyJywgY291bnQ6IDEgfV1cblx0XHRcdH1dXG5cdFx0fSk7XG5cblx0XHRyZWYyLmRpc3Bvc2UoKTtcblx0XHR3aWxsRGlzcG9zZVByb21pc2VzWzFdLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC53YWl0Rm9yTW9kZWxEaXNwb3NhbHMoKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFFL0IsU0FBUyxzQkFBMEM7QUFDbkQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUI7QUFFOUIsTUFBTSxrQkFBa0IsTUFBTTtBQUM3QixRQUFNLFFBQVEsd0NBQXdDO0FBRXRELE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUVKLFFBQU0sTUFBTTtBQUNYLG9CQUFnQixD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
