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
import { groupBy } from "../../../../base/common/arrays.js";
import { CharCode } from "../../../../base/common/charCode.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { getLeadingWhitespace } from "../../../../base/common/strings.js";
import "./snippetSession.css";
import { EditorOption } from "../../../common/config/editorOptions.js";
import { EditOperation } from "../../../common/core/editOperation.js";
import { Range } from "../../../common/core/range.js";
import { Selection, SelectionDirection } from "../../../common/core/selection.js";
import { ILanguageConfigurationService } from "../../../common/languages/languageConfigurationRegistry.js";
import { TrackedRangeStickiness } from "../../../common/model.js";
import { ModelDecorationOptions } from "../../../common/model/textModel.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { Choice, Placeholder, SnippetParser, Text, TextmateSnippet, Variable } from "./snippetParser.js";
import { ClipboardBasedVariableResolver, CommentBasedVariableResolver, CompositeSnippetVariableResolver, ModelBasedVariableResolver, RandomBasedVariableResolver, SelectionBasedVariableResolver, TimeBasedVariableResolver, WorkspaceBasedVariableResolver } from "./snippetVariables.js";
import { EditSources } from "../../../common/textModelEditSource.js";
const _OneSnippet = class _OneSnippet {
  constructor(_editor, _snippet, _snippetLineLeadingWhitespace) {
    this._editor = _editor;
    this._snippet = _snippet;
    this._snippetLineLeadingWhitespace = _snippetLineLeadingWhitespace;
    this._offset = -1;
    this._nestingLevel = 1;
    this._placeholderGroups = groupBy(_snippet.placeholders, Placeholder.compareByIndex);
    this._placeholderGroupsIdx = -1;
  }
  initialize(textChange) {
    this._offset = textChange.newPosition;
  }
  dispose() {
    if (this._placeholderDecorations) {
      this._editor.removeDecorations([...this._placeholderDecorations.values()]);
    }
    this._placeholderGroups.length = 0;
  }
  _initDecorations() {
    if (this._offset === -1) {
      throw new Error(`Snippet not initialized!`);
    }
    if (this._placeholderDecorations) {
      return;
    }
    this._placeholderDecorations = /* @__PURE__ */ new Map();
    const model = this._editor.getModel();
    this._editor.changeDecorations((accessor) => {
      for (const placeholder of this._snippet.placeholders) {
        const placeholderOffset = this._snippet.offset(placeholder);
        const placeholderLen = this._snippet.fullLen(placeholder);
        const range = Range.fromPositions(
          model.getPositionAt(this._offset + placeholderOffset),
          model.getPositionAt(this._offset + placeholderOffset + placeholderLen)
        );
        const options = placeholder.isFinalTabstop ? _OneSnippet._decor.inactiveFinal : _OneSnippet._decor.inactive;
        const handle = accessor.addDecoration(range, options);
        this._placeholderDecorations.set(placeholder, handle);
      }
    });
  }
  move(fwd) {
    if (!this._editor.hasModel()) {
      return [];
    }
    this._initDecorations();
    const model = this._editor.getModel();
    if (this._placeholderGroupsIdx >= 0) {
      const operations = [];
      for (const placeholder of this._placeholderGroups[this._placeholderGroupsIdx]) {
        if (placeholder.transform) {
          const id = this._placeholderDecorations.get(placeholder);
          const range = id ? model.getDecorationRange(id) : null;
          if (range) {
            const currentValue = model.getValueInRange(range);
            const transformedValueLines = placeholder.transform.resolve(currentValue).split(/\r\n|\r|\n/);
            for (let i = 1; i < transformedValueLines.length; i++) {
              transformedValueLines[i] = model.normalizeIndentation(this._snippetLineLeadingWhitespace + transformedValueLines[i]);
            }
            operations.push(EditOperation.replace(range, transformedValueLines.join(model.getEOL())));
          }
        }
      }
      if (operations.length > 0) {
        this._editor.executeEdits("snippet.placeholderTransform", operations);
      }
    }
    let couldSkipThisPlaceholder = false;
    if (fwd === true && this._placeholderGroupsIdx < this._placeholderGroups.length - 1) {
      this._placeholderGroupsIdx += 1;
      couldSkipThisPlaceholder = true;
    } else if (fwd === false && this._placeholderGroupsIdx > 0) {
      this._placeholderGroupsIdx -= 1;
      couldSkipThisPlaceholder = true;
    } else {
    }
    const newSelections = model.changeDecorations((accessor) => {
      const activePlaceholders = /* @__PURE__ */ new Set();
      const selections = [];
      for (const placeholder of this._placeholderGroups[this._placeholderGroupsIdx]) {
        const id = this._placeholderDecorations.get(placeholder);
        const range = id ? model.getDecorationRange(id) : null;
        couldSkipThisPlaceholder = couldSkipThisPlaceholder && this._hasPlaceholderBeenCollapsed(placeholder);
        if (!id || !range) {
          continue;
        }
        selections.push(new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn));
        accessor.changeDecorationOptions(id, placeholder.isFinalTabstop ? _OneSnippet._decor.activeFinal : _OneSnippet._decor.active);
        activePlaceholders.add(placeholder);
        for (const enclosingPlaceholder of this._snippet.enclosingPlaceholders(placeholder)) {
          const id2 = this._placeholderDecorations.get(enclosingPlaceholder);
          if (id2) {
            accessor.changeDecorationOptions(id2, enclosingPlaceholder.isFinalTabstop ? _OneSnippet._decor.activeFinal : _OneSnippet._decor.active);
            activePlaceholders.add(enclosingPlaceholder);
          }
        }
      }
      for (const [placeholder, id] of this._placeholderDecorations) {
        if (!activePlaceholders.has(placeholder)) {
          accessor.changeDecorationOptions(id, placeholder.isFinalTabstop ? _OneSnippet._decor.inactiveFinal : _OneSnippet._decor.inactive);
        }
      }
      return selections;
    });
    return !couldSkipThisPlaceholder ? newSelections ?? [] : this.move(fwd);
  }
  _hasPlaceholderBeenCollapsed(placeholder) {
    const model = this._editor.getModel();
    let marker = placeholder;
    while (marker) {
      if (marker instanceof Placeholder) {
        const id = this._placeholderDecorations.get(marker);
        const range = id ? model.getDecorationRange(id) : null;
        if ((!range || range.isEmpty()) && marker.toString().length > 0) {
          return true;
        }
      }
      marker = marker.parent;
    }
    return false;
  }
  get isAtFirstPlaceholder() {
    return this._placeholderGroupsIdx <= 0 || this._placeholderGroups.length === 0;
  }
  get isAtLastPlaceholder() {
    return this._placeholderGroupsIdx === this._placeholderGroups.length - 1;
  }
  get hasPlaceholder() {
    return this._snippet.placeholders.length > 0;
  }
  /**
   * A snippet is trivial when it has no placeholder or only a final placeholder at
   * its very end
   */
  get isTrivialSnippet() {
    if (this._snippet.placeholders.length === 0) {
      return true;
    }
    if (this._snippet.placeholders.length === 1) {
      const [placeholder] = this._snippet.placeholders;
      if (placeholder.isFinalTabstop) {
        if (this._snippet.rightMostDescendant === placeholder) {
          return true;
        }
      }
    }
    return false;
  }
  computePossibleSelections() {
    const result = /* @__PURE__ */ new Map();
    for (const placeholdersWithEqualIndex of this._placeholderGroups) {
      let ranges;
      for (const placeholder of placeholdersWithEqualIndex) {
        if (placeholder.isFinalTabstop) {
          break;
        }
        if (!ranges) {
          ranges = [];
          result.set(placeholder.index, ranges);
        }
        const id = this._placeholderDecorations.get(placeholder);
        const range = this._editor.getModel().getDecorationRange(id);
        if (!range) {
          result.delete(placeholder.index);
          break;
        }
        ranges.push(range);
      }
    }
    return result;
  }
  get activeChoice() {
    if (!this._placeholderDecorations) {
      return void 0;
    }
    const placeholder = this._placeholderGroups[this._placeholderGroupsIdx][0];
    if (!placeholder?.choice) {
      return void 0;
    }
    const id = this._placeholderDecorations.get(placeholder);
    if (!id) {
      return void 0;
    }
    const range = this._editor.getModel().getDecorationRange(id);
    if (!range) {
      return void 0;
    }
    return { range, choice: placeholder.choice };
  }
  get hasChoice() {
    let result = false;
    this._snippet.walk((marker) => {
      result = marker instanceof Choice;
      return !result;
    });
    return result;
  }
  get activePlaceholderCount() {
    return this._placeholderGroupsIdx < 0 ? 0 : this._placeholderGroups[this._placeholderGroupsIdx].length;
  }
  merge(others) {
    const model = this._editor.getModel();
    this._nestingLevel *= 10;
    this._editor.changeDecorations((accessor) => {
      for (const placeholder of this._placeholderGroups[this._placeholderGroupsIdx]) {
        const nested = others.shift();
        console.assert(nested._offset !== -1);
        console.assert(!nested._placeholderDecorations);
        const indexLastPlaceholder = nested._snippet.placeholderInfo.last.index;
        for (const nestedPlaceholder of nested._snippet.placeholderInfo.all) {
          if (nestedPlaceholder.isFinalTabstop) {
            nestedPlaceholder.index = placeholder.index + (indexLastPlaceholder + 1) / this._nestingLevel;
          } else {
            nestedPlaceholder.index = placeholder.index + nestedPlaceholder.index / this._nestingLevel;
          }
        }
        this._snippet.replace(placeholder, nested._snippet.children);
        const id = this._placeholderDecorations.get(placeholder);
        accessor.removeDecoration(id);
        this._placeholderDecorations.delete(placeholder);
        for (const placeholder2 of nested._snippet.placeholders) {
          const placeholderOffset = nested._snippet.offset(placeholder2);
          const placeholderLen = nested._snippet.fullLen(placeholder2);
          const range = Range.fromPositions(
            model.getPositionAt(nested._offset + placeholderOffset),
            model.getPositionAt(nested._offset + placeholderOffset + placeholderLen)
          );
          const handle = accessor.addDecoration(range, _OneSnippet._decor.inactive);
          this._placeholderDecorations.set(placeholder2, handle);
        }
      }
      this._renormalizePlaceholderIndices();
      this._placeholderGroups = groupBy(this._snippet.placeholders, Placeholder.compareByIndex);
    });
  }
  _renormalizePlaceholderIndices() {
    const placeholders = this._snippet.placeholders;
    const uniqueIndices = /* @__PURE__ */ new Set();
    for (const placeholder of placeholders) {
      if (!placeholder.isFinalTabstop) {
        uniqueIndices.add(placeholder.index);
      }
    }
    const sorted = [...uniqueIndices].sort((a, b) => a - b);
    const remap = /* @__PURE__ */ new Map();
    for (let i = 0; i < sorted.length; i++) {
      remap.set(sorted[i], i + 1);
    }
    for (const placeholder of placeholders) {
      if (!placeholder.isFinalTabstop) {
        placeholder.index = remap.get(placeholder.index);
      }
    }
    this._nestingLevel = 1;
  }
  getEnclosingRange() {
    let result;
    const model = this._editor.getModel();
    for (const decorationId of this._placeholderDecorations.values()) {
      const placeholderRange = model.getDecorationRange(decorationId) ?? void 0;
      if (!result) {
        result = placeholderRange;
      } else {
        result = result.plusRange(placeholderRange);
      }
    }
    return result;
  }
};
_OneSnippet._decor = {
  active: ModelDecorationOptions.register({ description: "snippet-placeholder-1", stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges, className: "snippet-placeholder" }),
  inactive: ModelDecorationOptions.register({ description: "snippet-placeholder-2", stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, className: "snippet-placeholder" }),
  activeFinal: ModelDecorationOptions.register({ description: "snippet-placeholder-3", stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, className: "finish-snippet-placeholder" }),
  inactiveFinal: ModelDecorationOptions.register({ description: "snippet-placeholder-4", stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges, className: "finish-snippet-placeholder" })
};
let OneSnippet = _OneSnippet;
const _defaultOptions = {
  overwriteBefore: 0,
  overwriteAfter: 0,
  adjustWhitespace: true,
  clipboardText: void 0,
  overtypingCapturer: void 0
};
let SnippetSession = class {
  constructor(_editor, _template, _options = _defaultOptions, _languageConfigurationService) {
    this._editor = _editor;
    this._template = _template;
    this._options = _options;
    this._languageConfigurationService = _languageConfigurationService;
    this._templateMerges = [];
    this._snippets = [];
  }
  static adjustWhitespace(model, position, adjustIndentation, snippet, filter) {
    const line = model.getLineContent(position.lineNumber);
    const lineLeadingWhitespace = getLeadingWhitespace(line, 0, position.column - 1);
    let snippetTextString;
    snippet.walk((marker) => {
      if (!(marker instanceof Text) || marker.parent instanceof Choice) {
        return true;
      }
      if (filter && !filter.has(marker)) {
        return true;
      }
      const lines = marker.value.split(/\r\n|\r|\n/);
      if (adjustIndentation) {
        const offset = snippet.offset(marker);
        if (offset === 0) {
          lines[0] = model.normalizeIndentation(lines[0]);
        } else {
          snippetTextString = snippetTextString ?? snippet.toString();
          const prevChar = snippetTextString.charCodeAt(offset - 1);
          if (prevChar === CharCode.LineFeed || prevChar === CharCode.CarriageReturn) {
            lines[0] = model.normalizeIndentation(lineLeadingWhitespace + lines[0]);
          }
        }
        for (let i = 1; i < lines.length; i++) {
          lines[i] = model.normalizeIndentation(lineLeadingWhitespace + lines[i]);
        }
      }
      const newValue = lines.join(model.getEOL());
      if (newValue !== marker.value) {
        marker.parent.replace(marker, [new Text(newValue)]);
        snippetTextString = void 0;
      }
      return true;
    });
    return lineLeadingWhitespace;
  }
  static adjustSelection(model, selection, overwriteBefore, overwriteAfter) {
    if (overwriteBefore !== 0 || overwriteAfter !== 0) {
      const { positionLineNumber, positionColumn } = selection;
      const positionColumnBefore = positionColumn - overwriteBefore;
      const positionColumnAfter = positionColumn + overwriteAfter;
      const range = model.validateRange({
        startLineNumber: positionLineNumber,
        startColumn: positionColumnBefore,
        endLineNumber: positionLineNumber,
        endColumn: positionColumnAfter
      });
      selection = Selection.createWithDirection(
        range.startLineNumber,
        range.startColumn,
        range.endLineNumber,
        range.endColumn,
        selection.getDirection()
      );
    }
    return selection;
  }
  static createEditsAndSnippetsFromSelections(editor, template, overwriteBefore, overwriteAfter, enforceFinalTabstop, adjustWhitespace, clipboardText, overtypingCapturer, languageConfigurationService) {
    const edits = [];
    const snippets = [];
    if (!editor.hasModel()) {
      return { edits, snippets };
    }
    const model = editor.getModel();
    const workspaceService = editor.invokeWithinContext((accessor) => accessor.get(IWorkspaceContextService));
    const modelBasedVariableResolver = editor.invokeWithinContext((accessor) => new ModelBasedVariableResolver(accessor.get(ILabelService), model));
    const readClipboardText = () => clipboardText;
    const firstBeforeText = model.getValueInRange(SnippetSession.adjustSelection(model, editor.getSelection(), overwriteBefore, 0));
    const firstAfterText = model.getValueInRange(SnippetSession.adjustSelection(model, editor.getSelection(), 0, overwriteAfter));
    const firstLineFirstNonWhitespace = model.getLineFirstNonWhitespaceColumn(editor.getSelection().positionLineNumber);
    const indexedSelections = editor.getSelections().map((selection, idx) => ({ selection, idx })).sort((a, b) => Range.compareRangesUsingStarts(a.selection, b.selection));
    for (const { selection, idx } of indexedSelections) {
      let extensionBefore = SnippetSession.adjustSelection(model, selection, overwriteBefore, 0);
      let extensionAfter = SnippetSession.adjustSelection(model, selection, 0, overwriteAfter);
      if (firstBeforeText !== model.getValueInRange(extensionBefore)) {
        extensionBefore = selection;
      }
      if (firstAfterText !== model.getValueInRange(extensionAfter)) {
        extensionAfter = selection;
      }
      const snippetSelection = selection.setStartPosition(extensionBefore.startLineNumber, extensionBefore.startColumn).setEndPosition(extensionAfter.endLineNumber, extensionAfter.endColumn);
      const snippet = new SnippetParser().parse(template, true, enforceFinalTabstop);
      const start = snippetSelection.getStartPosition();
      const snippetLineLeadingWhitespace = SnippetSession.adjustWhitespace(
        model,
        start,
        adjustWhitespace || idx > 0 && firstLineFirstNonWhitespace !== model.getLineFirstNonWhitespaceColumn(selection.positionLineNumber),
        snippet
      );
      snippet.resolveVariables(new CompositeSnippetVariableResolver([
        modelBasedVariableResolver,
        new ClipboardBasedVariableResolver(readClipboardText, idx, indexedSelections.length, editor.getOption(EditorOption.multiCursorPaste) === "spread"),
        new SelectionBasedVariableResolver(model, selection, idx, overtypingCapturer),
        new CommentBasedVariableResolver(model, selection, languageConfigurationService),
        new TimeBasedVariableResolver(),
        new WorkspaceBasedVariableResolver(workspaceService),
        new RandomBasedVariableResolver()
      ]));
      edits[idx] = EditOperation.replace(snippetSelection, snippet.toString());
      edits[idx].identifier = { major: idx, minor: 0 };
      edits[idx]._isTracked = true;
      snippets[idx] = new OneSnippet(editor, snippet, snippetLineLeadingWhitespace);
    }
    return { edits, snippets };
  }
  static createEditsAndSnippetsFromEdits(editor, snippetEdits, enforceFinalTabstop, adjustWhitespace, clipboardText, overtypingCapturer, languageConfigurationService) {
    if (!editor.hasModel() || snippetEdits.length === 0) {
      return { edits: [], snippets: [] };
    }
    const edits = [];
    const model = editor.getModel();
    const parser = new SnippetParser();
    const snippet = new TextmateSnippet();
    const modelBasedVariableResolver = editor.invokeWithinContext((accessor) => new ModelBasedVariableResolver(accessor.get(ILabelService), model));
    const timeBasedVariableResolver = new TimeBasedVariableResolver();
    const workspaceBasedVariableResolver = new WorkspaceBasedVariableResolver(editor.invokeWithinContext((accessor) => accessor.get(IWorkspaceContextService)));
    const randomBasedVariableResolver = new RandomBasedVariableResolver();
    const readClipboardText = () => clipboardText;
    const clipboardSpread = editor.getOption(EditorOption.multiCursorPaste) === "spread";
    const indexedSnippetEdits = snippetEdits.map((edit, idx) => ({ edit, idx })).sort((a, b) => Range.compareRangesUsingStarts(a.edit.range, b.edit.range));
    let offset = 0;
    for (let i = 0; i < indexedSnippetEdits.length; i++) {
      const { edit: { range, template, keepWhitespace }, idx } = indexedSnippetEdits[i];
      if (i > 0) {
        const lastRange = indexedSnippetEdits[i - 1].edit.range;
        const textRange = Range.fromPositions(lastRange.getEndPosition(), range.getStartPosition());
        const textNode = new Text(model.getValueInRange(textRange));
        snippet.appendChild(textNode);
        offset += textNode.value.length;
      }
      const preExistingVariables = /* @__PURE__ */ new Set();
      snippet.walk((marker) => {
        if (marker instanceof Variable) {
          preExistingVariables.add(marker);
        }
        return true;
      });
      const newNodes = parser.parseFragment(template, snippet);
      SnippetSession.adjustWhitespace(model, range.getStartPosition(), keepWhitespace !== void 0 ? !keepWhitespace : adjustWhitespace, snippet, new Set(newNodes));
      const editSelection = Selection.fromRange(range, SelectionDirection.LTR);
      const editResolver = new CompositeSnippetVariableResolver([
        modelBasedVariableResolver,
        new ClipboardBasedVariableResolver(readClipboardText, idx, indexedSnippetEdits.length, clipboardSpread),
        new SelectionBasedVariableResolver(model, editSelection, idx, overtypingCapturer),
        new CommentBasedVariableResolver(model, editSelection, languageConfigurationService),
        timeBasedVariableResolver,
        workspaceBasedVariableResolver,
        randomBasedVariableResolver
      ]);
      snippet.walk((marker) => {
        if (marker instanceof Variable && !preExistingVariables.has(marker)) {
          marker.resolve(editResolver);
        }
        return true;
      });
      const snippetText = snippet.toString();
      const snippetFragmentText = snippetText.slice(offset);
      offset = snippetText.length;
      const edit = EditOperation.replace(range, snippetFragmentText);
      edit.identifier = { major: i, minor: 0 };
      edit._isTracked = true;
      edits.push(edit);
    }
    parser.ensureFinalTabstop(snippet, enforceFinalTabstop, true);
    return {
      edits,
      snippets: [new OneSnippet(editor, snippet, "")]
    };
  }
  dispose() {
    dispose(this._snippets);
  }
  _logInfo() {
    return `template="${this._template}", merged_templates="${this._templateMerges.join(" -> ")}"`;
  }
  insert(editReason) {
    if (!this._editor.hasModel()) {
      return;
    }
    const { edits, snippets } = typeof this._template === "string" ? SnippetSession.createEditsAndSnippetsFromSelections(this._editor, this._template, this._options.overwriteBefore, this._options.overwriteAfter, false, this._options.adjustWhitespace, this._options.clipboardText, this._options.overtypingCapturer, this._languageConfigurationService) : SnippetSession.createEditsAndSnippetsFromEdits(this._editor, this._template, false, this._options.adjustWhitespace, this._options.clipboardText, this._options.overtypingCapturer, this._languageConfigurationService);
    this._snippets = snippets;
    this._editor.executeEdits(editReason ?? EditSources.snippet(), edits, (_undoEdits) => {
      const undoEdits = _undoEdits.filter((edit) => !!edit.identifier);
      for (let idx = 0; idx < snippets.length; idx++) {
        snippets[idx].initialize(undoEdits[idx].textChange);
      }
      if (this._snippets[0].hasPlaceholder) {
        return this._move(true);
      } else {
        return undoEdits.map((edit) => Selection.fromPositions(edit.range.getEndPosition()));
      }
    });
    this._editor.revealRange(this._editor.getSelections()[0]);
  }
  merge(template, options = _defaultOptions) {
    if (!this._editor.hasModel()) {
      return;
    }
    this._templateMerges.push([this._snippets[0]._nestingLevel, this._snippets[0]._placeholderGroupsIdx, template]);
    const { edits, snippets } = SnippetSession.createEditsAndSnippetsFromSelections(this._editor, template, options.overwriteBefore, options.overwriteAfter, true, options.adjustWhitespace, options.clipboardText, options.overtypingCapturer, this._languageConfigurationService);
    this._editor.executeEdits("snippet", edits, (_undoEdits) => {
      const undoEdits = _undoEdits.filter((edit) => !!edit.identifier);
      for (let idx = 0; idx < snippets.length; idx++) {
        snippets[idx].initialize(undoEdits[idx].textChange);
      }
      const isTrivialSnippet = snippets[0].isTrivialSnippet;
      const canMergeSnippets = snippets.length === this._snippets.reduce((count, snippet) => count + snippet.activePlaceholderCount, 0);
      if (!isTrivialSnippet && canMergeSnippets) {
        for (const snippet of this._snippets) {
          snippet.merge(snippets);
        }
        console.assert(snippets.length === 0);
      }
      if (this._snippets[0].hasPlaceholder && !isTrivialSnippet && canMergeSnippets) {
        return this._move(void 0);
      } else {
        return undoEdits.map((edit) => Selection.fromPositions(edit.range.getEndPosition()));
      }
    });
  }
  next() {
    const newSelections = this._move(true);
    if (newSelections.length > 0) {
      this._editor.setSelections(newSelections);
      this._editor.revealPositionInCenterIfOutsideViewport(newSelections[0].getPosition());
    }
  }
  prev() {
    const newSelections = this._move(false);
    if (newSelections.length > 0) {
      this._editor.setSelections(newSelections);
      this._editor.revealPositionInCenterIfOutsideViewport(newSelections[0].getPosition());
    }
  }
  _move(fwd) {
    const selections = [];
    for (const snippet of this._snippets) {
      const oneSelection = snippet.move(fwd);
      selections.push(...oneSelection);
    }
    return selections;
  }
  get isAtFirstPlaceholder() {
    return this._snippets[0].isAtFirstPlaceholder;
  }
  get isAtLastPlaceholder() {
    return this._snippets[0].isAtLastPlaceholder;
  }
  get hasPlaceholder() {
    return this._snippets[0].hasPlaceholder;
  }
  get hasChoice() {
    return this._snippets[0].hasChoice;
  }
  get activeChoice() {
    return this._snippets[0].activeChoice;
  }
  isSelectionWithinPlaceholders() {
    if (!this.hasPlaceholder) {
      return false;
    }
    const selections = this._editor.getSelections();
    if (selections.length < this._snippets.length) {
      return false;
    }
    const allPossibleSelections = /* @__PURE__ */ new Map();
    for (const snippet of this._snippets) {
      const possibleSelections = snippet.computePossibleSelections();
      if (allPossibleSelections.size === 0) {
        for (const [index, ranges] of possibleSelections) {
          ranges.sort(Range.compareRangesUsingStarts);
          for (const selection of selections) {
            if (ranges[0].containsRange(selection)) {
              allPossibleSelections.set(index, []);
              break;
            }
          }
        }
      }
      if (allPossibleSelections.size === 0) {
        return false;
      }
      allPossibleSelections.forEach((array, index) => {
        array.push(...possibleSelections.get(index));
      });
    }
    selections.sort(Range.compareRangesUsingStarts);
    for (const [index, ranges] of allPossibleSelections) {
      if (ranges.length !== selections.length) {
        allPossibleSelections.delete(index);
        continue;
      }
      ranges.sort(Range.compareRangesUsingStarts);
      for (let i = 0; i < ranges.length; i++) {
        if (!ranges[i].containsRange(selections[i])) {
          allPossibleSelections.delete(index);
          continue;
        }
      }
    }
    return allPossibleSelections.size > 0;
  }
  getEnclosingRange() {
    let result;
    for (const snippet of this._snippets) {
      const snippetRange = snippet.getEnclosingRange();
      if (!result) {
        result = snippetRange;
      } else {
        result = result.plusRange(snippetRange);
      }
    }
    return result;
  }
};
SnippetSession = __decorateClass([
  __decorateParam(3, ILanguageConfigurationService)
], SnippetSession);
export {
  OneSnippet,
  SnippetSession
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL2VkaXRvci9jb250cmliL3NuaXBwZXQvYnJvd3Nlci9zbmlwcGV0U2Vzc2lvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGdyb3VwQnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgQ2hhckNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jaGFyQ29kZS5qcyc7XG5pbXBvcnQgeyBkaXNwb3NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGdldExlYWRpbmdXaGl0ZXNwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgJy4vc25pcHBldFNlc3Npb24uY3NzJztcbmltcG9ydCB7IElBY3RpdmVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IEVkaXRvck9wdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBFZGl0T3BlcmF0aW9uLCBJU2luZ2xlRWRpdE9wZXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL2VkaXRPcGVyYXRpb24uanMnO1xuaW1wb3J0IHsgSVBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24sIFNlbGVjdGlvbkRpcmVjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXh0Q2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvcmUvdGV4dENoYW5nZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2VDb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUlkZW50aWZpZWRTaW5nbGVFZGl0T3BlcmF0aW9uLCBJVGV4dE1vZGVsLCBUcmFja2VkUmFuZ2VTdGlja2luZXNzIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IE92ZXJ0eXBpbmdDYXB0dXJlciB9IGZyb20gJy4uLy4uL3N1Z2dlc3QvYnJvd3Nlci9zdWdnZXN0T3ZlcnR5cGluZ0NhcHR1cmVyLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQ2hvaWNlLCBNYXJrZXIsIFBsYWNlaG9sZGVyLCBTbmlwcGV0UGFyc2VyLCBUZXh0LCBUZXh0bWF0ZVNuaXBwZXQsIFZhcmlhYmxlIH0gZnJvbSAnLi9zbmlwcGV0UGFyc2VyLmpzJztcbmltcG9ydCB7IENsaXBib2FyZEJhc2VkVmFyaWFibGVSZXNvbHZlciwgQ29tbWVudEJhc2VkVmFyaWFibGVSZXNvbHZlciwgQ29tcG9zaXRlU25pcHBldFZhcmlhYmxlUmVzb2x2ZXIsIE1vZGVsQmFzZWRWYXJpYWJsZVJlc29sdmVyLCBSYW5kb21CYXNlZFZhcmlhYmxlUmVzb2x2ZXIsIFNlbGVjdGlvbkJhc2VkVmFyaWFibGVSZXNvbHZlciwgVGltZUJhc2VkVmFyaWFibGVSZXNvbHZlciwgV29ya3NwYWNlQmFzZWRWYXJpYWJsZVJlc29sdmVyIH0gZnJvbSAnLi9zbmlwcGV0VmFyaWFibGVzLmpzJztcbmltcG9ydCB7IEVkaXRTb3VyY2VzLCBUZXh0TW9kZWxFZGl0U291cmNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RleHRNb2RlbEVkaXRTb3VyY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgT25lU25pcHBldCB7XG5cblx0cHJpdmF0ZSBfcGxhY2Vob2xkZXJEZWNvcmF0aW9ucz86IE1hcDxQbGFjZWhvbGRlciwgc3RyaW5nPjtcblx0cHJpdmF0ZSBfcGxhY2Vob2xkZXJHcm91cHM6IFBsYWNlaG9sZGVyW11bXTtcblx0cHJpdmF0ZSBfb2Zmc2V0OiBudW1iZXIgPSAtMTtcblx0X3BsYWNlaG9sZGVyR3JvdXBzSWR4OiBudW1iZXI7XG5cdF9uZXN0aW5nTGV2ZWw6IG51bWJlciA9IDE7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2RlY29yID0ge1xuXHRcdGFjdGl2ZTogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7IGRlc2NyaXB0aW9uOiAnc25pcHBldC1wbGFjZWhvbGRlci0xJywgc3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5BbHdheXNHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCBjbGFzc05hbWU6ICdzbmlwcGV0LXBsYWNlaG9sZGVyJyB9KSxcblx0XHRpbmFjdGl2ZTogTW9kZWxEZWNvcmF0aW9uT3B0aW9ucy5yZWdpc3Rlcih7IGRlc2NyaXB0aW9uOiAnc25pcHBldC1wbGFjZWhvbGRlci0yJywgc3RpY2tpbmVzczogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsIGNsYXNzTmFtZTogJ3NuaXBwZXQtcGxhY2Vob2xkZXInIH0pLFxuXHRcdGFjdGl2ZUZpbmFsOiBNb2RlbERlY29yYXRpb25PcHRpb25zLnJlZ2lzdGVyKHsgZGVzY3JpcHRpb246ICdzbmlwcGV0LXBsYWNlaG9sZGVyLTMnLCBzdGlja2luZXNzOiBUcmFja2VkUmFuZ2VTdGlja2luZXNzLk5ldmVyR3Jvd3NXaGVuVHlwaW5nQXRFZGdlcywgY2xhc3NOYW1lOiAnZmluaXNoLXNuaXBwZXQtcGxhY2Vob2xkZXInIH0pLFxuXHRcdGluYWN0aXZlRmluYWw6IE1vZGVsRGVjb3JhdGlvbk9wdGlvbnMucmVnaXN0ZXIoeyBkZXNjcmlwdGlvbjogJ3NuaXBwZXQtcGxhY2Vob2xkZXItNCcsIHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLCBjbGFzc05hbWU6ICdmaW5pc2gtc25pcHBldC1wbGFjZWhvbGRlcicgfSksXG5cdH07XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9zbmlwcGV0OiBUZXh0bWF0ZVNuaXBwZXQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc25pcHBldExpbmVMZWFkaW5nV2hpdGVzcGFjZTogc3RyaW5nXG5cdCkge1xuXHRcdHRoaXMuX3BsYWNlaG9sZGVyR3JvdXBzID0gZ3JvdXBCeShfc25pcHBldC5wbGFjZWhvbGRlcnMsIFBsYWNlaG9sZGVyLmNvbXBhcmVCeUluZGV4KTtcblx0XHR0aGlzLl9wbGFjZWhvbGRlckdyb3Vwc0lkeCA9IC0xO1xuXHR9XG5cblx0aW5pdGlhbGl6ZSh0ZXh0Q2hhbmdlOiBUZXh0Q2hhbmdlKTogdm9pZCB7XG5cdFx0dGhpcy5fb2Zmc2V0ID0gdGV4dENoYW5nZS5uZXdQb3NpdGlvbjtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3BsYWNlaG9sZGVyRGVjb3JhdGlvbnMpIHtcblx0XHRcdHRoaXMuX2VkaXRvci5yZW1vdmVEZWNvcmF0aW9ucyhbLi4udGhpcy5fcGxhY2Vob2xkZXJEZWNvcmF0aW9ucy52YWx1ZXMoKV0pO1xuXHRcdH1cblx0XHR0aGlzLl9wbGFjZWhvbGRlckdyb3Vwcy5sZW5ndGggPSAwO1xuXHR9XG5cblx0cHJpdmF0ZSBfaW5pdERlY29yYXRpb25zKCk6IHZvaWQge1xuXG5cdFx0aWYgKHRoaXMuX29mZnNldCA9PT0gLTEpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgU25pcHBldCBub3QgaW5pdGlhbGl6ZWQhYCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3BsYWNlaG9sZGVyRGVjb3JhdGlvbnMpIHtcblx0XHRcdC8vIGFscmVhZHkgaW5pdGlhbGl6ZWRcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9wbGFjZWhvbGRlckRlY29yYXRpb25zID0gbmV3IE1hcDxQbGFjZWhvbGRlciwgc3RyaW5nPigpO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHR0aGlzLl9lZGl0b3IuY2hhbmdlRGVjb3JhdGlvbnMoYWNjZXNzb3IgPT4ge1xuXHRcdFx0Ly8gY3JlYXRlIGEgZGVjb3JhdGlvbiBmb3IgZWFjaCBwbGFjZWhvbGRlclxuXHRcdFx0Zm9yIChjb25zdCBwbGFjZWhvbGRlciBvZiB0aGlzLl9zbmlwcGV0LnBsYWNlaG9sZGVycykge1xuXHRcdFx0XHRjb25zdCBwbGFjZWhvbGRlck9mZnNldCA9IHRoaXMuX3NuaXBwZXQub2Zmc2V0KHBsYWNlaG9sZGVyKTtcblx0XHRcdFx0Y29uc3QgcGxhY2Vob2xkZXJMZW4gPSB0aGlzLl9zbmlwcGV0LmZ1bGxMZW4ocGxhY2Vob2xkZXIpO1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IFJhbmdlLmZyb21Qb3NpdGlvbnMoXG5cdFx0XHRcdFx0bW9kZWwuZ2V0UG9zaXRpb25BdCh0aGlzLl9vZmZzZXQgKyBwbGFjZWhvbGRlck9mZnNldCksXG5cdFx0XHRcdFx0bW9kZWwuZ2V0UG9zaXRpb25BdCh0aGlzLl9vZmZzZXQgKyBwbGFjZWhvbGRlck9mZnNldCArIHBsYWNlaG9sZGVyTGVuKVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRjb25zdCBvcHRpb25zID0gcGxhY2Vob2xkZXIuaXNGaW5hbFRhYnN0b3AgPyBPbmVTbmlwcGV0Ll9kZWNvci5pbmFjdGl2ZUZpbmFsIDogT25lU25pcHBldC5fZGVjb3IuaW5hY3RpdmU7XG5cdFx0XHRcdGNvbnN0IGhhbmRsZSA9IGFjY2Vzc29yLmFkZERlY29yYXRpb24ocmFuZ2UsIG9wdGlvbnMpO1xuXHRcdFx0XHR0aGlzLl9wbGFjZWhvbGRlckRlY29yYXRpb25zIS5zZXQocGxhY2Vob2xkZXIsIGhhbmRsZSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRtb3ZlKGZ3ZDogYm9vbGVhbiB8IHVuZGVmaW5lZCk6IFNlbGVjdGlvbltdIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0dGhpcy5faW5pdERlY29yYXRpb25zKCk7XG5cblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXG5cdFx0Ly8gVHJhbnNmb3JtIHBsYWNlaG9sZGVyIHRleHQgaWYgbmVjZXNzYXJ5XG5cdFx0aWYgKHRoaXMuX3BsYWNlaG9sZGVyR3JvdXBzSWR4ID49IDApIHtcblx0XHRcdGNvbnN0IG9wZXJhdGlvbnM6IElTaW5nbGVFZGl0T3BlcmF0aW9uW10gPSBbXTtcblxuXHRcdFx0Zm9yIChjb25zdCBwbGFjZWhvbGRlciBvZiB0aGlzLl9wbGFjZWhvbGRlckdyb3Vwc1t0aGlzLl9wbGFjZWhvbGRlckdyb3Vwc0lkeF0pIHtcblx0XHRcdFx0Ly8gQ2hlY2sgaWYgdGhlIHBsYWNlaG9sZGVyIGhhcyBhIHRyYW5zZm9ybWF0aW9uXG5cdFx0XHRcdGlmIChwbGFjZWhvbGRlci50cmFuc2Zvcm0pIHtcblx0XHRcdFx0XHRjb25zdCBpZCA9IHRoaXMuX3BsYWNlaG9sZGVyRGVjb3JhdGlvbnMhLmdldChwbGFjZWhvbGRlcik7XG5cdFx0XHRcdFx0Y29uc3QgcmFuZ2UgPSBpZCA/IG1vZGVsLmdldERlY29yYXRpb25SYW5nZShpZCkgOiBudWxsO1xuXHRcdFx0XHRcdGlmIChyYW5nZSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgY3VycmVudFZhbHVlID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKHJhbmdlKTtcblx0XHRcdFx0XHRcdGNvbnN0IHRyYW5zZm9ybWVkVmFsdWVMaW5lcyA9IHBsYWNlaG9sZGVyLnRyYW5zZm9ybS5yZXNvbHZlKGN1cnJlbnRWYWx1ZSkuc3BsaXQoL1xcclxcbnxcXHJ8XFxuLyk7XG5cdFx0XHRcdFx0XHQvLyBmaXggaW5kZW50YXRpb24gZm9yIHRyYW5zZm9ybWVkIGxpbmVzXG5cdFx0XHRcdFx0XHRmb3IgKGxldCBpID0gMTsgaSA8IHRyYW5zZm9ybWVkVmFsdWVMaW5lcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0XHR0cmFuc2Zvcm1lZFZhbHVlTGluZXNbaV0gPSBtb2RlbC5ub3JtYWxpemVJbmRlbnRhdGlvbih0aGlzLl9zbmlwcGV0TGluZUxlYWRpbmdXaGl0ZXNwYWNlICsgdHJhbnNmb3JtZWRWYWx1ZUxpbmVzW2ldKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdG9wZXJhdGlvbnMucHVzaChFZGl0T3BlcmF0aW9uLnJlcGxhY2UocmFuZ2UsIHRyYW5zZm9ybWVkVmFsdWVMaW5lcy5qb2luKG1vZGVsLmdldEVPTCgpKSkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKG9wZXJhdGlvbnMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9lZGl0b3IuZXhlY3V0ZUVkaXRzKCdzbmlwcGV0LnBsYWNlaG9sZGVyVHJhbnNmb3JtJywgb3BlcmF0aW9ucyk7XG5cdFx0XHR9XG5cblx0XHR9XG5cblx0XHRsZXQgY291bGRTa2lwVGhpc1BsYWNlaG9sZGVyID0gZmFsc2U7XG5cdFx0aWYgKGZ3ZCA9PT0gdHJ1ZSAmJiB0aGlzLl9wbGFjZWhvbGRlckdyb3Vwc0lkeCA8IHRoaXMuX3BsYWNlaG9sZGVyR3JvdXBzLmxlbmd0aCAtIDEpIHtcblx0XHRcdHRoaXMuX3BsYWNlaG9sZGVyR3JvdXBzSWR4ICs9IDE7XG5cdFx0XHRjb3VsZFNraXBUaGlzUGxhY2Vob2xkZXIgPSB0cnVlO1xuXG5cdFx0fSBlbHNlIGlmIChmd2QgPT09IGZhbHNlICYmIHRoaXMuX3BsYWNlaG9sZGVyR3JvdXBzSWR4ID4gMCkge1xuXHRcdFx0dGhpcy5fcGxhY2Vob2xkZXJHcm91cHNJZHggLT0gMTtcblx0XHRcdGNvdWxkU2tpcFRoaXNQbGFjZWhvbGRlciA9IHRydWU7XG5cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gdGhlIHNlbGVjdGlvbiBvZiB0aGUgY3VycmVudCBwbGFjZWhvbGRlciBtaWdodFxuXHRcdFx0Ly8gbm90IGFjdXJhdGUgYW55IG1vcmUgLT4gc2ltcGx5IHJlc3RvcmUgaXRcblx0XHR9XG5cblx0XHRjb25zdCBuZXdTZWxlY3Rpb25zID0gbW9kZWwuY2hhbmdlRGVjb3JhdGlvbnMoYWNjZXNzb3IgPT4ge1xuXG5cdFx0XHRjb25zdCBhY3RpdmVQbGFjZWhvbGRlcnMgPSBuZXcgU2V0PFBsYWNlaG9sZGVyPigpO1xuXG5cdFx0XHQvLyBjaGFuZ2Ugc3RpY2tpbmVzcyB0byBhbHdheXMgZ3JvdyB3aGVuIHR5cGluZyBhdCBpdHMgZWRnZXNcblx0XHRcdC8vIGJlY2F1c2UgdGhlc2UgZGVjb3JhdGlvbnMgcmVwcmVzZW50IHRoZSBjdXJyZW50bHkgYWN0aXZlXG5cdFx0XHQvLyB0YWJzdG9wLlxuXHRcdFx0Ly8gU3BlY2lhbCBjYXNlICMxOiByZWFjaGluZyB0aGUgZmluYWwgdGFic3RvcFxuXHRcdFx0Ly8gU3BlY2lhbCBjYXNlICMyOiBwbGFjZWhvbGRlcnMgZW5jbG9zaW5nIGFjdGl2ZSBwbGFjZWhvbGRlcnNcblx0XHRcdGNvbnN0IHNlbGVjdGlvbnM6IFNlbGVjdGlvbltdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IHBsYWNlaG9sZGVyIG9mIHRoaXMuX3BsYWNlaG9sZGVyR3JvdXBzW3RoaXMuX3BsYWNlaG9sZGVyR3JvdXBzSWR4XSkge1xuXHRcdFx0XHRjb25zdCBpZCA9IHRoaXMuX3BsYWNlaG9sZGVyRGVjb3JhdGlvbnMhLmdldChwbGFjZWhvbGRlcik7XG5cdFx0XHRcdGNvbnN0IHJhbmdlID0gaWQgPyBtb2RlbC5nZXREZWNvcmF0aW9uUmFuZ2UoaWQpIDogbnVsbDtcblxuXHRcdFx0XHQvLyBjb25zaWRlciB0byBza2lwIHRoaXMgcGxhY2Vob2xkZXIgaW5kZXggd2hlbiB0aGUgZGVjb3JhdGlvblxuXHRcdFx0XHQvLyByYW5nZSBpcyBlbXB0eSBidXQgd2hlbiB0aGUgcGxhY2Vob2xkZXIgd2Fzbid0LiB0aGF0J3MgYSBzdHJvbmdcblx0XHRcdFx0Ly8gaGludCB0aGF0IHRoZSBwbGFjZWhvbGRlciBoYXMgYmVlbiBkZWxldGVkLiAoYWxsIHBsYWNlaG9sZGVyIG11c3QgbWF0Y2ggdGhpcylcblx0XHRcdFx0Y291bGRTa2lwVGhpc1BsYWNlaG9sZGVyID0gY291bGRTa2lwVGhpc1BsYWNlaG9sZGVyICYmIHRoaXMuX2hhc1BsYWNlaG9sZGVyQmVlbkNvbGxhcHNlZChwbGFjZWhvbGRlcik7XG5cblx0XHRcdFx0aWYgKCFpZCB8fCAhcmFuZ2UpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzZWxlY3Rpb25zLnB1c2gobmV3IFNlbGVjdGlvbihyYW5nZS5zdGFydExpbmVOdW1iZXIsIHJhbmdlLnN0YXJ0Q29sdW1uLCByYW5nZS5lbmRMaW5lTnVtYmVyLCByYW5nZS5lbmRDb2x1bW4pKTtcblxuXHRcdFx0XHRhY2Nlc3Nvci5jaGFuZ2VEZWNvcmF0aW9uT3B0aW9ucyhpZCwgcGxhY2Vob2xkZXIuaXNGaW5hbFRhYnN0b3AgPyBPbmVTbmlwcGV0Ll9kZWNvci5hY3RpdmVGaW5hbCA6IE9uZVNuaXBwZXQuX2RlY29yLmFjdGl2ZSk7XG5cdFx0XHRcdGFjdGl2ZVBsYWNlaG9sZGVycy5hZGQocGxhY2Vob2xkZXIpO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgZW5jbG9zaW5nUGxhY2Vob2xkZXIgb2YgdGhpcy5fc25pcHBldC5lbmNsb3NpbmdQbGFjZWhvbGRlcnMocGxhY2Vob2xkZXIpKSB7XG5cdFx0XHRcdFx0Y29uc3QgaWQgPSB0aGlzLl9wbGFjZWhvbGRlckRlY29yYXRpb25zIS5nZXQoZW5jbG9zaW5nUGxhY2Vob2xkZXIpO1xuXHRcdFx0XHRcdGlmIChpZCkge1xuXHRcdFx0XHRcdFx0YWNjZXNzb3IuY2hhbmdlRGVjb3JhdGlvbk9wdGlvbnMoaWQsIGVuY2xvc2luZ1BsYWNlaG9sZGVyLmlzRmluYWxUYWJzdG9wID8gT25lU25pcHBldC5fZGVjb3IuYWN0aXZlRmluYWwgOiBPbmVTbmlwcGV0Ll9kZWNvci5hY3RpdmUpO1xuXHRcdFx0XHRcdFx0YWN0aXZlUGxhY2Vob2xkZXJzLmFkZChlbmNsb3NpbmdQbGFjZWhvbGRlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIGNoYW5nZSBzdGlja25lc3MgdG8gbmV2ZXIgZ3JvdyB3aGVuIHR5cGluZyBhdCBpdHMgZWRnZXNcblx0XHRcdC8vIHNvIHRoYXQgaW4tYWN0aXZlIHRhYnN0b3BzIG5ldmVyIGdyb3dcblx0XHRcdGZvciAoY29uc3QgW3BsYWNlaG9sZGVyLCBpZF0gb2YgdGhpcy5fcGxhY2Vob2xkZXJEZWNvcmF0aW9ucyEpIHtcblx0XHRcdFx0aWYgKCFhY3RpdmVQbGFjZWhvbGRlcnMuaGFzKHBsYWNlaG9sZGVyKSkge1xuXHRcdFx0XHRcdGFjY2Vzc29yLmNoYW5nZURlY29yYXRpb25PcHRpb25zKGlkLCBwbGFjZWhvbGRlci5pc0ZpbmFsVGFic3RvcCA/IE9uZVNuaXBwZXQuX2RlY29yLmluYWN0aXZlRmluYWwgOiBPbmVTbmlwcGV0Ll9kZWNvci5pbmFjdGl2ZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHNlbGVjdGlvbnM7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gIWNvdWxkU2tpcFRoaXNQbGFjZWhvbGRlciA/IG5ld1NlbGVjdGlvbnMgPz8gW10gOiB0aGlzLm1vdmUoZndkKTtcblx0fVxuXG5cdHByaXZhdGUgX2hhc1BsYWNlaG9sZGVyQmVlbkNvbGxhcHNlZChwbGFjZWhvbGRlcjogUGxhY2Vob2xkZXIpOiBib29sZWFuIHtcblx0XHQvLyBBIHBsYWNlaG9sZGVyIGlzIGVtcHR5IHdoZW4gaXQgd2Fzbid0IGVtcHR5IHdoZW4gYXV0aG9yZWQgYnV0XG5cdFx0Ly8gd2hlbiBpdHMgdHJhY2tpbmcgZGVjb3JhdGlvbiBpcyBlbXB0eS4gVGhpcyBhbHNvIGFwcGxpZXMgdG8gYWxsXG5cdFx0Ly8gcG90ZW50aWFsIHBhcmVudCBwbGFjZWhvbGRlcnNcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGxldCBtYXJrZXI6IE1hcmtlciB8IHVuZGVmaW5lZCA9IHBsYWNlaG9sZGVyO1xuXHRcdHdoaWxlIChtYXJrZXIpIHtcblx0XHRcdGlmIChtYXJrZXIgaW5zdGFuY2VvZiBQbGFjZWhvbGRlcikge1xuXHRcdFx0XHRjb25zdCBpZCA9IHRoaXMuX3BsYWNlaG9sZGVyRGVjb3JhdGlvbnMhLmdldChtYXJrZXIpO1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IGlkID8gbW9kZWwuZ2V0RGVjb3JhdGlvblJhbmdlKGlkKSA6IG51bGw7XG5cdFx0XHRcdGlmICgoIXJhbmdlIHx8IHJhbmdlLmlzRW1wdHkoKSkgJiYgbWFya2VyLnRvU3RyaW5nKCkubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRtYXJrZXIgPSBtYXJrZXIucGFyZW50O1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRnZXQgaXNBdEZpcnN0UGxhY2Vob2xkZXIoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3BsYWNlaG9sZGVyR3JvdXBzSWR4IDw9IDAgfHwgdGhpcy5fcGxhY2Vob2xkZXJHcm91cHMubGVuZ3RoID09PSAwO1xuXHR9XG5cblx0Z2V0IGlzQXRMYXN0UGxhY2Vob2xkZXIoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3BsYWNlaG9sZGVyR3JvdXBzSWR4ID09PSB0aGlzLl9wbGFjZWhvbGRlckdyb3Vwcy5sZW5ndGggLSAxO1xuXHR9XG5cblx0Z2V0IGhhc1BsYWNlaG9sZGVyKCkge1xuXHRcdHJldHVybiB0aGlzLl9zbmlwcGV0LnBsYWNlaG9sZGVycy5sZW5ndGggPiAwO1xuXHR9XG5cblx0LyoqXG5cdCAqIEEgc25pcHBldCBpcyB0cml2aWFsIHdoZW4gaXQgaGFzIG5vIHBsYWNlaG9sZGVyIG9yIG9ubHkgYSBmaW5hbCBwbGFjZWhvbGRlciBhdFxuXHQgKiBpdHMgdmVyeSBlbmRcblx0ICovXG5cdGdldCBpc1RyaXZpYWxTbmlwcGV0KCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9zbmlwcGV0LnBsYWNlaG9sZGVycy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc25pcHBldC5wbGFjZWhvbGRlcnMubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRjb25zdCBbcGxhY2Vob2xkZXJdID0gdGhpcy5fc25pcHBldC5wbGFjZWhvbGRlcnM7XG5cdFx0XHRpZiAocGxhY2Vob2xkZXIuaXNGaW5hbFRhYnN0b3ApIHtcblx0XHRcdFx0aWYgKHRoaXMuX3NuaXBwZXQucmlnaHRNb3N0RGVzY2VuZGFudCA9PT0gcGxhY2Vob2xkZXIpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb21wdXRlUG9zc2libGVTZWxlY3Rpb25zKCkge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG5ldyBNYXA8bnVtYmVyLCBSYW5nZVtdPigpO1xuXHRcdGZvciAoY29uc3QgcGxhY2Vob2xkZXJzV2l0aEVxdWFsSW5kZXggb2YgdGhpcy5fcGxhY2Vob2xkZXJHcm91cHMpIHtcblx0XHRcdGxldCByYW5nZXM6IFJhbmdlW10gfCB1bmRlZmluZWQ7XG5cblx0XHRcdGZvciAoY29uc3QgcGxhY2Vob2xkZXIgb2YgcGxhY2Vob2xkZXJzV2l0aEVxdWFsSW5kZXgpIHtcblx0XHRcdFx0aWYgKHBsYWNlaG9sZGVyLmlzRmluYWxUYWJzdG9wKSB7XG5cdFx0XHRcdFx0Ly8gaWdub3JlIHRob3NlXG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoIXJhbmdlcykge1xuXHRcdFx0XHRcdHJhbmdlcyA9IFtdO1xuXHRcdFx0XHRcdHJlc3VsdC5zZXQocGxhY2Vob2xkZXIuaW5kZXgsIHJhbmdlcyk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBpZCA9IHRoaXMuX3BsYWNlaG9sZGVyRGVjb3JhdGlvbnMhLmdldChwbGFjZWhvbGRlcikhO1xuXHRcdFx0XHRjb25zdCByYW5nZSA9IHRoaXMuX2VkaXRvci5nZXRNb2RlbCgpLmdldERlY29yYXRpb25SYW5nZShpZCk7XG5cdFx0XHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdFx0XHQvLyBvbmUgb2YgdGhlIHBsYWNlaG9sZGVyIGxvc3QgaXRzIGRlY29yYXRpb24gYW5kXG5cdFx0XHRcdFx0Ly8gdGhlcmVmb3JlIHdlIGJhaWwgb3V0IGFuZCBwcmV0ZW5kIHRoZSBwbGFjZWhvbGRlclxuXHRcdFx0XHRcdC8vICh3aXRoIGl0cyBtaXJyb3JzKSBkb2Vzbid0IGV4aXN0IGFueW1vcmUuXG5cdFx0XHRcdFx0cmVzdWx0LmRlbGV0ZShwbGFjZWhvbGRlci5pbmRleCk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyYW5nZXMucHVzaChyYW5nZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRnZXQgYWN0aXZlQ2hvaWNlKCk6IHsgY2hvaWNlOiBDaG9pY2U7IHJhbmdlOiBSYW5nZSB9IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX3BsYWNlaG9sZGVyRGVjb3JhdGlvbnMpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHBsYWNlaG9sZGVyID0gdGhpcy5fcGxhY2Vob2xkZXJHcm91cHNbdGhpcy5fcGxhY2Vob2xkZXJHcm91cHNJZHhdWzBdO1xuXHRcdGlmICghcGxhY2Vob2xkZXI/LmNob2ljZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgaWQgPSB0aGlzLl9wbGFjZWhvbGRlckRlY29yYXRpb25zLmdldChwbGFjZWhvbGRlcik7XG5cdFx0aWYgKCFpZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmFuZ2UgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKS5nZXREZWNvcmF0aW9uUmFuZ2UoaWQpO1xuXHRcdGlmICghcmFuZ2UpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7IHJhbmdlLCBjaG9pY2U6IHBsYWNlaG9sZGVyLmNob2ljZSB9O1xuXHR9XG5cblx0Z2V0IGhhc0Nob2ljZSgpOiBib29sZWFuIHtcblx0XHRsZXQgcmVzdWx0ID0gZmFsc2U7XG5cdFx0dGhpcy5fc25pcHBldC53YWxrKG1hcmtlciA9PiB7XG5cdFx0XHRyZXN1bHQgPSBtYXJrZXIgaW5zdGFuY2VvZiBDaG9pY2U7XG5cdFx0XHRyZXR1cm4gIXJlc3VsdDtcblx0XHR9KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0Z2V0IGFjdGl2ZVBsYWNlaG9sZGVyQ291bnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fcGxhY2Vob2xkZXJHcm91cHNJZHggPCAwID8gMCA6IHRoaXMuX3BsYWNlaG9sZGVyR3JvdXBzW3RoaXMuX3BsYWNlaG9sZGVyR3JvdXBzSWR4XS5sZW5ndGg7XG5cdH1cblxuXHRtZXJnZShvdGhlcnM6IE9uZVNuaXBwZXRbXSk6IHZvaWQge1xuXG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHR0aGlzLl9uZXN0aW5nTGV2ZWwgKj0gMTA7XG5cblx0XHR0aGlzLl9lZGl0b3IuY2hhbmdlRGVjb3JhdGlvbnMoYWNjZXNzb3IgPT4ge1xuXG5cdFx0XHQvLyBGb3IgZWFjaCBhY3RpdmUgcGxhY2Vob2xkZXIgdGFrZSBvbmUgc25pcHBldCBhbmQgbWVyZ2UgaXRcblx0XHRcdC8vIGluIHRoYXQgdGhlIHBsYWNlaG9sZGVyIChjYW4gYmUgbWFueSBmb3IgYCQxZm9vJDFmb29gKS4gQmVjYXVzZVxuXHRcdFx0Ly8gZXZlcnl0aGluZyBpcyBzb3J0ZWQgYnkgZWRpdG9yIHNlbGVjdGlvbiB3ZSBjYW4gc2ltcGx5IHJlbW92ZVxuXHRcdFx0Ly8gZWxlbWVudHMgZnJvbSB0aGUgYmVnaW5uaW5nIG9mIHRoZSBhcnJheVxuXHRcdFx0Zm9yIChjb25zdCBwbGFjZWhvbGRlciBvZiB0aGlzLl9wbGFjZWhvbGRlckdyb3Vwc1t0aGlzLl9wbGFjZWhvbGRlckdyb3Vwc0lkeF0pIHtcblx0XHRcdFx0Y29uc3QgbmVzdGVkID0gb3RoZXJzLnNoaWZ0KCkhO1xuXHRcdFx0XHRjb25zb2xlLmFzc2VydChuZXN0ZWQuX29mZnNldCAhPT0gLTEpO1xuXHRcdFx0XHRjb25zb2xlLmFzc2VydCghbmVzdGVkLl9wbGFjZWhvbGRlckRlY29yYXRpb25zKTtcblxuXHRcdFx0XHQvLyBNYXNzYWdlIHBsYWNlaG9sZGVyLWluZGljaWVzIG9mIHRoZSBuZXN0ZWQgc25pcHBldCB0byBiZVxuXHRcdFx0XHQvLyBzb3J0ZWQgcmlnaHQgYWZ0ZXIgdGhlIGluc2VydGlvbiBwb2ludC4gVGhpcyBlbnN1cmVzIHdlIG1vdmVcblx0XHRcdFx0Ly8gdGhyb3VnaCB0aGUgcGxhY2Vob2xkZXJzIGluIHRoZSBjb3JyZWN0IG9yZGVyXG5cdFx0XHRcdGNvbnN0IGluZGV4TGFzdFBsYWNlaG9sZGVyID0gbmVzdGVkLl9zbmlwcGV0LnBsYWNlaG9sZGVySW5mby5sYXN0IS5pbmRleDtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IG5lc3RlZFBsYWNlaG9sZGVyIG9mIG5lc3RlZC5fc25pcHBldC5wbGFjZWhvbGRlckluZm8uYWxsKSB7XG5cdFx0XHRcdFx0aWYgKG5lc3RlZFBsYWNlaG9sZGVyLmlzRmluYWxUYWJzdG9wKSB7XG5cdFx0XHRcdFx0XHRuZXN0ZWRQbGFjZWhvbGRlci5pbmRleCA9IHBsYWNlaG9sZGVyLmluZGV4ICsgKChpbmRleExhc3RQbGFjZWhvbGRlciArIDEpIC8gdGhpcy5fbmVzdGluZ0xldmVsKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0bmVzdGVkUGxhY2Vob2xkZXIuaW5kZXggPSBwbGFjZWhvbGRlci5pbmRleCArIChuZXN0ZWRQbGFjZWhvbGRlci5pbmRleCAvIHRoaXMuX25lc3RpbmdMZXZlbCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3NuaXBwZXQucmVwbGFjZShwbGFjZWhvbGRlciwgbmVzdGVkLl9zbmlwcGV0LmNoaWxkcmVuKTtcblxuXHRcdFx0XHQvLyBSZW1vdmUgdGhlIHBsYWNlaG9sZGVyIGF0IHdoaWNoIHBvc2l0aW9uIGFyZSBpbnNlcnRpbmdcblx0XHRcdFx0Ly8gdGhlIHNuaXBwZXQgYW5kIGFsc28gcmVtb3ZlIGl0cyBkZWNvcmF0aW9uLlxuXHRcdFx0XHRjb25zdCBpZCA9IHRoaXMuX3BsYWNlaG9sZGVyRGVjb3JhdGlvbnMhLmdldChwbGFjZWhvbGRlcikhO1xuXHRcdFx0XHRhY2Nlc3Nvci5yZW1vdmVEZWNvcmF0aW9uKGlkKTtcblx0XHRcdFx0dGhpcy5fcGxhY2Vob2xkZXJEZWNvcmF0aW9ucyEuZGVsZXRlKHBsYWNlaG9sZGVyKTtcblxuXHRcdFx0XHQvLyBGb3IgZWFjaCAqbmV3KiBwbGFjZWhvbGRlciB3ZSBjcmVhdGUgZGVjb3JhdGlvbiB0byBtb25pdG9yXG5cdFx0XHRcdC8vIGhvdyBhbmQgaWYgaXQgZ3Jvd3Mvc2hyaW5rcy5cblx0XHRcdFx0Zm9yIChjb25zdCBwbGFjZWhvbGRlciBvZiBuZXN0ZWQuX3NuaXBwZXQucGxhY2Vob2xkZXJzKSB7XG5cdFx0XHRcdFx0Y29uc3QgcGxhY2Vob2xkZXJPZmZzZXQgPSBuZXN0ZWQuX3NuaXBwZXQub2Zmc2V0KHBsYWNlaG9sZGVyKTtcblx0XHRcdFx0XHRjb25zdCBwbGFjZWhvbGRlckxlbiA9IG5lc3RlZC5fc25pcHBldC5mdWxsTGVuKHBsYWNlaG9sZGVyKTtcblx0XHRcdFx0XHRjb25zdCByYW5nZSA9IFJhbmdlLmZyb21Qb3NpdGlvbnMoXG5cdFx0XHRcdFx0XHRtb2RlbC5nZXRQb3NpdGlvbkF0KG5lc3RlZC5fb2Zmc2V0ICsgcGxhY2Vob2xkZXJPZmZzZXQpLFxuXHRcdFx0XHRcdFx0bW9kZWwuZ2V0UG9zaXRpb25BdChuZXN0ZWQuX29mZnNldCArIHBsYWNlaG9sZGVyT2Zmc2V0ICsgcGxhY2Vob2xkZXJMZW4pXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0XHRjb25zdCBoYW5kbGUgPSBhY2Nlc3Nvci5hZGREZWNvcmF0aW9uKHJhbmdlLCBPbmVTbmlwcGV0Ll9kZWNvci5pbmFjdGl2ZSk7XG5cdFx0XHRcdFx0dGhpcy5fcGxhY2Vob2xkZXJEZWNvcmF0aW9ucyEuc2V0KHBsYWNlaG9sZGVyLCBoYW5kbGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIFJlbm9ybWFsaXplIGZyYWN0aW9uYWwgcGxhY2Vob2xkZXIgaW5kaWNpZXMgYmFjayB0byBzbWFsbCBpbnRlZ2Vycy5cblx0XHRcdC8vIFdpdGhvdXQgdGhpcywgZGVlcGx5IG5lc3RlZCBtZXJnZXMgKH4xNisgbGV2ZWxzKSBsb3NlIGZsb2F0aW5nLXBvaW50XG5cdFx0XHQvLyBwcmVjaXNpb24gc28gZGlzdGluY3QgcGxhY2Vob2xkZXJzIGNvbGxhcHNlIG9udG8gdGhlIHNhbWUgaW5kZXggYW5kXG5cdFx0XHQvLyBwcm9kdWNlIHBoYW50b20gY3Vyc29ycy4gIzI3OTM0OVxuXHRcdFx0dGhpcy5fcmVub3JtYWxpemVQbGFjZWhvbGRlckluZGljZXMoKTtcblxuXHRcdFx0Ly8gTGFzdCwgcmUtY3JlYXRlIHRoZSBwbGFjZWhvbGRlciBncm91cHMgYnkgc29ydGluZyBwbGFjZWhvbGRlcnMgYnkgdGhlaXIgaW5kZXguXG5cdFx0XHR0aGlzLl9wbGFjZWhvbGRlckdyb3VwcyA9IGdyb3VwQnkodGhpcy5fc25pcHBldC5wbGFjZWhvbGRlcnMsIFBsYWNlaG9sZGVyLmNvbXBhcmVCeUluZGV4KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX3Jlbm9ybWFsaXplUGxhY2Vob2xkZXJJbmRpY2VzKCk6IHZvaWQge1xuXHRcdGNvbnN0IHBsYWNlaG9sZGVycyA9IHRoaXMuX3NuaXBwZXQucGxhY2Vob2xkZXJzO1xuXHRcdGNvbnN0IHVuaXF1ZUluZGljZXMgPSBuZXcgU2V0PG51bWJlcj4oKTtcblx0XHRmb3IgKGNvbnN0IHBsYWNlaG9sZGVyIG9mIHBsYWNlaG9sZGVycykge1xuXHRcdFx0aWYgKCFwbGFjZWhvbGRlci5pc0ZpbmFsVGFic3RvcCkge1xuXHRcdFx0XHR1bmlxdWVJbmRpY2VzLmFkZChwbGFjZWhvbGRlci5pbmRleCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHNvcnRlZCA9IFsuLi51bmlxdWVJbmRpY2VzXS5zb3J0KChhLCBiKSA9PiBhIC0gYik7XG5cdFx0Y29uc3QgcmVtYXAgPSBuZXcgTWFwPG51bWJlciwgbnVtYmVyPigpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc29ydGVkLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRyZW1hcC5zZXQoc29ydGVkW2ldLCBpICsgMSk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgcGxhY2Vob2xkZXIgb2YgcGxhY2Vob2xkZXJzKSB7XG5cdFx0XHRpZiAoIXBsYWNlaG9sZGVyLmlzRmluYWxUYWJzdG9wKSB7XG5cdFx0XHRcdHBsYWNlaG9sZGVyLmluZGV4ID0gcmVtYXAuZ2V0KHBsYWNlaG9sZGVyLmluZGV4KSE7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX25lc3RpbmdMZXZlbCA9IDE7XG5cdH1cblxuXHRnZXRFbmNsb3NpbmdSYW5nZSgpOiBSYW5nZSB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHJlc3VsdDogUmFuZ2UgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRmb3IgKGNvbnN0IGRlY29yYXRpb25JZCBvZiB0aGlzLl9wbGFjZWhvbGRlckRlY29yYXRpb25zIS52YWx1ZXMoKSkge1xuXHRcdFx0Y29uc3QgcGxhY2Vob2xkZXJSYW5nZSA9IG1vZGVsLmdldERlY29yYXRpb25SYW5nZShkZWNvcmF0aW9uSWQpID8/IHVuZGVmaW5lZDtcblx0XHRcdGlmICghcmVzdWx0KSB7XG5cdFx0XHRcdHJlc3VsdCA9IHBsYWNlaG9sZGVyUmFuZ2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQgPSByZXN1bHQucGx1c1JhbmdlKHBsYWNlaG9sZGVyUmFuZ2UhKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElTbmlwcGV0U2Vzc2lvbkluc2VydE9wdGlvbnMge1xuXHRvdmVyd3JpdGVCZWZvcmU6IG51bWJlcjtcblx0b3ZlcndyaXRlQWZ0ZXI6IG51bWJlcjtcblx0YWRqdXN0V2hpdGVzcGFjZTogYm9vbGVhbjtcblx0Y2xpcGJvYXJkVGV4dDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRvdmVydHlwaW5nQ2FwdHVyZXI6IE92ZXJ0eXBpbmdDYXB0dXJlciB8IHVuZGVmaW5lZDtcbn1cblxuY29uc3QgX2RlZmF1bHRPcHRpb25zOiBJU25pcHBldFNlc3Npb25JbnNlcnRPcHRpb25zID0ge1xuXHRvdmVyd3JpdGVCZWZvcmU6IDAsXG5cdG92ZXJ3cml0ZUFmdGVyOiAwLFxuXHRhZGp1c3RXaGl0ZXNwYWNlOiB0cnVlLFxuXHRjbGlwYm9hcmRUZXh0OiB1bmRlZmluZWQsXG5cdG92ZXJ0eXBpbmdDYXB0dXJlcjogdW5kZWZpbmVkXG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElTbmlwcGV0RWRpdCB7XG5cdHJhbmdlOiBSYW5nZTtcblx0dGVtcGxhdGU6IHN0cmluZztcblx0a2VlcFdoaXRlc3BhY2U/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgU25pcHBldFNlc3Npb24ge1xuXG5cdHN0YXRpYyBhZGp1c3RXaGl0ZXNwYWNlKG1vZGVsOiBJVGV4dE1vZGVsLCBwb3NpdGlvbjogSVBvc2l0aW9uLCBhZGp1c3RJbmRlbnRhdGlvbjogYm9vbGVhbiwgc25pcHBldDogVGV4dG1hdGVTbmlwcGV0LCBmaWx0ZXI/OiBTZXQ8TWFya2VyPik6IHN0cmluZyB7XG5cdFx0Y29uc3QgbGluZSA9IG1vZGVsLmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IGxpbmVMZWFkaW5nV2hpdGVzcGFjZSA9IGdldExlYWRpbmdXaGl0ZXNwYWNlKGxpbmUsIDAsIHBvc2l0aW9uLmNvbHVtbiAtIDEpO1xuXG5cdFx0Ly8gdGhlIHNuaXBwZXQgYXMgaW5zZXJ0ZWRcblx0XHRsZXQgc25pcHBldFRleHRTdHJpbmc6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRcdHNuaXBwZXQud2FsayhtYXJrZXIgPT4ge1xuXHRcdFx0Ly8gYWxsIHRleHQgZWxlbWVudHMgdGhhdCBhcmUgbm90IGluc2lkZSBjaG9pY2Vcblx0XHRcdGlmICghKG1hcmtlciBpbnN0YW5jZW9mIFRleHQpIHx8IG1hcmtlci5wYXJlbnQgaW5zdGFuY2VvZiBDaG9pY2UpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGNoZWNrIHdpdGggZmlsdGVyIChpZmYgcHJvdmlkZWQpXG5cdFx0XHRpZiAoZmlsdGVyICYmICFmaWx0ZXIuaGFzKG1hcmtlcikpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGxpbmVzID0gbWFya2VyLnZhbHVlLnNwbGl0KC9cXHJcXG58XFxyfFxcbi8pO1xuXG5cdFx0XHRpZiAoYWRqdXN0SW5kZW50YXRpb24pIHtcblx0XHRcdFx0Ly8gYWRqdXN0IGluZGVudGF0aW9uIG9mIHNuaXBwZXQgdGVzdFxuXHRcdFx0XHQvLyAtdGhlIHNuaXBwZXQtc3RhcnQgZG9lc24ndCBnZXQgZXh0cmEtaW5kZW50ZWQgKGxpbmVMZWFkaW5nV2hpdGVzcGFjZSksIG9ubHkgbm9ybWFsaXplZFxuXHRcdFx0XHQvLyAtYWxsIE4rMSBsaW5lcyBnZXQgZXh0cmEtaW5kZW50ZWQgYW5kIG5vcm1hbGl6ZWRcblx0XHRcdFx0Ly8gLXRoZSB0ZXh0IHN0YXJ0IGdldCBleHRyYS1pbmRlbnRlZCBhbmQgbm9ybWFsaXplZCB3aGVuIGZvbGxvd2luZyBhIGxpbmVicmVha1xuXHRcdFx0XHRjb25zdCBvZmZzZXQgPSBzbmlwcGV0Lm9mZnNldChtYXJrZXIpO1xuXHRcdFx0XHRpZiAob2Zmc2V0ID09PSAwKSB7XG5cdFx0XHRcdFx0Ly8gc25pcHBldCBzdGFydFxuXHRcdFx0XHRcdGxpbmVzWzBdID0gbW9kZWwubm9ybWFsaXplSW5kZW50YXRpb24obGluZXNbMF0pO1xuXG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gY2hlY2sgaWYgdGV4dCBzdGFydCBpcyBhZnRlciBhIGxpbmVicmVha1xuXHRcdFx0XHRcdHNuaXBwZXRUZXh0U3RyaW5nID0gc25pcHBldFRleHRTdHJpbmcgPz8gc25pcHBldC50b1N0cmluZygpO1xuXHRcdFx0XHRcdGNvbnN0IHByZXZDaGFyID0gc25pcHBldFRleHRTdHJpbmcuY2hhckNvZGVBdChvZmZzZXQgLSAxKTtcblx0XHRcdFx0XHRpZiAocHJldkNoYXIgPT09IENoYXJDb2RlLkxpbmVGZWVkIHx8IHByZXZDaGFyID09PSBDaGFyQ29kZS5DYXJyaWFnZVJldHVybikge1xuXHRcdFx0XHRcdFx0bGluZXNbMF0gPSBtb2RlbC5ub3JtYWxpemVJbmRlbnRhdGlvbihsaW5lTGVhZGluZ1doaXRlc3BhY2UgKyBsaW5lc1swXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAobGV0IGkgPSAxOyBpIDwgbGluZXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0XHRsaW5lc1tpXSA9IG1vZGVsLm5vcm1hbGl6ZUluZGVudGF0aW9uKGxpbmVMZWFkaW5nV2hpdGVzcGFjZSArIGxpbmVzW2ldKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBuZXdWYWx1ZSA9IGxpbmVzLmpvaW4obW9kZWwuZ2V0RU9MKCkpO1xuXHRcdFx0aWYgKG5ld1ZhbHVlICE9PSBtYXJrZXIudmFsdWUpIHtcblx0XHRcdFx0bWFya2VyLnBhcmVudC5yZXBsYWNlKG1hcmtlciwgW25ldyBUZXh0KG5ld1ZhbHVlKV0pO1xuXHRcdFx0XHRzbmlwcGV0VGV4dFN0cmluZyA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGxpbmVMZWFkaW5nV2hpdGVzcGFjZTtcblx0fVxuXG5cdHN0YXRpYyBhZGp1c3RTZWxlY3Rpb24obW9kZWw6IElUZXh0TW9kZWwsIHNlbGVjdGlvbjogU2VsZWN0aW9uLCBvdmVyd3JpdGVCZWZvcmU6IG51bWJlciwgb3ZlcndyaXRlQWZ0ZXI6IG51bWJlcik6IFNlbGVjdGlvbiB7XG5cdFx0aWYgKG92ZXJ3cml0ZUJlZm9yZSAhPT0gMCB8fCBvdmVyd3JpdGVBZnRlciAhPT0gMCkge1xuXHRcdFx0Ly8gb3ZlcndyaXRlW0JlZm9yZXxBZnRlcl0gaXMgY29tcHV0ZSB1c2luZyB0aGUgcG9zaXRpb24sIG5vdCB0aGUgd2hvbGVcblx0XHRcdC8vIHNlbGVjdGlvbi4gdGhlcmVmb3JlIHdlIGFkanVzdCB0aGUgc2VsZWN0aW9uIGFyb3VuZCB0aGF0IHBvc2l0aW9uXG5cdFx0XHRjb25zdCB7IHBvc2l0aW9uTGluZU51bWJlciwgcG9zaXRpb25Db2x1bW4gfSA9IHNlbGVjdGlvbjtcblx0XHRcdGNvbnN0IHBvc2l0aW9uQ29sdW1uQmVmb3JlID0gcG9zaXRpb25Db2x1bW4gLSBvdmVyd3JpdGVCZWZvcmU7XG5cdFx0XHRjb25zdCBwb3NpdGlvbkNvbHVtbkFmdGVyID0gcG9zaXRpb25Db2x1bW4gKyBvdmVyd3JpdGVBZnRlcjtcblxuXHRcdFx0Y29uc3QgcmFuZ2UgPSBtb2RlbC52YWxpZGF0ZVJhbmdlKHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiBwb3NpdGlvbkxpbmVOdW1iZXIsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiBwb3NpdGlvbkNvbHVtbkJlZm9yZSxcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogcG9zaXRpb25MaW5lTnVtYmVyLFxuXHRcdFx0XHRlbmRDb2x1bW46IHBvc2l0aW9uQ29sdW1uQWZ0ZXJcblx0XHRcdH0pO1xuXG5cdFx0XHRzZWxlY3Rpb24gPSBTZWxlY3Rpb24uY3JlYXRlV2l0aERpcmVjdGlvbihcblx0XHRcdFx0cmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbixcblx0XHRcdFx0cmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uLFxuXHRcdFx0XHRzZWxlY3Rpb24uZ2V0RGlyZWN0aW9uKClcblx0XHRcdCk7XG5cdFx0fVxuXHRcdHJldHVybiBzZWxlY3Rpb247XG5cdH1cblxuXHRzdGF0aWMgY3JlYXRlRWRpdHNBbmRTbmlwcGV0c0Zyb21TZWxlY3Rpb25zKGVkaXRvcjogSUFjdGl2ZUNvZGVFZGl0b3IsIHRlbXBsYXRlOiBzdHJpbmcsIG92ZXJ3cml0ZUJlZm9yZTogbnVtYmVyLCBvdmVyd3JpdGVBZnRlcjogbnVtYmVyLCBlbmZvcmNlRmluYWxUYWJzdG9wOiBib29sZWFuLCBhZGp1c3RXaGl0ZXNwYWNlOiBib29sZWFuLCBjbGlwYm9hcmRUZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQsIG92ZXJ0eXBpbmdDYXB0dXJlcjogT3ZlcnR5cGluZ0NhcHR1cmVyIHwgdW5kZWZpbmVkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk6IHsgZWRpdHM6IElJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbltdOyBzbmlwcGV0czogT25lU25pcHBldFtdIH0ge1xuXHRcdGNvbnN0IGVkaXRzOiBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IHNuaXBwZXRzOiBPbmVTbmlwcGV0W10gPSBbXTtcblxuXHRcdGlmICghZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybiB7IGVkaXRzLCBzbmlwcGV0cyB9O1xuXHRcdH1cblx0XHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlU2VydmljZSA9IGVkaXRvci5pbnZva2VXaXRoaW5Db250ZXh0KGFjY2Vzc29yID0+IGFjY2Vzc29yLmdldChJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UpKTtcblx0XHRjb25zdCBtb2RlbEJhc2VkVmFyaWFibGVSZXNvbHZlciA9IGVkaXRvci5pbnZva2VXaXRoaW5Db250ZXh0KGFjY2Vzc29yID0+IG5ldyBNb2RlbEJhc2VkVmFyaWFibGVSZXNvbHZlcihhY2Nlc3Nvci5nZXQoSUxhYmVsU2VydmljZSksIG1vZGVsKSk7XG5cdFx0Y29uc3QgcmVhZENsaXBib2FyZFRleHQgPSAoKSA9PiBjbGlwYm9hcmRUZXh0O1xuXG5cdFx0Ly8ga25vdyB3aGF0IHRleHQgdGhlIG92ZXJ3cml0ZVtCZWZvcmV8QWZ0ZXJdIGV4dGVuc2lvbnNcblx0XHQvLyBvZiB0aGUgcHJpbWFyeSBjdXJzb3IgaGF2ZSBzZWxlY3RlZCBiZWNhdXNlIG9ubHkgd2hlblxuXHRcdC8vIHNlY29uZGFyeSBzZWxlY3Rpb25zIGV4dGVuZCB0byB0aGUgc2FtZSB0ZXh0IHdlIGNhbiBncm93IHRoZW1cblx0XHRjb25zdCBmaXJzdEJlZm9yZVRleHQgPSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UoU25pcHBldFNlc3Npb24uYWRqdXN0U2VsZWN0aW9uKG1vZGVsLCBlZGl0b3IuZ2V0U2VsZWN0aW9uKCksIG92ZXJ3cml0ZUJlZm9yZSwgMCkpO1xuXHRcdGNvbnN0IGZpcnN0QWZ0ZXJUZXh0ID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKFNuaXBwZXRTZXNzaW9uLmFkanVzdFNlbGVjdGlvbihtb2RlbCwgZWRpdG9yLmdldFNlbGVjdGlvbigpLCAwLCBvdmVyd3JpdGVBZnRlcikpO1xuXG5cdFx0Ly8gcmVtZW1iZXIgdGhlIGZpcnN0IG5vbi13aGl0ZXNwYWNlIGNvbHVtbiB0byBkZWNpZGUgaWZcblx0XHQvLyBga2VlcFdoaXRlc3BhY2VgIHNob3VsZCBiZSBvdmVycnVsZWQgZm9yIHNlY29uZGFyeSBzZWxlY3Rpb25zXG5cdFx0Y29uc3QgZmlyc3RMaW5lRmlyc3ROb25XaGl0ZXNwYWNlID0gbW9kZWwuZ2V0TGluZUZpcnN0Tm9uV2hpdGVzcGFjZUNvbHVtbihlZGl0b3IuZ2V0U2VsZWN0aW9uKCkucG9zaXRpb25MaW5lTnVtYmVyKTtcblxuXHRcdC8vIHNvcnQgc2VsZWN0aW9ucyBieSB0aGVpciBzdGFydCBwb3NpdGlvbiBidXQgcmVtZWJlclxuXHRcdC8vIHRoZSBvcmlnaW5hbCBpbmRleC4gdGhhdCBhbGxvd3MgeW91IHRvIGNyZWF0ZSBjb3JyZWN0XG5cdFx0Ly8gb2Zmc2V0LWJhc2VkIHNlbGVjdGlvbiBsb2dpYyB3aXRob3V0IGNoYW5naW5nIHRoZVxuXHRcdC8vIHByaW1hcnkgc2VsZWN0aW9uXG5cdFx0Y29uc3QgaW5kZXhlZFNlbGVjdGlvbnMgPSBlZGl0b3IuZ2V0U2VsZWN0aW9ucygpXG5cdFx0XHQubWFwKChzZWxlY3Rpb24sIGlkeCkgPT4gKHsgc2VsZWN0aW9uLCBpZHggfSkpXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gUmFuZ2UuY29tcGFyZVJhbmdlc1VzaW5nU3RhcnRzKGEuc2VsZWN0aW9uLCBiLnNlbGVjdGlvbikpO1xuXG5cdFx0Zm9yIChjb25zdCB7IHNlbGVjdGlvbiwgaWR4IH0gb2YgaW5kZXhlZFNlbGVjdGlvbnMpIHtcblxuXHRcdFx0Ly8gZXh0ZW5kIHNlbGVjdGlvbiB3aXRoIHRoZSBgb3ZlcndyaXRlQmVmb3JlYCBhbmQgYG92ZXJ3cml0ZUFmdGVyYCBhbmQgdGhlblxuXHRcdFx0Ly8gY29tcGFyZSBpZiB0aGlzIG1hdGNoZXMgdGhlIGV4dGVuc2lvbnMgb2YgdGhlIHByaW1hcnkgc2VsZWN0aW9uXG5cdFx0XHRsZXQgZXh0ZW5zaW9uQmVmb3JlID0gU25pcHBldFNlc3Npb24uYWRqdXN0U2VsZWN0aW9uKG1vZGVsLCBzZWxlY3Rpb24sIG92ZXJ3cml0ZUJlZm9yZSwgMCk7XG5cdFx0XHRsZXQgZXh0ZW5zaW9uQWZ0ZXIgPSBTbmlwcGV0U2Vzc2lvbi5hZGp1c3RTZWxlY3Rpb24obW9kZWwsIHNlbGVjdGlvbiwgMCwgb3ZlcndyaXRlQWZ0ZXIpO1xuXHRcdFx0aWYgKGZpcnN0QmVmb3JlVGV4dCAhPT0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKGV4dGVuc2lvbkJlZm9yZSkpIHtcblx0XHRcdFx0ZXh0ZW5zaW9uQmVmb3JlID0gc2VsZWN0aW9uO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGZpcnN0QWZ0ZXJUZXh0ICE9PSBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UoZXh0ZW5zaW9uQWZ0ZXIpKSB7XG5cdFx0XHRcdGV4dGVuc2lvbkFmdGVyID0gc2VsZWN0aW9uO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBtZXJnZSB0aGUgYmVmb3JlIGFuZCBhZnRlciBzZWxlY3Rpb24gaW50byBvbmVcblx0XHRcdGNvbnN0IHNuaXBwZXRTZWxlY3Rpb24gPSBzZWxlY3Rpb25cblx0XHRcdFx0LnNldFN0YXJ0UG9zaXRpb24oZXh0ZW5zaW9uQmVmb3JlLnN0YXJ0TGluZU51bWJlciwgZXh0ZW5zaW9uQmVmb3JlLnN0YXJ0Q29sdW1uKVxuXHRcdFx0XHQuc2V0RW5kUG9zaXRpb24oZXh0ZW5zaW9uQWZ0ZXIuZW5kTGluZU51bWJlciwgZXh0ZW5zaW9uQWZ0ZXIuZW5kQ29sdW1uKTtcblxuXHRcdFx0Y29uc3Qgc25pcHBldCA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UodGVtcGxhdGUsIHRydWUsIGVuZm9yY2VGaW5hbFRhYnN0b3ApO1xuXG5cdFx0XHQvLyBhZGp1c3QgdGhlIHRlbXBsYXRlIHN0cmluZyB0byBtYXRjaCB0aGUgaW5kZW50YXRpb24gYW5kXG5cdFx0XHQvLyB3aGl0ZXNwYWNlIHJ1bGVzIG9mIHRoaXMgaW5zZXJ0IGxvY2F0aW9uIChjYW4gYmUgZGlmZmVyZW50IGZvciBlYWNoIGN1cnNvcilcblx0XHRcdC8vIGhhcHBlbnMgd2hlbiBiZWluZyBhc2tlZCBmb3IgKGRlZmF1bHQpIG9yIHdoZW4gdGhpcyBpcyBhIHNlY29uZGFyeVxuXHRcdFx0Ly8gY3Vyc29yIGFuZCB0aGUgbGVhZGluZyB3aGl0ZXNwYWNlIGlzIGRpZmZlcmVudFxuXHRcdFx0Y29uc3Qgc3RhcnQgPSBzbmlwcGV0U2VsZWN0aW9uLmdldFN0YXJ0UG9zaXRpb24oKTtcblx0XHRcdGNvbnN0IHNuaXBwZXRMaW5lTGVhZGluZ1doaXRlc3BhY2UgPSBTbmlwcGV0U2Vzc2lvbi5hZGp1c3RXaGl0ZXNwYWNlKFxuXHRcdFx0XHRtb2RlbCwgc3RhcnQsXG5cdFx0XHRcdGFkanVzdFdoaXRlc3BhY2UgfHwgKGlkeCA+IDAgJiYgZmlyc3RMaW5lRmlyc3ROb25XaGl0ZXNwYWNlICE9PSBtb2RlbC5nZXRMaW5lRmlyc3ROb25XaGl0ZXNwYWNlQ29sdW1uKHNlbGVjdGlvbi5wb3NpdGlvbkxpbmVOdW1iZXIpKSxcblx0XHRcdFx0c25pcHBldCxcblx0XHRcdCk7XG5cblx0XHRcdHNuaXBwZXQucmVzb2x2ZVZhcmlhYmxlcyhuZXcgQ29tcG9zaXRlU25pcHBldFZhcmlhYmxlUmVzb2x2ZXIoW1xuXHRcdFx0XHRtb2RlbEJhc2VkVmFyaWFibGVSZXNvbHZlcixcblx0XHRcdFx0bmV3IENsaXBib2FyZEJhc2VkVmFyaWFibGVSZXNvbHZlcihyZWFkQ2xpcGJvYXJkVGV4dCwgaWR4LCBpbmRleGVkU2VsZWN0aW9ucy5sZW5ndGgsIGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLm11bHRpQ3Vyc29yUGFzdGUpID09PSAnc3ByZWFkJyksXG5cdFx0XHRcdG5ldyBTZWxlY3Rpb25CYXNlZFZhcmlhYmxlUmVzb2x2ZXIobW9kZWwsIHNlbGVjdGlvbiwgaWR4LCBvdmVydHlwaW5nQ2FwdHVyZXIpLFxuXHRcdFx0XHRuZXcgQ29tbWVudEJhc2VkVmFyaWFibGVSZXNvbHZlcihtb2RlbCwgc2VsZWN0aW9uLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSxcblx0XHRcdFx0bmV3IFRpbWVCYXNlZFZhcmlhYmxlUmVzb2x2ZXIsXG5cdFx0XHRcdG5ldyBXb3Jrc3BhY2VCYXNlZFZhcmlhYmxlUmVzb2x2ZXIod29ya3NwYWNlU2VydmljZSksXG5cdFx0XHRcdG5ldyBSYW5kb21CYXNlZFZhcmlhYmxlUmVzb2x2ZXIsXG5cdFx0XHRdKSk7XG5cblx0XHRcdC8vIHN0b3JlIHNuaXBwZXRzIHdpdGggdGhlIGluZGV4IG9mIHRoZWlyIG9yaWdpbmF0aW5nIHNlbGVjdGlvbi5cblx0XHRcdC8vIHRoYXQgZW5zdXJlcyB0aGUgcHJpbWFyeSBjdXJzb3Igc3RheXMgcHJpbWFyeSBkZXNwaXRlIG5vdCBiZWluZ1xuXHRcdFx0Ly8gdGhlIG9uZSB3aXRoIGxvd2VzdCBzdGFydCBwb3NpdGlvblxuXHRcdFx0ZWRpdHNbaWR4XSA9IEVkaXRPcGVyYXRpb24ucmVwbGFjZShzbmlwcGV0U2VsZWN0aW9uLCBzbmlwcGV0LnRvU3RyaW5nKCkpO1xuXHRcdFx0ZWRpdHNbaWR4XS5pZGVudGlmaWVyID0geyBtYWpvcjogaWR4LCBtaW5vcjogMCB9OyAvLyBtYXJrIHRoZSBlZGl0IHNvIG9ubHkgb3VyIHVuZG8gZWRpdHMgd2lsbCBiZSB1c2VkIHRvIGdlbmVyYXRlIGVuZCBjdXJzb3JzXG5cdFx0XHRlZGl0c1tpZHhdLl9pc1RyYWNrZWQgPSB0cnVlO1xuXHRcdFx0c25pcHBldHNbaWR4XSA9IG5ldyBPbmVTbmlwcGV0KGVkaXRvciwgc25pcHBldCwgc25pcHBldExpbmVMZWFkaW5nV2hpdGVzcGFjZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgZWRpdHMsIHNuaXBwZXRzIH07XG5cdH1cblxuXHRzdGF0aWMgY3JlYXRlRWRpdHNBbmRTbmlwcGV0c0Zyb21FZGl0cyhlZGl0b3I6IElBY3RpdmVDb2RlRWRpdG9yLCBzbmlwcGV0RWRpdHM6IElTbmlwcGV0RWRpdFtdLCBlbmZvcmNlRmluYWxUYWJzdG9wOiBib29sZWFuLCBhZGp1c3RXaGl0ZXNwYWNlOiBib29sZWFuLCBjbGlwYm9hcmRUZXh0OiBzdHJpbmcgfCB1bmRlZmluZWQsIG92ZXJ0eXBpbmdDYXB0dXJlcjogT3ZlcnR5cGluZ0NhcHR1cmVyIHwgdW5kZWZpbmVkLCBsYW5ndWFnZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk6IHsgZWRpdHM6IElJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbltdOyBzbmlwcGV0czogT25lU25pcHBldFtdIH0ge1xuXG5cdFx0aWYgKCFlZGl0b3IuaGFzTW9kZWwoKSB8fCBzbmlwcGV0RWRpdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4geyBlZGl0czogW10sIHNuaXBwZXRzOiBbXSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGVkaXRzOiBJSWRlbnRpZmllZFNpbmdsZUVkaXRPcGVyYXRpb25bXSA9IFtdO1xuXHRcdGNvbnN0IG1vZGVsID0gZWRpdG9yLmdldE1vZGVsKCk7XG5cblx0XHRjb25zdCBwYXJzZXIgPSBuZXcgU25pcHBldFBhcnNlcigpO1xuXHRcdGNvbnN0IHNuaXBwZXQgPSBuZXcgVGV4dG1hdGVTbmlwcGV0KCk7XG5cblx0XHRjb25zdCBtb2RlbEJhc2VkVmFyaWFibGVSZXNvbHZlciA9IGVkaXRvci5pbnZva2VXaXRoaW5Db250ZXh0KGFjY2Vzc29yID0+IG5ldyBNb2RlbEJhc2VkVmFyaWFibGVSZXNvbHZlcihhY2Nlc3Nvci5nZXQoSUxhYmVsU2VydmljZSksIG1vZGVsKSk7XG5cdFx0Y29uc3QgdGltZUJhc2VkVmFyaWFibGVSZXNvbHZlciA9IG5ldyBUaW1lQmFzZWRWYXJpYWJsZVJlc29sdmVyO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUJhc2VkVmFyaWFibGVSZXNvbHZlciA9IG5ldyBXb3Jrc3BhY2VCYXNlZFZhcmlhYmxlUmVzb2x2ZXIoZWRpdG9yLmludm9rZVdpdGhpbkNvbnRleHQoYWNjZXNzb3IgPT4gYWNjZXNzb3IuZ2V0KElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSkpKTtcblx0XHRjb25zdCByYW5kb21CYXNlZFZhcmlhYmxlUmVzb2x2ZXIgPSBuZXcgUmFuZG9tQmFzZWRWYXJpYWJsZVJlc29sdmVyO1xuXHRcdGNvbnN0IHJlYWRDbGlwYm9hcmRUZXh0ID0gKCkgPT4gY2xpcGJvYXJkVGV4dDtcblx0XHRjb25zdCBjbGlwYm9hcmRTcHJlYWQgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5tdWx0aUN1cnNvclBhc3RlKSA9PT0gJ3NwcmVhZCc7XG5cblx0XHQvLyBrZWVwIGNhbGxlcidzIG9yaWdpbmFsIGluZGV4IHNvICRDVVJTT1JfSU5ERVgvJENVUlNPUl9OVU1CRVIgcmVmbGVjdCBpbnB1dCBvcmRlciwgbm90IHJhbmdlLXNvcnRlZCBvcmRlclxuXHRcdGNvbnN0IGluZGV4ZWRTbmlwcGV0RWRpdHMgPSBzbmlwcGV0RWRpdHNcblx0XHRcdC5tYXAoKGVkaXQsIGlkeCkgPT4gKHsgZWRpdCwgaWR4IH0pKVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IFJhbmdlLmNvbXBhcmVSYW5nZXNVc2luZ1N0YXJ0cyhhLmVkaXQucmFuZ2UsIGIuZWRpdC5yYW5nZSkpO1xuXG5cdFx0bGV0IG9mZnNldCA9IDA7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBpbmRleGVkU25pcHBldEVkaXRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCB7IGVkaXQ6IHsgcmFuZ2UsIHRlbXBsYXRlLCBrZWVwV2hpdGVzcGFjZSB9LCBpZHggfSA9IGluZGV4ZWRTbmlwcGV0RWRpdHNbaV07XG5cblx0XHRcdC8vIGdhcHMgYmV0d2VlbiBzbmlwcGV0IGVkaXRzIGFyZSBhcHBlbmRlZCBhcyB0ZXh0IG5vZGVzLiB0aGlzXG5cdFx0XHQvLyBlbnN1cmVzIHBsYWNlaG9sZGVyLW9mZnNldHMgYXJlIGxhdGVyIGNvcnJlY3Rcblx0XHRcdGlmIChpID4gMCkge1xuXHRcdFx0XHRjb25zdCBsYXN0UmFuZ2UgPSBpbmRleGVkU25pcHBldEVkaXRzW2kgLSAxXS5lZGl0LnJhbmdlO1xuXHRcdFx0XHRjb25zdCB0ZXh0UmFuZ2UgPSBSYW5nZS5mcm9tUG9zaXRpb25zKGxhc3RSYW5nZS5nZXRFbmRQb3NpdGlvbigpLCByYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHRcdFx0XHRjb25zdCB0ZXh0Tm9kZSA9IG5ldyBUZXh0KG1vZGVsLmdldFZhbHVlSW5SYW5nZSh0ZXh0UmFuZ2UpKTtcblx0XHRcdFx0c25pcHBldC5hcHBlbmRDaGlsZCh0ZXh0Tm9kZSk7XG5cdFx0XHRcdG9mZnNldCArPSB0ZXh0Tm9kZS52YWx1ZS5sZW5ndGg7XG5cdFx0XHR9XG5cblx0XHRcdC8vIHNuYXBzaG90IGFscmVhZHktcmVzb2x2ZWQgdmFyaWFibGVzIHNvIHRoaXMgZWRpdCdzIHJlc29sdmVyIG9ubHkgdG91Y2hlc1xuXHRcdFx0Ly8gKGEpIHZhcmlhYmxlcyBpbiB0aGUgbmV3bHkgcGFyc2VkIGZyYWdtZW50IGFuZCAoYikgY2xvbmVzIGJhY2tmaWxsZWQgYnlcblx0XHRcdC8vIHBhcnNlRnJhZ21lbnQgaW50byBlYXJsaWVyIHBsYWNlaG9sZGVycyBzaGFyaW5nIHRoZSBzYW1lIGluZGV4ICgjMjA2MTIxKVxuXHRcdFx0Y29uc3QgcHJlRXhpc3RpbmdWYXJpYWJsZXMgPSBuZXcgU2V0PFZhcmlhYmxlPigpO1xuXHRcdFx0c25pcHBldC53YWxrKG1hcmtlciA9PiB7XG5cdFx0XHRcdGlmIChtYXJrZXIgaW5zdGFuY2VvZiBWYXJpYWJsZSkge1xuXHRcdFx0XHRcdHByZUV4aXN0aW5nVmFyaWFibGVzLmFkZChtYXJrZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IG5ld05vZGVzID0gcGFyc2VyLnBhcnNlRnJhZ21lbnQodGVtcGxhdGUsIHNuaXBwZXQpO1xuXHRcdFx0U25pcHBldFNlc3Npb24uYWRqdXN0V2hpdGVzcGFjZShtb2RlbCwgcmFuZ2UuZ2V0U3RhcnRQb3NpdGlvbigpLCBrZWVwV2hpdGVzcGFjZSAhPT0gdW5kZWZpbmVkID8gIWtlZXBXaGl0ZXNwYWNlIDogYWRqdXN0V2hpdGVzcGFjZSwgc25pcHBldCwgbmV3IFNldChuZXdOb2RlcykpO1xuXG5cdFx0XHRjb25zdCBlZGl0U2VsZWN0aW9uID0gU2VsZWN0aW9uLmZyb21SYW5nZShyYW5nZSwgU2VsZWN0aW9uRGlyZWN0aW9uLkxUUik7XG5cdFx0XHRjb25zdCBlZGl0UmVzb2x2ZXIgPSBuZXcgQ29tcG9zaXRlU25pcHBldFZhcmlhYmxlUmVzb2x2ZXIoW1xuXHRcdFx0XHRtb2RlbEJhc2VkVmFyaWFibGVSZXNvbHZlcixcblx0XHRcdFx0bmV3IENsaXBib2FyZEJhc2VkVmFyaWFibGVSZXNvbHZlcihyZWFkQ2xpcGJvYXJkVGV4dCwgaWR4LCBpbmRleGVkU25pcHBldEVkaXRzLmxlbmd0aCwgY2xpcGJvYXJkU3ByZWFkKSxcblx0XHRcdFx0bmV3IFNlbGVjdGlvbkJhc2VkVmFyaWFibGVSZXNvbHZlcihtb2RlbCwgZWRpdFNlbGVjdGlvbiwgaWR4LCBvdmVydHlwaW5nQ2FwdHVyZXIpLFxuXHRcdFx0XHRuZXcgQ29tbWVudEJhc2VkVmFyaWFibGVSZXNvbHZlcihtb2RlbCwgZWRpdFNlbGVjdGlvbiwgbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSksXG5cdFx0XHRcdHRpbWVCYXNlZFZhcmlhYmxlUmVzb2x2ZXIsXG5cdFx0XHRcdHdvcmtzcGFjZUJhc2VkVmFyaWFibGVSZXNvbHZlcixcblx0XHRcdFx0cmFuZG9tQmFzZWRWYXJpYWJsZVJlc29sdmVyLFxuXHRcdFx0XSk7XG5cblx0XHRcdHNuaXBwZXQud2FsayhtYXJrZXIgPT4ge1xuXHRcdFx0XHRpZiAobWFya2VyIGluc3RhbmNlb2YgVmFyaWFibGUgJiYgIXByZUV4aXN0aW5nVmFyaWFibGVzLmhhcyhtYXJrZXIpKSB7XG5cdFx0XHRcdFx0bWFya2VyLnJlc29sdmUoZWRpdFJlc29sdmVyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBzbmlwcGV0VGV4dCA9IHNuaXBwZXQudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IHNuaXBwZXRGcmFnbWVudFRleHQgPSBzbmlwcGV0VGV4dC5zbGljZShvZmZzZXQpO1xuXHRcdFx0b2Zmc2V0ID0gc25pcHBldFRleHQubGVuZ3RoO1xuXG5cdFx0XHQvLyBtYWtlIGVkaXRcblx0XHRcdGNvbnN0IGVkaXQ6IElJZGVudGlmaWVkU2luZ2xlRWRpdE9wZXJhdGlvbiA9IEVkaXRPcGVyYXRpb24ucmVwbGFjZShyYW5nZSwgc25pcHBldEZyYWdtZW50VGV4dCk7XG5cdFx0XHRlZGl0LmlkZW50aWZpZXIgPSB7IG1ham9yOiBpLCBtaW5vcjogMCB9OyAvLyBtYXJrIHRoZSBlZGl0IHNvIG9ubHkgb3VyIHVuZG8gZWRpdHMgd2lsbCBiZSB1c2VkIHRvIGdlbmVyYXRlIGVuZCBjdXJzb3JzXG5cdFx0XHRlZGl0Ll9pc1RyYWNrZWQgPSB0cnVlO1xuXHRcdFx0ZWRpdHMucHVzaChlZGl0KTtcblx0XHR9XG5cblx0XHQvL1xuXHRcdHBhcnNlci5lbnN1cmVGaW5hbFRhYnN0b3Aoc25pcHBldCwgZW5mb3JjZUZpbmFsVGFic3RvcCwgdHJ1ZSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZWRpdHMsXG5cdFx0XHRzbmlwcGV0czogW25ldyBPbmVTbmlwcGV0KGVkaXRvciwgc25pcHBldCwgJycpXVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF90ZW1wbGF0ZU1lcmdlczogW251bWJlciwgbnVtYmVyLCBzdHJpbmcgfCBJU25pcHBldEVkaXRbXV1bXSA9IFtdO1xuXHRwcml2YXRlIF9zbmlwcGV0czogT25lU25pcHBldFtdID0gW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQWN0aXZlQ29kZUVkaXRvcixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZW1wbGF0ZTogc3RyaW5nIHwgSVNuaXBwZXRFZGl0W10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfb3B0aW9uczogSVNuaXBwZXRTZXNzaW9uSW5zZXJ0T3B0aW9ucyA9IF9kZWZhdWx0T3B0aW9ucyxcblx0XHRASUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZTogSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7IH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGRpc3Bvc2UodGhpcy5fc25pcHBldHMpO1xuXHR9XG5cblx0X2xvZ0luZm8oKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYHRlbXBsYXRlPVwiJHt0aGlzLl90ZW1wbGF0ZX1cIiwgbWVyZ2VkX3RlbXBsYXRlcz1cIiR7dGhpcy5fdGVtcGxhdGVNZXJnZXMuam9pbignIC0+ICcpfVwiYDtcblx0fVxuXG5cdGluc2VydChlZGl0UmVhc29uPzogVGV4dE1vZGVsRWRpdFNvdXJjZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fZWRpdG9yLmhhc01vZGVsKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBtYWtlIGluc2VydCBlZGl0IGFuZCBzdGFydCB3aXRoIGZpcnN0IHNlbGVjdGlvbnNcblx0XHRjb25zdCB7IGVkaXRzLCBzbmlwcGV0cyB9ID0gdHlwZW9mIHRoaXMuX3RlbXBsYXRlID09PSAnc3RyaW5nJ1xuXHRcdFx0PyBTbmlwcGV0U2Vzc2lvbi5jcmVhdGVFZGl0c0FuZFNuaXBwZXRzRnJvbVNlbGVjdGlvbnModGhpcy5fZWRpdG9yLCB0aGlzLl90ZW1wbGF0ZSwgdGhpcy5fb3B0aW9ucy5vdmVyd3JpdGVCZWZvcmUsIHRoaXMuX29wdGlvbnMub3ZlcndyaXRlQWZ0ZXIsIGZhbHNlLCB0aGlzLl9vcHRpb25zLmFkanVzdFdoaXRlc3BhY2UsIHRoaXMuX29wdGlvbnMuY2xpcGJvYXJkVGV4dCwgdGhpcy5fb3B0aW9ucy5vdmVydHlwaW5nQ2FwdHVyZXIsIHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpXG5cdFx0XHQ6IFNuaXBwZXRTZXNzaW9uLmNyZWF0ZUVkaXRzQW5kU25pcHBldHNGcm9tRWRpdHModGhpcy5fZWRpdG9yLCB0aGlzLl90ZW1wbGF0ZSwgZmFsc2UsIHRoaXMuX29wdGlvbnMuYWRqdXN0V2hpdGVzcGFjZSwgdGhpcy5fb3B0aW9ucy5jbGlwYm9hcmRUZXh0LCB0aGlzLl9vcHRpb25zLm92ZXJ0eXBpbmdDYXB0dXJlciwgdGhpcy5fbGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHR0aGlzLl9zbmlwcGV0cyA9IHNuaXBwZXRzO1xuXG5cdFx0dGhpcy5fZWRpdG9yLmV4ZWN1dGVFZGl0cyhlZGl0UmVhc29uID8/IEVkaXRTb3VyY2VzLnNuaXBwZXQoKSwgZWRpdHMsIF91bmRvRWRpdHMgPT4ge1xuXHRcdFx0Ly8gU29tZXRpbWVzLCB0aGUgdGV4dCBidWZmZXIgd2lsbCByZW1vdmUgYXV0b21hdGljIHdoaXRlc3BhY2Ugd2hlbiBkb2luZyBhbnkgZWRpdHMsXG5cdFx0XHQvLyBzbyB3ZSBuZWVkIHRvIGxvb2sgb25seSBhdCB0aGUgdW5kbyBlZGl0cyByZWxldmFudCBmb3IgdXMuXG5cdFx0XHQvLyBPdXIgZWRpdHMgaGF2ZSBhbiBpZGVudGlmaWVyIHNldCBzbyB0aGF0J3MgaG93IHdlIGNhbiBkaXN0aW5ndWlzaCB0aGVtXG5cdFx0XHRjb25zdCB1bmRvRWRpdHMgPSBfdW5kb0VkaXRzLmZpbHRlcihlZGl0ID0+ICEhZWRpdC5pZGVudGlmaWVyKTtcblx0XHRcdGZvciAobGV0IGlkeCA9IDA7IGlkeCA8IHNuaXBwZXRzLmxlbmd0aDsgaWR4KyspIHtcblx0XHRcdFx0c25pcHBldHNbaWR4XS5pbml0aWFsaXplKHVuZG9FZGl0c1tpZHhdLnRleHRDaGFuZ2UpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5fc25pcHBldHNbMF0uaGFzUGxhY2Vob2xkZXIpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX21vdmUodHJ1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdW5kb0VkaXRzXG5cdFx0XHRcdFx0Lm1hcChlZGl0ID0+IFNlbGVjdGlvbi5mcm9tUG9zaXRpb25zKGVkaXQucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdHRoaXMuX2VkaXRvci5yZXZlYWxSYW5nZSh0aGlzLl9lZGl0b3IuZ2V0U2VsZWN0aW9ucygpWzBdKTtcblx0fVxuXG5cdG1lcmdlKHRlbXBsYXRlOiBzdHJpbmcsIG9wdGlvbnM6IElTbmlwcGV0U2Vzc2lvbkluc2VydE9wdGlvbnMgPSBfZGVmYXVsdE9wdGlvbnMpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2VkaXRvci5oYXNNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3RlbXBsYXRlTWVyZ2VzLnB1c2goW3RoaXMuX3NuaXBwZXRzWzBdLl9uZXN0aW5nTGV2ZWwsIHRoaXMuX3NuaXBwZXRzWzBdLl9wbGFjZWhvbGRlckdyb3Vwc0lkeCwgdGVtcGxhdGVdKTtcblx0XHRjb25zdCB7IGVkaXRzLCBzbmlwcGV0cyB9ID0gU25pcHBldFNlc3Npb24uY3JlYXRlRWRpdHNBbmRTbmlwcGV0c0Zyb21TZWxlY3Rpb25zKHRoaXMuX2VkaXRvciwgdGVtcGxhdGUsIG9wdGlvbnMub3ZlcndyaXRlQmVmb3JlLCBvcHRpb25zLm92ZXJ3cml0ZUFmdGVyLCB0cnVlLCBvcHRpb25zLmFkanVzdFdoaXRlc3BhY2UsIG9wdGlvbnMuY2xpcGJvYXJkVGV4dCwgb3B0aW9ucy5vdmVydHlwaW5nQ2FwdHVyZXIsIHRoaXMuX2xhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy5fZWRpdG9yLmV4ZWN1dGVFZGl0cygnc25pcHBldCcsIGVkaXRzLCBfdW5kb0VkaXRzID0+IHtcblx0XHRcdC8vIFNvbWV0aW1lcywgdGhlIHRleHQgYnVmZmVyIHdpbGwgcmVtb3ZlIGF1dG9tYXRpYyB3aGl0ZXNwYWNlIHdoZW4gZG9pbmcgYW55IGVkaXRzLFxuXHRcdFx0Ly8gc28gd2UgbmVlZCB0byBsb29rIG9ubHkgYXQgdGhlIHVuZG8gZWRpdHMgcmVsZXZhbnQgZm9yIHVzLlxuXHRcdFx0Ly8gT3VyIGVkaXRzIGhhdmUgYW4gaWRlbnRpZmllciBzZXQgc28gdGhhdCdzIGhvdyB3ZSBjYW4gZGlzdGluZ3Vpc2ggdGhlbVxuXHRcdFx0Y29uc3QgdW5kb0VkaXRzID0gX3VuZG9FZGl0cy5maWx0ZXIoZWRpdCA9PiAhIWVkaXQuaWRlbnRpZmllcik7XG5cdFx0XHRmb3IgKGxldCBpZHggPSAwOyBpZHggPCBzbmlwcGV0cy5sZW5ndGg7IGlkeCsrKSB7XG5cdFx0XHRcdHNuaXBwZXRzW2lkeF0uaW5pdGlhbGl6ZSh1bmRvRWRpdHNbaWR4XS50ZXh0Q2hhbmdlKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVHJpdmlhbCBzbmlwcGV0cyBoYXZlIG5vIHBsYWNlaG9sZGVyIG9yIGFyZSBqdXN0IHRoZSBmaW5hbCBwbGFjZWhvbGRlci4gVGhhdCBtZWFucyB0aGV5XG5cdFx0XHQvLyBhcmUganVzdCB0ZXh0IGluc2VydGlvbnMgYW5kIHdlIGRvbid0IG5lZWQgdG8gbWVyZ2UgdGhlIG5lc3RlZCBzbmlwcGV0IGludG8gdGhlIGV4aXN0aW5nXG5cdFx0XHQvLyBzbmlwcGV0XG5cdFx0XHRjb25zdCBpc1RyaXZpYWxTbmlwcGV0ID0gc25pcHBldHNbMF0uaXNUcml2aWFsU25pcHBldDtcblx0XHRcdC8vIE9ubHkgbWVyZ2Ugd2hlbiBlYWNoIGFjdGl2ZSBwbGFjZWhvbGRlciBvY2N1cnJlbmNlIGhhcyBhIG1hdGNoaW5nIG5lc3RlZCBzbmlwcGV0LlxuXHRcdFx0Ly8gQ3Vyc29yIG5vcm1hbGl6YXRpb24gb3IgZXh0ZXJuYWwgc2VsZWN0aW9uIGNoYW5nZXMgY2FuIGNvbGxhcHNlIHNlbGVjdGlvbnMsIGxlYXZpbmdcblx0XHRcdC8vIGZld2VyIG5lc3RlZCBzbmlwcGV0cyB0aGFuIHBsYWNlaG9sZGVyIG9jY3VycmVuY2VzIGFuZCBwcmV2aW91c2x5IGNyYXNoaW5nIHRoZSBtZXJnZS5cblx0XHRcdGNvbnN0IGNhbk1lcmdlU25pcHBldHMgPSBzbmlwcGV0cy5sZW5ndGggPT09IHRoaXMuX3NuaXBwZXRzLnJlZHVjZSgoY291bnQsIHNuaXBwZXQpID0+IGNvdW50ICsgc25pcHBldC5hY3RpdmVQbGFjZWhvbGRlckNvdW50LCAwKTtcblx0XHRcdGlmICghaXNUcml2aWFsU25pcHBldCAmJiBjYW5NZXJnZVNuaXBwZXRzKSB7XG5cdFx0XHRcdGZvciAoY29uc3Qgc25pcHBldCBvZiB0aGlzLl9zbmlwcGV0cykge1xuXHRcdFx0XHRcdHNuaXBwZXQubWVyZ2Uoc25pcHBldHMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnNvbGUuYXNzZXJ0KHNuaXBwZXRzLmxlbmd0aCA9PT0gMCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9zbmlwcGV0c1swXS5oYXNQbGFjZWhvbGRlciAmJiAhaXNUcml2aWFsU25pcHBldCAmJiBjYW5NZXJnZVNuaXBwZXRzKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9tb3ZlKHVuZGVmaW5lZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gdW5kb0VkaXRzLm1hcChlZGl0ID0+IFNlbGVjdGlvbi5mcm9tUG9zaXRpb25zKGVkaXQucmFuZ2UuZ2V0RW5kUG9zaXRpb24oKSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0bmV4dCgpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdTZWxlY3Rpb25zID0gdGhpcy5fbW92ZSh0cnVlKTtcblx0XHRpZiAobmV3U2VsZWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3Iuc2V0U2VsZWN0aW9ucyhuZXdTZWxlY3Rpb25zKTtcblx0XHRcdHRoaXMuX2VkaXRvci5yZXZlYWxQb3NpdGlvbkluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQobmV3U2VsZWN0aW9uc1swXS5nZXRQb3NpdGlvbigpKTtcblx0XHR9XG5cdH1cblxuXHRwcmV2KCk6IHZvaWQge1xuXHRcdGNvbnN0IG5ld1NlbGVjdGlvbnMgPSB0aGlzLl9tb3ZlKGZhbHNlKTtcblx0XHRpZiAobmV3U2VsZWN0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9lZGl0b3Iuc2V0U2VsZWN0aW9ucyhuZXdTZWxlY3Rpb25zKTtcblx0XHRcdHRoaXMuX2VkaXRvci5yZXZlYWxQb3NpdGlvbkluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQobmV3U2VsZWN0aW9uc1swXS5nZXRQb3NpdGlvbigpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9tb3ZlKGZ3ZDogYm9vbGVhbiB8IHVuZGVmaW5lZCk6IFNlbGVjdGlvbltdIHtcblx0XHRjb25zdCBzZWxlY3Rpb25zOiBTZWxlY3Rpb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qgc25pcHBldCBvZiB0aGlzLl9zbmlwcGV0cykge1xuXHRcdFx0Y29uc3Qgb25lU2VsZWN0aW9uID0gc25pcHBldC5tb3ZlKGZ3ZCk7XG5cdFx0XHRzZWxlY3Rpb25zLnB1c2goLi4ub25lU2VsZWN0aW9uKTtcblx0XHR9XG5cdFx0cmV0dXJuIHNlbGVjdGlvbnM7XG5cdH1cblxuXHRnZXQgaXNBdEZpcnN0UGxhY2Vob2xkZXIoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NuaXBwZXRzWzBdLmlzQXRGaXJzdFBsYWNlaG9sZGVyO1xuXHR9XG5cblx0Z2V0IGlzQXRMYXN0UGxhY2Vob2xkZXIoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NuaXBwZXRzWzBdLmlzQXRMYXN0UGxhY2Vob2xkZXI7XG5cdH1cblxuXHRnZXQgaGFzUGxhY2Vob2xkZXIoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NuaXBwZXRzWzBdLmhhc1BsYWNlaG9sZGVyO1xuXHR9XG5cblx0Z2V0IGhhc0Nob2ljZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc25pcHBldHNbMF0uaGFzQ2hvaWNlO1xuXHR9XG5cblx0Z2V0IGFjdGl2ZUNob2ljZSgpOiB7IGNob2ljZTogQ2hvaWNlOyByYW5nZTogUmFuZ2UgfSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3NuaXBwZXRzWzBdLmFjdGl2ZUNob2ljZTtcblx0fVxuXG5cdGlzU2VsZWN0aW9uV2l0aGluUGxhY2Vob2xkZXJzKCk6IGJvb2xlYW4ge1xuXG5cdFx0aWYgKCF0aGlzLmhhc1BsYWNlaG9sZGVyKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VsZWN0aW9ucyA9IHRoaXMuX2VkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0aWYgKHNlbGVjdGlvbnMubGVuZ3RoIDwgdGhpcy5fc25pcHBldHMubGVuZ3RoKSB7XG5cdFx0XHQvLyB0aGlzIG1lYW5zIHdlIHN0YXJ0ZWQgc25pcHBldCBtb2RlIHdpdGggTlxuXHRcdFx0Ly8gc2VsZWN0aW9ucyBhbmQgaGF2ZSBNIChOID4gTSkgc2VsZWN0aW9ucy5cblx0XHRcdC8vIFNvIG9uZSBzbmlwcGV0IGlzIHdpdGhvdXQgc2VsZWN0aW9uIC0+IGNhbmNlbFxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsbFBvc3NpYmxlU2VsZWN0aW9ucyA9IG5ldyBNYXA8bnVtYmVyLCBSYW5nZVtdPigpO1xuXHRcdGZvciAoY29uc3Qgc25pcHBldCBvZiB0aGlzLl9zbmlwcGV0cykge1xuXG5cdFx0XHRjb25zdCBwb3NzaWJsZVNlbGVjdGlvbnMgPSBzbmlwcGV0LmNvbXB1dGVQb3NzaWJsZVNlbGVjdGlvbnMoKTtcblxuXHRcdFx0Ly8gZm9yIHRoZSBmaXJzdCBzbmlwcGV0IGZpbmQgdGhlIHBsYWNlaG9sZGVyIChhbmQgaXRzIHJhbmdlcylcblx0XHRcdC8vIHRoYXQgY29udGFpbiBhdCBsZWFzdCBvbmUgc2VsZWN0aW9uLiBmb3IgYWxsIHJlbWFpbmluZyBzbmlwcGV0c1xuXHRcdFx0Ly8gdGhlIHNhbWUgcGxhY2Vob2xkZXIgKGFuZCB0aGVpciByYW5nZXMpIG11c3QgYmUgdXNlZC5cblx0XHRcdGlmIChhbGxQb3NzaWJsZVNlbGVjdGlvbnMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtpbmRleCwgcmFuZ2VzXSBvZiBwb3NzaWJsZVNlbGVjdGlvbnMpIHtcblx0XHRcdFx0XHRyYW5nZXMuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpO1xuXHRcdFx0XHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdFx0XHRcdGlmIChyYW5nZXNbMF0uY29udGFpbnNSYW5nZShzZWxlY3Rpb24pKSB7XG5cdFx0XHRcdFx0XHRcdGFsbFBvc3NpYmxlU2VsZWN0aW9ucy5zZXQoaW5kZXgsIFtdKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmIChhbGxQb3NzaWJsZVNlbGVjdGlvbnMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHQvLyByZXR1cm4gZmFsc2UgaWYgd2UgY291bGRuJ3QgYXNzb2NpYXRlIGEgc2VsZWN0aW9uIHRvXG5cdFx0XHRcdC8vIHRoaXMgKHRoZSBmaXJzdCkgc25pcHBldFxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdC8vIGFkZCBzZWxlY3Rpb25zIGZyb20gJ3RoaXMnIHNuaXBwZXQgc28gdGhhdCB3ZSBrbm93IGFsbFxuXHRcdFx0Ly8gc2VsZWN0aW9ucyBmb3IgdGhpcyBwbGFjZWhvbGRlclxuXHRcdFx0YWxsUG9zc2libGVTZWxlY3Rpb25zLmZvckVhY2goKGFycmF5LCBpbmRleCkgPT4ge1xuXHRcdFx0XHRhcnJheS5wdXNoKC4uLnBvc3NpYmxlU2VsZWN0aW9ucy5nZXQoaW5kZXgpISk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHQvLyBzb3J0IHNlbGVjdGlvbnMgKGFuZCBsYXRlciBwbGFjZWhvbGRlci1yYW5nZXMpLiB0aGVuIHdhbGsgYm90aFxuXHRcdC8vIGFycmF5cyBhbmQgbWFrZSBzdXJlIHRoZSBwbGFjZWhvbGRlci1yYW5nZXMgY29udGFpbiB0aGUgY29ycmVzcG9uZGluZ1xuXHRcdC8vIHNlbGVjdGlvblxuXHRcdHNlbGVjdGlvbnMuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpO1xuXG5cdFx0Zm9yIChjb25zdCBbaW5kZXgsIHJhbmdlc10gb2YgYWxsUG9zc2libGVTZWxlY3Rpb25zKSB7XG5cdFx0XHRpZiAocmFuZ2VzLmxlbmd0aCAhPT0gc2VsZWN0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0YWxsUG9zc2libGVTZWxlY3Rpb25zLmRlbGV0ZShpbmRleCk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRyYW5nZXMuc29ydChSYW5nZS5jb21wYXJlUmFuZ2VzVXNpbmdTdGFydHMpO1xuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHJhbmdlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRpZiAoIXJhbmdlc1tpXS5jb250YWluc1JhbmdlKHNlbGVjdGlvbnNbaV0pKSB7XG5cdFx0XHRcdFx0YWxsUG9zc2libGVTZWxlY3Rpb25zLmRlbGV0ZShpbmRleCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBmcm9tIGFsbCBwb3NzaWJsZSBzZWxlY3Rpb25zIHdlIGhhdmUgZGVsZXRlZCB0aG9zZVxuXHRcdC8vIHRoYXQgZG9uJ3QgbWF0Y2ggd2l0aCB0aGUgY3VycmVudCBzZWxlY3Rpb24uIGlmIHdlIGRvbid0XG5cdFx0Ly8gaGF2ZSBhbnkgbGVmdCwgd2UgZG9uJ3QgaGF2ZSBhIHNlbGVjdGlvbiBhbnltb3JlXG5cdFx0cmV0dXJuIGFsbFBvc3NpYmxlU2VsZWN0aW9ucy5zaXplID4gMDtcblx0fVxuXG5cdHB1YmxpYyBnZXRFbmNsb3NpbmdSYW5nZSgpOiBSYW5nZSB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHJlc3VsdDogUmFuZ2UgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBzbmlwcGV0IG9mIHRoaXMuX3NuaXBwZXRzKSB7XG5cdFx0XHRjb25zdCBzbmlwcGV0UmFuZ2UgPSBzbmlwcGV0LmdldEVuY2xvc2luZ1JhbmdlKCk7XG5cdFx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0XHRyZXN1bHQgPSBzbmlwcGV0UmFuZ2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXN1bHQgPSByZXN1bHQucGx1c1JhbmdlKHNuaXBwZXRSYW5nZSEpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQWU7QUFDeEIsU0FBUyw0QkFBNEI7QUFDckMsT0FBTztBQUVQLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMs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TSxhQUFhLEtBQUssUUFBUSxjQUFjO0FBQzlDLFFBQUksV0FBVyxTQUFTLEtBQUssVUFBVSxRQUFRO0FBSTlDLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSx3QkFBd0Isb0JBQUksSUFBcUI7QUFDdkQsZUFBVyxXQUFXLEtBQUssV0FBVztBQUVyQyxZQUFNLHFCQUFxQixRQUFRLDBCQUEwQjtBQUs3RCxVQUFJLHNCQUFzQixTQUFTLEdBQUc7QUFDckMsbUJBQVcsQ0FBQyxPQUFPLE1BQU0sS0FBSyxvQkFBb0I7QUFDakQsaUJBQU8sS0FBSyxNQUFNLHdCQUF3QjtBQUMxQyxxQkFBVyxhQUFhLFlBQVk7QUFDbkMsZ0JBQUksT0FBTyxDQUFDLEVBQUUsY0FBYyxTQUFTLEdBQUc7QUFDdkMsb0NBQXNCLElBQUksT0FBTyxDQUFDLENBQUM7QUFDbkM7QUFBQSxZQUNEO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsVUFBSSxzQkFBc0IsU0FBUyxHQUFHO0FBR3JDLGVBQU87QUFBQSxNQUNSO0FBSUEsNEJBQXNCLFFBQVEsQ0FBQyxPQUFPLFVBQVU7QUFDL0MsY0FBTSxLQUFLLEdBQUcsbUJBQW1CLElBQUksS0FBSyxDQUFFO0FBQUEsTUFDN0MsQ0FBQztBQUFBLElBQ0Y7QUFLQSxlQUFXLEtBQUssTUFBTSx3QkFBd0I7QUFFOUMsZUFBVyxDQUFDLE9BQU8sTUFBTSxLQUFLLHVCQUF1QjtBQUNwRCxVQUFJLE9BQU8sV0FBVyxXQUFXLFFBQVE7QUFDeEMsOEJBQXNCLE9BQU8sS0FBSztBQUNsQztBQUFBLE1BQ0Q7QUFFQSxhQUFPLEtBQUssTUFBTSx3QkFBd0I7QUFFMUMsZUFBUyxJQUFJLEdBQUcsSUFBSSxPQUFPLFFBQVEsS0FBSztBQUN2QyxZQUFJLENBQUMsT0FBTyxDQUFDLEVBQUUsY0FBYyxXQUFXLENBQUMsQ0FBQyxHQUFHO0FBQzVDLGdDQUFzQixPQUFPLEtBQUs7QUFDbEM7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFLQSxXQUFPLHNCQUFzQixPQUFPO0FBQUEsRUFDckM7QUFBQSxFQUVPLG9CQUF1QztBQUM3QyxRQUFJO0FBQ0osZUFBVyxXQUFXLEtBQUssV0FBVztBQUNyQyxZQUFNLGVBQWUsUUFBUSxrQkFBa0I7QUFDL0MsVUFBSSxDQUFDLFFBQVE7QUFDWixpQkFBUztBQUFBLE1BQ1YsT0FBTztBQUNOLGlCQUFTLE9BQU8sVUFBVSxZQUFhO0FBQUEsTUFDeEM7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQXpkYSxpQkFBTjtBQUFBLEVBcVFKO0FBQUEsR0FyUVU7IiwKICAibmFtZXMiOiBbImlkIiwgInBsYWNlaG9sZGVyIl0KfQo=
