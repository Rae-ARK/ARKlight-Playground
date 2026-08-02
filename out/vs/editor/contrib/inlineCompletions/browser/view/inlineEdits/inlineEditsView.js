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
import { $ } from "../../../../../../base/browser/dom.js";
import { equals } from "../../../../../../base/common/equals.js";
import { BugIndicatingError, onUnexpectedError } from "../../../../../../base/common/errors.js";
import { Event } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { autorun, derived, derivedOpts, mapObservableArrayCached, observableValue } from "../../../../../../base/common/observable.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { observableCodeEditor } from "../../../../../browser/observableCodeEditor.js";
import { EditorOption } from "../../../../../common/config/editorOptions.js";
import { TextReplacement } from "../../../../../common/core/edits/textEdit.js";
import { Range } from "../../../../../common/core/range.js";
import { LineRange } from "../../../../../common/core/ranges/lineRange.js";
import { StringText } from "../../../../../common/core/text/abstractText.js";
import { TextLength } from "../../../../../common/core/text/textLength.js";
import { lineRangeMappingFromRangeMappings, RangeMapping } from "../../../../../common/diff/rangeMapping.js";
import { TextModel } from "../../../../../common/model/textModel.js";
import { InlineCompletionViewData, InlineCompletionViewKind, InlineEditTabAction } from "./inlineEditsViewInterface.js";
import { InlineEditsCollapsedView } from "./inlineEditsViews/inlineEditsCollapsedView.js";
import { InlineEditsCustomView } from "./inlineEditsViews/inlineEditsCustomView.js";
import { InlineEditsDeletionView } from "./inlineEditsViews/inlineEditsDeletionView.js";
import { InlineEditsInsertionView } from "./inlineEditsViews/inlineEditsInsertionView.js";
import { InlineEditsLineReplacementView } from "./inlineEditsViews/inlineEditsLineReplacementView.js";
import { InlineEditsLongDistanceHint } from "./inlineEditsViews/longDistanceHint/inlineEditsLongDistanceHint.js";
import { InlineEditsSideBySideView } from "./inlineEditsViews/inlineEditsSideBySideView.js";
import { InlineEditsWordReplacementView, WordReplacementsViewData } from "./inlineEditsViews/inlineEditsWordReplacementView.js";
import { OriginalEditorInlineDiffView } from "./inlineEditsViews/originalEditorInlineDiffView.js";
import { applyEditToModifiedRangeMappings, createReindentEdit } from "./utils/utils.js";
import "./view.css";
import { JumpToView } from "./inlineEditsViews/jumpToView.js";
import { StringEdit } from "../../../../../common/core/edits/stringEdit.js";
import { OffsetRange } from "../../../../../common/core/ranges/offsetRange.js";
import { getPositionOffsetTransformerFromTextModel } from "../../../../../common/core/text/getPositionOffsetTransformerFromTextModel.js";
import { InlineCompletionEditorType } from "../../model/provideInlineCompletions.js";
let InlineEditsView = class extends Disposable {
  constructor(_editor, _model, _simpleModel, _inlineSuggestInfo, _showCollapsed, _instantiationService) {
    super();
    this._editor = _editor;
    this._model = _model;
    this._simpleModel = _simpleModel;
    this._inlineSuggestInfo = _inlineSuggestInfo;
    this._showCollapsed = _showCollapsed;
    this._instantiationService = _instantiationService;
    this._tabAction = derived((reader) => this._model.read(reader)?.tabAction.read(reader) ?? InlineEditTabAction.Inactive);
    this.displayRange = derived(this, (reader) => {
      const state = this._uiState.read(reader);
      if (!state) {
        return void 0;
      }
      if (state.target.uri.toString() !== this._editorObs.model.read(reader)?.uri.toString()) {
        return void 0;
      }
      if (state.state?.kind === "custom") {
        const range = state.state.displayLocation?.range;
        if (!range) {
          throw new BugIndicatingError("custom view should have a range");
        }
        return new LineRange(range.startLineNumber, range.endLineNumber);
      }
      if (state.state?.kind === "insertionMultiLine") {
        return this._insertion.originalLines.read(reader);
      }
      return state.edit.displayRange;
    });
    this._currentInlineEditCache = void 0;
    this._uiState = derived(this, (reader) => {
      const model = this._model.read(reader);
      const textModel = this._editorObs.model.read(reader);
      if (!model || !textModel || !this._constructorDone.read(reader)) {
        return void 0;
      }
      const inlineEdit = model.inlineEdit;
      let diff;
      let mappings;
      let newText = void 0;
      if (inlineEdit.edit) {
        mappings = RangeMapping.fromEdit(inlineEdit.edit);
        newText = new StringText(inlineEdit.edit.apply(inlineEdit.originalText));
        diff = lineRangeMappingFromRangeMappings(mappings, inlineEdit.originalText, newText);
      } else {
        mappings = [];
        diff = [];
        newText = inlineEdit.originalText;
      }
      let state = this._determineRenderState(model, reader, diff, newText);
      if (!state) {
        onUnexpectedError(new Error(`unable to determine view: tried to render ${this._previousView?.view}`));
        return void 0;
      }
      const longDistanceHint = this._getLongDistanceHintState(model, reader);
      if (longDistanceHint && longDistanceHint.isVisible) {
        state.viewData.setLongDistanceViewData(longDistanceHint.lineNumber, inlineEdit.lineEdit.lineRange.startLineNumber);
      }
      state.viewData.isForAnotherDocument = !inlineEdit.originalText.targets(textModel);
      if (state.kind === InlineCompletionViewKind.SideBySide) {
        const indentationAdjustmentEdit = createReindentEdit(newText.getValue(), inlineEdit.modifiedLineRange, textModel.getOptions().tabSize);
        newText = new StringText(indentationAdjustmentEdit.applyToString(newText.getValue()));
        mappings = applyEditToModifiedRangeMappings(mappings, indentationAdjustmentEdit);
        diff = lineRangeMappingFromRangeMappings(mappings, inlineEdit.originalText, newText);
      }
      this._previewTextModel.setLanguage(textModel.getLanguageId());
      const previousNewText = this._previewTextModel.getValue();
      if (previousNewText !== newText.getValue()) {
        this._previewTextModel.setEOL(textModel.getEndOfLineSequence());
        const updateOldValueEdit = StringEdit.replace(new OffsetRange(0, previousNewText.length), newText.getValue());
        const updateOldValueEditSmall = updateOldValueEdit.removeCommonSuffixPrefix(previousNewText);
        const textEdit = getPositionOffsetTransformerFromTextModel(this._previewTextModel).getTextEdit(updateOldValueEditSmall);
        this._previewTextModel.edit(textEdit);
      }
      if (this._showCollapsed.read(reader)) {
        state = { kind: InlineCompletionViewKind.Collapsed, viewData: state.viewData };
      }
      model.handleInlineEditShownNextFrame(state.kind, state.viewData);
      const nextCursorPosition = inlineEdit.action?.kind === "jumpTo" ? inlineEdit.action.position : null;
      return {
        state,
        diff,
        edit: inlineEdit,
        newText: newText.getValue(),
        newTextLineCount: inlineEdit.modifiedLineRange.length,
        editorType: model.editorType,
        longDistanceHint,
        nextCursorPosition,
        target: inlineEdit.inlineCompletion.originalTextRef
      };
    });
    this.inlineEditsIsHovered = derived(this, (reader) => {
      return this._sideBySide.isHovered.read(reader) || this._wordReplacementViews.read(reader).some((v) => v.isHovered.read(reader)) || this._deletion.isHovered.read(reader) || this._inlineDiffView.isHovered.read(reader) || this._lineReplacementView.isHovered.read(reader) || this._insertion.isHovered.read(reader) || this._customView.isHovered.read(reader) || this._longDistanceHint.map((v, r) => v?.isHovered.read(r) ?? false).read(reader);
    });
    this.gutterIndicatorOffset = derived(this, (reader) => {
      if (this._uiState.read(reader)?.state?.kind === "insertionMultiLine") {
        return this._insertion.startLineOffset.read(reader);
      }
      return 0;
    });
    this._editorObs = observableCodeEditor(this._editor);
    this._constructorDone = observableValue(this, false);
    this._previewTextModel = this._register(this._instantiationService.createInstance(
      TextModel,
      "",
      this._editor.getModel().getLanguageId(),
      { ...TextModel.DEFAULT_CREATION_OPTIONS, bracketPairColorizationOptions: { enabled: true, independentColorPoolPerBracketType: false } },
      null
    ));
    this._sideBySide = this._register(this._instantiationService.createInstance(
      InlineEditsSideBySideView,
      this._editor,
      this._model.map((m) => m?.inlineEdit),
      this._previewTextModel,
      this._uiState.map((s) => s && s.state?.kind === InlineCompletionViewKind.SideBySide ? {
        newTextLineCount: s.newTextLineCount,
        editorType: s.editorType
      } : void 0),
      this._tabAction
    ));
    this._deletion = this._register(this._instantiationService.createInstance(
      InlineEditsDeletionView,
      this._editor,
      this._model.map((m) => m?.inlineEdit),
      this._uiState.map((s) => s && s.state?.kind === InlineCompletionViewKind.Deletion ? {
        originalRange: s.state.originalRange,
        deletions: s.state.deletions,
        editorType: s.editorType
      } : void 0),
      this._tabAction
    ));
    this._insertion = this._register(this._instantiationService.createInstance(
      InlineEditsInsertionView,
      this._editor,
      this._uiState.map((s) => s && s.state?.kind === InlineCompletionViewKind.InsertionMultiLine ? {
        lineNumber: s.state.lineNumber,
        startColumn: s.state.column,
        text: s.state.text,
        editorType: s.editorType
      } : void 0),
      this._tabAction
    ));
    this._inlineCollapsedView = this._register(this._instantiationService.createInstance(
      InlineEditsCollapsedView,
      this._editor,
      this._model.map((m, reader) => this._uiState.read(reader)?.state?.kind === InlineCompletionViewKind.Collapsed ? m?.inlineEdit : void 0)
    ));
    this._customView = this._register(this._instantiationService.createInstance(
      InlineEditsCustomView,
      this._editor,
      this._model.map((m, reader) => this._uiState.read(reader)?.state?.kind === InlineCompletionViewKind.Custom ? m?.displayLocation : void 0),
      this._tabAction,
      this._uiState.map((s) => s?.editorType ?? InlineCompletionEditorType.TextEditor)
    ));
    this._showLongDistanceHint = this._editorObs.getOption(EditorOption.inlineSuggest).map(this, (s) => s.edits.showLongDistanceHint);
    this._longDistanceHint = derived(this, (reader) => {
      if (!this._showLongDistanceHint.read(reader)) {
        return void 0;
      }
      return reader.store.add(this._instantiationService.createInstance(
        InlineEditsLongDistanceHint,
        this._editor,
        this._uiState.map((s, reader2) => s?.longDistanceHint ? {
          hint: s.longDistanceHint,
          newTextLineCount: s.newTextLineCount,
          edit: s.edit,
          diff: s.diff,
          editorType: s.editorType,
          model: this._simpleModel.read(reader2),
          inlineSuggestInfo: this._inlineSuggestInfo.read(reader2),
          nextCursorPosition: s.nextCursorPosition,
          target: s.target
        } : void 0),
        this._previewTextModel,
        this._tabAction
      ));
    }).recomputeInitiallyAndOnChange(this._store);
    this._inlineDiffViewState = derived(this, (reader) => {
      const e = this._uiState.read(reader);
      if (!e || !e.state) {
        return void 0;
      }
      if (e.state.kind === "wordReplacements" || e.state.kind === "insertionMultiLine" || e.state.kind === "collapsed" || e.state.kind === "custom" || e.state.kind === "jumpTo") {
        return void 0;
      }
      return {
        modifiedText: new StringText(e.newText),
        diff: e.diff,
        mode: e.state.kind,
        modifiedCodeEditor: this._sideBySide.previewEditor,
        editorType: e.editorType
      };
    });
    this._inlineDiffView = this._register(new OriginalEditorInlineDiffView(this._editor, this._inlineDiffViewState, this._previewTextModel));
    this._jumpToView = this._register(this._instantiationService.createInstance(JumpToView, this._editorObs, { style: "label" }, derived((reader) => {
      const s = this._uiState.read(reader);
      if (s?.state?.kind === InlineCompletionViewKind.JumpTo) {
        return { jumpToPosition: s.state.position };
      }
      return void 0;
    })));
    const wordReplacements = derivedOpts({
      equalsFn: equals.arrayC(equals.thisC())
    }, (reader) => {
      const s = this._uiState.read(reader);
      return s?.state?.kind === InlineCompletionViewKind.WordReplacements ? s.state.replacements.map((replacement) => new WordReplacementsViewData(replacement, s.editorType, s.state?.alternativeAction)) : [];
    });
    this._wordReplacementViews = mapObservableArrayCached(this, wordReplacements, (viewData, store) => {
      return store.add(this._instantiationService.createInstance(InlineEditsWordReplacementView, this._editorObs, viewData, this._tabAction));
    });
    this._lineReplacementView = this._register(this._instantiationService.createInstance(
      InlineEditsLineReplacementView,
      this._editorObs,
      this._uiState.map((s) => s?.state?.kind === InlineCompletionViewKind.LineReplacement ? {
        originalRange: s.state.originalRange,
        modifiedRange: s.state.modifiedRange,
        modifiedLines: s.state.modifiedLines,
        replacements: s.state.replacements
      } : void 0),
      this._uiState.map((s) => s?.editorType ?? InlineCompletionEditorType.TextEditor),
      this._tabAction
    ));
    this._useCodeShifting = this._editorObs.getOption(EditorOption.inlineSuggest).map((s) => s.edits.allowCodeShifting);
    this._renderSideBySide = this._editorObs.getOption(EditorOption.inlineSuggest).map((s) => s.edits.renderSideBySide);
    this._register(autorun((reader) => {
      const model = this._model.read(reader);
      if (!model) {
        return;
      }
      reader.store.add(
        Event.any(
          this._sideBySide.onDidClick,
          this._lineReplacementView.onDidClick,
          this._insertion.onDidClick,
          ...this._wordReplacementViews.read(reader).map((w) => w.onDidClick),
          this._inlineDiffView.onDidClick,
          this._customView.onDidClick
        )((clickEvent) => {
          if (this._viewHasBeenShownLongerThan(350)) {
            clickEvent.event.preventDefault();
            model.accept(clickEvent.alternativeAction);
          }
        })
      );
    }));
    this._wordReplacementViews.recomputeInitiallyAndOnChange(this._store);
    const minEditorScrollHeight = derived(this, (reader) => {
      return Math.max(
        ...this._wordReplacementViews.read(reader).map((v) => v.minEditorScrollHeight.read(reader)),
        this._lineReplacementView.minEditorScrollHeight.read(reader),
        this._customView.minEditorScrollHeight.read(reader)
      );
    }).recomputeInitiallyAndOnChange(this._store);
    let viewZoneId;
    this._register(autorun((reader) => {
      const minScrollHeight = minEditorScrollHeight.read(reader);
      const textModel = this._editorObs.model.read(reader);
      if (!textModel) {
        return;
      }
      this._editor.changeViewZones((accessor) => {
        const scrollHeight = this._editor.getScrollHeight();
        const viewZoneHeight = minScrollHeight - scrollHeight + 1;
        if (viewZoneHeight !== 0 && viewZoneId !== void 0) {
          accessor.removeZone(viewZoneId);
          viewZoneId = void 0;
        }
        if (viewZoneHeight <= 0) {
          return;
        }
        viewZoneId = accessor.addZone({
          afterLineNumber: textModel.getLineCount(),
          heightInPx: viewZoneHeight,
          domNode: $("div.minScrollHeightViewZone")
        });
      });
    }));
    this._constructorDone.set(true, void 0);
  }
  _getLongDistanceHintState(model, reader) {
    if (model.inlineEdit.inlineCompletion.identity.jumpedTo.read(reader)) {
      return void 0;
    }
    if (model.inlineEdit.action === void 0) {
      return void 0;
    }
    const editorModel = this._editorObs.model.read(reader);
    if (!editorModel || !model.inlineEdit.originalText.targets(editorModel)) {
      return {
        isVisible: true,
        lineNumber: model.inlineEdit.cursorPosition.lineNumber
      };
    }
    if (this._currentInlineEditCache?.inlineSuggestionIdentity !== model.inlineEdit.inlineCompletion.identity) {
      this._currentInlineEditCache = {
        inlineSuggestionIdentity: model.inlineEdit.inlineCompletion.identity,
        firstCursorLineNumber: model.inlineEdit.cursorPosition.lineNumber
      };
    }
    return {
      lineNumber: this._currentInlineEditCache.firstCursorLineNumber,
      isVisible: !model.inViewPort.read(reader)
    };
  }
  _getCacheId(model) {
    return model.inlineEdit.inlineCompletion.identity.id;
  }
  _determineView(model, reader, diff, newText) {
    const inlineEdit = model.inlineEdit;
    const canUseCache = this._previousView?.id === this._getCacheId(model) && this._previousView?.uri.toString() === this._editorObs.model.get().uri.toString();
    const reconsiderViewEditorWidthChange = this._previousView?.editorWidth !== this._editorObs.layoutInfoWidth.read(reader) && (this._previousView?.view === InlineCompletionViewKind.SideBySide || this._previousView?.view === InlineCompletionViewKind.LineReplacement);
    if (canUseCache && !reconsiderViewEditorWidthChange) {
      return this._previousView.view;
    }
    const action = model.inlineEdit.inlineCompletion.action;
    if (action?.kind === "edit" && action.alternativeAction) {
      return InlineCompletionViewKind.WordReplacements;
    }
    const targetUri = model.inlineEdit.inlineCompletion.originalTextRef.uri;
    const currentUri = this._editorObs.model.read(reader)?.uri;
    if (currentUri && targetUri.toString() !== currentUri.toString()) {
      return InlineCompletionViewKind.Custom;
    }
    if (model.displayLocation && !model.inlineEdit.inlineCompletion.identity.jumpedTo.read(reader)) {
      return InlineCompletionViewKind.Custom;
    }
    const numOriginalLines = inlineEdit.originalLineRange.length;
    const numModifiedLines = inlineEdit.modifiedLineRange.length;
    const inner = diff.flatMap((d) => d.innerChanges ?? []);
    const isSingleInnerEdit = inner.length === 1;
    if (model.editorType !== InlineCompletionEditorType.DiffEditor) {
      if (isSingleInnerEdit && this._useCodeShifting.read(reader) !== "never" && isSingleLineInsertion(diff)) {
        if (isSingleLineInsertionAfterPosition(diff, inlineEdit.cursorPosition)) {
          return InlineCompletionViewKind.InsertionInline;
        }
        return InlineCompletionViewKind.LineReplacement;
      }
      if (isDeletion(inner, inlineEdit, newText)) {
        return InlineCompletionViewKind.Deletion;
      }
      if (isSingleMultiLineInsertion(diff) && this._useCodeShifting.read(reader) === "always") {
        return InlineCompletionViewKind.InsertionMultiLine;
      }
      const allInnerChangesNotTooLong = inner.every((m) => TextLength.ofRange(m.originalRange).columnCount < InlineEditsWordReplacementView.MAX_LENGTH && TextLength.ofRange(m.modifiedRange).columnCount < InlineEditsWordReplacementView.MAX_LENGTH);
      if (allInnerChangesNotTooLong && isSingleInnerEdit && numOriginalLines === 1 && numModifiedLines === 1) {
        const modifiedText = inner.map((m) => newText.getValueOfRange(m.modifiedRange));
        const originalText = inner.map((m) => model.inlineEdit.originalText.getValueOfRange(m.originalRange));
        if (!modifiedText.some((v) => v.includes("	")) && !originalText.some((v) => v.includes("	"))) {
          if (!inner.some((m) => m.originalRange.isEmpty()) || !growEditsUntilWhitespace(inner.map((m) => new TextReplacement(m.originalRange, "")), inlineEdit.originalText).some((e) => e.range.isEmpty() && TextLength.ofRange(e.range).columnCount < InlineEditsWordReplacementView.MAX_LENGTH)) {
            return InlineCompletionViewKind.WordReplacements;
          }
        }
      }
    }
    if (numOriginalLines > 0 && numModifiedLines > 0) {
      if (numOriginalLines === 1 && numModifiedLines === 1 && model.editorType !== InlineCompletionEditorType.DiffEditor) {
        return InlineCompletionViewKind.LineReplacement;
      }
      if (this._renderSideBySide.read(reader) !== "never" && InlineEditsSideBySideView.fitsInsideViewport(this._editor, this._previewTextModel, inlineEdit, reader)) {
        return InlineCompletionViewKind.SideBySide;
      }
      return InlineCompletionViewKind.LineReplacement;
    }
    if (model.editorType === InlineCompletionEditorType.DiffEditor) {
      if (isDeletion(inner, inlineEdit, newText)) {
        return InlineCompletionViewKind.Deletion;
      }
      if (isSingleMultiLineInsertion(diff) && this._useCodeShifting.read(reader) === "always") {
        return InlineCompletionViewKind.InsertionMultiLine;
      }
    }
    return InlineCompletionViewKind.SideBySide;
  }
  _determineRenderState(model, reader, diff, newText) {
    if (model.inlineEdit.action?.kind === "jumpTo") {
      return {
        kind: InlineCompletionViewKind.JumpTo,
        position: model.inlineEdit.action.position,
        viewData: createEmptyViewData()
      };
    }
    const inlineEdit = model.inlineEdit;
    let view = this._determineView(model, reader, diff, newText);
    if (this._willRenderAboveCursor(reader, inlineEdit, view)) {
      switch (view) {
        case InlineCompletionViewKind.LineReplacement:
        case InlineCompletionViewKind.WordReplacements:
          view = InlineCompletionViewKind.SideBySide;
          break;
      }
    }
    this._previousView = { id: this._getCacheId(model), view, editorWidth: this._editor.getLayoutInfo().width, timestamp: Date.now(), uri: this._editorObs.model.get().uri };
    const inner = diff.flatMap((d) => d.innerChanges ?? []);
    const textModel = this._editor.getModel();
    const stringChanges = inner.map((m) => ({
      originalRange: m.originalRange,
      modifiedRange: m.modifiedRange,
      original: inlineEdit.originalText.getValueOfRange(m.originalRange),
      modified: newText.getValueOfRange(m.modifiedRange)
    }));
    const viewData = getViewData(inlineEdit, stringChanges, textModel);
    switch (view) {
      case InlineCompletionViewKind.InsertionInline:
        return { kind: InlineCompletionViewKind.InsertionInline, viewData };
      case InlineCompletionViewKind.SideBySide:
        return { kind: InlineCompletionViewKind.SideBySide, viewData };
      case InlineCompletionViewKind.Collapsed:
        return { kind: InlineCompletionViewKind.Collapsed, viewData };
      case InlineCompletionViewKind.Custom:
        return { kind: InlineCompletionViewKind.Custom, displayLocation: model.displayLocation, viewData };
    }
    if (view === InlineCompletionViewKind.Deletion) {
      return {
        kind: InlineCompletionViewKind.Deletion,
        originalRange: inlineEdit.originalLineRange,
        deletions: inner.map((m) => m.originalRange),
        viewData
      };
    }
    if (view === InlineCompletionViewKind.InsertionMultiLine) {
      const change = inner[0];
      return {
        kind: InlineCompletionViewKind.InsertionMultiLine,
        lineNumber: change.originalRange.startLineNumber,
        column: change.originalRange.startColumn,
        text: newText.getValueOfRange(change.modifiedRange),
        viewData
      };
    }
    const replacements = stringChanges.map((m) => new TextReplacement(m.originalRange, m.modified));
    if (replacements.length === 0) {
      return void 0;
    }
    if (view === InlineCompletionViewKind.WordReplacements) {
      let grownEdits = growEditsToEntireWord(replacements, inlineEdit.originalText);
      if (grownEdits.some((e) => e.range.isEmpty())) {
        grownEdits = growEditsUntilWhitespace(replacements, inlineEdit.originalText);
      }
      return {
        kind: InlineCompletionViewKind.WordReplacements,
        replacements: grownEdits,
        alternativeAction: model.inlineEdit.action?.alternativeAction,
        viewData
      };
    }
    if (view === InlineCompletionViewKind.LineReplacement) {
      return {
        kind: InlineCompletionViewKind.LineReplacement,
        originalRange: inlineEdit.originalLineRange,
        modifiedRange: inlineEdit.modifiedLineRange,
        modifiedLines: inlineEdit.modifiedLineRange.mapToLineArray((line) => newText.getLineAt(line)),
        replacements: inner.map((m) => ({ originalRange: m.originalRange, modifiedRange: m.modifiedRange })),
        viewData
      };
    }
    return void 0;
  }
  _willRenderAboveCursor(reader, inlineEdit, view) {
    const useCodeShifting = this._useCodeShifting.read(reader);
    if (useCodeShifting === "always") {
      return false;
    }
    for (const cursorPosition of inlineEdit.multiCursorPositions) {
      if (view === InlineCompletionViewKind.WordReplacements && cursorPosition.lineNumber === inlineEdit.originalLineRange.startLineNumber + 1) {
        return true;
      }
      if (view === InlineCompletionViewKind.LineReplacement && cursorPosition.lineNumber >= inlineEdit.originalLineRange.endLineNumberExclusive && cursorPosition.lineNumber < inlineEdit.modifiedLineRange.endLineNumberExclusive + inlineEdit.modifiedLineRange.length) {
        return true;
      }
    }
    return false;
  }
  _viewHasBeenShownLongerThan(durationMs) {
    const viewCreationTime = this._previousView?.timestamp;
    if (!viewCreationTime) {
      throw new BugIndicatingError("viewHasBeenShownLongThan called before a view has been shown");
    }
    const currentTime = Date.now();
    return currentTime - viewCreationTime >= durationMs;
  }
};
InlineEditsView = __decorateClass([
  __decorateParam(5, IInstantiationService)
], InlineEditsView);
const createEmptyViewData = () => new InlineCompletionViewData(-1, -1, -1, -1, -1, -1, -1, true);
function getViewData(inlineEdit, stringChanges, textModel) {
  if (!inlineEdit.edit) {
    return createEmptyViewData();
  }
  const cursorPosition = inlineEdit.cursorPosition;
  const startsWithEOL = stringChanges.length === 0 ? false : stringChanges[0].modified.startsWith(textModel.getEOL());
  const viewData = new InlineCompletionViewData(
    inlineEdit.edit.replacements.length === 0 ? 0 : inlineEdit.edit.replacements[0].range.getStartPosition().column - cursorPosition.column,
    inlineEdit.lineEdit.lineRange.startLineNumber - cursorPosition.lineNumber + (startsWithEOL && inlineEdit.lineEdit.lineRange.startLineNumber >= cursorPosition.lineNumber ? 1 : 0),
    inlineEdit.lineEdit.lineRange.length,
    inlineEdit.lineEdit.newLines.length,
    stringChanges.reduce((acc, r) => acc + r.original.length, 0),
    stringChanges.reduce((acc, r) => acc + r.modified.length, 0),
    stringChanges.length,
    stringChanges.every((r) => r.original === stringChanges[0].original && r.modified === stringChanges[0].modified)
  );
  return viewData;
}
function isSingleLineInsertion(diff) {
  return diff.every((m) => m.innerChanges.every((r) => isWordInsertion(r)));
  function isWordInsertion(r) {
    if (!r.originalRange.isEmpty()) {
      return false;
    }
    const isInsertionWithinLine = r.modifiedRange.startLineNumber === r.modifiedRange.endLineNumber;
    if (!isInsertionWithinLine) {
      return false;
    }
    return true;
  }
}
function isSingleLineInsertionAfterPosition(diff, position) {
  if (!position) {
    return false;
  }
  if (!isSingleLineInsertion(diff)) {
    return false;
  }
  const pos = position;
  return diff.every((m) => m.innerChanges.every((r) => isStableWordInsertion(r)));
  function isStableWordInsertion(r) {
    const insertPosition = r.originalRange.getStartPosition();
    if (pos.isBeforeOrEqual(insertPosition)) {
      return true;
    }
    if (insertPosition.lineNumber < pos.lineNumber) {
      return true;
    }
    return false;
  }
}
function isSingleMultiLineInsertion(diff) {
  const inner = diff.flatMap((d) => d.innerChanges ?? []);
  if (inner.length !== 1) {
    return false;
  }
  const change = inner[0];
  if (!change.originalRange.isEmpty()) {
    return false;
  }
  if (change.modifiedRange.startLineNumber === change.modifiedRange.endLineNumber) {
    return false;
  }
  return true;
}
function isDeletion(inner, inlineEdit, newText) {
  const innerValues = inner.map((m) => ({ original: inlineEdit.originalText.getValueOfRange(m.originalRange), modified: newText.getValueOfRange(m.modifiedRange) }));
  return innerValues.every(({ original, modified }) => modified.trim() === "" && original.length > 0 && (original.length > modified.length || original.trim() !== ""));
}
function growEditsToEntireWord(replacements, originalText) {
  return _growEdits(replacements, originalText, (char) => /^[a-zA-Z]$/.test(char));
}
function growEditsUntilWhitespace(replacements, originalText) {
  return _growEdits(replacements, originalText, (char) => !/^\s$/.test(char));
}
function _growEdits(replacements, originalText, fn) {
  const result = [];
  replacements.sort((a, b) => Range.compareRangesUsingStarts(a.range, b.range));
  for (const edit of replacements) {
    let startIndex = edit.range.startColumn - 1;
    let endIndex = edit.range.endColumn - 2;
    let prefix = "";
    let suffix = "";
    const startLineContent = originalText.getLineAt(edit.range.startLineNumber);
    const endLineContent = originalText.getLineAt(edit.range.endLineNumber);
    if (isIncluded(startLineContent[startIndex])) {
      while (isIncluded(startLineContent[startIndex - 1])) {
        prefix = startLineContent[startIndex - 1] + prefix;
        startIndex--;
      }
    }
    if (isIncluded(endLineContent[endIndex]) || endIndex < startIndex) {
      while (isIncluded(endLineContent[endIndex + 1])) {
        suffix += endLineContent[endIndex + 1];
        endIndex++;
      }
    }
    let newEdit = new TextReplacement(new Range(edit.range.startLineNumber, startIndex + 1, edit.range.endLineNumber, endIndex + 2), prefix + edit.text + suffix);
    if (result.length > 0 && Range.areIntersectingOrTouching(result[result.length - 1].range, newEdit.range)) {
      newEdit = TextReplacement.joinReplacements([result.pop(), newEdit], originalText);
    }
    result.push(newEdit);
  }
  function isIncluded(c) {
    if (c === void 0) {
      return false;
    }
    return fn(c);
  }
  return result;
}
export {
  InlineEditsView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c1ZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyAkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBlcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcXVhbHMuanMnO1xuaW1wb3J0IHsgQnVnSW5kaWNhdGluZ0Vycm9yLCBvblVuZXhwZWN0ZWRFcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgZGVyaXZlZCwgZGVyaXZlZE9wdHMsIElPYnNlcnZhYmxlLCBJUmVhZGVyLCBtYXBPYnNlcnZhYmxlQXJyYXlDYWNoZWQsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBPYnNlcnZhYmxlQ29kZUVkaXRvciwgb2JzZXJ2YWJsZUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9icm93c2VyL29ic2VydmFibGVDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBUZXh0UmVwbGFjZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9lZGl0cy90ZXh0RWRpdC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgTGluZVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvcmFuZ2VzL2xpbmVSYW5nZS5qcyc7XG5pbXBvcnQgeyBBYnN0cmFjdFRleHQsIFN0cmluZ1RleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS90ZXh0L2Fic3RyYWN0VGV4dC5qcyc7XG5pbXBvcnQgeyBUZXh0TGVuZ3RoIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2NvcmUvdGV4dC90ZXh0TGVuZ3RoLmpzJztcbmltcG9ydCB7IERldGFpbGVkTGluZVJhbmdlTWFwcGluZywgbGluZVJhbmdlTWFwcGluZ0Zyb21SYW5nZU1hcHBpbmdzLCBSYW5nZU1hcHBpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vZGlmZi9yYW5nZU1hcHBpbmcuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElubGluZVN1Z2dlc3Rpb25JZGVudGl0eSB9IGZyb20gJy4uLy4uL21vZGVsL2lubGluZVN1Z2dlc3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IElubGluZVN1Z2dlc3Rpb25HdXR0ZXJNZW51RGF0YSwgU2ltcGxlSW5saW5lU3VnZ2VzdE1vZGVsIH0gZnJvbSAnLi9jb21wb25lbnRzL2d1dHRlckluZGljYXRvclZpZXcuanMnO1xuaW1wb3J0IHsgSW5saW5lRWRpdFdpdGhDaGFuZ2VzIH0gZnJvbSAnLi9pbmxpbmVFZGl0V2l0aENoYW5nZXMuanMnO1xuaW1wb3J0IHsgTW9kZWxQZXJJbmxpbmVFZGl0IH0gZnJvbSAnLi9pbmxpbmVFZGl0c01vZGVsLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25WaWV3RGF0YSwgSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLCBJbmxpbmVFZGl0VGFiQWN0aW9uIH0gZnJvbSAnLi9pbmxpbmVFZGl0c1ZpZXdJbnRlcmZhY2UuanMnO1xuaW1wb3J0IHsgSW5saW5lRWRpdHNDb2xsYXBzZWRWaWV3IH0gZnJvbSAnLi9pbmxpbmVFZGl0c1ZpZXdzL2lubGluZUVkaXRzQ29sbGFwc2VkVmlldy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVFZGl0c0N1c3RvbVZpZXcgfSBmcm9tICcuL2lubGluZUVkaXRzVmlld3MvaW5saW5lRWRpdHNDdXN0b21WaWV3LmpzJztcbmltcG9ydCB7IElubGluZUVkaXRzRGVsZXRpb25WaWV3IH0gZnJvbSAnLi9pbmxpbmVFZGl0c1ZpZXdzL2lubGluZUVkaXRzRGVsZXRpb25WaWV3LmpzJztcbmltcG9ydCB7IElubGluZUVkaXRzSW5zZXJ0aW9uVmlldyB9IGZyb20gJy4vaW5saW5lRWRpdHNWaWV3cy9pbmxpbmVFZGl0c0luc2VydGlvblZpZXcuanMnO1xuaW1wb3J0IHsgSW5saW5lRWRpdHNMaW5lUmVwbGFjZW1lbnRWaWV3IH0gZnJvbSAnLi9pbmxpbmVFZGl0c1ZpZXdzL2lubGluZUVkaXRzTGluZVJlcGxhY2VtZW50Vmlldy5qcyc7XG5pbXBvcnQgeyBJTG9uZ0Rpc3RhbmNlSGludCwgSUxvbmdEaXN0YW5jZVZpZXdTdGF0ZSwgSW5saW5lRWRpdHNMb25nRGlzdGFuY2VIaW50IH0gZnJvbSAnLi9pbmxpbmVFZGl0c1ZpZXdzL2xvbmdEaXN0YW5jZUhpbnQvaW5saW5lRWRpdHNMb25nRGlzdGFuY2VIaW50LmpzJztcbmltcG9ydCB7IElubGluZUVkaXRzU2lkZUJ5U2lkZVZpZXcgfSBmcm9tICcuL2lubGluZUVkaXRzVmlld3MvaW5saW5lRWRpdHNTaWRlQnlTaWRlVmlldy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVFZGl0c1dvcmRSZXBsYWNlbWVudFZpZXcsIFdvcmRSZXBsYWNlbWVudHNWaWV3RGF0YSB9IGZyb20gJy4vaW5saW5lRWRpdHNWaWV3cy9pbmxpbmVFZGl0c1dvcmRSZXBsYWNlbWVudFZpZXcuanMnO1xuaW1wb3J0IHsgSU9yaWdpbmFsRWRpdG9ySW5saW5lRGlmZlZpZXdTdGF0ZSwgT3JpZ2luYWxFZGl0b3JJbmxpbmVEaWZmVmlldyB9IGZyb20gJy4vaW5saW5lRWRpdHNWaWV3cy9vcmlnaW5hbEVkaXRvcklubGluZURpZmZWaWV3LmpzJztcbmltcG9ydCB7IGFwcGx5RWRpdFRvTW9kaWZpZWRSYW5nZU1hcHBpbmdzLCBjcmVhdGVSZWluZGVudEVkaXQgfSBmcm9tICcuL3V0aWxzL3V0aWxzLmpzJztcbmltcG9ydCAnLi92aWV3LmNzcyc7XG5pbXBvcnQgeyBKdW1wVG9WaWV3IH0gZnJvbSAnLi9pbmxpbmVFZGl0c1ZpZXdzL2p1bXBUb1ZpZXcuanMnO1xuaW1wb3J0IHsgU3RyaW5nRWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRzL3N0cmluZ0VkaXQuanMnO1xuaW1wb3J0IHsgT2Zmc2V0UmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgZ2V0UG9zaXRpb25PZmZzZXRUcmFuc2Zvcm1lckZyb21UZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9jb21tb24vY29yZS90ZXh0L2dldFBvc2l0aW9uT2Zmc2V0VHJhbnNmb3JtZXJGcm9tVGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25FZGl0b3JUeXBlIH0gZnJvbSAnLi4vLi4vbW9kZWwvcHJvdmlkZUlubGluZUNvbXBsZXRpb25zLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbFZhbHVlUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vbW9kZWwvdGV4dE1vZGVsVmFsdWVSZWZlcmVuY2UuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuZXhwb3J0IGNsYXNzIElubGluZUVkaXRzVmlldyBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JPYnM6IE9ic2VydmFibGVDb2RlRWRpdG9yO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3VzZUNvZGVTaGlmdGluZztcblx0cHJpdmF0ZSByZWFkb25seSBfcmVuZGVyU2lkZUJ5U2lkZTtcblx0cHJpdmF0ZSByZWFkb25seSBfdGFiQWN0aW9uID0gZGVyaXZlZDxJbmxpbmVFZGl0VGFiQWN0aW9uPihyZWFkZXIgPT4gdGhpcy5fbW9kZWwucmVhZChyZWFkZXIpPy50YWJBY3Rpb24ucmVhZChyZWFkZXIpID8/IElubGluZUVkaXRUYWJBY3Rpb24uSW5hY3RpdmUpO1xuXG5cdHByaXZhdGUgX3ByZXZpb3VzVmlldzogeyAvLyBUT0RPLCBtb3ZlIGludG8gaWRlbnRpdHlcblx0XHRpZDogc3RyaW5nO1xuXHRcdHZpZXc6IFJldHVyblR5cGU8dHlwZW9mIElubGluZUVkaXRzVmlldy5wcm90b3R5cGUuX2RldGVybWluZVZpZXc+O1xuXHRcdGVkaXRvcldpZHRoOiBudW1iZXI7XG5cdFx0dGltZXN0YW1wOiBudW1iZXI7XG5cdFx0dXJpOiBVUkk7XG5cdH0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nob3dMb25nRGlzdGFuY2VIaW50OiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElDb2RlRWRpdG9yLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsOiBJT2JzZXJ2YWJsZTxNb2RlbFBlcklubGluZUVkaXQgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3NpbXBsZU1vZGVsOiBJT2JzZXJ2YWJsZTxTaW1wbGVJbmxpbmVTdWdnZXN0TW9kZWwgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2lubGluZVN1Z2dlc3RJbmZvOiBJT2JzZXJ2YWJsZTxJbmxpbmVTdWdnZXN0aW9uR3V0dGVyTWVudURhdGEgfCB1bmRlZmluZWQ+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3Nob3dDb2xsYXBzZWQ6IElPYnNlcnZhYmxlPGJvb2xlYW4+LFxuXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fZWRpdG9yT2JzID0gb2JzZXJ2YWJsZUNvZGVFZGl0b3IodGhpcy5fZWRpdG9yKTtcblx0XHR0aGlzLl9jb25zdHJ1Y3RvckRvbmUgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgZmFsc2UpO1xuXG5cdFx0dGhpcy5fcHJldmlld1RleHRNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0VGV4dE1vZGVsLFxuXHRcdFx0JycsXG5cdFx0XHR0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKSEuZ2V0TGFuZ3VhZ2VJZCgpLFxuXHRcdFx0eyAuLi5UZXh0TW9kZWwuREVGQVVMVF9DUkVBVElPTl9PUFRJT05TLCBicmFja2V0UGFpckNvbG9yaXphdGlvbk9wdGlvbnM6IHsgZW5hYmxlZDogdHJ1ZSwgaW5kZXBlbmRlbnRDb2xvclBvb2xQZXJCcmFja2V0VHlwZTogZmFsc2UgfSB9LFxuXHRcdFx0bnVsbFxuXHRcdCkpO1xuXG5cdFx0dGhpcy5fc2lkZUJ5U2lkZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKElubGluZUVkaXRzU2lkZUJ5U2lkZVZpZXcsXG5cdFx0XHR0aGlzLl9lZGl0b3IsXG5cdFx0XHR0aGlzLl9tb2RlbC5tYXAobSA9PiBtPy5pbmxpbmVFZGl0KSxcblx0XHRcdHRoaXMuX3ByZXZpZXdUZXh0TW9kZWwsXG5cdFx0XHR0aGlzLl91aVN0YXRlLm1hcChzID0+IHMgJiYgcy5zdGF0ZT8ua2luZCA9PT0gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLlNpZGVCeVNpZGUgPyAoe1xuXHRcdFx0XHRuZXdUZXh0TGluZUNvdW50OiBzLm5ld1RleHRMaW5lQ291bnQsXG5cdFx0XHRcdGVkaXRvclR5cGU6IHMuZWRpdG9yVHlwZSxcblx0XHRcdH0pIDogdW5kZWZpbmVkKSxcblx0XHRcdHRoaXMuX3RhYkFjdGlvbixcblx0XHQpKTtcblx0XHR0aGlzLl9kZWxldGlvbiA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKElubGluZUVkaXRzRGVsZXRpb25WaWV3LFxuXHRcdFx0dGhpcy5fZWRpdG9yLFxuXHRcdFx0dGhpcy5fbW9kZWwubWFwKG0gPT4gbT8uaW5saW5lRWRpdCksXG5cdFx0XHR0aGlzLl91aVN0YXRlLm1hcChzID0+IHMgJiYgcy5zdGF0ZT8ua2luZCA9PT0gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkRlbGV0aW9uID8gKHtcblx0XHRcdFx0b3JpZ2luYWxSYW5nZTogcy5zdGF0ZS5vcmlnaW5hbFJhbmdlLFxuXHRcdFx0XHRkZWxldGlvbnM6IHMuc3RhdGUuZGVsZXRpb25zLFxuXHRcdFx0XHRlZGl0b3JUeXBlOiBzLmVkaXRvclR5cGUsXG5cdFx0XHR9KSA6IHVuZGVmaW5lZCksXG5cdFx0XHR0aGlzLl90YWJBY3Rpb24sXG5cdFx0KSk7XG5cdFx0dGhpcy5faW5zZXJ0aW9uID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5saW5lRWRpdHNJbnNlcnRpb25WaWV3LFxuXHRcdFx0dGhpcy5fZWRpdG9yLFxuXHRcdFx0dGhpcy5fdWlTdGF0ZS5tYXAocyA9PiBzICYmIHMuc3RhdGU/LmtpbmQgPT09IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5JbnNlcnRpb25NdWx0aUxpbmUgPyAoe1xuXHRcdFx0XHRsaW5lTnVtYmVyOiBzLnN0YXRlLmxpbmVOdW1iZXIsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiBzLnN0YXRlLmNvbHVtbixcblx0XHRcdFx0dGV4dDogcy5zdGF0ZS50ZXh0LFxuXHRcdFx0XHRlZGl0b3JUeXBlOiBzLmVkaXRvclR5cGUsXG5cdFx0XHR9KSA6IHVuZGVmaW5lZCksXG5cdFx0XHR0aGlzLl90YWJBY3Rpb24sXG5cdFx0KSk7XG5cblx0XHR0aGlzLl9pbmxpbmVDb2xsYXBzZWRWaWV3ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5saW5lRWRpdHNDb2xsYXBzZWRWaWV3LFxuXHRcdFx0dGhpcy5fZWRpdG9yLFxuXHRcdFx0dGhpcy5fbW9kZWwubWFwKChtLCByZWFkZXIpID0+IHRoaXMuX3VpU3RhdGUucmVhZChyZWFkZXIpPy5zdGF0ZT8ua2luZCA9PT0gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkNvbGxhcHNlZCA/IG0/LmlubGluZUVkaXQgOiB1bmRlZmluZWQpXG5cdFx0KSk7XG5cdFx0dGhpcy5fY3VzdG9tVmlldyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKElubGluZUVkaXRzQ3VzdG9tVmlldyxcblx0XHRcdHRoaXMuX2VkaXRvcixcblx0XHRcdHRoaXMuX21vZGVsLm1hcCgobSwgcmVhZGVyKSA9PiB0aGlzLl91aVN0YXRlLnJlYWQocmVhZGVyKT8uc3RhdGU/LmtpbmQgPT09IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5DdXN0b20gPyBtPy5kaXNwbGF5TG9jYXRpb24gOiB1bmRlZmluZWQpLFxuXHRcdFx0dGhpcy5fdGFiQWN0aW9uLFxuXHRcdFx0dGhpcy5fdWlTdGF0ZS5tYXAocyA9PiBzPy5lZGl0b3JUeXBlID8/IElubGluZUNvbXBsZXRpb25FZGl0b3JUeXBlLlRleHRFZGl0b3IpLFxuXHRcdCkpO1xuXG5cdFx0dGhpcy5fc2hvd0xvbmdEaXN0YW5jZUhpbnQgPSB0aGlzLl9lZGl0b3JPYnMuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5pbmxpbmVTdWdnZXN0KS5tYXAodGhpcywgcyA9PiBzLmVkaXRzLnNob3dMb25nRGlzdGFuY2VIaW50KTtcblx0XHR0aGlzLl9sb25nRGlzdGFuY2VIaW50ID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLl9zaG93TG9uZ0Rpc3RhbmNlSGludC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZWFkZXIuc3RvcmUuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKElubGluZUVkaXRzTG9uZ0Rpc3RhbmNlSGludCxcblx0XHRcdFx0dGhpcy5fZWRpdG9yLFxuXHRcdFx0XHR0aGlzLl91aVN0YXRlLm1hcDxJTG9uZ0Rpc3RhbmNlVmlld1N0YXRlIHwgdW5kZWZpbmVkPigocywgcmVhZGVyKSA9PiBzPy5sb25nRGlzdGFuY2VIaW50ID8gKHtcblx0XHRcdFx0XHRoaW50OiBzLmxvbmdEaXN0YW5jZUhpbnQsXG5cdFx0XHRcdFx0bmV3VGV4dExpbmVDb3VudDogcy5uZXdUZXh0TGluZUNvdW50LFxuXHRcdFx0XHRcdGVkaXQ6IHMuZWRpdCxcblx0XHRcdFx0XHRkaWZmOiBzLmRpZmYsXG5cdFx0XHRcdFx0ZWRpdG9yVHlwZTogcy5lZGl0b3JUeXBlLFxuXHRcdFx0XHRcdG1vZGVsOiB0aGlzLl9zaW1wbGVNb2RlbC5yZWFkKHJlYWRlcikhLFxuXHRcdFx0XHRcdGlubGluZVN1Z2dlc3RJbmZvOiB0aGlzLl9pbmxpbmVTdWdnZXN0SW5mby5yZWFkKHJlYWRlcikhLFxuXHRcdFx0XHRcdG5leHRDdXJzb3JQb3NpdGlvbjogcy5uZXh0Q3Vyc29yUG9zaXRpb24sXG5cdFx0XHRcdFx0dGFyZ2V0OiBzLnRhcmdldCxcblx0XHRcdFx0fSkgOiB1bmRlZmluZWQpLFxuXHRcdFx0XHR0aGlzLl9wcmV2aWV3VGV4dE1vZGVsLFxuXHRcdFx0XHR0aGlzLl90YWJBY3Rpb24sXG5cdFx0XHQpKTtcblx0XHR9KS5yZWNvbXB1dGVJbml0aWFsbHlBbmRPbkNoYW5nZSh0aGlzLl9zdG9yZSk7XG5cblxuXHRcdHRoaXMuX2lubGluZURpZmZWaWV3U3RhdGUgPSBkZXJpdmVkPElPcmlnaW5hbEVkaXRvcklubGluZURpZmZWaWV3U3RhdGUgfCB1bmRlZmluZWQ+KHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBlID0gdGhpcy5fdWlTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWUgfHwgIWUuc3RhdGUpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0aWYgKGUuc3RhdGUua2luZCA9PT0gJ3dvcmRSZXBsYWNlbWVudHMnIHx8IGUuc3RhdGUua2luZCA9PT0gJ2luc2VydGlvbk11bHRpTGluZScgfHwgZS5zdGF0ZS5raW5kID09PSAnY29sbGFwc2VkJyB8fCBlLnN0YXRlLmtpbmQgPT09ICdjdXN0b20nIHx8IGUuc3RhdGUua2luZCA9PT0gJ2p1bXBUbycpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdG1vZGlmaWVkVGV4dDogbmV3IFN0cmluZ1RleHQoZS5uZXdUZXh0KSxcblx0XHRcdFx0ZGlmZjogZS5kaWZmLFxuXHRcdFx0XHRtb2RlOiBlLnN0YXRlLmtpbmQsXG5cdFx0XHRcdG1vZGlmaWVkQ29kZUVkaXRvcjogdGhpcy5fc2lkZUJ5U2lkZS5wcmV2aWV3RWRpdG9yLFxuXHRcdFx0XHRlZGl0b3JUeXBlOiBlLmVkaXRvclR5cGUsXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHRcdHRoaXMuX2lubGluZURpZmZWaWV3ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE9yaWdpbmFsRWRpdG9ySW5saW5lRGlmZlZpZXcodGhpcy5fZWRpdG9yLCB0aGlzLl9pbmxpbmVEaWZmVmlld1N0YXRlLCB0aGlzLl9wcmV2aWV3VGV4dE1vZGVsKSk7XG5cdFx0dGhpcy5fanVtcFRvVmlldyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEp1bXBUb1ZpZXcsIHRoaXMuX2VkaXRvck9icywgeyBzdHlsZTogJ2xhYmVsJyB9LCBkZXJpdmVkKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBzID0gdGhpcy5fdWlTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAocz8uc3RhdGU/LmtpbmQgPT09IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5KdW1wVG8pIHtcblx0XHRcdFx0cmV0dXJuIHsganVtcFRvUG9zaXRpb246IHMuc3RhdGUucG9zaXRpb24gfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSkpKTtcblx0XHRjb25zdCB3b3JkUmVwbGFjZW1lbnRzID0gZGVyaXZlZE9wdHMoe1xuXHRcdFx0ZXF1YWxzRm46IGVxdWFscy5hcnJheUMoZXF1YWxzLnRoaXNDKCkpXG5cdFx0fSwgcmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHMgPSB0aGlzLl91aVN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdHJldHVybiBzPy5zdGF0ZT8ua2luZCA9PT0gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLldvcmRSZXBsYWNlbWVudHMgPyBzLnN0YXRlLnJlcGxhY2VtZW50cy5tYXAocmVwbGFjZW1lbnQgPT4gbmV3IFdvcmRSZXBsYWNlbWVudHNWaWV3RGF0YShyZXBsYWNlbWVudCwgcy5lZGl0b3JUeXBlLCBzLnN0YXRlPy5hbHRlcm5hdGl2ZUFjdGlvbikpIDogW107XG5cdFx0fSk7XG5cdFx0dGhpcy5fd29yZFJlcGxhY2VtZW50Vmlld3MgPSBtYXBPYnNlcnZhYmxlQXJyYXlDYWNoZWQodGhpcywgd29yZFJlcGxhY2VtZW50cywgKHZpZXdEYXRhLCBzdG9yZSkgPT4ge1xuXHRcdFx0cmV0dXJuIHN0b3JlLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbmxpbmVFZGl0c1dvcmRSZXBsYWNlbWVudFZpZXcsIHRoaXMuX2VkaXRvck9icywgdmlld0RhdGEsIHRoaXMuX3RhYkFjdGlvbikpO1xuXHRcdH0pO1xuXHRcdHRoaXMuX2xpbmVSZXBsYWNlbWVudFZpZXcgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbmxpbmVFZGl0c0xpbmVSZXBsYWNlbWVudFZpZXcsXG5cdFx0XHR0aGlzLl9lZGl0b3JPYnMsXG5cdFx0XHR0aGlzLl91aVN0YXRlLm1hcChzID0+IHM/LnN0YXRlPy5raW5kID09PSBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuTGluZVJlcGxhY2VtZW50ID8gKHtcblx0XHRcdFx0b3JpZ2luYWxSYW5nZTogcy5zdGF0ZS5vcmlnaW5hbFJhbmdlLFxuXHRcdFx0XHRtb2RpZmllZFJhbmdlOiBzLnN0YXRlLm1vZGlmaWVkUmFuZ2UsXG5cdFx0XHRcdG1vZGlmaWVkTGluZXM6IHMuc3RhdGUubW9kaWZpZWRMaW5lcyxcblx0XHRcdFx0cmVwbGFjZW1lbnRzOiBzLnN0YXRlLnJlcGxhY2VtZW50cyxcblx0XHRcdH0pIDogdW5kZWZpbmVkKSxcblx0XHRcdHRoaXMuX3VpU3RhdGUubWFwKHMgPT4gcz8uZWRpdG9yVHlwZSA/PyBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZS5UZXh0RWRpdG9yKSxcblx0XHRcdHRoaXMuX3RhYkFjdGlvbixcblx0XHQpKTtcblxuXHRcdHRoaXMuX3VzZUNvZGVTaGlmdGluZyA9IHRoaXMuX2VkaXRvck9icy5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLmlubGluZVN1Z2dlc3QpLm1hcChzID0+IHMuZWRpdHMuYWxsb3dDb2RlU2hpZnRpbmcpO1xuXHRcdHRoaXMuX3JlbmRlclNpZGVCeVNpZGUgPSB0aGlzLl9lZGl0b3JPYnMuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5pbmxpbmVTdWdnZXN0KS5tYXAocyA9PiBzLmVkaXRzLnJlbmRlclNpZGVCeVNpZGUpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bigocmVhZGVyKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghbW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0cmVhZGVyLnN0b3JlLmFkZChcblx0XHRcdFx0RXZlbnQuYW55KFxuXHRcdFx0XHRcdHRoaXMuX3NpZGVCeVNpZGUub25EaWRDbGljayxcblx0XHRcdFx0XHR0aGlzLl9saW5lUmVwbGFjZW1lbnRWaWV3Lm9uRGlkQ2xpY2ssXG5cdFx0XHRcdFx0dGhpcy5faW5zZXJ0aW9uLm9uRGlkQ2xpY2ssXG5cdFx0XHRcdFx0Li4udGhpcy5fd29yZFJlcGxhY2VtZW50Vmlld3MucmVhZChyZWFkZXIpLm1hcCh3ID0+IHcub25EaWRDbGljayksXG5cdFx0XHRcdFx0dGhpcy5faW5saW5lRGlmZlZpZXcub25EaWRDbGljayxcblx0XHRcdFx0XHR0aGlzLl9jdXN0b21WaWV3Lm9uRGlkQ2xpY2ssXG5cdFx0XHRcdCkoY2xpY2tFdmVudCA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMuX3ZpZXdIYXNCZWVuU2hvd25Mb25nZXJUaGFuKDM1MCkpIHtcblx0XHRcdFx0XHRcdGNsaWNrRXZlbnQuZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRcdG1vZGVsLmFjY2VwdChjbGlja0V2ZW50LmFsdGVybmF0aXZlQWN0aW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pXG5cdFx0XHQpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3dvcmRSZXBsYWNlbWVudFZpZXdzLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblxuXHRcdGNvbnN0IG1pbkVkaXRvclNjcm9sbEhlaWdodCA9IGRlcml2ZWQodGhpcywgcmVhZGVyID0+IHtcblx0XHRcdHJldHVybiBNYXRoLm1heChcblx0XHRcdFx0Li4udGhpcy5fd29yZFJlcGxhY2VtZW50Vmlld3MucmVhZChyZWFkZXIpLm1hcCh2ID0+IHYubWluRWRpdG9yU2Nyb2xsSGVpZ2h0LnJlYWQocmVhZGVyKSksXG5cdFx0XHRcdHRoaXMuX2xpbmVSZXBsYWNlbWVudFZpZXcubWluRWRpdG9yU2Nyb2xsSGVpZ2h0LnJlYWQocmVhZGVyKSxcblx0XHRcdFx0dGhpcy5fY3VzdG9tVmlldy5taW5FZGl0b3JTY3JvbGxIZWlnaHQucmVhZChyZWFkZXIpXG5cdFx0XHQpO1xuXHRcdH0pLnJlY29tcHV0ZUluaXRpYWxseUFuZE9uQ2hhbmdlKHRoaXMuX3N0b3JlKTtcblxuXHRcdGxldCB2aWV3Wm9uZUlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbWluU2Nyb2xsSGVpZ2h0ID0gbWluRWRpdG9yU2Nyb2xsSGVpZ2h0LnJlYWQocmVhZGVyKTtcblx0XHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMuX2VkaXRvck9icy5tb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIXRleHRNb2RlbCkgeyByZXR1cm47IH1cblxuXHRcdFx0dGhpcy5fZWRpdG9yLmNoYW5nZVZpZXdab25lcyhhY2Nlc3NvciA9PiB7XG5cdFx0XHRcdGNvbnN0IHNjcm9sbEhlaWdodCA9IHRoaXMuX2VkaXRvci5nZXRTY3JvbGxIZWlnaHQoKTtcblx0XHRcdFx0Y29uc3Qgdmlld1pvbmVIZWlnaHQgPSBtaW5TY3JvbGxIZWlnaHQgLSBzY3JvbGxIZWlnaHQgKyAxIC8qIEFkZCAxcHggc28gdGhlcmUgaXMgYSBzbWFsbCBnYXAgKi87XG5cblx0XHRcdFx0aWYgKHZpZXdab25lSGVpZ2h0ICE9PSAwICYmIHZpZXdab25lSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGFjY2Vzc29yLnJlbW92ZVpvbmUodmlld1pvbmVJZCk7XG5cdFx0XHRcdFx0dmlld1pvbmVJZCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICh2aWV3Wm9uZUhlaWdodCA8PSAwKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0dmlld1pvbmVJZCA9IGFjY2Vzc29yLmFkZFpvbmUoe1xuXHRcdFx0XHRcdGFmdGVyTGluZU51bWJlcjogdGV4dE1vZGVsLmdldExpbmVDb3VudCgpLFxuXHRcdFx0XHRcdGhlaWdodEluUHg6IHZpZXdab25lSGVpZ2h0LFxuXHRcdFx0XHRcdGRvbU5vZGU6ICQoJ2Rpdi5taW5TY3JvbGxIZWlnaHRWaWV3Wm9uZScpLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX2NvbnN0cnVjdG9yRG9uZS5zZXQodHJ1ZSwgdW5kZWZpbmVkKTsgLy8gVE9ETzogcmVtb3ZlIGFuZCB1c2UgY29ycmVjdCBpbml0aWFsaXphdGlvbiBvcmRlclxuXHR9XG5cblx0cHVibGljIHJlYWRvbmx5IGRpc3BsYXlSYW5nZSA9IGRlcml2ZWQ8TGluZVJhbmdlIHwgdW5kZWZpbmVkPih0aGlzLCByZWFkZXIgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fdWlTdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0aWYgKCFzdGF0ZSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0aWYgKHN0YXRlLnRhcmdldC51cmkudG9TdHJpbmcoKSAhPT0gdGhpcy5fZWRpdG9yT2JzLm1vZGVsLnJlYWQocmVhZGVyKT8udXJpLnRvU3RyaW5nKCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKHN0YXRlLnN0YXRlPy5raW5kID09PSAnY3VzdG9tJykge1xuXHRcdFx0Y29uc3QgcmFuZ2UgPSBzdGF0ZS5zdGF0ZS5kaXNwbGF5TG9jYXRpb24/LnJhbmdlO1xuXHRcdFx0aWYgKCFyYW5nZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCdjdXN0b20gdmlldyBzaG91bGQgaGF2ZSBhIHJhbmdlJyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gbmV3IExpbmVSYW5nZShyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLmVuZExpbmVOdW1iZXIpO1xuXHRcdH1cblxuXHRcdGlmIChzdGF0ZS5zdGF0ZT8ua2luZCA9PT0gJ2luc2VydGlvbk11bHRpTGluZScpIHtcblx0XHRcdHJldHVybiB0aGlzLl9pbnNlcnRpb24ub3JpZ2luYWxMaW5lcy5yZWFkKHJlYWRlcik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN0YXRlLmVkaXQuZGlzcGxheVJhbmdlO1xuXHR9KTtcblxuXG5cdHByaXZhdGUgX2N1cnJlbnRJbmxpbmVFZGl0Q2FjaGU6IHtcblx0XHRpbmxpbmVTdWdnZXN0aW9uSWRlbnRpdHk6IElubGluZVN1Z2dlc3Rpb25JZGVudGl0eTtcblx0XHRmaXJzdEN1cnNvckxpbmVOdW1iZXI6IG51bWJlcjtcblx0fSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9nZXRMb25nRGlzdGFuY2VIaW50U3RhdGUobW9kZWw6IE1vZGVsUGVySW5saW5lRWRpdCwgcmVhZGVyOiBJUmVhZGVyKTogSUxvbmdEaXN0YW5jZUhpbnQgfCB1bmRlZmluZWQge1xuXHRcdGlmIChtb2RlbC5pbmxpbmVFZGl0LmlubGluZUNvbXBsZXRpb24uaWRlbnRpdHkuanVtcGVkVG8ucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAobW9kZWwuaW5saW5lRWRpdC5hY3Rpb24gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZWRpdG9yTW9kZWwgPSB0aGlzLl9lZGl0b3JPYnMubW9kZWwucmVhZChyZWFkZXIpO1xuXHRcdGlmICghZWRpdG9yTW9kZWwgfHwgIW1vZGVsLmlubGluZUVkaXQub3JpZ2luYWxUZXh0LnRhcmdldHMoZWRpdG9yTW9kZWwpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpc1Zpc2libGU6IHRydWUsXG5cdFx0XHRcdGxpbmVOdW1iZXI6IG1vZGVsLmlubGluZUVkaXQuY3Vyc29yUG9zaXRpb24ubGluZU51bWJlcixcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRJbmxpbmVFZGl0Q2FjaGU/LmlubGluZVN1Z2dlc3Rpb25JZGVudGl0eSAhPT0gbW9kZWwuaW5saW5lRWRpdC5pbmxpbmVDb21wbGV0aW9uLmlkZW50aXR5KSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50SW5saW5lRWRpdENhY2hlID0ge1xuXHRcdFx0XHRpbmxpbmVTdWdnZXN0aW9uSWRlbnRpdHk6IG1vZGVsLmlubGluZUVkaXQuaW5saW5lQ29tcGxldGlvbi5pZGVudGl0eSxcblx0XHRcdFx0Zmlyc3RDdXJzb3JMaW5lTnVtYmVyOiBtb2RlbC5pbmxpbmVFZGl0LmN1cnNvclBvc2l0aW9uLmxpbmVOdW1iZXIsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0bGluZU51bWJlcjogdGhpcy5fY3VycmVudElubGluZUVkaXRDYWNoZS5maXJzdEN1cnNvckxpbmVOdW1iZXIsXG5cdFx0XHRpc1Zpc2libGU6ICFtb2RlbC5pblZpZXdQb3J0LnJlYWQocmVhZGVyKSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29uc3RydWN0b3JEb25lO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3VpU3RhdGUgPSBkZXJpdmVkPHtcblx0XHRzdGF0ZTogUmV0dXJuVHlwZTx0eXBlb2YgSW5saW5lRWRpdHNWaWV3LnByb3RvdHlwZS5fZGV0ZXJtaW5lUmVuZGVyU3RhdGU+O1xuXHRcdGRpZmY6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdO1xuXHRcdGVkaXQ6IElubGluZUVkaXRXaXRoQ2hhbmdlcztcblx0XHRuZXdUZXh0OiBzdHJpbmc7XG5cdFx0bmV3VGV4dExpbmVDb3VudDogbnVtYmVyO1xuXHRcdGVkaXRvclR5cGU6IElubGluZUNvbXBsZXRpb25FZGl0b3JUeXBlO1xuXHRcdGxvbmdEaXN0YW5jZUhpbnQ6IElMb25nRGlzdGFuY2VIaW50IHwgdW5kZWZpbmVkO1xuXHRcdG5leHRDdXJzb3JQb3NpdGlvbjogUG9zaXRpb24gfCBudWxsO1xuXHRcdHRhcmdldDogVGV4dE1vZGVsVmFsdWVSZWZlcmVuY2U7XG5cdH0gfCB1bmRlZmluZWQ+KHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9tb2RlbC5yZWFkKHJlYWRlcik7XG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gdGhpcy5fZWRpdG9yT2JzLm1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRpZiAoIW1vZGVsIHx8ICF0ZXh0TW9kZWwgfHwgIXRoaXMuX2NvbnN0cnVjdG9yRG9uZS5yZWFkKHJlYWRlcikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5saW5lRWRpdCA9IG1vZGVsLmlubGluZUVkaXQ7XG5cdFx0bGV0IGRpZmY6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdO1xuXHRcdGxldCBtYXBwaW5nczogUmFuZ2VNYXBwaW5nW107XG5cblx0XHRsZXQgbmV3VGV4dDogQWJzdHJhY3RUZXh0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGlubGluZUVkaXQuZWRpdCkge1xuXHRcdFx0bWFwcGluZ3MgPSBSYW5nZU1hcHBpbmcuZnJvbUVkaXQoaW5saW5lRWRpdC5lZGl0KTtcblx0XHRcdG5ld1RleHQgPSBuZXcgU3RyaW5nVGV4dChpbmxpbmVFZGl0LmVkaXQuYXBwbHkoaW5saW5lRWRpdC5vcmlnaW5hbFRleHQpKTtcblx0XHRcdGRpZmYgPSBsaW5lUmFuZ2VNYXBwaW5nRnJvbVJhbmdlTWFwcGluZ3MobWFwcGluZ3MsIGlubGluZUVkaXQub3JpZ2luYWxUZXh0LCBuZXdUZXh0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bWFwcGluZ3MgPSBbXTtcblx0XHRcdGRpZmYgPSBbXTtcblx0XHRcdG5ld1RleHQgPSBpbmxpbmVFZGl0Lm9yaWdpbmFsVGV4dDtcblx0XHR9XG5cblxuXHRcdGxldCBzdGF0ZSA9IHRoaXMuX2RldGVybWluZVJlbmRlclN0YXRlKG1vZGVsLCByZWFkZXIsIGRpZmYsIG5ld1RleHQpO1xuXHRcdGlmICghc3RhdGUpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVycm9yKG5ldyBFcnJvcihgdW5hYmxlIHRvIGRldGVybWluZSB2aWV3OiB0cmllZCB0byByZW5kZXIgJHt0aGlzLl9wcmV2aW91c1ZpZXc/LnZpZXd9YCkpO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBsb25nRGlzdGFuY2VIaW50ID0gdGhpcy5fZ2V0TG9uZ0Rpc3RhbmNlSGludFN0YXRlKG1vZGVsLCByZWFkZXIpO1xuXG5cdFx0aWYgKGxvbmdEaXN0YW5jZUhpbnQgJiYgbG9uZ0Rpc3RhbmNlSGludC5pc1Zpc2libGUpIHtcblx0XHRcdHN0YXRlLnZpZXdEYXRhLnNldExvbmdEaXN0YW5jZVZpZXdEYXRhKGxvbmdEaXN0YW5jZUhpbnQubGluZU51bWJlciwgaW5saW5lRWRpdC5saW5lRWRpdC5saW5lUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHR9XG5cblx0XHRzdGF0ZS52aWV3RGF0YS5pc0ZvckFub3RoZXJEb2N1bWVudCA9ICFpbmxpbmVFZGl0Lm9yaWdpbmFsVGV4dC50YXJnZXRzKHRleHRNb2RlbCk7XG5cblx0XHRpZiAoc3RhdGUua2luZCA9PT0gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLlNpZGVCeVNpZGUpIHtcblx0XHRcdGNvbnN0IGluZGVudGF0aW9uQWRqdXN0bWVudEVkaXQgPSBjcmVhdGVSZWluZGVudEVkaXQobmV3VGV4dC5nZXRWYWx1ZSgpLCBpbmxpbmVFZGl0Lm1vZGlmaWVkTGluZVJhbmdlLCB0ZXh0TW9kZWwuZ2V0T3B0aW9ucygpLnRhYlNpemUpO1xuXHRcdFx0bmV3VGV4dCA9IG5ldyBTdHJpbmdUZXh0KGluZGVudGF0aW9uQWRqdXN0bWVudEVkaXQuYXBwbHlUb1N0cmluZyhuZXdUZXh0LmdldFZhbHVlKCkpKTtcblxuXHRcdFx0bWFwcGluZ3MgPSBhcHBseUVkaXRUb01vZGlmaWVkUmFuZ2VNYXBwaW5ncyhtYXBwaW5ncywgaW5kZW50YXRpb25BZGp1c3RtZW50RWRpdCk7XG5cdFx0XHRkaWZmID0gbGluZVJhbmdlTWFwcGluZ0Zyb21SYW5nZU1hcHBpbmdzKG1hcHBpbmdzLCBpbmxpbmVFZGl0Lm9yaWdpbmFsVGV4dCwgbmV3VGV4dCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcHJldmlld1RleHRNb2RlbC5zZXRMYW5ndWFnZSh0ZXh0TW9kZWwuZ2V0TGFuZ3VhZ2VJZCgpKTtcblxuXHRcdGNvbnN0IHByZXZpb3VzTmV3VGV4dCA9IHRoaXMuX3ByZXZpZXdUZXh0TW9kZWwuZ2V0VmFsdWUoKTtcblx0XHRpZiAocHJldmlvdXNOZXdUZXh0ICE9PSBuZXdUZXh0LmdldFZhbHVlKCkpIHtcblx0XHRcdHRoaXMuX3ByZXZpZXdUZXh0TW9kZWwuc2V0RU9MKHRleHRNb2RlbC5nZXRFbmRPZkxpbmVTZXF1ZW5jZSgpKTtcblx0XHRcdGNvbnN0IHVwZGF0ZU9sZFZhbHVlRWRpdCA9IFN0cmluZ0VkaXQucmVwbGFjZShuZXcgT2Zmc2V0UmFuZ2UoMCwgcHJldmlvdXNOZXdUZXh0Lmxlbmd0aCksIG5ld1RleHQuZ2V0VmFsdWUoKSk7XG5cdFx0XHRjb25zdCB1cGRhdGVPbGRWYWx1ZUVkaXRTbWFsbCA9IHVwZGF0ZU9sZFZhbHVlRWRpdC5yZW1vdmVDb21tb25TdWZmaXhQcmVmaXgocHJldmlvdXNOZXdUZXh0KTtcblxuXHRcdFx0Y29uc3QgdGV4dEVkaXQgPSBnZXRQb3NpdGlvbk9mZnNldFRyYW5zZm9ybWVyRnJvbVRleHRNb2RlbCh0aGlzLl9wcmV2aWV3VGV4dE1vZGVsKS5nZXRUZXh0RWRpdCh1cGRhdGVPbGRWYWx1ZUVkaXRTbWFsbCk7XG5cdFx0XHR0aGlzLl9wcmV2aWV3VGV4dE1vZGVsLmVkaXQodGV4dEVkaXQpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9zaG93Q29sbGFwc2VkLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0c3RhdGUgPSB7IGtpbmQ6IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5Db2xsYXBzZWQgYXMgY29uc3QsIHZpZXdEYXRhOiBzdGF0ZS52aWV3RGF0YSB9O1xuXHRcdH1cblxuXHRcdG1vZGVsLmhhbmRsZUlubGluZUVkaXRTaG93bk5leHRGcmFtZShzdGF0ZS5raW5kLCBzdGF0ZS52aWV3RGF0YSk7XG5cblx0XHRjb25zdCBuZXh0Q3Vyc29yUG9zaXRpb24gPSBpbmxpbmVFZGl0LmFjdGlvbj8ua2luZCA9PT0gJ2p1bXBUbycgPyBpbmxpbmVFZGl0LmFjdGlvbi5wb3NpdGlvbiA6IG51bGw7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0c3RhdGUsXG5cdFx0XHRkaWZmLFxuXHRcdFx0ZWRpdDogaW5saW5lRWRpdCxcblx0XHRcdG5ld1RleHQ6IG5ld1RleHQuZ2V0VmFsdWUoKSxcblx0XHRcdG5ld1RleHRMaW5lQ291bnQ6IGlubGluZUVkaXQubW9kaWZpZWRMaW5lUmFuZ2UubGVuZ3RoLFxuXHRcdFx0ZWRpdG9yVHlwZTogbW9kZWwuZWRpdG9yVHlwZSxcblx0XHRcdGxvbmdEaXN0YW5jZUhpbnQsXG5cdFx0XHRuZXh0Q3Vyc29yUG9zaXRpb246IG5leHRDdXJzb3JQb3NpdGlvbixcblx0XHRcdHRhcmdldDogaW5saW5lRWRpdC5pbmxpbmVDb21wbGV0aW9uLm9yaWdpbmFsVGV4dFJlZixcblx0XHR9O1xuXHR9KTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmV2aWV3VGV4dE1vZGVsO1xuXG5cblx0cHVibGljIHJlYWRvbmx5IGlubGluZUVkaXRzSXNIb3ZlcmVkID0gZGVyaXZlZCh0aGlzLCByZWFkZXIgPT4ge1xuXHRcdHJldHVybiB0aGlzLl9zaWRlQnlTaWRlLmlzSG92ZXJlZC5yZWFkKHJlYWRlcilcblx0XHRcdHx8IHRoaXMuX3dvcmRSZXBsYWNlbWVudFZpZXdzLnJlYWQocmVhZGVyKS5zb21lKHYgPT4gdi5pc0hvdmVyZWQucmVhZChyZWFkZXIpKVxuXHRcdFx0fHwgdGhpcy5fZGVsZXRpb24uaXNIb3ZlcmVkLnJlYWQocmVhZGVyKVxuXHRcdFx0fHwgdGhpcy5faW5saW5lRGlmZlZpZXcuaXNIb3ZlcmVkLnJlYWQocmVhZGVyKVxuXHRcdFx0fHwgdGhpcy5fbGluZVJlcGxhY2VtZW50Vmlldy5pc0hvdmVyZWQucmVhZChyZWFkZXIpXG5cdFx0XHR8fCB0aGlzLl9pbnNlcnRpb24uaXNIb3ZlcmVkLnJlYWQocmVhZGVyKVxuXHRcdFx0fHwgdGhpcy5fY3VzdG9tVmlldy5pc0hvdmVyZWQucmVhZChyZWFkZXIpXG5cdFx0XHR8fCB0aGlzLl9sb25nRGlzdGFuY2VIaW50Lm1hcCgodiwgcikgPT4gdj8uaXNIb3ZlcmVkLnJlYWQocikgPz8gZmFsc2UpLnJlYWQocmVhZGVyKTtcblx0fSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc2lkZUJ5U2lkZTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2RlbGV0aW9uO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfaW5zZXJ0aW9uO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lubGluZURpZmZWaWV3U3RhdGU7XG5cblx0cHVibGljIHJlYWRvbmx5IF9pbmxpbmVDb2xsYXBzZWRWaWV3O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2N1c3RvbVZpZXc7XG5cdHByb3RlY3RlZCByZWFkb25seSBfbG9uZ0Rpc3RhbmNlSGludDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2lubGluZURpZmZWaWV3O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfd29yZFJlcGxhY2VtZW50Vmlld3M7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9saW5lUmVwbGFjZW1lbnRWaWV3O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfanVtcFRvVmlldztcblxuXHRwdWJsaWMgcmVhZG9ubHkgZ3V0dGVySW5kaWNhdG9yT2Zmc2V0ID0gZGVyaXZlZDxudW1iZXI+KHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0Ly8gVE9ETzogaGF2ZSBhIGJldHRlciB3YXkgdG8gdGVsbCB0aGUgZ3V0dGVyIGluZGljYXRvciB2aWV3IHdoZXJlIHRoZSBlZGl0IGlzIGluc2lkZSBhIHZpZXd6b25lXG5cdFx0aWYgKHRoaXMuX3VpU3RhdGUucmVhZChyZWFkZXIpPy5zdGF0ZT8ua2luZCA9PT0gJ2luc2VydGlvbk11bHRpTGluZScpIHtcblx0XHRcdHJldHVybiB0aGlzLl9pbnNlcnRpb24uc3RhcnRMaW5lT2Zmc2V0LnJlYWQocmVhZGVyKTtcblx0XHR9XG5cdFx0cmV0dXJuIDA7XG5cdH0pO1xuXG5cdHByaXZhdGUgX2dldENhY2hlSWQobW9kZWw6IE1vZGVsUGVySW5saW5lRWRpdCkge1xuXHRcdHJldHVybiBtb2RlbC5pbmxpbmVFZGl0LmlubGluZUNvbXBsZXRpb24uaWRlbnRpdHkuaWQ7XG5cdH1cblxuXHRwcml2YXRlIF9kZXRlcm1pbmVWaWV3KG1vZGVsOiBNb2RlbFBlcklubGluZUVkaXQsIHJlYWRlcjogSVJlYWRlciwgZGlmZjogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW10sIG5ld1RleHQ6IEFic3RyYWN0VGV4dCk6IElubGluZUNvbXBsZXRpb25WaWV3S2luZCB7XG5cdFx0Ly8gQ2hlY2sgaWYgd2UgY2FuIHVzZSB0aGUgcHJldmlvdXMgdmlldyBpZiBpdCBpcyB0aGUgc2FtZSBJbmxpbmVDb21wbGV0aW9uIGFzIHByZXZpb3VzbHkgc2hvd25cblx0XHRjb25zdCBpbmxpbmVFZGl0ID0gbW9kZWwuaW5saW5lRWRpdDtcblx0XHRjb25zdCBjYW5Vc2VDYWNoZSA9IHRoaXMuX3ByZXZpb3VzVmlldz8uaWQgPT09IHRoaXMuX2dldENhY2hlSWQobW9kZWwpICYmIHRoaXMuX3ByZXZpb3VzVmlldz8udXJpLnRvU3RyaW5nKCkgPT09IHRoaXMuX2VkaXRvck9icy5tb2RlbC5nZXQoKSEudXJpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgcmVjb25zaWRlclZpZXdFZGl0b3JXaWR0aENoYW5nZSA9IHRoaXMuX3ByZXZpb3VzVmlldz8uZWRpdG9yV2lkdGggIT09IHRoaXMuX2VkaXRvck9icy5sYXlvdXRJbmZvV2lkdGgucmVhZChyZWFkZXIpICYmXG5cdFx0XHQoXG5cdFx0XHRcdHRoaXMuX3ByZXZpb3VzVmlldz8udmlldyA9PT0gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLlNpZGVCeVNpZGUgfHxcblx0XHRcdFx0dGhpcy5fcHJldmlvdXNWaWV3Py52aWV3ID09PSBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuTGluZVJlcGxhY2VtZW50XG5cdFx0XHQpO1xuXG5cdFx0aWYgKGNhblVzZUNhY2hlICYmICFyZWNvbnNpZGVyVmlld0VkaXRvcldpZHRoQ2hhbmdlKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcHJldmlvdXNWaWV3IS52aWV3O1xuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGlvbiA9IG1vZGVsLmlubGluZUVkaXQuaW5saW5lQ29tcGxldGlvbi5hY3Rpb247XG5cdFx0aWYgKGFjdGlvbj8ua2luZCA9PT0gJ2VkaXQnICYmIGFjdGlvbi5hbHRlcm5hdGl2ZUFjdGlvbikge1xuXHRcdFx0cmV0dXJuIElubGluZUNvbXBsZXRpb25WaWV3S2luZC5Xb3JkUmVwbGFjZW1lbnRzO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldFVyaSA9IG1vZGVsLmlubGluZUVkaXQuaW5saW5lQ29tcGxldGlvbi5vcmlnaW5hbFRleHRSZWYudXJpO1xuXHRcdGNvbnN0IGN1cnJlbnRVcmkgPSB0aGlzLl9lZGl0b3JPYnMubW9kZWwucmVhZChyZWFkZXIpPy51cmk7XG5cdFx0aWYgKGN1cnJlbnRVcmkgJiYgdGFyZ2V0VXJpLnRvU3RyaW5nKCkgIT09IGN1cnJlbnRVcmkudG9TdHJpbmcoKSkge1xuXHRcdFx0cmV0dXJuIElubGluZUNvbXBsZXRpb25WaWV3S2luZC5DdXN0b207XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGVsLmRpc3BsYXlMb2NhdGlvbiAmJiAhbW9kZWwuaW5saW5lRWRpdC5pbmxpbmVDb21wbGV0aW9uLmlkZW50aXR5Lmp1bXBlZFRvLnJlYWQocmVhZGVyKSkge1xuXHRcdFx0cmV0dXJuIElubGluZUNvbXBsZXRpb25WaWV3S2luZC5DdXN0b207XG5cdFx0fVxuXG5cdFx0Ly8gRGV0ZXJtaW5lIHRoZSB2aWV3IGJhc2VkIG9uIHRoZSBlZGl0IC8gZGlmZlxuXG5cdFx0Y29uc3QgbnVtT3JpZ2luYWxMaW5lcyA9IGlubGluZUVkaXQub3JpZ2luYWxMaW5lUmFuZ2UubGVuZ3RoO1xuXHRcdGNvbnN0IG51bU1vZGlmaWVkTGluZXMgPSBpbmxpbmVFZGl0Lm1vZGlmaWVkTGluZVJhbmdlLmxlbmd0aDtcblx0XHRjb25zdCBpbm5lciA9IGRpZmYuZmxhdE1hcChkID0+IGQuaW5uZXJDaGFuZ2VzID8/IFtdKTtcblx0XHRjb25zdCBpc1NpbmdsZUlubmVyRWRpdCA9IGlubmVyLmxlbmd0aCA9PT0gMTtcblxuXHRcdGlmIChtb2RlbC5lZGl0b3JUeXBlICE9PSBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZS5EaWZmRWRpdG9yKSB7XG5cdFx0XHRpZiAoXG5cdFx0XHRcdGlzU2luZ2xlSW5uZXJFZGl0XG5cdFx0XHRcdCYmIHRoaXMuX3VzZUNvZGVTaGlmdGluZy5yZWFkKHJlYWRlcikgIT09ICduZXZlcidcblx0XHRcdFx0JiYgaXNTaW5nbGVMaW5lSW5zZXJ0aW9uKGRpZmYpXG5cdFx0XHQpIHtcblx0XHRcdFx0aWYgKGlzU2luZ2xlTGluZUluc2VydGlvbkFmdGVyUG9zaXRpb24oZGlmZiwgaW5saW5lRWRpdC5jdXJzb3JQb3NpdGlvbikpIHtcblx0XHRcdFx0XHRyZXR1cm4gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkluc2VydGlvbklubGluZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIElmIHdlIGhhdmUgYSBzaW5nbGUgbGluZSBpbnNlcnRpb24gYmVmb3JlIHRoZSBjdXJzb3IgcG9zaXRpb24sIHdlIGRvIG5vdCB3YW50IHRvIG1vdmUgdGhlIGN1cnNvciBieSBpbnNlcnRpbmdcblx0XHRcdFx0Ly8gdGhlIHN1Z2dlc3Rpb24gaW5saW5lLiBVc2UgYSBsaW5lIHJlcGxhY2VtZW50IHZpZXcgaW5zdGVhZC4gRG8gbm90IHVzZSB3b3JkIHJlcGxhY2VtZW50IHZpZXcuXG5cdFx0XHRcdHJldHVybiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuTGluZVJlcGxhY2VtZW50O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoaXNEZWxldGlvbihpbm5lciwgaW5saW5lRWRpdCwgbmV3VGV4dCkpIHtcblx0XHRcdFx0cmV0dXJuIElubGluZUNvbXBsZXRpb25WaWV3S2luZC5EZWxldGlvbjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzU2luZ2xlTXVsdGlMaW5lSW5zZXJ0aW9uKGRpZmYpICYmIHRoaXMuX3VzZUNvZGVTaGlmdGluZy5yZWFkKHJlYWRlcikgPT09ICdhbHdheXMnKSB7XG5cdFx0XHRcdHJldHVybiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuSW5zZXJ0aW9uTXVsdGlMaW5lO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhbGxJbm5lckNoYW5nZXNOb3RUb29Mb25nID0gaW5uZXIuZXZlcnkobSA9PiBUZXh0TGVuZ3RoLm9mUmFuZ2UobS5vcmlnaW5hbFJhbmdlKS5jb2x1bW5Db3VudCA8IElubGluZUVkaXRzV29yZFJlcGxhY2VtZW50Vmlldy5NQVhfTEVOR1RIICYmIFRleHRMZW5ndGgub2ZSYW5nZShtLm1vZGlmaWVkUmFuZ2UpLmNvbHVtbkNvdW50IDwgSW5saW5lRWRpdHNXb3JkUmVwbGFjZW1lbnRWaWV3Lk1BWF9MRU5HVEgpO1xuXHRcdFx0aWYgKGFsbElubmVyQ2hhbmdlc05vdFRvb0xvbmcgJiYgaXNTaW5nbGVJbm5lckVkaXQgJiYgbnVtT3JpZ2luYWxMaW5lcyA9PT0gMSAmJiBudW1Nb2RpZmllZExpbmVzID09PSAxKSB7XG5cdFx0XHRcdC8vIERvIG5vdCBzaG93IGluZGVudGF0aW9uIGNoYW5nZXMgd2l0aCB3b3JkIHJlcGxhY2VtZW50IHZpZXdcblx0XHRcdFx0Y29uc3QgbW9kaWZpZWRUZXh0ID0gaW5uZXIubWFwKG0gPT4gbmV3VGV4dC5nZXRWYWx1ZU9mUmFuZ2UobS5tb2RpZmllZFJhbmdlKSk7XG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsVGV4dCA9IGlubmVyLm1hcChtID0+IG1vZGVsLmlubGluZUVkaXQub3JpZ2luYWxUZXh0LmdldFZhbHVlT2ZSYW5nZShtLm9yaWdpbmFsUmFuZ2UpKTtcblx0XHRcdFx0aWYgKCFtb2RpZmllZFRleHQuc29tZSh2ID0+IHYuaW5jbHVkZXMoJ1xcdCcpKSAmJiAhb3JpZ2luYWxUZXh0LnNvbWUodiA9PiB2LmluY2x1ZGVzKCdcXHQnKSkpIHtcblx0XHRcdFx0XHQvLyBNYWtlIHN1cmUgdGhlcmUgaXMgbm8gaW5zZXJ0aW9uLCBldmVuIGlmIHdlIGdyb3cgdGhlbVxuXHRcdFx0XHRcdGlmIChcblx0XHRcdFx0XHRcdCFpbm5lci5zb21lKG0gPT4gbS5vcmlnaW5hbFJhbmdlLmlzRW1wdHkoKSkgfHxcblx0XHRcdFx0XHRcdCFncm93RWRpdHNVbnRpbFdoaXRlc3BhY2UoaW5uZXIubWFwKG0gPT4gbmV3IFRleHRSZXBsYWNlbWVudChtLm9yaWdpbmFsUmFuZ2UsICcnKSksIGlubGluZUVkaXQub3JpZ2luYWxUZXh0KS5zb21lKGUgPT4gZS5yYW5nZS5pc0VtcHR5KCkgJiYgVGV4dExlbmd0aC5vZlJhbmdlKGUucmFuZ2UpLmNvbHVtbkNvdW50IDwgSW5saW5lRWRpdHNXb3JkUmVwbGFjZW1lbnRWaWV3Lk1BWF9MRU5HVEgpXG5cdFx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLldvcmRSZXBsYWNlbWVudHM7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG51bU9yaWdpbmFsTGluZXMgPiAwICYmIG51bU1vZGlmaWVkTGluZXMgPiAwKSB7XG5cdFx0XHRpZiAobnVtT3JpZ2luYWxMaW5lcyA9PT0gMSAmJiBudW1Nb2RpZmllZExpbmVzID09PSAxICYmIG1vZGVsLmVkaXRvclR5cGUgIT09IElubGluZUNvbXBsZXRpb25FZGl0b3JUeXBlLkRpZmZFZGl0b3IgLyogcHJlZmVyIHNpZGUgYnkgc2lkZSBpbiBkaWZmIGVkaXRvciAqLykge1xuXHRcdFx0XHRyZXR1cm4gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkxpbmVSZXBsYWNlbWVudDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX3JlbmRlclNpZGVCeVNpZGUucmVhZChyZWFkZXIpICE9PSAnbmV2ZXInICYmIElubGluZUVkaXRzU2lkZUJ5U2lkZVZpZXcuZml0c0luc2lkZVZpZXdwb3J0KHRoaXMuX2VkaXRvciwgdGhpcy5fcHJldmlld1RleHRNb2RlbCwgaW5saW5lRWRpdCwgcmVhZGVyKSkge1xuXHRcdFx0XHRyZXR1cm4gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLlNpZGVCeVNpZGU7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuTGluZVJlcGxhY2VtZW50O1xuXHRcdH1cblxuXHRcdGlmIChtb2RlbC5lZGl0b3JUeXBlID09PSBJbmxpbmVDb21wbGV0aW9uRWRpdG9yVHlwZS5EaWZmRWRpdG9yKSB7XG5cdFx0XHRpZiAoaXNEZWxldGlvbihpbm5lciwgaW5saW5lRWRpdCwgbmV3VGV4dCkpIHtcblx0XHRcdFx0cmV0dXJuIElubGluZUNvbXBsZXRpb25WaWV3S2luZC5EZWxldGlvbjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzU2luZ2xlTXVsdGlMaW5lSW5zZXJ0aW9uKGRpZmYpICYmIHRoaXMuX3VzZUNvZGVTaGlmdGluZy5yZWFkKHJlYWRlcikgPT09ICdhbHdheXMnKSB7XG5cdFx0XHRcdHJldHVybiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuSW5zZXJ0aW9uTXVsdGlMaW5lO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuU2lkZUJ5U2lkZTtcblx0fVxuXG5cdHByaXZhdGUgX2RldGVybWluZVJlbmRlclN0YXRlKG1vZGVsOiBNb2RlbFBlcklubGluZUVkaXQsIHJlYWRlcjogSVJlYWRlciwgZGlmZjogRGV0YWlsZWRMaW5lUmFuZ2VNYXBwaW5nW10sIG5ld1RleHQ6IEFic3RyYWN0VGV4dCkge1xuXHRcdGlmIChtb2RlbC5pbmxpbmVFZGl0LmFjdGlvbj8ua2luZCA9PT0gJ2p1bXBUbycpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5KdW1wVG8gYXMgY29uc3QsXG5cdFx0XHRcdHBvc2l0aW9uOiBtb2RlbC5pbmxpbmVFZGl0LmFjdGlvbi5wb3NpdGlvbixcblx0XHRcdFx0dmlld0RhdGE6IGNyZWF0ZUVtcHR5Vmlld0RhdGEoKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5saW5lRWRpdCA9IG1vZGVsLmlubGluZUVkaXQ7XG5cblx0XHRsZXQgdmlldyA9IHRoaXMuX2RldGVybWluZVZpZXcobW9kZWwsIHJlYWRlciwgZGlmZiwgbmV3VGV4dCk7XG5cdFx0aWYgKHRoaXMuX3dpbGxSZW5kZXJBYm92ZUN1cnNvcihyZWFkZXIsIGlubGluZUVkaXQsIHZpZXcpKSB7XG5cdFx0XHRzd2l0Y2ggKHZpZXcpIHtcblx0XHRcdFx0Y2FzZSBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuTGluZVJlcGxhY2VtZW50OlxuXHRcdFx0XHRjYXNlIElubGluZUNvbXBsZXRpb25WaWV3S2luZC5Xb3JkUmVwbGFjZW1lbnRzOlxuXHRcdFx0XHRcdHZpZXcgPSBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuU2lkZUJ5U2lkZTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fcHJldmlvdXNWaWV3ID0geyBpZDogdGhpcy5fZ2V0Q2FjaGVJZChtb2RlbCksIHZpZXcsIGVkaXRvcldpZHRoOiB0aGlzLl9lZGl0b3IuZ2V0TGF5b3V0SW5mbygpLndpZHRoLCB0aW1lc3RhbXA6IERhdGUubm93KCksIHVyaTogdGhpcy5fZWRpdG9yT2JzLm1vZGVsLmdldCgpIS51cmkgfTtcblxuXHRcdGNvbnN0IGlubmVyID0gZGlmZi5mbGF0TWFwKGQgPT4gZC5pbm5lckNoYW5nZXMgPz8gW10pO1xuXHRcdGNvbnN0IHRleHRNb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpITtcblx0XHRjb25zdCBzdHJpbmdDaGFuZ2VzID0gaW5uZXIubWFwKG0gPT4gKHtcblx0XHRcdG9yaWdpbmFsUmFuZ2U6IG0ub3JpZ2luYWxSYW5nZSxcblx0XHRcdG1vZGlmaWVkUmFuZ2U6IG0ubW9kaWZpZWRSYW5nZSxcblx0XHRcdG9yaWdpbmFsOiBpbmxpbmVFZGl0Lm9yaWdpbmFsVGV4dC5nZXRWYWx1ZU9mUmFuZ2UobS5vcmlnaW5hbFJhbmdlKSxcblx0XHRcdG1vZGlmaWVkOiBuZXdUZXh0LmdldFZhbHVlT2ZSYW5nZShtLm1vZGlmaWVkUmFuZ2UpXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgdmlld0RhdGEgPSBnZXRWaWV3RGF0YShpbmxpbmVFZGl0LCBzdHJpbmdDaGFuZ2VzLCB0ZXh0TW9kZWwpO1xuXG5cdFx0c3dpdGNoICh2aWV3KSB7XG5cdFx0XHRjYXNlIElubGluZUNvbXBsZXRpb25WaWV3S2luZC5JbnNlcnRpb25JbmxpbmU6IHJldHVybiB7IGtpbmQ6IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5JbnNlcnRpb25JbmxpbmUgYXMgY29uc3QsIHZpZXdEYXRhIH07XG5cdFx0XHRjYXNlIElubGluZUNvbXBsZXRpb25WaWV3S2luZC5TaWRlQnlTaWRlOiByZXR1cm4geyBraW5kOiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuU2lkZUJ5U2lkZSBhcyBjb25zdCwgdmlld0RhdGEgfTtcblx0XHRcdGNhc2UgSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkNvbGxhcHNlZDogcmV0dXJuIHsga2luZDogSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkNvbGxhcHNlZCBhcyBjb25zdCwgdmlld0RhdGEgfTtcblx0XHRcdGNhc2UgSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkN1c3RvbTogcmV0dXJuIHsga2luZDogSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkN1c3RvbSBhcyBjb25zdCwgZGlzcGxheUxvY2F0aW9uOiBtb2RlbC5kaXNwbGF5TG9jYXRpb24sIHZpZXdEYXRhIH07XG5cdFx0fVxuXG5cdFx0aWYgKHZpZXcgPT09IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5EZWxldGlvbikge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkRlbGV0aW9uIGFzIGNvbnN0LFxuXHRcdFx0XHRvcmlnaW5hbFJhbmdlOiBpbmxpbmVFZGl0Lm9yaWdpbmFsTGluZVJhbmdlLFxuXHRcdFx0XHRkZWxldGlvbnM6IGlubmVyLm1hcChtID0+IG0ub3JpZ2luYWxSYW5nZSksXG5cdFx0XHRcdHZpZXdEYXRhLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAodmlldyA9PT0gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkluc2VydGlvbk11bHRpTGluZSkge1xuXHRcdFx0Y29uc3QgY2hhbmdlID0gaW5uZXJbMF07XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuSW5zZXJ0aW9uTXVsdGlMaW5lIGFzIGNvbnN0LFxuXHRcdFx0XHRsaW5lTnVtYmVyOiBjaGFuZ2Uub3JpZ2luYWxSYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdGNvbHVtbjogY2hhbmdlLm9yaWdpbmFsUmFuZ2Uuc3RhcnRDb2x1bW4sXG5cdFx0XHRcdHRleHQ6IG5ld1RleHQuZ2V0VmFsdWVPZlJhbmdlKGNoYW5nZS5tb2RpZmllZFJhbmdlKSxcblx0XHRcdFx0dmlld0RhdGEsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcGxhY2VtZW50cyA9IHN0cmluZ0NoYW5nZXMubWFwKG0gPT4gbmV3IFRleHRSZXBsYWNlbWVudChtLm9yaWdpbmFsUmFuZ2UsIG0ubW9kaWZpZWQpKTtcblx0XHRpZiAocmVwbGFjZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAodmlldyA9PT0gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLldvcmRSZXBsYWNlbWVudHMpIHtcblx0XHRcdGxldCBncm93bkVkaXRzID0gZ3Jvd0VkaXRzVG9FbnRpcmVXb3JkKHJlcGxhY2VtZW50cywgaW5saW5lRWRpdC5vcmlnaW5hbFRleHQpO1xuXHRcdFx0aWYgKGdyb3duRWRpdHMuc29tZShlID0+IGUucmFuZ2UuaXNFbXB0eSgpKSkge1xuXHRcdFx0XHRncm93bkVkaXRzID0gZ3Jvd0VkaXRzVW50aWxXaGl0ZXNwYWNlKHJlcGxhY2VtZW50cywgaW5saW5lRWRpdC5vcmlnaW5hbFRleHQpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiBJbmxpbmVDb21wbGV0aW9uVmlld0tpbmQuV29yZFJlcGxhY2VtZW50cyBhcyBjb25zdCxcblx0XHRcdFx0cmVwbGFjZW1lbnRzOiBncm93bkVkaXRzLFxuXHRcdFx0XHRhbHRlcm5hdGl2ZUFjdGlvbjogbW9kZWwuaW5saW5lRWRpdC5hY3Rpb24/LmFsdGVybmF0aXZlQWN0aW9uLFxuXHRcdFx0XHR2aWV3RGF0YSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0aWYgKHZpZXcgPT09IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5MaW5lUmVwbGFjZW1lbnQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5MaW5lUmVwbGFjZW1lbnQgYXMgY29uc3QsXG5cdFx0XHRcdG9yaWdpbmFsUmFuZ2U6IGlubGluZUVkaXQub3JpZ2luYWxMaW5lUmFuZ2UsXG5cdFx0XHRcdG1vZGlmaWVkUmFuZ2U6IGlubGluZUVkaXQubW9kaWZpZWRMaW5lUmFuZ2UsXG5cdFx0XHRcdG1vZGlmaWVkTGluZXM6IGlubGluZUVkaXQubW9kaWZpZWRMaW5lUmFuZ2UubWFwVG9MaW5lQXJyYXkobGluZSA9PiBuZXdUZXh0LmdldExpbmVBdChsaW5lKSksXG5cdFx0XHRcdHJlcGxhY2VtZW50czogaW5uZXIubWFwKG0gPT4gKHsgb3JpZ2luYWxSYW5nZTogbS5vcmlnaW5hbFJhbmdlLCBtb2RpZmllZFJhbmdlOiBtLm1vZGlmaWVkUmFuZ2UgfSkpLFxuXHRcdFx0XHR2aWV3RGF0YSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3dpbGxSZW5kZXJBYm92ZUN1cnNvcihyZWFkZXI6IElSZWFkZXIsIGlubGluZUVkaXQ6IElubGluZUVkaXRXaXRoQ2hhbmdlcywgdmlldzogSW5saW5lQ29tcGxldGlvblZpZXdLaW5kKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgdXNlQ29kZVNoaWZ0aW5nID0gdGhpcy5fdXNlQ29kZVNoaWZ0aW5nLnJlYWQocmVhZGVyKTtcblx0XHRpZiAodXNlQ29kZVNoaWZ0aW5nID09PSAnYWx3YXlzJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgY3Vyc29yUG9zaXRpb24gb2YgaW5saW5lRWRpdC5tdWx0aUN1cnNvclBvc2l0aW9ucykge1xuXHRcdFx0aWYgKHZpZXcgPT09IElubGluZUNvbXBsZXRpb25WaWV3S2luZC5Xb3JkUmVwbGFjZW1lbnRzICYmXG5cdFx0XHRcdGN1cnNvclBvc2l0aW9uLmxpbmVOdW1iZXIgPT09IGlubGluZUVkaXQub3JpZ2luYWxMaW5lUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyICsgMVxuXHRcdFx0KSB7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodmlldyA9PT0gSW5saW5lQ29tcGxldGlvblZpZXdLaW5kLkxpbmVSZXBsYWNlbWVudCAmJlxuXHRcdFx0XHRjdXJzb3JQb3NpdGlvbi5saW5lTnVtYmVyID49IGlubGluZUVkaXQub3JpZ2luYWxMaW5lUmFuZ2UuZW5kTGluZU51bWJlckV4Y2x1c2l2ZSAmJlxuXHRcdFx0XHRjdXJzb3JQb3NpdGlvbi5saW5lTnVtYmVyIDwgaW5saW5lRWRpdC5tb2RpZmllZExpbmVSYW5nZS5lbmRMaW5lTnVtYmVyRXhjbHVzaXZlICsgaW5saW5lRWRpdC5tb2RpZmllZExpbmVSYW5nZS5sZW5ndGhcblx0XHRcdCkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF92aWV3SGFzQmVlblNob3duTG9uZ2VyVGhhbihkdXJhdGlvbk1zOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCB2aWV3Q3JlYXRpb25UaW1lID0gdGhpcy5fcHJldmlvdXNWaWV3Py50aW1lc3RhbXA7XG5cdFx0aWYgKCF2aWV3Q3JlYXRpb25UaW1lKSB7XG5cdFx0XHR0aHJvdyBuZXcgQnVnSW5kaWNhdGluZ0Vycm9yKCd2aWV3SGFzQmVlblNob3duTG9uZ1RoYW4gY2FsbGVkIGJlZm9yZSBhIHZpZXcgaGFzIGJlZW4gc2hvd24nKTtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50VGltZSA9IERhdGUubm93KCk7XG5cdFx0cmV0dXJuIChjdXJyZW50VGltZSAtIHZpZXdDcmVhdGlvblRpbWUpID49IGR1cmF0aW9uTXM7XG5cdH1cbn1cblxuY29uc3QgY3JlYXRlRW1wdHlWaWV3RGF0YSA9ICgpID0+IG5ldyBJbmxpbmVDb21wbGV0aW9uVmlld0RhdGEoLTEsIC0xLCAtMSwgLTEsIC0xLCAtMSwgLTEsIHRydWUpO1xuZnVuY3Rpb24gZ2V0Vmlld0RhdGEoaW5saW5lRWRpdDogSW5saW5lRWRpdFdpdGhDaGFuZ2VzLCBzdHJpbmdDaGFuZ2VzOiB7IG9yaWdpbmFsUmFuZ2U6IFJhbmdlOyBtb2RpZmllZFJhbmdlOiBSYW5nZTsgb3JpZ2luYWw6IHN0cmluZzsgbW9kaWZpZWQ6IHN0cmluZyB9W10sIHRleHRNb2RlbDogSVRleHRNb2RlbCkge1xuXHRpZiAoIWlubGluZUVkaXQuZWRpdCkge1xuXHRcdHJldHVybiBjcmVhdGVFbXB0eVZpZXdEYXRhKCk7XG5cdH1cblxuXHRjb25zdCBjdXJzb3JQb3NpdGlvbiA9IGlubGluZUVkaXQuY3Vyc29yUG9zaXRpb247XG5cdGNvbnN0IHN0YXJ0c1dpdGhFT0wgPSBzdHJpbmdDaGFuZ2VzLmxlbmd0aCA9PT0gMCA/IGZhbHNlIDogc3RyaW5nQ2hhbmdlc1swXS5tb2RpZmllZC5zdGFydHNXaXRoKHRleHRNb2RlbC5nZXRFT0woKSk7XG5cdGNvbnN0IHZpZXdEYXRhID0gbmV3IElubGluZUNvbXBsZXRpb25WaWV3RGF0YShcblx0XHRpbmxpbmVFZGl0LmVkaXQucmVwbGFjZW1lbnRzLmxlbmd0aCA9PT0gMCA/IDAgOiBpbmxpbmVFZGl0LmVkaXQucmVwbGFjZW1lbnRzWzBdLnJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKS5jb2x1bW4gLSBjdXJzb3JQb3NpdGlvbi5jb2x1bW4sXG5cdFx0aW5saW5lRWRpdC5saW5lRWRpdC5saW5lUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyIC0gY3Vyc29yUG9zaXRpb24ubGluZU51bWJlciArIChzdGFydHNXaXRoRU9MICYmIGlubGluZUVkaXQubGluZUVkaXQubGluZVJhbmdlLnN0YXJ0TGluZU51bWJlciA+PSBjdXJzb3JQb3NpdGlvbi5saW5lTnVtYmVyID8gMSA6IDApLFxuXHRcdGlubGluZUVkaXQubGluZUVkaXQubGluZVJhbmdlLmxlbmd0aCxcblx0XHRpbmxpbmVFZGl0LmxpbmVFZGl0Lm5ld0xpbmVzLmxlbmd0aCxcblx0XHRzdHJpbmdDaGFuZ2VzLnJlZHVjZSgoYWNjLCByKSA9PiBhY2MgKyByLm9yaWdpbmFsLmxlbmd0aCwgMCksXG5cdFx0c3RyaW5nQ2hhbmdlcy5yZWR1Y2UoKGFjYywgcikgPT4gYWNjICsgci5tb2RpZmllZC5sZW5ndGgsIDApLFxuXHRcdHN0cmluZ0NoYW5nZXMubGVuZ3RoLFxuXHRcdHN0cmluZ0NoYW5nZXMuZXZlcnkociA9PiByLm9yaWdpbmFsID09PSBzdHJpbmdDaGFuZ2VzWzBdLm9yaWdpbmFsICYmIHIubW9kaWZpZWQgPT09IHN0cmluZ0NoYW5nZXNbMF0ubW9kaWZpZWQpXG5cdCk7XG5cdHJldHVybiB2aWV3RGF0YTtcbn1cblxuZnVuY3Rpb24gaXNTaW5nbGVMaW5lSW5zZXJ0aW9uKGRpZmY6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdKSB7XG5cdHJldHVybiBkaWZmLmV2ZXJ5KG0gPT4gbS5pbm5lckNoYW5nZXMhLmV2ZXJ5KHIgPT4gaXNXb3JkSW5zZXJ0aW9uKHIpKSk7XG5cblx0ZnVuY3Rpb24gaXNXb3JkSW5zZXJ0aW9uKHI6IFJhbmdlTWFwcGluZykge1xuXHRcdGlmICghci5vcmlnaW5hbFJhbmdlLmlzRW1wdHkoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBpc0luc2VydGlvbldpdGhpbkxpbmUgPSByLm1vZGlmaWVkUmFuZ2Uuc3RhcnRMaW5lTnVtYmVyID09PSByLm1vZGlmaWVkUmFuZ2UuZW5kTGluZU51bWJlcjtcblx0XHRpZiAoIWlzSW5zZXJ0aW9uV2l0aGluTGluZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5mdW5jdGlvbiBpc1NpbmdsZUxpbmVJbnNlcnRpb25BZnRlclBvc2l0aW9uKGRpZmY6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdLCBwb3NpdGlvbjogUG9zaXRpb24gfCBudWxsKSB7XG5cdGlmICghcG9zaXRpb24pIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRpZiAoIWlzU2luZ2xlTGluZUluc2VydGlvbihkaWZmKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGNvbnN0IHBvcyA9IHBvc2l0aW9uO1xuXG5cdHJldHVybiBkaWZmLmV2ZXJ5KG0gPT4gbS5pbm5lckNoYW5nZXMhLmV2ZXJ5KHIgPT4gaXNTdGFibGVXb3JkSW5zZXJ0aW9uKHIpKSk7XG5cblx0ZnVuY3Rpb24gaXNTdGFibGVXb3JkSW5zZXJ0aW9uKHI6IFJhbmdlTWFwcGluZykge1xuXHRcdGNvbnN0IGluc2VydFBvc2l0aW9uID0gci5vcmlnaW5hbFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRpZiAocG9zLmlzQmVmb3JlT3JFcXVhbChpbnNlcnRQb3NpdGlvbikpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAoaW5zZXJ0UG9zaXRpb24ubGluZU51bWJlciA8IHBvcy5saW5lTnVtYmVyKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzU2luZ2xlTXVsdGlMaW5lSW5zZXJ0aW9uKGRpZmY6IERldGFpbGVkTGluZVJhbmdlTWFwcGluZ1tdKSB7XG5cdGNvbnN0IGlubmVyID0gZGlmZi5mbGF0TWFwKGQgPT4gZC5pbm5lckNoYW5nZXMgPz8gW10pO1xuXHRpZiAoaW5uZXIubGVuZ3RoICE9PSAxKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0Y29uc3QgY2hhbmdlID0gaW5uZXJbMF07XG5cdGlmICghY2hhbmdlLm9yaWdpbmFsUmFuZ2UuaXNFbXB0eSgpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKGNoYW5nZS5tb2RpZmllZFJhbmdlLnN0YXJ0TGluZU51bWJlciA9PT0gY2hhbmdlLm1vZGlmaWVkUmFuZ2UuZW5kTGluZU51bWJlcikge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpc0RlbGV0aW9uKGlubmVyOiBSYW5nZU1hcHBpbmdbXSwgaW5saW5lRWRpdDogSW5saW5lRWRpdFdpdGhDaGFuZ2VzLCBuZXdUZXh0OiBBYnN0cmFjdFRleHQpIHtcblx0Y29uc3QgaW5uZXJWYWx1ZXMgPSBpbm5lci5tYXAobSA9PiAoeyBvcmlnaW5hbDogaW5saW5lRWRpdC5vcmlnaW5hbFRleHQuZ2V0VmFsdWVPZlJhbmdlKG0ub3JpZ2luYWxSYW5nZSksIG1vZGlmaWVkOiBuZXdUZXh0LmdldFZhbHVlT2ZSYW5nZShtLm1vZGlmaWVkUmFuZ2UpIH0pKTtcblx0cmV0dXJuIGlubmVyVmFsdWVzLmV2ZXJ5KCh7IG9yaWdpbmFsLCBtb2RpZmllZCB9KSA9PiBtb2RpZmllZC50cmltKCkgPT09ICcnICYmIG9yaWdpbmFsLmxlbmd0aCA+IDAgJiYgKG9yaWdpbmFsLmxlbmd0aCA+IG1vZGlmaWVkLmxlbmd0aCB8fCBvcmlnaW5hbC50cmltKCkgIT09ICcnKSk7XG59XG5cbmZ1bmN0aW9uIGdyb3dFZGl0c1RvRW50aXJlV29yZChyZXBsYWNlbWVudHM6IFRleHRSZXBsYWNlbWVudFtdLCBvcmlnaW5hbFRleHQ6IEFic3RyYWN0VGV4dCk6IFRleHRSZXBsYWNlbWVudFtdIHtcblx0cmV0dXJuIF9ncm93RWRpdHMocmVwbGFjZW1lbnRzLCBvcmlnaW5hbFRleHQsIChjaGFyKSA9PiAvXlthLXpBLVpdJC8udGVzdChjaGFyKSk7XG59XG5cbmZ1bmN0aW9uIGdyb3dFZGl0c1VudGlsV2hpdGVzcGFjZShyZXBsYWNlbWVudHM6IFRleHRSZXBsYWNlbWVudFtdLCBvcmlnaW5hbFRleHQ6IEFic3RyYWN0VGV4dCk6IFRleHRSZXBsYWNlbWVudFtdIHtcblx0cmV0dXJuIF9ncm93RWRpdHMocmVwbGFjZW1lbnRzLCBvcmlnaW5hbFRleHQsIChjaGFyKSA9PiAhKC9eXFxzJC8udGVzdChjaGFyKSkpO1xufVxuXG5mdW5jdGlvbiBfZ3Jvd0VkaXRzKHJlcGxhY2VtZW50czogVGV4dFJlcGxhY2VtZW50W10sIG9yaWdpbmFsVGV4dDogQWJzdHJhY3RUZXh0LCBmbjogKGM6IHN0cmluZykgPT4gYm9vbGVhbik6IFRleHRSZXBsYWNlbWVudFtdIHtcblx0Y29uc3QgcmVzdWx0OiBUZXh0UmVwbGFjZW1lbnRbXSA9IFtdO1xuXG5cdHJlcGxhY2VtZW50cy5zb3J0KChhLCBiKSA9PiBSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMoYS5yYW5nZSwgYi5yYW5nZSkpO1xuXG5cdGZvciAoY29uc3QgZWRpdCBvZiByZXBsYWNlbWVudHMpIHtcblx0XHRsZXQgc3RhcnRJbmRleCA9IGVkaXQucmFuZ2Uuc3RhcnRDb2x1bW4gLSAxO1xuXHRcdGxldCBlbmRJbmRleCA9IGVkaXQucmFuZ2UuZW5kQ29sdW1uIC0gMjtcblx0XHRsZXQgcHJlZml4ID0gJyc7XG5cdFx0bGV0IHN1ZmZpeCA9ICcnO1xuXHRcdGNvbnN0IHN0YXJ0TGluZUNvbnRlbnQgPSBvcmlnaW5hbFRleHQuZ2V0TGluZUF0KGVkaXQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHRjb25zdCBlbmRMaW5lQ29udGVudCA9IG9yaWdpbmFsVGV4dC5nZXRMaW5lQXQoZWRpdC5yYW5nZS5lbmRMaW5lTnVtYmVyKTtcblxuXHRcdGlmIChpc0luY2x1ZGVkKHN0YXJ0TGluZUNvbnRlbnRbc3RhcnRJbmRleF0pKSB7XG5cdFx0XHQvLyBncm93IHRvIHRoZSBsZWZ0XG5cdFx0XHR3aGlsZSAoaXNJbmNsdWRlZChzdGFydExpbmVDb250ZW50W3N0YXJ0SW5kZXggLSAxXSkpIHtcblx0XHRcdFx0cHJlZml4ID0gc3RhcnRMaW5lQ29udGVudFtzdGFydEluZGV4IC0gMV0gKyBwcmVmaXg7XG5cdFx0XHRcdHN0YXJ0SW5kZXgtLTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaXNJbmNsdWRlZChlbmRMaW5lQ29udGVudFtlbmRJbmRleF0pIHx8IGVuZEluZGV4IDwgc3RhcnRJbmRleCkge1xuXHRcdFx0Ly8gZ3JvdyB0byB0aGUgcmlnaHRcblx0XHRcdHdoaWxlIChpc0luY2x1ZGVkKGVuZExpbmVDb250ZW50W2VuZEluZGV4ICsgMV0pKSB7XG5cdFx0XHRcdHN1ZmZpeCArPSBlbmRMaW5lQ29udGVudFtlbmRJbmRleCArIDFdO1xuXHRcdFx0XHRlbmRJbmRleCsrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGNyZWF0ZSBuZXcgZWRpdCBhbmQgbWVyZ2UgdG9nZXRoZXIgaWYgdGhleSBhcmUgdG91Y2hpbmdcblx0XHRsZXQgbmV3RWRpdCA9IG5ldyBUZXh0UmVwbGFjZW1lbnQobmV3IFJhbmdlKGVkaXQucmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCBzdGFydEluZGV4ICsgMSwgZWRpdC5yYW5nZS5lbmRMaW5lTnVtYmVyLCBlbmRJbmRleCArIDIpLCBwcmVmaXggKyBlZGl0LnRleHQgKyBzdWZmaXgpO1xuXHRcdGlmIChyZXN1bHQubGVuZ3RoID4gMCAmJiBSYW5nZS5hcmVJbnRlcnNlY3RpbmdPclRvdWNoaW5nKHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV0ucmFuZ2UsIG5ld0VkaXQucmFuZ2UpKSB7XG5cdFx0XHRuZXdFZGl0ID0gVGV4dFJlcGxhY2VtZW50LmpvaW5SZXBsYWNlbWVudHMoW3Jlc3VsdC5wb3AoKSEsIG5ld0VkaXRdLCBvcmlnaW5hbFRleHQpO1xuXHRcdH1cblxuXHRcdHJlc3VsdC5wdXNoKG5ld0VkaXQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gaXNJbmNsdWRlZChjOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0XHRpZiAoYyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBmbihjKTtcblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsU0FBUztBQUNsQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxvQkFBb0IseUJBQXlCO0FBQ3RELFNBQVMsYUFBYTtBQUN0QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFNBQVMsU0FBUyxhQUFtQywwQkFBMEIsdUJBQXVCO0FBQy9HLFNBQVMsNkJBQTZCO0FBRXRDLFNBQStCLDRCQUE0QjtBQUMzRCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBdUIsa0JBQWtCO0FBQ3pDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQW1DLG1DQUFtQyxvQkFBb0I7QUFFMUYsU0FBUyxpQkFBaUI7QUFLMUIsU0FBUywwQkFBMEIsMEJBQTBCLDJCQUEyQjtBQUN4RixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHNDQUFzQztBQUMvQyxTQUFvRCxtQ0FB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Q2pILFNBQU8sV0FBVyxjQUFjLGNBQWMsQ0FBQyxTQUFTLENBQUUsT0FBTyxLQUFLLElBQUksQ0FBRTtBQUM3RTtBQUVBLFNBQVMsV0FBVyxjQUFpQyxjQUE0QixJQUErQztBQUMvSCxRQUFNLFNBQTRCLENBQUM7QUFFbkMsZUFBYSxLQUFLLENBQUMsR0FBRyxNQUFNLE1BQU0seUJBQXlCLEVBQUUsT0FBTyxFQUFFLEtBQUssQ0FBQztBQUU1RSxhQUFXLFFBQVEsY0FBYztBQUNoQyxRQUFJLGFBQWEsS0FBSyxNQUFNLGNBQWM7QUFDMUMsUUFBSSxXQUFXLEtBQUssTUFBTSxZQUFZO0FBQ3RDLFFBQUksU0FBUztBQUNiLFFBQUksU0FBUztBQUNiLFVBQU0sbUJBQW1CLGFBQWEsVUFBVSxLQUFLLE1BQU0sZUFBZTtBQUMxRSxVQUFNLGlCQUFpQixhQUFhLFVBQVUsS0FBSyxNQUFNLGFBQWE7QUFFdEUsUUFBSSxXQUFXLGlCQUFpQixVQUFVLENBQUMsR0FBRztBQUU3QyxhQUFPLFdBQVcsaUJBQWlCLGFBQWEsQ0FBQyxDQUFDLEdBQUc7QUFDcEQsaUJBQVMsaUJBQWlCLGFBQWEsQ0FBQyxJQUFJO0FBQzVDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLFdBQVcsZUFBZSxRQUFRLENBQUMsS0FBSyxXQUFXLFlBQVk7QUFFbEUsYUFBTyxXQUFXLGVBQWUsV0FBVyxDQUFDLENBQUMsR0FBRztBQUNoRCxrQkFBVSxlQUFlLFdBQVcsQ0FBQztBQUNyQztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBR0EsUUFBSSxVQUFVLElBQUksZ0JBQWdCLElBQUksTUFBTSxLQUFLLE1BQU0saUJBQWlCLGFBQWEsR0FBRyxLQUFLLE1BQU0sZUFBZSxXQUFXLENBQUMsR0FBRyxTQUFTLEtBQUssT0FBTyxNQUFNO0FBQzVKLFFBQUksT0FBTyxTQUFTLEtBQUssTUFBTSwwQkFBMEIsT0FBTyxPQUFPLFNBQVMsQ0FBQyxFQUFFLE9BQU8sUUFBUSxLQUFLLEdBQUc7QUFDekcsZ0JBQVUsZ0JBQWdCLGlCQUFpQixDQUFDLE9BQU8sSUFBSSxHQUFJLE9BQU8sR0FBRyxZQUFZO0FBQUEsSUFDbEY7QUFFQSxXQUFPLEtBQUssT0FBTztBQUFBLEVBQ3BCO0FBRUEsV0FBUyxXQUFXLEdBQXVCO0FBQzFDLFFBQUksTUFBTSxRQUFXO0FBQ3BCLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxHQUFHLENBQUM7QUFBQSxFQUNaO0FBRUEsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogWyJyZWFkZXIiXQp9Cg==
