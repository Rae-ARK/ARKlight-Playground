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
import { Disposable } from "../../../base/common/lifecycle.js";
import { IChatStatusItemService } from "../../contrib/chat/browser/chatStatus/chatStatusItemService.js";
import { extHostNamedCustomer } from "../../services/extensions/common/extHostCustomers.js";
import { MainContext } from "../common/extHost.protocol.js";
let MainThreadChatStatus = class extends Disposable {
  constructor(_extHostContext, _chatStatusItemService) {
    super();
    this._chatStatusItemService = _chatStatusItemService;
  }
  $setEntry(id, entry) {
    this._chatStatusItemService.setOrUpdateEntry({
      id,
      label: entry.title,
      description: entry.description,
      detail: entry.detail,
      tooltip: entry.tooltip
    });
  }
  $disposeEntry(id) {
    this._chatStatusItemService.deleteEntry(id);
  }
};
MainThreadChatStatus = __decorateClass([
  extHostNamedCustomer(MainContext.MainThreadChatStatus),
  __decorateParam(1, IChatStatusItemService)
], MainThreadChatStatus);
export {
  MainThreadChatStatus
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkQ2hhdFN0YXR1cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNoYXRTdGF0dXNJdGVtU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXRTdGF0dXMvY2hhdFN0YXR1c0l0ZW1TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRIb3N0Q29udGV4dCwgZXh0SG9zdE5hbWVkQ3VzdG9tZXIgfSBmcm9tICcuLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRIb3N0Q3VzdG9tZXJzLmpzJztcbmltcG9ydCB7IENoYXRTdGF0dXNJdGVtRHRvLCBNYWluQ29udGV4dCwgTWFpblRocmVhZENoYXRTdGF0dXNTaGFwZSB9IGZyb20gJy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcblxuQGV4dEhvc3ROYW1lZEN1c3RvbWVyKE1haW5Db250ZXh0Lk1haW5UaHJlYWRDaGF0U3RhdHVzKVxuZXhwb3J0IGNsYXNzIE1haW5UaHJlYWRDaGF0U3RhdHVzIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIE1haW5UaHJlYWRDaGF0U3RhdHVzU2hhcGUge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdF9leHRIb3N0Q29udGV4dDogSUV4dEhvc3RDb250ZXh0LFxuXHRcdEBJQ2hhdFN0YXR1c0l0ZW1TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYXRTdGF0dXNJdGVtU2VydmljZTogSUNoYXRTdGF0dXNJdGVtU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdCRzZXRFbnRyeShpZDogc3RyaW5nLCBlbnRyeTogQ2hhdFN0YXR1c0l0ZW1EdG8pOiB2b2lkIHtcblx0XHR0aGlzLl9jaGF0U3RhdHVzSXRlbVNlcnZpY2Uuc2V0T3JVcGRhdGVFbnRyeSh7XG5cdFx0XHRpZCxcblx0XHRcdGxhYmVsOiBlbnRyeS50aXRsZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBlbnRyeS5kZXNjcmlwdGlvbixcblx0XHRcdGRldGFpbDogZW50cnkuZGV0YWlsLFxuXHRcdFx0dG9vbHRpcDogZW50cnkudG9vbHRpcCxcblx0XHR9KTtcblx0fVxuXG5cdCRkaXNwb3NlRW50cnkoaWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2NoYXRTdGF0dXNJdGVtU2VydmljZS5kZWxldGVFbnRyeShpZCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw4QkFBOEI7QUFDdkMsU0FBMEIsNEJBQTRCO0FBQ3RELFNBQTRCLG1CQUE4QztBQUduRSxJQUFNLHVCQUFOLGNBQW1DLFdBQWdEO0FBQUEsRUFFekYsWUFDQyxpQkFDeUMsd0JBQ3hDO0FBQ0QsVUFBTTtBQUZtQztBQUFBLEVBRzFDO0FBQUEsRUFFQSxVQUFVLElBQVksT0FBZ0M7QUFDckQsU0FBSyx1QkFBdUIsaUJBQWlCO0FBQUEsTUFDNUM7QUFBQSxNQUNBLE9BQU8sTUFBTTtBQUFBLE1BQ2IsYUFBYSxNQUFNO0FBQUEsTUFDbkIsUUFBUSxNQUFNO0FBQUEsTUFDZCxTQUFTLE1BQU07QUFBQSxJQUNoQixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsY0FBYyxJQUFrQjtBQUMvQixTQUFLLHVCQUF1QixZQUFZLEVBQUU7QUFBQSxFQUMzQztBQUNEO0FBdEJhLHVCQUFOO0FBQUEsRUFETixxQkFBcUIsWUFBWSxvQkFBb0I7QUFBQSxFQUtuRDtBQUFBLEdBSlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
