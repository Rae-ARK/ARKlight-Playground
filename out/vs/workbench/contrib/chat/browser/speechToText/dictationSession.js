import "./media/dictationSession.css";
import { DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { EditorOption } from "../../../../../editor/common/config/editorOptions.js";
import { TrackedRangeStickiness } from "../../../../../editor/common/model.js";
import { Position } from "../../../../../editor/common/core/position.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { Selection } from "../../../../../editor/common/core/selection.js";
import { localize } from "../../../../../nls.js";
import { ChatSpeechToTextState } from "./chatSpeechToTextService.js";
const INTERIM_PROCESSING_CLASS = "dictation-interim-processing";
const LOG_PREFIX = "[chat-stt-dictation]";
class LiveTranscriptInserter {
  constructor(_editor, _logService) {
    this._editor = _editor;
    this._logService = _logService;
    this._needsLeadingSpace = false;
    this._finalized = false;
    this._isApplyingEdit = false;
    this._userModified = false;
    /**
     * The last cumulative transcript this inserter rendered. Captured when the
     * user manually edits the dictated text so everything spoken up to that
     * point can be treated as committed and left untouched.
     */
    this._lastCumulativeText = "";
    /**
     * The leading portion of the cumulative transcript the user has taken
     * ownership of (by editing the inserted text). Later transcript updates only
     * insert the portion of the cumulative transcript that follows this prefix,
     * so dictation keeps working after a manual edit instead of stopping.
     */
    this._committedText = "";
  }
  /**
   * Render the cumulative transcript. While `interim` is true the text is not
   * yet final, so it is rendered in the placeholder color to read as
   * provisional. The final update (`interim === false`) clears the decoration,
   * leaving solid text.
   *
   * Once a final update has been applied, later interim updates are ignored:
   * the transcription service can emit a trailing interim transcript as it
   * shuts down (after `stopAndTranscribe` resolves), which would otherwise
   * overwrite the final text and re-apply the interim styling.
   *
   * If the user has manually edited previously-dictated text, that text is
   * committed and this inserter no longer manages it: only the portion of the
   * cumulative transcript that follows the committed prefix is inserted, into a
   * fresh region at the caret, so dictation keeps working after an edit.
   */
  update(fullText, interim = true) {
    this._logService.trace(`${LOG_PREFIX} inserter.update interim=${interim} finalized=${this._finalized} userModified=${this._userModified} len=${fullText.length}`);
    if (this._finalized && interim) {
      this._logService.trace(`${LOG_PREFIX} inserter.update ignored (already finalized)`);
      return;
    }
    if (!interim) {
      this._finalized = true;
    }
    const model = this._editor.getModel();
    if (!model) {
      this._logService.trace(`${LOG_PREFIX} inserter.update no model`);
      return;
    }
    this._lastCumulativeText = fullText;
    let renderText = fullText;
    if (this._committedText) {
      const committedLength = this._committedText.length;
      renderText = fullText.slice(committedLength);
      renderText = renderText.replace(/^\s+/, "");
      if (renderText.length === 0) {
        this._logService.trace(`${LOG_PREFIX} inserter.update nothing new after user edit`);
        return;
      }
    }
    if (!this._anchor) {
      const selection = this._editor.getSelection() ?? model.getFullModelRange().collapseToEnd();
      const start = selection.getStartPosition();
      this._anchor = start;
      this._end = start;
      this._revertAnchor ??= start;
      this._needsLeadingSpace = start.column > 1 && !/\s$/.test(model.getValueInRange(new Range(
        start.lineNumber,
        Math.max(1, start.column - 1),
        start.lineNumber,
        start.column
      )));
    }
    const text = (this._needsLeadingSpace ? " " : "") + renderText;
    const replaceRange = Range.fromPositions(this._anchor, this._end ?? this._anchor);
    const lines = text.split("\n");
    const endLine = this._anchor.lineNumber + lines.length - 1;
    const endColumn = lines.length === 1 ? this._anchor.column + lines[0].length : lines[lines.length - 1].length + 1;
    this._end = new Position(endLine, endColumn);
    const caret = this._end;
    this._isApplyingEdit = true;
    try {
      this._editor.executeEdits(
        "chatSpeechToText",
        [{ range: replaceRange, text, forceMoveMarkers: true }],
        [Selection.fromPositions(caret)]
      );
    } finally {
      this._isApplyingEdit = false;
    }
    this._updateInterimDecorations(interim);
  }
  onDidChangeModelContent(event) {
    if (this._isApplyingEdit || !this._anchor || !this._end) {
      return;
    }
    const affectsTranscript = event.changes.some((change) => Position.isBeforeOrEqual(
      new Position(change.range.startLineNumber, change.range.startColumn),
      this._end
    ));
    if (!affectsTranscript) {
      return;
    }
    this._logService.trace(`${LOG_PREFIX} transcript invalidated by user edit`);
    this._userModified = true;
    this._committedText = this._lastCumulativeText;
    this._revertAnchor ??= this._anchor;
    this._revertEnd = this._end;
    this._anchor = void 0;
    this._end = void 0;
    this.clearInterimDecorations();
  }
  /**
   * Render the whole not-yet-final transcript in the placeholder color, so it
   * reads as provisional while the user is still speaking. The decoration is
   * cleared once the transcript is finalized, leaving solid text.
   */
  _updateInterimDecorations(interim) {
    if (!interim || !this._anchor || !this._end || Position.equals(this._anchor, this._end)) {
      this._logService.trace(`${LOG_PREFIX} interim decorations clear (interim=${interim})`);
      this._processingDecorations?.clear();
      return;
    }
    this._processingDecorations ??= this._editor.createDecorationsCollection();
    this._logService.trace(`${LOG_PREFIX} interim decorations ${this._anchor.lineNumber}:${this._anchor.column} -> ${this._end.lineNumber}:${this._end.column}`);
    this._processingDecorations.set([{
      range: Range.fromPositions(this._anchor, this._end),
      options: { description: "chatSpeechToText-interim", inlineClassName: INTERIM_PROCESSING_CLASS }
    }]);
  }
  /** Drop the interim styling, leaving whatever text is currently inserted as solid. */
  clearInterimDecorations() {
    this._logService.trace(`${LOG_PREFIX} clearInterimDecorations`);
    this._processingDecorations?.clear();
  }
  /**
   * Lock out further interim updates and drop the interim styling immediately.
   * Called when the user stops talking, before the (async) final transcription
   * resolves, so a trailing interim transcript can neither overwrite the text
   * nor re-apply the styling. The subsequent final `update(text, false)` still
   * applies because it is not an interim update.
   */
  beginFinalize() {
    this._logService.trace(`${LOG_PREFIX} beginFinalize`);
    this._finalized = true;
    this._processingDecorations?.clear();
  }
  /**
   * Range covering the finalized transcript text this inserter wrote,
   * excluding any leading space it prepended, so its content equals the
   * transcript exactly. `undefined` before anything is inserted. Used to track
   * the dictated span for accuracy telemetry after the session ends.
   */
  finalizedRange() {
    if (this._userModified || !this._anchor || !this._end) {
      return void 0;
    }
    const start = this._needsLeadingSpace ? new Position(this._anchor.lineNumber, this._anchor.column + 1) : this._anchor;
    return Range.fromPositions(start, this._end);
  }
  /**
   * Remove everything this inserter has written (including any leading space it
   * added) and restore the caret to where dictation began. Used when dictation
   * is cancelled so no dictated text is left behind.
   *
   * Falls back to `_revertAnchor`/`_revertEnd` when `_anchor`/`_end` have been
   * reset after a user edit, so cancelling dictation after a manual edit still
   * removes the originally-dictated text.
   */
  revert() {
    this._processingDecorations?.clear();
    const model = this._editor.getModel();
    const anchor = this._revertAnchor ?? this._anchor;
    const end = this._end ?? this._revertEnd;
    if (!model || !anchor || !end) {
      return;
    }
    this._editor.executeEdits("chatSpeechToText", [{
      range: Range.fromPositions(anchor, end),
      text: "",
      forceMoveMarkers: true
    }]);
    this._editor.setPosition(anchor);
    this._anchor = void 0;
    this._end = void 0;
    this._revertAnchor = void 0;
    this._revertEnd = void 0;
  }
}
let _active;
function isDictating() {
  return !!_active;
}
function activeDictationEditor() {
  return _active?.editor;
}
async function startDictation(service, editor, window, logService, surface = "chat") {
  if (_active || service.state !== ChatSpeechToTextState.Idle) {
    return;
  }
  const inserter = new LiveTranscriptInserter(editor, logService);
  const disposables = new DisposableStore();
  const HIDE_CURSOR_CLASS = "dictation-hide-cursor";
  editor.getDomNode()?.classList.add(HIDE_CURSOR_CLASS);
  disposables.add(toDisposable(() => editor.getDomNode()?.classList.remove(HIDE_CURSOR_CLASS)));
  const previousPlaceholder = editor.getOption(EditorOption.placeholder);
  const listeningPlaceholder = localize("chatStt.listening", "Listening\u2026");
  let appliedPlaceholder;
  const applyPlaceholder = () => {
    if (!editor.getModel()) {
      return;
    }
    const recording = service.state === ChatSpeechToTextState.Recording;
    const desired = recording && !service.isPreparingModel ? listeningPlaceholder : void 0;
    if (desired !== void 0) {
      if (appliedPlaceholder !== desired) {
        editor.updateOptions({ placeholder: desired });
        appliedPlaceholder = desired;
      }
    } else if (appliedPlaceholder !== void 0) {
      editor.updateOptions({ placeholder: previousPlaceholder });
      appliedPlaceholder = void 0;
    }
  };
  disposables.add(toDisposable(() => {
    inserter.clearInterimDecorations();
    if (!editor.getModel() || appliedPlaceholder === void 0) {
      return;
    }
    editor.updateOptions({ placeholder: previousPlaceholder });
    appliedPlaceholder = void 0;
  }));
  disposables.add(service.onDidUpdateTranscript((update) => {
    logService.trace(`${LOG_PREFIX} onDidUpdateTranscript len=${update.text.length} finalized=${update.finalizedText.length} state=${service.state}`);
    if (!service.showTranscriptWhileDictating) {
      inserter.clearInterimDecorations();
      return;
    }
    inserter.update(update.text);
  }));
  disposables.add(editor.onDidChangeModelContent((event) => inserter.onDidChangeModelContent(event)));
  disposables.add(service.onDidChangePreparingModel(() => applyPlaceholder()));
  disposables.add(service.onDidChangeState((state) => {
    logService.trace(`${LOG_PREFIX} onDidChangeState ${state}`);
    if (state === ChatSpeechToTextState.Idle && _active?.service === service) {
      _active = void 0;
      disposables.dispose();
      return;
    }
    applyPlaceholder();
  }));
  disposables.add(editor.onDidDispose(() => cancelDictation()));
  _active = { service, editor, inserter, disposables, logService, surface };
  try {
    await service.start(window, surface);
  } catch {
    if (_active?.service === service) {
      _active = void 0;
    }
    disposables.dispose();
  }
}
async function stopDictation() {
  const active = _active;
  if (!active) {
    return;
  }
  _active = void 0;
  active.logService.trace(`${LOG_PREFIX} stopDictation begin, state=${active.service.state}`);
  active.inserter.beginFinalize();
  try {
    const text = await active.service.stopAndTranscribe();
    active.logService.trace(`${LOG_PREFIX} stopAndTranscribe resolved text=${text === void 0 ? "undefined" : `len=${text.length}`}`);
    if (text !== void 0) {
      active.inserter.update(text, false);
      trackDictationAccuracy(active, text);
    } else {
      active.inserter.clearInterimDecorations();
    }
  } finally {
    active.logService.trace(`${LOG_PREFIX} stopDictation dispose`);
    active.disposables.dispose();
    active.editor.focus();
  }
}
function cancelDictation() {
  const active = _active;
  if (!active) {
    return;
  }
  _active = void 0;
  active.inserter.revert();
  active.disposables.dispose();
  active.service.cancel();
}
const _accuracyTrackers = /* @__PURE__ */ new Set();
function notifyDictationSubmitted(editor) {
  for (const tracker of [..._accuracyTrackers]) {
    if (tracker.editor === editor) {
      tracker.measure(true);
    }
  }
}
function trackDictationAccuracy(active, dictatedText) {
  const { editor, inserter, service, surface } = active;
  const model = editor.getModel();
  const range = inserter.finalizedRange();
  if (!model || !range || !dictatedText) {
    return;
  }
  const backend = service.currentBackend;
  const collection = editor.createDecorationsCollection([{
    range,
    options: {
      description: "chatSpeechToText-accuracy",
      stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    }
  }]);
  const store = new DisposableStore();
  let measured = false;
  const tracker = {
    editor,
    measure(submitted) {
      if (measured) {
        return;
      }
      measured = true;
      const current = collection.getRange(0);
      const submittedText = current ? model.getValueInRange(current) : "";
      service.logDictationAccuracy({ dictatedText, submittedText, backend, surface, submitted });
      collection.clear();
      store.dispose();
      _accuracyTrackers.delete(tracker);
    }
  };
  store.add(model.onDidChangeContent(() => {
    if (model.getValueLength() === 0) {
      tracker.measure(false);
    }
  }));
  store.add(model.onWillDispose(() => tracker.measure(false)));
  store.add(editor.onDidDispose(() => tracker.measure(false)));
  _accuracyTrackers.add(tracker);
}
export {
  activeDictationEditor,
  cancelDictation,
  isDictating,
  notifyDictationSubmitted,
  startDictation,
  stopDictation
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9zcGVlY2hUb1RleHQvZGljdGF0aW9uU2Vzc2lvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9kaWN0YXRpb25TZXNzaW9uLmNzcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb25maWcvZWRpdG9yT3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgVHJhY2tlZFJhbmdlU3RpY2tpbmVzcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgUG9zaXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcG9zaXRpb24uanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxDb250ZW50Q2hhbmdlZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi90ZXh0TW9kZWxFdmVudHMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBDaGF0RGljdGF0aW9uU3VyZmFjZSwgQ2hhdFNwZWVjaFRvVGV4dFN0YXRlLCBJQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UgfSBmcm9tICcuL2NoYXRTcGVlY2hUb1RleHRTZXJ2aWNlLmpzJztcblxuLyoqXG4gKiBJbmxpbmUgZGVjb3JhdGlvbiBjbGFzcyBmb3IgdGhlIG5vdC15ZXQtZmluYWwgdHJhbnNjcmlwdDogcmVuZGVyZWQgaW4gdGhlXG4gKiBwbGFjZWhvbGRlciBjb2xvciBzbyBpdCByZWFkcyBhcyBwcm92aXNpb25hbCB1bnRpbCBkaWN0YXRpb24gZW5kcy5cbiAqL1xuY29uc3QgSU5URVJJTV9QUk9DRVNTSU5HX0NMQVNTID0gJ2RpY3RhdGlvbi1pbnRlcmltLXByb2Nlc3NpbmcnO1xuXG5jb25zdCBMT0dfUFJFRklYID0gJ1tjaGF0LXN0dC1kaWN0YXRpb25dJztcblxuLyoqXG4gKiBSZW5kZXJzIHRoZSBjdW11bGF0aXZlIHRyYW5zY3JpcHQgaW50byBhIGNvZGUgZWRpdG9yLCByZXBsYWNpbmcgaXRzIG93blxuICogaW5zZXJ0ZWQgcmVnaW9uIG9uIGVhY2ggdXBkYXRlIHNvIGRpY3RhdGlvbiBhcHBlYXJzIGxpdmUgYXMgdGhlIHVzZXIgc3BlYWtzLlxuICovXG5jbGFzcyBMaXZlVHJhbnNjcmlwdEluc2VydGVyIHtcblx0cHJpdmF0ZSBfYW5jaG9yOiBQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfZW5kOiBQb3NpdGlvbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfbmVlZHNMZWFkaW5nU3BhY2UgPSBmYWxzZTtcblx0cHJpdmF0ZSBfcHJvY2Vzc2luZ0RlY29yYXRpb25zOiBJRWRpdG9yRGVjb3JhdGlvbnNDb2xsZWN0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9maW5hbGl6ZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfaXNBcHBseWluZ0VkaXQgPSBmYWxzZTtcblx0cHJpdmF0ZSBfdXNlck1vZGlmaWVkID0gZmFsc2U7XG5cdC8qKlxuXHQgKiBUaGUgbGFzdCBjdW11bGF0aXZlIHRyYW5zY3JpcHQgdGhpcyBpbnNlcnRlciByZW5kZXJlZC4gQ2FwdHVyZWQgd2hlbiB0aGVcblx0ICogdXNlciBtYW51YWxseSBlZGl0cyB0aGUgZGljdGF0ZWQgdGV4dCBzbyBldmVyeXRoaW5nIHNwb2tlbiB1cCB0byB0aGF0XG5cdCAqIHBvaW50IGNhbiBiZSB0cmVhdGVkIGFzIGNvbW1pdHRlZCBhbmQgbGVmdCB1bnRvdWNoZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9sYXN0Q3VtdWxhdGl2ZVRleHQgPSAnJztcblx0LyoqXG5cdCAqIFRoZSBsZWFkaW5nIHBvcnRpb24gb2YgdGhlIGN1bXVsYXRpdmUgdHJhbnNjcmlwdCB0aGUgdXNlciBoYXMgdGFrZW5cblx0ICogb3duZXJzaGlwIG9mIChieSBlZGl0aW5nIHRoZSBpbnNlcnRlZCB0ZXh0KS4gTGF0ZXIgdHJhbnNjcmlwdCB1cGRhdGVzIG9ubHlcblx0ICogaW5zZXJ0IHRoZSBwb3J0aW9uIG9mIHRoZSBjdW11bGF0aXZlIHRyYW5zY3JpcHQgdGhhdCBmb2xsb3dzIHRoaXMgcHJlZml4LFxuXHQgKiBzbyBkaWN0YXRpb24ga2VlcHMgd29ya2luZyBhZnRlciBhIG1hbnVhbCBlZGl0IGluc3RlYWQgb2Ygc3RvcHBpbmcuXG5cdCAqL1xuXHRwcml2YXRlIF9jb21taXR0ZWRUZXh0ID0gJyc7XG5cdC8qKlxuXHQgKiBUaGUgcG9zaXRpb24gd2hlcmUgZGljdGF0aW9uIGZpcnN0IGJlZ2FuOyBzZXQgdGhlIGZpcnN0IHRpbWUgYF9hbmNob3JgIGlzXG5cdCAqIGFzc2lnbmVkIGFuZCBwcmVzZXJ2ZWQgZXZlbiBhZnRlciB1c2VyIGVkaXRzICh1bmxpa2UgYF9hbmNob3JgLCB3aGljaCBpc1xuXHQgKiByZXNldCB0byByZS1hbmNob3Igc3Vic2VxdWVudCBzcGVlY2gpLiBVc2VkIGJ5IGByZXZlcnQoKWAgc28gY2FuY2VsbGF0aW9uXG5cdCAqIGNhbiByZW1vdmUgdGhlIGZ1bGwgZGljdGF0ZWQgcmVnaW9uIGV2ZW4gYWZ0ZXIgYSB1c2VyIGVkaXQuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXZlcnRBbmNob3I6IFBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXHQvKipcblx0ICogVGhlIGVuZCBvZiB0aGUgbGFzdCBpbnNlcnRlZCB0cmFuc2NyaXB0IHJlZ2lvbiBhdCB0aGUgdGltZSB0aGUgdXNlciBtYWRlXG5cdCAqIGEgbWFudWFsIGVkaXQuIFByZXNlcnZlZCBzbyBgcmV2ZXJ0KClgIGNhbiByZW1vdmUgdGhlIG9yaWdpbmFsIGRpY3RhdGVkXG5cdCAqIHRleHQgaWYgdGhlIHVzZXIgY2FuY2VscyBiZWZvcmUgYW55IGZ1cnRoZXIgc3BlZWNoIGFycml2ZXMuXG5cdCAqL1xuXHRwcml2YXRlIF9yZXZlcnRFbmQ6IFBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSUNvZGVFZGl0b3IsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0LyoqXG5cdCAqIFJlbmRlciB0aGUgY3VtdWxhdGl2ZSB0cmFuc2NyaXB0LiBXaGlsZSBgaW50ZXJpbWAgaXMgdHJ1ZSB0aGUgdGV4dCBpcyBub3Rcblx0ICogeWV0IGZpbmFsLCBzbyBpdCBpcyByZW5kZXJlZCBpbiB0aGUgcGxhY2Vob2xkZXIgY29sb3IgdG8gcmVhZCBhc1xuXHQgKiBwcm92aXNpb25hbC4gVGhlIGZpbmFsIHVwZGF0ZSAoYGludGVyaW0gPT09IGZhbHNlYCkgY2xlYXJzIHRoZSBkZWNvcmF0aW9uLFxuXHQgKiBsZWF2aW5nIHNvbGlkIHRleHQuXG5cdCAqXG5cdCAqIE9uY2UgYSBmaW5hbCB1cGRhdGUgaGFzIGJlZW4gYXBwbGllZCwgbGF0ZXIgaW50ZXJpbSB1cGRhdGVzIGFyZSBpZ25vcmVkOlxuXHQgKiB0aGUgdHJhbnNjcmlwdGlvbiBzZXJ2aWNlIGNhbiBlbWl0IGEgdHJhaWxpbmcgaW50ZXJpbSB0cmFuc2NyaXB0IGFzIGl0XG5cdCAqIHNodXRzIGRvd24gKGFmdGVyIGBzdG9wQW5kVHJhbnNjcmliZWAgcmVzb2x2ZXMpLCB3aGljaCB3b3VsZCBvdGhlcndpc2Vcblx0ICogb3ZlcndyaXRlIHRoZSBmaW5hbCB0ZXh0IGFuZCByZS1hcHBseSB0aGUgaW50ZXJpbSBzdHlsaW5nLlxuXHQgKlxuXHQgKiBJZiB0aGUgdXNlciBoYXMgbWFudWFsbHkgZWRpdGVkIHByZXZpb3VzbHktZGljdGF0ZWQgdGV4dCwgdGhhdCB0ZXh0IGlzXG5cdCAqIGNvbW1pdHRlZCBhbmQgdGhpcyBpbnNlcnRlciBubyBsb25nZXIgbWFuYWdlcyBpdDogb25seSB0aGUgcG9ydGlvbiBvZiB0aGVcblx0ICogY3VtdWxhdGl2ZSB0cmFuc2NyaXB0IHRoYXQgZm9sbG93cyB0aGUgY29tbWl0dGVkIHByZWZpeCBpcyBpbnNlcnRlZCwgaW50byBhXG5cdCAqIGZyZXNoIHJlZ2lvbiBhdCB0aGUgY2FyZXQsIHNvIGRpY3RhdGlvbiBrZWVwcyB3b3JraW5nIGFmdGVyIGFuIGVkaXQuXG5cdCAqL1xuXHR1cGRhdGUoZnVsbFRleHQ6IHN0cmluZywgaW50ZXJpbTogYm9vbGVhbiA9IHRydWUpOiB2b2lkIHtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGAke0xPR19QUkVGSVh9IGluc2VydGVyLnVwZGF0ZSBpbnRlcmltPSR7aW50ZXJpbX0gZmluYWxpemVkPSR7dGhpcy5fZmluYWxpemVkfSB1c2VyTW9kaWZpZWQ9JHt0aGlzLl91c2VyTW9kaWZpZWR9IGxlbj0ke2Z1bGxUZXh0Lmxlbmd0aH1gKTtcblx0XHRpZiAodGhpcy5fZmluYWxpemVkICYmIGludGVyaW0pIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gaW5zZXJ0ZXIudXBkYXRlIGlnbm9yZWQgKGFscmVhZHkgZmluYWxpemVkKWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoIWludGVyaW0pIHtcblx0XHRcdHRoaXMuX2ZpbmFsaXplZCA9IHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5fZWRpdG9yLmdldE1vZGVsKCk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgJHtMT0dfUFJFRklYfSBpbnNlcnRlci51cGRhdGUgbm8gbW9kZWxgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9sYXN0Q3VtdWxhdGl2ZVRleHQgPSBmdWxsVGV4dDtcblx0XHQvLyBBZnRlciBhIG1hbnVhbCBlZGl0LCBldmVyeXRoaW5nIHNwb2tlbiB1cCB0byB0aGF0IHBvaW50IGlzIGNvbW1pdHRlZCBhbmRcblx0XHQvLyBsZWZ0IGFzIHRoZSB1c2VyIGNoYW5nZWQgaXQ7IG9ubHkgcmVuZGVyIHRoZSByZW1haW5pbmcgKG5ldykgdGFpbCBvZiB0aGVcblx0XHQvLyBjdW11bGF0aXZlIHRyYW5zY3JpcHQsIHN0YXJ0aW5nIGEgZnJlc2ggcmVnaW9uIGF0IHRoZSBjYXJldC5cblx0XHRsZXQgcmVuZGVyVGV4dCA9IGZ1bGxUZXh0O1xuXHRcdGlmICh0aGlzLl9jb21taXR0ZWRUZXh0KSB7XG5cdFx0XHQvLyBVc2UgdGhlIGNvbW1pdHRlZCB0ZXh0J3MgbGVuZ3RoIGFzIGEgc3RhYmxlIGJvdW5kYXJ5IHNvIHRoYXRcblx0XHRcdC8vIGJhY2tlbmQtb25seSBjb3JyZWN0aW9ucyB0byBhbHJlYWR5LWNvbW1pdHRlZCB3b3JkcyAoZS5nLiBcIm9uZVxuXHRcdFx0Ly8gdHdvXCIgXHUyMTkyIFwib25lIHRvb1wiKSBkbyBub3QgcHJvZHVjZSBzcHVyaW91cyByZW5kZXJUZXh0IGFuZCBnZXRcblx0XHRcdC8vIGluc2VydGVkIGF0IHRoZSBjYXJldCBhcyBpZiB0aGUgdXNlciBoYWQgc3Bva2VuIHNvbWV0aGluZyBuZXcuXG5cdFx0XHRjb25zdCBjb21taXR0ZWRMZW5ndGggPSB0aGlzLl9jb21taXR0ZWRUZXh0Lmxlbmd0aDtcblx0XHRcdHJlbmRlclRleHQgPSBmdWxsVGV4dC5zbGljZShjb21taXR0ZWRMZW5ndGgpO1xuXHRcdFx0Ly8gRHJvcCB0aGUgd2hpdGVzcGFjZSB0aGF0IGpvaW5lZCB0aGUgY29tbWl0dGVkIGFuZCBuZXcgcG9ydGlvbnM7IHRoZVxuXHRcdFx0Ly8gbGVhZGluZyBzcGFjZSBpcyByZS1hZGRlZCBiZWxvdyBiYXNlZCBvbiB0aGUgY2hhcmFjdGVyIGF0IHRoZSBjYXJldC5cblx0XHRcdHJlbmRlclRleHQgPSByZW5kZXJUZXh0LnJlcGxhY2UoL15cXHMrLywgJycpO1xuXHRcdFx0aWYgKHJlbmRlclRleHQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdC8vIE5vdGhpbmcgbmV3IGhhcyBiZWVuIGRpY3RhdGVkIHNpbmNlIHRoZSB1c2VyJ3MgZWRpdDsgbGVhdmUgdGhlXG5cdFx0XHRcdC8vIGNvbW1pdHRlZCB0ZXh0IGV4YWN0bHkgYXMgdGhlIHVzZXIgbGVmdCBpdC5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgJHtMT0dfUFJFRklYfSBpbnNlcnRlci51cGRhdGUgbm90aGluZyBuZXcgYWZ0ZXIgdXNlciBlZGl0YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuX2FuY2hvcikge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5fZWRpdG9yLmdldFNlbGVjdGlvbigpID8/IG1vZGVsLmdldEZ1bGxNb2RlbFJhbmdlKCkuY29sbGFwc2VUb0VuZCgpO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBzZWxlY3Rpb24uZ2V0U3RhcnRQb3NpdGlvbigpO1xuXHRcdFx0dGhpcy5fYW5jaG9yID0gc3RhcnQ7XG5cdFx0XHR0aGlzLl9lbmQgPSBzdGFydDtcblx0XHRcdHRoaXMuX3JldmVydEFuY2hvciA/Pz0gc3RhcnQ7XG5cdFx0XHR0aGlzLl9uZWVkc0xlYWRpbmdTcGFjZSA9IHN0YXJ0LmNvbHVtbiA+IDEgJiYgIS9cXHMkLy50ZXN0KG1vZGVsLmdldFZhbHVlSW5SYW5nZShuZXcgUmFuZ2UoXG5cdFx0XHRcdHN0YXJ0LmxpbmVOdW1iZXIsIE1hdGgubWF4KDEsIHN0YXJ0LmNvbHVtbiAtIDEpLCBzdGFydC5saW5lTnVtYmVyLCBzdGFydC5jb2x1bW4sXG5cdFx0XHQpKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGV4dCA9ICh0aGlzLl9uZWVkc0xlYWRpbmdTcGFjZSA/ICcgJyA6ICcnKSArIHJlbmRlclRleHQ7XG5cblx0XHQvLyBUaGUgZWRpdCByZXBsYWNlcyB0aGUgcmVnaW9uIHRoaXMgaW5zZXJ0ZXIgd3JvdGUgbGFzdCB0aW1lIChhbmNob3IgLi5cblx0XHQvLyBwcmV2aW91cyBlbmQpIHdpdGggdGhlIG5ldyBjdW11bGF0aXZlIHRyYW5zY3JpcHQuXG5cdFx0Y29uc3QgcmVwbGFjZVJhbmdlID0gUmFuZ2UuZnJvbVBvc2l0aW9ucyh0aGlzLl9hbmNob3IsIHRoaXMuX2VuZCA/PyB0aGlzLl9hbmNob3IpO1xuXG5cdFx0Y29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKTtcblx0XHRjb25zdCBlbmRMaW5lID0gdGhpcy5fYW5jaG9yLmxpbmVOdW1iZXIgKyBsaW5lcy5sZW5ndGggLSAxO1xuXHRcdGNvbnN0IGVuZENvbHVtbiA9IGxpbmVzLmxlbmd0aCA9PT0gMSA/IHRoaXMuX2FuY2hvci5jb2x1bW4gKyBsaW5lc1swXS5sZW5ndGggOiBsaW5lc1tsaW5lcy5sZW5ndGggLSAxXS5sZW5ndGggKyAxO1xuXHRcdHRoaXMuX2VuZCA9IG5ldyBQb3NpdGlvbihlbmRMaW5lLCBlbmRDb2x1bW4pO1xuXG5cdFx0Ly8gS2VlcCB0aGUgaGlkZGVuIGNhcmV0IGF0IHRoZSBlbmQgc28gYWNjaWRlbnRhbCB0eXBpbmcgYXBwZW5kcyBhZnRlciBkaWN0YXRlZCB0ZXh0LlxuXHRcdGNvbnN0IGNhcmV0ID0gdGhpcy5fZW5kO1xuXHRcdHRoaXMuX2lzQXBwbHlpbmdFZGl0ID0gdHJ1ZTtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fZWRpdG9yLmV4ZWN1dGVFZGl0cyhcblx0XHRcdFx0J2NoYXRTcGVlY2hUb1RleHQnLFxuXHRcdFx0XHRbeyByYW5nZTogcmVwbGFjZVJhbmdlLCB0ZXh0LCBmb3JjZU1vdmVNYXJrZXJzOiB0cnVlIH1dLFxuXHRcdFx0XHRbU2VsZWN0aW9uLmZyb21Qb3NpdGlvbnMoY2FyZXQpXSxcblx0XHRcdCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX2lzQXBwbHlpbmdFZGl0ID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0dGhpcy5fdXBkYXRlSW50ZXJpbURlY29yYXRpb25zKGludGVyaW0pO1xuXHR9XG5cblx0b25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoZXZlbnQ6IElNb2RlbENvbnRlbnRDaGFuZ2VkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5faXNBcHBseWluZ0VkaXQgfHwgIXRoaXMuX2FuY2hvciB8fCAhdGhpcy5fZW5kKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGFmZmVjdHNUcmFuc2NyaXB0ID0gZXZlbnQuY2hhbmdlcy5zb21lKGNoYW5nZSA9PiBQb3NpdGlvbi5pc0JlZm9yZU9yRXF1YWwoXG5cdFx0XHRuZXcgUG9zaXRpb24oY2hhbmdlLnJhbmdlLnN0YXJ0TGluZU51bWJlciwgY2hhbmdlLnJhbmdlLnN0YXJ0Q29sdW1uKSxcblx0XHRcdHRoaXMuX2VuZCEsXG5cdFx0KSk7XG5cdFx0aWYgKCFhZmZlY3RzVHJhbnNjcmlwdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGAke0xPR19QUkVGSVh9IHRyYW5zY3JpcHQgaW52YWxpZGF0ZWQgYnkgdXNlciBlZGl0YCk7XG5cdFx0dGhpcy5fdXNlck1vZGlmaWVkID0gdHJ1ZTtcblx0XHQvLyBDb21taXQgZXZlcnl0aGluZyBkaWN0YXRlZCBzbyBmYXIgYW5kIHJlLWFuY2hvciwgc28gc3Vic2VxdWVudCBzcGVlY2ggaXNcblx0XHQvLyBpbnNlcnRlZCBpbnRvIGEgZnJlc2ggcmVnaW9uIGF0IHRoZSBjYXJldCBpbnN0ZWFkIG9mIG92ZXJ3cml0aW5nIHRoZVxuXHRcdC8vIHVzZXIncyBlZGl0cy4gVGhpcyBrZWVwcyBkaWN0YXRpb24gd29ya2luZyBhZnRlciBhIG1hbnVhbCBlZGl0LlxuXHRcdHRoaXMuX2NvbW1pdHRlZFRleHQgPSB0aGlzLl9sYXN0Q3VtdWxhdGl2ZVRleHQ7XG5cdFx0Ly8gUHJlc2VydmUgdGhlIGN1cnJlbnQgZGljdGF0ZWQgcmFuZ2Ugc28gcmV2ZXJ0KCkgY2FuIHN0aWxsIHJlc3RvcmUgdGhlXG5cdFx0Ly8gcHJlLWRpY3RhdGlvbiBzdGF0ZSBpZiB0aGUgdXNlciBjYW5jZWxzIGJlZm9yZSBhbnkgZnVydGhlciBzcGVlY2guXG5cdFx0dGhpcy5fcmV2ZXJ0QW5jaG9yID8/PSB0aGlzLl9hbmNob3I7XG5cdFx0dGhpcy5fcmV2ZXJ0RW5kID0gdGhpcy5fZW5kO1xuXHRcdHRoaXMuX2FuY2hvciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9lbmQgPSB1bmRlZmluZWQ7XG5cdFx0Ly8gRG8gTk9UIHJlc2V0IF9maW5hbGl6ZWQ6IGlmIHN0b3BBbmRUcmFuc2NyaWJlKCkgaXMgYWxyZWFkeSBpbiBwcm9ncmVzc1xuXHRcdC8vIChzdGF0ZSBpcyBUcmFuc2NyaWJpbmcpLCBjbGVhcmluZyB0aGUgZmxhZyB3b3VsZCBsZXQgYSB0cmFpbGluZyBpbnRlcmltXG5cdFx0Ly8gdHJhbnNjcmlwdCBvdmVyd3JpdGUgdGV4dCBkZXNwaXRlIHRoZSBsb2NrIHNldCBieSBiZWdpbkZpbmFsaXplKCkuXG5cdFx0dGhpcy5jbGVhckludGVyaW1EZWNvcmF0aW9ucygpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbmRlciB0aGUgd2hvbGUgbm90LXlldC1maW5hbCB0cmFuc2NyaXB0IGluIHRoZSBwbGFjZWhvbGRlciBjb2xvciwgc28gaXRcblx0ICogcmVhZHMgYXMgcHJvdmlzaW9uYWwgd2hpbGUgdGhlIHVzZXIgaXMgc3RpbGwgc3BlYWtpbmcuIFRoZSBkZWNvcmF0aW9uIGlzXG5cdCAqIGNsZWFyZWQgb25jZSB0aGUgdHJhbnNjcmlwdCBpcyBmaW5hbGl6ZWQsIGxlYXZpbmcgc29saWQgdGV4dC5cblx0ICovXG5cdHByaXZhdGUgX3VwZGF0ZUludGVyaW1EZWNvcmF0aW9ucyhpbnRlcmltOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKCFpbnRlcmltIHx8ICF0aGlzLl9hbmNob3IgfHwgIXRoaXMuX2VuZCB8fCBQb3NpdGlvbi5lcXVhbHModGhpcy5fYW5jaG9yLCB0aGlzLl9lbmQpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGAke0xPR19QUkVGSVh9IGludGVyaW0gZGVjb3JhdGlvbnMgY2xlYXIgKGludGVyaW09JHtpbnRlcmltfSlgKTtcblx0XHRcdHRoaXMuX3Byb2Nlc3NpbmdEZWNvcmF0aW9ucz8uY2xlYXIoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9wcm9jZXNzaW5nRGVjb3JhdGlvbnMgPz89IHRoaXMuX2VkaXRvci5jcmVhdGVEZWNvcmF0aW9uc0NvbGxlY3Rpb24oKTtcblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGAke0xPR19QUkVGSVh9IGludGVyaW0gZGVjb3JhdGlvbnMgJHt0aGlzLl9hbmNob3IubGluZU51bWJlcn06JHt0aGlzLl9hbmNob3IuY29sdW1ufSAtPiAke3RoaXMuX2VuZC5saW5lTnVtYmVyfToke3RoaXMuX2VuZC5jb2x1bW59YCk7XG5cdFx0dGhpcy5fcHJvY2Vzc2luZ0RlY29yYXRpb25zLnNldChbe1xuXHRcdFx0cmFuZ2U6IFJhbmdlLmZyb21Qb3NpdGlvbnModGhpcy5fYW5jaG9yLCB0aGlzLl9lbmQpLFxuXHRcdFx0b3B0aW9uczogeyBkZXNjcmlwdGlvbjogJ2NoYXRTcGVlY2hUb1RleHQtaW50ZXJpbScsIGlubGluZUNsYXNzTmFtZTogSU5URVJJTV9QUk9DRVNTSU5HX0NMQVNTIH0sXG5cdFx0fV0pO1xuXHR9XG5cblx0LyoqIERyb3AgdGhlIGludGVyaW0gc3R5bGluZywgbGVhdmluZyB3aGF0ZXZlciB0ZXh0IGlzIGN1cnJlbnRseSBpbnNlcnRlZCBhcyBzb2xpZC4gKi9cblx0Y2xlYXJJbnRlcmltRGVjb3JhdGlvbnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgJHtMT0dfUFJFRklYfSBjbGVhckludGVyaW1EZWNvcmF0aW9uc2ApO1xuXHRcdHRoaXMuX3Byb2Nlc3NpbmdEZWNvcmF0aW9ucz8uY2xlYXIoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBMb2NrIG91dCBmdXJ0aGVyIGludGVyaW0gdXBkYXRlcyBhbmQgZHJvcCB0aGUgaW50ZXJpbSBzdHlsaW5nIGltbWVkaWF0ZWx5LlxuXHQgKiBDYWxsZWQgd2hlbiB0aGUgdXNlciBzdG9wcyB0YWxraW5nLCBiZWZvcmUgdGhlIChhc3luYykgZmluYWwgdHJhbnNjcmlwdGlvblxuXHQgKiByZXNvbHZlcywgc28gYSB0cmFpbGluZyBpbnRlcmltIHRyYW5zY3JpcHQgY2FuIG5laXRoZXIgb3ZlcndyaXRlIHRoZSB0ZXh0XG5cdCAqIG5vciByZS1hcHBseSB0aGUgc3R5bGluZy4gVGhlIHN1YnNlcXVlbnQgZmluYWwgYHVwZGF0ZSh0ZXh0LCBmYWxzZSlgIHN0aWxsXG5cdCAqIGFwcGxpZXMgYmVjYXVzZSBpdCBpcyBub3QgYW4gaW50ZXJpbSB1cGRhdGUuXG5cdCAqL1xuXHRiZWdpbkZpbmFsaXplKCk6IHZvaWQge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gYmVnaW5GaW5hbGl6ZWApO1xuXHRcdHRoaXMuX2ZpbmFsaXplZCA9IHRydWU7XG5cdFx0dGhpcy5fcHJvY2Vzc2luZ0RlY29yYXRpb25zPy5jbGVhcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJhbmdlIGNvdmVyaW5nIHRoZSBmaW5hbGl6ZWQgdHJhbnNjcmlwdCB0ZXh0IHRoaXMgaW5zZXJ0ZXIgd3JvdGUsXG5cdCAqIGV4Y2x1ZGluZyBhbnkgbGVhZGluZyBzcGFjZSBpdCBwcmVwZW5kZWQsIHNvIGl0cyBjb250ZW50IGVxdWFscyB0aGVcblx0ICogdHJhbnNjcmlwdCBleGFjdGx5LiBgdW5kZWZpbmVkYCBiZWZvcmUgYW55dGhpbmcgaXMgaW5zZXJ0ZWQuIFVzZWQgdG8gdHJhY2tcblx0ICogdGhlIGRpY3RhdGVkIHNwYW4gZm9yIGFjY3VyYWN5IHRlbGVtZXRyeSBhZnRlciB0aGUgc2Vzc2lvbiBlbmRzLlxuXHQgKi9cblx0ZmluYWxpemVkUmFuZ2UoKTogUmFuZ2UgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl91c2VyTW9kaWZpZWQgfHwgIXRoaXMuX2FuY2hvciB8fCAhdGhpcy5fZW5kKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzdGFydCA9IHRoaXMuX25lZWRzTGVhZGluZ1NwYWNlXG5cdFx0XHQ/IG5ldyBQb3NpdGlvbih0aGlzLl9hbmNob3IubGluZU51bWJlciwgdGhpcy5fYW5jaG9yLmNvbHVtbiArIDEpXG5cdFx0XHQ6IHRoaXMuX2FuY2hvcjtcblx0XHRyZXR1cm4gUmFuZ2UuZnJvbVBvc2l0aW9ucyhzdGFydCwgdGhpcy5fZW5kKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZW1vdmUgZXZlcnl0aGluZyB0aGlzIGluc2VydGVyIGhhcyB3cml0dGVuIChpbmNsdWRpbmcgYW55IGxlYWRpbmcgc3BhY2UgaXRcblx0ICogYWRkZWQpIGFuZCByZXN0b3JlIHRoZSBjYXJldCB0byB3aGVyZSBkaWN0YXRpb24gYmVnYW4uIFVzZWQgd2hlbiBkaWN0YXRpb25cblx0ICogaXMgY2FuY2VsbGVkIHNvIG5vIGRpY3RhdGVkIHRleHQgaXMgbGVmdCBiZWhpbmQuXG5cdCAqXG5cdCAqIEZhbGxzIGJhY2sgdG8gYF9yZXZlcnRBbmNob3JgL2BfcmV2ZXJ0RW5kYCB3aGVuIGBfYW5jaG9yYC9gX2VuZGAgaGF2ZSBiZWVuXG5cdCAqIHJlc2V0IGFmdGVyIGEgdXNlciBlZGl0LCBzbyBjYW5jZWxsaW5nIGRpY3RhdGlvbiBhZnRlciBhIG1hbnVhbCBlZGl0IHN0aWxsXG5cdCAqIHJlbW92ZXMgdGhlIG9yaWdpbmFsbHktZGljdGF0ZWQgdGV4dC5cblx0ICovXG5cdHJldmVydCgpOiB2b2lkIHtcblx0XHR0aGlzLl9wcm9jZXNzaW5nRGVjb3JhdGlvbnM/LmNsZWFyKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHQvLyBVc2UgdGhlIG9yaWdpbmFsIGRpY3RhdGlvbiBzdGFydCBpZiBhdmFpbGFibGU7IGZhbGwgYmFjayB0byB0aGUgY3VycmVudFxuXHRcdC8vIGFuY2hvciBmb3IgdGhlIGNhc2Ugd2hlcmUgdGhlIHVzZXIgbmV2ZXIgZWRpdGVkLlxuXHRcdGNvbnN0IGFuY2hvciA9IHRoaXMuX3JldmVydEFuY2hvciA/PyB0aGlzLl9hbmNob3I7XG5cdFx0Ly8gVXNlIHRoZSBjdXJyZW50IGVuZCAoY292ZXJzIG5ldyBzcGVlY2ggYWZ0ZXIgYSB1c2VyIGVkaXQpIHdoZW4gcHJlc2VudDtcblx0XHQvLyBvdGhlcndpc2UgZmFsbCBiYWNrIHRvIHRoZSBwcmVzZXJ2ZWQgZW5kIGZyb20gdGhlIGxhc3QgdXNlciBlZGl0LlxuXHRcdGNvbnN0IGVuZCA9IHRoaXMuX2VuZCA/PyB0aGlzLl9yZXZlcnRFbmQ7XG5cdFx0aWYgKCFtb2RlbCB8fCAhYW5jaG9yIHx8ICFlbmQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fZWRpdG9yLmV4ZWN1dGVFZGl0cygnY2hhdFNwZWVjaFRvVGV4dCcsIFt7XG5cdFx0XHRyYW5nZTogUmFuZ2UuZnJvbVBvc2l0aW9ucyhhbmNob3IsIGVuZCksXG5cdFx0XHR0ZXh0OiAnJyxcblx0XHRcdGZvcmNlTW92ZU1hcmtlcnM6IHRydWUsXG5cdFx0fV0pO1xuXHRcdHRoaXMuX2VkaXRvci5zZXRQb3NpdGlvbihhbmNob3IpO1xuXHRcdHRoaXMuX2FuY2hvciA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9lbmQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fcmV2ZXJ0QW5jaG9yID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3JldmVydEVuZCA9IHVuZGVmaW5lZDtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUFjdGl2ZURpY3RhdGlvbiB7XG5cdHJlYWRvbmx5IHNlcnZpY2U6IElDaGF0U3BlZWNoVG9UZXh0U2VydmljZTtcblx0cmVhZG9ubHkgZWRpdG9yOiBJQ29kZUVkaXRvcjtcblx0cmVhZG9ubHkgaW5zZXJ0ZXI6IExpdmVUcmFuc2NyaXB0SW5zZXJ0ZXI7XG5cdHJlYWRvbmx5IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlO1xuXHRyZWFkb25seSBzdXJmYWNlOiBDaGF0RGljdGF0aW9uU3VyZmFjZTtcbn1cblxuLyoqXG4gKiBPbmx5IG9uZSBkaWN0YXRpb24gY2FuIHJ1biBhdCBhIHRpbWUgKHRoZSBzZXJ2aWNlIGlzIGEgc2luZ2xldG9uKSwgc28gdGhlXG4gKiBhY3RpdmUgc2Vzc2lvbiBpcyB0cmFja2VkIGF0IG1vZHVsZSBzY29wZSBhbmQgc2hhcmVkIGJ5IGV2ZXJ5IGVudHJ5IHBvaW50XG4gKiAodG9nZ2xlIGFjdGlvbiwgaG9sZC10by10YWxrLCBhbmQgdGhlIHNlc3Npb25zIGNvbXBvc2VyIGJ1dHRvbikuXG4gKi9cbmxldCBfYWN0aXZlOiBJQWN0aXZlRGljdGF0aW9uIHwgdW5kZWZpbmVkO1xuXG4vKiogVHJ1ZSB3aGlsZSBhIGRpY3RhdGlvbiBpcyBpbiBwcm9ncmVzcy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0RpY3RhdGluZygpOiBib29sZWFuIHtcblx0cmV0dXJuICEhX2FjdGl2ZTtcbn1cblxuLyoqIFRoZSBlZGl0b3IgY3VycmVudGx5IGJlaW5nIGRpY3RhdGVkIGludG8sIGlmIGFueSAodXNlZCB0byBzY29wZSB0aGUgZ2xvdykuICovXG5leHBvcnQgZnVuY3Rpb24gYWN0aXZlRGljdGF0aW9uRWRpdG9yKCk6IElDb2RlRWRpdG9yIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIF9hY3RpdmU/LmVkaXRvcjtcbn1cblxuLyoqIFN0YXJ0IGRpY3RhdGluZyBpbnRvIGBlZGl0b3JgLCByZW5kZXJpbmcgdGhlIHRyYW5zY3JpcHQgbGl2ZS4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBzdGFydERpY3RhdGlvbihzZXJ2aWNlOiBJQ2hhdFNwZWVjaFRvVGV4dFNlcnZpY2UsIGVkaXRvcjogSUNvZGVFZGl0b3IsIHdpbmRvdzogV2luZG93ICYgdHlwZW9mIGdsb2JhbFRoaXMsIGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLCBzdXJmYWNlOiBDaGF0RGljdGF0aW9uU3VyZmFjZSA9ICdjaGF0Jyk6IFByb21pc2U8dm9pZD4ge1xuXHRpZiAoX2FjdGl2ZSB8fCBzZXJ2aWNlLnN0YXRlICE9PSBDaGF0U3BlZWNoVG9UZXh0U3RhdGUuSWRsZSkge1xuXHRcdHJldHVybjtcblx0fVxuXHRjb25zdCBpbnNlcnRlciA9IG5ldyBMaXZlVHJhbnNjcmlwdEluc2VydGVyKGVkaXRvciwgbG9nU2VydmljZSk7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHQvLyBIaWRlIHRoZSBlZGl0b3IncyBibGlua2luZyBjYXJldCBmb3IgdGhlIGR1cmF0aW9uIG9mIHRoZSBkaWN0YXRpb25cblx0Ly8gc2Vzc2lvbi4gRHVyaW5nIGRpY3RhdGlvbiB0aGUgY2FyZXQgaXMgcGFya2VkIGF0IHRoZSBlbmQgb2YgdGhlIGRpY3RhdGVkXG5cdC8vIHJlZ2lvbiAoc2VlIExpdmVUcmFuc2NyaXB0SW5zZXJ0ZXIudXBkYXRlKSwgc28gYSBibGlua2luZyBjdXJzb3IgdGhlcmUgaXNcblx0Ly8gZGlzdHJhY3RpbmcgYXMgdHJhbnNjcmlwdCB0ZXh0IHN0cmVhbXMgaW4uXG5cdGNvbnN0IEhJREVfQ1VSU09SX0NMQVNTID0gJ2RpY3RhdGlvbi1oaWRlLWN1cnNvcic7XG5cdGVkaXRvci5nZXREb21Ob2RlKCk/LmNsYXNzTGlzdC5hZGQoSElERV9DVVJTT1JfQ0xBU1MpO1xuXHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGVkaXRvci5nZXREb21Ob2RlKCk/LmNsYXNzTGlzdC5yZW1vdmUoSElERV9DVVJTT1JfQ0xBU1MpKSk7XG5cdC8vIFNob3cgYSBcIkxpc3RlbmluZ1x1MjAyNlwiIHBsYWNlaG9sZGVyIG9uY2UgdGhlIHNlc3Npb24gaXMgYWN0dWFsbHkgY29ubmVjdGVkLFxuXHQvLyByZWNvcmRpbmcsIGFuZCB0aGUgb24tZGV2aWNlIG1vZGVsIGhhcyBmaW5pc2hlZCBwcmVwYXJpbmcuIFdoaWxlIHRoZSBtb2RlbFxuXHQvLyBpcyBzdGlsbCBiZWluZyBwcmVwYXJlZCBvbiBmaXJzdCB1c2UgKGRvd25sb2FkaW5nL2xvYWRpbmcsIHdoaWNoIGNhbiB0YWtlIGFcblx0Ly8gd2hpbGUpLCB0aGUgdG9vbGJhciBtaWMgc2hvd3MgYSBkZXRlcm1pbmF0ZSBkb3dubG9hZCBzcGlubmVyXG5cdC8vIChEaWN0YXRpb25Eb3dubG9hZFJpbmcpLCBzbyB0aGUgcGxhY2Vob2xkZXIgc3RheXMgb24gaXRzIHByZXZpb3VzIHZhbHVlXG5cdC8vIGluc3RlYWQgb2YgY2h1cm5pbmcgdGhyb3VnaCBcIkRvd25sb2FkaW5nXHUyMDI2IFglXCIgdGV4dC4gVGhlIHBsYWNlaG9sZGVyIG11c3Rcblx0Ly8gbm90IGFwcGVhciBkdXJpbmcgbWljcm9waG9uZSBhY3F1aXNpdGlvbi4gSXQgcmVtYWlucyB2aXNpYmxlIHVudGlsXG5cdC8vIHRyYW5zY3JpcHQgdGV4dCBpcyBpbnNlcnRlZCwgYW5kIGlzIHJlc3RvcmVkIHRvIGl0cyBwcmV2aW91cyB2YWx1ZSB3aGVuIHRoZVxuXHQvLyBzZXNzaW9uIGVuZHMuXG5cdGNvbnN0IHByZXZpb3VzUGxhY2Vob2xkZXIgPSBlZGl0b3IuZ2V0T3B0aW9uKEVkaXRvck9wdGlvbi5wbGFjZWhvbGRlcik7XG5cdGNvbnN0IGxpc3RlbmluZ1BsYWNlaG9sZGVyID0gbG9jYWxpemUoJ2NoYXRTdHQubGlzdGVuaW5nJywgXCJMaXN0ZW5pbmdcdTIwMjZcIik7XG5cdC8vIFRoZSBwbGFjZWhvbGRlciB3ZSBsYXN0IGFwcGxpZWQsIHNvIHdlIG9ubHkgZXZlciByZXN0b3JlIHRoZSBwcmV2aW91c1xuXHQvLyBwbGFjZWhvbGRlciB3aGVuIGl0IHdhcyBvdXJzIHRvIHJlc3RvcmUuXG5cdGxldCBhcHBsaWVkUGxhY2Vob2xkZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Y29uc3QgYXBwbHlQbGFjZWhvbGRlciA9ICgpID0+IHtcblx0XHRpZiAoIWVkaXRvci5nZXRNb2RlbCgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJlY29yZGluZyA9IHNlcnZpY2Uuc3RhdGUgPT09IENoYXRTcGVlY2hUb1RleHRTdGF0ZS5SZWNvcmRpbmc7XG5cdFx0Ly8gT25seSBzdXJmYWNlIFwiTGlzdGVuaW5nXHUyMDI2XCIgb25jZSB0aGUgbW9kZWwgaXMgcmVhZHk7IHdoaWxlIGl0IHByZXBhcmVzIHRoZVxuXHRcdC8vIG1pYyBpY29uIHNwaW5uZXIgY29udmV5cyBkb3dubG9hZC9sb2FkIHByb2dyZXNzLlxuXHRcdGNvbnN0IGRlc2lyZWQgPSByZWNvcmRpbmcgJiYgIXNlcnZpY2UuaXNQcmVwYXJpbmdNb2RlbFxuXHRcdFx0PyBsaXN0ZW5pbmdQbGFjZWhvbGRlclxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aWYgKGRlc2lyZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKGFwcGxpZWRQbGFjZWhvbGRlciAhPT0gZGVzaXJlZCkge1xuXHRcdFx0XHRlZGl0b3IudXBkYXRlT3B0aW9ucyh7IHBsYWNlaG9sZGVyOiBkZXNpcmVkIH0pO1xuXHRcdFx0XHRhcHBsaWVkUGxhY2Vob2xkZXIgPSBkZXNpcmVkO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoYXBwbGllZFBsYWNlaG9sZGVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGVkaXRvci51cGRhdGVPcHRpb25zKHsgcGxhY2Vob2xkZXI6IHByZXZpb3VzUGxhY2Vob2xkZXIgfSk7XG5cdFx0XHRhcHBsaWVkUGxhY2Vob2xkZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9O1xuXHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHQvLyBFbnN1cmUgdGhlIGludGVyaW0gc3R5bGluZyBuZXZlciBsaW5nZXJzLCByZWdhcmRsZXNzIG9mIGhvdyB0aGUgc2Vzc2lvblxuXHRcdC8vIGVuZHMgKGZpbmFsIHRyYW5zY3JpcHQsIGNhbmNlbCwgZWRpdG9yIGRpc3Bvc2FsLCBvciBhIHNlcnZpY2Utc2lkZSBlcnJvcikuXG5cdFx0aW5zZXJ0ZXIuY2xlYXJJbnRlcmltRGVjb3JhdGlvbnMoKTtcblx0XHRpZiAoIWVkaXRvci5nZXRNb2RlbCgpIHx8IGFwcGxpZWRQbGFjZWhvbGRlciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGVkaXRvci51cGRhdGVPcHRpb25zKHsgcGxhY2Vob2xkZXI6IHByZXZpb3VzUGxhY2Vob2xkZXIgfSk7XG5cdFx0YXBwbGllZFBsYWNlaG9sZGVyID0gdW5kZWZpbmVkO1xuXHR9KSk7XG5cdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkVXBkYXRlVHJhbnNjcmlwdCh1cGRhdGUgPT4ge1xuXHRcdGxvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gb25EaWRVcGRhdGVUcmFuc2NyaXB0IGxlbj0ke3VwZGF0ZS50ZXh0Lmxlbmd0aH0gZmluYWxpemVkPSR7dXBkYXRlLmZpbmFsaXplZFRleHQubGVuZ3RofSBzdGF0ZT0ke3NlcnZpY2Uuc3RhdGV9YCk7XG5cdFx0aWYgKCFzZXJ2aWNlLnNob3dUcmFuc2NyaXB0V2hpbGVEaWN0YXRpbmcpIHtcblx0XHRcdC8vIFRoZSBzZXR0aW5nIGlzIHJlYWQgbGl2ZSAobm90IHNuYXBzaG90dGVkKSBzbyB0cmFuc2NyaXB0IHJlbmRlcmluZ1xuXHRcdFx0Ly8gYW5kIHRoZSBoaWRkZW4tdHJhbnNjcmlwdCBtaWMgZ2xvdyBhbHdheXMgcmVhY3QgdG8gY29uZmlndXJhdGlvblxuXHRcdFx0Ly8gY2hhbmdlcyB0b2dldGhlci4gSWYgdGhlIHRyYW5zY3JpcHQgaXMgaGlkZGVuIG1pZC1zZXNzaW9uLCBkcm9wIGFueVxuXHRcdFx0Ly8gbGluZ2VyaW5nIGludGVyaW0gc3R5bGluZyBzbyBoaWRkZW4gbW9kZSByZW5kZXJzIG5vIHRyYW5zY3JpcHQgYXQgYWxsLlxuXHRcdFx0aW5zZXJ0ZXIuY2xlYXJJbnRlcmltRGVjb3JhdGlvbnMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aW5zZXJ0ZXIudXBkYXRlKHVwZGF0ZS50ZXh0KTtcblx0fSkpO1xuXHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KGV2ZW50ID0+IGluc2VydGVyLm9uRGlkQ2hhbmdlTW9kZWxDb250ZW50KGV2ZW50KSkpO1xuXHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZVByZXBhcmluZ01vZGVsKCgpID0+IGFwcGx5UGxhY2Vob2xkZXIoKSkpO1xuXHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZENoYW5nZVN0YXRlKHN0YXRlID0+IHtcblx0XHRsb2dTZXJ2aWNlLnRyYWNlKGAke0xPR19QUkVGSVh9IG9uRGlkQ2hhbmdlU3RhdGUgJHtzdGF0ZX1gKTtcblx0XHRpZiAoc3RhdGUgPT09IENoYXRTcGVlY2hUb1RleHRTdGF0ZS5JZGxlICYmIF9hY3RpdmU/LnNlcnZpY2UgPT09IHNlcnZpY2UpIHtcblx0XHRcdC8vIElmIHRoZSBzZXJ2aWNlIGVuZHMgdGhlIHNlc3Npb24gb24gaXRzIG93biAoZS5nLiB0aGUgbW9kZWwgZmFpbGVkXG5cdFx0XHQvLyB0byBsb2FkIGFuZCBpdCBzdXJmYWNlZCBhbiBlcnJvciksIGRyb3AgdGhlIHN0YWxlIGFjdGl2ZSByZWZlcmVuY2Vcblx0XHRcdC8vIHNvIHRoZSB0b29sYmFyIGFuZCBnbG93IHJlZmxlY3QgdGhhdCBkaWN0YXRpb24gaXMgbm8gbG9uZ2VyIHJ1bm5pbmcuXG5cdFx0XHRfYWN0aXZlID0gdW5kZWZpbmVkO1xuXHRcdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRhcHBseVBsYWNlaG9sZGVyKCk7XG5cdH0pKTtcblx0Ly8gVGhlIHRhcmdldCBlZGl0b3IgY2FuIGJlIGRpc3Bvc2VkIG91dCBmcm9tIHVuZGVyIHVzIChlLmcuIHRoZSBBZ2VudHNcblx0Ly8gY29tcG9zZXIgaXMgY2xvc2VkKTsgY2FuY2VsIGRpY3RhdGlvbiBpbnN0ZWFkIG9mIGxlYXZpbmcgdGhlIG1pY3JvcGhvbmVcblx0Ly8gYW5kIGxvY2FsIHRyYW5zY3JpcHRpb24gcnVubmluZyBhZ2FpbnN0IGEgZGVhZCBlZGl0b3IuXG5cdGRpc3Bvc2FibGVzLmFkZChlZGl0b3Iub25EaWREaXNwb3NlKCgpID0+IGNhbmNlbERpY3RhdGlvbigpKSk7XG5cdF9hY3RpdmUgPSB7IHNlcnZpY2UsIGVkaXRvciwgaW5zZXJ0ZXIsIGRpc3Bvc2FibGVzLCBsb2dTZXJ2aWNlLCBzdXJmYWNlIH07XG5cdHRyeSB7XG5cdFx0YXdhaXQgc2VydmljZS5zdGFydCh3aW5kb3csIHN1cmZhY2UpO1xuXHR9IGNhdGNoIHtcblx0XHQvLyBBY3F1aXNpdGlvbi9jb25uZWN0aW9uIGZhaWx1cmUgaXMgc3VyZmFjZWQgYnkgdGhlIHNlcnZpY2UuXG5cdFx0aWYgKF9hY3RpdmU/LnNlcnZpY2UgPT09IHNlcnZpY2UpIHtcblx0XHRcdF9hY3RpdmUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKiogU3RvcCB0aGUgYWN0aXZlIGRpY3RhdGlvbiBhbmQgYXBwbHkgdGhlIGZpbmFsIHRyYW5zY3JpcHQuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc3RvcERpY3RhdGlvbigpOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgYWN0aXZlID0gX2FjdGl2ZTtcblx0aWYgKCFhY3RpdmUpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0X2FjdGl2ZSA9IHVuZGVmaW5lZDtcblx0YWN0aXZlLmxvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gc3RvcERpY3RhdGlvbiBiZWdpbiwgc3RhdGU9JHthY3RpdmUuc2VydmljZS5zdGF0ZX1gKTtcblx0Ly8gRHJvcCB0aGUgaW50ZXJpbSBzdHlsaW5nIGFuZCBsb2NrIG91dCBpbnRlcmltIHVwZGF0ZXMgcmlnaHQgYXdheSBzbyBhXG5cdC8vIHRyYWlsaW5nIGludGVyaW0gdHJhbnNjcmlwdCBlbWl0dGVkIHdoaWxlIHRyYW5zY3JpcHRpb24gZmluYWxpemVzIGNhbm5vdFxuXHQvLyByZS1hcHBseSB0aGUgc3R5bGluZyBvciBvdmVyd3JpdGUgdGhlIGZpbmFsIHRleHQuXG5cdGFjdGl2ZS5pbnNlcnRlci5iZWdpbkZpbmFsaXplKCk7XG5cdHRyeSB7XG5cdFx0Y29uc3QgdGV4dCA9IGF3YWl0IGFjdGl2ZS5zZXJ2aWNlLnN0b3BBbmRUcmFuc2NyaWJlKCk7XG5cdFx0YWN0aXZlLmxvZ1NlcnZpY2UudHJhY2UoYCR7TE9HX1BSRUZJWH0gc3RvcEFuZFRyYW5zY3JpYmUgcmVzb2x2ZWQgdGV4dD0ke3RleHQgPT09IHVuZGVmaW5lZCA/ICd1bmRlZmluZWQnIDogYGxlbj0ke3RleHQubGVuZ3RofWB9YCk7XG5cdFx0aWYgKHRleHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gRmluYWwgdHJhbnNjcmlwdDogcmVuZGVyIGl0IHNvbGlkIChubyBpbnRlcmltIHN0eWxpbmcpLlxuXHRcdFx0YWN0aXZlLmluc2VydGVyLnVwZGF0ZSh0ZXh0LCBmYWxzZSk7XG5cdFx0XHQvLyBUcmFjayBob3cgbXVjaCBvZiB0aGlzIGRpY3RhdGVkIHRleHQgdGhlIHVzZXIgZWRpdHMgYmVmb3JlIHNlbmRpbmcsXG5cdFx0XHQvLyBhcyBhbiBhY2N1cmFjeSBzaWduYWwgY29tcGFyaW5nIHRoZSBiYWNrZW5kcy5cblx0XHRcdHRyYWNrRGljdGF0aW9uQWNjdXJhY3koYWN0aXZlLCB0ZXh0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gTm8gZmluYWwgdHJhbnNjcmlwdCB0byBhcHBseTsgbWFrZSBzdXJlIHRoZSBpbnRlcmltIHN0eWxpbmcgZG9lcyBub3Rcblx0XHRcdC8vIGxpbmdlciBvdmVyIHRoZSBsYXN0IGludGVyaW0gdGV4dC5cblx0XHRcdGFjdGl2ZS5pbnNlcnRlci5jbGVhckludGVyaW1EZWNvcmF0aW9ucygpO1xuXHRcdH1cblx0fSBmaW5hbGx5IHtcblx0XHRhY3RpdmUubG9nU2VydmljZS50cmFjZShgJHtMT0dfUFJFRklYfSBzdG9wRGljdGF0aW9uIGRpc3Bvc2VgKTtcblx0XHRhY3RpdmUuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdC8vIFJldHVybiBmb2N1cyB0byB0aGUgZGljdGF0aW9uIGVkaXRvciBzbyB0aGUgY2FyZXQgKGp1c3QgdW4taGlkZGVuIGJ5XG5cdFx0Ly8gZGlzcG9zaW5nIHRoZSBoaWRlLWN1cnNvciBjbGFzcykgcmVhcHBlYXJzIGltbWVkaWF0ZWx5IGF0IHRoZSBlbmQgb2YgdGhlXG5cdFx0Ly8gaW5zZXJ0ZWQgdHJhbnNjcmlwdCwgcmVhZHkgZm9yIHRoZSB1c2VyIHRvIGNvbnRpbnVlIHR5cGluZy5cblx0XHRhY3RpdmUuZWRpdG9yLmZvY3VzKCk7XG5cdH1cbn1cblxuLyoqIEFib3J0IHRoZSBhY3RpdmUgZGljdGF0aW9uLCBkaXNjYXJkaW5nIHdoYXRldmVyIHdhcyByZWNvcmRlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjYW5jZWxEaWN0YXRpb24oKTogdm9pZCB7XG5cdGNvbnN0IGFjdGl2ZSA9IF9hY3RpdmU7XG5cdGlmICghYWN0aXZlKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdF9hY3RpdmUgPSB1bmRlZmluZWQ7XG5cdC8vIFJlbW92ZSBhbnkgbGl2ZSB0cmFuc2NyaXB0IGFscmVhZHkgd3JpdHRlbiB0byB0aGUgZWRpdG9yIHNvIEVzY2FwZSBsZWF2ZXNcblx0Ly8gdGhlIGlucHV0IGV4YWN0bHkgYXMgaXQgd2FzIGJlZm9yZSBkaWN0YXRpb24gc3RhcnRlZC5cblx0YWN0aXZlLmluc2VydGVyLnJldmVydCgpO1xuXHRhY3RpdmUuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRhY3RpdmUuc2VydmljZS5jYW5jZWwoKTtcbn1cblxuLyoqXG4gKiBBZnRlciBhIGRpY3RhdGlvbiBmaW5pc2hlcywgd2F0Y2ggdGhlIGRpY3RhdGVkIHNwYW4gdW50aWwgaXRzIHRleHQgbGVhdmVzIHRoZVxuICogaW5wdXQgYW5kIHRoZW4gcmVwb3J0IGhvdyBtdWNoIGl0IHdhcyBlZGl0ZWQgaW4gdGhlIG1lYW50aW1lIGFzIGFuIGFjY3VyYWN5XG4gKiBzaWduYWwuIFByZWZlcmFibHkgdHJpZ2dlcmVkIGJ5IGFuIGFjdHVhbCBzdWJtaXQgKHNlZVxuICoge0BsaW5rIG5vdGlmeURpY3RhdGlvblN1Ym1pdHRlZH0pOyBvdGhlcndpc2UgZmFsbHMgYmFjayB0byB0aGUgaW5wdXQgYmVpbmdcbiAqIGNsZWFyZWQgb3IgdGhlIGVkaXRvciBiZWluZyB0b3JuIGRvd24uXG4gKlxuICogVGhlIGRpY3RhdGVkIHJlZ2lvbiBpcyBmb2xsb3dlZCB3aXRoIGEgdHJhY2tlZCBkZWNvcmF0aW9uIHNvIGl0IHN0YXlzIGFsaWduZWRcbiAqIGFzIHRoZSB1c2VyIGVkaXRzIGFyb3VuZCBpdDsgZWRpdHMgdHlwZWQgYXQgaXRzIGVkZ2VzIGFyZSBleGNsdWRlZCBzb1xuICogdW5yZWxhdGVkIHRleHQgYXBwZW5kZWQgYWZ0ZXIgdGhlIGRpY3RhdGlvbiBpcyBub3QgY291bnRlZC4gT25seSBhZ2dyZWdhdGVcbiAqIGNoYXJhY3RlciBtZXRyaWNzIGFyZSBsb2dnZWQgXHUyMDE0IG5ldmVyIHRoZSB0cmFuc2NyaXB0IHRleHQuIFJ1bnMgaW5kZXBlbmRlbnRseVxuICogb2YgdGhlIChhbHJlYWR5LWRpc3Bvc2VkKSBkaWN0YXRpb24gc2Vzc2lvbiBhbmQgY2xlYW5zIGl0c2VsZiB1cCBvbiBtZWFzdXJlLlxuICovXG5pbnRlcmZhY2UgSURpY3RhdGlvbkFjY3VyYWN5VHJhY2tlciB7XG5cdHJlYWRvbmx5IGVkaXRvcjogSUNvZGVFZGl0b3I7XG5cdG1lYXN1cmUoc3VibWl0dGVkOiBib29sZWFuKTogdm9pZDtcbn1cblxuLyoqXG4gKiBMaXZlIGFjY3VyYWN5IHRyYWNrZXJzIGF3YWl0aW5nIHRoZWlyIGRpY3RhdGVkIHRleHQgdG8gbGVhdmUgdGhlIGlucHV0LiBLZXllZFxuICogYXQgbW9kdWxlIHNjb3BlIChtaXJyb3Jpbmcge0BsaW5rIF9hY3RpdmV9KSBzbyBhIHN1Ym1pdCBoYW5kbGVyIGNhbiByZXNvbHZlXG4gKiB0aGUgdHJhY2tlcihzKSBmb3IgaXRzIGVkaXRvciB2aWEge0BsaW5rIG5vdGlmeURpY3RhdGlvblN1Ym1pdHRlZH0uXG4gKi9cbmNvbnN0IF9hY2N1cmFjeVRyYWNrZXJzID0gbmV3IFNldDxJRGljdGF0aW9uQWNjdXJhY3lUcmFja2VyPigpO1xuXG4vKipcbiAqIENhbGxlZCBieSBhbiBpbnB1dCdzIHN1Ym1pdCBwYXRoIHRvIG1lYXN1cmUgYW55IHBlbmRpbmcgZGljdGF0aW9uIGFjY3VyYWN5XG4gKiBhZ2FpbnN0IHRoZSB0ZXh0IGFjdHVhbGx5IGJlaW5nIHNlbnQsIGJlZm9yZSB0aGUgaW5wdXQgaXMgY2xlYXJlZC4gVGhpcyBpc1xuICogdGhlIHByZWNpc2Ugc2lnbmFsOyB3aXRob3V0IGl0IGEgdHJhY2tlciBmYWxscyBiYWNrIHRvIHRoZSBjbGVhci90ZWFyZG93blxuICogaGV1cmlzdGljIGFuZCByZXBvcnRzIGBzdWJtaXR0ZWQ6IGZhbHNlYC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5vdGlmeURpY3RhdGlvblN1Ym1pdHRlZChlZGl0b3I6IElDb2RlRWRpdG9yKTogdm9pZCB7XG5cdGZvciAoY29uc3QgdHJhY2tlciBvZiBbLi4uX2FjY3VyYWN5VHJhY2tlcnNdKSB7XG5cdFx0aWYgKHRyYWNrZXIuZWRpdG9yID09PSBlZGl0b3IpIHtcblx0XHRcdHRyYWNrZXIubWVhc3VyZSh0cnVlKTtcblx0XHR9XG5cdH1cbn1cblxuZnVuY3Rpb24gdHJhY2tEaWN0YXRpb25BY2N1cmFjeShhY3RpdmU6IElBY3RpdmVEaWN0YXRpb24sIGRpY3RhdGVkVGV4dDogc3RyaW5nKTogdm9pZCB7XG5cdGNvbnN0IHsgZWRpdG9yLCBpbnNlcnRlciwgc2VydmljZSwgc3VyZmFjZSB9ID0gYWN0aXZlO1xuXHRjb25zdCBtb2RlbCA9IGVkaXRvci5nZXRNb2RlbCgpO1xuXHRjb25zdCByYW5nZSA9IGluc2VydGVyLmZpbmFsaXplZFJhbmdlKCk7XG5cdGlmICghbW9kZWwgfHwgIXJhbmdlIHx8ICFkaWN0YXRlZFRleHQpIHtcblx0XHRyZXR1cm47XG5cdH1cblx0Y29uc3QgYmFja2VuZCA9IHNlcnZpY2UuY3VycmVudEJhY2tlbmQ7XG5cdGNvbnN0IGNvbGxlY3Rpb24gPSBlZGl0b3IuY3JlYXRlRGVjb3JhdGlvbnNDb2xsZWN0aW9uKFt7XG5cdFx0cmFuZ2UsXG5cdFx0b3B0aW9uczoge1xuXHRcdFx0ZGVzY3JpcHRpb246ICdjaGF0U3BlZWNoVG9UZXh0LWFjY3VyYWN5Jyxcblx0XHRcdHN0aWNraW5lc3M6IFRyYWNrZWRSYW5nZVN0aWNraW5lc3MuTmV2ZXJHcm93c1doZW5UeXBpbmdBdEVkZ2VzLFxuXHRcdH0sXG5cdH1dKTtcblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBtZWFzdXJlZCA9IGZhbHNlO1xuXHRjb25zdCB0cmFja2VyOiBJRGljdGF0aW9uQWNjdXJhY3lUcmFja2VyID0ge1xuXHRcdGVkaXRvcixcblx0XHRtZWFzdXJlKHN1Ym1pdHRlZDogYm9vbGVhbikge1xuXHRcdFx0aWYgKG1lYXN1cmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdG1lYXN1cmVkID0gdHJ1ZTtcblx0XHRcdGNvbnN0IGN1cnJlbnQgPSBjb2xsZWN0aW9uLmdldFJhbmdlKDApO1xuXHRcdFx0Y29uc3Qgc3VibWl0dGVkVGV4dCA9IGN1cnJlbnQgPyBtb2RlbC5nZXRWYWx1ZUluUmFuZ2UoY3VycmVudCkgOiAnJztcblx0XHRcdHNlcnZpY2UubG9nRGljdGF0aW9uQWNjdXJhY3koeyBkaWN0YXRlZFRleHQsIHN1Ym1pdHRlZFRleHQsIGJhY2tlbmQsIHN1cmZhY2UsIHN1Ym1pdHRlZCB9KTtcblx0XHRcdGNvbGxlY3Rpb24uY2xlYXIoKTtcblx0XHRcdHN0b3JlLmRpc3Bvc2UoKTtcblx0XHRcdF9hY2N1cmFjeVRyYWNrZXJzLmRlbGV0ZSh0cmFja2VyKTtcblx0XHR9LFxuXHR9O1xuXHQvLyBGYWxsYmFja3Mgd2hlbiBubyBzdWJtaXQgc2lnbmFsIGFycml2ZXM6IHN1Ym1pdHRpbmcgdGhlIGNoYXQgaW5wdXQgY2xlYXJzXG5cdC8vIHRoZSBlZGl0b3IgdG8gZW1wdHkgKGFsc28gY292ZXJzIGEgbWFudWFsIGNsZWFyLWFsbCksIGFuZCB0aGUgZWRpdG9yIGNhblxuXHQvLyBiZSB0b3JuIGRvd24gd2l0aCBkaWN0YXRlZCB0ZXh0IHN0aWxsIGluIGl0LlxuXHRzdG9yZS5hZGQobW9kZWwub25EaWRDaGFuZ2VDb250ZW50KCgpID0+IHtcblx0XHRpZiAobW9kZWwuZ2V0VmFsdWVMZW5ndGgoKSA9PT0gMCkge1xuXHRcdFx0dHJhY2tlci5tZWFzdXJlKGZhbHNlKTtcblx0XHR9XG5cdH0pKTtcblx0c3RvcmUuYWRkKG1vZGVsLm9uV2lsbERpc3Bvc2UoKCkgPT4gdHJhY2tlci5tZWFzdXJlKGZhbHNlKSkpO1xuXHRzdG9yZS5hZGQoZWRpdG9yLm9uRGlkRGlzcG9zZSgoKSA9PiB0cmFja2VyLm1lYXN1cmUoZmFsc2UpKSk7XG5cdF9hY2N1cmFjeVRyYWNrZXJzLmFkZCh0cmFja2VyKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU87QUFDUCxTQUFTLGlCQUFpQixvQkFBb0I7QUFFOUMsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsZ0JBQWdCO0FBRXpCLFNBQStCLDZCQUF1RDtBQU10RixNQUFNLDJCQUEyQjtBQUVqQyxNQUFNLGFBQWE7QUFNbkIsTUFBTSx1QkFBdUI7QUFBQSxFQW1DNUIsWUFDa0IsU0FDQSxhQUNoQjtBQUZnQjtBQUNBO0FBbENsQixTQUFRLHFCQUFxQjtBQUU3QixTQUFRLGFBQWE7QUFDckIsU0FBUSxrQkFBa0I7QUFDMUIsU0FBUSxnQkFBZ0I7QUFNeEI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVEsc0JBQXNCO0FBTzlCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVEsaUJBQWlCO0FBQUEsRUFrQnJCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWtCSixPQUFP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
