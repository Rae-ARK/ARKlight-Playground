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
import { promiseWithResolvers } from "../../../../base/common/async.js";
import { KeyMod, KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { localize, localize2 } from "../../../../nls.js";
import { Action2, IMenuService, MenuId, registerAction2, MenuRegistry, MenuItemAction } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IsSessionsWindowContext } from "../../../common/contextkeys.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
const builtInSource = localize("Built-In", "Built-In");
const category = localize2("Create", "Create");
registerAction2(class extends Action2 {
  constructor() {
    super({
      id: "welcome.showNewFileEntries",
      title: localize2("welcome.newFile", "New File..."),
      category,
      f1: true,
      precondition: IsSessionsWindowContext.negate(),
      keybinding: {
        primary: KeyMod.Alt + KeyMod.CtrlCmd + KeyMod.WinCtrl + KeyCode.KeyN,
        weight: KeybindingWeight.WorkbenchContrib
      },
      menu: {
        id: MenuId.MenubarFileMenu,
        group: "1_new",
        order: 2,
        when: IsSessionsWindowContext.negate()
      }
    });
  }
  async run(accessor) {
    return assertReturnsDefined(NewFileTemplatesManager.Instance).run();
  }
});
let NewFileTemplatesManager = class extends Disposable {
  constructor(quickInputService, contextKeyService, commandService, keybindingService, menuService) {
    super();
    this.quickInputService = quickInputService;
    this.contextKeyService = contextKeyService;
    this.commandService = commandService;
    this.keybindingService = keybindingService;
    NewFileTemplatesManager.Instance = this;
    this._register({ dispose() {
      if (NewFileTemplatesManager.Instance === this) {
        NewFileTemplatesManager.Instance = void 0;
      }
    } });
    this.menu = menuService.createMenu(MenuId.NewFile, contextKeyService);
  }
  allEntries() {
    const items = [];
    for (const [groupName, group] of this.menu.getActions({ renderShortTitle: true })) {
      for (const action of group) {
        if (action instanceof MenuItemAction) {
          items.push({ commandID: action.item.id, from: action.item.source?.title ?? builtInSource, title: action.label, group: groupName });
        }
      }
    }
    return items;
  }
  async run() {
    const entries = this.allEntries();
    if (entries.length === 0) {
      throw Error("Unexpected empty new items list");
    } else if (entries.length === 1) {
      this.commandService.executeCommand(entries[0].commandID);
      return true;
    } else {
      return this.selectNewEntry(entries);
    }
  }
  async selectNewEntry(entries) {
    const { promise: resultPromise, resolve: resolveResult } = promiseWithResolvers();
    const disposables = new DisposableStore();
    const qp = this.quickInputService.createQuickPick({ useSeparators: true });
    qp.title = localize("newFileTitle", "New File...");
    qp.placeholder = localize("newFilePlaceholder", "Select File Type or Enter File Name...");
    qp.sortByLabel = false;
    qp.matchOnDetail = true;
    qp.matchOnDescription = true;
    const sortCategories = (a, b) => {
      const categoryPriority = { "file": 1, "notebook": 2 };
      if (categoryPriority[a.group] && categoryPriority[b.group]) {
        if (categoryPriority[a.group] !== categoryPriority[b.group]) {
          return categoryPriority[b.group] - categoryPriority[a.group];
        }
      } else if (categoryPriority[a.group]) {
        return 1;
      } else if (categoryPriority[b.group]) {
        return -1;
      }
      if (a.from === builtInSource) {
        return 1;
      }
      if (b.from === builtInSource) {
        return -1;
      }
      return a.from.localeCompare(b.from);
    };
    const displayCategory = {
      "file": localize("file", "File"),
      "notebook": localize("notebook", "Notebook")
    };
    const refreshQp = (entries2) => {
      const items = [];
      let lastSeparator;
      entries2.sort((a, b) => -sortCategories(a, b)).forEach((entry) => {
        const command = entry.commandID;
        const keybinding = this.keybindingService.lookupKeybinding(command || "", this.contextKeyService);
        if (lastSeparator !== entry.group) {
          items.push({
            type: "separator",
            label: displayCategory[entry.group] ?? entry.group
          });
          lastSeparator = entry.group;
        }
        items.push({
          ...entry,
          label: entry.title,
          type: "item",
          keybinding,
          buttons: command ? [
            {
              iconClass: "codicon codicon-gear",
              tooltip: localize("change keybinding", "Configure Keybinding")
            }
          ] : [],
          detail: "",
          description: entry.from
        });
      });
      qp.items = items;
    };
    refreshQp(entries);
    disposables.add(this.menu.onDidChange(() => refreshQp(this.allEntries())));
    disposables.add(qp.onDidChangeValue((val) => {
      if (val === "") {
        refreshQp(entries);
        return;
      }
      const currentTextEntry = {
        commandID: "workbench.action.files.newFile",
        commandArgs: { languageId: void 0, viewType: void 0, fileName: val },
        title: localize("miNewFileWithName", "Create New File ({0})", val),
        group: "file",
        from: builtInSource
      };
      refreshQp([currentTextEntry, ...entries]);
    }));
    disposables.add(qp.onDidAccept(async (e) => {
      const selected = qp.selectedItems[0];
      resolveResult(!!selected);
      qp.hide();
      if (selected) {
        await this.commandService.executeCommand(selected.commandID, selected.commandArgs);
      }
    }));
    disposables.add(qp.onDidHide(() => {
      qp.dispose();
      disposables.dispose();
      resolveResult(false);
    }));
    disposables.add(qp.onDidTriggerItemButton((e) => {
      qp.hide();
      this.commandService.executeCommand("workbench.action.openGlobalKeybindings", e.item.commandID);
      resolveResult(false);
    }));
    qp.show();
    return resultPromise;
  }
};
NewFileTemplatesManager = __decorateClass([
  __decorateParam(0, IQuickInputService),
  __decorateParam(1, IContextKeyService),
  __decorateParam(2, ICommandService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IMenuService)
], NewFileTemplatesManager);
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NewFileTemplatesManager, LifecyclePhase.Restored);
MenuRegistry.appendMenuItem(MenuId.NewFile, {
  group: "file",
  command: {
    id: "workbench.action.files.newUntitledFile",
    title: localize("miNewFile2", "Text File")
  },
  order: 1
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3dlbGNvbWVWaWV3cy9jb21tb24vbmV3RmlsZS5jb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBwcm9taXNlV2l0aFJlc29sdmVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEtleU1vZCwgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhc3NlcnRSZXR1cm5zRGVmaW5lZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxvY2FsaXplZFN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElNZW51U2VydmljZSwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIsIElNZW51LCBNZW51UmVnaXN0cnksIE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJc1Nlc3Npb25zV2luZG93Q29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja0l0ZW0sIElRdWlja1BpY2tTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucywgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5jb25zdCBidWlsdEluU291cmNlID0gbG9jYWxpemUoJ0J1aWx0LUluJywgXCJCdWlsdC1JblwiKTtcbmNvbnN0IGNhdGVnb3J5OiBJTG9jYWxpemVkU3RyaW5nID0gbG9jYWxpemUyKCdDcmVhdGUnLCAnQ3JlYXRlJyk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ3dlbGNvbWUuc2hvd05ld0ZpbGVFbnRyaWVzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3dlbGNvbWUubmV3RmlsZScsICdOZXcgRmlsZS4uLicpLFxuXHRcdFx0Y2F0ZWdvcnksXG5cdFx0XHRmMTogdHJ1ZSxcblx0XHRcdHByZWNvbmRpdGlvbjogSXNTZXNzaW9uc1dpbmRvd0NvbnRleHQubmVnYXRlKCksXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHByaW1hcnk6IEtleU1vZC5BbHQgKyBLZXlNb2QuQ3RybENtZCArIEtleU1vZC5XaW5DdHJsICsgS2V5Q29kZS5LZXlOLFxuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTWVudWJhckZpbGVNZW51LFxuXHRcdFx0XHRncm91cDogJzFfbmV3Jyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdHdoZW46IElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0Lm5lZ2F0ZSgpXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gYXNzZXJ0UmV0dXJuc0RlZmluZWQoTmV3RmlsZVRlbXBsYXRlc01hbmFnZXIuSW5zdGFuY2UpLnJ1bigpO1xuXHR9XG59KTtcblxudHlwZSBOZXdGaWxlSXRlbSA9IHsgY29tbWFuZElEOiBzdHJpbmc7IHRpdGxlOiBzdHJpbmc7IGZyb206IHN0cmluZzsgZ3JvdXA6IHN0cmluZzsgY29tbWFuZEFyZ3M/OiB1bmtub3duIH07XG5jbGFzcyBOZXdGaWxlVGVtcGxhdGVzTWFuYWdlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRzdGF0aWMgSW5zdGFuY2U6IE5ld0ZpbGVUZW1wbGF0ZXNNYW5hZ2VyIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgbWVudTogSU1lbnU7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBtZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0TmV3RmlsZVRlbXBsYXRlc01hbmFnZXIuSW5zdGFuY2UgPSB0aGlzO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoeyBkaXNwb3NlKCkgeyBpZiAoTmV3RmlsZVRlbXBsYXRlc01hbmFnZXIuSW5zdGFuY2UgPT09IHRoaXMpIHsgTmV3RmlsZVRlbXBsYXRlc01hbmFnZXIuSW5zdGFuY2UgPSB1bmRlZmluZWQ7IH0gfSB9KTtcblxuXHRcdHRoaXMubWVudSA9IG1lbnVTZXJ2aWNlLmNyZWF0ZU1lbnUoTWVudUlkLk5ld0ZpbGUsIGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0fVxuXG5cdHByaXZhdGUgYWxsRW50cmllcygpOiBOZXdGaWxlSXRlbVtdIHtcblx0XHRjb25zdCBpdGVtczogTmV3RmlsZUl0ZW1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW2dyb3VwTmFtZSwgZ3JvdXBdIG9mIHRoaXMubWVudS5nZXRBY3Rpb25zKHsgcmVuZGVyU2hvcnRUaXRsZTogdHJ1ZSB9KSkge1xuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgZ3JvdXApIHtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0aXRlbXMucHVzaCh7IGNvbW1hbmRJRDogYWN0aW9uLml0ZW0uaWQsIGZyb206IGFjdGlvbi5pdGVtLnNvdXJjZT8udGl0bGUgPz8gYnVpbHRJblNvdXJjZSwgdGl0bGU6IGFjdGlvbi5sYWJlbCwgZ3JvdXA6IGdyb3VwTmFtZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gaXRlbXM7XG5cdH1cblxuXHRhc3luYyBydW4oKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgZW50cmllcyA9IHRoaXMuYWxsRW50cmllcygpO1xuXHRcdGlmIChlbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgRXJyb3IoJ1VuZXhwZWN0ZWQgZW1wdHkgbmV3IGl0ZW1zIGxpc3QnKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAoZW50cmllcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoZW50cmllc1swXS5jb21tYW5kSUQpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VsZWN0TmV3RW50cnkoZW50cmllcyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZWxlY3ROZXdFbnRyeShlbnRyaWVzOiBOZXdGaWxlSXRlbVtdKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3QgeyBwcm9taXNlOiByZXN1bHRQcm9taXNlLCByZXNvbHZlOiByZXNvbHZlUmVzdWx0IH0gPSBwcm9taXNlV2l0aFJlc29sdmVyczxib29sZWFuPigpO1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcXAgPSB0aGlzLnF1aWNrSW5wdXRTZXJ2aWNlLmNyZWF0ZVF1aWNrUGljayh7IHVzZVNlcGFyYXRvcnM6IHRydWUgfSk7XG5cdFx0cXAudGl0bGUgPSBsb2NhbGl6ZSgnbmV3RmlsZVRpdGxlJywgXCJOZXcgRmlsZS4uLlwiKTtcblx0XHRxcC5wbGFjZWhvbGRlciA9IGxvY2FsaXplKCduZXdGaWxlUGxhY2Vob2xkZXInLCBcIlNlbGVjdCBGaWxlIFR5cGUgb3IgRW50ZXIgRmlsZSBOYW1lLi4uXCIpO1xuXHRcdHFwLnNvcnRCeUxhYmVsID0gZmFsc2U7XG5cdFx0cXAubWF0Y2hPbkRldGFpbCA9IHRydWU7XG5cdFx0cXAubWF0Y2hPbkRlc2NyaXB0aW9uID0gdHJ1ZTtcblxuXHRcdGNvbnN0IHNvcnRDYXRlZ29yaWVzID0gKGE6IE5ld0ZpbGVJdGVtLCBiOiBOZXdGaWxlSXRlbSk6IG51bWJlciA9PiB7XG5cdFx0XHRjb25zdCBjYXRlZ29yeVByaW9yaXR5OiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0geyAnZmlsZSc6IDEsICdub3RlYm9vayc6IDIgfTtcblx0XHRcdGlmIChjYXRlZ29yeVByaW9yaXR5W2EuZ3JvdXBdICYmIGNhdGVnb3J5UHJpb3JpdHlbYi5ncm91cF0pIHtcblx0XHRcdFx0aWYgKGNhdGVnb3J5UHJpb3JpdHlbYS5ncm91cF0gIT09IGNhdGVnb3J5UHJpb3JpdHlbYi5ncm91cF0pIHtcblx0XHRcdFx0XHRyZXR1cm4gY2F0ZWdvcnlQcmlvcml0eVtiLmdyb3VwXSAtIGNhdGVnb3J5UHJpb3JpdHlbYS5ncm91cF07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGVsc2UgaWYgKGNhdGVnb3J5UHJpb3JpdHlbYS5ncm91cF0pIHsgcmV0dXJuIDE7IH1cblx0XHRcdGVsc2UgaWYgKGNhdGVnb3J5UHJpb3JpdHlbYi5ncm91cF0pIHsgcmV0dXJuIC0xOyB9XG5cblx0XHRcdGlmIChhLmZyb20gPT09IGJ1aWx0SW5Tb3VyY2UpIHsgcmV0dXJuIDE7IH1cblx0XHRcdGlmIChiLmZyb20gPT09IGJ1aWx0SW5Tb3VyY2UpIHsgcmV0dXJuIC0xOyB9XG5cblx0XHRcdHJldHVybiBhLmZyb20ubG9jYWxlQ29tcGFyZShiLmZyb20pO1xuXHRcdH07XG5cblx0XHRjb25zdCBkaXNwbGF5Q2F0ZWdvcnk6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG5cdFx0XHQnZmlsZSc6IGxvY2FsaXplKCdmaWxlJywgXCJGaWxlXCIpLFxuXHRcdFx0J25vdGVib29rJzogbG9jYWxpemUoJ25vdGVib29rJywgXCJOb3RlYm9va1wiKSxcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVmcmVzaFFwID0gKGVudHJpZXM6IE5ld0ZpbGVJdGVtW10pID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zOiAoKChJUXVpY2tQaWNrSXRlbSAmIE5ld0ZpbGVJdGVtKSB8IElRdWlja1BpY2tTZXBhcmF0b3IpKVtdID0gW107XG5cdFx0XHRsZXQgbGFzdFNlcGFyYXRvcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0ZW50cmllc1xuXHRcdFx0XHQuc29ydCgoYSwgYikgPT4gLXNvcnRDYXRlZ29yaWVzKGEsIGIpKVxuXHRcdFx0XHQuZm9yRWFjaCgoZW50cnkpID0+IHtcblx0XHRcdFx0XHRjb25zdCBjb21tYW5kID0gZW50cnkuY29tbWFuZElEO1xuXHRcdFx0XHRcdGNvbnN0IGtleWJpbmRpbmcgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmxvb2t1cEtleWJpbmRpbmcoY29tbWFuZCB8fCAnJywgdGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0XHRcdFx0aWYgKGxhc3RTZXBhcmF0b3IgIT09IGVudHJ5Lmdyb3VwKSB7XG5cdFx0XHRcdFx0XHRpdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3NlcGFyYXRvcicsXG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBkaXNwbGF5Q2F0ZWdvcnlbZW50cnkuZ3JvdXBdID8/IGVudHJ5Lmdyb3VwXG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHRcdGxhc3RTZXBhcmF0b3IgPSBlbnRyeS5ncm91cDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHQuLi5lbnRyeSxcblx0XHRcdFx0XHRcdGxhYmVsOiBlbnRyeS50aXRsZSxcblx0XHRcdFx0XHRcdHR5cGU6ICdpdGVtJyxcblx0XHRcdFx0XHRcdGtleWJpbmRpbmcsXG5cdFx0XHRcdFx0XHRidXR0b25zOiBjb21tYW5kID8gW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0aWNvbkNsYXNzOiAnY29kaWNvbiBjb2RpY29uLWdlYXInLFxuXHRcdFx0XHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdjaGFuZ2Uga2V5YmluZGluZycsIFwiQ29uZmlndXJlIEtleWJpbmRpbmdcIilcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XSA6IFtdLFxuXHRcdFx0XHRcdFx0ZGV0YWlsOiAnJyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBlbnRyeS5mcm9tLFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdHFwLml0ZW1zID0gaXRlbXM7XG5cdFx0fTtcblx0XHRyZWZyZXNoUXAoZW50cmllcyk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodGhpcy5tZW51Lm9uRGlkQ2hhbmdlKCgpID0+IHJlZnJlc2hRcCh0aGlzLmFsbEVudHJpZXMoKSkpKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxcC5vbkRpZENoYW5nZVZhbHVlKCh2YWw6IHN0cmluZykgPT4ge1xuXHRcdFx0aWYgKHZhbCA9PT0gJycpIHtcblx0XHRcdFx0cmVmcmVzaFFwKGVudHJpZXMpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjdXJyZW50VGV4dEVudHJ5OiBOZXdGaWxlSXRlbSA9IHtcblx0XHRcdFx0Y29tbWFuZElEOiAnd29ya2JlbmNoLmFjdGlvbi5maWxlcy5uZXdGaWxlJyxcblx0XHRcdFx0Y29tbWFuZEFyZ3M6IHsgbGFuZ3VhZ2VJZDogdW5kZWZpbmVkLCB2aWV3VHlwZTogdW5kZWZpbmVkLCBmaWxlTmFtZTogdmFsIH0sXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWlOZXdGaWxlV2l0aE5hbWUnLCBcIkNyZWF0ZSBOZXcgRmlsZSAoezB9KVwiLCB2YWwpLFxuXHRcdFx0XHRncm91cDogJ2ZpbGUnLFxuXHRcdFx0XHRmcm9tOiBidWlsdEluU291cmNlLFxuXHRcdFx0fTtcblx0XHRcdHJlZnJlc2hRcChbY3VycmVudFRleHRFbnRyeSwgLi4uZW50cmllc10pO1xuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxcC5vbkRpZEFjY2VwdChhc3luYyBlID0+IHtcblx0XHRcdGNvbnN0IHNlbGVjdGVkID0gcXAuc2VsZWN0ZWRJdGVtc1swXSBhcyAoSVF1aWNrUGlja0l0ZW0gJiBOZXdGaWxlSXRlbSk7XG5cdFx0XHRyZXNvbHZlUmVzdWx0KCEhc2VsZWN0ZWQpO1xuXG5cdFx0XHRxcC5oaWRlKCk7XG5cdFx0XHRpZiAoc2VsZWN0ZWQpIHsgYXdhaXQgdGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChzZWxlY3RlZC5jb21tYW5kSUQsIHNlbGVjdGVkLmNvbW1hbmRBcmdzKTsgfVxuXHRcdH0pKTtcblxuXHRcdGRpc3Bvc2FibGVzLmFkZChxcC5vbkRpZEhpZGUoKCkgPT4ge1xuXHRcdFx0cXAuZGlzcG9zZSgpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0cmVzb2x2ZVJlc3VsdChmYWxzZSk7XG5cdFx0fSkpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHFwLm9uRGlkVHJpZ2dlckl0ZW1CdXR0b24oZSA9PiB7XG5cdFx0XHRxcC5oaWRlKCk7XG5cdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCd3b3JrYmVuY2guYWN0aW9uLm9wZW5HbG9iYWxLZXliaW5kaW5ncycsIChlLml0ZW0gYXMgKElRdWlja1BpY2tJdGVtICYgTmV3RmlsZUl0ZW0pKS5jb21tYW5kSUQpO1xuXHRcdFx0cmVzb2x2ZVJlc3VsdChmYWxzZSk7XG5cdFx0fSkpO1xuXG5cdFx0cXAuc2hvdygpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdFByb21pc2U7XG5cdH1cbn1cblxuUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpXG5cdC5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbihOZXdGaWxlVGVtcGxhdGVzTWFuYWdlciwgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLk5ld0ZpbGUsIHtcblx0Z3JvdXA6ICdmaWxlJyxcblx0Y29tbWFuZDoge1xuXHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5maWxlcy5uZXdVbnRpdGxlZEZpbGUnLFxuXHRcdHRpdGxlOiBsb2NhbGl6ZSgnbWlOZXdGaWxlMicsIFwiVGV4dCBGaWxlXCIpXG5c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
