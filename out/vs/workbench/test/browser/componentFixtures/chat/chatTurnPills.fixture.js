import { constObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../base/test/common/mock.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IChatResponseFileChangesService } from "../../../../contrib/chat/browser/chatResponseFileChangesService.js";
import { ChatTurnPillsContentPart } from "../../../../contrib/chat/browser/widget/chatContentParts/chatTurnPillsPart.js";
import { ChatConfiguration } from "../../../../contrib/chat/common/constants.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from "../fixtureUtils.js";
import { registerChatFixtureServices } from "./chatFixtureUtils.js";
import { renderChatWidget } from "./chatWidget.fixture.js";
function fileDiff(name, added, removed, created) {
  const modifiedURI = URI.file(`/repo/${name}`);
  const originalURI = created ? modifiedURI : URI.file(`/repo/.original/${name}`);
  return { originalURI, modifiedURI, added, removed, quitEarly: false, identical: false, isFinal: true, isBusy: false };
}
function stubFileChangesService(diffs) {
  return new class extends mock() {
    getChangesForRequest() {
      return constObservable(diffs);
    }
  }();
}
function renderTurnPills(ctx, options) {
  const { container, disposableStore } = ctx;
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: ctx.theme,
    additionalServices: (reg) => {
      registerChatFixtureServices(reg);
      reg.defineInstance(IChatResponseFileChangesService, stubFileChangesService(options.diffs));
    }
  });
  instantiationService.get(IConfigurationService).setUserConfiguration(ChatConfiguration.TurnStatusPills, options.setting ?? true);
  const content = {
    kind: "turnPills",
    requestId: "request-1",
    sessionResource: URI.parse("vscode-chat-session://agent-host/session-1")
  };
  const partContext = upcastPartial({ container });
  const part = disposableStore.add(instantiationService.createInstance(ChatTurnPillsContentPart, content, partContext));
  if (options.expanded) {
    part.domNode.querySelector(".checkpoint-file-changes-disclosure").open = true;
  }
  container.classList.add("monaco-workbench", "interactive-session");
  container.style.padding = "12px";
  container.style.backgroundColor = "var(--vscode-editor-background)";
  container.appendChild(part.domNode);
}
var chatTurnPills_fixture_default = defineThemedFixtureGroup({ path: "chat/" }, {
  // --- Standalone content part in each of its states ---
  part: defineThemedFixtureGroup({
    ChangesOnly_SingleFile: defineComponentFixture({
      render: (ctx) => renderTurnPills(ctx, { diffs: [fileDiff("app.ts", 12, 5, false)] })
    }),
    ChangesOnly_MultipleFiles: defineComponentFixture({
      render: (ctx) => renderTurnPills(ctx, {
        diffs: [
          fileDiff("app.ts", 42, 7, false),
          fileDiff("util.ts", 118, 64, false),
          fileDiff("index.ts", 5, 0, true)
        ]
      })
    }),
    ChangesOnly_Expanded: defineComponentFixture({
      render: (ctx) => renderTurnPills(ctx, {
        expanded: true,
        diffs: [
          fileDiff("app.ts", 42, 7, false),
          fileDiff("util.ts", 118, 64, false),
          fileDiff("index.ts", 5, 0, true)
        ]
      })
    }),
    ChangesAndPreview_Markdown: defineComponentFixture({
      render: (ctx) => renderTurnPills(ctx, {
        diffs: [
          fileDiff("README.md", 20, 0, true),
          fileDiff("app.ts", 8, 3, false)
        ]
      })
    }),
    // Expanded list showing the per-row "Preview" action on the markdown row
    // (edited `.ts`/`.css` and HTML rows have no preview action).
    ChangesAndPreview_Expanded: defineComponentFixture({
      render: (ctx) => renderTurnPills(ctx, {
        expanded: true,
        diffs: [
          fileDiff("README.md", 20, 0, true),
          fileDiff("index.html", 30, 4, true),
          fileDiff("app.ts", 8, 3, false),
          fileDiff("styles.css", 4, 1, false)
        ]
      })
    }),
    // With several previewable files only the first is offered.
    ChangesAndPreview_MultiplePreviewable: defineComponentFixture({
      render: (ctx) => renderTurnPills(ctx, {
        diffs: [
          fileDiff("app.ts", 8, 3, false),
          fileDiff("README.md", 20, 0, true),
          fileDiff("index.html", 30, 4, true),
          fileDiff("CHANGELOG.md", 6, 1, false)
        ]
      })
    }),
    LegacyPreviewOptionEnablesAll: defineComponentFixture({
      render: (ctx) => renderTurnPills(ctx, {
        setting: { preview: true },
        diffs: [
          fileDiff("README.md", 20, 0, true),
          fileDiff("app.ts", 8, 3, false)
        ]
      })
    }),
    NoChanges_Hidden: defineComponentFixture({
      render: (ctx) => renderTurnPills(ctx, { diffs: [] })
    })
  }),
  // --- Turn changes summary inside the entire chat ---
  inChat: defineThemedFixtureGroup({
    Changes: defineComponentFixture({
      render: (ctx) => renderChatWidget(ctx, {
        turnStatusPills: true,
        messages: [
          {
            user: "Refactor the fibonacci helper to be iterative",
            assistant: [
              { kind: "markdown", text: "I rewrote `fibonacci(n)` to use an iterative loop and updated its callers, avoiding the exponential recursion." }
            ],
            fileChanges: [
              { name: "fibon.ts", added: 12, removed: 8, created: false },
              { name: "app.ts", added: 3, removed: 1, created: false }
            ]
          }
        ]
      })
    }),
    ChangesAndPreview: defineComponentFixture({
      render: (ctx) => renderChatWidget(ctx, {
        turnStatusPills: true,
        messages: [
          {
            user: "Add a README describing the project",
            assistant: [
              { kind: "markdown", text: "I added a `README.md` with an overview, setup steps, and usage notes, and linked it from the docs index." }
            ],
            fileChanges: [
              { name: "README.md", added: 42, removed: 0, created: true },
              { name: "docs/index.md", added: 4, removed: 1, created: false }
            ]
          }
        ]
      })
    })
  })
});
export {
  chatTurnPills_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvY2hhdC9jaGF0VHVyblBpbGxzLmZpeHR1cmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrLCB1cGNhc3RQYXJ0aWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRTZXNzaW9uRW50cnlEaWZmIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9lZGl0aW5nL2NoYXRFZGl0aW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRUdXJuUGlsbHNDb250ZW50UGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRUdXJuUGlsbHNQYXJ0LmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IENoYXRUdXJuU3RhdHVzUGlsbHNTZXR0aW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2NoYXRUdXJuUGlsbHMuanMnO1xuaW1wb3J0IHsgSUNoYXRUdXJuUGlsbHNQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29udHJpYi9jaGF0L2NvbW1vbi9tb2RlbC9jaGF0Vmlld01vZGVsLmpzJztcbmltcG9ydCB7IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBjcmVhdGVFZGl0b3JTZXJ2aWNlcywgZGVmaW5lQ29tcG9uZW50Rml4dHVyZSwgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwIH0gZnJvbSAnLi4vZml4dHVyZVV0aWxzLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyQ2hhdEZpeHR1cmVTZXJ2aWNlcyB9IGZyb20gJy4vY2hhdEZpeHR1cmVVdGlscy5qcyc7XG5pbXBvcnQgeyByZW5kZXJDaGF0V2lkZ2V0IH0gZnJvbSAnLi9jaGF0V2lkZ2V0LmZpeHR1cmUuanMnO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBNb2NrIGhlbHBlcnNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBBIHBlci1yZXF1ZXN0IGZpbGUgZGlmZi4gQSBjcmVhdGVkIGZpbGUgaGFzIG5vIGJlZm9yZS1jb250ZW50LCBzbyB0aGUgYWdlbnRcbiAqIGhvc3QgcHJvdmlkZXIgbWFwcyBpdHMgYG9yaWdpbmFsVVJJYCB0byB0aGUgYG1vZGlmaWVkVVJJYCAoZXF1YWwgVVJJcyk7IGFuXG4gKiBlZGl0ZWQgZmlsZSBrZWVwcyBhIGRpc3RpbmN0IG9yaWdpbmFsLlxuICovXG5mdW5jdGlvbiBmaWxlRGlmZihuYW1lOiBzdHJpbmcsIGFkZGVkOiBudW1iZXIsIHJlbW92ZWQ6IG51bWJlciwgY3JlYXRlZDogYm9vbGVhbik6IElFZGl0U2Vzc2lvbkVudHJ5RGlmZiB7XG5cdGNvbnN0IG1vZGlmaWVkVVJJID0gVVJJLmZpbGUoYC9yZXBvLyR7bmFtZX1gKTtcblx0Y29uc3Qgb3JpZ2luYWxVUkkgPSBjcmVhdGVkID8gbW9kaWZpZWRVUkkgOiBVUkkuZmlsZShgL3JlcG8vLm9yaWdpbmFsLyR7bmFtZX1gKTtcblx0cmV0dXJuIHsgb3JpZ2luYWxVUkksIG1vZGlmaWVkVVJJLCBhZGRlZCwgcmVtb3ZlZCwgcXVpdEVhcmx5OiBmYWxzZSwgaWRlbnRpY2FsOiBmYWxzZSwgaXNGaW5hbDogdHJ1ZSwgaXNCdXN5OiBmYWxzZSB9O1xufVxuXG5mdW5jdGlvbiBzdHViRmlsZUNoYW5nZXNTZXJ2aWNlKGRpZmZzOiByZWFkb25seSBJRWRpdFNlc3Npb25FbnRyeURpZmZbXSk6IElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2Uge1xuXHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFJlc3BvbnNlRmlsZUNoYW5nZXNTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBnZXRDaGFuZ2VzRm9yUmVxdWVzdCgpIHtcblx0XHRcdHJldHVybiBjb25zdE9ic2VydmFibGUoZGlmZnMpO1xuXHRcdH1cblx0fSgpO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBSZW5kZXIgaGVscGVyIChzdGFuZGFsb25lIGNvbnRlbnQgcGFydClcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuaW50ZXJmYWNlIElSZW5kZXJUdXJuUGlsbHNPcHRpb25zIHtcblx0cmVhZG9ubHkgZGlmZnM6IHJlYWRvbmx5IElFZGl0U2Vzc2lvbkVudHJ5RGlmZltdO1xuXHRyZWFkb25seSBzZXR0aW5nPzogQ2hhdFR1cm5TdGF0dXNQaWxsc1NldHRpbmc7XG5cdC8qKiBXaGVuIGB0cnVlYCwgdGhlIGNoYW5nZWQtZmlsZXMgZGlzY2xvc3VyZSBpcyBleHBhbmRlZC4gKi9cblx0cmVhZG9ubHkgZXhwYW5kZWQ/OiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiByZW5kZXJUdXJuUGlsbHMoY3R4OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgb3B0aW9uczogSVJlbmRlclR1cm5QaWxsc09wdGlvbnMpOiB2b2lkIHtcblx0Y29uc3QgeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSB9ID0gY3R4O1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoZGlzcG9zYWJsZVN0b3JlLCB7XG5cdFx0Y29sb3JUaGVtZTogY3R4LnRoZW1lLFxuXHRcdGFkZGl0aW9uYWxTZXJ2aWNlczogKHJlZykgPT4ge1xuXHRcdFx0Ly8gQnJvYWQgY2hhdCBzZXJ2aWNlIGdyYXBoOiBJQ29udGV4dE1lbnVTZXJ2aWNlLCBJRWRpdG9yU2VydmljZSBhbmQgdGhlXG5cdFx0XHQvLyBSZXNvdXJjZUxhYmVscyBkZXBlbmRlbmNpZXMgdGhlIHByZXZpZXcgYWN0aW9uIG5lZWRzLlxuXHRcdFx0cmVnaXN0ZXJDaGF0Rml4dHVyZVNlcnZpY2VzKHJlZyk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZSwgc3R1YkZpbGVDaGFuZ2VzU2VydmljZShvcHRpb25zLmRpZmZzKSk7XG5cdFx0fSxcblx0fSk7XG5cblx0KGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpIGFzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSkuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uVHVyblN0YXR1c1BpbGxzLCBvcHRpb25zLnNldHRpbmcgPz8gdHJ1ZSk7XG5cblx0Y29uc3QgY29udGVudDogSUNoYXRUdXJuUGlsbHNQYXJ0ID0ge1xuXHRcdGtpbmQ6ICd0dXJuUGlsbHMnLFxuXHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtMScsXG5cdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3ZzY29kZS1jaGF0LXNlc3Npb246Ly9hZ2VudC1ob3N0L3Nlc3Npb24tMScpLFxuXHR9O1xuXHRjb25zdCBwYXJ0Q29udGV4dCA9IHVwY2FzdFBhcnRpYWw8SUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQ+KHsgY29udGFpbmVyIH0pO1xuXG5cdGNvbnN0IHBhcnQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRUdXJuUGlsbHNDb250ZW50UGFydCwgY29udGVudCwgcGFydENvbnRleHQpKTtcblxuXHRpZiAob3B0aW9ucy5leHBhbmRlZCkge1xuXHRcdHBhcnQuZG9tTm9kZS5xdWVyeVNlbGVjdG9yPEhUTUxEZXRhaWxzRWxlbWVudD4oJy5jaGVja3BvaW50LWZpbGUtY2hhbmdlcy1kaXNjbG9zdXJlJykhLm9wZW4gPSB0cnVlO1xuXHR9XG5cblx0Ly8gVGhlIHR1cm4gY2hhbmdlcyBzdW1tYXJ5IHJldXNlcyB0aGUgY2hlY2twb2ludCBzdW1tYXJ5IHN0eWxpbmcsIHdoaWNoIGlzXG5cdC8vIHNjb3BlZCB1bmRlciBgLmludGVyYWN0aXZlLXNlc3Npb25gIChhbmQgcmVsaWVzIG9uIGAubW9uYWNvLXdvcmtiZW5jaGAgZm9yXG5cdC8vIGNvZGljb24gc2l6aW5nIGN1c3RvbSBwcm9wZXJ0aWVzKS5cblx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ21vbmFjby13b3JrYmVuY2gnLCAnaW50ZXJhY3RpdmUtc2Vzc2lvbicpO1xuXHRjb250YWluZXIuc3R5bGUucGFkZGluZyA9ICcxMnB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmJhY2tncm91bmRDb2xvciA9ICd2YXIoLS12c2NvZGUtZWRpdG9yLWJhY2tncm91bmQpJztcblx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSk7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEZpeHR1cmVzXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cCh7IHBhdGg6ICdjaGF0LycgfSwge1xuXG5cdC8vIC0tLSBTdGFuZGFsb25lIGNvbnRlbnQgcGFydCBpbiBlYWNoIG9mIGl0cyBzdGF0ZXMgLS0tXG5cblx0cGFydDogZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHtcblx0XHRDaGFuZ2VzT25seV9TaW5nbGVGaWxlOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyVHVyblBpbGxzKGN0eCwgeyBkaWZmczogW2ZpbGVEaWZmKCdhcHAudHMnLCAxMiwgNSwgZmFsc2UpXSB9KSxcblx0XHR9KSxcblxuXHRcdENoYW5nZXNPbmx5X011bHRpcGxlRmlsZXM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJUdXJuUGlsbHMoY3R4LCB7XG5cdFx0XHRcdGRpZmZzOiBbXG5cdFx0XHRcdFx0ZmlsZURpZmYoJ2FwcC50cycsIDQyLCA3LCBmYWxzZSksXG5cdFx0XHRcdFx0ZmlsZURpZmYoJ3V0aWwudHMnLCAxMTgsIDY0LCBmYWxzZSksXG5cdFx0XHRcdFx0ZmlsZURpZmYoJ2luZGV4LnRzJywgNSwgMCwgdHJ1ZSksXG5cdFx0XHRcdF0sXG5cdFx0XHR9KSxcblx0XHR9KSxcblxuXHRcdENoYW5nZXNPbmx5X0V4cGFuZGVkOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyVHVyblBpbGxzKGN0eCwge1xuXHRcdFx0XHRleHBhbmRlZDogdHJ1ZSxcblx0XHRcdFx0ZGlmZnM6IFtcblx0XHRcdFx0XHRmaWxlRGlmZignYXBwLnRzJywgNDIsIDcsIGZhbHNlKSxcblx0XHRcdFx0XHRmaWxlRGlmZigndXRpbC50cycsIDExOCwgNjQsIGZhbHNlKSxcblx0XHRcdFx0XHRmaWxlRGlmZignaW5kZXgudHMnLCA1LCAwLCB0cnVlKSxcblx0XHRcdFx0XSxcblx0XHRcdH0pLFxuXHRcdH0pLFxuXG5cdFx0Q2hhbmdlc0FuZFByZXZpZXdfTWFya2Rvd246IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJUdXJuUGlsbHMoY3R4LCB7XG5cdFx0XHRcdGRpZmZzOiBbXG5cdFx0XHRcdFx0ZmlsZURpZmYoJ1JFQURNRS5tZCcsIDIwLCAwLCB0cnVlKSxcblx0XHRcdFx0XHRmaWxlRGlmZignYXBwLnRzJywgOCwgMywgZmFsc2UpLFxuXHRcdFx0XHRdLFxuXHRcdFx0fSksXG5cdFx0fSksXG5cblx0XHQvLyBFeHBhbmRlZCBsaXN0IHNob3dpbmcgdGhlIHBlci1yb3cgXCJQcmV2aWV3XCIgYWN0aW9uIG9uIHRoZSBtYXJrZG93biByb3dcblx0XHQvLyAoZWRpdGVkIGAudHNgL2AuY3NzYCBhbmQgSFRNTCByb3dzIGhhdmUgbm8gcHJldmlldyBhY3Rpb24pLlxuXHRcdENoYW5nZXNBbmRQcmV2aWV3X0V4cGFuZGVkOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyVHVyblBpbGxzKGN0eCwge1xuXHRcdFx0XHRleHBhbmRlZDogdHJ1ZSxcblx0XHRcdFx0ZGlmZnM6IFtcblx0XHRcdFx0XHRmaWxlRGlmZignUkVBRE1FLm1kJywgMjAsIDAsIHRydWUpLFxuXHRcdFx0XHRcdGZpbGVEaWZmKCdpbmRleC5odG1sJywgMzAsIDQsIHRydWUpLFxuXHRcdFx0XHRcdGZpbGVEaWZmKCdhcHAudHMnLCA4LCAzLCBmYWxzZSksXG5cdFx0XHRcdFx0ZmlsZURpZmYoJ3N0eWxlcy5jc3MnLCA0LCAxLCBmYWxzZSksXG5cdFx0XHRcdF0sXG5cdFx0XHR9KSxcblx0XHR9KSxcblxuXHRcdC8vIFdpdGggc2V2ZXJhbCBwcmV2aWV3YWJsZSBmaWxlcyBvbmx5IHRoZSBmaXJzdCBpcyBvZmZlcmVkLlxuXHRcdENoYW5nZXNBbmRQcmV2aWV3X011bHRpcGxlUHJldmlld2FibGU6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJUdXJuUGlsbHMoY3R4LCB7XG5cdFx0XHRcdGRpZmZzOiBbXG5cdFx0XHRcdFx0ZmlsZURpZmYoJ2FwcC50cycsIDgsIDMsIGZhbHNlKSxcblx0XHRcdFx0XHRmaWxlRGlmZignUkVBRE1FLm1kJywgMjAsIDAsIHRydWUpLFxuXHRcdFx0XHRcdGZpbGVEaWZmKCdpbmRleC5odG1sJywgMzAsIDQsIHRydWUpLFxuXHRcdFx0XHRcdGZpbGVEaWZmKCdDSEFOR0VMT0cubWQnLCA2LCAxLCBmYWxzZSksXG5cdFx0XHRcdF0sXG5cdFx0XHR9KSxcblx0XHR9KSxcblxuXHRcdExlZ2FjeVByZXZpZXdPcHRpb25FbmFibGVzQWxsOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRcdHJlbmRlcjogKGN0eCkgPT4gcmVuZGVyVHVyblBpbGxzKGN0eCwge1xuXHRcdFx0XHRzZXR0aW5nOiB7IHByZXZpZXc6IHRydWUgfSxcblx0XHRcdFx0ZGlmZnM6IFtcblx0XHRcdFx0XHRmaWxlRGlmZignUkVBRE1FLm1kJywgMjAsIDAsIHRydWUpLFxuXHRcdFx0XHRcdGZpbGVEaWZmKCdhcHAudHMnLCA4LCAzLCBmYWxzZSksXG5cdFx0XHRcdF0sXG5cdFx0XHR9KSxcblx0XHR9KSxcblxuXHRcdE5vQ2hhbmdlc19IaWRkZW46IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJUdXJuUGlsbHMoY3R4LCB7IGRpZmZzOiBbXSB9KSxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gLS0tIFR1cm4gY2hhbmdlcyBzdW1tYXJ5IGluc2lkZSB0aGUgZW50aXJlIGNoYXQgLS0tXG5cblx0aW5DaGF0OiBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAoe1xuXHRcdENoYW5nZXM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdFx0cmVuZGVyOiAoY3R4KSA9PiByZW5kZXJDaGF0V2lkZ2V0KGN0eCwge1xuXHRcdFx0XHR0dXJuU3RhdHVzUGlsbHM6IHRydWUsXG5cdFx0XHRcdG1lc3NhZ2VzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dXNlcjogJ1JlZmFjdG9yIHRoZSBmaWJvbmFjY2kgaGVscGVyIHRvIGJlIGl0ZXJhdGl2ZScsXG5cdFx0XHRcdFx0XHRhc3Npc3RhbnQ6IFtcblx0XHRcdFx0XHRcdFx0eyBraW5kOiAnbWFya2Rvd24nLCB0ZXh0OiAnSSByZXdyb3RlIGBmaWJvbmFjY2kobilgIHRvIHVzZSBhbiBpdGVyYXRpdmUgbG9vcCBhbmQgdXBkYXRlZCBpdHMgY2FsbGVycywgYXZvaWRpbmcgdGhlIGV4cG9uZW50aWFsIHJlY3Vyc2lvbi4nIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0ZmlsZUNoYW5nZXM6IFtcblx0XHRcdFx0XHRcdFx0eyBuYW1lOiAnZmlib24udHMnLCBhZGRlZDogMTIsIHJlbW92ZWQ6IDgsIGNyZWF0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdFx0XHRcdHsgbmFtZTogJ2FwcC50cycsIGFkZGVkOiAzLCByZW1vdmVkOiAxLCBjcmVhdGVkOiBmYWxzZSB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSksXG5cdFx0fSksXG5cblx0XHRDaGFuZ2VzQW5kUHJldmlldzogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0XHRyZW5kZXI6IChjdHgpID0+IHJlbmRlckNoYXRXaWRnZXQoY3R4LCB7XG5cdFx0XHRcdHR1cm5TdGF0dXNQaWxsczogdHJ1ZSxcblx0XHRcdFx0bWVzc2FnZXM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR1c2VyOiAnQWRkIGEgUkVBRE1FIGRlc2NyaWJpbmcgdGhlIHByb2plY3QnLFxuXHRcdFx0XHRcdFx0YXNzaXN0YW50OiBbXG5cdFx0XHRcdFx0XHRcdHsga2luZDogJ21hcmtkb3duJywgdGV4dDogJ0kgYWRkZWQgYSBgUkVBRE1FLm1kYCB3aXRoIGFuIG92ZXJ2aWV3LCBzZXR1cCBzdGVwcywgYW5kIHVzYWdlIG5vdGVzLCBhbmQgbGlua2VkIGl0IGZyb20gdGhlIGRvY3MgaW5kZXguJyB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdGZpbGVDaGFuZ2VzOiBbXG5cdFx0XHRcdFx0XHRcdHsgbmFtZTogJ1JFQURNRS5tZCcsIGFkZGVkOiA0MiwgcmVtb3ZlZDogMCwgY3JlYXRlZDogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0XHR7IG5hbWU6ICdkb2NzL2luZGV4Lm1kJywgYWRkZWQ6IDQsIHJlbW92ZWQ6IDEsIGNyZWF0ZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KSxcblx0XHR9KSxcblx0fSksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLE1BQU0scUJBQXFCO0FBQ3BDLFNBQVMsNkJBQTZCO0FBR3RDLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMseUJBQXlCO0FBR2xDLFNBQWtDLHNCQUFzQix3QkFBd0IsZ0NBQWdDO0FBQ2hILFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsd0JBQXdCO0FBV2pDLFNBQVMsU0FBUyxNQUFjLE9BQWUsU0FBaUIsU0FBeUM7QUFDeEcsUUFBTSxjQUFjLElBQUksS0FBSyxTQUFTLElBQUksRUFBRTtBQUM1QyxRQUFNLGNBQWMsVUFBVSxjQUFjLElBQUksS0FBSyxtQkFBbUIsSUFBSSxFQUFFO0FBQzlFLFNBQU8sRUFBRSxhQUFhLGFBQWEsT0FBTyxTQUFTLFdBQVcsT0FBTyxXQUFXLE9BQU8sU0FBUyxNQUFNLFFBQVEsTUFBTTtBQUNySDtBQUVBLFNBQVMsdUJBQXVCLE9BQTBFO0FBQ3pHLFNBQU8sSUFBSSxjQUFjLEtBQXNDLEVBQUU7QUFBQSxJQUN2RCx1QkFBdUI7QUFDL0IsYUFBTyxnQkFBZ0IsS0FBSztB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
