import { constObservable } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { createEditorServices, defineThemedFixtureGroup, defineComponentFixture, createTextModel } from "../../fixtureUtils.js";
import { EditorExtensionsRegistry } from "../../../../../../editor/browser/editorExtensions.js";
import { CodeEditorWidget } from "../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { InlineCompletionsController } from "../../../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js";
import "../../../../../../editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js";
import { InlineCompletionsSource, InlineCompletionsState } from "../../../../../../editor/contrib/inlineCompletions/browser/model/inlineCompletionsSource.js";
import { InlineEditItem } from "../../../../../../editor/contrib/inlineCompletions/browser/model/inlineSuggestionItem.js";
import { TextModelValueReference } from "../../../../../../editor/contrib/inlineCompletions/browser/model/textModelValueReference.js";
function renderInlineEdit(options) {
  const { container, disposableStore, theme } = options;
  container.style.width = options.width ?? "500px";
  container.style.height = options.height ?? "170px";
  container.style.border = "1px solid var(--vscode-editorWidget-border)";
  const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
  const textModel = disposableStore.add(createTextModel(
    instantiationService,
    options.code,
    URI.parse("inmemory://inline-edit.ts"),
    "typescript"
  ));
  instantiationService.stubInstance(InlineCompletionsSource, {
    cancelUpdate: () => {
    },
    clear: () => {
    },
    clearOperationOnTextModelChange: constObservable(void 0),
    clearSuggestWidgetInlineCompletions: () => {
    },
    dispose: () => {
    },
    fetch: async () => true,
    inlineCompletions: constObservable(disposableStore.add(new InlineCompletionsState([
      InlineEditItem.createForTest(
        TextModelValueReference.snapshot(textModel),
        new Range(
          options.range.startLineNumber,
          options.range.startColumn,
          options.range.endLineNumber,
          options.range.endColumn
        ),
        options.newText
      )
    ], void 0))),
    loading: constObservable(false),
    seedInlineCompletionsWithSuggestWidget: () => {
    },
    seedWithCompletion: () => {
    },
    suggestWidgetInlineCompletions: constObservable(disposableStore.add(InlineCompletionsState.createEmpty()))
  });
  const editorWidgetOptions = {
    contributions: EditorExtensionsRegistry.getEditorContributions()
  };
  const editor = disposableStore.add(instantiationService.createInstance(
    CodeEditorWidget,
    container,
    {
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      fontSize: 14,
      cursorBlinking: "solid",
      ...options.editorOptions
    },
    editorWidgetOptions
  ));
  editor.setModel(textModel);
  editor.setPosition({ lineNumber: options.cursorLine, column: 1 });
  editor.focus();
  const controller = InlineCompletionsController.get(editor);
  controller?.model?.get();
}
var views_fixture_default = defineThemedFixtureGroup({ path: "editor/inlineCompletions/" }, {
  // Side-by-side view: Narrow editor with multi-line replacement
  SideBySideViewSmall: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderInlineEdit({
      ...context,
      code: `function calculate(a, b) {
	const sum = a + b;
	return sum;
}`,
      cursorLine: 2,
      range: { startLineNumber: 2, startColumn: 1, endLineNumber: 3, endColumn: 100 },
      newText: "	const result = a * b + a + b;\n	console.log(result);\n	return result;"
    })
  }),
  // Side-by-side view: Wide editor with multi-line replacement
  SideBySideViewWide: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderInlineEdit({
      ...context,
      code: `function calculate(a, b) {
	const sum = a + b;
	return sum;
}`,
      cursorLine: 2,
      range: { startLineNumber: 2, startColumn: 1, endLineNumber: 3, endColumn: 100 },
      newText: "	const result = a * b + a + b;\n	console.log(result);\n	return result;",
      width: "800px"
    })
  }),
  // Word replacement view: Single word change
  WordReplacementView: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderInlineEdit({
      ...context,
      code: `class BufferData {
	append(data: number[]) {
		this.data.push(data);
	}
}`,
      cursorLine: 2,
      range: { startLineNumber: 2, startColumn: 2, endLineNumber: 2, endColumn: 8 },
      newText: "push",
      height: "200px"
    })
  }),
  // Insertion view: Insert new content
  InsertionView: defineComponentFixture({
    labels: { kind: "screenshot", flaky: true },
    render: (context) => renderInlineEdit({
      ...context,
      code: `class BufferData {
	append(data: number[]) {} // appends data
}`,
      cursorLine: 2,
      range: { startLineNumber: 2, startColumn: 26, endLineNumber: 2, endColumn: 26 },
      newText: `
		console.log(data);
	`,
      height: "200px",
      editorOptions: {
        inlineSuggest: {
          edits: { allowCodeShifting: "always" }
        }
      }
    })
  }),
  // Deletion view: Removing code
  DeletionView: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderInlineEdit({
      ...context,
      code: `function process(data: string[]) {
	console.log("processing:", data);
	const result = data.map(d => d.trim());
	return result;
}`,
      cursorLine: 2,
      range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 100 },
      newText: "",
      height: "200px"
    })
  }),
  // Line replacement view: Single-line with multiple changes
  LineReplacementView: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderInlineEdit({
      ...context,
      code: `function calculate(width: number, height: number): number {
	const area = width * height;
	return area;
}`,
      cursorLine: 2,
      range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 100 },
      newText: "	const volume = width * height * depth;",
      height: "200px"
    })
  })
});
export {
  views_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvZWRpdG9yL2lubGluZUNvbXBsZXRpb25zL3ZpZXdzLmZpeHR1cmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5cbi8vIEltcG9ydCB0byByZWdpc3RlciB0aGUgaW5saW5lIGNvbXBsZXRpb25zIGNvbnRyaWJ1dGlvblxuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgY3JlYXRlRWRpdG9yU2VydmljZXMsIGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cCwgZGVmaW5lQ29tcG9uZW50Rml4dHVyZSwgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vZml4dHVyZVV0aWxzLmpzJztcbmltcG9ydCB7IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zLCBDb2RlRWRpdG9yV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29uZmlnL2VkaXRvck9wdGlvbnMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9jb250cm9sbGVyL2lubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvaW5saW5lQ29tcGxldGlvbnMuY29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25zU291cmNlLCBJbmxpbmVDb21wbGV0aW9uc1N0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9tb2RlbC9pbmxpbmVDb21wbGV0aW9uc1NvdXJjZS5qcyc7XG5pbXBvcnQgeyBJbmxpbmVFZGl0SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvbW9kZWwvaW5saW5lU3VnZ2VzdGlvbkl0ZW0uanMnO1xuaW1wb3J0IHsgVGV4dE1vZGVsVmFsdWVSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL21vZGVsL3RleHRNb2RlbFZhbHVlUmVmZXJlbmNlLmpzJztcblxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBJbmxpbmUgRWRpdCBGaXh0dXJlXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmludGVyZmFjZSBJbmxpbmVFZGl0T3B0aW9ucyBleHRlbmRzIENvbXBvbmVudEZpeHR1cmVDb250ZXh0IHtcblx0Y29kZTogc3RyaW5nO1xuXHRjdXJzb3JMaW5lOiBudW1iZXI7XG5cdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogbnVtYmVyOyBzdGFydENvbHVtbjogbnVtYmVyOyBlbmRMaW5lTnVtYmVyOiBudW1iZXI7IGVuZENvbHVtbjogbnVtYmVyIH07XG5cdG5ld1RleHQ6IHN0cmluZztcblx0d2lkdGg/OiBzdHJpbmc7XG5cdGhlaWdodD86IHN0cmluZztcblx0ZWRpdG9yT3B0aW9ucz86IElFZGl0b3JPcHRpb25zO1xufVxuXG5mdW5jdGlvbiByZW5kZXJJbmxpbmVFZGl0KG9wdGlvbnM6IElubGluZUVkaXRPcHRpb25zKTogdm9pZCB7XG5cdGNvbnN0IHsgY29udGFpbmVyLCBkaXNwb3NhYmxlU3RvcmUsIHRoZW1lIH0gPSBvcHRpb25zO1xuXHRjb250YWluZXIuc3R5bGUud2lkdGggPSBvcHRpb25zLndpZHRoID8/ICc1MDBweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBvcHRpb25zLmhlaWdodCA/PyAnMTcwcHgnO1xuXHRjb250YWluZXIuc3R5bGUuYm9yZGVyID0gJzFweCBzb2xpZCB2YXIoLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWJvcmRlciknO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoZGlzcG9zYWJsZVN0b3JlLCB7IGNvbG9yVGhlbWU6IHRoZW1lIH0pO1xuXG5cdGNvbnN0IHRleHRNb2RlbCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdG9wdGlvbnMuY29kZSxcblx0XHRVUkkucGFyc2UoJ2lubWVtb3J5Oi8vaW5saW5lLWVkaXQudHMnKSxcblx0XHQndHlwZXNjcmlwdCdcblx0KSk7XG5cblx0Ly8gTW9jayB0aGUgSW5saW5lQ29tcGxldGlvbnNTb3VyY2UgdG8gcHJvdmlkZSBvdXIgdGVzdCBjb21wbGV0aW9uXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWJJbnN0YW5jZShJbmxpbmVDb21wbGV0aW9uc1NvdXJjZSwge1xuXHRcdGNhbmNlbFVwZGF0ZTogKCkgPT4geyB9LFxuXHRcdGNsZWFyOiAoKSA9PiB7IH0sXG5cdFx0Y2xlYXJPcGVyYXRpb25PblRleHRNb2RlbENoYW5nZTogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCkgYXMgSU9ic2VydmFibGVXaXRoQ2hhbmdlPHVuZGVmaW5lZCwgdm9pZD4sXG5cdFx0Y2xlYXJTdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnM6ICgpID0+IHsgfSxcblx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0ZmV0Y2g6IGFzeW5jICgpID0+IHRydWUsXG5cdFx0aW5saW5lQ29tcGxldGlvbnM6IGNvbnN0T2JzZXJ2YWJsZShkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBJbmxpbmVDb21wbGV0aW9uc1N0YXRlKFtcblx0XHRcdElubGluZUVkaXRJdGVtLmNyZWF0ZUZvclRlc3QoXG5cdFx0XHRcdFRleHRNb2RlbFZhbHVlUmVmZXJlbmNlLnNuYXBzaG90KHRleHRNb2RlbCksXG5cdFx0XHRcdG5ldyBSYW5nZShcblx0XHRcdFx0XHRvcHRpb25zLnJhbmdlLnN0YXJ0TGluZU51bWJlcixcblx0XHRcdFx0XHRvcHRpb25zLnJhbmdlLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRcdG9wdGlvbnMucmFuZ2UuZW5kTGluZU51bWJlcixcblx0XHRcdFx0XHRvcHRpb25zLnJhbmdlLmVuZENvbHVtblxuXHRcdFx0XHQpLFxuXHRcdFx0XHRvcHRpb25zLm5ld1RleHRcblx0XHRcdClcblx0XHRdLCB1bmRlZmluZWQpKSksXG5cdFx0bG9hZGluZzogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0XHRzZWVkSW5saW5lQ29tcGxldGlvbnNXaXRoU3VnZ2VzdFdpZGdldDogKCkgPT4geyB9LFxuXHRcdHNlZWRXaXRoQ29tcGxldGlvbjogKCkgPT4geyB9LFxuXHRcdHN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9uczogY29uc3RPYnNlcnZhYmxlKGRpc3Bvc2FibGVTdG9yZS5hZGQoSW5saW5lQ29tcGxldGlvbnNTdGF0ZS5jcmVhdGVFbXB0eSgpKSksXG5cdH0pO1xuXG5cdGNvbnN0IGVkaXRvcldpZGdldE9wdGlvbnM6IElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucyA9IHtcblx0XHRjb250cmlidXRpb25zOiBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0RWRpdG9yQ29udHJpYnV0aW9ucygpXG5cdH07XG5cblx0Y29uc3QgZWRpdG9yID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRDb2RlRWRpdG9yV2lkZ2V0LFxuXHRcdGNvbnRhaW5lcixcblx0XHR7XG5cdFx0XHRhdXRvbWF0aWNMYXlvdXQ6IHRydWUsXG5cdFx0XHRtaW5pbWFwOiB7IGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRsaW5lTnVtYmVyczogJ29uJyxcblx0XHRcdHNjcm9sbEJleW9uZExhc3RMaW5lOiBmYWxzZSxcblx0XHRcdGZvbnRTaXplOiAxNCxcblx0XHRcdGN1cnNvckJsaW5raW5nOiAnc29saWQnLFxuXHRcdFx0Li4ub3B0aW9ucy5lZGl0b3JPcHRpb25zLFxuXHRcdH0sXG5cdFx0ZWRpdG9yV2lkZ2V0T3B0aW9uc1xuXHQpKTtcblxuXHRlZGl0b3Iuc2V0TW9kZWwodGV4dE1vZGVsKTtcblx0ZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogb3B0aW9ucy5jdXJzb3JMaW5lLCBjb2x1bW46IDEgfSk7XG5cdGVkaXRvci5mb2N1cygpO1xuXG5cdC8vIFRyaWdnZXIgaW5saW5lIGNvbXBsZXRpb25zXG5cdGNvbnN0IGNvbnRyb2xsZXIgPSBJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdGNvbnRyb2xsZXI/Lm1vZGVsPy5nZXQoKTtcbn1cblxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBGaXh0dXJlc1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAoeyBwYXRoOiAnZWRpdG9yL2lubGluZUNvbXBsZXRpb25zLycgfSwge1xuXHQvLyBTaWRlLWJ5LXNpZGUgdmlldzogTmFycm93IGVkaXRvciB3aXRoIG11bHRpLWxpbmUgcmVwbGFjZW1lbnRcblx0U2lkZUJ5U2lkZVZpZXdTbWFsbDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogKGNvbnRleHQpID0+IHJlbmRlcklubGluZUVkaXQoe1xuXHRcdFx0Li4uY29udGV4dCxcblx0XHRcdGNvZGU6IGBmdW5jdGlvbiBjYWxjdWxhdGUoYSwgYikge1xuXHRjb25zdCBzdW0gPSBhICsgYjtcblx0cmV0dXJuIHN1bTtcbn1gLFxuXHRcdFx0Y3Vyc29yTGluZTogMixcblx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMiwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDMsIGVuZENvbHVtbjogMTAwIH0sXG5cdFx0XHRuZXdUZXh0OiAnXFx0Y29uc3QgcmVzdWx0ID0gYSAqIGIgKyBhICsgYjtcXG5cXHRjb25zb2xlLmxvZyhyZXN1bHQpO1xcblxcdHJldHVybiByZXN1bHQ7Jyxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gU2lkZS1ieS1zaWRlIHZpZXc6IFdpZGUgZWRpdG9yIHdpdGggbXVsdGktbGluZSByZXBsYWNlbWVudFxuXHRTaWRlQnlTaWRlVmlld1dpZGU6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IChjb250ZXh0KSA9PiByZW5kZXJJbmxpbmVFZGl0KHtcblx0XHRcdC4uLmNvbnRleHQsXG5cdFx0XHRjb2RlOiBgZnVuY3Rpb24gY2FsY3VsYXRlKGEsIGIpIHtcblx0Y29uc3Qgc3VtID0gYSArIGI7XG5cdHJldHVybiBzdW07XG59YCxcblx0XHRcdGN1cnNvckxpbmU6IDIsXG5cdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDIsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAzLCBlbmRDb2x1bW46IDEwMCB9LFxuXHRcdFx0bmV3VGV4dDogJ1xcdGNvbnN0IHJlc3VsdCA9IGEgKiBiICsgYSArIGI7XFxuXFx0Y29uc29sZS5sb2cocmVzdWx0KTtcXG5cXHRyZXR1cm4gcmVzdWx0OycsXG5cdFx0XHR3aWR0aDogJzgwMHB4Jyxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gV29yZCByZXBsYWNlbWVudCB2aWV3OiBTaW5nbGUgd29yZCBjaGFuZ2Vcblx0V29yZFJlcGxhY2VtZW50VmlldzogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogKGNvbnRleHQpID0+IHJlbmRlcklubGluZUVkaXQoe1xuXHRcdFx0Li4uY29udGV4dCxcblx0XHRcdGNvZGU6IGBjbGFzcyBCdWZmZXJEYXRhIHtcblx0YXBwZW5kKGRhdGE6IG51bWJlcltdKSB7XG5cdFx0dGhpcy5kYXRhLnB1c2goZGF0YSk7XG5cdH1cbn1gLFxuXHRcdFx0Y3Vyc29yTGluZTogMixcblx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMiwgc3RhcnRDb2x1bW46IDIsIGVuZExpbmVOdW1iZXI6IDIsIGVuZENvbHVtbjogOCB9LFxuXHRcdFx0bmV3VGV4dDogJ3B1c2gnLFxuXHRcdFx0aGVpZ2h0OiAnMjAwcHgnLFxuXHRcdH0pLFxuXHR9KSxcblxuXHQvLyBJbnNlcnRpb24gdmlldzogSW5zZXJ0IG5ldyBjb250ZW50XG5cdEluc2VydGlvblZpZXc6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcsIGZsYWt5OiB0cnVlIH0sXG5cdFx0cmVuZGVyOiAoY29udGV4dCkgPT4gcmVuZGVySW5saW5lRWRpdCh7XG5cdFx0XHQuLi5jb250ZXh0LFxuXHRcdFx0Y29kZTogYGNsYXNzIEJ1ZmZlckRhdGEge1xuXHRhcHBlbmQoZGF0YTogbnVtYmVyW10pIHt9IC8vIGFwcGVuZHMgZGF0YVxufWAsXG5cdFx0XHRjdXJzb3JMaW5lOiAyLFxuXHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAyLCBzdGFydENvbHVtbjogMjYsIGVuZExpbmVOdW1iZXI6IDIsIGVuZENvbHVtbjogMjYgfSxcblx0XHRcdG5ld1RleHQ6IGBcblx0XHRjb25zb2xlLmxvZyhkYXRhKTtcblx0YCxcblx0XHRcdGhlaWdodDogJzIwMHB4Jyxcblx0XHRcdGVkaXRvck9wdGlvbnM6IHtcblx0XHRcdFx0aW5saW5lU3VnZ2VzdDoge1xuXHRcdFx0XHRcdGVkaXRzOiB7IGFsbG93Q29kZVNoaWZ0aW5nOiAnYWx3YXlzJyB9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSxcblx0fSksXG5cblx0Ly8gRGVsZXRpb24gdmlldzogUmVtb3ZpbmcgY29kZVxuXHREZWxldGlvblZpZXc6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IChjb250ZXh0KSA9PiByZW5kZXJJbmxpbmVFZGl0KHtcblx0XHRcdC4uLmNvbnRleHQsXG5cdFx0XHRjb2RlOiBgZnVuY3Rpb24gcHJvY2VzcyhkYXRhOiBzdHJpbmdbXSkge1xuXHRjb25zb2xlLmxvZyhcInByb2Nlc3Npbmc6XCIsIGRhdGEpO1xuXHRjb25zdCByZXN1bHQgPSBkYXRhLm1hcChkID0+IGQudHJpbSgpKTtcblx0cmV0dXJuIHJlc3VsdDtcbn1gLFxuXHRcdFx0Y3Vyc29yTGluZTogMixcblx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMiwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDIsIGVuZENvbHVtbjogMTAwIH0sXG5cdFx0XHRuZXdUZXh0OiAnJyxcblx0XHRcdGhlaWdodDogJzIwMHB4Jyxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gTGluZSByZXBsYWNlbWVudCB2aWV3OiBTaW5nbGUtbGluZSB3aXRoIG11bHRpcGxlIGNoYW5nZXNcblx0TGluZVJlcGxhY2VtZW50VmlldzogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogKGNvbnRleHQpID0+IHJlbmRlcklubGluZUVkaXQoe1xuXHRcdFx0Li4uY29udGV4dCxcblx0XHRcdGNvZGU6IGBmdW5jdGlvbiBjYWxjdWxhdGUod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiBudW1iZXIge1xuXHRjb25zdCBhcmVhID0gd2lkdGggKiBoZWlnaHQ7XG5cdHJldHVybiBhcmVhO1xufWAsXG5cdFx0XHRjdXJzb3JMaW5lOiAyLFxuXHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAyLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMiwgZW5kQ29sdW1uOiAxMDAgfSxcblx0XHRcdG5ld1RleHQ6ICdcXHRjb25zdCB2b2x1bWUgPSB3aWR0aCAqIGhlaWdodCAqIGRlcHRoOycsXG5cdFx0XHRoZWlnaHQ6ICcyMDBweCcsXG5cdFx0fSksXG5cdH0pLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFPQSxTQUFTLHVCQUE4QztBQUN2RCxTQUFTLFdBQVc7QUFDcEIsU0FBa0Msc0JBQXNCLDBCQUEwQix3QkFBd0IsdUJBQXVCO0FBQ2pJLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQW1DLHdCQUF3QjtBQUUzRCxTQUFTLGFBQWE7QUFDdEIsU0FBUyxtQ0FBbUM7QUFDNUMsT0FBTztBQUNQLFNBQVMseUJBQXlCLDhCQUE4QjtBQUNoRSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtCQUErQjtBQWlCeEMsU0FBUyxpQkFBaUIsU0FBa0M7QUFDM0QsUUFBTSxFQUFFLFdBQVcsaUJBQWlCLE1BQU0sSUFBSTtBQUM5QyxZQUFVLE1BQU0sUUFBUSxRQUFRLFNBQVM7QUFDekMsWUFBVSxNQUFNLFNBQVMsUUFBUSxVQUFVO0FBQzNDLFlBQVUsTUFBTSxTQUFTO0FBRXpCLFFBQU0sdUJBQXVCLHFCQUFxQixpQkFBaUIsRUFBRSxZQUFZLE1BQU0sQ0FBQztBQUV4RixRQUFNLFlBQVksZ0JBQWdCLElBQUk7QUFBQSxJQUNyQztBQUFBLElBQ0EsUUFBUTtBQUFBLElBQ1IsSUFBSSxNQUFNLDJCQUEyQjtBQUFBLElBQ3JDO0FBQUEsRUFDRCxDQUFDO0FBR0QsdUJBQXFCLGFBQWEseUJBQXlCO0FBQUEsSUFDMUQsY0FBYyxN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
