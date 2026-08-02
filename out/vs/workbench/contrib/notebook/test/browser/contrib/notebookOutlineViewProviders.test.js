import assert from "assert";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestThemeService } from "../../../../../../platform/theme/test/common/testThemeService.js";
import { NotebookBreadcrumbsProvider, NotebookOutlinePaneProvider, NotebookQuickPickProvider } from "../../../browser/contrib/outline/notebookOutline.js";
import { NotebookOutlineEntryFactory } from "../../../browser/viewModel/notebookOutlineEntryFactory.js";
import { OutlineEntry } from "../../../browser/viewModel/OutlineEntry.js";
suite("Notebook Outline View Providers", function() {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const configurationService = new TestConfigurationService();
  const themeService = new TestThemeService();
  const symbolsPerTextModel = {};
  function setSymbolsForTextModel(symbols, textmodelId = "textId") {
    symbolsPerTextModel[textmodelId] = symbols;
  }
  const executionService = new class extends mock() {
    getCellExecution() {
      return void 0;
    }
  }();
  class OutlineModelStub {
    constructor(textId) {
      this.textId = textId;
    }
    getTopLevelSymbols() {
      return symbolsPerTextModel[this.textId];
    }
  }
  const outlineModelService = new class extends mock() {
    getOrCreate(model, arg1) {
      const outline = new OutlineModelStub(model.id);
      return Promise.resolve(outline);
    }
    getDebounceValue(arg0) {
      return 0;
    }
  }();
  const textModelService = new class extends mock() {
    createModelReference(uri) {
      return Promise.resolve({
        object: {
          textEditorModel: {
            id: uri.toString(),
            getVersionId() {
              return 1;
            }
          }
        },
        dispose() {
        }
      });
    }
  }();
  function createCodeCellViewModel(version = 1, source = "# code", textmodelId = "textId") {
    return {
      uri: { toString() {
        return textmodelId;
      } },
      id: textmodelId,
      textBuffer: {
        getLineCount() {
          return 0;
        }
      },
      getText() {
        return source;
      },
      model: {
        textModel: {
          id: textmodelId,
          getVersionId() {
            return version;
          }
        }
      },
      resolveTextModel() {
        return this.model.textModel;
      },
      cellKind: 2
    };
  }
  function createMockOutlineDataSource(entries, activeElement = void 0) {
    return new class extends mock() {
      constructor() {
        super(...arguments);
        this.object = {
          entries,
          activeElement
        };
      }
    }();
  }
  function createMarkupCellViewModel(version = 1, source = "markup", textmodelId = "textId", alternativeId = 1) {
    return {
      textBuffer: {
        getLineCount() {
          return 0;
        }
      },
      getText() {
        return source;
      },
      getAlternativeId() {
        return alternativeId;
      },
      model: {
        textModel: {
          id: textmodelId,
          getVersionId() {
            return version;
          }
        }
      },
      resolveTextModel() {
        return this.model.textModel;
      },
      cellKind: 1
    };
  }
  function flatten(element, dataSource) {
    const elements = [];
    const children = dataSource.getChildren(element);
    for (const child of children) {
      elements.push(child);
      elements.push(...flatten(child, dataSource));
    }
    return elements;
  }
  function buildOutlineTree(entries) {
    if (entries.length > 0) {
      const result = [entries[0]];
      const parentStack = [entries[0]];
      for (let i = 1; i < entries.length; i++) {
        const entry = entries[i];
        while (true) {
          const len = parentStack.length;
          if (len === 0) {
            result.push(entry);
            parentStack.push(entry);
            break;
          } else {
            const parentCandidate = parentStack[len - 1];
            if (parentCandidate.level < entry.level) {
              parentCandidate.addChild(entry);
              parentStack.push(entry);
              break;
            } else {
              parentStack.pop();
            }
          }
        }
      }
      return result;
    }
    return void 0;
  }
  async function setOutlineViewConfiguration(config) {
    await configurationService.setUserConfiguration("notebook.outline.showMarkdownHeadersOnly", config.outlineShowMarkdownHeadersOnly);
    await configurationService.setUserConfiguration("notebook.outline.showCodeCells", config.outlineShowCodeCells);
    await configurationService.setUserConfiguration("notebook.outline.showCodeCellSymbols", config.outlineShowCodeCellSymbols);
    await configurationService.setUserConfiguration("notebook.gotoSymbols.showAllSymbols", config.quickPickShowAllSymbols);
    await configurationService.setUserConfiguration("notebook.breadcrumbs.showCodeCells", config.breadcrumbsShowCodeCells);
  }
  test("OutlinePane 0: Default Settings (Headers Only ON, Code cells OFF, Symbols ON)", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: true,
      outlineShowCodeCells: false,
      outlineShowCodeCellSymbols: true,
      quickPickShowAllSymbols: false,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {} }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {} }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const outlinePaneProvider = store.add(new NotebookOutlinePaneProvider(void 0, configurationService));
    const results = flatten(outlineModel, outlinePaneProvider);
    assert.equal(results.length, 1);
    assert.equal(results[0].label, "h1");
    assert.equal(results[0].level, 1);
  });
  test("OutlinePane 1: ALL Markdown", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: false,
      outlineShowCodeCells: false,
      outlineShowCodeCellSymbols: false,
      quickPickShowAllSymbols: false,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {} }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {} }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const outlinePaneProvider = store.add(new NotebookOutlinePaneProvider(void 0, configurationService));
    const results = flatten(outlineModel, outlinePaneProvider);
    assert.equal(results.length, 2);
    assert.equal(results[0].label, "h1");
    assert.equal(results[0].level, 1);
    assert.equal(results[1].label, "plaintext");
    assert.equal(results[1].level, 7);
  });
  test("OutlinePane 2: Only Headers", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: true,
      outlineShowCodeCells: false,
      outlineShowCodeCellSymbols: false,
      quickPickShowAllSymbols: false,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {} }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {} }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const outlinePaneProvider = store.add(new NotebookOutlinePaneProvider(void 0, configurationService));
    const results = flatten(outlineModel, outlinePaneProvider);
    assert.equal(results.length, 1);
    assert.equal(results[0].label, "h1");
    assert.equal(results[0].level, 1);
  });
  test("OutlinePane 3: Only Headers + Code Cells", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: true,
      outlineShowCodeCells: true,
      outlineShowCodeCellSymbols: false,
      quickPickShowAllSymbols: false,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {} }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {} }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const outlinePaneProvider = store.add(new NotebookOutlinePaneProvider(void 0, configurationService));
    const results = flatten(outlineModel, outlinePaneProvider);
    assert.equal(results.length, 3);
    assert.equal(results[0].label, "h1");
    assert.equal(results[0].level, 1);
    assert.equal(results[1].label, "# code cell 2");
    assert.equal(results[1].level, 7);
    assert.equal(results[2].label, "# code cell 3");
    assert.equal(results[2].level, 7);
  });
  test("OutlinePane 4: Only Headers + Code Cells + Symbols", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: true,
      outlineShowCodeCells: true,
      outlineShowCodeCellSymbols: true,
      quickPickShowAllSymbols: false,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {} }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {} }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const outlinePaneProvider = store.add(new NotebookOutlinePaneProvider(void 0, configurationService));
    const results = flatten(outlineModel, outlinePaneProvider);
    assert.equal(results.length, 5);
    assert.equal(results[0].label, "h1");
    assert.equal(results[0].level, 1);
    assert.equal(results[1].label, "# code cell 2");
    assert.equal(results[1].level, 7);
    assert.equal(results[2].label, "var2");
    assert.equal(results[2].level, 8);
    assert.equal(results[3].label, "# code cell 3");
    assert.equal(results[3].level, 7);
    assert.equal(results[4].label, "var3");
    assert.equal(results[4].level, 8);
  });
  test("QuickPick 0: Symbols On + 2 cells WITH symbols", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: false,
      outlineShowCodeCells: false,
      outlineShowCodeCellSymbols: false,
      quickPickShowAllSymbols: true,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {}, kind: 12 }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {}, kind: 12 }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const quickPickProvider = store.add(new NotebookQuickPickProvider(createMockOutlineDataSource([...outlineModel.children]), configurationService, themeService));
    const results = quickPickProvider.getQuickPickElements();
    assert.equal(results.length, 4);
    assert.equal(results[0].label, "$(markdown) h1");
    assert.equal(results[0].element.level, 1);
    assert.equal(results[1].label, "$(markdown) plaintext");
    assert.equal(results[1].element.level, 7);
    assert.equal(results[2].label, "$(symbol-variable) var2");
    assert.equal(results[2].element.level, 8);
    assert.equal(results[3].label, "$(symbol-variable) var3");
    assert.equal(results[3].element.level, 8);
  });
  test("QuickPick 1: Symbols On + 1 cell WITH symbol + 1 cell WITHOUT symbol", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: false,
      outlineShowCodeCells: false,
      outlineShowCodeCellSymbols: false,
      quickPickShowAllSymbols: true,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {}, kind: 12 }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const quickPickProvider = store.add(new NotebookQuickPickProvider(createMockOutlineDataSource([...outlineModel.children]), configurationService, themeService));
    const results = quickPickProvider.getQuickPickElements();
    assert.equal(results.length, 4);
    assert.equal(results[0].label, "$(markdown) h1");
    assert.equal(results[0].element.level, 1);
    assert.equal(results[1].label, "$(markdown) plaintext");
    assert.equal(results[1].element.level, 7);
    assert.equal(results[2].label, "$(code) # code cell 2");
    assert.equal(results[2].element.level, 7);
    assert.equal(results[3].label, "$(symbol-variable) var3");
    assert.equal(results[3].element.level, 8);
  });
  test("QuickPick 3: Symbols Off", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: false,
      outlineShowCodeCells: false,
      outlineShowCodeCellSymbols: false,
      quickPickShowAllSymbols: false,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {}, kind: 12 }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {}, kind: 12 }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createCodeCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const quickPickProvider = store.add(new NotebookQuickPickProvider(createMockOutlineDataSource([...outlineModel.children]), configurationService, themeService));
    const results = quickPickProvider.getQuickPickElements();
    assert.equal(results.length, 4);
    assert.equal(results[0].label, "$(markdown) h1");
    assert.equal(results[0].element.level, 1);
    assert.equal(results[1].label, "$(markdown) plaintext");
    assert.equal(results[1].element.level, 7);
    assert.equal(results[2].label, "$(code) # code cell 2");
    assert.equal(results[2].element.level, 7);
    assert.equal(results[3].label, "$(code) # code cell 3");
    assert.equal(results[3].element.level, 7);
  });
  test("Breadcrumbs 0: Code Cells On ", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: false,
      outlineShowCodeCells: false,
      outlineShowCodeCellSymbols: false,
      quickPickShowAllSymbols: false,
      breadcrumbsShowCodeCells: true
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {}, kind: 12 }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {}, kind: 12 }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createMarkupCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const outlineTree = buildOutlineTree([...outlineModel.children]);
    const breadcrumbsProvider = store.add(new NotebookBreadcrumbsProvider(createMockOutlineDataSource([], [...outlineTree[0].children][1]), configurationService));
    const results = breadcrumbsProvider.getBreadcrumbElements();
    assert.equal(results.length, 3);
    assert.equal(results[0].element.label, "fakeRoot");
    assert.equal(results[0].element.level, -1);
    assert.equal(results[1].element.label, "h1");
    assert.equal(results[1].element.level, 1);
    assert.equal(results[2].element.label, "# code cell 2");
    assert.equal(results[2].element.level, 7);
  });
  test("Breadcrumbs 1: Code Cells Off ", async function() {
    await setOutlineViewConfiguration({
      outlineShowMarkdownHeadersOnly: false,
      outlineShowCodeCells: false,
      outlineShowCodeCellSymbols: false,
      quickPickShowAllSymbols: false,
      breadcrumbsShowCodeCells: false
    });
    const cells = [
      createMarkupCellViewModel(1, "# h1", "$0", 0),
      createMarkupCellViewModel(1, "plaintext", "$1", 0),
      createCodeCellViewModel(1, "# code cell 2", "$2"),
      createCodeCellViewModel(1, "# code cell 3", "$3")
    ];
    setSymbolsForTextModel([], "$0");
    setSymbolsForTextModel([], "$1");
    setSymbolsForTextModel([{ name: "var2", range: {}, kind: 12 }], "$2");
    setSymbolsForTextModel([{ name: "var3", range: {}, kind: 12 }], "$3");
    const entryFactory = new NotebookOutlineEntryFactory(executionService, outlineModelService, textModelService);
    for (const cell of cells) {
      await entryFactory.cacheSymbols(cell, CancellationToken.None);
    }
    const outlineModel = new OutlineEntry(-1, -1, createMarkupCellViewModel(), "fakeRoot", false, false, void 0, void 0);
    for (const cell of cells) {
      entryFactory.getOutlineEntries(cell, 0).forEach((entry) => outlineModel.addChild(entry));
    }
    const outlineTree = buildOutlineTree([...outlineModel.children]);
    const breadcrumbsProvider = store.add(new NotebookBreadcrumbsProvider(createMockOutlineDataSource([], [...outlineTree[0].children][1]), configurationService));
    const results = breadcrumbsProvider.getBreadcrumbElements();
    assert.equal(results.length, 2);
    assert.equal(results[0].element.label, "fakeRoot");
    assert.equal(results[0].element.level, -1);
    assert.equal(results[1].element.label, "h1");
    assert.equal(results[1].element.level, 1);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL25vdGVib29rL3Rlc3QvYnJvd3Nlci9jb250cmliL25vdGVib29rT3V0bGluZVZpZXdQcm92aWRlcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElEYXRhU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJT3V0bGluZU1vZGVsU2VydmljZSwgT3V0bGluZU1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZG9jdW1lbnRTeW1ib2xzL2Jyb3dzZXIvb3V0bGluZU1vZGVsLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS90ZXN0L2NvbW1vbi90ZXN0VGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rQnJlYWRjcnVtYnNQcm92aWRlciwgTm90ZWJvb2tDZWxsT3V0bGluZSwgTm90ZWJvb2tPdXRsaW5lUGFuZVByb3ZpZGVyLCBOb3RlYm9va1F1aWNrUGlja1Byb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jb250cmliL291dGxpbmUvbm90ZWJvb2tPdXRsaW5lLmpzJztcbmltcG9ydCB7IElDZWxsVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9ub3RlYm9va0Jyb3dzZXIuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rQ2VsbE91dGxpbmVEYXRhU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci92aWV3TW9kZWwvbm90ZWJvb2tPdXRsaW5lRGF0YVNvdXJjZS5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va091dGxpbmVFbnRyeUZhY3RvcnkgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3ZpZXdNb2RlbC9ub3RlYm9va091dGxpbmVFbnRyeUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgT3V0bGluZUVudHJ5IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci92aWV3TW9kZWwvT3V0bGluZUVudHJ5LmpzJztcbmltcG9ydCB7IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2NrRG9jdW1lbnRTeW1ib2wgfSBmcm9tICcuLi90ZXN0Tm90ZWJvb2tFZGl0b3IuanMnO1xuaW1wb3J0IHsgSVJlc29sdmVkVGV4dEVkaXRvck1vZGVsLCBJVGV4dE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvcmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5cbnN1aXRlKCdOb3RlYm9vayBPdXRsaW5lIFZpZXcgUHJvdmlkZXJzJywgZnVuY3Rpb24gKCkge1xuXG5cdC8vICNyZWdpb24gU2V0dXBcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRjb25zdCB0aGVtZVNlcnZpY2UgPSBuZXcgVGVzdFRoZW1lU2VydmljZSgpO1xuXG5cdGNvbnN0IHN5bWJvbHNQZXJUZXh0TW9kZWw6IFJlY29yZDxzdHJpbmcsIE1vY2tEb2N1bWVudFN5bWJvbFtdPiA9IHt9O1xuXHRmdW5jdGlvbiBzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKHN5bWJvbHM6IE1vY2tEb2N1bWVudFN5bWJvbFtdLCB0ZXh0bW9kZWxJZCA9ICd0ZXh0SWQnKSB7XG5cdFx0c3ltYm9sc1BlclRleHRNb2RlbFt0ZXh0bW9kZWxJZF0gPSBzeW1ib2xzO1xuXHR9XG5cblx0Y29uc3QgZXhlY3V0aW9uU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBnZXRDZWxsRXhlY3V0aW9uKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdH07XG5cblx0Y2xhc3MgT3V0bGluZU1vZGVsU3R1YiB7XG5cdFx0Y29uc3RydWN0b3IocHJpdmF0ZSB0ZXh0SWQ6IHN0cmluZykgeyB9XG5cblx0XHRnZXRUb3BMZXZlbFN5bWJvbHMoKSB7XG5cdFx0XHRyZXR1cm4gc3ltYm9sc1BlclRleHRNb2RlbFt0aGlzLnRleHRJZF07XG5cdFx0fVxuXHR9XG5cdGNvbnN0IG91dGxpbmVNb2RlbFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElPdXRsaW5lTW9kZWxTZXJ2aWNlPigpIHtcblx0XHRvdmVycmlkZSBnZXRPckNyZWF0ZShtb2RlbDogSVRleHRNb2RlbCwgYXJnMTogYW55KSB7XG5cdFx0XHRjb25zdCBvdXRsaW5lID0gbmV3IE91dGxpbmVNb2RlbFN0dWIobW9kZWwuaWQpIGFzIHVua25vd24gYXMgT3V0bGluZU1vZGVsO1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShvdXRsaW5lKTtcblx0XHR9XG5cdFx0b3ZlcnJpZGUgZ2V0RGVib3VuY2VWYWx1ZShhcmcwOiBhbnkpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0fTtcblx0Y29uc3QgdGV4dE1vZGVsU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRNb2RlbFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGNyZWF0ZU1vZGVsUmVmZXJlbmNlKHVyaTogVVJJKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcblx0XHRcdFx0b2JqZWN0OiB7XG5cdFx0XHRcdFx0dGV4dEVkaXRvck1vZGVsOiB7XG5cdFx0XHRcdFx0XHRpZDogdXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRnZXRWZXJzaW9uSWQoKSB7IHJldHVybiAxOyB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRkaXNwb3NlKCkgeyB9XG5cdFx0XHR9IGFzIElSZWZlcmVuY2U8SVJlc29sdmVkVGV4dEVkaXRvck1vZGVsPik7XG5cdFx0fVxuXHR9O1xuXG5cdC8vICNlbmRyZWdpb25cblx0Ly8gI3JlZ2lvbiBIZWxwZXJzXG5cblx0ZnVuY3Rpb24gY3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwodmVyc2lvbjogbnVtYmVyID0gMSwgc291cmNlID0gJyMgY29kZScsIHRleHRtb2RlbElkID0gJ3RleHRJZCcpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dXJpOiB7IHRvU3RyaW5nKCkgeyByZXR1cm4gdGV4dG1vZGVsSWQ7IH0gfSxcblx0XHRcdGlkOiB0ZXh0bW9kZWxJZCxcblx0XHRcdHRleHRCdWZmZXI6IHtcblx0XHRcdFx0Z2V0TGluZUNvdW50KCkgeyByZXR1cm4gMDsgfVxuXHRcdFx0fSxcblx0XHRcdGdldFRleHQoKSB7XG5cdFx0XHRcdHJldHVybiBzb3VyY2U7XG5cdFx0XHR9LFxuXHRcdFx0bW9kZWw6IHtcblx0XHRcdFx0dGV4dE1vZGVsOiB7XG5cdFx0XHRcdFx0aWQ6IHRleHRtb2RlbElkLFxuXHRcdFx0XHRcdGdldFZlcnNpb25JZCgpIHsgcmV0dXJuIHZlcnNpb247IH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHJlc29sdmVUZXh0TW9kZWwoKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLm1vZGVsLnRleHRNb2RlbCBhcyB1bmtub3duO1xuXHRcdFx0fSxcblx0XHRcdGNlbGxLaW5kOiAyXG5cdFx0fSBhcyBJQ2VsbFZpZXdNb2RlbDtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tPdXRsaW5lRGF0YVNvdXJjZShlbnRyaWVzOiBPdXRsaW5lRW50cnlbXSwgYWN0aXZlRWxlbWVudDogT3V0bGluZUVudHJ5IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVJlZmVyZW5jZTxJTm90ZWJvb2tDZWxsT3V0bGluZURhdGFTb3VyY2U+PigpIHtcblx0XHRcdG92ZXJyaWRlIG9iamVjdDogSU5vdGVib29rQ2VsbE91dGxpbmVEYXRhU291cmNlID0ge1xuXHRcdFx0XHRlbnRyaWVzOiBlbnRyaWVzLFxuXHRcdFx0XHRhY3RpdmVFbGVtZW50OiBhY3RpdmVFbGVtZW50LFxuXHRcdFx0fTtcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlTWFya3VwQ2VsbFZpZXdNb2RlbCh2ZXJzaW9uOiBudW1iZXIgPSAxLCBzb3VyY2UgPSAnbWFya3VwJywgdGV4dG1vZGVsSWQgPSAndGV4dElkJywgYWx0ZXJuYXRpdmVJZCA9IDEpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dGV4dEJ1ZmZlcjoge1xuXHRcdFx0XHRnZXRMaW5lQ291bnQoKSB7IHJldHVybiAwOyB9XG5cdFx0XHR9LFxuXHRcdFx0Z2V0VGV4dCgpIHtcblx0XHRcdFx0cmV0dXJuIHNvdXJjZTtcblx0XHRcdH0sXG5cdFx0XHRnZXRBbHRlcm5hdGl2ZUlkKCkge1xuXHRcdFx0XHRyZXR1cm4gYWx0ZXJuYXRpdmVJZDtcblx0XHRcdH0sXG5cdFx0XHRtb2RlbDoge1xuXHRcdFx0XHR0ZXh0TW9kZWw6IHtcblx0XHRcdFx0XHRpZDogdGV4dG1vZGVsSWQsXG5cdFx0XHRcdFx0Z2V0VmVyc2lvbklkKCkgeyByZXR1cm4gdmVyc2lvbjsgfVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0cmVzb2x2ZVRleHRNb2RlbCgpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMubW9kZWwudGV4dE1vZGVsIGFzIHVua25vd247XG5cdFx0XHR9LFxuXHRcdFx0Y2VsbEtpbmQ6IDFcblx0XHR9IGFzIElDZWxsVmlld01vZGVsO1xuXHR9XG5cblx0ZnVuY3Rpb24gZmxhdHRlbihlbGVtZW50OiBPdXRsaW5lRW50cnksIGRhdGFTb3VyY2U6IElEYXRhU291cmNlPE5vdGVib29rQ2VsbE91dGxpbmUsIE91dGxpbmVFbnRyeT4pOiBPdXRsaW5lRW50cnlbXSB7XG5cdFx0Y29uc3QgZWxlbWVudHM6IE91dGxpbmVFbnRyeVtdID0gW107XG5cblx0XHRjb25zdCBjaGlsZHJlbiA9IGRhdGFTb3VyY2UuZ2V0Q2hpbGRyZW4oZWxlbWVudCk7XG5cdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBjaGlsZHJlbikge1xuXHRcdFx0ZWxlbWVudHMucHVzaChjaGlsZCk7XG5cdFx0XHRlbGVtZW50cy5wdXNoKC4uLmZsYXR0ZW4oY2hpbGQsIGRhdGFTb3VyY2UpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gZWxlbWVudHM7XG5cdH1cblxuXHRmdW5jdGlvbiBidWlsZE91dGxpbmVUcmVlKGVudHJpZXM6IE91dGxpbmVFbnRyeVtdKTogT3V0bGluZUVudHJ5W10gfCB1bmRlZmluZWQge1xuXHRcdGlmIChlbnRyaWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IHJlc3VsdDogT3V0bGluZUVudHJ5W10gPSBbZW50cmllc1swXV07XG5cdFx0XHRjb25zdCBwYXJlbnRTdGFjazogT3V0bGluZUVudHJ5W10gPSBbZW50cmllc1swXV07XG5cblx0XHRcdGZvciAobGV0IGkgPSAxOyBpIDwgZW50cmllcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IGVudHJpZXNbaV07XG5cblx0XHRcdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdFx0XHRjb25zdCBsZW4gPSBwYXJlbnRTdGFjay5sZW5ndGg7XG5cdFx0XHRcdFx0aWYgKGxlbiA9PT0gMCkge1xuXHRcdFx0XHRcdFx0Ly8gcm9vdCBub2RlXG5cdFx0XHRcdFx0XHRyZXN1bHQucHVzaChlbnRyeSk7XG5cdFx0XHRcdFx0XHRwYXJlbnRTdGFjay5wdXNoKGVudHJ5KTtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGNvbnN0IHBhcmVudENhbmRpZGF0ZSA9IHBhcmVudFN0YWNrW2xlbiAtIDFdO1xuXHRcdFx0XHRcdFx0aWYgKHBhcmVudENhbmRpZGF0ZS5sZXZlbCA8IGVudHJ5LmxldmVsKSB7XG5cdFx0XHRcdFx0XHRcdHBhcmVudENhbmRpZGF0ZS5hZGRDaGlsZChlbnRyeSk7XG5cdFx0XHRcdFx0XHRcdHBhcmVudFN0YWNrLnB1c2goZW50cnkpO1xuXHRcdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHBhcmVudFN0YWNrLnBvcCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZXQgdGhlIGNvbmZpZ3VyYXRpb24gc2V0dGluZ3MgcmVsZXZhbnQgdG8gdmFyaW91cyBvdXRsaW5lIHZpZXdzIChPdXRsaW5lUGFuZSwgUXVpY2tQaWNrLCBCcmVhZGNydW1icylcblx0ICpcblx0ICogQHBhcmFtIG91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seTogYm9vbGVhbiBcdChub3RlYm9vay5vdXRsaW5lLnNob3dNYXJrZG93bkhlYWRlcnNPbmx5KVxuXHQgKiBAcGFyYW0gb3V0bGluZVNob3dDb2RlQ2VsbHM6IGJvb2xlYW4gXHRcdFx0KG5vdGVib29rLm91dGxpbmUuc2hvd0NvZGVDZWxscylcblx0ICogQHBhcmFtIG91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzOiBib29sZWFuIFx0XHQobm90ZWJvb2sub3V0bGluZS5zaG93Q29kZUNlbGxTeW1ib2xzKVxuXHQgKiBAcGFyYW0gcXVpY2tQaWNrU2hvd0FsbFN5bWJvbHM6IGJvb2xlYW4gXHRcdFx0KG5vdGVib29rLmdvdG9TeW1ib2xzLnNob3dBbGxTeW1ib2xzKVxuXHQgKiBAcGFyYW0gYnJlYWRjcnVtYnNTaG93Q29kZUNlbGxzOiBib29sZWFuIFx0XHQobm90ZWJvb2suYnJlYWRjcnVtYnMuc2hvd0NvZGVDZWxscylcblx0ICovXG5cdGFzeW5jIGZ1bmN0aW9uIHNldE91dGxpbmVWaWV3Q29uZmlndXJhdGlvbihjb25maWc6IHtcblx0XHRvdXRsaW5lU2hvd01hcmtkb3duSGVhZGVyc09ubHk6IGJvb2xlYW47XG5cdFx0b3V0bGluZVNob3dDb2RlQ2VsbHM6IGJvb2xlYW47XG5cdFx0b3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHM6IGJvb2xlYW47XG5cdFx0cXVpY2tQaWNrU2hvd0FsbFN5bWJvbHM6IGJvb2xlYW47XG5cdFx0YnJlYWRjcnVtYnNTaG93Q29kZUNlbGxzOiBib29sZWFuO1xuXHR9KSB7XG5cdFx0YXdhaXQgY29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ25vdGVib29rLm91dGxpbmUuc2hvd01hcmtkb3duSGVhZGVyc09ubHknLCBjb25maWcub3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5KTtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignbm90ZWJvb2sub3V0bGluZS5zaG93Q29kZUNlbGxzJywgY29uZmlnLm91dGxpbmVTaG93Q29kZUNlbGxzKTtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignbm90ZWJvb2sub3V0bGluZS5zaG93Q29kZUNlbGxTeW1ib2xzJywgY29uZmlnLm91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzKTtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignbm90ZWJvb2suZ290b1N5bWJvbHMuc2hvd0FsbFN5bWJvbHMnLCBjb25maWcucXVpY2tQaWNrU2hvd0FsbFN5bWJvbHMpO1xuXHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdub3RlYm9vay5icmVhZGNydW1icy5zaG93Q29kZUNlbGxzJywgY29uZmlnLmJyZWFkY3J1bWJzU2hvd0NvZGVDZWxscyk7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cdC8vICNyZWdpb24gT3V0bGluZVBhbmVcblxuXHR0ZXN0KCdPdXRsaW5lUGFuZSAwOiBEZWZhdWx0IFNldHRpbmdzIChIZWFkZXJzIE9ubHkgT04sIENvZGUgY2VsbHMgT0ZGLCBTeW1ib2xzIE9OKScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBzZXRPdXRsaW5lVmlld0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0b3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5OiB0cnVlLFxuXHRcdFx0b3V0bGluZVNob3dDb2RlQ2VsbHM6IGZhbHNlLFxuXHRcdFx0b3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHM6IHRydWUsXG5cdFx0XHRxdWlja1BpY2tTaG93QWxsU3ltYm9sczogZmFsc2UsXG5cdFx0XHRicmVhZGNydW1ic1Nob3dDb2RlQ2VsbHM6IGZhbHNlXG5cdFx0fSk7XG5cblx0XHQvLyBDcmVhdGUgbW9kZWxzICsgc3ltYm9sc1xuXHRcdGNvbnN0IGNlbGxzID0gW1xuXHRcdFx0Y3JlYXRlTWFya3VwQ2VsbFZpZXdNb2RlbCgxLCAnIyBoMScsICckMCcsIDApLFxuXHRcdFx0Y3JlYXRlTWFya3VwQ2VsbFZpZXdNb2RlbCgxLCAncGxhaW50ZXh0JywgJyQxJywgMCksXG5cdFx0XHRjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgxLCAnIyBjb2RlIGNlbGwgMicsICckMicpLFxuXHRcdFx0Y3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoMSwgJyMgY29kZSBjZWxsIDMnLCAnJDMnKVxuXHRcdF07XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbXSwgJyQwJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbXSwgJyQxJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbeyBuYW1lOiAndmFyMicsIHJhbmdlOiB7fSB9XSwgJyQyJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbeyBuYW1lOiAndmFyMycsIHJhbmdlOiB7fSB9XSwgJyQzJyk7XG5cblx0XHQvLyBDYWNoZSBzeW1ib2xzXG5cdFx0Y29uc3QgZW50cnlGYWN0b3J5ID0gbmV3IE5vdGVib29rT3V0bGluZUVudHJ5RmFjdG9yeShleGVjdXRpb25TZXJ2aWNlLCBvdXRsaW5lTW9kZWxTZXJ2aWNlLCB0ZXh0TW9kZWxTZXJ2aWNlKTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcblx0XHRcdGF3YWl0IGVudHJ5RmFjdG9yeS5jYWNoZVN5bWJvbHMoY2VsbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fVxuXG5cdFx0Ly8gR2VuZXJhdGUgcmF3IG91dGxpbmVcblx0XHRjb25zdCBvdXRsaW5lTW9kZWwgPSBuZXcgT3V0bGluZUVudHJ5KC0xLCAtMSwgY3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoKSwgJ2Zha2VSb290JywgZmFsc2UsIGZhbHNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XG5cdFx0XHRlbnRyeUZhY3RvcnkuZ2V0T3V0bGluZUVudHJpZXMoY2VsbCwgMCkuZm9yRWFjaChlbnRyeSA9PiBvdXRsaW5lTW9kZWwuYWRkQ2hpbGQoZW50cnkpKTtcblx0XHR9XG5cblx0XHQvLyBHZW5lcmF0ZSBmaWx0ZXJlZCBvdXRsaW5lICh2aWV3IG1vZGVsKVxuXHRcdGNvbnN0IG91dGxpbmVQYW5lUHJvdmlkZXIgPSBzdG9yZS5hZGQobmV3IE5vdGVib29rT3V0bGluZVBhbmVQcm92aWRlcih1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGZsYXR0ZW4ob3V0bGluZU1vZGVsLCBvdXRsaW5lUGFuZVByb3ZpZGVyKTtcblxuXHRcdC8vIFZhbGlkYXRlXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1swXS5sYWJlbCwgJ2gxJyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMF0ubGV2ZWwsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdPdXRsaW5lUGFuZSAxOiBBTEwgTWFya2Rvd24nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgc2V0T3V0bGluZVZpZXdDb25maWd1cmF0aW9uKHtcblx0XHRcdG91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seTogZmFsc2UsXG5cdFx0XHRvdXRsaW5lU2hvd0NvZGVDZWxsczogZmFsc2UsXG5cdFx0XHRvdXRsaW5lU2hvd0NvZGVDZWxsU3ltYm9sczogZmFsc2UsXG5cdFx0XHRxdWlja1BpY2tTaG93QWxsU3ltYm9sczogZmFsc2UsXG5cdFx0XHRicmVhZGNydW1ic1Nob3dDb2RlQ2VsbHM6IGZhbHNlXG5cdFx0fSk7XG5cblx0XHQvLyBDcmVhdGUgbW9kZWxzICsgc3ltYm9sc1xuXHRcdGNvbnN0IGNlbGxzID0gW1xuXHRcdFx0Y3JlYXRlTWFya3VwQ2VsbFZpZXdNb2RlbCgxLCAnIyBoMScsICckMCcsIDApLFxuXHRcdFx0Y3JlYXRlTWFya3VwQ2VsbFZpZXdNb2RlbCgxLCAncGxhaW50ZXh0JywgJyQxJywgMCksXG5cdFx0XHRjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgxLCAnIyBjb2RlIGNlbGwgMicsICckMicpLFxuXHRcdFx0Y3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoMSwgJyMgY29kZSBjZWxsIDMnLCAnJDMnKVxuXHRcdF07XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbXSwgJyQwJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbXSwgJyQxJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbeyBuYW1lOiAndmFyMicsIHJhbmdlOiB7fSB9XSwgJyQyJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbeyBuYW1lOiAndmFyMycsIHJhbmdlOiB7fSB9XSwgJyQzJyk7XG5cblx0XHQvLyBDYWNoZSBzeW1ib2xzXG5cdFx0Y29uc3QgZW50cnlGYWN0b3J5ID0gbmV3IE5vdGVib29rT3V0bGluZUVudHJ5RmFjdG9yeShleGVjdXRpb25TZXJ2aWNlLCBvdXRsaW5lTW9kZWxTZXJ2aWNlLCB0ZXh0TW9kZWxTZXJ2aWNlKTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcblx0XHRcdGF3YWl0IGVudHJ5RmFjdG9yeS5jYWNoZVN5bWJvbHMoY2VsbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fVxuXG5cdFx0Ly8gR2VuZXJhdGUgcmF3IG91dGxpbmVcblx0XHRjb25zdCBvdXRsaW5lTW9kZWwgPSBuZXcgT3V0bGluZUVudHJ5KC0xLCAtMSwgY3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoKSwgJ2Zha2VSb290JywgZmFsc2UsIGZhbHNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XG5cdFx0XHRlbnRyeUZhY3RvcnkuZ2V0T3V0bGluZUVudHJpZXMoY2VsbCwgMCkuZm9yRWFjaChlbnRyeSA9PiBvdXRsaW5lTW9kZWwuYWRkQ2hpbGQoZW50cnkpKTtcblx0XHR9XG5cblx0XHQvLyBHZW5lcmF0ZSBmaWx0ZXJlZCBvdXRsaW5lICh2aWV3IG1vZGVsKVxuXHRcdGNvbnN0IG91dGxpbmVQYW5lUHJvdmlkZXIgPSBzdG9yZS5hZGQobmV3IE5vdGVib29rT3V0bGluZVBhbmVQcm92aWRlcih1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGZsYXR0ZW4ob3V0bGluZU1vZGVsLCBvdXRsaW5lUGFuZVByb3ZpZGVyKTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzLmxlbmd0aCwgMik7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1swXS5sYWJlbCwgJ2gxJyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMF0ubGV2ZWwsIDEpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMV0ubGFiZWwsICdwbGFpbnRleHQnKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1sxXS5sZXZlbCwgNyk7XG5cdH0pO1xuXG5cdHRlc3QoJ091dGxpbmVQYW5lIDI6IE9ubHkgSGVhZGVycycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBzZXRPdXRsaW5lVmlld0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0b3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5OiB0cnVlLFxuXHRcdFx0b3V0bGluZVNob3dDb2RlQ2VsbHM6IGZhbHNlLFxuXHRcdFx0b3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHM6IGZhbHNlLFxuXHRcdFx0cXVpY2tQaWNrU2hvd0FsbFN5bWJvbHM6IGZhbHNlLFxuXHRcdFx0YnJlYWRjcnVtYnNTaG93Q29kZUNlbGxzOiBmYWxzZVxuXHRcdH0pO1xuXG5cdFx0Ly8gQ3JlYXRlIG1vZGVscyArIHN5bWJvbHNcblx0XHRjb25zdCBjZWxscyA9IFtcblx0XHRcdGNyZWF0ZU1hcmt1cENlbGxWaWV3TW9kZWwoMSwgJyMgaDEnLCAnJDAnLCAwKSxcblx0XHRcdGNyZWF0ZU1hcmt1cENlbGxWaWV3TW9kZWwoMSwgJ3BsYWludGV4dCcsICckMScsIDApLFxuXHRcdFx0Y3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoMSwgJyMgY29kZSBjZWxsIDInLCAnJDInKSxcblx0XHRcdGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKDEsICcjIGNvZGUgY2VsbCAzJywgJyQzJylcblx0XHRdO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW10sICckMCcpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW10sICckMScpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW3sgbmFtZTogJ3ZhcjInLCByYW5nZToge30gfV0sICckMicpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW3sgbmFtZTogJ3ZhcjMnLCByYW5nZToge30gfV0sICckMycpO1xuXG5cdFx0Ly8gQ2FjaGUgc3ltYm9sc1xuXHRcdGNvbnN0IGVudHJ5RmFjdG9yeSA9IG5ldyBOb3RlYm9va091dGxpbmVFbnRyeUZhY3RvcnkoZXhlY3V0aW9uU2VydmljZSwgb3V0bGluZU1vZGVsU2VydmljZSwgdGV4dE1vZGVsU2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XG5cdFx0XHRhd2FpdCBlbnRyeUZhY3RvcnkuY2FjaGVTeW1ib2xzKGNlbGwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlIHJhdyBvdXRsaW5lXG5cdFx0Y29uc3Qgb3V0bGluZU1vZGVsID0gbmV3IE91dGxpbmVFbnRyeSgtMSwgLTEsIGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKCksICdmYWtlUm9vdCcsIGZhbHNlLCBmYWxzZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xuXHRcdFx0ZW50cnlGYWN0b3J5LmdldE91dGxpbmVFbnRyaWVzKGNlbGwsIDApLmZvckVhY2goZW50cnkgPT4gb3V0bGluZU1vZGVsLmFkZENoaWxkKGVudHJ5KSk7XG5cdFx0fVxuXG5cdFx0Ly8gR2VuZXJhdGUgZmlsdGVyZWQgb3V0bGluZSAodmlldyBtb2RlbClcblx0XHRjb25zdCBvdXRsaW5lUGFuZVByb3ZpZGVyID0gc3RvcmUuYWRkKG5ldyBOb3RlYm9va091dGxpbmVQYW5lUHJvdmlkZXIodW5kZWZpbmVkLCBjb25maWd1cmF0aW9uU2VydmljZSkpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBmbGF0dGVuKG91dGxpbmVNb2RlbCwgb3V0bGluZVBhbmVQcm92aWRlcik7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0cy5sZW5ndGgsIDEpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMF0ubGFiZWwsICdoMScpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzBdLmxldmVsLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnT3V0bGluZVBhbmUgMzogT25seSBIZWFkZXJzICsgQ29kZSBDZWxscycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBzZXRPdXRsaW5lVmlld0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0b3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5OiB0cnVlLFxuXHRcdFx0b3V0bGluZVNob3dDb2RlQ2VsbHM6IHRydWUsXG5cdFx0XHRvdXRsaW5lU2hvd0NvZGVDZWxsU3ltYm9sczogZmFsc2UsXG5cdFx0XHRxdWlja1BpY2tTaG93QWxsU3ltYm9sczogZmFsc2UsXG5cdFx0XHRicmVhZGNydW1ic1Nob3dDb2RlQ2VsbHM6IGZhbHNlXG5cdFx0fSk7XG5cblx0XHQvLyBDcmVhdGUgbW9kZWxzICsgc3ltYm9sc1xuXHRcdGNvbnN0IGNlbGxzID0gW1xuXHRcdFx0Y3JlYXRlTWFya3VwQ2VsbFZpZXdNb2RlbCgxLCAnIyBoMScsICckMCcsIDApLFxuXHRcdFx0Y3JlYXRlTWFya3VwQ2VsbFZpZXdNb2RlbCgxLCAncGxhaW50ZXh0JywgJyQxJywgMCksXG5cdFx0XHRjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgxLCAnIyBjb2RlIGNlbGwgMicsICckMicpLFxuXHRcdFx0Y3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoMSwgJyMgY29kZSBjZWxsIDMnLCAnJDMnKVxuXHRcdF07XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbXSwgJyQwJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbXSwgJyQxJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbeyBuYW1lOiAndmFyMicsIHJhbmdlOiB7fSB9XSwgJyQyJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbeyBuYW1lOiAndmFyMycsIHJhbmdlOiB7fSB9XSwgJyQzJyk7XG5cblx0XHQvLyBDYWNoZSBzeW1ib2xzXG5cdFx0Y29uc3QgZW50cnlGYWN0b3J5ID0gbmV3IE5vdGVib29rT3V0bGluZUVudHJ5RmFjdG9yeShleGVjdXRpb25TZXJ2aWNlLCBvdXRsaW5lTW9kZWxTZXJ2aWNlLCB0ZXh0TW9kZWxTZXJ2aWNlKTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcblx0XHRcdGF3YWl0IGVudHJ5RmFjdG9yeS5jYWNoZVN5bWJvbHMoY2VsbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fVxuXG5cdFx0Ly8gR2VuZXJhdGUgcmF3IG91dGxpbmVcblx0XHRjb25zdCBvdXRsaW5lTW9kZWwgPSBuZXcgT3V0bGluZUVudHJ5KC0xLCAtMSwgY3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoKSwgJ2Zha2VSb290JywgZmFsc2UsIGZhbHNlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XG5cdFx0XHRlbnRyeUZhY3RvcnkuZ2V0T3V0bGluZUVudHJpZXMoY2VsbCwgMCkuZm9yRWFjaChlbnRyeSA9PiBvdXRsaW5lTW9kZWwuYWRkQ2hpbGQoZW50cnkpKTtcblx0XHR9XG5cblx0XHQvLyBHZW5lcmF0ZSBmaWx0ZXJlZCBvdXRsaW5lICh2aWV3IG1vZGVsKVxuXHRcdGNvbnN0IG91dGxpbmVQYW5lUHJvdmlkZXIgPSBzdG9yZS5hZGQobmV3IE5vdGVib29rT3V0bGluZVBhbmVQcm92aWRlcih1bmRlZmluZWQsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGZsYXR0ZW4ob3V0bGluZU1vZGVsLCBvdXRsaW5lUGFuZVByb3ZpZGVyKTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzLmxlbmd0aCwgMyk7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1swXS5sYWJlbCwgJ2gxJyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMF0ubGV2ZWwsIDEpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMV0ubGFiZWwsICcjIGNvZGUgY2VsbCAyJyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMV0ubGV2ZWwsIDcpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMl0ubGFiZWwsICcjIGNvZGUgY2VsbCAzJyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMl0ubGV2ZWwsIDcpO1xuXHR9KTtcblxuXHR0ZXN0KCdPdXRsaW5lUGFuZSA0OiBPbmx5IEhlYWRlcnMgKyBDb2RlIENlbGxzICsgU3ltYm9scycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBzZXRPdXRsaW5lVmlld0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0b3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5OiB0cnVlLFxuXHRcdFx0b3V0bGluZVNob3dDb2RlQ2VsbHM6IHRydWUsXG5cdFx0XHRvdXRsaW5lU2hvd0NvZGVDZWxsU3ltYm9sczogdHJ1ZSxcblx0XHRcdHF1aWNrUGlja1Nob3dBbGxTeW1ib2xzOiBmYWxzZSxcblx0XHRcdGJyZWFkY3J1bWJzU2hvd0NvZGVDZWxsczogZmFsc2Vcblx0XHR9KTtcblxuXHRcdC8vIENyZWF0ZSBtb2RlbHMgKyBzeW1ib2xzXG5cdFx0Y29uc3QgY2VsbHMgPSBbXG5cdFx0XHRjcmVhdGVNYXJrdXBDZWxsVmlld01vZGVsKDEsICcjIGgxJywgJyQwJywgMCksXG5cdFx0XHRjcmVhdGVNYXJrdXBDZWxsVmlld01vZGVsKDEsICdwbGFpbnRleHQnLCAnJDEnLCAwKSxcblx0XHRcdGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKDEsICcjIGNvZGUgY2VsbCAyJywgJyQyJyksXG5cdFx0XHRjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgxLCAnIyBjb2RlIGNlbGwgMycsICckMycpXG5cdFx0XTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFtdLCAnJDAnKTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFtdLCAnJDEnKTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFt7IG5hbWU6ICd2YXIyJywgcmFuZ2U6IHt9IH1dLCAnJDInKTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFt7IG5hbWU6ICd2YXIzJywgcmFuZ2U6IHt9IH1dLCAnJDMnKTtcblxuXHRcdC8vIENhY2hlIHN5bWJvbHNcblx0XHRjb25zdCBlbnRyeUZhY3RvcnkgPSBuZXcgTm90ZWJvb2tPdXRsaW5lRW50cnlGYWN0b3J5KGV4ZWN1dGlvblNlcnZpY2UsIG91dGxpbmVNb2RlbFNlcnZpY2UsIHRleHRNb2RlbFNlcnZpY2UpO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xuXHRcdFx0YXdhaXQgZW50cnlGYWN0b3J5LmNhY2hlU3ltYm9scyhjZWxsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9XG5cblx0XHQvLyBHZW5lcmF0ZSByYXcgb3V0bGluZVxuXHRcdGNvbnN0IG91dGxpbmVNb2RlbCA9IG5ldyBPdXRsaW5lRW50cnkoLTEsIC0xLCBjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgpLCAnZmFrZVJvb3QnLCBmYWxzZSwgZmFsc2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcblx0XHRcdGVudHJ5RmFjdG9yeS5nZXRPdXRsaW5lRW50cmllcyhjZWxsLCAwKS5mb3JFYWNoKGVudHJ5ID0+IG91dGxpbmVNb2RlbC5hZGRDaGlsZChlbnRyeSkpO1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlIGZpbHRlcmVkIG91dGxpbmUgKHZpZXcgbW9kZWwpXG5cdFx0Y29uc3Qgb3V0bGluZVBhbmVQcm92aWRlciA9IHN0b3JlLmFkZChuZXcgTm90ZWJvb2tPdXRsaW5lUGFuZVByb3ZpZGVyKHVuZGVmaW5lZCwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRjb25zdCByZXN1bHRzID0gZmxhdHRlbihvdXRsaW5lTW9kZWwsIG91dGxpbmVQYW5lUHJvdmlkZXIpO1xuXG5cdFx0Ly8gdmFsaWRhdGVcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0cy5sZW5ndGgsIDUpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMF0ubGFiZWwsICdoMScpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzBdLmxldmVsLCAxKTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzFdLmxhYmVsLCAnIyBjb2RlIGNlbGwgMicpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzFdLmxldmVsLCA3KTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzJdLmxhYmVsLCAndmFyMicpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzJdLmxldmVsLCA4KTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzNdLmxhYmVsLCAnIyBjb2RlIGNlbGwgMycpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzNdLmxldmVsLCA3KTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzRdLmxhYmVsLCAndmFyMycpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzRdLmxldmVsLCA4KTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXHQvLyAjcmVnaW9uIFF1aWNrUGlja1xuXG5cdHRlc3QoJ1F1aWNrUGljayAwOiBTeW1ib2xzIE9uICsgMiBjZWxscyBXSVRIIHN5bWJvbHMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgc2V0T3V0bGluZVZpZXdDb25maWd1cmF0aW9uKHtcblx0XHRcdG91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seTogZmFsc2UsXG5cdFx0XHRvdXRsaW5lU2hvd0NvZGVDZWxsczogZmFsc2UsXG5cdFx0XHRvdXRsaW5lU2hvd0NvZGVDZWxsU3ltYm9sczogZmFsc2UsXG5cdFx0XHRxdWlja1BpY2tTaG93QWxsU3ltYm9sczogdHJ1ZSxcblx0XHRcdGJyZWFkY3J1bWJzU2hvd0NvZGVDZWxsczogZmFsc2Vcblx0XHR9KTtcblxuXHRcdC8vIENyZWF0ZSBtb2RlbHMgKyBzeW1ib2xzXG5cdFx0Y29uc3QgY2VsbHMgPSBbXG5cdFx0XHRjcmVhdGVNYXJrdXBDZWxsVmlld01vZGVsKDEsICcjIGgxJywgJyQwJywgMCksXG5cdFx0XHRjcmVhdGVNYXJrdXBDZWxsVmlld01vZGVsKDEsICdwbGFpbnRleHQnLCAnJDEnLCAwKSxcblx0XHRcdGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKDEsICcjIGNvZGUgY2VsbCAyJywgJyQyJyksXG5cdFx0XHRjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgxLCAnIyBjb2RlIGNlbGwgMycsICckMycpXG5cdFx0XTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFtdLCAnJDAnKTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFtdLCAnJDEnKTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFt7IG5hbWU6ICd2YXIyJywgcmFuZ2U6IHt9LCBraW5kOiAxMiB9XSwgJyQyJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbeyBuYW1lOiAndmFyMycsIHJhbmdlOiB7fSwga2luZDogMTIgfV0sICckMycpO1xuXG5cdFx0Ly8gQ2FjaGUgc3ltYm9sc1xuXHRcdGNvbnN0IGVudHJ5RmFjdG9yeSA9IG5ldyBOb3RlYm9va091dGxpbmVFbnRyeUZhY3RvcnkoZXhlY3V0aW9uU2VydmljZSwgb3V0bGluZU1vZGVsU2VydmljZSwgdGV4dE1vZGVsU2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XG5cdFx0XHRhd2FpdCBlbnRyeUZhY3RvcnkuY2FjaGVTeW1ib2xzKGNlbGwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlIHJhdyBvdXRsaW5lXG5cdFx0Y29uc3Qgb3V0bGluZU1vZGVsID0gbmV3IE91dGxpbmVFbnRyeSgtMSwgLTEsIGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKCksICdmYWtlUm9vdCcsIGZhbHNlLCBmYWxzZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xuXHRcdFx0ZW50cnlGYWN0b3J5LmdldE91dGxpbmVFbnRyaWVzKGNlbGwsIDApLmZvckVhY2goZW50cnkgPT4gb3V0bGluZU1vZGVsLmFkZENoaWxkKGVudHJ5KSk7XG5cdFx0fVxuXG5cdFx0Ly8gR2VuZXJhdGUgZmlsdGVyZWQgb3V0bGluZSAodmlldyBtb2RlbClcblx0XHRjb25zdCBxdWlja1BpY2tQcm92aWRlciA9IHN0b3JlLmFkZChuZXcgTm90ZWJvb2tRdWlja1BpY2tQcm92aWRlcihjcmVhdGVNb2NrT3V0bGluZURhdGFTb3VyY2UoWy4uLm91dGxpbmVNb2RlbC5jaGlsZHJlbl0pLCBjb25maWd1cmF0aW9uU2VydmljZSwgdGhlbWVTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHF1aWNrUGlja1Byb3ZpZGVyLmdldFF1aWNrUGlja0VsZW1lbnRzKCk7XG5cblx0XHQvLyBWYWxpZGF0ZVxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzLmxlbmd0aCwgNCk7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1swXS5sYWJlbCwgJyQobWFya2Rvd24pIGgxJyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMF0uZWxlbWVudC5sZXZlbCwgMSk7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1sxXS5sYWJlbCwgJyQobWFya2Rvd24pIHBsYWludGV4dCcpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzFdLmVsZW1lbnQubGV2ZWwsIDcpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMl0ubGFiZWwsICckKHN5bWJvbC12YXJpYWJsZSkgdmFyMicpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzJdLmVsZW1lbnQubGV2ZWwsIDgpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbM10ubGFiZWwsICckKHN5bWJvbC12YXJpYWJsZSkgdmFyMycpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzNdLmVsZW1lbnQubGV2ZWwsIDgpO1xuXHR9KTtcblxuXHR0ZXN0KCdRdWlja1BpY2sgMTogU3ltYm9scyBPbiArIDEgY2VsbCBXSVRIIHN5bWJvbCArIDEgY2VsbCBXSVRIT1VUIHN5bWJvbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBzZXRPdXRsaW5lVmlld0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0b3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5OiBmYWxzZSxcblx0XHRcdG91dGxpbmVTaG93Q29kZUNlbGxzOiBmYWxzZSxcblx0XHRcdG91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzOiBmYWxzZSxcblx0XHRcdHF1aWNrUGlja1Nob3dBbGxTeW1ib2xzOiB0cnVlLFxuXHRcdFx0YnJlYWRjcnVtYnNTaG93Q29kZUNlbGxzOiBmYWxzZVxuXHRcdH0pO1xuXG5cdFx0Ly8gQ3JlYXRlIG1vZGVscyArIHN5bWJvbHNcblx0XHRjb25zdCBjZWxscyA9IFtcblx0XHRcdGNyZWF0ZU1hcmt1cENlbGxWaWV3TW9kZWwoMSwgJyMgaDEnLCAnJDAnLCAwKSxcblx0XHRcdGNyZWF0ZU1hcmt1cENlbGxWaWV3TW9kZWwoMSwgJ3BsYWludGV4dCcsICckMScsIDApLFxuXHRcdFx0Y3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoMSwgJyMgY29kZSBjZWxsIDInLCAnJDInKSxcblx0XHRcdGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKDEsICcjIGNvZGUgY2VsbCAzJywgJyQzJylcblx0XHRdO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW10sICckMCcpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW10sICckMScpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW10sICckMicpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW3sgbmFtZTogJ3ZhcjMnLCByYW5nZToge30sIGtpbmQ6IDEyIH1dLCAnJDMnKTtcblxuXHRcdC8vIENhY2hlIHN5bWJvbHNcblx0XHRjb25zdCBlbnRyeUZhY3RvcnkgPSBuZXcgTm90ZWJvb2tPdXRsaW5lRW50cnlGYWN0b3J5KGV4ZWN1dGlvblNlcnZpY2UsIG91dGxpbmVNb2RlbFNlcnZpY2UsIHRleHRNb2RlbFNlcnZpY2UpO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xuXHRcdFx0YXdhaXQgZW50cnlGYWN0b3J5LmNhY2hlU3ltYm9scyhjZWxsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9XG5cblx0XHQvLyBHZW5lcmF0ZSByYXcgb3V0bGluZVxuXHRcdGNvbnN0IG91dGxpbmVNb2RlbCA9IG5ldyBPdXRsaW5lRW50cnkoLTEsIC0xLCBjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgpLCAnZmFrZVJvb3QnLCBmYWxzZSwgZmFsc2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcblx0XHRcdGVudHJ5RmFjdG9yeS5nZXRPdXRsaW5lRW50cmllcyhjZWxsLCAwKS5mb3JFYWNoKGVudHJ5ID0+IG91dGxpbmVNb2RlbC5hZGRDaGlsZChlbnRyeSkpO1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlIGZpbHRlcmVkIG91dGxpbmUgKHZpZXcgbW9kZWwpXG5cdFx0Y29uc3QgcXVpY2tQaWNrUHJvdmlkZXIgPSBzdG9yZS5hZGQobmV3IE5vdGVib29rUXVpY2tQaWNrUHJvdmlkZXIoY3JlYXRlTW9ja091dGxpbmVEYXRhU291cmNlKFsuLi5vdXRsaW5lTW9kZWwuY2hpbGRyZW5dKSwgY29uZmlndXJhdGlvblNlcnZpY2UsIHRoZW1lU2VydmljZSkpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBxdWlja1BpY2tQcm92aWRlci5nZXRRdWlja1BpY2tFbGVtZW50cygpO1xuXG5cdFx0Ly8gVmFsaWRhdGVcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0cy5sZW5ndGgsIDQpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMF0ubGFiZWwsICckKG1hcmtkb3duKSBoMScpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzBdLmVsZW1lbnQubGV2ZWwsIDEpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMV0ubGFiZWwsICckKG1hcmtkb3duKSBwbGFpbnRleHQnKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1sxXS5lbGVtZW50LmxldmVsLCA3KTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzJdLmxhYmVsLCAnJChjb2RlKSAjIGNvZGUgY2VsbCAyJyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMl0uZWxlbWVudC5sZXZlbCwgNyk7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1szXS5sYWJlbCwgJyQoc3ltYm9sLXZhcmlhYmxlKSB2YXIzJyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbM10uZWxlbWVudC5sZXZlbCwgOCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1F1aWNrUGljayAzOiBTeW1ib2xzIE9mZicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBzZXRPdXRsaW5lVmlld0NvbmZpZ3VyYXRpb24oe1xuXHRcdFx0b3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5OiBmYWxzZSxcblx0XHRcdG91dGxpbmVTaG93Q29kZUNlbGxzOiBmYWxzZSxcblx0XHRcdG91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzOiBmYWxzZSxcblx0XHRcdHF1aWNrUGlja1Nob3dBbGxTeW1ib2xzOiBmYWxzZSxcblx0XHRcdGJyZWFkY3J1bWJzU2hvd0NvZGVDZWxsczogZmFsc2Vcblx0XHR9KTtcblxuXHRcdC8vIENyZWF0ZSBtb2RlbHMgKyBzeW1ib2xzXG5cdFx0Y29uc3QgY2VsbHMgPSBbXG5cdFx0XHRjcmVhdGVNYXJrdXBDZWxsVmlld01vZGVsKDEsICcjIGgxJywgJyQwJywgMCksXG5cdFx0XHRjcmVhdGVNYXJrdXBDZWxsVmlld01vZGVsKDEsICdwbGFpbnRleHQnLCAnJDEnLCAwKSxcblx0XHRcdGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKDEsICcjIGNvZGUgY2VsbCAyJywgJyQyJyksXG5cdFx0XHRjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgxLCAnIyBjb2RlIGNlbGwgMycsICckMycpXG5cdFx0XTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFtdLCAnJDAnKTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFtdLCAnJDEnKTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFt7IG5hbWU6ICd2YXIyJywgcmFuZ2U6IHt9LCBraW5kOiAxMiB9XSwgJyQyJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbeyBuYW1lOiAndmFyMycsIHJhbmdlOiB7fSwga2luZDogMTIgfV0sICckMycpO1xuXG5cdFx0Ly8gQ2FjaGUgc3ltYm9sc1xuXHRcdGNvbnN0IGVudHJ5RmFjdG9yeSA9IG5ldyBOb3RlYm9va091dGxpbmVFbnRyeUZhY3RvcnkoZXhlY3V0aW9uU2VydmljZSwgb3V0bGluZU1vZGVsU2VydmljZSwgdGV4dE1vZGVsU2VydmljZSk7XG5cdFx0Zm9yIChjb25zdCBjZWxsIG9mIGNlbGxzKSB7XG5cdFx0XHRhd2FpdCBlbnRyeUZhY3RvcnkuY2FjaGVTeW1ib2xzKGNlbGwsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlIHJhdyBvdXRsaW5lXG5cdFx0Y29uc3Qgb3V0bGluZU1vZGVsID0gbmV3IE91dGxpbmVFbnRyeSgtMSwgLTEsIGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKCksICdmYWtlUm9vdCcsIGZhbHNlLCBmYWxzZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xuXHRcdFx0ZW50cnlGYWN0b3J5LmdldE91dGxpbmVFbnRyaWVzKGNlbGwsIDApLmZvckVhY2goZW50cnkgPT4gb3V0bGluZU1vZGVsLmFkZENoaWxkKGVudHJ5KSk7XG5cdFx0fVxuXG5cdFx0Ly8gR2VuZXJhdGUgZmlsdGVyZWQgb3V0bGluZSAodmlldyBtb2RlbClcblx0XHRjb25zdCBxdWlja1BpY2tQcm92aWRlciA9IHN0b3JlLmFkZChuZXcgTm90ZWJvb2tRdWlja1BpY2tQcm92aWRlcihjcmVhdGVNb2NrT3V0bGluZURhdGFTb3VyY2UoWy4uLm91dGxpbmVNb2RlbC5jaGlsZHJlbl0pLCBjb25maWd1cmF0aW9uU2VydmljZSwgdGhlbWVTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IHF1aWNrUGlja1Byb3ZpZGVyLmdldFF1aWNrUGlja0VsZW1lbnRzKCk7XG5cblx0XHQvLyBWYWxpZGF0ZVxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzLmxlbmd0aCwgNCk7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1swXS5sYWJlbCwgJyQobWFya2Rvd24pIGgxJyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMF0uZWxlbWVudC5sZXZlbCwgMSk7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1sxXS5sYWJlbCwgJyQobWFya2Rvd24pIHBsYWludGV4dCcpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzFdLmVsZW1lbnQubGV2ZWwsIDcpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMl0ubGFiZWwsICckKGNvZGUpICMgY29kZSBjZWxsIDInKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1syXS5lbGVtZW50LmxldmVsLCA3KTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzNdLmxhYmVsLCAnJChjb2RlKSAjIGNvZGUgY2VsbCAzJyk7XG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbM10uZWxlbWVudC5sZXZlbCwgNyk7XG5cdH0pO1xuXG5cdC8vICNlbmRyZWdpb25cblx0Ly8gI3JlZ2lvbiBCcmVhZGNydW1ic1xuXG5cdHRlc3QoJ0JyZWFkY3J1bWJzIDA6IENvZGUgQ2VsbHMgT24gJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHNldE91dGxpbmVWaWV3Q29uZmlndXJhdGlvbih7XG5cdFx0XHRvdXRsaW5lU2hvd01hcmtkb3duSGVhZGVyc09ubHk6IGZhbHNlLFxuXHRcdFx0b3V0bGluZVNob3dDb2RlQ2VsbHM6IGZhbHNlLFxuXHRcdFx0b3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHM6IGZhbHNlLFxuXHRcdFx0cXVpY2tQaWNrU2hvd0FsbFN5bWJvbHM6IGZhbHNlLFxuXHRcdFx0YnJlYWRjcnVtYnNTaG93Q29kZUNlbGxzOiB0cnVlXG5cdFx0fSk7XG5cblx0XHQvLyBDcmVhdGUgbW9kZWxzICsgc3ltYm9sc1xuXHRcdGNvbnN0IGNlbGxzID0gW1xuXHRcdFx0Y3JlYXRlTWFya3VwQ2VsbFZpZXdNb2RlbCgxLCAnIyBoMScsICckMCcsIDApLFxuXHRcdFx0Y3JlYXRlTWFya3VwQ2VsbFZpZXdNb2RlbCgxLCAncGxhaW50ZXh0JywgJyQxJywgMCksXG5cdFx0XHRjcmVhdGVDb2RlQ2VsbFZpZXdNb2RlbCgxLCAnIyBjb2RlIGNlbGwgMicsICckMicpLFxuXHRcdFx0Y3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoMSwgJyMgY29kZSBjZWxsIDMnLCAnJDMnKVxuXHRcdF07XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbXSwgJyQwJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbXSwgJyQxJyk7XG5cdFx0c2V0U3ltYm9sc0ZvclRleHRNb2RlbChbeyBuYW1lOiAndmFyMicsIHJhbmdlOiB7fSwga2luZDogMTIgfV0sICckMicpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW3sgbmFtZTogJ3ZhcjMnLCByYW5nZToge30sIGtpbmQ6IDEyIH1dLCAnJDMnKTtcblxuXHRcdC8vIENhY2hlIHN5bWJvbHNcblx0XHRjb25zdCBlbnRyeUZhY3RvcnkgPSBuZXcgTm90ZWJvb2tPdXRsaW5lRW50cnlGYWN0b3J5KGV4ZWN1dGlvblNlcnZpY2UsIG91dGxpbmVNb2RlbFNlcnZpY2UsIHRleHRNb2RlbFNlcnZpY2UpO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xuXHRcdFx0YXdhaXQgZW50cnlGYWN0b3J5LmNhY2hlU3ltYm9scyhjZWxsLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHR9XG5cblx0XHQvLyBHZW5lcmF0ZSByYXcgb3V0bGluZVxuXHRcdGNvbnN0IG91dGxpbmVNb2RlbCA9IG5ldyBPdXRsaW5lRW50cnkoLTEsIC0xLCBjcmVhdGVNYXJrdXBDZWxsVmlld01vZGVsKCksICdmYWtlUm9vdCcsIGZhbHNlLCBmYWxzZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdGZvciAoY29uc3QgY2VsbCBvZiBjZWxscykge1xuXHRcdFx0ZW50cnlGYWN0b3J5LmdldE91dGxpbmVFbnRyaWVzKGNlbGwsIDApLmZvckVhY2goZW50cnkgPT4gb3V0bGluZU1vZGVsLmFkZENoaWxkKGVudHJ5KSk7XG5cdFx0fVxuXHRcdGNvbnN0IG91dGxpbmVUcmVlID0gYnVpbGRPdXRsaW5lVHJlZShbLi4ub3V0bGluZU1vZGVsLmNoaWxkcmVuXSk7XG5cblx0XHQvLyBHZW5lcmF0ZSBmaWx0ZXJlZCBvdXRsaW5lICh2aWV3IG1vZGVsKVxuXHRcdGNvbnN0IGJyZWFkY3J1bWJzUHJvdmlkZXIgPSBzdG9yZS5hZGQobmV3IE5vdGVib29rQnJlYWRjcnVtYnNQcm92aWRlcihjcmVhdGVNb2NrT3V0bGluZURhdGFTb3VyY2UoW10sIFsuLi5vdXRsaW5lVHJlZSFbMF0uY2hpbGRyZW5dWzFdKSwgY29uZmlndXJhdGlvblNlcnZpY2UpKTtcblx0XHRjb25zdCByZXN1bHRzID0gYnJlYWRjcnVtYnNQcm92aWRlci5nZXRCcmVhZGNydW1iRWxlbWVudHMoKTtcblxuXHRcdC8vIFZhbGlkYXRlXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHMubGVuZ3RoLCAzKTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzBdLmVsZW1lbnQubGFiZWwsICdmYWtlUm9vdCcpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzBdLmVsZW1lbnQubGV2ZWwsIC0xKTtcblxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzFdLmVsZW1lbnQubGFiZWwsICdoMScpO1xuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzWzFdLmVsZW1lbnQubGV2ZWwsIDEpO1xuXG5cdFx0YXNzZXJ0LmVxdWFsKHJlc3VsdHNbMl0uZWxlbWVudC5sYWJlbCwgJyMgY29kZSBjZWxsIDInKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1syXS5lbGVtZW50LmxldmVsLCA3KTtcblx0fSk7XG5cblx0dGVzdCgnQnJlYWRjcnVtYnMgMTogQ29kZSBDZWxscyBPZmYgJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHNldE91dGxpbmVWaWV3Q29uZmlndXJhdGlvbih7XG5cdFx0XHRvdXRsaW5lU2hvd01hcmtkb3duSGVhZGVyc09ubHk6IGZhbHNlLFxuXHRcdFx0b3V0bGluZVNob3dDb2RlQ2VsbHM6IGZhbHNlLFxuXHRcdFx0b3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHM6IGZhbHNlLFxuXHRcdFx0cXVpY2tQaWNrU2hvd0FsbFN5bWJvbHM6IGZhbHNlLFxuXHRcdFx0YnJlYWRjcnVtYnNTaG93Q29kZUNlbGxzOiBmYWxzZVxuXHRcdH0pO1xuXG5cdFx0Ly8gQ3JlYXRlIG1vZGVscyArIHN5bWJvbHNcblx0XHRjb25zdCBjZWxscyA9IFtcblx0XHRcdGNyZWF0ZU1hcmt1cENlbGxWaWV3TW9kZWwoMSwgJyMgaDEnLCAnJDAnLCAwKSxcblx0XHRcdGNyZWF0ZU1hcmt1cENlbGxWaWV3TW9kZWwoMSwgJ3BsYWludGV4dCcsICckMScsIDApLFxuXHRcdFx0Y3JlYXRlQ29kZUNlbGxWaWV3TW9kZWwoMSwgJyMgY29kZSBjZWxsIDInLCAnJDInKSxcblx0XHRcdGNyZWF0ZUNvZGVDZWxsVmlld01vZGVsKDEsICcjIGNvZGUgY2VsbCAzJywgJyQzJylcblx0XHRdO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW10sICckMCcpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW10sICckMScpO1xuXHRcdHNldFN5bWJvbHNGb3JUZXh0TW9kZWwoW3sgbmFtZTogJ3ZhcjInLCByYW5nZToge30sIGtpbmQ6IDEyIH1dLCAnJDInKTtcblx0XHRzZXRTeW1ib2xzRm9yVGV4dE1vZGVsKFt7IG5hbWU6ICd2YXIzJywgcmFuZ2U6IHt9LCBraW5kOiAxMiB9XSwgJyQzJyk7XG5cblx0XHQvLyBDYWNoZSBzeW1ib2xzXG5cdFx0Y29uc3QgZW50cnlGYWN0b3J5ID0gbmV3IE5vdGVib29rT3V0bGluZUVudHJ5RmFjdG9yeShleGVjdXRpb25TZXJ2aWNlLCBvdXRsaW5lTW9kZWxTZXJ2aWNlLCB0ZXh0TW9kZWxTZXJ2aWNlKTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcblx0XHRcdGF3YWl0IGVudHJ5RmFjdG9yeS5jYWNoZVN5bWJvbHMoY2VsbCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fVxuXG5cdFx0Ly8gR2VuZXJhdGUgcmF3IG91dGxpbmVcblx0XHRjb25zdCBvdXRsaW5lTW9kZWwgPSBuZXcgT3V0bGluZUVudHJ5KC0xLCAtMSwgY3JlYXRlTWFya3VwQ2VsbFZpZXdNb2RlbCgpLCAnZmFrZVJvb3QnLCBmYWxzZSwgZmFsc2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRmb3IgKGNvbnN0IGNlbGwgb2YgY2VsbHMpIHtcblx0XHRcdGVudHJ5RmFjdG9yeS5nZXRPdXRsaW5lRW50cmllcyhjZWxsLCAwKS5mb3JFYWNoKGVudHJ5ID0+IG91dGxpbmVNb2RlbC5hZGRDaGlsZChlbnRyeSkpO1xuXHRcdH1cblx0XHRjb25zdCBvdXRsaW5lVHJlZSA9IGJ1aWxkT3V0bGluZVRyZWUoWy4uLm91dGxpbmVNb2RlbC5jaGlsZHJlbl0pO1xuXG5cdFx0Ly8gR2VuZXJhdGUgZmlsdGVyZWQgb3V0bGluZSAodmlldyBtb2RlbClcblx0XHRjb25zdCBicmVhZGNydW1ic1Byb3ZpZGVyID0gc3RvcmUuYWRkKG5ldyBOb3RlYm9va0JyZWFkY3J1bWJzUHJvdmlkZXIoY3JlYXRlTW9ja091dGxpbmVEYXRhU291cmNlKFtdLCBbLi4ub3V0bGluZVRyZWUhWzBdLmNoaWxkcmVuXVsxXSksIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKSk7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGJyZWFkY3J1bWJzUHJvdmlkZXIuZ2V0QnJlYWRjcnVtYkVsZW1lbnRzKCk7XG5cblx0XHQvLyBWYWxpZGF0ZVxuXHRcdGFzc2VydC5lcXVhbChyZXN1bHRzLmxlbmd0aCwgMik7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1swXS5lbGVtZW50LmxhYmVsLCAnZmFrZVJvb3QnKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1swXS5lbGVtZW50LmxldmVsLCAtMSk7XG5cblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1sxXS5lbGVtZW50LmxhYmVsLCAnaDEnKTtcblx0XHRhc3NlcnQuZXF1YWwocmVzdWx0c1sxXS5lbGVtZW50LmxldmVsLCAxKTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFFbkIsU0FBUyx5QkFBeUI7QUFFbEMsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBR3hELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNkJBQWtELDZCQUE2QixpQ0FBaUM7QUFHekgsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxvQkFBb0I7QUFNN0IsTUFBTSxtQ0FBbUMsV0FBWTtBQUlwRCxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELFFBQU0sdUJBQXVCLElBQUkseUJBQXlCO0FBQzFELFFBQU0sZUFBZSxJQUFJLGlCQUFpQjtBQUUxQyxRQUFNLHNCQUE0RCxDQUFDO0FBQ25FLFdBQVMsdUJBQXVCLFNBQStCLGNBQWMsVUFBVTtBQUN0Rix3QkFBb0IsV0FBVyxJQUFJO0FBQUEsRUFDcEM7QUFFQSxRQUFNLG1CQUFtQixJQUFJLGNBQWMsS0FBcUMsRUFBRTtBQUFBLElBQ3hFLG1CQUFtQjtBQUFF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
