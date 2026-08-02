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
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { WorkbenchPhase, registerWorkbenchContribution2 } from "../../../common/contributions.js";
import { BrowserDialogHandler } from "./dialogHandler.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { createBrowserAboutDialogDetails } from "./dialog.js";
let DialogHandlerContribution = class extends Disposable {
  constructor(dialogService, instantiationService, productService) {
    super();
    this.dialogService = dialogService;
    this.productService = productService;
    this.impl = new Lazy(() => instantiationService.createInstance(BrowserDialogHandler));
    this.model = this.dialogService.model;
    this._register(this.model.onWillShowDialog(() => {
      if (!this.currentDialog) {
        this.processDialogs();
      }
    }));
    this.processDialogs();
  }
  async processDialogs() {
    while (this.model.dialogs.length) {
      this.currentDialog = this.model.dialogs[0];
      let result = void 0;
      try {
        if (this.currentDialog.args.confirmArgs) {
          const args = this.currentDialog.args.confirmArgs;
          result = await this.impl.value.confirm(args.confirmation);
        } else if (this.currentDialog.args.inputArgs) {
          const args = this.currentDialog.args.inputArgs;
          result = await this.impl.value.input(args.input);
        } else if (this.currentDialog.args.promptArgs) {
          const args = this.currentDialog.args.promptArgs;
          result = await this.impl.value.prompt(args.prompt);
        } else {
          const aboutDialogDetails = createBrowserAboutDialogDetails(this.productService);
          await this.impl.value.about(aboutDialogDetails.title, aboutDialogDetails.details, aboutDialogDetails.detailsToCopy);
        }
      } catch (error) {
        result = error;
      }
      this.currentDialog.close(result);
      this.currentDialog = void 0;
    }
  }
};
DialogHandlerContribution.ID = "workbench.contrib.dialogHandler";
DialogHandlerContribution = __decorateClass([
  __decorateParam(0, IDialogService),
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, IProductService)
], DialogHandlerContribution);
registerWorkbenchContribution2(
  DialogHandlerContribution.ID,
  DialogHandlerContribution,
  WorkbenchPhase.BlockStartup
  // Block to allow for dialogs to show before restore finished
);
export {
  DialogHandlerContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2RpYWxvZ3MvZGlhbG9nLndlYi5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJRGlhbG9nSGFuZGxlciwgSURpYWxvZ1Jlc3VsdCwgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLCByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nc01vZGVsLCBJRGlhbG9nVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBCcm93c2VyRGlhbG9nSGFuZGxlciB9IGZyb20gJy4vZGlhbG9nSGFuZGxlci5qcyc7XG5pbXBvcnQgeyBEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZGlhbG9ncy9jb21tb24vZGlhbG9nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgTGF6eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhenkuanMnO1xuaW1wb3J0IHsgY3JlYXRlQnJvd3NlckFib3V0RGlhbG9nRGV0YWlscyB9IGZyb20gJy4vZGlhbG9nLmpzJztcblxuZXhwb3J0IGNsYXNzIERpYWxvZ0hhbmRsZXJDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLmRpYWxvZ0hhbmRsZXInO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWw6IElEaWFsb2dzTW9kZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgaW1wbDogTGF6eTxJRGlhbG9nSGFuZGxlcj47XG5cblx0cHJpdmF0ZSBjdXJyZW50RGlhbG9nOiBJRGlhbG9nVmlld0l0ZW0gfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElEaWFsb2dTZXJ2aWNlIHByaXZhdGUgZGlhbG9nU2VydmljZTogSURpYWxvZ1NlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5pbXBsID0gbmV3IExhenkoKCkgPT4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnJvd3NlckRpYWxvZ0hhbmRsZXIpKTtcblx0XHR0aGlzLm1vZGVsID0gKHRoaXMuZGlhbG9nU2VydmljZSBhcyBEaWFsb2dTZXJ2aWNlKS5tb2RlbDtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubW9kZWwub25XaWxsU2hvd0RpYWxvZygoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuY3VycmVudERpYWxvZykge1xuXHRcdFx0XHR0aGlzLnByb2Nlc3NEaWFsb2dzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5wcm9jZXNzRGlhbG9ncygpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBwcm9jZXNzRGlhbG9ncygpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR3aGlsZSAodGhpcy5tb2RlbC5kaWFsb2dzLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5jdXJyZW50RGlhbG9nID0gdGhpcy5tb2RlbC5kaWFsb2dzWzBdO1xuXG5cdFx0XHRsZXQgcmVzdWx0OiBJRGlhbG9nUmVzdWx0IHwgRXJyb3IgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRpZiAodGhpcy5jdXJyZW50RGlhbG9nLmFyZ3MuY29uZmlybUFyZ3MpIHtcblx0XHRcdFx0XHRjb25zdCBhcmdzID0gdGhpcy5jdXJyZW50RGlhbG9nLmFyZ3MuY29uZmlybUFyZ3M7XG5cdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5pbXBsLnZhbHVlLmNvbmZpcm0oYXJncy5jb25maXJtYXRpb24pO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuY3VycmVudERpYWxvZy5hcmdzLmlucHV0QXJncykge1xuXHRcdFx0XHRcdGNvbnN0IGFyZ3MgPSB0aGlzLmN1cnJlbnREaWFsb2cuYXJncy5pbnB1dEFyZ3M7XG5cdFx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5pbXBsLnZhbHVlLmlucHV0KGFyZ3MuaW5wdXQpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRoaXMuY3VycmVudERpYWxvZy5hcmdzLnByb21wdEFyZ3MpIHtcblx0XHRcdFx0XHRjb25zdCBhcmdzID0gdGhpcy5jdXJyZW50RGlhbG9nLmFyZ3MucHJvbXB0QXJncztcblx0XHRcdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLmltcGwudmFsdWUucHJvbXB0KGFyZ3MucHJvbXB0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBhYm91dERpYWxvZ0RldGFpbHMgPSBjcmVhdGVCcm93c2VyQWJvdXREaWFsb2dEZXRhaWxzKHRoaXMucHJvZHVjdFNlcnZpY2UpO1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuaW1wbC52YWx1ZS5hYm91dChhYm91dERpYWxvZ0RldGFpbHMudGl0bGUsIGFib3V0RGlhbG9nRGV0YWlscy5kZXRhaWxzLCBhYm91dERpYWxvZ0RldGFpbHMuZGV0YWlsc1RvQ29weSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHJlc3VsdCA9IGVycm9yO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLmN1cnJlbnREaWFsb2cuY2xvc2UocmVzdWx0KTtcblx0XHRcdHRoaXMuY3VycmVudERpYWxvZyA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24yKFxuXHREaWFsb2dIYW5kbGVyQ29udHJpYnV0aW9uLklELFxuXHREaWFsb2dIYW5kbGVyQ29udHJpYnV0aW9uLFxuXHRXb3JrYmVuY2hQaGFzZS5CbG9ja1N0YXJ0dXAgLy8gQmxvY2sgdG8gYWxsb3cgZm9yIGRpYWxvZ3MgdG8gc2hvdyBiZWZvcmUgcmVzdG9yZSBmaW5pc2hlZFxuKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBd0Msc0JBQXNCO0FBQzlELFNBQVMsdUJBQXVCO0FBQ2hDLFNBQWlDLGdCQUFnQixzQ0FBc0M7QUFFdkYsU0FBUyw0QkFBNEI7QUFFckMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsdUNBQXVDO0FBRXpDLElBQU0sNEJBQU4sY0FBd0MsV0FBNkM7QUFBQSxFQVMzRixZQUN5QixlQUNELHNCQUNFLGdCQUN4QjtBQUNELFVBQU07QUFKa0I7QUFFQztBQUl6QixTQUFLLE9BQU8sSUFBSSxLQUFLLE1BQU0scUJBQXFCLGVBQWUsb0JBQW9CLENBQUM7QUFDcEYsU0FBSyxRQUFTLEtBQUssY0FBZ0M7QUFFbkQsU0FBSyxVQUFVLEtBQUssTUFBTSxpQkFBaUIsTUFBTTtBQUNoRCxVQUFJLENBQUMsS0FBSyxlQUFlO0FBQ3hCLGFBQUssZUFBZTtBQUFBLE1BQ3JCO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixTQUFLLGVBQWU7QUFBQSxFQUNyQjtBQUFBLEVBRUEsTUFBYyxpQkFBZ0M7QUFDN0MsV0FBTyxLQUFLLE1BQU0sUUFBUSxRQUFRO0FBQ2pDLFdBQUssZ0JBQWdCLEtBQUssTUFBTSxRQUFRLENBQUM7QUFFekMsVUFBSSxTQUE0QztBQUNoRCxVQUFJO0FBQ0gsWUFBSSxLQUFLLGNBQWMsS0FBSyxhQUFhO0FBQ3hDLGdCQUFNLE9BQU8sS0FBSyxjQUFjLEtBQUs7QUFDckMsbUJBQVMsTUFBTSxLQUFLLEtBQUssTUFBTSxRQUFRLEtBQUssWUFBWTtBQUFBLFFBQ3pELFdBQVcsS0FBSyxjQUFjLEtBQUssV0FBVztBQUM3QyxnQkFBTSxPQUFPLEtBQUssY0FBYyxLQUFLO0FBQ3JDLG1CQUFTLE1BQU0sS0FBSyxLQUFLLE1BQU0sTUFBTSxLQUFLLEtBQUs7QUFBQSxRQUNoRCxXQUFXLEtBQUssY0FBYyxLQUFLLFlBQVk7QUFDOUMsZ0JBQU0sT0FBTyxLQUFLLGNBQWMsS0FBSztBQUNyQyxtQkFBUyxNQUFNLEtBQUssS0FBSyxNQUFNLE9BQU8sS0FBSyxNQUFNO0FBQUEsUUFDbEQsT0FBTztBQUNOLGdCQUFNLHFCQUFxQixnQ0FBZ0MsS0FBSyxjQUFjO0FBQzlFLGdCQUFNLEtBQUssS0FBSyxNQUFNLE1BQU0sbUJBQW1CLE9BQU8sbUJBQW1CLFNBQVMsbUJBQW1CLGFBQWE7QUFBQSxRQUNuSDtBQUFBLE1BQ0QsU0FBUyxPQUFPO0FBQ2YsaUJBQVM7QUFBQSxNQUNWO0FBRUEsV0FBSyxjQUFjLE1BQU0sTUFBTTtBQUMvQixXQUFLLGdCQUFnQjtBQUFBLElBQ3RCO0FBQUEsRUFDRDtBQUNEO0FBdkRhLDBCQUVJLEtBQUs7QUFGVCw0QkFBTjtBQUFBLEVBVUo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBWlU7QUF5RGI7QUFBQSxFQUNDLDBCQUEwQjtBQUFBLEVBQzFCO0FBQUEsRUFDQSxlQUFlO0FBQUE7QUFDaEI7IiwKICAibmFtZXMiOiBbXQp9Cg==
