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
import { timeout } from "../../../../../../base/common/async.js";
import { BugIndicatingError } from "../../../../../../base/common/errors.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun, derived, observableValue, runOnChange, runOnChangeWithCancellationToken } from "../../../../../../base/common/observable.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
var UserKind = /* @__PURE__ */ ((UserKind2) => {
  UserKind2["FirstTime"] = "firstTime";
  UserKind2["SecondTime"] = "secondTime";
  UserKind2["Active"] = "active";
  return UserKind2;
})(UserKind || {});
let InlineEditsOnboardingExperience = class extends Disposable {
  constructor(_model, _indicator, _collapsedView, _storageService, _configurationService) {
    super();
    this._model = _model;
    this._indicator = _indicator;
    this._collapsedView = _collapsedView;
    this._storageService = _storageService;
    this._configurationService = _configurationService;
    this._disposables = this._register(new MutableDisposable());
    this._setupDone = observableValue({ name: "setupDone" }, false);
    this._activeCompletionId = derived((reader) => {
      const model = this._model.read(reader);
      if (!model) {
        return void 0;
      }
      if (!this._setupDone.read(reader)) {
        return void 0;
      }
      const indicator = this._indicator.read(reader);
      if (!indicator || !indicator.isVisible.read(reader)) {
        return void 0;
      }
      return model.inlineEdit.inlineCompletion.identity.id;
    });
    this._register(this._initializeDebugSetting());
    this._disposables.value = this.setupNewUserExperience();
    this._setupDone.set(true, void 0);
  }
  setupNewUserExperience() {
    if (this.getNewUserType() === "active" /* Active */) {
      return void 0;
    }
    const disposableStore = new DisposableStore();
    let userHasHoveredOverIcon = false;
    let inlineEditHasBeenAccepted = false;
    let firstTimeUserAnimationCount = 0;
    let secondTimeUserAnimationCount = 0;
    disposableStore.add(runOnChangeWithCancellationToken(this._activeCompletionId, async (id, _, __, token) => {
      if (id === void 0) {
        return;
      }
      let userType = this.getNewUserType();
      switch (userType) {
        case "firstTime" /* FirstTime */: {
          if (firstTimeUserAnimationCount++ >= 5 || userHasHoveredOverIcon) {
            userType = "secondTime" /* SecondTime */;
            this.setNewUserType(userType);
          }
          break;
        }
        case "secondTime" /* SecondTime */: {
          if (secondTimeUserAnimationCount++ >= 3 && inlineEditHasBeenAccepted) {
            userType = "active" /* Active */;
            this.setNewUserType(userType);
          }
          break;
        }
      }
      switch (userType) {
        case "firstTime" /* FirstTime */: {
          for (let i = 0; i < 3 && !token.isCancellationRequested; i++) {
            await this._indicator.get()?.triggerAnimation();
            await timeout(500);
          }
          break;
        }
        case "secondTime" /* SecondTime */: {
          this._indicator.get()?.triggerAnimation();
          break;
        }
      }
    }));
    disposableStore.add(autorun((reader) => {
      if (this._collapsedView.isVisible.read(reader)) {
        if (this.getNewUserType() !== "active" /* Active */) {
          this._collapsedView.triggerAnimation();
        }
      }
    }));
    disposableStore.add(autorun((reader) => {
      const indicator = this._indicator.read(reader);
      if (!indicator) {
        return;
      }
      reader.store.add(runOnChange(indicator.isHoveredOverIcon, async (isHovered) => {
        if (isHovered) {
          userHasHoveredOverIcon = true;
        }
      }));
    }));
    disposableStore.add(autorun((reader) => {
      const model = this._model.read(reader);
      if (!model) {
        return;
      }
      reader.store.add(model.onDidAccept(() => {
        inlineEditHasBeenAccepted = true;
      }));
    }));
    return disposableStore;
  }
  getNewUserType() {
    return this._storageService.get("inlineEditsGutterIndicatorUserKind", StorageScope.APPLICATION, "firstTime" /* FirstTime */);
  }
  setNewUserType(value) {
    switch (value) {
      case "firstTime" /* FirstTime */:
        throw new BugIndicatingError("UserKind should not be set to first time");
      case "secondTime" /* SecondTime */:
        break;
      case "active" /* Active */:
        this._disposables.clear();
        break;
    }
    this._storageService.store("inlineEditsGutterIndicatorUserKind", value, StorageScope.APPLICATION, StorageTarget.USER);
  }
  _initializeDebugSetting() {
    const hiddenDebugSetting = "editor.inlineSuggest.edits.resetNewUserExperience";
    if (this._configurationService.getValue(hiddenDebugSetting)) {
      this._storageService.remove("inlineEditsGutterIndicatorUserKind", StorageScope.APPLICATION);
    }
    const disposable = this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(hiddenDebugSetting) && this._configurationService.getValue(hiddenDebugSetting)) {
        this._storageService.remove("inlineEditsGutterIndicatorUserKind", StorageScope.APPLICATION);
        this._disposables.value = this.setupNewUserExperience();
      }
    });
    return disposable;
  }
};
InlineEditsOnboardingExperience = __decorateClass([
  __decorateParam(3, IStorageService),
  __decorateParam(4, IConfigurationService)
], InlineEditsOnboardingExperience);
export {
  InlineEditsOnboardingExperience
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c05ld1VzZXJzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEJ1Z0luZGljYXRpbmdFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlLCBydW5PbkNoYW5nZSwgcnVuT25DaGFuZ2VXaXRoQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElubGluZUVkaXRzR3V0dGVySW5kaWNhdG9yIH0gZnJvbSAnLi9jb21wb25lbnRzL2d1dHRlckluZGljYXRvclZpZXcuanMnO1xuaW1wb3J0IHsgTW9kZWxQZXJJbmxpbmVFZGl0IH0gZnJvbSAnLi9pbmxpbmVFZGl0c01vZGVsLmpzJztcbmltcG9ydCB7IElubGluZUVkaXRzQ29sbGFwc2VkVmlldyB9IGZyb20gJy4vaW5saW5lRWRpdHNWaWV3cy9pbmxpbmVFZGl0c0NvbGxhcHNlZFZpZXcuanMnO1xuXG5lbnVtIFVzZXJLaW5kIHtcblx0Rmlyc3RUaW1lID0gJ2ZpcnN0VGltZScsXG5cdFNlY29uZFRpbWUgPSAnc2Vjb25kVGltZScsXG5cdEFjdGl2ZSA9ICdhY3RpdmUnXG59XG5cbmV4cG9ydCBjbGFzcyBJbmxpbmVFZGl0c09uYm9hcmRpbmdFeHBlcmllbmNlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2V0dXBEb25lID0gb2JzZXJ2YWJsZVZhbHVlKHsgbmFtZTogJ3NldHVwRG9uZScgfSwgZmFsc2UpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZUNvbXBsZXRpb25JZCA9IGRlcml2ZWQ8c3RyaW5nIHwgdW5kZWZpbmVkPihyZWFkZXIgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fbW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdGlmICghbW9kZWwpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXG5cdFx0aWYgKCF0aGlzLl9zZXR1cERvbmUucmVhZChyZWFkZXIpKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdGNvbnN0IGluZGljYXRvciA9IHRoaXMuX2luZGljYXRvci5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFpbmRpY2F0b3IgfHwgIWluZGljYXRvci5pc1Zpc2libGUucmVhZChyZWFkZXIpKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRcdHJldHVybiBtb2RlbC5pbmxpbmVFZGl0LmlubGluZUNvbXBsZXRpb24uaWRlbnRpdHkuaWQ7XG5cdH0pO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBJT2JzZXJ2YWJsZTxNb2RlbFBlcklubGluZUVkaXQgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2luZGljYXRvcjogSU9ic2VydmFibGU8SW5saW5lRWRpdHNHdXR0ZXJJbmRpY2F0b3IgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbGxhcHNlZFZpZXc6IElubGluZUVkaXRzQ29sbGFwc2VkVmlldyxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faW5pdGlhbGl6ZURlYnVnU2V0dGluZygpKTtcblxuXHRcdC8vIFNldHVwIHRoZSBvbmJvYXJkaW5nIGV4cGVyaWVuY2UgZm9yIG5ldyB1c2Vyc1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLnZhbHVlID0gdGhpcy5zZXR1cE5ld1VzZXJFeHBlcmllbmNlKCk7XG5cblx0XHR0aGlzLl9zZXR1cERvbmUuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRwcml2YXRlIHNldHVwTmV3VXNlckV4cGVyaWVuY2UoKTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmdldE5ld1VzZXJUeXBlKCkgPT09IFVzZXJLaW5kLkFjdGl2ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBkaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRsZXQgdXNlckhhc0hvdmVyZWRPdmVySWNvbiA9IGZhbHNlO1xuXHRcdGxldCBpbmxpbmVFZGl0SGFzQmVlbkFjY2VwdGVkID0gZmFsc2U7XG5cdFx0bGV0IGZpcnN0VGltZVVzZXJBbmltYXRpb25Db3VudCA9IDA7XG5cdFx0bGV0IHNlY29uZFRpbWVVc2VyQW5pbWF0aW9uQ291bnQgPSAwO1xuXG5cdFx0Ly8gcHVsc2UgYW5pbWF0aW9uIGZvciBuZXcgdXNlcnNcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHJ1bk9uQ2hhbmdlV2l0aENhbmNlbGxhdGlvblRva2VuKHRoaXMuX2FjdGl2ZUNvbXBsZXRpb25JZCwgYXN5bmMgKGlkLCBfLCBfXywgdG9rZW4pID0+IHtcblx0XHRcdGlmIChpZCA9PT0gdW5kZWZpbmVkKSB7IHJldHVybjsgfVxuXHRcdFx0bGV0IHVzZXJUeXBlID0gdGhpcy5nZXROZXdVc2VyVHlwZSgpO1xuXG5cdFx0XHQvLyBVc2VyIEtpbmQgVHJhbnNpdGlvblxuXHRcdFx0c3dpdGNoICh1c2VyVHlwZSkge1xuXHRcdFx0XHRjYXNlIFVzZXJLaW5kLkZpcnN0VGltZToge1xuXHRcdFx0XHRcdGlmIChmaXJzdFRpbWVVc2VyQW5pbWF0aW9uQ291bnQrKyA+PSA1IHx8IHVzZXJIYXNIb3ZlcmVkT3Zlckljb24pIHtcblx0XHRcdFx0XHRcdHVzZXJUeXBlID0gVXNlcktpbmQuU2Vjb25kVGltZTtcblx0XHRcdFx0XHRcdHRoaXMuc2V0TmV3VXNlclR5cGUodXNlclR5cGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRjYXNlIFVzZXJLaW5kLlNlY29uZFRpbWU6IHtcblx0XHRcdFx0XHRpZiAoc2Vjb25kVGltZVVzZXJBbmltYXRpb25Db3VudCsrID49IDMgJiYgaW5saW5lRWRpdEhhc0JlZW5BY2NlcHRlZCkge1xuXHRcdFx0XHRcdFx0dXNlclR5cGUgPSBVc2VyS2luZC5BY3RpdmU7XG5cdFx0XHRcdFx0XHR0aGlzLnNldE5ld1VzZXJUeXBlKHVzZXJUeXBlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Ly8gQW5pbWF0aW9uXG5cdFx0XHRzd2l0Y2ggKHVzZXJUeXBlKSB7XG5cdFx0XHRcdGNhc2UgVXNlcktpbmQuRmlyc3RUaW1lOiB7XG5cdFx0XHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAzICYmICF0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZDsgaSsrKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl9pbmRpY2F0b3IuZ2V0KCk/LnRyaWdnZXJBbmltYXRpb24oKTtcblx0XHRcdFx0XHRcdGF3YWl0IHRpbWVvdXQoNTAwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBVc2VyS2luZC5TZWNvbmRUaW1lOiB7XG5cdFx0XHRcdFx0dGhpcy5faW5kaWNhdG9yLmdldCgpPy50cmlnZ2VyQW5pbWF0aW9uKCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGlmICh0aGlzLl9jb2xsYXBzZWRWaWV3LmlzVmlzaWJsZS5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0aWYgKHRoaXMuZ2V0TmV3VXNlclR5cGUoKSAhPT0gVXNlcktpbmQuQWN0aXZlKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29sbGFwc2VkVmlldy50cmlnZ2VyQW5pbWF0aW9uKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZW1lbWJlciB3aGVuIHRoZSB1c2VyIGhhcyBob3ZlcmVkIG92ZXIgdGhlIGljb25cblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGF1dG9ydW4oKHJlYWRlcikgPT4ge1xuXHRcdFx0Y29uc3QgaW5kaWNhdG9yID0gdGhpcy5faW5kaWNhdG9yLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghaW5kaWNhdG9yKSB7IHJldHVybjsgfVxuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZChydW5PbkNoYW5nZShpbmRpY2F0b3IuaXNIb3ZlcmVkT3Zlckljb24sIGFzeW5jIChpc0hvdmVyZWQpID0+IHtcblx0XHRcdFx0aWYgKGlzSG92ZXJlZCkge1xuXHRcdFx0XHRcdHVzZXJIYXNIb3ZlcmVkT3Zlckljb24gPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUmVtZW1iZXIgd2hlbiB0aGUgdXNlciBoYXMgYWNjZXB0ZWQgYW4gaW5saW5lIGVkaXRcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKGF1dG9ydW4oKHJlYWRlcikgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIW1vZGVsKSB7IHJldHVybjsgfVxuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZChtb2RlbC5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRcdGlubGluZUVkaXRIYXNCZWVuQWNjZXB0ZWQgPSB0cnVlO1xuXHRcdFx0fSkpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiBkaXNwb3NhYmxlU3RvcmU7XG5cdH1cblxuXHRwcml2YXRlIGdldE5ld1VzZXJUeXBlKCk6IFVzZXJLaW5kIHtcblx0XHRyZXR1cm4gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0KCdpbmxpbmVFZGl0c0d1dHRlckluZGljYXRvclVzZXJLaW5kJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBVc2VyS2luZC5GaXJzdFRpbWUpIGFzIFVzZXJLaW5kO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXROZXdVc2VyVHlwZSh2YWx1ZTogVXNlcktpbmQpOiB2b2lkIHtcblx0XHRzd2l0Y2ggKHZhbHVlKSB7XG5cdFx0XHRjYXNlIFVzZXJLaW5kLkZpcnN0VGltZTpcblx0XHRcdFx0dGhyb3cgbmV3IEJ1Z0luZGljYXRpbmdFcnJvcignVXNlcktpbmQgc2hvdWxkIG5vdCBiZSBzZXQgdG8gZmlyc3QgdGltZScpO1xuXHRcdFx0Y2FzZSBVc2VyS2luZC5TZWNvbmRUaW1lOlxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgVXNlcktpbmQuQWN0aXZlOlxuXHRcdFx0XHR0aGlzLl9kaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5zdG9yZSgnaW5saW5lRWRpdHNHdXR0ZXJJbmRpY2F0b3JVc2VyS2luZCcsIHZhbHVlLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04sIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cdH1cblxuXHRwcml2YXRlIF9pbml0aWFsaXplRGVidWdTZXR0aW5nKCk6IElEaXNwb3NhYmxlIHtcblx0XHQvLyBEZWJ1ZyBzZXR0aW5nIHRvIHJlc2V0IHRoZSBuZXcgdXNlciBleHBlcmllbmNlXG5cdFx0Y29uc3QgaGlkZGVuRGVidWdTZXR0aW5nID0gJ2VkaXRvci5pbmxpbmVTdWdnZXN0LmVkaXRzLnJlc2V0TmV3VXNlckV4cGVyaWVuY2UnO1xuXHRcdGlmICh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShoaWRkZW5EZWJ1Z1NldHRpbmcpKSB7XG5cdFx0XHR0aGlzLl9zdG9yYWdlU2VydmljZS5yZW1vdmUoJ2lubGluZUVkaXRzR3V0dGVySW5kaWNhdG9yVXNlcktpbmQnLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihoaWRkZW5EZWJ1Z1NldHRpbmcpICYmIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKGhpZGRlbkRlYnVnU2V0dGluZykpIHtcblx0XHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2UucmVtb3ZlKCdpbmxpbmVFZGl0c0d1dHRlckluZGljYXRvclVzZXJLaW5kJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKTtcblx0XHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMudmFsdWUgPSB0aGlzLnNldHVwTmV3VXNlckV4cGVyaWVuY2UoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHJldHVybiBkaXNwb3NhYmxlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLFlBQVksaUJBQThCLHlCQUF5QjtBQUM1RSxTQUFTLFNBQVMsU0FBc0IsaUJBQWlCLGFBQWEsd0NBQXdDO0FBQzlHLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBSzdELElBQUssV0FBTCxrQkFBS0EsY0FBTDtBQUNDLEVBQUFBLFVBQUEsZUFBWTtBQUNaLEVBQUFBLFVBQUEsZ0JBQWE7QUFDYixFQUFBQSxVQUFBLFlBQVM7QUFITCxTQUFBQTtBQUFBLEdBQUE7QUFNRSxJQUFNLGtDQUFOLGNBQThDLFdBQVc7QUFBQSxFQWtCL0QsWUFDa0IsUUFDQSxZQUNBLGdCQUNpQixpQkFDTSx1QkFDdkM7QUFDRCxVQUFNO0FBTlc7QUFDQTtBQUNBO0FBQ2lCO0FBQ007QUFyQnpDLFNBQWlCLGVBQWUsS0FBSyxVQUFVLElBQUksa0JBQWtCLENBQUM7QUFFdEUsU0FBaUIsYUFBYSxnQkFBZ0IsRUFBRSxNQUFNLFlBQVksR0FBRyxLQUFLO0FBRTFFLFNBQWlCLHNCQUFzQixRQUE0QixZQUFVO0FBQzVFLFlBQU0sUUFBUSxLQUFLLE9BQU8sS0FBSyxNQUFNO0FBQ3JDLFVBQUksQ0FBQyxPQUFPO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFFaEMsVUFBSSxDQUFDLEtBQUssV0FBVyxLQUFLLE1BQU0sR0FBRztBQUFFLGVBQU87QUFBQSxNQUFXO0FBRXZELFlBQU0sWUFBWSxLQUFLLFdBQVcsS0FBSyxNQUFNO0FBQzdDLFVBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxVQUFVLEtBQUssTUFBTSxHQUFHO0FBQUUsZUFBTztBQUFBLE1BQVc7QUFFekUsYUFBTyxNQUFNLFdBQVcsaUJBQWlCLFNBQVM7QUFBQSxJQUNuRCxDQUFDO0FBV0EsU0FBSyxVQUFVLEtBQUssd0JBQXdCLENBQUM7QUFHN0MsU0FBSyxhQUFhLFFBQVEsS0FBSyx1QkFBdUI7QUFFdEQsU0FBSyxXQUFXLElBQUksTUFBTSxNQUFTO0FBQUEsRUFDcEM7QUFBQSxFQUVRLHlCQUFrRDtBQUN6RCxRQUFJLEtBQUssZUFBZSxNQUFNLHVCQUFpQjtBQUM5QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sa0JBQWtCLElBQUksZ0JBQWdCO0FBRTVDLFFBQUkseUJBQXlCO0FBQzdCLFFBQUksNEJBQTRCO0FBQ2hDLFFBQUksOEJBQThCO0FBQ2xDLFFBQUksK0JBQStCO0FBR25DLG9CQUFnQixJQUFJLGlDQUFpQyxLQUFLLHFCQUFxQixPQUFPLElBQUksR0FBRyxJQUFJLFVBQVU7QUFDMUcsVUFBSSxPQUFPLFFBQVc7QUFBRTtBQUFBLE1BQVE7QUFDaEMsVUFBSSxXQUFXLEtBQUssZUFBZTtBQUduQyxjQUFRLFVBQVU7QUFBQSxRQUNqQixLQUFLLDZCQUFvQjtBQUN4QixjQUFJLGlDQUFpQyxLQUFLLHdCQUF3QjtBQUNqRSx1QkFBVztBQUNYLGlCQUFLLGVBQWUsUUFBUTtBQUFBLFVBQzdCO0FBQ0E7QUFBQSxRQUNEO0FBQUEsUUFDQSxLQUFLLCtCQUFxQjtBQUN6QixjQUFJLGtDQUFrQyxLQUFLLDJCQUEyQjtBQUNyRSx1QkFBVztBQUNYLGlCQUFLLGVBQWUsUUFBUTtBQUFBLFVBQzdCO0FBQ0E7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUdBLGNBQVEsVUFBVTtBQUFBLFFBQ2pCLEtBQUssNkJBQW9CO0FBQ3hCLG1CQUFTLElBQUksR0FBRyxJQUFJLEtBQUssQ0FBQyxNQUFNLHlCQUF5QixLQUFLO0FBQzdELGtCQUFNLEtBQUssV0FBVyxJQUFJLEdBQUcsaUJBQWlCO0FBQzlDLGtCQUFNLFFBQVEsR0FBRztBQUFBLFVBQ2xCO0FBQ0E7QUFBQSxRQUNEO0FBQUEsUUFDQSxLQUFLLCtCQUFxQjtBQUN6QixlQUFLLFdBQVcsSUFBSSxHQUFHLGlCQUFpQjtBQUN4QztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixvQkFBZ0IsSUFBSSxRQUFRLFlBQVU7QUFDckMsVUFBSSxLQUFLLGVBQWUsVUFBVSxLQUFLLE1BQU0sR0FBRztBQUMvQyxZQUFJLEtBQUssZUFBZSxNQUFNLHVCQUFpQjtBQUM5QyxlQUFLLGVBQWUsaUJBQWlCO0FBQUEsUUFDdEM7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFHRixvQkFBZ0IsSUFBSSxRQUFRLENBQUMsV0FBVztBQUN2QyxZQUFNLFlBQVksS0FBSyxXQUFXLEtBQUssTUFBTTtBQUM3QyxVQUFJLENBQUMsV0FBVztBQUFFO0FBQUEsTUFBUTtBQUMxQixhQUFPLE1BQU0sSUFBSSxZQUFZLFVBQVUsbUJBQW1CLE9BQU8sY0FBYztBQUM5RSxZQUFJLFdBQVc7QUFDZCxtQ0FBeUI7QUFBQSxRQUMxQjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSCxDQUFDLENBQUM7QUFHRixvQkFBZ0IsSUFBSSxRQUFRLENBQUMsV0FBVztBQUN2QyxZQUFNLFFBQVEsS0FBSyxPQUFPLEtBQUssTUFBTTtBQUNyQyxVQUFJLENBQUMsT0FBTztBQUFFO0FBQUEsTUFBUTtBQUN0QixhQUFPLE1BQU0sSUFBSSxNQUFNLFlBQVksTUFBTTtBQUN4QyxvQ0FBNEI7QUFBQSxNQUM3QixDQUFDLENBQUM7QUFBQSxJQUNILENBQUMsQ0FBQztBQUVGLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxpQkFBMkI7QUFDbEMsV0FBTyxLQUFLLGdCQUFnQixJQUFJLHNDQUFzQyxhQUFhLGFBQWEsMkJBQWtCO0FBQUEsRUFDbkg7QUFBQSxFQUVRLGVBQWUsT0FBdUI7QUFDN0MsWUFBUSxPQUFPO0FBQUEsTUFDZCxLQUFLO0FBQ0osY0FBTSxJQUFJLG1CQUFtQiwwQ0FBMEM7QUFBQSxNQUN4RSxLQUFLO0FBQ0o7QUFBQSxNQUNELEtBQUs7QUFDSixhQUFLLGFBQWEsTUFBTTtBQUN4QjtBQUFBLElBQ0Y7QUFFQSxTQUFLLGdCQUFnQixNQUFNLHNDQUFzQyxPQUFPLGFBQWEsYUFBYSxjQUFjLElBQUk7QUFBQSxFQUNySDtBQUFBLEVBRVEsMEJBQXVDO0FBRTlDLFVBQU0scUJBQXFCO0FBQzNCLFFBQUksS0FBSyxzQkFBc0IsU0FBUyxrQkFBa0IsR0FBRztBQUM1RCxXQUFLLGdCQUFnQixPQUFPLHNDQUFzQyxhQUFhLFdBQVc7QUFBQSxJQUMzRjtBQUVBLFVBQU0sYUFBYSxLQUFLLHNCQUFzQix5QkFBeUIsT0FBSztBQUMzRSxVQUFJLEVBQUUscUJBQXFCLGtCQUFrQixLQUFLLEtBQUssc0JBQXNCLFNBQVMsa0JBQWtCLEdBQUc7QUFDMUcsYUFBSyxnQkFBZ0IsT0FBTyxzQ0FBc0MsYUFBYSxXQUFXO0FBQzFGLGFBQUssYUFBYSxRQUFRLEtBQUssdUJBQXVCO0FBQUEsTUFDdkQ7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBdkphLGtDQUFOO0FBQUEsRUFzQko7QUFBQSxFQUNBO0FBQUEsR0F2QlU7IiwKICAibmFtZXMiOiBbIlVzZXJLaW5kIl0KfQo=
