import { deepStrictEqual } from "assert";
import { Schemas } from "../../../../../../base/common/network.js";
import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { URI } from "../../../../../../base/common/uri.js";
import { IFileService } from "../../../../../../platform/files/common/files.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IQuickInputService } from "../../../../../../platform/quickinput/common/quickInput.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
import { CommandDetectionCapability } from "../../../../../../platform/terminal/common/capabilities/commandDetectionCapability.js";
import { TerminalBuiltinLinkType } from "../../browser/links.js";
import { TerminalLocalFileLinkOpener, TerminalLocalFolderInWorkspaceLinkOpener, TerminalSearchLinkOpener } from "../../browser/terminalLinkOpeners.js";
import { TerminalCapability } from "../../../../../../platform/terminal/common/capabilities/capabilities.js";
import { TerminalCapabilityStore } from "../../../../../../platform/terminal/common/capabilities/terminalCapabilityStore.js";
import { IEditorService } from "../../../../../services/editor/common/editorService.js";
import { IWorkbenchEnvironmentService } from "../../../../../services/environment/common/environmentService.js";
import { TestContextService } from "../../../../../test/common/workbenchTestServices.js";
import { ISearchService } from "../../../../../services/search/common/search.js";
import { SearchService } from "../../../../../services/search/common/searchService.js";
import { ITerminalLogService } from "../../../../../../platform/terminal/common/terminal.js";
import { importAMDNodeModule } from "../../../../../../amdX.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TerminalCommand } from "../../../../../../platform/terminal/common/capabilities/commandDetection/terminalCommand.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { TestXtermLogger } from "../../../../../../platform/terminal/test/common/terminalTestHelpers.js";
class TestCommandDetectionCapability extends CommandDetectionCapability {
  setCommands(commands) {
    this._commands = commands;
  }
}
class TestFileService extends FileService {
  constructor() {
    super(...arguments);
    this._files = "*";
  }
  async stat(resource) {
    if (this._files === "*" || this._files.some((e) => e.toString() === resource.toString())) {
      return { isFile: true, isDirectory: false, isSymbolicLink: false };
    }
    throw new Error("ENOENT");
  }
  setFiles(files) {
    this._files = files;
  }
}
class TestSearchService extends SearchService {
  async fileSearch(query) {
    return this._searchResult;
  }
  setSearchResult(result) {
    this._searchResult = result;
  }
}
class TestTerminalSearchLinkOpener extends TerminalSearchLinkOpener {
  setFileQueryBuilder(value) {
    this._fileQueryBuilder = value;
  }
}
suite("Workbench - TerminalLinkOpeners", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let fileService;
  let searchService;
  let activationResult;
  let xterm;
  setup(async () => {
    instantiationService = store.add(new TestInstantiationService());
    fileService = store.add(new TestFileService(new NullLogService()));
    searchService = store.add(new TestSearchService(null, null, null, null, null, null, null));
    instantiationService.set(IFileService, fileService);
    instantiationService.set(ILogService, new NullLogService());
    instantiationService.set(ISearchService, searchService);
    instantiationService.set(IWorkspaceContextService, new TestContextService());
    instantiationService.stub(ITerminalLogService, new NullLogService());
    instantiationService.stub(IWorkbenchEnvironmentService, {
      remoteAuthority: void 0
    });
    activationResult = void 0;
    instantiationService.stub(IQuickInputService, {
      quickAccess: {
        show(link) {
          activationResult = { link, source: "search" };
        }
      }
    });
    instantiationService.stub(IEditorService, {
      async openEditor(editor) {
        activationResult = {
          source: "editor",
          link: editor.resource?.toString()
        };
        if (editor.options?.selection && (editor.options.selection.startColumn !== 1 || editor.options.selection.startLineNumber !== 1)) {
          activationResult.selection = editor.options.selection;
        }
      }
    });
    const TerminalCtor = (await importAMDNodeModule("@xterm/xterm", "lib/xterm.js")).Terminal;
    xterm = store.add(new TerminalCtor({ allowProposedApi: true, logger: TestXtermLogger }));
  });
  suite("TerminalSearchLinkOpener", () => {
    let opener;
    let capabilities;
    let commandDetection;
    let localFileOpener;
    setup(() => {
      capabilities = store.add(new TerminalCapabilityStore());
      commandDetection = store.add(instantiationService.createInstance(TestCommandDetectionCapability, xterm));
      capabilities.add(TerminalCapability.CommandDetection, commandDetection);
    });
    test("should open single exact match against cwd when searching if it exists when command detection cwd is available", async () => {
      localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
      const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
      opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/initial/cwd", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
      commandDetection.setCommands([new TerminalCommand(xterm, {
        command: "",
        commandLineConfidence: "low",
        exitCode: 0,
        commandStartLineContent: "",
        markProperties: {},
        isTrusted: true,
        cwd: "/initial/cwd",
        timestamp: 0,
        duration: 0,
        executedX: void 0,
        startX: void 0,
        // eslint-disable-next-line local/code-no-any-casts
        marker: {
          line: 0
        },
        id: generateUuid()
      })]);
      fileService.setFiles([
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.txt" }),
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo2/bar.txt" })
      ]);
      await opener.open({
        text: "foo/bar.txt",
        bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
        type: TerminalBuiltinLinkType.Search
      });
      deepStrictEqual(activationResult, {
        link: "file:///initial/cwd/foo/bar.txt",
        source: "editor"
      });
    });
    test("should open single exact match against cwd for paths containing a separator when searching if it exists, even when command detection isn't available", async () => {
      localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
      const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
      opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/initial/cwd", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
      fileService.setFiles([
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.txt" }),
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo2/bar.txt" })
      ]);
      await opener.open({
        text: "foo/bar.txt",
        bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
        type: TerminalBuiltinLinkType.Search
      });
      deepStrictEqual(activationResult, {
        link: "file:///initial/cwd/foo/bar.txt",
        source: "editor"
      });
    });
    test("should open single exact match against any folder for paths not containing a separator when there is a single search result, even when command detection isn't available", async () => {
      localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
      const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
      opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/initial/cwd", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
      capabilities.remove(TerminalCapability.CommandDetection);
      opener.setFileQueryBuilder({ file: () => null });
      fileService.setFiles([
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.txt" }),
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo2/baz.txt" })
      ]);
      searchService.setSearchResult({
        messages: [],
        results: [
          { resource: URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.txt" }) }
        ]
      });
      await opener.open({
        text: "bar.txt",
        bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
        type: TerminalBuiltinLinkType.Search
      });
      deepStrictEqual(activationResult, {
        link: "file:///initial/cwd/foo/bar.txt",
        source: "editor"
      });
    });
    test("should open single exact match against any folder for paths not containing a separator when there are multiple search results, even when command detection isn't available", async () => {
      localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
      const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
      opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/initial/cwd", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
      capabilities.remove(TerminalCapability.CommandDetection);
      opener.setFileQueryBuilder({ file: () => null });
      fileService.setFiles([
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.txt" }),
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.test.txt" }),
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo2/bar.test.txt" })
      ]);
      searchService.setSearchResult({
        messages: [],
        results: [
          { resource: URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.txt" }) },
          { resource: URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.test.txt" }) },
          { resource: URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo2/bar.test.txt" }) }
        ]
      });
      await opener.open({
        text: "bar.txt",
        bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
        type: TerminalBuiltinLinkType.Search
      });
      deepStrictEqual(activationResult, {
        link: "file:///initial/cwd/foo/bar.txt",
        source: "editor"
      });
    });
    test("should not open single exact match for paths not containing a when command detection isn't available", async () => {
      localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
      const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
      opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/initial/cwd", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
      fileService.setFiles([
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo/bar.txt" }),
        URI.from({ scheme: Schemas.file, path: "/initial/cwd/foo2/bar.txt" })
      ]);
      await opener.open({
        text: "bar.txt",
        bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
        type: TerminalBuiltinLinkType.Search
      });
      deepStrictEqual(activationResult, {
        link: "bar.txt",
        source: "search"
      });
    });
    suite("macOS/Linux", () => {
      setup(() => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
      });
      test("should apply the cwd to the link only when the file exists and cwdDetection is enabled", async () => {
        const cwd = "/Users/home/folder";
        const absoluteFile = "/Users/home/folder/file.txt";
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: absoluteFile }),
          URI.from({ scheme: Schemas.file, path: "/Users/home/folder/other/file.txt" })
        ]);
        commandDetection.setCommands([new TerminalCommand(xterm, {
          command: "",
          commandLineConfidence: "low",
          isTrusted: true,
          cwd,
          timestamp: 0,
          duration: 0,
          executedX: void 0,
          startX: void 0,
          // eslint-disable-next-line local/code-no-any-casts
          marker: {
            line: 0
          },
          exitCode: 0,
          commandStartLineContent: "",
          markProperties: {},
          id: generateUuid()
        })]);
        await opener.open({
          text: "file.txt",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///Users/home/folder/file.txt",
          source: "editor"
        });
        commandDetection.setCommands([]);
        opener.setFileQueryBuilder({ file: () => null });
        searchService.setSearchResult({
          messages: [],
          results: [
            { resource: URI.from({ scheme: Schemas.file, path: "file:///Users/home/folder/file.txt" }) },
            { resource: URI.from({ scheme: Schemas.file, path: "file:///Users/home/folder/other/file.txt" }) }
          ]
        });
        await opener.open({
          text: "file.txt",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file.txt",
          source: "search"
        });
      });
      test("should extract column and/or line numbers from links in a workspace containing spaces", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/space folder", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "/space folder/foo/bar.txt" })
        ]);
        await opener.open({
          text: "./foo/bar.txt:10:5",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///space%20folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: "./foo/bar.txt:10",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///space%20folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should extract column and/or line numbers from links and remove trailing periods", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "/folder/foo/bar.txt" })
        ]);
        await opener.open({
          text: "./foo/bar.txt.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/foo/bar.txt",
          source: "editor"
        });
        await opener.open({
          text: "./foo/bar.txt:10:5.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: "./foo/bar.txt:10.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should extract column and/or line numbers from links and remove grepped lines", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "/folder/foo/bar.txt" })
        ]);
        await opener.open({
          text: "./foo/bar.txt:10:5:import { ILoveVSCode } from './foo/bar.ts';",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: "./foo/bar.txt:10:import { ILoveVSCode } from './foo/bar.ts';",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should extract column and/or line numbers from links and remove grepped lines incl singular spaces", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "/folder/foo/bar.txt" })
        ]);
        await opener.open({
          text: "./foo/bar.txt:10:5: ",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: "./foo/bar.txt:10: ",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should extract line numbers from links and remove ruby stack traces", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "/folder/foo/bar.rb" })
        ]);
        await opener.open({
          text: "./foo/bar.rb:30:in `<main>`",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/foo/bar.rb",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 30,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should not misinterpret ISO 8601 timestamps as line:column numbers", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Linux);
        fileService.setFiles([]);
        await opener.open({
          text: "test-2025-04-28T11:03:09+02:00.log",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 34, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "test-2025-04-28T11:03:09+02:00.log",
          source: "search"
        });
        await opener.open({
          text: "./test-2025-04-28T11:03:09+02:00.log",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 36, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "test-2025-04-28T11:03:09+02:00.log",
          source: "search"
        });
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "/folder/test-2025-04-28T14:30:00+02:00.log" })
        ]);
        await opener.open({
          text: "./test-2025-04-28T14:30:00+02:00.log",
          bufferRange: { start: { x: 10, y: 1 }, end: { x: 45, y: 1 } },
          type: TerminalBuiltinLinkType.LocalFile
        });
        deepStrictEqual(activationResult, {
          link: "file:///folder/test-2025-04-28T14%3A30%3A00%2B02%3A00.log",
          source: "editor"
        });
      });
    });
    suite("Windows", () => {
      setup(() => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "", localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
      });
      test("should apply the cwd to the link only when the file exists and cwdDetection is enabled", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "c:\\Users", localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
        const cwd = "c:\\Users\\home\\folder";
        const absoluteFile = "c:\\Users\\home\\folder\\file.txt";
        fileService.setFiles([
          URI.file("/c:/Users/home/folder/file.txt")
        ]);
        commandDetection.setCommands([new TerminalCommand(xterm, {
          exitCode: 0,
          commandStartLineContent: "",
          markProperties: {},
          command: "",
          commandLineConfidence: "low",
          isTrusted: true,
          cwd,
          executedX: void 0,
          startX: void 0,
          timestamp: 0,
          duration: 0,
          // eslint-disable-next-line local/code-no-any-casts
          marker: {
            line: 0
          },
          id: generateUuid()
        })]);
        await opener.open({
          text: "file.txt",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/Users/home/folder/file.txt",
          source: "editor"
        });
        commandDetection.setCommands([]);
        opener.setFileQueryBuilder({ file: () => null });
        searchService.setSearchResult({
          messages: [],
          results: [
            { resource: URI.file(absoluteFile) },
            { resource: URI.file("/c:/Users/home/folder/other/file.txt") }
          ]
        });
        await opener.open({
          text: "file.txt",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file.txt",
          source: "search"
        });
      });
      test("should extract column and/or line numbers from links in a workspace containing spaces", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "c:/space folder", localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "c:/space folder/foo/bar.txt" })
        ]);
        await opener.open({
          text: "./foo/bar.txt:10:5",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/space%20folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: "./foo/bar.txt:10",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/space%20folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.txt:10:5",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/space%20folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.txt:10",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/space%20folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should extract column and/or line numbers from links and remove trailing periods", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "c:/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "c:/folder/foo/bar.txt" })
        ]);
        await opener.open({
          text: "./foo/bar.txt.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor"
        });
        await opener.open({
          text: "./foo/bar.txt:10:5.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: "./foo/bar.txt:10.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.txt.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor"
        });
        await opener.open({
          text: ".\\foo\\bar.txt:2:5.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 2,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.txt:2.",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 2,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should extract column and/or line numbers from links and remove grepped lines", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "c:/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "c:/folder/foo/bar.txt" })
        ]);
        await opener.open({
          text: "./foo/bar.txt:10:5:import { ILoveVSCode } from './foo/bar.ts';",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: "./foo/bar.txt:10:import { ILoveVSCode } from './foo/bar.ts';",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.txt:10:5:import { ILoveVSCode } from './foo/bar.ts';",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.txt:10:import { ILoveVSCode } from './foo/bar.ts';",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should extract column and/or line numbers from links and remove grepped lines incl singular spaces", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "c:/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "c:/folder/foo/bar.txt" })
        ]);
        await opener.open({
          text: "./foo/bar.txt:10:5: ",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: "./foo/bar.txt:10: ",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.txt:10:5: ",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 5,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.txt:10: ",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.txt",
          source: "editor",
          selection: {
            startColumn: 1,
            startLineNumber: 10,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should extract line numbers from links and remove ruby stack traces", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "c:/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "c:/folder/foo/bar.rb" })
        ]);
        await opener.open({
          text: "./foo/bar.rb:30:in `<main>`",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.rb",
          source: "editor",
          selection: {
            startColumn: 1,
            // Since Ruby doesn't appear to put columns in stack traces, this should be 1
            startLineNumber: 30,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
        await opener.open({
          text: ".\\foo\\bar.rb:30:in `<main>`",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 8, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/foo/bar.rb",
          source: "editor",
          selection: {
            startColumn: 1,
            // Since Ruby doesn't appear to put columns in stack traces, this should be 1
            startLineNumber: 30,
            endColumn: void 0,
            endLineNumber: void 0
          }
        });
      });
      test("should not misinterpret ISO 8601 timestamps as line:column numbers", async () => {
        localFileOpener = instantiationService.createInstance(TerminalLocalFileLinkOpener);
        const localFolderOpener = instantiationService.createInstance(TerminalLocalFolderInWorkspaceLinkOpener);
        opener = instantiationService.createInstance(TestTerminalSearchLinkOpener, capabilities, "c:/folder", localFileOpener, localFolderOpener, () => OperatingSystem.Windows);
        fileService.setFiles([]);
        await opener.open({
          text: "test-2025-04-28T11:03:09+02:00.log",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 34, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "test-2025-04-28T11:03:09+02:00.log",
          source: "search"
        });
        await opener.open({
          text: ".\\test-2025-04-28T11:03:09+02:00.log",
          bufferRange: { start: { x: 1, y: 1 }, end: { x: 36, y: 1 } },
          type: TerminalBuiltinLinkType.Search
        });
        deepStrictEqual(activationResult, {
          link: "test-2025-04-28T11:03:09+02:00.log",
          source: "search"
        });
        fileService.setFiles([
          URI.from({ scheme: Schemas.file, path: "c:/folder/test-2025-04-28T14:30:00+02:00.log" })
        ]);
        await opener.open({
          text: ".\\test-2025-04-28T14:30:00+02:00.log",
          bufferRange: { start: { x: 10, y: 1 }, end: { x: 45, y: 1 } },
          type: TerminalBuiltinLinkType.LocalFile
        });
        deepStrictEqual(activationResult, {
          link: "file:///c%3A/folder/test-2025-04-28T14%3A30%3A00%2B02%3A00.log",
          source: "editor"
        });
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL3Rlcm1pbmFsQ29udHJpYi9saW5rcy90ZXN0L2Jyb3dzZXIvdGVybWluYWxMaW5rT3BlbmVycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJVGV4dEVkaXRvclNlbGVjdGlvbiwgSVRleHRSZXNvdXJjZUVkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlLCBJRmlsZVN0YXRXaXRoUGFydGlhbE1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElRdWlja0lucHV0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5LmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9saW5rcy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbExvY2FsRmlsZUxpbmtPcGVuZXIsIFRlcm1pbmFsTG9jYWxGb2xkZXJJbldvcmtzcGFjZUxpbmtPcGVuZXIsIFRlcm1pbmFsU2VhcmNoTGlua09wZW5lciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWxMaW5rT3BlbmVycy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENhcGFiaWxpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZXJtaW5hbC9jb21tb24vY2FwYWJpbGl0aWVzL2NhcGFiaWxpdGllcy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENhcGFiaWxpdHlTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvdGVybWluYWxDYXBhYmlsaXR5U3RvcmUuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB0eXBlIHsgVGVybWluYWwgfSBmcm9tICdAeHRlcm0veHRlcm0nO1xuaW1wb3J0IHsgSUZpbGVRdWVyeSwgSVNlYXJjaENvbXBsZXRlLCBJU2VhcmNoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IFNlYXJjaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi90ZXJtaW5hbC5qcyc7XG5pbXBvcnQgeyBpbXBvcnRBTUROb2RlTW9kdWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYW1kWC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29tbWFuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9jYXBhYmlsaXRpZXMvY29tbWFuZERldGVjdGlvbi90ZXJtaW5hbENvbW1hbmQuanMnO1xuaW1wb3J0IHR5cGUgeyBJTWFya2VyIH0gZnJvbSAnQHh0ZXJtL2hlYWRsZXNzJztcbmltcG9ydCB7IGdlbmVyYXRlVXVpZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3V1aWQuanMnO1xuaW1wb3J0IHsgVGVzdFh0ZXJtTG9nZ2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvdGVzdC9jb21tb24vdGVybWluYWxUZXN0SGVscGVycy5qcyc7XG5cbmludGVyZmFjZSBJVGVybWluYWxMaW5rQWN0aXZhdGlvblJlc3VsdCB7XG5cdHNvdXJjZTogJ2VkaXRvcicgfCAnc2VhcmNoJztcblx0bGluazogc3RyaW5nO1xuXHRzZWxlY3Rpb24/OiBJVGV4dEVkaXRvclNlbGVjdGlvbjtcbn1cblxuY2xhc3MgVGVzdENvbW1hbmREZXRlY3Rpb25DYXBhYmlsaXR5IGV4dGVuZHMgQ29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHkge1xuXHRzZXRDb21tYW5kcyhjb21tYW5kczogVGVybWluYWxDb21tYW5kW10pIHtcblx0XHR0aGlzLl9jb21tYW5kcyA9IGNvbW1hbmRzO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RGaWxlU2VydmljZSBleHRlbmRzIEZpbGVTZXJ2aWNlIHtcblx0cHJpdmF0ZSBfZmlsZXM6IFVSSVtdIHwgJyonID0gJyonO1xuXHRvdmVycmlkZSBhc3luYyBzdGF0KHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElGaWxlU3RhdFdpdGhQYXJ0aWFsTWV0YWRhdGE+IHtcblx0XHRpZiAodGhpcy5fZmlsZXMgPT09ICcqJyB8fCB0aGlzLl9maWxlcy5zb21lKGUgPT4gZS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpKSkge1xuXHRcdFx0cmV0dXJuIHsgaXNGaWxlOiB0cnVlLCBpc0RpcmVjdG9yeTogZmFsc2UsIGlzU3ltYm9saWNMaW5rOiBmYWxzZSB9IGFzIElGaWxlU3RhdFdpdGhQYXJ0aWFsTWV0YWRhdGE7XG5cdFx0fVxuXHRcdHRocm93IG5ldyBFcnJvcignRU5PRU5UJyk7XG5cdH1cblx0c2V0RmlsZXMoZmlsZXM6IFVSSVtdIHwgJyonKTogdm9pZCB7XG5cdFx0dGhpcy5fZmlsZXMgPSBmaWxlcztcblx0fVxufVxuXG5jbGFzcyBUZXN0U2VhcmNoU2VydmljZSBleHRlbmRzIFNlYXJjaFNlcnZpY2Uge1xuXHRwcml2YXRlIF9zZWFyY2hSZXN1bHQ6IElTZWFyY2hDb21wbGV0ZSB8IHVuZGVmaW5lZDtcblx0b3ZlcnJpZGUgYXN5bmMgZmlsZVNlYXJjaChxdWVyeTogSUZpbGVRdWVyeSk6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlYXJjaFJlc3VsdCE7XG5cdH1cblx0c2V0U2VhcmNoUmVzdWx0KHJlc3VsdDogSVNlYXJjaENvbXBsZXRlKSB7XG5cdFx0dGhpcy5fc2VhcmNoUmVzdWx0ID0gcmVzdWx0O1xuXHR9XG59XG5cbmNsYXNzIFRlc3RUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIgZXh0ZW5kcyBUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIge1xuXHRzZXRGaWxlUXVlcnlCdWlsZGVyKHZhbHVlOiBhbnkpIHtcblx0XHR0aGlzLl9maWxlUXVlcnlCdWlsZGVyID0gdmFsdWU7XG5cdH1cbn1cblxuc3VpdGUoJ1dvcmtiZW5jaCAtIFRlcm1pbmFsTGlua09wZW5lcnMnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBmaWxlU2VydmljZTogVGVzdEZpbGVTZXJ2aWNlO1xuXHRsZXQgc2VhcmNoU2VydmljZTogVGVzdFNlYXJjaFNlcnZpY2U7XG5cdGxldCBhY3RpdmF0aW9uUmVzdWx0OiBJVGVybWluYWxMaW5rQWN0aXZhdGlvblJlc3VsdCB8IHVuZGVmaW5lZDtcblx0bGV0IHh0ZXJtOiBUZXJtaW5hbDtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRmaWxlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0c2VhcmNoU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdFNlYXJjaFNlcnZpY2UobnVsbCEsIG51bGwhLCBudWxsISwgbnVsbCEsIG51bGwhLCBudWxsISwgbnVsbCEpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc2V0KElTZWFyY2hTZXJ2aWNlLCBzZWFyY2hTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zZXQoSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlcm1pbmFsTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSwge1xuXHRcdFx0cmVtb3RlQXV0aG9yaXR5OiB1bmRlZmluZWRcblx0XHR9IGFzIFBhcnRpYWw8SVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZT4pO1xuXHRcdC8vIEFsbG93IGludGVyY2VwdGluZyBsaW5rIGFjdGl2YXRpb25zXG5cdFx0YWN0aXZhdGlvblJlc3VsdCA9IHVuZGVmaW5lZDtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElRdWlja0lucHV0U2VydmljZSwge1xuXHRcdFx0cXVpY2tBY2Nlc3M6IHtcblx0XHRcdFx0c2hvdyhsaW5rOiBzdHJpbmcpIHtcblx0XHRcdFx0XHRhY3RpdmF0aW9uUmVzdWx0ID0geyBsaW5rLCBzb3VyY2U6ICdzZWFyY2gnIH07XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGFzIFBhcnRpYWw8SVF1aWNrSW5wdXRTZXJ2aWNlPik7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRWRpdG9yU2VydmljZSwge1xuXHRcdFx0YXN5bmMgb3BlbkVkaXRvcihlZGl0b3I6IElUZXh0UmVzb3VyY2VFZGl0b3JJbnB1dCk6IFByb21pc2U8YW55PiB7XG5cdFx0XHRcdGFjdGl2YXRpb25SZXN1bHQgPSB7XG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRsaW5rOiBlZGl0b3IucmVzb3VyY2U/LnRvU3RyaW5nKClcblx0XHRcdFx0fTtcblx0XHRcdFx0Ly8gT25seSBhc3NlcnQgb24gc2VsZWN0aW9uIGlmIGl0J3Mgbm90IHRoZSBkZWZhdWx0IHZhbHVlXG5cdFx0XHRcdGlmIChlZGl0b3Iub3B0aW9ucz8uc2VsZWN0aW9uICYmIChlZGl0b3Iub3B0aW9ucy5zZWxlY3Rpb24uc3RhcnRDb2x1bW4gIT09IDEgfHwgZWRpdG9yLm9wdGlvbnMuc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciAhPT0gMSkpIHtcblx0XHRcdFx0XHRhY3RpdmF0aW9uUmVzdWx0LnNlbGVjdGlvbiA9IGVkaXRvci5vcHRpb25zLnNlbGVjdGlvbjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gYXMgUGFydGlhbDxJRWRpdG9yU2VydmljZT4pO1xuXHRcdGNvbnN0IFRlcm1pbmFsQ3RvciA9IChhd2FpdCBpbXBvcnRBTUROb2RlTW9kdWxlPHR5cGVvZiBpbXBvcnQoJ0B4dGVybS94dGVybScpPignQHh0ZXJtL3h0ZXJtJywgJ2xpYi94dGVybS5qcycpKS5UZXJtaW5hbDtcblx0XHR4dGVybSA9IHN0b3JlLmFkZChuZXcgVGVybWluYWxDdG9yKHsgYWxsb3dQcm9wb3NlZEFwaTogdHJ1ZSwgbG9nZ2VyOiBUZXN0WHRlcm1Mb2dnZXIgfSkpO1xuXHR9KTtcblxuXHRzdWl0ZSgnVGVybWluYWxTZWFyY2hMaW5rT3BlbmVyJywgKCkgPT4ge1xuXHRcdGxldCBvcGVuZXI6IFRlc3RUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXI7XG5cdFx0bGV0IGNhcGFiaWxpdGllczogVGVybWluYWxDYXBhYmlsaXR5U3RvcmU7XG5cdFx0bGV0IGNvbW1hbmREZXRlY3Rpb246IFRlc3RDb21tYW5kRGV0ZWN0aW9uQ2FwYWJpbGl0eTtcblx0XHRsZXQgbG9jYWxGaWxlT3BlbmVyOiBUZXJtaW5hbExvY2FsRmlsZUxpbmtPcGVuZXI7XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRjYXBhYmlsaXRpZXMgPSBzdG9yZS5hZGQobmV3IFRlcm1pbmFsQ2FwYWJpbGl0eVN0b3JlKCkpO1xuXHRcdFx0Y29tbWFuZERldGVjdGlvbiA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0Q29tbWFuZERldGVjdGlvbkNhcGFiaWxpdHksIHh0ZXJtKSk7XG5cdFx0XHRjYXBhYmlsaXRpZXMuYWRkKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uLCBjb21tYW5kRGV0ZWN0aW9uKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBvcGVuIHNpbmdsZSBleGFjdCBtYXRjaCBhZ2FpbnN0IGN3ZCB3aGVuIHNlYXJjaGluZyBpZiBpdCBleGlzdHMgd2hlbiBjb21tYW5kIGRldGVjdGlvbiBjd2QgaXMgYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bG9jYWxGaWxlT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZpbGVMaW5rT3BlbmVyKTtcblx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcik7XG5cdFx0XHRvcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxTZWFyY2hMaW5rT3BlbmVyLCBjYXBhYmlsaXRpZXMsICcvaW5pdGlhbC9jd2QnLCBsb2NhbEZpbGVPcGVuZXIsIGxvY2FsRm9sZGVyT3BlbmVyLCAoKSA9PiBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0Ly8gU2V0IGEgZmFrZSBkZXRlY3RlZCBjb21tYW5kIHN0YXJ0aW5nIGFzIGxpbmUgMCB0byBlc3RhYmxpc2ggdGhlIGN3ZFxuXHRcdFx0Y29tbWFuZERldGVjdGlvbi5zZXRDb21tYW5kcyhbbmV3IFRlcm1pbmFsQ29tbWFuZCh4dGVybSwge1xuXHRcdFx0XHRjb21tYW5kOiAnJyxcblx0XHRcdFx0Y29tbWFuZExpbmVDb25maWRlbmNlOiAnbG93Jyxcblx0XHRcdFx0ZXhpdENvZGU6IDAsXG5cdFx0XHRcdGNvbW1hbmRTdGFydExpbmVDb250ZW50OiAnJyxcblx0XHRcdFx0bWFya1Byb3BlcnRpZXM6IHt9LFxuXHRcdFx0XHRpc1RydXN0ZWQ6IHRydWUsXG5cdFx0XHRcdGN3ZDogJy9pbml0aWFsL2N3ZCcsXG5cdFx0XHRcdHRpbWVzdGFtcDogMCxcblx0XHRcdFx0ZHVyYXRpb246IDAsXG5cdFx0XHRcdGV4ZWN1dGVkWDogdW5kZWZpbmVkLFxuXHRcdFx0XHRzdGFydFg6IHVuZGVmaW5lZCxcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdG1hcmtlcjoge1xuXHRcdFx0XHRcdGxpbmU6IDBcblx0XHRcdFx0fSBhcyBQYXJ0aWFsPElNYXJrZXI+IGFzIGFueSxcblx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpXG5cdFx0XHR9KV0pO1xuXHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXMoW1xuXHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnL2luaXRpYWwvY3dkL2Zvby9iYXIudHh0JyB9KSxcblx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9pbml0aWFsL2N3ZC9mb28yL2Jhci50eHQnIH0pXG5cdFx0XHRdKTtcblx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0dGV4dDogJ2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0fSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRsaW5rOiAnZmlsZTovLy9pbml0aWFsL2N3ZC9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdHNvdXJjZTogJ2VkaXRvcidcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG9wZW4gc2luZ2xlIGV4YWN0IG1hdGNoIGFnYWluc3QgY3dkIGZvciBwYXRocyBjb250YWluaW5nIGEgc2VwYXJhdG9yIHdoZW4gc2VhcmNoaW5nIGlmIGl0IGV4aXN0cywgZXZlbiB3aGVuIGNvbW1hbmQgZGV0ZWN0aW9uIGlzblxcJ3QgYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bG9jYWxGaWxlT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZpbGVMaW5rT3BlbmVyKTtcblx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcik7XG5cdFx0XHRvcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxTZWFyY2hMaW5rT3BlbmVyLCBjYXBhYmlsaXRpZXMsICcvaW5pdGlhbC9jd2QnLCBsb2NhbEZpbGVPcGVuZXIsIGxvY2FsRm9sZGVyT3BlbmVyLCAoKSA9PiBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXMoW1xuXHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnL2luaXRpYWwvY3dkL2Zvby9iYXIudHh0JyB9KSxcblx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9pbml0aWFsL2N3ZC9mb28yL2Jhci50eHQnIH0pXG5cdFx0XHRdKTtcblx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0dGV4dDogJ2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0fSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRsaW5rOiAnZmlsZTovLy9pbml0aWFsL2N3ZC9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdHNvdXJjZTogJ2VkaXRvcidcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG9wZW4gc2luZ2xlIGV4YWN0IG1hdGNoIGFnYWluc3QgYW55IGZvbGRlciBmb3IgcGF0aHMgbm90IGNvbnRhaW5pbmcgYSBzZXBhcmF0b3Igd2hlbiB0aGVyZSBpcyBhIHNpbmdsZSBzZWFyY2ggcmVzdWx0LCBldmVuIHdoZW4gY29tbWFuZCBkZXRlY3Rpb24gaXNuXFwndCBhdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsb2NhbEZpbGVPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRmlsZUxpbmtPcGVuZXIpO1xuXHRcdFx0Y29uc3QgbG9jYWxGb2xkZXJPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRm9sZGVySW5Xb3Jrc3BhY2VMaW5rT3BlbmVyKTtcblx0XHRcdG9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIsIGNhcGFiaWxpdGllcywgJy9pbml0aWFsL2N3ZCcsIGxvY2FsRmlsZU9wZW5lciwgbG9jYWxGb2xkZXJPcGVuZXIsICgpID0+IE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRjYXBhYmlsaXRpZXMucmVtb3ZlKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKTtcblx0XHRcdG9wZW5lci5zZXRGaWxlUXVlcnlCdWlsZGVyKHsgZmlsZTogKCkgPT4gbnVsbCEgfSk7XG5cdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyhbXG5cdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICcvaW5pdGlhbC9jd2QvZm9vL2Jhci50eHQnIH0pLFxuXHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnL2luaXRpYWwvY3dkL2ZvbzIvYmF6LnR4dCcgfSlcblx0XHRcdF0pO1xuXHRcdFx0c2VhcmNoU2VydmljZS5zZXRTZWFyY2hSZXN1bHQoe1xuXHRcdFx0XHRtZXNzYWdlczogW10sXG5cdFx0XHRcdHJlc3VsdHM6IFtcblx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnL2luaXRpYWwvY3dkL2Zvby9iYXIudHh0JyB9KSB9XG5cdFx0XHRcdF1cblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHR0ZXh0OiAnYmFyLnR4dCcsXG5cdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdH0pO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vaW5pdGlhbC9jd2QvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBvcGVuIHNpbmdsZSBleGFjdCBtYXRjaCBhZ2FpbnN0IGFueSBmb2xkZXIgZm9yIHBhdGhzIG5vdCBjb250YWluaW5nIGEgc2VwYXJhdG9yIHdoZW4gdGhlcmUgYXJlIG11bHRpcGxlIHNlYXJjaCByZXN1bHRzLCBldmVuIHdoZW4gY29tbWFuZCBkZXRlY3Rpb24gaXNuXFwndCBhdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsb2NhbEZpbGVPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRmlsZUxpbmtPcGVuZXIpO1xuXHRcdFx0Y29uc3QgbG9jYWxGb2xkZXJPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRm9sZGVySW5Xb3Jrc3BhY2VMaW5rT3BlbmVyKTtcblx0XHRcdG9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIsIGNhcGFiaWxpdGllcywgJy9pbml0aWFsL2N3ZCcsIGxvY2FsRmlsZU9wZW5lciwgbG9jYWxGb2xkZXJPcGVuZXIsICgpID0+IE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRjYXBhYmlsaXRpZXMucmVtb3ZlKFRlcm1pbmFsQ2FwYWJpbGl0eS5Db21tYW5kRGV0ZWN0aW9uKTtcblx0XHRcdG9wZW5lci5zZXRGaWxlUXVlcnlCdWlsZGVyKHsgZmlsZTogKCkgPT4gbnVsbCEgfSk7XG5cdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyhbXG5cdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICcvaW5pdGlhbC9jd2QvZm9vL2Jhci50eHQnIH0pLFxuXHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnL2luaXRpYWwvY3dkL2Zvby9iYXIudGVzdC50eHQnIH0pLFxuXHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnL2luaXRpYWwvY3dkL2ZvbzIvYmFyLnRlc3QudHh0JyB9KVxuXHRcdFx0XSk7XG5cdFx0XHRzZWFyY2hTZXJ2aWNlLnNldFNlYXJjaFJlc3VsdCh7XG5cdFx0XHRcdG1lc3NhZ2VzOiBbXSxcblx0XHRcdFx0cmVzdWx0czogW1xuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICcvaW5pdGlhbC9jd2QvZm9vL2Jhci50eHQnIH0pIH0sXG5cdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9pbml0aWFsL2N3ZC9mb28vYmFyLnRlc3QudHh0JyB9KSB9LFxuXHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICcvaW5pdGlhbC9jd2QvZm9vMi9iYXIudGVzdC50eHQnIH0pIH1cblx0XHRcdFx0XVxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdHRleHQ6ICdiYXIudHh0Jyxcblx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0fSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRsaW5rOiAnZmlsZTovLy9pbml0aWFsL2N3ZC9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdHNvdXJjZTogJ2VkaXRvcidcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBvcGVuIHNpbmdsZSBleGFjdCBtYXRjaCBmb3IgcGF0aHMgbm90IGNvbnRhaW5pbmcgYSB3aGVuIGNvbW1hbmQgZGV0ZWN0aW9uIGlzblxcJ3QgYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bG9jYWxGaWxlT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZpbGVMaW5rT3BlbmVyKTtcblx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcik7XG5cdFx0XHRvcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxTZWFyY2hMaW5rT3BlbmVyLCBjYXBhYmlsaXRpZXMsICcvaW5pdGlhbC9jd2QnLCBsb2NhbEZpbGVPcGVuZXIsIGxvY2FsRm9sZGVyT3BlbmVyLCAoKSA9PiBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXMoW1xuXHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnL2luaXRpYWwvY3dkL2Zvby9iYXIudHh0JyB9KSxcblx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9pbml0aWFsL2N3ZC9mb28yL2Jhci50eHQnIH0pXG5cdFx0XHRdKTtcblx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0dGV4dDogJ2Jhci50eHQnLFxuXHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHR9KTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdGxpbms6ICdiYXIudHh0Jyxcblx0XHRcdFx0c291cmNlOiAnc2VhcmNoJ1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnbWFjT1MvTGludXgnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdGxvY2FsRmlsZU9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGaWxlTGlua09wZW5lcik7XG5cdFx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcik7XG5cdFx0XHRcdG9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIsIGNhcGFiaWxpdGllcywgJycsIGxvY2FsRmlsZU9wZW5lciwgbG9jYWxGb2xkZXJPcGVuZXIsICgpID0+IE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIGFwcGx5IHRoZSBjd2QgdG8gdGhlIGxpbmsgb25seSB3aGVuIHRoZSBmaWxlIGV4aXN0cyBhbmQgY3dkRGV0ZWN0aW9uIGlzIGVuYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGN3ZCA9ICcvVXNlcnMvaG9tZS9mb2xkZXInO1xuXHRcdFx0XHRjb25zdCBhYnNvbHV0ZUZpbGUgPSAnL1VzZXJzL2hvbWUvZm9sZGVyL2ZpbGUudHh0Jztcblx0XHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXMoW1xuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6IGFic29sdXRlRmlsZSB9KSxcblx0XHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnL1VzZXJzL2hvbWUvZm9sZGVyL290aGVyL2ZpbGUudHh0JyB9KVxuXHRcdFx0XHRdKTtcblxuXHRcdFx0XHQvLyBTZXQgYSBmYWtlIGRldGVjdGVkIGNvbW1hbmQgc3RhcnRpbmcgYXMgbGluZSAwIHRvIGVzdGFibGlzaCB0aGUgY3dkXG5cdFx0XHRcdGNvbW1hbmREZXRlY3Rpb24uc2V0Q29tbWFuZHMoW25ldyBUZXJtaW5hbENvbW1hbmQoeHRlcm0sIHtcblx0XHRcdFx0XHRjb21tYW5kOiAnJyxcblx0XHRcdFx0XHRjb21tYW5kTGluZUNvbmZpZGVuY2U6ICdsb3cnLFxuXHRcdFx0XHRcdGlzVHJ1c3RlZDogdHJ1ZSxcblx0XHRcdFx0XHRjd2QsXG5cdFx0XHRcdFx0dGltZXN0YW1wOiAwLFxuXHRcdFx0XHRcdGR1cmF0aW9uOiAwLFxuXHRcdFx0XHRcdGV4ZWN1dGVkWDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHN0YXJ0WDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdG1hcmtlcjoge1xuXHRcdFx0XHRcdFx0bGluZTogMFxuXHRcdFx0XHRcdH0gYXMgUGFydGlhbDxJTWFya2VyPiBhcyBhbnksXG5cdFx0XHRcdFx0ZXhpdENvZGU6IDAsXG5cdFx0XHRcdFx0Y29tbWFuZFN0YXJ0TGluZUNvbnRlbnQ6ICcnLFxuXHRcdFx0XHRcdG1hcmtQcm9wZXJ0aWVzOiB7fSxcblx0XHRcdFx0XHRpZDogZ2VuZXJhdGVVdWlkKClcblx0XHRcdFx0fSldKTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICdmaWxlLnR4dCcsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL1VzZXJzL2hvbWUvZm9sZGVyL2ZpbGUudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIENsZWFyIGRldGVjdGVkIGNvbW1hbmRzIGFuZCBlbnN1cmUgdGhlIHNhbWUgcmVxdWVzdCByZXN1bHRzIGluIGEgc2VhcmNoIHNpbmNlIHRoZXJlIGFyZSAyIG1hdGNoZXNcblx0XHRcdFx0Y29tbWFuZERldGVjdGlvbi5zZXRDb21tYW5kcyhbXSk7XG5cdFx0XHRcdG9wZW5lci5zZXRGaWxlUXVlcnlCdWlsZGVyKHsgZmlsZTogKCkgPT4gbnVsbCEgfSk7XG5cdFx0XHRcdHNlYXJjaFNlcnZpY2Uuc2V0U2VhcmNoUmVzdWx0KHtcblx0XHRcdFx0XHRtZXNzYWdlczogW10sXG5cdFx0XHRcdFx0cmVzdWx0czogW1xuXHRcdFx0XHRcdFx0eyByZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJ2ZpbGU6Ly8vVXNlcnMvaG9tZS9mb2xkZXIvZmlsZS50eHQnIH0pIH0sXG5cdFx0XHRcdFx0XHR7IHJlc291cmNlOiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnZmlsZTovLy9Vc2Vycy9ob21lL2ZvbGRlci9vdGhlci9maWxlLnR4dCcgfSkgfVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnZmlsZS50eHQnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZS50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ3NlYXJjaCdcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgY29sdW1uIGFuZC9vciBsaW5lIG51bWJlcnMgZnJvbSBsaW5rcyBpbiBhIHdvcmtzcGFjZSBjb250YWluaW5nIHNwYWNlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0bG9jYWxGaWxlT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZpbGVMaW5rT3BlbmVyKTtcblx0XHRcdFx0Y29uc3QgbG9jYWxGb2xkZXJPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRm9sZGVySW5Xb3Jrc3BhY2VMaW5rT3BlbmVyKTtcblx0XHRcdFx0b3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFRlcm1pbmFsU2VhcmNoTGlua09wZW5lciwgY2FwYWJpbGl0aWVzLCAnL3NwYWNlIGZvbGRlcicsIGxvY2FsRmlsZU9wZW5lciwgbG9jYWxGb2xkZXJPcGVuZXIsICgpID0+IE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKFtcblx0XHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnL3NwYWNlIGZvbGRlci9mb28vYmFyLnR4dCcgfSlcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLi9mb28vYmFyLnR4dDoxMDo1Jyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vc3BhY2UlMjBmb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogNSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy4vZm9vL2Jhci50eHQ6MTAnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9zcGFjZSUyMGZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgY29sdW1uIGFuZC9vciBsaW5lIG51bWJlcnMgZnJvbSBsaW5rcyBhbmQgcmVtb3ZlIHRyYWlsaW5nIHBlcmlvZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxvY2FsRmlsZU9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGaWxlTGlua09wZW5lcik7XG5cdFx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcik7XG5cdFx0XHRcdG9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIsIGNhcGFiaWxpdGllcywgJy9mb2xkZXInLCBsb2NhbEZpbGVPcGVuZXIsIGxvY2FsRm9sZGVyT3BlbmVyLCAoKSA9PiBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyhbXG5cdFx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9mb2xkZXIvZm9vL2Jhci50eHQnIH0pXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy4vZm9vL2Jhci50eHQuJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vZm9sZGVyL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuL2Zvby9iYXIudHh0OjEwOjUuJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vZm9sZGVyL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDUsXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuL2Zvby9iYXIudHh0OjEwLicsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2ZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgY29sdW1uIGFuZC9vciBsaW5lIG51bWJlcnMgZnJvbSBsaW5rcyBhbmQgcmVtb3ZlIGdyZXBwZWQgbGluZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxvY2FsRmlsZU9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGaWxlTGlua09wZW5lcik7XG5cdFx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcik7XG5cdFx0XHRcdG9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIsIGNhcGFiaWxpdGllcywgJy9mb2xkZXInLCBsb2NhbEZpbGVPcGVuZXIsIGxvY2FsRm9sZGVyT3BlbmVyLCAoKSA9PiBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyhbXG5cdFx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9mb2xkZXIvZm9vL2Jhci50eHQnIH0pXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy4vZm9vL2Jhci50eHQ6MTA6NTppbXBvcnQgeyBJTG92ZVZTQ29kZSB9IGZyb20gXFwnLi9mb28vYmFyLnRzXFwnOycsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2ZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiA1LFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLi9mb28vYmFyLnR4dDoxMDppbXBvcnQgeyBJTG92ZVZTQ29kZSB9IGZyb20gXFwnLi9mb28vYmFyLnRzXFwnOycsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2ZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVGVzdCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8yMDA5MTkjZGlzY3Vzc2lvbl9yMTQyODEyNDE5NlxuXHRcdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgY29sdW1uIGFuZC9vciBsaW5lIG51bWJlcnMgZnJvbSBsaW5rcyBhbmQgcmVtb3ZlIGdyZXBwZWQgbGluZXMgaW5jbCBzaW5ndWxhciBzcGFjZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxvY2FsRmlsZU9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGaWxlTGlua09wZW5lcik7XG5cdFx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcik7XG5cdFx0XHRcdG9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIsIGNhcGFiaWxpdGllcywgJy9mb2xkZXInLCBsb2NhbEZpbGVPcGVuZXIsIGxvY2FsRm9sZGVyT3BlbmVyLCAoKSA9PiBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyhbXG5cdFx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9mb2xkZXIvZm9vL2Jhci50eHQnIH0pXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy4vZm9vL2Jhci50eHQ6MTA6NTogJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vZm9sZGVyL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDUsXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuL2Zvby9iYXIudHh0OjEwOiAnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9mb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IGxpbmUgbnVtYmVycyBmcm9tIGxpbmtzIGFuZCByZW1vdmUgcnVieSBzdGFjayB0cmFjZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxvY2FsRmlsZU9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGaWxlTGlua09wZW5lcik7XG5cdFx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcik7XG5cdFx0XHRcdG9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIsIGNhcGFiaWxpdGllcywgJy9mb2xkZXInLCBsb2NhbEZpbGVPcGVuZXIsIGxvY2FsRm9sZGVyT3BlbmVyLCAoKSA9PiBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyhbXG5cdFx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJy9mb2xkZXIvZm9vL2Jhci5yYicgfSlcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLi9mb28vYmFyLnJiOjMwOmluIGA8bWFpbj5gJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vZm9sZGVyL2Zvby9iYXIucmInLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMzAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCBub3QgbWlzaW50ZXJwcmV0IElTTyA4NjAxIHRpbWVzdGFtcHMgYXMgbGluZTpjb2x1bW4gbnVtYmVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0bG9jYWxGaWxlT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZpbGVMaW5rT3BlbmVyKTtcblx0XHRcdFx0Y29uc3QgbG9jYWxGb2xkZXJPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRm9sZGVySW5Xb3Jrc3BhY2VMaW5rT3BlbmVyKTtcblx0XHRcdFx0b3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFRlcm1pbmFsU2VhcmNoTGlua09wZW5lciwgY2FwYWJpbGl0aWVzLCAnL2ZvbGRlcicsIGxvY2FsRmlsZU9wZW5lciwgbG9jYWxGb2xkZXJPcGVuZXIsICgpID0+IE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRcdC8vIEludGVudGlvbmFsbHkgbm90IHNldCB0aGUgZmlsZSBzbyBpdCBkb2VzIG5vdCBnZXQgcGlja2VkIHVwIGFzIGxvY2FsRmlsZS5cblx0XHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXMoW10pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJ3Rlc3QtMjAyNS0wNC0yOFQxMTowMzowOSswMjowMC5sb2cnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDM0LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ3Rlc3QtMjAyNS0wNC0yOFQxMTowMzowOSswMjowMC5sb2cnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ3NlYXJjaCdcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLi90ZXN0LTIwMjUtMDQtMjhUMTE6MDM6MDkrMDI6MDAubG9nJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiAzNiwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICd0ZXN0LTIwMjUtMDQtMjhUMTE6MDM6MDkrMDI6MDAubG9nJyxcblx0XHRcdFx0XHRzb3VyY2U6ICdzZWFyY2gnXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIFRlc3Qgd2hlbiBmaWxlIGV4aXN0cywgYW5kIHRoZXJlIGFyZSBwcmVjZWRpbmcgYXJndW1lbnRzXG5cdFx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKFtcblx0XHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnL2ZvbGRlci90ZXN0LTIwMjUtMDQtMjhUMTQ6MzA6MDArMDI6MDAubG9nJyB9KVxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuL3Rlc3QtMjAyNS0wNC0yOFQxNDozMDowMCswMjowMC5sb2cnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEwLCB5OiAxIH0sIGVuZDogeyB4OiA0NSwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuTG9jYWxGaWxlXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2ZvbGRlci90ZXN0LTIwMjUtMDQtMjhUMTQlM0EzMCUzQTAwJTJCMDIlM0EwMC5sb2cnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcidcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnV2luZG93cycsICgpID0+IHtcblx0XHRcdHNldHVwKCgpID0+IHtcblx0XHRcdFx0bG9jYWxGaWxlT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZpbGVMaW5rT3BlbmVyKTtcblx0XHRcdFx0Y29uc3QgbG9jYWxGb2xkZXJPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRm9sZGVySW5Xb3Jrc3BhY2VMaW5rT3BlbmVyKTtcblx0XHRcdFx0b3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFRlcm1pbmFsU2VhcmNoTGlua09wZW5lciwgY2FwYWJpbGl0aWVzLCAnJywgbG9jYWxGaWxlT3BlbmVyLCBsb2NhbEZvbGRlck9wZW5lciwgKCkgPT4gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCBhcHBseSB0aGUgY3dkIHRvIHRoZSBsaW5rIG9ubHkgd2hlbiB0aGUgZmlsZSBleGlzdHMgYW5kIGN3ZERldGVjdGlvbiBpcyBlbmFibGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsb2NhbEZpbGVPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRmlsZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRjb25zdCBsb2NhbEZvbGRlck9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGb2xkZXJJbldvcmtzcGFjZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRvcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxTZWFyY2hMaW5rT3BlbmVyLCBjYXBhYmlsaXRpZXMsICdjOlxcXFxVc2VycycsIGxvY2FsRmlsZU9wZW5lciwgbG9jYWxGb2xkZXJPcGVuZXIsICgpID0+IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKTtcblxuXHRcdFx0XHRjb25zdCBjd2QgPSAnYzpcXFxcVXNlcnNcXFxcaG9tZVxcXFxmb2xkZXInO1xuXHRcdFx0XHRjb25zdCBhYnNvbHV0ZUZpbGUgPSAnYzpcXFxcVXNlcnNcXFxcaG9tZVxcXFxmb2xkZXJcXFxcZmlsZS50eHQnO1xuXG5cdFx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKFtcblx0XHRcdFx0XHRVUkkuZmlsZSgnL2M6L1VzZXJzL2hvbWUvZm9sZGVyL2ZpbGUudHh0Jylcblx0XHRcdFx0XSk7XG5cblx0XHRcdFx0Ly8gU2V0IGEgZmFrZSBkZXRlY3RlZCBjb21tYW5kIHN0YXJ0aW5nIGFzIGxpbmUgMCB0byBlc3RhYmxpc2ggdGhlIGN3ZFxuXHRcdFx0XHRjb21tYW5kRGV0ZWN0aW9uLnNldENvbW1hbmRzKFtuZXcgVGVybWluYWxDb21tYW5kKHh0ZXJtLCB7XG5cdFx0XHRcdFx0ZXhpdENvZGU6IDAsXG5cdFx0XHRcdFx0Y29tbWFuZFN0YXJ0TGluZUNvbnRlbnQ6ICcnLFxuXHRcdFx0XHRcdG1hcmtQcm9wZXJ0aWVzOiB7fSxcblx0XHRcdFx0XHRjb21tYW5kOiAnJyxcblx0XHRcdFx0XHRjb21tYW5kTGluZUNvbmZpZGVuY2U6ICdsb3cnLFxuXHRcdFx0XHRcdGlzVHJ1c3RlZDogdHJ1ZSxcblx0XHRcdFx0XHRjd2QsXG5cdFx0XHRcdFx0ZXhlY3V0ZWRYOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c3RhcnRYOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dGltZXN0YW1wOiAwLFxuXHRcdFx0XHRcdGR1cmF0aW9uOiAwLFxuXHRcdFx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0XHRcdG1hcmtlcjoge1xuXHRcdFx0XHRcdFx0bGluZTogMFxuXHRcdFx0XHRcdH0gYXMgUGFydGlhbDxJTWFya2VyPiBhcyBhbnksXG5cdFx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpXG5cdFx0XHRcdH0pXSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnZmlsZS50eHQnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9jJTNBL1VzZXJzL2hvbWUvZm9sZGVyL2ZpbGUudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdC8vIENsZWFyIGRldGVjdGVkIGNvbW1hbmRzIGFuZCBlbnN1cmUgdGhlIHNhbWUgcmVxdWVzdCByZXN1bHRzIGluIGEgc2VhcmNoXG5cdFx0XHRcdGNvbW1hbmREZXRlY3Rpb24uc2V0Q29tbWFuZHMoW10pO1xuXHRcdFx0XHRvcGVuZXIuc2V0RmlsZVF1ZXJ5QnVpbGRlcih7IGZpbGU6ICgpID0+IG51bGwhIH0pO1xuXHRcdFx0XHRzZWFyY2hTZXJ2aWNlLnNldFNlYXJjaFJlc3VsdCh7XG5cdFx0XHRcdFx0bWVzc2FnZXM6IFtdLFxuXHRcdFx0XHRcdHJlc3VsdHM6IFtcblx0XHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5maWxlKGFic29sdXRlRmlsZSkgfSxcblx0XHRcdFx0XHRcdHsgcmVzb3VyY2U6IFVSSS5maWxlKCcvYzovVXNlcnMvaG9tZS9mb2xkZXIvb3RoZXIvZmlsZS50eHQnKSB9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICdmaWxlLnR4dCcsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnc2VhcmNoJ1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBjb2x1bW4gYW5kL29yIGxpbmUgbnVtYmVycyBmcm9tIGxpbmtzIGluIGEgd29ya3NwYWNlIGNvbnRhaW5pbmcgc3BhY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsb2NhbEZpbGVPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRmlsZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRjb25zdCBsb2NhbEZvbGRlck9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGb2xkZXJJbldvcmtzcGFjZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRvcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxTZWFyY2hMaW5rT3BlbmVyLCBjYXBhYmlsaXRpZXMsICdjOi9zcGFjZSBmb2xkZXInLCBsb2NhbEZpbGVPcGVuZXIsIGxvY2FsRm9sZGVyT3BlbmVyLCAoKSA9PiBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKFtcblx0XHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnYzovc3BhY2UgZm9sZGVyL2Zvby9iYXIudHh0JyB9KVxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuL2Zvby9iYXIudHh0OjEwOjUnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9jJTNBL3NwYWNlJTIwZm9sZGVyL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDUsXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuL2Zvby9iYXIudHh0OjEwJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vYyUzQS9zcGFjZSUyMGZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLlxcXFxmb29cXFxcYmFyLnR4dDoxMDo1Jyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vYyUzQS9zcGFjZSUyMGZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiA1LFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLlxcXFxmb29cXFxcYmFyLnR4dDoxMCcsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2MlM0Evc3BhY2UlMjBmb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IGNvbHVtbiBhbmQvb3IgbGluZSBudW1iZXJzIGZyb20gbGlua3MgYW5kIHJlbW92ZSB0cmFpbGluZyBwZXJpb2RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRsb2NhbEZpbGVPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRmlsZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRjb25zdCBsb2NhbEZvbGRlck9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGb2xkZXJJbldvcmtzcGFjZUxpbmtPcGVuZXIpO1xuXHRcdFx0XHRvcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXN0VGVybWluYWxTZWFyY2hMaW5rT3BlbmVyLCBjYXBhYmlsaXRpZXMsICdjOi9mb2xkZXInLCBsb2NhbEZpbGVPcGVuZXIsIGxvY2FsRm9sZGVyT3BlbmVyLCAoKSA9PiBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRcdGZpbGVTZXJ2aWNlLnNldEZpbGVzKFtcblx0XHRcdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5maWxlLCBwYXRoOiAnYzovZm9sZGVyL2Zvby9iYXIudHh0JyB9KVxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuL2Zvby9iYXIudHh0LicsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2MlM0EvZm9sZGVyL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuL2Zvby9iYXIudHh0OjEwOjUuJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vYyUzQS9mb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogNSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy4vZm9vL2Jhci50eHQ6MTAuJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vYyUzQS9mb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogMSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy5cXFxcZm9vXFxcXGJhci50eHQuJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vYyUzQS9mb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy5cXFxcZm9vXFxcXGJhci50eHQ6Mjo1LicsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2MlM0EvZm9sZGVyL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDUsXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDIsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy5cXFxcZm9vXFxcXGJhci50eHQ6Mi4nLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9jJTNBL2ZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAyLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBjb2x1bW4gYW5kL29yIGxpbmUgbnVtYmVycyBmcm9tIGxpbmtzIGFuZCByZW1vdmUgZ3JlcHBlZCBsaW5lcycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0bG9jYWxGaWxlT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZpbGVMaW5rT3BlbmVyKTtcblx0XHRcdFx0Y29uc3QgbG9jYWxGb2xkZXJPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRm9sZGVySW5Xb3Jrc3BhY2VMaW5rT3BlbmVyKTtcblx0XHRcdFx0b3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFRlcm1pbmFsU2VhcmNoTGlua09wZW5lciwgY2FwYWJpbGl0aWVzLCAnYzovZm9sZGVyJywgbG9jYWxGaWxlT3BlbmVyLCBsb2NhbEZvbGRlck9wZW5lciwgKCkgPT4gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpO1xuXHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyhbXG5cdFx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJ2M6L2ZvbGRlci9mb28vYmFyLnR4dCcgfSlcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLi9mb28vYmFyLnR4dDoxMDo1OmltcG9ydCB7IElMb3ZlVlNDb2RlIH0gZnJvbSBcXCcuL2Zvby9iYXIudHNcXCc7Jyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vYyUzQS9mb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogNSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy4vZm9vL2Jhci50eHQ6MTA6aW1wb3J0IHsgSUxvdmVWU0NvZGUgfSBmcm9tIFxcJy4vZm9vL2Jhci50c1xcJzsnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9jJTNBL2ZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLlxcXFxmb29cXFxcYmFyLnR4dDoxMDo1OmltcG9ydCB7IElMb3ZlVlNDb2RlIH0gZnJvbSBcXCcuL2Zvby9iYXIudHNcXCc7Jyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vYyUzQS9mb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogNSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy5cXFxcZm9vXFxcXGJhci50eHQ6MTA6aW1wb3J0IHsgSUxvdmVWU0NvZGUgfSBmcm9tIFxcJy4vZm9vL2Jhci50c1xcJzsnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9jJTNBL2ZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gVGVzdCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8yMDA5MTkjZGlzY3Vzc2lvbl9yMTQyODEyNDE5NlxuXHRcdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgY29sdW1uIGFuZC9vciBsaW5lIG51bWJlcnMgZnJvbSBsaW5rcyBhbmQgcmVtb3ZlIGdyZXBwZWQgbGluZXMgaW5jbCBzaW5ndWxhciBzcGFjZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxvY2FsRmlsZU9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGaWxlTGlua09wZW5lcik7XG5cdFx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcik7XG5cdFx0XHRcdG9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIsIGNhcGFiaWxpdGllcywgJ2M6L2ZvbGRlcicsIGxvY2FsRmlsZU9wZW5lciwgbG9jYWxGb2xkZXJPcGVuZXIsICgpID0+IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKTtcblx0XHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXMoW1xuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICdjOi9mb2xkZXIvZm9vL2Jhci50eHQnIH0pXG5cdFx0XHRcdF0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy4vZm9vL2Jhci50eHQ6MTA6NTogJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxLCB5OiAxIH0sIGVuZDogeyB4OiA4LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ2ZpbGU6Ly8vYyUzQS9mb2xkZXIvZm9vL2Jhci50eHQnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcicsXG5cdFx0XHRcdFx0c2VsZWN0aW9uOiB7XG5cdFx0XHRcdFx0XHRzdGFydENvbHVtbjogNSxcblx0XHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0XHRlbmRDb2x1bW46IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IHVuZGVmaW5lZFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhd2FpdCBvcGVuZXIub3Blbih7XG5cdFx0XHRcdFx0dGV4dDogJy4vZm9vL2Jhci50eHQ6MTA6ICcsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2MlM0EvZm9sZGVyL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDEsXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuXFxcXGZvb1xcXFxiYXIudHh0OjEwOjU6ICcsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogOCwgeTogMSB9IH0sXG5cdFx0XHRcdFx0dHlwZTogVGVybWluYWxCdWlsdGluTGlua1R5cGUuU2VhcmNoXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aXZhdGlvblJlc3VsdCwge1xuXHRcdFx0XHRcdGxpbms6ICdmaWxlOi8vL2MlM0EvZm9sZGVyL2Zvby9iYXIudHh0Jyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDUsXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuXFxcXGZvb1xcXFxiYXIudHh0OjEwOiAnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9jJTNBL2ZvbGRlci9mb28vYmFyLnR4dCcsXG5cdFx0XHRcdFx0c291cmNlOiAnZWRpdG9yJyxcblx0XHRcdFx0XHRzZWxlY3Rpb246IHtcblx0XHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxLFxuXHRcdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRcdGVuZENvbHVtbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgbGluZSBudW1iZXJzIGZyb20gbGlua3MgYW5kIHJlbW92ZSBydWJ5IHN0YWNrIHRyYWNlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0bG9jYWxGaWxlT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZpbGVMaW5rT3BlbmVyKTtcblx0XHRcdFx0Y29uc3QgbG9jYWxGb2xkZXJPcGVuZXIgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXJtaW5hbExvY2FsRm9sZGVySW5Xb3Jrc3BhY2VMaW5rT3BlbmVyKTtcblx0XHRcdFx0b3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdFRlcm1pbmFsU2VhcmNoTGlua09wZW5lciwgY2FwYWJpbGl0aWVzLCAnYzovZm9sZGVyJywgbG9jYWxGaWxlT3BlbmVyLCBsb2NhbEZvbGRlck9wZW5lciwgKCkgPT4gT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpO1xuXHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyhbXG5cdFx0XHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuZmlsZSwgcGF0aDogJ2M6L2ZvbGRlci9mb28vYmFyLnJiJyB9KVxuXHRcdFx0XHRdKTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuL2Zvby9iYXIucmI6MzA6aW4gYDxtYWluPmAnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9jJTNBL2ZvbGRlci9mb28vYmFyLnJiJyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDEsIC8vIFNpbmNlIFJ1YnkgZG9lc24ndCBhcHBlYXIgdG8gcHV0IGNvbHVtbnMgaW4gc3RhY2sgdHJhY2VzLCB0aGlzIHNob3VsZCBiZSAxXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDMwLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuXFxcXGZvb1xcXFxiYXIucmI6MzA6aW4gYDxtYWluPmAnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDgsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9jJTNBL2ZvbGRlci9mb28vYmFyLnJiJyxcblx0XHRcdFx0XHRzb3VyY2U6ICdlZGl0b3InLFxuXHRcdFx0XHRcdHNlbGVjdGlvbjoge1xuXHRcdFx0XHRcdFx0c3RhcnRDb2x1bW46IDEsIC8vIFNpbmNlIFJ1YnkgZG9lc24ndCBhcHBlYXIgdG8gcHV0IGNvbHVtbnMgaW4gc3RhY2sgdHJhY2VzLCB0aGlzIHNob3VsZCBiZSAxXG5cdFx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDMwLFxuXHRcdFx0XHRcdFx0ZW5kQ29sdW1uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiB1bmRlZmluZWRcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgbm90IG1pc2ludGVycHJldCBJU08gODYwMSB0aW1lc3RhbXBzIGFzIGxpbmU6Y29sdW1uIG51bWJlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGxvY2FsRmlsZU9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlcm1pbmFsTG9jYWxGaWxlTGlua09wZW5lcik7XG5cdFx0XHRcdGNvbnN0IGxvY2FsRm9sZGVyT3BlbmVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVybWluYWxMb2NhbEZvbGRlckluV29ya3NwYWNlTGlua09wZW5lcik7XG5cdFx0XHRcdG9wZW5lciA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RUZXJtaW5hbFNlYXJjaExpbmtPcGVuZXIsIGNhcGFiaWxpdGllcywgJ2M6L2ZvbGRlcicsIGxvY2FsRmlsZU9wZW5lciwgbG9jYWxGb2xkZXJPcGVuZXIsICgpID0+IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKTtcblx0XHRcdFx0Ly8gSW50ZW50aW9uYWxseSBub3Qgc2V0IHRoZSBmaWxlIHNvIGl0IGRvZXMgbm90IGdldCBwaWNrZWQgdXAgYXMgbG9jYWxGaWxlLlxuXHRcdFx0XHRmaWxlU2VydmljZS5zZXRGaWxlcyhbXSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAndGVzdC0yMDI1LTA0LTI4VDExOjAzOjA5KzAyOjAwLmxvZycsXG5cdFx0XHRcdFx0YnVmZmVyUmFuZ2U6IHsgc3RhcnQ6IHsgeDogMSwgeTogMSB9LCBlbmQ6IHsgeDogMzQsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLlNlYXJjaFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAndGVzdC0yMDI1LTA0LTI4VDExOjAzOjA5KzAyOjAwLmxvZycsXG5cdFx0XHRcdFx0c291cmNlOiAnc2VhcmNoJ1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXdhaXQgb3BlbmVyLm9wZW4oe1xuXHRcdFx0XHRcdHRleHQ6ICcuXFxcXHRlc3QtMjAyNS0wNC0yOFQxMTowMzowOSswMjowMC5sb2cnLFxuXHRcdFx0XHRcdGJ1ZmZlclJhbmdlOiB7IHN0YXJ0OiB7IHg6IDEsIHk6IDEgfSwgZW5kOiB7IHg6IDM2LCB5OiAxIH0gfSxcblx0XHRcdFx0XHR0eXBlOiBUZXJtaW5hbEJ1aWx0aW5MaW5rVHlwZS5TZWFyY2hcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChhY3RpdmF0aW9uUmVzdWx0LCB7XG5cdFx0XHRcdFx0bGluazogJ3Rlc3QtMjAyNS0wNC0yOFQxMTowMzowOSswMjowMC5sb2cnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ3NlYXJjaCdcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0Ly8gVGVzdCB3aGVuIGZpbGUgZXhpc3RzLCBhbmQgdGhlcmUgYXJlIHByZWNlZGluZyBhcmd1bWVudHNcblx0XHRcdFx0ZmlsZVNlcnZpY2Uuc2V0RmlsZXMoW1xuXHRcdFx0XHRcdFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmZpbGUsIHBhdGg6ICdjOi9mb2xkZXIvdGVzdC0yMDI1LTA0LTI4VDE0OjMwOjAwKzAyOjAwLmxvZycgfSlcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGF3YWl0IG9wZW5lci5vcGVuKHtcblx0XHRcdFx0XHR0ZXh0OiAnLlxcXFx0ZXN0LTIwMjUtMDQtMjhUMTQ6MzA6MDArMDI6MDAubG9nJyxcblx0XHRcdFx0XHRidWZmZXJSYW5nZTogeyBzdGFydDogeyB4OiAxMCwgeTogMSB9LCBlbmQ6IHsgeDogNDUsIHk6IDEgfSB9LFxuXHRcdFx0XHRcdHR5cGU6IFRlcm1pbmFsQnVpbHRpbkxpbmtUeXBlLkxvY2FsRmlsZVxuXHRcdFx0XHR9KTtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGFjdGl2YXRpb25SZXN1bHQsIHtcblx0XHRcdFx0XHRsaW5rOiAnZmlsZTovLy9jJTNBL2ZvbGRlci90ZXN0LTIwMjUtMDQtMjhUMTQlM0EzMCUzQTAwJTJCMDIlM0EwMC5sb2cnLFxuXHRcdFx0XHRcdHNvdXJjZTogJ2VkaXRvcidcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFFcEIsU0FBUyxvQkFBa0Q7QUFDM0QsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxhQUFhLHNCQUFzQjtBQUM1QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFT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
