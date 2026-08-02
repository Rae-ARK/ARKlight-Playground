import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ExtHostDocuments } from "../../common/extHostDocuments.js";
import { ExtHostDocumentsAndEditors } from "../../common/extHostDocumentsAndEditors.js";
import { TextDocumentSaveReason, TextEdit, Position, EndOfLine } from "../../common/extHostTypes.js";
import { ExtHostDocumentSaveParticipant } from "../../common/extHostDocumentSaveParticipant.js";
import { SingleProxyRPCProtocol } from "../common/testRPCProtocol.js";
import { SaveReason } from "../../../common/editor.js";
import { mock } from "../../../../base/test/common/mock.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { nullExtensionDescription } from "../../../services/extensions/common/extensions.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
function timeout(n) {
  return new Promise((resolve) => setTimeout(resolve, n));
}
suite("ExtHostDocumentSaveParticipant", () => {
  const resource = URI.parse("foo:bar");
  const mainThreadBulkEdits = new class extends mock() {
  }();
  let documents;
  const nullLogService = new NullLogService();
  setup(() => {
    const documentsAndEditors = new ExtHostDocumentsAndEditors(SingleProxyRPCProtocol(null), new NullLogService());
    documentsAndEditors.$acceptDocumentsAndEditorsDelta({
      addedDocuments: [{
        isDirty: false,
        languageId: "foo",
        uri: resource,
        versionId: 1,
        lines: ["foo"],
        EOL: "\n",
        encoding: "utf8"
      }]
    });
    documents = new ExtHostDocuments(SingleProxyRPCProtocol(null), documentsAndEditors);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("no listeners, no problem", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => assert.ok(true));
  });
  test("event delivery", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    let event;
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      event = e;
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      sub.dispose();
      assert.ok(event);
      assert.strictEqual(event.reason, TextDocumentSaveReason.Manual);
      assert.strictEqual(typeof event.waitUntil, "function");
    });
  });
  test("event delivery, immutable", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    let event;
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      event = e;
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      sub.dispose();
      assert.ok(event);
      assert.throws(() => {
        event.document = null;
      });
    });
  });
  test("event delivery, bad listener", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      throw new Error("\u{1F480}");
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then((values) => {
      sub.dispose();
      const [first] = values;
      assert.strictEqual(first, false);
    });
  });
  test("event delivery, bad listener doesn't prevent more events", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      throw new Error("\u{1F480}");
    });
    let event;
    const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      event = e;
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      sub1.dispose();
      sub2.dispose();
      assert.ok(event);
    });
  });
  test("event delivery, in subscriber order", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    let counter = 0;
    const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      assert.strictEqual(counter++, 0);
    });
    const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      assert.strictEqual(counter++, 1);
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      sub1.dispose();
      sub2.dispose();
    });
  });
  test("event delivery, ignore bad listeners", async () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits, { timeout: 5, errors: 1 });
    let callCount = 0;
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      callCount += 1;
      throw new Error("boom");
    });
    await participant.$participateInSave(resource, SaveReason.EXPLICIT);
    await participant.$participateInSave(resource, SaveReason.EXPLICIT);
    await participant.$participateInSave(resource, SaveReason.EXPLICIT);
    await participant.$participateInSave(resource, SaveReason.EXPLICIT);
    sub.dispose();
    assert.strictEqual(callCount, 2);
  });
  test("event delivery, overall timeout", async function() {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits, { timeout: 20, errors: 5 });
    const calls = [];
    const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      calls.push(1);
    });
    const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      calls.push(2);
      event.waitUntil(timeout(100));
    });
    const sub3 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      calls.push(3);
    });
    const values = await participant.$participateInSave(resource, SaveReason.EXPLICIT);
    sub1.dispose();
    sub2.dispose();
    sub3.dispose();
    assert.deepStrictEqual(calls, [1, 2]);
    assert.strictEqual(values.length, 2);
  });
  test("event delivery, waitUntil", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      event.waitUntil(timeout(10));
      event.waitUntil(timeout(10));
      event.waitUntil(timeout(10));
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      sub.dispose();
    });
  });
  test("event delivery, waitUntil must be called sync", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      event.waitUntil(new Promise((resolve, reject) => {
        setTimeout(() => {
          try {
            assert.throws(() => event.waitUntil(timeout(10)));
            resolve(void 0);
          } catch (e) {
            reject(e);
          }
        }, 10);
      }));
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      sub.dispose();
    });
  });
  test("event delivery, waitUntil will timeout", function() {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits, { timeout: 5, errors: 3 });
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(event) {
      event.waitUntil(timeout(100));
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then((values) => {
      sub.dispose();
      const [first] = values;
      assert.strictEqual(first, false);
    });
  });
  test("event delivery, waitUntil failure handling", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, mainThreadBulkEdits);
    const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      e.waitUntil(Promise.reject(new Error("dddd")));
    });
    let event;
    const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      event = e;
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      assert.ok(event);
      sub1.dispose();
      sub2.dispose();
    });
  });
  test("event delivery, pushEdits sync", () => {
    let dto;
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, new class extends mock() {
      $tryApplyWorkspaceEdit(_edits) {
        dto = _edits.value;
        return Promise.resolve(true);
      }
    }());
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      e.waitUntil(Promise.resolve([TextEdit.insert(new Position(0, 0), "bar")]));
      e.waitUntil(Promise.resolve([TextEdit.setEndOfLine(EndOfLine.CRLF)]));
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      sub.dispose();
      assert.strictEqual(dto.edits.length, 2);
      assert.ok(dto.edits[0].textEdit);
      assert.ok(dto.edits[1].textEdit);
    });
  });
  test("event delivery, concurrent change", () => {
    let edits;
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, new class extends mock() {
      $tryApplyWorkspaceEdit(_edits) {
        edits = _edits.value;
        return Promise.resolve(true);
      }
    }());
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      documents.$acceptModelChanged(resource, {
        changes: [{
          range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
          rangeOffset: void 0,
          rangeLength: void 0,
          text: "bar"
        }],
        eol: void 0,
        versionId: 2,
        isRedoing: false,
        isUndoing: false,
        detailedReason: void 0,
        isFlush: false,
        isEolChange: false
      }, true);
      e.waitUntil(Promise.resolve([TextEdit.insert(new Position(0, 0), "bar")]));
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then((values) => {
      sub.dispose();
      assert.strictEqual(edits, void 0);
      assert.strictEqual(values[0], false);
    });
  });
  test("event delivery, two listeners -> two document states", () => {
    const participant = new ExtHostDocumentSaveParticipant(nullLogService, documents, new class extends mock() {
      $tryApplyWorkspaceEdit(dto) {
        for (const edit of dto.value.edits) {
          const uri = URI.revive(edit.resource);
          const { text, range } = edit.textEdit;
          documents.$acceptModelChanged(uri, {
            changes: [{
              range,
              text,
              rangeOffset: void 0,
              rangeLength: void 0
            }],
            eol: void 0,
            versionId: documents.getDocumentData(uri).version + 1,
            isRedoing: false,
            isUndoing: false,
            detailedReason: void 0,
            isFlush: false,
            isEolChange: false
          }, true);
        }
        return Promise.resolve(true);
      }
    }());
    const document = documents.getDocument(resource);
    const sub1 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      assert.strictEqual(document.version, 1);
      assert.strictEqual(document.getText(), "foo");
      e.waitUntil(Promise.resolve([TextEdit.insert(new Position(0, 0), "bar")]));
    });
    const sub2 = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      assert.strictEqual(document.version, 2);
      assert.strictEqual(document.getText(), "barfoo");
      e.waitUntil(Promise.resolve([TextEdit.insert(new Position(0, 0), "bar")]));
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then((values) => {
      sub1.dispose();
      sub2.dispose();
      assert.strictEqual(document.version, 3);
      assert.strictEqual(document.getText(), "barbarfoo");
    });
  });
  test("Log failing listener", function() {
    let didLogSomething = false;
    const participant = new ExtHostDocumentSaveParticipant(new class extends NullLogService {
      error(message, ...args) {
        didLogSomething = true;
      }
    }(), documents, mainThreadBulkEdits);
    const sub = participant.getOnWillSaveTextDocumentEvent(nullExtensionDescription)(function(e) {
      throw new Error("boom");
    });
    return participant.$participateInSave(resource, SaveReason.EXPLICIT).then(() => {
      sub.dispose();
      assert.strictEqual(didLogSomething, true);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9hcGkvdGVzdC9icm93c2VyL2V4dEhvc3REb2N1bWVudFNhdmVQYXJ0aWNpcGFudC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3REb2N1bWVudHMuanMnO1xuaW1wb3J0IHsgRXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdERvY3VtZW50c0FuZEVkaXRvcnMuanMnO1xuaW1wb3J0IHsgVGV4dERvY3VtZW50U2F2ZVJlYXNvbiwgVGV4dEVkaXQsIFBvc2l0aW9uLCBFbmRPZkxpbmUgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRUZXh0RWRpdG9yc1NoYXBlLCBJV29ya3NwYWNlRWRpdER0bywgSVdvcmtzcGFjZVRleHRFZGl0RHRvLCBNYWluVGhyZWFkQnVsa0VkaXRzU2hhcGUgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdC5wcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50LmpzJztcbmltcG9ydCB7IFNpbmdsZVByb3h5UlBDUHJvdG9jb2wgfSBmcm9tICcuLi9jb21tb24vdGVzdFJQQ1Byb3RvY29sLmpzJztcbmltcG9ydCB7IFNhdmVSZWFzb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZWRpdG9yLmpzJztcbmltcG9ydCB0eXBlICogYXMgdnNjb2RlIGZyb20gJ3ZzY29kZSc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vcHJveHlJZGVudGlmaWVyLmpzJztcblxuZnVuY3Rpb24gdGltZW91dChuOiBudW1iZXIpIHtcblx0cmV0dXJuIG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCBuKSk7XG59XG5cbnN1aXRlKCdFeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQnLCAoKSA9PiB7XG5cblx0Y29uc3QgcmVzb3VyY2UgPSBVUkkucGFyc2UoJ2ZvbzpiYXInKTtcblx0Y29uc3QgbWFpblRocmVhZEJ1bGtFZGl0cyA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZEJ1bGtFZGl0c1NoYXBlPigpIHsgfTtcblx0bGV0IGRvY3VtZW50czogRXh0SG9zdERvY3VtZW50cztcblx0Y29uc3QgbnVsbExvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3QgZG9jdW1lbnRzQW5kRWRpdG9ycyA9IG5ldyBFeHRIb3N0RG9jdW1lbnRzQW5kRWRpdG9ycyhTaW5nbGVQcm94eVJQQ1Byb3RvY29sKG51bGwpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0ZG9jdW1lbnRzQW5kRWRpdG9ycy4kYWNjZXB0RG9jdW1lbnRzQW5kRWRpdG9yc0RlbHRhKHtcblx0XHRcdGFkZGVkRG9jdW1lbnRzOiBbe1xuXHRcdFx0XHRpc0RpcnR5OiBmYWxzZSxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogJ2ZvbycsXG5cdFx0XHRcdHVyaTogcmVzb3VyY2UsXG5cdFx0XHRcdHZlcnNpb25JZDogMSxcblx0XHRcdFx0bGluZXM6IFsnZm9vJ10sXG5cdFx0XHRcdEVPTDogJ1xcbicsXG5cdFx0XHRcdGVuY29kaW5nOiAndXRmOCdcblx0XHRcdH1dXG5cdFx0fSk7XG5cdFx0ZG9jdW1lbnRzID0gbmV3IEV4dEhvc3REb2N1bWVudHMoU2luZ2xlUHJveHlSUENQcm90b2NvbChudWxsKSwgZG9jdW1lbnRzQW5kRWRpdG9ycyk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ25vIGxpc3RlbmVycywgbm8gcHJvYmxlbScsICgpID0+IHtcblx0XHRjb25zdCBwYXJ0aWNpcGFudCA9IG5ldyBFeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQobnVsbExvZ1NlcnZpY2UsIGRvY3VtZW50cywgbWFpblRocmVhZEJ1bGtFZGl0cyk7XG5cdFx0cmV0dXJuIHBhcnRpY2lwYW50LiRwYXJ0aWNpcGF0ZUluU2F2ZShyZXNvdXJjZSwgU2F2ZVJlYXNvbi5FWFBMSUNJVCkudGhlbigoKSA9PiBhc3NlcnQub2sodHJ1ZSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdldmVudCBkZWxpdmVyeScsICgpID0+IHtcblx0XHRjb25zdCBwYXJ0aWNpcGFudCA9IG5ldyBFeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQobnVsbExvZ1NlcnZpY2UsIGRvY3VtZW50cywgbWFpblRocmVhZEJ1bGtFZGl0cyk7XG5cblx0XHRsZXQgZXZlbnQ6IHZzY29kZS5UZXh0RG9jdW1lbnRXaWxsU2F2ZUV2ZW50O1xuXHRcdGNvbnN0IHN1YiA9IHBhcnRpY2lwYW50LmdldE9uV2lsbFNhdmVUZXh0RG9jdW1lbnRFdmVudChudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24pKGZ1bmN0aW9uIChlKSB7XG5cdFx0XHRldmVudCA9IGU7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcGFydGljaXBhbnQuJHBhcnRpY2lwYXRlSW5TYXZlKHJlc291cmNlLCBTYXZlUmVhc29uLkVYUExJQ0lUKS50aGVuKCgpID0+IHtcblx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cblx0XHRcdGFzc2VydC5vayhldmVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQucmVhc29uLCBUZXh0RG9jdW1lbnRTYXZlUmVhc29uLk1hbnVhbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIGV2ZW50LndhaXRVbnRpbCwgJ2Z1bmN0aW9uJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IGRlbGl2ZXJ5LCBpbW11dGFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydGljaXBhbnQgPSBuZXcgRXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50KG51bGxMb2dTZXJ2aWNlLCBkb2N1bWVudHMsIG1haW5UaHJlYWRCdWxrRWRpdHMpO1xuXG5cdFx0bGV0IGV2ZW50OiB2c2NvZGUuVGV4dERvY3VtZW50V2lsbFNhdmVFdmVudDtcblx0XHRjb25zdCBzdWIgPSBwYXJ0aWNpcGFudC5nZXRPbldpbGxTYXZlVGV4dERvY3VtZW50RXZlbnQobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uKShmdW5jdGlvbiAoZSkge1xuXHRcdFx0ZXZlbnQgPSBlO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHBhcnRpY2lwYW50LiRwYXJ0aWNpcGF0ZUluU2F2ZShyZXNvdXJjZSwgU2F2ZVJlYXNvbi5FWFBMSUNJVCkudGhlbigoKSA9PiB7XG5cdFx0XHRzdWIuZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQub2soZXZlbnQpO1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHsgKGV2ZW50LmRvY3VtZW50IGFzIGFueSkgPSBudWxsITsgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IGRlbGl2ZXJ5LCBiYWQgbGlzdGVuZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydGljaXBhbnQgPSBuZXcgRXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50KG51bGxMb2dTZXJ2aWNlLCBkb2N1bWVudHMsIG1haW5UaHJlYWRCdWxrRWRpdHMpO1xuXG5cdFx0Y29uc3Qgc3ViID0gcGFydGljaXBhbnQuZ2V0T25XaWxsU2F2ZVRleHREb2N1bWVudEV2ZW50KG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbikoZnVuY3Rpb24gKGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignXHVEODNEXHVEQzgwJyk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcGFydGljaXBhbnQuJHBhcnRpY2lwYXRlSW5TYXZlKHJlc291cmNlLCBTYXZlUmVhc29uLkVYUExJQ0lUKS50aGVuKHZhbHVlcyA9PiB7XG5cdFx0XHRzdWIuZGlzcG9zZSgpO1xuXG5cdFx0XHRjb25zdCBbZmlyc3RdID0gdmFsdWVzO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LCBmYWxzZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IGRlbGl2ZXJ5LCBiYWQgbGlzdGVuZXIgZG9lc25cXCd0IHByZXZlbnQgbW9yZSBldmVudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydGljaXBhbnQgPSBuZXcgRXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50KG51bGxMb2dTZXJ2aWNlLCBkb2N1bWVudHMsIG1haW5UaHJlYWRCdWxrRWRpdHMpO1xuXG5cdFx0Y29uc3Qgc3ViMSA9IHBhcnRpY2lwYW50LmdldE9uV2lsbFNhdmVUZXh0RG9jdW1lbnRFdmVudChudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24pKGZ1bmN0aW9uIChlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1x1RDgzRFx1REM4MCcpO1xuXHRcdH0pO1xuXHRcdGxldCBldmVudDogdnNjb2RlLlRleHREb2N1bWVudFdpbGxTYXZlRXZlbnQ7XG5cdFx0Y29uc3Qgc3ViMiA9IHBhcnRpY2lwYW50LmdldE9uV2lsbFNhdmVUZXh0RG9jdW1lbnRFdmVudChudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24pKGZ1bmN0aW9uIChlKSB7XG5cdFx0XHRldmVudCA9IGU7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcGFydGljaXBhbnQuJHBhcnRpY2lwYXRlSW5TYXZlKHJlc291cmNlLCBTYXZlUmVhc29uLkVYUExJQ0lUKS50aGVuKCgpID0+IHtcblx0XHRcdHN1YjEuZGlzcG9zZSgpO1xuXHRcdFx0c3ViMi5kaXNwb3NlKCk7XG5cblx0XHRcdGFzc2VydC5vayhldmVudCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IGRlbGl2ZXJ5LCBpbiBzdWJzY3JpYmVyIG9yZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnRpY2lwYW50ID0gbmV3IEV4dEhvc3REb2N1bWVudFNhdmVQYXJ0aWNpcGFudChudWxsTG9nU2VydmljZSwgZG9jdW1lbnRzLCBtYWluVGhyZWFkQnVsa0VkaXRzKTtcblxuXHRcdGxldCBjb3VudGVyID0gMDtcblx0XHRjb25zdCBzdWIxID0gcGFydGljaXBhbnQuZ2V0T25XaWxsU2F2ZVRleHREb2N1bWVudEV2ZW50KG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbikoZnVuY3Rpb24gKGV2ZW50KSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnRlcisrLCAwKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHN1YjIgPSBwYXJ0aWNpcGFudC5nZXRPbldpbGxTYXZlVGV4dERvY3VtZW50RXZlbnQobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uKShmdW5jdGlvbiAoZXZlbnQpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudGVyKyssIDEpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHBhcnRpY2lwYW50LiRwYXJ0aWNpcGF0ZUluU2F2ZShyZXNvdXJjZSwgU2F2ZVJlYXNvbi5FWFBMSUNJVCkudGhlbigoKSA9PiB7XG5cdFx0XHRzdWIxLmRpc3Bvc2UoKTtcblx0XHRcdHN1YjIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdldmVudCBkZWxpdmVyeSwgaWdub3JlIGJhZCBsaXN0ZW5lcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydGljaXBhbnQgPSBuZXcgRXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50KG51bGxMb2dTZXJ2aWNlLCBkb2N1bWVudHMsIG1haW5UaHJlYWRCdWxrRWRpdHMsIHsgdGltZW91dDogNSwgZXJyb3JzOiAxIH0pO1xuXG5cdFx0bGV0IGNhbGxDb3VudCA9IDA7XG5cdFx0Y29uc3Qgc3ViID0gcGFydGljaXBhbnQuZ2V0T25XaWxsU2F2ZVRleHREb2N1bWVudEV2ZW50KG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbikoZnVuY3Rpb24gKGV2ZW50KSB7XG5cdFx0XHRjYWxsQ291bnQgKz0gMTtcblx0XHRcdHRocm93IG5ldyBFcnJvcignYm9vbScpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgcGFydGljaXBhbnQuJHBhcnRpY2lwYXRlSW5TYXZlKHJlc291cmNlLCBTYXZlUmVhc29uLkVYUExJQ0lUKTtcblx0XHRhd2FpdCBwYXJ0aWNpcGFudC4kcGFydGljaXBhdGVJblNhdmUocmVzb3VyY2UsIFNhdmVSZWFzb24uRVhQTElDSVQpO1xuXHRcdGF3YWl0IHBhcnRpY2lwYW50LiRwYXJ0aWNpcGF0ZUluU2F2ZShyZXNvdXJjZSwgU2F2ZVJlYXNvbi5FWFBMSUNJVCk7XG5cdFx0YXdhaXQgcGFydGljaXBhbnQuJHBhcnRpY2lwYXRlSW5TYXZlKHJlc291cmNlLCBTYXZlUmVhc29uLkVYUExJQ0lUKTtcblxuXHRcdHN1Yi5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxDb3VudCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IGRlbGl2ZXJ5LCBvdmVyYWxsIHRpbWVvdXQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgcGFydGljaXBhbnQgPSBuZXcgRXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50KG51bGxMb2dTZXJ2aWNlLCBkb2N1bWVudHMsIG1haW5UaHJlYWRCdWxrRWRpdHMsIHsgdGltZW91dDogMjAsIGVycm9yczogNSB9KTtcblxuXHRcdC8vIGxldCBjYWxsQ291bnQgPSAwO1xuXHRcdGNvbnN0IGNhbGxzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IHN1YjEgPSBwYXJ0aWNpcGFudC5nZXRPbldpbGxTYXZlVGV4dERvY3VtZW50RXZlbnQobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uKShmdW5jdGlvbiAoZXZlbnQpIHtcblx0XHRcdGNhbGxzLnB1c2goMSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzdWIyID0gcGFydGljaXBhbnQuZ2V0T25XaWxsU2F2ZVRleHREb2N1bWVudEV2ZW50KG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbikoZnVuY3Rpb24gKGV2ZW50KSB7XG5cdFx0XHRjYWxscy5wdXNoKDIpO1xuXHRcdFx0ZXZlbnQud2FpdFVudGlsKHRpbWVvdXQoMTAwKSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzdWIzID0gcGFydGljaXBhbnQuZ2V0T25XaWxsU2F2ZVRleHREb2N1bWVudEV2ZW50KG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbikoZnVuY3Rpb24gKGV2ZW50KSB7XG5cdFx0XHRjYWxscy5wdXNoKDMpO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdmFsdWVzID0gYXdhaXQgcGFydGljaXBhbnQuJHBhcnRpY2lwYXRlSW5TYXZlKHJlc291cmNlLCBTYXZlUmVhc29uLkVYUExJQ0lUKTtcblx0XHRzdWIxLmRpc3Bvc2UoKTtcblx0XHRzdWIyLmRpc3Bvc2UoKTtcblx0XHRzdWIzLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbMSwgMl0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXMubGVuZ3RoLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgZGVsaXZlcnksIHdhaXRVbnRpbCcsICgpID0+IHtcblx0XHRjb25zdCBwYXJ0aWNpcGFudCA9IG5ldyBFeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQobnVsbExvZ1NlcnZpY2UsIGRvY3VtZW50cywgbWFpblRocmVhZEJ1bGtFZGl0cyk7XG5cblx0XHRjb25zdCBzdWIgPSBwYXJ0aWNpcGFudC5nZXRPbldpbGxTYXZlVGV4dERvY3VtZW50RXZlbnQobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uKShmdW5jdGlvbiAoZXZlbnQpIHtcblxuXHRcdFx0ZXZlbnQud2FpdFVudGlsKHRpbWVvdXQoMTApKTtcblx0XHRcdGV2ZW50LndhaXRVbnRpbCh0aW1lb3V0KDEwKSk7XG5cdFx0XHRldmVudC53YWl0VW50aWwodGltZW91dCgxMCkpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHBhcnRpY2lwYW50LiRwYXJ0aWNpcGF0ZUluU2F2ZShyZXNvdXJjZSwgU2F2ZVJlYXNvbi5FWFBMSUNJVCkudGhlbigoKSA9PiB7XG5cdFx0XHRzdWIuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IGRlbGl2ZXJ5LCB3YWl0VW50aWwgbXVzdCBiZSBjYWxsZWQgc3luYycsICgpID0+IHtcblx0XHRjb25zdCBwYXJ0aWNpcGFudCA9IG5ldyBFeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQobnVsbExvZ1NlcnZpY2UsIGRvY3VtZW50cywgbWFpblRocmVhZEJ1bGtFZGl0cyk7XG5cblx0XHRjb25zdCBzdWIgPSBwYXJ0aWNpcGFudC5nZXRPbldpbGxTYXZlVGV4dERvY3VtZW50RXZlbnQobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uKShmdW5jdGlvbiAoZXZlbnQpIHtcblxuXHRcdFx0ZXZlbnQud2FpdFVudGlsKG5ldyBQcm9taXNlPHVuZGVmaW5lZD4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBldmVudC53YWl0VW50aWwodGltZW91dCgxMCkpKTtcblx0XHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHRyZWplY3QoZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdH0sIDEwKTtcblx0XHRcdH0pKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwYXJ0aWNpcGFudC4kcGFydGljaXBhdGVJblNhdmUocmVzb3VyY2UsIFNhdmVSZWFzb24uRVhQTElDSVQpLnRoZW4oKCkgPT4ge1xuXHRcdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXZlbnQgZGVsaXZlcnksIHdhaXRVbnRpbCB3aWxsIHRpbWVvdXQnLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRjb25zdCBwYXJ0aWNpcGFudCA9IG5ldyBFeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQobnVsbExvZ1NlcnZpY2UsIGRvY3VtZW50cywgbWFpblRocmVhZEJ1bGtFZGl0cywgeyB0aW1lb3V0OiA1LCBlcnJvcnM6IDMgfSk7XG5cblx0XHRjb25zdCBzdWIgPSBwYXJ0aWNpcGFudC5nZXRPbldpbGxTYXZlVGV4dERvY3VtZW50RXZlbnQobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uKShmdW5jdGlvbiAoZXZlbnQpIHtcblx0XHRcdGV2ZW50LndhaXRVbnRpbCh0aW1lb3V0KDEwMCkpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHBhcnRpY2lwYW50LiRwYXJ0aWNpcGF0ZUluU2F2ZShyZXNvdXJjZSwgU2F2ZVJlYXNvbi5FWFBMSUNJVCkudGhlbih2YWx1ZXMgPT4ge1xuXHRcdFx0c3ViLmRpc3Bvc2UoKTtcblxuXHRcdFx0Y29uc3QgW2ZpcnN0XSA9IHZhbHVlcztcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdCwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdldmVudCBkZWxpdmVyeSwgd2FpdFVudGlsIGZhaWx1cmUgaGFuZGxpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGFydGljaXBhbnQgPSBuZXcgRXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50KG51bGxMb2dTZXJ2aWNlLCBkb2N1bWVudHMsIG1haW5UaHJlYWRCdWxrRWRpdHMpO1xuXG5cdFx0Y29uc3Qgc3ViMSA9IHBhcnRpY2lwYW50LmdldE9uV2lsbFNhdmVUZXh0RG9jdW1lbnRFdmVudChudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24pKGZ1bmN0aW9uIChlKSB7XG5cdFx0XHRlLndhaXRVbnRpbChQcm9taXNlLnJlamVjdChuZXcgRXJyb3IoJ2RkZGQnKSkpO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGV2ZW50OiB2c2NvZGUuVGV4dERvY3VtZW50V2lsbFNhdmVFdmVudDtcblx0XHRjb25zdCBzdWIyID0gcGFydGljaXBhbnQuZ2V0T25XaWxsU2F2ZVRleHREb2N1bWVudEV2ZW50KG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbikoZnVuY3Rpb24gKGUpIHtcblx0XHRcdGV2ZW50ID0gZTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwYXJ0aWNpcGFudC4kcGFydGljaXBhdGVJblNhdmUocmVzb3VyY2UsIFNhdmVSZWFzb24uRVhQTElDSVQpLnRoZW4oKCkgPT4ge1xuXHRcdFx0YXNzZXJ0Lm9rKGV2ZW50KTtcblx0XHRcdHN1YjEuZGlzcG9zZSgpO1xuXHRcdFx0c3ViMi5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IGRlbGl2ZXJ5LCBwdXNoRWRpdHMgc3luYycsICgpID0+IHtcblxuXHRcdGxldCBkdG86IElXb3Jrc3BhY2VFZGl0RHRvO1xuXHRcdGNvbnN0IHBhcnRpY2lwYW50ID0gbmV3IEV4dEhvc3REb2N1bWVudFNhdmVQYXJ0aWNpcGFudChudWxsTG9nU2VydmljZSwgZG9jdW1lbnRzLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPE1haW5UaHJlYWRUZXh0RWRpdG9yc1NoYXBlPigpIHtcblx0XHRcdCR0cnlBcHBseVdvcmtzcGFjZUVkaXQoX2VkaXRzOiBTZXJpYWxpemFibGVPYmplY3RXaXRoQnVmZmVyczxJV29ya3NwYWNlRWRpdER0bz4pIHtcblx0XHRcdFx0ZHRvID0gX2VkaXRzLnZhbHVlO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc3ViID0gcGFydGljaXBhbnQuZ2V0T25XaWxsU2F2ZVRleHREb2N1bWVudEV2ZW50KG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbikoZnVuY3Rpb24gKGUpIHtcblx0XHRcdGUud2FpdFVudGlsKFByb21pc2UucmVzb2x2ZShbVGV4dEVkaXQuaW5zZXJ0KG5ldyBQb3NpdGlvbigwLCAwKSwgJ2JhcicpXSkpO1xuXHRcdFx0ZS53YWl0VW50aWwoUHJvbWlzZS5yZXNvbHZlKFtUZXh0RWRpdC5zZXRFbmRPZkxpbmUoRW5kT2ZMaW5lLkNSTEYpXSkpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHBhcnRpY2lwYW50LiRwYXJ0aWNpcGF0ZUluU2F2ZShyZXNvdXJjZSwgU2F2ZVJlYXNvbi5FWFBMSUNJVCkudGhlbigoKSA9PiB7XG5cdFx0XHRzdWIuZGlzcG9zZSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZHRvLmVkaXRzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQub2soKDxJV29ya3NwYWNlVGV4dEVkaXREdG8+ZHRvLmVkaXRzWzBdKS50ZXh0RWRpdCk7XG5cdFx0XHRhc3NlcnQub2soKDxJV29ya3NwYWNlVGV4dEVkaXREdG8+ZHRvLmVkaXRzWzFdKS50ZXh0RWRpdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2ZW50IGRlbGl2ZXJ5LCBjb25jdXJyZW50IGNoYW5nZScsICgpID0+IHtcblxuXHRcdGxldCBlZGl0czogSVdvcmtzcGFjZUVkaXREdG87XG5cdFx0Y29uc3QgcGFydGljaXBhbnQgPSBuZXcgRXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50KG51bGxMb2dTZXJ2aWNlLCBkb2N1bWVudHMsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFRleHRFZGl0b3JzU2hhcGU+KCkge1xuXHRcdFx0JHRyeUFwcGx5V29ya3NwYWNlRWRpdChfZWRpdHM6IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPElXb3Jrc3BhY2VFZGl0RHRvPikge1xuXHRcdFx0XHRlZGl0cyA9IF9lZGl0cy52YWx1ZTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHN1YiA9IHBhcnRpY2lwYW50LmdldE9uV2lsbFNhdmVUZXh0RG9jdW1lbnRFdmVudChudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24pKGZ1bmN0aW9uIChlKSB7XG5cblx0XHRcdC8vIGNvbmN1cnJlbnQgY2hhbmdlIGZyb20gc29tZXdoZXJlXG5cdFx0XHRkb2N1bWVudHMuJGFjY2VwdE1vZGVsQ2hhbmdlZChyZXNvdXJjZSwge1xuXHRcdFx0XHRjaGFuZ2VzOiBbe1xuXHRcdFx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMSwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMSB9LFxuXHRcdFx0XHRcdHJhbmdlT2Zmc2V0OiB1bmRlZmluZWQhLFxuXHRcdFx0XHRcdHJhbmdlTGVuZ3RoOiB1bmRlZmluZWQhLFxuXHRcdFx0XHRcdHRleHQ6ICdiYXInXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRlb2w6IHVuZGVmaW5lZCEsXG5cdFx0XHRcdHZlcnNpb25JZDogMixcblx0XHRcdFx0aXNSZWRvaW5nOiBmYWxzZSxcblx0XHRcdFx0aXNVbmRvaW5nOiBmYWxzZSxcblx0XHRcdFx0ZGV0YWlsZWRSZWFzb246IHVuZGVmaW5lZCxcblx0XHRcdFx0aXNGbHVzaDogZmFsc2UsXG5cdFx0XHRcdGlzRW9sQ2hhbmdlOiBmYWxzZSxcblx0XHRcdH0sIHRydWUpO1xuXG5cdFx0XHRlLndhaXRVbnRpbChQcm9taXNlLnJlc29sdmUoW1RleHRFZGl0Lmluc2VydChuZXcgUG9zaXRpb24oMCwgMCksICdiYXInKV0pKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwYXJ0aWNpcGFudC4kcGFydGljaXBhdGVJblNhdmUocmVzb3VyY2UsIFNhdmVSZWFzb24uRVhQTElDSVQpLnRoZW4odmFsdWVzID0+IHtcblx0XHRcdHN1Yi5kaXNwb3NlKCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlZGl0cywgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWx1ZXNbMF0sIGZhbHNlKTtcblx0XHR9KTtcblxuXHR9KTtcblxuXHR0ZXN0KCdldmVudCBkZWxpdmVyeSwgdHdvIGxpc3RlbmVycyAtPiB0d28gZG9jdW1lbnQgc3RhdGVzJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgcGFydGljaXBhbnQgPSBuZXcgRXh0SG9zdERvY3VtZW50U2F2ZVBhcnRpY2lwYW50KG51bGxMb2dTZXJ2aWNlLCBkb2N1bWVudHMsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZFRleHRFZGl0b3JzU2hhcGU+KCkge1xuXHRcdFx0JHRyeUFwcGx5V29ya3NwYWNlRWRpdChkdG86IFNlcmlhbGl6YWJsZU9iamVjdFdpdGhCdWZmZXJzPElXb3Jrc3BhY2VFZGl0RHRvPikge1xuXG5cdFx0XHRcdGZvciAoY29uc3QgZWRpdCBvZiBkdG8udmFsdWUuZWRpdHMpIHtcblxuXHRcdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5yZXZpdmUoKDxJV29ya3NwYWNlVGV4dEVkaXREdG8+ZWRpdCkucmVzb3VyY2UpO1xuXHRcdFx0XHRcdGNvbnN0IHsgdGV4dCwgcmFuZ2UgfSA9ICg8SVdvcmtzcGFjZVRleHRFZGl0RHRvPmVkaXQpLnRleHRFZGl0O1xuXHRcdFx0XHRcdGRvY3VtZW50cy4kYWNjZXB0TW9kZWxDaGFuZ2VkKHVyaSwge1xuXHRcdFx0XHRcdFx0Y2hhbmdlczogW3tcblx0XHRcdFx0XHRcdFx0cmFuZ2UsXG5cdFx0XHRcdFx0XHRcdHRleHQsXG5cdFx0XHRcdFx0XHRcdHJhbmdlT2Zmc2V0OiB1bmRlZmluZWQhLFxuXHRcdFx0XHRcdFx0XHRyYW5nZUxlbmd0aDogdW5kZWZpbmVkISxcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0ZW9sOiB1bmRlZmluZWQhLFxuXHRcdFx0XHRcdFx0dmVyc2lvbklkOiBkb2N1bWVudHMuZ2V0RG9jdW1lbnREYXRhKHVyaSkhLnZlcnNpb24gKyAxLFxuXHRcdFx0XHRcdFx0aXNSZWRvaW5nOiBmYWxzZSxcblx0XHRcdFx0XHRcdGlzVW5kb2luZzogZmFsc2UsXG5cdFx0XHRcdFx0XHRkZXRhaWxlZFJlYXNvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0aXNGbHVzaDogZmFsc2UsXG5cdFx0XHRcdFx0XHRpc0VvbENoYW5nZTogZmFsc2UsXG5cdFx0XHRcdFx0fSwgdHJ1ZSk7XG5cdFx0XHRcdFx0Ly8gfVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGRvY3VtZW50ID0gZG9jdW1lbnRzLmdldERvY3VtZW50KHJlc291cmNlKTtcblxuXHRcdGNvbnN0IHN1YjEgPSBwYXJ0aWNpcGFudC5nZXRPbldpbGxTYXZlVGV4dERvY3VtZW50RXZlbnQobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uKShmdW5jdGlvbiAoZSkge1xuXHRcdFx0Ly8gdGhlIGRvY3VtZW50IHN0YXRlIHdlIHN0YXJ0ZWQgd2l0aFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvY3VtZW50LnZlcnNpb24sIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvY3VtZW50LmdldFRleHQoKSwgJ2ZvbycpO1xuXG5cdFx0XHRlLndhaXRVbnRpbChQcm9taXNlLnJlc29sdmUoW1RleHRFZGl0Lmluc2VydChuZXcgUG9zaXRpb24oMCwgMCksICdiYXInKV0pKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHN1YjIgPSBwYXJ0aWNpcGFudC5nZXRPbldpbGxTYXZlVGV4dERvY3VtZW50RXZlbnQobnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uKShmdW5jdGlvbiAoZSkge1xuXHRcdFx0Ly8gdGhlIGRvY3VtZW50IHN0YXRlIEFGVEVSIHRoZSBmaXJzdCBsaXN0ZW5lciBraWNrZWQgaW5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb2N1bWVudC52ZXJzaW9uLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkb2N1bWVudC5nZXRUZXh0KCksICdiYXJmb28nKTtcblxuXHRcdFx0ZS53YWl0VW50aWwoUHJvbWlzZS5yZXNvbHZlKFtUZXh0RWRpdC5pbnNlcnQobmV3IFBvc2l0aW9uKDAsIDApLCAnYmFyJyldKSk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcGFydGljaXBhbnQuJHBhcnRpY2lwYXRlSW5TYXZlKHJlc291cmNlLCBTYXZlUmVhc29uLkVYUExJQ0lUKS50aGVuKHZhbHVlcyA9PiB7XG5cdFx0XHRzdWIxLmRpc3Bvc2UoKTtcblx0XHRcdHN1YjIuZGlzcG9zZSgpO1xuXG5cdFx0XHQvLyB0aGUgZG9jdW1lbnQgc3RhdGUgQUZURVIgZXZlbnRpbmcgaXMgZG9uZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvY3VtZW50LnZlcnNpb24sIDMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvY3VtZW50LmdldFRleHQoKSwgJ2JhcmJhcmZvbycpO1xuXHRcdH0pO1xuXG5cdH0pO1xuXG5cdHRlc3QoJ0xvZyBmYWlsaW5nIGxpc3RlbmVyJywgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBkaWRMb2dTb21ldGhpbmcgPSBmYWxzZTtcblx0XHRjb25zdCBwYXJ0aWNpcGFudCA9IG5ldyBFeHRIb3N0RG9jdW1lbnRTYXZlUGFydGljaXBhbnQobmV3IGNsYXNzIGV4dGVuZHMgTnVsbExvZ1NlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgZXJyb3IobWVzc2FnZTogc3RyaW5nIHwgRXJyb3IsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdFx0XHRkaWRMb2dTb21ldGhpbmcgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0sIGRvY3VtZW50cywgbWFpblRocmVhZEJ1bGtFZGl0cyk7XG5cblxuXHRcdGNvbnN0IHN1YiA9IHBhcnRpY2lwYW50LmdldE9uV2lsbFNhdmVUZXh0RG9jdW1lbnRFdmVudChudWxsRXh0ZW5zaW9uRGVzY3JpcHRpb24pKGZ1bmN0aW9uIChlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2Jvb20nKTtcblx0XHR9KTtcblxuXHRcdHJldHVybiBwYXJ0aWNpcGFudC4kcGFydGljaXBhdGVJblNhdmUocmVzb3VyY2UsIFNhdmVSZWFzb24uRVhQTElDSVQpLnRoZW4oKCkgPT4ge1xuXHRcdFx0c3ViLmRpc3Bvc2UoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWRMb2dTb21ldGhpbmcsIHRydWUpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHdCQUF3QixVQUFVLFVBQVUsaUJBQWlCO0FBRXRFLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsa0JBQWtCO0FBRTNCLFNBQVMsWUFBWTtBQUNyQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLCtDQUErQztBQUd4RCxTQUFTLFFBQVEsR0FBVztBQUMzQixTQUFPLElBQUksUUFBUSxhQUFXLFdBQVcsU0FBUyxDQUFDLENBQUM7QUFDckQ7QUFFQSxNQUFNLGtDQUFrQyxNQUFNO0FBRTdDLFFBQU0sV0FBVyxJQUFJLE1BQU0sU0FBUztBQUNwQyxRQUFNLHNCQUFzQixJQUFJLGNBQWMsS0FBK0IsRUFBRTtBQUFBLEVBQUU7QUFDakYsTUFBSTtBQUNKLFFBQU0saUJBQWlCLElBQUksZUFBZTtBQUUxQyxRQUFNLE1BQU07QUFDWCxVQUFNLHNCQUFzQixJQUFJLDJCQUEyQix1QkFBdUIsSUFBSSxHQUFHLElBQUksZUFBZSxDQUFDO0FBQzdHLHdCQUFvQixnQ0FBZ0M7QUFBQSxNQUNuRCxnQkFBZ0IsQ0FBQztBQUFBLFFBQ2hCLFNBQVM7QUFBQSxRQUNULFlBQVk7QUFBQSxRQUNaLEtBQUs7QUFBQSxRQUNMLFdBQVc7QUFBQSxRQUNYLE9BQU8sQ0FBQyxLQUFLO0FBQUEsUUFDYixLQUFLO0FBQUEsUUFDTCxVQUFVO0FBQUEsTUFDWCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsZ0JBQVksSUFBSSxp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
