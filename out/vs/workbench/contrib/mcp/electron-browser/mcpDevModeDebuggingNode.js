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
import { timeout } from "../../../../base/common/async.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IDebugService } from "../../debug/common/debug.js";
import { McpDevModeDebugging } from "../common/mcpDevMode.js";
let McpDevModeDebuggingNode = class extends McpDevModeDebugging {
  constructor(debugService, commandService, _nativeHostService) {
    super(debugService, commandService);
    this._nativeHostService = _nativeHostService;
  }
  async ensureListeningOnPort(port) {
    const deadline = Date.now() + 3e4;
    while (await this._nativeHostService.isPortFree(port) && Date.now() < deadline) {
      await timeout(50);
    }
  }
  getDebugPort() {
    return this._nativeHostService.findFreePort(
      5e3,
      10,
      5e3,
      2048
      /* skip 2048 ports between attempts */
    );
  }
};
McpDevModeDebuggingNode = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, INativeHostService)
], McpDevModeDebuggingNode);
export {
  McpDevModeDebuggingNode
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL21jcC9lbGVjdHJvbi1icm93c2VyL21jcERldk1vZGVEZWJ1Z2dpbmdOb2RlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJTmF0aXZlSG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9uYXRpdmUvY29tbW9uL25hdGl2ZS5qcyc7XG5pbXBvcnQgeyBJRGVidWdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZGVidWcvY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IE1jcERldk1vZGVEZWJ1Z2dpbmcgfSBmcm9tICcuLi9jb21tb24vbWNwRGV2TW9kZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBNY3BEZXZNb2RlRGVidWdnaW5nTm9kZSBleHRlbmRzIE1jcERldk1vZGVEZWJ1Z2dpbmcge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASURlYnVnU2VydmljZSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoZGVidWdTZXJ2aWNlLCBjb21tYW5kU2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYXN5bmMgZW5zdXJlTGlzdGVuaW5nT25Qb3J0KHBvcnQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGRlYWRsaW5lID0gRGF0ZS5ub3coKSArIDMwXzAwMDtcblx0XHR3aGlsZSAoYXdhaXQgdGhpcy5fbmF0aXZlSG9zdFNlcnZpY2UuaXNQb3J0RnJlZShwb3J0KSAmJiBEYXRlLm5vdygpIDwgZGVhZGxpbmUpIHtcblx0XHRcdGF3YWl0IHRpbWVvdXQoNTApO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXREZWJ1Z1BvcnQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX25hdGl2ZUhvc3RTZXJ2aWNlLmZpbmRGcmVlUG9ydCg1MDAwLCAxMCAvKiB0cnkgMTAgcG9ydHMgKi8sIDUwMDAgLyogdHJ5IHVwIHRvIDUgc2Vjb25kcyAqLywgMjA0OCAvKiBza2lwIDIwNDggcG9ydHMgYmV0d2VlbiBhdHRlbXB0cyAqLyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsMkJBQTJCO0FBRTdCLElBQU0sMEJBQU4sY0FBc0Msb0JBQW9CO0FBQUEsRUFDaEUsWUFDZ0IsY0FDRSxnQkFDb0Isb0JBQ3BDO0FBQ0QsVUFBTSxjQUFjLGNBQWM7QUFGRztBQUFBLEVBR3RDO0FBQUEsRUFFQSxNQUF5QixzQkFBc0IsTUFBNkI7QUFDM0UsVUFBTSxXQUFXLEtBQUssSUFBSSxJQUFJO0FBQzlCLFdBQU8sTUFBTSxLQUFLLG1CQUFtQixXQUFXLElBQUksS0FBSyxLQUFLLElBQUksSUFBSSxVQUFVO0FBQy9FLFlBQU0sUUFBUSxFQUFFO0FBQUEsSUFDakI7QUFBQSxFQUNEO0FBQUEsRUFFbUIsZUFBZTtBQUNqQyxXQUFPLEtBQUssbUJBQW1CO0FBQUEsTUFBYTtBQUFBLE1BQU07QUFBQSxNQUF1QjtBQUFBLE1BQWdDO0FBQUE7QUFBQSxJQUEyQztBQUFBLEVBQ3JKO0FBQ0Q7QUFuQmEsMEJBQU47QUFBQSxFQUVKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQUpVOyIsCiAgIm5hbWVzIjogW10KfQo=
