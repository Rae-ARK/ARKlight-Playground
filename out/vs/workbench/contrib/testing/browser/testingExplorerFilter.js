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
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { BaseActionViewItem } from "../../../../base/browser/ui/actionbar/actionViewItems.js";
import { AnchorAlignment } from "../../../../base/browser/ui/contextview/contextview.js";
import { DropdownMenuActionViewItem } from "../../../../base/browser/ui/dropdown/dropdownActionViewItem.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { Delayer } from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { localize } from "../../../../nls.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { ContextScopedSuggestEnabledInputWithHistory } from "../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js";
import { testingFilterIcon } from "./icons.js";
import { StoredValue } from "../common/storedValue.js";
import { ITestExplorerFilterState, TestFilterTerm } from "../common/testExplorerFilterState.js";
import { ITestService } from "../common/testService.js";
import { denamespaceTestTag } from "../common/testTypes.js";
const testFilterDescriptions = {
  [TestFilterTerm.Failed]: localize("testing.filters.showOnlyFailed", "Show Only Failed Tests"),
  [TestFilterTerm.Executed]: localize("testing.filters.showOnlyExecuted", "Show Only Executed Tests"),
  [TestFilterTerm.CurrentDoc]: localize("testing.filters.currentFile", "Show in Active File Only"),
  [TestFilterTerm.OpenedFiles]: localize("testing.filters.openedFiles", "Show in Opened Files Only"),
  [TestFilterTerm.Hidden]: localize("testing.filters.showExcludedTests", "Show Hidden Tests")
};
let TestingExplorerFilter = class extends BaseActionViewItem {
  constructor(action, options, state, instantiationService, testService) {
    super(null, action, options);
    this.state = state;
    this.instantiationService = instantiationService;
    this.testService = testService;
    this.focusEmitter = this._register(new Emitter());
    this.onDidFocus = this.focusEmitter.event;
    this.filtersAction = new Action("markersFiltersAction", localize("testing.filters.menu", "More Filters..."), "testing-filter-button " + ThemeIcon.asClassName(testingFilterIcon));
    this.history = this._register(instantiationService.createInstance(StoredValue, {
      key: "testing.filterHistory2",
      scope: StorageScope.WORKSPACE,
      target: StorageTarget.MACHINE
    }));
    this.updateFilterActiveState();
    this._register(testService.excluded.onTestExclusionsChanged(this.updateFilterActiveState, this));
  }
  /**
   * @override
   */
  render(container) {
    container.classList.add("testing-filter-action-item");
    const updateDelayer = this._register(new Delayer(400));
    const wrapper = this.wrapper = dom.$(".testing-filter-wrapper");
    container.appendChild(wrapper);
    let history = this.history.get({ lastValue: "", values: [] });
    if (history instanceof Array) {
      history = { lastValue: "", values: history };
    }
    if (history.lastValue) {
      this.state.setText(history.lastValue);
    }
    const input = this.input = this._register(this.instantiationService.createInstance(ContextScopedSuggestEnabledInputWithHistory, {
      id: "testing.explorer.filter",
      ariaLabel: localize("testExplorerFilterLabel", "Filter text for tests in the explorer"),
      parent: wrapper,
      suggestionProvider: {
        triggerCharacters: ["@"],
        provideResults: () => [
          ...Object.entries(testFilterDescriptions).map(([label, detail]) => ({ label, detail })),
          ...Iterable.map(this.testService.collection.tags.values(), (tag) => {
            const { ctrlId, tagId } = denamespaceTestTag(tag.id);
            const insertText = `@${ctrlId}:${tagId}`;
            return {
              label: `@${ctrlId}:${tagId}`,
              detail: this.testService.collection.getNodeById(ctrlId)?.item.label,
              insertText: tagId.includes(" ") ? `@${ctrlId}:"${tagId.replace(/(["\\])/g, "\\$1")}"` : insertText
            };
          })
        ].filter((r) => !this.state.text.value.includes(r.label))
      },
      resourceHandle: "testing:filter",
      suggestOptions: {
        value: this.state.text.value,
        placeholderText: localize("testExplorerFilter", "Filter (e.g. text, !exclude, @tag)")
      },
      history: history.values
    }));
    this._register(this.state.text.onDidChange((newValue) => {
      if (input.getValue() !== newValue) {
        input.setValue(newValue);
      }
    }));
    this._register(this.state.onDidRequestInputFocus(() => {
      input.focus();
    }));
    this._register(input.onDidFocus(() => {
      this.focusEmitter.fire();
    }));
    this._register(input.onInputDidChange(() => updateDelayer.trigger(() => {
      input.addToHistory();
      this.state.setText(input.getValue());
    })));
    const actionbar = this._register(new ActionBar(container, {
      actionViewItemProvider: (action, options) => {
        if (action.id === this.filtersAction.id) {
          return this.instantiationService.createInstance(FiltersDropdownMenuActionViewItem, action, options, this.state, this.actionRunner);
        }
        return void 0;
      }
    }));
    actionbar.push(this.filtersAction, { icon: true, label: false });
    this.layout(this.wrapper.clientWidth);
  }
  layout(width) {
    this.input.layout(new dom.Dimension(
      width - /* horizontal padding */
      24 - /* editor padding */
      8 - /* filter button padding */
      22,
      20
      // line height from suggestEnabledInput.ts
    ));
  }
  /**
   * Focuses the filter input.
   */
  focus() {
    this.input.focus();
  }
  /**
   * Persists changes to the input history.
   */
  saveState() {
    this.history.store({ lastValue: this.input.getValue(), values: this.input.getHistory() });
  }
  /**
   * @override
   */
  dispose() {
    this.saveState();
    super.dispose();
  }
  /**
   * Updates the 'checked' state of the filter submenu.
   */
  updateFilterActiveState() {
    this.filtersAction.checked = this.testService.excluded.hasAny;
  }
};
TestingExplorerFilter = __decorateClass([
  __decorateParam(2, ITestExplorerFilterState),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ITestService)
], TestingExplorerFilter);
let FiltersDropdownMenuActionViewItem = class extends DropdownMenuActionViewItem {
  constructor(action, options, filters, actionRunner, contextMenuService, testService) {
    super(
      action,
      { getActions: () => this.getActions() },
      contextMenuService,
      {
        actionRunner,
        classNames: action.class,
        anchorAlignmentProvider: () => AnchorAlignment.RIGHT,
        menuAsChild: true
      }
    );
    this.filters = filters;
    this.testService = testService;
  }
  render(container) {
    super.render(container);
    this.updateChecked();
  }
  getActions() {
    return [
      ...[TestFilterTerm.Failed, TestFilterTerm.Executed, TestFilterTerm.CurrentDoc, TestFilterTerm.OpenedFiles].map((term) => ({
        checked: this.filters.isFilteringFor(term),
        class: void 0,
        enabled: true,
        id: term,
        label: testFilterDescriptions[term],
        run: () => this.filters.toggleFilteringFor(term),
        tooltip: "",
        dispose: () => null
      })),
      new Separator(),
      {
        checked: this.filters.fuzzy.value,
        class: void 0,
        enabled: true,
        id: "fuzzy",
        label: localize("testing.filters.fuzzyMatch", "Fuzzy Match"),
        run: () => this.filters.fuzzy.value = !this.filters.fuzzy.value,
        tooltip: ""
      },
      new Separator(),
      {
        checked: this.filters.isFilteringFor(TestFilterTerm.Hidden),
        class: void 0,
        enabled: this.testService.excluded.hasAny,
        id: "showExcluded",
        label: localize("testing.filters.showExcludedTests", "Show Hidden Tests"),
        run: () => this.filters.toggleFilteringFor(TestFilterTerm.Hidden),
        tooltip: ""
      },
      {
        class: void 0,
        enabled: this.testService.excluded.hasAny,
        id: "removeExcluded",
        label: localize("testing.filters.removeTestExclusions", "Unhide All Tests"),
        run: async () => this.testService.excluded.clear(),
        tooltip: ""
      }
    ];
  }
  updateChecked() {
    this.element.classList.toggle("checked", this._action.checked);
  }
};
FiltersDropdownMenuActionViewItem = __decorateClass([
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, ITestService)
], FiltersDropdownMenuActionViewItem);
export {
  TestingExplorerFilter
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvYnJvd3Nlci90ZXN0aW5nRXhwbG9yZXJGaWx0ZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBCYXNlQWN0aW9uVmlld0l0ZW0sIElBY3Rpb25WaWV3SXRlbU9wdGlvbnMsIElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgQW5jaG9yQWxpZ25tZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IERyb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2Ryb3Bkb3duL2Ryb3Bkb3duQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgQWN0aW9uLCBJQWN0aW9uLCBJQWN0aW9uUnVubmVyLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IENvbnRleHRTY29wZWRTdWdnZXN0RW5hYmxlZElucHV0V2l0aEhpc3RvcnksIFN1Z2dlc3RFbmFibGVkSW5wdXRXaXRoSGlzdG9yeSwgU3VnZ2VzdFJlc3VsdHNQcm92aWRlciB9IGZyb20gJy4uLy4uL2NvZGVFZGl0b3IvYnJvd3Nlci9zdWdnZXN0RW5hYmxlZElucHV0L3N1Z2dlc3RFbmFibGVkSW5wdXQuanMnO1xuaW1wb3J0IHsgdGVzdGluZ0ZpbHRlckljb24gfSBmcm9tICcuL2ljb25zLmpzJztcbmltcG9ydCB7IFN0b3JlZFZhbHVlIH0gZnJvbSAnLi4vY29tbW9uL3N0b3JlZFZhbHVlLmpzJztcbmltcG9ydCB7IElUZXN0RXhwbG9yZXJGaWx0ZXJTdGF0ZSwgVGVzdEZpbHRlclRlcm0gfSBmcm9tICcuLi9jb21tb24vdGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUuanMnO1xuaW1wb3J0IHsgSVRlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRlbmFtZXNwYWNlVGVzdFRhZyB9IGZyb20gJy4uL2NvbW1vbi90ZXN0VHlwZXMuanMnO1xuXG5jb25zdCB0ZXN0RmlsdGVyRGVzY3JpcHRpb25zOiB7IFtLIGluIFRlc3RGaWx0ZXJUZXJtXTogc3RyaW5nIH0gPSB7XG5cdFtUZXN0RmlsdGVyVGVybS5GYWlsZWRdOiBsb2NhbGl6ZSgndGVzdGluZy5maWx0ZXJzLnNob3dPbmx5RmFpbGVkJywgXCJTaG93IE9ubHkgRmFpbGVkIFRlc3RzXCIpLFxuXHRbVGVzdEZpbHRlclRlcm0uRXhlY3V0ZWRdOiBsb2NhbGl6ZSgndGVzdGluZy5maWx0ZXJzLnNob3dPbmx5RXhlY3V0ZWQnLCBcIlNob3cgT25seSBFeGVjdXRlZCBUZXN0c1wiKSxcblx0W1Rlc3RGaWx0ZXJUZXJtLkN1cnJlbnREb2NdOiBsb2NhbGl6ZSgndGVzdGluZy5maWx0ZXJzLmN1cnJlbnRGaWxlJywgXCJTaG93IGluIEFjdGl2ZSBGaWxlIE9ubHlcIiksXG5cdFtUZXN0RmlsdGVyVGVybS5PcGVuZWRGaWxlc106IGxvY2FsaXplKCd0ZXN0aW5nLmZpbHRlcnMub3BlbmVkRmlsZXMnLCBcIlNob3cgaW4gT3BlbmVkIEZpbGVzIE9ubHlcIiksXG5cdFtUZXN0RmlsdGVyVGVybS5IaWRkZW5dOiBsb2NhbGl6ZSgndGVzdGluZy5maWx0ZXJzLnNob3dFeGNsdWRlZFRlc3RzJywgXCJTaG93IEhpZGRlbiBUZXN0c1wiKSxcbn07XG5cbmV4cG9ydCBjbGFzcyBUZXN0aW5nRXhwbG9yZXJGaWx0ZXIgZXh0ZW5kcyBCYXNlQWN0aW9uVmlld0l0ZW0ge1xuXHRwcml2YXRlIGlucHV0ITogU3VnZ2VzdEVuYWJsZWRJbnB1dFdpdGhIaXN0b3J5O1xuXHRwcml2YXRlIHdyYXBwZXIhOiBIVE1MRGl2RWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBmb2N1c0VtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHVibGljIHJlYWRvbmx5IG9uRGlkRm9jdXMgPSB0aGlzLmZvY3VzRW1pdHRlci5ldmVudDtcblx0cHJpdmF0ZSByZWFkb25seSBoaXN0b3J5OiBTdG9yZWRWYWx1ZTx7IHZhbHVlczogc3RyaW5nW107IGxhc3RWYWx1ZTogc3RyaW5nIH0gfCBzdHJpbmdbXT47XG5cblx0cHJpdmF0ZSByZWFkb25seSBmaWx0ZXJzQWN0aW9uID0gbmV3IEFjdGlvbignbWFya2Vyc0ZpbHRlcnNBY3Rpb24nLCBsb2NhbGl6ZSgndGVzdGluZy5maWx0ZXJzLm1lbnUnLCBcIk1vcmUgRmlsdGVycy4uLlwiKSwgJ3Rlc3RpbmctZmlsdGVyLWJ1dHRvbiAnICsgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKHRlc3RpbmdGaWx0ZXJJY29uKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YWN0aW9uOiBJQWN0aW9uLFxuXHRcdG9wdGlvbnM6IElCYXNlQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHRcdEBJVGVzdEV4cGxvcmVyRmlsdGVyU3RhdGUgcHJpdmF0ZSByZWFkb25seSBzdGF0ZTogSVRlc3RFeHBsb3JlckZpbHRlclN0YXRlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGVzdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZXN0U2VydmljZTogSVRlc3RTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihudWxsLCBhY3Rpb24sIG9wdGlvbnMpO1xuXHRcdHRoaXMuaGlzdG9yeSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN0b3JlZFZhbHVlLCB7XG5cdFx0XHRrZXk6ICd0ZXN0aW5nLmZpbHRlckhpc3RvcnkyJyxcblx0XHRcdHNjb3BlOiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFLFxuXHRcdFx0dGFyZ2V0OiBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkVcblx0XHR9KSk7XG5cdFx0dGhpcy51cGRhdGVGaWx0ZXJBY3RpdmVTdGF0ZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRlc3RTZXJ2aWNlLmV4Y2x1ZGVkLm9uVGVzdEV4Y2x1c2lvbnNDaGFuZ2VkKHRoaXMudXBkYXRlRmlsdGVyQWN0aXZlU3RhdGUsIHRoaXMpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBAb3ZlcnJpZGVcblx0ICovXG5cdHB1YmxpYyBvdmVycmlkZSByZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCkge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCd0ZXN0aW5nLWZpbHRlci1hY3Rpb24taXRlbScpO1xuXG5cdFx0Y29uc3QgdXBkYXRlRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KDQwMCkpO1xuXHRcdGNvbnN0IHdyYXBwZXIgPSB0aGlzLndyYXBwZXIgPSBkb20uJCgnLnRlc3RpbmctZmlsdGVyLXdyYXBwZXInKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQod3JhcHBlcik7XG5cblx0XHRsZXQgaGlzdG9yeSA9IHRoaXMuaGlzdG9yeS5nZXQoeyBsYXN0VmFsdWU6ICcnLCB2YWx1ZXM6IFtdIH0pO1xuXHRcdGlmIChoaXN0b3J5IGluc3RhbmNlb2YgQXJyYXkpIHtcblx0XHRcdGhpc3RvcnkgPSB7IGxhc3RWYWx1ZTogJycsIHZhbHVlczogaGlzdG9yeSB9O1xuXHRcdH1cblx0XHRpZiAoaGlzdG9yeS5sYXN0VmFsdWUpIHtcblx0XHRcdHRoaXMuc3RhdGUuc2V0VGV4dChoaXN0b3J5Lmxhc3RWYWx1ZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5wdXQgPSB0aGlzLmlucHV0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb250ZXh0U2NvcGVkU3VnZ2VzdEVuYWJsZWRJbnB1dFdpdGhIaXN0b3J5LCB7XG5cdFx0XHRpZDogJ3Rlc3RpbmcuZXhwbG9yZXIuZmlsdGVyJyxcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ3Rlc3RFeHBsb3JlckZpbHRlckxhYmVsJywgXCJGaWx0ZXIgdGV4dCBmb3IgdGVzdHMgaW4gdGhlIGV4cGxvcmVyXCIpLFxuXHRcdFx0cGFyZW50OiB3cmFwcGVyLFxuXHRcdFx0c3VnZ2VzdGlvblByb3ZpZGVyOiB7XG5cdFx0XHRcdHRyaWdnZXJDaGFyYWN0ZXJzOiBbJ0AnXSxcblx0XHRcdFx0cHJvdmlkZVJlc3VsdHM6ICgpID0+IFtcblx0XHRcdFx0XHQuLi5PYmplY3QuZW50cmllcyh0ZXN0RmlsdGVyRGVzY3JpcHRpb25zKS5tYXAoKFtsYWJlbCwgZGV0YWlsXSkgPT4gKHsgbGFiZWwsIGRldGFpbCB9KSksXG5cdFx0XHRcdFx0Li4uSXRlcmFibGUubWFwKHRoaXMudGVzdFNlcnZpY2UuY29sbGVjdGlvbi50YWdzLnZhbHVlcygpLCB0YWcgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgeyBjdHJsSWQsIHRhZ0lkIH0gPSBkZW5hbWVzcGFjZVRlc3RUYWcodGFnLmlkKTtcblx0XHRcdFx0XHRcdGNvbnN0IGluc2VydFRleHQgPSBgQCR7Y3RybElkfToke3RhZ0lkfWA7XG5cdFx0XHRcdFx0XHRyZXR1cm4gKHtcblx0XHRcdFx0XHRcdFx0bGFiZWw6IGBAJHtjdHJsSWR9OiR7dGFnSWR9YCxcblx0XHRcdFx0XHRcdFx0ZGV0YWlsOiB0aGlzLnRlc3RTZXJ2aWNlLmNvbGxlY3Rpb24uZ2V0Tm9kZUJ5SWQoY3RybElkKT8uaXRlbS5sYWJlbCxcblx0XHRcdFx0XHRcdFx0aW5zZXJ0VGV4dDogdGFnSWQuaW5jbHVkZXMoJyAnKSA/IGBAJHtjdHJsSWR9OlwiJHt0YWdJZC5yZXBsYWNlKC8oW1wiXFxcXF0pL2csICdcXFxcJDEnKX1cImAgOiBpbnNlcnRUZXh0LFxuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdF0uZmlsdGVyKHIgPT4gIXRoaXMuc3RhdGUudGV4dC52YWx1ZS5pbmNsdWRlcyhyLmxhYmVsKSksXG5cdFx0XHR9IHNhdGlzZmllcyBTdWdnZXN0UmVzdWx0c1Byb3ZpZGVyLFxuXHRcdFx0cmVzb3VyY2VIYW5kbGU6ICd0ZXN0aW5nOmZpbHRlcicsXG5cdFx0XHRzdWdnZXN0T3B0aW9uczoge1xuXHRcdFx0XHR2YWx1ZTogdGhpcy5zdGF0ZS50ZXh0LnZhbHVlLFxuXHRcdFx0XHRwbGFjZWhvbGRlclRleHQ6IGxvY2FsaXplKCd0ZXN0RXhwbG9yZXJGaWx0ZXInLCBcIkZpbHRlciAoZS5nLiB0ZXh0LCAhZXhjbHVkZSwgQHRhZylcIiksXG5cdFx0XHR9LFxuXHRcdFx0aGlzdG9yeTogaGlzdG9yeS52YWx1ZXNcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0YXRlLnRleHQub25EaWRDaGFuZ2UobmV3VmFsdWUgPT4ge1xuXHRcdFx0aWYgKGlucHV0LmdldFZhbHVlKCkgIT09IG5ld1ZhbHVlKSB7XG5cdFx0XHRcdGlucHV0LnNldFZhbHVlKG5ld1ZhbHVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnN0YXRlLm9uRGlkUmVxdWVzdElucHV0Rm9jdXMoKCkgPT4ge1xuXHRcdFx0aW5wdXQuZm9jdXMoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihpbnB1dC5vbkRpZEZvY3VzKCgpID0+IHtcblx0XHRcdHRoaXMuZm9jdXNFbWl0dGVyLmZpcmUoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihpbnB1dC5vbklucHV0RGlkQ2hhbmdlKCgpID0+IHVwZGF0ZURlbGF5ZXIudHJpZ2dlcigoKSA9PiB7XG5cdFx0XHRpbnB1dC5hZGRUb0hpc3RvcnkoKTtcblx0XHRcdHRoaXMuc3RhdGUuc2V0VGV4dChpbnB1dC5nZXRWYWx1ZSgpKTtcblx0XHR9KSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9uYmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcihjb250YWluZXIsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gdGhpcy5maWx0ZXJzQWN0aW9uLmlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsdGVyc0Ryb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIG9wdGlvbnMsIHRoaXMuc3RhdGUsIHRoaXMuYWN0aW9uUnVubmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9KSk7XG5cdFx0YWN0aW9uYmFyLnB1c2godGhpcy5maWx0ZXJzQWN0aW9uLCB7IGljb246IHRydWUsIGxhYmVsOiBmYWxzZSB9KTtcblxuXHRcdHRoaXMubGF5b3V0KHRoaXMud3JhcHBlci5jbGllbnRXaWR0aCk7XG5cdH1cblxuXHRwdWJsaWMgbGF5b3V0KHdpZHRoOiBudW1iZXIpIHtcblx0XHR0aGlzLmlucHV0LmxheW91dChuZXcgZG9tLkRpbWVuc2lvbihcblx0XHRcdHdpZHRoIC0gLyogaG9yaXpvbnRhbCBwYWRkaW5nICovIDI0IC0gLyogZWRpdG9yIHBhZGRpbmcgKi8gOCAtIC8qIGZpbHRlciBidXR0b24gcGFkZGluZyAqLyAyMixcblx0XHRcdDIwLCAvLyBsaW5lIGhlaWdodCBmcm9tIHN1Z2dlc3RFbmFibGVkSW5wdXQudHNcblx0XHQpKTtcblx0fVxuXG5cblx0LyoqXG5cdCAqIEZvY3VzZXMgdGhlIGZpbHRlciBpbnB1dC5cblx0ICovXG5cdHB1YmxpYyBvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLmlucHV0LmZvY3VzKCk7XG5cdH1cblxuXHQvKipcblx0ICogUGVyc2lzdHMgY2hhbmdlcyB0byB0aGUgaW5wdXQgaGlzdG9yeS5cblx0ICovXG5cdHB1YmxpYyBzYXZlU3RhdGUoKSB7XG5cdFx0dGhpcy5oaXN0b3J5LnN0b3JlKHsgbGFzdFZhbHVlOiB0aGlzLmlucHV0LmdldFZhbHVlKCksIHZhbHVlczogdGhpcy5pbnB1dC5nZXRIaXN0b3J5KCkgfSk7XG5cdH1cblxuXHQvKipcblx0ICogQG92ZXJyaWRlXG5cdCAqL1xuXHRwdWJsaWMgb3ZlcnJpZGUgZGlzcG9zZSgpIHtcblx0XHR0aGlzLnNhdmVTdGF0ZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBVcGRhdGVzIHRoZSAnY2hlY2tlZCcgc3RhdGUgb2YgdGhlIGZpbHRlciBzdWJtZW51LlxuXHQgKi9cblx0cHJpdmF0ZSB1cGRhdGVGaWx0ZXJBY3RpdmVTdGF0ZSgpIHtcblx0XHR0aGlzLmZpbHRlcnNBY3Rpb24uY2hlY2tlZCA9IHRoaXMudGVzdFNlcnZpY2UuZXhjbHVkZWQuaGFzQW55O1xuXHR9XG59XG5cblxuY2xhc3MgRmlsdGVyc0Ryb3Bkb3duTWVudUFjdGlvblZpZXdJdGVtIGV4dGVuZHMgRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGFjdGlvbjogSUFjdGlvbixcblx0XHRvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZmlsdGVyczogSVRlc3RFeHBsb3JlckZpbHRlclN0YXRlLFxuXHRcdGFjdGlvblJ1bm5lcjogSUFjdGlvblJ1bm5lcixcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElUZXN0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlc3RTZXJ2aWNlOiBJVGVzdFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKGFjdGlvbixcblx0XHRcdHsgZ2V0QWN0aW9uczogKCkgPT4gdGhpcy5nZXRBY3Rpb25zKCkgfSxcblx0XHRcdGNvbnRleHRNZW51U2VydmljZSxcblx0XHRcdHtcblx0XHRcdFx0YWN0aW9uUnVubmVyLFxuXHRcdFx0XHRjbGFzc05hbWVzOiBhY3Rpb24uY2xhc3MsXG5cdFx0XHRcdGFuY2hvckFsaWdubWVudFByb3ZpZGVyOiAoKSA9PiBBbmNob3JBbGlnbm1lbnQuUklHSFQsXG5cdFx0XHRcdG1lbnVBc0NoaWxkOiB0cnVlXG5cdFx0XHR9XG5cdFx0KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyKGNvbnRhaW5lcik7XG5cdFx0dGhpcy51cGRhdGVDaGVja2VkKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldEFjdGlvbnMoKTogSUFjdGlvbltdIHtcblx0XHRyZXR1cm4gW1xuXHRcdFx0Li4uW1Rlc3RGaWx0ZXJUZXJtLkZhaWxlZCwgVGVzdEZpbHRlclRlcm0uRXhlY3V0ZWQsIFRlc3RGaWx0ZXJUZXJtLkN1cnJlbnREb2MsIFRlc3RGaWx0ZXJUZXJtLk9wZW5lZEZpbGVzXS5tYXAodGVybSA9PiAoe1xuXHRcdFx0XHRjaGVja2VkOiB0aGlzLmZpbHRlcnMuaXNGaWx0ZXJpbmdGb3IodGVybSksXG5cdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGlkOiB0ZXJtLFxuXHRcdFx0XHRsYWJlbDogdGVzdEZpbHRlckRlc2NyaXB0aW9uc1t0ZXJtXSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmZpbHRlcnMudG9nZ2xlRmlsdGVyaW5nRm9yKHRlcm0pLFxuXHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0ZGlzcG9zZTogKCkgPT4gbnVsbFxuXHRcdFx0fSkpLFxuXHRcdFx0bmV3IFNlcGFyYXRvcigpLFxuXHRcdFx0e1xuXHRcdFx0XHRjaGVja2VkOiB0aGlzLmZpbHRlcnMuZnV6enkudmFsdWUsXG5cdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGlkOiAnZnV6enknLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Rlc3RpbmcuZmlsdGVycy5mdXp6eU1hdGNoJywgXCJGdXp6eSBNYXRjaFwiKSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmZpbHRlcnMuZnV6enkudmFsdWUgPSAhdGhpcy5maWx0ZXJzLmZ1enp5LnZhbHVlLFxuXHRcdFx0XHR0b29sdGlwOiAnJ1xuXHRcdFx0fSxcblx0XHRcdG5ldyBTZXBhcmF0b3IoKSxcblx0XHRcdHtcblx0XHRcdFx0Y2hlY2tlZDogdGhpcy5maWx0ZXJzLmlzRmlsdGVyaW5nRm9yKFRlc3RGaWx0ZXJUZXJtLkhpZGRlbiksXG5cdFx0XHRcdGNsYXNzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGVuYWJsZWQ6IHRoaXMudGVzdFNlcnZpY2UuZXhjbHVkZWQuaGFzQW55LFxuXHRcdFx0XHRpZDogJ3Nob3dFeGNsdWRlZCcsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndGVzdGluZy5maWx0ZXJzLnNob3dFeGNsdWRlZFRlc3RzJywgXCJTaG93IEhpZGRlbiBUZXN0c1wiKSxcblx0XHRcdFx0cnVuOiAoKSA9PiB0aGlzLmZpbHRlcnMudG9nZ2xlRmlsdGVyaW5nRm9yKFRlc3RGaWx0ZXJUZXJtLkhpZGRlbiksXG5cdFx0XHRcdHRvb2x0aXA6ICcnXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRjbGFzczogdW5kZWZpbmVkLFxuXHRcdFx0XHRlbmFibGVkOiB0aGlzLnRlc3RTZXJ2aWNlLmV4Y2x1ZGVkLmhhc0FueSxcblx0XHRcdFx0aWQ6ICdyZW1vdmVFeGNsdWRlZCcsXG5cdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgndGVzdGluZy5maWx0ZXJzLnJlbW92ZVRlc3RFeGNsdXNpb25zJywgXCJVbmhpZGUgQWxsIFRlc3RzXCIpLFxuXHRcdFx0XHRydW46IGFzeW5jICgpID0+IHRoaXMudGVzdFNlcnZpY2UuZXhjbHVkZWQuY2xlYXIoKSxcblx0XHRcdFx0dG9vbHRpcDogJydcblx0XHRcdH1cblx0XHRdO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHVwZGF0ZUNoZWNrZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5lbGVtZW50IS5jbGFzc0xpc3QudG9nZ2xlKCdjaGVja2VkJywgdGhpcy5fYWN0aW9uLmNoZWNrZWQpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLDBCQUE4RTtBQUN2RixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLFFBQWdDLGlCQUFpQjtBQUMxRCxTQUFTLGVBQWU7QUFDeEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsY0FBYyxxQkFBcUI7QUFDNUMsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxtREFBMkc7QUFDcEgsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywwQkFBMEIsc0JBQXNCO0FBQ3pELFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMEJBQTBCO0FBRW5DLE1BQU0seUJBQTREO0FBQUEsRUFDakUsQ0FBQyxlQUFlLE1BQU0sR0FBRyxTQUFTLGtD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
