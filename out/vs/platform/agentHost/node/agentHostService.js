var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import { Event } from "../../../base/common/event.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { ILogService, ILoggerService } from "../../log/common/log.js";
import { RemoteLoggerChannelClient } from "../../log/common/logIpc.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { reportAgentHostProcessError } from "../common/agentHostProcessTelemetry.js";
import { AgentHostIpcChannels } from "../common/agentService.js";
var Constants = /* @__PURE__ */ ((Constants2) => {
  Constants2[Constants2["MaxRestarts"] = 5] = "MaxRestarts";
  return Constants2;
})(Constants || {});
let AgentHostProcessManager = class extends Disposable {
  constructor(_starter, _logService, _loggerService, _telemetryService) {
    super();
    this._starter = _starter;
    this._logService = _logService;
    this._loggerService = _loggerService;
    this._telemetryService = _telemetryService;
    this._started = false;
    this._wasQuitRequested = false;
    this._restartCount = 0;
    this._register(this._starter);
    if (this._starter.onRequestConnection) {
      this._register(Event.once(this._starter.onRequestConnection)(() => this._ensureStarted()));
    }
    if (this._starter.onWillShutdown) {
      this._register(this._starter.onWillShutdown(() => this._wasQuitRequested = true));
    }
  }
  _ensureStarted() {
    if (!this._started) {
      this._start();
    }
  }
  async _start() {
    this._started = true;
    try {
      const connection = await this._starter.start();
      if (this._store.isDisposed) {
        connection.store.dispose();
        return;
      }
      this._logService.info("AgentHostProcessManager: agent host started");
      this._register(new RemoteLoggerChannelClient(this._loggerService, connection.client.getChannel(AgentHostIpcChannels.Logger)));
      this._register(connection.onDidProcessExit((e) => {
        if (!this._wasQuitRequested && !this._store.isDisposed) {
          const willRestart = this._restartCount <= 5 /* MaxRestarts */;
          reportAgentHostProcessError(this._telemetryService, {
            kind: "unexpectedExit",
            code: e.code,
            restartCount: this._restartCount,
            willRestart
          });
          if (willRestart) {
            this._logService.error(`AgentHostProcessManager: agent host terminated unexpectedly with code ${e.code}`);
            this._restartCount++;
            this._started = false;
            connection.store.dispose();
            this._start();
          } else {
            this._logService.error(`AgentHostProcessManager: agent host terminated with code ${e.code}, giving up after ${5 /* MaxRestarts */} restarts`);
          }
        }
      }));
      this._register(toDisposable(() => connection.store.dispose()));
    } catch (error) {
      this._started = false;
      this._logService.error("AgentHostProcessManager: failed to start agent host", error);
      reportAgentHostProcessError(this._telemetryService, {
        kind: "startFailed",
        restartCount: this._restartCount,
        willRestart: false
      }, error);
    }
  }
};
AgentHostProcessManager = __decorateClass([
  __decorateParam(1, ILogService),
  __decorateParam(2, ILoggerService),
  __decorateParam(3, ITelemetryService)
], AgentHostProcessManager);
export {
  AgentHostProcessManager
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL2FnZW50SG9zdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgSUxvZ2dlclNlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBSZW1vdGVMb2dnZXJDaGFubmVsQ2xpZW50IH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2dJcGMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U3RhcnRlciB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyByZXBvcnRBZ2VudEhvc3RQcm9jZXNzRXJyb3IgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0UHJvY2Vzc1RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RJcGNDaGFubmVscyB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuXG5lbnVtIENvbnN0YW50cyB7XG5cdE1heFJlc3RhcnRzID0gNSxcbn1cblxuLyoqXG4gKiBNYWluLXByb2Nlc3Mgc2VydmljZSB0aGF0IG1hbmFnZXMgdGhlIGFnZW50IGhvc3QgdXRpbGl0eSBwcm9jZXNzIGxpZmVjeWNsZVxuICogKGxhenkgc3RhcnQsIGNyYXNoIHJlY292ZXJ5LCBsb2dnZXIgZm9yd2FyZGluZykuIFRoZSByZW5kZXJlciBjb21tdW5pY2F0ZXNcbiAqIHdpdGggdGhlIHV0aWxpdHkgcHJvY2VzcyBkaXJlY3RseSB2aWEgTWVzc2FnZVBvcnQgLSB0aGlzIGNsYXNzIGRvZXMgbm90XG4gKiByZWxheSBhbnkgYWdlbnQgc2VydmljZSBjYWxscy5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50SG9zdFByb2Nlc3NNYW5hZ2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfc3RhcnRlZCA9IGZhbHNlO1xuXHRwcml2YXRlIF93YXNRdWl0UmVxdWVzdGVkID0gZmFsc2U7XG5cdHByaXZhdGUgX3Jlc3RhcnRDb3VudCA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3RhcnRlcjogSUFnZW50SG9zdFN0YXJ0ZXIsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTG9nZ2VyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dnZXJTZXJ2aWNlOiBJTG9nZ2VyU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdGFydGVyKTtcblxuXHRcdC8vIFN0YXJ0IGxhemlseSB3aGVuIHRoZSBmaXJzdCB3aW5kb3cgYXNrcyBmb3IgYSBjb25uZWN0aW9uXG5cdFx0aWYgKHRoaXMuX3N0YXJ0ZXIub25SZXF1ZXN0Q29ubmVjdGlvbikge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQub25jZSh0aGlzLl9zdGFydGVyLm9uUmVxdWVzdENvbm5lY3Rpb24pKCgpID0+IHRoaXMuX2Vuc3VyZVN0YXJ0ZWQoKSkpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zdGFydGVyLm9uV2lsbFNodXRkb3duKSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9zdGFydGVyLm9uV2lsbFNodXRkb3duKCgpID0+IHRoaXMuX3dhc1F1aXRSZXF1ZXN0ZWQgPSB0cnVlKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlU3RhcnRlZCgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3N0YXJ0ZWQpIHtcblx0XHRcdHRoaXMuX3N0YXJ0KCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3RhcnQoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fc3RhcnRlZCA9IHRydWU7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbm5lY3Rpb24gPSBhd2FpdCB0aGlzLl9zdGFydGVyLnN0YXJ0KCk7XG5cblx0XHRcdGlmICh0aGlzLl9zdG9yZS5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdGNvbm5lY3Rpb24uc3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbygnQWdlbnRIb3N0UHJvY2Vzc01hbmFnZXI6IGFnZW50IGhvc3Qgc3RhcnRlZCcpO1xuXG5cdFx0XHQvLyBDb25uZWN0IGxvZ2dlciBjaGFubmVsIHNvIGFnZW50IGhvc3QgbG9ncyBhcHBlYXIgaW4gdGhlIG91dHB1dCBjaGFubmVsXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihuZXcgUmVtb3RlTG9nZ2VyQ2hhbm5lbENsaWVudCh0aGlzLl9sb2dnZXJTZXJ2aWNlLCBjb25uZWN0aW9uLmNsaWVudC5nZXRDaGFubmVsKEFnZW50SG9zdElwY0NoYW5uZWxzLkxvZ2dlcikpKTtcblxuXHRcdFx0Ly8gSGFuZGxlIHVuZXhwZWN0ZWQgZXhpdFxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoY29ubmVjdGlvbi5vbkRpZFByb2Nlc3NFeGl0KGUgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuX3dhc1F1aXRSZXF1ZXN0ZWQgJiYgIXRoaXMuX3N0b3JlLmlzRGlzcG9zZWQpIHtcblx0XHRcdFx0XHRjb25zdCB3aWxsUmVzdGFydCA9IHRoaXMuX3Jlc3RhcnRDb3VudCA8PSBDb25zdGFudHMuTWF4UmVzdGFydHM7XG5cdFx0XHRcdFx0cmVwb3J0QWdlbnRIb3N0UHJvY2Vzc0Vycm9yKHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdFx0XHRcdGtpbmQ6ICd1bmV4cGVjdGVkRXhpdCcsXG5cdFx0XHRcdFx0XHRjb2RlOiBlLmNvZGUsXG5cdFx0XHRcdFx0XHRyZXN0YXJ0Q291bnQ6IHRoaXMuX3Jlc3RhcnRDb3VudCxcblx0XHRcdFx0XHRcdHdpbGxSZXN0YXJ0LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmICh3aWxsUmVzdGFydCkge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgQWdlbnRIb3N0UHJvY2Vzc01hbmFnZXI6IGFnZW50IGhvc3QgdGVybWluYXRlZCB1bmV4cGVjdGVkbHkgd2l0aCBjb2RlICR7ZS5jb2RlfWApO1xuXHRcdFx0XHRcdFx0dGhpcy5fcmVzdGFydENvdW50Kys7XG5cdFx0XHRcdFx0XHR0aGlzLl9zdGFydGVkID0gZmFsc2U7XG5cdFx0XHRcdFx0XHRjb25uZWN0aW9uLnN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRcdHRoaXMuX3N0YXJ0KCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYEFnZW50SG9zdFByb2Nlc3NNYW5hZ2VyOiBhZ2VudCBob3N0IHRlcm1pbmF0ZWQgd2l0aCBjb2RlICR7ZS5jb2RlfSwgZ2l2aW5nIHVwIGFmdGVyICR7Q29uc3RhbnRzLk1heFJlc3RhcnRzfSByZXN0YXJ0c2ApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gY29ubmVjdGlvbi5zdG9yZS5kaXNwb3NlKCkpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fc3RhcnRlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcignQWdlbnRIb3N0UHJvY2Vzc01hbmFnZXI6IGZhaWxlZCB0byBzdGFydCBhZ2VudCBob3N0JywgZXJyb3IpO1xuXHRcdFx0cmVwb3J0QWdlbnRIb3N0UHJvY2Vzc0Vycm9yKHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdFx0a2luZDogJ3N0YXJ0RmFpbGVkJyxcblx0XHRcdFx0cmVzdGFydENvdW50OiB0aGlzLl9yZXN0YXJ0Q291bnQsXG5cdFx0XHRcdHdpbGxSZXN0YXJ0OiBmYWxzZSxcblx0XHRcdH0sIGVycm9yKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLG1DQUFtQztBQUM1QyxTQUFTLDRCQUE0QjtBQUVyQyxJQUFLLFlBQUwsa0JBQUtBLGVBQUw7QUFD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
