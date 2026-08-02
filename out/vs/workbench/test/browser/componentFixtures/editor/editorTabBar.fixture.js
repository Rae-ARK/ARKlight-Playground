import { $, Dimension } from "../../../../../base/browser/dom.js";
import { Action } from "../../../../../base/common/actions.js";
import { Event } from "../../../../../base/common/event.js";
import { Schemas } from "../../../../../base/common/network.js";
import { basename, dirname } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { localize } from "../../../../../nls.js";
import { MenuId } from "../../../../../platform/actions/common/actions.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { ContextKeyService } from "../../../../../platform/contextkey/browser/contextKeyService.js";
import { listErrorForeground, listWarningForeground } from "../../../../../platform/theme/common/colors/listColors.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { testWorkspace } from "../../../../../platform/workspace/test/common/testWorkspace.js";
import { ITreeViewsDnDService } from "../../../../../editor/common/services/treeViewsDndService.js";
import { TreeViewsDnDService } from "../../../../../editor/common/services/treeViewsDnd.js";
import { EditorInput } from "../../../../common/editor/editorInput.js";
import { EditorInputCapabilities, EditorsOrder, Verbosity } from "../../../../common/editor.js";
import { EditorGroupModel } from "../../../../common/editor/editorGroupModel.js";
import { EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND, EDITOR_GROUP_HEADER_TABS_BACKGROUND } from "../../../../common/theme.js";
import { DEFAULT_EDITOR_PART_OPTIONS } from "../../../../browser/parts/editor/editor.js";
import { BreadcrumbsService, IBreadcrumbsService } from "../../../../browser/parts/editor/breadcrumbs.js";
import { EditorTitleControl } from "../../../../browser/parts/editor/editorTitleControl.js";
import { IDecorationsService } from "../../../../services/decorations/common/decorations.js";
import { DecorationsService } from "../../../../services/decorations/browser/decorationsService.js";
import { INotebookDocumentService, NotebookDocumentWorkbenchService } from "../../../../services/notebook/common/notebookDocumentService.js";
import { IOutlineService } from "../../../../services/outline/browser/outline.js";
import { LayoutSettings } from "../../../../services/layout/browser/layoutService.js";
import { TestContextService } from "../../../common/workbenchTestServices.js";
import { workbenchInstantiationService } from "../../workbenchTestServices.js";
import { defineComponentFixture, defineThemedFixtureGroup } from "../fixtureUtils.js";
import "../../../../contrib/styleOverrides/browser/media/tabs.css";
class FixtureEditorInput extends EditorInput {
  constructor(resource, _options = {}) {
    super();
    this.resource = resource;
    this._options = _options;
  }
  get typeId() {
    return this._options.typeId ?? "workbench.editors.fixtureEditorInput";
  }
  get editorId() {
    return this.typeId;
  }
  get capabilities() {
    return this._options.capabilities ?? EditorInputCapabilities.None;
  }
  getName() {
    return basename(this.resource);
  }
  /**
   * Returns a distinct parent-folder label per {@link Verbosity}, matching how
   * real resource editor inputs vary their description. `MultiEditorTabsControl`
   * maps `labelFormat` (short/medium/long) to a verbosity, so distinct values
   * here are what make the label-format fixtures differ.
   */
  getDescription(verbosity = Verbosity.MEDIUM) {
    const parent = dirname(this.resource);
    if (parent.path === "/" || parent.path === "." || parent.path === "") {
      return void 0;
    }
    switch (verbosity) {
      case Verbosity.SHORT:
        return basename(parent);
      // containing folder name
      case Verbosity.LONG:
        return parent.path;
      // full absolute path
      case Verbosity.MEDIUM:
      default:
        return parent.path.replace(/^\//, "");
    }
  }
  getIcon() {
    return this._options.icon;
  }
  isDirty() {
    return !!this._options.dirty;
  }
}
function file(path) {
  return URI.file(path);
}
function defaultEditorSpecs() {
  return [
    { resource: file("/project/src/app/main.ts"), icon: ThemeIcon.fromId(Codicon.symbolFile.id), sticky: true, pinned: true },
    { resource: file("/project/src/app/index.ts"), pinned: true },
    { resource: file("/project/README.md"), icon: ThemeIcon.fromId(Codicon.markdown.id), pinned: true },
    { resource: file("/project/package.json"), icon: ThemeIcon.fromId(Codicon.json.id), pinned: true, dirty: true, active: true },
    {
      resource: URI.from({ scheme: Schemas.untitled, path: "Untitled-1" }),
      typeId: "workbench.editors.untitledFixture",
      icon: ThemeIcon.fromId(Codicon.file.id),
      pinned: false
      /* preview */
    },
    { resource: file("/project/.vscode/settings.json"), icon: ThemeIcon.fromId(Codicon.settingsGear.id), pinned: true },
    { resource: file("/project/src/app/components/button.tsx"), pinned: true },
    { resource: file("/project/tests/app/main.test.ts"), pinned: true }
  ];
}
function nestedActiveEditorSpecs() {
  return defaultEditorSpecs().map((spec, index) => ({ ...spec, active: index === 0 }));
}
function duplicateNameEditorSpecs() {
  return [
    { resource: file("/project/src/app/index.ts"), pinned: true, active: true },
    { resource: file("/project/src/lib/index.ts"), pinned: true },
    { resource: file("/project/src/lib/util/index.ts"), pinned: true },
    { resource: file("/project/tests/index.ts"), pinned: true }
  ];
}
function manyEditorSpecs() {
  const names = [
    "main.ts",
    "index.ts",
    "button.tsx",
    "input.tsx",
    "list.tsx",
    "tree.tsx",
    "model.ts",
    "service.ts",
    "view.ts",
    "controller.ts",
    "utils.ts",
    "types.ts",
    "app.css",
    "theme.css",
    "README.md",
    "package.json"
  ];
  return names.map((name, index) => ({
    resource: file(`/project/src/module${index % 4}/${name}`),
    pinned: true,
    active: index === 0,
    dirty: index % 5 === 0
  }));
}
function dirtyEditorSpecs() {
  return [
    { resource: file("/project/src/app/main.ts"), pinned: true, dirty: true, active: true },
    { resource: file("/project/src/app/index.ts"), pinned: true, dirty: true },
    { resource: file("/project/README.md"), pinned: true },
    { resource: file("/project/package.json"), pinned: true, dirty: true }
  ];
}
function stickyEditorSpecs() {
  return [
    { resource: file("/project/src/app/main.ts"), icon: ThemeIcon.fromId(Codicon.symbolFile.id), sticky: true, pinned: true },
    { resource: file("/project/README.md"), icon: ThemeIcon.fromId(Codicon.markdown.id), sticky: true, pinned: true },
    { resource: file("/project/package.json"), icon: ThemeIcon.fromId(Codicon.json.id), sticky: true, pinned: true },
    { resource: file("/project/src/app/index.ts"), pinned: true, active: true },
    { resource: file("/project/src/app/components/button.tsx"), pinned: true }
  ];
}
function allStickyEditorSpecs() {
  return stickyEditorSpecs().map((spec, index) => ({ ...spec, sticky: true, active: index === 0 }));
}
function allUnstickyEditorSpecs() {
  return stickyEditorSpecs().map((spec, index) => ({ ...spec, sticky: false, active: index === 0 }));
}
function multiSelectEditorSpecs() {
  return [
    { resource: file("/project/src/app/main.ts"), icon: ThemeIcon.fromId(Codicon.symbolFile.id), pinned: true, selected: true },
    { resource: file("/project/src/app/index.ts"), pinned: true },
    { resource: file("/project/README.md"), icon: ThemeIcon.fromId(Codicon.markdown.id), pinned: true, selected: true },
    { resource: file("/project/package.json"), icon: ThemeIcon.fromId(Codicon.json.id), pinned: true, dirty: true, active: true, selected: true },
    { resource: file("/project/src/app/components/button.tsx"), pinned: true },
    { resource: file("/project/tests/app/main.test.ts"), pinned: true, selected: true }
  ];
}
function longLabelEditorSpecs() {
  return [
    { resource: file("/project/src/features/authentication/providers/veryLongAuthenticationProviderImplementation.ts"), pinned: true, active: true },
    { resource: file("/project/src/features/authentication/providers/anotherExtremelyLongProviderFactoryModule.ts"), pinned: true },
    { resource: file("/project/documentation/architecture/decisions/0001-use-a-really-long-descriptive-file-name.md"), icon: ThemeIcon.fromId(Codicon.markdown.id), pinned: true }
  ];
}
function singleDirtyEditorSpecs() {
  return [
    { resource: file("/project/src/app/main.ts"), icon: ThemeIcon.fromId(Codicon.symbolFile.id), pinned: true, dirty: true, active: true }
  ];
}
const FIXTURE_DECORATIONS = /* @__PURE__ */ new Map([
  ["/project/package.json", { weight: 10, letter: "M", color: listWarningForeground, tooltip: "Modified", bubble: false }],
  ["/project/src/app/main.ts", { weight: 20, letter: "2", color: listErrorForeground, tooltip: "2 problems", bubble: false }],
  ["/project/src/app/index.ts", { weight: 20, letter: "U", color: listWarningForeground, tooltip: "Untracked", bubble: false }]
]);
function registerFixtureDecorations(decorationsService, store) {
  const provider = {
    label: "Fixture Decorations",
    onDidChange: Event.None,
    provideDecorations(uri, _token) {
      return FIXTURE_DECORATIONS.get(uri.path);
    }
  };
  store.add(decorationsService.registerDecorationsProvider(provider));
}
function createFixtureEditorTitleActions(store, menuId) {
  if (menuId !== MenuId.EditorTitle) {
    return { primary: [], secondary: [] };
  }
  return {
    primary: [
      store.add(new Action(
        "fixture.splitEditorRight",
        localize("fixtureSplitEditorRight", "Split Editor Right"),
        ThemeIcon.asClassName(Codicon.splitHorizontal)
      ))
    ],
    secondary: [
      store.add(new Action(
        "fixture.openEditor",
        localize("fixtureOpenEditor", "Open Editor..."),
        ThemeIcon.asClassName(Codicon.goToFile)
      ))
    ]
  };
}
function createPartOptions(overrides) {
  return {
    ...DEFAULT_EDITOR_PART_OPTIONS,
    hasIcons: true,
    ...overrides
  };
}
function populateModel(model, specs, disposableStore) {
  const ordered = [...specs].sort((a, b) => a.sticky === b.sticky ? 0 : a.sticky ? -1 : 1);
  const inputBySpec = /* @__PURE__ */ new Map();
  for (const spec of ordered) {
    const input = disposableStore.add(new FixtureEditorInput(spec.resource, {
      typeId: spec.typeId,
      dirty: spec.dirty,
      icon: spec.icon,
      capabilities: spec.capabilities
    }));
    inputBySpec.set(spec, input);
    model.openEditor(input, {
      pinned: spec.pinned ?? true,
      sticky: spec.sticky,
      active: spec.active
    });
  }
  const inactiveSelected = ordered.filter((spec) => spec.selected && !spec.active).map((spec) => inputBySpec.get(spec));
  if (inactiveSelected.length && model.activeEditor) {
    model.setSelection(model.activeEditor, inactiveSelected);
  }
}
function renderTabBar(ctx, options) {
  const { container, disposableStore, theme } = ctx;
  const width = options.width ?? 820;
  const isGroupActive = options.active ?? true;
  const partOptions = createPartOptions(options.partOptions);
  const configurationService = new TestConfigurationService();
  configurationService.setUserConfiguration("breadcrumbs", {
    enabled: Boolean(options.breadcrumbs),
    filePath: options.breadcrumbs?.filePath ?? "on",
    symbolPath: "off",
    icons: options.breadcrumbs?.icons ?? true
  });
  configurationService.setUserConfiguration(LayoutSettings.MODERN_UI, options.modernUI);
  const instantiationService = workbenchInstantiationService({
    configurationService: () => configurationService
  }, disposableStore);
  instantiationService.get(IThemeService).setTheme(theme);
  instantiationService.stub(ITreeViewsDnDService, new TreeViewsDnDService());
  instantiationService.stub(INotebookDocumentService, new NotebookDocumentWorkbenchService());
  const contextKeyService = disposableStore.add(instantiationService.createInstance(ContextKeyService));
  instantiationService.stub(IContextKeyService, contextKeyService);
  if (options.breadcrumbs) {
    instantiationService.stub(IBreadcrumbsService, new BreadcrumbsService());
    instantiationService.stub(IOutlineService, new class extends mock() {
    }());
    instantiationService.stub(IWorkspaceContextService, new TestContextService(testWorkspace(file("/project"))));
  }
  const decorationsService = disposableStore.add(instantiationService.createInstance(DecorationsService));
  instantiationService.stub(IDecorationsService, decorationsService);
  registerFixtureDecorations(decorationsService, disposableStore);
  const model = disposableStore.add(instantiationService.createInstance(EditorGroupModel, void 0));
  populateModel(model, options.editors ?? defaultEditorSpecs(), disposableStore);
  const createEditorActions = (disposables, menuId) => {
    return { actions: createFixtureEditorTitleActions(disposables, menuId), onDidChange: Event.None };
  };
  const groupView = new class extends mock() {
    constructor() {
      super(...arguments);
      this.relayoutFn = () => {
      };
    }
    get id() {
      return model.id;
    }
    get count() {
      return model.count;
    }
    get stickyCount() {
      return model.stickyCount;
    }
    get activeEditor() {
      return model.activeEditor;
    }
    get activeEditorPane() {
      return void 0;
    }
    get selectedEditors() {
      return model.selectedEditors;
    }
    get ariaLabel() {
      return "Editor Group 1";
    }
    getEditorByIndex(index) {
      return model.getEditorByIndex(index);
    }
    getIndexOfEditor(editor) {
      return model.indexOf(editor);
    }
    getEditors(order, opts) {
      return model.getEditors(order, opts);
    }
    isActive(editor) {
      return model.isActive(editor);
    }
    isPinned(editorOrIndex) {
      return model.isPinned(editorOrIndex);
    }
    isSticky(editorOrIndex) {
      return model.isSticky(editorOrIndex);
    }
    isSelected(editorOrIndex) {
      return model.isSelected(editorOrIndex);
    }
    createEditorActions(disposables, menuId = MenuId.EditorTitle) {
      return createEditorActions(disposables, menuId);
    }
    relayout() {
      this.relayoutFn();
    }
  }();
  const otherActiveGroup = new class extends mock() {
    focus() {
    }
  }();
  const groupsView = new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeEditorPartOptions = Event.None;
      this.onDidVisibilityChange = Event.None;
    }
    get partOptions() {
      return partOptions;
    }
    get activeGroup() {
      return isGroupActive ? groupView : otherActiveGroup;
    }
    get groups() {
      return [groupView];
    }
  }();
  const editorPartsView = new class extends mock() {
    get count() {
      return 1;
    }
    getGroup() {
      return groupView;
    }
  }();
  const editorPart = $(".part.editor");
  const content = $(".content");
  const groupContainer = $(isGroupActive ? ".editor-group-container.active" : ".editor-group-container");
  const titleContainer = $(".title");
  container.classList.toggle("style-override", options.modernUI);
  titleContainer.classList.toggle("tabs", partOptions.showTabs === "multiple");
  titleContainer.classList.toggle("show-file-icons", partOptions.showIcons);
  const headerBackground = theme.getColor(partOptions.showTabs === "multiple" ? EDITOR_GROUP_HEADER_TABS_BACKGROUND : EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND);
  if (headerBackground) {
    titleContainer.style.backgroundColor = headerBackground.toString();
  }
  const editorContainer = $(".editor-container");
  editorContainer.style.height = "96px";
  editorContainer.style.opacity = "0.6";
  editorPart.appendChild(content);
  content.appendChild(groupContainer);
  groupContainer.appendChild(titleContainer);
  groupContainer.appendChild(editorContainer);
  container.appendChild(editorPart);
  container.style.width = `${width}px`;
  groupContainer.style.width = `${width}px`;
  const titleControl = disposableStore.add(instantiationService.createInstance(
    EditorTitleControl,
    titleContainer,
    editorPartsView,
    groupsView,
    groupView,
    model,
    void 0
  ));
  const layout = () => {
    titleControl.layout({
      container: new Dimension(width, titleControl.getHeight().total),
      available: new Dimension(width, 200)
    }, options.breadcrumbsRightInset);
  };
  groupView.relayoutFn = layout;
  titleControl.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
  titleControl.setActive(isGroupActive);
  if (options.dropTargetBetweenTabs) {
    const tabs = titleContainer.querySelectorAll(".tabs-container > .tab");
    tabs[1]?.classList.add("drop-target-left");
    tabs[2]?.classList.add("drop-target-right");
  }
  layout();
}
function render(modernUI, options) {
  return (ctx) => renderTabBar(ctx, { ...options, modernUI });
}
function createFixtures(modernUI, additionalThemes = []) {
  return {
    // Baseline: multiple tabs with mixed sticky / pinned / preview / dirty state.
    Default: defineComponentFixture({ render: render(modernUI, {}), additionalThemes }),
    // showTabs
    ShowTabsSingle: defineComponentFixture({ render: render(modernUI, { partOptions: { showTabs: "single" }, breadcrumbs: {} }) }),
    ShowTabsNone: defineComponentFixture({ render: render(modernUI, { partOptions: { showTabs: "none" } }) }),
    // pinnedTabsOnSeparateRow
    PinnedTabsOnSeparateRowAllPinned: defineComponentFixture({ render: render(modernUI, { partOptions: { pinnedTabsOnSeparateRow: true }, editors: allStickyEditorSpecs() }) }),
    PinnedTabsOnSeparateRowAllUnpinned: defineComponentFixture({ render: render(modernUI, { partOptions: { pinnedTabsOnSeparateRow: true }, editors: allUnstickyEditorSpecs() }) }),
    PinnedTabsOnSeparateRowMixed: defineComponentFixture({ render: render(modernUI, { partOptions: { pinnedTabsOnSeparateRow: true }, editors: stickyEditorSpecs() }), additionalThemes }),
    // breadcrumbs
    BreadcrumbsFilePathLast: defineComponentFixture({ render: render(modernUI, { breadcrumbs: { filePath: "last" }, editors: nestedActiveEditorSpecs() }) }),
    BreadcrumbsIconsOff: defineComponentFixture({ render: render(modernUI, { breadcrumbs: { icons: false } }) }),
    BreadcrumbsWithRightInset: defineComponentFixture({ render: render(modernUI, { breadcrumbs: {}, breadcrumbsRightInset: 300 }) }),
    // tabSizing
    TabSizingShrink: defineComponentFixture({ render: render(modernUI, { partOptions: { tabSizing: "shrink" }, editors: manyEditorSpecs() }) }),
    TabSizingFixed: defineComponentFixture({ render: render(modernUI, { partOptions: { tabSizing: "fixed", tabSizingFixedMinWidth: 60, tabSizingFixedMaxWidth: 120 }, editors: manyEditorSpecs() }) }),
    // tabHeight
    TabHeightCompact: defineComponentFixture({ render: render(modernUI, { partOptions: { tabHeight: "compact" } }) }),
    // wrapTabs
    WrapTabs: defineComponentFixture({ render: render(modernUI, { partOptions: { wrapTabs: true }, editors: manyEditorSpecs(), width: 520 }) }),
    // tabActionLocation
    TabActionLocationLeft: defineComponentFixture({ render: render(modernUI, { partOptions: { tabActionLocation: "left" } }) }),
    // tabActionCloseVisibility
    TabActionCloseHidden: defineComponentFixture({ render: render(modernUI, { partOptions: { tabActionCloseVisibility: false } }) }),
    // tabActionUnpinVisibility (with sticky/compact tabs where the unpin action shows)
    TabActionUnpinHidden: defineComponentFixture({ render: render(modernUI, { partOptions: { tabActionUnpinVisibility: false, pinnedTabSizing: "normal" }, editors: stickyEditorSpecs() }) }),
    // showTabIndex
    ShowTabIndex: defineComponentFixture({ render: render(modernUI, { partOptions: { showTabIndex: true } }) }),
    // highlightModifiedTabs
    HighlightModifiedTabs: defineComponentFixture({ render: render(modernUI, { partOptions: { highlightModifiedTabs: true }, editors: dirtyEditorSpecs() }) }),
    // labelFormat
    LabelFormatShort: defineComponentFixture({ render: render(modernUI, { partOptions: { labelFormat: "short" }, editors: duplicateNameEditorSpecs() }) }),
    LabelFormatMedium: defineComponentFixture({ render: render(modernUI, { partOptions: { labelFormat: "medium" }, editors: duplicateNameEditorSpecs() }) }),
    LabelFormatLong: defineComponentFixture({ render: render(modernUI, { partOptions: { labelFormat: "long" }, editors: duplicateNameEditorSpecs() }) }),
    // showIcons
    ShowIconsOff: defineComponentFixture({ render: render(modernUI, { partOptions: { showIcons: false } }) }),
    // decorations (file-decoration badges + colors)
    DecorationsOff: defineComponentFixture({ render: render(modernUI, { partOptions: { decorations: { badges: false, colors: false } } }) }),
    // pinnedTabSizing
    PinnedTabSizingCompact: defineComponentFixture({ render: render(modernUI, { partOptions: { pinnedTabSizing: "compact" }, editors: stickyEditorSpecs() }) }),
    PinnedTabSizingShrink: defineComponentFixture({ render: render(modernUI, { partOptions: { pinnedTabSizing: "shrink" }, editors: stickyEditorSpecs() }) }),
    // titleScrollbarSizing
    TitleScrollbarLarge: defineComponentFixture({ render: render(modernUI, { partOptions: { titleScrollbarSizing: "large" }, editors: manyEditorSpecs(), width: 520 }) }),
    // titleScrollbarVisibility (always-visible scrollbar with overflowing tabs)
    TitleScrollbarVisible: defineComponentFixture({ render: render(modernUI, { partOptions: { titleScrollbarVisibility: "visible" }, editors: manyEditorSpecs(), width: 520 }) }),
    // editorActionsLocation
    EditorActionsDefault: defineComponentFixture({ render: render(modernUI, { partOptions: { editorActionsLocation: "default" } }) }),
    EditorActionsTitleBar: defineComponentFixture({ render: render(modernUI, { partOptions: { editorActionsLocation: "titleBar" } }) }),
    EditorActionsHidden: defineComponentFixture({ render: render(modernUI, { partOptions: { editorActionsLocation: "hidden" } }) }),
    // alwaysShowEditorActions
    AlwaysShowEditorActionsActiveGroup: defineComponentFixture({ render: render(modernUI, { partOptions: { alwaysShowEditorActions: true }, active: true }) }),
    AlwaysShowEditorActionsInactiveGroup: defineComponentFixture({ render: render(modernUI, { partOptions: { alwaysShowEditorActions: true }, active: false }) }),
    // --- UI states / edge cases (not tied to a single setting) ---
    // Active and inactive group styling.
    ActiveGroup: defineComponentFixture({ render: render(modernUI, { active: true }) }),
    InactiveGroup: defineComponentFixture({ render: render(modernUI, { active: false }), additionalThemes }),
    // Multi-selection: several tabs in the selected state at once.
    MultiSelect: defineComponentFixture({ render: render(modernUI, { editors: multiSelectEditorSpecs() }), additionalThemes }),
    // Inactive group with dirty editors: exercises the unfocused modified-border color path.
    InactiveGroupDirty: defineComponentFixture({ render: render(modernUI, { editors: dirtyEditorSpecs(), active: false }) }),
    // Very long labels: tab-label truncation / ellipsis with shrinking tabs.
    LongLabelsShrink: defineComponentFixture({ render: render(modernUI, { partOptions: { tabSizing: "shrink" }, editors: longLabelEditorSpecs(), width: 520 }) }),
    // Drag-and-drop insertion indicator between two tabs.
    DropTargetBetweenTabs: defineComponentFixture({ render: render(modernUI, { dropTargetBetweenTabs: true }), additionalThemes }),
    // --- Notable setting combinations ---
    // Sticky compact tabs with icons disabled: the sticky tab falls back to the
    // first letter of the name instead of an icon.
    StickyCompactNoIcons: defineComponentFixture({ render: render(modernUI, { partOptions: { pinnedTabSizing: "compact", showIcons: false }, editors: stickyEditorSpecs() }) }),
    // Single-tab mode with a dirty editor: the single tab control renders the dirty dot.
    SingleTabDirty: defineComponentFixture({ render: render(modernUI, { partOptions: { showTabs: "single" }, editors: singleDirtyEditorSpecs() }) }),
    // Pinned tabs on a separate row combined with compact pinned sizing.
    PinnedSeparateRowCompact: defineComponentFixture({ render: render(modernUI, { partOptions: { pinnedTabsOnSeparateRow: true, pinnedTabSizing: "compact" }, editors: stickyEditorSpecs() }) })
  };
}
var editorTabBar_fixture_default = defineThemedFixtureGroup({ path: "editor/editorTabBar/" }, {
  ModernUIOff: defineThemedFixtureGroup(createFixtures(false, ["darkHighContrast"])),
  ModernUIOn: defineThemedFixtureGroup(createFixtures(true, ["darkHighContrast"]))
});
export {
  editorTabBar_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvZWRpdG9yL2VkaXRvclRhYkJhci5maXh0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCwgRGltZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9icm93c2VyL2NvbnRleHRLZXlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGxpc3RFcnJvckZvcmVncm91bmQsIGxpc3RXYXJuaW5nRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvcnMvbGlzdENvbG9ycy5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0VGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvdGVzdC9jb21tb24vdGVzdFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyB0ZXN0V29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL3Rlc3QvY29tbW9uL3Rlc3RXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgSVRyZWVWaWV3c0RuRFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RyZWVWaWV3c0RuZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVHJlZVZpZXdzRG5EU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdHJlZVZpZXdzRG5kLmpzJztcbmltcG9ydCB7IEVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dENhcGFiaWxpdGllcywgRWRpdG9yc09yZGVyLCBJRWRpdG9yUGFydE9wdGlvbnMsIElUb29sYmFyQWN0aW9ucywgVmVyYm9zaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JHcm91cE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci9lZGl0b3JHcm91cE1vZGVsLmpzJztcbmltcG9ydCB7IEVESVRPUl9HUk9VUF9IRUFERVJfTk9fVEFCU19CQUNLR1JPVU5ELCBFRElUT1JfR1JPVVBfSEVBREVSX1RBQlNfQkFDS0dST1VORCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0VESVRPUl9QQVJUX09QVElPTlMsIElFZGl0b3JHcm91cHNWaWV3LCBJRWRpdG9yR3JvdXBWaWV3LCBJRWRpdG9yUGFydHNWaWV3IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yLmpzJztcbmltcG9ydCB7IEJyZWFkY3J1bWJzU2VydmljZSwgSUJyZWFkY3J1bWJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2JyZWFkY3J1bWJzLmpzJztcbmltcG9ydCB7IEVkaXRvclRpdGxlQ29udHJvbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclRpdGxlQ29udHJvbC5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbkRhdGEsIElEZWNvcmF0aW9uc1Byb3ZpZGVyLCBJRGVjb3JhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZGVjb3JhdGlvbnMvY29tbW9uL2RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IERlY29yYXRpb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2RlY29yYXRpb25zL2Jyb3dzZXIvZGVjb3JhdGlvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0RvY3VtZW50U2VydmljZSwgTm90ZWJvb2tEb2N1bWVudFdvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tEb2N1bWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU91dGxpbmVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvb3V0bGluZS9icm93c2VyL291dGxpbmUuanMnO1xuaW1wb3J0IHsgTGF5b3V0U2V0dGluZ3MgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgQ29tcG9uZW50Rml4dHVyZUFkZGl0aW9uYWxUaGVtZSwgQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIGRlZmluZUNvbXBvbmVudEZpeHR1cmUsIGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cCB9IGZyb20gJy4uL2ZpeHR1cmVVdGlscy5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL2NvbnRyaWIvc3R5bGVPdmVycmlkZXMvYnJvd3Nlci9tZWRpYS90YWJzLmNzcyc7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEZpeHR1cmUgZWRpdG9yIGlucHV0XG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmludGVyZmFjZSBJRml4dHVyZUVkaXRvcklucHV0T3B0aW9ucyB7XG5cdHJlYWRvbmx5IHR5cGVJZD86IHN0cmluZztcblx0cmVhZG9ubHkgZGlydHk/OiBib29sZWFuO1xuXHRyZWFkb25seSBjYXBhYmlsaXRpZXM/OiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcztcblx0cmVhZG9ubHkgaWNvbj86IFRoZW1lSWNvbiB8IFVSSTtcbn1cblxuLyoqXG4gKiBBIGxpZ2h0d2VpZ2h0IHtAbGluayBFZGl0b3JJbnB1dH0gdXNlZCBwdXJlbHkgdG8gcG9wdWxhdGUgdGhlIHRhYiBiYXIgZm9yXG4gKiBzY3JlZW5zaG90IGZpeHR1cmVzLiBJdCBuZXZlciByZXNvbHZlcyBhIHJlYWwgZWRpdG9yIHBhbmU7IGl0IG9ubHkgcHJvdmlkZXNcbiAqIHRoZSBsYWJlbCwgZGVzY3JpcHRpb24gKGZvbGRlciBwYXRoKSwgaWNvbiBhbmQgZGlydHkgc3RhdGUgdGhhdCB0aGUgdGFiIGJhclxuICogcmVuZGVycy5cbiAqL1xuY2xhc3MgRml4dHVyZUVkaXRvcklucHV0IGV4dGVuZHMgRWRpdG9ySW5wdXQge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHJlc291cmNlOiBVUkksXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSUZpeHR1cmVFZGl0b3JJbnB1dE9wdGlvbnMgPSB7fVxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0IHR5cGVJZCgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5fb3B0aW9ucy50eXBlSWQgPz8gJ3dvcmtiZW5jaC5lZGl0b3JzLmZpeHR1cmVFZGl0b3JJbnB1dCc7IH1cblx0b3ZlcnJpZGUgZ2V0IGVkaXRvcklkKCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLnR5cGVJZDsgfVxuXG5cdG92ZXJyaWRlIGdldCBjYXBhYmlsaXRpZXMoKTogRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMge1xuXHRcdHJldHVybiB0aGlzLl9vcHRpb25zLmNhcGFiaWxpdGllcyA/PyBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5Ob25lO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0TmFtZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiBiYXNlbmFtZSh0aGlzLnJlc291cmNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGEgZGlzdGluY3QgcGFyZW50LWZvbGRlciBsYWJlbCBwZXIge0BsaW5rIFZlcmJvc2l0eX0sIG1hdGNoaW5nIGhvd1xuXHQgKiByZWFsIHJlc291cmNlIGVkaXRvciBpbnB1dHMgdmFyeSB0aGVpciBkZXNjcmlwdGlvbi4gYE11bHRpRWRpdG9yVGFic0NvbnRyb2xgXG5cdCAqIG1hcHMgYGxhYmVsRm9ybWF0YCAoc2hvcnQvbWVkaXVtL2xvbmcpIHRvIGEgdmVyYm9zaXR5LCBzbyBkaXN0aW5jdCB2YWx1ZXNcblx0ICogaGVyZSBhcmUgd2hhdCBtYWtlIHRoZSBsYWJlbC1mb3JtYXQgZml4dHVyZXMgZGlmZmVyLlxuXHQgKi9cblx0b3ZlcnJpZGUgZ2V0RGVzY3JpcHRpb24odmVyYm9zaXR5OiBWZXJib3NpdHkgPSBWZXJib3NpdHkuTUVESVVNKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwYXJlbnQgPSBkaXJuYW1lKHRoaXMucmVzb3VyY2UpO1xuXHRcdGlmIChwYXJlbnQucGF0aCA9PT0gJy8nIHx8IHBhcmVudC5wYXRoID09PSAnLicgfHwgcGFyZW50LnBhdGggPT09ICcnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRzd2l0Y2ggKHZlcmJvc2l0eSkge1xuXHRcdFx0Y2FzZSBWZXJib3NpdHkuU0hPUlQ6XG5cdFx0XHRcdHJldHVybiBiYXNlbmFtZShwYXJlbnQpOyAvLyBjb250YWluaW5nIGZvbGRlciBuYW1lXG5cdFx0XHRjYXNlIFZlcmJvc2l0eS5MT05HOlxuXHRcdFx0XHRyZXR1cm4gcGFyZW50LnBhdGg7IC8vIGZ1bGwgYWJzb2x1dGUgcGF0aFxuXHRcdFx0Y2FzZSBWZXJib3NpdHkuTUVESVVNOlxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0cmV0dXJuIHBhcmVudC5wYXRoLnJlcGxhY2UoL15cXC8vLCAnJyk7IC8vIHBhdGggcmVsYXRpdmUgdG8gcm9vdFxuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGdldEljb24oKTogVGhlbWVJY29uIHwgVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fb3B0aW9ucy5pY29uO1xuXHR9XG5cblx0b3ZlcnJpZGUgaXNEaXJ0eSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISF0aGlzLl9vcHRpb25zLmRpcnR5O1xuXHR9XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEVkaXRvciBzcGVjcyB1c2VkIHRvIHBvcHVsYXRlIHRoZSBncm91cCBtb2RlbFxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5pbnRlcmZhY2UgSUVkaXRvclNwZWMge1xuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXHRyZWFkb25seSB0eXBlSWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRpcnR5PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaWNvbj86IFRoZW1lSWNvbiB8IFVSSTtcblx0cmVhZG9ubHkgY2FwYWJpbGl0aWVzPzogRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXM7XG5cdHJlYWRvbmx5IHBpbm5lZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHN0aWNreT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGFjdGl2ZT86IGJvb2xlYW47XG5cdC8qKiBJbmNsdWRlIHRoaXMgZWRpdG9yIGluIHRoZSBtdWx0aS1zZWxlY3Rpb24gKHRoZSBhY3RpdmUgZWRpdG9yIGlzIGFsd2F5cyBzZWxlY3RlZCkuICovXG5cdHJlYWRvbmx5IHNlbGVjdGVkPzogYm9vbGVhbjtcbn1cblxuZnVuY3Rpb24gZmlsZShwYXRoOiBzdHJpbmcpOiBVUkkge1xuXHRyZXR1cm4gVVJJLmZpbGUocGF0aCk7XG59XG5cbi8qKiBBIHZhcmllZCBzZXQgb2YgZWRpdG9yczogZGlmZmVyZW50IGlucHV0IGtpbmRzLCBmaWxlIG5hbWVzIGFuZCBmb2xkZXIgcGF0aHMuICovXG5mdW5jdGlvbiBkZWZhdWx0RWRpdG9yU3BlY3MoKTogSUVkaXRvclNwZWNbXSB7XG5cdHJldHVybiBbXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3Qvc3JjL2FwcC9tYWluLnRzJyksIGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5zeW1ib2xGaWxlLmlkKSwgc3RpY2t5OiB0cnVlLCBwaW5uZWQ6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9zcmMvYXBwL2luZGV4LnRzJyksIHBpbm5lZDogdHJ1ZSB9LFxuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L1JFQURNRS5tZCcpLCBpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24ubWFya2Rvd24uaWQpLCBwaW5uZWQ6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9wYWNrYWdlLmpzb24nKSwgaWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLmpzb24uaWQpLCBwaW5uZWQ6IHRydWUsIGRpcnR5OiB0cnVlLCBhY3RpdmU6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy51bnRpdGxlZCwgcGF0aDogJ1VudGl0bGVkLTEnIH0pLCB0eXBlSWQ6ICd3b3JrYmVuY2guZWRpdG9ycy51bnRpdGxlZEZpeHR1cmUnLCBpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uZmlsZS5pZCksIHBpbm5lZDogZmFsc2UgLyogcHJldmlldyAqLyB9LFxuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0Ly52c2NvZGUvc2V0dGluZ3MuanNvbicpLCBpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uc2V0dGluZ3NHZWFyLmlkKSwgcGlubmVkOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3Qvc3JjL2FwcC9jb21wb25lbnRzL2J1dHRvbi50c3gnKSwgcGlubmVkOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3QvdGVzdHMvYXBwL21haW4udGVzdC50cycpLCBwaW5uZWQ6IHRydWUgfSxcblx0XTtcbn1cblxuZnVuY3Rpb24gbmVzdGVkQWN0aXZlRWRpdG9yU3BlY3MoKTogSUVkaXRvclNwZWNbXSB7XG5cdHJldHVybiBkZWZhdWx0RWRpdG9yU3BlY3MoKS5tYXAoKHNwZWMsIGluZGV4KSA9PiAoeyAuLi5zcGVjLCBhY3RpdmU6IGluZGV4ID09PSAwIH0pKTtcbn1cblxuLyoqIFR3byBlZGl0b3JzIHNoYXJpbmcgYSBuYW1lIGJ1dCBsaXZpbmcgaW4gZGlmZmVyZW50IGZvbGRlcnMgKHRvIHNob3cgZGVzY3JpcHRpb25zKS4gKi9cbmZ1bmN0aW9uIGR1cGxpY2F0ZU5hbWVFZGl0b3JTcGVjcygpOiBJRWRpdG9yU3BlY1tdIHtcblx0cmV0dXJuIFtcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9zcmMvYXBwL2luZGV4LnRzJyksIHBpbm5lZDogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3Qvc3JjL2xpYi9pbmRleC50cycpLCBwaW5uZWQ6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9zcmMvbGliL3V0aWwvaW5kZXgudHMnKSwgcGlubmVkOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3QvdGVzdHMvaW5kZXgudHMnKSwgcGlubmVkOiB0cnVlIH0sXG5cdF07XG59XG5cbi8qKiBBIGxhcmdlciBzZXQgb2YgZWRpdG9ycywgdXNlZnVsIGZvciB3cmFwcGluZyAvIHNjcm9sbGJhciAvIGxhYmVsIHZhcmlhbnRzLiAqL1xuZnVuY3Rpb24gbWFueUVkaXRvclNwZWNzKCk6IElFZGl0b3JTcGVjW10ge1xuXHRjb25zdCBuYW1lcyA9IFtcblx0XHQnbWFpbi50cycsICdpbmRleC50cycsICdidXR0b24udHN4JywgJ2lucHV0LnRzeCcsICdsaXN0LnRzeCcsICd0cmVlLnRzeCcsXG5cdFx0J21vZGVsLnRzJywgJ3NlcnZpY2UudHMnLCAndmlldy50cycsICdjb250cm9sbGVyLnRzJywgJ3V0aWxzLnRzJywgJ3R5cGVzLnRzJyxcblx0XHQnYXBwLmNzcycsICd0aGVtZS5jc3MnLCAnUkVBRE1FLm1kJywgJ3BhY2thZ2UuanNvbicsXG5cdF07XG5cdHJldHVybiBuYW1lcy5tYXAoKG5hbWUsIGluZGV4KSA9PiAoe1xuXHRcdHJlc291cmNlOiBmaWxlKGAvcHJvamVjdC9zcmMvbW9kdWxlJHtpbmRleCAlIDR9LyR7bmFtZX1gKSxcblx0XHRwaW5uZWQ6IHRydWUsXG5cdFx0YWN0aXZlOiBpbmRleCA9PT0gMCxcblx0XHRkaXJ0eTogaW5kZXggJSA1ID09PSAwLFxuXHR9KSk7XG59XG5cbi8qKiBFZGl0b3JzIHdpdGggZGlydHkgc3RhdGUgdG8gc2hvdyBtb2RpZmllZCBpbmRpY2F0b3JzLiAqL1xuZnVuY3Rpb24gZGlydHlFZGl0b3JTcGVjcygpOiBJRWRpdG9yU3BlY1tdIHtcblx0cmV0dXJuIFtcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9zcmMvYXBwL21haW4udHMnKSwgcGlubmVkOiB0cnVlLCBkaXJ0eTogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3Qvc3JjL2FwcC9pbmRleC50cycpLCBwaW5uZWQ6IHRydWUsIGRpcnR5OiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3QvUkVBRE1FLm1kJyksIHBpbm5lZDogdHJ1ZSB9LFxuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L3BhY2thZ2UuanNvbicpLCBwaW5uZWQ6IHRydWUsIGRpcnR5OiB0cnVlIH0sXG5cdF07XG59XG5cbi8qKiBTdGlja3kgKHBpbm5lZCkgZWRpdG9ycyB0byBzaG93IHRoZSBzdGlja3kgdGFiIHN0eWxpbmcuICovXG5mdW5jdGlvbiBzdGlja3lFZGl0b3JTcGVjcygpOiBJRWRpdG9yU3BlY1tdIHtcblx0cmV0dXJuIFtcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9zcmMvYXBwL21haW4udHMnKSwgaWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLnN5bWJvbEZpbGUuaWQpLCBzdGlja3k6IHRydWUsIHBpbm5lZDogdHJ1ZSB9LFxuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L1JFQURNRS5tZCcpLCBpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24ubWFya2Rvd24uaWQpLCBzdGlja3k6IHRydWUsIHBpbm5lZDogdHJ1ZSB9LFxuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L3BhY2thZ2UuanNvbicpLCBpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uanNvbi5pZCksIHN0aWNreTogdHJ1ZSwgcGlubmVkOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3Qvc3JjL2FwcC9pbmRleC50cycpLCBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9LFxuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L3NyYy9hcHAvY29tcG9uZW50cy9idXR0b24udHN4JyksIHBpbm5lZDogdHJ1ZSB9LFxuXHRdO1xufVxuXG5mdW5jdGlvbiBhbGxTdGlja3lFZGl0b3JTcGVjcygpOiBJRWRpdG9yU3BlY1tdIHtcblx0cmV0dXJuIHN0aWNreUVkaXRvclNwZWNzKCkubWFwKChzcGVjLCBpbmRleCkgPT4gKHsgLi4uc3BlYywgc3RpY2t5OiB0cnVlLCBhY3RpdmU6IGluZGV4ID09PSAwIH0pKTtcbn1cblxuZnVuY3Rpb24gYWxsVW5zdGlja3lFZGl0b3JTcGVjcygpOiBJRWRpdG9yU3BlY1tdIHtcblx0cmV0dXJuIHN0aWNreUVkaXRvclNwZWNzKCkubWFwKChzcGVjLCBpbmRleCkgPT4gKHsgLi4uc3BlYywgc3RpY2t5OiBmYWxzZSwgYWN0aXZlOiBpbmRleCA9PT0gMCB9KSk7XG59XG5cbi8qKiBFZGl0b3JzIHdpdGggc2V2ZXJhbCB0YWJzIGluIHRoZSBtdWx0aS1zZWxlY3Rpb24gKGFjdGl2ZSArIGFkZGl0aW9uYWwgc2VsZWN0ZWQpLiAqL1xuZnVuY3Rpb24gbXVsdGlTZWxlY3RFZGl0b3JTcGVjcygpOiBJRWRpdG9yU3BlY1tdIHtcblx0cmV0dXJuIFtcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9zcmMvYXBwL21haW4udHMnKSwgaWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLnN5bWJvbEZpbGUuaWQpLCBwaW5uZWQ6IHRydWUsIHNlbGVjdGVkOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3Qvc3JjL2FwcC9pbmRleC50cycpLCBwaW5uZWQ6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9SRUFETUUubWQnKSwgaWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLm1hcmtkb3duLmlkKSwgcGlubmVkOiB0cnVlLCBzZWxlY3RlZDogdHJ1ZSB9LFxuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L3BhY2thZ2UuanNvbicpLCBpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uanNvbi5pZCksIHBpbm5lZDogdHJ1ZSwgZGlydHk6IHRydWUsIGFjdGl2ZTogdHJ1ZSwgc2VsZWN0ZWQ6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9zcmMvYXBwL2NvbXBvbmVudHMvYnV0dG9uLnRzeCcpLCBwaW5uZWQ6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC90ZXN0cy9hcHAvbWFpbi50ZXN0LnRzJyksIHBpbm5lZDogdHJ1ZSwgc2VsZWN0ZWQ6IHRydWUgfSxcblx0XTtcbn1cblxuLyoqIEVkaXRvcnMgd2l0aCB2ZXJ5IGxvbmcgbmFtZXMvcGF0aHMgdG8gZXhlcmNpc2UgdGFiLWxhYmVsIHRydW5jYXRpb24gYW5kIGVsbGlwc2lzLiAqL1xuZnVuY3Rpb24gbG9uZ0xhYmVsRWRpdG9yU3BlY3MoKTogSUVkaXRvclNwZWNbXSB7XG5cdHJldHVybiBbXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3Qvc3JjL2ZlYXR1cmVzL2F1dGhlbnRpY2F0aW9uL3Byb3ZpZGVycy92ZXJ5TG9uZ0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJJbXBsZW1lbnRhdGlvbi50cycpLCBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9LFxuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L3NyYy9mZWF0dXJlcy9hdXRoZW50aWNhdGlvbi9wcm92aWRlcnMvYW5vdGhlckV4dHJlbWVseUxvbmdQcm92aWRlckZhY3RvcnlNb2R1bGUudHMnKSwgcGlubmVkOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3QvZG9jdW1lbnRhdGlvbi9hcmNoaXRlY3R1cmUvZGVjaXNpb25zLzAwMDEtdXNlLWEtcmVhbGx5LWxvbmctZGVzY3JpcHRpdmUtZmlsZS1uYW1lLm1kJyksIGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5tYXJrZG93bi5pZCksIHBpbm5lZDogdHJ1ZSB9LFxuXHRdO1xufVxuXG4vKiogQSBzaW5nbGUgZGlydHksIHBpbm5lZCBlZGl0b3IgZm9yIHRoZSBzaW5nbGUtdGFiIGNvbnRyb2wuICovXG5mdW5jdGlvbiBzaW5nbGVEaXJ0eUVkaXRvclNwZWNzKCk6IElFZGl0b3JTcGVjW10ge1xuXHRyZXR1cm4gW1xuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L3NyYy9hcHAvbWFpbi50cycpLCBpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uc3ltYm9sRmlsZS5pZCksIHBpbm5lZDogdHJ1ZSwgZGlydHk6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9LFxuXHRdO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBGaWxlIGRlY29yYXRpb25zXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogRGV0ZXJtaW5pc3RpYyBmaWxlIGRlY29yYXRpb25zIChiYWRnZSBsZXR0ZXIgKyBjb2xvcikga2V5ZWQgYnkgcmVzb3VyY2UgcGF0aC5cbiAqIFRoZXNlIGRyaXZlIHRoZSByZXNvdXJjZS1sYWJlbCBiYWRnZXMvY29sb3JzIHRoYXQgdGhlIGBkZWNvcmF0aW9uc2Agc2V0dGluZ1xuICogdG9nZ2xlcyBcdTIwMTQgZGlydHkgc3RhdGUgYWxvbmUgb25seSBhZmZlY3RzIHRoZSBzZXBhcmF0ZSBtb2RpZmllZC10YWIgaW5kaWNhdG9yLlxuICovXG5jb25zdCBGSVhUVVJFX0RFQ09SQVRJT05TID0gbmV3IE1hcDxzdHJpbmcsIElEZWNvcmF0aW9uRGF0YT4oW1xuXHRbJy9wcm9qZWN0L3BhY2thZ2UuanNvbicsIHsgd2VpZ2h0OiAxMCwgbGV0dGVyOiAnTScsIGNvbG9yOiBsaXN0V2FybmluZ0ZvcmVncm91bmQsIHRvb2x0aXA6ICdNb2RpZmllZCcsIGJ1YmJsZTogZmFsc2UgfV0sXG5cdFsnL3Byb2plY3Qvc3JjL2FwcC9tYWluLnRzJywgeyB3ZWlnaHQ6IDIwLCBsZXR0ZXI6ICcyJywgY29sb3I6IGxpc3RFcnJvckZvcmVncm91bmQsIHRvb2x0aXA6ICcyIHByb2JsZW1zJywgYnViYmxlOiBmYWxzZSB9XSxcblx0WycvcHJvamVjdC9zcmMvYXBwL2luZGV4LnRzJywgeyB3ZWlnaHQ6IDIwLCBsZXR0ZXI6ICdVJywgY29sb3I6IGxpc3RXYXJuaW5nRm9yZWdyb3VuZCwgdG9vbHRpcDogJ1VudHJhY2tlZCcsIGJ1YmJsZTogZmFsc2UgfV0sXG5dKTtcblxuZnVuY3Rpb24gcmVnaXN0ZXJGaXh0dXJlRGVjb3JhdGlvbnMoZGVjb3JhdGlvbnNTZXJ2aWNlOiBJRGVjb3JhdGlvbnNTZXJ2aWNlLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdGNvbnN0IHByb3ZpZGVyOiBJRGVjb3JhdGlvbnNQcm92aWRlciA9IHtcblx0XHRsYWJlbDogJ0ZpeHR1cmUgRGVjb3JhdGlvbnMnLFxuXHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdHByb3ZpZGVEZWNvcmF0aW9ucyh1cmk6IFVSSSwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IElEZWNvcmF0aW9uRGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gRklYVFVSRV9ERUNPUkFUSU9OUy5nZXQodXJpLnBhdGgpO1xuXHRcdH0sXG5cdH07XG5cdHN0b3JlLmFkZChkZWNvcmF0aW9uc1NlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uc1Byb3ZpZGVyKHByb3ZpZGVyKSk7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEVkaXRvci10aXRsZSB0b29sYmFyIGFjdGlvbnNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gY3JlYXRlRml4dHVyZUVkaXRvclRpdGxlQWN0aW9ucyhzdG9yZTogRGlzcG9zYWJsZVN0b3JlLCBtZW51SWQ6IE1lbnVJZCk6IElUb29sYmFyQWN0aW9ucyB7XG5cdGlmIChtZW51SWQgIT09IE1lbnVJZC5FZGl0b3JUaXRsZSkge1xuXHRcdHJldHVybiB7IHByaW1hcnk6IFtdLCBzZWNvbmRhcnk6IFtdIH07XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdHByaW1hcnk6IFtcblx0XHRcdHN0b3JlLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0XHQnZml4dHVyZS5zcGxpdEVkaXRvclJpZ2h0Jyxcblx0XHRcdFx0bG9jYWxpemUoJ2ZpeHR1cmVTcGxpdEVkaXRvclJpZ2h0JywgXCJTcGxpdCBFZGl0b3IgUmlnaHRcIiksXG5cdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnNwbGl0SG9yaXpvbnRhbClcblx0XHRcdCkpXG5cdFx0XSxcblx0XHRzZWNvbmRhcnk6IFtcblx0XHRcdHN0b3JlLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0XHQnZml4dHVyZS5vcGVuRWRpdG9yJyxcblx0XHRcdFx0bG9jYWxpemUoJ2ZpeHR1cmVPcGVuRWRpdG9yJywgXCJPcGVuIEVkaXRvci4uLlwiKSxcblx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZ29Ub0ZpbGUpXG5cdFx0XHQpKVxuXHRcdF1cblx0fTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gUmVuZGVyaW5nXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmludGVyZmFjZSBJUmVuZGVyT3B0aW9ucyB7XG5cdHJlYWRvbmx5IG1vZGVyblVJOiBib29sZWFuO1xuXHRyZWFkb25seSBwYXJ0T3B0aW9ucz86IFBhcnRpYWw8SUVkaXRvclBhcnRPcHRpb25zPjtcblx0cmVhZG9ubHkgZWRpdG9ycz86IElFZGl0b3JTcGVjW107XG5cdHJlYWRvbmx5IGJyZWFkY3J1bWJzPzoge1xuXHRcdHJlYWRvbmx5IGZpbGVQYXRoPzogJ29uJyB8ICdvZmYnIHwgJ2xhc3QnO1xuXHRcdHJlYWRvbmx5IGljb25zPzogYm9vbGVhbjtcblx0fTtcblx0cmVhZG9ubHkgYnJlYWRjcnVtYnNSaWdodEluc2V0PzogbnVtYmVyO1xuXHRyZWFkb25seSB3aWR0aD86IG51bWJlcjtcblx0LyoqIFdoZXRoZXIgdGhpcyBncm91cCBpcyB0aGUgYWN0aXZlIGdyb3VwLiBJbmFjdGl2ZSBncm91cHMgZXhlcmNpc2UgdGhlXG5cdCAqICBgYWx3YXlzU2hvd0VkaXRvckFjdGlvbnNgIGZpbHRlcmluZyBhbmQgdW5mb2N1c2VkIHRhYiBzdHlsaW5nLiAqL1xuXHRyZWFkb25seSBhY3RpdmU/OiBib29sZWFuO1xuXHRyZWFkb25seSBkcm9wVGFyZ2V0QmV0d2VlblRhYnM/OiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQYXJ0T3B0aW9ucyhvdmVycmlkZXM/OiBQYXJ0aWFsPElFZGl0b3JQYXJ0T3B0aW9ucz4pOiBJRWRpdG9yUGFydE9wdGlvbnMge1xuXHRyZXR1cm4ge1xuXHRcdC4uLkRFRkFVTFRfRURJVE9SX1BBUlRfT1BUSU9OUyxcblx0XHRoYXNJY29uczogdHJ1ZSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHBvcHVsYXRlTW9kZWwobW9kZWw6IEVkaXRvckdyb3VwTW9kZWwsIHNwZWNzOiBJRWRpdG9yU3BlY1tdLCBkaXNwb3NhYmxlU3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IHZvaWQge1xuXHQvLyBPcGVuIHN0aWNreSBlZGl0b3JzIGZpcnN0IHNvIHRoZWlyIGluZGljZXMgc3RheSBhdCB0aGUgZnJvbnQuXG5cdGNvbnN0IG9yZGVyZWQgPSBbLi4uc3BlY3NdLnNvcnQoKGEsIGIpID0+IChhLnN0aWNreSA9PT0gYi5zdGlja3kpID8gMCA6IGEuc3RpY2t5ID8gLTEgOiAxKTtcblx0Y29uc3QgaW5wdXRCeVNwZWMgPSBuZXcgTWFwPElFZGl0b3JTcGVjLCBGaXh0dXJlRWRpdG9ySW5wdXQ+KCk7XG5cdGZvciAoY29uc3Qgc3BlYyBvZiBvcmRlcmVkKSB7XG5cdFx0Y29uc3QgaW5wdXQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBGaXh0dXJlRWRpdG9ySW5wdXQoc3BlYy5yZXNvdXJjZSwge1xuXHRcdFx0dHlwZUlkOiBzcGVjLnR5cGVJZCxcblx0XHRcdGRpcnR5OiBzcGVjLmRpcnR5LFxuXHRcdFx0aWNvbjogc3BlYy5pY29uLFxuXHRcdFx0Y2FwYWJpbGl0aWVzOiBzcGVjLmNhcGFiaWxpdGllcyxcblx0XHR9KSk7XG5cdFx0aW5wdXRCeVNwZWMuc2V0KHNwZWMsIGlucHV0KTtcblx0XHRtb2RlbC5vcGVuRWRpdG9yKGlucHV0LCB7XG5cdFx0XHRwaW5uZWQ6IHNwZWMucGlubmVkID8/IHRydWUsXG5cdFx0XHRzdGlja3k6IHNwZWMuc3RpY2t5LFxuXHRcdFx0YWN0aXZlOiBzcGVjLmFjdGl2ZSxcblx0XHR9KTtcblx0fVxuXG5cdC8vIEFwcGx5IG11bHRpLXNlbGVjdGlvbjogdGhlIGFjdGl2ZSBlZGl0b3IgcGx1cyBhbnkgYWRkaXRpb25hbGx5IHNlbGVjdGVkIG9uZXMuXG5cdGNvbnN0IGluYWN0aXZlU2VsZWN0ZWQgPSBvcmRlcmVkLmZpbHRlcihzcGVjID0+IHNwZWMuc2VsZWN0ZWQgJiYgIXNwZWMuYWN0aXZlKS5tYXAoc3BlYyA9PiBpbnB1dEJ5U3BlYy5nZXQoc3BlYykhKTtcblx0aWYgKGluYWN0aXZlU2VsZWN0ZWQubGVuZ3RoICYmIG1vZGVsLmFjdGl2ZUVkaXRvcikge1xuXHRcdG1vZGVsLnNldFNlbGVjdGlvbihtb2RlbC5hY3RpdmVFZGl0b3IsIGluYWN0aXZlU2VsZWN0ZWQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlbmRlclRhYkJhcihjdHg6IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBvcHRpb25zOiBJUmVuZGVyT3B0aW9ucyk6IHZvaWQge1xuXHRjb25zdCB7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlLCB0aGVtZSB9ID0gY3R4O1xuXG5cdGNvbnN0IHdpZHRoID0gb3B0aW9ucy53aWR0aCA/PyA4MjA7XG5cdGNvbnN0IGlzR3JvdXBBY3RpdmUgPSBvcHRpb25zLmFjdGl2ZSA/PyB0cnVlO1xuXHRjb25zdCBwYXJ0T3B0aW9ucyA9IGNyZWF0ZVBhcnRPcHRpb25zKG9wdGlvbnMucGFydE9wdGlvbnMpO1xuXG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignYnJlYWRjcnVtYnMnLCB7XG5cdFx0ZW5hYmxlZDogQm9vbGVhbihvcHRpb25zLmJyZWFkY3J1bWJzKSxcblx0XHRmaWxlUGF0aDogb3B0aW9ucy5icmVhZGNydW1icz8uZmlsZVBhdGggPz8gJ29uJyxcblx0XHRzeW1ib2xQYXRoOiAnb2ZmJyxcblx0XHRpY29uczogb3B0aW9ucy5icmVhZGNydW1icz8uaWNvbnMgPz8gdHJ1ZSxcblx0fSk7XG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLk1PREVSTl9VSSwgb3B0aW9ucy5tb2Rlcm5VSSk7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHR9LCBkaXNwb3NhYmxlU3RvcmUpO1xuXG5cdC8vIEZlZWQgdGhlIGZpeHR1cmUncyB0aGVtZWQgY29sb3JzIHRvIHRoZSBzaGFyZWQgdGhlbWUgc2VydmljZSBzbyB0YWItYmFyIGBnZXRDb2xvciguLi4pYCByZXNvbHZlcy5cblx0KGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVGhlbWVTZXJ2aWNlKSBhcyBUZXN0VGhlbWVTZXJ2aWNlKS5zZXRUaGVtZSh0aGVtZSk7XG5cblx0Ly8gU2VydmljZXMgdGhlIGJhc2Ugd29ya2JlbmNoIGhhcm5lc3MgZG9lcyBub3Qgc3R1YiBidXQgdGhlIHRhYiBiYXIgbmVlZHMuXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRyZWVWaWV3c0RuRFNlcnZpY2UsIG5ldyBUcmVlVmlld3NEbkRTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RlYm9va0RvY3VtZW50U2VydmljZSwgbmV3IE5vdGVib29rRG9jdW1lbnRXb3JrYmVuY2hTZXJ2aWNlKCkpO1xuXG5cdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb250ZXh0S2V5U2VydmljZSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0S2V5U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdGlmIChvcHRpb25zLmJyZWFkY3J1bWJzKSB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQnJlYWRjcnVtYnNTZXJ2aWNlLCBuZXcgQnJlYWRjcnVtYnNTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU91dGxpbmVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElPdXRsaW5lU2VydmljZT4oKSB7IH0oKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG5ldyBUZXN0Q29udGV4dFNlcnZpY2UodGVzdFdvcmtzcGFjZShmaWxlKCcvcHJvamVjdCcpKSkpO1xuXHR9XG5cblx0Ly8gUmVhbCBkZWNvcmF0aW9ucyBzZXJ2aWNlICsgcHJvdmlkZXIgc28gcmVzb3VyY2UgbGFiZWxzIGdldCBkZXRlcm1pbmlzdGljIGJhZGdlcy9jb2xvcnNcblx0Ly8gKHRoZSBgZGVjb3JhdGlvbnNgIHNldHRpbmcgdGhlbiBoYXMgc29tZXRoaW5nIHRvIHRvZ2dsZSkuXG5cdGNvbnN0IGRlY29yYXRpb25zU2VydmljZSA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVjb3JhdGlvbnNTZXJ2aWNlKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURlY29yYXRpb25zU2VydmljZSwgZGVjb3JhdGlvbnNTZXJ2aWNlKTtcblx0cmVnaXN0ZXJGaXh0dXJlRGVjb3JhdGlvbnMoZGVjb3JhdGlvbnNTZXJ2aWNlLCBkaXNwb3NhYmxlU3RvcmUpO1xuXG5cdC8vIFJlYWwgZWRpdG9yIGdyb3VwIG1vZGVsIHBvcHVsYXRlZCB3aXRoIHRoZSBmaXh0dXJlIGVkaXRvcnMuXG5cdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JHcm91cE1vZGVsLCB1bmRlZmluZWQpKTtcblx0cG9wdWxhdGVNb2RlbChtb2RlbCwgb3B0aW9ucy5lZGl0b3JzID8/IGRlZmF1bHRFZGl0b3JTcGVjcygpLCBkaXNwb3NhYmxlU3RvcmUpO1xuXG5cdGNvbnN0IGNyZWF0ZUVkaXRvckFjdGlvbnMgPSAoZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgbWVudUlkOiBNZW51SWQpID0+IHtcblx0XHRyZXR1cm4geyBhY3Rpb25zOiBjcmVhdGVGaXh0dXJlRWRpdG9yVGl0bGVBY3Rpb25zKGRpc3Bvc2FibGVzLCBtZW51SWQpLCBvbkRpZENoYW5nZTogRXZlbnQuTm9uZSB9O1xuXHR9O1xuXG5cdC8vIExpZ2h0d2VpZ2h0IHN0YW5kLWlucyBmb3IgdGhlIHByb2R1Y3Rpb24gYEVkaXRvckdyb3VwVmlld2AgLyBgRWRpdG9yUGFydGAgdmlld3MuXG5cdGNvbnN0IGdyb3VwVmlldyA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvckdyb3VwVmlldz4oKSB7XG5cdFx0cmVsYXlvdXRGbjogKCkgPT4gdm9pZCA9ICgpID0+IHsgfTtcblx0XHRvdmVycmlkZSBnZXQgaWQoKSB7IHJldHVybiBtb2RlbC5pZDsgfVxuXHRcdG92ZXJyaWRlIGdldCBjb3VudCgpIHsgcmV0dXJuIG1vZGVsLmNvdW50OyB9XG5cdFx0b3ZlcnJpZGUgZ2V0IHN0aWNreUNvdW50KCkgeyByZXR1cm4gbW9kZWwuc3RpY2t5Q291bnQ7IH1cblx0XHRvdmVycmlkZSBnZXQgYWN0aXZlRWRpdG9yKCkgeyByZXR1cm4gbW9kZWwuYWN0aXZlRWRpdG9yOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0IGFjdGl2ZUVkaXRvclBhbmUoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRvdmVycmlkZSBnZXQgc2VsZWN0ZWRFZGl0b3JzKCkgeyByZXR1cm4gbW9kZWwuc2VsZWN0ZWRFZGl0b3JzOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0IGFyaWFMYWJlbCgpIHsgcmV0dXJuICdFZGl0b3IgR3JvdXAgMSc7IH1cblx0XHRvdmVycmlkZSBnZXRFZGl0b3JCeUluZGV4KGluZGV4OiBudW1iZXIpIHsgcmV0dXJuIG1vZGVsLmdldEVkaXRvckJ5SW5kZXgoaW5kZXgpOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0SW5kZXhPZkVkaXRvcihlZGl0b3I6IEVkaXRvcklucHV0KSB7IHJldHVybiBtb2RlbC5pbmRleE9mKGVkaXRvcik7IH1cblx0XHRvdmVycmlkZSBnZXRFZGl0b3JzKG9yZGVyOiBFZGl0b3JzT3JkZXIsIG9wdHM/OiB7IGV4Y2x1ZGVTdGlja3k/OiBib29sZWFuIH0pIHsgcmV0dXJuIG1vZGVsLmdldEVkaXRvcnMob3JkZXIsIG9wdHMpOyB9XG5cdFx0b3ZlcnJpZGUgaXNBY3RpdmUoZWRpdG9yOiBFZGl0b3JJbnB1dCkgeyByZXR1cm4gbW9kZWwuaXNBY3RpdmUoZWRpdG9yKTsgfVxuXHRcdG92ZXJyaWRlIGlzUGlubmVkKGVkaXRvck9ySW5kZXg6IEVkaXRvcklucHV0IHwgbnVtYmVyKSB7IHJldHVybiBtb2RlbC5pc1Bpbm5lZChlZGl0b3JPckluZGV4KTsgfVxuXHRcdG92ZXJyaWRlIGlzU3RpY2t5KGVkaXRvck9ySW5kZXg6IEVkaXRvcklucHV0IHwgbnVtYmVyKSB7IHJldHVybiBtb2RlbC5pc1N0aWNreShlZGl0b3JPckluZGV4KTsgfVxuXHRcdG92ZXJyaWRlIGlzU2VsZWN0ZWQoZWRpdG9yT3JJbmRleDogRWRpdG9ySW5wdXQgfCBudW1iZXIpIHsgcmV0dXJuIG1vZGVsLmlzU2VsZWN0ZWQoZWRpdG9yT3JJbmRleCk7IH1cblx0XHRvdmVycmlkZSBjcmVhdGVFZGl0b3JBY3Rpb25zKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIG1lbnVJZCA9IE1lbnVJZC5FZGl0b3JUaXRsZSkgeyByZXR1cm4gY3JlYXRlRWRpdG9yQWN0aW9ucyhkaXNwb3NhYmxlcywgbWVudUlkKTsgfVxuXHRcdG92ZXJyaWRlIHJlbGF5b3V0KCkgeyB0aGlzLnJlbGF5b3V0Rm4oKTsgfVxuXHR9O1xuXG5cdC8vIFNlcGFyYXRlIHJlZmVyZW5jZSByZXR1cm5lZCBhcyB0aGUgYWN0aXZlIGdyb3VwIHdoZW4gdGhpcyBncm91cCBpcyBpbmFjdGl2ZSwgc28gdGhhdFxuXHQvLyBgZ3JvdXBzVmlldy5hY3RpdmVHcm91cCA9PT0gZ3JvdXBWaWV3YCBpcyBmYWxzZSBhbmQgaW5hY3RpdmUtZ3JvdXAgYmVoYXZpb3IgaXMgZXhlcmNpc2VkLlxuXHRjb25zdCBvdGhlckFjdGl2ZUdyb3VwID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yR3JvdXBWaWV3PigpIHtcblx0XHRvdmVycmlkZSBmb2N1cygpIHsgfVxuXHR9O1xuXG5cdGNvbnN0IGdyb3Vwc1ZpZXcgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JHcm91cHNWaWV3PigpIHtcblx0XHRvdmVycmlkZSBnZXQgcGFydE9wdGlvbnMoKSB7IHJldHVybiBwYXJ0T3B0aW9uczsgfVxuXHRcdG92ZXJyaWRlIGdldCBhY3RpdmVHcm91cCgpIHsgcmV0dXJuIGlzR3JvdXBBY3RpdmUgPyBncm91cFZpZXcgOiBvdGhlckFjdGl2ZUdyb3VwOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0IGdyb3VwcygpIHsgcmV0dXJuIFtncm91cFZpZXddOyB9XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VFZGl0b3JQYXJ0T3B0aW9ucyA9IEV2ZW50Lk5vbmU7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRWaXNpYmlsaXR5Q2hhbmdlID0gRXZlbnQuTm9uZTtcblx0fTtcblxuXHRjb25zdCBlZGl0b3JQYXJ0c1ZpZXcgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JQYXJ0c1ZpZXc+KCkge1xuXHRcdG92ZXJyaWRlIGdldCBjb3VudCgpIHsgcmV0dXJuIDE7IH1cblx0XHRvdmVycmlkZSBnZXRHcm91cCgpIHsgcmV0dXJuIGdyb3VwVmlldzsgfVxuXHR9O1xuXG5cdC8vIFJlY3JlYXRlIHRoZSBhbmNlc3RvciBjaGFpbiB0aGUgdGFiLWJhciBDU1MgaXMgc2NvcGVkIHRvOyB0aGUgZml4dHVyZSBjb250YWluZXIgYWxyZWFkeVxuXHQvLyBjYXJyaWVzIGAubW9uYWNvLXdvcmtiZW5jaGAgKyB0aGVtZSBjbGFzc2VzLlxuXHRjb25zdCBlZGl0b3JQYXJ0ID0gJCgnLnBhcnQuZWRpdG9yJyk7XG5cdGNvbnN0IGNvbnRlbnQgPSAkKCcuY29udGVudCcpO1xuXHRjb25zdCBncm91cENvbnRhaW5lciA9ICQoaXNHcm91cEFjdGl2ZSA/ICcuZWRpdG9yLWdyb3VwLWNvbnRhaW5lci5hY3RpdmUnIDogJy5lZGl0b3ItZ3JvdXAtY29udGFpbmVyJyk7XG5cdGNvbnN0IHRpdGxlQ29udGFpbmVyID0gJCgnLnRpdGxlJyk7XG5cdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzdHlsZS1vdmVycmlkZScsIG9wdGlvbnMubW9kZXJuVUkpO1xuXHR0aXRsZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd0YWJzJywgcGFydE9wdGlvbnMuc2hvd1RhYnMgPT09ICdtdWx0aXBsZScpO1xuXHR0aXRsZUNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzaG93LWZpbGUtaWNvbnMnLCBwYXJ0T3B0aW9ucy5zaG93SWNvbnMpO1xuXG5cdGNvbnN0IGhlYWRlckJhY2tncm91bmQgPSB0aGVtZS5nZXRDb2xvcihwYXJ0T3B0aW9ucy5zaG93VGFicyA9PT0gJ211bHRpcGxlJyA/IEVESVRPUl9HUk9VUF9IRUFERVJfVEFCU19CQUNLR1JPVU5EIDogRURJVE9SX0dST1VQX0hFQURFUl9OT19UQUJTX0JBQ0tHUk9VTkQpO1xuXHRpZiAoaGVhZGVyQmFja2dyb3VuZCkge1xuXHRcdHRpdGxlQ29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9IGhlYWRlckJhY2tncm91bmQudG9TdHJpbmcoKTtcblx0fVxuXG5cdGNvbnN0IGVkaXRvckNvbnRhaW5lciA9ICQoJy5lZGl0b3ItY29udGFpbmVyJyk7XG5cdGVkaXRvckNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnOTZweCc7XG5cdGVkaXRvckNvbnRhaW5lci5zdHlsZS5vcGFjaXR5ID0gJzAuNic7XG5cblx0ZWRpdG9yUGFydC5hcHBlbmRDaGlsZChjb250ZW50KTtcblx0Y29udGVudC5hcHBlbmRDaGlsZChncm91cENvbnRhaW5lcik7XG5cdGdyb3VwQ29udGFpbmVyLmFwcGVuZENoaWxkKHRpdGxlQ29udGFpbmVyKTtcblx0Z3JvdXBDb250YWluZXIuYXBwZW5kQ2hpbGQoZWRpdG9yQ29udGFpbmVyKTtcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGVkaXRvclBhcnQpO1xuXG5cdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0Z3JvdXBDb250YWluZXIuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cblx0Y29uc3QgdGl0bGVDb250cm9sID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRFZGl0b3JUaXRsZUNvbnRyb2wsXG5cdFx0dGl0bGVDb250YWluZXIsXG5cdFx0ZWRpdG9yUGFydHNWaWV3LFxuXHRcdGdyb3Vwc1ZpZXcsXG5cdFx0Z3JvdXBWaWV3LFxuXHRcdG1vZGVsLFxuXHRcdHVuZGVmaW5lZCxcblx0KSk7XG5cblx0Y29uc3QgbGF5b3V0ID0gKCkgPT4ge1xuXHRcdHRpdGxlQ29udHJvbC5sYXlvdXQoe1xuXHRcdFx0Y29udGFpbmVyOiBuZXcgRGltZW5zaW9uKHdpZHRoLCB0aXRsZUNvbnRyb2wuZ2V0SGVpZ2h0KCkudG90YWwpLFxuXHRcdFx0YXZhaWxhYmxlOiBuZXcgRGltZW5zaW9uKHdpZHRoLCAyMDApLFxuXHRcdH0sIG9wdGlvbnMuYnJlYWRjcnVtYnNSaWdodEluc2V0KTtcblx0fTtcblx0Z3JvdXBWaWV3LnJlbGF5b3V0Rm4gPSBsYXlvdXQ7XG5cblx0dGl0bGVDb250cm9sLm9wZW5FZGl0b3JzKG1vZGVsLmdldEVkaXRvcnMoRWRpdG9yc09yZGVyLlNFUVVFTlRJQUwpKTtcblx0dGl0bGVDb250cm9sLnNldEFjdGl2ZShpc0dyb3VwQWN0aXZlKTtcblx0aWYgKG9wdGlvbnMuZHJvcFRhcmdldEJldHdlZW5UYWJzKSB7XG5cdFx0Y29uc3QgdGFicyA9IHRpdGxlQ29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGw8SFRNTEVsZW1lbnQ+KCcudGFicy1jb250YWluZXIgPiAudGFiJyk7XG5cdFx0dGFic1sxXT8uY2xhc3NMaXN0LmFkZCgnZHJvcC10YXJnZXQtbGVmdCcpO1xuXHRcdHRhYnNbMl0/LmNsYXNzTGlzdC5hZGQoJ2Ryb3AtdGFyZ2V0LXJpZ2h0Jyk7XG5cdH1cblx0bGF5b3V0KCk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlcihtb2Rlcm5VSTogYm9vbGVhbiwgb3B0aW9uczogT21pdDxJUmVuZGVyT3B0aW9ucywgJ21vZGVyblVJJz4pOiAoY3R4OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCkgPT4gdm9pZCB7XG5cdHJldHVybiAoY3R4OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCkgPT4gcmVuZGVyVGFiQmFyKGN0eCwgeyAuLi5vcHRpb25zLCBtb2Rlcm5VSSB9KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRml4dHVyZXMobW9kZXJuVUk6IGJvb2xlYW4sIGFkZGl0aW9uYWxUaGVtZXM6IHJlYWRvbmx5IENvbXBvbmVudEZpeHR1cmVBZGRpdGlvbmFsVGhlbWVbXSA9IFtdKSB7XG5cdHJldHVybiB7XG5cdFx0Ly8gQmFzZWxpbmU6IG11bHRpcGxlIHRhYnMgd2l0aCBtaXhlZCBzdGlja3kgLyBwaW5uZWQgLyBwcmV2aWV3IC8gZGlydHkgc3RhdGUuXG5cdFx0RGVmYXVsdDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7fSksIGFkZGl0aW9uYWxUaGVtZXMgfSksXG5cblx0XHQvLyBzaG93VGFic1xuXHRcdFNob3dUYWJzU2luZ2xlOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgc2hvd1RhYnM6ICdzaW5nbGUnIH0sIGJyZWFkY3J1bWJzOiB7fSB9KSB9KSxcblx0XHRTaG93VGFic05vbmU6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBzaG93VGFiczogJ25vbmUnIH0gfSkgfSksXG5cblx0XHQvLyBwaW5uZWRUYWJzT25TZXBhcmF0ZVJvd1xuXHRcdFBpbm5lZFRhYnNPblNlcGFyYXRlUm93QWxsUGlubmVkOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgcGlubmVkVGFic09uU2VwYXJhdGVSb3c6IHRydWUgfSwgZWRpdG9yczogYWxsU3RpY2t5RWRpdG9yU3BlY3MoKSB9KSB9KSxcblx0XHRQaW5uZWRUYWJzT25TZXBhcmF0ZVJvd0FsbFVucGlubmVkOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgcGlubmVkVGFic09uU2VwYXJhdGVSb3c6IHRydWUgfSwgZWRpdG9yczogYWxsVW5zdGlja3lFZGl0b3JTcGVjcygpIH0pIH0pLFxuXHRcdFBpbm5lZFRhYnNPblNlcGFyYXRlUm93TWl4ZWQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBwaW5uZWRUYWJzT25TZXBhcmF0ZVJvdzogdHJ1ZSB9LCBlZGl0b3JzOiBzdGlja3lFZGl0b3JTcGVjcygpIH0pLCBhZGRpdGlvbmFsVGhlbWVzIH0pLFxuXG5cdFx0Ly8gYnJlYWRjcnVtYnNcblx0XHRCcmVhZGNydW1ic0ZpbGVQYXRoTGFzdDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IGJyZWFkY3J1bWJzOiB7IGZpbGVQYXRoOiAnbGFzdCcgfSwgZWRpdG9yczogbmVzdGVkQWN0aXZlRWRpdG9yU3BlY3MoKSB9KSB9KSxcblx0XHRCcmVhZGNydW1ic0ljb25zT2ZmOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgYnJlYWRjcnVtYnM6IHsgaWNvbnM6IGZhbHNlIH0gfSkgfSksXG5cdFx0QnJlYWRjcnVtYnNXaXRoUmlnaHRJbnNldDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IGJyZWFkY3J1bWJzOiB7fSwgYnJlYWRjcnVtYnNSaWdodEluc2V0OiAzMDAgfSkgfSksXG5cblx0XHQvLyB0YWJTaXppbmdcblx0XHRUYWJTaXppbmdTaHJpbms6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyB0YWJTaXppbmc6ICdzaHJpbmsnIH0sIGVkaXRvcnM6IG1hbnlFZGl0b3JTcGVjcygpIH0pIH0pLFxuXHRcdFRhYlNpemluZ0ZpeGVkOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgdGFiU2l6aW5nOiAnZml4ZWQnLCB0YWJTaXppbmdGaXhlZE1pbldpZHRoOiA2MCwgdGFiU2l6aW5nRml4ZWRNYXhXaWR0aDogMTIwIH0sIGVkaXRvcnM6IG1hbnlFZGl0b3JTcGVjcygpIH0pIH0pLFxuXG5cdFx0Ly8gdGFiSGVpZ2h0XG5cdFx0VGFiSGVpZ2h0Q29tcGFjdDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IHRhYkhlaWdodDogJ2NvbXBhY3QnIH0gfSkgfSksXG5cblx0XHQvLyB3cmFwVGFic1xuXHRcdFdyYXBUYWJzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgd3JhcFRhYnM6IHRydWUgfSwgZWRpdG9yczogbWFueUVkaXRvclNwZWNzKCksIHdpZHRoOiA1MjAgfSkgfSksXG5cblx0XHQvLyB0YWJBY3Rpb25Mb2NhdGlvblxuXHRcdFRhYkFjdGlvbkxvY2F0aW9uTGVmdDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IHRhYkFjdGlvbkxvY2F0aW9uOiAnbGVmdCcgfSB9KSB9KSxcblxuXHRcdC8vIHRhYkFjdGlvbkNsb3NlVmlzaWJpbGl0eVxuXHRcdFRhYkFjdGlvbkNsb3NlSGlkZGVuOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgdGFiQWN0aW9uQ2xvc2VWaXNpYmlsaXR5OiBmYWxzZSB9IH0pIH0pLFxuXG5cdFx0Ly8gdGFiQWN0aW9uVW5waW5WaXNpYmlsaXR5ICh3aXRoIHN0aWNreS9jb21wYWN0IHRhYnMgd2hlcmUgdGhlIHVucGluIGFjdGlvbiBzaG93cylcblx0XHRUYWJBY3Rpb25VbnBpbkhpZGRlbjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IHRhYkFjdGlvblVucGluVmlzaWJpbGl0eTogZmFsc2UsIHBpbm5lZFRhYlNpemluZzogJ25vcm1hbCcgfSwgZWRpdG9yczogc3RpY2t5RWRpdG9yU3BlY3MoKSB9KSB9KSxcblxuXHRcdC8vIHNob3dUYWJJbmRleFxuXHRcdFNob3dUYWJJbmRleDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IHNob3dUYWJJbmRleDogdHJ1ZSB9IH0pIH0pLFxuXG5cdFx0Ly8gaGlnaGxpZ2h0TW9kaWZpZWRUYWJzXG5cdFx0SGlnaGxpZ2h0TW9kaWZpZWRUYWJzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgaGlnaGxpZ2h0TW9kaWZpZWRUYWJzOiB0cnVlIH0sIGVkaXRvcnM6IGRpcnR5RWRpdG9yU3BlY3MoKSB9KSB9KSxcblxuXHRcdC8vIGxhYmVsRm9ybWF0XG5cdFx0TGFiZWxGb3JtYXRTaG9ydDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IGxhYmVsRm9ybWF0OiAnc2hvcnQnIH0sIGVkaXRvcnM6IGR1cGxpY2F0ZU5hbWVFZGl0b3JTcGVjcygpIH0pIH0pLFxuXHRcdExhYmVsRm9ybWF0TWVkaXVtOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgbGFiZWxGb3JtYXQ6ICdtZWRpdW0nIH0sIGVkaXRvcnM6IGR1cGxpY2F0ZU5hbWVFZGl0b3JTcGVjcygpIH0pIH0pLFxuXHRcdExhYmVsRm9ybWF0TG9uZzogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IGxhYmVsRm9ybWF0OiAnbG9uZycgfSwgZWRpdG9yczogZHVwbGljYXRlTmFtZUVkaXRvclNwZWNzKCkgfSkgfSksXG5cblx0XHQvLyBzaG93SWNvbnNcblx0XHRTaG93SWNvbnNPZmY6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBzaG93SWNvbnM6IGZhbHNlIH0gfSkgfSksXG5cblx0XHQvLyBkZWNvcmF0aW9ucyAoZmlsZS1kZWNvcmF0aW9uIGJhZGdlcyArIGNvbG9ycylcblx0XHREZWNvcmF0aW9uc09mZjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IGRlY29yYXRpb25zOiB7IGJhZGdlczogZmFsc2UsIGNvbG9yczogZmFsc2UgfSB9IH0pIH0pLFxuXG5cdFx0Ly8gcGlubmVkVGFiU2l6aW5nXG5cdFx0UGlubmVkVGFiU2l6aW5nQ29tcGFjdDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IHBpbm5lZFRhYlNpemluZzogJ2NvbXBhY3QnIH0sIGVkaXRvcnM6IHN0aWNreUVkaXRvclNwZWNzKCkgfSkgfSksXG5cdFx0UGlubmVkVGFiU2l6aW5nU2hyaW5rOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgcGlubmVkVGFiU2l6aW5nOiAnc2hyaW5rJyB9LCBlZGl0b3JzOiBzdGlja3lFZGl0b3JTcGVjcygpIH0pIH0pLFxuXG5cdFx0Ly8gdGl0bGVTY3JvbGxiYXJTaXppbmdcblx0XHRUaXRsZVNjcm9sbGJhckxhcmdlOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgdGl0bGVTY3JvbGxiYXJTaXppbmc6ICdsYXJnZScgfSwgZWRpdG9yczogbWFueUVkaXRvclNwZWNzKCksIHdpZHRoOiA1MjAgfSkgfSksXG5cblx0XHQvLyB0aXRsZVNjcm9sbGJhclZpc2liaWxpdHkgKGFsd2F5cy12aXNpYmxlIHNjcm9sbGJhciB3aXRoIG92ZXJmbG93aW5nIHRhYnMpXG5cdFx0VGl0bGVTY3JvbGxiYXJWaXNpYmxlOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgdGl0bGVTY3JvbGxiYXJWaXNpYmlsaXR5OiAndmlzaWJsZScgfSwgZWRpdG9yczogbWFueUVkaXRvclNwZWNzKCksIHdpZHRoOiA1MjAgfSkgfSksXG5cblx0XHQvLyBlZGl0b3JBY3Rpb25zTG9jYXRpb25cblx0XHRFZGl0b3JBY3Rpb25zRGVmYXVsdDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IGVkaXRvckFjdGlvbnNMb2NhdGlvbjogJ2RlZmF1bHQnIH0gfSkgfSksXG5cdFx0RWRpdG9yQWN0aW9uc1RpdGxlQmFyOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgZWRpdG9yQWN0aW9uc0xvY2F0aW9uOiAndGl0bGVCYXInIH0gfSkgfSksXG5cdFx0RWRpdG9yQWN0aW9uc0hpZGRlbjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IGVkaXRvckFjdGlvbnNMb2NhdGlvbjogJ2hpZGRlbicgfSB9KSB9KSxcblxuXHRcdC8vIGFsd2F5c1Nob3dFZGl0b3JBY3Rpb25zXG5cdFx0QWx3YXlzU2hvd0VkaXRvckFjdGlvbnNBY3RpdmVHcm91cDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IGFsd2F5c1Nob3dFZGl0b3JBY3Rpb25zOiB0cnVlIH0sIGFjdGl2ZTogdHJ1ZSB9KSB9KSxcblx0XHRBbHdheXNTaG93RWRpdG9yQWN0aW9uc0luYWN0aXZlR3JvdXA6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBhbHdheXNTaG93RWRpdG9yQWN0aW9uczogdHJ1ZSB9LCBhY3RpdmU6IGZhbHNlIH0pIH0pLFxuXG5cdFx0Ly8gLS0tIFVJIHN0YXRlcyAvIGVkZ2UgY2FzZXMgKG5vdCB0aWVkIHRvIGEgc2luZ2xlIHNldHRpbmcpIC0tLVxuXG5cdFx0Ly8gQWN0aXZlIGFuZCBpbmFjdGl2ZSBncm91cCBzdHlsaW5nLlxuXHRcdEFjdGl2ZUdyb3VwOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgYWN0aXZlOiB0cnVlIH0pIH0pLFxuXHRcdEluYWN0aXZlR3JvdXA6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBhY3RpdmU6IGZhbHNlIH0pLCBhZGRpdGlvbmFsVGhlbWVzIH0pLFxuXG5cdFx0Ly8gTXVsdGktc2VsZWN0aW9uOiBzZXZlcmFsIHRhYnMgaW4gdGhlIHNlbGVjdGVkIHN0YXRlIGF0IG9uY2UuXG5cdFx0TXVsdGlTZWxlY3Q6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBlZGl0b3JzOiBtdWx0aVNlbGVjdEVkaXRvclNwZWNzKCkgfSksIGFkZGl0aW9uYWxUaGVtZXMgfSksXG5cblx0XHQvLyBJbmFjdGl2ZSBncm91cCB3aXRoIGRpcnR5IGVkaXRvcnM6IGV4ZXJjaXNlcyB0aGUgdW5mb2N1c2VkIG1vZGlmaWVkLWJvcmRlciBjb2xvciBwYXRoLlxuXHRcdEluYWN0aXZlR3JvdXBEaXJ0eTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IGVkaXRvcnM6IGRpcnR5RWRpdG9yU3BlY3MoKSwgYWN0aXZlOiBmYWxzZSB9KSB9KSxcblxuXHRcdC8vIFZlcnkgbG9uZyBsYWJlbHM6IHRhYi1sYWJlbCB0cnVuY2F0aW9uIC8gZWxsaXBzaXMgd2l0aCBzaHJpbmtpbmcgdGFicy5cblx0XHRMb25nTGFiZWxzU2hyaW5rOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgdGFiU2l6aW5nOiAnc2hyaW5rJyB9LCBlZGl0b3JzOiBsb25nTGFiZWxFZGl0b3JTcGVjcygpLCB3aWR0aDogNTIwIH0pIH0pLFxuXG5cdFx0Ly8gRHJhZy1hbmQtZHJvcCBpbnNlcnRpb24gaW5kaWNhdG9yIGJldHdlZW4gdHdvIHRhYnMuXG5cdFx0RHJvcFRhcmdldEJldHdlZW5UYWJzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgZHJvcFRhcmdldEJldHdlZW5UYWJzOiB0cnVlIH0pLCBhZGRpdGlvbmFsVGhlbWVzIH0pLFxuXG5cdFx0Ly8gLS0tIE5vdGFibGUgc2V0dGluZyBjb21iaW5hdGlvbnMgLS0tXG5cblx0XHQvLyBTdGlja3kgY29tcGFjdCB0YWJzIHdpdGggaWNvbnMgZGlzYWJsZWQ6IHRoZSBzdGlja3kgdGFiIGZhbGxzIGJhY2sgdG8gdGhlXG5cdFx0Ly8gZmlyc3QgbGV0dGVyIG9mIHRoZSBuYW1lIGluc3RlYWQgb2YgYW4gaWNvbi5cblx0XHRTdGlja3lDb21wYWN0Tm9JY29uczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IHBpbm5lZFRhYlNpemluZzogJ2NvbXBhY3QnLCBzaG93SWNvbnM6IGZhbHNlIH0sIGVkaXRvcnM6IHN0aWNreUVkaXRvclNwZWNzKCkgfSkgfSksXG5cblx0XHQvLyBTaW5nbGUtdGFiIG1vZGUgd2l0aCBhIGRpcnR5IGVkaXRvcjogdGhlIHNpbmdsZSB0YWIgY29udHJvbCByZW5kZXJzIHRoZSBkaXJ0eSBkb3QuXG5cdFx0U2luZ2xlVGFiRGlydHk6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBzaG93VGFiczogJ3NpbmdsZScgfSwgZWRpdG9yczogc2luZ2xlRGlydHlFZGl0b3JTcGVjcygpIH0pIH0pLFxuXG5cdFx0Ly8gUGlubmVkIHRhYnMgb24gYSBzZXBhcmF0ZSByb3cgY29tYmluZWQgd2l0aCBjb21wYWN0IHBpbm5lZCBzaXppbmcuXG5cdFx0UGlubmVkU2VwYXJhdGVSb3dDb21wYWN0OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgcGlubmVkVGFic09uU2VwYXJhdGVSb3c6IHRydWUsIHBpbm5lZFRhYlNpemluZzogJ2NvbXBhY3QnIH0sIGVkaXRvcnM6IHN0aWNreUVkaXRvclNwZWNzKCkgfSkgfSksXG5cdH07XG59XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cCh7IHBhdGg6ICdlZGl0b3IvZWRpdG9yVGFiQmFyLycgfSwge1xuXHRNb2Rlcm5VSU9mZjogZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKGNyZWF0ZUZpeHR1cmVzKGZhbHNlLCBbJ2RhcmtIaWdoQ29udHJhc3QnXSkpLFxuXHRNb2Rlcm5VSU9uOiBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAoY3JlYXRlRml4dHVyZXModHJ1ZSwgWydkYXJrSGlnaENvbnRyYXN0J10pKSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxHQUFHLGlCQUFpQjtBQUM3QixTQUFTLGNBQWM7QUFFdkIsU0FBUyxhQUFhO0FBRXRCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFVBQVUsZUFBZTtBQUNsQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUNyQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxxQkFBcUIsNkJBQTZCO0FBQzNELFNBQVMscUJBQXFCO0FBRTlCLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMseUJBQXlCLGNBQW1ELGlCQUFpQjtBQUN0RyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHdDQUF3QywyQ0FBMkM7QUFDNUYsU0FBUyxtQ0FBMEY7QUFDbkcsU0FBUyxvQkFBb0IsMkJBQTJCO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQWdELDJCQUEyQjtBQUMzRSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDBCQUEwQix3Q0FBd0M7QUFDM0UsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBbUUsd0JBQXdCLGdDQUFnQztBQUMzSCxPQUFPO0FBbUJQLE1BQU0sMkJBQTJCLFlBQVk7QUFBQSxFQUU1QyxZQUNVLFVBQ1EsV0FBdUMsQ0FBQyxHQUN4RDtBQUNELFVBQU07QUFIRztBQUNRO0FBQUEsRUFHbEI7QUFBQSxFQUVBLElBQWEsU0FBaUI7QUFBRSxXQUFPLEtBQUssU0FBUyxVQUFVO0FBQUEsRUFBd0M7QUFBQSxFQUN2RyxJQUFhLFdBQStCO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBUTtBQUFBLEVBRWxFLElBQWEsZUFBd0M7QUFDcEQsV0FBTyxLQUFLLFNBQVMsZ0JBQWdCLHdCQUF3QjtBQUFBLEVBQzlEO0FBQUEsRUFFUyxVQUFrQjtBQUMxQixXQUFPLFNBQVMsS0FBSyxRQUFRO0FBQUEsRUFDOUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFTLGVBQWUsWUFBdUIsVUFBVSxRQUE0QjtBQUNwRixVQUFNLFNBQVMsUUFBUSxLQUFLLFFBQVE7QUFDcEMsUUFBSSxPQUFPLFNBQVMsT0FBTyxPQUFPLFNBQVMsT0FBTyxPQUFPLFNBQVMsSUFBSTtBQUNyRSxhQUFPO0FBQUEsSUFDUjtBQUNBLFlBQVEsV0FBVztBQUFBLE1BQ2xCLEtBQUssVUFBVTtBQUNkLGVBQU8sU0FBUyxNQUFNO0FBQUE7QUFBQSxNQUN2QixLQUFLLFVBQVU7QUFDZCxlQUFPLE9BQU87QUFBQTtBQUFBLE1BQ2YsS0FBSyxVQUFVO0FBQUEsTUFDZjtBQUNDLGVBQU8sT0FBTyxLQUFLLFFBQVEsT0FBTyxFQUFFO0FBQUEsSUFDdEM7QUFBQSxFQUNEO0FBQUEsRUFFUyxVQUF1QztBQUMvQyxXQUFPLEtBQUssU0FBUztBQUFBLEVBQ3RCO0FBQUEsRUFFUyxVQUFtQjtBQUMzQixXQUFPLENBQUMsQ0FBQyxLQUFLLFNBQVM7QUFBQSxFQUN4QjtBQUNEO0FBbUJBLFNBQVMsS0FBSyxNQUFtQjtBQUNoQyxTQUFPLElBQUksS0FBSyxJQUFJO0FBQ3JCO0FBR0EsU0FBUyxxQkFBb0M7QUFDNUMsU0FBTztBQUFBLElBQ04sRUFBRSxVQUFVLEtBQUssMEJBQTBCLEdBQUcsTUFBTSxVQUFVLE9BQU8sUUFBUSxXQUFXLEVBQUUsR0FBRyxRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsSUFDeEgsRUFBRSxVQUFVLEtBQUssMkJBQTJCLEdBQUcsUUFBUSxLQUFLO0FBQUEsSUFDNUQsRUFBRSxVQUFVLEtBQUssb0JBQW9CLEdBQUcsTUFBTSxVQUFVLE9BQU8sUUFBUSxTQUFTLEVBQUUsR0FBRyxRQUFRLEtBQUs7QUFBQSxJQUNsRyxFQUFFLFVBQVUsS0FBSyx1QkFBdUIsR0FBRyxNQUFNLFVBQVUsT0FBTyxRQUFRLEtBQUssRUFBRSxHQUFHLFFBQVEsTUFBTSxPQUFPLE1BQU0sUUFBUSxLQUFLO0FBQUEsSUFDNUg7QUFBQSxNQUFFLFVBQVUsSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLFVBQVUsTUFBTSxhQUFhLENBQUM7QUFBQSxNQUFHLFFBQVE7QUFBQSxNQUFxQyxNQUFNLFVBQVUsT0FBTyxRQUFRLEtBQUssRUFBRTtBQUFBLE1BQUcsUUFBUTtBQUFBO0FBQUEsSUFBb0I7QUFBQSxJQUMxTCxFQUFFLFVBQVUsS0FBSyxnQ0FBZ0MsR0FBRyxNQUFNLFVBQVUsT0FBTyxRQUFRLGFBQWEsRUFBRSxHQUFHLFFBQVEsS0FBSztBQUFBLElBQ2xILEVBQUUsVUFBVSxLQUFLLHdDQUF3QyxHQUFHLFFBQVEsS0FBSztBQUFBLElBQ3pFLEVBQUUsVUFBVSxLQUFLLGlDQUFpQyxHQUFHLFFBQVEsS0FBSztBQUFBLEVBQ25FO0FBQ0Q7QUFFQSxTQUFTLDBCQUF5QztBQUNqRCxTQUFPLG1CQUFtQixFQUFFLElBQUksQ0FBQyxNQUFNLFdBQVcsRUFBRSxHQUFHLE1BQU0sUUFBUSxVQUFVLEVBQUUsRUFBRTtBQUNwRjtBQUdBLFNBQVMsMkJBQTBDO0FBQ2xELFNBQU87QUFBQSxJQUNOLEVBQUUsVUFBVSxLQUFLLDJCQUEyQixHQUFHLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxJQUMxRSxFQUFFLFVBQVUsS0FBSywyQkFBMkIsR0FBRyxRQUFRLEtBQUs7QUFBQSxJQUM1RCxFQUFFLFVBQVUsS0FBSyxnQ0FBZ0MsR0FBRyxRQUFRLEtBQUs7QUFBQSxJQUNqRSxFQUFFLFVBQVUsS0FBSyx5QkFBeUIsR0FBRyxRQUFRLEtBQUs7QUFBQSxFQUMzRDtBQUNEO0FBR0EsU0FBUyxrQkFBaUM7QUFDekMsUUFBTSxRQUFRO0FBQUEsSUFDYjtBQUFBLElBQVc7QUFBQSxJQUFZO0FBQUEsSUFBYztBQUFBLElBQWE7QUFBQSxJQUFZO0FBQUEsSUFDOUQ7QUFBQSxJQUFZO0FBQUEsSUFBYztBQUFBLElBQVc7QUFBQSxJQUFpQjtBQUFBLElBQVk7QUFBQSxJQUNsRTtBQUFBLElBQVc7QUFBQSxJQUFhO0FBQUEsSUFBYTtBQUFBLEVBQ3RDO0FBQ0EsU0FBTyxNQUFNLElBQUksQ0FBQyxNQUFNLFdBQVc7QUFBQSxJQUNsQyxVQUFVLEtBQUssc0JBQXNCLFFBQVEsQ0FBQyxJQUFJLElBQUksRUFBRTtBQUFBLElBQ3hELFFBQVE7QUFBQSxJQUNSLFFBQVEsVUFBVTtBQUFBLElBQ2xCLE9BQU8sUUFBUSxNQUFNO0FBQUEsRUFDdEIsRUFBRTtBQUNIO0FBR0EsU0FBUyxtQkFBa0M7QUFDMUMsU0FBTztBQUFBLElBQ04sRUFBRSxVQUFVLEtBQUssMEJBQTBCLEdBQUcsUUFBUSxNQUFNLE9BQU8sTUFBTSxRQUFRLEtBQUs7QUFBQSxJQUN0RixFQUFFLFVBQVUsS0FBSywyQkFBMkIsR0FBRyxRQUFRLE1BQU0sT0FBTyxLQUFLO0FBQUEsSUFDekUsRUFBRSxVQUFVLEtBQUssb0JBQW9CLEdBQUcsUUFBUSxLQUFLO0FBQUEsSUFDckQsRUFBRSxVQUFVLEtBQUssdUJBQXVCLEdBQUcsUUFBUSxNQUFNLE9BQU8sS0FBSztBQUFBLEVBQ3RFO0FBQ0Q7QUFHQSxTQUFTLG9CQUFtQztBQUMzQyxTQUFPO0FBQUEsSUFDTixFQUFFLFVBQVUsS0FBSywwQkFBMEIsR0FBRyxNQUFNLFVBQVUsT0FBTyxRQUFRLFdBQVcsRUFBRSxHQUFHLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxJQUN4SCxFQUFFLFVBQVUsS0FBSyxvQkFBb0IsR0FBRyxNQUFNLFVBQVUsT0FBTyxRQUFRLFNBQVMsRUFBRSxHQUFHLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxJQUNoSCxFQUFFLFVBQVUsS0FBSyx1QkFBdUIsR0FBRyxNQUFNLFVBQVUsT0FBTyxRQUFRLEtBQUssRUFBRSxHQUFHLFFBQVEsTUFBTSxRQUFRLEtBQUs7QUFBQSxJQUMvRyxFQUFFLFVBQVUsS0FBSywyQkFBMkIsR0FBRyxRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsSUFDMUUsRUFBRSxVQUFVLEtBQUssd0NBQXdDLEdBQUcsUUFBUSxLQUFLO0FBQUEsRUFDMUU7QUFDRDtBQUVBLFNBQVMsdUJBQXNDO0FBQzlDLFNBQU8sa0JBQWtCLEVBQUUsSUFBSSxDQUFDLE1BQU0sV0FBVyxFQUFFLEdBQUcsTUFBTSxRQUFRLE1BQU0sUUFBUSxVQUFVLEVBQUUsRUFBRTtBQUNqRztBQUVBLFNBQVMseUJBQXdDO0FBQ2hELFNBQU8sa0JBQWtCLEVBQUUsSUFBSSxDQUFDLE1BQU0sV0FBVyxFQUFFLEdBQUcsTUFBTSxRQUFRLE9BQU8sUUFBUSxVQUFVLEVBQUUsRUFBRTtBQUNsRztBQUdBLFNBQVMseUJBQXdDO0FBQ2hELFNBQU87QUFBQSxJQUNOLEVBQUUsVUFBVSxLQUFLLDBCQUEwQixHQUFHLE1BQU0sVUFBVSxPQUFPLFFBQVEsV0FBVyxFQUFFLEdBQUcsUUFBUSxNQUFNLFVBQVUsS0FBSztBQUFBLElBQzFILEVBQUUsVUFBVSxLQUFLLDJCQUEyQixHQUFHLFFBQVEsS0FBSztBQUFBLElBQzVELEVBQUUsVUFBVSxLQUFLLG9CQUFvQixHQUFHLE1BQU0sVUFBVSxPQUFPLFFBQVEsU0FBUyxFQUFFLEdBQUcsUUFBUSxNQUFNLFVBQVUsS0FBSztBQUFBLElBQ2xILEVBQUUsVUFBVSxLQUFLLHVCQUF1QixHQUFHLE1BQU0sVUFBVSxPQUFPLFFBQVEsS0FBSyxFQUFFLEdBQUcsUUFBUSxNQUFNLE9BQU8sTUFBTSxRQUFRLE1BQU0sVUFBVSxLQUFLO0FBQUEsSUFDNUksRUFBRSxVQUFVLEtBQUssd0NBQXdDLEdBQUcsUUFBUSxLQUFLO0FBQUEsSUFDekUsRUFBRSxVQUFVLEtBQUssaUNBQWlDLEdBQUcsUUFBUSxNQUFNLFVBQVUsS0FBSztBQUFBLEVBQ25GO0FBQ0Q7QUFHQSxTQUFTLHVCQUFzQztBQUM5QyxTQUFPO0FBQUEsSUFDTixFQUFFLFVBQVUsS0FBSyxnR0FBZ0csR0FBRyxRQUFRLE1BQU0sUUFBUSxLQUFLO0FBQUEsSUFDL0ksRUFBRSxVQUFVLEtBQUssNkZBQTZGLEdBQUcsUUFBUSxLQUFLO0FBQUEsSUFDOUgsRUFBRSxVQUFVLEtBQUssK0ZBQStGLEdBQUcsTUFBTSxVQUFVLE9BQU8sUUFBUSxTQUFTLEVBQUUsR0FBRyxRQUFRLEtBQUs7QUFBQSxFQUM5SztBQUNEO0FBR0EsU0FBUyx5QkFBd0M7QUFDaEQsU0FBTztBQUFBLElBQ04sRUFBRSxVQUFVLEtBQUssMEJBQTBCLEdBQUcsTUFBTSxVQUFVLE9BQU8sUUFBUSxXQUFXLEVBQUUsR0FBRyxRQUFRLE1BQU0sT0FBTyxNQUFNLFFBQVEsS0FBSztBQUFBLEVBQ3RJO0FBQ0Q7QUFXQSxNQUFNLHNCQUFzQixvQkFBSSxJQUE2QjtBQUFBLEVBQzVELENBQUMseUJBQXlCLEVBQUUsUUFBUSxJQUFJLFFBQVEsS0FBSyxPQUFPLHVCQUF1QixTQUFTLFlBQVksUUFBUSxNQUFNLENBQUM7QUFBQSxFQUN2SCxDQUFDLDRCQUE0QixFQUFFLFFBQVEsSUFBSSxRQUFRLEtBQUssT0FBTyxxQkFBcUIsU0FBUyxjQUFjLFFBQVEsTUFBTSxDQUFDO0FBQUEsRUFDMUgsQ0FBQyw2QkFBNkIsRUFBRSxRQUFRLElBQUksUUFBUSxLQUFLLE9BQU8sdUJBQXVCLFNBQVMsYUFBYSxRQUFRLE1BQU0sQ0FBQztBQUM3SCxDQUFDO0FBRUQsU0FBUywyQkFBMkIsb0JBQXlDLE9BQThCO0FBQzFHLFFBQU0sV0FBaUM7QUFBQSxJQUN0QyxPQUFPO0FBQUEsSUFDUCxhQUFhLE1BQU07QUFBQSxJQUNuQixtQkFBbUIsS0FBVSxRQUF3RDtBQUNwRixhQUFPLG9CQUFvQixJQUFJLElBQUksSUFBSTtBQUFBLElBQ3hDO0FBQUEsRUFDRDtBQUNBLFFBQU0sSUFBSSxtQkFBbUIsNEJBQTRCLFFBQVEsQ0FBQztBQUNuRTtBQU1BLFNBQVMsZ0NBQWdDLE9BQXdCLFFBQWlDO0FBQ2pHLE1BQUksV0FBVyxPQUFPLGFBQWE7QUFDbEMsV0FBTyxFQUFFLFNBQVMsQ0FBQyxHQUFHLFdBQVcsQ0FBQyxFQUFFO0FBQUEsRUFDckM7QUFFQSxTQUFPO0FBQUEsSUFDTixTQUFTO0FBQUEsTUFDUixNQUFNLElBQUksSUFBSTtBQUFBLFFBQ2I7QUFBQSxRQUNBLFNBQVMsMkJBQTJCLG9CQUFvQjtBQUFBLFFBQ3hELFVBQVUsWUFBWSxRQUFRLGVBQWU7QUFBQSxNQUM5QyxDQUFDO0FBQUEsSUFDRjtBQUFBLElBQ0EsV0FBVztBQUFBLE1BQ1YsTUFBTSxJQUFJLElBQUk7QUFBQSxRQUNiO0FBQUEsUUFDQSxTQUFTLHFCQUFxQixnQkFBZ0I7QUFBQSxRQUM5QyxVQUFVLFlBQVksUUFBUSxRQUFRO0FBQUEsTUFDdkMsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQ0Q7QUFzQkEsU0FBUyxrQkFBa0IsV0FBNkQ7QUFDdkYsU0FBTztBQUFBLElBQ04sR0FBRztBQUFBLElBQ0gsVUFBVTtBQUFBLElBQ1YsR0FBRztBQUFBLEVBQ0o7QUFDRDtBQUVBLFNBQVMsY0FBYyxPQUF5QixPQUFzQixpQkFBd0M7QUFFN0csUUFBTSxVQUFVLENBQUMsR0FBRyxLQUFLLEVBQUUsS0FBSyxDQUFDLEdBQUcsTUFBTyxFQUFFLFdBQVcsRUFBRSxTQUFVLElBQUksRUFBRSxTQUFTLEtBQUssQ0FBQztBQUN6RixRQUFNLGNBQWMsb0JBQUksSUFBcUM7QUFDN0QsYUFBVyxRQUFRLFNBQVM7QUFDM0IsVUFBTSxRQUFRLGdCQUFnQixJQUFJLElBQUksbUJBQW1CLEtBQUssVUFBVTtBQUFBLE1BQ3ZFLFFBQVEsS0FBSztBQUFBLE1BQ2IsT0FBTyxLQUFLO0FBQUEsTUFDWixNQUFNLEtBQUs7QUFBQSxNQUNYLGNBQWMsS0FBSztBQUFBLElBQ3BCLENBQUMsQ0FBQztBQUNGLGdCQUFZLElBQUksTUFBTSxLQUFLO0FBQzNCLFVBQU0sV0FBVyxPQUFPO0FBQUEsTUFDdkIsUUFBUSxLQUFLLFVBQVU7QUFBQSxNQUN2QixRQUFRLEtBQUs7QUFBQSxNQUNiLFFBQVEsS0FBSztBQUFBLElBQ2QsQ0FBQztBQUFBLEVBQ0Y7QUFHQSxRQUFNLG1CQUFtQixRQUFRLE9BQU8sVUFBUSxLQUFLLFlBQVksQ0FBQyxLQUFLLE1BQU0sRUFBRSxJQUFJLFVBQVEsWUFBWSxJQUFJLElBQUksQ0FBRTtBQUNqSCxNQUFJLGlCQUFpQixVQUFVLE1BQU0sY0FBYztBQUNsRCxVQUFNLGFBQWEsTUFBTSxjQUFjLGdCQUFnQjtBQUFBLEVBQ3hEO0FBQ0Q7QUFFQSxTQUFTLGFBQWEsS0FBOEIsU0FBK0I7QUFDbEYsUUFBTSxFQUFFLFdBQVcsaUJBQWlCLE1BQU0sSUFBSTtBQUU5QyxRQUFNLFFBQVEsUUFBUSxTQUFTO0FBQy9CLFFBQU0sZ0JBQWdCLFFBQVEsVUFBVTtBQUN4QyxRQUFNLGNBQWMsa0JBQWtCLFFBQVEsV0FBVztBQUV6RCxRQUFNLHVCQUF1QixJQUFJLHlCQUF5QjtBQUMxRCx1QkFBcUIscUJBQXFCLGVBQWU7QUFBQSxJQUN4RCxTQUFTLFFBQVEsUUFBUSxXQUFXO0FBQUEsSUFDcEMsVUFBVSxRQUFRLGFBQWEsWUFBWTtBQUFBLElBQzNDLFlBQVk7QUFBQSxJQUNaLE9BQU8sUUFBUSxhQUFhLFNBQVM7QUFBQSxFQUN0QyxDQUFDO0FBQ0QsdUJBQXFCLHFCQUFxQixlQUFlLFdBQVcsUUFBUSxRQUFRO0FBRXBGLFFBQU0sdUJBQXVCLDhCQUE4QjtBQUFBLElBQzFELHNCQUFzQixNQUFNO0FBQUEsRUFDN0IsR0FBRyxlQUFlO0FBR2xCLEVBQUMscUJBQXFCLElBQUksYUFBYSxFQUF1QixTQUFTLEtBQUs7QUFHNUUsdUJBQXFCLEtBQUssc0JBQXNCLElBQUksb0JBQW9CLENBQUM7QUFDekUsdUJBQXFCLEtBQUssMEJBQTBCLElBQUksaUNBQWlDLENBQUM7QUFFMUYsUUFBTSxvQkFBb0IsZ0JBQWdCLElBQUkscUJBQXFCLGVBQWUsaUJBQWlCLENBQUM7QUFDcEcsdUJBQXFCLEtBQUssb0JBQW9CLGlCQUFpQjtBQUUvRCxNQUFJLFFBQVEsYUFBYTtBQUN4Qix5QkFBcUIsS0FBSyxxQkFBcUIsSUFBSSxtQkFBbUIsQ0FBQztBQUN2RSx5QkFBcUIsS0FBSyxpQkFBaUIsSUFBSSxjQUFjLEtBQXNCLEVBQUU7QUFBQSxJQUFFLEVBQUUsQ0FBQztBQUMxRix5QkFBcUIsS0FBSywwQkFBMEIsSUFBSSxtQkFBbUIsY0FBYyxLQUFLLFVBQVUsQ0FBQyxDQUFDLENBQUM7QUFBQSxFQUM1RztBQUlBLFFBQU0scUJBQXFCLGdCQUFnQixJQUFJLHFCQUFxQixlQUFlLGtCQUFrQixDQUFDO0FBQ3RHLHVCQUFxQixLQUFLLHFCQUFxQixrQkFBa0I7QUFDakUsNkJBQTJCLG9CQUFvQixlQUFlO0FBRzlELFFBQU0sUUFBUSxnQkFBZ0IsSUFBSSxxQkFBcUIsZUFBZSxrQkFBa0IsTUFBUyxDQUFDO0FBQ2xHLGdCQUFjLE9BQU8sUUFBUSxXQUFXLG1CQUFtQixHQUFHLGVBQWU7QUFFN0UsUUFBTSxzQkFBc0IsQ0FBQyxhQUE4QixXQUFtQjtBQUM3RSxXQUFPLEVBQUUsU0FBUyxnQ0FBZ0MsYUFBYSxNQUFNLEdBQUcsYUFBYSxNQUFNLEtBQUs7QUFBQSxFQUNqRztBQUdBLFFBQU0sWUFBWSxJQUFJLGNBQWMsS0FBdUIsRUFBRTtBQUFBLElBQXZDO0FBQUE7QUFDckIsd0JBQXlCLE1BQU07QUFBQSxNQUFFO0FBQUE7QUFBQSxJQUNqQyxJQUFhLEtBQUs7QUFBRSxhQUFPLE1BQU07QUFBQSxJQUFJO0FBQUEsSUFDckMsSUFBYSxRQUFRO0FBQUUsYUFBTyxNQUFNO0FBQUEsSUFBTztBQUFBLElBQzNDLElBQWEsY0FBYztBQUFFLGFBQU8sTUFBTTtBQUFBLElBQWE7QUFBQSxJQUN2RCxJQUFhLGVBQWU7QUFBRSxhQUFPLE1BQU07QUFBQSxJQUFjO0FBQUEsSUFDekQsSUFBYSxtQkFBbUI7QUFBRSxhQUFPO0FBQUEsSUFBVztBQUFBLElBQ3BELElBQWEsa0JBQWtCO0FBQUUsYUFBTyxNQUFNO0FBQUEsSUFBaUI7QUFBQSxJQUMvRCxJQUFhLFlBQVk7QUFBRSxhQUFPO0FBQUEsSUFBa0I7QUFBQSxJQUMzQyxpQkFBaUIsT0FBZTtBQUFFLGFBQU8sTUFBTSxpQkFBaUIsS0FBSztBQUFBLElBQUc7QUFBQSxJQUN4RSxpQkFBaUIsUUFBcUI7QUFBRSxhQUFPLE1BQU0sUUFBUSxNQUFNO0FBQUEsSUFBRztBQUFBLElBQ3RFLFdBQVcsT0FBcUIsTUFBb0M7QUFBRSxhQUFPLE1BQU0sV0FBVyxPQUFPLElBQUk7QUFBQSxJQUFHO0FBQUEsSUFDNUcsU0FBUyxRQUFxQjtBQUFFLGFBQU8sTUFBTSxTQUFTLE1BQU07QUFBQSxJQUFHO0FBQUEsSUFDL0QsU0FBUyxlQUFxQztBQUFFLGFBQU8sTUFBTSxTQUFTLGFBQWE7QUFBQSxJQUFHO0FBQUEsSUFDdEYsU0FBUyxlQUFxQztBQUFFLGFBQU8sTUFBTSxTQUFTLGFBQWE7QUFBQSxJQUFHO0FBQUEsSUFDdEYsV0FBVyxlQUFxQztBQUFFLGFBQU8sTUFBTSxXQUFXLGFBQWE7QUFBQSxJQUFHO0FBQUEsSUFDMUYsb0JBQW9CLGFBQThCLFNBQVMsT0FBTyxhQUFhO0FBQUUsYUFBTyxvQkFBb0IsYUFBYSxNQUFNO0FBQUEsSUFBRztBQUFBLElBQ2xJLFdBQVc7QUFBRSxXQUFLLFdBQVc7QUFBQSxJQUFHO0FBQUEsRUFDMUM7QUFJQSxRQUFNLG1CQUFtQixJQUFJLGNBQWMsS0FBdUIsRUFBRTtBQUFBLElBQzFELFFBQVE7QUFBQSxJQUFFO0FBQUEsRUFDcEI7QUFFQSxRQUFNLGFBQWEsSUFBSSxjQUFjLEtBQXdCLEVBQUU7QUFBQSxJQUF4QztBQUFBO0FBSXRCLFdBQWtCLCtCQUErQixNQUFNO0FBQ3ZELFdBQWtCLHdCQUF3QixNQUFNO0FBQUE7QUFBQSxJQUpoRCxJQUFhLGNBQWM7QUFBRSxhQUFPO0FBQUEsSUFBYTtBQUFBLElBQ2pELElBQWEsY0FBYztBQUFFLGFBQU8sZ0JBQWdCLFlBQVk7QUFBQSxJQUFrQjtBQUFBLElBQ2xGLElBQWEsU0FBUztBQUFFLGFBQU8sQ0FBQyxTQUFTO0FBQUEsSUFBRztBQUFBLEVBRzdDO0FBRUEsUUFBTSxrQkFBa0IsSUFBSSxjQUFjLEtBQXVCLEVBQUU7QUFBQSxJQUNsRSxJQUFhLFFBQVE7QUFBRSxhQUFPO0FBQUEsSUFBRztBQUFBLElBQ3hCLFdBQVc7QUFBRSxhQUFPO0FBQUEsSUFBVztBQUFBLEVBQ3pDO0FBSUEsUUFBTSxhQUFhLEVBQUUsY0FBYztBQUNuQyxRQUFNLFVBQVUsRUFBRSxVQUFVO0FBQzVCLFFBQU0saUJBQWlCLEVBQUUsZ0JBQWdCLG1DQUFtQyx5QkFBeUI7QUFDckcsUUFBTSxpQkFBaUIsRUFBRSxRQUFRO0FBQ2pDLFlBQVUsVUFBVSxPQUFPLGtCQUFrQixRQUFRLFFBQVE7QUFDN0QsaUJBQWUsVUFBVSxPQUFPLFFBQVEsWUFBWSxhQUFhLFVBQVU7QUFDM0UsaUJBQWUsVUFBVSxPQUFPLG1CQUFtQixZQUFZLFNBQVM7QUFFeEUsUUFBTSxtQkFBbUIsTUFBTSxTQUFTLFlBQVksYUFBYSxhQUFhLHNDQUFzQyxzQ0FBc0M7QUFDMUosTUFBSSxrQkFBa0I7QUFDckIsbUJBQWUsTUFBTSxrQkFBa0IsaUJBQWlCLFNBQVM7QUFBQSxFQUNsRTtBQUVBLFFBQU0sa0JBQWtCLEVBQUUsbUJBQW1CO0FBQzdDLGtCQUFnQixNQUFNLFNBQVM7QUFDL0Isa0JBQWdCLE1BQU0sVUFBVTtBQUVoQyxhQUFXLFlBQVksT0FBTztBQUM5QixVQUFRLFlBQVksY0FBYztBQUNsQyxpQkFBZSxZQUFZLGNBQWM7QUFDekMsaUJBQWUsWUFBWSxlQUFlO0FBQzFDLFlBQVUsWUFBWSxVQUFVO0FBRWhDLFlBQVUsTUFBTSxRQUFRLEdBQUcsS0FBSztBQUNoQyxpQkFBZSxNQUFNLFFBQVEsR0FBRyxLQUFLO0FBRXJDLFFBQU0sZUFBZSxnQkFBZ0IsSUFBSSxxQkFBcUI7QUFBQSxJQUM3RDtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLElBQ0E7QUFBQSxJQUNBO0FBQUEsSUFDQTtBQUFBLEVBQ0QsQ0FBQztBQUVELFFBQU0sU0FBUyxNQUFNO0FBQ3BCLGlCQUFhLE9BQU87QUFBQSxNQUNuQixXQUFXLElBQUksVUFBVSxPQUFPLGFBQWEsVUFBVSxFQUFFLEtBQUs7QUFBQSxNQUM5RCxXQUFXLElBQUksVUFBVSxPQUFPLEdBQUc7QUFBQSxJQUNwQyxHQUFHLFFBQVEscUJBQXFCO0FBQUEsRUFDakM7QUFDQSxZQUFVLGFBQWE7QUFFdkIsZUFBYSxZQUFZLE1BQU0sV0FBVyxhQUFhLFVBQVUsQ0FBQztBQUNsRSxlQUFhLFVBQVUsYUFBYTtBQUNwQyxNQUFJLFFBQVEsdUJBQXVCO0FBQ2xDLFVBQU0sT0FBTyxlQUFlLGlCQUE4Qix3QkFBd0I7QUFDbEYsU0FBSyxDQUFDLEdBQUcsVUFBVSxJQUFJLGtCQUFrQjtBQUN6QyxTQUFLLENBQUMsR0FBRyxVQUFVLElBQUksbUJBQW1CO0FBQUEsRUFDM0M7QUFDQSxTQUFPO0FBQ1I7QUFFQSxTQUFTLE9BQU8sVUFBbUIsU0FBbUY7QUFDckgsU0FBTyxDQUFDLFFBQWlDLGFBQWEsS0FBSyxFQUFFLEdBQUcsU0FBUyxTQUFTLENBQUM7QUFDcEY7QUFFQSxTQUFTLGVBQWUsVUFBbUIsbUJBQStELENBQUMsR0FBRztBQUM3RyxTQUFPO0FBQUE7QUFBQSxJQUVOLFNBQVMsdUJBQXVCLEVBQUUsUUFBUSxPQUFPLFVBQVUsQ0FBQyxDQUFDLEdBQUcsaUJBQWlCLENBQUM7QUFBQTtBQUFBLElBR2xGLGdCQUFnQix1QkFBdUIsRUFBRSxRQUFRLE9BQU8sVUFBVSxFQUFFLGFBQWEsRUFBRSxVQUFVLFNBQVMsR0FBRyxhQUFhLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztBQUFBLElBQzdILGNBQWMsdUJBQXVCLEVBQUUsUUFBUSxPQUFPLFVBQVUsRUFBRSxhQUFhLEVBQUUsVUFBVSxPQUFPLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFBQTtBQUFBLElBR3hHLGtDQUFrQyx1QkFBdUIsRUFBRSxRQUFRLE9BQU8sVUFBVSxFQUFFLGFBQWEsRUFBRSx5QkFBeUIsS0FBSyxHQUFHLFNBQVMscUJBQXFCLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUMxSyxvQ0FBb0MsdUJBQXVCLEVBQUUsUUFBUSxPQUFPLFVBQVUsRUFBRSxhQUFhLEVBQUUseUJBQXlCLEtBQUssR0FBRyxTQUFTLHVCQUF1QixFQUFFLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDOUssOEJBQThCLHVCQUF1QixFQUFFLFFBQVEsT0FBTyxVQUFVLEVBQUUsYUFBYSxFQUFFLHlCQUF5QixLQUFLLEdBQUcsU0FBUyxrQkFBa0IsRUFBRSxDQUFDLEdBQUcsaUJBQWlCLENBQUM7QUFBQTtBQUFBLElBR3JMLHlCQUF5Qix1QkFBdUIsRUFBRSxRQUFRLE9BQU8sVUFBVSxFQUFFLGFBQWEsRUFBRSxVQUFVLE9BQU8sR0FBRyxTQUFTLHdCQUF3QixFQUFFLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDdkoscUJBQXFCLHVCQUF1QixFQUFFLFFBQVEsT0FBTyxVQUFVLEVBQUUsYUFBYSxFQUFFLE9BQU8sTUFBTSxFQUFFLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDM0csMkJBQTJCLHVCQUF1QixFQUFFLFFBQVEsT0FBTyxVQUFVLEVBQUUsYUFBYSxDQUFDLEdBQUcsdUJBQXVCLElBQUksQ0FBQyxFQUFFLENBQUM7QUFBQTtBQUFBLElBRy9ILGlCQUFpQix1QkFBdUIsRUFBRSxRQUFRLE9BQU8sVUFBVSxFQUFFLGFBQWEsRUFBRSxXQUFXLFNBQVMsR0FBRyxTQUFTLGdCQUFnQixFQUFFLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDMUksZ0JBQWdCLHVCQUF1QixFQUFFLFFBQVEsT0FBTyxVQUFVLEVBQUUsYUFBYSxFQUFFLFdBQVcsU0FBUyx3QkFBd0IsSUFBSSx3QkFBd0IsSUFBSSxHQUFHLFNBQVMsZ0JBQWdCLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFBQTtBQUFBLElBR2pNLGtCQUFrQix1QkFBdUIsRUFBRSxRQUFRLE9BQU8sVUFBVSxFQUFFLGFBQWEsRUFBRSxXQUFXLFVBQVUsRUFBRSxDQUFDLEVBQUUsQ0FBQztBQUFBO0FBQUEsSUFHaEgsVUFBVSx1QkFBdUIsRUFBRSxRQUFRLE9BQU8sVUFBVSxFQUFFLGFBQWEsRUFBRSxVQUFVLEtBQUssR0FBRyxTQUFTLGdCQUFnQixHQUFHLE9BQU8sSUFBSSxDQUFDLEVBQUUsQ0FBQztBQUFBO0FBQUEsSUFHMUksdUJBQXVCLHVCQUF1QixFQUFFLFFBQVEsT0FBTyxVQUFVLEVBQUUsYUFBYSxFQUFFLG1CQUFtQixPQUFPLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFBQTtBQUFBLElBRzFILHNCQUFzQix1QkFBdUIsRUFBRSxRQUFRLE9BQU8sVUFBVSxFQUFFLGFBQWEsRUFBRSwwQkFBMEIsTUFBTSxFQUFFLENBQUMsRUFBRSxDQUFDO0FBQUE7QUFBQSxJQUcvSCxzQkFBc0IsdUJBQXVCLEVBQUUsUUFBUSxPQUFPLFVBQVUsRUFBRSxhQUFhLEVBQUUsMEJBQTBCLE9BQU8saUJBQWlCLFNBQVMsR0FBRyxTQUFTLGtCQUFrQixFQUFFLENBQUMsRUFBRSxDQUFDO0FBQUE7QUFBQSxJQUd4TCxjQUFjLHVCQUF1QixFQUFFLFFBQVEsT0FBTyxVQUFVLEVBQUUsYUFBYSxFQUFFLGNBQWMsS0FBSyxFQUFFLENBQUMsRUFBRSxDQUFDO0FBQUE7QUFBQSxJQUcxRyx1QkFBdUIsdUJBQXVCLEVBQUUsUUFBUSxPQUFPLFVBQVUsRUFBRSxhQUFhLEVBQUUsdUJBQXVCLEtBQUssR0FBRyxTQUFTLGlCQUFpQixFQUFFLENBQUMsRUFBRSxDQUFDO0FBQUE7QUFBQSxJQUd6SixrQkFBa0IsdUJBQXVCLEVBQUUsUUFBUSxPQUFPLFVBQVUsRUFBRSxhQUFhLEVBQUUsYUFBYSxRQUFRLEdBQUcsU0FBUyx5QkFBeUIsRUFBRSxDQUFDLEVBQUUsQ0FBQztBQUFBLElBQ3JKLG1CQUFtQix1QkFBdUIsRUFBRSxRQUFRLE9BQU8sVUFBVSxFQUFFLGFBQWEsRUFBRSxhQUFhLFNBQVMsR0FBRyxTQUFTLHlCQUF5QixFQUFFLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDdkosaUJBQWlCLHVCQUF1QixFQUFFLFFBQVEsT0FBTyxVQUFVLEVBQUUsYUFBYSxFQUFFLGFBQWEsT0FBTyxHQUFHLFNBQVMseUJBQXlCLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFBQTtBQUFBLElBR25KLGNBQWMsdUJBQXVCLEVBQUUsUUFBUSxPQUFPLFVBQVUsRUFBRSxhQUFhLEVBQUUsV0FBVyxNQUFNLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFBQTtBQUFBLElBR3hHLGdCQUFnQix1QkFBdUIsRUFBRSxRQUFRLE9BQU8sVUFBVSxFQUFFLGFBQWEsRUFBRSxhQUFhLEVBQUUsUUFBUSxPQUFPLFFBQVEsTUFBTSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFBQTtBQUFBLElBR3ZJLHdCQUF3Qix1QkFBdUIsRUFBRSxRQUFRLE9BQU8sVUFBVSxFQUFFLGFBQWEsRUFBRSxpQkFBaUIsVUFBVSxHQUFHLFNBQVMsa0JBQWtCLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUMxSix1QkFBdUIsdUJBQXVCLEVBQUUsUUFBUSxPQUFPLFVBQVUsRUFBRSxhQUFhLEVBQUUsaUJBQWlCLFNBQVMsR0FBRyxTQUFTLGtCQUFrQixFQUFFLENBQUMsRUFBRSxDQUFDO0FBQUE7QUFBQSxJQUd4SixxQkFBcUIsdUJBQXVCLEVBQUUsUUFBUSxPQUFPLFVBQVUsRUFBRSxhQUFhLEVBQUUsc0JBQXNCLFFBQVEsR0FBRyxTQUFTLGdCQUFnQixHQUFHLE9BQU8sSUFBSSxDQUFDLEVBQUUsQ0FBQztBQUFBO0FBQUEsSUFHcEssdUJBQXVCLHVCQUF1QixFQUFFLFFBQVEsT0FBTyxVQUFVLEVBQUUsYUFBYSxFQUFFLDBCQUEwQixVQUFVLEdBQUcsU0FBUyxnQkFBZ0IsR0FBRyxPQUFPLElBQUksQ0FBQyxFQUFFLENBQUM7QUFBQTtBQUFBLElBRzVLLHNCQUFzQix1QkFBdUIsRUFBRSxRQUFRLE9BQU8sVUFBVSxFQUFFLGFBQWEsRUFBRSx1QkFBdUIsVUFBVSxFQUFFLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDaEksdUJBQXVCLHVCQUF1QixFQUFFLFFBQVEsT0FBTyxVQUFVLEVBQUUsYUFBYSxFQUFFLHVCQUF1QixXQUFXLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUNsSSxxQkFBcUIsdUJBQXVCLEVBQUUsUUFBUSxPQUFPLFVBQVUsRUFBRSxhQUFhLEVBQUUsdUJBQXVCLFNBQVMsRUFBRSxDQUFDLEVBQUUsQ0FBQztBQUFBO0FBQUEsSUFHOUgsb0NBQW9DLHVCQUF1QixFQUFFLFFBQVEsT0FBTyxVQUFVLEVBQUUsYUFBYSxFQUFFLHlCQUF5QixLQUFLLEdBQUcsUUFBUSxLQUFLLENBQUMsRUFBRSxDQUFDO0FBQUEsSUFDekosc0NBQXNDLHVCQUF1QixFQUFFLFFBQVEsT0FBTyxVQUFVLEVBQUUsYUFBYSxFQUFFLHlCQUF5QixLQUFLLEdBQUcsUUFBUSxNQUFNLENBQUMsRUFBRSxDQUFDO0FBQUE7QUFBQTtBQUFBLElBSzVKLGFBQWEsdUJBQXVCLEVBQUUsUUFBUSxPQUFPLFVBQVUsRUFBRSxRQUFRLEtBQUssQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUNsRixlQUFlLHVCQUF1QixFQUFFLFFBQVEsT0FBTyxVQUFVLEVBQUUsUUFBUSxNQUFNLENBQUMsR0FBRyxpQkFBaUIsQ0FBQztBQUFBO0FBQUEsSUFHdkcsYUFBYSx1QkFBdUIsRUFBRSxRQUFRLE9BQU8sVUFBVSxFQUFFLFNBQVMsdUJBQXVCLEVBQUUsQ0FBQyxHQUFHLGlCQUFpQixDQUFDO0FBQUE7QUFBQSxJQUd6SCxvQkFBb0IsdUJBQXVCLEVBQUUsUUFBUSxPQUFPLFVBQVUsRUFBRSxTQUFTLGlCQUFpQixHQUFHLFFBQVEsTUFBTSxDQUFDLEVBQUUsQ0FBQztBQUFBO0FBQUEsSUFHdkgsa0JBQWtCLHVCQUF1QixFQUFFLFFBQVEsT0FBTyxVQUFVLEVBQUUsYUFBYSxFQUFFLFdBQVcsU0FBUyxHQUFHLFNBQVMscUJBQXFCLEdBQUcsT0FBTyxJQUFJLENBQUMsRUFBRSxDQUFDO0FBQUE7QUFBQSxJQUc1Six1QkFBdUIsdUJBQXVCLEVBQUUsUUFBUSxPQUFPLFVBQVUsRUFBRSx1QkFBdUIsS0FBSyxDQUFDLEdBQUcsaUJBQWlCLENBQUM7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQU03SCxzQkFBc0IsdUJBQXVCLEVBQUUsUUFBUSxPQUFPLFVBQVUsRUFBRSxhQUFhLEVBQUUsaUJBQWlCLFdBQVcsV0FBVyxNQUFNLEdBQUcsU0FBUyxrQkFBa0IsRUFBRSxDQUFDLEVBQUUsQ0FBQztBQUFBO0FBQUEsSUFHMUssZ0JBQWdCLHVCQUF1QixFQUFFLFFBQVEsT0FBTyxVQUFVLEVBQUUsYUFBYSxFQUFFLFVBQVUsU0FBUyxHQUFHLFNBQVMsdUJBQXVCLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFBQTtBQUFBLElBRy9JLDBCQUEwQix1QkFBdUIsRUFBRSxRQUFRLE9BQU8sVUFBVSxFQUFFLGFBQWEsRUFBRSx5QkFBeUIsTUFBTSxpQkFBaUIsVUFBVSxHQUFHLFNBQVMsa0JBQWtCLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFBQSxFQUM1TDtBQUNEO0FBRUEsSUFBTywrQkFBUSx5QkFBeUIsRUFBRSxNQUFNLHVCQUF1QixHQUFHO0FBQUEsRUFDekUsYUFBYSx5QkFBeUIsZUFBZSxPQUFPLENBQUMsa0JBQWtCLENBQUMsQ0FBQztBQUFBLEVBQ2pGLFlBQVkseUJBQXlCLGVBQWUsTUFBTSxDQUFDLGtCQUFrQixDQUFDLENBQUM7QUFDaEYsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
