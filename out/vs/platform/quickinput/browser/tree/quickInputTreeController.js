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
import { RenderIndentGuides } from "../../../../base/browser/ui/tree/abstractTree.js";
import { ObjectTreeElementCollapseState } from "../../../../base/browser/ui/tree/tree.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IInstantiationService } from "../../../instantiation/common/instantiation.js";
import { WorkbenchObjectTree } from "../../../list/browser/listService.js";
import { QuickPickFocus } from "../../common/quickInput.js";
import { QuickInputTreeDelegate } from "./quickInputDelegate.js";
import { getParentNodeState } from "./quickInputTree.js";
import { QuickTreeAccessibilityProvider } from "./quickInputTreeAccessibilityProvider.js";
import { QuickInputTreeFilter } from "./quickInputTreeFilter.js";
import { QuickInputCheckboxStateHandler, QuickInputTreeRenderer } from "./quickInputTreeRenderer.js";
import { QuickInputTreeSorter } from "./quickInputTreeSorter.js";
import { Checkbox } from "../../../../base/browser/ui/toggle/toggle.js";
const $ = dom.$;
const flatHierarchyClass = "quick-input-tree-flat";
class QuickInputTreeIdentityProvider {
  constructor() {
    this._elementIds = /* @__PURE__ */ new WeakMap();
    this._counter = 0;
  }
  getId(element) {
    let id = element.id;
    if (id !== void 0) {
      return id;
    }
    id = this._elementIds.get(element);
    if (id !== void 0) {
      return id;
    }
    id = `__generated_${this._counter++}`;
    this._elementIds.set(element, id);
    return id;
  }
}
let QuickInputTreeController = class extends Disposable {
  constructor(container, hoverDelegate, styles, instantiationService) {
    super();
    this.instantiationService = instantiationService;
    this._onDidTriggerButton = this._register(new Emitter());
    this.onDidTriggerButton = this._onDidTriggerButton.event;
    this._onDidChangeCheckboxState = this._register(new Emitter());
    this.onDidChangeCheckboxState = this._onDidChangeCheckboxState.event;
    this._onDidCheckedLeafItemsChange = this._register(new Emitter());
    this.onDidChangeCheckedLeafItems = this._onDidCheckedLeafItemsChange.event;
    this._onLeave = this._register(new Emitter());
    /**
     * Event that is fired when the tree would no longer have focus.
    */
    this.onLeave = this._onLeave.event;
    this._onDidAccept = this._register(new Emitter());
    /**
     * Event that is fired when a non-pickable item is clicked, indicating acceptance.
     */
    this.onDidAccept = this._onDidAccept.event;
    this._container = dom.append(container, $(".quick-input-tree"));
    this._checkboxStateHandler = this._register(new QuickInputCheckboxStateHandler());
    this._renderer = this._register(this.instantiationService.createInstance(
      QuickInputTreeRenderer,
      hoverDelegate,
      this._onDidTriggerButton,
      this.onDidChangeCheckboxState,
      this._checkboxStateHandler,
      styles.toggle
    ));
    this._filter = this.instantiationService.createInstance(QuickInputTreeFilter);
    this._sorter = this._register(new QuickInputTreeSorter());
    this._tree = this._register(this.instantiationService.createInstance(
      WorkbenchObjectTree,
      "QuickInputTree",
      this._container,
      new QuickInputTreeDelegate(),
      [this._renderer],
      {
        accessibilityProvider: new QuickTreeAccessibilityProvider(this.onDidChangeCheckboxState),
        horizontalScrolling: false,
        multipleSelectionSupport: false,
        findWidgetEnabled: false,
        alwaysConsumeMouseWheel: true,
        hideTwistiesOfChildlessElements: true,
        renderIndentGuides: RenderIndentGuides.None,
        expandOnDoubleClick: true,
        expandOnlyOnTwistieClick: true,
        disableExpandOnSpacebar: true,
        sorter: this._sorter,
        filter: this._filter,
        identityProvider: new QuickInputTreeIdentityProvider()
      }
    ));
    this._register(this._renderer.onDidDisposeFocusedElement(() => {
      this._tree.domFocus();
    }));
    this.registerCheckboxStateListeners();
    this.registerOnDidChangeFocus();
  }
  get tree() {
    return this._tree;
  }
  get renderer() {
    return this._renderer;
  }
  get displayed() {
    return this._container.style.display !== "none";
  }
  set displayed(value) {
    this._container.style.display = value ? "" : "none";
  }
  get sortByLabel() {
    return this._sorter.sortByLabel;
  }
  set sortByLabel(value) {
    this._sorter.sortByLabel = value;
    this._tree.resort(null, true);
  }
  getActiveDescendant() {
    return this._tree.getHTMLElement().getAttribute("aria-activedescendant");
  }
  filter(input) {
    this._filter.filterValue = input;
    this._tree.refilter();
  }
  updateFilterOptions(options) {
    if (options.matchOnLabel !== void 0) {
      this._filter.matchOnLabel = options.matchOnLabel;
    }
    if (options.matchOnDescription !== void 0) {
      this._filter.matchOnDescription = options.matchOnDescription;
    }
    this._tree.refilter();
  }
  setTreeData(treeData) {
    let hasNestedItems = false;
    const createTreeElement = (item) => {
      let children;
      if (item.children && item.children.length > 0) {
        hasNestedItems = true;
        children = item.children.map((child) => createTreeElement(child));
        item.checked = getParentNodeState(children);
      }
      return {
        element: item,
        children,
        collapsible: !!children,
        collapsed: item.collapsed ? ObjectTreeElementCollapseState.PreserveOrCollapsed : ObjectTreeElementCollapseState.PreserveOrExpanded
      };
    };
    const treeElements = treeData.map((item) => createTreeElement(item));
    this._tree.setChildren(null, treeElements);
    this._container.classList.toggle(flatHierarchyClass, !hasNestedItems);
  }
  layout(maxHeight) {
    this._tree.getHTMLElement().style.maxHeight = maxHeight ? `${// Make sure height aligns with list item heights
    Math.floor(maxHeight / 44) * 44 + 6}px` : "";
    this._tree.layout();
  }
  focus(what) {
    switch (what) {
      case QuickPickFocus.First:
        this._tree.scrollTop = 0;
        this._tree.focusFirst();
        break;
      case QuickPickFocus.Second: {
        this._tree.scrollTop = 0;
        let isSecondItem = false;
        this._tree.focusFirst(void 0, (e) => {
          if (isSecondItem) {
            return true;
          }
          isSecondItem = !isSecondItem;
          return false;
        });
        break;
      }
      case QuickPickFocus.Last:
        this._tree.scrollTop = this._tree.scrollHeight;
        this._tree.focusLast();
        break;
      case QuickPickFocus.Next: {
        const prevFocus = this._tree.getFocus();
        this._tree.focusNext(void 0, false, void 0, (e) => {
          this._tree.reveal(e.element);
          return true;
        });
        const currentFocus = this._tree.getFocus();
        if (prevFocus.length && prevFocus[0] === currentFocus[0]) {
          this._onLeave.fire();
        }
        break;
      }
      case QuickPickFocus.Previous: {
        const prevFocus = this._tree.getFocus();
        this._tree.focusPrevious(void 0, false, void 0, (e) => {
          this._tree.reveal(e.element);
          return true;
        });
        const currentFocus = this._tree.getFocus();
        if (prevFocus.length && prevFocus[0] === currentFocus[0]) {
          this._onLeave.fire();
        }
        break;
      }
      case QuickPickFocus.NextPage:
        this._tree.focusNextPage(void 0, (e) => {
          this._tree.reveal(e.element);
          return true;
        });
        break;
      case QuickPickFocus.PreviousPage:
        this._tree.focusPreviousPage(void 0, (e) => {
          this._tree.reveal(e.element);
          return true;
        });
        break;
      case QuickPickFocus.NextSeparator:
      case QuickPickFocus.PreviousSeparator:
        return;
    }
  }
  registerCheckboxStateListeners() {
    this._register(this._tree.onDidOpen((e) => {
      const item = e.element;
      if (!item) {
        return;
      }
      if (item.disabled) {
        return;
      }
      if (item.pickable === false) {
        this._tree.setFocus([item]);
        this._onDidAccept.fire();
        return;
      }
      const target = e.browserEvent?.target;
      if (target && target.classList.contains(Checkbox.CLASS_NAME)) {
        return;
      }
      this.updateCheckboxState(item, item.checked === true);
    }));
    this._register(this._checkboxStateHandler.onDidChangeCheckboxState((e) => {
      this.updateCheckboxState(e.item, e.checked === true, true);
      this._tree.setFocus([e.item]);
      this._tree.setSelection([e.item]);
    }));
  }
  updateCheckboxState(item, newState, skipItemRerender = false) {
    if ((item.checked ?? false) === newState) {
      return;
    }
    item.checked = newState;
    if (!skipItemRerender) {
      this._tree.rerender(item);
    }
    const updateSet = /* @__PURE__ */ new Set();
    const toUpdate = [...this._tree.getNode(item).children];
    while (toUpdate.length) {
      const pop = toUpdate.shift();
      if (pop?.element && !updateSet.has(pop.element)) {
        updateSet.add(pop.element);
        if ((pop.element.checked ?? false) !== item.checked) {
          pop.element.checked = item.checked;
          this._tree.rerender(pop.element);
        }
        toUpdate.push(...pop.children);
      }
    }
    let parent = this._tree.getParentElement(item);
    while (parent) {
      const parentChildren = [...this._tree.getNode(parent).children];
      const newState2 = getParentNodeState(parentChildren);
      if ((parent.checked ?? false) !== newState2) {
        parent.checked = newState2;
        this._tree.rerender(parent);
      }
      parent = this._tree.getParentElement(parent);
    }
    this._onDidChangeCheckboxState.fire({
      item,
      checked: item.checked ?? false
    });
    this._onDidCheckedLeafItemsChange.fire(this.getCheckedLeafItems());
  }
  registerOnDidChangeFocus() {
    this._register(this._tree.onDidChangeFocus((e) => {
      const item = this._tree.getFocus().findLast((item2) => item2 !== null);
      this._tree.setSelection(item ? [item] : [], e.browserEvent);
    }));
  }
  getCheckedLeafItems() {
    const lookedAt = /* @__PURE__ */ new Set();
    const toLookAt = [...this._tree.getNode().children];
    const checkedItems = new Array();
    while (toLookAt.length) {
      const lookAt = toLookAt.shift();
      if (!lookAt?.element || lookedAt.has(lookAt.element)) {
        continue;
      }
      if (lookAt.element.checked) {
        lookedAt.add(lookAt.element);
        toLookAt.push(...lookAt.children);
        if (!lookAt.element.children) {
          checkedItems.push(lookAt.element);
        }
      }
    }
    return checkedItems;
  }
  getActiveItems() {
    return this._tree.getFocus().filter((item) => item !== null);
  }
  toggleCheckbox() {
    for (const element of this.getActiveItems()) {
      if (element.pickable !== false && !element.disabled) {
        this.updateCheckboxState(element, !(element.checked === true));
      }
    }
  }
  checkAll(checked) {
    const updated = /* @__PURE__ */ new Set();
    const toUpdate = [...this._tree.getNode().children];
    let fireCheckedChangeEvent = false;
    while (toUpdate.length) {
      const update = toUpdate.shift();
      if (!update?.element || updated.has(update.element)) {
        continue;
      }
      if (update.element.checked !== checked) {
        fireCheckedChangeEvent = true;
        update.element.checked = checked;
        toUpdate.push(...update.children);
        updated.add(update.element);
        this._tree.rerender(update.element);
        this._onDidChangeCheckboxState.fire({
          item: update.element,
          checked: update.element.checked
        });
      }
    }
    if (fireCheckedChangeEvent) {
      this._onDidCheckedLeafItemsChange.fire(this.getCheckedLeafItems());
    }
  }
};
QuickInputTreeController = __decorateClass([
  __decorateParam(3, IInstantiationService)
], QuickInputTreeController);
export {
  QuickInputTreeController
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL3F1aWNraW5wdXQvYnJvd3Nlci90cmVlL3F1aWNrSW5wdXRUcmVlQ29udHJvbGxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFJlbmRlckluZGVudEd1aWRlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2Fic3RyYWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlLmpzJztcbmltcG9ydCB7IElPYmplY3RUcmVlRWxlbWVudCwgT2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBJSWRlbnRpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoT2JqZWN0VHJlZSB9IGZyb20gJy4uLy4uLy4uL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tUcmVlQ2hlY2tib3hFdmVudCwgSVF1aWNrVHJlZUl0ZW0sIElRdWlja1RyZWVJdGVtQnV0dG9uRXZlbnQsIFF1aWNrUGlja0ZvY3VzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgUXVpY2tJbnB1dFRyZWVEZWxlZ2F0ZSB9IGZyb20gJy4vcXVpY2tJbnB1dERlbGVnYXRlLmpzJztcbmltcG9ydCB7IGdldFBhcmVudE5vZGVTdGF0ZSwgSVF1aWNrVHJlZUZpbHRlckRhdGEgfSBmcm9tICcuL3F1aWNrSW5wdXRUcmVlLmpzJztcbmltcG9ydCB7IFF1aWNrVHJlZUFjY2Vzc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4vcXVpY2tJbnB1dFRyZWVBY2Nlc3NpYmlsaXR5UHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgUXVpY2tJbnB1dFRyZWVGaWx0ZXIgfSBmcm9tICcuL3F1aWNrSW5wdXRUcmVlRmlsdGVyLmpzJztcbmltcG9ydCB7IFF1aWNrSW5wdXRDaGVja2JveFN0YXRlSGFuZGxlciwgUXVpY2tJbnB1dFRyZWVSZW5kZXJlciB9IGZyb20gJy4vcXVpY2tJbnB1dFRyZWVSZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBRdWlja0lucHV0VHJlZVNvcnRlciB9IGZyb20gJy4vcXVpY2tJbnB1dFRyZWVTb3J0ZXIuanMnO1xuaW1wb3J0IHsgQ2hlY2tib3ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFN0eWxlcyB9IGZyb20gJy4uL3F1aWNrSW5wdXQuanMnO1xuXG5jb25zdCAkID0gZG9tLiQ7XG5jb25zdCBmbGF0SGllcmFyY2h5Q2xhc3MgPSAncXVpY2staW5wdXQtdHJlZS1mbGF0JztcblxuY2xhc3MgUXVpY2tJbnB1dFRyZWVJZGVudGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUlkZW50aXR5UHJvdmlkZXI8SVF1aWNrVHJlZUl0ZW0+IHtcblx0cHJpdmF0ZSByZWFkb25seSBfZWxlbWVudElkcyA9IG5ldyBXZWFrTWFwPElRdWlja1RyZWVJdGVtLCBzdHJpbmc+KCk7XG5cdHByaXZhdGUgX2NvdW50ZXIgPSAwO1xuXG5cdGdldElkKGVsZW1lbnQ6IElRdWlja1RyZWVJdGVtKTogeyB0b1N0cmluZygpOiBzdHJpbmcgfSB7XG5cdFx0bGV0IGlkID0gZWxlbWVudC5pZDtcblx0XHRpZiAoaWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIGlkO1xuXHRcdH1cblxuXHRcdGlkID0gdGhpcy5fZWxlbWVudElkcy5nZXQoZWxlbWVudCk7XG5cdFx0aWYgKGlkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiBpZDtcblx0XHR9XG5cblx0XHRpZCA9IGBfX2dlbmVyYXRlZF8ke3RoaXMuX2NvdW50ZXIrK31gO1xuXHRcdHRoaXMuX2VsZW1lbnRJZHMuc2V0KGVsZW1lbnQsIGlkKTtcblx0XHRyZXR1cm4gaWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFF1aWNrSW5wdXRUcmVlQ29udHJvbGxlciBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZW5kZXJlcjogUXVpY2tJbnB1dFRyZWVSZW5kZXJlcjxJUXVpY2tUcmVlSXRlbT47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoZWNrYm94U3RhdGVIYW5kbGVyOiBRdWlja0lucHV0Q2hlY2tib3hTdGF0ZUhhbmRsZXI8SVF1aWNrVHJlZUl0ZW0+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9maWx0ZXI6IFF1aWNrSW5wdXRUcmVlRmlsdGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zb3J0ZXI6IFF1aWNrSW5wdXRUcmVlU29ydGVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF90cmVlOiBXb3JrYmVuY2hPYmplY3RUcmVlPElRdWlja1RyZWVJdGVtLCBJUXVpY2tUcmVlRmlsdGVyRGF0YT47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRUcmlnZ2VyQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVF1aWNrVHJlZUl0ZW1CdXR0b25FdmVudDxJUXVpY2tUcmVlSXRlbT4+KCkpO1xuXHRyZWFkb25seSBvbkRpZFRyaWdnZXJCdXR0b24gPSB0aGlzLl9vbkRpZFRyaWdnZXJCdXR0b24uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VDaGVja2JveFN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SVF1aWNrVHJlZUNoZWNrYm94RXZlbnQ8SVF1aWNrVHJlZUl0ZW0+PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDaGVja2JveFN0YXRlID0gdGhpcy5fb25EaWRDaGFuZ2VDaGVja2JveFN0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hlY2tlZExlYWZJdGVtc0NoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFJlYWRvbmx5QXJyYXk8SVF1aWNrVHJlZUl0ZW0+PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDaGVja2VkTGVhZkl0ZW1zID0gdGhpcy5fb25EaWRDaGVja2VkTGVhZkl0ZW1zQ2hhbmdlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uTGVhdmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0LyoqXG5cdCAqIEV2ZW50IHRoYXQgaXMgZmlyZWQgd2hlbiB0aGUgdHJlZSB3b3VsZCBubyBsb25nZXIgaGF2ZSBmb2N1cy5cblx0Ki9cblx0cmVhZG9ubHkgb25MZWF2ZTogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkxlYXZlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQWNjZXB0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdC8qKlxuXHQgKiBFdmVudCB0aGF0IGlzIGZpcmVkIHdoZW4gYSBub24tcGlja2FibGUgaXRlbSBpcyBjbGlja2VkLCBpbmRpY2F0aW5nIGFjY2VwdGFuY2UuXG5cdCAqL1xuXHRyZWFkb25seSBvbkRpZEFjY2VwdDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbkRpZEFjY2VwdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250YWluZXI6IEhUTUxFbGVtZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0aG92ZXJEZWxlZ2F0ZTogSUhvdmVyRGVsZWdhdGUgfCB1bmRlZmluZWQsXG5cdFx0c3R5bGVzOiBJUXVpY2tJbnB1dFN0eWxlcyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jb250YWluZXIgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnF1aWNrLWlucHV0LXRyZWUnKSk7XG5cdFx0dGhpcy5fY2hlY2tib3hTdGF0ZUhhbmRsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUXVpY2tJbnB1dENoZWNrYm94U3RhdGVIYW5kbGVyPElRdWlja1RyZWVJdGVtPigpKTtcblx0XHR0aGlzLl9yZW5kZXJlciA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRRdWlja0lucHV0VHJlZVJlbmRlcmVyLFxuXHRcdFx0aG92ZXJEZWxlZ2F0ZSxcblx0XHRcdHRoaXMuX29uRGlkVHJpZ2dlckJ1dHRvbixcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VDaGVja2JveFN0YXRlLFxuXHRcdFx0dGhpcy5fY2hlY2tib3hTdGF0ZUhhbmRsZXIsXG5cdFx0XHRzdHlsZXMudG9nZ2xlXG5cdFx0KSk7XG5cdFx0dGhpcy5fZmlsdGVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShRdWlja0lucHV0VHJlZUZpbHRlcik7XG5cdFx0dGhpcy5fc29ydGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFF1aWNrSW5wdXRUcmVlU29ydGVyKCkpO1xuXHRcdHRoaXMuX3RyZWUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoT2JqZWN0VHJlZTxJUXVpY2tUcmVlSXRlbSwgSVF1aWNrVHJlZUZpbHRlckRhdGE+LFxuXHRcdFx0J1F1aWNrSW5wdXRUcmVlJyxcblx0XHRcdHRoaXMuX2NvbnRhaW5lcixcblx0XHRcdG5ldyBRdWlja0lucHV0VHJlZURlbGVnYXRlKCksXG5cdFx0XHRbdGhpcy5fcmVuZGVyZXJdLFxuXHRcdFx0e1xuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IG5ldyBRdWlja1RyZWVBY2Nlc3NpYmlsaXR5UHJvdmlkZXIodGhpcy5vbkRpZENoYW5nZUNoZWNrYm94U3RhdGUpLFxuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0ZmluZFdpZGdldEVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRhbHdheXNDb25zdW1lTW91c2VXaGVlbDogdHJ1ZSxcblx0XHRcdFx0aGlkZVR3aXN0aWVzT2ZDaGlsZGxlc3NFbGVtZW50czogdHJ1ZSxcblx0XHRcdFx0cmVuZGVySW5kZW50R3VpZGVzOiBSZW5kZXJJbmRlbnRHdWlkZXMuTm9uZSxcblx0XHRcdFx0ZXhwYW5kT25Eb3VibGVDbGljazogdHJ1ZSxcblx0XHRcdFx0ZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrOiB0cnVlLFxuXHRcdFx0XHRkaXNhYmxlRXhwYW5kT25TcGFjZWJhcjogdHJ1ZSxcblx0XHRcdFx0c29ydGVyOiB0aGlzLl9zb3J0ZXIsXG5cdFx0XHRcdGZpbHRlcjogdGhpcy5fZmlsdGVyLFxuXHRcdFx0XHRpZGVudGl0eVByb3ZpZGVyOiBuZXcgUXVpY2tJbnB1dFRyZWVJZGVudGl0eVByb3ZpZGVyKClcblx0XHRcdH1cblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9yZW5kZXJlci5vbkRpZERpc3Bvc2VGb2N1c2VkRWxlbWVudCgoKSA9PiB7XG5cdFx0XHR0aGlzLl90cmVlLmRvbUZvY3VzKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMucmVnaXN0ZXJDaGVja2JveFN0YXRlTGlzdGVuZXJzKCk7XG5cdFx0dGhpcy5yZWdpc3Rlck9uRGlkQ2hhbmdlRm9jdXMoKTtcblx0fVxuXG5cdGdldCB0cmVlKCk6IFdvcmtiZW5jaE9iamVjdFRyZWU8SVF1aWNrVHJlZUl0ZW0sIElRdWlja1RyZWVGaWx0ZXJEYXRhPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWU7XG5cdH1cblxuXHRnZXQgcmVuZGVyZXIoKTogUXVpY2tJbnB1dFRyZWVSZW5kZXJlcjxJUXVpY2tUcmVlSXRlbT4ge1xuXHRcdHJldHVybiB0aGlzLl9yZW5kZXJlcjtcblx0fVxuXG5cdGdldCBkaXNwbGF5ZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ICE9PSAnbm9uZSc7XG5cdH1cblxuXHRzZXQgZGlzcGxheWVkKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fY29udGFpbmVyLnN0eWxlLmRpc3BsYXkgPSB2YWx1ZSA/ICcnIDogJ25vbmUnO1xuXHR9XG5cblx0Z2V0IHNvcnRCeUxhYmVsKCkge1xuXHRcdHJldHVybiB0aGlzLl9zb3J0ZXIuc29ydEJ5TGFiZWw7XG5cdH1cblxuXHRzZXQgc29ydEJ5TGFiZWwodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9zb3J0ZXIuc29ydEJ5TGFiZWwgPSB2YWx1ZTtcblx0XHR0aGlzLl90cmVlLnJlc29ydChudWxsLCB0cnVlKTtcblx0fVxuXG5cdGdldEFjdGl2ZURlc2NlbmRhbnQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUuZ2V0SFRNTEVsZW1lbnQoKS5nZXRBdHRyaWJ1dGUoJ2FyaWEtYWN0aXZlZGVzY2VuZGFudCcpO1xuXHR9XG5cblx0ZmlsdGVyKGlucHV0OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9maWx0ZXIuZmlsdGVyVmFsdWUgPSBpbnB1dDtcblx0XHR0aGlzLl90cmVlLnJlZmlsdGVyKCk7XG5cdH1cblxuXHR1cGRhdGVGaWx0ZXJPcHRpb25zKG9wdGlvbnM6IHtcblx0XHRtYXRjaE9uTGFiZWw/OiBib29sZWFuO1xuXHRcdG1hdGNoT25EZXNjcmlwdGlvbj86IGJvb2xlYW47XG5cdH0pOiB2b2lkIHtcblx0XHRpZiAob3B0aW9ucy5tYXRjaE9uTGFiZWwgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fZmlsdGVyLm1hdGNoT25MYWJlbCA9IG9wdGlvbnMubWF0Y2hPbkxhYmVsO1xuXHRcdH1cblx0XHRpZiAob3B0aW9ucy5tYXRjaE9uRGVzY3JpcHRpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fZmlsdGVyLm1hdGNoT25EZXNjcmlwdGlvbiA9IG9wdGlvbnMubWF0Y2hPbkRlc2NyaXB0aW9uO1xuXHRcdH1cblx0XHR0aGlzLl90cmVlLnJlZmlsdGVyKCk7XG5cdH1cblxuXHRzZXRUcmVlRGF0YSh0cmVlRGF0YTogcmVhZG9ubHkgSVF1aWNrVHJlZUl0ZW1bXSk6IHZvaWQge1xuXHRcdGxldCBoYXNOZXN0ZWRJdGVtcyA9IGZhbHNlO1xuXHRcdGNvbnN0IGNyZWF0ZVRyZWVFbGVtZW50ID0gKGl0ZW06IElRdWlja1RyZWVJdGVtKTogSU9iamVjdFRyZWVFbGVtZW50PElRdWlja1RyZWVJdGVtPiA9PiB7XG5cdFx0XHRsZXQgY2hpbGRyZW46IElPYmplY3RUcmVlRWxlbWVudDxJUXVpY2tUcmVlSXRlbT5bXSB8IHVuZGVmaW5lZDtcblx0XHRcdGlmIChpdGVtLmNoaWxkcmVuICYmIGl0ZW0uY2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRoYXNOZXN0ZWRJdGVtcyA9IHRydWU7XG5cdFx0XHRcdGNoaWxkcmVuID0gaXRlbS5jaGlsZHJlbi5tYXAoY2hpbGQgPT4gY3JlYXRlVHJlZUVsZW1lbnQoY2hpbGQpKTtcblx0XHRcdFx0aXRlbS5jaGVja2VkID0gZ2V0UGFyZW50Tm9kZVN0YXRlKGNoaWxkcmVuKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVsZW1lbnQ6IGl0ZW0sXG5cdFx0XHRcdGNoaWxkcmVuLFxuXHRcdFx0XHRjb2xsYXBzaWJsZTogISFjaGlsZHJlbixcblx0XHRcdFx0Y29sbGFwc2VkOiBpdGVtLmNvbGxhcHNlZCA/XG5cdFx0XHRcdFx0T2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLlByZXNlcnZlT3JDb2xsYXBzZWQgOlxuXHRcdFx0XHRcdE9iamVjdFRyZWVFbGVtZW50Q29sbGFwc2VTdGF0ZS5QcmVzZXJ2ZU9yRXhwYW5kZWRcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdGNvbnN0IHRyZWVFbGVtZW50cyA9IHRyZWVEYXRhLm1hcChpdGVtID0+IGNyZWF0ZVRyZWVFbGVtZW50KGl0ZW0pKTtcblx0XHR0aGlzLl90cmVlLnNldENoaWxkcmVuKG51bGwsIHRyZWVFbGVtZW50cyk7XG5cdFx0dGhpcy5fY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoZmxhdEhpZXJhcmNoeUNsYXNzLCAhaGFzTmVzdGVkSXRlbXMpO1xuXHR9XG5cblx0bGF5b3V0KG1heEhlaWdodD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3RyZWUuZ2V0SFRNTEVsZW1lbnQoKS5zdHlsZS5tYXhIZWlnaHQgPSBtYXhIZWlnaHQgPyBgJHtcblx0XHRcdC8vIE1ha2Ugc3VyZSBoZWlnaHQgYWxpZ25zIHdpdGggbGlzdCBpdGVtIGhlaWdodHNcblx0XHRcdE1hdGguZmxvb3IobWF4SGVpZ2h0IC8gNDQpICogNDRcblx0XHRcdC8vIEFkZCBzb21lIGV4dHJhIGhlaWdodCBzbyB0aGF0IGl0J3MgY2xlYXIgdGhlcmUncyBtb3JlIHRvIHNjcm9sbFxuXHRcdFx0KyA2XG5cdFx0XHR9cHhgIDogJyc7XG5cdFx0dGhpcy5fdHJlZS5sYXlvdXQoKTtcblx0fVxuXG5cdGZvY3VzKHdoYXQ6IFF1aWNrUGlja0ZvY3VzKTogdm9pZCB7XG5cdFx0c3dpdGNoICh3aGF0KSB7XG5cdFx0XHRjYXNlIFF1aWNrUGlja0ZvY3VzLkZpcnN0OlxuXHRcdFx0XHR0aGlzLl90cmVlLnNjcm9sbFRvcCA9IDA7XG5cdFx0XHRcdHRoaXMuX3RyZWUuZm9jdXNGaXJzdCgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUXVpY2tQaWNrRm9jdXMuU2Vjb25kOiB7XG5cdFx0XHRcdHRoaXMuX3RyZWUuc2Nyb2xsVG9wID0gMDtcblx0XHRcdFx0bGV0IGlzU2Vjb25kSXRlbSA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLl90cmVlLmZvY3VzRmlyc3QodW5kZWZpbmVkLCAoZSkgPT4ge1xuXHRcdFx0XHRcdGlmIChpc1NlY29uZEl0ZW0pIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpc1NlY29uZEl0ZW0gPSAhaXNTZWNvbmRJdGVtO1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBRdWlja1BpY2tGb2N1cy5MYXN0OlxuXHRcdFx0XHR0aGlzLl90cmVlLnNjcm9sbFRvcCA9IHRoaXMuX3RyZWUuc2Nyb2xsSGVpZ2h0O1xuXHRcdFx0XHR0aGlzLl90cmVlLmZvY3VzTGFzdCgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUXVpY2tQaWNrRm9jdXMuTmV4dDoge1xuXHRcdFx0XHRjb25zdCBwcmV2Rm9jdXMgPSB0aGlzLl90cmVlLmdldEZvY3VzKCk7XG5cdFx0XHRcdHRoaXMuX3RyZWUuZm9jdXNOZXh0KHVuZGVmaW5lZCwgZmFsc2UsIHVuZGVmaW5lZCwgKGUpID0+IHtcblx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnQpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgY3VycmVudEZvY3VzID0gdGhpcy5fdHJlZS5nZXRGb2N1cygpO1xuXHRcdFx0XHRpZiAocHJldkZvY3VzLmxlbmd0aCAmJiBwcmV2Rm9jdXNbMF0gPT09IGN1cnJlbnRGb2N1c1swXSkge1xuXHRcdFx0XHRcdHRoaXMuX29uTGVhdmUuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBRdWlja1BpY2tGb2N1cy5QcmV2aW91czoge1xuXHRcdFx0XHRjb25zdCBwcmV2Rm9jdXMgPSB0aGlzLl90cmVlLmdldEZvY3VzKCk7XG5cdFx0XHRcdHRoaXMuX3RyZWUuZm9jdXNQcmV2aW91cyh1bmRlZmluZWQsIGZhbHNlLCB1bmRlZmluZWQsIChlKSA9PiB7XG5cdFx0XHRcdFx0Ly8gZG8gd2Ugd2FudCB0byByZXZlYWwgdGhlIHBhcmVudD9cblx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnQpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgY3VycmVudEZvY3VzID0gdGhpcy5fdHJlZS5nZXRGb2N1cygpO1xuXHRcdFx0XHRpZiAocHJldkZvY3VzLmxlbmd0aCAmJiBwcmV2Rm9jdXNbMF0gPT09IGN1cnJlbnRGb2N1c1swXSkge1xuXHRcdFx0XHRcdHRoaXMuX29uTGVhdmUuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBRdWlja1BpY2tGb2N1cy5OZXh0UGFnZTpcblx0XHRcdFx0dGhpcy5fdHJlZS5mb2N1c05leHRQYWdlKHVuZGVmaW5lZCwgKGUpID0+IHtcblx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnQpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFF1aWNrUGlja0ZvY3VzLlByZXZpb3VzUGFnZTpcblx0XHRcdFx0dGhpcy5fdHJlZS5mb2N1c1ByZXZpb3VzUGFnZSh1bmRlZmluZWQsIChlKSA9PiB7XG5cdFx0XHRcdFx0Ly8gZG8gd2Ugd2FudCB0byByZXZlYWwgdGhlIHBhcmVudD9cblx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnQpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFF1aWNrUGlja0ZvY3VzLk5leHRTZXBhcmF0b3I6XG5cdFx0XHRjYXNlIFF1aWNrUGlja0ZvY3VzLlByZXZpb3VzU2VwYXJhdG9yOlxuXHRcdFx0XHQvLyBUaGVzZSBkb24ndCBtYWtlIHNlbnNlIGZvciB0aGUgdHJlZVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0cmVnaXN0ZXJDaGVja2JveFN0YXRlTGlzdGVuZXJzKCkge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RyZWUub25EaWRPcGVuKGUgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbSA9IGUuZWxlbWVudDtcblx0XHRcdGlmICghaXRlbSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChpdGVtLmRpc2FibGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIGl0ZW0gaXMgcGlja2FibGUgKGRlZmF1bHRzIHRvIHRydWUgaWYgbm90IHNwZWNpZmllZClcblx0XHRcdGlmIChpdGVtLnBpY2thYmxlID09PSBmYWxzZSkge1xuXHRcdFx0XHQvLyBGb3Igbm9uLXBpY2thYmxlIGl0ZW1zLCBzZXQgaXQgYXMgdGhlIGFjdGl2ZSBpdGVtIGFuZCBmaXJlIHRoZSBhY2NlcHQgZXZlbnRcblx0XHRcdFx0dGhpcy5fdHJlZS5zZXRGb2N1cyhbaXRlbV0pO1xuXHRcdFx0XHR0aGlzLl9vbkRpZEFjY2VwdC5maXJlKCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdGFyZ2V0ID0gZS5icm93c2VyRXZlbnQ/LnRhcmdldCBhcyBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0YXJnZXQgJiYgdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucyhDaGVja2JveC5DTEFTU19OQU1FKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudXBkYXRlQ2hlY2tib3hTdGF0ZShpdGVtLCBpdGVtLmNoZWNrZWQgPT09IHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2NoZWNrYm94U3RhdGVIYW5kbGVyLm9uRGlkQ2hhbmdlQ2hlY2tib3hTdGF0ZShlID0+IHtcblx0XHRcdHRoaXMudXBkYXRlQ2hlY2tib3hTdGF0ZShlLml0ZW0sIGUuY2hlY2tlZCA9PT0gdHJ1ZSwgdHJ1ZSk7XG5cdFx0XHR0aGlzLl90cmVlLnNldEZvY3VzKFtlLml0ZW1dKTtcblx0XHRcdHRoaXMuX3RyZWUuc2V0U2VsZWN0aW9uKFtlLml0ZW1dKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUNoZWNrYm94U3RhdGUoaXRlbTogSVF1aWNrVHJlZUl0ZW0sIG5ld1N0YXRlOiBib29sZWFuLCBza2lwSXRlbVJlcmVuZGVyID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAoKGl0ZW0uY2hlY2tlZCA/PyBmYWxzZSkgPT09IG5ld1N0YXRlKSB7XG5cdFx0XHRyZXR1cm47IC8vIE5vIGNoYW5nZVxuXHRcdH1cblxuXHRcdC8vIEhhbmRsZSBjaGVja2VkIGl0ZW1cblx0XHRpdGVtLmNoZWNrZWQgPSBuZXdTdGF0ZTtcblx0XHRpZiAoIXNraXBJdGVtUmVyZW5kZXIpIHtcblx0XHRcdHRoaXMuX3RyZWUucmVyZW5kZXIoaXRlbSk7XG5cdFx0fVxuXG5cdFx0Ly8gSGFuZGxlIGNoaWxkcmVuIG9mIHRoZSBjaGVja2VkIGl0ZW1cblx0XHRjb25zdCB1cGRhdGVTZXQgPSBuZXcgU2V0PElRdWlja1RyZWVJdGVtPigpO1xuXHRcdGNvbnN0IHRvVXBkYXRlID0gWy4uLnRoaXMuX3RyZWUuZ2V0Tm9kZShpdGVtKS5jaGlsZHJlbl07XG5cdFx0d2hpbGUgKHRvVXBkYXRlLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgcG9wID0gdG9VcGRhdGUuc2hpZnQoKTtcblx0XHRcdGlmIChwb3A/LmVsZW1lbnQgJiYgIXVwZGF0ZVNldC5oYXMocG9wLmVsZW1lbnQpKSB7XG5cdFx0XHRcdHVwZGF0ZVNldC5hZGQocG9wLmVsZW1lbnQpO1xuXHRcdFx0XHRpZiAoKHBvcC5lbGVtZW50LmNoZWNrZWQgPz8gZmFsc2UpICE9PSBpdGVtLmNoZWNrZWQpIHtcblx0XHRcdFx0XHRwb3AuZWxlbWVudC5jaGVja2VkID0gaXRlbS5jaGVja2VkO1xuXHRcdFx0XHRcdHRoaXMuX3RyZWUucmVyZW5kZXIocG9wLmVsZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRvVXBkYXRlLnB1c2goLi4ucG9wLmNoaWxkcmVuKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBIYW5kbGUgcGFyZW50cyBvZiB0aGUgY2hlY2tlZCBpdGVtXG5cdFx0bGV0IHBhcmVudCA9IHRoaXMuX3RyZWUuZ2V0UGFyZW50RWxlbWVudChpdGVtKTtcblx0XHR3aGlsZSAocGFyZW50KSB7XG5cdFx0XHRjb25zdCBwYXJlbnRDaGlsZHJlbiA9IFsuLi50aGlzLl90cmVlLmdldE5vZGUocGFyZW50KS5jaGlsZHJlbl07XG5cdFx0XHRjb25zdCBuZXdTdGF0ZSA9IGdldFBhcmVudE5vZGVTdGF0ZShwYXJlbnRDaGlsZHJlbik7XG5cblx0XHRcdGlmICgocGFyZW50LmNoZWNrZWQgPz8gZmFsc2UpICE9PSBuZXdTdGF0ZSkge1xuXHRcdFx0XHRwYXJlbnQuY2hlY2tlZCA9IG5ld1N0YXRlO1xuXHRcdFx0XHR0aGlzLl90cmVlLnJlcmVuZGVyKHBhcmVudCk7XG5cdFx0XHR9XG5cdFx0XHRwYXJlbnQgPSB0aGlzLl90cmVlLmdldFBhcmVudEVsZW1lbnQocGFyZW50KTtcblx0XHR9XG5cblx0XHR0aGlzLl9vbkRpZENoYW5nZUNoZWNrYm94U3RhdGUuZmlyZSh7XG5cdFx0XHRpdGVtLFxuXHRcdFx0Y2hlY2tlZDogaXRlbS5jaGVja2VkID8/IGZhbHNlXG5cdFx0fSk7XG5cdFx0dGhpcy5fb25EaWRDaGVja2VkTGVhZkl0ZW1zQ2hhbmdlLmZpcmUodGhpcy5nZXRDaGVja2VkTGVhZkl0ZW1zKCkpO1xuXHR9XG5cblx0cmVnaXN0ZXJPbkRpZENoYW5nZUZvY3VzKCkge1xuXHRcdC8vIEVuc3VyZSB0aGF0IHNlbGVjdGlvbiBmb2xsb3dzIGZvY3VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdHJlZS5vbkRpZENoYW5nZUZvY3VzKGUgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbSA9IHRoaXMuX3RyZWUuZ2V0Rm9jdXMoKS5maW5kTGFzdChpdGVtID0+IGl0ZW0gIT09IG51bGwpO1xuXHRcdFx0dGhpcy5fdHJlZS5zZXRTZWxlY3Rpb24oaXRlbSA/IFtpdGVtXSA6IFtdLCBlLmJyb3dzZXJFdmVudCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0Q2hlY2tlZExlYWZJdGVtcygpIHtcblx0XHRjb25zdCBsb29rZWRBdCA9IG5ldyBTZXQ8SVF1aWNrVHJlZUl0ZW0+KCk7XG5cdFx0Y29uc3QgdG9Mb29rQXQgPSBbLi4udGhpcy5fdHJlZS5nZXROb2RlKCkuY2hpbGRyZW5dO1xuXHRcdGNvbnN0IGNoZWNrZWRJdGVtcyA9IG5ldyBBcnJheTxJUXVpY2tUcmVlSXRlbT4oKTtcblx0XHR3aGlsZSAodG9Mb29rQXQubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCBsb29rQXQgPSB0b0xvb2tBdC5zaGlmdCgpO1xuXHRcdFx0aWYgKCFsb29rQXQ/LmVsZW1lbnQgfHwgbG9va2VkQXQuaGFzKGxvb2tBdC5lbGVtZW50KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChsb29rQXQuZWxlbWVudC5jaGVja2VkKSB7XG5cdFx0XHRcdGxvb2tlZEF0LmFkZChsb29rQXQuZWxlbWVudCk7XG5cdFx0XHRcdHRvTG9va0F0LnB1c2goLi4ubG9va0F0LmNoaWxkcmVuKTtcblx0XHRcdFx0aWYgKCFsb29rQXQuZWxlbWVudC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdGNoZWNrZWRJdGVtcy5wdXNoKGxvb2tBdC5lbGVtZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gY2hlY2tlZEl0ZW1zO1xuXHR9XG5cblx0Z2V0QWN0aXZlSXRlbXMoKTogcmVhZG9ubHkgSVF1aWNrVHJlZUl0ZW1bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUuZ2V0Rm9jdXMoKS5maWx0ZXIoKGl0ZW0pOiBpdGVtIGlzIElRdWlja1RyZWVJdGVtID0+IGl0ZW0gIT09IG51bGwpO1xuXHR9XG5cblx0dG9nZ2xlQ2hlY2tib3goKSB7XG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIHRoaXMuZ2V0QWN0aXZlSXRlbXMoKSkge1xuXHRcdFx0aWYgKGVsZW1lbnQucGlja2FibGUgIT09IGZhbHNlICYmICFlbGVtZW50LmRpc2FibGVkKSB7XG5cdFx0XHRcdHRoaXMudXBkYXRlQ2hlY2tib3hTdGF0ZShlbGVtZW50LCAhKGVsZW1lbnQuY2hlY2tlZCA9PT0gdHJ1ZSkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGNoZWNrQWxsKGNoZWNrZWQ6IGJvb2xlYW4gfCAnbWl4ZWQnKSB7XG5cdFx0Y29uc3QgdXBkYXRlZCA9IG5ldyBTZXQ8SVF1aWNrVHJlZUl0ZW0+KCk7XG5cdFx0Y29uc3QgdG9VcGRhdGUgPSBbLi4udGhpcy5fdHJlZS5nZXROb2RlKCkuY2hpbGRyZW5dO1xuXHRcdGxldCBmaXJlQ2hlY2tlZENoYW5nZUV2ZW50ID0gZmFsc2U7XG5cdFx0d2hpbGUgKHRvVXBkYXRlLmxlbmd0aCkge1xuXHRcdFx0Y29uc3QgdXBkYXRlID0gdG9VcGRhdGUuc2hpZnQoKTtcblx0XHRcdGlmICghdXBkYXRlPy5lbGVtZW50IHx8IHVwZGF0ZWQuaGFzKHVwZGF0ZS5lbGVtZW50KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICh1cGRhdGUuZWxlbWVudC5jaGVja2VkICE9PSBjaGVja2VkKSB7XG5cdFx0XHRcdGZpcmVDaGVja2VkQ2hhbmdlRXZlbnQgPSB0cnVlO1xuXHRcdFx0XHR1cGRhdGUuZWxlbWVudC5jaGVja2VkID0gY2hlY2tlZDtcblx0XHRcdFx0dG9VcGRhdGUucHVzaCguLi51cGRhdGUuY2hpbGRyZW4pO1xuXHRcdFx0XHR1cGRhdGVkLmFkZCh1cGRhdGUuZWxlbWVudCk7XG5cdFx0XHRcdHRoaXMuX3RyZWUucmVyZW5kZXIodXBkYXRlLmVsZW1lbnQpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUNoZWNrYm94U3RhdGUuZmlyZSh7XG5cdFx0XHRcdFx0aXRlbTogdXBkYXRlLmVsZW1lbnQsXG5cdFx0XHRcdFx0Y2hlY2tlZDogdXBkYXRlLmVsZW1lbnQuY2hlY2tlZFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGZpcmVDaGVja2VkQ2hhbmdlRXZlbnQpIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hlY2tlZExlYWZJdGVtc0NoYW5nZS5maXJlKHRoaXMuZ2V0Q2hlY2tl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
