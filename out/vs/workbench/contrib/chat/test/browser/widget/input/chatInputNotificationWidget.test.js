import assert from "assert";
import { Emitter, Event } from "../../../../../../../base/common/event.js";
import { constObservable, observableValue } from "../../../../../../../base/common/observable.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { ICommandService } from "../../../../../../../platform/commands/common/commands.js";
import { SyncDescriptor } from "../../../../../../../platform/instantiation/common/descriptors.js";
import { getSingletonServiceDescriptors } from "../../../../../../../platform/instantiation/common/extensions.js";
import { ServiceCollection } from "../../../../../../../platform/instantiation/common/serviceCollection.js";
import { ILogService, NullLogService } from "../../../../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService, NullTelemetryServiceShape } from "../../../../../../../platform/telemetry/common/telemetryUtils.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { ChatInputNotificationActionKind, ChatInputNotificationSeverity, IChatInputNotificationService } from "../../../../browser/widget/input/chatInputNotificationService.js";
import { ChatInputNotificationWidget } from "../../../../browser/widget/input/chatInputNotificationWidget.js";
import { localChatSessionType, SessionType } from "../../../../common/chatSessionsService.js";
import { getChatSessionType } from "../../../../common/model/chatUri.js";
class TestCommandService {
  constructor() {
    this.onWillExecuteCommand = Event.None;
    this.onDidExecuteCommand = Event.None;
    this.executed = [];
  }
  async executeCommand(id, ...args) {
    this.executed.push({ id, args });
    return void 0;
  }
}
class RecordingLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this._onError = new Emitter();
    this.onError = this._onError.event;
  }
  error() {
    this._onError.fire();
  }
  dispose() {
    this._onError.dispose();
    super.dispose();
  }
}
class RecordingTelemetryService extends NullTelemetryServiceShape {
  constructor() {
    super(...arguments);
    this.events = [];
  }
  publicLog2(eventName, data) {
    if (eventName) {
      this.events.push({ name: eventName, data });
    }
  }
}
suite("ChatInputNotificationWidget", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createNotificationService() {
    const descriptor = getSingletonServiceDescriptors().find(([id]) => id === IChatInputNotificationService)?.[1];
    assert.ok(descriptor);
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    instantiationService.stub(ICommandService, new TestCommandService());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    const childInstantiationService = store.add(instantiationService.createChild(new ServiceCollection(
      [IChatInputNotificationService, new SyncDescriptor(descriptor.ctor, descriptor.staticArguments)]
    )));
    const notificationService = childInstantiationService.get(IChatInputNotificationService);
    store.add(notificationService);
    return notificationService;
  }
  test("reactively applies session type filter when pending delegation target changes", () => {
    const currentSessionType = observableValue("currentSessionType", localChatSessionType);
    const notificationService = createNotificationService();
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    instantiationService.stub(IChatInputNotificationService, notificationService);
    instantiationService.stub(ICommandService, new TestCommandService());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, { modelTargetChatSessionType: currentSessionType }));
    notificationService.setNotification({
      id: "local-only",
      severity: ChatInputNotificationSeverity.Info,
      message: "Local only",
      description: void 0,
      actions: [],
      dismissible: false,
      autoDismissOnMessage: false,
      sessionTypes: [localChatSessionType]
    });
    assert.strictEqual(widget.domNode.querySelector(".chat-input-notification")?.textContent, "Local only");
    currentSessionType.set(SessionType.AgentHostCopilot, void 0);
    assert.strictEqual(widget.domNode.querySelector(".chat-input-notification"), null);
    currentSessionType.set(localChatSessionType, void 0);
    assert.strictEqual(widget.domNode.querySelector(".chat-input-notification")?.textContent, "Local only");
  });
  test("reactively applies session resource filter when the session changes", () => {
    const firstSession = URI.parse("vscode-chat-session://agent-host-copilotcli/session-1");
    const secondSession = URI.parse("vscode-chat-session://agent-host-copilotcli/session-2");
    const currentSessionType = observableValue("currentSessionType", SessionType.AgentHostCopilot);
    const currentSessionResource = observableValue("currentSessionResource", firstSession);
    const notificationService = createNotificationService();
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    instantiationService.stub(IChatInputNotificationService, notificationService);
    instantiationService.stub(ICommandService, new TestCommandService());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, {
      modelTargetChatSessionType: currentSessionType,
      sessionResource: currentSessionResource
    }));
    notificationService.setNotification({
      id: "first-session-only",
      severity: ChatInputNotificationSeverity.Info,
      message: "First session only",
      description: void 0,
      actions: [],
      dismissible: false,
      autoDismissOnMessage: false,
      sessionResources: [firstSession]
    });
    assert.strictEqual(widget.domNode.querySelector(".chat-input-notification")?.textContent, "First session only");
    currentSessionResource.set(secondSession, void 0);
    assert.strictEqual(widget.domNode.querySelector(".chat-input-notification"), null);
  });
  test("renders markdown descriptions as rich content", () => {
    const notificationService = createNotificationService();
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    instantiationService.stub(IChatInputNotificationService, notificationService);
    instantiationService.stub(ICommandService, new TestCommandService());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, void 0));
    notificationService.setNotification({
      id: "markdown-description",
      severity: ChatInputNotificationSeverity.Info,
      message: "Cache is stale",
      description: new MarkdownString("Consider a new chat. [Learn more](https://aka.ms/learn)"),
      actions: [],
      dismissible: false,
      autoDismissOnMessage: false
    });
    const description = widget.domNode.querySelector(".chat-input-notification-description");
    const link = description?.querySelector("a");
    assert.deepStrictEqual({
      text: description?.textContent,
      markdown: !!description?.querySelector(".chat-input-notification-description-markdown"),
      linkText: link?.textContent,
      linkHref: link?.getAttribute("data-href") ?? link?.getAttribute("href")
    }, {
      text: "Consider a new chat. Learn more",
      markdown: true,
      linkText: "Learn more",
      linkHref: "https://aka.ms/learn"
    });
  });
  test("auto-dismiss on message only applies to the sending session", () => {
    const firstSession = URI.parse("vscode-chat-session://agent-host-copilotcli/session-1");
    const secondSession = URI.parse("vscode-chat-session://agent-host-copilotcli/session-2");
    const notificationService = createNotificationService();
    for (const [id, sessionResource] of [["first", firstSession], ["second", secondSession]]) {
      notificationService.setNotification({
        id,
        severity: ChatInputNotificationSeverity.Info,
        message: "Cache is stale",
        description: void 0,
        actions: [],
        dismissible: true,
        autoDismissOnMessage: true,
        sessionResources: [sessionResource]
      });
    }
    notificationService.handleMessageSent({ sessionType: SessionType.AgentHostCopilot, sessionResource: firstSession });
    assert.deepStrictEqual({
      inFirstSession: notificationService.getActiveNotification((n) => n.id === "first")?.id,
      inSecondSession: notificationService.getActiveNotification((n) => n.id === "second")?.id
    }, {
      inFirstSession: void 0,
      inSecondSession: "second"
    });
  });
  function createRecordingNotificationService() {
    const notifications = /* @__PURE__ */ new Map();
    const announced = [];
    const dismissed = [];
    const onDidChange = store.add(new Emitter());
    const onDidDismiss = store.add(new Emitter());
    const service = {
      _serviceBrand: void 0,
      onDidChange: onDidChange.event,
      onDidDismiss: onDidDismiss.event,
      setNotification(notification) {
        notifications.set(notification.id, notification);
        onDidChange.fire();
      },
      deleteNotification(id) {
        if (notifications.delete(id)) {
          onDidChange.fire();
        }
      },
      dismissNotification(id) {
        dismissed.push(id);
        onDidDismiss.fire(id);
      },
      getActiveNotification(filter) {
        let active;
        for (const notification of notifications.values()) {
          if (filter && !filter(notification)) {
            continue;
          }
          active = notification;
        }
        return active;
      },
      handleMessageSent() {
      },
      announceRendered(notification) {
        announced.push(notification);
      }
    };
    return { service, announced, dismissed, set: (notification) => service.setNotification(notification) };
  }
  function createWidget(options = {}) {
    const notificationService = createRecordingNotificationService();
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    instantiationService.stub(IChatInputNotificationService, notificationService.service);
    instantiationService.stub(ICommandService, options.commandService ?? new TestCommandService());
    instantiationService.stub(ITelemetryService, options.telemetryService ?? NullTelemetryService);
    if (options.logService) {
      instantiationService.stub(ILogService, options.logService);
    }
    const widget = store.add(instantiationService.createInstance(ChatInputNotificationWidget, options.delegate));
    return { notificationService, widget };
  }
  function clickAction(widget) {
    const button = widget.domNode.querySelector(".chat-input-notification-action-button");
    assert.ok(button);
    button.click();
  }
  function showNotification(notificationService, notification) {
    notificationService.set({
      severity: ChatInputNotificationSeverity.Info,
      description: void 0,
      dismissible: true,
      autoDismissOnMessage: false,
      ...notification
    });
  }
  test("action commands execute with provided args", async () => {
    const commandService = new TestCommandService();
    const { notificationService, widget } = createWidget({ commandService });
    showNotification(notificationService, {
      id: "promo",
      message: "Promo",
      actions: [{ kind: ChatInputNotificationActionKind.Command, label: "Use", commandId: "test.usePromo", commandArgs: [{ modelIdentifier: "m" }] }]
    });
    const didDismiss = Event.toPromise(notificationService.service.onDidDismiss);
    clickAction(widget);
    await didDismiss;
    assert.deepStrictEqual(commandService.executed, [{ id: "test.usePromo", args: [{ modelIdentifier: "m" }] }]);
    assert.strictEqual(notificationService.dismissed.join(","), "promo");
  });
  test("actions without explicit commandArgs are executed with empty args", async () => {
    const commandService = new TestCommandService();
    const { notificationService, widget } = createWidget({ commandService });
    showNotification(notificationService, {
      id: "info",
      message: "Info",
      actions: [{ kind: ChatInputNotificationActionKind.Command, label: "Upgrade", commandId: "test.upgrade" }]
    });
    const didDismiss = Event.toPromise(notificationService.service.onDidDismiss);
    clickAction(widget);
    await didDismiss;
    assert.deepStrictEqual(commandService.executed, [{ id: "test.upgrade", args: [] }]);
    assert.strictEqual(notificationService.dismissed.join(","), "info");
  });
  test("catches rejected command actions", async () => {
    const logService = store.add(new RecordingLogService());
    const commandService = new class extends TestCommandService {
      async executeCommand(id, ...args) {
        await super.executeCommand(id, ...args);
        throw new Error("command failed");
      }
    }();
    const { notificationService, widget } = createWidget({ commandService, logService });
    showNotification(notificationService, {
      id: "rejected-command",
      message: "Rejected command",
      actions: [{ kind: ChatInputNotificationActionKind.Command, label: "Run", commandId: "test.reject" }],
      dismissible: false
    });
    const didLogError = Event.toPromise(logService.onError);
    clickAction(widget);
    await didLogError;
    assert.deepStrictEqual(commandService.executed, [{ id: "test.reject", args: [] }]);
  });
  test("switch-to-model actions use the rendering input delegate", async () => {
    const telemetryService = new RecordingTelemetryService();
    const switchedModels = [];
    let pickerOpenCount = 0;
    const { notificationService, widget } = createWidget({
      telemetryService,
      delegate: {
        switchToModel: (modelIdentifier) => {
          switchedModels.push(modelIdentifier);
          return true;
        },
        openModelPicker: () => pickerOpenCount++
      }
    });
    showNotification(notificationService, {
      id: "promo",
      message: "Promo",
      actions: [{ label: "Try Model", kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: "vendor/model" }]
    });
    clickAction(widget);
    await Promise.resolve();
    assert.deepStrictEqual({
      switchedModels,
      pickerOpenCount,
      actionEvents: telemetryService.events.filter((event) => event.name === "chatInputNotificationAction").map((event) => event.data)
    }, {
      switchedModels: ["vendor/model"],
      pickerOpenCount: 0,
      actionEvents: [{ id: "promo", telemetryId: void 0, actionKind: ChatInputNotificationActionKind.SwitchToModel }]
    });
  });
  test("opens the local model picker when the requested model is unavailable", async () => {
    let pickerOpenCount = 0;
    const { notificationService, widget } = createWidget({
      delegate: {
        switchToModel: () => false,
        openModelPicker: () => pickerOpenCount++
      }
    });
    showNotification(notificationService, {
      id: "promo",
      message: "Promo",
      actions: [{ label: "Try Model", kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: "missing/model" }]
    });
    clickAction(widget);
    await Promise.resolve();
    assert.strictEqual(pickerOpenCount, 1);
  });
  test("opens the local model picker when direct selection fails", async () => {
    let pickerOpenCount = 0;
    const logService = store.add(new RecordingLogService());
    const { notificationService, widget } = createWidget({
      logService,
      delegate: {
        switchToModel: () => {
          throw new Error("selection failed");
        },
        openModelPicker: () => pickerOpenCount++
      }
    });
    showNotification(notificationService, {
      id: "promo",
      message: "Promo",
      actions: [{ label: "Try Model", kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: "vendor/model" }]
    });
    const didLogError = Event.toPromise(logService.onError);
    clickAction(widget);
    await didLogError;
    assert.strictEqual(pickerOpenCount, 1);
  });
  test("attempts the model picker fallback only once when it fails", async () => {
    const logService = store.add(new RecordingLogService());
    let pickerOpenCount = 0;
    const { notificationService, widget } = createWidget({
      logService,
      delegate: {
        switchToModel: () => false,
        openModelPicker: () => {
          pickerOpenCount++;
          throw new Error("picker failed");
        }
      }
    });
    showNotification(notificationService, {
      id: "promo",
      message: "Promo",
      actions: [{ label: "Try Model", kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: "missing/model" }]
    });
    const didLogError = Event.toPromise(logService.onError);
    clickAction(widget);
    await didLogError;
    assert.strictEqual(pickerOpenCount, 1);
  });
  test("does not render semantic actions unsupported by the input", () => {
    const { notificationService, widget } = createWidget();
    showNotification(notificationService, {
      id: "promo",
      message: "Promo",
      actions: [{ label: "Try Model", kind: ChatInputNotificationActionKind.SwitchToModel, modelIdentifier: "vendor/model" }]
    });
    assert.strictEqual(widget.domNode.querySelector(".chat-input-notification-action-button"), null);
  });
  test("matches Agent Host notifications against the resource scheme", () => {
    const sessionResource = URI.from({ scheme: "agent-host-copilotcli", path: "/untitled-session" });
    const { notificationService, widget } = createWidget({
      delegate: { modelTargetChatSessionType: constObservable(getChatSessionType(sessionResource)) }
    });
    showNotification(notificationService, {
      id: "agent-host-promo",
      message: "Agent Host promo",
      actions: [],
      sessionTypes: ["agent-host-copilotcli"]
    });
    assert.strictEqual(widget.domNode.querySelector(".chat-input-notification")?.textContent, "Agent Host promo");
  });
  test("announces only the notification rendered in the current session", () => {
    const currentSessionType = observableValue("currentSessionType", localChatSessionType);
    const notificationService = createRecordingNotificationService();
    const instantiationService = store.add(workbenchInstantiationService(void 0, store));
    instantiationService.stub(IChatInputNotificationService, notificationService.service);
    instantiationService.stub(ICommandService, new TestCommandService());
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    store.add(instantiationService.createInstance(ChatInputNotificationWidget, { modelTargetChatSessionType: currentSessionType }));
    const lastAnnounced = () => notificationService.announced[notificationService.announced.length - 1];
    notificationService.set({
      id: "copilot-promo",
      severity: ChatInputNotificationSeverity.Info,
      message: "Copilot promo",
      description: void 0,
      actions: [],
      dismissible: true,
      autoDismissOnMessage: false,
      sessionTypes: [SessionType.AgentHostCopilot]
    });
    assert.strictEqual(lastAnnounced(), void 0, "nothing should be announced in a non-matching session");
    currentSessionType.set(SessionType.AgentHostCopilot, void 0);
    assert.strictEqual(lastAnnounced()?.id, "copilot-promo", "the promo should be announced once its session is active");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXROb3RpZmljYXRpb25XaWRnZXQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRFdmVudCwgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgZ2V0U2luZ2xldG9uU2VydmljZURlc2NyaXB0b3JzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLCBDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eSwgSUNoYXRJbnB1dE5vdGlmaWNhdGlvbiwgSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9pbnB1dC9jaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldCwgSUNoYXRJbnB1dE5vdGlmaWNhdGlvbkRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0Tm90aWZpY2F0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IGxvY2FsQ2hhdFNlc3Npb25UeXBlLCBTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcblxuY2xhc3MgVGVzdENvbW1hbmRTZXJ2aWNlIGltcGxlbWVudHMgSUNvbW1hbmRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgb25XaWxsRXhlY3V0ZUNvbW1hbmQ6IEV2ZW50PElDb21tYW5kRXZlbnQ+ID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgb25EaWRFeGVjdXRlQ29tbWFuZDogRXZlbnQ8SUNvbW1hbmRFdmVudD4gPSBFdmVudC5Ob25lO1xuXG5cdHJlYWRvbmx5IGV4ZWN1dGVkOiB7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGFyZ3M6IHJlYWRvbmx5IHVua25vd25bXSB9W10gPSBbXTtcblxuXHRhc3luYyBleGVjdXRlQ29tbWFuZChpZDogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuZXhlY3V0ZWQucHVzaCh7IGlkLCBhcmdzIH0pO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuY2xhc3MgUmVjb3JkaW5nTG9nU2VydmljZSBleHRlbmRzIE51bGxMb2dTZXJ2aWNlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfb25FcnJvciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHJlYWRvbmx5IG9uRXJyb3IgPSB0aGlzLl9vbkVycm9yLmV2ZW50O1xuXG5cdG92ZXJyaWRlIGVycm9yKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRXJyb3IuZmlyZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkVycm9yLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgUmVjb3JkaW5nVGVsZW1ldHJ5U2VydmljZSBleHRlbmRzIE51bGxUZWxlbWV0cnlTZXJ2aWNlU2hhcGUge1xuXHRyZWFkb25seSBldmVudHM6IHsgbmFtZTogc3RyaW5nOyBkYXRhOiB1bmtub3duIH1bXSA9IFtdO1xuXG5cdG92ZXJyaWRlIHB1YmxpY0xvZzIoZXZlbnROYW1lPzogc3RyaW5nLCBkYXRhPzogdW5rbm93bik6IHZvaWQge1xuXHRcdGlmIChldmVudE5hbWUpIHtcblx0XHRcdHRoaXMuZXZlbnRzLnB1c2goeyBuYW1lOiBldmVudE5hbWUsIGRhdGEgfSk7XG5cdFx0fVxuXHR9XG59XG5cbnN1aXRlKCdDaGF0SW5wdXROb3RpZmljYXRpb25XaWRnZXQnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlTm90aWZpY2F0aW9uU2VydmljZSgpOiBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSB7XG5cdFx0Y29uc3QgZGVzY3JpcHRvciA9IGdldFNpbmdsZXRvblNlcnZpY2VEZXNjcmlwdG9ycygpLmZpbmQoKFtpZF0pID0+IGlkID09PSBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSk/LlsxXTtcblx0XHRhc3NlcnQub2soZGVzY3JpcHRvcik7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCBuZXcgVGVzdENvbW1hbmRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IGNoaWxkSW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQobmV3IFNlcnZpY2VDb2xsZWN0aW9uKFxuXHRcdFx0W0lDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLCBuZXcgU3luY0Rlc2NyaXB0b3IoZGVzY3JpcHRvci5jdG9yLCBkZXNjcmlwdG9yLnN0YXRpY0FyZ3VtZW50cyldXG5cdFx0KSkpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBjaGlsZEluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0c3RvcmUuYWRkKG5vdGlmaWNhdGlvblNlcnZpY2UgYXMgSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UgJiBJRGlzcG9zYWJsZSk7XG5cdFx0cmV0dXJuIG5vdGlmaWNhdGlvblNlcnZpY2U7XG5cdH1cblxuXHR0ZXN0KCdyZWFjdGl2ZWx5IGFwcGxpZXMgc2Vzc2lvbiB0eXBlIGZpbHRlciB3aGVuIHBlbmRpbmcgZGVsZWdhdGlvbiB0YXJnZXQgY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCBjdXJyZW50U2Vzc2lvblR5cGUgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPignY3VycmVudFNlc3Npb25UeXBlJywgbG9jYWxDaGF0U2Vzc2lvblR5cGUpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBjcmVhdGVOb3RpZmljYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQod29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UsIG5vdGlmaWNhdGlvblNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbW1hbmRTZXJ2aWNlLCBuZXcgVGVzdENvbW1hbmRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHdpZGdldCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SW5wdXROb3RpZmljYXRpb25XaWRnZXQsIHsgbW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGU6IGN1cnJlbnRTZXNzaW9uVHlwZSB9KSk7XG5cblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLnNldE5vdGlmaWNhdGlvbih7XG5cdFx0XHRpZDogJ2xvY2FsLW9ubHknLFxuXHRcdFx0c2V2ZXJpdHk6IENoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5LkluZm8sXG5cdFx0XHRtZXNzYWdlOiAnTG9jYWwgb25seScsXG5cdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0YWN0aW9uczogW10sXG5cdFx0XHRkaXNtaXNzaWJsZTogZmFsc2UsXG5cdFx0XHRhdXRvRGlzbWlzc09uTWVzc2FnZTogZmFsc2UsXG5cdFx0XHRzZXNzaW9uVHlwZXM6IFtsb2NhbENoYXRTZXNzaW9uVHlwZV0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtaW5wdXQtbm90aWZpY2F0aW9uJyk/LnRleHRDb250ZW50LCAnTG9jYWwgb25seScpO1xuXG5cdFx0Y3VycmVudFNlc3Npb25UeXBlLnNldChTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1pbnB1dC1ub3RpZmljYXRpb24nKSwgbnVsbCk7XG5cblx0XHRjdXJyZW50U2Vzc2lvblR5cGUuc2V0KGxvY2FsQ2hhdFNlc3Npb25UeXBlLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1pbnB1dC1ub3RpZmljYXRpb24nKT8udGV4dENvbnRlbnQsICdMb2NhbCBvbmx5Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWN0aXZlbHkgYXBwbGllcyBzZXNzaW9uIHJlc291cmNlIGZpbHRlciB3aGVuIHRoZSBzZXNzaW9uIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlyc3RTZXNzaW9uID0gVVJJLnBhcnNlKCd2c2NvZGUtY2hhdC1zZXNzaW9uOi8vYWdlbnQtaG9zdC1jb3BpbG90Y2xpL3Nlc3Npb24tMScpO1xuXHRcdGNvbnN0IHNlY29uZFNlc3Npb24gPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9hZ2VudC1ob3N0LWNvcGlsb3RjbGkvc2Vzc2lvbi0yJyk7XG5cdFx0Y29uc3QgY3VycmVudFNlc3Npb25UeXBlID0gb2JzZXJ2YWJsZVZhbHVlPHN0cmluZyB8IHVuZGVmaW5lZD4oJ2N1cnJlbnRTZXNzaW9uVHlwZScsIFNlc3Npb25UeXBlLkFnZW50SG9zdENvcGlsb3QpO1xuXHRcdGNvbnN0IGN1cnJlbnRTZXNzaW9uUmVzb3VyY2UgPSBvYnNlcnZhYmxlVmFsdWU8VVJJIHwgdW5kZWZpbmVkPignY3VycmVudFNlc3Npb25SZXNvdXJjZScsIGZpcnN0U2Vzc2lvbik7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGNyZWF0ZU5vdGlmaWNhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29tbWFuZFNlcnZpY2UsIG5ldyBUZXN0Q29tbWFuZFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldCwge1xuXHRcdFx0bW9kZWxUYXJnZXRDaGF0U2Vzc2lvblR5cGU6IGN1cnJlbnRTZXNzaW9uVHlwZSxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogY3VycmVudFNlc3Npb25SZXNvdXJjZSxcblx0XHR9KSk7XG5cblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLnNldE5vdGlmaWNhdGlvbih7XG5cdFx0XHRpZDogJ2ZpcnN0LXNlc3Npb24tb25seScsXG5cdFx0XHRzZXZlcml0eTogQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2U6ICdGaXJzdCBzZXNzaW9uIG9ubHknLFxuXHRcdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdGFjdGlvbnM6IFtdLFxuXHRcdFx0ZGlzbWlzc2libGU6IGZhbHNlLFxuXHRcdFx0YXV0b0Rpc21pc3NPbk1lc3NhZ2U6IGZhbHNlLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlczogW2ZpcnN0U2Vzc2lvbl0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtaW5wdXQtbm90aWZpY2F0aW9uJyk/LnRleHRDb250ZW50LCAnRmlyc3Qgc2Vzc2lvbiBvbmx5Jyk7XG5cdFx0Y3VycmVudFNlc3Npb25SZXNvdXJjZS5zZXQoc2Vjb25kU2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtaW5wdXQtbm90aWZpY2F0aW9uJyksIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJzIG1hcmtkb3duIGRlc2NyaXB0aW9ucyBhcyByaWNoIGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGNyZWF0ZU5vdGlmaWNhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29tbWFuZFNlcnZpY2UsIG5ldyBUZXN0Q29tbWFuZFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldCwgdW5kZWZpbmVkKSk7XG5cblx0XHRub3RpZmljYXRpb25TZXJ2aWNlLnNldE5vdGlmaWNhdGlvbih7XG5cdFx0XHRpZDogJ21hcmtkb3duLWRlc2NyaXB0aW9uJyxcblx0XHRcdHNldmVyaXR5OiBDaGF0SW5wdXROb3RpZmljYXRpb25TZXZlcml0eS5JbmZvLFxuXHRcdFx0bWVzc2FnZTogJ0NhY2hlIGlzIHN0YWxlJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBuZXcgTWFya2Rvd25TdHJpbmcoJ0NvbnNpZGVyIGEgbmV3IGNoYXQuIFtMZWFybiBtb3JlXShodHRwczovL2FrYS5tcy9sZWFybiknKSxcblx0XHRcdGFjdGlvbnM6IFtdLFxuXHRcdFx0ZGlzbWlzc2libGU6IGZhbHNlLFxuXHRcdFx0YXV0b0Rpc21pc3NPbk1lc3NhZ2U6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1pbnB1dC1ub3RpZmljYXRpb24tZGVzY3JpcHRpb24nKTtcblx0XHRjb25zdCBsaW5rID0gZGVzY3JpcHRpb24/LnF1ZXJ5U2VsZWN0b3IoJ2EnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRleHQ6IGRlc2NyaXB0aW9uPy50ZXh0Q29udGVudCxcblx0XHRcdG1hcmtkb3duOiAhIWRlc2NyaXB0aW9uPy5xdWVyeVNlbGVjdG9yKCcuY2hhdC1pbnB1dC1ub3RpZmljYXRpb24tZGVzY3JpcHRpb24tbWFya2Rvd24nKSxcblx0XHRcdGxpbmtUZXh0OiBsaW5rPy50ZXh0Q29udGVudCxcblx0XHRcdGxpbmtIcmVmOiBsaW5rPy5nZXRBdHRyaWJ1dGUoJ2RhdGEtaHJlZicpID8/IGxpbms/LmdldEF0dHJpYnV0ZSgnaHJlZicpLFxuXHRcdH0sIHtcblx0XHRcdHRleHQ6ICdDb25zaWRlciBhIG5ldyBjaGF0LiBMZWFybiBtb3JlJyxcblx0XHRcdG1hcmtkb3duOiB0cnVlLFxuXHRcdFx0bGlua1RleHQ6ICdMZWFybiBtb3JlJyxcblx0XHRcdGxpbmtIcmVmOiAnaHR0cHM6Ly9ha2EubXMvbGVhcm4nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRvLWRpc21pc3Mgb24gbWVzc2FnZSBvbmx5IGFwcGxpZXMgdG8gdGhlIHNlbmRpbmcgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBmaXJzdFNlc3Npb24gPSBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9hZ2VudC1ob3N0LWNvcGlsb3RjbGkvc2Vzc2lvbi0xJyk7XG5cdFx0Y29uc3Qgc2Vjb25kU2Vzc2lvbiA9IFVSSS5wYXJzZSgndnNjb2RlLWNoYXQtc2Vzc2lvbjovL2FnZW50LWhvc3QtY29waWxvdGNsaS9zZXNzaW9uLTInKTtcblx0XHRjb25zdCBub3RpZmljYXRpb25TZXJ2aWNlID0gY3JlYXRlTm90aWZpY2F0aW9uU2VydmljZSgpO1xuXG5cdFx0Zm9yIChjb25zdCBbaWQsIHNlc3Npb25SZXNvdXJjZV0gb2YgW1snZmlyc3QnLCBmaXJzdFNlc3Npb25dLCBbJ3NlY29uZCcsIHNlY29uZFNlc3Npb25dXSBhcyBjb25zdCkge1xuXHRcdFx0bm90aWZpY2F0aW9uU2VydmljZS5zZXROb3RpZmljYXRpb24oe1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0c2V2ZXJpdHk6IENoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5LkluZm8sXG5cdFx0XHRcdG1lc3NhZ2U6ICdDYWNoZSBpcyBzdGFsZScsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdGFjdGlvbnM6IFtdLFxuXHRcdFx0XHRkaXNtaXNzaWJsZTogdHJ1ZSxcblx0XHRcdFx0YXV0b0Rpc21pc3NPbk1lc3NhZ2U6IHRydWUsXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZXM6IFtzZXNzaW9uUmVzb3VyY2VdLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0bm90aWZpY2F0aW9uU2VydmljZS5oYW5kbGVNZXNzYWdlU2VudCh7IHNlc3Npb25UeXBlOiBTZXNzaW9uVHlwZS5BZ2VudEhvc3RDb3BpbG90LCBzZXNzaW9uUmVzb3VyY2U6IGZpcnN0U2Vzc2lvbiB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aW5GaXJzdFNlc3Npb246IG5vdGlmaWNhdGlvblNlcnZpY2UuZ2V0QWN0aXZlTm90aWZpY2F0aW9uKG4gPT4gbi5pZCA9PT0gJ2ZpcnN0Jyk/LmlkLFxuXHRcdFx0aW5TZWNvbmRTZXNzaW9uOiBub3RpZmljYXRpb25TZXJ2aWNlLmdldEFjdGl2ZU5vdGlmaWNhdGlvbihuID0+IG4uaWQgPT09ICdzZWNvbmQnKT8uaWQsXG5cdFx0fSwge1xuXHRcdFx0aW5GaXJzdFNlc3Npb246IHVuZGVmaW5lZCxcblx0XHRcdGluU2Vjb25kU2Vzc2lvbjogJ3NlY29uZCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8qKlxuXHQgKiBBIG5vdGlmaWNhdGlvbiBzZXJ2aWNlIG1vY2sgdGhhdCByZWNvcmRzIHRoZSBub3RpZmljYXRpb25zIGZvcndhcmRlZCB0b1xuXHQgKiB7QGxpbmsgSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UuYW5ub3VuY2VSZW5kZXJlZH0gYW5kIGFwcGxpZXMgdGhlXG5cdCAqIGBnZXRBY3RpdmVOb3RpZmljYXRpb25gIGZpbHRlciwgc28gdGVzdHMgY2FuIG9ic2VydmUgZXhhY3RseSB3aGF0IGEgY2hhdFxuXHQgKiBpbnB1dCB3b3VsZCByZW5kZXIgYW5kIGFubm91bmNlIGZvciBpdHMgc2Vzc2lvbi5cblx0ICovXG5cdGZ1bmN0aW9uIGNyZWF0ZVJlY29yZGluZ05vdGlmaWNhdGlvblNlcnZpY2UoKSB7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJQ2hhdElucHV0Tm90aWZpY2F0aW9uPigpO1xuXHRcdGNvbnN0IGFubm91bmNlZDogKElDaGF0SW5wdXROb3RpZmljYXRpb24gfCB1bmRlZmluZWQpW10gPSBbXTtcblx0XHRjb25zdCBkaXNtaXNzZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2UgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0Y29uc3Qgb25EaWREaXNtaXNzID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdFx0Y29uc3Qgc2VydmljZTogSUNoYXRJbnB1dE5vdGlmaWNhdGlvblNlcnZpY2UgPSB7XG5cdFx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRvbkRpZENoYW5nZTogb25EaWRDaGFuZ2UuZXZlbnQsXG5cdFx0XHRvbkRpZERpc21pc3M6IG9uRGlkRGlzbWlzcy5ldmVudCxcblx0XHRcdHNldE5vdGlmaWNhdGlvbihub3RpZmljYXRpb24pIHsgbm90aWZpY2F0aW9ucy5zZXQobm90aWZpY2F0aW9uLmlkLCBub3RpZmljYXRpb24pOyBvbkRpZENoYW5nZS5maXJlKCk7IH0sXG5cdFx0XHRkZWxldGVOb3RpZmljYXRpb24oaWQpIHsgaWYgKG5vdGlmaWNhdGlvbnMuZGVsZXRlKGlkKSkgeyBvbkRpZENoYW5nZS5maXJlKCk7IH0gfSxcblx0XHRcdGRpc21pc3NOb3RpZmljYXRpb24oaWQpIHsgZGlzbWlzc2VkLnB1c2goaWQpOyBvbkRpZERpc21pc3MuZmlyZShpZCk7IH0sXG5cdFx0XHRnZXRBY3RpdmVOb3RpZmljYXRpb24oZmlsdGVyKSB7XG5cdFx0XHRcdGxldCBhY3RpdmU6IElDaGF0SW5wdXROb3RpZmljYXRpb24gfCB1bmRlZmluZWQ7XG5cdFx0XHRcdGZvciAoY29uc3Qgbm90aWZpY2F0aW9uIG9mIG5vdGlmaWNhdGlvbnMudmFsdWVzKCkpIHtcblx0XHRcdFx0XHRpZiAoZmlsdGVyICYmICFmaWx0ZXIobm90aWZpY2F0aW9uKSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGFjdGl2ZSA9IG5vdGlmaWNhdGlvbjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gYWN0aXZlO1xuXHRcdFx0fSxcblx0XHRcdGhhbmRsZU1lc3NhZ2VTZW50KCkgeyB9LFxuXHRcdFx0YW5ub3VuY2VSZW5kZXJlZChub3RpZmljYXRpb24pIHsgYW5ub3VuY2VkLnB1c2gobm90aWZpY2F0aW9uKTsgfSxcblx0XHR9O1xuXHRcdHJldHVybiB7IHNlcnZpY2UsIGFubm91bmNlZCwgZGlzbWlzc2VkLCBzZXQ6IChub3RpZmljYXRpb246IElDaGF0SW5wdXROb3RpZmljYXRpb24pID0+IHNlcnZpY2Uuc2V0Tm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbikgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVdpZGdldChvcHRpb25zOiB7XG5cdFx0ZGVsZWdhdGU/OiBJQ2hhdElucHV0Tm90aWZpY2F0aW9uRGVsZWdhdGU7XG5cdFx0Y29tbWFuZFNlcnZpY2U/OiBJQ29tbWFuZFNlcnZpY2U7XG5cdFx0dGVsZW1ldHJ5U2VydmljZT86IElUZWxlbWV0cnlTZXJ2aWNlO1xuXHRcdGxvZ1NlcnZpY2U/OiBJTG9nU2VydmljZTtcblx0fSA9IHt9KSB7XG5cdFx0Y29uc3Qgbm90aWZpY2F0aW9uU2VydmljZSA9IGNyZWF0ZVJlY29yZGluZ05vdGlmaWNhdGlvblNlcnZpY2UoKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZS5zZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwgb3B0aW9ucy5jb21tYW5kU2VydmljZSA/PyBuZXcgVGVzdENvbW1hbmRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIG9wdGlvbnMudGVsZW1ldHJ5U2VydmljZSA/PyBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0aWYgKG9wdGlvbnMubG9nU2VydmljZSkge1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgb3B0aW9ucy5sb2dTZXJ2aWNlKTtcblx0XHR9XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRJbnB1dE5vdGlmaWNhdGlvbldpZGdldCwgb3B0aW9ucy5kZWxlZ2F0ZSkpO1xuXHRcdHJldHVybiB7IG5vdGlmaWNhdGlvblNlcnZpY2UsIHdpZGdldCB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY2xpY2tBY3Rpb24od2lkZ2V0OiBDaGF0SW5wdXROb3RpZmljYXRpb25XaWRnZXQpOiB2b2lkIHtcblx0XHRjb25zdCBidXR0b24gPSB3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLmNoYXQtaW5wdXQtbm90aWZpY2F0aW9uLWFjdGlvbi1idXR0b24nKTtcblx0XHRhc3NlcnQub2soYnV0dG9uKTtcblx0XHRidXR0b24uY2xpY2soKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNob3dOb3RpZmljYXRpb24oXG5cdFx0bm90aWZpY2F0aW9uU2VydmljZTogUmV0dXJuVHlwZTx0eXBlb2YgY3JlYXRlUmVjb3JkaW5nTm90aWZpY2F0aW9uU2VydmljZT4sXG5cdFx0bm90aWZpY2F0aW9uOiBQaWNrPElDaGF0SW5wdXROb3RpZmljYXRpb24sICdpZCcgfCAnbWVzc2FnZScgfCAnYWN0aW9ucyc+ICYgUGFydGlhbDxJQ2hhdElucHV0Tm90aWZpY2F0aW9uPixcblx0KTogdm9pZCB7XG5cdFx0bm90aWZpY2F0aW9uU2VydmljZS5zZXQoe1xuXHRcdFx0c2V2ZXJpdHk6IENoYXRJbnB1dE5vdGlmaWNhdGlvblNldmVyaXR5LkluZm8sXG5cdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0ZGlzbWlzc2libGU6IHRydWUsXG5cdFx0XHRhdXRvRGlzbWlzc09uTWVzc2FnZTogZmFsc2UsXG5cdFx0XHQuLi5ub3RpZmljYXRpb24sXG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCdhY3Rpb24gY29tbWFuZHMgZXhlY3V0ZSB3aXRoIHByb3ZpZGVkIGFyZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBuZXcgVGVzdENvbW1hbmRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBub3RpZmljYXRpb25TZXJ2aWNlLCB3aWRnZXQgfSA9IGNyZWF0ZVdpZGdldCh7IGNvbW1hbmRTZXJ2aWNlIH0pO1xuXHRcdHNob3dOb3RpZmljYXRpb24obm90aWZpY2F0aW9uU2VydmljZSwge1xuXHRcdFx0aWQ6ICdwcm9tbycsXG5cdFx0XHRtZXNzYWdlOiAnUHJvbW8nLFxuXHRcdFx0YWN0aW9uczogW3sga2luZDogQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZC5Db21tYW5kLCBsYWJlbDogJ1VzZScsIGNvbW1hbmRJZDogJ3Rlc3QudXNlUHJvbW8nLCBjb21tYW5kQXJnczogW3sgbW9kZWxJZGVudGlmaWVyOiAnbScgfV0gfV0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBkaWREaXNtaXNzID0gRXZlbnQudG9Qcm9taXNlKG5vdGlmaWNhdGlvblNlcnZpY2Uuc2VydmljZS5vbkRpZERpc21pc3MpO1xuXHRcdGNsaWNrQWN0aW9uKHdpZGdldCk7XG5cdFx0YXdhaXQgZGlkRGlzbWlzcztcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tbWFuZFNlcnZpY2UuZXhlY3V0ZWQsIFt7IGlkOiAndGVzdC51c2VQcm9tbycsIGFyZ3M6IFt7IG1vZGVsSWRlbnRpZmllcjogJ20nIH1dIH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uU2VydmljZS5kaXNtaXNzZWQuam9pbignLCcpLCAncHJvbW8nKTtcblx0fSk7XG5cblx0dGVzdCgnYWN0aW9ucyB3aXRob3V0IGV4cGxpY2l0IGNvbW1hbmRBcmdzIGFyZSBleGVjdXRlZCB3aXRoIGVtcHR5IGFyZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWFuZFNlcnZpY2UgPSBuZXcgVGVzdENvbW1hbmRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBub3RpZmljYXRpb25TZXJ2aWNlLCB3aWRnZXQgfSA9IGNyZWF0ZVdpZGdldCh7IGNvbW1hbmRTZXJ2aWNlIH0pO1xuXHRcdHNob3dOb3RpZmljYXRpb24obm90aWZpY2F0aW9uU2VydmljZSwge1xuXHRcdFx0aWQ6ICdpbmZvJyxcblx0XHRcdG1lc3NhZ2U6ICdJbmZvJyxcblx0XHRcdGFjdGlvbnM6IFt7IGtpbmQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuQ29tbWFuZCwgbGFiZWw6ICdVcGdyYWRlJywgY29tbWFuZElkOiAndGVzdC51cGdyYWRlJyB9XSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRpZERpc21pc3MgPSBFdmVudC50b1Byb21pc2Uobm90aWZpY2F0aW9uU2VydmljZS5zZXJ2aWNlLm9uRGlkRGlzbWlzcyk7XG5cdFx0Y2xpY2tBY3Rpb24od2lkZ2V0KTtcblx0XHRhd2FpdCBkaWREaXNtaXNzO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21tYW5kU2VydmljZS5leGVjdXRlZCwgW3sgaWQ6ICd0ZXN0LnVwZ3JhZGUnLCBhcmdzOiBbXSB9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvblNlcnZpY2UuZGlzbWlzc2VkLmpvaW4oJywnKSwgJ2luZm8nKTtcblx0fSk7XG5cblx0dGVzdCgnY2F0Y2hlcyByZWplY3RlZCBjb21tYW5kIGFjdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IHN0b3JlLmFkZChuZXcgUmVjb3JkaW5nTG9nU2VydmljZSgpKTtcblx0XHRjb25zdCBjb21tYW5kU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RDb21tYW5kU2VydmljZSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBleGVjdXRlQ29tbWFuZChpZDogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiBQcm9taXNlPHVuZGVmaW5lZD4ge1xuXHRcdFx0XHRhd2FpdCBzdXBlci5leGVjdXRlQ29tbWFuZChpZCwgLi4uYXJncyk7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignY29tbWFuZCBmYWlsZWQnKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgeyBub3RpZmljYXRpb25TZXJ2aWNlLCB3aWRnZXQgfSA9IGNyZWF0ZVdpZGdldCh7IGNvbW1hbmRTZXJ2aWNlLCBsb2dTZXJ2aWNlIH0pO1xuXHRcdHNob3dOb3RpZmljYXRpb24obm90aWZpY2F0aW9uU2VydmljZSwge1xuXHRcdFx0aWQ6ICdyZWplY3RlZC1jb21tYW5kJyxcblx0XHRcdG1lc3NhZ2U6ICdSZWplY3RlZCBjb21tYW5kJyxcblx0XHRcdGFjdGlvbnM6IFt7IGtpbmQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuQ29tbWFuZCwgbGFiZWw6ICdSdW4nLCBjb21tYW5kSWQ6ICd0ZXN0LnJlamVjdCcgfV0sXG5cdFx0XHRkaXNtaXNzaWJsZTogZmFsc2UsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBkaWRMb2dFcnJvciA9IEV2ZW50LnRvUHJvbWlzZShsb2dTZXJ2aWNlLm9uRXJyb3IpO1xuXHRcdGNsaWNrQWN0aW9uKHdpZGdldCk7XG5cdFx0YXdhaXQgZGlkTG9nRXJyb3I7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVkLCBbeyBpZDogJ3Rlc3QucmVqZWN0JywgYXJnczogW10gfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzd2l0Y2gtdG8tbW9kZWwgYWN0aW9ucyB1c2UgdGhlIHJlbmRlcmluZyBpbnB1dCBkZWxlZ2F0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZWxlbWV0cnlTZXJ2aWNlID0gbmV3IFJlY29yZGluZ1RlbGVtZXRyeVNlcnZpY2UoKTtcblx0XHRjb25zdCBzd2l0Y2hlZE1vZGVsczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgcGlja2VyT3BlbkNvdW50ID0gMDtcblx0XHRjb25zdCB7IG5vdGlmaWNhdGlvblNlcnZpY2UsIHdpZGdldCB9ID0gY3JlYXRlV2lkZ2V0KHtcblx0XHRcdHRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHRkZWxlZ2F0ZToge1xuXHRcdFx0XHRzd2l0Y2hUb01vZGVsOiBtb2RlbElkZW50aWZpZXIgPT4ge1xuXHRcdFx0XHRcdHN3aXRjaGVkTW9kZWxzLnB1c2gobW9kZWxJZGVudGlmaWVyKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fSxcblx0XHRcdFx0b3Blbk1vZGVsUGlja2VyOiAoKSA9PiBwaWNrZXJPcGVuQ291bnQrKyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRzaG93Tm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvblNlcnZpY2UsIHtcblx0XHRcdGlkOiAncHJvbW8nLFxuXHRcdFx0bWVzc2FnZTogJ1Byb21vJyxcblx0XHRcdGFjdGlvbnM6IFt7IGxhYmVsOiAnVHJ5IE1vZGVsJywga2luZDogQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZC5Td2l0Y2hUb01vZGVsLCBtb2RlbElkZW50aWZpZXI6ICd2ZW5kb3IvbW9kZWwnIH1dLFxuXHRcdH0pO1xuXG5cdFx0Y2xpY2tBY3Rpb24od2lkZ2V0KTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3dpdGNoZWRNb2RlbHMsXG5cdFx0XHRwaWNrZXJPcGVuQ291bnQsXG5cdFx0XHRhY3Rpb25FdmVudHM6IHRlbGVtZXRyeVNlcnZpY2UuZXZlbnRzLmZpbHRlcihldmVudCA9PiBldmVudC5uYW1lID09PSAnY2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uJykubWFwKGV2ZW50ID0+IGV2ZW50LmRhdGEpLFxuXHRcdH0sIHtcblx0XHRcdHN3aXRjaGVkTW9kZWxzOiBbJ3ZlbmRvci9tb2RlbCddLFxuXHRcdFx0cGlja2VyT3BlbkNvdW50OiAwLFxuXHRcdFx0YWN0aW9uRXZlbnRzOiBbeyBpZDogJ3Byb21vJywgdGVsZW1ldHJ5SWQ6IHVuZGVmaW5lZCwgYWN0aW9uS2luZDogQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZC5Td2l0Y2hUb01vZGVsIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVucyB0aGUgbG9jYWwgbW9kZWwgcGlja2VyIHdoZW4gdGhlIHJlcXVlc3RlZCBtb2RlbCBpcyB1bmF2YWlsYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgcGlja2VyT3BlbkNvdW50ID0gMDtcblx0XHRjb25zdCB7IG5vdGlmaWNhdGlvblNlcnZpY2UsIHdpZGdldCB9ID0gY3JlYXRlV2lkZ2V0KHtcblx0XHRcdGRlbGVnYXRlOiB7XG5cdFx0XHRcdHN3aXRjaFRvTW9kZWw6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRvcGVuTW9kZWxQaWNrZXI6ICgpID0+IHBpY2tlck9wZW5Db3VudCsrLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHNob3dOb3RpZmljYXRpb24obm90aWZpY2F0aW9uU2VydmljZSwge1xuXHRcdFx0aWQ6ICdwcm9tbycsXG5cdFx0XHRtZXNzYWdlOiAnUHJvbW8nLFxuXHRcdFx0YWN0aW9uczogW3sgbGFiZWw6ICdUcnkgTW9kZWwnLCBraW5kOiBDaGF0SW5wdXROb3RpZmljYXRpb25BY3Rpb25LaW5kLlN3aXRjaFRvTW9kZWwsIG1vZGVsSWRlbnRpZmllcjogJ21pc3NpbmcvbW9kZWwnIH1dLFxuXHRcdH0pO1xuXG5cdFx0Y2xpY2tBY3Rpb24od2lkZ2V0KTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXJPcGVuQ291bnQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVucyB0aGUgbG9jYWwgbW9kZWwgcGlja2VyIHdoZW4gZGlyZWN0IHNlbGVjdGlvbiBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRsZXQgcGlja2VyT3BlbkNvdW50ID0gMDtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBSZWNvcmRpbmdMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHsgbm90aWZpY2F0aW9uU2VydmljZSwgd2lkZ2V0IH0gPSBjcmVhdGVXaWRnZXQoe1xuXHRcdFx0bG9nU2VydmljZSxcblx0XHRcdGRlbGVnYXRlOiB7XG5cdFx0XHRcdHN3aXRjaFRvTW9kZWw6ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdzZWxlY3Rpb24gZmFpbGVkJyk7IH0sXG5cdFx0XHRcdG9wZW5Nb2RlbFBpY2tlcjogKCkgPT4gcGlja2VyT3BlbkNvdW50KyssXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0c2hvd05vdGlmaWNhdGlvbihub3RpZmljYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRpZDogJ3Byb21vJyxcblx0XHRcdG1lc3NhZ2U6ICdQcm9tbycsXG5cdFx0XHRhY3Rpb25zOiBbeyBsYWJlbDogJ1RyeSBNb2RlbCcsIGtpbmQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuU3dpdGNoVG9Nb2RlbCwgbW9kZWxJZGVudGlmaWVyOiAndmVuZG9yL21vZGVsJyB9XSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRpZExvZ0Vycm9yID0gRXZlbnQudG9Qcm9taXNlKGxvZ1NlcnZpY2Uub25FcnJvcik7XG5cdFx0Y2xpY2tBY3Rpb24od2lkZ2V0KTtcblx0XHRhd2FpdCBkaWRMb2dFcnJvcjtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXJPcGVuQ291bnQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdHRlbXB0cyB0aGUgbW9kZWwgcGlja2VyIGZhbGxiYWNrIG9ubHkgb25jZSB3aGVuIGl0IGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFJlY29yZGluZ0xvZ1NlcnZpY2UoKSk7XG5cdFx0bGV0IHBpY2tlck9wZW5Db3VudCA9IDA7XG5cdFx0Y29uc3QgeyBub3RpZmljYXRpb25TZXJ2aWNlLCB3aWRnZXQgfSA9IGNyZWF0ZVdpZGdldCh7XG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdFx0ZGVsZWdhdGU6IHtcblx0XHRcdFx0c3dpdGNoVG9Nb2RlbDogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdG9wZW5Nb2RlbFBpY2tlcjogKCkgPT4ge1xuXHRcdFx0XHRcdHBpY2tlck9wZW5Db3VudCsrO1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcigncGlja2VyIGZhaWxlZCcpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRzaG93Tm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvblNlcnZpY2UsIHtcblx0XHRcdGlkOiAncHJvbW8nLFxuXHRcdFx0bWVzc2FnZTogJ1Byb21vJyxcblx0XHRcdGFjdGlvbnM6IFt7IGxhYmVsOiAnVHJ5IE1vZGVsJywga2luZDogQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZC5Td2l0Y2hUb01vZGVsLCBtb2RlbElkZW50aWZpZXI6ICdtaXNzaW5nL21vZGVsJyB9XSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGRpZExvZ0Vycm9yID0gRXZlbnQudG9Qcm9taXNlKGxvZ1NlcnZpY2Uub25FcnJvcik7XG5cdFx0Y2xpY2tBY3Rpb24od2lkZ2V0KTtcblx0XHRhd2FpdCBkaWRMb2dFcnJvcjtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXJPcGVuQ291bnQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZW5kZXIgc2VtYW50aWMgYWN0aW9ucyB1bnN1cHBvcnRlZCBieSB0aGUgaW5wdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBub3RpZmljYXRpb25TZXJ2aWNlLCB3aWRnZXQgfSA9IGNyZWF0ZVdpZGdldCgpO1xuXG5cdFx0c2hvd05vdGlmaWNhdGlvbihub3RpZmljYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRpZDogJ3Byb21vJyxcblx0XHRcdG1lc3NhZ2U6ICdQcm9tbycsXG5cdFx0XHRhY3Rpb25zOiBbeyBsYWJlbDogJ1RyeSBNb2RlbCcsIGtpbmQ6IENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQuU3dpdGNoVG9Nb2RlbCwgbW9kZWxJZGVudGlmaWVyOiAndmVuZG9yL21vZGVsJyB9XSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1pbnB1dC1ub3RpZmljYXRpb24tYWN0aW9uLWJ1dHRvbicpLCBudWxsKTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hlcyBBZ2VudCBIb3N0IG5vdGlmaWNhdGlvbnMgYWdhaW5zdCB0aGUgcmVzb3VyY2Ugc2NoZW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJywgcGF0aDogJy91bnRpdGxlZC1zZXNzaW9uJyB9KTtcblx0XHRjb25zdCB7IG5vdGlmaWNhdGlvblNlcnZpY2UsIHdpZGdldCB9ID0gY3JlYXRlV2lkZ2V0KHtcblx0XHRcdGRlbGVnYXRlOiB7IG1vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiBjb25zdE9ic2VydmFibGUoZ2V0Q2hhdFNlc3Npb25UeXBlKHNlc3Npb25SZXNvdXJjZSkpIH0sXG5cdFx0fSk7XG5cblx0XHRzaG93Tm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvblNlcnZpY2UsIHtcblx0XHRcdGlkOiAnYWdlbnQtaG9zdC1wcm9tbycsXG5cdFx0XHRtZXNzYWdlOiAnQWdlbnQgSG9zdCBwcm9tbycsXG5cdFx0XHRhY3Rpb25zOiBbXSxcblx0XHRcdHNlc3Npb25UeXBlczogWydhZ2VudC1ob3N0LWNvcGlsb3RjbGknXSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3aWRnZXQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1pbnB1dC1ub3RpZmljYXRpb24nKT8udGV4dENvbnRlbnQsICdBZ2VudCBIb3N0IHByb21vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Fubm91bmNlcyBvbmx5IHRoZSBub3RpZmljYXRpb24gcmVuZGVyZWQgaW4gdGhlIGN1cnJlbnQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBjdXJyZW50U2Vzc2lvblR5cGUgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPignY3VycmVudFNlc3Npb25UeXBlJywgbG9jYWxDaGF0U2Vzc2lvblR5cGUpO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblNlcnZpY2UgPSBjcmVhdGVSZWNvcmRpbmdOb3RpZmljYXRpb25TZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZCh3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSwgbm90aWZpY2F0aW9uU2VydmljZS5zZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwgbmV3IFRlc3RDb21tYW5kU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHRzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdElucHV0Tm90aWZpY2F0aW9uV2lkZ2V0LCB7IG1vZGVsVGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiBjdXJyZW50U2Vzc2lvblR5cGUgfSkpO1xuXHRcdGNvbnN0IGxhc3RBbm5vdW5jZWQgPSAoKSA9PiBub3RpZmljYXRpb25TZXJ2aWNlLmFubm91bmNlZFtub3RpZmljYXRpb25TZXJ2aWNlLmFubm91bmNlZC5sZW5ndGggLSAxXTtcblxuXHRcdC8vIEEgcHJvbW8gc2NvcGVkIHRvIHRoZSBDb3BpbG90IGhhcm5lc3MgbXVzdCBub3QgYmUgYW5ub3VuY2VkIHdoaWxlIHRoZVxuXHRcdC8vIGlucHV0IGlzIGluIHRoZSBsb2NhbCBzZXNzaW9uLlxuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0KHtcblx0XHRcdGlkOiAnY29waWxvdC1wcm9tbycsXG5cdFx0XHRzZXZlcml0eTogQ2hhdElucHV0Tm90aWZpY2F0aW9uU2V2ZXJpdHkuSW5mbyxcblx0XHRcdG1lc3NhZ2U6ICdDb3BpbG90IHByb21vJyxcblx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRhY3Rpb25zOiBbXSxcblx0XHRcdGRpc21pc3NpYmxlOiB0cnVlLFxuXHRcdFx0YXV0b0Rpc21pc3NPbk1lc3NhZ2U6IGZhbHNlLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBbU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdF0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RBbm5vdW5jZWQoKSwgdW5kZWZpbmVkLCAnbm90aGluZyBzaG91bGQgYmUgYW5ub3VuY2VkIGluIGEgbm9uLW1hdGNoaW5nIHNlc3Npb24nKTtcblxuXHRcdGN1cnJlbnRTZXNzaW9uVHlwZS5zZXQoU2Vzc2lvblR5cGUuQWdlbnRIb3N0Q29waWxvdCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdEFubm91bmNlZCgpPy5pZCwgJ2NvcGlsb3QtcHJvbW8nLCAndGhlIHByb21vIHNob3VsZCBiZSBhbm5vdW5jZWQgb25jZSBpdHMgc2Vzc2lvbiBpcyBhY3RpdmUnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFNBQVMsYUFBYTtBQUUvQixTQUFTLGlCQUFpQix1QkFBdUI7QUFDakQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQXdCLHVCQUF1QjtBQUMvQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHNDQUFzQztBQUMvQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCLGlDQUFpQztBQUNoRSxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGlDQUFpQywrQkFBdUQscUNBQXFDO0FBQ3RJLFNBQVMsbUNBQW1FO0FBQzVFLFNBQVMsc0JBQXNCLG1CQUFtQjtBQUNsRCxTQUFTLDBCQUEwQjtBQUVuQyxNQUFNLG1CQUE4QztBQUFBLEVBQXBEO0FBR0MsU0FBUyx1QkFBNkMsTUFBTTtBQUM1RCxTQUFTLHNCQUE0QyxNQUFNO0FBRTNELFNBQVMsV0FBeUUsQ0FBQztBQUFBO0FBQUEsRUFFbkYsTUFBTSxlQUFlLE9BQWUsTUFBcUM7QUFDeEUsU0FBSyxTQUFTLEtBQUssRUFBRSxJQUFJLEtBQUssQ0FBQztBQUMvQixXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRUEsTUFBTSw0QkFBNEIsZUFBZTtBQUFBLEVBQWpEO0FBQUE7QUFDQyxTQUFpQixXQUFXLElBQUksUUFBYztBQUM5QyxTQUFTLFVBQVUsS0FBSyxTQUFTO0FBQUE7QUFBQSxFQUV4QixRQUFjO0FBQ3RCLFNBQUssU0FBUyxLQUFLO0FBQUEsRUFDcEI7QUFBQSxFQUVTLFVBQWdC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
