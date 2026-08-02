import { VSBuffer } from "../../../../base/common/buffer.js";
import * as glob from "../../../../base/common/glob.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { Mimes } from "../../../../base/common/mime.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename } from "../../../../base/common/path.js";
import { isWindows } from "../../../../base/common/platform.js";
import { RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { generateMetadataUri, generate as generateUri, extractCellOutputDetails, parseMetadataUri, parse as parseUri } from "../../../services/notebook/common/notebookDocumentService.js";
const NOTEBOOK_EDITOR_ID = "workbench.editor.notebook";
const NOTEBOOK_DIFF_EDITOR_ID = "workbench.editor.notebookTextDiffEditor";
const NOTEBOOK_MULTI_DIFF_EDITOR_ID = "workbench.editor.notebookMultiTextDiffEditor";
const INTERACTIVE_WINDOW_EDITOR_ID = "workbench.editor.interactive";
const REPL_EDITOR_ID = "workbench.editor.repl";
const NOTEBOOK_OUTPUT_EDITOR_ID = "workbench.editor.notebookOutputEditor";
const EXECUTE_REPL_COMMAND_ID = "replNotebook.input.execute";
var CellKind = /* @__PURE__ */ ((CellKind2) => {
  CellKind2[CellKind2["Markup"] = 1] = "Markup";
  CellKind2[CellKind2["Code"] = 2] = "Code";
  return CellKind2;
})(CellKind || {});
const NOTEBOOK_DISPLAY_ORDER = [
  "application/json",
  "application/javascript",
  "text/html",
  "image/svg+xml",
  Mimes.latex,
  Mimes.markdown,
  "image/png",
  "image/jpeg",
  Mimes.text
];
const ACCESSIBLE_NOTEBOOK_DISPLAY_ORDER = [
  Mimes.latex,
  Mimes.markdown,
  "application/json",
  "text/html",
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  Mimes.text
];
const RENDERER_EQUIVALENT_EXTENSIONS = /* @__PURE__ */ new Map([
  ["ms-toolsai.jupyter", /* @__PURE__ */ new Set(["jupyter-notebook", "interactive"])],
  ["ms-toolsai.jupyter-renderers", /* @__PURE__ */ new Set(["jupyter-notebook", "interactive"])]
]);
const RENDERER_NOT_AVAILABLE = "_notAvailable";
var NotebookRunState = /* @__PURE__ */ ((NotebookRunState2) => {
  NotebookRunState2[NotebookRunState2["Running"] = 1] = "Running";
  NotebookRunState2[NotebookRunState2["Idle"] = 2] = "Idle";
  return NotebookRunState2;
})(NotebookRunState || {});
var NotebookCellExecutionState = /* @__PURE__ */ ((NotebookCellExecutionState2) => {
  NotebookCellExecutionState2[NotebookCellExecutionState2["Unconfirmed"] = 1] = "Unconfirmed";
  NotebookCellExecutionState2[NotebookCellExecutionState2["Pending"] = 2] = "Pending";
  NotebookCellExecutionState2[NotebookCellExecutionState2["Executing"] = 3] = "Executing";
  return NotebookCellExecutionState2;
})(NotebookCellExecutionState || {});
var NotebookExecutionState = /* @__PURE__ */ ((NotebookExecutionState2) => {
  NotebookExecutionState2[NotebookExecutionState2["Unconfirmed"] = 1] = "Unconfirmed";
  NotebookExecutionState2[NotebookExecutionState2["Pending"] = 2] = "Pending";
  NotebookExecutionState2[NotebookExecutionState2["Executing"] = 3] = "Executing";
  return NotebookExecutionState2;
})(NotebookExecutionState || {});
var NotebookRendererMatch = /* @__PURE__ */ ((NotebookRendererMatch2) => {
  NotebookRendererMatch2[NotebookRendererMatch2["WithHardKernelDependency"] = 0] = "WithHardKernelDependency";
  NotebookRendererMatch2[NotebookRendererMatch2["WithOptionalKernelDependency"] = 1] = "WithOptionalKernelDependency";
  NotebookRendererMatch2[NotebookRendererMatch2["Pure"] = 2] = "Pure";
  NotebookRendererMatch2[NotebookRendererMatch2["Never"] = 3] = "Never";
  return NotebookRendererMatch2;
})(NotebookRendererMatch || {});
var RendererMessagingSpec = /* @__PURE__ */ ((RendererMessagingSpec2) => {
  RendererMessagingSpec2["Always"] = "always";
  RendererMessagingSpec2["Never"] = "never";
  RendererMessagingSpec2["Optional"] = "optional";
  return RendererMessagingSpec2;
})(RendererMessagingSpec || {});
var NotebookCellsChangeType = /* @__PURE__ */ ((NotebookCellsChangeType2) => {
  NotebookCellsChangeType2[NotebookCellsChangeType2["ModelChange"] = 1] = "ModelChange";
  NotebookCellsChangeType2[NotebookCellsChangeType2["Move"] = 2] = "Move";
  NotebookCellsChangeType2[NotebookCellsChangeType2["ChangeCellLanguage"] = 5] = "ChangeCellLanguage";
  NotebookCellsChangeType2[NotebookCellsChangeType2["Initialize"] = 6] = "Initialize";
  NotebookCellsChangeType2[NotebookCellsChangeType2["ChangeCellMetadata"] = 7] = "ChangeCellMetadata";
  NotebookCellsChangeType2[NotebookCellsChangeType2["Output"] = 8] = "Output";
  NotebookCellsChangeType2[NotebookCellsChangeType2["OutputItem"] = 9] = "OutputItem";
  NotebookCellsChangeType2[NotebookCellsChangeType2["ChangeCellContent"] = 10] = "ChangeCellContent";
  NotebookCellsChangeType2[NotebookCellsChangeType2["ChangeDocumentMetadata"] = 11] = "ChangeDocumentMetadata";
  NotebookCellsChangeType2[NotebookCellsChangeType2["ChangeCellInternalMetadata"] = 12] = "ChangeCellInternalMetadata";
  NotebookCellsChangeType2[NotebookCellsChangeType2["ChangeCellMime"] = 13] = "ChangeCellMime";
  NotebookCellsChangeType2[NotebookCellsChangeType2["Unknown"] = 100] = "Unknown";
  return NotebookCellsChangeType2;
})(NotebookCellsChangeType || {});
var SelectionStateType = /* @__PURE__ */ ((SelectionStateType2) => {
  SelectionStateType2[SelectionStateType2["Handle"] = 0] = "Handle";
  SelectionStateType2[SelectionStateType2["Index"] = 1] = "Index";
  return SelectionStateType2;
})(SelectionStateType || {});
var CellEditType = /* @__PURE__ */ ((CellEditType2) => {
  CellEditType2[CellEditType2["Replace"] = 1] = "Replace";
  CellEditType2[CellEditType2["Output"] = 2] = "Output";
  CellEditType2[CellEditType2["Metadata"] = 3] = "Metadata";
  CellEditType2[CellEditType2["CellLanguage"] = 4] = "CellLanguage";
  CellEditType2[CellEditType2["DocumentMetadata"] = 5] = "DocumentMetadata";
  CellEditType2[CellEditType2["Move"] = 6] = "Move";
  CellEditType2[CellEditType2["OutputItems"] = 7] = "OutputItems";
  CellEditType2[CellEditType2["PartialMetadata"] = 8] = "PartialMetadata";
  CellEditType2[CellEditType2["PartialInternalMetadata"] = 9] = "PartialInternalMetadata";
  return CellEditType2;
})(CellEditType || {});
var NotebookMetadataUri;
((NotebookMetadataUri2) => {
  NotebookMetadataUri2.scheme = Schemas.vscodeNotebookMetadata;
  function generate(notebook) {
    return generateMetadataUri(notebook);
  }
  NotebookMetadataUri2.generate = generate;
  function parse(metadata) {
    return parseMetadataUri(metadata);
  }
  NotebookMetadataUri2.parse = parse;
})(NotebookMetadataUri || (NotebookMetadataUri = {}));
var CellUri;
((CellUri2) => {
  CellUri2.scheme = Schemas.vscodeNotebookCell;
  function generate(notebook, handle) {
    return generateUri(notebook, handle);
  }
  CellUri2.generate = generate;
  function parse(cell) {
    return parseUri(cell);
  }
  CellUri2.parse = parse;
  function generateCellOutputUriWithId(notebook, outputId) {
    return notebook.with({
      scheme: Schemas.vscodeNotebookCellOutput,
      query: new URLSearchParams({
        openIn: "editor",
        outputId: outputId ?? "",
        notebookScheme: notebook.scheme !== Schemas.file ? notebook.scheme : ""
      }).toString()
    });
  }
  CellUri2.generateCellOutputUriWithId = generateCellOutputUriWithId;
  function generateCellOutputUriWithIndex(notebook, cellUri, outputIndex) {
    return notebook.with({
      scheme: Schemas.vscodeNotebookCellOutput,
      fragment: cellUri.fragment,
      query: new URLSearchParams({
        openIn: "notebook",
        outputIndex: String(outputIndex)
      }).toString()
    });
  }
  CellUri2.generateCellOutputUriWithIndex = generateCellOutputUriWithIndex;
  function generateOutputEditorUri(notebook, cellId, cellIndex, outputId, outputIndex) {
    return notebook.with({
      scheme: Schemas.vscodeNotebookCellOutput,
      query: new URLSearchParams({
        openIn: "notebookOutputEditor",
        notebook: notebook.toString(),
        cellIndex: String(cellIndex),
        outputId,
        outputIndex: String(outputIndex)
      }).toString()
    });
  }
  CellUri2.generateOutputEditorUri = generateOutputEditorUri;
  function parseCellOutputUri(uri) {
    return extractCellOutputDetails(uri);
  }
  CellUri2.parseCellOutputUri = parseCellOutputUri;
  function generateCellPropertyUri(notebook, handle, scheme2) {
    return CellUri2.generate(notebook, handle).with({ scheme: scheme2 });
  }
  CellUri2.generateCellPropertyUri = generateCellPropertyUri;
  function parseCellPropertyUri(uri, propertyScheme) {
    if (uri.scheme !== propertyScheme) {
      return void 0;
    }
    return CellUri2.parse(uri.with({ scheme: CellUri2.scheme }));
  }
  CellUri2.parseCellPropertyUri = parseCellPropertyUri;
})(CellUri || (CellUri = {}));
const normalizeSlashes = (str) => isWindows ? str.replace(/\//g, "\\") : str;
class MimeTypeDisplayOrder {
  constructor(initialValue = [], defaultOrder = NOTEBOOK_DISPLAY_ORDER) {
    this.defaultOrder = defaultOrder;
    this.order = [...new Set(initialValue)].map((pattern) => ({
      pattern,
      matches: glob.parse(normalizeSlashes(pattern), { ignoreCase: true })
    }));
  }
  /**
   * Returns a sorted array of the input mimeTypes.
   */
  sort(mimeTypes) {
    const remaining = new Map(Iterable.map(mimeTypes, (m) => [m, normalizeSlashes(m)]));
    let sorted = [];
    for (const { matches } of this.order) {
      for (const [original, normalized] of remaining) {
        if (matches(normalized)) {
          sorted.push(original);
          remaining.delete(original);
          break;
        }
      }
    }
    if (remaining.size) {
      sorted = sorted.concat([...remaining.keys()].sort(
        (a, b) => this.defaultOrder.indexOf(a) - this.defaultOrder.indexOf(b)
      ));
    }
    return sorted;
  }
  /**
   * Records that the user selected the given mimetype over the other
   * possible mimeTypes, prioritizing it for future reference.
   */
  prioritize(chosenMimetype, otherMimeTypes) {
    const chosenIndex = this.findIndex(chosenMimetype);
    if (chosenIndex === -1) {
      this.order.unshift({ pattern: chosenMimetype, matches: glob.parse(normalizeSlashes(chosenMimetype), { ignoreCase: true }) });
      return;
    }
    const uniqueIndices = new Set(otherMimeTypes.map((m) => this.findIndex(m, chosenIndex)));
    uniqueIndices.delete(-1);
    const otherIndices = Array.from(uniqueIndices).sort((a, b) => a - b);
    this.order.splice(chosenIndex + 1, 0, ...otherIndices.map((i) => this.order[i]));
    for (let oi = otherIndices.length - 1; oi >= 0; oi--) {
      this.order.splice(otherIndices[oi], 1);
    }
  }
  /**
   * Gets an array of in-order mimetype preferences.
   */
  toArray() {
    return this.order.map((o) => o.pattern);
  }
  findIndex(mimeType, maxIndex = this.order.length) {
    const normalized = normalizeSlashes(mimeType);
    for (let i = 0; i < maxIndex; i++) {
      if (this.order[i].matches(normalized)) {
        return i;
      }
    }
    return -1;
  }
}
function diff(before, after, contains, equal = (a, b) => a === b) {
  const result = [];
  function pushSplice(start, deleteCount, toInsert) {
    if (deleteCount === 0 && toInsert.length === 0) {
      return;
    }
    const latest = result[result.length - 1];
    if (latest && latest.start + latest.deleteCount === start) {
      latest.deleteCount += deleteCount;
      latest.toInsert.push(...toInsert);
    } else {
      result.push({ start, deleteCount, toInsert });
    }
  }
  let beforeIdx = 0;
  let afterIdx = 0;
  while (true) {
    if (beforeIdx === before.length) {
      pushSplice(beforeIdx, 0, after.slice(afterIdx));
      break;
    }
    if (afterIdx === after.length) {
      pushSplice(beforeIdx, before.length - beforeIdx, []);
      break;
    }
    const beforeElement = before[beforeIdx];
    const afterElement = after[afterIdx];
    if (equal(beforeElement, afterElement)) {
      beforeIdx += 1;
      afterIdx += 1;
      continue;
    }
    if (contains(afterElement)) {
      pushSplice(beforeIdx, 1, []);
      beforeIdx += 1;
    } else {
      pushSplice(beforeIdx, 0, [afterElement]);
      afterIdx += 1;
    }
  }
  return result;
}
const NOTEBOOK_EDITOR_CURSOR_BOUNDARY = new RawContextKey("notebookEditorCursorAtBoundary", "none");
const NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY = new RawContextKey("notebookEditorCursorAtLineBoundary", "none");
var NotebookEditorPriority = /* @__PURE__ */ ((NotebookEditorPriority2) => {
  NotebookEditorPriority2["default"] = "default";
  NotebookEditorPriority2["option"] = "option";
  return NotebookEditorPriority2;
})(NotebookEditorPriority || {});
var NotebookFindScopeType = /* @__PURE__ */ ((NotebookFindScopeType2) => {
  NotebookFindScopeType2["Cells"] = "cells";
  NotebookFindScopeType2["Text"] = "text";
  NotebookFindScopeType2["None"] = "none";
  return NotebookFindScopeType2;
})(NotebookFindScopeType || {});
function isDocumentExcludePattern(filenamePattern) {
  const arg = filenamePattern;
  if ((typeof arg.include === "string" || glob.isRelativePattern(arg.include)) && (typeof arg.exclude === "string" || glob.isRelativePattern(arg.exclude))) {
    return true;
  }
  return false;
}
function notebookDocumentFilterMatch(filter, viewType, resource) {
  if (Array.isArray(filter.viewType) && filter.viewType.indexOf(viewType) >= 0) {
    return true;
  }
  if (filter.viewType === viewType) {
    return true;
  }
  if (filter.filenamePattern) {
    const filenamePattern = isDocumentExcludePattern(filter.filenamePattern) ? filter.filenamePattern.include : filter.filenamePattern;
    const excludeFilenamePattern = isDocumentExcludePattern(filter.filenamePattern) ? filter.filenamePattern.exclude : void 0;
    if (glob.match(filenamePattern, basename(resource.fsPath), { ignoreCase: true })) {
      if (excludeFilenamePattern) {
        if (glob.match(excludeFilenamePattern, basename(resource.fsPath), { ignoreCase: true })) {
          return false;
        }
      }
      return true;
    }
  }
  return false;
}
const NotebookSetting = {
  displayOrder: "notebook.displayOrder",
  cellToolbarLocation: "notebook.cellToolbarLocation",
  cellToolbarVisibility: "notebook.cellToolbarVisibility",
  showCellStatusBar: "notebook.showCellStatusBar",
  cellExecutionTimeVerbosity: "notebook.cellExecutionTimeVerbosity",
  textDiffEditorPreview: "notebook.diff.enablePreview",
  diffOverviewRuler: "notebook.diff.overviewRuler",
  experimentalInsertToolbarAlignment: "notebook.experimental.insertToolbarAlignment",
  compactView: "notebook.compactView",
  focusIndicator: "notebook.cellFocusIndicator",
  insertToolbarLocation: "notebook.insertToolbarLocation",
  globalToolbar: "notebook.globalToolbar",
  stickyScrollEnabled: "notebook.stickyScroll.enabled",
  stickyScrollMode: "notebook.stickyScroll.mode",
  undoRedoPerCell: "notebook.undoRedoPerCell",
  consolidatedOutputButton: "notebook.consolidatedOutputButton",
  openOutputInPreviewEditor: "notebook.output.openInPreviewEditor.enabled",
  showFoldingControls: "notebook.showFoldingControls",
  dragAndDropEnabled: "notebook.dragAndDropEnabled",
  cellEditorOptionsCustomizations: "notebook.editorOptionsCustomizations",
  consolidatedRunButton: "notebook.consolidatedRunButton",
  openGettingStarted: "notebook.experimental.openGettingStarted",
  globalToolbarShowLabel: "notebook.globalToolbarShowLabel",
  markupFontSize: "notebook.markup.fontSize",
  markdownLineHeight: "notebook.markdown.lineHeight",
  interactiveWindowCollapseCodeCells: "interactiveWindow.collapseCellInputCode",
  outputScrolling: "notebook.output.scrolling",
  textOutputLineLimit: "notebook.output.textLineLimit",
  LinkifyOutputFilePaths: "notebook.output.linkifyFilePaths",
  minimalErrorRendering: "notebook.output.minimalErrorRendering",
  formatOnSave: "notebook.formatOnSave.enabled",
  insertFinalNewline: "notebook.insertFinalNewline",
  defaultFormatter: "notebook.defaultFormatter",
  formatOnCellExecution: "notebook.formatOnCellExecution",
  codeActionsOnSave: "notebook.codeActionsOnSave",
  outputWordWrap: "notebook.output.wordWrap",
  outputLineHeight: "notebook.output.lineHeight",
  outputFontSize: "notebook.output.fontSize",
  outputFontFamily: "notebook.output.fontFamily",
  findFilters: "notebook.find.filters",
  logging: "notebook.logging",
  confirmDeleteRunningCell: "notebook.confirmDeleteRunningCell",
  remoteSaving: "notebook.experimental.remoteSave",
  gotoSymbolsAllSymbols: "notebook.gotoSymbols.showAllSymbols",
  outlineShowMarkdownHeadersOnly: "notebook.outline.showMarkdownHeadersOnly",
  outlineShowCodeCells: "notebook.outline.showCodeCells",
  outlineShowCodeCellSymbols: "notebook.outline.showCodeCellSymbols",
  breadcrumbsShowCodeCells: "notebook.breadcrumbs.showCodeCells",
  scrollToRevealCell: "notebook.scrolling.revealNextCellOnExecute",
  cellChat: "notebook.experimental.cellChat",
  cellGenerate: "notebook.experimental.generate",
  notebookVariablesView: "notebook.variablesView",
  notebookInlineValues: "notebook.inlineValues",
  InteractiveWindowPromptToSave: "interactiveWindow.promptToSaveOnClose",
  cellFailureDiagnostics: "notebook.cellFailureDiagnostics",
  outputBackupSizeLimit: "notebook.backup.sizeLimit",
  multiCursor: "notebook.multiCursor.enabled",
  markupFontFamily: "notebook.markup.fontFamily"
};
var CellStatusbarAlignment = /* @__PURE__ */ ((CellStatusbarAlignment2) => {
  CellStatusbarAlignment2[CellStatusbarAlignment2["Left"] = 1] = "Left";
  CellStatusbarAlignment2[CellStatusbarAlignment2["Right"] = 2] = "Right";
  return CellStatusbarAlignment2;
})(CellStatusbarAlignment || {});
const _NotebookWorkingCopyTypeIdentifier = class _NotebookWorkingCopyTypeIdentifier {
  static create(notebookType, viewType) {
    return `${_NotebookWorkingCopyTypeIdentifier._prefix}${notebookType}/${viewType ?? notebookType}`;
  }
  static parse(candidate) {
    if (candidate.startsWith(_NotebookWorkingCopyTypeIdentifier._prefix)) {
      const split = candidate.substring(_NotebookWorkingCopyTypeIdentifier._prefix.length).split("/");
      if (split.length === 2) {
        return { notebookType: split[0], viewType: split[1] };
      }
    }
    return void 0;
  }
};
_NotebookWorkingCopyTypeIdentifier._prefix = "notebook/";
let NotebookWorkingCopyTypeIdentifier = _NotebookWorkingCopyTypeIdentifier;
const textDecoder = new TextDecoder();
function compressOutputItemStreams(outputs) {
  const buffers = [];
  let startAppending = false;
  for (const output of outputs) {
    if (buffers.length === 0 || startAppending) {
      buffers.push(output);
      startAppending = true;
    }
  }
  let didCompression = compressStreamBuffer(buffers);
  const concatenated = VSBuffer.concat(buffers.map((buffer) => VSBuffer.wrap(buffer)));
  const data = formatStreamText(concatenated);
  didCompression = didCompression || data.byteLength !== concatenated.byteLength;
  return { data, didCompression };
}
const MOVE_CURSOR_1_LINE_COMMAND = `${String.fromCharCode(27)}[A`;
const MOVE_CURSOR_1_LINE_COMMAND_BYTES = MOVE_CURSOR_1_LINE_COMMAND.split("").map((c) => c.charCodeAt(0));
const LINE_FEED = 10;
function compressStreamBuffer(streams) {
  let didCompress = false;
  streams.forEach((stream, index) => {
    if (index === 0 || stream.length < MOVE_CURSOR_1_LINE_COMMAND.length) {
      return;
    }
    const previousStream = streams[index - 1];
    const command = stream.subarray(0, MOVE_CURSOR_1_LINE_COMMAND.length);
    if (command[0] === MOVE_CURSOR_1_LINE_COMMAND_BYTES[0] && command[1] === MOVE_CURSOR_1_LINE_COMMAND_BYTES[1] && command[2] === MOVE_CURSOR_1_LINE_COMMAND_BYTES[2]) {
      const lastIndexOfLineFeed = previousStream.lastIndexOf(LINE_FEED);
      if (lastIndexOfLineFeed === -1) {
        return;
      }
      didCompress = true;
      streams[index - 1] = previousStream.subarray(0, lastIndexOfLineFeed);
      streams[index] = stream.subarray(MOVE_CURSOR_1_LINE_COMMAND.length);
    }
  });
  return didCompress;
}
function fixBackspace(txt) {
  let tmp = txt;
  do {
    txt = tmp;
    tmp = txt.replace(/[^\n]\x08/gm, "");
  } while (tmp.length < txt.length);
  return txt;
}
function fixCarriageReturn(txt) {
  txt = txt.replace(/\r+\n/gm, "\n");
  while (txt.search(/\r[^$]/g) > -1) {
    const base = txt.match(/^(.*)\r+/m)[1];
    let insert = txt.match(/\r+(.*)$/m)[1];
    insert = insert + base.slice(insert.length, base.length);
    txt = txt.replace(/\r+.*$/m, "\r").replace(/^.*\r/m, insert);
  }
  return txt;
}
const BACKSPACE_CHARACTER = "\b".charCodeAt(0);
const CARRIAGE_RETURN_CHARACTER = "\r".charCodeAt(0);
function formatStreamText(buffer) {
  if (!buffer.buffer.includes(BACKSPACE_CHARACTER) && !buffer.buffer.includes(CARRIAGE_RETURN_CHARACTER)) {
    return buffer;
  }
  return VSBuffer.fromString(fixCarriageReturn(fixBackspace(textDecoder.decode(buffer.buffer))));
}
export {
  ACCESSIBLE_NOTEBOOK_DISPLAY_ORDER,
  CellEditType,
  CellKind,
  CellStatusbarAlignment,
  CellUri,
  EXECUTE_REPL_COMMAND_ID,
  INTERACTIVE_WINDOW_EDITOR_ID,
  MOVE_CURSOR_1_LINE_COMMAND,
  MimeTypeDisplayOrder,
  NOTEBOOK_DIFF_EDITOR_ID,
  NOTEBOOK_DISPLAY_ORDER,
  NOTEBOOK_EDITOR_CURSOR_BOUNDARY,
  NOTEBOOK_EDITOR_CURSOR_LINE_BOUNDARY,
  NOTEBOOK_EDITOR_ID,
  NOTEBOOK_MULTI_DIFF_EDITOR_ID,
  NOTEBOOK_OUTPUT_EDITOR_ID,
  NotebookCellExecutionState,
  NotebookCellsChangeType,
  NotebookEditorPriority,
  NotebookExecutionState,
  NotebookFindScopeType,
  NotebookMetadataUri,
  NotebookRendererMatch,
  NotebookRunState,
  NotebookSetting,
  NotebookWorkingCopyTypeIdentifier,
  RENDERER_EQUIVALENT_EXTENSIONS,
  RENDERER_NOT_AVAILABLE,
  REPL_EDITOR_ID,
  RendererMessagingSpec,
  SelectionStateType,
  compressOutputItemStreams,
  diff,
  isDocumentExcludePattern,
  notebookDocumentFilterMatch
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElEaWZmUmVzdWx0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZGlmZi9kaWZmLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0ICogYXMgZ2xvYiBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9nbG9iLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaXRlcmF0b3IuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgTWltZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9taW1lLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJU3BsaWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc2VxdWVuY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0ICogYXMgZWRpdG9yQ29tbW9uIGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IENvbW1hbmQsIFdvcmtzcGFjZUVkaXRNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IElSZWFkb25seVRleHRCdWZmZXIsIElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5SW5mb3JtYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElGaWxlUmVhZExpbWl0cyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBVbmRvUmVkb0dyb3VwIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdW5kb1JlZG8vY29tbW9uL3VuZG9SZWRvLmpzJztcbmltcG9ydCB7IElSZXZlcnRPcHRpb25zLCBJU2F2ZU9wdGlvbnMsIElVbnR5cGVkRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB7IE5vdGVib29rVGV4dE1vZGVsIH0gZnJvbSAnLi9tb2RlbC9ub3RlYm9va1RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2VsbEV4ZWN1dGlvbkVycm9yIH0gZnJvbSAnLi9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tUZXh0TW9kZWxMaWtlIH0gZnJvbSAnLi9ub3RlYm9va0tlcm5lbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNlbGxSYW5nZSB9IGZyb20gJy4vbm90ZWJvb2tSYW5nZS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclJlc29sdmVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZU1ldGFkYXRhVXJpLCBnZW5lcmF0ZSBhcyBnZW5lcmF0ZVVyaSwgZXh0cmFjdENlbGxPdXRwdXREZXRhaWxzLCBwYXJzZU1ldGFkYXRhVXJpLCBwYXJzZSBhcyBwYXJzZVVyaSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0RvY3VtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlCYWNrdXBNZXRhLCBJV29ya2luZ0NvcHlTYXZlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy93b3JraW5nQ29weS9jb21tb24vd29ya2luZ0NvcHkuanMnO1xuaW1wb3J0IHsgU25hcHNob3RDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL2ZpbGVXb3JraW5nQ29weS5qcyc7XG5cbmV4cG9ydCBjb25zdCBOT1RFQk9PS19FRElUT1JfSUQgPSAnd29ya2JlbmNoLmVkaXRvci5ub3RlYm9vayc7XG5leHBvcnQgY29uc3QgTk9URUJPT0tfRElGRl9FRElUT1JfSUQgPSAnd29ya2JlbmNoLmVkaXRvci5ub3RlYm9va1RleHREaWZmRWRpdG9yJztcbmV4cG9ydCBjb25zdCBOT1RFQk9PS19NVUxUSV9ESUZGX0VESVRPUl9JRCA9ICd3b3JrYmVuY2guZWRpdG9yLm5vdGVib29rTXVsdGlUZXh0RGlmZkVkaXRvcic7XG5leHBvcnQgY29uc3QgSU5URVJBQ1RJVkVfV0lORE9XX0VESVRPUl9JRCA9ICd3b3JrYmVuY2guZWRpdG9yLmludGVyYWN0aXZlJztcbmV4cG9ydCBjb25zdCBSRVBMX0VESVRPUl9JRCA9ICd3b3JrYmVuY2guZWRpdG9yLnJlcGwnO1xuZXhwb3J0IGNvbnN0IE5PVEVCT09LX09VVFBVVF9FRElUT1JfSUQgPSAnd29ya2JlbmNoLmVkaXRvci5ub3RlYm9va091dHB1dEVkaXRvcic7XG5cbmV4cG9ydCBjb25zdCBFWEVDVVRFX1JFUExfQ09NTUFORF9JRCA9ICdyZXBsTm90ZWJvb2suaW5wdXQuZXhlY3V0ZSc7XG5cbmV4cG9ydCBlbnVtIENlbGxLaW5kIHtcblx0TWFya3VwID0gMSxcblx0Q29kZSA9IDJcbn1cblxuZXhwb3J0IGNvbnN0IE5PVEVCT09LX0RJU1BMQVlfT1JERVI6IHJlYWRvbmx5IHN0cmluZ1tdID0gW1xuXHQnYXBwbGljYXRpb24vanNvbicsXG5cdCdhcHBsaWNhdGlvbi9qYXZhc2NyaXB0Jyxcblx0J3RleHQvaHRtbCcsXG5cdCdpbWFnZS9zdmcreG1sJyxcblx0TWltZXMubGF0ZXgsXG5cdE1pbWVzLm1hcmtkb3duLFxuXHQnaW1hZ2UvcG5nJyxcblx0J2ltYWdlL2pwZWcnLFxuXHRNaW1lcy50ZXh0XG5dO1xuXG5leHBvcnQgY29uc3QgQUNDRVNTSUJMRV9OT1RFQk9PS19ESVNQTEFZX09SREVSOiByZWFkb25seSBzdHJpbmdbXSA9IFtcblx0TWltZXMubGF0ZXgsXG5cdE1pbWVzLm1hcmtkb3duLFxuXHQnYXBwbGljYXRpb24vanNvbicsXG5cdCd0ZXh0L2h0bWwnLFxuXHQnaW1hZ2Uvc3ZnK3htbCcsXG5cdCdpbWFnZS9wbmcnLFxuXHQnaW1hZ2UvanBlZycsXG5cdE1pbWVzLnRleHQsXG5dO1xuXG4vKipcbiAqIEEgbWFwcGluZyBvZiBleHRlbnNpb24gSURzIHdobyBjb250YWluIHJlbmRlcmVycywgdG8gbm90ZWJvb2sgaWRzIHdobyB0aGV5XG4gKiBzaG91bGQgYmUgdHJlYXRlZCBhcyB0aGUgc2FtZSBpbiB0aGUgcmVuZGVyZXIgc2VsZWN0aW9uIGxvZ2ljLiBUaGlzIGlzIHVzZWRcbiAqIHRvIHByZWZlciB0aGUgMXN0IHBhcnR5IEp1cHl0ZXIgcmVuZGVyZXJzIGV2ZW4gdGhvdWdoIHRoZXkncmUgaW4gYSBzZXBhcmF0ZVxuICogZXh0ZW5zaW9uLCBmb3IgaW5zdGFuY2UuIFNlZSAjMTM2MjQ3LlxuICovXG5leHBvcnQgY29uc3QgUkVOREVSRVJfRVFVSVZBTEVOVF9FWFRFTlNJT05TOiBSZWFkb25seU1hcDxzdHJpbmcsIFJlYWRvbmx5U2V0PHN0cmluZz4+ID0gbmV3IE1hcChbXG5cdFsnbXMtdG9vbHNhaS5qdXB5dGVyJywgbmV3IFNldChbJ2p1cHl0ZXItbm90ZWJvb2snLCAnaW50ZXJhY3RpdmUnXSldLFxuXHRbJ21zLXRvb2xzYWkuanVweXRlci1yZW5kZXJlcnMnLCBuZXcgU2V0KFsnanVweXRlci1ub3RlYm9vaycsICdpbnRlcmFjdGl2ZSddKV0sXG5dKTtcblxuZXhwb3J0IGNvbnN0IFJFTkRFUkVSX05PVF9BVkFJTEFCTEUgPSAnX25vdEF2YWlsYWJsZSc7XG5cbmV4cG9ydCB0eXBlIENvbnRyaWJ1dGVkTm90ZWJvb2tSZW5kZXJlckVudHJ5cG9pbnQgPSBzdHJpbmcgfCB7IHJlYWRvbmx5IGV4dGVuZHM6IHN0cmluZzsgcmVhZG9ubHkgcGF0aDogc3RyaW5nIH07XG5cbmV4cG9ydCBlbnVtIE5vdGVib29rUnVuU3RhdGUge1xuXHRSdW5uaW5nID0gMSxcblx0SWRsZSA9IDJcbn1cblxuZXhwb3J0IHR5cGUgTm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhID0gUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cbmV4cG9ydCBlbnVtIE5vdGVib29rQ2VsbEV4ZWN1dGlvblN0YXRlIHtcblx0VW5jb25maXJtZWQgPSAxLFxuXHRQZW5kaW5nID0gMixcblx0RXhlY3V0aW5nID0gM1xufVxuZXhwb3J0IGVudW0gTm90ZWJvb2tFeGVjdXRpb25TdGF0ZSB7XG5cdFVuY29uZmlybWVkID0gMSxcblx0UGVuZGluZyA9IDIsXG5cdEV4ZWN1dGluZyA9IDNcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tDZWxsUHJldmlvdXNFeGVjdXRpb25SZXN1bHQge1xuXHRleGVjdXRpb25PcmRlcj86IG51bWJlcjtcblx0c3VjY2Vzcz86IGJvb2xlYW47XG5cdGR1cmF0aW9uPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5vdGVib29rQ2VsbE1ldGFkYXRhIHtcblx0LyoqXG5cdCAqIGN1c3RvbSBtZXRhZGF0YVxuXHQgKi9cblx0W2tleTogc3RyaW5nXTogdW5rbm93bjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RlYm9va0NlbGxJbnRlcm5hbE1ldGFkYXRhIHtcblx0LyoqXG5cdCAqIFVzZWQgb25seSBmb3IgZGlmZmluZyBvZiBOb3RlYm9va3MuXG5cdCAqIFRoaXMgaXMgbm90IHBlcnNpc3RlZCBhbmQgZ2VuZXJhbGx5IHVzZWZ1bCBvbmx5IHdoZW4gZGlmZmluZyB0d28gbm90ZWJvb2tzLlxuXHQgKiBVc2VmdWwgb25seSBhZnRlciB3ZSd2ZSBtYW51YWxseSBtYXRjaGVkIGEgZmV3IGNlbGxzIHRvZ2V0aGVyIHNvIHdlIGtub3cgd2hpY2ggY2VsbHMgYXJlIG1hdGNoaW5nLlxuXHQgKi9cblx0aW50ZXJuYWxJZD86IHN0cmluZztcblx0ZXhlY3V0aW9uSWQ/OiBzdHJpbmc7XG5cdGV4ZWN1dGlvbk9yZGVyPzogbnVtYmVyO1xuXHRsYXN0UnVuU3VjY2Vzcz86IGJvb2xlYW47XG5cdHJ1blN0YXJ0VGltZT86IG51bWJlcjtcblx0cnVuU3RhcnRUaW1lQWRqdXN0bWVudD86IG51bWJlcjtcblx0cnVuRW5kVGltZT86IG51bWJlcjtcblx0cmVuZGVyRHVyYXRpb24/OiB7IFtrZXk6IHN0cmluZ106IG51bWJlciB9O1xuXHRlcnJvcj86IElDZWxsRXhlY3V0aW9uRXJyb3I7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZWJvb2tDZWxsQ29sbGFwc2VTdGF0ZSB7XG5cdGlucHV0Q29sbGFwc2VkPzogYm9vbGVhbjtcblx0b3V0cHV0Q29sbGFwc2VkPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RlYm9va0NlbGxEZWZhdWx0Q29sbGFwc2VDb25maWcge1xuXHRjb2RlQ2VsbD86IE5vdGVib29rQ2VsbENvbGxhcHNlU3RhdGU7XG5cdG1hcmt1cENlbGw/OiBOb3RlYm9va0NlbGxDb2xsYXBzZVN0YXRlO1xufVxuXG5leHBvcnQgdHlwZSBJbnRlcmFjdGl2ZVdpbmRvd0NvbGxhcHNlQ29kZUNlbGxzID0gJ2Fsd2F5cycgfCAnbmV2ZXInIHwgJ2Zyb21FZGl0b3InO1xuXG5leHBvcnQgdHlwZSBUcmFuc2llbnRDZWxsTWV0YWRhdGEgPSB7IHJlYWRvbmx5IFtLIGluIGtleW9mIE5vdGVib29rQ2VsbE1ldGFkYXRhXT86IGJvb2xlYW4gfTtcbmV4cG9ydCB0eXBlIENlbGxDb250ZW50TWV0YWRhdGEgPSB7IHJlYWRvbmx5IFtLIGluIGtleW9mIE5vdGVib29rQ2VsbE1ldGFkYXRhXT86IGJvb2xlYW4gfTtcbmV4cG9ydCB0eXBlIFRyYW5zaWVudERvY3VtZW50TWV0YWRhdGEgPSB7IHJlYWRvbmx5IFtLIGluIGtleW9mIE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YV0/OiBib29sZWFuIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHJhbnNpZW50T3B0aW9ucyB7XG5cdHJlYWRvbmx5IHRyYW5zaWVudE91dHB1dHM6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHRyYW5zaWVudENlbGxNZXRhZGF0YTogVHJhbnNpZW50Q2VsbE1ldGFkYXRhO1xuXHRyZWFkb25seSB0cmFuc2llbnREb2N1bWVudE1ldGFkYXRhOiBUcmFuc2llbnREb2N1bWVudE1ldGFkYXRhO1xuXHRyZWFkb25seSBjZWxsQ29udGVudE1ldGFkYXRhOiBDZWxsQ29udGVudE1ldGFkYXRhO1xufVxuXG4vKiogTm90ZTogZW51bSB2YWx1ZXMgYXJlIHVzZWQgZm9yIHNvcnRpbmcgKi9cbmV4cG9ydCBjb25zdCBlbnVtIE5vdGVib29rUmVuZGVyZXJNYXRjaCB7XG5cdC8qKiBSZW5kZXJlciBoYXMgYSBoYXJkIGRlcGVuZGVuY3kgb24gYW4gYXZhaWxhYmxlIGtlcm5lbCAqL1xuXHRXaXRoSGFyZEtlcm5lbERlcGVuZGVuY3kgPSAwLFxuXHQvKiogUmVuZGVyZXIgd29ya3MgYmV0dGVyIHdpdGggYW4gYXZhaWxhYmxlIGtlcm5lbCAqL1xuXHRXaXRoT3B0aW9uYWxLZXJuZWxEZXBlbmRlbmN5ID0gMSxcblx0LyoqIFJlbmRlcmVyIGlzIGtlcm5lbC1hZ25vc3RpYyAqL1xuXHRQdXJlID0gMixcblx0LyoqIFJlbmRlcmVyIGlzIGZvciBhIGRpZmZlcmVudCBtaW1lVHlwZSBvciBoYXMgYSBoYXJkIGRlcGVuZGVuY3kgd2hpY2ggaXMgdW5zYXRpc2ZpZWQgKi9cblx0TmV2ZXIgPSAzLFxufVxuXG4vKipcbiAqIFJlbmRlcmVyIG1lc3NhZ2luZyByZXF1aXJlbWVudC4gV2hpbGUgdGhpcyBhbGxvd3MgZm9yICdvcHRpb25hbCcgbWVzc2FnaW5nLFxuICogVlMgQ29kZSBlZmZlY3RpdmVseSB0cmVhdHMgaXQgdGhlIHNhbWUgYXMgdHJ1ZSByaWdodCBub3cuIFwiUGFydGlhbFxuICogYWN0aXZhdGlvblwiIG9mIGV4dGVuc2lvbnMgaXMgYSB2ZXJ5IHRyaWNreSBwcm9ibGVtLCB3aGljaCBjb3VsZCBhbGxvd1xuICogc29sdmluZyB0aGlzLiBCdXQgZm9yIG5vdywgb3B0aW9uYWwgaXMgbW9zdGx5IG9ubHkgaG9ub3JlZCBmb3IgYXpuYi5cbiAqL1xuZXhwb3J0IGNvbnN0IGVudW0gUmVuZGVyZXJNZXNzYWdpbmdTcGVjIHtcblx0QWx3YXlzID0gJ2Fsd2F5cycsXG5cdE5ldmVyID0gJ25ldmVyJyxcblx0T3B0aW9uYWwgPSAnb3B0aW9uYWwnLFxufVxuXG5leHBvcnQgdHlwZSBOb3RlYm9va1JlbmRlcmVyRW50cnlwb2ludCA9IHsgcmVhZG9ubHkgZXh0ZW5kczogc3RyaW5nIHwgdW5kZWZpbmVkOyByZWFkb25seSBwYXRoOiBVUkkgfTtcblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tSZW5kZXJlckluZm8ge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBkaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBlbnRyeXBvaW50OiBOb3RlYm9va1JlbmRlcmVyRW50cnlwb2ludDtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uTG9jYXRpb246IFVSSTtcblx0cmVhZG9ubHkgZXh0ZW5zaW9uSWQ6IEV4dGVuc2lvbklkZW50aWZpZXI7XG5cdHJlYWRvbmx5IG1lc3NhZ2luZzogUmVuZGVyZXJNZXNzYWdpbmdTcGVjO1xuXG5cdHJlYWRvbmx5IG1pbWVUeXBlczogcmVhZG9ubHkgc3RyaW5nW107XG5cblx0cmVhZG9ubHkgaXNCdWlsdGluOiBib29sZWFuO1xuXG5cdG1hdGNoZXNXaXRob3V0S2VybmVsKG1pbWVUeXBlOiBzdHJpbmcpOiBOb3RlYm9va1JlbmRlcmVyTWF0Y2g7XG5cdG1hdGNoZXMobWltZVR5cGU6IHN0cmluZywga2VybmVsUHJvdmlkZXM6IFJlYWRvbmx5QXJyYXk8c3RyaW5nPik6IE5vdGVib29rUmVuZGVyZXJNYXRjaDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tTdGF0aWNQcmVsb2FkSW5mbyB7XG5cdHJlYWRvbmx5IHR5cGU6IHN0cmluZztcblx0cmVhZG9ubHkgZW50cnlwb2ludDogVVJJO1xuXHRyZWFkb25seSBleHRlbnNpb25Mb2NhdGlvbjogVVJJO1xuXHRyZWFkb25seSBsb2NhbFJlc291cmNlUm9vdHM6IHJlYWRvbmx5IFVSSVtdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElPcmRlcmVkTWltZVR5cGUge1xuXHRtaW1lVHlwZTogc3RyaW5nO1xuXHRyZW5kZXJlcklkOiBzdHJpbmc7XG5cdGlzVHJ1c3RlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJT3V0cHV0SXRlbUR0byB7XG5cdHJlYWRvbmx5IG1pbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZGF0YTogVlNCdWZmZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU91dHB1dER0byB7XG5cdG91dHB1dHM6IElPdXRwdXRJdGVtRHRvW107XG5cdG91dHB1dElkOiBzdHJpbmc7XG5cdG1ldGFkYXRhPzogUmVjb3JkPHN0cmluZywgYW55Pjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2VsbE91dHB1dCB7XG5cdHJlYWRvbmx5IHZlcnNpb25JZDogbnVtYmVyO1xuXHRvdXRwdXRzOiBJT3V0cHV0SXRlbUR0b1tdO1xuXHRtZXRhZGF0YT86IFJlY29yZDxzdHJpbmcsIGFueT47XG5cdG91dHB1dElkOiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBBbHRlcm5hdGl2ZSBvdXRwdXQgaWQgdGhhdCdzIHJldXNlZCB3aGVuIHRoZSBvdXRwdXQgaXMgdXBkYXRlZC5cblx0ICovXG5cdGFsdGVybmF0aXZlT3V0cHV0SWQ6IHN0cmluZztcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEYXRhOiBFdmVudDx2b2lkPjtcblx0cmVwbGFjZURhdGEoaXRlbXM6IElPdXRwdXREdG8pOiB2b2lkO1xuXHRhcHBlbmREYXRhKGl0ZW1zOiBJT3V0cHV0SXRlbUR0b1tdKTogdm9pZDtcblx0YXBwZW5kZWRTaW5jZVZlcnNpb24odmVyc2lvbklkOiBudW1iZXIsIG1pbWU6IHN0cmluZyk6IFZTQnVmZmVyIHwgdW5kZWZpbmVkO1xuXHRhc0R0bygpOiBJT3V0cHV0RHRvO1xuXHRidW1wVmVyc2lvbigpOiB2b2lkO1xuXHRkaXNwb3NlKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ2VsbEludGVybmFsTWV0YWRhdGFDaGFuZ2VkRXZlbnQge1xuXHRyZWFkb25seSBsYXN0UnVuU3VjY2Vzc0NoYW5nZWQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va0RvY3VtZW50TWV0YWRhdGFUZXh0TW9kZWwge1xuXHQvKipcblx0ICogTm90ZWJvb2sgTWV0YWRhdGEgVXJpLlxuXHQgKi9cblx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdC8qKlxuXHQgKiBUcmlnZ2VyZWQgd2hlbiB0aGUgTm90ZWJvb2sgTWV0YWRhdGEgY2hhbmdlcy5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgbWV0YWRhdGE6IFJlYWRvbmx5PE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YT47XG5cdHJlYWRvbmx5IHRleHRCdWZmZXI6IElSZWFkb25seVRleHRCdWZmZXI7XG5cdC8qKlxuXHQgKiBUZXh0IHJlcHJlc2VudGF0aW9uIG9mIHRoZSBOb3RlYm9vayBNZXRhZGF0YVxuXHQgKi9cblx0Z2V0VmFsdWUoKTogc3RyaW5nO1xuXHRnZXRIYXNoKCk6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2VsbCB7XG5cdHJlYWRvbmx5IHVyaTogVVJJO1xuXHRoYW5kbGU6IG51bWJlcjtcblx0bGFuZ3VhZ2U6IHN0cmluZztcblx0Y2VsbEtpbmQ6IENlbGxLaW5kO1xuXHRvdXRwdXRzOiBJQ2VsbE91dHB1dFtdO1xuXHRtZXRhZGF0YTogTm90ZWJvb2tDZWxsTWV0YWRhdGE7XG5cdGludGVybmFsTWV0YWRhdGE6IE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGE7XG5cdGdldEhhc2hWYWx1ZSgpOiBudW1iZXI7XG5cdHRleHRCdWZmZXI6IElSZWFkb25seVRleHRCdWZmZXI7XG5cdHRleHRNb2RlbD86IElUZXh0TW9kZWw7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlVGV4dE1vZGVsOiBFdmVudDx2b2lkPjtcblx0Z2V0VmFsdWUoKTogc3RyaW5nO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU91dHB1dHM/OiBFdmVudDxOb3RlYm9va0NlbGxPdXRwdXRzU3BsaWNlPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VPdXRwdXRJdGVtcz86IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUxhbmd1YWdlOiBFdmVudDxzdHJpbmc+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU1ldGFkYXRhOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VJbnRlcm5hbE1ldGFkYXRhOiBFdmVudDxDZWxsSW50ZXJuYWxNZXRhZGF0YUNoYW5nZWRFdmVudD47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rU25hcHNob3RPcHRpb25zIHtcblx0Y29udGV4dDogU25hcHNob3RDb250ZXh0O1xuXHRvdXRwdXRTaXplTGltaXQ6IG51bWJlcjtcblx0dHJhbnNpZW50T3B0aW9ucz86IFRyYW5zaWVudE9wdGlvbnM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rVGV4dE1vZGVsIGV4dGVuZHMgSU5vdGVib29rVGV4dE1vZGVsTGlrZSwgSURpc3Bvc2FibGUge1xuXHRyZWFkb25seSBub3RlYm9va1R5cGU6IHN0cmluZztcblx0cmVhZG9ubHkgdmlld1R5cGU6IHN0cmluZztcblx0bWV0YWRhdGE6IE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YTtcblx0cmVhZG9ubHkgdHJhbnNpZW50T3B0aW9uczogVHJhbnNpZW50T3B0aW9ucztcblx0cmVhZG9ubHkgdXJpOiBVUkk7XG5cdHJlYWRvbmx5IHZlcnNpb25JZDogbnVtYmVyO1xuXHRyZWFkb25seSBsZW5ndGg6IG51bWJlcjtcblx0cmVhZG9ubHkgY2VsbHM6IHJlYWRvbmx5IElDZWxsW107XG5cdHJlc2V0KGNlbGxzOiBJQ2VsbER0bzJbXSwgbWV0YWRhdGE6IE5vdGVib29rRG9jdW1lbnRNZXRhZGF0YSwgdHJhbnNpZW50T3B0aW9uczogVHJhbnNpZW50T3B0aW9ucyk6IHZvaWQ7XG5cdGNyZWF0ZVNuYXBzaG90KG9wdGlvbnM6IElOb3RlYm9va1NuYXBzaG90T3B0aW9ucyk6IE5vdGVib29rRGF0YTtcblx0cmVzdG9yZVNuYXBzaG90KHNuYXBzaG90OiBOb3RlYm9va0RhdGEsIHRyYW5zaWVudE9wdGlvbnM/OiBUcmFuc2llbnRPcHRpb25zKTogdm9pZDtcblx0YXBwbHlFZGl0cyhyYXdFZGl0czogSUNlbGxFZGl0T3BlcmF0aW9uW10sIHN5bmNocm9ub3VzOiBib29sZWFuLCBiZWdpblNlbGVjdGlvblN0YXRlOiBJU2VsZWN0aW9uU3RhdGUgfCB1bmRlZmluZWQsIGVuZFNlbGVjdGlvbnNDb21wdXRlcjogKCkgPT4gSVNlbGVjdGlvblN0YXRlIHwgdW5kZWZpbmVkLCB1bmRvUmVkb0dyb3VwOiBVbmRvUmVkb0dyb3VwIHwgdW5kZWZpbmVkLCBjb21wdXRlVW5kb1JlZG8/OiBib29sZWFuKTogYm9vbGVhbjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VDb250ZW50OiBFdmVudDxOb3RlYm9va1RleHRNb2RlbENoYW5nZWRFdmVudD47XG5cdHJlYWRvbmx5IG9uV2lsbERpc3Bvc2U6IEV2ZW50PHZvaWQ+O1xufVxuXG5leHBvcnQgdHlwZSBOb3RlYm9va0NlbGxUZXh0TW9kZWxTcGxpY2U8VD4gPSBbXG5cdHN0YXJ0OiBudW1iZXIsXG5cdGRlbGV0ZUNvdW50OiBudW1iZXIsXG5cdG5ld0l0ZW1zOiBUW11cbl07XG5cbmV4cG9ydCB0eXBlIE5vdGVib29rQ2VsbE91dHB1dHNTcGxpY2UgPSB7XG5cdHN0YXJ0OiBudW1iZXIgLyogc3RhcnQgKi87XG5cdGRlbGV0ZUNvdW50OiBudW1iZXIgLyogZGVsZXRlIGNvdW50ICovO1xuXHRuZXdPdXRwdXRzOiBJQ2VsbE91dHB1dFtdO1xufTtcblxuZXhwb3J0IGludGVyZmFjZSBJTWFpbkNlbGxEdG8ge1xuXHRoYW5kbGU6IG51bWJlcjtcblx0dXJsOiBzdHJpbmc7XG5cdHNvdXJjZTogc3RyaW5nW107XG5cdGVvbDogc3RyaW5nO1xuXHR2ZXJzaW9uSWQ6IG51bWJlcjtcblx0bGFuZ3VhZ2U6IHN0cmluZztcblx0Y2VsbEtpbmQ6IENlbGxLaW5kO1xuXHRvdXRwdXRzOiBJT3V0cHV0RHRvW107XG5cdG1ldGFkYXRhPzogTm90ZWJvb2tDZWxsTWV0YWRhdGE7XG5cdGludGVybmFsTWV0YWRhdGE/OiBOb3RlYm9va0NlbGxJbnRlcm5hbE1ldGFkYXRhO1xufVxuXG5leHBvcnQgZW51bSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZSB7XG5cdE1vZGVsQ2hhbmdlID0gMSxcblx0TW92ZSA9IDIsXG5cdENoYW5nZUNlbGxMYW5ndWFnZSA9IDUsXG5cdEluaXRpYWxpemUgPSA2LFxuXHRDaGFuZ2VDZWxsTWV0YWRhdGEgPSA3LFxuXHRPdXRwdXQgPSA4LFxuXHRPdXRwdXRJdGVtID0gOSxcblx0Q2hhbmdlQ2VsbENvbnRlbnQgPSAxMCxcblx0Q2hhbmdlRG9jdW1lbnRNZXRhZGF0YSA9IDExLFxuXHRDaGFuZ2VDZWxsSW50ZXJuYWxNZXRhZGF0YSA9IDEyLFxuXHRDaGFuZ2VDZWxsTWltZSA9IDEzLFxuXHRVbmtub3duID0gMTAwXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZWJvb2tDZWxsc0luaXRpYWxpemVFdmVudDxUPiB7XG5cdHJlYWRvbmx5IGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkluaXRpYWxpemU7XG5cdHJlYWRvbmx5IGNoYW5nZXM6IE5vdGVib29rQ2VsbFRleHRNb2RlbFNwbGljZTxUPltdO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5vdGVib29rQ2VsbENvbnRlbnRDaGFuZ2VFdmVudCB7XG5cdHJlYWRvbmx5IGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxDb250ZW50O1xuXHRyZWFkb25seSBpbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5vdGVib29rQ2VsbHNNb2RlbENoYW5nZWRFdmVudDxUPiB7XG5cdHJlYWRvbmx5IGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vZGVsQ2hhbmdlO1xuXHRyZWFkb25seSBjaGFuZ2VzOiBOb3RlYm9va0NlbGxUZXh0TW9kZWxTcGxpY2U8VD5bXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RlYm9va0NlbGxzTW9kZWxNb3ZlRXZlbnQ8VD4ge1xuXHRyZWFkb25seSBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb3ZlO1xuXHRyZWFkb25seSBpbmRleDogbnVtYmVyO1xuXHRyZWFkb25seSBsZW5ndGg6IG51bWJlcjtcblx0cmVhZG9ubHkgbmV3SWR4OiBudW1iZXI7XG5cdHJlYWRvbmx5IGNlbGxzOiBUW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZWJvb2tPdXRwdXRDaGFuZ2VkRXZlbnQge1xuXHRyZWFkb25seSBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5PdXRwdXQ7XG5cdHJlYWRvbmx5IGluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IG91dHB1dHM6IElPdXRwdXREdG9bXTtcblx0cmVhZG9ubHkgYXBwZW5kOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5vdGVib29rT3V0cHV0SXRlbUNoYW5nZWRFdmVudCB7XG5cdHJlYWRvbmx5IGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk91dHB1dEl0ZW07XG5cdHJlYWRvbmx5IGluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IG91dHB1dElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG91dHB1dEl0ZW1zOiBJT3V0cHV0SXRlbUR0b1tdO1xuXHRyZWFkb25seSBhcHBlbmQ6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZWJvb2tDZWxsc0NoYW5nZUxhbmd1YWdlRXZlbnQge1xuXHRyZWFkb25seSBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsTGFuZ3VhZ2U7XG5cdHJlYWRvbmx5IGluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IGxhbmd1YWdlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZWJvb2tDZWxsc0NoYW5nZU1pbWVFdmVudCB7XG5cdHJlYWRvbmx5IGtpbmQ6IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLkNoYW5nZUNlbGxNaW1lO1xuXHRyZWFkb25seSBpbmRleDogbnVtYmVyO1xuXHRyZWFkb25seSBtaW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZWJvb2tDZWxsc0NoYW5nZU1ldGFkYXRhRXZlbnQge1xuXHRyZWFkb25seSBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsTWV0YWRhdGE7XG5cdHJlYWRvbmx5IGluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IG1ldGFkYXRhOiBOb3RlYm9va0NlbGxNZXRhZGF0YTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RlYm9va0NlbGxzQ2hhbmdlSW50ZXJuYWxNZXRhZGF0YUV2ZW50IHtcblx0cmVhZG9ubHkga2luZDogTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbEludGVybmFsTWV0YWRhdGE7XG5cdHJlYWRvbmx5IGluZGV4OiBudW1iZXI7XG5cdHJlYWRvbmx5IGludGVybmFsTWV0YWRhdGE6IE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGE7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm90ZWJvb2tEb2N1bWVudENoYW5nZU1ldGFkYXRhRXZlbnQge1xuXHRyZWFkb25seSBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VEb2N1bWVudE1ldGFkYXRhO1xuXHRyZWFkb25seSBtZXRhZGF0YTogTm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5vdGVib29rRG9jdW1lbnRVbmtub3duQ2hhbmdlRXZlbnQge1xuXHRyZWFkb25seSBraW5kOiBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Vbmtub3duO1xufVxuXG5leHBvcnQgdHlwZSBOb3RlYm9va1Jhd0NvbnRlbnRFdmVudER0byA9IE5vdGVib29rQ2VsbHNJbml0aWFsaXplRXZlbnQ8SU1haW5DZWxsRHRvPiB8IE5vdGVib29rRG9jdW1lbnRDaGFuZ2VNZXRhZGF0YUV2ZW50IHwgTm90ZWJvb2tDZWxsQ29udGVudENoYW5nZUV2ZW50IHwgTm90ZWJvb2tDZWxsc01vZGVsQ2hhbmdlZEV2ZW50PElNYWluQ2VsbER0bz4gfCBOb3RlYm9va0NlbGxzTW9kZWxNb3ZlRXZlbnQ8SU1haW5DZWxsRHRvPiB8IE5vdGVib29rT3V0cHV0Q2hhbmdlZEV2ZW50IHwgTm90ZWJvb2tPdXRwdXRJdGVtQ2hhbmdlZEV2ZW50IHwgTm90ZWJvb2tDZWxsc0NoYW5nZUxhbmd1YWdlRXZlbnQgfCBOb3RlYm9va0NlbGxzQ2hhbmdlTWltZUV2ZW50IHwgTm90ZWJvb2tDZWxsc0NoYW5nZU1ldGFkYXRhRXZlbnQgfCBOb3RlYm9va0NlbGxzQ2hhbmdlSW50ZXJuYWxNZXRhZGF0YUV2ZW50IHwgTm90ZWJvb2tEb2N1bWVudFVua25vd25DaGFuZ2VFdmVudDtcblxuZXhwb3J0IHR5cGUgTm90ZWJvb2tDZWxsc0NoYW5nZWRFdmVudER0byA9IHtcblx0cmVhZG9ubHkgcmF3RXZlbnRzOiBOb3RlYm9va1Jhd0NvbnRlbnRFdmVudER0b1tdO1xuXHRyZWFkb25seSB2ZXJzaW9uSWQ6IG51bWJlcjtcbn07XG5cbmV4cG9ydCB0eXBlIE5vdGVib29rUmF3Q29udGVudEV2ZW50ID0gKE5vdGVib29rQ2VsbHNJbml0aWFsaXplRXZlbnQ8SUNlbGw+IHwgTm90ZWJvb2tEb2N1bWVudENoYW5nZU1ldGFkYXRhRXZlbnQgfCBOb3RlYm9va0NlbGxDb250ZW50Q2hhbmdlRXZlbnQgfCBOb3RlYm9va0NlbGxzTW9kZWxDaGFuZ2VkRXZlbnQ8SUNlbGw+IHwgTm90ZWJvb2tDZWxsc01vZGVsTW92ZUV2ZW50PElDZWxsPiB8IE5vdGVib29rT3V0cHV0Q2hhbmdlZEV2ZW50IHwgTm90ZWJvb2tPdXRwdXRJdGVtQ2hhbmdlZEV2ZW50IHwgTm90ZWJvb2tDZWxsc0NoYW5nZUxhbmd1YWdlRXZlbnQgfCBOb3RlYm9va0NlbGxzQ2hhbmdlTWltZUV2ZW50IHwgTm90ZWJvb2tDZWxsc0NoYW5nZU1ldGFkYXRhRXZlbnQgfCBOb3RlYm9va0NlbGxzQ2hhbmdlSW50ZXJuYWxNZXRhZGF0YUV2ZW50IHwgTm90ZWJvb2tEb2N1bWVudFVua25vd25DaGFuZ2VFdmVudCkgJiB7IHRyYW5zaWVudDogYm9vbGVhbiB9O1xuXG5leHBvcnQgZW51bSBTZWxlY3Rpb25TdGF0ZVR5cGUge1xuXHRIYW5kbGUgPSAwLFxuXHRJbmRleCA9IDFcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VsZWN0aW9uSGFuZGxlU3RhdGUge1xuXHRraW5kOiBTZWxlY3Rpb25TdGF0ZVR5cGUuSGFuZGxlO1xuXHRwcmltYXJ5OiBudW1iZXIgfCBudWxsO1xuXHRzZWxlY3Rpb25zOiBudW1iZXJbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2VsZWN0aW9uSW5kZXhTdGF0ZSB7XG5cdGtpbmQ6IFNlbGVjdGlvblN0YXRlVHlwZS5JbmRleDtcblx0Zm9jdXM6IElDZWxsUmFuZ2U7XG5cdHNlbGVjdGlvbnM6IElDZWxsUmFuZ2VbXTtcbn1cblxuZXhwb3J0IHR5cGUgSVNlbGVjdGlvblN0YXRlID0gSVNlbGVjdGlvbkhhbmRsZVN0YXRlIHwgSVNlbGVjdGlvbkluZGV4U3RhdGU7XG5cbmV4cG9ydCB0eXBlIE5vdGVib29rVGV4dE1vZGVsQ2hhbmdlZEV2ZW50ID0ge1xuXHRyZWFkb25seSByYXdFdmVudHM6IE5vdGVib29rUmF3Q29udGVudEV2ZW50W107XG5cdHJlYWRvbmx5IHZlcnNpb25JZDogbnVtYmVyO1xuXHRyZWFkb25seSBzeW5jaHJvbm91czogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZW5kU2VsZWN0aW9uU3RhdGU6IElTZWxlY3Rpb25TdGF0ZSB8IHVuZGVmaW5lZDtcbn07XG5cbmV4cG9ydCB0eXBlIE5vdGVib29rVGV4dE1vZGVsV2lsbEFkZFJlbW92ZUV2ZW50ID0ge1xuXHRyZWFkb25seSByYXdFdmVudDogTm90ZWJvb2tDZWxsc01vZGVsQ2hhbmdlZEV2ZW50PElDZWxsPjtcbn07XG5cbmV4cG9ydCBjb25zdCBlbnVtIENlbGxFZGl0VHlwZSB7XG5cdFJlcGxhY2UgPSAxLFxuXHRPdXRwdXQgPSAyLFxuXHRNZXRhZGF0YSA9IDMsXG5cdENlbGxMYW5ndWFnZSA9IDQsXG5cdERvY3VtZW50TWV0YWRhdGEgPSA1LFxuXHRNb3ZlID0gNixcblx0T3V0cHV0SXRlbXMgPSA3LFxuXHRQYXJ0aWFsTWV0YWRhdGEgPSA4LFxuXHRQYXJ0aWFsSW50ZXJuYWxNZXRhZGF0YSA9IDksXG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNlbGxEdG8yIHtcblx0c291cmNlOiBzdHJpbmc7XG5cdGxhbmd1YWdlOiBzdHJpbmc7XG5cdG1pbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Y2VsbEtpbmQ6IENlbGxLaW5kO1xuXHRvdXRwdXRzOiBJT3V0cHV0RHRvW107XG5cdG1ldGFkYXRhPzogTm90ZWJvb2tDZWxsTWV0YWRhdGE7XG5cdGludGVybmFsTWV0YWRhdGE/OiBOb3RlYm9va0NlbGxJbnRlcm5hbE1ldGFkYXRhO1xuXHRjb2xsYXBzZVN0YXRlPzogTm90ZWJvb2tDZWxsQ29sbGFwc2VTdGF0ZTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2VsbFJlcGxhY2VFZGl0IHtcblx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlO1xuXHRpbmRleDogbnVtYmVyO1xuXHRjb3VudDogbnVtYmVyO1xuXHRjZWxsczogSUNlbGxEdG8yW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNlbGxPdXRwdXRFZGl0IHtcblx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5PdXRwdXQ7XG5cdGluZGV4OiBudW1iZXI7XG5cdG91dHB1dHM6IElPdXRwdXREdG9bXTtcblx0YXBwZW5kPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2VsbE91dHB1dEVkaXRCeUhhbmRsZSB7XG5cdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuT3V0cHV0O1xuXHRoYW5kbGU6IG51bWJlcjtcblx0b3V0cHV0czogSU91dHB1dER0b1tdO1xuXHRhcHBlbmQ/OiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDZWxsT3V0cHV0SXRlbUVkaXQge1xuXHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk91dHB1dEl0ZW1zO1xuXHRvdXRwdXRJZDogc3RyaW5nO1xuXHRpdGVtczogSU91dHB1dEl0ZW1EdG9bXTtcblx0YXBwZW5kPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2VsbE1ldGFkYXRhRWRpdCB7XG5cdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuTWV0YWRhdGE7XG5cdGluZGV4OiBudW1iZXI7XG5cdG1ldGFkYXRhOiBOb3RlYm9va0NlbGxNZXRhZGF0YTtcbn1cblxuLy8gVGhlc2UgdHlwZXMgYXJlIG51bGxhYmxlIGJlY2F1c2Ugd2UgbmVlZCB0byB1c2UgJ251bGwnIG9uIHRoZSBFSCBzaWRlIHNvIGl0IGlzIEpTT04tc3RyaW5naWZpZWRcbmV4cG9ydCB0eXBlIE51bGxhYmxlUGFydGlhbE5vdGVib29rQ2VsbE1ldGFkYXRhID0ge1xuXHRbS2V5IGluIGtleW9mIFBhcnRpYWw8Tm90ZWJvb2tDZWxsTWV0YWRhdGE+XTogTm90ZWJvb2tDZWxsTWV0YWRhdGFbS2V5XSB8IG51bGxcbn07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNlbGxQYXJ0aWFsTWV0YWRhdGFFZGl0IHtcblx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5QYXJ0aWFsTWV0YWRhdGE7XG5cdGluZGV4OiBudW1iZXI7XG5cdG1ldGFkYXRhOiBOdWxsYWJsZVBhcnRpYWxOb3RlYm9va0NlbGxNZXRhZGF0YTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2VsbFBhcnRpYWxNZXRhZGF0YUVkaXRCeUhhbmRsZSB7XG5cdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUGFydGlhbE1ldGFkYXRhO1xuXHRoYW5kbGU6IG51bWJlcjtcblx0bWV0YWRhdGE6IE51bGxhYmxlUGFydGlhbE5vdGVib29rQ2VsbE1ldGFkYXRhO1xufVxuXG5leHBvcnQgdHlwZSBOdWxsYWJsZVBhcnRpYWxOb3RlYm9va0NlbGxJbnRlcm5hbE1ldGFkYXRhID0ge1xuXHRbS2V5IGluIGtleW9mIFBhcnRpYWw8Tm90ZWJvb2tDZWxsSW50ZXJuYWxNZXRhZGF0YT5dOiBOb3RlYm9va0NlbGxJbnRlcm5hbE1ldGFkYXRhW0tleV0gfCBudWxsXG59O1xuZXhwb3J0IGludGVyZmFjZSBJQ2VsbFBhcnRpYWxJbnRlcm5hbE1ldGFkYXRhRWRpdCB7XG5cdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUGFydGlhbEludGVybmFsTWV0YWRhdGE7XG5cdGluZGV4OiBudW1iZXI7XG5cdGludGVybmFsTWV0YWRhdGE6IE51bGxhYmxlUGFydGlhbE5vdGVib29rQ2VsbEludGVybmFsTWV0YWRhdGE7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNlbGxQYXJ0aWFsSW50ZXJuYWxNZXRhZGF0YUVkaXRCeUhhbmRsZSB7XG5cdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUGFydGlhbEludGVybmFsTWV0YWRhdGE7XG5cdGhhbmRsZTogbnVtYmVyO1xuXHRpbnRlcm5hbE1ldGFkYXRhOiBOdWxsYWJsZVBhcnRpYWxOb3RlYm9va0NlbGxJbnRlcm5hbE1ldGFkYXRhO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDZWxsTGFuZ3VhZ2VFZGl0IHtcblx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5DZWxsTGFuZ3VhZ2U7XG5cdGluZGV4OiBudW1iZXI7XG5cdGxhbmd1YWdlOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSURvY3VtZW50TWV0YWRhdGFFZGl0IHtcblx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5Eb2N1bWVudE1ldGFkYXRhO1xuXHRtZXRhZGF0YTogTm90ZWJvb2tEb2N1bWVudE1ldGFkYXRhO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElDZWxsTW92ZUVkaXQge1xuXHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLk1vdmU7XG5cdGluZGV4OiBudW1iZXI7XG5cdGxlbmd0aDogbnVtYmVyO1xuXHRuZXdJZHg6IG51bWJlcjtcbn1cblxuZXhwb3J0IHR5cGUgSUltbWVkaWF0ZUNlbGxFZGl0T3BlcmF0aW9uID0gSUNlbGxPdXRwdXRFZGl0QnlIYW5kbGUgfCBJQ2VsbFBhcnRpYWxNZXRhZGF0YUVkaXRCeUhhbmRsZSB8IElDZWxsT3V0cHV0SXRlbUVkaXQgfCBJQ2VsbFBhcnRpYWxJbnRlcm5hbE1ldGFkYXRhRWRpdCB8IElDZWxsUGFydGlhbEludGVybmFsTWV0YWRhdGFFZGl0QnlIYW5kbGUgfCBJQ2VsbFBhcnRpYWxNZXRhZGF0YUVkaXQ7XG5leHBvcnQgdHlwZSBJQ2VsbEVkaXRPcGVyYXRpb24gPSBJSW1tZWRpYXRlQ2VsbEVkaXRPcGVyYXRpb24gfCBJQ2VsbFJlcGxhY2VFZGl0IHwgSUNlbGxPdXRwdXRFZGl0IHwgSUNlbGxNZXRhZGF0YUVkaXQgfCBJQ2VsbFBhcnRpYWxNZXRhZGF0YUVkaXQgfCBJQ2VsbFBhcnRpYWxJbnRlcm5hbE1ldGFkYXRhRWRpdCB8IElEb2N1bWVudE1ldGFkYXRhRWRpdCB8IElDZWxsTW92ZUVkaXQgfCBJQ2VsbE91dHB1dEl0ZW1FZGl0IHwgSUNlbGxMYW5ndWFnZUVkaXQ7XG5cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya3NwYWNlTm90ZWJvb2tDZWxsRWRpdCB7XG5cdG1ldGFkYXRhPzogV29ya3NwYWNlRWRpdE1ldGFkYXRhO1xuXHRyZXNvdXJjZTogVVJJO1xuXHRub3RlYm9va1ZlcnNpb25JZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRjZWxsRWRpdDogSUNlbGxQYXJ0aWFsTWV0YWRhdGFFZGl0IHwgSURvY3VtZW50TWV0YWRhdGFFZGl0IHwgSUNlbGxSZXBsYWNlRWRpdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya3NwYWNlTm90ZWJvb2tDZWxsRWRpdER0byB7XG5cdG1ldGFkYXRhPzogV29ya3NwYWNlRWRpdE1ldGFkYXRhO1xuXHRyZXNvdXJjZTogVVJJO1xuXHRub3RlYm9va1ZlcnNpb25JZDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRjZWxsRWRpdDogSUNlbGxQYXJ0aWFsTWV0YWRhdGFFZGl0IHwgSURvY3VtZW50TWV0YWRhdGFFZGl0IHwgSUNlbGxSZXBsYWNlRWRpdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RlYm9va0RhdGEge1xuXHRyZWFkb25seSBjZWxsczogSUNlbGxEdG8yW107XG5cdHJlYWRvbmx5IG1ldGFkYXRhOiBOb3RlYm9va0RvY3VtZW50TWV0YWRhdGE7XG59XG5cblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tDb250cmlidXRpb25EYXRhIHtcblx0ZXh0ZW5zaW9uPzogRXh0ZW5zaW9uSWRlbnRpZmllcjtcblx0cHJvdmlkZXJEaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRkaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRmaWxlbmFtZVBhdHRlcm46IChzdHJpbmcgfCBnbG9iLklSZWxhdGl2ZVBhdHRlcm4gfCBJTm90ZWJvb2tFeGNsdXNpdmVEb2N1bWVudEZpbHRlcilbXTtcblx0cHJpb3JpdHk/OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHk7XG59XG5cbmV4cG9ydCBuYW1lc3BhY2UgTm90ZWJvb2tNZXRhZGF0YVVyaSB7XG5cdGV4cG9ydCBjb25zdCBzY2hlbWUgPSBTY2hlbWFzLnZzY29kZU5vdGVib29rTWV0YWRhdGE7XG5cdGV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZShub3RlYm9vazogVVJJKTogVVJJIHtcblx0XHRyZXR1cm4gZ2VuZXJhdGVNZXRhZGF0YVVyaShub3RlYm9vayk7XG5cdH1cblx0ZXhwb3J0IGZ1bmN0aW9uIHBhcnNlKG1ldGFkYXRhOiBVUkkpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBwYXJzZU1ldGFkYXRhVXJpKG1ldGFkYXRhKTtcblx0fVxufVxuXG5leHBvcnQgbmFtZXNwYWNlIENlbGxVcmkge1xuXHRleHBvcnQgY29uc3Qgc2NoZW1lID0gU2NoZW1hcy52c2NvZGVOb3RlYm9va0NlbGw7XG5cdGV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZShub3RlYm9vazogVVJJLCBoYW5kbGU6IG51bWJlcik6IFVSSSB7XG5cdFx0cmV0dXJuIGdlbmVyYXRlVXJpKG5vdGVib29rLCBoYW5kbGUpO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHBhcnNlKGNlbGw6IFVSSSk6IHsgbm90ZWJvb2s6IFVSSTsgaGFuZGxlOiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHBhcnNlVXJpKGNlbGwpO1xuXHR9XG5cblx0LyoqXG5cdCAqIEdlbmVyYXRlcyBhIFVSSSBmb3IgYSBjZWxsIG91dHB1dCBpbiBhIG5vdGVib29rIHVzaW5nIHRoZSBvdXRwdXQgSUQuXG5cdCAqIFVzZWQgd2hlbiBVUkkgc2hvdWxkIGJlIG9wZW5lZCBhcyB0ZXh0IGluIHRoZSBlZGl0b3IuXG5cdCAqL1xuXHRleHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVDZWxsT3V0cHV0VXJpV2l0aElkKG5vdGVib29rOiBVUkksIG91dHB1dElkPzogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIG5vdGVib29rLndpdGgoe1xuXHRcdFx0c2NoZW1lOiBTY2hlbWFzLnZzY29kZU5vdGVib29rQ2VsbE91dHB1dCxcblx0XHRcdHF1ZXJ5OiBuZXcgVVJMU2VhcmNoUGFyYW1zKHtcblx0XHRcdFx0b3BlbkluOiAnZWRpdG9yJyxcblx0XHRcdFx0b3V0cHV0SWQ6IG91dHB1dElkID8/ICcnLFxuXHRcdFx0XHRub3RlYm9va1NjaGVtZTogbm90ZWJvb2suc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUgPyBub3RlYm9vay5zY2hlbWUgOiAnJyxcblx0XHRcdH0pLnRvU3RyaW5nKClcblx0XHR9KTtcblx0fVxuXHQvKipcblx0ICogR2VuZXJhdGVzIGEgVVJJIGZvciBhIGNlbGwgb3V0cHV0IGluIGEgbm90ZWJvb2sgdXNpbmcgdGhlIG91dHB1dCBpbmRleC5cblx0ICogVXNlZCB3aGVuIFVSSSBzaG91bGQgYmUgb3BlbmVkIGluIG5vdGVib29rIGVkaXRvci5cblx0ICovXG5cdGV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZUNlbGxPdXRwdXRVcmlXaXRoSW5kZXgobm90ZWJvb2s6IFVSSSwgY2VsbFVyaTogVVJJLCBvdXRwdXRJbmRleDogbnVtYmVyKTogVVJJIHtcblx0XHRyZXR1cm4gbm90ZWJvb2sud2l0aCh7XG5cdFx0XHRzY2hlbWU6IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsT3V0cHV0LFxuXHRcdFx0ZnJhZ21lbnQ6IGNlbGxVcmkuZnJhZ21lbnQsXG5cdFx0XHRxdWVyeTogbmV3IFVSTFNlYXJjaFBhcmFtcyh7XG5cdFx0XHRcdG9wZW5JbjogJ25vdGVib29rJyxcblx0XHRcdFx0b3V0cHV0SW5kZXg6IFN0cmluZyhvdXRwdXRJbmRleCksXG5cdFx0XHR9KS50b1N0cmluZygpXG5cdFx0fSk7XG5cdH1cblxuXHRleHBvcnQgZnVuY3Rpb24gZ2VuZXJhdGVPdXRwdXRFZGl0b3JVcmkobm90ZWJvb2s6IFVSSSwgY2VsbElkOiBzdHJpbmcsIGNlbGxJbmRleDogbnVtYmVyLCBvdXRwdXRJZDogc3RyaW5nLCBvdXRwdXRJbmRleDogbnVtYmVyKTogVVJJIHtcblx0XHRyZXR1cm4gbm90ZWJvb2sud2l0aCh7XG5cdFx0XHRzY2hlbWU6IFNjaGVtYXMudnNjb2RlTm90ZWJvb2tDZWxsT3V0cHV0LFxuXHRcdFx0cXVlcnk6IG5ldyBVUkxTZWFyY2hQYXJhbXMoe1xuXHRcdFx0XHRvcGVuSW46ICdub3RlYm9va091dHB1dEVkaXRvcicsXG5cdFx0XHRcdG5vdGVib29rOiBub3RlYm9vay50b1N0cmluZygpLFxuXHRcdFx0XHRjZWxsSW5kZXg6IFN0cmluZyhjZWxsSW5kZXgpLFxuXHRcdFx0XHRvdXRwdXRJZDogb3V0cHV0SWQsXG5cdFx0XHRcdG91dHB1dEluZGV4OiBTdHJpbmcob3V0cHV0SW5kZXgpLFxuXHRcdFx0fSkudG9TdHJpbmcoKVxuXHRcdH0pO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQ2VsbE91dHB1dFVyaSh1cmk6IFVSSSk6IHsgbm90ZWJvb2s6IFVSSTsgb3BlbkluOiBzdHJpbmc7IG91dHB1dElkPzogc3RyaW5nOyBjZWxsRnJhZ21lbnQ/OiBzdHJpbmc7IG91dHB1dEluZGV4PzogbnVtYmVyOyBjZWxsSGFuZGxlPzogbnVtYmVyOyBjZWxsSW5kZXg/OiBudW1iZXIgfSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGV4dHJhY3RDZWxsT3V0cHV0RGV0YWlscyh1cmkpO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQ2VsbFByb3BlcnR5VXJpKG5vdGVib29rOiBVUkksIGhhbmRsZTogbnVtYmVyLCBzY2hlbWU6IHN0cmluZyk6IFVSSSB7XG5cdFx0cmV0dXJuIENlbGxVcmkuZ2VuZXJhdGUobm90ZWJvb2ssIGhhbmRsZSkud2l0aCh7IHNjaGVtZTogc2NoZW1lIH0pO1xuXHR9XG5cblx0ZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQ2VsbFByb3BlcnR5VXJpKHVyaTogVVJJLCBwcm9wZXJ0eVNjaGVtZTogc3RyaW5nKSB7XG5cdFx0aWYgKHVyaS5zY2hlbWUgIT09IHByb3BlcnR5U2NoZW1lKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiBDZWxsVXJpLnBhcnNlKHVyaS53aXRoKHsgc2NoZW1lOiBzY2hlbWUgfSkpO1xuXHR9XG59XG5cbmNvbnN0IG5vcm1hbGl6ZVNsYXNoZXMgPSAoc3RyOiBzdHJpbmcpID0+IGlzV2luZG93cyA/IHN0ci5yZXBsYWNlKC9cXC8vZywgJ1xcXFwnKSA6IHN0cjtcblxuaW50ZXJmYWNlIElNaW1lVHlwZVdpdGhNYXRjaGVyIHtcblx0cGF0dGVybjogc3RyaW5nO1xuXHRtYXRjaGVzOiBnbG9iLlBhcnNlZFBhdHRlcm47XG59XG5cbmV4cG9ydCBjbGFzcyBNaW1lVHlwZURpc3BsYXlPcmRlciB7XG5cdHByaXZhdGUgcmVhZG9ubHkgb3JkZXI6IElNaW1lVHlwZVdpdGhNYXRjaGVyW107XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aW5pdGlhbFZhbHVlOiByZWFkb25seSBzdHJpbmdbXSA9IFtdLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVmYXVsdE9yZGVyID0gTk9URUJPT0tfRElTUExBWV9PUkRFUixcblx0KSB7XG5cdFx0dGhpcy5vcmRlciA9IFsuLi5uZXcgU2V0KGluaXRpYWxWYWx1ZSldLm1hcChwYXR0ZXJuID0+ICh7XG5cdFx0XHRwYXR0ZXJuLFxuXHRcdFx0bWF0Y2hlczogZ2xvYi5wYXJzZShub3JtYWxpemVTbGFzaGVzKHBhdHRlcm4pLCB7IGlnbm9yZUNhc2U6IHRydWUgfSlcblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhIHNvcnRlZCBhcnJheSBvZiB0aGUgaW5wdXQgbWltZVR5cGVzLlxuXHQgKi9cblx0cHVibGljIHNvcnQobWltZVR5cGVzOiBJdGVyYWJsZTxzdHJpbmc+KTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHJlbWFpbmluZyA9IG5ldyBNYXAoSXRlcmFibGUubWFwKG1pbWVUeXBlcywgbSA9PiBbbSwgbm9ybWFsaXplU2xhc2hlcyhtKV0pKTtcblx0XHRsZXQgc29ydGVkOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCB7IG1hdGNoZXMgfSBvZiB0aGlzLm9yZGVyKSB7XG5cdFx0XHRmb3IgKGNvbnN0IFtvcmlnaW5hbCwgbm9ybWFsaXplZF0gb2YgcmVtYWluaW5nKSB7XG5cdFx0XHRcdGlmIChtYXRjaGVzKG5vcm1hbGl6ZWQpKSB7XG5cdFx0XHRcdFx0c29ydGVkLnB1c2gob3JpZ2luYWwpO1xuXHRcdFx0XHRcdHJlbWFpbmluZy5kZWxldGUob3JpZ2luYWwpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHJlbWFpbmluZy5zaXplKSB7XG5cdFx0XHRzb3J0ZWQgPSBzb3J0ZWQuY29uY2F0KFsuLi5yZW1haW5pbmcua2V5cygpXS5zb3J0KFxuXHRcdFx0XHQoYSwgYikgPT4gdGhpcy5kZWZhdWx0T3JkZXIuaW5kZXhPZihhKSAtIHRoaXMuZGVmYXVsdE9yZGVyLmluZGV4T2YoYiksXG5cdFx0XHQpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gc29ydGVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlY29yZHMgdGhhdCB0aGUgdXNlciBzZWxlY3RlZCB0aGUgZ2l2ZW4gbWltZXR5cGUgb3ZlciB0aGUgb3RoZXJcblx0ICogcG9zc2libGUgbWltZVR5cGVzLCBwcmlvcml0aXppbmcgaXQgZm9yIGZ1dHVyZSByZWZlcmVuY2UuXG5cdCAqL1xuXHRwdWJsaWMgcHJpb3JpdGl6ZShjaG9zZW5NaW1ldHlwZTogc3RyaW5nLCBvdGhlck1pbWVUeXBlczogcmVhZG9ubHkgc3RyaW5nW10pIHtcblx0XHRjb25zdCBjaG9zZW5JbmRleCA9IHRoaXMuZmluZEluZGV4KGNob3Nlbk1pbWV0eXBlKTtcblx0XHRpZiAoY2hvc2VuSW5kZXggPT09IC0xKSB7XG5cdFx0XHQvLyBhbHdheXMgZmlyc3QsIG5vdGhpbmcgbW9yZSB0byBkb1xuXHRcdFx0dGhpcy5vcmRlci51bnNoaWZ0KHsgcGF0dGVybjogY2hvc2VuTWltZXR5cGUsIG1hdGNoZXM6IGdsb2IucGFyc2Uobm9ybWFsaXplU2xhc2hlcyhjaG9zZW5NaW1ldHlwZSksIHsgaWdub3JlQ2FzZTogdHJ1ZSB9KSB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBHZXQgdGhlIG90aGVyIG1pbWVUeXBlcyB0aGF0IGFyZSBiZWZvcmUgdGhlIGNob3Nlbk1pbWV0eXBlLiBUaGVuLCBtb3ZlXG5cdFx0Ly8gdGhlbSBhZnRlciBpdCwgcmV0YWluaW5nIG9yZGVyLlxuXHRcdGNvbnN0IHVuaXF1ZUluZGljZXMgPSBuZXcgU2V0KG90aGVyTWltZVR5cGVzLm1hcChtID0+IHRoaXMuZmluZEluZGV4KG0sIGNob3NlbkluZGV4KSkpO1xuXHRcdHVuaXF1ZUluZGljZXMuZGVsZXRlKC0xKTtcblx0XHRjb25zdCBvdGhlckluZGljZXMgPSBBcnJheS5mcm9tKHVuaXF1ZUluZGljZXMpLnNvcnQoKGEsIGIpID0+IGEgLSBiKTtcblx0XHR0aGlzLm9yZGVyLnNwbGljZShjaG9zZW5JbmRleCArIDEsIDAsIC4uLm90aGVySW5kaWNlcy5tYXAoaSA9PiB0aGlzLm9yZGVyW2ldKSk7XG5cblx0XHRmb3IgKGxldCBvaSA9IG90aGVySW5kaWNlcy5sZW5ndGggLSAxOyBvaSA+PSAwOyBvaS0tKSB7XG5cdFx0XHR0aGlzLm9yZGVyLnNwbGljZShvdGhlckluZGljZXNbb2ldLCAxKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogR2V0cyBhbiBhcnJheSBvZiBpbi1vcmRlciBtaW1ldHlwZSBwcmVmZXJlbmNlcy5cblx0ICovXG5cdHB1YmxpYyB0b0FycmF5KCkge1xuXHRcdHJldHVybiB0aGlzLm9yZGVyLm1hcChvID0+IG8ucGF0dGVybik7XG5cdH1cblxuXHRwcml2YXRlIGZpbmRJbmRleChtaW1lVHlwZTogc3RyaW5nLCBtYXhJbmRleCA9IHRoaXMub3JkZXIubGVuZ3RoKSB7XG5cdFx0Y29uc3Qgbm9ybWFsaXplZCA9IG5vcm1hbGl6ZVNsYXNoZXMobWltZVR5cGUpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgbWF4SW5kZXg7IGkrKykge1xuXHRcdFx0aWYgKHRoaXMub3JkZXJbaV0ubWF0Y2hlcyhub3JtYWxpemVkKSkge1xuXHRcdFx0XHRyZXR1cm4gaTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gLTE7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElNdXRhYmxlU3BsaWNlPFQ+IGV4dGVuZHMgSVNwbGljZTxUPiB7XG5cdHJlYWRvbmx5IHRvSW5zZXJ0OiBUW107XG5cdGRlbGV0ZUNvdW50OiBudW1iZXI7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkaWZmPFQ+KGJlZm9yZTogVFtdLCBhZnRlcjogVFtdLCBjb250YWluczogKGE6IFQpID0+IGJvb2xlYW4sIGVxdWFsOiAoYTogVCwgYjogVCkgPT4gYm9vbGVhbiA9IChhOiBULCBiOiBUKSA9PiBhID09PSBiKTogSVNwbGljZTxUPltdIHtcblx0Y29uc3QgcmVzdWx0OiBJTXV0YWJsZVNwbGljZTxUPltdID0gW107XG5cblx0ZnVuY3Rpb24gcHVzaFNwbGljZShzdGFydDogbnVtYmVyLCBkZWxldGVDb3VudDogbnVtYmVyLCB0b0luc2VydDogVFtdKTogdm9pZCB7XG5cdFx0aWYgKGRlbGV0ZUNvdW50ID09PSAwICYmIHRvSW5zZXJ0Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhdGVzdCA9IHJlc3VsdFtyZXN1bHQubGVuZ3RoIC0gMV07XG5cblx0XHRpZiAobGF0ZXN0ICYmIGxhdGVzdC5zdGFydCArIGxhdGVzdC5kZWxldGVDb3VudCA9PT0gc3RhcnQpIHtcblx0XHRcdGxhdGVzdC5kZWxldGVDb3VudCArPSBkZWxldGVDb3VudDtcblx0XHRcdGxhdGVzdC50b0luc2VydC5wdXNoKC4uLnRvSW5zZXJ0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0LnB1c2goeyBzdGFydCwgZGVsZXRlQ291bnQsIHRvSW5zZXJ0IH0pO1xuXHRcdH1cblx0fVxuXG5cdGxldCBiZWZvcmVJZHggPSAwO1xuXHRsZXQgYWZ0ZXJJZHggPSAwO1xuXG5cdHdoaWxlICh0cnVlKSB7XG5cdFx0aWYgKGJlZm9yZUlkeCA9PT0gYmVmb3JlLmxlbmd0aCkge1xuXHRcdFx0cHVzaFNwbGljZShiZWZvcmVJZHgsIDAsIGFmdGVyLnNsaWNlKGFmdGVySWR4KSk7XG5cdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRpZiAoYWZ0ZXJJZHggPT09IGFmdGVyLmxlbmd0aCkge1xuXHRcdFx0cHVzaFNwbGljZShiZWZvcmVJZHgsIGJlZm9yZS5sZW5ndGggLSBiZWZvcmVJZHgsIFtdKTtcblx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGNvbnN0IGJlZm9yZUVsZW1lbnQgPSBiZWZvcmVbYmVmb3JlSWR4XTtcblx0XHRjb25zdCBhZnRlckVsZW1lbnQgPSBhZnRlclthZnRlcklkeF07XG5cblx0XHRpZiAoZXF1YWwoYmVmb3JlRWxlbWVudCwgYWZ0ZXJFbGVtZW50KSkge1xuXHRcdFx0Ly8gZXF1YWxcblx0XHRcdGJlZm9yZUlkeCArPSAxO1xuXHRcdFx0YWZ0ZXJJZHggKz0gMTtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblxuXHRcdGlmIChjb250YWlucyhhZnRlckVsZW1lbnQpKSB7XG5cdFx0XHQvLyBgYWZ0ZXJFbGVtZW50YCBleGlzdHMgYmVmb3JlLCB3aGljaCBtZWFucyBzb21lIGVsZW1lbnRzIGJlZm9yZSBgYWZ0ZXJFbGVtZW50YCBhcmUgZGVsZXRlZFxuXHRcdFx0cHVzaFNwbGljZShiZWZvcmVJZHgsIDEsIFtdKTtcblx0XHRcdGJlZm9yZUlkeCArPSAxO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBgYWZ0ZXJFbGVtZW50YCBhZGRlZFxuXHRcdFx0cHVzaFNwbGljZShiZWZvcmVJZHgsIDAsIFthZnRlckVsZW1lbnRdKTtcblx0XHRcdGFmdGVySWR4ICs9IDE7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQ2VsbEVkaXRvclZpZXdTdGF0ZSB7XG5cdHNlbGVjdGlvbnM6IGVkaXRvckNvbW1vbi5JQ3Vyc29yU3RhdGVbXTtcbn1cblxuZXhwb3J0IGNvbnN0IE5PVEVCT09LX0VESVRPUl9DVVJTT1JfQk9VTkRBUlkgPSBuZXcgUmF3Q29udGV4dEtleTwnbm9uZScgfCAndG9wJyB8ICdib3R0b20nIHwgJ2JvdGgnPignbm90ZWJvb2tFZGl0b3JDdXJzb3JBdEJvdW5kYXJ5JywgJ25vbmUnKTtcblxuZXhwb3J0IGNvbnN0IE5PVEVCT09LX0VESVRPUl9DVVJTT1JfTElORV9CT1VOREFSWSA9IG5ldyBSYXdDb250ZXh0S2V5PCdub25lJyB8ICdzdGFydCcgfCAnZW5kJyB8ICdib3RoJz4oJ25vdGVib29rRWRpdG9yQ3Vyc29yQXRMaW5lQm91bmRhcnknLCAnbm9uZScpO1xuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va0xvYWRPcHRpb25zIHtcblx0LyoqXG5cdCAqIEdvIHRvIGRpc2sgYnlwYXNzaW5nIGFueSBjYWNoZSBvZiB0aGUgbW9kZWwgaWYgYW55LlxuXHQgKi9cblx0Zm9yY2VSZWFkRnJvbUZpbGU/OiBib29sZWFuO1xuXHQvKipcblx0ICogSWYgcHJvdmlkZWQsIHRoZSBzaXplIG9mIHRoZSBmaWxlIHdpbGwgYmUgY2hlY2tlZCBhZ2FpbnN0IHRoZSBsaW1pdHNcblx0ICogYW5kIGFuIGVycm9yIHdpbGwgYmUgdGhyb3duIGlmIGFueSBsaW1pdCBpcyBleGNlZWRlZC5cblx0ICovXG5cdHJlYWRvbmx5IGxpbWl0cz86IElGaWxlUmVhZExpbWl0cztcbn1cblxuZXhwb3J0IHR5cGUgTm90ZWJvb2tFZGl0b3JNb2RlbENyZWF0aW9uT3B0aW9ucyA9IHtcblx0bGltaXRzPzogSUZpbGVSZWFkTGltaXRzO1xuXHRzY3JhdGNocGFkPzogYm9vbGVhbjtcblx0dmlld1R5cGU/OiBzdHJpbmc7XG59O1xuXG5leHBvcnQgaW50ZXJmYWNlIElSZXNvbHZlZE5vdGVib29rRWRpdG9yTW9kZWwgZXh0ZW5kcyBJTm90ZWJvb2tFZGl0b3JNb2RlbCB7XG5cdG5vdGVib29rOiBOb3RlYm9va1RleHRNb2RlbDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tFZGl0b3JNb2RlbCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VEaXJ0eTogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IG9uRGlkU2F2ZTogRXZlbnQ8SVdvcmtpbmdDb3B5U2F2ZUV2ZW50Pjtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VPcnBoYW5lZDogRXZlbnQ8dm9pZD47XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUmVhZG9ubHk6IEV2ZW50PHZvaWQ+O1xuXHRyZWFkb25seSBvbkRpZFJldmVydFVudGl0bGVkOiBFdmVudDx2b2lkPjtcblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblx0cmVhZG9ubHkgdmlld1R5cGU6IHN0cmluZztcblx0cmVhZG9ubHkgbm90ZWJvb2s6IElOb3RlYm9va1RleHRNb2RlbCB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaGFzRXJyb3JTdGF0ZTogYm9vbGVhbjtcblx0aXNSZXNvbHZlZCgpOiBib29sZWFuO1xuXHRpc0RpcnR5KCk6IGJvb2xlYW47XG5cdGlzTW9kaWZpZWQoKTogYm9vbGVhbjtcblx0aXNSZWFkb25seSgpOiBib29sZWFuIHwgSU1hcmtkb3duU3RyaW5nO1xuXHRpc09ycGhhbmVkKCk6IGJvb2xlYW47XG5cdGhhc0Fzc29jaWF0ZWRGaWxlUGF0aCgpOiBib29sZWFuO1xuXHRsb2FkKG9wdGlvbnM/OiBJTm90ZWJvb2tMb2FkT3B0aW9ucyk6IFByb21pc2U8SVJlc29sdmVkTm90ZWJvb2tFZGl0b3JNb2RlbD47XG5cdHNhdmUob3B0aW9ucz86IElTYXZlT3B0aW9ucyk6IFByb21pc2U8Ym9vbGVhbj47XG5cdHNhdmVBcyh0YXJnZXQ6IFVSSSk6IFByb21pc2U8SVVudHlwZWRFZGl0b3JJbnB1dCB8IHVuZGVmaW5lZD47XG5cdHJldmVydChvcHRpb25zPzogSVJldmVydE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va0RpZmZFZGl0b3JNb2RlbCBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0b3JpZ2luYWw6IHsgbm90ZWJvb2s6IE5vdGVib29rVGV4dE1vZGVsOyByZXNvdXJjZTogVVJJOyB2aWV3VHlwZTogc3RyaW5nIH07XG5cdG1vZGlmaWVkOiB7IG5vdGVib29rOiBOb3RlYm9va1RleHRNb2RlbDsgcmVzb3VyY2U6IFVSSTsgdmlld1R5cGU6IHN0cmluZyB9O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIE5vdGVib29rRG9jdW1lbnRCYWNrdXBEYXRhIGV4dGVuZHMgSVdvcmtpbmdDb3B5QmFja3VwTWV0YSB7XG5cdHJlYWRvbmx5IHZpZXdUeXBlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGJhY2t1cElkPzogc3RyaW5nO1xuXHRyZWFkb25seSBtdGltZT86IG51bWJlcjtcbn1cblxuZXhwb3J0IGVudW0gTm90ZWJvb2tFZGl0b3JQcmlvcml0eSB7XG5cdGRlZmF1bHQgPSAnZGVmYXVsdCcsXG5cdG9wdGlvbiA9ICdvcHRpb24nLFxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va0ZpbmRPcHRpb25zIHtcblx0cmVnZXg/OiBib29sZWFuO1xuXHR3aG9sZVdvcmQ/OiBib29sZWFuO1xuXHRjYXNlU2Vuc2l0aXZlPzogYm9vbGVhbjtcblx0d29yZFNlcGFyYXRvcnM/OiBzdHJpbmc7XG5cdGluY2x1ZGVNYXJrdXBJbnB1dD86IGJvb2xlYW47XG5cdGluY2x1ZGVNYXJrdXBQcmV2aWV3PzogYm9vbGVhbjtcblx0aW5jbHVkZUNvZGVJbnB1dD86IGJvb2xlYW47XG5cdGluY2x1ZGVPdXRwdXQ/OiBib29sZWFuO1xuXHRmaW5kU2NvcGU/OiBJTm90ZWJvb2tGaW5kU2NvcGU7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rRmluZFNjb3BlIHtcblx0ZmluZFNjb3BlVHlwZTogTm90ZWJvb2tGaW5kU2NvcGVUeXBlO1xuXHRzZWxlY3RlZENlbGxSYW5nZXM/OiBJQ2VsbFJhbmdlW107XG5cdHNlbGVjdGVkVGV4dFJhbmdlcz86IFJhbmdlW107XG59XG5cbmV4cG9ydCBlbnVtIE5vdGVib29rRmluZFNjb3BlVHlwZSB7XG5cdENlbGxzID0gJ2NlbGxzJyxcblx0VGV4dCA9ICd0ZXh0Jyxcblx0Tm9uZSA9ICdub25lJ1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va0V4Y2x1c2l2ZURvY3VtZW50RmlsdGVyIHtcblx0aW5jbHVkZT86IHN0cmluZyB8IGdsb2IuSVJlbGF0aXZlUGF0dGVybjtcblx0ZXhjbHVkZT86IHN0cmluZyB8IGdsb2IuSVJlbGF0aXZlUGF0dGVybjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tEb2N1bWVudEZpbHRlciB7XG5cdHZpZXdUeXBlPzogc3RyaW5nIHwgc3RyaW5nW107XG5cdGZpbGVuYW1lUGF0dGVybj86IHN0cmluZyB8IGdsb2IuSVJlbGF0aXZlUGF0dGVybiB8IElOb3RlYm9va0V4Y2x1c2l2ZURvY3VtZW50RmlsdGVyO1xufVxuXG4vL1RPRE9AcmVib3JuaXggdGVzdFxuXG5leHBvcnQgZnVuY3Rpb24gaXNEb2N1bWVudEV4Y2x1ZGVQYXR0ZXJuKGZpbGVuYW1lUGF0dGVybjogc3RyaW5nIHwgZ2xvYi5JUmVsYXRpdmVQYXR0ZXJuIHwgSU5vdGVib29rRXhjbHVzaXZlRG9jdW1lbnRGaWx0ZXIpOiBmaWxlbmFtZVBhdHRlcm4gaXMgeyBpbmNsdWRlOiBzdHJpbmcgfCBnbG9iLklSZWxhdGl2ZVBhdHRlcm47IGV4Y2x1ZGU6IHN0cmluZyB8IGdsb2IuSVJlbGF0aXZlUGF0dGVybiB9IHtcblx0Y29uc3QgYXJnID0gZmlsZW5hbWVQYXR0ZXJuIGFzIElOb3RlYm9va0V4Y2x1c2l2ZURvY3VtZW50RmlsdGVyO1xuXG5cdGlmICgodHlwZW9mIGFyZy5pbmNsdWRlID09PSAnc3RyaW5nJyB8fCBnbG9iLmlzUmVsYXRpdmVQYXR0ZXJuKGFyZy5pbmNsdWRlKSlcblx0XHQmJiAodHlwZW9mIGFyZy5leGNsdWRlID09PSAnc3RyaW5nJyB8fCBnbG9iLmlzUmVsYXRpdmVQYXR0ZXJuKGFyZy5leGNsdWRlKSkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cbmV4cG9ydCBmdW5jdGlvbiBub3RlYm9va0RvY3VtZW50RmlsdGVyTWF0Y2goZmlsdGVyOiBJTm90ZWJvb2tEb2N1bWVudEZpbHRlciwgdmlld1R5cGU6IHN0cmluZywgcmVzb3VyY2U6IFVSSSk6IGJvb2xlYW4ge1xuXHRpZiAoQXJyYXkuaXNBcnJheShmaWx0ZXIudmlld1R5cGUpICYmIGZpbHRlci52aWV3VHlwZS5pbmRleE9mKHZpZXdUeXBlKSA+PSAwKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHRpZiAoZmlsdGVyLnZpZXdUeXBlID09PSB2aWV3VHlwZSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0aWYgKGZpbHRlci5maWxlbmFtZVBhdHRlcm4pIHtcblx0XHRjb25zdCBmaWxlbmFtZVBhdHRlcm4gPSBpc0RvY3VtZW50RXhjbHVkZVBhdHRlcm4oZmlsdGVyLmZpbGVuYW1lUGF0dGVybikgPyBmaWx0ZXIuZmlsZW5hbWVQYXR0ZXJuLmluY2x1ZGUgOiAoZmlsdGVyLmZpbGVuYW1lUGF0dGVybiBhcyBzdHJpbmcgfCBnbG9iLklSZWxhdGl2ZVBhdHRlcm4pO1xuXHRcdGNvbnN0IGV4Y2x1ZGVGaWxlbmFtZVBhdHRlcm4gPSBpc0RvY3VtZW50RXhjbHVkZVBhdHRlcm4oZmlsdGVyLmZpbGVuYW1lUGF0dGVybikgPyBmaWx0ZXIuZmlsZW5hbWVQYXR0ZXJuLmV4Y2x1ZGUgOiB1bmRlZmluZWQ7XG5cblx0XHRpZiAoZ2xvYi5tYXRjaChmaWxlbmFtZVBhdHRlcm4sIGJhc2VuYW1lKHJlc291cmNlLmZzUGF0aCksIHsgaWdub3JlQ2FzZTogdHJ1ZSB9KSkge1xuXHRcdFx0aWYgKGV4Y2x1ZGVGaWxlbmFtZVBhdHRlcm4pIHtcblx0XHRcdFx0aWYgKGdsb2IubWF0Y2goZXhjbHVkZUZpbGVuYW1lUGF0dGVybiwgYmFzZW5hbWUocmVzb3VyY2UuZnNQYXRoKSwgeyBpZ25vcmVDYXNlOiB0cnVlIH0pKSB7XG5cdFx0XHRcdFx0Ly8gc2hvdWxkIGV4Y2x1ZGVcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW1Qcm92aWRlciB7XG5cdHZpZXdUeXBlOiBzdHJpbmc7XG5cdG9uRGlkQ2hhbmdlU3RhdHVzQmFySXRlbXM/OiBFdmVudDx2b2lkPjtcblx0cHJvdmlkZUNlbGxTdGF0dXNCYXJJdGVtcyh1cmk6IFVSSSwgaW5kZXg6IG51bWJlciwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbUxpc3QgfCB1bmRlZmluZWQ+O1xufVxuXG5cbmV4cG9ydCBpbnRlcmZhY2UgSU5vdGVib29rRGlmZlJlc3VsdCB7XG5cdGNlbGxzRGlmZjogSURpZmZSZXN1bHQ7XG5cdG1ldGFkYXRhQ2hhbmdlZDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbSB7XG5cdHJlYWRvbmx5IGFsaWdubWVudDogQ2VsbFN0YXR1c2JhckFsaWdubWVudDtcblx0cmVhZG9ubHkgcHJpb3JpdHk/OiBudW1iZXI7XG5cdHJlYWRvbmx5IHRleHQ6IHN0cmluZztcblx0cmVhZG9ubHkgY29sb3I/OiBzdHJpbmcgfCBUaGVtZUNvbG9yO1xuXHRyZWFkb25seSBiYWNrZ3JvdW5kQ29sb3I/OiBzdHJpbmcgfCBUaGVtZUNvbG9yO1xuXHRyZWFkb25seSB0b29sdGlwPzogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nO1xuXHRyZWFkb25seSBjb21tYW5kPzogc3RyaW5nIHwgQ29tbWFuZDtcblx0cmVhZG9ubHkgYWNjZXNzaWJpbGl0eUluZm9ybWF0aW9uPzogSUFjY2Vzc2liaWxpdHlJbmZvcm1hdGlvbjtcblx0cmVhZG9ubHkgb3BhY2l0eT86IHN0cmluZztcblx0cmVhZG9ubHkgb25seVNob3dXaGVuQWN0aXZlPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTm90ZWJvb2tDZWxsU3RhdHVzQmFySXRlbUxpc3Qge1xuXHRpdGVtczogSU5vdGVib29rQ2VsbFN0YXR1c0Jhckl0ZW1bXTtcblx0ZGlzcG9zZT8oKTogdm9pZDtcbn1cblxuZXhwb3J0IHR5cGUgU2hvd0NlbGxTdGF0dXNCYXJUeXBlID0gJ2hpZGRlbicgfCAndmlzaWJsZScgfCAndmlzaWJsZUFmdGVyRXhlY3V0ZSc7XG5leHBvcnQgY29uc3QgTm90ZWJvb2tTZXR0aW5nID0ge1xuXHRkaXNwbGF5T3JkZXI6ICdub3RlYm9vay5kaXNwbGF5T3JkZXInLFxuXHRjZWxsVG9vbGJhckxvY2F0aW9uOiAnbm90ZWJvb2suY2VsbFRvb2xiYXJMb2NhdGlvbicsXG5cdGNlbGxUb29sYmFyVmlzaWJpbGl0eTogJ25vdGVib29rLmNlbGxUb29sYmFyVmlzaWJpbGl0eScsXG5cdHNob3dDZWxsU3RhdHVzQmFyOiAnbm90ZWJvb2suc2hvd0NlbGxTdGF0dXNCYXInLFxuXHRjZWxsRXhlY3V0aW9uVGltZVZlcmJvc2l0eTogJ25vdGVib29rLmNlbGxFeGVjdXRpb25UaW1lVmVyYm9zaXR5Jyxcblx0dGV4dERpZmZFZGl0b3JQcmV2aWV3OiAnbm90ZWJvb2suZGlmZi5lbmFibGVQcmV2aWV3Jyxcblx0ZGlmZk92ZXJ2aWV3UnVsZXI6ICdub3RlYm9vay5kaWZmLm92ZXJ2aWV3UnVsZXInLFxuXHRleHBlcmltZW50YWxJbnNlcnRUb29sYmFyQWxpZ25tZW50OiAnbm90ZWJvb2suZXhwZXJpbWVudGFsLmluc2VydFRvb2xiYXJBbGlnbm1lbnQnLFxuXHRjb21wYWN0VmlldzogJ25vdGVib29rLmNvbXBhY3RWaWV3Jyxcblx0Zm9jdXNJbmRpY2F0b3I6ICdub3RlYm9vay5jZWxsRm9jdXNJbmRpY2F0b3InLFxuXHRpbnNlcnRUb29sYmFyTG9jYXRpb246ICdub3RlYm9vay5pbnNlcnRUb29sYmFyTG9jYXRpb24nLFxuXHRnbG9iYWxUb29sYmFyOiAnbm90ZWJvb2suZ2xvYmFsVG9vbGJhcicsXG5cdHN0aWNreVNjcm9sbEVuYWJsZWQ6ICdub3RlYm9vay5zdGlja3lTY3JvbGwuZW5hYmxlZCcsXG5cdHN0aWNreVNjcm9sbE1vZGU6ICdub3RlYm9vay5zdGlja3lTY3JvbGwubW9kZScsXG5cdHVuZG9SZWRvUGVyQ2VsbDogJ25vdGVib29rLnVuZG9SZWRvUGVyQ2VsbCcsXG5cdGNvbnNvbGlkYXRlZE91dHB1dEJ1dHRvbjogJ25vdGVib29rLmNvbnNvbGlkYXRlZE91dHB1dEJ1dHRvbicsXG5cdG9wZW5PdXRwdXRJblByZXZpZXdFZGl0b3I6ICdub3RlYm9vay5vdXRwdXQub3BlbkluUHJldmlld0VkaXRvci5lbmFibGVkJyxcblx0c2hvd0ZvbGRpbmdDb250cm9sczogJ25vdGVib29rLnNob3dGb2xkaW5nQ29udHJvbHMnLFxuXHRkcmFnQW5kRHJvcEVuYWJsZWQ6ICdub3RlYm9vay5kcmFnQW5kRHJvcEVuYWJsZWQnLFxuXHRjZWxsRWRpdG9yT3B0aW9uc0N1c3RvbWl6YXRpb25zOiAnbm90ZWJvb2suZWRpdG9yT3B0aW9uc0N1c3RvbWl6YXRpb25zJyxcblx0Y29uc29saWRhdGVkUnVuQnV0dG9uOiAnbm90ZWJvb2suY29uc29saWRhdGVkUnVuQnV0dG9uJyxcblx0b3BlbkdldHRpbmdTdGFydGVkOiAnbm90ZWJvb2suZXhwZXJpbWVudGFsLm9wZW5HZXR0aW5nU3RhcnRlZCcsXG5cdGdsb2JhbFRvb2xiYXJTaG93TGFiZWw6ICdub3RlYm9vay5nbG9iYWxUb29sYmFyU2hvd0xhYmVsJyxcblx0bWFya3VwRm9udFNpemU6ICdub3RlYm9vay5tYXJrdXAuZm9udFNpemUnLFxuXHRtYXJrZG93bkxpbmVIZWlnaHQ6ICdub3RlYm9vay5tYXJrZG93bi5saW5lSGVpZ2h0Jyxcblx0aW50ZXJhY3RpdmVXaW5kb3dDb2xsYXBzZUNvZGVDZWxsczogJ2ludGVyYWN0aXZlV2luZG93LmNvbGxhcHNlQ2VsbElucHV0Q29kZScsXG5cdG91dHB1dFNjcm9sbGluZzogJ25vdGVib29rLm91dHB1dC5zY3JvbGxpbmcnLFxuXHR0ZXh0T3V0cHV0TGluZUxpbWl0OiAnbm90ZWJvb2sub3V0cHV0LnRleHRMaW5lTGltaXQnLFxuXHRMaW5raWZ5T3V0cHV0RmlsZVBhdGhzOiAnbm90ZWJvb2sub3V0cHV0LmxpbmtpZnlGaWxlUGF0aHMnLFxuXHRtaW5pbWFsRXJyb3JSZW5kZXJpbmc6ICdub3RlYm9vay5vdXRwdXQubWluaW1hbEVycm9yUmVuZGVyaW5nJyxcblx0Zm9ybWF0T25TYXZlOiAnbm90ZWJvb2suZm9ybWF0T25TYXZlLmVuYWJsZWQnLFxuXHRpbnNlcnRGaW5hbE5ld2xpbmU6ICdub3RlYm9vay5pbnNlcnRGaW5hbE5ld2xpbmUnLFxuXHRkZWZhdWx0Rm9ybWF0dGVyOiAnbm90ZWJvb2suZGVmYXVsdEZvcm1hdHRlcicsXG5cdGZvcm1hdE9uQ2VsbEV4ZWN1dGlvbjogJ25vdGVib29rLmZvcm1hdE9uQ2VsbEV4ZWN1dGlvbicsXG5cdGNvZGVBY3Rpb25zT25TYXZlOiAnbm90ZWJvb2suY29kZUFjdGlvbnNPblNhdmUnLFxuXHRvdXRwdXRXb3JkV3JhcDogJ25vdGVib29rLm91dHB1dC53b3JkV3JhcCcsXG5cdG91dHB1dExpbmVIZWlnaHQ6ICdub3RlYm9vay5vdXRwdXQubGluZUhlaWdodCcsXG5cdG91dHB1dEZvbnRTaXplOiAnbm90ZWJvb2sub3V0cHV0LmZvbnRTaXplJyxcblx0b3V0cHV0Rm9udEZhbWlseTogJ25vdGVib29rLm91dHB1dC5mb250RmFtaWx5Jyxcblx0ZmluZEZpbHRlcnM6ICdub3RlYm9vay5maW5kLmZpbHRlcnMnLFxuXHRsb2dnaW5nOiAnbm90ZWJvb2subG9nZ2luZycsXG5cdGNvbmZpcm1EZWxldGVSdW5uaW5nQ2VsbDogJ25vdGVib29rLmNvbmZpcm1EZWxldGVSdW5uaW5nQ2VsbCcsXG5cdHJlbW90ZVNhdmluZzogJ25vdGVib29rLmV4cGVyaW1lbnRhbC5yZW1vdGVTYXZlJyxcblx0Z290b1N5bWJvbHNBbGxTeW1ib2xzOiAnbm90ZWJvb2suZ290b1N5bWJvbHMuc2hvd0FsbFN5bWJvbHMnLFxuXHRvdXRsaW5lU2hvd01hcmtkb3duSGVhZGVyc09ubHk6ICdub3RlYm9vay5vdXRsaW5lLnNob3dNYXJrZG93bkhlYWRlcnNPbmx5Jyxcblx0b3V0bGluZVNob3dDb2RlQ2VsbHM6ICdub3RlYm9vay5vdXRsaW5lLnNob3dDb2RlQ2VsbHMnLFxuXHRvdXRsaW5lU2hvd0NvZGVDZWxsU3ltYm9sczogJ25vdGVib29rLm91dGxpbmUuc2hvd0NvZGVDZWxsU3ltYm9scycsXG5cdGJyZWFkY3J1bWJzU2hvd0NvZGVDZWxsczogJ25vdGVib29rLmJyZWFkY3J1bWJzLnNob3dDb2RlQ2VsbHMnLFxuXHRzY3JvbGxUb1JldmVhbENlbGw6ICdub3RlYm9vay5zY3JvbGxpbmcucmV2ZWFsTmV4dENlbGxPbkV4ZWN1dGUnLFxuXHRjZWxsQ2hhdDogJ25vdGVib29rLmV4cGVyaW1lbnRhbC5jZWxsQ2hhdCcsXG5cdGNlbGxHZW5lcmF0ZTogJ25vdGVib29rLmV4cGVyaW1lbnRhbC5nZW5lcmF0ZScsXG5cdG5vdGVib29rVmFyaWFibGVzVmlldzogJ25vdGVib29rLnZhcmlhYmxlc1ZpZXcnLFxuXHRub3RlYm9va0lubGluZVZhbHVlczogJ25vdGVib29rLmlubGluZVZhbHVlcycsXG5cdEludGVyYWN0aXZlV2luZG93UHJvbXB0VG9TYXZlOiAnaW50ZXJhY3RpdmVXaW5kb3cucHJvbXB0VG9TYXZlT25DbG9zZScsXG5cdGNlbGxGYWlsdXJlRGlhZ25vc3RpY3M6ICdub3RlYm9vay5jZWxsRmFpbHVyZURpYWdub3N0aWNzJyxcblx0b3V0cHV0QmFja3VwU2l6ZUxpbWl0OiAnbm90ZWJvb2suYmFja3VwLnNpemVMaW1pdCcsXG5cdG11bHRpQ3Vyc29yOiAnbm90ZWJvb2subXVsdGlDdXJzb3IuZW5hYmxlZCcsXG5cdG1hcmt1cEZvbnRGYW1pbHk6ICdub3RlYm9vay5tYXJrdXAuZm9udEZhbWlseScsXG59IGFzIGNvbnN0O1xuXG5leHBvcnQgY29uc3QgZW51bSBDZWxsU3RhdHVzYmFyQWxpZ25tZW50IHtcblx0TGVmdCA9IDEsXG5cdFJpZ2h0ID0gMlxufVxuXG5leHBvcnQgY2xhc3MgTm90ZWJvb2tXb3JraW5nQ29weVR5cGVJZGVudGlmaWVyIHtcblxuXHRwcml2YXRlIHN0YXRpYyBfcHJlZml4ID0gJ25vdGVib29rLyc7XG5cblx0c3RhdGljIGNyZWF0ZShub3RlYm9va1R5cGU6IHN0cmluZywgdmlld1R5cGU/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBgJHtOb3RlYm9va1dvcmtpbmdDb3B5VHlwZUlkZW50aWZpZXIuX3ByZWZpeH0ke25vdGVib29rVHlwZX0vJHt2aWV3VHlwZSA/PyBub3RlYm9va1R5cGV9YDtcblx0fVxuXG5cdHN0YXRpYyBwYXJzZShjYW5kaWRhdGU6IHN0cmluZyk6IHsgbm90ZWJvb2tUeXBlOiBzdHJpbmc7IHZpZXdUeXBlOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGNhbmRpZGF0ZS5zdGFydHNXaXRoKE5vdGVib29rV29ya2luZ0NvcHlUeXBlSWRlbnRpZmllci5fcHJlZml4KSkge1xuXHRcdFx0Y29uc3Qgc3BsaXQgPSBjYW5kaWRhdGUuc3Vic3RyaW5nKE5vdGVib29rV29ya2luZ0NvcHlUeXBlSWRlbnRpZmllci5fcHJlZml4Lmxlbmd0aCkuc3BsaXQoJy8nKTtcblx0XHRcdGlmIChzcGxpdC5sZW5ndGggPT09IDIpIHtcblx0XHRcdFx0cmV0dXJuIHsgbm90ZWJvb2tUeXBlOiBzcGxpdFswXSwgdmlld1R5cGU6IHNwbGl0WzFdIH07XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBOb3RlYm9va0V4dGVuc2lvbkRlc2NyaXB0aW9uIHtcblx0cmVhZG9ubHkgaWQ6IEV4dGVuc2lvbklkZW50aWZpZXI7XG5cdHJlYWRvbmx5IGxvY2F0aW9uOiBVcmlDb21wb25lbnRzIHwgdW5kZWZpbmVkO1xufVxuXG5jb25zdCB0ZXh0RGVjb2RlciA9IG5ldyBUZXh0RGVjb2RlcigpO1xuXG4vKipcbiAqIEdpdmVuIGEgc3RyZWFtIG9mIGluZGl2aWR1YWwgc3Rkb3V0IG91dHB1dHMsIHRoaXMgZnVuY3Rpb24gd2lsbCByZXR1cm4gdGhlIGNvbXByZXNzZWQgbGluZXMsIGVzY2FwaW5nIHNvbWUgb2YgdGhlIGNvbW1vbiB0ZXJtaW5hbCBlc2NhcGUgY29kZXMuXG4gKiBFLmcuIHNvbWUgdGVybWluYWwgZXNjYXBlIGNvZGVzIHdvdWxkIHJlc3VsdCBpbiB0aGUgcHJldmlvdXMgbGluZSBnZXR0aW5nIGNsZWFyZWQsIHN1Y2ggaWYgd2UgaGFkIDMgbGluZXMgYW5kXG4gKiBsYXN0IGxpbmUgY29udGFpbmVkIHN1Y2ggYSBjb2RlLCB0aGVuIHRoZSByZXN1bHQgc3RyaW5nIHdvdWxkIGJlIGp1c3QgdGhlIGZpcnN0IHR3byBsaW5lcy5cbiAqIEByZXR1cm5zIGEgc2luZ2xlIFZTQnVmZmVyIHdpdGggdGhlIGNvbmNhdGVuYXRlZCBhbmQgY29tcHJlc3NlZCBkYXRhLCBhbmQgd2hldGhlciBhbnkgY29tcHJlc3Npb24gd2FzIGRvbmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb21wcmVzc091dHB1dEl0ZW1TdHJlYW1zKG91dHB1dHM6IFVpbnQ4QXJyYXlbXSkge1xuXHRjb25zdCBidWZmZXJzOiBVaW50OEFycmF5W10gPSBbXTtcblx0bGV0IHN0YXJ0QXBwZW5kaW5nID0gZmFsc2U7XG5cblx0Ly8gUGljayB0aGUgZmlyc3Qgc2V0IG9mIG91dHB1dHMgd2l0aCB0aGUgc2FtZSBtaW1lIHR5cGUuXG5cdGZvciAoY29uc3Qgb3V0cHV0IG9mIG91dHB1dHMpIHtcblx0XHRpZiAoKGJ1ZmZlcnMubGVuZ3RoID09PSAwIHx8IHN0YXJ0QXBwZW5kaW5nKSkge1xuXHRcdFx0YnVmZmVycy5wdXNoKG91dHB1dCk7XG5cdFx0XHRzdGFydEFwcGVuZGluZyA9IHRydWU7XG5cdFx0fVxuXHR9XG5cblx0bGV0IGRpZENvbXByZXNzaW9uID0gY29tcHJlc3NTdHJlYW1CdWZmZXIoYnVmZmVycyk7XG5cdGNvbnN0IGNvbmNhdGVuYXRlZCA9IFZTQnVmZmVyLmNvbmNhdChidWZmZXJzLm1hcChidWZmZXIgPT4gVlNCdWZmZXIud3JhcChidWZmZXIpKSk7XG5cdGNvbnN0IGRhdGEgPSBmb3JtYXRTdHJlYW1UZXh0KGNvbmNhdGVuYXRlZCk7XG5cdGRpZENvbXByZXNzaW9uID0gZGlkQ29tcHJlc3Npb24gfHwgZGF0YS5ieXRlTGVuZ3RoICE9PSBjb25jYXRlbmF0ZWQuYnl0ZUxlbmd0aDtcblx0cmV0dXJuIHsgZGF0YSwgZGlkQ29tcHJlc3Npb24gfTtcbn1cblxuZXhwb3J0IGNvbnN0IE1PVkVfQ1VSU09SXzFfTElORV9DT01NQU5EID0gYCR7U3RyaW5nLmZyb21DaGFyQ29kZSgyNyl9W0FgO1xuY29uc3QgTU9WRV9DVVJTT1JfMV9MSU5FX0NPTU1BTkRfQllURVMgPSBNT1ZFX0NVUlNPUl8xX0xJTkVfQ09NTUFORC5zcGxpdCgnJykubWFwKGMgPT4gYy5jaGFyQ29kZUF0KDApKTtcbmNvbnN0IExJTkVfRkVFRCA9IDEwO1xuZnVuY3Rpb24gY29tcHJlc3NTdHJlYW1CdWZmZXIoc3RyZWFtczogVWludDhBcnJheVtdKSB7XG5cdGxldCBkaWRDb21wcmVzcyA9IGZhbHNlO1xuXHRzdHJlYW1zLmZvckVhY2goKHN0cmVhbSwgaW5kZXgpID0+IHtcblx0XHRpZiAoaW5kZXggPT09IDAgfHwgc3RyZWFtLmxlbmd0aCA8IE1PVkVfQ1VSU09SXzFfTElORV9DT01NQU5ELmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByZXZpb3VzU3RyZWFtID0gc3RyZWFtc1tpbmRleCAtIDFdO1xuXG5cdFx0Ly8gUmVtb3ZlIHRoZSBwcmV2aW91cyBsaW5lIGlmIHJlcXVpcmVkLlxuXHRcdGNvbnN0IGNvbW1hbmQgPSBzdHJlYW0uc3ViYXJyYXkoMCwgTU9WRV9DVVJTT1JfMV9MSU5FX0NPTU1BTkQubGVuZ3RoKTtcblx0XHRpZiAoY29tbWFuZFswXSA9PT0gTU9WRV9DVVJTT1JfMV9MSU5FX0NPTU1BTkRfQllURVNbMF0gJiYgY29tbWFuZFsxXSA9PT0gTU9WRV9DVVJTT1JfMV9MSU5FX0NPTU1BTkRfQllURVNbMV0gJiYgY29tbWFuZFsyXSA9PT0gTU9WRV9DVVJTT1JfMV9MSU5FX0NPTU1BTkRfQllURVNbMl0pIHtcblx0XHRcdGNvbnN0IGxhc3RJbmRleE9mTGluZUZlZWQgPSBwcmV2aW91c1N0cmVhbS5sYXN0SW5kZXhPZihMSU5FX0ZFRUQpO1xuXHRcdFx0aWYgKGxhc3RJbmRleE9mTGluZUZlZWQgPT09IC0xKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0ZGlkQ29tcHJlc3MgPSB0cnVlO1xuXHRcdFx0c3RyZWFtc1tpbmRleCAtIDFdID0gcHJldmlvdXNTdHJlYW0uc3ViYXJyYXkoMCwgbGFzdEluZGV4T2ZMaW5lRmVlZCk7XG5cdFx0XHRzdHJlYW1zW2luZGV4XSA9IHN0cmVhbS5zdWJhcnJheShNT1ZFX0NVUlNPUl8xX0xJTkVfQ09NTUFORC5sZW5ndGgpO1xuXHRcdH1cblx0fSk7XG5cdHJldHVybiBkaWRDb21wcmVzcztcbn1cblxuXG5cbi8qKlxuICogVG9vayB0aGlzIGZyb20ganVweXRlci9ub3RlYm9va1xuICogaHR0cHM6Ly9naXRodWIuY29tL2p1cHl0ZXIvbm90ZWJvb2svYmxvYi9iOGI2NjMzMmUyMDIzZTgzZDJlZTA0ZjgzZDg4MTRmNTY3ZTAxYTRlL25vdGVib29rL3N0YXRpYy9iYXNlL2pzL3V0aWxzLmpzXG4gKiBSZW1vdmUgY2hhcmFjdGVycyB0aGF0IGFyZSBvdmVycmlkZGVuIGJ5IGJhY2tzcGFjZSBjaGFyYWN0ZXJzXG4gKi9cbmZ1bmN0aW9uIGZpeEJhY2tzcGFjZSh0eHQ6IHN0cmluZykge1xuXHRsZXQgdG1wID0gdHh0O1xuXHRkbyB7XG5cdFx0dHh0ID0gdG1wO1xuXHRcdC8vIENhbmNlbCBvdXQgYW55dGhpbmctYnV0LW5ld2xpbmUgZm9sbG93ZWQgYnkgYmFja3NwYWNlXG5cdFx0dG1wID0gdHh0LnJlcGxhY2UoL1teXFxuXVxceDA4L2dtLCAnJyk7XG5cdH0gd2hpbGUgKHRtcC5sZW5ndGggPCB0eHQubGVuZ3RoKTtcblx0cmV0dXJuIHR4dDtcbn1cblxuLyoqXG4gKiBSZW1vdmUgY2h1bmtzIHRoYXQgc2hvdWxkIGJlIG92ZXJyaWRkZW4gYnkgdGhlIGVmZmVjdCBvZiBjYXJyaWFnZSByZXR1cm4gY2hhcmFjdGVyc1xuICogRnJvbSBodHRwczovL2dpdGh1Yi5jb20vanVweXRlci9ub3RlYm9vay9ibG9iL21hc3Rlci9ub3RlYm9vay9zdGF0aWMvYmFzZS9qcy91dGlscy5qc1xuICovXG5mdW5jdGlvbiBmaXhDYXJyaWFnZVJldHVybih0eHQ6IHN0cmluZykge1xuXHR0eHQgPSB0eHQucmVwbGFjZSgvXFxyK1xcbi9nbSwgJ1xcbicpOyAvLyBcXHIgZm9sbG93ZWQgYnkgXFxuIC0tPiBuZXdsaW5lXG5cdHdoaWxlICh0eHQuc2VhcmNoKC9cXHJbXiRdL2cpID4gLTEpIHtcblx0XHRjb25zdCBiYXNlID0gdHh0Lm1hdGNoKC9eKC4qKVxccisvbSkhWzFdO1xuXHRcdGxldCBpbnNlcnQgPSB0eHQubWF0Y2goL1xccisoLiopJC9tKSFbMV07XG5cdFx0aW5zZXJ0ID0gaW5zZXJ0ICsgYmFzZS5zbGljZShpbnNlcnQubGVuZ3RoLCBiYXNlLmxlbmd0aCk7XG5cdFx0dHh0ID0gdHh0LnJlcGxhY2UoL1xccisuKiQvbSwgJ1xccicpLnJlcGxhY2UoL14uKlxcci9tLCBpbnNlcnQpO1xuXHR9XG5cdHJldHVybiB0eHQ7XG59XG5cbmNvbnN0IEJBQ0tTUEFDRV9DSEFSQUNURVIgPSAnXFxiJy5jaGFyQ29kZUF0KDApO1xuY29uc3QgQ0FSUklBR0VfUkVUVVJOX0NIQVJBQ1RFUiA9ICdcXHInLmNoYXJDb2RlQXQoMCk7XG5mdW5jdGlvbiBmb3JtYXRTdHJlYW1UZXh0KGJ1ZmZlcjogVlNCdWZmZXIpOiBWU0J1ZmZlciB7XG5cdC8vIFdlIGhhdmUgc3BlY2lhbCBoYW5kbGluZyBmb3IgYmFja3NwYWNlIGFuZCBjYXJyaWFnZSByZXR1cm4gY2hhcmFjdGVycy5cblx0Ly8gRG9uJ3QgdW5uZWNlc3NhcnkgZGVjb2RlIHRoZSBieXRlcyBpZiB3ZSBkb24ndCBuZWVkIHRvIHBlcmZvcm0gYW55IHByb2Nlc3NpbmcuXG5cdGlmICghYnVmZmVyLmJ1ZmZlci5pbmNsdWRlcyhCQUNLU1BBQ0VfQ0hBUkFDVEVSKSAmJiAhYnVmZmVyLmJ1ZmZlci5pbmNsdWRlcyhDQVJSSUFHRV9SRVRVUk5fQ0hBUkFDVEVSKSkge1xuXHRcdHJldHVybiBidWZmZXI7XG5cdH1cblx0Ly8gRG8gdGhlIHNhbWUgdGhpbmcganVweXRlciBpcyBkb2luZ1xuXHRyZXR1cm4gVlNCdWZmZXIuZnJvbVN0cmluZyhmaXhDYXJyaWFnZVJldHVybihmaXhCYWNrc3BhY2UodGV4dERlY29kZXIuZGVjb2RlKGJ1ZmZlci5idWZmZXIpKSkpO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElOb3RlYm9va0tlcm5lbFNvdXJjZUFjdGlvbiB7XG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBkZXRhaWw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbW1hbmQ/OiBzdHJpbmcgfCBDb21tYW5kO1xuXHRyZWFkb25seSBkb2N1bWVudGF0aW9uPzogVXJpQ29tcG9uZW50cyB8IHN0cmluZztcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsZ0JBQWdCO0FBSXpCLFlBQVksVUFBVTtBQUV0QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUJBQWlCO0FBUzFCLFNBQVMscUJBQXFCO0FBVTlCLFNBQVMscUJBQXFCLFlBQVksYUFBYSwwQkFBMEIsa0JBQWtCLFNBQVMsZ0JBQWdCO0FBSXJILE1BQU0scUJBQXFCO0FBQzNCLE1BQU0sMEJBQTBCO0FBQ2hDLE1BQU0sZ0NBQWdDO0FBQ3RDLE1BQU0sK0JBQStCO0FBQ3JDLE1BQU0saUJBQWlCO0FBQ3ZCLE1BQU0sNEJBQTRCO0FBRWxDLE1BQU0sMEJBQTBCO0FBRWhDLElBQUssV0FBTCxrQkFBS0EsY0FBTDtBQUNOLEVBQUFBLG9CQUFBLFlBQVMsS0FBVDtBQUNBLEVBQUFBLG9CQUFBLFVBQU8sS0FBUDtBQUZXLFNBQUFBO0FBQUEsR0FBQTtBQUtMLE1BQU0seUJBQTRDO0FBQUEsRUFDeEQ7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBLE1BQU07QUFBQSxFQUNOLE1BQU07QUFBQSxFQUNOO0FBQUEsRUFDQTtBQUFBLEVBQ0EsTUFBTTtBQUNQO0FBRU8sTUFBTSxvQ0FBdUQ7QUFBQSxFQUNuRSxNQUFNO0FBQUEsRUFDTixNQUFNO0FBQUEsRUFDTjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBLE1BQU07QUFDUDtBQVFPLE1BQU0saUNBQTJFLG9CQUFJLElBQUk7QUFBQSxFQUMvRixDQUFDLHNCQUFzQixvQkFBSSxJQUFJLENBQUMsb0JBQW9CLGFBQWEsQ0FBQyxDQUFDO0FBQUEsRUFDbkUsQ0FBQyxnQ0FBZ0Msb0JBQUksSUFB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QUFpQyxDQUFDLEdBQUc7QUFDbkssWUFBTSxzQkFBc0IsZUFBZSxZQUFZLFNBQVM7QUFDaEUsVUFBSSx3QkFBd0IsSUFBSTtBQUMvQjtBQUFBLE1BQ0Q7QUFFQSxvQkFBYztBQUNkLGNBQVEsUUFBUSxDQUFDLElBQUksZUFBZSxTQUFTLEdBQUcsbUJBQW1CO0FBQ25FLGNBQVEsS0FBSyxJQUFJLE9BQU8sU0FBUywyQkFBMkIsTUFBTTtBQUFBLElBQ25FO0FBQUEsRUFDRCxDQUFDO0FBQ0QsU0FBTztBQUNSO0FBU0EsU0FBUyxhQUFhLEtBQWE7QUFDbEMsTUFBSSxNQUFNO0FBQ1YsS0FBRztBQUNGLFVBQU07QUFFTixVQUFNLElBQUksUUFBUSxlQUFlLEVBQUU7QUFBQSxFQUNwQyxTQUFTLElBQUksU0FBUyxJQUFJO0FBQzFCLFNBQU87QUFDUjtBQU1BLFNBQVMsa0JBQWtCLEtBQWE7QUFDdkMsUUFBTSxJQUFJLFFBQVEsV0FBVyxJQUFJO0FBQ2pDLFNBQU8sSUFBSSxPQUFPLFNBQVMsSUFBSSxJQUFJO0FBQ2xDLFVBQU0sT0FBTyxJQUFJLE1BQU0sV0FBVyxFQUFHLENBQUM7QUFDdEMsUUFBSSxTQUFTLElBQUksTUFBTSxXQUFXLEVBQUcsQ0FBQztBQUN0QyxhQUFTLFNBQVMsS0FBSyxNQUFNLE9BQU8sUUFBUSxLQUFLLE1BQU07QUFDdkQsVUFBTSxJQUFJLFFBQVEsV0FBVyxJQUFJLEVBQUUsUUFBUSxVQUFVLE1BQU07QUFBQSxFQUM1RDtBQUNBLFNBQU87QUFDUjtBQUVBLE1BQU0sc0JBQXNCLEtBQUssV0FBVyxDQUFDO0FBQzdDLE1BQU0sNEJBQTRCLEtBQUssV0FBVyxDQUFDO0FBQ25ELFNBQVMsaUJBQWlCLFFBQTRCO0FBR3JELE1BQUksQ0FBQyxPQUFPLE9BQU8sU0FBUyxtQkFBbUIsS0FBSyxDQUFDLE9BQU8sT0FBTyxTQUFTLHlCQUF5QixHQUFHO0FBQ3ZHLFdBQU87QUFBQSxFQUNSO0FBRUEsU0FBTyxTQUFTLFdBQVcsa0JBQWtCLGFBQWEsWUFBWSxPQUFPLE9BQU8sTUFBTSxDQUFDLENBQUMsQ0FBQztBQUM5RjsiLAogICJuYW1lcyI6IFsiQ2VsbEtpbmQiLCAiTm90ZWJvb2tSdW5TdGF0ZSIsICJOb3RlYm9va0NlbGxFeGVjdXRpb25TdGF0ZSIsICJOb3RlYm9va0V4ZWN1dGlvblN0YXRlIiwgIk5vdGVib29rUmVuZGVyZXJNYXRjaCIsICJSZW5kZXJlck1lc3NhZ2luZ1NwZWMiLCAiTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUiLCAiU2VsZWN0aW9uU3RhdGVUeXBlIiwgIkNlbGxFZGl0VHlwZSIsICJOb3RlYm9va01ldGFkYXRhVXJpIiwgIkNlbGxVcmkiLCAic2NoZW1lIiwgIk5vdGVib29rRWRpdG9yUHJpb3JpdHkiLCAiTm90ZWJvb2tGaW5kU2NvcGVUeXBlIiwgIkNlbGxTdGF0dXNiYXJBbGlnbm1lbnQiXQp9Cg==
