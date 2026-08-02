import assert from "assert";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { Event } from "../../../../../../../base/common/event.js";
import { observableValue } from "../../../../../../../base/common/observable.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { CodeBlockPart } from "../../../../browser/widget/chatContentParts/codeBlockPart.js";
import { ChatCollapsibleContentPart } from "../../../../browser/widget/chatContentParts/chatCollapsibleContentPart.js";
import { DiffEditorPool, EditorPool } from "../../../../browser/widget/chatContentParts/chatContentCodePools.js";
import { InlineTextModelCollection } from "../../../../browser/widget/chatContentParts/chatContentParts.js";
import { ChatCollapsibleInputOutputContentPart } from "../../../../browser/widget/chatContentParts/chatToolInputOutputContentPart.js";
import { ChatToolOutputContentSubPart } from "../../../../browser/widget/chatContentParts/chatToolOutputContentSubPart.js";
suite("ChatCollapsibleInputOutputContentPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("animates disclosure state and keeps collapsed content inert", () => {
    const editorElement = mainWindow.document.createElement("div");
    const codeBlockPart = Object.create(CodeBlockPart.prototype);
    Object.defineProperties(codeBlockPart, {
      element: { value: editorElement },
      render: { value: () => {
      } },
      layout: { value: () => {
      } }
    });
    const editorReference = {
      object: codeBlockPart,
      isStale: () => false,
      dispose: () => {
      }
    };
    const editorPool = Object.create(EditorPool.prototype);
    Object.defineProperty(editorPool, "get", { value: () => editorReference });
    const element = /* @__PURE__ */ Object.create(null);
    Object.assign(element, {
      id: "response",
      sessionResource: URI.parse("chat-session://test/session")
    });
    const context = {
      element,
      elementIndex: 0,
      container: mainWindow.document.createElement("div"),
      content: [],
      contentIndex: 0,
      inlineTextModels: Object.create(InlineTextModelCollection.prototype),
      editorPool,
      codeBlockStartIndex: 0,
      treeStartIndex: 0,
      diffEditorPool: Object.create(DiffEditorPool.prototype),
      currentWidth: observableValue("testWidth", 500),
      onDidChangeVisibility: Event.None
    };
    const instantiationService = workbenchInstantiationService(void 0, store);
    const part = store.add(instantiationService.createInstance(
      ChatCollapsibleInputOutputContentPart,
      "Read Terminal",
      void 0,
      void 0,
      context,
      {
        kind: "code",
        data: '{"shellId":"test"}',
        languageId: "json",
        options: {},
        codeBlockIndex: 0,
        ownerMarkdownPartId: "test"
      },
      void 0,
      false,
      false,
      false
    ));
    const button = part.domNode.querySelector(".chat-confirmation-widget-title");
    const widget = part.domNode.querySelector(".chat-confirmation-widget");
    const animationContent = part.domNode.querySelector(".chat-confirmation-widget-message-animation-inner");
    const chevron = part.domNode.querySelector(".chat-collapsible-hover-chevron");
    assert.ok(button);
    assert.ok(widget);
    assert.ok(animationContent);
    assert.ok(chevron);
    const expandedDuringToggle = [];
    part.domNode.addEventListener(ChatCollapsibleContentPart.userToggleEvent, () => expandedDuringToggle.push(button.ariaExpanded));
    const initiallyInert = animationContent.inert;
    button.click();
    const expandedState = {
      ariaExpanded: button.ariaExpanded,
      chevronExpanded: chevron.classList.contains("expanded"),
      inert: animationContent.inert,
      hasMessage: !!animationContent.querySelector(".chat-confirmation-widget-message")
    };
    button.click();
    assert.deepStrictEqual({
      initiallyInert,
      titleIsFirst: widget.firstElementChild === button,
      expandedState,
      collapsedInert: animationContent.inert,
      expandedDuringToggle
    }, {
      initiallyInert: true,
      titleIsFirst: true,
      expandedState: {
        ariaExpanded: "true",
        chevronExpanded: true,
        inert: false,
        hasMessage: true
      },
      collapsedInert: true,
      expandedDuringToggle: ["false", "true"]
    });
  });
  test("renders titled outputs separately", () => {
    const renderedTexts = [];
    const editorPool = Object.create(EditorPool.prototype);
    Object.defineProperty(editorPool, "get", {
      value: () => {
        const codeBlockPart = Object.create(CodeBlockPart.prototype);
        Object.defineProperties(codeBlockPart, {
          element: { value: mainWindow.document.createElement("div") },
          render: { value: (data) => renderedTexts.push(data.text) },
          uri: { value: URI.parse("test://codeblock") }
        });
        return {
          object: codeBlockPart,
          isStale: () => false,
          dispose: () => {
          }
        };
      }
    });
    const element = Object.assign(/* @__PURE__ */ Object.create(null), {
      id: "response",
      sessionResource: URI.parse("chat-session://test/session")
    });
    const context = {
      element,
      elementIndex: 0,
      container: mainWindow.document.createElement("div"),
      content: [],
      contentIndex: 0,
      inlineTextModels: Object.create(InlineTextModelCollection.prototype),
      editorPool,
      codeBlockStartIndex: 0,
      treeStartIndex: 0,
      diffEditorPool: Object.create(DiffEditorPool.prototype),
      currentWidth: observableValue("testWidth", 500),
      onDidChangeVisibility: Event.None
    };
    const instantiationService = workbenchInstantiationService(void 0, store);
    const part = store.add(instantiationService.createInstance(
      ChatToolOutputContentSubPart,
      context,
      [
        {
          kind: "code",
          title: "https://example.com/first",
          data: "First result",
          languageId: "plaintext",
          options: {},
          codeBlockIndex: 0,
          ownerMarkdownPartId: "test"
        },
        {
          kind: "code",
          title: "https://example.com/second",
          data: "Second result",
          languageId: "plaintext",
          options: {},
          codeBlockIndex: 1,
          ownerMarkdownPartId: "test"
        }
      ]
    ));
    assert.deepStrictEqual({
      titles: [...part.domNode.querySelectorAll(".chat-confirmation-widget-title")].map((element2) => element2.textContent),
      renderedTexts
    }, {
      titles: ["https://example.com/first", "https://example.com/second"],
      renderedTexts: ["First result", "Second result"]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRUb29sSW5wdXRPdXRwdXRDb250ZW50UGFydC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWFpbldpbmRvdyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci93aW5kb3cuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBDb2RlQmxvY2tQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jb2RlQmxvY2tQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29sbGFwc2libGVDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbGxlY3Rpb25zLmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JQb29sLCBFZGl0b3JQb29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q29udGVudENvZGVQb29scy5qcyc7XG5pbXBvcnQgeyBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgSW5saW5lVGV4dE1vZGVsQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdENvbnRlbnRQYXJ0cy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29sbGFwc2libGVJbnB1dE91dHB1dENvbnRlbnRQYXJ0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci93aWRnZXQvY2hhdENvbnRlbnRQYXJ0cy9jaGF0VG9vbElucHV0T3V0cHV0Q29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xPdXRwdXRDb250ZW50U3ViUGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdFRvb2xPdXRwdXRDb250ZW50U3ViUGFydC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuXG5zdWl0ZSgnQ2hhdENvbGxhcHNpYmxlSW5wdXRPdXRwdXRDb250ZW50UGFydCcsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdhbmltYXRlcyBkaXNjbG9zdXJlIHN0YXRlIGFuZCBrZWVwcyBjb2xsYXBzZWQgY29udGVudCBpbmVydCcsICgpID0+IHtcblx0XHRjb25zdCBlZGl0b3JFbGVtZW50ID0gbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb25zdCBjb2RlQmxvY2tQYXJ0ID0gT2JqZWN0LmNyZWF0ZShDb2RlQmxvY2tQYXJ0LnByb3RvdHlwZSkgYXMgQ29kZUJsb2NrUGFydDtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydGllcyhjb2RlQmxvY2tQYXJ0LCB7XG5cdFx0XHRlbGVtZW50OiB7IHZhbHVlOiBlZGl0b3JFbGVtZW50IH0sXG5cdFx0XHRyZW5kZXI6IHsgdmFsdWU6ICgpID0+IHsgfSB9LFxuXHRcdFx0bGF5b3V0OiB7IHZhbHVlOiAoKSA9PiB7IH0gfSxcblx0XHR9KTtcblx0XHRjb25zdCBlZGl0b3JSZWZlcmVuY2U6IElEaXNwb3NhYmxlUmVmZXJlbmNlPENvZGVCbG9ja1BhcnQ+ID0ge1xuXHRcdFx0b2JqZWN0OiBjb2RlQmxvY2tQYXJ0LFxuXHRcdFx0aXNTdGFsZTogKCkgPT4gZmFsc2UsXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0fTtcblx0XHRjb25zdCBlZGl0b3JQb29sID0gT2JqZWN0LmNyZWF0ZShFZGl0b3JQb29sLnByb3RvdHlwZSkgYXMgRWRpdG9yUG9vbDtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZWRpdG9yUG9vbCwgJ2dldCcsIHsgdmFsdWU6ICgpID0+IGVkaXRvclJlZmVyZW5jZSB9KTtcblx0XHRjb25zdCBlbGVtZW50ID0gT2JqZWN0LmNyZWF0ZShudWxsKSBhcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsO1xuXHRcdE9iamVjdC5hc3NpZ24oZWxlbWVudCwge1xuXHRcdFx0aWQ6ICdyZXNwb25zZScsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgnY2hhdC1zZXNzaW9uOi8vdGVzdC9zZXNzaW9uJyksXG5cdFx0fSk7XG5cdFx0Y29uc3QgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQgPSB7XG5cdFx0XHRlbGVtZW50LFxuXHRcdFx0ZWxlbWVudEluZGV4OiAwLFxuXHRcdFx0Y29udGFpbmVyOiBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxuXHRcdFx0Y29udGVudDogW10sXG5cdFx0XHRjb250ZW50SW5kZXg6IDAsXG5cdFx0XHRpbmxpbmVUZXh0TW9kZWxzOiBPYmplY3QuY3JlYXRlKElubGluZVRleHRNb2RlbENvbGxlY3Rpb24ucHJvdG90eXBlKSBhcyBJbmxpbmVUZXh0TW9kZWxDb2xsZWN0aW9uLFxuXHRcdFx0ZWRpdG9yUG9vbCxcblx0XHRcdGNvZGVCbG9ja1N0YXJ0SW5kZXg6IDAsXG5cdFx0XHR0cmVlU3RhcnRJbmRleDogMCxcblx0XHRcdGRpZmZFZGl0b3JQb29sOiBPYmplY3QuY3JlYXRlKERpZmZFZGl0b3JQb29sLnByb3RvdHlwZSkgYXMgRGlmZkVkaXRvclBvb2wsXG5cdFx0XHRjdXJyZW50V2lkdGg6IG9ic2VydmFibGVWYWx1ZSgndGVzdFdpZHRoJywgNTAwKSxcblx0XHRcdG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogRXZlbnQuTm9uZSxcblx0XHR9O1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UodW5kZWZpbmVkLCBzdG9yZSk7XG5cdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENoYXRDb2xsYXBzaWJsZUlucHV0T3V0cHV0Q29udGVudFBhcnQsXG5cdFx0XHQnUmVhZCBUZXJtaW5hbCcsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnY29kZScsXG5cdFx0XHRcdGRhdGE6ICd7XCJzaGVsbElkXCI6XCJ0ZXN0XCJ9Jyxcblx0XHRcdFx0bGFuZ3VhZ2VJZDogJ2pzb24nLFxuXHRcdFx0XHRvcHRpb25zOiB7fSxcblx0XHRcdFx0Y29kZUJsb2NrSW5kZXg6IDAsXG5cdFx0XHRcdG93bmVyTWFya2Rvd25QYXJ0SWQ6ICd0ZXN0Jyxcblx0XHRcdH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRmYWxzZSxcblx0XHRcdGZhbHNlLFxuXHRcdFx0ZmFsc2UsXG5cdFx0KSk7XG5cblx0XHRjb25zdCBidXR0b24gPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5jaGF0LWNvbmZpcm1hdGlvbi13aWRnZXQtdGl0bGUnKTtcblx0XHRjb25zdCB3aWRnZXQgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcignLmNoYXQtY29uZmlybWF0aW9uLXdpZGdldCcpO1xuXHRcdGNvbnN0IGFuaW1hdGlvbkNvbnRlbnQgPSBwYXJ0LmRvbU5vZGUucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5jaGF0LWNvbmZpcm1hdGlvbi13aWRnZXQtbWVzc2FnZS1hbmltYXRpb24taW5uZXInKTtcblx0XHRjb25zdCBjaGV2cm9uID0gcGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3IoJy5jaGF0LWNvbGxhcHNpYmxlLWhvdmVyLWNoZXZyb24nKTtcblx0XHRhc3NlcnQub2soYnV0dG9uKTtcblx0XHRhc3NlcnQub2sod2lkZ2V0KTtcblx0XHRhc3NlcnQub2soYW5pbWF0aW9uQ29udGVudCk7XG5cdFx0YXNzZXJ0Lm9rKGNoZXZyb24pO1xuXHRcdGNvbnN0IGV4cGFuZGVkRHVyaW5nVG9nZ2xlOiBBcnJheTxzdHJpbmcgfCBudWxsPiA9IFtdO1xuXHRcdHBhcnQuZG9tTm9kZS5hZGRFdmVudExpc3RlbmVyKENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0LnVzZXJUb2dnbGVFdmVudCwgKCkgPT4gZXhwYW5kZWREdXJpbmdUb2dnbGUucHVzaChidXR0b24uYXJpYUV4cGFuZGVkKSk7XG5cblx0XHRjb25zdCBpbml0aWFsbHlJbmVydCA9IGFuaW1hdGlvbkNvbnRlbnQuaW5lcnQ7XG5cdFx0YnV0dG9uLmNsaWNrKCk7XG5cdFx0Y29uc3QgZXhwYW5kZWRTdGF0ZSA9IHtcblx0XHRcdGFyaWFFeHBhbmRlZDogYnV0dG9uLmFyaWFFeHBhbmRlZCxcblx0XHRcdGNoZXZyb25FeHBhbmRlZDogY2hldnJvbi5jbGFzc0xpc3QuY29udGFpbnMoJ2V4cGFuZGVkJyksXG5cdFx0XHRpbmVydDogYW5pbWF0aW9uQ29udGVudC5pbmVydCxcblx0XHRcdGhhc01lc3NhZ2U6ICEhYW5pbWF0aW9uQ29udGVudC5xdWVyeVNlbGVjdG9yKCcuY2hhdC1jb25maXJtYXRpb24td2lkZ2V0LW1lc3NhZ2UnKSxcblx0XHR9O1xuXHRcdGJ1dHRvbi5jbGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbml0aWFsbHlJbmVydCxcblx0XHRcdHRpdGxlSXNGaXJzdDogd2lkZ2V0LmZpcnN0RWxlbWVudENoaWxkID09PSBidXR0b24sXG5cdFx0XHRleHBhbmRlZFN0YXRlLFxuXHRcdFx0Y29sbGFwc2VkSW5lcnQ6IGFuaW1hdGlvbkNvbnRlbnQuaW5lcnQsXG5cdFx0XHRleHBhbmRlZER1cmluZ1RvZ2dsZSxcblx0XHR9LCB7XG5cdFx0XHRpbml0aWFsbHlJbmVydDogdHJ1ZSxcblx0XHRcdHRpdGxlSXNGaXJzdDogdHJ1ZSxcblx0XHRcdGV4cGFuZGVkU3RhdGU6IHtcblx0XHRcdFx0YXJpYUV4cGFuZGVkOiAndHJ1ZScsXG5cdFx0XHRcdGNoZXZyb25FeHBhbmRlZDogdHJ1ZSxcblx0XHRcdFx0aW5lcnQ6IGZhbHNlLFxuXHRcdFx0XHRoYXNNZXNzYWdlOiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdGNvbGxhcHNlZEluZXJ0OiB0cnVlLFxuXHRcdFx0ZXhwYW5kZWREdXJpbmdUb2dnbGU6IFsnZmFsc2UnLCAndHJ1ZSddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW5kZXJzIHRpdGxlZCBvdXRwdXRzIHNlcGFyYXRlbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVuZGVyZWRUZXh0czogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBlZGl0b3JQb29sID0gT2JqZWN0LmNyZWF0ZShFZGl0b3JQb29sLnByb3RvdHlwZSkgYXMgRWRpdG9yUG9vbDtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZWRpdG9yUG9vbCwgJ2dldCcsIHtcblx0XHRcdHZhbHVlOiAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvZGVCbG9ja1BhcnQgPSBPYmplY3QuY3JlYXRlKENvZGVCbG9ja1BhcnQucHJvdG90eXBlKSBhcyBDb2RlQmxvY2tQYXJ0O1xuXHRcdFx0XHRPYmplY3QuZGVmaW5lUHJvcGVydGllcyhjb2RlQmxvY2tQYXJ0LCB7XG5cdFx0XHRcdFx0ZWxlbWVudDogeyB2YWx1ZTogbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSB9LFxuXHRcdFx0XHRcdHJlbmRlcjogeyB2YWx1ZTogKGRhdGE6IHsgdGV4dDogc3RyaW5nIH0pID0+IHJlbmRlcmVkVGV4dHMucHVzaChkYXRhLnRleHQpIH0sXG5cdFx0XHRcdFx0dXJpOiB7IHZhbHVlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9jb2RlYmxvY2snKSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRvYmplY3Q6IGNvZGVCbG9ja1BhcnQsXG5cdFx0XHRcdFx0aXNTdGFsZTogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdFx0XHR9IHNhdGlzZmllcyBJRGlzcG9zYWJsZVJlZmVyZW5jZTxDb2RlQmxvY2tQYXJ0Pjtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBlbGVtZW50ID0gT2JqZWN0LmFzc2lnbihPYmplY3QuY3JlYXRlKG51bGwpLCB7XG5cdFx0XHRpZDogJ3Jlc3BvbnNlJyxcblx0XHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCdjaGF0LXNlc3Npb246Ly90ZXN0L3Nlc3Npb24nKSxcblx0XHR9KSBhcyBJQ2hhdFJlc3BvbnNlVmlld01vZGVsO1xuXHRcdGNvbnN0IGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0ID0ge1xuXHRcdFx0ZWxlbWVudCxcblx0XHRcdGVsZW1lbnRJbmRleDogMCxcblx0XHRcdGNvbnRhaW5lcjogbWFpbldpbmRvdy5kb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcblx0XHRcdGNvbnRlbnQ6IFtdLFxuXHRcdFx0Y29udGVudEluZGV4OiAwLFxuXHRcdFx0aW5saW5lVGV4dE1vZGVsczogT2JqZWN0LmNyZWF0ZShJbmxpbmVUZXh0TW9kZWxDb2xsZWN0aW9uLnByb3RvdHlwZSkgYXMgSW5saW5lVGV4dE1vZGVsQ29sbGVjdGlvbixcblx0XHRcdGVkaXRvclBvb2wsXG5cdFx0XHRjb2RlQmxvY2tTdGFydEluZGV4OiAwLFxuXHRcdFx0dHJlZVN0YXJ0SW5kZXg6IDAsXG5cdFx0XHRkaWZmRWRpdG9yUG9vbDogT2JqZWN0LmNyZWF0ZShEaWZmRWRpdG9yUG9vbC5wcm90b3R5cGUpIGFzIERpZmZFZGl0b3JQb29sLFxuXHRcdFx0Y3VycmVudFdpZHRoOiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3RXaWR0aCcsIDUwMCksXG5cdFx0XHRvbkRpZENoYW5nZVZpc2liaWxpdHk6IEV2ZW50Lk5vbmUsXG5cdFx0fTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgc3RvcmUpO1xuXHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRDaGF0VG9vbE91dHB1dENvbnRlbnRTdWJQYXJ0LFxuXHRcdFx0Y29udGV4dCxcblx0XHRcdFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6ICdjb2RlJyxcblx0XHRcdFx0XHR0aXRsZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vZmlyc3QnLFxuXHRcdFx0XHRcdGRhdGE6ICdGaXJzdCByZXN1bHQnLFxuXHRcdFx0XHRcdGxhbmd1YWdlSWQ6ICdwbGFpbnRleHQnLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHt9LFxuXHRcdFx0XHRcdGNvZGVCbG9ja0luZGV4OiAwLFxuXHRcdFx0XHRcdG93bmVyTWFya2Rvd25QYXJ0SWQ6ICd0ZXN0Jyxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6ICdjb2RlJyxcblx0XHRcdFx0XHR0aXRsZTogJ2h0dHBzOi8vZXhhbXBsZS5jb20vc2Vjb25kJyxcblx0XHRcdFx0XHRkYXRhOiAnU2Vjb25kIHJlc3VsdCcsXG5cdFx0XHRcdFx0bGFuZ3VhZ2VJZDogJ3BsYWludGV4dCcsXG5cdFx0XHRcdFx0b3B0aW9uczoge30sXG5cdFx0XHRcdFx0Y29kZUJsb2NrSW5kZXg6IDEsXG5cdFx0XHRcdFx0b3duZXJNYXJrZG93blBhcnRJZDogJ3Rlc3QnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dGl0bGVzOiBbLi4ucGFydC5kb21Ob2RlLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LWNvbmZpcm1hdGlvbi13aWRnZXQtdGl0bGUnKV0ubWFwKGVsZW1lbnQgPT4gZWxlbWVudC50ZXh0Q29udGVudCksXG5cdFx0XHRyZW5kZXJlZFRleHRzLFxuXHRcdH0sIHtcblx0XHRcdHRpdGxlczogWydodHRwczovL2V4YW1wbGUuY29tL2ZpcnN0JywgJ2h0dHBzOi8vZXhhbXBsZS5jb20vc2Vjb25kJ10sXG5cdFx0XHRyZW5kZXJlZFRleHRzOiBbJ0ZpcnN0IHJlc3VsdCcsICdTZWNvbmQgcmVzdWx0J10sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGtDQUFrQztBQUUzQyxTQUFTLGdCQUFnQixrQkFBa0I7QUFDM0MsU0FBd0MsaUNBQWlDO0FBQ3pFLFNBQVMsNkNBQTZDO0FBQ3RELFNBQVMsb0NBQW9DO0FBRzdDLE1BQU0seUNBQXlDLE1BQU07QUFDcEQsUUFBTSxRQUFRLHdDQUF3QztBQUV0RCxPQUFLLCtEQUErRCxNQUFNO0FBQ3pFLFVBQU0sZ0JBQWdCLFdBQVcsU0FBUyxjQUFjLEtBQUs7QUFDN0QsVUFBTSxnQkFBZ0IsT0FBTyxPQUFPLGNBQWMsU0FBUztBQUMzRCxXQUFPLGlCQUFpQixlQUFlO0FBQUEsTUFDdEMsU0FBUyxFQUFFLE9BQU8sY0FBYztBQUFBLE1BQ2hDLFFBQVEsRUFBRSxPQUFPLE1BQU07QUFBQSxNQUFFLEVBQUU7QUFBQSxNQUMzQixRQUFRLEVBQUUsT0FBTyxNQUFNO0FBQUEsTUFBRSxFQUFFO0FBQUEsSUFDNUIsQ0FBQztBQUNELFVBQU0sa0JBQXVEO0FBQUEsTUFD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
