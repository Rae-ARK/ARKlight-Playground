import assert from "assert";
import { Event } from "../../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { waitForState } from "../../../../../../base/common/observable.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { assertType } from "../../../../../../base/common/types.js";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { assertThrowsAsync, ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { EditOperation } from "../../../../../../editor/common/core/editOperation.js";
import { Position } from "../../../../../../editor/common/core/position.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { IEditorWorkerService } from "../../../../../../editor/common/services/editorWorker.js";
import { IModelService } from "../../../../../../editor/common/services/model.js";
import { ITextModelService } from "../../../../../../editor/common/services/resolverService.js";
import { SyncDescriptor } from "../../../../../../platform/instantiation/common/descriptors.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { IWorkbenchAssignmentService } from "../../../../../services/assignment/common/assignmentService.js";
import { NullWorkbenchAssignmentService } from "../../../../../services/assignment/test/common/nullAssignmentService.js";
import { nullExtensionDescription } from "../../../../../services/extensions/common/extensions.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { IWorkspaceEditingService } from "../../../../../services/workspaces/common/workspaceEditing.js";
import { TestWorkerService } from "../../../../inlineChat/test/browser/testWorkerService.js";
import { IMcpService } from "../../../../mcp/common/mcpTypes.js";
import { TestMcpService } from "../../../../mcp/test/common/testMcpService.js";
import { IMultiDiffSourceResolverService } from "../../../../multiDiffEditor/browser/multiDiffSourceResolverService.js";
import { INotebookService } from "../../../../notebook/common/notebookService.js";
import { ChatEditingService } from "../../../browser/chatEditing/chatEditingServiceImpl.js";
import { ChatSessionsService } from "../../../browser/chatSessions/chatSessions.contribution.js";
import { ChatAgentService, IChatAgentService } from "../../../common/participants/chatAgents.js";
import { ChatEditingSessionState, IChatEditingService, ModifiedFileEntryState } from "../../../common/editing/chatEditingService.js";
import { IChatService } from "../../../common/chatService/chatService.js";
import { ChatService } from "../../../common/chatService/chatServiceImpl.js";
import { IChatSessionsService } from "../../../common/chatSessionsService.js";
import { IChatSlashCommandService } from "../../../common/participants/chatSlashCommands.js";
import { ChatTransferService, IChatTransferService } from "../../../common/model/chatTransferService.js";
import { IChatVariablesService } from "../../../common/attachments/chatVariables.js";
import { ChatAgentLocation, ChatModeKind } from "../../../common/constants.js";
import { ILanguageModelsService } from "../../../common/languageModels.js";
import { IPromptsService } from "../../../common/promptSyntax/service/promptsService.js";
import { NullLanguageModelsService } from "../../common/languageModels.js";
import { MockChatVariablesService } from "../../common/mockChatVariables.js";
import { MockPromptsService } from "../../common/promptSyntax/service/mockPromptsService.js";
import { IChatDebugService } from "../../../common/chatDebugService.js";
import { ChatDebugServiceImpl } from "../../../common/chatDebugServiceImpl.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
function getAgentData(id) {
  return {
    name: id,
    id,
    extensionId: nullExtensionDescription.identifier,
    extensionVersion: void 0,
    extensionPublisherId: "",
    publisherDisplayName: "",
    extensionDisplayName: "",
    locations: [ChatAgentLocation.Chat],
    modes: [ChatModeKind.Ask],
    metadata: {},
    slashCommands: [],
    disambiguation: []
  };
}
suite("ChatEditingService", function() {
  const store = new DisposableStore();
  let editingService;
  let chatService;
  let textModelService;
  setup(function() {
    const collection = new ServiceCollection();
    collection.set(IWorkbenchAssignmentService, new NullWorkbenchAssignmentService());
    collection.set(IChatAgentService, new SyncDescriptor(ChatAgentService));
    collection.set(IChatVariablesService, new MockChatVariablesService());
    collection.set(IChatSlashCommandService, new class extends mock() {
    }());
    collection.set(IChatTransferService, new SyncDescriptor(ChatTransferService));
    collection.set(IChatSessionsService, new SyncDescriptor(ChatSessionsService));
    collection.set(IChatEditingService, new SyncDescriptor(ChatEditingService));
    collection.set(IEditorWorkerService, new SyncDescriptor(TestWorkerService));
    collection.set(IChatService, new SyncDescriptor(ChatService));
    collection.set(IMcpService, new TestMcpService());
    collection.set(IPromptsService, new MockPromptsService());
    collection.set(ILanguageModelsService, new SyncDescriptor(NullLanguageModelsService));
    collection.set(IChatDebugService, new ChatDebugServiceImpl(new TestConfigurationService()));
    collection.set(IMultiDiffSourceResolverService, new class extends mock() {
      registerResolver(_resolver) {
        return Disposable.None;
      }
    }());
    collection.set(IWorkspaceEditingService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidEnterWorkspace = Event.None;
      }
    }());
    collection.set(INotebookService, new class extends mock() {
      getNotebookTextModel(_uri) {
        return void 0;
      }
      hasSupportedNotebooks(_resource) {
        return false;
      }
    }());
    const insta = store.add(store.add(workbenchInstantiationService(void 0, store)).createChild(collection));
    store.add(insta.get(IEditorWorkerService));
    const value = insta.get(IChatEditingService);
    assert.ok(value instanceof ChatEditingService);
    editingService = value;
    chatService = insta.get(IChatService);
    store.add(insta.get(IChatSessionsService));
    store.add(chatService);
    chatService.setSaveModelsEnabled(false);
    const chatAgentService = insta.get(IChatAgentService);
    const agent = {
      async invoke(request, progress, history, token) {
        return {};
      }
    };
    store.add(chatAgentService.registerAgent("testAgent", { ...getAgentData("testAgent"), isDefault: true }));
    store.add(chatAgentService.registerAgentImplementation("testAgent", agent));
    textModelService = insta.get(ITextModelService);
    const modelService = insta.get(IModelService);
    store.add(textModelService.registerTextModelContentProvider("test", {
      async provideTextContent(resource) {
        return store.add(modelService.createModel(resource.path.repeat(10), null, resource, false));
      }
    }));
  });
  teardown(async () => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("create session", async function() {
    assert.ok(editingService);
    const modelRef = chatService.startNewLocalSession(ChatAgentLocation.EditorInline);
    const model = modelRef.object;
    const session = editingService.createEditingSession(model, true);
    assert.strictEqual(session.chatSessionResource.toString(), model.sessionResource.toString());
    assert.strictEqual(session.isGlobalEditingSession, true);
    await assertThrowsAsync(async () => {
      editingService.createEditingSession(model);
    });
    session.dispose();
    modelRef.dispose();
  });
  test("create session, file entry & isCurrentlyBeingModifiedBy", async function() {
    assert.ok(editingService);
    const uri = URI.from({ scheme: "test", path: "HelloWorld" });
    const modelRef = store.add(chatService.startNewLocalSession(ChatAgentLocation.Chat));
    const model = modelRef.object;
    const session = model.editingSession;
    if (!session) {
      assert.fail("session not created");
    }
    const chatRequest = model?.addRequest({ text: "", parts: [] }, { variables: [] }, 0);
    assertType(chatRequest.response);
    chatRequest.response.updateContent({ kind: "textEdit", uri, edits: [], done: false });
    chatRequest.response.updateContent({ kind: "textEdit", uri, edits: [{ range: new Range(1, 1, 1, 1), text: "FarBoo\n" }], done: false });
    chatRequest.response.updateContent({ kind: "textEdit", uri, edits: [], done: true });
    const entry = await waitForState(session.entries.map((value) => value.find((a) => isEqual(a.modifiedURI, uri))));
    assert.ok(isEqual(entry.modifiedURI, uri));
    await waitForState(entry.isCurrentlyBeingModifiedBy.map((value) => value === chatRequest.response));
    assert.ok(entry.isCurrentlyBeingModifiedBy.get()?.responseModel === chatRequest.response);
    const unset = waitForState(entry.isCurrentlyBeingModifiedBy.map((res) => res === void 0));
    chatRequest.response.complete();
    await unset;
    await entry.reject();
  });
  async function idleAfterEdit(session, model, uri, edits) {
    const isStreaming = waitForState(session.state.map((s) => s === ChatEditingSessionState.StreamingEdits), Boolean);
    const chatRequest = model.addRequest({ text: "", parts: [] }, { variables: [] }, 0);
    assertType(chatRequest.response);
    chatRequest.response.updateContent({ kind: "textEdit", uri, edits, done: true });
    const entry = await waitForState(session.entries.map((value) => value.find((a) => isEqual(a.modifiedURI, uri))));
    assert.ok(isEqual(entry.modifiedURI, uri));
    chatRequest.response.complete();
    await isStreaming;
    const isIdle = waitForState(session.state.map((s) => s === ChatEditingSessionState.Idle), Boolean);
    await isIdle;
    return entry;
  }
  test("mirror typing outside -> accept", async function() {
    return runWithFakedTimers({}, async () => {
      assert.ok(editingService);
      const uri = URI.from({ scheme: "test", path: "abc\n" });
      const modelRef = store.add(chatService.startNewLocalSession(ChatAgentLocation.Chat));
      const model = modelRef.object;
      const session = model.editingSession;
      assertType(session, "session not created");
      const entry = await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: "FarBoo\n" }]);
      const original = store.add(await textModelService.createModelReference(entry.originalURI)).object.textEditorModel;
      const modified = store.add(await textModelService.createModelReference(entry.modifiedURI)).object.textEditorModel;
      assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Modified);
      assert.strictEqual(original.getValue(), "abc\n".repeat(10));
      assert.strictEqual(modified.getValue(), "FarBoo\n" + "abc\n".repeat(10));
      modified.pushEditOperations(null, [EditOperation.insert(new Position(3, 1), "USER_TYPE\n")], () => null);
      assert.ok(modified.getValue().includes("USER_TYPE"));
      assert.ok(original.getValue().includes("USER_TYPE"));
      await entry.accept();
      assert.strictEqual(modified.getValue(), original.getValue());
      assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Accepted);
      assert.ok(modified.getValue().includes("FarBoo"));
      assert.ok(original.getValue().includes("FarBoo"));
    });
  });
  test("mirror typing outside -> reject", async function() {
    return runWithFakedTimers({}, async () => {
      assert.ok(editingService);
      const uri = URI.from({ scheme: "test", path: "abc\n" });
      const modelRef = store.add(chatService.startNewLocalSession(ChatAgentLocation.Chat));
      const model = modelRef.object;
      const session = model.editingSession;
      assertType(session, "session not created");
      const entry = await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: "FarBoo\n" }]);
      const original = store.add(await textModelService.createModelReference(entry.originalURI)).object.textEditorModel;
      const modified = store.add(await textModelService.createModelReference(entry.modifiedURI)).object.textEditorModel;
      assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Modified);
      assert.strictEqual(original.getValue(), "abc\n".repeat(10));
      assert.strictEqual(modified.getValue(), "FarBoo\n" + "abc\n".repeat(10));
      modified.pushEditOperations(null, [EditOperation.insert(new Position(3, 1), "USER_TYPE\n")], () => null);
      assert.ok(modified.getValue().includes("USER_TYPE"));
      assert.ok(original.getValue().includes("USER_TYPE"));
      await entry.reject();
      assert.strictEqual(modified.getValue(), original.getValue());
      assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Rejected);
      assert.ok(!modified.getValue().includes("FarBoo"));
      assert.ok(!original.getValue().includes("FarBoo"));
    });
  });
  test("NO mirror typing inside -> accept", async function() {
    return runWithFakedTimers({}, async () => {
      assert.ok(editingService);
      const uri = URI.from({ scheme: "test", path: "abc\n" });
      const modelRef = store.add(chatService.startNewLocalSession(ChatAgentLocation.Chat));
      const model = modelRef.object;
      const session = model.editingSession;
      assertType(session, "session not created");
      const entry = await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: "FarBoo\n" }]);
      const original = store.add(await textModelService.createModelReference(entry.originalURI)).object.textEditorModel;
      const modified = store.add(await textModelService.createModelReference(entry.modifiedURI)).object.textEditorModel;
      assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Modified);
      assert.strictEqual(original.getValue(), "abc\n".repeat(10));
      assert.strictEqual(modified.getValue(), "FarBoo\n" + "abc\n".repeat(10));
      modified.pushEditOperations(null, [EditOperation.replace(new Range(1, 2, 1, 7), "ooBar")], () => null);
      assert.ok(modified.getValue().includes("FooBar"));
      assert.ok(!original.getValue().includes("FooBar"));
      await entry.accept();
      assert.strictEqual(modified.getValue(), original.getValue());
      assert.strictEqual(entry.state.get(), ModifiedFileEntryState.Accepted);
      assert.ok(modified.getValue().includes("FooBar"));
      assert.ok(original.getValue().includes("FooBar"));
    });
  });
  test("ChatEditingService merges text edits it shouldn't merge, #272679", async function() {
    return runWithFakedTimers({}, async () => {
      assert.ok(editingService);
      const uri = URI.from({ scheme: "test", path: "abc" });
      const modified = store.add(await textModelService.createModelReference(uri)).object.textEditorModel;
      const modelRef = store.add(chatService.startNewLocalSession(ChatAgentLocation.Chat));
      const model = modelRef.object;
      const session = model.editingSession;
      assertType(session, "session not created");
      modified.setValue("");
      await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: "a" }, { range: new Range(1, 1, 1, 1), text: "b" }]);
      assert.strictEqual(modified.getValue(), "ab");
      modified.setValue("");
      await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: "a" }]);
      await idleAfterEdit(session, model, uri, [{ range: new Range(1, 1, 1, 1), text: "b" }]);
      assert.strictEqual(modified.getValue(), "ba");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2NoYXRFZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IHdhaXRGb3JTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBhc3NlcnRUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGFzc2VydFRocm93c0FzeW5jLCBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBUZXh0RWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElFZGl0b3JXb3JrZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9lZGl0b3JXb3JrZXIuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3Jlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvYXNzaWdubWVudC9jb21tb24vYXNzaWdubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTnVsbFdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvYXNzaWdubWVudC90ZXN0L2NvbW1vbi9udWxsQXNzaWdubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlRWRpdGluZy5qcyc7XG5pbXBvcnQgeyBUZXN0V29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2lubGluZUNoYXQvdGVzdC9icm93c2VyL3Rlc3RXb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNY3BTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQgeyBUZXN0TWNwU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL21jcC90ZXN0L2NvbW1vbi90ZXN0TWNwU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTXVsdGlEaWZmU291cmNlUmVzb2x2ZXIsIElNdWx0aURpZmZTb3VyY2VSZXNvbHZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9tdWx0aURpZmZFZGl0b3IvYnJvd3Nlci9tdWx0aURpZmZTb3VyY2VSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbW9kZWwvbm90ZWJvb2tUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jaGF0RWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IENoYXRTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NoYXRTZXNzaW9ucy9jaGF0U2Vzc2lvbnMuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudFNlcnZpY2UsIElDaGF0QWdlbnREYXRhLCBJQ2hhdEFnZW50SW1wbGVtZW50YXRpb24sIElDaGF0QWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IENoYXRFZGl0aW5nU2Vzc2lvblN0YXRlLCBJQ2hhdEVkaXRpbmdTZXJ2aWNlLCBJQ2hhdEVkaXRpbmdTZXNzaW9uLCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0U2xhc2hDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdFNsYXNoQ29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ2hhdFRyYW5zZmVyU2VydmljZSwgSUNoYXRUcmFuc2ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFRyYW5zZmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFZhcmlhYmxlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IElQcm9tcHRzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOdWxsTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0VmFyaWFibGVzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2NrQ2hhdFZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBNb2NrUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvbW9ja1Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0RGVidWdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXREZWJ1Z1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdERlYnVnU2VydmljZUltcGwgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdERlYnVnU2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuXG5mdW5jdGlvbiBnZXRBZ2VudERhdGEoaWQ6IHN0cmluZyk6IElDaGF0QWdlbnREYXRhIHtcblx0cmV0dXJuIHtcblx0XHRuYW1lOiBpZCxcblx0XHRpZDogaWQsXG5cdFx0ZXh0ZW5zaW9uSWQ6IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdGV4dGVuc2lvblZlcnNpb246IHVuZGVmaW5lZCxcblx0XHRleHRlbnNpb25QdWJsaXNoZXJJZDogJycsXG5cdFx0cHVibGlzaGVyRGlzcGxheU5hbWU6ICcnLFxuXHRcdGV4dGVuc2lvbkRpc3BsYXlOYW1lOiAnJyxcblx0XHRsb2NhdGlvbnM6IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XSxcblx0XHRtb2RlczogW0NoYXRNb2RlS2luZC5Bc2tdLFxuXHRcdG1ldGFkYXRhOiB7fSxcblx0XHRzbGFzaENvbW1hbmRzOiBbXSxcblx0XHRkaXNhbWJpZ3VhdGlvbjogW10sXG5cdH07XG59XG5cbnN1aXRlKCdDaGF0RWRpdGluZ1NlcnZpY2UnLCBmdW5jdGlvbiAoKSB7XG5cblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBlZGl0aW5nU2VydmljZTogQ2hhdEVkaXRpbmdTZXJ2aWNlO1xuXHRsZXQgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZTtcblx0bGV0IHRleHRNb2RlbFNlcnZpY2U6IElUZXh0TW9kZWxTZXJ2aWNlO1xuXG5cdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjb2xsZWN0aW9uID0gbmV3IFNlcnZpY2VDb2xsZWN0aW9uKCk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSVdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlLCBuZXcgTnVsbFdvcmtiZW5jaEFzc2lnbm1lbnRTZXJ2aWNlKCkpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElDaGF0QWdlbnRTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoQ2hhdEFnZW50U2VydmljZSkpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElDaGF0VmFyaWFibGVzU2VydmljZSwgbmV3IE1vY2tDaGF0VmFyaWFibGVzU2VydmljZSgpKTtcblx0XHRjb2xsZWN0aW9uLnNldChJQ2hhdFNsYXNoQ29tbWFuZFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTbGFzaENvbW1hbmRTZXJ2aWNlPigpIHsgfSk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSUNoYXRUcmFuc2ZlclNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihDaGF0VHJhbnNmZXJTZXJ2aWNlKSk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihDaGF0U2Vzc2lvbnNTZXJ2aWNlKSk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSUNoYXRFZGl0aW5nU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKENoYXRFZGl0aW5nU2VydmljZSkpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElFZGl0b3JXb3JrZXJTZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoVGVzdFdvcmtlclNlcnZpY2UpKTtcblx0XHRjb2xsZWN0aW9uLnNldChJQ2hhdFNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihDaGF0U2VydmljZSkpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElNY3BTZXJ2aWNlLCBuZXcgVGVzdE1jcFNlcnZpY2UoKSk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSVByb21wdHNTZXJ2aWNlLCBuZXcgTW9ja1Byb21wdHNTZXJ2aWNlKCkpO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihOdWxsTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlKSk7XG5cdFx0Y29sbGVjdGlvbi5zZXQoSUNoYXREZWJ1Z1NlcnZpY2UsIG5ldyBDaGF0RGVidWdTZXJ2aWNlSW1wbChuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCkpKTtcblx0XHRjb2xsZWN0aW9uLnNldChJTXVsdGlEaWZmU291cmNlUmVzb2x2ZXJTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNdWx0aURpZmZTb3VyY2VSZXNvbHZlclNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVnaXN0ZXJSZXNvbHZlcihfcmVzb2x2ZXI6IElNdWx0aURpZmZTb3VyY2VSZXNvbHZlcik6IElEaXNwb3NhYmxlIHtcblx0XHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb2xsZWN0aW9uLnNldChJV29ya3NwYWNlRWRpdGluZ1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZUVkaXRpbmdTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkRW50ZXJXb3Jrc3BhY2UgPSBFdmVudC5Ob25lO1xuXHRcdH0pO1xuXHRcdGNvbGxlY3Rpb24uc2V0KElOb3RlYm9va1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU5vdGVib29rU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXROb3RlYm9va1RleHRNb2RlbChfdXJpOiBVUkkpOiBOb3RlYm9va1RleHRNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBoYXNTdXBwb3J0ZWROb3RlYm9va3MoX3Jlc291cmNlOiBVUkkpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IGluc3RhID0gc3RvcmUuYWRkKHN0b3JlLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKSkuY3JlYXRlQ2hpbGQoY29sbGVjdGlvbikpO1xuXHRcdHN0b3JlLmFkZChpbnN0YS5nZXQoSUVkaXRvcldvcmtlclNlcnZpY2UpIGFzIFRlc3RXb3JrZXJTZXJ2aWNlKTtcblx0XHRjb25zdCB2YWx1ZSA9IGluc3RhLmdldChJQ2hhdEVkaXRpbmdTZXJ2aWNlKTtcblx0XHRhc3NlcnQub2sodmFsdWUgaW5zdGFuY2VvZiBDaGF0RWRpdGluZ1NlcnZpY2UpO1xuXHRcdGVkaXRpbmdTZXJ2aWNlID0gdmFsdWU7XG5cblx0XHRjaGF0U2VydmljZSA9IGluc3RhLmdldChJQ2hhdFNlcnZpY2UpO1xuXG5cdFx0c3RvcmUuYWRkKGluc3RhLmdldChJQ2hhdFNlc3Npb25zU2VydmljZSkgYXMgQ2hhdFNlc3Npb25zU2VydmljZSk7IC8vIE5lZWRzIHRvIGJlIGRpc3Bvc2VkIGluIGJldHdlZW4gdGVzdCBydW5zIHRvIGNsZWFyIGV4dGVuc2lvblBvaW50IGNvbnRyaWJ1dGlvblxuXHRcdHN0b3JlLmFkZChjaGF0U2VydmljZSBhcyBDaGF0U2VydmljZSk7XG5cdFx0Y2hhdFNlcnZpY2Uuc2V0U2F2ZU1vZGVsc0VuYWJsZWQoZmFsc2UpO1xuXG5cdFx0Y29uc3QgY2hhdEFnZW50U2VydmljZSA9IGluc3RhLmdldChJQ2hhdEFnZW50U2VydmljZSk7XG5cblx0XHRjb25zdCBhZ2VudDogSUNoYXRBZ2VudEltcGxlbWVudGF0aW9uID0ge1xuXHRcdFx0YXN5bmMgaW52b2tlKHJlcXVlc3QsIHByb2dyZXNzLCBoaXN0b3J5LCB0b2tlbikge1xuXHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0c3RvcmUuYWRkKGNoYXRBZ2VudFNlcnZpY2UucmVnaXN0ZXJBZ2VudCgndGVzdEFnZW50JywgeyAuLi5nZXRBZ2VudERhdGEoJ3Rlc3RBZ2VudCcpLCBpc0RlZmF1bHQ6IHRydWUgfSkpO1xuXHRcdHN0b3JlLmFkZChjaGF0QWdlbnRTZXJ2aWNlLnJlZ2lzdGVyQWdlbnRJbXBsZW1lbnRhdGlvbigndGVzdEFnZW50JywgYWdlbnQpKTtcblxuXHRcdHRleHRNb2RlbFNlcnZpY2UgPSBpbnN0YS5nZXQoSVRleHRNb2RlbFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgbW9kZWxTZXJ2aWNlID0gaW5zdGEuZ2V0KElNb2RlbFNlcnZpY2UpO1xuXG5cdFx0c3RvcmUuYWRkKHRleHRNb2RlbFNlcnZpY2UucmVnaXN0ZXJUZXh0TW9kZWxDb250ZW50UHJvdmlkZXIoJ3Rlc3QnLCB7XG5cdFx0XHRhc3luYyBwcm92aWRlVGV4dENvbnRlbnQocmVzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuIHN0b3JlLmFkZChtb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWwocmVzb3VyY2UucGF0aC5yZXBlYXQoMTApLCBudWxsLCByZXNvdXJjZSwgZmFsc2UpKTtcblx0XHRcdH0sXG5cdFx0fSkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0c3RvcmUuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY3JlYXRlIHNlc3Npb24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0Lm9rKGVkaXRpbmdTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IG1vZGVsUmVmID0gY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uRWRpdG9ySW5saW5lKTtcblx0XHRjb25zdCBtb2RlbCA9IG1vZGVsUmVmLm9iamVjdCBhcyBDaGF0TW9kZWw7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGVkaXRpbmdTZXJ2aWNlLmNyZWF0ZUVkaXRpbmdTZXNzaW9uKG1vZGVsLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmNoYXRTZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgbW9kZWwuc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmlzR2xvYmFsRWRpdGluZ1Nlc3Npb24sIHRydWUpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0VGhyb3dzQXN5bmMoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gRFVQRSBub3QgYWxsb3dlZFxuXHRcdFx0ZWRpdGluZ1NlcnZpY2UuY3JlYXRlRWRpdGluZ1Nlc3Npb24obW9kZWwpO1xuXHRcdH0pO1xuXG5cdFx0c2Vzc2lvbi5kaXNwb3NlKCk7XG5cdFx0bW9kZWxSZWYuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGUgc2Vzc2lvbiwgZmlsZSBlbnRyeSAmIGlzQ3VycmVudGx5QmVpbmdNb2RpZmllZEJ5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydC5vayhlZGl0aW5nU2VydmljZSk7XG5cblx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ3Rlc3QnLCBwYXRoOiAnSGVsbG9Xb3JsZCcgfSk7XG5cblx0XHRjb25zdCBtb2RlbFJlZiA9IHN0b3JlLmFkZChjaGF0U2VydmljZS5zdGFydE5ld0xvY2FsU2Vzc2lvbihDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFJlZi5vYmplY3QgYXMgQ2hhdE1vZGVsO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBtb2RlbC5lZGl0aW5nU2Vzc2lvbjtcblx0XHRpZiAoIXNlc3Npb24pIHtcblx0XHRcdGFzc2VydC5mYWlsKCdzZXNzaW9uIG5vdCBjcmVhdGVkJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhdFJlcXVlc3QgPSBtb2RlbD8uYWRkUmVxdWVzdCh7IHRleHQ6ICcnLCBwYXJ0czogW10gfSwgeyB2YXJpYWJsZXM6IFtdIH0sIDApO1xuXHRcdGFzc2VydFR5cGUoY2hhdFJlcXVlc3QucmVzcG9uc2UpO1xuXHRcdGNoYXRSZXF1ZXN0LnJlc3BvbnNlLnVwZGF0ZUNvbnRlbnQoeyBraW5kOiAndGV4dEVkaXQnLCB1cmksIGVkaXRzOiBbXSwgZG9uZTogZmFsc2UgfSk7XG5cdFx0Y2hhdFJlcXVlc3QucmVzcG9uc2UudXBkYXRlQ29udGVudCh7IGtpbmQ6ICd0ZXh0RWRpdCcsIHVyaSwgZWRpdHM6IFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIHRleHQ6ICdGYXJCb29cXG4nIH1dLCBkb25lOiBmYWxzZSB9KTtcblx0XHRjaGF0UmVxdWVzdC5yZXNwb25zZS51cGRhdGVDb250ZW50KHsga2luZDogJ3RleHRFZGl0JywgdXJpLCBlZGl0czogW10sIGRvbmU6IHRydWUgfSk7XG5cblx0XHRjb25zdCBlbnRyeSA9IGF3YWl0IHdhaXRGb3JTdGF0ZShzZXNzaW9uLmVudHJpZXMubWFwKHZhbHVlID0+IHZhbHVlLmZpbmQoYSA9PiBpc0VxdWFsKGEubW9kaWZpZWRVUkksIHVyaSkpKSk7XG5cblx0XHRhc3NlcnQub2soaXNFcXVhbChlbnRyeS5tb2RpZmllZFVSSSwgdXJpKSk7XG5cblx0XHRhd2FpdCB3YWl0Rm9yU3RhdGUoZW50cnkuaXNDdXJyZW50bHlCZWluZ01vZGlmaWVkQnkubWFwKHZhbHVlID0+IHZhbHVlID09PSBjaGF0UmVxdWVzdC5yZXNwb25zZSkpO1xuXHRcdGFzc2VydC5vayhlbnRyeS5pc0N1cnJlbnRseUJlaW5nTW9kaWZpZWRCeS5nZXQoKT8ucmVzcG9uc2VNb2RlbCA9PT0gY2hhdFJlcXVlc3QucmVzcG9uc2UpO1xuXG5cdFx0Y29uc3QgdW5zZXQgPSB3YWl0Rm9yU3RhdGUoZW50cnkuaXNDdXJyZW50bHlCZWluZ01vZGlmaWVkQnkubWFwKHJlcyA9PiByZXMgPT09IHVuZGVmaW5lZCkpO1xuXG5cdFx0Y2hhdFJlcXVlc3QucmVzcG9uc2UuY29tcGxldGUoKTtcblxuXHRcdGF3YWl0IHVuc2V0O1xuXG5cdFx0YXdhaXQgZW50cnkucmVqZWN0KCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGlkbGVBZnRlckVkaXQoc2Vzc2lvbjogSUNoYXRFZGl0aW5nU2Vzc2lvbiwgbW9kZWw6IENoYXRNb2RlbCwgdXJpOiBVUkksIGVkaXRzOiBUZXh0RWRpdFtdKSB7XG5cdFx0Y29uc3QgaXNTdHJlYW1pbmcgPSB3YWl0Rm9yU3RhdGUoc2Vzc2lvbi5zdGF0ZS5tYXAocyA9PiBzID09PSBDaGF0RWRpdGluZ1Nlc3Npb25TdGF0ZS5TdHJlYW1pbmdFZGl0cyksIEJvb2xlYW4pO1xuXG5cdFx0Y29uc3QgY2hhdFJlcXVlc3QgPSBtb2RlbC5hZGRSZXF1ZXN0KHsgdGV4dDogJycsIHBhcnRzOiBbXSB9LCB7IHZhcmlhYmxlczogW10gfSwgMCk7XG5cdFx0YXNzZXJ0VHlwZShjaGF0UmVxdWVzdC5yZXNwb25zZSk7XG5cblx0XHRjaGF0UmVxdWVzdC5yZXNwb25zZS51cGRhdGVDb250ZW50KHsga2luZDogJ3RleHRFZGl0JywgdXJpLCBlZGl0cywgZG9uZTogdHJ1ZSB9KTtcblxuXHRcdGNvbnN0IGVudHJ5ID0gYXdhaXQgd2FpdEZvclN0YXRlKHNlc3Npb24uZW50cmllcy5tYXAodmFsdWUgPT4gdmFsdWUuZmluZChhID0+IGlzRXF1YWwoYS5tb2RpZmllZFVSSSwgdXJpKSkpKTtcblxuXHRcdGFzc2VydC5vayhpc0VxdWFsKGVudHJ5Lm1vZGlmaWVkVVJJLCB1cmkpKTtcblxuXHRcdGNoYXRSZXF1ZXN0LnJlc3BvbnNlLmNvbXBsZXRlKCk7XG5cblx0XHRhd2FpdCBpc1N0cmVhbWluZztcblxuXHRcdGNvbnN0IGlzSWRsZSA9IHdhaXRGb3JTdGF0ZShzZXNzaW9uLnN0YXRlLm1hcChzID0+IHMgPT09IENoYXRFZGl0aW5nU2Vzc2lvblN0YXRlLklkbGUpLCBCb29sZWFuKTtcblx0XHRhd2FpdCBpc0lkbGU7XG5cblx0XHRyZXR1cm4gZW50cnk7XG5cdH1cblxuXHR0ZXN0KCdtaXJyb3IgdHlwaW5nIG91dHNpZGUgLT4gYWNjZXB0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGFzc2VydC5vayhlZGl0aW5nU2VydmljZSk7XG5cblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAndGVzdCcsIHBhdGg6ICdhYmNcXG4nIH0pO1xuXG5cdFx0XHRjb25zdCBtb2RlbFJlZiA9IHN0b3JlLmFkZChjaGF0U2VydmljZS5zdGFydE5ld0xvY2FsU2Vzc2lvbihDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IG1vZGVsUmVmLm9iamVjdCBhcyBDaGF0TW9kZWw7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gbW9kZWwuZWRpdGluZ1Nlc3Npb247XG5cdFx0XHRhc3NlcnRUeXBlKHNlc3Npb24sICdzZXNzaW9uIG5vdCBjcmVhdGVkJyk7XG5cblx0XHRcdGNvbnN0IGVudHJ5ID0gYXdhaXQgaWRsZUFmdGVyRWRpdChzZXNzaW9uLCBtb2RlbCwgdXJpLCBbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCB0ZXh0OiAnRmFyQm9vXFxuJyB9XSk7XG5cdFx0XHRjb25zdCBvcmlnaW5hbCA9IHN0b3JlLmFkZChhd2FpdCB0ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGVudHJ5Lm9yaWdpbmFsVVJJKSkub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblx0XHRcdGNvbnN0IG1vZGlmaWVkID0gc3RvcmUuYWRkKGF3YWl0IHRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoZW50cnkubW9kaWZpZWRVUkkpKS5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuc3RhdGUuZ2V0KCksIE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3JpZ2luYWwuZ2V0VmFsdWUoKSwgJ2FiY1xcbicucmVwZWF0KDEwKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kaWZpZWQuZ2V0VmFsdWUoKSwgJ0ZhckJvb1xcbicgKyAnYWJjXFxuJy5yZXBlYXQoMTApKTtcblxuXHRcdFx0bW9kaWZpZWQucHVzaEVkaXRPcGVyYXRpb25zKG51bGwsIFtFZGl0T3BlcmF0aW9uLmluc2VydChuZXcgUG9zaXRpb24oMywgMSksICdVU0VSX1RZUEVcXG4nKV0sICgpID0+IG51bGwpO1xuXG5cdFx0XHRhc3NlcnQub2sobW9kaWZpZWQuZ2V0VmFsdWUoKS5pbmNsdWRlcygnVVNFUl9UWVBFJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKG9yaWdpbmFsLmdldFZhbHVlKCkuaW5jbHVkZXMoJ1VTRVJfVFlQRScpKTtcblxuXHRcdFx0YXdhaXQgZW50cnkuYWNjZXB0KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kaWZpZWQuZ2V0VmFsdWUoKSwgb3JpZ2luYWwuZ2V0VmFsdWUoKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuc3RhdGUuZ2V0KCksIE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuQWNjZXB0ZWQpO1xuXG5cdFx0XHRhc3NlcnQub2sobW9kaWZpZWQuZ2V0VmFsdWUoKS5pbmNsdWRlcygnRmFyQm9vJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKG9yaWdpbmFsLmdldFZhbHVlKCkuaW5jbHVkZXMoJ0ZhckJvbycpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWlycm9yIHR5cGluZyBvdXRzaWRlIC0+IHJlamVjdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhc3NlcnQub2soZWRpdGluZ1NlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ3Rlc3QnLCBwYXRoOiAnYWJjXFxuJyB9KTtcblxuXHRcdFx0Y29uc3QgbW9kZWxSZWYgPSBzdG9yZS5hZGQoY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFJlZi5vYmplY3QgYXMgQ2hhdE1vZGVsO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IG1vZGVsLmVkaXRpbmdTZXNzaW9uO1xuXHRcdFx0YXNzZXJ0VHlwZShzZXNzaW9uLCAnc2Vzc2lvbiBub3QgY3JlYXRlZCcpO1xuXG5cdFx0XHRjb25zdCBlbnRyeSA9IGF3YWl0IGlkbGVBZnRlckVkaXQoc2Vzc2lvbiwgbW9kZWwsIHVyaSwgW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGV4dDogJ0ZhckJvb1xcbicgfV0pO1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWwgPSBzdG9yZS5hZGQoYXdhaXQgdGV4dE1vZGVsU2VydmljZS5jcmVhdGVNb2RlbFJlZmVyZW5jZShlbnRyeS5vcmlnaW5hbFVSSSkpLm9iamVjdC50ZXh0RWRpdG9yTW9kZWw7XG5cdFx0XHRjb25zdCBtb2RpZmllZCA9IHN0b3JlLmFkZChhd2FpdCB0ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGVudHJ5Lm1vZGlmaWVkVVJJKSkub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LnN0YXRlLmdldCgpLCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLk1vZGlmaWVkKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9yaWdpbmFsLmdldFZhbHVlKCksICdhYmNcXG4nLnJlcGVhdCgxMCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGlmaWVkLmdldFZhbHVlKCksICdGYXJCb29cXG4nICsgJ2FiY1xcbicucmVwZWF0KDEwKSk7XG5cblx0XHRcdG1vZGlmaWVkLnB1c2hFZGl0T3BlcmF0aW9ucyhudWxsLCBbRWRpdE9wZXJhdGlvbi5pbnNlcnQobmV3IFBvc2l0aW9uKDMsIDEpLCAnVVNFUl9UWVBFXFxuJyldLCAoKSA9PiBudWxsKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKG1vZGlmaWVkLmdldFZhbHVlKCkuaW5jbHVkZXMoJ1VTRVJfVFlQRScpKTtcblx0XHRcdGFzc2VydC5vayhvcmlnaW5hbC5nZXRWYWx1ZSgpLmluY2x1ZGVzKCdVU0VSX1RZUEUnKSk7XG5cblx0XHRcdGF3YWl0IGVudHJ5LnJlamVjdCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGlmaWVkLmdldFZhbHVlKCksIG9yaWdpbmFsLmdldFZhbHVlKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5LnN0YXRlLmdldCgpLCBNb2RpZmllZEZpbGVFbnRyeVN0YXRlLlJlamVjdGVkKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKCFtb2RpZmllZC5nZXRWYWx1ZSgpLmluY2x1ZGVzKCdGYXJCb28nKSk7XG5cdFx0XHRhc3NlcnQub2soIW9yaWdpbmFsLmdldFZhbHVlKCkuaW5jbHVkZXMoJ0ZhckJvbycpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnTk8gbWlycm9yIHR5cGluZyBpbnNpZGUgLT4gYWNjZXB0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGFzc2VydC5vayhlZGl0aW5nU2VydmljZSk7XG5cblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAndGVzdCcsIHBhdGg6ICdhYmNcXG4nIH0pO1xuXG5cdFx0XHRjb25zdCBtb2RlbFJlZiA9IHN0b3JlLmFkZChjaGF0U2VydmljZS5zdGFydE5ld0xvY2FsU2Vzc2lvbihDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KSk7XG5cdFx0XHRjb25zdCBtb2RlbCA9IG1vZGVsUmVmLm9iamVjdCBhcyBDaGF0TW9kZWw7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gbW9kZWwuZWRpdGluZ1Nlc3Npb247XG5cdFx0XHRhc3NlcnRUeXBlKHNlc3Npb24sICdzZXNzaW9uIG5vdCBjcmVhdGVkJyk7XG5cblx0XHRcdGNvbnN0IGVudHJ5ID0gYXdhaXQgaWRsZUFmdGVyRWRpdChzZXNzaW9uLCBtb2RlbCwgdXJpLCBbeyByYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDEpLCB0ZXh0OiAnRmFyQm9vXFxuJyB9XSk7XG5cdFx0XHRjb25zdCBvcmlnaW5hbCA9IHN0b3JlLmFkZChhd2FpdCB0ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGVudHJ5Lm9yaWdpbmFsVVJJKSkub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblx0XHRcdGNvbnN0IG1vZGlmaWVkID0gc3RvcmUuYWRkKGF3YWl0IHRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UoZW50cnkubW9kaWZpZWRVUkkpKS5vYmplY3QudGV4dEVkaXRvck1vZGVsO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuc3RhdGUuZ2V0KCksIE1vZGlmaWVkRmlsZUVudHJ5U3RhdGUuTW9kaWZpZWQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3JpZ2luYWwuZ2V0VmFsdWUoKSwgJ2FiY1xcbicucmVwZWF0KDEwKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kaWZpZWQuZ2V0VmFsdWUoKSwgJ0ZhckJvb1xcbicgKyAnYWJjXFxuJy5yZXBlYXQoMTApKTtcblxuXHRcdFx0bW9kaWZpZWQucHVzaEVkaXRPcGVyYXRpb25zKG51bGwsIFtFZGl0T3BlcmF0aW9uLnJlcGxhY2UobmV3IFJhbmdlKDEsIDIsIDEsIDcpLCAnb29CYXInKV0sICgpID0+IG51bGwpO1xuXG5cdFx0XHRhc3NlcnQub2sobW9kaWZpZWQuZ2V0VmFsdWUoKS5pbmNsdWRlcygnRm9vQmFyJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFvcmlnaW5hbC5nZXRWYWx1ZSgpLmluY2x1ZGVzKCdGb29CYXInKSk7IC8vIHR5cGVkIGluIHRoZSBBSSBlZGl0cywgRE8gTk9UIHRyYW5zcG9zZVxuXG5cdFx0XHRhd2FpdCBlbnRyeS5hY2NlcHQoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RpZmllZC5nZXRWYWx1ZSgpLCBvcmlnaW5hbC5nZXRWYWx1ZSgpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5zdGF0ZS5nZXQoKSwgTW9kaWZpZWRGaWxlRW50cnlTdGF0ZS5BY2NlcHRlZCk7XG5cblx0XHRcdGFzc2VydC5vayhtb2RpZmllZC5nZXRWYWx1ZSgpLmluY2x1ZGVzKCdGb29CYXInKSk7XG5cdFx0XHRhc3NlcnQub2sob3JpZ2luYWwuZ2V0VmFsdWUoKS5pbmNsdWRlcygnRm9vQmFyJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGF0RWRpdGluZ1NlcnZpY2UgbWVyZ2VzIHRleHQgZWRpdHMgaXQgc2hvdWxkblxcJ3QgbWVyZ2UsICMyNzI2NzknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7fSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKGVkaXRpbmdTZXJ2aWNlKTtcblxuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICd0ZXN0JywgcGF0aDogJ2FiYycgfSk7XG5cblx0XHRcdGNvbnN0IG1vZGlmaWVkID0gc3RvcmUuYWRkKGF3YWl0IHRleHRNb2RlbFNlcnZpY2UuY3JlYXRlTW9kZWxSZWZlcmVuY2UodXJpKSkub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblxuXHRcdFx0Y29uc3QgbW9kZWxSZWYgPSBzdG9yZS5hZGQoY2hhdFNlcnZpY2Uuc3RhcnROZXdMb2NhbFNlc3Npb24oQ2hhdEFnZW50TG9jYXRpb24uQ2hhdCkpO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBtb2RlbFJlZi5vYmplY3QgYXMgQ2hhdE1vZGVsO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IG1vZGVsLmVkaXRpbmdTZXNzaW9uO1xuXHRcdFx0YXNzZXJ0VHlwZShzZXNzaW9uLCAnc2Vzc2lvbiBub3QgY3JlYXRlZCcpO1xuXG5cdFx0XHRtb2RpZmllZC5zZXRWYWx1ZSgnJyk7XG5cdFx0XHRhd2FpdCBpZGxlQWZ0ZXJFZGl0KHNlc3Npb24sIG1vZGVsLCB1cmksIFt7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIHRleHQ6ICdhJyB9LCB7IHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMSksIHRleHQ6ICdiJyB9XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kaWZpZWQuZ2V0VmFsdWUoKSwgJ2FiJyk7XG5cblx0XHRcdG1vZGlmaWVkLnNldFZhbHVlKCcnKTtcblx0XHRcdGF3YWl0IGlkbGVBZnRlckVkaXQoc2Vzc2lvbiwgbW9kZWwsIHVyaSwgW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGV4dDogJ2EnIH1dKTtcblx0XHRcdGF3YWl0IGlkbGVBZnRlckVkaXQoc2Vzc2lvbiwgbW9kZWwsIHVyaSwgW3sgcmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAxKSwgdGV4dDogJ2InIH1dKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RpZmllZC5nZXRWYWx1ZSgpLCAnYmEnKTtcblx0XHR9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QUNuQixhQUFPLFlBQVksU0FBUyxTQUFTLEdBQUcsU0FBUyxTQUFTLENBQUM7QUFDM0QsYUFBTyxZQUFZLE1BQU0sTUFBTSxJQUFJLEdBQUcsdUJBQXVCLFFBQVE7QUFFckUsYUFBTyxHQUFHLFNBQVMsU0FBUyxFQUFFLFNBQVMsUUFBUSxDQUFDO0FBQ2hELGFBQU8sR0FBRyxTQUFTLFNBQVMsRUFBRSxTQUFTLFFBQVEsQ0FBQztBQUFBLElBQ2pELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG9FQUFxRSxpQkFBa0I7QUFDM0YsV0FBTyxtQkFBbUIsQ0FBQyxHQUFHLFlBQVk7QUFDekMsYUFBTyxHQUFHLGNBQWM7QUFFeEIsWUFBTSxNQUFNLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxNQUFNLE1BQU0sQ0FBQztBQUVwRCxZQUFNLFdBQVcsTUFBTSxJQUFJLE1BQU0saUJBQWlCLHFCQUFxQixHQUFHLENBQUMsRUFBRSxPQUFPO0FBRXBGLFlBQU0sV0FBVyxNQUFNLElBQUksWUFBWSxxQkFBcUIsa0JBQWtCLElBQUksQ0FBQztBQUNuRixZQUFNLFFBQVEsU0FBUztBQUN2QixZQUFNLFVBQVUsTUFBTTtBQUN0QixpQkFBVyxTQUFTLHFCQUFxQjtBQUV6QyxlQUFTLFNBQVMsRUFBRTtBQUNwQixZQUFNLGNBQWMsU0FBUyxPQUFPLEtBQUssQ0FBQyxFQUFFLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLElBQUksR0FBRyxFQUFFLE9BQU8sSUFBSSxNQUFNLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxNQUFNLElBQUksQ0FBQyxDQUFDO0FBQ25JLGFBQU8sWUFBWSxTQUFTLFNBQVMsR0FBRyxJQUFJO0FBRTVDLGVBQVMsU0FBUyxFQUFFO0FBQ3BCLFlBQU0sY0FBYyxTQUFTLE9BQU8sS0FBSyxDQUFDLEVBQUUsT0FBTyxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLE1BQU0sSUFBSSxDQUFDLENBQUM7QUFDdEYsWUFBTSxjQUFjLFNBQVMsT0FBTyxLQUFLLENBQUMsRUFBRSxPQUFPLElBQUksTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsTUFBTSxJQUFJLENBQUMsQ0FBQztBQUN0RixhQUFPLFlBQVksU0FBUyxTQUFTLEdBQUcsSUFBSTtBQUFBLElBQzdDLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
