import assert from "assert";
import { Disposable, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { IChatResponseFileChangesService } from "../../../../browser/chatResponseFileChangesService.js";
import { ChatCheckpointFileChangesSummaryContentPart } from "../../../../browser/widget/chatContentParts/chatChangesSummaryPart.js";
import { ChatCollapsibleContentPart } from "../../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js";
import { emptySessionEntryDiff } from "../../../../common/editing/chatEditingService.js";
suite("ChatCheckpointFileChangesSummaryContentPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("updates visibility and aggregate counts when file changes arrive", () => {
    const instantiationService = workbenchInstantiationService(void 0, store);
    const diffs = observableValue("testFileChanges", []);
    instantiationService.stub(IChatResponseFileChangesService, {
      _serviceBrand: void 0,
      registerProvider: () => Disposable.None,
      getChangesForRequest: () => diffs
    });
    const content = {
      kind: "changesSummary",
      requestId: "request",
      sessionResource: URI.parse("chat-session://test/session")
    };
    const part = store.add(instantiationService.createInstance(
      ChatCheckpointFileChangesSummaryContentPart,
      content,
      {}
    ));
    const readState = () => ({
      display: part.domNode.style.display,
      files: part.domNode.querySelector(".chat-file-changes-label")?.textContent,
      additions: part.domNode.querySelector(".insertions")?.textContent,
      deletions: part.domNode.querySelector(".deletions")?.textContent,
      headerOrder: Array.from(part.domNode.querySelector("summary")?.children ?? []).map((element) => element.classList.item(0))
    });
    const states = [readState()];
    diffs.set([
      { ...emptySessionEntryDiff(URI.file("/file1.ts"), URI.file("/file1.ts")), added: 5, removed: 2 },
      { ...emptySessionEntryDiff(URI.file("/file2.ts"), URI.file("/file2.ts")), added: 3, removed: 1 }
    ], void 0);
    states.push(readState());
    assert.deepStrictEqual(states, [
      {
        display: "none",
        files: "0 files changed",
        additions: "+0",
        deletions: "-0",
        headerOrder: ["chat-file-changes-label", "chat-file-changes-counts", "chat-view-changes-icon", "chat-file-changes-chevron"]
      },
      {
        display: "",
        files: "2 files changed",
        additions: "+8",
        deletions: "-3",
        headerOrder: ["chat-file-changes-label", "chat-file-changes-counts", "chat-view-changes-icon", "chat-file-changes-chevron"]
      }
    ]);
  });
  test("signals user toggles and rotates the disclosure chevron", () => {
    const instantiationService = workbenchInstantiationService(void 0, store);
    instantiationService.stub(IChatResponseFileChangesService, {
      _serviceBrand: void 0,
      registerProvider: () => Disposable.None,
      getChangesForRequest: () => observableValue("testFileChanges", [
        emptySessionEntryDiff(URI.file("/file.ts"), URI.file("/file.ts"))
      ])
    });
    const part = store.add(instantiationService.createInstance(
      ChatCheckpointFileChangesSummaryContentPart,
      {
        kind: "changesSummary",
        requestId: "request",
        sessionResource: URI.parse("chat-session://test/session")
      },
      {}
    ));
    let toggleCount = 0;
    const listener = () => toggleCount++;
    part.domNode.addEventListener(ChatCollapsibleContentPart.userToggleEvent, listener);
    store.add(toDisposable(() => part.domNode.removeEventListener(ChatCollapsibleContentPart.userToggleEvent, listener)));
    const header = part.domNode.querySelector("summary");
    const details = part.domNode.querySelector("details");
    const chevron = part.domNode.querySelector(".chat-file-changes-chevron");
    assert.ok(header);
    assert.ok(details);
    assert.ok(chevron);
    header.click();
    details.dispatchEvent(new Event("toggle"));
    assert.deepStrictEqual({
      open: details.open,
      expandedChevron: chevron.classList.contains("expanded"),
      toggleCount
    }, {
      open: true,
      expandedChevron: true,
      toggleCount: 1
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRDaGFuZ2VzU3VtbWFyeVBhcnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9jaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdENoZWNrcG9pbnRGaWxlQ2hhbmdlc1N1bW1hcnlDb250ZW50UGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENoYW5nZXNTdW1tYXJ5UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29sbGFwc2libGVDb250ZW50UGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgZW1wdHlTZXNzaW9uRW50cnlEaWZmLCBJRWRpdFNlc3Npb25FbnRyeURpZmYgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vZWRpdGluZy9jaGF0RWRpdGluZ1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRDaGFuZ2VzU3VtbWFyeVBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFZpZXdNb2RlbC5qcyc7XG5cbnN1aXRlKCdDaGF0Q2hlY2twb2ludEZpbGVDaGFuZ2VzU3VtbWFyeUNvbnRlbnRQYXJ0JywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3VwZGF0ZXMgdmlzaWJpbGl0eSBhbmQgYWdncmVnYXRlIGNvdW50cyB3aGVuIGZpbGUgY2hhbmdlcyBhcnJpdmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRjb25zdCBkaWZmcyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJRWRpdFNlc3Npb25FbnRyeURpZmZbXT4oJ3Rlc3RGaWxlQ2hhbmdlcycsIFtdKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UsIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdHJlZ2lzdGVyUHJvdmlkZXI6ICgpID0+IERpc3Bvc2FibGUuTm9uZSxcblx0XHRcdGdldENoYW5nZXNGb3JSZXF1ZXN0OiAoKSA9PiBkaWZmcyxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvbnRlbnQ6IElDaGF0Q2hhbmdlc1N1bW1hcnlQYXJ0ID0ge1xuXHRcdFx0a2luZDogJ2NoYW5nZXNTdW1tYXJ5Jyxcblx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QnLFxuXHRcdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovL3Rlc3Qvc2Vzc2lvbicpLFxuXHRcdH07XG5cdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRDaGVja3BvaW50RmlsZUNoYW5nZXNTdW1tYXJ5Q29udGVudFBhcnQsXG5cdFx0XHRjb250ZW50LFxuXHRcdFx0e30gYXMgSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsXG5cdFx0KSk7XG5cblx0XHRjb25zdCByZWFkU3RhdGUgPSAoKSA9PiAoe1xuXHRcdFx0ZGlzcGxheTogcGFydC5kb21Ob2RlLnN0eWxlLmRpc3BsYXksXG5cdFx0XHRmaWxlczogcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWZpbGUtY2hhbmdlcy1sYWJlbCcpPy50ZXh0Q29udGVudCxcblx0XHRcdGFkZGl0aW9uczogcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5pbnNlcnRpb25zJyk/LnRleHRDb250ZW50LFxuXHRcdFx0ZGVsZXRpb25zOiBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmRlbGV0aW9ucycpPy50ZXh0Q29udGVudCxcblx0XHRcdGhlYWRlck9yZGVyOiBBcnJheS5mcm9tKHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCdzdW1tYXJ5Jyk/LmNoaWxkcmVuID8/IFtdKS5tYXAoZWxlbWVudCA9PiBlbGVtZW50LmNsYXNzTGlzdC5pdGVtKDApKSxcblx0XHR9KTtcblx0XHRjb25zdCBzdGF0ZXMgPSBbcmVhZFN0YXRlKCldO1xuXG5cdFx0ZGlmZnMuc2V0KFtcblx0XHRcdHsgLi4uZW1wdHlTZXNzaW9uRW50cnlEaWZmKFVSSS5maWxlKCcvZmlsZTEudHMnKSwgVVJJLmZpbGUoJy9maWxlMS50cycpKSwgYWRkZWQ6IDUsIHJlbW92ZWQ6IDIgfSxcblx0XHRcdHsgLi4uZW1wdHlTZXNzaW9uRW50cnlEaWZmKFVSSS5maWxlKCcvZmlsZTIudHMnKSwgVVJJLmZpbGUoJy9maWxlMi50cycpKSwgYWRkZWQ6IDMsIHJlbW92ZWQ6IDEgfSxcblx0XHRdLCB1bmRlZmluZWQpO1xuXHRcdHN0YXRlcy5wdXNoKHJlYWRTdGF0ZSgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGVzLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGRpc3BsYXk6ICdub25lJyxcblx0XHRcdFx0ZmlsZXM6ICcwIGZpbGVzIGNoYW5nZWQnLFxuXHRcdFx0XHRhZGRpdGlvbnM6ICcrMCcsXG5cdFx0XHRcdGRlbGV0aW9uczogJy0wJyxcblx0XHRcdFx0aGVhZGVyT3JkZXI6IFsnY2hhdC1maWxlLWNoYW5nZXMtbGFiZWwnLCAnY2hhdC1maWxlLWNoYW5nZXMtY291bnRzJywgJ2NoYXQtdmlldy1jaGFuZ2VzLWljb24nLCAnY2hhdC1maWxlLWNoYW5nZXMtY2hldnJvbiddLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0ZGlzcGxheTogJycsXG5cdFx0XHRcdGZpbGVzOiAnMiBmaWxlcyBjaGFuZ2VkJyxcblx0XHRcdFx0YWRkaXRpb25zOiAnKzgnLFxuXHRcdFx0XHRkZWxldGlvbnM6ICctMycsXG5cdFx0XHRcdGhlYWRlck9yZGVyOiBbJ2NoYXQtZmlsZS1jaGFuZ2VzLWxhYmVsJywgJ2NoYXQtZmlsZS1jaGFuZ2VzLWNvdW50cycsICdjaGF0LXZpZXctY2hhbmdlcy1pY29uJywgJ2NoYXQtZmlsZS1jaGFuZ2VzLWNoZXZyb24nXSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpZ25hbHMgdXNlciB0b2dnbGVzIGFuZCByb3RhdGVzIHRoZSBkaXNjbG9zdXJlIGNoZXZyb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2UsIHtcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdHJlZ2lzdGVyUHJvdmlkZXI6ICgpID0+IERpc3Bvc2FibGUuTm9uZSxcblx0XHRcdGdldENoYW5nZXNGb3JSZXF1ZXN0OiAoKSA9PiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3RGaWxlQ2hhbmdlcycsIFtcblx0XHRcdFx0ZW1wdHlTZXNzaW9uRW50cnlEaWZmKFVSSS5maWxlKCcvZmlsZS50cycpLCBVUkkuZmlsZSgnL2ZpbGUudHMnKSlcblx0XHRcdF0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0Q2hlY2twb2ludEZpbGVDaGFuZ2VzU3VtbWFyeUNvbnRlbnRQYXJ0LFxuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnY2hhbmdlc1N1bW1hcnknLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6ICdyZXF1ZXN0Jyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2NoYXQtc2Vzc2lvbjovL3Rlc3Qvc2Vzc2lvbicpLFxuXHRcdFx0fSxcblx0XHRcdHt9IGFzIElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LFxuXHRcdCkpO1xuXHRcdGxldCB0b2dnbGVDb3VudCA9IDA7XG5cdFx0Y29uc3QgbGlzdGVuZXIgPSAoKSA9PiB0b2dnbGVDb3VudCsrO1xuXHRcdHBhcnQuZG9tTm9kZS5hZGRFdmVudExpc3RlbmVyKENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0LnVzZXJUb2dnbGVFdmVudCwgbGlzdGVuZXIpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlLnJlbW92ZUV2ZW50TGlzdGVuZXIoQ2hhdENvbGxhcHNpYmxlQ29udGVudFBhcnQudXNlclRvZ2dsZUV2ZW50LCBsaXN0ZW5lcikpKTtcblxuXHRcdGNvbnN0IGhlYWRlciA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50Pignc3VtbWFyeScpO1xuXHRcdGNvbnN0IGRldGFpbHMgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRGV0YWlsc0VsZW1lbnQ+KCdkZXRhaWxzJyk7XG5cdFx0Y29uc3QgY2hldnJvbiA9IHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1maWxlLWNoYW5nZXMtY2hldnJvbicpO1xuXHRcdGFzc2VydC5vayhoZWFkZXIpO1xuXHRcdGFzc2VydC5vayhkZXRhaWxzKTtcblx0XHRhc3NlcnQub2soY2hldnJvbik7XG5cdFx0aGVhZGVyLmNsaWNrKCk7XG5cdFx0ZGV0YWlscy5kaXNwYXRjaEV2ZW50KG5ldyBFdmVudCgndG9nZ2xlJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRvcGVuOiBkZXRhaWxzLm9wZW4sXG5cdFx0XHRleHBhbmRlZENoZXZyb246IGNoZXZyb24uY2xhc3NMaXN0LmNvbnRhaW5zKCdleHBhbmRlZCcpLFxuXHRcdFx0dG9nZ2xlQ291bnQsXG5cdFx0fSwge1xuXHRcdFx0b3BlbjogdHJ1ZSxcblx0XHRcdGV4cGFuZGVkQ2hldnJvbjogdHJ1ZSxcblx0XHRcdHRvZ2dsZUNvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMscUNBQXFDO0FBQzlDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsbURBQW1EO0FBQzVELFNBQVMsa0NBQWtDO0FBRTNDLFNBQVMsNkJBQW9EO0FBRzdELE1BQU0sK0NBQStDLE1BQU07QUFDMUQsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxPQUFLLG9FQUFvRSxNQUFNO0FBQzlFLFVBQU0sdUJBQXVCLDhCQUE4QixRQUFXLEtBQUs7QUFDM0UsVUFBTSxRQUFRLGdCQUFrRCxtQkFBbUIsQ0FBQyxDQUFDO0FBQ3JGLHlCQUFxQixLQUFLLGlDQUFpQztBQUFBLE1BQzFELGVBQWU7QUFBQSxNQUNmLGtCQUFrQixNQUFNLFdBQVc7QUFBQSxNQUNuQyxzQkFBc0IsTUFBTTtBQUFBLElBQzdCLENBQUM7QUFFRCxVQUFNLFVBQW1DO0FBQUEsTUFDeEMsTUFBTTtBQUFBLE1BQ04sV0FBVztBQUFBLE1BQ1gsaUJBQWlCLElBQUksTUFBTSw2QkFBNkI7QUFBQSxJQUN6RDtBQUNB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
