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
import { Event } from "../../../base/common/event.js";
import { Iterable } from "../../../base/common/iterator.js";
import { ILogService } from "../../log/common/log.js";
import { AbstractPolicyService } from "./policy.js";
let MultiplexPolicyService = class extends AbstractPolicyService {
  constructor(policyServices, logService) {
    super();
    this.policyServices = policyServices;
    this.logService = logService;
    this.updatePolicies();
    this._register(Event.any(...this.policyServices.map((service) => service.onDidChange))((names) => {
      this.updatePolicies();
      this._onDidChange.fire(names);
    }));
  }
  async updatePolicyDefinitions(policyDefinitions) {
    await this._updatePolicyDefinitions(policyDefinitions);
    return Iterable.reduce(this.policies.entries(), (r, [name, value]) => ({ ...r, [name]: value }), {});
  }
  async _updatePolicyDefinitions(policyDefinitions) {
    await Promise.all(this.policyServices.map((service) => service.updatePolicyDefinitions(policyDefinitions)));
    this.updatePolicies();
  }
  updatePolicies() {
    this.policies.clear();
    const updated = [];
    for (const service of this.policyServices) {
      const definitions = service.policyDefinitions;
      for (const name in definitions) {
        const value = service.getPolicyValue(name);
        this.policyDefinitions[name] = definitions[name];
        if (value !== void 0) {
          updated.push(name);
          this.policies.set(name, value);
        }
      }
    }
    const changed = /* @__PURE__ */ new Set();
    for (const key of updated) {
      if (changed.has(key)) {
        this.logService.warn(`MultiplexPolicyService#_updatePolicyDefinitions - Found overlapping keys in policy services: ${key}`);
      }
      changed.add(key);
    }
  }
};
MultiplexPolicyService = __decorateClass([
  __decorateParam(1, ILogService)
], MultiplexPolicyService);
export {
  MultiplexPolicyService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3BvbGljeS9jb21tb24vbXVsdGlwbGV4UG9saWN5U2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RQb2xpY3lTZXJ2aWNlLCBJUG9saWN5U2VydmljZSwgUG9saWN5RGVmaW5pdGlvbiwgUG9saWN5VmFsdWUgfSBmcm9tICcuL3BvbGljeS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBNdWx0aXBsZXhQb2xpY3lTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RQb2xpY3lTZXJ2aWNlIGltcGxlbWVudHMgSVBvbGljeVNlcnZpY2Uge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcG9saWN5U2VydmljZXM6IFJlYWRvbmx5QXJyYXk8SVBvbGljeVNlcnZpY2U+LFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy51cGRhdGVQb2xpY2llcygpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueSguLi50aGlzLnBvbGljeVNlcnZpY2VzLm1hcChzZXJ2aWNlID0+IHNlcnZpY2Uub25EaWRDaGFuZ2UpKShuYW1lcyA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZVBvbGljaWVzKCk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKG5hbWVzKTtcblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyB1cGRhdGVQb2xpY3lEZWZpbml0aW9ucyhwb2xpY3lEZWZpbml0aW9uczogSVN0cmluZ0RpY3Rpb25hcnk8UG9saWN5RGVmaW5pdGlvbj4pOiBQcm9taXNlPElTdHJpbmdEaWN0aW9uYXJ5PFBvbGljeVZhbHVlPj4ge1xuXHRcdGF3YWl0IHRoaXMuX3VwZGF0ZVBvbGljeURlZmluaXRpb25zKHBvbGljeURlZmluaXRpb25zKTtcblx0XHRyZXR1cm4gSXRlcmFibGUucmVkdWNlKHRoaXMucG9saWNpZXMuZW50cmllcygpLCAociwgW25hbWUsIHZhbHVlXSkgPT4gKHsgLi4uciwgW25hbWVdOiB2YWx1ZSB9KSwge30pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF91cGRhdGVQb2xpY3lEZWZpbml0aW9ucyhwb2xpY3lEZWZpbml0aW9uczogSVN0cmluZ0RpY3Rpb25hcnk8UG9saWN5RGVmaW5pdGlvbj4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBQcm9taXNlLmFsbCh0aGlzLnBvbGljeVNlcnZpY2VzLm1hcChzZXJ2aWNlID0+IHNlcnZpY2UudXBkYXRlUG9saWN5RGVmaW5pdGlvbnMocG9saWN5RGVmaW5pdGlvbnMpKSk7XG5cdFx0dGhpcy51cGRhdGVQb2xpY2llcygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVQb2xpY2llcygpOiB2b2lkIHtcblx0XHR0aGlzLnBvbGljaWVzLmNsZWFyKCk7XG5cdFx0Y29uc3QgdXBkYXRlZDogc3RyaW5nW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHNlcnZpY2Ugb2YgdGhpcy5wb2xpY3lTZXJ2aWNlcykge1xuXHRcdFx0Y29uc3QgZGVmaW5pdGlvbnMgPSBzZXJ2aWNlLnBvbGljeURlZmluaXRpb25zO1xuXHRcdFx0Zm9yIChjb25zdCBuYW1lIGluIGRlZmluaXRpb25zKSB7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gc2VydmljZS5nZXRQb2xpY3lWYWx1ZShuYW1lKTtcblx0XHRcdFx0dGhpcy5wb2xpY3lEZWZpbml0aW9uc1tuYW1lXSA9IGRlZmluaXRpb25zW25hbWVdO1xuXHRcdFx0XHRpZiAodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHVwZGF0ZWQucHVzaChuYW1lKTtcblx0XHRcdFx0XHR0aGlzLnBvbGljaWVzLnNldChuYW1lLCB2YWx1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDaGVjayB0aGF0IG5vIHJlc3VsdHMgaGF2ZSBvdmVybGFwcGluZyBrZXlzXG5cdFx0Y29uc3QgY2hhbmdlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3Qga2V5IG9mIHVwZGF0ZWQpIHtcblx0XHRcdGlmIChjaGFuZ2VkLmhhcyhrZXkpKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBNdWx0aXBsZXhQb2xpY3lTZXJ2aWNlI191cGRhdGVQb2xpY3lEZWZpbml0aW9ucyAtIEZvdW5kIG92ZXJsYXBwaW5nIGtleXMgaW4gcG9saWN5IHNlcnZpY2VzOiAke2tleX1gKTtcblx0XHRcdH1cblx0XHRcdGNoYW5nZWQuYWRkKGtleSk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsYUFBYTtBQUN0QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLDZCQUE0RTtBQUU5RSxJQUFNLHlCQUFOLGNBQXFDLHNCQUFnRDtBQUFBLEVBRTNGLFlBQ2tCLGdCQUNhLFlBQzdCO0FBQ0QsVUFBTTtBQUhXO0FBQ2E7QUFJOUIsU0FBSyxlQUFlO0FBQ3BCLFNBQUssVUFBVSxNQUFNLElBQUksR0FBRyxLQUFLLGVBQWUsSUFBSSxhQUFXLFFBQVEsV0FBVyxDQUFDLEVBQUUsV0FBUztBQUM3RixXQUFLLGVBQWU7QUFDcEIsV0FBSyxhQUFhLEtBQUssS0FBSztBQUFBLElBQzdCLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLE1BQWUsd0JBQXdCLG1CQUFpRztBQUN2SSxVQUFNLEtBQUsseUJBQXlCLGlCQUFpQjtBQUNyRCxXQUFPLFNBQVMsT0FBTyxLQUFLLFNBQVMsUUFBUSxHQUFHLENBQUMsR0FBRyxDQUFDLE1BQU0sS0FBSyxPQUFPLEVBQUUsR0FBRyxHQUFHLENBQUMsSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLENBQUM7QUFBQSxFQUNwRztBQUFBLEVBRUEsTUFBZ0IseUJBQXlCLG1CQUF1RTtBQUMvRyxVQUFNLFFBQVEsSUFBSSxLQUFLLGVBQWUsSUFBSSxhQUFXLFFBQVEsd0JBQXdCLGlCQUFpQixDQUFDLENBQUM7QUFDeEcsU0FBSyxlQUFlO0FBQUEsRUFDckI7QUFBQSxFQUVRLGlCQUF1QjtBQUM5QixTQUFLLFNBQVMsTUFBTTtBQUNwQixVQUFNLFVBQW9CLENBQUM7QUFDM0IsZUFBVyxXQUFXLEtBQUssZ0JBQWdCO0FBQzFDLFlBQU0sY0FBYyxRQUFRO0FBQzVCLGlCQUFXLFFBQVEsYUFBYTtBQUMvQixjQUFNLFFBQVEsUUFBUSxlQUFlLElBQUk7QUFDekMsYUFBSyxrQkFBa0IsSUFBSSxJQUFJLFlBQVksSUFBSTtBQUMvQyxZQUFJLFVBQVUsUUFBVztBQUN4QixrQkFBUSxLQUFLLElBQUk7QUFDakIsZUFBSyxTQUFTLElBQUksTUFBTSxLQUFLO0FBQUEsUUFDOUI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUdBLFVBQU0sVUFBVSxvQkFBSSxJQUFZO0FBQ2hDLGVBQVcsT0FBTyxTQUFTO0FBQzFCLFVBQUksUUFBUSxJQUFJLEdBQUcsR0FBRztBQUNyQixhQUFLLFdBQVcsS0FBSyxnR0FBZ0csR0FBRyxFQUFFO0FBQUEsTUFDM0g7QUFDQSxjQUFRLElBQUksR0FBRztBQUFBLElBQ2hCO0FBQUEsRUFDRDtBQUNEO0FBakRhLHlCQUFOO0FBQUEsRUFJSjtBQUFBLEdBSlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
