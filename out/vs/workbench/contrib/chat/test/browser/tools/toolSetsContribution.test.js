import assert from "assert";
import { URI } from "../../../../../../base/common/uri.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextKeyService } from "../../../../../../platform/contextkey/browser/contextKeyService.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { ClientToolSetsContribution } from "../../../browser/tools/clientToolSetsContribution.js";
import { LanguageModelToolsService } from "../../../browser/tools/languageModelToolsService.js";
import { createToolSetFileContents, deleteToolSetFromFileContents, getEnabledSelectionReferences } from "../../../browser/tools/toolSetsContribution.js";
import { ToolDataSource, ToolAndToolSetEnablementMap } from "../../../common/tools/languageModelToolsService.js";
suite("ToolSetsContribution", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createToolsService() {
    const instaService = workbenchInstantiationService({
      contextKeyService: () => store.add(new ContextKeyService(new TestConfigurationService()))
    }, store);
    return store.add(instaService.createInstance(LanguageModelToolsService));
  }
  test("ClientToolSetsContribution omits removed tools from vscode-general", () => {
    const toolsService = createToolsService();
    const makeTool = (name) => ({
      id: name,
      modelDescription: name,
      displayName: name,
      toolReferenceName: name,
      source: ToolDataSource.Internal
    });
    const toolSearch = makeTool("toolSearch");
    const removed = ["extensions", "installExtension", "newWorkspace", "runCommand", "vscodeAPI"].map(makeTool);
    for (const tool of [toolSearch, ...removed]) {
      store.add(toolsService.registerToolData(tool));
    }
    const workspaceService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.isSessionsWindow = true;
      }
    }();
    store.add(new ClientToolSetsContribution(toolsService, workspaceService));
    assert.deepStrictEqual(
      Array.from(toolsService.getToolSet("vscode-general")?.getTools() ?? [], (tool) => tool.toolReferenceName),
      ["toolSearch"]
    );
  });
  test("ClientToolSetsContribution exposes Automations only in the Sessions window", () => {
    const makeTool = (name) => ({
      id: name,
      modelDescription: name,
      displayName: name,
      toolReferenceName: name,
      source: ToolDataSource.Internal
    });
    const createContribution = (isSessionsWindow) => {
      const toolsService = createToolsService();
      for (const tool of ["listAutomations", "configureAutomation", "runAutomation", "deleteAutomation"].map(makeTool)) {
        store.add(toolsService.registerToolData(tool));
      }
      const workspaceService = new class extends mock() {
        constructor() {
          super(...arguments);
          this.isSessionsWindow = isSessionsWindow;
        }
      }();
      store.add(new ClientToolSetsContribution(toolsService, workspaceService));
      return toolsService;
    };
    const sessionsToolsService = createContribution(true);
    const coreToolsService = createContribution(false);
    assert.deepStrictEqual({
      sessionsMembers: Array.from(sessionsToolsService.getToolSet("vscode-automations")?.getTools() ?? [], (tool) => tool.toolReferenceName),
      coreHasSet: !!coreToolsService.getToolSet("vscode-automations")
    }, {
      sessionsMembers: ["listAutomations", "configureAutomation", "runAutomation", "deleteAutomation"],
      coreHasSet: false
    });
  });
  test("getEnabledSelectionReferences keeps enabled tool set references and drops covered tools", () => {
    const toolsService = createToolsService();
    const coveredTool = {
      id: "covered",
      modelDescription: "covered",
      displayName: "covered",
      toolReferenceName: "covered",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    const standaloneTool = {
      id: "standalone",
      modelDescription: "standalone",
      displayName: "standalone",
      toolReferenceName: "standalone",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    store.add(toolsService.registerToolData(coveredTool));
    store.add(toolsService.registerToolData(standaloneTool));
    const userToolSet = store.add(toolsService.createToolSet(
      { type: "user", file: URI.file("/tmp/tools.toolsets.jsonc"), label: "tools.toolsets.jsonc" },
      "user/toolset",
      "myToolSet"
    ));
    store.add(userToolSet.addTool(coveredTool));
    const selection = ToolAndToolSetEnablementMap.fromEntries([
      [userToolSet, true],
      [coveredTool, true],
      [standaloneTool, true]
    ]);
    assert.deepStrictEqual(getEnabledSelectionReferences(selection, toolsService), [
      toolsService.getFullReferenceName(userToolSet),
      toolsService.getFullReferenceName(standaloneTool)
    ]);
  });
  test("getEnabledSelectionReferences does not emit a tool set when a member tool is unchecked", () => {
    const toolsService = createToolsService();
    const enabledTool = {
      id: "enabled",
      modelDescription: "enabled",
      displayName: "enabled",
      toolReferenceName: "enabled",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    const disabledTool = {
      id: "disabled",
      modelDescription: "disabled",
      displayName: "disabled",
      toolReferenceName: "disabled",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    store.add(toolsService.registerToolData(enabledTool));
    store.add(toolsService.registerToolData(disabledTool));
    const userToolSet = store.add(toolsService.createToolSet(
      { type: "user", file: URI.file("/tmp/tools.toolsets.jsonc"), label: "tools.toolsets.jsonc" },
      "user/toolset",
      "myToolSet"
    ));
    store.add(userToolSet.addTool(enabledTool));
    store.add(userToolSet.addTool(disabledTool));
    const selection = ToolAndToolSetEnablementMap.fromEntries([
      [userToolSet, true],
      [enabledTool, true],
      [disabledTool, false]
    ]);
    assert.deepStrictEqual(getEnabledSelectionReferences(selection, toolsService), [
      toolsService.getFullReferenceName(enabledTool)
    ]);
  });
  test("getEnabledSelectionReferences uses qualified names for individually selected tools", () => {
    const toolsService = createToolsService();
    const memoryTool = {
      id: "memory",
      modelDescription: "memory",
      displayName: "memory",
      toolReferenceName: "memory",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    store.add(toolsService.registerToolData(memoryTool));
    const vscodeToolSet = store.add(toolsService.createToolSet(
      ToolDataSource.Internal,
      "vscode",
      "vscode"
    ));
    store.add(vscodeToolSet.addTool(memoryTool));
    const selection = ToolAndToolSetEnablementMap.fromEntries([
      [vscodeToolSet, false],
      [memoryTool, true]
    ]);
    assert.deepStrictEqual(getEnabledSelectionReferences(selection, toolsService), [
      toolsService.getFullReferenceName(memoryTool, vscodeToolSet)
    ]);
  });
  test("getEnabledSelectionReferences includes sub-tools that are only referenceable via their tool set", () => {
    const toolsService = createToolsService();
    const subTool = {
      id: "subTool",
      modelDescription: "subTool",
      displayName: "subTool",
      toolReferenceName: "subTool",
      canBeReferencedInPrompt: false,
      source: ToolDataSource.Internal
    };
    store.add(toolsService.registerToolData(subTool));
    const vscodeToolSet = store.add(toolsService.createToolSet(ToolDataSource.Internal, "vscode", "vscode"));
    store.add(vscodeToolSet.addTool(subTool));
    const selection = ToolAndToolSetEnablementMap.fromEntries([
      [vscodeToolSet, false],
      [subTool, true]
    ]);
    assert.deepStrictEqual(getEnabledSelectionReferences(selection, toolsService), [
      toolsService.getFullReferenceName(subTool, vscodeToolSet)
    ]);
  });
  test("getEnabledSelectionReferences supports mixed qualified names and wildcard tool sets", () => {
    const toolsService = createToolsService();
    const memoryTool = {
      id: "memory",
      modelDescription: "memory",
      displayName: "memory",
      toolReferenceName: "memory",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    const runInTerminalTool = {
      id: "runInTerminal",
      modelDescription: "runInTerminal",
      displayName: "runInTerminal",
      toolReferenceName: "runInTerminal",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    const readFileTool = {
      id: "readFile",
      modelDescription: "readFile",
      displayName: "readFile",
      toolReferenceName: "readFile",
      canBeReferencedInPrompt: true,
      source: ToolDataSource.Internal
    };
    const githubIssuesTool = {
      id: "githubIssues",
      modelDescription: "issues",
      displayName: "issues",
      toolReferenceName: "issues",
      canBeReferencedInPrompt: true,
      source: { type: "mcp", label: "GitHub", collectionId: "github", definitionId: "github", instructions: "", serverLabel: "GitHub" }
    };
    store.add(toolsService.registerToolData(memoryTool));
    store.add(toolsService.registerToolData(runInTerminalTool));
    store.add(toolsService.registerToolData(readFileTool));
    store.add(toolsService.registerToolData(githubIssuesTool));
    const vscodeToolSet = store.add(toolsService.createToolSet(ToolDataSource.Internal, "vscode", "vscode"));
    const executeToolSet = store.add(toolsService.createToolSet(ToolDataSource.Internal, "execute", "execute"));
    const readToolSet = store.add(toolsService.createToolSet(ToolDataSource.Internal, "read", "read"));
    const githubToolSet = store.add(toolsService.createToolSet(
      { type: "mcp", label: "GitHub", collectionId: "github", definitionId: "github", instructions: "", serverLabel: "GitHub" },
      "github",
      "github"
    ));
    store.add(vscodeToolSet.addTool(memoryTool));
    store.add(executeToolSet.addTool(runInTerminalTool));
    store.add(readToolSet.addTool(readFileTool));
    store.add(githubToolSet.addTool(githubIssuesTool));
    const selection = ToolAndToolSetEnablementMap.fromEntries([
      [vscodeToolSet, false],
      [executeToolSet, false],
      [readToolSet, false],
      [githubToolSet, true],
      [memoryTool, true],
      [runInTerminalTool, true],
      [readFileTool, true]
    ]);
    assert.deepStrictEqual(getEnabledSelectionReferences(selection, toolsService), [
      toolsService.getFullReferenceName(githubToolSet),
      toolsService.getFullReferenceName(memoryTool, vscodeToolSet),
      toolsService.getFullReferenceName(runInTerminalTool, executeToolSet),
      toolsService.getFullReferenceName(readFileTool, readToolSet)
    ]);
  });
  test("createToolSetFileContents emits prefilled jsonc structure", () => {
    assert.strictEqual(
      createToolSetFileContents("myToolSet", ["read", "search", "github/issues"]),
      [
        "{",
        '	"myToolSet": {',
        '		"tools": [',
        '			"read",',
        '			"search",',
        '			"github/issues"',
        "		],",
        '		"description": "",',
        '		"icon": "tools"',
        "	}",
        "}"
      ].join("\n")
    );
  });
  test("deleteToolSetFromFileContents removes matching tool set", () => {
    const updated = deleteToolSetFromFileContents('{\n	"CurrentTools": {\n		"tools": ["vscode/memory"]\n	},\n	"Other": {\n		"tools": ["read/readFile"]\n	}\n}', "CurrentTools");
    assert.deepStrictEqual(updated, { contents: '{\n	"Other": {\n		"tools": [\n			"read/readFile"\n		]\n	}\n}', isEmpty: false });
  });
  test("deleteToolSetFromFileContents reports an empty file when the last tool set is removed", () => {
    const updated = deleteToolSetFromFileContents('{\n	"CurrentTools": {\n		"tools": ["vscode/memory"]\n	}\n}', "CurrentTools");
    assert.deepStrictEqual(updated, { contents: "{}", isEmpty: true });
  });
  test("deleteToolSetFromFileContents returns undefined when tool set missing", () => {
    assert.strictEqual(deleteToolSetFromFileContents('{"Other": {"tools": ["read/readFile"]}}', "CurrentTools"), void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiL2hvbWUvcmFqLWt1bWFyL0Rvd25sb2Fkcy9hcmtsaWdodC1pZGUtc3RhZ2UwLXNjYWZmb2xkL212cC1zY2FmZm9sZC9mcm9udGVuZC92c2NvZGUvc3JjL3ZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvdGVzdC9icm93c2VyL3Rvb2xzL3Rvb2xTZXRzQ29udHJpYnV0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9icm93c2VyL2NvbnRleHRLZXlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBDbGllbnRUb29sU2V0c0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvdG9vbHMvY2xpZW50VG9vbFNldHNDb250cmlidXRpb24uanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUb29sU2V0RmlsZUNvbnRlbnRzLCBkZWxldGVUb29sU2V0RnJvbUZpbGVDb250ZW50cywgZ2V0RW5hYmxlZFNlbGVjdGlvblJlZmVyZW5jZXMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3Rvb2xzL3Rvb2xTZXRzQ29udHJpYnV0aW9uLmpzJztcbmltcG9ydCB7IElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRvb2xEYXRhLCBUb29sRGF0YVNvdXJjZSwgVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuXG5zdWl0ZSgnVG9vbFNldHNDb250cmlidXRpb24nLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlVG9vbHNTZXJ2aWNlKCk6IExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2Uge1xuXHRcdGNvbnN0IGluc3RhU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiAoKSA9PiBzdG9yZS5hZGQobmV3IENvbnRleHRLZXlTZXJ2aWNlKG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSkpLFxuXHRcdH0sIHN0b3JlKTtcblx0XHRyZXR1cm4gc3RvcmUuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKSk7XG5cdH1cblxuXHR0ZXN0KCdDbGllbnRUb29sU2V0c0NvbnRyaWJ1dGlvbiBvbWl0cyByZW1vdmVkIHRvb2xzIGZyb20gdnNjb2RlLWdlbmVyYWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbHNTZXJ2aWNlID0gY3JlYXRlVG9vbHNTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbWFrZVRvb2wgPSAobmFtZTogc3RyaW5nKTogSVRvb2xEYXRhID0+ICh7XG5cdFx0XHRpZDogbmFtZSxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246IG5hbWUsXG5cdFx0XHRkaXNwbGF5TmFtZTogbmFtZSxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiBuYW1lLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9KTtcblx0XHRjb25zdCB0b29sU2VhcmNoID0gbWFrZVRvb2woJ3Rvb2xTZWFyY2gnKTtcblx0XHRjb25zdCByZW1vdmVkID0gWydleHRlbnNpb25zJywgJ2luc3RhbGxFeHRlbnNpb24nLCAnbmV3V29ya3NwYWNlJywgJ3J1bkNvbW1hbmQnLCAndnNjb2RlQVBJJ10ubWFwKG1ha2VUb29sKTtcblx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgW3Rvb2xTZWFyY2gsIC4uLnJlbW92ZWRdKSB7XG5cdFx0XHRzdG9yZS5hZGQodG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodG9vbCkpO1xuXHRcdH1cblxuXG5cdFx0Y29uc3Qgd29ya3NwYWNlU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNTZXNzaW9uc1dpbmRvdyA9IHRydWU7XG5cdFx0fSgpO1xuXHRcdHN0b3JlLmFkZChuZXcgQ2xpZW50VG9vbFNldHNDb250cmlidXRpb24odG9vbHNTZXJ2aWNlLCB3b3Jrc3BhY2VTZXJ2aWNlKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0QXJyYXkuZnJvbSh0b29sc1NlcnZpY2UuZ2V0VG9vbFNldCgndnNjb2RlLWdlbmVyYWwnKT8uZ2V0VG9vbHMoKSA/PyBbXSwgdG9vbCA9PiB0b29sLnRvb2xSZWZlcmVuY2VOYW1lKSxcblx0XHRcdFsndG9vbFNlYXJjaCddXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnQ2xpZW50VG9vbFNldHNDb250cmlidXRpb24gZXhwb3NlcyBBdXRvbWF0aW9ucyBvbmx5IGluIHRoZSBTZXNzaW9ucyB3aW5kb3cnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFrZVRvb2wgPSAobmFtZTogc3RyaW5nKTogSVRvb2xEYXRhID0+ICh7XG5cdFx0XHRpZDogbmFtZSxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246IG5hbWUsXG5cdFx0XHRkaXNwbGF5TmFtZTogbmFtZSxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiBuYW1lLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9KTtcblx0XHRjb25zdCBjcmVhdGVDb250cmlidXRpb24gPSAoaXNTZXNzaW9uc1dpbmRvdzogYm9vbGVhbikgPT4ge1xuXHRcdFx0Y29uc3QgdG9vbHNTZXJ2aWNlID0gY3JlYXRlVG9vbHNTZXJ2aWNlKCk7XG5cdFx0XHRmb3IgKGNvbnN0IHRvb2wgb2YgWydsaXN0QXV0b21hdGlvbnMnLCAnY29uZmlndXJlQXV0b21hdGlvbicsICdydW5BdXRvbWF0aW9uJywgJ2RlbGV0ZUF1dG9tYXRpb24nXS5tYXAobWFrZVRvb2wpKSB7XG5cdFx0XHRcdHN0b3JlLmFkZCh0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sKSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzU2Vzc2lvbnNXaW5kb3cgPSBpc1Nlc3Npb25zV2luZG93O1xuXHRcdFx0fSgpO1xuXHRcdFx0c3RvcmUuYWRkKG5ldyBDbGllbnRUb29sU2V0c0NvbnRyaWJ1dGlvbih0b29sc1NlcnZpY2UsIHdvcmtzcGFjZVNlcnZpY2UpKTtcblx0XHRcdHJldHVybiB0b29sc1NlcnZpY2U7XG5cdFx0fTtcblxuXHRcdGNvbnN0IHNlc3Npb25zVG9vbHNTZXJ2aWNlID0gY3JlYXRlQ29udHJpYnV0aW9uKHRydWUpO1xuXHRcdGNvbnN0IGNvcmVUb29sc1NlcnZpY2UgPSBjcmVhdGVDb250cmlidXRpb24oZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZXNzaW9uc01lbWJlcnM6IEFycmF5LmZyb20oc2Vzc2lvbnNUb29sc1NlcnZpY2UuZ2V0VG9vbFNldCgndnNjb2RlLWF1dG9tYXRpb25zJyk/LmdldFRvb2xzKCkgPz8gW10sIHRvb2wgPT4gdG9vbC50b29sUmVmZXJlbmNlTmFtZSksXG5cdFx0XHRjb3JlSGFzU2V0OiAhIWNvcmVUb29sc1NlcnZpY2UuZ2V0VG9vbFNldCgndnNjb2RlLWF1dG9tYXRpb25zJyksXG5cdFx0fSwge1xuXHRcdFx0c2Vzc2lvbnNNZW1iZXJzOiBbJ2xpc3RBdXRvbWF0aW9ucycsICdjb25maWd1cmVBdXRvbWF0aW9uJywgJ3J1bkF1dG9tYXRpb24nLCAnZGVsZXRlQXV0b21hdGlvbiddLFxuXHRcdFx0Y29yZUhhc1NldDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEVuYWJsZWRTZWxlY3Rpb25SZWZlcmVuY2VzIGtlZXBzIGVuYWJsZWQgdG9vbCBzZXQgcmVmZXJlbmNlcyBhbmQgZHJvcHMgY292ZXJlZCB0b29scycsICgpID0+IHtcblx0XHRjb25zdCB0b29sc1NlcnZpY2UgPSBjcmVhdGVUb29sc1NlcnZpY2UoKTtcblxuXHRcdGNvbnN0IGNvdmVyZWRUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ2NvdmVyZWQnLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogJ2NvdmVyZWQnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdjb3ZlcmVkJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnY292ZXJlZCcsXG5cdFx0XHRjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fTtcblx0XHRjb25zdCBzdGFuZGFsb25lVG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICdzdGFuZGFsb25lJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdzdGFuZGFsb25lJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnc3RhbmRhbG9uZScsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ3N0YW5kYWxvbmUnLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQodG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoY292ZXJlZFRvb2wpKTtcblx0XHRzdG9yZS5hZGQodG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoc3RhbmRhbG9uZVRvb2wpKTtcblxuXHRcdGNvbnN0IHVzZXJUb29sU2V0ID0gc3RvcmUuYWRkKHRvb2xzU2VydmljZS5jcmVhdGVUb29sU2V0KFxuXHRcdFx0eyB0eXBlOiAndXNlcicsIGZpbGU6IFVSSS5maWxlKCcvdG1wL3Rvb2xzLnRvb2xzZXRzLmpzb25jJyksIGxhYmVsOiAndG9vbHMudG9vbHNldHMuanNvbmMnIH0sXG5cdFx0XHQndXNlci90b29sc2V0Jyxcblx0XHRcdCdteVRvb2xTZXQnXG5cdFx0KSk7XG5cdFx0c3RvcmUuYWRkKHVzZXJUb29sU2V0LmFkZFRvb2woY292ZXJlZFRvb2wpKTtcblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcC5mcm9tRW50cmllcyhbXG5cdFx0XHRbdXNlclRvb2xTZXQsIHRydWVdLFxuXHRcdFx0W2NvdmVyZWRUb29sLCB0cnVlXSxcblx0XHRcdFtzdGFuZGFsb25lVG9vbCwgdHJ1ZV0sXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEVuYWJsZWRTZWxlY3Rpb25SZWZlcmVuY2VzKHNlbGVjdGlvbiwgdG9vbHNTZXJ2aWNlKSwgW1xuXHRcdFx0dG9vbHNTZXJ2aWNlLmdldEZ1bGxSZWZlcmVuY2VOYW1lKHVzZXJUb29sU2V0KSxcblx0XHRcdHRvb2xzU2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZShzdGFuZGFsb25lVG9vbCksXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEVuYWJsZWRTZWxlY3Rpb25SZWZlcmVuY2VzIGRvZXMgbm90IGVtaXQgYSB0b29sIHNldCB3aGVuIGEgbWVtYmVyIHRvb2wgaXMgdW5jaGVja2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xzU2VydmljZSA9IGNyZWF0ZVRvb2xzU2VydmljZSgpO1xuXG5cdFx0Y29uc3QgZW5hYmxlZFRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnZW5hYmxlZCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnZW5hYmxlZCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ2VuYWJsZWQnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdlbmFibGVkJyxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXHRcdGNvbnN0IGRpc2FibGVkVG9vbDogSVRvb2xEYXRhID0ge1xuXHRcdFx0aWQ6ICdkaXNhYmxlZCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnZGlzYWJsZWQnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdkaXNhYmxlZCcsXG5cdFx0XHR0b29sUmVmZXJlbmNlTmFtZTogJ2Rpc2FibGVkJyxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHRvb2xzU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKGVuYWJsZWRUb29sKSk7XG5cdFx0c3RvcmUuYWRkKHRvb2xzU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKGRpc2FibGVkVG9vbCkpO1xuXG5cdFx0Y29uc3QgdXNlclRvb2xTZXQgPSBzdG9yZS5hZGQodG9vbHNTZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHR7IHR5cGU6ICd1c2VyJywgZmlsZTogVVJJLmZpbGUoJy90bXAvdG9vbHMudG9vbHNldHMuanNvbmMnKSwgbGFiZWw6ICd0b29scy50b29sc2V0cy5qc29uYycgfSxcblx0XHRcdCd1c2VyL3Rvb2xzZXQnLFxuXHRcdFx0J215VG9vbFNldCdcblx0XHQpKTtcblx0XHRzdG9yZS5hZGQodXNlclRvb2xTZXQuYWRkVG9vbChlbmFibGVkVG9vbCkpO1xuXHRcdHN0b3JlLmFkZCh1c2VyVG9vbFNldC5hZGRUb29sKGRpc2FibGVkVG9vbCkpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLmZyb21FbnRyaWVzKFtcblx0XHRcdFt1c2VyVG9vbFNldCwgdHJ1ZV0sXG5cdFx0XHRbZW5hYmxlZFRvb2wsIHRydWVdLFxuXHRcdFx0W2Rpc2FibGVkVG9vbCwgZmFsc2VdLFxuXHRcdF0pO1xuXG5cdFx0Ly8gVGhlIHRvb2wgc2V0IGlzIHBhcnRpYWxseSBkZXNlbGVjdGVkLCBzbyBpdCBtdXN0IG5vdCBiZSBzZXJpYWxpemVkLiBPbmx5IHRoZVxuXHRcdC8vIGVuYWJsZWQgbWVtYmVyIHRvb2wgaXMgZW1pdHRlZC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEVuYWJsZWRTZWxlY3Rpb25SZWZlcmVuY2VzKHNlbGVjdGlvbiwgdG9vbHNTZXJ2aWNlKSwgW1xuXHRcdFx0dG9vbHNTZXJ2aWNlLmdldEZ1bGxSZWZlcmVuY2VOYW1lKGVuYWJsZWRUb29sKSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RW5hYmxlZFNlbGVjdGlvblJlZmVyZW5jZXMgdXNlcyBxdWFsaWZpZWQgbmFtZXMgZm9yIGluZGl2aWR1YWxseSBzZWxlY3RlZCB0b29scycsICgpID0+IHtcblx0XHRjb25zdCB0b29sc1NlcnZpY2UgPSBjcmVhdGVUb29sc1NlcnZpY2UoKTtcblxuXHRcdGNvbnN0IG1lbW9yeVRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnbWVtb3J5Jyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdtZW1vcnknLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdtZW1vcnknLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdtZW1vcnknLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQodG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEobWVtb3J5VG9vbCkpO1xuXG5cdFx0Y29uc3QgdnNjb2RlVG9vbFNldCA9IHN0b3JlLmFkZCh0b29sc1NlcnZpY2UuY3JlYXRlVG9vbFNldChcblx0XHRcdFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0J3ZzY29kZScsXG5cdFx0XHQndnNjb2RlJ1xuXHRcdCkpO1xuXHRcdHN0b3JlLmFkZCh2c2NvZGVUb29sU2V0LmFkZFRvb2wobWVtb3J5VG9vbCkpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLmZyb21FbnRyaWVzKFtcblx0XHRcdFt2c2NvZGVUb29sU2V0LCBmYWxzZV0sXG5cdFx0XHRbbWVtb3J5VG9vbCwgdHJ1ZV0sXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEVuYWJsZWRTZWxlY3Rpb25SZWZlcmVuY2VzKHNlbGVjdGlvbiwgdG9vbHNTZXJ2aWNlKSwgW1xuXHRcdFx0dG9vbHNTZXJ2aWNlLmdldEZ1bGxSZWZlcmVuY2VOYW1lKG1lbW9yeVRvb2wsIHZzY29kZVRvb2xTZXQpLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRFbmFibGVkU2VsZWN0aW9uUmVmZXJlbmNlcyBpbmNsdWRlcyBzdWItdG9vbHMgdGhhdCBhcmUgb25seSByZWZlcmVuY2VhYmxlIHZpYSB0aGVpciB0b29sIHNldCcsICgpID0+IHtcblx0XHRjb25zdCB0b29sc1NlcnZpY2UgPSBjcmVhdGVUb29sc1NlcnZpY2UoKTtcblxuXHRcdGNvbnN0IHN1YlRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAnc3ViVG9vbCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnc3ViVG9vbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ3N1YlRvb2wnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdzdWJUb29sJyxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiBmYWxzZSxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZCh0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShzdWJUb29sKSk7XG5cblx0XHRjb25zdCB2c2NvZGVUb29sU2V0ID0gc3RvcmUuYWRkKHRvb2xzU2VydmljZS5jcmVhdGVUb29sU2V0KFRvb2xEYXRhU291cmNlLkludGVybmFsLCAndnNjb2RlJywgJ3ZzY29kZScpKTtcblx0XHRzdG9yZS5hZGQodnNjb2RlVG9vbFNldC5hZGRUb29sKHN1YlRvb2wpKTtcblxuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IFRvb2xBbmRUb29sU2V0RW5hYmxlbWVudE1hcC5mcm9tRW50cmllcyhbXG5cdFx0XHRbdnNjb2RlVG9vbFNldCwgZmFsc2VdLFxuXHRcdFx0W3N1YlRvb2wsIHRydWVdLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRFbmFibGVkU2VsZWN0aW9uUmVmZXJlbmNlcyhzZWxlY3Rpb24sIHRvb2xzU2VydmljZSksIFtcblx0XHRcdHRvb2xzU2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZShzdWJUb29sLCB2c2NvZGVUb29sU2V0KSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0RW5hYmxlZFNlbGVjdGlvblJlZmVyZW5jZXMgc3VwcG9ydHMgbWl4ZWQgcXVhbGlmaWVkIG5hbWVzIGFuZCB3aWxkY2FyZCB0b29sIHNldHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbHNTZXJ2aWNlID0gY3JlYXRlVG9vbHNTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBtZW1vcnlUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ21lbW9yeScsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnbWVtb3J5Jyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnbWVtb3J5Jyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnbWVtb3J5Jyxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgcnVuSW5UZXJtaW5hbFRvb2w6IElUb29sRGF0YSA9IHtcblx0XHRcdGlkOiAncnVuSW5UZXJtaW5hbCcsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAncnVuSW5UZXJtaW5hbCcsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ3J1bkluVGVybWluYWwnLFxuXHRcdFx0dG9vbFJlZmVyZW5jZU5hbWU6ICdydW5JblRlcm1pbmFsJyxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLFxuXHRcdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHR9O1xuXG5cdFx0Y29uc3QgcmVhZEZpbGVUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ3JlYWRGaWxlJyxcblx0XHRcdG1vZGVsRGVzY3JpcHRpb246ICdyZWFkRmlsZScsXG5cdFx0XHRkaXNwbGF5TmFtZTogJ3JlYWRGaWxlJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAncmVhZEZpbGUnLFxuXHRcdFx0Y2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdH07XG5cblx0XHRjb25zdCBnaXRodWJJc3N1ZXNUb29sOiBJVG9vbERhdGEgPSB7XG5cdFx0XHRpZDogJ2dpdGh1Yklzc3VlcycsXG5cdFx0XHRtb2RlbERlc2NyaXB0aW9uOiAnaXNzdWVzJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnaXNzdWVzJyxcblx0XHRcdHRvb2xSZWZlcmVuY2VOYW1lOiAnaXNzdWVzJyxcblx0XHRcdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLFxuXHRcdFx0c291cmNlOiB7IHR5cGU6ICdtY3AnLCBsYWJlbDogJ0dpdEh1YicsIGNvbGxlY3Rpb25JZDogJ2dpdGh1YicsIGRlZmluaXRpb25JZDogJ2dpdGh1YicsIGluc3RydWN0aW9uczogJycsIHNlcnZlckxhYmVsOiAnR2l0SHViJyB9LFxuXHRcdH07XG5cblx0XHRzdG9yZS5hZGQodG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEobWVtb3J5VG9vbCkpO1xuXHRcdHN0b3JlLmFkZCh0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShydW5JblRlcm1pbmFsVG9vbCkpO1xuXHRcdHN0b3JlLmFkZCh0b29sc1NlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShyZWFkRmlsZVRvb2wpKTtcblx0XHRzdG9yZS5hZGQodG9vbHNTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoZ2l0aHViSXNzdWVzVG9vbCkpO1xuXG5cdFx0Y29uc3QgdnNjb2RlVG9vbFNldCA9IHN0b3JlLmFkZCh0b29sc1NlcnZpY2UuY3JlYXRlVG9vbFNldChUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCwgJ3ZzY29kZScsICd2c2NvZGUnKSk7XG5cdFx0Y29uc3QgZXhlY3V0ZVRvb2xTZXQgPSBzdG9yZS5hZGQodG9vbHNTZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsICdleGVjdXRlJywgJ2V4ZWN1dGUnKSk7XG5cdFx0Y29uc3QgcmVhZFRvb2xTZXQgPSBzdG9yZS5hZGQodG9vbHNTZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsICdyZWFkJywgJ3JlYWQnKSk7XG5cdFx0Y29uc3QgZ2l0aHViVG9vbFNldCA9IHN0b3JlLmFkZCh0b29sc1NlcnZpY2UuY3JlYXRlVG9vbFNldChcblx0XHRcdHsgdHlwZTogJ21jcCcsIGxhYmVsOiAnR2l0SHViJywgY29sbGVjdGlvbklkOiAnZ2l0aHViJywgZGVmaW5pdGlvbklkOiAnZ2l0aHViJywgaW5zdHJ1Y3Rpb25zOiAnJywgc2VydmVyTGFiZWw6ICdHaXRIdWInIH0sXG5cdFx0XHQnZ2l0aHViJyxcblx0XHRcdCdnaXRodWInXG5cdFx0KSk7XG5cblx0XHRzdG9yZS5hZGQodnNjb2RlVG9vbFNldC5hZGRUb29sKG1lbW9yeVRvb2wpKTtcblx0XHRzdG9yZS5hZGQoZXhlY3V0ZVRvb2xTZXQuYWRkVG9vbChydW5JblRlcm1pbmFsVG9vbCkpO1xuXHRcdHN0b3JlLmFkZChyZWFkVG9vbFNldC5hZGRUb29sKHJlYWRGaWxlVG9vbCkpO1xuXHRcdHN0b3JlLmFkZChnaXRodWJUb29sU2V0LmFkZFRvb2woZ2l0aHViSXNzdWVzVG9vbCkpO1xuXG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gVG9vbEFuZFRvb2xTZXRFbmFibGVtZW50TWFwLmZyb21FbnRyaWVzKFtcblx0XHRcdFt2c2NvZGVUb29sU2V0LCBmYWxzZV0sXG5cdFx0XHRbZXhlY3V0ZVRvb2xTZXQsIGZhbHNlXSxcblx0XHRcdFtyZWFkVG9vbFNldCwgZmFsc2VdLFxuXHRcdFx0W2dpdGh1YlRvb2xTZXQsIHRydWVdLFxuXHRcdFx0W21lbW9yeVRvb2wsIHRydWVdLFxuXHRcdFx0W3J1bkluVGVybWluYWxUb29sLCB0cnVlXSxcblx0XHRcdFtyZWFkRmlsZVRvb2wsIHRydWVdLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRFbmFibGVkU2VsZWN0aW9uUmVmZXJlbmNlcyhzZWxlY3Rpb24sIHRvb2xzU2VydmljZSksIFtcblx0XHRcdHRvb2xzU2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZShnaXRodWJUb29sU2V0KSxcblx0XHRcdHRvb2xzU2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZShtZW1vcnlUb29sLCB2c2NvZGVUb29sU2V0KSxcblx0XHRcdHRvb2xzU2VydmljZS5nZXRGdWxsUmVmZXJlbmNlTmFtZShydW5JblRlcm1pbmFsVG9vbCwgZXhlY3V0ZVRvb2xTZXQpLFxuXHRcdFx0dG9vbHNTZXJ2aWNlLmdldEZ1bGxSZWZlcmVuY2VOYW1lKHJlYWRGaWxlVG9vbCwgcmVhZFRvb2xTZXQpLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVUb29sU2V0RmlsZUNvbnRlbnRzIGVtaXRzIHByZWZpbGxlZCBqc29uYyBzdHJ1Y3R1cmUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0Y3JlYXRlVG9vbFNldEZpbGVDb250ZW50cygnbXlUb29sU2V0JywgWydyZWFkJywgJ3NlYXJjaCcsICdnaXRodWIvaXNzdWVzJ10pLFxuXHRcdFx0W1xuXHRcdFx0XHQneycsXG5cdFx0XHRcdCdcXHRcIm15VG9vbFNldFwiOiB7Jyxcblx0XHRcdFx0J1xcdFxcdFwidG9vbHNcIjogWycsXG5cdFx0XHRcdCdcXHRcXHRcXHRcInJlYWRcIiwnLFxuXHRcdFx0XHQnXFx0XFx0XFx0XCJzZWFyY2hcIiwnLFxuXHRcdFx0XHQnXFx0XFx0XFx0XCJnaXRodWIvaXNzdWVzXCInLFxuXHRcdFx0XHQnXFx0XFx0XSwnLFxuXHRcdFx0XHQnXFx0XFx0XCJkZXNjcmlwdGlvblwiOiBcIlwiLCcsXG5cdFx0XHRcdCdcXHRcXHRcImljb25cIjogXCJ0b29sc1wiJyxcblx0XHRcdFx0J1xcdH0nLFxuXHRcdFx0XHQnfScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlVG9vbFNldEZyb21GaWxlQ29udGVudHMgcmVtb3ZlcyBtYXRjaGluZyB0b29sIHNldCcsICgpID0+IHtcblx0XHRjb25zdCB1cGRhdGVkID0gZGVsZXRlVG9vbFNldEZyb21GaWxlQ29udGVudHMoJ3tcXG5cXHRcIkN1cnJlbnRUb29sc1wiOiB7XFxuXFx0XFx0XCJ0b29sc1wiOiBbXCJ2c2NvZGUvbWVtb3J5XCJdXFxuXFx0fSxcXG5cXHRcIk90aGVyXCI6IHtcXG5cXHRcXHRcInRvb2xzXCI6IFtcInJlYWQvcmVhZEZpbGVcIl1cXG5cXHR9XFxufScsICdDdXJyZW50VG9vbHMnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZWQsIHsgY29udGVudHM6ICd7XFxuXFx0XCJPdGhlclwiOiB7XFxuXFx0XFx0XCJ0b29sc1wiOiBbXFxuXFx0XFx0XFx0XCJyZWFkL3JlYWRGaWxlXCJcXG5cXHRcXHRdXFxuXFx0fVxcbn0nLCBpc0VtcHR5OiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlVG9vbFNldEZyb21GaWxlQ29udGVudHMgcmVwb3J0cyBhbiBlbXB0eSBmaWxlIHdoZW4gdGhlIGxhc3QgdG9vbCBzZXQgaXMgcmVtb3ZlZCcsICgpID0+IHtcblx0XHRjb25zdCB1cGRhdGVkID0gZGVsZXRlVG9vbFNldEZyb21GaWxlQ29udGVudHMoJ3tcXG5cXHRcIkN1cnJlbnRUb29sc1wiOiB7XFxuXFx0XFx0XCJ0b29sc1wiOiBbXCJ2c2NvZGUvbWVtb3J5XCJdXFxuXFx0fVxcbn0nLCAnQ3VycmVudFRvb2xzJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1cGRhdGVkLCB7IGNvbnRlbnRzOiAne30nLCBpc0VtcHR5OiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVUb29sU2V0RnJvbUZpbGVDb250ZW50cyByZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHRvb2wgc2V0IG1pc3NpbmcnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGV0ZVRvb2xTZXRGcm9tRmlsZUNvbnRlbnRzKCd7XCJPdGhlclwiOiB7XCJ0b29sc1wiOiBbXCJyZWFkL3JlYWRGaWxlXCJdfX0nLCAnQ3VycmVudFRvb2xzJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDJCQUEyQiwrQkFBK0IscUNBQXFDO0FBRXhHLFNBQW9CLGdCQUFnQixtQ0FBbUM7QUFFdkUsTUFBTSx3QkFBd0IsTUFBTTtBQUNuQyxRQUFNLFFBQVEsd0NBQXdDO0FBRXRELFdBQVMscUJBQWdEO0FBQ3hELFVB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
