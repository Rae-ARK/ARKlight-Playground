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
import * as dom from "../../../../base/browser/dom.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { IActionWidgetService } from "../../../../platform/actionWidget/browser/actionWidget.js";
import { ActionListItemKind } from "../../../../platform/actionWidget/browser/actionList.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { renderIcon } from "../../../../base/browser/ui/iconLabel/iconLabels.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
const OPEN_REPO_COMMAND = "github.copilot.chat.cloudSessions.openRepository";
const STORAGE_KEY_LAST_REPO = "agentSessions.lastPickedRepo";
const STORAGE_KEY_RECENT_REPOS = "agentSessions.recentlyPickedRepos";
const MAX_RECENT_REPOS = 10;
const FILTER_THRESHOLD = 10;
let RepoPicker = class extends Disposable {
  constructor(actionWidgetService, storageService, commandService) {
    super();
    this.actionWidgetService = actionWidgetService;
    this.storageService = storageService;
    this.commandService = commandService;
    this._onDidSelectRepo = this._register(new Emitter());
    this.onDidSelectRepo = this._onDidSelectRepo.event;
    this._renderDisposables = this._register(new DisposableStore());
    this._recentlyPickedRepos = [];
    try {
      const last = this.storageService.get(STORAGE_KEY_LAST_REPO, StorageScope.PROFILE);
      if (last) {
        this._selectedRepo = JSON.parse(last);
      }
    } catch {
    }
    try {
      const stored = this.storageService.get(STORAGE_KEY_RECENT_REPOS, StorageScope.PROFILE);
      if (stored) {
        this._recentlyPickedRepos = JSON.parse(stored);
      }
    } catch {
    }
  }
  get selectedRepo() {
    return this._selectedRepo?.id;
  }
  /**
   * Renders the repo picker trigger button into the given container.
   * Returns the container element.
   */
  render(container) {
    this._renderDisposables.clear();
    const slot = dom.append(container, dom.$(".sessions-chat-picker-slot"));
    this._renderDisposables.add({ dispose: () => slot.remove() });
    const trigger = dom.append(slot, dom.$("a.action-label"));
    trigger.tabIndex = 0;
    trigger.role = "button";
    this._triggerElement = trigger;
    this._updateTriggerLabel();
    this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e, true);
      this.showPicker();
    }));
    this._renderDisposables.add(dom.addDisposableListener(trigger, dom.EventType.KEY_DOWN, (e) => {
      if (e.key === "Enter" || e.key === " ") {
        dom.EventHelper.stop(e, true);
        this.showPicker();
      }
    }));
    return slot;
  }
  /**
   * Shows the repo picker dropdown anchored to the trigger element.
   */
  showPicker() {
    if (!this._triggerElement || this.actionWidgetService.isVisible) {
      return;
    }
    const items = this._buildItems();
    const showFilter = items.filter((i) => i.kind === ActionListItemKind.Action).length > FILTER_THRESHOLD;
    const triggerElement = this._triggerElement;
    const delegate = {
      onSelect: (item) => {
        this.actionWidgetService.hide();
        if (item.id === "browse") {
          this._browseForRepo();
        } else {
          this._selectRepo(item);
        }
      },
      onHide: () => {
        triggerElement.focus();
      }
    };
    this.actionWidgetService.show(
      "repoPicker",
      false,
      items,
      delegate,
      this._triggerElement,
      void 0,
      [],
      {
        getAriaLabel: (item) => item.label ?? "",
        getWidgetAriaLabel: () => localize("repoPicker.ariaLabel", "Repository Picker")
      },
      showFilter ? { showFilter: true, filterPlaceholder: localize("repoPicker.filter", "Filter repositories...") } : void 0
    );
  }
  /**
   * Programmatically set the selected repository.
   */
  setSelectedRepo(repoPath) {
    this._selectRepo({ id: repoPath, name: repoPath });
  }
  /**
   * Clears the selected repository.
   */
  clearSelection() {
    this._selectedRepo = void 0;
    this._updateTriggerLabel();
  }
  _selectRepo(item) {
    this._selectedRepo = item;
    this._addToRecentlyPicked(item);
    this.storageService.store(STORAGE_KEY_LAST_REPO, JSON.stringify(item), StorageScope.PROFILE, StorageTarget.MACHINE);
    this._updateTriggerLabel();
    this._onDidSelectRepo.fire(item.id);
  }
  async _browseForRepo() {
    try {
      const result = await this.commandService.executeCommand(OPEN_REPO_COMMAND);
      if (result) {
        this._selectRepo({ id: result, name: result });
      }
    } catch {
    }
  }
  _addToRecentlyPicked(item) {
    this._recentlyPickedRepos = [
      { id: item.id, name: item.name },
      ...this._recentlyPickedRepos.filter((r) => r.id !== item.id)
    ].slice(0, MAX_RECENT_REPOS);
    this.storageService.store(STORAGE_KEY_RECENT_REPOS, JSON.stringify(this._recentlyPickedRepos), StorageScope.PROFILE, StorageTarget.MACHINE);
  }
  _buildItems() {
    const seenIds = /* @__PURE__ */ new Set();
    const items = [];
    if (this._selectedRepo) {
      seenIds.add(this._selectedRepo.id);
      items.push({
        kind: ActionListItemKind.Action,
        label: this._selectedRepo.name,
        group: { title: "", icon: Codicon.repo },
        item: this._selectedRepo
      });
    }
    const dedupedRepos = this._recentlyPickedRepos.filter((r) => !seenIds.has(r.id));
    dedupedRepos.sort((a, b) => a.name.localeCompare(b.name));
    for (const repo of dedupedRepos) {
      seenIds.add(repo.id);
      items.push({
        kind: ActionListItemKind.Action,
        label: repo.name,
        group: { title: "", icon: Codicon.repo },
        item: repo,
        onRemove: () => this._removeRepo(repo.id)
      });
    }
    if (items.length > 0) {
      items.push({ kind: ActionListItemKind.Separator, label: "" });
    }
    items.push({
      kind: ActionListItemKind.Action,
      label: localize("browseRepo", "Browse..."),
      group: { title: "", icon: Codicon.search },
      item: { id: "browse", name: localize("browseRepo", "Browse...") }
    });
    return items;
  }
  _removeRepo(repoId) {
    this._recentlyPickedRepos = this._recentlyPickedRepos.filter((r) => r.id !== repoId);
    this.storageService.store(STORAGE_KEY_RECENT_REPOS, JSON.stringify(this._recentlyPickedRepos), StorageScope.PROFILE, StorageTarget.MACHINE);
    this.actionWidgetService.hide();
    this.showPicker();
  }
  _updateTriggerLabel() {
    if (!this._triggerElement) {
      return;
    }
    dom.clearNode(this._triggerElement);
    const label = this._selectedRepo?.name ?? localize("pickRepo", "Pick Repository");
    dom.append(this._triggerElement, renderIcon(Codicon.repo));
    const labelSpan = dom.append(this._triggerElement, dom.$("span.sessions-chat-dropdown-label"));
    labelSpan.textContent = label;
    dom.append(this._triggerElement, renderIcon(Codicon.chevronDown));
    this._triggerElement.ariaLabel = localize("repoPicker.triggerAriaLabel", "Pick Repository, {0}", label);
  }
};
RepoPicker = __decorateClass([
  __decorateParam(0, IActionWidgetService),
  __decorateParam(1, IStorageService),
  __decorateParam(2, ICommandService)
], RepoPicker);
export {
  RepoPicker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3Nlc3Npb25zL2NvbnRyaWIvY2hhdC9icm93c2VyL3JlcG9QaWNrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFjdGlvbldpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25XaWRnZXQuanMnO1xuaW1wb3J0IHsgQWN0aW9uTGlzdEl0ZW1LaW5kLCBJQWN0aW9uTGlzdERlbGVnYXRlLCBJQWN0aW9uTGlzdEl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25MaXN0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyByZW5kZXJJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2ljb25MYWJlbC9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5cbmNvbnN0IE9QRU5fUkVQT19DT01NQU5EID0gJ2dpdGh1Yi5jb3BpbG90LmNoYXQuY2xvdWRTZXNzaW9ucy5vcGVuUmVwb3NpdG9yeSc7XG5jb25zdCBTVE9SQUdFX0tFWV9MQVNUX1JFUE8gPSAnYWdlbnRTZXNzaW9ucy5sYXN0UGlja2VkUmVwbyc7XG5jb25zdCBTVE9SQUdFX0tFWV9SRUNFTlRfUkVQT1MgPSAnYWdlbnRTZXNzaW9ucy5yZWNlbnRseVBpY2tlZFJlcG9zJztcbmNvbnN0IE1BWF9SRUNFTlRfUkVQT1MgPSAxMDtcbmNvbnN0IEZJTFRFUl9USFJFU0hPTEQgPSAxMDtcblxuaW50ZXJmYWNlIElSZXBvSXRlbSB7XG5cdHJlYWRvbmx5IGlkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcbn1cblxuLyoqXG4gKiBBIHNlbGYtY29udGFpbmVkIHdpZGdldCBmb3Igc2VsZWN0aW5nIHRoZSByZXBvc2l0b3J5IGluIGNsb3VkIHNlc3Npb25zLlxuICogVXNlcyB0aGUgYGdpdGh1Yi5jb3BpbG90LmNoYXQuY2xvdWRTZXNzaW9ucy5vcGVuUmVwb3NpdG9yeWAgY29tbWFuZCBmb3JcbiAqIGJyb3dzaW5nIHJlcG9zaXRvcmllcy4gTWFuYWdlcyByZWNlbnRseSB1c2VkIHJlcG9zIGluIHN0b3JhZ2UuXG4gKiBCZWhhdmVzIGxpa2UgRm9sZGVyUGlja2VyOiB0cmlnZ2VyIGJ1dHRvbiB3aXRoIGRyb3Bkb3duLCBzdG9yYWdlIHBlcnNpc3RlbmNlLFxuICogcmVjZW50bHkgdXNlZCBsaXN0IHdpdGggcmVtb3ZlIGJ1dHRvbnMuXG4gKi9cbmV4cG9ydCBjbGFzcyBSZXBvUGlja2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRTZWxlY3RSZXBvID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRTZWxlY3RSZXBvOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25EaWRTZWxlY3RSZXBvLmV2ZW50O1xuXG5cdHByaXZhdGUgX3RyaWdnZXJFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVyRGlzcG9zYWJsZXMgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXG5cdHByaXZhdGUgX3NlbGVjdGVkUmVwbzogSVJlcG9JdGVtIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9yZWNlbnRseVBpY2tlZFJlcG9zOiBJUmVwb0l0ZW1bXSA9IFtdO1xuXG5cdGdldCBzZWxlY3RlZFJlcG8oKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VsZWN0ZWRSZXBvPy5pZDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWN0aW9uV2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjdGlvbldpZGdldFNlcnZpY2U6IElBY3Rpb25XaWRnZXRTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Ly8gUmVzdG9yZSBsYXN0IHBpY2tlZCByZXBvXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGxhc3QgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChTVE9SQUdFX0tFWV9MQVNUX1JFUE8sIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRcdGlmIChsYXN0KSB7XG5cdFx0XHRcdHRoaXMuX3NlbGVjdGVkUmVwbyA9IEpTT04ucGFyc2UobGFzdCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG5cblx0XHQvLyBSZXN0b3JlIHJlY2VudGx5IHBpY2tlZCByZXBvc1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBzdG9yZWQgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldChTVE9SQUdFX0tFWV9SRUNFTlRfUkVQT1MsIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRcdGlmIChzdG9yZWQpIHtcblx0XHRcdFx0dGhpcy5fcmVjZW50bHlQaWNrZWRSZXBvcyA9IEpTT04ucGFyc2Uoc3RvcmVkKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZW5kZXJzIHRoZSByZXBvIHBpY2tlciB0cmlnZ2VyIGJ1dHRvbiBpbnRvIHRoZSBnaXZlbiBjb250YWluZXIuXG5cdCAqIFJldHVybnMgdGhlIGNvbnRhaW5lciBlbGVtZW50LlxuXHQgKi9cblx0cmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0dGhpcy5fcmVuZGVyRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGNvbnN0IHNsb3QgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5zZXNzaW9ucy1jaGF0LXBpY2tlci1zbG90JykpO1xuXHRcdHRoaXMuX3JlbmRlckRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHNsb3QucmVtb3ZlKCkgfSk7XG5cblx0XHRjb25zdCB0cmlnZ2VyID0gZG9tLmFwcGVuZChzbG90LCBkb20uJCgnYS5hY3Rpb24tbGFiZWwnKSk7XG5cdFx0dHJpZ2dlci50YWJJbmRleCA9IDA7XG5cdFx0dHJpZ2dlci5yb2xlID0gJ2J1dHRvbic7XG5cdFx0dGhpcy5fdHJpZ2dlckVsZW1lbnQgPSB0cmlnZ2VyO1xuXG5cdFx0dGhpcy5fdXBkYXRlVHJpZ2dlckxhYmVsKCk7XG5cblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0cmlnZ2VyLCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHR0aGlzLnNob3dQaWNrZXIoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZW5kZXJEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0cmlnZ2VyLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0aWYgKGUua2V5ID09PSAnRW50ZXInIHx8IGUua2V5ID09PSAnICcpIHtcblx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdHRoaXMuc2hvd1BpY2tlcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHJldHVybiBzbG90O1xuXHR9XG5cblx0LyoqXG5cdCAqIFNob3dzIHRoZSByZXBvIHBpY2tlciBkcm9wZG93biBhbmNob3JlZCB0byB0aGUgdHJpZ2dlciBlbGVtZW50LlxuXHQgKi9cblx0c2hvd1BpY2tlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX3RyaWdnZXJFbGVtZW50IHx8IHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5pc1Zpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpdGVtcyA9IHRoaXMuX2J1aWxkSXRlbXMoKTtcblx0XHRjb25zdCBzaG93RmlsdGVyID0gaXRlbXMuZmlsdGVyKGkgPT4gaS5raW5kID09PSBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uKS5sZW5ndGggPiBGSUxURVJfVEhSRVNIT0xEO1xuXG5cdFx0Y29uc3QgdHJpZ2dlckVsZW1lbnQgPSB0aGlzLl90cmlnZ2VyRWxlbWVudDtcblx0XHRjb25zdCBkZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxJUmVwb0l0ZW0+ID0ge1xuXHRcdFx0b25TZWxlY3Q6IChpdGVtKSA9PiB7XG5cdFx0XHRcdHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5oaWRlKCk7XG5cdFx0XHRcdGlmIChpdGVtLmlkID09PSAnYnJvd3NlJykge1xuXHRcdFx0XHRcdHRoaXMuX2Jyb3dzZUZvclJlcG8oKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLl9zZWxlY3RSZXBvKGl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0b25IaWRlOiAoKSA9PiB7IHRyaWdnZXJFbGVtZW50LmZvY3VzKCk7IH0sXG5cdFx0fTtcblxuXHRcdHRoaXMuYWN0aW9uV2lkZ2V0U2VydmljZS5zaG93PElSZXBvSXRlbT4oXG5cdFx0XHQncmVwb1BpY2tlcicsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGl0ZW1zLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHR0aGlzLl90cmlnZ2VyRWxlbWVudCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFtdLFxuXHRcdFx0e1xuXHRcdFx0XHRnZXRBcmlhTGFiZWw6IChpdGVtKSA9PiBpdGVtLmxhYmVsID8/ICcnLFxuXHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWw6ICgpID0+IGxvY2FsaXplKCdyZXBvUGlja2VyLmFyaWFMYWJlbCcsIFwiUmVwb3NpdG9yeSBQaWNrZXJcIiksXG5cdFx0XHR9LFxuXHRcdFx0c2hvd0ZpbHRlciA/IHsgc2hvd0ZpbHRlcjogdHJ1ZSwgZmlsdGVyUGxhY2Vob2xkZXI6IGxvY2FsaXplKCdyZXBvUGlja2VyLmZpbHRlcicsIFwiRmlsdGVyIHJlcG9zaXRvcmllcy4uLlwiKSB9IDogdW5kZWZpbmVkLFxuXHRcdCk7XG5cdH1cblxuXHQvKipcblx0ICogUHJvZ3JhbW1hdGljYWxseSBzZXQgdGhlIHNlbGVjdGVkIHJlcG9zaXRvcnkuXG5cdCAqL1xuXHRzZXRTZWxlY3RlZFJlcG8ocmVwb1BhdGg6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdFJlcG8oeyBpZDogcmVwb1BhdGgsIG5hbWU6IHJlcG9QYXRoIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIENsZWFycyB0aGUgc2VsZWN0ZWQgcmVwb3NpdG9yeS5cblx0ICovXG5cdGNsZWFyU2VsZWN0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdGVkUmVwbyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl91cGRhdGVUcmlnZ2VyTGFiZWwoKTtcblx0fVxuXG5cdHByaXZhdGUgX3NlbGVjdFJlcG8oaXRlbTogSVJlcG9JdGVtKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VsZWN0ZWRSZXBvID0gaXRlbTtcblx0XHR0aGlzLl9hZGRUb1JlY2VudGx5UGlja2VkKGl0ZW0pO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU1RPUkFHRV9LRVlfTEFTVF9SRVBPLCBKU09OLnN0cmluZ2lmeShpdGVtKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0dGhpcy5fdXBkYXRlVHJpZ2dlckxhYmVsKCk7XG5cdFx0dGhpcy5fb25EaWRTZWxlY3RSZXBvLmZpcmUoaXRlbS5pZCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9icm93c2VGb3JSZXBvKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoT1BFTl9SRVBPX0NPTU1BTkQpO1xuXHRcdFx0aWYgKHJlc3VsdCkge1xuXHRcdFx0XHR0aGlzLl9zZWxlY3RSZXBvKHsgaWQ6IHJlc3VsdCwgbmFtZTogcmVzdWx0IH0pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gY29tbWFuZCB3YXMgY2FuY2VsbGVkIG9yIGZhaWxlZCBcdTIwMTQgbm90aGluZyB0byBkb1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FkZFRvUmVjZW50bHlQaWNrZWQoaXRlbTogSVJlcG9JdGVtKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVjZW50bHlQaWNrZWRSZXBvcyA9IFtcblx0XHRcdHsgaWQ6IGl0ZW0uaWQsIG5hbWU6IGl0ZW0ubmFtZSB9LFxuXHRcdFx0Li4udGhpcy5fcmVjZW50bHlQaWNrZWRSZXBvcy5maWx0ZXIociA9PiByLmlkICE9PSBpdGVtLmlkKSxcblx0XHRdLnNsaWNlKDAsIE1BWF9SRUNFTlRfUkVQT1MpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU1RPUkFHRV9LRVlfUkVDRU5UX1JFUE9TLCBKU09OLnN0cmluZ2lmeSh0aGlzLl9yZWNlbnRseVBpY2tlZFJlcG9zKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdH1cblxuXHRwcml2YXRlIF9idWlsZEl0ZW1zKCk6IElBY3Rpb25MaXN0SXRlbTxJUmVwb0l0ZW0+W10ge1xuXHRcdGNvbnN0IHNlZW5JZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRjb25zdCBpdGVtczogSUFjdGlvbkxpc3RJdGVtPElSZXBvSXRlbT5bXSA9IFtdO1xuXG5cdFx0Ly8gQ3VycmVudGx5IHNlbGVjdGVkIChzaG93biBmaXJzdCwgY2hlY2tlZClcblx0XHRpZiAodGhpcy5fc2VsZWN0ZWRSZXBvKSB7XG5cdFx0XHRzZWVuSWRzLmFkZCh0aGlzLl9zZWxlY3RlZFJlcG8uaWQpO1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdGxhYmVsOiB0aGlzLl9zZWxlY3RlZFJlcG8ubmFtZSxcblx0XHRcdFx0Z3JvdXA6IHsgdGl0bGU6ICcnLCBpY29uOiBDb2RpY29uLnJlcG8gfSxcblx0XHRcdFx0aXRlbTogdGhpcy5fc2VsZWN0ZWRSZXBvLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVjZW50bHkgcGlja2VkIHJlcG9zIChzb3J0ZWQgYnkgbmFtZSlcblx0XHRjb25zdCBkZWR1cGVkUmVwb3MgPSB0aGlzLl9yZWNlbnRseVBpY2tlZFJlcG9zLmZpbHRlcihyID0+ICFzZWVuSWRzLmhhcyhyLmlkKSk7XG5cdFx0ZGVkdXBlZFJlcG9zLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpO1xuXHRcdGZvciAoY29uc3QgcmVwbyBvZiBkZWR1cGVkUmVwb3MpIHtcblx0XHRcdHNlZW5JZHMuYWRkKHJlcG8uaWQpO1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdGxhYmVsOiByZXBvLm5hbWUsXG5cdFx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogQ29kaWNvbi5yZXBvIH0sXG5cdFx0XHRcdGl0ZW06IHJlcG8sXG5cdFx0XHRcdG9uUmVtb3ZlOiAoKSA9PiB0aGlzLl9yZW1vdmVSZXBvKHJlcG8uaWQpLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Ly8gU2VwYXJhdG9yICsgQnJvd3NlLi4uXG5cdFx0aWYgKGl0ZW1zLmxlbmd0aCA+IDApIHtcblx0XHRcdGl0ZW1zLnB1c2goeyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yLCBsYWJlbDogJycgfSk7XG5cdFx0fVxuXHRcdGl0ZW1zLnB1c2goe1xuXHRcdFx0a2luZDogQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbixcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnYnJvd3NlUmVwbycsIFwiQnJvd3NlLi4uXCIpLFxuXHRcdFx0Z3JvdXA6IHsgdGl0bGU6ICcnLCBpY29uOiBDb2RpY29uLnNlYXJjaCB9LFxuXHRcdFx0aXRlbTogeyBpZDogJ2Jyb3dzZScsIG5hbWU6IGxvY2FsaXplKCdicm93c2VSZXBvJywgXCJCcm93c2UuLi5cIikgfSxcblx0XHR9KTtcblxuXHRcdHJldHVybiBpdGVtcztcblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZVJlcG8ocmVwb0lkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9yZWNlbnRseVBpY2tlZFJlcG9zID0gdGhpcy5fcmVjZW50bHlQaWNrZWRSZXBvcy5maWx0ZXIociA9PiByLmlkICE9PSByZXBvSWQpO1xuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoU1RPUkFHRV9LRVlfUkVDRU5UX1JFUE9TLCBKU09OLnN0cmluZ2lmeSh0aGlzLl9yZWNlbnRseVBpY2tlZFJlcG9zKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cblx0XHQvLyBSZS1zaG93IHBpY2tlciB3aXRoIHVwZGF0ZWQgaXRlbXNcblx0XHR0aGlzLmFjdGlvbldpZGdldFNlcnZpY2UuaGlkZSgpO1xuXHRcdHRoaXMuc2hvd1BpY2tlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlVHJpZ2dlckxhYmVsKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fdHJpZ2dlckVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRkb20uY2xlYXJOb2RlKHRoaXMuX3RyaWdnZXJFbGVtZW50KTtcblx0XHRjb25zdCBsYWJlbCA9IHRoaXMuX3NlbGVjdGVkUmVwbz8ubmFtZSA/PyBsb2NhbGl6ZSgncGlja1JlcG8nLCBcIlBpY2sgUmVwb3NpdG9yeVwiKTtcblxuXHRcdGRvbS5hcHBlbmQodGhpcy5fdHJpZ2dlckVsZW1lbnQsIHJlbmRlckljb24oQ29kaWNvbi5yZXBvKSk7XG5cdFx0Y29uc3QgbGFiZWxTcGFuID0gZG9tLmFwcGVuZCh0aGlzLl90cmlnZ2VyRWxlbWVudCwgZG9tLiQoJ3NwYW4uc2Vzc2lvbnMtY2hhdC1kcm9wZG93bi1sYWJlbCcpKTtcblx0XHRsYWJlbFNwYW4udGV4dENvbnRlbnQgPSBsYWJlbDtcblx0XHRkb20uYXBwZW5kKHRoaXMuX3RyaWdnZXJFbGVtZW50LCByZW5kZXJJY29uKENvZGljb24uY2hldnJvbkRvd24pKTtcblxuXHRcdHRoaXMuX3RyaWdnZXJFbGVtZW50LmFyaWFMYWJlbCA9IGxvY2FsaXplKCdyZXBvUGlja2VyLnRyaWdnZXJBcmlhTGFiZWwnLCBcIlBpY2sgUmVwb3NpdG9yeSwgezB9XCIsIGxhYmVsKTtcblx0fVxuXG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFzQjtBQUMvQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMEJBQWdFO0FBQ3pFLFNBQVMsaUJBQWlCLGNBQWMscUJBQXFCO0FBQzdELFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsdUJBQXVCO0FBRWhDLE1BQU0sb0JBQW9CO0FBQzFCLE1BQU0sd0JBQXdCO0FBQzlCLE1BQU0sMkJBQTJCO0FBQ2pDLE1BQU0sbUJBQW1CO0FBQ3pCLE1BQU0sbUJBQW1CO0FBY2xCLElBQU0sYUFBTixjQUF5QixXQUFXO0FBQUEsRUFlMUMsWUFDd0MscUJBQ0wsZ0JBQ0EsZ0JBQ2pDO0FBQ0QsVUFBTTtBQUppQztBQUNMO0FBQ0E7QUFoQm5DLFNBQWlCLG1CQUFtQixLQUFLLFVBQVUsSUFBSSxRQUFnQixDQUFDO0FBQ3hFLFNBQVMsa0JBQWlDLEtBQUssaUJBQWlCO0FBR2hFLFNBQWlC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
