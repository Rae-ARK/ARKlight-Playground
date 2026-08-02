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
import { ThrottledDelayer } from "../../../base/common/async.js";
import { Event } from "../../../base/common/event.js";
import { Iterable } from "../../../base/common/iterator.js";
import { isObject } from "../../../base/common/types.js";
import { FileOperationResult, IFileService } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
import { AbstractPolicyService } from "./policy.js";
function keysDiff(a, b) {
  const result = [];
  for (const key of new Set(Iterable.concat(a.keys(), b.keys()))) {
    if (a.get(key) !== b.get(key)) {
      result.push(key);
    }
  }
  return result;
}
let FilePolicyService = class extends AbstractPolicyService {
  constructor(file, fileService, logService) {
    super();
    this.file = file;
    this.fileService = fileService;
    this.logService = logService;
    this.throttledDelayer = this._register(new ThrottledDelayer(500));
    const onDidChangePolicyFile = Event.filter(fileService.onDidFilesChange, (e) => e.affects(file));
    this._register(fileService.watch(file));
    this._register(onDidChangePolicyFile(() => this.throttledDelayer.trigger(() => this.refresh())));
  }
  async _updatePolicyDefinitions() {
    await this.refresh();
  }
  async read() {
    const policies = /* @__PURE__ */ new Map();
    try {
      const content = await this.fileService.readFile(this.file);
      const raw = JSON.parse(content.value.toString());
      if (!isObject(raw)) {
        throw new Error("Policy file isn't a JSON object");
      }
      for (const key of Object.keys(raw)) {
        if (this.policyDefinitions[key]) {
          policies.set(key, raw[key]);
        }
      }
    } catch (error) {
      if (error.fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
        this.logService.error(`[FilePolicyService] Failed to read policies`, error);
      }
    }
    return policies;
  }
  async refresh() {
    const policies = await this.read();
    const diff = keysDiff(this.policies, policies);
    this.policies = policies;
    if (diff.length > 0) {
      this._onDidChange.fire(diff);
    }
  }
};
FilePolicyService = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, ILogService)
], FilePolicyService);
export {
  FilePolicyService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3BvbGljeS9jb21tb24vZmlsZVBvbGljeVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBUaHJvdHRsZWREZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IFBvbGljeU5hbWUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgaXNPYmplY3QgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRmlsZU9wZXJhdGlvbkVycm9yLCBGaWxlT3BlcmF0aW9uUmVzdWx0LCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFBvbGljeVNlcnZpY2UsIElQb2xpY3lTZXJ2aWNlLCBQb2xpY3lWYWx1ZSB9IGZyb20gJy4vcG9saWN5LmpzJztcblxuZnVuY3Rpb24ga2V5c0RpZmY8VD4oYTogTWFwPHN0cmluZywgVD4sIGI6IE1hcDxzdHJpbmcsIFQ+KTogc3RyaW5nW10ge1xuXHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cblx0Zm9yIChjb25zdCBrZXkgb2YgbmV3IFNldChJdGVyYWJsZS5jb25jYXQoYS5rZXlzKCksIGIua2V5cygpKSkpIHtcblx0XHRpZiAoYS5nZXQoa2V5KSAhPT0gYi5nZXQoa2V5KSkge1xuXHRcdFx0cmVzdWx0LnB1c2goa2V5KTtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgY2xhc3MgRmlsZVBvbGljeVNlcnZpY2UgZXh0ZW5kcyBBYnN0cmFjdFBvbGljeVNlcnZpY2UgaW1wbGVtZW50cyBJUG9saWN5U2VydmljZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSB0aHJvdHRsZWREZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlZERlbGF5ZXIoNTAwKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBmaWxlOiBVUkksXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlUG9saWN5RmlsZSA9IEV2ZW50LmZpbHRlcihmaWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlLCBlID0+IGUuYWZmZWN0cyhmaWxlKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZmlsZVNlcnZpY2Uud2F0Y2goZmlsZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKG9uRGlkQ2hhbmdlUG9saWN5RmlsZSgoKSA9PiB0aGlzLnRocm90dGxlZERlbGF5ZXIudHJpZ2dlcigoKSA9PiB0aGlzLnJlZnJlc2goKSkpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhc3luYyBfdXBkYXRlUG9saWN5RGVmaW5pdGlvbnMoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgdGhpcy5yZWZyZXNoKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlYWQoKTogUHJvbWlzZTxNYXA8UG9saWN5TmFtZSwgUG9saWN5VmFsdWU+PiB7XG5cdFx0Y29uc3QgcG9saWNpZXMgPSBuZXcgTWFwPFBvbGljeU5hbWUsIFBvbGljeVZhbHVlPigpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlYWRGaWxlKHRoaXMuZmlsZSk7XG5cdFx0XHRjb25zdCByYXcgPSBKU09OLnBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cblx0XHRcdGlmICghaXNPYmplY3QocmF3KSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1BvbGljeSBmaWxlIGlzblxcJ3QgYSBKU09OIG9iamVjdCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhyYXcpKSB7XG5cdFx0XHRcdGlmICh0aGlzLnBvbGljeURlZmluaXRpb25zW2tleV0pIHtcblx0XHRcdFx0XHRwb2xpY2llcy5zZXQoa2V5LCByYXdba2V5XSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0aWYgKCg8RmlsZU9wZXJhdGlvbkVycm9yPmVycm9yKS5maWxlT3BlcmF0aW9uUmVzdWx0ICE9PSBGaWxlT3BlcmF0aW9uUmVzdWx0LkZJTEVfTk9UX0ZPVU5EKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgW0ZpbGVQb2xpY3lTZXJ2aWNlXSBGYWlsZWQgdG8gcmVhZCBwb2xpY2llc2AsIGVycm9yKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gcG9saWNpZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlZnJlc2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcG9saWNpZXMgPSBhd2FpdCB0aGlzLnJlYWQoKTtcblx0XHRjb25zdCBkaWZmID0ga2V5c0RpZmYodGhpcy5wb2xpY2llcywgcG9saWNpZXMpO1xuXHRcdHRoaXMucG9saWNpZXMgPSBwb2xpY2llcztcblxuXHRcdGlmIChkaWZmLmxlbmd0aCA+IDApIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoZGlmZik7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsYUFBYTtBQUN0QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGdCQUFnQjtBQUV6QixTQUE2QixxQkFBcUIsb0JBQW9CO0FBQ3RFLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsNkJBQTBEO0FBRW5FLFNBQVMsU0FBWSxHQUFtQixHQUE2QjtBQUNwRSxRQUFNLFNBQW1CLENBQUM7QUFFMUIsYUFBVyxPQUFPLElBQUksSUFBSSxTQUFTLE9BQU8sRUFBRSxLQUFLLEdBQUcsRUFBRSxLQUFLLENBQUMsQ0FBQyxHQUFHO0FBQy9ELFFBQUksRUFBRSxJQUFJLEdBQUcsTUFBTSxFQUFFLElBQUksR0FBRyxHQUFHO0FBQzlCLGFBQU8sS0FBSyxHQUFHO0FBQUEsSUFDaEI7QUFBQSxFQUNEO0FBRUEsU0FBTztBQUNSO0FBRU8sSUFBTSxvQkFBTixjQUFnQyxzQkFBZ0Q7QUFBQSxFQUl0RixZQUNrQixNQUNjLGFBQ0QsWUFDN0I7QUFDRCxVQUFNO0FBSlc7QUFDYztBQUNEO0FBTC9CLFNBQWlCLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxpQkFBaUIsR0FBRyxDQUFDO0FBUzNFLFVBQU0sd0JBQXdCLE1BQU0sT0FBTyxZQUFZLGtCQUFrQixPQUFLLEVBQUUsUUFBUSxJQUFJLENBQUM7QUFDN0YsU0FBSyxVQUFVLFlBQVksTUFBTSxJQUFJLENBQUM7QUFDdEMsU0FBSyxVQUFVLHNCQUFzQixNQUFNLEtBQUssaUJBQWlCLFFBQVEsTUFBTSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUM7QUFBQSxFQUNoRztBQUFBLEVBRUEsTUFBZ0IsMkJBQTBDO0FBQ3pELFVBQU0sS0FBSyxRQUFRO0FBQUEsRUFDcEI7QUFBQSxFQUVBLE1BQWMsT0FBOEM7QUFDM0QsVUFBTSxXQUFXLG9CQUFJLElBQTZCO0FBRWxELFFBQUk7QUFDSCxZQUFNLFVBQVUsTUFBTSxLQUFLLFlBQVksU0FBUyxLQUFLLElBQUk7QUFDekQsWUFBTSxNQUFNLEtBQUssTUFBTSxRQUFRLE1BQU0sU0FBUyxDQUFDO0FBRS9DLFVBQUksQ0FBQyxTQUFTLEdBQUcsR0FBRztBQUNuQixjQUFNLElBQUksTUFBTSxpQ0FBa0M7QUFBQSxNQUNuRDtBQUVBLGlCQUFXLE9BQU8sT0FBTyxLQUFLLEdBQUcsR0FBRztBQUNuQyxZQUFJLEtBQUssa0JBQWtCLEdBQUcsR0FBRztBQUNoQyxtQkFBUyxJQUFJLEtBQUssSUFBSSxHQUFHLENBQUM7QUFBQSxRQUMzQjtBQUFBLE1BQ0Q7QUFBQSxJQUNELFNBQVMsT0FBTztBQUNmLFVBQXlCLE1BQU8sd0JBQXdCLG9CQUFvQixnQkFBZ0I7QUFDM0YsYUFBSyxXQUFXLE1BQU0sK0NBQStDLEtBQUs7QUFBQSxNQUMzRTtBQUFBLElBQ0Q7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsTUFBYyxVQUF5QjtBQUN0QyxVQUFNLFdBQVcsTUFBTSxLQUFLLEtBQUs7QUFDakMsVUFBTSxPQUFPLFNBQVMsS0FBSyxVQUFVLFFBQVE7QUFDN0MsU0FBSyxXQUFXO0FBRWhCLFFBQUksS0FBSyxTQUFTLEdBQUc7QUFDcEIsV0FBSyxhQUFhLEtBQUssSUFBSTtBQUFBLElBQzVCO0FBQUEsRUFDRDtBQUNEO0FBdERhLG9CQUFOO0FBQUEsRUFNSjtBQUFBLEVBQ0E7QUFBQSxHQVBVOyIsCiAgIm5hbWVzIjogW10KfQo=
