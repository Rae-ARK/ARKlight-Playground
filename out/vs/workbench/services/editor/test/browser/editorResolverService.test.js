import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { DiffEditorInput } from "../../../../common/editor/diffEditorInput.js";
import { EditorResolverService } from "../../browser/editorResolverService.js";
import { IEditorGroupsService } from "../../common/editorGroupsService.js";
import { diffEditorsAssociationsAgentsWindowDefault, IEditorResolverService, ResolvedStatus, RegisteredEditorPriority, diffEditorsAssociationsSettingId, editorsAssociationsSettingId } from "../../common/editorResolverService.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { createEditorPart, TestFileEditorInput, TestServiceAccessor, workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
suite("EditorResolverService", () => {
  test("Agents window diff editor default follows the Markdown editor setting", () => {
    assert.deepStrictEqual({
      enabled: diffEditorsAssociationsAgentsWindowDefault({ markdownDefaultEditor: true }),
      disabled: diffEditorsAssociationsAgentsWindowDefault({ markdownDefaultEditor: false })
    }, {
      enabled: { "*.md": "vscode.markdown.editor" },
      disabled: { "*.md": "vscode.markdown.preview.editor" }
    });
  });
  const TEST_EDITOR_INPUT_ID = "testEditorInputForEditorResolverService";
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  async function createEditorResolverService(instantiationService = workbenchInstantiationService(void 0, disposables)) {
    const part = await createEditorPart(instantiationService, disposables);
    instantiationService.stub(IEditorGroupsService, part);
    const editorResolverService = instantiationService.createInstance(EditorResolverService);
    instantiationService.stub(IEditorResolverService, editorResolverService);
    disposables.add(editorResolverService);
    return [part, editorResolverService, instantiationService.createInstance(TestServiceAccessor)];
  }
  function constructDisposableFileEditorInput(uri, typeId, store) {
    const editor = new TestFileEditorInput(uri, typeId);
    store.add(editor);
    return editor;
  }
  function constructDisposableDiffEditorInput(accessor, original, modified, typeId) {
    return accessor.instantiationService.createInstance(
      DiffEditorInput,
      "name",
      "description",
      constructDisposableFileEditorInput(original.resource ?? URI.from({ scheme: Schemas.untitled }), typeId, disposables),
      constructDisposableFileEditorInput(modified.resource ?? URI.from({ scheme: Schemas.untitled }), typeId, disposables),
      void 0
    );
  }
  test("Simple Resolve", async () => {
    const [part, service] = await createEditorResolverService();
    const registeredEditor = service.registerEditor(
      "*.test",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) })
      }
    );
    const resultingResolution = await service.resolveEditor({ resource: URI.file("my://resource-basics.test") }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(resultingResolution.editor.typeId, TEST_EDITOR_INPUT_ID);
      resultingResolution.editor.dispose();
    }
    registeredEditor.dispose();
  });
  test("Untitled Resolve", async () => {
    const UNTITLED_TEST_EDITOR_INPUT_ID = "UNTITLED_TEST_INPUT";
    const [part, service] = await createEditorResolverService();
    const registeredEditor = service.registerEditor(
      "*.test",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) }),
        createUntitledEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(resource ? resource : URI.from({ scheme: Schemas.untitled }), UNTITLED_TEST_EDITOR_INPUT_ID) })
      }
    );
    let resultingResolution = await service.resolveEditor({ resource: void 0 }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.strictEqual(typeof resultingResolution, "number");
    resultingResolution = await service.resolveEditor({ resource: URI.from({ scheme: Schemas.untitled, path: "foo.test" }) }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(resultingResolution.editor.typeId, UNTITLED_TEST_EDITOR_INPUT_ID);
      resultingResolution.editor.dispose();
    }
    resultingResolution = await service.resolveEditor({ resource: URI.file("/fake.test"), forceUntitled: true }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(resultingResolution.editor.typeId, UNTITLED_TEST_EDITOR_INPUT_ID);
      resultingResolution.editor.dispose();
    }
    registeredEditor.dispose();
  });
  test("Side by side Resolve", async () => {
    const [part, service] = await createEditorResolverService();
    const registeredEditorPrimary = service.registerEditor(
      "*.test-primary",
      {
        id: "TEST_EDITOR_PRIMARY",
        label: "Test Editor Label Primary",
        detail: "Test Editor Details Primary",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID, disposables) })
      }
    );
    const registeredEditorSecondary = service.registerEditor(
      "*.test-secondary",
      {
        id: "TEST_EDITOR_SECONDARY",
        label: "Test Editor Label Secondary",
        detail: "Test Editor Details Secondary",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID, disposables) })
      }
    );
    const resultingResolution = await service.resolveEditor({
      primary: { resource: URI.file("my://resource-basics.test-primary") },
      secondary: { resource: URI.file("my://resource-basics.test-secondary") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(resultingResolution.editor.typeId, "workbench.editorinputs.sidebysideEditorInput");
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    registeredEditorPrimary.dispose();
    registeredEditorSecondary.dispose();
  });
  test("Diff editor Resolve", async () => {
    const [part, service, accessor] = await createEditorResolverService();
    const registeredEditor = service.registerEditor(
      "*.test-diff",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original, options }, group) => ({
          editor: accessor.instantiationService.createInstance(
            DiffEditorInput,
            "name",
            "description",
            constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables),
            constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables),
            void 0
          )
        })
      }
    );
    const resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource-basics.test-diff") },
      modified: { resource: URI.file("my://resource-basics.test-diff") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(resultingResolution.editor.typeId, "workbench.editors.diffEditorInput");
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    registeredEditor.dispose();
  });
  test("Diff editor Resolve - Falls back to editor associations", async () => {
    const CUSTOM_EDITOR_INPUT_ID = "testCustomEditorInput";
    const instantiationService = workbenchInstantiationService({
      configurationService: () => new TestConfigurationService({
        [editorsAssociationsSettingId]: {
          "*.test-diff-association": "TEST_EDITOR"
        }
      })
    }, disposables);
    const [part, service, accessor] = await createEditorResolverService(instantiationService);
    let customDiffCounter = 0;
    let defaultDiffCounter = 0;
    const defaultRegisteredEditor = service.registerEditor(
      "*",
      {
        id: "default",
        label: "Default Editor",
        detail: "Default",
        priority: RegisteredEditorPriority.builtin
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, TEST_EDITOR_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original }) => {
          defaultDiffCounter++;
          return { editor: constructDisposableDiffEditorInput(accessor, original, modified, TEST_EDITOR_INPUT_ID) };
        }
      }
    );
    const customRegisteredEditor = service.registerEditor(
      "*.test-diff-association",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.option
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, CUSTOM_EDITOR_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original }) => {
          customDiffCounter++;
          return { editor: constructDisposableDiffEditorInput(accessor, original, modified, CUSTOM_EDITOR_INPUT_ID) };
        }
      }
    );
    const resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("resource-basics.test-diff-association") },
      modified: { resource: URI.file("resource-basics.test-diff-association") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(customDiffCounter, 1);
      assert.strictEqual(defaultDiffCounter, 0);
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    defaultRegisteredEditor.dispose();
    customRegisteredEditor.dispose();
  });
  test("Diff editor Resolve - Diff associations override editor associations", async () => {
    const EDITOR_ASSOCIATION_INPUT_ID = "testEditorAssociationInput";
    const DIFF_ASSOCIATION_INPUT_ID = "testDiffAssociationInput";
    const instantiationService = workbenchInstantiationService({
      configurationService: () => new TestConfigurationService({
        [editorsAssociationsSettingId]: {
          "*.test-diff-association": "TEST_EDITOR"
        },
        [diffEditorsAssociationsSettingId]: {
          "*.test-diff-association": "TEST_DIFF_EDITOR"
        }
      })
    }, disposables);
    const [part, service, accessor] = await createEditorResolverService(instantiationService);
    let editorAssociationDiffCounter = 0;
    let diffAssociationDiffCounter = 0;
    const editorAssociationRegisteredEditor = service.registerEditor(
      "*.test-diff-association",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.option
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, EDITOR_ASSOCIATION_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original }) => {
          editorAssociationDiffCounter++;
          return { editor: constructDisposableDiffEditorInput(accessor, original, modified, EDITOR_ASSOCIATION_INPUT_ID) };
        }
      }
    );
    const diffAssociationRegisteredEditor = service.registerEditor(
      "*.test-diff-association",
      {
        id: "TEST_DIFF_EDITOR",
        label: "Test Diff Editor Label",
        detail: "Test Diff Editor Details",
        priority: RegisteredEditorPriority.option
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, DIFF_ASSOCIATION_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original }) => {
          diffAssociationDiffCounter++;
          return { editor: constructDisposableDiffEditorInput(accessor, original, modified, DIFF_ASSOCIATION_INPUT_ID) };
        }
      }
    );
    const diffResolution = await service.resolveEditor({
      original: { resource: URI.file("resource-basics.test-diff-association") },
      modified: { resource: URI.file("resource-basics.test-diff-association") }
    }, part.activeGroup);
    assert.ok(diffResolution);
    assert.notStrictEqual(typeof diffResolution, "number");
    if (diffResolution !== ResolvedStatus.ABORT && diffResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(editorAssociationDiffCounter, 0);
      assert.strictEqual(diffAssociationDiffCounter, 1);
      diffResolution.editor.dispose();
    } else {
      assert.fail();
    }
    const editorResolution = await service.resolveEditor({ resource: URI.file("resource-basics.test-diff-association") }, part.activeGroup);
    assert.ok(editorResolution);
    assert.notStrictEqual(typeof editorResolution, "number");
    if (editorResolution !== ResolvedStatus.ABORT && editorResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(editorResolution.editor.typeId, EDITOR_ASSOCIATION_INPUT_ID);
      editorResolution.editor.dispose();
    } else {
      assert.fail();
    }
    editorAssociationRegisteredEditor.dispose();
    diffAssociationRegisteredEditor.dispose();
  });
  test("Editor Resolve - editorAssociations only select an `explicit` editor in the associated mode", async () => {
    const DEFAULT_DIFF_INPUT_ID = "testDefaultDiffInput";
    const EXPLICIT_DIFF_INPUT_ID = "testExplicitDiffInput";
    const instantiationService = workbenchInstantiationService({
      configurationService: () => new TestConfigurationService({
        [editorsAssociationsSettingId]: {
          "*.test-explicit-diff": "EXPLICIT_DIFF_EDITOR"
        }
      })
    }, disposables);
    const [part, service, accessor] = await createEditorResolverService(instantiationService);
    let defaultDiffCounter = 0;
    let explicitDiffCounter = 0;
    const defaultRegisteredEditor = service.registerEditor(
      "*",
      {
        id: "default",
        label: "Default Editor",
        detail: "Default",
        priority: RegisteredEditorPriority.builtin
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, TEST_EDITOR_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original }) => {
          defaultDiffCounter++;
          return { editor: constructDisposableDiffEditorInput(accessor, original, modified, DEFAULT_DIFF_INPUT_ID) };
        }
      }
    );
    const explicitDiffRegisteredEditor = service.registerEditor(
      "*.test-explicit-diff",
      {
        id: "EXPLICIT_DIFF_EDITOR",
        label: "Explicit Diff Editor Label",
        detail: "Explicit Diff Editor Details",
        priority: {
          editor: RegisteredEditorPriority.explicit,
          diff: RegisteredEditorPriority.explicit
        }
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, EXPLICIT_DIFF_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original }) => {
          explicitDiffCounter++;
          return { editor: constructDisposableDiffEditorInput(accessor, original, modified, EXPLICIT_DIFF_INPUT_ID) };
        }
      }
    );
    const diffResolution = await service.resolveEditor({
      original: { resource: URI.file("resource-basics.test-explicit-diff") },
      modified: { resource: URI.file("resource-basics.test-explicit-diff") }
    }, part.activeGroup);
    assert.ok(diffResolution);
    assert.notStrictEqual(typeof diffResolution, "number");
    if (diffResolution !== ResolvedStatus.ABORT && diffResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(explicitDiffCounter, 0);
      assert.strictEqual(defaultDiffCounter, 1);
      diffResolution.editor.dispose();
    } else {
      assert.fail();
    }
    const editorResolution = await service.resolveEditor({ resource: URI.file("resource-basics.test-explicit-diff") }, part.activeGroup);
    assert.ok(editorResolution);
    assert.notStrictEqual(typeof editorResolution, "number");
    if (editorResolution !== ResolvedStatus.ABORT && editorResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(editorResolution.editor.typeId, EXPLICIT_DIFF_INPUT_ID);
      editorResolution.editor.dispose();
    } else {
      assert.fail();
    }
    defaultRegisteredEditor.dispose();
    explicitDiffRegisteredEditor.dispose();
  });
  test("Diff editor Resolve - diffEditorAssociations select an `explicit` diff editor", async () => {
    const DEFAULT_DIFF_INPUT_ID = "testDefaultDiffInput";
    const EXPLICIT_DIFF_INPUT_ID = "testExplicitDiffInput";
    const instantiationService = workbenchInstantiationService({
      configurationService: () => new TestConfigurationService({
        [diffEditorsAssociationsSettingId]: {
          "*.test-explicit-diff": "EXPLICIT_DIFF_EDITOR"
        }
      })
    }, disposables);
    const [part, service, accessor] = await createEditorResolverService(instantiationService);
    let defaultDiffCounter = 0;
    let explicitDiffCounter = 0;
    const defaultRegisteredEditor = service.registerEditor(
      "*",
      {
        id: "default",
        label: "Default Editor",
        detail: "Default",
        priority: RegisteredEditorPriority.builtin
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, TEST_EDITOR_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original }) => {
          defaultDiffCounter++;
          return { editor: constructDisposableDiffEditorInput(accessor, original, modified, DEFAULT_DIFF_INPUT_ID) };
        }
      }
    );
    const explicitDiffRegisteredEditor = service.registerEditor(
      "*.test-explicit-diff",
      {
        id: "EXPLICIT_DIFF_EDITOR",
        label: "Explicit Diff Editor Label",
        detail: "Explicit Diff Editor Details",
        priority: {
          editor: RegisteredEditorPriority.option,
          diff: RegisteredEditorPriority.explicit
        }
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, EXPLICIT_DIFF_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original }) => {
          explicitDiffCounter++;
          return { editor: constructDisposableDiffEditorInput(accessor, original, modified, EXPLICIT_DIFF_INPUT_ID) };
        }
      }
    );
    const diffResolution = await service.resolveEditor({
      original: { resource: URI.file("resource-basics.test-explicit-diff") },
      modified: { resource: URI.file("resource-basics.test-explicit-diff") }
    }, part.activeGroup);
    assert.ok(diffResolution);
    assert.notStrictEqual(typeof diffResolution, "number");
    if (diffResolution !== ResolvedStatus.ABORT && diffResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(defaultDiffCounter, 0);
      assert.strictEqual(explicitDiffCounter, 1);
      diffResolution.editor.dispose();
    } else {
      assert.fail();
    }
    defaultRegisteredEditor.dispose();
    explicitDiffRegisteredEditor.dispose();
  });
  test("getBinaryDiffFallbackEditor returns a diff-capable `explicit` editor and ignores non-diff editors", async () => {
    const [, service] = await createEditorResolverService();
    const explicitWithDiff = service.registerEditor(
      "*.bin",
      {
        id: "BINARY_EDITOR",
        label: "Binary Editor",
        detail: "Binary Editor Details",
        priority: {
          editor: RegisteredEditorPriority.default,
          diff: RegisteredEditorPriority.explicit
        }
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, "binaryInput", disposables) }),
        createDiffEditorInput: ({ modified, original }) => ({ editor: constructDisposableFileEditorInput(modified.resource ?? original.resource, "binaryDiffInput", disposables) })
      }
    );
    const noDiff = service.registerEditor(
      "*.noDiff",
      {
        id: "NO_DIFF_EDITOR",
        label: "No Diff Editor",
        detail: "No Diff Editor Details",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource }) => ({ editor: constructDisposableFileEditorInput(resource, "noDiffInput", disposables) })
      }
    );
    assert.strictEqual(service.getBinaryDiffFallbackEditor(URI.file("file.bin")), "BINARY_EDITOR");
    assert.strictEqual(service.getBinaryDiffFallbackEditor(URI.file("file.noDiff")), void 0);
    assert.strictEqual(service.getBinaryDiffFallbackEditor(URI.file("file.unrelated")), void 0);
    explicitWithDiff.dispose();
    noDiff.dispose();
  });
  test("Diff editor Resolve - Different Types", async () => {
    const [part, service, accessor] = await createEditorResolverService();
    let diffOneCounter = 0;
    let diffTwoCounter = 0;
    let defaultDiffCounter = 0;
    const registeredEditor = service.registerEditor(
      "*.test-diff",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original, options }, group) => {
          diffOneCounter++;
          return {
            editor: accessor.instantiationService.createInstance(
              DiffEditorInput,
              "name",
              "description",
              constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables),
              constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables),
              void 0
            )
          };
        }
      }
    );
    const secondRegisteredEditor = service.registerEditor(
      "*.test-secondDiff",
      {
        id: "TEST_EDITOR_2",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) }),
        createDiffEditorInput: ({ modified, original, options }, group) => {
          diffTwoCounter++;
          return {
            editor: accessor.instantiationService.createInstance(
              DiffEditorInput,
              "name",
              "description",
              constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables),
              constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables),
              void 0
            )
          };
        }
      }
    );
    const defaultRegisteredEditor = service.registerEditor(
      "*",
      {
        id: "default",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.option
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) }),
        createDiffEditorInput: ({ modified, original, options }, group) => {
          defaultDiffCounter++;
          return {
            editor: accessor.instantiationService.createInstance(
              DiffEditorInput,
              "name",
              "description",
              constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables),
              constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables),
              void 0
            )
          };
        }
      }
    );
    let resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource-basics.test-diff") },
      modified: { resource: URI.file("my://resource-basics.test-diff") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(diffOneCounter, 1);
      assert.strictEqual(diffTwoCounter, 0);
      assert.strictEqual(defaultDiffCounter, 0);
      assert.strictEqual(resultingResolution.editor.typeId, "workbench.editors.diffEditorInput");
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource-basics.test-secondDiff") },
      modified: { resource: URI.file("my://resource-basics.test-secondDiff") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(diffOneCounter, 1);
      assert.strictEqual(diffTwoCounter, 1);
      assert.strictEqual(defaultDiffCounter, 0);
      assert.strictEqual(resultingResolution.editor.typeId, "workbench.editors.diffEditorInput");
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource-basics.test-secondDiff") },
      modified: { resource: URI.file("my://resource-basics.test-diff") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(diffOneCounter, 1);
      assert.strictEqual(diffTwoCounter, 1);
      assert.strictEqual(defaultDiffCounter, 1);
      assert.strictEqual(resultingResolution.editor.typeId, "workbench.editors.diffEditorInput");
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource-basics.test-diff") },
      modified: { resource: URI.file("my://resource-basics.test-secondDiff") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(diffOneCounter, 1);
      assert.strictEqual(diffTwoCounter, 1);
      assert.strictEqual(defaultDiffCounter, 2);
      assert.strictEqual(resultingResolution.editor.typeId, "workbench.editors.diffEditorInput");
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource-basics.test-secondDiff") },
      modified: { resource: URI.file("my://resource-basics.test-diff") },
      options: { override: "TEST_EDITOR" }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(diffOneCounter, 2);
      assert.strictEqual(diffTwoCounter, 1);
      assert.strictEqual(defaultDiffCounter, 2);
      assert.strictEqual(resultingResolution.editor.typeId, "workbench.editors.diffEditorInput");
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    registeredEditor.dispose();
    secondRegisteredEditor.dispose();
    defaultRegisteredEditor.dispose();
  });
  test("Registry & Events", async () => {
    const [, service] = await createEditorResolverService();
    let eventCounter = 0;
    disposables.add(service.onDidChangeEditorRegistrations(() => {
      eventCounter++;
    }));
    const editors = service.getEditors();
    const registeredEditor = service.registerEditor(
      "*.test",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) })
      }
    );
    assert.strictEqual(eventCounter, 1);
    assert.strictEqual(service.getEditors().length, editors.length + 1);
    assert.strictEqual(service.getEditors().some((editor) => editor.id === "TEST_EDITOR"), true);
    registeredEditor.dispose();
    assert.strictEqual(eventCounter, 2);
    assert.strictEqual(service.getEditors().length, editors.length);
    assert.strictEqual(service.getEditors().some((editor) => editor.id === "TEST_EDITOR"), false);
  });
  test("Multiple registrations to same glob and id #155859", async () => {
    const [part, service, accessor] = await createEditorResolverService();
    const testEditorInfo = {
      id: "TEST_EDITOR",
      label: "Test Editor Label",
      detail: "Test Editor Details",
      priority: RegisteredEditorPriority.default
    };
    const registeredSingleEditor = service.registerEditor(
      "*.test",
      testEditorInfo,
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) })
      }
    );
    const registeredDiffEditor = service.registerEditor(
      "*.test",
      testEditorInfo,
      {},
      {
        createDiffEditorInput: ({ modified, original, options }, group) => ({
          editor: accessor.instantiationService.createInstance(
            DiffEditorInput,
            "name",
            "description",
            constructDisposableFileEditorInput(URI.parse(original.toString()), TEST_EDITOR_INPUT_ID, disposables),
            constructDisposableFileEditorInput(URI.parse(modified.toString()), TEST_EDITOR_INPUT_ID, disposables),
            void 0
          )
        })
      }
    );
    let resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource-basics.test") },
      modified: { resource: URI.file("my://resource-basics.test") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(resultingResolution.editor.typeId, "workbench.editors.diffEditorInput");
      resultingResolution.editor.dispose();
    } else {
      assert.fail();
    }
    registeredDiffEditor.dispose();
    resultingResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource-basics.test") },
      modified: { resource: URI.file("my://resource-basics.test") }
    }, part.activeGroup);
    assert.ok(resultingResolution);
    assert.strictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.NONE) {
      assert.fail();
    }
    registeredSingleEditor.dispose();
  });
  test("User-configured editor association resolves on first startup with empty cache #244597", async () => {
    const CUSTOM_EDITOR_INPUT_ID = "testCustomEditorInput";
    const instantiationService = workbenchInstantiationService({
      configurationService: () => new TestConfigurationService({
        [editorsAssociationsSettingId]: {
          "*.md": "CUSTOM_MD_EDITOR"
        }
      })
    }, disposables);
    const part = await createEditorPart(instantiationService, disposables);
    instantiationService.stub(IEditorGroupsService, part);
    const editorResolverService = instantiationService.createInstance(EditorResolverService);
    disposables.add(editorResolverService);
    const defaultEditor = editorResolverService.registerEditor(
      "*",
      {
        id: "default",
        label: "Default Editor",
        detail: "Default",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), TEST_EDITOR_INPUT_ID) })
      }
    );
    const customEditor = editorResolverService.registerEditor(
      "*.md",
      {
        id: "CUSTOM_MD_EDITOR",
        label: "Markdown Preview",
        detail: "Markdown Preview Details",
        priority: RegisteredEditorPriority.option
      },
      {},
      {
        createEditorInput: ({ resource }, group) => ({ editor: new TestFileEditorInput(URI.parse(resource.toString()), CUSTOM_EDITOR_INPUT_ID) })
      }
    );
    const resultingResolution = await editorResolverService.resolveEditor(
      { resource: URI.file("test.md") },
      part.activeGroup
    );
    assert.ok(resultingResolution);
    assert.notStrictEqual(typeof resultingResolution, "number");
    if (resultingResolution !== ResolvedStatus.ABORT && resultingResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(
        resultingResolution.editor.typeId,
        CUSTOM_EDITOR_INPUT_ID,
        "Should resolve to custom editor when user has configured editor association"
      );
      resultingResolution.editor.dispose();
    } else {
      assert.fail("Expected editor to resolve successfully");
    }
    defaultEditor.dispose();
    customEditor.dispose();
  });
  test("Diff editor Resolve - priority.diff overrides priority.editor for diffs", async () => {
    const CUSTOM_EDITOR_INPUT_ID = "testCustomEditorForDiffPriority";
    const [part, service, accessor] = await createEditorResolverService();
    const registeredEditor = service.registerEditor(
      "*.test-diff-priority",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: {
          editor: RegisteredEditorPriority.default,
          diff: RegisteredEditorPriority.option,
          merge: RegisteredEditorPriority.default
        }
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), CUSTOM_EDITOR_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original, options }, group) => ({
          editor: accessor.instantiationService.createInstance(
            DiffEditorInput,
            "name",
            "description",
            constructDisposableFileEditorInput(URI.parse(original.toString()), CUSTOM_EDITOR_INPUT_ID, disposables),
            constructDisposableFileEditorInput(URI.parse(modified.toString()), CUSTOM_EDITOR_INPUT_ID, disposables),
            void 0
          )
        })
      }
    );
    const editorResolution = await service.resolveEditor({ resource: URI.file("my://resource.test-diff-priority") }, part.activeGroup);
    assert.ok(editorResolution);
    assert.notStrictEqual(typeof editorResolution, "number");
    if (editorResolution !== ResolvedStatus.ABORT && editorResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(editorResolution.editor.typeId, CUSTOM_EDITOR_INPUT_ID);
      editorResolution.editor.dispose();
    } else {
      assert.fail("Expected editor to resolve successfully");
    }
    const diffResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource.test-diff-priority") },
      modified: { resource: URI.file("my://resource.test-diff-priority") }
    }, part.activeGroup);
    assert.ok(diffResolution);
    if (diffResolution !== ResolvedStatus.ABORT && diffResolution !== ResolvedStatus.NONE) {
      assert.notStrictEqual(
        diffResolution.editor.typeId,
        CUSTOM_EDITOR_INPUT_ID,
        "Custom editor with priority.diff:option should not be used for diffs"
      );
      diffResolution.editor.dispose();
    }
    registeredEditor.dispose();
  });
  test("Diff editor Resolve - string priority expands to diff priority", async () => {
    const CUSTOM_EDITOR_INPUT_ID = "testCustomEditorNoDiffPriority";
    const [part, service, accessor] = await createEditorResolverService();
    const registeredEditor = service.registerEditor(
      "*.test-no-diff-priority",
      {
        id: "TEST_EDITOR",
        label: "Test Editor Label",
        detail: "Test Editor Details",
        priority: RegisteredEditorPriority.default
      },
      {},
      {
        createEditorInput: ({ resource, options }, group) => ({ editor: constructDisposableFileEditorInput(URI.parse(resource.toString()), CUSTOM_EDITOR_INPUT_ID, disposables) }),
        createDiffEditorInput: ({ modified, original, options }, group) => ({
          editor: accessor.instantiationService.createInstance(
            DiffEditorInput,
            "name",
            "description",
            constructDisposableFileEditorInput(URI.parse(original.toString()), CUSTOM_EDITOR_INPUT_ID, disposables),
            constructDisposableFileEditorInput(URI.parse(modified.toString()), CUSTOM_EDITOR_INPUT_ID, disposables),
            void 0
          )
        })
      }
    );
    const diffResolution = await service.resolveEditor({
      original: { resource: URI.file("my://resource.test-no-diff-priority") },
      modified: { resource: URI.file("my://resource.test-no-diff-priority") }
    }, part.activeGroup);
    assert.ok(diffResolution);
    assert.notStrictEqual(typeof diffResolution, "number");
    if (diffResolution !== ResolvedStatus.ABORT && diffResolution !== ResolvedStatus.NONE) {
      assert.strictEqual(diffResolution.editor.typeId, "workbench.editors.diffEditorInput");
      diffResolution.editor.dispose();
    } else {
      assert.fail("Expected diff editor to resolve successfully");
    }
    registeredEditor.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9lZGl0b3IvdGVzdC9icm93c2VyL2VkaXRvclJlc29sdmVyU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEVkaXRvclBhcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYXJ0LmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZGlmZkVkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IEVkaXRvclJlc29sdmVyU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZGlmZkVkaXRvcnNBc3NvY2lhdGlvbnNBZ2VudHNXaW5kb3dEZWZhdWx0LCBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLCBSZXNvbHZlZFN0YXR1cywgUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LCBkaWZmRWRpdG9yc0Fzc29jaWF0aW9uc1NldHRpbmdJZCwgZWRpdG9yc0Fzc29jaWF0aW9uc1NldHRpbmdJZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlRWRpdG9yUGFydCwgSVRlc3RJbnN0YW50aWF0aW9uU2VydmljZSwgVGVzdEZpbGVFZGl0b3JJbnB1dCwgVGVzdFNlcnZpY2VBY2Nlc3Nvciwgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcblxuc3VpdGUoJ0VkaXRvclJlc29sdmVyU2VydmljZScsICgpID0+IHtcblx0dGVzdCgnQWdlbnRzIHdpbmRvdyBkaWZmIGVkaXRvciBkZWZhdWx0IGZvbGxvd3MgdGhlIE1hcmtkb3duIGVkaXRvciBzZXR0aW5nJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZW5hYmxlZDogZGlmZkVkaXRvcnNBc3NvY2lhdGlvbnNBZ2VudHNXaW5kb3dEZWZhdWx0KHsgbWFya2Rvd25EZWZhdWx0RWRpdG9yOiB0cnVlIH0pLFxuXHRcdFx0ZGlzYWJsZWQ6IGRpZmZFZGl0b3JzQXNzb2NpYXRpb25zQWdlbnRzV2luZG93RGVmYXVsdCh7IG1hcmtkb3duRGVmYXVsdEVkaXRvcjogZmFsc2UgfSksXG5cdFx0fSwge1xuXHRcdFx0ZW5hYmxlZDogeyAnKi5tZCc6ICd2c2NvZGUubWFya2Rvd24uZWRpdG9yJyB9LFxuXHRcdFx0ZGlzYWJsZWQ6IHsgJyoubWQnOiAndnNjb2RlLm1hcmtkb3duLnByZXZpZXcuZWRpdG9yJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXG5cdGNvbnN0IFRFU1RfRURJVE9SX0lOUFVUX0lEID0gJ3Rlc3RFZGl0b3JJbnB1dEZvckVkaXRvclJlc29sdmVyU2VydmljZSc7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmNsZWFyKCkpO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZUVkaXRvclJlc29sdmVyU2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZTogSVRlc3RJbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZXMpKTogUHJvbWlzZTxbRWRpdG9yUGFydCwgRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLCBUZXN0U2VydmljZUFjY2Vzc29yXT4ge1xuXHRcdGNvbnN0IHBhcnQgPSBhd2FpdCBjcmVhdGVFZGl0b3JQYXJ0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yR3JvdXBzU2VydmljZSwgcGFydCk7XG5cblx0XHRjb25zdCBlZGl0b3JSZXNvbHZlclNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JSZXNvbHZlclNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvclJlc29sdmVyU2VydmljZSwgZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKTtcblxuXHRcdHJldHVybiBbcGFydCwgZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0U2VydmljZUFjY2Vzc29yKV07XG5cdH1cblxuXHRmdW5jdGlvbiBjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KHVyaTogVVJJLCB0eXBlSWQ6IHN0cmluZywgc3RvcmU6IERpc3Bvc2FibGVTdG9yZSk6IFRlc3RGaWxlRWRpdG9ySW5wdXQge1xuXHRcdGNvbnN0IGVkaXRvciA9IG5ldyBUZXN0RmlsZUVkaXRvcklucHV0KHVyaSwgdHlwZUlkKTtcblx0XHRzdG9yZS5hZGQoZWRpdG9yKTtcblx0XHRyZXR1cm4gZWRpdG9yO1xuXHR9XG5cblx0ZnVuY3Rpb24gY29uc3RydWN0RGlzcG9zYWJsZURpZmZFZGl0b3JJbnB1dChhY2Nlc3NvcjogVGVzdFNlcnZpY2VBY2Nlc3Nvciwgb3JpZ2luYWw6IHsgcmVhZG9ubHkgcmVzb3VyY2U/OiBVUkkgfSwgbW9kaWZpZWQ6IHsgcmVhZG9ubHkgcmVzb3VyY2U/OiBVUkkgfSwgdHlwZUlkOiBzdHJpbmcpOiBEaWZmRWRpdG9ySW5wdXQge1xuXHRcdHJldHVybiBhY2Nlc3Nvci5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdERpZmZFZGl0b3JJbnB1dCxcblx0XHRcdCduYW1lJyxcblx0XHRcdCdkZXNjcmlwdGlvbicsXG5cdFx0XHRjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KG9yaWdpbmFsLnJlc291cmNlID8/IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnVudGl0bGVkIH0pLCB0eXBlSWQsIGRpc3Bvc2FibGVzKSxcblx0XHRcdGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQobW9kaWZpZWQucmVzb3VyY2UgPz8gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMudW50aXRsZWQgfSksIHR5cGVJZCwgZGlzcG9zYWJsZXMpLFxuXHRcdFx0dW5kZWZpbmVkKTtcblx0fVxuXG5cdHRlc3QoJ1NpbXBsZSBSZXNvbHZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclJlc29sdmVyU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZ2lzdGVyZWRFZGl0b3IgPSBzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqLnRlc3QnLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ1RFU1RfRURJVE9SJyxcblx0XHRcdFx0bGFiZWw6ICdUZXN0IEVkaXRvciBMYWJlbCcsXG5cdFx0XHRcdGRldGFpbDogJ1Rlc3QgRWRpdG9yIERldGFpbHMnLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmRlZmF1bHRcblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlLCBvcHRpb25zIH0sIGdyb3VwKSA9PiAoeyBlZGl0b3I6IG5ldyBUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShyZXNvdXJjZS50b1N0cmluZygpKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpIH0pLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRjb25zdCByZXN1bHRpbmdSZXNvbHV0aW9uID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yKHsgcmVzb3VyY2U6IFVSSS5maWxlKCdteTovL3Jlc291cmNlLWJhc2ljcy50ZXN0JykgfSwgcGFydC5hY3RpdmVHcm91cCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdGluZ1Jlc29sdXRpb24pO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0eXBlb2YgcmVzdWx0aW5nUmVzb2x1dGlvbiwgJ251bWJlcicpO1xuXHRcdGlmIChyZXN1bHRpbmdSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5BQk9SVCAmJiByZXN1bHRpbmdSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5OT05FKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0aW5nUmVzb2x1dGlvbi5lZGl0b3IudHlwZUlkLCBURVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0XHRyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHJlZ2lzdGVyZWRFZGl0b3IuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdVbnRpdGxlZCBSZXNvbHZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFVOVElUTEVEX1RFU1RfRURJVE9SX0lOUFVUX0lEID0gJ1VOVElUTEVEX1RFU1RfSU5QVVQnO1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclJlc29sdmVyU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZ2lzdGVyZWRFZGl0b3IgPSBzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqLnRlc3QnLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ1RFU1RfRURJVE9SJyxcblx0XHRcdFx0bGFiZWw6ICdUZXN0IEVkaXRvciBMYWJlbCcsXG5cdFx0XHRcdGRldGFpbDogJ1Rlc3QgRWRpdG9yIERldGFpbHMnLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmRlZmF1bHRcblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlLCBvcHRpb25zIH0sIGdyb3VwKSA9PiAoeyBlZGl0b3I6IG5ldyBUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShyZXNvdXJjZS50b1N0cmluZygpKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpIH0pLFxuXHRcdFx0XHRjcmVhdGVVbnRpdGxlZEVkaXRvcklucHV0OiAoeyByZXNvdXJjZSwgb3B0aW9ucyB9LCBncm91cCkgPT4gKHsgZWRpdG9yOiBuZXcgVGVzdEZpbGVFZGl0b3JJbnB1dCgocmVzb3VyY2UgPyByZXNvdXJjZSA6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnVudGl0bGVkIH0pKSwgVU5USVRMRURfVEVTVF9FRElUT1JfSU5QVVRfSUQpIH0pLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHQvLyBVbnR5cGVkIHVudGl0bGVkIC0gbm8gcmVzb3VyY2Vcblx0XHRsZXQgcmVzdWx0aW5nUmVzb2x1dGlvbiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUVkaXRvcih7IHJlc291cmNlOiB1bmRlZmluZWQgfSwgcGFydC5hY3RpdmVHcm91cCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdGluZ1Jlc29sdXRpb24pO1xuXHRcdC8vIFdlIGRvbid0IGV4cGVjdCB1bnRpdGxlZCB0byBtYXRjaCB0aGUgKi50ZXN0IGdsb2Jcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdGluZ1Jlc29sdXRpb24sICdudW1iZXInKTtcblxuXHRcdC8vIFVudHlwZWQgdW50aXRsZWQgLSB3aXRoIHVudGl0bGVkIHJlc291cmNlXG5cdFx0cmVzdWx0aW5nUmVzb2x1dGlvbiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUVkaXRvcih7IHJlc291cmNlOiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy51bnRpdGxlZCwgcGF0aDogJ2Zvby50ZXN0JyB9KSB9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2socmVzdWx0aW5nUmVzb2x1dGlvbik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHRpbmdSZXNvbHV0aW9uLCAnbnVtYmVyJyk7XG5cdFx0aWYgKHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci50eXBlSWQsIFVOVElUTEVEX1RFU1RfRURJVE9SX0lOUFVUX0lEKTtcblx0XHRcdHJlc3VsdGluZ1Jlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHQvLyBVbnR5cGVkIHVudGl0bGVkIC0gZmlsZSByZXNvdXJjZSB3aXRoIGZvcmNlVW50aXRsZWRcblx0XHRyZXN1bHRpbmdSZXNvbHV0aW9uID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yKHsgcmVzb3VyY2U6IFVSSS5maWxlKCcvZmFrZS50ZXN0JyksIGZvcmNlVW50aXRsZWQ6IHRydWUgfSwgcGFydC5hY3RpdmVHcm91cCk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdGluZ1Jlc29sdXRpb24pO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0eXBlb2YgcmVzdWx0aW5nUmVzb2x1dGlvbiwgJ251bWJlcicpO1xuXHRcdGlmIChyZXN1bHRpbmdSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5BQk9SVCAmJiByZXN1bHRpbmdSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5OT05FKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0aW5nUmVzb2x1dGlvbi5lZGl0b3IudHlwZUlkLCBVTlRJVExFRF9URVNUX0VESVRPUl9JTlBVVF9JRCk7XG5cdFx0XHRyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci5kaXNwb3NlKCk7XG5cdFx0fVxuXG5cdFx0cmVnaXN0ZXJlZEVkaXRvci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NpZGUgYnkgc2lkZSBSZXNvbHZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclJlc29sdmVyU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZ2lzdGVyZWRFZGl0b3JQcmltYXJ5ID0gc2VydmljZS5yZWdpc3RlckVkaXRvcignKi50ZXN0LXByaW1hcnknLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ1RFU1RfRURJVE9SX1BSSU1BUlknLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgRWRpdG9yIExhYmVsIFByaW1hcnknLFxuXHRcdFx0XHRkZXRhaWw6ICdUZXN0IEVkaXRvciBEZXRhaWxzIFByaW1hcnknLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmRlZmF1bHRcblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlLCBvcHRpb25zIH0sIGdyb3VwKSA9PiAoeyBlZGl0b3I6IGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKHJlc291cmNlLnRvU3RyaW5nKCkpLCBURVNUX0VESVRPUl9JTlBVVF9JRCwgZGlzcG9zYWJsZXMpIH0pLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRjb25zdCByZWdpc3RlcmVkRWRpdG9yU2Vjb25kYXJ5ID0gc2VydmljZS5yZWdpc3RlckVkaXRvcignKi50ZXN0LXNlY29uZGFyeScsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnVEVTVF9FRElUT1JfU0VDT05EQVJZJyxcblx0XHRcdFx0bGFiZWw6ICdUZXN0IEVkaXRvciBMYWJlbCBTZWNvbmRhcnknLFxuXHRcdFx0XHRkZXRhaWw6ICdUZXN0IEVkaXRvciBEZXRhaWxzIFNlY29uZGFyeScsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZGVmYXVsdFxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UsIG9wdGlvbnMgfSwgZ3JvdXApID0+ICh7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UocmVzb3VyY2UudG9TdHJpbmcoKSksIFRFU1RfRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcykgfSksXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGNvbnN0IHJlc3VsdGluZ1Jlc29sdXRpb24gPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVFZGl0b3Ioe1xuXHRcdFx0cHJpbWFyeTogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UtYmFzaWNzLnRlc3QtcHJpbWFyeScpIH0sXG5cdFx0XHRzZWNvbmRhcnk6IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdteTovL3Jlc291cmNlLWJhc2ljcy50ZXN0LXNlY29uZGFyeScpIH1cblx0XHR9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2socmVzdWx0aW5nUmVzb2x1dGlvbik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHRpbmdSZXNvbHV0aW9uLCAnbnVtYmVyJyk7XG5cdFx0aWYgKHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci50eXBlSWQsICd3b3JrYmVuY2guZWRpdG9yaW5wdXRzLnNpZGVieXNpZGVFZGl0b3JJbnB1dCcpO1xuXHRcdFx0cmVzdWx0aW5nUmVzb2x1dGlvbi5lZGl0b3IuZGlzcG9zZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgpO1xuXHRcdH1cblx0XHRyZWdpc3RlcmVkRWRpdG9yUHJpbWFyeS5kaXNwb3NlKCk7XG5cdFx0cmVnaXN0ZXJlZEVkaXRvclNlY29uZGFyeS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0RpZmYgZWRpdG9yIFJlc29sdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2UsIGFjY2Vzc29yXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclJlc29sdmVyU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZ2lzdGVyZWRFZGl0b3IgPSBzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqLnRlc3QtZGlmZicsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnVEVTVF9FRElUT1InLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgRWRpdG9yIExhYmVsJyxcblx0XHRcdFx0ZGV0YWlsOiAnVGVzdCBFZGl0b3IgRGV0YWlscycsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZGVmYXVsdFxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UsIG9wdGlvbnMgfSwgZ3JvdXApID0+ICh7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UocmVzb3VyY2UudG9TdHJpbmcoKSksIFRFU1RfRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcykgfSksXG5cdFx0XHRcdGNyZWF0ZURpZmZFZGl0b3JJbnB1dDogKHsgbW9kaWZpZWQsIG9yaWdpbmFsLCBvcHRpb25zIH0sIGdyb3VwKSA9PiAoe1xuXHRcdFx0XHRcdGVkaXRvcjogYWNjZXNzb3IuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0XHREaWZmRWRpdG9ySW5wdXQsXG5cdFx0XHRcdFx0XHQnbmFtZScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdFx0Y29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2Uob3JpZ2luYWwudG9TdHJpbmcoKSksIFRFU1RfRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcyksXG5cdFx0XHRcdFx0XHRjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShtb2RpZmllZC50b1N0cmluZygpKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSxcblx0XHRcdFx0XHRcdHVuZGVmaW5lZClcblx0XHRcdFx0fSlcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0aW5nUmVzb2x1dGlvbiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUVkaXRvcih7XG5cdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UtYmFzaWNzLnRlc3QtZGlmZicpIH0sXG5cdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UtYmFzaWNzLnRlc3QtZGlmZicpIH1cblx0XHR9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2socmVzdWx0aW5nUmVzb2x1dGlvbik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHRpbmdSZXNvbHV0aW9uLCAnbnVtYmVyJyk7XG5cdFx0aWYgKHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci50eXBlSWQsICd3b3JrYmVuY2guZWRpdG9ycy5kaWZmRWRpdG9ySW5wdXQnKTtcblx0XHRcdHJlc3VsdGluZ1Jlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LmZhaWwoKTtcblx0XHR9XG5cdFx0cmVnaXN0ZXJlZEVkaXRvci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0RpZmYgZWRpdG9yIFJlc29sdmUgLSBGYWxscyBiYWNrIHRvIGVkaXRvciBhc3NvY2lhdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgQ1VTVE9NX0VESVRPUl9JTlBVVF9JRCA9ICd0ZXN0Q3VzdG9tRWRpdG9ySW5wdXQnO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHRbZWRpdG9yc0Fzc29jaWF0aW9uc1NldHRpbmdJZF06IHtcblx0XHRcdFx0XHQnKi50ZXN0LWRpZmYtYXNzb2NpYXRpb24nOiAnVEVTVF9FRElUT1InXG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0fSwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlLCBhY2Nlc3Nvcl0gPSBhd2FpdCBjcmVhdGVFZGl0b3JSZXNvbHZlclNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGxldCBjdXN0b21EaWZmQ291bnRlciA9IDA7XG5cdFx0bGV0IGRlZmF1bHREaWZmQ291bnRlciA9IDA7XG5cblx0XHRjb25zdCBkZWZhdWx0UmVnaXN0ZXJlZEVkaXRvciA9IHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyonLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ2RlZmF1bHQnLFxuXHRcdFx0XHRsYWJlbDogJ0RlZmF1bHQgRWRpdG9yJyxcblx0XHRcdFx0ZGV0YWlsOiAnRGVmYXVsdCcsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuYnVpbHRpblxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UgfSkgPT4gKHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KHJlc291cmNlLCBURVNUX0VESVRPUl9JTlBVVF9JRCwgZGlzcG9zYWJsZXMpIH0pLFxuXHRcdFx0XHRjcmVhdGVEaWZmRWRpdG9ySW5wdXQ6ICh7IG1vZGlmaWVkLCBvcmlnaW5hbCB9KSA9PiB7XG5cdFx0XHRcdFx0ZGVmYXVsdERpZmZDb3VudGVyKys7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRGlmZkVkaXRvcklucHV0KGFjY2Vzc29yLCBvcmlnaW5hbCwgbW9kaWZpZWQsIFRFU1RfRURJVE9SX0lOUFVUX0lEKSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGNvbnN0IGN1c3RvbVJlZ2lzdGVyZWRFZGl0b3IgPSBzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqLnRlc3QtZGlmZi1hc3NvY2lhdGlvbicsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnVEVTVF9FRElUT1InLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgRWRpdG9yIExhYmVsJyxcblx0XHRcdFx0ZGV0YWlsOiAnVGVzdCBFZGl0b3IgRGV0YWlscycsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkub3B0aW9uXG5cdFx0XHR9LFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiAoeyByZXNvdXJjZSB9KSA9PiAoeyBlZGl0b3I6IGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQocmVzb3VyY2UsIENVU1RPTV9FRElUT1JfSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSB9KSxcblx0XHRcdFx0Y3JlYXRlRGlmZkVkaXRvcklucHV0OiAoeyBtb2RpZmllZCwgb3JpZ2luYWwgfSkgPT4ge1xuXHRcdFx0XHRcdGN1c3RvbURpZmZDb3VudGVyKys7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRGlmZkVkaXRvcklucHV0KGFjY2Vzc29yLCBvcmlnaW5hbCwgbW9kaWZpZWQsIENVU1RPTV9FRElUT1JfSU5QVVRfSUQpIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0aW5nUmVzb2x1dGlvbiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUVkaXRvcih7XG5cdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ3Jlc291cmNlLWJhc2ljcy50ZXN0LWRpZmYtYXNzb2NpYXRpb24nKSB9LFxuXHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdyZXNvdXJjZS1iYXNpY3MudGVzdC1kaWZmLWFzc29jaWF0aW9uJykgfVxuXHRcdH0sIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdGFzc2VydC5vayhyZXN1bHRpbmdSZXNvbHV0aW9uKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodHlwZW9mIHJlc3VsdGluZ1Jlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAocmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuQUJPUlQgJiYgcmVzdWx0aW5nUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGN1c3RvbURpZmZDb3VudGVyLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWZhdWx0RGlmZkNvdW50ZXIsIDApO1xuXHRcdFx0cmVzdWx0aW5nUmVzb2x1dGlvbi5lZGl0b3IuZGlzcG9zZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgpO1xuXHRcdH1cblxuXHRcdGRlZmF1bHRSZWdpc3RlcmVkRWRpdG9yLmRpc3Bvc2UoKTtcblx0XHRjdXN0b21SZWdpc3RlcmVkRWRpdG9yLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnRGlmZiBlZGl0b3IgUmVzb2x2ZSAtIERpZmYgYXNzb2NpYXRpb25zIG92ZXJyaWRlIGVkaXRvciBhc3NvY2lhdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgRURJVE9SX0FTU09DSUFUSU9OX0lOUFVUX0lEID0gJ3Rlc3RFZGl0b3JBc3NvY2lhdGlvbklucHV0Jztcblx0XHRjb25zdCBESUZGX0FTU09DSUFUSU9OX0lOUFVUX0lEID0gJ3Rlc3REaWZmQXNzb2NpYXRpb25JbnB1dCc7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7XG5cdFx0XHRcdFtlZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkXToge1xuXHRcdFx0XHRcdCcqLnRlc3QtZGlmZi1hc3NvY2lhdGlvbic6ICdURVNUX0VESVRPUidcblx0XHRcdFx0fSxcblx0XHRcdFx0W2RpZmZFZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkXToge1xuXHRcdFx0XHRcdCcqLnRlc3QtZGlmZi1hc3NvY2lhdGlvbic6ICdURVNUX0RJRkZfRURJVE9SJ1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdH0sIGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBbcGFydCwgc2VydmljZSwgYWNjZXNzb3JdID0gYXdhaXQgY3JlYXRlRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlKTtcblx0XHRsZXQgZWRpdG9yQXNzb2NpYXRpb25EaWZmQ291bnRlciA9IDA7XG5cdFx0bGV0IGRpZmZBc3NvY2lhdGlvbkRpZmZDb3VudGVyID0gMDtcblxuXHRcdGNvbnN0IGVkaXRvckFzc29jaWF0aW9uUmVnaXN0ZXJlZEVkaXRvciA9IHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyoudGVzdC1kaWZmLWFzc29jaWF0aW9uJyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdURVNUX0VESVRPUicsXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCBFZGl0b3IgTGFiZWwnLFxuXHRcdFx0XHRkZXRhaWw6ICdUZXN0IEVkaXRvciBEZXRhaWxzJyxcblx0XHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5vcHRpb25cblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlIH0pID0+ICh7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChyZXNvdXJjZSwgRURJVE9SX0FTU09DSUFUSU9OX0lOUFVUX0lELCBkaXNwb3NhYmxlcykgfSksXG5cdFx0XHRcdGNyZWF0ZURpZmZFZGl0b3JJbnB1dDogKHsgbW9kaWZpZWQsIG9yaWdpbmFsIH0pID0+IHtcblx0XHRcdFx0XHRlZGl0b3JBc3NvY2lhdGlvbkRpZmZDb3VudGVyKys7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRGlmZkVkaXRvcklucHV0KGFjY2Vzc29yLCBvcmlnaW5hbCwgbW9kaWZpZWQsIEVESVRPUl9BU1NPQ0lBVElPTl9JTlBVVF9JRCkgfTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRjb25zdCBkaWZmQXNzb2NpYXRpb25SZWdpc3RlcmVkRWRpdG9yID0gc2VydmljZS5yZWdpc3RlckVkaXRvcignKi50ZXN0LWRpZmYtYXNzb2NpYXRpb24nLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ1RFU1RfRElGRl9FRElUT1InLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgRGlmZiBFZGl0b3IgTGFiZWwnLFxuXHRcdFx0XHRkZXRhaWw6ICdUZXN0IERpZmYgRWRpdG9yIERldGFpbHMnLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5Lm9wdGlvblxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UgfSkgPT4gKHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KHJlc291cmNlLCBESUZGX0FTU09DSUFUSU9OX0lOUFVUX0lELCBkaXNwb3NhYmxlcykgfSksXG5cdFx0XHRcdGNyZWF0ZURpZmZFZGl0b3JJbnB1dDogKHsgbW9kaWZpZWQsIG9yaWdpbmFsIH0pID0+IHtcblx0XHRcdFx0XHRkaWZmQXNzb2NpYXRpb25EaWZmQ291bnRlcisrO1xuXHRcdFx0XHRcdHJldHVybiB7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZURpZmZFZGl0b3JJbnB1dChhY2Nlc3Nvciwgb3JpZ2luYWwsIG1vZGlmaWVkLCBESUZGX0FTU09DSUFUSU9OX0lOUFVUX0lEKSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGNvbnN0IGRpZmZSZXNvbHV0aW9uID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yKHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkuZmlsZSgncmVzb3VyY2UtYmFzaWNzLnRlc3QtZGlmZi1hc3NvY2lhdGlvbicpIH0sXG5cdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ3Jlc291cmNlLWJhc2ljcy50ZXN0LWRpZmYtYXNzb2NpYXRpb24nKSB9XG5cdFx0fSwgcGFydC5hY3RpdmVHcm91cCk7XG5cdFx0YXNzZXJ0Lm9rKGRpZmZSZXNvbHV0aW9uKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodHlwZW9mIGRpZmZSZXNvbHV0aW9uLCAnbnVtYmVyJyk7XG5cdFx0aWYgKGRpZmZSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5BQk9SVCAmJiBkaWZmUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvckFzc29jaWF0aW9uRGlmZkNvdW50ZXIsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZBc3NvY2lhdGlvbkRpZmZDb3VudGVyLCAxKTtcblx0XHRcdGRpZmZSZXNvbHV0aW9uLmVkaXRvci5kaXNwb3NlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5mYWlsKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yUmVzb2x1dGlvbiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUVkaXRvcih7IHJlc291cmNlOiBVUkkuZmlsZSgncmVzb3VyY2UtYmFzaWNzLnRlc3QtZGlmZi1hc3NvY2lhdGlvbicpIH0sIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdGFzc2VydC5vayhlZGl0b3JSZXNvbHV0aW9uKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodHlwZW9mIGVkaXRvclJlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAoZWRpdG9yUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuQUJPUlQgJiYgZWRpdG9yUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvclJlc29sdXRpb24uZWRpdG9yLnR5cGVJZCwgRURJVE9SX0FTU09DSUFUSU9OX0lOUFVUX0lEKTtcblx0XHRcdGVkaXRvclJlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LmZhaWwoKTtcblx0XHR9XG5cblx0XHRlZGl0b3JBc3NvY2lhdGlvblJlZ2lzdGVyZWRFZGl0b3IuZGlzcG9zZSgpO1xuXHRcdGRpZmZBc3NvY2lhdGlvblJlZ2lzdGVyZWRFZGl0b3IuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdFZGl0b3IgUmVzb2x2ZSAtIGVkaXRvckFzc29jaWF0aW9ucyBvbmx5IHNlbGVjdCBhbiBgZXhwbGljaXRgIGVkaXRvciBpbiB0aGUgYXNzb2NpYXRlZCBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IERFRkFVTFRfRElGRl9JTlBVVF9JRCA9ICd0ZXN0RGVmYXVsdERpZmZJbnB1dCc7XG5cdFx0Y29uc3QgRVhQTElDSVRfRElGRl9JTlBVVF9JRCA9ICd0ZXN0RXhwbGljaXREaWZmSW5wdXQnO1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHRbZWRpdG9yc0Fzc29jaWF0aW9uc1NldHRpbmdJZF06IHtcblx0XHRcdFx0XHQnKi50ZXN0LWV4cGxpY2l0LWRpZmYnOiAnRVhQTElDSVRfRElGRl9FRElUT1InXG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0fSwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlLCBhY2Nlc3Nvcl0gPSBhd2FpdCBjcmVhdGVFZGl0b3JSZXNvbHZlclNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGxldCBkZWZhdWx0RGlmZkNvdW50ZXIgPSAwO1xuXHRcdGxldCBleHBsaWNpdERpZmZDb3VudGVyID0gMDtcblxuXHRcdGNvbnN0IGRlZmF1bHRSZWdpc3RlcmVkRWRpdG9yID0gc2VydmljZS5yZWdpc3RlckVkaXRvcignKicsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnZGVmYXVsdCcsXG5cdFx0XHRcdGxhYmVsOiAnRGVmYXVsdCBFZGl0b3InLFxuXHRcdFx0XHRkZXRhaWw6ICdEZWZhdWx0Jyxcblx0XHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5idWlsdGluXG5cdFx0XHR9LFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiAoeyByZXNvdXJjZSB9KSA9PiAoeyBlZGl0b3I6IGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQocmVzb3VyY2UsIFRFU1RfRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcykgfSksXG5cdFx0XHRcdGNyZWF0ZURpZmZFZGl0b3JJbnB1dDogKHsgbW9kaWZpZWQsIG9yaWdpbmFsIH0pID0+IHtcblx0XHRcdFx0XHRkZWZhdWx0RGlmZkNvdW50ZXIrKztcblx0XHRcdFx0XHRyZXR1cm4geyBlZGl0b3I6IGNvbnN0cnVjdERpc3Bvc2FibGVEaWZmRWRpdG9ySW5wdXQoYWNjZXNzb3IsIG9yaWdpbmFsLCBtb2RpZmllZCwgREVGQVVMVF9ESUZGX0lOUFVUX0lEKSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGNvbnN0IGV4cGxpY2l0RGlmZlJlZ2lzdGVyZWRFZGl0b3IgPSBzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqLnRlc3QtZXhwbGljaXQtZGlmZicsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnRVhQTElDSVRfRElGRl9FRElUT1InLFxuXHRcdFx0XHRsYWJlbDogJ0V4cGxpY2l0IERpZmYgRWRpdG9yIExhYmVsJyxcblx0XHRcdFx0ZGV0YWlsOiAnRXhwbGljaXQgRGlmZiBFZGl0b3IgRGV0YWlscycsXG5cdFx0XHRcdHByaW9yaXR5OiB7XG5cdFx0XHRcdFx0ZWRpdG9yOiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZXhwbGljaXQsXG5cdFx0XHRcdFx0ZGlmZjogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmV4cGxpY2l0XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlIH0pID0+ICh7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChyZXNvdXJjZSwgRVhQTElDSVRfRElGRl9JTlBVVF9JRCwgZGlzcG9zYWJsZXMpIH0pLFxuXHRcdFx0XHRjcmVhdGVEaWZmRWRpdG9ySW5wdXQ6ICh7IG1vZGlmaWVkLCBvcmlnaW5hbCB9KSA9PiB7XG5cdFx0XHRcdFx0ZXhwbGljaXREaWZmQ291bnRlcisrO1xuXHRcdFx0XHRcdHJldHVybiB7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZURpZmZFZGl0b3JJbnB1dChhY2Nlc3Nvciwgb3JpZ2luYWwsIG1vZGlmaWVkLCBFWFBMSUNJVF9ESUZGX0lOUFVUX0lEKSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdC8vIFRoZSB0ZXh0LW1vZGUgYXNzb2NpYXRpb24gZG9lcyBub3Qgb3B0IHRoZSBlZGl0b3IgaW50byBkaWZmIG1vZGUuXG5cdFx0Y29uc3QgZGlmZlJlc29sdXRpb24gPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVFZGl0b3Ioe1xuXHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdyZXNvdXJjZS1iYXNpY3MudGVzdC1leHBsaWNpdC1kaWZmJykgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBVUkkuZmlsZSgncmVzb3VyY2UtYmFzaWNzLnRlc3QtZXhwbGljaXQtZGlmZicpIH1cblx0XHR9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2soZGlmZlJlc29sdXRpb24pO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0eXBlb2YgZGlmZlJlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAoZGlmZlJlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIGRpZmZSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5OT05FKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhwbGljaXREaWZmQ291bnRlciwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmYXVsdERpZmZDb3VudGVyLCAxKTtcblx0XHRcdGRpZmZSZXNvbHV0aW9uLmVkaXRvci5kaXNwb3NlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5mYWlsKCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWRpdG9yUmVzb2x1dGlvbiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUVkaXRvcih7IHJlc291cmNlOiBVUkkuZmlsZSgncmVzb3VyY2UtYmFzaWNzLnRlc3QtZXhwbGljaXQtZGlmZicpIH0sIHBhcnQuYWN0aXZlR3JvdXApO1xuXHRcdGFzc2VydC5vayhlZGl0b3JSZXNvbHV0aW9uKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodHlwZW9mIGVkaXRvclJlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAoZWRpdG9yUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuQUJPUlQgJiYgZWRpdG9yUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvclJlc29sdXRpb24uZWRpdG9yLnR5cGVJZCwgRVhQTElDSVRfRElGRl9JTlBVVF9JRCk7XG5cdFx0XHRlZGl0b3JSZXNvbHV0aW9uLmVkaXRvci5kaXNwb3NlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5mYWlsKCk7XG5cdFx0fVxuXG5cdFx0ZGVmYXVsdFJlZ2lzdGVyZWRFZGl0b3IuZGlzcG9zZSgpO1xuXHRcdGV4cGxpY2l0RGlmZlJlZ2lzdGVyZWRFZGl0b3IuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdEaWZmIGVkaXRvciBSZXNvbHZlIC0gZGlmZkVkaXRvckFzc29jaWF0aW9ucyBzZWxlY3QgYW4gYGV4cGxpY2l0YCBkaWZmIGVkaXRvcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBERUZBVUxUX0RJRkZfSU5QVVRfSUQgPSAndGVzdERlZmF1bHREaWZmSW5wdXQnO1xuXHRcdGNvbnN0IEVYUExJQ0lUX0RJRkZfSU5QVVRfSUQgPSAndGVzdEV4cGxpY2l0RGlmZklucHV0Jztcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiAoKSA9PiBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0W2RpZmZFZGl0b3JzQXNzb2NpYXRpb25zU2V0dGluZ0lkXToge1xuXHRcdFx0XHRcdCcqLnRlc3QtZXhwbGljaXQtZGlmZic6ICdFWFBMSUNJVF9ESUZGX0VESVRPUidcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHR9LCBkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2UsIGFjY2Vzc29yXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclJlc29sdmVyU2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZSk7XG5cdFx0bGV0IGRlZmF1bHREaWZmQ291bnRlciA9IDA7XG5cdFx0bGV0IGV4cGxpY2l0RGlmZkNvdW50ZXIgPSAwO1xuXG5cdFx0Y29uc3QgZGVmYXVsdFJlZ2lzdGVyZWRFZGl0b3IgPSBzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqJyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdkZWZhdWx0Jyxcblx0XHRcdFx0bGFiZWw6ICdEZWZhdWx0IEVkaXRvcicsXG5cdFx0XHRcdGRldGFpbDogJ0RlZmF1bHQnLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmJ1aWx0aW5cblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlIH0pID0+ICh7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChyZXNvdXJjZSwgVEVTVF9FRElUT1JfSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSB9KSxcblx0XHRcdFx0Y3JlYXRlRGlmZkVkaXRvcklucHV0OiAoeyBtb2RpZmllZCwgb3JpZ2luYWwgfSkgPT4ge1xuXHRcdFx0XHRcdGRlZmF1bHREaWZmQ291bnRlcisrO1xuXHRcdFx0XHRcdHJldHVybiB7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZURpZmZFZGl0b3JJbnB1dChhY2Nlc3Nvciwgb3JpZ2luYWwsIG1vZGlmaWVkLCBERUZBVUxUX0RJRkZfSU5QVVRfSUQpIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Y29uc3QgZXhwbGljaXREaWZmUmVnaXN0ZXJlZEVkaXRvciA9IHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyoudGVzdC1leHBsaWNpdC1kaWZmJyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdFWFBMSUNJVF9ESUZGX0VESVRPUicsXG5cdFx0XHRcdGxhYmVsOiAnRXhwbGljaXQgRGlmZiBFZGl0b3IgTGFiZWwnLFxuXHRcdFx0XHRkZXRhaWw6ICdFeHBsaWNpdCBEaWZmIEVkaXRvciBEZXRhaWxzJyxcblx0XHRcdFx0cHJpb3JpdHk6IHtcblx0XHRcdFx0XHRlZGl0b3I6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5vcHRpb24sXG5cdFx0XHRcdFx0ZGlmZjogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmV4cGxpY2l0XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlIH0pID0+ICh7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChyZXNvdXJjZSwgRVhQTElDSVRfRElGRl9JTlBVVF9JRCwgZGlzcG9zYWJsZXMpIH0pLFxuXHRcdFx0XHRjcmVhdGVEaWZmRWRpdG9ySW5wdXQ6ICh7IG1vZGlmaWVkLCBvcmlnaW5hbCB9KSA9PiB7XG5cdFx0XHRcdFx0ZXhwbGljaXREaWZmQ291bnRlcisrO1xuXHRcdFx0XHRcdHJldHVybiB7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZURpZmZFZGl0b3JJbnB1dChhY2Nlc3Nvciwgb3JpZ2luYWwsIG1vZGlmaWVkLCBFWFBMSUNJVF9ESUZGX0lOUFVUX0lEKSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGNvbnN0IGRpZmZSZXNvbHV0aW9uID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yKHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkuZmlsZSgncmVzb3VyY2UtYmFzaWNzLnRlc3QtZXhwbGljaXQtZGlmZicpIH0sXG5cdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ3Jlc291cmNlLWJhc2ljcy50ZXN0LWV4cGxpY2l0LWRpZmYnKSB9XG5cdFx0fSwgcGFydC5hY3RpdmVHcm91cCk7XG5cdFx0YXNzZXJ0Lm9rKGRpZmZSZXNvbHV0aW9uKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodHlwZW9mIGRpZmZSZXNvbHV0aW9uLCAnbnVtYmVyJyk7XG5cdFx0aWYgKGRpZmZSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5BQk9SVCAmJiBkaWZmUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmF1bHREaWZmQ291bnRlciwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhwbGljaXREaWZmQ291bnRlciwgMSk7XG5cdFx0XHRkaWZmUmVzb2x1dGlvbi5lZGl0b3IuZGlzcG9zZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuZmFpbCgpO1xuXHRcdH1cblxuXHRcdGRlZmF1bHRSZWdpc3RlcmVkRWRpdG9yLmRpc3Bvc2UoKTtcblx0XHRleHBsaWNpdERpZmZSZWdpc3RlcmVkRWRpdG9yLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0QmluYXJ5RGlmZkZhbGxiYWNrRWRpdG9yIHJldHVybnMgYSBkaWZmLWNhcGFibGUgYGV4cGxpY2l0YCBlZGl0b3IgYW5kIGlnbm9yZXMgbm9uLWRpZmYgZWRpdG9ycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbLCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclJlc29sdmVyU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgZXhwbGljaXRXaXRoRGlmZiA9IHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyouYmluJyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdCSU5BUllfRURJVE9SJyxcblx0XHRcdFx0bGFiZWw6ICdCaW5hcnkgRWRpdG9yJyxcblx0XHRcdFx0ZGV0YWlsOiAnQmluYXJ5IEVkaXRvciBEZXRhaWxzJyxcblx0XHRcdFx0cHJpb3JpdHk6IHtcblx0XHRcdFx0XHRlZGl0b3I6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5kZWZhdWx0LFxuXHRcdFx0XHRcdGRpZmY6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5leHBsaWNpdFxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiAoeyByZXNvdXJjZSB9KSA9PiAoeyBlZGl0b3I6IGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQocmVzb3VyY2UsICdiaW5hcnlJbnB1dCcsIGRpc3Bvc2FibGVzKSB9KSxcblx0XHRcdFx0Y3JlYXRlRGlmZkVkaXRvcklucHV0OiAoeyBtb2RpZmllZCwgb3JpZ2luYWwgfSkgPT4gKHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KG1vZGlmaWVkLnJlc291cmNlID8/IG9yaWdpbmFsLnJlc291cmNlISwgJ2JpbmFyeURpZmZJbnB1dCcsIGRpc3Bvc2FibGVzKSB9KVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHQvLyBBIGN1c3RvbSBlZGl0b3IgdGhhdCBwcm92aWRlcyBubyBkaWZmIGZhY3RvcnkgbXVzdCBuZXZlciBiZSB1c2VkIGFzIGEgYmluYXJ5IGRpZmYgZmFsbGJhY2suXG5cdFx0Y29uc3Qgbm9EaWZmID0gc2VydmljZS5yZWdpc3RlckVkaXRvcignKi5ub0RpZmYnLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ05PX0RJRkZfRURJVE9SJyxcblx0XHRcdFx0bGFiZWw6ICdObyBEaWZmIEVkaXRvcicsXG5cdFx0XHRcdGRldGFpbDogJ05vIERpZmYgRWRpdG9yIERldGFpbHMnLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmRlZmF1bHRcblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlIH0pID0+ICh7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChyZXNvdXJjZSwgJ25vRGlmZklucHV0JywgZGlzcG9zYWJsZXMpIH0pXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEJpbmFyeURpZmZGYWxsYmFja0VkaXRvcihVUkkuZmlsZSgnZmlsZS5iaW4nKSksICdCSU5BUllfRURJVE9SJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0QmluYXJ5RGlmZkZhbGxiYWNrRWRpdG9yKFVSSS5maWxlKCdmaWxlLm5vRGlmZicpKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRCaW5hcnlEaWZmRmFsbGJhY2tFZGl0b3IoVVJJLmZpbGUoJ2ZpbGUudW5yZWxhdGVkJykpLCB1bmRlZmluZWQpO1xuXG5cdFx0ZXhwbGljaXRXaXRoRGlmZi5kaXNwb3NlKCk7XG5cdFx0bm9EaWZmLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnRGlmZiBlZGl0b3IgUmVzb2x2ZSAtIERpZmZlcmVudCBUeXBlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbcGFydCwgc2VydmljZSwgYWNjZXNzb3JdID0gYXdhaXQgY3JlYXRlRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlKCk7XG5cdFx0bGV0IGRpZmZPbmVDb3VudGVyID0gMDtcblx0XHRsZXQgZGlmZlR3b0NvdW50ZXIgPSAwO1xuXHRcdGxldCBkZWZhdWx0RGlmZkNvdW50ZXIgPSAwO1xuXHRcdGNvbnN0IHJlZ2lzdGVyZWRFZGl0b3IgPSBzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqLnRlc3QtZGlmZicsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnVEVTVF9FRElUT1InLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgRWRpdG9yIExhYmVsJyxcblx0XHRcdFx0ZGV0YWlsOiAnVGVzdCBFZGl0b3IgRGV0YWlscycsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZGVmYXVsdFxuXHRcdFx0fSxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVFZGl0b3JJbnB1dDogKHsgcmVzb3VyY2UsIG9wdGlvbnMgfSwgZ3JvdXApID0+ICh7IGVkaXRvcjogY29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UocmVzb3VyY2UudG9TdHJpbmcoKSksIFRFU1RfRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcykgfSksXG5cdFx0XHRcdGNyZWF0ZURpZmZFZGl0b3JJbnB1dDogKHsgbW9kaWZpZWQsIG9yaWdpbmFsLCBvcHRpb25zIH0sIGdyb3VwKSA9PiB7XG5cdFx0XHRcdFx0ZGlmZk9uZUNvdW50ZXIrKztcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZWRpdG9yOiBhY2Nlc3Nvci5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRcdFx0RGlmZkVkaXRvcklucHV0LFxuXHRcdFx0XHRcdFx0XHQnbmFtZScsXG5cdFx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbicsXG5cdFx0XHRcdFx0XHRcdGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKG9yaWdpbmFsLnRvU3RyaW5nKCkpLCBURVNUX0VESVRPUl9JTlBVVF9JRCwgZGlzcG9zYWJsZXMpLFxuXHRcdFx0XHRcdFx0XHRjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShtb2RpZmllZC50b1N0cmluZygpKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSxcblx0XHRcdFx0XHRcdFx0dW5kZWZpbmVkKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Y29uc3Qgc2Vjb25kUmVnaXN0ZXJlZEVkaXRvciA9IHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyoudGVzdC1zZWNvbmREaWZmJyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdURVNUX0VESVRPUl8yJyxcblx0XHRcdFx0bGFiZWw6ICdUZXN0IEVkaXRvciBMYWJlbCcsXG5cdFx0XHRcdGRldGFpbDogJ1Rlc3QgRWRpdG9yIERldGFpbHMnLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmRlZmF1bHRcblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlLCBvcHRpb25zIH0sIGdyb3VwKSA9PiAoeyBlZGl0b3I6IG5ldyBUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShyZXNvdXJjZS50b1N0cmluZygpKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpIH0pLFxuXHRcdFx0XHRjcmVhdGVEaWZmRWRpdG9ySW5wdXQ6ICh7IG1vZGlmaWVkLCBvcmlnaW5hbCwgb3B0aW9ucyB9LCBncm91cCkgPT4ge1xuXHRcdFx0XHRcdGRpZmZUd29Db3VudGVyKys7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGVkaXRvcjogYWNjZXNzb3IuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0XHRcdERpZmZFZGl0b3JJbnB1dCxcblx0XHRcdFx0XHRcdFx0J25hbWUnLFxuXHRcdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdFx0XHRjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShvcmlnaW5hbC50b1N0cmluZygpKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSxcblx0XHRcdFx0XHRcdFx0Y29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UobW9kaWZpZWQudG9TdHJpbmcoKSksIFRFU1RfRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcyksXG5cdFx0XHRcdFx0XHRcdHVuZGVmaW5lZClcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGNvbnN0IGRlZmF1bHRSZWdpc3RlcmVkRWRpdG9yID0gc2VydmljZS5yZWdpc3RlckVkaXRvcignKicsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnZGVmYXVsdCcsXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCBFZGl0b3IgTGFiZWwnLFxuXHRcdFx0XHRkZXRhaWw6ICdUZXN0IEVkaXRvciBEZXRhaWxzJyxcblx0XHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5vcHRpb25cblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlLCBvcHRpb25zIH0sIGdyb3VwKSA9PiAoeyBlZGl0b3I6IG5ldyBUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShyZXNvdXJjZS50b1N0cmluZygpKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpIH0pLFxuXHRcdFx0XHRjcmVhdGVEaWZmRWRpdG9ySW5wdXQ6ICh7IG1vZGlmaWVkLCBvcmlnaW5hbCwgb3B0aW9ucyB9LCBncm91cCkgPT4ge1xuXHRcdFx0XHRcdGRlZmF1bHREaWZmQ291bnRlcisrO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRlZGl0b3I6IGFjY2Vzc29yLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdFx0XHREaWZmRWRpdG9ySW5wdXQsXG5cdFx0XHRcdFx0XHRcdCduYW1lJyxcblx0XHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJyxcblx0XHRcdFx0XHRcdFx0Y29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2Uob3JpZ2luYWwudG9TdHJpbmcoKSksIFRFU1RfRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcyksXG5cdFx0XHRcdFx0XHRcdGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKG1vZGlmaWVkLnRvU3RyaW5nKCkpLCBURVNUX0VESVRPUl9JTlBVVF9JRCwgZGlzcG9zYWJsZXMpLFxuXHRcdFx0XHRcdFx0XHR1bmRlZmluZWQpXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRsZXQgcmVzdWx0aW5nUmVzb2x1dGlvbiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUVkaXRvcih7XG5cdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UtYmFzaWNzLnRlc3QtZGlmZicpIH0sXG5cdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UtYmFzaWNzLnRlc3QtZGlmZicpIH1cblx0XHR9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2socmVzdWx0aW5nUmVzb2x1dGlvbik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHRpbmdSZXNvbHV0aW9uLCAnbnVtYmVyJyk7XG5cdFx0aWYgKHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmT25lQ291bnRlciwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlR3b0NvdW50ZXIsIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmF1bHREaWZmQ291bnRlciwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0aW5nUmVzb2x1dGlvbi5lZGl0b3IudHlwZUlkLCAnd29ya2JlbmNoLmVkaXRvcnMuZGlmZkVkaXRvcklucHV0Jyk7XG5cdFx0XHRyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci5kaXNwb3NlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5mYWlsKCk7XG5cdFx0fVxuXG5cdFx0cmVzdWx0aW5nUmVzb2x1dGlvbiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUVkaXRvcih7XG5cdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UtYmFzaWNzLnRlc3Qtc2Vjb25kRGlmZicpIH0sXG5cdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UtYmFzaWNzLnRlc3Qtc2Vjb25kRGlmZicpIH1cblx0XHR9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2socmVzdWx0aW5nUmVzb2x1dGlvbik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHRpbmdSZXNvbHV0aW9uLCAnbnVtYmVyJyk7XG5cdFx0aWYgKHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmT25lQ291bnRlciwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlR3b0NvdW50ZXIsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmF1bHREaWZmQ291bnRlciwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0aW5nUmVzb2x1dGlvbi5lZGl0b3IudHlwZUlkLCAnd29ya2JlbmNoLmVkaXRvcnMuZGlmZkVkaXRvcklucHV0Jyk7XG5cdFx0XHRyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci5kaXNwb3NlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5mYWlsKCk7XG5cdFx0fVxuXG5cdFx0cmVzdWx0aW5nUmVzb2x1dGlvbiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUVkaXRvcih7XG5cdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UtYmFzaWNzLnRlc3Qtc2Vjb25kRGlmZicpIH0sXG5cdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UtYmFzaWNzLnRlc3QtZGlmZicpIH1cblx0XHR9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2socmVzdWx0aW5nUmVzb2x1dGlvbik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHRpbmdSZXNvbHV0aW9uLCAnbnVtYmVyJyk7XG5cdFx0aWYgKHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmT25lQ291bnRlciwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlR3b0NvdW50ZXIsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmF1bHREaWZmQ291bnRlciwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0aW5nUmVzb2x1dGlvbi5lZGl0b3IudHlwZUlkLCAnd29ya2JlbmNoLmVkaXRvcnMuZGlmZkVkaXRvcklucHV0Jyk7XG5cdFx0XHRyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci5kaXNwb3NlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5mYWlsKCk7XG5cdFx0fVxuXG5cdFx0cmVzdWx0aW5nUmVzb2x1dGlvbiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUVkaXRvcih7XG5cdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UtYmFzaWNzLnRlc3QtZGlmZicpIH0sXG5cdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UtYmFzaWNzLnRlc3Qtc2Vjb25kRGlmZicpIH1cblx0XHR9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2socmVzdWx0aW5nUmVzb2x1dGlvbik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHRpbmdSZXNvbHV0aW9uLCAnbnVtYmVyJyk7XG5cdFx0aWYgKHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmT25lQ291bnRlciwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlR3b0NvdW50ZXIsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmF1bHREaWZmQ291bnRlciwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0aW5nUmVzb2x1dGlvbi5lZGl0b3IudHlwZUlkLCAnd29ya2JlbmNoLmVkaXRvcnMuZGlmZkVkaXRvcklucHV0Jyk7XG5cdFx0XHRyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci5kaXNwb3NlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5mYWlsKCk7XG5cdFx0fVxuXG5cdFx0cmVzdWx0aW5nUmVzb2x1dGlvbiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUVkaXRvcih7XG5cdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UtYmFzaWNzLnRlc3Qtc2Vjb25kRGlmZicpIH0sXG5cdFx0XHRtb2RpZmllZDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UtYmFzaWNzLnRlc3QtZGlmZicpIH0sXG5cdFx0XHRvcHRpb25zOiB7IG92ZXJyaWRlOiAnVEVTVF9FRElUT1InIH1cblx0XHR9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2socmVzdWx0aW5nUmVzb2x1dGlvbik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHRpbmdSZXNvbHV0aW9uLCAnbnVtYmVyJyk7XG5cdFx0aWYgKHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmT25lQ291bnRlciwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlR3b0NvdW50ZXIsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlZmF1bHREaWZmQ291bnRlciwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0aW5nUmVzb2x1dGlvbi5lZGl0b3IudHlwZUlkLCAnd29ya2JlbmNoLmVkaXRvcnMuZGlmZkVkaXRvcklucHV0Jyk7XG5cdFx0XHRyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci5kaXNwb3NlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFzc2VydC5mYWlsKCk7XG5cdFx0fVxuXG5cdFx0cmVnaXN0ZXJlZEVkaXRvci5kaXNwb3NlKCk7XG5cdFx0c2Vjb25kUmVnaXN0ZXJlZEVkaXRvci5kaXNwb3NlKCk7XG5cdFx0ZGVmYXVsdFJlZ2lzdGVyZWRFZGl0b3IuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdSZWdpc3RyeSAmIEV2ZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBbLCBzZXJ2aWNlXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclJlc29sdmVyU2VydmljZSgpO1xuXG5cdFx0bGV0IGV2ZW50Q291bnRlciA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2VFZGl0b3JSZWdpc3RyYXRpb25zKCgpID0+IHtcblx0XHRcdGV2ZW50Q291bnRlcisrO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGVkaXRvcnMgPSBzZXJ2aWNlLmdldEVkaXRvcnMoKTtcblxuXHRcdGNvbnN0IHJlZ2lzdGVyZWRFZGl0b3IgPSBzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqLnRlc3QnLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ1RFU1RfRURJVE9SJyxcblx0XHRcdFx0bGFiZWw6ICdUZXN0IEVkaXRvciBMYWJlbCcsXG5cdFx0XHRcdGRldGFpbDogJ1Rlc3QgRWRpdG9yIERldGFpbHMnLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmRlZmF1bHRcblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlLCBvcHRpb25zIH0sIGdyb3VwKSA9PiAoeyBlZGl0b3I6IG5ldyBUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShyZXNvdXJjZS50b1N0cmluZygpKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpIH0pXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudENvdW50ZXIsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmdldEVkaXRvcnMoKS5sZW5ndGgsIGVkaXRvcnMubGVuZ3RoICsgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RWRpdG9ycygpLnNvbWUoZWRpdG9yID0+IGVkaXRvci5pZCA9PT0gJ1RFU1RfRURJVE9SJyksIHRydWUpO1xuXG5cdFx0cmVnaXN0ZXJlZEVkaXRvci5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRDb3VudGVyLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5nZXRFZGl0b3JzKCkubGVuZ3RoLCBlZGl0b3JzLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0RWRpdG9ycygpLnNvbWUoZWRpdG9yID0+IGVkaXRvci5pZCA9PT0gJ1RFU1RfRURJVE9SJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnTXVsdGlwbGUgcmVnaXN0cmF0aW9ucyB0byBzYW1lIGdsb2IgYW5kIGlkICMxNTU4NTknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2UsIGFjY2Vzc29yXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclJlc29sdmVyU2VydmljZSgpO1xuXHRcdGNvbnN0IHRlc3RFZGl0b3JJbmZvID0ge1xuXHRcdFx0aWQ6ICdURVNUX0VESVRPUicsXG5cdFx0XHRsYWJlbDogJ1Rlc3QgRWRpdG9yIExhYmVsJyxcblx0XHRcdGRldGFpbDogJ1Rlc3QgRWRpdG9yIERldGFpbHMnLFxuXHRcdFx0cHJpb3JpdHk6IFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5kZWZhdWx0XG5cdFx0fTtcblx0XHRjb25zdCByZWdpc3RlcmVkU2luZ2xlRWRpdG9yID0gc2VydmljZS5yZWdpc3RlckVkaXRvcignKi50ZXN0Jyxcblx0XHRcdHRlc3RFZGl0b3JJbmZvLFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiAoeyByZXNvdXJjZSwgb3B0aW9ucyB9LCBncm91cCkgPT4gKHsgZWRpdG9yOiBuZXcgVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UocmVzb3VyY2UudG9TdHJpbmcoKSksIFRFU1RfRURJVE9SX0lOUFVUX0lEKSB9KVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHRjb25zdCByZWdpc3RlcmVkRGlmZkVkaXRvciA9IHNlcnZpY2UucmVnaXN0ZXJFZGl0b3IoJyoudGVzdCcsXG5cdFx0XHR0ZXN0RWRpdG9ySW5mbyxcblx0XHRcdHt9LFxuXHRcdFx0e1xuXHRcdFx0XHRjcmVhdGVEaWZmRWRpdG9ySW5wdXQ6ICh7IG1vZGlmaWVkLCBvcmlnaW5hbCwgb3B0aW9ucyB9LCBncm91cCkgPT4gKHtcblx0XHRcdFx0XHRlZGl0b3I6IGFjY2Vzc29yLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdFx0RGlmZkVkaXRvcklucHV0LFxuXHRcdFx0XHRcdFx0J25hbWUnLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJyxcblx0XHRcdFx0XHRcdGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKG9yaWdpbmFsLnRvU3RyaW5nKCkpLCBURVNUX0VESVRPUl9JTlBVVF9JRCwgZGlzcG9zYWJsZXMpLFxuXHRcdFx0XHRcdFx0Y29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UobW9kaWZpZWQudG9TdHJpbmcoKSksIFRFU1RfRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcyksXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQpXG5cdFx0XHRcdH0pXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdC8vIFJlc29sdmUgYSBkaWZmXG5cdFx0bGV0IHJlc3VsdGluZ1Jlc29sdXRpb24gPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVFZGl0b3Ioe1xuXHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdteTovL3Jlc291cmNlLWJhc2ljcy50ZXN0JykgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MudGVzdCcpIH1cblx0XHR9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2socmVzdWx0aW5nUmVzb2x1dGlvbik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHRpbmdSZXNvbHV0aW9uLCAnbnVtYmVyJyk7XG5cdFx0aWYgKHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci50eXBlSWQsICd3b3JrYmVuY2guZWRpdG9ycy5kaWZmRWRpdG9ySW5wdXQnKTtcblx0XHRcdHJlc3VsdGluZ1Jlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LmZhaWwoKTtcblx0XHR9XG5cblx0XHQvLyBSZW1vdmUgZGlmZiByZWdpc3RyYXRpb25cblx0XHRyZWdpc3RlcmVkRGlmZkVkaXRvci5kaXNwb3NlKCk7XG5cblx0XHQvLyBSZXNvbHZlIGEgZGlmZiBhZ2FpbiwgZXhwZWN0ZWQgZmFpbHVyZVxuXHRcdHJlc3VsdGluZ1Jlc29sdXRpb24gPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVFZGl0b3Ioe1xuXHRcdFx0b3JpZ2luYWw6IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdteTovL3Jlc291cmNlLWJhc2ljcy50ZXN0JykgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS1iYXNpY3MudGVzdCcpIH1cblx0XHR9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2socmVzdWx0aW5nUmVzb2x1dGlvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHRpbmdSZXNvbHV0aW9uLCAnbnVtYmVyJyk7XG5cdFx0aWYgKHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpIHtcblx0XHRcdGFzc2VydC5mYWlsKCk7XG5cdFx0fVxuXG5cdFx0cmVnaXN0ZXJlZFNpbmdsZUVkaXRvci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ1VzZXItY29uZmlndXJlZCBlZGl0b3IgYXNzb2NpYXRpb24gcmVzb2x2ZXMgb24gZmlyc3Qgc3RhcnR1cCB3aXRoIGVtcHR5IGNhY2hlICMyNDQ1OTcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgQ1VTVE9NX0VESVRPUl9JTlBVVF9JRCA9ICd0ZXN0Q3VzdG9tRWRpdG9ySW5wdXQnO1xuXG5cdFx0Ly8gU2V0IHVwIGEgY29uZmlndXJhdGlvbiB3aXRoIGEgdXNlci1jb25maWd1cmVkIGVkaXRvciBhc3NvY2lhdGlvblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uoe1xuXHRcdFx0XHRbZWRpdG9yc0Fzc29jaWF0aW9uc1NldHRpbmdJZF06IHtcblx0XHRcdFx0XHQnKi5tZCc6ICdDVVNUT01fTURfRURJVE9SJ1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdH0sIGRpc3Bvc2FibGVzKTtcblxuXHRcdGNvbnN0IHBhcnQgPSBhd2FpdCBjcmVhdGVFZGl0b3JQYXJ0KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yR3JvdXBzU2VydmljZSwgcGFydCk7XG5cblx0XHRjb25zdCBlZGl0b3JSZXNvbHZlclNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JSZXNvbHZlclNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChlZGl0b3JSZXNvbHZlclNlcnZpY2UpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgYm90aCB0aGUgZGVmYXVsdCB0ZXh0IGVkaXRvciBhbmQgdGhlIGN1c3RvbSBtYXJrZG93biBlZGl0b3Igd2l0aCAnb3B0aW9uJyBwcmlvcml0eVxuXHRcdC8vIChtYXRjaGluZyBob3cgbWFya2Rvd24gcHJldmlldyBpcyByZWdpc3RlcmVkIGluIHBhY2thZ2UuanNvbilcblx0XHRjb25zdCBkZWZhdWx0RWRpdG9yID0gZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqJyxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICdkZWZhdWx0Jyxcblx0XHRcdFx0bGFiZWw6ICdEZWZhdWx0IEVkaXRvcicsXG5cdFx0XHRcdGRldGFpbDogJ0RlZmF1bHQnLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmRlZmF1bHRcblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlIH0sIGdyb3VwKSA9PiAoeyBlZGl0b3I6IG5ldyBUZXN0RmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShyZXNvdXJjZS50b1N0cmluZygpKSwgVEVTVF9FRElUT1JfSU5QVVRfSUQpIH0pXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdGNvbnN0IGN1c3RvbUVkaXRvciA9IGVkaXRvclJlc29sdmVyU2VydmljZS5yZWdpc3RlckVkaXRvcignKi5tZCcsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnQ1VTVE9NX01EX0VESVRPUicsXG5cdFx0XHRcdGxhYmVsOiAnTWFya2Rvd24gUHJldmlldycsXG5cdFx0XHRcdGRldGFpbDogJ01hcmtkb3duIFByZXZpZXcgRGV0YWlscycsXG5cdFx0XHRcdHByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkub3B0aW9uXG5cdFx0XHR9LFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiAoeyByZXNvdXJjZSB9LCBncm91cCkgPT4gKHsgZWRpdG9yOiBuZXcgVGVzdEZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2UocmVzb3VyY2UudG9TdHJpbmcoKSksIENVU1RPTV9FRElUT1JfSU5QVVRfSUQpIH0pXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdC8vIFJlc29sdmUgYSAubWQgZmlsZSAtIHNob3VsZCB1c2UgdGhlIGN1c3RvbSBlZGl0b3IgZHVlIHRvIHVzZXIgYXNzb2NpYXRpb25cblx0XHRjb25zdCByZXN1bHRpbmdSZXNvbHV0aW9uID0gYXdhaXQgZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlLnJlc29sdmVFZGl0b3IoXG5cdFx0XHR7IHJlc291cmNlOiBVUkkuZmlsZSgndGVzdC5tZCcpIH0sXG5cdFx0XHRwYXJ0LmFjdGl2ZUdyb3VwXG5cdFx0KTtcblx0XHRhc3NlcnQub2socmVzdWx0aW5nUmVzb2x1dGlvbik7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHR5cGVvZiByZXN1bHRpbmdSZXNvbHV0aW9uLCAnbnVtYmVyJyk7XG5cdFx0aWYgKHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIHJlc3VsdGluZ1Jlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLk5PTkUpIHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRpbmdSZXNvbHV0aW9uLmVkaXRvci50eXBlSWQsIENVU1RPTV9FRElUT1JfSU5QVVRfSUQsXG5cdFx0XHRcdCdTaG91bGQgcmVzb2x2ZSB0byBjdXN0b20gZWRpdG9yIHdoZW4gdXNlciBoYXMgY29uZmlndXJlZCBlZGl0b3IgYXNzb2NpYXRpb24nKTtcblx0XHRcdHJlc3VsdGluZ1Jlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ0V4cGVjdGVkIGVkaXRvciB0byByZXNvbHZlIHN1Y2Nlc3NmdWxseScpO1xuXHRcdH1cblxuXHRcdGRlZmF1bHRFZGl0b3IuZGlzcG9zZSgpO1xuXHRcdGN1c3RvbUVkaXRvci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0RpZmYgZWRpdG9yIFJlc29sdmUgLSBwcmlvcml0eS5kaWZmIG92ZXJyaWRlcyBwcmlvcml0eS5lZGl0b3IgZm9yIGRpZmZzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IENVU1RPTV9FRElUT1JfSU5QVVRfSUQgPSAndGVzdEN1c3RvbUVkaXRvckZvckRpZmZQcmlvcml0eSc7XG5cdFx0Y29uc3QgW3BhcnQsIHNlcnZpY2UsIGFjY2Vzc29yXSA9IGF3YWl0IGNyZWF0ZUVkaXRvclJlc29sdmVyU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZ2lzdGVyZWRFZGl0b3IgPSBzZXJ2aWNlLnJlZ2lzdGVyRWRpdG9yKCcqLnRlc3QtZGlmZi1wcmlvcml0eScsXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnVEVTVF9FRElUT1InLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgRWRpdG9yIExhYmVsJyxcblx0XHRcdFx0ZGV0YWlsOiAnVGVzdCBFZGl0b3IgRGV0YWlscycsXG5cdFx0XHRcdHByaW9yaXR5OiB7XG5cdFx0XHRcdFx0ZWRpdG9yOiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZGVmYXVsdCxcblx0XHRcdFx0XHRkaWZmOiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkub3B0aW9uLFxuXHRcdFx0XHRcdG1lcmdlOiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuZGVmYXVsdCxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR7fSxcblx0XHRcdHtcblx0XHRcdFx0Y3JlYXRlRWRpdG9ySW5wdXQ6ICh7IHJlc291cmNlLCBvcHRpb25zIH0sIGdyb3VwKSA9PiAoeyBlZGl0b3I6IGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKHJlc291cmNlLnRvU3RyaW5nKCkpLCBDVVNUT01fRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcykgfSksXG5cdFx0XHRcdGNyZWF0ZURpZmZFZGl0b3JJbnB1dDogKHsgbW9kaWZpZWQsIG9yaWdpbmFsLCBvcHRpb25zIH0sIGdyb3VwKSA9PiAoe1xuXHRcdFx0XHRcdGVkaXRvcjogYWNjZXNzb3IuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0XHRcdFx0XHREaWZmRWRpdG9ySW5wdXQsXG5cdFx0XHRcdFx0XHQnbmFtZScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRcdFx0Y29uc3RydWN0RGlzcG9zYWJsZUZpbGVFZGl0b3JJbnB1dChVUkkucGFyc2Uob3JpZ2luYWwudG9TdHJpbmcoKSksIENVU1RPTV9FRElUT1JfSU5QVVRfSUQsIGRpc3Bvc2FibGVzKSxcblx0XHRcdFx0XHRcdGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKG1vZGlmaWVkLnRvU3RyaW5nKCkpLCBDVVNUT01fRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcyksXG5cdFx0XHRcdFx0XHR1bmRlZmluZWQpXG5cdFx0XHRcdH0pXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdC8vIFJlZ3VsYXIgZWRpdG9yIHNob3VsZCB1c2UgY3VzdG9tIGVkaXRvciAocHJpb3JpdHkuZWRpdG9yOiBkZWZhdWx0KVxuXHRcdGNvbnN0IGVkaXRvclJlc29sdXRpb24gPSBhd2FpdCBzZXJ2aWNlLnJlc29sdmVFZGl0b3IoeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UudGVzdC1kaWZmLXByaW9yaXR5JykgfSwgcGFydC5hY3RpdmVHcm91cCk7XG5cdFx0YXNzZXJ0Lm9rKGVkaXRvclJlc29sdXRpb24pO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0eXBlb2YgZWRpdG9yUmVzb2x1dGlvbiwgJ251bWJlcicpO1xuXHRcdGlmIChlZGl0b3JSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5BQk9SVCAmJiBlZGl0b3JSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5OT05FKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yUmVzb2x1dGlvbi5lZGl0b3IudHlwZUlkLCBDVVNUT01fRURJVE9SX0lOUFVUX0lEKTtcblx0XHRcdGVkaXRvclJlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ0V4cGVjdGVkIGVkaXRvciB0byByZXNvbHZlIHN1Y2Nlc3NmdWxseScpO1xuXHRcdH1cblxuXHRcdC8vIERpZmYgZWRpdG9yIHNob3VsZCBOT1QgdXNlIGN1c3RvbSBlZGl0b3IgKHByaW9yaXR5LmRpZmY6IG9wdGlvbilcblx0XHRjb25zdCBkaWZmUmVzb2x1dGlvbiA9IGF3YWl0IHNlcnZpY2UucmVzb2x2ZUVkaXRvcih7XG5cdFx0XHRvcmlnaW5hbDogeyByZXNvdXJjZTogVVJJLmZpbGUoJ215Oi8vcmVzb3VyY2UudGVzdC1kaWZmLXByaW9yaXR5JykgfSxcblx0XHRcdG1vZGlmaWVkOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS50ZXN0LWRpZmYtcHJpb3JpdHknKSB9XG5cdFx0fSwgcGFydC5hY3RpdmVHcm91cCk7XG5cdFx0YXNzZXJ0Lm9rKGRpZmZSZXNvbHV0aW9uKTtcblx0XHQvLyBXaXRoIHByaW9yaXR5LmRpZmY6IG9wdGlvbiwgdGhlIGN1c3RvbSBlZGl0b3Igc2hvdWxkIG5vdCBiZSBzZWxlY3RlZCBhcyBkZWZhdWx0XG5cdFx0aWYgKGRpZmZSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5BQk9SVCAmJiBkaWZmUmVzb2x1dGlvbiAhPT0gUmVzb2x2ZWRTdGF0dXMuTk9ORSkge1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGRpZmZSZXNvbHV0aW9uLmVkaXRvci50eXBlSWQsIENVU1RPTV9FRElUT1JfSU5QVVRfSUQsXG5cdFx0XHRcdCdDdXN0b20gZWRpdG9yIHdpdGggcHJpb3JpdHkuZGlmZjpvcHRpb24gc2hvdWxkIG5vdCBiZSB1c2VkIGZvciBkaWZmcycpO1xuXHRcdFx0ZGlmZlJlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9XG5cblx0XHRyZWdpc3RlcmVkRWRpdG9yLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnRGlmZiBlZGl0b3IgUmVzb2x2ZSAtIHN0cmluZyBwcmlvcml0eSBleHBhbmRzIHRvIGRpZmYgcHJpb3JpdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgQ1VTVE9NX0VESVRPUl9JTlBVVF9JRCA9ICd0ZXN0Q3VzdG9tRWRpdG9yTm9EaWZmUHJpb3JpdHknO1xuXHRcdGNvbnN0IFtwYXJ0LCBzZXJ2aWNlLCBhY2Nlc3Nvcl0gPSBhd2FpdCBjcmVhdGVFZGl0b3JSZXNvbHZlclNlcnZpY2UoKTtcblx0XHRjb25zdCByZWdpc3RlcmVkRWRpdG9yID0gc2VydmljZS5yZWdpc3RlckVkaXRvcignKi50ZXN0LW5vLWRpZmYtcHJpb3JpdHknLFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ1RFU1RfRURJVE9SJyxcblx0XHRcdFx0bGFiZWw6ICdUZXN0IEVkaXRvciBMYWJlbCcsXG5cdFx0XHRcdGRldGFpbDogJ1Rlc3QgRWRpdG9yIERldGFpbHMnLFxuXHRcdFx0XHRwcmlvcml0eTogUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5LmRlZmF1bHQsXG5cdFx0XHR9LFxuXHRcdFx0e30sXG5cdFx0XHR7XG5cdFx0XHRcdGNyZWF0ZUVkaXRvcklucHV0OiAoeyByZXNvdXJjZSwgb3B0aW9ucyB9LCBncm91cCkgPT4gKHsgZWRpdG9yOiBjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShyZXNvdXJjZS50b1N0cmluZygpKSwgQ1VTVE9NX0VESVRPUl9JTlBVVF9JRCwgZGlzcG9zYWJsZXMpIH0pLFxuXHRcdFx0XHRjcmVhdGVEaWZmRWRpdG9ySW5wdXQ6ICh7IG1vZGlmaWVkLCBvcmlnaW5hbCwgb3B0aW9ucyB9LCBncm91cCkgPT4gKHtcblx0XHRcdFx0XHRlZGl0b3I6IGFjY2Vzc29yLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdFx0RGlmZkVkaXRvcklucHV0LFxuXHRcdFx0XHRcdFx0J25hbWUnLFxuXHRcdFx0XHRcdFx0J2Rlc2NyaXB0aW9uJyxcblx0XHRcdFx0XHRcdGNvbnN0cnVjdERpc3Bvc2FibGVGaWxlRWRpdG9ySW5wdXQoVVJJLnBhcnNlKG9yaWdpbmFsLnRvU3RyaW5nKCkpLCBDVVNUT01fRURJVE9SX0lOUFVUX0lELCBkaXNwb3NhYmxlcyksXG5cdFx0XHRcdFx0XHRjb25zdHJ1Y3REaXNwb3NhYmxlRmlsZUVkaXRvcklucHV0KFVSSS5wYXJzZShtb2RpZmllZC50b1N0cmluZygpKSwgQ1VTVE9NX0VESVRPUl9JTlBVVF9JRCwgZGlzcG9zYWJsZXMpLFxuXHRcdFx0XHRcdFx0dW5kZWZpbmVkKVxuXHRcdFx0XHR9KVxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHQvLyBEaWZmIGVkaXRvciBzaG91bGQgdXNlIGN1c3RvbSBlZGl0b3Igc2luY2Ugc3RyaW5nIHByaW9yaXR5IGV4cGFuZHMgdG8gcHJpb3JpdHkuZGlmZjogZGVmYXVsdFxuXHRcdGNvbnN0IGRpZmZSZXNvbHV0aW9uID0gYXdhaXQgc2VydmljZS5yZXNvbHZlRWRpdG9yKHtcblx0XHRcdG9yaWdpbmFsOiB7IHJlc291cmNlOiBVUkkuZmlsZSgnbXk6Ly9yZXNvdXJjZS50ZXN0LW5vLWRpZmYtcHJpb3JpdHknKSB9LFxuXHRcdFx0bW9kaWZpZWQ6IHsgcmVzb3VyY2U6IFVSSS5maWxlKCdteTovL3Jlc291cmNlLnRlc3Qtbm8tZGlmZi1wcmlvcml0eScpIH1cblx0XHR9LCBwYXJ0LmFjdGl2ZUdyb3VwKTtcblx0XHRhc3NlcnQub2soZGlmZlJlc29sdXRpb24pO1xuXHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbCh0eXBlb2YgZGlmZlJlc29sdXRpb24sICdudW1iZXInKTtcblx0XHRpZiAoZGlmZlJlc29sdXRpb24gIT09IFJlc29sdmVkU3RhdHVzLkFCT1JUICYmIGRpZmZSZXNvbHV0aW9uICE9PSBSZXNvbHZlZFN0YXR1cy5OT05FKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlmZlJlc29sdXRpb24uZWRpdG9yLnR5cGVJZCwgJ3dvcmtiZW5jaC5lZGl0b3JzLmRpZmZFZGl0b3JJbnB1dCcpO1xuXHRcdFx0ZGlmZlJlc29sdXRpb24uZWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0LmZhaWwoJ0V4cGVjdGVkIGRpZmYgZWRpdG9yIHRvIHJlc29sdmUgc3VjY2Vzc2Z1bGx5Jyk7XG5cdFx0fVxuXG5cdFx0cmVnaXN0ZXJlZEVkaXRvci5kaXNw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
