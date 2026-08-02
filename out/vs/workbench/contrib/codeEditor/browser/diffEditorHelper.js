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
import { autorunWithStore, observableFromEvent } from "../../../../base/common/observable.js";
import { registerDiffEditorContribution } from "../../../../editor/browser/editorExtensions.js";
import { EmbeddedDiffEditorWidget } from "../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { localize } from "../../../../nls.js";
import { AccessibleViewRegistry } from "../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { FloatingEditorClickWidget } from "../../../browser/codeeditor.js";
import { Extensions } from "../../../common/configuration.js";
import { DiffEditorAccessibilityHelp } from "./diffEditorAccessibilityHelp.js";
let DiffEditorHelperContribution = class extends Disposable {
  constructor(_diffEditor, _instantiationService, _textResourceConfigurationService, _notificationService) {
    super();
    this._diffEditor = _diffEditor;
    this._instantiationService = _instantiationService;
    this._textResourceConfigurationService = _textResourceConfigurationService;
    this._notificationService = _notificationService;
    const isEmbeddedDiffEditor = this._diffEditor instanceof EmbeddedDiffEditorWidget;
    if (!isEmbeddedDiffEditor) {
      const computationResult = observableFromEvent(this, (e) => this._diffEditor.onDidUpdateDiff(e), () => (
        /** @description diffEditor.diffComputationResult */
        this._diffEditor.getDiffComputationResult()
      ));
      const onlyWhiteSpaceChange = computationResult.map((r) => r && !r.identical && r.changes2.length === 0);
      this._register(autorunWithStore((reader, store) => {
        if (onlyWhiteSpaceChange.read(reader)) {
          const helperWidget = store.add(this._instantiationService.createInstance(
            FloatingEditorClickWidget,
            this._diffEditor.getModifiedEditor(),
            localize("hintWhitespace", "Show Whitespace Differences"),
            null
          ));
          store.add(helperWidget.onClick(() => {
            this._textResourceConfigurationService.updateValue(this._diffEditor.getModel().modified.uri, "diffEditor.ignoreTrimWhitespace", false);
          }));
          helperWidget.render();
        }
      }));
      this._register(this._diffEditor.onDidUpdateDiff(() => {
        const diffComputationResult = this._diffEditor.getDiffComputationResult();
        if (diffComputationResult && diffComputationResult.quitEarly) {
          this._notificationService.prompt(
            Severity.Warning,
            localize("hintTimeout", "The diff algorithm was stopped early (after {0} ms.)", this._diffEditor.maxComputationTime),
            [{
              label: localize("removeTimeout", "Remove Limit"),
              run: () => {
                this._textResourceConfigurationService.updateValue(this._diffEditor.getModel().modified.uri, "diffEditor.maxComputationTime", 0);
              }
            }],
            {}
          );
        }
      }));
    }
  }
};
DiffEditorHelperContribution.ID = "editor.contrib.diffEditorHelper";
DiffEditorHelperContribution = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ITextResourceConfigurationService),
  __decorateParam(3, INotificationService)
], DiffEditorHelperContribution);
registerDiffEditorContribution(DiffEditorHelperContribution.ID, DiffEditorHelperContribution);
Registry.as(Extensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "diffEditor.experimental.collapseUnchangedRegions",
  migrateFn: (value, accessor) => {
    return [
      ["diffEditor.hideUnchangedRegions.enabled", { value }],
      ["diffEditor.experimental.collapseUnchangedRegions", { value: void 0 }]
    ];
  }
}]);
AccessibleViewRegistry.register(new DiffEditorAccessibilityHelp());
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NvZGVFZGl0b3IvYnJvd3Nlci9kaWZmRWRpdG9ySGVscGVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuV2l0aFN0b3JlLCBvYnNlcnZhYmxlRnJvbUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJRGlmZkVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgcmVnaXN0ZXJEaWZmRWRpdG9yQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBFbWJlZGRlZERpZmZFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvZGlmZkVkaXRvci9lbWJlZGRlZERpZmZFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSURpZmZFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJsZVZpZXdSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjY2Vzc2liaWxpdHkvYnJvd3Nlci9hY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRmxvYXRpbmdFZGl0b3JDbGlja1dpZGdldCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY29kZWVkaXRvci5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25zLCBJQ29uZmlndXJhdGlvbk1pZ3JhdGlvblJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvckFjY2Vzc2liaWxpdHlIZWxwIH0gZnJvbSAnLi9kaWZmRWRpdG9yQWNjZXNzaWJpbGl0eUhlbHAuanMnO1xuXG5jbGFzcyBEaWZmRWRpdG9ySGVscGVyQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElEaWZmRWRpdG9yQ29udHJpYnV0aW9uIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdlZGl0b3IuY29udHJpYi5kaWZmRWRpdG9ySGVscGVyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmRWRpdG9yOiBJRGlmZkVkaXRvcixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZTogSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGlzRW1iZWRkZWREaWZmRWRpdG9yID0gdGhpcy5fZGlmZkVkaXRvciBpbnN0YW5jZW9mIEVtYmVkZGVkRGlmZkVkaXRvcldpZGdldDtcblxuXHRcdGlmICghaXNFbWJlZGRlZERpZmZFZGl0b3IpIHtcblx0XHRcdGNvbnN0IGNvbXB1dGF0aW9uUmVzdWx0ID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCBlID0+IHRoaXMuX2RpZmZFZGl0b3Iub25EaWRVcGRhdGVEaWZmKGUpLCAoKSA9PiAvKiogQGRlc2NyaXB0aW9uIGRpZmZFZGl0b3IuZGlmZkNvbXB1dGF0aW9uUmVzdWx0ICovIHRoaXMuX2RpZmZFZGl0b3IuZ2V0RGlmZkNvbXB1dGF0aW9uUmVzdWx0KCkpO1xuXHRcdFx0Y29uc3Qgb25seVdoaXRlU3BhY2VDaGFuZ2UgPSBjb21wdXRhdGlvblJlc3VsdC5tYXAociA9PiByICYmICFyLmlkZW50aWNhbCAmJiByLmNoYW5nZXMyLmxlbmd0aCA9PT0gMCk7XG5cblx0XHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW5XaXRoU3RvcmUoKHJlYWRlciwgc3RvcmUpID0+IHtcblx0XHRcdFx0LyoqIEBkZXNjcmlwdGlvbiB1cGRhdGUgc3RhdGUgKi9cblx0XHRcdFx0aWYgKG9ubHlXaGl0ZVNwYWNlQ2hhbmdlLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0XHRcdGNvbnN0IGhlbHBlcldpZGdldCA9IHN0b3JlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRcdEZsb2F0aW5nRWRpdG9yQ2xpY2tXaWRnZXQsXG5cdFx0XHRcdFx0XHR0aGlzLl9kaWZmRWRpdG9yLmdldE1vZGlmaWVkRWRpdG9yKCksXG5cdFx0XHRcdFx0XHRsb2NhbGl6ZSgnaGludFdoaXRlc3BhY2UnLCBcIlNob3cgV2hpdGVzcGFjZSBEaWZmZXJlbmNlc1wiKSxcblx0XHRcdFx0XHRcdG51bGxcblx0XHRcdFx0XHQpKTtcblx0XHRcdFx0XHRzdG9yZS5hZGQoaGVscGVyV2lkZ2V0Lm9uQ2xpY2soKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUodGhpcy5fZGlmZkVkaXRvci5nZXRNb2RlbCgpIS5tb2RpZmllZC51cmksICdkaWZmRWRpdG9yLmlnbm9yZVRyaW1XaGl0ZXNwYWNlJywgZmFsc2UpO1xuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0XHRoZWxwZXJXaWRnZXQucmVuZGVyKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZGlmZkVkaXRvci5vbkRpZFVwZGF0ZURpZmYoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBkaWZmQ29tcHV0YXRpb25SZXN1bHQgPSB0aGlzLl9kaWZmRWRpdG9yLmdldERpZmZDb21wdXRhdGlvblJlc3VsdCgpO1xuXG5cdFx0XHRcdGlmIChkaWZmQ29tcHV0YXRpb25SZXN1bHQgJiYgZGlmZkNvbXB1dGF0aW9uUmVzdWx0LnF1aXRFYXJseSkge1xuXHRcdFx0XHRcdHRoaXMuX25vdGlmaWNhdGlvblNlcnZpY2UucHJvbXB0KFxuXHRcdFx0XHRcdFx0U2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdoaW50VGltZW91dCcsIFwiVGhlIGRpZmYgYWxnb3JpdGhtIHdhcyBzdG9wcGVkIGVhcmx5IChhZnRlciB7MH0gbXMuKVwiLCB0aGlzLl9kaWZmRWRpdG9yLm1heENvbXB1dGF0aW9uVGltZSksXG5cdFx0XHRcdFx0XHRbe1xuXHRcdFx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3JlbW92ZVRpbWVvdXQnLCBcIlJlbW92ZSBMaW1pdFwiKSxcblx0XHRcdFx0XHRcdFx0cnVuOiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fdGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUodGhpcy5fZGlmZkVkaXRvci5nZXRNb2RlbCgpIS5tb2RpZmllZC51cmksICdkaWZmRWRpdG9yLm1heENvbXB1dGF0aW9uVGltZScsIDApO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdHt9XG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlckRpZmZFZGl0b3JDb250cmlidXRpb24oRGlmZkVkaXRvckhlbHBlckNvbnRyaWJ1dGlvbi5JRCwgRGlmZkVkaXRvckhlbHBlckNvbnRyaWJ1dGlvbik7XG5cblJlZ2lzdHJ5LmFzPElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnk+KEV4dGVuc2lvbnMuQ29uZmlndXJhdGlvbk1pZ3JhdGlvbilcblx0LnJlZ2lzdGVyQ29uZmlndXJhdGlvbk1pZ3JhdGlvbnMoW3tcblx0XHRrZXk6ICdkaWZmRWRpdG9yLmV4cGVyaW1lbnRhbC5jb2xsYXBzZVVuY2hhbmdlZFJlZ2lvbnMnLFxuXHRcdG1pZ3JhdGVGbjogKHZhbHVlLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0WydkaWZmRWRpdG9yLmhpZGVVbmNoYW5nZWRSZWdpb25zLmVuYWJsZWQnLCB7IHZhbHVlIH1dLFxuXHRcdFx0XHRbJ2RpZmZFZGl0b3IuZXhwZXJpbWVudGFsLmNvbGxhcHNlVW5jaGFuZ2VkUmVnaW9ucycsIHsgdmFsdWU6IHVuZGVmaW5lZCB9XVxuXHRcdFx0XTtcblx0XHR9XG5cdH1dKTtcbkFjY2Vzc2libGVWaWV3UmVnaXN0cnkucmVnaXN0ZXIobmV3IERpZmZFZGl0b3JBY2Nlc3NpYmlsaXR5SGVscCgpKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxrQkFBa0IsMkJBQTJCO0FBRXRELFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsc0JBQXNCLGdCQUFnQjtBQUMvQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGtCQUFtRDtBQUM1RCxTQUFTLG1DQUFtQztBQUU1QyxJQUFNLCtCQUFOLGNBQTJDLFdBQThDO0FBQUEsRUFHeEYsWUFDa0IsYUFDdUIsdUJBQ1ksbUNBQ2Isc0JBQ3RDO0FBQ0QsVUFBTTtBQUxXO0FBQ3VCO0FBQ1k7QUFDYjtBQUl2QyxVQUFNLHVCQUF1QixLQUFLLHVCQUF1QjtBQUV6RCxRQUFJLENBQUMsc0JBQXNCO0FBQzFCLFlBQU0sb0JBQW9CLG9CQUFvQixNQUFNLE9BQUssS0FBSyxZQUFZLGdCQUFnQixDQUFDLEdBQUc7QUFBQTtBQUFBLFFBQTJELEtBQUssWUFBWSx5QkFBeUI7QUFBQSxPQUFDO0FBQ3BNLFlBQU0sdUJBQXVCLGtCQUFrQixJQUFJLE9BQUssS0FBSyxDQUFDLEVBQUUsYUFBYSxFQUFFLFNBQVMsV0FBVyxDQUFDO0FBRXBHLFdBQUssVUFBVSxpQkFBaUIsQ0FBQyxRQUFRLFVBQVU7QUFFbEQsWUFBSSxxQkFBcUIsS0FBSyxNQUFNLEdBQUc7QUFDdEMsZ0JBQU0sZUFBZSxNQUFNLElBQUksS0FBSyxzQkFBc0I7QUFBQSxZQUN6RDtBQUFBLFlBQ0EsS0FBSyxZQUFZLGtCQUFrQjtBQUFBLFlBQ25DLFNBQVMsa0JBQWtCLDZCQUE2QjtBQUFBLFlBQ3hEO0FBQUEsVUFDRCxDQUFDO0FBQ0QsZ0JBQU0sSUFBSSxhQUFhLFFBQVEsTUFBTTtBQUNwQyxpQkFBSyxrQ0FBa0MsWUFBWSxLQUFLLFlBQVksU0FBUyxFQUFHLFNBQVMsS0FBSyxtQ0FBbUMsS0FBSztBQUFBLFVBQ3ZJLENBQUMsQ0FBQztBQUNGLHVCQUFhLE9BQU87QUFBQSxRQUNyQjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBRUYsV0FBSyxVQUFVLEtBQUssWUFBWSxnQkFBZ0IsTUFBTTtBQUNyRCxjQUFNLHdCQUF3QixLQUFLLFlBQVkseUJBQXlCO0FBRXhFLFlBQUkseUJBQXlCLHNCQUFzQixXQUFXO0FBQzdELGVBQUsscUJBQXFCO0FBQUEsWUFDekIsU0FBUztBQUFBLFlBQ1QsU0FBUyxlQUFlLHdEQUF3RCxLQUFLLFlBQVksa0JBQWtCO0FBQUEsWUFDbkgsQ0FBQztBQUFBLGNBQ0EsT0FBTyxTQUFTLGlCQUFpQixjQUFjO0FBQUEsY0FDL0MsS0FBSyxNQUFNO0FBQ1YscUJBQUssa0NBQWtDLFlBQVksS0FBSyxZQUFZLFNBQVMsRUFBRyxTQUFTLEtBQUssaUNBQWlDLENBQUM7QUFBQSxjQUNqSTtBQUFBLFlBQ0QsQ0FBQztBQUFBLFlBQ0QsQ0FBQztBQUFBLFVBQ0Y7QUFBQSxRQUNEO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDRDtBQUNEO0FBcERNLDZCQUNrQixLQUFLO0FBRHZCLCtCQUFOO0FBQUEsRUFLRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FQRztBQXNETiwrQkFBK0IsNkJBQTZCLElBQUksNEJBQTRCO0FBRTVGLFNBQVMsR0FBb0MsV0FBVyxzQkFBc0IsRUFDNUUsZ0NBQWdDLENBQUM7QUFBQSxFQUNqQyxLQUFLO0FBQUEsRUFDTCxXQUFXLENBQUMsT0FBTyxhQUFhO0FBQy9CLFdBQU87QUFBQSxNQUNOLENBQUMsMkNBQTJDLEVBQUUsTUFBTSxDQUFDO0FBQUEsTUFDckQsQ0FBQyxvREFBb0QsRUFBRSxPQUFPLE9BQVUsQ0FBQztBQUFBLElBQzFFO0FBQUEsRUFDRDtBQUNELENBQUMsQ0FBQztBQUNILHVCQUF1QixTQUFTLElBQUksNEJBQTRCLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
