import assert from "assert";
import * as cp from "child_process";
import { FileAccess } from "../../../common/network.js";
import * as objects from "../../../common/objects.js";
import * as platform from "../../../common/platform.js";
import * as processes from "../../../node/processes.js";
function fork(id) {
  const opts = {
    env: objects.mixin(objects.deepClone(process.env), {
      VSCODE_ESM_ENTRYPOINT: id,
      VSCODE_PIPE_LOGGING: "true",
      VSCODE_VERBOSE_LOGGING: true
    })
  };
  return cp.fork(FileAccess.asFileUri("bootstrap-fork").fsPath, ["--type=processTests"], opts);
}
suite("Processes", () => {
  test("buffered sending - simple data", function(done) {
    if (process.env["VSCODE_PID"]) {
      return done();
    }
    const child = fork("vs/base/test/node/processes/fixtures/fork");
    const sender = processes.createQueuedSender(child);
    let counter = 0;
    const msg1 = "Hello One";
    const msg2 = "Hello Two";
    const msg3 = "Hello Three";
    child.on("message", (msgFromChild) => {
      if (msgFromChild === "ready") {
        sender.send(msg1);
        sender.send(msg2);
        sender.send(msg3);
      } else {
        counter++;
        if (counter === 1) {
          assert.strictEqual(msgFromChild, msg1);
        } else if (counter === 2) {
          assert.strictEqual(msgFromChild, msg2);
        } else if (counter === 3) {
          assert.strictEqual(msgFromChild, msg3);
          child.kill();
          done();
        }
      }
    });
  });
  (!platform.isWindows || process.env["VSCODE_PID"] ? test.skip : test)("buffered sending - lots of data (potential deadlock on win32)", function(done) {
    const child = fork("vs/base/test/node/processes/fixtures/fork_large");
    const sender = processes.createQueuedSender(child);
    const largeObj = /* @__PURE__ */ Object.create(null);
    for (let i = 0; i < 1e4; i++) {
      largeObj[i] = "some data";
    }
    const msg = JSON.stringify(largeObj);
    child.on("message", (msgFromChild) => {
      if (msgFromChild === "ready") {
        sender.send(msg);
        sender.send(msg);
        sender.send(msg);
      } else if (msgFromChild === "done") {
        child.kill();
        done();
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2Jhc2UvdGVzdC9ub2RlL3Byb2Nlc3Nlcy9wcm9jZXNzZXMuaW50ZWdyYXRpb25UZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgY3AgZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0ICogYXMgb2JqZWN0cyBmcm9tICcuLi8uLi8uLi9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICogYXMgcHJvY2Vzc2VzIGZyb20gJy4uLy4uLy4uL25vZGUvcHJvY2Vzc2VzLmpzJztcblxuZnVuY3Rpb24gZm9yayhpZDogc3RyaW5nKTogY3AuQ2hpbGRQcm9jZXNzIHtcblx0Y29uc3Qgb3B0czogYW55ID0ge1xuXHRcdGVudjogb2JqZWN0cy5taXhpbihvYmplY3RzLmRlZXBDbG9uZShwcm9jZXNzLmVudiksIHtcblx0XHRcdFZTQ09ERV9FU01fRU5UUllQT0lOVDogaWQsXG5cdFx0XHRWU0NPREVfUElQRV9MT0dHSU5HOiAndHJ1ZScsXG5cdFx0XHRWU0NPREVfVkVSQk9TRV9MT0dHSU5HOiB0cnVlXG5cdFx0fSlcblx0fTtcblxuXHRyZXR1cm4gY3AuZm9yayhGaWxlQWNjZXNzLmFzRmlsZVVyaSgnYm9vdHN0cmFwLWZvcmsnKS5mc1BhdGgsIFsnLS10eXBlPXByb2Nlc3NUZXN0cyddLCBvcHRzKTtcbn1cblxuc3VpdGUoJ1Byb2Nlc3NlcycsICgpID0+IHtcblx0dGVzdCgnYnVmZmVyZWQgc2VuZGluZyAtIHNpbXBsZSBkYXRhJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHtcblx0XHRpZiAocHJvY2Vzcy5lbnZbJ1ZTQ09ERV9QSUQnXSkge1xuXHRcdFx0cmV0dXJuIGRvbmUoKTsgLy8gdGhpcyB0ZXN0IGZhaWxzIHdoZW4gcnVuIGZyb20gd2l0aGluIFZTIENvZGVcblx0XHR9XG5cblx0XHRjb25zdCBjaGlsZCA9IGZvcmsoJ3ZzL2Jhc2UvdGVzdC9ub2RlL3Byb2Nlc3Nlcy9maXh0dXJlcy9mb3JrJyk7XG5cdFx0Y29uc3Qgc2VuZGVyID0gcHJvY2Vzc2VzLmNyZWF0ZVF1ZXVlZFNlbmRlcihjaGlsZCk7XG5cblx0XHRsZXQgY291bnRlciA9IDA7XG5cblx0XHRjb25zdCBtc2cxID0gJ0hlbGxvIE9uZSc7XG5cdFx0Y29uc3QgbXNnMiA9ICdIZWxsbyBUd28nO1xuXHRcdGNvbnN0IG1zZzMgPSAnSGVsbG8gVGhyZWUnO1xuXG5cdFx0Y2hpbGQub24oJ21lc3NhZ2UnLCBtc2dGcm9tQ2hpbGQgPT4ge1xuXHRcdFx0aWYgKG1zZ0Zyb21DaGlsZCA9PT0gJ3JlYWR5Jykge1xuXHRcdFx0XHRzZW5kZXIuc2VuZChtc2cxKTtcblx0XHRcdFx0c2VuZGVyLnNlbmQobXNnMik7XG5cdFx0XHRcdHNlbmRlci5zZW5kKG1zZzMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y291bnRlcisrO1xuXG5cdFx0XHRcdGlmIChjb3VudGVyID09PSAxKSB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1zZ0Zyb21DaGlsZCwgbXNnMSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY291bnRlciA9PT0gMikge1xuXHRcdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtc2dGcm9tQ2hpbGQsIG1zZzIpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGNvdW50ZXIgPT09IDMpIHtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobXNnRnJvbUNoaWxkLCBtc2czKTtcblxuXHRcdFx0XHRcdGNoaWxkLmtpbGwoKTtcblx0XHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0KCFwbGF0Zm9ybS5pc1dpbmRvd3MgfHwgcHJvY2Vzcy5lbnZbJ1ZTQ09ERV9QSUQnXSA/IHRlc3Quc2tpcCA6IHRlc3QpKCdidWZmZXJlZCBzZW5kaW5nIC0gbG90cyBvZiBkYXRhIChwb3RlbnRpYWwgZGVhZGxvY2sgb24gd2luMzIpJywgZnVuY3Rpb24gKGRvbmU6ICgpID0+IHZvaWQpIHsgLy8gdGVzdCBpcyBvbmx5IHJlbGV2YW50IGZvciBXaW5kb3dzIGFuZCBzZWVtcyB0byBjcmFzaCByYW5kb21seSBvbiBzb21lIExpbnV4IGJ1aWxkc1xuXHRcdGNvbnN0IGNoaWxkID0gZm9yaygndnMvYmFzZS90ZXN0L25vZGUvcHJvY2Vzc2VzL2ZpeHR1cmVzL2ZvcmtfbGFyZ2UnKTtcblx0XHRjb25zdCBzZW5kZXIgPSBwcm9jZXNzZXMuY3JlYXRlUXVldWVkU2VuZGVyKGNoaWxkKTtcblxuXHRcdGNvbnN0IGxhcmdlT2JqID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMDAwOyBpKyspIHtcblx0XHRcdGxhcmdlT2JqW2ldID0gJ3NvbWUgZGF0YSc7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbXNnID0gSlNPTi5zdHJpbmdpZnkobGFyZ2VPYmopO1xuXHRcdGNoaWxkLm9uKCdtZXNzYWdlJywgbXNnRnJvbUNoaWxkID0+IHtcblx0XHRcdGlmIChtc2dGcm9tQ2hpbGQgPT09ICdyZWFkeScpIHtcblx0XHRcdFx0c2VuZGVyLnNlbmQobXNnKTtcblx0XHRcdFx0c2VuZGVyLnNlbmQobXNnKTtcblx0XHRcdFx0c2VuZGVyLnNlbmQobXNnKTtcblx0XHRcdH0gZWxzZSBpZiAobXNnRnJvbUNoaWxkID09PSAnZG9uZScpIHtcblx0XHRcdFx0Y2hpbGQua2lsbCgpO1xuXHRcdFx0XHRkb25lKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxRQUFRO0FBQ3BCLFNBQVMsa0JBQWtCO0FBQzNCLFlBQVksYUFBYTtBQUN6QixZQUFZLGNBQWM7QUFDMUIsWUFBWSxlQUFlO0FBRTNCLFNBQVMsS0FBSyxJQUE2QjtBQUMxQyxRQUFNLE9BQVk7QUFBQSxJQUNqQixLQUFLLFFBQVEsTUFBTSxRQUFRLFVBQVUsUUFBUSxHQUFHLEdBQUc7QUFBQSxNQUNsRCx1QkFBdUI7QUFBQSxNQUN2QixxQkFBcUI7QUFBQSxNQUNyQix3QkFBd0I7QUFBQSxJQUN6QixDQUFDO0FBQUEsRUFDRjtBQUVBLFNBQU8sR0FBRyxLQUFLLFdBQVcsVUFBVSxnQkFBZ0IsRUFBRSxRQUFRLENBQUMscUJBQXFCLEdBQUcsSUFBSTtBQUM1RjtBQUVBLE1BQU0sYUFBYSxNQUFNO0FBQ3hCLE9BQUssa0NBQWtDLFNBQVUsTUFBa0I7QUFDbEUsUUFBSSxRQUFRLElBQUksWUFBWSxHQUFHO0FBQzlCLGFBQU8sS0FBSztBQUFBLElBQ2I7QUFFQSxVQUFNLFFBQVEsS0FBSywyQ0FBMkM7QUFDOUQsVUFBTSxTQUFTLFVBQVUsbUJBQW1CLEtBQUs7QUFFakQsUUFBSSxVQUFVO0FBRWQsVUFBTSxPQUFPO0FBQ2IsVUFBTSxPQUFPO0FBQ2IsVUFBTSxPQUFPO0FBRWIsVUFBTSxHQUFHLFdBQVcsa0JBQWdCO0FBQ25DLFVBQUksaUJBQWlCLFNBQVM7QUFDN0IsZUFBTyxLQUFLLElBQUk7QUFDaEIsZUFBTyxLQUFLLElBQUk7QUFDaEIsZUFBTyxLQUFLLElBQUk7QUFBQSxNQUNqQixPQUFPO0FBQ047QUFFQSxZQUFJLFlBQVksR0FBRztBQUNsQixpQkFBTyxZQUFZLGNBQWMsSUFBSTtBQUFBLFFBQ3RDLFdBQVcsWUFBWSxHQUFHO0FBQ3pCLGlCQUFPLFlBQVksY0FBYyxJQUFJO0FBQUEsUUFDdEMsV0FBVyxZQUFZLEdBQUc7QUFDekIsaUJBQU8sWUFBWSxjQUFjLElBQUk7QUFFckMsZ0JBQU0sS0FBSztBQUNYLGVBQUs7QUFBQSxRQUNOO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELEdBQUMsQ0FBQyxTQUFTLGFBQWEsUUFBUSxJQUFJLFlBQVksSUFBSSxLQUFLLE9BQU8sTUFBTSxpRUFBaUUsU0FBVSxNQUFrQjtBQUNsSyxVQUFNLFFBQVEsS0FBSyxpREFBaUQ7QUFDcEUsVUFBTSxTQUFTLFVBQVUsbUJBQW1CLEtBQUs7QUFFakQsVUFBTSxXQUFXLHVCQUFPLE9BQU8sSUFBSTtBQUNuQyxhQUFTLElBQUksR0FBRyxJQUFJLEtBQU8sS0FBSztBQUMvQixlQUFTLENBQUMsSUFBSTtBQUFBLElBQ2Y7QUFFQSxVQUFNLE1BQU0sS0FBSyxVQUFVLFFBQVE7QUFDbkMsVUFBTSxHQUFHLFdBQVcsa0JBQWdCO0FBQ25DLFVBQUksaUJBQWlCLFNBQVM7QUFDN0IsZUFBTyxLQUFLLEdBQUc7QUFDZixlQUFPLEtBQUssR0FBRztBQUNmLGVBQU8sS0FBSyxHQUFHO0FBQUEsTUFDaEIsV0FBVyxpQkFBaUIsUUFBUTtBQUNuQyxjQUFNLEtBQUs7QUFDWCxhQUFLO0FBQUEsTUFDTjtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
