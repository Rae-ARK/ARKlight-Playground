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
import { AbstractPolicyService } from "../common/policy.js";
import { Throttler } from "../../../base/common/async.js";
import { MutableDisposable } from "../../../base/common/lifecycle.js";
import { ILogService } from "../../log/common/log.js";
let NativePolicyService = class extends AbstractPolicyService {
  constructor(logService, productName) {
    super();
    this.logService = logService;
    this.productName = productName;
    this.throttler = this._register(new Throttler());
    this.watcher = this._register(new MutableDisposable());
  }
  async _updatePolicyDefinitions(policyDefinitions) {
    this.logService.trace(`NativePolicyService#_updatePolicyDefinitions - Found ${Object.keys(policyDefinitions).length} policy definitions`);
    const { createWatcher } = await import("@vscode/policy-watcher");
    await this.throttler.queue(() => new Promise((c, e) => {
      try {
        this.logService.trace(`Creating watcher for productName ${this.productName}`);
        this.watcher.value = createWatcher(this.productName, policyDefinitions, (update) => {
          this._onDidPolicyChange(update);
          c();
        });
      } catch (err) {
        this.logService.error(`NativePolicyService#_updatePolicyDefinitions - Error creating watcher:`, err);
        e(err);
      }
    }));
  }
  _onDidPolicyChange(update) {
    this.logService.trace(`NativePolicyService#_onDidPolicyChange - Updated policy values: ${JSON.stringify(update)}`);
    for (const key in update) {
      const value = update[key];
      if (value === void 0) {
        this.policies.delete(key);
      } else {
        this.policies.set(key, value);
      }
    }
    this._onDidChange.fire(Object.keys(update));
  }
};
NativePolicyService = __decorateClass([
  __decorateParam(0, ILogService)
], NativePolicyService);
export {
  NativePolicyService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3BvbGljeS9ub2RlL25hdGl2ZVBvbGljeVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBBYnN0cmFjdFBvbGljeVNlcnZpY2UsIElQb2xpY3lTZXJ2aWNlLCBQb2xpY3lEZWZpbml0aW9uLCBQb2xpY3lWYWx1ZSB9IGZyb20gJy4uL2NvbW1vbi9wb2xpY3kuanMnO1xuaW1wb3J0IHsgSVN0cmluZ0RpY3Rpb25hcnkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2xsZWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBUaHJvdHRsZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgdHlwZSB7IFBvbGljeVVwZGF0ZSwgV2F0Y2hlciB9IGZyb20gJ0B2c2NvZGUvcG9saWN5LXdhdGNoZXInO1xuaW1wb3J0IHsgTXV0YWJsZURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBOYXRpdmVQb2xpY3lTZXJ2aWNlIGV4dGVuZHMgQWJzdHJhY3RQb2xpY3lTZXJ2aWNlIGltcGxlbWVudHMgSVBvbGljeVNlcnZpY2Uge1xuXG5cdHByaXZhdGUgdGhyb3R0bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlcigpKTtcblx0cHJpdmF0ZSByZWFkb25seSB3YXRjaGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPFdhdGNoZXI+KCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgcHJvZHVjdE5hbWU6IHN0cmluZ1xuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFzeW5jIF91cGRhdGVQb2xpY3lEZWZpbml0aW9ucyhwb2xpY3lEZWZpbml0aW9uczogSVN0cmluZ0RpY3Rpb25hcnk8UG9saWN5RGVmaW5pdGlvbj4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYE5hdGl2ZVBvbGljeVNlcnZpY2UjX3VwZGF0ZVBvbGljeURlZmluaXRpb25zIC0gRm91bmQgJHtPYmplY3Qua2V5cyhwb2xpY3lEZWZpbml0aW9ucykubGVuZ3RofSBwb2xpY3kgZGVmaW5pdGlvbnNgKTtcblxuXHRcdGNvbnN0IHsgY3JlYXRlV2F0Y2hlciB9ID0gYXdhaXQgaW1wb3J0KCdAdnNjb2RlL3BvbGljeS13YXRjaGVyJyk7XG5cblx0XHRhd2FpdCB0aGlzLnRocm90dGxlci5xdWV1ZSgoKSA9PiBuZXcgUHJvbWlzZTx2b2lkPigoYywgZSkgPT4ge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBDcmVhdGluZyB3YXRjaGVyIGZvciBwcm9kdWN0TmFtZSAke3RoaXMucHJvZHVjdE5hbWV9YCk7XG5cdFx0XHRcdHRoaXMud2F0Y2hlci52YWx1ZSA9IGNyZWF0ZVdhdGNoZXIodGhpcy5wcm9kdWN0TmFtZSwgcG9saWN5RGVmaW5pdGlvbnMsIHVwZGF0ZSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRQb2xpY3lDaGFuZ2UodXBkYXRlKTtcblx0XHRcdFx0XHRjKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5lcnJvcihgTmF0aXZlUG9saWN5U2VydmljZSNfdXBkYXRlUG9saWN5RGVmaW5pdGlvbnMgLSBFcnJvciBjcmVhdGluZyB3YXRjaGVyOmAsIGVycik7XG5cdFx0XHRcdGUoZXJyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9vbkRpZFBvbGljeUNoYW5nZSh1cGRhdGU6IFBvbGljeVVwZGF0ZTxJU3RyaW5nRGljdGlvbmFyeTxQb2xpY3lEZWZpbml0aW9uPj4pOiB2b2lkIHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYE5hdGl2ZVBvbGljeVNlcnZpY2UjX29uRGlkUG9saWN5Q2hhbmdlIC0gVXBkYXRlZCBwb2xpY3kgdmFsdWVzOiAke0pTT04uc3RyaW5naWZ5KHVwZGF0ZSl9YCk7XG5cblx0XHRmb3IgKGNvbnN0IGtleSBpbiB1cGRhdGUgYXMgUmVjb3JkPHN0cmluZywgUG9saWN5VmFsdWUgfCB1bmRlZmluZWQ+KSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHVwZGF0ZVtrZXldO1xuXG5cdFx0XHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLnBvbGljaWVzLmRlbGV0ZShrZXkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5wb2xpY2llcy5zZXQoa2V5LCB2YWx1ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShPYmplY3Qua2V5cyh1cGRhdGUpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLDZCQUE0RTtBQUVyRixTQUFTLGlCQUFpQjtBQUUxQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQjtBQUVyQixJQUFNLHNCQUFOLGNBQWtDLHNCQUFnRDtBQUFBLEVBS3hGLFlBQytCLFlBQ2IsYUFDaEI7QUFDRCxVQUFNO0FBSHdCO0FBQ2I7QUFMbEIsU0FBUSxZQUFZLEtBQUssVUFBVSxJQUFJLFVBQVUsQ0FBQztBQUNsRCxTQUFpQixVQUFVLEtBQUssVUFBVSxJQUFJLGtCQUEyQixDQUFDO0FBQUEsRUFPMUU7QUFBQSxFQUVBLE1BQWdCLHlCQUF5QixtQkFBdUU7QUFDL0csU0FBSyxXQUFXLE1BQU0sd0RBQXdELE9BQU8sS0FBSyxpQkFBaUIsRUFBRSxNQUFNLHFCQUFxQjtBQUV4SSxVQUFNLEVBQUUsY0FBYyxJQUFJLE1BQU0sT0FBTyx3QkFBd0I7QUFFL0QsVUFBTSxLQUFLLFVBQVUsTUFBTSxNQUFNLElBQUksUUFBYyxDQUFDLEdBQUcsTUFBTTtBQUM1RCxVQUFJO0FBQ0gsYUFBSyxXQUFXLE1BQU0sb0NBQW9DLEtBQUssV0FBVyxFQUFFO0FBQzVFLGFBQUssUUFBUSxRQUFRLGNBQWMsS0FBSyxhQUFhLG1CQUFtQixZQUFVO0FBQ2pGLGVBQUssbUJBQW1CLE1BQU07QUFDOUIsWUFBRTtBQUFBLFFBQ0gsQ0FBQztBQUFBLE1BQ0YsU0FBUyxLQUFLO0FBQ2IsYUFBSyxXQUFXLE1BQU0sMEVBQTBFLEdBQUc7QUFDbkcsVUFBRSxHQUFHO0FBQUEsTUFDTjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsbUJBQW1CLFFBQWlFO0FBQzNGLFNBQUssV0FBVyxNQUFNLG1FQUFtRSxLQUFLLFVBQVUsTUFBTSxDQUFDLEVBQUU7QUFFakgsZUFBVyxPQUFPLFFBQW1EO0FBQ3BFLFlBQU0sUUFBUSxPQUFPLEdBQUc7QUFFeEIsVUFBSSxVQUFVLFFBQVc7QUFDeEIsYUFBSyxTQUFTLE9BQU8sR0FBRztBQUFBLE1BQ3pCLE9BQU87QUFDTixhQUFLLFNBQVMsSUFBSSxLQUFLLEtBQUs7QUFBQSxNQUM3QjtBQUFBLElBQ0Q7QUFFQSxTQUFLLGFBQWEsS0FBSyxPQUFPLEtBQUssTUFBTSxDQUFDO0FBQUEsRUFDM0M7QUFDRDtBQTlDYSxzQkFBTjtBQUFBLEVBTUo7QUFBQSxHQU5VOyIsCiAgIm5hbWVzIjogW10KfQo=
