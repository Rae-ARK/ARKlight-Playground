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
import { toAction } from "../../../../base/common/actions.js";
import { CopyPasteController, pasteAsPreferenceConfig } from "../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js";
import { DropIntoEditorController, dropAsPreferenceConfig } from "../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js";
import { localize } from "../../../../nls.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
let DropOrPasteIntoCommands = class {
  constructor(_preferencesService) {
    this._preferencesService = _preferencesService;
    CopyPasteController.setConfigureDefaultAction(toAction({
      id: "workbench.action.configurePreferredPasteAction",
      label: localize("configureDefaultPaste.label", "Configure preferred paste action..."),
      run: () => this.configurePreferredPasteAction()
    }));
    DropIntoEditorController.setConfigureDefaultAction(toAction({
      id: "workbench.action.configurePreferredDropAction",
      label: localize("configureDefaultDrop.label", "Configure preferred drop action..."),
      run: () => this.configurePreferredDropAction()
    }));
  }
  configurePreferredPasteAction() {
    return this._preferencesService.openUserSettings({
      jsonEditor: true,
      revealSetting: { key: pasteAsPreferenceConfig, edit: true }
    });
  }
  configurePreferredDropAction() {
    return this._preferencesService.openUserSettings({
      jsonEditor: true,
      revealSetting: { key: dropAsPreferenceConfig, edit: true }
    });
  }
};
DropOrPasteIntoCommands.ID = "workbench.contrib.dropOrPasteInto";
DropOrPasteIntoCommands = __decorateClass([
  __decorateParam(0, IPreferencesService)
], DropOrPasteIntoCommands);
export {
  DropOrPasteIntoCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2Ryb3BPclBhc3RlSW50by9icm93c2VyL2NvbW1hbmRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENvcHlQYXN0ZUNvbnRyb2xsZXIsIHBhc3RlQXNQcmVmZXJlbmNlQ29uZmlnIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZHJvcE9yUGFzdGVJbnRvL2Jyb3dzZXIvY29weVBhc3RlQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBEcm9wSW50b0VkaXRvckNvbnRyb2xsZXIsIGRyb3BBc1ByZWZlcmVuY2VDb25maWcgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9kcm9wT3JQYXN0ZUludG8vYnJvd3Nlci9kcm9wSW50b0VkaXRvckNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuXG5leHBvcnQgY2xhc3MgRHJvcE9yUGFzdGVJbnRvQ29tbWFuZHMgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblx0cHVibGljIHN0YXRpYyBJRCA9ICd3b3JrYmVuY2guY29udHJpYi5kcm9wT3JQYXN0ZUludG8nO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUHJlZmVyZW5jZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3ByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZVxuXHQpIHtcblx0XHRDb3B5UGFzdGVDb250cm9sbGVyLnNldENvbmZpZ3VyZURlZmF1bHRBY3Rpb24odG9BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNvbmZpZ3VyZVByZWZlcnJlZFBhc3RlQWN0aW9uJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY29uZmlndXJlRGVmYXVsdFBhc3RlLmxhYmVsJywgJ0NvbmZpZ3VyZSBwcmVmZXJyZWQgcGFzdGUgYWN0aW9uLi4uJyksXG5cdFx0XHRydW46ICgpID0+IHRoaXMuY29uZmlndXJlUHJlZmVycmVkUGFzdGVBY3Rpb24oKVxuXHRcdH0pKTtcblxuXHRcdERyb3BJbnRvRWRpdG9yQ29udHJvbGxlci5zZXRDb25maWd1cmVEZWZhdWx0QWN0aW9uKHRvQWN0aW9uKHtcblx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jb25maWd1cmVQcmVmZXJyZWREcm9wQWN0aW9uJyxcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnY29uZmlndXJlRGVmYXVsdERyb3AubGFiZWwnLCAnQ29uZmlndXJlIHByZWZlcnJlZCBkcm9wIGFjdGlvbi4uLicpLFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvbmZpZ3VyZVByZWZlcnJlZERyb3BBY3Rpb24oKVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgY29uZmlndXJlUHJlZmVycmVkUGFzdGVBY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ByZWZlcmVuY2VzU2VydmljZS5vcGVuVXNlclNldHRpbmdzKHtcblx0XHRcdGpzb25FZGl0b3I6IHRydWUsXG5cdFx0XHRyZXZlYWxTZXR0aW5nOiB7IGtleTogcGFzdGVBc1ByZWZlcmVuY2VDb25maWcsIGVkaXQ6IHRydWUgfVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBjb25maWd1cmVQcmVmZXJyZWREcm9wQWN0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLl9wcmVmZXJlbmNlc1NlcnZpY2Uub3BlblVzZXJTZXR0aW5ncyh7XG5cdFx0XHRqc29uRWRpdG9yOiB0cnVlLFxuXHRcdFx0cmV2ZWFsU2V0dGluZzogeyBrZXk6IGRyb3BBc1ByZWZlcmVuY2VDb25maWcsIGVkaXQ6IHRydWUgfVxuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMscUJBQXFCLCtCQUErQjtBQUM3RCxTQUFTLDBCQUEwQiw4QkFBOEI7QUFDakUsU0FBUyxnQkFBZ0I7QUFFekIsU0FBUywyQkFBMkI7QUFFN0IsSUFBTSwwQkFBTixNQUFnRTtBQUFBLEVBR3RFLFlBQ3VDLHFCQUNyQztBQURxQztBQUV0Qyx3QkFBb0IsMEJBQTBCLFNBQVM7QUFBQSxNQUN0RCxJQUFJO0FBQUEsTUFDSixPQUFPLFNBQVMsK0JBQStCLHFDQUFxQztBQUFBLE1BQ3BGLEtBQUssTUFBTSxLQUFLLDhCQUE4QjtBQUFBLElBQy9DLENBQUMsQ0FBQztBQUVGLDZCQUF5QiwwQkFBMEIsU0FBUztBQUFBLE1BQzNELElBQUk7QUFBQSxNQUNKLE9BQU8sU0FBUyw4QkFBOEIsb0NBQW9DO0FBQUEsTUFDbEYsS0FBSyxNQUFNLEtBQUssNkJBQTZCO0FBQUEsSUFDOUMsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsZ0NBQWdDO0FBQ3ZDLFdBQU8sS0FBSyxvQkFBb0IsaUJBQWlCO0FBQUEsTUFDaEQsWUFBWTtBQUFBLE1BQ1osZUFBZSxFQUFFLEtBQUsseUJBQXlCLE1BQU0sS0FBSztBQUFBLElBQzNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSwrQkFBK0I7QUFDdEMsV0FBTyxLQUFLLG9CQUFvQixpQkFBaUI7QUFBQSxNQUNoRCxZQUFZO0FBQUEsTUFDWixlQUFlLEVBQUUsS0FBSyx3QkFBd0IsTUFBTSxLQUFLO0FBQUEsSUFDMUQsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQWhDYSx3QkFDRSxLQUFLO0FBRFAsMEJBQU47QUFBQSxFQUlKO0FBQUEsR0FKVTsiLAogICJuYW1lcyI6IFtdCn0K
