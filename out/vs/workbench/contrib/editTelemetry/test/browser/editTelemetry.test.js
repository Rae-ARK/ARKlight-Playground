import assert from "assert";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue, subtransaction } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { StringReplacement } from "../../../../../editor/common/core/edits/stringEdit.js";
import { OffsetRange } from "../../../../../editor/common/core/ranges/offsetRange.js";
import { StringText } from "../../../../../editor/common/core/text/abstractText.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { AnnotatedDocuments, UriVisibilityProvider } from "../../browser/helpers/annotatedDocuments.js";
import { ObservableWorkspace, StringEditWithReason } from "../../browser/helpers/observableWorkspace.js";
import { EditSourceTrackingImpl } from "../../browser/telemetry/editSourceTrackingImpl.js";
import { ScmAdapter } from "../../browser/telemetry/scmAdapter.js";
import { EditSources } from "../../../../../editor/common/textModelEditSource.js";
import { DiffService } from "../../browser/helpers/documentWithAnnotatedEdits.js";
import { computeStringDiff } from "../../../../../editor/common/services/editorWebWorker.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { timeout } from "../../../../../base/common/async.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { IAiEditTelemetryService } from "../../browser/telemetry/aiEditTelemetry/aiEditTelemetryService.js";
import { Random } from "../../../../../editor/test/common/core/random.js";
import { AiEditTelemetryServiceImpl } from "../../browser/telemetry/aiEditTelemetry/aiEditTelemetryServiceImpl.js";
import { IRandomService, RandomService } from "../../browser/randomService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { UserAttentionService, UserAttentionServiceEnv } from "../../../../services/userAttention/browser/userAttentionBrowser.js";
import { IUserAttentionService } from "../../../../services/userAttention/common/userAttentionService.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
suite("Edit Telemetry", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("1", async () => runWithFakedTimers({}, async () => {
    const disposables = new DisposableStore();
    const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
      [IAiEditTelemetryService, new SyncDescriptor(AiEditTelemetryServiceImpl)],
      [IUserAttentionService, new SyncDescriptor(UserAttentionService)]
    ), false, void 0, true));
    const sentTelemetry = [];
    const userActive = observableValue("userActive", true);
    instantiationService.stubInstance(UserAttentionServiceEnv, {
      isUserActive: userActive,
      isVsCodeFocused: constObservable(true),
      dispose: () => {
      }
    });
    instantiationService.stub(ITelemetryService, {
      publicLog2(eventName, data) {
        sentTelemetry.push(`${formatTime(Date.now())} ${eventName}: ${JSON.stringify(data)}`);
      }
    });
    instantiationService.stubInstance(DiffService, { computeDiff: async (original, modified) => computeStringDiff(original, modified, { maxComputationTimeMs: 500 }, "advanced") });
    instantiationService.stubInstance(ScmAdapter, { getRepo: (uri, reader) => void 0 });
    instantiationService.stubInstance(UriVisibilityProvider, { isVisible: (uri, reader) => true });
    instantiationService.stub(IRandomService, new DeterministicRandomService());
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(ITextFileService, { isDirty: () => false });
    const w = new MutableObservableWorkspace();
    const docs = disposables.add(new AnnotatedDocuments(w, instantiationService));
    disposables.add(new EditSourceTrackingImpl(constObservable(true), docs, void 0, instantiationService));
    const d1 = disposables.add(w.createDocument({
      uri: URI.parse("file:///a"),
      initialValue: `
function fib(n) {
	if (n <= 1) return n;
	return fib(n - 1) + fib(n - 2);
}
`
    }, void 0));
    await timeout(10);
    const chatEdit = EditSources.chatApplyEdits({
      languageId: "plaintext",
      modelId: void 0,
      codeBlockSuggestionId: void 0,
      extensionId: void 0,
      mode: void 0,
      requestId: void 0,
      sessionId: void 0
    });
    d1.applyEdit(StringEditWithReason.replace(d1.findRange("\u226A\u226Bfunction fib(n) {"), "// Computes the nth fibonacci number\n", chatEdit));
    await timeout(5e3);
    d1.applyEdit(new StringEditWithReason([
      StringReplacement.replace(d1.findRange("\u226A//\u226B Computes"), "/*"),
      StringReplacement.replace(d1.findRange("fibonacci number\u226A\u226B"), " */")
    ], EditSources.cursor({ kind: "type" })));
    await timeout(5e3);
    d1.applyEdit(StringEditWithReason.replace(d1.findRange("Computes the nth fibonacci number"), "Berechnet die nte Fibonacci Zahl", chatEdit));
    await timeout(3 * 60 * 1e3);
    userActive.set(false, void 0);
    await timeout(3 * 60 * 1e3);
    userActive.set(true, void 0);
    await timeout(18 * 60 * 1e3);
    assert.deepStrictEqual(sentTelemetry, [
      '00:01:010 editTelemetry.reportEditArc: {"sourceKeyCleaned":"source:Chat.applyEdits","languageId":"plaintext","uniqueEditId":"8c97b7d8-9adb-4bd8-ac9f-a562704ce40e","didBranchChange":0,"timeDelayMs":0,"originalCharCount":37,"originalLineCount":1,"originalDeletedLineCount":0,"arc":37,"currentLineCount":1,"currentDeletedLineCount":0}',
      '00:01:010 editTelemetry.codeSuggested: {"eventId":"evt-055ed5f5-c723-4ede-ba79-cccd7685c7ad","suggestionId":"sgt-f645627a-cacf-477a-9164-ecd6125616a5","presentation":"highlightedEdit","feature":"sideBarChat","languageId":"plaintext","editCharsInserted":37,"editCharsDeleted":0,"editLinesInserted":1,"editLinesDeleted":0}',
      '00:11:010 editTelemetry.reportEditArc: {"sourceKeyCleaned":"source:Chat.applyEdits","languageId":"plaintext","uniqueEditId":"1eb8a394-2489-41c2-851b-6a79432fc6bc","didBranchChange":0,"timeDelayMs":0,"originalCharCount":19,"originalLineCount":1,"originalDeletedLineCount":1,"arc":19,"currentLineCount":1,"currentDeletedLineCount":1}',
      '00:11:010 editTelemetry.codeSuggested: {"eventId":"evt-5c9c6fe7-b219-4ff8-aaa7-ab2b355b21c0","suggestionId":"sgt-74379122-0452-4e26-9c38-9d62f1e7ae73","presentation":"highlightedEdit","feature":"sideBarChat","languageId":"plaintext","editCharsInserted":19,"editCharsDeleted":20,"editLinesInserted":1,"editLinesDeleted":1}',
      '01:01:010 editTelemetry.reportEditArc: {"sourceKeyCleaned":"source:Chat.applyEdits","languageId":"plaintext","uniqueEditId":"8c97b7d8-9adb-4bd8-ac9f-a562704ce40e","didBranchChange":0,"timeDelayMs":60000,"originalCharCount":37,"originalLineCount":1,"originalDeletedLineCount":0,"arc":16,"currentLineCount":1,"currentDeletedLineCount":0}',
      '01:11:010 editTelemetry.reportEditArc: {"sourceKeyCleaned":"source:Chat.applyEdits","languageId":"plaintext","uniqueEditId":"1eb8a394-2489-41c2-851b-6a79432fc6bc","didBranchChange":0,"timeDelayMs":60000,"originalCharCount":19,"originalLineCount":1,"originalDeletedLineCount":1,"arc":19,"currentLineCount":1,"currentDeletedLineCount":1}',
      '05:01:010 editTelemetry.reportEditArc: {"sourceKeyCleaned":"source:Chat.applyEdits","languageId":"plaintext","uniqueEditId":"8c97b7d8-9adb-4bd8-ac9f-a562704ce40e","didBranchChange":0,"timeDelayMs":300000,"originalCharCount":37,"originalLineCount":1,"originalDeletedLineCount":0,"arc":16,"currentLineCount":1,"currentDeletedLineCount":0}',
      '05:11:010 editTelemetry.reportEditArc: {"sourceKeyCleaned":"source:Chat.applyEdits","languageId":"plaintext","uniqueEditId":"1eb8a394-2489-41c2-851b-6a79432fc6bc","didBranchChange":0,"timeDelayMs":300000,"originalCharCount":19,"originalLineCount":1,"originalDeletedLineCount":1,"arc":19,"currentLineCount":1,"currentDeletedLineCount":1}',
      '12:00:000 editTelemetry.editSources.details: {"mode":"10minFocusWindow","sourceKey":"source:Chat.applyEdits","sourceKeyCleaned":"source:Chat.applyEdits","trigger":"time","languageId":"plaintext","statsUuid":"509b5d53-9109-40a2-bdf5-1aa735a229fe","modifiedCount":35,"deltaModifiedCount":56,"totalModifiedCount":39}',
      '12:00:000 editTelemetry.editSources.details: {"mode":"10minFocusWindow","sourceKey":"source:cursor-kind:type","sourceKeyCleaned":"source:cursor-kind:type","trigger":"time","languageId":"plaintext","statsUuid":"509b5d53-9109-40a2-bdf5-1aa735a229fe","modifiedCount":4,"deltaModifiedCount":4,"totalModifiedCount":39}',
      '12:00:000 editTelemetry.editSources.stats: {"mode":"10minFocusWindow","languageId":"plaintext","statsUuid":"509b5d53-9109-40a2-bdf5-1aa735a229fe","nesModifiedCount":0,"inlineCompletionsCopilotModifiedCount":0,"inlineCompletionsNESModifiedCount":0,"otherAIModifiedCount":35,"unknownModifiedCount":0,"userModifiedCount":4,"ideModifiedCount":0,"totalModifiedCharacters":39,"externalModifiedCount":0,"isTrackedByGit":0,"focusTime":600000,"actualTime":720000,"trigger":"time"}',
      '22:00:000 editTelemetry.editSources.details: {"mode":"20minFocusWindow","sourceKey":"source:Chat.applyEdits","sourceKeyCleaned":"source:Chat.applyEdits","trigger":"time","languageId":"plaintext","statsUuid":"a794406a-7779-4e9f-a856-1caca85123c7","modifiedCount":35,"deltaModifiedCount":56,"totalModifiedCount":39}',
      '22:00:000 editTelemetry.editSources.details: {"mode":"20minFocusWindow","sourceKey":"source:cursor-kind:type","sourceKeyCleaned":"source:cursor-kind:type","trigger":"time","languageId":"plaintext","statsUuid":"a794406a-7779-4e9f-a856-1caca85123c7","modifiedCount":4,"deltaModifiedCount":4,"totalModifiedCount":39}',
      '22:00:000 editTelemetry.editSources.stats: {"mode":"20minFocusWindow","languageId":"plaintext","statsUuid":"a794406a-7779-4e9f-a856-1caca85123c7","nesModifiedCount":0,"inlineCompletionsCopilotModifiedCount":0,"inlineCompletionsNESModifiedCount":0,"otherAIModifiedCount":35,"unknownModifiedCount":0,"userModifiedCount":4,"ideModifiedCount":0,"totalModifiedCharacters":39,"externalModifiedCount":0,"isTrackedByGit":0,"focusTime":1200000,"actualTime":1320000,"trigger":"time"}'
    ]);
    disposables.dispose();
  }));
});
function formatTime(timeMs) {
  const totalMs = Math.floor(timeMs);
  const minutes = Math.floor(totalMs / 6e4);
  const seconds = Math.floor(totalMs % 6e4 / 1e3);
  const ms = totalMs % 1e3;
  const str = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}:${ms.toString().padStart(3, "0")}`;
  return str;
}
class DeterministicRandomService extends RandomService {
  constructor() {
    super(...arguments);
    this._rand = Random.create(0);
  }
  generateUuid() {
    return this._rand.nextUuid();
  }
}
class FakeAnnotatedDocuments extends Disposable {
  constructor() {
    super();
    this.documents = constObservable([]);
  }
}
function findOffsetRange(str, search) {
  const startContextIndex = search.indexOf("\u226A");
  const endContextIndex = search.indexOf("\u226B");
  let searchStr;
  let beforeContext = "";
  let afterContext = "";
  if (startContextIndex !== -1 && endContextIndex !== -1 && endContextIndex > startContextIndex) {
    beforeContext = search.substring(0, startContextIndex);
    afterContext = search.substring(endContextIndex + 1);
    searchStr = search.substring(startContextIndex + 1, endContextIndex);
  } else {
    searchStr = search;
  }
  const startIndex = str.indexOf(beforeContext + searchStr + afterContext);
  if (startIndex === -1) {
    throw new Error(`Could not find context "${beforeContext}" + "${searchStr}" + "${afterContext}" in string "${str}"`);
  }
  const matchStart = startIndex + beforeContext.length;
  return new OffsetRange(matchStart, matchStart + searchStr.length);
}
class MutableObservableWorkspace extends ObservableWorkspace {
  constructor() {
    super();
    this._openDocuments = observableValue(this, []);
    this.documents = this._openDocuments;
    this._documents = /* @__PURE__ */ new Map();
  }
  /**
   * Dispose to remove.
  */
  createDocument(options, tx = void 0) {
    assert(!this._documents.has(options.uri.toString()));
    const document = new MutableObservableDocument(
      options.uri,
      new StringText(options.initialValue ?? ""),
      [],
      options.languageId ?? "plaintext",
      () => {
        this._documents.delete(options.uri.toString());
        const docs = this._openDocuments.get();
        const filteredDocs = docs.filter((d) => d.uri.toString() !== document.uri.toString());
        if (filteredDocs.length !== docs.length) {
          this._openDocuments.set(filteredDocs, tx, { added: [], removed: [document] });
        }
      },
      options.initialVersionId ?? 0,
      options.workspaceRoot
    );
    this._documents.set(options.uri.toString(), document);
    this._openDocuments.set([...this._openDocuments.get(), document], tx, { added: [document], removed: [] });
    return document;
  }
  getDocument(id) {
    return this._documents.get(id.toString());
  }
  clear() {
    this._openDocuments.set([], void 0, { added: [], removed: this._openDocuments.get() });
    for (const doc of this._documents.values()) {
      doc.dispose();
    }
    this._documents.clear();
  }
}
class MutableObservableDocument extends Disposable {
  constructor(uri, value, selection, languageId, onDispose, versionId, workspaceRoot) {
    super();
    this.uri = uri;
    this.workspaceRoot = workspaceRoot;
    this._value = observableValue(this, value);
    this._selection = observableValue(this, selection);
    this._visibleRanges = observableValue(this, []);
    this._languageId = observableValue(this, languageId);
    this._version = observableValue(this, versionId);
    this._register(toDisposable(onDispose));
  }
  get value() {
    return this._value;
  }
  get selection() {
    return this._selection;
  }
  get visibleRanges() {
    return this._visibleRanges;
  }
  get languageId() {
    return this._languageId;
  }
  get version() {
    return this._version;
  }
  setSelection(selection, tx = void 0) {
    this._selection.set(selection, tx);
  }
  setVisibleRange(visibleRanges, tx = void 0) {
    this._visibleRanges.set(visibleRanges, tx);
  }
  applyEdit(edit, tx = void 0, newVersion = void 0) {
    const newValue = edit.applyOnText(this.value.get());
    const e = edit instanceof StringEditWithReason ? edit : new StringEditWithReason(edit.replacements, EditSources.unknown({}));
    subtransaction(tx, (tx2) => {
      this._value.set(newValue, tx2, e);
      this._version.set(newVersion ?? this._version.get() + 1, tx2);
    });
  }
  updateSelection(selection, tx = void 0) {
    this._selection.set(selection, tx);
  }
  setValue(value, tx = void 0, newVersion = void 0) {
    const reason = EditSources.unknown({});
    const e = new StringEditWithReason([StringReplacement.replace(new OffsetRange(0, this.value.get().value.length), value.value)], reason);
    subtransaction(tx, (tx2) => {
      this._value.set(value, tx2, e);
      this._version.set(newVersion ?? this._version.get() + 1, tx2);
    });
  }
  findRange(search) {
    return findOffsetRange(this.value.get().value, search);
  }
}
export {
  FakeAnnotatedDocuments,
  MutableObservableDocument,
  MutableObservableWorkspace
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2VkaXRUZWxlbWV0cnkvdGVzdC9icm93c2VyL2VkaXRUZWxlbWV0cnkudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgSU9ic2VydmFibGUsIElPYnNlcnZhYmxlV2l0aENoYW5nZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgSVRyYW5zYWN0aW9uLCBvYnNlcnZhYmxlVmFsdWUsIHN1YnRyYW5zYWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgU3RyaW5nRWRpdCwgU3RyaW5nUmVwbGFjZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvZWRpdHMvc3RyaW5nRWRpdC5qcyc7XG5pbXBvcnQgeyBPZmZzZXRSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZXMvb2Zmc2V0UmFuZ2UuanMnO1xuaW1wb3J0IHsgU3RyaW5nVGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS90ZXh0L2Fic3RyYWN0VGV4dC5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IEFubm90YXRlZERvY3VtZW50LCBBbm5vdGF0ZWREb2N1bWVudHMsIElBbm5vdGF0ZWREb2N1bWVudHMsIFVyaVZpc2liaWxpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvaGVscGVycy9hbm5vdGF0ZWREb2N1bWVudHMuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGVEb2N1bWVudCwgT2JzZXJ2YWJsZVdvcmtzcGFjZSwgU3RyaW5nRWRpdFdpdGhSZWFzb24gfSBmcm9tICcuLi8uLi9icm93c2VyL2hlbHBlcnMvb2JzZXJ2YWJsZVdvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyBFZGl0U291cmNlVHJhY2tpbmdJbXBsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZWxlbWV0cnkvZWRpdFNvdXJjZVRyYWNraW5nSW1wbC5qcyc7XG5pbXBvcnQgeyBTY21BZGFwdGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZWxlbWV0cnkvc2NtQWRhcHRlci5qcyc7XG5pbXBvcnQgeyBFZGl0U291cmNlcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vdGV4dE1vZGVsRWRpdFNvdXJjZS5qcyc7XG5pbXBvcnQgeyBEaWZmU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvaGVscGVycy9kb2N1bWVudFdpdGhBbm5vdGF0ZWRFZGl0cy5qcyc7XG5pbXBvcnQgeyBjb21wdXRlU3RyaW5nRGlmZiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvZWRpdG9yV2ViV29ya2VyLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJQWlFZGl0VGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVsZW1ldHJ5L2FpRWRpdFRlbGVtZXRyeS9haUVkaXRUZWxlbWV0cnlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJhbmRvbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi9jb3JlL3JhbmRvbS5qcyc7XG5pbXBvcnQgeyBBaUVkaXRUZWxlbWV0cnlTZXJ2aWNlSW1wbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVsZW1ldHJ5L2FpRWRpdFRlbGVtZXRyeS9haUVkaXRUZWxlbWV0cnlTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBJUmFuZG9tU2VydmljZSwgUmFuZG9tU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcmFuZG9tU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFN5bmNEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZGVzY3JpcHRvcnMuanMnO1xuaW1wb3J0IHsgVXNlckF0dGVudGlvblNlcnZpY2UsIFVzZXJBdHRlbnRpb25TZXJ2aWNlRW52IH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdXNlckF0dGVudGlvbi9icm93c2VyL3VzZXJBdHRlbnRpb25Ccm93c2VyLmpzJztcbmltcG9ydCB7IElVc2VyQXR0ZW50aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3VzZXJBdHRlbnRpb24vY29tbW9uL3VzZXJBdHRlbnRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcblxuc3VpdGUoJ0VkaXQgVGVsZW1ldHJ5JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCcxJywgYXN5bmMgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzKHt9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSUFpRWRpdFRlbGVtZXRyeVNlcnZpY2UsIG5ldyBTeW5jRGVzY3JpcHRvcihBaUVkaXRUZWxlbWV0cnlTZXJ2aWNlSW1wbCldLFxuXHRcdFx0W0lVc2VyQXR0ZW50aW9uU2VydmljZSwgbmV3IFN5bmNEZXNjcmlwdG9yKFVzZXJBdHRlbnRpb25TZXJ2aWNlKV1cblx0XHQpLCBmYWxzZSwgdW5kZWZpbmVkLCB0cnVlKSk7XG5cblx0XHRjb25zdCBzZW50VGVsZW1ldHJ5OiB1bmtub3duW10gPSBbXTtcblx0XHRjb25zdCB1c2VyQWN0aXZlID0gb2JzZXJ2YWJsZVZhbHVlKCd1c2VyQWN0aXZlJywgdHJ1ZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1Ykluc3RhbmNlKFVzZXJBdHRlbnRpb25TZXJ2aWNlRW52LCB7XG5cdFx0XHRpc1VzZXJBY3RpdmU6IHVzZXJBY3RpdmUsXG5cdFx0XHRpc1ZzQ29kZUZvY3VzZWQ6IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfVxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIHtcblx0XHRcdHB1YmxpY0xvZzIoZXZlbnROYW1lLCBkYXRhKSB7XG5cdFx0XHRcdHNlbnRUZWxlbWV0cnkucHVzaChgJHtmb3JtYXRUaW1lKERhdGUubm93KCkpfSAke2V2ZW50TmFtZX06ICR7SlNPTi5zdHJpbmdpZnkoZGF0YSl9YCk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWJJbnN0YW5jZShEaWZmU2VydmljZSwgeyBjb21wdXRlRGlmZjogYXN5bmMgKG9yaWdpbmFsLCBtb2RpZmllZCkgPT4gY29tcHV0ZVN0cmluZ0RpZmYob3JpZ2luYWwsIG1vZGlmaWVkLCB7IG1heENvbXB1dGF0aW9uVGltZU1zOiA1MDAgfSwgJ2FkdmFuY2VkJykgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1Ykluc3RhbmNlKFNjbUFkYXB0ZXIsIHsgZ2V0UmVwbzogKHVyaSwgcmVhZGVyKSA9PiB1bmRlZmluZWQsIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWJJbnN0YW5jZShVcmlWaXNpYmlsaXR5UHJvdmlkZXIsIHsgaXNWaXNpYmxlOiAodXJpLCByZWFkZXIpID0+IHRydWUsIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJhbmRvbVNlcnZpY2UsIG5ldyBEZXRlcm1pbmlzdGljUmFuZG9tU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGV4dEZpbGVTZXJ2aWNlLCB7IGlzRGlydHk6ICgpID0+IGZhbHNlIH0pO1xuXG5cdFx0Y29uc3QgdyA9IG5ldyBNdXRhYmxlT2JzZXJ2YWJsZVdvcmtzcGFjZSgpO1xuXHRcdGNvbnN0IGRvY3MgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFubm90YXRlZERvY3VtZW50cyh3LCBpbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgRWRpdFNvdXJjZVRyYWNraW5nSW1wbChjb25zdE9ic2VydmFibGUodHJ1ZSksIGRvY3MsIHVuZGVmaW5lZCwgaW5zdGFudGlhdGlvblNlcnZpY2UpKTtcblxuXHRcdGNvbnN0IGQxID0gZGlzcG9zYWJsZXMuYWRkKHcuY3JlYXRlRG9jdW1lbnQoe1xuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vYScpLCBpbml0aWFsVmFsdWU6IGBcbmZ1bmN0aW9uIGZpYihuKSB7XG5cdGlmIChuIDw9IDEpIHJldHVybiBuO1xuXHRyZXR1cm4gZmliKG4gLSAxKSArIGZpYihuIC0gMik7XG59XG5gXG5cdFx0fSwgdW5kZWZpbmVkKSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdGNvbnN0IGNoYXRFZGl0ID0gRWRpdFNvdXJjZXMuY2hhdEFwcGx5RWRpdHMoe1xuXHRcdFx0bGFuZ3VhZ2VJZDogJ3BsYWludGV4dCcsXG5cdFx0XHRtb2RlbElkOiB1bmRlZmluZWQsXG5cdFx0XHRjb2RlQmxvY2tTdWdnZXN0aW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdGV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRtb2RlOiB1bmRlZmluZWQsXG5cdFx0XHRyZXF1ZXN0SWQ6IHVuZGVmaW5lZCxcblx0XHRcdHNlc3Npb25JZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXG5cdFx0ZDEuYXBwbHlFZGl0KFN0cmluZ0VkaXRXaXRoUmVhc29uLnJlcGxhY2UoZDEuZmluZFJhbmdlKCdcdTIyNkFcdTIyNkJmdW5jdGlvbiBmaWIobikgeycpLCAnLy8gQ29tcHV0ZXMgdGhlIG50aCBmaWJvbmFjY2kgbnVtYmVyXFxuJywgY2hhdEVkaXQpKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoNTAwMCk7XG5cblx0XHRkMS5hcHBseUVkaXQobmV3IFN0cmluZ0VkaXRXaXRoUmVhc29uKFtcblx0XHRcdFN0cmluZ1JlcGxhY2VtZW50LnJlcGxhY2UoZDEuZmluZFJhbmdlKCdcdTIyNkEvL1x1MjI2QiBDb21wdXRlcycpLCAnLyonKSxcblx0XHRcdFN0cmluZ1JlcGxhY2VtZW50LnJlcGxhY2UoZDEuZmluZFJhbmdlKCdmaWJvbmFjY2kgbnVtYmVyXHUyMjZBXHUyMjZCJyksICcgKi8nKSxcblx0XHRdLCBFZGl0U291cmNlcy5jdXJzb3IoeyBraW5kOiAndHlwZScgfSkpKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoNTAwMCk7XG5cblx0XHRkMS5hcHBseUVkaXQoU3RyaW5nRWRpdFdpdGhSZWFzb24ucmVwbGFjZShkMS5maW5kUmFuZ2UoJ0NvbXB1dGVzIHRoZSBudGggZmlib25hY2NpIG51bWJlcicpLCAnQmVyZWNobmV0IGRpZSBudGUgRmlib25hY2NpIFphaGwnLCBjaGF0RWRpdCkpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgzICogNjAgKiAxMDAwKTtcblx0XHR1c2VyQWN0aXZlLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDMgKiA2MCAqIDEwMDApO1xuXHRcdHVzZXJBY3RpdmUuc2V0KHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgxOCAqIDYwICogMTAwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlbnRUZWxlbWV0cnksIChbXG5cdFx0XHQnMDA6MDE6MDEwIGVkaXRUZWxlbWV0cnkucmVwb3J0RWRpdEFyYzoge1xcXCJzb3VyY2VLZXlDbGVhbmVkXFxcIjpcXFwic291cmNlOkNoYXQuYXBwbHlFZGl0c1xcXCIsXFxcImxhbmd1YWdlSWRcXFwiOlxcXCJwbGFpbnRleHRcXFwiLFxcXCJ1bmlxdWVFZGl0SWRcXFwiOlxcXCI4Yzk3YjdkOC05YWRiLTRiZDgtYWM5Zi1hNTYyNzA0Y2U0MGVcXFwiLFxcXCJkaWRCcmFuY2hDaGFuZ2VcXFwiOjAsXFxcInRpbWVEZWxheU1zXFxcIjowLFxcXCJvcmlnaW5hbENoYXJDb3VudFxcXCI6MzcsXFxcIm9yaWdpbmFsTGluZUNvdW50XFxcIjoxLFxcXCJvcmlnaW5hbERlbGV0ZWRMaW5lQ291bnRcXFwiOjAsXFxcImFyY1xcXCI6MzcsXFxcImN1cnJlbnRMaW5lQ291bnRcXFwiOjEsXFxcImN1cnJlbnREZWxldGVkTGluZUNvdW50XFxcIjowfScsXG5cdFx0XHQnMDA6MDE6MDEwIGVkaXRUZWxlbWV0cnkuY29kZVN1Z2dlc3RlZDoge1xcXCJldmVudElkXFxcIjpcXFwiZXZ0LTA1NWVkNWY1LWM3MjMtNGVkZS1iYTc5LWNjY2Q3Njg1YzdhZFxcXCIsXFxcInN1Z2dlc3Rpb25JZFxcXCI6XFxcInNndC1mNjQ1NjI3YS1jYWNmLTQ3N2EtOTE2NC1lY2Q2MTI1NjE2YTVcXFwiLFxcXCJwcmVzZW50YXRpb25cXFwiOlxcXCJoaWdobGlnaHRlZEVkaXRcXFwiLFxcXCJmZWF0dXJlXFxcIjpcXFwic2lkZUJhckNoYXRcXFwiLFxcXCJsYW5ndWFnZUlkXFxcIjpcXFwicGxhaW50ZXh0XFxcIixcXFwiZWRpdENoYXJzSW5zZXJ0ZWRcXFwiOjM3LFxcXCJlZGl0Q2hhcnNEZWxldGVkXFxcIjowLFxcXCJlZGl0TGluZXNJbnNlcnRlZFxcXCI6MSxcXFwiZWRpdExpbmVzRGVsZXRlZFxcXCI6MH0nLFxuXHRcdFx0JzAwOjExOjAxMCBlZGl0VGVsZW1ldHJ5LnJlcG9ydEVkaXRBcmM6IHtcXFwic291cmNlS2V5Q2xlYW5lZFxcXCI6XFxcInNvdXJjZTpDaGF0LmFwcGx5RWRpdHNcXFwiLFxcXCJsYW5ndWFnZUlkXFxcIjpcXFwicGxhaW50ZXh0XFxcIixcXFwidW5pcXVlRWRpdElkXFxcIjpcXFwiMWViOGEzOTQtMjQ4OS00MWMyLTg1MWItNmE3OTQzMmZjNmJjXFxcIixcXFwiZGlkQnJhbmNoQ2hhbmdlXFxcIjowLFxcXCJ0aW1lRGVsYXlNc1xcXCI6MCxcXFwib3JpZ2luYWxDaGFyQ291bnRcXFwiOjE5LFxcXCJvcmlnaW5hbExpbmVDb3VudFxcXCI6MSxcXFwib3JpZ2luYWxEZWxldGVkTGluZUNvdW50XFxcIjoxLFxcXCJhcmNcXFwiOjE5LFxcXCJjdXJyZW50TGluZUNvdW50XFxcIjoxLFxcXCJjdXJyZW50RGVsZXRlZExpbmVDb3VudFxcXCI6MX0nLFxuXHRcdFx0JzAwOjExOjAxMCBlZGl0VGVsZW1ldHJ5LmNvZGVTdWdnZXN0ZWQ6IHtcXFwiZXZlbnRJZFxcXCI6XFxcImV2dC01YzljNmZlNy1iMjE5LTRmZjgtYWFhNy1hYjJiMzU1YjIxYzBcXFwiLFxcXCJzdWdnZXN0aW9uSWRcXFwiOlxcXCJzZ3QtNzQzNzkxMjItMDQ1Mi00ZTI2LTljMzgtOWQ2MmYxZTdhZTczXFxcIixcXFwicHJlc2VudGF0aW9uXFxcIjpcXFwiaGlnaGxpZ2h0ZWRFZGl0XFxcIixcXFwiZmVhdHVyZVxcXCI6XFxcInNpZGVCYXJDaGF0XFxcIixcXFwibGFuZ3VhZ2VJZFxcXCI6XFxcInBsYWludGV4dFxcXCIsXFxcImVkaXRDaGFyc0luc2VydGVkXFxcIjoxOSxcXFwiZWRpdENoYXJzRGVsZXRlZFxcXCI6MjAsXFxcImVkaXRMaW5lc0luc2VydGVkXFxcIjoxLFxcXCJlZGl0TGluZXNEZWxldGVkXFxcIjoxfScsXG5cdFx0XHQnMDE6MDE6MDEwIGVkaXRUZWxlbWV0cnkucmVwb3J0RWRpdEFyYzoge1xcXCJzb3VyY2VLZXlDbGVhbmVkXFxcIjpcXFwic291cmNlOkNoYXQuYXBwbHlFZGl0c1xcXCIsXFxcImxhbmd1YWdlSWRcXFwiOlxcXCJwbGFpbnRleHRcXFwiLFxcXCJ1bmlxdWVFZGl0SWRcXFwiOlxcXCI4Yzk3YjdkOC05YWRiLTRiZDgtYWM5Zi1hNTYyNzA0Y2U0MGVcXFwiLFxcXCJkaWRCcmFuY2hDaGFuZ2VcXFwiOjAsXFxcInRpbWVEZWxheU1zXFxcIjo2MDAwMCxcXFwib3JpZ2luYWxDaGFyQ291bnRcXFwiOjM3LFxcXCJvcmlnaW5hbExpbmVDb3VudFxcXCI6MSxcXFwib3JpZ2luYWxEZWxldGVkTGluZUNvdW50XFxcIjowLFxcXCJhcmNcXFwiOjE2LFxcXCJjdXJyZW50TGluZUNvdW50XFxcIjoxLFxcXCJjdXJyZW50RGVsZXRlZExpbmVDb3VudFxcXCI6MH0nLFxuXHRcdFx0JzAxOjExOjAxMCBlZGl0VGVsZW1ldHJ5LnJlcG9ydEVkaXRBcmM6IHtcXFwic291cmNlS2V5Q2xlYW5lZFxcXCI6XFxcInNvdXJjZTpDaGF0LmFwcGx5RWRpdHNcXFwiLFxcXCJsYW5ndWFnZUlkXFxcIjpcXFwicGxhaW50ZXh0XFxcIixcXFwidW5pcXVlRWRpdElkXFxcIjpcXFwiMWViOGEzOTQtMjQ4OS00MWMyLTg1MWItNmE3OTQzMmZjNmJjXFxcIixcXFwiZGlkQnJhbmNoQ2hhbmdlXFxcIjowLFxcXCJ0aW1lRGVsYXlNc1xcXCI6NjAwMDAsXFxcIm9yaWdpbmFsQ2hhckNvdW50XFxcIjoxOSxcXFwib3JpZ2luYWxMaW5lQ291bnRcXFwiOjEsXFxcIm9yaWdpbmFsRGVsZXRlZExpbmVDb3VudFxcXCI6MSxcXFwiYXJjXFxcIjoxOSxcXFwiY3VycmVudExpbmVDb3VudFxcXCI6MSxcXFwiY3VycmVudERlbGV0ZWRMaW5lQ291bnRcXFwiOjF9Jyxcblx0XHRcdCcwNTowMTowMTAgZWRpdFRlbGVtZXRyeS5yZXBvcnRFZGl0QXJjOiB7XFxcInNvdXJjZUtleUNsZWFuZWRcXFwiOlxcXCJzb3VyY2U6Q2hhdC5hcHBseUVkaXRzXFxcIixcXFwibGFuZ3VhZ2VJZFxcXCI6XFxcInBsYWludGV4dFxcXCIsXFxcInVuaXF1ZUVkaXRJZFxcXCI6XFxcIjhjOTdiN2Q4LTlhZGItNGJkOC1hYzlmLWE1NjI3MDRjZTQwZVxcXCIsXFxcImRpZEJyYW5jaENoYW5nZVxcXCI6MCxcXFwidGltZURlbGF5TXNcXFwiOjMwMDAwMCxcXFwib3JpZ2luYWxDaGFyQ291bnRcXFwiOjM3LFxcXCJvcmlnaW5hbExpbmVDb3VudFxcXCI6MSxcXFwib3JpZ2luYWxEZWxldGVkTGluZUNvdW50XFxcIjowLFxcXCJhcmNcXFwiOjE2LFxcXCJjdXJyZW50TGluZUNvdW50XFxcIjoxLFxcXCJjdXJyZW50RGVsZXRlZExpbmVDb3VudFxcXCI6MH0nLFxuXHRcdFx0JzA1OjExOjAxMCBlZGl0VGVsZW1ldHJ5LnJlcG9ydEVkaXRBcmM6IHtcXFwic291cmNlS2V5Q2xlYW5lZFxcXCI6XFxcInNvdXJjZTpDaGF0LmFwcGx5RWRpdHNcXFwiLFxcXCJsYW5ndWFnZUlkXFxcIjpcXFwicGxhaW50ZXh0XFxcIixcXFwidW5pcXVlRWRpdElkXFxcIjpcXFwiMWViOGEzOTQtMjQ4OS00MWMyLTg1MWItNmE3OTQzMmZjNmJjXFxcIixcXFwiZGlkQnJhbmNoQ2hhbmdlXFxcIjowLFxcXCJ0aW1lRGVsYXlNc1xcXCI6MzAwMDAwLFxcXCJvcmlnaW5hbENoYXJDb3VudFxcXCI6MTksXFxcIm9yaWdpbmFsTGluZUNvdW50XFxcIjoxLFxcXCJvcmlnaW5hbERlbGV0ZWRMaW5lQ291bnRcXFwiOjEsXFxcImFyY1xcXCI6MTksXFxcImN1cnJlbnRMaW5lQ291bnRcXFwiOjEsXFxcImN1cnJlbnREZWxldGVkTGluZUNvdW50XFxcIjoxfScsXG5cdFx0XHQnMTI6MDA6MDAwIGVkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuZGV0YWlsczoge1xcXCJtb2RlXFxcIjpcXFwiMTBtaW5Gb2N1c1dpbmRvd1xcXCIsXFxcInNvdXJjZUtleVxcXCI6XFxcInNvdXJjZTpDaGF0LmFwcGx5RWRpdHNcXFwiLFxcXCJzb3VyY2VLZXlDbGVhbmVkXFxcIjpcXFwic291cmNlOkNoYXQuYXBwbHlFZGl0c1xcXCIsXFxcInRyaWdnZXJcXFwiOlxcXCJ0aW1lXFxcIixcXFwibGFuZ3VhZ2VJZFxcXCI6XFxcInBsYWludGV4dFxcXCIsXFxcInN0YXRzVXVpZFxcXCI6XFxcIjUwOWI1ZDUzLTkxMDktNDBhMi1iZGY1LTFhYTczNWEyMjlmZVxcXCIsXFxcIm1vZGlmaWVkQ291bnRcXFwiOjM1LFxcXCJkZWx0YU1vZGlmaWVkQ291bnRcXFwiOjU2LFxcXCJ0b3RhbE1vZGlmaWVkQ291bnRcXFwiOjM5fScsXG5cdFx0XHQnMTI6MDA6MDAwIGVkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuZGV0YWlsczoge1xcXCJtb2RlXFxcIjpcXFwiMTBtaW5Gb2N1c1dpbmRvd1xcXCIsXFxcInNvdXJjZUtleVxcXCI6XFxcInNvdXJjZTpjdXJzb3Ita2luZDp0eXBlXFxcIixcXFwic291cmNlS2V5Q2xlYW5lZFxcXCI6XFxcInNvdXJjZTpjdXJzb3Ita2luZDp0eXBlXFxcIixcXFwidHJpZ2dlclxcXCI6XFxcInRpbWVcXFwiLFxcXCJsYW5ndWFnZUlkXFxcIjpcXFwicGxhaW50ZXh0XFxcIixcXFwic3RhdHNVdWlkXFxcIjpcXFwiNTA5YjVkNTMtOTEwOS00MGEyLWJkZjUtMWFhNzM1YTIyOWZlXFxcIixcXFwibW9kaWZpZWRDb3VudFxcXCI6NCxcXFwiZGVsdGFNb2RpZmllZENvdW50XFxcIjo0LFxcXCJ0b3RhbE1vZGlmaWVkQ291bnRcXFwiOjM5fScsXG5cdFx0XHQnMTI6MDA6MDAwIGVkaXRUZWxlbWV0cnkuZWRpdFNvdXJjZXMuc3RhdHM6IHtcXFwibW9kZVxcXCI6XFxcIjEwbWluRm9jdXNXaW5kb3dcXFwiLFxcXCJsYW5ndWFnZUlkXFxcIjpcXFwicGxhaW50ZXh0XFxcIixcXFwic3RhdHNVdWlkXFxcIjpcXFwiNTA5YjVkNTMtOTEwOS00MGEyLWJkZjUtMWFhNzM1YTIyOWZlXFxcIixcXFwibmVzTW9kaWZpZWRDb3VudFxcXCI6MCxcXFwiaW5saW5lQ29tcGxldGlvbnNDb3BpbG90TW9kaWZpZWRDb3VudFxcXCI6MCxcXFwiaW5saW5lQ29tcGxldGlvbnNORVNNb2RpZmllZENvdW50XFxcIjowLFxcXCJvdGhlckFJTW9kaWZpZWRDb3VudFxcXCI6MzUsXFxcInVua25vd25Nb2RpZmllZENvdW50XFxcIjowLFxcXCJ1c2VyTW9kaWZpZWRDb3VudFxcXCI6NCxcXFwiaWRlTW9kaWZpZWRDb3VudFxcXCI6MCxcXFwidG90YWxNb2RpZmllZENoYXJhY3RlcnNcXFwiOjM5LFxcXCJleHRlcm5hbE1vZGlmaWVkQ291bnRcXFwiOjAsXFxcImlzVHJhY2tlZEJ5R2l0XFxcIjowLFxcXCJmb2N1c1RpbWVcXFwiOjYwMDAwMCxcXFwiYWN0dWFsVGltZVxcXCI6NzIwMDAwLFxcXCJ0cmlnZ2VyXFxcIjpcXFwidGltZVxcXCJ9Jyxcblx0XHRcdCcyMjowMDowMDAgZWRpdFRlbGVtZXRyeS5lZGl0U291cmNlcy5kZXRhaWxzOiB7XFxcIm1vZGVcXFwiOlxcXCIyMG1pbkZvY3VzV2luZG93XFxcIixcXFwic291cmNlS2V5XFxcIjpcXFwic291cmNlOkNoYXQuYXBwbHlFZGl0c1xcXCIsXFxcInNvdXJjZUtleUNsZWFuZWRcXFwiOlxcXCJzb3VyY2U6Q2hhdC5hcHBseUVkaXRzXFxcIixcXFwidHJpZ2dlclxcXCI6XFxcInRpbWVcXFwiLFxcXCJsYW5ndWFnZUlkXFxcIjpcXFwicGxhaW50ZXh0XFxcIixcXFwic3RhdHNVdWlkXFxcIjpcXFwiYTc5NDQwNmEtNzc3OS00ZTlmLWE4NTYtMWNhY2E4NTEyM2M3XFxcIixcXFwibW9kaWZpZWRDb3VudFxcXCI6MzUsXFxcImRlbHRhTW9kaWZpZWRDb3VudFxcXCI6NTYsXFxcInRvdGFsTW9kaWZpZWRDb3VudFxcXCI6Mzl9Jyxcblx0XHRcdCcyMjowMDowMDAgZWRpdFRlbGVtZXRyeS5lZGl0U291cmNlcy5kZXRhaWxzOiB7XFxcIm1vZGVcXFwiOlxcXCIyMG1pbkZvY3VzV2luZG93XFxcIixcXFwic291cmNlS2V5XFxcIjpcXFwic291cmNlOmN1cnNvci1raW5kOnR5cGVcXFwiLFxcXCJzb3VyY2VLZXlDbGVhbmVkXFxcIjpcXFwic291cmNlOmN1cnNvci1raW5kOnR5cGVcXFwiLFxcXCJ0cmlnZ2VyXFxcIjpcXFwidGltZVxcXCIsXFxcImxhbmd1YWdlSWRcXFwiOlxcXCJwbGFpbnRleHRcXFwiLFxcXCJzdGF0c1V1aWRcXFwiOlxcXCJhNzk0NDA2YS03Nzc5LTRlOWYtYTg1Ni0xY2FjYTg1MTIzYzdcXFwiLFxcXCJtb2RpZmllZENvdW50XFxcIjo0LFxcXCJkZWx0YU1vZGlmaWVkQ291bnRcXFwiOjQsXFxcInRvdGFsTW9kaWZpZWRDb3VudFxcXCI6Mzl9Jyxcblx0XHRcdCcyMjowMDowMDAgZWRpdFRlbGVtZXRyeS5lZGl0U291cmNlcy5zdGF0czoge1xcXCJtb2RlXFxcIjpcXFwiMjBtaW5Gb2N1c1dpbmRvd1xcXCIsXFxcImxhbmd1YWdlSWRcXFwiOlxcXCJwbGFpbnRleHRcXFwiLFxcXCJzdGF0c1V1aWRcXFwiOlxcXCJhNzk0NDA2YS03Nzc5LTRlOWYtYTg1Ni0xY2FjYTg1MTIzYzdcXFwiLFxcXCJuZXNNb2RpZmllZENvdW50XFxcIjowLFxcXCJpbmxpbmVDb21wbGV0aW9uc0NvcGlsb3RNb2RpZmllZENvdW50XFxcIjowLFxcXCJpbmxpbmVDb21wbGV0aW9uc05FU01vZGlmaWVkQ291bnRcXFwiOjAsXFxcIm90aGVyQUlNb2RpZmllZENvdW50XFxcIjozNSxcXFwidW5rbm93bk1vZGlmaWVkQ291bnRcXFwiOjAsXFxcInVzZXJNb2RpZmllZENvdW50XFxcIjo0LFxcXCJpZGVNb2RpZmllZENvdW50XFxcIjowLFxcXCJ0b3RhbE1vZGlmaWVkQ2hhcmFjdGVyc1xcXCI6MzksXFxcImV4dGVybmFsTW9kaWZpZWRDb3VudFxcXCI6MCxcXFwiaXNUcmFja2VkQnlHaXRcXFwiOjAsXFxcImZvY3VzVGltZVxcXCI6MTIwMDAwMCxcXFwiYWN0dWFsVGltZVxcXCI6MTMyMDAwMCxcXFwidHJpZ2dlclxcXCI6XFxcInRpbWVcXFwifSdcblx0XHRdKSk7XG5cblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pKTtcbn0pO1xuXG5mdW5jdGlvbiBmb3JtYXRUaW1lKHRpbWVNczogbnVtYmVyKTogc3RyaW5nIHtcblx0Y29uc3QgdG90YWxNcyA9IE1hdGguZmxvb3IodGltZU1zKTtcblx0Y29uc3QgbWludXRlcyA9IE1hdGguZmxvb3IodG90YWxNcyAvIDYwMDAwKTtcblx0Y29uc3Qgc2Vjb25kcyA9IE1hdGguZmxvb3IoKHRvdGFsTXMgJSA2MDAwMCkgLyAxMDAwKTtcblx0Y29uc3QgbXMgPSB0b3RhbE1zICUgMTAwMDtcblx0Y29uc3Qgc3RyID0gYCR7bWludXRlcy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyl9OiR7c2Vjb25kcy50b1N0cmluZygpLnBhZFN0YXJ0KDIsICcwJyl9OiR7bXMudG9TdHJpbmcoKS5wYWRTdGFydCgzLCAnMCcpfWA7XG5cdHJldHVybiBzdHI7XG59XG5cbmNsYXNzIERldGVybWluaXN0aWNSYW5kb21TZXJ2aWNlIGV4dGVuZHMgUmFuZG9tU2VydmljZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3JhbmQgPSBSYW5kb20uY3JlYXRlKDApO1xuXG5cdG92ZXJyaWRlIGdlbmVyYXRlVXVpZCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLl9yYW5kLm5leHRVdWlkKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZha2VBbm5vdGF0ZWREb2N1bWVudHMgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFubm90YXRlZERvY3VtZW50cyB7XG5cdHB1YmxpYyByZWFkb25seSBkb2N1bWVudHM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IEFubm90YXRlZERvY3VtZW50W10+O1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmRvY3VtZW50cyA9IGNvbnN0T2JzZXJ2YWJsZTxyZWFkb25seSBBbm5vdGF0ZWREb2N1bWVudFtdPihbXSk7XG5cdH1cbn1cblxuLyoqIENhbiBjb250YWluIFwiXHUyMjZBXCIgYW5kIFwiXHUyMjZCXCIgdG8gYWRkIGNvbnRleHQsIGUuZy4gZVx1MjI2QWxcdTIyNkIgb25seSBtYXRjaGVzIHRoZSBmaXJzdCBsIGluIGBoZWxsb2AuICovXG50eXBlIFNlYXJjaFN0cmluZyA9IHN0cmluZztcblxuZnVuY3Rpb24gZmluZE9mZnNldFJhbmdlKHN0cjogc3RyaW5nLCBzZWFyY2g6IFNlYXJjaFN0cmluZyk6IE9mZnNldFJhbmdlIHtcblx0Y29uc3Qgc3RhcnRDb250ZXh0SW5kZXggPSBzZWFyY2guaW5kZXhPZignXHUyMjZBJyk7XG5cdGNvbnN0IGVuZENvbnRleHRJbmRleCA9IHNlYXJjaC5pbmRleE9mKCdcdTIyNkInKTtcblxuXHRsZXQgc2VhcmNoU3RyOiBzdHJpbmc7XG5cdGxldCBiZWZvcmVDb250ZXh0ID0gJyc7XG5cdGxldCBhZnRlckNvbnRleHQgPSAnJztcblxuXHRpZiAoc3RhcnRDb250ZXh0SW5kZXggIT09IC0xICYmIGVuZENvbnRleHRJbmRleCAhPT0gLTEgJiYgZW5kQ29udGV4dEluZGV4ID4gc3RhcnRDb250ZXh0SW5kZXgpIHtcblx0XHRiZWZvcmVDb250ZXh0ID0gc2VhcmNoLnN1YnN0cmluZygwLCBzdGFydENvbnRleHRJbmRleCk7XG5cdFx0YWZ0ZXJDb250ZXh0ID0gc2VhcmNoLnN1YnN0cmluZyhlbmRDb250ZXh0SW5kZXggKyAxKTtcblx0XHRzZWFyY2hTdHIgPSBzZWFyY2guc3Vic3RyaW5nKHN0YXJ0Q29udGV4dEluZGV4ICsgMSwgZW5kQ29udGV4dEluZGV4KTtcblx0fSBlbHNlIHtcblx0XHRzZWFyY2hTdHIgPSBzZWFyY2g7XG5cdH1cblxuXHRjb25zdCBzdGFydEluZGV4ID0gc3RyLmluZGV4T2YoYmVmb3JlQ29udGV4dCArIHNlYXJjaFN0ciArIGFmdGVyQ29udGV4dCk7XG5cdGlmIChzdGFydEluZGV4ID09PSAtMSkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IGZpbmQgY29udGV4dCBcIiR7YmVmb3JlQ29udGV4dH1cIiArIFwiJHtzZWFyY2hTdHJ9XCIgKyBcIiR7YWZ0ZXJDb250ZXh0fVwiIGluIHN0cmluZyBcIiR7c3RyfVwiYCk7XG5cdH1cblxuXHRjb25zdCBtYXRjaFN0YXJ0ID0gc3RhcnRJbmRleCArIGJlZm9yZUNvbnRleHQubGVuZ3RoO1xuXHRyZXR1cm4gbmV3IE9mZnNldFJhbmdlKG1hdGNoU3RhcnQsIG1hdGNoU3RhcnQgKyBzZWFyY2hTdHIubGVuZ3RoKTtcbn1cblxuZXhwb3J0IGNsYXNzIE11dGFibGVPYnNlcnZhYmxlV29ya3NwYWNlIGV4dGVuZHMgT2JzZXJ2YWJsZVdvcmtzcGFjZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29wZW5Eb2N1bWVudHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSU9ic2VydmFibGVEb2N1bWVudFtdLCB7IGFkZGVkOiByZWFkb25seSBJT2JzZXJ2YWJsZURvY3VtZW50W107IHJlbW92ZWQ6IHJlYWRvbmx5IElPYnNlcnZhYmxlRG9jdW1lbnRbXSB9Pih0aGlzLCBbXSk7XG5cdHB1YmxpYyByZWFkb25seSBkb2N1bWVudHMgPSB0aGlzLl9vcGVuRG9jdW1lbnRzO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RvY3VtZW50cyA9IG5ldyBNYXA8LyogdXJpICovIHN0cmluZywgTXV0YWJsZU9ic2VydmFibGVEb2N1bWVudD4oKTtcblxuXHRjb25zdHJ1Y3RvcigpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0LyoqXG5cdCAqIERpc3Bvc2UgdG8gcmVtb3ZlLlxuXHQqL1xuXHRwdWJsaWMgY3JlYXRlRG9jdW1lbnQob3B0aW9uczogeyB1cmk6IFVSSTsgd29ya3NwYWNlUm9vdD86IFVSSTsgaW5pdGlhbFZhbHVlPzogc3RyaW5nOyBpbml0aWFsVmVyc2lvbklkPzogbnVtYmVyOyBsYW5ndWFnZUlkPzogc3RyaW5nIH0sIHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQpOiBNdXRhYmxlT2JzZXJ2YWJsZURvY3VtZW50IHtcblx0XHRhc3NlcnQoIXRoaXMuX2RvY3VtZW50cy5oYXMob3B0aW9ucy51cmkudG9TdHJpbmcoKSkpO1xuXG5cdFx0Y29uc3QgZG9jdW1lbnQgPSBuZXcgTXV0YWJsZU9ic2VydmFibGVEb2N1bWVudChcblx0XHRcdG9wdGlvbnMudXJpLFxuXHRcdFx0bmV3IFN0cmluZ1RleHQob3B0aW9ucy5pbml0aWFsVmFsdWUgPz8gJycpLFxuXHRcdFx0W10sXG5cdFx0XHRvcHRpb25zLmxhbmd1YWdlSWQgPz8gJ3BsYWludGV4dCcsXG5cdFx0XHQoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX2RvY3VtZW50cy5kZWxldGUob3B0aW9ucy51cmkudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGNvbnN0IGRvY3MgPSB0aGlzLl9vcGVuRG9jdW1lbnRzLmdldCgpO1xuXHRcdFx0XHRjb25zdCBmaWx0ZXJlZERvY3MgPSBkb2NzLmZpbHRlcihkID0+IGQudXJpLnRvU3RyaW5nKCkgIT09IGRvY3VtZW50LnVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0aWYgKGZpbHRlcmVkRG9jcy5sZW5ndGggIT09IGRvY3MubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5fb3BlbkRvY3VtZW50cy5zZXQoZmlsdGVyZWREb2NzLCB0eCwgeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtkb2N1bWVudF0gfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRvcHRpb25zLmluaXRpYWxWZXJzaW9uSWQgPz8gMCxcblx0XHRcdG9wdGlvbnMud29ya3NwYWNlUm9vdCxcblx0XHQpO1xuXG5cdFx0dGhpcy5fZG9jdW1lbnRzLnNldChvcHRpb25zLnVyaS50b1N0cmluZygpLCBkb2N1bWVudCk7XG5cdFx0dGhpcy5fb3BlbkRvY3VtZW50cy5zZXQoWy4uLnRoaXMuX29wZW5Eb2N1bWVudHMuZ2V0KCksIGRvY3VtZW50XSwgdHgsIHsgYWRkZWQ6IFtkb2N1bWVudF0sIHJlbW92ZWQ6IFtdIH0pO1xuXG5cdFx0cmV0dXJuIGRvY3VtZW50O1xuXHR9XG5cblx0cHVibGljIG92ZXJyaWRlIGdldERvY3VtZW50KGlkOiBVUkkpOiBNdXRhYmxlT2JzZXJ2YWJsZURvY3VtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZG9jdW1lbnRzLmdldChpZC50b1N0cmluZygpKTtcblx0fVxuXG5cdHB1YmxpYyBjbGVhcigpOiB2b2lkIHtcblx0XHR0aGlzLl9vcGVuRG9jdW1lbnRzLnNldChbXSwgdW5kZWZpbmVkLCB7IGFkZGVkOiBbXSwgcmVtb3ZlZDogdGhpcy5fb3BlbkRvY3VtZW50cy5nZXQoKSB9KTtcblx0XHRmb3IgKGNvbnN0IGRvYyBvZiB0aGlzLl9kb2N1bWVudHMudmFsdWVzKCkpIHtcblx0XHRcdGRvYy5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX2RvY3VtZW50cy5jbGVhcigpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBNdXRhYmxlT2JzZXJ2YWJsZURvY3VtZW50IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElPYnNlcnZhYmxlRG9jdW1lbnQge1xuXHRwcml2YXRlIHJlYWRvbmx5IF92YWx1ZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxTdHJpbmdUZXh0LCBTdHJpbmdFZGl0V2l0aFJlYXNvbj47XG5cdHB1YmxpYyBnZXQgdmFsdWUoKTogSU9ic2VydmFibGVXaXRoQ2hhbmdlPFN0cmluZ1RleHQsIFN0cmluZ0VkaXRXaXRoUmVhc29uPiB7IHJldHVybiB0aGlzLl92YWx1ZTsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlbGVjdGlvbjogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBPZmZzZXRSYW5nZVtdPjtcblx0cHVibGljIGdldCBzZWxlY3Rpb24oKTogSU9ic2VydmFibGU8cmVhZG9ubHkgT2Zmc2V0UmFuZ2VbXT4geyByZXR1cm4gdGhpcy5fc2VsZWN0aW9uOyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfdmlzaWJsZVJhbmdlczogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBPZmZzZXRSYW5nZVtdPjtcblx0cHVibGljIGdldCB2aXNpYmxlUmFuZ2VzKCk6IElPYnNlcnZhYmxlPHJlYWRvbmx5IE9mZnNldFJhbmdlW10+IHsgcmV0dXJuIHRoaXMuX3Zpc2libGVSYW5nZXM7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZUlkOiBJU2V0dGFibGVPYnNlcnZhYmxlPHN0cmluZz47XG5cdHB1YmxpYyBnZXQgbGFuZ3VhZ2VJZCgpOiBJT2JzZXJ2YWJsZTxzdHJpbmc+IHsgcmV0dXJuIHRoaXMuX2xhbmd1YWdlSWQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF92ZXJzaW9uOiBJU2V0dGFibGVPYnNlcnZhYmxlPG51bWJlcj47XG5cdHB1YmxpYyBnZXQgdmVyc2lvbigpOiBJT2JzZXJ2YWJsZTxudW1iZXI+IHsgcmV0dXJuIHRoaXMuX3ZlcnNpb247IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwdWJsaWMgcmVhZG9ubHkgdXJpOiBVUkksXG5cdFx0dmFsdWU6IFN0cmluZ1RleHQsXG5cdFx0c2VsZWN0aW9uOiByZWFkb25seSBPZmZzZXRSYW5nZVtdLFxuXHRcdGxhbmd1YWdlSWQ6IHN0cmluZyxcblx0XHRvbkRpc3Bvc2U6ICgpID0+IHZvaWQsXG5cdFx0dmVyc2lvbklkOiBudW1iZXIsXG5cdFx0cHVibGljIHJlYWRvbmx5IHdvcmtzcGFjZVJvb3Q6IFVSSSB8IHVuZGVmaW5lZCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3ZhbHVlID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIHZhbHVlKTtcblx0XHR0aGlzLl9zZWxlY3Rpb24gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgc2VsZWN0aW9uKTtcblx0XHR0aGlzLl92aXNpYmxlUmFuZ2VzID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIFtdKTtcblx0XHR0aGlzLl9sYW5ndWFnZUlkID0gb2JzZXJ2YWJsZVZhbHVlKHRoaXMsIGxhbmd1YWdlSWQpO1xuXHRcdHRoaXMuX3ZlcnNpb24gPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgdmVyc2lvbklkKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZShvbkRpc3Bvc2UpKTtcblx0fVxuXG5cdHNldFNlbGVjdGlvbihzZWxlY3Rpb246IHJlYWRvbmx5IE9mZnNldFJhbmdlW10sIHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl9zZWxlY3Rpb24uc2V0KHNlbGVjdGlvbiwgdHgpO1xuXHR9XG5cblx0c2V0VmlzaWJsZVJhbmdlKHZpc2libGVSYW5nZXM6IHJlYWRvbmx5IE9mZnNldFJhbmdlW10sIHR4OiBJVHJhbnNhY3Rpb24gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLl92aXNpYmxlUmFuZ2VzLnNldCh2aXNpYmxlUmFuZ2VzLCB0eCk7XG5cdH1cblxuXHRhcHBseUVkaXQoZWRpdDogU3RyaW5nRWRpdCB8IFN0cmluZ0VkaXRXaXRoUmVhc29uLCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLCBuZXdWZXJzaW9uOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdWYWx1ZSA9IGVkaXQuYXBwbHlPblRleHQodGhpcy52YWx1ZS5nZXQoKSk7XG5cdFx0Y29uc3QgZSA9IGVkaXQgaW5zdGFuY2VvZiBTdHJpbmdFZGl0V2l0aFJlYXNvbiA/IGVkaXQgOiBuZXcgU3RyaW5nRWRpdFdpdGhSZWFzb24oZWRpdC5yZXBsYWNlbWVudHMsIEVkaXRTb3VyY2VzLnVua25vd24oe30pKTtcblx0XHRzdWJ0cmFuc2FjdGlvbih0eCwgdHggPT4ge1xuXHRcdFx0dGhpcy5fdmFsdWUuc2V0KG5ld1ZhbHVlLCB0eCwgZSk7XG5cdFx0XHR0aGlzLl92ZXJzaW9uLnNldChuZXdWZXJzaW9uID8/IHRoaXMuX3ZlcnNpb24uZ2V0KCkgKyAxLCB0eCk7XG5cdFx0fSk7XG5cdH1cblxuXHR1cGRhdGVTZWxlY3Rpb24oc2VsZWN0aW9uOiByZWFkb25seSBPZmZzZXRSYW5nZVtdLCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VsZWN0aW9uLnNldChzZWxlY3Rpb24sIHR4KTtcblx0fVxuXG5cdHNldFZhbHVlKHZhbHVlOiBTdHJpbmdUZXh0LCB0eDogSVRyYW5zYWN0aW9uIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkLCBuZXdWZXJzaW9uOiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCByZWFzb24gPSBFZGl0U291cmNlcy51bmtub3duKHt9KTtcblx0XHRjb25zdCBlID0gbmV3IFN0cmluZ0VkaXRXaXRoUmVhc29uKFtTdHJpbmdSZXBsYWNlbWVudC5yZXBsYWNlKG5ldyBPZmZzZXRSYW5nZSgwLCB0aGlzLnZhbHVlLmdldCgpLnZhbHVlLmxlbmd0aCksIHZhbHVlLnZhbHVlKV0sIHJlYXNvbik7XG5cdFx0c3VidHJhbnNhY3Rpb24odHgsIHR4ID0+IHtcblx0XHRcdHRoaXMuX3ZhbHVlLnNldCh2YWx1ZSwgdHgsIGUpO1xuXHRcdFx0dGhpcy5fdmVyc2lvbi5zZXQobmV3VmVyc2lvbiA/PyB0aGlzLl92ZXJzaW9uLmdldCgpICsgMSwgdHgpO1xuXHRcdH0pO1xuXHR9XG5cblx0ZmluZFJhbmdlKHNlYXJjaDogU2VhcmNoU3RyaW5nKTogT2Zmc2V0UmFuZ2Uge1xuXHRcdHJldHVybiBmaW5kT2Zmc2V0UmFuZ2UodGhpcy52YWx1ZS5nZXQoKS52YWx1ZSwgc2VhcmNoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsWUFBWSxpQkFBaUIsb0JBQW9CO0FBQzFELFNBQVMsaUJBQXdGLGlCQUFpQixzQkFBc0I7QUFDeEksU0FBUyxXQUFXO0FBQ3BCLFNBQXFCLHlCQUF5QjtBQUM5QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUE0QixvQkFBeUMsNkJBQTZCO0FBQ2xHLFNBQThCLHFCQUFxQiw0QkFBNEI7QUFDL0UsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsY0FBYztBQUN2QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGdCQUFnQixxQkFBcUI7QUFDOUMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxzQkFBc0IsK0JBQStCO0FBQzlELFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsYUFBYSxzQkFBc0I7QUFDNUMsU0FBUyx3QkFBd0I7QUFFakMsTUFBTSxrQkFBa0IsTUFBTTtBQUM3QiwwQ0FBd0M7QUFFeEMsT0FBSyxLQUFLLFlBQVksbUJBQW1CLENBQUMsR0FBRyxZQUFZO0FBQ3hELFVBQU0sY0FBYyxJQUFJLGdCQUFnQjtBQUN4QyxVQUFNLHVCQUF1QixZQUFZLElBQUksSUFBSSx5QkFBeUIsSUFBSTtBQUFBLE1BQzdFLENBQUMseUJBQXlCLElBQUksZUFBZSwwQkFBMEIsQ0FBQztBQUFBLE1BQ3hFLENBQUMsdUJBQXVCLElBQUks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
