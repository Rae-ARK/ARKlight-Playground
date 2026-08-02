import assert from "assert";
import { ExtHostCommands } from "../../common/extHostCommands.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { SingleProxyRPCProtocol } from "../common/testRPCProtocol.js";
import { mock } from "../../../../base/test/common/mock.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
suite("ExtHostCommands", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("dispose calls unregister", function() {
    let lastUnregister;
    const shape = new class extends mock() {
      $registerCommand(id) {
      }
      $unregisterCommand(id) {
        lastUnregister = id;
      }
    }();
    const commands = new ExtHostCommands(
      SingleProxyRPCProtocol(shape),
      new NullLogService(),
      new class extends mock() {
        onExtensionError() {
          return true;
        }
      }()
    );
    commands.registerCommand(true, "foo", () => {
    }).dispose();
    assert.strictEqual(lastUnregister, "foo");
    assert.strictEqual(CommandsRegistry.getCommand("foo"), void 0);
  });
  test("dispose bubbles only once", function() {
    let unregisterCounter = 0;
    const shape = new class extends mock() {
      $registerCommand(id) {
      }
      $unregisterCommand(id) {
        unregisterCounter += 1;
      }
    }();
    const commands = new ExtHostCommands(
      SingleProxyRPCProtocol(shape),
      new NullLogService(),
      new class extends mock() {
        onExtensionError() {
          return true;
        }
      }()
    );
    const reg = commands.registerCommand(true, "foo", () => {
    });
    reg.dispose();
    reg.dispose();
    reg.dispose();
    assert.strictEqual(unregisterCounter, 1);
  });
  test("execute with retry", async function() {
    let count = 0;
    const shape = new class extends mock() {
      $registerCommand(id) {
      }
      async $executeCommand(id, args, retry) {
        count++;
        assert.strictEqual(retry, count === 1);
        if (count === 1) {
          assert.strictEqual(retry, true);
          throw new Error("$executeCommand:retry");
        } else {
          assert.strictEqual(retry, false);
          return 17;
        }
      }
    }();
    const commands = new ExtHostCommands(
      SingleProxyRPCProtocol(shape),
      new NullLogService(),
      new class extends mock() {
        onExtensionError() {
          return true;
        }
      }()
    );
    const result = await commands.executeCommand("fooo", [this, true]);
    assert.strictEqual(result, 17);
    assert.strictEqual(count, 2);
  });
  test("onCommand:abc activates extensions when executed from command palette, but not when executed programmatically with vscode.commands.executeCommand #150293", async function() {
    const activationEvents = [];
    const shape = new class extends mock() {
      $registerCommand(id) {
      }
      $fireCommandActivationEvent(id) {
        activationEvents.push(id);
      }
    }();
    const commands = new ExtHostCommands(
      SingleProxyRPCProtocol(shape),
      new NullLogService(),
      new class extends mock() {
        onExtensionError() {
          return true;
        }
      }()
    );
    commands.registerCommand(true, "extCmd", (args) => args);
    const result = await commands.executeCommand("extCmd", this);
    assert.strictEqual(result, this);
    assert.deepStrictEqual(activationEvents, ["extCmd"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3RDb21tYW5kcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRXh0SG9zdENvbW1hbmRzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RDb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBNYWluVGhyZWFkQ29tbWFuZHNTaGFwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IENvbW1hbmRzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgU2luZ2xlUHJveHlSUENQcm90b2NvbCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0UlBDUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VGVsZW1ldHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdFeHRIb3N0Q29tbWFuZHMnLCBmdW5jdGlvbiAoKSB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2Rpc3Bvc2UgY2FsbHMgdW5yZWdpc3RlcicsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGxldCBsYXN0VW5yZWdpc3Rlcjogc3RyaW5nO1xuXG5cdFx0Y29uc3Qgc2hhcGUgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRDb21tYW5kc1NoYXBlPigpIHtcblx0XHRcdG92ZXJyaWRlICRyZWdpc3RlckNvbW1hbmQoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0XHQvL1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgJHVucmVnaXN0ZXJDb21tYW5kKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdFx0bGFzdFVucmVnaXN0ZXIgPSBpZDtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgY29tbWFuZHMgPSBuZXcgRXh0SG9zdENvbW1hbmRzKFxuXHRcdFx0U2luZ2xlUHJveHlSUENQcm90b2NvbChzaGFwZSksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3RUZWxlbWV0cnk+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBvbkV4dGVuc2lvbkVycm9yKCk6IGJvb2xlYW4ge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblx0XHRjb21tYW5kcy5yZWdpc3RlckNvbW1hbmQodHJ1ZSwgJ2ZvbycsICgpOiBhbnkgPT4geyB9KS5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RVbnJlZ2lzdGVyISwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoJ2ZvbycpLCB1bmRlZmluZWQpO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3Bvc2UgYnViYmxlcyBvbmx5IG9uY2UnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRsZXQgdW5yZWdpc3RlckNvdW50ZXIgPSAwO1xuXG5cdFx0Y29uc3Qgc2hhcGUgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRDb21tYW5kc1NoYXBlPigpIHtcblx0XHRcdG92ZXJyaWRlICRyZWdpc3RlckNvbW1hbmQoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0XHQvL1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgJHVucmVnaXN0ZXJDb21tYW5kKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdFx0dW5yZWdpc3RlckNvdW50ZXIgKz0gMTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgY29tbWFuZHMgPSBuZXcgRXh0SG9zdENvbW1hbmRzKFxuXHRcdFx0U2luZ2xlUHJveHlSUENQcm90b2NvbChzaGFwZSksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3RUZWxlbWV0cnk+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBvbkV4dGVuc2lvbkVycm9yKCk6IGJvb2xlYW4ge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblx0XHRjb25zdCByZWcgPSBjb21tYW5kcy5yZWdpc3RlckNvbW1hbmQodHJ1ZSwgJ2ZvbycsICgpOiBhbnkgPT4geyB9KTtcblx0XHRyZWcuZGlzcG9zZSgpO1xuXHRcdHJlZy5kaXNwb3NlKCk7XG5cdFx0cmVnLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5yZWdpc3RlckNvdW50ZXIsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdleGVjdXRlIHdpdGggcmV0cnknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cblx0XHRsZXQgY291bnQgPSAwO1xuXG5cdFx0Y29uc3Qgc2hhcGUgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRDb21tYW5kc1NoYXBlPigpIHtcblx0XHRcdG92ZXJyaWRlICRyZWdpc3RlckNvbW1hbmQoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdFx0XHQvL1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgJGV4ZWN1dGVDb21tYW5kPFQ+KGlkOiBzdHJpbmcsIGFyZ3M6IGFueVtdLCByZXRyeTogYm9vbGVhbik6IFByb21pc2U8VCB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0XHRjb3VudCsrO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmV0cnksIGNvdW50ID09PSAxKTtcblx0XHRcdFx0aWYgKGNvdW50ID09PSAxKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJldHJ5LCB0cnVlKTtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJyRleGVjdXRlQ29tbWFuZDpyZXRyeScpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXRyeSwgZmFsc2UpO1xuXHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdHJldHVybiA8YW55PjE3O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGNvbW1hbmRzID0gbmV3IEV4dEhvc3RDb21tYW5kcyhcblx0XHRcdFNpbmdsZVByb3h5UlBDUHJvdG9jb2woc2hhcGUpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0VGVsZW1ldHJ5PigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgb25FeHRlbnNpb25FcnJvcigpOiBib29sZWFuIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRjb25zdCByZXN1bHQ6IG51bWJlciA9IGF3YWl0IGNvbW1hbmRzLmV4ZWN1dGVDb21tYW5kKCdmb29vJywgW3RoaXMsIHRydWVdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCAxNyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LCAyKTtcblx0fSk7XG5cblx0dGVzdCgnb25Db21tYW5kOmFiYyBhY3RpdmF0ZXMgZXh0ZW5zaW9ucyB3aGVuIGV4ZWN1dGVkIGZyb20gY29tbWFuZCBwYWxldHRlLCBidXQgbm90IHdoZW4gZXhlY3V0ZWQgcHJvZ3JhbW1hdGljYWxseSB3aXRoIHZzY29kZS5jb21tYW5kcy5leGVjdXRlQ29tbWFuZCAjMTUwMjkzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgYWN0aXZhdGlvbkV2ZW50czogc3RyaW5nW10gPSBbXTtcblxuXHRcdGNvbnN0IHNoYXBlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxNYWluVGhyZWFkQ29tbWFuZHNTaGFwZT4oKSB7XG5cdFx0XHRvdmVycmlkZSAkcmVnaXN0ZXJDb21tYW5kKGlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRcdFx0Ly9cblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlICRmaXJlQ29tbWFuZEFjdGl2YXRpb25FdmVudChpZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0XHRcdGFjdGl2YXRpb25FdmVudHMucHVzaChpZCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBjb21tYW5kcyA9IG5ldyBFeHRIb3N0Q29tbWFuZHMoXG5cdFx0XHRTaW5nbGVQcm94eVJQQ1Byb3RvY29sKHNoYXBlKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0bmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRXh0SG9zdFRlbGVtZXRyeT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIG9uRXh0ZW5zaW9uRXJyb3IoKTogYm9vbGVhbiB7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Y29tbWFuZHMucmVnaXN0ZXJDb21tYW5kKHRydWUsICdleHRDbWQnLCAoYXJnczogYW55KTogYW55ID0+IGFyZ3MpO1xuXG5cdFx0Y29uc3QgcmVzdWx0OiB1bmtub3duID0gYXdhaXQgY29tbWFuZHMuZXhlY3V0ZUNvbW1hbmQoJ2V4dENtZCcsIHRoaXMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHRoaXMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvbkV2ZW50cywgWydleHRDbWQnXSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFFaEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sbUJBQW1CLFdBQVk7QUFDcEMsMENBQXdDO0FBRXhDLE9BQUssNEJBQTRCLFdBQVk7QUFFNUMsUUFBSTtBQUVKLFVBQU0sUUFBUSxJQUFJLGNBQWMsS0FBOEIsRUFBRTtBQUFBLE1BQ3RELGlCQUFpQixJQUFrQjtBQUFBLE1BRTVDO0FBQUEsTUFDUyxtQkFBbUIsSUFBa0I7QUFDN0MseUJBQWlCO0FBQUEsTUFDbEI7QUFBQSxJQUNEO0FBRUEsVUFBTSxXQUFXLElBQUk7QUFBQSxNQUNwQix1QkFB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
