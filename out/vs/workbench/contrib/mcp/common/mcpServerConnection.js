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
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../../base/common/observable.js";
import { localize } from "../../../../nls.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { log, LogLevel } from "../../../../platform/log/common/log.js";
import { McpServerRequestHandler } from "./mcpServerRequestHandler.js";
import { McpConnectionState } from "./mcpTypes.js";
let McpServerConnection = class extends Disposable {
  constructor(_collection, definition, _delegate, launchDefinition, _logger, _errorOnUserInteraction, _taskManager, _instantiationService) {
    super();
    this._collection = _collection;
    this.definition = definition;
    this._delegate = _delegate;
    this.launchDefinition = launchDefinition;
    this._logger = _logger;
    this._errorOnUserInteraction = _errorOnUserInteraction;
    this._taskManager = _taskManager;
    this._instantiationService = _instantiationService;
    this._launch = this._register(new MutableDisposable());
    this._state = observableValue("mcpServerState", { state: McpConnectionState.Kind.Stopped });
    this._requestHandler = observableValue("mcpServerRequestHandler", void 0);
    this._onPotentialSandboxBlock = this._register(new Emitter());
    this.state = this._state;
    this.handler = this._requestHandler;
    this.onPotentialSandboxBlock = this._onPotentialSandboxBlock.event;
  }
  /** @inheritdoc */
  async start(methods) {
    const currentState = this._state.get();
    if (!McpConnectionState.canBeStarted(currentState.state)) {
      return this._waitForState(McpConnectionState.Kind.Running, McpConnectionState.Kind.Error);
    }
    this._launch.value = void 0;
    this._state.set({ state: McpConnectionState.Kind.Starting }, void 0);
    this._logger.info(localize("mcpServer.starting", "Starting server {0}", this.definition.label));
    try {
      const launch = this._delegate.start(this._collection, this.definition, this.launchDefinition, { errorOnUserInteraction: this._errorOnUserInteraction });
      this._launch.value = this.adoptLaunch(launch, methods);
      return this._waitForState(McpConnectionState.Kind.Running, McpConnectionState.Kind.Error);
    } catch (e) {
      const errorState = {
        state: McpConnectionState.Kind.Error,
        message: e instanceof Error ? e.message : String(e)
      };
      this._state.set(errorState, void 0);
      return errorState;
    }
  }
  adoptLaunch(launch, methods) {
    const store = new DisposableStore();
    const cts = new CancellationTokenSource();
    store.add(toDisposable(() => cts.dispose(true)));
    store.add(launch);
    store.add(launch.onDidLog(({ level, message }) => {
      log(this._logger, level, message);
      const potentialBlock = this._toPotentialSandboxBlock(message);
      if (potentialBlock) {
        this._onPotentialSandboxBlock.fire(potentialBlock);
      }
    }));
    let didStart = false;
    store.add(autorun((reader) => {
      const state = launch.state.read(reader);
      this._state.set(state, void 0);
      this._logger.info(localize("mcpServer.state", "Connection state: {0}", McpConnectionState.toString(state)));
      if (state.state === McpConnectionState.Kind.Running && !didStart) {
        didStart = true;
        McpServerRequestHandler.create(this._instantiationService, {
          ...methods,
          launch,
          logger: this._logger,
          requestLogLevel: this.definition.devMode ? LogLevel.Info : LogLevel.Debug,
          taskManager: this._taskManager
        }, cts.token).then(
          (handler) => {
            if (!store.isDisposed) {
              this._requestHandler.set(handler, void 0);
            } else {
              handler.dispose();
            }
          },
          (err) => {
            if (!store.isDisposed && McpConnectionState.isRunning(this._state.read(void 0))) {
              let message = err.message;
              if (err instanceof CancellationError) {
                message = "Server exited before responding to `initialize` request.";
                this._logger.error(message);
              } else {
                this._logger.error(err);
              }
              this._state.set({ state: McpConnectionState.Kind.Error, message }, void 0);
            }
            store.dispose();
          }
        );
      }
    }));
    return { dispose: () => store.dispose(), object: launch };
  }
  async stop() {
    this._logger.info(localize("mcpServer.stopping", "Stopping server {0}", this.definition.label));
    this._launch.value?.object.stop();
    await this._waitForState(McpConnectionState.Kind.Stopped, McpConnectionState.Kind.Error);
  }
  dispose() {
    this._requestHandler.get()?.dispose();
    super.dispose();
    this._state.set({ state: McpConnectionState.Kind.Stopped }, void 0);
  }
  _waitForState(...kinds) {
    const current = this._state.get();
    if (kinds.includes(current.state)) {
      return Promise.resolve(current);
    }
    return new Promise((resolve) => {
      const disposable = autorun((reader) => {
        const state = this._state.read(reader);
        if (kinds.includes(state.state)) {
          disposable.dispose();
          resolve(state);
        }
      });
    });
  }
  _toPotentialSandboxBlock(message) {
    if (!this.definition.sandboxEnabled) {
      return void 0;
    }
    if (/No matching config rule, denying:/i.test(message)) {
      return {
        kind: "network",
        message,
        host: this._extractSandboxHost(message)
      };
    }
    if (/(?:\b(?:EACCES|EPERM|ENOENT|EROFS|fail(?:ed|ure)?)\b|not accessible|read[- ]only)/i.test(message)) {
      return {
        kind: "filesystem",
        message,
        path: this._extractSandboxPath(message)
      };
    }
    return void 0;
  }
  _extractSandboxPath(line) {
    const bracketedPath = line.match(/\[(\/[^\]\r\n]+)\]/);
    if (bracketedPath?.[1]) {
      return bracketedPath[1].trim();
    }
    const quotedPath = line.match(/["'`](\/[^"'`]+)["'`]/);
    if (quotedPath?.[1]) {
      return quotedPath[1];
    }
    const trailingPath = line.match(/(\/[\w.\-~/ ]+)$/);
    return trailingPath?.[1]?.trim();
  }
  _extractSandboxHost(value) {
    const match = value.match(/No matching config rule, denying:\s+(?<host>[^:\s]+):\d+\.?$/i);
    return match?.groups?.host;
  }
};
McpServerConnection = __decorateClass([
  __decorateParam(7, IInstantiationService)
], McpServerConnection);
export {
  McpServerConnection
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9jb21tb24vbWNwU2VydmVyQ29ubmVjdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElSZWZlcmVuY2UsIE11dGFibGVEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nZ2VyLCBsb2csIExvZ0xldmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU1jcEhvc3REZWxlZ2F0ZSwgSU1jcE1lc3NhZ2VUcmFuc3BvcnQgfSBmcm9tICcuL21jcFJlZ2lzdHJ5VHlwZXMuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyUmVxdWVzdEhhbmRsZXIgfSBmcm9tICcuL21jcFNlcnZlclJlcXVlc3RIYW5kbGVyLmpzJztcbmltcG9ydCB7IE1jcFRhc2tNYW5hZ2VyIH0gZnJvbSAnLi9tY3BUYXNrTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJTWNwQ2xpZW50TWV0aG9kcywgSU1jcFBvdGVudGlhbFNhbmRib3hCbG9jaywgSU1jcFNlcnZlckNvbm5lY3Rpb24sIE1jcENvbGxlY3Rpb25EZWZpbml0aW9uLCBNY3BDb25uZWN0aW9uU3RhdGUsIE1jcFNlcnZlckRlZmluaXRpb24sIE1jcFNlcnZlckxhdW5jaCB9IGZyb20gJy4vbWNwVHlwZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgTWNwU2VydmVyQ29ubmVjdGlvbiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTWNwU2VydmVyQ29ubmVjdGlvbiB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhdW5jaCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxJUmVmZXJlbmNlPElNY3BNZXNzYWdlVHJhbnNwb3J0Pj4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlID0gb2JzZXJ2YWJsZVZhbHVlPE1jcENvbm5lY3Rpb25TdGF0ZT4oJ21jcFNlcnZlclN0YXRlJywgeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZCB9KTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVxdWVzdEhhbmRsZXIgPSBvYnNlcnZhYmxlVmFsdWU8TWNwU2VydmVyUmVxdWVzdEhhbmRsZXIgfCB1bmRlZmluZWQ+KCdtY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlcicsIHVuZGVmaW5lZCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUG90ZW50aWFsU2FuZGJveEJsb2NrID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU1jcFBvdGVudGlhbFNhbmRib3hCbG9jaz4oKSk7XG5cblx0cHVibGljIHJlYWRvbmx5IHN0YXRlOiBJT2JzZXJ2YWJsZTxNY3BDb25uZWN0aW9uU3RhdGU+ID0gdGhpcy5fc3RhdGU7XG5cdHB1YmxpYyByZWFkb25seSBoYW5kbGVyOiBJT2JzZXJ2YWJsZTxNY3BTZXJ2ZXJSZXF1ZXN0SGFuZGxlciB8IHVuZGVmaW5lZD4gPSB0aGlzLl9yZXF1ZXN0SGFuZGxlcjtcblx0cHVibGljIHJlYWRvbmx5IG9uUG90ZW50aWFsU2FuZGJveEJsb2NrID0gdGhpcy5fb25Qb3RlbnRpYWxTYW5kYm94QmxvY2suZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY29sbGVjdGlvbjogTWNwQ29sbGVjdGlvbkRlZmluaXRpb24sXG5cdFx0cHVibGljIHJlYWRvbmx5IGRlZmluaXRpb246IE1jcFNlcnZlckRlZmluaXRpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZGVsZWdhdGU6IElNY3BIb3N0RGVsZWdhdGUsXG5cdFx0cHVibGljIHJlYWRvbmx5IGxhdW5jaERlZmluaXRpb246IE1jcFNlcnZlckxhdW5jaCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9sb2dnZXI6IElMb2dnZXIsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZXJyb3JPblVzZXJJbnRlcmFjdGlvbjogYm9vbGVhbiB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90YXNrTWFuYWdlcjogTWNwVGFza01hbmFnZXIsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyBhc3luYyBzdGFydChtZXRob2RzOiBJTWNwQ2xpZW50TWV0aG9kcyk6IFByb21pc2U8TWNwQ29ubmVjdGlvblN0YXRlPiB7XG5cdFx0Y29uc3QgY3VycmVudFN0YXRlID0gdGhpcy5fc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKCFNY3BDb25uZWN0aW9uU3RhdGUuY2FuQmVTdGFydGVkKGN1cnJlbnRTdGF0ZS5zdGF0ZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLl93YWl0Rm9yU3RhdGUoTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuUnVubmluZywgTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3IpO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xhdW5jaC52YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9zdGF0ZS5zZXQoeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RhcnRpbmcgfSwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9sb2dnZXIuaW5mbyhsb2NhbGl6ZSgnbWNwU2VydmVyLnN0YXJ0aW5nJywgJ1N0YXJ0aW5nIHNlcnZlciB7MH0nLCB0aGlzLmRlZmluaXRpb24ubGFiZWwpKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBsYXVuY2ggPSB0aGlzLl9kZWxlZ2F0ZS5zdGFydCh0aGlzLl9jb2xsZWN0aW9uLCB0aGlzLmRlZmluaXRpb24sIHRoaXMubGF1bmNoRGVmaW5pdGlvbiwgeyBlcnJvck9uVXNlckludGVyYWN0aW9uOiB0aGlzLl9lcnJvck9uVXNlckludGVyYWN0aW9uIH0pO1xuXHRcdFx0dGhpcy5fbGF1bmNoLnZhbHVlID0gdGhpcy5hZG9wdExhdW5jaChsYXVuY2gsIG1ldGhvZHMpO1xuXHRcdFx0cmV0dXJuIHRoaXMuX3dhaXRGb3JTdGF0ZShNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5SdW5uaW5nLCBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvcik7XG5cdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0Y29uc3QgZXJyb3JTdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlID0ge1xuXHRcdFx0XHRzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuRXJyb3IsXG5cdFx0XHRcdG1lc3NhZ2U6IGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKVxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX3N0YXRlLnNldChlcnJvclN0YXRlLCB1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuIGVycm9yU3RhdGU7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhZG9wdExhdW5jaChsYXVuY2g6IElNY3BNZXNzYWdlVHJhbnNwb3J0LCBtZXRob2RzOiBJTWNwQ2xpZW50TWV0aG9kcyk6IElSZWZlcmVuY2U8SU1jcE1lc3NhZ2VUcmFuc3BvcnQ+IHtcblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblxuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gY3RzLmRpc3Bvc2UodHJ1ZSkpKTtcblx0XHRzdG9yZS5hZGQobGF1bmNoKTtcblx0XHRzdG9yZS5hZGQobGF1bmNoLm9uRGlkTG9nKCh7IGxldmVsLCBtZXNzYWdlIH0pID0+IHtcblx0XHRcdGxvZyh0aGlzLl9sb2dnZXIsIGxldmVsLCBtZXNzYWdlKTtcblx0XHRcdGNvbnN0IHBvdGVudGlhbEJsb2NrID0gdGhpcy5fdG9Qb3RlbnRpYWxTYW5kYm94QmxvY2sobWVzc2FnZSk7XG5cdFx0XHRpZiAocG90ZW50aWFsQmxvY2spIHtcblx0XHRcdFx0dGhpcy5fb25Qb3RlbnRpYWxTYW5kYm94QmxvY2suZmlyZShwb3RlbnRpYWxCbG9jayk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0bGV0IGRpZFN0YXJ0ID0gZmFsc2U7XG5cdFx0c3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gbGF1bmNoLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuX3N0YXRlLnNldChzdGF0ZSwgdW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX2xvZ2dlci5pbmZvKGxvY2FsaXplKCdtY3BTZXJ2ZXIuc3RhdGUnLCAnQ29ubmVjdGlvbiBzdGF0ZTogezB9JywgTWNwQ29ubmVjdGlvblN0YXRlLnRvU3RyaW5nKHN0YXRlKSkpO1xuXG5cdFx0XHRpZiAoc3RhdGUuc3RhdGUgPT09IE1jcENvbm5lY3Rpb25TdGF0ZS5LaW5kLlJ1bm5pbmcgJiYgIWRpZFN0YXJ0KSB7XG5cdFx0XHRcdGRpZFN0YXJ0ID0gdHJ1ZTtcblx0XHRcdFx0TWNwU2VydmVyUmVxdWVzdEhhbmRsZXIuY3JlYXRlKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLCB7XG5cdFx0XHRcdFx0Li4ubWV0aG9kcyxcblx0XHRcdFx0XHRsYXVuY2gsXG5cdFx0XHRcdFx0bG9nZ2VyOiB0aGlzLl9sb2dnZXIsXG5cdFx0XHRcdFx0cmVxdWVzdExvZ0xldmVsOiB0aGlzLmRlZmluaXRpb24uZGV2TW9kZSA/IExvZ0xldmVsLkluZm8gOiBMb2dMZXZlbC5EZWJ1Zyxcblx0XHRcdFx0XHR0YXNrTWFuYWdlcjogdGhpcy5fdGFza01hbmFnZXIsXG5cdFx0XHRcdH0sIGN0cy50b2tlbikudGhlbihcblx0XHRcdFx0XHRoYW5kbGVyID0+IHtcblx0XHRcdFx0XHRcdGlmICghc3RvcmUuaXNEaXNwb3NlZCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9yZXF1ZXN0SGFuZGxlci5zZXQoaGFuZGxlciwgdW5kZWZpbmVkKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGhhbmRsZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZXJyID0+IHtcblx0XHRcdFx0XHRcdGlmICghc3RvcmUuaXNEaXNwb3NlZCAmJiBNY3BDb25uZWN0aW9uU3RhdGUuaXNSdW5uaW5nKHRoaXMuX3N0YXRlLnJlYWQodW5kZWZpbmVkKSkpIHtcblx0XHRcdFx0XHRcdFx0bGV0IG1lc3NhZ2UgPSBlcnIubWVzc2FnZTtcblx0XHRcdFx0XHRcdFx0aWYgKGVyciBpbnN0YW5jZW9mIENhbmNlbGxhdGlvbkVycm9yKSB7XG5cdFx0XHRcdFx0XHRcdFx0bWVzc2FnZSA9ICdTZXJ2ZXIgZXhpdGVkIGJlZm9yZSByZXNwb25kaW5nIHRvIGBpbml0aWFsaXplYCByZXF1ZXN0Lic7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fbG9nZ2VyLmVycm9yKG1lc3NhZ2UpO1xuXHRcdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX2xvZ2dlci5lcnJvcihlcnIpO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3N0YXRlLnNldCh7IHN0YXRlOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvciwgbWVzc2FnZSB9LCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0c3RvcmUuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHsgZGlzcG9zZTogKCkgPT4gc3RvcmUuZGlzcG9zZSgpLCBvYmplY3Q6IGxhdW5jaCB9O1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHN0b3AoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5fbG9nZ2VyLmluZm8obG9jYWxpemUoJ21jcFNlcnZlci5zdG9wcGluZycsICdTdG9wcGluZyBzZXJ2ZXIgezB9JywgdGhpcy5kZWZpbml0aW9uLmxhYmVsKSk7XG5cdFx0dGhpcy5fbGF1bmNoLnZhbHVlPy5vYmplY3Quc3RvcCgpO1xuXHRcdGF3YWl0IHRoaXMuX3dhaXRGb3JTdGF0ZShNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5TdG9wcGVkLCBNY3BDb25uZWN0aW9uU3RhdGUuS2luZC5FcnJvcik7XG5cdH1cblxuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXF1ZXN0SGFuZGxlci5nZXQoKT8uZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zdGF0ZS5zZXQoeyBzdGF0ZTogTWNwQ29ubmVjdGlvblN0YXRlLktpbmQuU3RvcHBlZCB9LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfd2FpdEZvclN0YXRlKC4uLmtpbmRzOiBNY3BDb25uZWN0aW9uU3RhdGUuS2luZFtdKTogUHJvbWlzZTxNY3BDb25uZWN0aW9uU3RhdGU+IHtcblx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKGtpbmRzLmluY2x1ZGVzKGN1cnJlbnQuc3RhdGUpKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGN1cnJlbnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoa2luZHMuaW5jbHVkZXMoc3RhdGUuc3RhdGUpKSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZShzdGF0ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfdG9Qb3RlbnRpYWxTYW5kYm94QmxvY2sobWVzc2FnZTogc3RyaW5nKTogSU1jcFBvdGVudGlhbFNhbmRib3hCbG9jayB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmRlZmluaXRpb24uc2FuZGJveEVuYWJsZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKC9ObyBtYXRjaGluZyBjb25maWcgcnVsZSwgZGVueWluZzovaS50ZXN0KG1lc3NhZ2UpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAnbmV0d29yaycsXG5cdFx0XHRcdG1lc3NhZ2UsXG5cdFx0XHRcdGhvc3Q6IHRoaXMuX2V4dHJhY3RTYW5kYm94SG9zdChtZXNzYWdlKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKC8oPzpcXGIoPzpFQUNDRVN8RVBFUk18RU5PRU5UfEVST0ZTfGZhaWwoPzplZHx1cmUpPylcXGJ8bm90IGFjY2Vzc2libGV8cmVhZFstIF1vbmx5KS9pLnRlc3QobWVzc2FnZSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6ICdmaWxlc3lzdGVtJyxcblx0XHRcdFx0bWVzc2FnZSxcblx0XHRcdFx0cGF0aDogdGhpcy5fZXh0cmFjdFNhbmRib3hQYXRoKG1lc3NhZ2UpLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfZXh0cmFjdFNhbmRib3hQYXRoKGxpbmU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYnJhY2tldGVkUGF0aCA9IGxpbmUubWF0Y2goL1xcWyhcXC9bXlxcXVxcclxcbl0rKVxcXS8pO1xuXHRcdGlmIChicmFja2V0ZWRQYXRoPy5bMV0pIHtcblx0XHRcdHJldHVybiBicmFja2V0ZWRQYXRoWzFdLnRyaW0oKTtcblx0XHR9XG5cblx0XHRjb25zdCBxdW90ZWRQYXRoID0gbGluZS5tYXRjaCgvW1wiJ2BdKFxcL1teXCInYF0rKVtcIidgXS8pO1xuXHRcdGlmIChxdW90ZWRQYXRoPy5bMV0pIHtcblx0XHRcdHJldHVybiBxdW90ZWRQYXRoWzFdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRyYWlsaW5nUGF0aCA9IGxpbmUubWF0Y2goLyhcXC9bXFx3LlxcLX4vIF0rKSQvKTtcblx0XHRyZXR1cm4gdHJhaWxpbmdQYXRoPy5bMV0/LnRyaW0oKTtcblx0fVxuXG5cdHByaXZhdGUgX2V4dHJhY3RTYW5kYm94SG9zdCh2YWx1ZTogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBtYXRjaCA9IHZhbHVlLm1hdGNoKC9ObyBtYXRjaGluZyBjb25maWcgcnVsZSwgZGVueWluZzpcXHMrKD88aG9zdD5bXjpcXHNdKyk6XFxkK1xcLj8kL2kpO1xuXHRcdHJldHVybiBtYXRjaD8uZ3JvdXBzPy5ob3N0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksaUJBQTZCLG1CQUFtQixvQkFBb0I7QUFDekYsU0FBUyxTQUFzQix1QkFBdUI7QUFDdEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBa0IsS0FBSyxnQkFBZ0I7QUFFdkMsU0FBUywrQkFBK0I7QUFFeEMsU0FBc0csMEJBQWdFO0FBRS9KLElBQU0sc0JBQU4sY0FBa0MsV0FBMkM7QUFBQSxFQVVuRixZQUNrQixhQUNELFlBQ0MsV0FDRCxrQkFDQyxTQUNBLHlCQUNBLGNBQ3VCLHVCQUN2QztBQUNELFVBQU07QUFUVztBQUNEO0FBQ0M7QUFDRDtBQUNDO0FBQ0E7QUFDQTtBQUN1QjtBQWpCekMsU0FBaUIsVUFBVSxLQUFLLFVBQVUsSUFBSSxrQkFBb0QsQ0FBQztBQUNuRyxTQUFpQixTQUFTLGdCQUFvQyxrQkFBa0IsRUFBRSxPQUFPLG1CQUFtQixLQUFLLFFBQVEsQ0FBQztB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
