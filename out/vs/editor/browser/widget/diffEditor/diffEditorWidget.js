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
import { getWindow, h } from "../../../../base/browser/dom.js";
import { findLast } from "../../../../base/common/arraysFind.js";
import { BugIndicatingError, onUnexpectedError } from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { readHotReloadableExport } from "../../../../base/common/hotReloadHelpers.js";
import { toDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, autorunWithStore, derived, derivedDisposable, disposableObservableValue, observableFromEvent, observableValue, recomputeInitiallyAndOnChange, subtransaction, transaction } from "../../../../base/common/observable.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { bindContextKey } from "../../../../platform/observable/common/platformObservableUtils.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { LineRange } from "../../../common/core/ranges/lineRange.js";
import { Position } from "../../../common/core/position.js";
import { Range } from "../../../common/core/range.js";
import { CursorChangeReason } from "../../../common/cursorEvents.js";
import { EditorType } from "../../../common/editorCommon.js";
import { EditorContextKeys } from "../../../common/editorContextKeys.js";
import { EditorExtensionsRegistry } from "../../editorExtensions.js";
import { ICodeEditorService } from "../../services/codeEditorService.js";
import { StableEditorScrollState } from "../../stableEditorScroll.js";
import { CodeEditorWidget } from "../codeEditor/codeEditorWidget.js";
import { AccessibleDiffViewer, AccessibleDiffViewerModelFromEditors } from "./components/accessibleDiffViewer.js";
import { DiffEditorDecorations } from "./components/diffEditorDecorations.js";
import { DiffEditorEditors } from "./components/diffEditorEditors.js";
import { DiffEditorSash, SashLayout } from "./components/diffEditorSash.js";
import { DiffEditorViewZones } from "./components/diffEditorViewZones/diffEditorViewZones.js";
import { DelegatingEditor } from "./delegatingEditorImpl.js";
import { DiffEditorOptions } from "./diffEditorOptions.js";
import { DiffEditorViewModel } from "./diffEditorViewModel.js";
import { DiffEditorGutter } from "./features/gutterFeature.js";
import { HideUnchangedRegionsFeature } from "./features/hideUnchangedRegionsFeature.js";
import { MovedBlocksLinesFeature } from "./features/movedBlocksLinesFeature.js";
import { OverviewRulerFeature } from "./features/overviewRulerFeature.js";
import { RevertButtonsFeature } from "./features/revertButtonsFeature.js";
import "./style.css";
import { ObservableElementSizeObserver, RefCounted, applyStyle, applyViewZones, translatePosition } from "./utils.js";
let DiffEditorWidget = class extends DelegatingEditor {
  constructor(_domElement, options, codeEditorWidgetOptions, _parentContextKeyService, _parentInstantiationService, _codeEditorService, _accessibilitySignalService, _editorProgressService) {
    super();
    this._domElement = _domElement;
    this._parentContextKeyService = _parentContextKeyService;
    this._parentInstantiationService = _parentInstantiationService;
    this._codeEditorService = _codeEditorService;
    this._accessibilitySignalService = _accessibilitySignalService;
    this._editorProgressService = _editorProgressService;
    this.elements = h("div.monaco-diff-editor.side-by-side", { style: { position: "relative", height: "100%" } }, [
      h("div.editor.original@original", { style: { position: "absolute", height: "100%" } }),
      h("div.editor.modified@modified", { style: { position: "absolute", height: "100%" } }),
      h("div.accessibleDiffViewer@accessibleDiffViewer", { style: { position: "absolute", height: "100%" } })
    ]);
    this._diffModelSrc = this._register(disposableObservableValue(this, void 0));
    this._diffModel = derived(this, (reader) => this._diffModelSrc.read(reader)?.object);
    this.allUnchangedRegionsShown = derived(this, (reader) => {
      const regions = this._diffModel.read(reader)?.unchangedRegions.read(reader) ?? [];
      return regions.every((r) => r.visibleLineCountTop.read(reader) + r.visibleLineCountBottom.read(reader) >= r.lineCount);
    });
    this.onDidChangeModel = Event.fromObservableLight(this._diffModel);
    this._contextKeyService = this._register(this._parentContextKeyService.createScoped(this._domElement));
    this._instantiationService = this._register(this._parentInstantiationService.createChild(
      new ServiceCollection([IContextKeyService, this._contextKeyService])
    ));
    this._boundarySashes = observableValue(this, void 0);
    this._accessibleDiffViewerShouldBeVisible = observableValue(this, false);
    this._accessibleDiffViewerVisible = derived(
      this,
      (reader) => this._options.onlyShowAccessibleDiffViewer.read(reader) ? true : this._accessibleDiffViewerShouldBeVisible.read(reader)
    );
    this._movedBlocksLinesPart = observableValue(this, void 0);
    this._layoutInfo = derived(this, (reader) => {
      const fullWidth = this._rootSizeObserver.width.read(reader);
      const fullHeight = this._rootSizeObserver.height.read(reader);
      if (this._rootSizeObserver.automaticLayout) {
        this.elements.root.style.height = "100%";
      } else {
        this.elements.root.style.height = fullHeight + "px";
      }
      const sash = this._sash.read(reader);
      const gutter = this._gutter.read(reader);
      const gutterWidth = gutter?.width.read(reader) ?? 0;
      const overviewRulerPartWidth = this._overviewRulerPart.read(reader)?.width ?? 0;
      let originalLeft, originalWidth, modifiedLeft, modifiedWidth, gutterLeft;
      const sideBySide = !!sash;
      if (sideBySide) {
        const sashLeft = sash.sashLeft.read(reader);
        const movedBlocksLinesWidth = this._movedBlocksLinesPart.read(reader)?.width.read(reader) ?? 0;
        originalLeft = 0;
        originalWidth = sashLeft - gutterWidth - movedBlocksLinesWidth;
        gutterLeft = sashLeft - gutterWidth;
        modifiedLeft = sashLeft;
        modifiedWidth = fullWidth - modifiedLeft - overviewRulerPartWidth;
      } else {
        gutterLeft = 0;
        const shouldHideOriginalLineNumbers = this._options.inlineViewHideOriginalLineNumbers.read(reader);
        originalLeft = gutterWidth;
        if (shouldHideOriginalLineNumbers) {
          originalWidth = 0;
        } else {
          originalWidth = Math.max(5, this._editors.originalObs.layoutInfoDecorationsLeft.read(reader));
        }
        modifiedLeft = gutterWidth + originalWidth;
        modifiedWidth = fullWidth - modifiedLeft - overviewRulerPartWidth;
      }
      this.elements.original.style.left = originalLeft + "px";
      this.elements.original.style.width = originalWidth + "px";
      this._editors.original.layout({ width: originalWidth, height: fullHeight }, true);
      gutter?.layout(gutterLeft);
      this.elements.modified.style.left = modifiedLeft + "px";
      this.elements.modified.style.width = modifiedWidth + "px";
      this._editors.modified.layout({ width: modifiedWidth, height: fullHeight }, true);
      return {
        modifiedEditor: this._editors.modified.getLayoutInfo(),
        originalEditor: this._editors.original.getLayoutInfo()
      };
    });
    this._diffValue = this._diffModel.map((m, r) => m?.diff.read(r));
    this.onDidUpdateDiff = Event.fromObservableLight(this._diffValue);
    this._codeEditorService.willCreateDiffEditor();
    this._contextKeyService.createKey("isInDiffEditor", true);
    this._domElement.appendChild(this.elements.root);
    this._register(toDisposable(() => this.elements.root.remove()));
    this._rootSizeObserver = this._register(new ObservableElementSizeObserver(this.elements.root, options.dimension));
    this._rootSizeObserver.setAutomaticLayout(options.automaticLayout ?? false);
    this._options = this._instantiationService.createInstance(DiffEditorOptions, options);
    this._register(autorun((reader) => {
      this._options.setWidth(this._rootSizeObserver.width.read(reader));
    }));
    this._contextKeyService.createKey(EditorContextKeys.isEmbeddedDiffEditor.key, false);
    this._register(bindContextKey(
      EditorContextKeys.isEmbeddedDiffEditor,
      this._contextKeyService,
      (reader) => this._options.isInEmbeddedEditor.read(reader)
    ));
    this._register(bindContextKey(
      EditorContextKeys.comparingMovedCode,
      this._contextKeyService,
      (reader) => !!this._diffModel.read(reader)?.movedTextToCompare.read(reader)
    ));
    this._register(bindContextKey(
      EditorContextKeys.diffEditorRenderSideBySideInlineBreakpointReached,
      this._contextKeyService,
      (reader) => this._options.couldShowInlineViewBecauseOfSize.read(reader)
    ));
    this._register(bindContextKey(
      EditorContextKeys.diffEditorInlineMode,
      this._contextKeyService,
      (reader) => !this._options.renderSideBySide.read(reader)
    ));
    this._register(bindContextKey(
      EditorContextKeys.hasChanges,
      this._contextKeyService,
      (reader) => (this._diffModel.read(reader)?.diff.read(reader)?.mappings.length ?? 0) > 0
    ));
    this._editors = this._register(this._instantiationService.createInstance(
      DiffEditorEditors,
      this.elements.original,
      this.elements.modified,
      this._options,
      codeEditorWidgetOptions,
      (i, c, o, o2) => this._createInnerEditor(i, c, o, o2)
    ));
    this._register(bindContextKey(
      EditorContextKeys.diffEditorOriginalWritable,
      this._contextKeyService,
      (reader) => this._options.originalEditable.read(reader)
    ));
    this._register(bindContextKey(
      EditorContextKeys.diffEditorModifiedWritable,
      this._contextKeyService,
      (reader) => !this._options.readOnly.read(reader)
    ));
    this._register(bindContextKey(
      EditorContextKeys.diffEditorOriginalUri,
      this._contextKeyService,
      (reader) => this._diffModel.read(reader)?.model.original.uri.toString() ?? ""
    ));
    this._register(bindContextKey(
      EditorContextKeys.diffEditorModifiedUri,
      this._contextKeyService,
      (reader) => this._diffModel.read(reader)?.model.modified.uri.toString() ?? ""
    ));
    this._overviewRulerPart = derivedDisposable(
      this,
      (reader) => !this._options.renderOverviewRuler.read(reader) ? void 0 : this._instantiationService.createInstance(
        readHotReloadableExport(OverviewRulerFeature, reader),
        this._editors,
        this.elements.root,
        this._diffModel,
        this._rootSizeObserver.width,
        this._rootSizeObserver.height,
        this._layoutInfo.map((i) => i.modifiedEditor)
      )
    ).recomputeInitiallyAndOnChange(this._store);
    const dimensions = {
      height: this._rootSizeObserver.height,
      width: this._rootSizeObserver.width.map((w, reader) => w - (this._overviewRulerPart.read(reader)?.width ?? 0))
    };
    this._sashLayout = new SashLayout(this._options, dimensions);
    this._sash = derivedDisposable(this, (reader) => {
      const showSash = this._options.renderSideBySide.read(reader);
      this.elements.root.classList.toggle("side-by-side", showSash);
      return !showSash ? void 0 : new DiffEditorSash(
        this.elements.root,
        dimensions,
        this._options.enableSplitViewResizing,
        this._boundarySashes,
        this._sashLayout.sashLeft,
        () => this._sashLayout.resetSash()
      );
    }).recomputeInitiallyAndOnChange(this._store);
    const unchangedRangesFeature = derivedDisposable(
      this,
      (reader) => (
        /** @description UnchangedRangesFeature */
        this._instantiationService.createInstance(
          readHotReloadableExport(HideUnchangedRegionsFeature, reader),
          this._editors,
          this._diffModel,
          this._options
        )
      )
    ).recomputeInitiallyAndOnChange(this._store);
    derivedDisposable(
      this,
      (reader) => (
        /** @description DiffEditorDecorations */
        this._instantiationService.createInstance(
          readHotReloadableExport(DiffEditorDecorations, reader),
          this._editors,
          this._diffModel,
          this._options,
          this
        )
      )
    ).recomputeInitiallyAndOnChange(this._store);
    const origViewZoneIdsToIgnore = /* @__PURE__ */ new Set();
    const modViewZoneIdsToIgnore = /* @__PURE__ */ new Set();
    let isUpdatingViewZones = false;
    const viewZoneManager = derivedDisposable(
      this,
      (reader) => (
        /** @description ViewZoneManager */
        this._instantiationService.createInstance(
          readHotReloadableExport(DiffEditorViewZones, reader),
          getWindow(this._domElement),
          this._editors,
          this._diffModel,
          this._options,
          this,
          () => isUpdatingViewZones || unchangedRangesFeature.read(void 0).isUpdatingHiddenAreas,
          origViewZoneIdsToIgnore,
          modViewZoneIdsToIgnore
        )
      )
    ).recomputeInitiallyAndOnChange(this._store);
    const originalViewZones = derived(this, (reader) => {
      const orig = viewZoneManager.read(reader).viewZones.read(reader).orig;
      const orig2 = unchangedRangesFeature.read(reader).viewZones.read(reader).origViewZones;
      return orig.concat(orig2);
    });
    const modifiedViewZones = derived(this, (reader) => {
      const mod = viewZoneManager.read(reader).viewZones.read(reader).mod;
      const mod2 = unchangedRangesFeature.read(reader).viewZones.read(reader).modViewZones;
      return mod.concat(mod2);
    });
    this._register(applyViewZones(this._editors.original, originalViewZones, (isUpdatingOrigViewZones) => {
      isUpdatingViewZones = isUpdatingOrigViewZones;
    }, origViewZoneIdsToIgnore));
    let scrollState;
    this._register(applyViewZones(this._editors.modified, modifiedViewZones, (isUpdatingModViewZones) => {
      isUpdatingViewZones = isUpdatingModViewZones;
      if (isUpdatingViewZones) {
        scrollState = StableEditorScrollState.capture(this._editors.modified);
      } else {
        scrollState?.restore(this._editors.modified);
        scrollState = void 0;
      }
    }, modViewZoneIdsToIgnore));
    this._accessibleDiffViewer = derivedDisposable(
      this,
      (reader) => this._instantiationService.createInstance(
        readHotReloadableExport(AccessibleDiffViewer, reader),
        this.elements.accessibleDiffViewer,
        this._accessibleDiffViewerVisible,
        (visible, tx) => this._accessibleDiffViewerShouldBeVisible.set(visible, tx),
        this._options.onlyShowAccessibleDiffViewer.map((v) => !v),
        this._rootSizeObserver.width,
        this._rootSizeObserver.height,
        this._diffModel.map((m, r) => m?.diff.read(r)?.mappings.map((m2) => m2.lineRangeMapping)),
        new AccessibleDiffViewerModelFromEditors(this._editors)
      )
    ).recomputeInitiallyAndOnChange(this._store);
    const visibility = this._accessibleDiffViewerVisible.map((v) => v ? "hidden" : "visible");
    this._register(applyStyle(this.elements.modified, { visibility }));
    this._register(applyStyle(this.elements.original, { visibility }));
    this._createDiffEditorContributions();
    this._codeEditorService.addDiffEditor(this);
    this._register(toDisposable(() => {
      this._codeEditorService.removeDiffEditor(this);
    }));
    this._gutter = derivedDisposable(this, (reader) => {
      return this._options.shouldRenderGutterMenu.read(reader) ? this._instantiationService.createInstance(
        readHotReloadableExport(DiffEditorGutter, reader),
        this.elements.root,
        this._diffModel,
        this._editors,
        this._options,
        this._sashLayout,
        this._boundarySashes
      ) : void 0;
    });
    this._register(recomputeInitiallyAndOnChange(this._layoutInfo));
    derivedDisposable(
      this,
      (reader) => (
        /** @description MovedBlocksLinesPart */
        new (readHotReloadableExport(MovedBlocksLinesFeature, reader))(
          this.elements.root,
          this._diffModel,
          this._layoutInfo.map((i) => i.originalEditor),
          this._layoutInfo.map((i) => i.modifiedEditor),
          this._editors
        )
      )
    ).recomputeInitiallyAndOnChange(this._store, (value) => {
      this._movedBlocksLinesPart.set(value, void 0);
    });
    this._register(Event.runAndSubscribe(this._editors.modified.onDidChangeCursorPosition, (e) => this._handleCursorPositionChange(e, true)));
    this._register(Event.runAndSubscribe(this._editors.original.onDidChangeCursorPosition, (e) => this._handleCursorPositionChange(e, false)));
    const isInitializingDiff = this._diffModel.map(this, (m, reader) => {
      if (!m) {
        return void 0;
      }
      return m.diff.read(reader) === void 0 && !m.isDiffUpToDate.read(reader);
    });
    this._register(autorunWithStore((reader, store) => {
      if (isInitializingDiff.read(reader) === true) {
        const r = this._editorProgressService.show(true, 1e3);
        store.add(toDisposable(() => r.done()));
      }
    }));
    this._register(autorunWithStore((reader, store) => {
      store.add(new (readHotReloadableExport(RevertButtonsFeature, reader))(this._editors, this._diffModel, this._options, this));
    }));
    this._register(autorunWithStore((reader, store) => {
      const model = this._diffModel.read(reader);
      if (!model) {
        return;
      }
      for (const m of [model.model.original, model.model.modified]) {
        store.add(m.onWillDispose((e) => {
          onUnexpectedError(new BugIndicatingError("TextModel got disposed before DiffEditorWidget model got reset"));
          this.setModel(null);
        }));
      }
    }));
    this._register(autorun((reader) => {
      this._options.setModel(this._diffModel.read(reader));
    }));
  }
  get onDidContentSizeChange() {
    return this._editors.onDidContentSizeChange;
  }
  get collapseUnchangedRegions() {
    return this._options.hideUnchangedRegions.get();
  }
  getViewWidth() {
    return this._rootSizeObserver.width.get();
  }
  getContentHeight() {
    return this._editors.modified.getContentHeight();
  }
  _createInnerEditor(instantiationService, container, options, editorWidgetOptions) {
    const editor = instantiationService.createInstance(CodeEditorWidget, container, options, editorWidgetOptions);
    return editor;
  }
  _createDiffEditorContributions() {
    const contributions = EditorExtensionsRegistry.getDiffEditorContributions();
    for (const desc of contributions) {
      try {
        this._register(this._instantiationService.createInstance(desc.ctor, this));
      } catch (err) {
        onUnexpectedError(err);
      }
    }
  }
  get _targetEditor() {
    return this._editors.modified;
  }
  getEditorType() {
    return EditorType.IDiffEditor;
  }
  onVisible() {
    this._editors.original.onVisible();
    this._editors.modified.onVisible();
  }
  onHide() {
    this._editors.original.onHide();
    this._editors.modified.onHide();
  }
  layout(dimension) {
    this._rootSizeObserver.observe(dimension);
  }
  hasTextFocus() {
    return this._editors.original.hasTextFocus() || this._editors.modified.hasTextFocus();
  }
  saveViewState() {
    const originalViewState = this._editors.original.saveViewState();
    const modifiedViewState = this._editors.modified.saveViewState();
    return {
      original: originalViewState,
      modified: modifiedViewState,
      modelState: this._diffModel.get()?.serializeState()
    };
  }
  restoreViewState(s) {
    if (s && s.original && s.modified) {
      const diffEditorState = s;
      this._editors.original.restoreViewState(diffEditorState.original);
      this._editors.modified.restoreViewState(diffEditorState.modified);
      if (diffEditorState.modelState) {
        this._diffModel.get()?.restoreSerializedState(diffEditorState.modelState);
      }
    }
  }
  handleInitialized() {
    this._editors.original.handleInitialized();
    this._editors.modified.handleInitialized();
  }
  createViewModel(model) {
    return this._instantiationService.createInstance(DiffEditorViewModel, model, this._options);
  }
  getModel() {
    return this._diffModel.get()?.model ?? null;
  }
  setModel(model) {
    const vm = !model ? null : "model" in model ? RefCounted.create(model).createNewRef(this) : RefCounted.create(this.createViewModel(model), this);
    this.setDiffModel(vm);
  }
  setDiffModel(viewModel, tx) {
    const currentModel = this._diffModel.get();
    if (!viewModel && currentModel) {
      this._accessibleDiffViewer.get().close();
    }
    if (this._diffModel.get() !== viewModel?.object) {
      subtransaction(tx, (tx2) => {
        const vm = viewModel?.object;
        observableFromEvent.batchEventsGlobally(tx2, () => {
          this._editors.original.setModel(vm ? vm.model.original : null);
          this._editors.modified.setModel(vm ? vm.model.modified : null);
        });
        const prevValueRef = this._diffModelSrc.get()?.createNewRef(this);
        this._diffModelSrc.set(viewModel?.createNewRef(this), tx2);
        setTimeout(() => {
          prevValueRef?.dispose();
        }, 0);
      });
    }
  }
  /**
   * @param changedOptions Only has values for top-level options that have actually changed.
   */
  updateOptions(changedOptions) {
    this._options.updateOptions(changedOptions);
  }
  getDomNode() {
    return this.elements.root;
  }
  getContainerDomNode() {
    return this._domElement;
  }
  getOriginalEditor() {
    return this._editors.original;
  }
  getModifiedEditor() {
    return this._editors.modified;
  }
  setBoundarySashes(sashes) {
    this._boundarySashes.set(sashes, void 0);
  }
  get ignoreTrimWhitespace() {
    return this._options.ignoreTrimWhitespace.get();
  }
  get maxComputationTime() {
    return this._options.maxComputationTimeMs.get();
  }
  get renderSideBySide() {
    return this._options.renderSideBySide.get();
  }
  /**
   * @deprecated Use `this.getDiffComputationResult().changes2` instead.
   */
  getLineChanges() {
    const diffState = this._diffModel.get()?.diff.get();
    if (!diffState) {
      return null;
    }
    return toLineChanges(diffState);
  }
  getDiffComputationResult() {
    const diffState = this._diffModel.get()?.diff.get();
    if (!diffState) {
      return null;
    }
    return {
      changes: this.getLineChanges(),
      changes2: diffState.mappings.map((m) => m.lineRangeMapping),
      identical: diffState.identical,
      quitEarly: diffState.quitEarly
    };
  }
  revert(diff) {
    const model = this._diffModel.get();
    if (!model || !model.isDiffUpToDate.get()) {
      return;
    }
    this._editors.modified.pushUndoStop();
    this._editors.modified.executeEdits("diffEditor", [
      {
        range: diff.modified.toExclusiveRange(),
        text: model.model.original.getValueInRange(diff.original.toExclusiveRange())
      }
    ]);
    this._editors.modified.pushUndoStop();
  }
  revertRangeMappings(diffs) {
    const model = this._diffModel.get();
    if (!model || !model.isDiffUpToDate.get()) {
      return;
    }
    const changes = diffs.map((c) => ({
      range: c.modifiedRange,
      text: model.model.original.getValueInRange(c.originalRange)
    }));
    this._editors.modified.pushUndoStop();
    this._editors.modified.executeEdits("diffEditor", changes);
    this._editors.modified.pushUndoStop();
  }
  revertFocusedRangeMappings() {
    const model = this._diffModel.get();
    if (!model || !model.isDiffUpToDate.get()) {
      return;
    }
    const diffs = this._diffModel.get()?.diff.get()?.mappings;
    if (!diffs || diffs.length === 0) {
      return;
    }
    const modifiedEditor = this._editors.modified;
    if (!modifiedEditor.hasTextFocus()) {
      return;
    }
    const curLineNumber = modifiedEditor.getPosition().lineNumber;
    const selection = modifiedEditor.getSelection();
    const selectedRange = LineRange.fromRange(selection || new Range(curLineNumber, 0, curLineNumber, 0));
    const diffsToRevert = diffs.filter((d) => {
      return d.lineRangeMapping.modified.intersect(selectedRange);
    });
    modifiedEditor.pushUndoStop();
    modifiedEditor.executeEdits("diffEditor", diffsToRevert.map((d) => ({
      range: d.lineRangeMapping.modified.toExclusiveRange(),
      text: model.model.original.getValueInRange(d.lineRangeMapping.original.toExclusiveRange())
    })));
    modifiedEditor.pushUndoStop();
  }
  _goTo(diff) {
    this._editors.modified.setPosition(new Position(diff.lineRangeMapping.modified.startLineNumber, 1));
    this._editors.modified.revealRangeInCenter(diff.lineRangeMapping.modified.toExclusiveRange());
  }
  goToDiff(target) {
    const diffs = this._diffModel.get()?.diff.get()?.mappings;
    if (!diffs || diffs.length === 0) {
      return;
    }
    const curLineNumber = this._editors.modified.getPosition().lineNumber;
    let diff;
    if (target === "next") {
      const modifiedLineCount = this._editors.modified.getModel().getLineCount();
      if (modifiedLineCount === curLineNumber) {
        diff = diffs[0];
      } else {
        diff = diffs.find((d) => d.lineRangeMapping.modified.startLineNumber > curLineNumber) ?? diffs[0];
      }
    } else {
      diff = findLast(diffs, (d) => d.lineRangeMapping.modified.startLineNumber < curLineNumber) ?? diffs[diffs.length - 1];
    }
    this._goTo(diff);
    if (diff.lineRangeMapping.modified.isEmpty) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineDeleted, { source: "diffEditor.goToDiff" });
    } else if (diff.lineRangeMapping.original.isEmpty) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineInserted, { source: "diffEditor.goToDiff" });
    } else if (diff) {
      this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineModified, { source: "diffEditor.goToDiff" });
    }
  }
  revealFirstDiff() {
    const diffModel = this._diffModel.get();
    if (!diffModel) {
      return;
    }
    this.waitForDiff().then(() => {
      const diffs = diffModel.diff.get()?.mappings;
      if (!diffs || diffs.length === 0) {
        return;
      }
      this._goTo(diffs[0]);
    });
  }
  accessibleDiffViewerNext() {
    this._accessibleDiffViewer.get().next();
  }
  accessibleDiffViewerPrev() {
    this._accessibleDiffViewer.get().prev();
  }
  async waitForDiff() {
    const diffModel = this._diffModel.get();
    if (!diffModel) {
      return;
    }
    await diffModel.waitForDiff();
  }
  mapToOtherSide() {
    const isModifiedFocus = this._editors.modified.hasWidgetFocus();
    const source = isModifiedFocus ? this._editors.modified : this._editors.original;
    const destination = isModifiedFocus ? this._editors.original : this._editors.modified;
    let destinationSelection;
    const sourceSelection = source.getSelection();
    if (sourceSelection) {
      const mappings = this._diffModel.get()?.diff.get()?.mappings.map((m) => isModifiedFocus ? m.lineRangeMapping.flip() : m.lineRangeMapping);
      if (mappings) {
        const newRange1 = translatePosition(sourceSelection.getStartPosition(), mappings);
        const newRange2 = translatePosition(sourceSelection.getEndPosition(), mappings);
        destinationSelection = Range.plusRange(newRange1, newRange2);
      }
    }
    return { destination, destinationSelection };
  }
  switchSide() {
    const { destination, destinationSelection } = this.mapToOtherSide();
    destination.focus();
    if (destinationSelection) {
      destination.setSelection(destinationSelection);
    }
  }
  exitCompareMove() {
    const model = this._diffModel.get();
    if (!model) {
      return;
    }
    model.movedTextToCompare.set(void 0, void 0);
  }
  collapseAllUnchangedRegions() {
    const unchangedRegions = this._diffModel.get()?.unchangedRegions.get();
    if (!unchangedRegions) {
      return;
    }
    transaction((tx) => {
      for (const region of unchangedRegions) {
        region.collapseAll(tx);
      }
    });
  }
  showAllUnchangedRegions() {
    const unchangedRegions = this._diffModel.get()?.unchangedRegions.get();
    if (!unchangedRegions) {
      return;
    }
    transaction((tx) => {
      for (const region of unchangedRegions) {
        region.showAll(tx);
      }
    });
  }
  _handleCursorPositionChange(e, isModifiedEditor) {
    if (e?.reason === CursorChangeReason.Explicit) {
      const diff = this._diffModel.get()?.diff.get()?.mappings.find((m) => isModifiedEditor ? m.lineRangeMapping.modified.contains(e.position.lineNumber) : m.lineRangeMapping.original.contains(e.position.lineNumber));
      if (diff?.lineRangeMapping.modified.isEmpty) {
        this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineDeleted, { source: "diffEditor.cursorPositionChanged" });
      } else if (diff?.lineRangeMapping.original.isEmpty) {
        this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineInserted, { source: "diffEditor.cursorPositionChanged" });
      } else if (diff) {
        this._accessibilitySignalService.playSignal(AccessibilitySignal.diffLineModified, { source: "diffEditor.cursorPositionChanged" });
      }
    }
  }
};
DiffEditorWidget.ENTIRE_DIFF_OVERVIEW_WIDTH = OverviewRulerFeature.ENTIRE_DIFF_OVERVIEW_WIDTH;
DiffEditorWidget = __decorateClass([
  __decorateParam(3, IContextKeyService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, ICodeEditorService),
  __decorateParam(6, IAccessibilitySignalService),
  __decorateParam(7, IEditorProgressService)
], DiffEditorWidget);
function toLineChanges(state) {
  return state.mappings.map((x) => {
    const m = x.lineRangeMapping;
    let originalStartLineNumber;
    let originalEndLineNumber;
    let modifiedStartLineNumber;
    let modifiedEndLineNumber;
    let innerChanges = m.innerChanges;
    if (m.original.isEmpty) {
      originalStartLineNumber = m.original.startLineNumber - 1;
      originalEndLineNumber = 0;
      innerChanges = void 0;
    } else {
      originalStartLineNumber = m.original.startLineNumber;
      originalEndLineNumber = m.original.endLineNumberExclusive - 1;
    }
    if (m.modified.isEmpty) {
      modifiedStartLineNumber = m.modified.startLineNumber - 1;
      modifiedEndLineNumber = 0;
      innerChanges = void 0;
    } else {
      modifiedStartLineNumber = m.modified.startLineNumber;
      modifiedEndLineNumber = m.modified.endLineNumberExclusive - 1;
    }
    return {
      originalStartLineNumber,
      originalEndLineNumber,
      modifiedStartLineNumber,
      modifiedEndLineNumber,
      charChanges: innerChanges?.map((m2) => ({
        originalStartLineNumber: m2.originalRange.startLineNumber,
        originalStartColumn: m2.originalRange.startColumn,
        originalEndLineNumber: m2.originalRange.endLineNumber,
        originalEndColumn: m2.originalRange.endColumn,
        modifiedStartLineNumber: m2.modifiedRange.startLineNumber,
        modifiedStartColumn: m2.modifiedRange.startColumn,
        modifiedEndLineNumber: m2.modifiedRange.endLineNumber,
        modifiedEndColumn: m2.modifiedRange.endColumn
      }))
    };
  });
}
export {
  DiffEditorWidget,
  toLineChanges
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2RpZmZFZGl0b3JXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IHsgZ2V0V2luZG93LCBoIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBJQm91bmRhcnlTYXNoZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IGZpbmRMYXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzRmluZC5qcyc7XG5pbXBvcnQgeyBCdWdJbmRpY2F0aW5nRXJyb3IsIG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgcmVhZEhvdFJlbG9hZGFibGVFeHBvcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ob3RSZWxvYWRIZWxwZXJzLmpzJztcbmltcG9ydCB7IHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgSVRyYW5zYWN0aW9uLCBhdXRvcnVuLCBhdXRvcnVuV2l0aFN0b3JlLCBkZXJpdmVkLCBkZXJpdmVkRGlzcG9zYWJsZSwgZGlzcG9zYWJsZU9ic2VydmFibGVWYWx1ZSwgb2JzZXJ2YWJsZUZyb21FdmVudCwgb2JzZXJ2YWJsZVZhbHVlLCByZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSwgc3VidHJhbnNhY3Rpb24sIHRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5U2lnbmFsLCBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgYmluZENvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vYnNlcnZhYmxlL2NvbW1vbi9wbGF0Zm9ybU9ic2VydmFibGVVdGlscy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElEaWZmRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRGltZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvMmQvZGltZW5zaW9uLmpzJztcbmltcG9ydCB7IExpbmVSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Jhbmdlcy9saW5lUmFuZ2UuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IEN1cnNvckNoYW5nZVJlYXNvbiwgSUN1cnNvclBvc2l0aW9uQ2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2N1cnNvckV2ZW50cy5qcyc7XG5pbXBvcnQgeyBJRGlmZkNvbXB1dGF0aW9uUmVzdWx0LCBJTGluZUNoYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9kaWZmL2xlZ2FjeUxpbmVzRGlmZkNvbXB1dGVyLmpzJztcbmltcG9ydCB7IExpbmVSYW5nZU1hcHBpbmcsIFJhbmdlTWFwcGluZyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9kaWZmL3JhbmdlTWFwcGluZy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JUeXBlLCBJRGlmZkVkaXRvck1vZGVsLCBJRGlmZkVkaXRvclZpZXdNb2RlbCwgSURpZmZFZGl0b3JWaWV3U3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEVkaXRvckNvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvckNvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yQ29uc3RydWN0aW9uT3B0aW9ucyB9IGZyb20gJy4uLy4uL2NvbmZpZy9lZGl0b3JDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yLCBJRGlmZkVkaXRvciwgSURpZmZFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnksIElEaWZmRWRpdG9yQ29udHJpYnV0aW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL3NlcnZpY2VzL2NvZGVFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFN0YWJsZUVkaXRvclNjcm9sbFN0YXRlIH0gZnJvbSAnLi4vLi4vc3RhYmxlRWRpdG9yU2Nyb2xsLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQsIElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyB9IGZyb20gJy4uL2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmxlRGlmZlZpZXdlciwgQWNjZXNzaWJsZURpZmZWaWV3ZXJNb2RlbEZyb21FZGl0b3JzIH0gZnJvbSAnLi9jb21wb25lbnRzL2FjY2Vzc2libGVEaWZmVmlld2VyLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JEZWNvcmF0aW9ucyB9IGZyb20gJy4vY29tcG9uZW50cy9kaWZmRWRpdG9yRGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvckVkaXRvcnMgfSBmcm9tICcuL2NvbXBvbmVudHMvZGlmZkVkaXRvckVkaXRvcnMuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvclNhc2gsIFNhc2hMYXlvdXQgfSBmcm9tICcuL2NvbXBvbmVudHMvZGlmZkVkaXRvclNhc2guanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvclZpZXdab25lcyB9IGZyb20gJy4vY29tcG9uZW50cy9kaWZmRWRpdG9yVmlld1pvbmVzL2RpZmZFZGl0b3JWaWV3Wm9uZXMuanMnO1xuaW1wb3J0IHsgRGVsZWdhdGluZ0VkaXRvciB9IGZyb20gJy4vZGVsZWdhdGluZ0VkaXRvckltcGwuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvck9wdGlvbnMgfSBmcm9tICcuL2RpZmZFZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JWaWV3TW9kZWwsIERpZmZNYXBwaW5nLCBEaWZmU3RhdGUgfSBmcm9tICcuL2RpZmZFZGl0b3JWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgRGlmZkVkaXRvckd1dHRlciB9IGZyb20gJy4vZmVhdHVyZXMvZ3V0dGVyRmVhdHVyZS5qcyc7XG5pbXBvcnQgeyBIaWRlVW5jaGFuZ2VkUmVnaW9uc0ZlYXR1cmUgfSBmcm9tICcuL2ZlYXR1cmVzL2hpZGVVbmNoYW5nZWRSZWdpb25zRmVhdHVyZS5qcyc7XG5pbXBvcnQgeyBNb3ZlZEJsb2Nrc0xpbmVzRmVhdHVyZSB9IGZyb20gJy4vZmVhdHVyZXMvbW92ZWRCbG9ja3NMaW5lc0ZlYXR1cmUuanMnO1xuaW1wb3J0IHsgT3ZlcnZpZXdSdWxlckZlYXR1cmUgfSBmcm9tICcuL2ZlYXR1cmVzL292ZXJ2aWV3UnVsZXJGZWF0dXJlLmpzJztcbmltcG9ydCB7IFJldmVydEJ1dHRvbnNGZWF0dXJlIH0gZnJvbSAnLi9mZWF0dXJlcy9yZXZlcnRCdXR0b25zRmVhdHVyZS5qcyc7XG5pbXBvcnQgJy4vc3R5bGUuY3NzJztcbmltcG9ydCB7IENTU1N0eWxlLCBPYnNlcnZhYmxlRWxlbWVudFNpemVPYnNlcnZlciwgUmVmQ291bnRlZCwgYXBwbHlTdHlsZSwgYXBwbHlWaWV3Wm9uZXMsIHRyYW5zbGF0ZVBvc2l0aW9uIH0gZnJvbSAnLi91dGlscy5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURpZmZDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyB7XG5cdG9yaWdpbmFsRWRpdG9yPzogSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zO1xuXHRtb2RpZmllZEVkaXRvcj86IElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucztcbn1cblxuZXhwb3J0IGNsYXNzIERpZmZFZGl0b3JXaWRnZXQgZXh0ZW5kcyBEZWxlZ2F0aW5nRWRpdG9yIGltcGxlbWVudHMgSURpZmZFZGl0b3Ige1xuXHRwdWJsaWMgc3RhdGljIEVOVElSRV9ESUZGX09WRVJWSUVXX1dJRFRIID0gT3ZlcnZpZXdSdWxlckZlYXR1cmUuRU5USVJFX0RJRkZfT1ZFUlZJRVdfV0lEVEg7XG5cblx0cHJpdmF0ZSByZWFkb25seSBlbGVtZW50cztcblx0cHJpdmF0ZSByZWFkb25seSBfZGlmZk1vZGVsU3JjO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmTW9kZWw7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZU1vZGVsO1xuXG5cdHB1YmxpYyBnZXQgb25EaWRDb250ZW50U2l6ZUNoYW5nZSgpIHsgcmV0dXJuIHRoaXMuX2VkaXRvcnMub25EaWRDb250ZW50U2l6ZUNoYW5nZTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfcm9vdFNpemVPYnNlcnZlcjogT2JzZXJ2YWJsZUVsZW1lbnRTaXplT2JzZXJ2ZXI7XG5cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zYXNoTGF5b3V0OiBTYXNoTGF5b3V0O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zYXNoOiBJT2JzZXJ2YWJsZTxEaWZmRWRpdG9yU2FzaCB8IHVuZGVmaW5lZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX2JvdW5kYXJ5U2FzaGVzO1xuXG5cdHByaXZhdGUgX2FjY2Vzc2libGVEaWZmVmlld2VyU2hvdWxkQmVWaXNpYmxlO1xuXHRwcml2YXRlIF9hY2Nlc3NpYmxlRGlmZlZpZXdlclZpc2libGU7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2libGVEaWZmVmlld2VyOiBJT2JzZXJ2YWJsZTxBY2Nlc3NpYmxlRGlmZlZpZXdlcj47XG5cdHByaXZhdGUgcmVhZG9ubHkgX29wdGlvbnM6IERpZmZFZGl0b3JPcHRpb25zO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JzOiBEaWZmRWRpdG9yRWRpdG9ycztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vdmVydmlld1J1bGVyUGFydDogSU9ic2VydmFibGU8T3ZlcnZpZXdSdWxlckZlYXR1cmUgfCB1bmRlZmluZWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9tb3ZlZEJsb2Nrc0xpbmVzUGFydDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9ndXR0ZXI6IElPYnNlcnZhYmxlPERpZmZFZGl0b3JHdXR0ZXIgfCB1bmRlZmluZWQ+O1xuXG5cdHB1YmxpYyBnZXQgY29sbGFwc2VVbmNoYW5nZWRSZWdpb25zKCkgeyByZXR1cm4gdGhpcy5fb3B0aW9ucy5oaWRlVW5jaGFuZ2VkUmVnaW9ucy5nZXQoKTsgfVxuXG5cdC8qKlxuXHQgKiBgdHJ1ZWAgd2hlbiBldmVyeSBoaWRkZW4tdW5jaGFuZ2VkIHJlZ2lvbiBvZiB0aGUgY3VycmVudCBkaWZmIGlzIGZ1bGx5XG5cdCAqIHJldmVhbGVkIChvciB0aGVyZSBhcmUgbm9uZSkuIFJlYWQgYnkgYERpZmZFZGl0b3JJdGVtVGVtcGxhdGVgIHRvIGRyaXZlIHRoZVxuXHQgKiBtdWx0aS1kaWZmIHBlci1maWxlIGV4cGFuZC9jb2xsYXBzZSB0b2dnbGUuIE5vdCBleHRlcm5hbCBBUEkuXG5cdCAqIEBpbnRlcm5hbFxuXHQgKi9cblx0cHVibGljIHJlYWRvbmx5IGFsbFVuY2hhbmdlZFJlZ2lvbnNTaG93bjogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZG9tRWxlbWVudDogSFRNTEVsZW1lbnQsXG5cdFx0b3B0aW9uczogUmVhZG9ubHk8SURpZmZFZGl0b3JDb25zdHJ1Y3Rpb25PcHRpb25zPixcblx0XHRjb2RlRWRpdG9yV2lkZ2V0T3B0aW9uczogSURpZmZDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3BhcmVudENvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9wYXJlbnRJbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29kZUVkaXRvclNlcnZpY2U6IElDb2RlRWRpdG9yU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UsXG5cdFx0QElFZGl0b3JQcm9ncmVzc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlOiBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuZWxlbWVudHMgPSBoKCdkaXYubW9uYWNvLWRpZmYtZWRpdG9yLnNpZGUtYnktc2lkZScsIHsgc3R5bGU6IHsgcG9zaXRpb246ICdyZWxhdGl2ZScsIGhlaWdodDogJzEwMCUnIH0gfSwgW1xuXHRcdFx0aCgnZGl2LmVkaXRvci5vcmlnaW5hbEBvcmlnaW5hbCcsIHsgc3R5bGU6IHsgcG9zaXRpb246ICdhYnNvbHV0ZScsIGhlaWdodDogJzEwMCUnLCB9IH0pLFxuXHRcdFx0aCgnZGl2LmVkaXRvci5tb2RpZmllZEBtb2RpZmllZCcsIHsgc3R5bGU6IHsgcG9zaXRpb246ICdhYnNvbHV0ZScsIGhlaWdodDogJzEwMCUnLCB9IH0pLFxuXHRcdFx0aCgnZGl2LmFjY2Vzc2libGVEaWZmVmlld2VyQGFjY2Vzc2libGVEaWZmVmlld2VyJywgeyBzdHlsZTogeyBwb3NpdGlvbjogJ2Fic29sdXRlJywgaGVpZ2h0OiAnMTAwJScgfSB9KSxcblx0XHRdKTtcblx0XHR0aGlzLl9kaWZmTW9kZWxTcmMgPSB0aGlzLl9yZWdpc3RlcihkaXNwb3NhYmxlT2JzZXJ2YWJsZVZhbHVlPFJlZkNvdW50ZWQ8RGlmZkVkaXRvclZpZXdNb2RlbD4gfCB1bmRlZmluZWQ+KHRoaXMsIHVuZGVmaW5lZCkpO1xuXHRcdHRoaXMuX2RpZmZNb2RlbCA9IGRlcml2ZWQ8RGlmZkVkaXRvclZpZXdNb2RlbCB8IHVuZGVmaW5lZD4odGhpcywgcmVhZGVyID0+IHRoaXMuX2RpZmZNb2RlbFNyYy5yZWFkKHJlYWRlcik/Lm9iamVjdCk7XG5cdFx0dGhpcy5hbGxVbmNoYW5nZWRSZWdpb25zU2hvd24gPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCByZWdpb25zID0gdGhpcy5fZGlmZk1vZGVsLnJlYWQocmVhZGVyKT8udW5jaGFuZ2VkUmVnaW9ucy5yZWFkKHJlYWRlcikgPz8gW107XG5cdFx0XHRyZXR1cm4gcmVnaW9ucy5ldmVyeShyID0+IHIudmlzaWJsZUxpbmVDb3VudFRvcC5yZWFkKHJlYWRlcikgKyByLnZpc2libGVMaW5lQ291bnRCb3R0b20ucmVhZChyZWFkZXIpID49IHIubGluZUNvdW50KTtcblx0XHR9KTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlTW9kZWwgPSBFdmVudC5mcm9tT2JzZXJ2YWJsZUxpZ2h0KHRoaXMuX2RpZmZNb2RlbCk7XG5cdFx0dGhpcy5fY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9wYXJlbnRDb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQodGhpcy5fZG9tRWxlbWVudCkpO1xuXHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5fcGFyZW50SW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlQ2hpbGQoXG5cdFx0XHRuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2VdKVxuXHRcdCkpO1xuXHRcdHRoaXMuX2JvdW5kYXJ5U2FzaGVzID0gb2JzZXJ2YWJsZVZhbHVlPElCb3VuZGFyeVNhc2hlcyB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9hY2Nlc3NpYmxlRGlmZlZpZXdlclNob3VsZEJlVmlzaWJsZSA9IG9ic2VydmFibGVWYWx1ZSh0aGlzLCBmYWxzZSk7XG5cdFx0dGhpcy5fYWNjZXNzaWJsZURpZmZWaWV3ZXJWaXNpYmxlID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT5cblx0XHRcdHRoaXMuX29wdGlvbnMub25seVNob3dBY2Nlc3NpYmxlRGlmZlZpZXdlci5yZWFkKHJlYWRlcilcblx0XHRcdFx0PyB0cnVlXG5cdFx0XHRcdDogdGhpcy5fYWNjZXNzaWJsZURpZmZWaWV3ZXJTaG91bGRCZVZpc2libGUucmVhZChyZWFkZXIpXG5cdFx0KTtcblx0XHR0aGlzLl9tb3ZlZEJsb2Nrc0xpbmVzUGFydCA9IG9ic2VydmFibGVWYWx1ZTxNb3ZlZEJsb2Nrc0xpbmVzRmVhdHVyZSB8IHVuZGVmaW5lZD4odGhpcywgdW5kZWZpbmVkKTtcblx0XHR0aGlzLl9sYXlvdXRJbmZvID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgZnVsbFdpZHRoID0gdGhpcy5fcm9vdFNpemVPYnNlcnZlci53aWR0aC5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBmdWxsSGVpZ2h0ID0gdGhpcy5fcm9vdFNpemVPYnNlcnZlci5oZWlnaHQucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRpZiAodGhpcy5fcm9vdFNpemVPYnNlcnZlci5hdXRvbWF0aWNMYXlvdXQpIHtcblx0XHRcdFx0dGhpcy5lbGVtZW50cy5yb290LnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuZWxlbWVudHMucm9vdC5zdHlsZS5oZWlnaHQgPSBmdWxsSGVpZ2h0ICsgJ3B4Jztcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2FzaCA9IHRoaXMuX3Nhc2gucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRjb25zdCBndXR0ZXIgPSB0aGlzLl9ndXR0ZXIucmVhZChyZWFkZXIpO1xuXHRcdFx0Y29uc3QgZ3V0dGVyV2lkdGggPSBndXR0ZXI/LndpZHRoLnJlYWQocmVhZGVyKSA/PyAwO1xuXG5cdFx0XHRjb25zdCBvdmVydmlld1J1bGVyUGFydFdpZHRoID0gdGhpcy5fb3ZlcnZpZXdSdWxlclBhcnQucmVhZChyZWFkZXIpPy53aWR0aCA/PyAwO1xuXG5cdFx0XHRsZXQgb3JpZ2luYWxMZWZ0OiBudW1iZXIsIG9yaWdpbmFsV2lkdGg6IG51bWJlciwgbW9kaWZpZWRMZWZ0OiBudW1iZXIsIG1vZGlmaWVkV2lkdGg6IG51bWJlciwgZ3V0dGVyTGVmdDogbnVtYmVyO1xuXG5cdFx0XHRjb25zdCBzaWRlQnlTaWRlID0gISFzYXNoO1xuXHRcdFx0aWYgKHNpZGVCeVNpZGUpIHtcblx0XHRcdFx0Y29uc3Qgc2FzaExlZnQgPSBzYXNoLnNhc2hMZWZ0LnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgbW92ZWRCbG9ja3NMaW5lc1dpZHRoID0gdGhpcy5fbW92ZWRCbG9ja3NMaW5lc1BhcnQucmVhZChyZWFkZXIpPy53aWR0aC5yZWFkKHJlYWRlcikgPz8gMDtcblxuXHRcdFx0XHRvcmlnaW5hbExlZnQgPSAwO1xuXHRcdFx0XHRvcmlnaW5hbFdpZHRoID0gc2FzaExlZnQgLSBndXR0ZXJXaWR0aCAtIG1vdmVkQmxvY2tzTGluZXNXaWR0aDtcblxuXHRcdFx0XHRndXR0ZXJMZWZ0ID0gc2FzaExlZnQgLSBndXR0ZXJXaWR0aDtcblxuXHRcdFx0XHRtb2RpZmllZExlZnQgPSBzYXNoTGVmdDtcblx0XHRcdFx0bW9kaWZpZWRXaWR0aCA9IGZ1bGxXaWR0aCAtIG1vZGlmaWVkTGVmdCAtIG92ZXJ2aWV3UnVsZXJQYXJ0V2lkdGg7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRndXR0ZXJMZWZ0ID0gMDtcblxuXHRcdFx0XHRjb25zdCBzaG91bGRIaWRlT3JpZ2luYWxMaW5lTnVtYmVycyA9IHRoaXMuX29wdGlvbnMuaW5saW5lVmlld0hpZGVPcmlnaW5hbExpbmVOdW1iZXJzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0b3JpZ2luYWxMZWZ0ID0gZ3V0dGVyV2lkdGg7XG5cdFx0XHRcdGlmIChzaG91bGRIaWRlT3JpZ2luYWxMaW5lTnVtYmVycykge1xuXHRcdFx0XHRcdG9yaWdpbmFsV2lkdGggPSAwO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG9yaWdpbmFsV2lkdGggPSBNYXRoLm1heCg1LCB0aGlzLl9lZGl0b3JzLm9yaWdpbmFsT2JzLmxheW91dEluZm9EZWNvcmF0aW9uc0xlZnQucmVhZChyZWFkZXIpKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG1vZGlmaWVkTGVmdCA9IGd1dHRlcldpZHRoICsgb3JpZ2luYWxXaWR0aDtcblx0XHRcdFx0bW9kaWZpZWRXaWR0aCA9IGZ1bGxXaWR0aCAtIG1vZGlmaWVkTGVmdCAtIG92ZXJ2aWV3UnVsZXJQYXJ0V2lkdGg7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuZWxlbWVudHMub3JpZ2luYWwuc3R5bGUubGVmdCA9IG9yaWdpbmFsTGVmdCArICdweCc7XG5cdFx0XHR0aGlzLmVsZW1lbnRzLm9yaWdpbmFsLnN0eWxlLndpZHRoID0gb3JpZ2luYWxXaWR0aCArICdweCc7XG5cdFx0XHR0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLmxheW91dCh7IHdpZHRoOiBvcmlnaW5hbFdpZHRoLCBoZWlnaHQ6IGZ1bGxIZWlnaHQgfSwgdHJ1ZSk7XG5cblx0XHRcdGd1dHRlcj8ubGF5b3V0KGd1dHRlckxlZnQpO1xuXG5cdFx0XHR0aGlzLmVsZW1lbnRzLm1vZGlmaWVkLnN0eWxlLmxlZnQgPSBtb2RpZmllZExlZnQgKyAncHgnO1xuXHRcdFx0dGhpcy5lbGVtZW50cy5tb2RpZmllZC5zdHlsZS53aWR0aCA9IG1vZGlmaWVkV2lkdGggKyAncHgnO1xuXHRcdFx0dGhpcy5fZWRpdG9ycy5tb2RpZmllZC5sYXlvdXQoeyB3aWR0aDogbW9kaWZpZWRXaWR0aCwgaGVpZ2h0OiBmdWxsSGVpZ2h0IH0sIHRydWUpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRtb2RpZmllZEVkaXRvcjogdGhpcy5fZWRpdG9ycy5tb2RpZmllZC5nZXRMYXlvdXRJbmZvKCksXG5cdFx0XHRcdG9yaWdpbmFsRWRpdG9yOiB0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLmdldExheW91dEluZm8oKSxcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0dGhpcy5fZGlmZlZhbHVlID0gdGhpcy5fZGlmZk1vZGVsLm1hcCgobSwgcikgPT4gbT8uZGlmZi5yZWFkKHIpKTtcblx0XHR0aGlzLm9uRGlkVXBkYXRlRGlmZiA9IEV2ZW50LmZyb21PYnNlcnZhYmxlTGlnaHQodGhpcy5fZGlmZlZhbHVlKTtcblx0XHR0aGlzLl9jb2RlRWRpdG9yU2VydmljZS53aWxsQ3JlYXRlRGlmZkVkaXRvcigpO1xuXG5cdFx0dGhpcy5fY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KCdpc0luRGlmZkVkaXRvcicsIHRydWUpO1xuXG5cdFx0dGhpcy5fZG9tRWxlbWVudC5hcHBlbmRDaGlsZCh0aGlzLmVsZW1lbnRzLnJvb3QpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLmVsZW1lbnRzLnJvb3QucmVtb3ZlKCkpKTtcblxuXHRcdHRoaXMuX3Jvb3RTaXplT2JzZXJ2ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgT2JzZXJ2YWJsZUVsZW1lbnRTaXplT2JzZXJ2ZXIodGhpcy5lbGVtZW50cy5yb290LCBvcHRpb25zLmRpbWVuc2lvbikpO1xuXHRcdHRoaXMuX3Jvb3RTaXplT2JzZXJ2ZXIuc2V0QXV0b21hdGljTGF5b3V0KG9wdGlvbnMuYXV0b21hdGljTGF5b3V0ID8/IGZhbHNlKTtcblxuXHRcdHRoaXMuX29wdGlvbnMgPSB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShEaWZmRWRpdG9yT3B0aW9ucywgb3B0aW9ucyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5fb3B0aW9ucy5zZXRXaWR0aCh0aGlzLl9yb290U2l6ZU9ic2VydmVyLndpZHRoLnJlYWQocmVhZGVyKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5KEVkaXRvckNvbnRleHRLZXlzLmlzRW1iZWRkZWREaWZmRWRpdG9yLmtleSwgZmFsc2UpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KEVkaXRvckNvbnRleHRLZXlzLmlzRW1iZWRkZWREaWZmRWRpdG9yLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdHJlYWRlciA9PiB0aGlzLl9vcHRpb25zLmlzSW5FbWJlZGRlZEVkaXRvci5yZWFkKHJlYWRlcilcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShFZGl0b3JDb250ZXh0S2V5cy5jb21wYXJpbmdNb3ZlZENvZGUsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0cmVhZGVyID0+ICEhdGhpcy5fZGlmZk1vZGVsLnJlYWQocmVhZGVyKT8ubW92ZWRUZXh0VG9Db21wYXJlLnJlYWQocmVhZGVyKVxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KEVkaXRvckNvbnRleHRLZXlzLmRpZmZFZGl0b3JSZW5kZXJTaWRlQnlTaWRlSW5saW5lQnJlYWtwb2ludFJlYWNoZWQsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0cmVhZGVyID0+IHRoaXMuX29wdGlvbnMuY291bGRTaG93SW5saW5lVmlld0JlY2F1c2VPZlNpemUucmVhZChyZWFkZXIpXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYmluZENvbnRleHRLZXkoRWRpdG9yQ29udGV4dEtleXMuZGlmZkVkaXRvcklubGluZU1vZGUsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0cmVhZGVyID0+ICF0aGlzLl9vcHRpb25zLnJlbmRlclNpZGVCeVNpZGUucmVhZChyZWFkZXIpXG5cdFx0KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShFZGl0b3JDb250ZXh0S2V5cy5oYXNDaGFuZ2VzLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdHJlYWRlciA9PiAodGhpcy5fZGlmZk1vZGVsLnJlYWQocmVhZGVyKT8uZGlmZi5yZWFkKHJlYWRlcik/Lm1hcHBpbmdzLmxlbmd0aCA/PyAwKSA+IDBcblx0XHQpKTtcblxuXHRcdHRoaXMuX2VkaXRvcnMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdERpZmZFZGl0b3JFZGl0b3JzLFxuXHRcdFx0dGhpcy5lbGVtZW50cy5vcmlnaW5hbCxcblx0XHRcdHRoaXMuZWxlbWVudHMubW9kaWZpZWQsXG5cdFx0XHR0aGlzLl9vcHRpb25zLFxuXHRcdFx0Y29kZUVkaXRvcldpZGdldE9wdGlvbnMsXG5cdFx0XHQoaSwgYywgbywgbzIpID0+IHRoaXMuX2NyZWF0ZUlubmVyRWRpdG9yKGksIGMsIG8sIG8yKSxcblx0XHQpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KEVkaXRvckNvbnRleHRLZXlzLmRpZmZFZGl0b3JPcmlnaW5hbFdyaXRhYmxlLCB0aGlzLl9jb250ZXh0S2V5U2VydmljZSxcblx0XHRcdHJlYWRlciA9PiB0aGlzLl9vcHRpb25zLm9yaWdpbmFsRWRpdGFibGUucmVhZChyZWFkZXIpXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYmluZENvbnRleHRLZXkoRWRpdG9yQ29udGV4dEtleXMuZGlmZkVkaXRvck1vZGlmaWVkV3JpdGFibGUsIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0cmVhZGVyID0+ICF0aGlzLl9vcHRpb25zLnJlYWRPbmx5LnJlYWQocmVhZGVyKVxuXHRcdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGJpbmRDb250ZXh0S2V5KEVkaXRvckNvbnRleHRLZXlzLmRpZmZFZGl0b3JPcmlnaW5hbFVyaSwgdGhpcy5fY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHRyZWFkZXIgPT4gdGhpcy5fZGlmZk1vZGVsLnJlYWQocmVhZGVyKT8ubW9kZWwub3JpZ2luYWwudXJpLnRvU3RyaW5nKCkgPz8gJydcblx0XHQpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihiaW5kQ29udGV4dEtleShFZGl0b3JDb250ZXh0S2V5cy5kaWZmRWRpdG9yTW9kaWZpZWRVcmksIHRoaXMuX2NvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0cmVhZGVyID0+IHRoaXMuX2RpZmZNb2RlbC5yZWFkKHJlYWRlcik/Lm1vZGVsLm1vZGlmaWVkLnVyaS50b1N0cmluZygpID8/ICcnXG5cdFx0KSk7XG5cblx0XHR0aGlzLl9vdmVydmlld1J1bGVyUGFydCA9IGRlcml2ZWREaXNwb3NhYmxlKHRoaXMsIHJlYWRlciA9PlxuXHRcdFx0IXRoaXMuX29wdGlvbnMucmVuZGVyT3ZlcnZpZXdSdWxlci5yZWFkKHJlYWRlcilcblx0XHRcdFx0PyB1bmRlZmluZWRcblx0XHRcdFx0OiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRyZWFkSG90UmVsb2FkYWJsZUV4cG9ydChPdmVydmlld1J1bGVyRmVhdHVyZSwgcmVhZGVyKSxcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3JzLFxuXHRcdFx0XHRcdHRoaXMuZWxlbWVudHMucm9vdCxcblx0XHRcdFx0XHR0aGlzLl9kaWZmTW9kZWwsXG5cdFx0XHRcdFx0dGhpcy5fcm9vdFNpemVPYnNlcnZlci53aWR0aCxcblx0XHRcdFx0XHR0aGlzLl9yb290U2l6ZU9ic2VydmVyLmhlaWdodCxcblx0XHRcdFx0XHR0aGlzLl9sYXlvdXRJbmZvLm1hcChpID0+IGkubW9kaWZpZWRFZGl0b3IpLFxuXHRcdFx0XHQpXG5cdFx0KS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cblx0XHRjb25zdCBkaW1lbnNpb25zID0ge1xuXHRcdFx0aGVpZ2h0OiB0aGlzLl9yb290U2l6ZU9ic2VydmVyLmhlaWdodCxcblx0XHRcdHdpZHRoOiB0aGlzLl9yb290U2l6ZU9ic2VydmVyLndpZHRoLm1hcCgodywgcmVhZGVyKSA9PiB3IC0gKHRoaXMuX292ZXJ2aWV3UnVsZXJQYXJ0LnJlYWQocmVhZGVyKT8ud2lkdGggPz8gMCkpLFxuXHRcdH07XG5cblx0XHR0aGlzLl9zYXNoTGF5b3V0ID0gbmV3IFNhc2hMYXlvdXQodGhpcy5fb3B0aW9ucywgZGltZW5zaW9ucyk7XG5cblx0XHR0aGlzLl9zYXNoID0gZGVyaXZlZERpc3Bvc2FibGUodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHNob3dTYXNoID0gdGhpcy5fb3B0aW9ucy5yZW5kZXJTaWRlQnlTaWRlLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuZWxlbWVudHMucm9vdC5jbGFzc0xpc3QudG9nZ2xlKCdzaWRlLWJ5LXNpZGUnLCBzaG93U2FzaCk7XG5cdFx0XHRyZXR1cm4gIXNob3dTYXNoID8gdW5kZWZpbmVkIDogbmV3IERpZmZFZGl0b3JTYXNoKFxuXHRcdFx0XHR0aGlzLmVsZW1lbnRzLnJvb3QsXG5cdFx0XHRcdGRpbWVuc2lvbnMsXG5cdFx0XHRcdHRoaXMuX29wdGlvbnMuZW5hYmxlU3BsaXRWaWV3UmVzaXppbmcsXG5cdFx0XHRcdHRoaXMuX2JvdW5kYXJ5U2FzaGVzLFxuXHRcdFx0XHR0aGlzLl9zYXNoTGF5b3V0LnNhc2hMZWZ0LFxuXHRcdFx0XHQoKSA9PiB0aGlzLl9zYXNoTGF5b3V0LnJlc2V0U2FzaCgpLFxuXHRcdFx0KTtcblx0XHR9KS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cblx0XHRjb25zdCB1bmNoYW5nZWRSYW5nZXNGZWF0dXJlID0gZGVyaXZlZERpc3Bvc2FibGUodGhpcywgcmVhZGVyID0+IC8qKiBAZGVzY3JpcHRpb24gVW5jaGFuZ2VkUmFuZ2VzRmVhdHVyZSAqL1xuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdHJlYWRIb3RSZWxvYWRhYmxlRXhwb3J0KEhpZGVVbmNoYW5nZWRSZWdpb25zRmVhdHVyZSwgcmVhZGVyKSxcblx0XHRcdFx0dGhpcy5fZWRpdG9ycywgdGhpcy5fZGlmZk1vZGVsLCB0aGlzLl9vcHRpb25zXG5cdFx0XHQpXG5cdFx0KS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cblx0XHRkZXJpdmVkRGlzcG9zYWJsZSh0aGlzLCByZWFkZXIgPT4gLyoqIEBkZXNjcmlwdGlvbiBEaWZmRWRpdG9yRGVjb3JhdGlvbnMgKi9cblx0XHRcdHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRyZWFkSG90UmVsb2FkYWJsZUV4cG9ydChEaWZmRWRpdG9yRGVjb3JhdGlvbnMsIHJlYWRlciksXG5cdFx0XHRcdHRoaXMuX2VkaXRvcnMsIHRoaXMuX2RpZmZNb2RlbCwgdGhpcy5fb3B0aW9ucywgdGhpcyxcblx0XHRcdClcblx0XHQpLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblxuXHRcdGNvbnN0IG9yaWdWaWV3Wm9uZUlkc1RvSWdub3JlID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Y29uc3QgbW9kVmlld1pvbmVJZHNUb0lnbm9yZSA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGxldCBpc1VwZGF0aW5nVmlld1pvbmVzID0gZmFsc2U7XG5cdFx0Y29uc3Qgdmlld1pvbmVNYW5hZ2VyID0gZGVyaXZlZERpc3Bvc2FibGUodGhpcywgcmVhZGVyID0+IC8qKiBAZGVzY3JpcHRpb24gVmlld1pvbmVNYW5hZ2VyICovXG5cdFx0XHR0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0cmVhZEhvdFJlbG9hZGFibGVFeHBvcnQoRGlmZkVkaXRvclZpZXdab25lcywgcmVhZGVyKSxcblx0XHRcdFx0Z2V0V2luZG93KHRoaXMuX2RvbUVsZW1lbnQpLFxuXHRcdFx0XHR0aGlzLl9lZGl0b3JzLFxuXHRcdFx0XHR0aGlzLl9kaWZmTW9kZWwsXG5cdFx0XHRcdHRoaXMuX29wdGlvbnMsXG5cdFx0XHRcdHRoaXMsXG5cdFx0XHRcdCgpID0+IGlzVXBkYXRpbmdWaWV3Wm9uZXMgfHwgdW5jaGFuZ2VkUmFuZ2VzRmVhdHVyZS5yZWFkKHVuZGVmaW5lZCkuaXNVcGRhdGluZ0hpZGRlbkFyZWFzLFxuXHRcdFx0XHRvcmlnVmlld1pvbmVJZHNUb0lnbm9yZSxcblx0XHRcdFx0bW9kVmlld1pvbmVJZHNUb0lnbm9yZVxuXHRcdFx0KVxuXHRcdCkucmVjb21wdXRlSW5pdGlhbGx5QW5kT25DaGFuZ2UodGhpcy5fc3RvcmUpO1xuXG5cdFx0Y29uc3Qgb3JpZ2luYWxWaWV3Wm9uZXMgPSBkZXJpdmVkKHRoaXMsIChyZWFkZXIpID0+IHsgLyoqIEBkZXNjcmlwdGlvbiBvcmlnaW5hbFZpZXdab25lcyAqL1xuXHRcdFx0Y29uc3Qgb3JpZyA9IHZpZXdab25lTWFuYWdlci5yZWFkKHJlYWRlcikudmlld1pvbmVzLnJlYWQocmVhZGVyKS5vcmlnO1xuXHRcdFx0Y29uc3Qgb3JpZzIgPSB1bmNoYW5nZWRSYW5nZXNGZWF0dXJlLnJlYWQocmVhZGVyKS52aWV3Wm9uZXMucmVhZChyZWFkZXIpLm9yaWdWaWV3Wm9uZXM7XG5cdFx0XHRyZXR1cm4gb3JpZy5jb25jYXQob3JpZzIpO1xuXHRcdH0pO1xuXHRcdGNvbnN0IG1vZGlmaWVkVmlld1pvbmVzID0gZGVyaXZlZCh0aGlzLCAocmVhZGVyKSA9PiB7IC8qKiBAZGVzY3JpcHRpb24gbW9kaWZpZWRWaWV3Wm9uZXMgKi9cblx0XHRcdGNvbnN0IG1vZCA9IHZpZXdab25lTWFuYWdlci5yZWFkKHJlYWRlcikudmlld1pvbmVzLnJlYWQocmVhZGVyKS5tb2Q7XG5cdFx0XHRjb25zdCBtb2QyID0gdW5jaGFuZ2VkUmFuZ2VzRmVhdHVyZS5yZWFkKHJlYWRlcikudmlld1pvbmVzLnJlYWQocmVhZGVyKS5tb2RWaWV3Wm9uZXM7XG5cdFx0XHRyZXR1cm4gbW9kLmNvbmNhdChtb2QyKTtcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3RlcihhcHBseVZpZXdab25lcyh0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLCBvcmlnaW5hbFZpZXdab25lcywgaXNVcGRhdGluZ09yaWdWaWV3Wm9uZXMgPT4ge1xuXHRcdFx0aXNVcGRhdGluZ1ZpZXdab25lcyA9IGlzVXBkYXRpbmdPcmlnVmlld1pvbmVzO1xuXHRcdH0sIG9yaWdWaWV3Wm9uZUlkc1RvSWdub3JlKSk7XG5cdFx0bGV0IHNjcm9sbFN0YXRlOiBTdGFibGVFZGl0b3JTY3JvbGxTdGF0ZSB8IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9yZWdpc3RlcihhcHBseVZpZXdab25lcyh0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLCBtb2RpZmllZFZpZXdab25lcywgaXNVcGRhdGluZ01vZFZpZXdab25lcyA9PiB7XG5cdFx0XHRpc1VwZGF0aW5nVmlld1pvbmVzID0gaXNVcGRhdGluZ01vZFZpZXdab25lcztcblx0XHRcdGlmIChpc1VwZGF0aW5nVmlld1pvbmVzKSB7XG5cdFx0XHRcdHNjcm9sbFN0YXRlID0gU3RhYmxlRWRpdG9yU2Nyb2xsU3RhdGUuY2FwdHVyZSh0aGlzLl9lZGl0b3JzLm1vZGlmaWVkKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHNjcm9sbFN0YXRlPy5yZXN0b3JlKHRoaXMuX2VkaXRvcnMubW9kaWZpZWQpO1xuXHRcdFx0XHRzY3JvbGxTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9LCBtb2RWaWV3Wm9uZUlkc1RvSWdub3JlKSk7XG5cblx0XHR0aGlzLl9hY2Nlc3NpYmxlRGlmZlZpZXdlciA9IGRlcml2ZWREaXNwb3NhYmxlKHRoaXMsIHJlYWRlciA9PlxuXHRcdFx0dGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdHJlYWRIb3RSZWxvYWRhYmxlRXhwb3J0KEFjY2Vzc2libGVEaWZmVmlld2VyLCByZWFkZXIpLFxuXHRcdFx0XHR0aGlzLmVsZW1lbnRzLmFjY2Vzc2libGVEaWZmVmlld2VyLFxuXHRcdFx0XHR0aGlzLl9hY2Nlc3NpYmxlRGlmZlZpZXdlclZpc2libGUsXG5cdFx0XHRcdCh2aXNpYmxlLCB0eCkgPT4gdGhpcy5fYWNjZXNzaWJsZURpZmZWaWV3ZXJTaG91bGRCZVZpc2libGUuc2V0KHZpc2libGUsIHR4KSxcblx0XHRcdFx0dGhpcy5fb3B0aW9ucy5vbmx5U2hvd0FjY2Vzc2libGVEaWZmVmlld2VyLm1hcCh2ID0+ICF2KSxcblx0XHRcdFx0dGhpcy5fcm9vdFNpemVPYnNlcnZlci53aWR0aCxcblx0XHRcdFx0dGhpcy5fcm9vdFNpemVPYnNlcnZlci5oZWlnaHQsXG5cdFx0XHRcdHRoaXMuX2RpZmZNb2RlbC5tYXAoKG0sIHIpID0+IG0/LmRpZmYucmVhZChyKT8ubWFwcGluZ3MubWFwKG0gPT4gbS5saW5lUmFuZ2VNYXBwaW5nKSksXG5cdFx0XHRcdG5ldyBBY2Nlc3NpYmxlRGlmZlZpZXdlck1vZGVsRnJvbUVkaXRvcnModGhpcy5fZWRpdG9ycyksXG5cdFx0XHQpXG5cdFx0KS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cblx0XHRjb25zdCB2aXNpYmlsaXR5ID0gdGhpcy5fYWNjZXNzaWJsZURpZmZWaWV3ZXJWaXNpYmxlLm1hcDxDU1NTdHlsZVsndmlzaWJpbGl0eSddPih2ID0+IHYgPyAnaGlkZGVuJyA6ICd2aXNpYmxlJyk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXBwbHlTdHlsZSh0aGlzLmVsZW1lbnRzLm1vZGlmaWVkLCB7IHZpc2liaWxpdHkgfSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFwcGx5U3R5bGUodGhpcy5lbGVtZW50cy5vcmlnaW5hbCwgeyB2aXNpYmlsaXR5IH0pKTtcblxuXHRcdHRoaXMuX2NyZWF0ZURpZmZFZGl0b3JDb250cmlidXRpb25zKCk7XG5cblx0XHR0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5hZGREaWZmRWRpdG9yKHRoaXMpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yU2VydmljZS5yZW1vdmVEaWZmRWRpdG9yKHRoaXMpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2d1dHRlciA9IGRlcml2ZWREaXNwb3NhYmxlKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fb3B0aW9ucy5zaG91bGRSZW5kZXJHdXR0ZXJNZW51LnJlYWQocmVhZGVyKVxuXHRcdFx0XHQ/IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdHJlYWRIb3RSZWxvYWRhYmxlRXhwb3J0KERpZmZFZGl0b3JHdXR0ZXIsIHJlYWRlciksXG5cdFx0XHRcdFx0dGhpcy5lbGVtZW50cy5yb290LFxuXHRcdFx0XHRcdHRoaXMuX2RpZmZNb2RlbCxcblx0XHRcdFx0XHR0aGlzLl9lZGl0b3JzLFxuXHRcdFx0XHRcdHRoaXMuX29wdGlvbnMsXG5cdFx0XHRcdFx0dGhpcy5fc2FzaExheW91dCxcblx0XHRcdFx0XHR0aGlzLl9ib3VuZGFyeVNhc2hlcyxcblx0XHRcdFx0KVxuXHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHR9KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX2xheW91dEluZm8pKTtcblxuXHRcdGRlcml2ZWREaXNwb3NhYmxlKHRoaXMsIHJlYWRlciA9PiAvKiogQGRlc2NyaXB0aW9uIE1vdmVkQmxvY2tzTGluZXNQYXJ0ICovXG5cdFx0XHRuZXcgKHJlYWRIb3RSZWxvYWRhYmxlRXhwb3J0KE1vdmVkQmxvY2tzTGluZXNGZWF0dXJlLCByZWFkZXIpKShcblx0XHRcdFx0dGhpcy5lbGVtZW50cy5yb290LFxuXHRcdFx0XHR0aGlzLl9kaWZmTW9kZWwsXG5cdFx0XHRcdHRoaXMuX2xheW91dEluZm8ubWFwKGkgPT4gaS5vcmlnaW5hbEVkaXRvciksXG5cdFx0XHRcdHRoaXMuX2xheW91dEluZm8ubWFwKGkgPT4gaS5tb2RpZmllZEVkaXRvciksXG5cdFx0XHRcdHRoaXMuX2VkaXRvcnMsXG5cdFx0XHQpXG5cdFx0KS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSwgdmFsdWUgPT4ge1xuXHRcdFx0Ly8gVGhpcyBpcyB0byBicmVhayB0aGUgbGF5b3V0IGluZm8gPC0+IG1vdmVkIGJsb2NrcyBsaW5lcyBwYXJ0IGRlcGVuZGVuY3kgY3ljbGUuXG5cdFx0XHR0aGlzLl9tb3ZlZEJsb2Nrc0xpbmVzUGFydC5zZXQodmFsdWUsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihFdmVudC5ydW5BbmRTdWJzY3JpYmUodGhpcy5fZWRpdG9ycy5tb2RpZmllZC5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uLCBlID0+IHRoaXMuX2hhbmRsZUN1cnNvclBvc2l0aW9uQ2hhbmdlKGUsIHRydWUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKHRoaXMuX2VkaXRvcnMub3JpZ2luYWwub25EaWRDaGFuZ2VDdXJzb3JQb3NpdGlvbiwgZSA9PiB0aGlzLl9oYW5kbGVDdXJzb3JQb3NpdGlvbkNoYW5nZShlLCBmYWxzZSkpKTtcblxuXHRcdGNvbnN0IGlzSW5pdGlhbGl6aW5nRGlmZiA9IHRoaXMuX2RpZmZNb2RlbC5tYXAodGhpcywgKG0sIHJlYWRlcikgPT4ge1xuXHRcdFx0LyoqIEBpc0luaXRpYWxpemluZ0RpZmYgaXNEaWZmVXBUb0RhdGUgKi9cblx0XHRcdGlmICghbSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRyZXR1cm4gbS5kaWZmLnJlYWQocmVhZGVyKSA9PT0gdW5kZWZpbmVkICYmICFtLmlzRGlmZlVwVG9EYXRlLnJlYWQocmVhZGVyKTtcblx0XHR9KTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuV2l0aFN0b3JlKChyZWFkZXIsIHN0b3JlKSA9PiB7XG5cdFx0XHQvKiogQGRlc2NyaXB0aW9uIERpZmZFZGl0b3JXaWRnZXRIZWxwZXIuU2hvd1Byb2dyZXNzICovXG5cdFx0XHRpZiAoaXNJbml0aWFsaXppbmdEaWZmLnJlYWQocmVhZGVyKSA9PT0gdHJ1ZSkge1xuXHRcdFx0XHRjb25zdCByID0gdGhpcy5fZWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLnNob3codHJ1ZSwgMTAwMCk7XG5cdFx0XHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gci5kb25lKCkpKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuV2l0aFN0b3JlKChyZWFkZXIsIHN0b3JlKSA9PiB7XG5cdFx0XHRzdG9yZS5hZGQobmV3IChyZWFkSG90UmVsb2FkYWJsZUV4cG9ydChSZXZlcnRCdXR0b25zRmVhdHVyZSwgcmVhZGVyKSkodGhpcy5fZWRpdG9ycywgdGhpcy5fZGlmZk1vZGVsLCB0aGlzLl9vcHRpb25zLCB0aGlzKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bldpdGhTdG9yZSgocmVhZGVyLCBzdG9yZSkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9kaWZmTW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFtb2RlbCkgeyByZXR1cm47IH1cblx0XHRcdGZvciAoY29uc3QgbSBvZiBbbW9kZWwubW9kZWwub3JpZ2luYWwsIG1vZGVsLm1vZGVsLm1vZGlmaWVkXSkge1xuXHRcdFx0XHRzdG9yZS5hZGQobS5vbldpbGxEaXNwb3NlKGUgPT4ge1xuXHRcdFx0XHRcdG9uVW5leHBlY3RlZEVycm9yKG5ldyBCdWdJbmRpY2F0aW5nRXJyb3IoJ1RleHRNb2RlbCBnb3QgZGlzcG9zZWQgYmVmb3JlIERpZmZFZGl0b3JXaWRnZXQgbW9kZWwgZ290IHJlc2V0JykpO1xuXHRcdFx0XHRcdHRoaXMuc2V0TW9kZWwobnVsbCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHR0aGlzLl9vcHRpb25zLnNldE1vZGVsKHRoaXMuX2RpZmZNb2RlbC5yZWFkKHJlYWRlcikpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRWaWV3V2lkdGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fcm9vdFNpemVPYnNlcnZlci53aWR0aC5nZXQoKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRDb250ZW50SGVpZ2h0KCkge1xuXHRcdHJldHVybiB0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLmdldENvbnRlbnRIZWlnaHQoKTtcblx0fVxuXG5cdHByb3RlY3RlZCBfY3JlYXRlSW5uZXJFZGl0b3IoaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgY29udGFpbmVyOiBIVE1MRWxlbWVudCwgb3B0aW9uczogUmVhZG9ubHk8SUVkaXRvckNvbnN0cnVjdGlvbk9wdGlvbnM+LCBlZGl0b3JXaWRnZXRPcHRpb25zOiBJQ29kZUVkaXRvcldpZGdldE9wdGlvbnMpOiBDb2RlRWRpdG9yV2lkZ2V0IHtcblx0XHRjb25zdCBlZGl0b3IgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2RlRWRpdG9yV2lkZ2V0LCBjb250YWluZXIsIG9wdGlvbnMsIGVkaXRvcldpZGdldE9wdGlvbnMpO1xuXHRcdHJldHVybiBlZGl0b3I7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXRJbmZvO1xuXG5cdHByaXZhdGUgX2NyZWF0ZURpZmZFZGl0b3JDb250cmlidXRpb25zKCkge1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbnM6IElEaWZmRWRpdG9yQ29udHJpYnV0aW9uRGVzY3JpcHRpb25bXSA9IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXREaWZmRWRpdG9yQ29udHJpYnV0aW9ucygpO1xuXHRcdGZvciAoY29uc3QgZGVzYyBvZiBjb250cmlidXRpb25zKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShkZXNjLmN0b3IsIHRoaXMpKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRvblVuZXhwZWN0ZWRFcnJvcihlcnIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXQgX3RhcmdldEVkaXRvcigpOiBDb2RlRWRpdG9yV2lkZ2V0IHsgcmV0dXJuIHRoaXMuX2VkaXRvcnMubW9kaWZpZWQ7IH1cblxuXHRvdmVycmlkZSBnZXRFZGl0b3JUeXBlKCk6IHN0cmluZyB7IHJldHVybiBFZGl0b3JUeXBlLklEaWZmRWRpdG9yOyB9XG5cblx0b3ZlcnJpZGUgb25WaXNpYmxlKCk6IHZvaWQge1xuXHRcdC8vIFRPRE86IE9ubHkgY29tcHV0ZSBkaWZmcyB3aGVuIGRpZmYgZWRpdG9yIGlzIHZpc2libGVcblx0XHR0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLm9uVmlzaWJsZSgpO1xuXHRcdHRoaXMuX2VkaXRvcnMubW9kaWZpZWQub25WaXNpYmxlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBvbkhpZGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5vbkhpZGUoKTtcblx0XHR0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLm9uSGlkZSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgbGF5b3V0KGRpbWVuc2lvbj86IElEaW1lbnNpb24gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9yb290U2l6ZU9ic2VydmVyLm9ic2VydmUoZGltZW5zaW9uKTtcblx0fVxuXG5cdG92ZXJyaWRlIGhhc1RleHRGb2N1cygpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2VkaXRvcnMub3JpZ2luYWwuaGFzVGV4dEZvY3VzKCkgfHwgdGhpcy5fZWRpdG9ycy5tb2RpZmllZC5oYXNUZXh0Rm9jdXMoKTsgfVxuXG5cdHB1YmxpYyBvdmVycmlkZSBzYXZlVmlld1N0YXRlKCk6IElEaWZmRWRpdG9yVmlld1N0YXRlIHtcblx0XHRjb25zdCBvcmlnaW5hbFZpZXdTdGF0ZSA9IHRoaXMuX2VkaXRvcnMub3JpZ2luYWwuc2F2ZVZpZXdTdGF0ZSgpO1xuXHRcdGNvbnN0IG1vZGlmaWVkVmlld1N0YXRlID0gdGhpcy5fZWRpdG9ycy5tb2RpZmllZC5zYXZlVmlld1N0YXRlKCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG9yaWdpbmFsOiBvcmlnaW5hbFZpZXdTdGF0ZSxcblx0XHRcdG1vZGlmaWVkOiBtb2RpZmllZFZpZXdTdGF0ZSxcblx0XHRcdG1vZGVsU3RhdGU6IHRoaXMuX2RpZmZNb2RlbC5nZXQoKT8uc2VyaWFsaXplU3RhdGUoKSxcblx0XHR9O1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIHJlc3RvcmVWaWV3U3RhdGUoczogSURpZmZFZGl0b3JWaWV3U3RhdGUpOiB2b2lkIHtcblx0XHRpZiAocyAmJiBzLm9yaWdpbmFsICYmIHMubW9kaWZpZWQpIHtcblx0XHRcdGNvbnN0IGRpZmZFZGl0b3JTdGF0ZSA9IHM7XG5cdFx0XHR0aGlzLl9lZGl0b3JzLm9yaWdpbmFsLnJlc3RvcmVWaWV3U3RhdGUoZGlmZkVkaXRvclN0YXRlLm9yaWdpbmFsKTtcblx0XHRcdHRoaXMuX2VkaXRvcnMubW9kaWZpZWQucmVzdG9yZVZpZXdTdGF0ZShkaWZmRWRpdG9yU3RhdGUubW9kaWZpZWQpO1xuXHRcdFx0aWYgKGRpZmZFZGl0b3JTdGF0ZS5tb2RlbFN0YXRlKSB7XG5cdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0cywgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueVxuXHRcdFx0XHR0aGlzLl9kaWZmTW9kZWwuZ2V0KCk/LnJlc3RvcmVTZXJpYWxpemVkU3RhdGUoZGlmZkVkaXRvclN0YXRlLm1vZGVsU3RhdGUgYXMgYW55KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgaGFuZGxlSW5pdGlhbGl6ZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5oYW5kbGVJbml0aWFsaXplZCgpO1xuXHRcdHRoaXMuX2VkaXRvcnMubW9kaWZpZWQuaGFuZGxlSW5pdGlhbGl6ZWQoKTtcblx0fVxuXG5cdHB1YmxpYyBjcmVhdGVWaWV3TW9kZWwobW9kZWw6IElEaWZmRWRpdG9yTW9kZWwpOiBJRGlmZkVkaXRvclZpZXdNb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKERpZmZFZGl0b3JWaWV3TW9kZWwsIG1vZGVsLCB0aGlzLl9vcHRpb25zKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldE1vZGVsKCk6IElEaWZmRWRpdG9yTW9kZWwgfCBudWxsIHsgcmV0dXJuIHRoaXMuX2RpZmZNb2RlbC5nZXQoKT8ubW9kZWwgPz8gbnVsbDsgfVxuXG5cdG92ZXJyaWRlIHNldE1vZGVsKG1vZGVsOiBJRGlmZkVkaXRvck1vZGVsIHwgbnVsbCB8IElEaWZmRWRpdG9yVmlld01vZGVsKTogdm9pZCB7XG5cdFx0Y29uc3Qgdm0gPSAhbW9kZWwgPyBudWxsXG5cdFx0XHQ6ICgnbW9kZWwnIGluIG1vZGVsKSA/IFJlZkNvdW50ZWQuY3JlYXRlKG1vZGVsKS5jcmVhdGVOZXdSZWYodGhpcylcblx0XHRcdFx0OiBSZWZDb3VudGVkLmNyZWF0ZSh0aGlzLmNyZWF0ZVZpZXdNb2RlbChtb2RlbCksIHRoaXMpO1xuXHRcdHRoaXMuc2V0RGlmZk1vZGVsKHZtKTtcblx0fVxuXG5cdHNldERpZmZNb2RlbCh2aWV3TW9kZWw6IFJlZkNvdW50ZWQ8SURpZmZFZGl0b3JWaWV3TW9kZWw+IHwgbnVsbCwgdHg/OiBJVHJhbnNhY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBjdXJyZW50TW9kZWwgPSB0aGlzLl9kaWZmTW9kZWwuZ2V0KCk7XG5cblx0XHRpZiAoIXZpZXdNb2RlbCAmJiBjdXJyZW50TW9kZWwpIHtcblx0XHRcdC8vIFRyYW5zaXRpb25pbmcgZnJvbSBhIG1vZGVsIHRvIG5vLW1vZGVsXG5cdFx0XHR0aGlzLl9hY2Nlc3NpYmxlRGlmZlZpZXdlci5nZXQoKS5jbG9zZSgpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9kaWZmTW9kZWwuZ2V0KCkgIT09IHZpZXdNb2RlbD8ub2JqZWN0KSB7XG5cdFx0XHRzdWJ0cmFuc2FjdGlvbih0eCwgdHggPT4ge1xuXHRcdFx0XHRjb25zdCB2bSA9IHZpZXdNb2RlbD8ub2JqZWN0O1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIERpZmZFZGl0b3JXaWRnZXQuc2V0TW9kZWwgKi9cblx0XHRcdFx0b2JzZXJ2YWJsZUZyb21FdmVudC5iYXRjaEV2ZW50c0dsb2JhbGx5KHR4LCAoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9ycy5vcmlnaW5hbC5zZXRNb2RlbCh2bSA/IHZtLm1vZGVsLm9yaWdpbmFsIDogbnVsbCk7XG5cdFx0XHRcdFx0dGhpcy5fZWRpdG9ycy5tb2RpZmllZC5zZXRNb2RlbCh2bSA/IHZtLm1vZGVsLm1vZGlmaWVkIDogbnVsbCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBwcmV2VmFsdWVSZWYgPSB0aGlzLl9kaWZmTW9kZWxTcmMuZ2V0KCk/LmNyZWF0ZU5ld1JlZih0aGlzKTtcblx0XHRcdFx0dGhpcy5fZGlmZk1vZGVsU3JjLnNldCh2aWV3TW9kZWw/LmNyZWF0ZU5ld1JlZih0aGlzKSBhcyBSZWZDb3VudGVkPERpZmZFZGl0b3JWaWV3TW9kZWw+IHwgdW5kZWZpbmVkLCB0eCk7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdC8vIGFzeW5jLCBzbyB0aGF0IHRoaXMgcnVucyBhZnRlciB0aGUgdHJhbnNhY3Rpb24gZmluaXNoZWQuXG5cdFx0XHRcdFx0Ly8gVE9ETzogdXNlIHRoZSB0cmFuc2FjdGlvbiB0byBzY2hlZHVsZSBkaXNwb3NhbFxuXHRcdFx0XHRcdHByZXZWYWx1ZVJlZj8uZGlzcG9zZSgpO1xuXHRcdFx0XHR9LCAwKTtcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBAcGFyYW0gY2hhbmdlZE9wdGlvbnMgT25seSBoYXMgdmFsdWVzIGZvciB0b3AtbGV2ZWwgb3B0aW9ucyB0aGF0IGhhdmUgYWN0dWFsbHkgY2hhbmdlZC5cblx0ICovXG5cdG92ZXJyaWRlIHVwZGF0ZU9wdGlvbnMoY2hhbmdlZE9wdGlvbnM6IElEaWZmRWRpdG9yT3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMuX29wdGlvbnMudXBkYXRlT3B0aW9ucyhjaGFuZ2VkT3B0aW9ucyk7XG5cdH1cblxuXHRnZXREb21Ob2RlKCk6IEhUTUxFbGVtZW50IHsgcmV0dXJuIHRoaXMuZWxlbWVudHMucm9vdDsgfVxuXHRnZXRDb250YWluZXJEb21Ob2RlKCk6IEhUTUxFbGVtZW50IHsgcmV0dXJuIHRoaXMuX2RvbUVsZW1lbnQ7IH1cblx0Z2V0T3JpZ2luYWxFZGl0b3IoKTogSUNvZGVFZGl0b3IgeyByZXR1cm4gdGhpcy5fZWRpdG9ycy5vcmlnaW5hbDsgfVxuXHRnZXRNb2RpZmllZEVkaXRvcigpOiBJQ29kZUVkaXRvciB7IHJldHVybiB0aGlzLl9lZGl0b3JzLm1vZGlmaWVkOyB9XG5cblx0c2V0Qm91bmRhcnlTYXNoZXMoc2FzaGVzOiBJQm91bmRhcnlTYXNoZXMpOiB2b2lkIHtcblx0XHR0aGlzLl9ib3VuZGFyeVNhc2hlcy5zZXQoc2FzaGVzLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlmZlZhbHVlO1xuXHRyZWFkb25seSBvbkRpZFVwZGF0ZURpZmY6IEV2ZW50PHZvaWQ+O1xuXG5cdGdldCBpZ25vcmVUcmltV2hpdGVzcGFjZSgpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX29wdGlvbnMuaWdub3JlVHJpbVdoaXRlc3BhY2UuZ2V0KCk7IH1cblxuXHRnZXQgbWF4Q29tcHV0YXRpb25UaW1lKCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9vcHRpb25zLm1heENvbXB1dGF0aW9uVGltZU1zLmdldCgpOyB9XG5cblx0Z2V0IHJlbmRlclNpZGVCeVNpZGUoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLl9vcHRpb25zLnJlbmRlclNpZGVCeVNpZGUuZ2V0KCk7IH1cblxuXHQvKipcblx0ICogQGRlcHJlY2F0ZWQgVXNlIGB0aGlzLmdldERpZmZDb21wdXRhdGlvblJlc3VsdCgpLmNoYW5nZXMyYCBpbnN0ZWFkLlxuXHQgKi9cblx0Z2V0TGluZUNoYW5nZXMoKTogSUxpbmVDaGFuZ2VbXSB8IG51bGwge1xuXHRcdGNvbnN0IGRpZmZTdGF0ZSA9IHRoaXMuX2RpZmZNb2RlbC5nZXQoKT8uZGlmZi5nZXQoKTtcblx0XHRpZiAoIWRpZmZTdGF0ZSkgeyByZXR1cm4gbnVsbDsgfVxuXHRcdHJldHVybiB0b0xpbmVDaGFuZ2VzKGRpZmZTdGF0ZSk7XG5cdH1cblxuXHRnZXREaWZmQ29tcHV0YXRpb25SZXN1bHQoKTogSURpZmZDb21wdXRhdGlvblJlc3VsdCB8IG51bGwge1xuXHRcdGNvbnN0IGRpZmZTdGF0ZSA9IHRoaXMuX2RpZmZNb2RlbC5nZXQoKT8uZGlmZi5nZXQoKTtcblx0XHRpZiAoIWRpZmZTdGF0ZSkgeyByZXR1cm4gbnVsbDsgfVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNoYW5nZXM6IHRoaXMuZ2V0TGluZUNoYW5nZXMoKSEsXG5cdFx0XHRjaGFuZ2VzMjogZGlmZlN0YXRlLm1hcHBpbmdzLm1hcChtID0+IG0ubGluZVJhbmdlTWFwcGluZyksXG5cdFx0XHRpZGVudGljYWw6IGRpZmZTdGF0ZS5pZGVudGljYWwsXG5cdFx0XHRxdWl0RWFybHk6IGRpZmZTdGF0ZS5xdWl0RWFybHksXG5cdFx0fTtcblx0fVxuXG5cdHJldmVydChkaWZmOiBMaW5lUmFuZ2VNYXBwaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9kaWZmTW9kZWwuZ2V0KCk7XG5cdFx0aWYgKCFtb2RlbCB8fCAhbW9kZWwuaXNEaWZmVXBUb0RhdGUuZ2V0KCkpIHsgcmV0dXJuOyB9XG5cblx0XHR0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLnB1c2hVbmRvU3RvcCgpO1xuXHRcdHRoaXMuX2VkaXRvcnMubW9kaWZpZWQuZXhlY3V0ZUVkaXRzKCdkaWZmRWRpdG9yJywgW1xuXHRcdFx0e1xuXHRcdFx0XHRyYW5nZTogZGlmZi5tb2RpZmllZC50b0V4Y2x1c2l2ZVJhbmdlKCksXG5cdFx0XHRcdHRleHQ6IG1vZGVsLm1vZGVsLm9yaWdpbmFsLmdldFZhbHVlSW5SYW5nZShkaWZmLm9yaWdpbmFsLnRvRXhjbHVzaXZlUmFuZ2UoKSlcblx0XHRcdH1cblx0XHRdKTtcblx0XHR0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLnB1c2hVbmRvU3RvcCgpO1xuXHR9XG5cblx0cmV2ZXJ0UmFuZ2VNYXBwaW5ncyhkaWZmczogUmFuZ2VNYXBwaW5nW10pOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2RpZmZNb2RlbC5nZXQoKTtcblx0XHRpZiAoIW1vZGVsIHx8ICFtb2RlbC5pc0RpZmZVcFRvRGF0ZS5nZXQoKSkgeyByZXR1cm47IH1cblxuXHRcdGNvbnN0IGNoYW5nZXM6IElJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbltdID0gZGlmZnMubWFwPElJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbj4oYyA9PiAoe1xuXHRcdFx0cmFuZ2U6IGMubW9kaWZpZWRSYW5nZSxcblx0XHRcdHRleHQ6IG1vZGVsLm1vZGVsLm9yaWdpbmFsLmdldFZhbHVlSW5SYW5nZShjLm9yaWdpbmFsUmFuZ2UpXG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fZWRpdG9ycy5tb2RpZmllZC5wdXNoVW5kb1N0b3AoKTtcblx0XHR0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLmV4ZWN1dGVFZGl0cygnZGlmZkVkaXRvcicsIGNoYW5nZXMpO1xuXHRcdHRoaXMuX2VkaXRvcnMubW9kaWZpZWQucHVzaFVuZG9TdG9wKCk7XG5cdH1cblxuXHRyZXZlcnRGb2N1c2VkUmFuZ2VNYXBwaW5ncygpIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2RpZmZNb2RlbC5nZXQoKTtcblx0XHRpZiAoIW1vZGVsIHx8ICFtb2RlbC5pc0RpZmZVcFRvRGF0ZS5nZXQoKSkgeyByZXR1cm47IH1cblxuXHRcdGNvbnN0IGRpZmZzID0gdGhpcy5fZGlmZk1vZGVsLmdldCgpPy5kaWZmLmdldCgpPy5tYXBwaW5ncztcblx0XHRpZiAoIWRpZmZzIHx8IGRpZmZzLmxlbmd0aCA9PT0gMCkgeyByZXR1cm47IH1cblxuXHRcdGNvbnN0IG1vZGlmaWVkRWRpdG9yID0gdGhpcy5fZWRpdG9ycy5tb2RpZmllZDtcblx0XHRpZiAoIW1vZGlmaWVkRWRpdG9yLmhhc1RleHRGb2N1cygpKSB7IHJldHVybjsgfVxuXG5cdFx0Y29uc3QgY3VyTGluZU51bWJlciA9IG1vZGlmaWVkRWRpdG9yLmdldFBvc2l0aW9uKCkhLmxpbmVOdW1iZXI7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gbW9kaWZpZWRFZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWRSYW5nZSA9IExpbmVSYW5nZS5mcm9tUmFuZ2Uoc2VsZWN0aW9uIHx8IG5ldyBSYW5nZShjdXJMaW5lTnVtYmVyLCAwLCBjdXJMaW5lTnVtYmVyLCAwKSk7XG5cdFx0Y29uc3QgZGlmZnNUb1JldmVydCA9IGRpZmZzLmZpbHRlcihkID0+IHtcblx0XHRcdHJldHVybiBkLmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQuaW50ZXJzZWN0KHNlbGVjdGVkUmFuZ2UpO1xuXHRcdH0pO1xuXG5cdFx0bW9kaWZpZWRFZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdFx0bW9kaWZpZWRFZGl0b3IuZXhlY3V0ZUVkaXRzKCdkaWZmRWRpdG9yJywgZGlmZnNUb1JldmVydC5tYXAoZCA9PiAoXG5cdFx0XHR7XG5cdFx0XHRcdHJhbmdlOiBkLmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQudG9FeGNsdXNpdmVSYW5nZSgpLFxuXHRcdFx0XHR0ZXh0OiBtb2RlbC5tb2RlbC5vcmlnaW5hbC5nZXRWYWx1ZUluUmFuZ2UoZC5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLnRvRXhjbHVzaXZlUmFuZ2UoKSlcblx0XHRcdH1cblx0XHQpKSk7XG5cdFx0bW9kaWZpZWRFZGl0b3IucHVzaFVuZG9TdG9wKCk7XG5cdH1cblxuXG5cdHByaXZhdGUgX2dvVG8oZGlmZjogRGlmZk1hcHBpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9lZGl0b3JzLm1vZGlmaWVkLnNldFBvc2l0aW9uKG5ldyBQb3NpdGlvbihkaWZmLmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyLCAxKSk7XG5cdFx0dGhpcy5fZWRpdG9ycy5tb2RpZmllZC5yZXZlYWxSYW5nZUluQ2VudGVyKGRpZmYubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZC50b0V4Y2x1c2l2ZVJhbmdlKCkpO1xuXHR9XG5cblx0Z29Ub0RpZmYodGFyZ2V0OiAncHJldmlvdXMnIHwgJ25leHQnKTogdm9pZCB7XG5cdFx0Y29uc3QgZGlmZnMgPSB0aGlzLl9kaWZmTW9kZWwuZ2V0KCk/LmRpZmYuZ2V0KCk/Lm1hcHBpbmdzO1xuXHRcdGlmICghZGlmZnMgfHwgZGlmZnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VyTGluZU51bWJlciA9IHRoaXMuX2VkaXRvcnMubW9kaWZpZWQuZ2V0UG9zaXRpb24oKSEubGluZU51bWJlcjtcblx0XHRsZXQgZGlmZjogRGlmZk1hcHBpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRhcmdldCA9PT0gJ25leHQnKSB7XG5cdFx0XHRjb25zdCBtb2RpZmllZExpbmVDb3VudCA9IHRoaXMuX2VkaXRvcnMubW9kaWZpZWQuZ2V0TW9kZWwoKSEuZ2V0TGluZUNvdW50KCk7XG5cdFx0XHRpZiAobW9kaWZpZWRMaW5lQ291bnQgPT09IGN1ckxpbmVOdW1iZXIpIHtcblx0XHRcdFx0ZGlmZiA9IGRpZmZzWzBdO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGlmZiA9IGRpZmZzLmZpbmQoZCA9PiBkLmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyID4gY3VyTGluZU51bWJlcikgPz8gZGlmZnNbMF07XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRpZmYgPSBmaW5kTGFzdChkaWZmcywgZCA9PiBkLmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyIDwgY3VyTGluZU51bWJlcikgPz8gZGlmZnNbZGlmZnMubGVuZ3RoIC0gMV07XG5cdFx0fVxuXHRcdHRoaXMuX2dvVG8oZGlmZik7XG5cblx0XHRpZiAoZGlmZi5saW5lUmFuZ2VNYXBwaW5nLm1vZGlmaWVkLmlzRW1wdHkpIHtcblx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5kaWZmTGluZURlbGV0ZWQsIHsgc291cmNlOiAnZGlmZkVkaXRvci5nb1RvRGlmZicgfSk7XG5cdFx0fSBlbHNlIGlmIChkaWZmLmxpbmVSYW5nZU1hcHBpbmcub3JpZ2luYWwuaXNFbXB0eSkge1xuXHRcdFx0dGhpcy5fYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmRpZmZMaW5lSW5zZXJ0ZWQsIHsgc291cmNlOiAnZGlmZkVkaXRvci5nb1RvRGlmZicgfSk7XG5cdFx0fSBlbHNlIGlmIChkaWZmKSB7XG5cdFx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwuZGlmZkxpbmVNb2RpZmllZCwgeyBzb3VyY2U6ICdkaWZmRWRpdG9yLmdvVG9EaWZmJyB9KTtcblx0XHR9XG5cdH1cblxuXHRyZXZlYWxGaXJzdERpZmYoKTogdm9pZCB7XG5cdFx0Y29uc3QgZGlmZk1vZGVsID0gdGhpcy5fZGlmZk1vZGVsLmdldCgpO1xuXHRcdGlmICghZGlmZk1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIHdhaXQgZm9yIHRoZSBkaWZmIGNvbXB1dGF0aW9uIHRvIGZpbmlzaFxuXHRcdHRoaXMud2FpdEZvckRpZmYoKS50aGVuKCgpID0+IHtcblx0XHRcdGNvbnN0IGRpZmZzID0gZGlmZk1vZGVsLmRpZmYuZ2V0KCk/Lm1hcHBpbmdzO1xuXHRcdFx0aWYgKCFkaWZmcyB8fCBkaWZmcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZ29UbyhkaWZmc1swXSk7XG5cdFx0fSk7XG5cdH1cblxuXHRhY2Nlc3NpYmxlRGlmZlZpZXdlck5leHQoKTogdm9pZCB7IHRoaXMuX2FjY2Vzc2libGVEaWZmVmlld2VyLmdldCgpLm5leHQoKTsgfVxuXG5cdGFjY2Vzc2libGVEaWZmVmlld2VyUHJldigpOiB2b2lkIHsgdGhpcy5fYWNjZXNzaWJsZURpZmZWaWV3ZXIuZ2V0KCkucHJldigpOyB9XG5cblx0YXN5bmMgd2FpdEZvckRpZmYoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGlmZk1vZGVsID0gdGhpcy5fZGlmZk1vZGVsLmdldCgpO1xuXHRcdGlmICghZGlmZk1vZGVsKSB7IHJldHVybjsgfVxuXHRcdGF3YWl0IGRpZmZNb2RlbC53YWl0Rm9yRGlmZigpO1xuXHR9XG5cblx0bWFwVG9PdGhlclNpZGUoKTogeyBkZXN0aW5hdGlvbjogQ29kZUVkaXRvcldpZGdldDsgZGVzdGluYXRpb25TZWxlY3Rpb246IFJhbmdlIHwgdW5kZWZpbmVkIH0ge1xuXHRcdGNvbnN0IGlzTW9kaWZpZWRGb2N1cyA9IHRoaXMuX2VkaXRvcnMubW9kaWZpZWQuaGFzV2lkZ2V0Rm9jdXMoKTtcblx0XHRjb25zdCBzb3VyY2UgPSBpc01vZGlmaWVkRm9jdXMgPyB0aGlzLl9lZGl0b3JzLm1vZGlmaWVkIDogdGhpcy5fZWRpdG9ycy5vcmlnaW5hbDtcblx0XHRjb25zdCBkZXN0aW5hdGlvbiA9IGlzTW9kaWZpZWRGb2N1cyA/IHRoaXMuX2VkaXRvcnMub3JpZ2luYWwgOiB0aGlzLl9lZGl0b3JzLm1vZGlmaWVkO1xuXG5cdFx0bGV0IGRlc3RpbmF0aW9uU2VsZWN0aW9uOiBSYW5nZSB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IHNvdXJjZVNlbGVjdGlvbiA9IHNvdXJjZS5nZXRTZWxlY3Rpb24oKTtcblx0XHRpZiAoc291cmNlU2VsZWN0aW9uKSB7XG5cdFx0XHRjb25zdCBtYXBwaW5ncyA9IHRoaXMuX2RpZmZNb2RlbC5nZXQoKT8uZGlmZi5nZXQoKT8ubWFwcGluZ3MubWFwKG0gPT4gaXNNb2RpZmllZEZvY3VzID8gbS5saW5lUmFuZ2VNYXBwaW5nLmZsaXAoKSA6IG0ubGluZVJhbmdlTWFwcGluZyk7XG5cdFx0XHRpZiAobWFwcGluZ3MpIHtcblx0XHRcdFx0Y29uc3QgbmV3UmFuZ2UxID0gdHJhbnNsYXRlUG9zaXRpb24oc291cmNlU2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKSwgbWFwcGluZ3MpO1xuXHRcdFx0XHRjb25zdCBuZXdSYW5nZTIgPSB0cmFuc2xhdGVQb3NpdGlvbihzb3VyY2VTZWxlY3Rpb24uZ2V0RW5kUG9zaXRpb24oKSwgbWFwcGluZ3MpO1xuXHRcdFx0XHRkZXN0aW5hdGlvblNlbGVjdGlvbiA9IFJhbmdlLnBsdXNSYW5nZShuZXdSYW5nZTEsIG5ld1JhbmdlMik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB7IGRlc3RpbmF0aW9uLCBkZXN0aW5hdGlvblNlbGVjdGlvbiB9O1xuXHR9XG5cblx0c3dpdGNoU2lkZSgpOiB2b2lkIHtcblx0XHRjb25zdCB7IGRlc3RpbmF0aW9uLCBkZXN0aW5hdGlvblNlbGVjdGlvbiB9ID0gdGhpcy5tYXBUb090aGVyU2lkZSgpO1xuXHRcdGRlc3RpbmF0aW9uLmZvY3VzKCk7XG5cdFx0aWYgKGRlc3RpbmF0aW9uU2VsZWN0aW9uKSB7XG5cdFx0XHRkZXN0aW5hdGlvbi5zZXRTZWxlY3Rpb24oZGVzdGluYXRpb25TZWxlY3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdGV4aXRDb21wYXJlTW92ZSgpOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2RpZmZNb2RlbC5nZXQoKTtcblx0XHRpZiAoIW1vZGVsKSB7IHJldHVybjsgfVxuXHRcdG1vZGVsLm1vdmVkVGV4dFRvQ29tcGFyZS5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHR9XG5cblx0Y29sbGFwc2VBbGxVbmNoYW5nZWRSZWdpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IHVuY2hhbmdlZFJlZ2lvbnMgPSB0aGlzLl9kaWZmTW9kZWwuZ2V0KCk/LnVuY2hhbmdlZFJlZ2lvbnMuZ2V0KCk7XG5cdFx0aWYgKCF1bmNoYW5nZWRSZWdpb25zKSB7IHJldHVybjsgfVxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdGZvciAoY29uc3QgcmVnaW9uIG9mIHVuY2hhbmdlZFJlZ2lvbnMpIHtcblx0XHRcdFx0cmVnaW9uLmNvbGxhcHNlQWxsKHR4KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHNob3dBbGxVbmNoYW5nZWRSZWdpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IHVuY2hhbmdlZFJlZ2lvbnMgPSB0aGlzLl9kaWZmTW9kZWwuZ2V0KCk/LnVuY2hhbmdlZFJlZ2lvbnMuZ2V0KCk7XG5cdFx0aWYgKCF1bmNoYW5nZWRSZWdpb25zKSB7IHJldHVybjsgfVxuXHRcdHRyYW5zYWN0aW9uKHR4ID0+IHtcblx0XHRcdGZvciAoY29uc3QgcmVnaW9uIG9mIHVuY2hhbmdlZFJlZ2lvbnMpIHtcblx0XHRcdFx0cmVnaW9uLnNob3dBbGwodHgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFuZGxlQ3Vyc29yUG9zaXRpb25DaGFuZ2UoZTogSUN1cnNvclBvc2l0aW9uQ2hhbmdlZEV2ZW50IHwgdW5kZWZpbmVkLCBpc01vZGlmaWVkRWRpdG9yOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGU/LnJlYXNvbiA9PT0gQ3Vyc29yQ2hhbmdlUmVhc29uLkV4cGxpY2l0KSB7XG5cdFx0XHRjb25zdCBkaWZmID0gdGhpcy5fZGlmZk1vZGVsLmdldCgpPy5kaWZmLmdldCgpPy5tYXBwaW5ncy5maW5kKG0gPT4gaXNNb2RpZmllZEVkaXRvciA/IG0ubGluZVJhbmdlTWFwcGluZy5tb2RpZmllZC5jb250YWlucyhlLnBvc2l0aW9uLmxpbmVOdW1iZXIpIDogbS5saW5lUmFuZ2VNYXBwaW5nLm9yaWdpbmFsLmNvbnRhaW5zKGUucG9zaXRpb24ubGluZU51bWJlcikpO1xuXHRcdFx0aWYgKGRpZmY/LmxpbmVSYW5nZU1hcHBpbmcubW9kaWZpZWQuaXNFbXB0eSkge1xuXHRcdFx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwuZGlmZkxpbmVEZWxldGVkLCB7IHNvdXJjZTogJ2RpZmZFZGl0b3IuY3Vyc29yUG9zaXRpb25DaGFuZ2VkJyB9KTtcblx0XHRcdH0gZWxzZSBpZiAoZGlmZj8ubGluZVJhbmdlTWFwcGluZy5vcmlnaW5hbC5pc0VtcHR5KSB7XG5cdFx0XHRcdHRoaXMuX2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5kaWZmTGluZUluc2VydGVkLCB7IHNvdXJjZTogJ2RpZmZFZGl0b3IuY3Vyc29yUG9zaXRpb25DaGFuZ2VkJyB9KTtcblx0XHRcdH0gZWxzZSBpZiAoZGlmZikge1xuXHRcdFx0XHR0aGlzLl9hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwuZGlmZkxpbmVNb2RpZmllZCwgeyBzb3VyY2U6ICdkaWZmRWRpdG9yLmN1cnNvclBvc2l0aW9uQ2hhbmdlZCcgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b0xpbmVDaGFuZ2VzKHN0YXRlOiBEaWZmU3RhdGUpOiBJTGluZUNoYW5nZVtdIHtcblx0cmV0dXJuIHN0YXRlLm1hcHBpbmdzLm1hcCh4ID0+IHtcblx0XHRjb25zdCBtID0geC5saW5lUmFuZ2VNYXBwaW5nO1xuXHRcdGxldCBvcmlnaW5hbFN0YXJ0TGluZU51bWJlcjogbnVtYmVyO1xuXHRcdGxldCBvcmlnaW5hbEVuZExpbmVOdW1iZXI6IG51bWJlcjtcblx0XHRsZXQgbW9kaWZpZWRTdGFydExpbmVOdW1iZXI6IG51bWJlcjtcblx0XHRsZXQgbW9kaWZpZWRFbmRMaW5lTnVtYmVyOiBudW1iZXI7XG5cdFx0bGV0IGlubmVyQ2hhbmdlcyA9IG0uaW5uZXJDaGFuZ2VzO1xuXG5cdFx0aWYgKG0ub3JpZ2luYWwuaXNFbXB0eSkge1xuXHRcdFx0Ly8gSW5zZXJ0aW9uXG5cdFx0XHRvcmlnaW5hbFN0YXJ0TGluZU51bWJlciA9IG0ub3JpZ2luYWwuc3RhcnRMaW5lTnVtYmVyIC0gMTtcblx0XHRcdG9yaWdpbmFsRW5kTGluZU51bWJlciA9IDA7XG5cdFx0XHRpbm5lckNoYW5nZXMgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG9yaWdpbmFsU3RhcnRMaW5lTnVtYmVyID0gbS5vcmlnaW5hbC5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRvcmlnaW5hbEVuZExpbmVOdW1iZXIgPSBtLm9yaWdpbmFsLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxO1xuXHRcdH1cblxuXHRcdGlmIChtLm1vZGlmaWVkLmlzRW1wdHkpIHtcblx0XHRcdC8vIERlbGV0aW9uXG5cdFx0XHRtb2RpZmllZFN0YXJ0TGluZU51bWJlciA9IG0ubW9kaWZpZWQuc3RhcnRMaW5lTnVtYmVyIC0gMTtcblx0XHRcdG1vZGlmaWVkRW5kTGluZU51bWJlciA9IDA7XG5cdFx0XHRpbm5lckNoYW5nZXMgPSB1bmRlZmluZWQ7XG5cdFx0fSBlbHNlIHtcblx0XHRcdG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyID0gbS5tb2RpZmllZC5zdGFydExpbmVOdW1iZXI7XG5cdFx0XHRtb2RpZmllZEVuZExpbmVOdW1iZXIgPSBtLm1vZGlmaWVkLmVuZExpbmVOdW1iZXJFeGNsdXNpdmUgLSAxO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRvcmlnaW5hbFN0YXJ0TGluZU51bWJlcixcblx0XHRcdG9yaWdpbmFsRW5kTGluZU51bWJlcixcblx0XHRcdG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0bW9kaWZpZWRFbmRMaW5lTnVtYmVyLFxuXHRcdFx0Y2hhckNoYW5nZXM6IGlubmVyQ2hhbmdlcz8ubWFwKG0gPT4gKHtcblx0XHRcdFx0b3JpZ2luYWxTdGFydExpbmVOdW1iZXI6IG0ub3JpZ2luYWxSYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdG9yaWdpbmFsU3RhcnRDb2x1bW46IG0ub3JpZ2luYWxSYW5nZS5zdGFydENvbHVtbixcblx0XHRcdFx0b3JpZ2luYWxFbmRMaW5lTnVtYmVyOiBtLm9yaWdpbmFsUmFuZ2UuZW5kTGluZU51bWJlcixcblx0XHRcdFx0b3JpZ2luYWxFbmRDb2x1bW46IG0ub3JpZ2luYWxSYW5nZS5lbmRDb2x1bW4sXG5cdFx0XHRcdG1vZGlmaWVkU3RhcnRMaW5lTnVtYmVyOiBtLm1vZGlmaWVkUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRtb2RpZmllZFN0YXJ0Q29sdW1uOiBtLm1vZGlmaWVkUmFuZ2Uuc3RhcnRDb2x1bW4sXG5cdFx0XHRcdG1vZGlmaWVkRW5kTGluZU51bWJlcjogbS5tb2RpZmllZFJhbmdlLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdG1vZGlmaWVkRW5kQ29sdW1uOiBtLm1vZGlmaWVkUmFuZ2UuZW5kQ29sdW1uLFxuXHRcdFx0fSkpXG5cdFx0fTtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUlBLFNBQVMsV0FBVyxTQUFTO0FBRTdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsb0JBQW9CLHlCQUF5QjtBQUN0RCxTQUFTLGFBQWE7QUFDdEIsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBb0MsU0FBUyxrQkFBa0IsU0FBUyxtQkFBbUIsMkJBQTJCLHFCQUFxQixpQkFBaUIsK0JBQStCLGdCQUFnQixtQkFBbUI7QUFDOU4sU0FBUyxxQkFBcUIsbUNBQW1DO0FBQ2pFLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsOEJBQThCO0FBR3ZDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLDBCQUF1RDtBQUdoRSxTQUFTLGtCQUFnRjtBQUN6RixTQUFTLHlCQUF5QjtBQUlsQyxTQUFTLGdDQUFvRTtBQUM3RSxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHdCQUFrRDtBQUMzRCxTQUFTLHNCQUFzQiw0Q0FBNEM7QUFDM0UsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQkFBZ0Isa0JBQWtCO0FBQzNDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsMkJBQW1EO0FBQzVELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMs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
