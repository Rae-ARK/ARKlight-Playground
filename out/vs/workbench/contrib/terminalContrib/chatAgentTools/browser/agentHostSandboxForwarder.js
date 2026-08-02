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
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { equals } from "../../../../../base/common/objects.js";
import { AgentHostSdkSandboxEnabledSettingId } from "../../../../../platform/agentHost/common/agentService.js";
import { AgentHostCustomTerminalToolEnabledSettingId } from "../../../../../platform/agentHost/common/copilotCliConfig.js";
import { IAgentHostConnectionsService } from "../../../../../platform/agentHost/common/agentHostConnectionsService.js";
import { AgentHostSandboxConfigKey, AgentHostSandboxKey } from "../../../../../platform/agentHost/common/sandboxConfigSchema.js";
import { AgentSandboxEnabledValue } from "../../../../../platform/sandbox/common/settings.js";
import { ActionType } from "../../../../../platform/agentHost/common/state/protocol/actions.js";
import { ROOT_STATE_URI } from "../../../../../platform/agentHost/common/state/sessionState.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { readAgentHostSandboxValues, SANDBOX_SETTING_KEYS } from "../common/sandboxSettingsReader.js";
const HOST_POLICY_SETTING_KEYS = [
  AgentHostCustomTerminalToolEnabledSettingId,
  AgentHostSdkSandboxEnabledSettingId
];
let AgentHostSandboxForwarder = class extends Disposable {
  constructor(_connectionsService, _configurationService, _logService) {
    super();
    this._connectionsService = _connectionsService;
    this._configurationService = _configurationService;
    this._logService = _logService;
    /**
     * Connections that have already had their initial push attempted
     * (successfully or via a pending listener waiting for the sandbox
     * schema). Used to avoid re-scheduling pushes for connections that
     * are still present across `onDidChangeConnections` events.
     */
    this._scheduled = /* @__PURE__ */ new Map();
    this._register(this._configurationService.onDidChangeConfiguration((e) => {
      if (SANDBOX_SETTING_KEYS.some((key) => e.affectsConfiguration(key)) || HOST_POLICY_SETTING_KEYS.some((key) => e.affectsConfiguration(key))) {
        this._desired = void 0;
        this._pushToAllConnections();
      }
    }));
    this._register(this._connectionsService.onDidChangeConnections(() => {
      this._syncConnectionListeners();
    }));
    this._syncConnectionListeners();
  }
  _syncConnectionListeners() {
    const live = /* @__PURE__ */ new Set();
    for (const info of this._connectionsService.connections) {
      if (!info.connection) {
        continue;
      }
      live.add(info.connection);
      if (!this._scheduled.has(info.connection)) {
        this._scheduleInitialPush(info.connection);
      }
    }
    for (const [connection, listener] of this._scheduled) {
      if (!live.has(connection)) {
        listener.dispose();
        this._scheduled.delete(connection);
      }
    }
  }
  /**
   * Push immediately if the host is already advertising the sandbox
   * schema; otherwise subscribe to `rootState.onDidChange` long enough
   * to catch the schema and push exactly once, then unsubscribe.
   */
  _scheduleInitialPush(connection) {
    if (this._tryPush(connection)) {
      this._scheduled.set(connection, Disposable.None);
      return;
    }
    const listener = connection.rootState.onDidChange(() => {
      if (this._tryPush(connection)) {
        this._scheduled.get(connection)?.dispose();
        this._scheduled.set(connection, Disposable.None);
      }
    });
    this._scheduled.set(connection, listener);
  }
  _pushToAllConnections() {
    for (const info of this._connectionsService.connections) {
      if (info.connection) {
        this._tryPush(info.connection);
      }
    }
  }
  /**
   * Attempt to dispatch the desired sandbox config to `connection`.
   * Returns `true` once the host has advertised the sandbox schema
   * (whether or not an actual dispatch was needed); `false` if the
   * schema is not yet available and the caller should keep waiting.
   */
  _tryPush(connection) {
    const rootState = connection.rootState.value;
    if (!rootState || rootState instanceof Error) {
      return false;
    }
    const schemaProperties = rootState.config?.schema.properties;
    if (!schemaProperties?.[AgentHostSandboxConfigKey.Sandbox]) {
      return false;
    }
    const desired = this._getDesired();
    const current = rootState.config?.values?.[AgentHostSandboxConfigKey.Sandbox] ?? {};
    if (!equals(current, desired)) {
      connection.dispatch(ROOT_STATE_URI, {
        type: ActionType.RootConfigChanged,
        config: { [AgentHostSandboxConfigKey.Sandbox]: desired }
      });
    }
    return true;
  }
  _getDesired() {
    if (this._desired === void 0) {
      this._desired = this._computeDesired();
    }
    return this._desired;
  }
  /**
   * Compute the sandbox config to forward to the Agent Host.
   *
   *  - When the Agent Host's own terminal sandbox engine is enabled
   *    (`chat.agentHost.customTerminalTool.enabled === true`), forward the
   *    user's full `chat.agent.sandbox.*` policy verbatim. The engine reads
   *    those values directly.
   *
   *  - Otherwise (the SDK runs the shell tool), gate on
   *    `chat.agentHost.sdkSandbox.enabled`:
   *      - `'off'` (the default) — forward an empty object so any
   *        previously-pushed values are cleared and the SDK runs commands
   *        unsandboxed.
   *      - `'on'` / `'allowNetwork'` — forward the user's policy but
   *        override both `enabled` and `enabled.windows` with the SDK
   *        sandbox value. The SDK sandbox mode is independent of the
   *        engine sandbox mode, so the user can run the SDK sandboxed
   *        even when the engine sandbox is off.
   */
  _computeDesired() {
    const customTerminalToolEnabled = this._configurationService.getValue(AgentHostCustomTerminalToolEnabledSettingId) === true;
    const values = readAgentHostSandboxValues(this._configurationService, this._logService);
    if (customTerminalToolEnabled) {
      return values;
    }
    const sdkSandbox = this._configurationService.getValue(AgentHostSdkSandboxEnabledSettingId) ?? AgentSandboxEnabledValue.Off;
    if (sdkSandbox !== AgentSandboxEnabledValue.On && sdkSandbox !== AgentSandboxEnabledValue.AllowNetwork) {
      return {};
    }
    values[AgentHostSandboxKey.Enabled] = sdkSandbox;
    values[AgentHostSandboxKey.WindowsEnabled] = sdkSandbox;
    return values;
  }
  dispose() {
    for (const listener of this._scheduled.values()) {
      listener.dispose();
    }
    this._scheduled.clear();
    super.dispose();
  }
};
AgentHostSandboxForwarder.ID = "workbench.contrib.agentHostSandboxForwarder";
AgentHostSandboxForwarder = __decorateClass([
  __decorateParam(0, IAgentHostConnectionsService),
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, ILogService)
], AgentHostSandboxForwarder);
export {
  AgentHostSandboxForwarder
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9jaGF0QWdlbnRUb29scy9icm93c2VyL2FnZW50SG9zdFNhbmRib3hGb3J3YXJkZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNka1NhbmRib3hFbmFibGVkU2V0dGluZ0lkLCBJQWdlbnRDb25uZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q3VzdG9tVGVybWluYWxUb29sRW5hYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vY29waWxvdENsaUNvbmZpZy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RDb25uZWN0aW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U2FuZGJveENvbmZpZ0tleSwgQWdlbnRIb3N0U2FuZGJveEtleSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc2FuZGJveENvbmZpZ1NjaGVtYS5qcyc7XG5pbXBvcnQgeyBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zYW5kYm94L2NvbW1vbi9zZXR0aW5ncy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9hY3Rpb25zLmpzJztcbmltcG9ydCB7IFJPT1RfU1RBVEVfVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyByZWFkQWdlbnRIb3N0U2FuZGJveFZhbHVlcywgU0FOREJPWF9TRVRUSU5HX0tFWVMgfSBmcm9tICcuLi9jb21tb24vc2FuZGJveFNldHRpbmdzUmVhZGVyLmpzJztcblxuLyoqXG4gKiBXb3JrYmVuY2gtc2lkZSBob3N0LXBvbGljeSBnYXRlcyB0aGF0IGFmZmVjdCB3aGljaCBzYW5kYm94IGNvbmZpZyB0aGUgaG9zdFxuICogc2VuZHMgdG8gdGhlIEFnZW50IEhvc3QuIENoYW5nZXMgdG8gZWl0aGVyIG9mIHRoZXNlIHNldHRpbmdzIGludmFsaWRhdGVcbiAqIHRoZSBjYWNoZWQgXCJkZXNpcmVkXCIgY29uZmlnIGFuZCB0cmlnZ2VyIGEgcmUtcHVzaC5cbiAqL1xuY29uc3QgSE9TVF9QT0xJQ1lfU0VUVElOR19LRVlTOiByZWFkb25seSBzdHJpbmdbXSA9IFtcblx0QWdlbnRIb3N0Q3VzdG9tVGVybWluYWxUb29sRW5hYmxlZFNldHRpbmdJZCxcblx0QWdlbnRIb3N0U2RrU2FuZGJveEVuYWJsZWRTZXR0aW5nSWQsXG5dO1xuXG4vKipcbiAqIEZvcndhcmRzIHRoZSB3b3JrYmVuY2ggdXNlcidzIHNhbmRib3ggc2V0dGluZyB2YWx1ZXMgaW50byBldmVyeSBjb25uZWN0ZWRcbiAqIGFnZW50IGhvc3QgKGxvY2FsICsgcmVtb3RlKSB2aWEgYFJvb3RDb25maWdDaGFuZ2VkYCBhY3Rpb25zLCBzbyB0aGVcbiAqIGFnZW50LWhvc3QgdGVybWluYWwgc2FuZGJveCBlbmdpbmUgY2FuIG1pcnJvciB0aGUgdXNlcidzIHByZWZlcmVuY2VzLlxuICpcbiAqIFRoZSBmb3J3YXJkZXIgaXMgZGVsaWJlcmF0ZWx5IG9uZS1kaXJlY3Rpb25hbDogaXQgcHVzaGVzIG9ubHkgd2hlblxuICogIC0gYSBjb25uZWN0aW9uIGNvbWVzIG9ubGluZSAoaW5pdGlhbCBwdXNoLCBkZWZlcnJlZCB1bnRpbCB0aGUgaG9zdFxuICogICAgYWR2ZXJ0aXNlcyB0aGUgc2FuZGJveCBzY2hlbWEpLCBvclxuICogIC0gYSBzYW5kYm94LXJlbGF0ZWQgd29ya2JlbmNoIHNldHRpbmcgY2hhbmdlcy5cbiAqXG4gKiBJdCBkb2VzIE5PVCByZWFjdCB0byBhZ2VudC1ob3N0IHJvb3Qtc3RhdGUgY2hhbmdlcyBhZnRlciB0aGUgaW5pdGlhbFxuICogcHVzaCwgc28gY29uY3VycmVudCBlZGl0cyBjb21pbmcgZnJvbSB0aGUgaG9zdCAob3IgZnJvbSBhbm90aGVyIGNsaWVudFxuICogYXR0YWNoZWQgdG8gdGhlIHNhbWUgaG9zdCkgZG8gbm90IHRyaWdnZXIgYSBwdXNoLWJhY2sgbG9vcC4gRWFjaCBwdXNoXG4gKiBpcyBzY2hlbWEtZ3VhcmRlZCBzbyBvbGRlciBob3N0cyB0aGF0IGRvbid0IGFkdmVydGlzZSB0aGUgc2FuZGJveCBrZXlzXG4gKiBhcmUgc2tpcHBlZCBzaWxlbnRseS5cbiAqL1xuZXhwb3J0IGNsYXNzIEFnZW50SG9zdFNhbmRib3hGb3J3YXJkZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5hZ2VudEhvc3RTYW5kYm94Rm9yd2FyZGVyJztcblxuXHQvKipcblx0ICogQ29ubmVjdGlvbnMgdGhhdCBoYXZlIGFscmVhZHkgaGFkIHRoZWlyIGluaXRpYWwgcHVzaCBhdHRlbXB0ZWRcblx0ICogKHN1Y2Nlc3NmdWxseSBvciB2aWEgYSBwZW5kaW5nIGxpc3RlbmVyIHdhaXRpbmcgZm9yIHRoZSBzYW5kYm94XG5cdCAqIHNjaGVtYSkuIFVzZWQgdG8gYXZvaWQgcmUtc2NoZWR1bGluZyBwdXNoZXMgZm9yIGNvbm5lY3Rpb25zIHRoYXRcblx0ICogYXJlIHN0aWxsIHByZXNlbnQgYWNyb3NzIGBvbkRpZENoYW5nZUNvbm5lY3Rpb25zYCBldmVudHMuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zY2hlZHVsZWQgPSBuZXcgTWFwPElBZ2VudENvbm5lY3Rpb24sIElEaXNwb3NhYmxlPigpO1xuXG5cdHByaXZhdGUgX2Rlc2lyZWQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWdlbnRIb3N0Q29ubmVjdGlvbnNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb25zU2VydmljZTogSUFnZW50SG9zdENvbm5lY3Rpb25zU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKFNBTkRCT1hfU0VUVElOR19LRVlTLnNvbWUoa2V5ID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oa2V5KSlcblx0XHRcdFx0fHwgSE9TVF9QT0xJQ1lfU0VUVElOR19LRVlTLnNvbWUoa2V5ID0+IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oa2V5KSkpIHtcblx0XHRcdFx0dGhpcy5fZGVzaXJlZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5fcHVzaFRvQWxsQ29ubmVjdGlvbnMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jb25uZWN0aW9uc1NlcnZpY2Uub25EaWRDaGFuZ2VDb25uZWN0aW9ucygoKSA9PiB7XG5cdFx0XHR0aGlzLl9zeW5jQ29ubmVjdGlvbkxpc3RlbmVycygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9zeW5jQ29ubmVjdGlvbkxpc3RlbmVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3luY0Nvbm5lY3Rpb25MaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgbGl2ZSA9IG5ldyBTZXQ8SUFnZW50Q29ubmVjdGlvbj4oKTtcblx0XHRmb3IgKGNvbnN0IGluZm8gb2YgdGhpcy5fY29ubmVjdGlvbnNTZXJ2aWNlLmNvbm5lY3Rpb25zKSB7XG5cdFx0XHRpZiAoIWluZm8uY29ubmVjdGlvbikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGxpdmUuYWRkKGluZm8uY29ubmVjdGlvbik7XG5cdFx0XHRpZiAoIXRoaXMuX3NjaGVkdWxlZC5oYXMoaW5mby5jb25uZWN0aW9uKSkge1xuXHRcdFx0XHR0aGlzLl9zY2hlZHVsZUluaXRpYWxQdXNoKGluZm8uY29ubmVjdGlvbik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgW2Nvbm5lY3Rpb24sIGxpc3RlbmVyXSBvZiB0aGlzLl9zY2hlZHVsZWQpIHtcblx0XHRcdGlmICghbGl2ZS5oYXMoY29ubmVjdGlvbikpIHtcblx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHR0aGlzLl9zY2hlZHVsZWQuZGVsZXRlKGNvbm5lY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBQdXNoIGltbWVkaWF0ZWx5IGlmIHRoZSBob3N0IGlzIGFscmVhZHkgYWR2ZXJ0aXNpbmcgdGhlIHNhbmRib3hcblx0ICogc2NoZW1hOyBvdGhlcndpc2Ugc3Vic2NyaWJlIHRvIGByb290U3RhdGUub25EaWRDaGFuZ2VgIGxvbmcgZW5vdWdoXG5cdCAqIHRvIGNhdGNoIHRoZSBzY2hlbWEgYW5kIHB1c2ggZXhhY3RseSBvbmNlLCB0aGVuIHVuc3Vic2NyaWJlLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2NoZWR1bGVJbml0aWFsUHVzaChjb25uZWN0aW9uOiBJQWdlbnRDb25uZWN0aW9uKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3RyeVB1c2goY29ubmVjdGlvbikpIHtcblx0XHRcdHRoaXMuX3NjaGVkdWxlZC5zZXQoY29ubmVjdGlvbiwgRGlzcG9zYWJsZS5Ob25lKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSBjb25uZWN0aW9uLnJvb3RTdGF0ZS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5fdHJ5UHVzaChjb25uZWN0aW9uKSkge1xuXHRcdFx0XHR0aGlzLl9zY2hlZHVsZWQuZ2V0KGNvbm5lY3Rpb24pPy5kaXNwb3NlKCk7XG5cdFx0XHRcdHRoaXMuX3NjaGVkdWxlZC5zZXQoY29ubmVjdGlvbiwgRGlzcG9zYWJsZS5Ob25lKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0aGlzLl9zY2hlZHVsZWQuc2V0KGNvbm5lY3Rpb24sIGxpc3RlbmVyKTtcblx0fVxuXG5cdHByaXZhdGUgX3B1c2hUb0FsbENvbm5lY3Rpb25zKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgaW5mbyBvZiB0aGlzLl9jb25uZWN0aW9uc1NlcnZpY2UuY29ubmVjdGlvbnMpIHtcblx0XHRcdGlmIChpbmZvLmNvbm5lY3Rpb24pIHtcblx0XHRcdFx0dGhpcy5fdHJ5UHVzaChpbmZvLmNvbm5lY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBdHRlbXB0IHRvIGRpc3BhdGNoIHRoZSBkZXNpcmVkIHNhbmRib3ggY29uZmlnIHRvIGBjb25uZWN0aW9uYC5cblx0ICogUmV0dXJucyBgdHJ1ZWAgb25jZSB0aGUgaG9zdCBoYXMgYWR2ZXJ0aXNlZCB0aGUgc2FuZGJveCBzY2hlbWFcblx0ICogKHdoZXRoZXIgb3Igbm90IGFuIGFjdHVhbCBkaXNwYXRjaCB3YXMgbmVlZGVkKTsgYGZhbHNlYCBpZiB0aGVcblx0ICogc2NoZW1hIGlzIG5vdCB5ZXQgYXZhaWxhYmxlIGFuZCB0aGUgY2FsbGVyIHNob3VsZCBrZWVwIHdhaXRpbmcuXG5cdCAqL1xuXHRwcml2YXRlIF90cnlQdXNoKGNvbm5lY3Rpb246IElBZ2VudENvbm5lY3Rpb24pOiBib29sZWFuIHtcblx0XHRjb25zdCByb290U3RhdGUgPSBjb25uZWN0aW9uLnJvb3RTdGF0ZS52YWx1ZTtcblx0XHRpZiAoIXJvb3RTdGF0ZSB8fCByb290U3RhdGUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBzY2hlbWFQcm9wZXJ0aWVzID0gcm9vdFN0YXRlLmNvbmZpZz8uc2NoZW1hLnByb3BlcnRpZXM7XG5cdFx0aWYgKCFzY2hlbWFQcm9wZXJ0aWVzPy5bQWdlbnRIb3N0U2FuZGJveENvbmZpZ0tleS5TYW5kYm94XSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBkZXNpcmVkID0gdGhpcy5fZ2V0RGVzaXJlZCgpO1xuXHRcdGNvbnN0IGN1cnJlbnQgPSAocm9vdFN0YXRlLmNvbmZpZz8udmFsdWVzPy5bQWdlbnRIb3N0U2FuZGJveENvbmZpZ0tleS5TYW5kYm94XSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCkgPz8ge307XG5cdFx0aWYgKCFlcXVhbHMoY3VycmVudCwgZGVzaXJlZCkpIHtcblx0XHRcdGNvbm5lY3Rpb24uZGlzcGF0Y2goUk9PVF9TVEFURV9VUkksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IFtBZ2VudEhvc3RTYW5kYm94Q29uZmlnS2V5LlNhbmRib3hdOiBkZXNpcmVkIH0sXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRwcml2YXRlIF9nZXREZXNpcmVkKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHtcblx0XHRpZiAodGhpcy5fZGVzaXJlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9kZXNpcmVkID0gdGhpcy5fY29tcHV0ZURlc2lyZWQoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX2Rlc2lyZWQ7XG5cdH1cblxuXHQvKipcblx0ICogQ29tcHV0ZSB0aGUgc2FuZGJveCBjb25maWcgdG8gZm9yd2FyZCB0byB0aGUgQWdlbnQgSG9zdC5cblx0ICpcblx0ICogIC0gV2hlbiB0aGUgQWdlbnQgSG9zdCdzIG93biB0ZXJtaW5hbCBzYW5kYm94IGVuZ2luZSBpcyBlbmFibGVkXG5cdCAqICAgIChgY2hhdC5hZ2VudEhvc3QuY3VzdG9tVGVybWluYWxUb29sLmVuYWJsZWQgPT09IHRydWVgKSwgZm9yd2FyZCB0aGVcblx0ICogICAgdXNlcidzIGZ1bGwgYGNoYXQuYWdlbnQuc2FuZGJveC4qYCBwb2xpY3kgdmVyYmF0aW0uIFRoZSBlbmdpbmUgcmVhZHNcblx0ICogICAgdGhvc2UgdmFsdWVzIGRpcmVjdGx5LlxuXHQgKlxuXHQgKiAgLSBPdGhlcndpc2UgKHRoZSBTREsgcnVucyB0aGUgc2hlbGwgdG9vbCksIGdhdGUgb25cblx0ICogICAgYGNoYXQuYWdlbnRIb3N0LnNka1NhbmRib3guZW5hYmxlZGA6XG5cdCAqICAgICAgLSBgJ29mZidgICh0aGUgZGVmYXVsdCkgXHUyMDE0IGZvcndhcmQgYW4gZW1wdHkgb2JqZWN0IHNvIGFueVxuXHQgKiAgICAgICAgcHJldmlvdXNseS1wdXNoZWQgdmFsdWVzIGFyZSBjbGVhcmVkIGFuZCB0aGUgU0RLIHJ1bnMgY29tbWFuZHNcblx0ICogICAgICAgIHVuc2FuZGJveGVkLlxuXHQgKiAgICAgIC0gYCdvbidgIC8gYCdhbGxvd05ldHdvcmsnYCBcdTIwMTQgZm9yd2FyZCB0aGUgdXNlcidzIHBvbGljeSBidXRcblx0ICogICAgICAgIG92ZXJyaWRlIGJvdGggYGVuYWJsZWRgIGFuZCBgZW5hYmxlZC53aW5kb3dzYCB3aXRoIHRoZSBTREtcblx0ICogICAgICAgIHNhbmRib3ggdmFsdWUuIFRoZSBTREsgc2FuZGJveCBtb2RlIGlzIGluZGVwZW5kZW50IG9mIHRoZVxuXHQgKiAgICAgICAgZW5naW5lIHNhbmRib3ggbW9kZSwgc28gdGhlIHVzZXIgY2FuIHJ1biB0aGUgU0RLIHNhbmRib3hlZFxuXHQgKiAgICAgICAgZXZlbiB3aGVuIHRoZSBlbmdpbmUgc2FuZGJveCBpcyBvZmYuXG5cdCAqL1xuXHRwcml2YXRlIF9jb21wdXRlRGVzaXJlZCgpOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB7XG5cdFx0Y29uc3QgY3VzdG9tVGVybWluYWxUb29sRW5hYmxlZCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFnZW50SG9zdEN1c3RvbVRlcm1pbmFsVG9vbEVuYWJsZWRTZXR0aW5nSWQpID09PSB0cnVlO1xuXHRcdGNvbnN0IHZhbHVlcyA9IHJlYWRBZ2VudEhvc3RTYW5kYm94VmFsdWVzKHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGlzLl9sb2dTZXJ2aWNlKTtcblx0XHRpZiAoY3VzdG9tVGVybWluYWxUb29sRW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuIHZhbHVlcztcblx0XHR9XG5cdFx0Y29uc3Qgc2RrU2FuZGJveCA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZT4oQWdlbnRIb3N0U2RrU2FuZGJveEVuYWJsZWRTZXR0aW5nSWQpID8/IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PZmY7XG5cdFx0aWYgKHNka1NhbmRib3ggIT09IEFnZW50U2FuZGJveEVuYWJsZWRWYWx1ZS5PbiAmJiBzZGtTYW5kYm94ICE9PSBBZ2VudFNhbmRib3hFbmFibGVkVmFsdWUuQWxsb3dOZXR3b3JrKSB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHRcdHZhbHVlc1tBZ2VudEhvc3RTYW5kYm94S2V5LkVuYWJsZWRdID0gc2RrU2FuZGJveDtcblx0XHR2YWx1ZXNbQWdlbnRIb3N0U2FuZGJveEtleS5XaW5kb3dzRW5hYmxlZF0gPSBzZGtTYW5kYm94O1xuXHRcdHJldHVybiB2YWx1ZXM7XG5cdH1cblxuXHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgbGlzdGVuZXIgb2YgdGhpcy5fc2NoZWR1bGVkLnZhbHVlcygpKSB7XG5cdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3NjaGVkdWxlZC5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUErQjtBQUN4QyxTQUFTLGNBQWM7QUFDdkIsU0FBUywyQ0FBNkQ7QUFDdEUsU0FBUyxtREFBbUQ7QUFDNUQsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUywyQkFBMkIsMkJBQTJCO0FBQy9ELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsNEJBQTRCLDRCQUE0QjtBQU9qRSxNQUFNLDJCQUE4QztBQUFBLEVBQ25EO0FBQUEsRUFDQTtBQUNEO0FBa0JPLElBQU0sNEJBQU4sY0FBd0MsV0FBNkM7QUFBQSxFQWEzRixZQUNnRCxxQkFDUCx1QkFDVixhQUM3QjtBQUNELFVBQU07QUFKeUM7QUFDUDtBQUNWO0FBUC9CO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQWlCLGFBQWEsb0JBQUksSUFBbUM7QUFXcEUsU0FBSyxVQUFVLEtBQUssc0JBQXNCLHlCQUF5QixPQUFLO0FBQ3ZFLFVBQUkscUJBQXFCLEtBQUssU0FBTyxFQUFFLHFCQUFxQixHQUFHLENBQUMsS0FDNUQseUJBQXlCLEtBQUssU0FBTyxFQUFFLHFCQUFxQixHQUFHLENBQUMsR0FBRztBQUN0RSxhQUFLLFdBQVc7QUFDaEIsYUFBSyxzQkFBc0I7QUFBQSxNQUM1QjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLEtBQUssb0JBQW9CLHVCQUF1QixNQUFNO0FBQ3BFLFdBQUsseUJBQXlCO0FBQUEsSUFDL0IsQ0FBQyxDQUFDO0FBQ0YsU0FBSyx5QkFBeUI7QUFBQSxFQUMvQjtBQUFBLEVBRVEsMkJBQWlDO0FBQ3hDLFVBQU0sT0FBTyxv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
