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
import { ILoggerService, log } from "../../../../platform/log/common/log.js";
let DelayedLogChannel = class {
  constructor(id, name, file, loggerService) {
    this.file = file;
    this.loggerService = loggerService;
    this.logger = loggerService.createLogger(file, { name, id, hidden: true });
  }
  log(level, message) {
    this.loggerService.setVisibility(this.file, true);
    log(this.logger, level, message);
  }
};
DelayedLogChannel = __decorateClass([
  __decorateParam(3, ILoggerService)
], DelayedLogChannel);
export {
  DelayedLogChannel
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9vdXRwdXQvY29tbW9uL2RlbGF5ZWRMb2dDaGFubmVsLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUxvZ2dlciwgSUxvZ2dlclNlcnZpY2UsIGxvZywgTG9nTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuXG5leHBvcnQgY2xhc3MgRGVsYXllZExvZ0NoYW5uZWwge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbG9nZ2VyOiBJTG9nZ2VyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGlkOiBzdHJpbmcsIG5hbWU6IHN0cmluZywgcHJpdmF0ZSByZWFkb25seSBmaWxlOiBVUkksXG5cdFx0QElMb2dnZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nZ2VyU2VydmljZTogSUxvZ2dlclNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMubG9nZ2VyID0gbG9nZ2VyU2VydmljZS5jcmVhdGVMb2dnZXIoZmlsZSwgeyBuYW1lLCBpZCwgaGlkZGVuOiB0cnVlIH0pO1xuXHR9XG5cblx0bG9nKGxldmVsOiBMb2dMZXZlbCwgbWVzc2FnZTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5sb2dnZXJTZXJ2aWNlLnNldFZpc2liaWxpdHkodGhpcy5maWxlLCB0cnVlKTtcblx0XHRsb2codGhpcy5sb2dnZXIsIGxldmVsLCBtZXNzYWdlKTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQWtCLGdCQUFnQixXQUFxQjtBQUdoRCxJQUFNLG9CQUFOLE1BQXdCO0FBQUEsRUFJOUIsWUFDQyxJQUFZLE1BQStCLE1BQ1YsZUFDaEM7QUFGMEM7QUFDVjtBQUVqQyxTQUFLLFNBQVMsY0FBYyxhQUFhLE1BQU0sRUFBRSxNQUFNLElBQUksUUFBUSxLQUFLLENBQUM7QUFBQSxFQUMxRTtBQUFBLEVBRUEsSUFBSSxPQUFpQixTQUF1QjtBQUMzQyxTQUFLLGNBQWMsY0FBYyxLQUFLLE1BQU0sSUFBSTtBQUNoRCxRQUFJLEtBQUssUUFBUSxPQUFPLE9BQU87QUFBQSxFQUNoQztBQUVEO0FBaEJhLG9CQUFOO0FBQUEsRUFNSjtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
