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
import { ILogService } from "../../log/common/log.js";
import { RelayTransport } from "../common/relayTransport.js";
let SSHRelayTransport = class extends RelayTransport {
  constructor(connectionId, sshService, ahpLogger, logService) {
    super(connectionId, sshService, ahpLogger, logService, "[SSHRelayTransport]");
  }
};
SSHRelayTransport = __decorateClass([
  __decorateParam(3, ILogService)
], SSHRelayTransport);
export {
  SSHRelayTransport
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9lbGVjdHJvbi1icm93c2VyL3NzaFJlbGF5VHJhbnNwb3J0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBaHBKc29ubExvZ2dlciB9IGZyb20gJy4uL2NvbW1vbi9haHBKc29ubExvZ2dlci5qcyc7XG5pbXBvcnQgeyBSZWxheVRyYW5zcG9ydCB9IGZyb20gJy4uL2NvbW1vbi9yZWxheVRyYW5zcG9ydC5qcyc7XG5pbXBvcnQgdHlwZSB7IElTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zc2hSZW1vdGVBZ2VudEhvc3QuanMnO1xuXG5leHBvcnQgY2xhc3MgU1NIUmVsYXlUcmFuc3BvcnQgZXh0ZW5kcyBSZWxheVRyYW5zcG9ydCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbm5lY3Rpb25JZDogc3RyaW5nLFxuXHRcdHNzaFNlcnZpY2U6IElTU0hSZW1vdGVBZ2VudEhvc3RNYWluU2VydmljZSxcblx0XHRhaHBMb2dnZXI6IEFocEpzb25sTG9nZ2VyIHwgdW5kZWZpbmVkLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY29ubmVjdGlvbklkLCBzc2hTZXJ2aWNlLCBhaHBMb2dnZXIsIGxvZ1NlcnZpY2UsICdbU1NIUmVsYXlUcmFuc3BvcnRdJyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxzQkFBc0I7QUFHeEIsSUFBTSxvQkFBTixjQUFnQyxlQUFlO0FBQUEsRUFDckQsWUFDQyxjQUNBLFlBQ0EsV0FDYSxZQUNaO0FBQ0QsVUFBTSxjQUFjLFlBQVksV0FBVyxZQUFZLHFCQUFxQjtBQUFBLEVBQzdFO0FBQ0Q7QUFUYSxvQkFBTjtBQUFBLEVBS0o7QUFBQSxHQUxVOyIsCiAgIm5hbWVzIjogW10KfQo=
