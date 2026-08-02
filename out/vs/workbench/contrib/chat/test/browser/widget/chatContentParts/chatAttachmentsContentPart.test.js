import assert from "assert";
import { DisposableStore, toDisposable } from "../../../../../../../base/common/lifecycle.js";
import { mainWindow } from "../../../../../../../base/browser/window.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { DEFAULT_LABELS_CONTAINER, ResourceLabels } from "../../../../../../browser/labels.js";
import { getEffectiveImageOmittedState, ImageAttachmentWidget } from "../../../../browser/attachments/chatAttachmentWidgets.js";
import { ChatAttachmentsContentPart } from "../../../../browser/widget/chatContentParts/chatAttachmentsContentPart.js";
import { AgentHostCompletionReferenceKind, OmittedState, toAgentHostCompletionVariableEntry } from "../../../../common/attachments/chatVariableEntries.js";
import { ILanguageModelsService } from "../../../../common/languageModels.js";
suite("ChatAttachmentsContentPart", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let disposables;
  let instantiationService;
  setup(() => {
    disposables = store.add(new DisposableStore());
    instantiationService = workbenchInstantiationService(void 0, store);
  });
  teardown(() => {
    disposables.dispose();
  });
  function createFileEntry(name, uri) {
    const fileUri = uri ?? URI.file(`/test/${name}`);
    return {
      kind: "file",
      id: `file-${name}`,
      name,
      fullName: fileUri.path,
      value: fileUri
    };
  }
  function createImageEntry(name, buffer, mimeType = "image/png") {
    return {
      kind: "image",
      id: `image-${name}`,
      name,
      value: buffer,
      mimeType,
      isURL: false,
      references: [{ kind: "reference", reference: URI.file(`/test/${name}`) }]
    };
  }
  function setModels(models) {
    instantiationService.stub(ILanguageModelsService, {
      getLanguageModelIds: () => models.map((model) => model.identifier),
      lookupLanguageModel: (identifier) => {
        const model = models.find((model2) => model2.identifier === identifier);
        return model ? {
          extension: new ExtensionIdentifier("test.extension"),
          id: model.id,
          vendor: model.vendor,
          name: model.id,
          version: "1",
          family: model.id,
          maxInputTokens: 1e3,
          maxOutputTokens: 1e3,
          isDefaultForLocation: {},
          capabilities: { vision: model.vision }
        } : void 0;
      }
    });
  }
  suite("updateVariables", () => {
    test("should update variables and re-render", () => {
      const initialVariables = [
        createFileEntry("file1.ts"),
        createFileEntry("file2.ts")
      ];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables: initialVariables }
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode?.remove()));
      const initialAttachments = part.domNode.querySelectorAll(".chat-attached-context-attachment");
      assert.strictEqual(initialAttachments.length, 2, "Should have 2 initial attachments");
      const newVariables = [
        createFileEntry("file1.ts"),
        createFileEntry("file2.ts"),
        createFileEntry("file3.ts")
      ];
      part.updateVariables(newVariables);
      const updatedAttachments = part.domNode.querySelectorAll(".chat-attached-context-attachment");
      assert.strictEqual(updatedAttachments.length, 3, "Should have 3 attachments after update");
    });
    test("should handle updating from file to image", () => {
      const initialVariables = [
        createFileEntry("image.png")
      ];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables: initialVariables }
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode?.remove()));
      assert.strictEqual(part.domNode.querySelectorAll(".chat-attached-context-attachment").length, 1);
      const imageBuffer = new Uint8Array([137, 80, 78, 71]);
      const newVariables = [
        createImageEntry("image.png", imageBuffer)
      ];
      part.updateVariables(newVariables);
      const updatedAttachments = part.domNode.querySelectorAll(".chat-attached-context-attachment");
      assert.strictEqual(updatedAttachments.length, 1, "Should have 1 attachment after update");
      assert.ok(updatedAttachments[0].classList.contains("image-attachment"), "Image attachment should have styling class");
    });
    test("should preserve contextMenuHandler after update", () => {
      const initialVariables = [
        createFileEntry("file1.ts")
      ];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables: initialVariables }
      ));
      const handler = () => {
      };
      part.contextMenuHandler = handler;
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode?.remove()));
      const newVariables = [
        createFileEntry("file1.ts"),
        createFileEntry("file2.ts")
      ];
      part.updateVariables(newVariables);
      assert.strictEqual(part.contextMenuHandler, handler, "contextMenuHandler should be preserved after update");
    });
    test("should handle empty variables array", () => {
      const initialVariables = [
        createFileEntry("file1.ts")
      ];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables: initialVariables }
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode?.remove()));
      assert.strictEqual(part.domNode.querySelectorAll(".chat-attached-context-attachment").length, 1);
      part.updateVariables([]);
      const updatedAttachments = part.domNode.querySelectorAll(".chat-attached-context-attachment");
      assert.strictEqual(updatedAttachments.length, 0, "Should have 0 attachments after clearing");
    });
    test("should handle updating same variables (no-op)", () => {
      const variables = [
        createFileEntry("file1.ts"),
        createFileEntry("file2.ts")
      ];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables }
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode?.remove()));
      part.updateVariables([...variables]);
      const updatedAttachments = part.domNode.querySelectorAll(".chat-attached-context-attachment");
      assert.strictEqual(updatedAttachments.length, 2, "Should still have 2 attachments");
    });
  });
  suite("basic rendering", () => {
    test("should render file attachments", () => {
      const variables = [
        createFileEntry("file1.ts"),
        createFileEntry("file2.ts")
      ];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables }
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode?.remove()));
      const attachments = part.domNode.querySelectorAll(".chat-attached-context-attachment");
      assert.strictEqual(attachments.length, 2, "Should render 2 file attachments");
    });
    test("should not render agent host completion references as attachments", () => {
      const variables = [
        createFileEntry("file1.ts"),
        toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, "/rename", "rename", void 0),
        toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, "/agent-host-docs", "file:///skills/agent-host-docs/SKILL.md", void 0)
      ];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables }
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode?.remove()));
      const attachments = part.domNode.querySelectorAll(".chat-attached-context-attachment");
      assert.strictEqual(attachments.length, 1, "Should only render the file attachment");
    });
    test("should not count agent host completion references in show more label", () => {
      const variables = [
        createFileEntry("file1.ts"),
        toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Command, "/rename", "rename", void 0),
        toAgentHostCompletionVariableEntry(AgentHostCompletionReferenceKind.Skill, "/agent-host-docs", "file:///skills/agent-host-docs/SKILL.md", void 0),
        createFileEntry("file2.ts")
      ];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables, limit: 1 }
      ));
      mainWindow.document.body.appendChild(part.domNode);
      disposables.add(toDisposable(() => part.domNode?.remove()));
      const showMoreLabel = part.domNode.querySelector(".chat-attachments-show-more-button .chat-attached-context-custom-text")?.textContent;
      assert.strictEqual(showMoreLabel, "1 more");
    });
    test("should have chat-attached-context class on domNode", () => {
      const variables = [createFileEntry("file.ts")];
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables }
      ));
      assert.ok(part.domNode.classList.contains("chat-attached-context"), "Should have chat-attached-context class");
    });
    test("should mark images omitted when the routed model does not support vision", () => {
      setModels([
        { identifier: "copilot/auto", id: "auto", vendor: "copilot", vision: false },
        { identifier: "other/test-non-vision", id: "test-non-vision", vendor: "other", vision: true },
        { identifier: "copilot/test-non-vision", id: "test-non-vision", vendor: "copilot", vision: false }
      ]);
      const image = createImageEntry("image.png", new Uint8Array([1, 2, 3]));
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables: [image], modelId: "copilot/auto", resolvedModelId: "test-non-vision" }
      ));
      const attachment = part.domNode.querySelector(".image-attachment");
      assert.deepStrictEqual({
        omittedState: image.omittedState,
        ariaLabel: attachment?.ariaLabel,
        isWarning: attachment?.classList.contains("warning")
      }, {
        omittedState: void 0,
        ariaLabel: "Image not sent because test-non-vision does not support images: image.png",
        isWarning: true
      });
    });
    test("should not mark images omitted for Auto before routing", () => {
      setModels([{ identifier: "copilot/auto", id: "copilot/auto", vendor: "copilot", vision: false }]);
      const image = createImageEntry("image.png", new Uint8Array([1, 2, 3]));
      const part = store.add(instantiationService.createInstance(
        ChatAttachmentsContentPart,
        { variables: [image], modelId: "copilot/auto" }
      ));
      const attachment = part.domNode.querySelector(".image-attachment");
      assert.deepStrictEqual({
        omittedState: image.omittedState,
        ariaLabel: attachment?.ariaLabel,
        isWarning: attachment?.classList.contains("warning"),
        isAutoWarning: attachment?.classList.contains("auto-image-warning"),
        hasWarningIcon: !!attachment?.querySelector(".codicon-warning")
      }, {
        omittedState: void 0,
        ariaLabel: "Attached image, image.png. Image support depends on the model selected by Auto.",
        isWarning: false,
        isAutoWarning: true,
        hasWarningIcon: false
      });
    });
    test("should ignore a stale omitted state when editing with Auto", () => {
      const autoModel = {
        identifier: "copilot/auto",
        metadata: {
          extension: new ExtensionIdentifier("test.extension"),
          id: "copilot/auto",
          vendor: "copilot",
          name: "Auto",
          version: "1",
          family: "auto",
          maxInputTokens: 1e3,
          maxOutputTokens: 1e3,
          isDefaultForLocation: {}
        }
      };
      assert.strictEqual(getEffectiveImageOmittedState(OmittedState.Full, autoModel, true), OmittedState.NotOmitted);
    });
    suite("hydrated image attachments", () => {
      async function renderImageAndCollectReads(image) {
        const fileService = instantiationService.get(IFileService);
        const part = store.add(instantiationService.createInstance(
          ChatAttachmentsContentPart,
          { variables: [image] }
        ));
        mainWindow.document.body.appendChild(part.domNode);
        disposables.add(toDisposable(() => part.domNode?.remove()));
        await new Promise((resolve) => setTimeout(resolve, 0));
        return fileService.readOperations.map((read) => read.resource.toString());
      }
      test("should load bytes from the resource for a hydrated (uri-only) image", async () => {
        const resource = URI.file("/test/pasted-image.png");
        const reads = await renderImageAndCollectReads({
          kind: "image",
          id: "hydrated-image",
          name: "pasted-image.png",
          value: resource,
          mimeType: "image/png",
          isURL: true,
          references: [{ kind: "reference", reference: resource }]
        });
        assert.deepStrictEqual(reads, [resource.toString()]);
      });
      test("should not read the resource for an image with inline bytes", async () => {
        const resource = URI.file("/test/inline-image.png");
        const reads = await renderImageAndCollectReads({
          kind: "image",
          id: "inline-image",
          name: "inline-image.png",
          value: new Uint8Array([137, 80, 78, 71]),
          mimeType: "image/png",
          isURL: false,
          references: [{ kind: "reference", reference: resource }]
        });
        assert.deepStrictEqual(reads, []);
      });
      test("should keep delete hint after loading hydrated image bytes", async () => {
        const resource = URI.file("/test/pasted-image.png");
        const container = mainWindow.document.createElement("div");
        mainWindow.document.body.appendChild(container);
        disposables.add(toDisposable(() => container.remove()));
        const contextResourceLabels = disposables.add(instantiationService.createInstance(ResourceLabels, DEFAULT_LABELS_CONTAINER));
        const widget = disposables.add(instantiationService.createInstance(
          ImageAttachmentWidget,
          resource,
          {
            kind: "image",
            id: "hydrated-image-with-delete",
            name: "pasted-image.png",
            value: resource,
            mimeType: "image/png",
            isURL: true,
            references: [{ kind: "reference", reference: resource }]
          },
          void 0,
          { shouldFocusClearButton: false, supportsDeletion: true },
          container,
          contextResourceLabels
        ));
        await new Promise((resolve) => setTimeout(resolve, 0));
        assert.strictEqual(widget.element.ariaLabel, "Attached image, pasted-image.png (Delete)");
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3dpZGdldC9jaGF0Q29udGVudFBhcnRzL2NoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBtYWluV2luZG93IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgVGVzdEZpbGVTZXJ2aWNlLCB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9MQUJFTFNfQ09OVEFJTkVSLCBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IGdldEVmZmVjdGl2ZUltYWdlT21pdHRlZFN0YXRlLCBJbWFnZUF0dGFjaG1lbnRXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXRBdHRhY2htZW50V2lkZ2V0cy5qcyc7XG5pbXBvcnQgeyBDaGF0QXR0YWNobWVudHNDb250ZW50UGFydCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd2lkZ2V0L2NoYXRDb250ZW50UGFydHMvY2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQsIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIE9taXR0ZWRTdGF0ZSwgdG9BZ2VudEhvc3RDb21wbGV0aW9uVmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2xhbmd1YWdlTW9kZWxzLmpzJztcblxuc3VpdGUoJ0NoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0JywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBSZXR1cm5UeXBlPHR5cGVvZiB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZT47XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gc3RvcmUuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIHN0b3JlKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlRmlsZUVudHJ5KG5hbWU6IHN0cmluZywgdXJpPzogVVJJKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB7XG5cdFx0Y29uc3QgZmlsZVVyaSA9IHVyaSA/PyBVUkkuZmlsZShgL3Rlc3QvJHtuYW1lfWApO1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnZmlsZScsXG5cdFx0XHRpZDogYGZpbGUtJHtuYW1lfWAsXG5cdFx0XHRuYW1lLFxuXHRcdFx0ZnVsbE5hbWU6IGZpbGVVcmkucGF0aCxcblx0XHRcdHZhbHVlOiBmaWxlVXJpXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUltYWdlRW50cnkobmFtZTogc3RyaW5nLCBidWZmZXI6IFVpbnQ4QXJyYXksIG1pbWVUeXBlOiBzdHJpbmcgPSAnaW1hZ2UvcG5nJyk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnaW1hZ2UnLFxuXHRcdFx0aWQ6IGBpbWFnZS0ke25hbWV9YCxcblx0XHRcdG5hbWUsXG5cdFx0XHR2YWx1ZTogYnVmZmVyLFxuXHRcdFx0bWltZVR5cGUsXG5cdFx0XHRpc1VSTDogZmFsc2UsXG5cdFx0XHRyZWZlcmVuY2VzOiBbeyBraW5kOiAncmVmZXJlbmNlJywgcmVmZXJlbmNlOiBVUkkuZmlsZShgL3Rlc3QvJHtuYW1lfWApIH1dXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNldE1vZGVscyhtb2RlbHM6IFJlYWRvbmx5QXJyYXk8eyBpZGVudGlmaWVyOiBzdHJpbmc7IGlkOiBzdHJpbmc7IHZlbmRvcjogc3RyaW5nOyB2aXNpb246IGJvb2xlYW4gfT4pOiB2b2lkIHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIHtcblx0XHRcdGdldExhbmd1YWdlTW9kZWxJZHM6ICgpID0+IG1vZGVscy5tYXAobW9kZWwgPT4gbW9kZWwuaWRlbnRpZmllciksXG5cdFx0XHRsb29rdXBMYW5ndWFnZU1vZGVsOiBpZGVudGlmaWVyID0+IHtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBtb2RlbHMuZmluZChtb2RlbCA9PiBtb2RlbC5pZGVudGlmaWVyID09PSBpZGVudGlmaWVyKTtcblx0XHRcdFx0cmV0dXJuIG1vZGVsID8ge1xuXHRcdFx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QuZXh0ZW5zaW9uJyksXG5cdFx0XHRcdFx0aWQ6IG1vZGVsLmlkLFxuXHRcdFx0XHRcdHZlbmRvcjogbW9kZWwudmVuZG9yLFxuXHRcdFx0XHRcdG5hbWU6IG1vZGVsLmlkLFxuXHRcdFx0XHRcdHZlcnNpb246ICcxJyxcblx0XHRcdFx0XHRmYW1pbHk6IG1vZGVsLmlkLFxuXHRcdFx0XHRcdG1heElucHV0VG9rZW5zOiAxMDAwLFxuXHRcdFx0XHRcdG1heE91dHB1dFRva2VuczogMTAwMCxcblx0XHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0XHRcdFx0Y2FwYWJpbGl0aWVzOiB7IHZpc2lvbjogbW9kZWwudmlzaW9uIH0sXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIDogdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHR9IGFzIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UpO1xuXHR9XG5cblx0c3VpdGUoJ3VwZGF0ZVZhcmlhYmxlcycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgdXBkYXRlIHZhcmlhYmxlcyBhbmQgcmUtcmVuZGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5pdGlhbFZhcmlhYmxlczogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW1xuXHRcdFx0XHRjcmVhdGVGaWxlRW50cnkoJ2ZpbGUxLnRzJyksXG5cdFx0XHRcdGNyZWF0ZUZpbGVFbnRyeSgnZmlsZTIudHMnKVxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQsXG5cdFx0XHRcdHsgdmFyaWFibGVzOiBpbml0aWFsVmFyaWFibGVzIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlISk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZT8ucmVtb3ZlKCkpKTtcblxuXHRcdFx0Ly8gSW5pdGlhbCBzdGF0ZSBzaG91bGQgaGF2ZSAyIGF0dGFjaG1lbnRzXG5cdFx0XHRjb25zdCBpbml0aWFsQXR0YWNobWVudHMgPSBwYXJ0LmRvbU5vZGUhLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LWF0dGFjaGVkLWNvbnRleHQtYXR0YWNobWVudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluaXRpYWxBdHRhY2htZW50cy5sZW5ndGgsIDIsICdTaG91bGQgaGF2ZSAyIGluaXRpYWwgYXR0YWNobWVudHMnKTtcblxuXHRcdFx0Ly8gVXBkYXRlIHdpdGggbmV3IHZhcmlhYmxlc1xuXHRcdFx0Y29uc3QgbmV3VmFyaWFibGVzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXG5cdFx0XHRcdGNyZWF0ZUZpbGVFbnRyeSgnZmlsZTEudHMnKSxcblx0XHRcdFx0Y3JlYXRlRmlsZUVudHJ5KCdmaWxlMi50cycpLFxuXHRcdFx0XHRjcmVhdGVGaWxlRW50cnkoJ2ZpbGUzLnRzJylcblx0XHRcdF07XG5cblx0XHRcdHBhcnQudXBkYXRlVmFyaWFibGVzKG5ld1ZhcmlhYmxlcyk7XG5cblx0XHRcdC8vIFNob3VsZCBub3cgaGF2ZSAzIGF0dGFjaG1lbnRzXG5cdFx0XHRjb25zdCB1cGRhdGVkQXR0YWNobWVudHMgPSBwYXJ0LmRvbU5vZGUhLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LWF0dGFjaGVkLWNvbnRleHQtYXR0YWNobWVudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVwZGF0ZWRBdHRhY2htZW50cy5sZW5ndGgsIDMsICdTaG91bGQgaGF2ZSAzIGF0dGFjaG1lbnRzIGFmdGVyIHVwZGF0ZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSB1cGRhdGluZyBmcm9tIGZpbGUgdG8gaW1hZ2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbml0aWFsVmFyaWFibGVzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXG5cdFx0XHRcdGNyZWF0ZUZpbGVFbnRyeSgnaW1hZ2UucG5nJylcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHR7IHZhcmlhYmxlczogaW5pdGlhbFZhcmlhYmxlcyB9XG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSEpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGU/LnJlbW92ZSgpKSk7XG5cblx0XHRcdC8vIEluaXRpYWwgc3RhdGUgc2hvdWxkIGhhdmUgMSBmaWxlIGF0dGFjaG1lbnRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmRvbU5vZGUhLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LWF0dGFjaGVkLWNvbnRleHQtYXR0YWNobWVudCcpLmxlbmd0aCwgMSk7XG5cblx0XHRcdC8vIFVwZGF0ZSB3aXRoIGltYWdlIGVudHJ5IChzaW11bGF0aW5nIGxhenkgbG9hZCBjb21wbGV0aW9uKVxuXHRcdFx0Y29uc3QgaW1hZ2VCdWZmZXIgPSBuZXcgVWludDhBcnJheShbMHg4OSwgMHg1MCwgMHg0RSwgMHg0N10pOyAvLyBQTkcgaGVhZGVyXG5cdFx0XHRjb25zdCBuZXdWYXJpYWJsZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtcblx0XHRcdFx0Y3JlYXRlSW1hZ2VFbnRyeSgnaW1hZ2UucG5nJywgaW1hZ2VCdWZmZXIpXG5cdFx0XHRdO1xuXG5cdFx0XHRwYXJ0LnVwZGF0ZVZhcmlhYmxlcyhuZXdWYXJpYWJsZXMpO1xuXG5cdFx0XHQvLyBTaG91bGQgc3RpbGwgaGF2ZSAxIGF0dGFjaG1lbnQgKG5vdyBhcyBpbWFnZSlcblx0XHRcdGNvbnN0IHVwZGF0ZWRBdHRhY2htZW50cyA9IHBhcnQuZG9tTm9kZSEucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtYXR0YWNoZWQtY29udGV4dC1hdHRhY2htZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXBkYXRlZEF0dGFjaG1lbnRzLmxlbmd0aCwgMSwgJ1Nob3VsZCBoYXZlIDEgYXR0YWNobWVudCBhZnRlciB1cGRhdGUnKTtcblx0XHRcdGFzc2VydC5vayh1cGRhdGVkQXR0YWNobWVudHNbMF0uY2xhc3NMaXN0LmNvbnRhaW5zKCdpbWFnZS1hdHRhY2htZW50JyksICdJbWFnZSBhdHRhY2htZW50IHNob3VsZCBoYXZlIHN0eWxpbmcgY2xhc3MnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBwcmVzZXJ2ZSBjb250ZXh0TWVudUhhbmRsZXIgYWZ0ZXIgdXBkYXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5pdGlhbFZhcmlhYmxlczogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW1xuXHRcdFx0XHRjcmVhdGVGaWxlRW50cnkoJ2ZpbGUxLnRzJylcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHR7IHZhcmlhYmxlczogaW5pdGlhbFZhcmlhYmxlcyB9XG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgaGFuZGxlciA9ICgpID0+IHsgLyogaGFuZGxlciBsb2dpYyAqLyB9O1xuXHRcdFx0cGFydC5jb250ZXh0TWVudUhhbmRsZXIgPSBoYW5kbGVyO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlISk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZT8ucmVtb3ZlKCkpKTtcblxuXHRcdFx0Ly8gVXBkYXRlIHdpdGggbmV3IHZhcmlhYmxlc1xuXHRcdFx0Y29uc3QgbmV3VmFyaWFibGVzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXG5cdFx0XHRcdGNyZWF0ZUZpbGVFbnRyeSgnZmlsZTEudHMnKSxcblx0XHRcdFx0Y3JlYXRlRmlsZUVudHJ5KCdmaWxlMi50cycpXG5cdFx0XHRdO1xuXG5cdFx0XHRwYXJ0LnVwZGF0ZVZhcmlhYmxlcyhuZXdWYXJpYWJsZXMpO1xuXG5cdFx0XHQvLyBUaGUgaGFuZGxlciBwcm9wZXJ0eSBzaG91bGQgYmUgcHJlc2VydmVkICh1cGRhdGVWYXJpYWJsZXMgZG9lc24ndCBjbGVhciBpdClcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmNvbnRleHRNZW51SGFuZGxlciwgaGFuZGxlciwgJ2NvbnRleHRNZW51SGFuZGxlciBzaG91bGQgYmUgcHJlc2VydmVkIGFmdGVyIHVwZGF0ZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBlbXB0eSB2YXJpYWJsZXMgYXJyYXknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbml0aWFsVmFyaWFibGVzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXG5cdFx0XHRcdGNyZWF0ZUZpbGVFbnRyeSgnZmlsZTEudHMnKVxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQsXG5cdFx0XHRcdHsgdmFyaWFibGVzOiBpbml0aWFsVmFyaWFibGVzIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlISk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZT8ucmVtb3ZlKCkpKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQuZG9tTm9kZSEucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtYXR0YWNoZWQtY29udGV4dC1hdHRhY2htZW50JykubGVuZ3RoLCAxKTtcblxuXHRcdFx0Ly8gVXBkYXRlIHdpdGggZW1wdHkgYXJyYXlcblx0XHRcdHBhcnQudXBkYXRlVmFyaWFibGVzKFtdKTtcblxuXHRcdFx0Ly8gU2hvdWxkIGhhdmUgbm8gYXR0YWNobWVudHNcblx0XHRcdGNvbnN0IHVwZGF0ZWRBdHRhY2htZW50cyA9IHBhcnQuZG9tTm9kZSEucXVlcnlTZWxlY3RvckFsbCgnLmNoYXQtYXR0YWNoZWQtY29udGV4dC1hdHRhY2htZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXBkYXRlZEF0dGFjaG1lbnRzLmxlbmd0aCwgMCwgJ1Nob3VsZCBoYXZlIDAgYXR0YWNobWVudHMgYWZ0ZXIgY2xlYXJpbmcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgdXBkYXRpbmcgc2FtZSB2YXJpYWJsZXMgKG5vLW9wKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHZhcmlhYmxlczogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW1xuXHRcdFx0XHRjcmVhdGVGaWxlRW50cnkoJ2ZpbGUxLnRzJyksXG5cdFx0XHRcdGNyZWF0ZUZpbGVFbnRyeSgnZmlsZTIudHMnKVxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQsXG5cdFx0XHRcdHsgdmFyaWFibGVzIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlISk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZT8ucmVtb3ZlKCkpKTtcblxuXHRcdFx0Ly8gVXBkYXRlIHdpdGggc2FtZSB2YXJpYWJsZXMgKGRpZmZlcmVudCBhcnJheSwgc2FtZSBjb250ZW50KVxuXHRcdFx0cGFydC51cGRhdGVWYXJpYWJsZXMoWy4uLnZhcmlhYmxlc10pO1xuXG5cdFx0XHQvLyBTaG91bGQgcmUtcmVuZGVyICh3ZSBkb24ndCBvcHRpbWl6ZSBmb3Igc2FtZSBjb250ZW50KVxuXHRcdFx0Y29uc3QgdXBkYXRlZEF0dGFjaG1lbnRzID0gcGFydC5kb21Ob2RlIS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1hdHRhY2hlZC1jb250ZXh0LWF0dGFjaG1lbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1cGRhdGVkQXR0YWNobWVudHMubGVuZ3RoLCAyLCAnU2hvdWxkIHN0aWxsIGhhdmUgMiBhdHRhY2htZW50cycpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYmFzaWMgcmVuZGVyaW5nJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCByZW5kZXIgZmlsZSBhdHRhY2htZW50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHZhcmlhYmxlczogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW1xuXHRcdFx0XHRjcmVhdGVGaWxlRW50cnkoJ2ZpbGUxLnRzJyksXG5cdFx0XHRcdGNyZWF0ZUZpbGVFbnRyeSgnZmlsZTIudHMnKVxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQsXG5cdFx0XHRcdHsgdmFyaWFibGVzIH1cblx0XHRcdCkpO1xuXG5cdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQocGFydC5kb21Ob2RlISk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZT8ucmVtb3ZlKCkpKTtcblxuXHRcdFx0Y29uc3QgYXR0YWNobWVudHMgPSBwYXJ0LmRvbU5vZGUhLnF1ZXJ5U2VsZWN0b3JBbGwoJy5jaGF0LWF0dGFjaGVkLWNvbnRleHQtYXR0YWNobWVudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF0dGFjaG1lbnRzLmxlbmd0aCwgMiwgJ1Nob3VsZCByZW5kZXIgMiBmaWxlIGF0dGFjaG1lbnRzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IHJlbmRlciBhZ2VudCBob3N0IGNvbXBsZXRpb24gcmVmZXJlbmNlcyBhcyBhdHRhY2htZW50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHZhcmlhYmxlczogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW1xuXHRcdFx0XHRjcmVhdGVGaWxlRW50cnkoJ2ZpbGUxLnRzJyksXG5cdFx0XHRcdHRvQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnkoQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQuQ29tbWFuZCwgJy9yZW5hbWUnLCAncmVuYW1lJywgdW5kZWZpbmVkKSxcblx0XHRcdFx0dG9BZ2VudEhvc3RDb21wbGV0aW9uVmFyaWFibGVFbnRyeShBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZC5Ta2lsbCwgJy9hZ2VudC1ob3N0LWRvY3MnLCAnZmlsZTovLy9za2lsbHMvYWdlbnQtaG9zdC1kb2NzL1NLSUxMLm1kJywgdW5kZWZpbmVkKSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHR7IHZhcmlhYmxlcyB9XG5cdFx0XHQpKTtcblxuXHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSEpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBwYXJ0LmRvbU5vZGU/LnJlbW92ZSgpKSk7XG5cblx0XHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gcGFydC5kb21Ob2RlIS5xdWVyeVNlbGVjdG9yQWxsKCcuY2hhdC1hdHRhY2hlZC1jb250ZXh0LWF0dGFjaG1lbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhdHRhY2htZW50cy5sZW5ndGgsIDEsICdTaG91bGQgb25seSByZW5kZXIgdGhlIGZpbGUgYXR0YWNobWVudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBjb3VudCBhZ2VudCBob3N0IGNvbXBsZXRpb24gcmVmZXJlbmNlcyBpbiBzaG93IG1vcmUgbGFiZWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB2YXJpYWJsZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtcblx0XHRcdFx0Y3JlYXRlRmlsZUVudHJ5KCdmaWxlMS50cycpLFxuXHRcdFx0XHR0b0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5KEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLkNvbW1hbmQsICcvcmVuYW1lJywgJ3JlbmFtZScsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHRvQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnkoQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQuU2tpbGwsICcvYWdlbnQtaG9zdC1kb2NzJywgJ2ZpbGU6Ly8vc2tpbGxzL2FnZW50LWhvc3QtZG9jcy9TS0lMTC5tZCcsIHVuZGVmaW5lZCksXG5cdFx0XHRcdGNyZWF0ZUZpbGVFbnRyeSgnZmlsZTIudHMnKSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHR7IHZhcmlhYmxlcywgbGltaXQ6IDEgfVxuXHRcdFx0KSk7XG5cblx0XHRcdG1haW5XaW5kb3cuZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChwYXJ0LmRvbU5vZGUhKTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gcGFydC5kb21Ob2RlPy5yZW1vdmUoKSkpO1xuXG5cdFx0XHRjb25zdCBzaG93TW9yZUxhYmVsID0gcGFydC5kb21Ob2RlIS5xdWVyeVNlbGVjdG9yKCcuY2hhdC1hdHRhY2htZW50cy1zaG93LW1vcmUtYnV0dG9uIC5jaGF0LWF0dGFjaGVkLWNvbnRleHQtY3VzdG9tLXRleHQnKT8udGV4dENvbnRlbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2hvd01vcmVMYWJlbCwgJzEgbW9yZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhdmUgY2hhdC1hdHRhY2hlZC1jb250ZXh0IGNsYXNzIG9uIGRvbU5vZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB2YXJpYWJsZXM6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSA9IFtjcmVhdGVGaWxlRW50cnkoJ2ZpbGUudHMnKV07XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHR7IHZhcmlhYmxlcyB9XG5cdFx0XHQpKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHBhcnQuZG9tTm9kZSEuY2xhc3NMaXN0LmNvbnRhaW5zKCdjaGF0LWF0dGFjaGVkLWNvbnRleHQnKSwgJ1Nob3VsZCBoYXZlIGNoYXQtYXR0YWNoZWQtY29udGV4dCBjbGFzcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG1hcmsgaW1hZ2VzIG9taXR0ZWQgd2hlbiB0aGUgcm91dGVkIG1vZGVsIGRvZXMgbm90IHN1cHBvcnQgdmlzaW9uJywgKCkgPT4ge1xuXHRcdFx0c2V0TW9kZWxzKFtcblx0XHRcdFx0eyBpZGVudGlmaWVyOiAnY29waWxvdC9hdXRvJywgaWQ6ICdhdXRvJywgdmVuZG9yOiAnY29waWxvdCcsIHZpc2lvbjogZmFsc2UgfSxcblx0XHRcdFx0eyBpZGVudGlmaWVyOiAnb3RoZXIvdGVzdC1ub24tdmlzaW9uJywgaWQ6ICd0ZXN0LW5vbi12aXNpb24nLCB2ZW5kb3I6ICdvdGhlcicsIHZpc2lvbjogdHJ1ZSB9LFxuXHRcdFx0XHR7IGlkZW50aWZpZXI6ICdjb3BpbG90L3Rlc3Qtbm9uLXZpc2lvbicsIGlkOiAndGVzdC1ub24tdmlzaW9uJywgdmVuZG9yOiAnY29waWxvdCcsIHZpc2lvbjogZmFsc2UgfSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgaW1hZ2UgPSBjcmVhdGVJbWFnZUVudHJ5KCdpbWFnZS5wbmcnLCBuZXcgVWludDhBcnJheShbMSwgMiwgM10pKTtcblxuXHRcdFx0Y29uc3QgcGFydCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQsXG5cdFx0XHRcdHsgdmFyaWFibGVzOiBbaW1hZ2VdLCBtb2RlbElkOiAnY29waWxvdC9hdXRvJywgcmVzb2x2ZWRNb2RlbElkOiAndGVzdC1ub24tdmlzaW9uJyB9XG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgYXR0YWNobWVudCA9IHBhcnQuZG9tTm9kZSEucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy5pbWFnZS1hdHRhY2htZW50Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0b21pdHRlZFN0YXRlOiBpbWFnZS5vbWl0dGVkU3RhdGUsXG5cdFx0XHRcdGFyaWFMYWJlbDogYXR0YWNobWVudD8uYXJpYUxhYmVsLFxuXHRcdFx0XHRpc1dhcm5pbmc6IGF0dGFjaG1lbnQ/LmNsYXNzTGlzdC5jb250YWlucygnd2FybmluZycpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRvbWl0dGVkU3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0YXJpYUxhYmVsOiAnSW1hZ2Ugbm90IHNlbnQgYmVjYXVzZSB0ZXN0LW5vbi12aXNpb24gZG9lcyBub3Qgc3VwcG9ydCBpbWFnZXM6IGltYWdlLnBuZycsXG5cdFx0XHRcdGlzV2FybmluZzogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBtYXJrIGltYWdlcyBvbWl0dGVkIGZvciBBdXRvIGJlZm9yZSByb3V0aW5nJywgKCkgPT4ge1xuXHRcdFx0c2V0TW9kZWxzKFt7IGlkZW50aWZpZXI6ICdjb3BpbG90L2F1dG8nLCBpZDogJ2NvcGlsb3QvYXV0bycsIHZlbmRvcjogJ2NvcGlsb3QnLCB2aXNpb246IGZhbHNlIH1dKTtcblx0XHRcdGNvbnN0IGltYWdlID0gY3JlYXRlSW1hZ2VFbnRyeSgnaW1hZ2UucG5nJywgbmV3IFVpbnQ4QXJyYXkoWzEsIDIsIDNdKSk7XG5cblx0XHRcdGNvbnN0IHBhcnQgPSBzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdENoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHR7IHZhcmlhYmxlczogW2ltYWdlXSwgbW9kZWxJZDogJ2NvcGlsb3QvYXV0bycgfVxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IGF0dGFjaG1lbnQgPSBwYXJ0LmRvbU5vZGUhLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuaW1hZ2UtYXR0YWNobWVudCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdG9taXR0ZWRTdGF0ZTogaW1hZ2Uub21pdHRlZFN0YXRlLFxuXHRcdFx0XHRhcmlhTGFiZWw6IGF0dGFjaG1lbnQ/LmFyaWFMYWJlbCxcblx0XHRcdFx0aXNXYXJuaW5nOiBhdHRhY2htZW50Py5jbGFzc0xpc3QuY29udGFpbnMoJ3dhcm5pbmcnKSxcblx0XHRcdFx0aXNBdXRvV2FybmluZzogYXR0YWNobWVudD8uY2xhc3NMaXN0LmNvbnRhaW5zKCdhdXRvLWltYWdlLXdhcm5pbmcnKSxcblx0XHRcdFx0aGFzV2FybmluZ0ljb246ICEhYXR0YWNobWVudD8ucXVlcnlTZWxlY3RvcignLmNvZGljb24td2FybmluZycpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRvbWl0dGVkU3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0YXJpYUxhYmVsOiAnQXR0YWNoZWQgaW1hZ2UsIGltYWdlLnBuZy4gSW1hZ2Ugc3VwcG9ydCBkZXBlbmRzIG9uIHRoZSBtb2RlbCBzZWxlY3RlZCBieSBBdXRvLicsXG5cdFx0XHRcdGlzV2FybmluZzogZmFsc2UsXG5cdFx0XHRcdGlzQXV0b1dhcm5pbmc6IHRydWUsXG5cdFx0XHRcdGhhc1dhcm5pbmdJY29uOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGlnbm9yZSBhIHN0YWxlIG9taXR0ZWQgc3RhdGUgd2hlbiBlZGl0aW5nIHdpdGggQXV0bycsICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dG9Nb2RlbCA9IHtcblx0XHRcdFx0aWRlbnRpZmllcjogJ2NvcGlsb3QvYXV0bycsXG5cdFx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdC5leHRlbnNpb24nKSxcblx0XHRcdFx0XHRpZDogJ2NvcGlsb3QvYXV0bycsXG5cdFx0XHRcdFx0dmVuZG9yOiAnY29waWxvdCcsXG5cdFx0XHRcdFx0bmFtZTogJ0F1dG8nLFxuXHRcdFx0XHRcdHZlcnNpb246ICcxJyxcblx0XHRcdFx0XHRmYW1pbHk6ICdhdXRvJyxcblx0XHRcdFx0XHRtYXhJbnB1dFRva2VuczogMTAwMCxcblx0XHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDEwMDAsXG5cdFx0XHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdFx0XHR9XG5cdFx0XHR9IHNhdGlzZmllcyB7IGlkZW50aWZpZXI6IHN0cmluZzsgbWV0YWRhdGE6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIH07XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRFZmZlY3RpdmVJbWFnZU9taXR0ZWRTdGF0ZShPbWl0dGVkU3RhdGUuRnVsbCwgYXV0b01vZGVsLCB0cnVlKSwgT21pdHRlZFN0YXRlLk5vdE9taXR0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2h5ZHJhdGVkIGltYWdlIGF0dGFjaG1lbnRzJywgKCkgPT4ge1xuXHRcdFx0YXN5bmMgZnVuY3Rpb24gcmVuZGVySW1hZ2VBbmRDb2xsZWN0UmVhZHMoaW1hZ2U6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0XHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElGaWxlU2VydmljZSkgYXMgVGVzdEZpbGVTZXJ2aWNlO1xuXHRcdFx0XHRjb25zdCBwYXJ0ID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdENoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0LFxuXHRcdFx0XHRcdHsgdmFyaWFibGVzOiBbaW1hZ2VdIH1cblx0XHRcdFx0KSk7XG5cblx0XHRcdFx0bWFpbldpbmRvdy5kb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKHBhcnQuZG9tTm9kZSEpO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHBhcnQuZG9tTm9kZT8ucmVtb3ZlKCkpKTtcblxuXHRcdFx0XHQvLyBMZXQgdGhlIHdpZGdldCdzIGxhenkgYnl0ZSBsb2FkIChhIG1pY3JvdGFzaykgc2V0dGxlIGJlZm9yZSBpbnNwZWN0aW5nIHJlYWRzLlxuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMCkpO1xuXG5cdFx0XHRcdHJldHVybiBmaWxlU2VydmljZS5yZWFkT3BlcmF0aW9ucy5tYXAocmVhZCA9PiByZWFkLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHR0ZXN0KCdzaG91bGQgbG9hZCBieXRlcyBmcm9tIHRoZSByZXNvdXJjZSBmb3IgYSBoeWRyYXRlZCAodXJpLW9ubHkpIGltYWdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5maWxlKCcvdGVzdC9wYXN0ZWQtaW1hZ2UucG5nJyk7XG5cdFx0XHRcdGNvbnN0IHJlYWRzID0gYXdhaXQgcmVuZGVySW1hZ2VBbmRDb2xsZWN0UmVhZHMoe1xuXHRcdFx0XHRcdGtpbmQ6ICdpbWFnZScsXG5cdFx0XHRcdFx0aWQ6ICdoeWRyYXRlZC1pbWFnZScsXG5cdFx0XHRcdFx0bmFtZTogJ3Bhc3RlZC1pbWFnZS5wbmcnLFxuXHRcdFx0XHRcdHZhbHVlOiByZXNvdXJjZSxcblx0XHRcdFx0XHRtaW1lVHlwZTogJ2ltYWdlL3BuZycsXG5cdFx0XHRcdFx0aXNVUkw6IHRydWUsXG5cdFx0XHRcdFx0cmVmZXJlbmNlczogW3sga2luZDogJ3JlZmVyZW5jZScsIHJlZmVyZW5jZTogcmVzb3VyY2UgfV1cblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWFkcywgW3Jlc291cmNlLnRvU3RyaW5nKCldKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgbm90IHJlYWQgdGhlIHJlc291cmNlIGZvciBhbiBpbWFnZSB3aXRoIGlubGluZSBieXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3Rlc3QvaW5saW5lLWltYWdlLnBuZycpO1xuXHRcdFx0XHRjb25zdCByZWFkcyA9IGF3YWl0IHJlbmRlckltYWdlQW5kQ29sbGVjdFJlYWRzKHtcblx0XHRcdFx0XHRraW5kOiAnaW1hZ2UnLFxuXHRcdFx0XHRcdGlkOiAnaW5saW5lLWltYWdlJyxcblx0XHRcdFx0XHRuYW1lOiAnaW5saW5lLWltYWdlLnBuZycsXG5cdFx0XHRcdFx0dmFsdWU6IG5ldyBVaW50OEFycmF5KFsweDg5LCAweDUwLCAweDRFLCAweDQ3XSksXG5cdFx0XHRcdFx0bWltZVR5cGU6ICdpbWFnZS9wbmcnLFxuXHRcdFx0XHRcdGlzVVJMOiBmYWxzZSxcblx0XHRcdFx0XHRyZWZlcmVuY2VzOiBbeyBraW5kOiAncmVmZXJlbmNlJywgcmVmZXJlbmNlOiByZXNvdXJjZSB9XVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYWRzLCBbXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIGtlZXAgZGVsZXRlIGhpbnQgYWZ0ZXIgbG9hZGluZyBoeWRyYXRlZCBpbWFnZSBieXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZmlsZSgnL3Rlc3QvcGFzdGVkLWltYWdlLnBuZycpO1xuXHRcdFx0XHRjb25zdCBjb250YWluZXIgPSBtYWluV2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdFx0XHRtYWluV2luZG93LmRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoY29udGFpbmVyKTtcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBjb250YWluZXIucmVtb3ZlKCkpKTtcblx0XHRcdFx0Y29uc3QgY29udGV4dFJlc291cmNlTGFiZWxzID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCBERUZBVUxUX0xBQkVMU19DT05UQUlORVIpKTtcblx0XHRcdFx0Y29uc3Qgd2lkZ2V0ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdEltYWdlQXR0YWNobWVudFdpZGdldCxcblx0XHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRraW5kOiAnaW1hZ2UnLFxuXHRcdFx0XHRcdFx0aWQ6ICdoeWRyYXRlZC1pbWFnZS13aXRoLWRlbGV0ZScsXG5cdFx0XHRcdFx0XHRuYW1lOiAncGFzdGVkLWltYWdlLnBuZycsXG5cdFx0XHRcdFx0XHR2YWx1ZTogcmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRtaW1lVHlwZTogJ2ltYWdlL3BuZycsXG5cdFx0XHRcdFx0XHRpc1VSTDogdHJ1ZSxcblx0XHRcdFx0XHRcdHJlZmVyZW5jZXM6IFt7IGtpbmQ6ICdyZWZlcmVuY2UnLCByZWZlcmVuY2U6IHJlc291cmNlIH1dXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdFx0eyBzaG91bGRGb2N1c0NsZWFyQnV0dG9uOiBmYWxzZSwgc3VwcG9ydHNEZWxldGlvbjogdHJ1ZSB9LFxuXHRcdFx0XHRcdGNvbnRhaW5lcixcblx0XHRcdFx0XHRjb250ZXh0UmVzb3VyY2VMYWJlbHNcblx0XHRcdFx0KSk7XG5cblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2lkZ2V0LmVsZW1lbnQuYXJpYUxhYmVsLCAnQXR0YWNoZWQgaW1hZ2UsIHBhc3RlZC1pbWFnZS5wbmcgKERlbGV0ZSknKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsaUJBQWlCLG9CQUFvQjtBQUM5QyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQVc7QUFDcEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxvQkFBb0I7QUFDN0IsU0FBMEIscUNBQXFDO0FBQy9ELFNBQVMsMEJBQTBCLHNCQUFzQjtBQUN6RCxTQUFTLCtCQUErQiw2QkFBNkI7QUFDckUsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxrQ0FBNkQsY0FBYywwQ0FBMEM7QUFDOUgsU0FBcUMsOEJBQThCO0FBRW5FLE1BQU0sOEJBQThCLE1BQU07QUFDekMsUUFBTSxRQUFRLHdDQUF3QztBQUN0RCxNQUFJO0FBQ0osTUFBSTtBQUVKLFFBQU0sTUFBTTtBQUNYLGtCQUFjLE1BQU0sSUFBSSxJ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
