import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ShellIntegrationAddon } from "../../../../../../platform/terminal/common/xterm/shellIntegrationAddon.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { getActiveDocument } from "../../../../../../base/browser/dom.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { strictEqual } from "assert";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ChatAgentLocation, ChatModeKind } from "../../../../chat/common/constants.js";
import { InitialHintAddon } from "../../browser/terminal.initialHint.contribution.js";
import { TestXtermLogger } from "../../../../../../platform/terminal/test/common/terminalTestHelpers.js";
suite("Terminal Initial Hint Addon", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let eventCount = 0;
  let xterm;
  let initialHintAddon;
  const onDidChangeAgentsEmitter = new Emitter();
  const onDidChangeAgents = onDidChangeAgentsEmitter.event;
  const agent = {
    id: "termminal",
    name: "terminal",
    extensionId: new ExtensionIdentifier("test"),
    extensionVersion: void 0,
    extensionPublisherId: "test",
    extensionDisplayName: "test",
    metadata: {},
    slashCommands: [{ name: "test", description: "test" }],
    disambiguation: [],
    locations: [ChatAgentLocation.fromRaw("terminal")],
    modes: [ChatModeKind.Ask],
    invoke: async () => {
      return {};
    }
  };
  const editorAgent = {
    id: "editor",
    name: "editor",
    extensionId: new ExtensionIdentifier("test-editor"),
    extensionVersion: void 0,
    extensionPublisherId: "test-editor",
    extensionDisplayName: "test-editor",
    metadata: {},
    slashCommands: [{ name: "test", description: "test" }],
    locations: [ChatAgentLocation.fromRaw("editor")],
    modes: [ChatModeKind.Ask],
    disambiguation: [],
    invoke: async () => {
      return {};
    }
  };
  setup(async () => {
    const instantiationService = workbenchInstantiationService({}, store);
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    xterm = store.add(new TerminalCtor({ logger: TestXtermLogger }));
    const shellIntegrationAddon = store.add(new ShellIntegrationAddon("", true, void 0, void 0, new NullLogService()));
    initialHintAddon = store.add(instantiationService.createInstance(InitialHintAddon, shellIntegrationAddon.capabilities, onDidChangeAgents));
    store.add(initialHintAddon.onDidRequestCreateHint(() => eventCount++));
    const testContainer = document.createElement("div");
    getActiveDocument().body.append(testContainer);
    xterm.open(testContainer);
    xterm.loadAddon(shellIntegrationAddon);
    xterm.loadAddon(initialHintAddon);
  });
  suite("Chat providers", () => {
    test("hint is not shown when there are no chat providers", () => {
      eventCount = 0;
      xterm.focus();
      strictEqual(eventCount, 0);
    });
    test("hint is not shown when there is just an editor agent", () => {
      eventCount = 0;
      onDidChangeAgentsEmitter.fire(editorAgent);
      xterm.focus();
      strictEqual(eventCount, 0);
    });
    test("hint is shown when there is a terminal chat agent", () => {
      eventCount = 0;
      onDidChangeAgentsEmitter.fire(editorAgent);
      xterm.focus();
      strictEqual(eventCount, 0);
      onDidChangeAgentsEmitter.fire(agent);
      strictEqual(eventCount, 1);
    });
    test("hint is not shown again when another terminal chat agent is added if it has already shown", () => {
      eventCount = 0;
      onDidChangeAgentsEmitter.fire(agent);
      xterm.focus();
      strictEqual(eventCount, 1);
      onDidChangeAgentsEmitter.fire(agent);
      strictEqual(eventCount, 1);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9pbmxpbmVIaW50L3Rlc3QvYnJvd3Nlci90ZXJtaW5hbEluaXRpYWxIaW50LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IFRlcm1pbmFsIH0gZnJvbSAnQHh0ZXJtL3h0ZXJtJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgU2hlbGxJbnRlZ3JhdGlvbkFkZG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3h0ZXJtL3NoZWxsSW50ZWdyYXRpb25BZGRvbi5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBnZXRBY3RpdmVEb2N1bWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDaGF0QWdlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jaGF0L2NvbW1vbi9wYXJ0aWNpcGFudHMvY2hhdEFnZW50cy5qcyc7XG5pbXBvcnQgeyBpbXBvcnRBTUROb2RlTW9kdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYW1kWC5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IEluaXRpYWxIaW50QWRkb24gfSBmcm9tICcuLi8uLi9icm93c2VyL3Rlcm1pbmFsLmluaXRpYWxIaW50LmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0WHRlcm1Mb2dnZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC90ZXN0L2NvbW1vbi90ZXJtaW5hbFRlc3RIZWxwZXJzLmpzJztcblxuc3VpdGUoJ1Rlcm1pbmFsIEluaXRpYWwgSGludCBBZGRvbicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0bGV0IGV2ZW50Q291bnQgPSAwO1xuXHRsZXQgeHRlcm06IFRlcm1pbmFsO1xuXHRsZXQgaW5pdGlhbEhpbnRBZGRvbjogSW5pdGlhbEhpbnRBZGRvbjtcblx0Y29uc3Qgb25EaWRDaGFuZ2VBZ2VudHNFbWl0dGVyOiBFbWl0dGVyPElDaGF0QWdlbnQgfCB1bmRlZmluZWQ+ID0gbmV3IEVtaXR0ZXIoKTtcblx0Y29uc3Qgb25EaWRDaGFuZ2VBZ2VudHMgPSBvbkRpZENoYW5nZUFnZW50c0VtaXR0ZXIuZXZlbnQ7XG5cdGNvbnN0IGFnZW50OiBJQ2hhdEFnZW50ID0ge1xuXHRcdGlkOiAndGVybW1pbmFsJyxcblx0XHRuYW1lOiAndGVybWluYWwnLFxuXHRcdGV4dGVuc2lvbklkOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdCcpLFxuXHRcdGV4dGVuc2lvblZlcnNpb246IHVuZGVmaW5lZCxcblx0XHRleHRlbnNpb25QdWJsaXNoZXJJZDogJ3Rlc3QnLFxuXHRcdGV4dGVuc2lvbkRpc3BsYXlOYW1lOiAndGVzdCcsXG5cdFx0bWV0YWRhdGE6IHt9LFxuXHRcdHNsYXNoQ29tbWFuZHM6IFt7IG5hbWU6ICd0ZXN0JywgZGVzY3JpcHRpb246ICd0ZXN0JyB9XSxcblx0XHRkaXNhbWJpZ3VhdGlvbjogW10sXG5cdFx0bG9jYXRpb25zOiBbQ2hhdEFnZW50TG9jYXRpb24uZnJvbVJhdygndGVybWluYWwnKV0sXG5cdFx0bW9kZXM6IFtDaGF0TW9kZUtpbmQuQXNrXSxcblx0XHRpbnZva2U6IGFzeW5jICgpID0+IHsgcmV0dXJuIHt9OyB9XG5cdH07XG5cdGNvbnN0IGVkaXRvckFnZW50OiBJQ2hhdEFnZW50ID0ge1xuXHRcdGlkOiAnZWRpdG9yJyxcblx0XHRuYW1lOiAnZWRpdG9yJyxcblx0XHRleHRlbnNpb25JZDogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QtZWRpdG9yJyksXG5cdFx0ZXh0ZW5zaW9uVmVyc2lvbjogdW5kZWZpbmVkLFxuXHRcdGV4dGVuc2lvblB1Ymxpc2hlcklkOiAndGVzdC1lZGl0b3InLFxuXHRcdGV4dGVuc2lvbkRpc3BsYXlOYW1lOiAndGVzdC1lZGl0b3InLFxuXHRcdG1ldGFkYXRhOiB7fSxcblx0XHRzbGFzaENvbW1hbmRzOiBbeyBuYW1lOiAndGVzdCcsIGRlc2NyaXB0aW9uOiAndGVzdCcgfV0sXG5cdFx0bG9jYXRpb25zOiBbQ2hhdEFnZW50TG9jYXRpb24uZnJvbVJhdygnZWRpdG9yJyldLFxuXHRcdG1vZGVzOiBbQ2hhdE1vZGVLaW5kLkFza10sXG5cdFx0ZGlzYW1iaWd1YXRpb246IFtdLFxuXHRcdGludm9rZTogYXN5bmMgKCkgPT4geyByZXR1cm4ge307IH1cblx0fTtcblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe30sIHN0b3JlKTtcblx0XHRjb25zdCBUZXJtaW5hbEN0b3IgPSAoYXdhaXQgaW1wb3J0QU1ETm9kZU1vZHVsZTx0eXBlb2YgaW1wb3J0KCdAeHRlcm0veHRlcm0nKT4oJ0B4dGVybS94dGVybScsICdsaWIveHRlcm0uanMnKSkuVGVybWluYWw7XG5cdFx0eHRlcm0gPSBzdG9yZS5hZGQobmV3IFRlcm1pbmFsQ3Rvcih7IGxvZ2dlcjogVGVzdFh0ZXJtTG9nZ2VyIH0pKTtcblx0XHRjb25zdCBzaGVsbEludGVncmF0aW9uQWRkb24gPSBzdG9yZS5hZGQobmV3IFNoZWxsSW50ZWdyYXRpb25BZGRvbignJywgdHJ1ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIG5ldyBOdWxsTG9nU2VydmljZSkpO1xuXHRcdGluaXRpYWxIaW50QWRkb24gPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5pdGlhbEhpbnRBZGRvbiwgc2hlbGxJbnRlZ3JhdGlvbkFkZG9uLmNhcGFiaWxpdGllcywgb25EaWRDaGFuZ2VBZ2VudHMpKTtcblx0XHRzdG9yZS5hZGQoaW5pdGlhbEhpbnRBZGRvbi5vbkRpZFJlcXVlc3RDcmVhdGVIaW50KCgpID0+IGV2ZW50Q291bnQrKykpO1xuXHRcdGNvbnN0IHRlc3RDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRnZXRBY3RpdmVEb2N1bWVudCgpLmJvZHkuYXBwZW5kKHRlc3RDb250YWluZXIpO1xuXHRcdHh0ZXJtLm9wZW4odGVzdENvbnRhaW5lcik7XG5cblx0XHR4dGVybS5sb2FkQWRkb24oc2hlbGxJbnRlZ3JhdGlvbkFkZG9uKTtcblx0XHR4dGVybS5sb2FkQWRkb24oaW5pdGlhbEhpbnRBZGRvbik7XG5cdH0pO1xuXG5cdHN1aXRlKCdDaGF0IHByb3ZpZGVycycsICgpID0+IHtcblx0XHR0ZXN0KCdoaW50IGlzIG5vdCBzaG93biB3aGVuIHRoZXJlIGFyZSBubyBjaGF0IHByb3ZpZGVycycsICgpID0+IHtcblx0XHRcdGV2ZW50Q291bnQgPSAwO1xuXHRcdFx0eHRlcm0uZm9jdXMoKTtcblx0XHRcdHN0cmljdEVxdWFsKGV2ZW50Q291bnQsIDApO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ2hpbnQgaXMgbm90IHNob3duIHdoZW4gdGhlcmUgaXMganVzdCBhbiBlZGl0b3IgYWdlbnQnLCAoKSA9PiB7XG5cdFx0XHRldmVudENvdW50ID0gMDtcblx0XHRcdG9uRGlkQ2hhbmdlQWdlbnRzRW1pdHRlci5maXJlKGVkaXRvckFnZW50KTtcblx0XHRcdHh0ZXJtLmZvY3VzKCk7XG5cdFx0XHRzdHJpY3RFcXVhbChldmVudENvdW50LCAwKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdoaW50IGlzIHNob3duIHdoZW4gdGhlcmUgaXMgYSB0ZXJtaW5hbCBjaGF0IGFnZW50JywgKCkgPT4ge1xuXHRcdFx0ZXZlbnRDb3VudCA9IDA7XG5cdFx0XHRvbkRpZENoYW5nZUFnZW50c0VtaXR0ZXIuZmlyZShlZGl0b3JBZ2VudCk7XG5cdFx0XHR4dGVybS5mb2N1cygpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZXZlbnRDb3VudCwgMCk7XG5cdFx0XHRvbkRpZENoYW5nZUFnZW50c0VtaXR0ZXIuZmlyZShhZ2VudCk7XG5cdFx0XHRzdHJpY3RFcXVhbChldmVudENvdW50LCAxKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdoaW50IGlzIG5vdCBzaG93biBhZ2FpbiB3aGVuIGFub3RoZXIgdGVybWluYWwgY2hhdCBhZ2VudCBpcyBhZGRlZCBpZiBpdCBoYXMgYWxyZWFkeSBzaG93bicsICgpID0+IHtcblx0XHRcdGV2ZW50Q291bnQgPSAwO1xuXHRcdFx0b25EaWRDaGFuZ2VBZ2VudHNFbWl0dGVyLmZpcmUoYWdlbnQpO1xuXHRcdFx0eHRlcm0uZm9jdXMoKTtcblx0XHRcdHN0cmljdEVxdWFsKGV2ZW50Q291bnQsIDEpO1xuXHRcdFx0b25EaWRDaGFuZ2VBZ2VudHNFbWl0dGVyLmZpcmUoYWdlbnQpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZXZlbnRDb3VudCwgMSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxTQUFTLCtDQUErQztBQUN4RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywyQkFBMkI7QUFFcEMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxtQkFBbUIsb0JBQW9CO0FBQ2hELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsdUJBQXVCO0FBRWhDLE1BQU0sK0JBQStCLE1BQU07QUFDMUMsUUFBTSxRQUFRLHdDQUF3QztBQUN0RCxNQUFJLGFBQWE7QUFDakIsTUFBSTtBQUNKLE1BQUk7QUFDSixRQUFNLDJCQUE0RCxJQUFJLFFBQVE7QUFDOUUsUUFBTSxvQkFBb0IseUJBQXlCO0FBQ25ELFFBQU0sUUFBb0I7QUFBQSxJQUN6QixJQUFJO0FBQUEsSUFDSixN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
