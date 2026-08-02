import assert from "assert";
import { Emitter } from "../../../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ICodeEditorService } from "../../../../../../editor/browser/services/codeEditorService.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { TrackedRangeStickiness } from "../../../../../../editor/common/model.js";
import { TestCodeEditorService } from "../../../../../../editor/test/browser/editorTestServices.js";
import { createTestCodeEditor } from "../../../../../../editor/test/browser/testCodeEditor.js";
import { createTextModel } from "../../../../../../editor/test/common/testTextModel.js";
import { ServiceCollection } from "../../../../../../platform/instantiation/common/serviceCollection.js";
import { TestThemeService } from "../../../../../../platform/theme/test/common/testThemeService.js";
import { toAttachedContextDynamicVariable } from "../../../common/attachments/chatVariables.js";
import { getDynamicVariablesForWidget, getSelectedToolAndToolSetsForWidget } from "../../../browser/attachments/chatVariables.js";
import { ChatDynamicVariableModel, dynamicVariableDecorationType } from "../../../browser/attachments/chatDynamicVariables.js";
import { ToolDataSource, ToolAndToolSetEnablementMap } from "../../../common/tools/languageModelToolsService.js";
import { observableValue } from "../../../../../../base/common/observable.js";
function createMockVariable(overrides) {
  return {
    id: "var-1",
    fullName: "test-var",
    range: new Range(1, 1, 1, 10),
    data: "test-data",
    ...overrides
  };
}
function createMockAttachment(overrides) {
  return {
    id: "attach-1",
    name: "test-attachment",
    kind: "file",
    value: "test-value",
    ...overrides
  };
}
function createMockWidget(options) {
  const {
    hasViewModel = true,
    supportsFileReferences = true,
    contribVariables = [],
    editing = false,
    attachments = [],
    editorTextLength = 100
  } = options;
  const contribModel = {
    id: ChatDynamicVariableModel.ID,
    variables: contribVariables
  };
  return {
    viewModel: hasViewModel ? { editing: editing ? {} : void 0 } : void 0,
    supportsFileReferences,
    getContrib: (id) => id === ChatDynamicVariableModel.ID ? contribModel : void 0,
    input: {
      attachmentModel: { attachments }
    },
    inputEditor: {
      getModel: () => ({
        getValueLength: () => editorTextLength,
        getPositionAt: (offset) => ({ lineNumber: 1, column: offset + 1 })
      })
    }
  };
}
suite("getDynamicVariablesForWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns empty when no viewModel", () => {
    const widget = createMockWidget({ hasViewModel: false });
    assert.deepStrictEqual(getDynamicVariablesForWidget(widget), []);
  });
  test("returns empty when file references not supported", () => {
    const widget = createMockWidget({ supportsFileReferences: false });
    assert.deepStrictEqual(getDynamicVariablesForWidget(widget), []);
  });
  test("returns contrib model variables when not editing", () => {
    const variables = [createMockVariable()];
    const widget = createMockWidget({ contribVariables: variables });
    assert.deepStrictEqual(getDynamicVariablesForWidget(widget), variables);
  });
  test("returns contrib model variables when editing with existing variables", () => {
    const variables = [createMockVariable()];
    const widget = createMockWidget({ editing: true, contribVariables: variables });
    assert.deepStrictEqual(getDynamicVariablesForWidget(widget), variables);
  });
  test("converts attachments to dynamic variables when editing with attachments and no contrib variables", () => {
    const attachments = [
      createMockAttachment({
        id: "a1",
        name: "file.ts",
        kind: "file",
        value: "file-value",
        range: { start: 0, endExclusive: 8 }
      })
    ];
    const widget = createMockWidget({ editing: true, attachments, contribVariables: [] });
    const result = getDynamicVariablesForWidget(widget);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, "a1");
    assert.strictEqual(result[0].fullName, "file.ts");
    assert.strictEqual(result[0].isFile, true);
    assert.strictEqual(result[0].isDirectory, false);
    assert.strictEqual(result[0].data, "file-value");
  });
  test("skips attachments without range when editing", () => {
    const attachments = [createMockAttachment({ range: void 0 })];
    const widget = createMockWidget({ editing: true, attachments, contribVariables: [] });
    const result = getDynamicVariablesForWidget(widget);
    assert.deepStrictEqual(result, []);
  });
  test("skips attachments with empty range", () => {
    const attachments = [createMockAttachment({ range: { start: 5, endExclusive: 5 } })];
    const widget = createMockWidget({ editing: true, attachments, contribVariables: [] });
    const result = getDynamicVariablesForWidget(widget);
    assert.deepStrictEqual(result, []);
  });
  test("skips attachments with out-of-bounds range", () => {
    const attachments = [createMockAttachment({ range: { start: 0, endExclusive: 200 } })];
    const widget = createMockWidget({ editing: true, attachments, editorTextLength: 100, contribVariables: [] });
    const result = getDynamicVariablesForWidget(widget);
    assert.deepStrictEqual(result, []);
  });
  test("skips attachments with negative start", () => {
    const attachments = [createMockAttachment({ range: { start: -1, endExclusive: 5 } })];
    const widget = createMockWidget({ editing: true, attachments, contribVariables: [] });
    const result = getDynamicVariablesForWidget(widget);
    assert.deepStrictEqual(result, []);
  });
  test("sets isDirectory for directory attachments", () => {
    const attachments = [
      createMockAttachment({
        kind: "directory",
        range: { start: 0, endExclusive: 5 }
      })
    ];
    const widget = createMockWidget({ editing: true, attachments, contribVariables: [] });
    const result = getDynamicVariablesForWidget(widget);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].isFile, false);
    assert.strictEqual(result[0].isDirectory, true);
  });
});
suite("getSelectedToolAndToolSetsForWidget", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns the entriesMap from the selected tools model", () => {
    const toolData = {
      id: "tool-1",
      toolReferenceName: "myTool",
      displayName: "My Tool",
      modelDescription: "A test tool",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    const expectedMap = ToolAndToolSetEnablementMap.fromEntries([[toolData, true]]);
    const entriesMap = observableValue("test", expectedMap);
    const widget = {
      input: {
        selectedToolsModel: { entriesMap }
      }
    };
    const result = getSelectedToolAndToolSetsForWidget(widget);
    assert.strictEqual(result, expectedMap);
  });
});
suite("inline attachment references", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("keeps large attachment payloads out of inline reference state", () => {
    const attachment = createMockAttachment({
      kind: "image",
      value: new Uint8Array(1024 * 1024)
    });
    const reference = toAttachedContextDynamicVariable(attachment, new Range(1, 1, 1, 20));
    assert.deepStrictEqual({
      data: reference.data,
      hasAttachment: Object.hasOwn(reference, "attachment"),
      isAttachmentReference: reference.isAttachmentReference,
      hasCompactSerializedState: JSON.stringify(reference).length < 500
    }, {
      data: void 0,
      hasAttachment: false,
      isAttachmentReference: true,
      hasCompactSerializedState: true
    });
  });
});
suite("ChatDynamicVariableModel", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createDynamicVariableModel(text) {
    const textModel = store.add(createTextModel(text));
    const codeEditorService = store.add(new TestCodeEditorService(new TestThemeService()));
    store.add(codeEditorService.registerDecorationType("test", dynamicVariableDecorationType, {
      rangeBehavior: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
    }));
    const editor = store.add(createTestCodeEditor(textModel, {
      serviceCollection: new ServiceCollection([ICodeEditorService, codeEditorService])
    }));
    const onDidChangeActiveInputEditor = store.add(new Emitter());
    const onDidChangeAttachments = store.add(new Emitter());
    const widget = {
      input: {
        attachmentModel: {
          attachments: [],
          onDidChange: onDidChangeAttachments.event
        }
      },
      inputEditor: editor,
      onDidChangeActiveInputEditor: onDidChangeActiveInputEditor.event,
      refreshParsedInput: () => {
      }
    };
    const model = store.add(new ChatDynamicVariableModel(widget, {
      getUriLabel: () => ""
    }));
    return { editor, model };
  }
  test("keeps a reference when editing text before it", () => {
    const { editor, model } = createDynamicVariableModel("explain #sym:example ");
    model.addReference(createMockVariable({
      range: new Range(1, 9, 1, 21)
    }));
    editor.executeEdits("test", [{
      range: new Range(1, 1, 1, 21),
      text: "describe #sym:example"
    }]);
    assert.deepStrictEqual({
      text: editor.getValue(),
      variables: model.variables.map((variable) => variable.range)
    }, {
      text: "describe #sym:example ",
      variables: [new Range(1, 10, 1, 22)]
    });
  });
  test("removes a reference without deleting replacement text", () => {
    const { editor, model } = createDynamicVariableModel("explain #sym:example ");
    model.addReference(createMockVariable({
      range: new Range(1, 9, 1, 21)
    }));
    editor.executeEdits("test", [{
      range: new Range(1, 1, 1, 21),
      text: "describe"
    }]);
    assert.deepStrictEqual({
      text: editor.getValue(),
      variables: model.variables
    }, {
      text: "describe ",
      variables: []
    });
  });
  test("removes the whole reference when editing inside it", () => {
    const { editor, model } = createDynamicVariableModel("explain #sym:example ");
    model.addReference(createMockVariable({
      range: new Range(1, 9, 1, 21)
    }));
    editor.executeEdits("test", [{
      range: new Range(1, 14, 1, 15),
      text: "X"
    }]);
    assert.deepStrictEqual({
      text: editor.getValue(),
      variables: model.variables
    }, {
      text: "explain  ",
      variables: []
    });
  });
  test("does not retain attachment payload after the backing attachment is removed", () => {
    const attachment = createMockAttachment({
      kind: "image",
      value: new Uint8Array([1, 2, 3]),
      mimeType: "image/png"
    });
    const attachments = [attachment];
    const onDidChangeModelContent = store.add(new Emitter());
    const onDidChangeActiveInputEditor = store.add(new Emitter());
    const onDidChangeAttachments = store.add(new Emitter());
    const widget = {
      input: {
        attachmentModel: {
          attachments,
          onDidChange: onDidChangeAttachments.event
        }
      },
      inputEditor: {
        onDidChangeModelContent: onDidChangeModelContent.event,
        getModel: () => void 0,
        setDecorationsByType: () => []
      },
      onDidChangeActiveInputEditor: onDidChangeActiveInputEditor.event,
      refreshParsedInput: () => {
      }
    };
    const model = store.add(new ChatDynamicVariableModel(widget, {
      getUriLabel: () => ""
    }));
    model.addReference(toAttachedContextDynamicVariable(attachment, new Range(1, 1, 1, 20)));
    attachments.length = 0;
    onDidChangeAttachments.fire({ deleted: [attachment.id], added: [], updated: [] });
    const inputState = {};
    model.getInputState(inputState);
    const serializedReference = inputState[ChatDynamicVariableModel.ID][0];
    const requestReference = model.variables[0];
    assert.deepStrictEqual({
      serializedData: serializedReference.data,
      requestData: requestReference.data,
      hasSerializedAttachment: Object.hasOwn(serializedReference, "attachment"),
      hasRequestAttachment: Object.hasOwn(requestReference, "attachment")
    }, {
      serializedData: void 0,
      requestData: void 0,
      hasSerializedAttachment: false,
      hasRequestAttachment: false
    });
  });
  test("leaves image reference hovers to the custom hover participant", () => {
    const folderAttachment = createMockAttachment({
      id: "folder",
      name: "assets",
      kind: "directory",
      value: URI.file("/workspace/assets")
    });
    const imageAttachment = createMockAttachment({
      id: "image",
      name: "screenshot.png",
      kind: "image",
      value: new Uint8Array([1, 2, 3]),
      mimeType: "image/png",
      references: [{ reference: URI.file("/workspace/screenshot.png"), kind: "reference" }]
    });
    const attachments = [folderAttachment, imageAttachment];
    const onDidChangeModelContent = store.add(new Emitter());
    const onDidChangeActiveInputEditor = store.add(new Emitter());
    const onDidChangeAttachments = store.add(new Emitter());
    let folderHover = "";
    let hasImageDecorationHover = false;
    const widget = {
      input: {
        attachmentModel: {
          attachments,
          onDidChange: onDidChangeAttachments.event
        }
      },
      inputEditor: {
        onDidChangeModelContent: onDidChangeModelContent.event,
        getModel: () => ({
          getValueInRange: () => "#attachment",
          getDecorationRange: () => new Range(1, 1, 1, 20),
          getOffsetAt: (position) => position.column - 1
        }),
        setDecorationsByType: (_owner, _type, decorations) => {
          for (const decoration of decorations) {
            const value = decoration.hoverMessage?.value ?? "";
            if (value.includes("workspace/assets")) {
              folderHover = value;
            }
            if (value.includes("screenshot.png")) {
              hasImageDecorationHover = true;
            }
          }
          return decorations.map((_, index) => String(index));
        }
      },
      onDidChangeActiveInputEditor: onDidChangeActiveInputEditor.event,
      refreshParsedInput: () => {
      }
    };
    const model = store.add(new ChatDynamicVariableModel(widget, {
      getUriLabel: (uri) => uri.path.slice(1)
    }));
    model.addReference(toAttachedContextDynamicVariable(folderAttachment, new Range(1, 1, 1, 20)));
    model.addReference(toAttachedContextDynamicVariable(imageAttachment, new Range(2, 1, 2, 20)));
    assert.deepStrictEqual({
      folderHover,
      hasImageDecorationHover
    }, {
      folderHover: "workspace/assets",
      hasImageDecorationHover: false
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZXMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBUcmFja2VkUmFuZ2VTdGlja2luZXNzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBUZXN0Q29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9icm93c2VyL2VkaXRvclRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXN0Q29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2Jyb3dzZXIvdGVzdENvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBJTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGFiZWwvY29tbW9uL2xhYmVsLmpzJztcbmltcG9ydCB7IFRlc3RUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS90ZXN0L2NvbW1vbi90ZXN0VGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEeW5hbWljVmFyaWFibGUsIHRvQXR0YWNoZWRDb250ZXh0RHluYW1pY1ZhcmlhYmxlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgZ2V0RHluYW1pY1ZhcmlhYmxlc0ZvcldpZGdldCwgZ2V0U2VsZWN0ZWRUb29sQW5kVG9vbFNldHNGb3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsLCBkeW5hbWljVmFyaWFibGVEZWNvcmF0aW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYXR0YWNobWVudHMvY2hhdER5bmFtaWNWYXJpYWJsZXMuanMnO1xuaW1wb3J0IHsgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IElUb29sRGF0YSwgVG9vbERhdGFTb3VyY2UsIFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuXG5mdW5jdGlvbiBjcmVhdGVNb2NrVmFyaWFibGUob3ZlcnJpZGVzPzogUGFydGlhbDxJRHluYW1pY1ZhcmlhYmxlPik6IElEeW5hbWljVmFyaWFibGUge1xuXHRyZXR1cm4ge1xuXHRcdGlkOiAndmFyLTEnLFxuXHRcdGZ1bGxOYW1lOiAndGVzdC12YXInLFxuXHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMSwgMSwgMTApLFxuXHRcdGRhdGE6ICd0ZXN0LWRhdGEnLFxuXHRcdC4uLm92ZXJyaWRlcyxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja0F0dGFjaG1lbnQob3ZlcnJpZGVzPzogUGFydGlhbDxJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5Pik6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkge1xuXHRyZXR1cm4ge1xuXHRcdGlkOiAnYXR0YWNoLTEnLFxuXHRcdG5hbWU6ICd0ZXN0LWF0dGFjaG1lbnQnLFxuXHRcdGtpbmQ6ICdmaWxlJyxcblx0XHR2YWx1ZTogJ3Rlc3QtdmFsdWUnLFxuXHRcdC4uLm92ZXJyaWRlcyxcblx0fSBhcyBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrV2lkZ2V0KG9wdGlvbnM6IHtcblx0aGFzVmlld01vZGVsPzogYm9vbGVhbjtcblx0c3VwcG9ydHNGaWxlUmVmZXJlbmNlcz86IGJvb2xlYW47XG5cdGNvbnRyaWJWYXJpYWJsZXM/OiBJRHluYW1pY1ZhcmlhYmxlW107XG5cdGVkaXRpbmc/OiBib29sZWFuO1xuXHRhdHRhY2htZW50cz86IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXTtcblx0ZWRpdG9yVGV4dExlbmd0aD86IG51bWJlcjtcbn0pOiBJQ2hhdFdpZGdldCB7XG5cdGNvbnN0IHtcblx0XHRoYXNWaWV3TW9kZWwgPSB0cnVlLFxuXHRcdHN1cHBvcnRzRmlsZVJlZmVyZW5jZXMgPSB0cnVlLFxuXHRcdGNvbnRyaWJWYXJpYWJsZXMgPSBbXSxcblx0XHRlZGl0aW5nID0gZmFsc2UsXG5cdFx0YXR0YWNobWVudHMgPSBbXSxcblx0XHRlZGl0b3JUZXh0TGVuZ3RoID0gMTAwLFxuXHR9ID0gb3B0aW9ucztcblxuXHRjb25zdCBjb250cmliTW9kZWwgPSB7XG5cdFx0aWQ6IENoYXREeW5hbWljVmFyaWFibGVNb2RlbC5JRCxcblx0XHR2YXJpYWJsZXM6IGNvbnRyaWJWYXJpYWJsZXMsXG5cdH07XG5cblx0cmV0dXJuIHtcblx0XHR2aWV3TW9kZWw6IGhhc1ZpZXdNb2RlbCA/IHsgZWRpdGluZzogZWRpdGluZyA/IHt9IDogdW5kZWZpbmVkIH0gOiB1bmRlZmluZWQsXG5cdFx0c3VwcG9ydHNGaWxlUmVmZXJlbmNlcyxcblx0XHRnZXRDb250cmliOiAoaWQ6IHN0cmluZykgPT4gaWQgPT09IENoYXREeW5hbWljVmFyaWFibGVNb2RlbC5JRCA/IGNvbnRyaWJNb2RlbCA6IHVuZGVmaW5lZCxcblx0XHRpbnB1dDoge1xuXHRcdFx0YXR0YWNobWVudE1vZGVsOiB7IGF0dGFjaG1lbnRzIH0sXG5cdFx0fSxcblx0XHRpbnB1dEVkaXRvcjoge1xuXHRcdFx0Z2V0TW9kZWw6ICgpID0+ICh7XG5cdFx0XHRcdGdldFZhbHVlTGVuZ3RoOiAoKSA9PiBlZGl0b3JUZXh0TGVuZ3RoLFxuXHRcdFx0XHRnZXRQb3NpdGlvbkF0OiAob2Zmc2V0OiBudW1iZXIpID0+ICh7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogb2Zmc2V0ICsgMSB9KSxcblx0XHRcdH0pLFxuXHRcdH0sXG5cdH0gYXMgdW5rbm93biBhcyBJQ2hhdFdpZGdldDtcbn1cblxuc3VpdGUoJ2dldER5bmFtaWNWYXJpYWJsZXNGb3JXaWRnZXQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JldHVybnMgZW1wdHkgd2hlbiBubyB2aWV3TW9kZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY3JlYXRlTW9ja1dpZGdldCh7IGhhc1ZpZXdNb2RlbDogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXREeW5hbWljVmFyaWFibGVzRm9yV2lkZ2V0KHdpZGdldCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBlbXB0eSB3aGVuIGZpbGUgcmVmZXJlbmNlcyBub3Qgc3VwcG9ydGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZU1vY2tXaWRnZXQoeyBzdXBwb3J0c0ZpbGVSZWZlcmVuY2VzOiBmYWxzZSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldER5bmFtaWNWYXJpYWJsZXNGb3JXaWRnZXQod2lkZ2V0KSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGNvbnRyaWIgbW9kZWwgdmFyaWFibGVzIHdoZW4gbm90IGVkaXRpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmFyaWFibGVzID0gW2NyZWF0ZU1vY2tWYXJpYWJsZSgpXTtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVNb2NrV2lkZ2V0KHsgY29udHJpYlZhcmlhYmxlczogdmFyaWFibGVzIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RHluYW1pY1ZhcmlhYmxlc0ZvcldpZGdldCh3aWRnZXQpLCB2YXJpYWJsZXMpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGNvbnRyaWIgbW9kZWwgdmFyaWFibGVzIHdoZW4gZWRpdGluZyB3aXRoIGV4aXN0aW5nIHZhcmlhYmxlcycsICgpID0+IHtcblx0XHRjb25zdCB2YXJpYWJsZXMgPSBbY3JlYXRlTW9ja1ZhcmlhYmxlKCldO1xuXHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZU1vY2tXaWRnZXQoeyBlZGl0aW5nOiB0cnVlLCBjb250cmliVmFyaWFibGVzOiB2YXJpYWJsZXMgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXREeW5hbWljVmFyaWFibGVzRm9yV2lkZ2V0KHdpZGdldCksIHZhcmlhYmxlcyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnZlcnRzIGF0dGFjaG1lbnRzIHRvIGR5bmFtaWMgdmFyaWFibGVzIHdoZW4gZWRpdGluZyB3aXRoIGF0dGFjaG1lbnRzIGFuZCBubyBjb250cmliIHZhcmlhYmxlcycsICgpID0+IHtcblx0XHRjb25zdCBhdHRhY2htZW50cyA9IFtcblx0XHRcdGNyZWF0ZU1vY2tBdHRhY2htZW50KHtcblx0XHRcdFx0aWQ6ICdhMScsXG5cdFx0XHRcdG5hbWU6ICdmaWxlLnRzJyxcblx0XHRcdFx0a2luZDogJ2ZpbGUnLFxuXHRcdFx0XHR2YWx1ZTogJ2ZpbGUtdmFsdWUnLFxuXHRcdFx0XHRyYW5nZTogeyBzdGFydDogMCwgZW5kRXhjbHVzaXZlOiA4IH0sXG5cdFx0XHR9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZU1vY2tXaWRnZXQoeyBlZGl0aW5nOiB0cnVlLCBhdHRhY2htZW50cywgY29udHJpYlZhcmlhYmxlczogW10gfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0RHluYW1pY1ZhcmlhYmxlc0ZvcldpZGdldCh3aWRnZXQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uaWQsICdhMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uZnVsbE5hbWUsICdmaWxlLnRzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5pc0ZpbGUsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uaXNEaXJlY3RvcnksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmRhdGEsICdmaWxlLXZhbHVlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIGF0dGFjaG1lbnRzIHdpdGhvdXQgcmFuZ2Ugd2hlbiBlZGl0aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gW2NyZWF0ZU1vY2tBdHRhY2htZW50KHsgcmFuZ2U6IHVuZGVmaW5lZCB9KV07XG5cdFx0Y29uc3Qgd2lkZ2V0ID0gY3JlYXRlTW9ja1dpZGdldCh7IGVkaXRpbmc6IHRydWUsIGF0dGFjaG1lbnRzLCBjb250cmliVmFyaWFibGVzOiBbXSB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBnZXREeW5hbWljVmFyaWFibGVzRm9yV2lkZ2V0KHdpZGdldCk7XG5cblx0XHQvLyBObyByYW5nZWQgYXR0YWNobWVudHMsIGZhbGxzIGJhY2sgdG8gY29udHJpYiBtb2RlbCB2YXJpYWJsZXMgKGVtcHR5KVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIGF0dGFjaG1lbnRzIHdpdGggZW1wdHkgcmFuZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXR0YWNobWVudHMgPSBbY3JlYXRlTW9ja0F0dGFjaG1lbnQoeyByYW5nZTogeyBzdGFydDogNSwgZW5kRXhjbHVzaXZlOiA1IH0gfSldO1xuXHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZU1vY2tXaWRnZXQoeyBlZGl0aW5nOiB0cnVlLCBhdHRhY2htZW50cywgY29udHJpYlZhcmlhYmxlczogW10gfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0RHluYW1pY1ZhcmlhYmxlc0ZvcldpZGdldCh3aWRnZXQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIGF0dGFjaG1lbnRzIHdpdGggb3V0LW9mLWJvdW5kcyByYW5nZScsICgpID0+IHtcblx0XHRjb25zdCBhdHRhY2htZW50cyA9IFtjcmVhdGVNb2NrQXR0YWNobWVudCh7IHJhbmdlOiB7IHN0YXJ0OiAwLCBlbmRFeGNsdXNpdmU6IDIwMCB9IH0pXTtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVNb2NrV2lkZ2V0KHsgZWRpdGluZzogdHJ1ZSwgYXR0YWNobWVudHMsIGVkaXRvclRleHRMZW5ndGg6IDEwMCwgY29udHJpYlZhcmlhYmxlczogW10gfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0RHluYW1pY1ZhcmlhYmxlc0ZvcldpZGdldCh3aWRnZXQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIGF0dGFjaG1lbnRzIHdpdGggbmVnYXRpdmUgc3RhcnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXR0YWNobWVudHMgPSBbY3JlYXRlTW9ja0F0dGFjaG1lbnQoeyByYW5nZTogeyBzdGFydDogLTEsIGVuZEV4Y2x1c2l2ZTogNSB9IH0pXTtcblx0XHRjb25zdCB3aWRnZXQgPSBjcmVhdGVNb2NrV2lkZ2V0KHsgZWRpdGluZzogdHJ1ZSwgYXR0YWNobWVudHMsIGNvbnRyaWJWYXJpYWJsZXM6IFtdIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGdldER5bmFtaWNWYXJpYWJsZXNGb3JXaWRnZXQod2lkZ2V0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRzIGlzRGlyZWN0b3J5IGZvciBkaXJlY3RvcnkgYXR0YWNobWVudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXR0YWNobWVudHMgPSBbXG5cdFx0XHRjcmVhdGVNb2NrQXR0YWNobWVudCh7XG5cdFx0XHRcdGtpbmQ6ICdkaXJlY3RvcnknLFxuXHRcdFx0XHRyYW5nZTogeyBzdGFydDogMCwgZW5kRXhjbHVzaXZlOiA1IH0sXG5cdFx0XHR9KSxcblx0XHRdO1xuXHRcdGNvbnN0IHdpZGdldCA9IGNyZWF0ZU1vY2tXaWRnZXQoeyBlZGl0aW5nOiB0cnVlLCBhdHRhY2htZW50cywgY29udHJpYlZhcmlhYmxlczogW10gfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZ2V0RHluYW1pY1ZhcmlhYmxlc0ZvcldpZGdldCh3aWRnZXQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0uaXNGaWxlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5pc0RpcmVjdG9yeSwgdHJ1ZSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdnZXRTZWxlY3RlZFRvb2xBbmRUb29sU2V0c0ZvcldpZGdldCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmV0dXJucyB0aGUgZW50cmllc01hcCBmcm9tIHRoZSBzZWxlY3RlZCB0b29scyBtb2RlbCcsICgpID0+IHtcblx0XHRjb25zdCB0b29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICd0b29sLTEnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdteVRvb2wnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdNeSBUb29sJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdBIHRlc3QgdG9vbCcsXG5cdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fTtcblx0XHRjb25zdCBleHBlY3RlZE1hcCA9IFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcC5mcm9tRW50cmllcyhbW3Rvb2xEYXRhLCB0cnVlXV0pO1xuXHRcdGNvbnN0IGVudHJpZXNNYXAgPSBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QnLCBleHBlY3RlZE1hcCk7XG5cblx0XHRjb25zdCB3aWRnZXQgPSB7XG5cdFx0XHRpbnB1dDoge1xuXHRcdFx0XHRzZWxlY3RlZFRvb2xzTW9kZWw6IHsgZW50cmllc01hcCB9LFxuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXQ7XG5cblx0XHRjb25zdCByZXN1bHQgPSBnZXRTZWxlY3RlZFRvb2xBbmRUb29sU2V0c0ZvcldpZGdldCh3aWRnZXQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGV4cGVjdGVkTWFwKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2lubGluZSBhdHRhY2htZW50IHJlZmVyZW5jZXMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2tlZXBzIGxhcmdlIGF0dGFjaG1lbnQgcGF5bG9hZHMgb3V0IG9mIGlubGluZSByZWZlcmVuY2Ugc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYXR0YWNobWVudCA9IGNyZWF0ZU1vY2tBdHRhY2htZW50KHtcblx0XHRcdGtpbmQ6ICdpbWFnZScsXG5cdFx0XHR2YWx1ZTogbmV3IFVpbnQ4QXJyYXkoMTAyNCAqIDEwMjQpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlZmVyZW5jZSA9IHRvQXR0YWNoZWRDb250ZXh0RHluYW1pY1ZhcmlhYmxlKGF0dGFjaG1lbnQsIG5ldyBSYW5nZSgxLCAxLCAxLCAyMCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkYXRhOiByZWZlcmVuY2UuZGF0YSxcblx0XHRcdGhhc0F0dGFjaG1lbnQ6IE9iamVjdC5oYXNPd24ocmVmZXJlbmNlLCAnYXR0YWNobWVudCcpLFxuXHRcdFx0aXNBdHRhY2htZW50UmVmZXJlbmNlOiByZWZlcmVuY2UuaXNBdHRhY2htZW50UmVmZXJlbmNlLFxuXHRcdFx0aGFzQ29tcGFjdFNlcmlhbGl6ZWRTdGF0ZTogSlNPTi5zdHJpbmdpZnkocmVmZXJlbmNlKS5sZW5ndGggPCA1MDAsXG5cdFx0fSwge1xuXHRcdFx0ZGF0YTogdW5kZWZpbmVkLFxuXHRcdFx0aGFzQXR0YWNobWVudDogZmFsc2UsXG5cdFx0XHRpc0F0dGFjaG1lbnRSZWZlcmVuY2U6IHRydWUsXG5cdFx0XHRoYXNDb21wYWN0U2VyaWFsaXplZFN0YXRlOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUR5bmFtaWNWYXJpYWJsZU1vZGVsKHRleHQ6IHN0cmluZyk6IHsgZWRpdG9yOiBSZXR1cm5UeXBlPHR5cGVvZiBjcmVhdGVUZXN0Q29kZUVkaXRvcj47IG1vZGVsOiBDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwgfSB7XG5cdFx0Y29uc3QgdGV4dE1vZGVsID0gc3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbCh0ZXh0KSk7XG5cdFx0Y29uc3QgY29kZUVkaXRvclNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RDb2RlRWRpdG9yU2VydmljZShuZXcgVGVzdFRoZW1lU2VydmljZSgpKSk7XG5cdFx0c3RvcmUuYWRkKGNvZGVFZGl0b3JTZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvblR5cGUoJ3Rlc3QnLCBkeW5hbWljVmFyaWFibGVEZWNvcmF0aW9uVHlwZSwge1xuXHRcdFx0cmFuZ2VCZWhhdmlvcjogVHJhY2tlZFJhbmdlU3RpY2tpbmVzcy5OZXZlckdyb3dzV2hlblR5cGluZ0F0RWRnZXMsXG5cdFx0fSkpO1xuXHRcdGNvbnN0IGVkaXRvciA9IHN0b3JlLmFkZChjcmVhdGVUZXN0Q29kZUVkaXRvcih0ZXh0TW9kZWwsIHtcblx0XHRcdHNlcnZpY2VDb2xsZWN0aW9uOiBuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb2RlRWRpdG9yU2VydmljZSwgY29kZUVkaXRvclNlcnZpY2VdKSxcblx0XHR9KSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VBY3RpdmVJbnB1dEVkaXRvciA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRjb25zdCBvbkRpZENoYW5nZUF0dGFjaG1lbnRzID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHsgZGVsZXRlZDogcmVhZG9ubHkgc3RyaW5nW107IGFkZGVkOiByZWFkb25seSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W107IHVwZGF0ZWQ6IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSB9PigpKTtcblx0XHRjb25zdCB3aWRnZXQgPSB7XG5cdFx0XHRpbnB1dDoge1xuXHRcdFx0XHRhdHRhY2htZW50TW9kZWw6IHtcblx0XHRcdFx0XHRhdHRhY2htZW50czogW10sXG5cdFx0XHRcdFx0b25EaWRDaGFuZ2U6IG9uRGlkQ2hhbmdlQXR0YWNobWVudHMuZXZlbnQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0aW5wdXRFZGl0b3I6IGVkaXRvcixcblx0XHRcdG9uRGlkQ2hhbmdlQWN0aXZlSW5wdXRFZGl0b3I6IG9uRGlkQ2hhbmdlQWN0aXZlSW5wdXRFZGl0b3IuZXZlbnQsXG5cdFx0XHRyZWZyZXNoUGFyc2VkSW5wdXQ6ICgpID0+IHsgfSxcblx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRXaWRnZXQ7XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IENoYXREeW5hbWljVmFyaWFibGVNb2RlbCh3aWRnZXQsIHtcblx0XHRcdGdldFVyaUxhYmVsOiAoKSA9PiAnJyxcblx0XHR9IGFzIHVua25vd24gYXMgSUxhYmVsU2VydmljZSkpO1xuXHRcdHJldHVybiB7IGVkaXRvciwgbW9kZWwgfTtcblx0fVxuXG5cdHRlc3QoJ2tlZXBzIGEgcmVmZXJlbmNlIHdoZW4gZWRpdGluZyB0ZXh0IGJlZm9yZSBpdCcsICgpID0+IHtcblx0XHRjb25zdCB7IGVkaXRvciwgbW9kZWwgfSA9IGNyZWF0ZUR5bmFtaWNWYXJpYWJsZU1vZGVsKCdleHBsYWluICNzeW06ZXhhbXBsZSAnKTtcblx0XHRtb2RlbC5hZGRSZWZlcmVuY2UoY3JlYXRlTW9ja1ZhcmlhYmxlKHtcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgOSwgMSwgMjEpLFxuXHRcdH0pKTtcblxuXHRcdGVkaXRvci5leGVjdXRlRWRpdHMoJ3Rlc3QnLCBbe1xuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCAxLCAxLCAyMSksXG5cdFx0XHR0ZXh0OiAnZGVzY3JpYmUgI3N5bTpleGFtcGxlJyxcblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRleHQ6IGVkaXRvci5nZXRWYWx1ZSgpLFxuXHRcdFx0dmFyaWFibGVzOiBtb2RlbC52YXJpYWJsZXMubWFwKHZhcmlhYmxlID0+IHZhcmlhYmxlLnJhbmdlKSxcblx0XHR9LCB7XG5cdFx0XHR0ZXh0OiAnZGVzY3JpYmUgI3N5bTpleGFtcGxlICcsXG5cdFx0XHR2YXJpYWJsZXM6IFtuZXcgUmFuZ2UoMSwgMTAsIDEsIDIyKV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZXMgYSByZWZlcmVuY2Ugd2l0aG91dCBkZWxldGluZyByZXBsYWNlbWVudCB0ZXh0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZWRpdG9yLCBtb2RlbCB9ID0gY3JlYXRlRHluYW1pY1ZhcmlhYmxlTW9kZWwoJ2V4cGxhaW4gI3N5bTpleGFtcGxlICcpO1xuXHRcdG1vZGVsLmFkZFJlZmVyZW5jZShjcmVhdGVNb2NrVmFyaWFibGUoe1xuXHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgxLCA5LCAxLCAyMSksXG5cdFx0fSkpO1xuXG5cdFx0ZWRpdG9yLmV4ZWN1dGVFZGl0cygndGVzdCcsIFt7XG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDEsIDEsIDIxKSxcblx0XHRcdHRleHQ6ICdkZXNjcmliZScsXG5cdFx0fV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0ZXh0OiBlZGl0b3IuZ2V0VmFsdWUoKSxcblx0XHRcdHZhcmlhYmxlczogbW9kZWwudmFyaWFibGVzLFxuXHRcdH0sIHtcblx0XHRcdHRleHQ6ICdkZXNjcmliZSAnLFxuXHRcdFx0dmFyaWFibGVzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlcyB0aGUgd2hvbGUgcmVmZXJlbmNlIHdoZW4gZWRpdGluZyBpbnNpZGUgaXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBlZGl0b3IsIG1vZGVsIH0gPSBjcmVhdGVEeW5hbWljVmFyaWFibGVNb2RlbCgnZXhwbGFpbiAjc3ltOmV4YW1wbGUgJyk7XG5cdFx0bW9kZWwuYWRkUmVmZXJlbmNlKGNyZWF0ZU1vY2tWYXJpYWJsZSh7XG5cdFx0XHRyYW5nZTogbmV3IFJhbmdlKDEsIDksIDEsIDIxKSxcblx0XHR9KSk7XG5cblx0XHRlZGl0b3IuZXhlY3V0ZUVkaXRzKCd0ZXN0JywgW3tcblx0XHRcdHJhbmdlOiBuZXcgUmFuZ2UoMSwgMTQsIDEsIDE1KSxcblx0XHRcdHRleHQ6ICdYJyxcblx0XHR9XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRleHQ6IGVkaXRvci5nZXRWYWx1ZSgpLFxuXHRcdFx0dmFyaWFibGVzOiBtb2RlbC52YXJpYWJsZXMsXG5cdFx0fSwge1xuXHRcdFx0dGV4dDogJ2V4cGxhaW4gICcsXG5cdFx0XHR2YXJpYWJsZXM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCByZXRhaW4gYXR0YWNobWVudCBwYXlsb2FkIGFmdGVyIHRoZSBiYWNraW5nIGF0dGFjaG1lbnQgaXMgcmVtb3ZlZCcsICgpID0+IHtcblx0XHRjb25zdCBhdHRhY2htZW50ID0gY3JlYXRlTW9ja0F0dGFjaG1lbnQoe1xuXHRcdFx0a2luZDogJ2ltYWdlJyxcblx0XHRcdHZhbHVlOiBuZXcgVWludDhBcnJheShbMSwgMiwgM10pLFxuXHRcdFx0bWltZVR5cGU6ICdpbWFnZS9wbmcnLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gW2F0dGFjaG1lbnRdO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlTW9kZWxDb250ZW50ID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHsgY2hhbmdlczogcmVhZG9ubHkgdW5rbm93bltdIH0+KCkpO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlQWN0aXZlSW5wdXRFZGl0b3IgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VBdHRhY2htZW50cyA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx7IGRlbGV0ZWQ6IHJlYWRvbmx5IHN0cmluZ1tdOyBhZGRlZDogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdOyB1cGRhdGVkOiByZWFkb25seSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gfT4oKSk7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0ge1xuXHRcdFx0aW5wdXQ6IHtcblx0XHRcdFx0YXR0YWNobWVudE1vZGVsOiB7XG5cdFx0XHRcdFx0YXR0YWNobWVudHMsXG5cdFx0XHRcdFx0b25EaWRDaGFuZ2U6IG9uRGlkQ2hhbmdlQXR0YWNobWVudHMuZXZlbnQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0aW5wdXRFZGl0b3I6IHtcblx0XHRcdFx0b25EaWRDaGFuZ2VNb2RlbENvbnRlbnQ6IG9uRGlkQ2hhbmdlTW9kZWxDb250ZW50LmV2ZW50LFxuXHRcdFx0XHRnZXRNb2RlbDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRzZXREZWNvcmF0aW9uc0J5VHlwZTogKCkgPT4gW10sXG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VBY3RpdmVJbnB1dEVkaXRvcjogb25EaWRDaGFuZ2VBY3RpdmVJbnB1dEVkaXRvci5ldmVudCxcblx0XHRcdHJlZnJlc2hQYXJzZWRJbnB1dDogKCkgPT4geyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFdpZGdldDtcblx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChuZXcgQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsKHdpZGdldCwge1xuXHRcdFx0Z2V0VXJpTGFiZWw6ICgpID0+ICcnLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJTGFiZWxTZXJ2aWNlKSk7XG5cblx0XHRtb2RlbC5hZGRSZWZlcmVuY2UodG9BdHRhY2hlZENvbnRleHREeW5hbWljVmFyaWFibGUoYXR0YWNobWVudCwgbmV3IFJhbmdlKDEsIDEsIDEsIDIwKSkpO1xuXHRcdGF0dGFjaG1lbnRzLmxlbmd0aCA9IDA7XG5cdFx0b25EaWRDaGFuZ2VBdHRhY2htZW50cy5maXJlKHsgZGVsZXRlZDogW2F0dGFjaG1lbnQuaWRdLCBhZGRlZDogW10sIHVwZGF0ZWQ6IFtdIH0pO1xuXG5cdFx0Y29uc3QgaW5wdXRTdGF0ZTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7fTtcblx0XHRtb2RlbC5nZXRJbnB1dFN0YXRlKGlucHV0U3RhdGUpO1xuXHRcdGNvbnN0IHNlcmlhbGl6ZWRSZWZlcmVuY2UgPSAoaW5wdXRTdGF0ZVtDaGF0RHluYW1pY1ZhcmlhYmxlTW9kZWwuSURdIGFzIElEeW5hbWljVmFyaWFibGVbXSlbMF07XG5cdFx0Y29uc3QgcmVxdWVzdFJlZmVyZW5jZSA9IG1vZGVsLnZhcmlhYmxlc1swXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlcmlhbGl6ZWREYXRhOiBzZXJpYWxpemVkUmVmZXJlbmNlLmRhdGEsXG5cdFx0XHRyZXF1ZXN0RGF0YTogcmVxdWVzdFJlZmVyZW5jZS5kYXRhLFxuXHRcdFx0aGFzU2VyaWFsaXplZEF0dGFjaG1lbnQ6IE9iamVjdC5oYXNPd24oc2VyaWFsaXplZFJlZmVyZW5jZSwgJ2F0dGFjaG1lbnQnKSxcblx0XHRcdGhhc1JlcXVlc3RBdHRhY2htZW50OiBPYmplY3QuaGFzT3duKHJlcXVlc3RSZWZlcmVuY2UsICdhdHRhY2htZW50JyksXG5cdFx0fSwge1xuXHRcdFx0c2VyaWFsaXplZERhdGE6IHVuZGVmaW5lZCxcblx0XHRcdHJlcXVlc3REYXRhOiB1bmRlZmluZWQsXG5cdFx0XHRoYXNTZXJpYWxpemVkQXR0YWNobWVudDogZmFsc2UsXG5cdFx0XHRoYXNSZXF1ZXN0QXR0YWNobWVudDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xlYXZlcyBpbWFnZSByZWZlcmVuY2UgaG92ZXJzIHRvIHRoZSBjdXN0b20gaG92ZXIgcGFydGljaXBhbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZm9sZGVyQXR0YWNobWVudCA9IGNyZWF0ZU1vY2tBdHRhY2htZW50KHtcblx0XHRcdGlkOiAnZm9sZGVyJyxcblx0XHRcdG5hbWU6ICdhc3NldHMnLFxuXHRcdFx0a2luZDogJ2RpcmVjdG9yeScsXG5cdFx0XHR2YWx1ZTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvYXNzZXRzJyksXG5cdFx0fSk7XG5cdFx0Y29uc3QgaW1hZ2VBdHRhY2htZW50ID0gY3JlYXRlTW9ja0F0dGFjaG1lbnQoe1xuXHRcdFx0aWQ6ICdpbWFnZScsXG5cdFx0XHRuYW1lOiAnc2NyZWVuc2hvdC5wbmcnLFxuXHRcdFx0a2luZDogJ2ltYWdlJyxcblx0XHRcdHZhbHVlOiBuZXcgVWludDhBcnJheShbMSwgMiwgM10pLFxuXHRcdFx0bWltZVR5cGU6ICdpbWFnZS9wbmcnLFxuXHRcdFx0cmVmZXJlbmNlczogW3sgcmVmZXJlbmNlOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS9zY3JlZW5zaG90LnBuZycpLCBraW5kOiAncmVmZXJlbmNlJyB9XSxcblx0XHR9KTtcblx0XHRjb25zdCBhdHRhY2htZW50cyA9IFtmb2xkZXJBdHRhY2htZW50LCBpbWFnZUF0dGFjaG1lbnRdO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlTW9kZWxDb250ZW50ID0gc3RvcmUuYWRkKG5ldyBFbWl0dGVyPHsgY2hhbmdlczogcmVhZG9ubHkgdW5rbm93bltdIH0+KCkpO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlQWN0aXZlSW5wdXRFZGl0b3IgPSBzdG9yZS5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VBdHRhY2htZW50cyA9IHN0b3JlLmFkZChuZXcgRW1pdHRlcjx7IGRlbGV0ZWQ6IHJlYWRvbmx5IHN0cmluZ1tdOyBhZGRlZDogcmVhZG9ubHkgSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdOyB1cGRhdGVkOiByZWFkb25seSBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gfT4oKSk7XG5cdFx0bGV0IGZvbGRlckhvdmVyID0gJyc7XG5cdFx0bGV0IGhhc0ltYWdlRGVjb3JhdGlvbkhvdmVyID0gZmFsc2U7XG5cdFx0Y29uc3Qgd2lkZ2V0ID0ge1xuXHRcdFx0aW5wdXQ6IHtcblx0XHRcdFx0YXR0YWNobWVudE1vZGVsOiB7XG5cdFx0XHRcdFx0YXR0YWNobWVudHMsXG5cdFx0XHRcdFx0b25EaWRDaGFuZ2U6IG9uRGlkQ2hhbmdlQXR0YWNobWVudHMuZXZlbnQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0aW5wdXRFZGl0b3I6IHtcblx0XHRcdFx0b25EaWRDaGFuZ2VNb2RlbENvbnRlbnQ6IG9uRGlkQ2hhbmdlTW9kZWxDb250ZW50LmV2ZW50LFxuXHRcdFx0XHRnZXRNb2RlbDogKCkgPT4gKHtcblx0XHRcdFx0XHRnZXRWYWx1ZUluUmFuZ2U6ICgpID0+ICcjYXR0YWNobWVudCcsXG5cdFx0XHRcdFx0Z2V0RGVjb3JhdGlvblJhbmdlOiAoKSA9PiBuZXcgUmFuZ2UoMSwgMSwgMSwgMjApLFxuXHRcdFx0XHRcdGdldE9mZnNldEF0OiAocG9zaXRpb246IHsgY29sdW1uOiBudW1iZXIgfSkgPT4gcG9zaXRpb24uY29sdW1uIC0gMSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdHNldERlY29yYXRpb25zQnlUeXBlOiAoX293bmVyOiBzdHJpbmcsIF90eXBlOiBzdHJpbmcsIGRlY29yYXRpb25zOiBBcnJheTx7IGhvdmVyTWVzc2FnZT86IHsgdmFsdWU6IHN0cmluZyB9IH0+KSA9PiB7XG5cdFx0XHRcdFx0Zm9yIChjb25zdCBkZWNvcmF0aW9uIG9mIGRlY29yYXRpb25zKSB7XG5cdFx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IGRlY29yYXRpb24uaG92ZXJNZXNzYWdlPy52YWx1ZSA/PyAnJztcblx0XHRcdFx0XHRcdGlmICh2YWx1ZS5pbmNsdWRlcygnd29ya3NwYWNlL2Fzc2V0cycpKSB7XG5cdFx0XHRcdFx0XHRcdGZvbGRlckhvdmVyID0gdmFsdWU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAodmFsdWUuaW5jbHVkZXMoJ3NjcmVlbnNob3QucG5nJykpIHtcblx0XHRcdFx0XHRcdFx0aGFzSW1hZ2VEZWNvcmF0aW9uSG92ZXIgPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gZGVjb3JhdGlvbnMubWFwKChfLCBpbmRleCkgPT4gU3RyaW5nKGluZGV4KSk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VBY3RpdmVJbnB1dEVkaXRvcjogb25EaWRDaGFuZ2VBY3RpdmVJbnB1dEVkaXRvci5ldmVudCxcblx0XHRcdHJlZnJlc2hQYXJzZWRJbnB1dDogKCkgPT4geyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQ2hhdFdpZGdldDtcblx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChuZXcgQ2hhdER5bmFtaWNWYXJpYWJsZU1vZGVsKHdpZGdldCwge1xuXHRcdFx0Z2V0VXJpTGFiZWw6ICh1cmk6IFVSSSkgPT4gdXJpLnBhdGguc2xpY2UoMSksXG5cdFx0fSBhcyB1bmtub3duIGFzIElMYWJlbFNlcnZpY2UpKTtcblxuXHRcdG1vZGVsLmFkZFJlZmVyZW5jZSh0b0F0dGFjaGVkQ29udGV4dER5bmFtaWNWYXJpYWJsZShmb2xkZXJBdHRhY2htZW50LCBuZXcgUmFuZ2UoMSwgMSwgMSwgMjApKSk7XG5cdFx0bW9kZWwuYWRkUmVmZXJlbmNlKHRvQXR0YWNoZWRDb250ZXh0RHluYW1pY1ZhcmlhYmxlKGltYWdlQXR0YWNobWVudCwgbmV3IFJhbmdlKDIsIDEsIDIsIDIwKSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmb2xkZXJIb3Zlcixcblx0XHRcdGhhc0ltYWdlRGVjb3JhdGlvbkhvdmVyLFxuXHRcdH0sIHtcblx0XHRcdGZvbGRlckhvdmVyOiAnd29ya3NwYWNlL2Fzc2V0cycsXG5cdFx0XHRoYXNJbWFnZURlY29yYXRpb25Ib3ZlcjogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsV0FBVztBQUNwQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGFBQWE7QUFDdEIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBMkIsd0NBQXdDO0FBRW5FLFNBQVMsOEJBQThCLDJDQUEyQztBQUNsRixTQUFTLDBCQUEwQixxQ0FBcUM7QUFFeEUsU0FBb0Is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
