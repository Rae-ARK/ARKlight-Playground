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
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { INotificationService, NeverShowAgainScope, Severity } from "../../../../platform/notification/common/notification.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { IChatService } from "../common/chatService/chatService.js";
import { IPluginMarketplaceService } from "../common/plugins/pluginMarketplaceService.js";
let AgentPluginRecommendations = class extends Disposable {
  constructor(_chatService, _pluginMarketplaceService, _notificationService, _extensionsWorkbenchService) {
    super();
    this._chatService = _chatService;
    this._pluginMarketplaceService = _pluginMarketplaceService;
    this._notificationService = _notificationService;
    this._extensionsWorkbenchService = _extensionsWorkbenchService;
    this._hasNotified = false;
    this._register(this._chatService.onDidSubmitRequest(() => {
      if (!this._hasNotified) {
        this._hasNotified = true;
        this._checkForRecommendedPlugins();
      }
    }));
  }
  async _checkForRecommendedPlugins() {
    const recommended = this._pluginMarketplaceService.recommendedPlugins.get();
    if (recommended.size === 0) {
      return;
    }
    const installedKeys = /* @__PURE__ */ new Set();
    for (const entry of this._pluginMarketplaceService.installedPlugins.get()) {
      const key = `${entry.plugin.name}@${entry.plugin.marketplace}`;
      installedKeys.add(key);
    }
    let fetched = this._pluginMarketplaceService.lastFetchedPlugins.get();
    if (fetched.length === 0) {
      try {
        fetched = await this._pluginMarketplaceService.fetchMarketplacePlugins(CancellationToken.None);
      } catch {
        return;
      }
    }
    const knownKeys = /* @__PURE__ */ new Set();
    for (const plugin of fetched) {
      knownKeys.add(`${plugin.name}@${plugin.marketplace}`);
    }
    let uninstalledCount = 0;
    for (const key of recommended) {
      if (!installedKeys.has(key) && knownKeys.has(key)) {
        uninstalledCount++;
      }
    }
    if (uninstalledCount === 0) {
      return;
    }
    this._notificationService.prompt(
      Severity.Info,
      uninstalledCount === 1 ? localize("agentPluginRecommendation.one", "This workspace recommends 1 agent plugin.") : localize("agentPluginRecommendation.many", "This workspace recommends {0} agent plugins.", uninstalledCount),
      [{
        label: localize("showPlugins", "Show Plugins"),
        run: () => {
          this._extensionsWorkbenchService.openSearch("@agentPlugins @recommended");
        }
      }],
      {
        neverShowAgain: {
          id: "agentPluginRecommendations.dismissed",
          scope: NeverShowAgainScope.WORKSPACE,
          isSecondary: true
        }
      }
    );
  }
};
AgentPluginRecommendations.ID = "workbench.contrib.agentPluginRecommendations";
AgentPluginRecommendations = __decorateClass([
  __decorateParam(0, IChatService),
  __decorateParam(1, IPluginMarketplaceService),
  __decorateParam(2, INotificationService),
  __decorateParam(3, IExtensionsWorkbenchService)
], AgentPluginRecommendations);
export {
  AgentPluginRecommendations
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jbGF1ZGVQbHVnaW5SZWNvbW1lbmRhdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlLCBOZXZlclNob3dBZ2FpblNjb3BlLCBTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDaGF0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWFya2V0cGxhY2VQbHVnaW4sIElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vcGx1Z2lucy9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgQWdlbnRQbHVnaW5SZWNvbW1lbmRhdGlvbnMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5hZ2VudFBsdWdpblJlY29tbWVuZGF0aW9ucyc7XG5cblx0cHJpdmF0ZSBfaGFzTm90aWZpZWQgPSBmYWxzZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTZXJ2aWNlOiBJQ2hhdFNlcnZpY2UsXG5cdFx0QElQbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlOiBJUGx1Z2luTWFya2V0cGxhY2VTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2V4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlOiBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9jaGF0U2VydmljZS5vbkRpZFN1Ym1pdFJlcXVlc3QoKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9oYXNOb3RpZmllZCkge1xuXHRcdFx0XHR0aGlzLl9oYXNOb3RpZmllZCA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX2NoZWNrRm9yUmVjb21tZW5kZWRQbHVnaW5zKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY2hlY2tGb3JSZWNvbW1lbmRlZFBsdWdpbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcmVjb21tZW5kZWQgPSB0aGlzLl9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UucmVjb21tZW5kZWRQbHVnaW5zLmdldCgpO1xuXHRcdGlmIChyZWNvbW1lbmRlZC5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQnVpbGQgYSBzZXQgb2YgaW5zdGFsbGVkIHBsdWdpbiBrZXlzIChcIm5hbWVAbWFya2V0cGxhY2VcIikgZnJvbVxuXHRcdC8vIHN0b3JhZ2Ugd2l0aG91dCB0cmlnZ2VyaW5nIGFueSBuZXR3b3JrIGZldGNoLlxuXHRcdGNvbnN0IGluc3RhbGxlZEtleXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5pbnN0YWxsZWRQbHVnaW5zLmdldCgpKSB7XG5cdFx0XHRjb25zdCBrZXkgPSBgJHtlbnRyeS5wbHVnaW4ubmFtZX1AJHtlbnRyeS5wbHVnaW4ubWFya2V0cGxhY2V9YDtcblx0XHRcdGluc3RhbGxlZEtleXMuYWRkKGtleSk7XG5cdFx0fVxuXG5cdFx0Ly8gT25seSBjb3VudCByZWNvbW1lbmRhdGlvbnMgdGhhdCByZXNvbHZlIHRvIGEga25vd24gbWFya2V0cGxhY2Vcblx0XHQvLyBwbHVnaW4uIE90aGVyd2lzZSB0aGUgQHJlY29tbWVuZGVkIHNlYXJjaCB3b3VsZCBsYW5kIG9uIGFuIGVtcHR5XG5cdFx0Ly8gbGlzdCAoc2VlIG1pY3Jvc29mdC92c2NvZGUjMzE1MzQ3KS4gRmFsbCBiYWNrIHRvIGEgZnJlc2ggZmV0Y2hcblx0XHQvLyB3aGVuIHRoZSBjYWNoZSBoYXNuJ3QgYmVlbiBwb3B1bGF0ZWQgeWV0IHNvIGZpcnN0LXJ1biBzZXNzaW9uc1xuXHRcdC8vIHdpdGggdmFsaWQgcmVjb21tZW5kYXRpb25zIHN0aWxsIG5vdGlmeS5cblx0XHRsZXQgZmV0Y2hlZDogcmVhZG9ubHkgSU1hcmtldHBsYWNlUGx1Z2luW10gPSB0aGlzLl9wbHVnaW5NYXJrZXRwbGFjZVNlcnZpY2UubGFzdEZldGNoZWRQbHVnaW5zLmdldCgpO1xuXHRcdGlmIChmZXRjaGVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0ZmV0Y2hlZCA9IGF3YWl0IHRoaXMuX3BsdWdpbk1hcmtldHBsYWNlU2VydmljZS5mZXRjaE1hcmtldHBsYWNlUGx1Z2lucyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IGtub3duS2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgcGx1Z2luIG9mIGZldGNoZWQpIHtcblx0XHRcdGtub3duS2V5cy5hZGQoYCR7cGx1Z2luLm5hbWV9QCR7cGx1Z2luLm1hcmtldHBsYWNlfWApO1xuXHRcdH1cblxuXHRcdGxldCB1bmluc3RhbGxlZENvdW50ID0gMDtcblx0XHRmb3IgKGNvbnN0IGtleSBvZiByZWNvbW1lbmRlZCkge1xuXHRcdFx0aWYgKCFpbnN0YWxsZWRLZXlzLmhhcyhrZXkpICYmIGtub3duS2V5cy5oYXMoa2V5KSkge1xuXHRcdFx0XHR1bmluc3RhbGxlZENvdW50Kys7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHVuaW5zdGFsbGVkQ291bnQgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChcblx0XHRcdFNldmVyaXR5LkluZm8sXG5cdFx0XHR1bmluc3RhbGxlZENvdW50ID09PSAxXG5cdFx0XHRcdD8gbG9jYWxpemUoJ2FnZW50UGx1Z2luUmVjb21tZW5kYXRpb24ub25lJywgXCJUaGlzIHdvcmtzcGFjZSByZWNvbW1lbmRzIDEgYWdlbnQgcGx1Z2luLlwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudFBsdWdpblJlY29tbWVuZGF0aW9uLm1hbnknLCBcIlRoaXMgd29ya3NwYWNlIHJlY29tbWVuZHMgezB9IGFnZW50IHBsdWdpbnMuXCIsIHVuaW5zdGFsbGVkQ291bnQpLFxuXHRcdFx0W3tcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdzaG93UGx1Z2lucycsIFwiU2hvdyBQbHVnaW5zXCIpLFxuXHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuU2VhcmNoKCdAYWdlbnRQbHVnaW5zIEByZWNvbW1lbmRlZCcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XSxcblx0XHRcdHtcblx0XHRcdFx0bmV2ZXJTaG93QWdhaW46IHtcblx0XHRcdFx0XHRpZDogJ2FnZW50UGx1Z2luUmVjb21tZW5kYXRpb25zLmRpc21pc3NlZCcsXG5cdFx0XHRcdFx0c2NvcGU6IE5ldmVyU2hvd0FnYWluU2NvcGUuV09SS1NQQUNFLFxuXHRcdFx0XHRcdGlzU2Vjb25kYXJ5OiB0cnVlLFxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQixxQkFBcUIsZ0JBQWdCO0FBRXBFLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQTZCLGlDQUFpQztBQUV2RCxJQUFNLDZCQUFOLGNBQXlDLFdBQTZDO0FBQUEsRUFLNUYsWUFDZ0MsY0FDYSwyQkFDTCxzQkFDTyw2QkFDN0M7QUFDRCxVQUFNO0FBTHlCO0FBQ2E7QUFDTDtBQUNPO0FBTi9DLFNBQVEsZUFBZTtBQVV0QixTQUFLLFVBQVUsS0FBSyxhQUFhLG1CQUFtQixNQUFNO0FBQ3pELFVBQUksQ0FBQyxLQUFLLGNBQWM7QUFDdkIsYUFBSyxlQUFlO0FBQ3BCLGFBQUssNEJBQTRCO0FBQUEsTUFDbEM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLE1BQWMsOEJBQTZDO0FBQzFELFVBQU0sY0FBYyxLQUFLLDBCQUEwQixtQkFBbUIsSUFBSTtBQUMxRSxRQUFJLFlBQVksU0FBUyxHQUFHO0FBQzNCO0FBQUEsSUFDRDtBQUlBLFVBQU0sZ0JBQWdCLG9CQUFJLElBQVk7QUFDdEMsZUFBVyxTQUFTLEtBQUssMEJBQTBCLGlCQUFpQixJQUFJLEdBQUc7QUFDMUUsWUFBTSxNQUFNLEdBQUcsTUFBTSxPQUFPLElBQUksSUFBSSxNQUFNLE9BQU8sV0FBVztBQUM1RCxvQkFBYyxJQUFJLEdBQUc7QUFBQSxJQUN0QjtBQU9BLFFBQUksVUFBeUMsS0FBSywwQkFBMEIsbUJBQW1CLElBQUk7QUFDbkcsUUFBSSxRQUFRLFdBQVcsR0FBRztBQUN6QixVQUFJO0FBQ0gsa0JBQVUsTUFBTSxLQUFLLDBCQUEwQix3QkFBd0Isa0JBQWtCLElBQUk7QUFBQSxNQUM5RixRQUFRO0FBQ1A7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFVBQU0sWUFBWSxvQkFBSSxJQUFZO0FBQ2xDLGVBQVcsVUFBVSxTQUFTO0FBQzdCLGdCQUFVLElBQUksR0FBRyxPQUFPLElBQUksSUFBSSxPQUFPLFdBQVcsRUFBRTtBQUFBLElBQ3JEO0FBRUEsUUFBSSxtQkFBbUI7QUFDdkIsZUFBVyxPQUFPLGFBQWE7QUFDOUIsVUFBSSxDQUFDLGNBQWMsSUFBSSxHQUFHLEtBQUssVUFBVSxJQUFJLEdBQUcsR0FBRztBQUNsRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsUUFBSSxxQkFBcUIsR0FBRztBQUMzQjtBQUFBLElBQ0Q7QUFFQSxTQUFLLHFCQUFxQjtBQUFBLE1BQ3pCLFNBQVM7QUFBQSxNQUNULHFCQUFxQixJQUNsQixTQUFTLGlDQUFpQywyQ0FBMkMsSUFDckYsU0FBUyxrQ0FBa0MsZ0RBQWdELGdCQUFnQjtBQUFBLE1BQzlHLENBQUM7QUFBQSxRQUNBLE9BQU8sU0FBUyxlQUFlLGNBQWM7QUFBQSxRQUM3QyxLQUFLLE1BQU07QUFDVixlQUFLLDRCQUE0QixXQUFXLDRCQUE0QjtBQUFBLFFBQ3pFO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRDtBQUFBLFFBQ0MsZ0JBQWdCO0FBQUEsVUFDZixJQUFJO0FBQUEsVUFDSixPQUFPLG9CQUFvQjtBQUFBLFVBQzNCLGFBQWE7QUFBQSxRQUNkO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFwRmEsMkJBQ0ksS0FBSztBQURULDZCQUFOO0FBQUEsRUFNSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBVFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
