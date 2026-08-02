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
import * as nls from "../../../../nls.js";
import { Action } from "../../../../base/common/actions.js";
import { IWorkbenchIssueService } from "../../issue/common/issue.js";
let ReportExtensionIssueAction = class extends Action {
  // TODO: Consider passing in IExtensionStatus or IExtensionHostProfile for additional data
  constructor(extension, issueService) {
    super(ReportExtensionIssueAction._id, ReportExtensionIssueAction._label, "extension-action report-issue");
    this.extension = extension;
    this.issueService = issueService;
    this.enabled = extension.isBuiltin || !!extension.repository && !!extension.repository.url;
  }
  async run() {
    await this.issueService.openReporter({
      extensionId: this.extension.identifier.value
    });
  }
};
ReportExtensionIssueAction._id = "workbench.extensions.action.reportExtensionIssue";
ReportExtensionIssueAction._label = nls.localize("reportExtensionIssue", "Report Issue");
ReportExtensionIssueAction = __decorateClass([
  __decorateParam(1, IWorkbenchIssueService)
], ReportExtensionIssueAction);
export {
  ReportExtensionIssueAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2V4dGVuc2lvbnMvY29tbW9uL3JlcG9ydEV4dGVuc2lvbklzc3VlQWN0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaElzc3VlU2VydmljZSB9IGZyb20gJy4uLy4uL2lzc3VlL2NvbW1vbi9pc3N1ZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBSZXBvcnRFeHRlbnNpb25Jc3N1ZUFjdGlvbiBleHRlbmRzIEFjdGlvbiB7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2lkID0gJ3dvcmtiZW5jaC5leHRlbnNpb25zLmFjdGlvbi5yZXBvcnRFeHRlbnNpb25Jc3N1ZSc7XG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9sYWJlbCA9IG5scy5sb2NhbGl6ZSgncmVwb3J0RXh0ZW5zaW9uSXNzdWUnLCBcIlJlcG9ydCBJc3N1ZVwiKTtcblxuXHQvLyBUT0RPOiBDb25zaWRlciBwYXNzaW5nIGluIElFeHRlbnNpb25TdGF0dXMgb3IgSUV4dGVuc2lvbkhvc3RQcm9maWxlIGZvciBhZGRpdGlvbmFsIGRhdGFcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBleHRlbnNpb246IElFeHRlbnNpb25EZXNjcmlwdGlvbixcblx0XHRASVdvcmtiZW5jaElzc3VlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGlzc3VlU2VydmljZTogSVdvcmtiZW5jaElzc3VlU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihSZXBvcnRFeHRlbnNpb25Jc3N1ZUFjdGlvbi5faWQsIFJlcG9ydEV4dGVuc2lvbklzc3VlQWN0aW9uLl9sYWJlbCwgJ2V4dGVuc2lvbi1hY3Rpb24gcmVwb3J0LWlzc3VlJyk7XG5cblx0XHR0aGlzLmVuYWJsZWQgPSBleHRlbnNpb24uaXNCdWlsdGluIHx8ICghIWV4dGVuc2lvbi5yZXBvc2l0b3J5ICYmICEhZXh0ZW5zaW9uLnJlcG9zaXRvcnkudXJsKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHJ1bigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLmlzc3VlU2VydmljZS5vcGVuUmVwb3J0ZXIoe1xuXHRcdFx0ZXh0ZW5zaW9uSWQ6IHRoaXMuZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUsXG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsY0FBYztBQUV2QixTQUFTLDhCQUE4QjtBQUVoQyxJQUFNLDZCQUFOLGNBQXlDLE9BQU87QUFBQTtBQUFBLEVBTXRELFlBQ1MsV0FDaUMsY0FDeEM7QUFDRCxVQUFNLDJCQUEyQixLQUFLLDJCQUEyQixRQUFRLCtCQUErQjtBQUhoRztBQUNpQztBQUl6QyxTQUFLLFVBQVUsVUFBVSxhQUFjLENBQUMsQ0FBQyxVQUFVLGNBQWMsQ0FBQyxDQUFDLFVBQVUsV0FBVztBQUFBLEVBQ3pGO0FBQUEsRUFFQSxNQUFlLE1BQXFCO0FBQ25DLFVBQU0sS0FBSyxhQUFhLGFBQWE7QUFBQSxNQUNwQyxhQUFhLEtBQUssVUFBVSxXQUFXO0FBQUEsSUFDeEMsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQXBCYSwyQkFFWSxNQUFNO0FBRmxCLDJCQUdZLFNBQVMsSUFBSSxTQUFTLHdCQUF3QixjQUFjO0FBSHhFLDZCQUFOO0FBQUEsRUFRSjtBQUFBLEdBUlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
