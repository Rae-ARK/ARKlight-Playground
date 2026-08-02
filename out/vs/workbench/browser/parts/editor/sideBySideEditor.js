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
import "./media/sidebysideeditor.css";
import { localize } from "../../../../nls.js";
import { Dimension, $, clearNode } from "../../../../base/browser/dom.js";
import { multibyteAwareBtoa } from "../../../../base/common/strings.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { EditorExtensions, SIDE_BY_SIDE_EDITOR_ID, SideBySideEditor as Side, isEditorPaneWithSelection, EditorPaneSelectionCompareResult } from "../../../common/editor.js";
import { SideBySideEditorInput } from "../../../common/editor/sideBySideEditorInput.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { SplitView, Sizing, Orientation } from "../../../../base/browser/ui/splitview/splitview.js";
import { Event, Relay, Emitter } from "../../../../base/common/event.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { DEFAULT_EDITOR_MIN_DIMENSIONS } from "./editor.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { SIDE_BY_SIDE_EDITOR_HORIZONTAL_BORDER, SIDE_BY_SIDE_EDITOR_VERTICAL_BORDER } from "../../../common/theme.js";
import { AbstractEditorWithViewState } from "./editorWithViewState.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
function isSideBySideEditorViewState(thing) {
  const candidate = thing;
  return typeof candidate?.primary === "object" && typeof candidate.secondary === "object";
}
let SideBySideEditor = class extends AbstractEditorWithViewState {
  constructor(group, telemetryService, instantiationService, themeService, storageService, configurationService, textResourceConfigurationService, editorService, editorGroupService) {
    super(SideBySideEditor.ID, group, SideBySideEditor.VIEW_STATE_PREFERENCE_KEY, telemetryService, instantiationService, storageService, textResourceConfigurationService, themeService, editorService, editorGroupService);
    this.configurationService = configurationService;
    //#endregion
    //#region Events
    this.onDidCreateEditors = this._register(new Emitter());
    this._onDidChangeSizeConstraints = this._register(new Relay());
    this.onDidChangeSizeConstraints = Event.any(this.onDidCreateEditors.event, this._onDidChangeSizeConstraints.event);
    this._onDidChangeSelection = this._register(new Emitter());
    this.onDidChangeSelection = this._onDidChangeSelection.event;
    //#endregion
    this.primaryEditorPane = void 0;
    this.secondaryEditorPane = void 0;
    this.splitviewDisposables = this._register(new DisposableStore());
    this.editorDisposables = this._register(new DisposableStore());
    this.dimension = new Dimension(0, 0);
    this.lastFocusedSide = void 0;
    this.orientation = this.configurationService.getValue(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING) === "vertical" ? Orientation.VERTICAL : Orientation.HORIZONTAL;
    this.registerListeners();
  }
  //#region Layout Constraints
  get minimumPrimaryWidth() {
    return this.primaryEditorPane ? this.primaryEditorPane.minimumWidth : 0;
  }
  get maximumPrimaryWidth() {
    return this.primaryEditorPane ? this.primaryEditorPane.maximumWidth : Number.POSITIVE_INFINITY;
  }
  get minimumPrimaryHeight() {
    return this.primaryEditorPane ? this.primaryEditorPane.minimumHeight : 0;
  }
  get maximumPrimaryHeight() {
    return this.primaryEditorPane ? this.primaryEditorPane.maximumHeight : Number.POSITIVE_INFINITY;
  }
  get minimumSecondaryWidth() {
    return this.secondaryEditorPane ? this.secondaryEditorPane.minimumWidth : 0;
  }
  get maximumSecondaryWidth() {
    return this.secondaryEditorPane ? this.secondaryEditorPane.maximumWidth : Number.POSITIVE_INFINITY;
  }
  get minimumSecondaryHeight() {
    return this.secondaryEditorPane ? this.secondaryEditorPane.minimumHeight : 0;
  }
  get maximumSecondaryHeight() {
    return this.secondaryEditorPane ? this.secondaryEditorPane.maximumHeight : Number.POSITIVE_INFINITY;
  }
  set minimumWidth(value) {
  }
  set maximumWidth(value) {
  }
  set minimumHeight(value) {
  }
  set maximumHeight(value) {
  }
  get minimumWidth() {
    return this.minimumPrimaryWidth + this.minimumSecondaryWidth;
  }
  get maximumWidth() {
    return this.maximumPrimaryWidth + this.maximumSecondaryWidth;
  }
  get minimumHeight() {
    return this.minimumPrimaryHeight + this.minimumSecondaryHeight;
  }
  get maximumHeight() {
    return this.maximumPrimaryHeight + this.maximumSecondaryHeight;
  }
  registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationUpdated(e)));
  }
  onConfigurationUpdated(event) {
    if (event.affectsConfiguration(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING)) {
      this.orientation = this.configurationService.getValue(SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING) === "vertical" ? Orientation.VERTICAL : Orientation.HORIZONTAL;
      if (this.splitview) {
        this.recreateSplitview();
      }
    }
  }
  recreateSplitview() {
    const container = assertReturnsDefined(this.getContainer());
    const ratio = this.getSplitViewRatio();
    if (this.splitview) {
      this.splitview.el.remove();
      this.splitviewDisposables.clear();
    }
    this.createSplitView(container, ratio);
    this.layout(this.dimension);
  }
  getSplitViewRatio() {
    let ratio = void 0;
    if (this.splitview) {
      const leftViewSize = this.splitview.getViewSize(0);
      const rightViewSize = this.splitview.getViewSize(1);
      if (Math.abs(leftViewSize - rightViewSize) > 1) {
        const totalSize = this.splitview.orientation === Orientation.HORIZONTAL ? this.dimension.width : this.dimension.height;
        ratio = leftViewSize / totalSize;
      }
    }
    return ratio;
  }
  createEditor(parent) {
    parent.classList.add("side-by-side-editor");
    this.secondaryEditorContainer = $(".side-by-side-editor-container.editor-instance");
    this.primaryEditorContainer = $(".side-by-side-editor-container.editor-instance");
    this.createSplitView(parent);
  }
  createSplitView(parent, ratio) {
    this.splitview = this.splitviewDisposables.add(new SplitView(parent, { orientation: this.orientation }));
    this.splitviewDisposables.add(this.splitview.onDidSashReset(() => this.splitview?.distributeViewSizes()));
    if (this.orientation === Orientation.HORIZONTAL) {
      this.splitview.orthogonalEndSash = this._boundarySashes?.bottom;
    } else {
      this.splitview.orthogonalStartSash = this._boundarySashes?.left;
      this.splitview.orthogonalEndSash = this._boundarySashes?.right;
    }
    let leftSizing = Sizing.Distribute;
    let rightSizing = Sizing.Distribute;
    if (ratio) {
      const totalSize = this.splitview.orientation === Orientation.HORIZONTAL ? this.dimension.width : this.dimension.height;
      leftSizing = Math.round(totalSize * ratio);
      rightSizing = totalSize - leftSizing;
      this.splitview.layout(this.orientation === Orientation.HORIZONTAL ? this.dimension.width : this.dimension.height);
    }
    const secondaryEditorContainer = assertReturnsDefined(this.secondaryEditorContainer);
    this.splitview.addView({
      element: secondaryEditorContainer,
      layout: (size) => this.layoutPane(this.secondaryEditorPane, size),
      minimumSize: this.orientation === Orientation.HORIZONTAL ? DEFAULT_EDITOR_MIN_DIMENSIONS.width : DEFAULT_EDITOR_MIN_DIMENSIONS.height,
      maximumSize: Number.POSITIVE_INFINITY,
      onDidChange: Event.None
    }, leftSizing);
    const primaryEditorContainer = assertReturnsDefined(this.primaryEditorContainer);
    this.splitview.addView({
      element: primaryEditorContainer,
      layout: (size) => this.layoutPane(this.primaryEditorPane, size),
      minimumSize: this.orientation === Orientation.HORIZONTAL ? DEFAULT_EDITOR_MIN_DIMENSIONS.width : DEFAULT_EDITOR_MIN_DIMENSIONS.height,
      maximumSize: Number.POSITIVE_INFINITY,
      onDidChange: Event.None
    }, rightSizing);
    this.updateStyles();
  }
  getTitle() {
    if (this.input) {
      return this.input.getName();
    }
    return localize("sideBySideEditor", "Side by Side Editor");
  }
  async setInput(input, options, context, token) {
    const oldInput = this.input;
    await super.setInput(input, options, context, token);
    if (!oldInput || !input.matches(oldInput)) {
      if (oldInput) {
        this.disposeEditors();
      }
      this.createEditors(input);
    }
    const { primary, secondary, viewState } = this.loadViewState(input, options, context);
    this.lastFocusedSide = viewState?.focus;
    if (typeof viewState?.ratio === "number" && this.splitview) {
      const totalSize = this.splitview.orientation === Orientation.HORIZONTAL ? this.dimension.width : this.dimension.height;
      this.splitview.resizeView(0, Math.round(totalSize * viewState.ratio));
    } else {
      this.splitview?.distributeViewSizes();
    }
    await Promise.all([
      this.secondaryEditorPane?.setInput(input.secondary, secondary, context, token),
      this.primaryEditorPane?.setInput(input.primary, primary, context, token)
    ]);
    if (typeof options?.target === "number") {
      this.lastFocusedSide = options.target;
    }
  }
  loadViewState(input, options, context) {
    const viewState = isSideBySideEditorViewState(options?.viewState) ? options?.viewState : this.loadEditorViewState(input, context);
    let primaryOptions = /* @__PURE__ */ Object.create(null);
    let secondaryOptions = void 0;
    if (options?.target === Side.SECONDARY) {
      secondaryOptions = { ...options };
    } else {
      primaryOptions = { ...options };
    }
    primaryOptions.viewState = viewState?.primary;
    if (viewState?.secondary) {
      if (!secondaryOptions) {
        secondaryOptions = { viewState: viewState.secondary };
      } else {
        secondaryOptions.viewState = viewState?.secondary;
      }
    }
    return { primary: primaryOptions, secondary: secondaryOptions, viewState };
  }
  createEditors(newInput) {
    this.secondaryEditorPane = this.doCreateEditor(newInput.secondary, assertReturnsDefined(this.secondaryEditorContainer));
    this.primaryEditorPane = this.doCreateEditor(newInput.primary, assertReturnsDefined(this.primaryEditorContainer));
    this.layout(this.dimension);
    this._onDidChangeSizeConstraints.input = Event.any(
      Event.map(this.secondaryEditorPane.onDidChangeSizeConstraints, () => void 0),
      Event.map(this.primaryEditorPane.onDidChangeSizeConstraints, () => void 0)
    );
    this.onDidCreateEditors.fire(void 0);
    this.editorDisposables.add(this.primaryEditorPane.onDidFocus(() => this.onDidFocusChange(Side.PRIMARY)));
    this.editorDisposables.add(this.secondaryEditorPane.onDidFocus(() => this.onDidFocusChange(Side.SECONDARY)));
  }
  doCreateEditor(editorInput, container) {
    const editorPaneDescriptor = Registry.as(EditorExtensions.EditorPane).getEditorPane(editorInput);
    if (!editorPaneDescriptor) {
      throw new Error("No editor pane descriptor for editor found");
    }
    const editorPane = editorPaneDescriptor.instantiate(this.instantiationService, this.group);
    editorPane.create(container);
    editorPane.setVisible(this.isVisible());
    if (isEditorPaneWithSelection(editorPane)) {
      this.editorDisposables.add(editorPane.onDidChangeSelection((e) => this._onDidChangeSelection.fire(e)));
    }
    this.editorDisposables.add(editorPane);
    return editorPane;
  }
  onDidFocusChange(side) {
    this.lastFocusedSide = side;
    this._onDidChangeControl.fire();
  }
  getSelection() {
    const lastFocusedEditorPane = this.getLastFocusedEditorPane();
    if (isEditorPaneWithSelection(lastFocusedEditorPane)) {
      const selection = lastFocusedEditorPane.getSelection();
      if (selection) {
        return new SideBySideAwareEditorPaneSelection(selection, lastFocusedEditorPane === this.primaryEditorPane ? Side.PRIMARY : Side.SECONDARY);
      }
    }
    return void 0;
  }
  setOptions(options) {
    super.setOptions(options);
    if (typeof options?.target === "number") {
      this.lastFocusedSide = options.target;
    }
    this.getLastFocusedEditorPane()?.setOptions(options);
  }
  setEditorVisible(visible) {
    this.primaryEditorPane?.setVisible(visible);
    this.secondaryEditorPane?.setVisible(visible);
    super.setEditorVisible(visible);
  }
  clearInput() {
    super.clearInput();
    this.primaryEditorPane?.clearInput();
    this.secondaryEditorPane?.clearInput();
    this.disposeEditors();
  }
  focus() {
    super.focus();
    this.getLastFocusedEditorPane()?.focus();
  }
  getLastFocusedEditorPane() {
    if (this.lastFocusedSide === Side.SECONDARY) {
      return this.secondaryEditorPane;
    }
    return this.primaryEditorPane;
  }
  layout(dimension) {
    this.dimension = dimension;
    const splitview = assertReturnsDefined(this.splitview);
    splitview.layout(this.orientation === Orientation.HORIZONTAL ? dimension.width : dimension.height);
  }
  setBoundarySashes(sashes) {
    this._boundarySashes = sashes;
    if (this.splitview) {
      this.splitview.orthogonalEndSash = sashes.bottom;
    }
  }
  layoutPane(pane, size) {
    pane?.layout(this.orientation === Orientation.HORIZONTAL ? new Dimension(size, this.dimension.height) : new Dimension(this.dimension.width, size));
  }
  getControl() {
    return this.getLastFocusedEditorPane()?.getControl();
  }
  getPrimaryEditorPane() {
    return this.primaryEditorPane;
  }
  getSecondaryEditorPane() {
    return this.secondaryEditorPane;
  }
  tracksEditorViewState(input) {
    return input instanceof SideBySideEditorInput;
  }
  computeEditorViewState(resource) {
    if (!this.input || !isEqual(resource, this.toEditorViewStateResource(this.input))) {
      return;
    }
    const primarViewState = this.primaryEditorPane?.getViewState();
    const secondaryViewState = this.secondaryEditorPane?.getViewState();
    if (!primarViewState || !secondaryViewState) {
      return;
    }
    return {
      primary: primarViewState,
      secondary: secondaryViewState,
      focus: this.lastFocusedSide,
      ratio: this.getSplitViewRatio()
    };
  }
  toEditorViewStateResource(input) {
    let primary;
    let secondary;
    if (input instanceof SideBySideEditorInput) {
      primary = input.primary.resource;
      secondary = input.secondary.resource;
    }
    if (!secondary || !primary) {
      return void 0;
    }
    return URI.from({ scheme: "sideBySide", path: `${multibyteAwareBtoa(secondary.toString())}${multibyteAwareBtoa(primary.toString())}` });
  }
  updateStyles() {
    super.updateStyles();
    if (this.primaryEditorContainer) {
      if (this.orientation === Orientation.HORIZONTAL) {
        this.primaryEditorContainer.style.borderLeftWidth = "1px";
        this.primaryEditorContainer.style.borderLeftStyle = "solid";
        this.primaryEditorContainer.style.borderLeftColor = this.getColor(SIDE_BY_SIDE_EDITOR_VERTICAL_BORDER) ?? "";
        this.primaryEditorContainer.style.borderTopWidth = "0";
      } else {
        this.primaryEditorContainer.style.borderTopWidth = "1px";
        this.primaryEditorContainer.style.borderTopStyle = "solid";
        this.primaryEditorContainer.style.borderTopColor = this.getColor(SIDE_BY_SIDE_EDITOR_HORIZONTAL_BORDER) ?? "";
        this.primaryEditorContainer.style.borderLeftWidth = "0";
      }
    }
  }
  dispose() {
    this.disposeEditors();
    super.dispose();
  }
  disposeEditors() {
    this.editorDisposables.clear();
    this.secondaryEditorPane = void 0;
    this.primaryEditorPane = void 0;
    this.lastFocusedSide = void 0;
    if (this.secondaryEditorContainer) {
      clearNode(this.secondaryEditorContainer);
    }
    if (this.primaryEditorContainer) {
      clearNode(this.primaryEditorContainer);
    }
  }
};
SideBySideEditor.ID = SIDE_BY_SIDE_EDITOR_ID;
SideBySideEditor.SIDE_BY_SIDE_LAYOUT_SETTING = "workbench.editor.splitInGroupLayout";
SideBySideEditor.VIEW_STATE_PREFERENCE_KEY = "sideBySideEditorViewState";
SideBySideEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IThemeService),
  __decorateParam(4, IStorageService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ITextResourceConfigurationService),
  __decorateParam(7, IEditorService),
  __decorateParam(8, IEditorGroupsService)
], SideBySideEditor);
class SideBySideAwareEditorPaneSelection {
  constructor(selection, side) {
    this.selection = selection;
    this.side = side;
  }
  compare(other) {
    if (!(other instanceof SideBySideAwareEditorPaneSelection)) {
      return EditorPaneSelectionCompareResult.DIFFERENT;
    }
    if (this.side !== other.side) {
      return EditorPaneSelectionCompareResult.DIFFERENT;
    }
    return this.selection.compare(other.selection);
  }
  restore(options) {
    const sideBySideEditorOptions = {
      ...options,
      target: this.side
    };
    return this.selection.restore(sideBySideEditorOptions);
  }
}
export {
  SideBySideEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9icm93c2VyL3BhcnRzL2VkaXRvci9zaWRlQnlTaWRlRWRpdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICcuL21lZGlhL3NpZGVieXNpZGVlZGl0b3IuY3NzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IERpbWVuc2lvbiwgJCwgY2xlYXJOb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBtdWx0aWJ5dGVBd2FyZUJ0b2EgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IElFZGl0b3JDb250cm9sLCBJRWRpdG9yUGFuZSwgSUVkaXRvck9wZW5Db250ZXh0LCBFZGl0b3JFeHRlbnNpb25zLCBTSURFX0JZX1NJREVfRURJVE9SX0lELCBTaWRlQnlTaWRlRWRpdG9yIGFzIFNpZGUsIElFZGl0b3JQYW5lU2VsZWN0aW9uLCBJRWRpdG9yUGFuZVdpdGhTZWxlY3Rpb24sIElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQsIGlzRWRpdG9yUGFuZVdpdGhTZWxlY3Rpb24sIEVkaXRvclBhbmVTZWxlY3Rpb25Db21wYXJlUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBTaWRlQnlTaWRlRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yL3NpZGVCeVNpZGVFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yUGFuZSB9IGZyb20gJy4vZWRpdG9yUGFuZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclBhbmVSZWdpc3RyeSB9IGZyb20gJy4uLy4uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNwbGl0VmlldywgU2l6aW5nLCBPcmllbnRhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zcGxpdHZpZXcvc3BsaXR2aWV3LmpzJztcbmltcG9ydCB7IEV2ZW50LCBSZWxheSwgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2VkaXRvci9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgREVGQVVMVF9FRElUT1JfTUlOX0RJTUVOU0lPTlMgfSBmcm9tICcuL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU0lERV9CWV9TSURFX0VESVRPUl9IT1JJWk9OVEFMX0JPUkRFUiwgU0lERV9CWV9TSURFX0VESVRPUl9WRVJUSUNBTF9CT1JERVIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgQWJzdHJhY3RFZGl0b3JXaXRoVmlld1N0YXRlIH0gZnJvbSAnLi9lZGl0b3JXaXRoVmlld1N0YXRlLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQm91bmRhcnlTYXNoZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2FzaC9zYXNoLmpzJztcblxuaW50ZXJmYWNlIElTaWRlQnlTaWRlRWRpdG9yVmlld1N0YXRlIHtcblx0cHJpbWFyeTogb2JqZWN0O1xuXHRzZWNvbmRhcnk6IG9iamVjdDtcblx0Zm9jdXM6IFNpZGUuUFJJTUFSWSB8IFNpZGUuU0VDT05EQVJZIHwgdW5kZWZpbmVkO1xuXHRyYXRpbzogbnVtYmVyIHwgdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBpc1NpZGVCeVNpZGVFZGl0b3JWaWV3U3RhdGUodGhpbmc6IHVua25vd24pOiB0aGluZyBpcyBJU2lkZUJ5U2lkZUVkaXRvclZpZXdTdGF0ZSB7XG5cdGNvbnN0IGNhbmRpZGF0ZSA9IHRoaW5nIGFzIElTaWRlQnlTaWRlRWRpdG9yVmlld1N0YXRlIHwgdW5kZWZpbmVkO1xuXG5cdHJldHVybiB0eXBlb2YgY2FuZGlkYXRlPy5wcmltYXJ5ID09PSAnb2JqZWN0JyAmJiB0eXBlb2YgY2FuZGlkYXRlLnNlY29uZGFyeSA9PT0gJ29iamVjdCc7XG59XG5cbmludGVyZmFjZSBJU2lkZUJ5U2lkZUVkaXRvck9wdGlvbnMgZXh0ZW5kcyBJRWRpdG9yT3B0aW9ucyB7XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgdGhlIGVkaXRvciBvcHRpb25zIHNob3VsZCBhcHBseSB0b1xuXHQgKiB0aGUgcHJpbWFyeSBvciBzZWNvbmRhcnkgc2lkZS5cblx0ICpcblx0ICogSWYgYSB0YXJnZXQgc2lkZSBpcyBwcm92aWRlZCwgdGhhdCBzaWRlIHdpbGxcblx0ICogYWxzbyByZWNlaXZlIGtleWJvYXJkIGZvY3VzIHVubGVzcyBmb2N1cyBpc1xuXHQgKiB0byBiZSBwcmVzZXJ2ZWQuXG5cdCAqL1xuXHR0YXJnZXQ/OiBTaWRlLlBSSU1BUlkgfCBTaWRlLlNFQ09OREFSWTtcbn1cblxuZXhwb3J0IGNsYXNzIFNpZGVCeVNpZGVFZGl0b3IgZXh0ZW5kcyBBYnN0cmFjdEVkaXRvcldpdGhWaWV3U3RhdGU8SVNpZGVCeVNpZGVFZGl0b3JWaWV3U3RhdGU+IGltcGxlbWVudHMgSUVkaXRvclBhbmVXaXRoU2VsZWN0aW9uIHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgSUQ6IHN0cmluZyA9IFNJREVfQllfU0lERV9FRElUT1JfSUQ7XG5cblx0c3RhdGljIFNJREVfQllfU0lERV9MQVlPVVRfU0VUVElORyA9ICd3b3JrYmVuY2guZWRpdG9yLnNwbGl0SW5Hcm91cExheW91dCc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgVklFV19TVEFURV9QUkVGRVJFTkNFX0tFWSA9ICdzaWRlQnlTaWRlRWRpdG9yVmlld1N0YXRlJztcblxuXHQvLyNyZWdpb24gTGF5b3V0IENvbnN0cmFpbnRzXG5cblx0cHJpdmF0ZSBnZXQgbWluaW11bVByaW1hcnlXaWR0aCgpIHsgcmV0dXJuIHRoaXMucHJpbWFyeUVkaXRvclBhbmUgPyB0aGlzLnByaW1hcnlFZGl0b3JQYW5lLm1pbmltdW1XaWR0aCA6IDA7IH1cblx0cHJpdmF0ZSBnZXQgbWF4aW11bVByaW1hcnlXaWR0aCgpIHsgcmV0dXJuIHRoaXMucHJpbWFyeUVkaXRvclBhbmUgPyB0aGlzLnByaW1hcnlFZGl0b3JQYW5lLm1heGltdW1XaWR0aCA6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTsgfVxuXHRwcml2YXRlIGdldCBtaW5pbXVtUHJpbWFyeUhlaWdodCgpIHsgcmV0dXJuIHRoaXMucHJpbWFyeUVkaXRvclBhbmUgPyB0aGlzLnByaW1hcnlFZGl0b3JQYW5lLm1pbmltdW1IZWlnaHQgOiAwOyB9XG5cdHByaXZhdGUgZ2V0IG1heGltdW1QcmltYXJ5SGVpZ2h0KCkgeyByZXR1cm4gdGhpcy5wcmltYXJ5RWRpdG9yUGFuZSA/IHRoaXMucHJpbWFyeUVkaXRvclBhbmUubWF4aW11bUhlaWdodCA6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTsgfVxuXG5cdHByaXZhdGUgZ2V0IG1pbmltdW1TZWNvbmRhcnlXaWR0aCgpIHsgcmV0dXJuIHRoaXMuc2Vjb25kYXJ5RWRpdG9yUGFuZSA/IHRoaXMuc2Vjb25kYXJ5RWRpdG9yUGFuZS5taW5pbXVtV2lkdGggOiAwOyB9XG5cdHByaXZhdGUgZ2V0IG1heGltdW1TZWNvbmRhcnlXaWR0aCgpIHsgcmV0dXJuIHRoaXMuc2Vjb25kYXJ5RWRpdG9yUGFuZSA/IHRoaXMuc2Vjb25kYXJ5RWRpdG9yUGFuZS5tYXhpbXVtV2lkdGggOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7IH1cblx0cHJpdmF0ZSBnZXQgbWluaW11bVNlY29uZGFyeUhlaWdodCgpIHsgcmV0dXJuIHRoaXMuc2Vjb25kYXJ5RWRpdG9yUGFuZSA/IHRoaXMuc2Vjb25kYXJ5RWRpdG9yUGFuZS5taW5pbXVtSGVpZ2h0IDogMDsgfVxuXHRwcml2YXRlIGdldCBtYXhpbXVtU2Vjb25kYXJ5SGVpZ2h0KCkgeyByZXR1cm4gdGhpcy5zZWNvbmRhcnlFZGl0b3JQYW5lID8gdGhpcy5zZWNvbmRhcnlFZGl0b3JQYW5lLm1heGltdW1IZWlnaHQgOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7IH1cblxuXHRvdmVycmlkZSBzZXQgbWluaW11bVdpZHRoKHZhbHVlOiBudW1iZXIpIHsgLyogbm9vcCAqLyB9XG5cdG92ZXJyaWRlIHNldCBtYXhpbXVtV2lkdGgodmFsdWU6IG51bWJlcikgeyAvKiBub29wICovIH1cblx0b3ZlcnJpZGUgc2V0IG1pbmltdW1IZWlnaHQodmFsdWU6IG51bWJlcikgeyAvKiBub29wICovIH1cblx0b3ZlcnJpZGUgc2V0IG1heGltdW1IZWlnaHQodmFsdWU6IG51bWJlcikgeyAvKiBub29wICovIH1cblxuXHRvdmVycmlkZSBnZXQgbWluaW11bVdpZHRoKCkgeyByZXR1cm4gdGhpcy5taW5pbXVtUHJpbWFyeVdpZHRoICsgdGhpcy5taW5pbXVtU2Vjb25kYXJ5V2lkdGg7IH1cblx0b3ZlcnJpZGUgZ2V0IG1heGltdW1XaWR0aCgpIHsgcmV0dXJuIHRoaXMubWF4aW11bVByaW1hcnlXaWR0aCArIHRoaXMubWF4aW11bVNlY29uZGFyeVdpZHRoOyB9XG5cdG92ZXJyaWRlIGdldCBtaW5pbXVtSGVpZ2h0KCkgeyByZXR1cm4gdGhpcy5taW5pbXVtUHJpbWFyeUhlaWdodCArIHRoaXMubWluaW11bVNlY29uZGFyeUhlaWdodDsgfVxuXHRvdmVycmlkZSBnZXQgbWF4aW11bUhlaWdodCgpIHsgcmV0dXJuIHRoaXMubWF4aW11bVByaW1hcnlIZWlnaHQgKyB0aGlzLm1heGltdW1TZWNvbmRhcnlIZWlnaHQ7IH1cblxuXHRwcml2YXRlIF9ib3VuZGFyeVNhc2hlczogSUJvdW5kYXJ5U2FzaGVzIHwgdW5kZWZpbmVkO1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBFdmVudHNcblxuXHRwcml2YXRlIG9uRGlkQ3JlYXRlRWRpdG9ycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB8IHVuZGVmaW5lZD4oKSk7XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHMgPSB0aGlzLl9yZWdpc3RlcihuZXcgUmVsYXk8eyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9IHwgdW5kZWZpbmVkPigpKTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHMgPSBFdmVudC5hbnkodGhpcy5vbkRpZENyZWF0ZUVkaXRvcnMuZXZlbnQsIHRoaXMuX29uRGlkQ2hhbmdlU2l6ZUNvbnN0cmFpbnRzLmV2ZW50KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElFZGl0b3JQYW5lU2VsZWN0aW9uQ2hhbmdlRXZlbnQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlbGVjdGlvbiA9IHRoaXMuX29uRGlkQ2hhbmdlU2VsZWN0aW9uLmV2ZW50O1xuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdHByaXZhdGUgcHJpbWFyeUVkaXRvclBhbmU6IEVkaXRvclBhbmUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2Vjb25kYXJ5RWRpdG9yUGFuZTogRWRpdG9yUGFuZSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHByaW1hcnlFZGl0b3JDb250YWluZXI6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHNlY29uZGFyeUVkaXRvckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzcGxpdHZpZXc6IFNwbGl0VmlldyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNwbGl0dmlld0Rpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0cHJpdmF0ZSByZWFkb25seSBlZGl0b3JEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0cHJpdmF0ZSBvcmllbnRhdGlvbjogT3JpZW50YXRpb247XG5cdHByaXZhdGUgZGltZW5zaW9uID0gbmV3IERpbWVuc2lvbigwLCAwKTtcblxuXHRwcml2YXRlIGxhc3RGb2N1c2VkU2lkZTogU2lkZS5QUklNQVJZIHwgU2lkZS5TRUNPTkRBUlkgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Z3JvdXA6IElFZGl0b3JHcm91cCxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZTogSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUVkaXRvckdyb3Vwc1NlcnZpY2UgZWRpdG9yR3JvdXBTZXJ2aWNlOiBJRWRpdG9yR3JvdXBzU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihTaWRlQnlTaWRlRWRpdG9yLklELCBncm91cCwgU2lkZUJ5U2lkZUVkaXRvci5WSUVXX1NUQVRFX1BSRUZFUkVOQ0VfS0VZLCB0ZWxlbWV0cnlTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIGVkaXRvclNlcnZpY2UsIGVkaXRvckdyb3VwU2VydmljZSk7XG5cblx0XHR0aGlzLm9yaWVudGF0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwndmVydGljYWwnIHwgJ2hvcml6b250YWwnPihTaWRlQnlTaWRlRWRpdG9yLlNJREVfQllfU0lERV9MQVlPVVRfU0VUVElORykgPT09ICd2ZXJ0aWNhbCcgPyBPcmllbnRhdGlvbi5WRVJUSUNBTCA6IE9yaWVudGF0aW9uLkhPUklaT05UQUw7XG5cblx0XHR0aGlzLnJlZ2lzdGVyTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlZ2lzdGVyTGlzdGVuZXJzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4gdGhpcy5vbkNvbmZpZ3VyYXRpb25VcGRhdGVkKGUpKSk7XG5cdH1cblxuXHRwcml2YXRlIG9uQ29uZmlndXJhdGlvblVwZGF0ZWQoZXZlbnQ6IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oU2lkZUJ5U2lkZUVkaXRvci5TSURFX0JZX1NJREVfTEFZT1VUX1NFVFRJTkcpKSB7XG5cdFx0XHR0aGlzLm9yaWVudGF0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwndmVydGljYWwnIHwgJ2hvcml6b250YWwnPihTaWRlQnlTaWRlRWRpdG9yLlNJREVfQllfU0lERV9MQVlPVVRfU0VUVElORykgPT09ICd2ZXJ0aWNhbCcgPyBPcmllbnRhdGlvbi5WRVJUSUNBTCA6IE9yaWVudGF0aW9uLkhPUklaT05UQUw7XG5cblx0XHRcdC8vIElmIGNvbmZpZyB1cGRhdGVkIGZyb20gZXZlbnQsIHJlLWNyZWF0ZSB0aGUgc3BsaXRcblx0XHRcdC8vIGVkaXRvciB1c2luZyB0aGUgbmV3IGxheW91dCBvcmllbnRhdGlvbiBpZiBpdCB3YXNcblx0XHRcdC8vIGFscmVhZHkgY3JlYXRlZC5cblx0XHRcdGlmICh0aGlzLnNwbGl0dmlldykge1xuXHRcdFx0XHR0aGlzLnJlY3JlYXRlU3BsaXR2aWV3KCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZWNyZWF0ZVNwbGl0dmlldygpOiB2b2lkIHtcblx0XHRjb25zdCBjb250YWluZXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLmdldENvbnRhaW5lcigpKTtcblxuXHRcdC8vIENsZWFyIG9sZCAoaWYgYW55KSBidXQgcmVtZW1iZXIgcmF0aW9cblx0XHRjb25zdCByYXRpbyA9IHRoaXMuZ2V0U3BsaXRWaWV3UmF0aW8oKTtcblx0XHRpZiAodGhpcy5zcGxpdHZpZXcpIHtcblx0XHRcdHRoaXMuc3BsaXR2aWV3LmVsLnJlbW92ZSgpO1xuXHRcdFx0dGhpcy5zcGxpdHZpZXdEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdH1cblxuXHRcdC8vIENyZWF0ZSBuZXdcblx0XHR0aGlzLmNyZWF0ZVNwbGl0Vmlldyhjb250YWluZXIsIHJhdGlvKTtcblxuXHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0U3BsaXRWaWV3UmF0aW8oKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRsZXQgcmF0aW86IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGlmICh0aGlzLnNwbGl0dmlldykge1xuXHRcdFx0Y29uc3QgbGVmdFZpZXdTaXplID0gdGhpcy5zcGxpdHZpZXcuZ2V0Vmlld1NpemUoMCk7XG5cdFx0XHRjb25zdCByaWdodFZpZXdTaXplID0gdGhpcy5zcGxpdHZpZXcuZ2V0Vmlld1NpemUoMSk7XG5cblx0XHRcdC8vIE9ubHkgcmV0dXJuIGEgcmF0aW8gd2hlbiB0aGUgdmlldyBzaXplIGlzIHNpZ25pZmljYW50bHlcblx0XHRcdC8vIGVub3VnaCBkaWZmZXJlbnQgZm9yIGxlZnQgYW5kIHJpZ2h0IHZpZXcgc2l6ZXNcblx0XHRcdGlmIChNYXRoLmFicyhsZWZ0Vmlld1NpemUgLSByaWdodFZpZXdTaXplKSA+IDEpIHtcblx0XHRcdFx0Y29uc3QgdG90YWxTaXplID0gdGhpcy5zcGxpdHZpZXcub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyB0aGlzLmRpbWVuc2lvbi53aWR0aCA6IHRoaXMuZGltZW5zaW9uLmhlaWdodDtcblx0XHRcdFx0cmF0aW8gPSBsZWZ0Vmlld1NpemUgLyB0b3RhbFNpemU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJhdGlvO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUVkaXRvcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0cGFyZW50LmNsYXNzTGlzdC5hZGQoJ3NpZGUtYnktc2lkZS1lZGl0b3InKTtcblxuXHRcdC8vIEVkaXRvciBwYW5lIGNvbnRhaW5lcnNcblx0XHR0aGlzLnNlY29uZGFyeUVkaXRvckNvbnRhaW5lciA9ICQoJy5zaWRlLWJ5LXNpZGUtZWRpdG9yLWNvbnRhaW5lci5lZGl0b3ItaW5zdGFuY2UnKTtcblx0XHR0aGlzLnByaW1hcnlFZGl0b3JDb250YWluZXIgPSAkKCcuc2lkZS1ieS1zaWRlLWVkaXRvci1jb250YWluZXIuZWRpdG9yLWluc3RhbmNlJyk7XG5cblx0XHQvLyBTcGxpdCB2aWV3XG5cdFx0dGhpcy5jcmVhdGVTcGxpdFZpZXcocGFyZW50KTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU3BsaXRWaWV3KHBhcmVudDogSFRNTEVsZW1lbnQsIHJhdGlvPzogbnVtYmVyKTogdm9pZCB7XG5cblx0XHQvLyBTcGxpdHZpZXcgd2lkZ2V0XG5cdFx0dGhpcy5zcGxpdHZpZXcgPSB0aGlzLnNwbGl0dmlld0Rpc3Bvc2FibGVzLmFkZChuZXcgU3BsaXRWaWV3KHBhcmVudCwgeyBvcmllbnRhdGlvbjogdGhpcy5vcmllbnRhdGlvbiB9KSk7XG5cdFx0dGhpcy5zcGxpdHZpZXdEaXNwb3NhYmxlcy5hZGQodGhpcy5zcGxpdHZpZXcub25EaWRTYXNoUmVzZXQoKCkgPT4gdGhpcy5zcGxpdHZpZXc/LmRpc3RyaWJ1dGVWaWV3U2l6ZXMoKSkpO1xuXG5cdFx0aWYgKHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwpIHtcblx0XHRcdHRoaXMuc3BsaXR2aWV3Lm9ydGhvZ29uYWxFbmRTYXNoID0gdGhpcy5fYm91bmRhcnlTYXNoZXM/LmJvdHRvbTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zcGxpdHZpZXcub3J0aG9nb25hbFN0YXJ0U2FzaCA9IHRoaXMuX2JvdW5kYXJ5U2FzaGVzPy5sZWZ0O1xuXHRcdFx0dGhpcy5zcGxpdHZpZXcub3J0aG9nb25hbEVuZFNhc2ggPSB0aGlzLl9ib3VuZGFyeVNhc2hlcz8ucmlnaHQ7XG5cdFx0fVxuXG5cdFx0Ly8gRmlndXJlIG91dCBzaXppbmdcblx0XHRsZXQgbGVmdFNpemluZzogbnVtYmVyIHwgU2l6aW5nID0gU2l6aW5nLkRpc3RyaWJ1dGU7XG5cdFx0bGV0IHJpZ2h0U2l6aW5nOiBudW1iZXIgfCBTaXppbmcgPSBTaXppbmcuRGlzdHJpYnV0ZTtcblx0XHRpZiAocmF0aW8pIHtcblx0XHRcdGNvbnN0IHRvdGFsU2l6ZSA9IHRoaXMuc3BsaXR2aWV3Lm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gdGhpcy5kaW1lbnNpb24ud2lkdGggOiB0aGlzLmRpbWVuc2lvbi5oZWlnaHQ7XG5cblx0XHRcdGxlZnRTaXppbmcgPSBNYXRoLnJvdW5kKHRvdGFsU2l6ZSAqIHJhdGlvKTtcblx0XHRcdHJpZ2h0U2l6aW5nID0gdG90YWxTaXplIC0gbGVmdFNpemluZztcblxuXHRcdFx0Ly8gV2UgbmVlZCB0byBjYWxsIGBsYXlvdXRgIGZvciB0aGUgYHJhdGlvYCB0byBoYXZlIGFueSBlZmZlY3Rcblx0XHRcdHRoaXMuc3BsaXR2aWV3LmxheW91dCh0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gdGhpcy5kaW1lbnNpb24ud2lkdGggOiB0aGlzLmRpbWVuc2lvbi5oZWlnaHQpO1xuXHRcdH1cblxuXHRcdC8vIFNlY29uZGFyeSAobGVmdClcblx0XHRjb25zdCBzZWNvbmRhcnlFZGl0b3JDb250YWluZXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLnNlY29uZGFyeUVkaXRvckNvbnRhaW5lcik7XG5cdFx0dGhpcy5zcGxpdHZpZXcuYWRkVmlldyh7XG5cdFx0XHRlbGVtZW50OiBzZWNvbmRhcnlFZGl0b3JDb250YWluZXIsXG5cdFx0XHRsYXlvdXQ6IHNpemUgPT4gdGhpcy5sYXlvdXRQYW5lKHRoaXMuc2Vjb25kYXJ5RWRpdG9yUGFuZSwgc2l6ZSksXG5cdFx0XHRtaW5pbXVtU2l6ZTogdGhpcy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IERFRkFVTFRfRURJVE9SX01JTl9ESU1FTlNJT05TLndpZHRoIDogREVGQVVMVF9FRElUT1JfTUlOX0RJTUVOU0lPTlMuaGVpZ2h0LFxuXHRcdFx0bWF4aW11bVNpemU6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSxcblx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lXG5cdFx0fSwgbGVmdFNpemluZyk7XG5cblx0XHQvLyBQcmltYXJ5IChyaWdodClcblx0XHRjb25zdCBwcmltYXJ5RWRpdG9yQ29udGFpbmVyID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGhpcy5wcmltYXJ5RWRpdG9yQ29udGFpbmVyKTtcblx0XHR0aGlzLnNwbGl0dmlldy5hZGRWaWV3KHtcblx0XHRcdGVsZW1lbnQ6IHByaW1hcnlFZGl0b3JDb250YWluZXIsXG5cdFx0XHRsYXlvdXQ6IHNpemUgPT4gdGhpcy5sYXlvdXRQYW5lKHRoaXMucHJpbWFyeUVkaXRvclBhbmUsIHNpemUpLFxuXHRcdFx0bWluaW11bVNpemU6IHRoaXMub3JpZW50YXRpb24gPT09IE9yaWVudGF0aW9uLkhPUklaT05UQUwgPyBERUZBVUxUX0VESVRPUl9NSU5fRElNRU5TSU9OUy53aWR0aCA6IERFRkFVTFRfRURJVE9SX01JTl9ESU1FTlNJT05TLmhlaWdodCxcblx0XHRcdG1heGltdW1TaXplOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksXG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZVxuXHRcdH0sIHJpZ2h0U2l6aW5nKTtcblxuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRUaXRsZSgpOiBzdHJpbmcge1xuXHRcdGlmICh0aGlzLmlucHV0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5pbnB1dC5nZXROYW1lKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGxvY2FsaXplKCdzaWRlQnlTaWRlRWRpdG9yJywgXCJTaWRlIGJ5IFNpZGUgRWRpdG9yXCIpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2V0SW5wdXQoaW5wdXQ6IFNpZGVCeVNpZGVFZGl0b3JJbnB1dCwgb3B0aW9uczogSVNpZGVCeVNpZGVFZGl0b3JPcHRpb25zIHwgdW5kZWZpbmVkLCBjb250ZXh0OiBJRWRpdG9yT3BlbkNvbnRleHQsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IG9sZElucHV0ID0gdGhpcy5pbnB1dDtcblx0XHRhd2FpdCBzdXBlci5zZXRJbnB1dChpbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pO1xuXG5cdFx0Ly8gQ3JlYXRlIG5ldyBzaWRlIGJ5IHNpZGUgZWRpdG9ycyBpZiBlaXRoZXIgd2UgaGF2ZSBub3Rcblx0XHQvLyBiZWVuIGNyZWF0ZWQgYmVmb3JlIG9yIHRoZSBpbnB1dCBubyBsb25nZXIgbWF0Y2hlcy5cblx0XHRpZiAoIW9sZElucHV0IHx8ICFpbnB1dC5tYXRjaGVzKG9sZElucHV0KSkge1xuXHRcdFx0aWYgKG9sZElucHV0KSB7XG5cdFx0XHRcdHRoaXMuZGlzcG9zZUVkaXRvcnMoKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5jcmVhdGVFZGl0b3JzKGlucHV0KTtcblx0XHR9XG5cblx0XHQvLyBSZXN0b3JlIGFueSBwcmV2aW91cyB2aWV3IHN0YXRlXG5cdFx0Y29uc3QgeyBwcmltYXJ5LCBzZWNvbmRhcnksIHZpZXdTdGF0ZSB9ID0gdGhpcy5sb2FkVmlld1N0YXRlKGlucHV0LCBvcHRpb25zLCBjb250ZXh0KTtcblx0XHR0aGlzLmxhc3RGb2N1c2VkU2lkZSA9IHZpZXdTdGF0ZT8uZm9jdXM7XG5cblx0XHRpZiAodHlwZW9mIHZpZXdTdGF0ZT8ucmF0aW8gPT09ICdudW1iZXInICYmIHRoaXMuc3BsaXR2aWV3KSB7XG5cdFx0XHRjb25zdCB0b3RhbFNpemUgPSB0aGlzLnNwbGl0dmlldy5vcmllbnRhdGlvbiA9PT0gT3JpZW50YXRpb24uSE9SSVpPTlRBTCA/IHRoaXMuZGltZW5zaW9uLndpZHRoIDogdGhpcy5kaW1lbnNpb24uaGVpZ2h0O1xuXG5cdFx0XHR0aGlzLnNwbGl0dmlldy5yZXNpemVWaWV3KDAsIE1hdGgucm91bmQodG90YWxTaXplICogdmlld1N0YXRlLnJhdGlvKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3BsaXR2aWV3Py5kaXN0cmlidXRlVmlld1NpemVzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gU2V0IGlucHV0IHRvIGJvdGggc2lkZXNcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR0aGlzLnNlY29uZGFyeUVkaXRvclBhbmU/LnNldElucHV0KGlucHV0LnNlY29uZGFyeSwgc2Vjb25kYXJ5LCBjb250ZXh0LCB0b2tlbiksXG5cdFx0XHR0aGlzLnByaW1hcnlFZGl0b3JQYW5lPy5zZXRJbnB1dChpbnB1dC5wcmltYXJ5LCBwcmltYXJ5LCBjb250ZXh0LCB0b2tlbilcblx0XHRdKTtcblxuXHRcdC8vIFVwZGF0ZSBmb2N1cyBpZiB0YXJnZXQgaXMgcHJvdmlkZWRcblx0XHRpZiAodHlwZW9mIG9wdGlvbnM/LnRhcmdldCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMubGFzdEZvY3VzZWRTaWRlID0gb3B0aW9ucy50YXJnZXQ7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBsb2FkVmlld1N0YXRlKGlucHV0OiBTaWRlQnlTaWRlRWRpdG9ySW5wdXQsIG9wdGlvbnM6IElTaWRlQnlTaWRlRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0KTogeyBwcmltYXJ5OiBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZDsgc2Vjb25kYXJ5OiBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZDsgdmlld1N0YXRlOiBJU2lkZUJ5U2lkZUVkaXRvclZpZXdTdGF0ZSB8IHVuZGVmaW5lZCB9IHtcblx0XHRjb25zdCB2aWV3U3RhdGUgPSBpc1NpZGVCeVNpZGVFZGl0b3JWaWV3U3RhdGUob3B0aW9ucz8udmlld1N0YXRlKSA/IG9wdGlvbnM/LnZpZXdTdGF0ZSA6IHRoaXMubG9hZEVkaXRvclZpZXdTdGF0ZShpbnB1dCwgY29udGV4dCk7XG5cblx0XHRsZXQgcHJpbWFyeU9wdGlvbnM6IElFZGl0b3JPcHRpb25zID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRsZXQgc2Vjb25kYXJ5T3B0aW9uczogSUVkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHQvLyBEZXBlbmRpbmcgb24gdGhlIG9wdGlvbmFsIGB0YXJnZXRgIHByb3BlcnR5LCB3ZSBhcHBseVxuXHRcdC8vIHRoZSBwcm92aWRlZCBvcHRpb25zIHRvIGVpdGhlciB0aGUgcHJpbWFyeSBvciBzZWNvbmRhcnlcblx0XHQvLyBzaWRlXG5cblx0XHRpZiAob3B0aW9ucz8udGFyZ2V0ID09PSBTaWRlLlNFQ09OREFSWSkge1xuXHRcdFx0c2Vjb25kYXJ5T3B0aW9ucyA9IHsgLi4ub3B0aW9ucyB9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwcmltYXJ5T3B0aW9ucyA9IHsgLi4ub3B0aW9ucyB9O1xuXHRcdH1cblxuXHRcdHByaW1hcnlPcHRpb25zLnZpZXdTdGF0ZSA9IHZpZXdTdGF0ZT8ucHJpbWFyeTtcblxuXHRcdGlmICh2aWV3U3RhdGU/LnNlY29uZGFyeSkge1xuXHRcdFx0aWYgKCFzZWNvbmRhcnlPcHRpb25zKSB7XG5cdFx0XHRcdHNlY29uZGFyeU9wdGlvbnMgPSB7IHZpZXdTdGF0ZTogdmlld1N0YXRlLnNlY29uZGFyeSB9O1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2Vjb25kYXJ5T3B0aW9ucy52aWV3U3RhdGUgPSB2aWV3U3RhdGU/LnNlY29uZGFyeTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4geyBwcmltYXJ5OiBwcmltYXJ5T3B0aW9ucywgc2Vjb25kYXJ5OiBzZWNvbmRhcnlPcHRpb25zLCB2aWV3U3RhdGUgfTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRWRpdG9ycyhuZXdJbnB1dDogU2lkZUJ5U2lkZUVkaXRvcklucHV0KTogdm9pZCB7XG5cblx0XHQvLyBDcmVhdGUgZWRpdG9yc1xuXHRcdHRoaXMuc2Vjb25kYXJ5RWRpdG9yUGFuZSA9IHRoaXMuZG9DcmVhdGVFZGl0b3IobmV3SW5wdXQuc2Vjb25kYXJ5LCBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLnNlY29uZGFyeUVkaXRvckNvbnRhaW5lcikpO1xuXHRcdHRoaXMucHJpbWFyeUVkaXRvclBhbmUgPSB0aGlzLmRvQ3JlYXRlRWRpdG9yKG5ld0lucHV0LnByaW1hcnksIGFzc2VydFJldHVybnNEZWZpbmVkKHRoaXMucHJpbWFyeUVkaXRvckNvbnRhaW5lcikpO1xuXG5cdFx0Ly8gTGF5b3V0XG5cdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXG5cdFx0Ly8gRXZlbnRpbmdcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNpemVDb25zdHJhaW50cy5pbnB1dCA9IEV2ZW50LmFueShcblx0XHRcdEV2ZW50Lm1hcCh0aGlzLnNlY29uZGFyeUVkaXRvclBhbmUub25EaWRDaGFuZ2VTaXplQ29uc3RyYWludHMsICgpID0+IHVuZGVmaW5lZCksXG5cdFx0XHRFdmVudC5tYXAodGhpcy5wcmltYXJ5RWRpdG9yUGFuZS5vbkRpZENoYW5nZVNpemVDb25zdHJhaW50cywgKCkgPT4gdW5kZWZpbmVkKVxuXHRcdCk7XG5cdFx0dGhpcy5vbkRpZENyZWF0ZUVkaXRvcnMuZmlyZSh1bmRlZmluZWQpO1xuXG5cdFx0Ly8gVHJhY2sgZm9jdXMgYW5kIHNpZ25hbCBhY3RpdmUgY29udHJvbCBjaGFuZ2UgdmlhIGV2ZW50XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5wcmltYXJ5RWRpdG9yUGFuZS5vbkRpZEZvY3VzKCgpID0+IHRoaXMub25EaWRGb2N1c0NoYW5nZShTaWRlLlBSSU1BUlkpKSk7XG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQodGhpcy5zZWNvbmRhcnlFZGl0b3JQYW5lLm9uRGlkRm9jdXMoKCkgPT4gdGhpcy5vbkRpZEZvY3VzQ2hhbmdlKFNpZGUuU0VDT05EQVJZKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0NyZWF0ZUVkaXRvcihlZGl0b3JJbnB1dDogRWRpdG9ySW5wdXQsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBFZGl0b3JQYW5lIHtcblx0XHRjb25zdCBlZGl0b3JQYW5lRGVzY3JpcHRvciA9IFJlZ2lzdHJ5LmFzPElFZGl0b3JQYW5lUmVnaXN0cnk+KEVkaXRvckV4dGVuc2lvbnMuRWRpdG9yUGFuZSkuZ2V0RWRpdG9yUGFuZShlZGl0b3JJbnB1dCk7XG5cdFx0aWYgKCFlZGl0b3JQYW5lRGVzY3JpcHRvcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyBlZGl0b3IgcGFuZSBkZXNjcmlwdG9yIGZvciBlZGl0b3IgZm91bmQnKTtcblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgZWRpdG9yIHBhbmUgYW5kIG1ha2UgdmlzaWJsZVxuXHRcdGNvbnN0IGVkaXRvclBhbmUgPSBlZGl0b3JQYW5lRGVzY3JpcHRvci5pbnN0YW50aWF0ZSh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLmdyb3VwKTtcblx0XHRlZGl0b3JQYW5lLmNyZWF0ZShjb250YWluZXIpO1xuXHRcdGVkaXRvclBhbmUuc2V0VmlzaWJsZSh0aGlzLmlzVmlzaWJsZSgpKTtcblxuXHRcdC8vIFRyYWNrIHNlbGVjdGlvbnMgaWYgc3VwcG9ydGVkXG5cdFx0aWYgKGlzRWRpdG9yUGFuZVdpdGhTZWxlY3Rpb24oZWRpdG9yUGFuZSkpIHtcblx0XHRcdHRoaXMuZWRpdG9yRGlzcG9zYWJsZXMuYWRkKGVkaXRvclBhbmUub25EaWRDaGFuZ2VTZWxlY3Rpb24oZSA9PiB0aGlzLl9vbkRpZENoYW5nZVNlbGVjdGlvbi5maXJlKGUpKSk7XG5cdFx0fVxuXG5cdFx0Ly8gVHJhY2sgZm9yIGRpc3Bvc2FsXG5cdFx0dGhpcy5lZGl0b3JEaXNwb3NhYmxlcy5hZGQoZWRpdG9yUGFuZSk7XG5cblx0XHRyZXR1cm4gZWRpdG9yUGFuZTtcblx0fVxuXG5cdHByaXZhdGUgb25EaWRGb2N1c0NoYW5nZShzaWRlOiBTaWRlLlBSSU1BUlkgfCBTaWRlLlNFQ09OREFSWSk6IHZvaWQge1xuXHRcdHRoaXMubGFzdEZvY3VzZWRTaWRlID0gc2lkZTtcblxuXHRcdC8vIFNpZ25hbCB0byBvdXRzaWRlIHRoYXQgb3VyIGFjdGl2ZSBjb250cm9sIGNoYW5nZWRcblx0XHR0aGlzLl9vbkRpZENoYW5nZUNvbnRyb2wuZmlyZSgpO1xuXHR9XG5cblx0Z2V0U2VsZWN0aW9uKCk6IElFZGl0b3JQYW5lU2VsZWN0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsYXN0Rm9jdXNlZEVkaXRvclBhbmUgPSB0aGlzLmdldExhc3RGb2N1c2VkRWRpdG9yUGFuZSgpO1xuXHRcdGlmIChpc0VkaXRvclBhbmVXaXRoU2VsZWN0aW9uKGxhc3RGb2N1c2VkRWRpdG9yUGFuZSkpIHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IGxhc3RGb2N1c2VkRWRpdG9yUGFuZS5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGlmIChzZWxlY3Rpb24pIHtcblx0XHRcdFx0cmV0dXJuIG5ldyBTaWRlQnlTaWRlQXdhcmVFZGl0b3JQYW5lU2VsZWN0aW9uKHNlbGVjdGlvbiwgbGFzdEZvY3VzZWRFZGl0b3JQYW5lID09PSB0aGlzLnByaW1hcnlFZGl0b3JQYW5lID8gU2lkZS5QUklNQVJZIDogU2lkZS5TRUNPTkRBUlkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRPcHRpb25zKG9wdGlvbnM6IElTaWRlQnlTaWRlRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHN1cGVyLnNldE9wdGlvbnMob3B0aW9ucyk7XG5cblx0XHQvLyBVcGRhdGUgZm9jdXMgaWYgdGFyZ2V0IGlzIHByb3ZpZGVkXG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zPy50YXJnZXQgPT09ICdudW1iZXInKSB7XG5cdFx0XHR0aGlzLmxhc3RGb2N1c2VkU2lkZSA9IG9wdGlvbnMudGFyZ2V0O1xuXHRcdH1cblxuXHRcdC8vIEFwcGx5IHRvIGZvY3VzZWQgc2lkZVxuXHRcdHRoaXMuZ2V0TGFzdEZvY3VzZWRFZGl0b3JQYW5lKCk/LnNldE9wdGlvbnMob3B0aW9ucyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgc2V0RWRpdG9yVmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cblx0XHQvLyBGb3J3YXJkIHRvIGJvdGggc2lkZXNcblx0XHR0aGlzLnByaW1hcnlFZGl0b3JQYW5lPy5zZXRWaXNpYmxlKHZpc2libGUpO1xuXHRcdHRoaXMuc2Vjb25kYXJ5RWRpdG9yUGFuZT8uc2V0VmlzaWJsZSh2aXNpYmxlKTtcblxuXHRcdHN1cGVyLnNldEVkaXRvclZpc2libGUodmlzaWJsZSk7XG5cdH1cblxuXHRvdmVycmlkZSBjbGVhcklucHV0KCk6IHZvaWQge1xuXHRcdHN1cGVyLmNsZWFySW5wdXQoKTtcblxuXHRcdC8vIEZvcndhcmQgdG8gYm90aCBzaWRlc1xuXHRcdHRoaXMucHJpbWFyeUVkaXRvclBhbmU/LmNsZWFySW5wdXQoKTtcblx0XHR0aGlzLnNlY29uZGFyeUVkaXRvclBhbmU/LmNsZWFySW5wdXQoKTtcblxuXHRcdC8vIFNpbmNlIHdlIGRvIG5vdCBrZWVwIHNpZGUgZWRpdG9ycyBhbGl2ZVxuXHRcdC8vIHdlIGRpc3Bvc2UgYW55IGVkaXRvciBjcmVhdGVkIGZvciByZWNyZWF0aW9uXG5cdFx0dGhpcy5kaXNwb3NlRWRpdG9ycygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblxuXHRcdHRoaXMuZ2V0TGFzdEZvY3VzZWRFZGl0b3JQYW5lKCk/LmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldExhc3RGb2N1c2VkRWRpdG9yUGFuZSgpOiBFZGl0b3JQYW5lIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5sYXN0Rm9jdXNlZFNpZGUgPT09IFNpZGUuU0VDT05EQVJZKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5zZWNvbmRhcnlFZGl0b3JQYW5lO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnByaW1hcnlFZGl0b3JQYW5lO1xuXHR9XG5cblx0bGF5b3V0KGRpbWVuc2lvbjogRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kaW1lbnNpb24gPSBkaW1lbnNpb247XG5cblx0XHRjb25zdCBzcGxpdHZpZXcgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLnNwbGl0dmlldyk7XG5cdFx0c3BsaXR2aWV3LmxheW91dCh0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gZGltZW5zaW9uLndpZHRoIDogZGltZW5zaW9uLmhlaWdodCk7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRCb3VuZGFyeVNhc2hlcyhzYXNoZXM6IElCb3VuZGFyeVNhc2hlcykge1xuXHRcdHRoaXMuX2JvdW5kYXJ5U2FzaGVzID0gc2FzaGVzO1xuXG5cdFx0aWYgKHRoaXMuc3BsaXR2aWV3KSB7XG5cdFx0XHR0aGlzLnNwbGl0dmlldy5vcnRob2dvbmFsRW5kU2FzaCA9IHNhc2hlcy5ib3R0b207XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRQYW5lKHBhbmU6IEVkaXRvclBhbmUgfCB1bmRlZmluZWQsIHNpemU6IG51bWJlcik6IHZvaWQge1xuXHRcdHBhbmU/LmxheW91dCh0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMID8gbmV3IERpbWVuc2lvbihzaXplLCB0aGlzLmRpbWVuc2lvbi5oZWlnaHQpIDogbmV3IERpbWVuc2lvbih0aGlzLmRpbWVuc2lvbi53aWR0aCwgc2l6ZSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0Q29udHJvbCgpOiBJRWRpdG9yQ29udHJvbCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0TGFzdEZvY3VzZWRFZGl0b3JQYW5lKCk/LmdldENvbnRyb2woKTtcblx0fVxuXG5cdGdldFByaW1hcnlFZGl0b3JQYW5lKCk6IElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5wcmltYXJ5RWRpdG9yUGFuZTtcblx0fVxuXG5cdGdldFNlY29uZGFyeUVkaXRvclBhbmUoKTogSUVkaXRvclBhbmUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnNlY29uZGFyeUVkaXRvclBhbmU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgdHJhY2tzRWRpdG9yVmlld1N0YXRlKGlucHV0OiBFZGl0b3JJbnB1dCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpbnB1dCBpbnN0YW5jZW9mIFNpZGVCeVNpZGVFZGl0b3JJbnB1dDtcblx0fVxuXG5cdHByb3RlY3RlZCBjb21wdXRlRWRpdG9yVmlld1N0YXRlKHJlc291cmNlOiBVUkkpOiBJU2lkZUJ5U2lkZUVkaXRvclZpZXdTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLmlucHV0IHx8ICFpc0VxdWFsKHJlc291cmNlLCB0aGlzLnRvRWRpdG9yVmlld1N0YXRlUmVzb3VyY2UodGhpcy5pbnB1dCkpKSB7XG5cdFx0XHRyZXR1cm47IC8vIHVuZXhwZWN0ZWQgc3RhdGVcblx0XHR9XG5cblx0XHRjb25zdCBwcmltYXJWaWV3U3RhdGUgPSB0aGlzLnByaW1hcnlFZGl0b3JQYW5lPy5nZXRWaWV3U3RhdGUoKTtcblx0XHRjb25zdCBzZWNvbmRhcnlWaWV3U3RhdGUgPSB0aGlzLnNlY29uZGFyeUVkaXRvclBhbmU/LmdldFZpZXdTdGF0ZSgpO1xuXG5cdFx0aWYgKCFwcmltYXJWaWV3U3RhdGUgfHwgIXNlY29uZGFyeVZpZXdTdGF0ZSkge1xuXHRcdFx0cmV0dXJuOyAvLyB3ZSBhY3R1YWxseSBuZWVkIHZpZXcgc3RhdGVzXG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHByaW1hcnk6IHByaW1hclZpZXdTdGF0ZSxcblx0XHRcdHNlY29uZGFyeTogc2Vjb25kYXJ5Vmlld1N0YXRlLFxuXHRcdFx0Zm9jdXM6IHRoaXMubGFzdEZvY3VzZWRTaWRlLFxuXHRcdFx0cmF0aW86IHRoaXMuZ2V0U3BsaXRWaWV3UmF0aW8oKVxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgdG9FZGl0b3JWaWV3U3RhdGVSZXNvdXJjZShpbnB1dDogRWRpdG9ySW5wdXQpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdGxldCBwcmltYXJ5OiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHNlY29uZGFyeTogVVJJIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGlucHV0IGluc3RhbmNlb2YgU2lkZUJ5U2lkZUVkaXRvcklucHV0KSB7XG5cdFx0XHRwcmltYXJ5ID0gaW5wdXQucHJpbWFyeS5yZXNvdXJjZTtcblx0XHRcdHNlY29uZGFyeSA9IGlucHV0LnNlY29uZGFyeS5yZXNvdXJjZTtcblx0XHR9XG5cblx0XHRpZiAoIXNlY29uZGFyeSB8fCAhcHJpbWFyeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBjcmVhdGUgYSBVUkkgdGhhdCBpcyB0aGUgQmFzZTY0IGNvbmNhdGVuYXRpb24gb2Ygb3JpZ2luYWwgKyBtb2RpZmllZCByZXNvdXJjZVxuXHRcdHJldHVybiBVUkkuZnJvbSh7IHNjaGVtZTogJ3NpZGVCeVNpZGUnLCBwYXRoOiBgJHttdWx0aWJ5dGVBd2FyZUJ0b2Eoc2Vjb25kYXJ5LnRvU3RyaW5nKCkpfSR7bXVsdGlieXRlQXdhcmVCdG9hKHByaW1hcnkudG9TdHJpbmcoKSl9YCB9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZVN0eWxlcygpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVTdHlsZXMoKTtcblxuXHRcdGlmICh0aGlzLnByaW1hcnlFZGl0b3JDb250YWluZXIpIHtcblx0XHRcdGlmICh0aGlzLm9yaWVudGF0aW9uID09PSBPcmllbnRhdGlvbi5IT1JJWk9OVEFMKSB7XG5cdFx0XHRcdHRoaXMucHJpbWFyeUVkaXRvckNvbnRhaW5lci5zdHlsZS5ib3JkZXJMZWZ0V2lkdGggPSAnMXB4Jztcblx0XHRcdFx0dGhpcy5wcmltYXJ5RWRpdG9yQ29udGFpbmVyLnN0eWxlLmJvcmRlckxlZnRTdHlsZSA9ICdzb2xpZCc7XG5cdFx0XHRcdHRoaXMucHJpbWFyeUVkaXRvckNvbnRhaW5lci5zdHlsZS5ib3JkZXJMZWZ0Q29sb3IgPSB0aGlzLmdldENvbG9yKFNJREVfQllfU0lERV9FRElUT1JfVkVSVElDQUxfQk9SREVSKSA/PyAnJztcblxuXHRcdFx0XHR0aGlzLnByaW1hcnlFZGl0b3JDb250YWluZXIuc3R5bGUuYm9yZGVyVG9wV2lkdGggPSAnMCc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnByaW1hcnlFZGl0b3JDb250YWluZXIuc3R5bGUuYm9yZGVyVG9wV2lkdGggPSAnMXB4Jztcblx0XHRcdFx0dGhpcy5wcmltYXJ5RWRpdG9yQ29udGFpbmVyLnN0eWxlLmJvcmRlclRvcFN0eWxlID0gJ3NvbGlkJztcblx0XHRcdFx0dGhpcy5wcmltYXJ5RWRpdG9yQ29udGFpbmVyLnN0eWxlLmJvcmRlclRvcENvbG9yID0gdGhpcy5nZXRDb2xvcihTSURFX0JZX1NJREVfRURJVE9SX0hPUklaT05UQUxfQk9SREVSKSA/PyAnJztcblxuXHRcdFx0XHR0aGlzLnByaW1hcnlFZGl0b3JDb250YWluZXIuc3R5bGUuYm9yZGVyTGVmdFdpZHRoID0gJzAnO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NlRWRpdG9ycygpO1xuXG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBkaXNwb3NlRWRpdG9ycygpOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRvckRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHR0aGlzLnNlY29uZGFyeUVkaXRvclBhbmUgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5wcmltYXJ5RWRpdG9yUGFuZSA9IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMubGFzdEZvY3VzZWRTaWRlID0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHRoaXMuc2Vjb25kYXJ5RWRpdG9yQ29udGFpbmVyKSB7XG5cdFx0XHRjbGVhck5vZGUodGhpcy5zZWNvbmRhcnlFZGl0b3JDb250YWluZXIpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnByaW1hcnlFZGl0b3JDb250YWluZXIpIHtcblx0XHRcdGNsZWFyTm9kZSh0aGlzLnByaW1hcnlFZGl0b3JDb250YWluZXIpO1xuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBTaWRlQnlTaWRlQXdhcmVFZGl0b3JQYW5lU2VsZWN0aW9uIGltcGxlbWVudHMgSUVkaXRvclBhbmVTZWxlY3Rpb24ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgc2VsZWN0aW9uOiBJRWRpdG9yUGFuZVNlbGVjdGlvbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHNpZGU6IFNpZGUuUFJJTUFSWSB8IFNpZGUuU0VDT05EQVJZXG5cdCkgeyB9XG5cblx0Y29tcGFyZShvdGhlcjogSUVkaXRvclBhbmVTZWxlY3Rpb24pOiBFZGl0b3JQYW5lU2VsZWN0aW9uQ29tcGFyZVJlc3VsdCB7XG5cdFx0aWYgKCEob3RoZXIgaW5zdGFuY2VvZiBTaWRlQnlTaWRlQXdhcmVFZGl0b3JQYW5lU2VsZWN0aW9uKSkge1xuXHRcdFx0cmV0dXJuIEVkaXRvclBhbmVTZWxlY3Rpb25Db21wYXJlUmVzdWx0LkRJRkZFUkVOVDtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zaWRlICE9PSBvdGhlci5zaWRlKSB7XG5cdFx0XHRyZXR1cm4gRWRpdG9yUGFuZVNlbGVjdGlvbkNvbXBhcmVSZXN1bHQuRElGRkVSRU5UO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnNlbGVjdGlvbi5jb21wYXJlKG90aGVyLnNlbGVjdGlvbik7XG5cdH1cblxuXHRyZXN0b3JlKG9wdGlvbnM6IElFZGl0b3JPcHRpb25zKTogSVNpZGVCeVNpZGVFZGl0b3JPcHRpb25zIHtcblx0XHRjb25zdCBzaWRlQnlTaWRlRWRpdG9yT3B0aW9uczogSVNpZGVCeVNpZGVFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdHRhcmdldDogdGhpcy5zaWRlXG5cdFx0fTtcblxuXHRcdHJldHVybiB0aGlzLnNlbGVjdGlvbi5yZXN0b3JlKHNpZGVCeVNpZGVFZGl0b3JPcHRpb25zKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXLEdBQUcsaUJBQWlCO0FBQ3hDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTBELGtCQUFrQix3QkFBd0Isb0JBQW9CLE1BQXVGLDJCQUEyQix3Q0FBd0M7QUFDbFIsU0FBUyw2QkFBNkI7QUFHdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxxQkFBcUI7QUFHOUIsU0FBdUIsNEJBQTRCO0FBQ25ELFNBQVMsV0FBVyxRQUFRLG1CQUFtQjtBQUMvQyxTQUFTLE9BQU8sT0FBTyxlQUFlO0FBQ3RDLFNBQVMsdUJBQXVCO0FB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
