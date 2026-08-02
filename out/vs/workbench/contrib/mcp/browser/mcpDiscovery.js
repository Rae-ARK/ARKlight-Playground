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
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { mcpAccessConfig, McpAccessValue } from "../../../../platform/mcp/common/mcpManagement.js";
import { observableConfigValue } from "../../../../platform/observable/common/platformObservableUtils.js";
import { mcpDiscoveryRegistry } from "../common/discovery/mcpDiscovery.js";
let McpDiscovery = class extends Disposable {
  constructor(instantiationService, configurationService) {
    super();
    const mcpAccessValue = observableConfigValue(mcpAccessConfig, McpAccessValue.All, configurationService);
    const store = this._register(new DisposableStore());
    this._register(autorun((reader) => {
      store.clear();
      const value = mcpAccessValue.read(reader);
      if (value === McpAccessValue.None) {
        return;
      }
      for (const descriptor of mcpDiscoveryRegistry.getAll()) {
        const mcpDiscovery = instantiationService.createInstance(descriptor);
        if (value === McpAccessValue.Registry && !mcpDiscovery.fromGallery) {
          mcpDiscovery.dispose();
          continue;
        }
        store.add(mcpDiscovery);
        mcpDiscovery.start();
      }
    }));
  }
};
McpDiscovery.ID = "workbench.contrib.mcp.discovery";
McpDiscovery = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, IConfigurationService)
], McpDiscovery);
export {
  McpDiscovery
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9icm93c2VyL21jcERpc2NvdmVyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgbWNwQWNjZXNzQ29uZmlnLCBNY3BBY2Nlc3NWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL21jcC9jb21tb24vbWNwTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlQ29uZmlnVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgbWNwRGlzY292ZXJ5UmVnaXN0cnkgfSBmcm9tICcuLi9jb21tb24vZGlzY292ZXJ5L21jcERpc2NvdmVyeS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBNY3BEaXNjb3ZlcnkgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIubWNwLmRpc2NvdmVyeSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IG1jcEFjY2Vzc1ZhbHVlID0gb2JzZXJ2YWJsZUNvbmZpZ1ZhbHVlKG1jcEFjY2Vzc0NvbmZpZywgTWNwQWNjZXNzVmFsdWUuQWxsLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3Qgc3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0c3RvcmUuY2xlYXIoKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gbWNwQWNjZXNzVmFsdWUucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHZhbHVlID09PSBNY3BBY2Nlc3NWYWx1ZS5Ob25lKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgZGVzY3JpcHRvciBvZiBtY3BEaXNjb3ZlcnlSZWdpc3RyeS5nZXRBbGwoKSkge1xuXHRcdFx0XHRjb25zdCBtY3BEaXNjb3ZlcnkgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShkZXNjcmlwdG9yKTtcblx0XHRcdFx0aWYgKHZhbHVlID09PSBNY3BBY2Nlc3NWYWx1ZS5SZWdpc3RyeSAmJiAhbWNwRGlzY292ZXJ5LmZyb21HYWxsZXJ5KSB7XG5cdFx0XHRcdFx0bWNwRGlzY292ZXJ5LmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzdG9yZS5hZGQobWNwRGlzY292ZXJ5KTtcblx0XHRcdFx0bWNwRGlzY292ZXJ5LnN0YXJ0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUJBQWlCLHNCQUFzQjtBQUNoRCxTQUFTLDZCQUE2QjtBQUV0QyxTQUFTLDRCQUE0QjtBQUU5QixJQUFNLGVBQU4sY0FBMkIsV0FBNkM7QUFBQSxFQUc5RSxZQUN3QixzQkFDQSxzQkFDdEI7QUFDRCxVQUFNO0FBRU4sVUFBTSxpQkFBaUIsc0JBQXNCLGlCQUFpQixlQUFlLEtBQUssb0JBQW9CO0FBQ3RHLFVBQU0sUUFBUSxLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQUVsRCxTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFlBQU0sTUFBTTtBQUNaLFlBQU0sUUFBUSxlQUFlLEtBQUssTUFBTTtBQUN4QyxVQUFJLFVBQVUsZUFBZSxNQUFNO0FBQ2xDO0FBQUEsTUFDRDtBQUNBLGlCQUFXLGNBQWMscUJBQXFCLE9BQU8sR0FBRztBQUN2RCxjQUFNLGVBQWUscUJBQXFCLGVBQWUsVUFBVTtBQUNuRSxZQUFJLFVBQVUsZUFBZSxZQUFZLENBQUMsYUFBYSxhQUFhO0FBQ25FLHVCQUFhLFFBQVE7QUFDckI7QUFBQSxRQUNEO0FBQ0EsY0FBTSxJQUFJLFlBQVk7QUFDdEIscUJBQWEsTUFBTTtBQUFBLE1BQ3BCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQ0Q7QUE3QmEsYUFDVyxLQUFLO0FBRGhCLGVBQU47QUFBQSxFQUlKO0FBQUEsRUFDQTtBQUFBLEdBTFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
