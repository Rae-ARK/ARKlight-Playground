import assert from "assert";
import { isMarkdownString } from "../../../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import {
  AgentHostPermissionMode,
  IAgentHostResourceService
} from "../../../../../../platform/agentHost/common/agentHostResourceService.js";
import { AGENT_HOST_SCHEME, agentHostAuthority } from "../../../../../../platform/agentHost/common/agentHostUri.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { Event } from "../../../../../../base/common/event.js";
import { MockLabelService } from "../../../../../services/label/test/common/mockLabelService.js";
import { AgentHostPermissionUiContribution } from "../../../browser/agentSessions/agentHost/agentHostPermissionUiContribution.js";
import {
  ChatInputNotificationActionKind,
  IChatInputNotificationService
} from "../../../browser/widget/input/chatInputNotificationService.js";
class FakePermissionService extends Disposable {
  constructor() {
    super(...arguments);
    this.pending = observableValue("pending", []);
    this.allPending = this.pending;
    this.list = async () => {
      throw new Error("not implemented");
    };
    this.read = async () => {
      throw new Error("not implemented");
    };
    this.write = async () => {
      throw new Error("not implemented");
    };
    this.del = async () => {
      throw new Error("not implemented");
    };
    this.move = async () => {
      throw new Error("not implemented");
    };
    this.copy = async () => {
      throw new Error("not implemented");
    };
    this.resolve = async () => {
      throw new Error("not implemented");
    };
    this.mkdir = async () => {
      throw new Error("not implemented");
    };
    this.check = async () => true;
    this.request = async () => {
    };
    this.pendingFor = () => this.pending;
    this.findPending = (id) => this.pending.get().find((r) => r.id === id);
    this.grantImplicitRead = () => Disposable.None;
    this.connectionClosed = () => {
    };
  }
}
class FakeNotificationService {
  constructor() {
    this.onDidChange = Event.None;
    this.onDidDismiss = Event.None;
    this.setCalls = [];
    this.deleteCalls = [];
  }
  setNotification(notification) {
    this.setCalls.push(notification);
  }
  deleteNotification(id) {
    this.deleteCalls.push(id);
  }
  dismissNotification(_id) {
  }
  getActiveNotification() {
    return void 0;
  }
  handleMessageSent() {
  }
  announceRendered() {
  }
}
class StubLabelService extends MockLabelService {
  constructor() {
    super(...arguments);
    this._hostLabels = /* @__PURE__ */ new Map();
  }
  setHostName(address, name) {
    this._hostLabels.set(agentHostAuthority(address), name);
  }
  getHostLabel(scheme, authority) {
    if (scheme === AGENT_HOST_SCHEME && authority && this._hostLabels.has(authority)) {
      return this._hostLabels.get(authority);
    }
    return authority ?? "";
  }
}
function makePending(opts) {
  return {
    id: `req-${opts.address}-${opts.uri.toString()}`,
    address: opts.address,
    mode: opts.mode,
    uri: opts.uri,
    allow: () => {
    },
    allowAlways: () => {
    },
    deny: () => {
    }
  };
}
suite("AgentHostPermissionUiContribution", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let permissionService;
  let notificationService;
  let labelService;
  setup(() => {
    permissionService = disposables.add(new FakePermissionService());
    notificationService = new FakeNotificationService();
    labelService = new StubLabelService();
    labelService.setHostName("host:1234", "My Host");
  });
  function createContribution() {
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IAgentHostResourceService, permissionService);
    instantiationService.stub(IChatInputNotificationService, notificationService);
    instantiationService.stub(ILabelService, labelService);
    const contribution = instantiationService.createInstance(AgentHostPermissionUiContribution);
    disposables.add(contribution);
    return contribution;
  }
  test("renders a markdown notification with three actions when a request arrives", () => {
    createContribution();
    const request = makePending({
      address: "host:1234",
      mode: AgentHostPermissionMode.Read,
      uri: URI.file("/Users/me/.gitconfig")
    });
    permissionService.pending.set([request], void 0);
    assert.strictEqual(notificationService.setCalls.length, 1);
    const notification = notificationService.setCalls[0];
    assert.ok(isMarkdownString(notification.message), "message should be an IMarkdownString");
    const actions = notification.actions.filter((action) => action.kind === ChatInputNotificationActionKind.Command);
    assert.strictEqual(actions.length, notification.actions.length);
    assert.strictEqual(
      actions.map((action) => action.commandId).join(","),
      "_agentHost.permission.deny,_agentHost.permission.allow,_agentHost.permission.allowAlways"
    );
    for (const action of actions) {
      assert.deepStrictEqual(action.commandArgs, [request.id], "each action carries the request id");
    }
  });
  test("clears the notification when the queue empties", () => {
    createContribution();
    const request = makePending({
      address: "host:1234",
      mode: AgentHostPermissionMode.Read,
      uri: URI.file("/etc/foo")
    });
    permissionService.pending.set([request], void 0);
    permissionService.pending.set([], void 0);
    assert.deepStrictEqual(
      notificationService.deleteCalls,
      ["agentHost.permissionRequest"]
    );
  });
  test('write-mode requests use a "wants to write" message', () => {
    createContribution();
    permissionService.pending.set([
      makePending({
        address: "host:1234",
        mode: AgentHostPermissionMode.Write,
        uri: URI.file("/etc/foo")
      })
    ], void 0);
    const text = notificationService.setCalls[0].message;
    const value = isMarkdownString(text) ? text.value : text;
    assert.match(value, /wants to write/);
    assert.match(value, /My Host/);
  });
  test('read-mode requests use a "wants to read" message', () => {
    createContribution();
    permissionService.pending.set([
      makePending({
        address: "host:1234",
        mode: AgentHostPermissionMode.Read,
        uri: URI.file("/etc/foo")
      })
    ], void 0);
    const text = notificationService.setCalls[0].message;
    const value = isMarkdownString(text) ? text.value : text;
    assert.match(value, /wants to read/);
  });
  test("paths are wrapped in a markdown code span using a fence longer than any embedded backticks", () => {
    createContribution();
    const uri = URI.file("/weird/`name`.txt");
    permissionService.pending.set([
      makePending({ address: "host:1234", mode: AgentHostPermissionMode.Read, uri })
    ], void 0);
    const text = notificationService.setCalls[0].message;
    const value = isMarkdownString(text) ? text.value : text;
    const match = value.match(/(`{2,})([^`]|`(?!\1))*\1/);
    assert.ok(match, `expected a code span fence, got: ${value}`);
    assert.ok(match[0].includes("`name`"), "path with embedded backticks should be inside the fence");
  });
  test("falls back to the raw address when no host entry is known", () => {
    createContribution();
    permissionService.pending.set([
      makePending({
        address: "unknown:9999",
        mode: AgentHostPermissionMode.Read,
        uri: URI.file("/etc/foo")
      })
    ], void 0);
    const text = notificationService.setCalls[0].message;
    const value = isMarkdownString(text) ? text.value : text;
    assert.match(value, /unknown:9999/);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0UGVybWlzc2lvblVpQ29udHJpYnV0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBpc01hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIElTZXR0YWJsZU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHtcblx0QWdlbnRIb3N0UGVybWlzc2lvbk1vZGUsXG5cdElBZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2UsXG5cdElQZW5kaW5nUmVzb3VyY2VSZXF1ZXN0LFxufSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFJlc291cmNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBR0VOVF9IT1NUX1NDSEVNRSwgYWdlbnRIb3N0QXV0aG9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RVcmkuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1vY2tMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9sYWJlbC90ZXN0L2NvbW1vbi9tb2NrTGFiZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFBlcm1pc3Npb25VaUNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0UGVybWlzc2lvblVpQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7XG5cdENoYXRJbnB1dE5vdGlmaWNhdGlvbkFjdGlvbktpbmQsXG5cdElDaGF0SW5wdXROb3RpZmljYXRpb24sXG5cdElDaGF0SW5wdXROb3RpZmljYXRpb25Db21tYW5kQWN0aW9uLFxuXHRJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSxcbn0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvaW5wdXQvY2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZS5qcyc7XG5cbmNsYXNzIEZha2VQZXJtaXNzaW9uU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnRIb3N0UmVzb3VyY2VTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHBlbmRpbmc6IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgSVBlbmRpbmdSZXNvdXJjZVJlcXVlc3RbXT4gPSBvYnNlcnZhYmxlVmFsdWUoJ3BlbmRpbmcnLCBbXSk7XG5cdHJlYWRvbmx5IGFsbFBlbmRpbmc6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElQZW5kaW5nUmVzb3VyY2VSZXF1ZXN0W10+ID0gdGhpcy5wZW5kaW5nO1xuXG5cdGxpc3QgPSBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH07XG5cdHJlYWQgPSBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH07XG5cdHdyaXRlID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9O1xuXHRkZWwgPSBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH07XG5cdG1vdmUgPSBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH07XG5cdGNvcHkgPSBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH07XG5cdHJlc29sdmUgPSBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH07XG5cdG1rZGlyID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9O1xuXHRjaGVjayA9IGFzeW5jICgpID0+IHRydWU7XG5cdHJlcXVlc3QgPSBhc3luYyAoKSA9PiB7IC8qICovIH07XG5cdHBlbmRpbmdGb3IgPSAoKSA9PiB0aGlzLnBlbmRpbmc7XG5cdGZpbmRQZW5kaW5nID0gKGlkOiBzdHJpbmcpID0+IHRoaXMucGVuZGluZy5nZXQoKS5maW5kKHIgPT4gci5pZCA9PT0gaWQpO1xuXHRncmFudEltcGxpY2l0UmVhZCA9ICgpID0+IERpc3Bvc2FibGUuTm9uZTtcblx0Y29ubmVjdGlvbkNsb3NlZCA9ICgpID0+IHsgLyogKi8gfTtcbn1cblxuY2xhc3MgRmFrZU5vdGlmaWNhdGlvblNlcnZpY2UgaW1wbGVtZW50cyBJQ2hhdElucHV0Tm90aWZpY2F0aW9uU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8dm9pZD4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZERpc21pc3M6IEV2ZW50PHN0cmluZz4gPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBzZXRDYWxsczogSUNoYXRJbnB1dE5vdGlmaWNhdGlvbltdID0gW107XG5cdHJlYWRvbmx5IGRlbGV0ZUNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdHNldE5vdGlmaWNhdGlvbihub3RpZmljYXRpb246IElDaGF0SW5wdXROb3RpZmljYXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLnNldENhbGxzLnB1c2gobm90aWZpY2F0aW9uKTtcblx0fVxuXHRkZWxldGVOb3RpZmljYXRpb24oaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuZGVsZXRlQ2FsbHMucHVzaChpZCk7XG5cdH1cblx0ZGlzbWlzc05vdGlmaWNhdGlvbihfaWQ6IHN0cmluZyk6IHZvaWQgeyAvKiAqLyB9XG5cdGdldEFjdGl2ZU5vdGlmaWNhdGlvbigpOiBJQ2hhdElucHV0Tm90aWZpY2F0aW9uIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRoYW5kbGVNZXNzYWdlU2VudCgpOiB2b2lkIHsgLyogKi8gfVxuXHRhbm5vdW5jZVJlbmRlcmVkKCk6IHZvaWQgeyAvKiAqLyB9XG59XG5cbi8qKlxuICogTW9jayBsYWJlbCBzZXJ2aWNlIHRoYXQgcmVzb2x2ZXMgaG9zdCBsYWJlbHMgZm9yIHRoZSB7QGxpbmsgQUdFTlRfSE9TVF9TQ0hFTUV9XG4gKiBieSBtYXBwaW5nIGF1dGhvcml0aWVzIGVuY29kZWQgdmlhIHtAbGluayBhZ2VudEhvc3RBdXRob3JpdHl9IHRvIHRoZVxuICogZnJpZW5kbHkgbmFtZSByZWdpc3RlcmVkIHRocm91Z2gge0BsaW5rIFN0dWJMYWJlbFNlcnZpY2Uuc2V0SG9zdE5hbWV9LlxuICogVW5rbm93biBhdXRob3JpdGllcyBhcmUgcmV0dXJuZWQgdW5jaGFuZ2VkLlxuICovXG5jbGFzcyBTdHViTGFiZWxTZXJ2aWNlIGV4dGVuZHMgTW9ja0xhYmVsU2VydmljZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvc3RMYWJlbHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdHNldEhvc3ROYW1lKGFkZHJlc3M6IHN0cmluZywgbmFtZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5faG9zdExhYmVscy5zZXQoYWdlbnRIb3N0QXV0aG9yaXR5KGFkZHJlc3MpLCBuYW1lKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldEhvc3RMYWJlbChzY2hlbWU6IHN0cmluZywgYXV0aG9yaXR5Pzogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRpZiAoc2NoZW1lID09PSBBR0VOVF9IT1NUX1NDSEVNRSAmJiBhdXRob3JpdHkgJiYgdGhpcy5faG9zdExhYmVscy5oYXMoYXV0aG9yaXR5KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2hvc3RMYWJlbHMuZ2V0KGF1dGhvcml0eSkhO1xuXHRcdH1cblx0XHRyZXR1cm4gYXV0aG9yaXR5ID8/ICcnO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1ha2VQZW5kaW5nKG9wdHM6IHtcblx0YWRkcmVzczogc3RyaW5nO1xuXHRtb2RlOiBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZTtcblx0dXJpOiBVUkk7XG59KTogSVBlbmRpbmdSZXNvdXJjZVJlcXVlc3Qge1xuXHRyZXR1cm4ge1xuXHRcdGlkOiBgcmVxLSR7b3B0cy5hZGRyZXNzfS0ke29wdHMudXJpLnRvU3RyaW5nKCl9YCxcblx0XHRhZGRyZXNzOiBvcHRzLmFkZHJlc3MsXG5cdFx0bW9kZTogb3B0cy5tb2RlLFxuXHRcdHVyaTogb3B0cy51cmksXG5cdFx0YWxsb3c6ICgpID0+IHsgLyogKi8gfSxcblx0XHRhbGxvd0Fsd2F5czogKCkgPT4geyAvKiAqLyB9LFxuXHRcdGRlbnk6ICgpID0+IHsgLyogKi8gfSxcblx0fTtcbn1cblxuc3VpdGUoJ0FnZW50SG9zdFBlcm1pc3Npb25VaUNvbnRyaWJ1dGlvbicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgcGVybWlzc2lvblNlcnZpY2U6IEZha2VQZXJtaXNzaW9uU2VydmljZTtcblx0bGV0IG5vdGlmaWNhdGlvblNlcnZpY2U6IEZha2VOb3RpZmljYXRpb25TZXJ2aWNlO1xuXHRsZXQgbGFiZWxTZXJ2aWNlOiBTdHViTGFiZWxTZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRwZXJtaXNzaW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmFrZVBlcm1pc3Npb25TZXJ2aWNlKCkpO1xuXHRcdG5vdGlmaWNhdGlvblNlcnZpY2UgPSBuZXcgRmFrZU5vdGlmaWNhdGlvblNlcnZpY2UoKTtcblx0XHRsYWJlbFNlcnZpY2UgPSBuZXcgU3R1YkxhYmVsU2VydmljZSgpO1xuXHRcdGxhYmVsU2VydmljZS5zZXRIb3N0TmFtZSgnaG9zdDoxMjM0JywgJ015IEhvc3QnKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlQ29udHJpYnV0aW9uKCk6IEFnZW50SG9zdFBlcm1pc3Npb25VaUNvbnRyaWJ1dGlvbiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RSZXNvdXJjZVNlcnZpY2UsIHBlcm1pc3Npb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0SW5wdXROb3RpZmljYXRpb25TZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYWJlbFNlcnZpY2UsIGxhYmVsU2VydmljZSk7XG5cdFx0Y29uc3QgY29udHJpYnV0aW9uID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQWdlbnRIb3N0UGVybWlzc2lvblVpQ29udHJpYnV0aW9uKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29udHJpYnV0aW9uIGFzIHVua25vd24gYXMgSURpc3Bvc2FibGUpO1xuXHRcdHJldHVybiBjb250cmlidXRpb247XG5cdH1cblxuXHR0ZXN0KCdyZW5kZXJzIGEgbWFya2Rvd24gbm90aWZpY2F0aW9uIHdpdGggdGhyZWUgYWN0aW9ucyB3aGVuIGEgcmVxdWVzdCBhcnJpdmVzJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyaWJ1dGlvbigpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtYWtlUGVuZGluZyh7XG5cdFx0XHRhZGRyZXNzOiAnaG9zdDoxMjM0Jyxcblx0XHRcdG1vZGU6IEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQsXG5cdFx0XHR1cmk6IFVSSS5maWxlKCcvVXNlcnMvbWUvLmdpdGNvbmZpZycpLFxuXHRcdH0pO1xuXG5cdFx0cGVybWlzc2lvblNlcnZpY2UucGVuZGluZy5zZXQoW3JlcXVlc3RdLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0Q2FsbHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBub3RpZmljYXRpb24gPSBub3RpZmljYXRpb25TZXJ2aWNlLnNldENhbGxzWzBdO1xuXHRcdGFzc2VydC5vayhpc01hcmtkb3duU3RyaW5nKG5vdGlmaWNhdGlvbi5tZXNzYWdlKSwgJ21lc3NhZ2Ugc2hvdWxkIGJlIGFuIElNYXJrZG93blN0cmluZycpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBub3RpZmljYXRpb24uYWN0aW9ucy5maWx0ZXIoKGFjdGlvbik6IGFjdGlvbiBpcyBJQ2hhdElucHV0Tm90aWZpY2F0aW9uQ29tbWFuZEFjdGlvbiA9PiBhY3Rpb24ua2luZCA9PT0gQ2hhdElucHV0Tm90aWZpY2F0aW9uQWN0aW9uS2luZC5Db21tYW5kKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIG5vdGlmaWNhdGlvbi5hY3Rpb25zLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0YWN0aW9ucy5tYXAoYWN0aW9uID0+IGFjdGlvbi5jb21tYW5kSWQpLmpvaW4oJywnKSxcblx0XHRcdCdfYWdlbnRIb3N0LnBlcm1pc3Npb24uZGVueSxfYWdlbnRIb3N0LnBlcm1pc3Npb24uYWxsb3csX2FnZW50SG9zdC5wZXJtaXNzaW9uLmFsbG93QWx3YXlzJyxcblx0XHQpO1xuXHRcdGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9uLmNvbW1hbmRBcmdzLCBbcmVxdWVzdC5pZF0sICdlYWNoIGFjdGlvbiBjYXJyaWVzIHRoZSByZXF1ZXN0IGlkJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdjbGVhcnMgdGhlIG5vdGlmaWNhdGlvbiB3aGVuIHRoZSBxdWV1ZSBlbXB0aWVzJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyaWJ1dGlvbigpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBtYWtlUGVuZGluZyh7XG5cdFx0XHRhZGRyZXNzOiAnaG9zdDoxMjM0Jyxcblx0XHRcdG1vZGU6IEFnZW50SG9zdFBlcm1pc3Npb25Nb2RlLlJlYWQsXG5cdFx0XHR1cmk6IFVSSS5maWxlKCcvZXRjL2ZvbycpLFxuXHRcdH0pO1xuXHRcdHBlcm1pc3Npb25TZXJ2aWNlLnBlbmRpbmcuc2V0KFtyZXF1ZXN0XSwgdW5kZWZpbmVkKTtcblxuXHRcdHBlcm1pc3Npb25TZXJ2aWNlLnBlbmRpbmcuc2V0KFtdLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdG5vdGlmaWNhdGlvblNlcnZpY2UuZGVsZXRlQ2FsbHMsXG5cdFx0XHRbJ2FnZW50SG9zdC5wZXJtaXNzaW9uUmVxdWVzdCddLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlLW1vZGUgcmVxdWVzdHMgdXNlIGEgXCJ3YW50cyB0byB3cml0ZVwiIG1lc3NhZ2UnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJpYnV0aW9uKCk7XG5cdFx0cGVybWlzc2lvblNlcnZpY2UucGVuZGluZy5zZXQoW1xuXHRcdFx0bWFrZVBlbmRpbmcoe1xuXHRcdFx0XHRhZGRyZXNzOiAnaG9zdDoxMjM0Jyxcblx0XHRcdFx0bW9kZTogQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuV3JpdGUsXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9ldGMvZm9vJyksXG5cdFx0XHR9KSxcblx0XHRdLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgdGV4dCA9IG5vdGlmaWNhdGlvblNlcnZpY2Uuc2V0Q2FsbHNbMF0ubWVzc2FnZTtcblx0XHRjb25zdCB2YWx1ZSA9IGlzTWFya2Rvd25TdHJpbmcodGV4dCkgPyB0ZXh0LnZhbHVlIDogdGV4dDtcblx0XHRhc3NlcnQubWF0Y2godmFsdWUsIC93YW50cyB0byB3cml0ZS8pO1xuXHRcdGFzc2VydC5tYXRjaCh2YWx1ZSwgL015IEhvc3QvKTtcblx0fSk7XG5cblx0dGVzdCgncmVhZC1tb2RlIHJlcXVlc3RzIHVzZSBhIFwid2FudHMgdG8gcmVhZFwiIG1lc3NhZ2UnLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJpYnV0aW9uKCk7XG5cdFx0cGVybWlzc2lvblNlcnZpY2UucGVuZGluZy5zZXQoW1xuXHRcdFx0bWFrZVBlbmRpbmcoe1xuXHRcdFx0XHRhZGRyZXNzOiAnaG9zdDoxMjM0Jyxcblx0XHRcdFx0bW9kZTogQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCxcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL2V0Yy9mb28nKSxcblx0XHRcdH0pLFxuXHRcdF0sIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCB0ZXh0ID0gbm90aWZpY2F0aW9uU2VydmljZS5zZXRDYWxsc1swXS5tZXNzYWdlO1xuXHRcdGNvbnN0IHZhbHVlID0gaXNNYXJrZG93blN0cmluZyh0ZXh0KSA/IHRleHQudmFsdWUgOiB0ZXh0O1xuXHRcdGFzc2VydC5tYXRjaCh2YWx1ZSwgL3dhbnRzIHRvIHJlYWQvKTtcblx0fSk7XG5cblx0dGVzdCgncGF0aHMgYXJlIHdyYXBwZWQgaW4gYSBtYXJrZG93biBjb2RlIHNwYW4gdXNpbmcgYSBmZW5jZSBsb25nZXIgdGhhbiBhbnkgZW1iZWRkZWQgYmFja3RpY2tzJywgKCkgPT4ge1xuXHRcdGNyZWF0ZUNvbnRyaWJ1dGlvbigpO1xuXHRcdC8vIFBhdGggY29udGFpbmluZyBhIHNpbmdsZSBiYWNrdGljayBcdTIwMTQgdGhlIGZlbmNlIG11c3QgYmUgYXQgbGVhc3Rcblx0XHQvLyB0d28gYmFja3RpY2tzIHNvIHRoZSBlbWJlZGRlZCBvbmUgZG9lc24ndCBjbG9zZSB0aGUgc3Bhbi5cblx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dlaXJkL2BuYW1lYC50eHQnKTtcblx0XHRwZXJtaXNzaW9uU2VydmljZS5wZW5kaW5nLnNldChbXG5cdFx0XHRtYWtlUGVuZGluZyh7IGFkZHJlc3M6ICdob3N0OjEyMzQnLCBtb2RlOiBBZ2VudEhvc3RQZXJtaXNzaW9uTW9kZS5SZWFkLCB1cmkgfSksXG5cdFx0XSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IHRleHQgPSBub3RpZmljYXRpb25TZXJ2aWNlLnNldENhbGxzWzBdLm1lc3NhZ2U7XG5cdFx0Y29uc3QgdmFsdWUgPSBpc01hcmtkb3duU3RyaW5nKHRleHQpID8gdGV4dC52YWx1ZSA6IHRleHQ7XG5cdFx0Ly8gRmluZCB0aGUgb3BlbmluZyBmZW5jZTsgaXQgbXVzdCBiZSBcdTIyNjUyIGJhY2t0aWNrcyBhbmQgdGhlIHBhdGggbXVzdCBmb2xsb3cgaXQuXG5cdFx0Y29uc3QgbWF0Y2ggPSB2YWx1ZS5tYXRjaCgvKGB7Mix9KShbXmBdfGAoPyFcXDEpKSpcXDEvKTtcblx0XHRhc3NlcnQub2sobWF0Y2gsIGBleHBlY3RlZCBhIGNvZGUgc3BhbiBmZW5jZSwgZ290OiAke3ZhbHVlfWApO1xuXHRcdGFzc2VydC5vayhtYXRjaCFbMF0uaW5jbHVkZXMoJ2BuYW1lYCcpLCAncGF0aCB3aXRoIGVtYmVkZGVkIGJhY2t0aWNrcyBzaG91bGQgYmUgaW5zaWRlIHRoZSBmZW5jZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWxscyBiYWNrIHRvIHRoZSByYXcgYWRkcmVzcyB3aGVuIG5vIGhvc3QgZW50cnkgaXMga25vd24nLCAoKSA9PiB7XG5cdFx0Y3JlYXRlQ29udHJpYnV0aW9uKCk7XG5cdFx0cGVybWlzc2lvblNlcnZpY2UucGVuZGluZy5zZXQoW1xuXHRcdFx0bWFrZVBlbmRpbmcoe1xuXHRcdFx0XHRhZGRyZXNzOiAndW5rbm93bjo5OTk5Jyxcblx0XHRcdFx0bW9kZTogQWdlbnRIb3N0UGVybWlzc2lvbk1vZGUuUmVhZCxcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL2V0Yy9mb28nKSxcblx0XHRcdH0pLFxuXHRcdF0sIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCB0ZXh0ID0gbm90aWZpY2F0aW9uU2VydmljZS5zZXRDYWxsc1swXS5tZXNzYWdlO1xuXHRcdGNvbnN0IHZhbHVlID0gaXNNYXJrZG93blN0cmluZyh0ZXh0KSA/IHRleHQudmFsdWUgOiB0ZXh0O1xuXHRcdGFzc2VydC5tYXRjaCh2YWx1ZSwgL3Vua25vd246OTk5OS8pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsa0JBQStCO0FBQ3hDLFNBQTJDLHVCQUF1QjtBQUNsRSxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQ7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLE9BRU07QUFDUCxTQUFTLG1CQUFtQiwwQkFBMEI7QUFDdEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMseUNBQXlDO0FBQ2xEO0FBQUEsRUFDQztBQUFBLEVBR0E7QUFBQSxPQUNNO0FBRVAsTUFBTSw4QkFBOEIsV0FBZ0Q7QUFBQSxFQUFwRjtBQUFBO0FBRUMsU0FBUyxVQUFtRSxnQkFBZ0IsV0FBVyxDQUFDLENBQUM7QUFDekcsU0FBUyxhQUE4RCxLQUFLO0FBRTVFLGdCQUFPLFlBQVk7QUFBRSxZQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxJQUFHO0FBQ3pELGdCQUFPLFlBQVk7QUFBRSxZQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxJQUFHO0FBQ3pELGlCQUFRLFlBQVk7QUFBRSxZQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxJQUFHO0FBQzFELGVBQU0sWUFBWTtBQUFFLFlBQU0sSUFB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
