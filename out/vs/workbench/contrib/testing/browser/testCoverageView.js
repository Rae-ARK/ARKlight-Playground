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
import { findLast } from "../../../../base/common/arraysFind.js";
import { assertNever } from "../../../../base/common/assert.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { memoize } from "../../../../base/common/decorators.js";
import { createMatches } from "../../../../base/common/filters.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../../base/common/observable.js";
import { basenameOrAuthority } from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { getActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { EditorOpenSource, TextEditorSelectionRevealType } from "../../../../platform/editor/common/editor.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchCompressibleObjectTree } from "../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ResourceLabels } from "../../../browser/labels.js";
import { ViewAction, ViewPane } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { TestCommandId, Testing } from "../common/constants.js";
import { onObservableChange } from "../common/observableUtils.js";
import { BypassedFileCoverage, FileCoverage, getTotalCoveragePercent } from "../common/testCoverage.js";
import { ITestCoverageService } from "../common/testCoverageService.js";
import { TestId } from "../common/testId.js";
import { TestingContextKeys } from "../common/testingContextKeys.js";
import { DetailType, TestResultState } from "../common/testTypes.js";
import * as coverUtils from "./codeCoverageDisplayUtils.js";
import { testingStatesToIcons, testingWasCovered } from "./icons.js";
import { ManagedTestCoverageBars } from "./testCoverageBars.js";
var CoverageSortOrder = /* @__PURE__ */ ((CoverageSortOrder2) => {
  CoverageSortOrder2[CoverageSortOrder2["Coverage"] = 0] = "Coverage";
  CoverageSortOrder2[CoverageSortOrder2["Location"] = 1] = "Location";
  CoverageSortOrder2[CoverageSortOrder2["Name"] = 2] = "Name";
  return CoverageSortOrder2;
})(CoverageSortOrder || {});
let TestCoverageView = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, coverageService, storageService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.coverageService = coverageService;
    this.storageService = storageService;
    this.tree = this._register(new MutableDisposable());
    this.sortOrder = observableValue("sortOrder", 1 /* Location */);
    const storedOrder = this.storageService.getNumber("testing.coverageSortOrder", StorageScope.WORKSPACE);
    if (storedOrder !== void 0 && storedOrder >= 0 /* Coverage */ && storedOrder <= 2 /* Name */) {
      this.sortOrder.set(storedOrder, void 0);
    }
  }
  renderBody(container) {
    super.renderBody(container);
    this._register(autorun((reader) => {
      const order = this.sortOrder.read(reader);
      this.storageService.store("testing.coverageSortOrder", order, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }));
    const labels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility }));
    this._register(autorun((reader) => {
      const coverage = this.coverageService.selected.read(reader);
      if (coverage) {
        const t = this.tree.value ??= this.instantiationService.createInstance(TestCoverageTree, container, labels, this.sortOrder);
        t.setInput(coverage, this.coverageService.filterToTest.read(reader));
      } else {
        this.tree.clear();
      }
    }));
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.tree.value?.layout(height, width);
  }
  collapseAll() {
    this.tree.value?.collapseAll();
  }
};
TestCoverageView = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, ITestCoverageService),
  __decorateParam(11, IStorageService)
], TestCoverageView);
let fnNodeId = 0;
class DeclarationCoverageNode {
  constructor(uri, data, details) {
    this.uri = uri;
    this.data = data;
    this.id = String(fnNodeId++);
    this.containedDetails = /* @__PURE__ */ new Set();
    this.children = [];
    if (data.location instanceof Range) {
      for (const detail of details) {
        if (this.contains(detail.location)) {
          this.containedDetails.add(detail);
        }
      }
    }
  }
  get hits() {
    return this.data.count;
  }
  get label() {
    return this.data.name;
  }
  get location() {
    return this.data.location;
  }
  get tpc() {
    const attr = this.attributableCoverage();
    return attr && getTotalCoveragePercent(attr.statement, attr.branch, void 0);
  }
  /** Gets whether this function has a defined range and contains the given range. */
  contains(location) {
    const own = this.data.location;
    return own instanceof Range && (location instanceof Range ? own.containsRange(location) : own.containsPosition(location));
  }
  attributableCoverage() {
    const { location, count } = this.data;
    if (!(location instanceof Range) || !count) {
      return;
    }
    const statement = { covered: 0, total: 0 };
    const branch = { covered: 0, total: 0 };
    for (const detail of this.containedDetails) {
      if (detail.type !== DetailType.Statement) {
        continue;
      }
      statement.covered += detail.count ? 1 : 0;
      statement.total++;
      if (detail.branches) {
        for (const { count: count2 } of detail.branches) {
          branch.covered += count2 ? 1 : 0;
          branch.total++;
        }
      }
    }
    return { statement, branch };
  }
}
__decorateClass([
  memoize
], DeclarationCoverageNode.prototype, "attributableCoverage", 1);
class RevealUncoveredDeclarations {
  constructor(n) {
    this.n = n;
    this.id = String(fnNodeId++);
  }
  get label() {
    return localize("functionsWithoutCoverage", "{0} declarations without coverage...", this.n);
  }
}
class CurrentlyFilteredTo {
  constructor(testItem) {
    this.testItem = testItem;
    this.id = String(fnNodeId++);
  }
  get label() {
    return localize("filteredToTest", 'Showing coverage for "{0}"', this.testItem.label);
  }
}
class LoadingDetails {
  constructor() {
    this.id = String(fnNodeId++);
    this.label = localize("loadingCoverageDetails", "Loading Coverage Details...");
  }
}
const isFileCoverage = (c) => typeof c === "object" && "value" in c;
const isDeclarationCoverage = (c) => c instanceof DeclarationCoverageNode;
const shouldShowDeclDetailsOnExpand = (c) => isFileCoverage(c) && c.value instanceof FileCoverage && !!c.value.declaration?.total;
let TestCoverageTree = class extends Disposable {
  constructor(container, labels, sortOrder, instantiationService, editorService, commandService) {
    super();
    this.inputDisposables = this._register(new DisposableStore());
    container.classList.add("testing-stdtree");
    this.tree = instantiationService.createInstance(
      WorkbenchCompressibleObjectTree,
      "TestCoverageView",
      container,
      new TestCoverageTreeListDelegate(),
      [
        instantiationService.createInstance(FileCoverageRenderer, labels),
        instantiationService.createInstance(DeclarationCoverageRenderer),
        instantiationService.createInstance(BasicRenderer),
        instantiationService.createInstance(CurrentlyFilteredToRenderer)
      ],
      {
        expandOnlyOnTwistieClick: true,
        sorter: new Sorter(sortOrder),
        keyboardNavigationLabelProvider: {
          getCompressedNodeKeyboardNavigationLabel(elements) {
            return elements.map((e) => this.getKeyboardNavigationLabel(e)).join("/");
          },
          getKeyboardNavigationLabel(e) {
            return isFileCoverage(e) ? basenameOrAuthority(e.value.uri) : e.label;
          }
        },
        accessibilityProvider: {
          getAriaLabel(element) {
            if (isFileCoverage(element)) {
              const name = basenameOrAuthority(element.value.uri);
              return localize("testCoverageItemLabel", "{0} coverage: {0}%", name, (element.value.tpc * 100).toFixed(2));
            } else {
              return element.label;
            }
          },
          getWidgetAriaLabel() {
            return localize("testCoverageTreeLabel", "Test Coverage Explorer");
          }
        },
        identityProvider: new TestCoverageIdentityProvider()
      }
    );
    this._register(autorun((reader) => {
      sortOrder.read(reader);
      this.tree.resort(null, true);
    }));
    this._register(this.tree);
    this._register(this.tree.onDidChangeCollapseState((e) => {
      const el = e.node.element;
      if (!e.node.collapsed && !e.node.children.length && el && shouldShowDeclDetailsOnExpand(el)) {
        if (el.value.hasSynchronousDetails) {
          this.tree.setChildren(el, [{ element: new LoadingDetails(), incompressible: true }]);
        }
        el.value.details().then((details) => this.updateWithDetails(el, details));
      }
    }));
    this._register(this.tree.onDidOpen((e) => {
      let resource;
      let selection;
      if (e.element) {
        if (isFileCoverage(e.element) && !e.element.children?.size) {
          resource = e.element.value.uri;
        } else if (isDeclarationCoverage(e.element)) {
          resource = e.element.uri;
          selection = e.element.location;
        } else if (e.element instanceof CurrentlyFilteredTo) {
          commandService.executeCommand(TestCommandId.CoverageFilterToTest);
          return;
        }
      }
      if (!resource) {
        return;
      }
      editorService.openEditor({
        resource,
        options: {
          selection: selection instanceof Position ? Range.fromPositions(selection, selection) : selection,
          revealIfOpened: true,
          selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport,
          preserveFocus: e.editorOptions.preserveFocus,
          pinned: e.editorOptions.pinned,
          source: EditorOpenSource.USER
        }
      }, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
    }));
  }
  setInput(coverage, showOnlyTest) {
    this.inputDisposables.clear();
    let tree = coverage.tree;
    if (showOnlyTest) {
      tree = coverage.filterTreeForTest(showOnlyTest);
    }
    const files = [];
    for (let node of tree.nodes) {
      while (!(node.value instanceof FileCoverage) && node.children?.size === 1) {
        node = Iterable.first(node.children.values());
      }
      files.push(node);
    }
    const toChild = (value) => {
      const isFile = !value.children?.size;
      return {
        element: value,
        incompressible: isFile,
        collapsed: isFile,
        // directories can be expanded, and items with function info can be expanded
        collapsible: !isFile || !!value.value?.declaration?.total,
        children: value.children && Iterable.map(value.children?.values(), toChild)
      };
    };
    this.inputDisposables.add(onObservableChange(coverage.didAddCoverage, (nodes) => {
      const toRender = findLast(nodes, (n) => this.tree.hasElement(n));
      if (toRender) {
        this.tree.setChildren(
          toRender,
          Iterable.map(toRender.children?.values() || [], toChild),
          { diffIdentityProvider: { getId: (el) => el.value.id } }
        );
      }
    }));
    let children = Iterable.map(files, toChild);
    const filteredTo = showOnlyTest && coverage.result.getTestById(showOnlyTest.toString());
    if (filteredTo) {
      children = Iterable.concat(
        Iterable.single({
          element: new CurrentlyFilteredTo(filteredTo),
          incompressible: true
        }),
        children
      );
    }
    this.tree.setChildren(null, children);
  }
  layout(height, width) {
    this.tree.layout(height, width);
  }
  collapseAll() {
    this.tree.collapseAll();
  }
  updateWithDetails(el, details) {
    if (!this.tree.hasElement(el)) {
      return;
    }
    const decl = [];
    for (const fn of details) {
      if (fn.type !== DetailType.Declaration) {
        continue;
      }
      let arr = decl;
      while (true) {
        const parent = arr.find((p) => p.containedDetails.has(fn));
        if (parent) {
          arr = parent.children;
        } else {
          break;
        }
      }
      arr.push(new DeclarationCoverageNode(el.value.uri, fn, details));
    }
    const makeChild = (fn) => ({
      element: fn,
      incompressible: true,
      collapsed: true,
      collapsible: fn.children.length > 0,
      children: fn.children.map(makeChild)
    });
    this.tree.setChildren(el, decl.map(makeChild));
  }
};
TestCoverageTree = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, ICommandService)
], TestCoverageTree);
class TestCoverageTreeListDelegate {
  getHeight(element) {
    return 22;
  }
  getTemplateId(element) {
    if (isFileCoverage(element)) {
      return FileCoverageRenderer.ID;
    }
    if (isDeclarationCoverage(element)) {
      return DeclarationCoverageRenderer.ID;
    }
    if (element instanceof LoadingDetails || element instanceof RevealUncoveredDeclarations) {
      return BasicRenderer.ID;
    }
    if (element instanceof CurrentlyFilteredTo) {
      return CurrentlyFilteredToRenderer.ID;
    }
    assertNever(element);
  }
}
class Sorter {
  constructor(order) {
    this.order = order;
  }
  compare(a, b) {
    const order = this.order.get();
    if (isFileCoverage(a) && isFileCoverage(b)) {
      switch (order) {
        case 1 /* Location */:
        case 2 /* Name */:
          return a.value.uri.toString().localeCompare(b.value.uri.toString());
        case 0 /* Coverage */:
          return b.value.tpc - a.value.tpc;
      }
    } else if (isDeclarationCoverage(a) && isDeclarationCoverage(b)) {
      switch (order) {
        case 1 /* Location */:
          return Position.compare(
            a.location instanceof Range ? a.location.getStartPosition() : a.location,
            b.location instanceof Range ? b.location.getStartPosition() : b.location
          );
        case 2 /* Name */:
          return a.label.localeCompare(b.label);
        case 0 /* Coverage */: {
          const attrA = a.tpc;
          const attrB = b.tpc;
          return attrA !== void 0 && attrB !== void 0 && attrB - attrA || +b.hits - +a.hits || a.label.localeCompare(b.label);
        }
      }
    } else {
      return 0;
    }
  }
}
let CurrentlyFilteredToRenderer = class {
  constructor(menuService, contextKeyService) {
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.templateId = CurrentlyFilteredToRenderer.ID;
  }
  renderCompressedElements(node, index, templateData) {
    this.renderInner(node.element.elements[node.element.elements.length - 1], templateData);
  }
  renderTemplate(container) {
    container.classList.add("testing-stdtree-container");
    const label = dom.append(container, dom.$(".label"));
    const menu = this.menuService.getMenuActions(MenuId.TestCoverageFilterItem, this.contextKeyService, {
      shouldForwardArgs: true
    });
    const actions = new ActionBar(container);
    actions.push(getActionBarActions(menu, "inline").primary, { icon: true, label: false });
    actions.domNode.style.display = "block";
    return { label, actions };
  }
  renderElement(element, index, templateData) {
    this.renderInner(element.element, templateData);
  }
  disposeTemplate(templateData) {
    templateData.actions.dispose();
  }
  renderInner(element, container) {
    container.label.innerText = element.label;
  }
};
CurrentlyFilteredToRenderer.ID = "C";
CurrentlyFilteredToRenderer = __decorateClass([
  __decorateParam(0, IMenuService),
  __decorateParam(1, IContextKeyService)
], CurrentlyFilteredToRenderer);
let FileCoverageRenderer = class {
  constructor(labels, labelService, instantiationService) {
    this.labels = labels;
    this.labelService = labelService;
    this.instantiationService = instantiationService;
    this.templateId = FileCoverageRenderer.ID;
  }
  /** @inheritdoc */
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    container.classList.add("testing-stdtree-container", "test-coverage-list-item");
    return {
      container,
      bars: templateDisposables.add(this.instantiationService.createInstance(ManagedTestCoverageBars, { compact: false, container })),
      label: templateDisposables.add(this.labels.create(container, {
        supportHighlights: true
      })),
      elementsDisposables: templateDisposables.add(new DisposableStore()),
      templateDisposables
    };
  }
  /** @inheritdoc */
  renderElement(node, _index, templateData) {
    this.doRender(node.element, templateData, node.filterData);
  }
  /** @inheritdoc */
  renderCompressedElements(node, _index, templateData) {
    this.doRender(node.element.elements, templateData, node.filterData);
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
  /** @inheritdoc */
  doRender(element, templateData, filterData) {
    templateData.elementsDisposables.clear();
    const stat = element instanceof Array ? element[element.length - 1] : element;
    const file = stat.value;
    const name = element instanceof Array ? element.map((e) => basenameOrAuthority(e.value.uri)) : basenameOrAuthority(file.uri);
    if (file instanceof BypassedFileCoverage) {
      templateData.bars.setCoverageInfo(void 0);
    } else {
      templateData.elementsDisposables.add(autorun((reader) => {
        stat.value?.didChange.read(reader);
        templateData.bars.setCoverageInfo(file);
      }));
      templateData.bars.setCoverageInfo(file);
    }
    templateData.label.setResource({ resource: file.uri, name }, {
      fileKind: stat.children?.size ? FileKind.FOLDER : FileKind.FILE,
      matches: createMatches(filterData),
      separator: this.labelService.getSeparator(file.uri.scheme, file.uri.authority),
      extraClasses: ["label"]
    });
  }
};
FileCoverageRenderer.ID = "F";
FileCoverageRenderer = __decorateClass([
  __decorateParam(1, ILabelService),
  __decorateParam(2, IInstantiationService)
], FileCoverageRenderer);
let DeclarationCoverageRenderer = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
    this.templateId = DeclarationCoverageRenderer.ID;
  }
  /** @inheritdoc */
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    container.classList.add("test-coverage-list-item", "testing-stdtree-container");
    const icon = dom.append(container, dom.$(".state"));
    const label = dom.append(container, dom.$(".label"));
    return {
      container,
      bars: templateDisposables.add(this.instantiationService.createInstance(ManagedTestCoverageBars, { compact: false, container })),
      templateDisposables,
      icon,
      label
    };
  }
  /** @inheritdoc */
  renderElement(node, _index, templateData) {
    this.doRender(node.element, templateData, node.filterData);
  }
  /** @inheritdoc */
  renderCompressedElements(node, _index, templateData) {
    this.doRender(node.element.elements[node.element.elements.length - 1], templateData, node.filterData);
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
  /** @inheritdoc */
  doRender(element, templateData, _filterData) {
    const covered = !!element.hits;
    const icon = covered ? testingWasCovered : testingStatesToIcons.get(TestResultState.Unset);
    templateData.container.classList.toggle("not-covered", !covered);
    templateData.icon.className = `computed-state ${ThemeIcon.asClassName(icon)}`;
    templateData.label.innerText = element.label;
    templateData.bars.setCoverageInfo(element.attributableCoverage());
  }
};
DeclarationCoverageRenderer.ID = "N";
DeclarationCoverageRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService)
], DeclarationCoverageRenderer);
const _BasicRenderer = class _BasicRenderer {
  constructor() {
    this.templateId = _BasicRenderer.ID;
  }
  renderCompressedElements(node, _index, container) {
    this.renderInner(node.element.elements[node.element.elements.length - 1], container);
  }
  renderTemplate(container) {
    return container;
  }
  renderElement(node, index, container) {
    this.renderInner(node.element, container);
  }
  disposeTemplate() {
  }
  renderInner(element, container) {
    container.innerText = element.label;
  }
};
_BasicRenderer.ID = "B";
let BasicRenderer = _BasicRenderer;
class TestCoverageIdentityProvider {
  getId(element) {
    return isFileCoverage(element) ? element.value.uri.toString() : element.id;
  }
}
registerAction2(class TestCoverageChangePerTestFilterAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CoverageFilterToTest,
      category: Categories.Test,
      title: localize2("testing.changeCoverageFilter", "Filter Coverage by Test"),
      icon: Codicon.filter,
      toggled: {
        icon: Codicon.filterFilled,
        condition: TestingContextKeys.isCoverageFilteredToTest
      },
      menu: [
        { id: MenuId.CommandPalette, when: TestingContextKeys.hasPerTestCoverage },
        { id: MenuId.TestCoverageFilterItem, group: "inline" },
        {
          id: MenuId.ViewTitle,
          when: ContextKeyExpr.and(TestingContextKeys.hasPerTestCoverage, ContextKeyExpr.equals("view", Testing.CoverageViewId)),
          group: "navigation"
        }
      ]
    });
  }
  run(accessor) {
    const coverageService = accessor.get(ITestCoverageService);
    const quickInputService = accessor.get(IQuickInputService);
    const coverage = coverageService.selected.get();
    if (!coverage) {
      return;
    }
    const tests = [...coverage.allPerTestIDs()].map(TestId.fromString);
    const commonPrefix = TestId.getLengthOfCommonPrefix(tests.length, (i) => tests[i]);
    const result = coverage.result;
    const previousSelection = coverageService.filterToTest.get();
    const previousSelectionStr = previousSelection?.toString();
    const items = [
      { label: coverUtils.labels.allTests, id: void 0 },
      { type: "separator" },
      ...tests.map((testId) => ({ ...coverUtils.getLabelForItem(result, testId, commonPrefix), testId }))
    ];
    quickInputService.pick(items, {
      activeItem: items.find((item) => "testId" in item && item.testId?.toString() === previousSelectionStr),
      placeHolder: coverUtils.labels.pickShowCoverage,
      onDidFocus: (entry) => {
        coverageService.filterToTest.set(entry.testId, void 0);
      }
    }).then((selected) => {
      coverageService.filterToTest.set(selected ? selected.testId : previousSelection, void 0);
    });
  }
});
registerAction2(class TestCoverageChangeSortingAction extends ViewAction {
  constructor() {
    super({
      id: TestCommandId.CoverageViewChangeSorting,
      viewId: Testing.CoverageViewId,
      title: localize2("testing.changeCoverageSort", "Change Sort Order"),
      icon: Codicon.sortPrecedence,
      menu: {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.equals("view", Testing.CoverageViewId),
        group: "navigation",
        order: 1
      }
    });
  }
  runInView(accessor, view) {
    const disposables = new DisposableStore();
    const quickInput = disposables.add(accessor.get(IQuickInputService).createQuickPick());
    const items = [
      { label: localize("testing.coverageSortByLocation", "Sort by Location"), value: 1 /* Location */, description: localize("testing.coverageSortByLocationDescription", "Files are sorted alphabetically, declarations are sorted by position") },
      { label: localize("testing.coverageSortByCoverage", "Sort by Coverage"), value: 0 /* Coverage */, description: localize("testing.coverageSortByCoverageDescription", "Files and declarations are sorted by total coverage") },
      { label: localize("testing.coverageSortByName", "Sort by Name"), value: 2 /* Name */, description: localize("testing.coverageSortByNameDescription", "Files and declarations are sorted alphabetically") }
    ];
    quickInput.placeholder = localize("testing.coverageSortPlaceholder", "Sort the Test Coverage view...");
    quickInput.items = items;
    quickInput.show();
    disposables.add(quickInput.onDidHide(() => disposables.dispose()));
    disposables.add(quickInput.onDidAccept(() => {
      const picked = quickInput.selectedItems[0]?.value;
      if (picked !== void 0) {
        view.sortOrder.set(picked, void 0);
        quickInput.dispose();
      }
    }));
  }
});
registerAction2(class TestCoverageCollapseAllAction extends ViewAction {
  constructor() {
    super({
      id: TestCommandId.CoverageViewCollapseAll,
      viewId: Testing.CoverageViewId,
      title: localize2("testing.coverageCollapseAll", "Collapse All Coverage"),
      icon: Codicon.collapseAll,
      menu: {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.equals("view", Testing.CoverageViewId),
        group: "navigation",
        order: 2
      }
    });
  }
  runInView(_accessor, view) {
    view.collapseAll();
  }
});
export {
  TestCoverageView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlc3RpbmcvYnJvd3Nlci90ZXN0Q292ZXJhZ2VWaWV3LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgSUlkZW50aXR5UHJvdmlkZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJQ29tcHJlc3NlZFRyZWVFbGVtZW50LCBJQ29tcHJlc3NlZFRyZWVOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvY29tcHJlc3NlZE9iamVjdFRyZWVNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvb2JqZWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBJVHJlZU5vZGUsIElUcmVlU29ydGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBmaW5kTGFzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5c0ZpbmQuanMnO1xuaW1wb3J0IHsgYXNzZXJ0TmV2ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3NlcnQuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IG1lbW9pemUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IEZ1enp5U2NvcmUsIGNyZWF0ZU1hdGNoZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgYXV0b3J1biwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJUHJlZml4VHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wcmVmaXhUcmVlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lT3JBdXRob3JpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSwgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IENhdGVnb3JpZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb24vY29tbW9uL2FjdGlvbkNvbW1vbkNhdGVnb3JpZXMuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aW9uQmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBJTWVudVNlcnZpY2UsIE1lbnVJZCwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JPcGVuU291cmNlLCBUZXh0RWRpdG9yU2VsZWN0aW9uUmV2ZWFsVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IEZpbGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSwgU2VydmljZXNBY2Nlc3NvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IFdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgUXVpY2tQaWNrSW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElSZXNvdXJjZUxhYmVsLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IElWaWV3UGFuZU9wdGlvbnMsIFZpZXdBY3Rpb24sIFZpZXdQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENvbW1hbmRJZCwgVGVzdGluZyB9IGZyb20gJy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgb25PYnNlcnZhYmxlQ2hhbmdlIH0gZnJvbSAnLi4vY29tbW9uL29ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBCeXBhc3NlZEZpbGVDb3ZlcmFnZSwgQ29tcHV0ZWRGaWxlQ292ZXJhZ2UsIEZpbGVDb3ZlcmFnZSwgVGVzdENvdmVyYWdlLCBnZXRUb3RhbENvdmVyYWdlUGVyY2VudCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0Q292ZXJhZ2UuanMnO1xuaW1wb3J0IHsgSVRlc3RDb3ZlcmFnZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdGVzdENvdmVyYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SWQgfSBmcm9tICcuLi9jb21tb24vdGVzdElkLmpzJztcbmltcG9ydCB7IFRlc3RpbmdDb250ZXh0S2V5cyB9IGZyb20gJy4uL2NvbW1vbi90ZXN0aW5nQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgQ292ZXJhZ2VEZXRhaWxzLCBEZXRhaWxUeXBlLCBJQ292ZXJhZ2VDb3VudCwgSURlY2xhcmF0aW9uQ292ZXJhZ2UsIElUZXN0SXRlbSwgVGVzdFJlc3VsdFN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RUeXBlcy5qcyc7XG5pbXBvcnQgKiBhcyBjb3ZlclV0aWxzIGZyb20gJy4vY29kZUNvdmVyYWdlRGlzcGxheVV0aWxzLmpzJztcbmltcG9ydCB7IHRlc3RpbmdTdGF0ZXNUb0ljb25zLCB0ZXN0aW5nV2FzQ292ZXJlZCB9IGZyb20gJy4vaWNvbnMuanMnO1xuaW1wb3J0IHsgQ292ZXJhZ2VCYXJTb3VyY2UsIE1hbmFnZWRUZXN0Q292ZXJhZ2VCYXJzIH0gZnJvbSAnLi90ZXN0Q292ZXJhZ2VCYXJzLmpzJztcblxuY29uc3QgZW51bSBDb3ZlcmFnZVNvcnRPcmRlciB7XG5cdENvdmVyYWdlLFxuXHRMb2NhdGlvbixcblx0TmFtZSxcbn1cblxuZXhwb3J0IGNsYXNzIFRlc3RDb3ZlcmFnZVZpZXcgZXh0ZW5kcyBWaWV3UGFuZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgdHJlZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxUZXN0Q292ZXJhZ2VUcmVlPigpKTtcblx0cHVibGljIHJlYWRvbmx5IHNvcnRPcmRlciA9IG9ic2VydmFibGVWYWx1ZSgnc29ydE9yZGVyJywgQ292ZXJhZ2VTb3J0T3JkZXIuTG9jYXRpb24pO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdG9wdGlvbnM6IElWaWV3UGFuZU9wdGlvbnMsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIHZpZXdEZXNjcmlwdG9yU2VydmljZTogSVZpZXdEZXNjcmlwdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIG9wZW5lclNlcnZpY2U6IElPcGVuZXJTZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElUZXN0Q292ZXJhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY292ZXJhZ2VTZXJ2aWNlOiBJVGVzdENvdmVyYWdlU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIob3B0aW9ucywga2V5YmluZGluZ1NlcnZpY2UsIGNvbnRleHRNZW51U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UsIGNvbnRleHRLZXlTZXJ2aWNlLCB2aWV3RGVzY3JpcHRvclNlcnZpY2UsIGluc3RhbnRpYXRpb25TZXJ2aWNlLCBvcGVuZXJTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGhvdmVyU2VydmljZSk7XG5cdFx0Y29uc3Qgc3RvcmVkT3JkZXIgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlLmdldE51bWJlcigndGVzdGluZy5jb3ZlcmFnZVNvcnRPcmRlcicsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UpO1xuXHRcdGlmIChzdG9yZWRPcmRlciAhPT0gdW5kZWZpbmVkICYmIHN0b3JlZE9yZGVyID49IENvdmVyYWdlU29ydE9yZGVyLkNvdmVyYWdlICYmIHN0b3JlZE9yZGVyIDw9IENvdmVyYWdlU29ydE9yZGVyLk5hbWUpIHtcblx0XHRcdHRoaXMuc29ydE9yZGVyLnNldChzdG9yZWRPcmRlciwgdW5kZWZpbmVkKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShjb250YWluZXIpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgb3JkZXIgPSB0aGlzLnNvcnRPcmRlci5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCd0ZXN0aW5nLmNvdmVyYWdlU29ydE9yZGVyJywgb3JkZXIsIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgbGFiZWxzID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVscywgeyBvbkRpZENoYW5nZVZpc2liaWxpdHk6IHRoaXMub25EaWRDaGFuZ2VCb2R5VmlzaWJpbGl0eSB9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjb3ZlcmFnZSA9IHRoaXMuY292ZXJhZ2VTZXJ2aWNlLnNlbGVjdGVkLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChjb3ZlcmFnZSkge1xuXHRcdFx0XHRjb25zdCB0ID0gKHRoaXMudHJlZS52YWx1ZSA/Pz0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0Q292ZXJhZ2VUcmVlLCBjb250YWluZXIsIGxhYmVscywgdGhpcy5zb3J0T3JkZXIpKTtcblx0XHRcdFx0dC5zZXRJbnB1dChjb3ZlcmFnZSwgdGhpcy5jb3ZlcmFnZVNlcnZpY2UuZmlsdGVyVG9UZXN0LnJlYWQocmVhZGVyKSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnRyZWUuY2xlYXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy50cmVlLnZhbHVlPy5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRwdWJsaWMgY29sbGFwc2VBbGwoKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLnZhbHVlPy5jb2xsYXBzZUFsbCgpO1xuXHR9XG59XG5cbmxldCBmbk5vZGVJZCA9IDA7XG5cbmNsYXNzIERlY2xhcmF0aW9uQ292ZXJhZ2VOb2RlIHtcblx0cHVibGljIHJlYWRvbmx5IGlkID0gU3RyaW5nKGZuTm9kZUlkKyspO1xuXHRwdWJsaWMgcmVhZG9ubHkgY29udGFpbmVkRGV0YWlscyA9IG5ldyBTZXQ8Q292ZXJhZ2VEZXRhaWxzPigpO1xuXHRwdWJsaWMgcmVhZG9ubHkgY2hpbGRyZW46IERlY2xhcmF0aW9uQ292ZXJhZ2VOb2RlW10gPSBbXTtcblxuXHRwdWJsaWMgZ2V0IGhpdHMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZGF0YS5jb3VudDtcblx0fVxuXG5cdHB1YmxpYyBnZXQgbGFiZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuZGF0YS5uYW1lO1xuXHR9XG5cblx0cHVibGljIGdldCBsb2NhdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5kYXRhLmxvY2F0aW9uO1xuXHR9XG5cblx0cHVibGljIGdldCB0cGMoKSB7XG5cdFx0Y29uc3QgYXR0ciA9IHRoaXMuYXR0cmlidXRhYmxlQ292ZXJhZ2UoKTtcblx0XHRyZXR1cm4gYXR0ciAmJiBnZXRUb3RhbENvdmVyYWdlUGVyY2VudChhdHRyLnN0YXRlbWVudCwgYXR0ci5icmFuY2gsIHVuZGVmaW5lZCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgdXJpOiBVUkksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkYXRhOiBJRGVjbGFyYXRpb25Db3ZlcmFnZSxcblx0XHRkZXRhaWxzOiByZWFkb25seSBDb3ZlcmFnZURldGFpbHNbXSxcblx0KSB7XG5cdFx0aWYgKGRhdGEubG9jYXRpb24gaW5zdGFuY2VvZiBSYW5nZSkge1xuXHRcdFx0Zm9yIChjb25zdCBkZXRhaWwgb2YgZGV0YWlscykge1xuXHRcdFx0XHRpZiAodGhpcy5jb250YWlucyhkZXRhaWwubG9jYXRpb24pKSB7XG5cdFx0XHRcdFx0dGhpcy5jb250YWluZWREZXRhaWxzLmFkZChkZXRhaWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqIEdldHMgd2hldGhlciB0aGlzIGZ1bmN0aW9uIGhhcyBhIGRlZmluZWQgcmFuZ2UgYW5kIGNvbnRhaW5zIHRoZSBnaXZlbiByYW5nZS4gKi9cblx0cHVibGljIGNvbnRhaW5zKGxvY2F0aW9uOiBSYW5nZSB8IFBvc2l0aW9uKSB7XG5cdFx0Y29uc3Qgb3duID0gdGhpcy5kYXRhLmxvY2F0aW9uO1xuXHRcdHJldHVybiBvd24gaW5zdGFuY2VvZiBSYW5nZSAmJiAobG9jYXRpb24gaW5zdGFuY2VvZiBSYW5nZSA/IG93bi5jb250YWluc1JhbmdlKGxvY2F0aW9uKSA6IG93bi5jb250YWluc1Bvc2l0aW9uKGxvY2F0aW9uKSk7XG5cdH1cblxuXHQvKipcblx0ICogSWYgdGhlIGZ1bmN0aW9uIGRlZmluZXMgYSByYW5nZSwgd2UgY2FuIGxvb2sgYXQgc3RhdGVtZW50cyB3aXRoaW4gdGhlXG5cdCAqIGZ1bmN0aW9uIHRvIGdldCB0b3RhbCBjb3ZlcmFnZSBmb3IgdGhlIGZ1bmN0aW9uLCByYXRoZXIgdGhhbiBhIGJvb2xlYW5cblx0ICogeWVzL25vLlxuXHQgKi9cblx0QG1lbW9pemVcblx0cHVibGljIGF0dHJpYnV0YWJsZUNvdmVyYWdlKCkge1xuXHRcdGNvbnN0IHsgbG9jYXRpb24sIGNvdW50IH0gPSB0aGlzLmRhdGE7XG5cdFx0aWYgKCEobG9jYXRpb24gaW5zdGFuY2VvZiBSYW5nZSkgfHwgIWNvdW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdGVtZW50OiBJQ292ZXJhZ2VDb3VudCA9IHsgY292ZXJlZDogMCwgdG90YWw6IDAgfTtcblx0XHRjb25zdCBicmFuY2g6IElDb3ZlcmFnZUNvdW50ID0geyBjb3ZlcmVkOiAwLCB0b3RhbDogMCB9O1xuXHRcdGZvciAoY29uc3QgZGV0YWlsIG9mIHRoaXMuY29udGFpbmVkRGV0YWlscykge1xuXHRcdFx0aWYgKGRldGFpbC50eXBlICE9PSBEZXRhaWxUeXBlLlN0YXRlbWVudCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0c3RhdGVtZW50LmNvdmVyZWQgKz0gZGV0YWlsLmNvdW50ID8gMSA6IDA7XG5cdFx0XHRzdGF0ZW1lbnQudG90YWwrKztcblx0XHRcdGlmIChkZXRhaWwuYnJhbmNoZXMpIHtcblx0XHRcdFx0Zm9yIChjb25zdCB7IGNvdW50IH0gb2YgZGV0YWlsLmJyYW5jaGVzKSB7XG5cdFx0XHRcdFx0YnJhbmNoLmNvdmVyZWQgKz0gY291bnQgPyAxIDogMDtcblx0XHRcdFx0XHRicmFuY2gudG90YWwrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7IHN0YXRlbWVudCwgYnJhbmNoIH0gc2F0aXNmaWVzIENvdmVyYWdlQmFyU291cmNlO1xuXHR9XG59XG5cbmNsYXNzIFJldmVhbFVuY292ZXJlZERlY2xhcmF0aW9ucyB7XG5cdHB1YmxpYyByZWFkb25seSBpZCA9IFN0cmluZyhmbk5vZGVJZCsrKTtcblxuXHRwdWJsaWMgZ2V0IGxhYmVsKCkge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnZnVuY3Rpb25zV2l0aG91dENvdmVyYWdlJywgXCJ7MH0gZGVjbGFyYXRpb25zIHdpdGhvdXQgY292ZXJhZ2UuLi5cIiwgdGhpcy5uKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSBuOiBudW1iZXIpIHsgfVxufVxuXG5jbGFzcyBDdXJyZW50bHlGaWx0ZXJlZFRvIHtcblx0cHVibGljIHJlYWRvbmx5IGlkID0gU3RyaW5nKGZuTm9kZUlkKyspO1xuXG5cdHB1YmxpYyBnZXQgbGFiZWwoKSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdmaWx0ZXJlZFRvVGVzdCcsIFwiU2hvd2luZyBjb3ZlcmFnZSBmb3IgXFxcInswfVxcXCJcIiwgdGhpcy50ZXN0SXRlbS5sYWJlbCk7XG5cdH1cblxuXHRjb25zdHJ1Y3RvcihwdWJsaWMgcmVhZG9ubHkgdGVzdEl0ZW06IElUZXN0SXRlbSkgeyB9XG59XG5cbmNsYXNzIExvYWRpbmdEZXRhaWxzIHtcblx0cHVibGljIHJlYWRvbmx5IGlkID0gU3RyaW5nKGZuTm9kZUlkKyspO1xuXHRwdWJsaWMgcmVhZG9ubHkgbGFiZWwgPSBsb2NhbGl6ZSgnbG9hZGluZ0NvdmVyYWdlRGV0YWlscycsIFwiTG9hZGluZyBDb3ZlcmFnZSBEZXRhaWxzLi4uXCIpO1xufVxuXG4vKiogVHlwZSBvZiBub2RlcyByZXR1cm5lZCBmcm9tIHtAbGluayBUZXN0Q292ZXJhZ2V9LiBOb3RlOiB2YWx1ZSBpcyAqYWx3YXlzKiBkZWZpbmVkLiAqL1xudHlwZSBUZXN0Q292ZXJhZ2VGaWxlTm9kZSA9IElQcmVmaXhUcmVlTm9kZTxDb21wdXRlZEZpbGVDb3ZlcmFnZSB8IEZpbGVDb3ZlcmFnZT47XG50eXBlIENvdmVyYWdlVHJlZUVsZW1lbnQgPSBUZXN0Q292ZXJhZ2VGaWxlTm9kZSB8IERlY2xhcmF0aW9uQ292ZXJhZ2VOb2RlIHwgTG9hZGluZ0RldGFpbHMgfCBSZXZlYWxVbmNvdmVyZWREZWNsYXJhdGlvbnMgfCBDdXJyZW50bHlGaWx0ZXJlZFRvO1xuXG5jb25zdCBpc0ZpbGVDb3ZlcmFnZSA9IChjOiBDb3ZlcmFnZVRyZWVFbGVtZW50KTogYyBpcyBUZXN0Q292ZXJhZ2VGaWxlTm9kZSA9PiB0eXBlb2YgYyA9PT0gJ29iamVjdCcgJiYgJ3ZhbHVlJyBpbiBjO1xuY29uc3QgaXNEZWNsYXJhdGlvbkNvdmVyYWdlID0gKGM6IENvdmVyYWdlVHJlZUVsZW1lbnQpOiBjIGlzIERlY2xhcmF0aW9uQ292ZXJhZ2VOb2RlID0+IGMgaW5zdGFuY2VvZiBEZWNsYXJhdGlvbkNvdmVyYWdlTm9kZTtcbmNvbnN0IHNob3VsZFNob3dEZWNsRGV0YWlsc09uRXhwYW5kID0gKGM6IENvdmVyYWdlVHJlZUVsZW1lbnQpOiBjIGlzIElQcmVmaXhUcmVlTm9kZTxGaWxlQ292ZXJhZ2U+ID0+XG5cdGlzRmlsZUNvdmVyYWdlKGMpICYmIGMudmFsdWUgaW5zdGFuY2VvZiBGaWxlQ292ZXJhZ2UgJiYgISFjLnZhbHVlLmRlY2xhcmF0aW9uPy50b3RhbDtcblxuY2xhc3MgVGVzdENvdmVyYWdlVHJlZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IHRyZWU6IFdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWU8Q292ZXJhZ2VUcmVlRWxlbWVudCwgdm9pZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgaW5wdXREaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRsYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdHNvcnRPcmRlcjogSU9ic2VydmFibGU8Q292ZXJhZ2VTb3J0T3JkZXI+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Rlc3Rpbmctc3RkdHJlZScpO1xuXG5cdFx0dGhpcy50cmVlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRXb3JrYmVuY2hDb21wcmVzc2libGVPYmplY3RUcmVlPENvdmVyYWdlVHJlZUVsZW1lbnQsIHZvaWQ+LFxuXHRcdFx0J1Rlc3RDb3ZlcmFnZVZpZXcnLFxuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0bmV3IFRlc3RDb3ZlcmFnZVRyZWVMaXN0RGVsZWdhdGUoKSxcblx0XHRcdFtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZUNvdmVyYWdlUmVuZGVyZXIsIGxhYmVscyksXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERlY2xhcmF0aW9uQ292ZXJhZ2VSZW5kZXJlciksXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJhc2ljUmVuZGVyZXIpLFxuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDdXJyZW50bHlGaWx0ZXJlZFRvUmVuZGVyZXIpLFxuXHRcdFx0XSxcblx0XHRcdHtcblx0XHRcdFx0ZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrOiB0cnVlLFxuXHRcdFx0XHRzb3J0ZXI6IG5ldyBTb3J0ZXIoc29ydE9yZGVyKSxcblx0XHRcdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldENvbXByZXNzZWROb2RlS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWwoZWxlbWVudHM6IENvdmVyYWdlVHJlZUVsZW1lbnRbXSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnRzLm1hcChlID0+IHRoaXMuZ2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWwoZSkpLmpvaW4oJy8nKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsKGU6IENvdmVyYWdlVHJlZUVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBpc0ZpbGVDb3ZlcmFnZShlKVxuXHRcdFx0XHRcdFx0XHQ/IGJhc2VuYW1lT3JBdXRob3JpdHkoZS52YWx1ZSEudXJpKVxuXHRcdFx0XHRcdFx0XHQ6IGUubGFiZWw7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0QXJpYUxhYmVsKGVsZW1lbnQ6IENvdmVyYWdlVHJlZUVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdGlmIChpc0ZpbGVDb3ZlcmFnZShlbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBuYW1lID0gYmFzZW5hbWVPckF1dGhvcml0eShlbGVtZW50LnZhbHVlIS51cmkpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rlc3RDb3ZlcmFnZUl0ZW1MYWJlbCcsIFwiezB9IGNvdmVyYWdlOiB7MH0lXCIsIG5hbWUsIChlbGVtZW50LnZhbHVlIS50cGMgKiAxMDApLnRvRml4ZWQoMikpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQubGFiZWw7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWwoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ3Rlc3RDb3ZlcmFnZVRyZWVMYWJlbCcsIFwiVGVzdCBDb3ZlcmFnZSBFeHBsb3JlclwiKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IG5ldyBUZXN0Q292ZXJhZ2VJZGVudGl0eVByb3ZpZGVyKCksXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHNvcnRPcmRlci5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLnRyZWUucmVzb3J0KG51bGwsIHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlLm9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZShlID0+IHtcblx0XHRcdGNvbnN0IGVsID0gZS5ub2RlLmVsZW1lbnQ7XG5cdFx0XHRpZiAoIWUubm9kZS5jb2xsYXBzZWQgJiYgIWUubm9kZS5jaGlsZHJlbi5sZW5ndGggJiYgZWwgJiYgc2hvdWxkU2hvd0RlY2xEZXRhaWxzT25FeHBhbmQoZWwpKSB7XG5cdFx0XHRcdGlmIChlbC52YWx1ZSEuaGFzU3luY2hyb25vdXNEZXRhaWxzKSB7XG5cdFx0XHRcdFx0dGhpcy50cmVlLnNldENoaWxkcmVuKGVsLCBbeyBlbGVtZW50OiBuZXcgTG9hZGluZ0RldGFpbHMoKSwgaW5jb21wcmVzc2libGU6IHRydWUgfV0pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZWwudmFsdWUhLmRldGFpbHMoKS50aGVuKGRldGFpbHMgPT4gdGhpcy51cGRhdGVXaXRoRGV0YWlscyhlbCwgZGV0YWlscykpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRPcGVuKGUgPT4ge1xuXHRcdFx0bGV0IHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgc2VsZWN0aW9uOiBSYW5nZSB8IFBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGUuZWxlbWVudCkge1xuXHRcdFx0XHRpZiAoaXNGaWxlQ292ZXJhZ2UoZS5lbGVtZW50KSAmJiAhZS5lbGVtZW50LmNoaWxkcmVuPy5zaXplKSB7XG5cdFx0XHRcdFx0cmVzb3VyY2UgPSBlLmVsZW1lbnQudmFsdWUhLnVyaTtcblx0XHRcdFx0fSBlbHNlIGlmIChpc0RlY2xhcmF0aW9uQ292ZXJhZ2UoZS5lbGVtZW50KSkge1xuXHRcdFx0XHRcdHJlc291cmNlID0gZS5lbGVtZW50LnVyaTtcblx0XHRcdFx0XHRzZWxlY3Rpb24gPSBlLmVsZW1lbnQubG9jYXRpb247XG5cdFx0XHRcdH0gZWxzZSBpZiAoZS5lbGVtZW50IGluc3RhbmNlb2YgQ3VycmVudGx5RmlsdGVyZWRUbykge1xuXHRcdFx0XHRcdGNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFRlc3RDb21tYW5kSWQuQ292ZXJhZ2VGaWx0ZXJUb1Rlc3QpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRvcHRpb25zOiB7XG5cdFx0XHRcdFx0c2VsZWN0aW9uOiBzZWxlY3Rpb24gaW5zdGFuY2VvZiBQb3NpdGlvbiA/IFJhbmdlLmZyb21Qb3NpdGlvbnMoc2VsZWN0aW9uLCBzZWxlY3Rpb24pIDogc2VsZWN0aW9uLFxuXHRcdFx0XHRcdHJldmVhbElmT3BlbmVkOiB0cnVlLFxuXHRcdFx0XHRcdHNlbGVjdGlvblJldmVhbFR5cGU6IFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlLk5lYXJUb3BJZk91dHNpZGVWaWV3cG9ydCxcblx0XHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiBlLmVkaXRvck9wdGlvbnMucHJlc2VydmVGb2N1cyxcblx0XHRcdFx0XHRwaW5uZWQ6IGUuZWRpdG9yT3B0aW9ucy5waW5uZWQsXG5cdFx0XHRcdFx0c291cmNlOiBFZGl0b3JPcGVuU291cmNlLlVTRVIsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LCBlLnNpZGVCeVNpZGUgPyBTSURFX0dST1VQIDogQUNUSVZFX0dST1VQKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwdWJsaWMgc2V0SW5wdXQoY292ZXJhZ2U6IFRlc3RDb3ZlcmFnZSwgc2hvd09ubHlUZXN0PzogVGVzdElkKSB7XG5cdFx0dGhpcy5pbnB1dERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRsZXQgdHJlZSA9IGNvdmVyYWdlLnRyZWU7XG5cblx0XHQvLyBGaWx0ZXIgdG8gb25seSBhIHRlc3QsIGdlbmVyYXRlIGEgbmV3IHRyZWUgd2l0aCBvbmx5IHRob3NlIGl0ZW1zIHNlbGVjdGVkXG5cdFx0aWYgKHNob3dPbmx5VGVzdCkge1xuXHRcdFx0dHJlZSA9IGNvdmVyYWdlLmZpbHRlclRyZWVGb3JUZXN0KHNob3dPbmx5VGVzdCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZmlsZXM6IFRlc3RDb3ZlcmFnZUZpbGVOb2RlW10gPSBbXTtcblx0XHRmb3IgKGxldCBub2RlIG9mIHRyZWUubm9kZXMpIHtcblx0XHRcdC8vIHdoZW4gc2hvd2luZyBpbml0aWFsIGNoaWxkcmVuLCBvbmx5IHNob3cgZnJvbSB0aGUgZmlyc3QgZmlsZSBvciB0ZWVcblx0XHRcdHdoaWxlICghKG5vZGUudmFsdWUgaW5zdGFuY2VvZiBGaWxlQ292ZXJhZ2UpICYmIG5vZGUuY2hpbGRyZW4/LnNpemUgPT09IDEpIHtcblx0XHRcdFx0bm9kZSA9IEl0ZXJhYmxlLmZpcnN0KG5vZGUuY2hpbGRyZW4udmFsdWVzKCkpITtcblx0XHRcdH1cblx0XHRcdGZpbGVzLnB1c2gobm9kZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdG9DaGlsZCA9ICh2YWx1ZTogVGVzdENvdmVyYWdlRmlsZU5vZGUpOiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PENvdmVyYWdlVHJlZUVsZW1lbnQ+ID0+IHtcblx0XHRcdGNvbnN0IGlzRmlsZSA9ICF2YWx1ZS5jaGlsZHJlbj8uc2l6ZTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGVsZW1lbnQ6IHZhbHVlLFxuXHRcdFx0XHRpbmNvbXByZXNzaWJsZTogaXNGaWxlLFxuXHRcdFx0XHRjb2xsYXBzZWQ6IGlzRmlsZSxcblx0XHRcdFx0Ly8gZGlyZWN0b3JpZXMgY2FuIGJlIGV4cGFuZGVkLCBhbmQgaXRlbXMgd2l0aCBmdW5jdGlvbiBpbmZvIGNhbiBiZSBleHBhbmRlZFxuXHRcdFx0XHRjb2xsYXBzaWJsZTogIWlzRmlsZSB8fCAhIXZhbHVlLnZhbHVlPy5kZWNsYXJhdGlvbj8udG90YWwsXG5cdFx0XHRcdGNoaWxkcmVuOiB2YWx1ZS5jaGlsZHJlbiAmJiBJdGVyYWJsZS5tYXAodmFsdWUuY2hpbGRyZW4/LnZhbHVlcygpLCB0b0NoaWxkKVxuXHRcdFx0fTtcblx0XHR9O1xuXG5cdFx0dGhpcy5pbnB1dERpc3Bvc2FibGVzLmFkZChvbk9ic2VydmFibGVDaGFuZ2UoY292ZXJhZ2UuZGlkQWRkQ292ZXJhZ2UsIG5vZGVzID0+IHtcblx0XHRcdGNvbnN0IHRvUmVuZGVyID0gZmluZExhc3Qobm9kZXMsIG4gPT4gdGhpcy50cmVlLmhhc0VsZW1lbnQobikpO1xuXHRcdFx0aWYgKHRvUmVuZGVyKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5zZXRDaGlsZHJlbihcblx0XHRcdFx0XHR0b1JlbmRlcixcblx0XHRcdFx0XHRJdGVyYWJsZS5tYXAodG9SZW5kZXIuY2hpbGRyZW4/LnZhbHVlcygpIHx8IFtdLCB0b0NoaWxkKSxcblx0XHRcdFx0XHR7IGRpZmZJZGVudGl0eVByb3ZpZGVyOiB7IGdldElkOiBlbCA9PiAoZWwgYXMgVGVzdENvdmVyYWdlRmlsZU5vZGUpLnZhbHVlIS5pZCB9IH1cblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRsZXQgY2hpbGRyZW4gPSBJdGVyYWJsZS5tYXAoZmlsZXMsIHRvQ2hpbGQpO1xuXHRcdGNvbnN0IGZpbHRlcmVkVG8gPSBzaG93T25seVRlc3QgJiYgY292ZXJhZ2UucmVzdWx0LmdldFRlc3RCeUlkKHNob3dPbmx5VGVzdC50b1N0cmluZygpKTtcblx0XHRpZiAoZmlsdGVyZWRUbykge1xuXHRcdFx0Y2hpbGRyZW4gPSBJdGVyYWJsZS5jb25jYXQoXG5cdFx0XHRcdEl0ZXJhYmxlLnNpbmdsZTxJQ29tcHJlc3NlZFRyZWVFbGVtZW50PENvdmVyYWdlVHJlZUVsZW1lbnQ+Pih7XG5cdFx0XHRcdFx0ZWxlbWVudDogbmV3IEN1cnJlbnRseUZpbHRlcmVkVG8oZmlsdGVyZWRUbyksXG5cdFx0XHRcdFx0aW5jb21wcmVzc2libGU6IHRydWUsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRjaGlsZHJlbixcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0dGhpcy50cmVlLnNldENoaWxkcmVuKG51bGwsIGNoaWxkcmVuKTtcblx0fVxuXG5cdHB1YmxpYyBsYXlvdXQoaGVpZ2h0OiBudW1iZXIsIHdpZHRoOiBudW1iZXIpIHtcblx0XHR0aGlzLnRyZWUubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHR9XG5cblx0cHVibGljIGNvbGxhcHNlQWxsKCkge1xuXHRcdHRoaXMudHJlZS5jb2xsYXBzZUFsbCgpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVXaXRoRGV0YWlscyhlbDogSVByZWZpeFRyZWVOb2RlPEZpbGVDb3ZlcmFnZT4sIGRldGFpbHM6IHJlYWRvbmx5IENvdmVyYWdlRGV0YWlsc1tdKSB7XG5cdFx0aWYgKCF0aGlzLnRyZWUuaGFzRWxlbWVudChlbCkpIHtcblx0XHRcdHJldHVybjsgLy8gYXZvaWQgYW55IGlzc3VlcyBpZiB0aGUgdHJlZSBjaGFuZ2VzIGluIHRoZSBtZWFud2hpbGVcblx0XHR9XG5cblx0XHRjb25zdCBkZWNsOiBEZWNsYXJhdGlvbkNvdmVyYWdlTm9kZVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBmbiBvZiBkZXRhaWxzKSB7XG5cdFx0XHRpZiAoZm4udHlwZSAhPT0gRGV0YWlsVHlwZS5EZWNsYXJhdGlvbikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0bGV0IGFyciA9IGRlY2w7XG5cdFx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0XHRjb25zdCBwYXJlbnQgPSBhcnIuZmluZChwID0+IHAuY29udGFpbmVkRGV0YWlscy5oYXMoZm4pKTtcblx0XHRcdFx0aWYgKHBhcmVudCkge1xuXHRcdFx0XHRcdGFyciA9IHBhcmVudC5jaGlsZHJlbjtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRhcnIucHVzaChuZXcgRGVjbGFyYXRpb25Db3ZlcmFnZU5vZGUoZWwudmFsdWUhLnVyaSwgZm4sIGRldGFpbHMpKTtcblx0XHR9XG5cblx0XHRjb25zdCBtYWtlQ2hpbGQgPSAoZm46IERlY2xhcmF0aW9uQ292ZXJhZ2VOb2RlKTogSUNvbXByZXNzZWRUcmVlRWxlbWVudDxDb3ZlcmFnZVRyZWVFbGVtZW50PiA9PiAoe1xuXHRcdFx0ZWxlbWVudDogZm4sXG5cdFx0XHRpbmNvbXByZXNzaWJsZTogdHJ1ZSxcblx0XHRcdGNvbGxhcHNlZDogdHJ1ZSxcblx0XHRcdGNvbGxhcHNpYmxlOiBmbi5jaGlsZHJlbi5sZW5ndGggPiAwLFxuXHRcdFx0Y2hpbGRyZW46IGZuLmNoaWxkcmVuLm1hcChtYWtlQ2hpbGQpXG5cdFx0fSk7XG5cblx0XHR0aGlzLnRyZWUuc2V0Q2hpbGRyZW4oZWwsIGRlY2wubWFwKG1ha2VDaGlsZCkpO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RDb3ZlcmFnZVRyZWVMaXN0RGVsZWdhdGUgaW1wbGVtZW50cyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxDb3ZlcmFnZVRyZWVFbGVtZW50PiB7XG5cdGdldEhlaWdodChlbGVtZW50OiBDb3ZlcmFnZVRyZWVFbGVtZW50KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gMjI7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IENvdmVyYWdlVHJlZUVsZW1lbnQpOiBzdHJpbmcge1xuXHRcdGlmIChpc0ZpbGVDb3ZlcmFnZShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIEZpbGVDb3ZlcmFnZVJlbmRlcmVyLklEO1xuXHRcdH1cblx0XHRpZiAoaXNEZWNsYXJhdGlvbkNvdmVyYWdlKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gRGVjbGFyYXRpb25Db3ZlcmFnZVJlbmRlcmVyLklEO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIExvYWRpbmdEZXRhaWxzIHx8IGVsZW1lbnQgaW5zdGFuY2VvZiBSZXZlYWxVbmNvdmVyZWREZWNsYXJhdGlvbnMpIHtcblx0XHRcdHJldHVybiBCYXNpY1JlbmRlcmVyLklEO1xuXHRcdH1cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIEN1cnJlbnRseUZpbHRlcmVkVG8pIHtcblx0XHRcdHJldHVybiBDdXJyZW50bHlGaWx0ZXJlZFRvUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXHRcdGFzc2VydE5ldmVyKGVsZW1lbnQpO1xuXHR9XG59XG5cbmNsYXNzIFNvcnRlciBpbXBsZW1lbnRzIElUcmVlU29ydGVyPENvdmVyYWdlVHJlZUVsZW1lbnQ+IHtcblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBvcmRlcjogSU9ic2VydmFibGU8Q292ZXJhZ2VTb3J0T3JkZXI+KSB7IH1cblx0Y29tcGFyZShhOiBDb3ZlcmFnZVRyZWVFbGVtZW50LCBiOiBDb3ZlcmFnZVRyZWVFbGVtZW50KTogbnVtYmVyIHtcblx0XHRjb25zdCBvcmRlciA9IHRoaXMub3JkZXIuZ2V0KCk7XG5cdFx0aWYgKGlzRmlsZUNvdmVyYWdlKGEpICYmIGlzRmlsZUNvdmVyYWdlKGIpKSB7XG5cdFx0XHRzd2l0Y2ggKG9yZGVyKSB7XG5cdFx0XHRcdGNhc2UgQ292ZXJhZ2VTb3J0T3JkZXIuTG9jYXRpb246XG5cdFx0XHRcdGNhc2UgQ292ZXJhZ2VTb3J0T3JkZXIuTmFtZTpcblx0XHRcdFx0XHRyZXR1cm4gYS52YWx1ZSEudXJpLnRvU3RyaW5nKCkubG9jYWxlQ29tcGFyZShiLnZhbHVlIS51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGNhc2UgQ292ZXJhZ2VTb3J0T3JkZXIuQ292ZXJhZ2U6XG5cdFx0XHRcdFx0cmV0dXJuIGIudmFsdWUhLnRwYyAtIGEudmFsdWUhLnRwYztcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKGlzRGVjbGFyYXRpb25Db3ZlcmFnZShhKSAmJiBpc0RlY2xhcmF0aW9uQ292ZXJhZ2UoYikpIHtcblx0XHRcdHN3aXRjaCAob3JkZXIpIHtcblx0XHRcdFx0Y2FzZSBDb3ZlcmFnZVNvcnRPcmRlci5Mb2NhdGlvbjpcblx0XHRcdFx0XHRyZXR1cm4gUG9zaXRpb24uY29tcGFyZShcblx0XHRcdFx0XHRcdGEubG9jYXRpb24gaW5zdGFuY2VvZiBSYW5nZSA/IGEubG9jYXRpb24uZ2V0U3RhcnRQb3NpdGlvbigpIDogYS5sb2NhdGlvbixcblx0XHRcdFx0XHRcdGIubG9jYXRpb24gaW5zdGFuY2VvZiBSYW5nZSA/IGIubG9jYXRpb24uZ2V0U3RhcnRQb3NpdGlvbigpIDogYi5sb2NhdGlvbixcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRjYXNlIENvdmVyYWdlU29ydE9yZGVyLk5hbWU6XG5cdFx0XHRcdFx0cmV0dXJuIGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKTtcblx0XHRcdFx0Y2FzZSBDb3ZlcmFnZVNvcnRPcmRlci5Db3ZlcmFnZToge1xuXHRcdFx0XHRcdGNvbnN0IGF0dHJBID0gYS50cGM7XG5cdFx0XHRcdFx0Y29uc3QgYXR0ckIgPSBiLnRwYztcblx0XHRcdFx0XHRyZXR1cm4gKGF0dHJBICE9PSB1bmRlZmluZWQgJiYgYXR0ckIgIT09IHVuZGVmaW5lZCAmJiBhdHRyQiAtIGF0dHJBKVxuXHRcdFx0XHRcdFx0fHwgKCtiLmhpdHMgLSArYS5oaXRzKVxuXHRcdFx0XHRcdFx0fHwgYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0fVxufVxuXG5pbnRlcmZhY2UgSUZpbHRlcmVkVG9UZW1wbGF0ZSB7XG5cdGxhYmVsOiBIVE1MRWxlbWVudDtcblx0YWN0aW9uczogQWN0aW9uQmFyO1xufVxuXG5jbGFzcyBDdXJyZW50bHlGaWx0ZXJlZFRvUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPENvdmVyYWdlVHJlZUVsZW1lbnQsIEZ1enp5U2NvcmUsIElGaWx0ZXJlZFRvVGVtcGxhdGU+IHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdDJztcblx0cHVibGljIHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBDdXJyZW50bHlGaWx0ZXJlZFRvUmVuZGVyZXIuSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1lbnVTZXJ2aWNlOiBJTWVudVNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdCkgeyB9XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPENvdmVyYWdlVHJlZUVsZW1lbnQ+LCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRmlsdGVyZWRUb1RlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJJbm5lcihub2RlLmVsZW1lbnQuZWxlbWVudHNbbm9kZS5lbGVtZW50LmVsZW1lbnRzLmxlbmd0aCAtIDFdIGFzIEN1cnJlbnRseUZpbHRlcmVkVG8sIHRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUZpbHRlcmVkVG9UZW1wbGF0ZSB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Rlc3Rpbmctc3RkdHJlZS1jb250YWluZXInKTtcblx0XHRjb25zdCBsYWJlbCA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLmxhYmVsJykpO1xuXHRcdGNvbnN0IG1lbnUgPSB0aGlzLm1lbnVTZXJ2aWNlLmdldE1lbnVBY3Rpb25zKE1lbnVJZC5UZXN0Q292ZXJhZ2VGaWx0ZXJJdGVtLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLCB7XG5cdFx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBuZXcgQWN0aW9uQmFyKGNvbnRhaW5lcik7XG5cdFx0YWN0aW9ucy5wdXNoKGdldEFjdGlvbkJhckFjdGlvbnMobWVudSwgJ2lubGluZScpLnByaW1hcnksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdGFjdGlvbnMuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ2Jsb2NrJztcblxuXHRcdHJldHVybiB7IGxhYmVsLCBhY3Rpb25zIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxDb3ZlcmFnZVRyZWVFbGVtZW50LCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJRmlsdGVyZWRUb1RlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJJbm5lcihlbGVtZW50LmVsZW1lbnQgYXMgQ3VycmVudGx5RmlsdGVyZWRUbywgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElGaWx0ZXJlZFRvVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9ucy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcklubmVyKGVsZW1lbnQ6IEN1cnJlbnRseUZpbHRlcmVkVG8sIGNvbnRhaW5lcjogSUZpbHRlcmVkVG9UZW1wbGF0ZSkge1xuXHRcdGNvbnRhaW5lci5sYWJlbC5pbm5lclRleHQgPSBlbGVtZW50LmxhYmVsO1xuXHR9XG59XG5cbmludGVyZmFjZSBGaWxlVGVtcGxhdGVEYXRhIHtcblx0Y29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0YmFyczogTWFuYWdlZFRlc3RDb3ZlcmFnZUJhcnM7XG5cdHRlbXBsYXRlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0ZWxlbWVudHNEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsYWJlbDogSVJlc291cmNlTGFiZWw7XG59XG5cbmNsYXNzIEZpbGVDb3ZlcmFnZVJlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxDb3ZlcmFnZVRyZWVFbGVtZW50LCBGdXp6eVNjb3JlLCBGaWxlVGVtcGxhdGVEYXRhPiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnRic7XG5cdHB1YmxpYyByZWFkb25seSB0ZW1wbGF0ZUlkID0gRmlsZUNvdmVyYWdlUmVuZGVyZXIuSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBsYWJlbHM6IFJlc291cmNlTGFiZWxzLFxuXHRcdEBJTGFiZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IEZpbGVUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IHRlbXBsYXRlRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3Rlc3Rpbmctc3RkdHJlZS1jb250YWluZXInLCAndGVzdC1jb3ZlcmFnZS1saXN0LWl0ZW0nKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRiYXJzOiB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hbmFnZWRUZXN0Q292ZXJhZ2VCYXJzLCB7IGNvbXBhY3Q6IGZhbHNlLCBjb250YWluZXIgfSkpLFxuXHRcdFx0bGFiZWw6IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMubGFiZWxzLmNyZWF0ZShjb250YWluZXIsIHtcblx0XHRcdFx0c3VwcG9ydEhpZ2hsaWdodHM6IHRydWUsXG5cdFx0XHR9KSksXG5cdFx0XHRlbGVtZW50c0Rpc3Bvc2FibGVzOiB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcyxcblx0XHR9O1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyByZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxDb3ZlcmFnZVRyZWVFbGVtZW50LCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogRmlsZVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuZG9SZW5kZXIobm9kZS5lbGVtZW50IGFzIFRlc3RDb3ZlcmFnZUZpbGVOb2RlLCB0ZW1wbGF0ZURhdGEsIG5vZGUuZmlsdGVyRGF0YSk7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxDb3ZlcmFnZVRyZWVFbGVtZW50PiwgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IEZpbGVUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0aGlzLmRvUmVuZGVyKG5vZGUuZWxlbWVudC5lbGVtZW50cywgdGVtcGxhdGVEYXRhLCBub2RlLmZpbHRlckRhdGEpO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IEZpbGVUZW1wbGF0ZURhdGEpIHtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHJpdmF0ZSBkb1JlbmRlcihlbGVtZW50OiBDb3ZlcmFnZVRyZWVFbGVtZW50IHwgQ292ZXJhZ2VUcmVlRWxlbWVudFtdLCB0ZW1wbGF0ZURhdGE6IEZpbGVUZW1wbGF0ZURhdGEsIGZpbHRlckRhdGE6IEZ1enp5U2NvcmUgfCB1bmRlZmluZWQpIHtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudHNEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3Qgc3RhdCA9IChlbGVtZW50IGluc3RhbmNlb2YgQXJyYXkgPyBlbGVtZW50W2VsZW1lbnQubGVuZ3RoIC0gMV0gOiBlbGVtZW50KSBhcyBUZXN0Q292ZXJhZ2VGaWxlTm9kZTtcblx0XHRjb25zdCBmaWxlID0gc3RhdC52YWx1ZSE7XG5cdFx0Y29uc3QgbmFtZSA9IGVsZW1lbnQgaW5zdGFuY2VvZiBBcnJheSA/IGVsZW1lbnQubWFwKGUgPT4gYmFzZW5hbWVPckF1dGhvcml0eSgoZSBhcyBUZXN0Q292ZXJhZ2VGaWxlTm9kZSkudmFsdWUhLnVyaSkpIDogYmFzZW5hbWVPckF1dGhvcml0eShmaWxlLnVyaSk7XG5cdFx0aWYgKGZpbGUgaW5zdGFuY2VvZiBCeXBhc3NlZEZpbGVDb3ZlcmFnZSkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmJhcnMuc2V0Q292ZXJhZ2VJbmZvKHVuZGVmaW5lZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50c0Rpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdHN0YXQudmFsdWU/LmRpZENoYW5nZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5iYXJzLnNldENvdmVyYWdlSW5mbyhmaWxlKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGVtcGxhdGVEYXRhLmJhcnMuc2V0Q292ZXJhZ2VJbmZvKGZpbGUpO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5sYWJlbC5zZXRSZXNvdXJjZSh7IHJlc291cmNlOiBmaWxlLnVyaSwgbmFtZSB9LCB7XG5cdFx0XHRmaWxlS2luZDogc3RhdC5jaGlsZHJlbj8uc2l6ZSA/IEZpbGVLaW5kLkZPTERFUiA6IEZpbGVLaW5kLkZJTEUsXG5cdFx0XHRtYXRjaGVzOiBjcmVhdGVNYXRjaGVzKGZpbHRlckRhdGEpLFxuXHRcdFx0c2VwYXJhdG9yOiB0aGlzLmxhYmVsU2VydmljZS5nZXRTZXBhcmF0b3IoZmlsZS51cmkuc2NoZW1lLCBmaWxlLnVyaS5hdXRob3JpdHkpLFxuXHRcdFx0ZXh0cmFDbGFzc2VzOiBbJ2xhYmVsJ10sXG5cdFx0fSk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIERlY2xhcmF0aW9uVGVtcGxhdGVEYXRhIHtcblx0Y29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0YmFyczogTWFuYWdlZFRlc3RDb3ZlcmFnZUJhcnM7XG5cdHRlbXBsYXRlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0aWNvbjogSFRNTEVsZW1lbnQ7XG5cdGxhYmVsOiBIVE1MRWxlbWVudDtcbn1cblxuY2xhc3MgRGVjbGFyYXRpb25Db3ZlcmFnZVJlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxDb3ZlcmFnZVRyZWVFbGVtZW50LCBGdXp6eVNjb3JlLCBEZWNsYXJhdGlvblRlbXBsYXRlRGF0YT4ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ04nO1xuXHRwdWJsaWMgcmVhZG9ubHkgdGVtcGxhdGVJZCA9IERlY2xhcmF0aW9uQ292ZXJhZ2VSZW5kZXJlci5JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBEZWNsYXJhdGlvblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgdGVtcGxhdGVEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgndGVzdC1jb3ZlcmFnZS1saXN0LWl0ZW0nLCAndGVzdGluZy1zdGR0cmVlLWNvbnRhaW5lcicpO1xuXG5cdFx0Y29uc3QgaWNvbiA9IGRvbS5hcHBlbmQoY29udGFpbmVyLCBkb20uJCgnLnN0YXRlJykpO1xuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcubGFiZWwnKSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Y29udGFpbmVyLFxuXHRcdFx0YmFyczogdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNYW5hZ2VkVGVzdENvdmVyYWdlQmFycywgeyBjb21wYWN0OiBmYWxzZSwgY29udGFpbmVyIH0pKSxcblx0XHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMsXG5cdFx0XHRpY29uLFxuXHRcdFx0bGFiZWwsXG5cdFx0fTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8Q292ZXJhZ2VUcmVlRWxlbWVudCwgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IERlY2xhcmF0aW9uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5kb1JlbmRlcihub2RlLmVsZW1lbnQgYXMgRGVjbGFyYXRpb25Db3ZlcmFnZU5vZGUsIHRlbXBsYXRlRGF0YSwgbm9kZS5maWx0ZXJEYXRhKTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPENvdmVyYWdlVHJlZUVsZW1lbnQ+LCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogRGVjbGFyYXRpb25UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0aGlzLmRvUmVuZGVyKG5vZGUuZWxlbWVudC5lbGVtZW50c1tub2RlLmVsZW1lbnQuZWxlbWVudHMubGVuZ3RoIC0gMV0gYXMgRGVjbGFyYXRpb25Db3ZlcmFnZU5vZGUsIHRlbXBsYXRlRGF0YSwgbm9kZS5maWx0ZXJEYXRhKTtcblx0fVxuXG5cdHB1YmxpYyBkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBEZWNsYXJhdGlvblRlbXBsYXRlRGF0YSkge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwcml2YXRlIGRvUmVuZGVyKGVsZW1lbnQ6IERlY2xhcmF0aW9uQ292ZXJhZ2VOb2RlLCB0ZW1wbGF0ZURhdGE6IERlY2xhcmF0aW9uVGVtcGxhdGVEYXRhLCBfZmlsdGVyRGF0YTogRnV6enlTY29yZSB8IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IGNvdmVyZWQgPSAhIWVsZW1lbnQuaGl0cztcblx0XHRjb25zdCBpY29uID0gY292ZXJlZCA/IHRlc3RpbmdXYXNDb3ZlcmVkIDogdGVzdGluZ1N0YXRlc1RvSWNvbnMuZ2V0KFRlc3RSZXN1bHRTdGF0ZS5VbnNldCk7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdub3QtY292ZXJlZCcsICFjb3ZlcmVkKTtcblx0XHR0ZW1wbGF0ZURhdGEuaWNvbi5jbGFzc05hbWUgPSBgY29tcHV0ZWQtc3RhdGUgJHtUaGVtZUljb24uYXNDbGFzc05hbWUoaWNvbiEpfWA7XG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLmlubmVyVGV4dCA9IGVsZW1lbnQubGFiZWw7XG5cdFx0dGVtcGxhdGVEYXRhLmJhcnMuc2V0Q292ZXJhZ2VJbmZvKGVsZW1lbnQuYXR0cmlidXRhYmxlQ292ZXJhZ2UoKSk7XG5cdH1cbn1cblxuY2xhc3MgQmFzaWNSZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8Q292ZXJhZ2VUcmVlRWxlbWVudCwgRnV6enlTY29yZSwgSFRNTEVsZW1lbnQ+IHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdCJztcblx0cHVibGljIHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBCYXNpY1JlbmRlcmVyLklEO1xuXG5cdHJlbmRlckNvbXByZXNzZWRFbGVtZW50cyhub2RlOiBJVHJlZU5vZGU8SUNvbXByZXNzZWRUcmVlTm9kZTxDb3ZlcmFnZVRyZWVFbGVtZW50PiwgRnV6enlTY29yZT4sIF9pbmRleDogbnVtYmVyLCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJJbm5lcihub2RlLmVsZW1lbnQuZWxlbWVudHNbbm9kZS5lbGVtZW50LmVsZW1lbnRzLmxlbmd0aCAtIDFdLCBjb250YWluZXIpO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8Q292ZXJhZ2VUcmVlRWxlbWVudCwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlcklubmVyKG5vZGUuZWxlbWVudCwgY29udGFpbmVyKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSgpOiB2b2lkIHtcblx0XHQvLyBuby1vcFxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJJbm5lcihlbGVtZW50OiBDb3ZlcmFnZVRyZWVFbGVtZW50LCBjb250YWluZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0Y29udGFpbmVyLmlubmVyVGV4dCA9IChlbGVtZW50IGFzIFJldmVhbFVuY292ZXJlZERlY2xhcmF0aW9ucyB8IExvYWRpbmdEZXRhaWxzKS5sYWJlbDtcblx0fVxufVxuXG5jbGFzcyBUZXN0Q292ZXJhZ2VJZGVudGl0eVByb3ZpZGVyIGltcGxlbWVudHMgSUlkZW50aXR5UHJvdmlkZXI8Q292ZXJhZ2VUcmVlRWxlbWVudD4ge1xuXHRwdWJsaWMgZ2V0SWQoZWxlbWVudDogQ292ZXJhZ2VUcmVlRWxlbWVudCkge1xuXHRcdHJldHVybiBpc0ZpbGVDb3ZlcmFnZShlbGVtZW50KVxuXHRcdFx0PyBlbGVtZW50LnZhbHVlIS51cmkudG9TdHJpbmcoKVxuXHRcdFx0OiBlbGVtZW50LmlkO1xuXHR9XG59XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUZXN0Q292ZXJhZ2VDaGFuZ2VQZXJUZXN0RmlsdGVyQWN0aW9uIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkNvdmVyYWdlRmlsdGVyVG9UZXN0LFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVGVzdCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuY2hhbmdlQ292ZXJhZ2VGaWx0ZXInLCAnRmlsdGVyIENvdmVyYWdlIGJ5IFRlc3QnKSxcblx0XHRcdGljb246IENvZGljb24uZmlsdGVyLFxuXHRcdFx0dG9nZ2xlZDoge1xuXHRcdFx0XHRpY29uOiBDb2RpY29uLmZpbHRlckZpbGxlZCxcblx0XHRcdFx0Y29uZGl0aW9uOiBUZXN0aW5nQ29udGV4dEtleXMuaXNDb3ZlcmFnZUZpbHRlcmVkVG9UZXN0LFxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IFtcblx0XHRcdFx0eyBpZDogTWVudUlkLkNvbW1hbmRQYWxldHRlLCB3aGVuOiBUZXN0aW5nQ29udGV4dEtleXMuaGFzUGVyVGVzdENvdmVyYWdlIH0sXG5cdFx0XHRcdHsgaWQ6IE1lbnVJZC5UZXN0Q292ZXJhZ2VGaWx0ZXJJdGVtLCBncm91cDogJ2lubGluZScgfSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChUZXN0aW5nQ29udGV4dEtleXMuaGFzUGVyVGVzdENvdmVyYWdlLCBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBUZXN0aW5nLkNvdmVyYWdlVmlld0lkKSksXG5cdFx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0fSxcblx0XHRcdF1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3Nvcik6IHZvaWQge1xuXHRcdGNvbnN0IGNvdmVyYWdlU2VydmljZSA9IGFjY2Vzc29yLmdldChJVGVzdENvdmVyYWdlU2VydmljZSk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dFNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb3ZlcmFnZSA9IGNvdmVyYWdlU2VydmljZS5zZWxlY3RlZC5nZXQoKTtcblx0XHRpZiAoIWNvdmVyYWdlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGVzdHMgPSBbLi4uY292ZXJhZ2UuYWxsUGVyVGVzdElEcygpXS5tYXAoVGVzdElkLmZyb21TdHJpbmcpO1xuXHRcdGNvbnN0IGNvbW1vblByZWZpeCA9IFRlc3RJZC5nZXRMZW5ndGhPZkNvbW1vblByZWZpeCh0ZXN0cy5sZW5ndGgsIGkgPT4gdGVzdHNbaV0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvdmVyYWdlLnJlc3VsdDtcblx0XHRjb25zdCBwcmV2aW91c1NlbGVjdGlvbiA9IGNvdmVyYWdlU2VydmljZS5maWx0ZXJUb1Rlc3QuZ2V0KCk7XG5cdFx0Y29uc3QgcHJldmlvdXNTZWxlY3Rpb25TdHIgPSBwcmV2aW91c1NlbGVjdGlvbj8udG9TdHJpbmcoKTtcblxuXHRcdHR5cGUgVEl0ZW0gPSB7IGxhYmVsOiBzdHJpbmc7IGRlc2NyaXB0aW9uPzogc3RyaW5nOyB0ZXN0SWQ/OiBUZXN0SWQgfTtcblxuXHRcdGNvbnN0IGl0ZW1zOiBRdWlja1BpY2tJbnB1dDxUSXRlbT5bXSA9IFtcblx0XHRcdHsgbGFiZWw6IGNvdmVyVXRpbHMubGFiZWxzLmFsbFRlc3RzLCBpZDogdW5kZWZpbmVkIH0sXG5cdFx0XHR7IHR5cGU6ICdzZXBhcmF0b3InIH0sXG5cdFx0XHQuLi50ZXN0cy5tYXAodGVzdElkID0+ICh7IC4uLmNvdmVyVXRpbHMuZ2V0TGFiZWxGb3JJdGVtKHJlc3VsdCwgdGVzdElkLCBjb21tb25QcmVmaXgpLCB0ZXN0SWQgfSkpLFxuXHRcdF07XG5cblx0XHRxdWlja0lucHV0U2VydmljZS5waWNrKGl0ZW1zLCB7XG5cdFx0XHRhY3RpdmVJdGVtOiBpdGVtcy5maW5kKChpdGVtKTogaXRlbSBpcyBUSXRlbSA9PiAndGVzdElkJyBpbiBpdGVtICYmIGl0ZW0udGVzdElkPy50b1N0cmluZygpID09PSBwcmV2aW91c1NlbGVjdGlvblN0ciksXG5cdFx0XHRwbGFjZUhvbGRlcjogY292ZXJVdGlscy5sYWJlbHMucGlja1Nob3dDb3ZlcmFnZSxcblx0XHRcdG9uRGlkRm9jdXM6IChlbnRyeSkgPT4ge1xuXHRcdFx0XHRjb3ZlcmFnZVNlcnZpY2UuZmlsdGVyVG9UZXN0LnNldChlbnRyeS50ZXN0SWQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9LFxuXHRcdH0pLnRoZW4oc2VsZWN0ZWQgPT4ge1xuXHRcdFx0Y292ZXJhZ2VTZXJ2aWNlLmZpbHRlclRvVGVzdC5zZXQoc2VsZWN0ZWQgPyBzZWxlY3RlZC50ZXN0SWQgOiBwcmV2aW91c1NlbGVjdGlvbiwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUZXN0Q292ZXJhZ2VDaGFuZ2VTb3J0aW5nQWN0aW9uIGV4dGVuZHMgVmlld0FjdGlvbjxUZXN0Q292ZXJhZ2VWaWV3PiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkNvdmVyYWdlVmlld0NoYW5nZVNvcnRpbmcsXG5cdFx0XHR2aWV3SWQ6IFRlc3RpbmcuQ292ZXJhZ2VWaWV3SWQsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCd0ZXN0aW5nLmNoYW5nZUNvdmVyYWdlU29ydCcsICdDaGFuZ2UgU29ydCBPcmRlcicpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5zb3J0UHJlY2VkZW5jZSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRlc3RpbmcuQ292ZXJhZ2VWaWV3SWQpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMSxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bkluVmlldyhhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgdmlldzogVGVzdENvdmVyYWdlVmlldykge1xuXHRcdHR5cGUgSXRlbSA9IElRdWlja1BpY2tJdGVtICYgeyB2YWx1ZTogQ292ZXJhZ2VTb3J0T3JkZXIgfTtcblxuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnN0IHF1aWNrSW5wdXQgPSBkaXNwb3NhYmxlcy5hZGQoYWNjZXNzb3IuZ2V0KElRdWlja0lucHV0U2VydmljZSkuY3JlYXRlUXVpY2tQaWNrPEl0ZW0+KCkpO1xuXHRcdGNvbnN0IGl0ZW1zOiBJdGVtW10gPSBbXG5cdFx0XHR7IGxhYmVsOiBsb2NhbGl6ZSgndGVzdGluZy5jb3ZlcmFnZVNvcnRCeUxvY2F0aW9uJywgJ1NvcnQgYnkgTG9jYXRpb24nKSwgdmFsdWU6IENvdmVyYWdlU29ydE9yZGVyLkxvY2F0aW9uLCBkZXNjcmlwdGlvbjogbG9jYWxpemUoJ3Rlc3RpbmcuY292ZXJhZ2VTb3J0QnlMb2NhdGlvbkRlc2NyaXB0aW9uJywgJ0ZpbGVzIGFyZSBzb3J0ZWQgYWxwaGFiZXRpY2FsbHksIGRlY2xhcmF0aW9ucyBhcmUgc29ydGVkIGJ5IHBvc2l0aW9uJykgfSxcblx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCd0ZXN0aW5nLmNvdmVyYWdlU29ydEJ5Q292ZXJhZ2UnLCAnU29ydCBieSBDb3ZlcmFnZScpLCB2YWx1ZTogQ292ZXJhZ2VTb3J0T3JkZXIuQ292ZXJhZ2UsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVzdGluZy5jb3ZlcmFnZVNvcnRCeUNvdmVyYWdlRGVzY3JpcHRpb24nLCAnRmlsZXMgYW5kIGRlY2xhcmF0aW9ucyBhcmUgc29ydGVkIGJ5IHRvdGFsIGNvdmVyYWdlJykgfSxcblx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCd0ZXN0aW5nLmNvdmVyYWdlU29ydEJ5TmFtZScsICdTb3J0IGJ5IE5hbWUnKSwgdmFsdWU6IENvdmVyYWdlU29ydE9yZGVyLk5hbWUsIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVzdGluZy5jb3ZlcmFnZVNvcnRCeU5hbWVEZXNjcmlwdGlvbicsICdGaWxlcyBhbmQgZGVjbGFyYXRpb25zIGFyZSBzb3J0ZWQgYWxwaGFiZXRpY2FsbHknKSB9LFxuXHRcdF07XG5cblx0XHRxdWlja0lucHV0LnBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ3Rlc3RpbmcuY292ZXJhZ2VTb3J0UGxhY2Vob2xkZXInLCAnU29ydCB0aGUgVGVzdCBDb3ZlcmFnZSB2aWV3Li4uJyk7XG5cdFx0cXVpY2tJbnB1dC5pdGVtcyA9IGl0ZW1zO1xuXHRcdHF1aWNrSW5wdXQuc2hvdygpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja0lucHV0Lm9uRGlkSGlkZSgoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocXVpY2tJbnB1dC5vbkRpZEFjY2VwdCgoKSA9PiB7XG5cdFx0XHRjb25zdCBwaWNrZWQgPSBxdWlja0lucHV0LnNlbGVjdGVkSXRlbXNbMF0/LnZhbHVlO1xuXHRcdFx0aWYgKHBpY2tlZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHZpZXcuc29ydE9yZGVyLnNldChwaWNrZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHF1aWNrSW5wdXQuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUZXN0Q292ZXJhZ2VDb2xsYXBzZUFsbEFjdGlvbiBleHRlbmRzIFZpZXdBY3Rpb248VGVzdENvdmVyYWdlVmlldz4ge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogVGVzdENvbW1hbmRJZC5Db3ZlcmFnZVZpZXdDb2xsYXBzZUFsbCxcblx0XHRcdHZpZXdJZDogVGVzdGluZy5Db3ZlcmFnZVZpZXdJZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuY292ZXJhZ2VDb2xsYXBzZUFsbCcsICdDb2xsYXBzZSBBbGwgQ292ZXJhZ2UnKSxcblx0XHRcdGljb246IENvZGljb24uY29sbGFwc2VBbGwsXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuVmlld1RpdGxlLFxuXHRcdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBUZXN0aW5nLkNvdmVyYWdlVmlld0lkKSxcblx0XHRcdFx0Z3JvdXA6ICduYXZpZ2F0aW9uJyxcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRvdmVycmlkZSBydW5JblZpZXcoX2FjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBUZXN0Q292ZXJhZ2VWaWV3KSB7XG5cdFx0dmlldy5jb2xsYXBzZUFs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
