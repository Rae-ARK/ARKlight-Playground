import { Emitter } from "../../../base/common/event.js";
import { DisposableStore } from "../../../base/common/lifecycle.js";
import { RenderLineNumbersType, TextEditorCursorStyle, cursorStyleToString, EditorOption } from "../../../editor/common/config/editorOptions.js";
import { Range } from "../../../editor/common/core/range.js";
import { Selection } from "../../../editor/common/core/selection.js";
import { ScrollType } from "../../../editor/common/editorCommon.js";
import { SnippetController2 } from "../../../editor/contrib/snippet/browser/snippetController2.js";
import { TextEditorRevealType } from "../common/extHost.protocol.js";
import { equals } from "../../../base/common/arrays.js";
import { CodeEditorStateFlag, EditorState } from "../../../editor/contrib/editorState/browser/editorState.js";
import { SnippetParser } from "../../../editor/contrib/snippet/browser/snippetParser.js";
class MainThreadTextEditorProperties {
  constructor(selections, options, visibleRanges) {
    this.selections = selections;
    this.options = options;
    this.visibleRanges = visibleRanges;
  }
  static readFromEditor(previousProperties, model, codeEditor) {
    const selections = MainThreadTextEditorProperties._readSelectionsFromCodeEditor(previousProperties, codeEditor);
    const options = MainThreadTextEditorProperties._readOptionsFromCodeEditor(previousProperties, model, codeEditor);
    const visibleRanges = MainThreadTextEditorProperties._readVisibleRangesFromCodeEditor(previousProperties, codeEditor);
    return new MainThreadTextEditorProperties(selections, options, visibleRanges);
  }
  static _readSelectionsFromCodeEditor(previousProperties, codeEditor) {
    let result = null;
    if (codeEditor) {
      result = codeEditor.getSelections();
    }
    if (!result && previousProperties) {
      result = previousProperties.selections;
    }
    if (!result) {
      result = [new Selection(1, 1, 1, 1)];
    }
    return result;
  }
  static _readOptionsFromCodeEditor(previousProperties, model, codeEditor) {
    if (model.isDisposed()) {
      if (previousProperties) {
        return previousProperties.options;
      } else {
        throw new Error("No valid properties");
      }
    }
    let cursorStyle;
    let lineNumbers;
    if (codeEditor) {
      const options = codeEditor.getOptions();
      const lineNumbersOpts = options.get(EditorOption.lineNumbers);
      cursorStyle = options.get(EditorOption.cursorStyle);
      lineNumbers = lineNumbersOpts.renderType;
    } else if (previousProperties) {
      cursorStyle = previousProperties.options.cursorStyle;
      lineNumbers = previousProperties.options.lineNumbers;
    } else {
      cursorStyle = TextEditorCursorStyle.Line;
      lineNumbers = RenderLineNumbersType.On;
    }
    const modelOptions = model.getOptions();
    return {
      insertSpaces: modelOptions.insertSpaces,
      tabSize: modelOptions.tabSize,
      indentSize: modelOptions.indentSize,
      originalIndentSize: modelOptions.originalIndentSize,
      cursorStyle,
      lineNumbers
    };
  }
  static _readVisibleRangesFromCodeEditor(previousProperties, codeEditor) {
    if (codeEditor) {
      return codeEditor.getVisibleRanges();
    }
    return [];
  }
  generateDelta(oldProps, selectionChangeSource) {
    const delta = {
      options: null,
      selections: null,
      visibleRanges: null
    };
    if (!oldProps || !MainThreadTextEditorProperties._selectionsEqual(oldProps.selections, this.selections)) {
      delta.selections = {
        selections: this.selections,
        source: selectionChangeSource ?? void 0
      };
    }
    if (!oldProps || !MainThreadTextEditorProperties._optionsEqual(oldProps.options, this.options)) {
      delta.options = this.options;
    }
    if (!oldProps || !MainThreadTextEditorProperties._rangesEqual(oldProps.visibleRanges, this.visibleRanges)) {
      delta.visibleRanges = this.visibleRanges;
    }
    if (delta.selections || delta.options || delta.visibleRanges) {
      return delta;
    }
    return null;
  }
  static _selectionsEqual(a, b) {
    return equals(a, b, (aValue, bValue) => aValue.equalsSelection(bValue));
  }
  static _rangesEqual(a, b) {
    return equals(a, b, (aValue, bValue) => aValue.equalsRange(bValue));
  }
  static _optionsEqual(a, b) {
    if (a && !b || !a && b) {
      return false;
    }
    if (!a && !b) {
      return true;
    }
    return a.tabSize === b.tabSize && a.indentSize === b.indentSize && a.insertSpaces === b.insertSpaces && a.cursorStyle === b.cursorStyle && a.lineNumbers === b.lineNumbers;
  }
}
class MainThreadTextEditor {
  constructor(id, model, codeEditor, focusTracker, mainThreadDocuments, modelService, clipboardService) {
    this._modelListeners = new DisposableStore();
    this._codeEditorListeners = new DisposableStore();
    this._id = id;
    this._model = model;
    this._codeEditor = null;
    this._properties = null;
    this._focusTracker = focusTracker;
    this._mainThreadDocuments = mainThreadDocuments;
    this._modelService = modelService;
    this._clipboardService = clipboardService;
    this._onPropertiesChanged = new Emitter();
    this._modelListeners.add(this._model.onDidChangeOptions((e) => {
      this._updatePropertiesNow(null);
    }));
    this.setCodeEditor(codeEditor);
    this._updatePropertiesNow(null);
  }
  dispose() {
    this._modelListeners.dispose();
    this._onPropertiesChanged.dispose();
    this._codeEditor = null;
    this._codeEditorListeners.dispose();
  }
  _updatePropertiesNow(selectionChangeSource) {
    this._setProperties(
      MainThreadTextEditorProperties.readFromEditor(this._properties, this._model, this._codeEditor),
      selectionChangeSource
    );
  }
  _setProperties(newProperties, selectionChangeSource) {
    const delta = newProperties.generateDelta(this._properties, selectionChangeSource);
    this._properties = newProperties;
    if (delta) {
      this._onPropertiesChanged.fire(delta);
    }
  }
  getId() {
    return this._id;
  }
  getModel() {
    return this._model;
  }
  getCodeEditor() {
    return this._codeEditor;
  }
  hasCodeEditor(codeEditor) {
    return this._codeEditor === codeEditor;
  }
  setCodeEditor(codeEditor) {
    if (this.hasCodeEditor(codeEditor)) {
      return;
    }
    this._codeEditorListeners.clear();
    this._codeEditor = codeEditor;
    if (this._codeEditor) {
      this._codeEditorListeners.add(this._codeEditor.onDidChangeModel(() => {
        this.setCodeEditor(null);
      }));
      this._codeEditorListeners.add(this._codeEditor.onDidFocusEditorWidget(() => {
        this._focusTracker.onGainedFocus();
      }));
      this._codeEditorListeners.add(this._codeEditor.onDidBlurEditorWidget(() => {
        this._focusTracker.onLostFocus();
      }));
      let nextSelectionChangeSource = null;
      this._codeEditorListeners.add(this._mainThreadDocuments.onIsCaughtUpWithContentChanges((uri) => {
        if (uri.toString() === this._model.uri.toString()) {
          const selectionChangeSource = nextSelectionChangeSource;
          nextSelectionChangeSource = null;
          this._updatePropertiesNow(selectionChangeSource);
        }
      }));
      const isValidCodeEditor = () => {
        return this._codeEditor && this._codeEditor.getModel() === this._model;
      };
      const updateProperties = (selectionChangeSource) => {
        if (this._mainThreadDocuments.isCaughtUpWithContentChanges(this._model.uri)) {
          nextSelectionChangeSource = null;
          this._updatePropertiesNow(selectionChangeSource);
        } else {
          nextSelectionChangeSource = selectionChangeSource;
        }
      };
      this._codeEditorListeners.add(this._codeEditor.onDidChangeCursorSelection((e) => {
        if (!isValidCodeEditor()) {
          return;
        }
        updateProperties(e.source);
      }));
      this._codeEditorListeners.add(this._codeEditor.onDidChangeConfiguration((e) => {
        if (!isValidCodeEditor()) {
          return;
        }
        updateProperties(null);
      }));
      this._codeEditorListeners.add(this._codeEditor.onDidLayoutChange(() => {
        if (!isValidCodeEditor()) {
          return;
        }
        updateProperties(null);
      }));
      this._codeEditorListeners.add(this._codeEditor.onDidScrollChange(() => {
        if (!isValidCodeEditor()) {
          return;
        }
        updateProperties(null);
      }));
      this._updatePropertiesNow(null);
    }
  }
  isVisible() {
    return !!this._codeEditor;
  }
  getProperties() {
    return this._properties;
  }
  get onPropertiesChanged() {
    return this._onPropertiesChanged.event;
  }
  setSelections(selections) {
    if (this._codeEditor) {
      this._codeEditor.setSelections(selections);
      return;
    }
    const newSelections = selections.map(Selection.liftSelection);
    this._setProperties(
      new MainThreadTextEditorProperties(newSelections, this._properties.options, this._properties.visibleRanges),
      null
    );
  }
  _setIndentConfiguration(newConfiguration) {
    const creationOpts = this._modelService.getCreationOptions(this._model.getLanguageId(), this._model.uri, this._model.isForSimpleWidget);
    if (newConfiguration.tabSize === "auto" || newConfiguration.insertSpaces === "auto") {
      let insertSpaces = creationOpts.insertSpaces;
      let tabSize = creationOpts.tabSize;
      if (newConfiguration.insertSpaces !== "auto" && typeof newConfiguration.insertSpaces !== "undefined") {
        insertSpaces = newConfiguration.insertSpaces;
      }
      if (newConfiguration.tabSize !== "auto" && typeof newConfiguration.tabSize !== "undefined") {
        tabSize = newConfiguration.tabSize;
      }
      this._model.detectIndentation(insertSpaces, tabSize);
      return;
    }
    const newOpts = {};
    if (typeof newConfiguration.insertSpaces !== "undefined") {
      newOpts.insertSpaces = newConfiguration.insertSpaces;
    }
    if (typeof newConfiguration.tabSize !== "undefined") {
      newOpts.tabSize = newConfiguration.tabSize;
    }
    if (typeof newConfiguration.indentSize !== "undefined") {
      newOpts.indentSize = newConfiguration.indentSize;
    }
    this._model.updateOptions(newOpts);
  }
  setConfiguration(newConfiguration) {
    this._setIndentConfiguration(newConfiguration);
    if (!this._codeEditor) {
      return;
    }
    if (newConfiguration.cursorStyle) {
      const newCursorStyle = cursorStyleToString(newConfiguration.cursorStyle);
      this._codeEditor.updateOptions({
        cursorStyle: newCursorStyle
      });
    }
    if (typeof newConfiguration.lineNumbers !== "undefined") {
      let lineNumbers;
      switch (newConfiguration.lineNumbers) {
        case RenderLineNumbersType.On:
          lineNumbers = "on";
          break;
        case RenderLineNumbersType.Relative:
          lineNumbers = "relative";
          break;
        case RenderLineNumbersType.Interval:
          lineNumbers = "interval";
          break;
        default:
          lineNumbers = "off";
      }
      this._codeEditor.updateOptions({
        lineNumbers
      });
    }
  }
  setDecorations(key, ranges) {
    if (!this._codeEditor) {
      return;
    }
    this._codeEditor.setDecorationsByType("exthost-api", key, ranges);
  }
  setDecorationsFast(key, _ranges) {
    if (!this._codeEditor) {
      return;
    }
    const ranges = [];
    for (let i = 0, len = Math.floor(_ranges.length / 4); i < len; i++) {
      ranges[i] = new Range(_ranges[4 * i], _ranges[4 * i + 1], _ranges[4 * i + 2], _ranges[4 * i + 3]);
    }
    this._codeEditor.setDecorationsByTypeFast(key, ranges);
  }
  revealRange(range, revealType) {
    if (!this._codeEditor) {
      return;
    }
    switch (revealType) {
      case TextEditorRevealType.Default:
        this._codeEditor.revealRange(range, ScrollType.Smooth);
        break;
      case TextEditorRevealType.InCenter:
        this._codeEditor.revealRangeInCenter(range, ScrollType.Smooth);
        break;
      case TextEditorRevealType.InCenterIfOutsideViewport:
        this._codeEditor.revealRangeInCenterIfOutsideViewport(range, ScrollType.Smooth);
        break;
      case TextEditorRevealType.AtTop:
        this._codeEditor.revealRangeAtTop(range, ScrollType.Smooth);
        break;
      default:
        console.warn(`Unknown revealType: ${revealType}`);
        break;
    }
  }
  isFocused() {
    if (this._codeEditor) {
      return this._codeEditor.hasTextFocus();
    }
    return false;
  }
  matches(editor) {
    if (!editor) {
      return false;
    }
    return editor.getControl() === this._codeEditor;
  }
  applyEdits(versionIdCheck, edits, opts) {
    if (this._model.getVersionId() !== versionIdCheck) {
      return false;
    }
    if (!this._codeEditor) {
      return false;
    }
    if (typeof opts.setEndOfLine !== "undefined") {
      this._model.pushEOL(opts.setEndOfLine);
    }
    const transformedEdits = edits.map((edit) => {
      return {
        range: Range.lift(edit.range),
        text: edit.text,
        forceMoveMarkers: edit.forceMoveMarkers
      };
    });
    if (opts.undoStopBefore) {
      this._codeEditor.pushUndoStop();
    }
    this._codeEditor.executeEdits("MainThreadTextEditor", transformedEdits);
    if (opts.undoStopAfter) {
      this._codeEditor.pushUndoStop();
    }
    return true;
  }
  async insertSnippet(modelVersionId, template, ranges, opts) {
    if (!this._codeEditor || !this._codeEditor.hasModel()) {
      return false;
    }
    let clipboardText;
    const needsTemplate = SnippetParser.guessNeedsClipboard(template);
    if (needsTemplate) {
      const state = new EditorState(this._codeEditor, CodeEditorStateFlag.Value | CodeEditorStateFlag.Position);
      clipboardText = await this._clipboardService.readText();
      if (!state.validate(this._codeEditor)) {
        return false;
      }
    }
    if (this._codeEditor.getModel().getVersionId() !== modelVersionId) {
      return false;
    }
    const snippetController = SnippetController2.get(this._codeEditor);
    if (!snippetController) {
      return false;
    }
    this._codeEditor.focus();
    const edits = ranges.map((range) => ({ range: Range.lift(range), template }));
    snippetController.apply(edits, {
      overwriteBefore: 0,
      overwriteAfter: 0,
      undoStopBefore: opts.undoStopBefore,
      undoStopAfter: opts.undoStopAfter,
      adjustWhitespace: !opts.keepWhitespace,
      clipboardText
    });
    return true;
  }
}
export {
  MainThreadTextEditor,
  MainThreadTextEditorProperties
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvYnJvd3Nlci9tYWluVGhyZWFkRWRpdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IFJlbmRlckxpbmVOdW1iZXJzVHlwZSwgVGV4dEVkaXRvckN1cnNvclN0eWxlLCBjdXJzb3JTdHlsZVRvU3RyaW5nLCBFZGl0b3JPcHRpb24gfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IElSYW5nZSwgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSVNlbGVjdGlvbiwgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbk9wdGlvbnMsIFNjcm9sbFR5cGUgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvckNvbW1vbi5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsLCBJVGV4dE1vZGVsVXBkYXRlT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgSVNpbmdsZUVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdE9wZXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0Q29udHJvbGxlcjIgfSBmcm9tICcuLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldENvbnRyb2xsZXIyLmpzJztcbmltcG9ydCB7IElBcHBseUVkaXRzT3B0aW9ucywgSUVkaXRvclByb3BlcnRpZXNDaGFuZ2VEYXRhLCBJUmVzb2x2ZWRUZXh0RWRpdG9yQ29uZmlndXJhdGlvbiwgSVNuaXBwZXRPcHRpb25zLCBJVGV4dEVkaXRvckNvbmZpZ3VyYXRpb25VcGRhdGUsIFRleHRFZGl0b3JSZXZlYWxUeXBlIH0gZnJvbSAnLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgSUVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yU3RhdGVGbGFnLCBFZGl0b3JTdGF0ZSB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb250cmliL2VkaXRvclN0YXRlL2Jyb3dzZXIvZWRpdG9yU3RhdGUuanMnO1xuaW1wb3J0IHsgSUNsaXBib2FyZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9wbGF0Zm9ybS9jbGlwYm9hcmQvY29tbW9uL2NsaXBib2FyZFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU25pcHBldFBhcnNlciB9IGZyb20gJy4uLy4uLy4uL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0UGFyc2VyLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWREb2N1bWVudHMgfSBmcm9tICcuL21haW5UaHJlYWREb2N1bWVudHMuanMnO1xuaW1wb3J0IHsgSVNuaXBwZXRFZGl0IH0gZnJvbSAnLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvc25pcHBldC9icm93c2VyL3NuaXBwZXRTZXNzaW9uLmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJRm9jdXNUcmFja2VyIHtcblx0b25HYWluZWRGb2N1cygpOiB2b2lkO1xuXHRvbkxvc3RGb2N1cygpOiB2b2lkO1xufVxuXG5leHBvcnQgY2xhc3MgTWFpblRocmVhZFRleHRFZGl0b3JQcm9wZXJ0aWVzIHtcblxuXHRwdWJsaWMgc3RhdGljIHJlYWRGcm9tRWRpdG9yKHByZXZpb3VzUHJvcGVydGllczogTWFpblRocmVhZFRleHRFZGl0b3JQcm9wZXJ0aWVzIHwgbnVsbCwgbW9kZWw6IElUZXh0TW9kZWwsIGNvZGVFZGl0b3I6IElDb2RlRWRpdG9yIHwgbnVsbCk6IE1haW5UaHJlYWRUZXh0RWRpdG9yUHJvcGVydGllcyB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IE1haW5UaHJlYWRUZXh0RWRpdG9yUHJvcGVydGllcy5fcmVhZFNlbGVjdGlvbnNGcm9tQ29kZUVkaXRvcihwcmV2aW91c1Byb3BlcnRpZXMsIGNvZGVFZGl0b3IpO1xuXHRcdGNvbnN0IG9wdGlvbnMgPSBNYWluVGhyZWFkVGV4dEVkaXRvclByb3BlcnRpZXMuX3JlYWRPcHRpb25zRnJvbUNvZGVFZGl0b3IocHJldmlvdXNQcm9wZXJ0aWVzLCBtb2RlbCwgY29kZUVkaXRvcik7XG5cdFx0Y29uc3QgdmlzaWJsZVJhbmdlcyA9IE1haW5UaHJlYWRUZXh0RWRpdG9yUHJvcGVydGllcy5fcmVhZFZpc2libGVSYW5nZXNGcm9tQ29kZUVkaXRvcihwcmV2aW91c1Byb3BlcnRpZXMsIGNvZGVFZGl0b3IpO1xuXHRcdHJldHVybiBuZXcgTWFpblRocmVhZFRleHRFZGl0b3JQcm9wZXJ0aWVzKHNlbGVjdGlvbnMsIG9wdGlvbnMsIHZpc2libGVSYW5nZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3JlYWRTZWxlY3Rpb25zRnJvbUNvZGVFZGl0b3IocHJldmlvdXNQcm9wZXJ0aWVzOiBNYWluVGhyZWFkVGV4dEVkaXRvclByb3BlcnRpZXMgfCBudWxsLCBjb2RlRWRpdG9yOiBJQ29kZUVkaXRvciB8IG51bGwpOiBTZWxlY3Rpb25bXSB7XG5cdFx0bGV0IHJlc3VsdDogU2VsZWN0aW9uW10gfCBudWxsID0gbnVsbDtcblx0XHRpZiAoY29kZUVkaXRvcikge1xuXHRcdFx0cmVzdWx0ID0gY29kZUVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0fVxuXHRcdGlmICghcmVzdWx0ICYmIHByZXZpb3VzUHJvcGVydGllcykge1xuXHRcdFx0cmVzdWx0ID0gcHJldmlvdXNQcm9wZXJ0aWVzLnNlbGVjdGlvbnM7XG5cdFx0fVxuXHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRyZXN1bHQgPSBbbmV3IFNlbGVjdGlvbigxLCAxLCAxLCAxKV07XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfcmVhZE9wdGlvbnNGcm9tQ29kZUVkaXRvcihwcmV2aW91c1Byb3BlcnRpZXM6IE1haW5UaHJlYWRUZXh0RWRpdG9yUHJvcGVydGllcyB8IG51bGwsIG1vZGVsOiBJVGV4dE1vZGVsLCBjb2RlRWRpdG9yOiBJQ29kZUVkaXRvciB8IG51bGwpOiBJUmVzb2x2ZWRUZXh0RWRpdG9yQ29uZmlndXJhdGlvbiB7XG5cdFx0aWYgKG1vZGVsLmlzRGlzcG9zZWQoKSkge1xuXHRcdFx0aWYgKHByZXZpb3VzUHJvcGVydGllcykge1xuXHRcdFx0XHQvLyBzaHV0ZG93biB0aW1lXG5cdFx0XHRcdHJldHVybiBwcmV2aW91c1Byb3BlcnRpZXMub3B0aW9ucztcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gdmFsaWQgcHJvcGVydGllcycpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBjdXJzb3JTdHlsZTogVGV4dEVkaXRvckN1cnNvclN0eWxlO1xuXHRcdGxldCBsaW5lTnVtYmVyczogUmVuZGVyTGluZU51bWJlcnNUeXBlO1xuXHRcdGlmIChjb2RlRWRpdG9yKSB7XG5cdFx0XHRjb25zdCBvcHRpb25zID0gY29kZUVkaXRvci5nZXRPcHRpb25zKCk7XG5cdFx0XHRjb25zdCBsaW5lTnVtYmVyc09wdHMgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24ubGluZU51bWJlcnMpO1xuXHRcdFx0Y3Vyc29yU3R5bGUgPSBvcHRpb25zLmdldChFZGl0b3JPcHRpb24uY3Vyc29yU3R5bGUpO1xuXHRcdFx0bGluZU51bWJlcnMgPSBsaW5lTnVtYmVyc09wdHMucmVuZGVyVHlwZTtcblx0XHR9IGVsc2UgaWYgKHByZXZpb3VzUHJvcGVydGllcykge1xuXHRcdFx0Y3Vyc29yU3R5bGUgPSBwcmV2aW91c1Byb3BlcnRpZXMub3B0aW9ucy5jdXJzb3JTdHlsZTtcblx0XHRcdGxpbmVOdW1iZXJzID0gcHJldmlvdXNQcm9wZXJ0aWVzLm9wdGlvbnMubGluZU51bWJlcnM7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGN1cnNvclN0eWxlID0gVGV4dEVkaXRvckN1cnNvclN0eWxlLkxpbmU7XG5cdFx0XHRsaW5lTnVtYmVycyA9IFJlbmRlckxpbmVOdW1iZXJzVHlwZS5Pbjtcblx0XHR9XG5cblx0XHRjb25zdCBtb2RlbE9wdGlvbnMgPSBtb2RlbC5nZXRPcHRpb25zKCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGluc2VydFNwYWNlczogbW9kZWxPcHRpb25zLmluc2VydFNwYWNlcyxcblx0XHRcdHRhYlNpemU6IG1vZGVsT3B0aW9ucy50YWJTaXplLFxuXHRcdFx0aW5kZW50U2l6ZTogbW9kZWxPcHRpb25zLmluZGVudFNpemUsXG5cdFx0XHRvcmlnaW5hbEluZGVudFNpemU6IG1vZGVsT3B0aW9ucy5vcmlnaW5hbEluZGVudFNpemUsXG5cdFx0XHRjdXJzb3JTdHlsZTogY3Vyc29yU3R5bGUsXG5cdFx0XHRsaW5lTnVtYmVyczogbGluZU51bWJlcnNcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3JlYWRWaXNpYmxlUmFuZ2VzRnJvbUNvZGVFZGl0b3IocHJldmlvdXNQcm9wZXJ0aWVzOiBNYWluVGhyZWFkVGV4dEVkaXRvclByb3BlcnRpZXMgfCBudWxsLCBjb2RlRWRpdG9yOiBJQ29kZUVkaXRvciB8IG51bGwpOiBSYW5nZVtdIHtcblx0XHRpZiAoY29kZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuIGNvZGVFZGl0b3IuZ2V0VmlzaWJsZVJhbmdlcygpO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgc2VsZWN0aW9uczogU2VsZWN0aW9uW10sXG5cdFx0cHVibGljIHJlYWRvbmx5IG9wdGlvbnM6IElSZXNvbHZlZFRleHRFZGl0b3JDb25maWd1cmF0aW9uLFxuXHRcdHB1YmxpYyByZWFkb25seSB2aXNpYmxlUmFuZ2VzOiBSYW5nZVtdXG5cdCkge1xuXHR9XG5cblx0cHVibGljIGdlbmVyYXRlRGVsdGEob2xkUHJvcHM6IE1haW5UaHJlYWRUZXh0RWRpdG9yUHJvcGVydGllcyB8IG51bGwsIHNlbGVjdGlvbkNoYW5nZVNvdXJjZTogc3RyaW5nIHwgbnVsbCk6IElFZGl0b3JQcm9wZXJ0aWVzQ2hhbmdlRGF0YSB8IG51bGwge1xuXHRcdGNvbnN0IGRlbHRhOiBJRWRpdG9yUHJvcGVydGllc0NoYW5nZURhdGEgPSB7XG5cdFx0XHRvcHRpb25zOiBudWxsLFxuXHRcdFx0c2VsZWN0aW9uczogbnVsbCxcblx0XHRcdHZpc2libGVSYW5nZXM6IG51bGxcblx0XHR9O1xuXG5cdFx0aWYgKCFvbGRQcm9wcyB8fCAhTWFpblRocmVhZFRleHRFZGl0b3JQcm9wZXJ0aWVzLl9zZWxlY3Rpb25zRXF1YWwob2xkUHJvcHMuc2VsZWN0aW9ucywgdGhpcy5zZWxlY3Rpb25zKSkge1xuXHRcdFx0ZGVsdGEuc2VsZWN0aW9ucyA9IHtcblx0XHRcdFx0c2VsZWN0aW9uczogdGhpcy5zZWxlY3Rpb25zLFxuXHRcdFx0XHRzb3VyY2U6IHNlbGVjdGlvbkNoYW5nZVNvdXJjZSA/PyB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGlmICghb2xkUHJvcHMgfHwgIU1haW5UaHJlYWRUZXh0RWRpdG9yUHJvcGVydGllcy5fb3B0aW9uc0VxdWFsKG9sZFByb3BzLm9wdGlvbnMsIHRoaXMub3B0aW9ucykpIHtcblx0XHRcdGRlbHRhLm9wdGlvbnMgPSB0aGlzLm9wdGlvbnM7XG5cdFx0fVxuXG5cdFx0aWYgKCFvbGRQcm9wcyB8fCAhTWFpblRocmVhZFRleHRFZGl0b3JQcm9wZXJ0aWVzLl9yYW5nZXNFcXVhbChvbGRQcm9wcy52aXNpYmxlUmFuZ2VzLCB0aGlzLnZpc2libGVSYW5nZXMpKSB7XG5cdFx0XHRkZWx0YS52aXNpYmxlUmFuZ2VzID0gdGhpcy52aXNpYmxlUmFuZ2VzO1xuXHRcdH1cblxuXHRcdGlmIChkZWx0YS5zZWxlY3Rpb25zIHx8IGRlbHRhLm9wdGlvbnMgfHwgZGVsdGEudmlzaWJsZVJhbmdlcykge1xuXHRcdFx0Ly8gc29tZXRoaW5nIGNoYW5nZWRcblx0XHRcdHJldHVybiBkZWx0YTtcblx0XHR9XG5cdFx0Ly8gbm90aGluZyBjaGFuZ2VkXG5cdFx0cmV0dXJuIG51bGw7XG5cdH1cblxuXHRwcml2YXRlIHN0YXRpYyBfc2VsZWN0aW9uc0VxdWFsKGE6IHJlYWRvbmx5IFNlbGVjdGlvbltdLCBiOiByZWFkb25seSBTZWxlY3Rpb25bXSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBlcXVhbHMoYSwgYiwgKGFWYWx1ZSwgYlZhbHVlKSA9PiBhVmFsdWUuZXF1YWxzU2VsZWN0aW9uKGJWYWx1ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX3Jhbmdlc0VxdWFsKGE6IHJlYWRvbmx5IFJhbmdlW10sIGI6IHJlYWRvbmx5IFJhbmdlW10pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZXF1YWxzKGEsIGIsIChhVmFsdWUsIGJWYWx1ZSkgPT4gYVZhbHVlLmVxdWFsc1JhbmdlKGJWYWx1ZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBzdGF0aWMgX29wdGlvbnNFcXVhbChhOiBJUmVzb2x2ZWRUZXh0RWRpdG9yQ29uZmlndXJhdGlvbiwgYjogSVJlc29sdmVkVGV4dEVkaXRvckNvbmZpZ3VyYXRpb24pOiBib29sZWFuIHtcblx0XHRpZiAoYSAmJiAhYiB8fCAhYSAmJiBiKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGlmICghYSAmJiAhYikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiAoXG5cdFx0XHRhLnRhYlNpemUgPT09IGIudGFiU2l6ZVxuXHRcdFx0JiYgYS5pbmRlbnRTaXplID09PSBiLmluZGVudFNpemVcblx0XHRcdCYmIGEuaW5zZXJ0U3BhY2VzID09PSBiLmluc2VydFNwYWNlc1xuXHRcdFx0JiYgYS5jdXJzb3JTdHlsZSA9PT0gYi5jdXJzb3JTdHlsZVxuXHRcdFx0JiYgYS5saW5lTnVtYmVycyA9PT0gYi5saW5lTnVtYmVyc1xuXHRcdCk7XG5cdH1cbn1cblxuLyoqXG4gKiBUZXh0IEVkaXRvciB0aGF0IGlzIHBlcm1hbmVudGx5IGJvdW5kIHRvIHRoZSBzYW1lIG1vZGVsLlxuICogSXQgY2FuIGJlIGJvdW5kIG9yIG5vdCB0byBhIENvZGVFZGl0b3IuXG4gKi9cbmV4cG9ydCBjbGFzcyBNYWluVGhyZWFkVGV4dEVkaXRvciB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaWQ6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWw6IElUZXh0TW9kZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21haW5UaHJlYWREb2N1bWVudHM6IE1haW5UaHJlYWREb2N1bWVudHM7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsU2VydmljZTogSU1vZGVsU2VydmljZTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsTGlzdGVuZXJzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIF9jb2RlRWRpdG9yOiBJQ29kZUVkaXRvciB8IG51bGw7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZvY3VzVHJhY2tlcjogSUZvY3VzVHJhY2tlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfY29kZUVkaXRvckxpc3RlbmVycyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIF9wcm9wZXJ0aWVzOiBNYWluVGhyZWFkVGV4dEVkaXRvclByb3BlcnRpZXMgfCBudWxsO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vblByb3BlcnRpZXNDaGFuZ2VkOiBFbWl0dGVyPElFZGl0b3JQcm9wZXJ0aWVzQ2hhbmdlRGF0YT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aWQ6IHN0cmluZyxcblx0XHRtb2RlbDogSVRleHRNb2RlbCxcblx0XHRjb2RlRWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRmb2N1c1RyYWNrZXI6IElGb2N1c1RyYWNrZXIsXG5cdFx0bWFpblRocmVhZERvY3VtZW50czogTWFpblRocmVhZERvY3VtZW50cyxcblx0XHRtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0Y2xpcGJvYXJkU2VydmljZTogSUNsaXBib2FyZFNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuX2lkID0gaWQ7XG5cdFx0dGhpcy5fbW9kZWwgPSBtb2RlbDtcblx0XHR0aGlzLl9jb2RlRWRpdG9yID0gbnVsbDtcblx0XHR0aGlzLl9wcm9wZXJ0aWVzID0gbnVsbDtcblx0XHR0aGlzLl9mb2N1c1RyYWNrZXIgPSBmb2N1c1RyYWNrZXI7XG5cdFx0dGhpcy5fbWFpblRocmVhZERvY3VtZW50cyA9IG1haW5UaHJlYWREb2N1bWVudHM7XG5cdFx0dGhpcy5fbW9kZWxTZXJ2aWNlID0gbW9kZWxTZXJ2aWNlO1xuXHRcdHRoaXMuX2NsaXBib2FyZFNlcnZpY2UgPSBjbGlwYm9hcmRTZXJ2aWNlO1xuXG5cdFx0dGhpcy5fb25Qcm9wZXJ0aWVzQ2hhbmdlZCA9IG5ldyBFbWl0dGVyPElFZGl0b3JQcm9wZXJ0aWVzQ2hhbmdlRGF0YT4oKTtcblxuXHRcdHRoaXMuX21vZGVsTGlzdGVuZXJzLmFkZCh0aGlzLl9tb2RlbC5vbkRpZENoYW5nZU9wdGlvbnMoKGUpID0+IHtcblx0XHRcdHRoaXMuX3VwZGF0ZVByb3BlcnRpZXNOb3cobnVsbCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5zZXRDb2RlRWRpdG9yKGNvZGVFZGl0b3IpO1xuXHRcdHRoaXMuX3VwZGF0ZVByb3BlcnRpZXNOb3cobnVsbCk7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlbExpc3RlbmVycy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25Qcm9wZXJ0aWVzQ2hhbmdlZC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fY29kZUVkaXRvciA9IG51bGw7XG5cdFx0dGhpcy5fY29kZUVkaXRvckxpc3RlbmVycy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVQcm9wZXJ0aWVzTm93KHNlbGVjdGlvbkNoYW5nZVNvdXJjZTogc3RyaW5nIHwgbnVsbCk6IHZvaWQge1xuXHRcdHRoaXMuX3NldFByb3BlcnRpZXMoXG5cdFx0XHRNYWluVGhyZWFkVGV4dEVkaXRvclByb3BlcnRpZXMucmVhZEZyb21FZGl0b3IodGhpcy5fcHJvcGVydGllcywgdGhpcy5fbW9kZWwsIHRoaXMuX2NvZGVFZGl0b3IpLFxuXHRcdFx0c2VsZWN0aW9uQ2hhbmdlU291cmNlXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgX3NldFByb3BlcnRpZXMobmV3UHJvcGVydGllczogTWFpblRocmVhZFRleHRFZGl0b3JQcm9wZXJ0aWVzLCBzZWxlY3Rpb25DaGFuZ2VTb3VyY2U6IHN0cmluZyB8IG51bGwpOiB2b2lkIHtcblx0XHRjb25zdCBkZWx0YSA9IG5ld1Byb3BlcnRpZXMuZ2VuZXJhdGVEZWx0YSh0aGlzLl9wcm9wZXJ0aWVzLCBzZWxlY3Rpb25DaGFuZ2VTb3VyY2UpO1xuXHRcdHRoaXMuX3Byb3BlcnRpZXMgPSBuZXdQcm9wZXJ0aWVzO1xuXHRcdGlmIChkZWx0YSkge1xuXHRcdFx0dGhpcy5fb25Qcm9wZXJ0aWVzQ2hhbmdlZC5maXJlKGRlbHRhKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgZ2V0SWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5faWQ7XG5cdH1cblxuXHRwdWJsaWMgZ2V0TW9kZWwoKTogSVRleHRNb2RlbCB7XG5cdFx0cmV0dXJuIHRoaXMuX21vZGVsO1xuXHR9XG5cblx0cHVibGljIGdldENvZGVFZGl0b3IoKTogSUNvZGVFZGl0b3IgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5fY29kZUVkaXRvcjtcblx0fVxuXG5cdHB1YmxpYyBoYXNDb2RlRWRpdG9yKGNvZGVFZGl0b3I6IElDb2RlRWRpdG9yIHwgbnVsbCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAodGhpcy5fY29kZUVkaXRvciA9PT0gY29kZUVkaXRvcik7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q29kZUVkaXRvcihjb2RlRWRpdG9yOiBJQ29kZUVkaXRvciB8IG51bGwpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5oYXNDb2RlRWRpdG9yKGNvZGVFZGl0b3IpKSB7XG5cdFx0XHQvLyBOb3RoaW5nIHRvIGRvLi4uXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2NvZGVFZGl0b3JMaXN0ZW5lcnMuY2xlYXIoKTtcblxuXHRcdHRoaXMuX2NvZGVFZGl0b3IgPSBjb2RlRWRpdG9yO1xuXHRcdGlmICh0aGlzLl9jb2RlRWRpdG9yKSB7XG5cblx0XHRcdC8vIENhdGNoIGVhcmx5IHRoZSBjYXNlIHRoYXQgdGhpcyBjb2RlIGVkaXRvciBnZXRzIGEgZGlmZmVyZW50IG1vZGVsIHNldCBhbmQgZGlzYXNzb2NpYXRlIGZyb20gdGhpcyBtb2RlbFxuXHRcdFx0dGhpcy5fY29kZUVkaXRvckxpc3RlbmVycy5hZGQodGhpcy5fY29kZUVkaXRvci5vbkRpZENoYW5nZU1vZGVsKCgpID0+IHtcblx0XHRcdFx0dGhpcy5zZXRDb2RlRWRpdG9yKG51bGwpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yTGlzdGVuZXJzLmFkZCh0aGlzLl9jb2RlRWRpdG9yLm9uRGlkRm9jdXNFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9mb2N1c1RyYWNrZXIub25HYWluZWRGb2N1cygpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fY29kZUVkaXRvckxpc3RlbmVycy5hZGQodGhpcy5fY29kZUVkaXRvci5vbkRpZEJsdXJFZGl0b3JXaWRnZXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLl9mb2N1c1RyYWNrZXIub25Mb3N0Rm9jdXMoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0bGV0IG5leHRTZWxlY3Rpb25DaGFuZ2VTb3VyY2U6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRcdFx0dGhpcy5fY29kZUVkaXRvckxpc3RlbmVycy5hZGQodGhpcy5fbWFpblRocmVhZERvY3VtZW50cy5vbklzQ2F1Z2h0VXBXaXRoQ29udGVudENoYW5nZXMoKHVyaSkgPT4ge1xuXHRcdFx0XHRpZiAodXJpLnRvU3RyaW5nKCkgPT09IHRoaXMuX21vZGVsLnVyaS50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2VsZWN0aW9uQ2hhbmdlU291cmNlID0gbmV4dFNlbGVjdGlvbkNoYW5nZVNvdXJjZTtcblx0XHRcdFx0XHRuZXh0U2VsZWN0aW9uQ2hhbmdlU291cmNlID0gbnVsbDtcblx0XHRcdFx0XHR0aGlzLl91cGRhdGVQcm9wZXJ0aWVzTm93KHNlbGVjdGlvbkNoYW5nZVNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgaXNWYWxpZENvZGVFZGl0b3IgPSAoKSA9PiB7XG5cdFx0XHRcdC8vIER1ZSB0byBldmVudCB0aW1pbmdzLCBpdCBpcyBwb3NzaWJsZSB0aGF0IHRoZXJlIGlzIGEgbW9kZWwgY2hhbmdlIGV2ZW50IG5vdCB5ZXQgZGVsaXZlcmVkIHRvIHVzLlxuXHRcdFx0XHQvLyA+IGUuZy4gYSBtb2RlbCBjaGFuZ2UgZXZlbnQgaXMgZW1pdHRlZCB0byBhIGxpc3RlbmVyIHdoaWNoIHRoZW4gZGVjaWRlcyB0byB1cGRhdGUgZWRpdG9yIG9wdGlvbnNcblx0XHRcdFx0Ly8gPiBJbiB0aGlzIGNhc2UgdGhlIGVkaXRvciBjb25maWd1cmF0aW9uIGNoYW5nZSBldmVudCByZWFjaGVzIHVzIGZpcnN0LlxuXHRcdFx0XHQvLyBTbyBzaW1wbHkgY2hlY2sgdGhhdCB0aGUgbW9kZWwgaXMgc3RpbGwgYXR0YWNoZWQgdG8gdGhpcyBjb2RlIGVkaXRvclxuXHRcdFx0XHRyZXR1cm4gKHRoaXMuX2NvZGVFZGl0b3IgJiYgdGhpcy5fY29kZUVkaXRvci5nZXRNb2RlbCgpID09PSB0aGlzLl9tb2RlbCk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB1cGRhdGVQcm9wZXJ0aWVzID0gKHNlbGVjdGlvbkNoYW5nZVNvdXJjZTogc3RyaW5nIHwgbnVsbCkgPT4ge1xuXHRcdFx0XHQvLyBTb21lIGVkaXRvciBldmVudHMgZ2V0IGRlbGl2ZXJlZCBmYXN0ZXIgdGhhbiBtb2RlbCBjb250ZW50IGNoYW5nZXMuIFRoaXMgaXNcblx0XHRcdFx0Ly8gcHJvYmxlbWF0aWMsIGFzIHRoaXMgbGVhZHMgdG8gZWRpdG9yIHByb3BlcnRpZXMgcmVhY2hpbmcgdGhlIGV4dGVuc2lvbiBob3N0XG5cdFx0XHRcdC8vIHRvbyBzb29uLCBiZWZvcmUgdGhlIG1vZGVsIGNvbnRlbnQgY2hhbmdlIHRoYXQgd2FzIHRoZSByb290IGNhdXNlLlxuXHRcdFx0XHQvL1xuXHRcdFx0XHQvLyBJZiB0aGlzIGNhc2UgaXMgaWRlbnRpZmllZCwgdGhlbiBsZXQncyB1cGRhdGUgZWRpdG9yIHByb3BlcnRpZXMgb24gdGhlIG5leHQgbW9kZWxcblx0XHRcdFx0Ly8gY29udGVudCBjaGFuZ2UgaW5zdGVhZC5cblx0XHRcdFx0aWYgKHRoaXMuX21haW5UaHJlYWREb2N1bWVudHMuaXNDYXVnaHRVcFdpdGhDb250ZW50Q2hhbmdlcyh0aGlzLl9tb2RlbC51cmkpKSB7XG5cdFx0XHRcdFx0bmV4dFNlbGVjdGlvbkNoYW5nZVNvdXJjZSA9IG51bGw7XG5cdFx0XHRcdFx0dGhpcy5fdXBkYXRlUHJvcGVydGllc05vdyhzZWxlY3Rpb25DaGFuZ2VTb3VyY2UpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIHVwZGF0ZSBlZGl0b3IgcHJvcGVydGllcyBvbiB0aGUgbmV4dCBtb2RlbCBjb250ZW50IGNoYW5nZVxuXHRcdFx0XHRcdG5leHRTZWxlY3Rpb25DaGFuZ2VTb3VyY2UgPSBzZWxlY3Rpb25DaGFuZ2VTb3VyY2U7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdHRoaXMuX2NvZGVFZGl0b3JMaXN0ZW5lcnMuYWRkKHRoaXMuX2NvZGVFZGl0b3Iub25EaWRDaGFuZ2VDdXJzb3JTZWxlY3Rpb24oKGUpID0+IHtcblx0XHRcdFx0Ly8gc2VsZWN0aW9uXG5cdFx0XHRcdGlmICghaXNWYWxpZENvZGVFZGl0b3IoKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR1cGRhdGVQcm9wZXJ0aWVzKGUuc291cmNlKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX2NvZGVFZGl0b3JMaXN0ZW5lcnMuYWRkKHRoaXMuX2NvZGVFZGl0b3Iub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKChlKSA9PiB7XG5cdFx0XHRcdC8vIG9wdGlvbnNcblx0XHRcdFx0aWYgKCFpc1ZhbGlkQ29kZUVkaXRvcigpKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHVwZGF0ZVByb3BlcnRpZXMobnVsbCk7XG5cdFx0XHR9KSk7XG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yTGlzdGVuZXJzLmFkZCh0aGlzLl9jb2RlRWRpdG9yLm9uRGlkTGF5b3V0Q2hhbmdlKCgpID0+IHtcblx0XHRcdFx0Ly8gdmlzaWJsZVJhbmdlc1xuXHRcdFx0XHRpZiAoIWlzVmFsaWRDb2RlRWRpdG9yKCkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0dXBkYXRlUHJvcGVydGllcyhudWxsKTtcblx0XHRcdH0pKTtcblx0XHRcdHRoaXMuX2NvZGVFZGl0b3JMaXN0ZW5lcnMuYWRkKHRoaXMuX2NvZGVFZGl0b3Iub25EaWRTY3JvbGxDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0XHQvLyB2aXNpYmxlUmFuZ2VzXG5cdFx0XHRcdGlmICghaXNWYWxpZENvZGVFZGl0b3IoKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR1cGRhdGVQcm9wZXJ0aWVzKG51bGwpO1xuXHRcdFx0fSkpO1xuXHRcdFx0dGhpcy5fdXBkYXRlUHJvcGVydGllc05vdyhudWxsKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgaXNWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2NvZGVFZGl0b3I7XG5cdH1cblxuXHRwdWJsaWMgZ2V0UHJvcGVydGllcygpOiBNYWluVGhyZWFkVGV4dEVkaXRvclByb3BlcnRpZXMge1xuXHRcdHJldHVybiB0aGlzLl9wcm9wZXJ0aWVzITtcblx0fVxuXG5cdHB1YmxpYyBnZXQgb25Qcm9wZXJ0aWVzQ2hhbmdlZCgpOiBFdmVudDxJRWRpdG9yUHJvcGVydGllc0NoYW5nZURhdGE+IHtcblx0XHRyZXR1cm4gdGhpcy5fb25Qcm9wZXJ0aWVzQ2hhbmdlZC5ldmVudDtcblx0fVxuXG5cdHB1YmxpYyBzZXRTZWxlY3Rpb25zKHNlbGVjdGlvbnM6IElTZWxlY3Rpb25bXSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jb2RlRWRpdG9yKSB7XG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yLnNldFNlbGVjdGlvbnMoc2VsZWN0aW9ucyk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV3U2VsZWN0aW9ucyA9IHNlbGVjdGlvbnMubWFwKFNlbGVjdGlvbi5saWZ0U2VsZWN0aW9uKTtcblx0XHR0aGlzLl9zZXRQcm9wZXJ0aWVzKFxuXHRcdFx0bmV3IE1haW5UaHJlYWRUZXh0RWRpdG9yUHJvcGVydGllcyhuZXdTZWxlY3Rpb25zLCB0aGlzLl9wcm9wZXJ0aWVzIS5vcHRpb25zLCB0aGlzLl9wcm9wZXJ0aWVzIS52aXNpYmxlUmFuZ2VzKSxcblx0XHRcdG51bGxcblx0XHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0SW5kZW50Q29uZmlndXJhdGlvbihuZXdDb25maWd1cmF0aW9uOiBJVGV4dEVkaXRvckNvbmZpZ3VyYXRpb25VcGRhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBjcmVhdGlvbk9wdHMgPSB0aGlzLl9tb2RlbFNlcnZpY2UuZ2V0Q3JlYXRpb25PcHRpb25zKHRoaXMuX21vZGVsLmdldExhbmd1YWdlSWQoKSwgdGhpcy5fbW9kZWwudXJpLCB0aGlzLl9tb2RlbC5pc0ZvclNpbXBsZVdpZGdldCk7XG5cblx0XHRpZiAobmV3Q29uZmlndXJhdGlvbi50YWJTaXplID09PSAnYXV0bycgfHwgbmV3Q29uZmlndXJhdGlvbi5pbnNlcnRTcGFjZXMgPT09ICdhdXRvJykge1xuXHRcdFx0Ly8gb25lIG9mIHRoZSBvcHRpb25zIHdhcyBzZXQgdG8gJ2F1dG8nID0+IGRldGVjdCBpbmRlbnRhdGlvblxuXHRcdFx0bGV0IGluc2VydFNwYWNlcyA9IGNyZWF0aW9uT3B0cy5pbnNlcnRTcGFjZXM7XG5cdFx0XHRsZXQgdGFiU2l6ZSA9IGNyZWF0aW9uT3B0cy50YWJTaXplO1xuXG5cdFx0XHRpZiAobmV3Q29uZmlndXJhdGlvbi5pbnNlcnRTcGFjZXMgIT09ICdhdXRvJyAmJiB0eXBlb2YgbmV3Q29uZmlndXJhdGlvbi5pbnNlcnRTcGFjZXMgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdGluc2VydFNwYWNlcyA9IG5ld0NvbmZpZ3VyYXRpb24uaW5zZXJ0U3BhY2VzO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAobmV3Q29uZmlndXJhdGlvbi50YWJTaXplICE9PSAnYXV0bycgJiYgdHlwZW9mIG5ld0NvbmZpZ3VyYXRpb24udGFiU2l6ZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0dGFiU2l6ZSA9IG5ld0NvbmZpZ3VyYXRpb24udGFiU2l6ZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5fbW9kZWwuZGV0ZWN0SW5kZW50YXRpb24oaW5zZXJ0U3BhY2VzLCB0YWJTaXplKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBuZXdPcHRzOiBJVGV4dE1vZGVsVXBkYXRlT3B0aW9ucyA9IHt9O1xuXHRcdGlmICh0eXBlb2YgbmV3Q29uZmlndXJhdGlvbi5pbnNlcnRTcGFjZXMgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRuZXdPcHRzLmluc2VydFNwYWNlcyA9IG5ld0NvbmZpZ3VyYXRpb24uaW5zZXJ0U3BhY2VzO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIG5ld0NvbmZpZ3VyYXRpb24udGFiU2l6ZSAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdG5ld09wdHMudGFiU2l6ZSA9IG5ld0NvbmZpZ3VyYXRpb24udGFiU2l6ZTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBuZXdDb25maWd1cmF0aW9uLmluZGVudFNpemUgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRuZXdPcHRzLmluZGVudFNpemUgPSBuZXdDb25maWd1cmF0aW9uLmluZGVudFNpemU7XG5cdFx0fVxuXHRcdHRoaXMuX21vZGVsLnVwZGF0ZU9wdGlvbnMobmV3T3B0cyk7XG5cdH1cblxuXHRwdWJsaWMgc2V0Q29uZmlndXJhdGlvbihuZXdDb25maWd1cmF0aW9uOiBJVGV4dEVkaXRvckNvbmZpZ3VyYXRpb25VcGRhdGUpOiB2b2lkIHtcblx0XHR0aGlzLl9zZXRJbmRlbnRDb25maWd1cmF0aW9uKG5ld0NvbmZpZ3VyYXRpb24pO1xuXG5cdFx0aWYgKCF0aGlzLl9jb2RlRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG5ld0NvbmZpZ3VyYXRpb24uY3Vyc29yU3R5bGUpIHtcblx0XHRcdGNvbnN0IG5ld0N1cnNvclN0eWxlID0gY3Vyc29yU3R5bGVUb1N0cmluZyhuZXdDb25maWd1cmF0aW9uLmN1cnNvclN0eWxlKTtcblx0XHRcdHRoaXMuX2NvZGVFZGl0b3IudXBkYXRlT3B0aW9ucyh7XG5cdFx0XHRcdGN1cnNvclN0eWxlOiBuZXdDdXJzb3JTdHlsZVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiBuZXdDb25maWd1cmF0aW9uLmxpbmVOdW1iZXJzICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0bGV0IGxpbmVOdW1iZXJzOiAnb24nIHwgJ29mZicgfCAncmVsYXRpdmUnIHwgJ2ludGVydmFsJztcblx0XHRcdHN3aXRjaCAobmV3Q29uZmlndXJhdGlvbi5saW5lTnVtYmVycykge1xuXHRcdFx0XHRjYXNlIFJlbmRlckxpbmVOdW1iZXJzVHlwZS5Pbjpcblx0XHRcdFx0XHRsaW5lTnVtYmVycyA9ICdvbic7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgUmVuZGVyTGluZU51bWJlcnNUeXBlLlJlbGF0aXZlOlxuXHRcdFx0XHRcdGxpbmVOdW1iZXJzID0gJ3JlbGF0aXZlJztcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBSZW5kZXJMaW5lTnVtYmVyc1R5cGUuSW50ZXJ2YWw6XG5cdFx0XHRcdFx0bGluZU51bWJlcnMgPSAnaW50ZXJ2YWwnO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGxpbmVOdW1iZXJzID0gJ29mZic7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yLnVwZGF0ZU9wdGlvbnMoe1xuXHRcdFx0XHRsaW5lTnVtYmVyczogbGluZU51bWJlcnNcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBzZXREZWNvcmF0aW9ucyhrZXk6IHN0cmluZywgcmFuZ2VzOiBJRGVjb3JhdGlvbk9wdGlvbnNbXSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fY29kZUVkaXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9jb2RlRWRpdG9yLnNldERlY29yYXRpb25zQnlUeXBlKCdleHRob3N0LWFwaScsIGtleSwgcmFuZ2VzKTtcblx0fVxuXG5cdHB1YmxpYyBzZXREZWNvcmF0aW9uc0Zhc3Qoa2V5OiBzdHJpbmcsIF9yYW5nZXM6IG51bWJlcltdKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb2RlRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJhbmdlczogUmFuZ2VbXSA9IFtdO1xuXHRcdGZvciAobGV0IGkgPSAwLCBsZW4gPSBNYXRoLmZsb29yKF9yYW5nZXMubGVuZ3RoIC8gNCk7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0cmFuZ2VzW2ldID0gbmV3IFJhbmdlKF9yYW5nZXNbNCAqIGldLCBfcmFuZ2VzWzQgKiBpICsgMV0sIF9yYW5nZXNbNCAqIGkgKyAyXSwgX3Jhbmdlc1s0ICogaSArIDNdKTtcblx0XHR9XG5cdFx0dGhpcy5fY29kZUVkaXRvci5zZXREZWNvcmF0aW9uc0J5VHlwZUZhc3Qoa2V5LCByYW5nZXMpO1xuXHR9XG5cblx0cHVibGljIHJldmVhbFJhbmdlKHJhbmdlOiBJUmFuZ2UsIHJldmVhbFR5cGU6IFRleHRFZGl0b3JSZXZlYWxUeXBlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jb2RlRWRpdG9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHN3aXRjaCAocmV2ZWFsVHlwZSkge1xuXHRcdFx0Y2FzZSBUZXh0RWRpdG9yUmV2ZWFsVHlwZS5EZWZhdWx0OlxuXHRcdFx0XHR0aGlzLl9jb2RlRWRpdG9yLnJldmVhbFJhbmdlKHJhbmdlLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBUZXh0RWRpdG9yUmV2ZWFsVHlwZS5JbkNlbnRlcjpcblx0XHRcdFx0dGhpcy5fY29kZUVkaXRvci5yZXZlYWxSYW5nZUluQ2VudGVyKHJhbmdlLCBTY3JvbGxUeXBlLlNtb290aCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBUZXh0RWRpdG9yUmV2ZWFsVHlwZS5JbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0OlxuXHRcdFx0XHR0aGlzLl9jb2RlRWRpdG9yLnJldmVhbFJhbmdlSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChyYW5nZSwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgVGV4dEVkaXRvclJldmVhbFR5cGUuQXRUb3A6XG5cdFx0XHRcdHRoaXMuX2NvZGVFZGl0b3IucmV2ZWFsUmFuZ2VBdFRvcChyYW5nZSwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdGNvbnNvbGUud2FybihgVW5rbm93biByZXZlYWxUeXBlOiAke3JldmVhbFR5cGV9YCk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblx0fVxuXG5cdHB1YmxpYyBpc0ZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX2NvZGVFZGl0b3IpIHtcblx0XHRcdHJldHVybiB0aGlzLl9jb2RlRWRpdG9yLmhhc1RleHRGb2N1cygpO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwdWJsaWMgbWF0Y2hlcyhlZGl0b3I6IElFZGl0b3JQYW5lKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIGVkaXRvci5nZXRDb250cm9sKCkgPT09IHRoaXMuX2NvZGVFZGl0b3I7XG5cdH1cblxuXHRwdWJsaWMgYXBwbHlFZGl0cyh2ZXJzaW9uSWRDaGVjazogbnVtYmVyLCBlZGl0czogSVNpbmdsZUVkaXRPcGVyYXRpb25bXSwgb3B0czogSUFwcGx5RWRpdHNPcHRpb25zKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX21vZGVsLmdldFZlcnNpb25JZCgpICE9PSB2ZXJzaW9uSWRDaGVjaykge1xuXHRcdFx0Ly8gdGhyb3cgbmV3IEVycm9yKCdNb2RlbCBoYXMgY2hhbmdlZCBpbiB0aGUgbWVhbnRpbWUhJyk7XG5cdFx0XHQvLyBtb2RlbCBjaGFuZ2VkIGluIHRoZSBtZWFudGltZVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5fY29kZUVkaXRvcikge1xuXHRcdFx0Ly8gY29uc29sZS53YXJuKCdhcHBseUVkaXRzIG9uIGludmlzaWJsZSBlZGl0b3InKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIG9wdHMuc2V0RW5kT2ZMaW5lICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0dGhpcy5fbW9kZWwucHVzaEVPTChvcHRzLnNldEVuZE9mTGluZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHJhbnNmb3JtZWRFZGl0cyA9IGVkaXRzLm1hcCgoZWRpdCk6IElTaW5nbGVFZGl0T3BlcmF0aW9uID0+IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJhbmdlOiBSYW5nZS5saWZ0KGVkaXQucmFuZ2UpLFxuXHRcdFx0XHR0ZXh0OiBlZGl0LnRleHQsXG5cdFx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IGVkaXQuZm9yY2VNb3ZlTWFya2Vyc1xuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdGlmIChvcHRzLnVuZG9TdG9wQmVmb3JlKSB7XG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdH1cblx0XHR0aGlzLl9jb2RlRWRpdG9yLmV4ZWN1dGVFZGl0cygnTWFpblRocmVhZFRleHRFZGl0b3InLCB0cmFuc2Zvcm1lZEVkaXRzKTtcblx0XHRpZiAob3B0cy51bmRvU3RvcEFmdGVyKSB7XG5cdFx0XHR0aGlzLl9jb2RlRWRpdG9yLnB1c2hVbmRvU3RvcCgpO1xuXHRcdH1cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGFzeW5jIGluc2VydFNuaXBwZXQobW9kZWxWZXJzaW9uSWQ6IG51bWJlciwgdGVtcGxhdGU6IHN0cmluZywgcmFuZ2VzOiByZWFkb25seSBJUmFuZ2VbXSwgb3B0czogSVNuaXBwZXRPcHRpb25zKSB7XG5cblx0XHRpZiAoIXRoaXMuX2NvZGVFZGl0b3IgfHwgIXRoaXMuX2NvZGVFZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIGNoZWNrIGlmIGNsaXBib2FyZCBpcyByZXF1aXJlZCBhbmQgb25seSBpZmYgcmVhZCBpdCAoYXN5bmMpXG5cdFx0bGV0IGNsaXBib2FyZFRleHQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBuZWVkc1RlbXBsYXRlID0gU25pcHBldFBhcnNlci5ndWVzc05lZWRzQ2xpcGJvYXJkKHRlbXBsYXRlKTtcblx0XHRpZiAobmVlZHNUZW1wbGF0ZSkge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBuZXcgRWRpdG9yU3RhdGUodGhpcy5fY29kZUVkaXRvciwgQ29kZUVkaXRvclN0YXRlRmxhZy5WYWx1ZSB8IENvZGVFZGl0b3JTdGF0ZUZsYWcuUG9zaXRpb24pO1xuXHRcdFx0Y2xpcGJvYXJkVGV4dCA9IGF3YWl0IHRoaXMuX2NsaXBib2FyZFNlcnZpY2UucmVhZFRleHQoKTtcblx0XHRcdGlmICghc3RhdGUudmFsaWRhdGUodGhpcy5fY29kZUVkaXRvcikpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0aGlzLl9jb2RlRWRpdG9yLmdldE1vZGVsKCkuZ2V0VmVyc2lvbklkKCkgIT09IG1vZGVsVmVyc2lvbklkKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc25pcHBldENvbnRyb2xsZXIgPSBTbmlwcGV0Q29udHJvbGxlcjIuZ2V0KHRoaXMuX2NvZGVFZGl0b3IpO1xuXHRcdGlmICghc25pcHBldENvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLl9jb2RlRWRpdG9yLmZvY3VzKCk7XG5cblx0XHQvLyBtYWtlIG1vZGlmaWNhdGlvbnMgYXMgc25pcHBldCBlZGl0XG5cdFx0Y29uc3QgZWRpdHM6IElTbmlwcGV0RWRpdFtdID0gcmFuZ2VzLm1hcChyYW5nZSA9PiAoeyByYW5nZTogUmFuZ2UubGlmdChyYW5nZSksIHRlbXBsYXRlIH0pKTtcblx0XHRzbmlwcGV0Q29udHJvbGxlci5hcHBseShlZGl0cywge1xuXHRcdFx0b3ZlcndyaXRlQmVmb3JlOiAwLCBvdmVyd3JpdGVBZnRlcjogMCxcblx0XHRcdHVuZG9TdG9wQmVmb3JlOiBvcHRzLnVuZG9TdG9wQmVmb3JlLCB1bmRvU3RvcEFmdGVyOiBvcHRzLnVuZG9TdG9wQWZ0ZXIsXG5cdFx0XHRhZGp1c3RXaGl0ZXNwYWNlOiAhb3B0cy5rZWVwV2hpdGVzcGFjZSxcblx0XHRcdGNsaXBib2FyZFRleHRcblx0XHR9KTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsdUJBQXVCLHVCQUF1QixxQkFBcUIsb0JBQW9CO0FBQ2hHLFNBQWlCLGFBQWE7QUFDOUIsU0FBcUIsaUJBQWlCO0FBQ3RDLFNBQTZCLGtC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
