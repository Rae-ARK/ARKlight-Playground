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
import * as dom from "../../../../../../base/browser/dom.js";
import { renderLabelWithIcons } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { basename } from "../../../../../../base/common/resources.js";
import { localize } from "../../../../../../nls.js";
import { IActionWidgetService } from "../../../../../../platform/actionWidget/browser/actionWidget.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { ChatInputPickerActionViewItem } from "./chatInputPickerActionItem.js";
let WorkspacePickerActionItem = class extends ChatInputPickerActionViewItem {
  constructor(action, delegate, pickerOptions, actionWidgetService, keybindingService, contextKeyService, commandService, telemetryService) {
    const actionProvider = {
      getActions: () => {
        const currentWorkspace = this.delegate.getSelectedWorkspace();
        const workspaces = this.delegate.getWorkspaces();
        const actions = workspaces.map((workspace) => ({
          ...action,
          id: `workspace.${workspace.uri.toString()}`,
          label: workspace.label,
          checked: currentWorkspace?.uri.toString() === workspace.uri.toString(),
          icon: workspace.isFolder ? { id: "folder" } : { id: "file-symlink-directory" },
          enabled: true,
          tooltip: workspace.uri.fsPath,
          run: async () => {
            this.delegate.setSelectedWorkspace(workspace);
            if (this.element) {
              this.renderLabel(this.element);
            }
          }
        }));
        actions.push({
          ...action,
          id: "workspace.openFolder",
          label: localize("openFolder", "Open Folder..."),
          checked: false,
          enabled: true,
          tooltip: localize("openFolderTooltip", "Open Folder..."),
          run: async () => {
            this.commandService.executeCommand(this.delegate.openFolderCommand);
          }
        });
        return actions;
      }
    };
    const actionBarActionProvider = {
      getActions: () => []
    };
    const workspacePickerOptions = {
      actionProvider,
      actionBarActionProvider,
      showItemKeybindings: false,
      reporter: { id: "ChatWorkspacePicker", name: "ChatWorkspacePicker", includeOptions: false }
    };
    super(action, workspacePickerOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);
    this.delegate = delegate;
    this.commandService = commandService;
    this._register(this.delegate.onDidChangeSelectedWorkspace(() => {
      if (this.element) {
        this.renderLabel(this.element);
      }
    }));
    this._register(this.delegate.onDidChangeWorkspaces(() => {
      if (this.element) {
        this.renderLabel(this.element);
      }
    }));
  }
  renderLabel(element) {
    this.setAriaLabelAttributes(element);
    const currentWorkspace = this.delegate.getSelectedWorkspace();
    const labelElements = [];
    if (currentWorkspace) {
      const label = currentWorkspace.label || basename(currentWorkspace.uri);
      labelElements.push(...renderLabelWithIcons(`$(folder)`));
      labelElements.push(dom.$("span.chat-input-picker-label", void 0, label));
    } else {
      labelElements.push(...renderLabelWithIcons(`$(folder)`));
      labelElements.push(dom.$("span.chat-input-picker-label", void 0, localize("selectWorkspace", "Workspace")));
    }
    dom.reset(element, ...labelElements);
    return null;
  }
};
WorkspacePickerActionItem = __decorateClass([
  __decorateParam(3, IActionWidgetService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, ITelemetryService)
], WorkspacePickerActionItem);
export {
  WorkspacePickerActionItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci93aWRnZXQvaW5wdXQvd29ya3NwYWNlUGlja2VyQWN0aW9uSXRlbS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcblxuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUl0ZW1BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0LmpzJztcbmltcG9ydCB7IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbiwgSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uUHJvdmlkZXIsIElBY3Rpb25XaWRnZXREcm9wZG93bk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXREcm9wZG93bi5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ2hhdElucHV0UGlja2VyQWN0aW9uVmlld0l0ZW0sIElDaGF0SW5wdXRQaWNrZXJPcHRpb25zIH0gZnJvbSAnLi9jaGF0SW5wdXRQaWNrZXJBY3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VQaWNrZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgSUFjdGlvblByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2Ryb3Bkb3duL2Ryb3Bkb3duLmpzJztcblxuLyoqXG4gKiBBY3Rpb24gdmlldyBpdGVtIGZvciBzZWxlY3RpbmcgYSB0YXJnZXQgd29ya3NwYWNlIGluIHRoZSBjaGF0IGludGVyZmFjZS5cbiAqIFRoaXMgcGlja2VyIGFsbG93cyBzZWxlY3RpbmcgYSByZWNlbnQgd29ya3NwYWNlIHRvIHJ1biB0aGUgY2hhdCByZXF1ZXN0IGluLFxuICogd2hpY2ggaXMgdXNlZnVsIGZvciBlbXB0eSB3aW5kb3cgY29udGV4dHMuXG4gKi9cbmV4cG9ydCBjbGFzcyBXb3Jrc3BhY2VQaWNrZXJBY3Rpb25JdGVtIGV4dGVuZHMgQ2hhdElucHV0UGlja2VyQWN0aW9uVmlld0l0ZW0ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogTWVudUl0ZW1BY3Rpb24sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkZWxlZ2F0ZTogSVdvcmtzcGFjZVBpY2tlckRlbGVnYXRlLFxuXHRcdHBpY2tlck9wdGlvbnM6IElDaGF0SW5wdXRQaWNrZXJPcHRpb25zLFxuXHRcdEBJQWN0aW9uV2lkZ2V0U2VydmljZSBhY3Rpb25XaWRnZXRTZXJ2aWNlOiBJQWN0aW9uV2lkZ2V0U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0Y29uc3QgYWN0aW9uUHJvdmlkZXI6IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvblByb3ZpZGVyID0ge1xuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50V29ya3NwYWNlID0gdGhpcy5kZWxlZ2F0ZS5nZXRTZWxlY3RlZFdvcmtzcGFjZSgpO1xuXHRcdFx0XHRjb25zdCB3b3Jrc3BhY2VzID0gdGhpcy5kZWxlZ2F0ZS5nZXRXb3Jrc3BhY2VzKCk7XG5cblx0XHRcdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbldpZGdldERyb3Bkb3duQWN0aW9uW10gPSB3b3Jrc3BhY2VzLm1hcCh3b3Jrc3BhY2UgPT4gKHtcblx0XHRcdFx0XHQuLi5hY3Rpb24sXG5cdFx0XHRcdFx0aWQ6IGB3b3Jrc3BhY2UuJHt3b3Jrc3BhY2UudXJpLnRvU3RyaW5nKCl9YCxcblx0XHRcdFx0XHRsYWJlbDogd29ya3NwYWNlLmxhYmVsLFxuXHRcdFx0XHRcdGNoZWNrZWQ6IGN1cnJlbnRXb3Jrc3BhY2U/LnVyaS50b1N0cmluZygpID09PSB3b3Jrc3BhY2UudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0aWNvbjogd29ya3NwYWNlLmlzRm9sZGVyID8geyBpZDogJ2ZvbGRlcicgfSA6IHsgaWQ6ICdmaWxlLXN5bWxpbmstZGlyZWN0b3J5JyB9LFxuXHRcdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdFx0dG9vbHRpcDogd29ya3NwYWNlLnVyaS5mc1BhdGgsXG5cdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLmRlbGVnYXRlLnNldFNlbGVjdGVkV29ya3NwYWNlKHdvcmtzcGFjZSk7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMucmVuZGVyTGFiZWwodGhpcy5lbGVtZW50KTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Ly8gQWRkIFwiT3BlbiBGb2xkZXIuLi5cIiBvcHRpb25cblx0XHRcdFx0YWN0aW9ucy5wdXNoKHtcblx0XHRcdFx0XHQuLi5hY3Rpb24sXG5cdFx0XHRcdFx0aWQ6ICd3b3Jrc3BhY2Uub3BlbkZvbGRlcicsXG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdvcGVuRm9sZGVyJywgXCJPcGVuIEZvbGRlci4uLlwiKSxcblx0XHRcdFx0XHRjaGVja2VkOiBmYWxzZSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdvcGVuRm9sZGVyVG9vbHRpcCcsIFwiT3BlbiBGb2xkZXIuLi5cIiksXG5cdFx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKHRoaXMuZGVsZWdhdGUub3BlbkZvbGRlckNvbW1hbmQpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHJldHVybiBhY3Rpb25zO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBhY3Rpb25CYXJBY3Rpb25Qcm92aWRlcjogSUFjdGlvblByb3ZpZGVyID0ge1xuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gW11cblx0XHR9O1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlUGlja2VyT3B0aW9uczogT21pdDxJQWN0aW9uV2lkZ2V0RHJvcGRvd25PcHRpb25zLCAnbGFiZWwnIHwgJ2xhYmVsUmVuZGVyZXInPiA9IHtcblx0XHRcdGFjdGlvblByb3ZpZGVyLFxuXHRcdFx0YWN0aW9uQmFyQWN0aW9uUHJvdmlkZXIsXG5cdFx0XHRzaG93SXRlbUtleWJpbmRpbmdzOiBmYWxzZSxcblx0XHRcdHJlcG9ydGVyOiB7IGlkOiAnQ2hhdFdvcmtzcGFjZVBpY2tlcicsIG5hbWU6ICdDaGF0V29ya3NwYWNlUGlja2VyJywgaW5jbHVkZU9wdGlvbnM6IGZhbHNlIH0sXG5cdFx0fTtcblxuXHRcdHN1cGVyKGFjdGlvbiwgd29ya3NwYWNlUGlja2VyT3B0aW9ucywgcGlja2VyT3B0aW9ucywgYWN0aW9uV2lkZ2V0U2VydmljZSwga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZGVsZWdhdGUub25EaWRDaGFuZ2VTZWxlY3RlZFdvcmtzcGFjZSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5lbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMucmVuZGVyTGFiZWwodGhpcy5lbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlbGVnYXRlLm9uRGlkQ2hhbmdlV29ya3NwYWNlcygoKSA9PiB7XG5cdFx0XHQvLyBSZS1yZW5kZXIgd2hlbiB3b3Jrc3BhY2VzIGxpc3QgY2hhbmdlc1xuXHRcdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLnJlbmRlckxhYmVsKHRoaXMuZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckxhYmVsKGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogSURpc3Bvc2FibGUgfCBudWxsIHtcblx0XHR0aGlzLnNldEFyaWFMYWJlbEF0dHJpYnV0ZXMoZWxlbWVudCk7XG5cdFx0Y29uc3QgY3VycmVudFdvcmtzcGFjZSA9IHRoaXMuZGVsZWdhdGUuZ2V0U2VsZWN0ZWRXb3Jrc3BhY2UoKTtcblxuXHRcdGNvbnN0IGxhYmVsRWxlbWVudHM6IChzdHJpbmcgfCBIVE1MRWxlbWVudClbXSA9IFtdO1xuXG5cdFx0aWYgKGN1cnJlbnRXb3Jrc3BhY2UpIHtcblx0XHRcdC8vIFNob3cgdGhlIHdvcmtzcGFjZSBsYWJlbCBvciBmb2xkZXIgbmFtZVxuXHRcdFx0Y29uc3QgbGFiZWwgPSBjdXJyZW50V29ya3NwYWNlLmxhYmVsIHx8IGJhc2VuYW1lKGN1cnJlbnRXb3Jrc3BhY2UudXJpKTtcblx0XHRcdGxhYmVsRWxlbWVudHMucHVzaCguLi5yZW5kZXJMYWJlbFdpdGhJY29ucyhgJChmb2xkZXIpYCkpO1xuXHRcdFx0bGFiZWxFbGVtZW50cy5wdXNoKGRvbS4kKCdzcGFuLmNoYXQtaW5wdXQtcGlja2VyLWxhYmVsJywgdW5kZWZpbmVkLCBsYWJlbCkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRsYWJlbEVsZW1lbnRzLnB1c2goLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMoYCQoZm9sZGVyKWApKTtcblx0XHRcdGxhYmVsRWxlbWVudHMucHVzaChkb20uJCgnc3Bhbi5jaGF0LWlucHV0LXBpY2tlci1sYWJlbCcsIHVuZGVmaW5lZCwgbG9jYWxpemUoJ3NlbGVjdFdvcmtzcGFjZScsIFwiV29ya3NwYWNlXCIpKSk7XG5cdFx0fVxuXG5cdFx0ZG9tLnJlc2V0KGVsZW1lbnQsIC4uLmxhYmVsRWxlbWVudHMpO1xuXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNEJBQTRCO0FBR3JDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUNBQThEO0FBU2hFLElBQU0sNEJBQU4sY0FBd0MsOEJBQThCO0FBQUEsRUFFNUUsWUFDQyxRQUNpQixVQUNqQixlQUNzQixxQkFDRixtQkFDQSxtQkFDYyxnQkFDZixrQkFDbEI7QUFDRCxVQUFNLGlCQUFzRDtBQUFBLE1BQzNELFlBQVksTUFBTTtBQUNqQixjQUFNLG1CQUFtQixLQUFLLFNBQVMscUJBQXFCO0FBQzVELGNBQU0sYUFBYSxLQUFLLFNBQVMsY0FBYztBQUUvQyxjQUFNLFVBQXlDLFdBQVcsSUFBSSxn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
