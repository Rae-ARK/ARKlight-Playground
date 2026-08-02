import assert from "assert";
import { Event } from "../../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../../base/common/lifecycle.js";
import { constObservable } from "../../../../../../../base/common/observable.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IDialogService } from "../../../../../../../platform/dialogs/common/dialogs.js";
import { TestInstantiationService } from "../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../../platform/log/common/log.js";
import { IStorageService } from "../../../../../../../platform/storage/common/storage.js";
import { IWorkspaceContextService } from "../../../../../../../platform/workspace/common/workspace.js";
import { isResourceEditorInput } from "../../../../../../common/editor.js";
import { IEditorService } from "../../../../../../services/editor/common/editorService.js";
import { clearChatEditor } from "../../../../browser/actions/chatClear.js";
import { ChatEditorInput } from "../../../../browser/widgetHosts/editor/chatEditorInput.js";
import { IAgentHostEnablementService } from "../../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { IChatService } from "../../../../common/chatService/chatService.js";
import { IChatSessionsService, localChatSessionType, SessionType } from "../../../../common/chatSessionsService.js";
import { ChatAgentLocation, ChatConfiguration } from "../../../../common/constants.js";
import { getChatSessionType, LocalChatSessionUri } from "../../../../common/model/chatUri.js";
import { MockChatSessionsService } from "../../../common/mockChatSessionsService.js";
import { TestContextService, TestStorageService } from "../../../../../../test/common/workbenchTestServices.js";
suite("ChatEditorInput", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("explicit local session type starts local session for generic editor URI", async () => {
    const sessionResource = LocalChatSessionUri.forSession("explicit-local");
    const model = {
      onDidDispose: Event.None,
      onDidChange: Event.None,
      sessionResource
    };
    let startCall;
    let didTryDefaultLoad = false;
    const chatService = {
      startNewLocalSession(location, options) {
        startCall = { location, options };
        return { object: model, dispose: () => {
        } };
      },
      async acquireOrLoadSession() {
        didTryDefaultLoad = true;
        return void 0;
      }
    };
    const input = new ChatEditorInput(
      ChatEditorInput.getNewEditorUri(),
      { explicitSessionType: localChatSessionType },
      chatService,
      {},
      {},
      {},
      {},
      {},
      new NullLogService(),
      new TestContextService(),
      { _serviceBrand: void 0, enabled: constObservable(false) }
    );
    try {
      const resolved = await input.resolve();
      assert.deepStrictEqual({
        model: resolved?.model,
        sessionResource: input.sessionResource,
        startLocation: startCall?.location,
        debugOwner: startCall?.options?.debugOwner,
        didTryDefaultLoad
      }, {
        model,
        sessionResource,
        startLocation: ChatAgentLocation.Chat,
        debugOwner: "ChatEditorInput#resolveExplicitLocal",
        didTryDefaultLoad: false
      });
    } finally {
      input.dispose();
    }
  });
  test("explicit local session type preserves empty local session resource", async () => {
    const sessionResource = LocalChatSessionUri.forSession("explicit-empty-local");
    const model = {
      hasRequests: false,
      onDidDispose: Event.None,
      onDidChange: Event.None,
      sessionResource
    };
    const loadedResources = [];
    const chatService = {
      async acquireOrLoadSession(resource) {
        loadedResources.push(resource.toString());
        return { object: model, dispose: () => {
        } };
      },
      startNewLocalSession() {
        throw new Error("Should not create a new local session when the local session resource resolves");
      }
    };
    const input = new ChatEditorInput(
      sessionResource,
      { explicitSessionType: localChatSessionType },
      chatService,
      {},
      {},
      {},
      {},
      {},
      new NullLogService(),
      new TestContextService(),
      { _serviceBrand: void 0, enabled: constObservable(false) }
    );
    try {
      const resolved = await input.resolve();
      assert.deepStrictEqual({
        model: resolved?.model,
        sessionResource: input.sessionResource,
        loadedResources
      }, {
        model,
        sessionResource,
        loadedResources: [sessionResource.toString()]
      });
    } finally {
      input.dispose();
    }
  });
  test("new chat replaces a hidden current Copilot CLI harness", async () => {
    const store = disposables.add(new DisposableStore());
    const instantiationService = store.add(new TestInstantiationService());
    const configurationService = new TestConfigurationService({
      [ChatConfiguration.CopilotCliHideExtensionHostEditor]: true
    });
    const chatSessionsService = new MockChatSessionsService();
    chatSessionsService.setContributions([{
      type: SessionType.CopilotCLI,
      name: "Copilot CLI",
      displayName: "Copilot CLI",
      description: "Copilot CLI"
    }]);
    const storageService = store.add(new TestStorageService());
    const workspaceContextService = new TestContextService();
    const agentHostEnablementService = { _serviceBrand: void 0, enabled: constObservable(true) };
    instantiationService.stub(IChatService, {});
    instantiationService.stub(IDialogService, {});
    instantiationService.set(IConfigurationService, configurationService);
    instantiationService.set(IChatSessionsService, chatSessionsService);
    instantiationService.set(IStorageService, storageService);
    instantiationService.set(ILogService, new NullLogService());
    instantiationService.set(IWorkspaceContextService, workspaceContextService);
    instantiationService.set(IAgentHostEnablementService, agentHostEnablementService);
    const input = store.add(instantiationService.createInstance(
      ChatEditorInput,
      URI.from({ scheme: SessionType.CopilotCLI, path: "/session" }),
      {}
    ));
    let replacementResource;
    instantiationService.stub(IEditorService, {
      findEditors: () => [{ editor: input, groupId: 1 }],
      replaceEditors: async (replacements) => {
        const replacement = replacements[0].replacement;
        replacementResource = isResourceEditorInput(replacement) ? replacement.resource : void 0;
      }
    });
    try {
      await instantiationService.invokeFunction(clearChatEditor, input);
      assert.deepStrictEqual({
        currentSessionType: input.sessionResource ? getChatSessionType(input.sessionResource) : void 0,
        replacementSessionType: replacementResource ? getChatSessionType(replacementResource) : void 0
      }, {
        currentSessionType: SessionType.CopilotCLI,
        replacementSessionType: localChatSessionType
      });
    } finally {
      store.dispose();
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldEhvc3RzL2VkaXRvci9jaGF0RWRpdG9ySW5wdXQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RpYWxvZ3MvY29tbW9uL2RpYWxvZ3MuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IGlzUmVzb3VyY2VFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY2xlYXJDaGF0RWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9hY3Rpb25zL2NoYXRDbGVhci5qcyc7XG5pbXBvcnQgeyBDaGF0RWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldEhvc3RzL2VkaXRvci9jaGF0RWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlcnZpY2UsIElDaGF0U2Vzc2lvblN0YXJ0T3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSwgbG9jYWxDaGF0U2Vzc2lvblR5cGUsIFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50TG9jYXRpb24sIENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0U2Vzc2lvblR5cGUsIExvY2FsQ2hhdFNlc3Npb25VcmkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFVyaS5qcyc7XG5pbXBvcnQgeyBNb2NrQ2hhdFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2NrQ2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29udGV4dFNlcnZpY2UsIFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5cbnN1aXRlKCdDaGF0RWRpdG9ySW5wdXQnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdleHBsaWNpdCBsb2NhbCBzZXNzaW9uIHR5cGUgc3RhcnRzIGxvY2FsIHNlc3Npb24gZm9yIGdlbmVyaWMgZWRpdG9yIFVSSScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBMb2NhbENoYXRTZXNzaW9uVXJpLmZvclNlc3Npb24oJ2V4cGxpY2l0LWxvY2FsJyk7XG5cdFx0Y29uc3QgbW9kZWwgPSB7XG5cdFx0XHRvbkRpZERpc3Bvc2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHR9IGFzIFBhcnRpYWw8SUNoYXRNb2RlbD4gYXMgSUNoYXRNb2RlbDtcblxuXHRcdGxldCBzdGFydENhbGw6IHsgbG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uOyBvcHRpb25zOiBJQ2hhdFNlc3Npb25TdGFydE9wdGlvbnMgfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgZGlkVHJ5RGVmYXVsdExvYWQgPSBmYWxzZTtcblx0XHRjb25zdCBjaGF0U2VydmljZSA9IHtcblx0XHRcdHN0YXJ0TmV3TG9jYWxTZXNzaW9uKGxvY2F0aW9uOiBDaGF0QWdlbnRMb2NhdGlvbiwgb3B0aW9ucz86IElDaGF0U2Vzc2lvblN0YXJ0T3B0aW9ucykge1xuXHRcdFx0XHRzdGFydENhbGwgPSB7IGxvY2F0aW9uLCBvcHRpb25zIH07XG5cdFx0XHRcdHJldHVybiB7IG9iamVjdDogbW9kZWwsIGRpc3Bvc2U6ICgpID0+IHsgfSB9O1xuXHRcdFx0fSxcblx0XHRcdGFzeW5jIGFjcXVpcmVPckxvYWRTZXNzaW9uKCkge1xuXHRcdFx0XHRkaWRUcnlEZWZhdWx0TG9hZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdH0gYXMgUGFydGlhbDxJQ2hhdFNlcnZpY2U+IGFzIElDaGF0U2VydmljZTtcblxuXHRcdGNvbnN0IGlucHV0ID0gbmV3IENoYXRFZGl0b3JJbnB1dChcblx0XHRcdENoYXRFZGl0b3JJbnB1dC5nZXROZXdFZGl0b3JVcmkoKSxcblx0XHRcdHsgZXhwbGljaXRTZXNzaW9uVHlwZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSxcblx0XHRcdGNoYXRTZXJ2aWNlLFxuXHRcdFx0e30gYXMgSURpYWxvZ1NlcnZpY2UsXG5cdFx0XHR7fSBhcyBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHR7fSBhcyBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRcdHt9IGFzIElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdHt9IGFzIElTdG9yYWdlU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0eyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGVuYWJsZWQ6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSkgfSxcblx0XHQpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgaW5wdXQucmVzb2x2ZSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0bW9kZWw6IHJlc29sdmVkPy5tb2RlbCxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBpbnB1dC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdHN0YXJ0TG9jYXRpb246IHN0YXJ0Q2FsbD8ubG9jYXRpb24sXG5cdFx0XHRcdGRlYnVnT3duZXI6IHN0YXJ0Q2FsbD8ub3B0aW9ucz8uZGVidWdPd25lcixcblx0XHRcdFx0ZGlkVHJ5RGVmYXVsdExvYWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG1vZGVsLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdHN0YXJ0TG9jYXRpb246IENoYXRBZ2VudExvY2F0aW9uLkNoYXQsXG5cdFx0XHRcdGRlYnVnT3duZXI6ICdDaGF0RWRpdG9ySW5wdXQjcmVzb2x2ZUV4cGxpY2l0TG9jYWwnLFxuXHRcdFx0XHRkaWRUcnlEZWZhdWx0TG9hZDogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aW5wdXQuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnZXhwbGljaXQgbG9jYWwgc2Vzc2lvbiB0eXBlIHByZXNlcnZlcyBlbXB0eSBsb2NhbCBzZXNzaW9uIHJlc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IExvY2FsQ2hhdFNlc3Npb25VcmkuZm9yU2Vzc2lvbignZXhwbGljaXQtZW1wdHktbG9jYWwnKTtcblx0XHRjb25zdCBtb2RlbCA9IHtcblx0XHRcdGhhc1JlcXVlc3RzOiBmYWxzZSxcblx0XHRcdG9uRGlkRGlzcG9zZTogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdH0gYXMgUGFydGlhbDxJQ2hhdE1vZGVsPiBhcyBJQ2hhdE1vZGVsO1xuXG5cdFx0Y29uc3QgbG9hZGVkUmVzb3VyY2VzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGNoYXRTZXJ2aWNlID0ge1xuXHRcdFx0YXN5bmMgYWNxdWlyZU9yTG9hZFNlc3Npb24ocmVzb3VyY2U6IFVSSSkge1xuXHRcdFx0XHRsb2FkZWRSZXNvdXJjZXMucHVzaChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0cmV0dXJuIHsgb2JqZWN0OiBtb2RlbCwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0XHR9LFxuXHRcdFx0c3RhcnROZXdMb2NhbFNlc3Npb24oKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignU2hvdWxkIG5vdCBjcmVhdGUgYSBuZXcgbG9jYWwgc2Vzc2lvbiB3aGVuIHRoZSBsb2NhbCBzZXNzaW9uIHJlc291cmNlIHJlc29sdmVzJyk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgUGFydGlhbDxJQ2hhdFNlcnZpY2U+IGFzIElDaGF0U2VydmljZTtcblxuXHRcdGNvbnN0IGlucHV0ID0gbmV3IENoYXRFZGl0b3JJbnB1dChcblx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdHsgZXhwbGljaXRTZXNzaW9uVHlwZTogbG9jYWxDaGF0U2Vzc2lvblR5cGUgfSxcblx0XHRcdGNoYXRTZXJ2aWNlLFxuXHRcdFx0e30gYXMgSURpYWxvZ1NlcnZpY2UsXG5cdFx0XHR7fSBhcyBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHR7fSBhcyBJQ2hhdFNlc3Npb25zU2VydmljZSxcblx0XHRcdHt9IGFzIElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdHt9IGFzIElTdG9yYWdlU2VydmljZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0bmV3IFRlc3RDb250ZXh0U2VydmljZSgpLFxuXHRcdFx0eyBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsIGVuYWJsZWQ6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSkgfSxcblx0XHQpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgaW5wdXQucmVzb2x2ZSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0bW9kZWw6IHJlc29sdmVkPy5tb2RlbCxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBpbnB1dC5zZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdGxvYWRlZFJlc291cmNlcyxcblx0XHRcdH0sIHtcblx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0bG9hZGVkUmVzb3VyY2VzOiBbc2Vzc2lvblJlc291cmNlLnRvU3RyaW5nKCldLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlucHV0LmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ25ldyBjaGF0IHJlcGxhY2VzIGEgaGlkZGVuIGN1cnJlbnQgQ29waWxvdCBDTEkgaGFybmVzcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFtDaGF0Q29uZmlndXJhdGlvbi5Db3BpbG90Q2xpSGlkZUV4dGVuc2lvbkhvc3RFZGl0b3JdOiB0cnVlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNoYXRTZXNzaW9uc1NlcnZpY2UgPSBuZXcgTW9ja0NoYXRTZXNzaW9uc1NlcnZpY2UoKTtcblx0XHRjaGF0U2Vzc2lvbnNTZXJ2aWNlLnNldENvbnRyaWJ1dGlvbnMoW3tcblx0XHRcdHR5cGU6IFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0XHRuYW1lOiAnQ29waWxvdCBDTEknLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdDb3BpbG90IENMSScsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ0NvcGlsb3QgQ0xJJyxcblx0XHR9XSk7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VDb250ZXh0U2VydmljZSA9IG5ldyBUZXN0Q29udGV4dFNlcnZpY2UoKTtcblx0XHRjb25zdCBhZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSA9IHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBlbmFibGVkOiBjb25zdE9ic2VydmFibGUodHJ1ZSkgfSBzYXRpc2ZpZXMgSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWFsb2dTZXJ2aWNlLCB7fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJQ2hhdFNlc3Npb25zU2VydmljZSwgY2hhdFNlc3Npb25zU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnNldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLCBhZ2VudEhvc3RFbmFibGVtZW50U2VydmljZSk7XG5cblx0XHRjb25zdCBpbnB1dCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRFZGl0b3JJbnB1dCxcblx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTZXNzaW9uVHlwZS5Db3BpbG90Q0xJLCBwYXRoOiAnL3Nlc3Npb24nIH0pLFxuXHRcdFx0e30sXG5cdFx0KSk7XG5cdFx0bGV0IHJlcGxhY2VtZW50UmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JTZXJ2aWNlLCB7XG5cdFx0XHRmaW5kRWRpdG9yczogKCkgPT4gW3sgZWRpdG9yOiBpbnB1dCwgZ3JvdXBJZDogMSB9XSxcblx0XHRcdHJlcGxhY2VFZGl0b3JzOiBhc3luYyByZXBsYWNlbWVudHMgPT4ge1xuXHRcdFx0XHRjb25zdCByZXBsYWNlbWVudCA9IHJlcGxhY2VtZW50c1swXS5yZXBsYWNlbWVudDtcblx0XHRcdFx0cmVwbGFjZW1lbnRSZXNvdXJjZSA9IGlzUmVzb3VyY2VFZGl0b3JJbnB1dChyZXBsYWNlbWVudCkgPyByZXBsYWNlbWVudC5yZXNvdXJjZSA6IHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oY2xlYXJDaGF0RWRpdG9yLCBpbnB1dCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjdXJyZW50U2Vzc2lvblR5cGU6IGlucHV0LnNlc3Npb25SZXNvdXJjZSA/IGdldENoYXRTZXNzaW9uVHlwZShpbnB1dC5zZXNzaW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZXBsYWNlbWVudFNlc3Npb25UeXBlOiByZXBsYWNlbWVudFJlc291cmNlID8gZ2V0Q2hhdFNlc3Npb25UeXBlKHJlcGxhY2VtZW50UmVzb3VyY2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjdXJyZW50U2Vzc2lvblR5cGU6IFNlc3Npb25UeXBlLkNvcGlsb3RDTEksXG5cdFx0XHRcdHJlcGxhY2VtZW50U2Vzc2lvblR5cGU6IGxvY2FsQ2hhdFNlc3Npb25UeXBlLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNCQUFzQjtBQUUvQixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsb0JBQThDO0FBQ3ZELFNBQVMsc0JBQXNCLHNCQUFzQixtQkFBbUI7QUFDeEUsU0FBUyxtQkFBbUIseUJBQXlCO0FBRXJELFNBQVMsb0JBQW9CLDJCQUEyQjtBQUN4RCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLG9CQUFvQiwwQkFBMEI7QUFFdkQsTUFBTSxtQkFBbUIsTUFBTTtBQUU5QixRQUFNLGNBQWMsd0NBQXdDO0FBRTVELE9BQUssMkVBQTJFLFlBQVk7QUFDM0YsVUFBTSxrQkFBa0Isb0JBQW9CLFdBQVcsZ0JBQWdCO0FBQ3ZFLFVBQU0sUUFBUTtBQUFBLE1BQ2IsY0FBYyxNQUFNO0FBQUEsTUFDcEIsYUFBYSxNQUFNO0FBQUEsTUFDbkI7QUFBQSxJQUNEO0FBRUEsUUFBSTtBQUNKLFFBQUksb0JBQW9CO0FBQ3hCLFVBQU0sY0FBYztBQUFB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
