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
import { VSBuffer } from "../../../../base/common/buffer.js";
import { URI } from "../../../../base/common/uri.js";
import { IFileService } from "../../../files/common/files.js";
import { ILogService } from "../../../log/common/log.js";
import { IDiffComputeService } from "../../common/diffComputeService.js";
import { FILE_EDIT_ATTRIBUTION_PROPERTY, IAgentEditAttributionService } from "../../common/fileEditAttribution.js";
import { buildSessionDbUri } from "../../common/sessionDbUri.js";
import { FileEditKind, ToolResultContentType } from "../../common/state/sessionState.js";
import { extractAiChunks } from "./editChunkExtractor.js";
import { IEditSurvivalReporterFactory } from "./editSurvivalReporter.js";
import { IEditArcReporterService } from "./editArcReporter.js";
import { createArcTextEditFromDiff, extractArcTextEdit } from "./arcToolEdit.js";
let FileEditTracker = class {
  constructor(_sessionUri, _db, _fileService, _logService, _diffComputeService, _editSurvivalReporterFactory, _editAttributionService, _editArcReporterService) {
    this._sessionUri = _sessionUri;
    this._db = _db;
    this._fileService = _fileService;
    this._logService = _logService;
    this._diffComputeService = _diffComputeService;
    this._editSurvivalReporterFactory = _editSurvivalReporterFactory;
    this._editAttributionService = _editAttributionService;
    this._editArcReporterService = _editArcReporterService;
    /**
     * Pending edits keyed by file path. Populated by {@link trackEditStart}
     * before the edit tool runs; popped by {@link completeEdit} when it
     * finishes.
     */
    this._pendingEdits = /* @__PURE__ */ new Map();
    /**
     * Completed edits keyed by file path. Populated by {@link completeEdit};
     * drained by {@link takeCompletedEdit}, which persists the entry to
     * the database.
     */
    this._completedEdits = /* @__PURE__ */ new Map();
  }
  /**
   * Call before an edit tool runs. Reads the file's current content
   * into memory as the "before" state. Callers should await this so
   * the snapshot captures pre-edit content before the tool writes to
   * disk.
   *
   * @param filePath - Absolute path of the file being edited.
   */
  async trackEditStart(filePath) {
    const snapshotDone = this._readFileWithExistence(filePath);
    const entry = {
      beforeContent: VSBuffer.fromString(""),
      beforeExisted: false,
      snapshotDone: snapshotDone.then(({ content, existed }) => {
        entry.beforeContent = content;
        entry.beforeExisted = existed;
      })
    };
    this._pendingEdits.set(filePath, entry);
    await entry.snapshotDone;
  }
  /**
   * Call after an edit tool finishes. Reads the file content again as
   * the "after" state and stores the result for later retrieval via
   * {@link takeCompletedEdit}.
   *
   * @param filePath - Absolute path of the file that was edited.
   */
  async completeEdit(filePath) {
    const pending = this._pendingEdits.get(filePath);
    if (!pending) {
      return;
    }
    this._pendingEdits.delete(filePath);
    await pending.snapshotDone;
    const afterContent = await this._readFile(filePath);
    this._completedEdits.set(filePath, {
      beforeContent: pending.beforeContent,
      beforeExisted: pending.beforeExisted,
      afterContent
    });
  }
  /**
   * Retrieves and removes a completed edit for the given file path,
   * persists it to the session database with computed diff counts,
   * and returns the result as an {@link ToolResultFileEditContent}
   * for inclusion in the tool result.
   *
   * `toolName` and `toolInput` are forwarded to {@link extractAiChunks}
   * for region-based survival scoring; unknown shapes fall back to
   * whole-file scoring.
   */
  async takeCompletedEdit(turnId, toolCallId, filePath, toolName, toolInput, modelId) {
    const edit = this._completedEdits.get(filePath);
    if (!edit) {
      return void 0;
    }
    this._completedEdits.delete(filePath);
    if (!modelId) {
      this._logService.warn(`[FileEditTracker] No modelId for completed edit: ${filePath} (turn=${turnId}, toolCall=${toolCallId}, tool=${toolName || "<unknown>"}). Edit-survival telemetry will be emitted with an empty modelId.`);
    }
    const beforeBytes = edit.beforeContent.buffer;
    const afterBytes = edit.afterContent.buffer;
    const beforeText = edit.beforeContent.toString();
    const afterText = edit.afterContent.toString();
    const completionTime = Date.now();
    const isCreate = !edit.beforeExisted && afterBytes.length > 0;
    let addedLines;
    let removedLines;
    let changes = [];
    try {
      const counts = await this._diffComputeService.computeDiffCounts(beforeText, afterText);
      addedLines = counts.added;
      removedLines = isCreate ? 0 : counts.removed;
      changes = counts.changes;
    } catch (err) {
      this._logService.warn(`[FileEditTracker] Failed to compute diff counts: ${filePath}`, err);
    }
    try {
      await this._db.storeFileEdit({
        turnId,
        toolCallId,
        filePath,
        kind: isCreate ? FileEditKind.Create : FileEditKind.Edit,
        beforeContent: beforeBytes,
        afterContent: afterBytes,
        addedLines,
        removedLines
      });
    } catch (err) {
      this._logService.warn(`[FileEditTracker] Failed to persist file edit to database: ${filePath}`, err);
    }
    this._editSurvivalReporterFactory.launch({
      sessionUri: this._sessionUri,
      turnId,
      toolCallId,
      filePath,
      beforeText,
      afterText,
      isCreate,
      modelId,
      toolName,
      aiChunks: extractAiChunks(toolName, toolInput, filePath)
    });
    const content = {
      type: ToolResultContentType.FileEdit,
      before: {
        uri: URI.file(filePath).toString(),
        content: { uri: buildSessionDbUri(this._sessionUri, toolCallId, filePath, "before") }
      },
      after: {
        uri: URI.file(filePath).toString(),
        content: { uri: buildSessionDbUri(this._sessionUri, toolCallId, filePath, "after") }
      },
      diff: addedLines !== void 0 ? { added: addedLines, removed: removedLines } : void 0
    };
    let marker;
    try {
      marker = await this._editAttributionService.recordEdit({
        sessionUri: this._sessionUri,
        turnId,
        toolCallId,
        filePath,
        beforeText,
        afterText,
        changes,
        modelId,
        toolName
      });
    } catch (error) {
      this._logService.warn(`[FileEditTracker] Failed to record edit attribution for ${filePath}: ${error}`);
    }
    const initialEdit = extractArcTextEdit(toolName, toolInput, beforeText, afterText) ?? createArcTextEditFromDiff(changes, beforeText, afterText);
    this._editArcReporterService.reportEdit({
      sessionUri: this._sessionUri,
      turnId,
      toolCallId,
      filePath,
      beforeText,
      afterText,
      initialEdit,
      modelId,
      toolName,
      completionTime
    }).catch((error) => {
      this._logService.warn(`[FileEditTracker] Failed to start ARC telemetry: ${filePath}`, error);
    });
    if (!marker) {
      return content;
    }
    const attributedContent = {
      ...content,
      [FILE_EDIT_ATTRIBUTION_PROPERTY]: marker
    };
    return attributedContent;
  }
  async flushAttribution() {
    await this._editAttributionService.flushSession(this._sessionUri);
  }
  async _readFile(filePath) {
    try {
      const content = await this._fileService.readFile(URI.file(filePath));
      return content.value;
    } catch (err) {
      this._logService.trace(`[FileEditTracker] Could not read file for snapshot: ${filePath}`, err);
      return VSBuffer.fromString("");
    }
  }
  async _readFileWithExistence(filePath) {
    try {
      const content = await this._fileService.readFile(URI.file(filePath));
      return { content: content.value, existed: true };
    } catch (err) {
      this._logService.trace(`[FileEditTracker] Could not read file for snapshot: ${filePath}`, err);
      return { content: VSBuffer.fromString(""), existed: false };
    }
  }
};
FileEditTracker = __decorateClass([
  __decorateParam(2, IFileService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IDiffComputeService),
  __decorateParam(5, IEditSurvivalReporterFactory),
  __decorateParam(6, IAgentEditAttributionService),
  __decorateParam(7, IEditArcReporterService)
], FileEditTracker);
export {
  FileEditTracker
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3BsYXRmb3JtL2FnZW50SG9zdC9ub2RlL3NoYXJlZC9maWxlRWRpdFRyYWNrZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSURpZmZDb21wdXRlU2VydmljZSwgSU9mZnNldEVkaXQgfSBmcm9tICcuLi8uLi9jb21tb24vZGlmZkNvbXB1dGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF0dHJpYnV0ZWRUb29sUmVzdWx0RmlsZUVkaXRDb250ZW50LCBGSUxFX0VESVRfQVRUUklCVVRJT05fUFJPUEVSVFksIElBZ2VudEVkaXRBdHRyaWJ1dGlvblNlcnZpY2UsIElGaWxlRWRpdEF0dHJpYnV0aW9uTWFya2VyIH0gZnJvbSAnLi4vLi4vY29tbW9uL2ZpbGVFZGl0QXR0cmlidXRpb24uanMnO1xuaW1wb3J0IHsgSVNlc3Npb25EYXRhYmFzZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uRGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYnVpbGRTZXNzaW9uRGJVcmkgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRiVXJpLmpzJztcbmltcG9ydCB7IEZpbGVFZGl0S2luZCwgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCB0eXBlIFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGV4dHJhY3RBaUNodW5rcyB9IGZyb20gJy4vZWRpdENodW5rRXh0cmFjdG9yLmpzJztcbmltcG9ydCB7IElFZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnkgfSBmcm9tICcuL2VkaXRTdXJ2aXZhbFJlcG9ydGVyLmpzJztcbmltcG9ydCB7IElFZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlIH0gZnJvbSAnLi9lZGl0QXJjUmVwb3J0ZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlQXJjVGV4dEVkaXRGcm9tRGlmZiwgZXh0cmFjdEFyY1RleHRFZGl0IH0gZnJvbSAnLi9hcmNUb29sRWRpdC5qcyc7XG5cbi8qKlxuICogVHJhY2tzIGZpbGUgZWRpdHMgbWFkZSBieSB0b29scyBpbiBhIHNlc3Npb24gYnkgc25hcHNob3R0aW5nIGZpbGUgY29udGVudFxuICogYmVmb3JlIGFuZCBhZnRlciBlYWNoIGVkaXQgdG9vbCBpbnZvY2F0aW9uLCBwZXJzaXN0aW5nIHNuYXBzaG90cyBpbnRvIHRoZVxuICogc2Vzc2lvbiBkYXRhYmFzZS5cbiAqL1xuZXhwb3J0IGNsYXNzIEZpbGVFZGl0VHJhY2tlciB7XG5cblx0LyoqXG5cdCAqIFBlbmRpbmcgZWRpdHMga2V5ZWQgYnkgZmlsZSBwYXRoLiBQb3B1bGF0ZWQgYnkge0BsaW5rIHRyYWNrRWRpdFN0YXJ0fVxuXHQgKiBiZWZvcmUgdGhlIGVkaXQgdG9vbCBydW5zOyBwb3BwZWQgYnkge0BsaW5rIGNvbXBsZXRlRWRpdH0gd2hlbiBpdFxuXHQgKiBmaW5pc2hlcy5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdFZGl0cyA9IG5ldyBNYXA8c3RyaW5nLCB7IGJlZm9yZUNvbnRlbnQ6IFZTQnVmZmVyOyBiZWZvcmVFeGlzdGVkOiBib29sZWFuOyBzbmFwc2hvdERvbmU6IFByb21pc2U8dm9pZD4gfT4oKTtcblxuXHQvKipcblx0ICogQ29tcGxldGVkIGVkaXRzIGtleWVkIGJ5IGZpbGUgcGF0aC4gUG9wdWxhdGVkIGJ5IHtAbGluayBjb21wbGV0ZUVkaXR9O1xuXHQgKiBkcmFpbmVkIGJ5IHtAbGluayB0YWtlQ29tcGxldGVkRWRpdH0sIHdoaWNoIHBlcnNpc3RzIHRoZSBlbnRyeSB0b1xuXHQgKiB0aGUgZGF0YWJhc2UuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb21wbGV0ZWRFZGl0cyA9IG5ldyBNYXA8c3RyaW5nLCB7IGJlZm9yZUNvbnRlbnQ6IFZTQnVmZmVyOyBiZWZvcmVFeGlzdGVkOiBib29sZWFuOyBhZnRlckNvbnRlbnQ6IFZTQnVmZmVyIH0+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblVyaTogc3RyaW5nLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RiOiBJU2Vzc2lvbkRhdGFiYXNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElEaWZmQ29tcHV0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGlmZkNvbXB1dGVTZXJ2aWNlOiBJRGlmZkNvbXB1dGVTZXJ2aWNlLFxuXHRcdEBJRWRpdFN1cnZpdmFsUmVwb3J0ZXJGYWN0b3J5IHByaXZhdGUgcmVhZG9ubHkgX2VkaXRTdXJ2aXZhbFJlcG9ydGVyRmFjdG9yeTogSUVkaXRTdXJ2aXZhbFJlcG9ydGVyRmFjdG9yeSxcblx0XHRASUFnZW50RWRpdEF0dHJpYnV0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0QXR0cmlidXRpb25TZXJ2aWNlOiBJQWdlbnRFZGl0QXR0cmlidXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdEFyY1JlcG9ydGVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0QXJjUmVwb3J0ZXJTZXJ2aWNlOiBJRWRpdEFyY1JlcG9ydGVyU2VydmljZSxcblx0KSB7IH1cblxuXHQvKipcblx0ICogQ2FsbCBiZWZvcmUgYW4gZWRpdCB0b29sIHJ1bnMuIFJlYWRzIHRoZSBmaWxlJ3MgY3VycmVudCBjb250ZW50XG5cdCAqIGludG8gbWVtb3J5IGFzIHRoZSBcImJlZm9yZVwiIHN0YXRlLiBDYWxsZXJzIHNob3VsZCBhd2FpdCB0aGlzIHNvXG5cdCAqIHRoZSBzbmFwc2hvdCBjYXB0dXJlcyBwcmUtZWRpdCBjb250ZW50IGJlZm9yZSB0aGUgdG9vbCB3cml0ZXMgdG9cblx0ICogZGlzay5cblx0ICpcblx0ICogQHBhcmFtIGZpbGVQYXRoIC0gQWJzb2x1dGUgcGF0aCBvZiB0aGUgZmlsZSBiZWluZyBlZGl0ZWQuXG5cdCAqL1xuXHRhc3luYyB0cmFja0VkaXRTdGFydChmaWxlUGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc25hcHNob3REb25lID0gdGhpcy5fcmVhZEZpbGVXaXRoRXhpc3RlbmNlKGZpbGVQYXRoKTtcblx0XHRjb25zdCBlbnRyeSA9IHtcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IFZTQnVmZmVyLmZyb21TdHJpbmcoJycpLFxuXHRcdFx0YmVmb3JlRXhpc3RlZDogZmFsc2UsXG5cdFx0XHRzbmFwc2hvdERvbmU6IHNuYXBzaG90RG9uZS50aGVuKCh7IGNvbnRlbnQsIGV4aXN0ZWQgfSkgPT4ge1xuXHRcdFx0XHRlbnRyeS5iZWZvcmVDb250ZW50ID0gY29udGVudDtcblx0XHRcdFx0ZW50cnkuYmVmb3JlRXhpc3RlZCA9IGV4aXN0ZWQ7XG5cdFx0XHR9KSxcblx0XHR9O1xuXHRcdHRoaXMuX3BlbmRpbmdFZGl0cy5zZXQoZmlsZVBhdGgsIGVudHJ5KTtcblx0XHRhd2FpdCBlbnRyeS5zbmFwc2hvdERvbmU7XG5cdH1cblxuXHQvKipcblx0ICogQ2FsbCBhZnRlciBhbiBlZGl0IHRvb2wgZmluaXNoZXMuIFJlYWRzIHRoZSBmaWxlIGNvbnRlbnQgYWdhaW4gYXNcblx0ICogdGhlIFwiYWZ0ZXJcIiBzdGF0ZSBhbmQgc3RvcmVzIHRoZSByZXN1bHQgZm9yIGxhdGVyIHJldHJpZXZhbCB2aWFcblx0ICoge0BsaW5rIHRha2VDb21wbGV0ZWRFZGl0fS5cblx0ICpcblx0ICogQHBhcmFtIGZpbGVQYXRoIC0gQWJzb2x1dGUgcGF0aCBvZiB0aGUgZmlsZSB0aGF0IHdhcyBlZGl0ZWQuXG5cdCAqL1xuXHRhc3luYyBjb21wbGV0ZUVkaXQoZmlsZVBhdGg6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHBlbmRpbmcgPSB0aGlzLl9wZW5kaW5nRWRpdHMuZ2V0KGZpbGVQYXRoKTtcblx0XHRpZiAoIXBlbmRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fcGVuZGluZ0VkaXRzLmRlbGV0ZShmaWxlUGF0aCk7XG5cdFx0YXdhaXQgcGVuZGluZy5zbmFwc2hvdERvbmU7XG5cblx0XHRjb25zdCBhZnRlckNvbnRlbnQgPSBhd2FpdCB0aGlzLl9yZWFkRmlsZShmaWxlUGF0aCk7XG5cblx0XHR0aGlzLl9jb21wbGV0ZWRFZGl0cy5zZXQoZmlsZVBhdGgsIHtcblx0XHRcdGJlZm9yZUNvbnRlbnQ6IHBlbmRpbmcuYmVmb3JlQ29udGVudCxcblx0XHRcdGJlZm9yZUV4aXN0ZWQ6IHBlbmRpbmcuYmVmb3JlRXhpc3RlZCxcblx0XHRcdGFmdGVyQ29udGVudCxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXRyaWV2ZXMgYW5kIHJlbW92ZXMgYSBjb21wbGV0ZWQgZWRpdCBmb3IgdGhlIGdpdmVuIGZpbGUgcGF0aCxcblx0ICogcGVyc2lzdHMgaXQgdG8gdGhlIHNlc3Npb24gZGF0YWJhc2Ugd2l0aCBjb21wdXRlZCBkaWZmIGNvdW50cyxcblx0ICogYW5kIHJldHVybnMgdGhlIHJlc3VsdCBhcyBhbiB7QGxpbmsgVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudH1cblx0ICogZm9yIGluY2x1c2lvbiBpbiB0aGUgdG9vbCByZXN1bHQuXG5cdCAqXG5cdCAqIGB0b29sTmFtZWAgYW5kIGB0b29sSW5wdXRgIGFyZSBmb3J3YXJkZWQgdG8ge0BsaW5rIGV4dHJhY3RBaUNodW5rc31cblx0ICogZm9yIHJlZ2lvbi1iYXNlZCBzdXJ2aXZhbCBzY29yaW5nOyB1bmtub3duIHNoYXBlcyBmYWxsIGJhY2sgdG9cblx0ICogd2hvbGUtZmlsZSBzY29yaW5nLlxuXHQgKi9cblx0YXN5bmMgdGFrZUNvbXBsZXRlZEVkaXQodHVybklkOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZywgZmlsZVBhdGg6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZywgdG9vbElucHV0OiB1bmtub3duLCBtb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQcm9taXNlPFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnQgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBlZGl0ID0gdGhpcy5fY29tcGxldGVkRWRpdHMuZ2V0KGZpbGVQYXRoKTtcblx0XHRpZiAoIWVkaXQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuX2NvbXBsZXRlZEVkaXRzLmRlbGV0ZShmaWxlUGF0aCk7XG5cblx0XHRpZiAoIW1vZGVsSWQpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0ZpbGVFZGl0VHJhY2tlcl0gTm8gbW9kZWxJZCBmb3IgY29tcGxldGVkIGVkaXQ6ICR7ZmlsZVBhdGh9ICh0dXJuPSR7dHVybklkfSwgdG9vbENhbGw9JHt0b29sQ2FsbElkfSwgdG9vbD0ke3Rvb2xOYW1lIHx8ICc8dW5rbm93bj4nfSkuIEVkaXQtc3Vydml2YWwgdGVsZW1ldHJ5IHdpbGwgYmUgZW1pdHRlZCB3aXRoIGFuIGVtcHR5IG1vZGVsSWQuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmVmb3JlQnl0ZXMgPSBlZGl0LmJlZm9yZUNvbnRlbnQuYnVmZmVyO1xuXHRcdGNvbnN0IGFmdGVyQnl0ZXMgPSBlZGl0LmFmdGVyQ29udGVudC5idWZmZXI7XG5cdFx0Y29uc3QgYmVmb3JlVGV4dCA9IGVkaXQuYmVmb3JlQ29udGVudC50b1N0cmluZygpO1xuXHRcdGNvbnN0IGFmdGVyVGV4dCA9IGVkaXQuYWZ0ZXJDb250ZW50LnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgY29tcGxldGlvblRpbWUgPSBEYXRlLm5vdygpO1xuXG5cdFx0Y29uc3QgaXNDcmVhdGUgPSAhZWRpdC5iZWZvcmVFeGlzdGVkICYmIGFmdGVyQnl0ZXMubGVuZ3RoID4gMDtcblxuXHRcdGxldCBhZGRlZExpbmVzOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHJlbW92ZWRMaW5lczogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjaGFuZ2VzOiByZWFkb25seSBJT2Zmc2V0RWRpdFtdID0gW107XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvdW50cyA9IGF3YWl0IHRoaXMuX2RpZmZDb21wdXRlU2VydmljZS5jb21wdXRlRGlmZkNvdW50cyhiZWZvcmVUZXh0LCBhZnRlclRleHQpO1xuXHRcdFx0YWRkZWRMaW5lcyA9IGNvdW50cy5hZGRlZDtcblx0XHRcdHJlbW92ZWRMaW5lcyA9IGlzQ3JlYXRlID8gMCA6IGNvdW50cy5yZW1vdmVkO1xuXHRcdFx0Y2hhbmdlcyA9IGNvdW50cy5jaGFuZ2VzO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbRmlsZUVkaXRUcmFja2VyXSBGYWlsZWQgdG8gY29tcHV0ZSBkaWZmIGNvdW50czogJHtmaWxlUGF0aH1gLCBlcnIpO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9kYi5zdG9yZUZpbGVFZGl0KHtcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRmaWxlUGF0aCxcblx0XHRcdFx0a2luZDogaXNDcmVhdGUgPyBGaWxlRWRpdEtpbmQuQ3JlYXRlIDogRmlsZUVkaXRLaW5kLkVkaXQsXG5cdFx0XHRcdGJlZm9yZUNvbnRlbnQ6IGJlZm9yZUJ5dGVzLFxuXHRcdFx0XHRhZnRlckNvbnRlbnQ6IGFmdGVyQnl0ZXMsXG5cdFx0XHRcdGFkZGVkTGluZXMsXG5cdFx0XHRcdHJlbW92ZWRMaW5lcyxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbRmlsZUVkaXRUcmFja2VyXSBGYWlsZWQgdG8gcGVyc2lzdCBmaWxlIGVkaXQgdG8gZGF0YWJhc2U6ICR7ZmlsZVBhdGh9YCwgZXJyKTtcblx0XHR9XG5cblx0XHR0aGlzLl9lZGl0U3Vydml2YWxSZXBvcnRlckZhY3RvcnkubGF1bmNoKHtcblx0XHRcdHNlc3Npb25Vcmk6IHRoaXMuX3Nlc3Npb25VcmksXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0ZmlsZVBhdGgsXG5cdFx0XHRiZWZvcmVUZXh0LFxuXHRcdFx0YWZ0ZXJUZXh0LFxuXHRcdFx0aXNDcmVhdGUsXG5cdFx0XHRtb2RlbElkLFxuXHRcdFx0dG9vbE5hbWUsXG5cdFx0XHRhaUNodW5rczogZXh0cmFjdEFpQ2h1bmtzKHRvb2xOYW1lLCB0b29sSW5wdXQsIGZpbGVQYXRoKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvbnRlbnQ6IFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnQgPSB7XG5cdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRiZWZvcmU6IHtcblx0XHRcdFx0dXJpOiBVUkkuZmlsZShmaWxlUGF0aCkudG9TdHJpbmcoKSxcblx0XHRcdFx0Y29udGVudDogeyB1cmk6IGJ1aWxkU2Vzc2lvbkRiVXJpKHRoaXMuX3Nlc3Npb25VcmksIHRvb2xDYWxsSWQsIGZpbGVQYXRoLCAnYmVmb3JlJykgfSxcblx0XHRcdH0sXG5cdFx0XHRhZnRlcjoge1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKGZpbGVQYXRoKS50b1N0cmluZygpLFxuXHRcdFx0XHRjb250ZW50OiB7IHVyaTogYnVpbGRTZXNzaW9uRGJVcmkodGhpcy5fc2Vzc2lvblVyaSwgdG9vbENhbGxJZCwgZmlsZVBhdGgsICdhZnRlcicpIH0sXG5cdFx0XHR9LFxuXHRcdFx0ZGlmZjogYWRkZWRMaW5lcyAhPT0gdW5kZWZpbmVkID8geyBhZGRlZDogYWRkZWRMaW5lcywgcmVtb3ZlZDogcmVtb3ZlZExpbmVzIH0gOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0XHRsZXQgbWFya2VyOiBJRmlsZUVkaXRBdHRyaWJ1dGlvbk1hcmtlciB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0bWFya2VyID0gYXdhaXQgdGhpcy5fZWRpdEF0dHJpYnV0aW9uU2VydmljZS5yZWNvcmRFZGl0KHtcblx0XHRcdFx0c2Vzc2lvblVyaTogdGhpcy5fc2Vzc2lvblVyaSxcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRmaWxlUGF0aCxcblx0XHRcdFx0YmVmb3JlVGV4dCxcblx0XHRcdFx0YWZ0ZXJUZXh0LFxuXHRcdFx0XHRjaGFuZ2VzLFxuXHRcdFx0XHRtb2RlbElkLFxuXHRcdFx0XHR0b29sTmFtZSxcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtGaWxlRWRpdFRyYWNrZXJdIEZhaWxlZCB0byByZWNvcmQgZWRpdCBhdHRyaWJ1dGlvbiBmb3IgJHtmaWxlUGF0aH06ICR7ZXJyb3J9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5pdGlhbEVkaXQgPSBleHRyYWN0QXJjVGV4dEVkaXQodG9vbE5hbWUsIHRvb2xJbnB1dCwgYmVmb3JlVGV4dCwgYWZ0ZXJUZXh0KVxuXHRcdFx0Pz8gY3JlYXRlQXJjVGV4dEVkaXRGcm9tRGlmZihjaGFuZ2VzLCBiZWZvcmVUZXh0LCBhZnRlclRleHQpO1xuXHRcdHRoaXMuX2VkaXRBcmNSZXBvcnRlclNlcnZpY2UucmVwb3J0RWRpdCh7XG5cdFx0XHRzZXNzaW9uVXJpOiB0aGlzLl9zZXNzaW9uVXJpLFxuXHRcdFx0dHVybklkLFxuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdGZpbGVQYXRoLFxuXHRcdFx0YmVmb3JlVGV4dCxcblx0XHRcdGFmdGVyVGV4dCxcblx0XHRcdGluaXRpYWxFZGl0LFxuXHRcdFx0bW9kZWxJZCxcblx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0Y29tcGxldGlvblRpbWUsXG5cdFx0fSkuY2F0Y2goZXJyb3IgPT4ge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbRmlsZUVkaXRUcmFja2VyXSBGYWlsZWQgdG8gc3RhcnQgQVJDIHRlbGVtZXRyeTogJHtmaWxlUGF0aH1gLCBlcnJvcik7XG5cdFx0fSk7XG5cblx0XHRpZiAoIW1hcmtlcikge1xuXHRcdFx0cmV0dXJuIGNvbnRlbnQ7XG5cdFx0fVxuXHRcdGNvbnN0IGF0dHJpYnV0ZWRDb250ZW50OiBBdHRyaWJ1dGVkVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudCA9IHtcblx0XHRcdC4uLmNvbnRlbnQsXG5cdFx0XHRbRklMRV9FRElUX0FUVFJJQlVUSU9OX1BST1BFUlRZXTogbWFya2VyLFxuXHRcdH07XG5cdFx0cmV0dXJuIGF0dHJpYnV0ZWRDb250ZW50O1xuXHR9XG5cblx0YXN5bmMgZmx1c2hBdHRyaWJ1dGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9lZGl0QXR0cmlidXRpb25TZXJ2aWNlLmZsdXNoU2Vzc2lvbih0aGlzLl9zZXNzaW9uVXJpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRGaWxlKGZpbGVQYXRoOiBzdHJpbmcpOiBQcm9taXNlPFZTQnVmZmVyPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShVUkkuZmlsZShmaWxlUGF0aCkpO1xuXHRcdFx0cmV0dXJuIGNvbnRlbnQudmFsdWU7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbRmlsZUVkaXRUcmFja2VyXSBDb3VsZCBub3QgcmVhZCBmaWxlIGZvciBzbmFwc2hvdDogJHtmaWxlUGF0aH1gLCBlcnIpO1xuXHRcdFx0cmV0dXJuIFZTQnVmZmVyLmZyb21TdHJpbmcoJycpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlYWRGaWxlV2l0aEV4aXN0ZW5jZShmaWxlUGF0aDogc3RyaW5nKTogUHJvbWlzZTx7IGNvbnRlbnQ6IFZTQnVmZmVyOyBleGlzdGVkOiBib29sZWFuIH0+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5maWxlKGZpbGVQYXRoKSk7XG5cdFx0XHRyZXR1cm4geyBjb250ZW50OiBjb250ZW50LnZhbHVlLCBleGlzdGVkOiB0cnVlIH07XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbRmlsZUVkaXRUcmFja2VyXSBDb3VsZCBub3QgcmVhZCBmaWxlIGZvciBzbmFwc2hvdDogJHtmaWxlUGF0aH1gLCBlcnIpO1xuXHRcdFx0cmV0dXJuIHsgY29udGVudDogVlNCdWZmZXIuZnJv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
