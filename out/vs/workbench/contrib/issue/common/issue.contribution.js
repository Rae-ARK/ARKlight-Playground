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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { MenuId, MenuRegistry } from "../../../../platform/actions/common/actions.js";
import { CommandsRegistry } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IWorkbenchIssueService } from "./issue.js";
const OpenIssueReporterActionId = "workbench.action.openIssueReporter";
const OpenIssueReporterApiId = "vscode.openIssueReporter";
const OpenIssueReporterCommandMetadata = {
  description: "Open the issue reporter and optionally prefill part of the form.",
  args: [
    {
      name: "options",
      description: "Data to use to prefill the issue reporter with.",
      isOptional: true,
      schema: {
        oneOf: [
          {
            type: "string",
            description: "The extension id to preselect."
          },
          {
            type: "object",
            properties: {
              extensionId: {
                type: "string"
              },
              issueTitle: {
                type: "string"
              },
              issueBody: {
                type: "string"
              }
            }
          }
        ]
      }
    }
  ]
};
let BaseIssueContribution = class extends Disposable {
  constructor(productService, configurationService) {
    super();
    if (!configurationService.getValue("telemetry.feedback.enabled")) {
      this._register(CommandsRegistry.registerCommand({
        id: "workbench.action.openIssueReporter",
        handler: function(accessor) {
          const data = accessor.get(INotificationService);
          data.info("Feedback is disabled.");
        }
      }));
      return;
    }
    if (!productService.reportIssueUrl) {
      return;
    }
    this._register(CommandsRegistry.registerCommand({
      id: OpenIssueReporterActionId,
      handler: function(accessor, args) {
        const data = typeof args === "string" ? { extensionId: args } : Array.isArray(args) ? { extensionId: args[0] } : args ?? {};
        return accessor.get(IWorkbenchIssueService).openReporter(data);
      },
      metadata: OpenIssueReporterCommandMetadata
    }));
    this._register(CommandsRegistry.registerCommand({
      id: OpenIssueReporterApiId,
      handler: function(accessor, args) {
        const data = typeof args === "string" ? { extensionId: args } : Array.isArray(args) ? { extensionId: args[0] } : args ?? {};
        return accessor.get(IWorkbenchIssueService).openReporter(data);
      },
      metadata: OpenIssueReporterCommandMetadata
    }));
    const reportIssue = {
      id: OpenIssueReporterActionId,
      title: localize2({ key: "reportIssueInEnglish", comment: ['Translate this to "Report Issue in English" in all languages please!'] }, "Report Issue..."),
      category: Categories.Help
    };
    this._register(MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: reportIssue }));
    this._register(MenuRegistry.appendMenuItem(MenuId.MenubarHelpMenu, {
      group: "3_feedback",
      command: {
        id: OpenIssueReporterActionId,
        title: localize({ key: "miReportIssue", comment: ["&& denotes a mnemonic", 'Translate this to "Report Issue in English" in all languages please!'] }, "Report &&Issue")
      },
      order: 3
    }));
  }
};
BaseIssueContribution = __decorateClass([
  __decorateParam(0, IProductService),
  __decorateParam(1, IConfigurationService)
], BaseIssueContribution);
export {
  BaseIssueContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2lzc3VlL2NvbW1vbi9pc3N1ZS5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbi5qcyc7XG5pbXBvcnQgeyBDYXRlZ29yaWVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uL2NvbW1vbi9hY3Rpb25Db21tb25DYXRlZ29yaWVzLmpzJztcbmltcG9ydCB7IE1lbnVJZCwgTWVudVJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb21tYW5kc1JlZ2lzdHJ5LCBJQ29tbWFuZE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUHJvZHVjdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSXNzdWVSZXBvcnRlckRhdGEsIElXb3JrYmVuY2hJc3N1ZVNlcnZpY2UgfSBmcm9tICcuL2lzc3VlLmpzJztcblxuY29uc3QgT3Blbklzc3VlUmVwb3J0ZXJBY3Rpb25JZCA9ICd3b3JrYmVuY2guYWN0aW9uLm9wZW5Jc3N1ZVJlcG9ydGVyJztcbmNvbnN0IE9wZW5Jc3N1ZVJlcG9ydGVyQXBpSWQgPSAndnNjb2RlLm9wZW5Jc3N1ZVJlcG9ydGVyJztcblxuY29uc3QgT3Blbklzc3VlUmVwb3J0ZXJDb21tYW5kTWV0YWRhdGE6IElDb21tYW5kTWV0YWRhdGEgPSB7XG5cdGRlc2NyaXB0aW9uOiAnT3BlbiB0aGUgaXNzdWUgcmVwb3J0ZXIgYW5kIG9wdGlvbmFsbHkgcHJlZmlsbCBwYXJ0IG9mIHRoZSBmb3JtLicsXG5cdGFyZ3M6IFtcblx0XHR7XG5cdFx0XHRuYW1lOiAnb3B0aW9ucycsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ0RhdGEgdG8gdXNlIHRvIHByZWZpbGwgdGhlIGlzc3VlIHJlcG9ydGVyIHdpdGguJyxcblx0XHRcdGlzT3B0aW9uYWw6IHRydWUsXG5cdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0b25lT2Y6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGhlIGV4dGVuc2lvbiBpZCB0byBwcmVzZWxlY3QuJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRcdGV4dGVuc2lvbklkOiB7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ3N0cmluZydcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0aXNzdWVUaXRsZToge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdGlzc3VlQm9keToge1xuXHRcdFx0XHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fVxuXHRcdH0sXG5cdF1cbn07XG5cbmludGVyZmFjZSBPcGVuSXNzdWVSZXBvcnRlckFyZ3Mge1xuXHRyZWFkb25seSBleHRlbnNpb25JZD86IHN0cmluZztcblx0cmVhZG9ubHkgaXNzdWVUaXRsZT86IHN0cmluZztcblx0cmVhZG9ubHkgaXNzdWVCb2R5Pzogc3RyaW5nO1xuXHRyZWFkb25seSBleHRlbnNpb25EYXRhPzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgQmFzZUlzc3VlQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0aWYgKCFjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPigndGVsZW1ldHJ5LmZlZWRiYWNrLmVuYWJsZWQnKSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ub3Blbklzc3VlUmVwb3J0ZXInLFxuXHRcdFx0XHRoYW5kbGVyOiBmdW5jdGlvbiAoYWNjZXNzb3IpIHtcblx0XHRcdFx0XHRjb25zdCBkYXRhID0gYWNjZXNzb3IuZ2V0KElOb3RpZmljYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0XHRkYXRhLmluZm8oJ0ZlZWRiYWNrIGlzIGRpc2FibGVkLicpO1xuXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFwcm9kdWN0U2VydmljZS5yZXBvcnRJc3N1ZVVybCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKENvbW1hbmRzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kKHtcblx0XHRcdGlkOiBPcGVuSXNzdWVSZXBvcnRlckFjdGlvbklkLFxuXHRcdFx0aGFuZGxlcjogZnVuY3Rpb24gKGFjY2Vzc29yLCBhcmdzPzogc3RyaW5nIHwgW3N0cmluZ10gfCBPcGVuSXNzdWVSZXBvcnRlckFyZ3MpIHtcblx0XHRcdFx0Y29uc3QgZGF0YTogUGFydGlhbDxJc3N1ZVJlcG9ydGVyRGF0YT4gPVxuXHRcdFx0XHRcdHR5cGVvZiBhcmdzID09PSAnc3RyaW5nJ1xuXHRcdFx0XHRcdFx0PyB7IGV4dGVuc2lvbklkOiBhcmdzIH1cblx0XHRcdFx0XHRcdDogQXJyYXkuaXNBcnJheShhcmdzKVxuXHRcdFx0XHRcdFx0XHQ/IHsgZXh0ZW5zaW9uSWQ6IGFyZ3NbMF0gfVxuXHRcdFx0XHRcdFx0XHQ6IGFyZ3MgPz8ge307XG5cblx0XHRcdFx0cmV0dXJuIGFjY2Vzc29yLmdldChJV29ya2JlbmNoSXNzdWVTZXJ2aWNlKS5vcGVuUmVwb3J0ZXIoZGF0YSk7XG5cdFx0XHR9LFxuXHRcdFx0bWV0YWRhdGE6IE9wZW5Jc3N1ZVJlcG9ydGVyQ29tbWFuZE1ldGFkYXRhXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoQ29tbWFuZHNSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmQoe1xuXHRcdFx0aWQ6IE9wZW5Jc3N1ZVJlcG9ydGVyQXBpSWQsXG5cdFx0XHRoYW5kbGVyOiBmdW5jdGlvbiAoYWNjZXNzb3IsIGFyZ3M/OiBzdHJpbmcgfCBbc3RyaW5nXSB8IE9wZW5Jc3N1ZVJlcG9ydGVyQXJncykge1xuXHRcdFx0XHRjb25zdCBkYXRhOiBQYXJ0aWFsPElzc3VlUmVwb3J0ZXJEYXRhPiA9XG5cdFx0XHRcdFx0dHlwZW9mIGFyZ3MgPT09ICdzdHJpbmcnXG5cdFx0XHRcdFx0XHQ/IHsgZXh0ZW5zaW9uSWQ6IGFyZ3MgfVxuXHRcdFx0XHRcdFx0OiBBcnJheS5pc0FycmF5KGFyZ3MpXG5cdFx0XHRcdFx0XHRcdD8geyBleHRlbnNpb25JZDogYXJnc1swXSB9XG5cdFx0XHRcdFx0XHRcdDogYXJncyA/PyB7fTtcblxuXHRcdFx0XHRyZXR1cm4gYWNjZXNzb3IuZ2V0KElXb3JrYmVuY2hJc3N1ZVNlcnZpY2UpLm9wZW5SZXBvcnRlcihkYXRhKTtcblx0XHRcdH0sXG5cdFx0XHRtZXRhZGF0YTogT3Blbklzc3VlUmVwb3J0ZXJDb21tYW5kTWV0YWRhdGFcblx0XHR9KSk7XG5cblx0XHRjb25zdCByZXBvcnRJc3N1ZTogSUNvbW1hbmRBY3Rpb24gPSB7XG5cdFx0XHRpZDogT3Blbklzc3VlUmVwb3J0ZXJBY3Rpb25JZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoeyBrZXk6ICdyZXBvcnRJc3N1ZUluRW5nbGlzaCcsIGNvbW1lbnQ6IFsnVHJhbnNsYXRlIHRoaXMgdG8gXCJSZXBvcnQgSXNzdWUgaW4gRW5nbGlzaFwiIGluIGFsbCBsYW5ndWFnZXMgcGxlYXNlISddIH0sIFwiUmVwb3J0IElzc3VlLi4uXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuSGVscFxuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3RlcihNZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLkNvbW1hbmRQYWxldHRlLCB7IGNvbW1hbmQ6IHJlcG9ydElzc3VlIH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKE1lbnVSZWdpc3RyeS5hcHBlbmRNZW51SXRlbShNZW51SWQuTWVudWJhckhlbHBNZW51LCB7XG5cdFx0XHRncm91cDogJzNfZmVlZGJhY2snLFxuXHRcdFx0Y29tbWFuZDoge1xuXHRcdFx0XHRpZDogT3Blbklzc3VlUmVwb3J0ZXJBY3Rpb25JZCxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKHsga2V5OiAnbWlSZXBvcnRJc3N1ZScsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJywgJ1RyYW5zbGF0ZSB0aGlzIHRvIFwiUmVwb3J0IElzc3VlIGluIEVuZ2xpc2hcIiBpbiBhbGwgbGFuZ3VhZ2VzIHBsZWFzZSEnXSB9LCBcIlJlcG9ydCAmJklzc3VlXCIpXG5cdFx0XHR9LFxuXHRcdFx0b3JkZXI6IDNcblx0XHR9KSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxVQUFVLGlCQUFpQjtBQUVwQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFFBQVEsb0JBQW9CO0FBQ3JDLFNBQVMsd0JBQTBDO0FBQ25ELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsdUJBQXVCO0FBRWhDLFNBQTRCLDhCQUE4QjtBQUUxRCxNQUFNLDRCQUE0QjtBQUNsQyxNQUFNLHlCQUF5QjtBQUUvQixNQUFNLG1DQUFxRDtBQUFBLEVBQzFELGFBQWE7QUFBQSxFQUNiLE1BQU07QUFBQSxJQUNMO0FBQUEsTUFDQyxNQUFNO0FBQUEsTUFDTixhQUFhO0FBQUEsTUFDYixZQUFZO0FBQUEsTUFDWixRQUFRO0FBQUEsUUFDUCxPQUFPO0FBQUEsVUFDTjtBQUFBLFlBQ0MsTUFBTTtBQUFBLFlBQ04sYUFBYTtBQUFBLFVBQ2Q7QUFBQSxVQUNBO0FBQUEsWUFDQyxNQUFNO0FBQUEsWUFDTixZQUFZO0FBQUEsY0FDWCxhQUFhO0FBQUEsZ0JBQ1osTUFBTTtBQUFBLGNBQ1A7QUFBQSxjQUNBLFlBQVk7QUFBQSxnQkFDWCxNQUFNO0FBQUEsY0FDUDtBQUFBLGNBQ0EsV0FBVztBQUFBLGdCQUNWLE1BQU07QUFBQSxjQUNQO0FBQUEsWUFDRDtBQUFBLFVBRUQ7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0Q7QUFTTyxJQUFNLHdCQUFOLGNBQW9DLFdBQTZDO0FBQUEsRUFDdkYsWUFDa0IsZ0JBQ00sc0JBQ3RCO0FBQ0QsVUFBTTtBQUVOLFFBQUksQ0FBQyxxQkFBcUIsU0FBa0IsNEJBQTRCLEdBQUc7QUFDMUUsV0FBSyxVQUFVLGlCQUFpQixnQkFBZ0I7QUFBQSxRQUMvQyxJQUFJO0FBQUEsUUFDSixTQUFTLFNBQVUsVUFBVTtBQUM1QixnQkFBTSxPQUFPLFNBQVMsSUFBSSxvQkFBb0I7QUFDOUMsZUFBSyxLQUFLLHVCQUF1QjtBQUFBLFFBRWxDO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFDRjtBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsZUFBZSxnQkFBZ0I7QUFDbkM7QUFBQSxJQUNEO0FBRUEsU0FBSyxVQUFVLGlCQUFpQixnQkFBZ0I7QUFBQSxNQUMvQyxJQUFJO0FBQUEsTUFDSixTQUFTLFNBQVUsVUFBVSxNQUFrRDtBQUM5RSxjQUFNLE9BQ0wsT0FBTyxTQUFTLFdBQ2IsRUFBRSxhQUFhLEtBQUssSUFDcEIsTUFBTSxRQUFRLElBQUksSUFDakIsRUFBRSxhQUFhLEtBQUssQ0FBQyxFQUFFLElBQ3ZCLFFBQVEsQ0FBQztBQUVkLGVBQU8sU0FBUyxJQUFJLHNCQUFzQixFQUFFLGFBQWEsSUFBSTtBQUFBLE1BQzlEO0FBQUEsTUFDQSxVQUFVO0FBQUEsSUFDWCxDQUFDLENBQUM7QUFFRixTQUFLLFVBQVUsaUJBQWlCLGdCQUFnQjtBQUFBLE1BQy9DLElBQUk7QUFBQSxNQUNKLFNBQVMsU0FBVSxVQUFVLE1BQWtEO0FBQzlFLGNBQU0sT0FDTCxPQUFPLFNBQVMsV0FDYixFQUFFLGFBQWEsS0FBSyxJQUNwQixNQUFNLFFBQVEsSUFBSSxJQUNqQixFQUFFLGFBQWEsS0FBSyxDQUFDLEVBQUUsSUFDdkIsUUFBUSxDQUFDO0FBRWQsZUFBTyxTQUFTLElBQUksc0JBQXNCLEVBQUUsYUFBYSxJQUFJO0FBQUEsTUFDOUQ7QUFBQSxNQUNBLFVBQVU7QUFBQSxJQUNYLENBQUMsQ0FBQztBQUVGLFVBQU0sY0FBOEI7QUFBQSxNQUNuQyxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsRUFBRSxLQUFLLHdCQUF3QixTQUFTLENBQUMsc0VBQXNFLEVBQUUsR0FBRyxpQkFBaUI7QUFBQSxNQUN0SixVQUFVLFdBQVc7QUFBQSxJQUN0QjtBQUVBLFNBQUssVUFBVSxhQUFhLGVBQWUsT0FBTyxnQkFBZ0IsRUFBRSxTQUFTLFlBQVksQ0FBQyxDQUFDO0FBRTNGLFNBQUssVUFBVSxhQUFhLGVBQWUsT0FBTyxpQkFBaUI7QUFBQSxNQUNsRSxPQUFPO0FBQUEsTUFDUCxTQUFTO0FBQUEsUUFDUixJQUFJO0FBQUEsUUFDSixPQUFPLFNBQVMsRUFBRSxLQUFLLGlCQUFpQixTQUFTLENBQUMseUJBQXlCLHNFQUFzRSxFQUFFLEdBQUcsZ0JBQWdCO0FBQUEsTUFDdks7QUFBQSxNQUNBLE9BQU87QUFBQSxJQUNSLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFDRDtBQXRFYSx3QkFBTjtBQUFBLEVBRUo7QUFBQSxFQUNBO0FBQUEsR0FIVTsiLAogICJuYW1lcyI6IFtdCn0K
