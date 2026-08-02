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
import { IMcpManagementService } from "./mcpManagement.js";
let McpManagementCli = class {
  constructor(_logger, _mcpManagementService) {
    this._logger = _logger;
    this._mcpManagementService = _mcpManagementService;
  }
  async addMcpDefinitions(definitions) {
    const configs = definitions.map((config) => this.validateConfiguration(config));
    await this.updateMcpInResource(configs);
    this._logger.info(`Added MCP servers: ${configs.map((c) => c.name).join(", ")}`);
  }
  async updateMcpInResource(configs) {
    await Promise.all(configs.map(({ name, config, inputs }) => this._mcpManagementService.install({ name, config, inputs })));
  }
  validateConfiguration(config) {
    let parsed;
    try {
      parsed = JSON.parse(config);
    } catch (e) {
      throw new InvalidMcpOperationError(`Invalid JSON '${config}': ${e}`);
    }
    if (!parsed.name) {
      throw new InvalidMcpOperationError(`Missing name property in ${config}`);
    }
    if (!("command" in parsed) && !("url" in parsed)) {
      throw new InvalidMcpOperationError(`Missing command or URL property in ${config}`);
    }
    const { name, inputs, ...rest } = parsed;
    return { name, inputs, config: rest };
  }
};
McpManagementCli = __decorateClass([
  __decorateParam(1, IMcpManagementService)
], McpManagementCli);
class InvalidMcpOperationError extends Error {
  constructor(message) {
    super(message);
    this.stack = message;
  }
}
export {
  McpManagementCli
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL21jcC9jb21tb24vbWNwTWFuYWdlbWVudENsaS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElMb2dnZXIgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTWNwU2VydmVyQ29uZmlndXJhdGlvbiwgSU1jcFNlcnZlclZhcmlhYmxlIH0gZnJvbSAnLi9tY3BQbGF0Zm9ybVR5cGVzLmpzJztcbmltcG9ydCB7IElNY3BNYW5hZ2VtZW50U2VydmljZSB9IGZyb20gJy4vbWNwTWFuYWdlbWVudC5qcyc7XG5cbnR5cGUgVmFsaWRhdGVkQ29uZmlnID0geyBuYW1lOiBzdHJpbmc7IGNvbmZpZzogSU1jcFNlcnZlckNvbmZpZ3VyYXRpb247IGlucHV0cz86IElNY3BTZXJ2ZXJWYXJpYWJsZVtdIH07XG5cbmV4cG9ydCBjbGFzcyBNY3BNYW5hZ2VtZW50Q2xpIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nZ2VyOiBJTG9nZ2VyLFxuXHRcdEBJTWNwTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWNwTWFuYWdlbWVudFNlcnZpY2U6IElNY3BNYW5hZ2VtZW50U2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBhZGRNY3BEZWZpbml0aW9ucyhcblx0XHRkZWZpbml0aW9uczogc3RyaW5nW10sXG5cdCkge1xuXHRcdGNvbnN0IGNvbmZpZ3MgPSBkZWZpbml0aW9ucy5tYXAoKGNvbmZpZykgPT4gdGhpcy52YWxpZGF0ZUNvbmZpZ3VyYXRpb24oY29uZmlnKSk7XG5cdFx0YXdhaXQgdGhpcy51cGRhdGVNY3BJblJlc291cmNlKGNvbmZpZ3MpO1xuXHRcdHRoaXMuX2xvZ2dlci5pbmZvKGBBZGRlZCBNQ1Agc2VydmVyczogJHtjb25maWdzLm1hcChjID0+IGMubmFtZSkuam9pbignLCAnKX1gKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdXBkYXRlTWNwSW5SZXNvdXJjZShjb25maWdzOiBWYWxpZGF0ZWRDb25maWdbXSkge1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKGNvbmZpZ3MubWFwKCh7IG5hbWUsIGNvbmZpZywgaW5wdXRzIH0pID0+IHRoaXMuX21jcE1hbmFnZW1lbnRTZXJ2aWNlLmluc3RhbGwoeyBuYW1lLCBjb25maWcsIGlucHV0cyB9KSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZUNvbmZpZ3VyYXRpb24oY29uZmlnOiBzdHJpbmcpOiBWYWxpZGF0ZWRDb25maWcge1xuXHRcdGxldCBwYXJzZWQ6IElNY3BTZXJ2ZXJDb25maWd1cmF0aW9uICYgeyBuYW1lOiBzdHJpbmc7IGlucHV0cz86IElNY3BTZXJ2ZXJWYXJpYWJsZVtdIH07XG5cdFx0dHJ5IHtcblx0XHRcdHBhcnNlZCA9IEpTT04ucGFyc2UoY29uZmlnKTtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHR0aHJvdyBuZXcgSW52YWxpZE1jcE9wZXJhdGlvbkVycm9yKGBJbnZhbGlkIEpTT04gJyR7Y29uZmlnfSc6ICR7ZX1gKTtcblx0XHR9XG5cblx0XHRpZiAoIXBhcnNlZC5uYW1lKSB7XG5cdFx0XHR0aHJvdyBuZXcgSW52YWxpZE1jcE9wZXJhdGlvbkVycm9yKGBNaXNzaW5nIG5hbWUgcHJvcGVydHkgaW4gJHtjb25maWd9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKCEoJ2NvbW1hbmQnIGluIHBhcnNlZCkgJiYgISgndXJsJyBpbiBwYXJzZWQpKSB7XG5cdFx0XHR0aHJvdyBuZXcgSW52YWxpZE1jcE9wZXJhdGlvbkVycm9yKGBNaXNzaW5nIGNvbW1hbmQgb3IgVVJMIHByb3BlcnR5IGluICR7Y29uZmlnfWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgbmFtZSwgaW5wdXRzLCAuLi5yZXN0IH0gPSBwYXJzZWQ7XG5cdFx0cmV0dXJuIHsgbmFtZSwgaW5wdXRzLCBjb25maWc6IHJlc3QgYXMgSU1jcFNlcnZlckNvbmZpZ3VyYXRpb24gfTtcblx0fVxufVxuXG5jbGFzcyBJbnZhbGlkTWNwT3BlcmF0aW9uRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cdGNvbnN0cnVjdG9yKG1lc3NhZ2U6IHN0cmluZykge1xuXHRcdHN1cGVyKG1lc3NhZ2UpO1xuXHRcdHRoaXMuc3RhY2sgPSBtZXNzYWdlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU9BLFNBQVMsNkJBQTZCO0FBSS9CLElBQU0sbUJBQU4sTUFBdUI7QUFBQSxFQUM3QixZQUNrQixTQUN1Qix1QkFDdkM7QUFGZ0I7QUFDdUI7QUFBQSxFQUNyQztBQUFBLEVBRUosTUFBTSxrQkFDTCxhQUNDO0FBQ0QsVUFBTSxVQUFVLFlBQVksSUFBSSxDQUFDLFdBQVcsS0FBSyxzQkFBc0IsTUFBTSxDQUFDO0FBQzlFLFVBQU0sS0FBSyxvQkFBb0IsT0FBTztBQUN0QyxTQUFLLFFBQVEsS0FBSyxzQkFBc0IsUUFBUSxJQUFJLE9BQUssRUFBRSxJQUFJLEVBQUUsS0FBSyxJQUFJLENBQUMsRUFBRTtBQUFBLEVBQzlFO0FBQUEsRUFFQSxNQUFjLG9CQUFvQixTQUE0QjtBQUM3RCxVQUFNLFFBQVEsSUFBSSxRQUFRLElBQUksQ0FBQyxFQUFFLE1BQU0sUUFBUSxPQUFPLE1BQU0sS0FBSyxzQkFBc0IsUUFBUSxFQUFFLE1BQU0sUUFBUSxPQUFPLENBQUMsQ0FBQyxDQUFDO0FBQUEsRUFDMUg7QUFBQSxFQUVRLHNCQUFzQixRQUFpQztBQUM5RCxRQUFJO0FBQ0osUUFBSTtBQUNILGVBQVMsS0FBSyxNQUFNLE1BQU07QUFBQSxJQUMzQixTQUFTLEdBQUc7QUFDWCxZQUFNLElBQUkseUJBQXlCLGlCQUFpQixNQUFNLE1BQU0sQ0FBQyxFQUFFO0FBQUEsSUFDcEU7QUFFQSxRQUFJLENBQUMsT0FBTyxNQUFNO0FBQ2pCLFlBQU0sSUFBSSx5QkFBeUIsNEJBQTRCLE1BQU0sRUFBRTtBQUFBLElBQ3hFO0FBRUEsUUFBSSxFQUFFLGFBQWEsV0FBVyxFQUFFLFNBQVMsU0FBUztBQUNqRCxZQUFNLElBQUkseUJBQXlCLHNDQUFzQyxNQUFNLEVBQUU7QUFBQSxJQUNsRjtBQUVBLFVBQU0sRUFBRSxNQUFNLFFBQVEsR0FBRyxLQUFLLElBQUk7QUFDbEMsV0FBTyxFQUFFLE1BQU0sUUFBUSxRQUFRLEtBQWdDO0FBQUEsRUFDaEU7QUFDRDtBQXJDYSxtQkFBTjtBQUFBLEVBR0o7QUFBQSxHQUhVO0FBdUNiLE1BQU0saUNBQWlDLE1BQU07QUFBQSxFQUM1QyxZQUFZLFNBQWlCO0FBQzVCLFVBQU0sT0FBTztBQUNiLFNBQUssUUFBUTtBQUFBLEVBQ2Q7QUFDRDsiLAogICJuYW1lcyI6IFtdCn0K
