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
import { addDisposableListener, EventType, h } from "../../../../base/browser/dom.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun, derived, globalTransaction, observableValue } from "../../../../base/common/observable.js";
import { createActionViewItem } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { MenuWorkbenchToolBar } from "../../../../platform/actions/browser/toolbar.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { observableCodeEditor } from "../../observableCodeEditor.js";
import { DiffEditorWidget } from "../diffEditor/diffEditorWidget.js";
import { ActionRunnerWithContext } from "./utils.js";
import { MultiDiffEditorItemLabelKind } from "./workbenchUIElementFactory.js";
class TemplateData {
  constructor(viewModel, deltaScrollVertical) {
    this.viewModel = viewModel;
    this.deltaScrollVertical = deltaScrollVertical;
  }
  getId() {
    return this.viewModel;
  }
}
let DiffEditorItemTemplate = class extends Disposable {
  constructor(_container, _overflowWidgetsDomNode, _workbenchUIElementFactory, _optionsOverride, _instantiationService, _parentContextKeyService) {
    super();
    this._container = _container;
    this._overflowWidgetsDomNode = _overflowWidgetsDomNode;
    this._workbenchUIElementFactory = _workbenchUIElementFactory;
    this._optionsOverride = _optionsOverride;
    this._instantiationService = _instantiationService;
    this._viewModel = observableValue(this, void 0);
    this._collapsed = derived(this, (reader) => this._viewModel.read(reader)?.collapsed.read(reader));
    this._editorContentHeight = observableValue(this, 500);
    this.contentHeight = derived(this, (reader) => {
      const h2 = this._collapsed.read(reader) ? 0 : this._editorContentHeight.read(reader);
      return h2 + this._outerEditorHeight;
    });
    this._modifiedContentWidth = observableValue(this, 0);
    this._modifiedWidth = observableValue(this, 0);
    this._originalContentWidth = observableValue(this, 0);
    this._originalWidth = observableValue(this, 0);
    this.maxScroll = derived(this, (reader) => {
      const scroll1 = this._modifiedContentWidth.read(reader) - this._modifiedWidth.read(reader);
      const scroll2 = this._originalContentWidth.read(reader) - this._originalWidth.read(reader);
      if (scroll1 > scroll2) {
        return { maxScroll: scroll1, width: this._modifiedWidth.read(reader) };
      } else {
        return { maxScroll: scroll2, width: this._originalWidth.read(reader) };
      }
    });
    this._elements = h("div.multiDiffEntry", [
      h("div.header@header", [
        h("div.header-content", [
          h("div.collapse-button@collapseButton"),
          h("div.file-path", [
            // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
            h("div.title.modified.show-file-icons@primaryPath", []),
            h("div.status.deleted@status", ["R"]),
            // eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
            h("div.title.original.show-file-icons@secondaryPath", [])
          ]),
          h("div.actions@actions")
        ])
      ]),
      h("div.editorParent", [
        h("div.editorContainer@editor")
      ])
    ]);
    this.editor = this._register(this._instantiationService.createInstance(DiffEditorWidget, this._elements.editor, {
      overflowWidgetsDomNode: this._overflowWidgetsDomNode,
      fixedOverflowWidgets: true
    }, {}));
    this.isModifedFocused = observableCodeEditor(this.editor.getModifiedEditor()).isFocused;
    this.isOriginalFocused = observableCodeEditor(this.editor.getOriginalEditor()).isFocused;
    this.isFocused = derived(this, (reader) => this.isModifedFocused.read(reader) || this.isOriginalFocused.read(reader));
    this._resourceLabel = this._workbenchUIElementFactory.createResourceLabel ? this._register(this._workbenchUIElementFactory.createResourceLabel(this._elements.primaryPath, MultiDiffEditorItemLabelKind.Primary)) : void 0;
    this._resourceLabel2 = this._workbenchUIElementFactory.createResourceLabel ? this._register(this._workbenchUIElementFactory.createResourceLabel(this._elements.secondaryPath, MultiDiffEditorItemLabelKind.Secondary)) : void 0;
    this._dataStore = this._register(new DisposableStore());
    this._headerHeight = 40;
    this._lastScrollTop = -1;
    this._isSettingScrollTop = false;
    const btn = this._register(new Button(this._elements.collapseButton, {}));
    this._register(autorun((reader) => {
      btn.element.className = "";
      btn.icon = this._collapsed.read(reader) ? Codicon.chevronRight : Codicon.chevronDown;
    }));
    this._register(btn.onDidClick(() => {
      this._viewModel.get()?.collapsed.set(!this._collapsed.get(), void 0);
    }));
    if (this._workbenchUIElementFactory.headerClickToCollapse) {
      this._elements.header.tabIndex = 0;
      this._elements.header.setAttribute("role", "button");
      this._register(addDisposableListener(this._elements.header, EventType.CLICK, (e) => {
        const target = e.target;
        if (!(target instanceof Element)) {
          return;
        }
        if (target.closest(".actions") || target.closest(".collapse-button")) {
          return;
        }
        this._viewModel.get()?.collapsed.set(!this._collapsed.get(), void 0);
      }));
      this._register(addDisposableListener(this._elements.header, EventType.KEY_DOWN, (e) => {
        if (e.key === "Enter" || e.key === " ") {
          const target = e.target;
          if (target instanceof Element && (target.closest(".actions") || target.closest(".collapse-button"))) {
            return;
          }
          e.preventDefault();
          this._viewModel.get()?.collapsed.set(!this._collapsed.get(), void 0);
        }
      }));
    }
    this._register(autorun((reader) => {
      const collapsed = this._collapsed.read(reader);
      this._elements.editor.style.display = collapsed ? "none" : "block";
      if (this._workbenchUIElementFactory.headerClickToCollapse) {
        this._elements.header.setAttribute("aria-expanded", String(!collapsed));
      }
    }));
    this._register(this.editor.getModifiedEditor().onDidLayoutChange((e) => {
      const width = this.editor.getModifiedEditor().getLayoutInfo().contentWidth;
      this._modifiedWidth.set(width, void 0);
    }));
    this._register(this.editor.getOriginalEditor().onDidLayoutChange((e) => {
      const width = this.editor.getOriginalEditor().getLayoutInfo().contentWidth;
      this._originalWidth.set(width, void 0);
    }));
    this._register(this.editor.onDidContentSizeChange((e) => {
      globalTransaction((tx) => {
        this._editorContentHeight.set(e.contentHeight, tx);
        this._modifiedContentWidth.set(this.editor.getModifiedEditor().getContentWidth(), tx);
        this._originalContentWidth.set(this.editor.getOriginalEditor().getContentWidth(), tx);
      });
    }));
    this._register(this.editor.getOriginalEditor().onDidScrollChange((e) => {
      if (this._isSettingScrollTop) {
        return;
      }
      if (!e.scrollTopChanged || !this._data) {
        return;
      }
      const delta = e.scrollTop - this._lastScrollTop;
      this._data.deltaScrollVertical(delta);
    }));
    this._register(autorun((reader) => {
      const isActive = this._viewModel.read(reader)?.isActive.read(reader);
      this._elements.root.classList.toggle("active", isActive);
    }));
    this._container.appendChild(this._elements.root);
    this._outerEditorHeight = this._headerHeight;
    this._contextKeyService = this._register(_parentContextKeyService.createScoped(this._elements.actions));
    const ctxAllUnchangedRegionsShown = EditorContextKeys.multiDiffEditorItemAllUnchangedRegionsShown.bindTo(this._contextKeyService);
    this._register(autorun((reader) => {
      ctxAllUnchangedRegionsShown.set(this.editor.allUnchangedRegionsShown.read(reader));
    }));
    const instantiationService = this._register(this._instantiationService.createChild(new ServiceCollection([IContextKeyService, this._contextKeyService])));
    this._register(instantiationService.createInstance(MenuWorkbenchToolBar, this._elements.actions, MenuId.MultiDiffEditorFileToolbar, {
      actionRunner: this._register(new ActionRunnerWithContext(() => this._viewModel.get()?.modifiedUri ?? this._viewModel.get()?.originalUri)),
      highlightToggledItems: true,
      menuOptions: {
        shouldForwardArgs: true
      },
      toolbarOptions: { primaryGroup: (g) => g.startsWith("navigation") },
      actionViewItemProvider: (action, options) => this._workbenchUIElementFactory.createToolbarActionViewItem?.(action, options) ?? createActionViewItem(instantiationService, action, options)
    }));
  }
  setScrollLeft(left) {
    if (this._modifiedContentWidth.get() - this._modifiedWidth.get() > this._originalContentWidth.get() - this._originalWidth.get()) {
      this.editor.getModifiedEditor().setScrollLeft(left);
    } else {
      this.editor.getOriginalEditor().setScrollLeft(left);
    }
  }
  setData(data) {
    this._data = data;
    const optionsOverride = this._optionsOverride;
    function updateOptions(options) {
      return {
        ...options,
        ...optionsOverride?.get(),
        scrollBeyondLastLine: false,
        hideUnchangedRegions: {
          enabled: true
        },
        scrollbar: {
          vertical: "hidden",
          horizontal: "hidden",
          handleMouseWheel: false,
          useShadows: false
        },
        renderOverviewRuler: false,
        fixedOverflowWidgets: true,
        overviewRulerBorder: false
      };
    }
    if (!data) {
      globalTransaction((tx) => {
        this._viewModel.set(void 0, tx);
        this.editor.setDiffModel(null, tx);
        this._dataStore.clear();
      });
      return;
    }
    const value = data.viewModel.documentDiffItem;
    globalTransaction((tx) => {
      this._resourceLabel?.setUri(data.viewModel.modifiedUri ?? data.viewModel.originalUri, { strikethrough: data.viewModel.modifiedUri === void 0 });
      let isRenamed = false;
      let isDeleted = false;
      let isAdded = false;
      let flag = "";
      if (data.viewModel.modifiedUri && data.viewModel.originalUri && data.viewModel.modifiedUri.path !== data.viewModel.originalUri.path) {
        flag = "R";
        isRenamed = true;
      } else if (!data.viewModel.modifiedUri) {
        flag = "D";
        isDeleted = true;
      } else if (!data.viewModel.originalUri) {
        flag = "A";
        isAdded = true;
      }
      this._elements.status.classList.toggle("renamed", isRenamed);
      this._elements.status.classList.toggle("deleted", isDeleted);
      this._elements.status.classList.toggle("added", isAdded);
      this._elements.status.innerText = flag;
      this._resourceLabel2?.setUri(isRenamed ? data.viewModel.originalUri : void 0, { strikethrough: true });
      this._dataStore.clear();
      this._viewModel.set(data.viewModel, tx);
      this.editor.setDiffModel(data.viewModel.diffEditorViewModelRef, tx);
      this.editor.updateOptions(updateOptions(value.options ?? {}));
    });
    if (value.onOptionsDidChange) {
      this._dataStore.add(value.onOptionsDidChange(() => {
        this.editor.updateOptions(updateOptions(value.options ?? {}));
      }));
    }
    if (optionsOverride) {
      this._dataStore.add(autorun((reader) => {
        optionsOverride.read(reader);
        this.editor.updateOptions(updateOptions(value.options ?? {}));
      }));
    }
    data.viewModel.isAlive.recomputeInitiallyAndOnChange(this._dataStore, (value2) => {
      if (!value2) {
        this.setData(void 0);
      }
    });
    if (data.viewModel.documentDiffItem.contextKeys) {
      for (const [key, value2] of Object.entries(data.viewModel.documentDiffItem.contextKeys)) {
        this._contextKeyService.createKey(key, value2);
      }
    }
  }
  render(verticalRange, width, editorScroll, viewPort) {
    this._elements.root.style.visibility = "visible";
    this._elements.root.style.top = `${verticalRange.start}px`;
    this._elements.root.style.height = `${verticalRange.length}px`;
    this._elements.root.style.width = `${width}px`;
    this._elements.root.style.position = "absolute";
    const maxDelta = verticalRange.length - this._headerHeight;
    const delta = Math.max(0, Math.min(viewPort.start - verticalRange.start, maxDelta));
    this._elements.header.style.transform = `translateY(${delta}px)`;
    globalTransaction((tx) => {
      this.editor.layout({
        width: width - 2 * 8 - 2 * 1,
        height: verticalRange.length - this._outerEditorHeight
      });
    });
    try {
      this._isSettingScrollTop = true;
      this._lastScrollTop = editorScroll;
      this.editor.getOriginalEditor().setScrollTop(editorScroll);
    } finally {
      this._isSettingScrollTop = false;
    }
    this._elements.header.classList.toggle("shadow", delta > 0 || editorScroll > 0);
    this._elements.header.classList.toggle("collapsed", delta === maxDelta);
  }
  hide() {
    this._elements.root.style.top = `-100000px`;
    this._elements.root.style.visibility = "hidden";
  }
};
DiffEditorItemTemplate = __decorateClass([
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IContextKeyService)
], DiffEditorItemTemplate);
export {
  DiffEditorItemTemplate,
  TemplateData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3dpZGdldC9tdWx0aURpZmZFZGl0b3IvZGlmZkVkaXRvckl0ZW1UZW1wbGF0ZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgeyBhZGREaXNwb3NhYmxlTGlzdGVuZXIsIEV2ZW50VHlwZSwgaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBkZXJpdmVkLCBnbG9iYWxUcmFuc2FjdGlvbiwgSU9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgY3JlYXRlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvbWVudUVudHJ5QWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgTWVudVdvcmtiZW5jaFRvb2xCYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2Jyb3dzZXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgdHlwZSBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGlmZkVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi9vYnNlcnZhYmxlQ29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vZGlmZkVkaXRvci9kaWZmRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IERvY3VtZW50RGlmZkl0ZW1WaWV3TW9kZWwgfSBmcm9tICcuL211bHRpRGlmZkVkaXRvclZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBJT2JqZWN0RGF0YSwgSVBvb2xlZE9iamVjdCB9IGZyb20gJy4vb2JqZWN0UG9vbC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25SdW5uZXJXaXRoQ29udGV4dCB9IGZyb20gJy4vdXRpbHMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnksIE11bHRpRGlmZkVkaXRvckl0ZW1MYWJlbEtpbmQgfSBmcm9tICcuL3dvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnkuanMnO1xuXG5leHBvcnQgY2xhc3MgVGVtcGxhdGVEYXRhIGltcGxlbWVudHMgSU9iamVjdERhdGEge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgdmlld01vZGVsOiBEb2N1bWVudERpZmZJdGVtVmlld01vZGVsLFxuXHRcdHB1YmxpYyByZWFkb25seSBkZWx0YVNjcm9sbFZlcnRpY2FsOiAoZGVsdGE6IG51bWJlcikgPT4gdm9pZCxcblx0KSB7IH1cblxuXG5cdGdldElkKCk6IHVua25vd24ge1xuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgRGlmZkVkaXRvckl0ZW1UZW1wbGF0ZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJUG9vbGVkT2JqZWN0PFRlbXBsYXRlRGF0YT4ge1xuXHRwcml2YXRlIHJlYWRvbmx5IF92aWV3TW9kZWw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29sbGFwc2VkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvckNvbnRlbnRIZWlnaHQ7XG5cdHB1YmxpYyByZWFkb25seSBjb250ZW50SGVpZ2h0O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGlmaWVkQ29udGVudFdpZHRoO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RpZmllZFdpZHRoO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vcmlnaW5hbENvbnRlbnRXaWR0aDtcblx0cHJpdmF0ZSByZWFkb25seSBfb3JpZ2luYWxXaWR0aDtcblxuXHRwdWJsaWMgcmVhZG9ubHkgbWF4U2Nyb2xsO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VsZW1lbnRzO1xuXG5cdHB1YmxpYyByZWFkb25seSBlZGl0b3I7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpc01vZGlmZWRGb2N1c2VkO1xuXHRwcml2YXRlIHJlYWRvbmx5IGlzT3JpZ2luYWxGb2N1c2VkO1xuXHRwdWJsaWMgcmVhZG9ubHkgaXNGb2N1c2VkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jlc291cmNlTGFiZWw7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcmVzb3VyY2VMYWJlbDI7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb3V0ZXJFZGl0b3JIZWlnaHQ6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGV4dEtleVNlcnZpY2U6IElTY29wZWRDb250ZXh0S2V5U2VydmljZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9jb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX292ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3dvcmtiZW5jaFVJRWxlbWVudEZhY3Rvcnk6IElXb3JrYmVuY2hVSUVsZW1lbnRGYWN0b3J5LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnNPdmVycmlkZTogSU9ic2VydmFibGU8SURpZmZFZGl0b3JPcHRpb25zPiB8IHVuZGVmaW5lZCxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBfcGFyZW50Q29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl92aWV3TW9kZWwgPSBvYnNlcnZhYmxlVmFsdWU8RG9jdW1lbnREaWZmSXRlbVZpZXdNb2RlbCB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9jb2xsYXBzZWQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLl92aWV3TW9kZWwucmVhZChyZWFkZXIpPy5jb2xsYXBzZWQucmVhZChyZWFkZXIpKTtcblx0XHR0aGlzLl9lZGl0b3JDb250ZW50SGVpZ2h0ID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlcj4odGhpcywgNTAwKTtcblx0XHR0aGlzLmNvbnRlbnRIZWlnaHQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBoID0gdGhpcy5fY29sbGFwc2VkLnJlYWQocmVhZGVyKSA/IDAgOiB0aGlzLl9lZGl0b3JDb250ZW50SGVpZ2h0LnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBoICsgdGhpcy5fb3V0ZXJFZGl0b3JIZWlnaHQ7XG5cdFx0fSk7XG5cdFx0dGhpcy5fbW9kaWZpZWRDb250ZW50V2lkdGggPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyPih0aGlzLCAwKTtcblx0XHR0aGlzLl9tb2RpZmllZFdpZHRoID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlcj4odGhpcywgMCk7XG5cdFx0dGhpcy5fb3JpZ2luYWxDb250ZW50V2lkdGggPSBvYnNlcnZhYmxlVmFsdWU8bnVtYmVyPih0aGlzLCAwKTtcblx0XHR0aGlzLl9vcmlnaW5hbFdpZHRoID0gb2JzZXJ2YWJsZVZhbHVlPG51bWJlcj4odGhpcywgMCk7XG5cdFx0dGhpcy5tYXhTY3JvbGwgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzY3JvbGwxID0gdGhpcy5fbW9kaWZpZWRDb250ZW50V2lkdGgucmVhZChyZWFkZXIpIC0gdGhpcy5fbW9kaWZpZWRXaWR0aC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBzY3JvbGwyID0gdGhpcy5fb3JpZ2luYWxDb250ZW50V2lkdGgucmVhZChyZWFkZXIpIC0gdGhpcy5fb3JpZ2luYWxXaWR0aC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoc2Nyb2xsMSA+IHNjcm9sbDIpIHtcblx0XHRcdFx0cmV0dXJuIHsgbWF4U2Nyb2xsOiBzY3JvbGwxLCB3aWR0aDogdGhpcy5fbW9kaWZpZWRXaWR0aC5yZWFkKHJlYWRlcikgfTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiB7IG1heFNjcm9sbDogc2Nyb2xsMiwgd2lkdGg6IHRoaXMuX29yaWdpbmFsV2lkdGgucmVhZChyZWFkZXIpIH07XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGhpcy5fZWxlbWVudHMgPSBoKCdkaXYubXVsdGlEaWZmRW50cnknLCBbXG5cdFx0XHRoKCdkaXYuaGVhZGVyQGhlYWRlcicsIFtcblx0XHRcdFx0aCgnZGl2LmhlYWRlci1jb250ZW50JywgW1xuXHRcdFx0XHRcdGgoJ2Rpdi5jb2xsYXBzZS1idXR0b25AY29sbGFwc2VCdXR0b24nKSxcblx0XHRcdFx0XHRoKCdkaXYuZmlsZS1wYXRoJywgW1xuXHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzLCBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55XG5cdFx0XHRcdFx0XHRoKCdkaXYudGl0bGUubW9kaWZpZWQuc2hvdy1maWxlLWljb25zQHByaW1hcnlQYXRoJywgW10gYXMgYW55KSxcblx0XHRcdFx0XHRcdGgoJ2Rpdi5zdGF0dXMuZGVsZXRlZEBzdGF0dXMnLCBbJ1InXSksXG5cdFx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHMsIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnlcblx0XHRcdFx0XHRcdGgoJ2Rpdi50aXRsZS5vcmlnaW5hbC5zaG93LWZpbGUtaWNvbnNAc2Vjb25kYXJ5UGF0aCcsIFtdIGFzIGFueSksXG5cdFx0XHRcdFx0XSksXG5cdFx0XHRcdFx0aCgnZGl2LmFjdGlvbnNAYWN0aW9ucycpLFxuXHRcdFx0XHRdKSxcblx0XHRcdF0pLFxuXG5cdFx0XHRoKCdkaXYuZWRpdG9yUGFyZW50JywgW1xuXHRcdFx0XHRoKCdkaXYuZWRpdG9yQ29udGFpbmVyQGVkaXRvcicpLFxuXHRcdFx0XSlcblx0XHRdKSBhcyBSZWNvcmQ8c3RyaW5nLCBIVE1MRWxlbWVudD47XG5cdFx0dGhpcy5lZGl0b3IgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWZmRWRpdG9yV2lkZ2V0LCB0aGlzLl9lbGVtZW50cy5lZGl0b3IsIHtcblx0XHRcdG92ZXJmbG93V2lkZ2V0c0RvbU5vZGU6IHRoaXMuX292ZXJmbG93V2lkZ2V0c0RvbU5vZGUsXG5cdFx0XHRmaXhlZE92ZXJmbG93V2lkZ2V0czogdHJ1ZVxuXHRcdH0sIHt9KSk7XG5cdFx0dGhpcy5pc01vZGlmZWRGb2N1c2VkID0gb2JzZXJ2YWJsZUNvZGVFZGl0b3IodGhpcy5lZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKSkuaXNGb2N1c2VkO1xuXHRcdHRoaXMuaXNPcmlnaW5hbEZvY3VzZWQgPSBvYnNlcnZhYmxlQ29kZUVkaXRvcih0aGlzLmVkaXRvci5nZXRPcmlnaW5hbEVkaXRvcigpKS5pc0ZvY3VzZWQ7XG5cdFx0dGhpcy5pc0ZvY3VzZWQgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB0aGlzLmlzTW9kaWZlZEZvY3VzZWQucmVhZChyZWFkZXIpIHx8IHRoaXMuaXNPcmlnaW5hbEZvY3VzZWQucmVhZChyZWFkZXIpKTtcblx0XHR0aGlzLl9yZXNvdXJjZUxhYmVsID0gdGhpcy5fd29ya2JlbmNoVUlFbGVtZW50RmFjdG9yeS5jcmVhdGVSZXNvdXJjZUxhYmVsXG5cdFx0XHQ/IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnkuY3JlYXRlUmVzb3VyY2VMYWJlbCh0aGlzLl9lbGVtZW50cy5wcmltYXJ5UGF0aCwgTXVsdGlEaWZmRWRpdG9ySXRlbUxhYmVsS2luZC5QcmltYXJ5KSlcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3Jlc291cmNlTGFiZWwyID0gdGhpcy5fd29ya2JlbmNoVUlFbGVtZW50RmFjdG9yeS5jcmVhdGVSZXNvdXJjZUxhYmVsXG5cdFx0XHQ/IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3dvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnkuY3JlYXRlUmVzb3VyY2VMYWJlbCh0aGlzLl9lbGVtZW50cy5zZWNvbmRhcnlQYXRoLCBNdWx0aURpZmZFZGl0b3JJdGVtTGFiZWxLaW5kLlNlY29uZGFyeSkpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9kYXRhU3RvcmUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRcdHRoaXMuX2hlYWRlckhlaWdodCA9IDQwO1xuXHRcdHRoaXMuX2xhc3RTY3JvbGxUb3AgPSAtMTtcblx0XHR0aGlzLl9pc1NldHRpbmdTY3JvbGxUb3AgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGJ0biA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBCdXR0b24odGhpcy5fZWxlbWVudHMuY29sbGFwc2VCdXR0b24sIHt9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRidG4uZWxlbWVudC5jbGFzc05hbWUgPSAnJztcblx0XHRcdGJ0bi5pY29uID0gdGhpcy5fY29sbGFwc2VkLnJlYWQocmVhZGVyKSA/IENvZGljb24uY2hldnJvblJpZ2h0IDogQ29kaWNvbi5jaGV2cm9uRG93bjtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYnRuLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0dGhpcy5fdmlld01vZGVsLmdldCgpPy5jb2xsYXBzZWQuc2V0KCF0aGlzLl9jb2xsYXBzZWQuZ2V0KCksIHVuZGVmaW5lZCk7XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHRoaXMuX3dvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnkuaGVhZGVyQ2xpY2tUb0NvbGxhcHNlKSB7XG5cdFx0XHQvLyBNYWtlIHRoZSBoZWFkZXIgY2xpY2thYmxlIHRvIHRvZ2dsZSBjb2xsYXBzZS9leHBhbmRcblx0XHRcdHRoaXMuX2VsZW1lbnRzLmhlYWRlci50YWJJbmRleCA9IDA7XG5cdFx0XHR0aGlzLl9lbGVtZW50cy5oZWFkZXIuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2J1dHRvbicpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3RlcihhZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZWxlbWVudHMuaGVhZGVyLCBFdmVudFR5cGUuQ0xJQ0ssIChlKSA9PiB7XG5cdFx0XHRcdC8vIERvbid0IHRvZ2dsZSBpZiBjbGlja2luZyBvbiBhY3Rpb25zIG9yIHRoZSBjb2xsYXBzZSBidXR0b24gaXRzZWxmIChhbHJlYWR5IGhhbmRsZWQpXG5cdFx0XHRcdGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0O1xuXHRcdFx0XHRpZiAoISh0YXJnZXQgaW5zdGFuY2VvZiBFbGVtZW50KSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGFyZ2V0LmNsb3Nlc3QoJy5hY3Rpb25zJykgfHwgdGFyZ2V0LmNsb3Nlc3QoJy5jb2xsYXBzZS1idXR0b24nKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl92aWV3TW9kZWwuZ2V0KCk/LmNvbGxhcHNlZC5zZXQoIXRoaXMuX2NvbGxhcHNlZC5nZXQoKSwgdW5kZWZpbmVkKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuX2VsZW1lbnRzLmhlYWRlciwgRXZlbnRUeXBlLktFWV9ET1dOLCAoZSkgPT4ge1xuXHRcdFx0XHRpZiAoZS5rZXkgPT09ICdFbnRlcicgfHwgZS5rZXkgPT09ICcgJykge1xuXHRcdFx0XHRcdGNvbnN0IHRhcmdldCA9IGUudGFyZ2V0O1xuXHRcdFx0XHRcdGlmICh0YXJnZXQgaW5zdGFuY2VvZiBFbGVtZW50ICYmICh0YXJnZXQuY2xvc2VzdCgnLmFjdGlvbnMnKSB8fCB0YXJnZXQuY2xvc2VzdCgnLmNvbGxhcHNlLWJ1dHRvbicpKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0dGhpcy5fdmlld01vZGVsLmdldCgpPy5jb2xsYXBzZWQuc2V0KCF0aGlzLl9jb2xsYXBzZWQuZ2V0KCksIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjb2xsYXBzZWQgPSB0aGlzLl9jb2xsYXBzZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0dGhpcy5fZWxlbWVudHMuZWRpdG9yLnN0eWxlLmRpc3BsYXkgPSBjb2xsYXBzZWQgPyAnbm9uZScgOiAnYmxvY2snO1xuXHRcdFx0aWYgKHRoaXMuX3dvcmtiZW5jaFVJRWxlbWVudEZhY3RvcnkuaGVhZGVyQ2xpY2tUb0NvbGxhcHNlKSB7XG5cdFx0XHRcdHRoaXMuX2VsZW1lbnRzLmhlYWRlci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBTdHJpbmcoIWNvbGxhcHNlZCkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLmdldE1vZGlmaWVkRWRpdG9yKCkub25EaWRMYXlvdXRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRjb25zdCB3aWR0aCA9IHRoaXMuZWRpdG9yLmdldE1vZGlmaWVkRWRpdG9yKCkuZ2V0TGF5b3V0SW5mbygpLmNvbnRlbnRXaWR0aDtcblx0XHRcdHRoaXMuX21vZGlmaWVkV2lkdGguc2V0KHdpZHRoLCB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLmdldE9yaWdpbmFsRWRpdG9yKCkub25EaWRMYXlvdXRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRjb25zdCB3aWR0aCA9IHRoaXMuZWRpdG9yLmdldE9yaWdpbmFsRWRpdG9yKCkuZ2V0TGF5b3V0SW5mbygpLmNvbnRlbnRXaWR0aDtcblx0XHRcdHRoaXMuX29yaWdpbmFsV2lkdGguc2V0KHdpZHRoLCB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuZWRpdG9yLm9uRGlkQ29udGVudFNpemVDaGFuZ2UoZSA9PiB7XG5cdFx0XHRnbG9iYWxUcmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHRcdHRoaXMuX2VkaXRvckNvbnRlbnRIZWlnaHQuc2V0KGUuY29udGVudEhlaWdodCwgdHgpO1xuXHRcdFx0XHR0aGlzLl9tb2RpZmllZENvbnRlbnRXaWR0aC5zZXQodGhpcy5lZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKS5nZXRDb250ZW50V2lkdGgoKSwgdHgpO1xuXHRcdFx0XHR0aGlzLl9vcmlnaW5hbENvbnRlbnRXaWR0aC5zZXQodGhpcy5lZGl0b3IuZ2V0T3JpZ2luYWxFZGl0b3IoKS5nZXRDb250ZW50V2lkdGgoKSwgdHgpO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3IuZ2V0T3JpZ2luYWxFZGl0b3IoKS5vbkRpZFNjcm9sbENoYW5nZShlID0+IHtcblx0XHRcdGlmICh0aGlzLl9pc1NldHRpbmdTY3JvbGxUb3ApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIWUuc2Nyb2xsVG9wQ2hhbmdlZCB8fCAhdGhpcy5fZGF0YSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkZWx0YSA9IGUuc2Nyb2xsVG9wIC0gdGhpcy5fbGFzdFNjcm9sbFRvcDtcblx0XHRcdHRoaXMuX2RhdGEuZGVsdGFTY3JvbGxWZXJ0aWNhbChkZWx0YSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgaXNBY3RpdmUgPSB0aGlzLl92aWV3TW9kZWwucmVhZChyZWFkZXIpPy5pc0FjdGl2ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHR0aGlzLl9lbGVtZW50cy5yb290LmNsYXNzTGlzdC50b2dnbGUoJ2FjdGl2ZScsIGlzQWN0aXZlKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9jb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5fZWxlbWVudHMucm9vdCk7XG5cdFx0dGhpcy5fb3V0ZXJFZGl0b3JIZWlnaHQgPSB0aGlzLl9oZWFkZXJIZWlnaHQ7XG5cblx0XHR0aGlzLl9jb250ZXh0S2V5U2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKF9wYXJlbnRDb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQodGhpcy5fZWxlbWVudHMuYWN0aW9ucykpO1xuXHRcdGNvbnN0IGN0eEFsbFVuY2hhbmdlZFJlZ2lvbnNTaG93biA9IEVkaXRvckNvbnRleHRLZXlzLm11bHRpRGlmZkVkaXRvckl0ZW1BbGxVbmNoYW5nZWRSZWdpb25zU2hvd24uYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjdHhBbGxVbmNoYW5nZWRSZWdpb25zU2hvd24uc2V0KHRoaXMuZWRpdG9yLmFsbFVuY2hhbmdlZFJlZ2lvbnNTaG93bi5yZWFkKHJlYWRlcikpO1xuXHRcdH0pKTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZV0pKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIHRoaXMuX2VsZW1lbnRzLmFjdGlvbnMsIE1lbnVJZC5NdWx0aURpZmZFZGl0b3JGaWxlVG9vbGJhciwge1xuXHRcdFx0YWN0aW9uUnVubmVyOiB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uUnVubmVyV2l0aENvbnRleHQoKCkgPT4gKHRoaXMuX3ZpZXdNb2RlbC5nZXQoKT8ubW9kaWZpZWRVcmkgPz8gdGhpcy5fdmlld01vZGVsLmdldCgpPy5vcmlnaW5hbFVyaSkpKSxcblx0XHRcdGhpZ2hsaWdodFRvZ2dsZWRJdGVtczogdHJ1ZSxcblx0XHRcdG1lbnVPcHRpb25zOiB7XG5cdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHByaW1hcnlHcm91cDogZyA9PiBnLnN0YXJ0c1dpdGgoJ25hdmlnYXRpb24nKSB9LFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogKGFjdGlvbiwgb3B0aW9ucykgPT4gdGhpcy5fd29ya2JlbmNoVUlFbGVtZW50RmFjdG9yeS5jcmVhdGVUb29sYmFyQWN0aW9uVmlld0l0ZW0/LihhY3Rpb24sIG9wdGlvbnMpID8/IGNyZWF0ZUFjdGlvblZpZXdJdGVtKGluc3RhbnRpYXRpb25TZXJ2aWNlLCBhY3Rpb24sIG9wdGlvbnMpLFxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRTY3JvbGxMZWZ0KGxlZnQ6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9tb2RpZmllZENvbnRlbnRXaWR0aC5nZXQoKSAtIHRoaXMuX21vZGlmaWVkV2lkdGguZ2V0KCkgPiB0aGlzLl9vcmlnaW5hbENvbnRlbnRXaWR0aC5nZXQoKSAtIHRoaXMuX29yaWdpbmFsV2lkdGguZ2V0KCkpIHtcblx0XHRcdHRoaXMuZWRpdG9yLmdldE1vZGlmaWVkRWRpdG9yKCkuc2V0U2Nyb2xsTGVmdChsZWZ0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5lZGl0b3IuZ2V0T3JpZ2luYWxFZGl0b3IoKS5zZXRTY3JvbGxMZWZ0KGxlZnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RhdGFTdG9yZTtcblxuXHRwcml2YXRlIF9kYXRhOiBUZW1wbGF0ZURhdGEgfCB1bmRlZmluZWQ7XG5cblx0cHVibGljIHNldERhdGEoZGF0YTogVGVtcGxhdGVEYXRhIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fZGF0YSA9IGRhdGE7XG5cdFx0Y29uc3Qgb3B0aW9uc092ZXJyaWRlID0gdGhpcy5fb3B0aW9uc092ZXJyaWRlO1xuXHRcdGZ1bmN0aW9uIHVwZGF0ZU9wdGlvbnMob3B0aW9uczogSURpZmZFZGl0b3JPcHRpb25zKTogSURpZmZFZGl0b3JPcHRpb25zIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdC4uLm9wdGlvbnNPdmVycmlkZT8uZ2V0KCksXG5cdFx0XHRcdHNjcm9sbEJleW9uZExhc3RMaW5lOiBmYWxzZSxcblx0XHRcdFx0aGlkZVVuY2hhbmdlZFJlZ2lvbnM6IHtcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzY3JvbGxiYXI6IHtcblx0XHRcdFx0XHR2ZXJ0aWNhbDogJ2hpZGRlbicsXG5cdFx0XHRcdFx0aG9yaXpvbnRhbDogJ2hpZGRlbicsXG5cdFx0XHRcdFx0aGFuZGxlTW91c2VXaGVlbDogZmFsc2UsXG5cdFx0XHRcdFx0dXNlU2hhZG93czogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlbmRlck92ZXJ2aWV3UnVsZXI6IGZhbHNlLFxuXHRcdFx0XHRmaXhlZE92ZXJmbG93V2lkZ2V0czogdHJ1ZSxcblx0XHRcdFx0b3ZlcnZpZXdSdWxlckJvcmRlcjogZmFsc2UsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICghZGF0YSkge1xuXHRcdFx0Z2xvYmFsVHJhbnNhY3Rpb24odHggPT4ge1xuXHRcdFx0XHR0aGlzLl92aWV3TW9kZWwuc2V0KHVuZGVmaW5lZCwgdHgpO1xuXHRcdFx0XHR0aGlzLmVkaXRvci5zZXREaWZmTW9kZWwobnVsbCwgdHgpO1xuXHRcdFx0XHR0aGlzLl9kYXRhU3RvcmUuY2xlYXIoKTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHZhbHVlID0gZGF0YS52aWV3TW9kZWwuZG9jdW1lbnREaWZmSXRlbTtcblxuXHRcdGdsb2JhbFRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdHRoaXMuX3Jlc291cmNlTGFiZWw/LnNldFVyaShkYXRhLnZpZXdNb2RlbC5tb2RpZmllZFVyaSA/PyBkYXRhLnZpZXdNb2RlbC5vcmlnaW5hbFVyaSEsIHsgc3RyaWtldGhyb3VnaDogZGF0YS52aWV3TW9kZWwubW9kaWZpZWRVcmkgPT09IHVuZGVmaW5lZCB9KTtcblxuXHRcdFx0bGV0IGlzUmVuYW1lZCA9IGZhbHNlO1xuXHRcdFx0bGV0IGlzRGVsZXRlZCA9IGZhbHNlO1xuXHRcdFx0bGV0IGlzQWRkZWQgPSBmYWxzZTtcblx0XHRcdGxldCBmbGFnID0gJyc7XG5cdFx0XHRpZiAoZGF0YS52aWV3TW9kZWwubW9kaWZpZWRVcmkgJiYgZGF0YS52aWV3TW9kZWwub3JpZ2luYWxVcmkgJiYgZGF0YS52aWV3TW9kZWwubW9kaWZpZWRVcmkucGF0aCAhPT0gZGF0YS52aWV3TW9kZWwub3JpZ2luYWxVcmkucGF0aCkge1xuXHRcdFx0XHRmbGFnID0gJ1InO1xuXHRcdFx0XHRpc1JlbmFtZWQgPSB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmICghZGF0YS52aWV3TW9kZWwubW9kaWZpZWRVcmkpIHtcblx0XHRcdFx0ZmxhZyA9ICdEJztcblx0XHRcdFx0aXNEZWxldGVkID0gdHJ1ZTtcblx0XHRcdH0gZWxzZSBpZiAoIWRhdGEudmlld01vZGVsLm9yaWdpbmFsVXJpKSB7XG5cdFx0XHRcdGZsYWcgPSAnQSc7XG5cdFx0XHRcdGlzQWRkZWQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZWxlbWVudHMuc3RhdHVzLmNsYXNzTGlzdC50b2dnbGUoJ3JlbmFtZWQnLCBpc1JlbmFtZWQpO1xuXHRcdFx0dGhpcy5fZWxlbWVudHMuc3RhdHVzLmNsYXNzTGlzdC50b2dnbGUoJ2RlbGV0ZWQnLCBpc0RlbGV0ZWQpO1xuXHRcdFx0dGhpcy5fZWxlbWVudHMuc3RhdHVzLmNsYXNzTGlzdC50b2dnbGUoJ2FkZGVkJywgaXNBZGRlZCk7XG5cdFx0XHR0aGlzLl9lbGVtZW50cy5zdGF0dXMuaW5uZXJUZXh0ID0gZmxhZztcblxuXHRcdFx0dGhpcy5fcmVzb3VyY2VMYWJlbDI/LnNldFVyaShpc1JlbmFtZWQgPyBkYXRhLnZpZXdNb2RlbC5vcmlnaW5hbFVyaSA6IHVuZGVmaW5lZCwgeyBzdHJpa2V0aHJvdWdoOiB0cnVlIH0pO1xuXG5cdFx0XHR0aGlzLl9kYXRhU3RvcmUuY2xlYXIoKTtcblx0XHRcdHRoaXMuX3ZpZXdNb2RlbC5zZXQoZGF0YS52aWV3TW9kZWwsIHR4KTtcblx0XHRcdHRoaXMuZWRpdG9yLnNldERpZmZNb2RlbChkYXRhLnZpZXdNb2RlbC5kaWZmRWRpdG9yVmlld01vZGVsUmVmLCB0eCk7XG5cdFx0XHR0aGlzLmVkaXRvci51cGRhdGVPcHRpb25zKHVwZGF0ZU9wdGlvbnModmFsdWUub3B0aW9ucyA/PyB7fSkpO1xuXHRcdH0pO1xuXHRcdGlmICh2YWx1ZS5vbk9wdGlvbnNEaWRDaGFuZ2UpIHtcblx0XHRcdHRoaXMuX2RhdGFTdG9yZS5hZGQodmFsdWUub25PcHRpb25zRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5lZGl0b3IudXBkYXRlT3B0aW9ucyh1cGRhdGVPcHRpb25zKHZhbHVlLm9wdGlvbnMgPz8ge30pKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdFx0aWYgKG9wdGlvbnNPdmVycmlkZSkge1xuXHRcdFx0dGhpcy5fZGF0YVN0b3JlLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdG9wdGlvbnNPdmVycmlkZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHRoaXMuZWRpdG9yLnVwZGF0ZU9wdGlvbnModXBkYXRlT3B0aW9ucyh2YWx1ZS5vcHRpb25zID8/IHt9KSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdGRhdGEudmlld01vZGVsLmlzQWxpdmUucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fZGF0YVN0b3JlLCB2YWx1ZSA9PiB7XG5cdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdHRoaXMuc2V0RGF0YSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKGRhdGEudmlld01vZGVsLmRvY3VtZW50RGlmZkl0ZW0uY29udGV4dEtleXMpIHtcblx0XHRcdGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKGRhdGEudmlld01vZGVsLmRvY3VtZW50RGlmZkl0ZW0uY29udGV4dEtleXMpKSB7XG5cdFx0XHRcdHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleShrZXksIHZhbHVlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9oZWFkZXJIZWlnaHQ7XG5cblx0cHJpdmF0ZSBfbGFzdFNjcm9sbFRvcDtcblx0cHJpdmF0ZSBfaXNTZXR0aW5nU2Nyb2xsVG9wO1xuXG5cdHB1YmxpYyByZW5kZXIodmVydGljYWxSYW5nZTogT2Zmc2V0UmFuZ2UsIHdpZHRoOiBudW1iZXIsIGVkaXRvclNjcm9sbDogbnVtYmVyLCB2aWV3UG9ydDogT2Zmc2V0UmFuZ2UpOiB2b2lkIHtcblx0XHR0aGlzLl9lbGVtZW50cy5yb290LnN0eWxlLnZpc2liaWxpdHkgPSAndmlzaWJsZSc7XG5cdFx0dGhpcy5fZWxlbWVudHMucm9vdC5zdHlsZS50b3AgPSBgJHt2ZXJ0aWNhbFJhbmdlLnN0YXJ0fXB4YDtcblx0XHR0aGlzLl9lbGVtZW50cy5yb290LnN0eWxlLmhlaWdodCA9IGAke3ZlcnRpY2FsUmFuZ2UubGVuZ3RofXB4YDtcblx0XHR0aGlzLl9lbGVtZW50cy5yb290LnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRcdHRoaXMuX2VsZW1lbnRzLnJvb3Quc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXG5cdFx0Ly8gRm9yIHN0aWNreSBzY3JvbGxcblx0XHRjb25zdCBtYXhEZWx0YSA9IHZlcnRpY2FsUmFuZ2UubGVuZ3RoIC0gdGhpcy5faGVhZGVySGVpZ2h0O1xuXHRcdGNvbnN0IGRlbHRhID0gTWF0aC5tYXgoMCwgTWF0aC5taW4odmlld1BvcnQuc3RhcnQgLSB2ZXJ0aWNhbFJhbmdlLnN0YXJ0LCBtYXhEZWx0YSkpO1xuXHRcdHRoaXMuX2VsZW1lbnRzLmhlYWRlci5zdHlsZS50cmFuc2Zvcm0gPSBgdHJhbnNsYXRlWSgke2RlbHRhfXB4KWA7XG5cblx0XHRnbG9iYWxUcmFuc2FjdGlvbih0eCA9PiB7XG5cdFx0XHR0aGlzLmVkaXRvci5sYXlvdXQoe1xuXHRcdFx0XHR3aWR0aDogd2lkdGggLSAyICogOCAtIDIgKiAxLFxuXHRcdFx0XHRoZWlnaHQ6IHZlcnRpY2FsUmFuZ2UubGVuZ3RoIC0gdGhpcy5fb3V0ZXJFZGl0b3JIZWlnaHQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5faXNTZXR0aW5nU2Nyb2xsVG9wID0gdHJ1ZTtcblx0XHRcdHRoaXMuX2xhc3RTY3JvbGxUb3AgPSBlZGl0b3JTY3JvbGw7XG5cdFx0XHR0aGlzLmVkaXRvci5nZXRPcmlnaW5hbEVkaXRvcigpLnNldFNjcm9sbFRvcChlZGl0b3JTY3JvbGwpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9pc1NldHRpbmdTY3JvbGxUb3AgPSBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9lbGVtZW50cy5oZWFkZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc2hhZG93JywgZGVsdGEgPiAwIHx8IGVkaXRvclNjcm9sbCA+IDApO1xuXHRcdHRoaXMuX2VsZW1lbnRzLmhlYWRlci5jbGFzc0xpc3QudG9nZ2xlKCdjb2xsYXBzZWQnLCBkZWx0YSA9PT0gbWF4RGVsdGEpO1xuXHR9XG5cblx0cHVibGljIGhpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fZWxlbWVudHMucm9vdC5zdHlsZS50b3AgPSBgLTEwMDAwMHB4YDtcblx0XHR0aGlzLl9lbGVtZW50cy5yb290LnN0eWxlLnZpc2liaWxpdHkgPSAnaGlkZGVuJzsgLy8gU29tZSBlZGl0b3IgcGFydHMgYXJlIHN0aWxsIHZpc2libGVcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFJQSxTQUFTLHVCQUF1QixXQUFXLFNBQVM7QUFDcEQsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsU0FBUyxTQUFTLG1CQUFnQyx1QkFBdUI7QUFDbEYsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsMEJBQXlEO0FBQ2xFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBR2xDLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsd0JBQXdCO0FBR2pDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQXFDLG9DQUFvQztBQUVsRSxNQUFNLGFBQW9DO0FBQUEsRUFDaEQsWUFDaUIsV0FDQSxxQkFDZjtBQUZlO0FBQ0E7QUFBQSxFQUNiO0FBQUEsRUFHSixRQUFpQjtBQUNoQixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQ0Q7QUFFTyxJQUFNLHlCQUFOLGNBQXFDLFdBQWtEO0FBQUEsRUE4QjdGLFlBQ2tCLFlBQ0EseUJB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
