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
import { StandardMouseEvent } from "../../../../base/browser/mouseEvent.js";
import { PixelRatio } from "../../../../base/browser/pixelRatio.js";
import { BreadcrumbsItem, BreadcrumbsWidget } from "../../../../base/browser/ui/breadcrumbs/breadcrumbsWidget.js";
import { applyDragImage } from "../../../../base/browser/ui/dnd/dnd.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { timeout } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Emitter } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { combinedDisposable, DisposableStore, MutableDisposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { basename, extUri } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { OutlineElement } from "../../../../editor/contrib/documentSymbols/browser/outlineModel.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { Action2, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextViewService, IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { fillInSymbolsDragData, LocalSelectionTransfer } from "../../../../platform/dnd/browser/dnd.js";
import { FileKind, IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { KeybindingsRegistry, KeybindingWeight } from "../../../../platform/keybinding/common/keybindingsRegistry.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IListService, WorkbenchAsyncDataTree, WorkbenchDataTree, WorkbenchListFocusContextKey } from "../../../../platform/list/browser/listService.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { defaultBreadcrumbsWidgetStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { registerIcon } from "../../../../platform/theme/common/iconRegistry.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../common/editor.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorResolverService } from "../../../services/editor/common/editorResolverService.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IOutlineService, OutlineTarget } from "../../../services/outline/browser/outline.js";
import { DraggedEditorIdentifier, fillEditorsDragData } from "../../dnd.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../labels.js";
import { BreadcrumbsConfig, IBreadcrumbsService } from "./breadcrumbs.js";
import { BreadcrumbsModel, FileElement, OutlineElement2 } from "./breadcrumbsModel.js";
import { BreadcrumbsFilePicker, BreadcrumbsOutlinePicker } from "./breadcrumbsPicker.js";
import { createEditorTypeActions, editorTypeDisplayLabel, getAvailableEditorTypes, hasDefaultEditorAssociation } from "./editorTypePicker.js";
import "./media/breadcrumbscontrol.css";
import { ScrollbarVisibility } from "../../../../base/common/scrollable.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
let OutlineItem = class extends BreadcrumbsItem {
  constructor(model, element, options, _instantiationService) {
    super();
    this.model = model;
    this.element = element;
    this.options = options;
    this._instantiationService = _instantiationService;
    this._disposables = new DisposableStore();
  }
  dispose() {
    this._disposables.dispose();
  }
  equals(other) {
    if (!(other instanceof OutlineItem)) {
      return false;
    }
    return this.element.element === other.element.element && this.options.showFileIcons === other.options.showFileIcons && this.options.showSymbolIcons === other.options.showSymbolIcons;
  }
  render(container) {
    const { element, outline } = this.element;
    if (element === outline) {
      const element2 = dom.$("span", void 0, "\u2026");
      container.appendChild(element2);
      return;
    }
    const templateId = outline.config.delegate.getTemplateId(element);
    const renderer = outline.config.renderers.find((renderer2) => renderer2.templateId === templateId);
    if (!renderer) {
      container.textContent = "<<NO RENDERER>>";
      return;
    }
    const template = renderer.renderTemplate(container);
    renderer.renderElement({
      element,
      children: [],
      depth: 0,
      visibleChildrenCount: 0,
      visibleChildIndex: 0,
      collapsible: false,
      collapsed: false,
      visible: true,
      filterData: void 0
    }, 0, template, void 0);
    if (!this.options.showSymbolIcons) {
      dom.hide(template.iconClass);
    }
    this._disposables.add(toDisposable(() => {
      renderer.disposeTemplate(template);
    }));
    if (element instanceof OutlineElement && outline.uri) {
      this._disposables.add(this._instantiationService.invokeFunction((accessor) => createBreadcrumbDndObserver(accessor, container, element.symbol.name, { symbol: element.symbol, uri: outline.uri }, this.model, this.options.dragEditor)));
    }
  }
};
OutlineItem = __decorateClass([
  __decorateParam(3, IInstantiationService)
], OutlineItem);
let FileItem = class extends BreadcrumbsItem {
  constructor(model, element, options, _labels, _hoverDelegate, _instantiationService) {
    super();
    this.model = model;
    this.element = element;
    this.options = options;
    this._labels = _labels;
    this._hoverDelegate = _hoverDelegate;
    this._instantiationService = _instantiationService;
    this._disposables = new DisposableStore();
  }
  dispose() {
    this._disposables.dispose();
  }
  equals(other) {
    if (!(other instanceof FileItem)) {
      return false;
    }
    return extUri.isEqual(this.element.uri, other.element.uri) && this.options.showFileIcons === other.options.showFileIcons && this.options.showSymbolIcons === other.options.showSymbolIcons;
  }
  render(container) {
    const label = this._labels.create(container, { hoverDelegate: this._hoverDelegate });
    label.setFile(this.element.uri, {
      hidePath: true,
      hideIcon: this.element.kind === FileKind.FOLDER || !this.options.showFileIcons,
      fileKind: this.element.kind,
      fileDecorations: { colors: this.options.showDecorationColors, badges: false }
    });
    container.classList.add(FileKind[this.element.kind].toLowerCase());
    this._disposables.add(label);
    this._disposables.add(this._instantiationService.invokeFunction((accessor) => createBreadcrumbDndObserver(accessor, container, basename(this.element.uri), this.element.uri, this.model, this.options.dragEditor)));
  }
};
FileItem = __decorateClass([
  __decorateParam(5, IInstantiationService)
], FileItem);
function createBreadcrumbDndObserver(accessor, container, label, item, model, dragEditor) {
  const instantiationService = accessor.get(IInstantiationService);
  container.draggable = true;
  return new dom.DragAndDropObserver(container, {
    onDragStart: (event) => {
      if (!event.dataTransfer) {
        return;
      }
      event.dataTransfer.effectAllowed = "copyMove";
      instantiationService.invokeFunction((accessor2) => {
        if (URI.isUri(item)) {
          fillEditorsDragData(accessor2, [item], event);
        } else {
          fillEditorsDragData(accessor2, [{ resource: item.uri, selection: item.symbol.range }], event);
          fillInSymbolsDragData([{
            name: item.symbol.name,
            fsPath: item.uri.fsPath,
            range: item.symbol.range,
            kind: item.symbol.kind
          }], event);
        }
        if (dragEditor && model.editor?.input) {
          const editorTransfer = LocalSelectionTransfer.getInstance();
          editorTransfer.setData([new DraggedEditorIdentifier({ editor: model.editor.input, groupId: model.editor.group.id })], DraggedEditorIdentifier.prototype);
        }
      });
      applyDragImage(event, container, label);
    }
  });
}
const separatorIcon = registerIcon("breadcrumb-separator", Codicon.chevronRight, localize("separatorIcon", "Icon for the separator in the breadcrumbs."));
let BreadcrumbsControl = class {
  constructor(container, _options, _editorGroup, _contextKeyService, _contextViewService, _contextMenuService, _instantiationService, _quickInputService, _fileService, _editorService, _editorResolverService, _commandService, _labelService, configurationService, _hoverService, breadcrumbsService) {
    this._options = _options;
    this._editorGroup = _editorGroup;
    this._contextKeyService = _contextKeyService;
    this._contextViewService = _contextViewService;
    this._contextMenuService = _contextMenuService;
    this._instantiationService = _instantiationService;
    this._quickInputService = _quickInputService;
    this._fileService = _fileService;
    this._editorService = _editorService;
    this._editorResolverService = _editorResolverService;
    this._commandService = _commandService;
    this._labelService = _labelService;
    this._hoverService = _hoverService;
    this._disposables = new DisposableStore();
    this._editorTypeDisposables = this._disposables.add(new DisposableStore());
    this._breadcrumbsDisposables = new DisposableStore();
    this._model = new MutableDisposable();
    this._breadcrumbsPickerShowing = false;
    this._onDidVisibilityChange = this._disposables.add(new Emitter());
    this.domNode = document.createElement("div");
    this.domNode.classList.add("breadcrumbs-control");
    this.domNode.classList.toggle("with-editor-type", !!_options.showEditorTypePicker);
    dom.append(container, this.domNode);
    this._cfUseQuickPick = BreadcrumbsConfig.UseQuickPick.bindTo(configurationService);
    this._cfShowIcons = BreadcrumbsConfig.Icons.bindTo(configurationService);
    this._cfShowEditorType = BreadcrumbsConfig.ShowEditorType.bindTo(configurationService);
    this._cfTitleScrollbarSizing = BreadcrumbsConfig.TitleScrollbarSizing.bindTo(configurationService);
    this._cfTitleScrollbarVisibility = BreadcrumbsConfig.TitleScrollbarVisibility.bindTo(configurationService);
    this._labels = this._instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER);
    const sizing = this._cfTitleScrollbarSizing.getValue() ?? "default";
    const styles = _options.widgetStyles ?? defaultBreadcrumbsWidgetStyles;
    const visibility = this._cfTitleScrollbarVisibility?.getValue() ?? "auto";
    this._widget = new BreadcrumbsWidget(
      this.domNode,
      BreadcrumbsControl.SCROLLBAR_SIZES[sizing],
      BreadcrumbsControl.SCROLLBAR_VISIBILITY[visibility],
      separatorIcon,
      styles
    );
    this._widget.onDidSelectItem(this._onSelectEvent, this, this._disposables);
    this._widget.onDidFocusItem(this._onFocusEvent, this, this._disposables);
    this._widget.onDidChangeFocus(this._updateCkBreadcrumbsActive, this, this._disposables);
    if (this._options.showEditorTypePicker) {
      this._disposables.add(this._cfShowEditorType.onDidChange(() => this._updateEditorTypeControl()));
    }
    this._ckBreadcrumbsPossible = BreadcrumbsControl.CK_BreadcrumbsPossible.bindTo(this._contextKeyService);
    this._ckBreadcrumbsVisible = BreadcrumbsControl.CK_BreadcrumbsVisible.bindTo(this._contextKeyService);
    this._ckBreadcrumbsActive = BreadcrumbsControl.CK_BreadcrumbsActive.bindTo(this._contextKeyService);
    this._ckBreadcrumbsHasSymbols = BreadcrumbsControl.CK_BreadcrumbsHasSymbols.bindTo(this._contextKeyService);
    this._hoverDelegate = getDefaultHoverDelegate("mouse");
    this._disposables.add(breadcrumbsService.register(this._editorGroup.id, this._widget));
    this.hide();
  }
  get onDidVisibilityChange() {
    return this._onDidVisibilityChange.event;
  }
  dispose() {
    this._disposables.dispose();
    this._breadcrumbsDisposables.dispose();
    this._model.dispose();
    this._ckBreadcrumbsPossible.reset();
    this._ckBreadcrumbsVisible.reset();
    this._ckBreadcrumbsActive.reset();
    this._ckBreadcrumbsHasSymbols.reset();
    this._cfUseQuickPick.dispose();
    this._cfShowIcons.dispose();
    this._cfShowEditorType.dispose();
    this._cfTitleScrollbarSizing.dispose();
    this._cfTitleScrollbarVisibility.dispose();
    this._widget.dispose();
    this._labels.dispose();
    this.domNode.remove();
  }
  get model() {
    return this._model.value;
  }
  layout(dim) {
    if (dim) {
      this._lastLayoutDimension = dim;
    }
    if (dim && this._editorTypeNode) {
      const editorTypeWidth = this._editorTypeNode.offsetWidth;
      dim = new dom.Dimension(Math.max(0, dim.width - editorTypeWidth), dim.height);
    }
    this._widget.layout(dim);
  }
  isHidden() {
    return this.domNode.classList.contains("hidden");
  }
  hide() {
    const wasHidden = this.isHidden();
    this._breadcrumbsDisposables.clear();
    this._ckBreadcrumbsVisible.set(false);
    this._ckBreadcrumbsHasSymbols.set(false);
    this.domNode.classList.toggle("hidden", true);
    this._hideEditorTypeControl();
    if (!wasHidden) {
      this._onDidVisibilityChange.fire();
    }
  }
  show() {
    const wasHidden = this.isHidden();
    this._ckBreadcrumbsVisible.set(true);
    this.domNode.classList.toggle("hidden", false);
    if (wasHidden) {
      this._onDidVisibilityChange.fire();
    }
  }
  revealLast() {
    this._widget.revealLast();
  }
  update() {
    this._breadcrumbsDisposables.clear();
    const uri = EditorResourceAccessor.getCanonicalUri(this._editorGroup.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    const wasHidden = this.isHidden();
    if (!uri || !this._fileService.hasProvider(uri)) {
      this._ckBreadcrumbsPossible.set(false);
      this._ckBreadcrumbsHasSymbols.set(false);
      if (!wasHidden) {
        this.hide();
        return true;
      } else {
        return false;
      }
    }
    const fileInfoUri = EditorResourceAccessor.getOriginalUri(this._editorGroup.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
    this.show();
    this._ckBreadcrumbsPossible.set(true);
    this._updateEditorTypeControl();
    const model = this._instantiationService.createInstance(
      BreadcrumbsModel,
      fileInfoUri ?? uri,
      this._editorGroup.activeEditorPane
    );
    this._model.value = model;
    this.domNode.classList.toggle("backslash-path", this._labelService.getSeparator(uri.scheme, uri.authority) === "\\");
    const updateBreadcrumbs = () => {
      this.domNode.classList.toggle("relative-path", model.isRelative());
      const showIcons = this._cfShowIcons.getValue();
      const options = {
        ...this._options,
        showFileIcons: this._options.showFileIcons && showIcons,
        showSymbolIcons: this._options.showSymbolIcons && showIcons
      };
      const elements = model.getElements();
      this._ckBreadcrumbsHasSymbols.set(elements.some((element) => !(element instanceof FileElement)));
      const items = elements.map((element) => element instanceof FileElement ? this._instantiationService.createInstance(FileItem, model, element, options, this._labels, this._hoverDelegate) : this._instantiationService.createInstance(OutlineItem, model, element, options));
      if (items.length === 0) {
        this._widget.setEnabled(false);
        this._widget.setItems([new class extends BreadcrumbsItem {
          render(container) {
            container.textContent = localize("empty", "no elements");
          }
          equals(other) {
            return other === this;
          }
          dispose() {
          }
        }()]);
      } else {
        this._widget.setEnabled(true);
        this._widget.setItems(items);
        this._widget.reveal(items[items.length - 1]);
      }
    };
    const listener = model.onDidUpdate(updateBreadcrumbs);
    const configListener = this._cfShowIcons.onDidChange(updateBreadcrumbs);
    updateBreadcrumbs();
    this._breadcrumbsDisposables.clear();
    this._breadcrumbsDisposables.add(listener);
    this._breadcrumbsDisposables.add(toDisposable(() => this._model.clear()));
    this._breadcrumbsDisposables.add(configListener);
    this._breadcrumbsDisposables.add(toDisposable(() => this._widget.setItems([])));
    const updateScrollbarSizing = () => {
      const sizing = this._cfTitleScrollbarSizing.getValue() ?? "default";
      const visibility = this._cfTitleScrollbarVisibility?.getValue() ?? "auto";
      this._widget.setHorizontalScrollbarSize(BreadcrumbsControl.SCROLLBAR_SIZES[sizing]);
      this._widget.setHorizontalScrollbarVisibility(BreadcrumbsControl.SCROLLBAR_VISIBILITY[visibility]);
    };
    updateScrollbarSizing();
    const updateScrollbarSizeListener = this._cfTitleScrollbarSizing.onDidChange(updateScrollbarSizing);
    const updateScrollbarVisibilityListener = this._cfTitleScrollbarVisibility.onDidChange(updateScrollbarSizing);
    this._breadcrumbsDisposables.add(updateScrollbarSizeListener);
    this._breadcrumbsDisposables.add(updateScrollbarVisibilityListener);
    this._breadcrumbsDisposables.add({
      dispose: () => {
        if (this._breadcrumbsPickerShowing) {
          this._contextViewService.hideContextView({ source: this });
        }
      }
    });
    return wasHidden !== this.isHidden();
  }
  _updateEditorTypeControl() {
    const previousWidth = this._editorTypeNode?.offsetWidth ?? 0;
    const available = this._options.showEditorTypePicker && this._cfShowEditorType.getValue() ? getAvailableEditorTypes(this._editorGroup.activeEditor, this._editorResolverService) : void 0;
    const configuredDefaultEditor = available ? this._editorResolverService.getConfiguredDefaultEditor(available.resource, available.isDiffEditor) : void 0;
    if (!available || !hasDefaultEditorAssociation(available, configuredDefaultEditor)) {
      this._hideEditorTypeControl();
    } else {
      const { label: editorTypeLabel, hover: editorTypeHover } = this._createEditorTypeControl();
      const current = available.editors.find((editor) => editor.id === available.currentId);
      const label = current ? editorTypeDisplayLabel(current, available.isDiffEditor) : available.currentId;
      editorTypeLabel.textContent = label;
      editorTypeHover.update(localize("editorType.hover", "Editor: {0}", label));
    }
    const currentWidth = this._editorTypeNode?.offsetWidth ?? 0;
    if (this._lastLayoutDimension && currentWidth !== previousWidth) {
      this.layout(this._lastLayoutDimension);
    }
  }
  _createEditorTypeControl() {
    if (this._editorTypeNode && this._editorTypeLabel && this._editorTypeHover) {
      return { label: this._editorTypeLabel, hover: this._editorTypeHover };
    }
    this._editorTypeNode = document.createElement("div");
    this._editorTypeNode.classList.add("breadcrumbs-editor-type");
    this._editorTypeNode.setAttribute("role", "button");
    this._editorTypeLabel = document.createElement("span");
    this._editorTypeLabel.classList.add("label");
    this._editorTypeNode.appendChild(this._editorTypeLabel);
    const editorTypeChevron = document.createElement("span");
    editorTypeChevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronDown));
    this._editorTypeNode.appendChild(editorTypeChevron);
    dom.append(this.domNode, this._editorTypeNode);
    this._editorTypeHover = this._editorTypeDisposables.add(this._hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this._editorTypeNode, ""));
    this._editorTypeDisposables.add(dom.addDisposableListener(this._editorTypeNode, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e, true);
      this._showEditorTypePicker();
    }));
    return { label: this._editorTypeLabel, hover: this._editorTypeHover };
  }
  _hideEditorTypeControl() {
    this._editorTypeDisposables.clear();
    this._editorTypeNode?.remove();
    this._editorTypeNode = void 0;
    this._editorTypeLabel = void 0;
    this._editorTypeHover = void 0;
  }
  _showEditorTypePicker() {
    const editorTypeNode = this._editorTypeNode;
    if (!editorTypeNode) {
      return;
    }
    const available = getAvailableEditorTypes(this._editorGroup.activeEditor, this._editorResolverService);
    if (!available) {
      return;
    }
    const actions = createEditorTypeActions(available, this._editorResolverService, this._commandService, this._editorService);
    this._contextMenuService.showContextMenu({
      getAnchor: () => editorTypeNode,
      getActions: () => actions
    });
  }
  _onFocusEvent(event) {
    if (event.item && this._breadcrumbsPickerShowing) {
      this._breadcrumbsPickerIgnoreOnceItem = void 0;
      this._widget.setSelection(event.item);
    }
  }
  _onSelectEvent(event) {
    if (!event.item) {
      return;
    }
    if (event.item === this._breadcrumbsPickerIgnoreOnceItem) {
      this._breadcrumbsPickerIgnoreOnceItem = void 0;
      this._widget.setFocused(void 0);
      this._widget.setSelection(void 0);
      return;
    }
    const { element } = event.item;
    this._editorGroup.focus();
    const group = this._getEditorGroup(event.payload);
    if (group !== void 0) {
      this._widget.setFocused(void 0);
      this._widget.setSelection(void 0);
      this._revealInEditor(event, element, group);
      return;
    }
    if (this._cfUseQuickPick.getValue()) {
      this._widget.setFocused(void 0);
      this._widget.setSelection(void 0);
      this._quickInputService.quickAccess.show(element instanceof OutlineElement2 ? "@" : "");
      return;
    }
    let picker;
    let pickerAnchor;
    this._contextViewService.showContextView({
      render: (parent) => {
        if (event.item instanceof FileItem) {
          picker = this._instantiationService.createInstance(BreadcrumbsFilePicker, parent, event.item.model.resource);
        } else if (event.item instanceof OutlineItem) {
          picker = this._instantiationService.createInstance(BreadcrumbsOutlinePicker, parent, event.item.model.resource);
        }
        const selectListener = picker.onWillPickElement(() => this._contextViewService.hideContextView({ source: this, didPick: true }));
        const zoomListener = PixelRatio.getInstance(dom.getWindow(this.domNode)).onDidChange(() => this._contextViewService.hideContextView({ source: this }));
        const focusTracker = dom.trackFocus(parent);
        const blurListener = focusTracker.onDidBlur(() => {
          this._breadcrumbsPickerIgnoreOnceItem = this._widget.isDOMFocused() ? event.item : void 0;
          this._contextViewService.hideContextView({ source: this });
        });
        this._breadcrumbsPickerShowing = true;
        this._updateCkBreadcrumbsActive();
        return combinedDisposable(
          picker,
          selectListener,
          zoomListener,
          focusTracker,
          blurListener
        );
      },
      getAnchor: () => {
        if (!pickerAnchor) {
          const window = dom.getWindow(this.domNode);
          const maxInnerWidth = window.innerWidth - 8;
          let maxHeight = Math.min(window.innerHeight * 0.7, 300);
          const pickerWidth = Math.min(maxInnerWidth, Math.max(240, maxInnerWidth / 4.17));
          const pickerArrowSize = 8;
          let pickerArrowOffset;
          const data = dom.getDomNodePagePosition(event.node);
          const y = data.top + data.height + pickerArrowSize;
          if (y + maxHeight >= window.innerHeight) {
            maxHeight = window.innerHeight - y - 30;
          }
          let x = data.left;
          if (x + pickerWidth >= maxInnerWidth) {
            x = maxInnerWidth - pickerWidth;
          }
          if (event.payload instanceof StandardMouseEvent) {
            const maxPickerArrowOffset = pickerWidth - 2 * pickerArrowSize;
            pickerArrowOffset = event.payload.posx - x;
            if (pickerArrowOffset > maxPickerArrowOffset) {
              x = Math.min(maxInnerWidth - pickerWidth, x + pickerArrowOffset - maxPickerArrowOffset);
              pickerArrowOffset = maxPickerArrowOffset;
            }
          } else {
            pickerArrowOffset = data.left + data.width * 0.3 - x;
          }
          picker.show(element, maxHeight, pickerWidth, pickerArrowSize, Math.max(0, pickerArrowOffset));
          pickerAnchor = { x, y };
        }
        return pickerAnchor;
      },
      onHide: (data) => {
        if (!data?.didPick) {
          picker.restoreViewState();
        }
        this._breadcrumbsPickerShowing = false;
        this._updateCkBreadcrumbsActive();
        if (data?.source === this) {
          this._widget.setFocused(void 0);
          this._widget.setSelection(void 0);
        }
        picker.dispose();
      }
    });
  }
  _updateCkBreadcrumbsActive() {
    const value = this._widget.isDOMFocused() || this._breadcrumbsPickerShowing;
    this._ckBreadcrumbsActive.set(value);
  }
  async _revealInEditor(event, element, group, pinned = false) {
    if (element instanceof FileElement) {
      if (element.kind === FileKind.FILE) {
        await this._editorService.openEditor({ resource: element.uri, options: { pinned } }, group);
      } else {
        const items = this._widget.getItems();
        const idx = items.indexOf(event.item);
        this._widget.setFocused(items[idx + 1]);
        this._widget.setSelection(items[idx + 1], BreadcrumbsControl.Payload_Pick);
      }
    } else {
      element.outline.reveal(element, { pinned }, group === SIDE_GROUP, false);
    }
  }
  _getEditorGroup(data) {
    if (data === BreadcrumbsControl.Payload_RevealAside) {
      return SIDE_GROUP;
    } else if (data === BreadcrumbsControl.Payload_Reveal) {
      return ACTIVE_GROUP;
    } else {
      return void 0;
    }
  }
};
BreadcrumbsControl.HEIGHT = 22;
BreadcrumbsControl.SCROLLBAR_SIZES = {
  default: 3,
  large: 8
};
BreadcrumbsControl.SCROLLBAR_VISIBILITY = {
  auto: ScrollbarVisibility.Auto,
  visible: ScrollbarVisibility.Visible,
  hidden: ScrollbarVisibility.Hidden
};
BreadcrumbsControl.Payload_Reveal = {};
BreadcrumbsControl.Payload_RevealAside = {};
BreadcrumbsControl.Payload_Pick = {};
BreadcrumbsControl.CK_BreadcrumbsPossible = new RawContextKey("breadcrumbsPossible", false, localize("breadcrumbsPossible", "Whether the editor can show breadcrumbs"));
BreadcrumbsControl.CK_BreadcrumbsVisible = new RawContextKey("breadcrumbsVisible", false, localize("breadcrumbsVisible", "Whether breadcrumbs are currently visible"));
BreadcrumbsControl.CK_BreadcrumbsActive = new RawContextKey("breadcrumbsActive", false, localize("breadcrumbsActive", "Whether breadcrumbs have focus"));
BreadcrumbsControl.CK_BreadcrumbsHasSymbols = new RawContextKey("breadcrumbsHasSymbols", false, localize("breadcrumbsHasSymbols", "Whether breadcrumbs contain symbol items"));
BreadcrumbsControl = __decorateClass([
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IContextViewService),
  __decorateParam(5, IContextMenuService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IQuickInputService),
  __decorateParam(8, IFileService),
  __decorateParam(9, IEditorService),
  __decorateParam(10, IEditorResolverService),
  __decorateParam(11, ICommandService),
  __decorateParam(12, ILabelService),
  __decorateParam(13, IConfigurationService),
  __decorateParam(14, IHoverService),
  __decorateParam(15, IBreadcrumbsService)
], BreadcrumbsControl);
let BreadcrumbsControlFactory = class {
  constructor(_container, _editorGroup, _options, configurationService, _instantiationService, fileService) {
    this._container = _container;
    this._editorGroup = _editorGroup;
    this._options = _options;
    this._instantiationService = _instantiationService;
    this._disposables = new DisposableStore();
    this._controlDisposables = new DisposableStore();
    this._onDidEnablementChange = this._disposables.add(new Emitter());
    this._onDidVisibilityChange = this._disposables.add(new Emitter());
    const config = this._disposables.add(BreadcrumbsConfig.IsEnabled.bindTo(configurationService));
    this._disposables.add(config.onDidChange(() => {
      const value = config.getValue();
      if (!value && this._control) {
        this._controlDisposables.clear();
        this._control = void 0;
        this._onDidEnablementChange.fire();
      } else if (value && !this._control) {
        this._control = this.createControl();
        this._control.update();
        this._onDidEnablementChange.fire();
      }
    }));
    if (config.getValue()) {
      this._control = this.createControl();
    }
    this._disposables.add(fileService.onDidChangeFileSystemProviderRegistrations((e) => {
      if (this._control?.model && this._control.model.resource.scheme !== e.scheme) {
        return;
      }
      if (this._control?.update()) {
        this._onDidEnablementChange.fire();
      }
    }));
  }
  get control() {
    return this._control;
  }
  get onDidEnablementChange() {
    return this._onDidEnablementChange.event;
  }
  get onDidVisibilityChange() {
    return this._onDidVisibilityChange.event;
  }
  createControl() {
    const control = this._controlDisposables.add(this._instantiationService.createInstance(BreadcrumbsControl, this._container, this._options, this._editorGroup));
    this._controlDisposables.add(control.onDidVisibilityChange(() => this._onDidVisibilityChange.fire()));
    return control;
  }
  dispose() {
    this._disposables.dispose();
    this._controlDisposables.dispose();
  }
};
BreadcrumbsControlFactory = __decorateClass([
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IFileService)
], BreadcrumbsControlFactory);
registerAction2(class ToggleBreadcrumb extends Action2 {
  constructor() {
    super({
      id: "breadcrumbs.toggle",
      title: localize2("cmd.toggle", "Toggle Breadcrumbs"),
      shortTitle: localize2("cmd.toggle.short", "Breadcrumbs"),
      category: Categories.View,
      toggled: {
        condition: ContextKeyExpr.equals("config.breadcrumbs.enabled", true),
        title: localize("cmd.toggle2", "Breadcrumbs"),
        mnemonicTitle: localize({ key: "miBreadcrumbs2", comment: ["&& denotes a mnemonic"] }, "&&Breadcrumbs")
      },
      menu: [
        { id: MenuId.CommandPalette },
        { id: MenuId.MenubarAppearanceMenu, group: "4_editor", order: 2 },
        { id: MenuId.NotebookToolbar, group: "notebookLayout", order: 2 },
        { id: MenuId.StickyScrollContext },
        { id: MenuId.NotebookStickyScrollContext, group: "notebookView", order: 2 },
        { id: MenuId.NotebookToolbarContext, group: "notebookView", order: 2 }
      ]
    });
  }
  run(accessor) {
    const config = accessor.get(IConfigurationService);
    const breadCrumbsConfig = BreadcrumbsConfig.IsEnabled.bindTo(config);
    const value = breadCrumbsConfig.getValue();
    breadCrumbsConfig.updateValue(!value);
    breadCrumbsConfig.dispose();
  }
});
function focusAndSelectHandler(accessor, select) {
  const groups = accessor.get(IEditorGroupsService);
  const breadcrumbs = accessor.get(IBreadcrumbsService);
  const widget = breadcrumbs.getWidget(groups.activeGroup.id);
  if (widget) {
    const item = widget.getItems().at(-1);
    widget.setFocused(item);
    if (select) {
      widget.setSelection(item, BreadcrumbsControl.Payload_Pick);
    }
  }
}
registerAction2(class FocusAndSelectBreadcrumbs extends Action2 {
  constructor() {
    super({
      id: "breadcrumbs.focusAndSelect",
      title: localize2("cmd.focusAndSelect", "Focus and Select Breadcrumbs"),
      precondition: BreadcrumbsControl.CK_BreadcrumbsVisible,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Period,
        when: BreadcrumbsControl.CK_BreadcrumbsPossible
      },
      f1: true
    });
  }
  run(accessor, ...args) {
    focusAndSelectHandler(accessor, true);
  }
});
registerAction2(class FocusBreadcrumbs extends Action2 {
  constructor() {
    super({
      id: "breadcrumbs.focus",
      title: localize2("cmd.focus", "Focus Breadcrumbs"),
      precondition: BreadcrumbsControl.CK_BreadcrumbsVisible,
      keybinding: {
        weight: KeybindingWeight.WorkbenchContrib,
        primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Semicolon,
        when: BreadcrumbsControl.CK_BreadcrumbsPossible
      },
      f1: true
    });
  }
  run(accessor, ...args) {
    focusAndSelectHandler(accessor, false);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.toggleToOn",
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.Period,
  when: ContextKeyExpr.not("config.breadcrumbs.enabled"),
  handler: async (accessor) => {
    const instant = accessor.get(IInstantiationService);
    const config = accessor.get(IConfigurationService);
    const isEnabled = BreadcrumbsConfig.IsEnabled.bindTo(config);
    if (!isEnabled.getValue()) {
      await isEnabled.updateValue(true);
      await timeout(50);
    }
    isEnabled.dispose();
    return instant.invokeFunction(focusAndSelectHandler, true);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.focusNext",
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyCode.RightArrow,
  secondary: [KeyMod.CtrlCmd | KeyCode.RightArrow],
  mac: {
    primary: KeyCode.RightArrow,
    secondary: [KeyMod.Alt | KeyCode.RightArrow]
  },
  when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
  handler(accessor) {
    const groups = accessor.get(IEditorGroupsService);
    const breadcrumbs = accessor.get(IBreadcrumbsService);
    const widget = breadcrumbs.getWidget(groups.activeGroup.id);
    if (!widget) {
      return;
    }
    widget.focusNext();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.focusPrevious",
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyCode.LeftArrow,
  secondary: [KeyMod.CtrlCmd | KeyCode.LeftArrow],
  mac: {
    primary: KeyCode.LeftArrow,
    secondary: [KeyMod.Alt | KeyCode.LeftArrow]
  },
  when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
  handler(accessor) {
    const groups = accessor.get(IEditorGroupsService);
    const breadcrumbs = accessor.get(IBreadcrumbsService);
    const widget = breadcrumbs.getWidget(groups.activeGroup.id);
    if (!widget) {
      return;
    }
    widget.focusPrev();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.focusNextWithPicker",
  weight: KeybindingWeight.WorkbenchContrib + 1,
  primary: KeyMod.CtrlCmd | KeyCode.RightArrow,
  mac: {
    primary: KeyMod.Alt | KeyCode.RightArrow
  },
  when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive, WorkbenchListFocusContextKey),
  handler(accessor) {
    const groups = accessor.get(IEditorGroupsService);
    const breadcrumbs = accessor.get(IBreadcrumbsService);
    const widget = breadcrumbs.getWidget(groups.activeGroup.id);
    if (!widget) {
      return;
    }
    widget.focusNext();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.focusPreviousWithPicker",
  weight: KeybindingWeight.WorkbenchContrib + 1,
  primary: KeyMod.CtrlCmd | KeyCode.LeftArrow,
  mac: {
    primary: KeyMod.Alt | KeyCode.LeftArrow
  },
  when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive, WorkbenchListFocusContextKey),
  handler(accessor) {
    const groups = accessor.get(IEditorGroupsService);
    const breadcrumbs = accessor.get(IBreadcrumbsService);
    const widget = breadcrumbs.getWidget(groups.activeGroup.id);
    if (!widget) {
      return;
    }
    widget.focusPrev();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.selectFocused",
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyCode.Enter,
  secondary: [KeyCode.DownArrow],
  when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
  handler(accessor) {
    const groups = accessor.get(IEditorGroupsService);
    const breadcrumbs = accessor.get(IBreadcrumbsService);
    const widget = breadcrumbs.getWidget(groups.activeGroup.id);
    if (!widget) {
      return;
    }
    widget.setSelection(widget.getFocused(), BreadcrumbsControl.Payload_Pick);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.revealFocused",
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyCode.Space,
  secondary: [KeyMod.CtrlCmd | KeyCode.Enter],
  when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
  handler(accessor) {
    const groups = accessor.get(IEditorGroupsService);
    const breadcrumbs = accessor.get(IBreadcrumbsService);
    const widget = breadcrumbs.getWidget(groups.activeGroup.id);
    if (!widget) {
      return;
    }
    widget.setSelection(widget.getFocused(), BreadcrumbsControl.Payload_Reveal);
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.selectEditor",
  weight: KeybindingWeight.WorkbenchContrib + 1,
  primary: KeyCode.Escape,
  when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive),
  handler(accessor) {
    const groups = accessor.get(IEditorGroupsService);
    const breadcrumbs = accessor.get(IBreadcrumbsService);
    const widget = breadcrumbs.getWidget(groups.activeGroup.id);
    if (!widget) {
      return;
    }
    widget.setFocused(void 0);
    widget.setSelection(void 0);
    groups.activeGroup.activeEditorPane?.focus();
  }
});
KeybindingsRegistry.registerCommandAndKeybindingRule({
  id: "breadcrumbs.revealFocusedFromTreeAside",
  weight: KeybindingWeight.WorkbenchContrib,
  primary: KeyMod.CtrlCmd | KeyCode.Enter,
  when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsActive, WorkbenchListFocusContextKey),
  handler(accessor) {
    const editors = accessor.get(IEditorService);
    const lists = accessor.get(IListService);
    const tree = lists.lastFocusedList;
    if (!(tree instanceof WorkbenchDataTree) && !(tree instanceof WorkbenchAsyncDataTree)) {
      return;
    }
    const element = tree.getFocus()[0];
    if (URI.isUri(element?.resource)) {
      return editors.openEditor({
        resource: element.resource,
        options: { pinned: true }
      }, SIDE_GROUP);
    }
    const input = tree.getInput();
    if (input && typeof input.outlineKind === "string") {
      return input.reveal(element, {
        pinned: true,
        preserveFocus: false
      }, true, false);
    }
  }
});
registerAction2(class CopyBreadcrumbPath extends Action2 {
  constructor() {
    super({
      id: "breadcrumbs.copyPath",
      title: localize2("cmd.copyPath", "Copy Breadcrumbs Path"),
      category: Categories.View,
      precondition: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsVisible, BreadcrumbsControl.CK_BreadcrumbsHasSymbols),
      f1: true,
      menu: [{
        id: MenuId.EditorTitleContext,
        group: "1_cutcopypaste",
        order: 100,
        when: ContextKeyExpr.and(BreadcrumbsControl.CK_BreadcrumbsPossible, BreadcrumbsControl.CK_BreadcrumbsHasSymbols)
      }]
    });
  }
  async run(accessor) {
    const groups = accessor.get(IEditorGroupsService);
    const clipboardService = accessor.get(IClipboardService);
    const configurationService = accessor.get(IConfigurationService);
    const outlineService = accessor.get(IOutlineService);
    if (!groups.activeGroup.activeEditorPane) {
      return;
    }
    const outline = await outlineService.createOutline(groups.activeGroup.activeEditorPane, OutlineTarget.Breadcrumbs, CancellationToken.None);
    if (!outline) {
      return;
    }
    const elements = outline.config.breadcrumbsDataSource.getBreadcrumbElements();
    const labels = elements.map((item) => item.label).filter(Boolean);
    outline.dispose();
    if (labels.length === 0) {
      return;
    }
    const resource = groups.activeGroup.activeEditorPane.input.resource;
    const config = BreadcrumbsConfig.SymbolPathSeparator.bindTo(configurationService);
    const separator = config.getValue(resource && { resource }) ?? ".";
    config.dispose();
    const path = labels.join(separator);
    await clipboardService.writeText(path);
  }
});
export {
  BreadcrumbsControl,
  BreadcrumbsControlFactory
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9icmVhZGNydW1ic0NvbnRyb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZE1vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyBQaXhlbFJhdGlvIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3BpeGVsUmF0aW8uanMnO1xuaW1wb3J0IHsgQnJlYWRjcnVtYnNJdGVtLCBCcmVhZGNydW1ic1dpZGdldCwgSUJyZWFkY3J1bWJzSXRlbUV2ZW50LCBJQnJlYWRjcnVtYnNXaWRnZXRTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnJlYWRjcnVtYnMvYnJlYWRjcnVtYnNXaWRnZXQuanMnO1xuaW1wb3J0IHsgYXBwbHlEcmFnSW1hZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvZG5kL2RuZC5qcyc7XG5pbXBvcnQgeyBJSG92ZXJEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlckRlbGVnYXRlLmpzJztcbmltcG9ydCB7IElNYW5hZ2VkSG92ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEtleUNvZGUsIEtleU1vZCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IGNvbWJpbmVkRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZXh0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBEb2N1bWVudFN5bWJvbCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IE91dGxpbmVFbGVtZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZG9jdW1lbnRTeW1ib2xzL2Jyb3dzZXIvb3V0bGluZU1vZGVsLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBBY3Rpb24yLCBNZW51SWQsIHJlZ2lzdGVyQWN0aW9uMiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UsIElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IGZpbGxJblN5bWJvbHNEcmFnRGF0YSwgTG9jYWxTZWxlY3Rpb25UcmFuc2ZlciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2RuZC9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBGaWxlS2luZCwgSUZpbGVTZXJ2aWNlLCBJRmlsZVN0YXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzUmVnaXN0cnksIEtleWJpbmRpbmdXZWlnaHQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nc1JlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUxpc3RTZXJ2aWNlLCBXb3JrYmVuY2hBc3luY0RhdGFUcmVlLCBXb3JrYmVuY2hEYXRhVHJlZSwgV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IGRlZmF1bHRCcmVhZGNydW1ic1dpZGdldFN0eWxlcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyByZWdpc3Rlckljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vaWNvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IEVkaXRvclJlc291cmNlQWNjZXNzb3IsIElFZGl0b3JQYXJ0T3B0aW9ucywgU2lkZUJ5U2lkZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFDVElWRV9HUk9VUCwgQUNUSVZFX0dST1VQX1RZUEUsIElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQLCBTSURFX0dST1VQX1RZUEUgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU91dGxpbmUsIElPdXRsaW5lU2VydmljZSwgT3V0bGluZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL291dGxpbmUvYnJvd3Nlci9vdXRsaW5lLmpzJztcbmltcG9ydCB7IERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLCBmaWxsRWRpdG9yc0RyYWdEYXRhIH0gZnJvbSAnLi4vLi4vZG5kLmpzJztcbmltcG9ydCB7IERFRkFVTFRfTEFCRUxTX0NPTlRBSU5FUiwgUmVzb3VyY2VMYWJlbHMgfSBmcm9tICcuLi8uLi9sYWJlbHMuanMnO1xuaW1wb3J0IHsgQnJlYWRjcnVtYnNDb25maWcsIElCcmVhZGNydW1ic1NlcnZpY2UgfSBmcm9tICcuL2JyZWFkY3J1bWJzLmpzJztcbmltcG9ydCB7IEJyZWFkY3J1bWJzTW9kZWwsIEZpbGVFbGVtZW50LCBPdXRsaW5lRWxlbWVudDIgfSBmcm9tICcuL2JyZWFkY3J1bWJzTW9kZWwuanMnO1xuaW1wb3J0IHsgQnJlYWRjcnVtYnNGaWxlUGlja2VyLCBCcmVhZGNydW1ic091dGxpbmVQaWNrZXIgfSBmcm9tICcuL2JyZWFkY3J1bWJzUGlja2VyLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cFZpZXcgfSBmcm9tICcuL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVFZGl0b3JUeXBlQWN0aW9ucywgZWRpdG9yVHlwZURpc3BsYXlMYWJlbCwgZ2V0QXZhaWxhYmxlRWRpdG9yVHlwZXMsIGhhc0RlZmF1bHRFZGl0b3JBc3NvY2lhdGlvbiB9IGZyb20gJy4vZWRpdG9yVHlwZVBpY2tlci5qcyc7XG5pbXBvcnQgJy4vbWVkaWEvYnJlYWRjcnVtYnNjb250cm9sLmNzcyc7XG5pbXBvcnQgeyBTY3JvbGxiYXJWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5cbmNsYXNzIE91dGxpbmVJdGVtIGV4dGVuZHMgQnJlYWRjcnVtYnNJdGVtIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBtb2RlbDogQnJlYWRjcnVtYnNNb2RlbCxcblx0XHRyZWFkb25seSBlbGVtZW50OiBPdXRsaW5lRWxlbWVudDIsXG5cdFx0cmVhZG9ubHkgb3B0aW9uczogSUJyZWFkY3J1bWJzQ29udHJvbE9wdGlvbnMsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRlcXVhbHMob3RoZXI6IEJyZWFkY3J1bWJzSXRlbSk6IGJvb2xlYW4ge1xuXHRcdGlmICghKG90aGVyIGluc3RhbmNlb2YgT3V0bGluZUl0ZW0pKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmVsZW1lbnQuZWxlbWVudCA9PT0gb3RoZXIuZWxlbWVudC5lbGVtZW50ICYmXG5cdFx0XHR0aGlzLm9wdGlvbnMuc2hvd0ZpbGVJY29ucyA9PT0gb3RoZXIub3B0aW9ucy5zaG93RmlsZUljb25zICYmXG5cdFx0XHR0aGlzLm9wdGlvbnMuc2hvd1N5bWJvbEljb25zID09PSBvdGhlci5vcHRpb25zLnNob3dTeW1ib2xJY29ucztcblx0fVxuXG5cdHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgeyBlbGVtZW50LCBvdXRsaW5lIH0gPSB0aGlzLmVsZW1lbnQ7XG5cblx0XHRpZiAoZWxlbWVudCA9PT0gb3V0bGluZSkge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGRvbS4kKCdzcGFuJywgdW5kZWZpbmVkLCAnXHUyMDI2Jyk7XG5cdFx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZWxlbWVudCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGVtcGxhdGVJZCA9IG91dGxpbmUuY29uZmlnLmRlbGVnYXRlLmdldFRlbXBsYXRlSWQoZWxlbWVudCk7XG5cdFx0Y29uc3QgcmVuZGVyZXIgPSBvdXRsaW5lLmNvbmZpZy5yZW5kZXJlcnMuZmluZChyZW5kZXJlciA9PiByZW5kZXJlci50ZW1wbGF0ZUlkID09PSB0ZW1wbGF0ZUlkKTtcblx0XHRpZiAoIXJlbmRlcmVyKSB7XG5cdFx0XHRjb250YWluZXIudGV4dENvbnRlbnQgPSAnPDxOTyBSRU5ERVJFUj4+Jztcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0ZW1wbGF0ZSA9IHJlbmRlcmVyLnJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcik7XG5cdFx0cmVuZGVyZXIucmVuZGVyRWxlbWVudCh7XG5cdFx0XHRlbGVtZW50LFxuXHRcdFx0Y2hpbGRyZW46IFtdLFxuXHRcdFx0ZGVwdGg6IDAsXG5cdFx0XHR2aXNpYmxlQ2hpbGRyZW5Db3VudDogMCxcblx0XHRcdHZpc2libGVDaGlsZEluZGV4OiAwLFxuXHRcdFx0Y29sbGFwc2libGU6IGZhbHNlLFxuXHRcdFx0Y29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdHZpc2libGU6IHRydWUsXG5cdFx0XHRmaWx0ZXJEYXRhOiB1bmRlZmluZWRcblx0XHR9LCAwLCB0ZW1wbGF0ZSwgdW5kZWZpbmVkKTtcblxuXHRcdGlmICghdGhpcy5vcHRpb25zLnNob3dTeW1ib2xJY29ucykge1xuXHRcdFx0ZG9tLmhpZGUodGVtcGxhdGUuaWNvbkNsYXNzKTtcblx0XHR9XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHsgcmVuZGVyZXIuZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlKTsgfSkpO1xuXG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBPdXRsaW5lRWxlbWVudCAmJiBvdXRsaW5lLnVyaSkge1xuXHRcdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IGNyZWF0ZUJyZWFkY3J1bWJEbmRPYnNlcnZlcihhY2Nlc3NvciwgY29udGFpbmVyLCBlbGVtZW50LnN5bWJvbC5uYW1lLCB7IHN5bWJvbDogZWxlbWVudC5zeW1ib2wsIHVyaTogb3V0bGluZS51cmkhIH0sIHRoaXMubW9kZWwsIHRoaXMub3B0aW9ucy5kcmFnRWRpdG9yKSkpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBGaWxlSXRlbSBleHRlbmRzIEJyZWFkY3J1bWJzSXRlbSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgbW9kZWw6IEJyZWFkY3J1bWJzTW9kZWwsXG5cdFx0cmVhZG9ubHkgZWxlbWVudDogRmlsZUVsZW1lbnQsXG5cdFx0cmVhZG9ubHkgb3B0aW9uczogSUJyZWFkY3J1bWJzQ29udHJvbE9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbGFiZWxzOiBSZXNvdXJjZUxhYmVscyxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ob3ZlckRlbGVnYXRlOiBJSG92ZXJEZWxlZ2F0ZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0ZXF1YWxzKG90aGVyOiBCcmVhZGNydW1ic0l0ZW0pOiBib29sZWFuIHtcblx0XHRpZiAoIShvdGhlciBpbnN0YW5jZW9mIEZpbGVJdGVtKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gKGV4dFVyaS5pc0VxdWFsKHRoaXMuZWxlbWVudC51cmksIG90aGVyLmVsZW1lbnQudXJpKSAmJlxuXHRcdFx0dGhpcy5vcHRpb25zLnNob3dGaWxlSWNvbnMgPT09IG90aGVyLm9wdGlvbnMuc2hvd0ZpbGVJY29ucyAmJlxuXHRcdFx0dGhpcy5vcHRpb25zLnNob3dTeW1ib2xJY29ucyA9PT0gb3RoZXIub3B0aW9ucy5zaG93U3ltYm9sSWNvbnMpO1xuXG5cdH1cblxuXHRyZW5kZXIoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdC8vIGZpbGUvZm9sZGVyXG5cdFx0Y29uc3QgbGFiZWwgPSB0aGlzLl9sYWJlbHMuY3JlYXRlKGNvbnRhaW5lciwgeyBob3ZlckRlbGVnYXRlOiB0aGlzLl9ob3ZlckRlbGVnYXRlIH0pO1xuXHRcdGxhYmVsLnNldEZpbGUodGhpcy5lbGVtZW50LnVyaSwge1xuXHRcdFx0aGlkZVBhdGg6IHRydWUsXG5cdFx0XHRoaWRlSWNvbjogdGhpcy5lbGVtZW50LmtpbmQgPT09IEZpbGVLaW5kLkZPTERFUiB8fCAhdGhpcy5vcHRpb25zLnNob3dGaWxlSWNvbnMsXG5cdFx0XHRmaWxlS2luZDogdGhpcy5lbGVtZW50LmtpbmQsXG5cdFx0XHRmaWxlRGVjb3JhdGlvbnM6IHsgY29sb3JzOiB0aGlzLm9wdGlvbnMuc2hvd0RlY29yYXRpb25Db2xvcnMsIGJhZGdlczogZmFsc2UgfSxcblx0XHR9KTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZChGaWxlS2luZFt0aGlzLmVsZW1lbnQua2luZF0udG9Mb3dlckNhc2UoKSk7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKGxhYmVsKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihhY2Nlc3NvciA9PiBjcmVhdGVCcmVhZGNydW1iRG5kT2JzZXJ2ZXIoYWNjZXNzb3IsIGNvbnRhaW5lciwgYmFzZW5hbWUodGhpcy5lbGVtZW50LnVyaSksIHRoaXMuZWxlbWVudC51cmksIHRoaXMubW9kZWwsIHRoaXMub3B0aW9ucy5kcmFnRWRpdG9yKSkpO1xuXHR9XG59XG5cblxuZnVuY3Rpb24gY3JlYXRlQnJlYWRjcnVtYkRuZE9ic2VydmVyKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCBjb250YWluZXI6IEhUTUxFbGVtZW50LCBsYWJlbDogc3RyaW5nLCBpdGVtOiBVUkkgfCB7IHN5bWJvbDogRG9jdW1lbnRTeW1ib2w7IHVyaTogVVJJIH0sIG1vZGVsOiBCcmVhZGNydW1ic01vZGVsLCBkcmFnRWRpdG9yOiBib29sZWFuKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdGNvbnRhaW5lci5kcmFnZ2FibGUgPSB0cnVlO1xuXG5cdHJldHVybiBuZXcgZG9tLkRyYWdBbmREcm9wT2JzZXJ2ZXIoY29udGFpbmVyLCB7XG5cdFx0b25EcmFnU3RhcnQ6IGV2ZW50ID0+IHtcblx0XHRcdGlmICghZXZlbnQuZGF0YVRyYW5zZmVyKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2V0IGRhdGEgdHJhbnNmZXJcblx0XHRcdGV2ZW50LmRhdGFUcmFuc2Zlci5lZmZlY3RBbGxvd2VkID0gJ2NvcHlNb3ZlJztcblxuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oYWNjZXNzb3IgPT4ge1xuXHRcdFx0XHRpZiAoVVJJLmlzVXJpKGl0ZW0pKSB7XG5cdFx0XHRcdFx0ZmlsbEVkaXRvcnNEcmFnRGF0YShhY2Nlc3NvciwgW2l0ZW1dLCBldmVudCk7XG5cdFx0XHRcdH0gZWxzZSB7IC8vIFN5bWJvbFxuXHRcdFx0XHRcdGZpbGxFZGl0b3JzRHJhZ0RhdGEoYWNjZXNzb3IsIFt7IHJlc291cmNlOiBpdGVtLnVyaSwgc2VsZWN0aW9uOiBpdGVtLnN5bWJvbC5yYW5nZSB9XSwgZXZlbnQpO1xuXG5cdFx0XHRcdFx0ZmlsbEluU3ltYm9sc0RyYWdEYXRhKFt7XG5cdFx0XHRcdFx0XHRuYW1lOiBpdGVtLnN5bWJvbC5uYW1lLFxuXHRcdFx0XHRcdFx0ZnNQYXRoOiBpdGVtLnVyaS5mc1BhdGgsXG5cdFx0XHRcdFx0XHRyYW5nZTogaXRlbS5zeW1ib2wucmFuZ2UsXG5cdFx0XHRcdFx0XHRraW5kOiBpdGVtLnN5bWJvbC5raW5kXG5cdFx0XHRcdFx0fV0sIGV2ZW50KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChkcmFnRWRpdG9yICYmIG1vZGVsLmVkaXRvcj8uaW5wdXQpIHtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JUcmFuc2ZlciA9IExvY2FsU2VsZWN0aW9uVHJhbnNmZXIuZ2V0SW5zdGFuY2U8RHJhZ2dlZEVkaXRvcklkZW50aWZpZXI+KCk7XG5cdFx0XHRcdFx0ZWRpdG9yVHJhbnNmZXIuc2V0RGF0YShbbmV3IERyYWdnZWRFZGl0b3JJZGVudGlmaWVyKHsgZWRpdG9yOiBtb2RlbC5lZGl0b3IuaW5wdXQsIGdyb3VwSWQ6IG1vZGVsLmVkaXRvci5ncm91cC5pZCB9KV0sIERyYWdnZWRFZGl0b3JJZGVudGlmaWVyLnByb3RvdHlwZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRhcHBseURyYWdJbWFnZShldmVudCwgY29udGFpbmVyLCBsYWJlbCk7XG5cdFx0fVxuXHR9KTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQnJlYWRjcnVtYnNDb250cm9sT3B0aW9ucyB7XG5cdHJlYWRvbmx5IHNob3dGaWxlSWNvbnM6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNob3dTeW1ib2xJY29uczogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2hvd0RlY29yYXRpb25Db2xvcnM6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNob3dQbGFjZWhvbGRlcjogYm9vbGVhbjtcblx0cmVhZG9ubHkgZHJhZ0VkaXRvcjogYm9vbGVhbjtcblx0cmVhZG9ubHkgd2lkZ2V0U3R5bGVzPzogSUJyZWFkY3J1bWJzV2lkZ2V0U3R5bGVzO1xuXHQvKipcblx0ICogV2hldGhlciB0byBzaG93IGEgZHJvcGRvd24gb24gdGhlIHJpZ2h0LWhhbmQgc2lkZSB0aGF0IGxldHMgdGhlIHVzZXIgc3dpdGNoIGJldHdlZW4gdGhlIGVkaXRvcnNcblx0ICogdGhhdCBjYW4gb3BlbiB0aGUgYWN0aXZlIHJlc291cmNlIChlLmcuIFRleHQgRWRpdG9yIHZzLiBNYXJrZG93biBQcmV2aWV3KS4gT25seSBtYWtlcyBzZW5zZSBmb3Jcblx0ICogdGhlIGRlZGljYXRlZCBicmVhZGNydW1icyBiYXIgYmVsb3cgdGFicywgbm90IHRoZSBpbmxpbmUgc2luZ2xlLXRhYiBicmVhZGNydW1icy5cblx0ICovXG5cdHJlYWRvbmx5IHNob3dFZGl0b3JUeXBlUGlja2VyPzogYm9vbGVhbjtcbn1cblxuY29uc3Qgc2VwYXJhdG9ySWNvbiA9IHJlZ2lzdGVySWNvbignYnJlYWRjcnVtYi1zZXBhcmF0b3InLCBDb2RpY29uLmNoZXZyb25SaWdodCwgbG9jYWxpemUoJ3NlcGFyYXRvckljb24nLCAnSWNvbiBmb3IgdGhlIHNlcGFyYXRvciBpbiB0aGUgYnJlYWRjcnVtYnMuJykpO1xuXG5leHBvcnQgY2xhc3MgQnJlYWRjcnVtYnNDb250cm9sIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSEVJR0hUID0gMjI7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgU0NST0xMQkFSX1NJWkVTID0ge1xuXHRcdGRlZmF1bHQ6IDMsXG5cdFx0bGFyZ2U6IDhcblx0fTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBTQ1JPTExCQVJfVklTSUJJTElUWSA9IHtcblx0XHRhdXRvOiBTY3JvbGxiYXJWaXNpYmlsaXR5LkF1dG8sXG5cdFx0dmlzaWJsZTogU2Nyb2xsYmFyVmlzaWJpbGl0eS5WaXNpYmxlLFxuXHRcdGhpZGRlbjogU2Nyb2xsYmFyVmlzaWJpbGl0eS5IaWRkZW5cblx0fTtcblxuXHRzdGF0aWMgcmVhZG9ubHkgUGF5bG9hZF9SZXZlYWwgPSB7fTtcblx0c3RhdGljIHJlYWRvbmx5IFBheWxvYWRfUmV2ZWFsQXNpZGUgPSB7fTtcblx0c3RhdGljIHJlYWRvbmx5IFBheWxvYWRfUGljayA9IHt9O1xuXG5cdHN0YXRpYyByZWFkb25seSBDS19CcmVhZGNydW1ic1Bvc3NpYmxlID0gbmV3IFJhd0NvbnRleHRLZXkoJ2JyZWFkY3J1bWJzUG9zc2libGUnLCBmYWxzZSwgbG9jYWxpemUoJ2JyZWFkY3J1bWJzUG9zc2libGUnLCBcIldoZXRoZXIgdGhlIGVkaXRvciBjYW4gc2hvdyBicmVhZGNydW1ic1wiKSk7XG5cdHN0YXRpYyByZWFkb25seSBDS19CcmVhZGNydW1ic1Zpc2libGUgPSBuZXcgUmF3Q29udGV4dEtleSgnYnJlYWRjcnVtYnNWaXNpYmxlJywgZmFsc2UsIGxvY2FsaXplKCdicmVhZGNydW1ic1Zpc2libGUnLCBcIldoZXRoZXIgYnJlYWRjcnVtYnMgYXJlIGN1cnJlbnRseSB2aXNpYmxlXCIpKTtcblx0c3RhdGljIHJlYWRvbmx5IENLX0JyZWFkY3J1bWJzQWN0aXZlID0gbmV3IFJhd0NvbnRleHRLZXkoJ2JyZWFkY3J1bWJzQWN0aXZlJywgZmFsc2UsIGxvY2FsaXplKCdicmVhZGNydW1ic0FjdGl2ZScsIFwiV2hldGhlciBicmVhZGNydW1icyBoYXZlIGZvY3VzXCIpKTtcblx0c3RhdGljIHJlYWRvbmx5IENLX0JyZWFkY3J1bWJzSGFzU3ltYm9scyA9IG5ldyBSYXdDb250ZXh0S2V5KCdicmVhZGNydW1ic0hhc1N5bWJvbHMnLCBmYWxzZSwgbG9jYWxpemUoJ2JyZWFkY3J1bWJzSGFzU3ltYm9scycsIFwiV2hldGhlciBicmVhZGNydW1icyBjb250YWluIHN5bWJvbCBpdGVtc1wiKSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2tCcmVhZGNydW1ic1Bvc3NpYmxlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2tCcmVhZGNydW1ic1Zpc2libGU6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9ja0JyZWFkY3J1bWJzQWN0aXZlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2tCcmVhZGNydW1ic0hhc1N5bWJvbHM6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NmVXNlUXVpY2tQaWNrOiBCcmVhZGNydW1ic0NvbmZpZzxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2ZTaG93SWNvbnM6IEJyZWFkY3J1bWJzQ29uZmlnPGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jZlNob3dFZGl0b3JUeXBlOiBCcmVhZGNydW1ic0NvbmZpZzxib29sZWFuPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2ZUaXRsZVNjcm9sbGJhclNpemluZzogQnJlYWRjcnVtYnNDb25maWc8SUVkaXRvclBhcnRPcHRpb25zWyd0aXRsZVNjcm9sbGJhclNpemluZyddPjtcblx0cHJpdmF0ZSByZWFkb25seSBfY2ZUaXRsZVNjcm9sbGJhclZpc2liaWxpdHk6IEJyZWFkY3J1bWJzQ29uZmlnPElFZGl0b3JQYXJ0T3B0aW9uc1sndGl0bGVTY3JvbGxiYXJWaXNpYmlsaXR5J10+O1xuXG5cdHJlYWRvbmx5IGRvbU5vZGU6IEhUTUxEaXZFbGVtZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF93aWRnZXQ6IEJyZWFkY3J1bWJzV2lkZ2V0O1xuXHRwcml2YXRlIF9lZGl0b3JUeXBlTm9kZTogSFRNTERpdkVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2VkaXRvclR5cGVMYWJlbDogSFRNTFNwYW5FbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9lZGl0b3JUeXBlSG92ZXI6IElNYW5hZ2VkSG92ZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2xhc3RMYXlvdXREaW1lbnNpb246IGRvbS5EaW1lbnNpb24gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclR5cGVEaXNwb3NhYmxlcyA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXcgRGlzcG9zYWJsZVN0b3JlKCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9icmVhZGNydW1ic0Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sYWJlbHM6IFJlc291cmNlTGFiZWxzO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbCA9IG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxCcmVhZGNydW1ic01vZGVsPigpO1xuXHRwcml2YXRlIF9icmVhZGNydW1ic1BpY2tlclNob3dpbmcgPSBmYWxzZTtcblx0cHJpdmF0ZSBfYnJlYWRjcnVtYnNQaWNrZXJJZ25vcmVPbmNlSXRlbTogQnJlYWRjcnVtYnNJdGVtIHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2hvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVmlzaWJpbGl0eUNoYW5nZSA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkVmlzaWJpbGl0eUNoYW5nZSgpIHsgcmV0dXJuIHRoaXMuX29uRGlkVmlzaWJpbGl0eUNoYW5nZS5ldmVudDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSUJyZWFkY3J1bWJzQ29udHJvbE9wdGlvbnMsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yR3JvdXA6IElFZGl0b3JHcm91cFZpZXcsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJUXVpY2tJbnB1dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcXVpY2tJbnB1dFNlcnZpY2U6IElRdWlja0lucHV0U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclJlc29sdmVyU2VydmljZTogSUVkaXRvclJlc29sdmVyU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFiZWxTZXJ2aWNlOiBJTGFiZWxTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ob3ZlclNlcnZpY2U6IElIb3ZlclNlcnZpY2UsXG5cdFx0QElCcmVhZGNydW1ic1NlcnZpY2UgYnJlYWRjcnVtYnNTZXJ2aWNlOiBJQnJlYWRjcnVtYnNTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuZG9tTm9kZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdicmVhZGNydW1icy1jb250cm9sJyk7XG5cdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ3dpdGgtZWRpdG9yLXR5cGUnLCAhIV9vcHRpb25zLnNob3dFZGl0b3JUeXBlUGlja2VyKTtcblx0XHRkb20uYXBwZW5kKGNvbnRhaW5lciwgdGhpcy5kb21Ob2RlKTtcblxuXHRcdHRoaXMuX2NmVXNlUXVpY2tQaWNrID0gQnJlYWRjcnVtYnNDb25maWcuVXNlUXVpY2tQaWNrLmJpbmRUbyhjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5fY2ZTaG93SWNvbnMgPSBCcmVhZGNydW1ic0NvbmZpZy5JY29ucy5iaW5kVG8oY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuX2NmU2hvd0VkaXRvclR5cGUgPSBCcmVhZGNydW1ic0NvbmZpZy5TaG93RWRpdG9yVHlwZS5iaW5kVG8oY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuX2NmVGl0bGVTY3JvbGxiYXJTaXppbmcgPSBCcmVhZGNydW1ic0NvbmZpZy5UaXRsZVNjcm9sbGJhclNpemluZy5iaW5kVG8oY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuX2NmVGl0bGVTY3JvbGxiYXJWaXNpYmlsaXR5ID0gQnJlYWRjcnVtYnNDb25maWcuVGl0bGVTY3JvbGxiYXJWaXNpYmlsaXR5LmJpbmRUbyhjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHR0aGlzLl9sYWJlbHMgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZXNvdXJjZUxhYmVscywgREVGQVVMVF9MQUJFTFNfQ09OVEFJTkVSKTtcblxuXHRcdGNvbnN0IHNpemluZyA9IHRoaXMuX2NmVGl0bGVTY3JvbGxiYXJTaXppbmcuZ2V0VmFsdWUoKSA/PyAnZGVmYXVsdCc7XG5cdFx0Y29uc3Qgc3R5bGVzID0gX29wdGlvbnMud2lkZ2V0U3R5bGVzID8/IGRlZmF1bHRCcmVhZGNydW1ic1dpZGdldFN0eWxlcztcblx0XHRjb25zdCB2aXNpYmlsaXR5ID0gdGhpcy5fY2ZUaXRsZVNjcm9sbGJhclZpc2liaWxpdHk/LmdldFZhbHVlKCkgPz8gJ2F1dG8nO1xuXG5cdFx0dGhpcy5fd2lkZ2V0ID0gbmV3IEJyZWFkY3J1bWJzV2lkZ2V0KFxuXHRcdFx0dGhpcy5kb21Ob2RlLFxuXHRcdFx0QnJlYWRjcnVtYnNDb250cm9sLlNDUk9MTEJBUl9TSVpFU1tzaXppbmddLFxuXHRcdFx0QnJlYWRjcnVtYnNDb250cm9sLlNDUk9MTEJBUl9WSVNJQklMSVRZW3Zpc2liaWxpdHldLFxuXHRcdFx0c2VwYXJhdG9ySWNvbixcblx0XHRcdHN0eWxlc1xuXHRcdCk7XG5cdFx0dGhpcy5fd2lkZ2V0Lm9uRGlkU2VsZWN0SXRlbSh0aGlzLl9vblNlbGVjdEV2ZW50LCB0aGlzLCB0aGlzLl9kaXNwb3NhYmxlcyk7XG5cdFx0dGhpcy5fd2lkZ2V0Lm9uRGlkRm9jdXNJdGVtKHRoaXMuX29uRm9jdXNFdmVudCwgdGhpcywgdGhpcy5fZGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMuX3dpZGdldC5vbkRpZENoYW5nZUZvY3VzKHRoaXMuX3VwZGF0ZUNrQnJlYWRjcnVtYnNBY3RpdmUsIHRoaXMsIHRoaXMuX2Rpc3Bvc2FibGVzKTtcblxuXHRcdGlmICh0aGlzLl9vcHRpb25zLnNob3dFZGl0b3JUeXBlUGlja2VyKSB7XG5cdFx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fY2ZTaG93RWRpdG9yVHlwZS5vbkRpZENoYW5nZSgoKSA9PiB0aGlzLl91cGRhdGVFZGl0b3JUeXBlQ29udHJvbCgpKSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fY2tCcmVhZGNydW1ic1Bvc3NpYmxlID0gQnJlYWRjcnVtYnNDb250cm9sLkNLX0JyZWFkY3J1bWJzUG9zc2libGUuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9ja0JyZWFkY3J1bWJzVmlzaWJsZSA9IEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic1Zpc2libGUuYmluZFRvKHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9ja0JyZWFkY3J1bWJzQWN0aXZlID0gQnJlYWRjcnVtYnNDb250cm9sLkNLX0JyZWFkY3J1bWJzQWN0aXZlLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5fY2tCcmVhZGNydW1ic0hhc1N5bWJvbHMgPSBCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNIYXNTeW1ib2xzLmJpbmRUbyh0aGlzLl9jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl9ob3ZlckRlbGVnYXRlID0gZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoYnJlYWRjcnVtYnNTZXJ2aWNlLnJlZ2lzdGVyKHRoaXMuX2VkaXRvckdyb3VwLmlkLCB0aGlzLl93aWRnZXQpKTtcblx0XHR0aGlzLmhpZGUoKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2JyZWFkY3J1bWJzRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX21vZGVsLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9ja0JyZWFkY3J1bWJzUG9zc2libGUucmVzZXQoKTtcblx0XHR0aGlzLl9ja0JyZWFkY3J1bWJzVmlzaWJsZS5yZXNldCgpO1xuXHRcdHRoaXMuX2NrQnJlYWRjcnVtYnNBY3RpdmUucmVzZXQoKTtcblx0XHR0aGlzLl9ja0JyZWFkY3J1bWJzSGFzU3ltYm9scy5yZXNldCgpO1xuXHRcdHRoaXMuX2NmVXNlUXVpY2tQaWNrLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9jZlNob3dJY29ucy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY2ZTaG93RWRpdG9yVHlwZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY2ZUaXRsZVNjcm9sbGJhclNpemluZy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY2ZUaXRsZVNjcm9sbGJhclZpc2liaWxpdHkuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3dpZGdldC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fbGFiZWxzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmRvbU5vZGUucmVtb3ZlKCk7XG5cdH1cblxuXHRnZXQgbW9kZWwoKTogQnJlYWRjcnVtYnNNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsLnZhbHVlO1xuXHR9XG5cblx0bGF5b3V0KGRpbTogZG9tLkRpbWVuc2lvbiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmIChkaW0pIHtcblx0XHRcdHRoaXMuX2xhc3RMYXlvdXREaW1lbnNpb24gPSBkaW07XG5cdFx0fVxuXHRcdC8vIFdoZW4gdGhlIGVkaXRvciB0eXBlIGRyb3Bkb3duIGlzIHZpc2libGUgaXQgb2NjdXBpZXMgc3BhY2Ugb24gdGhlIHJpZ2h0LCBzbyBzaHJpbmsgdGhlXG5cdFx0Ly8gYnJlYWRjcnVtYnMgd2lkZ2V0IGFjY29yZGluZ2x5IHRvIGF2b2lkIGl0IHJlbmRlcmluZyBiZWhpbmQgdGhlIGRyb3Bkb3duLlxuXHRcdGlmIChkaW0gJiYgdGhpcy5fZWRpdG9yVHlwZU5vZGUpIHtcblx0XHRcdGNvbnN0IGVkaXRvclR5cGVXaWR0aCA9IHRoaXMuX2VkaXRvclR5cGVOb2RlLm9mZnNldFdpZHRoO1xuXHRcdFx0ZGltID0gbmV3IGRvbS5EaW1lbnNpb24oTWF0aC5tYXgoMCwgZGltLndpZHRoIC0gZWRpdG9yVHlwZVdpZHRoKSwgZGltLmhlaWdodCk7XG5cdFx0fVxuXHRcdHRoaXMuX3dpZGdldC5sYXlvdXQoZGltKTtcblx0fVxuXG5cdGlzSGlkZGVuKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdoaWRkZW4nKTtcblx0fVxuXG5cdGhpZGUoKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2FzSGlkZGVuID0gdGhpcy5pc0hpZGRlbigpO1xuXG5cdFx0dGhpcy5fYnJlYWRjcnVtYnNEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuX2NrQnJlYWRjcnVtYnNWaXNpYmxlLnNldChmYWxzZSk7XG5cdFx0dGhpcy5fY2tCcmVhZGNydW1ic0hhc1N5bWJvbHMuc2V0KGZhbHNlKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnaGlkZGVuJywgdHJ1ZSk7XG5cdFx0dGhpcy5faGlkZUVkaXRvclR5cGVDb250cm9sKCk7XG5cblx0XHRpZiAoIXdhc0hpZGRlbikge1xuXHRcdFx0dGhpcy5fb25EaWRWaXNpYmlsaXR5Q2hhbmdlLmZpcmUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3coKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2FzSGlkZGVuID0gdGhpcy5pc0hpZGRlbigpO1xuXG5cdFx0dGhpcy5fY2tCcmVhZGNydW1ic1Zpc2libGUuc2V0KHRydWUpO1xuXHRcdHRoaXMuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCBmYWxzZSk7XG5cblx0XHRpZiAod2FzSGlkZGVuKSB7XG5cdFx0XHR0aGlzLl9vbkRpZFZpc2liaWxpdHlDaGFuZ2UuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHJldmVhbExhc3QoKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0LnJldmVhbExhc3QoKTtcblx0fVxuXG5cdHVwZGF0ZSgpOiBib29sZWFuIHtcblx0XHR0aGlzLl9icmVhZGNydW1ic0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHQvLyBob25vciBkaWZmIGVkaXRvcnMgYW5kIHN1Y2hcblx0XHRjb25zdCB1cmkgPSBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLmdldENhbm9uaWNhbFVyaSh0aGlzLl9lZGl0b3JHcm91cC5hY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblx0XHRjb25zdCB3YXNIaWRkZW4gPSB0aGlzLmlzSGlkZGVuKCk7XG5cblx0XHRpZiAoIXVyaSB8fCAhdGhpcy5fZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIodXJpKSkge1xuXHRcdFx0Ly8gY2xlYW51cCBhbmQgcmV0dXJuIHdoZW4gdGhlcmUgaXMgbm8gaW5wdXQgb3Igd2hlblxuXHRcdFx0Ly8gd2UgY2Fubm90IGhhbmRsZSB0aGlzIGlucHV0XG5cdFx0XHR0aGlzLl9ja0JyZWFkY3J1bWJzUG9zc2libGUuc2V0KGZhbHNlKTtcblx0XHRcdHRoaXMuX2NrQnJlYWRjcnVtYnNIYXNTeW1ib2xzLnNldChmYWxzZSk7XG5cdFx0XHRpZiAoIXdhc0hpZGRlbikge1xuXHRcdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gZGlzcGxheSB1cmkgd2hpY2ggY2FuIGJlIGRlcml2ZWQgZnJvbSBjZXJ0YWluIGlucHV0c1xuXHRcdGNvbnN0IGZpbGVJbmZvVXJpID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaSh0aGlzLl9lZGl0b3JHcm91cC5hY3RpdmVFZGl0b3IsIHsgc3VwcG9ydFNpZGVCeVNpZGU6IFNpZGVCeVNpZGVFZGl0b3IuUFJJTUFSWSB9KTtcblxuXHRcdHRoaXMuc2hvdygpO1xuXHRcdHRoaXMuX2NrQnJlYWRjcnVtYnNQb3NzaWJsZS5zZXQodHJ1ZSk7XG5cdFx0dGhpcy5fdXBkYXRlRWRpdG9yVHlwZUNvbnRyb2woKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQnJlYWRjcnVtYnNNb2RlbCxcblx0XHRcdGZpbGVJbmZvVXJpID8/IHVyaSxcblx0XHRcdHRoaXMuX2VkaXRvckdyb3VwLmFjdGl2ZUVkaXRvclBhbmVcblx0XHQpO1xuXHRcdHRoaXMuX21vZGVsLnZhbHVlID0gbW9kZWw7XG5cblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnYmFja3NsYXNoLXBhdGgnLCB0aGlzLl9sYWJlbFNlcnZpY2UuZ2V0U2VwYXJhdG9yKHVyaS5zY2hlbWUsIHVyaS5hdXRob3JpdHkpID09PSAnXFxcXCcpO1xuXG5cdFx0Y29uc3QgdXBkYXRlQnJlYWRjcnVtYnMgPSAoKSA9PiB7XG5cdFx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgncmVsYXRpdmUtcGF0aCcsIG1vZGVsLmlzUmVsYXRpdmUoKSk7XG5cdFx0XHRjb25zdCBzaG93SWNvbnMgPSB0aGlzLl9jZlNob3dJY29ucy5nZXRWYWx1ZSgpO1xuXHRcdFx0Y29uc3Qgb3B0aW9uczogSUJyZWFkY3J1bWJzQ29udHJvbE9wdGlvbnMgPSB7XG5cdFx0XHRcdC4uLnRoaXMuX29wdGlvbnMsXG5cdFx0XHRcdHNob3dGaWxlSWNvbnM6IHRoaXMuX29wdGlvbnMuc2hvd0ZpbGVJY29ucyAmJiBzaG93SWNvbnMsXG5cdFx0XHRcdHNob3dTeW1ib2xJY29uczogdGhpcy5fb3B0aW9ucy5zaG93U3ltYm9sSWNvbnMgJiYgc2hvd0ljb25zXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZWxlbWVudHMgPSBtb2RlbC5nZXRFbGVtZW50cygpO1xuXHRcdFx0dGhpcy5fY2tCcmVhZGNydW1ic0hhc1N5bWJvbHMuc2V0KGVsZW1lbnRzLnNvbWUoZWxlbWVudCA9PiAhKGVsZW1lbnQgaW5zdGFuY2VvZiBGaWxlRWxlbWVudCkpKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gZWxlbWVudHMubWFwKGVsZW1lbnQgPT4gZWxlbWVudCBpbnN0YW5jZW9mIEZpbGVFbGVtZW50XG5cdFx0XHRcdD8gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRmlsZUl0ZW0sIG1vZGVsLCBlbGVtZW50LCBvcHRpb25zLCB0aGlzLl9sYWJlbHMsIHRoaXMuX2hvdmVyRGVsZWdhdGUpXG5cdFx0XHRcdDogdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoT3V0bGluZUl0ZW0sIG1vZGVsLCBlbGVtZW50LCBvcHRpb25zKSk7XG5cdFx0XHRpZiAoaXRlbXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX3dpZGdldC5zZXRFbmFibGVkKGZhbHNlKTtcblx0XHRcdFx0dGhpcy5fd2lkZ2V0LnNldEl0ZW1zKFtuZXcgY2xhc3MgZXh0ZW5kcyBCcmVhZGNydW1ic0l0ZW0ge1xuXHRcdFx0XHRcdHJlbmRlcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0XHRcdFx0XHRjb250YWluZXIudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgnZW1wdHknLCBcIm5vIGVsZW1lbnRzXCIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlcXVhbHMob3RoZXI6IEJyZWFkY3J1bWJzSXRlbSk6IGJvb2xlYW4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIG90aGVyID09PSB0aGlzO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRkaXNwb3NlKCk6IHZvaWQge1xuXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl93aWRnZXQuc2V0RW5hYmxlZCh0cnVlKTtcblx0XHRcdFx0dGhpcy5fd2lkZ2V0LnNldEl0ZW1zKGl0ZW1zKTtcblx0XHRcdFx0dGhpcy5fd2lkZ2V0LnJldmVhbChpdGVtc1tpdGVtcy5sZW5ndGggLSAxXSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCBsaXN0ZW5lciA9IG1vZGVsLm9uRGlkVXBkYXRlKHVwZGF0ZUJyZWFkY3J1bWJzKTtcblx0XHRjb25zdCBjb25maWdMaXN0ZW5lciA9IHRoaXMuX2NmU2hvd0ljb25zLm9uRGlkQ2hhbmdlKHVwZGF0ZUJyZWFkY3J1bWJzKTtcblx0XHR1cGRhdGVCcmVhZGNydW1icygpO1xuXHRcdHRoaXMuX2JyZWFkY3J1bWJzRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9icmVhZGNydW1ic0Rpc3Bvc2FibGVzLmFkZChsaXN0ZW5lcik7XG5cdFx0dGhpcy5fYnJlYWRjcnVtYnNEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX21vZGVsLmNsZWFyKCkpKTtcblx0XHR0aGlzLl9icmVhZGNydW1ic0Rpc3Bvc2FibGVzLmFkZChjb25maWdMaXN0ZW5lcik7XG5cdFx0dGhpcy5fYnJlYWRjcnVtYnNEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3dpZGdldC5zZXRJdGVtcyhbXSkpKTtcblxuXHRcdGNvbnN0IHVwZGF0ZVNjcm9sbGJhclNpemluZyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IHNpemluZyA9IHRoaXMuX2NmVGl0bGVTY3JvbGxiYXJTaXppbmcuZ2V0VmFsdWUoKSA/PyAnZGVmYXVsdCc7XG5cdFx0XHRjb25zdCB2aXNpYmlsaXR5ID0gdGhpcy5fY2ZUaXRsZVNjcm9sbGJhclZpc2liaWxpdHk/LmdldFZhbHVlKCkgPz8gJ2F1dG8nO1xuXG5cdFx0XHR0aGlzLl93aWRnZXQuc2V0SG9yaXpvbnRhbFNjcm9sbGJhclNpemUoQnJlYWRjcnVtYnNDb250cm9sLlNDUk9MTEJBUl9TSVpFU1tzaXppbmddKTtcblx0XHRcdHRoaXMuX3dpZGdldC5zZXRIb3Jpem9udGFsU2Nyb2xsYmFyVmlzaWJpbGl0eShCcmVhZGNydW1ic0NvbnRyb2wuU0NST0xMQkFSX1ZJU0lCSUxJVFlbdmlzaWJpbGl0eV0pO1xuXHRcdH07XG5cdFx0dXBkYXRlU2Nyb2xsYmFyU2l6aW5nKCk7XG5cdFx0Y29uc3QgdXBkYXRlU2Nyb2xsYmFyU2l6ZUxpc3RlbmVyID0gdGhpcy5fY2ZUaXRsZVNjcm9sbGJhclNpemluZy5vbkRpZENoYW5nZSh1cGRhdGVTY3JvbGxiYXJTaXppbmcpO1xuXHRcdGNvbnN0IHVwZGF0ZVNjcm9sbGJhclZpc2liaWxpdHlMaXN0ZW5lciA9IHRoaXMuX2NmVGl0bGVTY3JvbGxiYXJWaXNpYmlsaXR5Lm9uRGlkQ2hhbmdlKHVwZGF0ZVNjcm9sbGJhclNpemluZyk7XG5cdFx0dGhpcy5fYnJlYWRjcnVtYnNEaXNwb3NhYmxlcy5hZGQodXBkYXRlU2Nyb2xsYmFyU2l6ZUxpc3RlbmVyKTtcblx0XHR0aGlzLl9icmVhZGNydW1ic0Rpc3Bvc2FibGVzLmFkZCh1cGRhdGVTY3JvbGxiYXJWaXNpYmlsaXR5TGlzdGVuZXIpO1xuXG5cdFx0Ly8gY2xvc2UgcGlja2VyIG9uIGhpZGUvdXBkYXRlXG5cdFx0dGhpcy5fYnJlYWRjcnVtYnNEaXNwb3NhYmxlcy5hZGQoe1xuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fYnJlYWRjcnVtYnNQaWNrZXJTaG93aW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29udGV4dFZpZXdTZXJ2aWNlLmhpZGVDb250ZXh0Vmlldyh7IHNvdXJjZTogdGhpcyB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHdhc0hpZGRlbiAhPT0gdGhpcy5pc0hpZGRlbigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRWRpdG9yVHlwZUNvbnRyb2woKTogdm9pZCB7XG5cdFx0Y29uc3QgcHJldmlvdXNXaWR0aCA9IHRoaXMuX2VkaXRvclR5cGVOb2RlPy5vZmZzZXRXaWR0aCA/PyAwO1xuXG5cdFx0Y29uc3QgYXZhaWxhYmxlID0gKHRoaXMuX29wdGlvbnMuc2hvd0VkaXRvclR5cGVQaWNrZXIgJiYgdGhpcy5fY2ZTaG93RWRpdG9yVHlwZS5nZXRWYWx1ZSgpKSA/IGdldEF2YWlsYWJsZUVkaXRvclR5cGVzKHRoaXMuX2VkaXRvckdyb3VwLmFjdGl2ZUVkaXRvciwgdGhpcy5fZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb25maWd1cmVkRGVmYXVsdEVkaXRvciA9IGF2YWlsYWJsZSA/IHRoaXMuX2VkaXRvclJlc29sdmVyU2VydmljZS5nZXRDb25maWd1cmVkRGVmYXVsdEVkaXRvcihhdmFpbGFibGUucmVzb3VyY2UsIGF2YWlsYWJsZS5pc0RpZmZFZGl0b3IpIDogdW5kZWZpbmVkO1xuXHRcdGlmICghYXZhaWxhYmxlIHx8ICFoYXNEZWZhdWx0RWRpdG9yQXNzb2NpYXRpb24oYXZhaWxhYmxlLCBjb25maWd1cmVkRGVmYXVsdEVkaXRvcikpIHtcblx0XHRcdHRoaXMuX2hpZGVFZGl0b3JUeXBlQ29udHJvbCgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB7IGxhYmVsOiBlZGl0b3JUeXBlTGFiZWwsIGhvdmVyOiBlZGl0b3JUeXBlSG92ZXIgfSA9IHRoaXMuX2NyZWF0ZUVkaXRvclR5cGVDb250cm9sKCk7XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gYXZhaWxhYmxlLmVkaXRvcnMuZmluZChlZGl0b3IgPT4gZWRpdG9yLmlkID09PSBhdmFpbGFibGUuY3VycmVudElkKTtcblx0XHRcdGNvbnN0IGxhYmVsID0gY3VycmVudCA/IGVkaXRvclR5cGVEaXNwbGF5TGFiZWwoY3VycmVudCwgYXZhaWxhYmxlLmlzRGlmZkVkaXRvcikgOiBhdmFpbGFibGUuY3VycmVudElkO1xuXHRcdFx0ZWRpdG9yVHlwZUxhYmVsLnRleHRDb250ZW50ID0gbGFiZWw7XG5cdFx0XHRlZGl0b3JUeXBlSG92ZXIudXBkYXRlKGxvY2FsaXplKCdlZGl0b3JUeXBlLmhvdmVyJywgXCJFZGl0b3I6IHswfVwiLCBsYWJlbCkpO1xuXHRcdH1cblxuXHRcdC8vIFRoZSBkcm9wZG93biB3aWR0aCBtYXkgaGF2ZSBjaGFuZ2VkIChkaWZmZXJlbnQgZWRpdG9yIGxhYmVsIG9yIHZpc2liaWxpdHkgdG9nZ2xlZCkuIFNpbmNlIHRoZVxuXHRcdC8vIGJyZWFkY3J1bWJzIHdpZGdldCB1c2VzIGFuIGV4cGxpY2l0IHBpeGVsIHdpZHRoIHRoYXQgcmVzZXJ2ZXMgcm9vbSBmb3IgdGhlIGRyb3Bkb3duLCByZS1ydW4gdGhlXG5cdFx0Ly8gbGF5b3V0IHNvIHRoZSB3aWRnZXQgc2hyaW5rcy9ncm93cyB0byBtYXRjaCB0aGUgbmV3IGRyb3Bkb3duIHdpZHRoLlxuXHRcdGNvbnN0IGN1cnJlbnRXaWR0aCA9IHRoaXMuX2VkaXRvclR5cGVOb2RlPy5vZmZzZXRXaWR0aCA/PyAwO1xuXHRcdGlmICh0aGlzLl9sYXN0TGF5b3V0RGltZW5zaW9uICYmIGN1cnJlbnRXaWR0aCAhPT0gcHJldmlvdXNXaWR0aCkge1xuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5fbGFzdExheW91dERpbWVuc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlRWRpdG9yVHlwZUNvbnRyb2woKTogeyBsYWJlbDogSFRNTFNwYW5FbGVtZW50OyBob3ZlcjogSU1hbmFnZWRIb3ZlciB9IHtcblx0XHRpZiAodGhpcy5fZWRpdG9yVHlwZU5vZGUgJiYgdGhpcy5fZWRpdG9yVHlwZUxhYmVsICYmIHRoaXMuX2VkaXRvclR5cGVIb3Zlcikge1xuXHRcdFx0cmV0dXJuIHsgbGFiZWw6IHRoaXMuX2VkaXRvclR5cGVMYWJlbCwgaG92ZXI6IHRoaXMuX2VkaXRvclR5cGVIb3ZlciB9O1xuXHRcdH1cblxuXHRcdHRoaXMuX2VkaXRvclR5cGVOb2RlID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0dGhpcy5fZWRpdG9yVHlwZU5vZGUuY2xhc3NMaXN0LmFkZCgnYnJlYWRjcnVtYnMtZWRpdG9yLXR5cGUnKTtcblx0XHR0aGlzLl9lZGl0b3JUeXBlTm9kZS5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnYnV0dG9uJyk7XG5cdFx0dGhpcy5fZWRpdG9yVHlwZUxhYmVsID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuXHRcdHRoaXMuX2VkaXRvclR5cGVMYWJlbC5jbGFzc0xpc3QuYWRkKCdsYWJlbCcpO1xuXHRcdHRoaXMuX2VkaXRvclR5cGVOb2RlLmFwcGVuZENoaWxkKHRoaXMuX2VkaXRvclR5cGVMYWJlbCk7XG5cdFx0Y29uc3QgZWRpdG9yVHlwZUNoZXZyb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0ZWRpdG9yVHlwZUNoZXZyb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLmNoZXZyb25Eb3duKSk7XG5cdFx0dGhpcy5fZWRpdG9yVHlwZU5vZGUuYXBwZW5kQ2hpbGQoZWRpdG9yVHlwZUNoZXZyb24pO1xuXHRcdGRvbS5hcHBlbmQodGhpcy5kb21Ob2RlLCB0aGlzLl9lZGl0b3JUeXBlTm9kZSk7XG5cdFx0dGhpcy5fZWRpdG9yVHlwZUhvdmVyID0gdGhpcy5fZWRpdG9yVHlwZURpc3Bvc2FibGVzLmFkZCh0aGlzLl9ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ21vdXNlJyksIHRoaXMuX2VkaXRvclR5cGVOb2RlLCAnJykpO1xuXHRcdHRoaXMuX2VkaXRvclR5cGVEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9lZGl0b3JUeXBlTm9kZSwgZG9tLkV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdHRoaXMuX3Nob3dFZGl0b3JUeXBlUGlja2VyKCk7XG5cdFx0fSkpO1xuXHRcdHJldHVybiB7IGxhYmVsOiB0aGlzLl9lZGl0b3JUeXBlTGFiZWwsIGhvdmVyOiB0aGlzLl9lZGl0b3JUeXBlSG92ZXIgfTtcblx0fVxuXG5cdHByaXZhdGUgX2hpZGVFZGl0b3JUeXBlQ29udHJvbCgpOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0b3JUeXBlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9lZGl0b3JUeXBlTm9kZT8ucmVtb3ZlKCk7XG5cdFx0dGhpcy5fZWRpdG9yVHlwZU5vZGUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fZWRpdG9yVHlwZUxhYmVsID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2VkaXRvclR5cGVIb3ZlciA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dFZGl0b3JUeXBlUGlja2VyKCk6IHZvaWQge1xuXHRcdGNvbnN0IGVkaXRvclR5cGVOb2RlID0gdGhpcy5fZWRpdG9yVHlwZU5vZGU7XG5cdFx0aWYgKCFlZGl0b3JUeXBlTm9kZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBhdmFpbGFibGUgPSBnZXRBdmFpbGFibGVFZGl0b3JUeXBlcyh0aGlzLl9lZGl0b3JHcm91cC5hY3RpdmVFZGl0b3IsIHRoaXMuX2VkaXRvclJlc29sdmVyU2VydmljZSk7XG5cdFx0aWYgKCFhdmFpbGFibGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGNyZWF0ZUVkaXRvclR5cGVBY3Rpb25zKGF2YWlsYWJsZSwgdGhpcy5fZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLCB0aGlzLl9jb21tYW5kU2VydmljZSwgdGhpcy5fZWRpdG9yU2VydmljZSk7XG5cdFx0dGhpcy5fY29udGV4dE1lbnVTZXJ2aWNlLnNob3dDb250ZXh0TWVudSh7XG5cdFx0XHRnZXRBbmNob3I6ICgpID0+IGVkaXRvclR5cGVOb2RlLFxuXHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gYWN0aW9uc1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25Gb2N1c0V2ZW50KGV2ZW50OiBJQnJlYWRjcnVtYnNJdGVtRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZXZlbnQuaXRlbSAmJiB0aGlzLl9icmVhZGNydW1ic1BpY2tlclNob3dpbmcpIHtcblx0XHRcdHRoaXMuX2JyZWFkY3J1bWJzUGlja2VySWdub3JlT25jZUl0ZW0gPSB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl93aWRnZXQuc2V0U2VsZWN0aW9uKGV2ZW50Lml0ZW0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uU2VsZWN0RXZlbnQoZXZlbnQ6IElCcmVhZGNydW1ic0l0ZW1FdmVudCk6IHZvaWQge1xuXHRcdGlmICghZXZlbnQuaXRlbSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChldmVudC5pdGVtID09PSB0aGlzLl9icmVhZGNydW1ic1BpY2tlcklnbm9yZU9uY2VJdGVtKSB7XG5cdFx0XHR0aGlzLl9icmVhZGNydW1ic1BpY2tlcklnbm9yZU9uY2VJdGVtID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fd2lkZ2V0LnNldEZvY3VzZWQodW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX3dpZGdldC5zZXRTZWxlY3Rpb24odW5kZWZpbmVkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB7IGVsZW1lbnQgfSA9IGV2ZW50Lml0ZW0gYXMgRmlsZUl0ZW0gfCBPdXRsaW5lSXRlbTtcblx0XHR0aGlzLl9lZGl0b3JHcm91cC5mb2N1cygpO1xuXG5cdFx0Y29uc3QgZ3JvdXAgPSB0aGlzLl9nZXRFZGl0b3JHcm91cChldmVudC5wYXlsb2FkKTtcblx0XHRpZiAoZ3JvdXAgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gcmV2ZWFsIHRoZSBpdGVtXG5cdFx0XHR0aGlzLl93aWRnZXQuc2V0Rm9jdXNlZCh1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fd2lkZ2V0LnNldFNlbGVjdGlvbih1bmRlZmluZWQpO1xuXHRcdFx0dGhpcy5fcmV2ZWFsSW5FZGl0b3IoZXZlbnQsIGVsZW1lbnQsIGdyb3VwKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fY2ZVc2VRdWlja1BpY2suZ2V0VmFsdWUoKSkge1xuXHRcdFx0Ly8gdXNpbmcgcXVpY2sgcGlja1xuXHRcdFx0dGhpcy5fd2lkZ2V0LnNldEZvY3VzZWQodW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX3dpZGdldC5zZXRTZWxlY3Rpb24odW5kZWZpbmVkKTtcblx0XHRcdHRoaXMuX3F1aWNrSW5wdXRTZXJ2aWNlLnF1aWNrQWNjZXNzLnNob3coZWxlbWVudCBpbnN0YW5jZW9mIE91dGxpbmVFbGVtZW50MiA/ICdAJyA6ICcnKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBzaG93IHBpY2tlclxuXHRcdGxldCBwaWNrZXI6IEJyZWFkY3J1bWJzRmlsZVBpY2tlciB8IEJyZWFkY3J1bWJzT3V0bGluZVBpY2tlcjtcblx0XHRsZXQgcGlja2VyQW5jaG9yOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH07XG5cblx0XHRpbnRlcmZhY2UgSUhpZGVEYXRhIHsgZGlkUGljaz86IGJvb2xlYW47IHNvdXJjZT86IEJyZWFkY3J1bWJzQ29udHJvbCB9XG5cblx0XHR0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2Uuc2hvd0NvbnRleHRWaWV3KHtcblx0XHRcdHJlbmRlcjogKHBhcmVudDogSFRNTEVsZW1lbnQpID0+IHtcblx0XHRcdFx0aWYgKGV2ZW50Lml0ZW0gaW5zdGFuY2VvZiBGaWxlSXRlbSkge1xuXHRcdFx0XHRcdHBpY2tlciA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJyZWFkY3J1bWJzRmlsZVBpY2tlciwgcGFyZW50LCBldmVudC5pdGVtLm1vZGVsLnJlc291cmNlKTtcblx0XHRcdFx0fSBlbHNlIGlmIChldmVudC5pdGVtIGluc3RhbmNlb2YgT3V0bGluZUl0ZW0pIHtcblx0XHRcdFx0XHRwaWNrZXIgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShCcmVhZGNydW1ic091dGxpbmVQaWNrZXIsIHBhcmVudCwgZXZlbnQuaXRlbS5tb2RlbC5yZXNvdXJjZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBzZWxlY3RMaXN0ZW5lciA9IHBpY2tlci5vbldpbGxQaWNrRWxlbWVudCgoKSA9PiB0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2UuaGlkZUNvbnRleHRWaWV3KHsgc291cmNlOiB0aGlzLCBkaWRQaWNrOiB0cnVlIH0pKTtcblx0XHRcdFx0Y29uc3Qgem9vbUxpc3RlbmVyID0gUGl4ZWxSYXRpby5nZXRJbnN0YW5jZShkb20uZ2V0V2luZG93KHRoaXMuZG9tTm9kZSkpLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMuX2NvbnRleHRWaWV3U2VydmljZS5oaWRlQ29udGV4dFZpZXcoeyBzb3VyY2U6IHRoaXMgfSkpO1xuXG5cdFx0XHRcdGNvbnN0IGZvY3VzVHJhY2tlciA9IGRvbS50cmFja0ZvY3VzKHBhcmVudCk7XG5cdFx0XHRcdGNvbnN0IGJsdXJMaXN0ZW5lciA9IGZvY3VzVHJhY2tlci5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2JyZWFkY3J1bWJzUGlja2VySWdub3JlT25jZUl0ZW0gPSB0aGlzLl93aWRnZXQuaXNET01Gb2N1c2VkKCkgPyBldmVudC5pdGVtIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRoaXMuX2NvbnRleHRWaWV3U2VydmljZS5oaWRlQ29udGV4dFZpZXcoeyBzb3VyY2U6IHRoaXMgfSk7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdHRoaXMuX2JyZWFkY3J1bWJzUGlja2VyU2hvd2luZyA9IHRydWU7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUNrQnJlYWRjcnVtYnNBY3RpdmUoKTtcblxuXHRcdFx0XHRyZXR1cm4gY29tYmluZWREaXNwb3NhYmxlKFxuXHRcdFx0XHRcdHBpY2tlcixcblx0XHRcdFx0XHRzZWxlY3RMaXN0ZW5lcixcblx0XHRcdFx0XHR6b29tTGlzdGVuZXIsXG5cdFx0XHRcdFx0Zm9jdXNUcmFja2VyLFxuXHRcdFx0XHRcdGJsdXJMaXN0ZW5lclxuXHRcdFx0XHQpO1xuXHRcdFx0fSxcblx0XHRcdGdldEFuY2hvcjogKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXBpY2tlckFuY2hvcikge1xuXHRcdFx0XHRcdGNvbnN0IHdpbmRvdyA9IGRvbS5nZXRXaW5kb3codGhpcy5kb21Ob2RlKTtcblx0XHRcdFx0XHRjb25zdCBtYXhJbm5lcldpZHRoID0gd2luZG93LmlubmVyV2lkdGggLSA4IC8qYSBsaXR0bGUgbGVzcyB0aGUgZnVsbCB3aWRnZXQqLztcblx0XHRcdFx0XHRsZXQgbWF4SGVpZ2h0ID0gTWF0aC5taW4od2luZG93LmlubmVySGVpZ2h0ICogMC43LCAzMDApO1xuXG5cdFx0XHRcdFx0Y29uc3QgcGlja2VyV2lkdGggPSBNYXRoLm1pbihtYXhJbm5lcldpZHRoLCBNYXRoLm1heCgyNDAsIG1heElubmVyV2lkdGggLyA0LjE3KSk7XG5cdFx0XHRcdFx0Y29uc3QgcGlja2VyQXJyb3dTaXplID0gODtcblx0XHRcdFx0XHRsZXQgcGlja2VyQXJyb3dPZmZzZXQ6IG51bWJlcjtcblxuXHRcdFx0XHRcdGNvbnN0IGRhdGEgPSBkb20uZ2V0RG9tTm9kZVBhZ2VQb3NpdGlvbihldmVudC5ub2RlKTtcblx0XHRcdFx0XHRjb25zdCB5ID0gZGF0YS50b3AgKyBkYXRhLmhlaWdodCArIHBpY2tlckFycm93U2l6ZTtcblx0XHRcdFx0XHRpZiAoeSArIG1heEhlaWdodCA+PSB3aW5kb3cuaW5uZXJIZWlnaHQpIHtcblx0XHRcdFx0XHRcdG1heEhlaWdodCA9IHdpbmRvdy5pbm5lckhlaWdodCAtIHkgLSAzMCAvKiByb29tIGZvciBzaGFkb3cgYW5kIHN0YXR1cyBiYXIqLztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bGV0IHggPSBkYXRhLmxlZnQ7XG5cdFx0XHRcdFx0aWYgKHggKyBwaWNrZXJXaWR0aCA+PSBtYXhJbm5lcldpZHRoKSB7XG5cdFx0XHRcdFx0XHR4ID0gbWF4SW5uZXJXaWR0aCAtIHBpY2tlcldpZHRoO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZXZlbnQucGF5bG9hZCBpbnN0YW5jZW9mIFN0YW5kYXJkTW91c2VFdmVudCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgbWF4UGlja2VyQXJyb3dPZmZzZXQgPSBwaWNrZXJXaWR0aCAtIDIgKiBwaWNrZXJBcnJvd1NpemU7XG5cdFx0XHRcdFx0XHRwaWNrZXJBcnJvd09mZnNldCA9IGV2ZW50LnBheWxvYWQucG9zeCAtIHg7XG5cdFx0XHRcdFx0XHRpZiAocGlja2VyQXJyb3dPZmZzZXQgPiBtYXhQaWNrZXJBcnJvd09mZnNldCkge1xuXHRcdFx0XHRcdFx0XHR4ID0gTWF0aC5taW4obWF4SW5uZXJXaWR0aCAtIHBpY2tlcldpZHRoLCB4ICsgcGlja2VyQXJyb3dPZmZzZXQgLSBtYXhQaWNrZXJBcnJvd09mZnNldCk7XG5cdFx0XHRcdFx0XHRcdHBpY2tlckFycm93T2Zmc2V0ID0gbWF4UGlja2VyQXJyb3dPZmZzZXQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHBpY2tlckFycm93T2Zmc2V0ID0gKGRhdGEubGVmdCArIChkYXRhLndpZHRoICogMC4zKSkgLSB4O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwaWNrZXIuc2hvdyhlbGVtZW50LCBtYXhIZWlnaHQsIHBpY2tlcldpZHRoLCBwaWNrZXJBcnJvd1NpemUsIE1hdGgubWF4KDAsIHBpY2tlckFycm93T2Zmc2V0KSk7XG5cdFx0XHRcdFx0cGlja2VyQW5jaG9yID0geyB4LCB5IH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHBpY2tlckFuY2hvcjtcblx0XHRcdH0sXG5cdFx0XHRvbkhpZGU6IChkYXRhPzogSUhpZGVEYXRhKSA9PiB7XG5cdFx0XHRcdGlmICghZGF0YT8uZGlkUGljaykge1xuXHRcdFx0XHRcdHBpY2tlci5yZXN0b3JlVmlld1N0YXRlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5fYnJlYWRjcnVtYnNQaWNrZXJTaG93aW5nID0gZmFsc2U7XG5cdFx0XHRcdHRoaXMuX3VwZGF0ZUNrQnJlYWRjcnVtYnNBY3RpdmUoKTtcblx0XHRcdFx0aWYgKGRhdGE/LnNvdXJjZSA9PT0gdGhpcykge1xuXHRcdFx0XHRcdHRoaXMuX3dpZGdldC5zZXRGb2N1c2VkKHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0dGhpcy5fd2lkZ2V0LnNldFNlbGVjdGlvbih1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHBpY2tlci5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDa0JyZWFkY3J1bWJzQWN0aXZlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fd2lkZ2V0LmlzRE9NRm9jdXNlZCgpIHx8IHRoaXMuX2JyZWFkY3J1bWJzUGlja2VyU2hvd2luZztcblx0XHR0aGlzLl9ja0JyZWFkY3J1bWJzQWN0aXZlLnNldCh2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXZlYWxJbkVkaXRvcihldmVudDogSUJyZWFkY3J1bWJzSXRlbUV2ZW50LCBlbGVtZW50OiBGaWxlRWxlbWVudCB8IE91dGxpbmVFbGVtZW50MiwgZ3JvdXA6IFNJREVfR1JPVVBfVFlQRSB8IEFDVElWRV9HUk9VUF9UWVBFIHwgdW5kZWZpbmVkLCBwaW5uZWQ6IGJvb2xlYW4gPSBmYWxzZSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0aWYgKGVsZW1lbnQgaW5zdGFuY2VvZiBGaWxlRWxlbWVudCkge1xuXHRcdFx0aWYgKGVsZW1lbnQua2luZCA9PT0gRmlsZUtpbmQuRklMRSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IoeyByZXNvdXJjZTogZWxlbWVudC51cmksIG9wdGlvbnM6IHsgcGlubmVkIH0gfSwgZ3JvdXApO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gc2hvdyBuZXh0IHBpY2tlclxuXHRcdFx0XHRjb25zdCBpdGVtcyA9IHRoaXMuX3dpZGdldC5nZXRJdGVtcygpO1xuXHRcdFx0XHRjb25zdCBpZHggPSBpdGVtcy5pbmRleE9mKGV2ZW50Lml0ZW0pO1xuXHRcdFx0XHR0aGlzLl93aWRnZXQuc2V0Rm9jdXNlZChpdGVtc1tpZHggKyAxXSk7XG5cdFx0XHRcdHRoaXMuX3dpZGdldC5zZXRTZWxlY3Rpb24oaXRlbXNbaWR4ICsgMV0sIEJyZWFkY3J1bWJzQ29udHJvbC5QYXlsb2FkX1BpY2spO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRlbGVtZW50Lm91dGxpbmUucmV2ZWFsKGVsZW1lbnQsIHsgcGlubmVkIH0sIGdyb3VwID09PSBTSURFX0dST1VQLCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RWRpdG9yR3JvdXAoZGF0YTogdW5rbm93bik6IFNJREVfR1JPVVBfVFlQRSB8IEFDVElWRV9HUk9VUF9UWVBFIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoZGF0YSA9PT0gQnJlYWRjcnVtYnNDb250cm9sLlBheWxvYWRfUmV2ZWFsQXNpZGUpIHtcblx0XHRcdHJldHVybiBTSURFX0dST1VQO1xuXHRcdH0gZWxzZSBpZiAoZGF0YSA9PT0gQnJlYWRjcnVtYnNDb250cm9sLlBheWxvYWRfUmV2ZWFsKSB7XG5cdFx0XHRyZXR1cm4gQUNUSVZFX0dST1VQO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQnJlYWRjcnVtYnNDb250cm9sRmFjdG9yeSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRyb2xEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIF9jb250cm9sOiBCcmVhZGNydW1ic0NvbnRyb2wgfCB1bmRlZmluZWQ7XG5cdGdldCBjb250cm9sKCkgeyByZXR1cm4gdGhpcy5fY29udHJvbDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRW5hYmxlbWVudENoYW5nZSA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkRW5hYmxlbWVudENoYW5nZSgpIHsgcmV0dXJuIHRoaXMuX29uRGlkRW5hYmxlbWVudENoYW5nZS5ldmVudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkVmlzaWJpbGl0eUNoYW5nZSA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0Z2V0IG9uRGlkVmlzaWJpbGl0eUNoYW5nZSgpIHsgcmV0dXJuIHRoaXMuX29uRGlkVmlzaWJpbGl0eUNoYW5nZS5ldmVudDsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yR3JvdXA6IElFZGl0b3JHcm91cFZpZXcsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSUJyZWFkY3J1bWJzQ29udHJvbE9wdGlvbnMsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2Vcblx0KSB7XG5cdFx0Y29uc3QgY29uZmlnID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKEJyZWFkY3J1bWJzQ29uZmlnLklzRW5hYmxlZC5iaW5kVG8oY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoY29uZmlnLm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNvbnN0IHZhbHVlID0gY29uZmlnLmdldFZhbHVlKCk7XG5cdFx0XHRpZiAoIXZhbHVlICYmIHRoaXMuX2NvbnRyb2wpIHtcblx0XHRcdFx0dGhpcy5fY29udHJvbERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdHRoaXMuX2NvbnRyb2wgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMuX29uRGlkRW5hYmxlbWVudENoYW5nZS5maXJlKCk7XG5cdFx0XHR9IGVsc2UgaWYgKHZhbHVlICYmICF0aGlzLl9jb250cm9sKSB7XG5cdFx0XHRcdHRoaXMuX2NvbnRyb2wgPSB0aGlzLmNyZWF0ZUNvbnRyb2woKTtcblx0XHRcdFx0dGhpcy5fY29udHJvbC51cGRhdGUoKTtcblx0XHRcdFx0dGhpcy5fb25EaWRFbmFibGVtZW50Q2hhbmdlLmZpcmUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoY29uZmlnLmdldFZhbHVlKCkpIHtcblx0XHRcdHRoaXMuX2NvbnRyb2wgPSB0aGlzLmNyZWF0ZUNvbnRyb2woKTtcblx0XHR9XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zKGUgPT4ge1xuXHRcdFx0aWYgKHRoaXMuX2NvbnRyb2w/Lm1vZGVsICYmIHRoaXMuX2NvbnRyb2wubW9kZWwucmVzb3VyY2Uuc2NoZW1lICE9PSBlLnNjaGVtZSkge1xuXHRcdFx0XHQvLyBpZ25vcmUgaWYgdGhlIHNjaGVtZSBvZiB0aGUgYnJlYWRjcnVtYnMgcmVzb3VyY2UgaXMgbm90IGFmZmVjdGVkXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9jb250cm9sPy51cGRhdGUoKSkge1xuXHRcdFx0XHR0aGlzLl9vbkRpZEVuYWJsZW1lbnRDaGFuZ2UuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQ29udHJvbCgpOiBCcmVhZGNydW1ic0NvbnRyb2wge1xuXHRcdGNvbnN0IGNvbnRyb2wgPSB0aGlzLl9jb250cm9sRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEJyZWFkY3J1bWJzQ29udHJvbCwgdGhpcy5fY29udGFpbmVyLCB0aGlzLl9vcHRpb25zLCB0aGlzLl9lZGl0b3JHcm91cCkpO1xuXHRcdHRoaXMuX2NvbnRyb2xEaXNwb3NhYmxlcy5hZGQoY29udHJvbC5vbkRpZFZpc2liaWxpdHlDaGFuZ2UoKCkgPT4gdGhpcy5fb25EaWRWaXNpYmlsaXR5Q2hhbmdlLmZpcmUoKSkpO1xuXG5cdFx0cmV0dXJuIGNvbnRyb2w7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9jb250cm9sRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8vI3JlZ2lvbiBjb21tYW5kc1xuXG4vLyB0b2dnbGUgY29tbWFuZFxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRvZ2dsZUJyZWFkY3J1bWIgZXh0ZW5kcyBBY3Rpb24yIHtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2JyZWFkY3J1bWJzLnRvZ2dsZScsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUyKCdjbWQudG9nZ2xlJywgXCJUb2dnbGUgQnJlYWRjcnVtYnNcIiksXG5cdFx0XHRzaG9ydFRpdGxlOiBsb2NhbGl6ZTIoJ2NtZC50b2dnbGUuc2hvcnQnLCBcIkJyZWFkY3J1bWJzXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdHRvZ2dsZWQ6IHtcblx0XHRcdFx0Y29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5icmVhZGNydW1icy5lbmFibGVkJywgdHJ1ZSksXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnY21kLnRvZ2dsZTInLCBcIkJyZWFkY3J1bWJzXCIpLFxuXHRcdFx0XHRtbmVtb25pY1RpdGxlOiBsb2NhbGl6ZSh7IGtleTogJ21pQnJlYWRjcnVtYnMyJywgY29tbWVudDogWycmJiBkZW5vdGVzIGEgbW5lbW9uaWMnXSB9LCBcIiYmQnJlYWRjcnVtYnNcIilcblx0XHRcdH0sXG5cdFx0XHRtZW51OiBbXG5cdFx0XHRcdHsgaWQ6IE1lbnVJZC5Db21tYW5kUGFsZXR0ZSB9LFxuXHRcdFx0XHR7IGlkOiBNZW51SWQuTWVudWJhckFwcGVhcmFuY2VNZW51LCBncm91cDogJzRfZWRpdG9yJywgb3JkZXI6IDIgfSxcblx0XHRcdFx0eyBpZDogTWVudUlkLk5vdGVib29rVG9vbGJhciwgZ3JvdXA6ICdub3RlYm9va0xheW91dCcsIG9yZGVyOiAyIH0sXG5cdFx0XHRcdHsgaWQ6IE1lbnVJZC5TdGlja3lTY3JvbGxDb250ZXh0IH0sXG5cdFx0XHRcdHsgaWQ6IE1lbnVJZC5Ob3RlYm9va1N0aWNreVNjcm9sbENvbnRleHQsIGdyb3VwOiAnbm90ZWJvb2tWaWV3Jywgb3JkZXI6IDIgfSxcblx0XHRcdFx0eyBpZDogTWVudUlkLk5vdGVib29rVG9vbGJhckNvbnRleHQsIGdyb3VwOiAnbm90ZWJvb2tWaWV3Jywgb3JkZXI6IDIgfVxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmlnID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3QgYnJlYWRDcnVtYnNDb25maWcgPSBCcmVhZGNydW1ic0NvbmZpZy5Jc0VuYWJsZWQuYmluZFRvKGNvbmZpZyk7XG5cdFx0Y29uc3QgdmFsdWUgPSBicmVhZENydW1ic0NvbmZpZy5nZXRWYWx1ZSgpO1xuXHRcdGJyZWFkQ3J1bWJzQ29uZmlnLnVwZGF0ZVZhbHVlKCF2YWx1ZSk7XG5cdFx0YnJlYWRDcnVtYnNDb25maWcuZGlzcG9zZSgpO1xuXHR9XG5cbn0pO1xuXG4vLyBmb2N1cy9mb2N1cy1hbmQtc2VsZWN0XG5mdW5jdGlvbiBmb2N1c0FuZFNlbGVjdEhhbmRsZXIoYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHNlbGVjdDogYm9vbGVhbik6IHZvaWQge1xuXHQvLyBmaW5kIHdpZGdldCBhbmQgZm9jdXMvc2VsZWN0XG5cdGNvbnN0IGdyb3VwcyA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdGNvbnN0IGJyZWFkY3J1bWJzID0gYWNjZXNzb3IuZ2V0KElCcmVhZGNydW1ic1NlcnZpY2UpO1xuXHRjb25zdCB3aWRnZXQgPSBicmVhZGNydW1icy5nZXRXaWRnZXQoZ3JvdXBzLmFjdGl2ZUdyb3VwLmlkKTtcblx0aWYgKHdpZGdldCkge1xuXHRcdGNvbnN0IGl0ZW0gPSB3aWRnZXQuZ2V0SXRlbXMoKS5hdCgtMSk7XG5cdFx0d2lkZ2V0LnNldEZvY3VzZWQoaXRlbSk7XG5cdFx0aWYgKHNlbGVjdCkge1xuXHRcdFx0d2lkZ2V0LnNldFNlbGVjdGlvbihpdGVtLCBCcmVhZGNydW1ic0NvbnRyb2wuUGF5bG9hZF9QaWNrKTtcblx0XHR9XG5cdH1cbn1cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBGb2N1c0FuZFNlbGVjdEJyZWFkY3J1bWJzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnYnJlYWRjcnVtYnMuZm9jdXNBbmRTZWxlY3QnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMignY21kLmZvY3VzQW5kU2VsZWN0JywgXCJGb2N1cyBhbmQgU2VsZWN0IEJyZWFkY3J1bWJzXCIpLFxuXHRcdFx0cHJlY29uZGl0aW9uOiBCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNWaXNpYmxlLFxuXHRcdFx0a2V5YmluZGluZzoge1xuXHRcdFx0XHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYixcblx0XHRcdFx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlNb2QuU2hpZnQgfCBLZXlDb2RlLlBlcmlvZCxcblx0XHRcdFx0d2hlbjogQnJlYWRjcnVtYnNDb250cm9sLkNLX0JyZWFkY3J1bWJzUG9zc2libGUsXG5cdFx0XHR9LFxuXHRcdFx0ZjE6IHRydWVcblx0XHR9KTtcblx0fVxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGZvY3VzQW5kU2VsZWN0SGFuZGxlcihhY2Nlc3NvciwgdHJ1ZSk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgRm9jdXNCcmVhZGNydW1icyBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2JyZWFkY3J1bWJzLmZvY3VzJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NtZC5mb2N1cycsIFwiRm9jdXMgQnJlYWRjcnVtYnNcIiksXG5cdFx0XHRwcmVjb25kaXRpb246IEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic1Zpc2libGUsXG5cdFx0XHRrZXliaW5kaW5nOiB7XG5cdFx0XHRcdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRcdFx0XHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleU1vZC5TaGlmdCB8IEtleUNvZGUuU2VtaWNvbG9uLFxuXHRcdFx0XHR3aGVuOiBCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNQb3NzaWJsZSxcblx0XHRcdH0sXG5cdFx0XHRmMTogdHJ1ZVxuXHRcdH0pO1xuXHR9XG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0Zm9jdXNBbmRTZWxlY3RIYW5kbGVyKGFjY2Vzc29yLCBmYWxzZSk7XG5cdH1cbn0pO1xuXG4vLyB0aGlzIGNvbW1hbmRzIGlzIG9ubHkgZW5hYmxlZCB3aGVuIGJyZWFkY3J1bWJzIGFyZVxuLy8gZGlzYWJsZWQgd2hpY2ggaXQgdGhlbiBlbmFibGVzIGFuZCBmb2N1c2VzXG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdicmVhZGNydW1icy50b2dnbGVUb09uJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5QZXJpb2QsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLm5vdCgnY29uZmlnLmJyZWFkY3J1bWJzLmVuYWJsZWQnKSxcblx0aGFuZGxlcjogYXN5bmMgYWNjZXNzb3IgPT4ge1xuXHRcdGNvbnN0IGluc3RhbnQgPSBhY2Nlc3Nvci5nZXQoSUluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWcgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHQvLyBjaGVjayBpZiBlbmFibGVkIGFuZCBpZmYgbm90IGVuYWJsZVxuXHRcdGNvbnN0IGlzRW5hYmxlZCA9IEJyZWFkY3J1bWJzQ29uZmlnLklzRW5hYmxlZC5iaW5kVG8oY29uZmlnKTtcblx0XHRpZiAoIWlzRW5hYmxlZC5nZXRWYWx1ZSgpKSB7XG5cdFx0XHRhd2FpdCBpc0VuYWJsZWQudXBkYXRlVmFsdWUodHJ1ZSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDUwKTsgLy8gaGFja3kgLSB0aGUgd2lkZ2V0IG1pZ2h0IG5vdCBiZSByZWFkeSB5ZXQuLi5cblx0XHR9XG5cdFx0aXNFbmFibGVkLmRpc3Bvc2UoKTtcblx0XHRyZXR1cm4gaW5zdGFudC5pbnZva2VGdW5jdGlvbihmb2N1c0FuZFNlbGVjdEhhbmRsZXIsIHRydWUpO1xuXHR9XG59KTtcblxuLy8gbmF2aWdhdGlvblxuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnYnJlYWRjcnVtYnMuZm9jdXNOZXh0Jyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHByaW1hcnk6IEtleUNvZGUuUmlnaHRBcnJvdyxcblx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlJpZ2h0QXJyb3ddLFxuXHRtYWM6IHtcblx0XHRwcmltYXJ5OiBLZXlDb2RlLlJpZ2h0QXJyb3csXG5cdFx0c2Vjb25kYXJ5OiBbS2V5TW9kLkFsdCB8IEtleUNvZGUuUmlnaHRBcnJvd10sXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNWaXNpYmxlLCBCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNBY3RpdmUpLFxuXHRoYW5kbGVyKGFjY2Vzc29yKSB7XG5cdFx0Y29uc3QgZ3JvdXBzID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRjb25zdCBicmVhZGNydW1icyA9IGFjY2Vzc29yLmdldChJQnJlYWRjcnVtYnNTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSBicmVhZGNydW1icy5nZXRXaWRnZXQoZ3JvdXBzLmFjdGl2ZUdyb3VwLmlkKTtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR3aWRnZXQuZm9jdXNOZXh0KCk7XG5cdH1cbn0pO1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnYnJlYWRjcnVtYnMuZm9jdXNQcmV2aW91cycsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRwcmltYXJ5OiBLZXlDb2RlLkxlZnRBcnJvdyxcblx0c2Vjb25kYXJ5OiBbS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLkxlZnRBcnJvd10sXG5cdG1hYzoge1xuXHRcdHByaW1hcnk6IEtleUNvZGUuTGVmdEFycm93LFxuXHRcdHNlY29uZGFyeTogW0tleU1vZC5BbHQgfCBLZXlDb2RlLkxlZnRBcnJvd10sXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNWaXNpYmxlLCBCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNBY3RpdmUpLFxuXHRoYW5kbGVyKGFjY2Vzc29yKSB7XG5cdFx0Y29uc3QgZ3JvdXBzID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRjb25zdCBicmVhZGNydW1icyA9IGFjY2Vzc29yLmdldChJQnJlYWRjcnVtYnNTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSBicmVhZGNydW1icy5nZXRXaWRnZXQoZ3JvdXBzLmFjdGl2ZUdyb3VwLmlkKTtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR3aWRnZXQuZm9jdXNQcmV2KCk7XG5cdH1cbn0pO1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnYnJlYWRjcnVtYnMuZm9jdXNOZXh0V2l0aFBpY2tlcicsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0cHJpbWFyeTogS2V5TW9kLkN0cmxDbWQgfCBLZXlDb2RlLlJpZ2h0QXJyb3csXG5cdG1hYzoge1xuXHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLlJpZ2h0QXJyb3csXG5cdH0sXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNWaXNpYmxlLCBCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNBY3RpdmUsIFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXkpLFxuXHRoYW5kbGVyKGFjY2Vzc29yKSB7XG5cdFx0Y29uc3QgZ3JvdXBzID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRjb25zdCBicmVhZGNydW1icyA9IGFjY2Vzc29yLmdldChJQnJlYWRjcnVtYnNTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSBicmVhZGNydW1icy5nZXRXaWRnZXQoZ3JvdXBzLmFjdGl2ZUdyb3VwLmlkKTtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR3aWRnZXQuZm9jdXNOZXh0KCk7XG5cdH1cbn0pO1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnYnJlYWRjcnVtYnMuZm9jdXNQcmV2aW91c1dpdGhQaWNrZXInLFxuXHR3ZWlnaHQ6IEtleWJpbmRpbmdXZWlnaHQuV29ya2JlbmNoQ29udHJpYiArIDEsXG5cdHByaW1hcnk6IEtleU1vZC5DdHJsQ21kIHwgS2V5Q29kZS5MZWZ0QXJyb3csXG5cdG1hYzoge1xuXHRcdHByaW1hcnk6IEtleU1vZC5BbHQgfCBLZXlDb2RlLkxlZnRBcnJvdyxcblx0fSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic1Zpc2libGUsIEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic0FjdGl2ZSwgV29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSksXG5cdGhhbmRsZXIoYWNjZXNzb3IpIHtcblx0XHRjb25zdCBncm91cHMgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGJyZWFkY3J1bWJzID0gYWNjZXNzb3IuZ2V0KElCcmVhZGNydW1ic1NlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGJyZWFkY3J1bWJzLmdldFdpZGdldChncm91cHMuYWN0aXZlR3JvdXAuaWQpO1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHdpZGdldC5mb2N1c1ByZXYoKTtcblx0fVxufSk7XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdicmVhZGNydW1icy5zZWxlY3RGb2N1c2VkJyxcblx0d2VpZ2h0OiBLZXliaW5kaW5nV2VpZ2h0LldvcmtiZW5jaENvbnRyaWIsXG5cdHByaW1hcnk6IEtleUNvZGUuRW50ZXIsXG5cdHNlY29uZGFyeTogW0tleUNvZGUuRG93bkFycm93XSxcblx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic1Zpc2libGUsIEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic0FjdGl2ZSksXG5cdGhhbmRsZXIoYWNjZXNzb3IpIHtcblx0XHRjb25zdCBncm91cHMgPSBhY2Nlc3Nvci5nZXQoSUVkaXRvckdyb3Vwc1NlcnZpY2UpO1xuXHRcdGNvbnN0IGJyZWFkY3J1bWJzID0gYWNjZXNzb3IuZ2V0KElCcmVhZGNydW1ic1NlcnZpY2UpO1xuXHRcdGNvbnN0IHdpZGdldCA9IGJyZWFkY3J1bWJzLmdldFdpZGdldChncm91cHMuYWN0aXZlR3JvdXAuaWQpO1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHdpZGdldC5zZXRTZWxlY3Rpb24od2lkZ2V0LmdldEZvY3VzZWQoKSwgQnJlYWRjcnVtYnNDb250cm9sLlBheWxvYWRfUGljayk7XG5cdH1cbn0pO1xuS2V5YmluZGluZ3NSZWdpc3RyeS5yZWdpc3RlckNvbW1hbmRBbmRLZXliaW5kaW5nUnVsZSh7XG5cdGlkOiAnYnJlYWRjcnVtYnMucmV2ZWFsRm9jdXNlZCcsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRwcmltYXJ5OiBLZXlDb2RlLlNwYWNlLFxuXHRzZWNvbmRhcnk6IFtLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW50ZXJdLFxuXHR3aGVuOiBDb250ZXh0S2V5RXhwci5hbmQoQnJlYWRjcnVtYnNDb250cm9sLkNLX0JyZWFkY3J1bWJzVmlzaWJsZSwgQnJlYWRjcnVtYnNDb250cm9sLkNLX0JyZWFkY3J1bWJzQWN0aXZlKSxcblx0aGFuZGxlcihhY2Nlc3Nvcikge1xuXHRcdGNvbnN0IGdyb3VwcyA9IGFjY2Vzc29yLmdldChJRWRpdG9yR3JvdXBzU2VydmljZSk7XG5cdFx0Y29uc3QgYnJlYWRjcnVtYnMgPSBhY2Nlc3Nvci5nZXQoSUJyZWFkY3J1bWJzU2VydmljZSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gYnJlYWRjcnVtYnMuZ2V0V2lkZ2V0KGdyb3Vwcy5hY3RpdmVHcm91cC5pZCk7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0d2lkZ2V0LnNldFNlbGVjdGlvbih3aWRnZXQuZ2V0Rm9jdXNlZCgpLCBCcmVhZGNydW1ic0NvbnRyb2wuUGF5bG9hZF9SZXZlYWwpO1xuXHR9XG59KTtcbktleWJpbmRpbmdzUmVnaXN0cnkucmVnaXN0ZXJDb21tYW5kQW5kS2V5YmluZGluZ1J1bGUoe1xuXHRpZDogJ2JyZWFkY3J1bWJzLnNlbGVjdEVkaXRvcicsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliICsgMSxcblx0cHJpbWFyeTogS2V5Q29kZS5Fc2NhcGUsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNWaXNpYmxlLCBCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNBY3RpdmUpLFxuXHRoYW5kbGVyKGFjY2Vzc29yKSB7XG5cdFx0Y29uc3QgZ3JvdXBzID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRjb25zdCBicmVhZGNydW1icyA9IGFjY2Vzc29yLmdldChJQnJlYWRjcnVtYnNTZXJ2aWNlKTtcblx0XHRjb25zdCB3aWRnZXQgPSBicmVhZGNydW1icy5nZXRXaWRnZXQoZ3JvdXBzLmFjdGl2ZUdyb3VwLmlkKTtcblx0XHRpZiAoIXdpZGdldCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR3aWRnZXQuc2V0Rm9jdXNlZCh1bmRlZmluZWQpO1xuXHRcdHdpZGdldC5zZXRTZWxlY3Rpb24odW5kZWZpbmVkKTtcblx0XHRncm91cHMuYWN0aXZlR3JvdXAuYWN0aXZlRWRpdG9yUGFuZT8uZm9jdXMoKTtcblx0fVxufSk7XG5LZXliaW5kaW5nc1JlZ2lzdHJ5LnJlZ2lzdGVyQ29tbWFuZEFuZEtleWJpbmRpbmdSdWxlKHtcblx0aWQ6ICdicmVhZGNydW1icy5yZXZlYWxGb2N1c2VkRnJvbVRyZWVBc2lkZScsXG5cdHdlaWdodDogS2V5YmluZGluZ1dlaWdodC5Xb3JrYmVuY2hDb250cmliLFxuXHRwcmltYXJ5OiBLZXlNb2QuQ3RybENtZCB8IEtleUNvZGUuRW50ZXIsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNWaXNpYmxlLCBCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNBY3RpdmUsIFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXkpLFxuXHRoYW5kbGVyKGFjY2Vzc29yKSB7XG5cdFx0Y29uc3QgZWRpdG9ycyA9IGFjY2Vzc29yLmdldChJRWRpdG9yU2VydmljZSk7XG5cdFx0Y29uc3QgbGlzdHMgPSBhY2Nlc3Nvci5nZXQoSUxpc3RTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHRyZWUgPSBsaXN0cy5sYXN0Rm9jdXNlZExpc3Q7XG5cdFx0aWYgKCEodHJlZSBpbnN0YW5jZW9mIFdvcmtiZW5jaERhdGFUcmVlKSAmJiAhKHRyZWUgaW5zdGFuY2VvZiBXb3JrYmVuY2hBc3luY0RhdGFUcmVlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVsZW1lbnQgPSA8SUZpbGVTdGF0IHwgdW5rbm93bj50cmVlLmdldEZvY3VzKClbMF07XG5cblx0XHRpZiAoVVJJLmlzVXJpKCg8SUZpbGVTdGF0PmVsZW1lbnQpPy5yZXNvdXJjZSkpIHtcblx0XHRcdC8vIElGaWxlU3RhdDogb3BlbiBmaWxlIGluIGVkaXRvclxuXHRcdFx0cmV0dXJuIGVkaXRvcnMub3BlbkVkaXRvcih7XG5cdFx0XHRcdHJlc291cmNlOiAoPElGaWxlU3RhdD5lbGVtZW50KS5yZXNvdXJjZSxcblx0XHRcdFx0b3B0aW9uczogeyBwaW5uZWQ6IHRydWUgfVxuXHRcdFx0fSwgU0lERV9HUk9VUCk7XG5cdFx0fVxuXG5cdFx0Ly8gSU91dGxpbmU6IGNoZWNrIGlmIHRoaXMgdGhlIG91dGxpbmUgYW5kIGlmZiBzbyByZXZlYWwgZWxlbWVudFxuXHRcdGNvbnN0IGlucHV0ID0gdHJlZS5nZXRJbnB1dCgpO1xuXHRcdGlmIChpbnB1dCAmJiB0eXBlb2YgKDxJT3V0bGluZTx1bmtub3duPj5pbnB1dCkub3V0bGluZUtpbmQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gKDxJT3V0bGluZTx1bmtub3duPj5pbnB1dCkucmV2ZWFsKGVsZW1lbnQsIHtcblx0XHRcdFx0cGlubmVkOiB0cnVlLFxuXHRcdFx0XHRwcmVzZXJ2ZUZvY3VzOiBmYWxzZVxuXHRcdFx0fSwgdHJ1ZSwgZmFsc2UpO1xuXHRcdH1cblx0fVxufSk7XG4vLyNlbmRyZWdpb25cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIENvcHlCcmVhZGNydW1iUGF0aCBleHRlbmRzIEFjdGlvbjIge1xuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcih7XG5cdFx0XHRpZDogJ2JyZWFkY3J1bWJzLmNvcHlQYXRoJyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ2NtZC5jb3B5UGF0aCcsIFwiQ29weSBCcmVhZGNydW1icyBQYXRoXCIpLFxuXHRcdFx0Y2F0ZWdvcnk6IENhdGVnb3JpZXMuVmlldyxcblx0XHRcdHByZWNvbmRpdGlvbjogQ29udGV4dEtleUV4cHIuYW5kKEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic1Zpc2libGUsIEJyZWFkY3J1bWJzQ29udHJvbC5DS19CcmVhZGNydW1ic0hhc1N5bWJvbHMpLFxuXHRcdFx0ZjE6IHRydWUsXG5cdFx0XHRtZW51OiBbe1xuXHRcdFx0XHRpZDogTWVudUlkLkVkaXRvclRpdGxlQ29udGV4dCxcblx0XHRcdFx0Z3JvdXA6ICcxX2N1dGNvcHlwYXN0ZScsXG5cdFx0XHRcdG9yZGVyOiAxMDAsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChCcmVhZGNydW1ic0NvbnRyb2wuQ0tfQnJlYWRjcnVtYnNQb3NzaWJsZSwgQnJlYWRjcnVtYnNDb250cm9sLkNLX0JyZWFkY3J1bWJzSGFzU3ltYm9scylcblx0XHRcdH1dXG5cdFx0fSk7XG5cdH1cblx0YXN5bmMgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZ3JvdXBzID0gYWNjZXNzb3IuZ2V0KElFZGl0b3JHcm91cHNTZXJ2aWNlKTtcblx0XHRjb25zdCBjbGlwYm9hcmRTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDbGlwYm9hcmRTZXJ2aWNlKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IG91dGxpbmVTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElPdXRsaW5lU2VydmljZSk7XG5cblx0XHRpZiAoIWdyb3Vwcy5hY3RpdmVHcm91cC5hY3RpdmVFZGl0b3JQYW5lKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3V0bGluZSA9IGF3YWl0IG91dGxpbmVTZXJ2aWNlLmNyZWF0ZU91dGxpbmUoZ3JvdXBzLmFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvclBhbmUsIE91dGxpbmVUYXJnZXQuQnJlYWRjcnVtYnMsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmICghb3V0bGluZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVsZW1lbnRzID0gb3V0bGluZS5jb25maWcuYnJlYWRjcnVtYnNEYXRhU291cmNlLmdldEJyZWFkY3J1bWJFbGVtZW50cygpO1xuXHRcdGNvbnN0IGxhYmVscyA9IGVsZW1lbnRzLm1hcChpdGVtID0+IGl0ZW0ubGFiZWwpLmZpbHRlcihCb29sZWFuKTtcblxuXHRcdG91dGxpbmUuZGlzcG9zZSgpO1xuXG5cdFx0aWYgKGxhYmVscy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBHZXQgc2VwYXJhdG9yIHdpdGggbGFuZ3VhZ2Ugb3ZlcnJpZGUgc3VwcG9ydFxuXHRcdGNvbnN0IHJlc291cmNlID0gZ3JvdXBzLmFjdGl2ZUdyb3VwLmFjdGl2ZUVkaXRvclBhbmUuaW5wdXQucmVzb3VyY2U7XG5cdFx0Y29uc3QgY29uZmlnID0gQnJlYWRjcnVtYnNDb25maWcuU3ltYm9sUGF0aFNlcGFyYXRvci5iaW5kVG8oY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHNlcGFyYXRvciA9IGNvbmZpZy5nZXRWYWx1ZShyZXNvdXJjZSAmJiB7IHJlc291cmNlIH0pID8/ICcuJztcblx0XHRjb25maWcuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgcGF0aCA9IGxhYmVscy5qb2luKHNlcGFyYXRvcik7XG5cdFx0YXdhaXQgY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQocGF0aCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBaUIseUJBQTBFO0FBQ3BHLFNBQVMsc0JBQXNCO0FBRy9CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsU0FBUyxjQUFjO0FBQ2hDLFNBQVMsb0JBQW9CLGlCQUE4QixtQkFBbUIsb0JBQW9CO0FBQ2xHLFNBQVMsVUFBVSxjQUFjO0FBQ2pDLFNBQVMsV0FBVztBQUVwQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFVBQVUsaUJBQWlCO0FBQ3BDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsU0FBUyxRQUFRLHVCQUF1QjtBQUNqRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdCQUE2QixvQkFBb0IscUJBQXFCO0FBQy9FLFNBQVMscUJBQXFCLDJCQUEyQjtBQUN6RCxTQUFTLHVCQUF1Qiw4QkFBOEI7QUFDOUQsU0FBUyxVQUFVLG9CQUErQjtBQUNsRCxTQUFTLDZCQUErQztBQUV4RCxTQUFTLHFCQUFxQix3QkFBd0I7QUFDdEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxjQUFjLHdCQUF3QixtQkFBbUIsb0NBQW9DO0FBQ3RHLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsd0JBQTRDLHdCQUF3QjtBQUM3RSxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLGNBQWlDLGdCQUFnQixrQkFBbUM7QUFDN0YsU0FBbUIsaUJBQWlCLHFCQUFxQjtBQUN6RCxTQUFTLHlCQUF5QiwyQkFBMkI7QUFDN0QsU0FBUywwQkFBMEIsc0JBQXNCO0FBQ3pELFNBQVMsbUJBQW1CLDJCQUEyQjtBQUN2RCxTQUFTLGtCQUFrQixhQUFhLHVCQUF1QjtBQUMvRCxTQUFTLHVCQUF1QixnQ0FBZ0M7QUFFaEUsU0FBUyx5QkFBeUIsd0JBQXdCLHlCQUF5QixtQ0FBbUM7QUFDdEgsT0FBTztBQUNQLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMseUJBQXlCO0FBRWxDLElBQU0sY0FBTixjQUEwQixnQkFBZ0I7QUFBQSxFQUl6QyxZQUNVLE9BQ0EsU0FDQSxTQUMrQix1QkFDdkM7QUFDRCxVQUFNO0FBTEc7QUFDQTtBQUNBO0FBQytCO0FBTnpDLFNBQWlCLGVBQWUsSUFBSSxnQkFBZ0I7QUFBQSxFQVNwRDtBQUFBLEVBSUEsVUFBZ0I7QUFDZixTQUFLLGFBQWEsUUFBUTtBQUFBLEVBQzNCO0FBQUEsRUFFQSxPQUFPLE9BQWlDO0FBQ3ZDLFFBQUksRUFBRSxpQkFBaUIsY0FBYztBQUNwQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sS0FBSyxRQUFRLFlBQVksTUFBTSxRQUFRLFdBQzdDLEtBQUssUUFBUSxrQkFBa0IsTUFBTSxRQUFRLGlCQUM3QyxLQUFLLFFBQVEsb0JBQW9CLE1BQU0sUUFBUTtBQUFBLEVBQ2pEO0FBQUEsRUFFQSxPQUFPLFdBQThCO0FBQ3BDLFVBQU0sRUFBRSxTQUFTLFFBQVEsSUFBSSxLQUFLO0FBRWxDLFFBQUksWUFBWSxTQUFTO0FBQ3hCLFlBQU1BLFdBQVUsSUFBSSxFQUFFLFFBQVEsUUFBVyxRQUFHO0FBQzVDLGdCQUFVLFlBQVlBLFFBQU87QUFDN0I7QUFBQSxJQUNEO0FBRUEsVUFBTSxhQUFhLFFBQVEsT0FBTyxTQUFTLGNBQWMsT0FBTztBQUNoRSxVQUFNLFdBQVcsUUFBUSxPQUFPLFVBQVUsS0FBSyxDQUFBQyxjQUFZQSxVQUFTLGVBQWUsVUFBVTtBQUM3RixRQUFJLENBQUMsVUFBVTtBQUNkLGdCQUFVLGNBQWM7QUFDeEI7QUFBQSxJQUNEO0FBRUEsVUFBTSxXQUFXLFNBQVMsZUFBZSxTQUFTO0FBQ2xELGFBQVMsY0FBYztBQUFBLE1BQ3RCO0FBQUEsTUFDQSxVQUFVLENBQUM7QUFBQSxNQUNYLE9BQU87QUFBQSxNQUNQLHNCQUFzQjtBQUFBLE1BQ3RCLG1CQUFtQjtBQUFBLE1BQ25CLGFBQWE7QUFBQSxNQUNiLFdBQVc7QUFBQSxNQUNYLFNBQVM7QUFBQSxNQUNULFlBQVk7QUFBQSxJQUNiLEdBQUcsR0FBRyxVQUFVLE1BQVM7QUFFekIsUUFBSSxDQUFDLEtBQUssUUFBUSxpQkFBaUI7QUFDbEMsVUFBSSxLQUFLLFNBQVMsU0FBUztBQUFBLElBQzVCO0FBRUEsU0FBSyxhQUFhLElBQUksYUFBYSxNQUFNO0FBQUUsZUFBUyxnQkFBZ0IsUUFBUTtBQUFBLElBQUcsQ0FBQyxDQUFDO0FBRWpGLFFBQUksbUJBQW1CLGtCQUFrQixRQUFRLEtBQUs7QUFDckQsV0FBSyxhQUFhLElBQUksS0FBSyxzQkFBc0IsZUFBZSxjQUFZLDRCQUE0QixVQUFVLFdBQVcsUUFBUSxPQUFPLE1BQU0sRUFBRSxRQUFRLFFBQVEsUUFBUSxLQUFLLFFBQVEsSUFBSyxHQUFHLEtBQUssT0FBTyxLQUFLLFFBQVEsVUFBVSxDQUFDLENBQUM7QUFBQSxJQUN2TztBQUFBLEVBQ0Q7QUFDRDtBQW5FTSxjQUFOO0FBQUEsRUFRRztBQUFBLEdBUkc7QUFxRU4sSUFBTSxXQUFOLGNBQXVCLGdCQUFnQjtBQUFBLEVBSXRDLFlBQ1UsT0FDQSxTQUNBLFNBQ1EsU0FDQSxnQkFDdUIsdUJBQ3ZDO0FBQ0QsVUFBTTtBQVBHO0FBQ0E7QUFDQTtBQUNRO0FBQ0E7QUFDdUI7QUFSekMsU0FBaUIsZUFBZSxJQUFJLGdCQUFnQjtBQUFBLEVBV3BEO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssYUFBYSxRQUFRO0FBQUEsRUFDM0I7QUFBQSxFQUVBLE9BQU8sT0FBaUM7QUFDdkMsUUFBSSxFQUFFLGlCQUFpQixXQUFXO0FBQ2pDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBUSxPQUFPLFFBQVEsS0FBSyxRQUFRLEtBQUssTUFBTSxRQUFRLEdBQUcsS0FDekQsS0FBSyxRQUFRLGtCQUFrQixNQUFNLFFBQVEsaUJBQzdDLEtBQUssUUFBUSxvQkFBb0IsTUFBTSxRQUFRO0FBQUEsRUFFakQ7QUFBQSxFQUVBLE9BQU8sV0FBOEI7QUFFcEMsVUFBTSxRQUFRLEtBQUssUUFBUSxPQUFPLFdBQVcsRUFBRSxlQUFlLEtBQUssZUFBZSxDQUFDO0FBQ25GLFVBQU0sUUFBUSxLQUFLLFFBQVEsS0FBSztBQUFBLE1BQy9CLFVBQVU7QUFBQSxNQUNWLFVBQVUsS0FBSyxRQUFRLFNBQVMsU0FBUyxVQUFVLENBQUMsS0FBSyxRQUFRO0FBQUEsTUFDakUsVUFBVSxLQUFLLFFBQVE7QUFBQSxNQUN2QixpQkFBaUIsRUFBRSxRQUFRLEtBQUssUUFBUSxzQkFBc0IsUUFBUSxNQUFNO0FBQUEsSUFDN0UsQ0FBQztBQUNELGNBQVUsVUFBVSxJQUFJLFNBQVMsS0FBSyxRQUFRLElBQUksRUFBRSxZQUFZLENBQUM7QUFDakUsU0FBSyxhQUFhLElBQUksS0FBSztBQUUzQixTQUFLLGFBQWEsSUFBSSxLQUFLLHNCQUFzQixlQUFlLGNBQVksNEJBQTRCLFVBQVUsV0FBVyxTQUFTLEtBQUssUUFBUSxHQUFHLEdBQUcsS0FBSyxRQUFRLEtBQUssS0FBSyxPQUFPLEtBQUssUUFBUSxVQUFVLENBQUMsQ0FBQztBQUFBLEVBQ2pOO0FBQ0Q7QUEzQ00sV0FBTjtBQUFBLEVBVUc7QUFBQSxHQVZHO0FBOENOLFNBQVMsNEJBQTRCLFVBQTRCLFdBQXdCLE9BQWUsTUFBa0QsT0FBeUIsWUFBa0M7QUFDcE4sUUFBTSx1QkFBdUIsU0FBUyxJQUFJLHFCQUFxQjtBQUUvRCxZQUFVLFlBQVk7QUFFdEIsU0FBTyxJQUFJLElBQUksb0JBQW9CLFdBQVc7QUFBQSxJQUM3QyxhQUFhLFdBQVM7QUFDckIsVUFBSSxDQUFDLE1BQU0sY0FBYztBQUN4QjtBQUFBLE1BQ0Q7QUFHQSxZQUFNLGFBQWEsZ0JBQWdCO0FBRW5DLDJCQUFxQixlQUFlLENBQUFDLGNBQVk7QUFDL0MsWUFBSSxJQUFJLE1BQU0sSUFBSSxHQUFHO0FBQ3BCLDhCQUFvQkEsV0FBVSxDQUFDLElBQUksR0FBRyxLQUFLO0FBQUEsUUFDNUMsT0FBTztBQUNOLDhCQUFvQkEsV0FBVSxDQUFDLEVBQUUsVUFBVSxLQUFLLEtBQUssV0FBVyxLQUFLLE9BQU8sTUFBTSxDQUFDLEdBQUcsS0FBSztBQUUzRixnQ0FBc0IsQ0FBQztBQUFBLFlBQ3RCLE1BQU0sS0FBSyxPQUFPO0FBQUEsWUFDbEIsUUFBUSxLQUFLLElBQUk7QUFBQSxZQUNqQixPQUFPLEtBQUssT0FBTztBQUFBLFlBQ25CLE1BQU0sS0FBSyxPQUFPO0FBQUEsVUFDbkIsQ0FBQyxHQUFHLEtBQUs7QUFBQSxRQUNWO0FBRUEsWUFBSSxjQUFjLE1BQU0sUUFBUSxPQUFPO0FBQ3RDLGdCQUFNLGlCQUFpQix1QkFBdUIsWUFBcUM7QUFDbkYseUJBQWUsUUFBUSxDQUFDLElBQUksd0JBQXdCLEVBQUUsUUFBUSxNQUFNLE9BQU8sT0FBTyxTQUFTLE1BQU0sT0FBTyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEdBQUcsd0JBQXdCLFNBQVM7QUFBQSxRQUN4SjtBQUFBLE1BQ0QsQ0FBQztBQUVELHFCQUFlLE9BQU8sV0FBVyxLQUFLO0FBQUEsSUFDdkM7QUFBQSxFQUNELENBQUM7QUFDRjtBQWlCQSxNQUFNLGdCQUFnQixhQUFhLHdCQUF3QixRQUFRLGNBQWMsU0FBUyxpQkFBaUIsNENBQTRDLENBQUM7QUFFakosSUFBTSxxQkFBTixNQUF5QjtBQUFBLEVBdUQvQixZQUNDLFdBQ2lCLFVBQ0EsY0FDb0Isb0JBQ0MscUJBQ0EscUJBQ0UsdUJBQ0gsb0JBQ04sY0FDRSxnQkFDUSx3QkFDUCxpQkFDRixlQUNULHNCQUNTLGVBQ1gsb0JBQ3BCO0FBZmdCO0FBQ0E7QUFDb0I7QUFDQztBQUNBO0FBQ0U7QUFDSDtBQUNOO0FBQ0U7QUFDUTtBQUNQO0FBQ0Y7QUFFQTtBQTVCakMsU0FBaUIsZUFBZSxJQUFJLGdCQUFnQjtBQUNwRCxTQUFpQix5QkFBeUIsS0FBSyxhQUFhLElBQUksSUFBSSxnQkFBZ0IsQ0FBQztBQUNyRixTQUFpQiwwQkFBMEIsSUFBSSxnQkFBZ0I7QUFFL0QsU0FBaUIsU0FBUyxJQUFJLGtCQUFvQztBQUNsRSxTQUFRLDRCQUE0QjtBQUtwQyxTQUFpQix5QkFBeUIsS0FBSyxhQUFhLElBQUksSUFBSSxRQUFjLENBQUM7QUFxQmxGLFNBQUssVUFBVSxTQUFTLGNBQWMsS0FBSztBQUMzQyxTQUFLLFFBQVEsVUFBVSxJQUFJLHFCQUFxQjtBQUNoRCxTQUFLLFFBQVEsVUFBVSxPQUFPLG9CQUFvQixDQUFDLENBQUMsU0FBUyxvQkFBb0I7QUFDakYsUUFBSSxPQUFPLFdBQVcsS0FBSyxPQUFPO0FBRWxDLFNBQUssa0JBQWtCLGtCQUFrQixhQUFhLE9BQU8sb0JBQW9CO0FBQ2pGLFNBQUssZUFBZSxrQkFBa0IsTUFBTSxPQUFPLG9CQUFvQjtBQUN2RSxTQUFLLG9CQUFvQixrQkFBa0IsZUFBZSxPQUFPLG9CQUFvQjtBQUNyRixTQUFLLDBCQUEwQixrQkFBa0IscUJBQXFCLE9BQU8sb0JBQW9CO0FBQ2pHLFNBQUssOEJBQThCLGtCQUFrQix5QkFBeUIsT0FBTyxvQkFBb0I7QUFFekcsU0FBSyxVQUFVLEtBQUssc0JBQXNCLGVBQWUsZ0JBQWdCLHdCQUF3QjtBQUVqRyxVQUFNLFNBQVMsS0FBSyx3QkFBd0IsU0FBUyxLQUFLO0FBQzFELFVBQU0sU0FBUyxTQUFTLGdCQUFnQjtBQUN4QyxVQUFNLGFBQWEsS0FBSyw2QkFBNkIsU0FBUyxLQUFLO0FBRW5FLFNBQUssVUFBVSxJQUFJO0FBQUEsTUFDbEIsS0FBSztBQUFBLE1BQ0wsbUJBQW1CLGdCQUFnQixNQUFNO0FBQUEsTUFDekMsbUJBQW1CLHFCQUFxQixVQUFVO0FBQUEsTUFDbEQ7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUNBLFNBQUssUUFBUSxnQkFBZ0IsS0FBSyxnQkFBZ0IsTUFBTSxLQUFLLFlBQVk7QUFDekUsU0FBSyxRQUFRLGVBQWUsS0FBSyxlQUFlLE1BQU0sS0FBSyxZQUFZO0FBQ3ZFLFNBQUssUUFBUSxpQkFBaUIsS0FBSyw0QkFBNEIsTUFBTSxLQUFLLFlBQVk7QUFFdEYsUUFBSSxLQUFLLFNBQVMsc0JBQXNCO0FBQ3ZDLFdBQUssYUFBYSxJQUFJLEtBQUssa0JBQWtCLFlBQVksTUFBTSxLQUFLLHlCQUF5QixDQUFDLENBQUM7QUFBQSxJQUNoRztBQUVBLFNBQUsseUJBQXlCLG1CQUFtQix1QkFBdUIsT0FBTyxLQUFLLGtCQUFrQjtBQUN0RyxTQUFLLHdCQUF3QixtQkFBbUIsc0JBQXNCLE9BQU8sS0FBSyxrQkFBa0I7QUFDcEcsU0FBSyx1QkFBdUIsbUJBQW1CLHFCQUFxQixPQUFPLEtBQUssa0JBQWtCO0FBQ2xHLFNBQUssMkJBQTJCLG1CQUFtQix5QkFBeUIsT0FBTyxLQUFLLGtCQUFrQjtBQUUxRyxTQUFLLGlCQUFpQix3QkFBd0IsT0FBTztBQUVyRCxTQUFLLGFBQWEsSUFBSSxtQkFBbUIsU0FBUyxLQUFLLGFBQWEsSUFBSSxLQUFLLE9BQU8sQ0FBQztBQUNyRixTQUFLLEtBQUs7QUFBQSxFQUNYO0FBQUEsRUE3REEsSUFBSSx3QkFBd0I7QUFBRSxXQUFPLEtBQUssdUJBQXVCO0FBQUEsRUFBTztBQUFBLEVBK0R4RSxVQUFnQjtBQUNmLFNBQUssYUFBYSxRQUFRO0FBQzFCLFNBQUssd0JBQXdCLFFBQVE7QUFDckMsU0FBSyxPQUFPLFFBQVE7QUFDcEIsU0FBSyx1QkFBdUIsTUFBTTtBQUNsQyxTQUFLLHNCQUFzQixNQUFNO0FBQ2pDLFNBQUsscUJBQXFCLE1BQU07QUFDaEMsU0FBSyx5QkFBeUIsTUFBTTtBQUNwQyxTQUFLLGdCQUFnQixRQUFRO0FBQzdCLFNBQUssYUFBYSxRQUFRO0FBQzFCLFNBQUssa0JBQWtCLFFBQVE7QUFDL0IsU0FBSyx3QkFBd0IsUUFBUTtBQUNyQyxTQUFLLDRCQUE0QixRQUFRO0FBQ3pDLFNBQUssUUFBUSxRQUFRO0FBQ3JCLFNBQUssUUFBUSxRQUFRO0FBQ3JCLFNBQUssUUFBUSxPQUFPO0FBQUEsRUFDckI7QUFBQSxFQUVBLElBQUksUUFBc0M7QUFDekMsV0FBTyxLQUFLLE9BQU87QUFBQSxFQUNwQjtBQUFBLEVBRUEsT0FBTyxLQUFzQztBQUM1QyxRQUFJLEtBQUs7QUFDUixXQUFLLHVCQUF1QjtBQUFBLElBQzdCO0FBR0EsUUFBSSxPQUFPLEtBQUssaUJBQWlCO0FBQ2hDLFlBQU0sa0JBQWtCLEtBQUssZ0JBQWdCO0FBQzdDLFlBQU0sSUFBSSxJQUFJLFVBQVUsS0FBSyxJQUFJLEdBQUcsSUFBSSxRQUFRLGVBQWUsR0FBRyxJQUFJLE1BQU07QUFBQSxJQUM3RTtBQUNBLFNBQUssUUFBUSxPQUFPLEdBQUc7QUFBQSxFQUN4QjtBQUFBLEVBRUEsV0FBb0I7QUFDbkIsV0FBTyxLQUFLLFFBQVEsVUFBVSxTQUFTLFFBQVE7QUFBQSxFQUNoRDtBQUFBLEVBRUEsT0FBYTtBQUNaLFVBQU0sWUFBWSxLQUFLLFNBQVM7QUFFaEMsU0FBSyx3QkFBd0IsTUFBTTtBQUNuQyxTQUFLLHNCQUFzQixJQUFJLEtBQUs7QUFDcEMsU0FBSyx5QkFBeUIsSUFBSSxLQUFLO0FBQ3ZDLFNBQUssUUFBUSxVQUFVLE9BQU8sVUFBVSxJQUFJO0FBQzVDLFNBQUssdUJBQXVCO0FBRTVCLFFBQUksQ0FBQyxXQUFXO0FBQ2YsV0FBSyx1QkFBdUIsS0FBSztBQUFBLElBQ2xDO0FBQUEsRUFDRDtBQUFBLEVBRVEsT0FBYTtBQUNwQixVQUFNLFlBQVksS0FBSyxTQUFTO0FBRWhDLFNBQUssc0JBQXNCLElBQUksSUFBSTtBQUNuQyxTQUFLLFFBQVEsVUFBVSxPQUFPLFVBQVUsS0FBSztBQUU3QyxRQUFJLFdBQVc7QUFDZCxXQUFLLHVCQUF1QixLQUFLO0FBQUEsSUFDbEM7QUFBQSxFQUNEO0FBQUEsRUFFQSxhQUFtQjtBQUNsQixTQUFLLFFBQVEsV0FBVztBQUFBLEVBQ3pCO0FBQUEsRUFFQSxTQUFrQjtBQUNqQixTQUFLLHdCQUF3QixNQUFNO0FBR25DLFVBQU0sTUFBTSx1QkFBdUIsZ0JBQWdCLEtBQUssYUFBYSxjQUFjLEVBQUUsbUJBQW1CLGlCQUFpQixRQUFRLENBQUM7QUFDbEksVUFBTSxZQUFZLEtBQUssU0FBUztBQUVoQyxRQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssYUFBYSxZQUFZLEdBQUcsR0FBRztBQUdoRCxXQUFLLHVCQUF1QixJQUFJLEtBQUs7QUFDckMsV0FBSyx5QkFBeUIsSUFBSSxLQUFLO0FBQ3ZDLFVBQUksQ0FBQyxXQUFXO0FBQ2YsYUFBSyxLQUFLO0FBQ1YsZUFBTztBQUFBLE1BQ1IsT0FBTztBQUNOLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUdBLFVBQU0sY0FBYyx1QkFBdUIsZUFBZSxLQUFLLGFBQWEsY0FBYyxFQUFFLG1CQUFtQixpQkFBaUIsUUFBUSxDQUFDO0FBRXpJLFNBQUssS0FBSztBQUNWLFNBQUssdUJBQXVCLElBQUksSUFBSTtBQUNwQyxTQUFLLHlCQUF5QjtBQUU5QixVQUFNLFFBQVEsS0FBSyxzQkFBc0I7QUFBQSxNQUFlO0FBQUEsTUFDdkQsZUFBZTtBQUFBLE1BQ2YsS0FBSyxhQUFhO0FBQUEsSUFDbkI7QUFDQSxTQUFLLE9BQU8sUUFBUTtBQUVwQixTQUFLLFFBQVEsVUFBVSxPQUFPLGtCQUFrQixLQUFLLGNBQWMsYUFBYSxJQUFJLFFBQVEsSUFBSSxTQUFTLE1BQU0sSUFBSTtBQUVuSCxVQUFNLG9CQUFvQixNQUFNO0FBQy9CLFdBQUssUUFBUSxVQUFVLE9BQU8saUJBQWlCLE1BQU0sV0FBVyxDQUFDO0FBQ2pFLFlBQU0sWUFBWSxLQUFLLGFBQWEsU0FBUztBQUM3QyxZQUFNLFVBQXNDO0FBQUEsUUFDM0MsR0FBRyxLQUFLO0FBQUEsUUFDUixlQUFlLEtBQUssU0FBUyxpQkFBaUI7QUFBQSxRQUM5QyxpQkFBaUIsS0FBSyxTQUFTLG1CQUFtQjtBQUFBLE1BQ25EO0FBQ0EsWUFBTSxXQUFXLE1BQU0sWUFBWTtBQUNuQyxXQUFLLHlCQUF5QixJQUFJLFNBQVMsS0FBSyxhQUFXLEVBQUUsbUJBQW1CLFlBQVksQ0FBQztBQUM3RixZQUFNLFFBQVEsU0FBUyxJQUFJLGFBQVcsbUJBQW1CLGNBQ3RELEtBQUssc0JBQXNCLGVBQWUsVUFBVSxPQUFPLFNBQVMsU0FBUyxLQUFLLFNBQVMsS0FBSyxjQUFjLElBQzlHLEtBQUssc0JBQXNCLGVBQWUsYUFBYSxPQUFPLFNBQVMsT0FBTyxDQUFDO0FBQ2xGLFVBQUksTUFBTSxXQUFXLEdBQUc7QUFDdkIsYUFBSyxRQUFRLFdBQVcsS0FBSztBQUM3QixhQUFLLFFBQVEsU0FBUyxDQUFDLElBQUksY0FBYyxnQkFBZ0I7QUFBQSxVQUN4RCxPQUFPLFdBQThCO0FBQ3BDLHNCQUFVLGNBQWMsU0FBUyxTQUFTLGFBQWE7QUFBQSxVQUN4RDtBQUFBLFVBQ0EsT0FBTyxPQUFpQztBQUN2QyxtQkFBTyxVQUFVO0FBQUEsVUFDbEI7QUFBQSxVQUNBLFVBQWdCO0FBQUEsVUFFaEI7QUFBQSxRQUNELEdBQUMsQ0FBQztBQUFBLE1BQ0gsT0FBTztBQUNOLGFBQUssUUFBUSxXQUFXLElBQUk7QUFDNUIsYUFBSyxRQUFRLFNBQVMsS0FBSztBQUMzQixhQUFLLFFBQVEsT0FBTyxNQUFNLE1BQU0sU0FBUyxDQUFDLENBQUM7QUFBQSxNQUM1QztBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVcsTUFBTSxZQUFZLGlCQUFpQjtBQUNwRCxVQUFNLGlCQUFpQixLQUFLLGFBQWEsWUFBWSxpQkFBaUI7QUFDdEUsc0JBQWtCO0FBQ2xCLFNBQUssd0JBQXdCLE1BQU07QUFDbkMsU0FBSyx3QkFBd0IsSUFBSSxRQUFRO0FBQ3pDLFNBQUssd0JBQXdCLElBQUksYUFBYSxNQUFNLEtBQUssT0FBTyxNQUFNLENBQUMsQ0FBQztBQUN4RSxTQUFLLHdCQUF3QixJQUFJLGNBQWM7QUFDL0MsU0FBSyx3QkFBd0IsSUFBSSxhQUFhLE1BQU0sS0FBSyxRQUFRLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUU5RSxVQUFNLHdCQUF3QixNQUFNO0FBQ25DLFlBQU0sU0FBUyxLQUFLLHdCQUF3QixTQUFTLEtBQUs7QUFDMUQsWUFBTSxhQUFhLEtBQUssNkJBQTZCLFNBQVMsS0FBSztBQUVuRSxXQUFLLFFBQVEsMkJBQTJCLG1CQUFtQixnQkFBZ0IsTUFBTSxDQUFDO0FBQ2xGLFdBQUssUUFBUSxpQ0FBaUMsbUJBQW1CLHFCQUFxQixVQUFVLENBQUM7QUFBQSxJQUNsRztBQUNBLDBCQUFzQjtBQUN0QixVQUFNLDhCQUE4QixLQUFLLHdCQUF3QixZQUFZLHFCQUFxQjtBQUNsRyxVQUFNLG9DQUFvQyxLQUFLLDRCQUE0QixZQUFZLHFCQUFxQjtBQUM1RyxTQUFLLHdCQUF3QixJQUFJLDJCQUEyQjtBQUM1RCxTQUFLLHdCQUF3QixJQUFJLGlDQUFpQztBQUdsRSxTQUFLLHdCQUF3QixJQUFJO0FBQUEsTUFDaEMsU0FBUyxNQUFNO0FBQ2QsWUFBSSxLQUFLLDJCQUEyQjtBQUNuQyxlQUFLLG9CQUFvQixnQkFBZ0IsRUFBRSxRQUFRLEtBQUssQ0FBQztBQUFBLFFBQzFEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sY0FBYyxLQUFLLFNBQVM7QUFBQSxFQUNwQztBQUFBLEVBRVEsMkJBQWlDO0FBQ3hDLFVBQU0sZ0JBQWdCLEtBQUssaUJBQWlCLGVBQWU7QUFFM0QsVUFBTSxZQUFhLEtBQUssU0FBUyx3QkFBd0IsS0FBSyxrQkFBa0IsU0FBUyxJQUFLLHdCQUF3QixLQUFLLGFBQWEsY0FBYyxLQUFLLHNCQUFzQixJQUFJO0FBQ3JMLFVBQU0sMEJBQTBCLFlBQVksS0FBSyx1QkFBdUIsMkJBQTJCLFVBQVUsVUFBVSxVQUFVLFlBQVksSUFBSTtBQUNqSixRQUFJLENBQUMsYUFBYSxDQUFDLDRCQUE0QixXQUFXLHVCQUF1QixHQUFHO0FBQ25GLFdBQUssdUJBQXVCO0FBQUEsSUFDN0IsT0FBTztBQUNOLFlBQU0sRUFBRSxPQUFPLGlCQUFpQixPQUFPLGdCQUFnQixJQUFJLEtBQUsseUJBQXlCO0FBQ3pGLFlBQU0sVUFBVSxVQUFVLFFBQVEsS0FBSyxZQUFVLE9BQU8sT0FBTyxVQUFVLFNBQVM7QUFDbEYsWUFBTSxRQUFRLFVBQVUsdUJBQXVCLFNBQVMsVUFBVSxZQUFZLElBQUksVUFBVTtBQUM1RixzQkFBZ0IsY0FBYztBQUM5QixzQkFBZ0IsT0FBTyxTQUFTLG9CQUFvQixlQUFlLEtBQUssQ0FBQztBQUFBLElBQzFFO0FBS0EsVUFBTSxlQUFlLEtBQUssaUJBQWlCLGVBQWU7QUFDMUQsUUFBSSxLQUFLLHdCQUF3QixpQkFBaUIsZUFBZTtBQUNoRSxXQUFLLE9BQU8sS0FBSyxvQkFBb0I7QUFBQSxJQUN0QztBQUFBLEVBQ0Q7QUFBQSxFQUVRLDJCQUE2RTtBQUNwRixRQUFJLEtBQUssbUJBQW1CLEtBQUssb0JBQW9CLEtBQUssa0JBQWtCO0FBQzNFLGFBQU8sRUFBRSxPQUFPLEtBQUssa0JBQWtCLE9BQU8sS0FBSyxpQkFBaUI7QUFBQSxJQUNyRTtBQUVBLFNBQUssa0JBQWtCLFNBQVMsY0FBYyxLQUFLO0FBQ25ELFNBQUssZ0JBQWdCLFVBQVUsSUFBSSx5QkFBeUI7QUFDNUQsU0FBSyxnQkFBZ0IsYUFBYSxRQUFRLFFBQVE7QUFDbEQsU0FBSyxtQkFBbUIsU0FBUyxjQUFjLE1BQU07QUFDckQsU0FBSyxpQkFBaUIsVUFBVSxJQUFJLE9BQU87QUFDM0MsU0FBSyxnQkFBZ0IsWUFBWSxLQUFLLGdCQUFnQjtBQUN0RCxVQUFNLG9CQUFvQixTQUFTLGNBQWMsTUFBTTtBQUN2RCxzQkFBa0IsVUFBVSxJQUFJLEdBQUcsVUFBVSxpQkFBaUIsUUFBUSxXQUFXLENBQUM7QUFDbEYsU0FBSyxnQkFBZ0IsWUFBWSxpQkFBaUI7QUFDbEQsUUFBSSxPQUFPLEtBQUssU0FBUyxLQUFLLGVBQWU7QUFDN0MsU0FBSyxtQkFBbUIsS0FBSyx1QkFBdUIsSUFBSSxLQUFLLGNBQWMsa0JBQWtCLHdCQUF3QixPQUFPLEdBQUcsS0FBSyxpQkFBaUIsRUFBRSxDQUFDO0FBQ3hKLFNBQUssdUJBQXVCLElBQUksSUFBSSxzQkFBc0IsS0FBSyxpQkFBaUIsSUFBSSxVQUFVLE9BQU8sT0FBSztBQUN6RyxVQUFJLFlBQVksS0FBSyxHQUFHLElBQUk7QUFDNUIsV0FBSyxzQkFBc0I7QUFBQSxJQUM1QixDQUFDLENBQUM7QUFDRixXQUFPLEVBQUUsT0FBTyxLQUFLLGtCQUFrQixPQUFPLEtBQUssaUJBQWlCO0FBQUEsRUFDckU7QUFBQSxFQUVRLHlCQUErQjtBQUN0QyxTQUFLLHVCQUF1QixNQUFNO0FBQ2xDLFNBQUssaUJBQWlCLE9BQU87QUFDN0IsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyxtQkFBbUI7QUFDeEIsU0FBSyxtQkFBbUI7QUFBQSxFQUN6QjtBQUFBLEVBRVEsd0JBQThCO0FBQ3JDLFVBQU0saUJBQWlCLEtBQUs7QUFDNUIsUUFBSSxDQUFDLGdCQUFnQjtBQUNwQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFlBQVksd0JBQXdCLEtBQUssYUFBYSxjQUFjLEtBQUssc0JBQXNCO0FBQ3JHLFFBQUksQ0FBQyxXQUFXO0FBQ2Y7QUFBQSxJQUNEO0FBQ0EsVUFBTSxVQUFVLHdCQUF3QixXQUFXLEtBQUssd0JBQXdCLEtBQUssaUJBQWlCLEtBQUssY0FBYztBQUN6SCxTQUFLLG9CQUFvQixnQkFBZ0I7QUFBQSxNQUN4QyxXQUFXLE1BQU07QUFBQSxNQUNqQixZQUFZLE1BQU07QUFBQSxJQUNuQixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRVEsY0FBYyxPQUFvQztBQUN6RCxRQUFJLE1BQU0sUUFBUSxLQUFLLDJCQUEyQjtBQUNqRCxXQUFLLG1DQUFtQztBQUN4QyxXQUFLLFFBQVEsYUFBYSxNQUFNLElBQUk7QUFBQSxJQUNyQztBQUFBLEVBQ0Q7QUFBQSxFQUVRLGVBQWUsT0FBb0M7QUFDMUQsUUFBSSxDQUFDLE1BQU0sTUFBTTtBQUNoQjtBQUFBLElBQ0Q7QUFFQSxRQUFJLE1BQU0sU0FBUyxLQUFLLGtDQUFrQztBQUN6RCxXQUFLLG1DQUFtQztBQUN4QyxXQUFLLFFBQVEsV0FBVyxNQUFTO0FBQ2pDLFdBQUssUUFBUSxhQUFhLE1BQVM7QUFDbkM7QUFBQSxJQUNEO0FBRUEsVUFBTSxFQUFFLFFBQVEsSUFBSSxNQUFNO0FBQzFCLFNBQUssYUFBYSxNQUFNO0FBRXhCLFVBQU0sUUFBUSxLQUFLLGdCQUFnQixNQUFNLE9BQU87QUFDaEQsUUFBSSxVQUFVLFFBQVc7QUFFeEIsV0FBSyxRQUFRLFdBQVcsTUFBUztBQUNqQyxXQUFLLFFBQVEsYUFBYSxNQUFTO0FBQ25DLFdBQUssZ0JBQWdCLE9BQU8sU0FBUyxLQUFLO0FBQzFDO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxnQkFBZ0IsU0FBUyxHQUFHO0FBRXBDLFdBQUssUUFBUSxXQUFXLE1BQVM7QUFDakMsV0FBSyxRQUFRLGFBQWEsTUFBUztBQUNuQyxXQUFLLG1CQUFtQixZQUFZLEtBQUssbUJBQW1CLGtCQUFrQixNQUFNLEVBQUU7QUFDdEY7QUFBQSxJQUNEO0FBR0EsUUFBSTtBQUNKLFFBQUk7QUFJSixTQUFLLG9CQUFvQixnQkFBZ0I7QUFBQSxNQUN4QyxRQUFRLENBQUMsV0FBd0I7QUFDaEMsWUFBSSxNQUFNLGdCQUFnQixVQUFVO0FBQ25DLG1CQUFTLEtBQUssc0JBQXNCLGVBQWUsdUJBQXVCLFFBQVEsTUFBTSxLQUFLLE1BQU0sUUFBUTtBQUFBLFFBQzVHLFdBQVcsTUFBTSxnQkFBZ0IsYUFBYTtBQUM3QyxtQkFBUyxLQUFLLHNCQUFzQixlQUFlLDBCQUEwQixRQUFRLE1BQU0sS0FBSyxNQUFNLFFBQVE7QUFBQSxRQUMvRztBQUVBLGNBQU0saUJBQWlCLE9BQU8sa0JBQWtCLE1BQU0sS0FBSyxvQkFBb0IsZ0JBQWdCLEVBQUUsUUFBUSxNQUFNLFNBQVMsS0FBSyxDQUFDLENBQUM7QUFDL0gsY0FBTSxlQUFlLFdBQVcsWUFBWSxJQUFJLFVBQVUsS0FBSyxPQUFPLENBQUMsRUFBRSxZQUFZLE1BQU0sS0FBSyxvQkFBb0IsZ0JBQWdCLEVBQUUsUUFBUSxLQUFLLENBQUMsQ0FBQztBQUVySixjQUFNLGVBQWUsSUFBSSxXQUFXLE1BQU07QUFDMUMsY0FBTSxlQUFlLGFBQWEsVUFBVSxNQUFNO0FBQ2pELGVBQUssbUNBQW1DLEtBQUssUUFBUSxhQUFhLElBQUksTUFBTSxPQUFPO0FBQ25GLGVBQUssb0JBQW9CLGdCQUFnQixFQUFFLFFBQVEsS0FBSyxDQUFDO0FBQUEsUUFDMUQsQ0FBQztBQUVELGFBQUssNEJBQTRCO0FBQ2pDLGFBQUssMkJBQTJCO0FBRWhDLGVBQU87QUFBQSxVQUNOO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsTUFDQSxXQUFXLE1BQU07QUFDaEIsWUFBSSxDQUFDLGNBQWM7QUFDbEIsZ0JBQU0sU0FBUyxJQUFJLFVBQVUsS0FBSyxPQUFPO0FBQ3pDLGdCQUFNLGdCQUFnQixPQUFPLGFBQWE7QUFDMUMsY0FBSSxZQUFZLEtBQUssSUFBSSxPQUFPLGNBQWMsS0FBSyxHQUFHO0FBRXRELGdCQUFNLGNBQWMsS0FBSyxJQUFJLGVBQWUsS0FBSyxJQUFJLEtBQUssZ0JBQWdCLElBQUksQ0FBQztBQUMvRSxnQkFBTSxrQkFBa0I7QUFDeEIsY0FBSTtBQUVKLGdCQUFNLE9BQU8sSUFBSSx1QkFBdUIsTUFBTSxJQUFJO0FBQ2xELGdCQUFNLElBQUksS0FBSyxNQUFNLEtBQUssU0FBUztBQUNuQyxjQUFJLElBQUksYUFBYSxPQUFPLGFBQWE7QUFDeEMsd0JBQVksT0FBTyxjQUFjLElBQUk7QUFBQSxVQUN0QztBQUNBLGNBQUksSUFBSSxLQUFLO0FBQ2IsY0FBSSxJQUFJLGVBQWUsZUFBZTtBQUNyQyxnQkFBSSxnQkFBZ0I7QUFBQSxVQUNyQjtBQUNBLGNBQUksTUFBTSxtQkFBbUIsb0JBQW9CO0FBQ2hELGtCQUFNLHVCQUF1QixjQUFjLElBQUk7QUFDL0MsZ0NBQW9CLE1BQU0sUUFBUSxPQUFPO0FBQ3pDLGdCQUFJLG9CQUFvQixzQkFBc0I7QUFDN0Msa0JBQUksS0FBSyxJQUFJLGdCQUFnQixhQUFhLElBQUksb0JBQW9CLG9CQUFvQjtBQUN0RixrQ0FBb0I7QUFBQSxZQUNyQjtBQUFBLFVBQ0QsT0FBTztBQUNOLGdDQUFxQixLQUFLLE9BQVEsS0FBSyxRQUFRLE1BQVE7QUFBQSxVQUN4RDtBQUNBLGlCQUFPLEtBQUssU0FBUyxXQUFXLGFBQWEsaUJBQWlCLEtBQUssSUFBSSxHQUFHLGlCQUFpQixDQUFDO0FBQzVGLHlCQUFlLEVBQUUsR0FBRyxFQUFFO0FBQUEsUUFDdkI7QUFDQSxlQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ0EsUUFBUSxDQUFDLFNBQXFCO0FBQzdCLFlBQUksQ0FBQyxNQUFNLFNBQVM7QUFDbkIsaUJBQU8saUJBQWlCO0FBQUEsUUFDekI7QUFDQSxhQUFLLDRCQUE0QjtBQUNqQyxhQUFLLDJCQUEyQjtBQUNoQyxZQUFJLE1BQU0sV0FBVyxNQUFNO0FBQzFCLGVBQUssUUFBUSxXQUFXLE1BQVM7QUFDakMsZUFBSyxRQUFRLGFBQWEsTUFBUztBQUFBLFFBQ3BDO0FBQ0EsZUFBTyxRQUFRO0FBQUEsTUFDaEI7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSw2QkFBbUM7QUFDMUMsVUFBTSxRQUFRLEtBQUssUUFBUSxhQUFhLEtBQUssS0FBSztBQUNsRCxTQUFLLHFCQUFxQixJQUFJLEtBQUs7QUFBQSxFQUNwQztBQUFBLEVBRUEsTUFBYyxnQkFBZ0IsT0FBOEIsU0FBd0MsT0FBd0QsU0FBa0IsT0FBc0I7QUFFbk0sUUFBSSxtQkFBbUIsYUFBYTtBQUNuQyxVQUFJLFFBQVEsU0FBUyxTQUFTLE1BQU07QUFDbkMsY0FBTSxLQUFLLGVBQWUsV0FBVyxFQUFFLFVBQVUsUUFBUSxLQUFLLFNBQVMsRUFBRSxPQUFPLEVBQUUsR0FBRyxLQUFLO0FBQUEsTUFDM0YsT0FBTztBQUVOLGNBQU0sUUFBUSxLQUFLLFFBQVEsU0FBUztBQUNwQyxjQUFNLE1BQU0sTUFBTSxRQUFRLE1BQU0sSUFBSTtBQUNwQyxhQUFLLFFBQVEsV0FBVyxNQUFNLE1BQU0sQ0FBQyxDQUFDO0FBQ3RDLGFBQUssUUFBUSxhQUFhLE1BQU0sTUFBTSxDQUFDLEdBQUcsbUJBQW1CLFlBQVk7QUFBQSxNQUMxRTtBQUFBLElBQ0QsT0FBTztBQUNOLGNBQVEsUUFBUSxPQUFPLFNBQVMsRUFBRSxPQUFPLEdBQUcsVUFBVSxZQUFZLEtBQUs7QUFBQSxJQUN4RTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLGdCQUFnQixNQUFnRTtBQUN2RixRQUFJLFNBQVMsbUJBQW1CLHFCQUFxQjtBQUNwRCxhQUFPO0FBQUEsSUFDUixXQUFXLFNBQVMsbUJBQW1CLGdCQUFnQjtBQUN0RCxhQUFPO0FBQUEsSUFDUixPQUFPO0FBQ04sYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0Q7QUE3ZmEsbUJBRUksU0FBUztBQUZiLG1CQUlZLGtCQUFrQjtBQUFBLEVBQ3pDLFNBQVM7QUFBQSxFQUNULE9BQU87QUFDUjtBQVBZLG1CQVNZLHVCQUF1QjtBQUFBLEVBQzlDLE1BQU0sb0JBQW9CO0FBQUEsRUFDMUIsU0FBUyxvQkFBb0I7QUFBQSxFQUM3QixRQUFRLG9CQUFvQjtBQUM3QjtBQWJZLG1CQWVJLGlCQUFpQixDQUFDO0FBZnRCLG1CQWdCSSxzQkFBc0IsQ0FBQztBQWhCM0IsbUJBaUJJLGVBQWUsQ0FBQztBQWpCcEIsbUJBbUJJLHlCQUF5QixJQUFJLGNBQWMsdUJBQXVCLE9BQU8sU0FBUyx1QkFBdUIseUNBQXlDLENBQUM7QUFuQnZKLG1CQW9CSSx3QkFBd0IsSUFBSSxjQUFjLHNCQUFzQixPQUFPLFNBQVMsc0JBQXNCLDJDQUEyQyxDQUFDO0FBcEJ0SixtQkFxQkksdUJBQXVCLElBQUksY0FBYyxxQkFBcUIsT0FBTyxTQUFTLHFCQUFxQixnQ0FBZ0MsQ0FBQztBQXJCeEksbUJBc0JJLDJCQUEyQixJQUFJLGNBQWMseUJBQXlCLE9BQU8sU0FBUyx5QkFBeUIsMENBQTBDLENBQUM7QUF0QjlKLHFCQUFOO0FBQUEsRUEyREo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXZFVTtBQStmTixJQUFNLDRCQUFOLE1BQWdDO0FBQUEsRUFjdEMsWUFDa0IsWUFDQSxjQUNBLFVBQ00sc0JBQ2lCLHVCQUMxQixhQUNiO0FBTmdCO0FBQ0E7QUFDQTtBQUV1QjtBQWpCekMsU0FBaUIsZUFBZSxJQUFJLGdCQUFnQjtBQUNwRCxTQUFpQixzQkFBc0IsSUFBSSxnQkFBZ0I7QUFLM0QsU0FBaUIseUJBQXlCLEtBQUssYUFBYSxJQUFJLElBQUksUUFBYyxDQUFDO0FBR25GLFNBQWlCLHlCQUF5QixLQUFLLGFBQWEsSUFBSSxJQUFJLFFBQWMsQ0FBQztBQVdsRixVQUFNLFNBQVMsS0FBSyxhQUFhLElBQUksa0JBQWtCLFVBQVUsT0FBTyxvQkFBb0IsQ0FBQztBQUM3RixTQUFLLGFBQWEsSUFBSSxPQUFPLFlBQVksTUFBTTtBQUM5QyxZQUFNLFFBQVEsT0FBTyxTQUFTO0FBQzlCLFVBQUksQ0FBQyxTQUFTLEtBQUssVUFBVTtBQUM1QixhQUFLLG9CQUFvQixNQUFNO0FBQy9CLGFBQUssV0FBVztBQUNoQixhQUFLLHVCQUF1QixLQUFLO0FBQUEsTUFDbEMsV0FBVyxTQUFTLENBQUMsS0FBSyxVQUFVO0FBQ25DLGFBQUssV0FBVyxLQUFLLGNBQWM7QUFDbkMsYUFBSyxTQUFTLE9BQU87QUFDckIsYUFBSyx1QkFBdUIsS0FBSztBQUFBLE1BQ2xDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixRQUFJLE9BQU8sU0FBUyxHQUFHO0FBQ3RCLFdBQUssV0FBVyxLQUFLLGNBQWM7QUFBQSxJQUNwQztBQUVBLFNBQUssYUFBYSxJQUFJLFlBQVksMkNBQTJDLE9BQUs7QUFDakYsVUFBSSxLQUFLLFVBQVUsU0FBUyxLQUFLLFNBQVMsTUFBTSxTQUFTLFdBQVcsRUFBRSxRQUFRO0FBRTdFO0FBQUEsTUFDRDtBQUNBLFVBQUksS0FBSyxVQUFVLE9BQU8sR0FBRztBQUM1QixhQUFLLHVCQUF1QixLQUFLO0FBQUEsTUFDbEM7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQTNDQSxJQUFJLFVBQVU7QUFBRSxXQUFPLEtBQUs7QUFBQSxFQUFVO0FBQUEsRUFHdEMsSUFBSSx3QkFBd0I7QUFBRSxXQUFPLEtBQUssdUJBQXVCO0FBQUEsRUFBTztBQUFBLEVBR3hFLElBQUksd0JBQXdCO0FBQUUsV0FBTyxLQUFLLHVCQUF1QjtBQUFBLEVBQU87QUFBQSxFQXVDaEUsZ0JBQW9DO0FBQzNDLFVBQU0sVUFBVSxLQUFLLG9CQUFvQixJQUFJLEtBQUssc0JBQXNCLGVBQWUsb0JBQW9CLEtBQUssWUFBWSxLQUFLLFVBQVUsS0FBSyxZQUFZLENBQUM7QUFDN0osU0FBSyxvQkFBb0IsSUFBSSxRQUFRLHNCQUFzQixNQUFNLEtBQUssdUJBQXVCLEtBQUssQ0FBQyxDQUFDO0FBRXBHLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssYUFBYSxRQUFRO0FBQzFCLFNBQUssb0JBQW9CLFFBQVE7QUFBQSxFQUNsQztBQUNEO0FBOURhLDRCQUFOO0FBQUEsRUFrQko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBcEJVO0FBbUViLGdCQUFnQixNQUFNLHlCQUF5QixRQUFRO0FBQUEsRUFFdEQsY0FBYztBQUNiLFVBQU07QUFBQSxNQUNMLElBQUk7QUFBQSxNQUNKLE9BQU8sVUFBVSxjQUFjLG9CQUFvQjtBQUFBLE1BQ25ELFlBQVksVUFBVSxvQkFBb0IsYUFBYTtBQUFBLE1BQ3ZELFVBQVUsV0FBVztBQUFBLE1BQ3JCLFNBQVM7QUFBQSxRQUNSLFdBQVcsZUFBZSxPQUFPLDhCQUE4QixJQUFJO0FBQUEsUUFDbkUsT0FBTyxTQUFTLGVBQWUsYUFBYTtBQUFBLFFBQzVDLGVBQWUsU0FBUyxFQUFFLEtBQUssa0JBQWtCLFNBQVMsQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLGVBQWU7QUFBQSxNQUN2RztBQUFBLE1BQ0EsTUFBTTtBQUFBLFFBQ0wsRUFBRSxJQUFJLE9BQU8sZUFBZTtBQUFBLFFBQzVCLEVBQUUsSUFBSSxPQUFPLHVCQUF1QixPQUFPLFlBQVksT0FBTyxFQUFFO0FBQUEsUUFDaEUsRUFBRSxJQUFJLE9BQU8saUJBQWlCLE9BQU8sa0JBQWtCLE9BQU8sRUFBRTtBQUFBLFFBQ2hFLEVBQUUsSUFBSSxPQUFPLG9CQUFvQjtBQUFBLFFBQ2pDLEVBQUUsSUFBSSxPQUFPLDZCQUE2QixPQUFPLGdCQUFnQixPQUFPLEVBQUU7QUFBQSxRQUMxRSxFQUFFLElBQUksT0FBTyx3QkFBd0IsT0FBTyxnQkFBZ0IsT0FBTyxFQUFFO0FBQUEsTUFDdEU7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxJQUFJLFVBQWtDO0FBQ3JDLFVBQU0sU0FBUyxTQUFTLElBQUkscUJBQXFCO0FBQ2pELFVBQU0sb0JBQW9CLGtCQUFrQixVQUFVLE9BQU8sTUFBTTtBQUNuRSxVQUFNLFFBQVEsa0JBQWtCLFNBQVM7QUFDekMsc0JBQWtCLFlBQVksQ0FBQyxLQUFLO0FBQ3BDLHNCQUFrQixRQUFRO0FBQUEsRUFDM0I7QUFFRCxDQUFDO0FBR0QsU0FBUyxzQkFBc0IsVUFBNEIsUUFBdUI7QUFFakYsUUFBTSxTQUFTLFNBQVMsSUFBSSxvQkFBb0I7QUFDaEQsUUFBTSxjQUFjLFNBQVMsSUFBSSxtQkFBbUI7QUFDcEQsUUFBTSxTQUFTLFlBQVksVUFBVSxPQUFPLFlBQVksRUFBRTtBQUMxRCxNQUFJLFFBQVE7QUFDWCxVQUFNLE9BQU8sT0FBTyxTQUFTLEVBQUUsR0FBRyxFQUFFO0FBQ3BDLFdBQU8sV0FBVyxJQUFJO0FBQ3RCLFFBQUksUUFBUTtBQUNYLGFBQU8sYUFBYSxNQUFNLG1CQUFtQixZQUFZO0FBQUEsSUFDMUQ7QUFBQSxFQUNEO0FBQ0Q7QUFDQSxnQkFBZ0IsTUFBTSxrQ0FBa0MsUUFBUTtBQUFBLEVBQy9ELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsc0JBQXNCLDhCQUE4QjtBQUFBLE1BQ3JFLGNBQWMsbUJBQW1CO0FBQUEsTUFDakMsWUFBWTtBQUFBLFFBQ1gsUUFBUSxpQkFBaUI7QUFBQSxRQUN6QixTQUFTLE9BQU8sVUFBVSxPQUFPLFFBQVEsUUFBUTtBQUFBLFFBQ2pELE1BQU0sbUJBQW1CO0FBQUEsTUFDMUI7QUFBQSxNQUNBLElBQUk7QUFBQSxJQUNMLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFDQSxJQUFJLGFBQStCLE1BQXVCO0FBQ3pELDBCQUFzQixVQUFVLElBQUk7QUFBQSxFQUNyQztBQUNELENBQUM7QUFFRCxnQkFBZ0IsTUFBTSx5QkFBeUIsUUFBUTtBQUFBLEVBQ3RELGNBQWM7QUFDYixVQUFNO0FBQUEsTUFDTCxJQUFJO0FBQUEsTUFDSixPQUFPLFVBQVUsYUFBYSxtQkFBbUI7QUFBQSxNQUNqRCxjQUFjLG1CQUFtQjtBQUFBLE1BQ2pDLFlBQVk7QUFBQSxRQUNYLFFBQVEsaUJBQWlCO0FBQUEsUUFDekIsU0FBUyxPQUFPLFVBQVUsT0FBTyxRQUFRLFFBQVE7QUFBQSxRQUNqRCxNQUFNLG1CQUFtQjtBQUFBLE1BQzFCO0FBQUEsTUFDQSxJQUFJO0FBQUEsSUFDTCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBQ0EsSUFBSSxhQUErQixNQUF1QjtBQUN6RCwwQkFBc0IsVUFBVSxLQUFLO0FBQUEsRUFDdEM7QUFDRCxDQUFDO0FBSUQsb0JBQW9CLGlDQUFpQztBQUFBLEVBQ3BELElBQUk7QUFBQSxFQUNKLFFBQVEsaUJBQWlCO0FBQUEsRUFDekIsU0FBUyxPQUFPLFVBQVUsT0FBTyxRQUFRLFFBQVE7QUFBQSxFQUNqRCxNQUFNLGVBQWUsSUFBSSw0QkFBNEI7QUFBQSxFQUNyRCxTQUFTLE9BQU0sYUFBWTtBQUMxQixVQUFNLFVBQVUsU0FBUyxJQUFJLHFCQUFxQjtBQUNsRCxVQUFNLFNBQVMsU0FBUyxJQUFJLHFCQUFxQjtBQUVqRCxVQUFNLFlBQVksa0JBQWtCLFVBQVUsT0FBTyxNQUFNO0FBQzNELFFBQUksQ0FBQyxVQUFVLFNBQVMsR0FBRztBQUMxQixZQUFNLFVBQVUsWUFBWSxJQUFJO0FBQ2hDLFlBQU0sUUFBUSxFQUFFO0FBQUEsSUFDakI7QUFDQSxjQUFVLFFBQVE7QUFDbEIsV0FBTyxRQUFRLGVBQWUsdUJBQXVCLElBQUk7QUFBQSxFQUMxRDtBQUNELENBQUM7QUFHRCxvQkFBb0IsaUNBQWlDO0FBQUEsRUFDcEQsSUFBSTtBQUFBLEVBQ0osUUFBUSxpQkFBaUI7QUFBQSxFQUN6QixTQUFTLFFBQVE7QUFBQSxFQUNqQixXQUFXLENBQUMsT0FBTyxVQUFVLFFBQVEsVUFBVTtBQUFBLEVBQy9DLEtBQUs7QUFBQSxJQUNKLFNBQVMsUUFBUTtBQUFBLElBQ2pCLFdBQVcsQ0FBQyxPQUFPLE1BQU0sUUFBUSxVQUFVO0FBQUEsRUFDNUM7QUFBQSxFQUNBLE1BQU0sZUFBZSxJQUFJLG1CQUFtQix1QkFBdUIsbUJBQW1CLG9CQUFvQjtBQUFBLEVBQzFHLFFBQVEsVUFBVTtBQUNqQixVQUFNLFNBQVMsU0FBUyxJQUFJLG9CQUFvQjtBQUNoRCxVQUFNLGNBQWMsU0FBUyxJQUFJLG1CQUFtQjtBQUNwRCxVQUFNLFNBQVMsWUFBWSxVQUFVLE9BQU8sWUFBWSxFQUFFO0FBQzFELFFBQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxJQUNEO0FBQ0EsV0FBTyxVQUFVO0FBQUEsRUFDbEI7QUFDRCxDQUFDO0FBQ0Qsb0JBQW9CLGlDQUFpQztBQUFBLEVBQ3BELElBQUk7QUFBQSxFQUNKLFFBQVEsaUJBQWlCO0FBQUEsRUFDekIsU0FBUyxRQUFRO0FBQUEsRUFDakIsV0FBVyxDQUFDLE9BQU8sVUFBVSxRQUFRLFNBQVM7QUFBQSxFQUM5QyxLQUFLO0FBQUEsSUFDSixTQUFTLFFBQVE7QUFBQSxJQUNqQixXQUFXLENBQUMsT0FBTyxNQUFNLFFBQVEsU0FBUztBQUFBLEVBQzNDO0FBQUEsRUFDQSxNQUFNLGVBQWUsSUFBSSxtQkFBbUIsdUJBQXVCLG1CQUFtQixvQkFBb0I7QUFBQSxFQUMxRyxRQUFRLFVBQVU7QUFDakIsVUFBTSxTQUFTLFNBQVMsSUFBSSxvQkFBb0I7QUFDaEQsVUFBTSxjQUFjLFNBQVMsSUFBSSxtQkFBbUI7QUFDcEQsVUFBTSxTQUFTLFlBQVksVUFBVSxPQUFPLFlBQVksRUFBRTtBQUMxRCxRQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsSUFDRDtBQUNBLFdBQU8sVUFBVTtBQUFBLEVBQ2xCO0FBQ0QsQ0FBQztBQUNELG9CQUFvQixpQ0FBaUM7QUFBQSxFQUNwRCxJQUFJO0FBQUEsRUFDSixRQUFRLGlCQUFpQixtQkFBbUI7QUFBQSxFQUM1QyxTQUFTLE9BQU8sVUFBVSxRQUFRO0FBQUEsRUFDbEMsS0FBSztBQUFBLElBQ0osU0FBUyxPQUFPLE1BQU0sUUFBUTtBQUFBLEVBQy9CO0FBQUEsRUFDQSxNQUFNLGVBQWUsSUFBSSxtQkFBbUIsdUJBQXVCLG1CQUFtQixzQkFBc0IsNEJBQTRCO0FBQUEsRUFDeEksUUFBUSxVQUFVO0FBQ2pCLFVBQU0sU0FBUyxTQUFTLElBQUksb0JBQW9CO0FBQ2hELFVBQU0sY0FBYyxTQUFTLElBQUksbUJBQW1CO0FBQ3BELFVBQU0sU0FBUyxZQUFZLFVBQVUsT0FBTyxZQUFZLEVBQUU7QUFDMUQsUUFBSSxDQUFDLFFBQVE7QUFDWjtBQUFBLElBQ0Q7QUFDQSxXQUFPLFVBQVU7QUFBQSxFQUNsQjtBQUNELENBQUM7QUFDRCxvQkFBb0IsaUNBQWlDO0FBQUEsRUFDcEQsSUFBSTtBQUFBLEVBQ0osUUFBUSxpQkFBaUIsbUJBQW1CO0FBQUEsRUFDNUMsU0FBUyxPQUFPLFVBQVUsUUFBUTtBQUFBLEVBQ2xDLEtBQUs7QUFBQSxJQUNKLFNBQVMsT0FBTyxNQUFNLFFBQVE7QUFBQSxFQUMvQjtBQUFBLEVBQ0EsTUFBTSxlQUFlLElBQUksbUJBQW1CLHVCQUF1QixtQkFBbUIsc0JBQXNCLDRCQUE0QjtBQUFBLEVBQ3hJLFFBQVEsVUFBVTtBQUNqQixVQUFNLFNBQVMsU0FBUyxJQUFJLG9CQUFvQjtBQUNoRCxVQUFNLGNBQWMsU0FBUyxJQUFJLG1CQUFtQjtBQUNwRCxVQUFNLFNBQVMsWUFBWSxVQUFVLE9BQU8sWUFBWSxFQUFFO0FBQzFELFFBQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxJQUNEO0FBQ0EsV0FBTyxVQUFVO0FBQUEsRUFDbEI7QUFDRCxDQUFDO0FBQ0Qsb0JBQW9CLGlDQUFpQztBQUFBLEVBQ3BELElBQUk7QUFBQSxFQUNKLFFBQVEsaUJBQWlCO0FBQUEsRUFDekIsU0FBUyxRQUFRO0FBQUEsRUFDakIsV0FBVyxDQUFDLFFBQVEsU0FBUztBQUFBLEVBQzdCLE1BQU0sZUFBZSxJQUFJLG1CQUFtQix1QkFBdUIsbUJBQW1CLG9CQUFvQjtBQUFBLEVBQzFHLFFBQVEsVUFBVTtBQUNqQixVQUFNLFNBQVMsU0FBUyxJQUFJLG9CQUFvQjtBQUNoRCxVQUFNLGNBQWMsU0FBUyxJQUFJLG1CQUFtQjtBQUNwRCxVQUFNLFNBQVMsWUFBWSxVQUFVLE9BQU8sWUFBWSxFQUFFO0FBQzFELFFBQUksQ0FBQyxRQUFRO0FBQ1o7QUFBQSxJQUNEO0FBQ0EsV0FBTyxhQUFhLE9BQU8sV0FBVyxHQUFHLG1CQUFtQixZQUFZO0FBQUEsRUFDekU7QUFDRCxDQUFDO0FBQ0Qsb0JBQW9CLGlDQUFpQztBQUFBLEVBQ3BELElBQUk7QUFBQSxFQUNKLFFBQVEsaUJBQWlCO0FBQUEsRUFDekIsU0FBUyxRQUFRO0FBQUEsRUFDakIsV0FBVyxDQUFDLE9BQU8sVUFBVSxRQUFRLEtBQUs7QUFBQSxFQUMxQyxNQUFNLGVBQWUsSUFBSSxtQkFBbUIsdUJBQXVCLG1CQUFtQixvQkFBb0I7QUFBQSxFQUMxRyxRQUFRLFVBQVU7QUFDakIsVUFBTSxTQUFTLFNBQVMsSUFBSSxvQkFBb0I7QUFDaEQsVUFBTSxjQUFjLFNBQVMsSUFBSSxtQkFBbUI7QUFDcEQsVUFBTSxTQUFTLFlBQVksVUFBVSxPQUFPLFlBQVksRUFBRTtBQUMxRCxRQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsSUFDRDtBQUNBLFdBQU8sYUFBYSxPQUFPLFdBQVcsR0FBRyxtQkFBbUIsY0FBYztBQUFBLEVBQzNFO0FBQ0QsQ0FBQztBQUNELG9CQUFvQixpQ0FBaUM7QUFBQSxFQUNwRCxJQUFJO0FBQUEsRUFDSixRQUFRLGlCQUFpQixtQkFBbUI7QUFBQSxFQUM1QyxTQUFTLFFBQVE7QUFBQSxFQUNqQixNQUFNLGVBQWUsSUFBSSxtQkFBbUIsdUJBQXVCLG1CQUFtQixvQkFBb0I7QUFBQSxFQUMxRyxRQUFRLFVBQVU7QUFDakIsVUFBTSxTQUFTLFNBQVMsSUFBSSxvQkFBb0I7QUFDaEQsVUFBTSxjQUFjLFNBQVMsSUFBSSxtQkFBbUI7QUFDcEQsVUFBTSxTQUFTLFlBQVksVUFBVSxPQUFPLFlBQVksRUFBRTtBQUMxRCxRQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsSUFDRDtBQUNBLFdBQU8sV0FBVyxNQUFTO0FBQzNCLFdBQU8sYUFBYSxNQUFTO0FBQzdCLFdBQU8sWUFBWSxrQkFBa0IsTUFBTTtBQUFBLEVBQzVDO0FBQ0QsQ0FBQztBQUNELG9CQUFvQixpQ0FBaUM7QUFBQSxFQUNwRCxJQUFJO0FBQUEsRUFDSixRQUFRLGlCQUFpQjtBQUFBLEVBQ3pCLFNBQVMsT0FBTyxVQUFVLFFBQVE7QUFBQSxFQUNsQyxNQUFNLGVBQWUsSUFBSSxtQkFBbUIsdUJBQXVCLG1CQUFtQixzQkFBc0IsNEJBQTRCO0FBQUEsRUFDeEksUUFBUSxVQUFVO0FBQ2pCLFVBQU0sVUFBVSxTQUFTLElBQUksY0FBYztBQUMzQyxVQUFNLFFBQVEsU0FBUyxJQUFJLFlBQVk7QUFFdkMsVUFBTSxPQUFPLE1BQU07QUFDbkIsUUFBSSxFQUFFLGdCQUFnQixzQkFBc0IsRUFBRSxnQkFBZ0IseUJBQXlCO0FBQ3RGO0FBQUEsSUFDRDtBQUVBLFVBQU0sVUFBK0IsS0FBSyxTQUFTLEVBQUUsQ0FBQztBQUV0RCxRQUFJLElBQUksTUFBa0IsU0FBVSxRQUFRLEdBQUc7QUFFOUMsYUFBTyxRQUFRLFdBQVc7QUFBQSxRQUN6QixVQUFzQixRQUFTO0FBQUEsUUFDL0IsU0FBUyxFQUFFLFFBQVEsS0FBSztBQUFBLE1BQ3pCLEdBQUcsVUFBVTtBQUFBLElBQ2Q7QUFHQSxVQUFNLFFBQVEsS0FBSyxTQUFTO0FBQzVCLFFBQUksU0FBUyxPQUEyQixNQUFPLGdCQUFnQixVQUFVO0FBQ3hFLGFBQTJCLE1BQU8sT0FBTyxTQUFTO0FBQUEsUUFDakQsUUFBUTtBQUFBLFFBQ1IsZUFBZTtBQUFBLE1BQ2hCLEdBQUcsTUFBTSxLQUFLO0FBQUEsSUFDZjtBQUFBLEVBQ0Q7QUFDRCxDQUFDO0FBR0QsZ0JBQWdCLE1BQU0sMkJBQTJCLFFBQVE7QUFBQSxFQUN4RCxjQUFjO0FBQ2IsVUFBTTtBQUFBLE1BQ0wsSUFBSTtBQUFBLE1BQ0osT0FBTyxVQUFVLGdCQUFnQix1QkFBdUI7QUFBQSxNQUN4RCxVQUFVLFdBQVc7QUFBQSxNQUNyQixjQUFjLGVBQWUsSUFBSSxtQkFBbUIsdUJBQXVCLG1CQUFtQix3QkFBd0I7QUFBQSxNQUN0SCxJQUFJO0FBQUEsTUFDSixNQUFNLENBQUM7QUFBQSxRQUNOLElBQUksT0FBTztBQUFBLFFBQ1gsT0FBTztBQUFBLFFBQ1AsT0FBTztBQUFBLFFBQ1AsTUFBTSxlQUFlLElBQUksbUJBQW1CLHdCQUF3QixtQkFBbUIsd0JBQXdCO0FBQUEsTUFDaEgsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUNBLE1BQU0sSUFBSSxVQUEyQztBQUNwRCxVQUFNLFNBQVMsU0FBUyxJQUFJLG9CQUFvQjtBQUNoRCxVQUFNLG1CQUFtQixTQUFTLElBQUksaUJBQWlCO0FBQ3ZELFVBQU0sdUJBQXVCLFNBQVMsSUFBSSxxQkFBcUI7QUFDL0QsVUFBTSxpQkFBaUIsU0FBUyxJQUFJLGVBQWU7QUFFbkQsUUFBSSxDQUFDLE9BQU8sWUFBWSxrQkFBa0I7QUFDekM7QUFBQSxJQUNEO0FBRUEsVUFBTSxVQUFVLE1BQU0sZUFBZSxjQUFjLE9BQU8sWUFBWSxrQkFBa0IsY0FBYyxhQUFhLGtCQUFrQixJQUFJO0FBQ3pJLFFBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxJQUNEO0FBRUEsVUFBTSxXQUFXLFFBQVEsT0FBTyxzQkFBc0Isc0JBQXNCO0FBQzVFLFVBQU0sU0FBUyxTQUFTLElBQUksVUFBUSxLQUFLLEtBQUssRUFBRSxPQUFPLE9BQU87QUFFOUQsWUFBUSxRQUFRO0FBRWhCLFFBQUksT0FBTyxXQUFXLEdBQUc7QUFDeEI7QUFBQSxJQUNEO0FBR0EsVUFBTSxXQUFXLE9BQU8sWUFBWSxpQkFBaUIsTUFBTTtBQUMzRCxVQUFNLFNBQVMsa0JBQWtCLG9CQUFvQixPQUFPLG9CQUFvQjtBQUNoRixVQUFNLFlBQVksT0FBTyxTQUFTLFlBQVksRUFBRSxTQUFTLENBQUMsS0FBSztBQUMvRCxXQUFPLFFBQVE7QUFFZixVQUFNLE9BQU8sT0FBTyxLQUFLLFNBQVM7QUFDbEMsVUFBTSxpQkFBaUIsVUFBVSxJQUFJO0FBQUEsRUFDdEM7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogWyJlbGVtZW50IiwgInJlbmRlcmVyIiwgImFjY2Vzc29yIl0KfQo=
