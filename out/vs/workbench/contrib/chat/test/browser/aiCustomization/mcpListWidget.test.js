import assert from "assert";
import * as DOM from "../../../../../../base/browser/dom.js";
import { Button, unthemedButtonStyles } from "../../../../../../base/browser/ui/button/button.js";
import { URI } from "../../../../../../base/common/uri.js";
import { Separator } from "../../../../../../base/common/actions.js";
import { isDisposable } from "../../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { McpServerStatus } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { ContributionEnablementState } from "../../../common/enablement.js";
import {
  authenticateMcpServer,
  getActiveSessionServerOptionsActions,
  getAgentHostMcpServerEnablementActions,
  getLocalMcpServerEnablementActions,
  getMcpServerOutputHandler,
  getSessionEnablementAction,
  registerMcpInlineButtonAction
} from "../../../browser/aiCustomization/mcpListWidget.js";
function createAgentHostServer(overrides = {}) {
  return {
    id: "server-1",
    name: "Server One",
    enabled: true,
    status: McpServerStatus.Ready,
    state: { kind: McpServerStatus.Ready },
    setEnabled: () => {
    },
    start: () => {
    },
    stop: () => {
    },
    ...overrides
  };
}
function createAgentHostCustomizations(enablement) {
  const calls = [];
  const service = {
    getMcpServerEnablement: () => enablement,
    setMcpServerEnablement: (sessionResource, serverName, state) => {
      calls.push([sessionResource, serverName, state]);
    }
  };
  return { service, calls };
}
function createMcpService(enablement) {
  const calls = [];
  const service = {
    enablementModel: {
      readEnabled: () => enablement,
      setEnabled: (key, state) => {
        calls.push([key, state]);
      }
    }
  };
  return { service, calls };
}
function runAction(action) {
  assert.ok(action, "expected an action to be defined");
  void action.run();
}
function trackActions(store, actions) {
  for (const action of actions) {
    if (isDisposable(action)) {
      store.add(action);
    }
  }
  return [...actions];
}
suite("mcpListWidget", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  suite("getSessionEnablementAction", () => {
    test("labels as Disable (Session) when the server is enabled and toggles it off", () => {
      let toggledTo;
      const server = createAgentHostServer({ enabled: true, setEnabled: (v) => {
        toggledTo = v;
      } });
      const [action] = trackActions(disposables, [getSessionEnablementAction(server)]);
      assert.strictEqual(action.label, "Disable (Session)");
      runAction(action);
      assert.strictEqual(toggledTo, false);
    });
    test("labels as Enable (Session) when the server is disabled and toggles it on", () => {
      let toggledTo;
      const server = createAgentHostServer({ enabled: false, setEnabled: (v) => {
        toggledTo = v;
      } });
      const [action] = trackActions(disposables, [getSessionEnablementAction(server)]);
      assert.strictEqual(action.label, "Enable (Session)");
      runAction(action);
      assert.strictEqual(toggledTo, true);
    });
  });
  suite("getAgentHostMcpServerEnablementActions", () => {
    const sessionResource = URI.parse("vscode-agent-session:///session-1");
    test("offers Enable + Enable (Workspace) when disabled and workbench has a workspace", () => {
      const { service, calls } = createAgentHostCustomizations(ContributionEnablementState.DisabledProfile);
      const server = createAgentHostServer();
      const actions = trackActions(disposables, getAgentHostMcpServerEnablementActions(service, sessionResource, server, false));
      assert.deepStrictEqual(actions.map((a) => a.label), ["Enable", "Enable (Workspace)"]);
      runAction(actions[1]);
      assert.deepStrictEqual(calls, [[sessionResource, server.name, ContributionEnablementState.EnabledWorkspace]]);
    });
    test("offers only Disable when enabled and workbench is empty", () => {
      const { service } = createAgentHostCustomizations(ContributionEnablementState.EnabledProfile);
      const server = createAgentHostServer();
      const actions = trackActions(disposables, getAgentHostMcpServerEnablementActions(service, sessionResource, server, true));
      assert.deepStrictEqual(actions.map((a) => a.label), ["Disable"]);
    });
  });
  suite("getLocalMcpServerEnablementActions", () => {
    test("offers Disable + Disable (Workspace) when enabled and workbench has a workspace", () => {
      const { service, calls } = createMcpService(ContributionEnablementState.EnabledProfile);
      const actions = trackActions(disposables, getLocalMcpServerEnablementActions(service, "server-def-id", false));
      assert.deepStrictEqual(actions.map((a) => a.label), ["Disable", "Disable (Workspace)"]);
      runAction(actions[0]);
      assert.deepStrictEqual(calls, [["server-def-id", ContributionEnablementState.DisabledProfile]]);
    });
    test("omits the workspace variant in an empty workbench", () => {
      const { service } = createMcpService(ContributionEnablementState.DisabledProfile);
      const actions = trackActions(disposables, getLocalMcpServerEnablementActions(service, "server-def-id", true));
      assert.deepStrictEqual(actions.map((a) => a.label), ["Enable"]);
    });
  });
  suite("getActiveSessionServerOptionsActions", () => {
    test("composes lifecycle, durable, session, and options actions without duplicating groups", () => {
      const { service } = createAgentHostCustomizations(ContributionEnablementState.EnabledProfile);
      const server = createAgentHostServer({ enabled: true, status: McpServerStatus.Ready });
      const sessionResource = URI.parse("vscode-agent-session:///session-1");
      const commandService = { executeCommand: async () => void 0 };
      const actions = trackActions(disposables, getActiveSessionServerOptionsActions(
        commandService,
        service,
        false,
        sessionResource,
        server
      ));
      const labels = actions.map((a) => a instanceof Separator ? "(separator)" : a.label);
      assert.deepStrictEqual(labels, [
        "Stop Server",
        "(separator)",
        "Disable",
        "Disable (Workspace)",
        "Disable (Session)",
        "(separator)",
        "Server Options"
      ]);
    });
  });
  suite("inline actions", () => {
    test("authentication receives the active session and server without opening the row", () => {
      const sessionResource = URI.parse("vscode-agent-session:///session-1");
      const calls = [];
      const service = {
        authenticateMcpServer: (resource, serverId) => {
          calls.push([resource, serverId]);
          return Promise.resolve(true);
        }
      };
      const row = document.createElement("div");
      let rowPointerDowns = 0;
      let rowClicks = 0;
      disposables.add(DOM.addDisposableGenericMouseDownListener(row, () => rowPointerDowns++));
      disposables.add(DOM.addDisposableListener(row, DOM.EventType.CLICK, () => rowClicks++));
      const button = disposables.add(new Button(row, unthemedButtonStyles));
      registerMcpInlineButtonAction(disposables, button, async () => {
        await authenticateMcpServer(service, sessionResource, "server-1");
      });
      button.element.dispatchEvent(new MouseEvent(DOM.EventType.MOUSE_DOWN, { bubbles: true }));
      button.element.click();
      assert.deepStrictEqual({
        calls,
        rowPointerDowns,
        rowClicks
      }, {
        calls: [[sessionResource, "server-1"]],
        rowPointerDowns: 0,
        rowClicks: 0
      });
    });
    test("active-session error registers the channel, closes the editor, then opens output", async () => {
      const shownChannels = [];
      let localOutputCount = 0;
      const actions = [];
      const outputHandler = getMcpServerOutputHandler(
        {
          showChannel: async (channelId) => {
            actions.push("show-output");
            shownChannels.push(channelId);
          }
        },
        { showOutput: async () => {
          localOutputCount++;
        } },
        createAgentHostServer({ logOutputChannelId: "agent-host-output" }),
        async () => {
          actions.push("close-editor");
        },
        async (beforeShow) => {
          actions.push("register-agent-host-output");
          await beforeShow?.();
          actions.push("show-agent-host-output");
        }
      );
      assert.ok(outputHandler);
      await outputHandler();
      assert.deepStrictEqual({
        shownChannels,
        localOutputCount,
        actions
      }, {
        shownChannels: [],
        localOutputCount: 0,
        actions: ["register-agent-host-output", "close-editor", "show-agent-host-output"]
      });
    });
    test("local error opens local output when no agent-host output exists", async () => {
      const shownChannels = [];
      let localOutputCount = 0;
      const outputHandler = getMcpServerOutputHandler(
        { showChannel: async (channelId) => {
          shownChannels.push(channelId);
        } },
        { showOutput: async () => {
          localOutputCount++;
        } },
        void 0
      );
      await outputHandler?.();
      assert.deepStrictEqual({
        shownChannels,
        localOutputCount
      }, {
        shownChannels: [],
        localOutputCount: 1
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9tY3BMaXN0V2lkZ2V0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBCdXR0b24sIHVudGhlbWVkQnV0dG9uU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElBY3Rpb24sIFNlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBpc0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBNY3BTZXJ2ZXJTdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lbmFibGVtZW50LmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q3VzdG9taXphdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRIb3N0L2FnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNY3BTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BUeXBlcy5qcyc7XG5pbXBvcnQge1xuXHRBZ2VudEhvc3RNY3BTZXJ2ZXIsXG5cdGF1dGhlbnRpY2F0ZU1jcFNlcnZlcixcblx0Z2V0QWN0aXZlU2Vzc2lvblNlcnZlck9wdGlvbnNBY3Rpb25zLFxuXHRnZXRBZ2VudEhvc3RNY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9ucyxcblx0Z2V0TG9jYWxNY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9ucyxcblx0Z2V0TWNwU2VydmVyT3V0cHV0SGFuZGxlcixcblx0Z2V0U2Vzc2lvbkVuYWJsZW1lbnRBY3Rpb24sXG5cdHJlZ2lzdGVyTWNwSW5saW5lQnV0dG9uQWN0aW9uLFxufSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9tY3BMaXN0V2lkZ2V0LmpzJztcblxuZnVuY3Rpb24gY3JlYXRlQWdlbnRIb3N0U2VydmVyKG92ZXJyaWRlczogUGFydGlhbDxBZ2VudEhvc3RNY3BTZXJ2ZXI+ID0ge30pOiBBZ2VudEhvc3RNY3BTZXJ2ZXIge1xuXHRyZXR1cm4ge1xuXHRcdGlkOiAnc2VydmVyLTEnLFxuXHRcdG5hbWU6ICdTZXJ2ZXIgT25lJyxcblx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdHN0YXR1czogTWNwU2VydmVyU3RhdHVzLlJlYWR5LFxuXHRcdHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5SZWFkeSB9LFxuXHRcdHNldEVuYWJsZWQ6ICgpID0+IHsgfSxcblx0XHRzdGFydDogKCkgPT4geyB9LFxuXHRcdHN0b3A6ICgpID0+IHsgfSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH0gYXMgQWdlbnRIb3N0TWNwU2VydmVyO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVBZ2VudEhvc3RDdXN0b21pemF0aW9ucyhlbmFibGVtZW50OiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUpOiB7IHNlcnZpY2U6IElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZTsgY2FsbHM6IFtVUkksIHN0cmluZywgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlXVtdIH0ge1xuXHRjb25zdCBjYWxsczogW1VSSSwgc3RyaW5nLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGVdW10gPSBbXTtcblx0Y29uc3Qgc2VydmljZSA9IHtcblx0XHRnZXRNY3BTZXJ2ZXJFbmFibGVtZW50OiAoKSA9PiBlbmFibGVtZW50LFxuXHRcdHNldE1jcFNlcnZlckVuYWJsZW1lbnQ6IChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgc2VydmVyTmFtZTogc3RyaW5nLCBzdGF0ZTogQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlKSA9PiB7XG5cdFx0XHRjYWxscy5wdXNoKFtzZXNzaW9uUmVzb3VyY2UsIHNlcnZlck5hbWUsIHN0YXRlXSk7XG5cdFx0fSxcblx0fSBhcyB1bmtub3duIGFzIElBZ2VudEhvc3RDdXN0b21pemF0aW9uU2VydmljZTtcblx0cmV0dXJuIHsgc2VydmljZSwgY2FsbHMgfTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTWNwU2VydmljZShlbmFibGVtZW50OiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUpOiB7IHNlcnZpY2U6IElNY3BTZXJ2aWNlOyBjYWxsczogW3N0cmluZywgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlXVtdIH0ge1xuXHRjb25zdCBjYWxsczogW3N0cmluZywgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlXVtdID0gW107XG5cdGNvbnN0IHNlcnZpY2UgPSB7XG5cdFx0ZW5hYmxlbWVudE1vZGVsOiB7XG5cdFx0XHRyZWFkRW5hYmxlZDogKCkgPT4gZW5hYmxlbWVudCxcblx0XHRcdHNldEVuYWJsZWQ6IChrZXk6IHN0cmluZywgc3RhdGU6IENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZSkgPT4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKFtrZXksIHN0YXRlXSk7XG5cdFx0XHR9LFxuXHRcdH0sXG5cdH0gYXMgdW5rbm93biBhcyBJTWNwU2VydmljZTtcblx0cmV0dXJuIHsgc2VydmljZSwgY2FsbHMgfTtcbn1cblxuZnVuY3Rpb24gcnVuQWN0aW9uKGFjdGlvbjogSUFjdGlvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRhc3NlcnQub2soYWN0aW9uLCAnZXhwZWN0ZWQgYW4gYWN0aW9uIHRvIGJlIGRlZmluZWQnKTtcblx0dm9pZCBhY3Rpb24ucnVuKCk7XG59XG5cbmZ1bmN0aW9uIHRyYWNrQWN0aW9ucyhzdG9yZTogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPiwgYWN0aW9uczogcmVhZG9ubHkgSUFjdGlvbltdKTogSUFjdGlvbltdIHtcblx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdGlmIChpc0Rpc3Bvc2FibGUoYWN0aW9uKSkge1xuXHRcdFx0c3RvcmUuYWRkKGFjdGlvbik7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBbLi4uYWN0aW9uc107XG59XG5cbnN1aXRlKCdtY3BMaXN0V2lkZ2V0JywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdnZXRTZXNzaW9uRW5hYmxlbWVudEFjdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdsYWJlbHMgYXMgRGlzYWJsZSAoU2Vzc2lvbikgd2hlbiB0aGUgc2VydmVyIGlzIGVuYWJsZWQgYW5kIHRvZ2dsZXMgaXQgb2ZmJywgKCkgPT4ge1xuXHRcdFx0bGV0IHRvZ2dsZWRUbzogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHNlcnZlciA9IGNyZWF0ZUFnZW50SG9zdFNlcnZlcih7IGVuYWJsZWQ6IHRydWUsIHNldEVuYWJsZWQ6ICh2OiBib29sZWFuKSA9PiB7IHRvZ2dsZWRUbyA9IHY7IH0gfSk7XG5cdFx0XHRjb25zdCBbYWN0aW9uXSA9IHRyYWNrQWN0aW9ucyhkaXNwb3NhYmxlcywgW2dldFNlc3Npb25FbmFibGVtZW50QWN0aW9uKHNlcnZlcildKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb24ubGFiZWwsICdEaXNhYmxlIChTZXNzaW9uKScpO1xuXHRcdFx0cnVuQWN0aW9uKGFjdGlvbik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9nZ2xlZFRvLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsYWJlbHMgYXMgRW5hYmxlIChTZXNzaW9uKSB3aGVuIHRoZSBzZXJ2ZXIgaXMgZGlzYWJsZWQgYW5kIHRvZ2dsZXMgaXQgb24nLCAoKSA9PiB7XG5cdFx0XHRsZXQgdG9nZ2xlZFRvOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3Qgc2VydmVyID0gY3JlYXRlQWdlbnRIb3N0U2VydmVyKHsgZW5hYmxlZDogZmFsc2UsIHNldEVuYWJsZWQ6ICh2OiBib29sZWFuKSA9PiB7IHRvZ2dsZWRUbyA9IHY7IH0gfSk7XG5cdFx0XHRjb25zdCBbYWN0aW9uXSA9IHRyYWNrQWN0aW9ucyhkaXNwb3NhYmxlcywgW2dldFNlc3Npb25FbmFibGVtZW50QWN0aW9uKHNlcnZlcildKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb24ubGFiZWwsICdFbmFibGUgKFNlc3Npb24pJyk7XG5cdFx0XHRydW5BY3Rpb24oYWN0aW9uKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b2dnbGVkVG8sIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0QWdlbnRIb3N0TWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCd2c2NvZGUtYWdlbnQtc2Vzc2lvbjovLy9zZXNzaW9uLTEnKTtcblxuXHRcdHRlc3QoJ29mZmVycyBFbmFibGUgKyBFbmFibGUgKFdvcmtzcGFjZSkgd2hlbiBkaXNhYmxlZCBhbmQgd29ya2JlbmNoIGhhcyBhIHdvcmtzcGFjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgY2FsbHMgfSA9IGNyZWF0ZUFnZW50SG9zdEN1c3RvbWl6YXRpb25zKENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5EaXNhYmxlZFByb2ZpbGUpO1xuXHRcdFx0Y29uc3Qgc2VydmVyID0gY3JlYXRlQWdlbnRIb3N0U2VydmVyKCk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gdHJhY2tBY3Rpb25zKGRpc3Bvc2FibGVzLCBnZXRBZ2VudEhvc3RNY3BTZXJ2ZXJFbmFibGVtZW50QWN0aW9ucyhzZXJ2aWNlLCBzZXNzaW9uUmVzb3VyY2UsIHNlcnZlciwgZmFsc2UpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucy5tYXAoYSA9PiBhLmxhYmVsKSwgWydFbmFibGUnLCAnRW5hYmxlIChXb3Jrc3BhY2UpJ10pO1xuXHRcdFx0cnVuQWN0aW9uKGFjdGlvbnNbMV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYWxscywgW1tzZXNzaW9uUmVzb3VyY2UsIHNlcnZlci5uYW1lLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFdvcmtzcGFjZV1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29mZmVycyBvbmx5IERpc2FibGUgd2hlbiBlbmFibGVkIGFuZCB3b3JrYmVuY2ggaXMgZW1wdHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZUFnZW50SG9zdEN1c3RvbWl6YXRpb25zKENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSk7XG5cdFx0XHRjb25zdCBzZXJ2ZXIgPSBjcmVhdGVBZ2VudEhvc3RTZXJ2ZXIoKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSB0cmFja0FjdGlvbnMoZGlzcG9zYWJsZXMsIGdldEFnZW50SG9zdE1jcFNlcnZlckVuYWJsZW1lbnRBY3Rpb25zKHNlcnZpY2UsIHNlc3Npb25SZXNvdXJjZSwgc2VydmVyLCB0cnVlKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMubWFwKGEgPT4gYS5sYWJlbCksIFsnRGlzYWJsZSddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldExvY2FsTWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnb2ZmZXJzIERpc2FibGUgKyBEaXNhYmxlIChXb3Jrc3BhY2UpIHdoZW4gZW5hYmxlZCBhbmQgd29ya2JlbmNoIGhhcyBhIHdvcmtzcGFjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSwgY2FsbHMgfSA9IGNyZWF0ZU1jcFNlcnZpY2UoQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSB0cmFja0FjdGlvbnMoZGlzcG9zYWJsZXMsIGdldExvY2FsTWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMoc2VydmljZSwgJ3NlcnZlci1kZWYtaWQnLCBmYWxzZSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLm1hcChhID0+IGEubGFiZWwpLCBbJ0Rpc2FibGUnLCAnRGlzYWJsZSAoV29ya3NwYWNlKSddKTtcblx0XHRcdHJ1bkFjdGlvbihhY3Rpb25zWzBdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFtbJ3NlcnZlci1kZWYtaWQnLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRQcm9maWxlXV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb21pdHMgdGhlIHdvcmtzcGFjZSB2YXJpYW50IGluIGFuIGVtcHR5IHdvcmtiZW5jaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlTWNwU2VydmljZShDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRGlzYWJsZWRQcm9maWxlKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSB0cmFja0FjdGlvbnMoZGlzcG9zYWJsZXMsIGdldExvY2FsTWNwU2VydmVyRW5hYmxlbWVudEFjdGlvbnMoc2VydmljZSwgJ3NlcnZlci1kZWYtaWQnLCB0cnVlKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMubWFwKGEgPT4gYS5sYWJlbCksIFsnRW5hYmxlJ10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0QWN0aXZlU2Vzc2lvblNlcnZlck9wdGlvbnNBY3Rpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2NvbXBvc2VzIGxpZmVjeWNsZSwgZHVyYWJsZSwgc2Vzc2lvbiwgYW5kIG9wdGlvbnMgYWN0aW9ucyB3aXRob3V0IGR1cGxpY2F0aW5nIGdyb3VwcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlQWdlbnRIb3N0Q3VzdG9taXphdGlvbnMoQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlLkVuYWJsZWRQcm9maWxlKTtcblx0XHRcdGNvbnN0IHNlcnZlciA9IGNyZWF0ZUFnZW50SG9zdFNlcnZlcih7IGVuYWJsZWQ6IHRydWUsIHN0YXR1czogTWNwU2VydmVyU3RhdHVzLlJlYWR5IH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCd2c2NvZGUtYWdlbnQtc2Vzc2lvbjovLy9zZXNzaW9uLTEnKTtcblx0XHRcdGNvbnN0IGNvbW1hbmRTZXJ2aWNlID0geyBleGVjdXRlQ29tbWFuZDogYXN5bmMgKCkgPT4gdW5kZWZpbmVkIH0gYXMgdW5rbm93biBhcyBJQ29tbWFuZFNlcnZpY2U7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gdHJhY2tBY3Rpb25zKGRpc3Bvc2FibGVzLCBnZXRBY3RpdmVTZXNzaW9uU2VydmVyT3B0aW9uc0FjdGlvbnMoXG5cdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLFxuXHRcdFx0XHRzZXJ2aWNlLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRzZXJ2ZXIsXG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgbGFiZWxzID0gYWN0aW9ucy5tYXAoYSA9PiBhIGluc3RhbmNlb2YgU2VwYXJhdG9yID8gJyhzZXBhcmF0b3IpJyA6IGEubGFiZWwpO1xuXHRcdFx0Ly8gU3RvcCBTZXJ2ZXIgKGxpZmVjeWNsZSkgLT4gc2VwYXJhdG9yIC0+IHByb2ZpbGUvd29ya3NwYWNlL3Nlc3Npb24gZW5hYmxlbWVudCAtPiBzZXBhcmF0b3IgLT4gU2VydmVyIE9wdGlvbnNcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGFiZWxzLCBbXG5cdFx0XHRcdCdTdG9wIFNlcnZlcicsXG5cdFx0XHRcdCcoc2VwYXJhdG9yKScsXG5cdFx0XHRcdCdEaXNhYmxlJyxcblx0XHRcdFx0J0Rpc2FibGUgKFdvcmtzcGFjZSknLFxuXHRcdFx0XHQnRGlzYWJsZSAoU2Vzc2lvbiknLFxuXHRcdFx0XHQnKHNlcGFyYXRvciknLFxuXHRcdFx0XHQnU2VydmVyIE9wdGlvbnMnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpbmxpbmUgYWN0aW9ucycsICgpID0+IHtcblx0XHR0ZXN0KCdhdXRoZW50aWNhdGlvbiByZWNlaXZlcyB0aGUgYWN0aXZlIHNlc3Npb24gYW5kIHNlcnZlciB3aXRob3V0IG9wZW5pbmcgdGhlIHJvdycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgndnNjb2RlLWFnZW50LXNlc3Npb246Ly8vc2Vzc2lvbi0xJyk7XG5cdFx0XHRjb25zdCBjYWxsczogW1VSSSwgc3RyaW5nXVtdID0gW107XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0ge1xuXHRcdFx0XHRhdXRoZW50aWNhdGVNY3BTZXJ2ZXI6IChyZXNvdXJjZTogVVJJLCBzZXJ2ZXJJZDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0Y2FsbHMucHVzaChbcmVzb3VyY2UsIHNlcnZlcklkXSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRcdFx0fSxcblx0XHRcdH0gYXMgSUFnZW50SG9zdEN1c3RvbWl6YXRpb25TZXJ2aWNlO1xuXHRcdFx0Y29uc3Qgcm93ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRsZXQgcm93UG9pbnRlckRvd25zID0gMDtcblx0XHRcdGxldCByb3dDbGlja3MgPSAwO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlRG93bkxpc3RlbmVyKHJvdywgKCkgPT4gcm93UG9pbnRlckRvd25zKyspKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHJvdywgRE9NLkV2ZW50VHlwZS5DTElDSywgKCkgPT4gcm93Q2xpY2tzKyspKTtcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKHJvdywgdW50aGVtZWRCdXR0b25TdHlsZXMpKTtcblx0XHRcdHJlZ2lzdGVyTWNwSW5saW5lQnV0dG9uQWN0aW9uKGRpc3Bvc2FibGVzLCBidXR0b24sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgYXV0aGVudGljYXRlTWNwU2VydmVyKHNlcnZpY2UsIHNlc3Npb25SZXNvdXJjZSwgJ3NlcnZlci0xJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YnV0dG9uLmVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudChET00uRXZlbnRUeXBlLk1PVVNFX0RPV04sIHsgYnViYmxlczogdHJ1ZSB9KSk7XG5cdFx0XHRidXR0b24uZWxlbWVudC5jbGljaygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2FsbHMsXG5cdFx0XHRcdHJvd1BvaW50ZXJEb3ducyxcblx0XHRcdFx0cm93Q2xpY2tzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjYWxsczogW1tzZXNzaW9uUmVzb3VyY2UsICdzZXJ2ZXItMSddXSxcblx0XHRcdFx0cm93UG9pbnRlckRvd25zOiAwLFxuXHRcdFx0XHRyb3dDbGlja3M6IDAsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FjdGl2ZS1zZXNzaW9uIGVycm9yIHJlZ2lzdGVycyB0aGUgY2hhbm5lbCwgY2xvc2VzIHRoZSBlZGl0b3IsIHRoZW4gb3BlbnMgb3V0cHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2hvd25DaGFubmVsczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGxldCBsb2NhbE91dHB1dENvdW50ID0gMDtcblx0XHRcdGNvbnN0IGFjdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBvdXRwdXRIYW5kbGVyID0gZ2V0TWNwU2VydmVyT3V0cHV0SGFuZGxlcihcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNob3dDaGFubmVsOiBhc3luYyBjaGFubmVsSWQgPT4ge1xuXHRcdFx0XHRcdFx0YWN0aW9ucy5wdXNoKCdzaG93LW91dHB1dCcpO1xuXHRcdFx0XHRcdFx0c2hvd25DaGFubmVscy5wdXNoKGNoYW5uZWxJZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7IHNob3dPdXRwdXQ6IGFzeW5jICgpID0+IHsgbG9jYWxPdXRwdXRDb3VudCsrOyB9IH0sXG5cdFx0XHRcdGNyZWF0ZUFnZW50SG9zdFNlcnZlcih7IGxvZ091dHB1dENoYW5uZWxJZDogJ2FnZW50LWhvc3Qtb3V0cHV0JyB9KSxcblx0XHRcdFx0YXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGFjdGlvbnMucHVzaCgnY2xvc2UtZWRpdG9yJyk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFzeW5jIGJlZm9yZVNob3cgPT4ge1xuXHRcdFx0XHRcdGFjdGlvbnMucHVzaCgncmVnaXN0ZXItYWdlbnQtaG9zdC1vdXRwdXQnKTtcblx0XHRcdFx0XHRhd2FpdCBiZWZvcmVTaG93Py4oKTtcblx0XHRcdFx0XHRhY3Rpb25zLnB1c2goJ3Nob3ctYWdlbnQtaG9zdC1vdXRwdXQnKTtcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQub2sob3V0cHV0SGFuZGxlcik7XG5cblx0XHRcdGF3YWl0IG91dHB1dEhhbmRsZXIoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNob3duQ2hhbm5lbHMsXG5cdFx0XHRcdGxvY2FsT3V0cHV0Q291bnQsXG5cdFx0XHRcdGFjdGlvbnMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNob3duQ2hhbm5lbHM6IFtdLFxuXHRcdFx0XHRsb2NhbE91dHB1dENvdW50OiAwLFxuXHRcdFx0XHRhY3Rpb25zOiBbJ3JlZ2lzdGVyLWFnZW50LWhvc3Qtb3V0cHV0JywgJ2Nsb3NlLWVkaXRvcicsICdzaG93LWFnZW50LWhvc3Qtb3V0cHV0J10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xvY2FsIGVycm9yIG9wZW5zIGxvY2FsIG91dHB1dCB3aGVuIG5vIGFnZW50LWhvc3Qgb3V0cHV0IGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNob3duQ2hhbm5lbHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRsZXQgbG9jYWxPdXRwdXRDb3VudCA9IDA7XG5cdFx0XHRjb25zdCBvdXRwdXRIYW5kbGVyID0gZ2V0TWNwU2VydmVyT3V0cHV0SGFuZGxlcihcblx0XHRcdFx0eyBzaG93Q2hhbm5lbDogYXN5bmMgY2hhbm5lbElkID0+IHsgc2hvd25DaGFubmVscy5wdXNoKGNoYW5uZWxJZCk7IH0gfSxcblx0XHRcdFx0eyBzaG93T3V0cHV0OiBhc3luYyAoKSA9PiB7IGxvY2FsT3V0cHV0Q291bnQrKzsgfSB9LFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQpO1xuXG5cdFx0XHRhd2FpdCBvdXRwdXRIYW5kbGVyPy4oKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNob3duQ2hhbm5lbHMsXG5cdFx0XHRcdGxvY2FsT3V0cHV0Q291bnQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNob3duQ2hhbm5lbHM6IFtdLFxuXHRcdFx0XHRsb2NhbE91dHB1dENvdW50OiAxLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsUUFBUSw0QkFBNEI7QUFDN0MsU0FBUyxXQUFXO0FBQ3BCLFNBQWtCLGlCQUFpQjtBQUNuQyxTQUEwQixvQkFBb0I7QUFDOUMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxtQ0FBbUM7QUFJNUM7QUFBQSxFQUVDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNB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
