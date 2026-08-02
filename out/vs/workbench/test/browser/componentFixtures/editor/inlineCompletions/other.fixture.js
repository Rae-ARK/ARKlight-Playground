import { constObservable } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../../fixtureUtils.js";
import { EditorExtensionsRegistry } from "../../../../../../editor/browser/editorExtensions.js";
import { CodeEditorWidget } from "../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { observableCodeEditor } from "../../../../../../editor/browser/observableCodeEditor.js";
import { Position } from "../../../../../../editor/common/core/position.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { ILanguageFeaturesService } from "../../../../../../editor/common/services/languageFeatures.js";
import { InlineCompletionsController } from "../../../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js";
import "../../../../../../editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js";
import { InlineCompletionsSource, InlineCompletionsState } from "../../../../../../editor/contrib/inlineCompletions/browser/model/inlineCompletionsSource.js";
import { InlineEditItem } from "../../../../../../editor/contrib/inlineCompletions/browser/model/inlineSuggestionItem.js";
import { TextModelValueReference } from "../../../../../../editor/contrib/inlineCompletions/browser/model/textModelValueReference.js";
import { JumpToView } from "../../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/inlineEditsViews/jumpToView.js";
import { GutterIndicatorMenuContent } from "../../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorMenu.js";
import { InlineSuggestionGutterMenuData } from "../../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/components/gutterIndicatorView.js";
import { IUserInteractionService, MockUserInteractionService } from "../../../../../../platform/userInteraction/browser/userInteractionService.js";
import "../../../../../../editor/contrib/inlineCompletions/browser/hintsWidget/inlineCompletionsHintsWidget.css";
import "../../../../../../editor/contrib/inlineCompletions/browser/view/inlineEdits/view.css";
import "../../../../../../base/browser/ui/codicons/codiconStyles.js";
const SAMPLE_CODE = `function fibonacci(n: number): number {
	if (n <= 1) return n;
	return fibonacci(n - 1) + fibonacci(n - 2);
}

const result = fibonacci(10);
console.log(result);
`;
const LONG_DISTANCE_CODE = `import { readFile, writeFile } from 'fs';
import { join } from 'path';

interface Config {
	inputDir: string;
	outputDir: string;
	verbose: boolean;
}

function loadConfig(): Config {
	return {
		inputDir: './input',
		outputDir: './output',
		verbose: false,
	};
}

function processLine(line: string): string {
	return line.trim().toUpperCase();
}

function validateInput(data: string): boolean {
	return data.length > 0 && data.length < 10000;
}

async function processFile(config: Config, filename: string): Promise<void> {
	const inputPath = join(config.inputDir, filename);
	const data = await readFile(inputPath, 'utf8');
	if (!validateInput(data)) {
		throw new Error('Invalid input');
	}
	const lines = data.split('\\n');
	const processed = lines.map(processLine);
	const outputPath = join(config.outputDir, filename);
	await writeFile(outputPath, processed.join('\\n'));
	if (config.verbose) {
		console.log(\`Processed \${filename}\`);
	}
}

async function main() {
	const config = loadConfig();
	const files = ['a.txt', 'b.txt', 'c.txt'];
	for (const file of files) {
		await processFile(config, file);
	}
}

main();
`;
const HINTS_CODE = `function greet(name: string): string {
	return "Hello, " + name
}

greet("World");
`;
async function renderHintsToolbar(options) {
  const { container, disposableStore, theme } = options;
  container.style.width = "500px";
  container.style.height = "180px";
  container.style.border = "1px solid var(--vscode-editorWidget-border)";
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      if (options.simulateHover) {
        reg.defineInstance(IUserInteractionService, new MockUserInteractionService(true, true));
      }
    }
  });
  const textModel = disposableStore.add(createTextModel(
    instantiationService,
    HINTS_CODE,
    URI.parse("inmemory://hints-toolbar.ts"),
    "typescript"
  ));
  const languageFeaturesService = instantiationService.get(ILanguageFeaturesService);
  disposableStore.add(languageFeaturesService.inlineCompletionsProvider.register({ pattern: "**" }, {
    provideInlineCompletions: () => ({
      items: [{
        insertText: ' + "!";',
        range: new Range(2, 28, 2, 28)
      }]
    }),
    disposeInlineCompletions: () => {
    }
  }));
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
      inlineSuggest: { showToolbar: "always" }
    },
    { contributions: EditorExtensionsRegistry.getEditorContributions() }
  ));
  editor.setModel(textModel);
  editor.setPosition({ lineNumber: 2, column: 28 });
  editor.focus();
  const controller = InlineCompletionsController.get(editor);
  controller?.model?.get()?.triggerExplicitly();
  await new Promise((resolve) => setTimeout(resolve, 100));
}
function renderJumpToHint({ container, disposableStore, theme }) {
  container.style.width = "500px";
  container.style.height = "200px";
  container.style.border = "1px solid var(--vscode-editorWidget-border)";
  const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
  const textModel = disposableStore.add(createTextModel(
    instantiationService,
    SAMPLE_CODE,
    URI.parse("inmemory://jump-to-hint.ts"),
    "typescript"
  ));
  const editor = disposableStore.add(instantiationService.createInstance(
    CodeEditorWidget,
    container,
    {
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      fontSize: 14,
      cursorBlinking: "solid"
    },
    { contributions: [] }
  ));
  editor.setModel(textModel);
  editor.setPosition({ lineNumber: 1, column: 1 });
  editor.focus();
  const editorObs = observableCodeEditor(editor);
  disposableStore.add(instantiationService.createInstance(
    JumpToView,
    editorObs,
    { style: "label" },
    constObservable({ jumpToPosition: new Position(6, 18) })
  ));
}
function createLongDistanceEditor(options) {
  const { container, disposableStore, theme } = options;
  container.style.width = "600px";
  container.style.height = "500px";
  container.style.border = "1px solid var(--vscode-editorWidget-border)";
  const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
  const textModel = disposableStore.add(createTextModel(
    instantiationService,
    options.code,
    URI.parse("inmemory://long-distance.ts"),
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
          options.editRange.startLineNumber,
          options.editRange.startColumn,
          options.editRange.endLineNumber,
          options.editRange.endColumn
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
      inlineSuggest: {
        edits: { showLongDistanceHint: true }
      },
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
function renderNextFileEdit({ container, disposableStore, theme }) {
  container.style.width = "500px";
  container.style.height = "200px";
  container.style.border = "1px solid var(--vscode-editorWidget-border)";
  const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
  const editorModel = disposableStore.add(createTextModel(
    instantiationService,
    `import { Config } from './config';

export function createApp(config: Config) {
	const app = express();
	app.listen(config.port);
}`,
    URI.parse("inmemory://app.ts"),
    "typescript"
  ));
  const targetModel = disposableStore.add(createTextModel(
    instantiationService,
    `export interface Config {
	port: number;
	host: string;
}`,
    URI.parse("inmemory://config.ts"),
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
        TextModelValueReference.snapshot(targetModel),
        new Range(1, 1, 3, 100),
        `export interface Config {
	port: number;
	host: string;
	debug: boolean;
}`
      )
    ], void 0))),
    loading: constObservable(false),
    seedInlineCompletionsWithSuggestWidget: () => {
    },
    seedWithCompletion: () => {
    },
    suggestWidgetInlineCompletions: constObservable(disposableStore.add(InlineCompletionsState.createEmpty()))
  });
  const editor = disposableStore.add(instantiationService.createInstance(
    CodeEditorWidget,
    container,
    {
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      fontSize: 14,
      cursorBlinking: "solid"
    },
    { contributions: EditorExtensionsRegistry.getEditorContributions() }
  ));
  editor.setModel(editorModel);
  editor.setPosition({ lineNumber: 3, column: 1 });
  editor.focus();
  const controller = InlineCompletionsController.get(editor);
  controller?.model?.get();
}
function renderGutterMenu({ container, disposableStore, theme }) {
  container.style.width = "250px";
  container.style.height = "280px";
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
    }
  });
  const textModel = disposableStore.add(createTextModel(
    instantiationService,
    "const x = 1;",
    URI.parse("inmemory://gutter-menu.ts"),
    "typescript"
  ));
  const editor = disposableStore.add(instantiationService.createInstance(
    CodeEditorWidget,
    document.createElement("div"),
    { minimap: { enabled: false } },
    { contributions: [] }
  ));
  editor.setModel(textModel);
  const editorObs = observableCodeEditor(editor);
  const menuData = new InlineSuggestionGutterMenuData(
    void 0,
    "Copilot",
    [],
    void 0,
    void 0,
    void 0
  );
  const content = disposableStore.add(
    instantiationService.createInstance(
      GutterIndicatorMenuContent,
      editorObs,
      menuData,
      () => {
      }
    ).toDisposableLiveElement()
  );
  container.style.background = "var(--vscode-editorHoverWidget-background)";
  container.style.border = "2px solid var(--vscode-editorHoverWidget-border)";
  container.style.borderRadius = "3px";
  container.style.color = "var(--vscode-editorHoverWidget-foreground)";
  container.appendChild(content.element);
}
var other_fixture_default = defineThemedFixtureGroup({ path: "editor/inlineCompletions/" }, {
  HintsToolbar: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderHintsToolbar(context)
  }),
  HintsToolbarHovered: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderHintsToolbar({ ...context, simulateHover: true })
  }),
  JumpToHint: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderJumpToHint
  }),
  LongDistanceHint: defineComponentFixture({
    labels: { kind: "screenshot", flaky: true },
    render: (context) => createLongDistanceEditor({
      ...context,
      code: LONG_DISTANCE_CODE,
      cursorLine: 1,
      editRange: { startLineNumber: 28, startColumn: 1, endLineNumber: 35, endColumn: 100 },
      newText: `async function processFile(config: Config, filename: string): Promise<void> {
	const inputPath = join(config.inputDir, filename);
	const outputPath = join(config.outputDir, filename);
	const data = await readFile(inputPath, 'utf8');
	if (!validateInput(data)) {
		throw new Error(\`Invalid input in \${filename}\`);
	}
	const processed = data.split('\\n').map(processLine).join('\\n');
	await writeFile(outputPath, processed);`
    })
  }),
  NextFileEditSuggestion: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderNextFileEdit(context)
  }),
  GutterMenu: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: renderGutterMenu
  })
});
export {
  other_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC90ZXN0L2Jyb3dzZXIvY29tcG9uZW50Rml4dHVyZXMvZWRpdG9yL2lubGluZUNvbXBsZXRpb25zL290aGVyLmZpeHR1cmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjb25zdE9ic2VydmFibGUsIElPYnNlcnZhYmxlV2l0aENoYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBjcmVhdGVFZGl0b3JTZXJ2aWNlcywgY3JlYXRlVGV4dE1vZGVsLCBkZWZpbmVDb21wb25lbnRGaXh0dXJlLCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAsIHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMgfSBmcm9tICcuLi8uLi9maXh0dXJlVXRpbHMuanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBDb2RlRWRpdG9yV2lkZ2V0LCBJQ29kZUVkaXRvcldpZGdldE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9jb2RlRWRpdG9yV2lkZ2V0LmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvb2JzZXJ2YWJsZUNvZGVFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL2NvbnRyb2xsZXIvaW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLmpzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9pbmxpbmVDb21wbGV0aW9ucy5jb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgSW5saW5lQ29tcGxldGlvbnNTb3VyY2UsIElubGluZUNvbXBsZXRpb25zU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL21vZGVsL2lubGluZUNvbXBsZXRpb25zU291cmNlLmpzJztcbmltcG9ydCB7IElubGluZUVkaXRJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9tb2RlbC9pbmxpbmVTdWdnZXN0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWxWYWx1ZVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvbW9kZWwvdGV4dE1vZGVsVmFsdWVSZWZlcmVuY2UuanMnO1xuaW1wb3J0IHsgSnVtcFRvVmlldyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9pbmxpbmVFZGl0c1ZpZXdzL2p1bXBUb1ZpZXcuanMnO1xuaW1wb3J0IHsgR3V0dGVySW5kaWNhdG9yTWVudUNvbnRlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL3ZpZXcvaW5saW5lRWRpdHMvY29tcG9uZW50cy9ndXR0ZXJJbmRpY2F0b3JNZW51LmpzJztcbmltcG9ydCB7IElubGluZVN1Z2dlc3Rpb25HdXR0ZXJNZW51RGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy9jb21wb25lbnRzL2d1dHRlckluZGljYXRvclZpZXcuanMnO1xuaW1wb3J0IHsgSVVzZXJJbnRlcmFjdGlvblNlcnZpY2UsIE1vY2tVc2VySW50ZXJhY3Rpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckludGVyYWN0aW9uL2Jyb3dzZXIvdXNlckludGVyYWN0aW9uU2VydmljZS5qcyc7XG5cbmltcG9ydCAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9oaW50c1dpZGdldC9pbmxpbmVDb21wbGV0aW9uc0hpbnRzV2lkZ2V0LmNzcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvdmlldy9pbmxpbmVFZGl0cy92aWV3LmNzcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb2RpY29ucy9jb2RpY29uU3R5bGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5cbmNvbnN0IFNBTVBMRV9DT0RFID0gYGZ1bmN0aW9uIGZpYm9uYWNjaShuOiBudW1iZXIpOiBudW1iZXIge1xuXHRpZiAobiA8PSAxKSByZXR1cm4gbjtcblx0cmV0dXJuIGZpYm9uYWNjaShuIC0gMSkgKyBmaWJvbmFjY2kobiAtIDIpO1xufVxuXG5jb25zdCByZXN1bHQgPSBmaWJvbmFjY2koMTApO1xuY29uc29sZS5sb2cocmVzdWx0KTtcbmA7XG5cbmNvbnN0IExPTkdfRElTVEFOQ0VfQ09ERSA9IGBpbXBvcnQgeyByZWFkRmlsZSwgd3JpdGVGaWxlIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJ3BhdGgnO1xuXG5pbnRlcmZhY2UgQ29uZmlnIHtcblx0aW5wdXREaXI6IHN0cmluZztcblx0b3V0cHV0RGlyOiBzdHJpbmc7XG5cdHZlcmJvc2U6IGJvb2xlYW47XG59XG5cbmZ1bmN0aW9uIGxvYWRDb25maWcoKTogQ29uZmlnIHtcblx0cmV0dXJuIHtcblx0XHRpbnB1dERpcjogJy4vaW5wdXQnLFxuXHRcdG91dHB1dERpcjogJy4vb3V0cHV0Jyxcblx0XHR2ZXJib3NlOiBmYWxzZSxcblx0fTtcbn1cblxuZnVuY3Rpb24gcHJvY2Vzc0xpbmUobGluZTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGxpbmUudHJpbSgpLnRvVXBwZXJDYXNlKCk7XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlSW5wdXQoZGF0YTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiBkYXRhLmxlbmd0aCA+IDAgJiYgZGF0YS5sZW5ndGggPCAxMDAwMDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gcHJvY2Vzc0ZpbGUoY29uZmlnOiBDb25maWcsIGZpbGVuYW1lOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgaW5wdXRQYXRoID0gam9pbihjb25maWcuaW5wdXREaXIsIGZpbGVuYW1lKTtcblx0Y29uc3QgZGF0YSA9IGF3YWl0IHJlYWRGaWxlKGlucHV0UGF0aCwgJ3V0ZjgnKTtcblx0aWYgKCF2YWxpZGF0ZUlucHV0KGRhdGEpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGlucHV0Jyk7XG5cdH1cblx0Y29uc3QgbGluZXMgPSBkYXRhLnNwbGl0KCdcXFxcbicpO1xuXHRjb25zdCBwcm9jZXNzZWQgPSBsaW5lcy5tYXAocHJvY2Vzc0xpbmUpO1xuXHRjb25zdCBvdXRwdXRQYXRoID0gam9pbihjb25maWcub3V0cHV0RGlyLCBmaWxlbmFtZSk7XG5cdGF3YWl0IHdyaXRlRmlsZShvdXRwdXRQYXRoLCBwcm9jZXNzZWQuam9pbignXFxcXG4nKSk7XG5cdGlmIChjb25maWcudmVyYm9zZSkge1xuXHRcdGNvbnNvbGUubG9nKFxcYFByb2Nlc3NlZCBcXCR7ZmlsZW5hbWV9XFxgKTtcblx0fVxufVxuXG5hc3luYyBmdW5jdGlvbiBtYWluKCkge1xuXHRjb25zdCBjb25maWcgPSBsb2FkQ29uZmlnKCk7XG5cdGNvbnN0IGZpbGVzID0gWydhLnR4dCcsICdiLnR4dCcsICdjLnR4dCddO1xuXHRmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcblx0XHRhd2FpdCBwcm9jZXNzRmlsZShjb25maWcsIGZpbGUpO1xuXHR9XG59XG5cbm1haW4oKTtcbmA7XG5cbmludGVyZmFjZSBIaW50c1Rvb2xiYXJPcHRpb25zIGV4dGVuZHMgQ29tcG9uZW50Rml4dHVyZUNvbnRleHQge1xuXHRzaW11bGF0ZUhvdmVyPzogYm9vbGVhbjtcbn1cblxuY29uc3QgSElOVFNfQ09ERSA9IGBmdW5jdGlvbiBncmVldChuYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gXCJIZWxsbywgXCIgKyBuYW1lXG59XG5cbmdyZWV0KFwiV29ybGRcIik7XG5gO1xuXG5hc3luYyBmdW5jdGlvbiByZW5kZXJIaW50c1Rvb2xiYXIob3B0aW9uczogSGludHNUb29sYmFyT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRjb25zdCB7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlLCB0aGVtZSB9ID0gb3B0aW9ucztcblx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gJzUwMHB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICcxODBweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5ib3JkZXIgPSAnMXB4IHNvbGlkIHZhcigtLXZzY29kZS1lZGl0b3JXaWRnZXQtYm9yZGVyKSc7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhkaXNwb3NhYmxlU3RvcmUsIHtcblx0XHRjb2xvclRoZW1lOiB0aGVtZSxcblx0XHRhZGRpdGlvbmFsU2VydmljZXM6IChyZWcpID0+IHtcblx0XHRcdHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMocmVnKTtcblx0XHRcdGlmIChvcHRpb25zLnNpbXVsYXRlSG92ZXIpIHtcblx0XHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElVc2VySW50ZXJhY3Rpb25TZXJ2aWNlLCBuZXcgTW9ja1VzZXJJbnRlcmFjdGlvblNlcnZpY2UodHJ1ZSwgdHJ1ZSkpO1xuXHRcdFx0fVxuXHRcdH0sXG5cdH0pO1xuXG5cdGNvbnN0IHRleHRNb2RlbCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEhJTlRTX0NPREUsXG5cdFx0VVJJLnBhcnNlKCdpbm1lbW9yeTovL2hpbnRzLXRvb2xiYXIudHMnKSxcblx0XHQndHlwZXNjcmlwdCdcblx0KSk7XG5cblx0Ly8gUmVnaXN0ZXIgYW4gaW5saW5lIGNvbXBsZXRpb24gcHJvdmlkZXIgKG5vdCBhbiBpbmxpbmUgZWRpdCkgc28gdGhlIHJlc3VsdCBpcyBnaG9zdCB0ZXh0XG5cdGNvbnN0IGxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSk7XG5cdGRpc3Bvc2FibGVTdG9yZS5hZGQobGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UuaW5saW5lQ29tcGxldGlvbnNQcm92aWRlci5yZWdpc3Rlcih7IHBhdHRlcm46ICcqKicgfSwge1xuXHRcdHByb3ZpZGVJbmxpbmVDb21wbGV0aW9uczogKCkgPT4gKHtcblx0XHRcdGl0ZW1zOiBbe1xuXHRcdFx0XHRpbnNlcnRUZXh0OiAnICsgXCIhXCI7Jyxcblx0XHRcdFx0cmFuZ2U6IG5ldyBSYW5nZSgyLCAyOCwgMiwgMjgpLFxuXHRcdFx0fV0sXG5cdFx0fSksXG5cdFx0ZGlzcG9zZUlubGluZUNvbXBsZXRpb25zOiAoKSA9PiB7IH0sXG5cdH0pKTtcblxuXHRjb25zdCBlZGl0b3IgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdENvZGVFZGl0b3JXaWRnZXQsXG5cdFx0Y29udGFpbmVyLFxuXHRcdHtcblx0XHRcdGF1dG9tYXRpY0xheW91dDogdHJ1ZSxcblx0XHRcdG1pbmltYXA6IHsgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdGxpbmVOdW1iZXJzOiAnb24nLFxuXHRcdFx0c2Nyb2xsQmV5b25kTGFzdExpbmU6IGZhbHNlLFxuXHRcdFx0Zm9udFNpemU6IDE0LFxuXHRcdFx0Y3Vyc29yQmxpbmtpbmc6ICdzb2xpZCcsXG5cdFx0XHRpbmxpbmVTdWdnZXN0OiB7IHNob3dUb29sYmFyOiAnYWx3YXlzJyB9LFxuXHRcdH0sXG5cdFx0eyBjb250cmlidXRpb25zOiBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0RWRpdG9yQ29udHJpYnV0aW9ucygpIH0gc2F0aXNmaWVzIElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9uc1xuXHQpKTtcblxuXHRlZGl0b3Iuc2V0TW9kZWwodGV4dE1vZGVsKTtcblx0ZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogMiwgY29sdW1uOiAyOCB9KTtcblx0ZWRpdG9yLmZvY3VzKCk7XG5cblx0Y29uc3QgY29udHJvbGxlciA9IElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0Y29udHJvbGxlcj8ubW9kZWw/LmdldCgpPy50cmlnZ2VyRXhwbGljaXRseSgpO1xuXG5cdGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDApKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVySnVtcFRvSGludCh7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlLCB0aGVtZSB9OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCk6IHZvaWQge1xuXHRjb250YWluZXIuc3R5bGUud2lkdGggPSAnNTAwcHgnO1xuXHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzIwMHB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgdmFyKC0tdnNjb2RlLWVkaXRvcldpZGdldC1ib3JkZXIpJztcblxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUVkaXRvclNlcnZpY2VzKGRpc3Bvc2FibGVTdG9yZSwgeyBjb2xvclRoZW1lOiB0aGVtZSB9KTtcblxuXHRjb25zdCB0ZXh0TW9kZWwgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbChcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRTQU1QTEVfQ09ERSxcblx0XHRVUkkucGFyc2UoJ2lubWVtb3J5Oi8vanVtcC10by1oaW50LnRzJyksXG5cdFx0J3R5cGVzY3JpcHQnXG5cdCkpO1xuXG5cdGNvbnN0IGVkaXRvciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0Q29kZUVkaXRvcldpZGdldCxcblx0XHRjb250YWluZXIsXG5cdFx0e1xuXHRcdFx0YXV0b21hdGljTGF5b3V0OiB0cnVlLFxuXHRcdFx0bWluaW1hcDogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0bGluZU51bWJlcnM6ICdvbicsXG5cdFx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogZmFsc2UsXG5cdFx0XHRmb250U2l6ZTogMTQsXG5cdFx0XHRjdXJzb3JCbGlua2luZzogJ3NvbGlkJyxcblx0XHR9LFxuXHRcdHsgY29udHJpYnV0aW9uczogW10gfSBzYXRpc2ZpZXMgSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zXG5cdCkpO1xuXG5cdGVkaXRvci5zZXRNb2RlbCh0ZXh0TW9kZWwpO1xuXHRlZGl0b3Iuc2V0UG9zaXRpb24oeyBsaW5lTnVtYmVyOiAxLCBjb2x1bW46IDEgfSk7XG5cdGVkaXRvci5mb2N1cygpO1xuXG5cdGNvbnN0IGVkaXRvck9icyA9IG9ic2VydmFibGVDb2RlRWRpdG9yKGVkaXRvcik7XG5cdGRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0SnVtcFRvVmlldyxcblx0XHRlZGl0b3JPYnMsXG5cdFx0eyBzdHlsZTogJ2xhYmVsJyB9LFxuXHRcdGNvbnN0T2JzZXJ2YWJsZSh7IGp1bXBUb1Bvc2l0aW9uOiBuZXcgUG9zaXRpb24oNiwgMTgpIH0pLFxuXHQpKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTG9uZ0Rpc3RhbmNlRWRpdG9yKG9wdGlvbnM6IHtcblx0Y29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0ZGlzcG9zYWJsZVN0b3JlOiBEaXNwb3NhYmxlU3RvcmU7XG5cdHRoZW1lOiBDb21wb25lbnRGaXh0dXJlQ29udGV4dFsndGhlbWUnXTtcblx0Y29kZTogc3RyaW5nO1xuXHRjdXJzb3JMaW5lOiBudW1iZXI7XG5cdGVkaXRSYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IG51bWJlcjsgc3RhcnRDb2x1bW46IG51bWJlcjsgZW5kTGluZU51bWJlcjogbnVtYmVyOyBlbmRDb2x1bW46IG51bWJlciB9O1xuXHRuZXdUZXh0OiBzdHJpbmc7XG5cdGVkaXRvck9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucztcbn0pOiB2b2lkIHtcblx0Y29uc3QgeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSwgdGhlbWUgfSA9IG9wdGlvbnM7XG5cdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICc2MDBweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnNTAwcHgnO1xuXHRjb250YWluZXIuc3R5bGUuYm9yZGVyID0gJzFweCBzb2xpZCB2YXIoLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWJvcmRlciknO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoZGlzcG9zYWJsZVN0b3JlLCB7IGNvbG9yVGhlbWU6IHRoZW1lIH0pO1xuXG5cdGNvbnN0IHRleHRNb2RlbCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdG9wdGlvbnMuY29kZSxcblx0XHRVUkkucGFyc2UoJ2lubWVtb3J5Oi8vbG9uZy1kaXN0YW5jZS50cycpLFxuXHRcdCd0eXBlc2NyaXB0J1xuXHQpKTtcblxuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViSW5zdGFuY2UoSW5saW5lQ29tcGxldGlvbnNTb3VyY2UsIHtcblx0XHRjYW5jZWxVcGRhdGU6ICgpID0+IHsgfSxcblx0XHRjbGVhcjogKCkgPT4geyB9LFxuXHRcdGNsZWFyT3BlcmF0aW9uT25UZXh0TW9kZWxDaGFuZ2U6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpIGFzIElPYnNlcnZhYmxlV2l0aENoYW5nZTx1bmRlZmluZWQsIHZvaWQ+LFxuXHRcdGNsZWFyU3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zOiAoKSA9PiB7IH0sXG5cdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdGZldGNoOiBhc3luYyAoKSA9PiB0cnVlLFxuXHRcdGlubGluZUNvbXBsZXRpb25zOiBjb25zdE9ic2VydmFibGUoZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgSW5saW5lQ29tcGxldGlvbnNTdGF0ZShbXG5cdFx0XHRJbmxpbmVFZGl0SXRlbS5jcmVhdGVGb3JUZXN0KFxuXHRcdFx0XHRUZXh0TW9kZWxWYWx1ZVJlZmVyZW5jZS5zbmFwc2hvdCh0ZXh0TW9kZWwpLFxuXHRcdFx0XHRuZXcgUmFuZ2UoXG5cdFx0XHRcdFx0b3B0aW9ucy5lZGl0UmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRcdG9wdGlvbnMuZWRpdFJhbmdlLnN0YXJ0Q29sdW1uLFxuXHRcdFx0XHRcdG9wdGlvbnMuZWRpdFJhbmdlLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0b3B0aW9ucy5lZGl0UmFuZ2UuZW5kQ29sdW1uXG5cdFx0XHRcdCksXG5cdFx0XHRcdG9wdGlvbnMubmV3VGV4dFxuXHRcdFx0KVxuXHRcdF0sIHVuZGVmaW5lZCkpKSxcblx0XHRsb2FkaW5nOiBjb25zdE9ic2VydmFibGUoZmFsc2UpLFxuXHRcdHNlZWRJbmxpbmVDb21wbGV0aW9uc1dpdGhTdWdnZXN0V2lkZ2V0OiAoKSA9PiB7IH0sXG5cdFx0c2VlZFdpdGhDb21wbGV0aW9uOiAoKSA9PiB7IH0sXG5cdFx0c3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zOiBjb25zdE9ic2VydmFibGUoZGlzcG9zYWJsZVN0b3JlLmFkZChJbmxpbmVDb21wbGV0aW9uc1N0YXRlLmNyZWF0ZUVtcHR5KCkpKSxcblx0fSk7XG5cblx0Y29uc3QgZWRpdG9yV2lkZ2V0T3B0aW9uczogSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zID0ge1xuXHRcdGNvbnRyaWJ1dGlvbnM6IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRFZGl0b3JDb250cmlidXRpb25zKClcblx0fTtcblxuXHRjb25zdCBlZGl0b3IgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdENvZGVFZGl0b3JXaWRnZXQsXG5cdFx0Y29udGFpbmVyLFxuXHRcdHtcblx0XHRcdGF1dG9tYXRpY0xheW91dDogdHJ1ZSxcblx0XHRcdG1pbmltYXA6IHsgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdGxpbmVOdW1iZXJzOiAnb24nLFxuXHRcdFx0c2Nyb2xsQmV5b25kTGFzdExpbmU6IGZhbHNlLFxuXHRcdFx0Zm9udFNpemU6IDE0LFxuXHRcdFx0Y3Vyc29yQmxpbmtpbmc6ICdzb2xpZCcsXG5cdFx0XHRpbmxpbmVTdWdnZXN0OiB7XG5cdFx0XHRcdGVkaXRzOiB7IHNob3dMb25nRGlzdGFuY2VIaW50OiB0cnVlIH0sXG5cdFx0XHR9LFxuXHRcdFx0Li4ub3B0aW9ucy5lZGl0b3JPcHRpb25zLFxuXHRcdH0sXG5cdFx0ZWRpdG9yV2lkZ2V0T3B0aW9uc1xuXHQpKTtcblxuXHRlZGl0b3Iuc2V0TW9kZWwodGV4dE1vZGVsKTtcblx0ZWRpdG9yLnNldFBvc2l0aW9uKHsgbGluZU51bWJlcjogb3B0aW9ucy5jdXJzb3JMaW5lLCBjb2x1bW46IDEgfSk7XG5cdGVkaXRvci5mb2N1cygpO1xuXG5cdGNvbnN0IGNvbnRyb2xsZXIgPSBJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdGNvbnRyb2xsZXI/Lm1vZGVsPy5nZXQoKTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyTmV4dEZpbGVFZGl0KHsgY29udGFpbmVyLCBkaXNwb3NhYmxlU3RvcmUsIHRoZW1lIH06IENvbXBvbmVudEZpeHR1cmVDb250ZXh0KTogdm9pZCB7XG5cdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICc1MDBweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnMjAwcHgnO1xuXHRjb250YWluZXIuc3R5bGUuYm9yZGVyID0gJzFweCBzb2xpZCB2YXIoLS12c2NvZGUtZWRpdG9yV2lkZ2V0LWJvcmRlciknO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoZGlzcG9zYWJsZVN0b3JlLCB7IGNvbG9yVGhlbWU6IHRoZW1lIH0pO1xuXG5cdC8vIFRoZSBlZGl0b3Igc2hvd3MgdGhpcyBmaWxlXG5cdGNvbnN0IGVkaXRvck1vZGVsID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0YGltcG9ydCB7IENvbmZpZyB9IGZyb20gJy4vY29uZmlnJztcblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFwcChjb25maWc6IENvbmZpZykge1xuXHRjb25zdCBhcHAgPSBleHByZXNzKCk7XG5cdGFwcC5saXN0ZW4oY29uZmlnLnBvcnQpO1xufWAsXG5cdFx0VVJJLnBhcnNlKCdpbm1lbW9yeTovL2FwcC50cycpLFxuXHRcdCd0eXBlc2NyaXB0J1xuXHQpKTtcblxuXHQvLyBUaGUgc3VnZ2VzdGlvbiB0YXJnZXRzIGEgZGlmZmVyZW50IGZpbGVcblx0Y29uc3QgdGFyZ2V0TW9kZWwgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbChcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRgZXhwb3J0IGludGVyZmFjZSBDb25maWcge1xuXHRwb3J0OiBudW1iZXI7XG5cdGhvc3Q6IHN0cmluZztcbn1gLFxuXHRcdFVSSS5wYXJzZSgnaW5tZW1vcnk6Ly9jb25maWcudHMnKSxcblx0XHQndHlwZXNjcmlwdCdcblx0KSk7XG5cblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1Ykluc3RhbmNlKElubGluZUNvbXBsZXRpb25zU291cmNlLCB7XG5cdFx0Y2FuY2VsVXBkYXRlOiAoKSA9PiB7IH0sXG5cdFx0Y2xlYXI6ICgpID0+IHsgfSxcblx0XHRjbGVhck9wZXJhdGlvbk9uVGV4dE1vZGVsQ2hhbmdlOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSBhcyBJT2JzZXJ2YWJsZVdpdGhDaGFuZ2U8dW5kZWZpbmVkLCB2b2lkPixcblx0XHRjbGVhclN1Z2dlc3RXaWRnZXRJbmxpbmVDb21wbGV0aW9uczogKCkgPT4geyB9LFxuXHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHRmZXRjaDogYXN5bmMgKCkgPT4gdHJ1ZSxcblx0XHRpbmxpbmVDb21wbGV0aW9uczogY29uc3RPYnNlcnZhYmxlKGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IElubGluZUNvbXBsZXRpb25zU3RhdGUoW1xuXHRcdFx0SW5saW5lRWRpdEl0ZW0uY3JlYXRlRm9yVGVzdChcblx0XHRcdFx0VGV4dE1vZGVsVmFsdWVSZWZlcmVuY2Uuc25hcHNob3QodGFyZ2V0TW9kZWwpLFxuXHRcdFx0XHRuZXcgUmFuZ2UoMSwgMSwgMywgMTAwKSxcblx0XHRcdFx0YGV4cG9ydCBpbnRlcmZhY2UgQ29uZmlnIHtcXG5cXHRwb3J0OiBudW1iZXI7XFxuXFx0aG9zdDogc3RyaW5nO1xcblxcdGRlYnVnOiBib29sZWFuO1xcbn1gXG5cdFx0XHQpXG5cdFx0XSwgdW5kZWZpbmVkKSkpLFxuXHRcdGxvYWRpbmc6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdFx0c2VlZElubGluZUNvbXBsZXRpb25zV2l0aFN1Z2dlc3RXaWRnZXQ6ICgpID0+IHsgfSxcblx0XHRzZWVkV2l0aENvbXBsZXRpb246ICgpID0+IHsgfSxcblx0XHRzdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnM6IGNvbnN0T2JzZXJ2YWJsZShkaXNwb3NhYmxlU3RvcmUuYWRkKElubGluZUNvbXBsZXRpb25zU3RhdGUuY3JlYXRlRW1wdHkoKSkpLFxuXHR9KTtcblxuXHRjb25zdCBlZGl0b3IgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdENvZGVFZGl0b3JXaWRnZXQsXG5cdFx0Y29udGFpbmVyLFxuXHRcdHtcblx0XHRcdGF1dG9tYXRpY0xheW91dDogdHJ1ZSxcblx0XHRcdG1pbmltYXA6IHsgZW5hYmxlZDogZmFsc2UgfSxcblx0XHRcdGxpbmVOdW1iZXJzOiAnb24nLFxuXHRcdFx0c2Nyb2xsQmV5b25kTGFzdExpbmU6IGZhbHNlLFxuXHRcdFx0Zm9udFNpemU6IDE0LFxuXHRcdFx0Y3Vyc29yQmxpbmtpbmc6ICdzb2xpZCcsXG5cdFx0fSxcblx0XHR7IGNvbnRyaWJ1dGlvbnM6IEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRFZGl0b3JDb250cmlidXRpb25zKCkgfSBzYXRpc2ZpZXMgSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zXG5cdCkpO1xuXG5cdGVkaXRvci5zZXRNb2RlbChlZGl0b3JNb2RlbCk7XG5cdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IDMsIGNvbHVtbjogMSB9KTtcblx0ZWRpdG9yLmZvY3VzKCk7XG5cblx0Y29uc3QgY29udHJvbGxlciA9IElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlci5nZXQoZWRpdG9yKTtcblx0Y29udHJvbGxlcj8ubW9kZWw/LmdldCgpO1xufVxuXG5mdW5jdGlvbiByZW5kZXJHdXR0ZXJNZW51KHsgY29udGFpbmVyLCBkaXNwb3NhYmxlU3RvcmUsIHRoZW1lIH06IENvbXBvbmVudEZpeHR1cmVDb250ZXh0KTogdm9pZCB7XG5cdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICcyNTBweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnMjgwcHgnO1xuXG5cdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gY3JlYXRlRWRpdG9yU2VydmljZXMoZGlzcG9zYWJsZVN0b3JlLCB7XG5cdFx0Y29sb3JUaGVtZTogdGhlbWUsXG5cdFx0YWRkaXRpb25hbFNlcnZpY2VzOiAocmVnKSA9PiB7XG5cdFx0XHRyZWdpc3RlcldvcmtiZW5jaFNlcnZpY2VzKHJlZyk7XG5cdFx0fSxcblx0fSk7XG5cblx0Y29uc3QgdGV4dE1vZGVsID0gZGlzcG9zYWJsZVN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0J2NvbnN0IHggPSAxOycsXG5cdFx0VVJJLnBhcnNlKCdpbm1lbW9yeTovL2d1dHRlci1tZW51LnRzJyksXG5cdFx0J3R5cGVzY3JpcHQnXG5cdCkpO1xuXG5cdGNvbnN0IGVkaXRvciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0Q29kZUVkaXRvcldpZGdldCxcblx0XHRkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcblx0XHR7IG1pbmltYXA6IHsgZW5hYmxlZDogZmFsc2UgfSB9LFxuXHRcdHsgY29udHJpYnV0aW9uczogW10gfSBzYXRpc2ZpZXMgSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zXG5cdCkpO1xuXHRlZGl0b3Iuc2V0TW9kZWwodGV4dE1vZGVsKTtcblxuXHRjb25zdCBlZGl0b3JPYnMgPSBvYnNlcnZhYmxlQ29kZUVkaXRvcihlZGl0b3IpO1xuXHRjb25zdCBtZW51RGF0YSA9IG5ldyBJbmxpbmVTdWdnZXN0aW9uR3V0dGVyTWVudURhdGEoXG5cdFx0dW5kZWZpbmVkLFxuXHRcdCdDb3BpbG90Jyxcblx0XHRbXSxcblx0XHR1bmRlZmluZWQsXG5cdFx0dW5kZWZpbmVkLFxuXHRcdHVuZGVmaW5lZCxcblx0KTtcblxuXHRjb25zdCBjb250ZW50ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdEd1dHRlckluZGljYXRvck1lbnVDb250ZW50LFxuXHRcdFx0ZWRpdG9yT2JzLFxuXHRcdFx0bWVudURhdGEsXG5cdFx0XHQoKSA9PiB7IH0sXG5cdFx0KS50b0Rpc3Bvc2FibGVMaXZlRWxlbWVudCgpXG5cdCk7XG5cblx0Y29udGFpbmVyLnN0eWxlLmJhY2tncm91bmQgPSAndmFyKC0tdnNjb2RlLWVkaXRvckhvdmVyV2lkZ2V0LWJhY2tncm91bmQpJztcblx0Y29udGFpbmVyLnN0eWxlLmJvcmRlciA9ICcycHggc29saWQgdmFyKC0tdnNjb2RlLWVkaXRvckhvdmVyV2lkZ2V0LWJvcmRlciknO1xuXHRjb250YWluZXIuc3R5bGUuYm9yZGVyUmFkaXVzID0gJzNweCc7XG5cdGNvbnRhaW5lci5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZWRpdG9ySG92ZXJXaWRnZXQtZm9yZWdyb3VuZCknO1xuXHRjb250YWluZXIuYXBwZW5kQ2hpbGQoY29udGVudC5lbGVtZW50KTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHsgcGF0aDogJ2VkaXRvci9pbmxpbmVDb21wbGV0aW9ucy8nIH0sIHtcblx0SGludHNUb29sYmFyOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiAoY29udGV4dCkgPT4gcmVuZGVySGludHNUb29sYmFyKGNvbnRleHQpLFxuXHR9KSxcblx0SGludHNUb29sYmFySG92ZXJlZDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogKGNvbnRleHQpID0+IHJlbmRlckhpbnRzVG9vbGJhcih7IC4uLmNvbnRleHQsIHNpbXVsYXRlSG92ZXI6IHRydWUgfSksXG5cdH0pLFxuXHRKdW1wVG9IaW50OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiByZW5kZXJKdW1wVG9IaW50LFxuXHR9KSxcblx0TG9uZ0Rpc3RhbmNlSGludDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JywgZmxha3k6IHRydWUgfSxcblx0XHRyZW5kZXI6IChjb250ZXh0KSA9PiBjcmVhdGVMb25nRGlzdGFuY2VFZGl0b3Ioe1xuXHRcdFx0Li4uY29udGV4dCxcblx0XHRcdGNvZGU6IExPTkdfRElTVEFOQ0VfQ09ERSxcblx0XHRcdGN1cnNvckxpbmU6IDEsXG5cdFx0XHRlZGl0UmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAyOCwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDM1LCBlbmRDb2x1bW46IDEwMCB9LFxuXHRcdFx0bmV3VGV4dDogYGFzeW5jIGZ1bmN0aW9uIHByb2Nlc3NGaWxlKGNvbmZpZzogQ29uZmlnLCBmaWxlbmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdGNvbnN0IGlucHV0UGF0aCA9IGpvaW4oY29uZmlnLmlucHV0RGlyLCBmaWxlbmFtZSk7XG5cdGNvbnN0IG91dHB1dFBhdGggPSBqb2luKGNvbmZpZy5vdXRwdXREaXIsIGZpbGVuYW1lKTtcblx0Y29uc3QgZGF0YSA9IGF3YWl0IHJlYWRGaWxlKGlucHV0UGF0aCwgJ3V0ZjgnKTtcblx0aWYgKCF2YWxpZGF0ZUlucHV0KGRhdGEpKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKFxcYEludmFsaWQgaW5wdXQgaW4gXFwke2ZpbGVuYW1lfVxcYCk7XG5cdH1cblx0Y29uc3QgcHJvY2Vzc2VkID0gZGF0YS5zcGxpdCgnXFxcXG4nKS5tYXAocHJvY2Vzc0xpbmUpLmpvaW4oJ1xcXFxuJyk7XG5cdGF3YWl0IHdyaXRlRmlsZShvdXRwdXRQYXRoLCBwcm9jZXNzZWQpO2AsXG5cdFx0fSksXG5cdH0pLFxuXHROZXh0RmlsZUVkaXRTdWdnZXN0aW9uOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiAoY29udGV4dCkgPT4gcmVuZGVyTmV4dEZpbGVFZGl0KGNvbnRleHQpLFxuXHR9KSxcblx0R3V0dGVyTWVudTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogcmVuZGVyR3V0dGVyTWVudSxcblx0fSksXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsdUJBQThDO0FBQ3ZELFNBQVMsV0FBVztBQUNwQixTQUFrQyxzQkFBc0IsaUJBQWlCLHdCQUF3QiwwQkFBMEIsaUNBQWlDO0FBQzVKLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsd0JBQWtEO0FBQzNELFNBQVMsNEJBQTRCO0FBRXJDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG1DQUFtQztBQUM1QyxPQUFPO0FBQ1AsU0FBUyx5QkFBeUIsOEJBQThCO0FBQ2hFLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMseUJBQXlCLGtDQUFrQztBQUVwRSxPQUFPO0FBQ1AsT0FBTztBQUNQLE9BQU87QUFHUCxNQUFNLGNBQWM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQVNwQixNQUFNLHFCQUFxQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7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
